# How the code works (study guide)

This guide is for you, not for the examiner. Use it to learn the code well enough to explain any part of it to your teacher.

## 1. Run it on your laptop

1. Install **Node.js 18 or newer** from nodejs.org (the "LTS" version is fine).
2. Install **MySQL 8** (on Windows use "MySQL Installer" from dev.mysql.com). Remember the root password you choose.
3. Unzip the project and open `config.js`. Put your MySQL username (usually `root`) and password there.
4. Open a terminal in the folder. Type `npm install` (only once), then `npm start`. The `cas_finder` database and its tables are created for you, and demo data is added.
5. Open http://localhost:3000 in your browser.
6. Optional: `npm test` runs the 30 tests, and `npm run seed` resets the demo data.

If `npm start` says it can't connect, check that MySQL is running and that the password in `config.js` is right.

Every demo account uses the password `Password1`.

| School | ID | Who | Role |
|---|---|---|---|
| Gandhi Memorial International School | `S1001` | Aarav Shah | student |
| Gandhi Memorial International School | `S1002` | Putri Wijaya | student (shows the date-clash message) |
| Gandhi Memorial International School | `S1003` | Rizky Pratama | student |
| Gandhi Memorial International School | `S1004` | Nadia Kusuma | not activated yet; use "Activate your account" |
| Gandhi Memorial International School | `T200` | Mr. Vikram Mehta | teacher (CAS coordinator) |
| Gandhi Memorial International School | `P100` | Dr. Manish Semwal | principal |
| Senayan IB Academy | `S2001`, `S2002` | Bima Santoso, Ayu Lestari | students at another school |
| Service provider | `ADMIN` | Service Provider | admin |

## 2. The big picture

The app has three parts:

1. **The browser** (`public/`) shows the screens.
2. **The server** (`server.js` and `src/`) checks the rules.
3. **The MySQL database** (`cas_finder`) stores everything.

The browser never touches the database directly. It sends a request such as *"POST /api/projects/2/join"*. The server checks who you are and whether you're allowed, then reads or writes the database. Finally it sends back either data or `{ error: "the reason" }`.

| File | Job |
|---|---|
| `config.js` | Your MySQL username and password |
| `server.js` | Starts everything |
| `src/app.js` | Connects all the parts |
| `src/db.js` | The database tables |
| `src/auth.js` | Passwords, logins, roles |
| `src/validation.js`, `src/dates.js` | Checks what users type |
| `src/search.js` | Algorithm 1: search and ranking |
| `src/joinRules.js` | Algorithm 2: may this student join? |
| `src/statusFlow.js` | Algorithm 3: pending → approved → ongoing → completed |
| `src/casRecord.js` | Algorithm 4: CAS hours totals |
| `src/routes/` | One file per type of user (the API) |
| `public/app.js` | Draws every screen in the browser |
| `tests/` | Tests T01–T30 |

## 3. JavaScript you need to know

| Code | Meaning |
|---|---|
| `const x = 5` / `let y = 0` | `const` can't change; `let` can. |
| `` `Hi ${name}` `` | A string with a value placed inside it. |
| `(a, b) => a + b` | A short way to write a function. |
| `const { a, b } = obj` | Take `a` and `b` out of an object. |
| `{ ...project, score }` | Copy an object and add a field to it. |
| `a ?? b` | Use `a`, or `b` if `a` is missing. |
| `cond ? x : y` | If `cond` then `x`, otherwise `y`. |
| `list.map`, `list.filter`, `list.includes`, `list.sort` | Change each item; keep some items; check if an item is there; sort the list. |
| `/^\d{4}-\d{2}-\d{2}$/` | A regular expression: a pattern for "YYYY-MM-DD". |
| `require(...)`, `module.exports` | Use code from another file; share code with other files. |
| `async` / `await` | Wait for something slow (like the server) without freezing the page. |
| `try { } catch (err) { }` | If something fails inside `try`, run `catch`. |

## 4. One click, followed through every file

**Scenario:** Rizky clicks **"Join as volunteer"** on the Batik Mural Painting project.

1. **`public/app.js` → `showProject()`.** Each Join button got an `onclick` function when the page was drawn.
2. That function calls `api('POST', '/api/projects/2/join', { role: 'volunteer' })`.
3. **`api()`** turns the object into JSON and sends it with `fetch`. The browser adds Rizky's login cookie automatically.
4. **`src/app.js`.** `express.json()` reads the body. `loadUser()` (in `auth.js`) uses the cookie to find out that this is Rizky.
5. **`projectRoutes.js` → the `/projects/:id/join` route.** `requireRole('student')` checks that Rizky is a student.
6. The route loads the project and gathers what the rules need: Rizky's earlier request, the places taken and Rizky's other projects.
7. **`joinRules.js` → `checkJoinRequest()`** checks 8 rules in order. All pass, so it returns `{ ok: true }`.
8. The route saves a `pending` request and replies `201` with a message.
9. Back in the browser, a green message appears and the page redraws.

If a rule fails (say the deadline has passed), step 7 returns the reason. The server replies `409 { error: "The application deadline has passed." }`. `api()` throws an error, and the screen shows the reason in red.

## 5. Each file explained

### `server.js`
Connects to MySQL using `config.js`. On the very first run it fills the database with demo data (`seedDemo`), deletes expired logins, and starts the web server on port 3000. Because talking to MySQL takes time, the code uses `async`/`await`.

### `config.js`
Holds the MySQL host, port, username, password and database name. Change it to match your laptop.

### `src/app.js` → `createApp(db, options)`
- `createApp` is a function, so the tests can build an app with a test database and a fixed date.
- `app.use(...)` lines run on every request: read JSON, find the logged-in user, serve the `public/` files.
- Each route file handles one group of addresses, for example `/api/teacher`.
- The last handler catches errors. Bad JSON gets 400, too big gets 413, anything else gets 500. Users never see the technical details.

### `src/db.js`
- **`createDb(config)`**: creates the `cas_finder` database if it's missing, then creates the five tables (schools, users, projects, memberships, sessions).
- `AUTO_INCREMENT PRIMARY KEY` gives each row its own number. `FOREIGN KEY ... REFERENCES` links tables together.
- `ENUM(...)` only allows certain values, for example the three strands.
- `DATE` columns are returned as `"YYYY-MM-DD"` text (`dateStrings: true`), so dates can be compared like strings.
- **`db.get`** returns one row, **`db.all`** returns all rows, and **`db.run`** is for INSERT, UPDATE and DELETE. Every call needs `await`.
- **`db.transaction`** runs several queries as one unit. Either all of them are saved, or none are if something fails.
- `UNIQUE (project_id, user_id)` means a student can only ask once per project.
- `password_hash` is empty until the student activates the account.

### `src/auth.js`
- **`hashPassword`**: makes a random *salt* and stores `salt:scrypt(password)`. The real password is never saved.
- **`verifyPassword`**: hashes the typed password with the same salt and compares the result.
- **`createSession`**: makes a long random token and saves it with an expiry time 8 hours ahead.
- **`loadUser`**: finds the user from the cookie on every request.
- **`requireRole('teacher')`**: blocks anyone else. Not logged in gives 401; wrong role gives 403.
- **`publicUser`**: only safe fields are sent to the browser, never the password hash.

### `src/dates.js`
- **`isValidDate`**: JavaScript quietly turns 30 February into 2 March, so the function converts the date back to text and checks it hasn't changed.
- **`localToday`**: uses Jakarta time (WIB), not UTC. Before 7 a.m. UTC still thinks it's yesterday.
- **`datesOverlap`**: two date ranges overlap if `startA <= endB && startB <= endA`.

### `src/validation.js`
- **`cleanText`**: trims spaces and checks the length.
- **`toWholeNumber`**: rejects `4.5` and `abc`.
- **`passwordProblem`**: at least 8 characters, with a letter and a number.
- **`cleanLoginId`**: turns `s1001` into `S1001`.
- **`AREAS`**: the Jakarta / Jabodetabek areas a school can be in. **`MAX_FEE`**: Rp 10.000.000.
- **`validateProject`**: collects **all** the errors in the form, not just the first one. It checks that today ≤ deadline ≤ start date ≤ end date.

### `src/search.js` (Algorithm 1)
- **`normalise`**: lower-cases the text and removes accents and punctuation, so `"Café Clean-Up!"` becomes `"cafe clean up"`.
- **`scoreProject`**: each search word found in the title gives +3, and found anywhere else gives +1. If any word is missing completely, the score is 0. The "anywhere else" text includes the school's area, so "jakarta selatan" works.
- **`searchProjects`**: skips projects that fail a filter (strand, school, still open), scores the rest, then sorts them. The highest score comes first; if two scores are equal, the project starting soonest comes first.

Example search for `clean`:

| Project | "clean" in title? | Elsewhere? | Score |
|---|---|---|---|
| Ancol Beach Clean-Up Drive | yes | – | 3 |
| Batik Mural Painting (test data says "clean oceans") | no | yes | 1 |

### `src/joinRules.js` (Algorithm 2)
- **`findClash`**: returns the first of the student's projects whose dates overlap, or `null`.
- **`checkJoinRequest`** checks 8 rules, one after another:
  1. valid role;
  2. own school or an interschool project;
  3. project not hidden or closed;
  4. not your own project;
  5. no request already;
  6. deadline not passed;
  7. a place is free;
  8. no date clash.
- `` project[`cap_${role}`] `` picks the right capacity, for example `cap_volunteer`.

### `src/statusFlow.js` (Algorithm 3)
A table lists where each status may go next, and `canMove(from, to)` checks it. Skipping a stage or going backwards is refused.

### `src/casRecord.js` (Algorithm 4)
Sorts the student's projects by date and adds up hours per strand. Only *completed* projects count.

### `src/routes/` (the API)
Every route follows the same steps: read the input, load data, check the rules (send an error if one fails), save, reply.

| Code | Meaning |
|---|---|
| 200 / 201 | OK / created |
| 400 | Your input is wrong |
| 401 | Not logged in |
| 403 | Your role can't do this |
| 404 | Not found (or you're not allowed to know it exists) |
| 409 | Clashes with the current state (full, duplicate, wrong stage) |

- **Accepting a request** re-checks capacity and clashes, because the situation may have changed since the student asked. It runs inside a transaction, and `SELECT ... FOR UPDATE` *locks* the row. If two people click Accept for the last place at the same moment, the second has to wait and then sees that the place is gone. Test T30 checks this: without the lock it failed 4 times out of 5.
- **Removing** a user or school sets `is_active = 0` (a soft delete). Their CAS history stays, and they're logged out immediately.

### `public/app.js` (the browser)
- **`api()`**: the only function that talks to the server.
- **`esc()`**: makes user text safe, so a title like `<script>` shows as text and never runs.
- **`rupiah()`**: turns `50000` into `Rp 50.000`. **`todayLocal()`**: today's date in WIB.
- **`router()`**: reads the part of the address after `#` (for example `#/project/5`) and draws that screen.
- **`showLogin`, `showBrowse`, `showProject`, `showCreate`, `showMine`, `showRecord`, `showTeacher`, `showMembers`, `showSchools`**: one function per screen.

### `tests/`
`withServer` makes a new temporary MySQL database (`cas_test_...`) and server for each test, and deletes the database afterwards. `assert.equal(actual, expected)` fails the test if the two values differ.

## 6. Try these

1. In `scoreProject`, change `score += 3` to `score += 1`, run `npm test`, and work out which test fails and why.
2. Delete rule 8 in `checkJoinRequest`. Which tests fail?
3. Add a rule: "a student can have at most 3 pending requests". Add a test for it too.

## 7. Questions your teacher might ask

- **Why JavaScript for everything?** One language on both sides, and JSON is built into JavaScript.
- **Why hash passwords?** If the database leaked, nobody could read the passwords.
- **What stops a student from using teacher features?** `requireRole` on the server. Hiding buttons in the browser isn't enough on its own.
- **What is SQL injection?** Typing SQL into a form to break a query. The `?` placeholders stop it.
- **How does the clash check work?** `startA <= endB && startB <= endA`.
- **Why re-check places when accepting?** Two students can ask for the last place; only one can be accepted.
- **What does `FOR UPDATE` do?** It locks the row until the transaction ends, so two acceptances can't happen at exactly the same time.
- **Why MySQL?** It's a real database server that many users can use at once, and it supports transactions and foreign keys.
- **Why "not found" for pending projects?** So other students can't tell that a hidden project exists. Test T22 found this bug.
- **How fast is search?** It looks at each project once (O(n)) and then sorts the matches. 20,000 projects take well under a second.
