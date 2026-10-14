/** Functional source/host checks: actual app.mjs rendering and DOM listeners,
 * shared model, HTTP listener and one-use registry. Lower service/authority and
 * DOM are explicitly inert fixtures, not native or visual browser acceptance. */
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { inertDocument } from '../../helpers/inert-dom.mjs';
const sessions = new WeakSet();
mock.module(new URL('../../../../../packages/backend/src/api/withdrawals/wrapped-withdrawal-session-v1.mjs', import.meta.url).href,
  { exports: { assertOwnedWrappedWithdrawalSessionV1(session) { assert.ok(sessions.has(session), 'INERT_SERVICE_ONLY'); } } });
const { startWalletApplication } = await import('../../../src/server/server.mjs');
const { createWalletClient } = await import('../../../../../packages/mobile-protocol/src/wallet/client/view-model.mjs');
const h = c => c.repeat(64), a = c => '0x' + c.repeat(40);
const terms = role => ({ version: 1, profile: 'ORIGINAL_WRAPPED_WITHDRAWAL_TERMS_V1', role,
  actor: { kind: role === 'change' ? 'ORIGINAL_WRAPPED_SOURCE_OWNER_CHANGE' : 'ORIGINAL_GRAPH_PAYOUT_RECIPIENT', identitySHA256: h(role === 'change' ? '1' : '2'), processIdentitySHA256: h(role === 'change' ? '3' : '4'), generation: role === 'change' ? 7 : 1 },
  pool: a('5'), assetId: h('6'), asset: { assetId: h('6'), kind: 'ERC20', symbol: 'CSOL', decimals: 9, chainId: '31337', genesis: h('7'), pool: a('5'), scope: h('8'), policy: h('9'), token: a('a'), codeHash: h('b'), assetIdentity: h('c'), custody: 'ONCHAIN_NOTE_POOL', trust: 'PINNED_LOCAL_CONTRACT_AND_TRUSTED_NATIVE_ISSUER' },
  noteCommitment: h(role === 'change' ? 'd' : 'e'), amount: role === 'change' ? '1800000' : '1200000', recipient: (role === 'change' ? '1' : '2').repeat(40), epoch: '1', head: { number: '42', hash: h('a'), timestamp: '600' }, registryCommitment: h('b'), claimAuthority: a('c') });
const canonical = value => value && typeof value === 'object' ? Array.isArray(value) ? '[' + value.map(canonical).join(',') + ']' : '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}' : JSON.stringify(value);
const offer = role => { const value = terms(role); return { terms: value, termsSHA256: createHash('sha256').update(canonical(value)).digest('hex') }; };
const tick = () => new Promise(resolve => setImmediate(resolve));
async function until(check) { for (let i = 0; i < 200; i++) { if (check()) return; await new Promise(r => setTimeout(r, 5)); } assert.ok(check(), 'host operation did not settle'); }
let sequence = 0;
async function fixture(t, options = {}) {
  const originalFetch = globalThis.fetch, originalDocument = globalThis.document, originalLocation = globalThis.location,
    originalAdd = globalThis.addEventListener, originalRemove = globalThis.removeEventListener;
  const f = { operations: [], calls: [], offers: ['change','recipient'].map(offer), posts: [], ownerUnavailable: false, unavailable: false, loseReply: false, nextState: 'CONFIRMED', hold: null };
  const service = { async snapshot() { return { version: 1, profile: 'ORIGINAL_WRAPPED_NOTE_WITHDRAWAL_SESSION_V1', phase: f.unavailable ? 'UNAVAILABLE' : 'READY', storageAvailable: !f.unavailable, busy: false, queued: 0, observation: 'ORIGINAL_RETAINED_JOURNAL_ONLY', operations: structuredClone(f.operations) }; },
    async ownerView() { if (f.ownerUnavailable) throw Error('INERT_OWNER_UNAVAILABLE'); return { profile: 'ORIGINAL_WRAPPED_NOTE_WITHDRAWAL_SESSION_V1', privateSpendable: null, offers: f.offers.filter(row => !f.operations.some(op => op.role === row.terms.role)), operations: structuredClone(f.operations) }; },
    async submit(action, body) { f.calls.push({ action, body: structuredClone(body) }); if (f.hold) await f.hold; if (action === 'prepare') { const row = f.offers.find(row => row.terms.role === body.role && row.termsSHA256 === body.termsSHA256); assert.ok(row); assert.ok(!f.operations.some(op => op.role === body.role)); f.operations.push({ ...structuredClone(row), requestId: body.requestId, role: body.role, state: 'PREPARED', executionAvailable: true, transactionHash: null, errorCode: null }); }
      else { const row = f.operations.find(row => row.requestId === body.requestId && row.termsSHA256 === body.termsSHA256); assert.ok(row); if (action === 'execute') { assert.equal(row.state, 'PREPARED'); row.state = f.nextState; row.errorCode = 'WRAPPED_WITHDRAWAL_ORIGINAL_RECONCILIATION_REQUIRED'; } else { assert.ok(['UNKNOWN','SEND_UNKNOWN','CONFIRMED'].includes(row.state)); row.state = 'CONFIRMED'; row.errorCode = null; } }
      return { admitted: true, action, requestId: body.requestId }; } };
  sessions.add(service); f.service = service;
  f.app = await startWalletApplication({ wrappedWithdrawalSession: service, actionAccessMode: options.manual ? 'manual' : 'exact-only' });
  const html = await (await originalFetch(f.app.origin + '/')).text();
  const document = inertDocument(html), events = new Map(); f.document = document;
  globalThis.document = document; globalThis.location = { origin: f.app.origin };
  globalThis.addEventListener = (type, listener) => { const set = events.get(type) ?? new Set(); set.add(listener); events.set(type, set); };
  globalThis.removeEventListener = (type, listener) => events.get(type)?.delete(listener);
  f.leave = () => { for (const fn of events.get('pagehide') ?? []) fn(); };
  globalThis.fetch = async (path, input) => { if (input.method === 'GET' && f.failRead) throw Error('INERT_READ_FAILURE');
    if (input.method === 'POST') f.posts.push({ path, input: structuredClone({ ...input, signal: undefined }) });
    const result = await originalFetch(f.app.origin + path, { ...input, headers: { ...input.headers, Origin: f.app.origin } });
    if (input.method === 'POST' && f.loseReply) { await result.json(); throw Error('INERT_LOST_HTTP_REPLY'); }
    return result; };
  f.module = await import('../../../src/client/app.mjs?inert=' + ++sequence);
  f.$ = id => document.getElementById(id);
  f.card = role => f.$('wrapped-withdrawal-records').children.find(n => n.dataset.wrappedRole === role);
  f.button = (role, action) => f.card(role).querySelector(`[data-wrapped-action="${action}"]`);
  f.refresh = async () => { f.$('refresh').click(); await until(() => !f.$('refresh').disabled); };
  f.review = (role, action) => { f.button(role, action).click(); const review = f.module.getWrappedWithdrawalReview(); assert.ok(review); return review; };
  f.grant = review => { const access = f.app.issueActionCapability({ action: review.action, body: review.body }); assert.equal(f.module.acceptWrappedWithdrawalActionAccess({ review, access }), true); return access; };
  f.confirm = async () => { f.$('review-consent').checked = true; f.$('review-consent').dispatch('change'); f.$('confirm-review').click(); await until(() => !f.$('refresh').disabled); };
  await until(() => !f.$('refresh').disabled);
  t.after(async () => { f.leave(); await f.app.close(); globalThis.fetch = originalFetch; globalThis.document = originalDocument; globalThis.location = originalLocation; globalThis.addEventListener = originalAdd; globalThis.removeEventListener = originalRemove; });
  return f;
}
function inertRead(offers = ['change','recipient'].map(offer)) { return { version: 1, profile: 'ACTIVE_FLAT_WALLET_APP_V1', connection: 'CONNECTED', portfolio: null, account: null, nativeClaims: null,
  errors: { portfolio: null, account: null, nativeClaims: null, wrappedWithdrawals: null }, capabilities: { graphExecution: false, nativeDeposit: false, nativeRedeem: false, nativeRefund: false, nativeReconcile: false, nativeResume: false, wrappedWithdrawPrepare: true, wrappedWithdrawExecute: true, wrappedWithdrawReconcile: true },
  wrappedWithdrawals: { snapshot: { version: 1, profile: 'ORIGINAL_WRAPPED_NOTE_WITHDRAWAL_SESSION_V1', phase: 'READY', storageAvailable: true, busy: false, queued: 0, operations: [] }, owner: { profile: 'ORIGINAL_WRAPPED_NOTE_WITHDRAWAL_SESSION_V1', privateSpendable: null, offers } } }; }

test('functional actual rendered app distinguishes both original authorities and sends prepare/execute/reconcile only after distinct grant and consent', async t => {
  const f = await fixture(t); assert.equal(f.$('wrapped-withdrawals').hidden, false); assert.equal(f.$('account').hidden, true);
  assert.match(f.card('change').textContent, /Cambio del titular de origen/); assert.match(f.card('recipient').textContent, /Nota del destinatario del payout/);
  for (const role of ['change','recipient']) { const original = offer(role);
    for (const value of [original.terms.noteCommitment, original.terms.amount, original.terms.recipient, original.terms.actor.processIdentitySHA256, original.termsSHA256]) assert.ok(f.card(role).textContent.includes(value));
    assert.match(f.card(role).textContent, /Saldo privado gastable: desconocido/);
    for (const action of ['wrappedWithdrawPrepare','wrappedWithdrawExecute','wrappedWithdrawReconcile']) {
      const review = f.review(role, action), before = f.posts.length; assert.equal(f.module.getManualActionReview(), null);
      assert.equal(f.$('review-dialog').open, true); assert.equal(f.$('confirm-review').disabled, true);
      f.$('review-consent').checked = true; f.$('review-consent').dispatch('change'); f.$('confirm-review').click(); assert.equal(f.posts.length, before);
      const access = f.grant(review); assert.equal(f.$('review-consent').checked, false); assert.equal(f.$('confirm-review').disabled, true);
      assert.equal(f.document.textContent.includes(access.token), false); assert.equal(JSON.stringify(f.module.getWrappedWithdrawalReview()).includes(access.token), false);
      await f.confirm(); f.$('confirm-review').click(); assert.equal(f.posts.length, before + 1);
      assert.equal(f.posts.at(-1).path, '/api/wallet/wrapped-withdrawal/' + action.replace('wrappedWithdraw','').toLowerCase());
      assert.equal(f.posts.at(-1).input.headers['x-wallet-action-token'], access.token); assert.deepEqual(JSON.parse(f.posts.at(-1).input.body), review.body);
      assert.equal(f.module.acceptWrappedWithdrawalActionAccess({ review, access }), false);
      assert.match(f.$('wrapped-withdrawal-outcome').textContent, /Admisión duradera/); await f.refresh();
    }
  }
  assert.deepEqual(f.calls.map(c => c.action), ['prepare','execute','reconcile','prepare','execute','reconcile']);
  assert.equal(f.document.querySelector('meta[name="wallet-owner-token"]'), null); assert.equal(f.document.querySelector('meta[name="wallet-action-token"]'), null);
});

test('functional cancel, Escape, dialog close and page leave cannot import a late grant or send later', async t => {
  const f = await fixture(t);
  for (const close of [() => f.$('cancel-review').click(), () => f.$('close-review').click(), () => f.$('review-dialog').dispatch('cancel'), () => f.$('review-dialog').close()]) {
    const review = f.review('change', 'wrappedWithdrawPrepare'), access = f.grant(review);
    f.$('review-consent').checked = true; f.$('review-consent').dispatch('change'); close();
    assert.equal(f.module.getWrappedWithdrawalReview(), null); assert.equal(f.module.acceptWrappedWithdrawalActionAccess({ review, access }), false);
    f.$('confirm-review').click(); assert.equal(f.posts.length, 0); f.app.revokeActionCapability(access);
  }
  const review = f.review('recipient', 'wrappedWithdrawPrepare'), access = f.grant(review); f.leave();
  assert.equal(f.module.acceptWrappedWithdrawalActionAccess({ review, access }), false); f.$('confirm-review').click(); assert.equal(f.posts.length, 0);
  assert.equal(f.button('recipient','wrappedWithdrawPrepare').disabled, true);
});

test('functional wrong body, listener, origin, revision, terms and account grant cannot replace the current wrapped review', async t => {
  const f = await fixture(t), review = f.review('recipient', 'wrappedWithdrawPrepare'), access = f.app.issueActionCapability({ action: review.action, body: review.body });
  const changes = [r => r.body.requestId = 'different_original_id', r => r.body.role = 'change', r => r.listenerId = h('f'), r => r.origin = 'http://127.0.0.1:1', r => r.revision++, r => r.context.terms.amount = '1', r => r.context.terms.actor.generation++, r => r.context.terms.pool = a('f')];
  for (const change of changes) { const other = structuredClone(review); change(other); assert.equal(f.module.acceptWrappedWithdrawalActionAccess({ review: other, access }), false); }
  assert.equal(f.module.acceptWrappedWithdrawalActionAccess({ review, access: { ...access, origin: 'http://127.0.0.1:1' } }), false);
  assert.equal(f.module.acceptWrappedWithdrawalActionAccess({ version: 1, profile: 'ORIGINAL_MANUAL_GRAPH_HANDOFF_V1', request: review, access }), false);
  assert.equal(await f.module.acceptManualActionGrant({ review, access }), false);
  assert.equal(f.module.acceptWrappedWithdrawalActionAccess({ review, access }), true); await f.refresh();
  assert.equal(f.module.getWrappedWithdrawalReview(), null); assert.equal(f.module.acceptWrappedWithdrawalActionAccess({ review, access }), false); assert.equal(f.posts.length, 0);
});

test('functional unknown owner/capabilities and stale HTTP observation disable controls without zero balances', async t => {
  const f = await fixture(t); f.ownerUnavailable = true; await f.refresh();
  assert.equal(f.button('change','wrappedWithdrawPrepare'), null); assert.match(f.card('change').textContent, /No se infiere saldo cero/);
  f.ownerUnavailable = false; f.unavailable = true; await f.refresh(); assert.equal(f.button('recipient','wrappedWithdrawPrepare'), null);
  assert.match(f.$('wrapped-withdrawal-error').textContent, /no verificado/); assert.equal(f.posts.length, 0);
});

test('functional lost execute HTTP reply retains original ID and only reconciles without repeating execute', async t => {
  const f = await fixture(t); f.nextState = 'UNKNOWN'; let review = f.review('recipient','wrappedWithdrawPrepare'); f.grant(review); await f.confirm(); await f.refresh();
  review = f.review('recipient','wrappedWithdrawExecute'); const originalId = review.body.requestId; f.grant(review); f.loseReply = true; await f.confirm();
  assert.match(f.$('wrapped-withdrawal-outcome').textContent, /resultado desconocidos/); assert.ok(f.$('wrapped-withdrawal-outcome').textContent.includes(originalId));
  f.loseReply = false; await f.refresh(); assert.equal(f.button('recipient','wrappedWithdrawExecute'), null);
  review = f.review('recipient','wrappedWithdrawReconcile'); assert.equal(review.body.requestId, originalId); f.grant(review); await f.confirm(); await f.refresh();
  assert.deepEqual(f.calls.map(c => c.action), ['prepare','execute','reconcile']); assert.match(f.card('recipient').textContent, /respuesta anterior fue incierta/);
  assert.equal(f.button('change','wrappedWithdrawPrepare').disabled, true);
});

test('functional lost prepare reply refuses replacement preparation or later signing even after retained PREPARED read', async t => {
  const f = await fixture(t), review = f.review('change','wrappedWithdrawPrepare'); f.grant(review); f.loseReply = true; await f.confirm(); f.loseReply = false; await f.refresh();
  assert.equal(f.button('change','wrappedWithdrawExecute').disabled, true); f.button('change','wrappedWithdrawExecute').click(); assert.equal(f.module.getWrappedWithdrawalReview(), null); assert.equal(f.posts.length, 1);
});

test('functional genuine server rejects a foreign-listener token; local client retains UNKNOWN instead of retrying', async t => {
  const f = await fixture(t), foreign = await startWalletApplication({ wrappedWithdrawalSession: f.service, actionAccessMode: 'exact-only' }); t.after(() => foreign.close());
  const review = f.review('change','wrappedWithdrawPrepare'), token = foreign.issueActionCapability({ action: review.action, body: review.body }).token;
  // An untrusted envelope can copy metadata; only the real server can prove a
  // token belongs to this listener. It must refuse before inert service effects.
  assert.equal(f.module.acceptWrappedWithdrawalActionAccess({ review, access: { origin: f.app.origin, token } }), true); await f.confirm();
  assert.equal(f.calls.length, 0); assert.equal(f.posts.length, 1); assert.match(f.$('wrapped-withdrawal-outcome').textContent, /desconocidos/);
});

test('functional broad manual mode never enables wrapped review/import via generic action token', async t => {
  const f = await fixture(t, { manual: true }); assert.equal(f.button('change','wrappedWithdrawPrepare').disabled, true);
  f.button('change','wrappedWithdrawPrepare').click(); assert.equal(f.module.getWrappedWithdrawalReview(), null); assert.equal(f.posts.length, 0);
});

test('functional shared browser model rejects stale and changed terms before any POST and burns canceled token locally', async () => {
  let data = inertRead(), posts = 0; const descriptor = { origin: 'http://127.0.0.1:12345', listenerId: h('a') };
  const client = createWalletClient({ ownerToken: h('b'), wrappedWithdrawalAccess: descriptor, fetchImpl: async (path, options) => {
    if (options.method === 'POST') posts++; return { ok: true, status: 200, json: async () => structuredClone(data) }; } });
  await client.refresh(); const body = { requestId: 'wrapped_original_01', role: 'change', termsSHA256: data.wrappedWithdrawals.owner.offers[0].termsSHA256 };
  client.review('wrappedWithdrawPrepare', body); const review = client.getWrappedWithdrawalReview(), access = { origin: descriptor.origin, token: h('c') };
  assert.equal(client.acceptWrappedWithdrawalActionAccess({ review, access }), true); client.cancelReview(); assert.equal(await client.confirm(), false);
  client.review('wrappedWithdrawPrepare', body); assert.equal(client.acceptWrappedWithdrawalActionAccess({ review: client.getWrappedWithdrawalReview(), access }), false);
  await client.refresh(); data.wrappedWithdrawals.owner.offers[0].terms.actor.generation++; await client.refresh();
  assert.equal(client.acceptWrappedWithdrawalActionAccess({ review, access }), false); assert.equal(posts, 0);
});


test('functional stale GET retains historical terms while disabling every wrapped action and canceling an armed review', async t => {
  const f = await fixture(t), review = f.review('change','wrappedWithdrawPrepare'); f.grant(review);
  f.failRead = true; await f.refresh(); assert.equal(f.module.getWrappedWithdrawalReview(), null);
  for (const role of ['change','recipient']) { assert.equal(f.button(role,'wrappedWithdrawPrepare').disabled, true); assert.match(f.card(role).textContent, /Desactualizado/); }
  assert.equal(f.posts.length, 0);
});

test('functional retained UNKNOWN journal fences both prepared roles and reconciliation never clears that page fence', async t => {
  const f = await fixture(t);
  for (const role of ['change','recipient']) { const review = f.review(role,'wrappedWithdrawPrepare'); f.grant(review); await f.confirm(); await f.refresh(); }
  f.nextState = 'UNKNOWN'; let review = f.review('recipient','wrappedWithdrawExecute'); f.grant(review); await f.confirm(); await f.refresh();
  assert.equal(f.button('change','wrappedWithdrawExecute').disabled, true);
  review = f.review('recipient','wrappedWithdrawReconcile'); f.grant(review); await f.confirm(); await f.refresh();
  assert.equal(f.button('change','wrappedWithdrawExecute').disabled, true); assert.match(f.$('wrapped-withdrawal-records').textContent, /ambos roles/);
  assert.equal(f.calls.filter(c => c.action === 'execute').length, 1);
});

test('functional rapid double confirm and close during an admitted request dispatch only once', async t => {
  const f = await fixture(t); let release; f.hold = new Promise(resolve => release = resolve);
  const review = f.review('change','wrappedWithdrawPrepare'); f.grant(review);
  f.$('review-consent').checked = true; f.$('review-consent').dispatch('change'); f.$('confirm-review').click(); f.$('confirm-review').click();
  await until(() => f.calls.length === 1); f.$('close-review').click(); f.$('cancel-review').click(); f.$('confirm-review').click();
  assert.equal(f.posts.length, 1); assert.equal(f.module.getWrappedWithdrawalReview(), null); release(); await until(() => !f.$('refresh').disabled);
  assert.equal(f.posts.length, 1); assert.equal(f.calls.length, 1);
});

test('functional genuine server refuses a same-listener token issued for another exact body before service effects', async t => {
  const f = await fixture(t), review = f.review('recipient','wrappedWithdrawPrepare');
  const other = offer('change'), body = { requestId: review.body.requestId, role: 'change', termsSHA256: other.termsSHA256 };
  const access = f.app.issueActionCapability({ action: review.action, body });
  // The envelope is a local review binding, not a claim that its token has been
  // validated. The unchanged real registry must reject this mismatched body.
  assert.equal(f.module.acceptWrappedWithdrawalActionAccess({ review, access }), true); await f.confirm();
  assert.equal(f.calls.length, 0); assert.equal(f.posts.length, 1); assert.match(f.$('wrapped-withdrawal-outcome').textContent, /desconocidos/);
  await f.refresh(); assert.equal(f.button('recipient','wrappedWithdrawPrepare').disabled, true);
});
