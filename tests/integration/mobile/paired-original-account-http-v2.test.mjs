/** Actual owned loopback HTTP + Noble device signatures + genuine original
 * account/approval/session/journal over the explicit synthetic native fixture.
 * URL translation below establishes no TLS, mobile hardware or native value. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createConnection } from 'node:net';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { fixture, createActorModule } from './paired-original-account-host-fixture.mjs';
import { originalAccountAccessMessageV2, originalAccountReviewMessageV2 }
  from '../../../packages/mobile-protocol/src/original-account-review-v2.mjs';
import { privateStateAccessMessageV1, privateStateReviewMessageV1 }
  from '../../../packages/mobile-protocol/src/original-account-private-state-v1.mjs';
// Framework sources stay in their actual app directory. This host test is run
// through ./dev after build and public apps/mobile dependencies are installed.
const filename = fileURLToPath(import.meta.url), marker = '/.internal/runtime/';
assert.ok(filename.includes(marker), 'HOST_TEST_REQUIRES_GENERATED_WORKSPACE');
const root = filename.slice(0, filename.lastIndexOf(marker));
const fromApp = path => import(pathToFileURL(join(root, 'apps/mobile/src', path)).href);
const { createOriginalAccountApiV2 } = await fromApp('api/original-account-api-v2.mjs');
const { createOriginalAccountLeaseV2 } = await fromApp('custody/original-account-lease-v2.mjs');
const { devicePublicKey, signDeviceMessage } = await fromApp('custody/signing.mjs');
const { createPairedOriginalAccountActorV2, assertPairedOriginalAccountActorV2,
  pairedOriginalAccountActorDescriptorV2 } = await createActorModule();
const { createPairedOriginalAccountHttpServerV2 } = await import(
  '../../../packages/backend/src/api/mobile/paired-original-account-http-v2.mjs');
const privateKey = new Uint8Array(32).fill(11), publicKey = devicePublicKey(privateKey);
const origin = 'https://private-actor.example';
const deferred = () => { let resolve; return { promise: new Promise(done => { resolve = done; }), resolve }; };
async function setup(t, options) {
  const f = await fixture(t, options), actor = await createPairedOriginalAccountActorV2({
    session: f.session, approval: f.approval, owner: f.world.owner, origin, devicePublicKey: publicKey });
  const descriptor = pairedOriginalAccountActorDescriptorV2(actor);
  const server = await createPairedOriginalAccountHttpServerV2({ actor });
  t.after(async () => { const closed = await server.close(); assert.equal(closed.closed, true);
    assert.equal(closed.listenerClosed, true); assert.equal(closed.ownedSocketsRemaining, 0); });
  const calls = [];
  const translate = async (target, options) => {
    assert.equal(new URL(target).origin, descriptor.origin); calls.push(new URL(target).pathname);
    const response = await fetch(server.url + new URL(target).pathname, options);
    // No response.url is advertised as authenticated HTTPS by this adapter.
    return new Response(response.body, { status: response.status, headers: response.headers });
  };
  const api = createOriginalAccountApiV2({ descriptor, fetchImpl: translate });
  const lease = createOriginalAccountLeaseV2({ readContext: () => ({ ...descriptor, action: 'reconcile', foreground: true }) });
  const callbacks = { access: { sign: value => signDeviceMessage(privateKey, originalAccountAccessMessageV2(value)),
    post: value => api.openReview(value) }, review: { sign: value => signDeviceMessage(privateKey, originalAccountReviewMessageV2(value)),
    post: value => api.submit(value) } };
  const selected = async () => lease.openReview(lease.finishAccess(lease.begin(), await api.challenge('reconcile')).lease, callbacks.access);
  return { f, actor, descriptor, server, calls, translate, api, lease, callbacks, selected };
}
async function post(server, path, body, selectedOrigin = origin) {
  const response = await fetch(server.url + '/v2/mobile/original-account/' + path, {
    method: 'POST', headers: { 'content-type': 'application/json', origin: selectedOrigin }, body: JSON.stringify(body) });
  return { status: response.status, body: await response.json() };
}
test('private HTTP bootstrap rejects unbranded/copied/Proxy actors; state and unsigned requests reveal no original terms', async t => {
  const c = await setup(t, { execute: false });
  let touched = 0;
  for (const fake of [{ challenge() { touched++; } }, { ...c.actor }, new Proxy(c.actor, {
    get() { touched++; throw Error('TRAP'); }, getPrototypeOf() { touched++; throw Error('TRAP'); } })]) {
    assert.throws(() => assertPairedOriginalAccountActorV2(fake), /ORIGINAL_REQUIRED/);
    assert.throws(() => pairedOriginalAccountActorDescriptorV2(fake), /ORIGINAL_REQUIRED/);
    await assert.rejects(createPairedOriginalAccountHttpServerV2({ actor: fake }), /ORIGINAL_REQUIRED/);
  }
  await assert.rejects(createPairedOriginalAccountHttpServerV2({ actor: c.actor }), /ALREADY_BOUND/);
  await assert.rejects(createPairedOriginalAccountHttpServerV2({ actor: c.actor, executor() { touched++; } }), /CONFIGURATION/);
  assert.equal(touched, 0); assert.equal(Object.isFrozen(c.descriptor), true);
  const state = await c.api.state(); assert.equal(state.privatePortfolio, null); assert.equal(state.economicObservation, null);
  assert.deepEqual(state.actions, { read: true, reconcile: true });
  for (const privateValue of [c.f.body.requestId, c.f.body.ownerOperationRef, c.f.account.config.lifetime, c.descriptor.pairingId])
    assert.equal(JSON.stringify(state).includes(privateValue), false);
  const challenge = await c.api.challenge('read'); assert.equal(Object.hasOwn(challenge, 'binding'), false);
  assert.equal(JSON.stringify(challenge).includes(c.f.body.requestId), false);
  const forbidden = await post(c.server, 'reviews', { challenge, signature: '0'.repeat(128) });
  assert.deepEqual(forbidden, { status: 403, body: { error: 'REQUEST_REJECTED' } });
  assert.deepEqual(await post(c.server, 'challenges', { action: 'read' }, 'https://foreign.example'), forbidden);
  const read = await c.api.openReview({ challenge, signature: signDeviceMessage(privateKey, originalAccountAccessMessageV2(challenge)) });
  const result = await c.api.submit({ review: read, signature: signDeviceMessage(privateKey, originalAccountReviewMessageV2(read)) });
  assert.equal(result.binding.requestState, 'PREPARED'); assert.equal(result.privatePortfolio, null);
  assert.equal(c.f.world.sends, 0); assert.equal(c.f.world.proofs, 0);
});
test('Noble mobile client over actual HTTP reconciles only the original latched request and rejects replay without another effect', async t => {
  const c = await setup(t), before = (await c.f.session.snapshot()).admissions.length;
  const selected = await c.selected(), result = await c.lease.submit(selected.lease, c.callbacks.review);
  assert.equal(result.admission.admitted, true); assert.equal(result.admission.state, 'FAILED');
  assert.equal(result.binding.requestState, 'UNKNOWN'); assert.equal(result.economicObservation, null);
  assert.equal((await c.f.session.snapshot()).admissions.length, before + 1);
  await assert.rejects(c.lease.submit(selected.lease, c.callbacks.review), /REVIEW_INACTIVE/);
  await assert.rejects(c.api.submit({ review: selected.value, signature: signDeviceMessage(privateKey,
    originalAccountReviewMessageV2(selected.value)) }), /SERVICE_UNAVAILABLE/);
  assert.equal(c.f.world.sends, 1); assert.equal(c.f.world.proofs, 1); assert.ok(c.f.world.observations > 0);
  assert.equal(c.calls.filter(path => path.endsWith('/diagnostics')).length, 2);
});
test('losing the actual HTTP response after original admission leaves it running and consumes both consents without retry', { timeout: 30_000 }, async t => {
  const c = await setup(t), selected = await c.selected(), observing = deferred(), resume = deferred();
  c.f.world.observationStarted = observing.resolve; c.f.world.observationGate = resume.promise;
  const abort = new AbortController(), before = (await c.f.session.snapshot()).admissions.length;
  const lossyApi = createOriginalAccountApiV2({ descriptor: c.descriptor, fetchImpl: (target, options) =>
    c.translate(target, { ...options, signal: abort.signal }) });
  const pending = c.lease.submit(selected.lease, { ...c.callbacks.review, post: value => lossyApi.submit(value) });
  pending.catch(() => {});
  try {
    await Promise.race([observing.promise, pending.then(() => { throw Error('HOST_ORIGINAL_OBSERVER_NOT_REACHED'); })]);
    abort.abort(Error('HOST_HTTP_REPLY_LOST_AFTER_ORIGINAL_ADMISSION'));
    await assert.rejects(pending, /HOST_HTTP_REPLY_LOST|fetch failed|aborted/);
    await assert.rejects(c.lease.submit(selected.lease, c.callbacks.review), /REVIEW_INACTIVE/);
  } finally { resume.resolve(); }
  const state = await c.f.session.idle(); assert.equal(state.admissions.length, before + 1);
  assert.equal(state.admissions.at(-1).state, 'FAILED'); assert.equal(state.requests[0].state, 'UNKNOWN');
  await assert.rejects(c.api.submit({ review: selected.value, signature: signDeviceMessage(privateKey,
    originalAccountReviewMessageV2(selected.value)) }), /SERVICE_UNAVAILABLE/);
  assert.equal(c.f.world.sends, 1); assert.equal(c.f.world.proofs, 1);
});
test('closing owned HTTP while original reconcile is admitted invalidates diagnostics and preserves the original session/admission', { timeout: 30_000 }, async t => {
  const c = await setup(t), selected = await c.selected(), observing = deferred(), resume = deferred();
  c.f.world.observationStarted = observing.resolve; c.f.world.observationGate = resume.promise;
  const before = (await c.f.session.snapshot()).admissions.length;
  const pending = c.lease.submit(selected.lease, c.callbacks.review); pending.catch(() => {});
  try {
    await Promise.race([observing.promise, pending.then(() => { throw Error('HOST_ORIGINAL_OBSERVER_NOT_REACHED'); })]);
    const closed = await c.server.close(); assert.equal(closed.closed, true); assert.equal(closed.listenerClosed, true);
    assert.equal(closed.ownedSocketsRemaining, 0); assert.ok(closed.originalDiagnosticsInFlight >= 1);
    await assert.rejects(pending); assert.throws(() => assertPairedOriginalAccountActorV2(c.actor), /ACTOR_CLOSED/);
    await assert.rejects(c.lease.submit(selected.lease, c.callbacks.review), /REVIEW_INACTIVE/);
  } finally { resume.resolve(); }
  const state = await c.f.session.idle(); assert.equal(state.available, true);
  assert.equal(state.admissions.length, before + 1); assert.equal(state.admissions.at(-1).state, 'FAILED');
  assert.equal(state.requests[0].state, 'UNKNOWN'); assert.equal(c.f.world.sends, 1); assert.equal(c.f.world.proofs, 1);
});
test('body limits and incomplete headers are bounded without exposing errors or admitting any original operation', { timeout: 15_000 }, async t => {
  const c = await setup(t, { execute: false }), before = (await c.f.session.snapshot()).admissions.length;
  const rejected = await post(c.server, 'challenges', { action: 'read', extra: 'x'.repeat(8192) });
  assert.deepEqual(rejected, { status: 400, body: { error: 'REQUEST_REJECTED' } });
  const started = performance.now(), address = new URL(c.server.url);
  await new Promise((resolve, reject) => {
    const socket = createConnection({ host: '127.0.0.1', port: Number(address.port) });
    socket.once('error', reject); socket.once('close', resolve);
    socket.once('connect', () => socket.write('GET /v2/mobile/original-account/state HTTP/1.1\r\nHost: localhost\r\n'));
  });
  assert.ok(performance.now() - started < 4000);
  assert.equal((await c.f.session.snapshot()).admissions.length, before);
  assert.equal(c.f.world.sends, 0); assert.equal(c.f.world.proofs, 0);
});

test('separately signed account/pool state uses original ownerView and cannot invent available value from a prepared request', async t => {
  const c = await setup(t, { execute: false }), before = await c.f.session.snapshot();
  const access = await c.api.privateState.challenge();
  const calls = c.calls.length;
  await assert.rejects(c.api.privateState.openReview({ challenge: access,
    signature: signDeviceMessage(privateKey, originalAccountAccessMessageV2(access)) }), /SERVICE_UNAVAILABLE/);
  assert.equal(c.calls.length, calls + 1);
  const review = await c.api.privateState.openReview({ challenge: access,
    signature: signDeviceMessage(privateKey, privateStateAccessMessageV1(access)) });
  assert.equal(review.binding.requestState, 'PREPARED'); assert.equal(review.binding.amountAtomic, '100');
  await assert.rejects(c.api.privateState.submit({ review,
    signature: signDeviceMessage(privateKey, originalAccountReviewMessageV2(review)) }), /SERVICE_UNAVAILABLE/);
  const observed = await c.api.privateState.submit({ review,
    signature: signDeviceMessage(privateKey, privateStateReviewMessageV1(review)) });
  // The fixture forbids native balance observations. The authentic account's
  // ownerView therefore returns UNAVAILABLE, never the prepared amount or 0.
  assert.equal(observed.status, 'UNAVAILABLE');
  assert.equal(observed.observed, null); assert.equal(observed.balances, null); assert.equal(observed.backing, null);
  assert.equal(observed.request.state, 'UNRESOLVED'); assert.equal(observed.completePortfolio, false);
  assert.equal(observed.mobileNoteCustody, false);
  assert.deepEqual(Object.keys(observed).sort(), ['version', 'profile', 'scope', 'binding', 'status', 'asset',
    'observed', 'balances', 'backing', 'request', 'custody', 'mobileNoteCustody', 'completePortfolio'].sort());
  await assert.rejects(c.api.privateState.submit({ review,
    signature: signDeviceMessage(privateKey, privateStateReviewMessageV1(review)) }), /SERVICE_UNAVAILABLE/);
  await assert.rejects(c.api.submit({ review,
    signature: signDeviceMessage(privateKey, privateStateReviewMessageV1(review)) }), /SERVICE_UNAVAILABLE/);
  const after = await c.f.session.snapshot();
  assert.equal(after.revision, before.revision); assert.equal(after.admissions.length, before.admissions.length);
  assert.equal(c.f.world.proofs, 0); assert.equal(c.f.world.sends, 0);
  const state = await c.api.state(); assert.equal(state.privatePortfolio, null); assert.equal(state.economicObservation, null);
});
