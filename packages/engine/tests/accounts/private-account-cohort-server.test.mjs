/** Host HTTP mocks only. No native chains or proof execution. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, readFile, rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID} from 'node:crypto';
import {startLocalServer} from '../../src/api/server.mjs';
const profile = 'PC26_SHARED_ASSET_ACCOUNTS_V1', assetId = 'a'.repeat(64);
function mockService() {
  let state, callback, effects = 0, creates = 0, release, held;
  const views = [0, 1].map(ownerIndex => ({ownerIndex, registry: [], assets: [], nativeHoldings: [], requests: []}));
  return {views, effects: () => effects, creates: () => creates, hold() { held = new Promise(resolve => { release = resolve; }); }, factory(options) {
    creates++; callback = options.onCheckpoint;
    state = {profile, groupId: options.groupId, phase: 'READY', opened: true, closed: false, authorityAvailable: true, busy: false, cohort: {state: 'WAITING_FOR_COHORT', active: false, joined: 0, roundNumber: 1, roundsUsed: 1, maxRounds: 4, errorCode: null, checkpointAvailable: true, counts: {reservations: 0, solCompleted: 0, btcCompleted: 0, settled: 0}}, owners: [0, 1].map(ownerIndex => ({ownerIndex, accountId: String(ownerIndex).repeat(32), status: {phase: 'READY', workerAvailable: true, authorityAvailable: true, busy: false, generationCount: 1, requestCount: 0, errorCode: null}}))};
    return {
      async open() { await callback(state); },
      async privateStatus(index) { return structuredClone(views[index]); },
      async ownerAction(index, action, input) {
        if (action === 'prepare') {
          const old = views[index].requests.find(r => r.requestId === input.requestId);
          if (old) assert.deepEqual({...old, state: undefined}, {...input, state: undefined});
          else views[index].requests.push({...input, state: 'PREPARED'});
        }
        if (action === 'execute') { effects++; views[index].requests.find(r => r.requestId === input.requestId).state = 'CONFIRMED'; }
        await callback(state);
      },
      async enroll() { state.cohort.joined++; state.cohort.state = state.cohort.joined === 2 ? 'READY_FOR_REVIEW' : 'WAITING_FOR_COHORT'; await callback(state); },
      async start() { state.cohort.active = true; state.busy = true; await callback(state); },
      async idle() { await held; state.cohort.active = false; state.busy = false; if (state.cohort.state !== 'QUARANTINED') state.cohort.state = 'SETTLED_IN_POOL'; await callback(state); return state; },
      async cancel() { state.cohort.state = 'QUARANTINED'; release?.(); await callback(state); },
      async nextRound() { state.cohort.roundNumber++; state.cohort.roundsUsed++; state.cohort.state = 'WAITING_FOR_COHORT'; state.cohort.joined = 0; await callback(state); },
      async close() { state.phase = 'CLOSED'; state.authorityAvailable = false; await callback(state); },
      async abort() { release?.(); state.phase = 'UNAVAILABLE'; state.authorityAvailable = false; await callback(state); },
    };
  }};
}
async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'shared-accounts-http-')), mock = mockService();
  const app = await startLocalServer({port: 0, directory, sharedAccountDirectory: join(directory, 'named-accounts'), sharedAccountSessionOptions: {createService: mock.factory}});
  t.after(async () => { await app.close(); await rm(directory, {recursive: true, force: true}); });
  const html = await (await fetch(app.origin)).text(), token = html.match(/name="local-token" content="([0-9a-f]+)"/)[1];
  const headers = {'x-local-token': token, 'Content-Type': 'application/json', Origin: app.origin};
  const post = (path, body, overrides = {}) => fetch(app.origin + path, {method: 'POST', headers: {...headers, ...overrides}, body: JSON.stringify(body)});
  const common = (body, overrides) => post('/api/private-accounts/action', {requestId: randomUUID(), ...body}, overrides);
  const owner = (index, body, overrides) => post(`/api/private-accounts/owners/${index}/action`, {requestId: randomUUID(), ...body}, overrides);
  return {directory, app, mock, html, headers, post, common, owner};
}
test('shared-account HTTP guards both views and commands, preserves legacy API, isolates owner history', async t => {
  const {directory, app, mock, html, headers, common, owner} = await fixture(t);
  assert.ok(html.includes('account-owner'));
  for (const path of ['/api/private-accounts', '/api/private-accounts/owners/0/private']) assert.equal((await fetch(app.origin + path)).status, 403);
  assert.equal((await common({action: 'open', profile}, {Origin: 'https://evil.invalid'})).status, 403);
  assert.equal((await common({action: 'open', profile}, {Origin: ''})).status, 403);
  assert.equal((await common({action: 'open', profile}, {'Content-Type': 'text/plain'})).status, 415);
  assert.equal((await common({action: 'open', profile, endpoint: 'https://example.invalid'})).status, 400);
  assert.equal((await common({action: 'open', profile, excess: 'x'.repeat(5000)})).status, 413);
  assert.equal((await common({action: 'open', profile})).status, 202); await app.privateAccounts.idle();
  const prepare = {action: 'prepare', requestId: 'prepare-owner-one', assetId, kind: 'topup', terms: {amount: '1234567'}};
  assert.equal((await owner(0, prepare)).status, 202); await app.privateAccounts.idle();
  assert.equal((await owner(1, {action: 'execute', preparedRequestId: prepare.requestId})).status, 400);
  const execute = {action: 'execute', requestId: 'execute-owner-one', preparedRequestId: prepare.requestId};
  assert.equal((await owner(0, execute)).status, 202); await app.privateAccounts.idle();
  assert.equal((await owner(0, execute)).status, 202); assert.equal(mock.effects(), 1);
  for (const index of [0, 1]) {
    const response = await fetch(app.origin + `/api/private-accounts/owners/${index}/private`, {headers}), view = await response.json();
    assert.equal(response.headers.get('cache-control'), 'no-store'); assert.equal(view.ownerIndex, index); assert.equal(view.requests.length, index === 0 ? 1 : 0);
  }
  const pub = await (await fetch(app.origin + '/api/private-accounts', {headers})).json();
  assert.equal(pub.profile, profile); assert.equal(pub.group.privacyEvaluation, 'NOT_EVALUATED');
  const journal = await readFile(join(directory, 'named-accounts/private-operations.json'), 'utf8');
  for (const forbidden of [assetId, '1234567', 'terms']) { assert.equal(JSON.stringify(pub).includes(forbidden), false); assert.equal(journal.includes(forbidden), false); }
  assert.equal((await (await fetch(app.origin + '/api/private-account', {headers})).json()).profile, 'PC25_TWO_BACKED_ASSET_ACCOUNT_V1');
  assert.equal((await fetch(app.origin + '/api/private-accounts/owners/2/private', {headers})).status, 404);
  assert.equal((await owner(2, {action: 'refresh'})).status, 404);
  assert.equal((await common({action: 'refresh'})).status, 400);
  assert.equal((await owner(0, {action: 'start'})).status, 400);
});
test('shared-account occupation excludes every other runtime panel', async t => {
  const {app, common, post} = await fixture(t);
  await common({action: 'open', profile}); await app.privateAccounts.idle();
  for (const [path, body] of [
    ['/api/private-account/action', {action: 'open', profile: 'PC25_TWO_BACKED_ASSET_ACCOUNT_V1'}],
    ['/api/private-cohort/action', {action: 'open', profile: 'PC24_TWO_OWNER_COHORT_V1'}],
    ['/api/private-cohort/owners/0/action', {action: 'cancel'}],
    ['/api/private-wallet/action', {action: 'open', profile: 'PC23_SHARED_LOCAL_V1'}],
    ['/api/private/action', {action: 'start'}], ['/api/native/action', {action: 'prepare'}], ['/api/triple/action', {action: 'prepare'}],
  ]) assert.equal((await post(path, {...body, ...(!path.includes('native') && !path.includes('triple') ? {requestId: randomUUID()} : {})})).status, 409, path);
});
test('each existing runtime excludes opening shared accounts, including a surviving idle native runtime', async t => {
  const {app, mock, common} = await fixture(t);
  for (const [target, snapshot] of [
    [app.privateAccount, {occupied: true}], [app.privateCohort, {occupied: true}], [app.privateWallet, {occupied: true}],
    [app.privatePayment, {busy: true}], [app.native, {busy: true}], [app.triple, {busy: true}],
    [app.native, {runtime: {}, runtimeStopped: false}], [app.triple, {runtime: {}, runtimeStopped: false}],
  ]) { const original = target.snapshot; target.snapshot = () => snapshot; try { assert.equal((await common({action: 'open', profile})).status, 409); } finally { target.snapshot = original; } }
  assert.equal(mock.creates(), 0);
});
test('payment cannot execute individually, and cancellation remains available during pair work', async t => {
  const {app, mock, common, owner} = await fixture(t);
  await common({action: 'open', profile}); await app.privateAccounts.idle();
  await owner(0, {action: 'prepare', requestId: 'original-payment', assetId, kind: 'payment', terms: {budget: '1'}}); await app.privateAccounts.idle();
  const direct = await owner(0, {action: 'execute', preparedRequestId: 'original-payment'}); assert.equal(direct.status, 400); assert.match(await direct.text(), /PAYMENT_REQUIRES_COHORT/); assert.equal(mock.effects(), 0);
  assert.equal((await owner(0, {action: 'enroll', preparedRequestId: 'original-payment', consentToWait: false, expiresAt: Date.now() + 60000})).status, 400);
  mock.hold(); assert.equal((await common({action: 'start'})).status, 202);
  assert.equal((await owner(0, {action: 'restart'})).status, 400);
  assert.equal((await owner(0, {action: 'cancel'})).status, 202); await app.privateAccounts.idle();
  assert.equal(app.privateAccounts.snapshot().group.cohort.state, 'QUARANTINED');
  assert.equal((await owner(0, {action: 'restart'})).status, 202); await app.privateAccounts.idle();
});
