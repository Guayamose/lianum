/** Original-transaction terminal observation for the owned, fake-value flat
 * runtime. Historical pinned contract execution is the authority; the pure
 * parsers below neither verify proofs nor mint an owned observation. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { assertLocalEvm } from '../chain-adapters/local-evm-ownership.mjs';
import { assertOwnedPoolAsset } from '../chain-adapters/owned-pool-asset.mjs';
import { decodeGenericBalanceStateAdvanced } from '../../../../../omnichain-product/src/paeg/generic-balance-observer.mjs';
import { boundedListDigest } from '../../../../../omnichain-product/src/paeg/native-state.mjs';
import { evmRuntimeCodeHash } from '../chain-adapters/evm-code-hash.mjs';
import { assertOwnedFlatSystem } from '../ops/deploy-system.mjs';
import { exactRecord, bytes32, canonicalField, ZERO } from './commitments.mjs';
import { createFlatSystemStateReader, decodeFlatWords, decodeFlatPoolObservation } from './flat-system-state.mjs';
import { decodeStatement, validateStatement } from './statements.mjs';
import { encodeFlatTransaction, FLAT_TRANSACTION_METHODS } from './transaction-codec.mjs';

const owned = new WeakMap(), ZERO_WORD = '0x' + ZERO, ZERO_ADDRESS = '0x' + '0'.repeat(40), MAX_BYTES = 1024 * 1024;
const BINDING_FIELDS = ['domainCommitment', 'envelope', 'inputCommitment', 'inputNullifier', 'reserveCommitment',
  'reserveNullifier', 'changeCommitment', 'recoveryCommitment', 'settleBefore', 'authorizationPublicInputsSHA256'];
const prefix = value => '0x' + value, bare = value => value.slice(2);
const sha = value => createHash('sha256').update(value).digest('hex');
const dataHash = value => sha(Buffer.from(value.slice(2), 'hex'));
const one = value => decodeFlatWords(value, 1)[0];
function freeze(value) { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
const detached = value => freeze(structuredClone(value));
function uint(value, maximum = (1n << 64n) - 1n) {
  const n = BigInt(value); assert.ok(n >= 0n && n <= maximum, 'FLAT_TERMINAL_INTEGER'); return n;
}
function bindingOf(value) {
  exactRecord(value, BINDING_FIELDS);
  for (const key of BINDING_FIELDS.filter(key => key !== 'settleBefore')) bytes32(value[key], true);
  canonicalField(value.domainCommitment, true); canonicalField(value.envelope, true);
  assert.equal(typeof value.settleBefore, 'string');
  assert.equal(uint(value.settleBefore).toString(), value.settleBefore, 'FLAT_TERMINAL_CUTOFF_ENCODING');
  return value;
}

/** Fixed ABI, canonical re-encoding, and statement joins only. Fake proof bytes
 * are valid parser fixtures but can never pass the owned observer constructor. */
export function decodeFlatTerminalCalldata(calldata) {
  assert.ok(typeof calldata === 'string' && /^0x(?:[0-9a-f]{2})+$/.test(calldata)
    && calldata.length <= MAX_BYTES * 2, 'FLAT_TERMINAL_CALLDATA');
  const name = ['fulfillGeneric', 'recoverGeneric'].find(name => FLAT_TRANSACTION_METHODS[name].selector === calldata.slice(2, 10));
  assert.ok(name, 'FLAT_TERMINAL_METHOD');
  const body = calldata.slice(10);
  const word = at => { assert.ok(Number.isSafeInteger(at) && at >= 0 && (at + 32) * 2 <= body.length,
    'FLAT_TERMINAL_ABI_BOUNDS'); return body.slice(at * 2, (at + 32) * 2); };
  const number = at => Number(uint('0x' + word(at), BigInt(MAX_BYTES)));
  function proof(at, count) {
    assert.equal(number(at), 64, 'FLAT_TERMINAL_PROOF_OFFSET');
    const length = number(at + 64); assert.ok(length > 0 && length % 32 === 0, 'FLAT_TERMINAL_PROOF_LENGTH');
    assert.equal(number(at + 32), 96 + length, 'FLAT_TERMINAL_INPUT_OFFSET');
    const inputsAt = at + 96 + length; assert.equal(number(inputsAt), count, 'FLAT_TERMINAL_INPUT_COUNT');
    const publicInputs = Array.from({ length: count }, (_, i) => BigInt('0x' + word(inputsAt + 32 + i * 32)).toString());
    return { packet: { proof: body.slice((at + 96) * 2, (at + 96 + length) * 2), publicInputs },
      end: inputsAt + 32 + count * 32 };
  }
  let request, statement, kind;
  if (name === 'recoverGeneric') {
    const parsed = proof(0, 41); assert.equal(body.length, parsed.end * 2, 'FLAT_TERMINAL_TRAILING_DATA');
    request = parsed.packet; kind = 'recovery'; statement = decodeStatement(kind, request.publicInputs);
  } else {
    assert.equal(number(0), 512, 'FLAT_TERMINAL_SETTLEMENT_OFFSET');
    const settlement = proof(512, 138), arrayAt = settlement.end;
    assert.equal(number(32), arrayAt, 'FLAT_TERMINAL_COMPLETIONS_OFFSET');
    let cursor = arrayAt + 128; const completions = [];
    for (let i = 0; i < 4; i++) {
      assert.equal(number(arrayAt + i * 32), cursor - arrayAt, 'FLAT_TERMINAL_COMPLETION_OFFSET');
      const parsed = proof(cursor, 32); completions.push(parsed.packet); cursor = parsed.end;
    }
    assert.equal(body.length, cursor * 2, 'FLAT_TERMINAL_TRAILING_DATA');
    request = { settlement: settlement.packet, completions,
      healthFrom: uint('0x' + word(64)).toString(), healthUntil: uint('0x' + word(96)).toString(),
      healthSignatures: Array.from({ length: 3 }, (_, i) => ({
        signerIndex: uint('0x' + word(128 + i * 128), 255n).toString(),
        v: uint('0x' + word(160 + i * 128), 255n).toString(),
        r: prefix(word(192 + i * 128)), s: prefix(word(224 + i * 128)),
      })) };
    kind = 'settlement'; statement = decodeStatement(kind, settlement.packet.publicInputs);
  }
  assert.equal(encodeFlatTransaction(name, request), calldata, 'FLAT_TERMINAL_NONCANONICAL_ABI');
  return detached({ kind, name, statement, request });
}

function hub(raw, identity, hubDomain) {
  const w = decodeFlatWords(raw, 206);
  assert.equal(w[0], identity.domainCommitment, 'FLAT_TERMINAL_HUB_DOMAIN');
  for (const i of [0, 1, 6, 10]) canonicalField(bare(w[i]));
  for (const i of [2, 4, 7, 12, 13]) uint(w[i], 64n);
  for (const i of [5, 8, 9]) uint(w[i]); uint(w[11], 1n);
  const tags = w.slice(78, 142), count = Number(BigInt(w[4])), revoked = w.slice(142), revokedCount = Number(BigInt(w[7]));
  for (const [values, length] of [[tags, count], [revoked, revokedCount]]) {
    assert.ok(values.slice(0, length).every(value => value !== ZERO_WORD), 'FLAT_TERMINAL_ZERO_ENTRY');
    assert.equal(new Set(values.slice(0, length)).size, length, 'FLAT_TERMINAL_DUPLICATE_ENTRY');
    assert.ok(values.slice(length).every(value => value === ZERO_WORD), 'FLAT_TERMINAL_ENTRY_PADDING');
  }
  assert.equal(w[3], boundedListDigest(0x31, hubDomain, tags, String(count)), 'FLAT_TERMINAL_TAG_DIGEST');
  assert.equal(BigInt(w[4]), BigInt(w[5]) * 4n, 'FLAT_TERMINAL_TAG_SEQUENCE');
  assert.ok(BigInt(w[4]) + BigInt(w[13]) <= 64n, 'FLAT_TERMINAL_TAG_HEADROOM');
  assert.equal(BigInt(w[11]) === 1n, revokedCount === 64, 'FLAT_TERMINAL_HALT');
  return w;
}

function balance(value) {
  assert.ok(typeof value === 'string' && value.length <= 78 && /^(0|[1-9][0-9]*)$/.test(value),
    'FLAT_TERMINAL_ASSET_BALANCE');
  return uint(value, (1n << 256n) - 1n);
}
function terminalPool(raw, pool) {
  // Omitted asset identity is retained only for the original pure native
  // fixtures. Actual observations always carry the deployment's asset pin.
  const asset = pool.asset ?? ZERO_ADDRESS;
  assert.ok(typeof asset === 'string' && /^0x[0-9a-f]{40}$/.test(asset), 'FLAT_TERMINAL_ASSET_ADDRESS');
  const nativeBalance = balance(raw.nativeBalance);
  const assetBalance = balance(raw.assetBalance ?? (asset === ZERO_ADDRESS ? raw.nativeBalance : undefined));
  const ledger = decodeFlatPoolObservation({ ...raw, scope: pool.scope, asset }, { assetBalance, nativeBalance });
  if (asset === ZERO_ADDRESS) {
    assert.equal(ledger.publicState.unrelatedNative, '0', 'FLAT_TERMINAL_NATIVE_POOL');
    assert.equal(raw.assetTotalSupply ?? null, null, 'FLAT_TERMINAL_NATIVE_SUPPLY');
  } else {
    assert.ok(assetBalance <= balance(raw.assetTotalSupply), 'FLAT_TERMINAL_ASSET_SUPPLY');
  }
  assert.equal(new Set(ledger.nullifiers).size, ledger.nullifiers.length, 'FLAT_TERMINAL_DUPLICATE_NULLIFIER');
  assert.ok(ledger.nullifiers.every(value => value !== ZERO_WORD), 'FLAT_TERMINAL_ZERO_NULLIFIER');
  return ledger;
}

/** Pure conserved-delta validation for explicitly fake ABI fixtures. Returns
 * reconstructed data, not a receipt, owned capability, or proof acceptance. */
export function inspectFlatTerminalDelta({ kind, statement: rawStatement, binding: rawBinding, poolIndex,
  identity, before, after, stateAdvanced }) {
  assert.ok(kind === 'settlement' || kind === 'recovery', 'FLAT_TERMINAL_KIND');
  assert.ok(poolIndex === 0 || poolIndex === 1, 'FLAT_TERMINAL_POOL');
  const statement = validateStatement(kind, rawStatement), binding = bindingOf(rawBinding), selected = identity.pools[poolIndex];
  assert.equal(prefix(binding.domainCommitment), selected.domainCommitment, 'FLAT_TERMINAL_BINDING_DOMAIN');
  assert.equal(statement.domainCommitment, binding.domainCommitment, 'FLAT_TERMINAL_STATEMENT_DOMAIN');
  assert.equal(statement.reserveNullifier, binding.reserveNullifier, 'FLAT_TERMINAL_ORIGINAL_NULLIFIER');
  const timestamp = uint(after.timestamp), cutoff = uint(binding.settleBefore);
  assert.ok(timestamp > uint(before.timestamp), 'FLAT_TERMINAL_BLOCK_TIME');
  if (kind === 'recovery') {
    assert.equal(statement.settleBefore, binding.settleBefore, 'FLAT_TERMINAL_ORIGINAL_CUTOFF');
    assert.equal(statement.recoveryCommitment, binding.recoveryCommitment, 'FLAT_TERMINAL_ORIGINAL_RECOVERY');
    assert.ok(timestamp >= cutoff, 'FLAT_TERMINAL_RECOVERY_BEFORE_CUTOFF');
  } else {
    assert.ok(uint(statement.validFrom) < uint(statement.validUntil) && uint(statement.validUntil) <= cutoff,
      'FLAT_TERMINAL_SETTLEMENT_WINDOW');
    assert.ok(uint(statement.validFrom) <= timestamp && timestamp < uint(statement.validUntil) && timestamp < cutoff,
      'FLAT_TERMINAL_SETTLEMENT_INCLUSION_TIME');
  }
  const outputs = (kind === 'recovery' ? [statement.recoveryCommitment] : statement.outputs).map(prefix);
  const previous = [], following = [];
  for (let index = 0; index < 2; index++) {
    const pool = identity.pools[index], b = before.pools[index], a = after.pools[index];
    const first = terminalPool(b, pool), last = terminalPool(a, pool);
    assert.equal(a.assetTotalSupply ?? null, b.assetTotalSupply ?? null, 'FLAT_TERMINAL_ASSET_SUPPLY_CHANGED');
    const firstHub = hub(b.rawHubState, pool, identity.hubDomain), lastHub = hub(a.rawHubState, pool, identity.hubDomain);
    for (const [ledger, state] of [[first, firstHub], [last, lastHub]])
      assert.equal(BigInt(state[12]), 4n * BigInt(ledger.publicState.liveReservations), 'FLAT_TERMINAL_RESERVED_CAPACITY');
    previous.push({ ledger: first, hub: firstHub }); following.push({ ledger: last, hub: lastHub });
    if (index !== poolIndex) {
      for (const name of ['rawState', 'rawHistory', 'rawBacking', 'nativeBalance', 'assetBalance'])
        assert.equal(a[name], b[name], 'FLAT_TERMINAL_OTHER_POOL_CHANGED');
    } else {
      assert.ok(first.commitments.includes(prefix(binding.reserveCommitment)), 'FLAT_TERMINAL_ORIGINAL_RESERVE');
      assert.ok(first.commitments.includes(prefix(binding.inputCommitment)), 'FLAT_TERMINAL_ORIGINAL_INPUT');
      assert.ok(first.commitments.includes(prefix(binding.changeCommitment)), 'FLAT_TERMINAL_ORIGINAL_CHANGE');
      assert.ok(first.nullifiers.includes(prefix(binding.inputNullifier)), 'FLAT_TERMINAL_ORIGINAL_RESERVATION');
      assert.ok(!first.nullifiers.includes(prefix(binding.reserveNullifier)), 'FLAT_TERMINAL_ALREADY_TERMINAL');
      assert.ok(first.roots.includes(prefix(statement.poolRoot)), 'FLAT_TERMINAL_PARENT_POOL_ROOT');
      assert.deepEqual(last.commitments, [...first.commitments, ...outputs], 'FLAT_TERMINAL_EXACT_OUTPUT_APPEND');
      assert.deepEqual(last.nullifiers, [...first.nullifiers, prefix(binding.reserveNullifier)], 'FLAT_TERMINAL_EXACT_NULLIFIER_APPEND');
      const bState = first.publicState, aState = last.publicState;
      assert.equal(BigInt(aState.sequence), BigInt(bState.sequence) + 1n, 'FLAT_TERMINAL_POOL_SEQUENCE');
      assert.equal(aState.liveReservations, bState.liveReservations - 1, 'FLAT_TERMINAL_LIVE_RESERVATIONS');
      assert.equal(aState.outputCapacity, bState.outputCapacity + outputs.length, 'FLAT_TERMINAL_OUTPUT_CAPACITY');
      for (const name of ['backedAmount', 'actualAssetBalance', 'surplus', 'unrelatedNative'])
        assert.equal(aState[name], bState[name], 'FLAT_TERMINAL_BACKING_CHANGED');
      const expectedRoots = first.roots.includes(aState.root) ? first.roots : [...first.roots, aState.root];
      assert.deepEqual(last.roots, expectedRoots, 'FLAT_TERMINAL_EXACT_ROOT_HISTORY');
      for (const [key, value] of Object.entries({ address: bare(pool.address), sequence: aState.sequence,
        root: aState.root, spent: aState.spentDigest, leaves: aState.leaves, consumed: aState.spent }))
        assert.equal(stateAdvanced[key], value, 'FLAT_TERMINAL_STATE_ADVANCED');
    }
    const expectedHub = [...firstHub];
    expectedHub[9] = prefix((BigInt(firstHub[9]) + 1n).toString(16).padStart(64, '0'));
    for (const position of index === poolIndex ? [12, 13] : [13]) {
      assert.ok(BigInt(firstHub[position]) >= 4n, 'FLAT_TERMINAL_CAPACITY_UNDERFLOW');
      expectedHub[position] = prefix((BigInt(firstHub[position]) - 4n).toString(16).padStart(64, '0'));
    }
    if (kind === 'settlement') {
      const count = Number(BigInt(firstHub[4]));
      expectedHub.splice(78 + count, 4, ...statement.terminalTags.map(prefix));
      expectedHub[4] = prefix((BigInt(firstHub[4]) + 4n).toString(16).padStart(64, '0'));
      expectedHub[5] = prefix((BigInt(firstHub[5]) + 1n).toString(16).padStart(64, '0'));
      expectedHub[3] = boundedListDigest(0x31, identity.hubDomain, expectedHub.slice(78, 142), String(count + 4));
    }
    assert.deepEqual(lastHub, expectedHub, 'FLAT_TERMINAL_EXACT_HUB_DELTA');
  }
  for (const pair of [previous, following]) {
    const a = pair[0].hub, b = pair[1].hub;
    for (const i of [3, 4, 5, 7, 8, 9, 11, 13]) assert.equal(a[i], b[i], 'FLAT_TERMINAL_GLOBAL_HUB');
    assert.deepEqual(a.slice(78), b.slice(78), 'FLAT_TERMINAL_GLOBAL_VECTORS');
    assert.equal(BigInt(a[13]), BigInt(a[12]) + BigInt(b[12]), 'FLAT_TERMINAL_TOTAL_CAPACITY');
  }
  return detached({ before: previous[poolIndex].ledger.publicState, after: following[poolIndex].ledger.publicState,
    outputs, reserveNullifier: prefix(binding.reserveNullifier), hubSequenceBefore: BigInt(previous[poolIndex].hub[9]).toString(),
    hubSequenceAfter: BigInt(following[poolIndex].hub[9]).toString(), classification: 'PURE_DELTA_CHECK_NOT_AUTHORITY' });
}

export function assertOwnedFlatTerminalObserver(observer, { runtime, system, poolIndex }) {
  const bound = owned.get(observer);
  assert.ok(bound && bound.runtime === runtime && bound.system === system && bound.poolIndex === poolIndex,
    'FLAT_TERMINAL_OWNED_OBSERVER_REQUIRED'); assertOwnedFlatSystem(runtime, system);
}

export async function createFlatTerminalObserver(options) {
  exactRecord(options, ['runtime', 'system', 'poolIndex']);
  const { runtime, system, poolIndex } = options;
  assertOwnedFlatSystem(runtime, system); await assertLocalEvm(runtime);
  assert.ok(poolIndex === 0 || poolIndex === 1, 'FLAT_TERMINAL_POOL');
  function assertAsset(target) {
    assertOwnedPoolAsset(runtime, target.assetCapability);
    const metadata = target.assetCapability.metadata;
    assert.deepEqual(metadata, target.assetMetadata, 'FLAT_TERMINAL_ASSET_METADATA');
    assert.equal(metadata.address, target.asset, 'FLAT_TERMINAL_ASSET_ADDRESS');
    assert.equal(metadata.codeHash, target.assetCodeHash, 'FLAT_TERMINAL_ASSET_CODE');
    assert.equal(metadata.chainId, '31337', 'FLAT_TERMINAL_ASSET_CHAIN');
    assert.equal(metadata.genesisHash, runtime.metadata.evmGenesis, 'FLAT_TERMINAL_ASSET_GENESIS');
    assert.equal(metadata.kind, target.asset === ZERO_ADDRESS ? 'NATIVE' : 'ERC20', 'FLAT_TERMINAL_ASSET_KIND');
    return metadata;
  }
  system.pools.forEach(assertAsset);
  const pool = system.pools[poolIndex], identity = { hubDomain: system.hubDomain,
    pools: system.pools.map(({ address, scope, domainCommitment, asset }) => ({ address, scope, domainCommitment, asset })) };
  const reader = await createFlatSystemStateReader({ runtime, system, poolIndex });
  const codeRecords = [system.hub, ...system.pools, ...Object.values(system.libraries),
    ...Object.values(system.verifiers), ...Object.values(system.generatedLibraries ?? {})];
  async function readAssetAt(target, header) {
    const metadata = assertAsset(target);
    // The branded capability checks original deployment, complete token code
    // and metadata, and balanceOf at this exact canonical historical block.
    const observed = await target.assetCapability.read({ holder: target.address, blockNumber: header.number });
    assert.deepEqual(observed.metadata, metadata, 'FLAT_TERMINAL_ASSET_METADATA');
    assert.equal(observed.holder, target.address, 'FLAT_TERMINAL_ASSET_HOLDER');
    assert.equal(observed.blockNumber, header.number, 'FLAT_TERMINAL_ASSET_BLOCK');
    assert.equal(observed.blockHash, header.hash, 'FLAT_TERMINAL_ASSET_BLOCK_HASH');
    return observed;
  }
  async function readAt(tag) {
    assertOwnedFlatSystem(runtime, system); await assertLocalEvm(runtime);
    const header = await runtime.block(tag), at = header.number;
    await Promise.all(codeRecords.map(async record => {
      const code = await runtime.code(record.address, at);
      assert.equal(code, record.expectedCode, 'FLAT_TERMINAL_HISTORICAL_CODE_CHANGED');
      assert.equal(evmRuntimeCodeHash(code), record.codeHash,
        'FLAT_TERMINAL_HISTORICAL_CODE_HASH');
    }));
    const pools = await Promise.all(system.pools.map(async target => {
      const [rawState, rawHistory, rawBacking, rawHubState, nativeBalance, assetObservation] = await Promise.all([
        ...['canonicalState()', 'canonicalRootHistory()', 'canonicalBacking()'].map(method => target.call(method, [], at)),
        system.hub.call('canonicalState(address)', [target.address], at), runtime.balance(target.address, at),
        readAssetAt(target, header),
      ]);
      return { rawState, rawHistory, rawBacking, rawHubState, nativeBalance: nativeBalance.toString(),
        assetBalance: assetObservation.balance, assetTotalSupply: assetObservation.totalSupply, assetObservation };
    }));
    const authorization = await Promise.all(['authorizationTreeNodes()', 'authorizationRoot()', 'authorizationLeafCount()',
      'authorizationRootHistory()', 'authorizationRootHistoryCount()'].map(method => pool.call(method, [], at)));
    const unchangedHub = await Promise.all([
      ...['revocationOverflowCount()', 'revocationOverflowDigest()', 'checkpointCount()', 'checkpointRoot()', 'checkpointTreeNodes()']
        .map(method => system.hub.call(method, [], at)),
      ...system.pools.flatMap(target => ['evidenceStateHistory(bytes32)', 'evidenceStateCount(bytes32)']
        .map(method => system.hub.call(method, [target.domainCommitment], at))),
    ]);
    await runtime.assertCanonical(header);
    return { header, timestamp: BigInt(header.timestamp).toString(), pools, authorization, unchangedHub };
  }
  const observer = Object.freeze({
    async observe(input) {
      exactRecord(input, ['kind', 'submission', 'statement', 'binding']);
      exactRecord(input.submission, ['target', 'calldata', 'calldataSHA256', 'transactionHash']);
      const query = structuredClone(input), { kind, submission, statement, binding } = query;
      bindingOf(binding); assert.equal(submission.target, pool.address, 'FLAT_TERMINAL_TARGET');
      bytes32(submission.calldataSHA256, true);
      if (submission.transactionHash !== null) bytes32(submission.transactionHash, true);
      const decoded = decodeFlatTerminalCalldata(submission.calldata);
      assert.equal(decoded.kind, kind, 'FLAT_TERMINAL_KIND');
      assert.deepEqual(decoded.statement, validateStatement(kind, statement), 'FLAT_TERMINAL_STATEMENT_SUBSTITUTION');
      assert.equal(dataHash(submission.calldata), submission.calldataSHA256, 'FLAT_TERMINAL_CALLDATA_HASH');
      assert.equal(pool.artifact.evm.methodIdentifiers[FLAT_TRANSACTION_METHODS[decoded.name].signature],
        FLAT_TRANSACTION_METHODS[decoded.name].selector, 'FLAT_TERMINAL_PINNED_SELECTOR');
      assertOwnedFlatSystem(runtime, system); await assertLocalEvm(runtime);
      const candidates = runtime.transactions.filter(item => item.request.to === pool.address
        && item.request.from === system.sender && item.request.data === submission.calldata
        && (submission.transactionHash === null || item.transactionHash === prefix(submission.transactionHash)));
      assert.equal(candidates.length, 1, 'FLAT_TERMINAL_ORIGINAL_TRANSACTION_UNAVAILABLE');
      const retained = candidates[0]; assert.ok(retained.transactionHash, 'FLAT_TERMINAL_ORIGINAL_HASH_UNAVAILABLE');
      const [transaction, receipt] = await Promise.all([runtime.transaction(retained.transactionHash), runtime.receipt(retained.transactionHash)]);
      assert.ok(transaction && receipt, 'FLAT_TERMINAL_ORIGINAL_RECEIPT_UNAVAILABLE');
      assert.equal(receipt.status, '0x1', 'FLAT_TERMINAL_ORIGINAL_TRANSACTION_REVERTED');
      assert.equal(receipt.transactionHash, retained.transactionHash); assert.equal(transaction.hash, retained.transactionHash);
      assert.equal(transaction.from, retained.request.from); assert.equal(transaction.to, retained.request.to);
      assert.equal(transaction.input, retained.request.data); assert.equal(transaction.input, submission.calldata);
      assert.equal(BigInt(transaction.value), BigInt(retained.request.value ?? '0x0')); assert.equal(BigInt(transaction.value), 0n);
      assert.equal(BigInt(transaction.nonce), BigInt(retained.senderNonce));
      assert.equal(transaction.blockHash, receipt.blockHash); assert.equal(transaction.blockNumber, receipt.blockNumber);
      const header = await runtime.assertCanonical(receipt);
      assert.deepEqual(header.transactions, [receipt.transactionHash], 'FLAT_TERMINAL_SINGLE_TRANSACTION_BLOCK');
      assert.equal(BigInt(receipt.transactionIndex), 0n); assert.equal(BigInt(transaction.transactionIndex), 0n);
      assert.ok(BigInt(header.number) > 0n);
      const [before, after] = await Promise.all([readAt('0x' + (BigInt(header.number) - 1n).toString(16)), readAt(header.number)]);
      assert.equal(header.parentHash, before.header.hash, 'FLAT_TERMINAL_PARENT_BLOCK');
      assert.equal(after.header.hash, receipt.blockHash, 'FLAT_TERMINAL_RECEIPT_BLOCK');
      assert.deepEqual(after.authorization, before.authorization, 'FLAT_TERMINAL_AUTHORIZATION_CHANGED');
      assert.deepEqual(after.unchangedHub, before.unchangedHub, 'FLAT_TERMINAL_HUB_HISTORY_CHANGED');
      const roots = await Promise.all([
        pool.call('acceptedAuthorizationRoots(bytes32)', [prefix(statement.authorizationRoot)], before.header.number),
        pool.call('acceptedRoots(bytes32)', [prefix(statement.poolRoot)], before.header.number),
        pool.call('registeredEnvelopes(bytes32)', [prefix(binding.envelope)], before.header.number),
      ]);
      roots.forEach(value => assert.equal(BigInt(one(value)), 1n, 'FLAT_TERMINAL_PARENT_ACCEPTED_ROOT'));
      const authorizationRoots = decodeFlatWords(before.authorization[3], 65), rootCount = uint(one(before.authorization[4]), 65n);
      assert.ok(authorizationRoots.slice(0, Number(rootCount)).includes(prefix(statement.authorizationRoot)), 'FLAT_TERMINAL_PARENT_AUTH_HISTORY');
      if (kind === 'settlement') {
        const usable = await system.hub.call('isUsable(bytes32,bytes32)', [pool.domainCommitment, prefix(statement.evidenceState)], before.header.number);
        assert.equal(BigInt(one(usable)), 1n, 'FLAT_TERMINAL_PARENT_EVIDENCE_UNUSABLE');
        assert.ok(BigInt(decoded.request.healthFrom) <= BigInt(after.timestamp) && BigInt(after.timestamp) < BigInt(decoded.request.healthUntil),
          'FLAT_TERMINAL_HEALTH_INCLUSION_TIME');
      }
      const delta = inspectFlatTerminalDelta({ kind, statement, binding, poolIndex, identity, before, after,
        stateAdvanced: decodeGenericBalanceStateAdvanced(receipt, pool.address) });
      // Reconstruct the current whole system using the same owned pins. Later
      // deposits/withdrawals may change backing, but cannot erase this exact
      // historical append. Current bits alone never prove terminal execution.
      const current = await reader.read(), historical = terminalPool(after.pools[poolIndex], pool);
      assert.ok(BigInt(current.header.number) >= BigInt(header.number), 'FLAT_TERMINAL_LATEST_BLOCK_BEHIND');
      assert.ok(BigInt(current.ledger.publicState.sequence) >= BigInt(delta.after.sequence), 'FLAT_TERMINAL_LATEST_POOL_BEHIND');
      assert.ok(BigInt(current.state.stateSequence) >= BigInt(delta.hubSequenceAfter), 'FLAT_TERMINAL_LATEST_HUB_BEHIND');
      for (const name of ['commitments', 'nullifiers', 'roots'])
        assert.deepEqual(current.ledger[name].slice(0, historical[name].length), historical[name], 'FLAT_TERMINAL_LATEST_HISTORY_CHANGED');
      await runtime.checkReceipt(receipt); await runtime.assertCanonical(before.header); await runtime.assertCanonical(after.header);
      await reader.assertCurrent(current);
      return detached({ receipt, outcome: kind === 'settlement' ? 'FULFILLED' : 'RECOVERED', calldataSHA256: submission.calldataSHA256,
        confirmation: { ...delta, classification: 'OWNED_LOCAL_HISTORICAL_TERMINAL_TRANSITION_NOT_NATIVE_CONSENSUS',
          transactionHash: bare(receipt.transactionHash), blockHash: bare(receipt.blockHash), parentHash: bare(before.header.hash),
          blockNumber: BigInt(header.number).toString(), timestamp: after.timestamp, pool: pool.address,
          domainCommitment: binding.domainCommitment, assetMetadata: pool.assetMetadata,
          assetObservation: { before: before.pools[poolIndex].assetObservation, after: after.pools[poolIndex].assetObservation },
          reconciledHead: current.head } });
    },
  });
  owned.set(observer, { runtime, system, poolIndex }); return observer;
}
