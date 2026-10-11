/** Focused, explicitly mocked original ports and brands. No real owner child,
 * proof/hash backend, node, transaction or genuine custody is created here. */
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
const worlds = new WeakMap();
const h = c => c.repeat(64), address = c => c.repeat(40);
const clone = value => structuredClone(value);
const paths = {
  owner: new URL('./flat-owner-process.mjs', import.meta.url),
  account: new URL('../wallet-platform/modules/global-state/flat-account-authority.mjs', import.meta.url),
  system: new URL('../wallet-platform/modules/ops/deploy-system.mjs', import.meta.url),
  runtime: new URL('../wallet-platform/modules/chain-adapters/local-evm-ownership.mjs', import.meta.url),
};
mock.module(paths.owner.href, { exports: { assertOwnedFlatOwnerProcess(owner, expected) {
  const w = worlds.get(expected.runtime); assert.ok(w?.owners.has(owner), 'FIXTURE_ORIGINAL_OWNER_REQUIRED');
  assert.equal(expected.system, w.system); assert.equal(expected.poolIndex, 0); assert.equal(w.ownerAvailable, true);
} } });
mock.module(paths.account.href, { exports: { assertOwnedFlatAccountAuthority(account, expected) {
  const w = worlds.get(expected.runtime); assert.equal(account, w.account); assert.equal(expected.system, w.system);
  assert.equal(expected.poolIndex, 0); assert.equal(expected.owner, w.owner, 'FIXTURE_EXACT_ORIGINAL_OWNER_REQUIRED');
  assert.equal(w.accountAvailable, true);
} } });
mock.module(paths.system.href, { exports: { assertOwnedFlatSystem(runtime, system) { assert.equal(worlds.get(runtime)?.system, system); } } });
mock.module(paths.runtime.href, { exports: { async assertLocalEvm(runtime) { assert.ok(worlds.has(runtime)); } } });
const { createFlatOwnerManualPreparation, restoreFlatOwnerManualPreparation } = await import('@lianum/backend/custody/preparation/flat-owner-manual-preparation');

function fixture() {
  const runtime = {}, system = {}, calls = [];
  const asset = Object.freeze({ assetId: h('a'), symbol: 'PALT', decimals: 6, pool: address('1'), chainId: '31337', genesis: h('b'),
    kind: 'ERC20', scope: h('1'), policy: h('2'), token: address('8'), codeHash: h('5'), assetIdentity: h('6'),
    custody: 'ONCHAIN_NOTE_POOL', trust: 'PINNED_LOCAL_CONTRACT_AND_TRUSTED_NATIVE_ISSUER' });
  const w = { runtime, system, calls, views: new Map(), ownerAvailable: true, accountAvailable: true,
    records: [], registrations: new Map(), async bindingHook() {}, async readHook() {}, async prepareHook() {}, async registerHook() {} };
  const view = (kind, role = 'source') => ({ identitySHA256: h('c'), kind, observed: { blockHash: h('d'), timestamp: '6000' }, eligible: true,
    note: kind === 'deposit' ? null : { role, amount: '77', recipient: address('3'), status: 'AVAILABLE', observedUnspent: true }, prepared: null });
  w.views.set('deposit', view('deposit'));
  for (const role of ['source', 'change', 'recovery']) w.views.set('withdraw_' + role, view('withdraw_' + role, role));
  const prepare = async (kind, input) => {
    calls.push({ name: 'prepare', kind, input: clone(input) });
    const value = w.views.get(kind), role = kind === 'deposit' ? 'source' : kind.slice(9);
    value.eligible = false;
    if (kind === 'deposit') value.note = { role, amount: input.amount, recipient: input.exitRecipient, status: 'UNISSUED', observedUnspent: false };
    else value.note.status = 'LOCKED';
    value.prepared = { stage: 'PREPARED', epoch: input.epoch, amount: value.note.amount,
      recipient: value.note.recipient, submissionBound: false };
    const manual = w.records.find(entry => entry.review.ownerKind === kind); if (manual) manual.ownerState = 'PREPARED';
    await w.prepareHook(kind, input);
    return { kind, stage: 'PREPARED', reconcileRequired: false, dispatchAllowed: false };
  };
  const owner = { publicView: { async summary() { calls.push({ name: 'summary' }); return { identitySHA256: h('c'), closed: false }; } },
    ownerView: { async manualPreparations() { return clone({ version: 1, records: w.records }); }, async preparationTerms({ kind }) { calls.push({ name: 'read', kind }); await w.readHook(kind); return clone(w.views.get(kind)); } },
    owner: { async prepareManualPreparation({ review }) {
      assert.ok(!w.records.some(entry => entry.review.ownerKind === review.ownerKind));
      w.records.push({ review: clone(review), ownerState: 'LATCHED' }); await w.bindingHook();
      return review.kind === 'TOP_UP' ? owner.owner.prepareDeposit({ amount: review.amount, epoch: review.epoch, exitRecipient: review.recipient })
        : owner.owner.prepareWithdrawal({ role: review.role, epoch: review.epoch });
    }, prepareDeposit: input => prepare('deposit', input), prepareWithdrawal: input => prepare('withdraw_' + input.role, input) } };
  const register = async (kind, ref, role) => {
    calls.push({ name: 'register', kind, ref, role }); w.registrations.set(ref, { kind, role }); await w.registerHook(kind, ref, role);
    return { kind, ownerOperationRef: ref, assetId: asset.assetId };
  };
  const account = { registry: [asset], assetId: asset.assetId,
    config: { accountId: 'test_account_01', journalId: 'test_journal_01', lifetime: h('7'), registry: [asset] }, ownerActions: {
    async readManualRegistration(review) {
      calls.push({ name: 'readRegistration' }); const entry = w.registrations.get(review.request.ownerOperationRef);
      if (!entry) return { status: 'ABSENT' }; assert.equal(entry.kind, review.kind); assert.equal(entry.role ?? null, review.role);
      return { status: entry.admitted ? 'ALREADY_ADMITTED' : 'REGISTERED' };
    },
    registerTopUp: ref => register('TOP_UP', ref), registerExit: (ref, role) => register('EXIT', ref, role) } };
  Object.assign(w, { owner, account, owners: new Set([owner]), input: { runtime, system, poolIndex: 0, owner, account } });
  worlds.set(runtime, w); return w;
}
const topup = (overrides = {}) => ({ requestId: 'manual_topup_01', kind: 'TOP_UP', amount: '77', exitRecipient: address('3'), ...overrides });
const exit = (overrides = {}) => ({ requestId: 'manual_exit_01', kind: 'EXIT', role: 'source', ...overrides });
const effects = w => w.calls.filter(value => ['prepare', 'register'].includes(value.name));
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };

test('genuine brand checks include exact original owner, reject copies and do no preparation', async () => {
  const w = fixture(), other = { ...w.owner }; w.owners.add(other);
  await assert.rejects(createFlatOwnerManualPreparation({ ...w.input, owner: other }), /EXACT_ORIGINAL_OWNER/);
  await assert.rejects(createFlatOwnerManualPreparation({ ...w.input, owner: { ...w.owner } }), /ORIGINAL_OWNER/);
  await assert.rejects(createFlatOwnerManualPreparation({ ...w.input, account: { ...w.account } }));
  await assert.rejects(createFlatOwnerManualPreparation({ ...w.input, proofFactory() {} }), /FIELDS/);
  assert.deepEqual(effects(w), []);
});

test('top-up review is read-only, immutable and returns only the unchanged account handoff after one confirmation', async () => {
  const w = fixture(), adapter = await createFlatOwnerManualPreparation(w.input), input = topup();
  const review = await adapter.review(input); input.amount = '999';
  assert.deepEqual(effects(w), []); assert.equal(review.amount, '77'); assert.equal(review.recipient, address('3'));
  assert.equal(review.epoch, '10'); assert.equal(review.asset.assetId, w.account.assetId);
  assert.throws(() => { review.amount = '999'; });
  assert.throws(() => JSON.stringify(adapter), /NOT_SERIALIZABLE/);
  const [handoff, duplicate] = await Promise.all([adapter.confirm(), adapter.confirm()]);
  assert.equal(duplicate, false); assert.deepEqual(handoff, review.request);
  assert.deepEqual(Object.keys(handoff).sort(), ['assetId', 'kind', 'ownerOperationRef', 'requestId']);
  assert.deepEqual(effects(w).map(row => row.name), ['prepare', 'register']);
  assert.deepEqual(effects(w)[0].input, { amount: '77', epoch: '10', exitRecipient: address('3') });
  assert.equal(await adapter.confirm(), false); assert.equal(adapter.getState().phase, 'HANDOFF_READY');
  await assert.rejects(adapter.review(topup({ requestId: 'replacement_01' })), /ORIGINAL_ONLY/);
});

for (const role of ['source', 'change', 'recovery']) test('EXIT reviews original full ' + role + ' value and recipient before locking', async () => {
  const w = fixture(), adapter = await createFlatOwnerManualPreparation(w.input);
  const review = await adapter.review(exit({ role }));
  assert.equal(review.amount, '77'); assert.equal(review.recipient, address('3')); assert.equal(review.role, role);
  assert.deepEqual(effects(w), []);
  assert.deepEqual(await adapter.confirm(), review.request);
  assert.deepEqual(effects(w)[0].input, { role, epoch: '10' });
  assert.equal(effects(w)[1].role, role);
});

test('one surviving original cannot be rebound, including simultaneous construction', async () => {
  const w = fixture(), results = await Promise.allSettled([createFlatOwnerManualPreparation(w.input), createFlatOwnerManualPreparation(w.input)]);
  assert.equal(results.filter(v => v.status === 'fulfilled').length, 1);
  assert.equal(results.filter(v => v.status === 'rejected').length, 1);
});

test('late read after cancel cannot revive review; invalid new input invalidates an older review', async () => {
  const w = fixture(), adapter = await createFlatOwnerManualPreparation(w.input), gate = deferred();
  w.readHook = () => gate.promise;
  const result = adapter.review(topup()); assert.equal(adapter.cancelReview(), true); gate.resolve();
  await assert.rejects(result, /CANCELLED/); assert.equal(await adapter.confirm(), false);
  w.readHook = async () => {};
  await adapter.review(topup()); await assert.rejects(adapter.review({ ...topup(), amount: '1\n' }), /TERMS/);
  assert.equal(await adapter.confirm(), false); assert.deepEqual(effects(w), []);
});

for (const [label, mutate] of [
  ['epoch', v => { v.observed.timestamp = '6600'; }], ['identity', v => { v.identitySHA256 = h('e'); }],
  ['amount', v => { v.note.amount = '78'; }], ['recipient', v => { v.note.recipient = address('4'); }],
  ['eligibility', v => { v.eligible = false; }], ['spent note', v => { v.note.observedUnspent = false; }],
  ['note state', v => { v.note.status = 'LOCKED'; }],
]) test('late ' + label + ' change consumes review without preparation', async () => {
  const w = fixture(), adapter = await createFlatOwnerManualPreparation(w.input); await adapter.review(exit());
  mutate(w.views.get('withdraw_source'));
  assert.equal(await adapter.confirm(), false); assert.equal(adapter.getState().phase, 'IDLE');
  assert.equal(adapter.getState().errorCode, 'FLAT_OWNER_PREPARATION_REVIEW_STALE');
  assert.deepEqual(effects(w), []); assert.equal(await adapter.confirm(), false);
});

test('original owner loss consumes review without mutation', async () => {
  const w = fixture(), adapter = await createFlatOwnerManualPreparation(w.input); await adapter.review(topup());
  w.ownerAvailable = false; assert.equal(await adapter.confirm(), false); assert.deepEqual(effects(w), []);
});

for (const [label, change] of [
  ['wrong amount', v => { v.prepared.amount = '999'; }], ['wrong recipient', v => { v.prepared.recipient = address('4'); }],
  ['renewed epoch', v => { v.prepared.epoch = '11'; }], ['crossed epoch', v => { v.observed.timestamp = '6600'; }],
  ['external submission', v => { v.prepared.submissionBound = true; }], ['unexpected signing', v => { v.prepared.stage = 'SIGNING'; }],
]) test('post-mutation ' + label + ' blocks registration and retains original UNKNOWN without retry', async () => {
  const w = fixture(), adapter = await createFlatOwnerManualPreparation(w.input), review = await adapter.review(exit());
  w.prepareHook = async kind => change(w.views.get(kind));
  assert.equal(await adapter.confirm(), false); const state = adapter.getState();
  assert.equal(state.phase, 'UNKNOWN'); assert.equal(state.attempts[0].handoff, null);
  assert.deepEqual(state.attempts[0].request, review.request); assert.deepEqual(state.attempts[0].review, review);
  assert.equal(adapter.cancelReview(), false); assert.equal(await adapter.confirm(), false);
  await assert.rejects(adapter.review(exit({ requestId: 'replacement_02' })), /UNAVAILABLE/);
  await assert.rejects(createFlatOwnerManualPreparation(w.input), /ALREADY_BOUND/);
  assert.deepEqual(effects(w).map(v => v.name), ['prepare']);
});

test('lost owner mutation reply stays UNKNOWN and suppresses untrusted error text', async () => {
  const w = fixture(), adapter = await createFlatOwnerManualPreparation(w.input); await adapter.review(topup());
  w.prepareHook = async () => { throw Error('SECRET_FIXTURE_REPLY'); };
  assert.equal(await adapter.confirm(), false); assert.equal(adapter.getState().phase, 'UNKNOWN');
  assert.doesNotMatch(JSON.stringify(adapter.getState()), /SECRET_FIXTURE_REPLY/);
  assert.deepEqual(effects(w).map(v => v.name), ['prepare']);
});

test('lost registration reply cannot provide a handoff or retry registration', async () => {
  const w = fixture(), adapter = await createFlatOwnerManualPreparation(w.input); await adapter.review(topup());
  w.registerHook = async () => { throw Error('lost response after durable register'); };
  assert.equal(await adapter.confirm(), false); assert.equal(adapter.getState().phase, 'UNKNOWN');
  assert.equal(await adapter.confirm(), false); assert.equal(adapter.getState().attempts[0].handoff, null);
  assert.deepEqual(effects(w).map(v => v.name), ['prepare', 'register']);
});

test('existing token witness step may authorize locally; final terms still rechecked and never execute', async () => {
  const w = fixture(), adapter = await createFlatOwnerManualPreparation(w.input); await adapter.review(topup());
  w.registerHook = async () => { w.views.get('deposit').prepared.stage = 'AUTHORIZED'; };
  assert.ok(await adapter.confirm()); assert.equal(effects(w).length, 2);
});

test('mutation during registration cannot be reported as a ready handoff', async () => {
  const w = fixture(), adapter = await createFlatOwnerManualPreparation(w.input); await adapter.review(topup());
  w.registerHook = async () => { w.views.get('deposit').prepared.recipient = address('9'); };
  assert.equal(await adapter.confirm(), false); assert.equal(adapter.getState().phase, 'UNKNOWN');
  assert.equal(adapter.getState().attempts[0].handoff, null);
});

test('cancel during preparation does not claim cancellation or interrupt original work', async () => {
  const w = fixture(), adapter = await createFlatOwnerManualPreparation(w.input), gate = deferred(), entered = deferred();
  await adapter.review(topup()); w.prepareHook = async () => { entered.resolve(); await gate.promise; };
  const result = adapter.confirm(); await entered.promise; assert.equal(adapter.cancelReview(), false);
  assert.equal(await adapter.confirm(), false); gate.resolve(); assert.ok(await result); assert.equal(effects(w).length, 2);
});

test('strict inputs reject accessors/proxies, root material, HTTP/GRAPH fields and noncanonical wire values', async () => {
  const w = fixture(), adapter = await createFlatOwnerManualPreparation(w.input); let invoked = false;
  const access = topup(); Object.defineProperty(access, 'kind', { get() { invoked = true; return 'TOP_UP'; }, enumerable: true });
  for (const value of [access, new Proxy(topup(), { get() { invoked = true; return ''; } }),
    topup({ privateKey: 'fixture' }), topup({ assetId: h('f') }), topup({ ownerOperationRef: h('f') }),
    topup({ amount: '18446744073709551616' }), topup({ exitRecipient: '0x' + address('3') }),
    topup({ exitRecipient: w.account.registry[0].pool }), topup({ requestId: 'valid_id_01\n' }),
    { requestId: 'graph_0001', kind: 'GRAPH', role: 'source' }, exit({ role: 'source\n' })]) {
    await assert.rejects(adapter.review(value));
  }
  assert.equal(invoked, false); assert.deepEqual(effects(w), []);
});

for (const [field, changed] of [['assetId', h('f')], ['ownerOperationRef', h('f')], ['kind', 'EXIT']])
  test('registration cannot substitute the original handoff ' + field, async () => {
    const w = fixture(), originalRegister = w.account.ownerActions.registerTopUp;
    w.account.ownerActions.registerTopUp = async ref => ({ ...await originalRegister(ref), [field]: changed });
    const adapter = await createFlatOwnerManualPreparation(w.input), review = await adapter.review(topup());
    assert.equal(await adapter.confirm(), false); const state = adapter.getState();
    assert.equal(state.phase, 'UNKNOWN'); assert.deepEqual(state.attempts[0].request, review.request);
    assert.equal(state.attempts[0].handoff, null); assert.equal(effects(w).length, 2);
  });

test('late owner prepare response with extra private fields fails closed without exposing them', async () => {
  const w = fixture(), originalPrepare = w.owner.owner.prepareDeposit;
  w.owner.owner.prepareDeposit = async input => ({ ...await originalPrepare(input), witness: 'PRIVATE_FIXTURE_MATERIAL' });
  const adapter = await createFlatOwnerManualPreparation(w.input); await adapter.review(topup());
  assert.equal(await adapter.confirm(), false); assert.equal(adapter.getState().phase, 'UNKNOWN');
  assert.doesNotMatch(JSON.stringify(adapter.getState()), /PRIVATE_FIXTURE_MATERIAL/);
  assert.deepEqual(effects(w).map(v => v.name), ['prepare']);
});

test('top-up review discloses the existing registration signing-witness effect without carrying that witness', async () => {
  const w = fixture(), adapter = await createFlatOwnerManualPreparation(w.input), review = await adapter.review(topup());
  assert.equal(review.registration, 'ORIGINAL_AUTHORITY_MAY_CREATE_RETAINED_TOKEN_DEPOSIT_WITNESS');
  assert.equal(review.spending, 'SEPARATE_ACCOUNT_PREPARE_AND_EXECUTE_REVIEW_REQUIRED');
  assert.deepEqual(effects(w), []);
});

test('lost bridge and lost registration reply reconstruct only read-only original handoff without new mutation', async () => {
  const w = fixture(), adapter = await createFlatOwnerManualPreparation(w.input), review = await adapter.review(topup());
  w.registerHook = async () => { throw Error('persisted registration reply lost'); };
  assert.equal(await adapter.confirm(), false);
  const effectsBefore = clone(effects(w));
  const restored = await restoreFlatOwnerManualPreparation(w.input);
  assert.equal(restored.getState().phase, 'UNKNOWN'); assert.equal(restored.getState().review, null);
  for (const method of ['review', 'confirm', 'cancelReview']) assert.equal(restored[method], undefined);
  assert.equal(restored.getState().capabilities.readOnly, true);
  assert.deepEqual(await restored.reconcileOriginal({ requestId: review.request.requestId }), { status: 'HANDOFF_READY', handoff: review.request });
  assert.deepEqual(effects(w), effectsBefore); assert.deepEqual(restored.getState().attempts[0].review, review);
  await assert.rejects(createFlatOwnerManualPreparation(w.input), /ALREADY_BOUND/);
});
for (const stage of ['binding', 'prepare']) test('read-only reconstruction leaves ' + stage + ' loss unresolved without registration retry', async () => {
  const w = fixture(), adapter = await createFlatOwnerManualPreparation(w.input), review = await adapter.review(topup());
  w[stage + 'Hook'] = async () => { throw Error('lost original response'); };
  assert.equal(await adapter.confirm(), false);
  const restored = await restoreFlatOwnerManualPreparation(w.input), before = clone(effects(w));
  assert.deepEqual(await restored.reconcileOriginal({ requestId: review.request.requestId }), { status: 'UNKNOWN', handoff: null });
  assert.deepEqual(effects(w), before);
  assert.match(restored.getState().errorCode, stage === 'binding' ? /ORIGINAL_PREPARATION_UNRESOLVED/ : /ORIGINAL_REGISTRATION_UNRESOLVED/);
});
for (const [name, modify] of [
  ['reference', w => { w.records[0].review.request.ownerOperationRef = h('f'); }],
  ['owner', w => { w.records[0].review.ownerIdentitySHA256 = h('f'); }],
  ['account', w => { w.records[0].review.accountIdentitySHA256 = h('f'); }],
  ['epoch', w => { w.views.get('deposit').observed.timestamp = '6600'; }],
  ['prepared epoch', w => { w.views.get('deposit').prepared.epoch = '11'; }],
  ['unavailable owner', w => { w.ownerAvailable = false; }],
]) test('reconciliation rejects changed ' + name + ' and clears a prior handoff', async () => {
  const w = fixture(), adapter = await createFlatOwnerManualPreparation(w.input), review = await adapter.review(topup());
  await adapter.confirm(); const before = clone(effects(w)); modify(w);
  assert.deepEqual(await adapter.reconcileOriginal({ requestId: review.request.requestId }), { status: 'UNKNOWN', handoff: null });
  assert.equal(adapter.getState().attempts[0].handoff, null); assert.deepEqual(effects(w), before);
});
test('restoration rejects another genuine owner and copied authority before reading caller ports', async () => {
  const w = fixture(), other = { ...w.owner }; w.owners.add(other);
  await assert.rejects(restoreFlatOwnerManualPreparation({ ...w.input, owner: other }), /EXACT_ORIGINAL_OWNER/);
  await assert.rejects(restoreFlatOwnerManualPreparation({ ...w.input, account: { ...w.account } }));
});
test('existing admission is reported without another handoff or replayed consent', async () => {
  const w = fixture(), adapter = await createFlatOwnerManualPreparation(w.input), review = await adapter.review(topup());
  await adapter.confirm(); w.registrations.get(review.request.ownerOperationRef).admitted = true;
  const restored = await restoreFlatOwnerManualPreparation(w.input), before = clone(effects(w));
  assert.deepEqual(await restored.reconcileOriginal({ requestId: review.request.requestId }), { status: 'ALREADY_ADMITTED', handoff: null });
  assert.deepEqual(effects(w), before); assert.equal(restored.getState().review, null);
});
test('observing one already-admitted original never clears another unresolved original', async () => {
  const w = fixture(), adapter = await createFlatOwnerManualPreparation(w.input), first = await adapter.review(topup());
  await adapter.confirm(); w.registrations.get(first.request.ownerOperationRef).admitted = true;
  await adapter.review(exit()); w.prepareHook = async () => { throw Error('second original unresolved'); };
  assert.equal(await adapter.confirm(), false);
  assert.deepEqual(await adapter.reconcileOriginal({ requestId: first.request.requestId }), { status: 'ALREADY_ADMITTED', handoff: null });
  assert.equal(adapter.getState().phase, 'UNKNOWN'); assert.equal(adapter.cancelReview(), false);
  await assert.rejects(adapter.review(exit({ requestId: 'third_original_01', role: 'change' })), /UNAVAILABLE/);
});


test('one original note account prepares TOP_UP then its change EXIT and read-only restore preserves both bindings', async () => {
  // Synthetic original ports only: this proves owner/account binding reuse,
  // not a deposit, graph transition, balance, withdrawal or financial receipt.
  const w = fixture(), bridge = await createFlatOwnerManualPreparation(w.input);
  const depositReview = await bridge.review(topup({requestId:'vault_top_up'}));
  const deposit = await bridge.confirm();
  assert.deepEqual(deposit, depositReview.request);
  const changeReview = await bridge.review(exit({requestId:'vault_exit_0',role:'change'}));
  assert.equal(changeReview.accountIdentitySHA256, depositReview.accountIdentitySHA256);
  assert.equal(changeReview.ownerIdentitySHA256, depositReview.ownerIdentitySHA256);
  assert.equal(changeReview.request.assetId, depositReview.request.assetId);
  assert.deepEqual(await bridge.confirm(), changeReview.request);
  assert.deepEqual(effects(w).map(row=>[row.name,row.kind]), [['prepare','deposit'],['register','TOP_UP'],['prepare','withdraw_change'],['register','EXIT']]);
  await assert.rejects(createFlatOwnerManualPreparation(w.input), /ALREADY_BOUND/);
  const count = effects(w).length;
  const restored = await restoreFlatOwnerManualPreparation(w.input);
  assert.equal(typeof restored.review,'undefined');assert.equal(typeof restored.confirm,'undefined');
  assert.equal((await restored.reconcileOriginal({requestId:'vault_exit_0'})).status,'HANDOFF_READY');
  assert.deepEqual(restored.getState().attempts.map(row=>row.request.requestId),['vault_top_up','vault_exit_0']);
  assert.equal(effects(w).length,count);
  w.records[0].review.accountIdentitySHA256=h('e');
  await assert.rejects(restoreFlatOwnerManualPreparation(w.input), /ORIGINAL_IDENTITY/);
  assert.equal(effects(w).length,count);
});
