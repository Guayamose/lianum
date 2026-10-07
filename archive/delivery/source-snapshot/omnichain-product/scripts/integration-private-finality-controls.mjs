/** CONTROL_FLOW_ONLY_NOT_PROOF_SECURITY
 * Owned loopback Anvil + official pinned solc; the production pool is unmodified.
 * Accepting/rejecting MOCK verifiers deliberately establish NO proof soundness,
 * witness authorization, native-chain validity, membership or confidentiality.
 * Independent cases use evm_snapshot/revert, so retained receipts describe
 * observed disposable branches, not a single surviving canonical transcript.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { linuxRuntimePins } from '../src/chains/linux-runtime-pins.mjs';
import { pinnedBinary, scratchDirectory, removeOwnScratch, unusedLoopbackPort, startOwnProcess, stopOwnProcess, ownedRuntimeRpc, sleep, projectRoot } from '../src/chains/runtime-harness.mjs';
import { deployPrivateCurrentNativePool, PRIVATE_VERIFIER_MODES, decodePrivateRevert } from '../src/private-finality-runtime.mjs';
import { encodePrivatePoolInputs, noteHashToWords } from '../src/private-note-tree.mjs';

export const CLASSIFICATION = 'CONTROL_FLOW_ONLY_NOT_PROOF_SECURITY';
const sha = bytes => `0x${createHash('sha256').update(bytes).digest('hex')}`;
const hash = label => sha(Buffer.from(`PC16 MOCK CONTROL ${label}`));
const word = value => BigInt(value).toString(16).padStart(64, '0');
const hex = value => `0x${BigInt(value).toString(16)}`;
const ZERO = `0x${'00'.repeat(32)}`;
const MOCK = `// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;
// CONTROL_FLOW_ONLY_NOT_PROOF_SECURITY. Not a cryptographic verifier.
contract HonkVerifier {
    function verify(bytes calldata proof, bytes32[] calldata) external view returns (bool) {
        return proof.length == 0 || proof[0] != 0xff;
    }
}
contract RevertingRecipient {
    receive() external payable { revert("RECIPIENT_REJECTED"); }
}
contract ReentrantRecipient {
    address public immutable target;
    bytes private payload;
    bool private propagate;
    uint256 public callbacks;
    bool public blocked;
    constructor(address target_) { target = target_; }
    function arm(bytes calldata data, bool propagate_) external { payload = data; propagate = propagate_; }
    receive() external payable {
        callbacks++;
        (bool ok, bytes memory reason) = target.call(payload);
        require(!ok, "REENTRANCY_UNEXPECTED_SUCCESS");
        require(keccak256(reason) == keccak256(abi.encodeWithSignature("Error(string)", "REENTRANCY")), "WRONG_INNER_REVERT");
        blocked = true;
        if (propagate) { assembly { revert(add(reason, 32), mload(reason)) } }
    }
}`;

/** Never accepts an endpoint, credential, executable, or remote runtime. */
async function ownAnvil() {
  const binary = await pinnedBinary(...linuxRuntimePins.anvil);
  const cwd = await scratchDirectory('m16-controls-');
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
    assert.ok(ready, 'OWNED_CONTROL_ANVIL_READY');
    return { evm, accounts: await evm('eth_accounts'), metadata: { classification: 'OWNED_LOCAL_RUNTIMES_ONLY', freshSyntheticWallets: true, chainId: '31337', evmGenesis: (await evm('eth_getBlockByNumber', ['0x0', false])).hash }, close: async () => { await stopOwnProcess(handle); await removeOwnScratch(cwd); } };
  } catch (error) { if (handle) await stopOwnProcess(handle); await removeOwnScratch(cwd); throw error; }
}

export async function runPrivateFinalityControls({ runCase = async (_name, fn) => fn() } = {}) {
  const record = { classification: CLASSIFICATION, startedAt: new Date().toISOString(), status: 'RUNNING', runtimePins: { anvil: linuxRuntimePins.anvil, solc: linuxRuntimePins.solc }, snapshotsRevertedBetweenControls: true, limits: ['Mock verifiers do not verify proofs', 'No native SOL/BTC runtime or consensus evidence', 'Fictitious local ETH only; fresh synthetic accounts', 'Claim-before-adverse inclusion and post-claim reorg exposure remain: late authority updates do not roll back claims or transferred ETH', 'Reverted local branches are independently validated, not a surviving canonical transcript'], cases: [], deployments: [], receipts: [] };
  const runtime = await ownAnvil();
  let pool;
  try {
    pool = await deployPrivateCurrentNativePool(runtime, { sources: Object.fromEntries(PRIVATE_VERIFIER_MODES.map(mode => [mode, MOCK])), policy: hash('policy'), deploymentDomain: hash('deployment'), solAuthority: runtime.accounts[1], btcAuthority: runtime.accounts[2] });
    record.deployments = pool.deployments;
    record.sources = pool.compilation.sources;
    record.compilerSettings = pool.compilation.settings;
    const [owner, sol, btc, stranger] = runtime.accounts;
    const now = async () => BigInt((await runtime.evm('eth_getBlockByNumber', ['latest', false])).timestamp);
    const mineAt = async timestamp => { await runtime.evm('evm_setNextBlockTimestamp', [Number(timestamp)]); await runtime.evm('evm_mine'); assert.equal(await now(), BigInt(timestamp)); };
    const base = async () => ({ scope: pool.scope, policy: pool.policy, epoch: (await now()) / 600n });
    const encode = async (mode, fields) => encodePrivatePoolInputs(mode, { ...await base(), ...fields });
    const state = async () => ({ canonicalState: await pool.call('canonicalState()'), canonicalEffects: await pool.call('canonicalEffects()'), balance: await runtime.evm('eth_getBalance', [pool.address, 'latest']) });
    const send = (label, data, from = owner, expectedStatus = '0x1', reason, to = pool.address, value) => pool.send(label, { from, to, data, ...(value === undefined ? {} : { value }) }, expectedStatus, reason);
    const revert = async (label, data, reason, from = owner, to = pool.address) => {
      const before = await state();
      const receipt = await send(label, data, from, '0x0', reason, to);
      assert.deepEqual(await state(), before, `${label}: complete pool-state rollback`);
      assert.deepEqual(receipt.logs, [], `${label}: reverted logs`);
      return receipt;
    };
    const proof = (mode, inputs, bytes = Buffer.alloc(0)) => pool.proofData(mode, bytes, inputs);
    const statement = inputs => sha(Buffer.from(`17${inputs.map(word).join('')}`, 'hex'));
    const terminalCall = inputs => runtime.evm('eth_call', [{ to: pool.address, data: `0x${pool.selectors['terminalStatement(bytes32[])']}${word(32)}${word(inputs.length)}${inputs.map(word).join('')}` }, 'latest']);
    const permitData = (chain, effect, stmt, version, observedAt, validUntil) => pool.data('recordPermit(uint8,bytes32,bytes32,uint64,uint64,uint64)', [chain, effect, stmt, version, observedAt, validUntil]);
    const adverseData = (chain, effect, evidence = hash('adverse')) => pool.data('recordAdverse(uint8,bytes32,bytes32)', [chain, effect, evidence]);
    const version = chain => pool.call('authorityVersion(uint8)', [chain]).then(BigInt);
    const permit = async (chain, effect, stmt, options = {}) => {
      const observedAt = options.observedAt ?? await now();
      return send(`record role ${chain} current permit`, permitData(chain, effect, stmt, options.version ?? await version(chain), observedAt, options.validUntil ?? observedAt + 30n), chain === 1 ? sol : btc);
    };
    const fixture = async (label = 'fixture') => {
      const originalRoot = await pool.call('currentRoot()');
      const fields = { root: null, nullifier: hash(`${label} nullifier`), effectSol: hash(`${label} sol`), effectBtc: hash(`${label} btc`), outputSol: hash(`${label} output sol`), outputBtc: hash(`${label} output btc`) };
      await send('mock reserve deposit', proof('reserve', await encode('reserve', { amount: 1000n, output: hash(`${label} reserved`), admissionTag: hash(`${label} admission`) })), owner, '0x1', undefined, pool.address, 1000n);
      fields.root = await pool.call('currentRoot()');
      return { fields, inputs: await encode('fulfill', fields), originalRoot };
    };
    const permitBoth = async f => { const stmt = statement(f.inputs); await permit(1, f.fields.effectSol, stmt); await permit(2, f.fields.effectBtc, stmt); };
    const isolated = async fn => { const snapshot = await runtime.evm('evm_snapshot'); try { return await fn(); } finally { assert.equal(await runtime.evm('evm_revert', [snapshot]), true); } };
    const check = async (name, fn) => runCase(`${CLASSIFICATION}: ${name}`, async () => {
      const firstReceipt = pool.receipts.length;
      const start = performance.now();
      try { await isolated(fn); record.cases.push({ name, passed: true, firstReceipt, receiptCount: pool.receipts.length - firstReceipt, milliseconds: performance.now() - start }); }
      catch (error) { record.cases.push({ name, passed: false, error: error.message, firstReceipt, receiptCount: pool.receipts.length - firstReceipt }); throw error; }
    });

    await check('canonical full-width permit key includes profile, chain ID, pool, scope, policy, typed effect, statement and version', async () => {
      const f = await fixture();
      assert.equal(await terminalCall(f.inputs), statement(f.inputs));
      const profile = sha(Buffer.from('PC16_CURRENT_OBSERVATION_AUTHORITY_V1'));
      assert.equal(await pool.call('FINALITY_PROFILE()'), profile);
      const frame = { profile, chainId: 31337n, address: pool.address, scope: pool.scope, policy: pool.policy, chain: 1n, effect: f.fields.effectSol, statement: statement(f.inputs), version: 1n };
      const key = v => sha(Buffer.from(`16${v.profile.slice(2)}${word(v.chainId)}${v.address.slice(2)}${v.scope.slice(2)}${v.policy.slice(2)}${v.chain.toString(16).padStart(2, '0')}${v.effect.slice(2)}${v.statement.slice(2)}${v.version.toString(16).padStart(16, '0')}`, 'hex'));
      assert.equal(await pool.call('permitKey(uint8,bytes32,bytes32,uint64)', [frame.chain, frame.effect, frame.statement, frame.version]), key(frame));
      for (const [field, changed] of Object.entries({ profile: hash('other profile'), chainId: (1n << 200n) + 31337n, address: stranger, scope: hash('other scope'), policy: hash('other policy'), chain: 2n, effect: hash('other effect'), statement: hash('other statement'), version: 2n })) assert.notEqual(key({ ...frame, [field]: changed }), key(frame), field);
      assert.equal(BigInt(await pool.call('authorityVersion(uint8)', [1])), 1n);
      assert.equal(BigInt(await pool.call('authorityVersion(uint8)', [2])), 1n);
    });

    await check('each of all 65 public words is bound and cannot inherit the original permits', async () => {
      const f = await fixture(); await permitBoth(f);
      for (let i = 0; i < 65; i++) await isolated(async () => {
        const mutated = f.inputs.slice(); mutated[i] = (BigInt(mutated[i]) + 1n).toString();
        assert.notEqual(await terminalCall(mutated), statement(f.inputs), `terminal word ${i}`);
        const reason = i < 16 ? 'PUBLIC_DOMAIN' : i === 16 ? 'STALE_EPOCH' : i < 25 ? 'UNKNOWN_ROOT' : 'FINALITY_NOT_CURRENT';
        await revert(`terminal public word ${i} rejected`, proof('fulfill', mutated), reason);
      });
      const shorter = f.inputs.slice(0, -1), longer = [...f.inputs, '0'];
      await revert('short terminal statement', proof('fulfill', shorter), 'PUBLIC_INPUT_LENGTH');
      await revert('long terminal statement', proof('fulfill', longer), 'PUBLIC_INPUT_LENGTH');
      const rootChanged = f.inputs.slice(); rootChanged.splice(17, 8, ...noteHashToWords(f.originalRoot));
      assert.equal(BigInt(await pool.call('acceptedRoots(bytes32)', [f.originalRoot])), 1n);
      await revert('another accepted root still requires fresh exact-statement permits', proof('fulfill', rootChanged), 'FINALITY_NOT_CURRENT');
      await send('unmodified terminal statement accepted', proof('fulfill', f.inputs));
    });

    await check('wrong authority, crossed roles, invalid chain and zero binding are rejected', async () => {
      const f = await fixture(), stmt = statement(f.inputs), time = await now();
      for (const [chain, effect, right, wrong] of [[1, f.fields.effectSol, sol, btc], [2, f.fields.effectBtc, btc, sol]]) {
        for (const sender of [owner, wrong, stranger]) {
          await revert(`wrong sender cannot permit role ${chain}`, permitData(chain, effect, stmt, 1, time, time + 30n), 'FINALITY_AUTHORITY', sender);
          await revert(`wrong sender cannot revoke role ${chain}`, adverseData(chain, effect), 'FINALITY_AUTHORITY', sender);
        }
        await revert('zero permit effect', permitData(chain, ZERO, stmt, 1, time, time + 30n), 'FINALITY_ZERO_BINDING', right);
        await revert('zero permit statement', permitData(chain, effect, ZERO, 1, time, time + 30n), 'FINALITY_ZERO_BINDING', right);
        await revert('zero adverse evidence', adverseData(chain, effect, ZERO), 'FINALITY_ZERO_BINDING', right);
      }
      for (const chain of [0, 3, 255]) {
        await revert('unsupported permit chain', permitData(chain, f.fields.effectSol, stmt, 1, time, time + 30n), 'FINALITY_CHAIN', sol);
        await revert('unsupported adverse chain', adverseData(chain, f.fields.effectSol), 'FINALITY_CHAIN', sol);
      }
      await permitBoth(f); await send('authorized authorities permit fulfillment', proof('fulfill', f.inputs));
    });

    await check('one missing role or swapped typed effects cannot authorize fulfillment', async () => {
      const f = await fixture(), stmt = statement(f.inputs);
      await revert('both permits absent', proof('fulfill', f.inputs), 'FINALITY_NOT_CURRENT');
      await isolated(async () => { await permit(1, f.fields.effectSol, stmt); await revert('BTC permit absent', proof('fulfill', f.inputs), 'FINALITY_NOT_CURRENT'); });
      await isolated(async () => { await permit(2, f.fields.effectBtc, stmt); await revert('SOL permit absent', proof('fulfill', f.inputs), 'FINALITY_NOT_CURRENT'); });
      await permit(1, f.fields.effectBtc, stmt); await permit(2, f.fields.effectSol, stmt);
      await revert('typed effects crossed', proof('fulfill', f.inputs), 'FINALITY_NOT_CURRENT');
    });

    await check('a different pool and deployment domain cannot lend permits', async () => {
      const f = await fixture(), stmt = statement(f.inputs), source = pool.compilation.sourceNames.pool;
      const artifact = pool.compilation.output.contracts[source].PrivateCurrentNativeNotePool;
      const ctor = [hash('other deployment domain'), pool.policy, ...['reserve', 'fulfill', 'refund', 'withdraw'].map(mode => pool.verifiers[mode].address), sol, btc];
      const receipt = await pool.send('deploy independent control pool', { data: `0x${artifact.evm.bytecode.object}${ctor.map(word).join('')}` });
      const other = receipt.contractAddress;
      const otherScope = await runtime.evm('eth_call', [{ to: other, data: pool.data('scope()') }, 'latest']);
      assert.notEqual(otherScope, pool.scope);
      const time = await now();
      for (const [chain, effect, sender] of [[1, f.fields.effectSol, sol], [2, f.fields.effectBtc, btc]]) {
        await send('permit recorded only on other pool', permitData(chain, effect, stmt, 1, time, time + 30n), sender, '0x1', undefined, other);
        const data = pool.data('permitKey(uint8,bytes32,bytes32,uint64)', [chain, effect, stmt, 1]);
        const otherKey = await runtime.evm('eth_call', [{ to: other, data }, 'latest']);
        assert.notEqual(otherKey, await pool.call('permitKey(uint8,bytes32,bytes32,uint64)', [chain, effect, stmt, 1]));
      }
      await revert('other-pool permits do not authorize original pool', proof('fulfill', f.inputs), 'FINALITY_NOT_CURRENT');
    });

    await check('lease creation rejects future observations, expiry, inverted and overlong intervals', async () => {
      const f = await fixture(), stmt = statement(f.inputs), time = await now();
      for (const [label, observedAt, validUntil] of [['future', time + 100n, time + 110n], ['at expiry', time - 10n, time], ['expired', time - 20n, time - 1n], ['zero duration', time, time], ['inverted', time, time - 1n], ['31 seconds', time, time + 31n]]) await revert(label, permitData(1, f.fields.effectSol, stmt, 1, observedAt, validUntil), 'FINALITY_LEASE', sol);
      await permit(1, f.fields.effectSol, stmt, { observedAt: time, validUntil: time + 30n });
      const key = await pool.call('permitKey(uint8,bytes32,bytes32,uint64)', [1, f.fields.effectSol, stmt, 1]);
      assert.equal(await pool.call('finalityPermits(bytes32)', [key]), `0x${word(time)}${word(time + 30n)}`);
    });

    await check('permit replay is rejected, strictly newer observation may refresh the same binding', async () => {
      const f = await fixture(), stmt = statement(f.inputs), time = await now();
      await permit(1, f.fields.effectSol, stmt, { observedAt: time, validUntil: time + 20n });
      await revert('identical permit replay', permitData(1, f.fields.effectSol, stmt, 1, time, time + 20n), 'FINALITY_PERMIT_REPLAY', sol);
      await revert('same observation cannot extend permit', permitData(1, f.fields.effectSol, stmt, 1, time, time + 30n), 'FINALITY_PERMIT_REPLAY', sol);
      await revert('older observation cannot replace permit', permitData(1, f.fields.effectSol, stmt, 1, time - 1n, time + 20n), 'FINALITY_PERMIT_REPLAY', sol);
      await mineAt(time + 2n);
      await permit(1, f.fields.effectSol, stmt, { observedAt: time + 2n, validUntil: time + 32n });
      const key = await pool.call('permitKey(uint8,bytes32,bytes32,uint64)', [1, f.fields.effectSol, stmt, 1]);
      assert.equal(await pool.call('finalityPermits(bytes32)', [key]), `0x${word(time + 2n)}${word(time + 32n)}`);
    });

    await check('fulfillment succeeds one second before expiry and fails exactly at expiry', async () => {
      const f = await fixture(), time = await now(), stmt = statement(f.inputs), expiry = time + 20n;
      for (const [chain, effect] of [[1, f.fields.effectSol], [2, f.fields.effectBtc]]) await permit(chain, effect, stmt, { observedAt: time, validUntil: expiry });
      await isolated(async () => { await runtime.evm('evm_setNextBlockTimestamp', [Number(expiry - 1n)]); const receipt = await send('one second before expiry', proof('fulfill', f.inputs)); assert.equal(BigInt((await runtime.evm('eth_getBlockByNumber', [receipt.blockNumber, false])).timestamp), expiry - 1n); });
      await runtime.evm('evm_setNextBlockTimestamp', [Number(expiry)]);
      const receipt = await revert('exact permit expiry boundary', proof('fulfill', f.inputs), 'FINALITY_NOT_CURRENT');
      assert.equal(BigInt((await runtime.evm('eth_getBlockByNumber', [receipt.blockNumber, false])).timestamp), expiry);
    });

    await check('a lease crossing an epoch cannot authorize a changed epoch statement', async () => {
      const end = ((await now()) / 600n + 1n) * 600n;
      await mineAt(end - 5n);
      const f = await fixture(); await permitBoth(f);
      await mineAt(end);
      await revert('old epoch rejected even with live permits', proof('fulfill', f.inputs), 'STALE_EPOCH');
      const changed = f.inputs.slice(); changed[16] = (end / 600n).toString();
      await revert('new epoch cannot reuse older statement permits', proof('fulfill', changed), 'FINALITY_NOT_CURRENT');
    });

    await check('adverse fact advances only that role, invalidates unrelated old permits, and permits fresh reobservation', async () => {
      const f = await fixture(), stmt = statement(f.inputs), unrelated = hash('unrelated adverse'); await permitBoth(f);
      await send('unrelated SOL effect revoked', adverseData(1, unrelated), sol);
      assert.equal(await version(1), 2n); assert.equal(await version(2), 1n);
      assert.equal(BigInt(await pool.call('revokedEffects(uint8,bytes32)', [1, unrelated])), 1n);
      await revert('old chain-wide version cannot authorize fulfill', proof('fulfill', f.inputs), 'FINALITY_NOT_CURRENT');
      const time = await now();
      await revert('stale permit version rejected', permitData(1, f.fields.effectSol, stmt, 1, time, time + 30n), 'FINALITY_VERSION', sol);
      await revert('future permit version rejected', permitData(1, f.fields.effectSol, stmt, 3, time, time + 30n), 'FINALITY_VERSION', sol);
      await permit(1, f.fields.effectSol, stmt, { version: 2n });
      await send('fresh unaffected-effect reobservation restores eligibility', proof('fulfill', f.inputs));
    });

    for (const chain of [1, 2]) await check(`role ${chain} adverse effect is permanently revoked across future versions`, async () => {
      const f = await fixture(), effect = chain === 1 ? f.fields.effectSol : f.fields.effectBtc, sender = chain === 1 ? sol : btc; await permitBoth(f);
      await send('revoke terminal effect', adverseData(chain, effect), sender);
      await revert('revoked effect cannot fulfill', proof('fulfill', f.inputs), 'FINALITY_REVOKED');
      const time = await now(), stmt = statement(f.inputs);
      await revert('revoked effect cannot receive new-version permit', permitData(chain, effect, stmt, 2, time, time + 30n), 'FINALITY_REVOKED', sender);
      const beforeDuplicate = await state();
      const duplicate = await send('repeated adverse fact is idempotent', adverseData(chain, effect), sender);
      assert.deepEqual(await state(), beforeDuplicate);
      assert.deepEqual(duplicate.logs, []);
      assert.equal(await version(chain), 2n);
      await send('another adverse fact advances version again', adverseData(chain, hash(`another adverse ${chain}`)), sender);
      assert.equal(await version(chain), 3n);
      await revert('no later version can reinstate revoked effect', permitData(chain, effect, stmt, 3, time, time + 30n), 'FINALITY_REVOKED', sender);
      assert.equal(BigInt(await pool.call('revokedEffects(uint8,bytes32)', [chain, effect])), 1n);
      assert.equal(BigInt(await pool.call('revokedEffects(uint8,bytes32)', [3 - chain, effect])), 0n);
    });

    await check('successful fulfillment consumes its note and both typed native effects exactly once', async () => {
      const f = await fixture(); await permitBoth(f); await send('initial fulfillment', proof('fulfill', f.inputs));
      assert.equal(BigInt(await pool.call('spentNullifiers(bytes32)', [f.fields.nullifier])), 1n);
      assert.equal(BigInt(await pool.call('spentSolEffects(bytes32)', [f.fields.effectSol])), 1n);
      assert.equal(BigInt(await pool.call('spentBtcEffects(bytes32)', [f.fields.effectBtc])), 1n);
      await revert('fulfillment replay', proof('fulfill', f.inputs), 'NOTE_ALREADY_SPENT');
      const g = await fixture('second reservation');
      await revert('same SOL effect with fresh reservation', proof('fulfill', await encode('fulfill', { ...g.fields, effectSol: f.fields.effectSol })), 'SOL_EFFECT_SPENT');
      await revert('same BTC effect with fresh reservation', proof('fulfill', await encode('fulfill', { ...g.fields, effectBtc: f.fields.effectBtc })), 'BTC_EFFECT_SPENT');
    });

    for (const first of ['fulfill', 'refund']) await check(`${first} excludes the opposite terminal mode via the same reserve nullifier`, async () => {
      const f = await fixture(); await permitBoth(f);
      const refund = await encode('refund', { root: f.fields.root, nullifier: f.fields.nullifier, outputRecovery: hash('recovery output') });
      await send(`first terminal mode ${first}`, proof(first, first === 'fulfill' ? f.inputs : refund));
      const second = first === 'fulfill' ? 'refund' : 'fulfill';
      await revert(`opposite mode ${second} after ${first}`, proof(second, second === 'fulfill' ? f.inputs : refund), 'NOTE_ALREADY_SPENT');
    });

    await check('mock verifier false response rejects fulfillment without consuming notes, effects or permits', async () => {
      const f = await fixture(); await permitBoth(f);
      await revert('mock proof explicitly false', proof('fulfill', f.inputs, Buffer.from([255])), 'FULFILL_PROOF');
      await send('same permits remain unconsumed after verifier rejection', proof('fulfill', f.inputs));
    });

    const deployRecipient = async (name, args = []) => {
      const artifact = pool.compilation.output.contracts[pool.compilation.sourceNames.reserve][name];
      const receipt = await pool.send(`deploy mock recipient ${name}`, { data: `0x${artifact.evm.bytecode.object}${args.map(word).join('')}` });
      return { address: receipt.contractAddress, selectors: artifact.evm.methodIdentifiers };
    };
    const outputFixture = async recipient => { const f = await fixture(); await permitBoth(f); await send('create withdrawable mock output', proof('fulfill', f.inputs)); return { inputs: await encode('withdraw', { root: await pool.call('currentRoot()'), nullifier: hash('withdrawal nullifier'), amount: 400n, recipient }), nullifier: hash('withdrawal nullifier') }; };
    const assertUnspentWithdrawal = async f => { assert.equal(BigInt(await pool.call('spentNullifiers(bytes32)', [f.nullifier])), 0n); assert.equal(BigInt(await pool.call('liveOutputNotes()')), 2n); };

    await check('claim-before-adverse exposure: later revocation cannot undo fulfillment or claw back withdrawn ETH', async () => {
      const f = await fixture('claim-before-adverse'); await permitBoth(f);
      await send('fulfillment included before adverse fact', proof('fulfill', f.inputs));
      const recipientBefore = BigInt(await runtime.evm('eth_getBalance', [stranger, 'latest']));
      const firstNullifier = hash('claimed output withdrawn before adverse');
      const firstWithdrawal = await encode('withdraw', { root: await pool.call('currentRoot()'), nullifier: firstNullifier, amount: 400n, recipient: stranger });
      await send('withdraw 400 fictitious wei before adverse update', proof('withdraw', firstWithdrawal));
      const beforeAdverse = await state();
      const recipientAfterWithdrawal = BigInt(await runtime.evm('eth_getBalance', [stranger, 'latest']));
      assert.equal(recipientAfterWithdrawal - recipientBefore, 400n);
      for (const [chain, effect, authority] of [[1, f.fields.effectSol, sol], [2, f.fields.effectBtc, btc]]) {
        await send('post-claim adverse fact has no terminal rollback', adverseData(chain, effect, hash(`post-claim adverse evidence ${chain}`)), authority);
        assert.equal(await version(chain), 2n);
        assert.equal(BigInt(await pool.call('revokedEffects(uint8,bytes32)', [chain, effect])), 1n);
        assert.deepEqual(await state(), beforeAdverse, 'adverse authority update cannot restore note state or pool ETH');
        assert.equal(BigInt(await runtime.evm('eth_getBalance', [stranger, 'latest'])), recipientAfterWithdrawal, 'already transferred ETH cannot be clawed back');
      }
      assert.equal(BigInt(await pool.call('liveReservations()')), 0n);
      assert.equal(BigInt(await pool.call('liveOutputNotes()')), 1n);
      for (const output of [f.fields.outputSol, f.fields.outputBtc]) assert.equal(BigInt(await pool.call('insertedCommitments(bytes32)', [output])), 1n);
      for (const nullifier of [f.fields.nullifier, firstNullifier]) assert.equal(BigInt(await pool.call('spentNullifiers(bytes32)', [nullifier])), 1n);
      await revert('late adverse fact does not reopen refund', proof('refund', await encode('refund', { root: f.fields.root, nullifier: f.fields.nullifier, outputRecovery: hash('late adverse recovery') })), 'NOTE_ALREADY_SPENT');
      const secondWithdrawal = await encode('withdraw', { root: await pool.call('currentRoot()'), nullifier: hash('claimed output withdrawn after adverse'), amount: 600n, recipient: stranger });
      await send('remaining claimed output stays withdrawable after adverse update', proof('withdraw', secondWithdrawal));
      assert.equal(BigInt(await runtime.evm('eth_getBalance', [stranger, 'latest'])) - recipientBefore, 1000n);
      assert.equal(BigInt(await runtime.evm('eth_getBalance', [pool.address, 'latest'])), 0n);
      assert.equal(BigInt(await pool.call('liveReservations()')), 0n);
      assert.equal(BigInt(await pool.call('liveOutputNotes()')), 0n);
    });

    await check('recipient transfer revert rolls back nullifier, digests, counters, sequence, balances and logs', async () => {
      const recipient = await deployRecipient('RevertingRecipient'), f = await outputFixture(recipient.address);
      await revert('rejecting recipient withdrawal', proof('withdraw', f.inputs), 'WITHDRAWAL_FAILED');
      await assertUnspentWithdrawal(f);
      assert.equal(BigInt(await runtime.evm('eth_getBalance', [recipient.address, 'latest'])), 0n);
      const retry = f.inputs.slice(); retry.splice(34, 5, ...Array.from({ length: 5 }, (_, i) => BigInt(`0x${stranger.slice(2 + i * 8, 10 + i * 8)}`).toString()));
      const before = BigInt(await runtime.evm('eth_getBalance', [stranger, 'latest']));
      await send('unspent note remains withdrawable to accepting recipient', proof('withdraw', retry));
      assert.equal(BigInt(await runtime.evm('eth_getBalance', [stranger, 'latest'])) - before, 400n);
    });

    for (const propagate of [true, false]) await check(`malicious recipient reentrancy is blocked with ${propagate ? 'full outer rollback' : 'only one successful outer withdrawal'}`, async () => {
      const recipient = await deployRecipient('ReentrantRecipient', [pool.address]), f = await outputFixture(recipient.address), payload = proof('withdraw', f.inputs), bytes = payload.slice(2);
      const arm = `0x${recipient.selectors['arm(bytes,bool)']}${word(64)}${word(propagate ? 1 : 0)}${word(bytes.length / 2)}${bytes.padEnd(Math.ceil(bytes.length / 64) * 64, '0')}`;
      await send('arm malicious control recipient', arm, owner, '0x1', undefined, recipient.address);
      const receipt = propagate ? await revert('propagated reentrancy fails outer transfer', payload, 'WITHDRAWAL_FAILED') : await send('swallowed reentrancy permits only outer transfer', payload);
      const trace = await runtime.evm('debug_traceTransaction', [receipt.transactionHash, { tracer: 'callTracer' }]);
      const returns = [];
      const collect = node => { if (typeof node.output === 'string') returns.push(decodePrivateRevert(node.output)); for (const child of node.calls ?? []) collect(child); }; collect(trace);
      assert.ok(returns.some(value => value.reason === 'REENTRANCY'), 'actual nested EVM call must reject with REENTRANCY');
      const readRecipient = method => runtime.evm('eth_call', [{ to: recipient.address, data: `0x${recipient.selectors[method]}` }, 'latest']).then(BigInt);
      assert.equal(await readRecipient('callbacks()'), propagate ? 0n : 1n);
      assert.equal(await readRecipient('blocked()'), propagate ? 0n : 1n);
      assert.equal(BigInt(await runtime.evm('eth_getBalance', [recipient.address, 'latest'])), propagate ? 0n : 400n);
      if (propagate) await assertUnspentWithdrawal(f);
      else { assert.equal(BigInt(await pool.call('spentNullifiers(bytes32)', [f.nullifier])), 1n); assert.equal(BigInt(await pool.call('liveOutputNotes()')), 1n); }
      pool.receipts.find(entry => entry.receipt.transactionHash === receipt.transactionHash).nestedCallTrace = trace;
    });

    assert.equal(record.cases.every(item => item.passed), true, 'ALL_CONTROL_CASES_MUST_PASS');
    record.status = 'PASSED';
    record.passedCases = record.cases.filter(item => item.passed).length;
    record.receipts = pool.receipts;
    record.finishedAt = new Date().toISOString();
    return record;
  } catch (error) {
    record.status = 'FAILED'; record.error = error.message; record.receipts = pool?.receipts ?? []; error.controlEvidence = record; throw error;
  } finally { await runtime.close(); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const output = join(projectRoot, 'evidence/m16-controls.json');
  try {
    const record = await runPrivateFinalityControls();
    await writeFile(output, `${JSON.stringify(record, null, 2)}\n`);
    console.log(`${CLASSIFICATION}: ${record.passedCases} cases passed; ${record.receipts.length} actual local EVM receipts; ${output}`);
  } catch (error) {
    if (error.controlEvidence) await writeFile(output, `${JSON.stringify(error.controlEvidence, null, 2)}\n`);
    console.error(`${CLASSIFICATION}: FAILED: ${error.stack}`); process.exitCode = 1;
  }
}
