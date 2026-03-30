const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createClientState,
  beginResolve,
  receiveResolved,
  beginDelete,
  finalizeDelete,
  receiveDeleted,
  beginClear,
  receiveCleared,
} = require('../lib/client_state');

function sampleItems() {
  return {
    a: { id: 'a', msg: 'A', ts: 1, resolved: false },
    b: { id: 'b', msg: 'B', ts: 2, resolved: false },
  };
}

test('resolved SSE echo is ignored after optimistic resolve', () => {
  const state = createClientState(sampleItems());
  assert.deepEqual(beginResolve(state, 'a'), { render: 'full' });
  assert.equal(state.items.a.resolved, true);
  assert.deepEqual(receiveResolved(state, 'a'), { ignored: true });
  assert.equal(state.pendingResolves.has('a'), false);
});

test('deleted SSE echo is ignored while delete is pending', () => {
  const state = createClientState(sampleItems());
  assert.deepEqual(beginDelete(state, 'a'), { animate: true });
  assert.deepEqual(receiveDeleted(state, 'a'), { ignored: true });
  assert.ok(state.items.a, 'item should remain until local animation completes');
});

test('finalizeDelete only needs meta update when other cards remain', () => {
  const state = createClientState(sampleItems());
  beginDelete(state, 'a');
  assert.deepEqual(finalizeDelete(state, 'a'), { render: 'meta' });
  assert.equal(state.items.a, undefined);
  assert.ok(state.items.b);
});

test('finalizeDelete requests full render when last card is removed', () => {
  const state = createClientState({ a: { id: 'a', msg: 'A', ts: 1, resolved: false } });
  beginDelete(state, 'a');
  assert.deepEqual(finalizeDelete(state, 'a'), { render: 'full' });
  assert.deepEqual(state.items, {});
});

test('external deleted event removes item and requests full render', () => {
  const state = createClientState(sampleItems());
  assert.deepEqual(receiveDeleted(state, 'a'), { render: 'full' });
  assert.equal(state.items.a, undefined);
});

test('cleared SSE echo is ignored after optimistic clear', () => {
  const state = createClientState(sampleItems());
  assert.deepEqual(beginClear(state), { render: 'full' });
  assert.deepEqual(receiveCleared(state), { ignored: true });
  assert.equal(state.pendingClear, false);
});
