// DLC Team Collaboration — vanilla JS SPA (no build step)
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
let token = localStorage.getItem('dlc_token') || '';
let me = null;
let currentTeam = null;
let socket = null;

async function api(path, opts = {}) {
  const res = await fetch(path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(opts.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || ('Request failed: ' + res.status));
  return data;
}
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtDate = (d) => d ? new Date(d).toLocaleString() : '—';
function highlightMentions(text) {
  return esc(text).replace(/@([\w .-]+)/g, '<span class="mention">@$1</span>');
}

// ---------- auth ----------
let mode = 'login';
function setMode(m) {
  mode = m;
  $('#tabLogin').classList.toggle('active', m === 'login');
  $('#tabRegister').classList.toggle('active', m === 'register');
  $('#nameRow').hidden = m !== 'register';
  $('#authSubmit').textContent = m === 'login' ? 'Log in' : 'Register';
}
$('#tabLogin').onclick = () => setMode('login');
$('#tabRegister').onclick = () => setMode('register');
$('#demoLecturer').onclick = () => { setMode('login'); fillAuth('demo@dlc.ui.edu.ng', 'demo1234'); };
$('#demoStudent').onclick = () => { setMode('login'); fillAuth('ada@dlc.ui.edu.ng', 'demo1234'); };
function fillAuth(email, pw) {
  const f = $('#authForm'); f.email.value = email; f.password.value = pw;
}
$('#authForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target, err = $('#authError'); err.hidden = true;
  try {
    const body = { email: f.email.value.trim(), password: f.password.value };
    if (mode === 'register') Object.assign(body, { name: f.name.value.trim(), matricNo: f.matricNo.value.trim(), programme: f.programme.value.trim(), level: f.level.value.trim(), role: f.role.value });
    const data = await api(mode === 'login' ? '/api/auth/login' : '/api/auth/register', { method: 'POST', body: JSON.stringify(body) });
    token = data.token; localStorage.setItem('dlc_token', token); me = data.user;
    showDashboard();
  } catch (ex) { err.textContent = ex.message; err.hidden = false; }
});
$('#logoutBtn').onclick = () => { token = ''; me = null; localStorage.removeItem('dlc_token'); if (socket) socket.disconnect(); location.reload(); };

function showAuth() {
  $('#authView').hidden = false; $('#dashView').hidden = true; $('#teamView').hidden = true; $('#logoutBtn').hidden = true; $('#userLabel').textContent = '';
}
async function showDashboard() {
  $('#authView').hidden = true; $('#dashView').hidden = false; $('#teamView').hidden = true; $('#logoutBtn').hidden = false;
  $('#userLabel').textContent = me ? `${me.name} (${me.matricNo}) — ${me.role}` : '';
  $('#dashWelcome').textContent = me ? `Welcome, ${me.name.split(' ')[0]}` : 'My dashboard';
  try {
    const d = await api('/api/dashboard');
    $('#teamList').innerHTML = d.teams.length ? d.teams.map((t) => `<li><a href="#" data-team="${t.id}"><b>${esc(t.courseCode)}</b> — ${esc(t.courseTitle)}</a><br><span class="muted tiny">Join code: <code>${esc(t.code)}</code> · ${t.memberIds.length} member(s)</span></li>`).join('') : '<li>No teams yet — create one or join with a code.</li>';
    $$('#teamList a').forEach((a) => a.onclick = (e) => { e.preventDefault(); openTeam(a.dataset.team); });
    $('#deadlineList').innerHTML = d.upcomingDeadlines.length ? d.upcomingDeadlines.map((t) => `<li><b>${esc(t.title)}</b> — ${esc(t.teamName)}<br><span class="muted tiny">Due ${fmtDate(t.deadline)} · ${esc(t.status)}</span></li>`).join('') : '<li>No upcoming deadlines.</li>';
    $('#activityList').innerHTML = d.recentActivity.length ? d.recentActivity.map((a) => `<li><b>${esc(a.userName)}</b> ${esc(a.text)}<br><span class="muted tiny">${fmtDate(a.createdAt)}</span></li>`).join('') : '<li>No activity yet.</li>';
  } catch (ex) { alert(ex.message); }
}
$('#createTeamForm').addEventListener('submit', async (e) => {
  e.preventDefault(); const f = e.target;
  try { const { team } = await api('/api/teams', { method: 'POST', body: JSON.stringify({ courseCode: f.courseCode.value, courseTitle: f.courseTitle.value }) }); $('#teamMsg').textContent = `Team created. Share join code ${team.code} with your group.`; f.reset(); showDashboard(); } catch (ex) { $('#teamMsg').textContent = ex.message; }
});
$('#joinTeamForm').addEventListener('submit', async (e) => {
  e.preventDefault(); const f = e.target;
  try { await api('/api/teams/join', { method: 'POST', body: JSON.stringify({ code: f.code.value }) }); $('#teamMsg').textContent = 'Joined the team.'; f.reset(); showDashboard(); } catch (ex) { $('#teamMsg').textContent = ex.message; }
});

// ---------- team ----------
$('#backBtn').onclick = () => { currentTeam = null; if (socket) socket.disconnect(); showDashboard(); };
$$('#teamTabs .tab').forEach((b) => b.onclick = () => {
  $$('#teamTabs .tab').forEach((x) => x.classList.toggle('active', x === b));
  $$('.pane').forEach((p) => p.hidden = p.id !== 'pane-' + b.dataset.tab);
  if (b.dataset.tab === 'contrib') loadContrib();
  if (b.dataset.tab === 'tasks') loadTasks();
  if (b.dataset.tab === 'files') loadFiles();
  if (b.dataset.tab === 'meetings') loadMeetings();
});

async function openTeam(id) {
  try {
    const { team, members } = await api('/api/teams/' + id);
    currentTeam = team;
    $('#dashView').hidden = true; $('#teamView').hidden = false;
    $('#teamTitle').textContent = `${team.courseCode} — ${team.courseTitle}`;
    $('#teamMeta').textContent = `Join code: ${team.code} · Members: ${members.map((m) => m.name + ' (' + m.matricNo + ')').join(', ')}`;
    connectSocket(); loadChat(); loadTasks(); loadFiles(); loadMeetings();
  } catch (ex) { alert(ex.message); }
}
function connectSocket() {
  if (typeof io === 'undefined') return; // offline / CDN blocked: REST still works
  if (socket) socket.disconnect();
  socket = io({ auth: { token } });
  socket.emit('joinTeam', currentTeam.id);
  socket.on('message', (msg) => { if (msg.teamId === currentTeam.id) appendChat(msg); });
}
function appendChat(m) {
  const box = $('#chatBox');
  const div = document.createElement('div'); div.className = 'chat-msg';
  div.innerHTML = `<b>${esc(m.senderName)}</b><span class="time">${fmtDate(m.createdAt)}</span><br>${highlightMentions(m.text)}`;
  box.appendChild(div); box.scrollTop = box.scrollHeight;
}
async function loadChat() {
  $('#chatBox').innerHTML = '';
  const { messages } = await api(`/api/teams/${currentTeam.id}/messages`);
  messages.forEach(appendChat);
}
$('#chatForm').addEventListener('submit', async (e) => {
  e.preventDefault(); const f = e.target; const text = f.text.value.trim(); if (!text) return;
  // Prefer Socket.io (real-time); fall back to REST if socket is unavailable.
  if (socket && socket.connected) { socket.emit('chatMessage', { teamId: currentTeam.id, text }); f.reset(); }
  else { try { const { message } = await api(`/api/teams/${currentTeam.id}/messages`, { method: 'POST', body: JSON.stringify({ text }) }); appendChat(message); f.reset(); } catch (ex) { alert(ex.message); } }
});

// Tasks — Kanban
async function loadTasks() {
  const { tasks } = await api(`/api/teams/${currentTeam.id}/tasks`);
  const cols = { 'To Do': $('#colTodo'), 'Doing': $('#colDoing'), 'Done': $('#colDone') };
  Object.values(cols).forEach((c) => c.innerHTML = '');
  tasks.forEach((t) => {
    const div = document.createElement('div'); div.className = 'task';
    div.innerHTML = `<b>${esc(t.title)}</b><div class="meta">${esc(t.priority)} · ${t.assigneeName ? 'Assigned to ' + esc(t.assigneeName) + ' (' + esc(t.assigneeMatric || '') + ')' : 'Unassigned'} · Due ${fmtDate(t.deadline)}</div>`;
    const acts = document.createElement('div'); acts.className = 'actions';
    const next = t.status === 'To Do' ? 'Doing' : t.status === 'Doing' ? 'Done' : 'To Do';
    const mv = document.createElement('button'); mv.className = 'btn small'; mv.textContent = 'Move to ' + next;
    mv.onclick = async () => { await api('/api/tasks/' + t.id, { method: 'PATCH', body: JSON.stringify({ status: next }) }); loadTasks(); };
    const del = document.createElement('button'); del.className = 'btn small'; del.textContent = 'Delete';
    del.onclick = async () => { if (confirm('Delete this task?')) { await api('/api/tasks/' + t.id, { method: 'DELETE' }); loadTasks(); } };
    acts.append(mv, del); div.appendChild(acts);
    cols[t.status].appendChild(div);
  });
  Object.entries(cols).forEach(([k, c]) => { if (!c.children.length) c.innerHTML = '<p class="muted tiny">No tasks.</p>'; });
}
$('#taskForm').addEventListener('submit', async (e) => {
  e.preventDefault(); const f = e.target;
  try { await api(`/api/teams/${currentTeam.id}/tasks`, { method: 'POST', body: JSON.stringify({ title: f.title.value, assigneeMatric: f.assigneeMatric.value.trim(), deadline: f.deadline.value || null, priority: f.priority.value }) }); f.reset(); loadTasks(); }
  catch (ex) { alert(ex.message); }
});

// Files
async function loadFiles() {
  const { files } = await api(`/api/teams/${currentTeam.id}/files`);
  $('#fileList').innerHTML = files.length ? files.map((f) => `<li><b>${esc(f.filename)}</b> — ${(f.size / 1024).toFixed(1)} KB · by ${esc(f.uploaderName)} · ${fmtDate(f.createdAt)}<br><a href="/api/files/${f.id}/download" target="_blank">Download</a></li>`).join('') : '<li>No files yet.</li>';
}
$('#fileForm').addEventListener('submit', async (e) => {
  e.preventDefault(); const f = e.target;
  const fd = new FormData(); fd.append('file', f.file.files[0]);
  const res = await fetch(`/api/teams/${currentTeam.id}/files`, { method: 'POST', headers: { Authorization: 'Bearer ' + token }, body: fd });
  if (!res.ok) { const d = await res.json().catch(() => ({})); alert(d.error || 'Upload failed'); return; }
  f.reset(); loadFiles();
});

// Meetings
async function loadMeetings() {
  const { meetings } = await api(`/api/teams/${currentTeam.id}/meetings`);
  $('#meetingList').innerHTML = meetings.length ? meetings.map((m) => `<li><b>${esc(m.title)}</b> — ${fmtDate(m.dateTime)}<br><a href="${esc(m.jitsiLink)}" target="_blank" rel="noopener">Join on Jitsi Meet ↗</a> ${m.agenda ? '· ' + esc(m.agenda) : ''}</li>`).join('') : '<li>No meetings scheduled.</li>';
}
$('#meetingForm').addEventListener('submit', async (e) => {
  e.preventDefault(); const f = e.target;
  try { await api(`/api/teams/${currentTeam.id}/meetings`, { method: 'POST', body: JSON.stringify({ title: f.title.value, dateTime: f.dateTime.value, agenda: f.agenda.value }) }); f.reset(); loadMeetings(); }
  catch (ex) { alert(ex.message); }
});

// Contributions
async function loadContrib() {
  const { contributions, activity } = await api(`/api/teams/${currentTeam.id}/contributions`);
  $('#contribBody').innerHTML = contributions.map((c) => `<tr><td>${esc(c.user.name)}<br><span class="muted tiny">${esc(c.user.matricNo)} · ${esc(c.user.role)}</span></td><td>${c.messages}</td><td>${c.tasksCompleted} / ${c.tasksAssigned}</td><td>${c.filesUploaded}</td><td><b>${c.total}</b></td></tr>`).join('');
  $('#contribActivity').innerHTML = activity.map((a) => `<li><b>${esc(a.userName)}</b> ${esc(a.text)}<br><span class="muted tiny">${fmtDate(a.createdAt)}</span></li>`).join('') || '<li>No activity yet.</li>';
}

// ---------- boot ----------
(async () => {
  if (!token) { showAuth(); return; }
  try { const d = await api('/api/auth/me'); me = d.user; showDashboard(); }
  catch { showAuth(); }
})();
