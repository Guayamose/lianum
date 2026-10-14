/** Browser-state checks only. No node/proof execution. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {ACCOUNT_CLIENT_KEY, SHARED_ACCOUNT_PROFILE, accountControls, createAccountRequestTracker, validateSharedAccountSnapshot, validateAccountPortfolio} from '../../../../archive/legacy-client/private-account.mjs';
const storage = () => { const data = new Map(); return {getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value)}; };
const snapshot = state => ({profile: SHARED_ACCOUNT_PROFILE, requests: [], available: true, occupied: true, busy: false, capabilities: {fullAcceptance: false}, group: {phase: 'READY', authorityAvailable: true, privacyEvaluation: 'NOT_EVALUATED', transparentFallback: false, owners: [0, 1].map(ownerIndex => ({ownerIndex, status: {workerAvailable: true, authorityAvailable: true}})), cohort: {state, active: false, joined: 2, roundNumber: 1, roundsUsed: 1, maxRounds: 4}}});
const view = {cohortEnrollments: [], assets: [{positions: [{id: 'note-original', state: 'AVAILABLE'}]}], requests: [{requestId: 'request-payment', kind: 'payment', state: 'PREPARED'}, {requestId: 'request-deposit', kind: 'topup', state: 'PREPARED'}, {requestId: 'request-unknown', kind: 'payment', state: 'UNKNOWN'}]};
test('owner switch and reload preserve pending original identity without saving terms or balances', () => {
  const s = storage(), tracker = createAccountRequestTracker(s, randomUUID);
  tracker.select('owner-0-request'); const pending = tracker.begin('enroll', 0, 'owner-0-request'); tracker.chooseOwner(1);
  assert.equal(tracker.selected, null); tracker.select('owner-1-request'); assert.equal(createAccountRequestTracker(s).pending.requestId, pending.requestId);
  assert.throws(() => tracker.begin('prepare', 1), /PENDING/);
  assert.throws(() => tracker.reconcile([{id: pending.requestId, action: 'enroll', ownerIndex: 1, preparedRequestId: 'owner-0-request'}]), /RESPONSE/);
  assert.equal(tracker.reconcile([{id: pending.requestId, action: 'enroll', ownerIndex: 0, preparedRequestId: 'owner-0-request'}]), true);
  assert.equal(tracker.pending, null); assert.equal(tracker.selected, 'owner-1-request'); tracker.chooseOwner(0); assert.equal(tracker.selected, 'owner-0-request');
  const saved = s.getItem(ACCOUNT_CLIENT_KEY); for (const word of ['terms', 'amount', 'assetId', 'noteId', 'consentToWait', 'expiresAt']) assert.equal(saved.includes(word), false);
});
test('prepare selects only its original owner request; invalid persistence blocks actions', () => {
  const s = storage(), tracker = createAccountRequestTracker(s, randomUUID), pending = tracker.begin('prepare', 0); tracker.chooseOwner(1);
  tracker.reconcile([{id: pending.requestId, action: 'prepare', ownerIndex: 0, preparedRequestId: null}]); assert.equal(tracker.selected, null); tracker.chooseOwner(0); assert.equal(tracker.selected, pending.requestId);
  s.setItem(ACCOUNT_CLIENT_KEY, JSON.stringify({version: 1, ownerIndex: 0, selected: [null, null], pending: {...pending, secret: 'bad'}})); assert.throws(() => createAccountRequestTracker(s), /STORAGE_INVALID/);
  const broken = createAccountRequestTracker({getItem: () => null, setItem: () => { throw Error('quota'); }}, randomUUID); assert.throws(() => broken.begin('open', null), /quota/); assert.equal(broken.pending, null);
});
test('payment gates require explicit consent and pair start, never direct payment execution', () => {
  const s = snapshot('READY_FOR_REVIEW'), options = {requestId: 'request-payment', noteId: 'note-original'};
  let c = accountControls(s, view, 0, options); assert.equal(c.execute, false); assert.equal(c.enroll, false); assert.equal(c.start, true);
  c = accountControls(s, view, 0, {...options, consent: true}); assert.equal(c.enroll, true);
  assert.equal(accountControls(s, view, 0, {requestId: 'request-deposit'}).execute, true);
  assert.equal(accountControls(s, view, 0, {requestId: 'request-unknown'}).refund, true);
  assert.equal(accountControls(s, view, 0, {...options, connected: false}).start, false);
  assert.equal(accountControls(s, view, 0, {...options, pending: true}).enroll, false);
});
test('running pair permits cancellation but blocks owner changes; restart becomes available after quarantine', () => {
  const s = snapshot('SOL_BATCH'); s.busy = true; s.group.cohort.active = true;
  const running = accountControls(s, {...view, cohortEnrollments: [{requestId: 'request-payment', roundNumber: 1, state: 'SOL_BATCH', active: true}]}, 0, {requestId: 'request-deposit'}); assert.equal(running.cancel, true);
  for (const key of ['topup', 'payment', 'execute', 'restart', 'refresh', 'close', 'next', 'reset']) assert.equal(running[key], false, key);
  s.busy = false; s.group.cohort.active = false; s.group.cohort.state = 'QUARANTINED'; s.group.owners[0].status.workerAvailable = false;
  const recovered = accountControls(s, null, 0); assert.equal(recovered.restart, true); assert.equal(recovered.refresh, false); assert.equal(recovered.reset, true); assert.equal(recovered.next, false);
  s.group.cohort.state = 'SETTLED_IN_POOL'; assert.equal(accountControls(s, view, 0).next, true); s.group.cohort.roundsUsed = s.group.cohort.maxRounds; assert.equal(accountControls(s, view, 0).next, false);
});
test('UI reports shared pools and local trust without elevating privacy or exposing private HTML', async () => {
  assert.equal(validateSharedAccountSnapshot(snapshot('SETTLED_IN_POOL')).group.privacyEvaluation, 'NOT_EVALUATED');
  const bad = snapshot('SETTLED_IN_POOL'); bad.group.privacyEvaluation = 'PASS'; assert.throws(() => validateSharedAccountSnapshot(bad), /CONTRACT/);
  const html = await readFile(new URL('../../../../archive/legacy-client/index.html', import.meta.url), 'utf8'), client = await readFile(new URL('../../../../archive/legacy-client/private-account.mjs', import.meta.url), 'utf8');
  for (const text of ['account-owner', 'account-consent', 'account-enroll', 'account-start', 'account-next', 'account-cancel', 'account-reset', '15 minutos', 'CONTROLADOR COMÚN DE CONFIANZA', 'NOT_EVALUATED', 'mismos pools', 'Cerrar pools vacíos']) assert.ok(html.includes(text), text);
  assert.ok(client.includes("cache:'no-store'")); assert.equal(client.includes('innerHTML'), false); assert.equal(client.includes("api('/api/private-account'"), false);
});

test('private portfolio identity must match the selected owner in the current shared group', () => {
  const s = snapshot('WAITING_FOR_COHORT'); s.group.owners[0].accountId = 'owner-zero'; s.group.owners[1].accountId = 'owner-one';
  const v = {accountId: 'owner-zero', registry: [], assets: [], nativeHoldings: [], requests: [], cohortEnrollments: []};
  assert.equal(validateAccountPortfolio(v, s, 0), v); assert.throws(() => validateAccountPortfolio(v, s, 1), /PRIVATE_API_CONTRACT/);
});

test('rendered client discards a late owner view and retries an uncertain enrollment with the exact original consent', async t => {
  const {startSharedAccountClient} = await import('../../../../archive/legacy-client/private-account.mjs');
  const html = await readFile(new URL('../../../../archive/legacy-client/index.html', import.meta.url), 'utf8');
  class Element {
    constructor(tag = '') { this.tag = tag; this.value = ''; this.children = []; this.textContent = ''; this.checked = false; }
    replaceChildren() { this.children = []; if (this.tag === 'select') this.value = ''; }
    append(child) { this.children.push(child); if (this.tag === 'select' && this.children.length === 1) this.value = child.value; }
  }
  const elements = new Map([...html.matchAll(/<(\w+)[^>]*\bid="(account-[^"]+)"/g)].map(([, tag, id]) => [id, new Element(tag)]));
  const $ = id => elements.get(id), handlers = new Map(), saved = Object.fromEntries(['document', 'window', 'localStorage', 'fetch'].map(key => [key, globalThis[key]]));
  const s = snapshot('WAITING_FOR_COHORT'); s.group.cohort.joined = 0; s.group.cohort.counts = {reservations: 0, solCompleted: 0, btcCompleted: 0, settled: 0};
  for (const o of s.group.owners) { o.accountId = `owner-account-${o.ownerIndex}`; o.status.phase = 'READY'; }
  const views = [0, 1].map(index => ({accountId: `owner-account-${index}`, cohortEnrollments: [], registry: [{assetId: 'asset-for-tests', symbol: 'PALT', decimals: 6, kind: 'ERC20'}], assets: [{assetId: 'asset-for-tests', available: String((index + 1) * 1000000), observation: 'LIVE', positions: [], backing: {held: '3000000', liabilities: '3000000'}}], nativeHoldings: [], requests: [{requestId: `prepared-payment-${index}`, kind: 'payment', state: 'PREPARED', assetId: 'asset-for-tests', terms: {budget: '1000000'}}]}));
  let releaseOld, waitingOld = false, first = true;
  const delayed = new Promise(resolve => { releaseOld = resolve; }), posts = [];
  globalThis.document = {getElementById: $, createElement: tag => new Element(tag), querySelector: () => ({content: 'token'}), hidden: false};
  globalThis.window = {addEventListener(name, handler) { handlers.set(name, handler); }}; globalThis.localStorage = storage();
  globalThis.fetch = async (path, options) => {
    if (options.method === 'POST') {
      const body = JSON.parse(options.body); posts.push({path, body});
      if (posts.length === 1) throw Error('CONNECTION_LOST');
      s.requests.push({id: body.requestId, action: body.action, ownerIndex: 1, preparedRequestId: body.preparedRequestId, state: 'FINISHED'});
      return {ok: true, json: async () => ({snapshot: structuredClone(s)})};
    }
    if (path === '/api/private-accounts') return {ok: true, json: async () => structuredClone(s)};
    const index = Number(path.split('/')[4]);
    if (index === 0 && first) { first = false; waitingOld = true; await delayed; }
    return {ok: true, json: async () => structuredClone(views[index])};
  };
  t.after(() => { releaseOld(); handlers.get('pagehide')?.(); for (const [key, value] of Object.entries(saved)) if (value === undefined) delete globalThis[key]; else globalThis[key] = value; });
  const until = async condition => { for (let i = 0; i < 100; i++) { if (condition()) return; await new Promise(resolve => setImmediate(resolve)); } assert.fail('client state did not settle'); };
  startSharedAccountClient(); await until(() => waitingOld);
  $('account-owner').value = '1'; $('account-owner').onchange(); releaseOld();
  await until(() => $('account-balances').children[0]?.textContent.includes('titular 2'));
  assert.match($('account-balances').children[0].textContent, /PALT: 2 /);
  $('account-consent').checked = true; $('account-consent').onchange(); assert.equal($('account-enroll').disabled, false); $('account-enroll').onclick();
  await until(() => posts.length === 1 && !$('account-query').disabled && !$('account-owner').disabled);
  assert.match($('account-pending').textContent, /titular simulado 2/); assert.equal($('account-retry').disabled, false);
  $('account-owner').value = '0'; $('account-owner').onchange(); assert.equal($('account-consent').checked, false); assert.equal($('account-retry').disabled, true);
  $('account-retry').onclick(); assert.equal(posts.length, 1);
  $('account-owner').value = '1'; $('account-owner').onchange(); await until(() => !$('account-query').disabled && !$('account-retry').disabled);
  $('account-retry').onclick(); await until(() => posts.length === 2 && $('account-pending').textContent === '');
  assert.deepEqual(posts[1], posts[0]); assert.equal(posts[1].path, '/api/private-accounts/owners/1/action'); assert.equal(posts[1].body.consentToWait, true);
  assert.equal($('account-execute').disabled, true); assert.equal($('account-consent').checked, false);
  await until(() => !$('account-query').disabled && !$('account-owner').disabled);
});

test('a prior round enrollment cannot recycle its prepared payment identity into a new round', () => {
  const s = snapshot('WAITING_FOR_COHORT'); s.group.cohort.roundNumber = 2; s.group.cohort.joined = 1;
  const canceled = {...view, cohortEnrollments: [{requestId: 'request-payment', roundNumber: 1, state: 'CANCELLED_NO_DISPATCH', active: false}]};
  const controls = accountControls(s, canceled, 0, {requestId: 'request-payment', consent: true});
  assert.equal(controls.enroll, false); assert.equal(controls.payment, true); assert.equal(controls.cancel, false);
  assert.equal(accountControls(s, null, 0).cancel, true, 'original cancellation remains reachable without a live private view');
});
