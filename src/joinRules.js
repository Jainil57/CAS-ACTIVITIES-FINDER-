// joinRules.js — ALGORITHM 2: decides whether a student may request to join a project.
const { ROLES } = require('./validation');
const { datesOverlap } = require('./dates');

// Returns the first project in the student's schedule whose dates overlap, or null.
function findClash(schedule, project) {
  for (const other of schedule) {
    if (other.id === project.id) continue;
    if (datesOverlap(project.start_date, project.end_date, other.start_date, other.end_date)) {
      return other;
    }
  }
  return null;
}

// Checks the 8 join rules in order. Returns { ok: true } or { ok: false, status, reason }.
function checkJoinRequest({ project, user, role, existing, counts, schedule, today }) {
  // Rule 1: the role must be one of the three allowed roles.
  if (!ROLES.includes(role)) return { ok: false, status: 400, reason: 'Choose participant, volunteer or organizer.' };

  // Rule 2: students may only see/join their own school's projects or interschool projects.
  if (project.school_id !== user.school_id && !project.interschool) {
    return { ok: false, status: 404, reason: 'Project not found.' };
  }

  // Rule 3: pending and rejected projects are hidden, so act as if they do not exist.
  if (['pending', 'rejected'].includes(project.status)) return { ok: false, status: 404, reason: 'Project not found.' };
  // Only approved or ongoing projects accept members (completed ones are closed).
  if (!['approved', 'ongoing'].includes(project.status)) {
    return { ok: false, status: 409, reason: 'This project is not open for sign-ups.' };
  }

  // Rule 4: the creator is already in charge of the project.
  if (project.creator_id === user.id) return { ok: false, status: 409, reason: 'You created this project.' };

  // Rule 5: no duplicate requests.
  if (existing) return { ok: false, status: 409, reason: `You already have a ${existing.status} request for this project.` };

  // Rule 6: the application deadline must not have passed (applying ON the deadline day is allowed).
  if (today > project.apply_deadline) return { ok: false, status: 409, reason: 'The application deadline has passed.' };

  // Rule 7: there must be a free place for this role.
  const capacity = project[`cap_${role}`];
  if ((counts[role] || 0) >= capacity) return { ok: false, status: 409, reason: `There are no ${role} places left.` };

  // Rule 8: the dates must not clash with something the student is already committed to.
  const clash = findClash(schedule, project);
  if (clash) {
    return { ok: false, status: 409, reason: `Dates clash with "${clash.title}" (${clash.start_date} to ${clash.end_date}).` };
  }

  return { ok: true };
}

module.exports = { findClash, checkJoinRequest };
