# Criterion A: Problem specification

## A1. The problem

At Gandhi Memorial International School (GMIS), Jakarta, CAS opportunities are shared through WhatsApp groups and posters. Messages get buried, so students miss projects, organizers can't find volunteers, and changes don't reach everyone. There is no shared place to find interschool activities, and no record of each student's CAS hours.

The users are IBDP students (participants, volunteers, organizers), CAS supervisors, principals, and a service provider that runs the platform for several schools. It must be free, work on laptops and phones, and keep each school's data private.

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

A web application suits the problem because users only need a browser. JavaScript (Node.js and Express) runs on both server and browser, so one language and one data format (JSON) cover the whole system. Java, my first idea, or Python with Flask would add a second language.

MySQL stores the data. A Google Form cannot enforce rules such as capacity limits, and SQLite allows only one writer at a time. MySQL supports many users at once, constraints, and transactions that stop two people taking the last place (SC5).
