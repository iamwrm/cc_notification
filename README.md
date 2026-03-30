# cc_notification

Self-hosted notification dashboard for [claude-code](https://docs.anthropic.com/en/docs/claude-code) hooks. Real-time push, SQLite persistence, light/dark theme, optional auth.

## Prerequisites

Install Node.js via [nvm](https://github.com/nvm-sh/nvm) (recommended):

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
nvm install --lts
```

## Install

```bash
git clone https://github.com/iamwrm/cc_notification.git
cd cc_notification
npm install
```

## Start

```bash
node server.js
```

With options:

```bash
node server.js --port 9000 --key=SECRET --db=./data/notifications.db
```

| Flag | Default | Description |
|---|---|---|
| `--port` | `9000` | HTTP port |
| `--key` | _(none)_ | Auth key — when set, all requests require it |
| `--db` | `./notifications.db` | Path to SQLite database file |
| `--help` | | Show usage |

Open the URL printed on startup:

```
  ┌──────────────────────────────────────────┐
  │  claude-code notification server          │
  │                                           │
  │  UI:       http://localhost:9000/?key=…   │
  │  Key:      SECR******                     │
  │  DB:       notifications.db               │
  │                                           │
  │  POST :9000/v1/notification               │
  │  { "msg": "…" }                           │
  └──────────────────────────────────────────┘
```

## Send a notification

```bash
# no auth
curl -X POST http://localhost:9000/v1/notification \
  -H 'Content-Type: application/json' \
  -d '{"msg":"build finished"}'

# with auth (query param)
curl -X POST "http://localhost:9000/v1/notification?key=SECRET" \
  -H 'Content-Type: application/json' \
  -d '{"msg":"build finished"}'

# with auth (bearer header)
curl -X POST http://localhost:9000/v1/notification \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer SECRET' \
  -d '{"msg":"build finished"}'
```

## Features

- **Real-time** — SSE push, notifications appear instantly
- **Persistent** — SQLite (WAL mode), survives restarts
- **Auth** — optional `--key` flag, supports query param / Bearer / X-Auth-Key header
- **Themes** — dark (default) + light, toggle in header, saved to localStorage
- **Browser notifications** — permission prompt on first visit
- **Single file** — entire server + UI in one `server.js`

## Docs

See [docs/dev_guide.md](docs/dev_guide.md) for API reference, SQLite schema, claude-code hook integration, and development guide.

## License

MIT
