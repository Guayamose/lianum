/** Executes the exact screen refresh/invalidation/lifecycle method bodies,
 * selected by TypeScript AST. React rendering, hardware, storage and HTTP are
 * controlled boundaries; this is a late-response regression, not device proof. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Script } from 'node:vm';
import ts from 'typescript';
const source = readFileSync(new URL('../src/screens/OriginalAccountScreen.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('OriginalAccountScreen.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const screen = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'OriginalAccountScreen');
assert.ok(screen?.body);
function body(name) {
  const node = screen.body.statements.find(item => ts.isFunctionDeclaration(item) && item.name?.text === name);
  assert.ok(node?.body, name); return source.slice(node.body.getStart(ast), node.body.end);
}
let listener;
function find(node) {
  if (ts.isCallExpression(node) && node.expression.getText(ast) === 'AppState.addEventListener') listener = node.arguments[1];
  ts.forEachChild(node, find);
}
find(screen); assert.ok(listener && ts.isArrowFunction(listener));
const listenerBody = source.slice(listener.body.getStart(ast), listener.body.end);
const deferred = () => { let resolve; return { promise: new Promise(done => { resolve = done; }), resolve }; };
function fixture() {
  const key = deferred(), state = deferred(), stateEntered = deferred(), events = [], values = { available: false, key: null, notice: '' };
  const globals = { origin: 'https://original.example', pairingId: '1'.repeat(64), expoFetch: 'EXPLICIT_NATIVE_FETCH_BOUNDARY',
    mounted: { current: true }, observationEpoch: { current: 0 }, AppState: { currentState: 'active' },
    context: { current: { devicePublicKey: null } }, accessLease: { current: null }, reviewLease: { current: null },
    consent: { invalidate() { events.push('consent-invalidated'); } },
    setAccess() {}, setReview() {}, setDiagnostic() {},
    setAvailable(value) { values.available = value; events.push('availability-' + value); },
    setDevicePublicKey(value) { values.key = value; events.push('key-displayed'); },
    setNotice(value) { values.notice = value; },
    readDevicePublicKey: () => key.promise,
    createOriginalAccountApiV2(options) {
      assert.equal(options.descriptor.origin, globals.origin); assert.equal(options.descriptor.pairingId, globals.pairingId);
      assert.equal(options.fetchImpl, globals.expoFetch); events.push('api-created');
      return { async state() { events.push('state-requested'); stateEntered.resolve(); return state.promise; } };
    },
  };
  globals.invalidate = new Script('(function invalidate() ' + body('invalidate') + ')').runInNewContext(globals);
  const refresh = new Script('(async function refresh() ' + body('refresh') + ')').runInNewContext(globals);
  const onChange = new Script('(function(value) ' + listenerBody + ')').runInNewContext(globals);
  const lifecycle = value => { globals.AppState.currentState = value; onChange(value); };
  return { refresh, key, state, events, values, globals, lifecycle,
    waitForState: pending => Promise.race([stateEntered.promise,
      Promise.resolve(pending).then(() => { throw new Error('REFRESH_FINISHED_BEFORE_HTTP'); })]),
  };
}
test('a current foreground check displays only the retained device identity and diagnostic availability', async () => {
  const f = fixture(), pending = f.refresh(); f.key.resolve('04' + '11'.repeat(64));
  await f.waitForState(pending); f.state.resolve({ privatePortfolio: null }); await pending;
  assert.equal(f.values.available, true); assert.equal(f.values.key, '04' + '11'.repeat(64));
  assert.equal(f.globals.context.current.devicePublicKey, f.values.key);
  assert.equal(f.events.filter(value => value === 'state-requested').length, 1);
});
test('background then foreground during the identity read cannot revive an obsolete availability check', async () => {
  const f = fixture(), pending = f.refresh(); f.lifecycle('background'); f.lifecycle('active');
  f.key.resolve('04' + '11'.repeat(64)); f.state.resolve({ privatePortfolio: null }); await pending;
  assert.equal(f.values.available, false); assert.equal(f.values.key, null);
  assert.equal(f.events.includes('api-created'), false);
});
test('background then foreground during HTTP discards the old availability reply', async () => {
  const f = fixture(), pending = f.refresh(); f.key.resolve('04' + '11'.repeat(64)); await f.waitForState(pending);
  assert.equal(f.events.includes('state-requested'), true);
  f.lifecycle('background'); f.lifecycle('active'); f.state.resolve({ privatePortfolio: null }); await pending;
  assert.equal(f.values.available, false); assert.equal(f.events.filter(value => value === 'availability-true').length, 0);
});
test('a new invalidation or unmount while HTTP waits leaves the previous check unavailable', async () => {
  for (const change of [f => f.globals.invalidate(), f => { f.globals.mounted.current = false; }]) {
    const f = fixture(), pending = f.refresh(); f.key.resolve('04' + '11'.repeat(64)); await f.waitForState(pending);
    change(f); f.state.resolve({ privatePortfolio: null }); await pending;
    assert.equal(f.values.available, false); assert.equal(f.values.notice, '');
  }
});
