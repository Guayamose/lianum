/** Separately owned combined wrapped-custody/graph fixed-head reconstruction.
 * Construction remains unavailable until genuine new artifacts/deployment exist.
 * This preserves the original full ledger/tree/backing parser, never V1 ownership.
 * No request URL, caller-owned system facade, hashing backend, proof, signing
 * key or mutating transaction is accepted. Public state is not native finality. */
import assert from 'node:assert/strict';
import { assertOwnedWrappedClaimGraphSystem as assertOwnedFlatSystem, assertOwnedWrappedClaimSystem } from '../ops/wrapped-claim-system-v1.mjs';
import { assertCombinedAdapterRegistrationsV2 } from '../native-claims/registry-envelope-v2.mjs';
import { registryCommitment, SEMANTIC_PROFILE } from '../chain-adapters/generic-native-value-v2.mjs';
import { WRAPPED_CLAIM_GRAPH_VERIFIER_ORDER_V1 as FLAT_VERIFIER_ORDER } from '../ops/wrapped-claim-deployment-artifacts-v1.mjs';
import { assertLocalEvm } from '../chain-adapters/local-evm-ownership.mjs';
import { inspectGenericSnapshot } from '../../../../../omnichain-product/src/paeg/local-ledger.mjs';
import { decodeNativeCheckpoint, decodeNativeCheckpointTree }
  from '../../../../../omnichain-product/src/paeg/native-system-state.mjs';
import { boundedListDigest, snapshotDigest, nodeHash }
  from '../../../../../omnichain-product/src/paeg/native-state.mjs';
import { publicKeccak256 } from '../../../../../omnichain-product/src/private-cohort-public-native.mjs';
import { exactRecord, fixedArray, bytes32, canonicalField, validateStruct, ZERO } from './commitments.mjs';
import { assertOwnedPoolAsset } from '../chain-adapters/owned-pool-asset.mjs';
import { evmRuntimeCodeHash } from '../chain-adapters/evm-code-hash.mjs';
import { createFlatPureMathLease, discardFlatPureMathCache } from './flat-pure-math-cache.mjs';

// Preserve every started read through rejection; no caller may begin cleanup
// while a sibling RPC or nested reconstruction still belongs to this read.
async function drainReadPromises(reads) {
  let failed = false, firstError;
  const results = await Promise.allSettled(reads.map(read => Promise.resolve(read).catch(error => {
    if (!failed) { failed = true; firstError = error; } throw error;
  })));
  if (failed) throw firstError;
  return results.map(result => result.value);
}

const issued = new WeakMap();
const U64 = (1n << 64n) - 1n, ZERO_WORD = '0x' + ZERO, ZERO_ADDRESS = '0x' + '0'.repeat(40);
const VERIFIER_ROLES = Object.freeze(FLAT_VERIFIER_ORDER.map(([role]) => role));
const VERIFIER_CONFIGURATION_WORDS = VERIFIER_ROLES.length * 2 + 4;
const prefix = value => '0x' + bytes32(value);
const bare = value => {
  assert.equal(typeof value, 'string', 'FLAT_STATE_HEX_TYPE');
  assert.equal(value.length, 66, 'FLAT_STATE_HEX_LENGTH'); assert.match(value, /^0x[0-9a-f]{64}$/, 'FLAT_STATE_HEX');
  return value.slice(2);
};
function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
function copy(value) { return freeze(structuredClone(value)); }
function integer(value, max = U64) {
  const n = BigInt(value); assert.ok(n >= 0n && n <= max, 'FLAT_STATE_INTEGER'); return n.toString();
}
function decimal(value, max = U64) {
  assert.equal(typeof value, 'string', 'FLAT_STATE_DECIMAL');
  assert.ok(value.length <= 20 && /^(0|[1-9][0-9]*)$/.test(value), 'FLAT_STATE_DECIMAL');
  const result = integer(value, max); assert.equal(result, value, 'FLAT_STATE_DECIMAL'); return result;
}
function addressWord(value) {
  bare(value); assert.ok(BigInt(value) < 1n << 160n, 'FLAT_STATE_ADDRESS'); return '0x' + value.slice(-40);
}
function address(value) {
  assert.equal(typeof value, 'string'); assert.equal(value.length, 42);
  assert.match(value, /^0x[0-9a-f]{40}$/, 'FLAT_STATE_ADDRESS'); return value;
}
function index(value, count) {
  assert.ok(Number.isSafeInteger(value) && !Object.is(value, -0) && value >= 0 && value < count, 'FLAT_STATE_INDEX');
  return value;
}
function bool(value) { return integer(value, 1n) === '1'; }
export function decodeFlatWords(raw, expected) {
  assert.equal(typeof raw, 'string', 'FLAT_STATE_ABI_ENCODING');
  assert.equal(raw.length, 2 + expected * 64, 'FLAT_STATE_ABI_LENGTH');
  assert.match(raw, /^0x(?:[0-9a-f]{64})*$/, 'FLAT_STATE_ABI_ENCODING');
  return Array.from({ length: expected }, (_, i) => '0x' + raw.slice(2 + 64 * i, 66 + 64 * i));
}
const one = raw => decodeFlatWords(raw, 1)[0];
function vector(values, count) {
  fixedArray(values, 64); const n = Number(decimal(count, 64n)), live = new Set();
  values.forEach((value, i) => {
    bytes32(value, i < n);
    if (i < n) { assert.ok(!live.has(value), 'FLAT_STATE_DUPLICATE_VECTOR'); live.add(value); }
    else assert.equal(value, ZERO, 'FLAT_STATE_VECTOR_PADDING');
  });
}
function treeView(nodes, count, roots = undefined) {
  const entries = [...nodes], leaves = entries.slice(64);
  return freeze({ root: entries[1], count, leafCount: count, nodes: entries, leaves,
    ...(roots ? { prefixRoots: [...roots] } : {}),
    path(position) {
      index(position, count); const siblings = [];
      for (let cursor = 64 + position; cursor > 1; cursor = Math.floor(cursor / 2)) siblings.push(entries[cursor ^ 1]);
      return copy({ root: entries[1], index: position, leaf: entries[64 + position], siblings });
    } });
}

/** Pure decoding seam for explicit fake parser fixtures. It cannot mint a
 * branded current head or bypass the owned-runtime reader below. */
export function decodeFlatPoolObservation(observation, balances = undefined) {
  const state = decodeFlatWords(observation.rawState, 135), history = decodeFlatWords(observation.rawHistory, 68);
  const backing = decodeFlatWords(observation.rawBacking, 6);
  integer(state[2]); integer(history[0]); integer(backing[0]);
  const inspected = inspectGenericSnapshot(observation), s = inspected.publicState;
  assert.ok(s.leaves + 4 * s.liveReservations <= 64, 'FLAT_STATE_NOTE_HEADROOM');
  assert.ok(s.spent + 5 * s.liveReservations + s.outputCapacity <= 64, 'FLAT_STATE_SPENT_HEADROOM');
  assert.ok(s.rootCount >= 1 && s.rootCount <= s.leaves + 1, 'FLAT_STATE_NOTE_HISTORY_COUNT');
  assert.ok(BigInt(s.backedAmount) <= 64n * U64, 'FLAT_STATE_BACKING_BOUND');
  if (balances !== undefined) {
    exactRecord(balances, ['assetBalance', 'nativeBalance']);
    for (const value of Object.values(balances)) assert.ok(typeof value === 'bigint' && value >= 0n && value < 1n << 256n,
      'FLAT_STATE_ASSET_BALANCE');
    assert.equal(BigInt(s.actualAssetBalance), balances.assetBalance, 'FLAT_STATE_ACTUAL_ASSET_BACKING');
    if (observation.asset === ZERO_ADDRESS)
      assert.equal(balances.assetBalance, balances.nativeBalance, 'FLAT_STATE_NATIVE_BACKING');
    else assert.equal(BigInt(s.unrelatedNative), balances.nativeBalance, 'FLAT_STATE_UNRELATED_NATIVE');
  }
  // The source class has append(), so publish an immutable read-only tree view.
  return freeze({ ...inspected, tree: treeView(inspected.tree.nodes, s.leaves) });
}

/** math is a parser seam only; production binds it to pinned onchain public
 * pure functions at the captured block. Internal field digests are bare hex. */
export async function decodeFlatFieldTree(raw, count, expectedRoot, domain, kind, math, withHistory = false) {
  const nodes = decodeFlatWords(raw, 128).map(bare), n = Number(decimal(count, 64n));
  canonicalField(domain, true); canonicalField(expectedRoot);
  assert.ok(kind === 0 || kind === 2, 'FLAT_STATE_TREE_KIND');
  nodes.forEach(value => canonicalField(value)); assert.equal(nodes[0], ZERO, 'FLAT_STATE_UNUSED_NODE');
  const empty = await math.emptyLeaf(domain, kind);
  const live = nodes.slice(64, 64 + n);
  assert.ok(live.every(value => value !== ZERO && value !== empty), 'FLAT_STATE_EMPTY_LIVE_LEAF');
  assert.equal(new Set(live).size, live.length, 'FLAT_STATE_DUPLICATE_LEAF');
  assert.ok(nodes.slice(64 + n).every(value => value === empty), 'FLAT_STATE_TYPED_PADDING');
  for (let level = 1; level <= 6; level++) {
    const start = 64 >> level;
    await drainReadPromises(Array.from({ length: start }, async (_, j) => {
      const cursor = start + j;
      assert.equal(nodes[cursor], await math.nodeHash(domain, kind, level, nodes[cursor * 2], nodes[cursor * 2 + 1]),
        'FLAT_STATE_FIELD_TREE');
    }));
  }
  assert.equal(nodes[1], expectedRoot, 'FLAT_STATE_FIELD_ROOT');
  let roots;
  if (withHistory) {
    const historyNodes = Array(128).fill(ZERO); historyNodes.fill(empty, 64);
    for (let level = 1; level <= 6; level++) {
      const start = 64 >> level;
      const parent = await math.nodeHash(domain, kind, level, historyNodes[2 * start], historyNodes[2 * start + 1]);
      historyNodes.fill(parent, start, 2 * start);
    }
    roots = [historyNodes[1]];
    for (let position = 0; position < n; position++) {
      let cursor = 64 + position; historyNodes[cursor] = live[position];
      for (let level = 1; level <= 6; level++) {
        cursor >>= 1;
        historyNodes[cursor] = await math.nodeHash(domain, kind, level, historyNodes[cursor * 2], historyNodes[cursor * 2 + 1]);
      }
      roots.push(historyNodes[1]);
    }
  }
  return treeView(nodes, n, roots);
}

export async function decodeFlatHubState(raw, { domain, domainCommitment }, math) {
  validateStruct('domain', domain); canonicalField(domainCommitment, true);
  const w = decodeFlatWords(raw, 206), state = {
    domain: bare(w[0]), receiptRoot: bare(w[1]), receiptCount: integer(w[2], 64n), spentTagDigest: bare(w[3]),
    spentTagCount: integer(w[4], 64n), spentTagSequence: integer(w[5]), revokedDigest: bare(w[6]),
    revokedCount: integer(w[7], 64n), revocationSequence: integer(w[8]), stateSequence: integer(w[9]),
    evidenceState: bare(w[10]), halted: bool(w[11]), reservedTagCapacity: integer(w[12], 64n), totalReservedTagCapacity: integer(w[13], 64n),
  };
  assert.equal(state.domain, domainCommitment, 'FLAT_STATE_SAME_DOMAIN');
  [state.receiptRoot, state.revokedDigest, state.evidenceState].forEach(value => canonicalField(value));
  const commitments = w.slice(14, 78).map(bare), tags = w.slice(78, 142).map(bare), revokedEntries = w.slice(142).map(bare);
  vector(tags, state.spentTagCount); vector(revokedEntries, state.revokedCount);
  assert.equal(boundedListDigest(0x31, prefix(domain.hubDomain), tags.map(prefix), state.spentTagCount),
    prefix(state.spentTagDigest), 'FLAT_STATE_SPENT_TAG_DIGEST');
  assert.equal(BigInt(state.spentTagCount), 4n * BigInt(state.spentTagSequence), 'FLAT_STATE_TAG_SEQUENCE');
  assert.ok(BigInt(state.spentTagCount) + BigInt(state.totalReservedTagCapacity) <= 64n, 'FLAT_STATE_GLOBAL_TAG_HEADROOM');
  assert.equal(state.halted, state.revokedCount === '64', 'FLAT_STATE_PERMANENT_HALT');
  assert.equal(await math.revokedDigest(domainCommitment, domain.hubDomain, revokedEntries, state.revokedCount),
    state.revokedDigest, 'FLAT_STATE_REVOKED_DIGEST');
  const evidence = { hubDomain: domain.hubDomain, registryCommitment: domain.registryCommitment,
    receiptRoot: state.receiptRoot, receiptCount: state.receiptCount, revokedDigest: state.revokedDigest,
    revokedCount: state.revokedCount, revocationSequence: state.revocationSequence };
  assert.equal(await math.evidenceState(domainCommitment, evidence), state.evidenceState, 'FLAT_STATE_EVIDENCE_DIGEST');
  return freeze({ state, evidence, commitments, tags, revokedEntries });
}
export function decodeFlatOverflow(rawCount, rawDigest, state) {
  const count = integer(one(rawCount)), digest = bare(one(rawDigest));
  assert.equal(BigInt(state.revocationSequence), BigInt(state.revokedCount) + BigInt(count), 'FLAT_STATE_REVOCATION_SEQUENCE');
  if (count === '0') assert.equal(digest, ZERO, 'FLAT_STATE_EMPTY_OVERFLOW');
  else assert.ok(state.halted && state.revokedCount === '64', 'FLAT_STATE_OVERFLOW_HALT');
  return freeze({ count, digest, digestAssurance: 'OBSERVED_PINNED_CONTRACT_VALUE_NOT_REPLAYED_OVERFLOW_EVENTS' });
}
export function decodeFlatEvidenceHistory(raw, count, current) {
  decimal(count); canonicalField(current);
  const values = decodeFlatWords(raw, 129).map(bare), size = Number(BigInt(count) < 129n ? BigInt(count) : 129n);
  assert.ok(size > 0, 'FLAT_STATE_EVIDENCE_HISTORY_EMPTY');
  values.slice(0, size).forEach(value => canonicalField(value));
  assert.ok(values.slice(size).every(value => value === ZERO), 'FLAT_STATE_EVIDENCE_HISTORY_PADDING');
  if (BigInt(count) <= 129n) assert.equal(values[size - 1], current, 'FLAT_STATE_EVIDENCE_HISTORY_CURRENT');
  return freeze({ count, storedCount: size, truncated: BigInt(count) > 129n, values: values.slice(0, size) });
}

function fixedMath(facade, at) {
  const call = createFlatPureMathLease(facade, at);
  return {
    domainCommitment: domain => call('domainCommitment(bytes32,bytes32,bytes32,bytes32,bytes32,bytes32,bytes32)',
      ['scope', 'policy', 'asset', 'hubDomain', 'registryCommitment', 'verifierSetCommitment', 'ledgerNamespace'].map(name => prefix(domain[name]))),
    emptyLeaf: (d, kind) => call('emptyLeaf(uint256,uint256)', [prefix(d), kind]),
    nodeHash: (d, kind, level, left, right) => call('nodeHash(uint256,uint256,uint256,uint256,uint256)',
      [prefix(d), kind, level, prefix(left), prefix(right)]),
    authorizationLeaf: (d, e) => call('authorizationLeaf(uint256,uint256)', [prefix(d), prefix(e)]),
    revokedDigest: (d, hub, entries, count) => call('revokedDigest(uint256,bytes32,bytes32[64],uint256)',
      [prefix(d), prefix(hub), entries.map(prefix), count]),
    evidenceState: (d, value) => call('evidenceState(uint256,(bytes32,bytes32,uint256,uint256,uint256,uint256,uint256))',
      [prefix(d), { ...value, hubDomain: prefix(value.hubDomain), registryCommitment: prefix(value.registryCommitment),
        receiptRoot: prefix(value.receiptRoot), revokedDigest: prefix(value.revokedDigest) }]),
    admissionRevocationState: (d, digest, count, sequence) => call('admissionRevocationState(uint256,uint256,uint256,uint256)',
      [prefix(d), prefix(digest), count, sequence]),
  };
}
function shaPrefixRoots(leaves) {
  const nodes = Array(128).fill(ZERO_WORD);
  for (let i = 63; i > 0; i--) nodes[i] = nodeHash(nodes[i * 2], nodes[i * 2 + 1]);
  const roots = [nodes[1]];
  for (let i = 0; i < leaves.length; i++) {
    let cursor = 64 + i; nodes[cursor] = prefix(leaves[i]);
    while (cursor > 1) { cursor >>= 1; nodes[cursor] = nodeHash(nodes[cursor * 2], nodes[cursor * 2 + 1]); }
    roots.push(nodes[1]);
  }
  return roots.map(bare);
}

async function assertCodes(runtime, system, header) {
  assertOwnedWrappedClaimSystem(runtime,system.claims);
  const at = header.number;
  const unique = new Map();
  for (const item of [system.hub, ...system.pools, ...Object.values(system.libraries),
    ...Object.values(system.verifiers), ...Object.values(system.generatedLibraries ?? {}),
    system.claims.authority,...system.claims.gateways,...system.claims.wrappers,
    ...Object.values(system.claims.verifiers),...Object.values(system.claims.libraries)]) {
    address(item.address); bare(item.codeHash);
    assert.ok(typeof item.expectedCode === 'string' && /^0x(?:[0-9a-f]{2})+$/.test(item.expectedCode), 'FLAT_STATE_EXPECTED_CODE');
    if (unique.has(item.address)) assert.deepEqual(unique.get(item.address), [item.expectedCode, item.codeHash], 'FLAT_STATE_CONTRADICTORY_PIN');
    else unique.set(item.address, [item.expectedCode, item.codeHash]);
  }
  await drainReadPromises([...unique].map(async ([target, [expected, hash]]) => {
    const actual = await runtime.code(target, at);
    assert.equal(actual, expected, 'FLAT_STATE_CODE_CHANGED');
    assert.equal(evmRuntimeCodeHash(actual), hash, 'FLAT_STATE_CODE_HASH');
  }));
  return drainReadPromises(system.pools.map(async pool => {
    assertOwnedPoolAsset(runtime, pool.assetCapability);
    assert.equal(pool.assetCapability.metadata.address, pool.asset, 'FLAT_STATE_ASSET_ADDRESS');
    assert.equal(pool.assetCapability.metadata.codeHash, pool.assetCodeHash, 'FLAT_STATE_ASSET_PIN');
    assert.deepEqual(pool.assetMetadata, pool.assetCapability.metadata, 'FLAT_STATE_ASSET_METADATA');
    // This independently reads the asset's own balanceOf/native balance and
    // full code at this historical block, not canonicalBacking's self-report.
    const observed = await pool.assetCapability.read({ holder: pool.address, blockNumber: at });
    assert.equal(observed.blockNumber, at, 'FLAT_STATE_ASSET_BLOCK');
    assert.equal(observed.blockHash, header.hash, 'FLAT_STATE_ASSET_BLOCK_HASH');
    return observed;
  }));
}
function sameHead(left, right) {
  assert.equal(right.number, left.number, 'FLAT_STATE_HEAD_ADVANCED');
  assert.equal(right.hash, left.hash, 'FLAT_STATE_HEAD_CHANGED');
  assert.equal(right.timestamp, left.timestamp, 'FLAT_STATE_HEAD_TIME');
}

/** Async bootstrap. A lookalike runtime/system cannot create this reader. */
export async function createWrappedClaimGraphStateReaderV1(input) {
  exactRecord(input, ['runtime', 'system', 'poolIndex']);
  const { runtime, system, poolIndex } = input;
  assertOwnedFlatSystem(runtime, system); await assertLocalEvm(runtime); index(poolIndex, 2);

  const reader = {
    async assertCurrent(head) {
      try {
        assert.ok(issued.has(head) && issued.get(head).runtime === runtime && issued.get(head).system === system
          && head.poolIndex === poolIndex, 'NATIVE_VALUE_STATE_OWN_HEAD_REQUIRED');
        assert.equal(issued.get(head).historical, false, 'FLAT_STATE_HISTORICAL_NOT_CURRENT');
        assertOwnedFlatSystem(runtime, system); await assertLocalEvm(runtime);
        const header = issued.get(head).header;
        await runtime.assertCanonical(header); sameHead(header, await runtime.block());
        await assertCodes(runtime, system, header);
        sameHead(header, await runtime.block());

      } catch (error) { discardFlatPureMathCache(system.libraries.poseidon2Domains); throw error; }
    },
    async assertCanonical(head) {
      try {
        assert.ok(issued.has(head) && issued.get(head).runtime === runtime && issued.get(head).system === system
          && head.poolIndex === poolIndex, 'NATIVE_VALUE_STATE_OWN_HEAD_REQUIRED');
        assertOwnedFlatSystem(runtime, system); await assertLocalEvm(runtime);
        const { header } = issued.get(head);
        await runtime.assertCanonical(header); await assertCodes(runtime, system, header);
        await runtime.assertCanonical(header);

      } catch (error) { discardFlatPureMathCache(system.libraries.poseidon2Domains); throw error; }
    },
    async readHistorical(blockNumber) {
      try {
        assert.ok(typeof blockNumber === 'string' && blockNumber.length <= 18
          && /^0x(?:0|[1-9a-f][0-9a-f]*)$/.exec(blockNumber)?.[0] === blockNumber, 'FLAT_STATE_HISTORICAL_BLOCK');
        assertOwnedFlatSystem(runtime, system); await assertLocalEvm(runtime);
        const header = copy(await runtime.block(blockNumber));
        assert.equal(header.number, blockNumber, 'FLAT_STATE_HISTORICAL_BLOCK');
        const math = fixedMath(system.libraries.poseidon2Domains, header.number);
        const head = await readAt(runtime, system, poolIndex, header, math);
        await runtime.assertCanonical(header);
        issued.set(head, { runtime, system, header, math, historical: true }); return head;

      } catch (error) { discardFlatPureMathCache(system.libraries.poseidon2Domains); throw error; }
    },
    async authorizationPath(head, envelope) {
      try {
        assert.ok(issued.has(head) && issued.get(head).runtime === runtime && issued.get(head).system === system
          && head.poolIndex === poolIndex, 'NATIVE_VALUE_STATE_OWN_HEAD_REQUIRED'); canonicalField(envelope, true);
        await reader.assertCurrent(head);
        const retained = issued.get(head), leaf = await retained.math.authorizationLeaf(head.domainCommitment, envelope);
        const position = head.authorizationTree.leaves.slice(0, head.authorizationTree.count).indexOf(leaf);
        assert.ok(position >= 0, 'FLAT_STATE_ENVELOPE_NOT_REGISTERED');
        assert.ok(bool(one(await system.pools[poolIndex].call('registeredEnvelopes(bytes32)', [prefix(envelope)], retained.header.number))),
          'FLAT_STATE_ENVELOPE_MAPPING');
        const path = head.authorizationTree.path(position);
        await reader.assertCurrent(head);
        return copy({ root: path.root, index: path.index, siblings: path.siblings });

      } catch (error) { discardFlatPureMathCache(system.libraries.poseidon2Domains); throw error; }
    },
    async read(query = undefined) {
      try {
        if (query !== undefined) {
          exactRecord(query, ['domainCommitment', 'authorizationRoot', 'checkpoint']);
          canonicalField(query.domainCommitment, true); canonicalField(query.authorizationRoot); bytes32(query.checkpoint, true);
          query = copy(query);
        }
        assertOwnedFlatSystem(runtime, system); await assertLocalEvm(runtime);
        const header = copy(await runtime.block()), at = header.number;
        const math = fixedMath(system.libraries.poseidon2Domains, at);
        const head = await readAt(runtime, system, poolIndex, header, math, query);
        await runtime.assertCanonical(header); sameHead(header, await runtime.block());
        issued.set(head, { runtime, system, header, math, historical: false }); return head;

      } catch (error) { discardFlatPureMathCache(system.libraries.poseidon2Domains); throw error; }
    },
  };
  return Object.freeze(reader);
}


// Defined below the exported parser seams to keep actual ownership and RPC
// access in one path. Every primary/secondary call receives the same block tag.
async function readAt(runtime, system, poolIndex, header, math, query) {
  const assetObservations = await assertCodes(runtime, system, header);
  return readPinnedState(runtime, system, poolIndex, header, math, query, assetObservations);
}

async function collect(calls) {
  const keys = Object.keys(calls), values = await drainReadPromises(Object.values(calls));
  return Object.fromEntries(keys.map((key, i) => [key, values[i]]));
}
const wordOf = value => '0x' + BigInt(value).toString(16).padStart(64, '0');
async function identity(runtime, system, at, math) {
  const hub = system.hub, libraries = system.libraries, configuration = system.plan.verifierSet;
  assert.equal(system.ledgerNamespace, system.hubDomain, 'FLAT_STATE_INITIAL_NAMESPACE');
  assert.equal('0x' + registryCommitment(system.registry), system.registryCommitment, 'NATIVE_VALUE_STATE_WRAPPED_REGISTRY_PIN');
  assertCombinedAdapterRegistrationsV2({ registry: system.registry, profiles: system.adapterProfiles });
  assert.notEqual(system.claims.authority.address, ZERO_ADDRESS, 'WRAPPED_CLAIM_STATE_AUTHORITY_REQUIRED');
  assert.notEqual(system.claims.authority.codeHash, ZERO_WORD, 'WRAPPED_CLAIM_STATE_AUTHORITY_CODE_REQUIRED');
  assert.equal(addressWord(one(await hub.call('claimAuthority()', [], at))), system.claims.authority.address, 'WRAPPED_CLAIM_STATE_AUTHORITY');
  const authorityCode = await runtime.code(system.claims.authority.address, at);
  assert.equal(authorityCode, system.claims.authority.expectedCode, 'WRAPPED_CLAIM_STATE_AUTHORITY_COMPLETE_CODE');
  assert.equal(evmRuntimeCodeHash(authorityCode), system.claims.authority.codeHash, 'WRAPPED_CLAIM_STATE_AUTHORITY_CODE_PIN');
  // claimAuthorityCodeHash is private immutable; the owned artifact/deployment
  // path must authenticate its constructor/runtime pin, never call a nonexistent getter.
  assert.equal(decodeSingleString(await hub.call('NATIVE_VALUE_PROFILE()', [], at)), SEMANTIC_PROFILE, 'NATIVE_VALUE_STATE_SEMANTIC_PROFILE');
  const configWords = [...configuration.pins.flatMap(pin => [wordOf(pin.verifier), pin.codeHash]),
    wordOf(libraries.poseidon2Domains.address), libraries.poseidon2Domains.codeHash,
    wordOf(libraries.hubCodec.address), libraries.hubCodec.codeHash];
  assert.equal(configWords.length, VERIFIER_CONFIGURATION_WORDS, 'FLAT_STATE_VERIFIER_COUNT');
  VERIFIER_ROLES.forEach((role, i) => {
    assert.equal(configuration.pins[i].verifier, system.verifiers[role].address, 'FLAT_STATE_VERIFIER_ADDRESS');
    assert.equal(configuration.pins[i].codeHash, system.verifiers[role].codeHash, 'FLAT_STATE_VERIFIER_PIN');
  });
  const common = { hubDomain: system.hubDomain, registryCommitment: system.registryCommitment,
    verifierSetCommitment: system.verifierSetCommitment, ledgerNamespace: system.ledgerNamespace,
    poseidon2Domains: wordOf(libraries.poseidon2Domains.address), poseidon2DomainsCodeHash: libraries.poseidon2Domains.codeHash,
    hubCodec: wordOf(libraries.hubCodec.address), hubCodecCodeHash: libraries.hubCodec.codeHash };
  await drainReadPromises([hub, ...system.pools].flatMap(facade => [
    ...Object.entries(common).map(async ([key, expected]) => {
      assert.equal(one(await facade.call(key + '()', [], at)), expected, 'FLAT_STATE_IDENTITY_' + key);
    }),
    (async () => assert.deepEqual(decodeFlatWords(await facade.call('verifierConfiguration()', [], at), VERIFIER_CONFIGURATION_WORDS),
      configWords, 'FLAT_STATE_VERIFIER_CONFIGURATION'))(),
  ]));
  await drainReadPromises(system.pools.map(async (pool, i) => {
    const expected = { scope: pool.scope, policy: pool.policy, asset: wordOf(pool.asset), assetCodeHash: pool.assetCodeHash,
      assetIdentity: pool.assetIdentity, domainCommitment: pool.domainCommitment,
      receiptHub: wordOf(hub.address), receiptHubCodeHash: hub.codeHash, transitionInProgress: wordOf(0) };
    await drainReadPromises(Object.entries(expected).map(async ([name, value]) =>
      assert.equal(one(await pool.call(name + '()', [], at)), value, 'FLAT_STATE_POOL_' + name)));
    const joins = await collect({ poolAddress: hub.call('pool' + i + '()', [], at),
      poolCode: hub.call('pool' + i + 'CodeHash()', [], at), domain: hub.call('poolDomain(address)', [pool.address], at),
      domainPool: hub.call('domainPool(bytes32)', [pool.domainCommitment], at), registered: hub.call('isRegisteredPool(address)', [pool.address], at) });
    assert.equal(addressWord(one(joins.poolAddress)), pool.address, 'FLAT_STATE_RECIPROCAL_POOL');
    assert.equal(one(joins.poolCode), pool.codeHash, 'FLAT_STATE_RECIPROCAL_CODE');
    assert.equal(one(joins.domain), pool.domainCommitment, 'FLAT_STATE_REGISTERED_DOMAIN');
    assert.equal(addressWord(one(joins.domainPool)), pool.address, 'FLAT_STATE_DOMAIN_POOL');
    assert.ok(bool(one(joins.registered)), 'FLAT_STATE_POOL_NOT_REGISTERED');
    const domain = validateStruct('domain', pool.domain);
    const expectedDomain = { scope: bare(pool.scope), policy: bare(pool.policy), asset: bare(pool.assetIdentity),
      hubDomain: bare(system.hubDomain), registryCommitment: bare(system.registryCommitment),
      verifierSetCommitment: bare(system.verifierSetCommitment), ledgerNamespace: bare(system.ledgerNamespace) };
    assert.deepEqual(domain, expectedDomain, 'FLAT_STATE_DOMAIN_OPENING');
    assert.equal(await math.domainCommitment(domain), bare(pool.domainCommitment), 'FLAT_STATE_DOMAIN_COMMITMENT');
  }));
  const registry = await collect({ epoch: hub.call('registryEpoch()', [], at), rules: hub.call('rulesRoot()', [], at) });
  assert.equal(integer(one(registry.epoch)), system.registry.quorum.registryEpoch, 'FLAT_STATE_REGISTRY_EPOCH');
  assert.equal(bare(one(registry.rules)), system.registry.quorum.rulesRoot, 'FLAT_STATE_RULES_ROOT');
  await drainReadPromises(system.registry.quorum.keys.map(async (key, i) => {
    const values = decodeFlatWords(await hub.call('attester(uint8)', [i], at), 3);
    assert.equal(bare(values[0]), key.x, 'FLAT_STATE_ATTESTER_X'); assert.equal(bare(values[1]), key.y, 'FLAT_STATE_ATTESTER_Y');
    assert.equal(addressWord(values[2]), '0x' + publicKeccak256(Buffer.from(key.x + key.y, 'hex')).subarray(12).toString('hex'),
      'FLAT_STATE_ATTESTER_ADDRESS');
  }));
}

async function readPinnedState(runtime, system, poolIndex, header, math, query, assetObservations) {
  const at = header.number, hub = system.hub, pool = system.pools[poolIndex], d = bare(pool.domainCommitment);
  await identity(runtime, system, at, math);
  const raws = await drainReadPromises(system.pools.map(target => collect({
    rawState: target.call('canonicalState()', [], at), rawHistory: target.call('canonicalRootHistory()', [], at),
    rawBacking: target.call('canonicalBacking()', [], at), noteNodes: target.call('treeNodes()', [], at),
    hubState: hub.call('canonicalState(address)', [target.address], at),
    snapshot: hub.call('currentSnapshot(address)', [target.address], at),
    receiptNodes: hub.call('receiptTreeNodes(bytes32)', [target.domainCommitment], at),
    reserved: hub.call('reservedTagCapacityByPool(address)', [target.address], at),
    nativeBalance: runtime.balance(target.address, at),
  })));
  const globalRaw = await collect({
    overflowCount: hub.call('revocationOverflowCount()', [], at), overflowDigest: hub.call('revocationOverflowDigest()', [], at),
    checkpointNodes: hub.call('checkpointTreeNodes()', [], at), checkpointRoot: hub.call('checkpointRoot()', [], at),
    checkpointCount: hub.call('checkpointCount()', [], at),
    authNodes: pool.call('authorizationTreeNodes()', [], at), authRoot: pool.call('authorizationRoot()', [], at),
    authCount: pool.call('authorizationLeafCount()', [], at), authHistory: pool.call('authorizationRootHistory()', [], at),
    authHistoryCount: pool.call('authorizationRootHistoryCount()', [], at),
    evidenceHistory: hub.call('evidenceStateHistory(bytes32)', [pool.domainCommitment], at),
    evidenceHistoryCount: hub.call('evidenceStateCount(bytes32)', [pool.domainCommitment], at),
    admissionRevocation: hub.call('admissionRevocationState(bytes32)', [pool.domainCommitment], at),
  });
  const domains = { hubDomain: system.hubDomain, registryCommitment: system.registryCommitment };
  const decoded = await drainReadPromises(raws.map(async (raw, i) => {
    const target = system.pools[i], observation = { header, blockNumber: header.number, blockHash: header.hash,
      scope: target.scope, policy: target.policy, asset: target.asset, assetIdentity: target.assetIdentity,
      rawState: raw.rawState, rawHistory: raw.rawHistory, rawBacking: raw.rawBacking };
    const assetObservation = assetObservations[i];
    const ledger = decodeFlatPoolObservation(observation, { assetBalance: BigInt(assetObservation.balance), nativeBalance: raw.nativeBalance });
    assert.deepEqual(decodeFlatWords(raw.noteNodes, 128), ledger.tree.nodes, 'FLAT_STATE_POOL_TREE_NODES');
    const native = await decodeFlatHubState(raw.hubState, { domain: target.domain, domainCommitment: bare(target.domainCommitment) }, math);
    const { state } = native;
    assert.equal(integer(one(raw.reserved), 64n), state.reservedTagCapacity, 'FLAT_STATE_RESERVED_GETTER');
    assert.equal(BigInt(state.reservedTagCapacity), 4n * BigInt(ledger.publicState.liveReservations), 'FLAT_STATE_RESERVATION_TAG_CAPACITY');
    const receiptTree = await decodeFlatFieldTree(raw.receiptNodes, state.receiptCount, state.receiptRoot,
      bare(target.domainCommitment), 2, math);
    assert.deepEqual(receiptTree.leaves, native.commitments, 'FLAT_STATE_RECEIPT_LEAVES');
    decodeFlatWords(raw.snapshot, 20);
    const snapshot = decodeNativeCheckpoint(raw.snapshot, domains);
    const expected = { pool: target.address, scope: target.scope, policy: target.policy, assetIdentity: target.assetIdentity,
      poolRoot: ledger.tree.root, poolSpentDigest: ledger.publicState.spentDigest,
      poolSpentCount: String(ledger.publicState.spent), poolStateSequence: ledger.publicState.sequence,
      receiptRoot: prefix(state.receiptRoot), receiptCount: state.receiptCount, spentTagDigest: prefix(state.spentTagDigest),
      spentTagCount: state.spentTagCount, spentTagSequence: state.spentTagSequence, revokedDigest: prefix(state.revokedDigest),
      revokedCount: state.revokedCount, revocationSequence: state.revocationSequence, hubStateSequence: state.stateSequence,
      registryEpoch: system.registry.quorum.registryEpoch, halt: state.halted ? '1' : '0', timestamp: integer(header.timestamp) };
    for (const [key, value] of Object.entries(expected)) assert.equal(snapshot[key], value, 'FLAT_STATE_SNAPSHOT_' + key);
    await drainReadPromises(ledger.roots.map(async root => assert.ok(bool(one(await target.call('acceptedRoots(bytes32)', [root], at))),
      'FLAT_STATE_ACCEPTED_NOTE_ROOT')));
    assert.ok(bool(one(await hub.call('acceptedReceiptRoots(bytes32,bytes32)', [target.domainCommitment, prefix(state.receiptRoot)], at))),
      'FLAT_STATE_ACCEPTED_RECEIPT_ROOT');
    return { observation, ledger, ...native, receiptTree, snapshot, assetObservation };
  }));
  const selected = decoded[poolIndex], { state } = selected;
  for (const name of ['spentTagDigest', 'spentTagCount', 'spentTagSequence', 'revokedCount', 'revocationSequence',
    'stateSequence', 'halted', 'totalReservedTagCapacity']) assert.equal(decoded[0].state[name], decoded[1].state[name], 'FLAT_STATE_GLOBAL_' + name);
  assert.deepEqual(decoded[0].tags, decoded[1].tags, 'FLAT_STATE_GLOBAL_TAGS');
  assert.deepEqual(decoded[0].revokedEntries, decoded[1].revokedEntries, 'FLAT_STATE_GLOBAL_REVOCATIONS');
  assert.equal(BigInt(state.totalReservedTagCapacity), decoded.reduce((sum, value) => sum + BigInt(value.state.reservedTagCapacity), 0n),
    'FLAT_STATE_TOTAL_RESERVED_CAPACITY');
  const overflow = decodeFlatOverflow(globalRaw.overflowCount, globalRaw.overflowDigest, state);
  const authorizationTree = await decodeFlatFieldTree(globalRaw.authNodes, integer(one(globalRaw.authCount), 64n),
    bare(one(globalRaw.authRoot)), d, 0, math, true);
  const authCount = Number(integer(one(globalRaw.authHistoryCount), 65n));
  assert.ok(authCount > 0, 'FLAT_STATE_AUTH_HISTORY_EMPTY');
  const authHistory = decodeFlatWords(globalRaw.authHistory, 65).map(bare), authorizationRoots = authHistory.slice(0, authCount);
  assert.ok(authHistory.slice(authCount).every(value => value === ZERO), 'FLAT_STATE_AUTH_HISTORY_PADDING');
  assert.deepEqual(authorizationRoots, [...new Set(authorizationTree.prefixRoots)], 'FLAT_STATE_AUTH_HISTORY');
  await drainReadPromises(authorizationRoots.map(async root => assert.ok(bool(one(await pool.call('acceptedAuthorizationRoots(bytes32)', [prefix(root)], at))),
    'FLAT_STATE_ACCEPTED_AUTHORIZATION_ROOT')));
  const checkpointCount = integer(one(globalRaw.checkpointCount), 64n);
  decodeFlatWords(globalRaw.checkpointNodes, 128);
  const oldCheckpointTree = decodeNativeCheckpointTree(globalRaw.checkpointNodes, checkpointCount, one(globalRaw.checkpointRoot));
  const checkpointNodes = oldCheckpointTree.nodes.map(bare), checkpointLeaves = checkpointNodes.slice(64, 64 + Number(checkpointCount));
  const checkpointRoots = shaPrefixRoots(checkpointLeaves), checkpointTree = treeView(checkpointNodes, Number(checkpointCount), checkpointRoots);
  await drainReadPromises([...new Set(checkpointRoots)].map(async root => assert.ok(bool(one(await hub.call('acceptedCheckpointRoots(bytes32)', [prefix(root)], at))),
    'FLAT_STATE_ACCEPTED_CHECKPOINT_ROOT')));
  const checkpoints = await drainReadPromises(checkpointLeaves.map(async (digest, i) => {
    const rawSnapshot = await hub.call('checkpointAt(uint32)', [i], at);
    decodeFlatWords(rawSnapshot, 20);
    const snapshot = decodeNativeCheckpoint(rawSnapshot, domains);
    assert.equal(snapshotDigest(snapshot), prefix(digest), 'FLAT_STATE_CHECKPOINT_DIGEST');
    const targetIndex = system.pools.findIndex(target => target.address === snapshot.pool);
    assert.ok(targetIndex >= 0, 'FLAT_STATE_CHECKPOINT_POOL');
    const target = system.pools[targetIndex];
    for (const name of ['scope', 'policy', 'assetIdentity']) assert.equal(snapshot[name], target[name], 'FLAT_STATE_CHECKPOINT_DOMAIN');
    canonicalField(bare(snapshot.receiptRoot)); canonicalField(bare(snapshot.revokedDigest));
    assert.ok(BigInt(snapshot.timestamp) <= BigInt(header.timestamp), 'FLAT_STATE_FUTURE_CHECKPOINT');
    const isCurrent = bool(one(await hub.call('isCheckpointCurrent(bytes32)', [prefix(digest)], at)));
    const normalizedCurrent = { ...decoded[targetIndex].snapshot, timestamp: snapshot.timestamp };
    assert.equal(isCurrent, snapshotDigest(normalizedCurrent) === prefix(digest), 'FLAT_STATE_CHECKPOINT_CURRENT');
    const historicalEvidence = await math.evidenceState(bare(target.domainCommitment), {
      hubDomain: target.domain.hubDomain, registryCommitment: target.domain.registryCommitment,
      receiptRoot: bare(snapshot.receiptRoot), receiptCount: snapshot.receiptCount,
      revokedDigest: bare(snapshot.revokedDigest), revokedCount: snapshot.revokedCount, revocationSequence: snapshot.revocationSequence });
    const historical = await collect({ note: target.call('acceptedRoots(bytes32)', [snapshot.poolRoot], at),
      receipt: hub.call('acceptedReceiptRoots(bytes32,bytes32)', [target.domainCommitment, snapshot.receiptRoot], at),
      recorded: hub.call('recordedEvidenceStates(bytes32,bytes32)', [target.domainCommitment, prefix(historicalEvidence)], at),
      sequence: hub.call('evidenceStateRevocationSequence(bytes32,bytes32)', [target.domainCommitment, prefix(historicalEvidence)], at) });
    assert.ok(bool(one(historical.note)) && bool(one(historical.receipt)) && bool(one(historical.recorded)), 'FLAT_STATE_CHECKPOINT_RECORDED_ROOTS');
    assert.equal(integer(one(historical.sequence)), snapshot.revocationSequence, 'FLAT_STATE_CHECKPOINT_REVOCATION_SEQUENCE');
    return { index: i, digest, snapshot, evidenceState: historicalEvidence, rootAtInsertion: checkpointRoots[i + 1], isCurrent };
  }));
  const evidenceHistory = decodeFlatEvidenceHistory(globalRaw.evidenceHistory,
    integer(one(globalRaw.evidenceHistoryCount)), state.evidenceState);
  const evidenceRecords = await drainReadPromises([...new Set([...evidenceHistory.values, state.evidenceState])].map(async value => {
    const observed = await collect({ recorded: hub.call('recordedEvidenceStates(bytes32,bytes32)', [pool.domainCommitment, prefix(value)], at),
      sequence: hub.call('evidenceStateRevocationSequence(bytes32,bytes32)', [pool.domainCommitment, prefix(value)], at),
      usable: hub.call('isUsable(bytes32,bytes32)', [pool.domainCommitment, prefix(value)], at) });
    assert.ok(bool(one(observed.recorded)), 'FLAT_STATE_EVIDENCE_NOT_RECORDED');
    const revocationSequence = integer(one(observed.sequence)), usable = bool(one(observed.usable));
    assert.ok(BigInt(revocationSequence) <= BigInt(state.revocationSequence), 'FLAT_STATE_FUTURE_EVIDENCE');
    assert.equal(usable, !state.halted && revocationSequence === state.revocationSequence, 'FLAT_STATE_EVIDENCE_USABILITY');
    if (value === state.evidenceState) assert.equal(revocationSequence, state.revocationSequence, 'FLAT_STATE_CURRENT_EVIDENCE_SEQUENCE');
    return { value, revocationSequence, usable };
  }));
  const admissionRevocationState = await math.admissionRevocationState(d, state.revokedDigest, state.revokedCount, state.revocationSequence);
  assert.equal(prefix(admissionRevocationState), one(globalRaw.admissionRevocation), 'FLAT_STATE_ADMISSION_REVOCATION');
  const healthState = { pool: pool.address.slice(2), domain: d, hubDomain: pool.domain.hubDomain,
    registryCommitment: pool.domain.registryCommitment, evidenceState: state.evidenceState,
    receiptRoot: state.receiptRoot, receiptCount: state.receiptCount, spentTagDigest: state.spentTagDigest,
    spentTagCount: state.spentTagCount, spentTagSequence: state.spentTagSequence, revokedDigest: state.revokedDigest,
    revokedCount: state.revokedCount, revocationSequence: state.revocationSequence, stateSequence: state.stateSequence,
    revocationOverflowDigest: overflow.digest, revocationOverflowCount: overflow.count, halted: state.halted ? '1' : '0', timestamp: integer(header.timestamp) };
  const result = { classification: 'RECONSTRUCTED_OWNED_NATIVE_VALUE_V2_RPC_STATE_NOT_NATIVE_CONSENSUS', header,
    head: { number: integer(header.number), hash: bare(header.hash), timestamp: integer(header.timestamp) },
    poolIndex, poolAddress: pool.address, hubAddress: hub.address, domain: pool.domain, domainCommitment: d,
    assetMetadata: pool.assetMetadata, assetObservation: selected.assetObservation,
    registry: system.registry, adapterProfiles: system.adapterProfiles, poolObservation: selected.observation, ledger: selected.ledger, state,
    stateOpening: selected.evidence, evidenceState: state.evidenceState, admissionRevocationState,
    receiptTree: selected.receiptTree, receiptLeaves: selected.commitments, revokedEntries: selected.revokedEntries,
    spentTags: selected.tags, snapshot: selected.snapshot, snapshotDigest: bare(snapshotDigest(selected.snapshot)),
    authorizationTree, authorizationRoots, checkpointTree, checkpointCount, checkpoints,
    evidenceHistory: { ...evidenceHistory, records: evidenceRecords }, overflow, healthState,
    capacity: { reservedByPool: decoded.map(value => value.state.reservedTagCapacity), totalReserved: state.totalReservedTagCapacity },
  };
  if (query !== undefined) {
    assert.equal(query.domainCommitment, d, 'FLAT_STATE_QUERY_DOMAIN');
    assert.ok(authorizationRoots.includes(query.authorizationRoot), 'FLAT_STATE_QUERY_AUTHORIZATION');
    const checkpoint = [...checkpoints].reverse().find(item => item.digest === query.checkpoint && item.snapshot.pool === pool.address);
    assert.ok(checkpoint, 'FLAT_STATE_QUERY_CHECKPOINT');
    const path = checkpointTree.path(checkpoint.index);
    result.dispatch = { head: result.head, domainCommitment: d, authorizationRoots,
      checkpointSnapshot: checkpoint.snapshot, checkpointPath: { root: path.root, index: path.index, siblings: path.siblings },
      checkpointCount, snapshot: selected.snapshot,
      poolState: { rawState: selected.observation.rawState, rawHistory: selected.observation.rawHistory, rawBacking: selected.observation.rawBacking },
      receiptLeaves: selected.commitments, revokedEntries: selected.revokedEntries, spentTags: selected.tags,
      evidenceState: state.evidenceState, revocationOverflowDigest: overflow.digest, revocationOverflowCount: overflow.count };
  }
  return freeze(result);
}

/** Only original views of this exact system/pool may be shared by its quorum.
 * This carries receiver-chain state, never cached native observations. */
export function assertWrappedClaimGraphCurrentViewV1(view, { runtime, system, poolIndex }) {
  const item = issued.get(view);
  assert.ok(item && item.runtime === runtime && item.system === system && !item.historical
    && view.poolIndex === poolIndex, 'NATIVE_VALUE_STATE_OWN_CURRENT_VIEW_REQUIRED');
}
function decodeSingleString(raw) {
  assert.equal(typeof raw, 'string'); assert.match(raw, /^0x(?:[0-9a-f]{64})+$/);
  const bytes = Buffer.from(raw.slice(2), 'hex');
  assert.equal(BigInt('0x' + bytes.subarray(0, 32).toString('hex')), 32n, 'NATIVE_VALUE_STATE_STRING_OFFSET');
  const size = BigInt('0x' + bytes.subarray(32, 64).toString('hex'));
  assert.ok(size < 256n && bytes.length === 64 + Math.ceil(Number(size) / 32) * 32, 'NATIVE_VALUE_STATE_STRING_LENGTH');
  assert.ok(bytes.subarray(64 + Number(size)).every(x => x === 0), 'NATIVE_VALUE_STATE_STRING_PADDING');
  return bytes.subarray(64, 64 + Number(size)).toString('ascii');
}
