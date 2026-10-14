// dates.js — small helper functions for working with calendar dates.
// All dates in this program are stored as text in the form "YYYY-MM-DD" (for example "2026-10-14").
// That format has a useful property: comparing two of these strings alphabetically gives the
// same answer as comparing the dates, so "2026-09-30" < "2026-10-01" is true.

// A regular expression that matches exactly 4 digits, a dash, 2 digits, a dash, 2 digits.
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// Returns true only if `text` is a real calendar date written as YYYY-MM-DD.
function isValidDate(text) {
  // Reject anything that is not a string or does not have the YYYY-MM-DD shape.
  if (typeof text !== 'string' || !DATE_PATTERN.test(text)) return false;
  // Build a Date object for midnight UTC on that day ("Z" means UTC, so time zones cannot shift the day).
  const date = new Date(`${text}T00:00:00Z`);
  // JavaScript "rolls over" impossible dates (2026-02-30 becomes 2026-03-02), so we convert the
  // Date back to text and check it is unchanged. If it changed, the original date did not exist.
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === text;
}

// Adds `days` (can be negative) to a YYYY-MM-DD date and returns the new YYYY-MM-DD date.
function addDays(text, days) {
  const date = new Date(`${text}T00:00:00Z`);     // turn the text into a Date object
  date.setUTCDate(date.getUTCDate() + days);        // move forward/backward by `days`
  return date.toISOString().slice(0, 10);           // turn it back into "YYYY-MM-DD"
}

// Returns today's date on this computer's clock (local time, so it is correct in India at 1 a.m.).
function localToday() {
  const now = new Date();                                       // the current moment
  const month = String(now.getMonth() + 1).padStart(2, '0');    // getMonth() is 0-11, so add 1; pad "9" to "09"
  const day = String(now.getDate()).padStart(2, '0');           // day of the month, padded to 2 digits
  return `${now.getFullYear()}-${month}-${day}`;                // join into "YYYY-MM-DD"
}

// Two date ranges [startA, endA] and [startB, endB] overlap if each one starts
// before (or on the same day as) the other one ends.
function datesOverlap(startA, endA, startB, endB) {
  return startA <= endB && startB <= endA;
}

// Make the functions available to other files that `require('./dates')`.
module.exports = { isValidDate, addDays, localToday, datesOverlap };
