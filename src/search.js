// search.js — ALGORITHM 1: keyword search with filters and relevance ranking.
// It is a "pure function": it only uses its inputs and returns a result, so it is easy to test.

// Makes text comparable: lower-case, accents removed ("Café" → "cafe"), punctuation turned
// into spaces and repeated spaces squashed. "Beach  Clean-Up!" → "beach clean up".
function normalise(text) {
  return String(text ?? '')
    .toLowerCase()
    .normalize('NFD')                    // split "é" into "e" + an accent mark…
    .replace(/[\u0300-\u036f]/g, '')     // …then delete the accent marks (Unicode range U+0300 to U+036F)
    .replace(/[^a-z0-9\s]/g, ' ')        // anything that is not a letter, digit or space → space
    .replace(/\s+/g, ' ')                // many spaces → one space
    .trim();
}

// Scores one project against the search words.
// A word found in the title is worth 3 points, a word found anywhere else is worth 1.
// If ANY word is missing completely, the score is 0 (the project does not match).
function scoreProject(project, words) {
  if (words.length === 0) return 1;                      // empty search: everything matches equally
  const title = normalise(project.title);
  // Everything except the title; `?? ''` skips missing fields. Includes the school's area, so "selatan" finds South Jakarta.
  const rest = normalise([project.description, project.location, project.school_name, project.school_area, project.strand]
    .map((part) => part ?? '').join(' '));
  let score = 0;
  for (const word of words) {
    if (title.includes(word)) score += 3;                // partial match: "clean" is inside "cleanup"
    else if (rest.includes(word)) score += 1;
    else return 0;                                       // stop early — this project cannot match
  }
  return score;
}

// Filters and ranks a list of projects.
//   query     – what the student typed, e.g. "beach clean"
//   strand    – "" for all strands, or "Creativity" / "Activity" / "Service"
//   scope     – "all", "mine" (my school only) or "other" (other schools' interschool projects)
//   openOnly  – true = hide projects whose application deadline has passed
//   schoolId  – the searching student's school
//   today     – "YYYY-MM-DD"
function searchProjects(projects, { query = '', strand = '', scope = 'all', openOnly = false, schoolId, today }) {
  const words = normalise(query).split(' ').filter(Boolean);   // "beach clean" → ["beach", "clean"]
  const results = [];
  for (const project of projects) {                            // look at every project once: O(n)
    if (strand && project.strand !== strand) continue;         // wrong strand → skip
    if (scope === 'mine' && project.school_id !== schoolId) continue;
    if (scope === 'other' && project.school_id === schoolId) continue;
    if (openOnly && project.apply_deadline < today) continue;  // deadline passed → skip
    const score = scoreProject(project, words);
    if (score > 0) results.push({ ...project, score });        // copy the project and add its score
  }
  // Highest score first; when scores tie, the project starting soonest comes first.
  results.sort((a, b) => b.score - a.score || a.start_date.localeCompare(b.start_date));
  return results;
}

module.exports = { normalise, scoreProject, searchProjects };
