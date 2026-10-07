/** Read-only nested D27 arrival observer. Authority comes only from original
 * owned v2 signed wire, a branded fixed deployment and canonical RPC history.
 * Supplied receipts, events, facts, booleans or callbacks cannot mint it. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { assertOwnedLocalEvmV2, assertSignedEvmTransaction, LOCAL_EVM_PROFILE } from '../runtime/owned-evm-v2-runtime.mjs';
import { assertOwnedEvmVaultRouter } from '../../../operations/deployments/defi/deploy-evm-vault-router.mjs';
import { assertOwnedFlatSystem } from '../../../operations/deployments/system/deploy-system.mjs';
import { assertOwnedPoolAsset } from '../../shared/contracts/owned-pool-asset.mjs';
import { exactRecord } from '../../../execution/encoding/commitments.mjs';
import { createFlatSystemStateReader, decodeFlatWords } from '../../../execution/account/reconciliation/flat-system-state.mjs';
import { flatOwnerIdentity, flatOwnerSnapshot, ownerDigest } from '../../../../../custody/src/signing/flat-owner-custody.mjs';
import { nativeStaticCalldata } from '../../../../../engine/src/execution/native/dispatch/native-deployment.mjs';
import { publicKeccak256 } from '../../../../../engine/src/cohorts/private-cohort-public-native.mjs';
import { decodeGenericBalanceStateAdvanced } from '../../../../../engine/src/execution/balances/generic-balance-observer.mjs';
import { encodeEvmVaultDeliveryCall, decodeEvmVaultDeliveryCall, decodeEvmVaultDepositStatement, inspectEvmVaultDeliveryTransition }
  from './evm-vault-delivery.mjs';

const owned = new WeakMap(), issuedObservations = new WeakMap(), issuedFacts = new WeakMap();
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const freeze = value => { if (value && typeof value === 'object' && !Object.isFrozen(value)) {
  Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
const detached = value => freeze(structuredClone(value));
function bare(value, bytes = 32) {
  assert.ok(typeof value === 'string' && new RegExp('^0x[0-9a-f]{' + bytes * 2 + '}$').test(value), 'EVM_DELIVERY_RPC_HEX');
  return value.slice(2);
}
function hash(value) { assert.ok(typeof value === 'string' && /^[0-9a-f]{64}$/.test(value), 'EVM_DELIVERY_OBSERVER_HASH'); return value; }
function quantity(value) {
  assert.ok(typeof value === 'string' && /^0x(?:0|[1-9a-f][0-9a-f]*)$/.test(value) && value.length <= 66,
    'EVM_DELIVERY_RPC_QUANTITY'); return BigInt(value);
}
const word = value => BigInt(value).toString(16).padStart(64, '0');
const selector = signature => publicKeccak256(Buffer.from(signature)).subarray(0, 4).toString('hex');
const tokenData = (signature, args) => '0x' + selector(signature) + args.map(word).join('');
const one = raw => decodeFlatWords(raw, 1)[0];
// Only these independently observed contradictions can revoke an already
// authenticated original identity. Missing/pruned history, RPC/network errors,
// malformed input and concurrent head advance always remain unknown.
const adverseCodes = new Set([
  'LOCAL_EVM_CANONICAL_BLOCK_CHANGED', 'LOCAL_EVM_RECEIPT_CHANGED', 'LOCAL_EVM_RECEIPT_TRANSACTION',
  'EVM_DELIVERY_TRANSACTION_REVERTED', 'EVM_DELIVERY_ORIGINAL_RECEIPT_CHANGED', 'EVM_DELIVERY_SINGLE_TRANSACTION_BLOCK',
  'EVM_DELIVERY_SIGNED_PREPARATION_BLOCK', 'EVM_DELIVERY_SIGNED_CODE_HASH', 'EVM_DELIVERY_VAULT_ACTUAL_BACKING',
  'EVM_DELIVERY_SPENT_LEDGER_CHANGED', 'EVM_DELIVERY_EXACT_ROOT_APPEND', 'EVM_DELIVERY_AUTHORIZATION_TREE_CHANGED',
  'EVM_DELIVERY_AUTHORIZATION_HISTORY_CHANGED', 'EVM_DELIVERY_ORIGINAL_D27_PROOF', 'EVM_DELIVERY_STATE_ADVANCED',
  'EVM_DELIVERY_OBSERVED_TIP_BEHIND', 'EVM_DELIVERY_CONFIRMATIONS_BOUND', 'EVM_DELIVERY_HISTORICAL_CODE_BLOCK',
  'EVM_DELIVERY_REVERTED', 'EVM_DELIVERY_SENDER', 'EVM_DELIVERY_TARGET', 'EVM_DELIVERY_NATIVE_VALUE',
  'EVM_DELIVERY_CALLDATA', 'EVM_DELIVERY_EXECUTION_WINDOW', 'EVM_DELIVERY_LOG_REMOVED', 'EVM_DELIVERY_LOG_ORDER',
  'EVM_DELIVERY_SOLE_ROUTER_EVENT', 'EVM_DELIVERY_EVENT_POSITION', 'EVM_DELIVERY_EVENT_TOPICS', 'EVM_DELIVERY_EVENT_DATA',
  'EVM_DELIVERY_POOL_ROOT', 'EVM_DELIVERY_INSERTION_SET', 'EVM_DELIVERY_POOL_HEADROOM', 'EVM_DELIVERY_POOL_BACKING',
  'EVM_DELIVERY_ADJACENT_BLOCKS', 'EVM_DELIVERY_PARENT_BLOCK', 'EVM_DELIVERY_RECEIPT_BLOCK', 'EVM_DELIVERY_RECEIPT_TIME',
  'EVM_DELIVERY_TIME_ORDER', 'EVM_DELIVERY_VALUE_HEADROOM', 'EVM_DELIVERY_EXACT_VAULT_PREVIEW', 'EVM_DELIVERY_NEW_ROOT',
  'EVM_DELIVERY_EXACT_INSERTION', 'EVM_DELIVERY_K_REPLAY', 'EVM_DELIVERY_Q_REPLAY', 'EVM_DELIVERY_K_NOT_CONSUMED',
  'EVM_DELIVERY_Q_NOT_INSERTED', 'EVM_DELIVERY_EXACT_SOLVER_ALLOWANCE', 'EVM_DELIVERY_PREEXISTING_ALLOWANCE',
  'EVM_DELIVERY_UNRESOLVED_ALLOWANCE', 'EVM_ROUTER_COMPLETE_CODE', 'EVM_ROUTER_CODE_HASH',
  'EVM_ROUTER_CREATION_RECEIPT_CHANGED', 'EVM_ROUTER_CREATION_SINGLE_TRANSACTION', 'EVM_ROUTER_SOLVER_EOA',
  'FLAT_STATE_CODE_CHANGED', 'FLAT_STATE_CODE_HASH', 'OWNED_POOL_ASSET_CODE_CHANGED', 'OWNED_POOL_ASSET_CODE_HASH',
  'GENERIC_RECONSTRUCTED_ROOT', 'GENERIC_RECONSTRUCTED_SPENT', 'GENERIC_RECONSTRUCTED_HISTORY', 'GENERIC_BACKING_DEFICIT',
  ...['chainId', 'nonce', 'gasPrice', 'gas', 'value', 'from', 'to'].map(key => 'EVM_DELIVERY_TRANSACTION_' + key.toUpperCase()),
  ...['assetSupply', 'solverAssets', 'solverShares', 'routerAssets', 'routerShares', 'routerNative', 'vaultAssets', 'vaultShares',
    'poolAssets', 'poolShares', 'poolNative', 'poolBacked', 'leaves', 'spent', 'reservations', 'outputs', 'sequence',
    'historyCount', 'authorizationLeaves', 'authorizationHistoryCount', 'deliveryCount'].map(key => 'EVM_DELIVERY_EXACT_DELTA_' + key),
  ...['spentDigest', 'authorizationRoot'].map(key => 'EVM_DELIVERY_UNCHANGED_' + key),
  ...['solver', 'asset', 'vault', 'targetPool', 'assetCodeSHA256', 'vaultCodeSHA256', 'targetPoolCodeSHA256', 'genesisHash',
    'ledgerNamespace', 'vaultDomain', 'vaultRuntimeId', 'targetDomain', 'targetScope', 'targetPolicy', 'assetIdentity', 'shareIdentity']
    .map(key => 'EVM_ROUTER_IMMUTABLE_GETTER_' + key),
  ...['asset', 'assetCodeHash', 'assetIdentity', 'domainCommitment', 'scope', 'policy', 'ledgerNamespace', 'receiptHub',
    'receiptHubCodeHash', 'transitionInProgress'].map(key => 'EVM_ROUTER_POOL_IDENTITY_' + key),
]);
function failure(error, context) {
  // AssertionError messages can contain actual values. Only retain a complete
  // recognized machine code, never the raw message, RPC response or calldata.
  const message = error?.message?.split('\n', 1)[0];
  const code = adverseCodes.has(message) ? message.toUpperCase() : message;
  const reason = typeof code === 'string' && /^[A-Z][A-Z0-9_]{2,79}$/.test(code)
    ? code : 'EVM_DELIVERY_OBSERVATION_UNAVAILABLE';
  return { status: context.authenticated && error instanceof assert.AssertionError && adverseCodes.has(message) ? 'adverse' : 'unknown', reason };
}
export function assertOwnedEvmVaultDeliveryObserver(observer, { runtime, system, poolIndex }) {
  const binding = owned.get(observer);
  assert.ok(binding && binding.runtime === runtime && binding.system === system && binding.poolIndex === poolIndex,
    'EVM_DELIVERY_OWNED_OBSERVER_REQUIRED');
  assertOwnedFlatSystem(runtime, system); assertOwnedEvmVaultRouter(runtime, system, binding.router);
}
/** Provenance only. Calling observe again is required for a fresh observation. */
export function assertOwnedEvmVaultDeliveryObservation(observation, { observer }) {
  assert.ok(owned.has(observer) && issuedObservations.get(observation) === observer, 'EVM_DELIVERY_OWNED_OBSERVATION_REQUIRED');
}
export function assertOwnedEvmVaultDeliveryFacts(facts, { observer }) {
  assert.ok(owned.has(observer) && issuedFacts.get(facts) === observer, 'EVM_DELIVERY_OWNED_FACTS_REQUIRED');
}

export async function createEvmVaultDeliveryObserver(input) {
  assert.equal(arguments.length, 1, 'EVM_DELIVERY_OBSERVER_ARGUMENTS');
  exactRecord(input, ['runtime', 'system', 'poolIndex', 'router']);
  const { runtime, system, poolIndex, router } = input;
  await assertOwnedLocalEvmV2(runtime); assertOwnedFlatSystem(runtime, system); assertOwnedEvmVaultRouter(runtime, system, router);
  assert.ok(poolIndex === 0 || poolIndex === 1, 'EVM_DELIVERY_OBSERVER_POOL');
  assert.equal(poolIndex, router.destinationPoolIndex, 'EVM_DELIVERY_OBSERVER_TARGET_POOL');
  const pool = system.pools[poolIndex], id = router.identity;
  assertOwnedPoolAsset(runtime, pool.assetCapability);
  const asset = pool.assetCapability.metadata;
  assert.deepEqual(asset, pool.assetMetadata); assert.equal(asset.kind, 'ERC20');
  assert.equal(asset.address, '0x' + id.vault); assert.equal(pool.address, '0x' + id.targetPool);
  assert.equal(pool.assetCodeHash, asset.codeHash); assert.equal(pool.domain.asset, id.shareIdentity);
  const ownerIdentity = flatOwnerIdentity({ pool: id.targetPool, domain: pool.domain,
    domainCommitment: id.targetDomain, assetBinding: { token: id.vault, codeHash: bare(asset.codeHash) } });
  const identitySHA256 = ownerDigest(ownerIdentity), reader = await createFlatSystemStateReader({ runtime, system, poolIndex });
  await router.read();
  const routerCall = async (signature, args, at) => one(await runtime.call({ to: router.address,
    data: nativeStaticCalldata(router.artifact, signature, args) }, at));
  const tokenCall = async (address, signature, args, at) => BigInt(one(await runtime.call({ to: '0x' + address,
    data: tokenData(signature, args) }, at))).toString();
  async function readAt(blockNumber, call) {
    const header = await runtime.block(blockNumber), at = header.number;
    assert.equal(at, blockNumber, 'EVM_DELIVERY_HISTORICAL_BLOCK');
    const pins = await router.read(at); assert.equal(pins.blockHash, header.hash, 'EVM_DELIVERY_HISTORICAL_CODE_BLOCK');
    assert.deepEqual(pins.identity, id);
    const statement = decodeEvmVaultDepositStatement(call.descriptor.publicInputs);
    const requests = {
      rawState: pool.call('canonicalState()', [], at), rawHistory: pool.call('canonicalRootHistory()', [], at),
      rawBacking: pool.call('canonicalBacking()', [], at), rawLeaves: pool.call('noteLeaves()', [], at),
      authorizationRoot: pool.call('authorizationRoot()', [], at), authorizationLeaves: pool.call('authorizationLeafCount()', [], at),
      authorizationHistoryCount: pool.call('authorizationRootHistoryCount()', [], at),
      authorizationNodes: pool.call('authorizationTreeNodes()', [], at), authorizationHistory: pool.call('authorizationRootHistory()', [], at),
      insertedOutput: pool.call('insertedCommitments(bytes32)', ['0x' + statement.output], at),
      consumedReceiptKey: routerCall('consumedReceiptKeys(bytes32)', ['0x' + call.receiptKeyCommitment], at),
      deliveryCount: routerCall('deliveryCount()', [], at),
      assetSupply: tokenCall(id.asset, 'totalSupply()', [], at),
      solverAssets: tokenCall(id.asset, 'balanceOf(address)', ['0x' + id.solver], at),
      solverShares: tokenCall(id.vault, 'balanceOf(address)', ['0x' + id.solver], at),
      routerAssets: tokenCall(id.asset, 'balanceOf(address)', [router.address], at),
      routerShares: tokenCall(id.vault, 'balanceOf(address)', [router.address], at),
      routerNative: runtime.balance(router.address, at).then(String),
      vaultAssets: tokenCall(id.asset, 'balanceOf(address)', ['0x' + id.vault], at),
      totalAssets: tokenCall(id.vault, 'totalAssets()', [], at),
      vaultShares: tokenCall(id.vault, 'totalSupply()', [], at),
      poolAssets: tokenCall(id.asset, 'balanceOf(address)', [pool.address], at),
      poolShares: tokenCall(id.vault, 'balanceOf(address)', [pool.address], at),
      poolNative: runtime.balance(pool.address, at).then(String),
      solverAllowance: tokenCall(id.asset, 'allowance(address,address)', ['0x' + id.solver, router.address], at),
      vaultAllowance: tokenCall(id.asset, 'allowance(address,address)', [router.address, '0x' + id.vault], at),
      poolAllowance: tokenCall(id.vault, 'allowance(address,address)', [router.address, pool.address], at),
      assetCapability: pool.assetCapability.read({ holder: pool.address, blockNumber: at }),
    };
    const data = Object.fromEntries(await Promise.all(Object.entries(requests).map(async ([key, value]) => [key, await value])));
    const canonical = await runtime.assertCanonical(header);
    const snapshot = { identitySHA256, blockHash: bare(header.hash), canonicalBlockHashBefore: bare(header.hash),
      canonicalBlockHashAfter: bare(canonical.hash), timestamp: quantity(header.timestamp).toString(),
      rawState: data.rawState, rawHistory: data.rawHistory, rawBacking: data.rawBacking };
    const decoded = flatOwnerSnapshot(snapshot, ownerIdentity), p = decoded.publicState;
    assert.deepEqual(data.assetCapability.metadata, asset); assert.equal(data.assetCapability.holder, pool.address);
    assert.equal(data.assetCapability.blockNumber, at); assert.equal(data.assetCapability.blockHash, header.hash);
    assert.equal(data.assetCapability.balance, data.poolShares); assert.equal(data.assetCapability.totalSupply, data.vaultShares);
    assert.equal(p.actualAssetBalance, data.poolShares); assert.equal(p.unrelatedNative, data.poolNative);
    assert.equal(data.totalAssets, data.vaultAssets, 'EVM_DELIVERY_VAULT_ACTUAL_BACKING');
    const commitments = decodeFlatWords(data.rawLeaves, 64).map(value => bare(value));
    assert.deepEqual(commitments, [...decoded.commitments.map(value => bare(value)), ...Array(64 - p.leaves).fill('0'.repeat(64))]);
    decodeFlatWords(data.authorizationNodes, 128); decodeFlatWords(data.authorizationHistory, 65);
    const transition = { snapshot: { blockNumber: quantity(at).toString(), blockHash: bare(header.hash),
      blockTimestamp: quantity(header.timestamp).toString() },
      ...Object.fromEntries(['assetSupply', 'solverAssets', 'solverShares', 'routerAssets', 'routerShares', 'routerNative',
        'vaultAssets', 'vaultShares', 'poolAssets', 'poolShares', 'poolNative', 'solverAllowance', 'vaultAllowance', 'poolAllowance'].map(key => [key, data[key]])),
      poolBacked: p.backedAmount, leaves: String(p.leaves), spent: String(p.spent), reservations: String(p.liveReservations),
      outputs: String(p.outputCapacity), sequence: p.sequence, historyCount: String(p.rootCount),
      root: bare(p.root), spentDigest: bare(p.spentDigest), authorizationRoot: bare(one(data.authorizationRoot)), commitments,
      ...Object.fromEntries(['authorizationLeaves', 'authorizationHistoryCount', 'deliveryCount', 'consumedReceiptKey', 'insertedOutput']
        .map(key => [key, BigInt(one(data[key])).toString()])) };
    return { header, snapshot, decoded, transition, authorizationNodes: data.authorizationNodes, authorizationHistory: data.authorizationHistory };
  }
  async function inspect(query, context = {}) {
    exactRecord(query, ['transactionHash', 'calldataSHA256']); hash(query.transactionHash); hash(query.calldataSHA256);
    query = detached(query);
    await assertOwnedLocalEvmV2(runtime); assertOwnedFlatSystem(runtime, system); assertOwnedEvmVaultRouter(runtime, system, router);
    const transactionHash = '0x' + query.transactionHash;
    const entries = runtime.transactions.filter(entry => entry.transactionHash === transactionHash);
    assert.equal(entries.length, 1, 'EVM_DELIVERY_ORIGINAL_SIGNED_JOURNAL_REQUIRED');
    const retained = entries[0];
    assert.equal(retained.label, 'gated EVM vault delivery', 'EVM_DELIVERY_GATED_ORIGINAL_REQUIRED');
    assert.ok(retained.signed && retained.prepared, 'EVM_DELIVERY_SIGNED_WIRE_REQUIRED');
    assert.ok(['mined', 'mined-reverted', 'uncertain-no-resend', 'broadcast', 'broadcast-result-unknown'].includes(retained.phase), 'EVM_DELIVERY_ORIGINAL_BROADCAST_REQUIRED');
    const signed = await runtime.signedTransaction(transactionHash);
    assert.deepEqual(signed, retained.signed, 'EVM_DELIVERY_ORIGINAL_WIRE_CHANGED');
    const wire = assertSignedEvmTransaction(signed.nativeWire, retained.prepared.transaction);
    assert.equal(wire.nativeId, transactionHash); assert.equal(signed.nativeId, transactionHash);
    assert.equal(wire.transactionSHA256, signed.transactionSHA256); assert.equal(wire.unsignedWire, retained.prepared.unsignedWire);
    assert.equal(wire.chainId, '31337'); assert.equal(wire.from, '0x' + id.solver); assert.equal(wire.to, router.address);
    assert.equal(wire.value, '0'); assert.equal(wire.gasPrice, '1000000000');
    assert.ok(BigInt(wire.gas) > 0n && BigInt(wire.gas) <= BigInt(LOCAL_EVM_PROFILE.maxGas));
    assert.equal(wire.nonce, quantity(retained.senderNonce).toString());
    assert.equal(retained.request.from, wire.from); assert.equal(retained.request.to, wire.to);
    assert.equal(retained.request.data, wire.data); assert.equal(quantity(retained.request.value).toString(), wire.value);
    assert.equal(quantity(retained.request.gas).toString(), wire.gas); assert.equal(retained.prepared.genesis, '0x' + id.genesisHash);
    assert.equal(sha(Buffer.from(wire.data.slice(2), 'hex')), query.calldataSHA256, 'EVM_DELIVERY_ORIGINAL_CALLDATA_HASH');
    const decodedCall = decodeEvmVaultDeliveryCall(wire.data, id);
    const call = { descriptor: decodedCall.descriptor, receiptKeyCommitment: decodedCall.receiptKeyCommitment, proof: decodedCall.proof };
    const genesis = await runtime.block('0x0');
    assert.equal(genesis.hash, '0x' + id.genesisHash, 'EVM_DELIVERY_NETWORK_UNAVAILABLE'); await runtime.assertCanonical(genesis);
    // Only after an exact original signed identity, semantic call and same
    // owned network have been established may an observed contradiction be adverse.
    context.authenticated = true;
    const [transaction, receipt] = await Promise.all([runtime.transaction(transactionHash), runtime.receipt(transactionHash)]);
    if (transaction === null || receipt === null) {
      assert.ok(!['mined', 'mined-reverted'].includes(retained.phase) && retained.receipt === undefined, 'EVM_DELIVERY_MINED_HISTORY_MISSING');
      assert.ok(transaction === null || transaction.blockHash === null, 'EVM_DELIVERY_PARTIAL_MINED_HISTORY');
      assert.equal(receipt, null, 'EVM_DELIVERY_PARTIAL_MINED_HISTORY'); return null;
    }
    if (retained.receipt !== undefined) assert.deepEqual(receipt, retained.receipt, 'EVM_DELIVERY_ORIGINAL_RECEIPT_CHANGED');
    assert.equal(receipt.status, '0x1', 'EVM_DELIVERY_TRANSACTION_REVERTED'); assert.equal(receipt.contractAddress, null);
    assert.equal(transaction.hash, transactionHash); assert.equal(receipt.transactionHash, transactionHash);
    for (const key of ['chainId', 'nonce', 'gasPrice', 'gas', 'value'])
      assert.equal(quantity(transaction[key]).toString(), wire[key], 'EVM_DELIVERY_TRANSACTION_' + key.toUpperCase());
    for (const key of ['from', 'to']) {
      assert.equal(transaction[key], wire[key], 'EVM_DELIVERY_TRANSACTION_' + key.toUpperCase()); assert.equal(receipt[key], wire[key]);
    }
    assert.equal(transaction.input, wire.data); assert.equal(transaction.blockHash, receipt.blockHash);
    assert.equal(transaction.blockNumber, receipt.blockNumber); assert.equal(transaction.transactionIndex, receipt.transactionIndex);
    assert.equal(quantity(receipt.transactionIndex), 0n); assert.ok(quantity(receipt.gasUsed) > 0n && quantity(receipt.gasUsed) <= BigInt(wire.gas));
    await runtime.checkReceipt(receipt); const header = await runtime.assertCanonical(receipt);
    assert.deepEqual(header.transactions, [transactionHash], 'EVM_DELIVERY_SINGLE_TRANSACTION_BLOCK');
    const height = quantity(header.number); assert.ok(height > 0n);
    assert.equal(header.number, receipt.blockNumber);
    for (const [position, log] of receipt.logs.entries()) {
      assert.equal(log.transactionHash, transactionHash); assert.equal(log.blockHash, receipt.blockHash);
      assert.equal(log.blockNumber, receipt.blockNumber); assert.equal(log.transactionIndex, receipt.transactionIndex);
      assert.equal(log.removed, false); quantity(log.logIndex);
      // With exactly one transaction in this block, RPC indexes must also be
      // contiguous. Identity nevertheless uses receipt position, never this field.
      assert.equal(quantity(log.logIndex), BigInt(position), 'EVM_DELIVERY_LOG_ORDER');
      assert.ok(typeof log.data === 'string' && /^0x(?:[0-9a-f]{2})*$/.test(log.data), 'EVM_DELIVERY_RPC_LOG_DATA');
    }
    const [before, after] = await Promise.all([readAt('0x' + (height - 1n).toString(16), call), readAt(header.number, call)]);
    assert.equal(header.parentHash, before.header.hash); assert.equal(header.hash, after.header.hash);
    assert.deepEqual(retained.prepared.head, { number: before.header.number, hash: before.header.hash, timestamp: before.header.timestamp },
      'EVM_DELIVERY_SIGNED_PREPARATION_BLOCK');
    assert.equal(retained.prepared.funds.targetCodeHash, router.codeHash, 'EVM_DELIVERY_SIGNED_CODE_HASH');
    const normalizedReceipt = { transactionHash: query.transactionHash, blockNumber: height.toString(), blockHash: bare(header.hash),
      blockTimestamp: quantity(header.timestamp).toString(), status: '1', from: id.solver, to: id.router, value: wire.value, input: wire.data,
      logs: receipt.logs.map(log => ({ address: bare(log.address, 20), topics: log.topics.map(value => bare(value)),
        data: log.data.slice(2), logIndex: quantity(log.logIndex).toString(), removed: log.removed })) };
    const checked = inspectEvmVaultDeliveryTransition({ call, receipt: normalizedReceipt, before: before.transition, after: after.transition,
      parentHash: bare(header.parentHash) });
    assert.deepEqual(after.decoded.nullifiers, before.decoded.nullifiers, 'EVM_DELIVERY_SPENT_LEDGER_CHANGED');
    assert.deepEqual(after.decoded.roots, [...before.decoded.roots, after.decoded.publicState.root], 'EVM_DELIVERY_EXACT_ROOT_APPEND');
    assert.equal(after.authorizationNodes, before.authorizationNodes, 'EVM_DELIVERY_AUTHORIZATION_TREE_CHANGED');
    assert.equal(after.authorizationHistory, before.authorizationHistory, 'EVM_DELIVERY_AUTHORIZATION_HISTORY_CHANGED');
    const publicInputs = call.descriptor.publicInputs.map(value => BigInt('0x' + value).toString());
    assert.equal(await system.verify('deposit_intent', Buffer.from(call.proof, 'hex'), publicInputs, before.header.number), true,
      'EVM_DELIVERY_ORIGINAL_D27_PROOF');
    const p = after.decoded.publicState, stateAdvanced = decodeGenericBalanceStateAdvanced(receipt, pool.address);
    assert.deepEqual(stateAdvanced, { address: id.targetPool, transactionHash: query.transactionHash, blockHash: bare(header.hash),
      sequence: p.sequence, root: p.root, spent: p.spentDigest, leaves: p.leaves, consumed: p.spent }, 'EVM_DELIVERY_STATE_ADVANCED');
    // Reconstruct current whole-system identities/backing and recapture latest
    // router code. Missing/reorged history and concurrent head changes fail.
    const current = await reader.read(), currentPins = await router.read(current.header.number);
    assert.equal(currentPins.blockHash, current.header.hash); assert.ok(quantity(current.header.number) >= height, 'EVM_DELIVERY_OBSERVED_TIP_BEHIND');
    await runtime.checkReceipt(receipt); await runtime.assertCanonical(before.header); await runtime.assertCanonical(after.header);
    await reader.assertCurrent(current);
    const balances = view => ({ blockHash: bare(view.header.hash), poolBalance: view.transition.poolShares,
      shareTotalSupply: view.transition.vaultShares, vaultUnderlyingBalance: view.transition.vaultAssets,
      solverUnderlyingBalance: view.transition.solverAssets, routerUnderlyingBalance: view.transition.routerAssets,
      routerShareBalance: view.transition.routerShares });
    const observation = detached({ identitySHA256,
      transaction: { hash: query.transactionHash, from: id.solver, to: id.router, value: '0', calldata: wire.data },
      receipt: { transactionHash: query.transactionHash, blockHash: bare(header.hash), status: 1 },
      before: before.snapshot, after: after.snapshot, stateAdvanced,
      delivery: { descriptor: call.descriptor, descriptorCommitment: checked.descriptorCommitment,
        receiptKeyCommitment: call.receiptKeyCommitment, publicInputs },
      deliveryEvent: { address: id.router, transactionHash: query.transactionHash, blockHash: bare(header.hash), position: 0,
        ledgerNamespace: id.ledgerNamespace, receiptKeyCommitment: call.receiptKeyCommitment,
        descriptorCommitment: checked.descriptorCommitment, outputCommitment: checked.outputCommitment, shareAmount: checked.shareAmount },
      assetObservation: { kind: 'EVM_VAULT_DELIVERY', token: id.vault, codeHash: bare(asset.codeHash), pool: id.targetPool,
        underlyingToken: id.asset, underlyingCodeSHA256: id.assetCodeSHA256, vault: id.vault, router: id.router, solver: id.solver,
        underlyingAmount: checked.assetAmount, shareAmount: checked.shareAmount, before: balances(before), after: balances(after) } });
    issuedObservations.set(observation, observer);
    return { observation, call, wire, header, tip: current.header };
  }
  const observer = Object.freeze({ identity: id,
    binding: detached({ poolIndex, recipientIndex: String(poolIndex), genesis: id.genesisHash, asset: id.shareIdentity,
      sourceEndpoint: id.solver, destinationEndpoint: id.router }),
    classification: 'OWNED_LOCAL_EVM_DELIVERY_OBSERVER_NOT_PUBLIC_CONSENSUS',
    async observe(query) { return (await inspect(query))?.observation ?? null; },
    /** Called inside the runtime's final guard, before its final source-state
     * assertion. Read-only and assert-only; no caller callback or RPC seam. */
    async assertPrepared(input) {
      exactRecord(input, ['prepared', 'intent']);
      const { prepared, intent } = detached(input);
      exactRecord(prepared, ['genesis', 'head', 'transaction', 'unsignedWire', 'funds']);
      exactRecord(prepared.head, ['number', 'hash', 'timestamp']);
      exactRecord(prepared.transaction, ['chainId', 'from', 'to', 'nonce', 'gasPrice', 'gas', 'value', 'data']);
      exactRecord(prepared.funds, ['balanceWei', 'estimatedGas', 'targetCodeHash']);
      const calldata = encodeEvmVaultDeliveryCall(intent), call = decodeEvmVaultDeliveryCall(calldata, id);
      assert.deepEqual(intent.descriptor.identity, id, 'EVM_DELIVERY_PREFLIGHT_FIXED_IDENTITY');
      await assertOwnedLocalEvmV2(runtime); assertOwnedFlatSystem(runtime, system); assertOwnedEvmVaultRouter(runtime, system, router);
      assert.equal(prepared.genesis, '0x' + id.genesisHash); assert.equal(prepared.transaction.chainId, '31337');
      assert.equal(prepared.transaction.from, '0x' + id.solver); assert.equal(prepared.transaction.to, router.address);
      assert.equal(prepared.transaction.data, calldata); assert.equal(prepared.transaction.value, '0');
      assert.equal(prepared.transaction.gasPrice, '1000000000'); assert.equal(prepared.transaction.gas, String(LOCAL_EVM_PROFILE.maxGas));
      assert.equal(prepared.funds.targetCodeHash, router.codeHash);
      assert.ok(typeof prepared.unsignedWire === 'string' && /^0x(?:[0-9a-f]{2})+$/.test(prepared.unsignedWire));
      for (const value of [prepared.transaction.nonce, prepared.funds.balanceWei, prepared.funds.estimatedGas])
        assert.ok(typeof value === 'string' && /^(?:0|[1-9][0-9]*)$/.test(value));
      assert.ok(BigInt(prepared.funds.estimatedGas) > 0n && BigInt(prepared.funds.estimatedGas) <= BigInt(prepared.transaction.gas));
      assert.ok(BigInt(prepared.funds.balanceWei) >= BigInt(prepared.transaction.gas) * BigInt(prepared.transaction.gasPrice));
      const current = await reader.read();
      assert.deepEqual(prepared.head, { number: current.header.number, hash: current.header.hash, timestamp: current.header.timestamp },
        'EVM_DELIVERY_PREFLIGHT_HEAD_CHANGED');
      const view = await readAt(current.header.number, intent), s = view.transition, { route } = call.descriptor;
      const statement = decodeEvmVaultDepositStatement(call.descriptor.publicInputs), a = BigInt(route.assetAmount), q = BigInt(route.shareAmount);
      // Owned v2 mines this exact original once at head time + 1.
      const inclusionTime = quantity(current.header.timestamp) + 1n;
      for (const [from, until] of [[route.executionFrom, route.executionUntil], [statement.validFrom, statement.validUntil]])
        assert.ok(inclusionTime >= BigInt(from) && inclusionTime < BigInt(until), 'EVM_DELIVERY_PREFLIGHT_WINDOW');
      assert.equal(s.consumedReceiptKey, '0', 'EVM_DELIVERY_PREFLIGHT_K_CONSUMED');
      assert.equal(s.insertedOutput, '0', 'EVM_DELIVERY_PREFLIGHT_Q_INSERTED');
      assert.equal(s.solverAllowance, route.assetAmount, 'EVM_DELIVERY_PREFLIGHT_SOLVER_ALLOWANCE');
      assert.equal(s.vaultAllowance, '0', 'EVM_DELIVERY_PREFLIGHT_VAULT_ALLOWANCE');
      assert.equal(s.poolAllowance, '0', 'EVM_DELIVERY_PREFLIGHT_POOL_ALLOWANCE');
      assert.ok(BigInt(s.solverAssets) >= a && BigInt(s.vaultAssets) + a < 1n << 128n && BigInt(s.vaultShares) + q < 1n << 128n,
        'EVM_DELIVERY_PREFLIGHT_LIQUIDITY');
      assert.equal(a * (BigInt(s.vaultShares) + 1n) / (BigInt(s.vaultAssets) + 1n), q, 'EVM_DELIVERY_PREFLIGHT_SHARE_PREVIEW');
      assert.ok(BigInt(s.leaves) + 1n + 4n * BigInt(s.reservations) <= 64n
        && BigInt(s.spent) + 5n * BigInt(s.reservations) + BigInt(s.outputs) + 1n <= 64n
        && BigInt(s.historyCount) < 65n && BigInt(s.deliveryCount) < 64n
        && BigInt(s.poolBacked) + q <= 64n * ((1n << 64n) - 1n), 'EVM_DELIVERY_PREFLIGHT_CAPACITY');
      assert.equal(await system.verify('deposit_intent', Buffer.from(call.proof, 'hex'),
        call.descriptor.publicInputs.map(value => BigInt('0x' + value).toString()), current.header.number), true, 'EVM_DELIVERY_PREFLIGHT_D27');
      for (const at of ['latest', 'pending']) assert.equal((await runtime.nonce('0x' + id.solver, at)).toString(), prepared.transaction.nonce,
        'EVM_DELIVERY_PREFLIGHT_NONCE_CHANGED');
      assert.equal((await runtime.balance('0x' + id.solver, current.header.number)).toString(), prepared.funds.balanceWei,
        'EVM_DELIVERY_PREFLIGHT_GAS_BALANCE_CHANGED');
      await runtime.assertCanonical(view.header); await reader.assertCurrent(current);
      return undefined;
    },
    async observeDispatch(query) {
      exactRecord(query, ['transactionHash', 'calldataSHA256']); hash(query.transactionHash); hash(query.calldataSHA256);
      const context = {};
      try {
        const result = await inspect(query, context);
        return detached({ status: result ? 'observed' : 'pending', nativeId: query.transactionHash,
          nativeWire: result ? result.wire.nativeWire.slice(2) : null });
      } catch (error) { return detached({ status: failure(error, context).status, nativeId: query.transactionHash, nativeWire: null }); }
    },
    async observeFacts(query) {
      const context = {};
      try {
      const result = await inspect(query, context); assert.ok(result, 'EVM_DELIVERY_FACTS_UNOBSERVED');
      const confirmations = quantity(result.tip.number) - quantity(result.header.number) + 1n;
      assert.ok(confirmations > 0n && confirmations < 1n << 32n, 'EVM_DELIVERY_CONFIRMATIONS_BOUND');
      const facts = detached({ status: 'observed', genesis: id.genesisHash, asset: id.shareIdentity,
        nativeWire: result.wire.nativeWire.slice(2), intent: result.call, blockId: bare(result.header.hash),
        blockHeight: quantity(result.header.number).toString(), finalityKind: '3', confirmations: confirmations.toString(),
        nativeContext: { observedTipId: bare(result.tip.hash), observedTipHeight: quantity(result.tip.number).toString(),
          transactionSlot: '0', parentSlot: '0', observedSlot: '0' } });
      issuedFacts.set(facts, observer); return facts;
      } catch (error) {
        const facts = detached(failure(error, context)); issuedFacts.set(facts, observer); return facts;
      }
    },
  });
  owned.set(observer, { runtime, system, poolIndex, router }); return observer;
}
