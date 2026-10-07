/** Private keeper integration for one reusable, genuinely backed generic pool.
 *
 * The account child receives opaque references and terminal observation envelopes
 * only. Owner preparation, note openings and scoped proof packets stay behind
 * these private capabilities. The surviving keeper remains trusted and required;
 * this module does not reconstruct a lost runtime or invent a safe resend.
 */
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { Vault } from '../../crypto/vault.mjs';
import { canonical } from '../../crypto/privacy.mjs';
import { assertLocalEvm } from '../local/local-evm.mjs';
import { assertOwnedNativeSystem } from '../native/dispatch/native-deployment.mjs';
import { readNativeSystemState } from '../native/state/native-system-state.mjs';
import { assertOwnedGenericBalanceObserver, decodeGenericBalanceCalldata } from './generic-balance-observer.mjs';
import { assertOwnedGenericBalanceOwnerProcess } from './generic-balance-owner-process.mjs';
import { assertOwnedGenericNativeExecutionKeeper, validateGenericNativeExecutionPreparation } from '../native/dispatch/generic-native-execution.mjs';
import { openGenericRefundHandoff, deriveGenericRefundBinding } from '../accounts/generic-account-refund-handoff.mjs';
import { inspectGenericSnapshot } from '../local/local-ledger.mjs';
import { createProofProcess } from '../proofs/proof-process.mjs';
import { wipePrivate } from '../proofs/proof-worker.mjs';
import { validatePrivateAccountRegistry } from '../../accounts/private-account-state.mjs';
import { genericAccountIdentity, validateBoundRequest, immutable, sha }
  from '../accounts/generic-account-journal.mjs';
import { reserveInputs, publicWords }
  from '../../../../../experiments/protocol/private-core-proof/generic-wrappers/abi.mjs';

const clone = value => JSON.parse(canonical(value));
const bytesHash = value => createHash('sha256').update(value).digest('hex');
const bare = value => value.slice(2);
const ref = value => assert.match(value, /^[0-9a-f]{64}$/, 'BALANCE_ACCOUNT_REFERENCE');
const safeCode = error => /^[A-Z][A-Z0-9_]{1,120}$/.test(error?.code ?? '')
  ? error.code : 'BALANCE_ACCOUNT_ORIGINAL_OUTCOME_UNRESOLVED';
const exact = (value, keys, code) => {
  canonical(value);
  assert.ok(value && Object.getPrototypeOf(value) === Object.prototype, code);
  assert.deepEqual(Object.keys(value).sort(), [...keys].sort(), code);
};
const proofDigest = proof => ({ proofSHA256: bytesHash(proof.proof), publicInputsSHA256: sha(proof.publicInputs),
  ...(proof.proofFields ? { proofFieldsSHA256: sha(proof.proofFields), vkFieldsSHA256: sha(proof.vkFields) } : {}) });
const prefix = value => '0x' + value;
const digestAt = (words, index) => words.slice(index, index + 8)
  .map(word => BigInt(word).toString(16).padStart(8, '0')).join('');

function inspectedSnapshot(snapshot, identity) {
  exact(snapshot, ['identitySHA256', 'blockHash', 'canonicalBlockHashBefore', 'canonicalBlockHashAfter',
    'timestamp', 'rawState', 'rawHistory', 'rawBacking'], 'BALANCE_ACCOUNT_SNAPSHOT_FIELDS');
  assert.equal(snapshot.identitySHA256, sha(identity), 'BALANCE_ACCOUNT_OBSERVER_IDENTITY');
  ref(snapshot.blockHash);
  assert.equal(snapshot.canonicalBlockHashBefore, snapshot.blockHash, 'BALANCE_ACCOUNT_SNAPSHOT_REORG');
  assert.equal(snapshot.canonicalBlockHashAfter, snapshot.blockHash, 'BALANCE_ACCOUNT_SNAPSHOT_REORG');
  assert.match(snapshot.timestamp, /^(0|[1-9][0-9]*)$/, 'BALANCE_ACCOUNT_SNAPSHOT_TIME');
  return inspectGenericSnapshot({ ...snapshot, scope: prefix(identity.scope) });
}

function checkedTransition(observation, identity, artifact, submission, kind) {
  exact(observation, ['identitySHA256', 'transaction', 'receipt', 'before', 'after',
    'stateAdvanced', 'transition', ...(kind === 'F51' ? ['recovery'] : [])], 'BALANCE_ACCOUNT_OBSERVATION_FIELDS');
  assert.equal(observation.identitySHA256, sha(identity), 'BALANCE_ACCOUNT_OBSERVER_IDENTITY');
  const { transaction, receipt } = observation;
  exact(transaction, ['hash', 'to', 'value', 'calldata'], 'BALANCE_ACCOUNT_TRANSACTION_FIELDS');
  exact(receipt, ['transactionHash', 'blockHash', 'status'], 'BALANCE_ACCOUNT_RECEIPT_FIELDS');
  ref(transaction.hash); ref(receipt.blockHash);
  if (submission.transactionHash !== null) assert.equal(transaction.hash, submission.transactionHash,
    'BALANCE_ACCOUNT_TRANSACTION_CHANGED');
  assert.equal(transaction.to, identity.pool, 'BALANCE_ACCOUNT_TRANSACTION_POOL');
  assert.equal(transaction.value, '0', 'BALANCE_ACCOUNT_TRANSACTION_VALUE');
  assert.equal(transaction.calldata, submission.calldata, 'BALANCE_ACCOUNT_TRANSACTION_CHANGED');
  assert.equal(bytesHash(Buffer.from(transaction.calldata.slice(2), 'hex')), submission.calldataSHA256,
    'BALANCE_ACCOUNT_TRANSACTION_CHANGED');
  assert.equal(receipt.transactionHash, transaction.hash, 'BALANCE_ACCOUNT_RECEIPT_TRANSACTION');
  assert.equal(receipt.status, 1, 'BALANCE_ACCOUNT_SUCCESS_REQUIRED');
  const decoded = decodeGenericBalanceCalldata(artifact, transaction.calldata);
  assert.equal(decoded.kind, kind, 'BALANCE_ACCOUNT_TRANSACTION_KIND');
  assert.deepEqual(decoded.publicInputs, submission.publicInputs, 'BALANCE_ACCOUNT_PUBLIC_INPUTS_CHANGED');
  assert.deepEqual(decoded.transition, observation.transition, 'BALANCE_ACCOUNT_TRANSITION_CHANGED');
  const before = inspectedSnapshot(observation.before, identity), after = inspectedSnapshot(observation.after, identity);
  assert.equal(receipt.blockHash, observation.after.blockHash, 'BALANCE_ACCOUNT_RECEIPT_BLOCK');
  assert.ok(BigInt(observation.after.timestamp) >= BigInt(observation.before.timestamp), 'BALANCE_ACCOUNT_SNAPSHOT_TIME');
  assert.equal(BigInt(after.publicState.sequence), BigInt(before.publicState.sequence) + 1n, 'BALANCE_ACCOUNT_SEQUENCE');
  assert.deepEqual(after.commitments, [...before.commitments, ...decoded.transition.insertedCommitments.map(prefix)],
    'BALANCE_ACCOUNT_COMMITMENT_DELTA');
  assert.deepEqual(after.nullifiers, [...before.nullifiers, ...decoded.transition.spentNullifiers.map(prefix)],
    'BALANCE_ACCOUNT_NULLIFIER_DELTA');
  assert.deepEqual(after.roots, [...before.roots, after.publicState.root], 'BALANCE_ACCOUNT_ROOT_HISTORY');
  assert.deepEqual(observation.stateAdvanced, { address: identity.pool, transactionHash: transaction.hash,
    blockHash: receipt.blockHash, sequence: after.publicState.sequence, root: after.publicState.root,
    spent: after.publicState.spentDigest, leaves: after.publicState.leaves, consumed: after.publicState.spent },
  'BALANCE_ACCOUNT_STATE_EVENT');
  for (const key of ['backedAmount', 'actualAssetBalance', 'surplus', 'unrelatedNative']) {
    assert.equal(after.publicState[key], before.publicState[key], 'BALANCE_ACCOUNT_BACKING_CHANGED');
  }
  return { before, after, decoded };
}

function checkedSource(observation, identity, artifact, binding, source) {
  const result = checkedTransition(observation, identity, artifact, source, 'S66');
  const { before, after, decoded } = result, words = decoded.publicInputs;
  for (const [key, index] of Object.entries({ scope: 0, policy: 8, asset: 16, inputNullifier: 32,
    reserveCommitment: 40, changeCommitment: 48, admissionTag: 56 })) {
    assert.equal(digestAt(words, index), binding[key], 'BALANCE_ACCOUNT_SOURCE_BINDING');
  }
  assert.equal(words[64], binding.fundingNotBefore, 'BALANCE_ACCOUNT_SOURCE_WINDOW');
  assert.equal(words[65], binding.fundingValidUntil, 'BALANCE_ACCOUNT_SOURCE_WINDOW');
  assert.ok(BigInt(observation.after.timestamp) >= BigInt(words[64])
    && BigInt(observation.after.timestamp) < BigInt(words[65]), 'BALANCE_ACCOUNT_SOURCE_WINDOW');
  assert.equal(prefix(digestAt(words, 24)), before.publicState.root, 'BALANCE_ACCOUNT_SOURCE_ROOT');
  assert.deepEqual(decoded.guards, { expectedSequence: before.publicState.sequence,
    expectedPostRoot: after.publicState.root }, 'BALANCE_ACCOUNT_SOURCE_GUARDS');
  assert.ok(before.commitments.includes(prefix(binding.fundingCommitment))
    && !before.nullifiers.includes(prefix(binding.inputNullifier)), 'BALANCE_ACCOUNT_SOURCE_MEMBERSHIP');
  assert.equal(after.publicState.liveReservations, before.publicState.liveReservations + 1,
    'BALANCE_ACCOUNT_SOURCE_RESERVATIONS');
  assert.equal(after.publicState.outputCapacity, before.publicState.outputCapacity, 'BALANCE_ACCOUNT_SOURCE_CAPACITY');
  return result;
}

/** Pure host boundary check only. Synthetic observations can pass this codec;
 * production calls it only after its branded observer fetches the original EVM
 * transaction. This is neither proof acceptance nor an issuance capability. */
export function validateGenericAccountRecoveryObservation({ identity, artifact, binding, source, recovery, observation }) {
  assert.equal(binding.identitySHA256, sha(identity), 'BALANCE_ACCOUNT_RECOVERY_IDENTITY');
  assert.equal(binding.scope, identity.scope, 'BALANCE_ACCOUNT_RECOVERY_IDENTITY');
  assert.equal(binding.policy, identity.policy, 'BALANCE_ACCOUNT_RECOVERY_IDENTITY');
  assert.equal(binding.asset, identity.asset.identity, 'BALANCE_ACCOUNT_RECOVERY_IDENTITY');
  const original = checkedSource(source.observation, identity, artifact, binding, source);
  const { before, after, decoded } = checkedTransition(observation, identity, artifact, recovery, 'F51');
  assert.deepEqual(observation.recovery, decoded.recovery, 'BALANCE_ACCOUNT_RECOVERY_FIELDS');
  for (const key of ['scope', 'policy', 'asset', 'reserveNullifier', 'recoveryCommitment', 'settleBefore']) {
    assert.equal(decoded.recovery[key], binding[key], 'BALANCE_ACCOUNT_RECOVERY_BINDING');
  }
  for (const key of ['commitments', 'nullifiers', 'roots']) {
    assert.deepEqual(before[key].slice(0, original.after[key].length), original.after[key],
      'BALANCE_ACCOUNT_SOURCE_HISTORY');
  }
  assert.ok(BigInt(before.publicState.sequence) >= BigInt(original.after.publicState.sequence),
    'BALANCE_ACCOUNT_SOURCE_HISTORY');
  assert.ok(before.roots.indexOf(prefix(decoded.recovery.acceptedRoot)) >= original.before.roots.length,
    'BALANCE_ACCOUNT_RECOVERY_ROOT');
  assert.ok(!before.nullifiers.includes(prefix(binding.reserveNullifier))
    && !before.commitments.includes(prefix(binding.recoveryCommitment)), 'BALANCE_ACCOUNT_RECOVERY_ALREADY_CONSUMED');
  const { settleBefore, validFrom, validUntil } = decoded.recovery;
  assert.ok(BigInt(settleBefore) <= BigInt(validFrom) && BigInt(validFrom) < BigInt(validUntil)
    && BigInt(validUntil) === BigInt(validFrom) + 300n
    && BigInt(observation.after.timestamp) >= BigInt(validFrom)
    && BigInt(observation.after.timestamp) < BigInt(validUntil), 'BALANCE_ACCOUNT_RECOVERY_WINDOW');
  assert.ok(before.publicState.liveReservations > 0
    && after.publicState.liveReservations === before.publicState.liveReservations - 1,
  'BALANCE_ACCOUNT_RECOVERY_RESERVATIONS');
  assert.equal(after.publicState.outputCapacity, before.publicState.outputCapacity + 1,
    'BALANCE_ACCOUNT_RECOVERY_CAPACITY');
  return { transactionHash: observation.transaction.hash, blockHash: observation.receipt.blockHash,
    calldataSHA256: recovery.calldataSHA256, beforeSnapshotSHA256: sha(observation.before),
    afterSnapshotSHA256: sha(observation.after), sourceObservationSHA256: sha(source.observation),
    recovery: clone(decoded.recovery) };
}

/** Source of the asset registry is the authenticated pool, never a user label. */
export function genericBalanceAccountAsset(identity) {
  const asset = {
    assetId: sha({ genesis: identity.evmGenesis, pool: identity.pool, scope: identity.scope,
      assetIdentity: identity.asset.identity }),
    kind: identity.asset.kind, symbol: identity.asset.kind === 'NATIVE' ? 'ETH' : 'PALT',
    decimals: identity.asset.kind === 'NATIVE' ? 18 : 6,
    chainId: identity.chainId, genesis: identity.evmGenesis, pool: identity.pool,
    scope: identity.scope, policy: identity.policy, token: identity.asset.address,
    codeHash: identity.asset.codeHash, assetIdentity: identity.asset.identity,
    custody: 'ONCHAIN_NOTE_POOL', trust: 'PINNED_LOCAL_CONTRACT_AND_TRUSTED_NATIVE_ISSUER',
  };
  validatePrivateAccountRegistry([asset]);
  return immutable(asset);
}

export async function createGenericBalanceAccountAuthority(input, callbacks = {}) {
  const fields = ['runtime', 'system', 'poolIndex', 'owner', 'observer', 'nativeExecution', 'accountId', 'journalId'];
  assert.ok(input && Object.getPrototypeOf(input) === Object.prototype, 'BALANCE_ACCOUNT_OPTIONS');
  assert.deepEqual(Reflect.ownKeys(input).sort(), fields.sort(), 'BALANCE_ACCOUNT_OPTIONS');
  const { runtime, system, poolIndex, owner, observer, nativeExecution, accountId, journalId } = input;
  assertOwnedNativeSystem(runtime, system);
  await assertLocalEvm(runtime);
  assertOwnedGenericBalanceObserver(observer, { runtime, system, poolIndex });
  assertOwnedGenericNativeExecutionKeeper(nativeExecution, { runtime, system, poolIndex });
  assert.ok(Object.keys(callbacks).every(key => ['onStage', 'onProof', 'onPrivateAudit'].includes(key)),
    'BALANCE_ACCOUNT_CALLBACKS');
  const onStage = callbacks.onStage ?? (async () => {});
  const onProof = callbacks.onProof ?? (async () => {});
  const onPrivateAudit = callbacks.onPrivateAudit ?? (async () => {});
  for (const callback of [onStage, onProof, onPrivateAudit]) assert.equal(typeof callback, 'function');

  const identity = observer.identity, identitySHA256 = sha(identity), asset = genericBalanceAccountAsset(identity);
  assertOwnedGenericBalanceOwnerProcess(owner, { runtime, system, poolIndex, identitySHA256 });
  const config = immutable({ accountId, journalId, lifetime: identity.issuerLifetime, registry: [asset] });
  const accountIdentity = genericAccountIdentity(config), pool = system.pools[poolIndex];
  const directory = await mkdtemp(join(runtime.metadata.scratchDirectory, 'generic-account-authority-'));
  const vault = new Vault(join(directory, 'operations.vault'));
  let password = 'synthetic-' + randomBytes(32).toString('hex');
  let record = await vault.create({ version: 1, identitySHA256, operations: [] }, password);
  assert.deepEqual(await vault.read(password), record, 'BALANCE_ACCOUNT_INITIAL_READBACK');
  const privateOperations = new Map(), refundHandoffs = new Map();
  let busy = false, unavailable = false, closed = false, cancelled = false, activeProof = null;
  let idle = Promise.resolve(), releaseIdle = null, abortPromise = null;

  const exclusive = async work => {
    assert.ok(!busy && !unavailable && !closed && !cancelled, 'BALANCE_ACCOUNT_UNAVAILABLE');
    busy = true;
    idle = new Promise(resolve => { releaseIdle = resolve; });
    try { return await work(); } finally { busy = false; releaseIdle(); releaseIdle = null; }
  };
  async function healthy() {
    assert.ok(!unavailable && !closed, 'BALANCE_ACCOUNT_UNAVAILABLE');
    assertOwnedNativeSystem(runtime, system);
    assertOwnedGenericBalanceOwnerProcess(owner, { runtime, system, poolIndex, identitySHA256 });
    assertOwnedGenericBalanceObserver(observer, { runtime, system, poolIndex });
    assert.equal(sha(observer.identity), identitySHA256, 'BALANCE_ACCOUNT_IDENTITY_CHANGED');
    await assertLocalEvm(runtime);
    assert.deepEqual(await vault.read(password), record, 'BALANCE_ACCOUNT_STORAGE_CHANGED');
  }
  async function write(change) {
    try {
      await healthy();
      const next = await vault.update(password, record.revision, old => change(clone(old)));
      assert.equal(next.revision, record.revision + 1, 'BALANCE_ACCOUNT_REVISION');
      assert.deepEqual(await vault.read(password), next, 'BALANCE_ACCOUNT_READBACK');
      record = next;
    } catch (error) { unavailable = true; throw error; }
  }
  function operation(reference) {
    ref(reference);
    const value = record.data.operations.find(item => item.ownerOperationRef === reference);
    assert.ok(value, 'BALANCE_ACCOUNT_OWNER_PREPARATION_REQUIRED');
    return value;
  }
  async function update(reference, fields) {
    await write(state => ({ ...state, operations: state.operations.map(item =>
      item.ownerOperationRef === reference ? { ...item, ...clone(fields) } : item) }));
  }
  function dropPackets(reference) {
    const value = privateOperations.get(reference);
    if (value) wipePrivate(value.prepared);
    privateOperations.delete(reference);
  }
  function handoff(reference) {
    const value = refundHandoffs.get(reference);
    assert.ok(value?.store, 'BALANCE_ACCOUNT_ORIGINAL_HANDOFF_REQUIRED');
    return value;
  }
  async function retainedAuthorization(reference) {
    const value = handoff(reference);
    return value.store.read({ ownerOperationRef: reference, binding: value.binding });
  }
  async function retainGraph(reference, prepared, plan) {
    const binding = deriveGenericRefundBinding({ identity, ownerOperationRef: reference,
      authorization: prepared.authorization });
    assert.deepEqual(prepared.authorization.publicInputs, plan.authorizationPublicInputs,
      'BALANCE_ACCOUNT_ORIGINAL_A0_REQUIRED');
    for (const key of ['scope', 'policy', 'asset', 'inputNullifier', 'reserveCommitment', 'changeCommitment', 'admissionTag']) {
      assert.equal(binding[key], plan.statement[key], 'BALANCE_ACCOUNT_HANDOFF_PLAN_BINDING');
    }
    assert.equal(binding.fundingCommitment, bare(plan.inputPath.leaf), 'BALANCE_ACCOUNT_HANDOFF_SOURCE_BINDING');
    assert.equal(binding.fundingNotBefore, plan.statement.validFrom, 'BALANCE_ACCOUNT_HANDOFF_PLAN_BINDING');
    assert.equal(binding.fundingValidUntil, plan.statement.validUntil, 'BALANCE_ACCOUNT_HANDOFF_PLAN_BINDING');
    for (const key of ['reserveCommitment', 'reserveNullifier', 'settleBefore']) {
      assert.equal(binding[key], prepared[key], 'BALANCE_ACCOUNT_HANDOFF_PREPARATION_BINDING');
    }
    const retained = { binding: clone(binding), checkpoint: null, store: null };
    // A distinct handoff keeps only A0. Its checkpoint is held independently in
    // this surviving keeper, never reconstructed from handoff ciphertext.
    assert.ok(!refundHandoffs.has(reference), 'BALANCE_ACCOUNT_HANDOFF_ALREADY_ALLOCATED');
    refundHandoffs.set(reference, retained);
    const opened = await openGenericRefundHandoff({ path: join(directory, reference + '.refund.vault'),
      password: 'synthetic-' + randomBytes(32).toString('hex'), identity, create: true, checkpoint: null }, {
      keeper: {
        async readCheckpoint() { return clone(retained.checkpoint); },
        async compareAndSwapCheckpoint({ expected, next }) {
          assert.deepEqual(retained.checkpoint, expected, 'BALANCE_ACCOUNT_HANDOFF_CHECKPOINT_CHANGED');
          // Atomic in this trusted process: no asynchronous boundary precedes assignment.
          retained.checkpoint = clone(next);
          return clone(retained.checkpoint);
        },
      },
    });
    retained.store = opened.privateStore;
    await retained.store.retain({ ownerOperationRef: reference, authorization: prepared.authorization, binding });
    return binding;
  }
  function request(value) {
    const bound = validateBoundRequest(value, config), entry = operation(bound.ownerOperationRef);
    assert.equal(bound.assetId, asset.assetId, 'BALANCE_ACCOUNT_ASSET_CHANGED');
    assert.equal(bound.kind, entry.kind, 'BALANCE_ACCOUNT_KIND_CHANGED');
    if (entry.request !== null) assert.deepEqual(bound, entry.request, 'BALANCE_ACCOUNT_REQUEST_REBOUND');
    return { bound, entry };
  }
  async function register(reference, kind, privateData = null) {
    ref(reference);
    const status = await owner.publicView.operation(reference);
    assert.equal(status.kind, { TOP_UP: 'D26', GRAPH: 'S66', EXIT: 'W39' }[kind], 'BALANCE_ACCOUNT_OWNER_KIND');
    assert.equal(status.stage, 'AUTHORIZED', 'BALANCE_ACCOUNT_OWNER_AUTHORIZATION_REQUIRED');
    const plan = await owner.owner.ownerPlan(reference);
    assert.equal(plan.statement.scope, identity.scope, 'BALANCE_ACCOUNT_OWNER_DOMAIN');
    assert.equal(plan.statement.policy, identity.policy, 'BALANCE_ACCOUNT_OWNER_DOMAIN');
    const preparationSHA256 = kind !== 'GRAPH' ? sha({ kind, statement: plan.statement })
      : sha({ kind, authorization: proofDigest(privateData.prepared.authorization),
        capsule: proofDigest(privateData.prepared.capsuleAuthorization),
        rolePackets: privateData.prepared.rolePackets,
        providerRiskSalts: privateData.prepared.providerRiskSalts,
        providers: privateData.providers.map(({ slot, family, recipientIndex }) => ({ slot, family, recipientIndex })) });
    const old = record.data.operations.find(item => item.ownerOperationRef === reference);
    if (old) {
      assert.equal(old.kind, kind, 'BALANCE_ACCOUNT_OPERATION_REBOUND');
      assert.equal(old.preparationSHA256, preparationSHA256, 'BALANCE_ACCOUNT_OPERATION_REBOUND');
      return { ownerOperationRef: reference, assetId: asset.assetId, kind };
    }
    assert.ok(record.data.operations.length < 64, 'BALANCE_ACCOUNT_OPERATION_LIMIT');
    let refundBinding = null;
    if (kind === 'GRAPH') {
      assert.deepEqual(privateData.prepared.authorization.publicInputs, plan.authorizationPublicInputs,
        'BALANCE_ACCOUNT_ORIGINAL_A0_REQUIRED');
      assert.equal(privateData.prepared.reserveCommitment, plan.statement.reserveCommitment,
        'BALANCE_ACCOUNT_RESERVE_CHANGED');
      refundBinding = await retainGraph(reference, privateData.prepared, plan);
    }
    await write(state => ({ ...state, operations: [...state.operations, {
      ownerOperationRef: reference, kind, preparationSHA256, request: null, stage: 'READY',
      calldataSHA256: null, transactionHash: null, outcome: null, errorCode: null,
      ...(kind === 'GRAPH' ? { refundBinding, source: null, terminal: null, recovery: null } : {}),
    }] }));
    if (privateData) privateOperations.set(reference, privateData);
    return { ownerOperationRef: reference, assetId: asset.assetId, kind };
  }

  async function prove(facade, mode, witness, expected, reference) {
    let proof;
    try {
      proof = await facade.prove(mode, witness, expected, 'generic-account-' + mode);
      assert.equal(proof.metrics.acceptedResult, true, 'BALANCE_ACCOUNT_PROOF_INCOMPLETE');
      await onProof({ reference, mode, proof }); // Trusted private bootstrap callback.
      return proof;
    } catch (error) { wipePrivate(proof); throw error; }
    finally { wipePrivate(witness); }
  }
  async function submitOwnerTransition(reference, proof, plan, kind) {
    const mode = { TOP_UP: 'deposit_balance', GRAPH: 'reserve_generic', EXIT: 'withdraw_balance' }[kind];
    const calldata = pool.proofData(mode, proof.proof, proof.publicInputs, plan.guards);
    const calldataSHA256 = bytesHash(Buffer.from(calldata.slice(2), 'hex'));
    // Store exact reconciliation identity before any possible submission.
    if (kind === 'GRAPH') {
      const retained = await retainedAuthorization(reference);
      try {
        assert.deepEqual(retained.authorization.publicInputs, plan.authorizationPublicInputs,
          'BALANCE_ACCOUNT_ORIGINAL_A0_REQUIRED');
      } finally { wipePrivate(retained); }
    }
    await update(reference, { calldataSHA256, ...(kind === 'GRAPH' ? { source: {
      calldata, calldataSHA256, publicInputs: proof.publicInputs, transactionHash: null, observation: null,
    } } : {}) });
    if (kind === 'TOP_UP') await pool.beforeDeposit(plan.statement.amount);
    const lease = await owner.owner.bindSubmission({ ownerOperationRef: reference,
      proofHex: Buffer.from(proof.proof).toString('hex'), publicInputs: proof.publicInputs, calldata,
      authorizationSHA256: plan.authorizationSHA256 ?? null });
    assert.equal(lease.dispatchAllowed, true, 'BALANCE_ACCOUNT_RECONCILE_ORIGINAL_SUBMISSION');
    let receipt;
    try {
      assert.equal(cancelled, false, 'BALANCE_ACCOUNT_CANCELLED_BEFORE_SEND');
      receipt = await runtime.send('generic account ' + mode, { to: pool.address, data: calldata,
        ...(kind === 'TOP_UP' ? { value: pool.fundingTransactionValue(plan.statement.amount) } : {}) });
      await update(reference, { transactionHash: bare(receipt.transactionHash), ...(kind === 'GRAPH' ? {
        source: { ...operation(reference).source, transactionHash: bare(receipt.transactionHash) },
      } : {}) });
      await owner.owner.acknowledgeSubmitted({ ownerOperationRef: reference, transactionHash: bare(receipt.transactionHash) });
      const reconciled = await owner.owner.reconcile(reference);
      assert.equal(reconciled.stage, 'CONFIRMED', 'BALANCE_ACCOUNT_OWNER_RECONCILIATION_REQUIRED');
      if (kind === 'GRAPH') await confirmSource(reference);
      return receipt;
    } finally { await onPrivateAudit({ reference, phase: 'owner-transition', receipt: receipt ?? null }); }
  }
  async function executeTopUp(reference) {
    const facade = createProofProcess({ purpose: 'owner', modes: ['deposit_balance'] });
    activeProof = facade;
    let proof;
    try {
      for (let attempt = 0; attempt < 2; attempt++) {
        let plan = await owner.owner.ownerPlan(reference);
        const epoch = String((await runtime.time()) / 600n);
        if (epoch !== plan.statement.epoch) {
          await owner.owner.renewFundingEpoch({ ownerOperationRef: reference, epoch });
        }
        const witness = await owner.owner.depositInput(reference);
        plan = await owner.owner.ownerPlan(reference);
        proof = await prove(facade, 'deposit_balance', witness, plan.publicInputs, reference);
        if (String((await runtime.time()) / 600n) !== plan.statement.epoch) {
          wipePrivate(proof); proof = null; continue;
        }
        return await submitOwnerTransition(reference, proof, plan, 'TOP_UP');
      }
      throw Object.assign(new Error('BALANCE_ACCOUNT_DEPOSIT_WINDOW_UNAVAILABLE'),
        { code: 'BALANCE_ACCOUNT_DEPOSIT_WINDOW_UNAVAILABLE' });
    } finally { wipePrivate(proof); await facade.close(); activeProof = null; }
  }
  async function executeWithdrawal(reference) {
    const facade = createProofProcess({ purpose: 'owner', modes: ['withdraw_balance'] });
    activeProof = facade;
    let proof;
    try {
      for (let attempt = 0; attempt < 2; attempt++) {
        let plan = await owner.owner.ownerPlan(reference);
        const epoch = String((await runtime.time()) / 600n);
        if (epoch !== plan.statement.epoch) {
          await owner.owner.renewWithdrawalEpoch({ ownerOperationRef: reference, epoch });
        }
        const witness = await owner.owner.withdrawalInput(reference);
        plan = await owner.owner.ownerPlan(reference);
        proof = await prove(facade, 'withdraw_balance', witness, plan.publicInputs, reference);
        if (String((await runtime.time()) / 600n) !== plan.statement.epoch) {
          wipePrivate(proof); proof = null; continue;
        }
        return await submitOwnerTransition(reference, proof, plan, 'EXIT');
      }
      throw Object.assign(new Error('BALANCE_ACCOUNT_WITHDRAWAL_WINDOW_UNAVAILABLE'),
        { code: 'BALANCE_ACCOUNT_WITHDRAWAL_WINDOW_UNAVAILABLE' });
    } finally { wipePrivate(proof); await facade.close(); activeProof = null; }
  }
  async function executeGraph(reference) {
    const privateData = privateOperations.get(reference);
    assert.ok(privateData, 'BALANCE_ACCOUNT_ORIGINAL_PRIVATE_PREPARATION_REQUIRED');
    const { prepared, providers } = privateData;
    const plan = await owner.owner.ownerPlan(reference);
    assert.deepEqual(plan.authorizationPublicInputs, prepared.authorization.publicInputs,
      'BALANCE_ACCOUNT_ORIGINAL_A0_REQUIRED');
    const facade = createProofProcess({ purpose: 'coordinator', modes: ['reserve'] });
    activeProof = facade;
    let reservation;
    let retained;
    try {
      retained = await retainedAuthorization(reference);
      assert.deepEqual(proofDigest(retained.authorization), proofDigest(prepared.authorization),
        'BALANCE_ACCOUNT_ORIGINAL_A0_REQUIRED');
      const path = plan.inputPath;
      const witness = reserveInputs(retained.authorization, {
        baseRoot: bare(path.root), acceptedRoot: bare(path.root), siblings: path.siblings.map(bare),
        leafIndex: path.index, validFrom: plan.statement.validFrom, validUntil: plan.statement.validUntil,
      });
      assert.deepEqual(publicWords('reserve', witness), plan.publicInputs, 'BALANCE_ACCOUNT_RESERVE_INPUTS');
      reservation = await prove(facade, 'reserve', witness, plan.publicInputs, reference);
      await submitOwnerTransition(reference, reservation, plan, 'GRAPH');
    } finally { wipePrivate(retained); wipePrivate(reservation); await facade.close(); activeProof = null; }
    const view = await readNativeSystemState(runtime, system, poolIndex);
    const reserveIndex = view.ledger.commitments.indexOf('0x' + prepared.reserveCommitment);
    assert.ok(reserveIndex >= 0, 'BALANCE_ACCOUNT_RESERVATION_NOT_ISSUED');
    // The owner child is absent for native execution. Its surviving keeper still
    // holds encrypted custody credentials; this is not independent OS custody.
    await owner.suspend();
    await onStage({ kind: 'GRAPH', stage: 'OWNER_SUSPENDED_BEFORE_NATIVE', ownerLifecycle: owner.report() });
    assert.equal(cancelled, false, 'BALANCE_ACCOUNT_CANCELLED_BEFORE_NATIVE');
    const result = await nativeExecution.execute({ ownerOperationRef: reference, prepared, providers,
      reserveCommitment: prepared.reserveCommitment, reserveIndex });
    return result.receipt;
  }
  async function terminalOutcome(bound, receipt, disposition = 'APPLIED') {
    assert.ok(receipt, 'BALANCE_ACCOUNT_ORIGINAL_RECEIPT_REQUIRED');
    await runtime.checkReceipt(receipt);
    assert.equal(receipt.status, '0x1', 'BALANCE_ACCOUNT_SUCCESS_REQUIRED');
    const outcome = { version: 1, state: 'CONFIRMED', bindingSHA256: bound.bindingSHA256,
      assetBindingSHA256: bound.assetBindingSHA256,
      outcomeId: sha({ identitySHA256, ownerOperationRef: bound.ownerOperationRef,
        kind: bound.kind, transactionHash: receipt.transactionHash, blockHash: receipt.blockHash }),
      disposition, blockNumber: BigInt(receipt.blockNumber).toString(), blockHash: bare(receipt.blockHash) };
    await update(bound.ownerOperationRef, { stage: 'CONFIRMED', outcome, errorCode: null,
      ...(bound.kind === 'GRAPH' ? { terminal: { disposition, transactionHash: bare(receipt.transactionHash),
        blockHash: bare(receipt.blockHash), blockNumber: outcome.blockNumber } }
        : { transactionHash: bare(receipt.transactionHash) }) });
    dropPackets(bound.ownerOperationRef);
    return clone(outcome);
  }
  async function confirmSource(reference) {
    const entry = operation(reference), source = entry.source;
    assert.ok(source?.calldataSHA256, 'BALANCE_ACCOUNT_ORIGINAL_SOURCE_SUBMISSION_REQUIRED');
    const observation = await observer.readTransaction({ ownerOperationRef: reference,
      transactionHash: source.transactionHash, identitySHA256, calldataSHA256: source.calldataSHA256 });
    assert.ok(observation, 'BALANCE_ACCOUNT_ORIGINAL_SOURCE_UNRESOLVED');
    checkedSource(observation, identity, pool.artifact, entry.refundBinding, source);
    if (source.observation !== null) assert.deepEqual(observation, source.observation, 'BALANCE_ACCOUNT_SOURCE_CHANGED');
    else await update(reference, { source: { ...source, transactionHash: observation.transaction.hash, observation },
      transactionHash: observation.transaction.hash });
    return operation(reference).source;
  }
  function nativeStatus(reference) {
    try { return nativeExecution.inspect(reference); }
    catch (error) {
      // This branded keeper has not started the operation, so it cannot have a
      // retained terminal send. Every other inspection failure is unresolved.
      if (error.code === 'PAEG_GENERIC_NATIVE_UNKNOWN_OPERATION') return null;
      throw error;
    }
  }
  async function reconcileRecovery(bound) {
    const reference = bound.ownerOperationRef, entry = operation(reference), recovery = entry.recovery;
    assert.ok(recovery && ['SUBMITTING', 'UNKNOWN', 'CONFIRMED'].includes(recovery.stage),
      'BALANCE_ACCOUNT_NO_ORIGINAL_RECOVERY');
    const source = await confirmSource(reference);
    const observation = await observer.readTransaction({ ownerOperationRef: reference,
      transactionHash: recovery.transactionHash, identitySHA256, calldataSHA256: recovery.calldataSHA256 });
    assert.ok(observation, 'BALANCE_ACCOUNT_ORIGINAL_RECOVERY_UNRESOLVED');
    const evidence = validateGenericAccountRecoveryObservation({ identity, artifact: pool.artifact,
      binding: entry.refundBinding, source, recovery, observation });
    if (recovery.observation !== null) {
      assert.deepEqual(recovery.observation, observation, 'BALANCE_ACCOUNT_RECOVERY_CHANGED');
      assert.deepEqual(recovery.confirmation, evidence, 'BALANCE_ACCOUNT_RECOVERY_CHANGED');
    }
    const receipt = await runtime.receipt(prefix(observation.transaction.hash));
    assert.ok(receipt, 'BALANCE_ACCOUNT_ORIGINAL_RECEIPT_REQUIRED');
    await runtime.checkReceipt(receipt);
    if (recovery.stage !== 'CONFIRMED') await update(reference, { recovery: { ...recovery, stage: 'CONFIRMED',
      transactionHash: observation.transaction.hash, observation, confirmation: evidence } });
    if (entry.outcome !== null) {
      assert.equal(entry.outcome.disposition, 'RECOVERED', 'BALANCE_ACCOUNT_OUTCOME_CHANGED');
      assert.equal(entry.terminal.transactionHash, observation.transaction.hash, 'BALANCE_ACCOUNT_OUTCOME_CHANGED');
      assert.equal(entry.outcome.blockHash, observation.receipt.blockHash, 'BALANCE_ACCOUNT_OUTCOME_CHANGED');
      assert.equal(entry.outcome.blockNumber, BigInt(receipt.blockNumber).toString(), 'BALANCE_ACCOUNT_OUTCOME_CHANGED');
      return clone(entry.outcome);
    }
    return terminalOutcome(bound, receipt, 'RECOVERED');
  }
  async function recoverOriginal(bound) {
    const reference = bound.ownerOperationRef, entry = operation(reference);
    assert.equal(entry.kind, 'GRAPH', 'BALANCE_ACCOUNT_RECOVERY_GRAPH_ONLY');
    assert.ok(entry.request !== null && entry.stage !== 'READY', 'BALANCE_ACCOUNT_NOT_STARTED');
    if (entry.outcome !== null || entry.recovery !== null) return reconcileOriginal(bound);
    const native = nativeStatus(reference);
    if (native?.settlementAttempted || native?.terminalTransactionHash) return reconcileOriginal(bound);
    assert.ok(native === null || ['FAILED_NO_RESTART', 'CANCELLED_NO_RESTART'].includes(native.status),
      'BALANCE_ACCOUNT_NATIVE_EXECUTION_UNRESOLVED');
    const now = await runtime.time();
    // No recovery record or send latch exists before the original deadline. An
    // explicit later recover may prepare F again from the same retained A0.
    if (now < BigInt(entry.refundBinding.settleBefore)) throw Object.assign(
      new Error('BALANCE_ACCOUNT_RECOVERY_BEFORE_CUTOFF'), { code: 'BALANCE_ACCOUNT_RECOVERY_BEFORE_CUTOFF' });
    await confirmSource(reference);
    const retained = handoff(reference);
    assert.deepEqual(retained.binding, entry.refundBinding, 'BALANCE_ACCOUNT_HANDOFF_BINDING_CHANGED');
    const view = await readNativeSystemState(runtime, system, poolIndex);
    const reserveIndex = view.ledger.commitments.indexOf(prefix(entry.refundBinding.reserveCommitment));
    assert.ok(reserveIndex >= 0 && !view.ledger.nullifiers.includes(prefix(entry.refundBinding.reserveNullifier))
      && !view.ledger.commitments.includes(prefix(entry.refundBinding.recoveryCommitment))
      && view.ledger.publicState.liveReservations > 0, 'BALANCE_ACCOUNT_RESERVE_NOT_UNSPENT');
    const path = view.ledger.tree.path(reserveIndex);
    const from = await runtime.time(), until = from + 300n;
    const input = await retained.store.refundInputs({ ownerOperationRef: reference, binding: retained.binding,
      membership: { identitySHA256, acceptedRoot: bare(path.root), siblings: path.siblings.map(bare),
        leafIndex: path.index, validFrom: from.toString(), validUntil: until.toString() } });
    let facade, proof, receipt;
    try {
      assert.equal(cancelled, false, 'BALANCE_ACCOUNT_CANCELLED_BEFORE_REFUND');
      await update(reference, { stage: 'RECOVERING', errorCode: null });
      await onStage({ kind: 'GRAPH', stage: 'RECOVERING' });
      assert.equal(cancelled, false, 'BALANCE_ACCOUNT_CANCELLED_BEFORE_REFUND');
      facade = createProofProcess({ purpose: 'coordinator', modes: ['refund'] }); activeProof = facade;
      proof = await prove(facade, 'refund', input.witness, input.expectedPublicInputs, reference);
      assert.equal(cancelled, false, 'BALANCE_ACCOUNT_CANCELLED_BEFORE_REFUND');
      assert.equal(await system.verify('recover_generic', proof.proof, proof.publicInputs), true,
        'BALANCE_ACCOUNT_GENUINE_REFUND_VERIFIER');
      const freshNative = nativeStatus(reference);
      assert.ok(!freshNative?.settlementAttempted && !freshNative?.terminalTransactionHash
        && (freshNative === null || ['FAILED_NO_RESTART', 'CANCELLED_NO_RESTART'].includes(freshNative.status)),
      'BALANCE_ACCOUNT_ORIGINAL_TERMINAL_UNRESOLVED');
      const fresh = await readNativeSystemState(runtime, system, poolIndex);
      assert.ok(fresh.ledger.commitments[reserveIndex] === prefix(entry.refundBinding.reserveCommitment)
        && fresh.ledger.roots.includes(path.root)
        && !fresh.ledger.nullifiers.includes(prefix(entry.refundBinding.reserveNullifier))
        && !fresh.ledger.commitments.includes(prefix(entry.refundBinding.recoveryCommitment)),
      'BALANCE_ACCOUNT_RESERVE_NOT_UNSPENT');
      const sendTime = await runtime.time();
      assert.ok(sendTime >= from && sendTime < until, 'BALANCE_ACCOUNT_RECOVERY_WINDOW_EXPIRED');
      assert.equal(cancelled, false, 'BALANCE_ACCOUNT_CANCELLED_BEFORE_REFUND');
      const calldata = pool.proofData('recover_generic', proof.proof, proof.publicInputs);
      const recovery = { stage: 'SUBMITTING', calldata, publicInputs: proof.publicInputs,
        calldataSHA256: bytesHash(Buffer.from(calldata.slice(2), 'hex')), proofSHA256: bytesHash(proof.proof),
        transactionHash: null, observation: null, confirmation: null };
      // The irreversible send latch contains the exact original F. No failure
      // or missing receipt clears it or permits another transaction/proof.
      await update(reference, { recovery });
      await onStage({ kind: 'GRAPH', stage: 'RECOVERY_SUBMITTING' });
      assert.equal(cancelled, false, 'BALANCE_ACCOUNT_CANCELLED_BEFORE_REFUND');
      receipt = await runtime.send('generic account recover_generic', { to: pool.address, data: calldata });
      await update(reference, { recovery: { ...recovery, transactionHash: bare(receipt.transactionHash) } });
      return await reconcileRecovery(bound);
    } catch (error) {
      if (!unavailable) {
        const original = operation(reference).recovery;
        const transactionHash = original?.transactionHash ?? (error.transactionRecord?.transactionHash
          ? bare(error.transactionRecord.transactionHash) : null);
        if (transactionHash !== null) ref(transactionHash);
        await update(reference, { stage: 'UNKNOWN', errorCode: safeCode(error), ...(original ? {
          recovery: { ...original, stage: original.stage === 'CONFIRMED' ? 'CONFIRMED' : 'UNKNOWN', transactionHash },
        } : {}) });
      }
      throw error;
    } finally {
      wipePrivate(input); wipePrivate(proof); dropPackets(reference);
      if (facade) await facade.close(); activeProof = null;
      await onPrivateAudit({ reference, phase: 'recovery-transition', receipt: receipt ?? null });
    }
  }
  async function reconcileOriginal(bound) {
    const entry = operation(bound.ownerOperationRef);
    if (entry.kind === 'GRAPH' && entry.recovery !== null) return reconcileRecovery(bound);
    let receipt;
    if (entry.kind !== 'GRAPH' && entry.outcome !== null) {
      // A completed owner reconciliation was durably acknowledged before this
      // outcome committed. Re-check that same canonical transaction without
      // requiring the owner child to return solely to acknowledge it again.
      receipt = await runtime.receipt('0x' + entry.transactionHash);
      assert.ok(receipt, 'BALANCE_ACCOUNT_ORIGINAL_RECEIPT_REQUIRED');
      const transaction = await runtime.transaction(receipt.transactionHash);
      assert.ok(transaction, 'BALANCE_ACCOUNT_ORIGINAL_TRANSACTION_REQUIRED');
      assert.equal(transaction.to, pool.address, 'BALANCE_ACCOUNT_TRANSACTION_POOL');
      assert.equal(bytesHash(Buffer.from(transaction.input.slice(2), 'hex')), entry.calldataSHA256,
        'BALANCE_ACCOUNT_TRANSACTION_CHANGED');
      assert.equal(receipt.status, '0x1', 'BALANCE_ACCOUNT_SUCCESS_REQUIRED');
      assert.equal(bare(receipt.blockHash), entry.outcome.blockHash, 'BALANCE_ACCOUNT_OUTCOME_CHANGED');
      assert.equal(BigInt(receipt.blockNumber).toString(), entry.outcome.blockNumber,
        'BALANCE_ACCOUNT_OUTCOME_CHANGED');
      return clone(entry.outcome);
    }
    if (entry.kind !== 'GRAPH') {
      assert.ok(entry.calldataSHA256, 'BALANCE_ACCOUNT_NO_ORIGINAL_SUBMISSION');
      const observation = await observer.readTransaction({ ownerOperationRef: bound.ownerOperationRef,
        transactionHash: entry.transactionHash, identitySHA256, calldataSHA256: entry.calldataSHA256 });
      assert.ok(observation, 'BALANCE_ACCOUNT_ORIGINAL_OUTCOME_UNRESOLVED');
      const status = await owner.owner.reconcile(bound.ownerOperationRef);
      assert.equal(status.stage, 'CONFIRMED', 'BALANCE_ACCOUNT_OWNER_RECONCILIATION_REQUIRED');
      receipt = await runtime.receipt('0x' + observation.transaction.hash);
    } else {
      const original = await nativeExecution.reconcile(bound.ownerOperationRef);
      receipt = original.receipt;
    }
    if (entry.outcome !== null) {
      await runtime.checkReceipt(receipt);
      assert.equal(bare(receipt.blockHash), entry.outcome.blockHash, 'BALANCE_ACCOUNT_OUTCOME_CHANGED');
      assert.equal(bare(receipt.transactionHash), entry.kind === 'GRAPH'
        ? entry.terminal.transactionHash : entry.transactionHash, 'BALANCE_ACCOUNT_OUTCOME_CHANGED');
      return clone(entry.outcome);
    }
    return terminalOutcome(bound, receipt);
  }

  const authority = Object.freeze({
    async assertAuthority(expected) {
      await healthy();
      assert.deepEqual(expected, accountIdentity, 'BALANCE_ACCOUNT_JOURNAL_IDENTITY');
      return { version: 1, available: true, identity: clone(accountIdentity) };
    },
    prepare: value => exclusive(async () => {
      await healthy();
      const { bound, entry } = request(value);
      assert.ok(entry.stage === 'READY' || entry.request !== null, 'BALANCE_ACCOUNT_PREPARATION_STATE');
      if (entry.request === null) await update(bound.ownerOperationRef, { request: bound });
      return { version: 1, state: 'PREPARED', bindingSHA256: bound.bindingSHA256,
        assetBindingSHA256: bound.assetBindingSHA256 };
    }),
    execute: value => exclusive(async () => {
      await healthy();
      const { bound, entry } = request(value);
      assert.ok(entry.request !== null, 'BALANCE_ACCOUNT_NOT_PREPARED');
      if (entry.stage === 'CONFIRMED') return reconcileOriginal(bound);
      assert.equal(entry.stage, 'READY', 'BALANCE_ACCOUNT_RECONCILE_ORIGINAL_ONLY');
      await update(bound.ownerOperationRef, { stage: 'EXECUTING' });
      try {
        await onStage({ kind: bound.kind, stage: 'EXECUTING' });
        const receipt = bound.kind === 'TOP_UP' ? await executeTopUp(bound.ownerOperationRef)
          : bound.kind === 'EXIT' ? await executeWithdrawal(bound.ownerOperationRef)
            : await executeGraph(bound.ownerOperationRef);
        return await terminalOutcome(bound, receipt);
      } catch (error) {
        if (!unavailable) await update(bound.ownerOperationRef, { stage: 'UNKNOWN', errorCode: safeCode(error) });
        dropPackets(bound.ownerOperationRef);
        throw error;
      }
    }),
    recover: value => exclusive(async () => {
      await healthy();
      const { bound } = request(value);
      return recoverOriginal(bound);
    }),
    reconcile: value => exclusive(async () => {
      await healthy();
      const { bound, entry } = request(value);
      assert.ok(['EXECUTING', 'RECOVERING', 'UNKNOWN', 'CONFIRMED'].includes(entry.stage), 'BALANCE_ACCOUNT_NOT_STARTED');
      return reconcileOriginal(bound);
    }),
    observe: value => exclusive(async () => {
      await healthy();
      exact(value, ['request', 'outcome', 'challenge'], 'BALANCE_ACCOUNT_OBSERVATION_FIELDS');
      const { bound, entry } = request(value.request);
      assert.equal(entry.stage, 'CONFIRMED', 'BALANCE_ACCOUNT_TERMINAL_REQUIRED');
      assert.deepEqual(value.outcome, entry.outcome, 'BALANCE_ACCOUNT_OUTCOME_CHANGED');
      assert.match(value.challenge, /^[0-9a-f]{32}$/, 'BALANCE_ACCOUNT_CHALLENGE');
      await reconcileOriginal(bound);
      const original = await runtime.block('0x' + BigInt(entry.outcome.blockNumber).toString(16));
      assert.equal(bare(original.hash), entry.outcome.blockHash, 'BALANCE_ACCOUNT_OUTCOME_REORG');
      const view = await readNativeSystemState(runtime, system, poolIndex), state = view.ledger.publicState;
      await runtime.assertCanonical(original);
      return { version: 1, status: 'LIVE', bindingSHA256: bound.bindingSHA256,
        assetBindingSHA256: bound.assetBindingSHA256, outcomeId: entry.outcome.outcomeId,
        challenge: value.challenge, observedAt: Date.now(), blockNumber: BigInt(view.header.number).toString(),
        blockHash: bare(view.header.hash), canonicalOutcomeBlockHash: entry.outcome.blockHash,
        backing: { held: state.actualAssetBalance, liabilities: state.backedAmount, surplus: state.surplus, deficit: '0' } };
    }),
  });
  return Object.freeze({ config, registry: config.registry, assetId: asset.assetId, authority,
    ownerActions: Object.freeze({
      registerTopUp: reference => exclusive(() => register(reference, 'TOP_UP')),
      registerExit: reference => exclusive(() => register(reference, 'EXIT')),
      registerGraph: value => exclusive(async () => {
        assert.ok(value && Object.keys(value).sort().join(',') === 'ownerOperationRef,prepared,providers',
          'BALANCE_ACCOUNT_GRAPH_REGISTRATION');
        // Keep provider capabilities intact; take ownership of all serializable
        // proof material so later caller mutation cannot change registered work.
        const { prepared } = validateGenericNativeExecutionPreparation(value.prepared, {
          scope: identity.scope, policy: identity.policy, asset: identity.asset.identity,
          hubDomain: identity.hubDomain, registryCommitment: identity.registryCommitment,
        });
        try {
          const binding = deriveGenericRefundBinding({ identity, ownerOperationRef: value.ownerOperationRef,
            authorization: prepared.authorization });
          for (const key of ['fundingCommitment', 'admissionTag', 'changeCommitment', 'recoveryCommitment']) {
            if (Object.hasOwn(value.prepared, key)) assert.equal(value.prepared[key], binding[key],
              'BALANCE_ACCOUNT_HANDOFF_PREPARATION_BINDING');
          }
          const result = await register(value.ownerOperationRef, 'GRAPH', {
            prepared, providers: value.providers.map(item => ({ ...item })),
          });
          if (privateOperations.get(value.ownerOperationRef)?.prepared !== prepared) wipePrivate(prepared);
          return result;
        } catch (error) { wipePrivate(prepared); throw error; }
      }),
      recoveryCreditRequest: reference => exclusive(async () => {
        await healthy();
        const entry = operation(reference);
        assert.equal(entry.kind, 'GRAPH', 'BALANCE_ACCOUNT_RECOVERY_GRAPH_ONLY');
        assert.ok(entry.request !== null && entry.recovery?.stage === 'CONFIRMED',
          'BALANCE_ACCOUNT_RECOVERY_NOT_CONFIRMED');
        await reconcileRecovery(entry.request);
        const current = operation(reference);
        assert.equal(current.outcome?.disposition, 'RECOVERED', 'BALANCE_ACCOUNT_RECOVERY_NOT_CONFIRMED');
        return { ownerOperationRef: reference, transactionHash: current.recovery.transactionHash,
          calldataSHA256: current.recovery.calldataSHA256 };
      }),
    }),
    async privateStatus() {
      await healthy();
      return { profile: 'GENERIC_REUSABLE_BALANCE_ACCOUNT_LOCAL_V1',
        operations: clone(record.data.operations), keeperRestart: false, nativeConsensusVerified: false };
    },
    async close() {
      assert.ok(!busy, 'BALANCE_ACCOUNT_BUSY');
      closed = true; password = null;
      for (const reference of privateOperations.keys()) dropPackets(reference);
      for (const item of refundHandoffs.values()) { item.store?.close(); item.store = null; }
      refundHandoffs.clear();
      return { closed: true, retainedOwnerCustody: true, retainedRuntimes: true };
    },
    async abort() {
      cancelled = true;
      abortPromise ??= (async () => {
        const proof = activeProof ? await activeProof.abort() : { cancelled: true, activeProof: false };
        const native = await nativeExecution.abort();
        await idle;
        for (const reference of privateOperations.keys()) dropPackets(reference);
        for (const item of refundHandoffs.values()) { item.store?.close(); item.store = null; }
        refundHandoffs.clear();
        return { cancelled: true, proof, native, retainedEncryptedEvidence: true };
      })();
      return abortPromise;
    },
  });
}
