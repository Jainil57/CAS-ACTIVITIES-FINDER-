// search.js — ALGORITHM 1: keyword search with filters and relevance ranking.

// Lower-case, remove accents and punctuation: "Café Clean-Up!" → "cafe clean up".
function normalise(text) {
  return String(text ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Scores one project against the search words.
function scoreProject(project, words) {
  if (words.length === 0) return 1;
  const title = normalise(project.title);
  // Everything except the title; `?? ''` skips missing fields. Includes the school's area, so "selatan" finds South Jakarta.
  const rest = normalise([project.description, project.location, project.school_name, project.school_area, project.strand]
    .map((part) => part ?? '').join(' '));
  let score = 0;
  for (const word of words) {
    if (title.includes(word)) score += 3;
    else if (rest.includes(word)) score += 1;
    else return 0;
  }
  return score;
}

// Filters and ranks a list of projects.
function searchProjects(projects, { query = '', strand = '', scope = 'all', openOnly = false, schoolId, today }) {
  const words = normalise(query).split(' ').filter(Boolean);
  const results = [];
  for (const project of projects) {
    if (strand && project.strand !== strand) continue;
    if (scope === 'mine' && project.school_id !== schoolId) continue;
    if (scope === 'other' && project.school_id === schoolId) continue;
    if (openOnly && project.apply_deadline < today) continue;
    const score = scoreProject(project, words);
    if (score > 0) results.push({ ...project, score });
  }
  // Highest score first; when scores tie, the project starting soonest comes first.
  results.sort((a, b) => b.score - a.score || a.start_date.localeCompare(b.start_date));
  return results;
}

module.exports = { normalise, scoreProject, searchProjects };
