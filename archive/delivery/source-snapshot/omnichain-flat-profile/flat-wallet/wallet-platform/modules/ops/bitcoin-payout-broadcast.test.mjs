/** SOURCE-ONLY BTC post-reservation broadcast authority tests. The combined actors, authorization
 * signatures, accounting, reservation binding, codecs and quorum checks are
 * production code. Ownership, observers, native inventory and durable stores
 * are explicit in-memory fixtures. Bitcoin witness bytes below are canonical
 * syntax with fixed dummy r=s=1; they are NOT ECDSA, UTXO, inclusion, finality,
 * runtime, funding or end-to-end acceptance evidence. No native constructor,
 * RPC, native signer/send, prover/compiler or artifact keys are used. Clocks
 * are functional test inputs only; no timing/performance claim is made.
 * The fixture is a local copy of btc-payout-collection.test.mjs. It imports no
 * other test and mutates no production module. All generated fixture records
 * remain retained in memory; teardown closes actors without deleting records. */
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { publicKeccak256 } from '../../../../../omnichain-product/src/private-cohort-public-native.mjs';
import { nativeAdmissionRulesTree } from '../../../../../omnichain-product/src/paeg/native-admission.mjs';
import { checkpointAuthorizationDigest, revocationMessage }
  from '../../../../../omnichain-product/src/evidence/native-hub-messages.mjs';
import { createNativeQuorumHostVerifier } from '../../../../../omnichain-product/src/evidence/native-quorum.mjs';
import { FACTS_QUORUM_PROFILE, nativeFactsRegistryCommitment } from '../chain-adapters/native-facts-peer.mjs';
import { nativeRuleCommitment, encodeBitcoinBinding, validateBitcoinBinding, receiptKeyCommitment } from '../chain-adapters/native-receipt-binding.mjs';
import { recoverSecp256k1Sender } from '../chain-adapters/owned-evm-v2-runtime.mjs';
import { flatNativeHealthDigest } from '../chain-adapters/native-health.mjs';
import { ownedCustodyRoute, ownedCustodyFeeAudit, summarizeOwnedBitcoinCoins } from '../chain-adapters/owned-native-custody.mjs';
import { CLAIM_CONFIG_SCHEMA, claimDomainCommitment, claimIntentId, claimTicketId, claimTicketSecret, nativeClaimEndpointCommitment,
  claimDestinationCommitment } from '../native-claims/framing.mjs';
import { CLAIM_ACTIONS, claimHash, claimBackingFrame, claimPayoutAuthorizationFrame, claimFrame, claimRouteCommitment, claimPayoutBroadcastFrame } from '../native-claims/permits.mjs';
import { createClaimReservationBinding } from '../native-claims/reservation-facts-gate.mjs';
import * as originalFactsPeer from '../chain-adapters/native-facts-peer.mjs';
import * as originalNoteEncoding from '../../../../../omnichain-product/src/private-note-encoding.mjs';


const sha = value => createHash('sha256').update(value).digest('hex'), copy = value => structuredClone(value);
const frozen = value => { if (value && typeof value === 'object') { Object.values(value).forEach(frozen); Object.freeze(value); } return value; };
const prefix = value => '0x' + value, word = value => BigInt(value).toString(16).padStart(64, '0'), ZERO = word(0);
const url = path => new URL(path, import.meta.url).href;
const owned = { runtimes: new WeakMap(), systems: new WeakMap(), natives: new WeakSet(), observers: new WeakMap() };
const records = new Map(); let serial = 0;
let attesterKeyUses = 0, factsKeyUses = 0;
const observedFactsSigner = create => input => {
  const signer = create(input);
  return Object.freeze({ publicKey: signer.publicKey, signFacts(facts) {
    factsKeyUses++; return signer.signFacts(facts);
  } });
};
mock.module(url('../chain-adapters/native-facts-peer.mjs'), { exports: { ...originalFactsPeer,
  createNativeFactsSigner: observedFactsSigner(originalFactsPeer.createNativeFactsSigner),
  createNativeClaimFactsSigner: observedFactsSigner(originalFactsPeer.createNativeClaimFactsSigner),
} });
mock.module(url('../../../../../omnichain-product/src/private-note-encoding.mjs'), { exports: { ...originalNoteEncoding,
  signature(...args) { attesterKeyUses++; return originalNoteEncoding.signature(...args); },
} });
mock.module(url('../chain-adapters/local-evm-ownership.mjs'), { exports: {
  async assertLocalEvm(runtime) { assert.ok(owned.runtimes.has(runtime), 'TEST_OWNED_RUNTIME'); },
} });
mock.module(url('./deploy-system.mjs'), { exports: {
  assertOwnedFlatSystem(runtime, system) { assert.equal(owned.systems.get(system), runtime, 'TEST_OWNED_SYSTEM'); },
} });
mock.module(url('../chain-adapters/owned-solana-runtime.mjs'), { exports: {
  SOLANA_NONCE_INGRESS_PROFILE: 'LIANUM_GENERIC_NATIVE_CLAIM_INGRESS_V3',
  assertOwnedSolanaRuntime() { assert.fail('TEST_NO_SOLANA_RUNTIME'); },
} });
mock.module(url('../chain-adapters/owned-bitcoin-runtime.mjs'), { exports: {
  assertOwnedBitcoinRuntime(native) { assert.ok(owned.natives.has(native), 'TEST_OWNED_NATIVE'); },
} });
mock.module(url('../native-claims/owned-state.mjs'), { exports: {
  assertOwnedClaimObserver(observer) { assert.ok(owned.observers.has(observer), 'TEST_OWNED_CLAIM_OBSERVER'); },
  ownedClaimObserverBindings(observer) { assert.ok(owned.observers.has(observer)); return owned.observers.get(observer); },
} });
mock.module(url('../chain-adapters/evm-vault-delivery-observer.mjs'), { exports: {
  assertOwnedEvmVaultDeliveryObserver() { assert.fail('TEST_NO_EVM_DELIVERY'); },
  assertOwnedEvmVaultDeliveryFacts() { assert.fail('TEST_NO_EVM_DELIVERY'); },
} });
mock.module(url('../paeg/flat-system-state.mjs'), { exports: {
  async createFlatSystemStateReader({ runtime, system, poolIndex }) {
    assert.equal(owned.systems.get(system), runtime); const f = owned.runtimes.get(runtime);
    const issued = new WeakSet(), stats = { poolIndex, reads: 0, currentChecks: 0 };
    f.controls.readerStats.push(stats);
    return Object.freeze({ async read() {
      stats.reads++; const value = frozen(copy(f.view(poolIndex))); issued.add(value); return value;
    }, async assertCurrent(view) {
      stats.currentChecks++; assert.ok(issued.has(view), 'TEST_ORIGINAL_READER_VIEW_REQUIRED');
      await f.controls.beforeCurrent?.(stats, view);
      assert.ok(!f.controls.currentFailure, 'TEST_CURRENT_VALIDATION_FAILED');
      assert.deepEqual(view, f.view(poolIndex), 'TEST_GRAPH_HEAD_CHANGED');
    } });
  },
} });
mock.module(url('../native-claims/segmented-record-store.mjs'), { exports: {
  async createClaimRecordStore({ path }, data) {
    assert.ok(!records.has(path)); const row = { data: copy(data), revision: 0, closed: false, corrupt: false, updates: [], writes: 0 };
    records.set(path, row);
    const read = async () => { await row.beforeRead?.(); assert.ok(!row.closed, 'TEST_CLAIM_STORE_CLOSED');
      return { data: copy(row.data), revision: row.revision, commitment: row.corrupt ? sha('corrupt') : sha(String(row.revision)) }; };
    return { read, async update(revision, transform) {
      assert.equal(row.revision, revision); row.data = copy(transform(copy(row.data)));
      row.updates.push(copy(row.data));
      row.revision = revision + 1; row.writes++; await row.beforeUpdate?.(copy(row.data)); return read();
    }, close() { row.closed = true; } };
  },
} });
const bridge = await import('./combined-native-operators.mjs');
const { createCombinedLocalNativeOperator } = bridge;
const { createFlatOperatorQuorum } = await import('./native-operators.mjs');
const { createClaimOperatorQuorum, assertOriginalBitcoinPayoutBroadcastAuthorization } = await import('../native-claims/operators.mjs');
const { claimBitcoinPayoutBroadcastFrame } = await import('../native-claims/bitcoin-payout-broadcast.mjs');

const { createOwnedOperatorNativeReads } = await import('./owned-native-operator-reads.mjs');
const NATIVE_PUBLIC_KEYS = Object.freeze({
  depositor: '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798',
  escrow: '0379be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798',
  graph: '02f9308a019258c31049344f85f89d5229b531c845836f99b08601f113bce036f9',
});
const keyScript = key => '0014' + createHash('ripemd160').update(Buffer.from(sha(Buffer.from(key, 'hex')), 'hex')).digest('hex');
function bitcoinIntent({ sourceScript, recipientScript, wireKeyCommitment, tag }) {
  return { sourceTxid: sha(tag), sourceVout: '0', sourceScript, sourceSatoshi: '20000000',
    recipientScript, amountSatoshi: '12345', changeScript: sourceScript, feeSatoshi: '5000', wireKeyCommitment };
}
function witnessSyntax(intent, publicKey) {
  const unsigned = Buffer.from(encodeBitcoinBinding(intent), 'hex');
  // Canonical DER plus SIGHASH_ALL, deliberately fake r=s=1, not a signature.
  const witness = Buffer.concat([Buffer.from('020930060201010201010121', 'hex'), Buffer.from(publicKey, 'hex')]);
  const rawTransaction = Buffer.concat([unsigned.subarray(0, 4), Buffer.from('0001', 'hex'),
    unsigned.subarray(4, -4), witness, unsigned.subarray(-4)]).toString('hex');
  const parsed = validateBitcoinBinding(rawTransaction, intent);
  assert.equal(parsed.containsWitness, true);
  assert.equal(parsed.assurance, 'wire-and-witness-syntax-only-no-ecdsa-utxo-finality-or-authorization');
  return { txid: parsed.txid, rawTransaction };
}
function observedSyntax(rule, wire, intent) {
  return { status: 'observed', genesis: rule.genesis, asset: rule.asset, nativeWire: wire.rawTransaction, intent,
    blockId: sha('synthetic-block'), blockHeight: '50', finalityKind: '1', confirmations: '6',
    nativeContext: { observedTipId: sha('synthetic-tip'), observedTipHeight: '55', transactionSlot: '0', parentSlot: '0', observedSlot: '0' } };
}

function fixture(t) {
  const family = '1', id = ++serial, pairs = [0, 1, 2, 3].map(signerIndex => createCombinedLocalNativeOperator({ signerIndex }));
  t.after(() => { pairs.forEach(pair => { pair.claim.close(); pair.graph.close(); }); });
  const rule = { family, genesis: '0f9188f13cb7b2c71f2a335e3a4fc328bf5beb436012afca590b1a11466e2206',
    asset: sha('asset'), finalityKind: family, minimumConfirmations: '6',
    maximumEvidenceLifetime: '120', maximumClockSkew: '30' }, tree = nativeAdmissionRulesTree([rule]);
  const registry = { profile: FACTS_QUORUM_PROFILE, hubDomain: sha('hub-' + id), registryEpoch: '1', rulesRoot: tree.root,
    keys: pairs.map(pair => copy(pair.claim.publicKey)) }, registryCommitment = nativeFactsRegistryCommitment(registry);
  const head = { number: '60', timestamp: '1000', hash: sha('head') };
  const controls = { liability: '0', unresolved: false, claimHead: null, beforeInventory: null, recoveries: 0,
    inventoryReads: 0, claimReads: [], graphReads: [], graphSource: null, principal: '0',
    graphUnavailable: false, graphAdverse: false, beforeGraphRead: null, beforeRecovery: null,
    intents: [], tickets: [], activePayout: ZERO, originalPrepared: null, preparedRoute: null, preparedCalls: [], revoked: false, reservations: new Map(), readerStats: [], beforeCurrent: null, currentFailure: false,
    headerReads: 0, blockFailure: false, exclusiveNativeReads: false, nativeReadBusy: false,
    nativeReadCollisions: 0, nativeReadEvents: [], beforeNativeRead: null,
    claimViews: [], claimCurrentViews: [], beforeClaimRead: null, beforeClaimCurrent: null, claimCurrentFailure: false, coinChange: null, inventorySnapshots: [] };
  const advanceState = () => { head.number = String(BigInt(head.number) + 1n); head.hash = sha('state-head-' + head.number); };
  let liability = controls.liability;
  Object.defineProperty(controls, 'liability', { enumerable: true, get: () => liability,
    set(value) { if (value !== liability) advanceState(); liability = value; } });
  async function nativeRead(kind, work) {
    if (!controls.exclusiveNativeReads) return work();
    if (controls.nativeReadBusy) { controls.nativeReadCollisions++; throw new Error('TEST_SHARED_NATIVE_READ_BUSY'); }
    controls.nativeReadBusy = true; controls.nativeReadEvents.push({ kind, phase: 'start' });
    try {
      await controls.beforeNativeRead?.(kind);
      await new Promise(resolve => setImmediate(resolve));
      return await work();
    } finally { controls.nativeReadEvents.push({ kind, phase: 'end' }); controls.nativeReadBusy = false; }
  }
  const pools = [0, 1].map(i => prefix(sha('pool-' + id + '-' + i).slice(0, 40)));
  function view(poolIndex) {
    return { poolIndex, poolAddress: pools[poolIndex], head: copy(head),
      header: { number: '0x' + BigInt(head.number).toString(16), hash: prefix(head.hash),
        timestamp: '0x' + BigInt(head.timestamp).toString(16) },
      snapshot: { poolStateSequence: '0', hubStateSequence: '0' }, checkpointCount: '0',
      healthState: { pool: pools[poolIndex].slice(2), domain: word(1), hubDomain: registry.hubDomain, registryCommitment,
        evidenceState: word(2), receiptRoot: word(3), receiptCount: '0', spentTagDigest: ZERO, spentTagCount: '0', spentTagSequence: '0',
        revokedDigest: word(4), revokedCount: '0', revocationSequence: '0', stateSequence: '0', revocationOverflowDigest: ZERO,
        revocationOverflowCount: '0', halted: '0', timestamp: head.timestamp } };
  }
  const runtime = Object.freeze({ metadata: { scratchDirectory: '/btc-broadcast-authority-test-' + id, evmGenesis: prefix(sha('evm')) },
    async block() { controls.headerReads++; assert.ok(!controls.blockFailure, 'TEST_CURRENT_HEADER_UNAVAILABLE'); return copy(view(0).header); },
    async call({ to, data }, at) {
      assert.equal(to, '0x0000000000000000000000000000000000000001');
      assert.equal(at, '0x' + BigInt(head.number).toString(16)); const w = data.slice(2).match(/.{64}/g);
      controls.recoveries++; await controls.beforeRecovery?.();
      const recovered = recoverSecp256k1Sender({ digest: w[0], r: w[2], s: w[3], parity: Number(BigInt('0x' + w[1]) - 27n) });
      return '0x' + '00'.repeat(12) + recovered.slice(2);
    } });
  const system = Object.freeze({ registry, registryCommitment: prefix(registryCommitment), hubDomain: prefix(registry.hubDomain),
    ledgerNamespace: prefix(registry.hubDomain), hub: { address: prefix(sha('hub-address').slice(0, 40)), receipt: { transactionHash: prefix(sha('deploy')) },
      async call(method, args, at) {
        assert.equal(at, '0x' + BigInt(head.number).toString(16));
        if (method === 'attester(uint8)') {
          const key = registry.keys[args[0]], account = publicKeccak256(Buffer.from(key.x + key.y, 'hex')).subarray(12).toString('hex');
          return prefix(key.x + key.y + '00'.repeat(12) + account);
        }
        if (method === 'finalityHealthDigest(address,uint64,uint64)') {
          const { timestamp, ...state } = view(pools.indexOf(args[0])).healthState;
          return prefix(flatNativeHealthDigest({ ...state, validFrom: args[1], validUntil: args[2] }));
        }
        if (method === 'checkpointAuthorizationDigest(address,uint64,uint64,bytes32,uint64)')
          return checkpointAuthorizationDigest({ hubDomain: system.hubDomain, registryCommitment: system.registryCommitment,
            pool: args[0], expectedPoolSequence: args[1], expectedHubStateSequence: args[2], requestId: args[3], validUntil: args[4] });
        if (method === 'revoked(bytes32)') return prefix(ZERO);
        if (method === 'revocationMessage(bytes32,uint64,bytes32,uint64)')
          return revocationMessage({ hubDomain: system.hubDomain, registryCommitment: system.registryCommitment,
            gid: args[0], expectedSequence: args[1], reasonCommitment: args[2], authorizationExpiry: args[3] });
        assert.fail(method);
      } } });
  owned.runtimes.set(runtime, { view, controls }); owned.systems.set(system, runtime);
  const endpoint = name => '0014' + sha(name).slice(0, 40);
  const roles = Object.fromEntries(['depositor', 'escrow', 'recipient'].map(role => [role,
    { endpoint: role === 'depositor' ? keyScript(NATIVE_PUBLIC_KEYS.depositor)
      : role === 'escrow' ? keyScript(NATIVE_PUBLIC_KEYS.escrow) : endpoint(role), address: 'synthetic-' + role }]));
  function coin() { return { txid: sha('escrow-outpoint'), vout: '0', script: roles.escrow.endpoint,
    amount: String(10000000n + BigInt(controls.principal)), confirmations: '6', spendable: true,
    solvable: true, safe: true, locked: true, coinbase: false, ...copy(controls.coinChange ?? {}) }; }
  const config = { ...Object.fromEntries(CLAIM_CONFIG_SCHEMA.map(([name, type]) => [name,
    type === 'address' ? sha(name).slice(0, 40) : type === 'field32' ? '01' + sha(name).slice(2)
      : type === 'u256' ? '31337' : type === 'u64' ? '5000' : type === 'u8' ? '2' : sha(name)])),
    hubDomain: registry.hubDomain, ledgerNamespace: registry.hubDomain, registryCommitment, nativeFamily: family, nativeGenesis: rule.genesis,
    nativeAsset: rule.asset, nativeRuleCommitment: nativeRuleCommitment(rule),
    escrowEndpointCommitment: nativeClaimEndpointCommitment({ family, genesis: rule.genesis, asset: rule.asset, endpoint: roles.escrow.endpoint }) };
  const domain = claimDomainCommitment(config), prefund = { amount: '10000000', classification: 'SYNTHETIC_LOCAL_FEE_SURPLUS_NOT_USER_BACKING', fee: '0' };
  const close = () => {};
  const claimTransfers = [], claimObservations = new Map();
  controls.changeLastTransfer = changes => Object.assign(claimTransfers.at(-1), copy(changes));
  const custody = Object.freeze({ roles, get transfers() { return copy(claimTransfers); }, syntheticPrefunding: prefund, close,
    adapter({ asset, route }) { assert.equal(asset, rule.asset); const spec = ownedCustodyRoute(route); return { binding: { sourceEndpoint: roles[spec.sourceRole].endpoint,
      destinationEndpoint: roles[spec.destinationRole].endpoint },
      assertPrepared: prepared => nativeRead('payout-preparation', async () => {
        await controls.beforePrepared?.();
        assert.equal(route, controls.preparedRoute, 'TEST_ORIGINAL_PAYOUT_ROUTE');
        assert.deepEqual(prepared, controls.originalPrepared, 'TEST_ORIGINAL_PAYOUT_PREPARED');
        const current = coin();
        for (const [field, name] of [['sourceTxid', 'txid'], ['sourceVout', 'vout'], ['sourceScript', 'script'], ['sourceSatoshi', 'amount']])
          assert.equal(prepared.intent[field], current[name], 'TEST_CURRENT_UTXO_CHANGED');
        assert.ok(current.safe && current.solvable && current.spendable && BigInt(current.confirmations) >= 6n, 'TEST_CURRENT_UTXO_UNAVAILABLE');
        controls.preparedCalls.push(prepared);
      }) }; },
    factReader({ asset, route }) { assert.equal(asset, rule.asset); return { observe: request => nativeRead('claim-observation', async () => {
      assert.equal(route, claimTransfers.find(row => row.txid === request.nativeId)?.route); assert.ok(claimObservations.has(request.nativeId), 'TEST_NO_CLAIM_TRANSFER');
      if (controls.claimUnavailable) return { status: 'unknown', reason: 'TEST_RETAINED_CLAIM_UNKNOWN' };
      return copy(claimObservations.get(request.nativeId));
    }) }; },
    inventory: () => nativeRead('claim-inventory', async () => {
      controls.inventoryReads++; await controls.beforeInventory?.();
      const accounts = Object.entries(roles).map(([role, account]) => {
        const utxos = role === 'escrow' ? [coin()] : [];
        return { role, ...account, ...summarizeOwnedBitcoinCoins(utxos), utxos };
      });
      const inventory = { family, genesis: rule.genesis, asset: rule.asset, nativeHead: { id: sha('native-head'), height: '55' },
        accounts, escrow: copy(accounts[1]), feeAudit: ownedCustodyFeeAudit(claimTransfers.map(row => ({ nativeId: row.txid,
          route: row.route, phase: row.phase, amount: row.intent.amountSatoshi, preparedFee: row.intent.feeSatoshi,
          actualFee: row.actualFee, broadcastAttempts: row.broadcastAttempts }))), signingUnresolved: controls.unresolved,
        syntheticPrefunding: copy(prefund), unconfirmedOutputsIncluded: false };
      controls.inventorySnapshots.push(inventory); return inventory;
    }) });
  const graphSource = keyScript(NATIVE_PUBLIC_KEYS.graph);
  const observations = new Map();
  const graph = Object.freeze({ genesis: rule.genesis, genesisHex: prefix(rule.genesis), close,
    adapter({ asset, recipientIndex }) { assert.equal(asset, rule.asset); assert.ok([0, 1].includes(recipientIndex));
      return { binding: { family, genesis: rule.genesis, asset, sourceEndpoint: controls.graphSource ?? graphSource,
        destinationEndpoint: endpoint('graph-recipient-' + recipientIndex) } }; },
    factReader({ asset }) { assert.equal(asset, rule.asset); return { observe: request => nativeRead('graph-observation', async () => {
      controls.graphReads.push(copy(request)); await controls.beforeGraphRead?.();
      if (controls.graphAdverse) return { status: 'adverse', reason: 'TEST_GRAPH_ADVERSE' };
      if (controls.graphUnavailable) return { status: 'unknown', reason: 'TEST_GRAPH_UNAVAILABLE' };
      return copy(observations.get(request.nativeId) ?? { status: 'unknown', reason: 'GRAPH_OWNED_EFFECT_REQUIRED' });
    }) }; } });
  owned.natives.add(custody); owned.natives.add(graph);
  function claimView() {
    const { timestamp, ...healthState } = view(0).healthState;
    return { head: copy(controls.claimHead ?? head), hubStateSequence: '0', gateways: [{ claimDomain: domain,
      claimSequence: '0', intentCount: String(controls.intents.length), ticketCount: String(controls.tickets.length), reservedRefundTickets: String(controls.intents.filter(row => row.state === '1').length),
      nextTicketNonce: String(controls.tickets.length), wrapperSupply: controls.liability,
      pendingRedemptions: controls.tickets.filter(row => row.state !== '4' && row.ticket.kind === '1').reduce((n,row) => n + BigInt(row.ticket.amount),0n).toString(),
      pendingRefunds: controls.tickets.filter(row => row.state !== '4' && row.ticket.kind === '2').reduce((n,row) => n + BigInt(row.ticket.amount),0n).toString(),
      heldUnissued: controls.intents.filter(row => row.state === '1').reduce((sum, row) => sum + BigInt(row.amount), 0n).toString(),
      reservedFees: String(BigInt(config.refundMaxFee) * BigInt(controls.intents.filter(row => row.state === '1').length + controls.tickets.filter(row => row.state !== '4').length)), activePayout: controls.activePayout,
      intents: copy(controls.intents), tickets: copy(controls.tickets), revocationState: sha('revocation'), healthState, poolHeadroom: true }] };
  }
  const claimIssued = new WeakSet();
  const observer = Object.freeze({ async read() {
      await controls.beforeClaimRead?.(); const value = frozen(claimView()); claimIssued.add(value);
      controls.claimViews.push(value); controls.claimReads.push(copy(value.head)); return value;
    },
    async assertCurrent(value) {
      assert.ok(claimIssued.has(value), 'TEST_ORIGINAL_CLAIM_VIEW_REQUIRED'); controls.claimCurrentViews.push(value);
      await controls.beforeClaimCurrent?.(value); assert.ok(!controls.claimCurrentFailure, 'TEST_CLAIM_CURRENT_VALIDATION_FAILED');
      assert.deepEqual(value, claimView(), 'TEST_CLAIM_HEAD_CHANGED');
    },
    async readReservation(request, view) { assert.deepEqual(view, claimView()); assert.equal(request.claimDomain, domain);
      return copy(controls.reservations.get(request.admissionN) ?? null); },
    async assertUnrevoked(request, value) { assert.deepEqual(value, claimView()); assert.equal(controls.revoked, false, 'TEST_PAYOUT_REVOKED'); } });
  owned.observers.set(observer, { runtime, system: { flatSystem: system }, registry, configs: [config],
    policies: [{ ledgerNamespace: registry.hubDomain, hubDomain: registry.hubDomain, registryCommitment, rule }],
    nativeRuntimes: [custody], journalRoot: runtime.metadata.scratchDirectory });
  const binding = { runtime, system, bitcoin: graph, solana: null,
    rules: [rule], rulePaths: tree.paths };
  return { pairs, controls, runtime, system, registry, config, observer, binding, graph, custody, domain, head, view,
    async bind(count = 3) {
      for (const pair of pairs.slice(0, count)) { await pair.claim.bind(observer); await pair.graph.bind(binding); }
      return { claim: createClaimOperatorQuorum({ operators: pairs.slice(0, 3).map(pair => pair.claim) }),
        graph: createFlatOperatorQuorum({ operators: pairs.slice(0, 3).map(pair => pair.graph) }) };
    },
    addGraphFact() {
      const wireKeyCommitment = sha('graph-K'), intent = bitcoinIntent({ sourceScript: graphSource,
        recipientScript: endpoint('graph-recipient-0'), wireKeyCommitment, tag: 'graph' });
      const wire = witnessSyntax(intent, NATIVE_PUBLIC_KEYS.graph), nativeId = wire.txid;
      observations.set(nativeId, observedSyntax(rule, wire, intent));
      return { family, recipientIndex: '0', nativeId, wireKeyCommitment };
    },
    async addClaimFact() {
      const seq = controls.intents.length, receiptSecret = sha('claim-secret-' + seq), wireSalt = sha('claim-salt-' + seq), amount = '12345', output = sha('claim-Q-' + seq);
      const operationId = claimIntentId({ claimDomain: domain, outputQ: output, amount });
      const wireKeyCommitment = receiptKeyCommitment({ ledgerNamespace: config.ledgerNamespace, secret: receiptSecret });
      const intent = bitcoinIntent({ sourceScript: roles.depositor.endpoint, recipientScript: roles.escrow.endpoint,
        wireKeyCommitment, tag: 'deposit-' + seq });
      const wire = witnessSyntax(intent, NATIVE_PUBLIC_KEYS.depositor), nativeId = wire.txid;
      const request = { family, recipientIndex: '0', nativeId, wireKeyCommitment };
      const binding = createClaimReservationBinding({ claimDomain: domain, gateway: config.gateway,
        ledgerNamespace: config.ledgerNamespace, genesis: config.nativeGenesis, asset: config.nativeAsset,
        operationId, revision: '1', ingress: true, receiptSecret, wireSalt, nativeWire: wire.rawTransaction, intent, request });
      controls.intents.push({ id: operationId, state: '1', output, amount, validFrom: '990', validUntil: '1030', revision: '1',
        proofHash: sha('synthetic-proof-label-only'), nullifier: binding.admissionN, refundDestination: sha('claim-refund') });
      controls.principal = String(BigInt(controls.principal) + BigInt(amount));
      claimTransfers.push({ txid: nativeId, rawTransaction: wire.rawTransaction, intent, route: 'deposit', recipientIndex: 0,
        phase: 'OBSERVED_CONFIRMED', broadcastAttempts: 1, actualFee: '5000' });
      claimObservations.set(nativeId, observedSyntax(rule, wire, intent));
      controls.reservations.set(binding.admissionN, { gateway: config.gateway, operationId, revision: '1',
        wireBindingCommitment: binding.wireBindingCommitment, ingress: true, consumed: false });
      advanceState();
      for (const pair of pairs) await pair.claim.retainSignedEffect({ claimDomain: domain, operationId, receiptSecret, wireSalt, nativeId });
      return request;
    },
    preparePayout(kind = '1') {
      const old = controls.intents[0]; assert.ok(old); old.state = kind === '1' ? '2' : '3';
      const ticketId = claimTicketId({ claimDomain: domain, kind, nonce: '0' });
      const secret = claimTicketSecret({ claimDomain: domain, ticketId });
      const routeName = kind === '2' ? 'refund' : 'redeem';
      const route = { endpoint: roles[kind === '2' ? 'depositor' : 'recipient'].endpoint, salt: sha('payout-route'),
        quotedFee: '5000', selectedInputValue: coin().amount, changeFloor: '546', destinationFunded: false };
      const nativeChainDomain = claimHash(claimFrame('LIANUM/evidence-chain/1', [Buffer.from('BTC'), Buffer.from(rule.genesis, 'hex'), Buffer.from(rule.asset, 'hex')]));
      const ticket = { kind, id: ticketId, claimDomain: domain, amount: old.amount, maxFee: '5000',
        destinationCommitment: claimDestinationCommitment({ claimDomain: domain, nativeChainDomain,
          endpoint: nativeClaimEndpointCommitment({ family, genesis: rule.genesis, asset: rule.asset, endpoint: route.endpoint }),
          amount: old.amount, maxFee: '5000', salt: route.salt }),
        referenceIngressN: kind === '2' ? old.nullifier : ZERO, referenceQ: kind === '2' ? old.output : ZERO };
      const row = { ticket, state: '1', payoutRouteCommitment: ZERO }; controls.tickets.push(row); advanceState();
      const intent = { sourceTxid: coin().txid, sourceVout: coin().vout, sourceScript: roles.escrow.endpoint,
        sourceSatoshi: coin().amount, recipientScript: route.endpoint, amountSatoshi: ticket.amount,
        changeScript: roles.escrow.endpoint, feeSatoshi: '5000',
        wireKeyCommitment: receiptKeyCommitment({ ledgerNamespace: config.ledgerNamespace, secret }) };
      const prepared = frozen({ genesis: rule.genesis, intent, unsignedWire: encodeBitcoinBinding(intent), funds: { feeSatoshi: '5000' } });
      controls.originalPrepared = prepared; controls.preparedRoute = routeName;
      const request = { claimDomain: domain, ticketId, prepared, route, wireSalt: sha('payout-wire-salt') };
      const terms = action => ({ action, operationId: ticketId, revision: '1', amount: ticket.amount,
        destinationCommitment: ticket.destinationCommitment, maxFee: '5000', routeCommitment: claimRouteCommitment(route),
        nullifier: ZERO, wireBindingCommitment: ZERO, claimSequence: '0', hubSequence: '0' });
      let binding, nativeId;
      return { request, prepared, ticket, routeName,
        begin: { claimDomain: domain, terms: terms(CLAIM_ACTIONS.BEGIN_PAYOUT), route, ownerAuthorization: null, prepared },
        beginIncluded() { row.state = '2'; row.payoutRouteCommitment = claimRouteCommitment(route); controls.activePayout = ticketId; advanceState(); },
        async retain() {
          const wire = witnessSyntax(intent, NATIVE_PUBLIC_KEYS.escrow); nativeId = wire.txid;
          const nativeWire = wire.rawTransaction, spec = ownedCustodyRoute(routeName);
          claimTransfers.push({ txid: nativeId, rawTransaction: nativeWire, intent: copy(intent), route: routeName,
            recipientIndex: spec.recipientIndex, phase: 'SIGNED_NOT_BROADCAST', broadcastAttempts: 0, actualFee: null });
          binding = createClaimReservationBinding({ claimDomain: domain, gateway: config.gateway, ledgerNamespace: config.ledgerNamespace,
            genesis: rule.genesis, asset: rule.asset, operationId: ticketId, revision: '1', ingress: false, receiptSecret: secret,
            wireSalt: request.wireSalt, nativeWire, intent,
            request: { family, recipientIndex: String(spec.recipientIndex), nativeId, wireKeyCommitment: intent.wireKeyCommitment } });
          const results = [];
          for (const pair of pairs) results.push(await pair.claim.retainSignedEffect({ claimDomain: domain, operationId: ticketId,
            receiptSecret: secret, wireSalt: request.wireSalt, nativeId }));
          results.forEach(value => assert.deepEqual(value, results[0]));
          return { claimDomain: domain, terms: { ...terms(CLAIM_ACTIONS.RESERVE_PAYOUT), nullifier: binding.admissionN,
            wireBindingCommitment: binding.wireBindingCommitment }, route, ownerAuthorization: null };
        },
        reserved() { controls.reservations.set(binding.admissionN, { gateway: config.gateway, operationId: ticketId, revision: '1',
          wireBindingCommitment: binding.wireBindingCommitment, ingress: false, consumed: false }); advanceState(); return { ...request, nativeId }; },
      };
    },
    claimStore(index = 0) { return records.get(runtime.metadata.scratchDirectory + '/claim-operator-' + index + '.v3'); },
    graphStore(index = 0) { return records.get(runtime.metadata.scratchDirectory + '/flat-operator-' + index + '.v3'); },
  };
}
const causedBy = regex => error => { for (let e = error; e; e = e.cause) if (regex.test(e.message)) return true; return false; };

async function loadedPayout(t, kind = '1') {
  const f = fixture(t), q = await f.bind(4);
  for (let i = 0; i < 3; i++) await f.addClaimFact();
  await q.graph.facts(f.addGraphFact());
  f.controls.exclusiveNativeReads = true;
  return { f, q, p: f.preparePayout(kind) };
}
function readMark(f) { return { preparations: f.controls.preparedCalls.length, reads: f.controls.nativeReadEvents.length,
  graph: f.controls.graphReads.length, inventory: f.controls.inventoryReads }; }
function assertOwnReads(f, before, { prepared = 0, graph = 12 } = {}) {
  const events = f.controls.nativeReadEvents.slice(before.reads), starts = events.filter(row => row.phase === 'start');
  assert.equal(f.controls.nativeReadCollisions, 0); assert.equal(f.controls.nativeReadBusy, false);
  assert.equal(f.controls.preparedCalls.length - before.preparations, prepared);
  assert.equal(f.controls.inventoryReads - before.inventory, 3);
  assert.equal(starts.filter(row => row.kind === 'claim-observation').length, 9);
  assert.equal(f.controls.graphReads.length - before.graph, graph);
  assert.equal(starts.length * 2, events.length);
  for (let i = 0; i < events.length; i += 2) {
    assert.equal(events[i].phase, 'start'); assert.equal(events[i + 1].phase, 'end');
    assert.equal(events[i].kind, events[i + 1].kind);
  }
  const snapshots = f.controls.inventorySnapshots.slice(-3);
  assert.equal(new Set(snapshots).size, 3, 'separate native snapshots for every selected actor');
  for (const snapshot of snapshots.slice(1)) assert.deepEqual(snapshot, snapshots[0]);
}
function authorizationCounts(f) { return f.pairs.map((_, i) => f.claimStore(i).data.authorizations.length); }
// Failed reciprocal gates may retain unsigned write-ahead intents; these are not authority.
function signedAuthorizationCounts(f) { return f.pairs.map((_, i) => f.claimStore(i).data.authorizations.filter(row => row.signature).length); }
function verifyPermit(f, permit, codec = claimBackingFrame) {
  assert.deepEqual(permit.indexes, [0, 1, 2]); assert.equal(permit.independentOperators, false);
  const verifier = createNativeQuorumHostVerifier({ registry: f.registry, expectedRegistryCommitment: f.config.registryCommitment });
  verifier.assertQuorumForMessage({ messageBytes: codec(permit.message), indexes: permit.indexes, signatures: permit.signatures });
}

async function reservedPayout(t, kind = '1') {
  const { f, q, p } = await loadedPayout(t, kind);
  const backing = await q.claim.backing(p.begin); p.beginIncluded();
  const presign = await q.claim.authorizePayout(p.request);
  const reservationRequest = await p.retain(), reservation = await q.claim.reservation(reservationRequest);
  const beforeReservationHead = copy(f.head), request = p.reserved();
  assert.equal(BigInt(f.head.number), BigInt(beforeReservationHead.number) + 1n, 'fixture advances canonical included-RESERVE head');
  assert.notEqual(f.head.hash, beforeReservationHead.hash);
  return { f, q, p, request, backing, presign, reservation, beforeReservationHead };
}
const signedBroadcastCounts = f => f.pairs.map((_, i) => f.claimStore(i).data.authorizations
  .filter(row => row.kind === 'broadcast-bitcoin-payout-v1' && row.signature).length);
const keyMark = f => ({ attester: attesterKeyUses, facts: factsKeyUses,
  signed: signedAuthorizationCounts(f), attempts: f.custody.transfers.at(-1).broadcastAttempts });
function assertNoNewAuthority(f, mark) {
  assert.equal(attesterKeyUses, mark.attester, 'no attester key reuse');
  assert.equal(factsKeyUses, mark.facts, 'no facts key reuse');
  assert.deepEqual(signedAuthorizationCounts(f), mark.signed, 'no replacement signed authorization');
  assert.equal(f.custody.transfers.at(-1).broadcastAttempts, mark.attempts, 'no native broadcast side effect');
  assert.equal(f.controls.nativeReadBusy, false); assert.equal(f.controls.nativeReadCollisions, 0);
}
async function rejectOriginal(q, original, request, pattern) {
  await assert.rejects(async () => assertOriginalBitcoinPayoutBroadcastAuthorization(q, original, request), pattern);
}

test('BTC redeem and refund collect distinct final-send authority at the included RESERVE head with full independent custody and graph audits', async t => {
  t.mock.method(performance, 'now', () => 0);
  for (const kind of ['1', '2']) {
    const { f, q, p, request, reservation } = await reservedPayout(t, kind), mark = readMark(f);
    assert.equal(q.claim.bitcoinPayoutBroadcastProfile, 'CLAIM_BITCOIN_PAYOUT_BROADCAST_V1');
    const original = await q.claim.authorizeBitcoinBroadcast(request);
    const preparationReads = f.controls.preparedCalls.length - mark.preparations;
    assert.ok(preparationReads >= 6, 'each selected actor checks original preparation before and after signing');
    assertOwnReads(f, mark, { prepared: preparationReads });
    verifyPermit(f, original, claimBitcoinPayoutBroadcastFrame);
    assert.deepEqual(original.head, f.head);
    assert.notDeepEqual(original.head, reservation.head, 'pre-RESERVE certificate cannot be reused');
    assert.equal(original.message.ticketId, p.ticket.id);
    assert.equal(original.message.amount, p.ticket.amount);
    assert.equal(original.message.claimDomain, f.domain);
    assert.equal(BigInt(original.message.validUntil) - BigInt(original.message.validFrom), 30n);
    assert.deepEqual(signedBroadcastCounts(f), [1, 1, 1, 0]);
    assert.ok(Object.isFrozen(original) && Object.isFrozen(original.message));
    const keyUse = keyMark(f);
    await assertOriginalBitcoinPayoutBroadcastAuthorization(q.claim, original, request);
    assertNoNewAuthority(f, keyUse);
    assert.equal(f.custody.transfers.at(-1).phase, 'SIGNED_NOT_BROADCAST');
    assert.equal(f.custody.transfers.at(-1).broadcastAttempts, 0);
    for (const i of [0, 1, 2]) {
      const state = f.claimStore(i).data;
      assert.equal(state.bindings.length, 4, 'all three ingress histories plus exact original payout remain retained');
      assert.equal(state.bindings.filter(row => !row.ingress).length, 1);
      assert.ok(state.inventoryAudits.length > 0);
      const signed = state.authorizations.find(row => row.kind === 'broadcast-bitcoin-payout-v1' && row.signature);
      assert.deepEqual(signed.message, original.message);
    }
  }
});

test('BTC authority signatures reject SOL payout purpose and BTC requests cannot enter the SOL-only broadcast method', async t => {
  t.mock.method(performance, 'now', () => 0);
  const { f, q, request } = await reservedPayout(t), mark = keyMark(f);
  await assert.rejects(q.claim.authorizeBroadcast(request), /CLAIM_NONCE_BROADCAST_SOL_ONLY/);
  assertNoNewAuthority(f, mark);
  const original = await q.claim.authorizeBitcoinBroadcast(request);
  const verifier = createNativeQuorumHostVerifier({ registry: f.registry, expectedRegistryCommitment: f.config.registryCommitment });
  assert.notDeepEqual(claimBitcoinPayoutBroadcastFrame(original.message), claimPayoutBroadcastFrame(original.message));
  assert.throws(() => verifier.assertQuorumForMessage({ messageBytes: claimPayoutBroadcastFrame(original.message),
    indexes: original.indexes, signatures: original.signatures }));
  const after = keyMark(f);
  assert.throws(() => bridge.signCombinedClaimAuthorization({}, 'broadcast-bitcoin-payout-v1', original.message), /PRIVATE_CUSTODY_REQUIRED/);
  assertNoNewAuthority(f, after);
});

test('BTC original final-send validator rejects clones, counterfeits, prior-purpose permits and another genuine quorum', async t => {
  t.mock.method(performance, 'now', () => 0);
  const { f, q, request, backing, presign, reservation } = await reservedPayout(t);
  const original = await q.claim.authorizeBitcoinBroadcast(request), mark = keyMark(f);
  for (const counterfeit of [copy(original), { ...original }, {}, backing, presign, reservation,
    { ...copy(original), message: { ...copy(original.message), ticketId: sha('counterfeit-ticket') } }])
    await rejectOriginal(q.claim, counterfeit, request);
  const another = createClaimOperatorQuorum({ operators: f.pairs.slice(0, 3).map(pair => pair.claim) });
  await rejectOriginal(another, original, request);
  await rejectOriginal({ ...q.claim }, original, request);
  assertNoNewAuthority(f, mark);
});

test('BTC final-send request pins exact native ID, wire, route, ticket, domain and prepared fee before new key use', async t => {
  t.mock.method(performance, 'now', () => 0);
  const { f, q, request } = await reservedPayout(t, '2');
  const changes = {
    nativeId: r => { r.nativeId = sha('different-native-id'); },
    wireSalt: r => { r.wireSalt = sha('different-wire-salt'); },
    unsignedWire: r => { r.prepared.unsignedWire += '00'; },
    sourceOutpoint: r => { r.prepared.intent.sourceVout = '1'; },
    recipient: r => { r.prepared.intent.recipientScript = f.custody.roles.recipient.endpoint; },
    routeEndpoint: r => { r.route.endpoint = f.custody.roles.recipient.endpoint; },
    routeSalt: r => { r.route.salt = sha('different-route-salt'); },
    selectedInput: r => { r.route.selectedInputValue = '10000000'; },
    preparedFee: r => { r.prepared.funds.feeSatoshi = '4999'; },
    ticket: r => { r.ticketId = sha('different-ticket'); },
    domain: r => { r.claimDomain = sha('different-domain'); },
    extraField: r => { r.authorize = true; },
  };
  for (const [label, mutate] of Object.entries(changes)) {
    const altered = copy(request); mutate(altered); const mark = keyMark(f);
    await assert.rejects(q.claim.authorizeBitcoinBroadcast(altered), undefined, label);
    assertNoNewAuthority(f, mark);
  }
  const original = await q.claim.authorizeBitcoinBroadcast(request), mark = keyMark(f);
  for (const [label, mutate] of Object.entries(changes)) {
    const altered = copy(request); mutate(altered);
    await rejectOriginal(q.claim, original, altered);
  }
  assertNoNewAuthority(f, mark);
});

test('BTC exact reservation must be present, unconsumed, unrevoked and bound to the original wire', async t => {
  t.mock.method(performance, 'now', () => 0);
  for (const fault of ['missing', 'consumed', 'revoked', 'wire-binding', 'gateway', 'operation', 'revision', 'ingress']) {
    const { f, q, request } = await reservedPayout(t), binding = f.claimStore().data.bindings.find(row => !row.ingress);
    const reservation = f.controls.reservations.get(binding.admissionN);
    if (fault === 'missing') f.controls.reservations.set(binding.admissionN, null);
    if (fault === 'consumed') reservation.consumed = true;
    if (fault === 'revoked') f.controls.revoked = true;
    if (fault === 'wire-binding') reservation.wireBindingCommitment = sha('different-reserved-wire');
    if (fault === 'gateway') reservation.gateway = sha('different-gateway').slice(0, 40);
    if (fault === 'operation') reservation.operationId = sha('different-reserved-ticket');
    if (fault === 'revision') reservation.revision = '2';
    if (fault === 'ingress') reservation.ingress = true;
    const mark = keyMark(f); await assert.rejects(q.claim.authorizeBitcoinBroadcast(request), undefined, fault);
    assertNoNewAuthority(f, mark);
  }
});

test('BTC prior native attempt, unknown phase, changed signed wire and unknown signing status cannot receive final-send authority', async t => {
  t.mock.method(performance, 'now', () => 0);
  for (const fault of ['attempt-one', 'unknown', 'observed', 'raw-wire', 'unresolved']) {
    const { f, q, request } = await reservedPayout(t, '2');
    if (fault === 'attempt-one') f.controls.changeLastTransfer({ broadcastAttempts: 1 });
    if (fault === 'unknown') f.controls.changeLastTransfer({ phase: 'BROADCAST_UNKNOWN' });
    if (fault === 'observed') f.controls.changeLastTransfer({ phase: 'OBSERVED_CONFIRMED', actualFee: '5000' });
    if (fault === 'raw-wire') f.controls.changeLastTransfer({ rawTransaction: f.custody.transfers.at(-1).rawTransaction + '00' });
    if (fault === 'unresolved') f.controls.unresolved = true;
    const mark = keyMark(f); await assert.rejects(q.claim.authorizeBitcoinBroadcast(request), undefined, fault);
    assertNoNewAuthority(f, mark);
  }
});

test('BTC complete post-reservation audit rejects changed native preparation, UTXO, retained graph and backing principal', async t => {
  t.mock.method(performance, 'now', () => 0);
  for (const fault of ['preparation', 'utxo', 'unsafe-utxo', 'principal', 'claim-unknown', 'graph-unknown', 'graph-adverse', 'head']) {
    const { f, q, p, request } = await reservedPayout(t);
    if (fault === 'preparation') f.controls.originalPrepared = { ...p.prepared, unsignedWire: p.prepared.unsignedWire + '00' };
    if (fault === 'utxo') f.controls.coinChange = { txid: sha('replacement-native-utxo') };
    if (fault === 'unsafe-utxo') f.controls.coinChange = { safe: false };
    if (fault === 'principal') f.controls.principal = '0';
    if (fault === 'claim-unknown') f.controls.claimUnavailable = true;
    if (fault === 'graph-unknown') f.controls.graphUnavailable = true;
    if (fault === 'graph-adverse') f.controls.graphAdverse = true;
    if (fault === 'head') f.controls.claimHead = { ...f.head, hash: sha('claim-fork') };
    const mark = keyMark(f); await assert.rejects(q.claim.authorizeBitcoinBroadcast(request), undefined, fault);
    assertNoNewAuthority(f, mark);
    if (fault === 'graph-adverse') assert.ok(Object.keys(f.graphStore().data.adverse).length > 0);
  }
});

test('BTC late native preparation, UTXO, head or current-read failure after key use withholds final-send authority', async t => {
  t.mock.method(performance, 'now', () => 0);
  for (const fault of ['preparation', 'utxo', 'head', 'current-read']) {
    const { f, q, p, request } = await reservedPayout(t); let tripped = false;
    f.controls.beforePrepared = () => {
      if (tripped || !signedBroadcastCounts(f).some(Boolean)) return;
      tripped = true;
      if (fault === 'preparation') f.controls.originalPrepared = { ...p.prepared, unsignedWire: p.prepared.unsignedWire + '00' };
      if (fault === 'utxo') f.controls.coinChange = { txid: sha('late-utxo') };
      if (fault === 'head') f.head.hash = sha('late-head');
      if (fault === 'current-read') f.controls.claimCurrentFailure = true;
    };
    const keys = attesterKeyUses;
    await assert.rejects(q.claim.authorizeBitcoinBroadcast(request), undefined, fault);
    assert.equal(tripped, true); assert.ok(attesterKeyUses > keys);
    assert.equal(f.custody.transfers.at(-1).broadcastAttempts, 0);
    assert.equal(f.controls.nativeReadBusy, false); assert.equal(f.controls.nativeReadCollisions, 0);
    const affected = signedBroadcastCounts(f).flatMap((count, index) => count ? [index] : []);
    assert.ok(affected.length > 0);
    for (const index of affected) assert.equal(f.pairs[index].claim.status().poisoned, true, fault + '/affected signer ' + index);
  }
});

test('BTC original final-send authority cannot outlive a selected combined operator', async t => {
  t.mock.method(performance, 'now', () => 0);
  for (const index of [0, 1, 2]) {
    const { f, q, request } = await reservedPayout(t), original = await q.claim.authorizeBitcoinBroadcast(request);
    const mark = keyMark(f); f.pairs[index].graph.close();
    assert.equal(f.pairs[index].claim.status().closed, true);
    await rejectOriginal(q.claim, original, request);
    assertNoNewAuthority(f, mark);
  }
});

test('BTC original final-send age accepts 29999 ms and rejects the original 30000 ms without restarting its clock', async t => {
  let now = 0; t.mock.method(performance, 'now', () => now);
  const { f, q, request } = await reservedPayout(t);
  now = 1000;
  f.controls.beforeClaimCurrent = () => { if (signedBroadcastCounts(f).every((count, i) => i === 3 || count > 0)) now = 11000; };
  const original = await q.claim.authorizeBitcoinBroadcast(request);
  f.controls.beforeClaimCurrent = null;
  assert.equal(now, 11000, 'ten synthetic seconds elapsed during collection');
  const mark = keyMark(f);
  now = 30999; await assertOriginalBitcoinPayoutBroadcastAuthorization(q.claim, original, request);
  assertNoNewAuthority(f, mark);
  now = 31000; await rejectOriginal(q.claim, original, request, /TOO_OLD|EXPIRED/);
  assertNoNewAuthority(f, mark);
  now = 31001; await rejectOriginal(q.claim, original, request, /TOO_OLD|EXPIRED/);
  assertNoNewAuthority(f, mark);
  for (const invalidClock of [999, Number.NaN, Number.POSITIVE_INFINITY]) {
    now = invalidClock; await rejectOriginal(q.claim, original, request, /TOO_OLD|EXPIRED/);
    assertNoNewAuthority(f, mark);
  }
  now = 31001;
});

test('BTC final-send collection still rejects its exact 30000 ms whole-quorum budget after signatures', async t => {
  let now = 0; t.mock.method(performance, 'now', () => now);
  const { f, q, request } = await reservedPayout(t);
  f.controls.beforeClaimCurrent = () => { if (signedBroadcastCounts(f).some(Boolean)) now = 30000; };
  const keys = attesterKeyUses;
  await assert.rejects(q.claim.authorizeBitcoinBroadcast(request), causedBy(/AUDIT_TOO_OLD/));
  assert.ok(attesterKeyUses > keys);
  assert.equal(f.custody.transfers.at(-1).broadcastAttempts, 0);
  for (const [index, count] of signedBroadcastCounts(f).entries())
    if (count) assert.equal(f.pairs[index].claim.status().poisoned, true);
});


test('BTC collection captures the exact request before awaits and caller mutation cannot substitute broadcast bytes', async t => {
  t.mock.method(performance, 'now', () => 0);
  const { f, q, request } = await reservedPayout(t), raw = copy(request), captured = copy(raw);
  const pending = q.claim.authorizeBitcoinBroadcast(raw);
  raw.nativeId = sha('caller-mutated-id'); raw.wireSalt = sha('caller-mutated-salt');
  raw.prepared.unsignedWire = '00'; raw.prepared.intent.sourceVout = '1';
  raw.route.endpoint = f.custody.roles.depositor.endpoint;
  const original = await pending, mark = keyMark(f);
  await assertOriginalBitcoinPayoutBroadcastAuthorization(q.claim, original, captured);
  await rejectOriginal(q.claim, original, raw);
  await assert.rejects(async () => assertOriginalBitcoinPayoutBroadcastAuthorization(q.claim, original, captured, {}), /NO_OPTIONS/);
  assertNoNewAuthority(f, mark);
});

test('BTC final common-view await cannot publish authority after all signers finish if head, operator life or original deadline changes', async t => {
  let now = 0; t.mock.method(performance, 'now', () => now);
  for (const fault of ['operator-death', 'head', 'deadline']) {
    now = 0;
    const { f, q, request } = await reservedPayout(t), commonViewIndex = f.controls.claimViews.length;
    let tripped = false;
    f.controls.beforeClaimCurrent = view => {
      if (view !== f.controls.claimViews[commonViewIndex]) return;
      assert.deepEqual(signedBroadcastCounts(f), [1, 1, 1, 0], 'all selected signers completed before final common-view await');
      tripped = true;
      if (fault === 'operator-death') f.pairs[0].graph.close();
      if (fault === 'head') f.head.hash = sha('post-signers-final-head');
      if (fault === 'deadline') now = 30000;
    };
    await assert.rejects(q.claim.authorizeBitcoinBroadcast(request), undefined, fault);
    assert.equal(tripped, true);
    assert.equal(f.custody.transfers.at(-1).broadcastAttempts, 0);
    assert.equal(f.controls.nativeReadBusy, false); assert.equal(f.controls.nativeReadCollisions, 0);
  }
});


test('BTC persisted first-send authority cannot be reissued or regain a fresh clock through the same or a new genuine quorum', async t => {
  let now = 0; t.mock.method(performance, 'now', () => now);
  const { f, q, request } = await reservedPayout(t), original = await q.claim.authorizeBitcoinBroadcast(request);
  const another = createClaimOperatorQuorum({ operators: f.pairs.slice(0, 3).map(pair => pair.claim) });
  const mark = keyMark(f), counts = authorizationCounts(f);
  for (const at of [0, 30000]) {
    now = at;
    for (const quorum of [q.claim, another]) {
      await assert.rejects(quorum.authorizeBitcoinBroadcast(request), /CLAIM_BITCOIN_BROADCAST_ALREADY_AUTHORIZED/);
      assertNoNewAuthority(f, mark);
      assert.deepEqual(authorizationCounts(f), counts, 'no unsigned or signed authorization append on replay');
    }
  }
  await rejectOriginal(q.claim, original, request, /TOO_OLD/);
  assertNoNewAuthority(f, mark);
});
