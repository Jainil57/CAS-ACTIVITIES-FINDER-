# Criterion C: System overview

*CAS Activities Finder · success criteria SC1–SC10 as defined in Criterion A*

## C1. System model

The product is a three-tier JavaScript web application (Figure C1). It is designed for IBDP schools in Jakarta, starting with GMIS. The browser shows a single page whose screens are drawn by `app.js`. The Express server authenticates each request, applies the rules, and is the only tier that touches the MySQL database (Figure C2). Rules are kept in pure-function modules (Figure C3) so that each one can be tested on its own.

![Figure C1 – Architecture](images/c1-architecture.png)
*Figure C1: Architecture, modules and API route groups.*

![Figure C2 – Entity-relationship diagram](images/c2-erd.png)
*Figure C2: Database model. MEMBERSHIPS links students and projects (many-to-many); UNIQUE(project_id, user_id) blocks duplicate requests.*

![Figure C3 – Module interface diagram](images/c7-modules.png)
*Figure C3: Module interfaces.*

## C2. Algorithms

```
// Algorithm 1 — search and rank (SC2). Input: projects the user may see (filtered by SQL first).
FUNCTION normalise(text)
    RETURN lower case of text, accents removed, non-letters/digits → space, repeated spaces → one, trimmed

FUNCTION searchProjects(projects, query, strand, scope, openOnly, mySchool, today)
    words ← split(normalise(query), " ") without empty strings
    results ← empty list
    LOOP FOR EACH p IN projects
        IF strand ≠ "" AND p.strand ≠ strand THEN CONTINUE
        IF scope = "mine"  AND p.school ≠ mySchool THEN CONTINUE
        IF scope = "other" AND p.school = mySchool THEN CONTINUE
        IF openOnly AND p.applyDeadline < today THEN CONTINUE
        IF words is empty THEN score ← 1
        ELSE
            score ← 0
            LOOP FOR EACH w IN words
                IF w is inside normalise(p.title)           THEN score ← score + 3
                ELSE IF w is inside normalise(p.otherText)  THEN score ← score + 1
                ELSE score ← 0; EXIT LOOP                     // every word must appear
        IF score > 0 THEN append (p, score) to results
    SORT results BY score DESC, THEN startDate ASC
    RETURN results
```

![Figure C4 – Join rules flowchart](images/c5-join-flowchart.png)
*Figure C4: Algorithm 2, join-request rules (SC4). Ranges clash when startA ≤ endB AND startB ≤ endA. Accepting a request (SC5) re-runs the capacity and clash checks.*

![Figure C5 – Join sequence](images/c6-sequence.png)
*Figure C5: A join request passing through the three tiers.*

![Figure C6 – State diagram](images/c4-state.png)
*Figure C6: Algorithm 3, project life-cycle (SC6), stored as a table of allowed next states.*

```
// Algorithm 4 — CAS record (SC8). rows = projects the student created or was accepted into.
FUNCTION buildCasRecord(rows)
    totals ← {Creativity: 0, Activity: 0, Service: 0, all: 0};  completed ← 0
    entries ← copy of rows SORTED BY startDate ASC
    LOOP FOR EACH r IN entries
        IF r.status = "completed" THEN
            totals[r.strand] ← totals[r.strand] + r.hours;  totals.all ← totals.all + r.hours;  completed ← completed + 1
    RETURN entries, totals, completed

// Algorithm 5 — authentication and authorisation (SC1, SC9)
ACTIVATE(id, password):  IF id on roster AND not activated AND password strong
                         THEN store salt + ":" + scrypt(password, salt)          // salt = 16 random bytes
LOGIN(id, password):     IF scrypt(password, storedSalt) equals storedHash (constant-time)
                         THEN token ← 32 random bytes; save (token, user, now + 8 h); set HttpOnly cookie
EVERY REQUEST:           user ← session WHERE token = cookie AND not expired AND user and school active
                         IF route needs a role: no user → 401; role not allowed → 403
```

## C3. User interface design

![Figure C7 – Navigation map](images/c3-navigation.png)
*Figure C7: Screens per role.*

![W1](images/c8-wireframe-w1.png)
![W2](images/c8-wireframe-w2.png)
![W3](images/c8-wireframe-w3.png)
![W4](images/c8-wireframe-w4.png)
![W5](images/c8-wireframe-w5.png)
![W6](images/c8-wireframe-w6.png)
*Figures W1–W6: Wireframes, annotated with the success criterion each serves.*

## C4. Testing strategy

**Structural tests** call each algorithm directly. **Functional tests** use the running app through HTTP, one or more per success criterion. Each covers valid, extreme and invalid data. All tests are automated with Node's test runner, and the observed results are recorded in D4.

| ID / SC | Input / test step | Expected result | Type |
|---|---|---|---|
| T01 / SC3 | dates 2028-02-29; 2026-02-30; "14/10/2026" | valid; rejected; rejected | Structural, valid/invalid |
| T02 / SC4 | two ranges sharing one day; ranges touching the next day | clash; no clash | Structural, extreme |
| T04–05 / SC3 | title 5 and 80 chars; 4 and 81 chars; deadline today; yesterday | accepted; rejected; accepted; rejected | Structural, extreme |
| T06 / SC3 | hours 4.5; fee Rp 10.000.001; empty form | rejected; rejected; every error listed | Structural, invalid |
| T08 / SC2 | search "CLEAN"; "cafe" for "Café" | title match ranked first; accent ignored | Structural, valid |
| T12 / SC4 | apply on deadline day; one day late; last place; full role | accepted; refused; accepted; refused | Structural, extreme |
| T16 / SC1 | wrong password; unknown ID | same 401 message; only a hash stored | Functional, invalid |
| T18 / SC2 | GMIS student searches; "jakarta selatan" | own and interschool projects only; Senayan futsal | Functional, valid |
| T19 / SC3 | submit a project, then search as another student | saved as pending and not shown | Functional, valid |
| T21 / SC6 | complete a pending project; reject without a reason | refused | Functional, invalid |
| T22 / SC4 | join own project; pending project; clashing dates | refused with a reason | Functional, invalid |
| T30 / SC5 | two acceptances for the last place at the same moment | only one accepted | Functional, extreme |
| T24 / SC8 | record with completed and ongoing projects | only completed hours counted | Functional, valid |
| T25 / SC7 | principal removes a student, who then logs in | login refused | Functional, invalid |
| T17 / SC9 | student calls a teacher route; title `<img onerror>` | 403; shown as text | Functional, invalid |
| T27 / SC10 | restart the server | data and login kept | Functional, valid |
| T28 / SC2 | search among 2,000 projects | under 1 second | Functional, extreme |
