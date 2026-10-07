/** Canonical observations for reusable notes in one owned local generic pool.
 *
 * This adapter authenticates its runtime/deployment capabilities. It reconstructs
 * the original transaction's complete pool transition, rather than inferring a
 * credit from the latest spent bit. The transaction-specific view relies on the
 * local runtime's one-transaction-per-block profile and rejects any other block.
 * It is a trusted local RPC observer, not a public-chain consensus proof.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { canonical } from '../../crypto/privacy.mjs';
import { publicKeccak256 } from '../../crypto/private-cohort-public-native.mjs';
import { assertOwnedBitcoinRuntime } from '../../chains/bitcoin/bitcoin-runtime.mjs';
import { assertOwnedSolanaRuntime, base58Decode } from '../../chains/solana/solana-runtime.mjs';
import { assertLocalEvm } from '../local/local-evm.mjs';
import { assertOwnedNativeSystem } from '../native/dispatch/native-deployment.mjs';
import { genericProofCalldata } from '../local/local-deployment.mjs';
import { inspectGenericSnapshot } from '../local/local-ledger.mjs';

const ownedObservers = new WeakMap();
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const digest = value => sha(canonical(value));
const copy = value => JSON.parse(canonical(value));
const bare = value => value.slice(2);
const hexQuantity = value => '0x' + BigInt(value).toString(16);
const MAX_CALLDATA_BYTES = 512 * 1024;
const STATE_ADVANCED_TOPIC = '0x' + publicKeccak256(Buffer.from(
  'StateAdvanced(uint64,bytes32,bytes32,uint32,uint32)', 'ascii')).toString('hex');
const WITHDRAWAL_TOPIC = '0x' + publicKeccak256(Buffer.from(
  'Withdrawal(address,uint64,bytes32)', 'ascii')).toString('hex');
const METHODS = Object.freeze({
  D26: { signature: 'depositBalance(bytes,bytes32[])', inputs: 26, headBytes: 64 },
  S66: { signature: 'reserveGenericGuarded(bytes,bytes32[],uint64,bytes32)', inputs: 66, headBytes: 128 },
  W39: { signature: 'withdrawBalance(bytes,bytes32[])', inputs: 39, headBytes: 64 },
  F51: { signature: 'recoverGeneric(bytes,bytes32[])', inputs: 51, headBytes: 64 },
});

function exact(value, fields, code) {
  canonical(value);
  assert.ok(value && Object.getPrototypeOf(value) === Object.prototype, code);
  assert.deepEqual(Object.keys(value).sort(), [...fields].sort(), code);
}
function hash(value, prefixed = false) {
  assert.match(value, prefixed ? /^0x[0-9a-f]{64}$/ : /^[0-9a-f]{64}$/,
    'BALANCE_OBSERVER_HASH');
  return value;
}
function wordAt(body, byteOffset) {
  assert.ok(Number.isSafeInteger(byteOffset) && byteOffset >= 0
    && byteOffset + 32 <= body.length / 2, 'BALANCE_OBSERVER_ABI_BOUNDS');
  return body.slice(byteOffset * 2, byteOffset * 2 + 64);
}
function boundedNumber(word, maximum, code) {
  const value = BigInt('0x' + word);
  assert.ok(value <= BigInt(maximum), code);
  return Number(value);
}
function digestWords(words, offset) {
  return words.slice(offset, offset + 8).map(value => {
    assert.ok(BigInt(value) <= 0xffffffffn, 'BALANCE_OBSERVER_DIGEST_WORD');
    return BigInt(value).toString(16).padStart(8, '0');
  }).join('');
}

/** Strict ABI decoding and round-trip only. Does not verify the proof. */
export function decodeGenericBalanceCalldata(artifact, calldata) {
  assert.match(calldata, /^0x[0-9a-f]+$/, 'BALANCE_OBSERVER_CALLDATA');
  assert.ok(calldata.length % 2 === 0 && calldata.length <= MAX_CALLDATA_BYTES * 2 + 2,
    'BALANCE_OBSERVER_CALLDATA_BOUND');
  const selected = Object.entries(METHODS).filter(([, method]) =>
    artifact.evm.methodIdentifiers[method.signature] === calldata.slice(2, 10));
  assert.equal(selected.length, 1, 'BALANCE_OBSERVER_METHOD');
  const [kind, method] = selected[0], body = calldata.slice(10);
  const proofOffset = boundedNumber(wordAt(body, 0), MAX_CALLDATA_BYTES, 'BALANCE_OBSERVER_ABI_OFFSET');
  assert.equal(proofOffset, method.headBytes, 'BALANCE_OBSERVER_PROOF_OFFSET');
  const proofBytes = boundedNumber(wordAt(body, proofOffset), MAX_CALLDATA_BYTES, 'BALANCE_OBSERVER_PROOF_BOUND');
  assert.ok(proofBytes > 0, 'BALANCE_OBSERVER_EMPTY_PROOF');
  const wordsOffset = boundedNumber(wordAt(body, 32), MAX_CALLDATA_BYTES, 'BALANCE_OBSERVER_ABI_OFFSET');
  assert.equal(wordsOffset, proofOffset + 32 + Math.ceil(proofBytes / 32) * 32,
    'BALANCE_OBSERVER_WORDS_OFFSET');
  assert.equal(boundedNumber(wordAt(body, wordsOffset), 66, 'BALANCE_OBSERVER_WORDS_BOUND'),
    method.inputs, 'BALANCE_OBSERVER_PUBLIC_COUNT');
  assert.equal(body.length, (wordsOffset + 32 + method.inputs * 32) * 2,
    'BALANCE_OBSERVER_TRAILING_DATA');
  const proof = Buffer.from(body.slice((proofOffset + 32) * 2,
    (proofOffset + 32 + proofBytes) * 2), 'hex');
  const publicInputs = Array.from({ length: method.inputs }, (_, index) =>
    BigInt('0x' + wordAt(body, wordsOffset + 32 + index * 32)).toString());
  const guards = kind === 'S66' ? {
    expectedSequence: BigInt('0x' + wordAt(body, 64)).toString(),
    expectedPostRoot: '0x' + wordAt(body, 96),
  } : undefined;
  assert.equal(genericProofCalldata(artifact, method.signature, proof, publicInputs, guards),
    calldata, 'BALANCE_OBSERVER_NONCANONICAL_ABI');
  const transition = kind === 'D26' ? {
    insertedCommitments: [digestWords(publicInputs, 18)], spentNullifiers: [], admissionTag: null,
  } : kind === 'S66' ? {
    insertedCommitments: [digestWords(publicInputs, 40), digestWords(publicInputs, 48)],
    spentNullifiers: [digestWords(publicInputs, 32)], admissionTag: digestWords(publicInputs, 56),
  } : kind === 'W39' ? {
    insertedCommitments: [], spentNullifiers: [digestWords(publicInputs, 25)], admissionTag: null,
  } : {
    insertedCommitments: [digestWords(publicInputs, 40)],
    spentNullifiers: [digestWords(publicInputs, 32)], admissionTag: null,
  };
  const recovery = kind === 'F51' ? {
    scope: digestWords(publicInputs, 0), policy: digestWords(publicInputs, 8), asset: digestWords(publicInputs, 16),
    acceptedRoot: digestWords(publicInputs, 24), reserveNullifier: digestWords(publicInputs, 32),
    recoveryCommitment: digestWords(publicInputs, 40), settleBefore: publicInputs[48],
    validFrom: publicInputs[49], validUntil: publicInputs[50],
  } : null;
  return { kind, method: method.signature, publicInputs, guards: guards ?? null, transition,
    ...(recovery ? { recovery } : {}) };
}

/** Decode the independently fetched receipt log, never a caller's event claim. */
export function decodeGenericBalanceStateAdvanced(receipt, pool) {
  assert.match(pool, /^0x[0-9a-f]{40}$/, 'BALANCE_OBSERVER_POOL');
  assert.ok(Array.isArray(receipt.logs), 'BALANCE_OBSERVER_RECEIPT_LOGS');
  const logs = receipt.logs.filter(log => log.address === pool && log.topics?.[0] === STATE_ADVANCED_TOPIC);
  assert.equal(logs.length, 1, 'BALANCE_OBSERVER_STATE_EVENT_COUNT');
  const log = logs[0];
  assert.ok(log.removed !== true, 'BALANCE_OBSERVER_REMOVED_LOG');
  assert.equal(log.transactionHash, receipt.transactionHash, 'BALANCE_OBSERVER_EVENT_TRANSACTION');
  assert.equal(log.blockHash, receipt.blockHash, 'BALANCE_OBSERVER_EVENT_BLOCK');
  assert.equal(log.topics.length, 2, 'BALANCE_OBSERVER_EVENT_TOPICS');
  hash(log.topics[1], true);
  assert.ok(BigInt(log.topics[1]) < (1n << 64n), 'BALANCE_OBSERVER_EVENT_SEQUENCE');
  assert.match(log.data, /^0x[0-9a-f]{256}$/, 'BALANCE_OBSERVER_EVENT_DATA');
  const body = log.data.slice(2);
  return {
    address: bare(pool), transactionHash: bare(receipt.transactionHash), blockHash: bare(receipt.blockHash),
    sequence: BigInt(log.topics[1]).toString(), root: '0x' + wordAt(body, 0),
    spent: '0x' + wordAt(body, 32),
    leaves: boundedNumber(wordAt(body, 64), 64, 'BALANCE_OBSERVER_EVENT_LEAVES'),
    consumed: boundedNumber(wordAt(body, 96), 64, 'BALANCE_OBSERVER_EVENT_SPENT'),
  };
}

export function decodeGenericBalanceWithdrawal(receipt, pool) {
  assert.match(pool, /^0x[0-9a-f]{40}$/, 'BALANCE_OBSERVER_POOL');
  assert.ok(Array.isArray(receipt.logs), 'BALANCE_OBSERVER_RECEIPT_LOGS');
  const logs = receipt.logs.filter(log => log.address === pool && log.topics?.[0] === WITHDRAWAL_TOPIC);
  assert.equal(logs.length, 1, 'BALANCE_OBSERVER_WITHDRAWAL_EVENT_COUNT');
  const log = logs[0];
  assert.ok(log.removed !== true, 'BALANCE_OBSERVER_REMOVED_LOG');
  assert.equal(log.transactionHash, receipt.transactionHash, 'BALANCE_OBSERVER_EVENT_TRANSACTION');
  assert.equal(log.blockHash, receipt.blockHash, 'BALANCE_OBSERVER_EVENT_BLOCK');
  assert.equal(log.topics.length, 2, 'BALANCE_OBSERVER_EVENT_TOPICS');
  assert.match(log.topics[1], /^0x0{24}[0-9a-f]{40}$/, 'BALANCE_OBSERVER_WITHDRAWAL_RECIPIENT');
  assert.match(log.data, /^0x[0-9a-f]{128}$/, 'BALANCE_OBSERVER_WITHDRAWAL_DATA');
  const amount = BigInt('0x' + wordAt(log.data.slice(2), 0));
  assert.ok(amount > 0n && amount < (1n << 64n), 'BALANCE_OBSERVER_WITHDRAWAL_AMOUNT');
  return {
    address: bare(pool), transactionHash: bare(receipt.transactionHash), blockHash: bare(receipt.blockHash),
    recipient: log.topics[1].slice(-40), amount: amount.toString(), nullifier: wordAt(log.data.slice(2), 32),
  };
}

export function assertOwnedGenericBalanceObserver(observer, { runtime, system, poolIndex }) {
  const bound = ownedObservers.get(observer);
  assert.ok(bound && bound.runtime === runtime && bound.system === system && bound.poolIndex === poolIndex,
    'BALANCE_OBSERVER_OWNED_CAPABILITY');
  assertOwnedNativeSystem(runtime, system);
}

/** Trusted keeper construction only. There is no endpoint, key import or send
 * capability here. walletId/lifetime name this surviving keeper instance; they
 * do not establish independent operators or allow a replacement chain to resume.
 */
export async function createOwnedGenericBalanceObserver(options) {
  const fields = ['runtime', 'system', 'poolIndex', 'bitcoin', 'solana', 'walletId', 'issuerLifetime'];
  assert.ok(options && Object.getPrototypeOf(options) === Object.prototype, 'BALANCE_OBSERVER_OPTIONS');
  assert.deepEqual(Reflect.ownKeys(options).sort(), fields.sort(), 'BALANCE_OBSERVER_OPTIONS');
  const { runtime, system, poolIndex, bitcoin, solana, walletId, issuerLifetime } = options;
  await assertLocalEvm(runtime);
  assertOwnedNativeSystem(runtime, system);
  assertOwnedBitcoinRuntime(bitcoin);
  assertOwnedSolanaRuntime(solana);
  assert.ok(poolIndex === 0 || poolIndex === 1, 'BALANCE_OBSERVER_POOL_INDEX');
  assert.match(walletId, /^[a-zA-Z0-9_-]{8,128}$/, 'BALANCE_OBSERVER_WALLET_ID');
  hash(issuerLifetime);
  const pool = system.pools[poolIndex];
  const identity = {
    walletId, chainId: runtime.metadata.chainId, evmGenesis: bare(runtime.metadata.evmGenesis),
    bitcoinGenesis: bitcoin.genesis, solanaGenesis: base58Decode(solana.genesis, 32).toString('hex'),
    pool: bare(pool.address), poolCodeHash: bare(pool.codeHash), scope: bare(pool.scope), policy: bare(pool.policy),
    deploymentDomain: bare(pool.deploymentDomain),
    verifierSetHash: digest(Object.fromEntries(Object.entries(system.verifiers).map(([mode, verifier]) =>
      [mode, { address: verifier.address, codeHash: verifier.codeHash }]))),
    issuerLifetime, hubDomain: bare(system.hubDomain), registryCommitment: bare(system.registryCommitment),
    poolAbiSHA256: digest(pool.artifact),
    asset: { kind: system.asset === '0x' + '0'.repeat(40) ? 'NATIVE' : 'ERC20',
      address: bare(system.asset), codeHash: bare(system.assetCodeHash), identity: bare(system.assetIdentity) },
    backing: 'SYNTHETIC_LOCAL_POOL_ASSET',
  };
  const identitySHA256 = digest(identity);

  async function readAt(tag = 'latest') {
    assertOwnedNativeSystem(runtime, system);
    await assertLocalEvm(runtime);
    const header = await runtime.block(tag);
    const codeRecords = [
      [pool.address, system.plan.pools[poolIndex].runtimeCode],
      [system.hub.address, system.plan.hub.runtimeCode],
      ...Object.values(system.verifiers).map(verifier => [verifier.address, verifier.codeHash]),
      ...(identity.asset.kind === 'ERC20' ? [[system.asset, system.assetCodeHash]] : []),
    ];
    const [rawState, rawHistory, rawBacking, codes] = await Promise.all([
      ...['canonicalState()', 'canonicalRootHistory()', 'canonicalBacking()']
        .map(method => pool.call(method, [], header.number)),
      Promise.all(codeRecords.map(([address]) => runtime.code(address, header.number))),
    ]);
    codeRecords.forEach(([, expected], index) => {
      const actual = index < 2 ? codes[index]
        : '0x' + publicKeccak256(Buffer.from(codes[index].slice(2), 'hex')).toString('hex');
      assert.equal(actual, expected, 'BALANCE_OBSERVER_DEPLOYMENT_CHANGED');
    });
    const after = await runtime.assertCanonical(header);
    const snapshot = { identitySHA256, blockHash: bare(header.hash),
      canonicalBlockHashBefore: bare(header.hash), canonicalBlockHashAfter: bare(after.hash),
      timestamp: BigInt(header.timestamp).toString(), rawState, rawHistory, rawBacking };
    inspectGenericSnapshot({ ...snapshot, scope: pool.scope });
    return { header, snapshot };
  }

  async function readTransaction(query) {
    exact(query, ['ownerOperationRef', 'transactionHash', 'identitySHA256', 'calldataSHA256'],
      'BALANCE_OBSERVER_QUERY');
    assert.match(query.ownerOperationRef, /^[a-zA-Z0-9_-]{8,128}$/, 'BALANCE_OBSERVER_REFERENCE');
    assert.equal(query.identitySHA256, identitySHA256, 'BALANCE_OBSERVER_IDENTITY');
    hash(query.calldataSHA256);
    if (query.transactionHash !== null) hash(query.transactionHash);
    const candidates = runtime.transactions.filter(record => record.request.to === pool.address
      && typeof record.request.data === 'string'
      && sha(Buffer.from(record.request.data.slice(2), 'hex')) === query.calldataSHA256
      && (query.transactionHash === null || record.transactionHash === '0x' + query.transactionHash));
    if (candidates.length === 0) return null;
    assert.equal(candidates.length, 1, 'BALANCE_OBSERVER_AMBIGUOUS_TRANSACTION');
    const retained = candidates[0];
    if (!retained.transactionHash) return null; // Unknown send result is never permission to resend.
    const [transaction, receipt] = await Promise.all([
      runtime.transaction(retained.transactionHash), runtime.receipt(retained.transactionHash),
    ]);
    if (transaction === null || receipt === null) return null;
    assert.equal(receipt.status, '0x1', 'BALANCE_OBSERVER_TRANSACTION_REVERTED');
    assert.equal(transaction.to, pool.address, 'BALANCE_OBSERVER_TRANSACTION_POOL');
    assert.equal(transaction.input, retained.request.data, 'BALANCE_OBSERVER_TRANSACTION_CALLDATA');
    assert.equal(transaction.value, retained.request.value ?? '0x0', 'BALANCE_OBSERVER_TRANSACTION_VALUE');
    assert.equal(transaction.from, retained.request.from, 'BALANCE_OBSERVER_TRANSACTION_SENDER');
    assert.equal(BigInt(transaction.nonce), BigInt(retained.senderNonce), 'BALANCE_OBSERVER_TRANSACTION_NONCE');
    assert.equal(transaction.blockHash, receipt.blockHash, 'BALANCE_OBSERVER_TRANSACTION_BLOCK');
    assert.equal(transaction.blockNumber, receipt.blockNumber, 'BALANCE_OBSERVER_TRANSACTION_BLOCK');
    const header = await runtime.assertCanonical(receipt);
    assert.deepEqual(header.transactions, [receipt.transactionHash], 'BALANCE_OBSERVER_SINGLE_TRANSACTION_BLOCK_REQUIRED');
    assert.equal(BigInt(receipt.transactionIndex), 0n, 'BALANCE_OBSERVER_TRANSACTION_INDEX');
    assert.ok(BigInt(header.number) > 0n, 'BALANCE_OBSERVER_TRANSACTION_BLOCK');
    const [before, after] = await Promise.all([
      readAt(hexQuantity(BigInt(header.number) - 1n)), readAt(header.number),
    ]);
    assert.equal(header.parentHash, before.header.hash, 'BALANCE_OBSERVER_PARENT_BLOCK');
    assert.equal(after.header.hash, receipt.blockHash, 'BALANCE_OBSERVER_RECEIPT_BLOCK');
    const decoded = decodeGenericBalanceCalldata(pool.artifact, transaction.input);
    if (decoded.kind === 'S66') {
      const admission = await pool.call('admissions(bytes32)', ['0x' + decoded.transition.admissionTag], header.number);
      assert.equal(BigInt(admission), 1n, 'BALANCE_OBSERVER_ADMISSION_MISSING');
    }
    await runtime.checkReceipt(receipt);
    await runtime.assertCanonical(before.header);
    return {
      identitySHA256,
      transaction: { hash: bare(transaction.hash), to: bare(transaction.to),
        value: BigInt(transaction.value).toString(), calldata: transaction.input },
      receipt: { transactionHash: bare(receipt.transactionHash), blockHash: bare(receipt.blockHash), status: 1 },
      before: before.snapshot, after: after.snapshot,
      stateAdvanced: decodeGenericBalanceStateAdvanced(receipt, pool.address), transition: decoded.transition,
      ...(decoded.kind === 'W39' ? { withdrawal: decodeGenericBalanceWithdrawal(receipt, pool.address) } : {}),
      ...(decoded.kind === 'F51' ? { recovery: decoded.recovery } : {}),
    };
  }

  await readAt();
  const observer = Object.freeze({
    get identity() { return copy(identity); },
    get poolArtifact() { return copy(pool.artifact); },
    readSnapshot: async () => (await readAt()).snapshot,
    readTransaction,
    classification: 'OWNED_LOCAL_TRANSACTION_SPECIFIC_OBSERVATION_NOT_CONSENSUS_PROOF',
  });
  ownedObservers.set(observer, { runtime, system, poolIndex });
  return observer;
}
