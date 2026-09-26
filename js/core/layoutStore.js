// Friendly Party Rental — Layout state store with undo/redo history
// Central source of truth for everything placed in the event layout.
// Framework-free so it can be used from the existing script.js today
// and from future UI modules without a rewrite.

function cloneState(state) {
  return JSON.parse(JSON.stringify(state));
}

function emptyState() {
  return { tentId: null, objects: [], zones: [], aisles: [] };
}

export function createLayoutStore(initialState, options = {}) {
  let state = initialState ? cloneState(initialState) : emptyState();
  let past = [];
  let future = [];
  let listeners = [];

function notify() {
  listeners.forEach(function (fn) { fn(state); });
}

function getState() {
  return state;
}

function subscribe(fn) {
  listeners.push(fn);
  return function unsubscribe() {
    listeners = listeners.filter(function (l) { return l !== fn; });
  };
}

// Optional scene context participates in the same timeline as rental edits.
function historyEntry() {
  return { layout: cloneState(state), context: options.captureContext ? cloneState(options.captureContext()) : null };
}

function restoreEntry(entry) {
  state = entry.layout;
  if (options.restoreContext && entry.context !== null) options.restoreContext(cloneState(entry.context));
}

function remember() {
  past.push(historyEntry());
  if (past.length > 100) past.shift();
  future = [];
}

function commit(nextState, action = 'edit') {
  if (options.canMutate && !options.canMutate(action, nextState, state)) return false;
  remember();
  state = nextState;
  notify();
  return true;
}

function commitContext(nextContext) {
  if (!options.captureContext || !options.restoreContext || (options.canMutate && !options.canMutate('context', state, state))) return false;
  if (JSON.stringify(options.captureContext()) === JSON.stringify(nextContext)) return true;
  remember();
  options.restoreContext(cloneState(nextContext));
  notify();
  return true;
}

function undo() {
  if (!past.length || (options.canMutate && !options.canMutate('undo', past[past.length-1].layout, state))) return false;
  future.push(historyEntry());
  restoreEntry(past.pop());
  notify();
  return true;
}

function redo() {
  if (!future.length || (options.canMutate && !options.canMutate('redo', future[future.length-1].layout, state))) return false;
  past.push(historyEntry());
  restoreEntry(future.pop());
  notify();
  return true;
}

function canUndo() { return past.length > 0; }
  function canRedo() { return future.length > 0; }

function setTent(tentId) {
  const next = cloneState(state);
  next.tentId = tentId;
  return commit(next, 'setTent');
}

function addObject(obj) {
  const next = cloneState(state);
  next.objects.push(obj);
  commit(next);
}

function replaceObjects(objects) {
  const next = cloneState(state);
  next.objects = cloneState(objects);
  commit(next);
}

function updateObject(id, changes) {
  const next = cloneState(state);
  next.objects = next.objects.map(function (o) { return o.id === id ? Object.assign({}, o, changes) : o; });
  commit(next);
}

function removeObject(id) {
  const next = cloneState(state);
  next.objects = next.objects.filter(function (o) { return o.id !== id; });
  commit(next);
}

function duplicateObject(id, count, offset) {
  const source = state.objects.find(function (o) { return o.id === id; });
  if (!source) return;
  const next = cloneState(state);
  const n = count || 1;
  const step = offset || { x: 2, y: 2 };
  for (let i = 1; i <= n; i++) {
    const copy = JSON.parse(JSON.stringify(source));
    copy.id = source.id + '-copy-' + Date.now() + '-' + i;
    copy.x = (source.x || 0) + step.x * i;
    copy.y = (source.y || 0) + step.y * i;
    next.objects.push(copy);
  }
  commit(next);
}

function addZone(zone) {
  const next = cloneState(state);
  next.zones.push(zone);
  commit(next);
}

function removeZone(id) {
  const next = cloneState(state);
  next.zones = next.zones.filter(function (z) { return z.id !== id; });
  commit(next);
}

function addAisle(aisle) {
  const next = cloneState(state);
  next.aisles.push(aisle);
  commit(next);
}

function reset(newState) {
  if (!commit(newState ? cloneState(newState) : emptyState(), 'reset')) return false;
  past = [];
  future = [];
  return true;
}

return {
  getState: getState,
  commitContext: commitContext,
  subscribe: subscribe,
  setTent: setTent,
  addObject: addObject,
  replaceObjects: replaceObjects,
  updateObject: updateObject,
  removeObject: removeObject,
  duplicateObject: duplicateObject,
  addZone: addZone,
  removeZone: removeZone,
  addAisle: addAisle,
  undo: undo,
  redo: redo,
  canUndo: canUndo,
  canRedo: canRedo,
  reset: reset,
};
}
