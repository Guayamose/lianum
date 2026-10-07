/** Private bootstrap for the original owned, fake-value EVM only. No runtime
 * startup, deployment, proof, root key, external transport or private credit.
 * Supplied-trace parsers below deliberately cannot mint owned capabilities. */
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { Vault } from '../../../../engine/src/crypto/vault.mjs';
import { canonical } from '../../../../engine/src/crypto/privacy.mjs';
import { LOCAL_EVM_PROFILE } from '../../../../engine/src/execution/local/local-evm.mjs';
import { assertLocalEvm } from '../../chains/evm/runtime/local-evm-ownership.mjs';
import { publicKeccak256 } from '../../../../engine/src/cohorts/private-cohort-public-native.mjs';
import { exactRecord, fixedArray } from '../../execution/encoding/commitments.mjs';
import { validateVaultIdentity, prepareVaultAction, encodeVaultCall, vaultActionCommitment,
  validateVaultReceipt, observeVaultPosition } from './backed-vault.mjs';

export const OWNED_BACKED_VAULT_PROFILE = 'OWNED_BACKED_LOCAL_VAULT_V1';
const owned = new WeakMap(), ownedBindings = new WeakMap(), issued = new WeakMap(), boundSenders = new WeakMap();
const MAX_OPERATIONS = 32;
const ZERO = '0'.repeat(64), fresh = () => randomBytes(32).toString('hex');
const prefix = value => '0x' + value;
const sha = value => createHash('sha256').update(value).digest('hex');
const copy = value => JSON.parse(canonical(value));
function freeze(value) { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
const detached = value => freeze(copy(value));
function hex(value, length = 32, nonzero = true) {
  assert.ok(typeof value === 'string' && value.length === length * 2 && new RegExp(`^[0-9a-f]{${length * 2}}$`).test(value), 'OWNED_VAULT_HEX');
  assert.ok(!nonzero || /[1-9a-f]/.test(value), 'OWNED_VAULT_NONZERO'); return value;
}
function uint(value, bits = 128) {
  assert.ok(typeof value === 'string' && value.length <= 78 && /^(0|[1-9][0-9]*)$/.test(value), 'OWNED_VAULT_UINT');
  const n = BigInt(value); assert.equal(n.toString(), value, 'OWNED_VAULT_CANONICAL_UINT');
  assert.ok(n < (1n << BigInt(bits)), 'OWNED_VAULT_UINT_RANGE'); return n;
}
function quantity(value) {
  assert.ok(typeof value === 'string' && /^0x(0|[1-9a-f][0-9a-f]*)$/.test(value), 'OWNED_VAULT_RPC_QUANTITY');
  assert.ok(value.length <= 66, 'OWNED_VAULT_RPC_QUANTITY_RANGE');
  const n = BigInt(value); assert.equal('0x' + n.toString(16), value, 'OWNED_VAULT_CANONICAL_RPC_QUANTITY'); return n;
}
function bare(value, length = 32, nonzero = true) {
  assert.ok(typeof value === 'string' && value.startsWith('0x'), 'OWNED_VAULT_RPC_HEX');
  return hex(value.slice(2), length, nonzero);
}
const tag = value => '0x' + BigInt(value).toString(16);
const word = value => BigInt(value).toString(16).padStart(64, '0');
const aw = value => hex(value, 20).padStart(64, '0');
const selector = signature => publicKeccak256(Buffer.from(signature)).subarray(0, 4).toString('hex');
const callData = (signature, words = []) => prefix(selector(signature) + words.join(''));
const approvalData = action => selector('approve(address,uint256)') + aw(action.identity.vault) + word(action.amount);
const APPROVAL_TOPIC = publicKeccak256(Buffer.from('Approval(address,address,uint256)')).toString('hex');
const STATE_FIELDS = ['snapshot', 'assetSupply', 'senderAssets', 'receiverAssets', 'senderShares', 'receiverShares', 'allowance', 'usedNonce'];

function state(value, action) {
  exactRecord(value, STATE_FIELDS);
  exactRecord(value.snapshot, ['blockNumber', 'blockHash', 'blockTimestamp', 'totalAssets', 'totalShares']);
  uint(value.snapshot.blockNumber, 64); uint(value.snapshot.blockTimestamp, 64); hex(value.snapshot.blockHash);
  for (const key of ['totalAssets', 'totalShares']) uint(value.snapshot[key]);
  for (const key of ['assetSupply', 'senderAssets', 'receiverAssets', 'senderShares', 'receiverShares']) uint(value[key]);
  assert.ok(uint(value.assetSupply) > 0n, 'OWNED_VAULT_ASSET_SUPPLY'); uint(value.allowance, 256);
  assert.ok(['0', '1'].includes(value.usedNonce), 'OWNED_VAULT_NONCE_STATE');
  assert.ok(BigInt(value.snapshot.totalAssets) <= BigInt(value.assetSupply), 'OWNED_VAULT_ASSET_BACKING');
  for (const key of ['senderAssets', 'receiverAssets']) assert.ok(BigInt(value[key]) <= BigInt(value.assetSupply), 'OWNED_VAULT_ASSET_BALANCE');
  for (const key of ['senderShares', 'receiverShares']) assert.ok(BigInt(value[key]) <= BigInt(value.snapshot.totalShares), 'OWNED_VAULT_SHARE_BALANCE');
  const same = action.sender === action.receiver;
  if (same) {
    assert.equal(value.senderAssets, value.receiverAssets, 'OWNED_VAULT_ALIASED_ASSETS');
    assert.equal(value.senderShares, value.receiverShares, 'OWNED_VAULT_ALIASED_SHARES');
  }
  assert.ok(BigInt(value.senderAssets) + (same ? 0n : BigInt(value.receiverAssets)) + BigInt(value.snapshot.totalAssets)
    <= BigInt(value.assetSupply), 'OWNED_VAULT_KNOWN_ASSET_SUM');
  assert.ok(BigInt(value.senderShares) + (same ? 0n : BigInt(value.receiverShares)) <= BigInt(value.snapshot.totalShares), 'OWNED_VAULT_KNOWN_SHARE_SUM');
  return value;
}
function paired(trace) {
  exactRecord(trace, ['action', 'receipt', 'before', 'after', 'parentHash']);
  encodeVaultCall(trace.action); state(trace.before, trace.action); state(trace.after, trace.action);
  const { before, after, receipt } = trace;
  assert.equal(BigInt(after.snapshot.blockNumber), BigInt(before.snapshot.blockNumber) + 1n, 'OWNED_VAULT_ADJACENT_BLOCKS');
  assert.equal(trace.parentHash, before.snapshot.blockHash, 'OWNED_VAULT_PARENT_HASH');
  assert.equal(after.snapshot.blockNumber, receipt.blockNumber, 'OWNED_VAULT_RECEIPT_HEIGHT');
  assert.equal(after.snapshot.blockHash, receipt.blockHash, 'OWNED_VAULT_RECEIPT_BLOCK');
  assert.equal(after.snapshot.blockTimestamp, receipt.blockTimestamp, 'OWNED_VAULT_RECEIPT_TIME');
  assert.ok(BigInt(after.snapshot.blockTimestamp) > BigInt(before.snapshot.blockTimestamp), 'OWNED_VAULT_TIME_ORDER');
  assert.equal(before.assetSupply, after.assetSupply, 'OWNED_VAULT_FIXED_SUPPLY');
}

/** Read-only synthetic seam. Even a perfectly consistent trace is not owned
 * RPC evidence, inclusion, finality, authorization or private spendability. */
export function inspectBackedVaultTransition(trace) {
  paired(trace);
  const { action, receipt, before, after } = trace, result = validateVaultReceipt(receipt, action);
  const totals = receipt.logs[3].data.match(/.{64}/g).map(part => BigInt('0x' + part).toString());
  assert.equal(before.snapshot.totalAssets, totals[3], 'OWNED_VAULT_BEFORE_ASSETS');
  assert.equal(before.snapshot.totalShares, totals[4], 'OWNED_VAULT_BEFORE_SHARES');
  assert.deepEqual(after.snapshot, result.snapshot, 'OWNED_VAULT_AFTER_TOTALS');
  assert.equal(before.usedNonce, '0', 'OWNED_VAULT_NONCE_ALREADY_USED');
  assert.equal(after.usedNonce, '1', 'OWNED_VAULT_NONCE_NOT_CONSUMED');
  const deposit = action.kind === 'deposit', assets = BigInt(result.assets), shares = BigInt(result.shares);
  for (const [role, address] of [['sender', action.sender], ['receiver', action.receiver]]) {
    const assetDelta = deposit ? (address === action.sender ? -assets : 0n) : (address === action.receiver ? assets : 0n);
    const shareDelta = deposit ? (address === action.receiver ? shares : 0n) : (address === action.owner ? -shares : 0n);
    assert.equal(BigInt(after[role + 'Assets']), BigInt(before[role + 'Assets']) + assetDelta, 'OWNED_VAULT_ASSET_DELTA');
    assert.equal(BigInt(after[role + 'Shares']), BigInt(before[role + 'Shares']) + shareDelta, 'OWNED_VAULT_SHARE_DELTA');
  }
  if (deposit) {
    assert.equal(before.allowance, action.amount, 'OWNED_VAULT_EXACT_ALLOWANCE');
    assert.equal(after.allowance, '0', 'OWNED_VAULT_ALLOWANCE_CONSUMPTION');
  } else assert.equal(after.allowance, before.allowance, 'OWNED_VAULT_REDEEM_ALLOWANCE');
  return detached({ ...result, before, after, assurance: 'supplied-historical-state-consistency-only', privateSpendable: false });
}

/** Exact approval is a separate transaction; never inferred from execute logs. */
export function inspectBackedVaultApproval(trace) {
  paired(trace);
  const { action, receipt, before, after } = trace;
  assert.equal(action.kind, 'deposit', 'OWNED_VAULT_APPROVAL_DEPOSIT_ONLY');
  exactRecord(receipt, ['identity', 'transactionHash', 'blockNumber', 'blockHash', 'blockTimestamp', 'status', 'from', 'to', 'input', 'logs']);
  assert.deepEqual(receipt.identity, action.identity); hex(receipt.transactionHash);
  assert.equal(receipt.status, '1', 'OWNED_VAULT_APPROVAL_REVERTED');
  assert.equal(receipt.from, action.sender); assert.equal(receipt.to, action.identity.asset);
  assert.equal(receipt.input, approvalData(action), 'OWNED_VAULT_APPROVAL_CALLDATA');
  fixedArray(receipt.logs, 1); const log = receipt.logs[0];
  exactRecord(log, ['address', 'topics', 'data', 'logIndex', 'removed']);
  assert.equal(log.address, action.identity.asset); assert.equal(log.removed, false); uint(log.logIndex, 64);
  fixedArray(log.topics, 3);
  assert.deepEqual(log.topics, [APPROVAL_TOPIC, aw(action.sender), aw(action.identity.vault)]);
  assert.equal(log.data, word(action.amount)); assert.equal(after.allowance, action.amount, 'OWNED_VAULT_APPROVAL_AMOUNT');
  for (const key of STATE_FIELDS.filter(key => !['snapshot', 'allowance'].includes(key))) assert.equal(after[key], before[key], 'OWNED_VAULT_APPROVAL_CHANGED_BALANCE');
  for (const key of ['totalAssets', 'totalShares']) assert.equal(after.snapshot[key], before.snapshot[key], 'OWNED_VAULT_APPROVAL_CHANGED_TOTALS');
  assert.equal(before.usedNonce, '0');
  return detached({ transactionHash: receipt.transactionHash, blockHash: receipt.blockHash, blockNumber: receipt.blockNumber,
    amount: action.amount, assurance: 'supplied-historical-state-consistency-only', privateSpendable: false });
}

function pins(input) {
  exactRecord(input, ['identity', 'asset', 'vault', 'assetSupply']);
  const identity = validateVaultIdentity(input.identity); assert.ok(uint(input.assetSupply) > 0n);
  for (const key of ['asset', 'vault']) {
    exactRecord(input[key], ['transactionHash', 'runtimeCode']); hex(input[key].transactionHash);
    const code = input[key].runtimeCode;
    assert.ok(typeof code === 'string' && code.length <= 49154 && code.length % 2 === 0 && /^0x(?:[0-9a-f]{2})+$/.test(code), 'OWNED_VAULT_RUNTIME_CODE');
    assert.equal(sha(Buffer.from(code.slice(2), 'hex')), identity[key + 'CodeSHA256'], 'OWNED_VAULT_CODE_PIN');
  }
  assert.notEqual(input.asset.transactionHash, input.vault.transactionHash);
  return detached(input);
}

export function assertOwnedBackedVault(runtime, adapter) {
  assert.equal(owned.get(adapter), runtime, 'OWNED_VAULT_CAPABILITY_REQUIRED');
  assert.ok(owned.has(adapter), 'OWNED_VAULT_CAPABILITY_REQUIRED');
}
/** Private capability-bound routing metadata, not a balance or receipt. */
export function ownedBackedVaultBinding(runtime, adapter) {
  assertOwnedBackedVault(runtime, adapter); return detached(ownedBindings.get(adapter));
}
/** Capability provenance only. Reconcile again for fresh canonical observation. */
export function assertOwnedBackedVaultReceipt(adapter, observation) {
  assert.ok(owned.has(adapter) && issued.get(observation) === adapter, 'OWNED_VAULT_RECEIPT_CAPABILITY_REQUIRED');
}

/** Private bootstrap input, never an HTTP/account operation input. The caller
 * supplies independently pinned runtime bytes for the named fixture sources.
 * Only this constructor can bind the actual original deployment journal. */
export async function createOwnedBackedVault(input) {
  assert.equal(arguments.length, 1, 'OWNED_VAULT_BOOTSTRAP_ARGUMENTS');
  exactRecord(input, ['runtime', 'deployment', 'sender', 'receiver']);
  const runtime = input.runtime, deployment = pins(input.deployment), id = deployment.identity;
  const sender = hex(input.sender, 20), receiver = hex(input.receiver, 20);
  for (const address of [sender, receiver]) assert.ok(address !== id.asset && address !== id.vault, 'OWNED_VAULT_PARTICIPANT');
  await assertLocalEvm(runtime);
  assert.equal(runtime.metadata.chainId, id.chainId); assert.equal(bare(runtime.metadata.evmGenesis), id.genesisHash);
  assert.ok(runtime.accounts.includes(prefix(sender)), 'OWNED_VAULT_OWNED_SENDER');
  // One keeper per owned runtime/sender/vault prevents cross-keeper approval
  // races and lost passwords. A failed bootstrap stays claimed and fails closed.
  let bindings = boundSenders.get(runtime); if (!bindings) { bindings = new Set(); boundSenders.set(runtime, bindings); }
  const binding = id.vault + sender; assert.ok(!bindings.has(binding), 'OWNED_VAULT_ALREADY_BOUND'); bindings.add(binding);
  for (const key of ['asset', 'vault']) {
    const hash = prefix(deployment[key].transactionHash);
    const entries = runtime.transactions.filter(entry => entry.transactionHash === hash);
    assert.equal(entries.length, 1, 'OWNED_VAULT_ORIGINAL_DEPLOYMENT');
    assert.equal(entries[0].request.to, undefined, 'OWNED_VAULT_CREATE_DEPLOYMENT');
    const [transaction, receipt] = await Promise.all([runtime.transaction(hash), runtime.receipt(hash)]);
    assert.ok(transaction && receipt, 'OWNED_VAULT_DEPLOYMENT_RECEIPT');
    assert.equal(receipt.status, '0x1'); assert.equal(receipt.contractAddress, prefix(id[key]));
    assert.equal(transaction.to, null); assert.equal(transaction.from, entries[0].request.from);
    assert.equal(transaction.input, entries[0].request.data); assert.equal(quantity(transaction.nonce), quantity(entries[0].senderNonce));
    assert.equal(transaction.blockHash, receipt.blockHash); assert.equal(transaction.blockNumber, receipt.blockNumber);
    assert.equal(await runtime.code(prefix(id[key]), receipt.blockNumber), deployment[key].runtimeCode, 'OWNED_VAULT_DEPLOYED_CODE');
    await runtime.checkReceipt(receipt);
  }
  async function call(address, signature, words, at) {
    const raw = await runtime.call({ from: prefix(sender), to: prefix(address), data: callData(signature, words) }, at);
    return bare(raw, 32, false);
  }
  async function readAt(at = 'latest', nonce = ZERO) {
    await assertLocalEvm(runtime); const header = await runtime.block(at); at = header.number;
    for (const key of ['asset', 'vault']) assert.equal(await runtime.code(prefix(id[key]), at), deployment[key].runtimeCode, 'OWNED_VAULT_HISTORICAL_CODE');
    const expected = { 'asset()': aw(id.asset), 'assetCodeSHA256()': id.assetCodeSHA256,
      'genesisHash()': id.genesisHash, 'domain()': id.domain, 'runtimeId()': id.runtimeId, 'decimals()': word(6) };
    await Promise.all(Object.entries(expected).map(async ([signature, value]) =>
      assert.equal(await call(id.vault, signature, [], at), value, 'OWNED_VAULT_IMMUTABLE_IDENTITY')));
    assert.equal(await call(id.asset, 'decimals()', [], at), word(6), 'OWNED_VAULT_ASSET_DECIMALS');
    const jobs = {
      totalAssets: [id.vault, 'totalAssets()', []], totalShares: [id.vault, 'totalSupply()', []],
      backing: [id.asset, 'balanceOf(address)', [aw(id.vault)]], assetSupply: [id.asset, 'totalSupply()', []],
      senderAssets: [id.asset, 'balanceOf(address)', [aw(sender)]], receiverAssets: [id.asset, 'balanceOf(address)', [aw(receiver)]],
      senderShares: [id.vault, 'balanceOf(address)', [aw(sender)]], receiverShares: [id.vault, 'balanceOf(address)', [aw(receiver)]],
      allowance: [id.asset, 'allowance(address,address)', [aw(sender), aw(id.vault)]],
      usedNonce: [id.vault, 'usedNonce(address,bytes32)', [aw(sender), nonce]],
    };
    const result = Object.fromEntries(await Promise.all(Object.entries(jobs).map(async ([name, args]) =>
      [name, BigInt(prefix(await call(...args, at))).toString()])));
    assert.equal(result.totalAssets, result.backing, 'OWNED_VAULT_ACTUAL_BACKING');
    assert.equal(result.assetSupply, deployment.assetSupply, 'OWNED_VAULT_FIXED_SUPPLY');
    const view = { snapshot: { blockNumber: quantity(header.number).toString(), blockHash: bare(header.hash),
      blockTimestamp: quantity(header.timestamp).toString(), totalAssets: result.totalAssets, totalShares: result.totalShares },
      ...Object.fromEntries(STATE_FIELDS.filter(key => key !== 'snapshot').map(key => [key, result[key]])) };
    state(view, { sender, receiver }); await runtime.assertCanonical(header);
    return { header, view: detached(view) };
  }
  await readAt();
  const directory = await mkdtemp(join(runtime.metadata.scratchDirectory, 'backed-vault-'));
  const store = new Vault(join(directory, 'operations.vault')), password = fresh(), keeperId = fresh();
  let record = await store.create({ profile: OWNED_BACKED_VAULT_PROFILE, keeperId, identity: id, sender, receiver, sendBlocked: false, operations: [] }, password);
  assert.deepEqual(await store.read(password), record);
  let busy = false, poisoned = false, sendUncertain = false;
  const available = () => assert.ok(!poisoned, 'OWNED_VAULT_STORAGE_UNAVAILABLE');
  async function healthy() {
    available(); await assertLocalEvm(runtime);
    try { assert.deepEqual(await store.read(password), record, 'OWNED_VAULT_STORAGE_CHANGED'); }
    catch (error) { poisoned = true; throw error; }
  }
  async function exclusive(work) {
    assert.ok(!busy, 'OWNED_VAULT_BUSY'); busy = true;
    try { await healthy(); return await work(); } finally { busy = false; }
  }
  async function write(transform) {
    try {
      await healthy(); const next = await store.update(password, record.revision, old => transform(copy(old)));
      assert.deepEqual(await store.read(password), next, 'OWNED_VAULT_DURABLE_READBACK'); record = next;
    } catch (error) { poisoned = true; throw error; }
  }
  function operation(reference) {
    hex(reference); const value = record.data.operations.find(item => item.reference === reference);
    assert.ok(value, 'OWNED_VAULT_ORIGINAL_INTENT_REQUIRED'); return value;
  }
  async function update(reference, change) {
    await write(old => ({ ...old, operations: old.operations.map(item => item.reference === reference ? { ...item, ...copy(change) } : item) }));
  }
  function result(reference, freshlyObserved = false) {
    const entry = operation(reference), observation = detached({ reference, action: entry.action, actionCommitment: entry.commitment,
      calldata: entry.calldata, phase: entry.phase, approval: entry.approval, execution: entry.execution,
      sendBlocked: record.data.sendBlocked || sendUncertain, privateSpendable: false,
      assurance: freshlyObserved ? 'trusted-owned-local-rpc-not-PAEG-or-public-finality' : 'persisted-intent-and-last-observation-only' });
    if (entry.phase === 'OBSERVED' && freshlyObserved) issued.set(observation, adapter);
    return observation;
  }
  async function preflight(action, requireAllowance) {
    const quote = await readAt(tag(action.quote.blockNumber), action.nonce);
    assert.deepEqual(quote.view.snapshot, action.quote, 'OWNED_VAULT_QUOTE_CHANGED');
    const current = await readAt('latest', action.nonce);
    assert.equal(current.view.usedNonce, '0', 'OWNED_VAULT_NONCE_ALREADY_USED');
    assert.ok(BigInt(current.view.snapshot.blockTimestamp) + 1n <= BigInt(action.deadline), 'OWNED_VAULT_DEADLINE_EXPIRED');
    assert.ok(BigInt(current.view.snapshot.blockNumber) >= BigInt(action.quote.blockNumber)
      && BigInt(current.view.snapshot.blockNumber) + 1n - BigInt(action.quote.blockNumber) <= 256n, 'OWNED_VAULT_QUOTE_EXPIRED');
    const balance = action.kind === 'deposit' ? current.view.senderAssets : current.view.senderShares;
    assert.ok(BigInt(balance) >= BigInt(action.amount), 'OWNED_VAULT_SPEND_BALANCE');
    if (requireAllowance && action.kind === 'deposit') assert.equal(current.view.allowance, action.amount, 'OWNED_VAULT_EXACT_ALLOWANCE');
    return current;
  }
  function normalize(receipt, transaction, header) {
    return {
      identity: id, transactionHash: bare(receipt.transactionHash), blockNumber: quantity(receipt.blockNumber).toString(),
      blockHash: bare(receipt.blockHash), blockTimestamp: quantity(header.timestamp).toString(), status: quantity(receipt.status).toString(),
      from: bare(transaction.from, 20), to: bare(transaction.to, 20), input: transaction.input.slice(2),
      logs: receipt.logs.map(log => {
        assert.equal(log.transactionHash, receipt.transactionHash); assert.equal(log.blockHash, receipt.blockHash);
        assert.equal(log.blockNumber, receipt.blockNumber); assert.equal(log.transactionIndex, receipt.transactionIndex);
        assert.equal(log.removed, false);
        return { address: bare(log.address, 20), topics: log.topics.map(value => bare(value, 32, false)),
          data: log.data.slice(2), logIndex: quantity(log.logIndex).toString(), removed: false };
      }),
    };
  }
  async function reconcileSubmission(reference, kind) {
    const entry = operation(reference), submission = entry[kind], action = entry.action;
    assert.ok(submission && submission.phase !== 'SKIPPED', 'OWNED_VAULT_SUBMISSION_REQUIRED');
    const candidates = runtime.transactions.slice(submission.journalStart).filter(item => item.label === submission.label);
    assert.ok(candidates.length <= 1, 'OWNED_VAULT_DUPLICATE_ORIGINAL_SEND');
    if (candidates.length === 0 || !candidates[0].transactionHash) {
      assert.equal(submission.phase, 'ATTEMPTED', 'OWNED_VAULT_ORIGINAL_JOURNAL_DISAPPEARED'); return false;
    }
    const retained = candidates[0]; assert.deepEqual(retained.request, submission.request, 'OWNED_VAULT_ORIGINAL_REQUEST');
    assert.equal(quantity(retained.senderNonce).toString(), submission.senderNonce, 'OWNED_VAULT_ORIGINAL_NONCE');
    const hash = retained.transactionHash;
    if (submission.transactionHash !== null) assert.equal(hash, prefix(submission.transactionHash), 'OWNED_VAULT_HASH_CHANGED');
    const [transaction, receipt] = await Promise.all([runtime.transaction(hash), runtime.receipt(hash)]);
    if (!transaction || !receipt) {
      assert.equal(submission.phase, 'ATTEMPTED', 'OWNED_VAULT_ORIGINAL_RECEIPT_DISAPPEARED'); return false;
    }
    assert.equal(transaction.hash, hash); assert.equal(receipt.transactionHash, hash);
    assert.equal(transaction.from, submission.request.from); assert.equal(transaction.to, submission.request.to);
    assert.equal(transaction.input, submission.request.data); assert.equal(quantity(transaction.value), 0n);
    assert.equal(quantity(transaction.gas), quantity(submission.request.gas));
    assert.equal(quantity(transaction.nonce).toString(), submission.senderNonce);
    assert.equal(transaction.blockHash, receipt.blockHash); assert.equal(transaction.blockNumber, receipt.blockNumber);
    assert.equal(receipt.from, transaction.from); assert.equal(receipt.to, transaction.to);
    const header = await runtime.assertCanonical(receipt);
    assert.deepEqual(header.transactions, [hash], 'OWNED_VAULT_SINGLE_TRANSACTION_BLOCK');
    assert.equal(quantity(receipt.transactionIndex), 0n); assert.equal(quantity(transaction.transactionIndex), 0n);
    const height = quantity(header.number); assert.ok(height > 0n);
    const [before, after, quote] = await Promise.all([readAt(tag(height - 1n), action.nonce), readAt(header.number, action.nonce),
      readAt(tag(action.quote.blockNumber), action.nonce)]);
    assert.equal(header.parentHash, before.header.hash, 'OWNED_VAULT_PARENT_BLOCK');
    assert.equal(after.header.hash, header.hash); assert.deepEqual(quote.view.snapshot, action.quote, 'OWNED_VAULT_QUOTE_CHANGED');
    // Require the same execution parent recorded before send. Unrelated pending
    // transactions or a changed head fail closed instead of diluting the delta.
    assert.deepEqual(before.view, submission.before, 'OWNED_VAULT_SUBMISSION_PARENT_CHANGED');
    const normalized = normalize(receipt, transaction, header);
    let confirmation, phase;
    if (normalized.status === '0') {
      assert.deepEqual(normalized.logs, [], 'OWNED_VAULT_REVERT_LOGS');
      for (const key of STATE_FIELDS.filter(key => key !== 'snapshot')) assert.equal(after.view[key], before.view[key], 'OWNED_VAULT_REVERT_STATE');
      for (const key of ['totalAssets', 'totalShares']) assert.equal(after.view.snapshot[key], before.view.snapshot[key], 'OWNED_VAULT_REVERT_TOTALS');
      phase = 'REVERTED'; confirmation = { privateSpendable: false, outcome: 'REVERTED' };
    } else {
      const trace = { action, receipt: normalized, before: before.view, after: after.view, parentHash: bare(header.parentHash) };
      confirmation = kind === 'approval' ? inspectBackedVaultApproval(trace) : inspectBackedVaultTransition(trace);
      phase = 'OBSERVED';
    }
    await runtime.checkReceipt(receipt);
    await Promise.all([runtime.assertCanonical(before.header), runtime.assertCanonical(after.header), runtime.assertCanonical(quote.header)]);
    const nextPhase = phase === 'REVERTED' ? 'REVERTED' : kind === 'execution' ? 'OBSERVED' : 'APPROVED';
    await update(reference, { [kind]: { ...submission, phase, transactionHash: bare(hash), receipt: normalized, confirmation }, phase: nextPhase });
    return true;
  }
  async function submit(reference, kind, before) {
    const entry = operation(reference); assert.equal(entry[kind], null, 'OWNED_VAULT_NO_RESEND');
    const request = { from: prefix(sender), to: prefix(kind === 'approval' ? id.asset : id.vault),
      data: prefix(kind === 'approval' ? approvalData(entry.action) : entry.calldata), gas: tag(LOCAL_EVM_PROFILE.maxGas), value: '0x0' };
    const submission = { phase: 'ATTEMPTED', label: 'owned-backed-vault-' + keeperId + '-' + kind + '-' + reference,
      request, calldataSHA256: sha(Buffer.from(request.data.slice(2), 'hex')), senderNonce: (await runtime.nonce(prefix(sender))).toString(),
      journalStart: runtime.transactions.length, before, transactionHash: null, receipt: null, confirmation: null };
    // This fsync + authenticated readback MUST finish before the only send.
    await update(reference, { [kind]: submission, phase: kind === 'approval' ? 'APPROVAL_UNRESOLVED' : 'EXECUTION_UNRESOLVED' });
    try { await runtime.send(submission.label, request); }
    catch {
      // The golden runtime intentionally has no uncertainty-reset capability.
      // Keep observations available, but never try another mutation after this.
      sendUncertain = true; await write(old => ({ ...old, sendBlocked: true }));
    }
    return reconcileSubmission(reference, kind);
  }
  async function prepareOriginal(intent, reference) {
    const existing = record.data.operations.find(item => item.reference === reference);
    if (existing) {
      // The caller's durable idempotency key binds the entire first request.
      // A new quote, deadline, amount or kind cannot replace that original.
      for (const key of ['kind', 'amount', 'minimumOutput', 'deadline'])
        assert.equal(existing.action[key], intent[key], 'OWNED_VAULT_PREPARATION_REBOUND');
      return result(reference);
    }
    assert.ok(record.data.operations.length < MAX_OPERATIONS, 'OWNED_VAULT_OPERATION_CAPACITY');
    const nonce = fresh(), { view } = await readAt('latest', nonce);
    const action = prepareVaultAction({ identity: id, ...intent, sender, owner: sender, receiver, nonce, quote: view.snapshot });
    assert.ok(BigInt(action.amount) <= BigInt(action.kind === 'deposit' ? view.senderAssets : view.senderShares), 'OWNED_VAULT_SPEND_BALANCE');
    const commitment = vaultActionCommitment(action), calldata = encodeVaultCall(action);
    await write(old => ({ ...old, operations: [...old.operations, { reference, action, commitment, calldata,
      phase: 'PREPARED', approval: null, execution: null }] }));
    return result(reference);
  }
  const adapter = Object.freeze({
    async observe() {
      assert.equal(arguments.length, 0, 'OWNED_VAULT_PUBLIC_ARGUMENTS');
      return exclusive(async () => { const { view } = await readAt();
        const position = observeVaultPosition({ identity: id, owner: sender, shares: view.senderShares, snapshot: view.snapshot });
        return detached({ ...position, balances: view, assurance: 'trusted-owned-local-rpc-not-PAEG-or-public-finality', privateSpendable: false }); });
    },
    async prepare(request) {
      assert.equal(arguments.length, 1); exactRecord(request, ['kind', 'amount', 'minimumOutput', 'deadline']);
      const intent = copy(request);
      return exclusive(() => prepareOriginal(intent, fresh()));
    },
    /** Private application seam: retain this reference before invoking. A lost
     * reply can recover the identical action without choosing a second nonce. */
    async prepareOnce(request) {
      assert.equal(arguments.length, 1);
      exactRecord(request, ['reference', 'kind', 'amount', 'minimumOutput', 'deadline']);
      hex(request.reference); const { reference, ...intent } = copy(request);
      return exclusive(() => prepareOriginal(intent, reference));
    },
    /** Explicit manual requote of a never-submitted redemption. Retains the
     * same action nonce/reference and every prior quote. It cannot replace an
     * attempted transaction, an approval, a revert or uncertain send. */
    async requoteUnsubmitted(request) {
      assert.equal(arguments.length, 1); exactRecord(request, ['reference', 'minimumOutput', 'deadline']);
      hex(request.reference); const intent = copy(request);
      return exclusive(async () => {
        const entry = operation(intent.reference);
        assert.equal(entry.action.kind, 'redeem', 'OWNED_VAULT_REQUOTE_REDEEM_ONLY');
        assert.ok(entry.phase === 'PREPARED' && entry.execution === null && entry.approval === null,
          'OWNED_VAULT_REQUOTE_NEVER_SUBMITTED_REQUIRED');
        assert.ok(!record.data.sendBlocked && !sendUncertain, 'OWNED_VAULT_RUNTIME_SEND_BLOCKED');
        if (entry.action.minimumOutput === intent.minimumOutput && entry.action.deadline === intent.deadline)
          return result(intent.reference);
        assert.ok((entry.quoteHistory?.length ?? 0) < 8, 'OWNED_VAULT_REQUOTE_CAPACITY');
        const { view } = await readAt('latest', entry.action.nonce);
        assert.equal(view.usedNonce, '0', 'OWNED_VAULT_NONCE_ALREADY_USED');
        assert.ok(BigInt(view.senderShares) >= BigInt(entry.action.amount), 'OWNED_VAULT_SPEND_BALANCE');
        const { previewOutput: _previousPreview, ...previous } = entry.action;
        const action = prepareVaultAction({ ...previous, minimumOutput: intent.minimumOutput,
          deadline: intent.deadline, quote: view.snapshot });
        await update(intent.reference, { action, commitment: vaultActionCommitment(action), calldata: encodeVaultCall(action),
          quoteHistory: [...(entry.quoteHistory ?? []), { action: entry.action, commitment: entry.commitment, calldata: entry.calldata }] });
        return result(intent.reference);
      });
    },
    async execute(reference) {
      assert.equal(arguments.length, 1); hex(reference);
      return exclusive(async () => {
        let entry = operation(reference);
        if (['OBSERVED', 'REVERTED'].includes(entry.phase)) {
          const observed = await reconcileSubmission(reference, entry.execution ? 'execution' : 'approval'); return result(reference, observed);
        }
        assert.ok(!record.data.sendBlocked && !sendUncertain, 'OWNED_VAULT_RUNTIME_SEND_BLOCKED');
        assert.ok(['PREPARED', 'APPROVED'].includes(entry.phase), 'OWNED_VAULT_RECONCILE_BEFORE_EXECUTE');
        assert.ok(record.data.operations.every(item => item.reference === reference || !['APPROVAL_UNRESOLVED', 'EXECUTION_UNRESOLVED'].includes(item.phase)), 'OWNED_VAULT_OTHER_UNRESOLVED_SEND');
        let current = await preflight(entry.action, false);
        if (entry.action.kind === 'deposit' && entry.approval === null) {
          if (current.view.allowance === entry.action.amount) await update(reference, { approval: { phase: 'SKIPPED', amount: entry.action.amount }, phase: 'APPROVED' });
          else {
            assert.ok(BigInt(current.view.snapshot.blockTimestamp) + 2n <= BigInt(entry.action.deadline), 'OWNED_VAULT_APPROVAL_EXECUTION_TIME');
            assert.ok(BigInt(current.view.snapshot.blockNumber) + 2n - BigInt(entry.action.quote.blockNumber) <= 256n, 'OWNED_VAULT_APPROVAL_QUOTE_WINDOW');
            await submit(reference, 'approval', current.view); entry = operation(reference);
            if (entry.phase !== 'APPROVED' || record.data.sendBlocked || sendUncertain) return result(reference);
          }
        }
        entry = operation(reference); current = await preflight(entry.action, true);
        const observed = await submit(reference, 'execution', current.view); return result(reference, observed);
      });
    },
    async reconcile(reference) {
      assert.equal(arguments.length, 1); hex(reference);
      return exclusive(async () => {
        const entry = operation(reference);
        let observed = false;
        if (entry.execution) observed = await reconcileSubmission(reference, 'execution');
        else if (entry.approval && entry.approval.phase !== 'SKIPPED') observed = await reconcileSubmission(reference, 'approval');
        return result(reference, observed);
      });
    },
    async describe(reference) {
      assert.equal(arguments.length, 1); hex(reference);
      return exclusive(async () => result(reference));
    },
    async reopen() {
      assert.equal(arguments.length, 0); assert.ok(!busy, 'OWNED_VAULT_BUSY'); busy = true;
      try {
        await assertLocalEvm(runtime); const next = await store.read(password);
        assert.ok(next.revision >= record.revision, 'OWNED_VAULT_REVISION_ROLLBACK');
        for (const key of ['profile', 'keeperId', 'identity', 'sender', 'receiver']) assert.deepEqual(next.data[key], record.data[key], 'OWNED_VAULT_STORAGE_IDENTITY');
        assert.ok(next.data.operations.length <= MAX_OPERATIONS);
        for (const entry of next.data.operations) {
          hex(entry.reference); assert.deepEqual(entry.action.identity, id); assert.equal(entry.action.sender, sender); assert.equal(entry.action.receiver, receiver);
          assert.equal(entry.calldata, encodeVaultCall(entry.action)); assert.equal(entry.commitment, vaultActionCommitment(entry.action));
          assert.ok((entry.quoteHistory?.length ?? 0) <= 8, 'OWNED_VAULT_REQUOTE_CAPACITY');
          for (const previous of entry.quoteHistory ?? []) {
            exactRecord(previous, ['action', 'commitment', 'calldata']);
            for (const key of ['identity', 'kind', 'sender', 'owner', 'receiver', 'amount', 'nonce'])
              assert.deepEqual(previous.action[key], entry.action[key], 'OWNED_VAULT_REQUOTE_IDENTITY');
            assert.equal(previous.calldata, encodeVaultCall(previous.action));
            assert.equal(previous.commitment, vaultActionCommitment(previous.action));
          }
        }
        record = next; poisoned = false;
        return detached({ revision: record.revision, references: record.data.operations.map(entry => entry.reference), privateSpendable: false });
      } catch (error) { poisoned = true; throw error; } finally { busy = false; }
    },
  });
  owned.set(adapter, runtime); ownedBindings.set(adapter, { identity: id, sender, receiver }); return adapter;
}
