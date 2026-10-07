/** Private, read-only observer for the fixed fake-value local owner process.
 * Branded to the exact owned runtime/system; no URL or caller-supplied status. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { assertLocalEvm } from '../../../backend/src/chains/evm/runtime/local-evm-ownership.mjs';
import { decodeGenericBalanceStateAdvanced, decodeGenericBalanceWithdrawal }
  from '../../../engine/src/execution/balances/generic-balance-observer.mjs';
import { decodeWalletPoolInputs } from '../../../engine/src/wallet/notes/private-wallet-note-encoding.mjs';
import { assertOwnedFlatSystem } from '../../../backend/src/operations/deployments/system/deploy-system.mjs';
import { assertOwnedPoolAsset } from '../../../backend/src/chains/shared/contracts/owned-pool-asset.mjs';
import { createFlatSystemStateReader } from '../../../backend/src/execution/account/reconciliation/flat-system-state.mjs';
import { exactRecord } from '../../../backend/src/execution/encoding/commitments.mjs';
import { decodeStatement } from '../../../backend/src/execution/encoding/statements.mjs';
import { ownerCopy, ownerDigest, flatOwnerIdentity, flatOwnerSnapshot, decodeFlatOwnerCalldata }
  from '../signing/flat-owner-custody.mjs';
import { decodeDepositIntentInputs } from '../../../backend/src/execution/account/preparation/deposit-intent.mjs';

const owned = new WeakMap();
const bare = value => value.slice(2);
const hash = value => { assert.ok(typeof value === 'string' && value.length === 64 && /^[0-9a-f]+$/.test(value)); return value; };
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
export function assertOwnedFlatOwnerObserver(observer, { runtime, system, poolIndex }) {
  const record = owned.get(observer);
  assert.ok(record && record.runtime === runtime && record.system === system && record.poolIndex === poolIndex,
    'FLAT_OWNER_OWNED_OBSERVER_REQUIRED'); assertOwnedFlatSystem(runtime, system);
}
export async function createFlatOwnerObserver(options) {
  const hasDelivery = Object.hasOwn(options, 'deliveryObserver');
  exactRecord(options, ['runtime', 'system', 'poolIndex', ...(hasDelivery ? ['deliveryObserver'] : [])]);
  const { runtime, system, poolIndex } = options;
  await assertLocalEvm(runtime); assertOwnedFlatSystem(runtime, system);
  assert.ok(poolIndex === 0 || poolIndex === 1); const pool = system.pools[poolIndex];
  assertOwnedPoolAsset(runtime, pool.assetCapability);
  const asset = pool.assetCapability.metadata;
  assert.deepEqual(pool.assetMetadata, asset, 'FLAT_OWNER_ASSET_METADATA');
  assert.equal(asset.address, pool.asset, 'FLAT_OWNER_ASSET_TOKEN');
  assert.equal(asset.codeHash, pool.assetCodeHash, 'FLAT_OWNER_ASSET_CODE');
  assert.equal(asset.chainId, '31337', 'FLAT_OWNER_ASSET_CHAIN');
  assert.ok(['NATIVE', 'ERC20'].includes(asset.kind), 'FLAT_OWNER_ASSET_KIND');
  const token = asset.kind === 'ERC20';
  const identity = flatOwnerIdentity({ pool: bare(pool.address), domain: pool.domain, domainCommitment: bare(pool.domainCommitment),
    ...(token ? { assetBinding: { token: bare(asset.address), codeHash: bare(asset.codeHash) } } : {}) });
  const identitySHA256 = ownerDigest(identity);
  // Optional PRIVATE bootstrap seam. Only the actual fixed router observer's
  // private brand is accepted; no callback/assertion supplied by a coordinator
  // can manufacture nested-deposit observation authority.
  const deliveryObserver = hasDelivery ? options.deliveryObserver : null;
  let assertDeliveryObserver = null;
  if (hasDelivery) {
    const legacy=await import('../../../backend/src/chains/evm/vault/evm-vault-delivery-observer.mjs');
    try {
      legacy.assertOwnedEvmVaultDeliveryObserver(deliveryObserver,{runtime,system,poolIndex});
      assertDeliveryObserver=legacy.assertOwnedEvmVaultDeliveryObserver;
    } catch {
      const external=await import('../../../backend/src/chains/shared/observations/private-external-incoming-observer-v1.mjs');
      external.assertOwnedPrivateExternalIncomingObserverV1(deliveryObserver,{runtime,system,poolIndex});
      assertDeliveryObserver=external.assertOwnedPrivateExternalIncomingObserverV1;
    }
  }
  const reader = await createFlatSystemStateReader({ runtime, system, poolIndex });
  const codeRecords = [system.hub, ...(system.deploymentProfile === 'LIANUM_FLAT_APPEND_ONLY_POOLS_V2' ? [pool] : system.pools), ...Object.values(system.libraries),
    ...Object.values(system.verifiers), ...Object.values(system.generatedLibraries)];
  async function readAssetAt(holder, header) {
    assertOwnedPoolAsset(runtime, pool.assetCapability);
    // The capability independently checks original deployment, full token
    // code bytes and hash, metadata, balances and canonical historical head.
    const observed = await pool.assetCapability.read({ holder, blockNumber: header.number });
    assert.deepEqual(observed.metadata, asset, 'FLAT_OWNER_ASSET_METADATA');
    assert.equal(observed.holder, holder, 'FLAT_OWNER_ASSET_HOLDER');
    assert.equal(observed.blockNumber, header.number, 'FLAT_OWNER_ASSET_BLOCK');
    assert.equal(observed.blockHash, header.hash, 'FLAT_OWNER_ASSET_BLOCK');
    return observed;
  }
  async function readAt(tag) {
    await assertLocalEvm(runtime); assertOwnedFlatSystem(runtime, system);
    const header = await runtime.block(tag);
    const [rawState, rawHistory, rawBacking, codes, poolAsset] = await Promise.all([
      ...['canonicalState()', 'canonicalRootHistory()', 'canonicalBacking()'].map(method => pool.call(method, [], header.number)),
      Promise.all(codeRecords.map(record => runtime.code(record.address, header.number))),
      readAssetAt(pool.address, header),
    ]);
    codeRecords.forEach((record, index) => assert.equal(codes[index], record.expectedCode, 'FLAT_OWNER_CODE_CHANGED'));
    const canonical = await runtime.assertCanonical(header);
    const snapshot = { identitySHA256, blockHash: bare(header.hash), canonicalBlockHashBefore: bare(header.hash),
      canonicalBlockHashAfter: bare(canonical.hash), timestamp: BigInt(header.timestamp).toString(), rawState, rawHistory, rawBacking };
    const decoded = flatOwnerSnapshot(snapshot, identity);
    assert.equal(poolAsset.balance, decoded.publicState.actualAssetBalance, 'FLAT_OWNER_ASSET_BACKING');
    return { header, snapshot, poolAsset };
  }
  async function readSnapshot() {
    const observed = await reader.read();
    const snapshot = { identitySHA256, blockHash: observed.head.hash, canonicalBlockHashBefore: observed.head.hash,
      canonicalBlockHashAfter: observed.head.hash, timestamp: observed.head.timestamp,
      ...Object.fromEntries(['rawState', 'rawHistory', 'rawBacking'].map(key => [key, observed.poolObservation[key]])) };
    const decoded = flatOwnerSnapshot(snapshot, identity);
    const poolAsset = await readAssetAt(pool.address, observed.header);
    assert.equal(poolAsset.balance, decoded.publicState.actualAssetBalance, 'FLAT_OWNER_ASSET_BACKING');
    await reader.assertCurrent(observed); return ownerCopy(snapshot);
  }

  async function observeTokenMovement(decoded, transaction, before, after) {
    const withdrawal = decoded.kind === 'withdrawal', deposit = decoded.kind === 'deposit';
    const statement = withdrawal || deposit
      ? decodeWalletPoolInputs(withdrawal ? 'withdraw_balance' : 'deposit_balance', decoded.publicInputs) : null;
    const participant = withdrawal ? statement.recipient : transaction.from;
    assert.notEqual(participant, pool.address, 'FLAT_OWNER_ASSET_SELF_MOVEMENT');
    assert.equal(BigInt(transaction.value), 0n, 'FLAT_OWNER_NATIVE_VALUE');
    const [participantBefore, participantAfter] = await Promise.all([
      readAssetAt(participant, before.header), readAssetAt(participant, after.header),
    ]);
    const delta = deposit ? BigInt(statement.amount) : withdrawal ? -BigInt(statement.amount) : 0n;
    assert.equal(BigInt(after.poolAsset.balance), BigInt(before.poolAsset.balance) + delta, 'FLAT_OWNER_ASSET_POOL_DELTA');
    assert.equal(BigInt(participantAfter.balance), BigInt(participantBefore.balance) - delta,
      'FLAT_OWNER_ASSET_PARTICIPANT_DELTA');
    const balanceRecord = (view, participantView) => ({ blockHash: bare(view.header.hash),
      poolBalance: view.poolAsset.balance, participantBalance: participantView.balance });
    return { kind: 'ERC20', token: bare(asset.address), codeHash: bare(asset.codeHash), pool: identity.pool,
      participant: bare(participant), participantRole: withdrawal ? 'RECIPIENT' : 'SENDER',
      before: balanceRecord(before, participantBefore), after: balanceRecord(after, participantAfter) };
  }
  async function readTransaction(input) {
    const query = ownerCopy(input); exactRecord(query, ['kind', 'identitySHA256', 'transactionHash', 'calldataSHA256']);
    assert.ok(['deposit', 'reservation', 'recovery', 'withdraw_source', 'withdraw_change', 'withdraw_recovery'].includes(query.kind));
    assert.equal(query.identitySHA256, identitySHA256); hash(query.calldataSHA256);
    if (query.transactionHash !== null) hash(query.transactionHash);
    await assertLocalEvm(runtime); assertOwnedFlatSystem(runtime, system);
    const candidates = runtime.transactions.filter(record => record.request.to === pool.address
      && record.request.from === system.sender && typeof record.request.data === 'string'
      && sha(Buffer.from(record.request.data.slice(2), 'hex')) === query.calldataSHA256
      && (query.transactionHash === null || record.transactionHash === '0x' + query.transactionHash));
    if (candidates.length === 0) return null;
    assert.equal(candidates.length, 1, 'FLAT_OWNER_AMBIGUOUS_TRANSACTION'); const retained = candidates[0];
    if (!retained.transactionHash) return null;
    const [transaction, receipt] = await Promise.all([runtime.transaction(retained.transactionHash), runtime.receipt(retained.transactionHash)]);
    if (transaction === null || receipt === null) return null;
    assert.equal(receipt.status, '0x1', 'FLAT_OWNER_TRANSACTION_REVERTED');
    assert.equal(transaction.to, pool.address); assert.equal(transaction.from, system.sender);
    assert.equal(transaction.input, retained.request.data); assert.equal(transaction.value, retained.request.value ?? '0x0');
    assert.equal(BigInt(transaction.nonce), BigInt(retained.senderNonce));
    assert.equal(transaction.blockHash, receipt.blockHash); assert.equal(transaction.blockNumber, receipt.blockNumber);
    const header = await runtime.assertCanonical(receipt);
    assert.deepEqual(header.transactions, [receipt.transactionHash], 'FLAT_OWNER_SINGLE_TRANSACTION_BLOCK');
    assert.equal(BigInt(receipt.transactionIndex), 0n); assert.ok(BigInt(header.number) > 0n);
    const [before, after] = await Promise.all([readAt('0x' + (BigInt(header.number) - 1n).toString(16)), readAt(header.number)]);
    assert.equal(header.parentHash, before.header.hash); assert.equal(after.header.hash, receipt.blockHash);
    const decoded = decodeFlatOwnerCalldata(pool.artifact, transaction.input);
    assert.equal(decoded.kind, query.kind.startsWith('withdraw_') ? 'withdrawal' : query.kind);
    const assetObservation = token ? await observeTokenMovement(decoded, transaction, before, after) : null;
    if (decoded.kind === 'reservation') {
      const statement = decodeStatement('reservation', decoded.publicInputs);
      for (const [signature, value] of [['admissions(bytes32)', statement.admissionTag], ['registeredEnvelopes(bytes32)', statement.envelope]]) {
        assert.equal(BigInt(await pool.call(signature, ['0x' + value], before.header.number)), 0n);
        assert.equal(BigInt(await pool.call(signature, ['0x' + value], after.header.number)), 1n);
      }
    }
    let recoveryRoots;
    if (decoded.kind === 'recovery') {
      const statement = decodeStatement('recovery', decoded.publicInputs);
      const [rawAuthorizationRootHistory, rawAuthorizationRootHistoryCount, acceptedAuthorization, acceptedPool] = await Promise.all([
        pool.call('authorizationRootHistory()', [], before.header.number),
        pool.call('authorizationRootHistoryCount()', [], before.header.number),
        pool.call('acceptedAuthorizationRoots(bytes32)', ['0x' + statement.authorizationRoot], before.header.number),
        pool.call('acceptedRoots(bytes32)', ['0x' + statement.poolRoot], before.header.number),
      ]);
      assert.equal(BigInt(acceptedAuthorization), 1n, 'FLAT_OWNER_RECOVERY_AUTHORIZATION_ROOT');
      assert.equal(BigInt(acceptedPool), 1n, 'FLAT_OWNER_RECOVERY_POOL_ROOT');
      recoveryRoots = { rawAuthorizationRootHistory, rawAuthorizationRootHistoryCount };
    }
    await runtime.checkReceipt(receipt); await runtime.assertCanonical(before.header); await runtime.assertCanonical(after.header);
    // The latest owned reader checks reciprocal pins and all public roots. The
    // transaction delta above remains tied to its original historical block.
    const current = await reader.read(); await reader.assertCurrent(current);
    return ownerCopy({ identitySHA256,
      transaction: { hash: bare(transaction.hash), to: bare(transaction.to), value: BigInt(transaction.value).toString(),
        calldata: transaction.input, ...(token ? { from: bare(transaction.from) } : {}) },
      receipt: { transactionHash: bare(receipt.transactionHash), blockHash: bare(receipt.blockHash), status: 1 },
      before: before.snapshot, after: after.snapshot, stateAdvanced: decodeGenericBalanceStateAdvanced(receipt, pool.address),
      ...(assetObservation ? { assetObservation } : {}),
      ...(recoveryRoots ? { recoveryRoots } : {}),
      ...(decoded.kind === 'withdrawal' ? { withdrawal: decodeGenericBalanceWithdrawal(receipt, pool.address) } : {}) });
  }
  async function readDepositIntentDelivery(input) {
    const query = ownerCopy(input);
    exactRecord(query, ['identitySHA256', 'transactionHash', 'calldataSHA256', 'publicInputs']);
    assert.equal(query.identitySHA256, identitySHA256);
    hash(query.transactionHash); hash(query.calldataSHA256);
    const statement = decodeDepositIntentInputs(query.publicInputs);
    assert.equal(statement.scope, identity.domain.scope); assert.equal(statement.policy, identity.domain.policy);
    assert.ok(deliveryObserver && assertDeliveryObserver, 'FLAT_OWNER_DELIVERY_OBSERVER_REQUIRED');
    assertDeliveryObserver(deliveryObserver, { runtime, system, poolIndex });
    const observation = await deliveryObserver.observe({ transactionHash: query.transactionHash,
      calldataSHA256: query.calldataSHA256 });
    if (observation === null) return null;
    assert.equal(observation.identitySHA256, identitySHA256, 'FLAT_OWNER_DELIVERY_IDENTITY');
    assert.equal(observation.transaction.hash, query.transactionHash, 'FLAT_OWNER_DELIVERY_TRANSACTION');
    assert.equal(sha(Buffer.from(observation.transaction.calldata.slice(2), 'hex')), query.calldataSHA256,
      'FLAT_OWNER_DELIVERY_CALLDATA');
    assert.deepEqual(observation.delivery.publicInputs, query.publicInputs, 'FLAT_OWNER_DELIVERY_STATEMENT');
    return ownerCopy(observation);
  }
  const observer = Object.freeze({ identity: Object.freeze(ownerCopy(identity)), poolArtifact: pool.artifact,
    readSnapshot, readTransaction, readDepositIntentDelivery,
    classification: 'OWNED_LOCAL_TRANSACTION_SPECIFIC_OBSERVATION_NOT_NATIVE_CONSENSUS' });
  owned.set(observer, { runtime, system, poolIndex }); return observer;
}
