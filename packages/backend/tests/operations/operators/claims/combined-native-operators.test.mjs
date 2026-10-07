/** V3 candidate tests; byte-for-byte historical tests remain in baseline.
 * Focused source-only composition tests. Explicit mocked ownership/current
 * views and in-memory durable stores replace deployments. Constructors, brands,
 * full claim accounting/inventory audits, codecs, signatures, ECDSA recovery and
 * quorum verification are real. No node, contracts, proof, network or funds. */
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { publicKeccak256 } from '../../../../../engine/src/cohorts/private-cohort-public-native.mjs';
import { nativeAdmissionRulesTree } from '../../../../../engine/src/execution/native/dispatch/native-admission.mjs';
import { checkpointAuthorizationDigest, checkpointAuthorizationFrame, revocationMessage }
  from '../../../../../engine/src/evidence/native-hub-messages.mjs';
import { createNativeQuorumHostVerifier } from '../../../../../engine/src/evidence/native-quorum.mjs';
import { FACTS_QUORUM_PROFILE, nativeFactsRegistryCommitment } from '../../../../src/chains/shared/dispatch/native-facts-peer.mjs';
import { nativeRuleCommitment, encodeSolanaBindingMessage, receiptKeyCommitment } from '../../../../src/chains/shared/dispatch/native-receipt-binding.mjs';
import { recoverSecp256k1Sender } from '../../../../src/chains/evm/runtime/owned-evm-v2-runtime.mjs';
import { encodeFlatNativeHealth, flatNativeHealthDigest } from '../../../../src/chains/shared/health/native-health.mjs';
import { ownedCustodyRoute, ownedCustodyFeeAudit } from '../../../../src/chains/shared/runtime/owned-native-custody.mjs';
import { CLAIM_CONFIG_SCHEMA, claimDomainCommitment, claimIntentId, nativeClaimEndpointCommitment,
  claimDestinationCommitment } from '../../../../src/claims/protocol/framing.mjs';
import { CLAIM_ACTIONS, claimHash, claimBackingFrame, claimFrame } from '../../../../src/claims/authorization/permits.mjs';
import { createClaimReservationBinding } from '../../../../src/claims/authorization/reservation-facts-gate.mjs';
import * as originalFactsPeer from '../../../../src/chains/shared/dispatch/native-facts-peer.mjs';
import * as originalNoteEncoding from '../../../../../engine/src/notes/private-note-encoding.mjs';

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
const bridge = await import('../../../../src/operations/operators/claims/combined-native-operators.mjs');
const { createCombinedLocalNativeOperator } = bridge;
const { createFlatOperatorQuorum, assertOwnedFlatOperatorQuorum, createScopedFlatOperator, createLocalFlatOperator } = await import('../../../../src/operations/operators/claims/native-operators.mjs');
const { createClaimOperatorQuorum, assertOwnedClaimOperatorQuorum, createScopedClaimOperator, createLocalClaimOperator } = await import('../../../../src/claims/operations/operators.mjs');

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
    intents: [], reservations: new Map(), readerStats: [], beforeCurrent: null, currentFailure: false,
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
  const claimSigner = generateKeyPairSync('ed25519');
  const claimSource = Buffer.from(claimSigner.publicKey.export({ format: 'jwk' }).x, 'base64url').toString('hex');
  const roles = Object.fromEntries(['depositor', 'escrow', 'recipient'].map(role => [role,
    { endpoint: family === '2' && role === 'depositor' ? claimSource : endpoint(role), address: 'owned-' + role }]));
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
      destinationEndpoint: roles[spec.destinationRole].endpoint } }; },
    factReader({ route }) { return { observe: request => nativeRead('claim-observation', async () => {
      assert.equal(route, 'deposit'); assert.ok(claimObservations.has(request.nativeId), 'TEST_NO_CLAIM_TRANSFER');
      return copy(claimObservations.get(request.nativeId));
    }) }; },
    inventory: () => nativeRead('claim-inventory', async () => {
      controls.inventoryReads++; await controls.beforeInventory?.();
      const accounts = Object.entries(roles).map(([role, account]) => ({ role, ...account, exists: true,
        total: String(10000000n + (role === 'escrow' ? BigInt(controls.principal) : 0n)),
        spendable: String(10000000n + (role === 'escrow' ? BigInt(controls.principal) : 0n)), rentExemptMinimum: '890880' }));
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
      claimSequence: '0', intentCount: String(controls.intents.length), ticketCount: '0', reservedRefundTickets: String(controls.intents.length),
      nextTicketNonce: '0', wrapperSupply: controls.liability, pendingRedemptions: '0', pendingRefunds: '0',
      heldUnissued: controls.intents.reduce((sum, row) => sum + BigInt(row.amount), 0n).toString(),
      reservedFees: String(BigInt(config.refundMaxFee) * BigInt(controls.intents.length)), activePayout: ZERO,
      intents: copy(controls.intents), tickets: [], revocationState: sha('revocation'), healthState, poolHeadroom: true }] };
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
      return copy(controls.reservations.get(request.admissionN) ?? null); } });
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
      const receiptSecret = sha('claim-secret'), wireSalt = sha('claim-salt'), amount = '12345', output = sha('claim-Q');
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
      controls.principal = staged ? '0' : amount;
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

test('one key per pair retains both genuine brands, actual signatures and distinct authorization domains', async t => {
  const f = fixture(t), quorums = await f.bind();
  assert.equal(new Set(f.pairs.map(pair => pair.claim.publicKey.x)).size, 4);
  for (const pair of f.pairs) { assert.deepEqual(pair.claim.publicKey, pair.graph.publicKey); assert.deepEqual(Object.keys(pair), ['claim', 'graph']); }
  assertOwnedClaimOperatorQuorum(quorums.claim, f.observer);
  assertOwnedFlatOperatorQuorum(quorums.graph, { runtime: f.runtime, system: f.system, nativeRuntime: f.graph, family: '2' });
  const claim = await quorums.claim.health({ claimDomain: f.domain, mode: 'debt' });
  const graph = await quorums.graph.checkpoint({ poolIndex: 1, requestId: sha('request') });
  const verifier = createNativeQuorumHostVerifier({ registry: f.registry, expectedRegistryCommitment: f.system.registryCommitment.slice(2) });
  verifier.assertQuorumForMessage({ messageBytes: encodeFlatNativeHealth(claim.message), indexes: claim.indexes, signatures: claim.signatures });
  verifier.assertQuorumForMessage({ messageBytes: checkpointAuthorizationFrame(graph.message), indexes: graph.indexes, signatures: graph.signatures });
  assert.throws(() => verifier.assertQuorumForMessage({ messageBytes: checkpointAuthorizationFrame(graph.message), indexes: claim.indexes, signatures: claim.signatures }));
  assert.ok(f.controls.recoveries >= 12); assert.equal(f.controls.inventoryReads, 9);
  assert.ok(f.controls.claimReads.every(head => JSON.stringify(head) === JSON.stringify(f.head)));
});

test('no returned capability, key, forged token or callback can acquire the internal signing bridge', t => {
  const f = fixture(t), pair = f.pairs[0]; let called = false;
  for (const operator of [pair.claim, pair.graph]) for (const name of ['privateKey', 'custody', 'token', 'sign', 'signFrame', 'exportKey'])
    assert.equal(operator[name], undefined);
  for (const token of [null, {}, pair, pair.claim, pair.graph, { privateKey: 'caller-key' }]) {
    assert.throws(() => createScopedClaimOperator({ get signerIndex() { called = true; } }, token), /PRIVATE_CUSTODY_REQUIRED/);
    assert.throws(() => createScopedFlatOperator({}, token), /PRIVATE_CUSTODY_REQUIRED/);
    assert.throws(() => bridge.signCombinedClaimAuthorization(token, 'health', {}), /PRIVATE_CUSTODY_REQUIRED/);
    assert.throws(() => bridge.signCombinedGraphAuthorization(token, 'health', {}), /PRIVATE_CUSTODY_REQUIRED/);
    assert.throws(() => bridge.createCombinedFactsSigner(token, 'graph', {}), /PRIVATE_CUSTODY_REQUIRED/);
  }
  assert.equal(called, false);
  for (const extra of [{ privateKey: {} }, { signer: () => { called = true; } }, { coverage: () => true }])
    assert.throws(() => createCombinedLocalNativeOperator({ signerIndex: 0, ...extra }), /EXACT_FIELDS/);
  for (const signerIndex of [-1, 4, -0, '0', 0.1]) assert.throws(() => createCombinedLocalNativeOperator({ signerIndex }), /INDEX/);
});

test('copied claim/graph operators cannot join either genuine quorum', async t => {
  const f = fixture(t); await f.bind();
  assert.throws(() => createFlatOperatorQuorum({ operators: [{ ...f.pairs[0].graph }, ...f.pairs.slice(1, 3).map(pair => pair.graph)] }), /OWNED_CAPABILITY/);
  assert.throws(() => createClaimOperatorQuorum({ operators: [{ ...f.pairs[0].claim }, ...f.pairs.slice(1, 3).map(pair => pair.claim)] }), /OWNED_OPERATOR/);
});

test('graph health and cached health/checkpoint refuse fresh claim deficit and unresolved custody activity', async t => {
  const f = fixture(t), quorums = await f.bind(), request = { poolIndex: 0, requestId: sha('cached') };
  await quorums.graph.health({ poolIndex: 0 }); await quorums.graph.checkpoint(request);
  const before = f.controls.recoveries; f.controls.liability = '1';
  await assert.rejects(quorums.graph.health({ poolIndex: 0 }), /CLAIM_CURRENT_PRINCIPAL_DEFICIT/);
  await assert.rejects(quorums.graph.checkpoint(request), /CLAIM_CURRENT_PRINCIPAL_DEFICIT/);
  assert.equal(f.controls.recoveries, before); assert.equal(f.pairs[0].graph.status().poisoned, false);
  f.controls.liability = '0'; f.controls.unresolved = true;
  await assert.rejects(quorums.graph.health({ poolIndex: 0 }), /CLAIM_COMPLETE_AUDIT_UNAVAILABLE/);
  f.controls.unresolved = false; await quorums.graph.health({ poolIndex: 0 });
  assert.equal(f.controls.recoveries, before, 'reuse is allowed only after current coverage has recovered');
});

test('exact shared EVM head is required even when both branch readers individually consider themselves current', async t => {
  const f = fixture(t), quorums = await f.bind(); f.controls.claimHead = { ...f.head, hash: sha('other-head') };
  await assert.rejects(quorums.graph.health({ poolIndex: 0 }), /CLAIM_QUORUM_HEAD_CHANGED|TEST_CLAIM_HEAD_CHANGED/);
  assert.equal(f.controls.recoveries, 0);
});

test('graph bind rejects another owned deployment, registry key substitution and custody-role sources', async t => {
  const a = fixture(t), b = fixture(t); await a.pairs[0].claim.bind(a.observer);
  // Same public keys do not grant authority over another deployment.
  b.system.registry.keys.splice(0, 4, ...a.system.registry.keys.map(copy));
  await assert.rejects(a.pairs[0].graph.bind(b.binding), causedBy(/COMBINED_OPERATOR_DEPLOYMENT_BINDING/));
  assert.equal(a.pairs[0].claim.status().poisoned, true);
  const c = fixture(t); await c.pairs[0].claim.bind(c.observer);
  c.system.registry.keys[0] = copy(c.pairs[1].graph.publicKey);
  await assert.rejects(c.pairs[0].graph.bind(c.binding), causedBy(/FLAT_OPERATOR_CHANGED_DATA/));
  const d = fixture(t); await d.pairs[0].claim.bind(d.observer); d.controls.graphSource = d.custody.roles.escrow.endpoint;
  await assert.rejects(d.pairs[0].graph.bind(d.binding), causedBy(/GRAPH_SOURCE_IS_CUSTODY/));
});

test('graph facts require the graph effect inventory despite the shared attester public key', async t => {
  const f = fixture(t), quorums = await f.bind(), request = f.addGraphFact();
  const fact = await quorums.graph.facts(request); assert.equal(fact.certificates.length, 3);
  assert.ok(f.controls.graphReads.length >= 3); assert.equal(f.claimStore().data.bindings.length, 0);
  await assert.rejects(quorums.claim.facts(request), /CLAIM_FACT_RESERVATION_HANDOFF_REQUIRED/);
  await assert.rejects(quorums.graph.facts({ ...request, nativeId: 'ab'.repeat(64) }));
});

test('closing either branch closes both and invalidates both quorums', async t => {
  for (const side of ['claim', 'graph']) {
    const f = fixture(t), q = await f.bind(); f.pairs[0][side].close();
    assert.equal(f.pairs[0].claim.status().closed, true); assert.equal(f.pairs[0].graph.status().closed, true);
    assert.equal(f.claimStore().closed, true);
    await assert.rejects(q.graph.health({ poolIndex: 0 }), /CLOSED_OR_POISONED/);
    await assert.rejects(q.claim.health({ claimDomain: f.domain, mode: 'debt' }), /CLOSED_OR_POISONED/);
  }
});

test('claim journal uncertainty poisons both branches and cannot be bypassed with graph-only health', async t => {
  const f = fixture(t), q = await f.bind(); f.claimStore().corrupt = true;
  await assert.rejects(q.graph.health({ poolIndex: 0 }), /CLAIM_OPERATOR_JOURNAL_UNAVAILABLE/);
  assert.equal(f.pairs[0].claim.status().poisoned, true); assert.equal(f.pairs[0].graph.status().poisoned, true);
  f.claimStore().corrupt = false; await assert.rejects(q.graph.health({ poolIndex: 0 }), /CLOSED_OR_POISONED/);
});

test('a sibling close cannot drop shared custody while a graph coverage audit is in flight', async t => {
  const f = fixture(t); await f.bind(); let release, entered;
  const reached = new Promise(resolve => { entered = resolve; }), pending = new Promise(resolve => { release = resolve; });
  f.controls.beforeInventory = async () => { entered(); await pending; };
  const operation = f.pairs[0].graph.health({ poolIndex: 0 }); await reached;
  assert.throws(() => f.pairs[0].claim.close(), /BUSY/); assert.throws(() => f.pairs[0].graph.close(), /BUSY/);
  assert.equal(f.pairs[0].claim.status().closed, false); release(); await operation;
  f.pairs[0].claim.close(); assert.equal(f.pairs[0].graph.status().closed, true);
});

test('claim health and reused health refuse unknown and permanently adverse graph inventory', async t => {
  const f = fixture(t), q = await f.bind(), request = f.addGraphFact();
  await q.graph.facts(request);
  const health = { claimDomain: f.domain, mode: 'debt' };
  await q.claim.health(health);
  const before = f.controls.recoveries;
  f.controls.graphUnavailable = true;
  await assert.rejects(q.claim.health(health), /FLAT_OPERATOR_INVENTORY_BLOCKED/);
  assert.equal(f.controls.recoveries, before);
  assert.equal(f.pairs[0].claim.status().poisoned, false);
  f.controls.graphUnavailable = false;
  await q.claim.health(health);
  assert.equal(f.controls.recoveries, before, 'cached health is reused only after both fresh audits');
  f.controls.graphAdverse = true;
  await assert.rejects(q.claim.health(health), /FLAT_OPERATOR_INVENTORY_BLOCKED/);
  f.controls.graphAdverse = false;
  await assert.rejects(q.claim.health(health), /FLAT_OPERATOR_INVENTORY_BLOCKED/);
  assert.equal(f.controls.recoveries, before);
});

test('claim backing and its paired cached health cannot bypass fresh graph inventory', async t => {
  const f = fixture(t), q = await f.bind();
  await q.graph.facts(f.addGraphFact());
  const request = f.preposition();
  const result = await q.claim.backing(request);
  assert.ok(result.authorization.healthSignatures.length === 3);
  const before = f.controls.recoveries;
  f.controls.graphUnavailable = true;
  await assert.rejects(q.claim.backing(request), /FLAT_OPERATOR_INVENTORY_BLOCKED/);
  assert.equal(f.controls.recoveries, before);
  f.controls.graphUnavailable = false;
  await q.claim.backing(request);
  assert.equal(f.controls.recoveries, before);
});

test('claim health fails before signing at a different canonical graph head or before graph binding', async t => {
  const f = fixture(t); await f.pairs[0].claim.bind(f.observer);
  await assert.rejects(f.pairs[0].claim.signHealth({ claimDomain: f.domain, mode: 'debt' }), /FLAT_OPERATOR_NOT_BOUND/);
  await f.pairs[0].graph.bind(f.binding);
  f.controls.claimHead = { ...f.head, hash: sha('other-current-head') };
  await assert.rejects(f.pairs[0].claim.signHealth({ claimDomain: f.domain, mode: 'debt' }), /FLAT_OPERATOR_CHANGED_DATA|TEST_CLAIM_HEAD_CHANGED/);
  assert.equal(f.controls.recoveries, 0);
});

test('fresh and reused graph facts check complete claim coverage without minting another identity', async t => {
  const f = fixture(t), q = await f.bind(), request = f.addGraphFact();
  f.controls.liability = '1';
  await assert.rejects(q.graph.facts(request), /CLAIM_CURRENT_PRINCIPAL_DEFICIT/);
  assert.equal(f.pairs[0].graph.status().certifiedInventoryCount, 1);
  assert.equal(f.graphStore().data.inventories['2'].state.entries[0].signature, null, 'V3 retains unsigned conservative staging before reciprocal refusal');
  f.controls.liability = '0';
  await q.graph.facts(request);
  f.controls.unresolved = true;
  await assert.rejects(q.graph.facts(request), /CLAIM_COMPLETE_AUDIT_UNAVAILABLE/);
  assert.equal(f.pairs[0].graph.status().certifiedInventoryCount, 1);
});

test('both native families require one original immutable node identity, even with identical Bitcoin regtest genesis', async t => {
  for (const family of ['1', '2']) {
    const f = fixture(t, { family, sameNode: false });
    await f.pairs[0].claim.bind(f.observer);
    assert.equal(f.binding.rules[0].genesis, f.graph.genesis);
    await assert.rejects(f.pairs[0].graph.bind(f.binding), causedBy(/COMBINED_OPERATOR_SAME_NATIVE_NODE_REQUIRED/));
    assert.equal(f.pairs[0].claim.status().poisoned, true);
  }
  const f = fixture(t, { family: '1' });
  await f.pairs[0].claim.bind(f.observer);
  await f.pairs[0].graph.bind(f.binding);
  assert.equal(f.pairs[0].graph.status().bound, true);
});

test('copied native facades and proxies cannot substitute a shared close function or trigger getters', async t => {
  for (const family of ['1', '2']) for (const proxy of [false, true]) {
    const f = fixture(t, { family }); await f.pairs[0].claim.bind(f.observer);
    let reads = 0;
    const fake = proxy ? new Proxy(f.graph, { get() { reads++; throw new Error('UNEXPECTED_PROXY_READ'); } })
      : Object.freeze({ ...f.graph, get close() { reads++; throw new Error('UNEXPECTED_CLOSE_GETTER'); } });
    await assert.rejects(f.pairs[0].graph.bind({ ...f.binding, [family === '1' ? 'bitcoin' : 'solana']: fake }), causedBy(/TEST_OWNED_NATIVE/));
    assert.equal(reads, 0);
  }
});

test('claim post-sign return refuses a newly learned graph failure and poisons the shared key', async t => {
  const f = fixture(t), q = await f.bind(); await q.graph.facts(f.addGraphFact());
  f.controls.beforeRecovery = () => { f.controls.graphUnavailable = true; };
  await assert.rejects(f.pairs[0].claim.signHealth({ claimDomain: f.domain, mode: 'debt' }), causedBy(/FLAT_OPERATOR_INVENTORY_BLOCKED/));
  assert.equal(f.pairs[0].claim.status().poisoned, true);
  assert.equal(f.pairs[0].graph.status().poisoned, true);
});

test('a claim-side graph audit keeps both branches busy until its owned read completes', async t => {
  const f = fixture(t), q = await f.bind(); await q.graph.facts(f.addGraphFact());
  let release, entered;
  const reached = new Promise(resolve => { entered = resolve; }), pending = new Promise(resolve => { release = resolve; });
  f.controls.beforeGraphRead = async () => { entered(); await pending; };
  const operation = f.pairs[0].claim.signHealth({ claimDomain: f.domain, mode: 'debt' }); await reached;
  assert.throws(() => f.pairs[0].claim.close(), /BUSY/);
  assert.throws(() => f.pairs[0].graph.close(), /BUSY/);
  release(); await operation;
});

test('fresh and reused claim facts require graph coverage at the same canonical head', async t => {
  const f = fixture(t), q = await f.bind(); await q.graph.facts(f.addGraphFact());
  const request = await f.addClaimFact();
  f.controls.graphUnavailable = true;
  await assert.rejects(q.claim.facts(request), /FLAT_OPERATOR_INVENTORY_BLOCKED/);
  const staged = Object.values(f.claimStore().data.peers).flatMap(peer => peer.state.entries);
  assert.equal(staged.length, 1); assert.equal(staged[0].signature, null);
  f.controls.graphUnavailable = false;
  const facts = await q.claim.facts(request);
  assert.equal(facts.certificates.length, 3);
  f.controls.claimHead = { ...f.head, hash: sha('claim-facts-different-head') };
  await assert.rejects(q.claim.facts(request), /FLAT_OPERATOR_CHANGED_DATA|TEST_CLAIM_HEAD_CHANGED/);
  f.controls.claimHead = null; f.controls.graphUnavailable = true;
  await assert.rejects(q.claim.facts(request), /FLAT_OPERATOR_INVENTORY_BLOCKED/);
  f.controls.graphUnavailable = false;
  const reused = await q.claim.facts(request);
  assert.deepEqual(reused.certificates.map(row => row.signature), facts.certificates.map(row => row.signature));
});

test('claim facts signer rechecks graph inventory after its exact durable pre-sign journal write', async t => {
  const f = fixture(t), q = await f.bind(); await q.graph.facts(f.addGraphFact());
  const request = await f.addClaimFact(); let reached = false;
  f.claimStore().beforeUpdate = data => {
    if (Object.values(data.peers).some(peer => peer.state.entries.some(entry => entry.signature === null))) {
      reached = true; f.controls.graphUnavailable = true;
    }
  };
  await assert.rejects(f.pairs[0].claim.signFacts(request), /FLAT_OPERATOR_INVENTORY_BLOCKED/);
  assert.equal(reached, true);
  const retained = Object.values(f.claimStore().data.peers).flatMap(peer => peer.state.entries);
  assert.equal(retained.length, 1); assert.equal(retained[0].signature, null);
  assert.equal(f.pairs[0].claim.status().poisoned, false);
});

test('graph revocation retains its observed adverse purpose while still requiring fresh claim coverage', async t => {
  const f = fixture(t), q = await f.bind(), facts = await q.graph.facts(f.addGraphFact());
  const request = { nativeGid: facts.certificates[0].facts.nativeGid };
  f.controls.graphAdverse = true; f.controls.liability = '1';
  await assert.rejects(q.graph.revocation(request), /CLAIM_CURRENT_PRINCIPAL_DEFICIT/);
  assert.equal(f.controls.recoveries, 0);
  f.controls.liability = '0';
  await assert.rejects(q.graph.revocation(request), /FLAT_OPERATOR_UNFINISHED_AUTHORIZATION/);
  assert.equal(f.controls.recoveries, 0, 'V3 never silently completes a prior unsigned authorization');
});

test('reciprocal scans retain the original 30-second monotonic guard', async t => {
  const f = fixture(t), q = await f.bind(); await q.graph.facts(f.addGraphFact());
  let time = 0; const clock = mock.method(performance, 'now', () => time);
  try {
    f.controls.beforeGraphRead = () => { time = 30000; };
    await assert.rejects(f.pairs[0].claim.signHealth({ claimDomain: f.domain, mode: 'debt' }), /AUDIT_TOO_OLD/);
    assert.equal(f.controls.recoveries, 0);
  } finally { clock.mock.restore(); }
});

test('unchanged same-head graph audits skip identical writes but retain the first and changed audit', async t => {
  const f = fixture(t); await f.bind(); const store = f.graphStore();
  assert.equal(store.writes, 0); assert.equal(store.data.lastAudit, null);
  const initial = await f.pairs[0].graph.audit();
  assert.equal(store.writes, 1); assert.deepEqual(store.data.lastAudit, initial);
  await f.pairs[0].graph.audit(); assert.equal(store.writes, 1);
  Object.assign(f.head, { number: '61', timestamp: '1001', hash: sha('next-graph-audit-head') });
  const changed = await f.pairs[0].graph.audit();
  assert.equal(store.writes, 2); assert.deepEqual(store.data.lastAudit, changed);
  await f.pairs[0].graph.audit(); assert.equal(store.writes, 2);
});

test('write elision preserves adverse history and unavailable reads fail closed', async t => {
  const f = fixture(t), q = await f.bind(), request = f.addGraphFact();
  const fact = await q.graph.facts(request), gid = fact.certificates[0].facts.nativeGid, store = f.graphStore();
  const before = store.writes;
  f.controls.graphAdverse = true;
  await assert.rejects(f.pairs[0].claim.signHealth({ claimDomain: f.domain, mode: 'debt' }), /FLAT_OPERATOR_INVENTORY_BLOCKED/);
  assert.ok(store.writes > before); assert.ok(store.data.adverse[gid]);
  assert.ok(store.data.lastAudit.blockers.some(row => row.nativeGid === gid && row.status === 'adverse'));
  f.controls.graphAdverse = false;
  await assert.rejects(f.pairs[0].claim.signHealth({ claimDomain: f.domain, mode: 'debt' }), /CLAIM_UNRESOLVED_ATTESTATION/);
  assert.ok(store.data.adverse[gid]);
  store.data.lastAudit = null;
  await assert.rejects(f.pairs[0].graph.audit(), /FLAT_OPERATOR_INVENTORY_UNAVAILABLE_OR_CHANGED/);
  assert.equal(f.pairs[0].claim.status().poisoned, true);
});

test('each operator reuses only its own original current EVM view while native inventory audits repeat', async t => {
  const f = fixture(t), q = await f.bind();
  const stats = f.controls.readerStats;
  assert.equal(stats.length, 6);
  assert.deepEqual(stats.map(row => row.reads), [1, 0, 1, 0, 1, 0]);
  const checks = stats.map(row => row.currentChecks);
  await q.claim.backing(f.preposition());
  assert.deepEqual(stats.map(row => row.reads), [1, 0, 1, 0, 1, 0], 'same immutable head must not reconstruct per signature gate');
  for (const i of [0, 2, 4]) assert.ok(stats[i].currentChecks > checks[i]);
  assert.ok(f.controls.headerReads >= 9, 'each operator freshly checks its own view and two reciprocal boundaries');
  await q.graph.facts(f.addGraphFact());
  const before = f.controls.graphReads.length, inventoryBefore = f.controls.inventoryReads;
  await q.claim.health({ claimDomain: f.domain, mode: 'debt' });
  assert.ok(f.controls.graphReads.length > before, 'cached EVM view never substitutes native observations');
  assert.ok(f.controls.inventoryReads > inventoryBefore, 'claim inventories remain fresh');
  assert.deepEqual(stats.map(row => row.reads), [1, 0, 1, 0, 1, 0]);
});

test('view cache is bounded per pool and replaces the exact slot on number, hash or timestamp changes', async t => {
  const f = fixture(t); await f.bind(); const [zero, one] = f.controls.readerStats;
  await f.pairs[0].graph.health({ poolIndex: 1 });
  assert.equal(zero.reads, 1); assert.equal(one.reads, 1);
  await f.pairs[0].graph.health({ poolIndex: 1 }); assert.equal(one.reads, 1);
  for (const change of [{ number: '61' }, { hash: sha('same-height-reorg') }, { timestamp: '1001' }]) {
    Object.assign(f.head, change);
    const before = zero.reads;
    await f.pairs[0].graph.audit(); assert.equal(zero.reads, before + 1);
    await f.pairs[0].graph.audit(); assert.equal(zero.reads, before + 1);
    assert.equal(one.reads, 1, 'the other pool is neither shared nor eagerly reconstructed');
  }
  await f.pairs[0].graph.health({ poolIndex: 1 }); assert.equal(one.reads, 2);
});

test('cached view validation and header failures fail closed without reconstruction fallback', async t => {
  for (const failure of ['currentFailure', 'blockFailure']) {
    const f = fixture(t); await f.bind(); const stats = f.controls.readerStats[0], before = stats.reads;
    f.controls[failure] = true;
    await assert.rejects(f.pairs[0].graph.audit(), failure === 'currentFailure' ? /TEST_CURRENT_VALIDATION_FAILED/ : /TEST_CURRENT_HEADER_UNAVAILABLE/);
    assert.equal(stats.reads, before, 'a failed validation cannot silently replace the rejected view');
    f.controls[failure] = false;
    await f.pairs[0].graph.audit(); assert.equal(stats.reads, before + 1, 'the failed cache slot must be discarded');
  }
});

test('head movement after the cache header check is rejected by the original reader', async t => {
  const f = fixture(t); await f.bind(); const stats = f.controls.readerStats[0], before = stats.reads;
  f.controls.beforeCurrent = () => { f.controls.beforeCurrent = null; f.head.hash = sha('raced-current-head'); };
  await assert.rejects(f.pairs[0].graph.audit(), /TEST_GRAPH_HEAD_CHANGED/);
  assert.equal(stats.reads, before); assert.equal(f.controls.recoveries, 0);
  await f.pairs[0].graph.audit(); assert.equal(stats.reads, before + 1);
});

test('backing and paired health reserve and complete atomically behind independent pre-key and post-persistence audits', async t => {
  const f = fixture(t); await f.bind(); const store = f.claimStore(), headers = f.controls.headerReads;
  const result = await f.pairs[0].claim.signBacking(f.preposition());
  const writes = store.updates.filter(row => row.authorizations.length > 0).map(row => row.authorizations);
  assert.equal(writes.length, 2);
  assert.deepEqual(writes[0].map(row => [row.kind, row.signature, row.abiSignature]),
    [['backing', null, null], ['health', null, null]]);
  assert.ok(writes[1].every(row => row.signature && row.abiSignature));
  assert.equal(f.controls.headerReads - headers, 3);
  assert.equal(f.controls.recoveries, 4);
  assert.equal(result.digest, claimHash(claimBackingFrame(result.message)));
  assert.equal(result.healthCertificate.digest, claimHash(encodeFlatNativeHealth(result.healthCertificate.message)));
  assert.deepEqual(result.head, result.healthCertificate.head);
  assert.equal(result.signature, writes[1][0].signature);
  assert.equal(result.healthCertificate.signature, writes[1][1].signature);
  assert.equal(f.pairs[0].claim.signedPair, undefined);
});

test('partial cached health signs only its missing backing and exact paired reuse has no key operation', async t => {
  const f = fixture(t); await f.bind();
  const oldHealth = await f.pairs[0].claim.signHealth({ claimDomain: f.domain, mode: 'debt' });
  const before = f.controls.recoveries, headers = f.controls.headerReads;
  const request = f.preposition(), result = await f.pairs[0].claim.signBacking(request);
  assert.equal(result.healthCertificate.signature, oldHealth.signature);
  assert.equal(f.controls.recoveries - before, 2);
  assert.equal(f.controls.headerReads - headers, 3);
  const signed = f.controls.recoveries, reusedHeaders = f.controls.headerReads;
  const reused = await f.pairs[0].claim.signBacking(request);
  assert.equal(reused.signature, result.signature);
  assert.equal(reused.healthCertificate.signature, oldHealth.signature);
  assert.equal(f.controls.recoveries, signed);
  assert.equal(f.controls.headerReads - reusedHeaders, 2, 'own claim view and joint graph audit both validate the fresh head');
});

test('different backing digests never mix while the identical health digest may be reused', async t => {
  const f = fixture(t); await f.bind();
  const first = await f.pairs[0].claim.signBacking(f.preposition());
  const second = await f.pairs[0].claim.signBacking(f.preposition(sha('different-owner-output')));
  assert.notEqual(first.message.actionDigest, second.message.actionDigest);
  assert.notEqual(first.digest, second.digest); assert.notEqual(first.signature, second.signature);
  assert.equal(first.healthCertificate.digest, second.healthCertificate.digest);
  assert.equal(first.healthCertificate.signature, second.healthCertificate.signature);
  assert.equal(f.claimStore().data.authorizations.length, 3);
  assert.equal(f.controls.recoveries, 6);
  const verifier = createNativeQuorumHostVerifier({ registry: f.registry, expectedRegistryCommitment: f.system.registryCommitment.slice(2) });
  const q = createClaimOperatorQuorum({ operators: f.pairs.slice(0, 3).map(pair => pair.claim) });
  const complete = await q.backing(f.preposition(sha('different-owner-output')));
  verifier.assertQuorumForMessage({ messageBytes: claimBackingFrame(complete.message), indexes: complete.indexes, signatures: complete.signatures });
  assert.throws(() => verifier.assertQuorumForMessage({ messageBytes: claimBackingFrame(first.message), indexes: complete.indexes, signatures: complete.signatures }));
});

test('a failed post-reservation joint check leaves all missing rows unsigned and retries fail closed', async t => {
  for (const cachedHealth of [false, true]) {
    const f = fixture(t); await f.bind(); await f.pairs[0].graph.certify(f.addGraphFact());
    if (cachedHealth) await f.pairs[0].claim.signHealth({ claimDomain: f.domain, mode: 'debt' });
    const before = f.controls.recoveries;
    f.claimStore().beforeUpdate = data => {
      if (data.authorizations.some(row => row.signature === null)) f.controls.graphUnavailable = true;
    };
    await assert.rejects(f.pairs[0].claim.signBacking(f.preposition()), /FLAT_OPERATOR_INVENTORY_BLOCKED/);
    assert.equal(f.controls.recoveries, before);
    const rows = f.claimStore().data.authorizations;
    assert.equal(rows.length, 2); assert.equal(rows.filter(row => row.signature === null).length, cachedHealth ? 1 : 2);
    assert.equal(f.pairs[0].claim.status().poisoned, false);
    f.claimStore().beforeUpdate = null; f.controls.graphUnavailable = false;
    await assert.rejects(f.pairs[0].claim.signBacking(f.preposition()), /CLAIM_UNRESOLVED_ATTESTATION/);
    assert.equal(f.controls.recoveries, before);
  }
});

test('paired reserve, recovery, completion and final-audit failures cannot expose a partial pair', async t => {
  for (const failure of ['reserve-write', 'recovery', 'complete-write', 'final-audit']) {
    const f = fixture(t); await f.bind(); await f.pairs[0].graph.certify(f.addGraphFact());
    const store = f.claimStore();
    if (failure === 'recovery') f.controls.beforeRecovery = () => { throw new Error('TEST_RECOVERY_FAILURE'); };
    else store.beforeUpdate = data => {
      if (data.authorizations.length !== 2) return;
      const completed = data.authorizations.every(row => row.signature && row.abiSignature);
      if (failure === 'reserve-write' && !completed) throw new Error('TEST_RESERVE_WRITE_FAILURE');
      if (failure === 'complete-write' && completed) throw new Error('TEST_COMPLETE_WRITE_FAILURE');
      if (failure === 'final-audit' && completed) f.controls.graphUnavailable = true;
    };
    await assert.rejects(f.pairs[0].claim.signBacking(f.preposition()), failure === 'reserve-write'
      ? /CLAIM_OPERATOR_DURABLE_WRITE_UNCERTAIN/ : /CLAIM_ATTESTATION_UNCERTAIN/);
    const rows = store.data.authorizations;
    assert.equal(rows.length, 2);
    assert.ok(rows.every(row => row.signature === null) || rows.every(row => row.signature && row.abiSignature));
    assert.equal(f.pairs[0].claim.status().poisoned, true); assert.equal(f.pairs[0].graph.status().poisoned, true);
  }
});

test('paired reservation and standalone claim backing preserve specialized outcomes and original unsent custody', async t => {
  for (const standalone of [false, true]) {
    const f = fixture(t, { standalone }), q = await f.bind();
    await f.addClaimFact({ staged: true });
    const result = await q.claim.reservation(f.reservation());
    assert.equal(result.authorization.healthSignatures.length, 3);
    assert.equal(result.message.nativePrincipalAvailable, '0', 'the exact staged ingress is not claimed as delivered principal');
    assert.equal(f.custody.transfers[0].phase, 'SIGNED_NOT_BROADCAST');
    assert.equal(f.custody.transfers[0].broadcastAttempts, 0);
    for (let i = 0; i < 3; i++) {
      const rows = f.claimStore(i).data.authorizations;
      assert.deepEqual(rows.map(row => row.kind), ['reservation', 'health']);
      assert.ok(rows.every(row => row.signature && row.abiSignature));
    }
  }
  const f = fixture(t, { standalone: true }), q = await f.bind();
  const first = await q.claim.backing(f.preposition()), reused = await q.claim.backing(f.preposition());
  assert.deepEqual(reused.signatures, first.signatures);
  assert.deepEqual(reused.authorization.healthSignatures, first.authorization.healthSignatures);
  assert.equal(f.controls.recoveries, 12, 'standalone fresh pair has two real signatures per operator and reuse signs nothing');
});

test('parallel graph checkpoint and health respect the owned shared-node observation/inventory fence', async t => {
  const f = fixture(t), q = await f.bind();
  await f.addClaimFact(); f.controls.exclusiveNativeReads = true;
  const checkpoint = await q.graph.checkpoint({ poolIndex: 0, requestId: sha('exclusive-read-checkpoint') });
  assert.equal(checkpoint.signatures.length, 3);
  const health = await q.graph.health({ poolIndex: 0 }); assert.equal(health.signatures.length, 3);
  assert.equal(f.controls.nativeReadCollisions, 0);
  assert.equal(f.controls.nativeReadBusy, false);
});

test('parallel last-two graph facts and subsequent audits use distinct fresh serialized native reads', async t => {
  const f = fixture(t), q = await f.bind(); await f.addClaimFact(); f.controls.exclusiveNativeReads = true;
  const request = f.addGraphFact(), result = await q.graph.facts(request);
  assert.equal(result.certificates.length, 3);
  assert.ok(f.controls.graphReads.length >= 3);
  await q.graph.audit(); await q.graph.health({ poolIndex: 0 });
  assert.equal(f.controls.nativeReadCollisions, 0); assert.equal(f.controls.nativeReadBusy, false);
});

test('a failed queued native read drains the other graph signers without retrying or leaking a busy fence', async t => {
  const f = fixture(t), q = await f.bind(); await f.addClaimFact(); f.controls.exclusiveNativeReads = true;
  let count = 0, release, entered;
  const reached = new Promise(resolve => { entered = resolve; }), pending = new Promise(resolve => { release = resolve; });
  f.controls.beforeNativeRead = async () => {
    if (++count === 1) throw new Error('TEST_FIRST_NATIVE_READ_FAILED');
    if (count === 2) { entered(); await pending; }
  };
  let settled = false;
  const operation = q.graph.checkpoint({ poolIndex: 0, requestId: sha('queued-read-failure') });
  const watched = operation.finally(() => { settled = true; }); watched.catch(() => {});
  await reached; await new Promise(resolve => setImmediate(resolve));
  assert.equal(settled, false, 'the quorum must drain every started signer');
  release(); await assert.rejects(operation, /CLAIM_COMPLETE_AUDIT_UNAVAILABLE/);
  assert.equal(f.controls.nativeReadCollisions, 0); assert.equal(f.controls.nativeReadBusy, false);
  f.pairs.slice(0, 3).forEach(pair => pair.claim.close());
});

test('queued native reads do not authorize signing after head drift or the original thirty-second deadline', async t => {
  for (const changed of ['head', 'deadline']) {
    const f = fixture(t), q = await f.bind(); await f.addClaimFact(); f.controls.exclusiveNativeReads = true;
    let time = 0, release, entered, waiting = false;
    const clock = mock.method(performance, 'now', () => time);
    const reached = new Promise(resolve => { entered = resolve; }), pending = new Promise(resolve => { release = resolve; });
    f.controls.beforeNativeRead = async () => { if (!waiting) { waiting = true; entered(); await pending; } };
    try {
      const operation = q.graph.checkpoint({ poolIndex: 0, requestId: sha('queued-' + changed) });
      operation.catch(() => {}); await reached;
      if (changed === 'head') f.head.hash = sha('head-changed-while-queued'); else time = 30000;
      release(); await assert.rejects(operation);
      assert.equal(f.controls.recoveries, 0); assert.equal(f.controls.nativeReadCollisions, 0);
      assert.equal(f.controls.nativeReadBusy, false);
    } finally { clock.mock.restore(); }
  }
});

test('combined claim view cache is per operator and every reciprocal gate still reobserves native custody', async t => {
  const f = fixture(t), q = await f.bind(); await f.addClaimFact();
  Object.assign(f.head, { number: '62', hash: sha('post-reservation-head') });
  const reconstructed = f.controls.claimViews.length, inventories = f.controls.inventoryReads;
  f.controls.exclusiveNativeReads = true;
  const result = await q.graph.checkpoint({ poolIndex: 0, requestId: sha('cached-claim-view-checkpoint') });
  assert.equal(result.signatures.length, 3);
  const views = f.controls.claimViews.slice(reconstructed);
  assert.equal(views.length, 3); assert.equal(new Set(views).size, 3);
  assert.ok(views.every(Object.isFrozen));
  assert.equal(f.controls.inventoryReads - inventories, 6, 'two independent boundaries for each graph signer');
  assert.equal(f.controls.nativeReadEvents.filter(row => row.phase === 'start' && row.kind === 'claim-observation').length, 6);
  const currentChecks = f.controls.claimCurrentViews.length, before = f.controls.inventoryReads;
  await q.graph.health({ poolIndex: 0 });
  assert.equal(f.controls.claimViews.length - reconstructed, 3, 'unchanged EVM state is not reconstructed again');
  assert.ok(f.controls.claimCurrentViews.length > currentChecks, 'original observer validation is never cached');
  assert.equal(f.controls.inventoryReads - before, 6, 'native inventory is always independently fresh');
  assert.equal(f.controls.nativeReadCollisions, 0);
});

test('claim view cache reconstructs exact head changes and never silently falls back after failed validation', async t => {
  const f = fixture(t); await f.bind(); let reads = f.controls.claimViews.length;
  for (const change of [{ number: '61' }, { hash: sha('claim-same-height-reorg') }, { timestamp: '1001' }]) {
    Object.assign(f.head, change); await f.pairs[0].claim.audit(); assert.equal(f.controls.claimViews.length, ++reads);
    await f.pairs[0].claim.audit(); assert.equal(f.controls.claimViews.length, reads);
  }
  for (const failure of ['claimCurrentFailure', 'blockFailure']) {
    f.controls[failure] = true;
    await assert.rejects(f.pairs[0].claim.audit(), failure === 'claimCurrentFailure'
      ? /TEST_CLAIM_CURRENT_VALIDATION_FAILED/ : /TEST_CURRENT_HEADER_UNAVAILABLE/);
    assert.equal(f.controls.claimViews.length, reads, 'rejected cached views cannot silently trigger fallback');
    f.controls[failure] = false;
    await f.pairs[0].claim.audit(); assert.equal(f.controls.claimViews.length, ++reads);
  }
  f.controls.beforeClaimCurrent = () => { f.controls.beforeClaimCurrent = null; f.head.hash = sha('claim-head-raced'); };
  await assert.rejects(f.pairs[0].claim.audit(), /TEST_CLAIM_HEAD_CHANGED/);
  assert.equal(f.controls.claimViews.length, reads);
  await f.pairs[0].claim.audit(); assert.equal(f.controls.claimViews.length, ++reads);
});

test('graph V3 return audit follows persistence and reports the unchanged exact deadline phase', async t => {
  const f = fixture(t); await f.bind(); const store = f.graphStore();
  let time = 0, audits = 0; const clock = mock.method(performance, 'now', () => time);
  f.controls.beforeInventory = () => { audits++; time = audits === 1 ? 10000 : 30000; };
  try {
    await assert.rejects(f.pairs[0].graph.health({ poolIndex: 0 }), error => {
      assert.equal(error.code, 'FLAT_OPERATOR_SIGNING_UNCERTAIN');
      assert.equal(error.causeCode, 'FLAT_OPERATOR_AUDIT_TOO_OLD');
      assert.deepEqual(error.auditBudget, { phase: 'after-claim-coverage', elapsedMilliseconds: 30000, limitMilliseconds: 30000 });
      return true;
    });
    assert.equal(audits, 2); assert.equal(f.controls.recoveries, 2);
    assert.ok(store.data.authorizations[0].signature && store.data.authorizations[0].abiSignature);
    assert.equal(f.pairs[0].graph.status().poisoned, true); assert.equal(f.pairs[0].claim.status().poisoned, true);
  } finally { clock.mock.restore(); }
});

test('graph post-key recovery, completion persistence, head changes and native failures return no authorization', async t => {
  for (const failure of ['recovery', 'write', 'head', 'native']) {
    const f = fixture(t); await f.bind(); const store = f.graphStore();
    if (failure === 'recovery') f.controls.beforeRecovery = () => { throw new Error('FLAT_OPERATOR_EVM_RECOVERY'); };
    else store.beforeUpdate = data => {
      if (!data.authorizations.some(row => row.signature)) return;
      if (failure === 'write') throw new Error('CLAIM_STORE_TEST_ACK_LOST');
      if (failure === 'head') f.head.hash = sha('changed-after-graph-completion');
      if (failure === 'native') f.controls.unresolved = true;
    };
    await assert.rejects(f.pairs[0].graph.health({ poolIndex: 0 }), /FLAT_OPERATOR_SIGNING_UNCERTAIN/);
    assert.equal(f.pairs[0].graph.status().poisoned, true); assert.equal(f.pairs[0].claim.status().poisoned, true);
    assert.equal(store.data.authorizations.length, 1);
    assert.equal(Boolean(store.data.authorizations[0].signature), failure !== 'recovery');
  }
});

test('claim authorization rejects a current-view await crossing exactly thirty seconds before key use', async t => {
  const f = fixture(t); await f.bind(); const store = f.claimStore();
  let time = 0, crossed = false; const clock = mock.method(performance, 'now', () => time);
  store.beforeUpdate = data => {
    if (!data.authorizations.some(row => row.signature === null)) return;
    f.controls.beforeClaimCurrent = async () => { crossed = true; time = 30_000; };
  };
  try {
    await assert.rejects(f.pairs[0].claim.signHealth({ claimDomain: f.domain, mode: 'debt' }), /CLAIM_OPERATOR_AUDIT_TOO_OLD/);
    assert.equal(crossed, true); assert.equal(f.controls.recoveries, 0);
    assert.equal(store.data.authorizations.length, 1);
    assert.equal(store.data.authorizations[0].signature, null); assert.equal(store.data.authorizations[0].abiSignature, null);
  } finally { clock.mock.restore(); }
});

test('cached graph health retains one full final reciprocal audit and quorum final reconstruction', async t => {
  const f = fixture(t), q = await f.bind(); await f.addClaimFact();
  const request = { poolIndex: 0 }, original = await q.graph.health(request);
  const inventories = f.controls.inventoryReads, recoveries = f.controls.recoveries;
  const reads = f.controls.readerStats.reduce((sum, row) => sum + row.reads, 0);
  const repeated = await q.graph.health(request);
  assert.deepEqual(repeated.signatures, original.signatures); assert.equal(f.controls.recoveries, recoveries);
  assert.equal(f.controls.inventoryReads - inventories, 3, 'one independently observed full return gate for every cached signer');
  assert.equal(f.controls.readerStats.reduce((sum, row) => sum + row.reads, 0) - reads, 1,
    'quorum retains its separate complete raw-state reconstruction');
  f.controls.unresolved = true;
  await assert.rejects(q.graph.health(request), /CLAIM_COMPLETE_AUDIT_UNAVAILABLE/);
  assert.equal(f.controls.recoveries, recoveries, 'changed custody cannot reuse an old health authorization');
});

test('funded graph authority paths cover checkpoint, dispatch reuse, facts, admission and settlement health', async t => {
  const f = fixture(t), q = await f.bind(); await f.addClaimFact();
  f.controls.exclusiveNativeReads = true;
  const healthRequest = { poolIndex: 0 };
  const initial = await q.graph.health(healthRequest);
  const checkpoint = await q.graph.checkpoint({ poolIndex: 0, requestId: sha('all-paths-checkpoint') });
  assert.equal(checkpoint.signatures.length, 3);
  let before = f.controls.inventoryReads;
  const dispatch = await q.graph.health(healthRequest);
  assert.deepEqual(dispatch.signatures, initial.signatures);
  assert.equal(f.controls.inventoryReads - before, 3);
  before = f.controls.inventoryReads;
  const facts = await q.graph.facts(f.addGraphFact());
  assert.equal(facts.certificates.length, 3); assert.ok(f.controls.inventoryReads > before);
  const graphReads = f.controls.graphReads.length; before = f.controls.inventoryReads;
  const admission = await q.graph.health(healthRequest);
  assert.deepEqual(admission.signatures, initial.signatures);
  assert.equal(f.controls.inventoryReads - before, 3); assert.ok(f.controls.graphReads.length > graphReads);
  // Only the authority calls are modeled here; no proof or actual settlement
  // transition is claimed. The next canonical header requires fresh views.
  Object.assign(f.head, { number: '62', hash: sha('all-paths-settlement-head'), timestamp: '1001' });
  before = f.controls.inventoryReads;
  const settlement = await q.graph.health(healthRequest);
  assert.equal(settlement.signatures.length, 3); assert.equal(f.controls.inventoryReads - before, 6);
  assert.notDeepEqual(settlement.signatures, initial.signatures);
  assert.deepEqual(settlement.head, f.head);
  assert.equal(f.controls.nativeReadCollisions, 0); assert.equal(f.controls.nativeReadBusy, false);
  assert.equal(f.controls.nativeReadEvents.filter(row => row.phase === 'start').length,
    f.controls.nativeReadEvents.filter(row => row.phase === 'end').length);
});

test('post-completion current awaits crossing the deadline withhold signatures and poison both shared branches', async t => {
  for (const branch of ['claim', 'graph']) {
    const f = fixture(t); await f.bind(); const store = branch === 'claim' ? f.claimStore() : f.graphStore();
    let time = 0, crossed = false; const clock = mock.method(performance, 'now', () => time);
    store.beforeUpdate = data => {
      if (!data.authorizations.some(row => row.signature)) return;
      const crossing = async () => { crossed = true; time = 30_000; };
      if (branch === 'claim') f.controls.beforeClaimCurrent = crossing;
      else f.controls.beforeCurrent = crossing;
    };
    try {
      const request = branch === 'claim' ? { claimDomain: f.domain, mode: 'debt' } : { poolIndex: 0 };
      await assert.rejects((branch === 'claim' ? f.pairs[0].claim.signHealth(request) : f.pairs[0].graph.health(request)), causedBy(
        branch === 'claim' ? /CLAIM_OPERATOR_AUDIT_TOO_OLD/ : /FLAT_OPERATOR_AUDIT_TOO_OLD/));
      assert.equal(crossed, true); assert.equal(f.controls.recoveries, 2);
      assert.ok(store.data.authorizations[0].signature && store.data.authorizations[0].abiSignature);
      assert.equal(f.pairs[0].claim.status().poisoned, true); assert.equal(f.pairs[0].graph.status().poisoned, true);
    } finally { clock.mock.restore(); }
  }
});

test('claim quorum scheduling: actual health and unprepared issuance retain independent loaded native reads', async t => {
  for (const method of ['health', 'backing']) {
    const f = fixture(t), q = await f.bind(); await f.addClaimFact();
    await q.graph.facts(f.addGraphFact()); f.controls.exclusiveNativeReads = true;
    const events = f.controls.nativeReadEvents.length, graphReads = f.controls.graphReads.length;
    const result = method === 'health'
      ? await q.claim.health({ claimDomain: f.domain, mode: 'ingress' }) : await q.claim.backing(f.issue());
    assert.deepEqual(result.indexes, [0, 1, 2]); assert.equal(new Set(result.signatures).size, 3);
    assert.equal(f.controls.nativeReadCollisions, 0); assert.equal(f.controls.nativeReadBusy, false);
    const added = f.controls.nativeReadEvents.slice(events), starts = added.filter(row => row.phase === 'start');
    assert.equal(starts.filter(row => row.kind === 'claim-observation').length, 3,
      'every signer independently reobserves the retained claim');
    assert.equal(starts.filter(row => row.kind === 'claim-inventory').length, 3,
      'every signer independently reads full custody inventory');
    assert.equal(f.controls.graphReads.length - graphReads, 12,
      'both joint boundaries independently run both complete graph observations per signer');
    assert.equal(starts.length, added.filter(row => row.phase === 'end').length);
    for (let index = 0; index < 3; index++) {
      const authorizations = f.claimStore(index).data.authorizations;
      assert.ok(authorizations.some(row => row.kind === 'health' && row.signature));
      if (method === 'backing') assert.ok(authorizations.some(row => row.kind === 'backing' && row.signature));
    }
  }
});

test('claim quorum scheduling: original actors drain a successful durable tail after its sibling fails', async t => {
  const f = fixture(t), q = await f.bind(), views = f.controls.claimViews.slice(-3);
  assert.equal(views.length, 3); assert.equal(new Set(views).size, 3);
  const failure = new Error('TEST_FIRST_TAIL_CURRENT_FAILED');
  let release, entered, blocked = false, failed = false, settled = false;
  const reached = new Promise(resolve => { entered = resolve; }), pending = new Promise(resolve => { release = resolve; });
  f.controls.beforeClaimCurrent = async value => {
    if (value === views[1] && !failed) { failed = true; throw failure; }
    if (value === views[2] && !blocked) { blocked = true; entered(); await pending; }
  };
  const operation = q.claim.health({ claimDomain: f.domain, mode: 'debt' });
  operation.then(() => { settled = true; }, () => { settled = true; });
  const rejected = assert.rejects(operation, error => error === failure);
  await reached; await new Promise(resolve => setImmediate(resolve));
  assert.equal(failed, true); assert.equal(settled, false);
  assert.equal(f.pairs[1].claim.status().poisoned, false);
  await assert.rejects(q.claim.health({ claimDomain: f.domain, mode: 'debt' }), /CLAIM_QUORUM_BUSY/);
  assert.throws(() => f.pairs[2].claim.close(), /CLAIM_OPERATOR_BUSY/);
  assert.ok(f.claimStore(0).data.authorizations.some(row => row.signature));
  assert.equal(f.claimStore(1).data.authorizations.length, 0);
  assert.equal(f.claimStore(2).data.authorizations.length, 0);
  release(); await rejected;
  assert.ok(f.claimStore(2).data.authorizations.some(row => row.signature && row.abiSignature),
    'completed sibling signature stays durable although no quorum is returned');
  f.pairs.slice(0, 3).forEach(pair => pair.claim.close());
});

test('original authorization validation: health, backing and reservation reuse exact completed signatures without key use', async t => {
  for (const method of ['health', 'backing', 'reservation']) {
    const f = fixture(t), q = await f.bind();
    await f.addClaimFact({ staged: method === 'reservation' });
    if (method !== 'reservation') await q.graph.facts(f.addGraphFact());
    f.controls.exclusiveNativeReads = true;
    const input = method === 'health' ? { claimDomain: f.domain, mode: 'ingress' }
      : method === 'backing' ? f.issue() : f.reservation();
    const beforeOriginalKeys = attesterKeyUses;
    const original = await q.claim[method](input), keyUses = attesterKeyUses, recoveries = f.controls.recoveries;
    assert.ok(keyUses > beforeOriginalKeys, 'the key-use sentinel observes original issuance');
    const before = [0, 1, 2].map(index => copy(f.claimStore(index).data.authorizations));
    const nativeEvents = f.controls.nativeReadEvents.length, graphReads = f.controls.graphReads.length;
    const auditCounts = [0, 1, 2].map(index => f.claimStore(index).data.inventoryAudits.length);
    assert.equal(await q.claim.assertOriginalAuthorizationCurrent(original), undefined);
    assert.equal(attesterKeyUses, keyUses, 'no attester signing function may run during original validation');
    assert.equal(f.controls.recoveries, recoveries, 'no signature recovery/key path may run');
    assert.deepEqual([0, 1, 2].map(index => f.claimStore(index).data.authorizations), before);
    const reads = f.controls.nativeReadEvents.slice(nativeEvents).filter(event => event.phase === 'start');
    assert.equal(reads.filter(event => event.kind === 'claim-inventory').length, 3);
    assert.equal(reads.filter(event => event.kind === 'claim-observation').length, method === 'reservation' ? 0 : 3);
    assert.equal(f.controls.graphReads.length - graphReads, method === 'reservation' ? 0 : 6);
    assert.equal(f.controls.nativeReadCollisions, 0); assert.equal(f.controls.nativeReadBusy, false);
    if (method !== 'health') for (let index = 0; index < 3; index++)
      assert.equal(f.claimStore(index).data.inventoryAudits.length, auditCounts[index] + 1,
        'fresh inventory audit evidence remains durable');
  }
});

test('original authorization validation: copied, serialized, altered, foreign and reopened-quorum results have no provenance', async t => {
  const f = fixture(t), q = await f.bind();
  const original = await q.claim.health({ claimDomain: f.domain, mode: 'debt' });
  const restored = createClaimOperatorQuorum({ operators: f.pairs.slice(0, 3).map(pair => pair.claim) });
  const other = fixture(t), otherQuorums = await other.bind();
  const foreign = await otherQuorums.claim.health({ claimDomain: other.domain, mode: 'debt' });
  const inputs = [null, {}, copy(original), JSON.parse(JSON.stringify(original)), foreign,
    { ...copy(original), signatures: ['changed'] }, { ...copy(original), head: { ...original.head, timestamp: '1' } }];
  const keyUses = attesterKeyUses, reads = f.controls.inventoryReads;
  for (const value of inputs) assert.throws(() => q.claim.assertOriginalAuthorizationCurrent(value), /ORIGINAL_QUORUM_AUTHORIZATION_REQUIRED/);
  assert.throws(() => restored.assertOriginalAuthorizationCurrent(original), /ORIGINAL_QUORUM_AUTHORIZATION_REQUIRED/);
  assert.throws(() => q.claim.assertOriginalAuthorizationCurrent(original, {}), /NO_OPTIONS/);
  assert.equal(attesterKeyUses, keyUses); assert.equal(f.controls.inventoryReads, reads);
});

test('original authorization validation: missing or replaced retained rows fail before any new authorization or key use', async t => {
  for (const mutate of [rows => rows.splice(0, 1), rows => rows.splice(1, 1),
    rows => { rows[0].signature = null; }, rows => { rows[1].abiSignature = null; },
    rows => { rows[0].signature = '11'.repeat(64); }, rows => { rows[1].abiSignature.r = '22'.repeat(32); },
    rows => { rows[0].message.nativePrincipalAvailable = '999'; }, rows => { rows[0].digest = '33'.repeat(32); }]) {
    const f = fixture(t), q = await f.bind(), original = await q.claim.backing(f.preposition());
    const keyUses = attesterKeyUses, recoveries = f.controls.recoveries, store = f.claimStore(0);
    // The test store injects a coherent but changed return during the required
    // fresh inventory-audit write, exercising the no-fallback guard itself.
    // Real storage additionally authenticates its own writes and readback.
    store.beforeUpdate = () => { store.beforeUpdate = null; mutate(store.data.authorizations); };
    const counts = [0, 1, 2].map(index => f.claimStore(index).data.authorizations.length);
    await assert.rejects(q.claim.assertOriginalAuthorizationCurrent(original), /CLAIM_ORIGINAL_AUTHORIZATION_/);
    assert.equal(attesterKeyUses, keyUses); assert.equal(f.controls.recoveries, recoveries);
    assert.ok(f.claimStore(0).data.authorizations.length <= counts[0]);
    for (const index of [1, 2]) assert.equal(f.claimStore(index).data.authorizations.length, counts[index]);
  }
});

test('original authorization validation: changed economic inventory, head and expired-head conditions never re-sign', async t => {
  for (const change of ['economics', 'head', 'expired']) {
    const f = fixture(t), q = await f.bind(); await f.addClaimFact();
    const original = await q.claim.backing(f.issue()), keyUses = attesterKeyUses;
    const before = [0, 1, 2].map(index => copy(f.claimStore(index).data.authorizations));
    if (change === 'economics') f.controls.principal = String(BigInt(f.controls.principal) + 1n);
    else { f.head.hash = sha('changed-original-validation-' + change); f.head.number = '99';
      if (change === 'expired') f.head.timestamp = original.message.validUntil; }
    await assert.rejects(q.claim.assertOriginalAuthorizationCurrent(original),
      change === 'economics' ? /CLAIM_ORIGINAL_AUTHORIZATION_MESSAGE/ : /CLAIM_ORIGINAL_QUORUM_AUTHORIZATION_HEAD/);
    assert.equal(attesterKeyUses, keyUses);
    assert.deepEqual([0, 1, 2].map(index => f.claimStore(index).data.authorizations), before);
  }
});

test('original authorization validation: fresh adverse graph history is retained and cannot return success', async t => {
  const f = fixture(t), q = await f.bind(); await f.addClaimFact(); await q.graph.facts(f.addGraphFact());
  const original = await q.claim.health({ claimDomain: f.domain, mode: 'debt' }), keyUses = attesterKeyUses;
  const authorizations = copy(f.claimStore(0).data.authorizations); f.controls.graphAdverse = true;
  await assert.rejects(q.claim.assertOriginalAuthorizationCurrent(original), /FLAT_OPERATOR_INVENTORY_BLOCKED/);
  assert.ok(Object.keys(f.graphStore(0).data.adverse).length > 0);
  assert.deepEqual(f.claimStore(0).data.authorizations, authorizations); assert.equal(attesterKeyUses, keyUses);
});

test('original authorization validation: failed tail drains fresh sibling validation without releasing busy or using keys', async t => {
  const f = fixture(t), q = await f.bind(), original = await q.claim.health({ claimDomain: f.domain, mode: 'debt' });
  const views = f.controls.claimViews.slice(0, 3), failure = new Error('TEST_ORIGINAL_VALIDATION_TAIL_FAILED');
  let release, entered, blocked = false, failed = false, settled = false;
  const reached = new Promise(resolve => { entered = resolve; }), pending = new Promise(resolve => { release = resolve; });
  f.controls.beforeClaimCurrent = async value => {
    if (value === views[1] && !failed) { failed = true; throw failure; }
    if (value === views[2] && !blocked) { blocked = true; entered(); await pending; }
  };
  const keyUses = attesterKeyUses, authorizations = [0, 1, 2].map(index => copy(f.claimStore(index).data.authorizations));
  const operation = q.claim.assertOriginalAuthorizationCurrent(original);
  operation.then(() => { settled = true; }, () => { settled = true; });
  const rejected = assert.rejects(operation, error => error === failure);
  await reached; await new Promise(resolve => setImmediate(resolve));
  assert.equal(failed, true); assert.equal(settled, false);
  await assert.rejects(q.claim.assertOriginalAuthorizationCurrent(original), /CLAIM_QUORUM_BUSY/);
  assert.throws(() => f.pairs[2].claim.close(), /CLAIM_OPERATOR_BUSY/);
  release(); await rejected;
  assert.equal(attesterKeyUses, keyUses);
  assert.deepEqual([0, 1, 2].map(index => f.claimStore(index).data.authorizations), authorizations);
});

test('original authorization validation: late close or exact deadline cannot expose a successful result', async t => {
  for (const change of ['closed', 'deadline']) {
    const f = fixture(t), q = await f.bind(), original = await q.claim.health({ claimDomain: f.domain, mode: 'debt' });
    const keyUses = attesterKeyUses;
    let release, entered, blocked = false, time = 0;
    const clock = mock.method(performance, 'now', () => time);
    const reached = new Promise(resolve => { entered = resolve; }), pending = new Promise(resolve => { release = resolve; });
    f.controls.beforeClaimCurrent = async value => {
      if (value === f.controls.claimViews.at(-1) && !blocked) { blocked = true; entered(); await pending; }
    };
    try {
      const operation = q.claim.assertOriginalAuthorizationCurrent(original);
      const rejected = assert.rejects(operation, change === 'closed' ? /CLOSED_OR_POISONED/ : /AUDIT_TOO_OLD/);
      await reached;
      if (change === 'closed') f.pairs[0].claim.close(); else time = 30_000;
      release(); await rejected; assert.equal(attesterKeyUses, keyUses);
    } finally { clock.mock.restore(); }
  }
});

test('graph facts V2: each original loaded signer revalidates complete claim and graph custody without shared observations', async t => {
  const f = fixture(t), q = await f.bind(); await f.addClaimFact();
  f.controls.exclusiveNativeReads = true;
  const events = f.controls.nativeReadEvents.length, keyUses = attesterKeyUses;
  const request = f.addGraphFact(), result = await q.graph.facts(request);
  const reads = f.controls.nativeReadEvents.slice(events).filter(row => row.phase === 'start');
  assert.equal(reads.filter(row => row.kind === 'claim-observation').length, 9,
    'two original coverage boundaries plus the unchanged V2 final full audit per actor');
  assert.equal(reads.filter(row => row.kind === 'claim-inventory').length, 9);
  assert.equal(reads.filter(row => row.kind === 'graph-observation').length, 9,
    'one original observation and two independent final inventory observations per actor');
  assert.equal(attesterKeyUses, keyUses, 'fresh final validation creates no claim/graph authorization');
  for (const i of [0, 1, 2]) {
    assert.equal(f.claimStore(i).data.authorizations.length, 0);
    assert.equal(f.graphStore(i).data.authorizations.length, 0);
    const entry = f.graphStore(i).data.inventories['2'].state.entries[0];
    assert.equal(entry.signature, result.certificates[i].signature);
    assert.deepEqual(entry.facts, result.certificates[i].facts);
  }
  assert.equal(f.controls.nativeReadCollisions, 0); assert.equal(f.controls.nativeReadBusy, false);
  assert.equal(result.freshness.allOriginalSignersRevalidated, true);
});

// V3 boundary tests observe real signing, durable row transitions and every
// independent native read, rather than inferring placement from lower counts.
function boundaryTrace(f, branch, facts = false) {
  const store = branch === 'graph' ? f.graphStore() : f.claimStore(), events = [];
  const rows = data => facts ? branch === 'graph' ? data.inventories['2'].state.entries
    : Object.values(data.peers).flatMap(peer => peer.state.entries) : data.authorizations;
  const projection = data => JSON.stringify(rows(data).map(row => [row.kind ?? 'facts', row.digest ?? row.facts.nativeGid, row.signature, row.abiSignature]));
  let prior = projection(store.data), keyCount = 0, firstKeyMicrotask = false;
  store.beforeUpdate = data => {
    const now = projection(data); if (now === prior) return; prior = now;
    events.push(rows(data).some(row => row.signature === null) ? 'stage' : 'persist');
  };
  onKeyUse = kind => {
    assert.equal(kind, facts ? 'facts' : 'authorization');
    assert.ok(rows(store.data).some(row => row.signature === null), 'durable exact unsigned intent precedes key use');
    if (++keyCount === 1) queueMicrotask(() => { firstKeyMicrotask = true; });
    else assert.equal(firstKeyMicrotask, false, 'at most two fixed pair key uses have no await between them');
    events.push('key');
  };
  if (branch === 'graph') f.controls.beforeInventory = () => { events.push('reciprocal'); };
  else f.controls.beforeGraphRead = () => { events.push('reciprocal'); };
  return { events, rows: () => rows(store.data), reset() { events.length = 0; keyCount = 0; firstKeyMicrotask = false; },
    close() { store.beforeUpdate = null; f.controls.beforeInventory = null; f.controls.beforeGraphRead = null; onKeyUse = null; } };
}

test('V3 graph health, checkpoint and revocation stage, independently audit, sign, persist and independently audit before return', async t => {
  for (const method of ['health', 'checkpoint', 'revocation']) {
    const f = fixture(t); await f.bind(); await f.addClaimFact();
    const certificate = await f.pairs[0].graph.certify(f.addGraphFact());
    if (method === 'revocation') f.controls.graphAdverse = true;
    const request = method === 'health' ? { poolIndex: 0 } : method === 'checkpoint'
      ? { poolIndex: 0, requestId: sha('v3-checkpoint-order') } : { nativeGid: certificate.facts.nativeGid };
    const trace = boundaryTrace(f, 'graph'), keys = attesterKeyUses;
    f.controls.exclusiveNativeReads = true; const reads = f.controls.nativeReadEvents.length;
    try {
      const result = await f.pairs[0].graph[method](request); trace.events.push('return');
      assert.deepEqual(trace.events, ['stage', 'reciprocal', 'key', 'persist', 'reciprocal', 'return'], method);
      assert.equal(attesterKeyUses - keys, 1); assert.equal(result.signature, trace.rows().at(-1).signature);
      const actual = f.controls.nativeReadEvents.slice(reads).filter(row => row.phase === 'start');
      assert.equal(actual.filter(row => row.kind === 'claim-observation').length, 2, 'both boundaries reobserve the original retained claim');
      assert.equal(actual.filter(row => row.kind === 'claim-inventory').length, 2, 'both boundaries read independent complete custody inventories');
      trace.reset();
      const reused = await f.pairs[0].graph[method](request); trace.events.push('return');
      assert.equal(reused.signature, result.signature); assert.equal(attesterKeyUses - keys, 1);
      assert.deepEqual(trace.events, ['reciprocal', 'return'], 'completed reuse has exactly one full final audit and zero key uses');
      assert.equal(f.pairs[0].auditBoundaryProfile, bridge.COMBINED_OPERATOR_AUDIT_BOUNDARY_PROFILE);
      assert.equal(f.pairs[0].auditBoundaryProfile, 'SAME_HOST_RECIPROCAL_AUDIT_BOUNDARIES_V3');
    } finally { trace.close(); }
  }
});

test('V3 claim single and paired authorizations retain own audits and independent reciprocal boundaries around exact key use', async t => {
  for (const paired of [false, true]) {
    const f = fixture(t); await f.bind(); await f.addClaimFact(); await f.pairs[0].graph.certify(f.addGraphFact());
    const trace = boundaryTrace(f, 'claim'), keys = attesterKeyUses, inventory = f.controls.inventoryReads;
    const run = () => paired ? f.pairs[0].claim.signBacking(f.issue()) : f.pairs[0].claim.signHealth({ claimDomain: f.domain, mode: 'debt' });
    try {
      const result = await run(); trace.events.push('return');
      assert.deepEqual(trace.events, ['stage', 'reciprocal', 'reciprocal', 'key', ...(paired ? ['key'] : []),
        'persist', 'reciprocal', 'reciprocal', 'return']);
      assert.equal(attesterKeyUses - keys, paired ? 2 : 1);
      assert.equal(f.controls.inventoryReads - inventory, 1, 'own full claim audit is unchanged');
      assert.ok(trace.rows().every(row => row.signature && row.abiSignature));
      if (paired) assert.equal(result.healthCertificate.signature, trace.rows()[1].signature);
      trace.reset(); const after = attesterKeyUses;
      const repeated = await run(); trace.events.push('return');
      assert.equal(repeated.signature, result.signature); assert.equal(attesterKeyUses, after);
      assert.deepEqual(trace.events, ['reciprocal', 'reciprocal', 'return']);
      assert.equal(f.controls.inventoryReads - inventory, 2, 'reuse repeats its own complete audit');
    } finally { trace.close(); }
  }
});

test('V3 graph and claim facts gate every actual facts key after unsigned staging, then independently audit persisted return and reuse', async t => {
  for (const branch of ['graph', 'claim']) {
    const f = fixture(t); await f.bind(); const claimRequest = await f.addClaimFact();
    if (branch === 'claim') await f.pairs[0].graph.certify(f.addGraphFact());
    const request = branch === 'graph' ? f.addGraphFact() : claimRequest;
    const run = () => branch === 'graph' ? f.pairs[0].graph.certify(request) : f.pairs[0].claim.signFacts(request);
    const trace = boundaryTrace(f, branch, true), keys = factsKeyUses;
    try {
      const result = await run(); trace.events.push('return');
      const reciprocal = branch === 'graph' ? ['reciprocal'] : ['reciprocal', 'reciprocal'];
      assert.deepEqual(trace.events, ['stage', ...reciprocal, 'key', 'persist', ...reciprocal, 'return']);
      assert.equal(factsKeyUses - keys, 1); assert.equal(trace.rows().length, 1);
      const certificate = branch === 'graph' ? result : result.certificate;
      assert.equal(certificate.signature, trace.rows()[0].signature);
      trace.reset(); const reused = await run(); trace.events.push('return');
      assert.equal(factsKeyUses - keys, 1);
      assert.deepEqual(trace.events, [...reciprocal, 'return']);
      assert.equal((branch === 'graph' ? reused : reused.certificate).signature, certificate.signature);
    } finally { trace.close(); }
  }
});

test('V3 pre-key native, head, deficit and exact-deadline faults after staging produce zero actual key uses', async t => {
  for (const branch of ['graph', 'claim']) for (const failure of ['native', 'head', 'deficit', 'deadline']) {
    const f = fixture(t); await f.bind(); await f.addClaimFact(); await f.pairs[0].graph.certify(f.addGraphFact());
    const store = branch === 'graph' ? f.graphStore() : f.claimStore();
    const beforeKeys = attesterKeyUses, beforeFacts = factsKeyUses;
    let time = 0, reached = false; const clock = mock.method(performance, 'now', () => time);
    store.beforeUpdate = data => {
      if (!data.authorizations.some(row => row.signature === null)) return; reached = true;
      if (failure === 'head') f.head.hash = sha('v3-prekey-changed-head');
      else if (failure === 'deadline') time = 30000;
      else if (branch === 'graph') {
        if (failure === 'native') f.controls.unresolved = true;
        else f.controls.principal = '0';
      } else if (failure === 'native') f.controls.graphUnavailable = true;
      else f.controls.graphAdverse = true; // reciprocal graph contradiction, no fabricated custody deficit
    };
    try {
      await assert.rejects(branch === 'graph' ? f.pairs[0].graph.health({ poolIndex: 0 })
        : f.pairs[0].claim.signBacking(f.issue()));
      assert.equal(reached, true); assert.equal(attesterKeyUses, beforeKeys); assert.equal(factsKeyUses, beforeFacts);
      assert.ok(store.data.authorizations.every(row => row.signature === null));
      assert.equal(f.pairs[0].claim.status().poisoned, false); assert.equal(f.pairs[0].graph.status().poisoned, false);
    } finally { clock.mock.restore(); }
  }
});

test('V3 facts pre-key hook refuses a newly unavailable reciprocal inventory after durable peer staging without a key use', async t => {
  for (const branch of ['graph', 'claim']) {
    const f = fixture(t); await f.bind(); const claimRequest = await f.addClaimFact();
    if (branch === 'claim') await f.pairs[0].graph.certify(f.addGraphFact());
    const store = branch === 'graph' ? f.graphStore() : f.claimStore(), keys = factsKeyUses;
    const entries = data => branch === 'graph' ? data.inventories['2'].state.entries : Object.values(data.peers).flatMap(peer => peer.state.entries);
    store.beforeUpdate = data => {
      if (entries(data).some(row => row.signature === null)) {
        if (branch === 'graph') f.controls.unresolved = true; else f.controls.graphUnavailable = true;
      }
    };
    await assert.rejects(branch === 'graph' ? f.pairs[0].graph.certify(f.addGraphFact()) : f.pairs[0].claim.signFacts(claimRequest));
    assert.equal(factsKeyUses, keys); assert.equal(entries(store.data).length, 1); assert.equal(entries(store.data)[0].signature, null);
    assert.equal(f.pairs[0].claim.status().poisoned, false); assert.equal(f.pairs[0].graph.status().poisoned, false);
  }
});

test('V3 persisted facts cannot return when a final readback crosses exactly thirty seconds or reciprocal history becomes unavailable', async t => {
  for (const branch of ['graph', 'claim']) for (const failure of ['deadline', 'native']) {
    const f = fixture(t); await f.bind(); const claimRequest = await f.addClaimFact();
    if (branch === 'claim') await f.pairs[0].graph.certify(f.addGraphFact());
    const store = branch === 'graph' ? f.graphStore() : f.claimStore(), keys = factsKeyUses;
    const entries = data => branch === 'graph' ? data.inventories['2'].state.entries : Object.values(data.peers).flatMap(peer => peer.state.entries);
    let time = 0, completed = false, reached = false; const clock = mock.method(performance, 'now', () => time);
    store.beforeUpdate = data => { if (entries(data).some(row => row.signature)) completed = true; };
    store.beforeRead = async () => {
      if (!completed) return; await Promise.resolve(); reached = true;
      if (failure === 'deadline') time = 30000;
      else if (branch === 'graph') f.controls.unresolved = true; else f.controls.graphUnavailable = true;
    };
    try {
      await assert.rejects(branch === 'graph' ? f.pairs[0].graph.certify(f.addGraphFact()) : f.pairs[0].claim.signFacts(claimRequest),
        branch === 'graph' ? /FLAT_OPERATOR_SIGNING_UNCERTAIN/ : /CLAIM_ATTESTATION_UNCERTAIN/);
      assert.equal(reached, true); assert.equal(factsKeyUses - keys, 1); assert.ok(entries(store.data)[0].signature);
      assert.equal(f.pairs[0].claim.status().poisoned, true); assert.equal(f.pairs[0].graph.status().poisoned, true);
    } finally { clock.mock.restore(); }
  }
});

test('V3 outer final current await is inside post-key uncertainty for authorizations and facts in both branches', async t => {
  for (const branch of ['graph', 'claim']) for (const facts of [false, true]) for (const failure of ['deadline', 'head']) {
    const f = fixture(t); await f.bind(); const claimRequest = await f.addClaimFact();
    if (branch === 'claim') await f.pairs[0].graph.certify(f.addGraphFact());
    let time = 0, reads = 0, finalChecks = 0, reached = false;
    const clock = mock.method(performance, 'now', () => time), keys = facts ? factsKeyUses : attesterKeyUses;
    const afterFinalAudit = async () => {
      if (reads < (branch === 'graph' ? 2 : 4) || ++finalChecks !== 2) return;
      // The first current check closes the reciprocal return audit; the second
      // is the original outer serial await after signed()/certify() has returned.
      await Promise.resolve(); reached = true;
      if (failure === 'deadline') time = 30000; else f.head.hash = sha('v3-final-serial-head');
    };
    if (branch === 'graph') {
      f.controls.beforeInventory = () => { reads++; };
      f.controls.beforeCurrent = afterFinalAudit;
    } else {
      f.controls.beforeGraphRead = () => { reads++; };
      f.controls.beforeClaimCurrent = afterFinalAudit;
    }
    try {
      const run = facts ? branch === 'graph' ? f.pairs[0].graph.certify(f.addGraphFact()) : f.pairs[0].claim.signFacts(claimRequest)
        : branch === 'graph' ? f.pairs[0].graph.health({ poolIndex: 0 }) : f.pairs[0].claim.signHealth({ claimDomain: f.domain, mode: 'debt' });
      await assert.rejects(run, branch === 'graph' ? /FLAT_OPERATOR_SIGNING_UNCERTAIN/ : /CLAIM_ATTESTATION_UNCERTAIN/);
      assert.equal(reached, true, branch + (facts ? ' facts' : ' authorization') + ' ' + failure);
      assert.equal((facts ? factsKeyUses : attesterKeyUses) - keys, 1);
      assert.equal(f.pairs[0].claim.status().poisoned, true); assert.equal(f.pairs[0].graph.status().poisoned, true);
    } finally { clock.mock.restore(); }
  }
});

test('V3 graph quorum rechecks constituent liveness after its final awaited current-head check', async t => {
  const f = fixture(t), q = await f.bind(); let reached = false;
  f.controls.beforeCurrent = async stats => {
    if (stats !== f.controls.readerStats[0] || stats.reads < 2 || reached) return;
    assert.ok([0, 1, 2].every(index => f.graphStore(index).data.authorizations.some(row => row.signature)));
    reached = true; await Promise.resolve(); f.pairs[1].claim.close();
  };
  await assert.rejects(q.graph.health({ poolIndex: 0 }), /CLOSED_OR_POISONED/);
  assert.equal(reached, true); assert.equal(f.pairs[1].graph.status().closed, true);
});

test('V3 reciprocal audits retain expired unadmitted graph identities and original certificate bytes', async t => {
  const f = fixture(t); await f.bind(); const certificate = await f.pairs[0].graph.certify(f.addGraphFact());
  const original = copy(f.graphStore().data.inventories['2'].state.entries[0]);
  Object.assign(f.head, { number: '61', hash: sha('expired-unadmitted-head'), timestamp: original.maximumEvidenceUntil });
  const before = f.controls.graphReads.length;
  await f.pairs[0].claim.signHealth({ claimDomain: f.domain, mode: 'debt' });
  assert.equal(f.controls.graphReads.length - before, 2, 'one complete expired-history observation at each boundary even when the generic peer skips it');
  const retained = f.graphStore().data.inventories['2'].state.entries[0];
  assert.equal(retained.signature, certificate.signature); assert.deepEqual(retained.facts, original.facts);
  f.controls.graphUnavailable = true;
  const keys = attesterKeyUses;
  await assert.rejects(f.pairs[0].claim.signHealth({ claimDomain: f.domain, mode: 'debt' }), /FLAT_OPERATOR_INVENTORY_BLOCKED/);
  assert.equal(attesterKeyUses, keys); assert.equal(f.graphStore().data.inventories['2'].state.entries.length, 1);
});

test('V3 strict operator deadline permits 29999ms without renewing certificate bounds and refuses reused return at exactly 30000ms', async t => {
  for (const branch of ['graph', 'claim']) {
    const f = fixture(t); await f.bind(); await f.pairs[0].graph.certify(f.addGraphFact());
    const store = branch === 'graph' ? f.graphStore() : f.claimStore();
    let time = 0; const clock = mock.method(performance, 'now', () => time);
    const run = () => branch === 'graph' ? f.pairs[0].graph.health({ poolIndex: 0 })
      : f.pairs[0].claim.signHealth({ claimDomain: f.domain, mode: 'debt' });
    store.beforeUpdate = data => { if (data.authorizations.some(row => row.signature === null)) time = 29999; };
    try {
      const result = await run(), signatures = copy(store.data.authorizations), keys = attesterKeyUses;
      assert.equal(result.message.validFrom, '1000'); assert.equal(result.message.validUntil, '1030');
      time = 60000; store.beforeUpdate = null;
      if (branch === 'graph') f.controls.beforeInventory = () => { time = 90000; };
      else f.controls.beforeGraphRead = () => { time = 90000; };
      await assert.rejects(run(), causedBy(/AUDIT_TOO_OLD/));
      assert.equal(attesterKeyUses, keys); assert.deepEqual(store.data.authorizations, signatures);
      assert.equal(f.pairs[0].claim.status().poisoned, false, 'a validation-only timeout did not use a key');
    } finally { clock.mock.restore(); }
  }
});

test('V3 graph quorum drains every post-key persistence tail after a sibling completion fails', async t => {
  const f = fixture(t), q = await f.bind(); let release, entered, failed = false, settled = false;
  const reached = new Promise(resolve => { entered = resolve; }), pending = new Promise(resolve => { release = resolve; });
  f.graphStore(0).beforeUpdate = data => { if (data.authorizations.some(row => row.signature)) {
    failed = true; throw new Error('CLAIM_STORE_TEST_COMPLETION_FAILED');
  } };
  f.graphStore(2).beforeUpdate = async data => { if (data.authorizations.some(row => row.signature)) { entered(); await pending; } };
  const operation = q.graph.health({ poolIndex: 0 });
  operation.then(() => { settled = true; }, () => { settled = true; });
  const rejected = assert.rejects(operation, /FLAT_OPERATOR_SIGNING_UNCERTAIN/);
  await reached; await new Promise(resolve => setImmediate(resolve));
  assert.equal(failed, true); assert.equal(settled, false);
  await assert.rejects(q.graph.health({ poolIndex: 0 }), /FLAT_OPERATOR_QUORUM_BUSY/);
  assert.throws(() => f.pairs[2].claim.close(), /BUSY/);
  release(); await rejected;
  assert.ok(f.graphStore(2).data.authorizations[0].signature && f.graphStore(2).data.authorizations[0].abiSignature);
  assert.equal(f.pairs[0].claim.status().poisoned, true); assert.equal(f.pairs[2].claim.status().poisoned, false);
});

for (const method of ['health', 'backing', 'reservation', 'facts']) test(
  'V3 ordinary CLAIM ' + method + ' refuses a completed early signer closing during a fresh or reused tail await', async t => {
    for (const reuse of [false, true]) {
      const f = fixture(t), q = await f.bind();
      let request;
      if (method === 'health') request = { claimDomain: f.domain, mode: 'debt' };
      else if (method === 'backing') request = f.preposition();
      else { const factsRequest = await f.addClaimFact({ staged: method === 'reservation' });
        request = method === 'facts' ? factsRequest : f.reservation(); }
      const run = () => q.claim[method](request);
      const rows = index => method === 'facts'
        ? Object.values(f.claimStore(index).data.peers).flatMap(peer => peer.state.entries)
        : f.claimStore(index).data.authorizations;
      if (reuse) await run();
      const keys = method === 'facts' ? factsKeyUses : attesterKeyUses;
      let entered, release, blocked = false, settled = false;
      const reached = new Promise(resolve => { entered = resolve; }), pending = new Promise(resolve => { release = resolve; });
      f.claimStore(2).beforeRead = async () => {
        if (blocked || !rows(2).some(row => row.signature)) return;
        blocked = true; entered(); await pending;
      };
      const operation = run();
      operation.then(() => { settled = true; }, () => { settled = true; });
      const rejected = assert.rejects(operation, /CLAIM_OPERATOR_CLOSED_OR_POISONED/);
      try {
        await reached; await new Promise(resolve => setImmediate(resolve));
        assert.equal(settled, false); assert.ok(rows(0).every(row => row.signature));
        await assert.rejects(run(), /CLAIM_QUORUM_BUSY/);
        assert.throws(() => f.pairs[2].claim.close(), /CLAIM_OPERATOR_BUSY/);
        f.pairs[0].claim.close();
        assert.equal(f.pairs[0].claim.status().closed, true);
        assert.equal(f.pairs[0].graph.status().closed, true);
        await new Promise(resolve => setImmediate(resolve));
        assert.equal(settled, false, 'closed early signer cannot release the quorum while an original tail is outstanding');
      } finally { release(); }
      await rejected;
      assert.ok(rows(2).every(row => row.signature), 'the tail finished its original durable work before refusal');
      assert.equal(f.pairs[2].claim.status().poisoned, false, 'quorum liveness refusal does not relabel a completed healthy signer');
      assert.equal((method === 'facts' ? factsKeyUses : attesterKeyUses) - keys,
        reuse ? 0 : ['backing', 'reservation'].includes(method) ? 6 : 3);
      f.pairs[2].claim.close(); // completion released both branch and quorum work
    }
  });
