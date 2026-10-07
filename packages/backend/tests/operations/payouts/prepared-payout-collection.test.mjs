/** V3 candidate tests; byte-for-byte historical tests remain in baseline.
 * Focused source-only composition tests. Explicit mocked ownership/current
 * views and in-memory durable stores replace deployments. Constructors, brands,
 * full claim accounting/inventory audits, codecs, signatures, ECDSA recovery and
 * quorum verification are real. No node, contracts, proof, network or funds. */
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { publicKeccak256 } from '../../../../engine/src/cohorts/private-cohort-public-native.mjs';
import { nativeAdmissionRulesTree } from '../../../../engine/src/execution/native/dispatch/native-admission.mjs';
import { checkpointAuthorizationDigest, checkpointAuthorizationFrame, revocationMessage }
  from '../../../../engine/src/evidence/native-hub-messages.mjs';
import { createNativeQuorumHostVerifier } from '../../../../engine/src/evidence/native-quorum.mjs';
import { FACTS_QUORUM_PROFILE, nativeFactsRegistryCommitment } from '../../../src/chains/shared/dispatch/native-facts-peer.mjs';
import { nativeRuleCommitment, encodeSolanaBindingMessage, receiptKeyCommitment } from '../../../src/chains/shared/dispatch/native-receipt-binding.mjs';
import { recoverSecp256k1Sender } from '../../../src/chains/evm/runtime/owned-evm-v2-runtime.mjs';
import { encodeFlatNativeHealth, flatNativeHealthDigest } from '../../../src/chains/shared/health/native-health.mjs';
import { ownedCustodyRoute, ownedCustodyFeeAudit } from '../../../src/chains/shared/runtime/owned-native-custody.mjs';
import { CLAIM_CONFIG_SCHEMA, claimDomainCommitment, claimIntentId, claimTicketId, claimTicketSecret, nativeClaimEndpointCommitment,
  claimDestinationCommitment } from '../../../src/claims/protocol/framing.mjs';
import { CLAIM_ACTIONS, claimHash, claimBackingFrame, claimFrame, claimRouteCommitment } from '../../../src/claims/authorization/permits.mjs';
import { createClaimReservationBinding } from '../../../src/claims/authorization/reservation-facts-gate.mjs';
import * as originalFactsPeer from '../../../src/chains/shared/dispatch/native-facts-peer.mjs';
import * as originalNoteEncoding from '../../../../engine/src/notes/private-note-encoding.mjs';

import { encodeSolanaNonceBindingMessage } from '../../../src/chains/solana/runtime/owned-solana-nonce-binding.mjs';

const sha = value => createHash('sha256').update(value).digest('hex'), copy = value => structuredClone(value);
const frozen = value => { if (value && typeof value === 'object') { Object.values(value).forEach(frozen); Object.freeze(value); } return value; };
const prefix = value => '0x' + value, word = value => BigInt(value).toString(16).padStart(64, '0'), ZERO = word(0);
const url = path => new URL(path, import.meta.url).href;
const owned = { runtimes: new WeakMap(), systems: new WeakMap(), natives: new WeakSet(), observers: new WeakMap() };
const records = new Map(); let serial = 0;
let attesterKeyUses = 0, factsKeyUses = 0, onKeyUse = null;
const observedFactsSigner = create => input => {
  const signer = create(input);
  return Object.freeze({ publicKey: signer.publicKey, signFacts(facts) {
    factsKeyUses++; onKeyUse?.('facts', facts); return signer.signFacts(facts);
  } });
};
mock.module(url('../chain-adapters/native-facts-peer.mjs'), { exports: { ...originalFactsPeer,
  createNativeFactsSigner: observedFactsSigner(originalFactsPeer.createNativeFactsSigner),
  createNativeClaimFactsSigner: observedFactsSigner(originalFactsPeer.createNativeClaimFactsSigner),
} });
mock.module(url('../../../../../omnichain-product/src/private-note-encoding.mjs'), { exports: { ...originalNoteEncoding,
  signature(...args) { attesterKeyUses++; onKeyUse?.('authorization', args[1]); return originalNoteEncoding.signature(...args); },
} });
mock.module(url('../chain-adapters/local-evm-ownership.mjs'), { exports: {
  async assertLocalEvm(runtime) { assert.ok(owned.runtimes.has(runtime), 'TEST_OWNED_RUNTIME'); },
} });
mock.module(url('./deploy-system.mjs'), { exports: {
  assertOwnedFlatSystem(runtime, system) { assert.equal(owned.systems.get(system), runtime, 'TEST_OWNED_SYSTEM'); },
} });
mock.module(url('../chain-adapters/owned-solana-runtime.mjs'), { exports: {
  SOLANA_NONCE_INGRESS_PROFILE: 'LIANUM_GENERIC_NATIVE_CLAIM_INGRESS_V3',
  assertOwnedSolanaRuntime(native) { assert.ok(owned.natives.has(native), 'TEST_OWNED_NATIVE'); },
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
const bridge = await import('../../../src/operations/operators/claims/combined-native-operators.mjs');
const { createCombinedLocalNativeOperator } = bridge;
const { createFlatOperatorQuorum, assertOwnedFlatOperatorQuorum, createScopedFlatOperator, createLocalFlatOperator } = await import('../../../src/operations/operators/claims/native-operators.mjs');
const { createClaimOperatorQuorum, assertOwnedClaimOperatorQuorum, createScopedClaimOperator, createLocalClaimOperator } = await import('../../../src/claims/operations/operators.mjs');

function fixture(t, { family = '2', sameNode = true, standalone = false } = {}) {
  const id = ++serial, pairs = [0, 1, 2, 3].map(signerIndex => standalone
    ? { claim: createLocalClaimOperator({ signerIndex }), graph: createLocalFlatOperator({ signerIndex }) }
    : createCombinedLocalNativeOperator({ signerIndex }));
  t.after(() => { pairs.forEach(pair => { pair.claim.close(); pair.graph.close(); });
    for (const path of records.keys()) if (path.startsWith('/combined-test-' + id + '/')) records.delete(path); });
  const rule = { family, genesis: family === '1' ? '0f9188f13cb7b2c71f2a335e3a4fc328bf5beb436012afca590b1a11466e2206' : sha('genesis'),
    asset: sha('asset'), finalityKind: family, minimumConfirmations: family === '1' ? '6' : '0',
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
    claimViews: [], claimCurrentViews: [], beforeClaimRead: null, beforeClaimCurrent: null, claimCurrentFailure: false };
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
  const runtime = Object.freeze({ metadata: { scratchDirectory: '/combined-test-' + id, evmGenesis: prefix(sha('evm')) },
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
  const endpoint = name => family === '1' ? '0014' + sha(name).slice(0, 40) : sha(name);
  const payoutSigner = generateKeyPairSync('ed25519');
  const payoutSource = Buffer.from(payoutSigner.publicKey.export({ format: 'jwk' }).x, 'base64url').toString('hex');
  const claimSigner = generateKeyPairSync('ed25519');
  const claimSource = Buffer.from(claimSigner.publicKey.export({ format: 'jwk' }).x, 'base64url').toString('hex');
  const roles = Object.fromEntries(['depositor', 'escrow', 'recipient'].map(role => [role,
    { endpoint: family === '2' && role === 'depositor' ? claimSource : family === '2' && role === 'escrow' ? payoutSource : endpoint(role), address: 'owned-' + role }]));
  const config = { ...Object.fromEntries(CLAIM_CONFIG_SCHEMA.map(([name, type]) => [name,
    type === 'address' ? sha(name).slice(0, 40) : type === 'field32' ? '01' + sha(name).slice(2)
      : type === 'u256' ? '31337' : type === 'u64' ? '5000' : type === 'u8' ? '2' : sha(name)])),
    hubDomain: registry.hubDomain, ledgerNamespace: registry.hubDomain, registryCommitment, nativeFamily: family, nativeGenesis: rule.genesis,
    nativeAsset: rule.asset, nativeRuleCommitment: nativeRuleCommitment(rule),
    escrowEndpointCommitment: nativeClaimEndpointCommitment({ family, genesis: rule.genesis, asset: rule.asset, endpoint: roles.escrow.endpoint }) };
  const domain = claimDomainCommitment(config), prefund = { amount: '10000000', classification: 'SYNTHETIC_LOCAL_FEE_SURPLUS_NOT_USER_BACKING', fee: '0' };
  const close = () => {};
  const claimTransfers = [], claimObservations = new Map();
  const custody = Object.freeze({ roles, get transfers() { return copy(claimTransfers); }, syntheticPrefunding: prefund, close,
    adapter({ route }) { const spec = ownedCustodyRoute(route); return { binding: { sourceEndpoint: roles[spec.sourceRole].endpoint,
      destinationEndpoint: roles[spec.destinationRole].endpoint },
      assertPrepared: prepared => nativeRead('payout-preparation', async () => {
        assert.equal(route, controls.preparedRoute, 'TEST_ORIGINAL_PAYOUT_ROUTE');
        assert.deepEqual(prepared, controls.originalPrepared, 'TEST_ORIGINAL_PAYOUT_PREPARED');
        controls.preparedCalls.push(prepared); await controls.beforePrepared?.();
      }) }; },
    factReader({ route }) { return { observe: request => nativeRead('claim-observation', async () => {
      assert.equal(route, claimTransfers.find(row => row.nativeId === request.nativeId)?.route); assert.ok(claimObservations.has(request.nativeId), 'TEST_NO_CLAIM_TRANSFER');
      return copy(claimObservations.get(request.nativeId));
    }) }; },
    inventory: () => nativeRead('claim-inventory', async () => {
      controls.inventoryReads++; await controls.beforeInventory?.();
      const paidFees = claimTransfers.filter(row => row.route !== 'deposit').reduce((sum, row) => sum + BigInt(row.actualFee ?? 0), 0n);
      const accounts = Object.entries(roles).map(([role, account]) => ({ role, ...account, exists: true,
        total: String(10000000n + (role === 'escrow' ? BigInt(controls.principal) - paidFees : 0n)),
        spendable: String(10000000n + (role === 'escrow' ? BigInt(controls.principal) - paidFees : 0n)), rentExemptMinimum: '890880' }));
      return { family: '2', genesis: rule.genesis, asset: rule.asset, nativeHead: { id: sha('native-head'), height: '10', slot: '11' },
        accounts, escrow: copy(accounts[1]), feeAudit: ownedCustodyFeeAudit(claimTransfers.map(row => ({ nativeId: row.nativeId,
          route: row.route, phase: row.phase, amount: row.intent.lamports, preparedFee: '5000',
          actualFee: row.actualFee, broadcastAttempts: row.broadcastAttempts }))),
        signingUnresolved: controls.unresolved,
        syntheticPrefunding: copy(prefund), finality: 'finalized' };
    }) });
  const solver = generateKeyPairSync('ed25519'), graphSource = Buffer.from(solver.publicKey.export({ format: 'jwk' }).x, 'base64url').toString('hex');
  const observations = new Map();
  const graph = Object.freeze({ genesis: rule.genesis, genesisHex: prefix(rule.genesis), close: sameNode ? close : () => {},
    adapter({ asset, recipientIndex }) { assert.equal(asset, rule.asset); assert.ok([0, 1].includes(recipientIndex));
      return { binding: { family, genesis: rule.genesis, asset, sourceEndpoint: controls.graphSource ?? (family === '1' ? endpoint('graph-source') : graphSource),
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
  const binding = { runtime, system, bitcoin: family === '1' ? graph : null, solana: family === '2' ? graph : null,
    rules: [rule], rulePaths: tree.paths };
  return { pairs, controls, runtime, system, registry, observer, binding, graph, custody, domain, head, view,
    async bind(count = 3) {
      for (const pair of pairs.slice(0, count)) { await pair.claim.bind(observer); if (!standalone) await pair.graph.bind(binding); }
      return { claim: createClaimOperatorQuorum({ operators: pairs.slice(0, 3).map(pair => pair.claim) }),
        graph: standalone ? null : createFlatOperatorQuorum({ operators: pairs.slice(0, 3).map(pair => pair.graph) }) };
    },
    addGraphFact() {
      const wireKeyCommitment = sha('K'), intent = { sourcePublicKey: graphSource, recipientPublicKey: sha('graph-recipient-0'),
        recentBlockhash: sha('blockhash'), lamports: '12345', wireKeyCommitment };
      const message = Buffer.from(encodeSolanaBindingMessage(intent), 'hex'), signature = sign(null, message, solver.privateKey);
      const nativeId = signature.toString('hex'), nativeWire = Buffer.concat([Buffer.from([1]), signature, message]).toString('base64');
      observations.set(nativeId, { status: 'observed', genesis: rule.genesis, asset: rule.asset, nativeWire, intent,
        blockId: sha('block'), blockHeight: '50', finalityKind: '2', confirmations: '0',
        nativeContext: { observedTipId: ZERO, observedTipHeight: '0', transactionSlot: '60', parentSlot: '59', observedSlot: '64' } });
      return { family: '2', recipientIndex: '0', nativeId, wireKeyCommitment };
    },
    async addClaimFact({ staged = false } = {}) {
      assert.equal(family, '2');
      const seq = controls.intents.length, receiptSecret = sha('claim-secret-' + seq), wireSalt = sha('claim-salt-' + seq), amount = '12345', output = sha('claim-Q-' + seq);
      const operationId = claimIntentId({ claimDomain: domain, outputQ: output, amount });
      const wireKeyCommitment = receiptKeyCommitment({ ledgerNamespace: config.ledgerNamespace, secret: receiptSecret });
      const intent = { sourcePublicKey: claimSource, recipientPublicKey: roles.escrow.endpoint,
        recentBlockhash: sha('claim-blockhash'), lamports: amount, wireKeyCommitment };
      const message = Buffer.from(encodeSolanaBindingMessage(intent), 'hex'), signature = sign(null, message, claimSigner.privateKey);
      const nativeId = signature.toString('hex'), nativeWire = Buffer.concat([Buffer.from([1]), signature, message]).toString('base64');
      const request = { family, recipientIndex: '0', nativeId, wireKeyCommitment };
      const binding = createClaimReservationBinding({ claimDomain: domain, gateway: config.gateway,
        ledgerNamespace: config.ledgerNamespace, genesis: config.nativeGenesis, asset: config.nativeAsset,
        operationId, revision: '1', ingress: true, receiptSecret, wireSalt, nativeWire, intent, request });
      controls.intents.push({ id: operationId, state: '1', output, amount, validFrom: '990', validUntil: '1030', revision: '1',
        proofHash: sha('claim-proof'), nullifier: staged ? ZERO : binding.admissionN, refundDestination: staged ? ZERO : sha('claim-refund') });
      controls.principal = String(BigInt(controls.principal) + (staged ? 0n : BigInt(amount)));
      claimTransfers.push({ nativeId, nativeWire, intent, route: 'deposit', recipientIndex: 0,
        phase: staged ? 'SIGNED_NOT_BROADCAST' : 'OBSERVED_FINALIZED', broadcastAttempts: staged ? 0 : 1, actualFee: staged ? null : '5000' });
      claimObservations.set(nativeId, { status: 'observed', genesis: rule.genesis, asset: rule.asset, nativeWire, intent,
        blockId: sha('claim-block'), blockHeight: '50', finalityKind: '2', confirmations: '0',
        nativeContext: { observedTipId: ZERO, observedTipHeight: '0', transactionSlot: '60', parentSlot: '59', observedSlot: '64' } });
      if (!staged) controls.reservations.set(binding.admissionN, { gateway: config.gateway, operationId, revision: '1',
        wireBindingCommitment: binding.wireBindingCommitment, ingress: true, consumed: false });
      advanceState();
      for (const pair of pairs.slice(0, 3)) await pair.claim.retainSignedEffect({ claimDomain: domain, operationId, receiptSecret, wireSalt, nativeId });
      return request;
    },
    preparePayout(kind = '1') {
      const old = controls.intents[0]; assert.ok(old); old.state = kind === '1' ? '2' : '3';
      const ticketId = claimTicketId({ claimDomain: domain, kind, nonce: '0' });
      const secret = claimTicketSecret({ claimDomain: domain, ticketId });
      const routeName = kind === '2' ? 'refund' : 'redeem';
      const route = { endpoint: roles[kind === '2' ? 'depositor' : 'recipient'].endpoint, salt: sha('payout-route'),
        quotedFee: '5000', selectedInputValue: '0', changeFloor: '0', destinationFunded: true };
      const nativeChainDomain = claimHash(claimFrame('LIANUM/evidence-chain/1', [Buffer.from('SOL'), Buffer.from(rule.genesis, 'hex'), Buffer.from(rule.asset, 'hex')]));
      const ticket = { kind, id: ticketId, claimDomain: domain, amount: old.amount, maxFee: '5000',
        destinationCommitment: claimDestinationCommitment({ claimDomain: domain, nativeChainDomain,
          endpoint: nativeClaimEndpointCommitment({ family, genesis: rule.genesis, asset: rule.asset, endpoint: route.endpoint }),
          amount: old.amount, maxFee: '5000', salt: route.salt }),
        referenceIngressN: kind === '2' ? old.nullifier : ZERO, referenceQ: kind === '2' ? old.output : ZERO };
      const row = { ticket, state: '1', payoutRouteCommitment: ZERO }; controls.tickets.push(row); advanceState();
      const intent = { sourcePublicKey: payoutSource, recipientPublicKey: route.endpoint, nonceAccountPublicKey: sha('escrow-nonce-account'),
        durableNonce: sha('escrow-nonce-value'), lamports: ticket.amount,
        wireKeyCommitment: receiptKeyCommitment({ ledgerNamespace: config.ledgerNamespace, secret }) };
      const prepared = frozen({ genesis: rule.genesis, intent, unsignedWire: encodeSolanaNonceBindingMessage(intent), funds: { feeLamports: '5000' } });
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
          const message = Buffer.from(prepared.unsignedWire, 'hex'), signature = sign(null, message, payoutSigner.privateKey);
          nativeId = signature.toString('hex'); const nativeWire = Buffer.concat([Buffer.from([1]), signature, message]).toString('base64');
          const spec = ownedCustodyRoute(routeName);
          claimTransfers.push({ nativeId, nativeWire, intent: copy(intent), route: routeName, recipientIndex: spec.recipientIndex,
            phase: 'SIGNED_NOT_BROADCAST', broadcastAttempts: 0, actualFee: null });
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
        observed() {
          const transfer = claimTransfers.find(row => row.nativeId === nativeId); transfer.phase = 'OBSERVED_FINALIZED';
          transfer.broadcastAttempts = 1; transfer.actualFee = '5000'; controls.principal = String(BigInt(controls.principal) - BigInt(ticket.amount));
          claimObservations.set(nativeId, { status: 'observed', genesis: rule.genesis, asset: rule.asset, nativeWire: transfer.nativeWire, intent: copy(intent),
            blockId: sha('payout-block'), blockHeight: '50', finalityKind: '2', confirmations: '0',
            nativeContext: { observedTipId: ZERO, observedTipHeight: '0', transactionSlot: '61', parentSlot: '60', observedSlot: '64' } });
          row.state = '3'; advanceState(); return binding.request;
        },
        discharge() { row.state = '4'; controls.activePayout = ZERO; advanceState(); },
      };
    },
    issue() {
      const binding = records.get(runtime.metadata.scratchDirectory + '/claim-operator-0.v3').data.bindings[0], intent = controls.intents[0];
      return { claimDomain: domain, terms: { action: CLAIM_ACTIONS.ISSUE, operationId: intent.id,
        revision: intent.revision, amount: intent.amount, destinationCommitment: intent.refundDestination,
        maxFee: config.refundMaxFee, nullifier: binding.admissionN, wireBindingCommitment: binding.wireBindingCommitment,
        routeCommitment: sha('ingress-leaf'), claimSequence: '0', hubSequence: '0' }, route: null, ownerAuthorization: null };
    },
    reservation() {
      const binding = records.get(runtime.metadata.scratchDirectory + '/claim-operator-0.v3').data.bindings[0], intent = controls.intents[0];
      const route = { endpoint: roles.depositor.endpoint, salt: sha('refund-route-salt'), quotedFee: '5000',
        selectedInputValue: '0', changeFloor: '0', destinationFunded: true };
      const chainDomain = claimHash(claimFrame('LIANUM/evidence-chain/1', [Buffer.from('SOL'),
        Buffer.from(config.nativeGenesis, 'hex'), Buffer.from(config.nativeAsset, 'hex')]));
      const destinationCommitment = claimDestinationCommitment({ claimDomain: domain, nativeChainDomain: chainDomain,
        endpoint: nativeClaimEndpointCommitment({ family, genesis: config.nativeGenesis, asset: config.nativeAsset, endpoint: route.endpoint }),
        amount: intent.amount, maxFee: config.refundMaxFee, salt: route.salt });
      return { claimDomain: domain, terms: { action: CLAIM_ACTIONS.RESERVE_INGRESS, operationId: intent.id,
        revision: intent.revision, amount: intent.amount, destinationCommitment, maxFee: config.refundMaxFee,
        nullifier: binding.admissionN, wireBindingCommitment: binding.wireBindingCommitment, routeCommitment: ZERO,
        claimSequence: '0', hubSequence: '0' }, route, ownerAuthorization: null };
    },
    claimStore(index = 0) { return records.get(runtime.metadata.scratchDirectory + '/claim-operator-' + index + '.v3'); },
    graphStore(index = 0) { return records.get(runtime.metadata.scratchDirectory + '/flat-operator-' + index + '.v3'); },
    preposition(output = sha('owner-output')) {
      const statement = { scope: config.scope, policy: config.policy, validFrom: '990', validUntil: '1030', amount: '10', output };
      const ownerAuthorization = { statement, proof: 'aabb' }, s = statement;
      const routeCommitment = claimHash(Buffer.concat([Buffer.from(s.scope, 'hex'), Buffer.from(s.policy, 'hex'),
        ...[s.validFrom, s.validUntil, s.amount].map(value => Buffer.from(word(value), 'hex')),
        Buffer.from(s.output, 'hex'), Buffer.from(claimHash(Buffer.from(ownerAuthorization.proof, 'hex')), 'hex')]));
      return { claimDomain: domain, terms: { action: CLAIM_ACTIONS.PREPOSITION,
        operationId: claimIntentId({ claimDomain: domain, outputQ: s.output, amount: s.amount }), revision: '1', amount: s.amount,
        destinationCommitment: config.escrowEndpointCommitment, maxFee: config.refundMaxFee, nullifier: ZERO,
        wireBindingCommitment: ZERO, routeCommitment, claimSequence: '0', hubSequence: '0' }, route: null, ownerAuthorization };
    },
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
function assertOwnReads(f, before, { prepared = 0, claimHistory = 3, graph = 12 } = {}) {
  const starts = f.controls.nativeReadEvents.slice(before.reads).filter(row => row.phase === 'start');
  assert.equal(f.controls.nativeReadCollisions, 0); assert.equal(f.controls.nativeReadBusy, false);
  assert.equal(f.controls.preparedCalls.length - before.preparations, prepared);
  assert.equal(f.controls.inventoryReads - before.inventory, 3);
  assert.equal(starts.filter(row => row.kind === 'claim-observation').length, claimHistory * 3);
  assert.equal(f.controls.graphReads.length - before.graph, graph);
  assert.equal(starts.length * 2, f.controls.nativeReadEvents.length - before.reads);
}

test('loaded redeem and refund traverse prepared backing, original-only validation, presign, all-four binding, reservation, original-only validation, broadcast/reuse, facts and discharge health', async t => {
  t.mock.method(performance, 'now', () => 0);
  for (const kind of ['1', '2']) {
    const { f, q, p } = await loadedPayout(t, kind);
    assert.equal(q.claim.collectionProfile, 'SAME_HOST_CLAIM_COMMON_HEAD_COLLECTION_V3');
    const preparedBytes = JSON.stringify(p.prepared);
    let mark = readMark(f), permit = await q.claim.backing(p.begin);
    assertOwnReads(f, mark, { prepared: 9 });
    let keys = attesterKeyUses; mark = readMark(f);
    assert.equal(await q.claim.assertOriginalAuthorizationCurrent(permit), undefined);
    assert.equal(attesterKeyUses, keys); assertOwnReads(f, mark, { prepared: 9, graph: 6 });
    p.beginIncluded(); mark = readMark(f);
    const presign = await q.claim.authorizePayout(p.request); assertOwnReads(f, mark, { prepared: 9 });
    assert.equal(presign.message.validUntil, '1030');
    const reservationRequest = await p.retain(); mark = readMark(f);
    permit = await q.claim.reservation(reservationRequest); assertOwnReads(f, mark);
    keys = attesterKeyUses; mark = readMark(f);
    await q.claim.assertOriginalAuthorizationCurrent(permit); assert.equal(attesterKeyUses, keys);
    assertOwnReads(f, mark, { graph: 6 });
    const broadcast = p.reserved(); mark = readMark(f);
    const authorized = await q.claim.authorizeBroadcast(broadcast); assertOwnReads(f, mark, { prepared: 6 });
    keys = attesterKeyUses; mark = readMark(f);
    const reused = await q.claim.authorizeBroadcast(broadcast);
    assert.deepEqual(reused, authorized); assert.equal(attesterKeyUses, keys);
    assertOwnReads(f, mark, { prepared: 6, graph: 6 });
    assert.equal(JSON.stringify(p.prepared), preparedBytes);
    assert.ok(f.controls.preparedCalls.every(value => value !== p.prepared && Object.isFrozen(value)));
    for (const pair of f.pairs) assert.equal(f.claimStore(pair.claim.signerIndex).data.bindings.filter(row => !row.ingress).length, 1);
    assert.equal(f.custody.transfers.at(-1).broadcastAttempts, 0);
    const factsRequest = p.observed(); mark = readMark(f); const facts = await q.claim.facts(factsRequest);
    assert.equal(facts.certificates.length, 3);
    assert.equal(f.controls.inventoryReads - mark.inventory, 3);
    assert.equal(f.controls.graphReads.length - mark.graph, 12);
    assert.ok(f.controls.nativeReadEvents.slice(mark.reads).filter(row => row.kind === 'claim-observation' && row.phase === 'start').length >= 12,
      'each of three facts signers scans every one of four retained custody identities plus its own facts observations');
    mark = readMark(f);
    const health = await q.claim.health({ claimDomain: f.domain, mode: 'debt' });
    assertOwnReads(f, mark, { claimHistory: 4, graph: 6 });
    mark = readMark(f); await q.claim.assertOriginalAuthorizationCurrent(health);
    assertOwnReads(f, mark, { claimHistory: 4, graph: 6 });
    p.discharge(); await q.claim.health({ claimDomain: f.domain, mode: 'debt' });
    assert.equal(f.custody.transfers.length, 4); assert.equal(f.custody.transfers.at(-1).broadcastAttempts, 1);
    await assert.rejects(q.claim.authorizeBroadcast(broadcast), /ORIGINAL_PHASE/);
  }
});

test('loaded prepared payout rejects changed immutable preparation, route, original head, deficit and adverse graph before any key use', async t => {
  t.mock.method(performance, 'now', () => 0);
  for (const stage of ['backing', 'presign']) for (const fault of ['preparation', 'route', 'head', 'deficit', 'adverse']) {
    const { f, q, p } = await loadedPayout(t);
    if (stage === 'presign') p.beginIncluded();
    const request = copy(stage === 'backing' ? p.begin : p.request);
    if (fault === 'preparation') request.prepared.intent.durableNonce = sha('forged-nonce');
    if (fault === 'route') request.route.endpoint = sha('other-destination');
    if (fault === 'head') f.controls.claimHead = { ...f.head, hash: sha('fork') };
    if (fault === 'deficit') f.controls.principal = '0';
    if (fault === 'adverse') f.controls.graphAdverse = true;
    const keys = attesterKeyUses;
    await assert.rejects(stage === 'backing' ? q.claim.backing(request) : q.claim.authorizePayout(request));
    assert.equal(attesterKeyUses, keys); assert.equal(f.controls.nativeReadBusy, false);
    assert.equal(f.controls.nativeReadCollisions, 0); assert.equal(f.custody.transfers.length, 3);
  }
});

test('loaded prepared final validation rejects changed source and expired original certificate without replacing authority', async t => {
  t.mock.method(performance, 'now', () => 0);
  for (const fault of ['prepared', 'head', 'certificate']) {
    const { f, q, p } = await loadedPayout(t); const original = await q.claim.backing(p.begin), keys = attesterKeyUses;
    const originalRows = f.claimStore().data.authorizations.length;
    if (fault === 'prepared') f.controls.originalPrepared = { ...p.prepared, unsignedWire: '00' };
    if (fault === 'head') f.head.hash = sha('later-head');
    if (fault === 'certificate') {
      // Same original certificate at an invalid exclusive-next-block boundary.
      f.head.timestamp = '1029';
    }
    await assert.rejects(q.claim.assertOriginalAuthorizationCurrent(original));
    assert.equal(attesterKeyUses, keys); assert.equal(f.claimStore().data.authorizations.length, originalRows);
  }
});

test('every loaded payout collection drains a durable late sibling after another signer completion fails', async t => {
  t.mock.method(performance, 'now', () => 0);
  for (const stage of ['backing','presign','reservation','broadcast']) {
    const { f, q, p } = await loadedPayout(t);
    let invoke, kind;
    if (stage === 'backing') { invoke=()=>q.claim.backing(p.begin); kind='backing'; }
    else {
      await q.claim.backing(p.begin); p.beginIncluded();
      if (stage === 'presign') { invoke=()=>q.claim.authorizePayout(p.request); kind='presign-payout'; }
      else {
        await q.claim.authorizePayout(p.request); const request=await p.retain();
        if (stage === 'reservation') { invoke=()=>q.claim.reservation(request); kind='reservation'; }
        else { await q.claim.reservation(request); const broadcastRequest=p.reserved(); invoke=()=>q.claim.authorizeBroadcast(broadcastRequest); kind='broadcast-payout-v2'; }
      }
    }
    let release, entered, blocked=false, settled=false;
    const gate=new Promise(resolve=>{release=resolve;}), reached=new Promise(resolve=>{entered=resolve;});
    f.claimStore(1).beforeUpdate=async data=>{if(data.authorizations.some(row=>row.kind===kind&&row.signature))throw Error('TEST_COMPLETION_FAILURE');};
    f.claimStore(2).beforeUpdate=async data=>{if(!blocked&&data.authorizations.some(row=>row.kind===kind&&row.signature)){blocked=true;entered();await gate;}};
    const operation=invoke();operation.then(()=>{settled=true;},()=>{settled=true;});
    const rejected=assert.rejects(operation,causedBy(/TEST_COMPLETION_FAILURE/));
    await reached; assert.equal(settled,false);
    await assert.rejects(q.claim.health({claimDomain:f.domain,mode:'debt'}),/CLOSED_OR_POISONED|QUORUM_BUSY/);
    assert.throws(()=>f.pairs[2].claim.close(),/OPERATOR_BUSY/);
    release();await rejected;
    assert.ok(f.claimStore(2).data.authorizations.some(row=>row.kind===kind&&row.signature&&row.abiSignature));
    assert.equal(f.pairs[1].claim.status().poisoned,true);
    assert.equal(f.controls.nativeReadBusy,false);assert.equal(f.controls.nativeReadCollisions,0);
    assert.ok(f.custody.transfers.every(row=>row.route==='deposit'||row.broadcastAttempts===0));
  }
});

test('loaded prepared final read failure or exact operator deadline after persistence withholds quorum and poisons every affected key', async t => {
  for (const stage of ['backing','presign','broadcast']) for (const fault of ['native','deadline']) {
    let now=0; const clock=t.mock.method(performance,'now',()=>now);
    try {
      const {f,q,p}=await loadedPayout(t);let invoke,kind;
      if(stage==='backing'){invoke=()=>q.claim.backing(p.begin);kind='backing';}
      else {
        await q.claim.backing(p.begin);p.beginIncluded();
        if(stage==='presign'){invoke=()=>q.claim.authorizePayout(p.request);kind='presign-payout';}
        else {await q.claim.authorizePayout(p.request);const request=await p.retain();await q.claim.reservation(request);
          const broadcast=p.reserved();invoke=()=>q.claim.authorizeBroadcast(broadcast);kind='broadcast-payout-v2';}
      }
      const keys=attesterKeyUses;
      f.controls.beforePrepared=()=>{
        if([0,1,2].some(index=>f.claimStore(index).data.authorizations.some(row=>row.kind===kind&&row.signature))) {
          if(fault==='deadline')now=30000;else throw Error('TEST_LATE_PREPARED_FAILED');
        }
      };
      await assert.rejects(invoke(),causedBy(fault==='deadline'?/AUDIT_TOO_OLD/:/TEST_LATE_PREPARED_FAILED/));
      assert.ok(attesterKeyUses>keys);
      const affected=[0,1,2].filter(index=>f.claimStore(index).data.authorizations.some(row=>row.kind===kind&&row.signature));
      assert.ok(affected.length>0);for(const index of affected)assert.equal(f.pairs[index].claim.status().poisoned,true);
      assert.equal(f.controls.nativeReadBusy,false);assert.equal(f.controls.nativeReadCollisions,0);
      assert.ok(f.custody.transfers.every(row=>row.route==='deposit'||row.broadcastAttempts===0));
    } finally {clock.mock.restore();}
  }
});

test('observed-but-undischarged payout facts and debt health still refuse fresh reciprocal graph failure and retain adverse history', async t => {
  t.mock.method(performance,'now',()=>0);
  for(const method of ['facts','health','original-health'])for(const failure of ['unknown','adverse']){
    const {f,q,p}=await loadedPayout(t);await q.claim.backing(p.begin);p.beginIncluded();
    await q.claim.authorizePayout(p.request);const reservation=await p.retain();await q.claim.reservation(reservation);p.reserved();
    const facts=p.observed(),healthRequest={claimDomain:f.domain,mode:'debt'};
    const original=method==='original-health'?await q.claim.health(healthRequest):null;
    if(failure==='unknown')f.controls.graphUnavailable=true;else f.controls.graphAdverse=true;
    const keys=attesterKeyUses,factsKeys=factsKeyUses;
    await assert.rejects(method==='facts'?q.claim.facts(facts):method==='health'?q.claim.health(healthRequest):q.claim.assertOriginalAuthorizationCurrent(original),/INVENTORY_BLOCKED/);
    assert.equal(attesterKeyUses,keys);assert.equal(factsKeyUses,factsKeys);
    assert.equal(f.controls.nativeReadCollisions,0);assert.equal(f.controls.nativeReadBusy,false);
    if(failure==='adverse')assert.ok(Object.keys(f.graphStore(0).data.adverse).length>0);
    assert.equal(f.custody.transfers.at(-1).broadcastAttempts,1);
    assert.equal(f.controls.activePayout,p.ticket.id);
  }
});
