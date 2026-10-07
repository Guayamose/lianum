/** Manual application join from an original private-share EXIT to one public
 * vault redemption. No new note/proof, private credit, graph recovery, implicit
 * withdrawal, background execution or replacement runtime is created here. */
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { Vault } from '../../../../engine/src/crypto/vault.mjs';
import { canonical } from '../../../../engine/src/crypto/privacy.mjs';
import { decodeWalletPoolInputs } from '../../../../engine/src/wallet/notes/private-wallet-note-encoding.mjs';
import { decodeFlatOwnerCalldata } from '../../../../custody/src/signing/flat-owner-custody.mjs';
import { exactRecord } from '../../execution/encoding/commitments.mjs';
import { assertLocalEvm } from '../../chains/evm/runtime/local-evm-ownership.mjs';
import { assertOwnedFlatSystem } from '../../operations/deployments/system/deploy-system.mjs';
import { assertOwnedFlatAccountAuthority } from '../../accounts/authority/flat-account-authority.mjs';
import { prepareVaultAction } from '../vaults/backed-vault.mjs';
import { assertOwnedBackedVault, assertOwnedBackedVaultReceipt, ownedBackedVaultBinding } from '../vaults/owned-backed-vault.mjs';
import { isOwnedMetaMorphoVault, assertOwnedMetaMorphoVault, ownedMetaMorphoVaultBinding,
  assertOwnedMetaMorphoReceipt } from '../vaults/owned-metamorpho-vault.mjs';

// Both branches require original private bootstrap capabilities. Official
// MetaMorpho uses its own preview/liquidity checks, never the test vault formula.
const assertVault = (runtime, vault) => isOwnedMetaMorphoVault(vault)
  ? assertOwnedMetaMorphoVault(runtime, vault) : assertOwnedBackedVault(runtime, vault);
const vaultBinding = (runtime, vault) => isOwnedMetaMorphoVault(vault)
  ? ownedMetaMorphoVaultBinding(runtime, vault) : ownedBackedVaultBinding(runtime, vault);
const assertReceipt = (vault, receipt) => isOwnedMetaMorphoVault(vault)
  ? assertOwnedMetaMorphoReceipt(vault, receipt) : assertOwnedBackedVaultReceipt(vault, receipt);

export const PRIVATE_VAULT_EXIT_PROFILE = 'OWNED_PRIVATE_VAULT_EXIT_V1';
const boundAccounts = new WeakSet(), owned = new WeakMap(), bindings = new WeakMap();
const fresh = () => randomBytes(32).toString('hex');
const sha = value => createHash('sha256').update(value).digest('hex');
const copy = value => JSON.parse(canonical(value));
function freeze(value) { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
const detached = value => freeze(copy(value));
function requestId(value) {
  assert.ok(typeof value === 'string' && /^[A-Za-z0-9_-]{8,100}$/.exec(value)?.[0] === value, 'PRIVATE_VAULT_EXIT_REQUEST_ID');
  return value;
}
function uint(value, bits = 128) {
  assert.ok(typeof value === 'string' && value.length <= 78 && /^(0|[1-9][0-9]*)$/.exec(value)?.[0] === value,
    'PRIVATE_VAULT_EXIT_UINT');
  const number = BigInt(value); assert.ok(number > 0n && number < 1n << BigInt(bits), 'PRIVATE_VAULT_EXIT_UINT_RANGE');
  return number;
}
export function assertOwnedPrivateVaultExit(runtime, service) {
  assert.ok(owned.has(service) && owned.get(service) === runtime, 'PRIVATE_VAULT_EXIT_OWNED_CAPABILITY_REQUIRED');
}

/** PRIVATE capability metadata. Original object identity is retained; neither
 * strings, copied capabilities nor an alleged receipt can establish membership. */
export function ownedPrivateVaultExitBinding(runtime, service) {
  assertOwnedPrivateVaultExit(runtime, service);
  const binding = bindings.get(service);
  assertOwnedFlatSystem(runtime, binding.system);
  assertOwnedFlatAccountAuthority(binding.account, { runtime, system: binding.system, poolIndex: binding.poolIndex });
  assertVault(runtime, binding.vault);
  return binding;
}

/** PRIVATE bootstrap with the actual share-account authority and same original
 * vault keeper. One join per account prevents two independent workflow journals
 * from claiming the same exit. This is surviving-keeper recovery only. */
export async function createOwnedPrivateVaultExit(input) {
  assert.equal(arguments.length, 1, 'PRIVATE_VAULT_EXIT_BOOTSTRAP_ARGUMENTS');
  exactRecord(input, ['runtime', 'system', 'poolIndex', 'account', 'vault']);
  const { runtime, system, poolIndex, account, vault } = input;
  assert.ok(poolIndex === 0 || poolIndex === 1, 'PRIVATE_VAULT_EXIT_POOL');
  assertOwnedFlatSystem(runtime, system);
  assertOwnedFlatAccountAuthority(account, { runtime, system, poolIndex });
  assertVault(runtime, vault); await assertLocalEvm(runtime);
  const binding = vaultBinding(runtime, vault), asset = account.registry[0], pool = system.pools[poolIndex];
  assert.equal(account.registry.length, 1, 'PRIVATE_VAULT_EXIT_SINGLE_ASSET');
  assert.equal(asset.kind, 'ERC20', 'PRIVATE_VAULT_EXIT_SHARE_ASSET');
  assert.equal(asset.token, binding.identity.vault, 'PRIVATE_VAULT_EXIT_SHARE_ASSET');
  assert.equal(asset.genesis, binding.identity.genesisHash, 'PRIVATE_VAULT_EXIT_GENESIS');
  assert.equal(asset.chainId, binding.identity.chainId, 'PRIVATE_VAULT_EXIT_CHAIN');
  assert.equal('0x' + asset.pool, pool.address, 'PRIVATE_VAULT_EXIT_POOL');
  // This bounded manual route returns underlying to the same original exit
  // recipient. A third-party beneficiary is not inferred from bootstrap data.
  assert.equal(binding.sender, binding.receiver, 'PRIVATE_VAULT_EXIT_SAME_RECIPIENT_REQUIRED');
  assert.ok(!boundAccounts.has(account), 'PRIVATE_VAULT_EXIT_ALREADY_BOUND'); boundAccounts.add(account);
  const directory = await mkdtemp(join(runtime.metadata.scratchDirectory, 'private-vault-exit-'));
  const store = new Vault(join(directory, 'operations.vault')), password = fresh();
  const identity = { profile: PRIVATE_VAULT_EXIT_PROFILE, account: account.config, binding, poolIndex };
  let record = await store.create({ identity, operations: [] }, password), pending = null, poisoned = false, busy = false;
  assert.deepEqual(await store.read(password), record, 'PRIVATE_VAULT_EXIT_INITIAL_READBACK');
  async function healthy() {
    assert.ok(!poisoned, 'PRIVATE_VAULT_EXIT_STORAGE_UNAVAILABLE');
    assertOwnedFlatSystem(runtime, system); assertOwnedFlatAccountAuthority(account, { runtime, system, poolIndex });
    assertVault(runtime, vault); await assertLocalEvm(runtime);
    try { assert.deepEqual(await store.read(password), record, 'PRIVATE_VAULT_EXIT_STORAGE_CHANGED'); }
    catch (error) { poisoned = true; throw error; }
  }
  async function exclusive(work) {
    assert.ok(!busy, 'PRIVATE_VAULT_EXIT_BUSY'); busy = true;
    try { await healthy(); return await work(); } finally { busy = false; }
  }
  async function write(transform) {
    try {
      await healthy(); pending = { revision: record.revision + 1, data: copy(transform(copy(record.data))) };
      const next = await store.update(password, record.revision, data => {
        assert.deepEqual(data, record.data, 'PRIVATE_VAULT_EXIT_ORIGINAL_JOURNAL_REQUIRED'); return pending.data;
      });
      assert.deepEqual(next, pending, 'PRIVATE_VAULT_EXIT_WRITE_CHANGED');
      assert.deepEqual(await store.read(password), next, 'PRIVATE_VAULT_EXIT_DURABLE_READBACK'); record = next; pending = null;
    } catch (error) { poisoned = true; throw error; }
  }
  const find = id => { const row = record.data.operations.find(row => row.exit.requestId === requestId(id));
    assert.ok(row, 'PRIVATE_VAULT_EXIT_ORIGINAL_PREPARATION_REQUIRED'); return row; };
  const update = (id, changes) => write(data => ({ ...data, operations: data.operations.map(row =>
    row.exit.requestId === id ? { ...row, ...copy(changes) } : row) }));

  async function originalExit(id) {
    // The caller supplies only an existing account request ID. It cannot supply
    // an alleged receipt, amount, nullifier, destination or execution callback.
    const status = await account.privateStatus();
    const entries = status.operations.filter(row => row.request?.requestId === id);
    assert.equal(entries.length, 1, 'PRIVATE_VAULT_EXIT_ORIGINAL_ACCOUNT_REQUEST');
    const entry = entries[0], request = entry.request;
    assert.equal(entry.kind, 'EXIT', 'PRIVATE_VAULT_EXIT_WITHDRAWAL_REQUIRED');
    assert.equal(request.kind, 'EXIT', 'PRIVATE_VAULT_EXIT_WITHDRAWAL_REQUIRED');
    assert.equal(request.assetId, asset.assetId, 'PRIVATE_VAULT_EXIT_SHARE_ASSET');
    assert.equal(request.ownerOperationRef, entry.ownerOperationRef, 'PRIVATE_VAULT_EXIT_ORIGINAL_REFERENCE');
    assert.ok(entry.submission?.dispatchLatched && entry.terminal && entry.outcome, 'PRIVATE_VAULT_EXIT_NOT_CONFIRMED');
    const outcome = await account.authority.reconcile(request);
    assert.deepEqual(outcome, entry.outcome, 'PRIVATE_VAULT_EXIT_OUTCOME_CHANGED');
    assert.equal(outcome.state, 'CONFIRMED', 'PRIVATE_VAULT_EXIT_NOT_CONFIRMED');
    assert.equal(outcome.disposition, 'APPLIED', 'PRIVATE_VAULT_EXIT_WITHDRAWAL_REQUIRED');
    const challenge = randomBytes(16).toString('hex'), observation = await account.authority.observe({ request, outcome, challenge });
    assert.equal(observation.status, 'LIVE', 'PRIVATE_VAULT_EXIT_CURRENT_BACKING_REQUIRED');
    assert.equal(observation.challenge, challenge, 'PRIVATE_VAULT_EXIT_CURRENT_BACKING_REQUIRED');
    assert.equal(observation.bindingSHA256, request.bindingSHA256, 'PRIVATE_VAULT_EXIT_ORIGINAL_REFERENCE');
    assert.equal(observation.assetBindingSHA256, request.assetBindingSHA256, 'PRIVATE_VAULT_EXIT_SHARE_ASSET');
    assert.equal(observation.canonicalOutcomeBlockHash, outcome.blockHash, 'PRIVATE_VAULT_EXIT_ORIGINAL_BLOCK');
    assert.equal(observation.outcomeId, outcome.outcomeId, 'PRIVATE_VAULT_EXIT_OUTCOME_CHANGED');
    assert.equal(observation.backing.deficit, '0', 'PRIVATE_VAULT_EXIT_CURRENT_BACKING_REQUIRED');
    assert.ok(BigInt(observation.backing.held) >= BigInt(observation.backing.liabilities), 'PRIVATE_VAULT_EXIT_CURRENT_BACKING_REQUIRED');
    const terminal = entry.terminal, hash = '0x' + terminal.transactionHash;
    assert.equal(entry.submission.transactionHash, terminal.transactionHash, 'PRIVATE_VAULT_EXIT_ORIGINAL_TRANSACTION');
    assert.equal(entry.submission.calldataSHA256, terminal.calldataSHA256, 'PRIVATE_VAULT_EXIT_ORIGINAL_CALLDATA');
    const transaction = await runtime.transaction(hash), receipt = await runtime.receipt(hash);
    assert.ok(transaction && receipt, 'PRIVATE_VAULT_EXIT_ORIGINAL_TRANSACTION');
    assert.equal(transaction.hash, hash); assert.equal(receipt.transactionHash, hash);
    assert.equal(transaction.to, pool.address, 'PRIVATE_VAULT_EXIT_POOL');
    assert.equal(receipt.to, pool.address, 'PRIVATE_VAULT_EXIT_POOL');
    assert.equal(transaction.from, system.sender, 'PRIVATE_VAULT_EXIT_SENDER');
    assert.equal(receipt.status, '0x1', 'PRIVATE_VAULT_EXIT_NOT_CONFIRMED');
    assert.equal(transaction.blockHash, '0x' + terminal.blockHash, 'PRIVATE_VAULT_EXIT_ORIGINAL_BLOCK');
    assert.equal(receipt.blockHash, transaction.blockHash, 'PRIVATE_VAULT_EXIT_ORIGINAL_BLOCK');
    assert.equal(BigInt(receipt.blockNumber).toString(), terminal.blockNumber, 'PRIVATE_VAULT_EXIT_ORIGINAL_BLOCK');
    assert.equal(sha(Buffer.from(transaction.input.slice(2), 'hex')), terminal.calldataSHA256, 'PRIVATE_VAULT_EXIT_ORIGINAL_CALLDATA');
    const decoded = decodeFlatOwnerCalldata(pool.artifact, transaction.input);
    assert.equal(decoded.kind, 'withdrawal', 'PRIVATE_VAULT_EXIT_WITHDRAWAL_REQUIRED');
    const statement = decodeWalletPoolInputs('withdraw_balance', decoded.publicInputs);
    assert.equal(statement.scope, '0x' + asset.scope, 'PRIVATE_VAULT_EXIT_SCOPE');
    assert.equal(statement.policy, '0x' + asset.policy, 'PRIVATE_VAULT_EXIT_POLICY');
    assert.equal(statement.recipient, '0x' + binding.sender, 'PRIVATE_VAULT_EXIT_RECIPIENT');
    uint(statement.amount);
    await runtime.checkReceipt(receipt);
    return detached({ requestId: id, ownerOperationRef: entry.ownerOperationRef, assetId: asset.assetId,
      transactionHash: terminal.transactionHash, calldataSHA256: terminal.calldataSHA256, blockHash: terminal.blockHash,
      blockNumber: terminal.blockNumber, nullifier: statement.nullifier.slice(2), shares: statement.amount,
      recipient: binding.sender });
  }
  async function validateNewQuote(exit, intent) {
    const observed = await vault.observe();
    assert.deepEqual(observed.identity, binding.identity, 'PRIVATE_VAULT_EXIT_REDEMPTION_REBOUND');
    assert.ok(BigInt(observed.balances.senderShares) >= BigInt(exit.shares), 'PRIVATE_VAULT_EXIT_EXTERNAL_SHARES_UNAVAILABLE');
    // Validation only: no nonce is consumed, no intent is recorded or signed.
    if (isOwnedMetaMorphoVault(vault)) {
      await vault.validateQuote(intent);
      return;
    }
    prepareVaultAction({ identity: binding.identity, kind: 'redeem', sender: binding.sender,
      owner: binding.sender, receiver: binding.sender, amount: exit.shares, minimumOutput: intent.minimumOutput,
      deadline: intent.deadline, nonce: intent.reference, quote: observed.snapshot });
  }
  function view(row, freshObservation = false) {
    return detached({ version: 1, profile: PRIVATE_VAULT_EXIT_PROFILE, requestId: row.exit.requestId,
      shareAssetId: asset.assetId, underlyingToken: binding.identity.asset, phase: row.phase,
      shares: row.exit.shares, minimumUnderlying: row.intent.minimumOutput,
      redeemedUnderlying: row.redeemedUnderlying, deadline: row.intent.deadline,
      observation: freshObservation ? 'ORIGINAL_RECONCILIATION' : 'PERSISTED_LAST_OBSERVATION',
      underlyingLocation: 'EXTERNAL_OWNER_ADDRESS', underlyingPrivateSpendable: false,
      redemptionPublic: true, sendBlocked: row.sendBlocked,
      assurance: 'TRUSTED_OWNED_LOCAL_RPC_AND_ORIGINAL_ACCOUNT_EXIT', keeperRestart: false });
  }
  function checkAction(row, result) {
    assert.equal(result.reference, row.intent.reference, 'PRIVATE_VAULT_EXIT_REDEMPTION_REBOUND');
    assert.deepEqual(result.action.identity, binding.identity, 'PRIVATE_VAULT_EXIT_REDEMPTION_REBOUND');
    for (const key of ['kind', 'amount', 'minimumOutput', 'deadline'])
      assert.equal(result.action[key], row.intent[key], 'PRIVATE_VAULT_EXIT_REDEMPTION_REBOUND');
    for (const key of ['sender', 'owner', 'receiver']) assert.equal(result.action[key], binding.sender, 'PRIVATE_VAULT_EXIT_RECIPIENT');
  }
  async function accept(id, result) {
    const row = find(id); checkAction(row, result);
    const phase = ({ PREPARED: 'READY_TO_REDEEM', OBSERVED: 'REDEEMED', REVERTED: 'REVERTED',
      EXECUTION_UNRESOLVED: 'REDEMPTION_UNRESOLVED' })[result.phase];
    assert.ok(phase, 'PRIVATE_VAULT_EXIT_REDEMPTION_PHASE');
    let redeemedUnderlying = null;
    if (phase === 'REDEEMED') {
      assertReceipt(vault, result);
      assert.equal(result.execution.confirmation.shares, row.exit.shares, 'PRIVATE_VAULT_EXIT_REDEEMED_SHARES');
      redeemedUnderlying = result.execution.confirmation.assets;
      assert.ok(uint(redeemedUnderlying) >= BigInt(row.intent.minimumOutput), 'PRIVATE_VAULT_EXIT_MINIMUM');
    }
    await update(id, { phase, redeemedUnderlying, sendBlocked: result.sendBlocked });
    return view(find(id), true);
  }
  async function reconcile(id) {
    const row = find(id); assert.deepEqual(await originalExit(id), row.exit, 'PRIVATE_VAULT_EXIT_SOURCE_CHANGED');
    return accept(id, await vault.reconcile(row.intent.reference));
  }
  const service = Object.freeze({
    async prepare(input) {
      assert.equal(arguments.length, 1); exactRecord(input, ['requestId', 'minimumOutput', 'deadline']);
      const intent = copy(input); requestId(intent.requestId); uint(intent.minimumOutput); uint(intent.deadline, 64);
      return exclusive(async () => {
        const exit = await originalExit(intent.requestId);
        let row = record.data.operations.find(row => row.exit.requestId === intent.requestId);
        if (row) {
          assert.deepEqual(row.exit, exit, 'PRIVATE_VAULT_EXIT_SOURCE_CHANGED');
          for (const key of ['minimumOutput', 'deadline']) assert.equal(row.intent[key], intent[key], 'PRIVATE_VAULT_EXIT_INTENT_REBOUND');
          if (row.phase !== 'BINDING_REDEMPTION') return view(row);
        } else {
          assert.ok(record.data.operations.length < 32, 'PRIVATE_VAULT_EXIT_CAPACITY');
          assert.ok(!record.data.operations.some(row => row.exit.nullifier === exit.nullifier
            || row.exit.transactionHash === exit.transactionHash), 'PRIVATE_VAULT_EXIT_ALREADY_CONSUMED');
          const reference = sha(canonical({ profile: PRIVATE_VAULT_EXIT_PROFILE, account: account.config,
            assetId: asset.assetId, nullifier: exit.nullifier, transactionHash: exit.transactionHash }));
          row = { exit, intent: { reference, kind: 'redeem', amount: exit.shares,
            minimumOutput: intent.minimumOutput, deadline: intent.deadline }, phase: 'BINDING_REDEMPTION',
          redeemedUnderlying: null, sendBlocked: false };
          await validateNewQuote(exit, row.intent);
          // Commit the exact original exit and idempotency key before the vault
          // keeper chooses its action nonce. A lost reply never creates key #2.
          await write(data => ({ ...data, operations: [...data.operations, row] }));
        }
        const prepared = await vault.prepareOnce(row.intent); checkAction(row, prepared);
        assert.equal(prepared.phase, 'PREPARED', 'PRIVATE_VAULT_EXIT_UNEXPECTED_PREPARATION');
        return accept(intent.requestId, prepared);
      });
    },
    /** New slippage/deadline is a separate explicit manual choice, allowed
     * only while the original vault action has never been submitted. */
    async requote(input) {
      assert.equal(arguments.length, 1); exactRecord(input, ['requestId', 'minimumOutput', 'deadline']);
      const intent = copy(input); requestId(intent.requestId); uint(intent.minimumOutput); uint(intent.deadline, 64);
      return exclusive(async () => {
        let row = find(intent.requestId);
        assert.deepEqual(await originalExit(intent.requestId), row.exit, 'PRIVATE_VAULT_EXIT_SOURCE_CHANGED');
        assert.ok(['READY_TO_REDEEM', 'REQUOTING_REDEMPTION'].includes(row.phase), 'PRIVATE_VAULT_EXIT_REQUOTE_UNSUBMITTED_ONLY');
        if (row.phase === 'REQUOTING_REDEMPTION') {
          for (const key of ['minimumOutput', 'deadline'])
            assert.equal(row.intent[key], intent[key], 'PRIVATE_VAULT_EXIT_INTENT_REBOUND');
        } else {
          const original = await vault.reconcile(row.intent.reference); checkAction(row, original);
          assert.equal(original.phase, 'PREPARED', 'PRIVATE_VAULT_EXIT_REQUOTE_UNSUBMITTED_ONLY');
          if (row.intent.minimumOutput === intent.minimumOutput && row.intent.deadline === intent.deadline) return view(row);
          await validateNewQuote(row.exit, { ...row.intent, minimumOutput: intent.minimumOutput, deadline: intent.deadline });
          assert.ok((row.intentHistory?.length ?? 0) < 8, 'PRIVATE_VAULT_EXIT_REQUOTE_CAPACITY');
          await update(intent.requestId, { phase: 'REQUOTING_REDEMPTION',
            intent: { ...row.intent, minimumOutput: intent.minimumOutput, deadline: intent.deadline },
            intentHistory: [...(row.intentHistory ?? []), row.intent] });
          row = find(intent.requestId);
        }
        const result = await vault.requoteUnsubmitted({ reference: row.intent.reference,
          minimumOutput: row.intent.minimumOutput, deadline: row.intent.deadline });
        return accept(intent.requestId, result);
      });
    },
    async execute(id) {
      assert.equal(arguments.length, 1); requestId(id);
      return exclusive(async () => {
        const row = find(id); assert.deepEqual(await originalExit(id), row.exit, 'PRIVATE_VAULT_EXIT_SOURCE_CHANGED');
        if (['REDEEMED', 'REVERTED'].includes(row.phase)) return reconcile(id);
        assert.equal(row.phase, 'READY_TO_REDEEM', 'PRIVATE_VAULT_EXIT_RECONCILE_REQUIRED');
        assert.equal(row.sendBlocked, false, 'PRIVATE_VAULT_EXIT_SEND_BLOCKED');
        await update(id, { phase: 'REDEMPTION_UNRESOLVED' });
        return accept(id, await vault.execute(row.intent.reference));
      });
    },
    async reconcile(id) {
      assert.equal(arguments.length, 1); requestId(id); return exclusive(() => reconcile(id));
    },
    async snapshot() {
      assert.equal(arguments.length, 0);
      return exclusive(async () => detached({ version: 1, profile: PRIVATE_VAULT_EXIT_PROFILE,
        operations: record.data.operations.map(row => view(row)) }));
    },
    /** Private audit capability, deliberately separate from the UI projection. */
    async originalReceipt(id) {
      assert.equal(arguments.length, 1); requestId(id);
      return exclusive(async () => { await reconcile(id); const row = find(id);
        assert.equal(row.phase, 'REDEEMED', 'PRIVATE_VAULT_EXIT_REDEMPTION_NOT_CONFIRMED');
        const result = await vault.reconcile(row.intent.reference); checkAction(row, result);
        assertReceipt(vault, result); return result; });
    },
    async reopen() {
      assert.equal(arguments.length, 0); assert.ok(!busy, 'PRIVATE_VAULT_EXIT_BUSY'); busy = true;
      try {
        assertOwnedFlatAccountAuthority(account, { runtime, system, poolIndex });
        assertVault(runtime, vault); await assertLocalEvm(runtime);
        const next = await store.read(password);
        // Only the exact acknowledged record or its retained pending write is
        // admissible. A later revision is not blanket permission to adopt it.
        if (pending && next.revision === pending.revision)
          assert.deepEqual(next, pending, 'PRIVATE_VAULT_EXIT_ORIGINAL_JOURNAL_REQUIRED');
        else assert.deepEqual(next, record, 'PRIVATE_VAULT_EXIT_ORIGINAL_JOURNAL_REQUIRED');
        await vault.reopen(); record = next; pending = null; poisoned = false;
        return detached({ reopened: true, originalIdentitiesRetained: true, keeperRestart: false,
          requestIds: record.data.operations.map(row => row.exit.requestId) });
      } catch (error) { poisoned = true; throw error; } finally { busy = false; }
    },
  });
  bindings.set(service, Object.freeze({ runtime, system, poolIndex, account, vault,
    shareAssetId: asset.assetId, binding: detached(binding) }));
  owned.set(service, runtime); return service;
}
