/** Host orchestration and source policy only. All owned capabilities, native
 * reads/transfers and artifact writes are mocked; no node/proof/compiler runs. */
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import vm from 'node:vm';
import { NATIVE_CLAIM_RUN_ROUTES, nativeClaimRunDirectory } from './native-claim-run-route.mjs';
import * as originalV3Host from '../wallet-platform/modules/native-claims/ingress-v3-host.mjs';
import { assertLoadedV3ProofBoundary } from './native-claim-loaded-v3-policy.mjs';
let control;
const copy = value => structuredClone(value), id = 'ab'.repeat(64), sha = 'cd'.repeat(32), wireKey = 'ef'.repeat(32);
mock.module(new URL('../wallet-platform/modules/ops/native-operators.mjs', import.meta.url).href, { exports: {
  assertOwnedFlatOperatorQuorum(value, binding) {
    assert.equal(value, control.fixture.graphQuorum);
    assert.deepEqual(binding, { runtime: control.fixture.runtime, system: control.fixture.system,
      nativeRuntime: control.fixture.graphSolana, family: '2' });
    control.events.push('owned-quorum');
  },
} });
mock.module(new URL('../wallet-platform/modules/chain-adapters/native-receipt-binding.mjs', import.meta.url).href, { exports: {
  validateSolanaBindingTransaction(wire, intent) {
    assert.equal(wire, 'host-original-wire'); assert.deepEqual(intent, control.prepared.intent);
    return { signatureHex: id, transactionSHA256: sha };
  },
} });
mock.module(new URL('./owned-flat-fixture.mjs', import.meta.url).href, { exports: {
  freshFixtureId: () => wireKey,
  writeFixturePrivate(path, value) { control.events.push('write:' + basename(path)); control.artifacts.set(basename(path), copy(value)); },
} });
mock.module(new URL('../wallet-platform/modules/native-claims/ingress-v3-host.mjs', import.meta.url).href, { exports: { ...originalV3Host,
  assertNonceIngressDeployment(claims) { assert.equal(claims, control.fixture.claims); } } });
const { probeLoadedV3PostDeliveryFacts } = await import('./native-claim-loaded-v3-probe.mjs');
const relations = ['deposit_intent', 'native_claim_ingress_v3'];

function fixture(options = {}) {
  const c = { events: [], artifacts: new Map(), records: [], factCounts: [0, 0, 0, 0], transferCalls: 0, factsCalls: 0,
    head: { number: '60', hash: '12'.repeat(32), timestamp: '1000' },
    custody: { accounts: [{ role: 'escrow', total: '5000000' }], feeAudit: { actualFees: '5000' } } };
  const keys = [0, 1, 2, 3].map(index => ({ x: String(index).repeat(64), y: 'a'.repeat(64) }));
  const view = { head: copy(c.head), gateways: ['0', '3000000'].map((wrapperSupply, index) => ({ wrapperSupply,
    intentCount: String(index), ticketCount: '0', pendingRedemptions: '0', pendingRefunds: '0',
    heldUnissued: '0', reservedFees: '0', activePayout: '0'.repeat(64),
    intents: index ? [{ id: 'issued-intent', state: '2', amount: '3000000' }] : [] })) };
  const binding = { family: '2', genesis: 'native-genesis', asset: 'registered-asset',
    sourceEndpoint: 'solver', destinationEndpoint: 'recipient-0' };
  c.prepared = { intent: { lamports: '1000000', wireKeyCommitment: wireKey,
    sourcePublicKey: 'solver', recipientPublicKey: 'recipient-0' } };
  const native = { get transfers() { return copy(c.records); }, solver: 'solver-address', solverHex: '0xsolver', recipients: ['recipient-0', 'recipient-1'],
    async balance(address) {
      if (!this.transfers.length) return address === this.solver ? '10000000' : '2000000';
      return address === this.solver ? '8995000' : address === this.recipients[0] ? '3000000' : '2000000';
    },
    adapter(input) {
      assert.deepEqual(input, { asset: 'registered-asset', recipientIndex: 0 });
      return { binding,
        async assertPrepared(prepared) { assert.equal(prepared, c.prepared); c.events.push('prepared-current'); },
        async transfer(request, callbacks) {
          c.transferCalls++; c.events.push('transfer'); assert.deepEqual(request, { amount: '1000000', wireKeyCommitment: wireKey });
          assert.deepEqual(Object.keys(callbacks).sort(), ['beforeSign', 'onSigned']);
          await callbacks.beforeSign(c.prepared); c.events.push('sign');
          await callbacks.onSigned({ nativeWire: 'host-original-wire' });
          c.events.push('broadcast');
          c.records.push({ nativeId: id, nativeWire: 'host-original-wire', transactionSHA256: sha,
            intent: copy(c.prepared.intent), phase: 'BROADCAST', broadcastAttempts: options.twoBroadcasts ? 2 : 1 });
          if (options.transferError) throw options.transferError;
          return { nativeId: id, transactionSHA256: sha };
        },
      };
    },
    async observe(nativeId) {
      assert.equal(nativeId, id); c.events.push('observe-original');
      const row = c.records[0]; row.phase = 'OBSERVED_FINALIZED';
      row.observation = { status: 'observed', nativeId: id, nativeWire: options.changedWire ? 'other-wire' : row.nativeWire,
        feeLamports: '5000' };
      return row.observation;
    },
  };
  c.fixture = { runtime: { transactions: [] }, system: { registry: { keys } },
    bitcoin: { transfers: [] }, graphBitcoin: { transfers: [] }, graphSolana: native,
    solana: { roles: { depositor: { endpoint: 'depositor' }, escrow: { endpoint: 'escrow' }, recipient: { endpoint: 'custody-recipient' } },
      transfers: [{ route: 'deposit', phase: 'OBSERVED_FINALIZED', broadcastAttempts: 1,
        nativeId: 'original-claim-native-id', transactionSHA256: 'original-claim-hash', intent: { lamports: '3000000' } }],
      inventory: async () => copy(c.custody) }, rules: [{}, { family: '2', asset: binding.asset, genesis: binding.genesis }],
    operators: keys.map(publicKey => ({ publicKey })), graphOperators: keys.map((publicKey, index) => ({ publicKey,
      status: () => ({ certifiedInventoryCount: c.factCounts[index] }) })),
    observer: { async read() { c.events.push('claims-read'); return copy(view); }, async assertCurrent() { c.events.push('claims-current'); } },
    graphQuorum: {
      async facts(request) {
        c.factsCalls++; c.events.push('facts'); assert.deepEqual(request, { family: '2', recipientIndex: '0', nativeId: id, wireKeyCommitment: wireKey });
        if (options.factsError) throw options.factsError;
        c.factCounts = [1, 1, 1, 0];
        return { certificates: [{}, {}, {}], head: copy(c.head) };
      },
      async health(request) {
        c.events.push('health'); assert.deepEqual(request, { poolIndex: 1 }); assert.deepEqual(c.factCounts, [1, 1, 1, 0]);
        if (options.healthEffect) c.fixture.runtime.transactions.push({});
        if (options.custodyEffect) c.custody.accounts[0].total = '4000000';
        return { head: options.changedHead ? { ...c.head, number: '61' } : copy(c.head) };
      },
      async checkpoint(request) {
        c.events.push('checkpoint'); assert.deepEqual(request, { poolIndex: 1, requestId: wireKey });
        assert.deepEqual(c.factCounts, [1, 1, 1, 0]);
        if (options.lostRetainedFact) c.factCounts[1] = 0;
        if (options.newFinalizedContext) c.records[0].observation.currentSlot = '900';
        if (options.changedOriginal) c.records[0].nativeWire = 'replacement-wire';
        return { head: copy(c.head) };
      },
    },
  };
  c.controller = { async privateNativeReceipt(request) {
    c.events.push('retained-claim-binding'); assert.deepEqual(request, { operationId: 'issued-intent' });
    if (options.missingClaimBinding) throw new Error('CLAIM_NO_RETAINED_NATIVE_RECEIPT');
    return { family: '2', nativeId: 'original-claim-native-id', transactionSHA256: 'original-claim-hash', broadcastAttempts: 1 };
  } };
  c.fixture.solana.nonceIngressProfile = 'LIANUM_GENERIC_NATIVE_CLAIM_INGRESS_V3';
  c.run = () => { control = c; return probeLoadedV3PostDeliveryFacts({ fixture: c.fixture, controller: c.controller, proofRelations: relations,
    privateDirectory: '/host-only-private-audit', stage: async name => { c.events.push('stage:' + name); },
    audit: async () => { c.events.push('audit'); } }); };
  c.view = view; return c;
}

test('loaded probe preserves original signing, one send, facts once, then retained-fact health/checkpoint', async () => {
  const c = fixture(), result = await c.run();
  assert.equal(c.transferCalls, 1); assert.equal(c.factsCalls, 1);
  const at = event => c.events.indexOf(event);
  assert.ok(at('prepared-current') < at('sign'));
  assert.ok(at('write:loaded-facts-signed-before-broadcast.json') < at('broadcast'));
  assert.ok(at('observe-original') < at('facts')); assert.ok(at('facts') < at('health')); assert.ok(at('health') < at('checkpoint'));
  assert.ok(at('retained-claim-binding') < at('transfer')); assert.equal(result.retainedOriginalClaimBinding, true);
  assert.equal(result.factualChecksPassed, true); assert.equal(result.success, false);
  assert.equal(result.ownerClaimFullyRedeemed, false); assert.equal(result.fullNativeGraphAcceptance, false);
  assert.equal(result.providerProofs, false); assert.equal(result.graphSettlement, false);
  assert.ok(c.artifacts.has('loaded-facts-genuine-quorum.json'));
  await assert.rejects(c.run(), /ONE_PROBE/); assert.equal(c.transferCalls, 1);
});

test('fresh finality context can advance without changing the retained original effect', async () => {
  const c = fixture({ newFinalizedContext: true }); await c.run();
  assert.equal(c.fixture.graphSolana.transfers[0].observation.currentSlot, '900');
});

test('only an uncertain original broadcast reply is observed, never retried', async () => {
  const error = Object.assign(new Error('SOLANA_BROADCAST_UNKNOWN_OBSERVE_EXACT_SIGNATURE'), { nativeId: id });
  const c = fixture({ transferError: error }); await c.run(); assert.equal(c.transferCalls, 1);
  const wrong = fixture({ transferError: Object.assign(new Error(error.message), { nativeId: 'ff'.repeat(64) }) });
  await assert.rejects(wrong.run()); assert.equal(wrong.transferCalls, 1); assert.equal(wrong.factsCalls, 0);
  assert.ok(!wrong.events.includes('observe-original'));
});

test('funded original claim, registration and exact proof boundary are mandatory before transfer', async () => {
  const missing = fixture({ missingClaimBinding: true });
  await assert.rejects(missing.run(), /NO_RETAINED_NATIVE_RECEIPT/); assert.equal(missing.transferCalls, 0);
  for (const mutate of [c => { c.view.gateways[1].wrapperSupply = '0'; },
    c => { c.view.gateways[1].intents[0].state = '1'; }, c => { c.view.gateways[1].intentCount = '2'; },
    c => { c.fixture.solana.transfers[0].intent.lamports = '2000000'; },
    c => { c.fixture.operators[0].publicKey = { x: 'replacement' }; },
    c => { c.fixture.graphBitcoin.transfers.push({}); }, c => { c.factCounts[0] = 1; },
    c => { c.fixture.solana.roles.escrow.endpoint = 'solver'; }]) {
    const c = fixture(); mutate(c); await assert.rejects(c.run()); assert.equal(c.transferCalls, 0);
  }
  assertLoadedV3ProofBoundary(relations, 'issued');
  assertLoadedV3ProofBoundary([...relations, 'withdraw_balance', 'native_claim_discharge'], 'redeemed');
  for (const relation of ['authorization', 'reservation', 'dependency', 'ready', 'admission', 'nullifier', 'settlement', 'deposit_intent'])
    assert.throws(() => assertLoadedV3ProofBoundary([...relations, relation], 'issued'), /PROOF_BOUNDARY/);
  assert.throws(() => assertLoadedV3ProofBoundary(relations, 'redeemed'), /PROOF_BOUNDARY/);
});

test('facts failure returns original error, without retry or subsequent attestations', async () => {
  const error = new Error('FLAT_OPERATOR_QUORUM_TOO_OLD'), c = fixture({ factsError: error });
  await assert.rejects(c.run(), value => value === error);
  assert.equal(c.factsCalls, 1); assert.equal(c.transferCalls, 1);
  assert.ok(!c.events.includes('health')); assert.ok(!c.events.includes('checkpoint'));
});

test('changed original wire, extra broadcast, head, custody, retained fact or EVM effect fail closed', async () => {
  for (const options of [{ changedWire: true }, { twoBroadcasts: true }, { changedHead: true },
    { custodyEffect: true }, { lostRetainedFact: true }, { healthEffect: true }, { changedOriginal: true }]) {
    const c = fixture(options); await assert.rejects(c.run()); assert.equal(c.transferCalls, 1); assert.ok(c.factsCalls <= 1);
  }
});

