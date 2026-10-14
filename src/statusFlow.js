// statusFlow.js — ALGORITHM 3: the life-cycle of a project as a "state machine".
//
//   pending ──approve──▶ approved ──start──▶ ongoing ──finish──▶ completed
//      │
//      └────reject────▶ rejected
//
// The object below lists, for each status, the statuses it is allowed to move to next.
const TRANSITIONS = {
  pending: ['approved', 'rejected'],
  approved: ['ongoing'],
  ongoing: ['completed'],
  rejected: [],      // final — nothing comes after
  completed: [],     // final — nothing comes after
};

// Returns true if a project may move from status `from` to status `to`.
function canMove(from, to) {
  return (TRANSITIONS[from] || []).includes(to);   // unknown `from` → empty list → false
}

module.exports = { TRANSITIONS, canMove };
