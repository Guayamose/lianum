/** Pure client/storage and static surface checks only. No browser, private proof,
 * native runtime, server or network is started by these tests. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createPrivateRequestTracker, validatePrivateSnapshot, startPrivateClient, PRIVATE_CLIENT_STORAGE_KEY } from '../../../../scripts/engine/demos/client/private.mjs';
import { PRIVATE_PROFILE, PRIVATE_OWNER_REFUND_DEFAULT, PRIVATE_ENGINE_UNAVAILABLE, privateStorageErrorLabel, privateControls, privateOutcome, privateCleanupLabel, privateRecoveryLabel, privateOwnerRefundLabel, privatePayoutLabel, privatePhaseLabel, privatePublicDetails, privateProgressSteps } from '../../../../scripts/engine/demos/client/private-outcome.mjs';

const id = 'a'.repeat(32), otherId = 'b'.repeat(32), uuid = '12345678-1234-4123-8123-123456789abc';
function operation(overrides = {}) {
  return { id, requestId: uuid, profile: PRIVATE_PROFILE.id, revision: 1, createdAt: '2026-10-03T00:00:00.000Z', updatedAt: '2026-10-03T00:01:00.000Z',
    phase: 'PREPARED', progressCode: 'PREPARED', engineState: 'IDLE', ownerState: 'PREPARING', settlementState: 'NOT_FUNDED', exposure: { evm: 'NONE', sol: 'NONE', btc: 'NONE' },
    payouts: { sol: { state: 'PENDING', amountWei: null }, btc: { state: 'PENDING', amountWei: null } }, recoveryState: 'NONE', lastRecoveryRequestId: null, ownerRefund: { ...PRIVATE_OWNER_REFUND_DEFAULT }, lastOwnerRefundRequestId: null, cleanupState: 'NOT_STARTED', errorCode: null, observation: 'LIVE', allowedActions: ['start'], ...overrides };
}
function snapshot(ops = [], overrides = {}) {
  return { version: 1, profile: { ...PRIVATE_PROFILE }, capabilities: { browserReconnect: true, executionRestart: false, payoutWorkerRestart: true, recoveryWithdrawal: true, fullAcceptance: false }, operations: ops, activeOperationId: ops[0]?.id ?? null, busy: false, storageError: null, ...overrides };
}
function memoryStorage() {
  const data = new Map(), writes = [];
  return { data, writes, getItem: key => data.get(key) ?? null, setItem(key, value) { writes.push({ key, value }); data.set(key, value); } };
}

test('fixed public API contract is validated without treating unknown phase as known success', () => {
  assert.equal(validatePrivateSnapshot(snapshot([operation()] )).profile.realFunds, false);
  const future = operation({ phase: 'FUTURE_STAGE' }); validatePrivateSnapshot(snapshot([future]));
  assert.match(privatePhaseLabel(future.phase), /no reconocido/);
  assert.equal(privateControls(snapshot([future]), future, { connected: true }).start, false);
  for (const mutate of [s => { s.profile.realFunds = true; }, s => { s.profile.sats = '1'; }, s => { s.capabilities.executionRestart = true; }, s => { s.capabilities.payoutWorkerRestart = false; }, s => { delete s.capabilities.payoutWorkerRestart; }, s => { s.operations[0].recoveryState = 'FUTURE_STATE'; }, s => { s.operations[0].lastRecoveryRequestId = { secret: true }; }, s => { s.capabilities.recoveryWithdrawal = false; }, s => { s.capabilities.fullAcceptance = true; }, s => { s.operations.push(s.operations[0]); }, s => { s.operations[0].revision = -1; }, s => { s.activeOperationId = otherId; }, s => { s.operations[0].exposure.sol = { secret: 'unexpected object' }; }, s => { s.operations[0].payouts.sol.amountWei = { secret: 'unexpected object' }; }]) {
    const value = snapshot([operation()]); mutate(value); assert.throws(() => validatePrivateSnapshot(value), /PRIVATE_CLIENT_CONTRACT/);
  }
});
test('request identity is persisted before return and exact pending body survives reload', () => {
  const storage = memoryStorage(); let generated = 0;
  const tracker = createPrivateRequestTracker(storage, () => { generated++; return uuid; });
  const body = tracker.begin('prepare');
  assert.deepEqual(JSON.parse(storage.writes[0].value).pending, body);
  assert.equal(storage.writes[0].key, PRIVATE_CLIENT_STORAGE_KEY);
  body.profile = 'caller mutation';
  const reload = createPrivateRequestTracker(storage, () => { throw Error('must not make a new key'); });
  assert.deepEqual(reload.begin('prepare'), { action: 'prepare', requestId: uuid, profile: PRIVATE_PROFILE.id });
  assert.equal(generated, 1); assert.equal(storage.writes.length, 1);
  assert.throws(() => reload.begin('start', id), /PRIVATE_CLIENT_REQUEST_PENDING/);
});
test('failed browser persistence stops request creation and preserves existing state', () => {
  const tracker = createPrivateRequestTracker({ getItem: () => null, setItem() { throw Error('quota'); } }, () => uuid);
  assert.throws(() => tracker.begin('prepare'), /quota/); assert.equal(tracker.pending, null);
});
test('invalid saved identity is refused rather than replaced with a new request', () => {
  for (const raw of ['broken', 'null', '{"version":2}', JSON.stringify({ version: 1, pending: { action: 'prepare', profile: PRIVATE_PROFILE.id, requestId: uuid, rpc: 'unexpected' }, selectedId: null })]) {
    const storage = memoryStorage(); storage.data.set(PRIVATE_CLIENT_STORAGE_KEY, raw);
    assert.throws(() => createPrivateRequestTracker(storage), /PRIVATE_CLIENT_STORAGE_INVALID/); assert.equal(storage.writes.length, 0);
  }
});
test('lost prepare response is resolved from history with the original request ID', () => {
  const tracker = createPrivateRequestTracker(memoryStorage(), () => uuid); tracker.begin('prepare');
  assert.equal(tracker.reconcile([operation({ requestId: 'different-request' })]), null); assert.notEqual(tracker.pending, null);
  assert.equal(tracker.reconcile([operation()]).id, id); assert.equal(tracker.pending, null); assert.equal(tracker.selectedId, id);
});
test('lost start response retains its key until acceptance, never starts a new operation', () => {
  const storage = memoryStorage(), tracker = createPrivateRequestTracker(storage, () => uuid);
  const first = tracker.begin('start', id);
  assert.equal(tracker.reconcile([operation()]), null); assert.deepEqual(tracker.begin('start', id), first);
  assert.throws(() => tracker.begin('start', otherId), /PRIVATE_CLIENT_REQUEST_PENDING/);
  const reloaded = createPrivateRequestTracker(storage);
  assert.equal(reloaded.reconcile([operation({ phase: 'QUEUED', allowedActions: [], engineState: 'RUNNING' })]).id, id);
  assert.equal(reloaded.pending, null); assert.equal(reloaded.selectedId, id);
});
test('mismatched accepted response cannot discard the saved pending identity', () => {
  const tracker = createPrivateRequestTracker(memoryStorage(), () => uuid); const pending = tracker.begin('start', id);
  assert.throws(() => tracker.accept(operation({ id: otherId })), /PRIVATE_CLIENT_RESPONSE_MISMATCH/); assert.deepEqual(tracker.pending, pending);
  tracker.accept(operation({ phase: 'COMPLETED' })); assert.equal(tracker.pending, null);
});
test('selection and explicit rejection are persisted without storing operation or private payload', () => {
  const storage = memoryStorage(), tracker = createPrivateRequestTracker(storage, () => uuid);
  tracker.begin('prepare'); tracker.reject(); tracker.select(id);
  assert.deepEqual(JSON.parse(storage.data.get(PRIVATE_CLIENT_STORAGE_KEY)), { version: 1, pending: null, selectedId: id });
  assert.throws(() => tracker.select('../escape'), /PRIVATE_CLIENT_OPERATION_ID/);
});
test('controls require connection, storage, reviewed prepared state and backend permission', () => {
  const op = operation(), state = snapshot([op]);
  assert.deepEqual(privateControls(snapshot(), null, { connected: true }), { prepare: true, recover: false, start: false, refund: false, recoverRefund: false });
  assert.deepEqual(privateControls(state, op, { connected: true }), { prepare: false, recover: false, start: true, refund: false, recoverRefund: false });
  for (const flags of [{}, { connected: false }, { connected: true, sending: true }, { connected: true, storageReady: false }, { connected: true, pending: { action: 'prepare' } }]) assert.equal(privateControls(state, op, flags).start, false);
  for (const changed of [snapshot([op], { busy: true }), snapshot([op], { storageError: 'JOURNAL_FAILED' })]) assert.deepEqual(privateControls(changed, op, { connected: true }), { prepare: false, recover: false, start: false, refund: false, recoverRefund: false });
  assert.equal(privateControls(state, operation({ allowedActions: [] }), { connected: true }).start, false);
  assert.equal(privateControls(state, op, { connected: true, pending: { action: 'start', operationId: otherId } }).start, false);
});
test('same-request manual retry is available only in the unchanged safe action state', () => {
  assert.equal(privateControls(snapshot(), null, { connected: true, pending: { action: 'prepare' } }).prepare, true);
  const op = operation(); assert.equal(privateControls(snapshot([op]), op, { connected: true, pending: { action: 'start', operationId: id } }).start, true);
  for (const phase of ['QUEUED', 'SOL_PENDING', 'COMPLETED', 'FAILED', 'INTERRUPTED']) assert.equal(privateControls(snapshot([operation({ phase })]), operation({ phase }), { connected: true }).start, false);
});
test('payment issuance, one withdrawal, and complete exact compensation stay distinct', () => {
  const paid = operation({ phase: 'WITHDRAWING', settlementState: 'PAYOUT_NOTES_ISSUED', payouts: { sol: { state: 'WITHDRAWN', amountWei: PRIVATE_PROFILE.solCompensationWei }, btc: { state: 'ISSUED', amountWei: null } } });
  assert.match(privateOutcome(paid), /1 de 2/); assert.doesNotMatch(privateOutcome(paid), /Pago privado completado/);
  const completed = { ...paid, phase: 'COMPLETED', payouts: { ...paid.payouts, btc: { state: 'WITHDRAWN', amountWei: PRIVATE_PROFILE.btcCompensationWei } } };
  assert.match(privateOutcome(completed), /Pago privado completado/); assert.match(privateOutcome(completed), /no una devolución/);
  completed.payouts.btc.amountWei = null; assert.doesNotMatch(privateOutcome(completed), /Pago privado completado/);
  assert.match(privatePayoutLabel({ state: 'WITHDRAWN', amountWei: null }), /sin verificar/);
});
test('recovery-note issuance is never called a cash refund or completed withdrawal', () => {
  const text = privateOutcome(operation({ phase: 'INTERRUPTED', settlementState: 'RECOVERY_NOTE_ISSUED' }));
  assert.match(text, /nota de recuperación/); assert.match(text, /No consta una retirada EVM/); assert.match(text, /requiere autoridad viva/);
  assert.doesNotMatch(text, /Pago privado completado|EVM recuperado/);
});
test('ambiguous exposure and engine interruption never promise retry, rollback or refund', () => {
  for (const exposed of ['MAY_HAVE_SUBMITTED', 'SIGNED_RETAINED']) {
    const text = privateOutcome(operation({ phase: 'FAILED', exposure: { evm: 'NONE', sol: exposed, btc: 'NONE' } }));
    assert.match(text, /no se reenviará automáticamente/); assert.match(text, /no.*supone una devolución/);
  }
  assert.equal(privateOutcome(operation({ phase: 'INTERRUPTED', engineState: 'INTERRUPTED' })), PRIVATE_ENGINE_UNAVAILABLE);
  assert.match(privateOutcome(operation({ phase: 'FAILED' })), /no demuestra una devolución/);
});
test('unavailable coordinator does not assert native processes stopped and a foreign journal lease is read-only', () => {
  const op = operation({ phase: 'INTERRUPTED', engineState: 'INTERRUPTED' });
  assert.match(privateOutcome(op), /conexión con el motor no está disponible/);
  assert.match(privateOutcome(op), /no se reanuda ni se reenvía automáticamente/);
  assert.doesNotMatch(privateOutcome(op), /motor se interrumpió|proceso se interrumpió|procesos.*cerrados/);
  assert.match(privatePhaseLabel('INTERRUPTED'), /Conexión/);
  const state = snapshot([op], { storageError: 'PRIVATE_SESSION_ALREADY_OPEN' });
  assert.deepEqual(privateControls(state, op, { connected: true }), { prepare: false, recover: false, start: false, refund: false, recoverRefund: false });
  assert.match(privateStorageErrorLabel(state.storageError), /Otro coordinador local/);
  assert.match(privateStorageErrorLabel(state.storageError), /solo lectura/);
  assert.match(privateStorageErrorLabel(state.storageError), /puede seguir en el otro servidor/);
  assert.match(privateStorageErrorLabel('UNRECOGNIZED_FAILURE'), /requiere revisión/);
});
test('retained completion and cleanup failure do not manufacture current balances or erase payment', () => {
  const op = operation({ phase: 'COMPLETED', observation: 'RETAINED_HISTORY', cleanupState: 'FAILED', settlementState: 'PAYOUT_NOTES_ISSUED', payouts: { sol: { state: 'WITHDRAWN', amountWei: PRIVATE_PROFILE.solCompensationWei }, btc: { state: 'WITHDRAWN', amountWei: PRIVATE_PROFILE.btcCompensationWei } } });
  assert.match(privateOutcome(op), /Registro histórico/); assert.match(privateOutcome(op), /no es.*saldo gastable/); assert.match(privateOutcome(op), /Pago privado completado/);
  assert.match(privateCleanupLabel(op), /no cambia los pagos ya registrados/);
});
test('progress for interrupted operations uses recorded facts, not assumed completed steps', () => {
  const steps = privateProgressSteps(operation({ phase: 'INTERRUPTED', ownerState: 'EXIT_CONFIRMED', settlementState: 'FUNDED', exposure: { evm: 'OBSERVED', sol: 'OBSERVED', btc: 'NONE' } }));
  assert.equal(steps[2].state, 'complete'); assert.equal(steps[3].state, 'complete'); assert.equal(steps[4].state, 'unknown'); assert.equal(steps[6].state, 'unknown');
});
test('public details omit request credentials, witness, native wire and arbitrary nested additions', () => {
  const op = operation({ graph: 'HIDDEN_GRAPH', bridgeToken: 'HIDDEN_TOKEN', rawTransaction: 'HIDDEN_WIRE', proofBase64: 'HIDDEN_PROOF', errorCode: '<unsafe error>' });
  op.payouts.sol.privateKey = 'HIDDEN_KEY'; op.exposure.private = 'HIDDEN_EXPOSURE';
  const detail = privatePublicDetails(op), text = JSON.stringify(detail);
  assert.doesNotMatch(text, /HIDDEN_|requestId/); assert.equal(detail.errorCode, null); assert.equal(detail.executionRestart, false); assert.equal(detail.recoveryWithdrawal, true);
});
test('existing wallet contains separate private payout and owner-refund controls without resend controls', async () => {
  const html = await readFile(new URL('../../../../scripts/engine/demos/client/index.html', import.meta.url), 'utf8');
  const panel = html.slice(html.indexOf('id="private"'), html.indexOf('id="triple"'));
  for (const id of ['private-heading', 'private-prepare', 'private-start', 'private-recover', 'private-recovery', 'private-recovery-limit', 'private-refund', 'private-recover-refund', 'private-refund-limit', 'private-owner-refund', 'private-refresh', 'private-operation-select', 'private-outcome', 'private-evidence']) assert.ok(panel.includes(`id="${id}"`), id);
  assert.match(html, /src="\/private.mjs"/); assert.match(panel, /aria-live="polite"/); assert.match(panel, /100\.000 sats/); assert.match(panel, /3\.000\.000 lamports/);
  assert.doesNotMatch(panel, /id="private-(resend|settle)"|data-private="resend"/);
  assert.match(panel, /Solicitar devolución/); assert.match(panel, /Recuperar devolución/); assert.match(panel, /techo total de tres horas/); assert.match(panel, /fecha estimada no autoriza/); assert.match(panel, /Recuperar retiradas/); assert.match(panel, /máximo 30 minutos/); assert.match(panel, /conciliación manual/);
  assert.match(html, /id="native"/); assert.match(html, /id="execution"/); assert.match(html, /los paneles transparentes y el modelo no usan esa prueba global/);
  assert.doesNotMatch(html, /Sin fondos reales[^\n]*Sin settlement privado|No hay prueba ZK,/);
});
test('browser code remains read-only on polling/reconnection and restores polling after back navigation', async () => {
  const source = await readFile(new URL('../../../../scripts/engine/demos/client/private.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /innerHTML|eval\(/);
  assert.match(source, /tracker\.begin\(action, selectedId\)/); assert.match(source, /POST', body: JSON\.stringify\(body\)/);
  assert.match(source, /window\.addEventListener\('online', \(\) => \{ void refresh\(\); \}\)/);
  assert.match(source, /window\.addEventListener\('pageshow', \(\) => \{ startPolling\(\); void refresh\(\); \}\)/);
  assert.equal((source.match(/method: 'POST'/g) ?? []).length, 1);
});

function recoverable(overrides = {}) {
  return operation({ phase: 'RECOVERABLE', engineState: 'STOPPED', ownerState: 'EXIT_CONFIRMED', settlementState: 'PAYOUT_NOTES_ISSUED', recoveryState: 'AVAILABLE', cleanupState: 'RETAINED', exposure: { evm: 'OBSERVED', sol: 'OBSERVED', btc: 'OBSERVED' }, payouts: { sol: { state: 'ISSUED', amountWei: null }, btc: { state: 'ISSUED', amountWei: null } }, allowedActions: ['recover'], ...overrides });
}
const secondUuid = '12345678-1234-4123-8123-123456789abd';

test('older operation history defaults recovery fields without granting recovery authority', () => {
  const old = operation(); delete old.recoveryState; delete old.lastRecoveryRequestId;
  const value = validatePrivateSnapshot(snapshot([old]));
  assert.equal(value.operations[0].recoveryState, 'NONE'); assert.equal(value.operations[0].lastRecoveryRequestId, null);
  assert.equal(privateControls(value, value.operations[0], { connected: true }).recover, false);
  assert.equal(privatePublicDetails(old).recoveryState, 'NONE');
});

test('recovery request identity is persisted before send, reloadable, and deduplicated', () => {
  const storage = memoryStorage(); let generated = 0;
  const tracker = createPrivateRequestTracker(storage, () => { generated++; return uuid; });
  const body = tracker.begin('recover', id);
  assert.deepEqual(body, { action: 'recover', operationId: id, requestId: uuid });
  assert.deepEqual(JSON.parse(storage.writes[0].value).pending, body);
  const reload = createPrivateRequestTracker(storage, () => { throw Error('must not replace saved recovery'); });
  assert.deepEqual(reload.begin('recover', id), body); assert.equal(generated, 1);
  assert.throws(() => reload.begin('recover', otherId), /PRIVATE_CLIENT_REQUEST_PENDING/);
  assert.throws(() => reload.begin('start', id), /PRIVATE_CLIENT_REQUEST_PENDING/);
  assert.throws(() => reload.begin('prepare'), /PRIVATE_CLIENT_REQUEST_PENDING/);
});

test('old recoverable or completed phase cannot acknowledge a new recovery request', () => {
  const tracker = createPrivateRequestTracker(memoryStorage(), () => uuid), body = tracker.begin('recover', id);
  for (const phase of ['RECOVERABLE', 'RECOVERING', 'COMPLETED', 'FAILED', 'INTERRUPTED']) {
    for (const lastRecoveryRequestId of [undefined, null, secondUuid]) {
      const op = recoverable({ phase, lastRecoveryRequestId });
      assert.equal(tracker.reconcile([op]), null); assert.deepEqual(tracker.pending, body);
      assert.throws(() => tracker.accept(op), /PRIVATE_CLIENT_RESPONSE_MISMATCH/);
    }
  }
  assert.equal(tracker.reconcile([recoverable({ id: otherId, lastRecoveryRequestId: uuid })]), null);
  assert.equal(tracker.reconcile([recoverable({ lastRecoveryRequestId: uuid })]).id, id);
  assert.equal(tracker.pending, null); assert.equal(tracker.selectedId, id);
});

test('a later permitted recovery gets a fresh key and cannot reconcile the previous acceptance', () => {
  const keys = [uuid, secondUuid], tracker = createPrivateRequestTracker(memoryStorage(), () => keys.shift());
  tracker.begin('recover', id); tracker.accept(recoverable({ lastRecoveryRequestId: uuid }));
  const later = tracker.begin('recover', id); assert.equal(later.requestId, secondUuid);
  assert.equal(tracker.reconcile([recoverable({ lastRecoveryRequestId: uuid })]), null);
  const completed = recoverable({ phase: 'COMPLETED', recoveryState: 'COMPLETED', lastRecoveryRequestId: secondUuid });
  assert.equal(tracker.reconcile([completed]), completed); assert.equal(tracker.pending, null);
});

test('recovery controls need explicit current backend authority, never an old note or phase', () => {
  const op = recoverable(), state = snapshot([op], { busy: true });
  assert.deepEqual(privateControls(state, op, { connected: true }), { prepare: false, recover: true, start: false, refund: false, recoverRefund: false });
  assert.equal(privateControls(state, op, { connected: true, pending: { action: 'recover', requestId: uuid, operationId: id } }).recover, true);
  for (const fields of [{ allowedActions: [] }, { allowedActions: ['start'] }, { recoveryState: 'NONE' }, { recoveryState: 'UNAVAILABLE' }, { recoveryState: 'RUNNING' }, { observation: 'RETAINED_HISTORY' }, { cleanupState: 'COMPLETED' }, { settlementState: 'RECOVERY_NOTE_ISSUED' }, { settlementState: 'UNKNOWN' }, { phase: 'RECOVERING' }, { phase: 'FAILED' }, { phase: 'INTERRUPTED' }]) {
    const changed = { ...op, ...fields }; assert.equal(privateControls(snapshot([changed]), changed, { connected: true }).recover, false, JSON.stringify(fields));
  }
  for (const flags of [{ connected: false }, { connected: true, sending: true }, { connected: true, storageReady: false }, { connected: true, pending: { action: 'start', operationId: id } }, { connected: true, pending: { action: 'recover', operationId: otherId } }]) assert.equal(privateControls(state, op, flags).recover, false);
  for (const changed of [snapshot([op], { storageError: 'PRIVATE_SESSION_ALREADY_OPEN' }), snapshot([op], { activeOperationId: otherId }), snapshot([op], { capabilities: { ...state.capabilities, payoutWorkerRestart: false } })]) assert.equal(privateControls(changed, op, { connected: true }).recover, false);
});

test('retained and partially withdrawn compensation never appears refunded or fully paid', () => {
  const op = recoverable({ payouts: { sol: { state: 'WITHDRAWN', amountWei: PRIVATE_PROFILE.solCompensationWei }, btc: { state: 'ISSUED', amountWei: null } } });
  assert.match(privateOutcome(op), /1 de 2/); assert.match(privateOutcome(op), /compensaciones pendientes/);
  assert.doesNotMatch(privateOutcome(op), /Pago privado completado/);
  assert.match(privateCleanupLabel(op), /máximo 30 minutos/); assert.match(privateCleanupLabel(op), /no son fondos ya retirados/);
  assert.match(privateRecoveryLabel(op), /mismo pool/); assert.match(privateRecoveryLabel(op), /No vuelve a entregar SOL\/BTC/);
  const steps = privateProgressSteps(op); assert.equal(steps[3].state, 'complete'); assert.equal(steps[5].state, 'complete'); assert.equal(steps[6].state, 'unknown');
  assert.equal(privateProgressSteps({ ...op, phase: 'RECOVERING', recoveryState: 'RUNNING' })[6].state, 'current');
  assert.match(privateRecoveryLabel({ ...op, recoveryState: 'RUNNING' }), /solo se retira la compensación pendiente/);
});

test('expired authority and retained history require manual reconciliation without fake success', () => {
  const op = recoverable({ phase: 'INTERRUPTED', engineState: 'INTERRUPTED', observation: 'RETAINED_HISTORY', recoveryState: 'UNAVAILABLE', cleanupState: 'COMPLETED', allowedActions: [] });
  assert.match(privateOutcome(op), /Registro histórico/); assert.match(privateOutcome(op), /0 de 2/); assert.match(privateOutcome(op), /conciliación manual/);
  assert.match(privateRecoveryLabel(op), /no acredita una nueva retirada/); assert.match(privateRecoveryLabel(op), /Reiniciar nodos, custodio o sistema operativo no restablece/);
  assert.equal(privateControls(snapshot([op]), op, { connected: true }).recover, false);
  const projected = privatePublicDetails({ ...op, lastRecoveryRequestId: uuid, keeperSecret: 'HIDDEN_KEEPER' });
  assert.equal(projected.recoveryState, 'UNAVAILABLE'); assert.equal(projected.payoutWorkerRestart, true);
  assert.equal(projected.executionRestart, false); assert.equal(projected.recoveryWithdrawal, true); assert.equal(projected.fullAcceptance, false);
  assert.doesNotMatch(JSON.stringify(projected), /lastRecoveryRequestId|HIDDEN_KEEPER/);
});

// Minimal event/DOM fixture exercises the real client entry point without a
// browser. This is behavioral unit coverage, not visual or native-runtime QA.
function clientHarness(t, { state, storage = memoryStorage(), onPost } = {}) {
  const elements = new Map(), windowEvents = new Map(), timers = new Map(), requests = []; let timerId = 0;
  const element = () => ({ disabled: false, hidden: false, dataset: {}, textContent: '', value: '', listeners: new Map(), attributes: {}, classList: { toggle() {} }, setAttribute(key, value) { this.attributes[key] = value; }, addEventListener(key, callback) { this.listeners.set(key, callback); }, replaceChildren(...children) { this.children = children; }, append(...children) { this.children = [...this.children ?? [], ...children]; } });
  const byId = id => { if (!elements.has(id)) elements.set(id, element()); return elements.get(id); };
  const globals = {
    document: { getElementById: byId, querySelector: () => ({ content: 'unit-session-token' }), createElement: element },
    window: { addEventListener: (name, callback) => windowEvents.set(name, callback) }, localStorage: storage,
    setInterval: callback => { timers.set(++timerId, callback); return timerId; }, clearInterval: id => timers.delete(id),
    fetch: async (path, options) => {
      requests.push({ path, ...options });
      if (options.method === 'POST') return onPost(JSON.parse(options.body));
      return { ok: true, json: async () => structuredClone(state) };
    },
  };
  const originals = Object.fromEntries(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  t.after(() => { for (const key of Object.keys(globals)) { if (originals[key]) Object.defineProperty(globalThis, key, originals[key]); else delete globalThis[key]; } });
  return { byId, requests, storage, state, event: name => windowEvents.get(name)?.(), poll: () => [...timers.values()].forEach(callback => callback()), click: id => byId(id).listeners.get('click')?.(), posts: () => requests.filter(r => r.method === 'POST') };
}
async function settledUntil(condition) {
  for (let turns = 0; turns < 100; turns++) { if (condition()) return; await new Promise(resolve => setImmediate(resolve)); }
  assert.fail('client did not settle');
}

test('reload, reconnect, polling and back navigation never POST even with pending recovery', async t => {
  const storage = memoryStorage(); createPrivateRequestTracker(storage, () => uuid).begin('recover', id);
  const harness = clientHarness(t, { state: snapshot([recoverable()], { busy: true }), storage, onPost: () => assert.fail('no automatic POST') });
  startPrivateClient(); await settledUntil(() => harness.byId('private-recover').disabled === false);
  assert.equal(harness.byId('private-recover').textContent, 'Reintentar misma recuperación');
  for (const action of [() => harness.event('online'), () => harness.poll(), () => { harness.event('pagehide'); harness.event('pageshow'); }]) {
    const reads = harness.requests.length; action(); await settledUntil(() => harness.requests.length > reads && !harness.byId('private-refresh').disabled);
  }
  assert.equal(harness.posts().length, 0); assert.equal(createPrivateRequestTracker(storage).pending.requestId, uuid);
  harness.state.operations[0].lastRecoveryRequestId = uuid;
  harness.event('online'); await settledUntil(() => createPrivateRequestTracker(storage).pending === null);
  assert.equal(harness.posts().length, 0);
});

test('manual recovery retries the persisted exact body after lost response without re-delivering native assets', async t => {
  const state = snapshot([recoverable()], { busy: true }), storage = memoryStorage(); let attempt = 0;
  const harness = clientHarness(t, { state, storage, onPost: async body => {
    assert.deepEqual(JSON.parse(storage.data.get(PRIVATE_CLIENT_STORAGE_KEY)).pending, body);
    assert.equal(body.action, 'recover'); assert.equal(body.operationId, id);
    if (++attempt === 1) throw Error('response lost');
    state.operations[0] = recoverable({ phase: 'RECOVERING', recoveryState: 'RUNNING', lastRecoveryRequestId: body.requestId, allowedActions: [] });
    return { ok: true, json: async () => ({ operation: structuredClone(state.operations[0]), replayed: false }) };
  } });
  startPrivateClient(); await settledUntil(() => !harness.byId('private-recover').disabled);
  harness.click('private-recover'); harness.click('private-recover');
  await settledUntil(() => harness.posts().length === 1 && !harness.byId('private-recover').disabled);
  const pending = createPrivateRequestTracker(storage).pending; assert.equal(pending.action, 'recover');
  assert.equal(harness.byId('private-recover').textContent, 'Reintentar misma recuperación');
  harness.click('private-recover');
  await settledUntil(() => harness.posts().length === 2 && createPrivateRequestTracker(storage).pending === null && !harness.byId('private-refresh').disabled);
  assert.equal(harness.posts()[0].body, harness.posts()[1].body); assert.equal(harness.byId('private-recover').disabled, true);
  assert.match(harness.byId('private-recovery').textContent, /en curso/);
});

test('disconnected or historical retained records never claim the keeper is still available', () => {
  const live = recoverable(), historical = { ...live, observation: 'RETAINED_HISTORY' };
  for (const [op, flags] of [[live, { connected: false }], [historical, {}], [{ ...historical, recoveryState: 'UNAVAILABLE' }, {}]]) {
    assert.match(privateCleanupLabel(op, flags), /no confirma.*sigan vivos/);
    assert.doesNotMatch(privateCleanupLabel(op, flags), /permanecen activos/);
    assert.doesNotMatch(privateRecoveryLabel(op, flags), /custodio activos/);
  }
});

test('lost response already accepted by server is reconciled by GET without an extra POST', async t => {
  const state = snapshot([recoverable()], { busy: true }), storage = memoryStorage();
  const harness = clientHarness(t, { state, storage, onPost: async body => {
    state.operations[0] = recoverable({ phase: 'RECOVERING', recoveryState: 'RUNNING', lastRecoveryRequestId: body.requestId, allowedActions: [] });
    throw Error('accepted but response lost');
  } });
  startPrivateClient(); await settledUntil(() => !harness.byId('private-recover').disabled);
  harness.click('private-recover');
  await settledUntil(() => harness.posts().length === 1 && createPrivateRequestTracker(storage).pending === null && !harness.byId('private-refresh').disabled);
  harness.event('online'); harness.poll();
  await settledUntil(() => !harness.byId('private-refresh').disabled);
  assert.equal(harness.posts().length, 1); assert.equal(harness.byId('private-recover').disabled, true);
  assert.match(harness.byId('private-notice').textContent, /Solicitud localizada/);
});

test('manual recovery rechecks expired backend authority before creating or sending a request', async t => {
  const state = snapshot([recoverable()], { busy: true });
  const harness = clientHarness(t, { state, onPost: () => assert.fail('expired authority must never POST') });
  startPrivateClient(); await settledUntil(() => !harness.byId('private-recover').disabled);
  state.operations[0] = recoverable({ recoveryState: 'UNAVAILABLE', observation: 'RETAINED_HISTORY', allowedActions: [] });
  harness.click('private-recover'); await settledUntil(() => !harness.byId('private-refresh').disabled);
  assert.equal(harness.posts().length, 0); assert.equal(createPrivateRequestTracker(harness.storage).pending, null);
  assert.equal(harness.byId('private-recover').disabled, true);
});

function refundable(state = 'WAITING', overrides = {}) {
  return operation({ phase: 'REFUNDABLE', engineState: 'STOPPED', ownerState: 'EXIT_CONFIRMED', settlementState: state === 'NOTE_ISSUED' || state === 'WITHDRAWN' ? 'RECOVERY_NOTE_ISSUED' : 'FUNDED',
    ownerRefund: { state, amountWei: PRIVATE_PROFILE.fundingWei, claimEpoch: '1780000000', eligibleAt: '2026-10-03T06:00:00.000Z' },
    cleanupState: 'RETAINED', exposure: { evm: 'OBSERVED', sol: 'OBSERVED', btc: 'NONE' }, allowedActions: state === 'NOTE_ISSUED' ? ['recoverRefund'] : ['WAITING', 'ELIGIBLE'].includes(state) ? ['refund'] : [], ...overrides });
}
const refundActions = [['refund', 'WAITING', 'private-refund'], ['recoverRefund', 'NOTE_ISSUED', 'private-recover-refund']];

test('older history defaults all owner refund fields without granting withdrawal authority', () => {
  const old = operation({ phase: 'INTERRUPTED', settlementState: 'RECOVERY_NOTE_ISSUED', observation: 'RETAINED_HISTORY', allowedActions: [] });
  delete old.ownerRefund; delete old.lastOwnerRefundRequestId;
  const normalized = validatePrivateSnapshot(snapshot([old]));
  assert.deepEqual(normalized.operations[0].ownerRefund, PRIVATE_OWNER_REFUND_DEFAULT);
  assert.equal(normalized.operations[0].lastOwnerRefundRequestId, null);
  assert.equal(privateControls(normalized, normalized.operations[0], { connected: true }).refund, false);
  assert.equal(privateControls(normalized, normalized.operations[0], { connected: true }).recoverRefund, false);
  assert.deepEqual(privatePublicDetails(old).ownerRefund, PRIVATE_OWNER_REFUND_DEFAULT);
  assert.match(privateOutcome(old), /No consta una retirada EVM/);
  assert.doesNotMatch(privateOutcome(old), /se retiraron|clave.*proceso detenido/);
  normalized.operations[0].ownerRefund.state = 'UNKNOWN';
  assert.equal(PRIVATE_OWNER_REFUND_DEFAULT.state, 'NONE');
});

test('owner refund public contract validates states, fixed budget, epoch, timestamp and marker', () => {
  for (const state of ['NONE', 'WAITING', 'ELIGIBLE', 'NOTE_ISSUED', 'WITHDRAWN', 'UNKNOWN', 'UNAVAILABLE']) {
    const op = refundable(state); assert.equal(validatePrivateSnapshot(snapshot([op])).operations[0].ownerRefund.state, state);
  }
  const mutations = [op => { op.ownerRefund = null; }, op => { op.ownerRefund = []; }, op => { op.ownerRefund.state = 'PAID'; }, op => { op.ownerRefund.amountWei = '1'; }, op => { op.ownerRefund.amountWei = 1000000000000000; }, op => { op.ownerRefund.claimEpoch = 1780000000; }, op => { op.ownerRefund.claimEpoch = '-1'; }, op => { op.ownerRefund.claimEpoch = '01'; }, op => { op.ownerRefund.eligibleAt = 'tomorrow'; }, op => { op.ownerRefund.eligibleAt = '2026-02-31T06:00:00.000Z'; }, op => { delete op.ownerRefund.amountWei; }, op => { op.lastOwnerRefundRequestId = { key: uuid }; }, op => { op.lastOwnerRefundRequestId = 'bad'; }];
  for (const mutate of mutations) { const op = refundable(); mutate(op); assert.throws(() => validatePrivateSnapshot(snapshot([op])), /PRIVATE_CLIENT_CONTRACT/); }
});

for (const [action, state, button] of refundActions) {
  test(`${action}: identity is saved before send, exactly survives reload, and excludes other actions`, () => {
    const storage = memoryStorage(); let generated = 0;
    const tracker = createPrivateRequestTracker(storage, () => { generated++; return uuid; });
    const body = tracker.begin(action, id);
    assert.deepEqual(body, { action, requestId: uuid, operationId: id });
    assert.deepEqual(JSON.parse(storage.writes[0].value).pending, body);
    const reload = createPrivateRequestTracker(storage, () => assert.fail('must preserve saved owner refund UUID'));
    assert.deepEqual(reload.begin(action, id), body); assert.equal(generated, 1);
    for (const otherAction of ['prepare', 'start', 'recover', ...refundActions.map(([item]) => item)].filter(item => item !== action)) assert.throws(() => reload.begin(otherAction, id), /PRIVATE_CLIENT_REQUEST_PENDING/);
    assert.throws(() => reload.begin(action, otherId), /PRIVATE_CLIENT_REQUEST_PENDING/);
  });

  test(`${action}: polling cannot acknowledge old phase, payout marker, other operation or different owner UUID`, () => {
    const tracker = createPrivateRequestTracker(memoryStorage(), () => uuid), body = tracker.begin(action, id);
    for (const phase of ['REFUNDABLE', 'REFUNDING', 'REFUNDED', 'COMPLETED', 'FAILED', 'INTERRUPTED']) {
      for (const lastOwnerRefundRequestId of [undefined, null, secondUuid]) {
        const op = refundable(state, { phase, lastOwnerRefundRequestId, lastRecoveryRequestId: uuid });
        assert.equal(tracker.reconcile([op]), null); assert.deepEqual(tracker.pending, body);
        assert.throws(() => tracker.accept(op), /PRIVATE_CLIENT_RESPONSE_MISMATCH/);
      }
    }
    assert.equal(tracker.reconcile([refundable(state, { id: otherId, lastOwnerRefundRequestId: uuid })]), null);
    assert.equal(tracker.reconcile([refundable(state, { lastOwnerRefundRequestId: uuid })]).id, id);
    assert.equal(tracker.pending, null);
  });

  test(`${action}: direct successful exact-body replay acknowledges acceptance without trusting a later marker`, () => {
    const tracker = createPrivateRequestTracker(memoryStorage(), () => uuid), body = tracker.begin(action, id);
    const latest = refundable(state, { lastOwnerRefundRequestId: secondUuid });
    assert.throws(() => tracker.accept(latest, { ...body, requestId: secondUuid }), /PRIVATE_CLIENT_RESPONSE_MISMATCH/);
    assert.throws(() => tracker.accept(latest, { ...body, extra: true }), /PRIVATE_CLIENT_RESPONSE_MISMATCH/);
    assert.throws(() => tracker.accept({ ...latest, id: otherId }, body), /PRIVATE_CLIENT_RESPONSE_MISMATCH/);
    assert.deepEqual(tracker.pending, body);
    tracker.accept(latest, body); assert.equal(tracker.pending, null);
  });

  test(`${action}: only current backend authority enables the matching explicit action`, () => {
    const op = refundable(state), value = snapshot([op], { busy: true });
    const controls = privateControls(value, op, { connected: true });
    assert.equal(controls[action], true); assert.equal(controls.recover, false); assert.equal(controls.start, false); assert.equal(controls.prepare, false);
    assert.equal(privateControls(value, op, { connected: true, pending: { action, operationId: id } })[action], true);
    for (const fields of [{ allowedActions: [] }, { allowedActions: ['recover'] }, { phase: 'REFUNDING' }, { phase: 'REFUNDED' }, { phase: 'COMPLETED' }, { phase: 'INTERRUPTED' }, { observation: 'RETAINED_HISTORY' }, { cleanupState: 'COMPLETED' }, { cleanupState: 'FAILED' }, { ownerRefund: { ...op.ownerRefund, state: 'UNAVAILABLE' } }, { ownerRefund: { ...op.ownerRefund, state: 'UNKNOWN' } }, { ownerRefund: { ...op.ownerRefund, state: 'WITHDRAWN' } }]) {
      const changed = { ...op, ...fields }; assert.equal(privateControls(snapshot([changed]), changed, { connected: true })[action], false, JSON.stringify(fields));
    }
    for (const flags of [{ connected: false }, { connected: true, sending: true }, { connected: true, storageReady: false }, { connected: true, pending: { action: 'recover', operationId: id } }, { connected: true, pending: { action, operationId: otherId } }]) assert.equal(privateControls(value, op, flags)[action], false);
    for (const changed of [snapshot([op], { storageError: 'JOURNAL_FAILED' }), snapshot([op], { activeOperationId: otherId }), snapshot([op], { capabilities: { ...value.capabilities, recoveryWithdrawal: false } })]) assert.equal(privateControls(changed, op, { connected: true })[action], false);
  });

  test(`${action}: reload, reconnect, poll and back navigation never POST a pending request`, async t => {
    const storage = memoryStorage(); createPrivateRequestTracker(storage, () => uuid).begin(action, id);
    const harness = clientHarness(t, { state: snapshot([refundable(state)], { busy: true }), storage, onPost: () => assert.fail('read-only navigation must never POST') });
    startPrivateClient(); await settledUntil(() => !harness.byId(button).disabled);
    assert.match(harness.byId(button).textContent, /Reintentar misma/);
    for (const event of [() => harness.event('online'), () => harness.poll(), () => { harness.event('pagehide'); harness.event('pageshow'); }]) {
      const count = harness.requests.length; event(); await settledUntil(() => harness.requests.length > count && !harness.byId('private-refresh').disabled);
    }
    assert.equal(harness.posts().length, 0); assert.equal(createPrivateRequestTracker(storage).pending.requestId, uuid);
    harness.state.operations[0].lastOwnerRefundRequestId = uuid;
    harness.poll(); await settledUntil(() => createPrivateRequestTracker(storage).pending === null);
    assert.equal(harness.posts().length, 0);
  });

  test(`${action}: duplicate click and manual retry after a lost response preserve the exact body`, async t => {
    const value = snapshot([refundable(state)], { busy: true }), storage = memoryStorage(); let attempt = 0;
    const harness = clientHarness(t, { state: value, storage, onPost: async body => {
      assert.deepEqual(JSON.parse(storage.data.get(PRIVATE_CLIENT_STORAGE_KEY)).pending, body);
      assert.deepEqual(Object.keys(body).sort(), ['action', 'operationId', 'requestId']); assert.equal(body.action, action); assert.equal(body.operationId, id);
      if (++attempt === 1) throw Error('response lost');
      value.operations[0] = refundable(state, { phase: 'REFUNDING', engineState: 'RUNNING', allowedActions: [], lastOwnerRefundRequestId: body.requestId });
      return { ok: true, json: async () => ({ operation: structuredClone(value.operations[0]), replayed: true }) };
    } });
    startPrivateClient(); await settledUntil(() => !harness.byId(button).disabled);
    harness.click(button); harness.click(button);
    await settledUntil(() => harness.posts().length === 1 && !harness.byId(button).disabled);
    assert.equal(createPrivateRequestTracker(storage).pending.action, action);
    harness.click(button);
    await settledUntil(() => harness.posts().length === 2 && createPrivateRequestTracker(storage).pending === null && !harness.byId('private-refresh').disabled);
    assert.equal(harness.posts()[0].body, harness.posts()[1].body); assert.equal(harness.byId(button).disabled, true);
  });

  test(`${action}: lost accepted response is reconciled with matching owner marker by GET only`, async t => {
    const value = snapshot([refundable(state)], { busy: true }), storage = memoryStorage();
    const harness = clientHarness(t, { state: value, storage, onPost: async body => {
      value.operations[0] = refundable(state, { phase: 'REFUNDING', engineState: 'RUNNING', allowedActions: [], lastOwnerRefundRequestId: body.requestId });
      throw Error('accepted but response lost');
    } });
    startPrivateClient(); await settledUntil(() => !harness.byId(button).disabled);
    harness.click(button);
    await settledUntil(() => harness.posts().length === 1 && createPrivateRequestTracker(storage).pending === null && !harness.byId('private-refresh').disabled);
    harness.event('online'); harness.poll(); await settledUntil(() => !harness.byId('private-refresh').disabled);
    assert.equal(harness.posts().length, 1); assert.match(harness.byId('private-notice').textContent, /Solicitud localizada/);
  });

  test(`${action}: click rechecks expired authority before storing or posting a request`, async t => {
    const value = snapshot([refundable(state)], { busy: true });
    const harness = clientHarness(t, { state: value, onPost: () => assert.fail('expired authority must never POST') });
    startPrivateClient(); await settledUntil(() => !harness.byId(button).disabled);
    value.operations[0] = refundable('UNAVAILABLE', { observation: 'RETAINED_HISTORY', allowedActions: [] });
    harness.click(button); await settledUntil(() => !harness.byId('private-refresh').disabled);
    assert.equal(harness.posts().length, 0); assert.equal(createPrivateRequestTracker(harness.storage).pending, null); assert.equal(harness.byId(button).disabled, true);
  });

  test(`${action}: 503 retains identity but a definitive 409 rejection clears it`, async t => {
    const value = snapshot([refundable(state)], { busy: true }), storage = memoryStorage(); let attempt = 0;
    const harness = clientHarness(t, { state: value, storage, onPost: async () => ({ ok: false, status: ++attempt === 1 ? 503 : 409, json: async () => ({ error: 'PRIVATE_OWNER_REFUND_UNAVAILABLE' }) }) });
    startPrivateClient(); await settledUntil(() => !harness.byId(button).disabled);
    harness.click(button); await settledUntil(() => harness.posts().length === 1 && !harness.byId(button).disabled);
    assert.equal(createPrivateRequestTracker(storage).pending.action, action);
    harness.click(button); await settledUntil(() => harness.posts().length === 2 && !harness.byId(button).disabled);
    assert.equal(createPrivateRequestTracker(storage).pending, null); assert.equal(harness.posts()[0].body, harness.posts()[1].body);
    assert.match(harness.byId('private-notice').textContent, /rechazada/);
  });
}

test('early refund accepts future estimated cutoff, while old estimates never manufacture authority', () => {
  for (const eligibleAt of ['2000-01-01T00:00:00.000Z', '2099-01-01T00:00:00.000Z', null]) {
    const op = refundable(); op.ownerRefund.eligibleAt = eligibleAt;
    assert.equal(privateControls(snapshot([op]), op, { connected: true }).refund, true);
    assert.equal(privateControls(snapshot([op]), { ...op, allowedActions: [] }, { connected: true }).refund, false);
    assert.match(privateOwnerRefundLabel(op), /esperará al corte autenticado/);
    if (eligibleAt) assert.match(privateOwnerRefundLabel(op), /reloj del navegador no autoriza/);
    assert.doesNotMatch(privateOutcome(op), /se retiraron|Pago privado completado/);
  }
  const op = refundable('ELIGIBLE');
  assert.equal(privateControls(snapshot([op]), op, { connected: true }).refund, true);
  assert.match(privateOwnerRefundLabel(op), /Solo la acción habilitada por el servicio/);
});

test('a later owner-refund recovery needs a new UUID and never accepts the previous refund request', () => {
  const keys = [uuid, secondUuid], tracker = createPrivateRequestTracker(memoryStorage(), () => keys.shift());
  tracker.begin('refund', id); tracker.accept(refundable('NOTE_ISSUED', { lastOwnerRefundRequestId: uuid }));
  const later = tracker.begin('recoverRefund', id); assert.equal(later.requestId, secondUuid);
  assert.equal(tracker.reconcile([refundable('NOTE_ISSUED', { lastOwnerRefundRequestId: uuid })]), null);
  const done = refundable('WITHDRAWN', { phase: 'REFUNDED', lastOwnerRefundRequestId: secondUuid });
  assert.equal(tracker.reconcile([done]), done); assert.equal(tracker.pending, null);
});

test('authorized budget, issued note, ambiguous send and actual owner receipt remain distinct', () => {
  for (const state of ['WAITING', 'ELIGIBLE']) {
    const text = privateOutcome(refundable(state));
    assert.match(text, /Presupuesto autorizado/); assert.match(text, /Aún no consta una nota.*ni una retirada/);
    assert.doesNotMatch(text, /se retiraron|Pago privado completado/);
  }
  const note = privateOutcome(refundable('NOTE_ISSUED'));
  assert.match(note, /Se emitió la nota/); assert.match(note, /No consta una retirada EVM/);
  const unknown = refundable('UNKNOWN', { settlementState: 'UNKNOWN' });
  assert.match(privateOutcome(unknown), /resultado no está confirmado/); assert.match(privateOutcome(unknown), /no se autoriza otro envío/);
  assert.match(privateOwnerRefundLabel(unknown), /solo se consulta para conciliar/);
  const withdrawn = refundable('WITHDRAWN', { phase: 'REFUNDED', cleanupState: 'COMPLETED' });
  assert.match(privateOutcome(withdrawn), /se retiraron 0,001 ETH ficticios/);
  assert.match(privateOwnerRefundLabel(withdrawn), /wei de devolución retirados al propietario/);
  assert.match(privateOutcome(withdrawn), /no acredita el pago.*ejecutores/);
  assert.doesNotMatch(privateOutcome(withdrawn), /Pago privado completado|ambas compensaciones/);
  const missingAmount = { ...withdrawn, ownerRefund: { ...withdrawn.ownerRefund, amountWei: null } };
  assert.match(privateOutcome(missingAmount), /importe no está verificado/); assert.doesNotMatch(privateOutcome(missingAmount), /se retiraron 0,001/);
});

test('partial native delivery remains recorded after REFUNDED, without completed payout steps', () => {
  const op = refundable('WITHDRAWN', { phase: 'REFUNDED', cleanupState: 'COMPLETED', observation: 'RETAINED_HISTORY', allowedActions: [] });
  assert.equal(op.payouts.sol.state, 'PENDING'); assert.equal(op.payouts.btc.state, 'PENDING');
  assert.match(privateOutcome(op), /Registro histórico/); assert.match(privateOutcome(op), /SOL\/BTC ya realizadas no se deshacen/);
  assert.match(privatePayoutLabel(op.payouts.sol), /Pendiente/);
  const steps = privateProgressSteps(op);
  assert.equal(steps[3].state, 'complete'); assert.equal(steps[4].state, 'unknown'); assert.equal(steps[5].state, 'unknown'); assert.equal(steps[6].state, 'unknown');
  assert.equal(steps[7].state, 'complete'); assert.equal(steps[8].state, 'complete');
  assert.equal(privateControls(snapshot([op], { activeOperationId: null }), op, { connected: true }).prepare, true);
  assert.doesNotMatch(privatePhaseLabel('REFUNDED'), /Pago completado/);
  const merelyPhase = { ...op, ownerRefund: { ...PRIVATE_OWNER_REFUND_DEFAULT } };
  assert.doesNotMatch(privateOutcome(merelyPhase), /se retiraron|Pago privado completado/); assert.equal(privateProgressSteps(merelyPhase)[8].state, 'unknown');
});

test('lost refund authority and disconnected history never promise a live keeper or confuse retention limits', () => {
  const live = refundable();
  assert.match(privateCleanupLabel(live), /plazo original autenticado/); assert.match(privateCleanupLabel(live), /techo total de tres horas/); assert.doesNotMatch(privateCleanupLabel(live), /30 minutos/);
  assert.match(privateCleanupLabel(recoverable()), /máximo 30 minutos/);
  for (const [op, flags] of [[live, { connected: false }], [{ ...live, observation: 'RETAINED_HISTORY' }, {}]]) {
    assert.match(privateCleanupLabel(op, flags), /no confirma.*sigan vivos/); assert.match(privateOwnerRefundLabel(op, flags), /no confirma autoridad viva/);
  }
  const unavailable = refundable('UNAVAILABLE', { settlementState: 'RECOVERY_NOTE_ISSUED', observation: 'RETAINED_HISTORY' });
  assert.match(privateOutcome(unavailable), /no consta su retirada/); assert.match(privateOutcome(unavailable), /conciliación manual/);
  assert.match(privateOwnerRefundLabel(unavailable), /Reiniciar nodos, custodio o sistema operativo no restablece/);
  assert.doesNotMatch(privateOutcome(unavailable), /se retiraron|Pago privado completado/);
});

test('owner refund projection excludes custody, private nested data and acceptance credentials', () => {
  const op = refundable('NOTE_ISSUED', { lastOwnerRefundRequestId: uuid, keeperSecret: 'HIDDEN_CUSTODY' });
  op.ownerRefund.opening = 'HIDDEN_OPENING'; op.ownerRefund.withdrawalRecipient = 'HIDDEN_RECIPIENT';
  const details = privatePublicDetails(op), text = JSON.stringify(details);
  assert.deepEqual(Object.keys(details.ownerRefund).sort(), ['amountWei', 'claimEpoch', 'eligibleAt', 'state']);
  assert.equal(details.recoveryWithdrawal, true); assert.equal(details.payoutWorkerRestart, true); assert.equal(details.executionRestart, false); assert.equal(details.fullAcceptance, false);
  assert.doesNotMatch(text, /HIDDEN_|lastOwnerRefundRequestId|lastRecoveryRequestId|requestId/);
});

test('REFUNDED rendering stays neutral and separate from successful executor payment', async t => {
  const op = refundable('WITHDRAWN', { phase: 'REFUNDED', cleanupState: 'COMPLETED', observation: 'RETAINED_HISTORY', allowedActions: [] });
  const harness = clientHarness(t, { state: snapshot([op], { activeOperationId: null }), onPost: () => assert.fail('history never posts') });
  startPrivateClient(); await settledUntil(() => !harness.byId('private-refresh').disabled && harness.byId('private-status').textContent === privatePhaseLabel('REFUNDED'));
  assert.equal(harness.byId('private-status').className, 'badge neutral'); assert.match(harness.byId('private-payout-sol').textContent, /Sin compensación/);
  assert.match(harness.byId('private-owner-refund').textContent, /retirados al propietario/); assert.equal(harness.byId('private-owner-refund').hidden, false);
  assert.doesNotMatch(harness.byId('private-outcome').textContent, /Pago privado completado/);
});

test("issued owner refund labels pending executor notes as unpaid rather than a promised later compensation",()=>{assert.match(privatePayoutLabel({state:"PENDING",amountWei:null},{settlementState:"RECOVERY_NOTE_ISSUED"}),/Sin compensación/);assert.doesNotMatch(privatePayoutLabel({state:"PENDING",amountWei:null},{settlementState:"RECOVERY_NOTE_ISSUED"}),/retirad[oa]s/);});

test('preauthorization progress never marks the protected reserve funded before its actual outcome',()=>{const op=operation({phase:'OWNER_RELEASED',ownerState:'EXIT_CONFIRMED',settlementState:'NOT_FUNDED',exposure:{evm:'OBSERVED',sol:'NONE',btc:'NONE'}});const steps=privateProgressSteps(op);assert.match(steps[1].label,/Autorización/);assert.equal(steps[1].state,'complete');assert.match(steps[2].label,/Reserva/);assert.equal(steps[2].state,'pending');assert.equal(privateProgressSteps({...op,phase:'FUNDING',settlementState:'UNKNOWN'})[2].state,'current');});
test('earlier funding-first history uses recorded funding rather than the new progress order',()=>{const steps=privateProgressSteps(operation({phase:'AUTHORIZING',ownerState:'PREPARING',settlementState:'FUNDED'}));assert.equal(steps[1].state,'current');assert.equal(steps[2].state,'complete');});
