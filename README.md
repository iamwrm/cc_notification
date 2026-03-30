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

### Plain text

```bash
curl -X POST http://localhost:9000/v1/notification \
  -H 'Content-Type: application/json' \
  -d '{"msg":"build finished"}'
```

### Markdown

Messages are rendered as markdown ([marked.js](https://marked.js.org/)). Headings, bold, code blocks, lists, tables, links, blockquotes all work.

```bash
curl -X POST http://localhost:9000/v1/notification \
  -H 'Content-Type: application/json' \
  -d '{"msg":"## Build Report\n\n**Status:** ✅ passed\n\n- `47` modules compiled\n- `0` errors\n\n```js\nconsole.log(done)\n```"}'
```

Renders as:

> ## Build Report
> **Status:** ✅ passed
> - `47` modules compiled
> - `0` errors
> ```js
> console.log(done)
> ```

### HTML

Since markdown passes through HTML, you can embed raw HTML:

```bash
curl -X POST http://localhost:9000/v1/notification \
  -H 'Content-Type: application/json' \
  -d '{"msg":"<b>Alert</b>: server <code>web-03</code> is <span style=\\"color:red\\">down</span>"}'
```

### Escaping special characters

The `msg` value is inside a JSON string, so special characters must be escaped for JSON:

| Character | Escape as | Example |
|---|---|---|
| `"` | `\"` | `{"msg":"she said \"hello\""}` |
| `\` | `\\` | `{"msg":"path: C:\\\\Users"}` |
| newline | `\n` | `{"msg":"line one\nline two"}` |
| tab | `\t` | `{"msg":"col1\tcol2"}` |

For markdown special characters (`*`, `_`, `` ` ``, `#`, `|`, etc.), escape with a backslash *inside* the message:

```bash
# Literal asterisks (not bold)
curl -X POST http://localhost:9000/v1/notification \
  -H 'Content-Type: application/json' \
  -d '{"msg":"price is 5 \\*each\\*"}'

# Literal backticks
curl -X POST http://localhost:9000/v1/notification \
  -H 'Content-Type: application/json' \
  -d '{"msg":"use \\`echo\\` command"}'
```

> **Tip:** Use a tool or language to build the JSON instead of hand-escaping:
>
> ```bash
> # jq handles all escaping for you
> MSG="Deploy **v2.1** to prod
> - 3 services updated
> - \`zero\` downtime"
> jq -n --arg m "$MSG" '{msg: $m}' | \
>   curl -X POST http://localhost:9000/v1/notification \
>     -H 'Content-Type: application/json' -d @-
> ```

### With auth

```bash
# query param
curl -X POST "http://localhost:9000/v1/notification?key=SECRET" \
  -H 'Content-Type: application/json' \
  -d '{"msg":"build finished"}'

# bearer header
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
- **Markdown** — messages render as markdown (headings, code blocks, lists, tables, etc.)
- **Single file** — entire server + UI in one `server.js`

## Docs

See [docs/dev_guide.md](docs/dev_guide.md) for API reference, SQLite schema, claude-code hook integration, and development guide.

## License

MIT
