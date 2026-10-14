# Criterion A: Problem specification

## A1. The problem

At Gandhi Memorial International School (GMIS), Jakarta, CAS opportunities are shared through WhatsApp groups and posters. Students miss projects, organizers struggle to find volunteers, and changed dates or fees don't reach everyone. Jakarta's IBDP schools also run interschool activities, but there is no shared place to find them and no single record of each student's CAS activities.

The users are IBDP students (participants, volunteers, organizers), CAS supervisors, the principal, and a service provider running the platform for several schools.

## A2. Success criteria

| # | Success criterion |
|---|---|
| SC1 | Students added by the principal activate an account once (8+ characters, a letter and a number) and log in. Wrong details are refused. Passwords are stored hashed. |
| SC2 | Search own-school and interschool projects by keyword, strand, school and open deadline. Title matches come first. 2,000 projects in under 1 s. |
| SC3 | Create a project; invalid data is refused with every error listed. New projects stay hidden until approved. |
| SC4 | Join as participant, volunteer or organizer. Duplicates, own or closed projects, passed deadlines, full roles and date clashes are refused with a reason. |
| SC5 | The creator accepts or rejects requests. Places are never exceeded. |
| SC6 | The supervisor approves or rejects (with a reason), marks projects ongoing and then completed, and changes deadlines. |
| SC7 | The principal manages their school's students and teachers; the service provider manages schools and principals. |
| SC8 | A printable CAS record shows hours per strand from completed projects. |
| SC9 | Each role can only use its own functions. User text is shown safely. |
| SC10 | Data and logins survive a server restart. |

## A3. Computational context

The solution is a web application, so users only need a browser. JavaScript is used for both the server (Node.js with Express) and the browser, so one language and one data format (JSON) cover the whole system. MySQL stores the data because many users can use it at once, and its foreign keys, UNIQUE constraints and transactions keep the data correct, for example by stopping two people from taking the last place (SC5).
