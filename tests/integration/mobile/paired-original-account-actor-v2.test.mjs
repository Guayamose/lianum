/** Genuine original account/approval/session/journal boundaries over explicitly
 * synthetic native substrate; see fixture. Host pass cannot accept native value,
 * proofs, mobile note custody, private balances or a phone/Cloud transport. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, device, createActorModule, hostEconomicRecovery } from './paired-original-account-host-fixture.mjs';
import { originalAccountAccessMessageV2, originalAccountReviewMessageV2, normalizeOriginalAccountReviewV2 }
  from '@lianum/mobile-protocol/original-account-v2';
const origin = 'https://private-actor.example';
const { createPairedOriginalAccountActorV2 } = await createActorModule();
const pair = f => createPairedOriginalAccountActorV2({ session: f.session, approval: f.approval,
  owner: f.world.owner, origin, devicePublicKey: f.device.publicKey });
test('signed device reads consume each original nonce without filling unused review capacity or granting execution', async t => {
  const f = await fixture(t, { execute: false }), actor = await pair(f);
  for (let i = 0; i < 7; i++) {
    const challenge = actor.challenge({ action: 'read' });
    const signed = { challenge, signature: f.device.sign(originalAccountAccessMessageV2(challenge)) };
    const binding = await actor.deviceDepositSignedReadBindingV1(signed);
    assert.equal(binding.requestId, f.body.requestId);
    await assert.rejects(actor.deviceDepositSignedReadBindingV1(signed), /CHALLENGE_CHANGED/);
  }
  const challenge = actor.challenge({ action: 'reconcile' });
  await assert.rejects(actor.deviceDepositSignedReadBindingV1({ challenge,
    signature: f.device.sign(originalAccountAccessMessageV2(challenge)) }), /READ_AUTH_REQUIRED/);
  assert.equal(f.world.sends, 0); assert.equal(f.world.proofs, 0); actor.close();
});
async function review(actor, f, action = 'read') {
  const challenge = actor.challenge({ action });
  return actor.openReview({ challenge, signature: f.device.sign(originalAccountAccessMessageV2(challenge)) });
}
const signed = (value, f) => ({ review: value, signature: f.device.sign(originalAccountReviewMessageV2(value)) });
test('paired device obtains a private original diagnostic only after two domain-separated signatures; no portfolio or new effects', async t => {
  const f = await fixture(t), actor = await pair(f);
  const challenge = actor.challenge({ action: 'read' });
  assert.equal(JSON.stringify(challenge).includes(f.body.requestId), false);
  assert.equal(Object.hasOwn(challenge, 'binding'), false);
  const other = device();
  await assert.rejects(actor.openReview({ challenge, signature: other.sign(originalAccountAccessMessageV2(challenge)) }), /SIGNATURE_INVALID/);
  const selected = await actor.openReview({ challenge, signature: f.device.sign(originalAccountAccessMessageV2(challenge)) });
  assert.equal(selected.binding.requestId, f.body.requestId);
  assert.equal(selected.binding.originalAccountLifetime, f.account.config.lifetime);
  assert.equal(selected.binding.originalProcessGeneration, 1); assert.equal(selected.binding.observedProcessGeneration, 1);
  const result = await actor.submit(signed(selected, f));
  assert.equal(result.action, 'read'); assert.equal(result.privatePortfolio, null); assert.equal(result.economicObservation, null);
  assert.equal(result.binding.requestState, 'UNKNOWN'); assert.equal(result.nativeEffectsEstablished, false);
  assert.equal(f.world.sends, 1); assert.equal(f.world.proofs, 1);
  await assert.rejects(actor.openReview({ challenge, signature: f.device.sign(originalAccountAccessMessageV2(challenge)) }), /CHALLENGE_CHANGED/);
  await assert.rejects(actor.submit(signed(selected, f)), /CHALLENGE_CHANGED/);
  actor.close();
});
test('original UNKNOWN reconcile uses the genuine session/keeper and preserves late failure without another send or proof', async t => {
  const f = await fixture(t), actor = await pair(f), selected = await review(actor, f, 'reconcile');
  const alteredNonce = { ...selected, nonce: 'a'.repeat(64) };
  await assert.rejects(actor.submit(signed(alteredNonce, f)), /CHALLENGE_CHANGED/);
  const prior = (await f.session.snapshot()).revision;
  const result = await actor.submit(signed(selected, f));
  assert.equal(result.admission.admitted, true); assert.equal(result.admission.action, 'reconcile');
  assert.equal(result.admission.state, 'FAILED'); assert.equal(result.binding.requestState, 'UNKNOWN');
  assert.ok(result.binding.journalRevision > prior); assert.equal(result.economicObservation, null);
  assert.ok(f.world.observations > 0); assert.equal(f.world.sends, 1); assert.equal(f.world.proofs, 1);
  await assert.rejects(actor.submit(signed(selected, f)), /CHALLENGE_CHANGED/);
  actor.close();
});
test('copied session, copied approval, substituted original owner, callbacks and duplicate pairing never gain authority', async t => {
  const f = await fixture(t);
  for (const replacement of [{ session: { ...f.session } }, { approval: {} }, { owner: { ...f.world.owner } }]) {
    await assert.rejects(createPairedOriginalAccountActorV2({ session: f.session, approval: f.approval,
      owner: f.world.owner, origin, devicePublicKey: f.device.publicKey, ...replacement }));
  }
  let touched = false;
  await assert.rejects(createPairedOriginalAccountActorV2({ session: f.session, approval: f.approval, owner: f.world.owner,
    origin, devicePublicKey: f.device.publicKey, signer: () => { touched = true; } }), /ACTOR_FIELDS/);
  assert.equal(touched, false);
  const actor = await pair(f); await assert.rejects(pair(f), /ALREADY_PAIRED/);
  assert.equal('execute' in actor, false); assert.equal('prepare' in actor, false); assert.equal('recover' in actor, false);
  assert.throws(() => actor.challenge({ action: 'execute' }), /ACTION/);
  actor.close();
});
test('signed binding changes, owner restart and key-scope substitution reject before an effect; new review can read surviving original generation', async t => {
  const f = await fixture(t), actor = await pair(f), selected = await review(actor, f, 'reconcile');
  for (const field of ['originalAccountLifetime', 'accountIdentitySHA256', 'generationId', 'ownerOperationRef', 'originalReviewSHA256']) {
    const altered = structuredClone(selected); altered.binding[field] = 'a'.repeat(64);
    await assert.rejects(actor.submit(signed(altered, f)), /CHALLENGE_CHANGED/);
  }
  f.world.generation = 2;
  await assert.rejects(actor.submit(signed(selected, f)), /REVIEW_STALE/);
  const fresh = await review(actor, f);
  assert.equal(fresh.binding.originalProcessGeneration, 1); assert.equal(fresh.binding.observedProcessGeneration, 2);
  f.world.scopeChanged = true;
  await assert.rejects(actor.submit(signed(fresh, f)), /OWNER_SCOPE_CHANGED/);
  assert.equal(f.world.sends, 1); assert.equal(f.world.proofs, 1); actor.close();
});
test('prepared but unstarted original can be privately read and cannot be reconciled by the mobile actor', async t => {
  const f = await fixture(t, { execute: false }), actor = await pair(f);
  const selected = await review(actor, f); const result = await actor.submit(signed(selected, f));
  assert.equal(result.binding.requestState, 'PREPARED'); assert.equal(result.binding.submission, null);
  await assert.rejects(review(actor, f, 'reconcile'), /RECONCILE_NOT_STARTED/);
  assert.equal(f.world.sends, 0); assert.equal(f.world.proofs, 0); actor.close();
});
test('bootstrap nonce/key/origin copies and expired authorization disclose no private review; close invalidates in-flight consent', async t => {
  const f = await fixture(t), actor = await pair(f), challenge = actor.challenge({ action: 'read' });
  for (const change of [{ nonce: 'a'.repeat(64) }, { origin: 'https://another.example' }, { devicePublicKey: device().publicKey }]) {
    const altered = { ...challenge, ...change };
    await assert.rejects(actor.openReview({ challenge: altered, signature: f.device.sign(originalAccountAccessMessageV2(altered)) }), /CHALLENGE_CHANGED/);
  }
  t.mock.timers.enable({ apis: ['Date'], now: challenge.expiresAt });
  await assert.rejects(actor.openReview({ challenge, signature: f.device.sign(originalAccountAccessMessageV2(challenge)) }), /EXPIRED/);
  t.mock.timers.reset();
  const selected = await review(actor, f); actor.close();
  await assert.rejects(actor.submit(signed(selected, f)), /ACTOR_UNAVAILABLE/);
  assert.equal(f.world.sends, 1);
});
test('full V2 normalization rejects GRAPH, callbacks and fabricated observation flags independently of the actor', async t => {
  const f = await fixture(t), actor = await pair(f), selected = await review(actor, f);
  for (const value of [ { ...selected, callback() {} }, { ...selected, binding: { ...selected.binding, kind: 'GRAPH' } },
    { ...selected, binding: { ...selected.binding, mobileNoteCustody: true } },
    { ...selected, binding: { ...selected.binding, economicObservation: true } } ])
    assert.throws(() => normalizeOriginalAccountReviewV2(value));
  actor.close();
});
test('another genuine session with identical metadata cannot substitute its original approval membership', async t => {
  const f = await fixture(t), other = await fixture(t);
  assert.deepEqual(f.account.config, other.account.config);
  await assert.rejects(createPairedOriginalAccountActorV2({ session: other.session, approval: f.approval,
    owner: f.world.owner, origin, devicePublicKey: f.device.publicKey }), /SESSION_APPROVAL/);
  assert.equal(other.world.sends, 1); assert.equal(f.world.sends, 1);
});
test('closing while the original read is awaiting prevents new reconcile admission and leaves the original session alive', async t => {
  const f = await fixture(t), actor = await pair(f), selected = await review(actor, f, 'reconcile');
  const before = (await f.session.snapshot()).admissions.length;
  const pending = actor.submit(signed(selected, f)); actor.close();
  await assert.rejects(pending, /ACTOR_CLOSED/);
  const state = await f.session.snapshot(); assert.equal(state.available, true); assert.equal(state.admissions.length, before);
  assert.equal(f.world.sends, 1); assert.equal(f.world.proofs, 1);
});
test('nested proxies and accessors never execute while authenticating untrusted public frames', async t => {
  const f = await fixture(t, { execute: false }), actor = await pair(f);
  let touched = 0;
  const trap = new Proxy({}, { getPrototypeOf() { touched++; throw Error('TRAP'); },
    ownKeys() { touched++; throw Error('TRAP'); }, get() { touched++; throw Error('TRAP'); } });
  const challenge = actor.challenge({ action: 'read' });
  const accessSignature = f.device.sign(originalAccountAccessMessageV2(challenge));
  for (const value of [trap, { ...challenge, nonce: trap }])
    await assert.rejects(actor.openReview({ challenge: value, signature: accessSignature }), /FRAME_DATA/);
  const selected = await actor.openReview({ challenge, signature: accessSignature });
  const signature = f.device.sign(originalAccountReviewMessageV2(selected));
  const accessor = { ...selected.binding.asset };
  Object.defineProperty(accessor, 'token', { get() { touched++; throw Error('ACCESSOR'); } });
  for (const value of [trap, { ...selected, binding: trap },
    { ...selected, binding: { ...selected.binding, asset: trap } },
    { ...selected, binding: { ...selected.binding, asset: accessor } },
    { ...selected, binding: { ...selected.binding, callback() { touched++; } } },
    { ...selected, binding: { ...selected.binding, extra: 'x'.repeat(513) } }])
    await assert.rejects(actor.submit({ review: value, signature }), /FRAME_DATA/);
  assert.equal(touched, 0);
  const result = await actor.submit({ review: selected, signature });
  assert.equal(result.binding.requestState, 'PREPARED'); assert.equal(f.world.sends, 0); actor.close();
});
test('consumed and expired challenges are pruned explicitly without a lifetime cap or replay authority', async t => {
  const f = await fixture(t, { execute: false }), actor = await pair(f);
  const first = actor.challenge({ action: 'read' });
  const firstSignature = f.device.sign(originalAccountAccessMessageV2(first));
  const firstReview = await actor.openReview({ challenge: first, signature: firstSignature });
  await actor.submit(signed(firstReview, f));
  for (let index = 0; index < 33; index++) {
    const selected = await review(actor, f);
    assert.equal((await actor.submit(signed(selected, f))).binding.requestState, 'PREPARED');
  }
  await assert.rejects(actor.openReview({ challenge: first, signature: firstSignature }), /CHALLENGE_CHANGED/);
  await assert.rejects(actor.submit(signed(firstReview, f)), /CHALLENGE_CHANGED/);
  const abandoned = Array.from({ length: 4 }, () => actor.challenge({ action: 'read' }));
  assert.throws(() => actor.challenge({ action: 'read' }), /CHALLENGE_CAPACITY/);
  t.mock.timers.enable({ apis: ['Date'], now: Math.max(...abandoned.map(value => value.expiresAt)) });
  const next = actor.challenge({ action: 'read' });
  await assert.rejects(actor.openReview({ challenge: abandoned[0], signature: f.device.sign(originalAccountAccessMessageV2(abandoned[0])) }), /EXPIRED/);
  const current = await actor.openReview({ challenge: next, signature: f.device.sign(originalAccountAccessMessageV2(next)) });
  await actor.submit(signed(current, f));
  const staleReviews = [];
  for (let index = 0; index < 4; index++) staleReviews.push(await review(actor, f));
  await assert.rejects(review(actor, f), /CHALLENGE_CAPACITY/);
  t.mock.timers.tick(60_000);
  const fresh = await review(actor, f); await actor.submit(signed(fresh, f));
  await assert.rejects(actor.submit(signed(staleReviews[0], f)), /EXPIRED/);
  t.mock.timers.reset(); assert.equal(f.world.sends, 0); assert.equal(f.world.proofs, 0); actor.close();
});
test('failed initial binding can be restored, concurrent local pairings have exactly one winner, and issued pairing stays exclusive', { timeout: 30_000 }, async t => {
  const f = await fixture(t, { execute: false }); f.world.scopeChanged = true;
  await assert.rejects(pair(f), /OWNER_SCOPE_CHANGED/); f.world.scopeChanged = false;
  // The original authority rejects simultaneous privateStatus reads. Hold each
  // actor at the synthetic owner IPC boundary only after that original read has
  // closed; both constructors then reach the unchanged synchronous claim.
  let resume, firstReached, secondReached, summaries = 0;
  f.world.summaryGate = new Promise(resolve => { resume = resolve; }); t.after(() => resume());
  const firstSummary = new Promise(resolve => { firstReached = resolve; });
  const secondSummary = new Promise(resolve => { secondReached = resolve; });
  f.world.summaryStarted = () => { if (++summaries === 1) firstReached(); else if (summaries === 2) secondReached(); };
  const prematurelyFinished = promise => {
    const finished = promise.then(() => { throw Error('HOST_PAIR_FINISHED_BEFORE_BARRIER'); });
    finished.catch(() => {}); return finished;
  };
  let results;
  try {
    const firstPair = pair(f); await Promise.race([firstSummary, prematurelyFinished(firstPair)]);
    const secondPair = pair(f); await Promise.race([secondSummary, prematurelyFinished(secondPair)]);
    resume(); results = await Promise.allSettled([firstPair, secondPair]);
  } finally { resume(); delete f.world.summaryGate; delete f.world.summaryStarted; }
  const actors = results.filter(value => value.status === 'fulfilled').map(value => value.value);
  const rejected = results.filter(value => value.status === 'rejected');
  assert.equal(actors.length, 1); assert.equal(rejected.length, 1);
  assert.match(rejected[0].reason.code, /ALREADY_PAIRED/);
  const selected = await review(actors[0], f); await actors[0].submit(signed(selected, f));
  actors[0].close(); await assert.rejects(pair(f), /ALREADY_PAIRED/);
  assert.equal(f.world.sends, 0); assert.equal(f.world.proofs, 0);
});
test('close during already admitted original reconciliation preserves that admission and refuses its late diagnostic', { timeout: 30_000 }, async t => {
  const f = await fixture(t), actor = await pair(f), selected = await review(actor, f, 'reconcile');
  let resume, started;
  f.world.observationGate = new Promise(resolve => { resume = resolve; });
  t.after(() => resume());
  const observing = new Promise(resolve => { started = resolve; }); f.world.observationStarted = started;
  const before = (await f.session.snapshot()).admissions.length;
  const pending = actor.submit(signed(selected, f));
  await observing; actor.close(); resume();
  await assert.rejects(pending, /ACTOR_CLOSED/);
  const state = await f.session.idle(); assert.equal(state.available, true);
  assert.equal(state.admissions.length, before + 1);
  assert.equal(state.admissions.at(-1).action, 'reconcile'); assert.equal(state.admissions.at(-1).state, 'FAILED');
  assert.equal(state.requests[0].state, 'UNKNOWN'); assert.equal(f.world.sends, 1); assert.equal(f.world.proofs, 1);
});
test('prepared original EXIT approval can be privately read without withdrawal execution, balance credit or reconciliation', async t => {
  const f = await fixture(t, { execute: false, kind: 'EXIT', role: 'recovery' }), actor = await pair(f);
  const selected = await review(actor, f), result = await actor.submit(signed(selected, f));
  assert.equal(result.binding.kind, 'EXIT'); assert.equal(result.binding.role, 'recovery');
  assert.equal(result.binding.requestState, 'PREPARED'); assert.equal(result.binding.submission, null);
  assert.equal(result.privatePortfolio, null); assert.equal(result.economicObservation, null);
  await assert.rejects(review(actor, f, 'reconcile'), /RECONCILE_NOT_STARTED/);
  assert.equal(f.world.sends, 0); assert.equal(f.world.proofs, 0); actor.close();
});

// Test-issued recovery tokens are explicit inert ports; the same actual native
// account Vault, durable coordinator process, session and actor are retained.
// No economic or native/phone restart acceptance is claimed by this HOST case.
test('native pairing recovery keeps original journal/nonces/expiry and reissues approval only from original owner records', async t => {
  const accountAPI = await import('../../../packages/backend/src/accounts/authority/native-value-account-authority-v2.mjs');
  const sessionAPI = await import('@lianum/backend/operations/recovery/native-original-source-lifecycle-v1');
  const actorAPI = await createActorModule();
  const f = await fixture(t), actor = await pair(f), issuer = hostEconomicRecovery();
  const selected = await review(actor, f); await actor.submit(signed(selected, f));
  const unused = actor.challenge({ action: 'read' }), privateUnused = actor.privateStateChallenge();
  const counts = { sends: f.world.sends, proofs: f.world.proofs };
  const originalJournal = await f.session.snapshot();
  actorAPI.assertNativeActorEconomicMembershipV1(actor, { session: f.session, account: f.account, owner: f.world.owner });
  sessionAPI.assertNativeSessionEconomicMembershipV1(f.session, { runtime: f.world.runtime, system: f.world.system, account: f.account, owner: f.world.owner });
  assert.throws(() => actorAPI.assertNativeActorEconomicMembershipV1({ ...actor }, { session: f.session, account: f.account, owner: f.world.owner }), /ORIGINAL_REQUIRED/);
  assert.throws(() => actorAPI.assertNativeActorEconomicMembershipV1(actor, { session: { ...f.session }, account: f.account, owner: f.world.owner }), /MEMBERSHIP_CHANGED/);
  // All original fences execute before the first asynchronous capture.
  actorAPI.fenceOriginalNativeActorEconomicRecoveryV1(actor, issuer.authority);
  sessionAPI.fenceOriginalNativeSessionEconomicRecoveryV1(f.session, issuer.authority);
  accountAPI.fenceOriginalNativeAccountEconomicRecoveryV1(f.account, issuer.authority);
  assert.throws(() => actor.challenge({ action: 'read' }), /UNAVAILABLE/);
  await assert.rejects(f.account.privateStatus(), /UNAVAILABLE/);
  const actorToken = issuer.token('actor'), sessionToken = issuer.token('session'), accountToken = issuer.token('account');
  const actorRecord = actorAPI.captureOriginalNativeActorEconomicRecoveryV1(actor, actorToken); issuer.retain(actorToken, actorRecord);
  assert.equal(actorRecord.challenges.accesses.find(row => row.id === unused.challengeId).value.expiresAt, unused.expiresAt);
  assert.equal(actorRecord.challenges.stateAccesses.find(row => row.id === privateUnused.challenge.challengeId).value.expiresAt, privateUnused.challenge.expiresAt);
  assert.deepEqual(actorAPI.stopCapturedNativeActorEconomicRecoveryV1(actor, actorToken), { closed: true, originalResourcesStopped: true });
  issuer.retain(sessionToken, await sessionAPI.captureOriginalNativeSessionEconomicRecoveryV1(f.session, sessionToken));
  assert.deepEqual(await sessionAPI.stopCapturedNativeSessionEconomicRecoveryV1(f.session, sessionToken), { closed: true, originalResourcesStopped: true });
  issuer.retain(accountToken, await accountAPI.captureOriginalNativeAccountEconomicRecoveryV1(f.account, accountToken));
  assert.deepEqual(await accountAPI.stopCapturedNativeAccountEconomicRecoveryV1(f.account, accountToken), { closed: true, originalResourcesStopped: true });
  f.world.generation = 2; // Explicit synthetic owner generation, never OS custody.
  const account = await accountAPI.reopenOriginalNativeAccountEconomicRecoveryV1(accountToken, { runtime: f.world.runtime,
    system: f.world.system, owner: f.world.owner, nativeExecution: null, providerCustody: null });
  f.world.recoveryClosers.push(() => account.close());
  const joined = await sessionAPI.reopenOriginalNativeSessionEconomicRecoveryV1(sessionToken, { runtime: f.world.runtime,
    system: f.world.system, account, owner: f.world.owner }); f.world.recoveryClosers.push(() => joined.session.close());
  const reopened = await actorAPI.reopenOriginalNativeActorEconomicRecoveryV1(actorToken, { session: joined.session, account, owner: f.world.owner });
  f.world.recoveryClosers.push(() => reopened.close());
  assert.equal(actorAPI.pairedOriginalAccountActorDescriptorV2(reopened).pairingId, actorRecord.pairingId);
  assert.equal((await joined.session.snapshot()).revision, originalJournal.revision);
  await assert.rejects(reopened.submit(signed(selected, f)), /CHALLENGE_CHANGED/);
  // The unused generic permission keeps its original deadline, not a new TTL.
  t.mock.timers.enable({ apis: ['Date'], now: Math.max(unused.expiresAt, privateUnused.challenge.expiresAt) });
  await assert.rejects(reopened.openReview({ challenge: unused, signature: f.device.sign(originalAccountAccessMessageV2(unused)) }), /EXPIRED/);
  const { privateStateAccessMessageV1 } = await import('@lianum/mobile-protocol/original-account-private-state-v1');
  await assert.rejects(reopened.openPrivateStateReview({ challenge: privateUnused,
    signature: f.device.sign(privateStateAccessMessageV1(privateUnused.challenge)) }), /EXPIRED/);
  t.mock.timers.reset();
  const fresh = await review(reopened, f); const diagnostic = await reopened.submit(signed(fresh, f));
  assert.equal(diagnostic.binding.requestState, 'UNKNOWN');
  assert.equal(diagnostic.binding.observedProcessGeneration, 2);
  assert.deepEqual({ sends: f.world.sends, proofs: f.world.proofs }, counts);
  await assert.rejects(actorAPI.reopenOriginalNativeActorEconomicRecoveryV1(actorToken, { session: joined.session, account, owner: f.world.owner }), /SECTION_CONSUMED/);
  await assert.rejects(actorAPI.reopenOriginalNativeActorEconomicRecoveryV1({ ...actorToken }, { session: joined.session, account, owner: f.world.owner }), /ORIGINAL_SECTION_REQUIRED/);
});
