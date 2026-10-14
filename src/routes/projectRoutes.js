// projectRoutes.js — everything a student does with projects: search, view, create, join,
// accept/reject requests and view the CAS record. Mounted at /api.
const express = require('express');
const { requireRole } = require('../auth');
const { validateProject } = require('../validation');
const { searchProjects } = require('../search');
const { checkJoinRequest, findClash } = require('../joinRules');
const { buildCasRecord } = require('../casRecord');

module.exports = function projectRoutes(db, today) {
  const router = express.Router();

  // ---------- helper queries (prepared once, reused on every request) ----------

  // One project with its school name and creator name.
  const getProject = db.prepare(`
    SELECT p.*, s.name AS school_name, u.name AS creator_name
    FROM projects p JOIN schools s ON s.id = p.school_id JOIN users u ON u.id = p.creator_id
    WHERE p.id = ? AND s.is_active = 1`);

  // Number of ACCEPTED members in each role for one project.
  const countRows = db.prepare(`
    SELECT role, COUNT(*) AS n FROM memberships
    WHERE project_id = ? AND status = 'accepted' GROUP BY role`);

  function acceptedCounts(projectId) {
    const counts = { participant: 0, volunteer: 0, organizer: 0 };
    for (const row of countRows.all(projectId)) counts[row.role] = row.n;   // fill in the real numbers
    return counts;
  }

  // The student's current commitments (accepted memberships + projects they created) that are
  // approved or ongoing. Used for the date-clash check.
  const scheduleOf = db.prepare(`
    SELECT p.id, p.title, p.start_date, p.end_date FROM memberships m JOIN projects p ON p.id = m.project_id
    WHERE m.user_id = ? AND m.status = 'accepted' AND p.status IN ('approved', 'ongoing')
    UNION
    SELECT id, title, start_date, end_date FROM projects
    WHERE creator_id = ? AND status IN ('approved', 'ongoing')`);

  // Turns a database row into the shape the browser needs, including places left per role.
  function summary(project, counts) {
    return {
      id: project.id, title: project.title, description: project.description, strand: project.strand,
      schoolId: project.school_id, schoolName: project.school_name, interschool: Boolean(project.interschool),
      location: project.location, startDate: project.start_date, endDate: project.end_date,
      applyDeadline: project.apply_deadline, hours: project.hours, fee: project.fee, status: project.status,
      teacherComment: project.teacher_comment, creatorId: project.creator_id, creatorName: project.creator_name,
      places: {
        participant: { taken: counts.participant, total: project.cap_participant },
        volunteer: { taken: counts.volunteer, total: project.cap_volunteer },
        organizer: { taken: counts.organizer, total: project.cap_organizer },
      },
    };
  }

  // ---------- GET /api/projects?q=&strand=&scope=&openOnly=1 — search (Algorithm 1) ----------
  router.get('/projects', requireRole('student', 'teacher', 'principal'), (req, res) => {
    // Step 1 (SQL): only projects this user may see — approved/ongoing, own school or interschool.
    const visible = db.prepare(`
      SELECT p.*, s.name AS school_name FROM projects p JOIN schools s ON s.id = p.school_id
      WHERE s.is_active = 1 AND p.status IN ('approved', 'ongoing') AND (p.school_id = ? OR p.interschool = 1)`)
      .all(req.user.school_id);

    // Step 2 (JavaScript): keyword matching, filters and ranking.
    const results = searchProjects(visible, {
      query: String(req.query.q || ''),
      strand: String(req.query.strand || ''),
      scope: String(req.query.scope || 'all'),
      openOnly: req.query.openOnly === '1',
      schoolId: req.user.school_id,
      today: today(),
    });

    // Step 3: count accepted members for ALL projects in one query (instead of one query each).
    const counts = new Map();
    const allCounts = db.prepare(`SELECT project_id, role, COUNT(*) AS n FROM memberships
                                  WHERE status = 'accepted' GROUP BY project_id, role`).all();
    for (const row of allCounts) {
      if (!counts.has(row.project_id)) counts.set(row.project_id, { participant: 0, volunteer: 0, organizer: 0 });
      counts.get(row.project_id)[row.role] = row.n;
    }
    const empty = { participant: 0, volunteer: 0, organizer: 0 };
    res.json(results.map((p) => summary(p, counts.get(p.id) || empty)));
  });

  // ---------- GET /api/projects/:id — project details ----------
  router.get('/projects/:id', requireRole('student', 'teacher', 'principal'), (req, res) => {
    const project = getProject.get(Number(req.params.id));
    if (!project) return res.status(404).json({ error: 'Project not found.' });

    const isCreator = project.creator_id === req.user.id;
    const isStaff = req.user.role !== 'student' && project.school_id === req.user.school_id;
    const isPublic = ['approved', 'ongoing', 'completed'].includes(project.status)
      && (project.school_id === req.user.school_id || project.interschool === 1);
    // A pending project is private to its creator and the school's staff. Saying "not found"
    // (instead of "forbidden") does not even reveal that the project exists.
    if (!isCreator && !isStaff && !isPublic) return res.status(404).json({ error: 'Project not found.' });

    const result = summary(project, acceptedCounts(project.id));
    result.isCreator = isCreator;
    result.myRequest = db.prepare('SELECT role, status FROM memberships WHERE project_id = ? AND user_id = ?')
      .get(project.id, req.user.id) || null;
    // The creator and staff can see who has asked to join.
    if (isCreator || isStaff) {
      result.requests = db.prepare(`
        SELECT m.id, m.role, m.status, m.requested_at AS requestedAt, u.name, u.login_id AS loginId, s.name AS schoolName
        FROM memberships m JOIN users u ON u.id = m.user_id JOIN schools s ON s.id = u.school_id
        WHERE m.project_id = ? ORDER BY m.status = 'pending' DESC, m.requested_at`).all(project.id);
    }
    res.json(result);
  });

  // ---------- POST /api/projects — create a project (it starts as "pending") ----------
  router.post('/projects', requireRole('student'), (req, res) => {
    const { errors, project: p } = validateProject(req.body, today());
    if (errors.length > 0) return res.status(400).json({ error: errors.join(' '), errors });

    const info = db.prepare(`
      INSERT INTO projects (title, description, strand, school_id, creator_id, interschool, location,
        start_date, end_date, apply_deadline, hours, fee, cap_participant, cap_volunteer, cap_organizer,
        status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`).run(
      p.title, p.description, p.strand, req.user.school_id, req.user.id, p.interschool, p.location,
      p.startDate, p.endDate, p.applyDeadline, p.hours, p.fee, p.capParticipant, p.capVolunteer, p.capOrganizer,
      today());
    res.status(201).json({ id: Number(info.lastInsertRowid), message: 'Project sent to your CAS coordinator for approval.' });
  });

  // ---------- POST /api/projects/:id/join — request to join (Algorithm 2) ----------
  router.post('/projects/:id/join', requireRole('student'), (req, res) => {
    const project = getProject.get(Number(req.params.id));
    if (!project) return res.status(404).json({ error: 'Project not found.' });

    const check = checkJoinRequest({
      project,
      user: req.user,
      role: req.body.role,
      existing: db.prepare('SELECT status FROM memberships WHERE project_id = ? AND user_id = ?').get(project.id, req.user.id),
      counts: acceptedCounts(project.id),
      schedule: scheduleOf.all(req.user.id, req.user.id),
      today: today(),
    });
    if (!check.ok) return res.status(check.status).json({ error: check.reason });

    db.prepare(`INSERT INTO memberships (project_id, user_id, role, status, requested_at)
                VALUES (?, ?, ?, 'pending', ?)`).run(project.id, req.user.id, req.body.role, today());
    res.status(201).json({ message: 'Request sent. The project creator will accept or reject it.' });
  });

  // ---------- POST /api/memberships/:id/decision — creator accepts or rejects a request ----------
  router.post('/memberships/:id/decision', requireRole('student'), (req, res) => {
    const request = db.prepare(`
      SELECT m.*, p.creator_id, p.title, p.start_date, p.end_date, p.status AS project_status,
             p.cap_participant, p.cap_volunteer, p.cap_organizer
      FROM memberships m JOIN projects p ON p.id = m.project_id WHERE m.id = ?`).get(Number(req.params.id));
    // Only the creator of the project may decide.
    if (!request || request.creator_id !== req.user.id) return res.status(404).json({ error: 'Request not found.' });
    if (request.status !== 'pending') return res.status(409).json({ error: `This request was already ${request.status}.` });

    const decision = req.body.decision;
    if (!['accepted', 'rejected'].includes(decision)) return res.status(400).json({ error: 'Decision must be accepted or rejected.' });

    if (decision === 'accepted') {
      // Re-check capacity NOW: places may have filled up since the student asked.
      const counts = acceptedCounts(request.project_id);
      if (counts[request.role] >= request[`cap_${request.role}`]) {
        return res.status(409).json({ error: `All ${request.role} places are already filled.` });
      }
      // Re-check clashes too: the student may have been accepted somewhere else meanwhile.
      const clash = findClash(scheduleOf.all(request.user_id, request.user_id),
        { id: request.project_id, start_date: request.start_date, end_date: request.end_date });
      if (clash) return res.status(409).json({ error: `This student is now busy with "${clash.title}" on those dates.` });
    }
    db.prepare('UPDATE memberships SET status = ? WHERE id = ?').run(decision, request.id);
    res.json({ message: `Request ${decision}.` });
  });

  // ---------- GET /api/my/projects — projects I created and projects I asked to join ----------
  router.get('/my/projects', requireRole('student'), (req, res) => {
    const created = db.prepare(`
      SELECT p.id, p.title, p.strand, p.status, p.start_date AS startDate, p.teacher_comment AS teacherComment,
        (SELECT COUNT(*) FROM memberships m WHERE m.project_id = p.id AND m.status = 'pending') AS pendingRequests,
        (SELECT COUNT(*) FROM memberships m WHERE m.project_id = p.id AND m.status = 'accepted') AS members
      FROM projects p WHERE p.creator_id = ? ORDER BY p.start_date`).all(req.user.id);
    const joined = db.prepare(`
      SELECT p.id, p.title, p.strand, p.status AS projectStatus, p.start_date AS startDate, m.role, m.status
      FROM memberships m JOIN projects p ON p.id = m.project_id
      WHERE m.user_id = ? ORDER BY p.start_date`).all(req.user.id);
    res.json({ created, joined });
  });

  // ---------- GET /api/my/cas-record — the student's CAS CV (Algorithm 4) ----------
  router.get('/my/cas-record', requireRole('student'), (req, res) => {
    const rows = db.prepare(`
      SELECT p.id, p.title, p.strand, p.hours, p.status, p.start_date, p.end_date, s.name AS school_name, m.role
      FROM memberships m JOIN projects p ON p.id = m.project_id JOIN schools s ON s.id = p.school_id
      WHERE m.user_id = ? AND m.status = 'accepted' AND p.status IN ('approved', 'ongoing', 'completed')
      UNION ALL
      SELECT p.id, p.title, p.strand, p.hours, p.status, p.start_date, p.end_date, s.name, 'creator'
      FROM projects p JOIN schools s ON s.id = p.school_id
      WHERE p.creator_id = ? AND p.status IN ('approved', 'ongoing', 'completed')`).all(req.user.id, req.user.id);
    res.json({ student: { name: req.user.name, loginId: req.user.login_id, school: req.user.school_name }, ...buildCasRecord(rows) });
  });

  return router;
};
