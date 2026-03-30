const http = require("http");
const { randomUUID } = require("crypto");
const nodePath = require("path");
const Database = require("better-sqlite3");

// ── CLI args ────────────────────────────────────────────────
function parseArgs(argv) {
  const args = { port: 9000, key: "", db: "" };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--port" && argv[i + 1]) { args.port = parseInt(argv[++i], 10); }
    else if (a.startsWith("--port="))  { args.port = parseInt(a.split("=")[1], 10); }
    else if (a === "--key" && argv[i + 1]) { args.key = argv[++i]; }
    else if (a.startsWith("--key="))   { args.key = a.split("=")[1]; }
    else if (a === "--db" && argv[i + 1]) { args.db = argv[++i]; }
    else if (a.startsWith("--db="))    { args.db = a.split("=")[1]; }
    else if (a === "--help" || a === "-h") {
      console.log("Usage: node server.js [--port 9000] [--key SECRET] [--db path/to/notifications.db]");
      process.exit(0);
    }
  }
  return args;
}

const cli = parseArgs(process.argv);
const PORT = cli.port;
const AUTH_KEY = cli.key;
const DB_PATH = cli.db ? nodePath.resolve(cli.db) : nodePath.join(__dirname, "notifications.db");

// ── SQLite ──────────────────────────────────────────────────
const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("synchronous = normal");

db.exec(`
  CREATE TABLE IF NOT EXISTS notifications (
    id       TEXT PRIMARY KEY,
    msg      TEXT    NOT NULL,
    ts       INTEGER NOT NULL,
    resolved INTEGER NOT NULL DEFAULT 0
  )
`);

const stmt = {
  insert:  db.prepare("INSERT INTO notifications (id, msg, ts, resolved) VALUES (?, ?, ?, 0)"),
  all:     db.prepare("SELECT * FROM notifications ORDER BY ts DESC"),
  get:     db.prepare("SELECT * FROM notifications WHERE id = ?"),
  resolve: db.prepare("UPDATE notifications SET resolved = 1 WHERE id = ?"),
  del:     db.prepare("DELETE FROM notifications WHERE id = ?"),
  clear:   db.prepare("DELETE FROM notifications"),
};

function row2obj(r) {
  return { id: r.id, msg: r.msg, ts: r.ts, resolved: !!r.resolved };
}

// ── SSE ─────────────────────────────────────────────────────
const clients = new Set();

function broadcast(event, data) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) res.write(msg);
}

// ── HTML ────────────────────────────────────────────────────
const HTML = `<!DOCTYPE html>
<html lang="en" data-theme="dark">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Notifications · claude-code</title>
<script src="https://cdn.jsdelivr.net/npm/marked@17/lib/marked.umd.js"></script>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');

  *, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }

  /* ═══════════ DARK (default) ═══════════ */
  :root, [data-theme="dark"] {
    --bg: #050507;
    --bg-grid: rgba(255, 255, 255, 0.025);
    --surface: #0A0A0F;
    --surface-hover: #0E0E15;
    --border: #16161F;
    --border-hover: #222230;
    --border-bright: #2E2E3E;
    --text: #6B6B80;
    --text-secondary: #9494A8;
    --text-bright: #EDEDF0;
    --text-white: #FAFAFE;
    --accent: #818CF8;
    --accent-secondary: #6366F1;
    --accent-dim: rgba(129, 140, 248, 0.08);
    --accent-glow: rgba(129, 140, 248, 0.04);
    --accent-border: rgba(129, 140, 248, 0.18);
    --green: #34D399;
    --green-dim: rgba(52, 211, 153, 0.06);
    --green-border: rgba(52, 211, 153, 0.15);
    --red: #F87171;
    --red-dim: rgba(248, 113, 113, 0.06);
    --red-border: rgba(248, 113, 113, 0.15);
    --header-bg: rgba(5, 5, 7, 0.7);
    --card-hover-shadow:
      0 0 0 1px rgba(129, 140, 248, 0.04),
      0 4px 24px rgba(0, 0, 0, 0.3),
      0 0 48px rgba(129, 140, 248, 0.04);
    --card-resolved-hover-shadow: 0 2px 12px rgba(0, 0, 0, 0.2);
    --empty-muted: #2A2A38;
    --off-dot: #3A3A48;
    --ambient-1: rgba(99, 102, 241, 0.055);
    --ambient-2: rgba(129, 140, 248, 0.02);
  }

  /* ═══════════ LIGHT ═══════════ */
  [data-theme="light"] {
    --bg: #F5F2EB;
    --bg-grid: rgba(0, 0, 0, 0.035);
    --surface: #FFFFFF;
    --surface-hover: #FBFAF8;
    --border: #E0DBD2;
    --border-hover: #CEC7BA;
    --border-bright: #AEA89C;
    --text: #706C64;
    --text-secondary: #504D46;
    --text-bright: #1C1B18;
    --text-white: #0C0C0A;
    --accent: #6366F1;
    --accent-secondary: #4F46E5;
    --accent-dim: rgba(99, 102, 241, 0.07);
    --accent-glow: rgba(99, 102, 241, 0.03);
    --accent-border: rgba(99, 102, 241, 0.22);
    --green: #16A34A;
    --green-dim: rgba(22, 163, 74, 0.06);
    --green-border: rgba(22, 163, 74, 0.18);
    --red: #DC2626;
    --red-dim: rgba(220, 38, 38, 0.05);
    --red-border: rgba(220, 38, 38, 0.15);
    --header-bg: rgba(245, 242, 235, 0.72);
    --card-hover-shadow:
      0 1px 2px rgba(0, 0, 0, 0.04),
      0 4px 16px rgba(0, 0, 0, 0.06);
    --card-resolved-hover-shadow: 0 1px 6px rgba(0, 0, 0, 0.05);
    --empty-muted: #C0BAB0;
    --off-dot: #C0BAB0;
    --ambient-1: rgba(99, 102, 241, 0.04);
    --ambient-2: rgba(129, 140, 248, 0.015);
  }

  html { scroll-behavior: smooth; }

  body {
    background: var(--bg);
    color: var(--text);
    font-family: 'Outfit', -apple-system, sans-serif;
    min-height: 100vh;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    overflow-x: hidden;
    transition: background 0.35s ease, color 0.35s ease;
  }

  /* ── Dot grid ── */
  .bg-grid {
    position: fixed;
    inset: 0;
    z-index: 0;
    pointer-events: none;
    background-image: radial-gradient(circle, var(--bg-grid) 1px, transparent 1px);
    background-size: 28px 28px;
    mask-image: radial-gradient(ellipse 80% 70% at 50% 30%, black 20%, transparent 70%);
    -webkit-mask-image: radial-gradient(ellipse 80% 70% at 50% 30%, black 20%, transparent 70%);
    transition: opacity 0.35s;
  }

  /* ── Ambient glow ── */
  .ambient {
    position: fixed;
    top: -280px;
    left: 50%;
    transform: translateX(-50%);
    width: 900px;
    height: 560px;
    background: radial-gradient(ellipse, var(--ambient-1) 0%, var(--ambient-2) 40%, transparent 70%);
    pointer-events: none;
    z-index: 0;
    transition: opacity 0.35s;
  }

  /* ── Header ── */
  header {
    position: sticky;
    top: 0;
    z-index: 200;
    background: var(--header-bg);
    backdrop-filter: blur(20px) saturate(1.4);
    -webkit-backdrop-filter: blur(20px) saturate(1.4);
    border-bottom: 1px solid var(--border);
    padding: 0 clamp(16px, 4vw, 40px);
    height: 56px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    transition: background 0.35s, border-color 0.35s;
  }

  .nav-left {
    display: flex;
    align-items: center;
    gap: 14px;
  }

  .status {
    position: relative;
    width: 8px;
    height: 8px;
    flex-shrink: 0;
  }

  .status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--accent);
    position: relative;
    z-index: 1;
    transition: background 0.3s;
  }

  .status-glow {
    position: absolute;
    inset: -4px;
    border-radius: 50%;
    background: var(--accent);
    filter: blur(6px);
    opacity: 0.4;
    animation: statusPulse 3s ease-in-out infinite;
  }

  .status.off .status-dot { background: var(--off-dot); }
  .status.off .status-glow { opacity: 0; animation: none; }

  @keyframes statusPulse {
    0%, 100% { opacity: 0.4; transform: scale(1); }
    50% { opacity: 0.15; transform: scale(1.3); }
  }

  .nav-title {
    font-size: 13px;
    font-weight: 500;
    color: var(--text-bright);
    letter-spacing: -0.01em;
    transition: color 0.35s;
  }

  .nav-sep {
    color: var(--border-bright);
    font-weight: 300;
    font-size: 14px;
    margin: 0 2px;
    transition: color 0.35s;
  }

  .nav-sub {
    font-size: 13px;
    font-weight: 400;
    color: var(--text);
    letter-spacing: -0.01em;
    transition: color 0.35s;
  }

  .nav-right {
    display: flex;
    gap: 10px;
    align-items: center;
  }

  .count {
    font-size: 13px;
    font-weight: 600;
    color: var(--accent);
    font-variant-numeric: tabular-nums;
    min-width: 16px;
    text-align: center;
    transition: color 0.3s;
    letter-spacing: -0.02em;
  }

  .count.zero { color: var(--empty-muted); }

  .count-label {
    font-size: 11px;
    color: var(--text);
    font-weight: 400;
    margin-left: 3px;
    transition: color 0.35s;
  }

  .nav-divider {
    width: 1px;
    height: 20px;
    background: var(--border);
    transition: background 0.35s;
  }

  /* Ghost button (clear, theme toggle) */
  .btn-ghost {
    background: none;
    color: var(--text);
    border: 1px solid var(--border);
    cursor: pointer;
    font-family: 'Outfit', sans-serif;
    font-size: 12px;
    font-weight: 400;
    padding: 5px 12px;
    border-radius: 6px;
    transition: all 0.15s ease;
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .btn-ghost:hover {
    color: var(--text-secondary);
    border-color: var(--border-hover);
    background: var(--surface);
  }

  .btn-icon {
    background: none;
    color: var(--text);
    border: 1px solid var(--border);
    cursor: pointer;
    width: 32px;
    height: 32px;
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.15s ease;
    flex-shrink: 0;
  }
  .btn-icon:hover {
    color: var(--text-secondary);
    border-color: var(--border-hover);
    background: var(--surface);
  }
  .btn-icon svg {
    width: 15px;
    height: 15px;
  }

  .icon-sun, .icon-moon { transition: opacity 0.2s, transform 0.3s; }
  [data-theme="dark"] .icon-sun  { display: none; }
  [data-theme="dark"] .icon-moon { display: block; }
  [data-theme="light"] .icon-sun  { display: block; }
  [data-theme="light"] .icon-moon { display: none; }

  /* ── Main ── */
  main {
    position: relative;
    z-index: 1;
    max-width: 620px;
    margin: 0 auto;
    padding: 28px 16px 120px;
  }

  /* ── Empty state ── */
  .empty {
    text-align: center;
    padding: 160px 24px 120px;
    animation: fadeIn 0.8s ease-out;
  }

  .empty-ring {
    width: 56px;
    height: 56px;
    margin: 0 auto 32px;
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .empty-ring::before {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: 50%;
    border: 1px solid var(--border);
    animation: ringFloat 5s ease-in-out infinite;
    transition: border-color 0.35s;
  }

  .empty-ring::after {
    content: '';
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background: var(--empty-muted);
    transition: background 0.35s;
  }

  @keyframes ringFloat {
    0%, 100% { transform: scale(1); }
    50% { transform: scale(1.08); }
  }

  .empty-label {
    font-size: 14px;
    font-weight: 400;
    color: var(--empty-muted);
    margin-bottom: 16px;
    letter-spacing: -0.01em;
    transition: color 0.35s;
  }

  .empty-detail {
    font-size: 12px;
    color: var(--text);
    line-height: 2;
    font-weight: 300;
    transition: color 0.35s;
  }

  .empty-detail code {
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    color: var(--text-secondary);
    background: var(--surface);
    padding: 2px 8px;
    border-radius: 4px;
    border: 1px solid var(--border);
    transition: all 0.35s;
  }

  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(12px); }
    to { opacity: 1; transform: translateY(0); }
  }

  /* ── Cards ── */
  .card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 20px;
    margin-bottom: 8px;
    position: relative;
    animation: cardIn 0.4s cubic-bezier(0.16, 1, 0.3, 1) backwards;
    transition: border-color 0.2s, box-shadow 0.3s, background 0.2s;
  }

  .card::before {
    content: '';
    position: absolute;
    left: 0;
    top: 12px;
    bottom: 12px;
    width: 2px;
    border-radius: 2px;
    background: linear-gradient(to bottom, var(--accent-secondary), var(--accent));
    opacity: 0.6;
    transition: opacity 0.2s;
  }

  .card:hover {
    border-color: var(--border-hover);
    background: var(--surface-hover);
    box-shadow: var(--card-hover-shadow);
  }

  .card:hover::before { opacity: 1; }

  .card.resolved { opacity: 0.35; }
  .card.resolved::before { background: var(--green); opacity: 0.4; }
  .card.resolved:hover {
    opacity: 0.45;
    box-shadow: var(--card-resolved-hover-shadow);
  }

  .card.removing {
    animation: cardOut 0.2s cubic-bezier(0.55, 0, 1, 0.45) forwards;
  }

  @keyframes cardIn {
    from { opacity: 0; transform: translateY(12px); }
    to { opacity: 1; transform: translateY(0); }
  }

  @keyframes cardOut {
    to { opacity: 0; transform: scale(0.96) translateY(-4px); }
  }

  .card-meta {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
  }

  .card-id {
    font-family: 'JetBrains Mono', monospace;
    font-size: 10px;
    color: var(--border-bright);
    letter-spacing: 0.04em;
    transition: color 0.35s;
  }

  .card-time {
    font-size: 11px;
    color: var(--text);
    font-weight: 400;
    letter-spacing: -0.01em;
    transition: color 0.35s;
  }

  .card-msg {
    font-size: 14px;
    font-weight: 400;
    line-height: 1.7;
    color: var(--text-bright);
    margin-bottom: 18px;
    word-break: break-word;
    letter-spacing: -0.01em;
    transition: color 0.35s;
  }

  /* Markdown content styles */
  .card-msg p { margin: 0 0 0.5em; }
  .card-msg p:last-child { margin-bottom: 0; }
  .card-msg h1, .card-msg h2, .card-msg h3, .card-msg h4 {
    font-family: 'Outfit', sans-serif;
    margin: 0.6em 0 0.3em;
    color: var(--text-white);
  }
  .card-msg h1 { font-size: 1.3em; }
  .card-msg h2 { font-size: 1.15em; }
  .card-msg h3 { font-size: 1.05em; }
  .card-msg code {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.88em;
    background: var(--accent-dim);
    border: 1px solid var(--border);
    padding: 1px 6px;
    border-radius: 4px;
    color: var(--accent);
  }
  .card-msg pre {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 12px 14px;
    overflow-x: auto;
    margin: 0.5em 0;
  }
  .card-msg pre code {
    background: none;
    border: none;
    padding: 0;
    font-size: 0.85em;
    color: var(--text-secondary);
  }
  .card-msg ul, .card-msg ol {
    padding-left: 1.4em;
    margin: 0.4em 0;
  }
  .card-msg li { margin: 0.15em 0; }
  .card-msg blockquote {
    border-left: 2px solid var(--accent-border);
    padding-left: 12px;
    margin: 0.5em 0;
    color: var(--text-secondary);
    font-style: italic;
  }
  .card-msg a {
    color: var(--accent);
    text-decoration: none;
    border-bottom: 1px solid var(--accent-border);
    transition: border-color 0.15s;
  }
  .card-msg a:hover { border-color: var(--accent); }
  .card-msg hr {
    border: none;
    border-top: 1px solid var(--border);
    margin: 0.8em 0;
  }
  .card-msg table {
    border-collapse: collapse;
    width: 100%;
    margin: 0.5em 0;
    font-size: 0.9em;
  }
  .card-msg th, .card-msg td {
    border: 1px solid var(--border);
    padding: 6px 10px;
    text-align: left;
  }
  .card-msg th {
    background: var(--surface);
    color: var(--text-secondary);
    font-weight: 500;
  }
  .card-msg img { max-width: 100%; border-radius: 4px; }

  .card-actions {
    display: flex;
    gap: 6px;
    justify-content: flex-end;
    align-items: center;
  }

  .btn {
    font-family: 'Outfit', sans-serif;
    font-size: 12px;
    font-weight: 400;
    padding: 5px 14px;
    border-radius: 6px;
    border: 1px solid transparent;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .btn-resolve {
    background: var(--green-dim);
    color: var(--green);
    border-color: var(--green-border);
  }
  .btn-resolve:hover {
    background: rgba(52, 211, 153, 0.12);
    border-color: rgba(52, 211, 153, 0.25);
  }
  [data-theme="dark"] .btn-resolve:hover {
    box-shadow: 0 0 16px rgba(52, 211, 153, 0.06);
  }

  .btn-delete {
    background: var(--red-dim);
    color: var(--red);
    border-color: var(--red-border);
  }
  .btn-delete:hover {
    background: rgba(248, 113, 113, 0.12);
    border-color: rgba(248, 113, 113, 0.25);
  }
  [data-theme="dark"] .btn-delete:hover {
    box-shadow: 0 0 16px rgba(248, 113, 113, 0.06);
  }

  .resolved-tag {
    font-size: 11px;
    color: var(--green);
    opacity: 0.6;
    display: flex;
    align-items: center;
    gap: 5px;
    font-weight: 400;
  }
  .resolved-tag svg { width: 12px; height: 12px; }

  /* ── Scrollbar ── */
  ::-webkit-scrollbar { width: 4px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }
  ::-webkit-scrollbar-thumb:hover { background: var(--border-hover); }

  ::selection {
    background: rgba(129, 140, 248, 0.2);
    color: var(--text-white);
  }

  /* ── Notification permission banner ── */
  .notif-banner {
    position: relative;
    z-index: 150;
    background: var(--accent-dim);
    border-bottom: 1px solid var(--accent-border);
    padding: 10px clamp(16px, 4vw, 40px);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    font-size: 12px;
    color: var(--text-secondary);
    animation: fadeIn 0.4s ease-out;
    transition: background 0.35s, border-color 0.35s;
  }

  .notif-banner-text {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .notif-banner-text svg {
    width: 16px;
    height: 16px;
    color: var(--accent);
    flex-shrink: 0;
  }

  .notif-banner-actions {
    display: flex;
    gap: 8px;
    align-items: center;
    flex-shrink: 0;
  }

  .btn-allow {
    font-family: 'Outfit', sans-serif;
    font-size: 12px;
    font-weight: 500;
    padding: 5px 16px;
    border-radius: 6px;
    border: 1px solid var(--accent-border);
    background: var(--accent-dim);
    color: var(--accent);
    cursor: pointer;
    transition: all 0.15s ease;
  }
  .btn-allow:hover {
    background: var(--accent);
    color: var(--text-white);
    border-color: var(--accent);
  }

  .btn-dismiss {
    font-family: 'Outfit', sans-serif;
    font-size: 12px;
    font-weight: 400;
    padding: 5px 12px;
    border-radius: 6px;
    border: 1px solid var(--border);
    background: none;
    color: var(--text);
    cursor: pointer;
    transition: all 0.15s ease;
  }
  .btn-dismiss:hover {
    border-color: var(--border-hover);
    color: var(--text-secondary);
  }

  .notif-banner.hiding {
    animation: bannerOut 0.25s ease-in forwards;
  }

  @keyframes bannerOut {
    to { opacity: 0; height: 0; padding: 0; margin: 0; overflow: hidden; }
  }

  @media (max-width: 520px) {
    header { padding: 0 14px; height: 48px; }
    .nav-title { font-size: 12px; }
    .card { padding: 16px; }
    main { padding: 20px 10px 100px; }
    .empty { padding: 100px 16px 80px; }
    .notif-banner { flex-direction: column; align-items: flex-start; gap: 8px; }
  }
</style>
</head>
<body>

  <div class="bg-grid"></div>
  <div class="ambient"></div>

  <header>
    <div class="nav-left">
      <div class="status" id="statusEl">
        <div class="status-dot"></div>
        <div class="status-glow"></div>
      </div>
      <span class="nav-title">notifications</span>
      <span class="nav-sep">/</span>
      <span class="nav-sub">claude-code</span>
    </div>
    <div class="nav-right">
      <span class="count zero" id="countEl">0</span><span class="count-label">active</span>
      <div class="nav-divider"></div>
      <button class="btn-icon" onclick="toggleTheme()" title="Toggle theme" aria-label="Toggle theme">
        <svg class="icon-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
        </svg>
        <svg class="icon-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
        </svg>
      </button>
      <button class="btn-ghost" onclick="clearAll()">Clear</button>
    </div>
  </header>

  <div class="notif-banner" id="notifBanner" style="display:none">
    <div class="notif-banner-text">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>
      </svg>
      Enable browser notifications to get alerts when new messages arrive
    </div>
    <div class="notif-banner-actions">
      <button class="btn-allow" onclick="requestNotifPermission()">Enable</button>
      <button class="btn-dismiss" onclick="dismissBanner()">Dismiss</button>
    </div>
  </div>

  <main id="list">
    <div class="empty">
      <div class="empty-ring"></div>
      <div class="empty-label">No notifications</div>
      <div class="empty-detail">
        Listening on <code>:9000/v1/notification</code><br>
        Waiting for incoming hooks
      </div>
    </div>
  </main>

<script>
  /* ── Theme ── */
  function getTheme() {
    var s = localStorage.getItem('notif-theme');
    if (s === 'light' || s === 'dark') return s;
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }
  function setTheme(t) {
    document.documentElement.setAttribute('data-theme', t);
    localStorage.setItem('notif-theme', t);
  }
  function toggleTheme() {
    setTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
  }
  setTheme(getTheme());

  /* ── Auth key from URL ── */
  var authKey = new URLSearchParams(window.location.search).get('key') || '';
  function authUrl(path) { return authKey ? path + (path.indexOf('?') === -1 ? '?' : '&') + 'key=' + encodeURIComponent(authKey) : path; }

  /* ── State ── */
  let items = {};

  function relTime(ts) {
    const s = Math.floor((Date.now() - ts) / 1000);
    if (s < 5) return "now";
    if (s < 60) return s + "s";
    if (s < 3600) return Math.floor(s / 60) + "m";
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function render() {
    const list = document.getElementById("list");
    const sorted = Object.values(items).sort((a, b) => b.ts - a.ts);
    const active = sorted.filter(n => !n.resolved);

    const el = document.getElementById("countEl");
    const c = active.length;
    el.textContent = c;
    el.className = c > 0 ? "count" : "count zero";

    document.title = c > 0
      ? "(" + c + ") notifications \\u00b7 claude-code"
      : "notifications \\u00b7 claude-code";

    if (sorted.length === 0) {
      list.innerHTML =
        '<div class="empty">'
        + '<div class="empty-ring"></div>'
        + '<div class="empty-label">No notifications</div>'
        + '<div class="empty-detail">Listening on <code>:9000/v1/notification</code><br>Waiting for incoming hooks</div>'
        + '</div>';
      return;
    }

    const chk = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
    list.innerHTML = sorted.map(function(n, i) {
      var cls = n.resolved ? "card resolved" : "card";
      var dly = "animation-delay:" + (i * 0.035) + "s";
      return '<div class="' + cls + '" id="card-' + n.id + '" style="' + dly + '">'
        + '<div class="card-meta">'
          + '<span class="card-id">' + n.id.slice(0, 8) + '</span>'
          + '<span class="card-time">' + relTime(n.ts) + '</span>'
        + '</div>'
        + '<div class="card-msg">' + renderMsg(n.msg) + '</div>'
        + '<div class="card-actions">'
          + (n.resolved
            ? '<span class="resolved-tag">' + chk + ' resolved</span> '
            : '<button class="btn btn-resolve" onclick="resolve(\\'' + n.id + '\\')">Resolve</button> ')
          + '<button class="btn btn-delete" onclick="remove(\\'' + n.id + '\\')">Delete</button>'
        + '</div>'
      + '</div>';
    }).join("");
  }

  function renderMsg(s) {
    if (typeof marked !== 'undefined' && marked.parse) {
      try { return marked.parse(s, { breaks: true }); } catch(e) {}
    }
    var d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  function resolve(id) {
    if (items[id]) items[id].resolved = true;
    render();
    fetch(authUrl("/v1/notification/" + id + "/resolve"), { method: "POST" });
  }

  function remove(id) {
    var el = document.getElementById("card-" + id);
    if (el) {
      el.classList.add("removing");
      setTimeout(function() { delete items[id]; render(); }, 220);
    } else {
      delete items[id];
      render();
    }
    fetch(authUrl("/v1/notification/" + id), { method: "DELETE" });
  }

  function clearAll() {
    items = {};
    render();
    fetch(authUrl("/v1/notifications"), { method: "DELETE" });
  }

  /* ── SSE ── */
  function connectSSE() {
    var status = document.getElementById("statusEl");
    var es = new EventSource(authUrl("/v1/stream"));

    es.onopen = function() { status.classList.remove("off"); };

    es.addEventListener("init", function(e) {
      var data = JSON.parse(e.data);
      items = {};
      data.forEach(function(n) { items[n.id] = n; });
      render();
    });

    es.addEventListener("new", function(e) {
      var n = JSON.parse(e.data);
      items[n.id] = n;
      render();
      if (Notification.permission === "granted") {
        new Notification("claude-code", { body: n.msg, tag: n.id });
      }
    });

    es.addEventListener("resolved", function(e) {
      var d = JSON.parse(e.data);
      if (items[d.id]) items[d.id].resolved = true;
      render();
    });

    es.addEventListener("deleted", function(e) {
      var d = JSON.parse(e.data);
      delete items[d.id];
      render();
    });

    es.addEventListener("cleared", function() {
      items = {};
      render();
    });

    es.onerror = function() {
      status.classList.add("off");
      es.close();
      setTimeout(connectSSE, 2000);
    };
  }

  /* ── Browser notification permission ── */
  function showBannerIfNeeded() {
    var banner = document.getElementById('notifBanner');
    if (!banner) return;
    if (!("Notification" in window)) { banner.style.display = 'none'; return; }
    if (Notification.permission === 'default' && !localStorage.getItem('notif-banner-dismissed')) {
      banner.style.display = '';
    } else {
      banner.style.display = 'none';
    }
  }

  function requestNotifPermission() {
    if (!("Notification" in window)) return;
    Notification.requestPermission().then(function(result) {
      hideBanner();
    });
  }

  function dismissBanner() {
    localStorage.setItem('notif-banner-dismissed', '1');
    hideBanner();
  }

  function hideBanner() {
    var banner = document.getElementById('notifBanner');
    if (banner) {
      banner.classList.add('hiding');
      setTimeout(function() { banner.style.display = 'none'; }, 260);
    }
  }

  showBannerIfNeeded();

  connectSSE();
  setInterval(render, 15000);
</script>
</body>
</html>`;

// ── Helpers ─────────────────────────────────────────────────
function parseBody(req) {
  return new Promise((resolve) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      try { resolve(JSON.parse(body)); }
      catch { resolve({}); }
    });
  });
}

function json(res, code, data) {
  res.writeHead(code, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(JSON.stringify(data));
}

// ── Server ──────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const path = url.pathname;
  const method = req.method;

  if (method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    });
    return res.end();
  }

  // ── Auth check ──
  // Accept key via: ?key=, Authorization: Bearer, or X-Auth-Key header
  if (AUTH_KEY) {
    const qkey = url.searchParams.get("key") || "";
    const hdr = (req.headers["authorization"] || "").replace(/^Bearer\s+/i, "");
    const xkey = req.headers["x-auth-key"] || "";
    if (qkey !== AUTH_KEY && hdr !== AUTH_KEY && xkey !== AUTH_KEY) {
      return json(res, 401, { error: "unauthorized" });
    }
  }

  // Serve UI
  if (path === "/" && method === "GET") {
    res.writeHead(200, { "Content-Type": "text/html" });
    return res.end(HTML);
  }

  // SSE stream
  if (path === "/v1/stream" && method === "GET") {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "Access-Control-Allow-Origin": "*",
    });
    const all = stmt.all.all().map(row2obj);
    res.write(`event: init\ndata: ${JSON.stringify(all)}\n\n`);
    clients.add(res);
    req.on("close", () => clients.delete(res));
    return;
  }

  // POST new notification
  if (path === "/v1/notification" && method === "POST") {
    const body = await parseBody(req);
    const msg = body.msg || body.message || body.text || JSON.stringify(body);
    const id = randomUUID();
    const ts = Date.now();
    stmt.insert.run(id, msg, ts);
    const entry = { id, msg, ts, resolved: false };
    broadcast("new", entry);
    console.log(`[+] ${id.slice(0, 8)} — ${msg.slice(0, 80)}`);
    return json(res, 201, { ok: true, id });
  }

  // Resolve
  const resolveMatch = path.match(/^\/v1\/notification\/([\w-]+)\/resolve$/);
  if (resolveMatch && method === "POST") {
    const id = resolveMatch[1];
    const r = stmt.resolve.run(id);
    if (r.changes) broadcast("resolved", { id });
    return json(res, 200, { ok: true });
  }

  // Delete one
  const deleteMatch = path.match(/^\/v1\/notification\/([\w-]+)$/);
  if (deleteMatch && method === "DELETE") {
    const id = deleteMatch[1];
    stmt.del.run(id);
    broadcast("deleted", { id });
    return json(res, 200, { ok: true });
  }

  // Clear all
  if (path === "/v1/notifications" && method === "DELETE") {
    stmt.clear.run();
    broadcast("cleared", {});
    return json(res, 200, { ok: true });
  }

  json(res, 404, { error: "not found" });
});

// Graceful shutdown — close db
process.on("SIGINT", () => { db.close(); process.exit(0); });
process.on("SIGTERM", () => { db.close(); process.exit(0); });

server.listen(PORT, () => {
  const keyInfo = AUTH_KEY ? `  │  Key:      ${AUTH_KEY.slice(0, 4)}${'*'.repeat(Math.max(0, AUTH_KEY.length - 4))}` : '  │  Auth:     disabled';
  const uiUrl = AUTH_KEY ? `http://localhost:${PORT}/?key=${AUTH_KEY}` : `http://localhost:${PORT}`;
  console.log(`
  ┌──────────────────────────────────────────┐
  │  claude-code notification server          │
  │                                           │
  │  UI:       ${uiUrl}${' '.repeat(Math.max(1, 34 - uiUrl.length))}│
${keyInfo}${' '.repeat(Math.max(1, 44 - keyInfo.length))}│
  │  DB:       notifications.db               │
  │                                           │
  │  POST :${PORT}/v1/notification               │
  │  { "msg": "…" }                           │
  └──────────────────────────────────────────┘
  `);
});
