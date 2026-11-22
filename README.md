# Remote Team Collaboration Platform
## Case Study: Distance Learning Centre (DLC), University of Ibadan

A single web workspace for DLC students and lecturers: create or join a team for a
course, chat in real time, track tasks on a Kanban board, share files, schedule
meetings (Jitsi Meet link), and see a contribution record of who did what.

Designed text-first for mobile phones and low-bandwidth connections — no build
step, no heavy framework on the frontend.

> **Project:** Oloyede, Samuel (E052503, Group Leader); Awoyomi, Felix Oluwatosin (E052483); Odeyemi, Moses Oluwadamilola (E052470); Adeleke, Mercy (E052474); Adesoji, Jeremiah (E052479) — November, 2026
> **Team members:** see front matter in the writeup (participation set 20 Nov 2026: Group Leader 70%, each other member 7.5%)
> **Supervisor / Head of Department:** Prof. B. F. Oladejo
> **GitHub:** https://github.com/Samloyd005/Csc-476-group-40 — the code is live here (public repo, main branch, commit e3d966f).

Screenshots from the running system are in Figures 4.1–4.4 of the writeup.

## Features

| Feature | What it does |
|---|---|
| Auth | Register / log in with name, matric number, programme, level, role (student / lecturer). JWT + bcryptjs. |
| Teams | Create a team by course code + title (get a join code), join by code, list my teams, leader / member roles. |
| Chat | Per-team channel, real-time via Socket.io, history saved, `@mention` highlighted. Falls back to REST if the socket is unavailable. |
| Tasks | Kanban — To Do / Doing / Done. Create, assign to a member by matric number, set deadline + priority, move status, delete. |
| Files | Upload per team (10 MB limit, low-bandwidth friendly), list, download. |
| Meetings | Schedule a meeting; a Jitsi Meet link is auto-generated (`https://meet.jit.si/DLC-<code>-<id>`). List upcoming. |
| Contribution log | Per-team activity list + counts per member: messages posted, tasks completed, files uploaded, meetings scheduled. |
| Dashboard | My teams, upcoming deadlines, recent activity. |

## Tech stack

- **Backend:** Node.js + Express
- **Real-time:** Socket.io
- **Auth:** JSON Web Tokens (`jsonwebtoken`), passwords hashed with `bcryptjs`
- **Uploads:** `multer` (local `uploads/` folder)
- **Frontend:** Vanilla HTML/CSS/JS in `public/` — no build step, mobile-responsive
- **Persistence:** JSON file (`data.json`, gitignored) — runs with **no database**.
  To move to MongoDB later, replace `loadData`/`saveData` in `server.js` with
  Mongoose models using the same field names (see the data model in
  `../SOFTWARE-PLAN.md`).

## Quick start

```bash
npm install
npm start
# open http://localhost:3000
```

Optional: copy `.env.example` to `.env` and set your own `JWT_SECRET` and `PORT`.

```bash
cp .env.example .env
```

## Demo accounts (seeded on first run)

| Role | Email | Password |
|---|---|---|
| Lecturer | `demo@dlc.ui.edu.ng` | `demo1234` |
| Student | `ada@dlc.ui.edu.ng` | `demo1234` |

## API endpoints

Base URL: `http://localhost:3000` — all `/api/*` routes except health/auth
require `Authorization: Bearer <token>`.

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/health` | Server status |
| POST | `/api/auth/register` | `{name, email, password, matricNo, programme, level, role}` |
| POST | `/api/auth/login` | `{email, password}` → `{token, user}` |
| GET | `/api/auth/me` | Current user |
| GET | `/api/dashboard` | My teams, upcoming deadlines, recent activity |
| POST | `/api/teams` | Create team `{courseCode, courseTitle}` → join `code` |
| POST | `/api/teams/join` | Join team `{code}` |
| GET | `/api/teams` | My teams |
| GET | `/api/teams/:id` | Team + members |
| GET/POST | `/api/teams/:id/messages` | Chat history / post a message |
| GET/POST | `/api/teams/:id/tasks` | List / create task (`assigneeMatric`, `deadline`, `priority`) |
| PATCH/DELETE | `/api/tasks/:id` | Move status (`To Do`/`Doing`/`Done`), edit, delete |
| GET/POST | `/api/teams/:id/files` | List / upload a file (multipart `file`) |
| GET | `/api/files/:id/download` | Download a file (team members only) |
| GET/POST | `/api/teams/:id/meetings` | List / schedule meeting (auto Jitsi link) |
| GET | `/api/teams/:id/contributions` | Per-member counts + activity log |
| GET | `/api/teams/:id/activity` | Activity log |

Socket.io events: client emits `joinTeam(teamId)` and `chatMessage({teamId, text})`;
server emits `message` to the team room.

## Folder structure

```
dlc-platform/
├── server.js          # Express API + Socket.io + static serving
├── package.json
├── .env.example
├── .gitignore
├── data.json          # created at runtime, gitignored (JSON persistence)
├── uploads/           # uploaded files, gitignored
├── public/
│   ├── index.html     # single-page app
│   ├── app.js         # frontend logic (fetch + Socket.io)
│   └── styles.css     # mobile-responsive styles
├── README.md
└── TEST-LOG.md        # verified test run (see file)
```

## Limitations

- Single-server JSON storage: fine for a pilot (30–50 students), not for
  large concurrent use — move to MongoDB for production (see note above).
- No email verification, password reset, or direct messages yet.
- Jitsi links are public rooms (anyone with the link can join); no in-app video.
- File previews are not implemented — files are listed and downloaded only.
- Socket.io client loads from a CDN; if the CDN is unreachable the app still
  works over REST, but live chat updates require a page refresh.
