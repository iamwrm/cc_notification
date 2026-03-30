function createClientState(items = {}) {
  return {
    items: { ...items },
    pendingDeletes: new Set(),
    pendingResolves: new Set(),
    pendingClear: false,
  };
}

function beginResolve(state, id) {
  state.pendingResolves.add(id);
  if (state.items[id]) state.items[id].resolved = true;
  return { render: "full" };
}

function receiveResolved(state, id) {
  if (state.pendingResolves.has(id)) {
    state.pendingResolves.delete(id);
    return { ignored: true };
  }
  if (state.items[id] && !state.items[id].resolved) {
    state.items[id].resolved = true;
    return { render: "full" };
  }
  return { ignored: true };
}

function beginDelete(state, id) {
  state.pendingDeletes.add(id);
  return { animate: true };
}

function finalizeDelete(state, id) {
  delete state.items[id];
  state.pendingDeletes.delete(id);
  return { render: Object.keys(state.items).length === 0 ? "full" : "meta" };
}

function receiveDeleted(state, id) {
  if (state.pendingDeletes.has(id)) {
    return { ignored: true };
  }
  if (state.items[id]) {
    delete state.items[id];
    return { render: "full" };
  }
  return { ignored: true };
}

function beginClear(state) {
  state.pendingClear = true;
  state.items = {};
  return { render: "full" };
}

function receiveCleared(state) {
  if (state.pendingClear) {
    state.pendingClear = false;
    return { ignored: true };
  }
  if (Object.keys(state.items).length > 0) {
    state.items = {};
    return { render: "full" };
  }
  return { ignored: true };
}

module.exports = {
  createClientState,
  beginResolve,
  receiveResolved,
  beginDelete,
  finalizeDelete,
  receiveDeleted,
  beginClear,
  receiveCleared,
};
