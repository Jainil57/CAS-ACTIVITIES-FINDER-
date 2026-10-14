// projectRoutes.js — search, view, create and join projects, decide requests, CAS record.
const express = require('express');
const { requireRole } = require('../auth');
const { validateProject } = require('../validation');
const { searchProjects } = require('../search');
const { checkJoinRequest, findClash } = require('../joinRules');
const { buildCasRecord } = require('../casRecord');

const GET_PROJECT = `
  SELECT p.*, s.name AS school_name, s.city AS school_area, u.name AS creator_name
  FROM projects p JOIN schools s ON s.id = p.school_id JOIN users u ON u.id = p.creator_id
  WHERE p.id = ? AND s.is_active = 1`;

// Projects the student is accepted into or created that are still running (for clash checks).
const SCHEDULE = `
  SELECT p.id, p.title, p.start_date, p.end_date FROM memberships m JOIN projects p ON p.id = m.project_id
  WHERE m.user_id = ? AND m.status = 'accepted' AND p.status IN ('approved', 'ongoing')
  UNION
  SELECT id, title, start_date, end_date FROM projects
  WHERE creator_id = ? AND status IN ('approved', 'ongoing')`;

// Number of accepted members in each role for one project.
async function acceptedCounts(db, projectId) {
  const counts = { participant: 0, volunteer: 0, organizer: 0 };
  const rows = await db.all(`SELECT role, COUNT(*) AS n FROM memberships
                             WHERE project_id = ? AND status = 'accepted' GROUP BY role`, projectId);
  for (const row of rows) counts[row.role] = row.n;
  return counts;
}

// Turns a database row into the shape the browser needs, including places left per role.
function summary(project, counts) {
  return {
    id: project.id, title: project.title, description: project.description, strand: project.strand,
    schoolId: project.school_id, schoolName: project.school_name, schoolArea: project.school_area,
    interschool: Boolean(project.interschool), location: project.location,
    startDate: project.start_date, endDate: project.end_date, applyDeadline: project.apply_deadline,
    hours: project.hours, fee: project.fee, status: project.status, teacherComment: project.teacher_comment,
    creatorId: project.creator_id, creatorName: project.creator_name,
    places: {
      participant: { taken: counts.participant, total: project.cap_participant },
      volunteer: { taken: counts.volunteer, total: project.cap_volunteer },
      organizer: { taken: counts.organizer, total: project.cap_organizer },
    },
  };
}

module.exports = function projectRoutes(db, today) {
  const router = express.Router();

  // GET /api/projects?q=&strand=&scope=&openOnly=1 — search (Algorithm 1).
  router.get('/projects', requireRole('student', 'teacher', 'principal'), async (req, res) => {
    // SQL picks the projects this user may see; JavaScript then matches and ranks them.
    const visible = await db.all(`
      SELECT p.*, s.name AS school_name, s.city AS school_area FROM projects p JOIN schools s ON s.id = p.school_id
      WHERE s.is_active = 1 AND p.status IN ('approved', 'ongoing') AND (p.school_id = ? OR p.interschool = 1)`,
    req.user.school_id);

    const results = searchProjects(visible, {
      query: String(req.query.q || ''),
      strand: String(req.query.strand || ''),
      scope: String(req.query.scope || 'all'),
      openOnly: req.query.openOnly === '1',
      schoolId: req.user.school_id,
      today: today(),
    });

    // One query counts accepted members for every project (instead of one query per project).
    const counts = new Map();
    const rows = await db.all(`SELECT project_id, role, COUNT(*) AS n FROM memberships
                               WHERE status = 'accepted' GROUP BY project_id, role`);
    for (const row of rows) {
      if (!counts.has(row.project_id)) counts.set(row.project_id, { participant: 0, volunteer: 0, organizer: 0 });
      counts.get(row.project_id)[row.role] = row.n;
    }
    const empty = { participant: 0, volunteer: 0, organizer: 0 };
    res.json(results.map((p) => summary(p, counts.get(p.id) || empty)));
  });

  // GET /api/projects/:id — project details.
  router.get('/projects/:id', requireRole('student', 'teacher', 'principal'), async (req, res) => {
    const project = await db.get(GET_PROJECT, Number(req.params.id));
    if (!project) return res.status(404).json({ error: 'Project not found.' });

    const isCreator = project.creator_id === req.user.id;
    const isStaff = req.user.role !== 'student' && project.school_id === req.user.school_id;
    const isPublic = ['approved', 'ongoing', 'completed'].includes(project.status)
      && (project.school_id === req.user.school_id || project.interschool === 1);
    // Pending projects are private to the creator and school staff.
    if (!isCreator && !isStaff && !isPublic) return res.status(404).json({ error: 'Project not found.' });

    const result = summary(project, await acceptedCounts(db, project.id));
    result.isCreator = isCreator;
    result.myRequest = (await db.get('SELECT role, status FROM memberships WHERE project_id = ? AND user_id = ?',
      project.id, req.user.id)) || null;
    if (isCreator || isStaff) {
      result.requests = await db.all(`
        SELECT m.id, m.role, m.status, m.requested_at AS requestedAt, u.name, u.login_id AS loginId, s.name AS schoolName
        FROM memberships m JOIN users u ON u.id = m.user_id JOIN schools s ON s.id = u.school_id
        WHERE m.project_id = ? ORDER BY m.status = 'pending' DESC, m.requested_at, m.id`, project.id);
    }
    res.json(result);
  });

  // POST /api/projects — create a project (it starts as "pending").
  router.post('/projects', requireRole('student'), async (req, res) => {
    const { errors, project: p } = validateProject(req.body, today());
    if (errors.length > 0) return res.status(400).json({ error: errors.join(' '), errors });

    const info = await db.run(`
      INSERT INTO projects (title, description, strand, school_id, creator_id, interschool, location,
        start_date, end_date, apply_deadline, hours, fee, cap_participant, cap_volunteer, cap_organizer,
        status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
    p.title, p.description, p.strand, req.user.school_id, req.user.id, p.interschool, p.location,
    p.startDate, p.endDate, p.applyDeadline, p.hours, p.fee, p.capParticipant, p.capVolunteer, p.capOrganizer,
    today());
    res.status(201).json({ id: info.insertId, message: 'Project sent to your CAS coordinator for approval.' });
  });

  // POST /api/projects/:id/join — request to join (Algorithm 2).
  router.post('/projects/:id/join', requireRole('student'), async (req, res) => {
    const project = await db.get(GET_PROJECT, Number(req.params.id));
    if (!project) return res.status(404).json({ error: 'Project not found.' });

    const check = checkJoinRequest({
      project,
      user: req.user,
      role: req.body.role,
      existing: await db.get('SELECT status FROM memberships WHERE project_id = ? AND user_id = ?', project.id, req.user.id),
      counts: await acceptedCounts(db, project.id),
      schedule: await db.all(SCHEDULE, req.user.id, req.user.id),
      today: today(),
    });
    if (!check.ok) return res.status(check.status).json({ error: check.reason });

    await db.run(`INSERT INTO memberships (project_id, user_id, role, status, requested_at)
                  VALUES (?, ?, ?, 'pending', ?)`, project.id, req.user.id, req.body.role, today());
    res.status(201).json({ message: 'Request sent. The project creator will accept or reject it.' });
  });

  // POST /api/memberships/:id/decision — the creator accepts or rejects a request.
  router.post('/memberships/:id/decision', requireRole('student'), async (req, res) => {
    const decision = req.body.decision;
    // A transaction with "FOR UPDATE" locks the project row, so two acceptances at the same
    // moment cannot both take the last place.
    const outcome = await db.transaction(async (tx) => {
      const request = await tx.get(`
        SELECT m.*, p.creator_id, p.start_date, p.end_date, p.cap_participant, p.cap_volunteer, p.cap_organizer
        FROM memberships m JOIN projects p ON p.id = m.project_id WHERE m.id = ? FOR UPDATE`, Number(req.params.id));
      if (!request || request.creator_id !== req.user.id) return [404, { error: 'Request not found.' }];
      if (request.status !== 'pending') return [409, { error: `This request was already ${request.status}.` }];
      if (!['accepted', 'rejected'].includes(decision)) return [400, { error: 'Decision must be accepted or rejected.' }];

      if (decision === 'accepted') {
        // Re-check places and clashes now: things may have changed since the student asked.
        const counts = await acceptedCounts(tx, request.project_id);
        if (counts[request.role] >= request[`cap_${request.role}`]) {
          return [409, { error: `All ${request.role} places are already filled.` }];
        }
        const clash = findClash(await tx.all(SCHEDULE, request.user_id, request.user_id),
          { id: request.project_id, start_date: request.start_date, end_date: request.end_date });
        if (clash) return [409, { error: `This student is now busy with "${clash.title}" on those dates.` }];
      }
      await tx.run('UPDATE memberships SET status = ? WHERE id = ?', decision, request.id);
      return [200, { message: `Request ${decision}.` }];
    });
    res.status(outcome[0]).json(outcome[1]);
  });

  // GET /api/my/projects — projects I created and projects I asked to join.
  router.get('/my/projects', requireRole('student'), async (req, res) => {
    const created = await db.all(`
      SELECT p.id, p.title, p.strand, p.status, p.start_date AS startDate, p.teacher_comment AS teacherComment,
        (SELECT COUNT(*) FROM memberships m WHERE m.project_id = p.id AND m.status = 'pending') AS pendingRequests,
        (SELECT COUNT(*) FROM memberships m WHERE m.project_id = p.id AND m.status = 'accepted') AS members
      FROM projects p WHERE p.creator_id = ? ORDER BY p.start_date`, req.user.id);
    const joined = await db.all(`
      SELECT p.id, p.title, p.strand, p.status AS projectStatus, p.start_date AS startDate, m.role, m.status
      FROM memberships m JOIN projects p ON p.id = m.project_id
      WHERE m.user_id = ? ORDER BY p.start_date`, req.user.id);
    res.json({ created, joined });
  });

  // GET /api/my/cas-record — the student's CAS record (Algorithm 4).
  router.get('/my/cas-record', requireRole('student'), async (req, res) => {
    const rows = await db.all(`
      SELECT p.id, p.title, p.strand, p.hours, p.status, p.start_date, p.end_date, s.name AS school_name, m.role
      FROM memberships m JOIN projects p ON p.id = m.project_id JOIN schools s ON s.id = p.school_id
      WHERE m.user_id = ? AND m.status = 'accepted' AND p.status IN ('approved', 'ongoing', 'completed')
      UNION ALL
      SELECT p.id, p.title, p.strand, p.hours, p.status, p.start_date, p.end_date, s.name, 'creator'
      FROM projects p JOIN schools s ON s.id = p.school_id
      WHERE p.creator_id = ? AND p.status IN ('approved', 'ongoing', 'completed')`, req.user.id, req.user.id);
    res.json({ student: { name: req.user.name, loginId: req.user.login_id, school: req.user.school_name }, ...buildCasRecord(rows) });
  });

  return router;
};
