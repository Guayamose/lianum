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
  const key = deferred(), state = deferred(), stateEntered = deferred(), events = [], values = { available: false, key: null, notice: '', privateState: null };
  const globals = { origin: 'https://original.example', pairingId: '1'.repeat(64), expoFetch: 'EXPLICIT_NATIVE_FETCH_BOUNDARY',
    mounted: { current: true }, observationEpoch: { current: 0 }, AppState: { currentState: 'active' },
    context: { current: { devicePublicKey: null } }, accessLease: { current: null }, reviewLease: { current: null },
    consent: { invalidate() { events.push('consent-invalidated'); } },
    setAccess() {}, setReview() {}, setDiagnostic() {},
    setPrivateState(value) { values.privateState = value; },
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

test('background or input invalidation removes previously displayed private quantities immediately', () => {
  for (const change of [f => f.lifecycle('background'), f => f.globals.invalidate()]) {
    const f = fixture(); f.values.privateState = { status: 'LIVE', balances: { available: '123' } };
    change(f); assert.equal(f.values.privateState, null);
    assert.equal(f.globals.observationEpoch.current, 1);
  }
});

test('native screen reopens deposit W39 against D26 and output W39 against the same U without new admission', async () => {
  const input = readFileSync(new URL('../src/screens/DeviceDepositScreen.tsx', import.meta.url), 'utf8');
  const tree = ts.createSourceFile('DeviceDepositScreen.tsx', input, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const component = tree.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'DeviceDepositScreen');
  assert.ok(component?.body);
  const selectedBody = name => {
    const node = component.body.statements.find(item => ts.isFunctionDeclaration(item) && item.name?.text === name);
    assert.ok(node?.body, name); return input.slice(node.body.getStart(tree), node.body.end);
  };
  const transpiled = name => ts.transpileModule('(async function ' + name + (name === 'publishNote' ? '(value, held) ' : '(held, sameOperation) ') + selectedBody(name) + ')',
    { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const depositId = 'd'.repeat(64), reservationId = 'a'.repeat(64), rootId = 'b'.repeat(64), pub = '04' + 'c'.repeat(128);
  function local(role, mutate = () => {}) {
    const values = { exitRole: role === 'deposit' ? 'change' : 'deposit', exitIntent: null, exitJob: null, note: null }, events = [];
    const state = { rootId, job: { jobId: depositId, origin: 'https://native.original.test', pairingId: 'e'.repeat(64) },
      status: 'FUNDED', availableBalance: null, localReservation: role === 'deposit' ? null : { sourceSpentAtRetainedHead: true } };
    const intent = role === 'deposit' ? null : { rootId, depositJobId: depositId, jobId: reservationId,
      origin: state.job.origin, pairingId: state.job.pairingId, devicePublicKey: pub };
    const pending = { rootId, parentJobId: role === 'deposit' ? depositId : reservationId, jobId: 'f'.repeat(64),
      noteRole: role, statement: { recipient: '1'.repeat(40) }, receipt: null, phase: 'SIGNED', availableBalance: null };
    const world = { state, intent, pending }; mutate(world);
    // Explicit inert custody projection and five SDK acquisition boundaries.
    // The product body consumes only these authenticated-reader projections;
    // AEAD and SDK branding have their existing original integration tests.
    const custody = { async readDeviceNote() { events.push('read-note'); return world.state; },
      async readDeviceReservationIntent() { return world.intent; }, async readDeviceExecutionIntent() { return null; },
      async readDeviceExitIntent(selected) { events.push('read-exit-' + selected); return world.pending; },
      close() { events.push('custody-close'); } };
    const globals = { origin: state.job.origin, pairingId: state.job.pairingId, exitRole: values.exitRole, onObservation: undefined,
      inspectLocalRootNoteVaultV1: async () => ({ rootId, status: 'ACTIVE' }), openLocalRootNoteVaultV1: id => { assert.equal(id, rootId); return custody; },
      readDevicePublicKey: async () => pub, live() {}, clearNativeReview() {},
      setOrigin() {}, setPairingId() {}, setReservationJob() {}, setExecutionIntent() {}, setExitRecipient() {}, setConsent() {},
      setOwnerReview() {}, setReservationConsent() {}, setExitReview() {}, setExitConsent() {}, setApproved() {}, setMessage() {},
      setExitRole(value) { values.exitRole = typeof value === 'function' ? value(values.exitRole) : value; },
      setExitJob(value) { values.exitJob = value; }, setExitIntent(value) { values.exitIntent = value; }, setNote(value) { values.note = value; },
    };
    for (const name of ['request', 'authorizationRequest', 'exitRequest', 'quote', 'exitQuote', 'client', 'reservationClient', 'exitClient', 'executionClient', 'balanceClient', 'vault'])
      globals[name] = { current: null };
    for (const name of ['createDeviceOwnerDepositApiV1', 'createDeviceOwnerReservationApiV1', 'createDeviceOwnerExitApiV1', 'createDeviceOwnerExecutionApiV1', 'createDeviceOwnerOutputBalanceApiV1'])
      globals[name] = async descriptor => { assert.equal(descriptor.origin, state.job.origin); assert.equal(descriptor.pairingId, state.job.pairingId);
        assert.equal(descriptor.devicePublicKey, pub); events.push('sdk-open'); return { descriptor, close() { events.push('sdk-close'); } }; };
    globals.publishNote = new Script(transpiled('publishNote')).runInNewContext(globals);
    const connect = new Script(transpiled('openConnection')).runInNewContext(globals);
    return { connect, values, events, globals, world };
  }
  for (const role of ['deposit', 'change', 'recovery']) {
    const f = local(role);
    // The stored role choice is meaningful only among S outputs. Start this
    // recovery case on recovery to ensure the selection survives the reads.
    if (role === 'recovery') f.globals.exitRole = 'recovery';
    await f.connect(0, true);
    assert.equal(f.values.exitRole, role); assert.equal(f.values.exitJob, f.world.pending.jobId);
    assert.equal(f.values.exitIntent, f.world.pending); assert.equal(f.values.exitIntent.availableBalance, null);
    assert.equal(f.values.note, f.world.state); assert.equal(f.events.filter(value => value === 'sdk-open').length, 5);
    assert.equal(f.events.some(value => /prove|fund|reserve|send/.test(value)), false);
  }
  for (const mutate of [w => { w.pending.parentJobId = '0'.repeat(64); }, w => { w.pending.rootId = '0'.repeat(64); },
    w => { w.pending.noteRole = 'change'; }, w => { w.intent = { rootId, depositJobId: depositId, jobId: reservationId,
      origin: w.state.job.origin, pairingId: w.state.job.pairingId, devicePublicKey: pub }; }]) {
    const f = local('deposit', mutate); await assert.rejects(f.connect(0, true), /MOBILE_LOCAL_ORIGINAL_JOB_CHANGED/);
    assert.equal(f.events.includes('sdk-open'), false); assert.equal(f.events.includes('custody-close'), true);
  }
  const foreignOutput = local('change', w => { w.intent = null; });
  await assert.rejects(foreignOutput.connect(0, true), /MOBILE_LOCAL_ORIGINAL_JOB_CHANGED/);
  assert.equal(foreignOutput.events.includes('sdk-open'), false);
  // Actual JSX subtree: W39 has its own funded-D26-or-confirmed-S condition,
  // rather than remaining hidden inside the original reservation-only branch.
  let withdrawalGate = false;
  function visit(node) {
    if (ts.isJsxExpression(node) && node.expression && node.getText(tree).includes('Salida de la misma custodia')) {
      if (ts.isBinaryExpression(node.expression) && node.expression.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) {
        const condition = node.expression.left.getText(tree);
        if (condition.includes("note?.status === 'FUNDED'") && condition.includes('!note.localReservation')) withdrawalGate = true;
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(component); assert.equal(withdrawalGate, true);
});
