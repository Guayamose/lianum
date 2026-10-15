import {privateAssemblyRevocationDigest} from '../../src/assembly/private-assembly-revocations.mjs';
/** PC18 host/source controls only. Optional solc compilation uses mock sources,
 * starts no chain runtime and provides NO proof or deployed-contract evidence.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import {
  PRIVATE_ROOT_HISTORY_CAPACITY, PRIVATE_ROOT_HISTORY_FRAME_BYTES,
  PRIVATE_EMPTY_NOTE_ROOT, privateRootHistoryFrame, privateRootHistoryDigest,
  privateAssemblyRootHistoryFrame, privateAssemblyRootHistoryDigest, assertPrivateRootHistory,
} from '../../src/assembly/private-assembly-history.mjs';
import {
  PrivateNoteTree, ZERO_NOTE_HASH, PRIVATE_POOL_INPUT_WORDS,
  privateSpentDigest, privateEffectDigest,
} from '../../src/notes/private-note-tree.mjs';
import {
  PRIVATE_VERIFIER_MODES, PRIVATE_POOL_MAX_GAS, privateVerifierCalldata,
  assertPrivateSnapshotCanonical, decodePrivateAssemblySnapshot,
  compilePrivateAssemblyNativePool, deployPrivateAssemblyNativePool,
} from '../../src/assembly/private-assembly-runtime.mjs';

const h = value => `0x${BigInt(value).toString(16).padStart(64, '0')}`;
const sha = value => createHash('sha256').update(value).digest('hex');
const pad = (values, size = 65) => [...values, ...Array(size - values.length).fill(ZERO_NOTE_HASH)];
const abi = words => `0x${words.map(value => h(value).slice(2)).join('')}`;
const unabi = raw => raw.slice(2).match(/.{64}/g).map(word => `0x${word}`);
const scope = h(1), policy = h(2);

function historyState(roots, leafCount, extra = {}) {
  return { scope, root: roots.at(-1), leafCount, rootHistory: pad(roots), rootHistoryCount: roots.length,
    rootHistoryDigest: privateRootHistoryDigest(scope, roots), ...extra };
}

function fixture() {
  const tree = new PrivateNoteTree(), initial = tree.root;
  tree.append(h(10)); const reservedRoot = tree.root;
  tree.append(h(11)); const unacceptedPrefix = tree.root;
  tree.append(h(12));
  const roots = [initial, reservedRoot, tree.root], nullifiers = pad([h(20)], 64);
  const solEffects = pad([h(30)], 64), btcEffects = pad([h(31)], 64);
  return { scope, policy, reservedRoot, unacceptedPrefix,
    header: { number: '0x2', hash: h(200), timestamp: '0x258' },
    rawState: abi([tree.root, privateSpentDigest(scope, nullifiers, 1), 2, 3, 1, 0, 2, ...tree.leaves, ...nullifiers]),
    rawEffects: abi([2, privateEffectDigest('SOL', scope, solEffects, 1), privateEffectDigest('BTC', scope, btcEffects, 1), 1, 1, ...solEffects, ...btcEffects]),
    rawRevocations:abi([2,0,privateAssemblyRevocationDigest(scope,[]),0,...pad([],64)]),
    rawHistory: abi([2, privateRootHistoryDigest(scope, roots), roots.length, ...pad(roots)]),
  };
}

test('history frame matches independent big-endian 2117-byte golden vector', () => {
  assert.equal(PRIVATE_ROOT_HISTORY_CAPACITY, 65);
  assert.equal(PRIVATE_ROOT_HISTORY_FRAME_BYTES, 2117);
  assert.equal(privateAssemblyRootHistoryFrame, privateRootHistoryFrame);
  assert.equal(privateAssemblyRootHistoryDigest, privateRootHistoryDigest);
  assert.equal(PRIVATE_EMPTY_NOTE_ROOT, '0xc6984907d2e534964351393bc85f04374065b63870cc859c68192def090c1017');
  const frame = privateRootHistoryFrame(scope, [PRIVATE_EMPTY_NOTE_ROOT]);
  assert.equal(frame.length, 2117);
  assert.equal(frame[0], 0x18);
  assert.equal(frame.subarray(1, 33).toString('hex'), scope.slice(2));
  assert.equal(frame.subarray(33, 37).toString('hex'), '00000001');
  assert.equal(frame.subarray(37, 69).toString('hex'), PRIVATE_EMPTY_NOTE_ROOT.slice(2));
  assert.ok(frame.subarray(69).every(byte => byte === 0));
  assert.equal(sha(frame), '4085675baf2ea8764bab6ddff92a0f34fc08d45ecb4721397e795cd4395cb10f');
  assert.equal(privateRootHistoryDigest(scope, pad([PRIVATE_EMPTY_NOTE_ROOT]), 1), `0x${sha(frame)}`);
  const full = [PRIVATE_EMPTY_NOTE_ROOT, ...Array.from({ length: 64 }, (_, index) => h(index + 2))];
  assert.equal(privateRootHistoryFrame(scope, full).readUInt32BE(33), 65);
  assert.equal(privateRootHistoryFrame(scope, full).subarray(-32).toString('hex'), h(65).slice(2));
});

test('history encoding binds order, scope, count and strict zero padding', () => {
  const roots = [PRIVATE_EMPTY_NOTE_ROOT, h(3), h(4)];
  const expected = privateRootHistoryDigest(scope, roots);
  assert.notEqual(privateRootHistoryDigest(h(2), roots), expected);
  assert.notEqual(privateRootHistoryDigest(scope, [roots[0], roots[2], roots[1]]), expected);
  assert.notEqual(privateRootHistoryDigest(scope, roots.slice(0, 2)), expected);
  for (const count of [0, 66, -1, -0, 1.1, NaN, Infinity, '01', '1.0', '0x1', null, false]) {
    assert.throws(() => privateRootHistoryFrame(scope, roots, count), /PC18_HISTORY_/);
  }
  assert.throws(() => privateRootHistoryFrame(scope, roots, 4), /HISTORY_COUNT/);
  assert.throws(() => privateRootHistoryFrame(scope, roots, 2), /HISTORY_PADDING/);
  assert.throws(() => privateRootHistoryFrame(scope, [roots[0], roots[0]]), /HISTORY_DUPLICATE/);
  assert.throws(() => privateRootHistoryFrame(scope, [ZERO_NOTE_HASH]), /HISTORY_ZERO_ENTRY/);
  assert.throws(() => privateRootHistoryFrame(scope, [roots[0], ZERO_NOTE_HASH]), /HISTORY_ZERO_ENTRY/);
  assert.throws(() => privateRootHistoryFrame(scope, Array(66).fill(ZERO_NOTE_HASH), 1), /HISTORY_CAPACITY/);
  assert.throws(() => privateRootHistoryFrame(scope, Array(1)), /HISTORY_HASH_ENCODING/);
  assert.throws(() => privateRootHistoryFrame(scope, [Buffer.alloc(31)]), /HISTORY_HASH_WIDTH/);
  assert.throws(() => privateRootHistoryFrame('0x01', roots), /HISTORY_HASH_ENCODING/);
  const withBadTail = pad(roots); withBadTail[64] = h(9);
  assert.throws(() => privateRootHistoryFrame(scope, withBadTail, 3), /HISTORY_PADDING/);
  assert.deepEqual(privateRootHistoryFrame(Buffer.from(scope.slice(2), 'hex'), roots.map(root => Buffer.from(root.slice(2), 'hex'))), privateRootHistoryFrame(scope, roots));
});

test('snapshot history has the initial root, final current root and count <= leaves + 1', () => {
  assert.deepEqual(assertPrivateRootHistory(historyState([PRIVATE_EMPTY_NOTE_ROOT], 0)), {
    count: 1, remaining: 64, digest: privateRootHistoryDigest(scope, [PRIVATE_EMPTY_NOTE_ROOT]),
  });
  const roots = [PRIVATE_EMPTY_NOTE_ROOT, ...Array.from({ length: 64 }, (_, index) => h(index + 2))];
  assert.equal(assertPrivateRootHistory(historyState(roots, 64)).remaining, 0);
  assert.throws(() => assertPrivateRootHistory(historyState(roots, 63)), /HISTORY_LEAF_BOUND/);
  assert.throws(() => assertPrivateRootHistory(historyState([h(8)], 0)), /HISTORY_INITIAL_ROOT/);
  assert.throws(() => assertPrivateRootHistory(historyState([PRIVATE_EMPTY_NOTE_ROOT, h(3)], 1, { root: h(4) })), /HISTORY_CURRENT_ROOT/);
  assert.throws(() => assertPrivateRootHistory(historyState([PRIVATE_EMPTY_NOTE_ROOT], 0, { rootHistoryDigest: h(7) })), /HISTORY_DIGEST/);
  assert.throws(() => assertPrivateRootHistory(historyState([PRIVATE_EMPTY_NOTE_ROOT], 0, { rootHistory: [PRIVATE_EMPTY_NOTE_ROOT] })), /HISTORY_SNAPSHOT_WIDTH/);
  assert.throws(() => assertPrivateRootHistory({}), /HISTORY_FIELDS/);
});

test('host transition model accepts final roots only, retains old membership and does not duplicate spent-only roots', () => {
  const tree = new PrivateNoteTree(), roots = [tree.root], accepted = new Set(roots);
  const advance = () => {
    if (!accepted.has(tree.root)) { accepted.add(tree.root); roots.push(tree.root); }
    assertPrivateRootHistory(historyState(roots, tree.leafCount));
  };
  tree.append(h(10)); advance(); const historicalRoot = tree.root;
  tree.append(h(11)); advance(); // Unrelated funded note after owner departure.
  assert.ok(accepted.has(historicalRoot));
  tree.append(h(12)); const intermediate = tree.root;
  tree.append(h(13)); advance(); // Fulfillment publishes only its final root.
  assert.equal(accepted.has(intermediate), false);
  assert.equal(roots.includes(intermediate), false);
  assert.deepEqual([...accepted], roots);
  assert.equal(roots.length, 4); assert.equal(tree.leafCount, 4);
  const before = privateRootHistoryDigest(scope, roots);
  advance(); advance(); // Withdrawal and another spent-only transition.
  assert.equal(roots.length, 4);
  assert.equal(privateRootHistoryDigest(scope, roots), before);
  assert.equal(roots.includes(h(999)), false);
});

test('the existing leaf reservation headroom conservatively bounds future history capacity', () => {
  for (let leaves = 0; leaves <= 64; leaves++) {
    for (let reservations = 0; leaves + 2 * reservations <= 64; reservations++) {
      for (let historyCount = 1; historyCount <= leaves + 1; historyCount++) {
        // Even overcounting one root per future output leaf stays within 65.
        assert.ok(historyCount + 2 * reservations <= 65);
      }
    }
  }
});

test('pure ABI decoder authenticates history consistency alongside all PC16 snapshot checks', () => {
  const input = fixture(), result = decodePrivateAssemblySnapshot(input);
  assert.equal(result.rootHistoryCount, 3);
  assert.equal(result.rootHistory.length, 65);
  assert.equal(result.leafCount, 3);
  assert.equal(result.stateSequence, '2');
  assert.equal(result.sequence, result.stateSequence);
  assert.equal(result.epoch, '1');
  assert.equal(result.rootHistory[1], input.reservedRoot);
  assert.equal(result.rootHistory.includes(input.unacceptedPrefix), false);
  assert.equal(result.rootHistory[2], result.root);
  assert.equal(result.rootHistoryDigest, privateRootHistoryDigest(scope, result.rootHistory, 3));
});

test('pure decoder rejects stale-sequence, tampered, reordered, truncated and malformed history', () => {
  const input = fixture();
  const rejectHistory = (change, pattern) => {
    const words = unabi(input.rawHistory); change(words);
    assert.throws(() => decodePrivateAssemblySnapshot({ ...input, rawHistory: abi(words) }), pattern);
  };
  rejectHistory(words => { words[0] = h(1); }, /HISTORY_SEQUENCE/);
  rejectHistory(words => { words[1] = h(5); }, /HISTORY_DIGEST/);
  for (const count of [0, 66]) rejectHistory(words => { words[2] = h(count); }, /HISTORY_COUNT/);
  rejectHistory(words => { words[2] = h(2); }, /HISTORY_PADDING/);
  rejectHistory(words => { [words[3], words[4]] = [words[4], words[3]]; }, /HISTORY_DIGEST/);
  rejectHistory(words => { words[4] = h(999); }, /HISTORY_DIGEST/);
  rejectHistory(words => { words[4] = words[3]; }, /HISTORY_DUPLICATE/);
  rejectHistory(words => { words[67] = h(999); }, /HISTORY_PADDING/);
  for (const key of ['rawState', 'rawEffects', 'rawHistory', 'rawRevocations']) {
    assert.throws(() => decodePrivateAssemblySnapshot({ ...input, [key]: input[key].slice(0, -64) }), /ABI_LENGTH/);
    assert.throws(() => decodePrivateAssemblySnapshot({ ...input, [key]: `${input[key]}00` }), /SNAPSHOT_ABI/);
  }
  const rawState = unabi(input.rawState); rawState[0] = h(999);
  assert.throws(() => decodePrivateAssemblySnapshot({ ...input, rawState: abi(rawState) }), /CANONICAL_ROOT/);
  const rawEffects = unabi(input.rawEffects); rawEffects[1] = h(999);
  assert.throws(() => decodePrivateAssemblySnapshot({ ...input, rawEffects: abi(rawEffects) }), /CANONICAL_SOL_EFFECTS/);
});

test('canonical-header recheck catches a reorg after dependent reads without a native runtime', async () => {
  const calls = [], snapshot = decodePrivateAssemblySnapshot(fixture());
  await assertPrivateSnapshotCanonical({ evm: async (...args) => { calls.push(args); return { hash: snapshot.blockHash }; } }, snapshot);
  assert.deepEqual(calls, [['eth_getBlockByNumber', [snapshot.blockNumber, false]]]);
  await assert.rejects(() => assertPrivateSnapshotCanonical({ evm: async () => ({ hash: h(999) }) }, snapshot), /BLOCK_CHANGED/);
});

test('new runtime preserves terminal ABIs and lets supplied readiness verifiers enforce new lengths', async () => {
  assert.deepEqual(PRIVATE_POOL_INPUT_WORDS, { reserve: 34, fulfill: 65, refund: 41, withdraw: 39 });
  assert.deepEqual(PRIVATE_VERIFIER_MODES, ['reserve', 'fulfill', 'refund', 'withdraw', 'sol_ready', 'btc_ready']);
  assert.equal(PRIVATE_POOL_MAX_GAS, 30_000_000);
  for (const length of [34, 65, 41, 39, 61, 79]) {
    const encoded = privateVerifierCalldata('12345678', Buffer.from([1]), Array(length).fill('0'));
    const words = unabi(`0x${encoded.slice(10)}`);
    assert.equal(BigInt(words[1]), 128n);
    assert.equal(BigInt(words[4]), BigInt(length));
  }
  await assert.rejects(() => deployPrivateAssemblyNativePool({}, {}), /RUNTIME_OWNERSHIP/);
  await assert.rejects(() => deployPrivateAssemblyNativePool({ metadata: { classification: 'OWNED_LOCAL_RUNTIMES_ONLY', freshSyntheticWallets: false } }, {}), /SYNTHETIC_ACCOUNTS/);
});

test('new contract preserves PC16 exactly outside explicit history, revocation and atomic reserve guards', async () => {
  const original = await readFile(new URL('../../../../contracts/engine/PrivateCurrentNativeNotePool.sol', import.meta.url), 'utf8');
  const assembly = await readFile(new URL('../../../../contracts/engine/PrivateAssemblyNativeNotePool.sol', import.meta.url), 'utf8');
  assert.equal(sha(original), '8082418e1b01cfa8161e47dfa0558c77150f74e3d1ed2b9f61961ebc78aea47b');
  // Normalize only this exact reviewed entry-point delta. Keep the entire
  // shared reserve body in the PC16 comparison, including every amount,
  // admission, output, verifier and headroom check and each state write.
  const guardedEntrypoints = `    /// Unguarded research entry point. Production funding uses reserveGuarded.
    function reserve(bytes calldata proof, bytes32[] calldata inputs) external payable nonReentrant {
        _reserve(proof, inputs);
        _advance();
    }

    /// @notice Atomically fund only the exact previously projected transition.
    /// The unchanged 34-word reserve proof still authenticates deposit terms.
    /// These transaction guards bind the caller's prepositioned authorization
    /// to its base state and resulting root; they do not admit a future root.
    /// Any failure reverts ETH, admissions, tree writes, counters and events.
    function reserveGuarded(
        bytes calldata proof, bytes32[] calldata inputs,
        bytes32 expectedRoot, uint64 expectedSequence, bytes32 expectedPostRoot
    ) external payable nonReentrant {
        require(currentRoot == expectedRoot, "RESERVE_ROOT_CHANGED");
        require(stateSequence == expectedSequence, "RESERVE_SEQUENCE_CHANGED");
        _reserve(proof, inputs);
        require(nodes[1] == expectedPostRoot, "RESERVE_POST_ROOT_MISMATCH");
        // Only the successful final root reaches acceptedRoots/rootHistory.
        _advance();
    }

`;
  assert.equal(assembly.split(guardedEntrypoints).length, 2, 'exact guarded entrypoint delta occurs once');
  const sharedReserve = /    function _reserve\(bytes calldata proof, bytes32\[\] calldata inputs\) private \{\n([\s\S]*?)\n    \}/g;
  assert.equal([...assembly.matchAll(sharedReserve)].length, 1, 'one complete shared reserve body');
  const reconstructed = assembly.replace(guardedEntrypoints, '').replace(sharedReserve, (_match, body) =>
    `    function reserve(bytes calldata proof, bytes32[] calldata inputs) external payable nonReentrant {\n${body}\n        _advance();\n    }`);
  const normalized = reconstructed.replace(/    \/\/ PC18_(?:HISTORY|REVOCATION)_BEGIN\n[\s\S]*?    \/\/ PC18_(?:HISTORY|REVOCATION)_END\n\n?/g, '')
    .replace('contract PrivateAssemblyNativeNotePool {', 'contract PrivateCurrentNativeNotePool {')
    .replaceAll('        _acceptCurrentRoot();', '        acceptedRoots[currentRoot] = true;');
  assert.equal(normalized, original);
  assert.equal(assembly.match(/acceptedRoots\[currentRoot\] = true;/g)?.length, 1);
  assert.equal(assembly.match(/        _acceptCurrentRoot\(\);/g)?.length, 2);
  const append = assembly.slice(assembly.indexOf('    function _append('), assembly.indexOf('    function _consume('));
  assert.doesNotMatch(append, /acceptedRoots|rootHistory|_acceptCurrentRoot/);
  assert.match(assembly, /if \(!acceptedRoots\[currentRoot\]\) \{/);
  assert.match(assembly, /rootHistoryCount < CAPACITY \+ 1 && rootHistoryCount <= leafCount/);
  assert.match(assembly, /sha256\(abi\.encodePacked\(bytes1\(0x18\), scope, rootHistoryCount, rootHistoryEntries\)\)/);
});

test('runtime source retains trusted local limits and pins all four snapshot reads to one block', async () => {
  const original = await readFile(new URL('../../../proofs/evidence/original-sources/0a471812dbbd7a1b438398f7b67e77930b628ef4a52dda5555cd56a64d8d4c8e.source', import.meta.url), 'utf8');
  assert.equal(sha(original), '0a471812dbbd7a1b438398f7b67e77930b628ef4a52dda5555cd56a64d8d4c8e');
  const source = await readFile(new URL('../../src/assembly/private-assembly-runtime.mjs', import.meta.url), 'utf8');
  for (const method of ['canonicalState', 'canonicalEffects', 'canonicalRootHistory', 'canonicalRevocations']) assert.ok(source.includes(`call('${method}()', [], header.number)`));
  assert.ok(source.includes('await assertPrivateSnapshotCanonical(runtime, result);'));
  assert.ok(source.includes("await runtime.evm('eth_chainId'), '0x7a69'"));
  assert.ok(source.includes('await pinnedBinary(...linuxRuntimePins.solc)'));
  assert.ok(source.includes("['--standard-json', '--no-import-callback']"));
  assert.ok(source.includes('env: isolatedRuntimeEnvironment(cwd)'));
  assert.ok(source.includes('const EIP170_LIMIT = 24_576;'));
  assert.ok(source.includes("scratchDirectory('m18-private-assembly-compile-')"));
  assert.doesNotMatch(source, /startOwnProcess|http:\/\/|https:\/\//);
  assert.doesNotMatch(source, /PRIVATE_READINESS_INPUT_WORDS|sol_ready:\s*\d+|btc_ready:\s*\d+/);
});

test('COMPILE ONLY: new pool and six explicitly mock verifier sources fit normal EIP170', {
  skip: process.env.PC18_RUN_POOL_COMPILE_TEST !== '1' ? 'opt-in official pinned solc compilation; no deployment or proof claim' : false,
  timeout: 180_000,
}, async t => {
  const sources = Object.fromEntries(PRIVATE_VERIFIER_MODES.map(mode => [mode,
    `// SPDX-License-Identifier: MIT\npragma solidity 0.8.37;\ncontract HonkVerifier { function verify(bytes calldata, bytes32[] calldata values) external view returns (bool) { return values.length == ${mode === 'sol_ready' ? 61 : mode === 'btc_ready' ? 79 : PRIVATE_POOL_INPUT_WORDS[mode]} && block.number > 0; } }`,
  ]));
  const result = await compilePrivateAssemblyNativePool(sources);
  const artifact = result.output.contracts[result.sourceNames.pool].PrivateAssemblyNativeNotePool;
  t.diagnostic(JSON.stringify({ classification: 'MOCK_VERIFIER_COMPILE_ONLY_NO_DEPLOYMENT_OR_PROOF',
    milliseconds: result.milliseconds, peakSampledRSSKiB: result.peakSampledRSSKiB,
    memoryMetric: result.memoryMetric, solcPin: result.solcPin, poolSource: result.sources[result.sourceNames.pool],
    creationBytes: artifact.evm.bytecode.object.length / 2,
    deployedBytes: artifact.evm.deployedBytecode.object.length / 2,
    deployedBytecodeSHA256: sha(Buffer.from(artifact.evm.deployedBytecode.object, 'hex')),
  }));
  assert.ok(artifact.evm.deployedBytecode.object.length / 2 <= 24_576);
  for (const signature of ['rootHistory()', 'canonicalRootHistory()', 'rootHistoryCount()', 'rootHistoryDigest()', 'reserve(bytes,bytes32[])', 'fulfill(bytes,bytes32[])', 'refund(bytes,bytes32[])', 'withdraw(bytes,bytes32[])']) assert.ok(artifact.evm.methodIdentifiers[signature]);
  assert.equal(Object.keys(result.sources).length, 7);
});
