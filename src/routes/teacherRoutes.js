// teacherRoutes.js — the CAS coordinator/supervisor: approve or reject projects, move them through
// their life-cycle (Algorithm 3) and change application deadlines. Mounted at /api/teacher.
const express = require('express');
const { requireRole } = require('../auth');
const { canMove } = require('../statusFlow');
const { cleanText } = require('../validation');
const { isValidDate } = require('../dates');

module.exports = function teacherRoutes(db, today) {
  const router = express.Router();
  router.use(requireRole('teacher'));                  // EVERY route below is teacher-only

  // Loads a project, but only if it belongs to the teacher's own school.
  function ownProject(req) {
    return db.prepare('SELECT * FROM projects WHERE id = ? AND school_id = ?').get(Number(req.params.id), req.user.school_id);
  }

  // GET /api/teacher/projects — all of the school's projects, pending ones first.
  router.get('/projects', (req, res) => {
    res.json(db.prepare(`
      SELECT p.id, p.title, p.strand, p.status, p.start_date AS startDate, p.end_date AS endDate,
             p.apply_deadline AS applyDeadline, p.hours, p.teacher_comment AS teacherComment, u.name AS creatorName,
             (SELECT COUNT(*) FROM memberships m WHERE m.project_id = p.id AND m.status = 'accepted') AS members
      FROM projects p JOIN users u ON u.id = p.creator_id
      WHERE p.school_id = ?
      ORDER BY CASE p.status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 WHEN 'ongoing' THEN 2 ELSE 3 END, p.start_date`)
      .all(req.user.school_id));
  });

  // POST /api/teacher/projects/:id/status  { status, comment } — approve / reject / start / complete.
  router.post('/projects/:id/status', (req, res) => {
    const project = ownProject(req);
    if (!project) return res.status(404).json({ error: 'Project not found.' });

    const next = req.body.status;
    if (!canMove(project.status, next)) {
      return res.status(409).json({ error: `A ${project.status} project cannot become ${next}.` });
    }
    // A rejection must explain why, so the student can fix the proposal.
    const comment = cleanText(req.body.comment || '', 0, 300) ?? '';
    if (next === 'rejected' && comment.length < 5) {
      return res.status(400).json({ error: 'Please give a reason (at least 5 characters) when rejecting.' });
    }
    // Hours must not be awarded before the activity has actually finished.
    if (next === 'completed' && project.end_date > today()) {
      return res.status(409).json({ error: `This project only ends on ${project.end_date}.` });
    }
    db.prepare('UPDATE projects SET status = ?, teacher_comment = ? WHERE id = ?').run(next, comment, project.id);
    res.json({ message: `Project is now ${next}.` });
  });

  // POST /api/teacher/projects/:id/deadline  { applyDeadline } — extend or shorten the sign-up deadline.
  router.post('/projects/:id/deadline', (req, res) => {
    const project = ownProject(req);
    if (!project) return res.status(404).json({ error: 'Project not found.' });

    const deadline = req.body.applyDeadline;
    if (!isValidDate(deadline)) return res.status(400).json({ error: 'Enter a real date.' });
    if (deadline < today() || deadline > project.start_date) {
      return res.status(400).json({ error: `Deadline must be between ${today()} and the start date ${project.start_date}.` });
    }
    db.prepare('UPDATE projects SET apply_deadline = ? WHERE id = ?').run(deadline, project.id);
    res.json({ message: `Deadline changed to ${deadline}.` });
  });

  return router;
};
