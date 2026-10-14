# CAS Activities Finder

CAS project finder for IBDP schools in Jakarta (GMIS). Node.js, Express and MySQL.

## Run

1. Install Node.js 18 or newer (nodejs.org) and MySQL 8 (dev.mysql.com/downloads, "MySQL Installer" on Windows).
2. Open `config.js` and put in your MySQL username and password. The database `cas_finder` is created automatically.
3. In this folder run `npm install`, then `npm start`.
4. Open http://localhost:3000

Demo password: `Password1`. Logins: GMIS `S1001` (student), `T200` (teacher), `P100` (principal, Dr. Manish Semwal); Service provider `ADMIN`.

`npm test` runs the 30 tests (it makes and deletes temporary `cas_test_...` databases). `npm run seed` resets the demo data.
