import { refreshNativeValueReceiverClock } from '../../../chains/evm/runtime/owned-evm-v2-runtime.mjs';
/** Authenticated read-only current-state joins for the new registry semantics.
 * Public statement checks are NOT proof verification. The new hub still verifies
 * actual P42/R50/new-I84 and purpose-18/health atomically at actual admission.
 * No native dispatch/sign/broadcast method is supplied by this preflight. */
import assert from 'node:assert/strict';
import { exactRecord, canonicalField, bytes32 } from '../../encoding/commitments.mjs';
import { cloneInput, frozenInput, inputUint } from '../../account/preparation/readiness-inputs.mjs';
import { joinNativeValueAdmission } from '../../encoding/native-value-statements-v2.mjs';
import { createNativeValueSystemStateReader as nativeReader, decodeFlatWords } from '../reconciliation/native-value-system-state-v2.mjs';
import { assertOwnedNativeValueSystem as nativeSystem } from '../../../operations/deployments/native-value/native-value-system-v2.mjs';
import { assertOwnedNativeValueQuorum as nativeQuorum } from '../../../operations/operators/native-value/native-value-operators-v4.mjs';
import { assertNativeValueHealth } from '../../../chains/shared/health/native-value-health-v2.mjs';
import { assertOwnedWrappedClaimWalletSystemV1 } from '../../../operations/deployments/wrapped/wrapped-claim-wallet-binding-v1.mjs';
import { assertOwnedNativeValueQuorum as assertWrappedQuorum } from '../../../operations/operators/wrapped/wrapped-claim-graph-operators-v1.mjs';
import { createWrappedWalletStateReaderV1 } from '../../wrapped/reconciliation/wrapped-wallet-state-v1.mjs';
const prefix = value => '0x' + value;
export async function createNativeValueCurrentGate(raw) { return createCurrentGate(raw, false); }
export async function createWrappedWalletCurrentGateV1(raw) {
  assert.equal(arguments.length, 1, 'WRAPPED_WALLET_NO_OVERRIDES'); return createCurrentGate(raw, true);
}
async function createCurrentGate(raw, wrapped) {
  const assertOwnedNativeValueSystem = wrapped ? assertOwnedWrappedClaimWalletSystemV1 : nativeSystem;
  const assertOwnedNativeValueQuorum = wrapped ? assertWrappedQuorum : nativeQuorum;
  const createNativeValueSystemStateReader = wrapped ? createWrappedWalletStateReaderV1 : nativeReader;
  exactRecord(raw, ['runtime', 'system', 'quorum', 'poolIndex']); const { runtime, system, quorum, poolIndex } = raw;
  assertOwnedNativeValueSystem(runtime, system); assertOwnedNativeValueQuorum(quorum, { runtime, system });
  const reader = await createNativeValueSystemStateReader({ runtime, system, poolIndex });
  const live = () => { assertOwnedNativeValueSystem(runtime, system); assertOwnedNativeValueQuorum(quorum, { runtime, system }); };
  async function health(view) {
    live(); const until = (inputUint(view.head.timestamp) + 30n).toString();
    const permit = await quorum.health({ poolIndex, validUntil: until });
    assert.deepEqual(permit.head, view.head, 'NATIVE_VALUE_CURRENT_GATE_HEAD_CHANGED');
    assertNativeValueHealth({ message: permit.message, indexes: permit.indexes, signatures: permit.signatures }, view.healthState, system.registry);
    await reader.assertCurrent(view); live(); return permit;
  }
  return Object.freeze({
    async readForDispatch(rawQuery) {
      const query = cloneInput(rawQuery); exactRecord(query, ['domainCommitment', 'authorizationRoot', 'checkpoint']);
      canonicalField(query.domainCommitment, true); canonicalField(query.authorizationRoot); bytes32(query.checkpoint, true);
      live(); await refreshNativeValueReceiverClock(runtime); const view = await reader.read(query), permit = await health(view);
      return frozenInput({ classification: 'AUTHENTICATED_NATIVE_VALUE_CURRENT_READ_NOT_DISPATCH_AUTHORIZATION',
        state: view.dispatch, health: permit, head: view.head });
    },
    async readForAdmission(rawQuery) {
      const query = cloneInput(rawQuery); exactRecord(query, ['relation', 'dependencyStatement', 'readyStatement', 'admissionStatement']);
      assert.equal(query.relation, 'admission_native_value_v2', 'NATIVE_VALUE_EXACT_ADMISSION_RELATION');
      const statement = joinNativeValueAdmission(query.dependencyStatement, query.readyStatement, query.admissionStatement);
      live(); await refreshNativeValueReceiverClock(runtime); const view = await reader.read();
      assert.equal(statement.domainCommitment, view.domainCommitment, 'NATIVE_VALUE_ADMISSION_DOMAIN');
      assert.ok(view.authorizationRoots.includes(statement.authorizationRoot), 'NATIVE_VALUE_ADMISSION_AUTHORIZATION_ROOT');
      const checkpoint = view.checkpoints.find(row => row.digest === statement.checkpoint && row.snapshot.pool === view.poolAddress);
      assert.ok(checkpoint, 'NATIVE_VALUE_ADMISSION_CHECKPOINT');
      assert.equal(statement.readinessEvidenceState, checkpoint.evidenceState, 'NATIVE_VALUE_HISTORICAL_CHECKPOINT_EVIDENCE');
      assert.ok(view.checkpointTree.prefixRoots.includes(statement.acceptedCheckpointRoot), 'NATIVE_VALUE_ADMISSION_CHECKPOINT_ROOT');
      assert.equal(statement.admissionRevocationState, view.admissionRevocationState, 'NATIVE_VALUE_CURRENT_PURPOSE_18');
      bytes32(statement.admissionNullifier, true); canonicalField(statement.receiptLeaf, true);
      assert.notEqual(statement.receiptLeaf, view.receiptTree.leaves[view.receiptTree.count], 'NATIVE_VALUE_ADMISSION_EMPTY_LEAF');
      const now = BigInt(view.head.timestamp);
      assert.ok(inputUint(statement.admissionFrom) <= now && now < inputUint(statement.admissionUntil), 'NATIVE_VALUE_ADMISSION_WINDOW');
      for (const [method, args] of [
        ['admissionNullifiers(bytes32)', [prefix(statement.admissionNullifier)]],
        ['insertedReceiptLeaves(bytes32,bytes32)', [prefix(view.domainCommitment), prefix(statement.receiptLeaf)]],
      ]) assert.equal(BigInt(decodeFlatWords(await system.hub.call(method, args, view.header.number), 1)[0]), 0n,
        'NATIVE_VALUE_ADMISSION_ALREADY_USED');
      const permit = await health(view); await reader.assertCurrent(view); live();
      return frozenInput({ classification: 'AUTHENTICATED_NATIVE_VALUE_CURRENT_JOINS_NOT_PROOF_ACCEPTANCE', relation: query.relation,
        statement, currentRevocation: { entries: view.revokedEntries, revokedDigest: view.state.revokedDigest,
          revokedCount: view.state.revokedCount, revocationSequence: view.state.revocationSequence },
        health: permit, head: view.head });
    },
  });
}
