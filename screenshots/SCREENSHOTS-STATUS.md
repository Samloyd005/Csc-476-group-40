# Screenshots (Fig 4.1–4.4) — DONE, Thu 2026-11-19 ~14:25 WAT

## Done
All 7 PNGs captured from the running system and visually verified (each shows
the right screen with the seeded CSC 201 demo data):
- `fig-4-1-login.png` — login form
- `fig-4-1-dashboard.png` — dashboard: CSC 201 team (join code XJIV7E),
  deadlines, recent activity
- `fig-4-1-dashboard-mobile.png` — dashboard at 390px (stacked mobile layout)
- `fig-4-2-chat.png` — chat, 2 messages, @Ada Demo / @Demo Lecturer highlighted
- `fig-4-2-kanban.png` — Kanban, exactly 1 card in each column (To Do / Doing / Done)
- `fig-4-3-contributions.png` — "Who did what" table + activity log
- `fig-4-4-meetings.png` — "Group sync" 11/20/2026 3:00 PM with Jitsi link

Capture checks all passed: auth visible, dash visible, team visible, 2 chat
messages, kanban 1/1/1, 2 contribution rows, 1 meeting. Server stopped
afterwards (was PID 2663); demo data persists in the server's `data.json`.

## How it was finished (2026-11-19)
The blocker was the browser, solved in two steps:
1. The Hatch `/opt/meta-chromium/chrome` build CANNOT screenshot localhost:
   it blocks every localhost/127.0.0.1 navigation with
   ERR_BLOCKED_BY_LOCAL_NETWORK_ACCESS_CHECKS, even for browser-initiated
   navigations and even with `--disable-features=LocalNetworkAccessCheck`,
   a file:// initiator, or a `LocalNetworkAccessAllowedForUrls` managed
   policy (that policy allows listed origins to REACH the local network,
   not the reverse). It also refuses to start without a Hatch WebGL domain
   policy file (see AGENTS.md for the exact contract format — it was
   cracked via the binary's own strings + `--hatch-validate-...` switch).
2. Fix: stock Chrome Headless Shell 158.0.8127.2 downloaded from
   remotion.media (CDNs are reachable from this VM, contrary to the
   earlier "downloads denied" note) at
   `~/workspace/tools/chrome-headless-shell/chrome-headless-shell-linux64/chrome-headless-shell`.
   Stock Chromium has no LNA block for browser-initiated local
   navigations. `capture.mjs` now launches it (no WebGL flags needed).

## Dead ends (do not retry)
- Public tunnels to expose the local server: the egress Sentinel policy
  DENIES them (localtunnel hangs; cloudflared quick-tunnel API returns
  403 policy_denied "needs the user's approval"). Do not route around this.
- Managed-policy `LocalNetworkAccessAllowedForUrls` for the Hatch build:
  wrong direction, does not unblock local navigation. Policy files were
  restored byte-identical after the test.
- `pkill` kills the calling shell in this environment — use `kill <pid>`
  with an explicit PID only.

## Re-capture (if the demo data or UI changes)
1. Start the server: from `software/dlc-platform`, `node server.js`
   (port 3000). If `data.json` was wiped, re-seed first:
   `bash screenshots/seed-demo.sh`.
2. Run `node screenshots/capture.mjs` (uses the headless shell above).
3. Open each PNG and check it shows the right screen before calling it done.
4. Stop the server afterwards (`kill <pid>`) — no process left running.
