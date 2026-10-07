/** Actual controller.mjs private mint/opener + actual payout-final-send.mjs.
 * Explicit synthetic system/observer/operator/proof brands and inert native
 * adapter. Real encrypted controller journal. No native node, proof, compiler,
 * funding or native signing is invoked. Functional clocks are not timings.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { fixture, installRetainedNoncePayout, trackLifecycle, advanceLifecycleHead,
  poisonedOperators, poisonedQuorums, openNativeClaimSolanaPayoutAuthority as open, hash,
  addLifecycleMethod, lifecycleRoute, zero, consumeWrappedClaimOriginalKeyAuthorityV4 }
  from './wrapped-key-authority-v4.fixture.mjs';

async function captured(t, { kind = '1', setup = 0, configure } = {}) {
  const f = await fixture(), n = await installRetainedNoncePayout(f, { status: 'RESERVED_BEFORE_BROADCAST', kind });
  const native = f.options.claims.nativeRuntimes[0], track = trackLifecycle(f);
  const clock = { now: 0 }, mocked = t.mock.method(performance, 'now', () => clock.now);
  let token, active, entering = false;
  const read = f.options.observer.read;
  f.options.observer.read = async () => { const value = await read(); if (entering) { entering = false; clock.now += setup; } return value; };
  n.adapter.resumeReservedPayout = async (request, callbacks) => {
    assert.deepEqual(Object.keys(callbacks), ['beforeBroadcast']);
    assert.deepEqual(request, { nativeId: n.nativeId });
    n.control.resumeCalls++; active = n.prepared; entering = true;
    token = await callbacks.beforeBroadcast(active);
    throw Error('TEST_RETAIN_COMPLETED_TOKEN_WITHOUT_SEND');
  };
  const value = { f, n, native, track, clock, get token() { return token; }, get prepared() { return active; },
    open(...args) { return open(...(args.length ? args : [token, native.close, native.genesis, active, n.original])); },
    latch() { n.original.phase = 'BROADCAST_UNKNOWN'; n.original.broadcastAttempts = 1; },
    async close() { mocked.mock.restore(); poisonedOperators.delete(f.options.operators[0]); poisonedQuorums.delete(f.options.quorum); await f.close(); },
    async mint() { try { await f.controller.payout({ ticketId: n.id }); assert.fail('TEST_EXPECTED_TOKEN_CAPTURE'); }
      catch (error) { if (error.message !== 'TEST_RETAIN_COMPLETED_TOKEN_WITHOUT_SEND') throw error; } assert.ok(token); },
  };
  try { await configure?.(value); await value.mint(); return value; }
  catch (error) { await value.close(); throw error; }
}

for (const kind of ['1', '2']) test(`actual controller opaque one-use authority preserves original ${kind === '1' ? 'redeem' : 'refund'} bytes through latch`, async t => {
  const x = await captured(t, { kind });
  try {
    assert.ok(Object.isFrozen(x.token)); assert.deepEqual(Object.keys(x.token), ['profile']);
    const before = structuredClone(x.n.control.originalAuthorization), wire = x.n.original.nativeWire;
    const gate = x.open(); assert.equal(gate.profile, 'CLAIM_PAYOUT_ORIGINAL_AUTHORITY_LIFETIME_V2');
    assert.throws(() => x.open(), /PRIVATE_PAYOUT_AUTHORITY_REQUIRED/);
    x.latch(); await gate.beforeSend(x.prepared); gate.assertBeforeSend(x.prepared);
    assert.throws(() => gate.assertBeforeSend(x.prepared), /ONE_USE_PERMISSION_REQUIRED/);
    await assert.rejects(gate.beforeSend(x.prepared), /GUARD_ALREADY_ENTERED/);
    assert.deepEqual(x.n.control.originalAuthorization, before); assert.equal(x.n.original.nativeWire, wire);
    assert.equal(x.n.control.authorizationCalls, 1); assert.equal(x.n.control.signingCalls, 0); assert.equal(x.n.control.sends, 0);
    assert.equal(x.n.original.broadcastAttempts, 1);
  } finally { await x.close(); }
});

test('actual opener refuses invented, copied, proxy, undefined and callback-shaped acknowledgments', async t => {
  const x = await captured(t);
  try {
    for (const token of [undefined, null, {}, { ...x.token }, structuredClone(x.token), new Proxy(x.token, {}),
      { beforeSend() {}, assertBeforeSend() {} }])
      assert.throws(() => open(token, x.native.close, x.native.genesis, x.prepared, x.n.original), /PRIVATE_PAYOUT_AUTHORITY_REQUIRED/);
    assert.equal(x.n.original.broadcastAttempts, 0); x.open();
  } finally { await x.close(); }
});

test('actual token binds physical close even on same genesis, original preparation and immutable record bytes', async t => {
  for (const fault of ['close', 'genesis', 'prepared-copy', 'wire', 'native-id', 'hash', 'route', 'intent', 'attempt', 'phase']) {
    const x = await captured(t);
    try {
      const args = [x.token, x.native.close, x.native.genesis, x.prepared, { ...x.n.original, intent: structuredClone(x.n.original.intent) }];
      if (fault === 'close') args[1] = function sameGenesisDifferentNode() {};
      if (fault === 'genesis') args[2] = hash('different genesis');
      if (fault === 'prepared-copy') args[3] = structuredClone(x.prepared);
      if (fault === 'wire') args[4].nativeWire += 'AAAA';
      if (fault === 'native-id') args[4].nativeId = 'ab'.repeat(64);
      if (fault === 'hash') args[4].transactionSHA256 = hash('changed transaction hash');
      if (fault === 'route') args[4].route = 'refund';
      if (fault === 'intent') args[4].intent.lamports = '2';
      if (fault === 'attempt') x.n.original.broadcastAttempts = 1;
      if (fault === 'phase') x.n.original.phase = 'BROADCAST_UNKNOWN';
      assert.throws(() => x.open(...args), /PHYSICAL_RUNTIME|PAYOUT_GENESIS|ORIGINAL_PREPARATION|ORIGINAL_RECORD|ORIGINAL_INTENT|LATCH_COUNT|LATCH_PHASE/, fault);
      assert.throws(() => x.open(), /PRIVATE_PAYOUT_AUTHORITY_REQUIRED/, 'failed opening burns token');
      assert.equal(x.n.control.sends, 0);
    } finally { await x.close(); }
  }
});

test('actual controller accepts >30s preceding setup only with original quorum audit still fresh', async t => {
  const x = await captured(t, { setup: 45_000 });
  try {
    assert.equal(x.clock.now, 45_000); assert.equal(x.n.control.preparedChecks, 1);
    x.clock.now = 74_999; const gate = x.open(); x.latch(); await gate.beforeSend(x.prepared); gate.assertBeforeSend(x.prepared);
    assert.equal(x.n.control.authorizationCalls, 1);
  } finally { await x.close(); }
});

test('actual controller authority never restarts its original 30s deadline on opener or native revalidation', async t => {
  for (const where of ['before-open', 'after-latch', 'last-await']) {
    const x = await captured(t, { setup: 45_000 });
    try {
      if (where === 'before-open') {
        x.clock.now = 75_000; await x.n.adapter.assertPrepared(x.prepared);
        assert.throws(() => x.open(), /FINAL_AUDIT_TOO_OLD/); assert.equal(x.n.original.broadcastAttempts, 0);
      } else {
        const gate = x.open(); x.latch();
        if (where === 'after-latch') x.clock.now = 75_000;
        else { let checks = 0; x.track.currentHook = async () => { if (++checks === 2) { await Promise.resolve(); x.clock.now = 75_000; } }; }
        await assert.rejects(gate.beforeSend(x.prepared), /FINAL_AUDIT_TOO_OLD/); assert.equal(x.n.original.broadcastAttempts, 1);
      }
      assert.equal(x.n.control.authorizationCalls, 1); assert.equal(x.n.control.sends, 0);
    } finally { await x.close(); }
  }
});

test('actual original certificate expires before token mint at exclusive next-block boundary', async t => {
  let seen;
  await assert.rejects(captured(t, { configure(x) { seen = x; x.n.control.authorizationHook = auth => {
    auth.message.validUntil = String(BigInt(x.f.state.head.timestamp) + 1n); }; } }), /CERTIFICATE_EXPIRED/);
  assert.equal(seen.token, undefined); assert.equal(seen.n.original.broadcastAttempts, 0);
});

test('actual post-fsync final gate rejects current head, reservation, revocation, operator/quorum, epoch, keeper and final-await changes', async t => {
  for (const fault of ['head', 'reservation', 'revoked', 'operator', 'quorum', 'epoch', 'keeper', 'last-await-head', 'last-await-epoch', 'wire', 'authorization', 'signature', 'abi-signature', 'prepared', 'controller-closed']) {
    const x = await captured(t);
    try {
      const gate = x.open(); x.latch();
      if (fault === 'head') advanceLifecycleHead(x.f);
      if (fault === 'reservation') x.n.control.reservation.consumed = true;
      if (fault === 'revoked') x.n.control.revoked = true;
      if (fault === 'operator') poisonedOperators.add(x.f.options.operators[0]);
      if (fault === 'quorum') poisonedQuorums.add(x.f.options.quorum);
      if (fault === 'epoch') x.f.runtime.ingressSendState = { epoch: '1', busy: false, uncertain: false };
      if (fault === 'wire') x.n.original.nativeWire += 'AAAA';
      if (fault === 'authorization') x.n.control.originalAuthorization.message.inventoryCommitment = hash('changed authorization');
      if (fault === 'signature') x.n.control.originalAuthorization.signatures[0] = 'ff'.repeat(65);
      if (fault === 'abi-signature') x.n.control.originalAuthorization.abiSignatures[0].r = hash('changed signature');
      if (fault === 'prepared') x.prepared.intent.lamports = '2';
      if (fault === 'controller-closed') x.f.controller.close();
      if (fault === 'keeper') { await writeFile(x.f.path, Buffer.from('synthetic keeper corruption')); await assert.rejects(x.n.journal.read(), /KEEPER_READ_UNCERTAIN/); }
      if (fault.startsWith('last-await-')) { let checks = 0; x.track.currentHook = async () => {
        if (++checks === 2) { await Promise.resolve(); if (fault.endsWith('head')) advanceLifecycleHead(x.f);
          else x.f.runtime.ingressSendState = { epoch: '1', busy: false, uncertain: false }; }
      }; }
      await assert.rejects(gate.beforeSend(x.prepared), /HEAD_CHANGED|RESERVATION_CONSUMED|REVOKED_NATIVE_GID|CLOSED_OR_POISONED|MUTATION_CHANGED|KEEPER_|FINAL_WIRE|AUTHORIZATION_CHANGED|PREPARATION_CHANGED|CONTROLLER_CLOSED/, fault);
      assert.equal(x.n.original.phase, 'BROADCAST_UNKNOWN'); assert.equal(x.n.original.broadcastAttempts, 1);
      assert.equal(x.n.control.authorizationCalls, 1); assert.equal(x.n.control.sends, 0);
    } finally { await x.close(); }
  }
});

// Composition additionally executes unchanged source-extracted owned runtime
// closures and native lease assertions. Its native RPC/process/fsync/codec ports
// remain inert. This is host ordering evidence, never live-chain evidence.
import { createRuntimeFixture, assertReleased } from '../chain-adapters/solana-payout-authority-runtime.fixture.mjs';
async function composed(t, { kind = '1', setup = 0, fault = null, mode = 'resume' } = {}) {
  const f = await fixture(), n = await installRetainedNoncePayout(f, { status: 'RESERVED_BEFORE_BROADCAST', kind });
  const native = f.options.claims.nativeRuntimes[0], clock = { now: 0 }, mocked = t.mock.method(performance, 'now', () => clock.now);
  const track = trackLifecycle(f); let entering = false, latched = false, originalToken;
  const rt = createRuntimeFixture(kind === '2' ? 'refund' : 'redeem', {
    originalKeyControllerV4:{consumeNativeClaimOriginalKeyAuthorityV4:consumeWrappedClaimOriginalKeyAuthorityV4},
    prepared: n.prepared, nativeWire: n.nativeWire, nativeId: n.nativeId, transactionSHA256: n.binding.transactionSHA256,
    close: native.close, genesis: native.genesis, recipientIndex: 0, clock,
    payoutController: { openNativeClaimSolanaPayoutAuthority: open },
    decodeHook({ latched: decodedAfterLatch }) {
      if (fault === 'terminal-codec-age-gap' && decodedAfterLatch) clock.now++;
    },
    get deadProcess() {
      // A deterministic one-millisecond synchronous liveness-port cost, not a
      // measured native cost. Tests the age gap after expensive final checks.
      if (fault === 'terminal-authority-age-gap' && latched) clock.now++;
      return false;
    },
    async afterLatch({ api, record }) {
      latched = true;
      if (fault === 'shutdown') api.setState({ shuttingDown: true });
      if (fault === 'isolation') api.setState({ isolationFailure: Error('TEST_SOCKET_ISOLATION') });
      if (fault === 'reservation') n.control.reservation.consumed = true;
      if (fault === 'revoked') n.control.revoked = true;
      if (fault === 'wire') record.nativeWire += 'AAAA';
      if (fault === 'operator') poisonedOperators.add(f.options.operators[0]);
      if (fault === 'epoch') f.runtime.ingressSendState = { epoch: '1', busy: false, uncertain: false };
      if (fault === 'deadline') clock.now += 30_000;
      if (['terminal-authority-age-gap', 'terminal-codec-age-gap'].includes(fault)) clock.now = 29_999;
    },
  });
  if (mode === 'resume') rt.reserve();
  Object.defineProperty(native, 'transfers', { configurable: true, get: () => [...rt.records.values()] });
  native.observe = async () => { n.control.observationStatus = 'pending'; return { status: 'pending' }; };
  const read = f.options.observer.read;
  f.options.observer.read = async () => { const value = await read(); if (entering) { entering = false; clock.now += setup; } return value; };
  n.adapter.assertPrepared = async value => { assert.equal(value, n.prepared); n.control.preparedChecks++;
    // Negative ownership-wiring case deliberately omits the full-native port.
    if (fault !== 'stale-native-miswiring') await rt.revalidate(); };
  const dispatch = async (_request, callbacks) => {
    assert.deepEqual(Object.keys(callbacks), mode === 'resume' ? ['beforeBroadcast'] : ['beforeSign', 'onSigned', 'beforeBroadcast']);
    const result = await rt.start(mode, { ...callbacks, beforeBroadcast: async value => {
      entering = true; originalToken = await callbacks.beforeBroadcast(value);
      if (fault === 'stale-authority-fresh-native') { clock.now += 30_000; await rt.revalidate(); }
      if (fault === 'undefined') return undefined;
      if (fault === 'copied') return { ...originalToken };
      return originalToken;
    } });
    n.control.observationStatus = 'pending'; return result;
  };
  if (mode === 'resume') n.adapter.resumeReservedPayout = dispatch;
  else {
    await n.journal.update(data => { data.tickets[0].native = null; data.tickets[0].route = null; return data; });
    f.state.gateways[0].tickets[0].state = '1'; f.state.gateways[0].activePayout = zero;
    native.roles = { depositor: { endpoint: n.prepared.intent.recipientPublicKey },
      escrow: { endpoint: n.prepared.intent.sourcePublicKey }, recipient: { endpoint: n.prepared.intent.recipientPublicKey } };
    native.inventory = async () => ({ accounts: Object.values(native.roles).map(role => ({ ...role, exists: true, total: '100000000', rentExemptMinimum: '1000' })) });
    addLifecycleMethod(f, 'beginPayout', [{ name: 'ticketId', type: 'bytes32' }, lifecycleRoute, f.authSchema]);
    addLifecycleMethod(f, 'reserveSignedEffect', [
      ...'operationId nullifier wireBindingCommitment refundDestination'.split(' ').map(name => ({ name, type: 'bytes32' })), f.authSchema]);
    f.options.quorum.authorizePayout = async () => ({ head: structuredClone(f.state.head), message: { synthetic: true } });
    f.options.quorum.reservation = f.options.quorum.backing;
    f.control.includedHook = () => { f.state.gateways[0].tickets[0].state = '2';
      f.state.gateways[0].activePayout = n.id; advanceLifecycleHead(f); };
    for (const op of f.options.operators) op.retainSignedEffect = async () => {
      const b = (await n.journal.read()).tickets[0].native.binding;
      n.control.reservation.wireBindingCommitment = b.wireBindingCommitment;
      return { admissionN: b.admissionN, wireBindingCommitment: b.wireBindingCommitment };
    };
    const broadcast = f.options.quorum.authorizeBroadcast;
    f.options.quorum.authorizeBroadcast = async request => {
      const row = (await n.journal.read()).tickets[0];
      assert.equal(request.wireSalt, row.native.wireSalt);
      const authorization = await broadcast({ ...request, wireSalt: n.wireSalt });
      for (const key of ['admissionN', 'nativeGid', 'wireBindingCommitment']) authorization.message[key] = row.native.binding[key];
      return authorization;
    };
    n.adapter.transfer = dispatch;
  }
  f.control.finalAuditHook = async result => { if(result.message?.nativeGid){
    if(['terminal-authority-age-gap','terminal-codec-age-gap'].includes(fault))clock.now=1_000;
    if(fault!=='stale-native-miswiring')await rt.revalidate();
  } };
  if (fault === 'expired') n.control.authorizationHook = auth => { auth.message.validUntil = String(BigInt(f.state.head.timestamp) + 1n); };
  if (fault === 'final-await') { let checks = 0; track.currentHook = async () => {
    if (latched && ++checks === 2) { await Promise.resolve(); clock.now += 30_000; }
  }; }
  return { f, n, native, rt, clock, track, get token() { return originalToken; },
    async run() { return f.controller.payout({ ticketId: n.id }); },
    async close() { mocked.mock.restore(); poisonedOperators.delete(f.options.operators[0]); await f.close(); },
  };
}

for (const kind of ['1', '2']) test(`real-controller/extracted-runtime composition ${kind === '1' ? 'redeem' : 'refund'} accepts 45s setup and fresh original native+quorum observations`, async t => {
  const x = await composed(t, { kind, setup: 45_000 });
  try {
    await x.run(); assert.equal(x.rt.counters().sendCalls, 1); assert.equal(x.rt.counters().signCalls, 0);
    assert.equal(x.n.control.authorizationCalls, 1); assert.equal(x.n.control.preparedChecks, 1);
    assert.equal(x.rt.events.filter(v => v === 'revalidate-native').length, 3);
    assert.equal(x.rt.record().broadcastAttempts, 1); assert.equal(x.rt.record().nativeWire, x.n.nativeWire);
    assert.ok(x.rt.events.indexOf('persist:BROADCAST_UNKNOWN') < x.rt.events.indexOf('send'));
    assert.throws(() => open(x.token, x.native.close, x.native.genesis, x.n.prepared, x.rt.record()), /PRIVATE_PAYOUT_AUTHORITY_REQUIRED/);
    assertReleased(x.rt);
  } finally { await x.close(); }
});

test('real-controller/runtime composition preserves signed0 for expired, copied, missing or stale authority despite fresh native revalidation', async t => {
  for (const mode of ['transfer', 'resume']) for (const fault of ['expired', 'undefined', 'copied', 'stale-authority-fresh-native']) {
    const x = await composed(t, { fault, mode });
    try {
      await assert.rejects(x.run(), /CERTIFICATE_EXPIRED|PRIVATE_PAYOUT_AUTHORITY_REQUIRED|FINAL_AUDIT_TOO_OLD/, fault);
      assert.equal(x.rt.record().phase, 'SIGNED_NOT_BROADCAST'); assert.equal(x.rt.record().broadcastAttempts, 0);
      assert.equal(x.rt.counters().sendCalls, 0); assert.equal(x.rt.counters().signCalls, mode === 'transfer' ? 1 : 0);
      assert.equal(x.n.control.authorizationCalls, 1); assertReleased(x.rt);
    } finally { await x.close(); }
  }
});

test('real-controller/runtime composition late failures retain attempt1 observation-only and never resend', async t => {
  for (const mode of ['transfer', 'resume']) for (const fault of ['shutdown', 'isolation', 'reservation', 'revoked', 'wire', 'operator', 'epoch', 'deadline', 'final-await']) {
    const x = await composed(t, { fault, mode });
    try {
      await assert.rejects(x.run(), /BROADCAST_UNKNOWN_OBSERVE_EXACT_SIGNATURE|RESERVATION_CONSUMED|REVOKED|WIRE|CLOSED_OR_POISONED/, fault);
      assert.equal(x.rt.record().phase, 'BROADCAST_UNKNOWN'); assert.equal(x.rt.record().broadcastAttempts, 1);
      assert.equal(x.rt.counters().sendCalls, 0); assert.equal(x.rt.counters().signCalls, mode === 'transfer' ? 1 : 0);
      assert.equal(x.n.control.authorizationCalls, 1); assertReleased(x.rt);
      const before = x.rt.counters(); await assert.rejects(x.rt.start('resume'), /FIRST_SEND_ONLY|BUSY_OR_CLOSED/);
      assert.deepEqual(x.rt.counters(), before);
    } finally { await x.close(); }
  }
});

for (const kind of ['1', '2']) test(`actual initial controller + extracted transfer compose ${kind === '1' ? 'redeem' : 'refund'} beforeSign/onSigned/authority without recollection`, async t => {
  const x = await composed(t, { kind, setup: 45_000, mode: 'transfer' });
  try {
    await x.run(); assert.equal(x.rt.counters().sendCalls, 1);
    assert.equal(x.rt.counters().signCalls, 1, 'one inert signature-port invocation, never a native signer');
    assert.equal(x.f.runtime.transactions.length, 2, 'synthetic beginPayout and signed reservation only');
    assert.equal(x.n.control.authorizationCalls, 1); assert.equal(x.n.control.preparedChecks, 2);
    assert.equal(x.rt.record().broadcastAttempts, 1); assert.equal(x.rt.record().nativeWire, x.n.nativeWire);
    assertReleased(x.rt);
  } finally { await x.close(); }
});

test('actual final synchronous capability burns before failed liveness assertion and cannot recover', async t => {
  const x = await captured(t);
  try {
    const gate = x.open(); x.latch(); await gate.beforeSend(x.prepared);
    poisonedOperators.add(x.f.options.operators[0]);
    assert.throws(() => gate.assertBeforeSend(x.prepared), /CLOSED_OR_POISONED/);
    poisonedOperators.delete(x.f.options.operators[0]);
    assert.throws(() => gate.assertBeforeSend(x.prepared), /ONE_USE_PERMISSION_REQUIRED/);
    assert.equal(x.n.original.broadcastAttempts, 1); assert.equal(x.n.control.sends, 0);
  } finally { await x.close(); }
});

test('miswired synthetic adapter cannot substitute a fresh real controller token for stale native evidence', async t => {
  // Genuine runtime assertPrepared always performs a full native revalidation
  // after controller quorum start, so native age is then no greater than the
  // original authority age. Deliberately omit that adapter refresh here to test
  // the independent runtime guard against ownership-wiring regressions.
  for (const mode of ['transfer', 'resume']) {
    const x = await composed(t, { mode, setup: 45_000, fault: 'stale-native-miswiring' });
    try {
      await assert.rejects(x.run(), /SOLANA_PAYOUT_NATIVE_OBSERVATION_TOO_OLD/);
      assert.ok(x.token, 'actual controller completed and minted fresh original authority');
      assert.equal(x.clock.now, 45_000); assert.equal(x.n.control.authorizationCalls, 1);
      assert.equal(x.rt.record().phase, 'SIGNED_NOT_BROADCAST'); assert.equal(x.rt.record().broadcastAttempts, 0);
      assert.equal(x.rt.counters().sendCalls, 0);
      const gate = open(x.token, x.native.close, x.native.genesis, x.n.prepared, x.rt.record());
      assert.equal(gate.profile, 'CLAIM_PAYOUT_ORIGINAL_AUTHORITY_LIFETIME_V2', 'authority itself remains fresh');
      assertReleased(x.rt);
    } finally { await x.close(); }
  }
});

test('final synchronous runtime work cannot outlive original authority while newer native lease remains fresh', async t => {
  for (const mode of ['transfer', 'resume']) for (const fault of ['terminal-authority-age-gap', 'terminal-codec-age-gap']) {
    const x = await composed(t, { mode, fault });
    try {
      await assert.rejects(x.run(), error => {
        assert.equal(error.message, 'SOLANA_BROADCAST_UNKNOWN_OBSERVE_EXACT_SIGNATURE');
        assert.match(error.cause.message, /FINAL_AUDIT_TOO_OLD/); return true;
      });
      assert.equal(x.clock.now, 30_000); assert.equal(x.rt.counters().sendCalls, 0);
      assert.equal(x.rt.record().broadcastAttempts, 1); assert.equal(x.n.control.authorizationCalls, 1);
    } finally { await x.close(); }
  }
});
