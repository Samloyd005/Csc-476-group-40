// DLC screenshots via headless Chrome CDP (Node 24 global WebSocket)
import { execFile } from 'node:child_process';
import fs from 'node:fs';

// Tokens are fetched fresh by logging in as the demo lecturer (7-day JWTs;
// never store tokens in the repo). Team id is read from the dashboard.
const login = async (email) => {
  const res = await fetch('http://localhost:3000/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'demo1234' }),
  });
  return (await res.json()).token;
};
const LECT = await login('demo@dlc.ui.edu.ng');
const dash = await (await fetch('http://localhost:3000/api/dashboard', {
  headers: { Authorization: 'Bearer ' + LECT },
})).json();
const TEAM_ID = dash.teams[0]?.id;
if (!TEAM_ID) { console.error('NO TEAM — run seed-demo.sh first'); process.exit(1); }
const OUT = '/home/hatch/workspace/dlc-collaboration-project/figures';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Stock Chrome Headless Shell (downloaded from remotion.media) — the Hatch
// /opt/meta-chromium build blocks ALL localhost navigation (LNA), so it
// cannot screenshot a local server. Headless shell has no such block.
const chrome = execFile('/home/hatch/workspace/tools/chrome-headless-shell/chrome-headless-shell-linux64/chrome-headless-shell', [
  '--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars',
  '--remote-debugging-port=9222', '--user-data-dir=/tmp/dlc-chrome-profile',
  '--window-size=1280,800', 'http://localhost:3000/',
], () => {});

let target = null;
for (let i = 0; i < 30; i++) {
  await sleep(500);
  try {
    const res = await fetch('http://127.0.0.1:9222/json/list');
    const list = await res.json();
    target = list.find((t) => t.type === 'page');
    if (target) break;
  } catch { /* retry */ }
}
if (!target) { console.error('NO TARGET'); process.exit(1); }

const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0;
const pending = new Map();
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
};
const send = (method, params = {}) => new Promise((res) => {
  const mid = ++id; pending.set(mid, res);
  ws.send(JSON.stringify({ id: mid, method, params }));
});
const evalJs = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) console.error('EVAL ERR', JSON.stringify(r.result.exceptionDetails).slice(0, 500));
  return r.result?.result?.value;
};
const shot = async (name) => {
  const r = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(`${OUT}/${name}`, Buffer.from(r.result.data, 'base64'));
  console.log('saved', name);
};
await send('Page.enable');
await send('Runtime.enable');
const setSize = async (w, h) => {
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: w < 500 });
};
const nav = async (url) => {
  await send('Page.navigate', { url });
  await sleep(2500);
};

// 1. Login screen (no token), desktop
await setSize(1280, 800);
await nav('http://localhost:3000/');
console.log('auth visible:', await evalJs(`!document.querySelector('#authView').hidden`));
await shot('fig-4-1-login.png');

// 2. Dashboard as lecturer
await evalJs(`localStorage.setItem('dlc_token', '${LECT}'); location.reload();`);
await sleep(2500);
console.log('dash visible:', await evalJs(`!document.querySelector('#dashView').hidden`));
await shot('fig-4-1-dashboard.png');

// 3. Dashboard mobile width
await setSize(390, 844);
await sleep(1200);
await shot('fig-4-1-dashboard-mobile.png');
await setSize(1280, 800);
await sleep(800);

// 4. Open team -> chat pane
await evalJs(`document.querySelector('#teamList a').click()`);
await sleep(2500);
console.log('team visible:', await evalJs(`!document.querySelector('#teamView').hidden`), 'chat msgs:', await evalJs(`document.querySelectorAll('#chatBox .chat-msg').length`));
await shot('fig-4-2-chat.png');

// 5. Tasks / Kanban
await evalJs(`document.querySelector('[data-tab="tasks"]').click()`);
await sleep(1500);
console.log('kanban counts:', await evalJs(`[document.querySelector('#colTodo').children.length, document.querySelector('#colDoing').children.length, document.querySelector('#colDone').children.length].join('/')`));
await shot('fig-4-2-kanban.png');

// 6. Contributions
await evalJs(`document.querySelector('[data-tab="contrib"]').click()`);
await sleep(1500);
console.log('contrib rows:', await evalJs(`document.querySelectorAll('#contribBody tr').length`));
await shot('fig-4-3-contributions.png');

// 7. Meetings
await evalJs(`document.querySelector('[data-tab="meetings"]').click()`);
await sleep(1500);
console.log('meetings:', await evalJs(`document.querySelectorAll('#meetingList li').length`));
await shot('fig-4-4-meetings.png');

ws.close();
chrome.kill();
console.log('DONE');
process.exit(0);
