# Handoff

## Status: ✅ Delete flicker bug — RESOLVED

The delete double-flicker bug has been fixed and verified by the user.

## What was the bug

Clicking **Delete** on a notification card caused all remaining cards to visibly flicker — resolved cards (opacity 0.35) would briefly flash to full brightness then re-dim.

## Root cause

The `.card` CSS class had `animation: cardIn 0.4s ... backwards` baked in permanently. The `cardIn` keyframes animate `opacity: 0 → 1`. With `animation-fill-mode: backwards`, cards start at opacity 0 during any delay period.

When a sibling card was removed from the DOM, the browser could re-evaluate/re-trigger this animation on remaining cards. For resolved cards (normally `opacity: 0.35`), this caused a visible flash through `opacity: 0 → 1 → 0.35`.

Additionally, `setInterval(render, 15000)` called the full `render()` to update relative timestamps, which destroyed and recreated ALL card DOM elements via `innerHTML`, replaying the `cardIn` animation every 15 seconds.

## What was fixed

### 1. Separated card entry animation from base card style
- Moved `animation: cardIn` from `.card` to a new `.card-enter` class
- `render()` adds `card-enter` to freshly created cards
- Each card's `animationend` event removes `card-enter` so the animation can never replay
- When `remove()` does instant DOM removal, siblings have no animation to re-trigger

### 2. Replaced full render interval with targeted time update
- `setInterval(render, 15000)` replaced with a function that only updates `.card-time` text content in-place
- No DOM destruction, no animation replay

### 3. SSE echo suppression (optimistic UI)
- `pendingDeletes`, `pendingResolves`, `pendingClear` sets prevent redundant renders from own echoed SSE events
- SSE `deleted` handler clears the pending flag on echo

### 4. Instant DOM removal for delete
- `remove(id)` deletes the item from state and removes the DOM node immediately
- Only calls `render()` if it was the last card (to show empty state)
- Otherwise just calls `updateMeta()` to update the counter

### 5. Hover suppression during delete
- `body.suppress-hover` class prevents sibling cards from gaining hover styles as they shift under the cursor during delete
- Released on next `pointermove` / `pointerdown` event
- Deleted card gets `hover-lock` class to preserve its hover appearance during fade

### 6. Server version auto-reload
- Server generates a `SERVER_VERSION` on startup
- SSE stream sends a `version` event on connection
- Client compares against embedded `CLIENT_SERVER_VERSION`; mismatches trigger `location.reload()`
- HTML served with `Cache-Control: no-store`

## Files changed

- `server.js` — all frontend CSS/JS changes + server version + cache headers
- `package.json` — description, main, test script
- `lib/client_state.js` — extracted state machine for testing
- `test/client_state.test.js` — unit tests for optimistic UI state

## Test status

`npm test` passes all 6 tests:
- optimistic resolve ignores echoed SSE
- optimistic delete ignores echoed SSE
- delete of non-last card only needs meta update
- delete of last card needs full render
- external delete still triggers render
- optimistic clear ignores echoed SSE

## Server run note

Always use `nohup` when running the server:

```bash
cd /home/wr/gh/try_glm5
pkill -f "node server.js" 2>/dev/null || true
nohup node server.js >/tmp/cc_notification.log 2>&1 &
```
