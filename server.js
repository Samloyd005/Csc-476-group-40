/**
 * DLC Team Collaboration Platform
 * Remote Team Collaboration Platform — Case Study: DLC, University of Ibadan
 *
 * Stack: Node.js + Express + Socket.io, JWT auth, bcryptjs, multer.
 * Persistence: JSON file (data.json) so the app runs with no database.
 * Swap `loadData` / `saveData` for MongoDB/Mongoose later — the route
 * shapes and field names match the data model in SOFTWARE-PLAN.md.
 */
const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const { Server } = require('socket.io');

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'dlc-change-me-in-production';
const DATA_FILE = path.join(__dirname, 'data.json');
const UPLOAD_DIR = path.join(__dirname, 'uploads');

if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// ---------------------------------------------------------------- data layer
function emptyData() {
  return { users: [], teams: [], messages: [], tasks: [], files: [], meetings: [], activities: [] };
}
function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch (e) { console.error('Could not read data.json, starting empty:', e.message); }
  return emptyData();
}
let db = loadData();
function saveData() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
}
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const teamCode = () => Math.random().toString(36).slice(2, 8).toUpperCase();
const publicUser = (u) => u ? { id: u.id, name: u.name, email: u.email, matricNo: u.matricNo, programme: u.programme, level: u.level, role: u.role } : null;
const signToken = (u) => jwt.sign({ id: u.id, email: u.email, role: u.role }, JWT_SECRET, { expiresIn: '7d' });

// Seed demo accounts (only if not present) — see README for credentials.
function seedDemo() {
  const demos = [
    { name: 'Demo Lecturer', email: 'demo@dlc.ui.edu.ng', password: 'demo1234', matricNo: 'DLC-STAFF-001', programme: 'Computer Science', level: 'Lecturer', role: 'lecturer' },
    { name: 'Ada Demo', email: 'ada@dlc.ui.edu.ng', password: 'demo1234', matricNo: 'DLC/2024/001', programme: 'Computer Science', level: '200', role: 'student' },
  ];
  let changed = false;
  for (const d of demos) {
    if (!db.users.find((u) => u.email === d.email)) {
      db.users.push({ id: uid(), name: d.name, email: d.email, matricNo: d.matricNo, programme: d.programme, level: d.level, role: d.role, passwordHash: bcrypt.hashSync(d.password, 10), createdAt: new Date().toISOString() });
      changed = true;
    }
  }
  if (changed) saveData();
}
seedDemo();

function logActivity(teamId, userId, type, text) {
  db.activities.push({ id: uid(), teamId, userId, type, text, createdAt: new Date().toISOString() });
  saveData();
}

// ---------------------------------------------------------------- app / auth
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(UPLOAD_DIR));

function auth(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'No token. Log in first.' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = db.users.find((u) => u.id === payload.id);
    if (!req.user) return res.status(401).json({ error: 'User not found.' });
    next();
  } catch (e) { return res.status(401).json({ error: 'Invalid or expired token.' }); }
}
function getTeamForUser(teamId, userId) {
  const team = db.teams.find((t) => t.id === teamId);
  if (!team) return { error: 'Team not found.', status: 404 };
  if (!team.memberIds.includes(userId)) return { error: 'You are not a member of this team.', status: 403 };
  return { team };
}
function memberByMatric(team, matricNo) {
  return db.users.find((u) => u.matricNo === matricNo && team.memberIds.includes(u.id));
}

// ---------------------------------------------------------------- health
app.get('/api/health', (req, res) => res.json({ status: 'ok', service: 'dlc-team-collaboration-platform', time: new Date().toISOString(), users: db.users.length, teams: db.teams.length }));

// ---------------------------------------------------------------- auth routes
app.post('/api/auth/register', (req, res) => {
  const { name, email, password, matricNo, programme, level, role } = req.body || {};
  if (!name || !email || !password || !matricNo) return res.status(400).json({ error: 'name, email, password and matricNo are required.' });
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  if (db.users.find((u) => u.email === email.toLowerCase())) return res.status(400).json({ error: 'An account with this email already exists.' });
  if (db.users.find((u) => u.matricNo === matricNo)) return res.status(400).json({ error: 'An account with this matric number already exists.' });
  const user = { id: uid(), name, email: email.toLowerCase(), matricNo, programme: programme || '', level: level || '', role: role === 'lecturer' ? 'lecturer' : 'student', passwordHash: bcrypt.hashSync(password, 10), createdAt: new Date().toISOString() };
  db.users.push(user); saveData();
  res.status(201).json({ token: signToken(user), user: publicUser(user) });
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'email and password are required.' });
  const user = db.users.find((u) => u.email === email.toLowerCase());
  if (!user || !bcrypt.compareSync(password, user.passwordHash)) return res.status(401).json({ error: 'Invalid email or password.' });
  res.json({ token: signToken(user), user: publicUser(user) });
});

app.get('/api/auth/me', auth, (req, res) => res.json({ user: publicUser(req.user) }));

// ---------------------------------------------------------------- dashboard
app.get('/api/dashboard', auth, (req, res) => {
  const myTeams = db.teams.filter((t) => t.memberIds.includes(req.user.id));
  const myTeamIds = myTeams.map((t) => t.id);
  const upcoming = db.tasks
    .filter((t) => myTeamIds.includes(t.teamId) && t.status !== 'Done' && t.deadline)
    .sort((a, b) => new Date(a.deadline) - new Date(b.deadline))
    .slice(0, 10)
    .map((t) => ({ ...t, teamName: (db.teams.find((x) => x.id === t.teamId) || {}).courseCode || '' }));
  const recent = db.activities.filter((a) => myTeamIds.includes(a.teamId)).slice(-20).reverse()
    .map((a) => ({ ...a, userName: (db.users.find((u) => u.id === a.userId) || {}).name || 'Unknown' }));
  res.json({ teams: myTeams, upcomingDeadlines: upcoming, recentActivity: recent });
});

// ---------------------------------------------------------------- teams
app.post('/api/teams', auth, (req, res) => {
  const { courseCode, courseTitle } = req.body || {};
  if (!courseCode || !courseTitle) return res.status(400).json({ error: 'courseCode and courseTitle are required.' });
  const team = { id: uid(), courseCode: courseCode.toUpperCase(), courseTitle, code: teamCode(), leaderId: req.user.id, memberIds: [req.user.id], createdAt: new Date().toISOString() };
  db.teams.push(team); saveData();
  logActivity(team.id, req.user.id, 'team', `created team ${team.courseCode} — ${team.courseTitle}`);
  res.status(201).json({ team });
});

app.post('/api/teams/join', auth, (req, res) => {
  const { code } = req.body || {};
  if (!code) return res.status(400).json({ error: 'Join code is required.' });
  const team = db.teams.find((t) => t.code === String(code).toUpperCase());
  if (!team) return res.status(404).json({ error: 'No team with that code.' });
  if (team.memberIds.includes(req.user.id)) return res.json({ team, message: 'You are already a member.' });
  team.memberIds.push(req.user.id); saveData();
  logActivity(team.id, req.user.id, 'team', 'joined the team');
  res.json({ team });
});

app.get('/api/teams', auth, (req, res) => {
  res.json({ teams: db.teams.filter((t) => t.memberIds.includes(req.user.id)) });
});

app.get('/api/teams/:id', auth, (req, res) => {
  const { team, error, status } = getTeamForUser(req.params.id, req.user.id);
  if (error) return res.status(status).json({ error });
  const members = team.memberIds.map((id) => publicUser(db.users.find((u) => u.id === id))).filter(Boolean);
  res.json({ team, members });
});

// ---------------------------------------------------------------- chat
app.get('/api/teams/:id/messages', auth, (req, res) => {
  const { team, error, status } = getTeamForUser(req.params.id, req.user.id);
  if (error) return res.status(status).json({ error });
  const messages = db.messages.filter((m) => m.teamId === team.id)
    .map((m) => ({ ...m, senderName: (db.users.find((u) => u.id === m.senderId) || {}).name || 'Unknown' }));
  res.json({ messages });
});

app.post('/api/teams/:id/messages', auth, (req, res) => {
  const { team, error, status } = getTeamForUser(req.params.id, req.user.id);
  if (error) return res.status(status).json({ error });
  const { text } = req.body || {};
  if (!text || !String(text).trim()) return res.status(400).json({ error: 'Message text is required.' });
  // @mention display: extract @names so the frontend can highlight them.
  const mentions = [...String(text).matchAll(/@([\w .-]+)/g)].map((m) => m[1].trim());
  const msg = { id: uid(), teamId: team.id, senderId: req.user.id, senderName: req.user.name, text: String(text).trim(), mentions, createdAt: new Date().toISOString() };
  db.messages.push(msg); saveData();
  logActivity(team.id, req.user.id, 'message', `posted a message: “${msg.text.slice(0, 80)}”`);
  io.to(team.id).emit('message', msg);
  res.status(201).json({ message: msg });
});

// ---------------------------------------------------------------- tasks (Kanban)
app.get('/api/teams/:id/tasks', auth, (req, res) => {
  const { team, error, status } = getTeamForUser(req.params.id, req.user.id);
  if (error) return res.status(status).json({ error });
  const tasks = db.tasks.filter((t) => t.teamId === team.id).map((t) => ({
    ...t,
    assigneeName: t.assigneeId ? ((db.users.find((u) => u.id === t.assigneeId) || {}).name || null) : null,
    assigneeMatric: t.assigneeId ? ((db.users.find((u) => u.id === t.assigneeId) || {}).matricNo || null) : null,
  }));
  res.json({ tasks });
});

app.post('/api/teams/:id/tasks', auth, (req, res) => {
  const { team, error, status } = getTeamForUser(req.params.id, req.user.id);
  if (error) return res.status(status).json({ error });
  const { title, description, assigneeMatric, deadline, priority } = req.body || {};
  if (!title) return res.status(400).json({ error: 'Task title is required.' });
  let assigneeId = null;
  if (assigneeMatric) {
    const assignee = memberByMatric(team, assigneeMatric);
    if (!assignee) return res.status(400).json({ error: `No team member with matric number ${assigneeMatric}.` });
    assigneeId = assignee.id;
  }
  const task = { id: uid(), teamId: team.id, title, description: description || '', assigneeId, status: 'To Do', deadline: deadline || null, priority: priority || 'Medium', createdBy: req.user.id, createdAt: new Date().toISOString() };
  db.tasks.push(task); saveData();
  logActivity(team.id, req.user.id, 'task', `created task “${title}”`);
  res.status(201).json({ task });
});

app.patch('/api/tasks/:id', auth, (req, res) => {
  const task = db.tasks.find((t) => t.id === req.params.id);
  if (!task) return res.status(404).json({ error: 'Task not found.' });
  const { team, error, status } = getTeamForUser(task.teamId, req.user.id);
  if (error) return res.status(status).json({ error });
  const { status: newStatus, title, description, deadline, priority, assigneeMatric } = req.body || {};
  if (newStatus) {
    if (!['To Do', 'Doing', 'Done'].includes(newStatus)) return res.status(400).json({ error: 'Status must be To Do, Doing or Done.' });
    if (task.status !== 'Done' && newStatus === 'Done') logActivity(team.id, req.user.id, 'task', `completed task “${task.title}”`);
    task.status = newStatus;
  }
  if (title !== undefined) task.title = title;
  if (description !== undefined) task.description = description;
  if (deadline !== undefined) task.deadline = deadline;
  if (priority !== undefined) task.priority = priority;
  if (assigneeMatric !== undefined) {
    if (!assigneeMatric) task.assigneeId = null;
    else {
      const a = memberByMatric(team, assigneeMatric);
      if (!a) return res.status(400).json({ error: `No team member with matric number ${assigneeMatric}.` });
      task.assigneeId = a.id;
    }
  }
  saveData();
  res.json({ task });
});

app.delete('/api/tasks/:id', auth, (req, res) => {
  const idx = db.tasks.findIndex((t) => t.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Task not found.' });
  const { team, error, status } = getTeamForUser(db.tasks[idx].teamId, req.user.id);
  if (error) return res.status(status).json({ error });
  const [removed] = db.tasks.splice(idx, 1); saveData();
  logActivity(team.id, req.user.id, 'task', `deleted task “${removed.title}”`);
  res.json({ deleted: true });
});

// ---------------------------------------------------------------- files
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')),
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } }); // 10 MB — low-bandwidth friendly

app.post('/api/teams/:id/files', auth, upload.single('file'), (req, res) => {
  const { team, error, status } = getTeamForUser(req.params.id, req.user.id);
  if (error) { if (req.file) fs.unlinkSync(req.file.path); return res.status(status).json({ error }); }
  if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });
  const rec = { id: uid(), teamId: team.id, uploaderId: req.user.id, uploaderName: req.user.name, filename: req.file.originalname, storedName: req.file.filename, size: req.file.size, url: `/uploads/${req.file.filename}`, createdAt: new Date().toISOString() };
  db.files.push(rec); saveData();
  logActivity(team.id, req.user.id, 'file', `uploaded file “${rec.filename}”`);
  res.status(201).json({ file: rec });
});

app.get('/api/teams/:id/files', auth, (req, res) => {
  const { team, error, status } = getTeamForUser(req.params.id, req.user.id);
  if (error) return res.status(status).json({ error });
  res.json({ files: db.files.filter((f) => f.teamId === team.id) });
});

app.get('/api/files/:id/download', auth, (req, res) => {
  const file = db.files.find((f) => f.id === req.params.id);
  if (!file) return res.status(404).json({ error: 'File not found.' });
  const { error, status } = getTeamForUser(file.teamId, req.user.id);
  if (error) return res.status(status).json({ error });
  const p = path.join(UPLOAD_DIR, file.storedName);
  if (!fs.existsSync(p)) return res.status(404).json({ error: 'File missing on server.' });
  res.download(p, file.filename);
});

// ---------------------------------------------------------------- meetings
app.post('/api/teams/:id/meetings', auth, (req, res) => {
  const { team, error, status } = getTeamForUser(req.params.id, req.user.id);
  if (error) return res.status(status).json({ error });
  const { title, dateTime, agenda } = req.body || {};
  if (!title || !dateTime) return res.status(400).json({ error: 'title and dateTime are required.' });
  const meeting = { id: uid(), teamId: team.id, title, dateTime, agenda: agenda || '', jitsiLink: `https://meet.jit.si/DLC-${team.code}-${uid().slice(0, 4)}`, createdBy: req.user.id, createdAt: new Date().toISOString() };
  db.meetings.push(meeting); saveData();
  logActivity(team.id, req.user.id, 'meeting', `scheduled meeting “${title}”`);
  res.status(201).json({ meeting });
});

app.get('/api/teams/:id/meetings', auth, (req, res) => {
  const { team, error, status } = getTeamForUser(req.params.id, req.user.id);
  if (error) return res.status(status).json({ error });
  const meetings = db.meetings.filter((m) => m.teamId === team.id).sort((a, b) => new Date(a.dateTime) - new Date(b.dateTime));
  res.json({ meetings });
});

// ---------------------------------------------------------------- contributions / activity
app.get('/api/teams/:id/contributions', auth, (req, res) => {
  const { team, error, status } = getTeamForUser(req.params.id, req.user.id);
  if (error) return res.status(status).json({ error });
  const members = team.memberIds.map((id) => db.users.find((u) => u.id === id)).filter(Boolean);
  const contributions = members.map((m) => ({
    user: publicUser(m),
    messages: db.messages.filter((x) => x.teamId === team.id && x.senderId === m.id).length,
    tasksCompleted: db.tasks.filter((x) => x.teamId === team.id && x.assigneeId === m.id && x.status === 'Done').length,
    tasksAssigned: db.tasks.filter((x) => x.teamId === team.id && x.assigneeId === m.id).length,
    filesUploaded: db.files.filter((x) => x.teamId === team.id && x.uploaderId === m.id).length,
    meetingsScheduled: db.meetings.filter((x) => x.teamId === team.id && x.createdBy === m.id).length,
  })).map((c) => ({ ...c, total: c.messages + c.tasksCompleted + c.filesUploaded + c.meetingsScheduled }))
    .sort((a, b) => b.total - a.total);
  const activity = db.activities.filter((a) => a.teamId === team.id).slice(-50).reverse()
    .map((a) => ({ ...a, userName: (db.users.find((u) => u.id === a.userId) || {}).name || 'Unknown' }));
  res.json({ contributions, activity });
});

app.get('/api/teams/:id/activity', auth, (req, res) => {
  const { team, error, status } = getTeamForUser(req.params.id, req.user.id);
  if (error) return res.status(status).json({ error });
  const activity = db.activities.filter((a) => a.teamId === team.id).slice(-50).reverse()
    .map((a) => ({ ...a, userName: (db.users.find((u) => u.id === a.userId) || {}).name || 'Unknown' }));
  res.json({ activity });
});

// Fallback: SPA
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// ---------------------------------------------------------------- server + Socket.io
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

io.use((socket, next) => {
  const token = socket.handshake.auth && socket.handshake.auth.token;
  if (!token) return next(new Error('No token'));
  try { socket.user = jwt.verify(token, JWT_SECRET); next(); }
  catch (e) { next(new Error('Invalid token')); }
});

io.on('connection', (socket) => {
  socket.on('joinTeam', (teamId) => {
    const team = db.teams.find((t) => t.id === teamId);
    if (team && team.memberIds.includes(socket.user.id)) socket.join(teamId);
  });
  socket.on('chatMessage', (data) => {
    const { teamId, text } = data || {};
    const team = db.teams.find((t) => t.id === teamId);
    if (!team || !team.memberIds.includes(socket.user.id) || !text || !String(text).trim()) return;
    const sender = db.users.find((u) => u.id === socket.user.id);
    const mentions = [...String(text).matchAll(/@([\w .-]+)/g)].map((m) => m[1].trim());
    const msg = { id: uid(), teamId, senderId: socket.user.id, senderName: sender ? sender.name : 'Unknown', text: String(text).trim(), mentions, createdAt: new Date().toISOString() };
    db.messages.push(msg); saveData();
    logActivity(teamId, socket.user.id, 'message', `posted a message: “${msg.text.slice(0, 80)}”`);
    io.to(teamId).emit('message', msg);
  });
});

server.listen(PORT, () => console.log(`DLC Collaboration Platform running on http://localhost:${PORT}`));
module.exports = { app, server };
