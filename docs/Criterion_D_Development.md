# Criterion D: Development

*CAS Activities Finder · full source code in the Appendix · test IDs refer to Criterion C4*

## D1. Functionality

All ten success criteria work and are shown in the video. The 29 automated tests all pass (Figure D1).

| SC | Evidence | Tests |
|---|---|---|
| 1 | [login](images/ui-01-login.png) | T07, T15–16 |
| 2 | [browse](images/ui-02-browse.png), [search](images/ui-03-search.png) | T08–10, T18, T28–29 |
| 3 | [refused form](images/ui-06-create-invalid.png), [pending](images/ui-07-my-projects.png) | T01, T03–06, T19–20 |
| 4 | [joined](images/ui-04-joined.png), [clash](images/ui-05-clash.png) | T02, T11–12, T22 |
| 5 | [requests](images/ui-08-requests.png) | T23 |
| 6 | [teacher](images/ui-10-teacher.png) | T13, T21 |
| 7 | [principal](images/ui-11-principal.png), [admin](images/ui-12-admin.png) | T25–26 |
| 8 | [CAS record](images/ui-09-cas-record.png) | T14, T24 |
| 9 | [phone layout](images/ui-13-mobile.png) | T17, UI |
| 10 | restart in video | T27 |

## D2. Techniques

### 1. Relational database with constraints and parameterised SQL

```js
role   TEXT NOT NULL CHECK (role IN ('participant', 'volunteer', 'organizer')),
UNIQUE (project_id, user_id)                                             // db.js — MEMBERSHIPS
db.prepare('SELECT status FROM memberships WHERE project_id = ? AND user_id = ?').get(project.id, req.user.id)
```

Students and projects have a many-to-many relationship, so a linking table was needed (Figure C2). The `CHECK` and `UNIQUE` constraints repeat the JavaScript rules inside the database, so a missed check in a route still can't store a duplicate or an invalid value. The `?` placeholders make all input data rather than SQL, which prevents injection.

### 2. Normalised partial matching with weighted ranking (Algorithm 1)

```js
if (title.includes(word)) score += 3;
else if (rest.includes(word)) score += 1;
else return 0;
results.sort((a, b) => b.score - a.score || a.start_date.localeCompare(b.start_date));
```

`normalise()` lower-cases text, strips accents using Unicode NFD, and replaces punctuation, so `CLEAN`, `cafe` and `clean-up!!` all match (T08). When two scores tie, `b.score - a.score` is 0, so `||` falls through to the start date. SQL removes what the user may not see; JavaScript ranks, which `LIKE` can't do.

### 3. Ordered rules and conflict detection (Algorithm 2)

```js
const capacity = project[`cap_${role}`];
if ((counts[role] || 0) >= capacity) return { ok: false, status: 409, reason: `There are no ${role} places left.` };
const clash = findClash(schedule, project);          // startA <= endB && startB <= endA
```

`checkJoinRequest` is pure: it takes data in and returns `{ok, status, reason}`, so all eight rules are unit-tested without a server (T11–12). The computed property `` cap_${role} `` replaces three near-identical branches. `findClash` is reused when a creator accepts a request, because the student may have committed elsewhere in the meantime.

### 4. State machine as a lookup table (Algorithm 3)

```js
const TRANSITIONS = { pending: ['approved', 'rejected'], approved: ['ongoing'], ongoing: ['completed'], rejected: [], completed: [] };
const canMove = (from, to) => (TRANSITIONS[from] || []).includes(to);
```

The table mirrors Figure C6 directly, and adding a state takes one line.

### 5. Hashed passwords, sessions and higher-order middleware

```js
const hash = crypto.scryptSync(password, salt, 64).toString('hex');
return crypto.timingSafeEqual(actual, expected);
function requireRole(...roles) { return (req, res, next) => { /* 401 / 403 / next() */ }; }
```

`requireRole` returns a function, so `router.use(requireRole('teacher'))` protects a whole route file. Cookies are `httpOnly` and `sameSite: 'strict'`. The same login error for an unknown ID and a wrong password hides which IDs exist (T16).

### 6. Validation that reports every error

```js
return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === text;   // rejects 2026-02-30
```

JavaScript silently rolls 30 February over to 2 March, so converting the date back to text exposes impossible dates. `validateProject` collects all errors, so a student fixes the form in one attempt. School areas are checked against a fixed list of Jabodetabek areas, and fees against a Rupiah limit. The server re-checks everything: with the browser's checks disabled, the bad form was still refused.

### 7. Asynchronous requests and output escaping

```js
const response = await fetch(url, options);
if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => map[ch]);
```

All screens use one `api()` helper, so the server's reason always reaches the user. Fees are shown in Indonesian format with `toLocaleString('id-ID')` (Rp 50.000), and dates use local WIB time instead of UTC. Text written by users passes through `esc()`, so a project titled `<img src=x onerror=alert(1)>` displays as plain text ([screenshot](images/ui-10-teacher.png)).

### 8. Dependency injection

`createApp(db, { today })` receives its database and clock. Tests pass an in-memory database and a fixed date, so the date rules give the same result on every run.

## D3. Evaluation of decisions

| Decision | Strength | Limitation |
|---|---|---|
| JavaScript on both tiers (originally planned: Java) | one language, native JSON, shared helpers | no compile-time types, so the tests had to catch type errors |
| SQLite built into Node | no server to install; constraints, joins | one writer at a time; PostgreSQL needed for city-wide use |
| Synchronous queries | a capacity check and the following insert can't interleave, which prevents overbooking (T23) | a slow query would block others; measured ≤ 65 ms |
| Soft delete | CAS history kept; reversible | an ID can't be reused |
| Sessions in the database | survive restarts (T27); removal logs out instantly | one query per request |
| No front-end framework | no build step; every line is explainable | whole screens re-render; some repeated wiring |

## D4. Testing

![Figure D1 – test run](images/d1-test-run.png)
*Figure D1: `npm test` output.*

**Correctness.** Each algorithm was unit-tested with normal, boundary and invalid data, then every route was tested end-to-end over HTTP.

**Reliability.** Each test gets its own server and database, so test order can't matter. The suite also covers malformed JSON, oversized bodies, empty records, stale cookies and restarts.

**Efficiency.** Searching 2,006 projects took 60 ms over HTTP. The algorithm alone took 63 ms for 20,000 projects: an O(n) scan plus an O(k log k) sort of the k matches.

**Defect found.** T22 failed at first because joining a *pending* project returned 409 "not open", which revealed that the hidden project existed. Pending and rejected projects now return 404, and T12 covers both cases.

**Justification.** Every success criterion has automated tests, and every exit in Figure C4 has an assertion. One gap remains: there was no long-term trial with real students, which Criterion E addresses.
