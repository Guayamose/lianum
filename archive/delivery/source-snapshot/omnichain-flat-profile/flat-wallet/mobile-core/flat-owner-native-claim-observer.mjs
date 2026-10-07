/** Private same-head D27 renewal observation. Only actual owned runtime,
 * deployment and claim-observer capabilities can construct this brand. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { exactRecord, bytes32 } from '../wallet-platform/modules/paeg/commitments.mjs';
import { validateDepositIntentStatement } from '../wallet-platform/modules/paeg/deposit-intent.mjs';
import { assertOwnedFlatSystem } from '../wallet-platform/modules/ops/deploy-system.mjs';
import { assertOwnedNativeClaimSystem } from '../wallet-platform/modules/ops/deploy-native-claims.mjs';
import { assertOwnedPoolAsset } from '../wallet-platform/modules/chain-adapters/owned-pool-asset.mjs';
import { assertLocalEvm } from '../wallet-platform/modules/chain-adapters/local-evm-ownership.mjs';
import { assertOwnedLocalEvmV2, assertSignedEvmTransaction } from '../wallet-platform/modules/chain-adapters/owned-evm-v2-runtime.mjs';
import { evmRuntimeCodeHash } from '../wallet-platform/modules/chain-adapters/evm-code-hash.mjs';
import { createFlatSystemStateReader, decodeFlatWords } from '../wallet-platform/modules/paeg/flat-system-state.mjs';
import { assertOwnedClaimObserver, ownedClaimObserverBindings } from '../wallet-platform/modules/native-claims/owned-state.mjs';
import { claimDomainCommitment, claimIntentId, validateClaimConfig, decodeClaimIngressInputs } from '../wallet-platform/modules/native-claims/framing.mjs';
import { decodeDepositIntentInputs } from '../wallet-platform/modules/paeg/deposit-intent.mjs';
import { decodeNativeClaimIssueCall, NATIVE_CLAIM_ISSUE_SIGNATURE, NATIVE_CLAIM_ISSUE_SELECTOR } from '../wallet-platform/modules/native-claims/issue-call.mjs';
import { publicKeccak256 } from '../../../omnichain-product/src/private-cohort-public-native.mjs';
import { decodeGenericBalanceStateAdvanced } from '../../../omnichain-product/src/paeg/generic-balance-observer.mjs';
import { FLAT_OWNER_CLAIM_HANDOFF_PROFILE, flatOwnerIdentity, flatOwnerSnapshot, ownerDigest, ownerCopy } from './flat-owner-custody.mjs';

const owned = new WeakMap();
const sha = raw => createHash('sha256').update(Buffer.from(raw.slice(2), 'hex')).digest('hex');
const one = raw => decodeFlatWords(raw, 1)[0];
const topic = signature => '0x' + publicKeccak256(Buffer.from(signature)).toString('hex');
const ISSUE_TOPIC = topic('IntentIssued(bytes32,bytes32,bytes32,uint64)'), TRANSFER_TOPIC = topic('Transfer(address,address,uint256)');
function bare(value, width = 32) {
  assert.ok(typeof value === 'string' && value.length === width * 2 + 2
    && new RegExp(`^0x[0-9a-f]{${width * 2}}$`).test(value), 'FLAT_OWNER_CLAIM_RPC_HEX');
  return value.slice(2);
}
function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
const copy = value => freeze(ownerCopy(value));

/** Pure receipt parsing only. The owned observer authenticates receipt source,
 * signed-wire identity, canonical ancestry and independently read state. */
export function decodeNativeClaimIssueEvents(receipt, expected) {
  exactRecord(expected, ['gateway', 'wrapper', 'pool', 'intentId', 'admissionN', 'output', 'amount']);
  assert.equal(receipt.status, '0x1', 'FLAT_OWNER_CLAIM_ISSUE_REVERTED');
  bare(receipt.transactionHash); bare(receipt.blockHash);
  for (const [position, log] of receipt.logs.entries()) {
    assert.equal(log.transactionHash, receipt.transactionHash, 'FLAT_OWNER_CLAIM_LOG_TRANSACTION');
    assert.equal(log.blockHash, receipt.blockHash, 'FLAT_OWNER_CLAIM_LOG_BLOCK');
    assert.equal(log.blockNumber, receipt.blockNumber, 'FLAT_OWNER_CLAIM_LOG_NUMBER');
    assert.equal(log.transactionIndex, receipt.transactionIndex, 'FLAT_OWNER_CLAIM_LOG_TRANSACTION_INDEX');
    assert.equal(log.removed, false, 'FLAT_OWNER_CLAIM_LOG_REMOVED');
    assert.equal(BigInt(log.logIndex), BigInt(position), 'FLAT_OWNER_CLAIM_LOG_ORDER');
    bare(log.address, 20); log.topics.forEach(value => bare(value));
    assert.ok(typeof log.data === 'string' && /^0x(?:[0-9a-f]{2})*$/.exec(log.data)?.[0] === log.data, 'FLAT_OWNER_CLAIM_LOG_DATA');
  }
  const matches = receipt.logs.map((log, position) => ({ log, position })).filter(({ log }) =>
    log.address === '0x' + expected.gateway && log.topics[0] === ISSUE_TOPIC);
  assert.equal(matches.length, 1, 'FLAT_OWNER_CLAIM_SOLE_ISSUE_EVENT');
  const { log, position } = matches[0], data = decodeFlatWords(log.data, 2);
  assert.deepEqual(log.topics, [ISSUE_TOPIC, '0x' + expected.intentId, '0x' + expected.admissionN], 'FLAT_OWNER_CLAIM_ISSUE_TOPICS');
  assert.equal(bare(data[0]), expected.output, 'FLAT_OWNER_CLAIM_ISSUE_OUTPUT');
  assert.equal(BigInt(data[1]).toString(), expected.amount, 'FLAT_OWNER_CLAIM_ISSUE_AMOUNT');
  const transfers = receipt.logs.filter(row => row.address === '0x' + expected.wrapper && row.topics[0] === TRANSFER_TOPIC);
  assert.equal(transfers.length, 2, 'FLAT_OWNER_CLAIM_EXACT_MINT_TRANSFER');
  const addressTopic = value => '0x' + value.padStart(64, '0');
  for (const [i, [from, to]] of [['0'.repeat(40), expected.gateway], [expected.gateway, expected.pool]].entries()) {
    assert.deepEqual(transfers[i].topics, [TRANSFER_TOPIC, addressTopic(from), addressTopic(to)], 'FLAT_OWNER_CLAIM_MINT_ROUTE');
    assert.equal(BigInt(one(transfers[i].data)).toString(), expected.amount, 'FLAT_OWNER_CLAIM_MINT_AMOUNT');
  }
  return copy({ address: expected.gateway, transactionHash: bare(receipt.transactionHash), blockHash: bare(receipt.blockHash),
    position, intentId: expected.intentId, nullifier: expected.admissionN, output: expected.output, amount: expected.amount });
}

async function originalIssue(runtime, query, gateway) {
  await assertOwnedLocalEvmV2(runtime);
  const hash = '0x' + query.transactionHash, matches = runtime.transactions.filter(row => row.transactionHash === hash);
  if (matches.length === 0) return null;
  assert.equal(matches.length, 1, 'FLAT_OWNER_CLAIM_ORIGINAL_TRANSACTION');
  const retained = matches[0];
  assert.ok(retained.signed && retained.prepared, 'FLAT_OWNER_CLAIM_ORIGINAL_SIGNED_WIRE');
  const signed = await runtime.signedTransaction(hash);
  assert.deepEqual(signed, retained.signed, 'FLAT_OWNER_CLAIM_ORIGINAL_WIRE');
  const wire = assertSignedEvmTransaction(signed.nativeWire, retained.prepared.transaction);
  assert.equal(wire.nativeId, hash); assert.equal(signed.nativeId, hash);
  assert.equal(wire.transactionSHA256, signed.transactionSHA256); assert.equal(wire.unsignedWire, retained.prepared.unsignedWire);
  assert.equal(wire.to, gateway.address, 'FLAT_OWNER_CLAIM_ISSUE_TARGET'); assert.equal(wire.value, '0', 'FLAT_OWNER_CLAIM_ISSUE_VALUE');
  assert.ok(runtime.accounts.includes(wire.from), 'FLAT_OWNER_CLAIM_ISSUE_SENDER');
  assert.equal(wire.chainId, runtime.metadata.chainId); assert.equal(retained.prepared.genesis, runtime.metadata.evmGenesis);
  assert.equal(wire.nonce, BigInt(retained.senderNonce).toString());
  for (const key of ['from', 'to']) assert.equal(retained.request[key], wire[key]);
  assert.equal(retained.request.data, wire.data);
  for (const key of ['value', 'gas']) assert.equal(BigInt(retained.request[key] ?? '0x0').toString(), wire[key]);
  assert.equal(sha(wire.data), query.calldataSHA256, 'FLAT_OWNER_CLAIM_ISSUE_CALLDATA');
  assert.equal(gateway.artifact.evm.methodIdentifiers[NATIVE_CLAIM_ISSUE_SIGNATURE], NATIVE_CLAIM_ISSUE_SELECTOR,
    'FLAT_OWNER_CLAIM_PINNED_ISSUE_METHOD');
  const call = decodeNativeClaimIssueCall(wire.data);
  const [transaction, receipt] = await Promise.all([runtime.transaction(hash), runtime.receipt(hash)]);
  if (transaction === null || receipt === null) return null;
  if (retained.receipt !== undefined) assert.deepEqual(receipt, retained.receipt, 'FLAT_OWNER_CLAIM_ORIGINAL_RECEIPT');
  assert.equal(receipt.status, '0x1', 'FLAT_OWNER_CLAIM_ISSUE_REVERTED'); assert.equal(receipt.contractAddress, null);
  assert.equal(transaction.hash, hash); assert.equal(receipt.transactionHash, hash);
  for (const key of ['chainId', 'nonce', 'gasPrice', 'gas', 'value']) assert.equal(BigInt(transaction[key]).toString(), wire[key]);
  for (const key of ['from', 'to']) { assert.equal(transaction[key], wire[key]); assert.equal(receipt[key], wire[key]); }
  assert.equal(transaction.input, wire.data); assert.equal(transaction.blockHash, receipt.blockHash);
  assert.equal(transaction.blockNumber, receipt.blockNumber); assert.equal(transaction.transactionIndex, receipt.transactionIndex);
  assert.equal(BigInt(receipt.transactionIndex), 0n);
  assert.ok(BigInt(receipt.gasUsed) > 0n && BigInt(receipt.gasUsed) <= BigInt(wire.gas), 'FLAT_OWNER_CLAIM_ISSUE_GAS');
  const header = await runtime.assertCanonical(receipt);
  assert.deepEqual(header.transactions, [hash], 'FLAT_OWNER_CLAIM_ISSUE_SINGLE_TRANSACTION');
  assert.ok(BigInt(header.number) > 0n, 'FLAT_OWNER_CLAIM_ISSUE_GENESIS');
  return { retained, wire, transaction, receipt, header, call };
}

/** Pure query framing only. It cannot authenticate a supplied observer or view. */
export function validateFlatOwnerNativeClaimQuery(input, identity, config) {
  const query = ownerCopy(input);
  exactRecord(query, ['identitySHA256', 'claimDomain', 'intentIdentitySHA256', 'handoffIdentitySHA256', 'statement', 'proofSHA256', 'submission']);
  const id = flatOwnerIdentity(identity), c = validateClaimConfig(config), statement = validateDepositIntentStatement(query.statement);
  for (const key of ['identitySHA256', 'claimDomain', 'intentIdentitySHA256', 'handoffIdentitySHA256', 'proofSHA256']) bytes32(query[key], true);
  assert.equal(query.identitySHA256, ownerDigest(id), 'FLAT_OWNER_CLAIM_IDENTITY');
  assert.equal(query.claimDomain, claimDomainCommitment(c), 'FLAT_OWNER_CLAIM_DOMAIN');
  assert.equal(c.pool, id.pool, 'FLAT_OWNER_CLAIM_POOL');
  assert.equal(c.poolDomain, id.domainCommitment, 'FLAT_OWNER_CLAIM_POOL_DOMAIN');
  assert.equal(c.scope, id.domain.scope, 'FLAT_OWNER_CLAIM_CONFIG_SCOPE');
  assert.equal(c.policy, id.domain.policy, 'FLAT_OWNER_CLAIM_CONFIG_POLICY');
  assert.equal(c.wrapper, id.assetBinding?.token, 'FLAT_OWNER_CLAIM_CONFIG_WRAPPER');
  assert.equal(c.wrapperCodeHash, id.assetBinding?.codeHash, 'FLAT_OWNER_CLAIM_CONFIG_WRAPPER_CODE');
  assert.equal(statement.scope, id.domain.scope, 'FLAT_OWNER_CLAIM_SCOPE');
  assert.equal(statement.policy, id.domain.policy, 'FLAT_OWNER_CLAIM_POLICY');
  assert.equal(query.intentIdentitySHA256, ownerDigest({ profile: FLAT_OWNER_CLAIM_HANDOFF_PROFILE,
    identitySHA256: query.identitySHA256, claimDomain: query.claimDomain,
    scope: statement.scope, policy: statement.policy, amount: statement.amount, output: statement.output }), 'FLAT_OWNER_CLAIM_INTENT_IDENTITY');
  if (query.submission !== null) {
    exactRecord(query.submission, ['transactionHash', 'calldataSHA256']);
    bytes32(query.submission.transactionHash, true); bytes32(query.submission.calldataSHA256, true);
  }
  return copy(query);
}

export function assertOwnedFlatOwnerNativeClaimObserver(observer, { runtime, system, poolIndex }) {
  const record = owned.get(observer);
  assert.ok(record && record.runtime === runtime && record.system === system && record.poolIndex === poolIndex,
    'FLAT_OWNER_OWNED_NATIVE_CLAIM_OBSERVER_REQUIRED');
  assertOwnedFlatSystem(runtime, system); assertOwnedNativeClaimSystem(runtime, record.claims);
  assertOwnedClaimObserver(record.claimObserver);
}

async function resolveSubmission(runtime, submission, current) {
  if (submission === null) return null;
  // Legacy eth_sendTransaction setup receipts have no retained signed wire and
  // cannot clear a delivery latch, even when their status is zero.
  await assertOwnedLocalEvmV2(runtime);
  const hash = '0x' + submission.transactionHash;
  const matches = runtime.transactions.filter(row => row.transactionHash === hash && row.signed && row.prepared);
  if (matches.length === 0) return null;
  assert.equal(matches.length, 1, 'FLAT_OWNER_CLAIM_AMBIGUOUS_SIGNED_TRANSACTION');
  const retained = matches[0], signed = await runtime.signedTransaction(hash);
  assert.deepEqual(signed, retained.signed, 'FLAT_OWNER_CLAIM_RETAINED_WIRE');
  const verified = assertSignedEvmTransaction(signed.nativeWire, retained.prepared.transaction);
  assert.equal(verified.nativeId, hash, 'FLAT_OWNER_CLAIM_SIGNED_HASH');
  assert.equal(verified.transactionSHA256, signed.transactionSHA256, 'FLAT_OWNER_CLAIM_SIGNED_BYTES');
  assert.equal(verified.nativeId, signed.nativeId, 'FLAT_OWNER_CLAIM_SIGNED_ID');
  assert.equal(verified.unsignedWire, retained.prepared.unsignedWire, 'FLAT_OWNER_CLAIM_UNSIGNED_WIRE');
  assert.equal(verified.chainId, runtime.metadata.chainId, 'FLAT_OWNER_CLAIM_SIGNED_CHAIN');
  assert.equal(retained.prepared.genesis, runtime.metadata.evmGenesis, 'FLAT_OWNER_CLAIM_SIGNED_GENESIS');
  assert.ok(runtime.accounts.includes(verified.from), 'FLAT_OWNER_CLAIM_SIGNED_SENDER');
  assert.equal(sha(verified.data), submission.calldataSHA256, 'FLAT_OWNER_CLAIM_SIGNED_CALLDATA');
  assert.equal(retained.request.data, verified.data, 'FLAT_OWNER_CLAIM_RETAINED_CALLDATA');
  assert.equal(retained.request.to, verified.to, 'FLAT_OWNER_CLAIM_RETAINED_TARGET');
  assert.equal(retained.request.from, verified.from, 'FLAT_OWNER_CLAIM_RETAINED_SENDER');
  assert.equal(BigInt(retained.senderNonce).toString(), verified.nonce, 'FLAT_OWNER_CLAIM_RETAINED_NONCE');
  assert.equal(BigInt(retained.request.value ?? '0x0').toString(), verified.value, 'FLAT_OWNER_CLAIM_RETAINED_VALUE');
  const [transaction, receipt] = await Promise.all([runtime.transaction(hash), runtime.receipt(hash)]);
  if (transaction === null || receipt === null) return null;
  assert.equal(receipt.status, '0x0', 'FLAT_OWNER_CLAIM_SUBMISSION_NOT_REVERTED');
  assert.equal(receipt.transactionHash, hash, 'FLAT_OWNER_CLAIM_RECEIPT_TRANSACTION');
  assert.equal(transaction.hash, hash, 'FLAT_OWNER_CLAIM_TRANSACTION');
  assert.equal(transaction.input, verified.data, 'FLAT_OWNER_CLAIM_TRANSACTION_CALLDATA');
  for (const name of ['from', 'to']) assert.equal(transaction[name], verified[name], 'FLAT_OWNER_CLAIM_TRANSACTION_' + name);
  for (const name of ['chainId', 'nonce', 'gasPrice', 'gas', 'value'])
    assert.equal(BigInt(transaction[name]).toString(), verified[name], 'FLAT_OWNER_CLAIM_TRANSACTION_' + name);
  assert.equal(transaction.blockHash, receipt.blockHash, 'FLAT_OWNER_CLAIM_RECEIPT_BLOCK');
  assert.equal(transaction.blockNumber, receipt.blockNumber, 'FLAT_OWNER_CLAIM_RECEIPT_NUMBER');
  const before = await runtime.assertCanonical(receipt), preparation = await runtime.assertCanonical(retained.prepared.head);
  assert.equal(before.parentHash, preparation.hash, 'FLAT_OWNER_CLAIM_PREPARATION_PARENT');
  assert.equal(BigInt(before.number), BigInt(preparation.number) + 1n, 'FLAT_OWNER_CLAIM_PREPARATION_NUMBER');
  assert.deepEqual(before.transactions, [hash], 'FLAT_OWNER_CLAIM_SINGLE_TRANSACTION_BLOCK');
  assert.equal(BigInt(receipt.transactionIndex), 0n, 'FLAT_OWNER_CLAIM_RECEIPT_INDEX');
  assert.ok(BigInt(before.number) <= BigInt(current.header.number), 'FLAT_OWNER_CLAIM_FUTURE_RECEIPT');
  const [preparedCode, receiptCode] = await Promise.all([runtime.code(verified.to, preparation.number), runtime.code(verified.to, before.number)]);
  assert.equal(evmRuntimeCodeHash(preparedCode), retained.prepared.funds.targetCodeHash, 'FLAT_OWNER_CLAIM_SIGNED_TARGET_CODE');
  assert.equal(receiptCode, preparedCode, 'FLAT_OWNER_CLAIM_RECEIPT_TARGET_CODE');
  await runtime.checkReceipt(receipt);
  const after = await runtime.assertCanonical(receipt);
  await runtime.assertCanonical(preparation); await runtime.assertCanonical(current.header);
  assert.equal(after.hash, before.hash, 'FLAT_OWNER_CLAIM_RECEIPT_REORG');
  // Both the original preparation/receipt and current gateway snapshot are
  // members of the same owned canonical chain. No timer or absent RPC result
  // can establish this resolution, and it never changes runtime lifecycle.
  return copy({ ...submission, receipt: { transactionHash: submission.transactionHash, blockHash: bare(receipt.blockHash), status: 0 },
    canonicalBlockHashBefore: bare(before.hash), canonicalBlockHashAfter: bare(after.hash) });
}

const completedPhases = new Set(['mined', 'mined-reverted', 'reconciled-mined', 'reconciled-reverted']);
function renewalJournal(runtime) {
  const journal = copy({ transactions: runtime.transactions, mutationStatus: runtime.mutationStatus });
  exactRecord(journal.mutationStatus, ['busy', 'uncertain']);
  for (const value of Object.values(journal.mutationStatus)) assert.equal(typeof value, 'boolean', 'FLAT_OWNER_CLAIM_RUNTIME_STATUS');
  assert.ok(Array.isArray(journal.transactions), 'FLAT_OWNER_CLAIM_RUNTIME_JOURNAL');
  assert.equal(journal.mutationStatus.busy, false, 'FLAT_OWNER_CLAIM_RUNTIME_BUSY');
  return journal;
}

async function assertRenewalJournal(runtime, gateway, statement, current) {
  // An offline owner may never have received the local submission latch. The
  // original runtime journal is an independent fence before same-Q renewal.
  await assertOwnedLocalEvmV2(runtime);
  const journal = renewalJournal(runtime), resolved = new Set();
  for (const entry of journal.transactions) {
    if (entry.phase === 'pre-sign-rejected' && !entry.signed) continue;
    const request = entry.prepared?.transaction ?? entry.request;
    if (request?.to !== gateway.address) continue;
    if (typeof request.data !== 'string') throw new Error('FLAT_OWNER_CLAIM_UNKNOWN_GATEWAY_SUBMISSION');
    if (request.data.slice(2, 10) !== NATIVE_CLAIM_ISSUE_SELECTOR) continue;
    // Decode the actual retained call, including both complete proof tuples.
    // Malformed retained issue calldata is an unknown result, never absence.
    const call = decodeNativeClaimIssueCall(request.data);
    const original = decodeDepositIntentInputs(call.ownerProof.inputs.map(value => BigInt(value).toString()));
    if (original.output !== statement.output) continue;
    assert.equal(original.scope, statement.scope, 'FLAT_OWNER_CLAIM_JOURNAL_SCOPE');
    assert.equal(original.policy, statement.policy, 'FLAT_OWNER_CLAIM_JOURNAL_POLICY');
    assert.equal(original.amount, statement.amount, 'FLAT_OWNER_CLAIM_JOURNAL_AMOUNT');
    assert.ok(entry.signed && entry.prepared && entry.transactionHash, 'FLAT_OWNER_CLAIM_UNKNOWN_ISSUE_WIRE');
    const submission = { transactionHash: bare(entry.transactionHash), calldataSHA256: sha(request.data) };
    const resolution = await resolveSubmission(runtime, submission, current);
    assert.ok(resolution, 'FLAT_OWNER_CLAIM_UNKNOWN_OFFLINE_ISSUE');
    resolved.add(entry);
  }
  const uncertain = journal.transactions.filter(entry => !completedPhases.has(entry.phase)
    && !(entry.phase === 'pre-sign-rejected' && !entry.signed));
  // A time/mining/signing uncertainty or another operation's pending effect
  // cannot be cleared by this note's historical reverted transaction.
  for (const entry of uncertain) assert.ok(resolved.has(entry)
    && entry.uncertaintyCause === 'original-signed-broadcast', 'FLAT_OWNER_CLAIM_RUNTIME_UNKNOWN');
  if (journal.mutationStatus.uncertain) assert.ok(uncertain.length > 0, 'FLAT_OWNER_CLAIM_UNRELATED_RUNTIME_UNKNOWN');
  assert.deepEqual(renewalJournal(runtime), journal, 'FLAT_OWNER_CLAIM_JOURNAL_CHANGED');
  return journal;
}

export async function createFlatOwnerNativeClaimObserver(input) {
  exactRecord(input, ['runtime', 'system', 'poolIndex', 'claims', 'claimObserver']);
  const { runtime, system, poolIndex, claims, claimObserver } = input;
  assertOwnedFlatSystem(runtime, system); assertOwnedNativeClaimSystem(runtime, claims); assertOwnedClaimObserver(claimObserver);
  await assertLocalEvm(runtime);
  assert.equal(claims.flatSystem, system, 'FLAT_OWNER_CLAIM_SYSTEM');
  const bindings = ownedClaimObserverBindings(claimObserver);
  assert.equal(bindings.system, claims, 'FLAT_OWNER_CLAIM_OBSERVER_SYSTEM');
  assert.equal(bindings.runtime, runtime, 'FLAT_OWNER_CLAIM_OBSERVER_RUNTIME');
  assert.ok(Number.isSafeInteger(poolIndex) && !Object.is(poolIndex, -0) && poolIndex >= 0 && poolIndex < claims.gateways.length,
    'FLAT_OWNER_CLAIM_POOL_INDEX');
  const pool = system.pools[poolIndex], config = claims.configs[poolIndex];
  assertOwnedPoolAsset(runtime, pool.assetCapability);
  assert.equal(pool.assetCapability.metadata.kind, 'ERC20', 'FLAT_OWNER_CLAIM_WRAPPER_REQUIRED');
  const identity = flatOwnerIdentity({ pool: bare(pool.address, 20), domain: pool.domain, domainCommitment: bare(pool.domainCommitment),
    assetBinding: { token: bare(pool.asset, 20), codeHash: bare(pool.assetCodeHash) } });
  const reader = await createFlatSystemStateReader({ runtime, system, poolIndex });
  const gateway = claims.gateways[poolIndex], wrapper = claims.wrappers[poolIndex], identitySHA256 = ownerDigest(identity);
  async function readIssueAt(blockNumber, intentId, ingress, statement) {
    const [claimView, flat] = await Promise.all([claimObserver.readHistorical(blockNumber), reader.readHistorical(blockNumber)]);
    assert.deepEqual(claimView.head, flat.head, 'FLAT_OWNER_CLAIM_ISSUE_SAME_HEAD');
    const at = flat.header.number, state = claimView.gateways[poolIndex], intent = state.intents.find(row => row.id === intentId);
    assert.ok(intent, 'FLAT_OWNER_CLAIM_ISSUE_INTENT_MISSING');
    const requests = {
      reservation: claimObserver.readHistoricalReservation({ claimDomain: state.claimDomain, admissionN: ingress.admissionN }, claimView),
      receiptReservation: claims.authority.call('receiptReservation(address,bytes32)', [gateway.address, '0x' + intentId], at),
      reservedReceiptCapacity: claims.authority.call('reservedReceiptCapacity(address)', [pool.address], at),
      reservationOwner: claims.authority.call('reservationOwner(bytes32)', ['0x' + ingress.admissionN], at),
      operationNullifier: claims.authority.call('operationNullifier(address,bytes32)', [gateway.address, '0x' + intentId], at),
      admissionNullifier: system.hub.call('admissionNullifiers(bytes32)', ['0x' + ingress.admissionN], at),
      poolBalance: wrapper.call('balanceOf(address)', [pool.address], at), wrapperSupply: wrapper.call('totalSupply()', [], at),
      gatewayBalance: wrapper.call('balanceOf(address)', [gateway.address], at),
      gatewayAllowance: wrapper.call('allowance(address,address)', [gateway.address, pool.address], at),
      insertedOutput: pool.call('insertedCommitments(bytes32)', ['0x' + statement.output], at),
    };
    const data = Object.fromEntries(await Promise.all(Object.entries(requests).map(async ([key, value]) => [key, await value])));
    assert.ok(data.reservation, 'FLAT_OWNER_CLAIM_ISSUE_RESERVATION_MISSING');
    const snapshot = { identitySHA256, blockHash: flat.head.hash, canonicalBlockHashBefore: flat.head.hash,
      canonicalBlockHashAfter: flat.head.hash, timestamp: flat.head.timestamp,
      ...Object.fromEntries(['rawState', 'rawHistory', 'rawBacking'].map(name => [name, flat.poolObservation[name]])) };
    const balances = { blockHash: flat.head.hash, ...Object.fromEntries(['poolBalance', 'wrapperSupply', 'gatewayBalance', 'gatewayAllowance']
      .map(key => [key, BigInt(one(data[key])).toString()])) };
    assert.equal(balances.poolBalance, flat.ledger.publicState.actualAssetBalance, 'FLAT_OWNER_CLAIM_ACTUAL_POOL_BALANCE');
    assert.equal(balances.wrapperSupply, state.wrapperSupply, 'FLAT_OWNER_CLAIM_ACTUAL_SUPPLY');
    const ownerWord = one(data.reservationOwner);
    assert.ok(BigInt(ownerWord) < 1n << 160n, 'FLAT_OWNER_CLAIM_RESERVATION_OWNER');
    assert.ok(BigInt(one(data.admissionNullifier)) <= 1n, 'FLAT_OWNER_CLAIM_CONSUMED_N');
    const claimState = { blockHash: flat.head.hash, intent, reservation: data.reservation,
      receiptReservation: BigInt(one(data.receiptReservation)).toString(), reservedReceiptCapacity: BigInt(one(data.reservedReceiptCapacity)).toString(),
      reservationOwner: ownerWord.slice(-40), operationNullifier: bare(one(data.operationNullifier)), admissionNullifier: BigInt(one(data.admissionNullifier)) === 1n,
      ...Object.fromEntries(['claimSequence', 'pendingRedemptions', 'pendingRefunds', 'heldUnissued', 'reservedFees', 'reservedRefundTickets', 'activePayout']
        .map(key => [key, state[key]])),
      hubState: flat.state, receiptLeaves: flat.receiptLeaves.slice(0, Number(flat.state.receiptCount)),
      admissionRevocationState: flat.admissionRevocationState, revocationOverflowCount: flat.overflow.count };
    await Promise.all([reader.assertCanonical(flat), claimObserver.assertCanonical(claimView)]);
    return { flat, claimView, snapshot, balances, claimState, insertedOutput: BigInt(one(data.insertedOutput)).toString() };
  }
  async function readDepositIntentDelivery(input) {
    assertOwnedFlatOwnerNativeClaimObserver(observer, { runtime, system, poolIndex });
    const query = ownerCopy(input);
    exactRecord(query, ['identitySHA256', 'transactionHash', 'calldataSHA256', 'publicInputs']);
    assert.equal(query.identitySHA256, identitySHA256, 'FLAT_OWNER_CLAIM_ISSUE_IDENTITY');
    bytes32(query.transactionHash, true); bytes32(query.calldataSHA256, true);
    const statement = decodeDepositIntentInputs(query.publicInputs);
    assert.equal(statement.scope, config.scope); assert.equal(statement.policy, config.policy);
    const included = await originalIssue(runtime, query, gateway);
    if (included === null) return null;
    const { retained, wire, receipt, header, call } = included;
    const publicInputs = call.ownerProof.inputs.map(value => BigInt(value).toString());
    assert.deepEqual(publicInputs, query.publicInputs, 'FLAT_OWNER_CLAIM_ISSUE_D27');
    const ingressPublicInputs = call.ingressProof.inputs.map(value => BigInt(value).toString()), ingress = decodeClaimIngressInputs(ingressPublicInputs);
    const claimDomain = claimDomainCommitment(config);
    assert.equal(ingress.claimDomain, claimDomain, 'FLAT_OWNER_CLAIM_ISSUE_DOMAIN');
    assert.equal(ingress.outputQ, statement.output); assert.equal(ingress.amountQ, statement.amount);
    const intentId = claimIntentId({ claimDomain, outputQ: statement.output, amount: statement.amount });
    const beforeNumber = '0x' + (BigInt(header.number) - 1n).toString(16);
    const [before, after] = await Promise.all([readIssueAt(beforeNumber, intentId, ingress, statement), readIssueAt(header.number, intentId, ingress, statement)]);
    assert.equal(header.parentHash, before.flat.header.hash, 'FLAT_OWNER_CLAIM_ISSUE_PARENT');
    assert.equal(header.hash, after.flat.header.hash, 'FLAT_OWNER_CLAIM_ISSUE_RECEIPT_HEAD');
    assert.deepEqual(retained.prepared.head, { number: before.flat.header.number, hash: before.flat.header.hash, timestamp: before.flat.header.timestamp },
      'FLAT_OWNER_CLAIM_ISSUE_PREPARATION');
    assert.equal(retained.prepared.funds.targetCodeHash, gateway.codeHash, 'FLAT_OWNER_CLAIM_ISSUE_SIGNED_CODE');
    assert.equal(before.insertedOutput, '0', 'FLAT_OWNER_CLAIM_ISSUE_Q_PREEXISTING');
    assert.equal(after.insertedOutput, '1', 'FLAT_OWNER_CLAIM_ISSUE_Q_MAPPING');
    assert.deepEqual(after.flat.authorizationTree.nodes, before.flat.authorizationTree.nodes, 'FLAT_OWNER_CLAIM_ISSUE_AUTH_TREE');
    assert.deepEqual(after.flat.authorizationRoots, before.flat.authorizationRoots, 'FLAT_OWNER_CLAIM_ISSUE_AUTH_HISTORY');
    assert.deepEqual(after.flat.checkpointTree.nodes, before.flat.checkpointTree.nodes, 'FLAT_OWNER_CLAIM_ISSUE_CHECKPOINTS');
    const verified = await Promise.all([
      system.verify('deposit_intent', Buffer.from(call.ownerProof.proof.slice(2), 'hex'), publicInputs, beforeNumber),
      claims.verifiers.CI51.call('verify(bytes,bytes32[])', [call.ingressProof.proof, call.ingressProof.inputs], beforeNumber),
    ]);
    assert.equal(verified[0], true, 'FLAT_OWNER_CLAIM_ORIGINAL_D27_PROOF');
    assert.equal(BigInt(one(verified[1])), 1n, 'FLAT_OWNER_CLAIM_ORIGINAL_CI51_PROOF');
    const deliveryEvent = decodeNativeClaimIssueEvents(receipt, { gateway: config.gateway, wrapper: config.wrapper, pool: config.pool,
      intentId, admissionN: ingress.admissionN, output: statement.output, amount: statement.amount });
    const observation = copy({ kind: 'NATIVE_CLAIM_ISSUE', identitySHA256,
      transaction: { hash: query.transactionHash, from: bare(wire.from, 20), to: config.gateway, value: wire.value, calldata: wire.data },
      receipt: { transactionHash: query.transactionHash, blockHash: bare(header.hash), status: 1 },
      before: before.snapshot, after: after.snapshot, stateAdvanced: decodeGenericBalanceStateAdvanced(receipt, pool.address),
      delivery: { config, claimDomain, intentId, revision: before.claimState.intent.revision, publicInputs,
        ownerProof: call.ownerProof.proof.slice(2), ingressPublicInputs, ingressProof: call.ingressProof.proof.slice(2) },
      deliveryEvent, assetObservation: { kind: 'NATIVE_CLAIM_MINT', token: config.wrapper, codeHash: config.wrapperCodeHash,
        pool: config.pool, gateway: config.gateway, before: before.balances, after: after.balances },
      claimObservation: { before: before.claimState, after: after.claimState } });
    const { validateNativeClaimIssueObservation } = await import('./flat-owner-claim-transition.mjs');
    validateNativeClaimIssueObservation(observation, { identity, statement, ownerProof: call.ownerProof.proof.slice(2), publicInputs, claimDomain },
      { transactionHash: query.transactionHash, calldataSHA256: query.calldataSHA256 });
    // Historical canonicality proves this receipt. Fresh complete state is
    // independently required before this observation can credit current custody.
    const [currentClaims, currentFlat] = await Promise.all([claimObserver.read(), reader.read()]);
    assert.deepEqual(currentClaims.head, currentFlat.head, 'FLAT_OWNER_CLAIM_ISSUE_CURRENT_HEAD');
    assert.ok(BigInt(currentFlat.head.number) >= BigInt(after.flat.head.number), 'FLAT_OWNER_CLAIM_ISSUE_TIP_BEHIND');
    const currentIntent = currentClaims.gateways[poolIndex].intents.find(row => row.id === intentId);
    assert.deepEqual(currentIntent, after.claimState.intent, 'FLAT_OWNER_CLAIM_ISSUED_INTENT_CHANGED');
    const currentReservation = await claimObserver.readReservation({ claimDomain, admissionN: ingress.admissionN }, currentClaims);
    assert.deepEqual(currentReservation, after.claimState.reservation, 'FLAT_OWNER_CLAIM_ISSUED_RESERVATION_CHANGED');
    await runtime.checkReceipt(receipt);
    await Promise.all([reader.assertCanonical(before.flat), reader.assertCanonical(after.flat),
      claimObserver.assertCanonical(before.claimView), claimObserver.assertCanonical(after.claimView),
      reader.assertCurrent(currentFlat), claimObserver.assertCurrent(currentClaims)]);
    return observation;
  }
  const observer = Object.freeze({
    readDepositIntentDelivery,
    async readNativeClaimIntent(input) {
      assertOwnedFlatOwnerNativeClaimObserver(observer, { runtime, system, poolIndex });
      const query = validateFlatOwnerNativeClaimQuery(input, identity, config);
      const [claimView, flat] = await Promise.all([claimObserver.read(), reader.read()]);
      assert.deepEqual(claimView.head, flat.head, 'FLAT_OWNER_CLAIM_SAME_HEAD');
      const gateway = claimView.gateways[poolIndex], id = claimIntentId({ claimDomain: query.claimDomain,
        outputQ: query.statement.output, amount: query.statement.amount });
      assert.equal(gateway.claimDomain, query.claimDomain, 'FLAT_OWNER_CLAIM_GATEWAY_DOMAIN');
      const intent = gateway.intents.find(row => row.id === id);
      if (!intent) return null;
      assert.equal(intent.state, '1', 'FLAT_OWNER_CLAIM_INTENT_NOT_ACTIVE');
      for (const key of ['output', 'amount', 'validFrom', 'validUntil'])
        assert.equal(intent[key], query.statement[key], 'FLAT_OWNER_CLAIM_STATEMENT_' + key);
      assert.equal(intent.proofHash, query.proofSHA256, 'FLAT_OWNER_CLAIM_PROOF_BINDING');
      const snapshot = { identitySHA256: query.identitySHA256, blockHash: flat.head.hash,
        canonicalBlockHashBefore: flat.head.hash, canonicalBlockHashAfter: flat.head.hash, timestamp: flat.head.timestamp,
        ...Object.fromEntries(['rawState', 'rawHistory', 'rawBacking'].map(name => [name, flat.poolObservation[name]])) };
      const poolView = flatOwnerSnapshot(snapshot, identity);
      assert.ok(!poolView.commitments.includes('0x' + query.statement.output), 'FLAT_OWNER_CLAIM_Q_ALREADY_ISSUED');
      const journal = await assertRenewalJournal(runtime, claims.gateways[poolIndex], query.statement, flat);
      const resolution = await resolveSubmission(runtime, query.submission, flat);
      if (query.submission !== null && resolution === null) return null;
      await Promise.all([claimObserver.assertCurrent(claimView), reader.assertCurrent(flat)]);
      assert.deepEqual(renewalJournal(runtime), journal, 'FLAT_OWNER_CLAIM_JOURNAL_CHANGED');
      return copy({ identitySHA256: query.identitySHA256, claimDomain: query.claimDomain,
        intentIdentitySHA256: query.intentIdentitySHA256, handoffIdentitySHA256: query.handoffIdentitySHA256, snapshot,
        intent: { status: 'ACTIVE_UNISSUED', revision: intent.revision, statement: query.statement, proofSHA256: intent.proofHash },
        submissionResolution: resolution });
    },
  });
  owned.set(observer, { runtime, system, poolIndex, claims, claimObserver }); return observer;
}
