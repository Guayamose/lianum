/** Actual isolated Anvil execution. These digest mock verifiers authenticate only
 * test input bytes; they do not establish genuine proof/signature/type soundness. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access, mkdir, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { deployPrivateAssetPool, PRIVATE_ASSET_NATIVE, PRIVATE_ASSET_VERIFIER_MODES, derivePrivateAssetIdentity, derivePrivateAssetPoolScope, privateGuardedReserveCalldata } from '../src/private-asset-runtime.mjs';
import { encodeWalletPoolInputs } from '../src/private-wallet-note-encoding.mjs';
import { encodePrivatePoolInputs, noteHashToWords, ZERO_NOTE_HASH } from '../src/private-note-tree.mjs';
import { linuxRuntimePins } from '../src/chains/linux-runtime-pins.mjs';
import { pinnedBinary, projectRoot, sleep } from '../src/chains/runtime-harness.mjs';
import { CLASSIFICATION, ownAnvil, hash, sha, word, proof, source } from './helpers/private-asset-fixture.mjs';

let unavailable = process.platform !== 'linux' || process.arch !== 'x64' ? 'requires reviewed Linux x64 binaries' : null;
if (!unavailable) try { for (const pin of [linuxRuntimePins.anvil, linuxRuntimePins.solc]) await access(join(projectRoot, '.local/linux-runtimes', pin[0])); } catch (error) { if (error.code !== 'ENOENT') throw error; unavailable = 'pinned local Anvil/solc missing; no EVM coverage claimed'; }

test(`${CLASSIFICATION}: immutable per-asset backing`, { skip: unavailable ?? false, timeout: 180000 }, async t => {
 const runtime = await ownAnvil(), results = [];
 try {
  const sources = Object.fromEntries(PRIVATE_ASSET_VERIFIER_MODES.map(mode => { const content = source(mode); return [mode, { content, sha256: sha(content) }]; }));
  const options = { sources, policy: hash('asset policy'), deploymentDomain: hash('asset deployment'), solAuthority: runtime.accounts[1], btcAuthority: runtime.accounts[2] };
  const pool = await deployPrivateAssetPool(runtime, options);
  const other = await deployPrivateAssetPool(runtime, options);
  const sameAsset = await deployPrivateAssetPool(runtime, { ...options, asset: pool.asset });
  const native = await deployPrivateAssetPool(runtime, { ...options, asset: PRIVATE_ASSET_NATIVE });
  const fixtureName = 'PrivateAssetBehaviorFixtures.sol';
  const fixtureSource = await readFile(join(projectRoot, 'contracts/test', fixtureName), 'utf8');
  const compiled = spawnSync(await pinnedBinary(...linuxRuntimePins.solc), ['--standard-json', '--no-import-callback'], {
   input: JSON.stringify({ language: 'Solidity', sources: { [fixtureName]: { content: fixtureSource } }, settings: { optimizer: { enabled: true, runs: 1 }, evmVersion: 'cancun', metadata: { bytecodeHash: 'none' }, outputSelection: { '*': { '*': ['evm.bytecode.object', 'evm.methodIdentifiers'] } } } }), encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, timeout: 30000,
  });
  assert.equal(compiled.status, 0, compiled.stderr);
  const output = JSON.parse(compiled.stdout); assert.deepEqual((output.errors ?? []).filter(e => e.severity === 'error'), []);
  const fixtures = output.contracts[fixtureName];
  const deploy = async (artifact, args = [], value = 0n) => (await pool.send('deploy synthetic asset control', { data: `0x${artifact.evm.bytecode.object}${args.map(word).join('')}`, value })).contractAddress;
  const token = await deploy(fixtures.PrivateAssetBehaviorToken);
  const tokenSelectors = fixtures.PrivateAssetBehaviorToken.evm.methodIdentifiers;
  const tokenData = (method, args = []) => `0x${tokenSelectors[method]}${args.map(word).join('')}`;
  const tokenCall = (method, args = []) => runtime.evm('eth_call', [{ to: token, data: tokenData(method, args) }, 'latest']);
  const tokenSend = (method, args = []) => pool.send(`control ${method}`, { to: token, data: tokenData(method, args) });
  const hostileAddress = await deploy(pool.compilation.output.contracts[pool.compilation.sourceNames.pool].PrivateAssetNotePool, [token, options.deploymentDomain, options.policy, ...['reserve', 'fulfill', 'refund', 'withdraw'].map(m => pool.verifiers[m].address), options.solAuthority, options.btcAuthority, ...['deposit_balance', 'reserve_from_note', 'withdraw_balance'].map(m => pool.verifiers[m].address)]);
  const hostile = { ...pool, address: hostileAddress, asset: token, call: (method, args = []) => runtime.evm('eth_call', [{ to: hostileAddress, data: pool.data(method, args) }, 'latest']) };
  hostile.scope = await hostile.call('scope()');
  const rejectedNative = await deploy(fixtures.PrivateAssetRejectNative);
  const forwardingNative = await deploy(fixtures.PrivateAssetForwardNative, [runtime.accounts[4]]);
  const base = async p => ({ scope: p.scope, policy: p.policy, epoch: BigInt((await runtime.evm('eth_getBlockByNumber', ['latest', false])).timestamp) / 600n });
  const encode = async (p, mode, fields) => (mode.includes('_') ? encodeWalletPoolInputs : encodePrivatePoolInputs)(mode, { ...await base(p), ...fields });
  const send = (p, mode, inputs, status = '0x1', reason, extra = {}) => pool.send(mode, { to: p.address, data: p.proofData(mode, proof(mode, inputs), inputs), ...extra }, status, reason);
  const deposit = async (p, label, amount = 1000n) => {
   if (p === hostile) await tokenSend('approve(address,uint256)', [p.address, amount]); else await p.beforeDeposit(amount);
   const output = hash(`${label} output`), inputs = await encode(p, 'deposit_balance', { amount, output });
   await send(p, 'deposit_balance', inputs, '0x1', undefined, { value: p.asset === PRIVATE_ASSET_NATIVE ? amount : 0n }); return { inputs, output };
  };
  const withdrawal = async (p, label, amount = 1000n, recipient = runtime.accounts[4]) => encode(p, 'withdraw_balance', { root: await p.call('currentRoot()'), nullifier: hash(`${label} nf`), amount, recipient });
  const mutate = (inputs, offset, digest) => { const changed = [...inputs]; changed.splice(offset, 8, ...noteHashToWords(digest)); return changed; };
  const noteState = async (p, c = {}) => ({
   canonical: await Promise.all(['canonicalState()', 'canonicalEffects()', 'canonicalRootHistory()', 'canonicalRevocations()', 'treeNodes()', 'backedAmount()'].map(m => p.call(m))),
   maps: await Promise.all([p.call('spentNullifiers(bytes32)', [c.nullifier ?? ZERO_NOTE_HASH]), p.call('insertedCommitments(bytes32)', [c.output ?? ZERO_NOTE_HASH]), p.call('admissions(bytes32)', [c.admissionTag ?? ZERO_NOTE_HASH])]),
  });
  const state = async (p, c = {}) => ({ ...await noteState(p, c), backing: await p.call('canonicalBacking()'), asset: await Promise.all(runtime.accounts.map(a => p === hostile ? tokenCall('balanceOf(address)', [a]) : p.asset === PRIVATE_ASSET_NATIVE ? Promise.resolve('native gas excluded') : p.assetCall('balanceOf(address)', [a]))), allowance: p.asset === PRIVATE_ASSET_NATIVE ? null : p === hostile ? await tokenCall('allowance(address,address)', [runtime.accounts[0], p.address]) : await p.assetCall('allowance(address,address)', [runtime.accounts[0], p.address]) });
  const reject = async (p, mode, inputs, reason, c = {}, extra = {}) => {
   const before = await state(p, c), receipt = await send(p, mode, inputs, '0x0', reason, extra); assert.deepEqual(await state(p, c), before, `${reason}: complete note/asset/allowance rollback`); assert.deepEqual(receipt.logs, []);
  };
  const check = async (name, action) => t.test(name, async () => { const snapshot = await runtime.evm('evm_snapshot'); try { await action(); results.push({ name, passed: true }); } catch (error) { results.push({ name, passed: false, error: error.message }); throw error; } finally { assert.equal(await runtime.evm('evm_revert', [snapshot]), true); } });
  const arm = async (p, inputs) => {
   const payload = p.proofData('deposit_balance', proof('deposit_balance', inputs), inputs).slice(2);
   await pool.send('arm explicit reentrancy fixture', { to: token, data: `0x${tokenSelectors['arm(address,bytes)']}${word(p.address)}${word(64)}${word(payload.length / 2)}${payload.padEnd(Math.ceil(payload.length / 64) * 64, '0')}` });
  };

  await check('asset address/code identity and actual deployment both bind scope', async () => {
   assert.equal(pool.assetIdentity, derivePrivateAssetIdentity(31337n, pool.asset, pool.assetCodeHash));
   assert.equal(pool.scope, derivePrivateAssetPoolScope(31337n, pool.address, pool.deploymentDomain, pool.assetIdentity));
   assert.notEqual(pool.assetIdentity, other.assetIdentity); assert.notEqual(pool.scope, other.scope);
   assert.equal(pool.assetIdentity, sameAsset.assetIdentity); assert.notEqual(pool.scope, sameAsset.scope);
   assert.notEqual(pool.scope, derivePrivateAssetPoolScope(31338n, pool.address, pool.deploymentDomain, pool.assetIdentity));
   assert.notEqual(pool.scope, derivePrivateAssetPoolScope(31337n, pool.address, pool.deploymentDomain, other.assetIdentity));
   assert.equal(BigInt(await pool.assetCall('totalSupply()')), 1_000_000_000n);
   assert.equal(pool.fundingTransactionValue(123n), '0x0'); assert.equal(native.fundingTransactionValue(123n), '0x7b');
   const names = pool.compilation.output.contracts[pool.compilation.sourceNames.pool].PrivateAssetNotePool.abi.map(x => x.name).filter(Boolean);
   assert.ok(!names.some(x => /owner|upgrade|sweep|drain|mint|rescue/i.test(x)));
  });
  await check('exact local token deposit and withdrawal conserve supply and backing', async () => {
   const owner = await pool.assetBalance(runtime.accounts[0]), recipient = await pool.assetBalance(runtime.accounts[4]);
   await deposit(pool, 'conservation'); assert.equal(await pool.assetBalance(pool.address), 1000n); assert.equal(await pool.assetBalance(runtime.accounts[0]), owner - 1000n);
   assert.equal(BigInt(await pool.assetCall('allowance(address,address)', [runtime.accounts[0], pool.address])), 0n);
   const middle = await pool.snapshot(); assert.equal(middle.backedAmount, '1000'); assert.equal(middle.assetSurplus, '0');
   const inputs = await withdrawal(pool, 'conservation'); await send(pool, 'withdraw_balance', inputs);
   assert.equal(await pool.assetBalance(runtime.accounts[4]), recipient + 1000n); assert.equal(await pool.assetBalance(pool.address), 0n); assert.equal((await pool.snapshot()).backedAmount, '0');
   assert.equal(BigInt(await pool.assetCall('totalSupply()')), owner);
   await reject(pool, 'withdraw_balance', inputs, 'NOTE_ALREADY_SPENT');
  });
  await check('ERC20 paths reject attached native value and missing allowance without mutation', async () => {
   const inputs = await encode(pool, 'deposit_balance', { amount: 1000n, output: hash('no allowance') });
   await reject(pool, 'deposit_balance', inputs, 'ASSET_TRANSFER_FAILED');
   await pool.beforeDeposit(1000n); await reject(pool, 'deposit_balance', inputs, 'TOKEN_NATIVE_VALUE', {}, { value: 1n });
   assert.equal(await runtime.evm('eth_getBalance', [pool.address, 'latest']), '0x0');
  });
  await check('same and different asset pool replay rejects original scope and altered proof bytes', async () => {
   const { inputs } = await deposit(pool, 'cross scope');
   for (const destination of [other, sameAsset]) {
    await reject(destination, 'deposit_balance', inputs, 'PUBLIC_DOMAIN');
    await destination.beforeDeposit(1000n);
    const altered = mutate(inputs, 0, destination.scope), before = await state(destination);
    await pool.send('tamper scope with old digest proof', { to: destination.address, data: destination.proofData('deposit_balance', proof('deposit_balance', inputs), altered) }, '0x0', 'DEPOSIT_BALANCE_PROOF');
    assert.deepEqual(await state(destination), before);
   }
  });
  await check('surplus donations never issue notes, cannot satisfy exits, and preserve legitimate withdrawals', async () => {
   await deposit(pool, 'surplus'); const before = await noteState(pool);
   await pool.send('direct local token donation', { to: pool.asset, data: pool.assetData('transfer(address,uint256)', [pool.address, 333n]) });
   assert.deepEqual(await noteState(pool), before); assert.equal((await pool.snapshot()).assetSurplus, '333');
   await reject(pool, 'withdraw_balance', await withdrawal(pool, 'surplus excessive', 1001n), 'ASSET_INSUFFICIENT_BACKING');
   await send(pool, 'withdraw_balance', await withdrawal(pool, 'surplus legitimate'));
   const final = await pool.snapshot(); assert.equal(final.backedAmount, '0'); assert.equal(final.assetBalance, '333'); assert.equal(final.assetSurplus, '333');
  });
  await check('bad guarded final root rolls back transferFrom, allowance and every note write', async () => {
   await pool.beforeDeposit(1000n);
   const c = { output: hash('guarded output'), admissionTag: hash('guarded admission') }, inputs = await encode(pool, 'reserve', { amount: 1000n, ...c });
   const before = await state(pool, c), data = privateGuardedReserveCalldata(pool.selectors['reserveGuarded(bytes,bytes32[],bytes32,uint64,bytes32)'], proof('reserve', inputs), inputs, { expectedRoot: await pool.call('currentRoot()'), expectedSequence: 0n, expectedPostRoot: hash('wrong post') });
   const receipt = await pool.send('guarded rollback', { to: pool.address, data }, '0x0', 'RESERVE_POST_ROOT_MISMATCH');
   assert.deepEqual(receipt.logs, []); assert.deepEqual(await state(pool, c), before);
  });
  for (const [mode, reason] of [[1, 'ASSET_TRANSFER_FALSE'], [2, 'ASSET_TRANSFER_FAILED'], [3, 'ASSET_TRANSFER_RETURN'], [4, 'ASSET_TRANSFER_FALSE'], [5, 'ASSET_TRANSFER_RETURN'], [6, 'ASSET_INEXACT_POOL_IN'], [7, 'ASSET_INEXACT_SENDER'], [8, 'ASSET_INEXACT_POOL_IN']]) {
   await check(`deposit rejects adversarial token mode ${mode} with atomic rollback`, async () => {
    await tokenSend('approve(address,uint256)', [hostile.address, 1000n]); await tokenSend('setModes(uint8,uint8,uint8)', [0, mode, 0]);
    const c = { output: hash(`bad deposit ${mode}`) }, inputs = await encode(hostile, 'deposit_balance', { amount: 1000n, ...c });
    await reject(hostile, 'deposit_balance', inputs, reason, c);
   });
  }
  for (const [mode, reason] of [[1, 'ASSET_TRANSFER_FALSE'], [2, 'ASSET_TRANSFER_FAILED'], [3, 'ASSET_TRANSFER_RETURN'], [4, 'ASSET_TRANSFER_FALSE'], [5, 'ASSET_TRANSFER_RETURN'], [6, 'ASSET_INEXACT_RECIPIENT'], [7, 'ASSET_INEXACT_POOL_OUT'], [8, 'ASSET_INEXACT_RECIPIENT']]) {
   await check(`withdrawal rejects adversarial token mode ${mode} with atomic rollback`, async () => {
    await deposit(hostile, `bad exit ${mode}`, 2000n); await tokenSend('setModes(uint8,uint8,uint8)', [mode, 0, 0]);
    const c = { nullifier: hash(`bad exit ${mode} nf`) }, inputs = await withdrawal(hostile, `bad exit ${mode}`);
    await reject(hostile, 'withdraw_balance', inputs, reason, c);
   });
  }
  await check('token reentrancy is blocked during ingress and exit, with explicit failure rollback', async () => {
   const output = hash('reentry note'), inputs = await encode(hostile, 'deposit_balance', { amount: 1000n, output });
   await tokenSend('approve(address,uint256)', [hostile.address, 1000n]); await arm(hostile, inputs);
   await tokenSend('setModes(uint8,uint8,uint8)', [0, 10, 0]); await reject(hostile, 'deposit_balance', inputs, 'ASSET_TRANSFER_FAILED', { output });
   await tokenSend('setModes(uint8,uint8,uint8)', [0, 9, 0]); await send(hostile, 'deposit_balance', inputs); assert.equal(BigInt(await tokenCall('reentryBlocked()')), 1n);
   assert.equal(BigInt(await hostile.call('leafCount()')), 1n); assert.equal(BigInt(await hostile.call('backedAmount()')), 1000n);
   const w = await withdrawal(hostile, 'reentry exit'); await tokenSend('setModes(uint8,uint8,uint8)', [10, 0, 0]); await reject(hostile, 'withdraw_balance', w, 'ASSET_TRANSFER_FAILED');
   await tokenSend('setModes(uint8,uint8,uint8)', [9, 0, 0]); await send(hostile, 'withdraw_balance', w); assert.equal(BigInt(await hostile.call('backedAmount()')), 0n);
  });
  await check('negative balance drift fails closed and malformed balance responses never mutate notes', async () => {
   await deposit(hostile, 'drift'); const inputs = await withdrawal(hostile, 'drift');
   await tokenSend('setBalance(address,uint256)', [hostile.address, 999n]); await reject(hostile, 'withdraw_balance', inputs, 'ASSET_BACKING_DEFICIT');
   const report = (await hostile.call('canonicalBacking()')).slice(2).match(/.{64}/g).map(x => BigInt(`0x${x}`)); assert.deepEqual(report.slice(1, 5), [1000n, 999n, 0n, 1n]);
   await tokenSend('setBalance(address,uint256)', [hostile.address, 1000n]);
   for (const readMode of [1, 2, 3]) {
    const before = await noteState(hostile); await tokenSend('setModes(uint8,uint8,uint8)', [0, 0, readMode]);
    const receipt = await send(hostile, 'withdraw_balance', inputs, '0x0', 'ASSET_BALANCE_RETURN'); assert.deepEqual(receipt.logs, []); assert.deepEqual(await noteState(hostile), before);
    await tokenSend('setModes(uint8,uint8,uint8)', [0, 0, 0]);
   }
  });
  await check('trusted helper refuses arbitrary token code even if exact behavior is currently selected', async () => {
   await assert.rejects(deployPrivateAssetPool(runtime, { ...options, asset: token }), /PRIVATE_ASSET_UNSUPPORTED_TOKEN_CODE/);
  });
  await check('native exact exits reject receiver failures/forwarding and forced donations remain surplus', async () => {
   await deposit(native, 'native controls');
   for (const [recipient, reason] of [[rejectedNative, 'WITHDRAWAL_FAILED'], [forwardingNative, 'ASSET_INEXACT_RECIPIENT'], [native.address, 'ASSET_SELF_RECIPIENT']]) await reject(native, 'withdraw_balance', await withdrawal(native, reason, 1000n, recipient), reason);
   await deploy(fixtures.PrivateAssetForceNative, [native.address], 77n); assert.equal((await native.snapshot()).assetSurplus, '77');
   await send(native, 'withdraw_balance', await withdrawal(native, 'native good'));
   const final = await native.snapshot(); assert.equal(final.backedAmount, '0'); assert.equal(final.assetBalance, '77');
  });
  await check('direct native sends have no receive entry and forced native token-pool value is never backing', async () => {
   const hash = await runtime.evm('eth_sendTransaction', [{ from: runtime.accounts[0], to: pool.address, value: '0x1', gas: '0x186a0' }]);
   let receipt; for (let i = 0; i < 200; i++) { receipt = await runtime.evm('eth_getTransactionReceipt', [hash]); if (receipt) break; await sleep(50); }
   assert.ok(receipt, 'DIRECT_NATIVE_RECEIPT'); assert.equal(receipt.status, '0x0'); assert.deepEqual(receipt.logs, []);
   await deploy(fixtures.PrivateAssetForceNative, [pool.address], 55n); const snapshot = await pool.snapshot(); assert.equal(snapshot.unrelatedNative, '55'); assert.equal(snapshot.assetBalance, '0'); assert.equal(snapshot.backedAmount, '0');
   await deposit(pool, 'forced unrelated'); await send(pool, 'withdraw_balance', await withdrawal(pool, 'forced unrelated')); assert.equal((await pool.snapshot()).unrelatedNative, '55');
  });
  const report = { classification: CLASSIFICATION, status: results.every(r => r.passed) ? 'PASSED' : 'FAILED', cases: results, sources: pool.compilation.sources, fixturesSHA256: sha(fixtureSource), deployments: [pool, other, sameAsset, native].flatMap(p => p.deployments), receipts: [pool, other, sameAsset, native].flatMap(p => p.receipts), scope: 'Only contract bookkeeping and observed transfer controls; genuine proofs, private note conservation and owner authorization are not established by these synthetic controls.' };
  t.diagnostic(JSON.stringify({ classification: CLASSIFICATION, cases: results.length, receipts: report.receipts.length, deployedPoolBytes: pool.deployments.find(d => d.role === 'asset-funded-note-pool').deployedCodeBytes }));
  if (process.env.PRIVATE_ASSET_SAVE_CONTROLS === '1') { const directory = join(projectRoot, 'evidence/private-asset-controls'); await mkdir(directory, { recursive: true }); await writeFile(join(directory, `report-${Date.now()}.json`), `${JSON.stringify(report, null, 2)}\n`); }
 } finally { await runtime.close(); }
});
