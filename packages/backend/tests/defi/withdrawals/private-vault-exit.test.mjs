/** Host-only manual lifecycle tests. Native/account/vault capabilities and RPC
 * evidence are explicitly mocked before import; the workflow uses its actual
 * encrypted journal and real W39 codec. No node, proof, compiler or send runs. */
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, writeFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Vault as RealVault } from '../../../../engine/src/crypto/vault.mjs';
import { encodeWalletPoolInputs } from '../../../../engine/src/wallet/notes/private-wallet-note-encoding.mjs';
import { encodeFlatTransaction, FLAT_TRANSACTION_METHODS } from '../../../src/execution/encoding/transaction-codec.mjs';
const worlds = new WeakMap(), receipts = new WeakMap();
let failReadback = false;
const pendingReadFailures = new WeakSet();
mock.module('../../../../../omnichain-product/src/vault.mjs', { exports: { Vault: class extends RealVault {
  async read(password) {
    if (pendingReadFailures.delete(this)) throw Error('SYNTHETIC_LOST_DURABLE_READBACK');
    return super.read(password);
  }
  async update(...args) {
    const result = await super.update(...args);
    if (failReadback) { failReadback = false; pendingReadFailures.add(this); }
    return result;
  }
} } });
mock.module('../chain-adapters/local-evm-ownership.mjs', { exports: { assertLocalEvm: async runtime => assert.ok(worlds.has(runtime), 'MOCK_OWNED_RUNTIME') } });
mock.module('../ops/deploy-system.mjs', { exports: { assertOwnedFlatSystem: (runtime, system) => assert.equal(worlds.get(runtime)?.system, system, 'MOCK_OWNED_SYSTEM') } });
mock.module('../global-state/flat-account-authority.mjs', { exports: { assertOwnedFlatAccountAuthority(account, expected) {
  const world = worlds.get(expected.runtime); assert.ok(world && world.account === account && world.system === expected.system
    && expected.poolIndex === 1, 'MOCK_OWNED_ACCOUNT');
} } });
mock.module('./owned-backed-vault.mjs', { exports: {
  assertOwnedBackedVault(runtime, vault) { assert.equal(worlds.get(runtime)?.vault, vault, 'MOCK_OWNED_VAULT'); },
  ownedBackedVaultBinding(runtime, vault) { assert.equal(worlds.get(runtime)?.vault, vault); return structuredClone(worlds.get(runtime).binding); },
  assertOwnedBackedVaultReceipt(vault, receipt) { assert.equal(receipts.get(receipt), vault, 'MOCK_ORIGINAL_RECEIPT_REQUIRED'); },
} });
const { createOwnedPrivateVaultExit, assertOwnedPrivateVaultExit } = await import('../../../src/defi/withdrawals/private-vault-exit.mjs');
const h = value => createHash('sha256').update('SYNTHETIC PRIVATE EXIT ' + value).digest('hex');
const address = name => h(name).slice(0, 40), clone = value => structuredClone(value);
const requestId = 'original_share_exit';
async function fixture(options = {}) {
  const scratchDirectory = await mkdtemp(join(tmpdir(), 'lianum-host-only-vault-exit-'));
  const world = { scratchDirectory, sends: 0, preparations: 0, reconciliations: 0, exitReconciliations: 0,
    losePrepareReply: false, loseSendReply: false, blockSend: false, fakeReceipt: false, observationLive: true,
    binding: { identity: { chainId: '31337', genesisHash: h('genesis'), asset: address('asset'), vault: address('vault'),
      assetCodeSHA256: h('asset-code'), vaultCodeSHA256: h('vault-code'), domain: h('domain'), runtimeId: h('runtime') },
    sender: address('owner'), receiver: address('owner') } };
  const asset = { assetId: h('share-asset'), kind: 'ERC20', token: address('vault'), genesis: h('genesis'), chainId: '31337',
    pool: address('pool'), scope: h('scope'), policy: h('policy'), symbol: 'BLTV', decimals: 6 };
  world.statement = { scope: '0x' + asset.scope, policy: '0x' + asset.policy, epoch: '2', root: '0x' + h('root'),
    nullifier: '0x' + h('nullifier'), amount: '100', recipient: '0x' + address('owner') };
  const input = encodeFlatTransaction('withdrawBalance', { proof: 'ab'.repeat(32),
    publicInputs: encodeWalletPoolInputs('withdraw_balance', world.statement) });
  const transactionHash = h('original-tx'), blockHash = h('block'), calldataSHA256 = createHash('sha256').update(Buffer.from(input.slice(2), 'hex')).digest('hex');
  const outcome = { version: 1, state: 'CONFIRMED', disposition: 'APPLIED', outcomeId: h('outcome'), blockHash };
  world.entry = { kind: 'EXIT', ownerOperationRef: h('owner-operation'), request: { requestId, kind: 'EXIT',
    assetId: asset.assetId, ownerOperationRef: h('owner-operation'), bindingSHA256: h('request-binding'), assetBindingSHA256: h('asset-binding') },
    submission: { dispatchLatched: true, transactionHash, calldataSHA256 },
    terminal: { transactionHash, blockHash, blockNumber: '11', calldataSHA256 }, outcome };
  world.transaction = { hash: '0x' + transactionHash, to: '0x' + asset.pool, from: '0x' + address('system'),
    blockHash: '0x' + blockHash, blockNumber: '0xb', input };
  world.receipt = { transactionHash: '0x' + transactionHash, to: '0x' + asset.pool, status: '0x1',
    blockHash: '0x' + blockHash, blockNumber: '0xb' };
  world.runtime = { metadata: { scratchDirectory }, async transaction(hash) { assert.equal(hash, world.transaction.hash); return clone(world.transaction); },
    async receipt() { return world.receipt && clone(world.receipt); }, async checkReceipt() { world.receiptChecks = (world.receiptChecks ?? 0) + 1; } };
  world.system = { sender: '0x' + address('system'), pools: [null, { address: '0x' + asset.pool,
    artifact: { evm: { methodIdentifiers: { 'withdrawBalance(bytes,bytes32[])': FLAT_TRANSACTION_METHODS.withdrawBalance.selector } } } }] };
  world.account = { registry: [asset], config: { accountId: 'original_share_account', journalId: 'original_journal', registry: [asset] },
    async privateStatus() { return { operations: [clone(world.entry)] }; }, authority: {
      async reconcile(request) { assert.deepEqual(request, world.entry.request); world.exitReconciliations++; return clone(world.entry.outcome); },
      async observe({ challenge, request, outcome }) { assert.match(challenge, /^[0-9a-f]{32}$/); return { status: world.observationLive ? 'LIVE' : 'STALE',
        outcomeId: world.entry.outcome.outcomeId, challenge, bindingSHA256: request.bindingSHA256,
        assetBindingSHA256: request.assetBindingSHA256, canonicalOutcomeBlockHash: outcome.blockHash,
        backing: { held: '0', liabilities: '0', deficit: '0' } }; },
    } };
  world.actions = new Map();
  function output(row, fresh = false) {
    const result = { reference: row.reference, action: clone(row.action), phase: row.phase,
      execution: row.phase === 'OBSERVED' ? { confirmation: { shares: row.action.amount, assets: '100' } } : null,
      sendBlocked: world.blockSend };
    if (fresh && row.phase === 'OBSERVED' && !world.fakeReceipt) receipts.set(result, world.vault);
    return result;
  }
  world.vault = {
    async observe() { return { identity: clone(world.binding.identity), balances: { senderShares: '1000' },
      snapshot: { blockNumber: '12', blockHash: h('quote-block'), blockTimestamp: '1000', totalAssets: '1000', totalShares: '1000' } }; },
    async requoteUnsubmitted(intent) {
      const row = world.actions.get(intent.reference); assert.equal(row.phase, 'PREPARED');
      row.action.minimumOutput = intent.minimumOutput; row.action.deadline = intent.deadline;
      if (world.loseRequoteReply) { world.loseRequoteReply = false; throw Error('SYNTHETIC_LOST_REQUOTE_REPLY'); }
      return output(row);
    },
    async prepareOnce(intent) {
      let row = world.actions.get(intent.reference);
      if (row) for (const key of ['kind', 'amount', 'minimumOutput', 'deadline']) assert.equal(row.action[key], intent[key]);
      else { world.preparations++; row = { reference: intent.reference, phase: 'PREPARED', action: { ...clone(intent),
        identity: clone(world.binding.identity), sender: world.binding.sender, owner: world.binding.sender, receiver: world.binding.receiver,
        nonce: h('single-nonce') } }; world.actions.set(intent.reference, row); }
      if (world.losePrepareReply) { world.losePrepareReply = false; throw Error('SYNTHETIC_LOST_PREPARE_REPLY'); }
      return output(row);
    },
    async execute(reference) {
      const row = world.actions.get(reference); assert.ok(row);
      if (row.phase === 'PREPARED') { world.sends++; row.phase = 'OBSERVED'; }
      if (world.loseSendReply) { world.loseSendReply = false; throw Error('SYNTHETIC_LOST_SEND_REPLY'); }
      return output(row, true);
    },
    async reconcile(reference) { world.reconciliations++; const row = world.actions.get(reference); assert.ok(row, 'ORIGINAL_ACTION_MISSING'); return output(row, true); },
    async reopen() { return { reopened: true }; },
  };
  worlds.set(world.runtime, world);
  options.beforeBootstrap?.(world);
  world.bootstrap = { runtime: world.runtime, system: world.system, poolIndex: 1, account: world.account, vault: world.vault };
  if (!options.skipBootstrap) world.service = await createOwnedPrivateVaultExit(world.bootstrap);
  world.prepare = { requestId, minimumOutput: '99', deadline: '1300' };
  return world;
}

test('original share EXIT becomes one manual public redemption with exact units and audit capability', async () => {
  const w = await fixture(); assertOwnedPrivateVaultExit(w.runtime, w.service);
  const ready = await w.service.prepare(w.prepare);
  assert.equal(ready.phase, 'READY_TO_REDEEM'); assert.equal(ready.shares, '100'); assert.equal(w.sends, 0);
  assert.equal(ready.underlyingPrivateSpendable, false); assert.equal(ready.underlyingLocation, 'EXTERNAL_OWNER_ADDRESS');
  const result = await w.service.execute(requestId);
  assert.equal(result.phase, 'REDEEMED'); assert.equal(result.redeemedUnderlying, '100'); assert.equal(w.sends, 1);
  assert.equal(result.observation, 'ORIGINAL_RECONCILIATION'); assert.equal(result.redemptionPublic, true);
  assert.ok(!JSON.stringify(result).includes(w.entry.ownerOperationRef)); assert.ok(!JSON.stringify(result).includes(w.entry.terminal.transactionHash));
  assert.ok(Object.isFrozen(result)); assert.equal((await w.service.snapshot()).operations[0].observation, 'PERSISTED_LAST_OBSERVATION');
  const audit = await w.service.originalReceipt(requestId); assert.equal(receipts.get(audit), w.vault);
});

test('duplicate prepare, execute, coordinator reopening and reconciliation keep one original action and send', async () => {
  const w = await fixture(); const original = await w.service.prepare(w.prepare);
  await w.service.prepare(w.prepare); await w.service.execute(requestId); await w.service.reopen();
  await w.service.execute(requestId); await w.service.reconcile(requestId); await w.service.prepare(w.prepare);
  assert.equal(w.preparations, 1); assert.equal(w.sends, 1); assert.equal(w.actions.size, 1);
  assert.equal((await w.service.snapshot()).operations[0].shares, original.shares);
  await assert.rejects(createOwnedPrivateVaultExit(w.bootstrap), /ALREADY_BOUND/);
});

test('lost preparation acknowledgement rejoins durable key and original nonce, never allocates action two', async () => {
  const w = await fixture(); w.losePrepareReply = true;
  await assert.rejects(w.service.prepare(w.prepare), /LOST_PREPARE_REPLY/);
  assert.equal((await w.service.snapshot()).operations[0].phase, 'BINDING_REDEMPTION');
  await w.service.reopen(); await w.service.prepare(w.prepare); await w.service.execute(requestId);
  assert.equal(w.actions.size, 1); assert.equal(w.preparations, 1); assert.equal(w.sends, 1);
});

test('lost send acknowledgement latches uncertainty until original-only reconcile and never sends twice', async () => {
  const w = await fixture(); await w.service.prepare(w.prepare); w.loseSendReply = true;
  await assert.rejects(w.service.execute(requestId), /LOST_SEND_REPLY/);
  assert.equal((await w.service.snapshot()).operations[0].phase, 'REDEMPTION_UNRESOLVED');
  await assert.rejects(w.service.execute(requestId), /RECONCILE_REQUIRED/); assert.equal(w.sends, 1);
  await w.service.reopen(); assert.equal((await w.service.reconcile(requestId)).phase, 'REDEEMED');
  await w.service.execute(requestId); assert.equal(w.sends, 1);
});

test('caller cannot inject amounts, destinations, receipts, RPCs, callbacks or alternate references', async () => {
  const w = await fixture();
  for (const extra of [{ amount: '1' }, { receiver: address('thief') }, { receipt: w.receipt }, { rpc: 'http://localhost:1' },
    { callback: () => {} }, { reference: h('replacement') }])
    await assert.rejects(w.service.prepare({ ...w.prepare, ...extra }), /EXACT_FIELDS/);
  for (const patch of [{ requestId: requestId + '\n' }, { minimumOutput: '01' }, { deadline: '1300\n' },
    { minimumOutput: '0' }, { deadline: String(1n << 64n) }]) await assert.rejects(w.service.prepare({ ...w.prepare, ...patch }));
  const getter = { ...w.prepare }; Object.defineProperty(getter, 'minimumOutput', { get() { throw Error('UNTRUSTED_GETTER'); }, enumerable: true });
  await assert.rejects(w.service.prepare(getter), /DATA_FIELDS/);
  assert.equal(w.sends, 0); assert.equal(w.preparations, 0);
});

test('confirmed journal text alone, foreign operation, stale backing and changed original identity cannot redeem', async () => {
  for (const mutate of [
    w => { w.entry.kind = 'TOP_UP'; }, w => { w.entry.request.assetId = h('foreign'); },
    w => { w.entry.submission.dispatchLatched = false; }, w => { w.entry.terminal = null; },
    w => { w.entry.outcome.disposition = 'RECOVERED'; }, w => { w.observationLive = false; },
    w => { w.entry.submission.transactionHash = h('replacement'); }, w => { w.receipt.status = '0x0'; },
    w => { w.transaction.to = '0x' + address('otherpool'); }, w => { w.receipt.blockHash = '0x' + h('reorg'); },
    w => { w.transaction.input += '00'; }, w => { w.receipt = null; },
  ]) {
    const w = await fixture(); mutate(w); await assert.rejects(w.service.prepare(w.prepare));
    assert.equal(w.preparations, 0); assert.equal(w.sends, 0);
  }
});

test('real W39 decoder binds original recipient, amount, scope and policy before preparing redemption', async () => {
  for (const patch of [{ recipient: '0x' + address('other') }, { scope: '0x' + h('foreign-scope') },
    { policy: '0x' + h('foreign-policy') }, { amount: '0' }]) {
    const w = await fixture(); const words = encodeWalletPoolInputs('withdraw_balance', { ...w.statement, ...patch });
    w.transaction.input = encodeFlatTransaction('withdrawBalance', { proof: 'ab'.repeat(32), publicInputs: words });
    const hash = createHash('sha256').update(Buffer.from(w.transaction.input.slice(2), 'hex')).digest('hex');
    w.entry.terminal.calldataSHA256 = hash; w.entry.submission.calldataSHA256 = hash;
    await assert.rejects(w.service.prepare(w.prepare)); assert.equal(w.preparations, 0);
  }
});

test('new request alias cannot reuse an already-bound withdrawal or alter committed slippage/deadline', async () => {
  const w = await fixture(); await w.service.prepare(w.prepare);
  await assert.rejects(w.service.prepare({ ...w.prepare, minimumOutput: '98' }), /INTENT_REBOUND/);
  await assert.rejects(w.service.prepare({ ...w.prepare, deadline: '1301' }), /INTENT_REBOUND/);
  w.entry.request.requestId = 'alias_share_exit';
  await assert.rejects(w.service.prepare({ ...w.prepare, requestId: 'alias_share_exit' }), /ALREADY_CONSUMED/);
  assert.equal(w.preparations, 1); assert.equal(w.sends, 0);
});

test('same branded vault and source account are required; copied capabilities and wrong routes fail closed', async () => {
  const w = await fixture();
  await assert.rejects(createOwnedPrivateVaultExit({ ...w.bootstrap, account: { ...w.account } }), /OWNED_ACCOUNT/);
  await assert.rejects(createOwnedPrivateVaultExit({ ...w.bootstrap, vault: { ...w.vault } }), /OWNED_VAULT/);
  await assert.rejects(createOwnedPrivateVaultExit({ ...w.bootstrap, endpoint: 'http://localhost:1' }), /EXACT_FIELDS/);
  for (const mutate of [w => { w.binding.receiver = address('thief'); }, w => { w.account.registry[0].token = address('other'); },
    w => { w.account.registry[0].genesis = h('other'); }]) {
    const x = await fixture({ skipBootstrap: true, beforeBootstrap: mutate }); await assert.rejects(createOwnedPrivateVaultExit(x.bootstrap));
  }
  assert.throws(() => assertOwnedPrivateVaultExit(w.runtime, { ...w.service }), /OWNED_CAPABILITY_REQUIRED/);
});

test('uncertain underlying runtime and unbranded successful receipt do not authorize new sends or completion', async () => {
  const w = await fixture(); w.blockSend = true; await w.service.prepare(w.prepare);
  await assert.rejects(w.service.execute(requestId), /SEND_BLOCKED/); assert.equal(w.sends, 0);
  const x = await fixture(); await x.service.prepare(x.prepare); x.fakeReceipt = true;
  await assert.rejects(x.service.execute(requestId), /ORIGINAL_RECEIPT_REQUIRED/);
  assert.equal((await x.service.snapshot()).operations[0].phase, 'REDEMPTION_UNRESOLVED');
});

test('corrupted encrypted workflow journal blocks mutation; restoring the exact retained bytes allows explicit reopen', async () => {
  const w = await fixture(); await w.service.prepare(w.prepare);
  const directory = (await readdir(w.scratchDirectory)).find(name => name.startsWith('private-vault-exit-'));
  const path = join(w.scratchDirectory, directory, 'operations.vault'), original = await readFile(path);
  await writeFile(path, 'CORRUPTED SYNTHETIC TEST BYTES');
  await assert.rejects(w.service.execute(requestId)); assert.equal(w.sends, 0);
  await assert.rejects(w.service.snapshot(), /STORAGE_UNAVAILABLE/);
  await writeFile(path, original); await w.service.reopen(); await w.service.execute(requestId); assert.equal(w.sends, 1);
});

test('changed original source or action during manual pause is refused before another send', async () => {
  const w = await fixture(); await w.service.prepare(w.prepare); w.observationLive = false;
  await assert.rejects(w.service.execute(requestId), /CURRENT_BACKING_REQUIRED/); assert.equal(w.sends, 0);
  w.observationLive = true; w.actions.values().next().value.action.receiver = address('thief');
  // The owned vault would itself prevent this mutation; the service also
  // independently refuses to credit a substituted returned action.
  await assert.rejects(w.service.execute(requestId), /RECIPIENT/);
  assert.equal((await w.service.snapshot()).operations[0].redeemedUnderlying, null);
});

test('lost durable readback retains the exact pending checkpoint and blocks send until explicit reopen/reconcile', async () => {
  const w = await fixture(); await w.service.prepare(w.prepare); failReadback = true;
  await assert.rejects(w.service.execute(requestId), /LOST_DURABLE_READBACK/); assert.equal(w.sends, 0);
  await assert.rejects(w.service.snapshot(), /STORAGE_UNAVAILABLE/);
  await w.service.reopen(); assert.equal((await w.service.snapshot()).operations[0].phase, 'REDEMPTION_UNRESOLVED');
  assert.equal((await w.service.reconcile(requestId)).phase, 'READY_TO_REDEEM');
  await w.service.execute(requestId); assert.equal(w.sends, 1);
});

test('invalid new quote does not bind an unusable workflow or overwrite a usable original quote', async () => {
  const w = await fixture(); await assert.rejects(w.service.prepare({ ...w.prepare, minimumOutput: '101' }), /MINIMUM_ABOVE_PREVIEW/);
  assert.deepEqual((await w.service.snapshot()).operations, []);
  await w.service.prepare(w.prepare);
  await assert.rejects(w.service.requote({ ...w.prepare, deadline: '999' }), /DEADLINE_WINDOW/);
  assert.equal((await w.service.snapshot()).operations[0].deadline, '1300');
});

test('explicit unsubmitted requote retains source/action identity and survives a lost reply, while submitted action cannot change', async () => {
  const w = await fixture(); await w.service.prepare(w.prepare);
  const reference = [...w.actions.keys()][0], nonce = w.actions.get(reference).action.nonce;
  const newQuote = { ...w.prepare, deadline: '1250', minimumOutput: '98' }; w.loseRequoteReply = true;
  await assert.rejects(w.service.requote(newQuote), /LOST_REQUOTE_REPLY/);
  assert.equal((await w.service.snapshot()).operations[0].phase, 'REQUOTING_REDEMPTION');
  await assert.rejects(w.service.execute(requestId), /RECONCILE_REQUIRED/);
  await w.service.reopen(); await w.service.requote(newQuote); await w.service.requote(newQuote);
  assert.equal(w.actions.get(reference).action.nonce, nonce); assert.equal(w.actions.size, 1);
  await w.service.execute(requestId); assert.equal(w.sends, 1);
  await assert.rejects(w.service.requote({ ...newQuote, minimumOutput: '97' }), /REQUOTE_UNSUBMITTED_ONLY/);
});

test('fresh authority observation must bind challenge, original request/asset/outcome block and solvent backing', async () => {
  for (const patch of [{ challenge: h('replayed-challenge') }, { bindingSHA256: h('wrong-request') },
    { assetBindingSHA256: h('wrong-asset') }, { canonicalOutcomeBlockHash: h('wrong-block') },
    { backing: { held: '0', liabilities: '1', deficit: '1' } }]) {
    const w = await fixture(), observe = w.account.authority.observe;
    w.account.authority.observe = async input => ({ ...await observe(input), ...patch });
    await assert.rejects(w.service.prepare(w.prepare)); assert.equal(w.preparations, 0); assert.equal(w.sends, 0);
  }
});
