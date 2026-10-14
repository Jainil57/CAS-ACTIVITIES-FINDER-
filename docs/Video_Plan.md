# Video plan (max. 5 minutes, organised by success criteria)

The video must show **full functionality and examples of testing**. Record at 1280×800 or larger, zoom the browser to 125%, and say the SC number aloud as you reach each one.

| Time | Show | SC |
|---|---|---|
| 0:00–0:30 | Principal (P100) adds `S1005`; the new student activates and logs in; a wrong password shows the error | SC7, SC1 |
| 0:30–1:15 | Student searches `CLEAN`, filters by strand, chooses "Other schools only", opens a project | SC2 |
| 1:15–2:00 | Create project: deadline after start → refused with reasons; fix → "pending"; teacher (T200) approves → appears in search | SC3, SC6 |
| 2:00–2:50 | Rizky joins the mural; a second click is refused (duplicate); Putri joins the futsal league → date-clash message; Aarav accepts/rejects on the beach project; a full role refused | SC4, SC5 |
| 2:50–3:30 | Teacher: reject with a reason, mark started, deadline after the start date refused | SC6 |
| 3:30–4:00 | CAS record (Aarav) and the print preview | SC8 |
| 4:00–4:30 | Student types `/api/teacher/projects` in the address bar → 403; project title `<img src=x onerror=alert(1)>` shown as text; stop and restart the server → data still there | SC9, SC10 |
| 4:30–5:00 | Run `npm test` → 29 passing | all |

Tip: run `npm run seed` just before recording so the demo data is fresh.
