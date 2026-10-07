/**
 * Shared exact note withdrawal reconciliation for a surviving trusted host.
 *
 * This is an in-process capability, not a public IPC service. The constructor
 * receives the ORIGINAL deployed pool, validated note and pinned destination
 * from trusted bootstrap. It neither makes keys nor opens vaults nor dispatches
 * native transfers. The host may restart the original recipient process in
 * recover mode using its separate encrypted vault and an in-memory password.
 * This does not recover a lost host/runtime, protect against a hostile OS, or
 * establish foreign finality. The SAME factory instance must survive coordinator
 * and recipient-process restarts: its uncertain-submit latch is in memory.
 * Reconstructing the instance while a prior send is ambiguous is forbidden;
 * audit records are not a constructor-level restore protocol. An unknown send
 * is never silently retried by the surviving instance.
 *
 * Spent status alone is NOT payment evidence: WITHDRAWN requires a canonical
 * successful transaction whose exact withdraw calldata AND Withdrawal event
 * match the original scope, policy, note nullifier, destination and amount.
 */
import assert from 'node:assert/strict';
import { canonical } from './privacy.mjs';
import { nullifier } from './private-note-encoding.mjs';
import {derivePrivateAssetPoolScope} from './private-asset-runtime.mjs';
import {privateWalletPoolAssetDescriptor,assertPrivateWalletPoolAsset} from './private-wallet-asset-binding.mjs';
import {
  derivePrivatePoolScope, encodePrivatePoolInputs, noteWordsToHash,
  PrivateNoteTree, privateSpentDigest, ZERO_NOTE_HASH,
} from './private-note-tree.mjs';

// keccak256 of the exact deployed-contract ABI signatures, independently
// reproducible with `cast keccak` / `cast sig`; SHA3-256 is not interchangeable.
const WITHDRAW_SELECTOR = '67843a5b';
const WITHDRAWAL_TOPIC = '0x8c6afca18616d300c4fb7eff2f714229e89e93825b143dc4ecc04231972aa19f';
const TRUE = `0x${'0'.repeat(63)}1`, FALSE = ZERO_NOTE_HASH;
const MAX_PROOF_BYTES = 256 * 1024;
const copy = value => JSON.parse(canonical(value));
const pref = value => `0x${Buffer.from(value).toString('hex')}`;
const hex = (value, width) => { assert.match(value, new RegExp(`^0x[0-9a-f]{${width * 2}}$`), 'PAYOUT_RECOVERY_HEX'); return value; };
const quantity = value => { assert.match(value, /^0x(?:0|[1-9a-f][0-9a-f]*)$/, 'PAYOUT_RECOVERY_QUANTITY'); return BigInt(value); };
const word = value => BigInt(value).toString(16).padStart(64, '0');
const errorCode = error => /^(?:PAYOUT|RECIPIENT|PRIVATE|OWNER_REFUND)_[A-Z_]+$/.test(error?.code ?? error?.message ?? '') ? error.code ?? error.message : 'PAYOUT_RECOVERY_EVIDENCE_UNAVAILABLE';

function decodeWithdraw(input) {
  assert.equal(typeof input, 'string', 'PAYOUT_RECOVERY_CALLDATA');
  assert.ok(input.length <= (MAX_PROOF_BYTES + 1408) * 2, 'PAYOUT_RECOVERY_CALLDATA_LIMIT');
  assert.match(input, /^0x[0-9a-f]+$/i, 'PAYOUT_RECOVERY_CALLDATA');
  const encoded = input.toLowerCase();
  assert.equal(encoded.slice(2, 10), WITHDRAW_SELECTOR, 'PAYOUT_RECOVERY_METHOD');
  const raw = encoded.slice(10);
  const at = offset => { const value = raw.slice(offset * 2, offset * 2 + 64); assert.equal(value.length, 64, 'PAYOUT_RECOVERY_ABI_BOUNDS'); return BigInt(`0x${value}`); };
  assert.equal(at(0), 64n, 'PAYOUT_RECOVERY_ABI_PROOF_OFFSET');
  const proofBytes = at(64);
  assert.ok(proofBytes > 0n && proofBytes <= BigInt(MAX_PROOF_BYTES), 'PAYOUT_RECOVERY_ABI_PROOF_LENGTH');
  const padded = Math.ceil(Number(proofBytes) / 32) * 32, inputsAt = 96 + padded;
  assert.equal(at(32), BigInt(inputsAt), 'PAYOUT_RECOVERY_ABI_INPUT_OFFSET');
  assert.equal(at(inputsAt), 39n, 'PAYOUT_RECOVERY_ABI_INPUT_COUNT');
  assert.equal(raw.length, (inputsAt + 32 + 39 * 32) * 2, 'PAYOUT_RECOVERY_ABI_LENGTH');
  assert.equal(raw.slice((96 + Number(proofBytes)) * 2, inputsAt * 2), '0'.repeat((padded - Number(proofBytes)) * 2), 'PAYOUT_RECOVERY_ABI_PADDING');
  const inputs = Array.from({ length: 39 }, (_, i) => at(inputsAt + 32 + i * 32).toString());
  const recipientWords = inputs.slice(34).map(n => { assert.ok(BigInt(n) < 1n << 32n, 'PAYOUT_RECOVERY_RECIPIENT_RANGE'); return BigInt(n).toString(16).padStart(8, '0'); });
  assert.ok(BigInt(inputs[16]) < 1n << 64n && BigInt(inputs[33]) > 0n && BigInt(inputs[33]) < 1n << 64n, 'PAYOUT_RECOVERY_UINT64');
  return { scope: noteWordsToHash(inputs.slice(0, 8)), policy: noteWordsToHash(inputs.slice(8, 16)), epoch: inputs[16],
    root: noteWordsToHash(inputs.slice(17, 25)), noteNullifier: noteWordsToHash(inputs.slice(25, 33)),
    amount: inputs[33], recipient: `0x${recipientWords.join('')}` };
}

/**
 * All callbacks are trusted host closures; no per-call arguments are accepted.
 * authorize(request) -> the original note owner's constrained authorization.
 * withdrawalInput(authorization, path) -> strict type-specific witness builder.
 * validateDiscovery(state) / validateWithdrawal(statement) -> extra typed checks.
 * This internal host capability is not a substitute for strict type2/type3
 * wrappers. Never expose it or its callbacks on a public API or process IPC.
 * prove(circuitInput) -> { proof: Buffer, publicInputs: uint256 words }.
 * submit(proof) -> receipt (the response may be lost; never relied on alone).
 * persist(state) -> awaited durable private operational record, without secrets.
 * onConfirmed(state) -> synchronous, idempotent accounting before fallible audit.
 *
 * Calls are serialized. An ambiguous send stays UNKNOWN while its note remains
 * unspent; only fresh exact successful evidence can settle it. An already-spent
 * note without such evidence also stays UNKNOWN and never triggers submission.
 */
export function createExactNoteWithdrawalRecovery({ pool, runtime, scope, policy, note, recipient, role,
  fromBlock = '0x0', authorize, withdrawalInput, prove, submit, persist, onConfirmed = () => {},
  validateDiscovery = () => {}, validateWithdrawal = () => {} }) {
  assert.match(recipient, /^[0-9a-f]{40}$/, 'PAYOUT_RECOVERY_DESTINATION');
  assert.notEqual(recipient, '00'.repeat(20), 'PAYOUT_RECOVERY_DESTINATION');
  const asset=privateWalletPoolAssetDescriptor(pool,String(runtime.metadata.chainId));
  const pin = Object.freeze({ pool: hex(pool.address, 20), scope: hex(pool.scope, 32), policy: hex(pool.policy, 32),
    domain: hex(pool.deploymentDomain, 32), chainId: String(runtime.metadata.chainId),
    recipient: `0x${recipient}`, amount: note.value.toString(), paymentCommitment: pref(note.commitment),
    noteNullifier: pref(nullifier(scope, note.commitment, note.secret)), role });
  assert.equal(pin.scope, `0x${scope}`, 'PAYOUT_RECOVERY_SCOPE');
  assert.equal(pin.policy, `0x${policy}`, 'PAYOUT_RECOVERY_POLICY');
  assert.equal(asset?derivePrivateAssetPoolScope(pin.chainId,pin.pool,pin.domain,'0x'+asset.identity):derivePrivatePoolScope(pin.chainId, pin.pool, pin.domain), pin.scope, 'PAYOUT_RECOVERY_POOL_BINDING');
  quantity(fromBlock);
  for (const callback of [authorize, withdrawalInput, prove, submit, persist, onConfirmed, validateDiscovery, validateWithdrawal]) assert.equal(typeof callback, 'function', 'PAYOUT_RECOVERY_CALLBACK');
  let queue = Promise.resolve(), attempted = false;
  const serialize = work => { const task = queue.then(work); queue = task.catch(() => {}); return task; };
  const record = (state, extra = {}) => ({ state, role: pin.role, pool: pin.pool, recipient: pin.recipient,
    amount: pin.amount, paymentCommitment: pin.paymentCommitment, noteNullifier: pin.noteNullifier, ...extra });
  const notify = result => {
    // Account for verified on-chain truth BEFORE an audit write or ACK can fail.
    const returned = onConfirmed(copy(result));
    assert.ok(!returned || typeof returned.then !== 'function', 'PAYOUT_RECOVERY_CONFIRM_MUST_BE_SYNC');
    return result;
  };
  async function canonicalBlock(snapshot) {
    quantity(snapshot.blockNumber); hex(snapshot.blockHash, 32);
    const header = await runtime.evm('eth_getBlockByNumber', [snapshot.blockNumber, false]);
    assert.equal(header?.hash, snapshot.blockHash, 'PAYOUT_RECOVERY_BLOCK_CHANGED');
    assert.equal(header.number, snapshot.blockNumber, 'PAYOUT_RECOVERY_BLOCK_HEIGHT');
    return header;
  }
  async function inspect() {
    assert.equal(pool.address, pin.pool, 'PAYOUT_RECOVERY_POOL_CHANGED');
    assert.equal(pool.scope, pin.scope, 'PAYOUT_RECOVERY_SCOPE');
    assert.equal(pool.policy, pin.policy, 'PAYOUT_RECOVERY_POLICY');
    assert.equal(pool.deploymentDomain, pin.domain, 'PAYOUT_RECOVERY_DOMAIN');
    assert.equal(String(runtime.metadata.chainId), pin.chainId, 'PAYOUT_RECOVERY_CHAIN');
    assert.equal(quantity(await runtime.evm('eth_chainId', [])), BigInt(pin.chainId), 'PAYOUT_RECOVERY_CHAIN');
    const snapshot = await pool.snapshot();
    assert.equal(snapshot.scope, pin.scope, 'PAYOUT_RECOVERY_SCOPE');
    assert.equal(snapshot.policy, pin.policy, 'PAYOUT_RECOVERY_POLICY');
    assert.equal(snapshot.epoch, (BigInt(snapshot.blockTimestamp) / 600n).toString(), 'PAYOUT_RECOVERY_EPOCH');
    assert.ok(Number.isSafeInteger(snapshot.leafCount) && snapshot.leafCount >= 0 && snapshot.leafCount <= 64 && snapshot.leafCount <= snapshot.leaves.length, 'PAYOUT_RECOVERY_LEAF_COUNT');
    assert.ok(snapshot.leaves.slice(snapshot.leafCount).every(leaf => leaf === ZERO_NOTE_HASH), 'PAYOUT_RECOVERY_LEAF_PADDING');
    const tree = new PrivateNoteTree(snapshot.leaves.slice(0, snapshot.leafCount));
    assert.equal(tree.root, snapshot.root, 'PAYOUT_RECOVERY_ROOT');
    assert.equal(privateSpentDigest(pin.scope, snapshot.nullifiers, snapshot.spentCount), snapshot.spentDigest, 'PAYOUT_RECOVERY_SPENT_DIGEST');
    const index = snapshot.leaves.slice(0, snapshot.leafCount).indexOf(pin.paymentCommitment);
    const spent = snapshot.nullifiers.slice(0, snapshot.spentCount).includes(pin.noteNullifier);
    const block = snapshot.blockNumber;
    await assertPrivateWalletPoolAsset(pool,asset,pin.chainId,block);
    assert.equal(await pool.call('scope()', [], block), pin.scope, 'PAYOUT_RECOVERY_SCOPE');
    assert.equal(await pool.call('policy()', [], block), pin.policy, 'PAYOUT_RECOVERY_POLICY');
    assert.equal(await pool.call('deploymentDomain()', [], block), pin.domain, 'PAYOUT_RECOVERY_DOMAIN');
    assert.equal(await pool.call('acceptedRoots(bytes32)', [snapshot.root], block), TRUE, 'PAYOUT_RECOVERY_ROOT_NOT_ACCEPTED');
    assert.equal(await pool.call('insertedCommitments(bytes32)', [pin.paymentCommitment], block), index < 0 ? FALSE : TRUE, 'PAYOUT_RECOVERY_ISSUANCE_DISAGREEMENT');
    assert.equal(await pool.call('spentNullifiers(bytes32)', [pin.noteNullifier], block), spent ? TRUE : FALSE, 'PAYOUT_RECOVERY_SPENT_DISAGREEMENT');
    await validateDiscovery({ snapshot: copy(snapshot), issued: index >= 0, spent });
    const header = await canonicalBlock(snapshot);
    assert.equal(BigInt(header.timestamp).toString(), snapshot.blockTimestamp, 'PAYOUT_RECOVERY_TIMESTAMP');
    assert.ok(index >= 0 || !spent, 'PAYOUT_RECOVERY_UNISSUED_SPENT');
    return { snapshot, tree, index, spent };
  }
  function eventMatches(log) {
    return log?.removed !== true && log.address?.toLowerCase() === pin.pool &&
      log.topics?.length === 2 && log.topics[0]?.toLowerCase() === WITHDRAWAL_TOPIC &&
      log.topics[1]?.toLowerCase() === `0x${'0'.repeat(24)}${recipient}` &&
      log.data?.toLowerCase() === `0x${word(pin.amount)}${pin.noteNullifier.slice(2)}`;
  }
  async function verifyReceipt(log, snapshot) {
    assert.ok(eventMatches(log), 'PAYOUT_RECOVERY_EVENT');
    const hash = hex(log.transactionHash, 32), height = quantity(log.blockNumber);
    assert.ok(height >= quantity(fromBlock) && height <= quantity(snapshot.blockNumber), 'PAYOUT_RECOVERY_RECEIPT_RANGE');
    const transaction = await runtime.evm('eth_getTransactionByHash', [hash]);
    const receipt = await runtime.evm('eth_getTransactionReceipt', [hash]);
    assert.ok(receipt && transaction, 'PAYOUT_RECOVERY_RECEIPT_MISSING');
    assert.equal(receipt.status, '0x1', 'PAYOUT_RECOVERY_RECEIPT_FAILED');
    assert.equal(receipt.transactionHash, hash, 'PAYOUT_RECOVERY_RECEIPT_HASH');
    assert.equal(transaction.hash, hash, 'PAYOUT_RECOVERY_TRANSACTION_HASH');
    for (const entry of [receipt, transaction]) {
      assert.equal(entry.blockHash, log.blockHash, 'PAYOUT_RECOVERY_TRANSACTION_BLOCK');
      assert.equal(entry.blockNumber, log.blockNumber, 'PAYOUT_RECOVERY_TRANSACTION_HEIGHT');
      assert.equal(entry.to?.toLowerCase(), pin.pool, 'PAYOUT_RECOVERY_TRANSACTION_POOL');
    }
    assert.equal(quantity(transaction.value), 0n, 'PAYOUT_RECOVERY_TRANSACTION_VALUE');
    const statement = decodeWithdraw(transaction.input);
    for (const field of ['scope', 'policy', 'recipient', 'amount', 'noteNullifier']) assert.equal(statement[field], pin[field], 'PAYOUT_RECOVERY_WITHDRAWAL_BINDING');
    validateWithdrawal(copy(statement));
    const matching = receipt.logs.filter(eventMatches);
    assert.equal(matching.length, 1, 'PAYOUT_RECOVERY_RECEIPT_EVENT_COUNT');
    for (const field of ['transactionHash', 'blockHash', 'blockNumber', 'logIndex']) assert.equal(matching[0][field], log[field], 'PAYOUT_RECOVERY_RECEIPT_EVENT');
    const header = await canonicalBlock({ blockNumber: log.blockNumber, blockHash: log.blockHash });
    assert.ok(header.transactions.includes(hash), 'PAYOUT_RECOVERY_TRANSACTION_MEMBERSHIP');
    assert.equal(statement.epoch, (quantity(header.timestamp) / 600n).toString(), 'PAYOUT_RECOVERY_RECEIPT_EPOCH');
    assert.equal(await pool.call('acceptedRoots(bytes32)', [statement.root], log.blockNumber), TRUE, 'PAYOUT_RECOVERY_RECEIPT_ROOT');
    assert.equal(await pool.call('spentNullifiers(bytes32)', [pin.noteNullifier], log.blockNumber), TRUE, 'PAYOUT_RECOVERY_RECEIPT_SPENT');
    await canonicalBlock(snapshot);
    await canonicalBlock({ blockNumber: log.blockNumber, blockHash: log.blockHash });
    return record('WITHDRAWN', { transactionHash: hash, blockNumber: log.blockNumber, blockHash: log.blockHash,
      evidence: 'CANONICAL_EXACT_WITHDRAWAL_RECEIPT_CALLDATA_EVENT' });
  }
  async function observe() {
    const state = await inspect();
    const { snapshot, index, spent } = state;
    const block = { blockNumber: snapshot.blockNumber, blockHash: snapshot.blockHash };
    if (index < 0) return { result: record('PENDING', { ...block, reason: 'PAYMENT_NOT_ISSUED' }), state };
    if (!spent) return { result: record(attempted ? 'UNKNOWN' : 'READY', { ...block,
      ...(attempted ? { reason: 'SUBMISSION_UNCERTAIN' } : {}) }), state };
    let verified;
    try {
      const logs = await runtime.evm('eth_getLogs', [{ address: pin.pool, fromBlock, toBlock: snapshot.blockNumber,
        topics: [WITHDRAWAL_TOPIC, `0x${'0'.repeat(24)}${recipient}`] }]);
      assert.ok(Array.isArray(logs) && logs.length <= 64, 'PAYOUT_RECOVERY_LOG_LIMIT');
      const candidates = logs.filter(eventMatches);
      assert.equal(candidates.length, 1, 'PAYOUT_RECOVERY_EXACT_RECEIPT_REQUIRED');
      verified = await verifyReceipt(candidates[0], snapshot);
    } catch (error) {
      // No evidence or inconsistent evidence leaves the note spent-but-unknown.
      // A caller cannot turn a failed archive, missing log or reorg into success.
      return { result: record('UNKNOWN', { ...block, reason: 'SPENT_WITHOUT_VERIFIED_WITHDRAWAL', evidenceCode: errorCode(error) }), state };
    }
    return { result: notify(verified), state };
  }
  async function recover() {
    let checked = await observe();
    if (checked.result.state !== 'READY') {
      await persist(copy(checked.result));
      return checked.result;
    }
    const { snapshot, tree, index } = checked.state;
    const request = { scope: pin.scope.slice(2), policy: pin.policy.slice(2), paymentCommitment: pin.paymentCommitment.slice(2),
      recipient, amount: pin.amount, epoch: snapshot.epoch };
    const authorization = await authorize(copy(request));
    const input = withdrawalInput(authorization, tree.path(index));
    // The strict type-specific builder verifies the signed frame; also bind it
    // to this exact discovery, including pinned destination and current epoch.
    for (const key of Object.keys(request)) assert.equal(authorization[key], request[key], 'PAYOUT_RECOVERY_AUTHORIZATION');
    const proof = await prove(input);
    const expected = encodePrivatePoolInputs('withdraw', { scope: pin.scope, policy: pin.policy, epoch: snapshot.epoch,
      root: snapshot.root, nullifier: pin.noteNullifier, amount: pin.amount, recipient: pin.recipient });
    assert.ok(Buffer.isBuffer(proof?.proof) || proof?.proof instanceof Uint8Array, 'PAYOUT_RECOVERY_PROOF_BYTES');
    assert.ok(proof.proof.length > 0 && proof.proof.length <= MAX_PROOF_BYTES, 'PAYOUT_RECOVERY_PROOF_LIMIT');
    assert.ok(Array.isArray(proof.publicInputs), 'PAYOUT_RECOVERY_PUBLIC_INPUTS');
    assert.deepEqual(proof.publicInputs.map(n => BigInt(n).toString()), expected, 'PAYOUT_RECOVERY_PUBLIC_BINDING');
    checked = await observe();
    if (checked.result.state !== 'READY') { await persist(copy(checked.result)); return checked.result; }
    // Operationally retryable, but issuance was just verified. PENDING here
    // must never be projected as a downgrade of the public ISSUED note state.
    if (checked.state.snapshot.epoch !== request.epoch) return record('PENDING', { reason: 'EPOCH_CHANGED_BEFORE_SUBMIT' });
    assert.equal(await pool.call('acceptedRoots(bytes32)', [snapshot.root], checked.state.snapshot.blockNumber), TRUE, 'PAYOUT_RECOVERY_PROOF_ROOT_EXPIRED');
    await canonicalBlock(checked.state.snapshot);
    await persist(record('SUBMITTING', { blockNumber: checked.state.snapshot.blockNumber, blockHash: checked.state.snapshot.blockHash }));
    // Mark before entering submit; even a thrown/lost response may have sent.
    attempted = true;
    let submitError;
    try { await submit(proof); } catch (error) { submitError = error; }
    const { result } = await observe();
    if (submitError && result.state !== 'WITHDRAWN') result.submission = 'RESPONSE_LOST_OR_REJECTED';
    await persist(copy(result));
    return result;
  }
  return Object.freeze({ reconcile: () => serialize(async () => (await observe()).result), recover: () => serialize(recover) });
}
