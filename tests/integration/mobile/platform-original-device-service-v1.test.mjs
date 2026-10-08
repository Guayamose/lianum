/** REAL original account/session/actor/three bridges and exact HTTPS origin.
 * Native executor/provider/owner/RPC/proof boundaries are explicit inert HOST
 * doubles. No funded balance, native dispatch, Cloud or phone acceptance. */
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { request } from 'node:https';
import { createServer } from 'node:net';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createGenericBalanceNativePreparation } from '../../../packages/engine/src/execution/balances/generic-balance-native-preparation.mjs';
import { originalAccountAccessMessageV2, originalAccountReviewMessageV2 }
  from '../../../packages/mobile-protocol/src/original-account-review-v2.mjs';
const executors = new WeakMap(), providers = new WeakMap();
function syntheticOriginal(table, capability, expected, code) {
  const row = table.get(capability); assert.ok(row, code);
  if (!row.binding) row.binding = Object.freeze({ ...expected });
  assert.deepEqual(row.binding, expected, code);
}
// The doubles are installed before importing the original account realm.
// Only capabilities explicitly created by this file exist in these WeakMaps.
mock.module('../paeg/native-value-execution-v2.mjs', { exports: {
  FLAT_EXECUTION_PROFILE: 'OWNED_NATIVE_VALUE_EXECUTION_KEEPER_V2',
  WRAPPED_WALLET_EXECUTION_PROFILE_V1: 'OWNED_WRAPPED_WALLET_EXECUTION_KEEPER_V1',
  // Preserve linkage of the original wrapped facade, while every construction,
  // recovery or alternate graph route remains closed in this HOST substrate.
  ...Object.fromEntries(['createNativeValueExecution', 'createWrappedWalletExecutionV1',
    'assertOwnedWrappedWalletExecutionV1', 'ownedWrappedWalletManualGraphReviewV1',
    'captureWrappedWalletExecutionForReopenV1', 'stopCapturedWrappedWalletExecutionV1',
    'reopenWrappedWalletExecutionFromRecoveryV1', 'wrappedWalletExecutionPrivateInitializationV1',
    'fenceWrappedWalletExecutionRecoveryV1'].map(name => [name, () => { throw Error('HOST_NATIVE_EXECUTION_FORBIDDEN'); }])),
  assertOwnedNativeValueExecution(capability, expected) {
    syntheticOriginal(executors, capability, expected, 'SYNTHETIC_HOST_EXECUTOR_ORIGINAL');
  },
  ownedNativeValueManualGraphReview() { throw Error('HOST_NATIVE_GRAPH_FORBIDDEN'); },
} });
mock.module('../chain-adapters/native-value-dispatch-owner-v2.mjs', { exports: {
  // Transitive original dispatch imports still link their fixed closed-gate
  // metadata. This fixture never opens a dispatch lease or creates a signer.
  NATIVE_VALUE_DISPATCH_OWNER_BLOCKERS: Object.freeze([
    'NEW_NATIVE_VALUE_SYSTEM_RELEASE_ARTIFACTS_ABSENT',
    'ACTUAL_LOCAL_NATIVE_PROVIDER_INTEGRATION_UNEXECUTED',
    'ACTUAL_TRON_NATIVE_AND_DISPATCH_ACCEPTANCE_UNEXECUTED',
  ]),
  assertOwnedNativeValueProviderCustody(capability, expected) {
    syntheticOriginal(providers, capability, expected, 'SYNTHETIC_HOST_PROVIDER_ORIGINAL');
  },
  ownedNativeValueProviderCustodyReview() { throw Error('HOST_NATIVE_PROVIDER_REVIEW_FORBIDDEN'); },
  openNativeValueDispatchLease() { throw Error('HOST_NATIVE_LEASE_FORBIDDEN'); },
  createOwnedNativeValueProviderCustody() { throw Error('HOST_NATIVE_PROVIDER_CREATION_FORBIDDEN'); },
} });
const { fixture, createActorModule, hostEconomicRecovery } = await import('./paired-original-account-host-fixture.mjs');
const { createPairedOriginalAccountActorV2, assertPairedOriginalAccountActorV2,
  pairedOriginalAccountActorDescriptorV2 } = await createActorModule();
const { createDeviceOwnerDepositBridgeV1 } = await import('../../../packages/backend/src/accounts/authority/device-owner-deposit-bridge-v1.mjs');
const { createDeviceOwnerReservationBridgeV1 } = await import('../../../packages/backend/src/accounts/authority/device-owner-reservation-bridge-v1.mjs');
const { createDeviceOwnerExecutionBridgeV1 } = await import('../../../packages/backend/src/accounts/authority/device-owner-execution-bridge-v1.mjs');
const {createPairedDeviceDepositTlsServerV1,createPairedDeviceAccountTlsServerV1,handoffPairedDeviceDepositTlsServerV1}=await import('../../../packages/backend/src/api/mobile/paired-original-account-http-v2.mjs');
const filename = fileURLToPath(import.meta.url), marker = '/.internal/runtime/';
assert.ok(filename.includes(marker), 'HOST_TEST_REQUIRES_GENERATED_WORKSPACE');
const root = filename.slice(0, filename.lastIndexOf(marker));
const { startPlatformOriginalDeviceServiceV1 } = await import(pathToFileURL(join(root,
  'apps/platform/src/original-device-service-v1.mjs')));
const h = label => createHash('sha256').update('PLATFORM ORIGINAL SERVICE HOST ' + label).digest('hex');
const deferred = () => { let resolve; return { promise: new Promise(done => { resolve = done; }), resolve }; };
async function setup(t, execute = false) {
  const nativeExecution = Object.freeze({ abort() { throw Error('HOST_NATIVE_ABORT_FORBIDDEN'); } });
  executors.set(nativeExecution, {});
  const f = await fixture(t, { execute, nativeExecution });
  const port = createServer();
  await new Promise((resolve, reject) => { port.once('error', reject); port.listen(0, '127.0.0.1', resolve); });
  const origin = 'https://localhost:' + port.address().port;
  const release = () => port.listening ? new Promise(resolve => port.close(resolve)) : Promise.resolve();
  t.after(release);
  const directory = await mkdtemp(join(tmpdir(), 'lianum-platform-original-tls-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const certificatePath = join(directory, 'certificate.pem'), keyPath = join(directory, 'tls-key.pem');
  execFileSync('/usr/bin/openssl', ['req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:prime256v1',
    '-sha256', '-days', '2', '-nodes', '-subj', '/CN=localhost', '-addext', 'subjectAltName=DNS:localhost',
    '-addext', 'basicConstraints=critical,CA:FALSE', '-keyout', keyPath, '-out', certificatePath],
  { timeout: 5000, maxBuffer: 4096, stdio: 'ignore', env: { PATH: '/usr/bin:/bin', LANG: 'C' } });
  const tls = { certificate: await readFile(certificatePath, 'utf8'), privateKey: await readFile(keyPath, 'utf8') };
  const actor = await createPairedOriginalAccountActorV2({ session: f.session, approval: f.approval,
    owner: f.world.owner, origin, devicePublicKey: f.device.publicKey });
  const original = { actor, account: f.account, owner: f.world.owner, runtime: f.world.runtime,
    system: f.world.system, poolIndex: 0 };
  const domain = f.world.identity.domain;
  const nativePreparation = createGenericBalanceNativePreparation({
    ...Object.fromEntries(['scope', 'policy', 'asset', 'hubDomain', 'registryCommitment'].map(name => [name, domain[name]])),
    operationId: h('operation'), fundingNotBefore: '6000', fundingValidUntil: '6100', settleBefore: '6300',
    nodes: [{ id: 'leg_0', dependsOn: [], evidencePolicy: h('evidence'),
      actionTemplate: { chainDomain: h('chain'), signerIdentity: h('signer'), sourceCommitment: h('source'),
        destinationCommitment: h('destination'), amount: '1000', custodyKind: 1, custodyCommitment: h('custody'),
        executionFrom: '6000', executionUntil: '6200' },
      recipientOffer: { x: f.device.publicKey.slice(2, 66), y: f.device.publicKey.slice(66),
        value: '25', secret: h('payout'), randomness: h('payout-randomness') } }] });
  const usInput = { ...original, nativePreparation, invoiceSignatures: ['1'.repeat(128)] };
  const depositBridge = await createDeviceOwnerDepositBridgeV1(original);
  const reservationBridge = await createDeviceOwnerReservationBridgeV1(usInput);
  const custody = Object.freeze({}); providers.set(custody, {});
  const executionBridge = await createDeviceOwnerExecutionBridgeV1({ account: f.account, reservationBridge, nativeExecution,
    providers: [{ slot: 0, custody, deliveryRiskSalt: h('risk') }], runtime: f.world.runtime, system: f.world.system, poolIndex: 0 });
  const input = { depositBridge, reservationBridge, executionBridge, tls };
  let service;
  t.after(async () => { await service?.close(); depositBridge.close(); reservationBridge.close(); executionBridge.close(); actor.close(); });
  function direct(path, body, selectedOrigin = origin) {
    return new Promise((resolve, reject) => {
      const encoded = body === undefined ? undefined : JSON.stringify(body);
      const req = request(origin + path, { family: 4, ca: tls.certificate, minVersion: 'TLSv1.3',
        method: encoded === undefined ? 'GET' : 'POST', headers: encoded === undefined ? {} : {
          'content-type': 'application/json', origin: selectedOrigin, 'content-length': Buffer.byteLength(encoded) } }, response => {
        const chunks = []; let bytes = 0;
        response.on('data', chunk => { bytes += chunk.length;
          if (bytes > 16384) req.destroy(Error('HOST_RESPONSE_LIMIT')); else chunks.push(chunk); });
        response.once('error', reject);
        response.once('end', () => { try { resolve({ status: response.statusCode,
          body: JSON.parse(Buffer.concat(chunks).toString('utf8')) }); } catch (error) { reject(error); } });
      }); req.once('error', reject); req.end(encoded);
    });
  }
  return { f, actor, input, usInput, direct, release,
    async start() { service = await startPlatformOriginalDeviceServiceV1(input); return service; } };
}
async function review(c, action) {
  const challenged = await c.direct('/v2/mobile/original-account/challenges', { action });
  assert.equal(challenged.status, 200); const challenge = challenged.body.challenge;
  const reviewed = await c.direct('/v2/mobile/original-account/reviews', { challenge,
    signature: c.f.device.sign(originalAccountAccessMessageV2(challenge)) });
  assert.equal(reviewed.status, 200); return reviewed.body.review;
}
test('one original platform TLS composition serves every current app contract without unsigned disclosure or effects', async t => {
  const c = await setup(t); await c.release(); const service = await c.start();
  assert.deepEqual(service.descriptor, pairedOriginalAccountActorDescriptorV2(c.actor));
  const state = await c.direct('/v2/mobile/original-account/state'); assert.equal(state.status, 200);
  assert.equal(state.body.privatePortfolio, null); assert.equal(state.body.economicObservation, null);
  for (const value of [c.f.body.requestId, c.f.account.config.lifetime, service.descriptor.pairingId])
    assert.equal(JSON.stringify(state.body).includes(value), false);
  for (const path of ['/device-deposit/job-reviews', '/device-reservation/job-reviews',
    '/device-execution/execution-reviews', '/device-exit/job-reviews']) {
    assert.deepEqual(await c.direct('/v1/mobile' + path, {}), { status: 403, body: { error: 'REQUEST_REJECTED' } });
    assert.deepEqual(await c.direct('/v1/mobile' + path, {}, 'https://foreign.example'),
      { status: 403, body: { error: 'REQUEST_REJECTED' } });
  }
  assert.deepEqual(await c.direct('/v1/mobile/device-deposit/jobs', { extra: 'x'.repeat(8192) }),
    { status: 400, body: { error: 'REQUEST_REJECTED' } });
  const selected = await review(c, 'read');
  const observed = await c.direct('/v2/mobile/original-account/diagnostics', { review: selected,
    signature: c.f.device.sign(originalAccountReviewMessageV2(selected)) });
  assert.equal(observed.status, 200); assert.equal(observed.body.binding.requestState, 'PREPARED');
  assert.equal(c.f.world.proofs, 0); assert.equal(c.f.world.sends, 0);
  const closing = service.close(); assert.equal(service.close(), closing);
  const closed = await closing; assert.equal(closed.closed, true); assert.equal(closed.ownedSocketsRemaining, 0);
  assert.equal(closed.originalWorkSettled, true); assert.throws(() => assertPairedOriginalAccountActorV2(c.actor), /ACTOR_CLOSED/);
});
test('original composition rejects copies/crossed bindings/callbacks; failed bind preserves the same actor for explicit retry', async t => {
  const a = await setup(t), b = await setup(t);
  const otherUs = await createDeviceOwnerReservationBridgeV1(a.usInput); t.after(() => otherUs.close());
  let traps = 0;
  for (const replacement of [{ depositBridge: { ...a.input.depositBridge } }, { reservationBridge: b.input.reservationBridge },
    { executionBridge: b.input.executionBridge }, { reservationBridge: otherUs }, { depositBridge: new Proxy(a.input.depositBridge, {
      get() { traps++; throw Error('TRAP'); }, getPrototypeOf() { traps++; throw Error('TRAP'); } }) },
    { executor() { traps++; } }, { accountId: a.f.account.accountId }])
    await assert.rejects(startPlatformOriginalDeviceServiceV1({ ...a.input, ...replacement }));
  assert.equal(traps, 0);
  await assert.rejects(a.start(), /EADDRINUSE/); assertPairedOriginalAccountActorV2(a.actor);
  await a.release(); const service = await a.start();
  assert.equal((await a.direct('/v2/mobile/original-account/state')).status, 200);
  await service.close(); assert.equal(a.f.world.proofs, 0); assert.equal(a.f.world.sends, 0);
});
test('504 and service close preserve the same original admitted reconciliation until its final completion', { timeout: 15000 }, async t => {
  const c = await setup(t, true); await c.release(); const service = await c.start(), selected = await review(c, 'reconcile');
  const entered = deferred(), resume = deferred(); c.f.world.observationStarted = entered.resolve; c.f.world.observationGate = resume.promise;
  const before = (await c.f.session.snapshot()).admissions.length;
  const pending = c.direct('/v2/mobile/original-account/diagnostics', { review: selected,
    signature: c.f.device.sign(originalAccountReviewMessageV2(selected)) }); pending.catch(() => {});
  let closing;
  try {
    await Promise.race([entered.promise, pending.then(() => { throw Error('HOST_ORIGINAL_OBSERVER_NOT_REACHED'); })]);
    assert.deepEqual(await pending, { status: 504, body: { error: 'REQUEST_TIMEOUT' } });
    closing = service.close(); assert.equal(service.close(), closing); closing.catch(() => {});
    assertPairedOriginalAccountActorV2(c.actor);
    await assert.rejects(c.direct('/v2/mobile/original-account/state'));
    assertPairedOriginalAccountActorV2(c.actor);
  } finally { resume.resolve(); }
  const closed = await closing; assert.equal(closed.closed, true); assert.equal(closed.ownedSocketsRemaining, 0);
  assert.equal(closed.originalWorkSettled, true); assert.equal(closed.originalDiagnosticsInFlight, 0);
  const snapshot = await c.f.session.idle(); assert.equal(snapshot.admissions.length, before + 1);
  assert.equal(snapshot.admissions.at(-1).state, 'FAILED'); assert.equal(snapshot.requests[0].state, 'UNKNOWN');
  assert.equal(c.f.world.proofs, 1); assert.equal(c.f.world.sends, 1);
  assert.throws(() => assertPairedOriginalAccountActorV2(c.actor), /ACTOR_CLOSED/);
});

test('native recovery privately retires the composed TLS listener before actor capture and rejects copied/crossed transports', async t => {
  const c = await setup(t); await c.release();
  const api = await import('../../../packages/backend/src/api/mobile/paired-original-account-http-v2.mjs');
  const transport = await api.createPairedDeviceAccountTlsServerV1(c.input);
  t.after(() => transport.close());
  const expected = { actor: c.actor, session: c.f.session, account: c.f.account }, issuer = hostEconomicRecovery();
  api.assertNativeDeviceTransportEconomicMembershipV1(transport, expected);
  for (const fake of [{ ...transport }, new Proxy(transport, {})])
    assert.throws(() => api.assertNativeDeviceTransportEconomicMembershipV1(fake, expected));
  assert.throws(() => api.assertNativeDeviceTransportEconomicMembershipV1(transport,
    { ...expected, session: { ...c.f.session } }), /MEMBERSHIP_CHANGED/);
  const before = await c.f.session.snapshot();
  api.fenceOriginalNativeDeviceTransportRecoveryV1(transport, issuer.authority);
  // Fencing synchronously prevents new admissions; the actor itself remains
  // alive until its ORIGINAL owner records can be captured by its own section.
  assertPairedOriginalAccountActorV2(c.actor);
  await assert.rejects(c.direct('/v2/mobile/original-account/state'));
  await assert.rejects(api.abortNativeDeviceTransportRecoveryV1(transport, { ...issuer.authority }), /CAPTURE_REQUIRED/);
  const closed = await api.stopCapturedNativeDeviceTransportRecoveryV1(transport, issuer.authority);
  assert.equal(closed.closed, true); assert.equal(closed.listenerClosed, true); assert.equal(closed.ownedSocketsRemaining, 0);
  assert.equal(closed.originalDiagnosticsInFlight, 0); assert.equal(closed.actorRetainedForOriginalRecovery, true);
  await transport.close(); assertPairedOriginalAccountActorV2(c.actor);
  assert.deepEqual(await api.abortNativeDeviceTransportRecoveryV1(transport, issuer.authority), { closed: true, originalResourcesStopped: true });
  assert.equal((await c.f.session.snapshot()).revision, before.revision);
  assert.equal(c.f.world.sends, 0); assert.equal(c.f.world.proofs, 0);
  c.actor.close(); assert.throws(() => assertPairedOriginalAccountActorV2(c.actor), /ACTOR_CLOSED/);
});


test('planned economic capture handoff keeps exactly the original deposit bridge in the composed TLS successor', async t => {
  const c=await setup(t);await c.release();
  const first=await createPairedDeviceDepositTlsServerV1({bridge:c.input.depositBridge,tls:c.input.tls});let composed;
  t.after(async()=>{await composed?.close();await first.close();});
  const baseline={sends:c.f.world.sends,proofs:c.f.world.proofs};
  const retired=await handoffPairedDeviceDepositTlsServerV1(first);assert.equal(retired.closed,true);assert.equal(retired.ownedSocketsRemaining,0);
  const wrong=await createDeviceOwnerDepositBridgeV1({actor:c.actor,account:c.f.account,owner:c.f.world.owner,runtime:c.f.world.runtime,system:c.f.world.system,poolIndex:0});
  t.after(()=>wrong.close());
  await assert.rejects(createPairedDeviceAccountTlsServerV1({...c.input,depositBridge:wrong}),/DEPOSIT_CONTINUATION_REQUIRED/);
  assertPairedOriginalAccountActorV2(c.actor);
  composed=await createPairedDeviceAccountTlsServerV1(c.input);await first.close();assertPairedOriginalAccountActorV2(c.actor);
  assert.equal((await c.direct('/v2/mobile/original-account/state')).status,200);
  assert.deepEqual(pairedOriginalAccountActorDescriptorV2(c.actor).origin,composed.url);
  assert.deepEqual({sends:c.f.world.sends,proofs:c.f.world.proofs},baseline);
  const stopped=await composed.close();assert.equal(stopped.closed,true);assert.equal(stopped.ownedSocketsRemaining,0);
  assert.throws(()=>assertPairedOriginalAccountActorV2(c.actor),/ACTOR_CLOSED/);
});
