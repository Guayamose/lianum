/** Local official MetaMorpho redemption. Only an original owned fixture can
 * create this adapter. A confirmed private EXIT is joined by private-vault-exit;
 * this adapter itself neither authenticates private notes nor credits balances.
 * Surviving-keeper reopen only; original runtime/process loss remains separate. */
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { Vault } from '../../../../engine/src/crypto/vault.mjs';
import { canonical } from '../../../../engine/src/crypto/privacy.mjs';
import { projectRoot } from '../../../../engine/src/chains/shared/runtime-harness.mjs';
import { ROOT } from '../../../../proofs/src/catalog.mjs';
import { assertOwnedLocalEvmV2 } from '../../chains/evm/runtime/owned-evm-v2-runtime.mjs';
import { assertOfficialProtocolFixture } from '../../../tests/fixtures/operations/deployments/system/official-protocol-fixture-v3.mjs';
import { exactRecord } from '../../execution/encoding/commitments.mjs';

const owned = new WeakMap(), bindings = new WeakMap(), receipts = new WeakMap();
const sha = value => createHash('sha256').update(value).digest('hex');
const clone = value => JSON.parse(canonical(value));
function freeze(value) { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
const detached = value => freeze(clone(value));
const fresh = () => randomBytes(32).toString('hex');
const bare = value => { assert.match(value, /^0x[0-9a-f]+$/); return value.slice(2); };
const word = value => BigInt(value).toString(16).padStart(64, '0');
const quantity = value => { assert.match(value, /^0x(0|[1-9a-f][0-9a-f]*)$/); return BigInt(value); };
const uint = (value, bits = 128) => { assert.ok(typeof value === 'string' && /^(0|[1-9][0-9]*)$/.test(value), 'METAMORPHO_UINT');
  const n = BigInt(value); assert.ok(n > 0n && n < (1n << BigInt(bits)), 'METAMORPHO_UINT_RANGE'); return n; };
function reference(value) { assert.match(value, /^[0-9a-f]{64}$/); assert.notEqual(value, '0'.repeat(64)); return value; }
export const isOwnedMetaMorphoVault = value => owned.has(value);
export function assertOwnedMetaMorphoVault(runtime, value) {
  assert.ok(owned.get(value) === runtime && owned.has(value), 'METAMORPHO_ORIGINAL_CAPABILITY');
}
export function ownedMetaMorphoVaultBinding(runtime, value) { assertOwnedMetaMorphoVault(runtime, value); return bindings.get(value); }
export function assertOwnedMetaMorphoReceipt(value, receipt) { assert.equal(receipts.get(receipt), value, 'METAMORPHO_ORIGINAL_RECEIPT'); }

function compileExit() {
  const source = readFileSync(join(ROOT, 'contracts/defi/BoundedMetaMorphoExit.sol'), 'utf8');
  const require = createRequire(join(projectRoot, 'tools/solidity-js/package.json')), solc = require('solc');
  assert.match(solc.version(), /^0\.8\.37\+commit\.f401782d/);
  const settings = { optimizer: { enabled: true, runs: 200 }, evmVersion: 'cancun',
    outputSelection: { '*': { '*': ['abi', 'evm.bytecode', 'evm.deployedBytecode'], '': ['ast'] } } };
  const output = JSON.parse(solc.compile(JSON.stringify({ language: 'Solidity', sources: { 'BoundedMetaMorphoExit.sol': { content: source } }, settings })));
  assert.deepEqual((output.errors ?? []).filter(row => row.severity === 'error'), [], 'METAMORPHO_EXIT_COMPILATION');
  return { artifact: output.contracts['BoundedMetaMorphoExit.sol'].BoundedMetaMorphoExit,
    ast: output.sources['BoundedMetaMorphoExit.sol'].ast, sourceSHA256: sha(source), compiler: solc.version() };
}
function expectedCode(build, vault, asset) {
  const names = Object.fromEntries(build.ast.nodes.filter(node => node.nodeType === 'ContractDefinition')
    .flatMap(node => node.nodes).filter(node => node.nodeType === 'VariableDeclaration' && node.mutability === 'immutable')
    .map(node => [String(node.id), node.name]));
  const code = Buffer.from(build.artifact.evm.deployedBytecode.object, 'hex'), values = { vault, asset }, seen = new Set();
  for (const [id, ranges] of Object.entries(build.artifact.evm.deployedBytecode.immutableReferences)) {
    assert.ok(Object.hasOwn(values, names[id]), 'METAMORPHO_EXIT_IMMUTABLE'); seen.add(names[id]);
    for (const range of ranges) { assert.equal(range.length, 32); Buffer.from(bare(values[names[id]]).padStart(64, '0'), 'hex').copy(code, range.start); }
  }
  assert.deepEqual([...seen].sort(), ['asset', 'vault']); return '0x' + code.toString('hex');
}

export async function createOwnedMetaMorphoVault(input) {
  assert.equal(arguments.length, 1); exactRecord(input, ['runtime', 'protocolFixture']);
  const { runtime, protocolFixture: fixture } = input;
  await assertOwnedLocalEvmV2(runtime); assertOfficialProtocolFixture(runtime, fixture);
  assert.equal(runtime.metadata.chainId, '31337');
  const require = createRequire(join(ROOT, 'wallet-platform/artifacts/private-external-v1/abi-tools/package.json'));
  const { Interface } = require('ethers'), build = compileExit(), iface = new Interface(build.artifact.abi);
  const sender = runtime.accounts[0], vault = fixture.vault, asset = fixture.first;
  const creation = '0x' + build.artifact.evm.bytecode.object + iface.encodeDeploy([vault.address]).slice(2);
  const deployment = await runtime.send('deploy-bounded-metamorpho-exit', { from: sender, data: creation });
  await runtime.assertCanonical(deployment); const router = deployment.contractAddress.toLowerCase();
  const routerCode = expectedCode(build, vault.address, asset.address);
  assert.equal(await runtime.code(router, deployment.blockNumber), routerCode, 'METAMORPHO_EXIT_DEPLOYED_CODE');
  const id = detached({ chainId: '31337', genesisHash: bare(runtime.metadata.evmGenesis), domain: sha('METAMORPHO_EXIT/' + router),
    runtimeId: sha(runtime.metadata.scratchDirectory), asset: bare(asset.address), vault: bare(vault.address),
    assetCodeSHA256: sha(Buffer.from(bare(asset.code), 'hex')), vaultCodeSHA256: sha(Buffer.from(bare(vault.code), 'hex')) });
  const binding = detached({ identity: id, sender: bare(sender), receiver: bare(sender) });
  const directory = await mkdtemp(join(runtime.metadata.scratchDirectory, 'metamorpho-exit-'));
  const store = new Vault(join(directory, 'operations.vault')), password = fresh(), keeper = fresh();
  let record = await store.create({ profile: 'OWNED_METAMORPHO_EXIT_V1', identity: id, router, operations: [], sendBlocked: false }, password);
  let busy = false, poisoned = false, pending = null, adapter;
  const assertFixture = async () => { assertOfficialProtocolFixture(runtime, fixture); await assertOwnedLocalEvmV2(runtime); };
  async function healthy() { assert.ok(!poisoned, 'METAMORPHO_STORAGE_UNAVAILABLE'); await assertFixture();
    try { assert.deepEqual(await store.read(password), record, 'METAMORPHO_JOURNAL_CHANGED'); } catch (error) { poisoned = true; throw error; } }
  async function exclusive(work) { assert.ok(!busy, 'METAMORPHO_BUSY'); busy = true; try { await healthy(); return await work(); } finally { busy = false; } }
  async function write(transform) { try { await healthy(); pending = { revision: record.revision + 1, data: clone(transform(clone(record.data))) };
    const next = await store.update(password, record.revision, old => { assert.deepEqual(old, record.data); return pending.data; });
    assert.deepEqual(next, pending); assert.deepEqual(await store.read(password), next); record = next; pending = null;
  } catch (error) { poisoned = true; throw error; } }
  const find = ref => { reference(ref); const row = record.data.operations.find(row => row.reference === ref); assert.ok(row, 'METAMORPHO_PREPARATION_REQUIRED'); return row; };
  const update = (ref, changes) => write(data => ({ ...data, operations: data.operations.map(row => row.reference === ref ? { ...row, ...clone(changes) } : row) }));
  const read = async (contract, method, args, at) => contract.iface.decodeFunctionResult(method,
    await runtime.call({ to: contract.address, data: contract.iface.encodeFunctionData(method, args) }, at));
  const routerContract = { address: router, iface };
  async function observed(at = 'latest', ref = '0'.repeat(64)) {
    await assertFixture(); const header = await runtime.block(at), tag = header.number;
    assert.equal(await runtime.code(vault.address, tag), vault.code, 'METAMORPHO_CODE_CHANGED');
    assert.equal(await runtime.code(asset.address, tag), asset.code, 'METAMORPHO_ASSET_CODE_CHANGED');
    assert.equal(await runtime.code(router, tag), routerCode, 'METAMORPHO_EXIT_CODE_CHANGED');
    assert.equal((await read(vault, 'asset', [], tag))[0].toLowerCase(), asset.address);
    const values = await Promise.all([
      read(vault, 'totalAssets', [], tag), read(vault, 'totalSupply', [], tag), read(vault, 'balanceOf', [sender], tag),
      read(asset, 'balanceOf', [sender], tag), read(vault, 'allowance', [sender, router], tag),
      read(vault, 'balanceOf', [router], tag), read(routerContract, 'used', [sender, '0x' + ref], tag),
    ]);
    await runtime.assertCanonical(header);
    const [assets, shares, senderShares, senderAssets, allowance, routerShares, used] = values.map(row => row[0]);
    return detached({ identity: id, snapshot: { blockNumber: quantity(tag).toString(), blockHash: bare(header.hash),
      blockTimestamp: quantity(header.timestamp).toString(), totalAssets: assets.toString(), totalShares: shares.toString() },
      balances: { senderShares: senderShares.toString(), senderAssets: senderAssets.toString(), allowance: allowance.toString(),
        routerShares: routerShares.toString(), used }, header, privateSpendable: false });
  }
  async function quote(intent) {
    exactRecord(intent, ['reference', 'kind', 'amount', 'minimumOutput', 'deadline']); reference(intent.reference);
    assert.equal(intent.kind, 'redeem'); const shares = uint(intent.amount), minimum = uint(intent.minimumOutput), deadline = uint(intent.deadline, 64);
    const current = await observed('latest', intent.reference), at = current.header.number;
    assert.equal(current.balances.used, false, 'METAMORPHO_REFERENCE_USED');
    assert.ok(shares <= BigInt(current.balances.senderShares), 'METAMORPHO_SHARE_BALANCE');
    const [preview, maximum] = await Promise.all([read(vault, 'previewRedeem', [shares], at), read(vault, 'maxRedeem', [sender], at)]);
    assert.ok(shares <= maximum[0], 'METAMORPHO_REDEEM_LIQUIDITY');
    assert.ok(preview[0] >= minimum, 'METAMORPHO_MINIMUM_ABOVE_PREVIEW');
    const timestamp = BigInt(current.snapshot.blockTimestamp);
    assert.ok(deadline > timestamp && deadline - timestamp <= 300n, 'METAMORPHO_DEADLINE_WINDOW');
    await runtime.assertCanonical(current.header);
    return detached({ identity: id, kind: 'redeem', sender: bare(sender), owner: bare(sender), receiver: bare(sender),
      amount: intent.amount, minimumOutput: intent.minimumOutput, deadline: intent.deadline, nonce: intent.reference,
      previewOutput: preview[0].toString(), quote: current.snapshot });
  }
  function output(ref, freshObservation = false) {
    const row = find(ref), result = detached({ reference: ref, action: row.action, phase: row.phase, execution: row.execution,
      sendBlocked: record.data.sendBlocked, privateSpendable: false, assurance: 'ORIGINAL_LOCAL_METAMORPHO_PUBLIC_REDEMPTION',
      processRestartSupported: false });
    if (freshObservation && row.phase === 'OBSERVED') receipts.set(result, adapter); return result;
  }
  async function reconcileSend(ref, kind) {
    const row = find(ref), submission = row[kind]; if (!submission) return false;
    const entries = runtime.transactions.slice(submission.journalStart).filter(item => item.label === submission.label);
    assert.ok(entries.length <= 1, 'METAMORPHO_NO_DUPLICATE_SEND');
    if (!entries.length || !entries[0].transactionHash) return false;
    const original = entries[0]; assert.deepEqual(original.request, submission.request, 'METAMORPHO_ORIGINAL_REQUEST');
    assert.equal(quantity(original.senderNonce).toString(), submission.senderNonce, 'METAMORPHO_ORIGINAL_NONCE');
    const hash = original.transactionHash, [transaction, receipt] = await Promise.all([runtime.transaction(hash), runtime.receipt(hash)]);
    if (!transaction || !receipt) return false;
    assert.equal(transaction.hash, hash); assert.equal(receipt.transactionHash, hash);
    assert.equal(transaction.from, sender); assert.equal(transaction.to, submission.request.to); assert.equal(transaction.input, submission.request.data);
    assert.equal(quantity(transaction.nonce).toString(), submission.senderNonce); assert.equal(transaction.blockHash, receipt.blockHash);
    const header = await runtime.assertCanonical(receipt); assert.deepEqual(header.transactions, [hash], 'METAMORPHO_SINGLE_TRANSACTION');
    const before = await observed('0x' + (quantity(header.number) - 1n).toString(16), ref), after = await observed(header.number, ref);
    assert.deepEqual(before, submission.before, 'METAMORPHO_ORIGINAL_PARENT');
    assert.equal(header.parentHash, before.header.hash); await runtime.checkReceipt(receipt);
    let confirmation = null, phase;
    if (receipt.status === '0x0') {
      assert.deepEqual(before.balances, after.balances, 'METAMORPHO_REVERT_BALANCES');
      assert.equal(before.snapshot.totalAssets, after.snapshot.totalAssets); assert.equal(before.snapshot.totalShares, after.snapshot.totalShares);
      phase = 'REVERTED';
    } else {
      assert.equal(receipt.status, '0x1');
      if (kind === 'approval') {
        assert.equal(after.balances.allowance, row.action.amount, 'METAMORPHO_EXACT_ALLOWANCE');
        for (const name of ['senderShares', 'senderAssets', 'routerShares', 'used']) assert.equal(after.balances[name], before.balances[name]);
        phase = 'PREPARED';
      } else {
        const events = receipt.logs.filter(log => log.address.toLowerCase() === router).map(log => {
          assert.equal(log.removed, false); assert.equal(log.blockHash, header.hash); assert.equal(log.transactionHash, hash); return iface.parseLog(log);
        });
        assert.equal(events.length, 1, 'METAMORPHO_REDEMPTION_EVENT'); const event = events[0]; assert.equal(event.name, 'Redeemed');
        assert.equal(event.args.owner.toLowerCase(), sender); assert.equal(event.args.operationRef, '0x' + ref);
        const shares = BigInt(row.action.amount), assets = event.args.assets;
        assert.equal(event.args.shares, shares); assert.ok(assets >= BigInt(row.action.minimumOutput), 'METAMORPHO_MINIMUM');
        assert.ok(quantity(header.timestamp) <= BigInt(row.action.deadline), 'METAMORPHO_DEADLINE');
        assert.equal(BigInt(before.balances.senderShares) - BigInt(after.balances.senderShares), shares, 'METAMORPHO_EXACT_SHARE_DELTA');
        assert.equal(BigInt(after.balances.senderAssets) - BigInt(before.balances.senderAssets), assets, 'METAMORPHO_EXACT_ASSET_DELTA');
        assert.equal(before.balances.used, false); assert.equal(after.balances.used, true); assert.equal(after.balances.routerShares, before.balances.routerShares);
        assert.equal(BigInt(before.snapshot.totalShares) - BigInt(after.snapshot.totalShares), shares, 'METAMORPHO_SHARE_SUPPLY');
        confirmation = { shares: shares.toString(), assets: assets.toString(), transactionHash: bare(hash), privateSpendable: false }; phase = 'OBSERVED';
      }
    }
    await update(ref, { [kind]: { ...submission, transactionHash: bare(hash), receipt: clone(receipt), confirmation },
      phase, ...(kind === 'execution' ? { execution: { ...submission, transactionHash: bare(hash), receipt: clone(receipt), confirmation } } : {}) });
    return kind === 'execution' && phase === 'OBSERVED';
  }
  async function submit(ref, kind, request, before) {
    const row = find(ref); assert.equal(row[kind], null, 'METAMORPHO_NO_RESEND');
    const submission = { label: 'metamorpho-exit-' + keeper + '-' + kind + '-' + ref, request,
      journalStart: runtime.transactions.length, senderNonce: (await runtime.nonce(sender)).toString(), before,
      transactionHash: null, receipt: null, confirmation: null };
    await update(ref, { [kind]: submission, phase: 'EXECUTION_UNRESOLVED' });
    try { await runtime.send(submission.label, request); }
    catch { await write(data => ({ ...data, sendBlocked: true })); }
    return reconcileSend(ref, kind);
  }
  adapter = Object.freeze({
    observe: () => exclusive(() => observed()),
    validateQuote: intent => exclusive(() => quote(clone(intent))),
    async prepareOnce(intent) { return exclusive(async () => {
      exactRecord(intent, ['reference', 'kind', 'amount', 'minimumOutput', 'deadline']); reference(intent.reference);
      const previous = record.data.operations.find(row => row.reference === intent.reference);
      if (previous) { for (const name of ['kind', 'amount', 'minimumOutput', 'deadline']) assert.equal(previous.action[name], intent[name], 'METAMORPHO_INTENT_REBOUND'); return output(intent.reference); }
      assert.ok(record.data.operations.length < 32, 'METAMORPHO_CAPACITY'); const action = await quote(clone(intent));
      await write(data => ({ ...data, operations: [...data.operations, { reference: intent.reference, action, phase: 'PREPARED', approval: null, execution: null }] }));
      return output(intent.reference);
    }); },
    async requoteUnsubmitted(intent) { return exclusive(async () => {
      exactRecord(intent, ['reference', 'minimumOutput', 'deadline']); const row = find(intent.reference);
      assert.ok(row.phase === 'PREPARED' && !row.approval && !row.execution && !record.data.sendBlocked, 'METAMORPHO_REQUOTE_UNSUBMITTED');
      const action = await quote({ reference: row.reference, kind: 'redeem', amount: row.action.amount, minimumOutput: intent.minimumOutput, deadline: intent.deadline });
      assert.ok((row.quoteHistory?.length ?? 0) < 8, 'METAMORPHO_REQUOTE_CAPACITY');
      await update(row.reference, { action, quoteHistory: [...(row.quoteHistory ?? []), row.action] }); return output(row.reference);
    }); },
    async execute(ref) { return exclusive(async () => {
      let row = find(ref); if (row.execution) return output(ref, await reconcileSend(ref, 'execution'));
      assert.ok(row.phase === 'PREPARED' && !record.data.sendBlocked, 'METAMORPHO_RECONCILE_REQUIRED');
      assert.ok(record.data.operations.every(other => other.reference === ref || other.phase !== 'EXECUTION_UNRESOLVED'), 'METAMORPHO_OTHER_UNRESOLVED');
      const intent = { reference: ref, ...Object.fromEntries(['kind', 'amount', 'minimumOutput', 'deadline'].map(name => [name, row.action[name]])) };
      await quote(intent); let before = await observed('latest', ref);
      if (!row.approval && before.balances.allowance !== row.action.amount) {
        await submit(ref, 'approval', { from: sender, to: vault.address, data: vault.iface.encodeFunctionData('approve', [router, row.action.amount]), gas: '0x1c9c380', value: '0x0' }, before);
        row = find(ref); if (row.phase !== 'PREPARED' || record.data.sendBlocked) return output(ref);
      }
      await quote(intent); before = await observed('latest', ref); assert.equal(before.balances.allowance, row.action.amount, 'METAMORPHO_EXACT_ALLOWANCE');
      const freshObservation = await submit(ref, 'execution', { from: sender, to: router,
        data: iface.encodeFunctionData('redeem', [row.action.amount, row.action.minimumOutput, row.action.deadline, '0x' + ref]), gas: '0x1c9c380', value: '0x0' }, before);
      return output(ref, freshObservation);
    }); },
    async reconcile(ref) { return exclusive(async () => { const row = find(ref);
      const freshObservation = row.execution ? await reconcileSend(ref, 'execution') : row.approval ? await reconcileSend(ref, 'approval') : false;
      return output(ref, freshObservation); }); },
    async reopen() { assert.ok(!busy, 'METAMORPHO_BUSY'); busy = true; try {
      await assertFixture(); const next = await store.read(password);
      assert.deepEqual(next, pending && next.revision === pending.revision ? pending : record, 'METAMORPHO_ORIGINAL_CHECKPOINT');
      record = next; pending = null; poisoned = false;
      return { reopened: true, processRestartSupported: false, references: record.data.operations.map(row => row.reference) };
    } catch (error) { poisoned = true; throw error; } finally { busy = false; } },
    metadata: detached({ profile: 'OWNED_METAMORPHO_EXIT_V1', sourceSHA256: build.sourceSHA256, compiler: build.compiler,
      publicRedemption: true, privateSpendable: false, underlyingAddress: asset.address, vaultAddress: vault.address, routerAddress: router }),
  });
  owned.set(adapter, runtime); bindings.set(adapter, binding); return adapter;
}
