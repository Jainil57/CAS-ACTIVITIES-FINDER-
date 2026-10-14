// casRecord.js — ALGORITHM 4: builds a student's CAS record ("CAS CV").

function buildCasRecord(rows) {
  // Start every total at zero so all three strands always appear, even with no activities.
  const totals = { Creativity: 0, Activity: 0, Service: 0, all: 0 };
  let completed = 0;

  // Sort a COPY (rows.slice()) so the caller's array is not changed. Oldest project first.
  const entries = rows.slice().sort((a, b) => a.start_date.localeCompare(b.start_date));

  for (const row of entries) {
    // Hours only count once a teacher marks the project completed.
    if (row.status === 'completed') {
      totals[row.strand] += row.hours;
      totals.all += row.hours;
      completed += 1;
    }
  }
  return { entries, totals, completed };
}

module.exports = { buildCasRecord };
