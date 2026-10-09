/** Actual owned loopback HTTP / direct TLS + Noble signatures + genuine original
 * account/approval/session/journal over the explicit synthetic native fixture.
 * HTTP cases translate URLs; TLS cases use their exact HTTPS origin and ephemeral
 * HOST certificates. Neither establishes mobile hardware or native value. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createConnection, createServer as createPortReservation } from 'node:net';
import { request as httpsRequest } from 'node:https';
import { execFileSync } from 'node:child_process';
import {createHash} from 'node:crypto';
import {createGenericBalanceNativePreparation} from '../../../packages/engine/src/execution/balances/generic-balance-native-preparation.mjs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
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
const { createPairedOriginalAccountHttpServerV2, createPairedOriginalAccountTlsServerV2, createPairedDeviceDepositTlsServerV1,
  createPairedDeviceReservationTlsServerV1, handoffPairedDeviceDepositTlsServerV1 } = await import(
  '../../../packages/backend/src/api/mobile/paired-original-account-http-v2.mjs');
const privateKey = new Uint8Array(32).fill(11), publicKey = devicePublicKey(privateKey);
const origin = 'https://private-actor.example';
const deferred = () => { let resolve; return { promise: new Promise(done => { resolve = done; }), resolve }; };
// Only future HOST tests create these temporary infrastructure keys. They are
// never notes/device keys, committed fixtures or inputs to a financial lab.
async function tlsFixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'lianum-original-tls-host-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const certificatePath = join(directory, 'certificate.pem'), keyPath = join(directory, 'tls-key.pem');
  execFileSync('/usr/bin/openssl', ['req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:prime256v1',
    '-sha256', '-days', '2', '-nodes', '-subj', '/CN=localhost', '-addext', 'subjectAltName=DNS:localhost',
    '-addext', 'basicConstraints=critical,CA:FALSE', '-keyout', keyPath, '-out', certificatePath],
  { timeout: 5000, maxBuffer: 4096, stdio: 'ignore', env: { PATH: '/usr/bin:/bin', LANG: 'C' } });
  return { certificate: await readFile(certificatePath, 'utf8'), privateKey: await readFile(keyPath, 'utf8') };
}
async function reservedPort(t) {
  const server = createPortReservation();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const port = server.address().port;
  const close = () => server.listening ? new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())) : Promise.resolve();
  t.after(close); return { port, close };
}
// A real request to the EXACT HTTPS URL: no alternate origin/port, plaintext,
// redirects or URL translator. Only this test trusts its ephemeral certificate.
function tlsFetch(certificate) {
  return (target, options = {}) => new Promise((resolve, reject) => {
    const payload = options.body, headers = { ...options.headers };
    if (payload !== undefined) headers['Content-Length'] = Buffer.byteLength(payload);
    const request = httpsRequest(target, { family: 4, ca: certificate, minVersion: 'TLSv1.3',
      method: options.method ?? 'GET', headers, signal: options.signal }, message => {
      const chunks = []; let length = 0;
      message.on('data', chunk => { length += chunk.length;
        if (length > 16384) { request.destroy(Error('HOST_TLS_RESPONSE_LIMIT')); return; } chunks.push(chunk); });
      message.once('error', reject);
      message.once('end', () => {
        const response = new Response(Buffer.concat(chunks), { status: message.statusCode, headers: message.headers });
        Object.defineProperty(response, 'url', { value: target }); resolve(response);
      });
    });
    request.once('error', reject); request.end(payload);
  });
}
async function tlsSetup(t, options) {
  const material = await tlsFixture(t), reservation = await reservedPort(t), f = await fixture(t, options);
  const actor = await createPairedOriginalAccountActorV2({ session: f.session, approval: f.approval,
    owner: f.world.owner, origin: 'https://localhost:' + reservation.port, devicePublicKey: publicKey });
  const descriptor = pairedOriginalAccountActorDescriptorV2(actor);
  await reservation.close();
  const server = await createPairedOriginalAccountTlsServerV2({ actor, tls: material });
  t.after(async () => { const closed = await server.close(); assert.equal(closed.closed, true);
    assert.equal(closed.listenerClosed, true); assert.equal(closed.ownedSocketsRemaining, 0); });
  assert.equal(server.url, descriptor.origin);
  const direct = tlsFetch(material.certificate), api = createOriginalAccountApiV2({ descriptor, fetchImpl: direct });
  return { f, actor, descriptor, server, direct, api, material };
}
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
// Exercise SOURCE's actual bounded transport closure without importing its
// financial run()/birth. The original actor/server/SDK above remain unmocked.
test('SOURCE first original SDK access uses explicit UTF-8 framing over exact TLS', async t => {
  const c = await tlsSetup(t, { execute: false });
  const source = await readFile(join(root,
    'tests/integration/wallet/native/native-original-source-abrupt-flow-v1.mjs'), 'utf8');
  const start = source.indexOf(' const fetch=async(target,options)=>');
  const end = source.indexOf('\n const fromApp=', start);
  assert.ok(start >= 0 && end > start, 'HOST_SOURCE_FETCH_CLOSURE_REQUIRED');
  const transport = { posts: {}, tlsVersion: null }, frames = [];
  const request = (target, options, receive) => {
    frames.push(options.headers);
    return httpsRequest(target, options, receive);
  };
  const direct = new Function('assert', 'httpsRequest', 'active', 'origin', 'certificate', 'transport',
    source.slice(start, end) + '\nreturn fetch;')(assert, request, () => {},
    c.descriptor.origin, c.material.certificate, transport);
  const api = createOriginalAccountApiV2({ descriptor: c.descriptor, fetchImpl: direct });
  const access = await api.challenge('read');
  assert.equal(access.pairingId, c.descriptor.pairingId); assert.equal(access.action, 'read');
  assert.equal(frames.length, 1);
  assert.equal(frames[0]['Content-Length'], Buffer.byteLength(JSON.stringify({ action: 'read' }), 'utf8'));
  assert.equal(frames[0]['Content-Type'], 'application/json');
  assert.equal(frames[0].Origin, c.descriptor.origin);
  assert.equal(Object.keys(frames[0]).some(key => key.toLowerCase() === 'transfer-encoding'), false);
  assert.equal(transport.posts['/v2/mobile/original-account/challenges'], 1);
  assert.equal(transport.tlsVersion, 'TLSv1.3');
  assert.equal(c.f.world.sends, 0); assert.equal(c.f.world.proofs, 0);
});
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

test('direct HTTPS reaches the same original account with Noble permissions and separate private-state consent', { timeout: 30_000 }, async t => {
  const c = await tlsSetup(t), before = await c.f.session.snapshot();
  const service = await c.api.state(); assert.equal(service.privatePortfolio, null);
  assert.equal(service.noteCustodyOnDevice, false);
  const access = await c.api.challenge('read'); assert.equal('binding' in access, false);
  const rejected = await c.direct(c.server.url + '/v2/mobile/original-account/reviews', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: c.descriptor.origin },
    body: JSON.stringify({ challenge: access, signature: '00'.repeat(64) }) });
  assert.equal(rejected.status, 403); assert.deepEqual(await rejected.json(), { error: 'REQUEST_REJECTED' });
  const review = await c.api.openReview({ challenge: access,
    signature: signDeviceMessage(privateKey, originalAccountAccessMessageV2(access)) });
  const observed = await c.api.submit({ review,
    signature: signDeviceMessage(privateKey, originalAccountReviewMessageV2(review)) });
  assert.equal(observed.binding.requestState, 'UNKNOWN'); assert.equal(observed.admission, null);
  const financialAccess = await c.api.privateState.challenge();
  const financialReview = await c.api.privateState.openReview({ challenge: financialAccess,
    signature: signDeviceMessage(privateKey, privateStateAccessMessageV1(financialAccess)) });
  const unavailable = await c.api.privateState.submit({ review: financialReview,
    signature: signDeviceMessage(privateKey, privateStateReviewMessageV1(financialReview)) });
  assert.equal(unavailable.status, 'UNAVAILABLE'); assert.equal(unavailable.balances, null);
  assert.equal(unavailable.mobileNoteCustody, false);
  assert.equal((await c.f.session.snapshot()).revision, before.revision);
  assert.equal(c.f.world.sends, 1); assert.equal(c.f.world.proofs, 1);
});

test('TLS installation rejects copied authority, certificate/key or SAN mismatch and callbacks before binding', { timeout: 30_000 }, async t => {
  const material = await tlsFixture(t), reservation = await reservedPort(t), f = await fixture(t, { execute: false });
  const actor = await createPairedOriginalAccountActorV2({ session: f.session, approval: f.approval,
    owner: f.world.owner, origin: 'https://localhost:' + reservation.port, devicePublicKey: publicKey });
  let traps = 0;
  for (const fake of [{ ...actor }, new Proxy(actor, { get() { traps++; throw Error('TRAP'); } })])
    await assert.rejects(createPairedOriginalAccountTlsServerV2({ actor: fake, tls: material }), /ORIGINAL_REQUIRED/);
  assert.equal(traps, 0);
  await assert.rejects(createPairedOriginalAccountTlsServerV2({ actor, tls: { ...material, privateKey: 'not a key' } }), /TLS_CONFIGURATION/);
  await assert.rejects(createPairedOriginalAccountTlsServerV2({ actor, tls: material, host: 'remote.invalid' }), /TLS_CONFIGURATION/);
  await assert.rejects(createPairedOriginalAccountTlsServerV2({ actor, tls: material, handler() {} }), /HTTP_CONFIGURATION/);
  const other = await fixture(t, { execute: false }), wrong = await createPairedOriginalAccountActorV2({
    session: other.session, approval: other.approval, owner: other.world.owner,
    origin: 'https://foreign.invalid:' + reservation.port, devicePublicKey: publicKey });
  await assert.rejects(createPairedOriginalAccountTlsServerV2({ actor: wrong, tls: material }), /TLS_CONFIGURATION/);
  assert.equal(f.world.sends, 0); assert.equal(f.world.proofs, 0);
  actor.close(); wrong.close();
});

test('direct TLS enforces origin and body limits; a failed owned bind does not claim the actor forever', { timeout: 30_000 }, async t => {
  const material = await tlsFixture(t), reservation = await reservedPort(t), f = await fixture(t, { execute: false });
  const actor = await createPairedOriginalAccountActorV2({ session: f.session, approval: f.approval,
    owner: f.world.owner, origin: 'https://localhost:' + reservation.port, devicePublicKey: publicKey });
  await assert.rejects(createPairedOriginalAccountTlsServerV2({ actor, tls: material }), { code: 'EADDRINUSE' });
  await reservation.close();
  const server = await createPairedOriginalAccountTlsServerV2({ actor, tls: material });
  t.after(async () => { const closed = await server.close(); assert.equal(closed.closed, true);
    assert.equal(closed.ownedSocketsRemaining, 0); });
  const direct = tlsFetch(material.certificate);
  const send = (origin, body) => direct(server.url + '/v2/mobile/original-account/challenges', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin }, body: JSON.stringify(body) });
  const foreign = await send('https://foreign.invalid', { action: 'read' });
  assert.equal(foreign.status, 403); assert.deepEqual(await foreign.json(), { error: 'REQUEST_REJECTED' });
  const oversized = await send(server.url, { action: 'read', extra: 'x'.repeat(8192) });
  assert.equal(oversized.status, 400); assert.deepEqual(await oversized.json(), { error: 'REQUEST_REJECTED' });
  const before = await f.session.snapshot();
  const socket = createConnection({ host: '127.0.0.1', port: reservation.port });
  const socketClosed = new Promise((resolve, reject) => { socket.once('error', reject); socket.once('close', resolve); });
  await new Promise((resolve, reject) => { socket.once('connect', resolve); socket.once('error', reject); });
  const closed = await server.close(); await socketClosed;
  assert.equal(closed.closed, true); assert.equal(closed.ownedSocketsRemaining, 0);
  assert.equal((await f.session.snapshot()).revision, before.revision);
  assert.equal(f.world.sends, 0); assert.equal(f.world.proofs, 0);
});

test('closing TLS after original reconcile admission closes owned sockets and preserves its UNKNOWN journal without resubmission', { timeout: 30_000 }, async t => {
  const c = await tlsSetup(t), entered = deferred(), resume = deferred();
  c.f.world.observationStarted = entered.resolve; c.f.world.observationGate = resume.promise;
  const access = await c.api.challenge('reconcile');
  const review = await c.api.openReview({ challenge: access,
    signature: signDeviceMessage(privateKey, originalAccountAccessMessageV2(access)) });
  const before = (await c.f.session.snapshot()).admissions.length;
  const pending = c.api.submit({ review,
    signature: signDeviceMessage(privateKey, originalAccountReviewMessageV2(review)) }); pending.catch(() => {});
  try {
    await Promise.race([entered.promise, pending.then(() => { throw Error('HOST_TLS_ORIGINAL_OBSERVER_NOT_REACHED'); })]);
    const closed = await c.server.close(); assert.equal(closed.closed, true);
    assert.equal(closed.ownedSocketsRemaining, 0); assert.ok(closed.originalDiagnosticsInFlight >= 1);
    await assert.rejects(pending); assert.throws(() => assertPairedOriginalAccountActorV2(c.actor), /ACTOR_CLOSED/);
  } finally { resume.resolve(); }
  const after = await c.f.session.idle(); assert.equal(after.admissions.length, before + 1);
  assert.equal(after.requests[0].state, 'UNKNOWN'); assert.equal(c.f.world.sends, 1); assert.equal(c.f.world.proofs, 1);
});

// Only listener ownership moves. Account/actor/approval remain the original HOST
// capabilities; no proof, funding, native dispatch or phone acceptance occurs.
test('original D26 TLS handoff preserves its actor only for the genuine U/S successor and final close revokes it', async t => {
  const material = await tlsFixture(t), reservation = await reservedPort(t), f = await fixture(t, { execute: false });
  const actor = await createPairedOriginalAccountActorV2({ session: f.session, approval: f.approval,
    owner: f.world.owner, origin: 'https://localhost:' + reservation.port, devicePublicKey: f.device.publicKey });
  const descriptor = pairedOriginalAccountActorDescriptorV2(actor);
  const {createDeviceOwnerDepositBridgeV1} = await import('../../../packages/backend/src/accounts/authority/device-owner-deposit-bridge-v1.mjs');
  const {createDeviceOwnerReservationBridgeV1} = await import('../../../packages/backend/src/accounts/authority/device-owner-reservation-bridge-v1.mjs');
  const original = {actor,account:f.account,owner:f.world.owner,runtime:f.world.runtime,system:f.world.system,poolIndex:0};
  const deposit = await createDeviceOwnerDepositBridgeV1(original); await reservation.close();
  const first = await createPairedDeviceDepositTlsServerV1({bridge:deposit,tls:material});
  let second, us;
  t.after(async () => { await second?.close(); await first.close(); us?.close(); deposit.close(); actor.close(); });
  const direct = tlsFetch(material.certificate);
  assert.equal((await direct(descriptor.origin + '/v2/mobile/original-account/state')).status,200);
  for (const fake of [{...first},new Proxy(first,{})]) await assert.rejects(handoffPairedDeviceDepositTlsServerV1(fake));
  await assert.rejects(handoffPairedDeviceDepositTlsServerV1(first,{closeActor:false}));
  const retired = await handoffPairedDeviceDepositTlsServerV1(first);
  assert.equal(retired.closed,true); assert.equal(retired.ownedSocketsRemaining,0); assert.equal(retired.originalDiagnosticsInFlight,0);
  assert.equal(retired.actorRetainedForOriginalContinuation,true); assertPairedOriginalAccountActorV2(actor);
  await assert.rejects(createPairedOriginalAccountTlsServerV2({actor,tls:material}),/DEPOSIT_CONTINUATION_REQUIRED/);
  const h = name => createHash('sha256').update('HOST TLS HANDOFF '+name).digest('hex'), domain=f.world.identity.domain;
  const nativePreparation = createGenericBalanceNativePreparation({
    ...Object.fromEntries(['scope','policy','asset','hubDomain','registryCommitment'].map(name=>[name,domain[name]])),operationId:h('operation'),
    fundingNotBefore:'6000',fundingValidUntil:'6100',settleBefore:'6300',nodes:[{id:'leg_0',dependsOn:[],evidencePolicy:h('evidence'),
      actionTemplate:{chainDomain:h('chain'),signerIdentity:h('signer'),sourceCommitment:h('source'),destinationCommitment:h('destination'),
        amount:'1000',custodyKind:1,custodyCommitment:h('custody'),executionFrom:'6000',executionUntil:'6200'},
      recipientOffer:{x:f.device.publicKey.slice(2,66),y:f.device.publicKey.slice(66),value:'25',secret:h('payout'),randomness:h('randomness')}}]});
  us = await createDeviceOwnerReservationBridgeV1({...original,nativePreparation,invoiceSignatures:['1'.repeat(128)]});
  second = await createPairedDeviceReservationTlsServerV1({bridge:us,tls:material});
  assert.equal(second.url,first.url); await first.close(); assertPairedOriginalAccountActorV2(actor);
  assert.deepEqual(pairedOriginalAccountActorDescriptorV2(actor),descriptor);
  const api = createOriginalAccountApiV2({descriptor,fetchImpl:direct});
  const access = await api.challenge('read'); assert.equal(access.pairingId,descriptor.pairingId);
  const reviewed = await api.openReview({challenge:access,signature:f.device.sign(originalAccountAccessMessageV2(access))});
  assert.equal(reviewed.binding.requestId,f.body.requestId);
  await assert.rejects(handoffPairedDeviceDepositTlsServerV1(first),/HANDOFF_REQUIRED/);
  await assert.rejects(handoffPairedDeviceDepositTlsServerV1(second),/HANDOFF_REQUIRED/);
  assert.equal(f.world.proofs,0); assert.equal(f.world.sends,0);
  const closed = await second.close(); assert.equal(closed.closed,true); assert.equal(closed.ownedSocketsRemaining,0);
  assert.throws(()=>assertPairedOriginalAccountActorV2(actor),/ACTOR_CLOSED/);
});
