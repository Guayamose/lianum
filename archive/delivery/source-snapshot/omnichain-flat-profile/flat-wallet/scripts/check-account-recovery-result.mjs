/** Inspect the completed account recovery evidence. This starts no runtime,
 * compiler, backend or proof. Private records remain local; export hashes and
 * bounded findings only. The running harness already checks historical state. */
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, LOCAL } from '../proof-workers/catalog.mjs';
import { hash } from '../proof-workers/tooling.mjs';
import { encodeFlatTransaction } from '../wallet-platform/modules/paeg/transaction-codec.mjs';
import { decodeStatement, joinReservation } from '../wallet-platform/modules/paeg/statements.mjs';
import { decodeWalletPoolInputs } from '../../../omnichain-product/src/private-wallet-note-encoding.mjs';
import { validateBitcoinTransferWire } from '../wallet-platform/modules/chain-adapters/owned-bitcoin-runtime.mjs';

const runId = '6a57aa95-e427-4973-a1b1-fa4626fe5ad3';
const directory = join(ROOT, '.local/account-recovery/attempt-' + runId);
const bytes = name => readFileSync(join(directory, name));
const read = name => JSON.parse(bytes(name));
const result = read('result.json'), resources = read('resources.json');
assert.equal(result.runId, runId); assert.equal(resources.runId, runId);
assert.equal(result.phase, 'completed'); assert.equal(result.success, true);
assert.equal(resources.phase, 'completed'); assert.equal(resources.failure, null);
assert.equal(resources.resultAccepted, true); assert.equal(resources.ownedGroupCleanupConfirmed, true);
assert.equal(resources.sourceClosureUnchanged, true); assert.equal(result.sourceUnchanged, true);
assert.deepEqual(result.sourcePins, read('source-pins.json'));
const frozen = read('source-snapshot-manifest.json');
assert.equal(frozen.sourceFiles.length, result.sourcePins.local.length);
for (const source of result.sourcePins.local) {
  const retained = frozen.sourceFiles.find(item => item.source === source.path);
  assert.ok(retained); assert.equal(retained.sha256, source.sha256);
  assert.equal(hash(bytes('source-snapshot/' + retained.file)), source.sha256);
}
for (const name of ['partialDeliveryRecoveryAcceptance', 'ownerRecoveryExitAccepted',
  'reconciledOriginalRecoveryOnce', 'duplicateRecoveryNoEffect', 'recoveryCreditedOnce'])
  assert.equal(result[name], true);
assert.deepEqual(result.nativeEffects, { bitcoin: 1, solana: 0 });
assert.equal(result.partialDelivery.ownerExited, true);
assert.equal(result.partialDelivery.execution.admittedReceipts, 0);
assert.equal(result.actualRecoveryIncluded.ownerExited, true);
assert.equal(result.actualRecoveryIncluded.foreignNodesStopped, true);
assert.equal(result.coordinatorLoss.afterActualRecovery, true);
assert.equal(result.coordinatorLoss.beforeJournalAcknowledgement, true);
for (const name of ['backedAmount', 'actualAssetBalance', 'surplus']) assert.equal(result.finalPool[name], '0');
assert.equal(result.finalPool.liveReservations, 0);
assert.equal(result.finalOwnerBalances.available, '0'); assert.equal(result.finalOwnerBalances.recovery, '0');
for (const name of ['fullWalletAcceptance', 'keeperRestart', 'nodeRestart', 'realClockExpiryAcceptance',
  'systemicPrivacyAcceptance', 'independentOperators', 'performanceTargetAchieved']) assert.equal(result[name], false);

const proofs = new Map();
for (const entry of result.proofs) {
  const proof = bytes('public-proofs/' + entry.file + '.bin');
  const inputs = bytes('public-proofs/' + entry.file + '.inputs.json');
  assert.equal(hash(proof), entry.proofSHA256); assert.equal(hash(inputs), entry.publicInputsSHA256);
  const publicInputs = JSON.parse(inputs);
  assert.ok(!proofs.has(entry.label)); proofs.set(entry.label, { proof: proof.toString('hex'), publicInputs });
  if (entry.evidence.runId) {
    const attempt = join(LOCAL, 'attempts', entry.evidence.runId);
    const manifestBytes = readFileSync(join(attempt, 'proof-manifest.json'));
    const manifest = JSON.parse(manifestBytes), worker = JSON.parse(readFileSync(join(attempt, 'result.json')));
    const monitor = JSON.parse(readFileSync(join(attempt, 'resources.json')));
    assert.equal(hash(manifestBytes), entry.evidence.manifestSHA256);
    assert.equal(manifest.jobId, entry.evidence.jobId); assert.equal(manifest.relation, entry.relation);
    assert.equal(manifest.proofSHA256, entry.proofSHA256); assert.equal(manifest.selfVerified, true);
    assert.equal(worker.selfVerified, true); assert.equal(worker.phase, 'completed');
    assert.equal(monitor.phase, 'completed'); assert.equal(monitor.exitCode, 0); assert.equal(monitor.failure, null);
    assert.equal(hash(readFileSync(join(attempt, 'proof.bin'))), entry.proofSHA256);
    assert.deepEqual(JSON.parse(readFileSync(join(attempt, 'public-inputs.json'))), publicInputs);
  } else {
    assert.equal(entry.evidence.acceptedResult, true); assert.equal(entry.evidence.worker.verified, true);
    assert.equal(entry.evidence.worker.proofSHA256, entry.proofSHA256);
  }
}
assert.equal(proofs.size, 8);
const audit = read('private-audit/evm.json');
function transaction(label) {
  const rows = audit.transactions.filter(item => item.label === label); assert.equal(rows.length, 1);
  const row = rows[0]; assert.equal(row.phase, 'mined'); assert.equal(row.receipt.status, '0x1');
  assert.equal(row.transactionHash, row.receipt.transactionHash);
  assert.equal(result.transactions.find(item => item.label === label).transactionHash, row.transactionHash);
  return row;
}
function exactCall(label, method, packet) {
  const tx = transaction(label); assert.equal(tx.request.data, encodeFlatTransaction(method, packet)); return tx;
}
const deposit = exactCall('flat-account-deposit', 'depositBalance', proofs.get('flat-account-deposit'));
const reserve = transaction('flat-account-reservation');
// The final two static guard words precede the two dynamic proof tuples.
const data = reserve.request.data.slice(10), word = n => BigInt('0x' + data.slice(n * 64, (n + 1) * 64));
const authorization = proofs.get('owner-envelope'), reservation = proofs.get('flat-account-reservation');
assert.equal(reserve.request.data, encodeFlatTransaction('reserveGenericGuarded', { authorization, reservation,
  expectedSequence: word(2).toString(), expectedPostRoot: '0x' + data.slice(3 * 64, 4 * 64) }));
joinReservation(decodeStatement('authorization', authorization.publicInputs), decodeStatement('reservation', reservation.publicInputs));
const recoveryRows = audit.transactions.filter(item => item.label.startsWith('flat-execution-recovery-'));
assert.equal(recoveryRows.length, 1);
const recovered = exactCall(recoveryRows[0].label, 'recoverGeneric', proofs.get('original-timeout-recovery'));
const exits = ['recovery', 'change'].map(role => exactCall('flat-account-withdraw_' + role,
  'withdrawBalance', proofs.get('flat-account-withdraw_' + role)));
for (const tx of [reserve, recovered, ...exits]) assert.equal(tx.request.to, deposit.request.to);
const s = decodeStatement('reservation', reservation.publicInputs);
const f = decodeStatement('recovery', proofs.get('original-timeout-recovery').publicInputs);
assert.equal(s.domainCommitment, f.domainCommitment);
const withdrawals = ['recovery', 'change'].map(role => decodeWalletPoolInputs('withdraw_balance', proofs.get('flat-account-withdraw_' + role).publicInputs));
assert.deepEqual(withdrawals.map(item => item.amount), ['20000', '30000']);
assert.equal(withdrawals[0].recipient, withdrawals[1].recipient);
assert.notEqual(withdrawals[0].nullifier, withdrawals[1].nullifier);
assert.ok(!audit.transactions.some(item => /settlement-|admission-|admit-native/.test(item.label)));
const native = read('private-audit/native.json');
assert.equal(native.bitcoin.length, 1); assert.equal(native.solana.length, 0);
const btc = native.bitcoin[0]; assert.equal(btc.broadcastAttempts, 1); assert.equal(btc.confirmationMiningAttempts, 1);
assert.equal(btc.phase, 'OBSERVED_CONFIRMED');
assert.equal(validateBitcoinTransferWire(btc.rawTransaction, btc.intent, { signed: true }).txid, btc.txid);
assert.ok(Date.parse(result.controlledStop.at) < Date.parse(result.actualRecoveryIncluded.at));
const evidence = { format: 'FLAT_ACCOUNT_RECOVERY_EXISTING_ARTIFACT_CHECK_V1', recordedAt: new Date().toISOString(), runId,
  readOnly: true, newProofOrRuntime: false, sourceFilesMatched: frozen.sourceFiles.length,
  publicProofArtifactsMatched: proofs.size, actualCalldataProofPacketsMatched: 6,
  actualBTCWireBindingMatched: true, nativeBroadcastAttempts: { bitcoin: 1, solana: 0 },
  originalRecoveryIncluded: true, coordinatorLostReplyReconciled: true, ownerCreditAndBothExitsAccepted: true,
  finalBacking: '0', fullWalletAcceptance: false, systemicPrivacyAcceptance: false,
  files: ['result.json', 'resources.json', 'source-pins.json', 'private-audit/evm.json', 'private-audit/native.json']
    .map(path => ({ path, bytes: bytes(path).length, sha256: hash(bytes(path)), private: path.startsWith('private-audit/') })),
  limit: 'Existing-run artifact consistency; the owning observer checked historical state. Not an external cryptographic audit or a native-consensus proof.' };
writeFileSync(join(ROOT, 'evidence/account-recovery-actual-artifact-check.json'), JSON.stringify(evidence, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ sourceFilesMatched: frozen.sourceFiles.length, publicProofsMatched: proofs.size,
  actualCalldataProofPacketsMatched: 6, finalBacking: '0', ownerRecoveredAndExited: true }));
