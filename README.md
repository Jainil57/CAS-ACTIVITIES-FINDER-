# CAS Activities Finder

A web platform for **IBDP schools in Jakarta**, starting with Gandhi Memorial International School (GMIS), where students **find, join and organise CAS projects**, CAS coordinators **approve and track** them, and every student gets an automatic **CAS record**. It was built for the IB Diploma Computer Science Internal Assessment (first assessment May 2027) and is written entirely in **JavaScript**: Node.js and Express on the server, plain JavaScript in the browser, and SQLite for storage.

## Run it

Requires **Node.js 22.5+**.

```bash
npm install
npm start            # http://localhost:3000 (demo data is added on first run)
npm test             # 29 automated tests (T01–T29)
npm run seed         # reset to fresh demo data
```

Demo password for every account: `Password1`. Example logins:

- Gandhi Memorial International School (GMIS) → `S1001` (student)
- GMIS → `T200` (teacher)
- GMIS → `P100` (principal)
- Service provider → `ADMIN`

The full list is in [docs/CODE_WALKTHROUGH.md](docs/CODE_WALKTHROUGH.md).

## Who can do what

| Role | Features |
|---|---|
| Student | search projects (own school + interschool); create a project; join as participant, volunteer or organizer; accept/reject requests for own projects; printable CAS record |
| Teacher (CAS coordinator) | approve/reject projects, mark them started or completed, change application deadlines |
| Principal / Head of CAS | add and remove students and teachers of their school |
| Service provider | add and remove schools (each in a Jabodetabek area such as Jakarta Pusat or Tangerang), assign principals |

## IA documents

- [docs/00_Updated_Success_Criteria.md](docs/00_Updated_Success_Criteria.md): measurable SC1–SC10 to use in Criterion A
- [docs/Criterion_C_System_Overview.md](docs/Criterion_C_System_Overview.md): system model, algorithms, UI design, test plan
- [docs/Criterion_D_Development.md](docs/Criterion_D_Development.md): functionality, techniques, evaluated decisions, testing, video plan
- [docs/IA_Criteria_C_and_D.docx](docs/IA_Criteria_C_and_D.docx): the same two criteria as a Word document
- [docs/CODE_WALKTHROUGH.md](docs/CODE_WALKTHROUGH.md): line-by-line explanation of the code (study guide, not for submission)

Diagram sources are in `docs/diagrams/*.mmd` (Mermaid), and the wireframes are in `docs/wireframes/wireframes.html`.
