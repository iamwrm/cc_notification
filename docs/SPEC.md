# cc_notification — specification

## Overview

A single-file, self-hosted notification server for [claude-code](https://docs.anthropic.com/en/docs/claude-code) hooks. Producers push messages via HTTP POST; consumers view them in a real-time web dashboard.

## System diagram

```
                         ┌──────────────┐
  curl / hook / script ──▶  POST /v1/   │
                         │  notification │
                         └──────┬───────┘
                                │
                    ┌───────────▼───────────┐
                    │     server.js          │
                    │                        │
                    │  ┌──────────────────┐  │
                    │  │  SQLite (WAL)    │  │
                    │  │  notifications   │  │
                    │  └──────────────────┘  │
                    │                        │
                    │  SSE broadcast ────────┼──▶ browser tab 1
                    │                   ────┼──▶ browser tab 2
                    │                   ────┼──▶ browser tab N
                    └───────────────────────┘
                                │
                    ┌───────────▼───────────┐
                    │     GET /             │
                    │     Web UI (embedded) │
                    └───────────────────────┘
```

## Requirements

### Functional

| ID | Requirement |
|----|-------------|
| F1 | Accept notifications via `POST /v1/notification` with a JSON body containing `msg`, `message`, or `text` |
| F2 | Store notifications persistently in SQLite; survive server restarts |
| F3 | Serve a single-page web dashboard at `GET /` |
| F4 | Push real-time updates to all connected browsers via SSE at `GET /v1/stream` |
| F5 | Support resolving a notification via `POST /v1/notification/:id/resolve` |
| F6 | Support deleting a single notification via `DELETE /v1/notification/:id` |
| F7 | Support clearing all notifications via `DELETE /v1/notifications` |
| F8 | Render notification messages as markdown (via marked.js); fall back to plain text if CDN is unavailable |
| F9 | Support light and dark themes; persist preference to `localStorage`; default to system `prefers-color-scheme` |
| F10 | Request browser notification permission via user gesture; show desktop notifications for new messages |
| F11 | Optional auth key via CLI; when set, all endpoints require the key |

### Non-functional

| ID | Requirement |
|----|-------------|
| N1 | Single-file server — no build step, no framework |
| N2 | Zero-dependency frontend — HTML/CSS/JS embedded in server.js; only external resource is marked.js CDN |
| N3 | Minimal npm dependencies — only `better-sqlite3` |
| N4 | Graceful shutdown — close SQLite on SIGINT/SIGTERM |
| N5 | CORS enabled for all origins |

## CLI

```
node server.js [options]

Options:
  --port <number>   HTTP port (default: 9000)
  --key <string>    Auth key; when set, every request must include it
  --db <path>       Path to SQLite database file (default: ./notifications.db)
  --help, -h        Show usage and exit
```

## Authentication

When `--key` is provided, every request must authenticate via one of:

| Method | Format |
|--------|--------|
| Query parameter | `?key=<KEY>` |
| Authorization header | `Authorization: Bearer <KEY>` |
| Custom header | `X-Auth-Key: <KEY>` |

Unauthenticated requests receive `401 { "error": "unauthorized" }`.

When no key is provided, all endpoints are open.

## API

Base URL: `http://localhost:<port>`

### `POST /v1/notification`

Create a new notification.

**Request body:**

```json
{ "msg": "your message (plain text, markdown, or HTML)" }
```

Also accepts `message` or `text` as the field name. If none match, the entire body is stringified.

**Response:** `201`

```json
{ "ok": true, "id": "uuid" }
```

**Side effects:**
- Row inserted into SQLite
- SSE `new` event broadcast to all connected clients
- Logged to stdout: `[+] <id_prefix> — <msg_preview>`

### `POST /v1/notification/:id/resolve`

Mark a notification as resolved.

**Response:** `200 { "ok": true }`

**Side effects:**
- SQLite row updated (`resolved = 1`)
- SSE `resolved` event broadcast

### `DELETE /v1/notification/:id`

Delete a single notification.

**Response:** `200 { "ok": true }`

**Side effects:**
- SQLite row deleted
- SSE `deleted` event broadcast

### `DELETE /v1/notifications`

Clear all notifications.

**Response:** `200 { "ok": true }`

**Side effects:**
- All SQLite rows deleted
- SSE `cleared` event broadcast

### `GET /v1/stream`

SSE (Server-Sent Events) stream for real-time updates.

**Events:**

| Event | Payload | Trigger |
|-------|---------|---------|
| `init` | `[{id, msg, ts, resolved}, ...]` | On connection (full current state) |
| `new` | `{id, msg, ts, resolved}` | New notification created |
| `resolved` | `{id}` | Notification resolved |
| `deleted` | `{id}` | Notification deleted |
| `cleared` | `{}` | All notifications cleared |

### `GET /`

Serves the embedded HTML/CSS/JS web dashboard.

### `OPTIONS *`

CORS preflight. Returns `204` with permissive headers.

## Database

**Engine:** SQLite via `better-sqlite3`

**Pragmas:**
- `journal_mode = WAL` (concurrent reads during writes)
- `synchronous = normal`

**Schema:**

```sql
CREATE TABLE IF NOT EXISTS notifications (
  id       TEXT    PRIMARY KEY,
  msg      TEXT    NOT NULL,
  ts       INTEGER NOT NULL,      -- Unix ms timestamp
  resolved INTEGER NOT NULL DEFAULT 0  -- 0 = active, 1 = resolved
);
```

**File:** defaults to `./notifications.db`, configurable with `--db`.

Auto-created on first run. Delete the file to reset.

## Notification data model

```typescript
interface Notification {
  id: string;        // UUIDv4
  msg: string;       // message body (plain text / markdown / HTML)
  ts: number;        // Date.now() at creation
  resolved: boolean; // false = active, true = resolved
}
```

## Web UI

### Layout

```
┌─────────────────────────────────────────────────────────┐
│ header: status dot · title · count · theme toggle · clear│
├─────────────────────────────────────────────────────────┤
│ [notification permission banner — shown once]            │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌─ card ─────────────────────────────────────────────┐ │
│  │ id_prefix                              relative_time│ │
│  │                                                     │ │
│  │ rendered markdown message                           │ │
│  │                                                     │ │
│  │                          [Resolve] [Delete]         │ │
│  └─────────────────────────────────────────────────────┘ │
│                                                         │
│  ┌─ card (resolved) ──────────────────────────────────┐ │
│  │ ...                                   ✓ resolved   │ │
│  └─────────────────────────────────────────────────────┘ │
│                                                         │
│  (or empty state when no notifications)                  │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### Features

| Feature | Implementation |
|---------|---------------|
| Real-time updates | SSE via `EventSource` at `/v1/stream` |
| Markdown rendering | `marked.js` v17 UMD from jsDelivr CDN; `breaks: true` |
| Theme toggle | `data-theme` attribute on `<html>`; dark/light CSS variable sets |
| Theme persistence | `localStorage` key `notif-theme` |
| System theme default | `prefers-color-scheme` media query |
| Browser notifications | `Notification.requestPermission()` on user click (Chrome requirement) |
| Permission banner | Shown when `Notification.permission === "default"` and not dismissed |
| Banner dismiss | Saved to `localStorage` key `notif-banner-dismissed` |
| Auth passthrough | `?key=` from URL passed to all fetch/SSE calls |
| Relative timestamps | Updates every 15s via `setInterval` |
| Optimistic UI | Resolve/delete/clear update state immediately before server response |
| SSE echo suppression | Pending sets prevent redundant renders from own echoed events |

### Design

- **Aesthetic:** Factory.ai-inspired dark premium tech
- **Fonts:** Outfit (UI) + JetBrains Mono (code/data) via Google Fonts
- **Dark theme:** near-black `#050507` background, indigo `#818CF8` accent, subtle dot grid, ambient glow orb
- **Light theme:** warm cream `#F5F2EB` background, indigo `#6366F1` accent
- **Cards:** dark surface, gradient left accent line, glow on hover (dark) / shadow on hover (light)
- **Animations:** card entry (slide up), card delete (fade + collapse), status dot pulse

### Markdown styling

The `.card-msg` container styles rendered markdown elements:
- Headings (h1–h4)
- Inline `code` and fenced code blocks
- Unordered/ordered lists
- Blockquotes
- Tables
- Links
- Horizontal rules
- Images

## File structure

```
cc_notification/
├── server.js              # server + embedded frontend (single file)
├── package.json
├── package-lock.json
├── lib/
│   └── client_state.js    # extracted UI state logic (testable)
├── test/
│   └── client_state.test.js  # unit tests (node --test)
├── docs/
│   ├── SPEC.md            # this file
│   └── dev_guide.md       # API reference, dev workflow
├── README.md              # quick start, usage
├── docs/
│   ├── handoff.md         # session handoff notes (resolved)
├── .gitignore
└── notifications.db       # auto-created, gitignored
```

## Known issues

None currently open.

### Delete double-flicker (resolved)

Clicking Delete previously caused a visible double flicker on remaining cards. Root cause: the `cardIn` CSS animation was baked into `.card` and could replay on DOM reflow when a sibling was removed. Fixed by moving the animation to a `.card-enter` class that is stripped after `animationend`. Also replaced `setInterval(render, 15000)` with targeted timestamp-only updates. See [docs/handoff.md](handoff.md) for full details.
