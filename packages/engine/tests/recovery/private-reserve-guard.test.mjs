/** Guard encoding and SYNTHETIC_CONTRACT_CONTROLS_ONLY_NOT_GENUINE_PROOFS.
 * Actual unmodified pool on owned loopback Anvil, with deliberately synthetic
 * verifiers. These cases establish EVM atomicity/control flow, never proof
 * soundness, cryptographic conservation, membership or preauthorization custody.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { access } from 'node:fs/promises';
import { join } from 'node:path';
import { privateGuardedReserveCalldata, deployPrivateAssemblyNativePool, PRIVATE_VERIFIER_MODES } from '../../src/assembly/private-assembly-runtime.mjs';
import { encodePrivatePoolInputs, PrivateNoteTree, ZERO_NOTE_HASH } from '../../src/notes/private-note-tree.mjs';
import { linuxRuntimePins } from '../../src/chains/shared/linux-runtime-pins.mjs';
import { pinnedBinary, scratchDirectory, removeOwnScratch, unusedLoopbackPort, startOwnProcess, stopOwnProcess, ownedRuntimeRpc, sleep, projectRoot } from '../../src/chains/shared/runtime-harness.mjs';

const CLASSIFICATION = 'SYNTHETIC_CONTRACT_CONTROLS_ONLY_NOT_GENUINE_PROOFS';
const hash = label => `0x${createHash('sha256').update(`GUARDED RESERVE SYNTHETIC ${label}`).digest('hex')}`;
const word = n => BigInt(n).toString(16).padStart(64, '0');
const GOOD_PROOF = Buffer.from([0xa5, 0x5a]);
const MOCK = `// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;
// SYNTHETIC_CONTRACT_CONTROLS_ONLY_NOT_GENUINE_PROOFS.
contract HonkVerifier {
    function verify(bytes calldata proof, bytes32[] calldata) external view returns (bool) {
        return proof.length == 2 && proof[0] == 0xa5 && proof[1] == 0x5a;
    }
}`;

// Independent positional decoding, including proof padding and both dynamic
// offsets, guards crossing Number precision and the unchanged 34 input words.
test('guarded reserve ABI has five head words and two correctly located dynamic tails', () => {
  const guards = { expectedRoot: hash('base root'), expectedSequence: (1n << 64n) - 1n, expectedPostRoot: hash('post root') };
  for (const length of [0, 1, 2, 31, 32, 33, 63, 64, 65, 4096]) {
    const proof = Buffer.alloc(length, 0xa7), inputs = Array.from({ length: 34 }, (_, i) => BigInt(i));
    const encoded = privateGuardedReserveCalldata('12345678', proof, inputs, guards);
    assert.equal(encoded.slice(0, 10), '0x12345678');
    const args = Buffer.from(encoded.slice(10), 'hex');
    const at = offset => BigInt(`0x${args.subarray(offset, offset + 32).toString('hex')}`);
    const padded = Math.ceil(length / 32) * 32;
    assert.equal(at(0), 160n);
    assert.equal(at(32), BigInt(192 + padded));
    assert.equal(`0x${args.subarray(64, 96).toString('hex')}`, guards.expectedRoot);
    assert.equal(at(96), guards.expectedSequence);
    assert.equal(`0x${args.subarray(128, 160).toString('hex')}`, guards.expectedPostRoot);
    assert.equal(at(160), BigInt(length));
    assert.deepEqual(args.subarray(192, 192 + length), proof);
    assert.ok(args.subarray(192 + length, 192 + padded).every(byte => byte === 0));
    assert.equal(at(192 + padded), 34n);
    assert.deepEqual(inputs.map((_, i) => at(224 + padded + 32 * i)), inputs);
    assert.equal(args.length, 224 + padded + 32 * 34);
  }
});

test('guarded reserve ABI rejects malformed guards and imprecise/out-of-range sequence', () => {
  const valid = { expectedRoot: hash('root'), expectedSequence: 0n, expectedPostRoot: hash('post') };
  const encode = (guards = valid, proof = GOOD_PROOF, inputs = []) => privateGuardedReserveCalldata('12345678', proof, inputs, guards);
  for (const bad of [null, [], {}, { ...valid, expectedRoot: '0x1' }, { ...valid, expectedPostRoot: ZERO_NOTE_HASH.slice(2) }, { ...valid, surprise: true }]) assert.throws(() => encode(bad));
  for (const bad of [-1n, -0, 1n << 64n, Number.MAX_SAFE_INTEGER + 1, '01', '1.0', undefined]) assert.throws(() => encode({ ...valid, expectedSequence: bad }));
  for (const good of [0n, '0', Number.MAX_SAFE_INTEGER, (1n << 64n) - 1n]) assert.doesNotThrow(() => encode({ ...valid, expectedSequence: good }));
  assert.throws(() => encode(valid, 'a55a'), /PRIVATE_PROOF_REQUIRES_BYTES/);
  assert.throws(() => encode(valid, GOOD_PROOF, {}), /PRIVATE_PUBLIC_INPUT_ARRAY/);
  assert.throws(() => encode(valid, GOOD_PROOF, [1n << 256n]), /PRIVATE_ABI_WORD_RANGE/);
});

async function ownAnvil() {
  const binary = await pinnedBinary(...linuxRuntimePins.anvil);
  const cwd = await scratchDirectory('guarded-reserve-controls-');
  let handle;
  try {
    const port = await unusedLoopbackPort();
    handle = startOwnProcess(binary, ['--host', '127.0.0.1', '--port', String(port), '--chain-id', '31337', '--hardfork', 'cancun', '--timestamp', '1900000200', '--accounts', '5', '--balance', '10', '--mnemonic-random', '12', '--no-cors'], cwd);
    const evm = (method, params = []) => ownedRuntimeRpc(`http://127.0.0.1:${port}`, method, params, { timeoutMs: 15000 });
    let ready = false;
    for (let i = 0; i < 100; i++) {
      handle.assertAlive();
      try { ready = await evm('eth_chainId') === '0x7a69'; if (ready) break; } catch {}
      await sleep(50);
    }
    assert.ok(ready, 'OWNED_GUARDED_CONTROL_ANVIL_READY');
    return { evm, accounts: await evm('eth_accounts'), metadata: { classification: 'OWNED_LOCAL_RUNTIMES_ONLY', freshSyntheticWallets: true, chainId: '31337', evmGenesis: (await evm('eth_getBlockByNumber', ['0x0', false])).hash }, close: async () => { await stopOwnProcess(handle); await removeOwnScratch(cwd); } };
  } catch (error) { if (handle) await stopOwnProcess(handle); await removeOwnScratch(cwd); throw error; }
}

let unavailable = process.platform !== 'linux' || process.arch !== 'x64' ? 'requires reviewed Linux x64 binaries' : null;
if (!unavailable) {
  try { for (const pin of [linuxRuntimePins.anvil, linuxRuntimePins.solc]) await access(join(projectRoot, '.local/linux-runtimes', pin[0])); }
  catch (error) { if (error.code !== 'ENOENT') throw error; unavailable = 'pinned official local Anvil/solc unavailable; no EVM control coverage claimed'; }
}

test(`${CLASSIFICATION}: atomic guarded funding`, { skip: unavailable ?? false, timeout: 180000 }, async t => {
  const runtime = await ownAnvil();
  try {
    const pool = await deployPrivateAssemblyNativePool(runtime, {
      sources: Object.fromEntries(PRIVATE_VERIFIER_MODES.map(mode => [mode, MOCK])),
      policy: hash('policy'), deploymentDomain: hash('deployment'), solAuthority: runtime.accounts[1], btcAuthority: runtime.accounts[2],
    });
    assert.match(pool.selectors['reserveGuarded(bytes,bytes32[],bytes32,uint64,bytes32)'], /^[0-9a-f]{8}$/);
    const balance = account => runtime.evm('eth_getBalance', [account, 'latest']).then(BigInt);
    const base = async () => ({ scope: pool.scope, policy: pool.policy, epoch: BigInt((await runtime.evm('eth_getBlockByNumber', ['latest', false])).timestamp) / 600n });
    const encode = async (mode, fields) => encodePrivatePoolInputs(mode, { ...await base(), ...fields });
    const candidate = async (label, overrides = {}) => {
      const snapshot = await pool.snapshot();
      const fields = { amount: 1000n, output: hash(`${label} output`), admissionTag: hash(`${label} admission`), ...overrides };
      const tree = new PrivateNoteTree(snapshot.leaves.slice(0, snapshot.leafCount));
      tree.append(fields.output);
      return { ...fields, inputs: await encode('reserve', fields), guards: { expectedRoot: snapshot.root, expectedSequence: snapshot.stateSequence, expectedPostRoot: tree.root } };
    };
    const send = (label, data, value, expectedStatus = '0x1', reason, from = runtime.accounts[0]) => pool.send(label, { to: pool.address, from, data, ...(value === undefined ? {} : { value }) }, expectedStatus, reason);
    const deposit = c => send('synthetic guarded deposit', pool.guardedReserveData(GOOD_PROOF, c.inputs, c.guards), c.amount);
    const state = async c => ({
      // All canonical counters, digests, bounded arrays and tree internals.
      calls: await Promise.all(['canonicalState()', 'canonicalEffects()', 'canonicalRootHistory()', 'canonicalRevocations()', 'treeNodes()', 'noteLeaves()', 'spentList()', 'solEffectList()', 'btcEffectList()'].map(method => pool.call(method))),
      // The exact potentially changed mapping keys and both base/projected roots.
      maps: await Promise.all([
        pool.call('admissions(bytes32)', [c.admissionTag]), pool.call('insertedCommitments(bytes32)', [c.output]),
        ...[c.guards.expectedRoot, c.guards.expectedPostRoot, ZERO_NOTE_HASH].map(root => pool.call('acceptedRoots(bytes32)', [root])),
        pool.call('spentNullifiers(bytes32)', [c.output]), pool.call('spentSolEffects(bytes32)', [c.output]), pool.call('spentBtcEffects(bytes32)', [c.output]),
        pool.call('authorityVersion(uint8)', [1]), pool.call('authorityVersion(uint8)', [2]),
      ]),
      balance: await balance(pool.address),
    });
    const reject = async (label, c, reason, { proof = GOOD_PROOF, value = c.amount, inputs = c.inputs, guards = c.guards } = {}) => {
      const before = await state(c), senderBefore = await balance(runtime.accounts[0]);
      const receipt = await send(label, pool.guardedReserveData(proof, inputs, guards), value, '0x0', reason);
      assert.deepEqual(await state(c), before, `${label}: complete observable pool rollback`);
      assert.deepEqual(receipt.logs, [], `${label}: reverted events`);
      assert.equal(senderBefore - await balance(runtime.accounts[0]), BigInt(receipt.gasUsed) * BigInt(receipt.effectiveGasPrice), `${label}: only gas debited, all ETH principal reverted`);
    };
    const check = async (name, fn) => t.test(name, async () => {
      const id = await runtime.evm('evm_snapshot');
      try { await fn(); } finally { assert.equal(await runtime.evm('evm_revert', [id]), true); }
    });

    await check('empty-tree projection is accepted only after an exact successful deposit', async () => {
      const c = await candidate('empty'), before = await pool.snapshot(), beforeBalance = await balance(pool.address);
      assert.equal(BigInt(await pool.call('acceptedRoots(bytes32)', [c.guards.expectedPostRoot])), 0n);
      assert.equal(before.leafCount, 0);
      const receipt = await deposit(c), after = await pool.snapshot();
      assert.equal(after.root, c.guards.expectedPostRoot);
      assert.equal(after.stateSequence, (BigInt(before.stateSequence) + 1n).toString());
      assert.equal(after.leafCount, 1); assert.equal(after.liveReservations, 1); assert.equal(after.spentCount, 0);
      assert.equal(after.rootHistoryCount, 2);
      assert.deepEqual(after.rootHistory.slice(0, 2), [before.root, after.root]);
      assert.equal(await balance(pool.address) - beforeBalance, c.amount);
      assert.equal(BigInt(await pool.call('admissions(bytes32)', [c.admissionTag])), 1n);
      assert.equal(BigInt(await pool.call('insertedCommitments(bytes32)', [c.output])), 1n);
      assert.equal(BigInt(await pool.call('acceptedRoots(bytes32)', [c.guards.expectedPostRoot])), 1n);
      assert.equal(receipt.logs.length, 1);
    });
    await check('nonempty-tree projection preserves older accepted roots and adds only the exact final root', async () => {
      const first = await candidate('first'); await deposit(first);
      const second = await candidate('second'), before = await pool.snapshot(); await deposit(second);
      const after = await pool.snapshot();
      assert.equal(after.root, new PrivateNoteTree([first.output, second.output]).root);
      assert.equal(after.root, second.guards.expectedPostRoot);
      assert.equal(after.rootHistoryCount, before.rootHistoryCount + 1);
      assert.deepEqual(after.rootHistory.slice(0, before.rootHistoryCount), before.rootHistory.slice(0, before.rootHistoryCount));
      assert.equal(BigInt(await pool.call('acceptedRoots(bytes32)', [first.guards.expectedPostRoot])), 1n);
    });
    await check('front-running append invalidates the prepared root and returns all candidate ETH', async () => {
      const c = await candidate('stale victim');
      const competitor = await candidate('competing deposit'); await deposit(competitor);
      await reject('stale projection', c, 'RESERVE_ROOT_CHANGED');
      assert.equal(BigInt(await pool.call('acceptedRoots(bytes32)', [c.guards.expectedPostRoot])), 0n);
      const refreshed = await candidate('stale victim'); await deposit(refreshed);
    });
    await check('same-root adverse fact changes sequence and invalidates old authorization guards', async () => {
      const c = await candidate('adverse');
      await send('synthetic authorized adverse fact', pool.data('recordAdverse(uint8,bytes32,bytes32)', [1, hash('revoked effect'), hash('adverse evidence')]), undefined, '0x1', undefined, runtime.accounts[1]);
      assert.equal(await pool.call('currentRoot()'), c.guards.expectedRoot);
      assert.equal(BigInt(await pool.call('stateSequence()')), BigInt(c.guards.expectedSequence) + 1n);
      await reject('same-root sequence change', c, 'RESERVE_SEQUENCE_CHANGED');
    });
    await check('same-root spent-only withdrawal also invalidates the prepared sequence', async () => {
      const first = await candidate('withdraw first'); await deposit(first);
      const refund = await encode('refund', { root: await pool.call('currentRoot()'), nullifier: hash('refund nullifier'), outputRecovery: hash('recovery output') });
      await send('synthetic refund', pool.proofData('refund', GOOD_PROOF, refund));
      const c = await candidate('withdraw stale'), before = await pool.snapshot();
      const withdrawal = await encode('withdraw', { root: before.root, nullifier: hash('withdraw nullifier'), amount: 1000n, recipient: runtime.accounts[4] });
      await send('synthetic withdrawal', pool.proofData('withdraw', GOOD_PROOF, withdrawal));
      assert.equal(await pool.call('currentRoot()'), before.root);
      assert.equal(BigInt(await pool.call('stateSequence()')), BigInt(before.stateSequence) + 1n);
      await reject('withdrawal sequence change', c, 'RESERVE_SEQUENCE_CHANGED');
    });
    await check('wrong post-root rolls back admission, append, balance, every counter/history and all events', async () => {
      const c = await candidate('wrong post');
      for (const wrong of [ZERO_NOTE_HASH, c.guards.expectedRoot, hash('unrelated post')]) {
        await reject('post-append root mismatch', c, 'RESERVE_POST_ROOT_MISMATCH', { guards: { ...c.guards, expectedPostRoot: wrong } });
        assert.equal(BigInt(await pool.call('acceptedRoots(bytes32)', [wrong])), wrong === c.guards.expectedRoot ? 1n : 0n);
      }
      // The same proof/tag/output remains usable: reverted writes and the lock
      // cannot strand funds or prevent a correctly guarded retry.
      await deposit(c);
    });
    await check('wrong post-root on nonempty tree fully rolls back without changing accepted-root semantics', async () => {
      await deposit(await candidate('nonempty base'));
      const c = await candidate('nonempty mismatch');
      await reject('nonempty mismatch', c, 'RESERVE_POST_ROOT_MISMATCH', { guards: { ...c.guards, expectedPostRoot: hash('wrong nonempty') } });
      await deposit(c);
    });
    await check('exact positive msg.value equality remains mandatory', async () => {
      const c = await candidate('value');
      for (const value of [0n, c.amount - 1n, c.amount + 1n]) await reject('wrong deposit value', c, 'DEPOSIT_AMOUNT', { value });
      const zero = await candidate('zero', { amount: 0n }); await reject('zero deposit', zero, 'DEPOSIT_AMOUNT');
      await deposit(c);
    });
    await check('malformed synthetic proof, input length, domain, epoch and integer width reject before admission', async () => {
      const c = await candidate('malformed');
      for (const proof of [Buffer.alloc(0), Buffer.from([0xa5]), Buffer.from([0xa5, 0x5b]), Buffer.from([0xa5, 0x5a, 0])]) await reject('synthetic verifier rejection', c, 'RESERVE_PROOF', { proof });
      for (const inputs of [c.inputs.slice(0, -1), [...c.inputs, '0']]) await reject('malformed inputs', c, 'PUBLIC_INPUT_LENGTH', { inputs });
      for (const [index, replacement, reason] of [[0, '0', 'PUBLIC_DOMAIN'], [16, '0', 'STALE_EPOCH'], [17, (1n << 64n).toString(), 'PUBLIC_U64'], [18, (1n << 32n).toString(), 'PUBLIC_U32']]) {
        const inputs = [...c.inputs]; inputs[index] = replacement;
        await reject('malformed statement word', c, reason, { inputs });
      }
      await deposit(c);
    });
    await check('replay remains rejected with both old guards and refreshed guards', async () => {
      const c = await candidate('replay'); await deposit(c);
      await reject('exact transaction replay', c, 'RESERVE_ROOT_CHANGED');
      const current = await pool.snapshot(), guards = { ...c.guards, expectedRoot: current.root, expectedSequence: current.stateSequence };
      await reject('fresh guards cannot readmit origin', c, 'ORIGIN_ALREADY_ADMITTED', { guards });
      const changedTag = [...c.inputs]; changedTag.splice(26, 8, ...encodePrivatePoolInputs('reserve', { ...await base(), amount: c.amount, output: c.output, admissionTag: hash('fresh duplicate tag') }).slice(26));
      await reject('fresh tag cannot duplicate output', c, 'OUTPUT_ALREADY_INSERTED', { guards, inputs: changedTag });
    });
    await check('zero admission and zero commitment remain invalid under valid base guards', async () => {
      const c = await candidate('zero bindings');
      for (const [offset, reason] of [[26, 'ORIGIN_ALREADY_ADMITTED'], [18, 'OUTPUT_ALREADY_INSERTED']]) {
        const inputs = [...c.inputs]; inputs.fill('0', offset, offset + 8);
        await reject('zero binding', c, reason, { inputs });
      }
    });
    await check('guarded funding retains terminal leaf and future consumption headroom', async () => {
      for (let i = 0; i < 21; i++) await deposit(await candidate(`capacity ${i}`));
      const before = await pool.snapshot();
      assert.equal(before.leafCount, 21); assert.equal(before.liveReservations, 21); assert.equal(before.spentCount, 0);
      await reject('headroom exhausted', await candidate('capacity overrun'), 'TREE_HEADROOM');
    });
    t.diagnostic(JSON.stringify({ classification: CLASSIFICATION, sources: pool.compilation.sources, runtimePins: { anvil: linuxRuntimePins.anvil, solc: linuxRuntimePins.solc }, deployedPoolBytes: pool.deployments.find(item => item.role === 'funded-note-pool').deployedCodeBytes, receipts: pool.receipts.length }));
  } finally { await runtime.close(); }
});
