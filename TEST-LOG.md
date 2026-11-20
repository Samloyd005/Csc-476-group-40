# TEST LOG — DLC Team Collaboration Platform
Tested: 10 November 2026, on this machine (Node v24.22.1, npm 10.9.4).
Server: `node server.js` on port 3000. All tests run against a live server;
test data was deleted afterwards so the repo ships clean (demo accounts
re-seed automatically on first run).

## Setup
- `npm install` — PASS. 122 packages added in ~18 s. One warning only:
  `multer@1.4.5-lts.2` deprecated, vulnerabilities patched in 2.x
  (noted as a future upgrade; 1.x works).
- Server start — PASS. Log: `DLC Collaboration Platform running on http://localhost:3000`.

## Endpoint results (curl)

| # | Test | Result |
|---|---|---|
| 1 | `GET /api/health` | 200 — `{status:"ok", users:2, teams:0}` (2 seeded demo accounts) |
| 2 | `POST /api/auth/login` lecturer `demo@dlc.ui.edu.ng` / `demo1234` | 200 — JWT returned |
| 3 | `POST /api/auth/login` student `ada@dlc.ui.edu.ng` / `demo1234` | 200 — JWT returned |
| 4 | Login with wrong password | 401 — `Invalid email or password.` |
| 5 | `POST /api/auth/register` new student `test@dlc.ui.edu.ng`, matric `DLC/2024/999` | 201 — token + user returned |
| 6 | `POST /api/teams` CSC 201 — Data Structures (lecturer) | 201 — team created, join code `2YKPP4` |
| 7 | `POST /api/teams/join` with code `2YKPP4` (student) | 200 — student added as member |
| 8 | `POST /api/teams/:id/messages` “Hello team @Ada Demo …” | 201 — message saved, `mentions: ["Ada Demo"]` |
| 9 | `GET /api/teams/:id/messages` | 200 — message listed with sender name |
| 10 | `POST /api/teams/:id/tasks` assigned to matric `DLC/2024/001`, deadline 2026-11-20, High | 201 — task created, status `To Do` |
| 11 | Create task with unknown matric `DLC/9999/999` | 400 — `No team member with matric number DLC/9999/999.` |
| 12 | `PATCH /api/tasks/:id` status → Doing, then → Done | 200 both — status updated each time |
| 13 | `POST /api/teams/:id/files` upload `dlc-test-file.txt` (22 bytes) | 201 — file record + stored file |
| 14 | `GET /api/teams/:id/files` | 200 — file listed |
| 15 | `POST /api/teams/:id/meetings` “Group sync”, 2026-11-12 15:00 | 201 — Jitsi link generated: `https://meet.jit.si/DLC-2YKPP4-mwaf` |
| 16 | `GET /api/teams/:id/meetings` | 200 — meeting listed |
| 17 | `GET /api/teams/:id/contributions` | 200 — Lecturer: 1 message, 1 meeting (total 2); Ada: 1 task completed, 1 file (total 2); 7 activity entries |
| 18 | `GET /api/dashboard` (student) | 200 — team listed, recent activity listed; upcoming deadlines empty (only task was Done — correct) |
| 19 | `GET /api/teams` with no token | 401 — `No token. Log in first.` |
| 20 | Frontend `GET /`, `/app.js`, `/styles.css` | 200 each |
| 21 | Socket.io polling handshake `GET /socket.io/?EIO=4&transport=polling` | 200 — valid session id returned |
| 22 | Socket.io live test (socket.io-client): connect with JWT, `joinTeam`, emit `chatMessage` | PASS — broadcast received by the client, `@mention` parsed, message persisted (history grew 1 → 2) |
| 23 | `GET /api/files/:id/download` | 200 — exact file contents returned |
| 24 | `DELETE /api/tasks/:id` | 200 — `{deleted:true}`; task list then empty |

Note on test 23/24: the first attempt at these two returned the SPA page /
404 because the check script ran from the wrong working directory
(`data.json` not found, so the IDs were empty). Re-run from the repo folder
passed — the server was never at fault.

## Persistence
After tests 1–22, `data.json` contained: 3 users, 1 team, 2 messages,
1 task, 1 file, 1 meeting, 8 activities — all written by the API/Socket.io
and re-read correctly. No errors in the server log.

## Clean-boot check (after deleting all test data)
- Deleted `data.json` and `uploads/*`, restarted: `GET /api/health` → 200,
  `users:2, teams:0` (demo accounts re-seeded), frontend 200.
- Server stopped afterwards; no process left running.
- `data.json` removed again so the repo ships clean; it is recreated on
  first run. `SOFTWARE-PLAN.md` was not modified.

## Not tested
- Browser UI click-through (API + Socket.io verified; the SPA was only
  checked to serve with 200). Recommend a quick manual pass in a browser:
  log in as a demo account, create a team, chat, move a Kanban card.
- Jitsi link itself was not joined (link format verified only).
- Load / concurrent-user testing — JSON storage is intended for the pilot
  only (see README Limitations).
