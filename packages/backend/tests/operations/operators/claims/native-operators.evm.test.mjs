/** Focused synthetic host-boundary tests. Owned capability assertions, fixed
 * state reads and V3 persistence are explicit private test seams. Operators,
 * native facts frames/signatures/collector, standard EVM wire decoding and
 * ECDSA recovery remain real. No node, compiler, prover, network or funds. */
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import * as originalRecordStore from '@lianum/engine/storage/records';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { publicKeccak256 } from '@lianum/engine/cohorts/private-cohort-public-native';
import { nativeAdmissionRulesTree } from '@lianum/engine/execution/native/dispatch/native-admission';
import { checkpointAuthorizationDigest, revocationMessage }
  from '@lianum/engine/evidence/native-hub-messages';
let FACTS_QUORUM_PROFILE, nativeFactsRegistryCommitment, originalFactsPeer;
import { encodeNativeFacts, FACTS_SCHEMA, encodeBitcoinBinding, validateBitcoinBinding, encodeSolanaBindingMessage }
  from '@lianum/engine/native/native-receipt-binding';
import { decodeCanonicalEvmTransaction, recoverSecp256k1Sender } from '../../../../src/chains/evm/contracts/transaction-wire-codec.mjs';
import { createOriginalFactsRetentionV2 } from '../../../../src/operations/operators/claims/original-facts-retention-v2.mjs';
import { flatNativeHealthDigest } from '../../../../src/chains/shared/health/native-health.mjs';
import { evmDeliveryFixture } from '../../../fixtures/chains/evm/transfers/test-fixtures/evm-delivery-wire.mjs';

const sha = value => createHash('sha256').update(value).digest('hex');
const copy = value => structuredClone(value), prefix = value => '0x' + value;
const word = value => BigInt(value).toString(16).padStart(64, '0');
const ZERO = word(0), address = value => sha(value).slice(0, 40);
const brands = { runtimes: new WeakSet(), systems: new WeakMap(), observers: new WeakMap(),
  bitcoin: new WeakSet(), solana: new WeakSet(), fixtures: new WeakMap() };
const issuedFacts = new WeakMap();
const persisted = new Map();
const vaultHooks = new Map();
let fixtureId = 0;
let factsKeyUses = 0, collectorBuilds = 0, collectorCalls = 0;
const collectorHooks = {};

// These fixtures exercise the original flat graph/claim branch. DeFi observer
// factories are an unavailable HOST port; they must never mint a capability here.
mock.module(new URL('../../../../src/chains/evm/vault/metamorpho-graph-delivery-observer-v1.mjs', import.meta.url).href, { exports: {
  isOwnedMetaMorphoGraphDeliveryObserverV1() { return false; },
  isOwnedUniswapGraphDeliveryObserverV1() { return false; },
  isOwnedAaveStaticGraphDeliveryObserverV1() { return false; },
  isOwnedMorphoBluePositionGraphDeliveryObserverV1() { return false; },
  isOwnedOfficialGraphDeliveryObserverV1() { return false; },
  assertOwnedMetaMorphoGraphDeliveryObserverV1() { assert.fail('TEST_NO_DEFI_OBSERVER'); },
  assertOwnedAaveStaticGraphDeliveryObserverV1() { assert.fail('TEST_NO_DEFI_OBSERVER'); },
  assertOwnedAaveStaticGraphDeliveryFactsV1() { assert.fail('TEST_NO_DEFI_OBSERVER'); },
  assertOwnedMorphoBluePositionGraphDeliveryObserverV1() { assert.fail('TEST_NO_DEFI_OBSERVER'); },
  assertOwnedMorphoBluePositionGraphDeliveryFactsV1() { assert.fail('TEST_NO_DEFI_OBSERVER'); },
  assertOwnedUniswapGraphDeliveryObserverV1() { assert.fail('TEST_NO_DEFI_OBSERVER'); },
  assertOwnedMetaMorphoGraphDeliveryFactsV1() { assert.fail('TEST_NO_DEFI_OBSERVER'); },
  assertOwnedUniswapGraphDeliveryFactsV1() { assert.fail('TEST_NO_DEFI_OBSERVER'); },
  readOriginalEvmGraphDeliveryEconomicFactsV1() { assert.fail('TEST_NO_DEFI_OBSERVER'); },
  assertOwnedMetaMorphoGraphDescriptorV1() { assert.fail('TEST_NO_DEFI_OBSERVER'); },
  assertOwnedAaveStaticGraphDescriptorV1() { assert.fail('TEST_NO_DEFI_OBSERVER'); },
  assertOwnedMorphoBluePositionGraphDescriptorV1() { assert.fail('TEST_NO_DEFI_OBSERVER'); },
  assertOwnedUniswapGraphDescriptorV1() { assert.fail('TEST_NO_DEFI_OBSERVER'); },
  prepareOwnedMetaMorphoGraphDescriptorV1() { assert.fail('TEST_NO_DEFI_OBSERVER'); },
  prepareOwnedAaveStaticGraphDescriptorV1() { assert.fail('TEST_NO_DEFI_OBSERVER'); },
  prepareOwnedMorphoBluePositionGraphDescriptorV1() { assert.fail('TEST_NO_DEFI_OBSERVER'); },
  prepareOwnedUniswapGraphDescriptorV1() { assert.fail('TEST_NO_DEFI_OBSERVER'); },
  createOwnedMetaMorphoGraphDeliveryObserverV1() { assert.fail('TEST_NO_DEFI_OBSERVER'); },
  createOwnedUniswapGraphDeliveryObserverV1() { assert.fail('TEST_NO_DEFI_OBSERVER'); },
  createOwnedAaveStaticGraphDeliveryObserverV1() { assert.fail('TEST_NO_DEFI_OBSERVER'); },
  createOwnedMorphoBluePositionGraphDeliveryObserverV1() { assert.fail('TEST_NO_DEFI_OBSERVER'); },
  isOwnedMetaMorphoGraphDeliveryBatchV4() { return false; },
  readOriginalMetaMorphoGraphBatchRoutersV4() { assert.fail('TEST_NO_DEFI_OBSERVER'); },
  readOriginalMetaMorphoGraphBatchFactsBindingsV4() { assert.fail('TEST_NO_DEFI_OBSERVER'); },
  createOwnedMetaMorphoGraphDeliveryBatchV4() { assert.fail('TEST_NO_DEFI_OBSERVER'); },
  reopenOwnedMetaMorphoGraphDeliveryBatchV4() { assert.fail('TEST_NO_DEFI_OBSERVER'); },
} });
mock.module(new URL('../../../../src/chains/evm/runtime/local-evm-ownership.mjs', import.meta.url).href, { exports: {
  assertLocalEvmDeploymentProfile() { assert.fail('TEST_NO_DEPLOYMENT_PROFILE'); },
  async assertLocalEvm(runtime) { assert.ok(brands.runtimes.has(runtime), 'TEST_OWNED_EVM'); },
} });
mock.module(new URL('../../../../src/operations/deployments/system/deploy-system.mjs', import.meta.url).href, { exports: {
  deployFlatSystem() { assert.fail('TEST_NO_DEPLOYMENT'); },
  assertOwnedFlatSystem(runtime, system) {
    assert.ok(brands.runtimes.has(runtime) && brands.systems.get(system) === runtime, 'TEST_OWNED_SYSTEM');
  },
} });
// The shared-custody bridge also loads the claim constructor. This standalone
// graph fixture must never acquire a claim observer or claim authority.
mock.module(new URL('../../../../src/claims/operations/owned-state.mjs', import.meta.url).href, { exports: {
  assertOwnedClaimObserver() { assert.fail('TEST_NO_CLAIM_OBSERVER'); },
  ownedClaimObserverBindings() { assert.fail('TEST_NO_CLAIM_OBSERVER'); },
} });
mock.module(new URL('../../../../src/chains/bitcoin/runtime/owned-bitcoin-runtime.mjs', import.meta.url).href, { exports: {
  assertOwnedBitcoinRuntimeLive() { assert.fail('TEST_NO_BITCOIN_EXTRA_CAPABILITY'); },
  readOwnedBitcoinRuntimeAuditState() { assert.fail('TEST_NO_BITCOIN_EXTRA_CAPABILITY'); },
  BITCOIN_CUSTODY_PROFILE: 'OWNED_FLAT_BITCOIN_CUSTODY_V1',
  assertOwnedBitcoinRuntime(runtime) { assert.ok(brands.bitcoin.has(runtime), 'TEST_OWNED_BITCOIN'); },
} });
mock.module(new URL('../../../../src/chains/solana/runtime/owned-solana-runtime.mjs', import.meta.url).href, { exports: {
  assertOwnedSolanaRuntimeLive() { assert.fail('TEST_NO_SOLANA_EXTRA_CAPABILITY'); },
  readOwnedSolanaRuntimeAuditState() { assert.fail('TEST_NO_SOLANA_EXTRA_CAPABILITY'); },
  readOwnedSolanaSplOriginalGraphV3() { assert.fail('TEST_NO_SOLANA_EXTRA_CAPABILITY'); },
  assertOwnedSolanaSplOriginalGraphV3() { assert.fail('TEST_NO_SOLANA_EXTRA_CAPABILITY'); },
  consumeOwnedSolanaSplContextV1() { assert.fail('TEST_NO_SPL_CONTEXT'); },
  isOwnedSolanaSplCustodyV1() { return false; },
  assertOwnedSolanaSplGraphPairV1() { assert.fail('TEST_NO_SPL_GRAPH'); },
  assertOwnedSolanaSplCustodyV1() { assert.fail('TEST_NO_SPL_CUSTODY'); },
  assertOwnedSolanaRuntime(runtime) { assert.ok(brands.solana.has(runtime), 'TEST_OWNED_SOLANA'); },
} });
mock.module(new URL('../../../../src/chains/evm/vault/evm-vault-delivery-observer.mjs', import.meta.url).href, { exports: {
  assertOwnedEvmVaultDeliveryObserver(observer, { runtime, system, poolIndex }) {
    const owned = brands.observers.get(observer);
    assert.ok(owned && owned.runtime === runtime && owned.system === system
      && owned.poolIndex === poolIndex, 'TEST_OWNED_EVM_OBSERVER');
  },
  assertOwnedEvmVaultDeliveryFacts(facts, { observer }) {
    assert.ok(brands.observers.has(observer) && issuedFacts.get(facts) === observer, 'TEST_OWNED_EVM_FACTS');
  },
} });
mock.module(new URL('../../../../src/execution/account/reconciliation/flat-system-state.mjs', import.meta.url).href, { exports: {
  async createFlatSystemStateReader({ runtime, system, poolIndex }) {
    assert.equal(brands.systems.get(system), runtime, 'TEST_OWNED_SYSTEM');
    const fixture = brands.fixtures.get(runtime);
    return Object.freeze({
      async read() { return copy(fixture.view(poolIndex)); },
      async assertCurrent(view) {
        await fixture.hooks.beforeCurrent?.(view);
        assert.deepEqual(view, fixture.view(poolIndex), 'TEST_FIXED_HEAD_CHANGED');
      },
    });
  },
} });
mock.module('@lianum/engine/storage/records', { exports: { ...originalRecordStore,
  async createClaimRecordStore({ path }, data) {
    assert.ok(!persisted.has(path), 'TEST_STORE_ALREADY_EXISTS');
    const record = { revision: 0, data: copy(data), commitment: sha('0') };
    const stored = { record, writes: [copy(record)], closed: false }; persisted.set(path, stored);
    const read = async () => { assert.equal(stored.closed, false, 'TEST_STORE_CLOSED'); return copy(stored.record); };
    return Object.freeze({ read,
      async update(expectedRevision, update) {
        assert.equal(stored.record.revision, expectedRevision, 'TEST_STORE_CAS');
        const data = copy(update(copy(stored.record.data)));
        await vaultHooks.get(path)?.beforeUpdate?.({ signerIndex: data.signerIndex, next: copy(data), previous: copy(stored.record.data) });
        stored.record = { revision: expectedRevision + 1, data, commitment: sha(String(expectedRevision + 1)) };
        stored.writes.push(copy(stored.record)); return read();
      },
      close() { stored.closed = true; },
    });
  },
} });

originalFactsPeer = await import('../../../../src/chains/shared/dispatch/native-facts-peer.mjs');
({ FACTS_QUORUM_PROFILE, nativeFactsRegistryCommitment } = originalFactsPeer);
mock.module(new URL('../../../../src/chains/shared/dispatch/native-facts-peer.mjs', import.meta.url).href, { exports: {
  ...originalFactsPeer,
  createNativeFactsSigner(input) {
    const signer = originalFactsPeer.createNativeFactsSigner(input);
    return Object.freeze({ publicKey: signer.publicKey, signFacts(facts) {
      factsKeyUses++; return signer.signFacts(facts);
    } });
  },
  createNativeFactsCollector(input) {
    collectorBuilds++; const collector = originalFactsPeer.createNativeFactsCollector(input);
    return Object.freeze({ async collect(request) {
      collectorCalls++; await collectorHooks.before?.(request);
      const result = await collector.collect(collectorHooks.replaceRequest?.(request) ?? request);
      await collectorHooks.after?.(result); return result;
    } });
  },
} });

const { createLocalFlatOperator, createFlatOperatorQuorum, assertOwnedFlatOperatorQuorum,
  ownedFlatOperatorQuorumBindings, FLAT_FACTS_VALIDATION_PROFILE } =
  await import('../../../../src/operations/operators/claims/native-operators.mjs');

function fixture(t, families = ['3']) {
  const id = ++fixtureId, evm = evmDeliveryFixture();
  const hooks = {};
  t.after(() => { delete collectorHooks.before; delete collectorHooks.after; delete collectorHooks.replaceRequest; });
  const operators = [0, 1, 2, 3].map(signerIndex => createLocalFlatOperator({ signerIndex }));
  t.after(() => {
    for (const operator of operators) {
      const path = operator.status().inventoryPath;
      operator.close(); if (path) { persisted.delete(path); vaultHooks.delete(path); }
    }
  });
  const rulesByFamily = Object.fromEntries(['1', '2', '3'].map(family => [family, family === '3' ? evm.rule : {
    family, genesis: sha('genesis-' + family), asset: sha('asset-' + family), finalityKind: family,
    minimumConfirmations: family === '1' ? '6' : '0', maximumEvidenceLifetime: '120', maximumClockSkew: '30',
  }]));
  const rules = families.map(family => rulesByFamily[family]), tree = nativeAdmissionRulesTree(rules);
  const registry = { profile: FACTS_QUORUM_PROFILE, hubDomain: sha('hub-' + id), registryEpoch: '1',
    rulesRoot: tree.root, keys: operators.map(operator => copy(operator.publicKey)) };
  const registryCommitment = nativeFactsRegistryCommitment(registry);
  const observations = Object.fromEntries(['1', '2', '3'].map(family => [family, new Map()]));
  const nativeReads = [], observerReads = [], journalReads = [], recoveries = [], hubReads = [], journal = new Map();
  const observerControl = { resultMode: 'owned', resultOwner: null };
  let head = { number: '60', hash: evm.observation.nativeContext.observedTipId, timestamp: '1000' };
  const runtime = Object.freeze({ metadata: Object.freeze({ evmGenesis: prefix(evm.rule.genesis),
    scratchDirectory: '/synthetic-only/operator-evm-' + id }),
    async block() { return copy(view(0).header); },
    async signedTransaction(nativeId) {
      assert.match(nativeId, /^0x[0-9a-f]{64}$/, 'TEST_JOURNAL_PREFIXED_ID');
      journalReads.push(nativeId);
      assert.ok(journal.has(nativeId), 'TEST_JOURNAL_UNKNOWN_ID'); return copy(journal.get(nativeId));
    },
    async call({ to, data }, at) {
      assert.equal(to, '0x0000000000000000000000000000000000000001');
      assert.equal(at, '0x' + BigInt(head.number).toString(16));
      assert.match(data, /^0x[0-9a-f]{256}$/);
      const words = data.slice(2).match(/.{64}/g), parity = Number(BigInt('0x' + words[1]) - 27n);
      const recovered = recoverSecp256k1Sender({ digest: words[0], r: words[2], s: words[3], parity });
      recoveries.push({ digest: words[0], recovered }); return '0x' + '00'.repeat(12) + recovered.slice(2);
    },
  });
  for (let index = 0; index < 4; index++)
    vaultHooks.set(runtime.metadata.scratchDirectory + '/flat-operator-' + index + '.v3', hooks);
  const pools = [prefix(address('pool-zero')), prefix(evm.identity.targetPool)];
  function view(poolIndex) {
    return { poolIndex, poolAddress: pools[poolIndex], head: copy(head),
      header: { number: '0x' + BigInt(head.number).toString(16), hash: prefix(head.hash),
        timestamp: '0x' + BigInt(head.timestamp).toString(16) },
      snapshot: { poolStateSequence: '0', hubStateSequence: '0' }, checkpointCount: '0',
      healthState: { pool: pools[poolIndex].slice(2), domain: word(1), hubDomain: registry.hubDomain,
        registryCommitment, evidenceState: word(2), receiptRoot: word(3), receiptCount: '0',
        spentTagDigest: ZERO, spentTagCount: '0', spentTagSequence: '0', revokedDigest: word(4),
        revokedCount: '0', revocationSequence: '0', stateSequence: '0', revocationOverflowDigest: ZERO,
        revocationOverflowCount: '0', halted: '0', timestamp: head.timestamp } };
  }
  const system = Object.freeze({ registry, registryCommitment: prefix(registryCommitment),
    hubDomain: prefix(registry.hubDomain), ledgerNamespace: prefix(evm.identity.ledgerNamespace),
    hub: Object.freeze({ address: prefix(address('hub-address-' + id)), receipt: { transactionHash: prefix(sha('deploy-' + id)) },
      async call(signature, args, at) {
        assert.equal(at, '0x' + BigInt(head.number).toString(16)); hubReads.push({ signature, args: copy(args), at });
        if (signature === 'attester(uint8)') {
          const key = registry.keys[args[0]], signerAddress = publicKeccak256(Buffer.from(key.x + key.y, 'hex')).subarray(12).toString('hex');
          return prefix(key.x + key.y + '00'.repeat(12) + signerAddress);
        }
        if (signature === 'finalityHealthDigest(address,uint64,uint64)') {
          const { timestamp, ...state } = view(pools.indexOf(args[0])).healthState;
          return prefix(flatNativeHealthDigest({ ...state, validFrom: args[1], validUntil: args[2] }));
        }
        if (signature === 'checkpointAuthorizationDigest(address,uint64,uint64,bytes32,uint64)')
          return checkpointAuthorizationDigest({ hubDomain: system.hubDomain, registryCommitment: system.registryCommitment,
            pool: args[0], expectedPoolSequence: args[1], expectedHubStateSequence: args[2], requestId: args[3], validUntil: args[4] });
        if (signature === 'revoked(bytes32)') return prefix(ZERO);
        if (signature === 'revocationMessage(bytes32,uint64,bytes32,uint64)')
          return revocationMessage({ hubDomain: system.hubDomain, registryCommitment: system.registryCommitment,
            gid: args[0], expectedSequence: args[1], reasonCommitment: args[2], authorizationExpiry: args[3] });
        assert.fail('Unexpected synthetic hub call: ' + signature);
      },
    }),
  });
  brands.runtimes.add(runtime); brands.systems.set(system, runtime); brands.fixtures.set(runtime, { view, hooks });
  const observer = Object.freeze({ binding: Object.freeze({ poolIndex: 1, recipientIndex: '1',
    genesis: evm.rule.genesis, asset: evm.rule.asset, sourceEndpoint: evm.identity.solver, destinationEndpoint: evm.identity.router }),
    async observeFacts(request) {
      assert.deepEqual(Object.keys(request).sort(), ['calldataSHA256', 'transactionHash']);
      assert.match(request.transactionHash, /^[0-9a-f]{64}$/, 'TEST_OBSERVER_BARE_TRANSACTION_HASH');
      observerReads.push(copy(request));
      await hooks.beforeObserve?.({ callIndex: observerReads.length, request: copy(request) });
      const signed = journal.get(prefix(request.transactionHash));
      assert.ok(signed, 'TEST_OBSERVER_ORIGINAL_JOURNAL');
      const decoded = decodeCanonicalEvmTransaction(signed.nativeWire);
      assert.equal(request.calldataSHA256, sha(Buffer.from(decoded.data.slice(2), 'hex')), 'TEST_ORIGINAL_CALLDATA_SHA');
      const observation = observations['3'].get(request.transactionHash);
      if (observation instanceof Error) throw observation;
      const facts = copy(observation ?? { status: 'unknown', reason: 'UNKNOWN_TRANSACTION' });
      if (observerControl.resultMode !== 'unbranded') issuedFacts.set(facts, observerControl.resultOwner ?? observer);
      return observerControl.resultMode === 'copied' ? copy(facts) : facts;
    },
  });
  brands.observers.set(observer, { runtime, system, poolIndex: 1 });
  const solanaKeys = families.includes('2') ? generateKeyPairSync('ed25519') : null;
  const solanaSource = solanaKeys ? Buffer.from(solanaKeys.publicKey.export({ format: 'jwk' }).x, 'base64url').toString('hex') : null;
  const bitcoinPublicKey = '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798';
  const bitcoinSource = '0014' + createHash('ripemd160').update(createHash('sha256').update(Buffer.from(bitcoinPublicKey, 'hex')).digest()).digest('hex');
  const destination = (family, recipientIndex) => (family === '1' ? '0014' + address('btc-' + recipientIndex) : sha('sol-' + recipientIndex));
  function nativeRuntime(family) {
    const sourceEndpoint = family === '1' ? bitcoinSource : solanaSource;
    const capability = Object.freeze({ ...(family === '1' ? { genesis: rulesByFamily[family].genesis }
      : { genesisHex: prefix(rulesByFamily[family].genesis) }),
      close() {},
      adapter({ asset, recipientIndex }) {
        assert.equal(asset, rulesByFamily[family].asset);
        return { binding: { family, genesis: rulesByFamily[family].genesis, asset,
          sourceEndpoint, destinationEndpoint: destination(family, recipientIndex) } };
      },
      factReader({ asset }) {
        assert.equal(asset, rulesByFamily[family].asset);
        return { async observe(request) {
          assert.deepEqual(Object.keys(request).sort(), ['family', 'nativeId', 'recipientIndex']);
          assert.equal(request.family, family); nativeReads.push(copy(request));
          await hooks.beforeNativeObserve?.({ callIndex: nativeReads.length, request: copy(request) });
          const observation = observations[family].get(request.nativeId);
          if (observation instanceof Error) throw observation;
          return copy(observation ?? { status: 'unknown', reason: 'UNKNOWN_NATIVE_ID' });
        } };
      },
    });
    brands[family === '1' ? 'bitcoin' : 'solana'].add(capability); return capability;
  }
  const bitcoin = families.includes('1') ? nativeRuntime('1') : null;
  const solana = families.includes('2') ? nativeRuntime('2') : null;
  function addNative(family = '3', label = 'one') {
    if (family === '3') {
      const delivery = evmDeliveryFixture(label), observed = copy(delivery.observation);
      observed.nativeContext.observedTipId = head.hash; observed.nativeContext.observedTipHeight = head.number;
      observed.confirmations = String(BigInt(head.number) - BigInt(observed.blockHeight) + 1n);
      journal.set(prefix(delivery.nativeId), { nativeId: prefix(delivery.nativeId), nativeWire: prefix(delivery.nativeWire),
        transactionSHA256: delivery.transactionSHA256 });
      observations[family].set(delivery.nativeId, observed);
      return { request: delivery.request, observed, delivery };
    }
    const wireKeyCommitment = sha('K-' + family + '-' + label), recipientIndex = '0';
    let nativeWire, intent, nativeId;
    if (family === '1') {
      intent = { sourceTxid: sha('prevout-' + label), sourceVout: '0', sourceScript: bitcoinSource,
        sourceSatoshi: '100000', recipientScript: destination(family, 0), amountSatoshi: '12345',
        changeScript: '0014' + address('change'), feeSatoshi: '1000', wireKeyCommitment };
      const raw = encodeBitcoinBinding(intent);
      // Canonical witness syntax only. Native acceptance is the explicitly
      // mocked owned reader's responsibility, not an alleged Bitcoin spend.
      nativeWire = raw.slice(0, 8) + '0001' + raw.slice(8, -8)
        + '020930060201010201010121' + bitcoinPublicKey + raw.slice(-8);
      nativeId = validateBitcoinBinding(nativeWire, intent).txid;
    } else {
      intent = { sourcePublicKey: solanaSource, recipientPublicKey: destination(family, 0),
        recentBlockhash: sha('blockhash-' + label), lamports: '12345', wireKeyCommitment };
      const message = Buffer.from(encodeSolanaBindingMessage(intent), 'hex'), signature = sign(null, message, solanaKeys.privateKey);
      nativeWire = Buffer.concat([Buffer.from([1]), signature, message]).toString('base64'); nativeId = signature.toString('hex');
    }
    const observed = { status: 'observed', genesis: rulesByFamily[family].genesis, asset: rulesByFamily[family].asset,
      nativeWire, intent, blockId: sha('block-' + family + '-' + label), blockHeight: '50', finalityKind: family,
      confirmations: family === '1' ? '11' : '0', nativeContext: family === '1'
        ? { observedTipId: sha('bitcoin-tip'), observedTipHeight: '60', transactionSlot: '0', parentSlot: '0', observedSlot: '0' }
        : { observedTipId: ZERO, observedTipHeight: '0', transactionSlot: '60', parentSlot: '59', observedSlot: '64' } };
    observations[family].set(nativeId, observed);
    return { request: { family, recipientIndex, nativeId, wireKeyCommitment }, observed };
  }
  const binding = { runtime, system, bitcoin, solana, rules, rulePaths: tree.paths,
    ...(families.includes('3') ? { evmDelivery: observer } : {}) };
  return { operators, runtime, system, observer, bitcoin, solana, binding, rules, tree, view, hooks,
    observations, journal, journalReads, observerReads, observerControl, nativeReads, recoveries, hubReads, addNative,
    advance(next) { head = { ...head, ...next }; },
    async bind(count = 1, patch = {}) {
      for (const operator of operators.slice(0, count)) await operator.bind({ ...binding, ...patch });
      return count === 3 ? createFlatOperatorQuorum({ operators: operators.slice(0, 3) }) : operators[0];
    },
    durable(index = 0) { return copy(persisted.get(operators[index].status().inventoryPath).record.data); },
    writes(index = 0) { return copy(persisted.get(operators[index].status().inventoryPath).writes); },
  };
}

const hasCause = pattern => error => {
  for (let current = error; current; current = current.cause) if (pattern.test(current.message)) return true;
  return false;
};

function deferred() {
  let resolve; const promise = new Promise(ready => { resolve = ready; }); return { promise, resolve };
}
async function reached(promise, label) {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('TEST_CONCURRENCY_BARRIER_' + label)), 10_000);
  })]); } finally { clearTimeout(timer); }
}
const nextTurn = () => new Promise(resolve => setImmediate(resolve));

test('facts retention created before binding reads only the original bound policy and rejects unbound or changed policy', async t => {
  const f = fixture(t), original = f.operators.slice(0, 3);
  let selectedPolicies;
  const unavailable = () => assert.fail('TEST_RETENTION_READER_MUST_NOT_SIGN_OR_AUDIT');
  const reader = createOriginalFactsRetentionV2({ schema: FACTS_SCHEMA, signerIndex: 0,
    record: () => ({ data: f.durable(0) }), encodeNativeFacts, policies: () => selectedPolicies,
    equal: assert.deepEqual, sha, retained: () => f.binding, original: unavailable,
    serial: unavailable, healthAllowed: unavailable, clearAudit: unavailable,
    auditAll: unavailable, coverageFreshness: unavailable });
  assert.throws(() => createFlatOperatorQuorum({ operators: original }), /FLAT_OPERATOR_NOT_BOUND/);
  const quorum = await f.bind(3), native = f.addNative(), result = await quorum.facts(native.request);
  const certificate = result.certificates[0], head = f.view(0).head;
  assert.throws(() => reader.originalFactsEntry(certificate, native.request, head), /FLAT_OPERATOR_NOT_BOUND/);
  selectedPolicies = f.durable(0).binding.policies;
  const entry = reader.originalFactsEntry(certificate, native.request, head);
  assert.equal(entry.signature, certificate.signature);
  const canonicalPolicies = copy(selectedPolicies);
  selectedPolicies = { ...selectedPolicies, '3': { ...selectedPolicies['3'], rule: { ...selectedPolicies['3'].rule, asset: sha('other-original-policy') } } };
  assert.throws(() => reader.originalFactsEntry(certificate, native.request, head));
  selectedPolicies = canonicalPolicies;
  assert.deepEqual(reader.originalFactsEntry(certificate, native.request, head), entry);
});

test('concurrent facts preserve first signed anchor, independently observe both peers and retain signer order', async t => {
  const f = fixture(t), quorum = await f.bind(3), native = f.addNative();
  const firstEntered = deferred(), peersEntered = deferred(), release = [null, deferred(), deferred(), deferred()];
  let peerCount = 0, settled = false;
  f.hooks.beforeObserve = async ({ callIndex }) => {
    if (callIndex > 3) return; // V2 then independently audits each retained original twice.
    if (callIndex === 1) firstEntered.resolve();
    else {
      assert.ok(f.durable(0).inventories['3'].state.entries[0].signature, 'original anchor is durably signed first');
      if (++peerCount === 2) peersEntered.resolve();
    }
    await release[callIndex].promise;
  };
  const run = quorum.facts(native.request); run.then(() => { settled = true; }, () => { settled = true; });
  try {
    await reached(firstEntered.promise, 'FIRST_ANCHOR'); await nextTurn();
    assert.equal(f.observerReads.length, 1); assert.equal(settled, false);
    release[1].resolve(); await reached(peersEntered.promise, 'BOTH_POST_ANCHOR_PEERS');
    assert.equal(f.observerReads.length, 3); assert.equal(settled, false);
    await assert.rejects(quorum.audit(), /QUORUM_BUSY/);
    release[3].resolve(); await nextTurn(); assert.equal(settled, false);
    release[2].resolve(); const result = await run;
    assert.deepEqual(result.certificates.map(item => item.signerIndex), ['0', '1', '2']);
    assert.deepEqual(result.collected.indexes, ['0', '1', '2']);
  } finally {
    release.slice(1).forEach(gate => gate.resolve()); await Promise.allSettled([run]);
  }
});

test('concurrent facts failure drains the other signer before rejection, lock release or cleanup', async t => {
  const f = fixture(t), quorum = await f.bind(3), native = f.addNative();
  const failedRead = deferred(), lastEntered = deferred(), releaseLast = deferred();
  let settled = false;
  f.hooks.beforeObserve = async ({ callIndex }) => {
    if (callIndex === 2) { failedRead.resolve(); throw new Error('TEST_FIRST_PEER_READ_FAILED'); }
    if (callIndex === 3) { lastEntered.resolve(); await releaseLast.promise; }
  };
  const run = quorum.facts(native.request); run.then(() => { settled = true; }, () => { settled = true; });
  try {
    await reached(failedRead.promise, 'FAILED_FACTS_PEER'); await reached(lastEntered.promise, 'OTHER_FACTS_PEER');
    await nextTurn(); assert.equal(settled, false, 'a sibling failure cannot release the in-flight signing operation');
    await assert.rejects(quorum.health({ poolIndex: 0 }), /QUORUM_BUSY/);
    assert.throws(() => f.operators[2].close(), /OPERATOR_BUSY/);
    releaseLast.resolve(); await assert.rejects(run, /NATIVE_HISTORY_UNAVAILABLE/);
    assert.ok(f.durable(0).inventories['3'].state.entries[0].signature);
    assert.ok(f.durable(2).inventories['3'].state.entries[0].signature,
      'the independently successful certificate remains durably inventoried before failure returns');
    f.hooks.beforeObserve = undefined;
    assert.equal((await quorum.audit()).length, 3, 'the quorum lock releases only after the remaining signer finishes');
  } finally { releaseLast.resolve(); await Promise.allSettled([run]); }
});

test('concurrent authorizations overlap independent audits and drain every signer after an early failure', async t => {
  for (const kind of ['health', 'checkpoint', 'revocation']) {
    const f = fixture(t), quorum = await f.bind(3), entered = deferred(), release = [deferred(), deferred(), deferred()];
    // Revocation must still reach each fresh audit before rejecting absent
    // adverse authority; no fabricated adverse finding is provided by this test.
    const request = kind === 'health' ? { poolIndex: 0 } : kind === 'checkpoint'
      ? { poolIndex: 0, requestId: sha('concurrent-checkpoint') } : { nativeGid: sha('uncertified-gid') };
    const seen = new Set(); let settled = false;
    f.hooks.beforeUpdate = async ({ signerIndex, previous }) => {
      if (previous.lastAudit !== null || seen.has(signerIndex)) return;
      seen.add(signerIndex); if (seen.size === 3) entered.resolve();
      if (signerIndex === 0) throw new Error('TEST_FIRST_OPERATOR_WRITE_FAILED');
      await release[signerIndex].promise;
    };
    const run = quorum[kind](request); run.then(() => { settled = true; }, () => { settled = true; });
    try {
      await reached(entered.promise, 'ALL_' + kind.toUpperCase() + '_AUDITS'); await nextTurn();
      assert.equal(settled, false); assert.deepEqual([...seen].sort(), [0, 1, 2]);
      await assert.rejects(quorum.audit(), /QUORUM_BUSY/);
      for (const index of [1, 2]) assert.throws(() => f.operators[index].close(), /OPERATOR_BUSY/);
      release[1].resolve(); await nextTurn(); assert.equal(settled, false);
      release[2].resolve(); await assert.rejects(run, /DURABLE_WRITE_UNCERTAIN/);
      if (kind !== 'revocation') for (const index of [1, 2]) {
        const authorization = f.durable(index).authorizations.find(item => item.kind === kind);
        assert.ok(authorization?.signature && authorization.abiSignature,
          'every successful signature and recovery result is durable before failure returns');
      }
      for (const index of [1, 2]) assert.doesNotThrow(() => f.operators[index].close());
    } finally { release.forEach(gate => gate.resolve()); await Promise.allSettled([run]); }
  }
});

test('concurrent quorum audit drains all independent inventory operations before an error escapes', async t => {
  const f = fixture(t), quorum = await f.bind(3), entered = deferred(), release = deferred();
  const seen = new Set(); let settled = false;
  f.hooks.beforeUpdate = async ({ signerIndex, previous }) => {
    if (previous.lastAudit !== null) return;
    seen.add(signerIndex); if (seen.size === 3) entered.resolve();
    if (signerIndex === 0) throw new Error('TEST_FIRST_OPERATOR_AUDIT_FAILED');
    await release.promise;
  };
  const run = quorum.audit(); run.then(() => { settled = true; }, () => { settled = true; });
  try {
    await reached(entered.promise, 'ALL_QUORUM_AUDITS'); await nextTurn();
    assert.equal(settled, false); await assert.rejects(quorum.audit(), /QUORUM_BUSY/);
    release.resolve(); await assert.rejects(run, /DURABLE_WRITE_UNCERTAIN/);
    for (const index of [1, 2]) assert.ok(f.durable(index).lastAudit);
  } finally { release.resolve(); await Promise.allSettled([run]); }
});

test('concurrent post-anchor work still rejects at the original thirty-second boundary', async t => {
  const f = fixture(t), quorum = await f.bind(3), native = f.addNative();
  let now = 0; t.mock.method(performance, 'now', () => now);
  const peersEntered = deferred(), release = deferred(); let peers = 0, settled = false;
  f.hooks.beforeObserve = async ({ callIndex }) => {
    if (callIndex === 1) return;
    if (++peers === 2) peersEntered.resolve();
    await release.promise;
  };
  const run = quorum.facts(native.request); run.then(() => { settled = true; }, () => { settled = true; });
  try {
    await reached(peersEntered.promise, 'ANCHORED_DEADLINE'); now = 30_000;
    assert.equal(settled, false); release.resolve();
    await assert.rejects(run, /NATIVE_HISTORY_UNAVAILABLE|AUDIT_TOO_OLD|QUORUM_TOO_OLD/);
    for (const index of [1, 2]) assert.equal(f.durable(index).inventories['3'].state.entries.length, 0,
      'an expired anchor must not acquire a new facts signature');
  } finally { release.resolve(); await Promise.allSettled([run]); }
});

test('EVM-only bind accepts absent BTC/SOL and produces real facts and authorization quorums', async t => {
  const f = fixture(t), quorum = await f.bind(3), native = f.addNative();
  assert.equal(f.binding.bitcoin, null); assert.equal(f.binding.solana, null);
  const bundle = await quorum.facts(native.request);
  assert.equal(bundle.certificates.length, 3);
  assert.deepEqual(bundle.collected.indexes, ['0', '1', '2']);
  assert.equal(bundle.collected.digest, sha(Buffer.from(bundle.collected.frameHex, 'hex')));
  assert.deepEqual(bundle.signedFinalityReference, native.observed.nativeContext);
  for (const [index, certificate] of bundle.certificates.entries()) {
    assert.equal(certificate.signerIndex, String(index)); assert.equal(certificate.signature.length, 128);
    assert.equal(certificate.facts.family, '3'); assert.equal(certificate.facts.transactionSHA256, native.delivery.transactionSHA256);
    assert.deepEqual(certificate.facts.nativeContext, native.observed.nativeContext);
    const data = f.durable(index);
    assert.deepEqual(Object.keys(data.inventories), ['3']); assert.equal(data.inventories['3'].state.entries.length, 1);
    assert.equal(data.inventories['3'].state.entries[0].signature, certificate.signature);
    assert.ok(f.writes(index).some(record => record.data.inventories['3'].state.entries.some(entry => entry.signature === null)),
      'the identity is durable before its certificate signature');
  }
  assert.equal(assertOwnedFlatOperatorQuorum(quorum, { runtime: f.runtime, system: f.system,
    nativeRuntime: f.observer, family: '3' }), quorum);
  const health = await quorum.health({ poolIndex: 1 });
  const checkpoint = await quorum.checkpoint({ poolIndex: 1, requestId: sha('checkpoint') });
  for (const permit of [health, checkpoint]) {
    assert.deepEqual(permit.indexes, [0, 1, 2]); assert.equal(permit.abiSignatures.length, 3);
    assert.ok(permit.audits.every(audit => audit.certifiedInventoryCount === '1' && !audit.blockers.length));
  }
  assert.equal(health.message.pool, f.view(1).poolAddress.slice(2));
  assert.equal(checkpoint.message.pool, f.view(1).poolAddress);
  assert.equal(f.recoveries.length, 12, 'both possible EVM recovery parities are checked for every real authorization');
});

test('owned quorum inventory snapshot preserves complete registry order and original capabilities', async t => {
  for (const families of [['3'], ['3', '1', '2']]) {
    const f = fixture(t, families), quorum = await f.bind(3);
    const input = { runtime: f.runtime, system: f.system }, snapshot = ownedFlatOperatorQuorumBindings(quorum, input);
    assert.deepEqual(Object.keys(snapshot).sort(), ['bitcoin', 'evmDelivery', 'families', 'solana']);
    assert.deepEqual(snapshot.families, families);
    assert.equal(snapshot.bitcoin, f.bitcoin); assert.equal(snapshot.solana, f.solana);
    assert.equal(snapshot.evmDelivery, f.observer);
    assert.ok(Object.isFrozen(snapshot)); assert.ok(Object.isFrozen(snapshot.families));
    assert.throws(() => snapshot.families.push('2'), TypeError);
    assert.throws(() => { snapshot.bitcoin = {}; }, TypeError);
    const again = ownedFlatOperatorQuorumBindings(quorum, input);
    assert.notEqual(again, snapshot); assert.notEqual(again.families, snapshot.families);
    assert.deepEqual(again.families, families); assert.equal(again.evmDelivery, snapshot.evmDelivery);
  }
});

test('owned quorum inventory rejects copied capability, changed system and caller-selected families', async t => {
  const f = fixture(t), quorum = await f.bind(3), input = { runtime: f.runtime, system: f.system };
  for (const forged of [{ ...quorum }, Object.freeze({ ...quorum }), null])
    assert.throws(() => ownedFlatOperatorQuorumBindings(forged, input), /OWNED_QUORUM/);
  for (const patch of [{ runtime: {} }, { system: { ...f.system } }])
    assert.throws(() => ownedFlatOperatorQuorumBindings(quorum, { ...input, ...patch }), /QUORUM_BINDING/);
  for (const key of ['families', 'bitcoin', 'solana', 'evmDelivery'])
    assert.throws(() => ownedFlatOperatorQuorumBindings(quorum, { ...input, [key]: [] }), /EXACT_FIELDS/);
  let invoked = false;
  const accessor = { system: f.system, get runtime() { invoked = true; return f.runtime; } };
  assert.throws(() => ownedFlatOperatorQuorumBindings(quorum, accessor), /DATA_FIELDS/); assert.equal(invoked, false);
  brands.systems.delete(f.system);
  assert.throws(() => ownedFlatOperatorQuorumBindings(quorum, input), /TEST_OWNED_SYSTEM/);
});

test('owned quorum inventory revalidates every active native capability and closed or poisoned operators', async t => {
  for (const family of ['1', '2', '3']) {
    const f = fixture(t, ['1', '2', '3']), quorum = await f.bind(3);
    if (family === '1') brands.bitcoin.delete(f.bitcoin);
    else if (family === '2') brands.solana.delete(f.solana);
    else brands.observers.delete(f.observer);
    assert.throws(() => ownedFlatOperatorQuorumBindings(quorum, { runtime: f.runtime, system: f.system }),
      family === '1' ? /TEST_OWNED_BITCOIN/ : family === '2' ? /TEST_OWNED_SOLANA/ : /TEST_OWNED_EVM_OBSERVER/);
  }
  for (const state of ['closed', 'poisoned']) {
    const f = fixture(t), quorum = await f.bind(3), operator = f.operators[1];
    if (state === 'closed') operator.close();
    else {
      const stored = persisted.get(operator.status().inventoryPath);
      stored.record.revision++;
      await assert.rejects(operator.audit(), /INVENTORY_UNAVAILABLE_OR_CHANGED/);
    }
    assert.throws(() => ownedFlatOperatorQuorumBindings(quorum, { runtime: f.runtime, system: f.system }), /CLOSED_OR_POISONED/);
  }
});

test('original signed journal derives calldata SHA and observer receives an exact bare transaction hash', async t => {
  const f = fixture(t), operator = await f.bind(), native = f.addNative();
  await operator.certify(native.request);
  assert.ok(f.journalReads.length > 0); assert.ok(f.journalReads.every(id => id === prefix(native.request.nativeId)));
  const decoded = decodeCanonicalEvmTransaction(prefix(native.delivery.nativeWire));
  const expected = { transactionHash: native.request.nativeId, calldataSHA256: sha(Buffer.from(decoded.data.slice(2), 'hex')) };
  assert.notEqual(expected.calldataSHA256, native.delivery.transactionSHA256);
  assert.deepEqual(f.observerReads, [expected]);
});

test('public requests cannot supply observation, journal, clock, signature or authority replacements', async t => {
  const f = fixture(t), quorum = await f.bind(3), native = f.addNative();
  for (const field of ['evmDelivery', 'observer', 'calldataSHA256', 'nativeWire', 'facts', 'clock', 'signature', 'ready', 'policy']) {
    await assert.rejects(() => f.operators[0].certify({ ...native.request, [field]: 'caller supplied' }), /EXACT_FIELDS/);
    assert.throws(() => quorum.facts({ ...native.request, [field]: 'caller supplied' }), /EXACT_FIELDS/);
  }
  for (const patch of [{ nativeId: prefix(native.request.nativeId) }, { recipientIndex: '0' }, { family: '1' }])
    await assert.rejects(() => f.operators[0].certify({ ...native.request, ...patch }));
  assert.equal(f.observerReads.length, 0);
  assert.throws(() => assertOwnedFlatOperatorQuorum(quorum, { runtime: f.runtime, system: f.system,
    nativeRuntime: { ...f.observer }, family: '3' }), /QUORUM_NATIVE_BINDING/);
  await assert.rejects(f.operators[0].bind(f.binding), /BIND_ONCE/);
});

test('copied, unbranded and cross-runtime EVM observers cannot bind', async t => {
  for (const kind of ['copy', 'plain', 'cross-runtime']) {
    const f = fixture(t), other = kind === 'cross-runtime' ? fixture(t) : null;
    const observer = kind === 'cross-runtime' ? other.observer : kind === 'copy' ? { ...f.observer }
      : { binding: f.observer.binding, async observeFacts() { assert.fail('unbranded observer executed'); } };
    await assert.rejects(f.bind(1, { evmDelivery: observer }), hasCause(/TEST_OWNED_EVM_OBSERVER/));
    assert.equal(f.operators[0].status().poisoned, true);
  }
});

test('returned facts must retain their original observer brand, including adverse failure objects', async t => {
  for (const mode of ['unbranded', 'copied', 'different-observer']) {
    const f = fixture(t), operator = await f.bind(), native = f.addNative();
    const other = mode === 'different-observer' ? fixture(t) : null;
    f.observerControl.resultMode = mode;
    f.observerControl.resultOwner = other?.observer ?? null;
    await assert.rejects(operator.certify(native.request), /NATIVE_HISTORY_UNAVAILABLE/);
    assert.equal(operator.status().certifiedInventoryCount, 0, 'copied or foreign facts cannot create certificate authority');
    f.observerControl.resultMode = 'owned'; f.observerControl.resultOwner = null;
    const certificate = await operator.certify(native.request);
    f.observerControl.resultMode = mode; f.observerControl.resultOwner = other?.observer ?? null;
    f.observations['3'].set(native.request.nativeId, { status: 'adverse', reason: 'UNBRANDED_REORG_CLAIM' });
    const audit = await operator.audit();
    assert.equal(audit.blockers[0].status, 'unknown', 'unowned failure objects are unavailable evidence, not revocation authority');
    assert.equal(f.durable().adverse[certificate.facts.nativeGid], undefined);
    await assert.rejects(operator.revocation({ nativeGid: certificate.facts.nativeGid }), /NO_OBSERVED_ADVERSE_FACT/);
  }
});

test('journal absence, changed bytes, claimed ID or claimed SHA refuse a certificate before observer use', async t => {
  for (const change of ['missing', 'wire', 'nativeId', 'transactionSHA256']) {
    const f = fixture(t), operator = await f.bind(), native = f.addNative();
    const id = prefix(native.request.nativeId), record = f.journal.get(id);
    if (change === 'missing') f.journal.delete(id);
    else if (change === 'wire') record.nativeWire = prefix(evmDeliveryFixture('different-wire').nativeWire);
    else record[change] = change === 'nativeId' ? prefix(sha('wrong-id')) : sha('wrong-sha');
    await assert.rejects(operator.certify(native.request), change === 'missing' ? /NATIVE_HISTORY_UNAVAILABLE/ : /NATIVE_ADVERSE/);
    assert.equal(f.observerReads.length, 0); assert.equal(operator.status().certifiedInventoryCount, 0);
  }
});

test('EVM observations must report the actual fixed-head tip and exact depth before quorum certification', async t => {
  for (const patch of [observation => { observation.nativeContext.observedTipId = sha('invented-tip'); },
    observation => { observation.nativeContext.observedTipHeight = '61'; observation.confirmations = '12'; },
    observation => { observation.confirmations = '12'; }]) {
    const f = fixture(t), quorum = await f.bind(3), native = f.addNative();
    patch(f.observations['3'].get(native.request.nativeId));
    await assert.rejects(quorum.facts(native.request));
    assert.ok(f.operators.slice(0, 3).every(operator => operator.status().certifiedInventoryCount === 0));
  }
});

test('registered one- and two-family inventories bind without requiring absent family capabilities', async t => {
  for (const families of [['1'], ['2'], ['1', '2'], ['1', '3'], ['2', '3']]) {
    const f = fixture(t, families), operator = await f.bind(), audit = await operator.audit();
    assert.deepEqual(Object.keys(audit.peerReports), families);
    assert.deepEqual(Object.keys(f.durable().inventories), families);
    assert.equal(audit.certifiedInventoryCount, '0'); assert.equal(audit.blockers.length, 0);
  }
});

test('complete registered root rejects omitted families even with individually valid membership paths', async t => {
  for (const omitted of ['1', '2', '3']) {
    const f = fixture(t, ['1', '2', '3']);
    const kept = f.rules.map((rule, index) => ({ rule, path: f.tree.paths[index] })).filter(({ rule }) => rule.family !== omitted);
    await assert.rejects(f.bind(1, { rules: kept.map(row => row.rule), rulePaths: kept.map(row => row.path) }),
      hasCause(/INCOMPLETE_REGISTERED_RULES/));
    assert.equal(f.operators[0].status().certifiedInventoryCount, 0);
  }
});

test('each registered family requires its own capability; absent optional families accept only null or owned values', async t => {
  for (const [field, reason] of [['bitcoin', /TEST_OWNED_BITCOIN/], ['solana', /TEST_OWNED_SOLANA/],
    ['evmDelivery', /FLAT_OPERATOR_EVM_OBSERVER/]]) {
    const f = fixture(t, ['1', '2', '3']);
    await assert.rejects(f.bind(1, { [field]: null }), hasCause(reason));
  }
  for (const field of ['bitcoin', 'solana']) {
    const f = fixture(t);
    await assert.rejects(f.bind(1, { [field]: {} }), hasCause(/TEST_OWNED_BITCOIN|TEST_OWNED_SOLANA/));
  }
});

test('expired unadmitted EVM identities remain audited and unknown history blocks health and checkpoint', async t => {
  const f = fixture(t), operator = await f.bind(), native = f.addNative();
  const certificate = await operator.certify(native.request);
  f.advance({ timestamp: '1201' });
  assert.ok(BigInt(certificate.facts.observation.evidenceUntil) < 1201n);
  assert.equal(f.view(0).healthState.receiptCount, '0', 'the issued certificate was never admitted');
  f.observations['3'].set(native.request.nativeId, { status: 'unknown', reason: 'HISTORY_PRUNED' });
  f.observerReads.length = 0;
  const audit = await operator.audit();
  assert.equal(audit.certifiedInventoryCount, '1'); assert.equal(audit.includesExpiredAndUnadmitted, true);
  assert.equal(audit.everyIssuedIdentityIncluded, true);
  assert.deepEqual(audit.blockers.map(row => [row.status, row.reason]), [['unknown', 'HISTORY_PRUNED']]);
  assert.ok(f.observerReads.length >= 2, 'both the peer and operator fresh audit include the expired identity');
  await assert.rejects(operator.health({ poolIndex: 0 }), /INVENTORY_BLOCKED/);
  await assert.rejects(operator.checkpoint({ poolIndex: 1, requestId: sha('blocked-checkpoint') }), /INVENTORY_BLOCKED/);
  assert.equal(f.durable().authorizations.length, 0);
  f.observations['3'].set(native.request.nativeId, copy(native.observed));
  assert.equal((await operator.audit()).blockers.length, 0, 'fresh exact evidence can resolve unknown history');
});

test('changed certified facts and explicit adverse observations are durable and cannot clear on restoration or expiry', async t => {
  for (const kind of ['changed-block', 'explicit-adverse']) {
    const f = fixture(t), operator = await f.bind(), native = f.addNative();
    const certificate = await operator.certify(native.request), gid = certificate.facts.nativeGid;
    f.observations['3'].set(native.request.nativeId, kind === 'changed-block'
      ? { ...copy(native.observed), blockId: sha('replacement-block') }
      : { status: 'adverse', reason: 'CANONICAL_BLOCK_REORG' });
    const audit = await operator.audit();
    assert.equal(audit.blockers[0].status, 'adverse');
    const durableAdverse = f.durable().adverse[gid]; assert.equal(durableAdverse.family, '3');
    assert.ok(f.writes().some(record => record.data.adverse[gid]), 'adverse history is saved before returning the report');
    f.observations['3'].set(native.request.nativeId, copy(native.observed)); f.advance({ timestamp: '5000' });
    assert.equal((await operator.audit()).blockers[0].status, 'adverse');
    assert.deepEqual(f.durable().adverse[gid], durableAdverse);
    await assert.rejects(operator.health({ poolIndex: 0 }), /INVENTORY_BLOCKED/);
    await assert.rejects(operator.checkpoint({ poolIndex: 0, requestId: sha('still-blocked') }), /INVENTORY_BLOCKED/);
    const revocation = await operator.revocation({ nativeGid: gid });
    assert.equal(revocation.message.gid, prefix(gid)); assert.equal(revocation.signature.length, 128);
  }
});

test('retained original journal contradictions latch adverse while missing journal history stays unknown', async t => {
  for (const change of ['missing', 'nativeId', 'transactionSHA256', 'wire']) {
    const f = fixture(t), operator = await f.bind(), native = f.addNative();
    const certificate = await operator.certify(native.request), gid = certificate.facts.nativeGid;
    const id = prefix(native.request.nativeId), original = copy(f.journal.get(id));
    if (change === 'missing') f.journal.delete(id);
    else if (change === 'wire') f.journal.get(id).nativeWire = prefix(evmDeliveryFixture('replaced-retained-wire').nativeWire);
    else f.journal.get(id)[change] = change === 'nativeId' ? prefix(sha('changed-id')) : sha('changed-sha');
    const audit = await operator.audit();
    assert.equal(audit.blockers[0].status, change === 'missing' ? 'unknown' : 'adverse');
    assert.equal(Boolean(f.durable().adverse[gid]), change !== 'missing');
    await assert.rejects(operator.health({ poolIndex: 0 }), /INVENTORY_BLOCKED/);
    f.journal.set(id, original);
    const restored = await operator.audit();
    assert.equal(restored.blockers.length, change === 'missing' ? 0 : 1);
    if (change !== 'missing') assert.equal(f.durable().adverse[gid].reason, 'EVM_ORIGINAL_SIGNED_WIRE_CHANGED');
  }
});

test('retained same-height actual EVM tip contradictions are adverse; observation height drift remains unknown', async t => {
  for (const change of ['hash', 'height']) {
    const f = fixture(t), operator = await f.bind(), native = f.addNative();
    const certificate = await operator.certify(native.request), gid = certificate.facts.nativeGid;
    const changed = copy(native.observed);
    if (change === 'hash') changed.nativeContext.observedTipId = sha('not-actual-fixed-tip');
    else { changed.nativeContext.observedTipHeight = '61'; changed.confirmations = '12'; }
    f.observations['3'].set(native.request.nativeId, changed);
    const audit = await operator.audit();
    assert.equal(audit.blockers[0].status, change === 'hash' ? 'adverse' : 'unknown');
    assert.equal(audit.blockers[0].reason, change === 'hash' ? 'EVM_OBSERVED_WIRE_OR_TIP_CHANGED' : 'EVM_HEAD_CHANGED_DURING_OBSERVATION');
    assert.equal(Boolean(f.durable().adverse[gid]), change === 'hash');
    await assert.rejects(operator.health({ poolIndex: 0 }), /INVENTORY_BLOCKED/);
    f.observations['3'].set(native.request.nativeId, copy(native.observed));
    assert.equal((await operator.audit()).blockers.length, change === 'hash' ? 1 : 0);
  }
});

test('latest fresh same-height tip is retained independently from the older certificate reference', async t => {
  const f = fixture(t), operator = await f.bind(), native = f.addNative();
  const certificate = await operator.certify(native.request), gid = certificate.facts.nativeGid;
  const later = copy(native.observed);
  later.nativeContext.observedTipHeight = '61'; later.nativeContext.observedTipId = sha('later-tip'); later.confirmations = '12';
  f.advance({ number: '61', hash: later.nativeContext.observedTipId, timestamp: '1001' });
  f.observations['3'].set(native.request.nativeId, later);
  assert.equal((await operator.audit()).blockers.length, 0);
  assert.deepEqual(f.durable().currentNativeContexts[gid].signedReference, certificate.facts.nativeContext);
  assert.deepEqual(f.durable().currentNativeContexts[gid].nativeContext, later.nativeContext);
  const changed = copy(later); changed.nativeContext.observedTipId = sha('same-height-replacement');
  f.advance({ hash: changed.nativeContext.observedTipId, timestamp: '1002' });
  f.observations['3'].set(native.request.nativeId, changed);
  const audit = await operator.audit();
  assert.equal(audit.blockers[0].status, 'adverse'); assert.ok(f.durable().adverse[gid]);
  assert.deepEqual(f.durable().currentNativeContexts[gid].nativeContext, later.nativeContext,
    'contradictory context cannot overwrite the newest trusted observation');
  await assert.rejects(operator.health({ poolIndex: 0 }), /INVENTORY_BLOCKED/);
});

test('all configured BTC, SOL and EVM inventories remain covered after expiry despite another family read failure', async t => {
  const f = fixture(t, ['1', '2', '3']), operator = await f.bind();
  const natives = ['1', '2', '3'].map(family => f.addNative(family, 'mixed-' + family));
  const certificates = [];
  for (const native of natives) certificates.push(await operator.certify(native.request));
  f.advance({ timestamp: '1300' });
  f.observations['1'].set(natives[0].request.nativeId, new Error('BTC_RPC_DOWN'));
  f.observations['2'].set(natives[1].request.nativeId, { ...copy(natives[1].observed), blockId: sha('solana-reorg') });
  f.observations['3'].set(natives[2].request.nativeId, { status: 'adverse', reason: 'EVM_REORG' });
  f.nativeReads.length = 0; f.observerReads.length = 0;
  const audit = await operator.audit();
  assert.equal(audit.certifiedInventoryCount, '3'); assert.deepEqual(Object.keys(audit.peerReports), ['1', '2', '3']);
  assert.deepEqual(audit.blockers.map(row => [row.family, row.status]), [['1', 'unknown'], ['2', 'adverse'], ['3', 'adverse']]);
  assert.ok(f.nativeReads.some(row => row.family === '1')); assert.ok(f.nativeReads.some(row => row.family === '2'));
  assert.ok(f.observerReads.length > 0);
  for (const index of [1, 2]) assert.ok(f.durable().adverse[certificates[index].facts.nativeGid]);
  await assert.rejects(operator.health({ poolIndex: 1 }), /INVENTORY_BLOCKED/);
  await assert.rejects(operator.checkpoint({ poolIndex: 0, requestId: sha('mixed-blocked') }), /INVENTORY_BLOCKED/);
});

test('graph authorization rejects a current-view await crossing exactly thirty seconds before key use', async t => {
  const f = fixture(t), operator = await f.bind();
  let time = 0, crossed = false; t.mock.method(performance, 'now', () => time);
  f.hooks.beforeUpdate = ({ next }) => {
    if (!next.authorizations.some(row => row.signature === null)) return;
    f.hooks.beforeCurrent = async () => { crossed = true; time = 30_000; };
  };
  await assert.rejects(operator.health({ poolIndex: 0 }), error => {
    assert.match(error.message, /FLAT_OPERATOR_AUDIT_TOO_OLD/);
    assert.deepEqual(error.auditBudget, { phase: 'graph-current', elapsedMilliseconds: 30000, limitMilliseconds: 30000 });
    return true;
  });
  assert.equal(crossed, true); assert.equal(f.recoveries.length, 0);
  const rows = f.durable().authorizations; assert.equal(rows.length, 1);
  assert.equal(rows[0].signature, null); assert.equal(rows[0].abiSignature, null);
});

test('standalone graph facts clock rejects a post-pending current await crossing exactly thirty seconds', async t => {
  const f = fixture(t), operator = await f.bind(), native = f.addNative();
  let time = 0, crossed = false; t.mock.method(performance, 'now', () => time);
  f.hooks.beforeUpdate = ({ next }) => {
    if (!next.inventories['3'].state.entries.some(entry => entry.signature === null)) return;
    f.hooks.beforeCurrent = async () => { crossed = true; time = 30_000; };
  };
  await assert.rejects(operator.certify(native.request), hasCause(/FLAT_OPERATOR_AUDIT_TOO_OLD/));
  assert.equal(crossed, true); assert.equal(f.recoveries.length, 0);
  const entries = f.durable().inventories['3'].state.entries;
  assert.equal(entries.length, 1); assert.equal(entries[0].signature, null);
  assert.ok(f.writes().every(row => row.data.inventories['3'].state.entries.every(entry => entry.signature === null)));
});

test('graph facts V2: retained collectors stay dynamic and every original family certificate gets full fresh validation', async t => {
  for (const family of ['1', '2', '3']) {
    const f = fixture(t, [family]), builds = collectorBuilds, q = await f.bind(3), native = f.addNative(family);
    assert.equal(collectorBuilds - builds, 3, 'one immutable collector per bound operator/family');
    const keys = factsKeyUses, calls = collectorCalls;
    const result = await q.facts(native.request);
    assert.equal(factsKeyUses - keys, 3, 'the final round invokes no attester facts key');
    assert.equal(collectorCalls - calls, 1, 'one real final collection, after the independent audits');
    assert.equal(collectorBuilds - builds, 3);
    assert.equal((family === '3' ? f.observerReads : f.nativeReads).length, 9,
      'three original observations plus peer and operator full inventory reads for every signer');
    assert.deepEqual(result.freshness, { profile: FLAT_FACTS_VALIDATION_PROFILE,
      assemblyWithin30Seconds: true, totalWithin30Seconds: true, finalRoundWithin30Seconds: true,
      originalCertificatesUnchanged: true, allOriginalSignersRevalidated: true });
    const again = await q.facts(native.request);
    assert.deepEqual(again.certificates, result.certificates); assert.equal(factsKeyUses - keys, 3);
    assert.equal(collectorBuilds - builds, 3); assert.equal(collectorCalls - calls, 2);
    // A later canonical head creates newly signed facts through ordinary issuance;
    // neither the retained collector clock nor the private provenance is stale.
    f.advance({ timestamp: '1001' });
    const later = await q.facts(native.request);
    assert.equal(later.certificates[0].facts.observation.observedAt, '1001');
    assert.equal(factsKeyUses - keys, 6); assert.equal(collectorBuilds - builds, 3);
    assert.equal(collectorCalls - calls, 3);
  }
});

test('graph facts V2: original total age can exceed thirty seconds only under the explicit fresh-round profile', async t => {
  const f = fixture(t), q = await f.bind(3), native = f.addNative();
  let now = 0; t.mock.method(performance, 'now', () => now);
  const signed = new Set(), keys = factsKeyUses;
  f.hooks.beforeUpdate = ({ signerIndex, previous, next }) => {
    const wasSigned = previous.inventories['3'].state.entries.some(entry => entry.signature);
    if (!wasSigned && next.inventories['3'].state.entries.some(entry => entry.signature)) {
      signed.add(signerIndex); now = signed.size === 3 ? 31_000 : 10_000;
    }
  };
  const result = await q.facts(native.request);
  assert.equal(result.freshness.profile, FLAT_FACTS_VALIDATION_PROFILE);
  assert.equal(result.freshness.assemblyWithin30Seconds, false);
  assert.equal(result.freshness.totalWithin30Seconds, false);
  assert.equal(result.freshness.finalRoundWithin30Seconds, true);
  assert.equal(factsKeyUses - keys, 3); assert.equal(f.observerReads.length, 9);
  for (const [i, certificate] of result.certificates.entries()) {
    const entry = f.durable(i).inventories['3'].state.entries[0];
    assert.deepEqual(certificate.facts, entry.facts); assert.equal(certificate.signature, entry.signature);
    assert.equal(certificate.facts.observation.observedAt, '1000');
    assert.equal(certificate.facts.observation.evidenceUntil, '1120');
  }
});

test('graph facts V2: failed final validation drains every original signer and holds the quorum lock', async t => {
  const f = fixture(t), q = await f.bind(3), native = f.addNative();
  const entered = deferred(), release = deferred(); let tails = 0, settled = false;
  const keys = factsKeyUses, calls = collectorCalls;
  f.hooks.beforeObserve = async ({ callIndex }) => {
    if (callIndex === 4) throw new Error('TEST_FINAL_FIRST_READ_FAILED');
    if (callIndex === 5 || callIndex === 6) { if (++tails === 2) entered.resolve(); await release.promise; }
  };
  const run = q.facts(native.request); run.then(() => { settled = true; }, () => { settled = true; });
  try {
    await reached(entered.promise, 'FINAL_VALIDATION_TAILS'); await nextTurn();
    assert.equal(settled, false); assert.equal(factsKeyUses - keys, 3);
    await assert.rejects(q.audit(), /QUORUM_BUSY/);
    for (const i of [1, 2]) assert.throws(() => f.operators[i].close(), /OPERATOR_BUSY/);
    release.resolve(); await assert.rejects(run, /PEER_BLOCKED/);
    assert.equal(collectorCalls, calls, 'a failed final audit never reaches collection');
    assert.equal(factsKeyUses - keys, 3);
    for (const i of [0, 1, 2]) assert.ok(f.durable(i).inventories['3'].state.entries[0].signature);
    f.hooks.beforeObserve = undefined; assert.equal((await q.audit()).length, 3);
  } finally { release.resolve(); await Promise.allSettled([run]); }
});

test('graph facts V2: missing retention, head drift and canonical expiry during final validation fail without replacement signing', async t => {
  for (const failure of ['missing', 'changed', 'head', 'expired']) {
    const f = fixture(t), q = await f.bind(3), native = f.addNative(), keys = factsKeyUses, calls = collectorCalls;
    f.hooks.beforeObserve = ({ callIndex }) => {
      if (callIndex !== 4) return;
      if (failure === 'head') f.advance({ hash: sha('changed-final-round-head') });
      else if (failure === 'expired') f.advance({ timestamp: '1120' });
      else {
        const store = persisted.get(f.operators[0].status().inventoryPath);
        if (failure === 'missing') store.record.data.inventories['3'].state.entries = [];
        else store.record.data.inventories['3'].state.entries[0].signature = 'aa'.repeat(64);
      }
    };
    await assert.rejects(q.facts(native.request));
    assert.equal(factsKeyUses - keys, 3); assert.equal(collectorCalls, calls);
  }
});

test('graph facts V2: final collector awaits cannot escape raw deadline, current-head or liveness checks', async t => {
  for (const failure of ['deadline', 'head', 'closed', 'poisoned']) {
    const f = fixture(t), q = await f.bind(3), native = f.addNative(), keys = factsKeyUses;
    let now = 0; const clock = mock.method(performance, 'now', () => now);
    f.hooks.beforeObserve = ({ callIndex }) => { if (callIndex === 4) now = 10_000; };
    collectorHooks.after = async () => {
      if (failure === 'deadline') now = 30_000;
      else if (failure === 'head') f.advance({ hash: sha('changed-after-collection') });
      else if (failure === 'closed') f.operators[2].close();
      else {
        persisted.get(f.operators[2].status().inventoryPath).record.revision++;
        await assert.rejects(f.operators[2].audit(), /INVENTORY_UNAVAILABLE_OR_CHANGED/);
      }
    };
    try {
      await assert.rejects(q.facts(native.request), failure === 'deadline' ? /FACTS_FINAL_ROUND_TOO_OLD/
        : failure === 'head' ? /FIXED_HEAD_CHANGED/ : /CLOSED_OR_POISONED/);
      assert.equal(factsKeyUses - keys, 3);
    } finally { clock.mock.restore(); delete collectorHooks.after; }
  }
});

test('graph facts V2: expired unrelated inventory is reobserved and adverse history is retained by the fresh round', async t => {
  const f = fixture(t, ['1', '2']), q = await f.bind(3), old = f.addNative('1', 'expired');
  await q.facts(old.request); f.advance({ timestamp: '1121' });
  const native = f.addNative('2'), reads = f.nativeReads.length, keys = factsKeyUses;
  const result = await q.facts(native.request);
  assert.equal(factsKeyUses - keys, 3, 'expired unrelated facts are audited without refresh');
  assert.equal(f.nativeReads.slice(reads).filter(row => row.nativeId === old.request.nativeId).length, 6,
    'all original actors independently read the expired row in issuance and final round');
  assert.equal(result.certificates[0].facts.observation.observedAt, '1121');
  // Changing a retained unrelated effect is permanent adverse authority even
  // though its old certificate has expired. No subsequent success is possible.
  f.observations['1'].set(old.request.nativeId, { status: 'adverse', reason: 'TEST_EXPIRED_ADVERSE' });
  await assert.rejects(q.facts(native.request), /INVENTORY_BLOCKED/);
  assert.ok(Object.values(f.durable(0).adverse).some(row => row.reason === 'TEST_EXPIRED_ADVERSE'));
});

test('graph facts V2: retained collector repeats exact certificate and signature verification on each collection', async t => {
  const f = fixture(t, ['2']), q = await f.bind(3), native = f.addNative('2');
  await q.facts(native.request); const keys = factsKeyUses, calls = collectorCalls;
  for (const field of ['signature', 'frameHex', 'digest']) {
    collectorHooks.replaceRequest = request => {
      const altered = copy(request); altered.certificates[1][field] = '01'.repeat(field === 'signature' ? 64 : 32); return altered;
    };
    await assert.rejects(q.facts(native.request), /SIGNATURE_INVALID|CERTIFICATE_FRAME/);
    assert.equal(factsKeyUses, keys, 'cached original issuance and final validation never replace signatures');
  }
  assert.equal(collectorCalls - calls, 3); delete collectorHooks.replaceRequest;
  assert.deepEqual((await q.facts(native.request)).collected.indexes, ['0', '1', '2']);
});

test('graph facts V2: fresh final-round adverse history is durable and prevents collection', async t => {
  const f = fixture(t, ['2']), q = await f.bind(3), native = f.addNative('2');
  const keys = factsKeyUses, calls = collectorCalls;
  f.hooks.beforeNativeObserve = ({ callIndex }) => {
    if (callIndex === 4) f.observations['2'].set(native.request.nativeId,
      { status: 'adverse', reason: 'TEST_FINAL_NATIVE_ADVERSE' });
  };
  await assert.rejects(q.facts(native.request), /INVENTORY_BLOCKED|PEER_BLOCKED/);
  assert.equal(factsKeyUses - keys, 3); assert.equal(collectorCalls, calls);
  for (const i of [0, 1, 2]) assert.ok(Object.values(f.durable(i).adverse)
    .some(row => row.reason === 'TEST_FINAL_NATIVE_ADVERSE'));
});
