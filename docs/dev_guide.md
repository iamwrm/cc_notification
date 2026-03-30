# claude-code notification server — dev guide

A self-hosted notification dashboard for [claude-code](https://docs.anthropic.com/en/docs/claude-code) hooks. Real-time SSE push, SQLite persistence, light/dark theme, optional auth key.

## Quick start

```bash
npm install            # one-time: installs better-sqlite3
node server.js         # no auth
node server.js SECRET  # with auth key
```

The server prints a banner with the full UI URL on startup.

## Architecture

```
server.js          single-file Node.js server (no framework)
notifications.db   SQLite database (auto-created, WAL mode)
docs/              documentation
```

**Stack:** Node `http` module · `better-sqlite3` · SSE (Server-Sent Events) · vanilla HTML/CSS/JS frontend embedded in the server file.

### Data flow

```
curl POST ──▶ server.js ──▶ SQLite INSERT
                 │
                 ├──▶ SSE broadcast ──▶ browser (real-time)
                 └──▶ console.log
```

On page load the browser opens an SSE connection at `/v1/stream`. The server sends an `init` event with all existing rows from SQLite. Subsequent `new`, `resolved`, `deleted`, and `cleared` events are pushed in real-time.

## Authentication

Pass a key as the first CLI argument:

```bash
node server.js mySecretKey
```

When a key is set **every** request (UI, SSE, API) must include it via one of:

| Method | Example |
|---|---|
| Query param | `?key=mySecretKey` |
| Bearer header | `Authorization: Bearer mySecretKey` |
| Custom header | `X-Auth-Key: mySecretKey` |

Without a valid key the server returns `401 { "error": "unauthorized" }`.

When no key argument is provided, auth is disabled and all endpoints are open.

## API

All endpoints return JSON. Base URL: `http://localhost:9000`

### Send a notification

```bash
curl -X POST http://localhost:9000/v1/notification \
  -H 'Content-Type: application/json' \
  -d '{"msg":"build finished"}'
```

With auth:

```bash
curl -X POST "http://localhost:9000/v1/notification?key=SECRET" \
  -H 'Content-Type: application/json' \
  -d '{"msg":"build finished"}'

# or with Bearer header
curl -X POST http://localhost:9000/v1/notification \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer SECRET' \
  -d '{"msg":"build finished"}'
```

**Response:** `201 { "ok": true, "id": "uuid" }`

The `msg` field is preferred, but `message` and `text` are also accepted.

### Resolve a notification

```bash
curl -X POST http://localhost:9000/v1/notification/<id>/resolve
```

### Delete a notification

```bash
curl -X DELETE http://localhost:9000/v1/notification/<id>
```

### Clear all notifications

```bash
curl -X DELETE http://localhost:9000/v1/notifications
```

### SSE stream

```bash
curl -N http://localhost:9000/v1/stream
```

Events:

| Event | Payload | When |
|---|---|---|
| `init` | `[{id, msg, ts, resolved}, ...]` | On connect (full state) |
| `new` | `{id, msg, ts, resolved}` | New notification created |
| `resolved` | `{id}` | Notification marked resolved |
| `deleted` | `{id}` | Notification deleted |
| `cleared` | `{}` | All notifications cleared |

## Web UI

Open in browser: `http://localhost:9000` (or `http://localhost:9000/?key=SECRET` with auth).

Features:

- **Real-time** — notifications appear instantly via SSE
- **Dark / light theme** — toggle with the moon/sun icon; saved to `localStorage`, defaults to system preference
- **Browser notifications** — permission banner prompts on first visit; click "Enable" to allow Chrome desktop notifications
- **Resolve / delete** — per-notification actions
- **Clear all** — removes everything from the database
- **Persistent** — notifications survive server restarts (SQLite)

## SQLite

The database file `notifications.db` is created in the project root on first run. It uses WAL mode for concurrent reads during writes.

Schema:

```sql
CREATE TABLE notifications (
  id       TEXT PRIMARY KEY,
  msg      TEXT    NOT NULL,
  ts       INTEGER NOT NULL,
  resolved INTEGER NOT NULL DEFAULT 0
);
```

To inspect:

```bash
# requires sqlite3 CLI, or use node:
node -e "
  const db = require('better-sqlite3')('./notifications.db');
  console.table(db.prepare('SELECT * FROM notifications ORDER BY ts DESC').all());
  db.close();
"
```

To reset:

```bash
rm notifications.db   # deleted on next server start a fresh DB is created
```

## claude-code hook integration

Add a hook to your claude-code config that POSTs to this server on events you care about:

```json
{
  "hooks": {
    "notification": [
      {
        "type": "command",
        "command": "curl -sS -X POST http://localhost:9000/v1/notification?key=SECRET -H 'Content-Type: application/json' -d '{\"msg\":\"$CLAUDE_EVENT\"}'"
      }
    ]
  }
}
```

## Development

The entire app is a single `server.js` file. The HTML/CSS/JS frontend is embedded as a template literal (`const HTML = ...`).

To modify:

1. Edit the CSS/HTML/JS inside the `HTML` constant in `server.js`
2. Kill and restart: `pkill -f "node server.js"; node server.js SECRET`
3. Hard-refresh the browser (`Ctrl+Shift+R`)

### Key code sections

| Section | Description |
|---|---|
| Lines 1–45 | SQLite setup, prepared statements |
| `const HTML = ...` | Entire frontend (CSS + HTML + JS) |
| `parseBody`, `json` | HTTP helpers |
| `http.createServer(...)` | Route handler with auth check |
| `process.on("SIGINT/SIGTERM")` | Graceful shutdown, `db.close()` |

### Port

Default is `9000`, hardcoded in `const PORT = 9000`. Change it at the top of `server.js`.
