/** Host-only manual lifecycle tests. Native/account/vault capabilities and RPC
 * evidence are explicitly mocked before import; the workflow uses its actual
 * encrypted journal and real W39 codec. No node, proof, compiler or send runs. */
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, writeFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Vault as RealVault } from '@lianum/engine/crypto/vault';
import { encodeWalletPoolInputs } from '@lianum/engine/wallet/notes/private-wallet-note-encoding';
import { encodeFlatTransaction, FLAT_TRANSACTION_METHODS } from '../../../src/execution/encoding/transaction-codec.mjs';
const worlds = new WeakMap(), receipts = new WeakMap();
const metamorphoWorlds = new WeakMap(),nativeOutputs=new WeakMap();
const retainedParts=new Map(),exitReopenTokens=new WeakMap();
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
mock.module('./owned-metamorpho-vault.mjs', { exports: {
  isOwnedOfficialStaticVaultV1: vault => metamorphoWorlds.has(vault),
  isOwnedMetaMorphoVault: vault => metamorphoWorlds.has(vault),
  assertOwnedMetaMorphoVault(runtime, vault) { assert.equal(metamorphoWorlds.get(vault)?.runtime, runtime, 'MOCK_ORIGINAL_METAMORPHO'); },
  ownedMetaMorphoVaultBinding(runtime, vault) { assert.equal(metamorphoWorlds.get(vault)?.runtime, runtime); return clone(metamorphoWorlds.get(vault).binding); },
  assertOwnedMetaMorphoReceipt(vault, receipt) { assert.equal(receipts.get(receipt), vault, 'MOCK_ORIGINAL_METAMORPHO_RECEIPT'); },
  readOriginalOfficialVaultNativeCostsV1(vault,result){const value=nativeOutputs.get(result);assert.ok(metamorphoWorlds.has(vault)&&value?.vault===vault,'HOST_ORIGINAL_NATIVE_COSTS');return structuredClone(value.costs);},
} });
mock.module('../native-claims/wrapped-private-lifetime-registry-v1.mjs',{exports:{
 async retainWrappedPrivateLifetimeIndexedPartV1(runtime,family,identity,privateState){assert.equal(family,'wallet-vault-exit');const handle={};retainedParts.set(handle,{runtime,identity:clone(identity),privateState:clone(privateState)});return handle;},
 async readWrappedPrivateLifetimeIndexedPartV1(runtime,family,identity){assert.equal(family,'wallet-vault-exit');const entries=[...retainedParts].filter(([,row])=>row.runtime===runtime&&JSON.stringify(row.identity)===JSON.stringify(identity));assert.equal(entries.length,1);return {handle:entries[0][0],privateState:clone(entries[0][1].privateState)};},
 async updateWrappedPrivateLifetimePartV1(handle,privateState){const row=retainedParts.get(handle);assert.ok(row);row.privateState=clone(privateState);},
 assertWrappedPrivateLifetimePartSealedV1:handle=>assert.ok(retainedParts.has(handle)),
}});
mock.module('../global-state/external-defi-catalogue-recovery-v1.mjs',{exports:{
 consumeExternalDefiPrivateVaultExitReopenV1(token){const row=exitReopenTokens.get(token);assert.ok(row&&!row.used,'HOST_ORIGINAL_EXIT_TOKEN');row.used=true;return row.value;},
}});
const { createOwnedPrivateVaultExit, assertOwnedPrivateVaultExit,createRetainedOwnedPrivateVaultExitV1,captureRetainedOwnedPrivateVaultExitV1,reopenRetainedOwnedPrivateVaultExitV1 } = await import('../../../src/defi/withdrawals/private-vault-exit.mjs');
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
    blockHash: '0x' + blockHash, blockNumber: '0xb', input,gas:'0x1c9c380',gasPrice:'0x3b9aca00',value:'0x0' };
  world.receipt = { transactionHash: '0x' + transactionHash, to: '0x' + asset.pool, status: '0x1',
    blockHash: '0x' + blockHash, blockNumber: '0xb',gasUsed:'0x5208',effectiveGasPrice:'0x3b9aca00' };
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
    const charge=kind=>({profile:'ORIGINAL_EVM_EXIT_NATIVE_GAS_V1',status:'OBSERVED',transactionHash:h('gas-'+kind),
      blockHash:h('gas-block-'+kind),blockNumber:kind==='approval'?'12':'13',payer:world.binding.sender,receiptStatus:'APPLIED',
      gasUsed:'21000',gasPriceWei:'1000000000',nativeGasCostWei:'21000000000000',unit:'NATIVE_WEI',balanceGranted:false});
    nativeOutputs.set(result,{vault:world.vault,costs:{approvalRequired:true,approval:row.phase==='OBSERVED'?charge('approval'):null,
      redemption:row.phase==='OBSERVED'?charge('redemption'):null}});
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
  if (options.metamorpho) {
    metamorphoWorlds.set(world.vault, world);
    world.vault.validateQuote = async intent => {
      world.protocolQuotes = (world.protocolQuotes ?? 0) + 1;
      assert.equal(intent.kind, 'redeem'); assert.equal(intent.amount, world.statement.amount);
      assert.ok(BigInt(intent.minimumOutput) <= 100n, 'METAMORPHO_MINIMUM_ABOVE_PREVIEW');
      assert.ok(BigInt(intent.deadline) > 1000n && BigInt(intent.deadline) <= 1300n, 'METAMORPHO_DEADLINE_WINDOW');
    };
    // Deliberately incompatible with the test vault's conversion formula.
    // A MetaMorpho quote must come from its actual previewRedeem/maxRedeem.
    const observe = world.vault.observe;
    world.vault.observe = async () => ({ ...await observe(), snapshot: { blockNumber: '12', blockHash: h('quote-block'),
      blockTimestamp: '1000', totalAssets: '0', totalShares: '1000000000' } });
  }
  options.beforeBootstrap?.(world);
  world.bootstrap = { runtime: world.runtime, system: world.system, poolIndex: 1, account: world.account, vault: world.vault };
  if (!options.skipBootstrap) world.service = await (options.retained?createRetainedOwnedPrivateVaultExitV1:createOwnedPrivateVaultExit)(world.bootstrap);
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
  for(const charge of result.nativeCosts.charges)assert.deepEqual(Object.keys(charge).sort(),['kind','nativeGasCostWei','receiptStatus','status']);
  for(const hidden of [address('system'),w.entry.terminal.blockHash,w.entry.terminal.calldataSHA256])assert.ok(!JSON.stringify(result).includes(hidden));
  assert.ok(Object.isFrozen(result)); assert.equal((await w.service.snapshot()).operations[0].observation, 'PERSISTED_LAST_OBSERVATION');
  const audit = await w.service.originalReceipt(requestId); assert.equal(receipts.get(audit), w.vault);
});

test('manual keeper confirmed EXIT redeems using the original fresh terminal observation without legacy admission', async () => {
  const w = await fixture();
  let legacyCalls = 0, terminalObservations = 0;
  w.account.authority.reconcile = async () => {
    legacyCalls++; throw Error('FLAT_ACCOUNT_MANUAL_KEEPER_REQUIRED');
  };
  const originalOutcome = clone(w.entry.outcome), observe = w.account.authority.observe;
  w.account.authority.observe = async input => {
    assert.deepEqual(input.request, w.entry.request);
    assert.deepEqual(input.outcome, originalOutcome);
    terminalObservations++;
    return observe(input);
  };
  assert.equal((await w.service.prepare(w.prepare)).phase, 'READY_TO_REDEEM');
  assert.equal((await w.service.execute(requestId)).phase, 'REDEEMED');
  assert.equal((await w.service.reconcile(requestId)).phase, 'REDEEMED');
  assert.equal(legacyCalls, 0); assert.equal(terminalObservations, 3);
  assert.equal(w.preparations, 1); assert.equal(w.sends, 1);
  assert.ok(w.receiptChecks >= 3);
});

test('manual keeper cannot redeem a retained EXIT without fresh canonical original outcome and solvent backing', async () => {
  for (const fault of ['STALE', 'OUTCOME_CHANGED', 'CANONICAL_CHANGED', 'DEFICIT']) {
    const w = await fixture();
    w.account.authority.reconcile = async () => { throw Error('FLAT_ACCOUNT_MANUAL_KEEPER_REQUIRED'); };
    const observe = w.account.authority.observe;
    w.account.authority.observe = async input => {
      const observed = await observe(input);
      if (fault === 'STALE') return { ...observed, status: 'STALE' };
      if (fault === 'OUTCOME_CHANGED') throw Error('FLAT_ACCOUNT_OUTCOME_CHANGED');
      if (fault === 'CANONICAL_CHANGED') return { ...observed, canonicalOutcomeBlockHash: h('changed-canonical') };
      return { ...observed, backing: { held: '0', liabilities: '100', deficit: '100' } };
    };
    await assert.rejects(w.service.prepare(w.prepare));
    assert.equal(w.preparations, 0); assert.equal(w.sends, 0);
    assert.deepEqual((await w.service.snapshot()).operations, []);
  }
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
  for(const retained of [false,true]) {
    const w = await fixture({retained,metamorpho:retained}); await w.service.prepare(w.prepare); failReadback = true;
    await assert.rejects(w.service.execute(requestId), /LOST_DURABLE_READBACK/); assert.equal(w.sends, 0);
    await assert.rejects(w.service.snapshot(), /STORAGE_UNAVAILABLE/);
    const part=retained?[...retainedParts.values()].find(row=>row.runtime===w.runtime):null;
    if(part)assert.notEqual(part.privateState.pending,null);
    await w.service.reopen(); assert.equal((await w.service.snapshot()).operations[0].phase, 'REDEMPTION_UNRESOLVED');
    if(part)assert.equal(part.privateState.pending,null);
    assert.equal((await w.service.reconcile(requestId)).phase, 'READY_TO_REDEEM');
    await w.service.execute(requestId);await w.service.execute(requestId);assert.equal(w.sends, 1);
    if(retained)await captureRetainedOwnedPrivateVaultExitV1(w.service);
  }
  const changed=await fixture({retained:true,metamorpho:true});await changed.service.prepare(changed.prepare);failReadback=true;
  await assert.rejects(changed.service.execute(requestId),/LOST_DURABLE_READBACK/);
  const part=[...retainedParts.values()].find(row=>row.runtime===changed.runtime),credentials=part.privateState.credentials;
  const vault=new RealVault(credentials.path),candidate=await vault.read(credentials.password);
  await vault.update(credentials.password,candidate.revision,data=>data);
  await assert.rejects(changed.service.reopen(),/ORIGINAL_JOURNAL_REQUIRED/);assert.notEqual(part.privateState.pending,null);assert.equal(changed.sends,0);
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

test('official MetaMorpho branch joins the same original private EXIT, uses official quote and reconciles one public redemption', async () => {
  const w = await fixture({ metamorpho: true });
  const prepared = await w.service.prepare(w.prepare);
  assert.equal(prepared.phase, 'READY_TO_REDEEM'); assert.equal(w.protocolQuotes, 1);
  w.loseSendReply = true; await assert.rejects(w.service.execute(requestId), /LOST_SEND_REPLY/);
  await w.service.reopen(); const completed = await w.service.reconcile(requestId);
  assert.equal(completed.phase, 'REDEEMED'); assert.equal(completed.redeemedUnderlying, '100');
  assert.equal(completed.underlyingPrivateSpendable, false);
  await w.service.execute(requestId); assert.equal(w.sends, 1);
  assert.equal(receipts.get(await w.service.originalReceipt(requestId)), w.vault);
  const costs=(await w.service.snapshot()).operations[0].nativeCosts;
  assert.deepEqual(costs.charges.map(value=>value.kind),['W39','APPROVAL','REDEMPTION']);
  assert.equal(costs.totalObservedNativeGasWei,'63000000000000');assert.equal(costs.complete,true);
  assert.equal(costs.currentNativeBalance,null);assert.equal(costs.gasDeductedFromRedeemedUnderlying,false);
  delete w.receipt.gasUsed;
  const unknown=await w.service.reconcile(requestId);assert.equal(unknown.phase,'REDEEMED');assert.equal(w.sends,1);
  assert.equal(unknown.nativeCosts.complete,false);assert.equal(unknown.nativeCosts.charges[0].status,'UNKNOWN');
  assert.equal(unknown.nativeCosts.totalObservedNativeGasWei,'42000000000000');
  w.receipt.gasUsed='0x5208';const known=await w.service.reconcile(requestId);
  assert.equal(known.nativeCosts.complete,true);assert.equal(known.nativeCosts.totalObservedNativeGasWei,'63000000000000');assert.equal(w.sends,1);

});

test('MetaMorpho join refuses stale backing, invalid manual quote and copied receipt without binding or completion', async () => {
  const w = await fixture({ metamorpho: true });
  await assert.rejects(w.service.prepare({ ...w.prepare, minimumOutput: '101' }), /METAMORPHO_MINIMUM/);
  assert.deepEqual((await w.service.snapshot()).operations, []);
  w.observationLive = false; await assert.rejects(w.service.prepare(w.prepare), /CURRENT_BACKING_REQUIRED/);
  assert.equal(w.preparations, 0); w.observationLive = true;
  await w.service.prepare(w.prepare); w.fakeReceipt = true;
  await assert.rejects(w.service.execute(requestId), /ORIGINAL_METAMORPHO_RECEIPT/);
  assert.equal((await w.service.snapshot()).operations[0].redeemedUnderlying, null);
});

function reopenHostExit(w,saved){
 const nextRuntime={...w.runtime},nextAccount={...w.account},previousRuntime=w.runtime;w.runtime=nextRuntime;w.account=nextAccount;worlds.set(nextRuntime,w);
 metamorphoWorlds.set(w.vault,w);for(const row of retainedParts.values())if(row.runtime===previousRuntime)row.runtime=nextRuntime;
 const token=Object.freeze(Object.create(null));exitReopenTokens.set(token,{used:false,value:{input:{runtime:nextRuntime,system:w.system,poolIndex:1,account:nextAccount,vault:w.vault},saved}});return token;
}
test('HOST retained official EXIT reopens a new object after lost reply and reconciles the same operation without another send',async()=>{
 const w=await fixture({metamorpho:true,retained:true});await w.service.prepare(w.prepare);w.loseSendReply=true;await assert.rejects(w.service.execute(requestId),/LOST_SEND_REPLY/);assert.equal(w.sends,1);
 delete w.receipt.gasUsed;
 const saved=await captureRetainedOwnedPrivateVaultExitV1(w.service),token=reopenHostExit(w,saved);await assert.rejects(w.service.execute(requestId),/CLOSED/);
 const privateCharge=saved.record.data.operations[0].nativeCosts.charges[0];assert.equal(privateCharge.transactionHash,w.entry.terminal.transactionHash);assert.equal(privateCharge.payer,address('system'));
 await assert.rejects(reopenRetainedOwnedPrivateVaultExitV1({...token}),/ORIGINAL_EXIT_TOKEN/);const opened=await reopenRetainedOwnedPrivateVaultExitV1(token);assert.notEqual(opened,w.service);
 await assert.rejects(reopenRetainedOwnedPrivateVaultExitV1(token),/ORIGINAL_EXIT_TOKEN/);await assert.rejects(opened.execute(requestId),/RECONCILE_REQUIRED/);
 const reconciled=await opened.reconcile(requestId);assert.equal(reconciled.phase,'REDEEMED');assert.equal(reconciled.redeemedUnderlying,'100');await opened.execute(requestId);assert.equal(w.sends,1);assert.equal(w.preparations,1);
 assert.equal(reconciled.requestId,saved.record.data.operations[0].exit.requestId);assert.equal(reconciled.underlyingPrivateSpendable,false);
 assert.equal(reconciled.nativeCosts.charges[0].status,'UNKNOWN');assert.ok(!JSON.stringify(reconciled).includes(privateCharge.transactionHash));await opened.close();
 const changed=await fixture({metamorpho:true,retained:true});await changed.service.prepare(changed.prepare);
 changed.entry.ownerOperationRef=h('changed-owner-operation');changed.entry.request.ownerOperationRef=changed.entry.ownerOperationRef;
 await assert.rejects(captureRetainedOwnedPrivateVaultExitV1(changed.service),/PRIVATE_VAULT_EXIT_SOURCE_CHANGED/);assert.equal(changed.sends,0);
});
test('HOST retained official EXIT refuses a newer journal revision and an unresolved observation without manufacturing permission',async()=>{
 const w=await fixture({metamorpho:true,retained:true});await w.service.prepare(w.prepare);const saved=await captureRetainedOwnedPrivateVaultExitV1(w.service);const original=await readFile(saved.lifetime.credentials.path);
 await new RealVault(saved.lifetime.credentials.path).update(saved.lifetime.credentials.password,saved.record.revision,data=>data);
 const changed=reopenHostExit(w,saved);await assert.rejects(reopenRetainedOwnedPrivateVaultExitV1(changed));assert.equal(w.sends,0);
 await writeFile(saved.lifetime.credentials.path,original);const token=reopenHostExit(w,saved),opened=await reopenRetainedOwnedPrivateVaultExitV1(token);w.blockSend=true;const state=await opened.reconcile(requestId);assert.equal(state.sendBlocked,true);
 await assert.rejects(opened.execute(requestId),/RECONCILE_REQUIRED/);assert.equal(w.sends,0);await opened.close();
});
