# Handoff

## Current goal

Fix a UI bug where clicking **Delete** on a notification still causes a visible **double flicker / double refresh** in the web UI.

The user says:
- **Resolve** button is fine
- **Delete** still visibly flickers twice
- The latest attempted fix did **not** solve the issue

## Current repo state

Uncommitted changes exist.

### Modified / new files
- `server.js`
- `package.json`
- `lib/client_state.js`
- `test/client_state.test.js`

### Git status at handoff
```bash
 M package.json
 M server.js
?? lib/
?? test/
```

### Recent commits
```bash
75cb497 fix: prevent double render on delete/resolve/clear
f2bd081 docs: add markdown, HTML, and escaping guide to README
5b855db fix: use correct marked.js UMD path for v17
3296ecb feat: render markdown in notifications via marked.js
27111ff feat: add --db flag for custom database path
```

## What has already been tried

### 1. SSE echo suppression
Added optimistic-action suppression so local UI changes ignore echoed SSE events from the server.

Client-side state now includes:
- `pendingDeletes`
- `pendingResolves`
- `pendingClear`

SSE handlers for:
- `resolved`
- `deleted`
- `cleared`

were updated to skip redundant renders when the local client already initiated the action.

### 2. Delete path changed to avoid full render
Delete was changed from:
- animate card
- full `render()` after timeout

to:
- animate card
- remove DOM node directly
- only update header meta unless it was the last card

### 3. CSS delete animation refactor
Delete animation was changed from a simple keyframe fade to a more systematic collapse:
- fix initial height with `offsetHeight`
- add `.removing`
- then add `.collapsing`
- transition:
  - opacity
  - transform
  - height
  - margin
  - padding
  - border width

### 4. Unit tests were added
A small state machine abstraction was introduced:
- `lib/client_state.js`
- `test/client_state.test.js`

These tests pass, but they only validate **state transitions**, not the actual DOM flicker behavior.

## Test status

`npm test` currently passes:

- optimistic resolve ignores echoed SSE
- optimistic delete ignores echoed SSE
- delete of non-last card only needs meta update
- delete of last card needs full render
- external delete still triggers render
- optimistic clear ignores echoed SSE

So the remaining issue is likely **DOM / animation / layout / repaint related**, not just state logic.

## Likely root cause area now

The bug is probably one of these:

1. **Card DOM removal + layout collapse** is still causing a visible repaint of siblings that looks like a second flicker.
2. The delete button / card click path may be triggering more than one visual state change.
3. There may still be a hidden `render()` happening from another path not yet traced.
4. Replacing `list.innerHTML` elsewhere may be happening near delete timing.
5. CSS transitions on `.card`, `.card.removing`, `.card.collapsing`, plus hover/border/shadow transitions may be interacting badly.

## Best next step

Do this **with browser automation**, not just unit tests.

### Recommended approach
Use Playwright or Puppeteer to create a true repro test:

1. Start server
2. Open UI in browser
3. Seed 2–3 notifications
4. Click **Delete** on one card
5. Instrument the page to count renders / DOM mutations
6. Optionally record screenshots/video or inspect mutation count

### Useful instrumentation ideas
Add temporary browser-side debugging in `server.js` frontend JS:
- increment `window.__renderCount` inside `render()`
- log from:
  - `remove(id)`
  - `setTimeout(...)` inside delete
  - SSE `deleted` handler
- attach `MutationObserver` to `#list`
- log class changes on the deleted card

Then assert:
- expected `render()` count for a delete
- whether `#list.innerHTML` gets replaced
- whether sibling cards are recreated

## Important code areas

### Frontend logic in `server.js`
Search for:
- `function render()`
- `function remove(id)`
- `es.addEventListener("deleted"`)
- CSS classes:
  - `.card`
  - `.card.removing`
  - `.card.collapsing`

### Current delete flow summary
In `server.js` frontend JS:
- `remove(id)` adds `pendingDeletes`
- finds `#card-${id}`
- sets explicit height
- adds `removing`
- in `requestAnimationFrame`, adds `collapsing`
- after `220ms`:
  - deletes from `items`
  - removes DOM node
  - clears pending flag
  - calls either `updateMeta()` or `render()` if last item
- sends `fetch(..., { method: "DELETE" })`
- SSE `deleted` ignores event if `pendingDeletes.has(id)`

## Server run note
The user explicitly requested:
- **always use `nohup` when running the server**

Use something like:

```bash
cd /home/wr/gh/try_glm5
pkill -f "node server.js" 2>/dev/null || true
nohup node server.js >/tmp/cc_notification.log 2>&1 &
```

## Current CLI
Server supports:
```bash
node server.js --port 9000 --key=SECRET --db=./notifications.db
```

## If resuming work
Suggested order:

1. Keep current uncommitted work intact
2. Add browser-level repro/instrumentation test
3. Confirm exact number of renders / mutations on delete
4. Fix based on observed DOM behavior
5. Re-test manually and via automation
6. Commit only once the visual flicker is truly gone
