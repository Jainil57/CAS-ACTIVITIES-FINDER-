// casRecord.js — ALGORITHM 4: builds a student's CAS record ("CAS CV").
// Input: one row per project the student is part of (as an accepted member or as the creator).
// Output: the rows sorted by date plus totals of COMPLETED hours for each strand.

function buildCasRecord(rows) {
  // Start every total at zero so all three strands always appear, even with no activities.
  const totals = { Creativity: 0, Activity: 0, Service: 0, all: 0 };
  let completed = 0;                                   // number of finished projects

  // Sort a COPY (rows.slice()) so the caller's array is not changed. Oldest project first.
  const entries = rows.slice().sort((a, b) => a.start_date.localeCompare(b.start_date));

  for (const row of entries) {
    // Hours only count once a teacher has marked the project completed,
    // so a student cannot claim hours for something that has not happened yet.
    if (row.status === 'completed') {
      totals[row.strand] += row.hours;
      totals.all += row.hours;
      completed += 1;
    }
  }
  return { entries, totals, completed };
}

module.exports = { buildCasRecord };
