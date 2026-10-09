/** Clock regression over the explicit inert controller fixture. No chain,
 * proof or runtime authority is manufactured here. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, hash, installRetainedNoncePayout, trackLifecycle, addLifecycleMethod } from '../../fixtures/claims/authorization/claim-key-authority-v4.fixture.mjs';

const { nativeClaimControllerPrivateFinalAuditTimingV1 } = await import('../../../src/claims/controller/controller.mjs');

test('new claim backing authorization starts from the refreshed observed receiver head', async () => {
  const f = await fixture();
  try {
    const prepared = await f.controller.prepare({ handoff: f.handoff });
    f.control.intentId = prepared.intentId;
    let refreshed = 0;
    f.options.runtime.testRefreshReceiverClock = async () => {
      refreshed++;
      f.state.head = { ...f.state.head, number: '2', hash: hash('observed-head'), timestamp: '76' };
    };
    f.control.preparedHook = async value => {
      assert.equal(refreshed, 1);
      assert.equal(BigInt(value.head.timestamp), 76n);
    };
    await f.controller.preposition({ intentId: prepared.intentId });
    assert.equal(refreshed, 1);
    assert.equal(f.control.dispatches, 1);
  } finally { await f.close(); }
});

test('an uncertain original EVM effect blocks clock advancement and a second dispatch', async () => {
  const f = await fixture();
  try {
    const prepared = await f.controller.prepare({ handoff: f.handoff });
    f.control.intentId = prepared.intentId;
    f.control.loseReply = true;
    let refreshed = 0;
    f.options.runtime.testRefreshReceiverClock = async () => { refreshed++; };
    await assert.rejects(f.controller.preposition({ intentId: prepared.intentId }), /LOST_EVM_REPLY/);
    assert.equal(refreshed, 1);
    await f.reopen();
    await assert.rejects(f.controller.preposition({ intentId: prepared.intentId }), /UNKNOWN_EVM_RECONCILE_ORIGINAL_ONLY/);
    assert.equal(refreshed, 1);
    assert.equal(f.control.dispatches, 1);
    await f.controller.status();
    assert.equal(refreshed, 1);
  } finally { await f.close(); }
});


// Run the ACTUAL controller over its existing inert native/proof ports. The
// observed receiver second is separate from the monotonic authorization clock;
// only its original refresh port materializes the new head after slow work.
async function postProofDischarge(t, expireSignedAuthority) {
  const f = await fixture(), n = await installRetainedNoncePayout(f, { status: 'RESERVED_BEFORE_BROADCAST' });
  const clock = { now: 0 }, mocked = t.mock.method(performance, 'now', () => clock.now);
  let observedSecond = 10n, refreshed = 0, proofCalls = 0, health, capturedHealth, refreshesAtAuthorization;
  const prepared = structuredClone(n.prepared), nativeWire = n.original.nativeWire;
  try {
    n.control.observationStatus = 'observed';
    f.options.runtime.testRefreshReceiverClock = async () => {
      refreshed++;
      if (BigInt(f.state.head.timestamp) < observedSecond) f.state.head = {
        number: String(BigInt(f.state.head.number) + 1n), hash: hash('post-proof observed head/' + observedSecond), timestamp: String(observedSecond),
      };
    };
    const track = trackLifecycle(f);
    f.options.quorum.facts = async () => ({ head: structuredClone(f.state.head), certificates: [] });
    f.options.proofClients.claim_discharge.prove = async ({ expectedPublicInputs }) => {
      proofCalls++; await Promise.resolve(); clock.now = 37_000; observedSecond = 47n;
      return { proof: 'abcd', publicInputs: expectedPublicInputs };
    };
    const signatures = [0, 1, 2].map(signerIndex => ({ signerIndex, v: 27, r: hash('fixed-r'), s: hash('fixed-s') }));
    f.options.quorum.health = async () => {
      // A stale serial-start head cannot authorize the next EVM transaction.
      assert.equal(f.state.head.timestamp, '47'); assert.ok(refreshed >= 2);
      health = f.control.registerAuthorization({ head: structuredClone(f.state.head),
        message: { validFrom: '47', validUntil: '77' }, abiSignatures: signatures });
      capturedHealth = structuredClone(health); refreshesAtAuthorization = refreshed; return health;
    };
    track.wrap('health');
    addLifecycleMethod(f, 'discharge', [
      { name: 'proof', type: 'tuple', components: [{ name: 'proof', type: 'bytes' }, { name: 'inputs', type: 'bytes32[]' }] },
      { name: 'sequence', type: 'uint64' }, { name: 'from', type: 'uint64' }, { name: 'until', type: 'uint64' },
      { name: 'signatures', type: 'tuple[3]', components: [{ name: 'signerIndex', type: 'uint8' },
        { name: 'v', type: 'uint8' }, { name: 'r', type: 'bytes32' }, { name: 's', type: 'bytes32' }] },
    ]);
    f.control.preparedHook = async value => {
      assert.equal(BigInt(value.head.timestamp), 47n); assert.equal(refreshed, refreshesAtAuthorization);
    };
    f.control.afterBeforeSign = async () => {
      assert.deepEqual(health, capturedHealth); assert.equal(refreshed, refreshesAtAuthorization);
      if (expireSignedAuthority) { await Promise.resolve(); clock.now += 30_000; observedSecond = 77n; }
    };
    f.control.includedHook = () => { f.state.gateways[0].tickets[0].state = '4'; };
    if (expireSignedAuthority) {
      await assert.rejects(f.controller.payout({ ticketId: n.id }), /CLAIM_ORIGINAL_V4_AUDIT_TOO_OLD/);
      assert.equal(f.runtime.transactions.length, 0);
      assert.equal((await n.journal.read()).evm.at(-1).status, 'REJECTED_NO_KEY');
      assert.equal(f.state.head.timestamp, '47', 'expiry cannot rewrite the original authorization head');
    } else {
      await f.controller.payout({ ticketId: n.id });
      const row = (await n.journal.read()).evm.at(-1);
      assert.equal(row.method, 'discharge'); assert.equal(row.status, 'SUCCEEDED');
      assert.equal(row.finalAudit.profile, 'CLAIM_EVM_ORIGINAL_CERTIFICATE_FINAL_AUDIT_V4');
      assert.equal(f.runtime.transactions.length, 1);
      assert.equal((await n.journal.read()).tickets[0].status, 'DISCHARGED');
    }
    assert.equal(proofCalls, 1); assert.equal(track.permits.length, 1);
    assert.equal(track.permits[0].anchor.head.timestamp, '47');
    assert.deepEqual(health, capturedHealth); assert.equal(refreshed, refreshesAtAuthorization);
    assert.deepEqual(n.prepared, prepared); assert.equal(n.original.nativeWire, nativeWire);
    assert.equal(n.original.broadcastAttempts, 0); assert.equal(n.control.signingCalls, 0); assert.equal(n.control.sends, 0);
  } finally { mocked.mock.restore(); await f.close(); }
}

test('post-proof original health authorization uses a fresh observed receiver head after 37 seconds of slow work', async t => {
  await postProofDischarge(t, false);
});
test('post-proof original signed health expiry keeps its head and signatures; no refresh, key or native resend', async t => {
  await postProofDischarge(t, true);
});

// Real controller + existing real AEAD journal; native/proof ports stay inert.
// This reproduces a 25.5s collection followed by a 12.125s original audit, not
// a claim that those durations were measured by this host test.
test('private final-audit timing survives original failure and close without sampling or reopening authority', async t => {
  const f = await fixture(), clock = { now: 0 };
  const sampled = t.mock.method(performance, 'now', () => clock.now);
  try {
    assert.equal(nativeClaimControllerPrivateFinalAuditTimingV1(f.controller), null);
    const prepared = await f.controller.prepare({ handoff: f.handoff });
    f.control.intentId = prepared.intentId; f.control.loseReply = true;
    f.control.preparedHook = async () => { clock.now = 25_500; };
    f.control.finalAuditHook = async () => { clock.now = 37_625; };
    let original;
    try { await f.controller.preposition({ intentId: prepared.intentId }); }
    catch (error) { original = error; }
    assert.match(original?.message ?? '', /TEST_LOST_EVM_REPLY/);
    const evidence = nativeClaimControllerPrivateFinalAuditTimingV1(f.controller);
    assert.deepEqual(evidence, { profile: 'CLAIM_EVM_ORIGINAL_CERTIFICATE_FINAL_AUDIT_V2', phase: 'CONSUMED_BEFORE_KEY',
      originalAuthorizationAgeMilliseconds: 37_625, auditElapsedMilliseconds: 12_125, limitMilliseconds: 30_000 });
    const before = sampled.mock.callCount(); clock.now = 100_000;
    f.controller.close();
    const again = nativeClaimControllerPrivateFinalAuditTimingV1(f.controller);
    assert.deepEqual(again, evidence); assert.notEqual(again, evidence);
    assert.equal(sampled.mock.callCount(), before, 'getter neither samples nor renews time');
    assert.ok(Object.isFrozen(again)); assert.equal(f.control.dispatches, 1);
    let traps = 0;
    const hostile = new Proxy(f.controller, { get() { traps++; throw Error('PRIVATE_MESSAGE'); }, ownKeys() { traps++; return []; } });
    assert.throws(() => nativeClaimControllerPrivateFinalAuditTimingV1(hostile), /ORIGINAL_CONTROLLER_REQUIRED/);
    assert.throws(() => nativeClaimControllerPrivateFinalAuditTimingV1({ ...f.controller }), /ORIGINAL_CONTROLLER_REQUIRED/);
    assert.throws(() => nativeClaimControllerPrivateFinalAuditTimingV1(f.controller, {}), /NO_OPTIONS/);
    assert.equal(traps, 0);
    for (const forbidden of ['request', 'requestId', 'operationId', 'prepared', 'signature', 'nativeWire', 'proof', 'snapshot'])
      assert.equal(Object.hasOwn(again, forbidden), false);
  } finally { sampled.mock.restore(); await f.close(); }
});
