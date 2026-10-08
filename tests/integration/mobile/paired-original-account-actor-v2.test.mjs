/** Genuine original account/approval/session/journal boundaries over explicitly
 * synthetic native substrate; see fixture. Host pass cannot accept native value,
 * proofs, mobile note custody, private balances or a phone/Cloud transport. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, device, createActorModule } from './paired-original-account-host-fixture.mjs';
import { originalAccountAccessMessageV2, originalAccountReviewMessageV2, normalizeOriginalAccountReviewV2 }
  from '../../../packages/mobile-protocol/src/original-account-review-v2.mjs';
const origin = 'https://private-actor.example';
const { createPairedOriginalAccountActorV2 } = await createActorModule();
const pair = f => createPairedOriginalAccountActorV2({ session: f.session, approval: f.approval,
  owner: f.world.owner, origin, devicePublicKey: f.device.publicKey });
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
