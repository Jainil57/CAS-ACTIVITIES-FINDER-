// validation.js — checks everything a user types BEFORE it is saved.
// The server never trusts the browser: a student could bypass the HTML form, so every rule is
// checked again here. Each function returns a cleaned value, or null / an error message.
const { isValidDate } = require('./dates');

const STRANDS = ['Creativity', 'Activity', 'Service'];   // the three CAS strands
const ROLES = ['participant', 'volunteer', 'organizer']; // ways a student can join a project

// Trims spaces and checks the length is between min and max characters. Returns the text or null.
function cleanText(value, min, max) {
  if (typeof value !== 'string') return null;            // numbers, objects, undefined → invalid
  const text = value.trim().replace(/\s+/g, ' ');        // remove outer spaces, squash inner runs of spaces
  return text.length >= min && text.length <= max ? text : null;
}

// Converts a value to a whole number between min and max. Returns the number or null.
function toWholeNumber(value, min, max) {
  const number = Number(value);                          // "12" → 12, "abc" → NaN
  return Number.isInteger(number) && number >= min && number <= max ? number : null;
}

// Returns a message explaining what is wrong with a password, or null if it is acceptable.
function passwordProblem(password) {
  if (typeof password !== 'string' || password.length < 8) return 'Password must be at least 8 characters.';
  if (password.length > 64) return 'Password must be at most 64 characters.';
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return 'Password must contain a letter and a number.';
  return null;
}

// School IDs such as "S1001" or "T200": 3-12 letters/digits, stored in capitals.
function cleanLoginId(value) {
  const id = cleanText(value, 3, 12);
  if (!id) return null;
  const upper = id.toUpperCase();                        // "s1001" and "S1001" mean the same student
  return /^[A-Z0-9]+$/.test(upper) ? upper : null;       // only letters and digits allowed
}

// Validates the "Create project" form. `today` is "YYYY-MM-DD".
// Returns { errors: [...messages], project: {...cleaned values} }.
function validateProject(input, today) {
  const errors = [];                                     // collect EVERY problem, not just the first
  const body = input || {};

  const title = cleanText(body.title, 5, 80);
  if (!title) errors.push('Title must be 5-80 characters.');

  const description = cleanText(body.description, 20, 1000);
  if (!description) errors.push('Description must be 20-1000 characters.');

  const strand = STRANDS.includes(body.strand) ? body.strand : null;
  if (!strand) errors.push('Choose Creativity, Activity or Service.');

  const location = cleanText(body.location, 2, 100);
  if (!location) errors.push('Location must be 2-100 characters.');

  const startDate = isValidDate(body.startDate) ? body.startDate : null;
  const endDate = isValidDate(body.endDate) ? body.endDate : null;
  const applyDeadline = isValidDate(body.applyDeadline) ? body.applyDeadline : null;
  if (!startDate || !endDate || !applyDeadline) {
    errors.push('Start date, end date and application deadline must be real dates.');
  } else {
    // The order must be: today ≤ deadline ≤ start ≤ end.
    if (applyDeadline < today) errors.push('Application deadline cannot be in the past.');
    if (applyDeadline > startDate) errors.push('Application deadline must be on or before the start date.');
    if (endDate < startDate) errors.push('End date cannot be before the start date.');
  }

  const hours = toWholeNumber(body.hours, 1, 200);
  if (hours === null) errors.push('CAS hours must be a whole number from 1 to 200.');

  const fee = toWholeNumber(body.fee ?? 0, 0, 100000);   // "??" means: use 0 if fee was not sent
  if (fee === null) errors.push('Fee must be a whole number of rupees from 0 to 100000.');

  const capParticipant = toWholeNumber(body.capParticipant, 0, 500);
  const capVolunteer = toWholeNumber(body.capVolunteer, 0, 100);
  const capOrganizer = toWholeNumber(body.capOrganizer, 0, 20);
  if (capParticipant === null || capVolunteer === null || capOrganizer === null) {
    errors.push('Places must be whole numbers (participants 0-500, volunteers 0-100, organizers 0-20).');
  } else if (capParticipant + capVolunteer + capOrganizer === 0) {
    errors.push('A project needs at least one place.');
  }

  const interschool = body.interschool === true || body.interschool === 'true' ? 1 : 0;

  return {
    errors,
    project: {
      title, description, strand, location, startDate, endDate, applyDeadline,
      hours, fee, capParticipant, capVolunteer, capOrganizer, interschool,
    },
  };
}

module.exports = {
  STRANDS, ROLES, cleanText, toWholeNumber, passwordProblem, cleanLoginId, validateProject,
};
