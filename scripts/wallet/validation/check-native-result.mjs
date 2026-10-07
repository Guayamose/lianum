/** Read-only verification of the already completed first flat native run.
 * No backend, key, proof, node, RPC or transaction is started here. Private
 * native/transaction records are read locally; only findings/hashes are saved.
 */
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, LOCAL } from '../../../packages/proofs/src/catalog.mjs';
import { hash } from '../../../packages/proofs/src/tooling/tooling.mjs';
import { decodeStatement } from '../../../packages/backend/src/execution/encoding/statements.mjs';
import { FLAT_TRANSACTION_METHODS } from '../../../packages/backend/src/execution/encoding/transaction-codec.mjs';
import { validateBitcoinTransferWire } from '../../../packages/backend/src/chains/bitcoin/runtime/owned-bitcoin-runtime.mjs';
import { validateSolanaBindingTransaction } from '../../../packages/backend/src/chains/shared/dispatch/native-receipt-binding.mjs';

const runId = '784ca751-da7e-4ad0-8ba7-fc23540df93d';
const directory = join(ROOT, '.local/native-flow/attempt-' + runId);
const bytes = name => readFileSync(join(directory, name));
const read = name => JSON.parse(bytes(name));
const result = read('result.json'), resources = read('resources.json');
assert.equal(result.runId, runId); assert.equal(resources.runId, runId);
assert.equal(result.phase, 'completed'); assert.equal(result.success, true);
assert.equal(resources.phase, 'completed'); assert.equal(resources.failure, null);
assert.equal(resources.resultAccepted, true); assert.equal(resources.ownedGroupCleanupConfirmed, true);
assert.equal(resources.sourceClosureUnchanged, true); assert.equal(result.sourceUnchanged, true);
assert.deepEqual(result.sourcePins, resources.sourcePins ?? read('source-pins.json'));
const frozenSource = read('source-snapshot-manifest.json');
assert.equal(frozenSource.sourceFiles.length, result.sourcePins.local.length);
for (const item of result.sourcePins.local) {
  const retained = frozenSource.sourceFiles.find(value => value.source === item.path);
  assert.ok(retained); assert.equal(retained.sha256, item.sha256);
  assert.equal(hash(bytes('source-snapshot/' + retained.file)), item.sha256);
}
assert.equal(result.actualGlobalClaim.ownerSuspended, true);
assert.deepEqual(result.nativeEffects, { bitcoin: 1, solana: 1 });
assert.equal(result.recipientRestartAndExit, true); assert.equal(result.changeExit, true);
assert.equal(result.paidReplayRejected, true); assert.equal(result.genuinePaidRefundRejected, true);
assert.equal(result.partialDeliveryRecoveryAcceptance, false);
for (const key of ['backedAmount', 'actualAssetBalance', 'surplus']) assert.equal(result.finalPool[key], '0');
assert.equal(result.finalPool.liveReservations, 0);

const proofs = new Map();
for (const entry of result.proofs) {
  const proof = bytes('public-proofs/' + entry.file + '.bin');
  const inputBytes = bytes('public-proofs/' + entry.file + '.inputs.json');
  const publicInputs = JSON.parse(inputBytes);
  assert.equal(hash(proof), entry.proofSHA256); assert.equal(hash(inputBytes), entry.publicInputsSHA256);
  assert.ok(!proofs.has(entry.label)); proofs.set(entry.label, { proof: proof.toString('hex'), publicInputs, entry });
  if (entry.evidence.runId) {
    const path = join(LOCAL, 'attempts', entry.evidence.runId);
    const manifestBytes = readFileSync(join(path, 'proof-manifest.json'));
    const manifest = JSON.parse(manifestBytes), worker = JSON.parse(readFileSync(join(path, 'result.json')));
    const supervisor = JSON.parse(readFileSync(join(path, 'resources.json')));
    assert.equal(hash(manifestBytes), entry.evidence.manifestSHA256);
    assert.equal(manifest.jobId, entry.evidence.jobId); assert.equal(manifest.relation, entry.relation);
    assert.equal(manifest.proofSHA256, entry.proofSHA256); assert.equal(manifest.keySHA256, entry.evidence.keySHA256);
    assert.equal(manifest.selfVerified, true); assert.equal(worker.selfVerified, true);
    assert.equal(worker.phase, 'completed'); assert.equal(supervisor.phase, 'completed');
    assert.equal(supervisor.exitCode, 0); assert.equal(supervisor.signal, null); assert.equal(supervisor.failure, null);
    assert.equal(hash(readFileSync(join(path, 'proof.bin'))), entry.proofSHA256);
    assert.deepEqual(JSON.parse(readFileSync(join(path, 'public-inputs.json'))), publicInputs);
  } else {
    assert.equal(entry.evidence.acceptedResult, true); assert.equal(entry.evidence.worker.verified, true);
    assert.equal(entry.evidence.worker.proofSHA256, entry.proofSHA256);
  }
}
assert.equal(proofs.size, 18);

// Decode the actual transaction's ABI offsets independently of the encoder.
function body(transaction, method) {
  const data = transaction.request.data;
  assert.equal(data.slice(2, 10), FLAT_TRANSACTION_METHODS[method].selector);
  const raw = Buffer.from(data.slice(10), 'hex');
  const uint = offset => { assert.ok(offset >= 0 && offset + 32 <= raw.length);
    const n = BigInt('0x' + raw.subarray(offset, offset + 32).toString('hex'));
    assert.ok(n <= BigInt(Number.MAX_SAFE_INTEGER)); return Number(n); };
  const proofAt = base => {
    const proofStart = base + uint(base), inputsStart = base + uint(base + 32);
    const proofLength = uint(proofStart), inputLength = uint(inputsStart);
    assert.ok(proofStart + 32 + proofLength <= raw.length && inputsStart + 32 + inputLength * 32 <= raw.length);
    return { proof: raw.subarray(proofStart + 32, proofStart + 32 + proofLength).toString('hex'),
      publicInputs: Array.from({ length: inputLength }, (_, index) =>
        BigInt('0x' + raw.subarray(inputsStart + 32 + index * 32, inputsStart + 64 + index * 32).toString('hex')).toString()) };
  };
  return { uint, proofAt };
}
const audit = read('private-audit/evm.json'), matched = [];
function transaction(label, status = '0x1') {
  const list = audit.transactions.filter(value => value.label === label); assert.equal(list.length, 1);
  const tx = list[0]; assert.equal(tx.receipt.status, status);
  assert.equal(tx.phase, 'mined'); assert.equal(tx.transactionHash, tx.receipt.transactionHash);
  assert.equal(tx.receipt.transactionHash, result.transactions.find(value => value.label === label).transactionHash);
  return tx;
}
function match(actual, label) {
  const expected = proofs.get(label); assert.ok(expected);
  assert.deepEqual(actual, { proof: expected.proof, publicInputs: expected.publicInputs }); matched.push(label);
}
match(body(transaction('owner-deposit'), 'depositBalance').proofAt(0), 'original-balance-deposit');
let call = body(transaction('owner-reservation'), 'reserveGenericGuarded');
match(call.proofAt(call.uint(0)), 'owner-envelope'); match(call.proofAt(call.uint(32)), 'funded-reservation');
for (let slot = 0; slot < 2; slot++) {
  call = body(transaction('admit-native-leg-' + slot), 'admit');
  for (const [index, name] of ['dependency', 'readiness', 'admission'].entries())
    match(call.proofAt(call.uint(32 * (index + 1))), `leg-${slot}-${name}`);
}
call = body(transaction('flat-global-fulfillment'), 'fulfillGeneric');
match(call.proofAt(call.uint(0)), 'global-fulfillment');
const arrayBase = call.uint(32);
for (let slot = 0; slot < 4; slot++) match(call.proofAt(arrayBase + call.uint(arrayBase + slot * 32)), `slot-${slot}-completion`);
for (let slot = 0; slot < 2; slot++)
  match(body(transaction(`recipient-${slot}-withdraw`), 'withdrawBalance').proofAt(0), `recipient-${slot}-exit`);
match(body(transaction('owner-withdraw_change'), 'withdrawBalance').proofAt(0), 'owner-change-exit');
const deniedRefund = transaction('reject-paid-reserve-refund', '0x0');
match(body(deniedRefund, 'recoverGeneric').proofAt(0), 'paid-reserve-refund-control');
assert.equal(deniedRefund.revert.reason, 'NOTE_ALREADY_SPENT');
assert.equal(matched.length, 18);
const t = decodeStatement('settlement', proofs.get('global-fulfillment').publicInputs);
const f = decodeStatement('recovery', proofs.get('paid-reserve-refund-control').publicInputs);
assert.equal(t.reserveNullifier, f.reserveNullifier); assert.equal(t.domainCommitment, f.domainCommitment);
assert.equal(transaction('flat-global-fulfillment').request.to, deniedRefund.request.to);
for (const [duplicate, original] of [
  ['reject-paid-fulfillment-replay', 'flat-global-fulfillment'],
  ['reject-recipient-0-withdraw-replay', 'recipient-0-withdraw'],
  ['reject-recipient-1-withdraw-replay', 'recipient-1-withdraw'],
]) {
  const failed = transaction(duplicate, '0x0'), paid = transaction(original);
  assert.equal(failed.request.data, paid.request.data); assert.equal(failed.request.to, paid.request.to);
  assert.equal(failed.revert.reason, 'NOTE_ALREADY_SPENT');
}

const native = read('private-audit/native.json');
assert.equal(native.bitcoin.length, 1); assert.equal(native.solana.length, 1);
const btc = native.bitcoin[0], sol = native.solana[0];
assert.equal(btc.broadcastAttempts, 1); assert.equal(btc.confirmationMiningAttempts, 1);
assert.equal(btc.phase, 'OBSERVED_CONFIRMED');
assert.equal(validateBitcoinTransferWire(btc.rawTransaction, btc.intent, { signed: true }).txid, btc.txid);
assert.equal(sol.broadcastAttempts, 1); assert.equal(sol.phase, 'OBSERVED_FINALIZED');
assert.equal(validateSolanaBindingTransaction(sol.nativeWire, sol.intent).signatureHex, sol.nativeId);
assert.ok(result.nativeDelivery.every(value => value.ownerSuspended));
assert.ok(Date.parse(result.nativeDelivery[0].at) < Date.parse(result.nativeDelivery[1].at));
assert.ok(Date.parse(result.nativeDelivery[1].at) < Date.parse(result.actualGlobalClaim.at));

const evidence = { format: 'FLAT_NATIVE_EXISTING_ARTIFACT_CHECK_V1', recordedAt: new Date().toISOString(), runId,
  readOnly: true, newProofOrRuntime: false, sourceFilesMatched: result.sourcePins.local.length,
  publicProofArtifactsMatched: matched.length, actualCalldataProofPacketsMatched: matched,
  exactPaidRefundSameNullifier: true, exactReplayCalldataRejected: true,
  actualNativeWireBindingsMatched: ['BTC', 'SOL'], nativeBroadcastAttempts: [1, 1],
  finalBacking: '0', fullWalletAcceptance: false, partialDeliveryRecoveryAcceptance: false,
  files: ['result.json', 'resources.json', 'source-pins.json', 'private-audit/evm.json', 'private-audit/native.json']
    .map(path => ({ path, bytes: bytes(path).length, sha256: hash(bytes(path)), private: path.startsWith('private-audit/') })),
  limit: 'Post-run source/artifact verification, not an independent cryptographic audit or a new native consensus check' };
writeFileSync(join(ROOT, 'evidence/native-flow-actual-artifact-check.json'), JSON.stringify(evidence, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ sourceFilesMatched: evidence.sourceFilesMatched, proofsMatchedToActualCalldata: matched.length,
  nativeBindingsMatched: true, exactSameNullifierRefundRejected: true, zeroFinalBacking: true }));
