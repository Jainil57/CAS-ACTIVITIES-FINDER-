# Understanding the code, line by line

This guide is for **you**, not for the examiner. It doesn't count toward the IA. Use it to learn the code well enough to explain any line to your teacher. Teachers are allowed to question you to confirm the work is yours.

The fastest way to learn it:

1. Run the app and click around (Part 1).
2. Read the JavaScript primer (Part 3), so the syntax isn't a mystery.
3. Follow one button click through every file (Part 4).
4. Read each file with its line-by-line table (Part 5). Every line in the source also has its own comment.
5. Test yourself with the viva questions (Part 7).

---

## Part 1: Running it

You need **Node.js 22.5 or newer** (download from nodejs.org). Then, in the project folder:

```bash
npm install        # downloads Express (the only library used)
npm start          # starts the server → open http://localhost:3000
npm test           # runs the 29 automated tests
npm run seed       # wipes data/cas.db and reloads fresh demo data
```

Demo logins (password `Password1` for all):

| School | ID | Who | Role |
|---|---|---|---|
| Greenwood International School | `S1001` | Aarav Shah | student (created the beach clean-up) |
| Greenwood International School | `S1002` | Diya Patel | student (shows the date-clash refusal) |
| Greenwood International School | `S1003` | Kabir Singh | student |
| Greenwood International School | `S1004` | Meera Iyer | student, **not activated**: use "Activate your account" |
| Greenwood International School | `T200` | Mr. Vikram Mehta | teacher (CAS coordinator) |
| Greenwood International School | `P100` | Mrs. Anjali Rao | principal |
| Lakeside IB Academy | `S2001` / `S2002` | Rohan Das / Ananya Joshi | students at the other school |
| Service provider (platform admin) | `ADMIN` | Service Provider | admin |

## Part 2: The folder map

```
server.js              ← START HERE: opens the database and starts the web server
src/
  app.js               ← plugs all the pieces into one Express app
  db.js                ← database tables (the ERD in Criterion C)
  auth.js              ← passwords, sessions, role checks
  dates.js             ← date helpers (valid date? overlap?)
  validation.js        ← checks everything users type
  search.js            ← ALGORITHM 1: search and ranking
  joinRules.js         ← ALGORITHM 2: may this student join? (conflict detection)
  statusFlow.js        ← ALGORITHM 3: project life-cycle
  casRecord.js         ← ALGORITHM 4: CAS record totals
  routes/              ← one file per kind of user; each turns web requests into actions
    authRoutes.js  projectRoutes.js  teacherRoutes.js  principalRoutes.js  adminRoutes.js
public/                ← what the browser downloads
  index.html  app.js  styles.css
scripts/seed.js        ← demo data
tests/                 ← automated tests (T01–T29)
docs/                  ← Criteria C and D, diagrams, screenshots, this guide
```

**The one idea to hold on to:** the **browser** (`public/app.js`) never touches the database. It sends a *request* such as "POST /api/projects/2/join". The **server** (`src/…`) checks who you are, checks the rules, reads and writes the **database**, and sends back a *response*, either data or `{ error: "reason" }`.

## Part 3: JavaScript primer, using examples from this project

| Syntax | What it means | Where it appears |
|---|---|---|
| `const x = 5;` / `let y = 0;` | `const` can't be reassigned; `let` can. | everywhere; `let score = 0` in search.js:23 |
| `` `Hello ${name}` `` | **Template literal**: a string with values inserted at `${…}`. | `` `${salt}:${hash}` `` auth.js:13 |
| `(a, b) => a + b` | **Arrow function**: a short way to write a function. | sort comparator search.js:51 |
| `function f(x = 5)` | **Default parameter**: x is 5 if no value is given. | `options = {}` app.js:8 |
| `const { a, b } = obj;` | **Destructuring**: take properties out of an object into variables. | `const { createDb } = require('./src/db')` |
| `const [salt, hash] = text.split(':')` | Destructuring an array. | auth.js:19 |
| `{ ...project, score }` | **Spread**: copy all properties of `project`, then add `score`. | search.js:48 |
| `function f(...roles)` | **Rest parameter**: all arguments collected into an array. | `requireRole(...roles)` auth.js:69 |
| `a ?? b` | Use `a`, unless it is `null`/`undefined`, then use `b`. | `body.fee ?? 0` validation.js:71 |
| `a \|\| b` | Use `a` if it is "truthy", otherwise `b`. | `process.env.PORT \|\| 3000` |
| `cond ? x : y` | **Ternary**: if `cond` then `x` else `y`. | validation.js:13 |
| `arr.map(f)` / `arr.filter(f)` | New array with `f` applied to each item / only items where `f` is true. | app.js (browser) many places |
| `arr.includes(x)` | Is `x` in the array? | `ROLES.includes(role)` joinRules.js:29 |
| `arr.sort((a, b) => …)` | Sort; a negative result puts `a` first, positive puts `b` first. | search.js:51 |
| `/^\d{4}-\d{2}-\d{2}$/` | **Regular expression** (a text pattern). `^` start, `\d` digit, `{4}` exactly 4, `$` end. | dates.js:7 |
| `require('x')` / `module.exports = {…}` | Import from / export to other files (CommonJS modules). | top and bottom of every file |
| `async function` / `await` | `await` pauses the function until a slow task (like a network request) finishes, without freezing the page. | `await fetch(url)` public/app.js:17 |
| `try { … } catch (err) { … }` | If anything in `try` throws an error, jump to `catch`. | public/app.js:93-97 |
| `new Map()` | A key → value table. | projectRoutes.js:76 |

## Part 4: Following one click through the whole system

**Scenario:** Kabir is logged in and clicks **"Join as volunteer"** on the School Mural project (id 2).

| Step | File:line | What happens |
|---|---|---|
| 1 | `public/app.js:254` | When the project page was drawn, every `<button data-role="…">` got an `onclick` function. |
| 2 | `public/app.js:257` | The click runs `api('POST', '/api/projects/2/join', { role: 'volunteer' })`. |
| 3 | `public/app.js:11-21` | `api()` turns `{ role: 'volunteer' }` into JSON text and calls `fetch`. The browser automatically attaches Kabir's `cas_session` cookie. |
| 4 | `src/app.js:13` | On the server, `express.json()` turns the JSON text back into `req.body = { role: 'volunteer' }`. |
| 5 | `src/app.js:14` → `src/auth.js:60-63` | `loadUser` reads the cookie, looks up the token in `sessions`, and sets `req.user = { id: 6, name: 'Kabir Singh', role: 'student', school_id: 1, … }`. |
| 6 | `src/app.js:22` | The path starts with `/api`, so Express hands the request to `projectRoutes`. |
| 7 | `src/routes/projectRoutes.js:131` | This route matches `POST /projects/:id/join`, so `req.params.id = '2'`. First `requireRole('student')` runs (auth.js:69-76). Kabir is a student, so `next()` is called. |
| 8 | `projectRoutes.js:132-133` | It loads project 2 from the database. If it didn't exist, it would answer 404. |
| 9 | `projectRoutes.js:135-143` | It gathers everything the rules need: Kabir's existing request (none), the accepted counts, and Kabir's schedule. Then it calls `checkJoinRequest`. |
| 10 | `src/joinRules.js:27-64` | Rules 1–8 are checked in order. All pass, so it returns `{ ok: true }`. |
| 11 | `projectRoutes.js:146-148` | It INSERTs a `pending` membership and answers `201 { message: 'Request sent…' }`. |
| 12 | `public/app.js:258-259` | Back in the browser, `api()` returns the data. A green message is shown and the page is redrawn, now showing "Your request … is pending". |

If a rule had failed, for example the deadline had passed, step 10 would return `{ ok: false, status: 409, reason: 'The application deadline has passed.' }`. Line 144 would send that as `409 { error: … }`. In the browser, `api()` would **throw** (app.js:19), the `catch` would run, and `showMessage` would show the reason in red.

## Part 5: Each file, line by line

Every line in the source has its own comment. The tables below explain the *why* and the trickier lines.

### `server.js`: the starting point

| Lines | Explanation |
|---|---|
| 2-7 | Load Node's file-system and path modules plus our own modules. |
| 9 | Use the `PORT` environment variable if one is set, otherwise 3000. `Number(undefined)` is `NaN`, which is falsy, so `\|\|` picks 3000. |
| 10 | The database file path. `__dirname` is the folder this file is in, so the path works from any working directory. |
| 12 | Create the `data/` folder. `recursive: true` means "no error if it already exists". |
| 13 | Open the database (see db.js). |
| 16-19 | `COUNT(*)` of users. If it's 0, this is the very first run, so fill the database with demo data. |
| 22 | Housekeeping: delete login sessions that have already expired. |
| 24-26 | Build the app and start listening. The arrow function runs once the server is ready. |

### `src/app.js`: assembling the application

| Lines | Explanation |
|---|---|
| 8 | `createApp` is a **function** instead of code that runs immediately. That lets tests create an app with a test database and a fixed date (dependency injection). |
| 10 | `today` is a *function*. In real use it's `localToday`; tests pass `() => '2026-10-01'`. |
| 13-15 | **Middleware** runs on *every* request, in order: read JSON, find the logged-in user, serve files from `public/`. |
| 18-22 | Each route file is a function that receives `db` and returns a router. `app.use('/api/teacher', …)` means "requests starting with /api/teacher go here". |
| 25 | Any `/api/...` address that no router answered gets a 404. |
| 28-33 | An **error-handling middleware** has 4 parameters. Bad JSON gives 400, a too-large body gives 413, and anything unexpected gives 500 with a generic message. The real details are logged, never shown to users. |

### `src/db.js`: the database

| Lines | Explanation |
|---|---|
| 4 | `DatabaseSync` is SQLite built into Node 22. "Sync" means each query finishes before the next line runs. |
| 8-65 | The schema. `PRIMARY KEY AUTOINCREMENT` gives each row a unique id. `REFERENCES` creates a foreign key. `CHECK (role IN (…))` refuses any other value. `UNIQUE (project_id, user_id)` makes a second request by the same student impossible. |
| 22 | `password_hash` may be NULL, meaning "added by the principal but not activated yet". |
| 24 | `UNIQUE (school_id, login_id)`: two schools can both have an "S1001", but one school can't have two. |
| 70-72 | Open the file, switch foreign-key checking on (SQLite has it off by default), and create any missing tables. |

### `src/auth.js`: security

| Lines | Explanation |
|---|---|
| 8-14 | **Hashing.** A random *salt* is generated, then `scrypt(password, salt)` is computed. Only `salt:hash` is stored. You can't reverse a hash to get the password back. |
| 17-25 | **Checking.** Split the stored value, hash the typed password with the *same* salt, and compare. `timingSafeEqual` always takes the same time, so attackers can't measure how many bytes matched. |
| 28-34 | **Sessions.** 32 random bytes is 64 hex characters, so the token is practically impossible to guess. It's saved with an expiry time 8 hours ahead. |
| 37-46 | Turns `"a=1; cas_session=abc"` into `{ a: '1', cas_session: 'abc' }`. `indexOf('=')` finds the first `=`, and `slice` cuts the text into name and value. |
| 49-65 | `loadUser(db)` **returns a function** (middleware). The SQL only finds the user if the token matches, hasn't expired, the user is active, *and* their school is active. Line 62: if there's no token, `req.user` is `null`. |
| 69-77 | `requireRole('teacher')` returns a middleware that answers 401 (not logged in) or 403 (wrong role), or calls `next()` to let the route run. |
| 80-89 | `publicUser` picks only safe fields, so the password hash is never sent to the browser. |

### `src/dates.js`

| Lines | Explanation |
|---|---|
| 7 | The pattern for "4 digits - 2 digits - 2 digits". |
| 12 | Wrong type or wrong shape: not valid. |
| 14 | The `Z` means UTC, so the time zone can't move the date to the day before. |
| 17 | **The clever bit.** `new Date('2026-02-30')` silently becomes 2 March. Converting back to text and comparing with the original catches impossible dates. |
| 21-25 | Add days using UTC, which handles month and year ends (31 Dec + 1 = 1 Jan). |
| 28-33 | Today's date in *local* time. `padStart(2, '0')` turns `9` into `09`. |
| 37-39 | **Overlap test.** Two ranges overlap unless one ends before the other starts. Written positively: A starts on or before B ends, *and* B starts on or before A ends. Because dates are `YYYY-MM-DD` text, `<=` compares them correctly. |

### `src/validation.js`

| Lines | Explanation |
|---|---|
| 10-14 | `cleanText` trims and squashes spaces, then checks the length. It returns the clean text or `null`. |
| 17-20 | `Number('4.5')` is 4.5, and `Number.isInteger(4.5)` is false, so it's rejected. `Number('abc')` is NaN and is rejected too. |
| 23-28 | Password rules, each with its own message. `/[A-Za-z]/` = "contains a letter", `/\d/` = "contains a digit". |
| 31-36 | School IDs are upper-cased so that `s1001` and `S1001` are the same. Only letters and digits are allowed. |
| 40-92 | `validateProject` pushes **every** problem into `errors` instead of stopping at the first. Lines 59-66 check the date order only when all three dates are real; otherwise those comparisons would be meaningless. It returns both the errors and the cleaned values. |

### `src/search.js`: Algorithm 1

| Lines | Explanation |
|---|---|
| 6-14 | `normalise` is a chain of string methods, each acting on the result of the previous one. `'NFD'` splits "é" into "e" plus a separate accent character. The next line deletes all accent characters (Unicode range U+0300–U+036F). |
| 19-30 | `scoreProject`: +3 for each word found in the title, +1 if found elsewhere. If a word is missing everywhere, it returns 0 straight away (an AND search). `includes` finds partial words ("foot" in "football"). |
| 40 | `"Beach  Clean"` becomes `"beach clean"`, then `["beach", "clean"]`. `filter(Boolean)` removes empty strings, so a blank search gives `[]`. |
| 42-49 | One pass over all projects. Each `continue` skips a project that fails a filter. Matching projects are copied with their score. |
| 51 | **Two-level sort.** `b.score - a.score` puts the highest score first. When scores tie it is `0`, which is falsy, so `\|\|` moves on to comparing start dates alphabetically, which for `YYYY-MM-DD` is the same as by date. |

**Worked example.** The query is `"clean"`. The projects are *Juhu Beach Clean-Up Drive* (title contains "clean") and *School Mural Painting*, whose description mentions "clean oceans".

| Project | normalised title | "clean" in title? | in rest? | score |
|---|---|---|---|---|
| Juhu Beach… | `juhu beach clean up drive` | yes | – | 3 |
| School Mural… | `school mural painting` | no | yes | 1 |

After sorting, the order is Juhu (3), then Mural (1). This is exactly what test T08 checks.

### `src/joinRules.js`: Algorithm 2

| Lines | Explanation |
|---|---|
| 8-16 | `findClash` loops over the student's commitments and returns the **first** clashing project (so the message can name it), or `null`. |
| 27 | The parameter `{ project, user, role, … }` is **destructured**: the caller passes one object and the function gets named variables. |
| 29-61 | Eight rules, each with an early `return`. The order matters: "not found" comes before "deadline passed", so a hidden project never reveals any detail about itself. |
| 38 | The rule added after test T22 found a privacy bug (see Criterion D4). |
| 54 | `` `cap_${role}` `` builds the column name, so `role = 'volunteer'` reads `project.cap_volunteer`. |
| 55 | `counts[role] \|\| 0` treats a missing count as 0. `>=` means "the last place is still allowed; once full, refuse". |

### `src/statusFlow.js` and `src/casRecord.js`: Algorithms 3 and 4

- statusFlow.js:8-14: each state lists where it can go next. Line 18: `TRANSITIONS[from] || []` means an unknown state gets an empty list, so `includes` is false.
- casRecord.js:7: all totals start at 0, so every strand shows even with no activities.
- casRecord.js:11: `rows.slice()` copies the array before sorting, because `sort` changes the array it is called on.
- casRecord.js:16-20: only completed projects add hours. `totals[row.strand]` uses the strand name as the key.

### `src/routes/*.js`: the API

Every route follows the same pattern, so once you understand one you understand them all:

```js
router.post('/path/:id', requireRole('role'), (req, res) => {
  // 1. read input:     req.params.id, req.body.something, req.user
  // 2. load data:      db.prepare('SELECT … WHERE id = ?').get(id)
  // 3. check rules:    if (bad) return res.status(4xx).json({ error: 'why' });
  // 4. change data:    db.prepare('UPDATE/INSERT …').run(…)
  // 5. answer:         res.status(200 or 201).json({ message or data })
});
```

| Status code | Meaning here |
|---|---|
| 200 / 201 | OK / created |
| 400 | Your input is invalid |
| 401 | Not logged in |
| 403 | Logged in, but your role can't do this |
| 404 | Doesn't exist, *or* you aren't allowed to know it exists |
| 409 | Valid input, but it conflicts with the current state (full, duplicate, wrong status) |
| 413 | Request too large |

Points worth knowing:

- `projectRoutes.js:16-39`: the queries are **prepared once** and reused, which is faster than preparing them on every request.
- `projectRoutes.js:34-39`: `UNION` combines two queries. The schedule is "projects I'm accepted into" plus "projects I created".
- `projectRoutes.js:58-85` (search): first SQL picks only the projects you may see, then `searchProjects` ranks them, then one `GROUP BY` query counts members for *all* projects at once instead of one query per project.
- `projectRoutes.js:152-177` (accept/reject): capacity and clashes are **re-checked** at the moment of accepting.
- `teacherRoutes.js`: `router.use(requireRole('teacher'))` protects every route in the file with one line.
- `principalRoutes.js` / `adminRoutes.js`: removal is a **soft delete** (`is_active = 0`), and the person's sessions are deleted so they're logged out immediately.

### `public/app.js`: the browser side

| Lines | Explanation |
|---|---|
| 4-5 | Two pieces of state: who is logged in, and the `<main>` element that screens are drawn into. |
| 11-21 | `api()` is the only place that talks to the server. If `response.ok` is false (status 400 or above), it **throws** an Error carrying the server's reason. |
| 25-28 | `esc()` replaces `< > & " '` with HTML entities, so user text can never become HTML or script (XSS protection). Every `${…}` holding user data goes through `esc`. |
| 32-39 | `showMessage` uses `textContent`, which is always safe, and hides the message after 6 s. |
| 42-44 | `FormData` reads every named input of a form, and `Object.fromEntries` turns it into an object. |
| 56-61 | Which menu links each role sees. |
| 79-99 | **The router.** `location.hash` is the part after `#`. `"#/project/5".split('/')` is `["#", "project", "5"]`, and the leading comma in `[, page, id]` skips the first item. Logged-out users only see login or activate. Pages not allowed for your role send you to your home screen. |
| 108-131 | Login form. `event.preventDefault()` stops the browser's normal reload so JavaScript can send the data. |
| 182-209 | Search screen. `URLSearchParams` turns `{ q: 'beach', strand: '' }` into `q=beach&strand=`. |
| 213-273 | Project screen. It shows Join buttons only if you're a student, not the creator, not already requested, and the project is open. Full roles get `disabled`. The creator sees Accept/Reject. |
| 351-395 | Teacher screen. `nextStep` mirrors statusFlow.js, so only the valid next button appears. Rejecting asks for a reason with `prompt()`. |
| 488-494 | Start-up. Redraw whenever the hash changes, then ask the server "who am I?" (the cookie may still be valid) and draw the first screen. |

### `tests/`: how to read a test

```js
test('T23 (SC5) … capacity can never be exceeded', () => withServer(async ({ request, login }) => {
  const diya = await login(GREENWOOD, 'S1002');                     // get a session cookie
  ...
  assert.equal(full.status, 409);                                    // the check: actual vs expected
}));
```

`withServer` starts a fresh server with a brand-new in-memory database for each test, then closes it, so tests can't affect each other. `assert.equal(a, b)` fails the test if `a !== b`.

## Part 6: Things to try (to prove to yourself you understand it)

1. Change the title weight in search.js:25 from `3` to `1`. Run `npm test`. Which test fails, and why?
2. Delete rule 8 (joinRules.js:58-61). Which tests fail?
3. Add a new strand-independent rule, for example "a student can have at most 3 pending requests". Write the rule in `joinRules.js`, pass the count in from `projectRoutes.js`, and add a test.
4. In the browser, open DevTools → Network and watch the requests while you use the app.

## Part 7: Viva questions your teacher might ask

**Why JavaScript on both sides?** One language for client and server. JSON is JavaScript's native data format. The same date-string conventions work everywhere.

**Why not store the password itself?** If the database leaked, every password would be exposed. A salted scrypt hash can't be reversed, and the salt means identical passwords get different hashes.

**What stops a student from calling the teacher API directly?** `requireRole('teacher')` on the server. Hiding the buttons in the browser is only for convenience; the server is the real guard. Test T17 calls the API directly and gets 403.

**What is SQL injection and how is it prevented?** It means typing SQL into a form so that it becomes part of a query. Every query here uses `?` placeholders, so typed text is always treated as data.

**How does the clash check work?** Two ranges overlap when `startA <= endB && startB <= endA`. The system checks the new project against every approved or ongoing project the student is accepted into or created.

**Why re-check capacity when accepting?** Two students can both request the last place. The places are only "taken" on acceptance, so the second acceptance must be refused (T23).

**Why "not found" instead of "forbidden" for pending projects?** So other students can't even confirm that a hidden project exists. This was a real bug that testing caught (T22).

**What is the time complexity of search?** O(n) to scan n projects, plus O(k log k) to sort the k matches. In practice that's 46 ms for 20,000 projects.

**What would you improve?** See Criterion E. Examples: notifications when a request is decided, PostgreSQL for many schools at once, password reset, and digital certificates generated from the CAS record.
