// statusFlow.js — ALGORITHM 3: the life-cycle of a project as a "state machine".
const TRANSITIONS = {
  pending: ['approved', 'rejected'],
  approved: ['ongoing'],
  ongoing: ['completed'],
  rejected: [],
  completed: [],
};

// Returns true if a project may move from status `from` to status `to`.
function canMove(from, to) {
  return (TRANSITIONS[from] || []).includes(to);
}

module.exports = { TRANSITIONS, canMove };
