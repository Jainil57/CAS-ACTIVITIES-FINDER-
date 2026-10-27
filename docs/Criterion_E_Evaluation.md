# Criterion E: Evaluation

*Draft. Check every line against your own testing and video before submitting.*

## E1. Extent to which the success criteria were met

| SC | Evidence | Extent | Comment |
|---|---|---|---|
| SC1 | T15–16, video | Met | Wrong IDs and passwords give the same message; only hashes are stored. |
| SC2 | T08, T10, T18, T28 | Met | 87 ms for 2,006 projects. Matching is by exact word part, so a typo such as "beech" finds nothing. |
| SC3 | T03–06, T19 | Met | Every error is listed at once. |
| SC4 | T11–12, T22 | Met | T22 first exposed hidden projects; fixed. |
| SC5 | T23, T30 | Met | Overbooking found by T30 and fixed with a row lock. |
| SC6 | T13, T21 | Met | A project can't be completed before its end date. |
| SC7 | T25–26 | Met | Removed users are logged out at once. |
| SC8 | T14, T24 | Met | Only completed hours count. |
| SC9 | T17 | Partly met | Roles are enforced, but escaping was tested with only one attack string. |
| SC10 | T27 | Met | Data and logins survived a restart. |

## E2. Improvements

1. **Notifications.** A student only learns that a request was accepted by opening the app. That keeps part of the original problem, where students miss information. Sending an email when a request or project is decided would fix this. It is feasible: a decision already updates one row, so it is one extra step.
2. **Typo-tolerant search.** T10 showed that "beech" does not find "beach". Comparing words by edit distance (allowing one wrong letter) would help students who type quickly on phones, and it only changes `scoreProject`.
3. **Wider security testing (SC9).** Testing more attack strings and a password-reset flow would turn SC9 from partly met into fully met. Without a reset, the principal must re-add students who forget their password.
4. **Trial with GMIS students.** All the testing was automated. A two-week trial would show whether more students actually join CAS projects, which was the original aim.
