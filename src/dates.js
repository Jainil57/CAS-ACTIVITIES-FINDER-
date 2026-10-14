// dates.js — small helper functions for working with calendar dates.

// A regular expression that matches exactly 4 digits, a dash, 2 digits, a dash, 2 digits.
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// Returns true only if `text` is a real calendar date written as YYYY-MM-DD.
function isValidDate(text) {
  // Reject anything that is not a string or does not have the YYYY-MM-DD shape.
  if (typeof text !== 'string' || !DATE_PATTERN.test(text)) return false;
  // Build a Date object for midnight UTC on that day ("Z" means UTC, so time zones cannot shift the day).
  const date = new Date(`${text}T00:00:00Z`);
  // JS turns 2026-02-30 into 2026-03-02, so convert back and compare to catch fake dates.
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === text;
}

// Adds `days` (can be negative) to a YYYY-MM-DD date and returns the new YYYY-MM-DD date.
function addDays(text, days) {
  const date = new Date(`${text}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

// Today's date in local time (WIB, UTC+7). UTC would still say yesterday before 7 a.m.
function localToday() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

// Two date ranges overlap if each one starts on or before the day the other ends.
function datesOverlap(startA, endA, startB, endB) {
  return startA <= endB && startB <= endA;
}

module.exports = { isValidDate, addDays, localToday, datesOverlap };
