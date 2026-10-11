/** Offline, fixed historical preparation check. No runtime, key, RPC or proof
 * worker is created, and no historical artifact becomes current authority. */
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT } from '@lianum/proofs/catalog';
import { encodeControllerClaimCall } from '../../../../packages/backend/src/claims/controller/controller-call.mjs';
import { encodeCanonicalEvmUnsignedTransaction } from '../../../../packages/backend/src/chains/evm/contracts/transaction-wire-codec.mjs';

const RUN = '2e88a2e1-ddbc-4d6c-8c82-20f26cb6258a';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
function pinned(path, digest) {
  const bytes = readFileSync(path); assert.equal(sha(bytes), digest, 'RETAINED_PREPARATION_INPUT_CHANGED');
  return JSON.parse(bytes);
}

export function checkRetainedIssuePreparation({ evm, artifact, proofs }) {
  assert.equal(evm.receipts.length, 61); assert.equal(evm.transactions.length, 62);
  const row = evm.transactions.at(-1), prepared = row.prepared;
  assert.equal(row.phase, 'pre-sign-rejected'); assert.equal(Object.hasOwn(row, 'signed'), false);
  assert.equal(row.senderNonce, '0x3d'); assert.equal(prepared.transaction.nonce, '61');
  assert.equal(prepared.transaction.data, row.request.data);
  assert.equal(prepared.transaction.to, row.request.to); assert.equal(prepared.transaction.from, row.request.from);
  assert.equal(prepared.transaction.value, '0');
  assert.equal(encodeCanonicalEvmUnsignedTransaction(prepared.transaction), prepared.unsignedWire);
  const method = artifact.abi.filter(item => item.type === 'function' && item.name === 'issue');
  assert.equal(method.length, 1); assert.equal(method[0].inputs.length, 3);
  // The pinned issue ABI has two dynamic proof tuples followed by a fixed
  // authorization tuple. Decode only its fixed tuples/arrays and canonical
  // uint/bytes32 fields, then re-encode the WHOLE call with retained proofs.
  const body = prepared.transaction.data.slice(10); let cursor = 128;
  function decode(input) {
    const array = /^(.*)\[([0-9]+)\]$/.exec(input.type);
    if (array) return Array.from({ length: Number(array[2]) }, () => decode({ ...input, type: array[1] }));
    if (input.type === 'tuple') return Object.fromEntries(input.components.map(item => [item.name, decode(item)]));
    const word = body.slice(cursor, cursor += 64); assert.match(word, /^[0-9a-f]{64}$/);
    if (input.type === 'bytes32') return '0x' + word;
    assert.match(input.type, /^uint(?:8|64|256)$/); const value = BigInt('0x' + word);
    assert.ok(value < 1n << BigInt(input.type.slice(4))); return value.toString();
  }
  const authorization = decode(method[0].inputs[2]);
  assert.equal(encodeControllerClaimCall(artifact, 'issue', [...proofs, authorization]), prepared.transaction.data);
  assert.deepEqual(authorization.signatures.map(value => value.signerIndex), ['0', '1', '2']);
  assert.deepEqual(authorization.healthSignatures.map(value => value.signerIndex), ['0', '1', '2']);
  const timestamp = BigInt(prepared.head.timestamp), permit = authorization.permit;
  assert.equal(BigInt(permit.validFrom), timestamp); assert.equal(BigInt(permit.validUntil), timestamp + 30n);
  assert.equal(authorization.healthFrom, permit.validFrom); assert.equal(authorization.healthUntil, permit.validUntil);
  assert.ok(timestamp + 1n < BigInt(permit.validUntil));
  return { format: 'RETAINED_ISSUE_PREPARATION_OFFLINE_CHECK_V1', sourceRun: RUN,
    exactCalldataReconstructed: true, canonicalUnsignedWireMatched: true,
    originalProofsMatched: ['D27', 'CI51'], originalCertificateBoundsMatched: true,
    historicalNextManualBlockWithinBounds: true, includedReceipts: 61,
    recordPhase: row.phase, evmSignatureCreated: false,
    calldataSHA256: sha(Buffer.from(prepared.transaction.data.slice(2), 'hex')),
    authorizationEncodingSHA256: sha(Buffer.from(body.slice(128, cursor), 'hex')),
    newRuntime: false, newProof: false, newSignature: false, freshFinalAudit: false,
    limitation: 'Historical byte/intent consistency only; no surviving original native/operator ownership or fresh final-audit acceptance.' };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  assert.equal(process.argv.length, 2);
  const attempt = join(ROOT, '.local/native-claim-loaded-facts-probe/attempt-' + RUN);
  const result = JSON.parse(readFileSync(join(attempt, 'result.json')));
  const evm = pinned(join(attempt, 'private-audit/evm.json'), '8b8c5345acb8bebc87262725fe826ad9359e1ed4a22214b7af88b57bf5b664f6');
  const compiled = pinned(join(ROOT, '.local/native-claims-contracts/e3e645b6-9466-4f3c-aab1-4dcaa93b7f51/compiled.json'),
    '263757f0d143276829e9bf21548a67ac7b3931f28fcdd42825a31093c486bda9');
  const artifact = Object.values(compiled.contracts).flatMap(value => Object.entries(value))
    .filter(([name]) => name === 'NativeClaimGateway').map(([, value]) => value);
  assert.equal(artifact.length, 1); assert.deepEqual(result.proofs.map(value => value.relation), ['deposit_intent', 'native_claim_ingress']);
  const proofs = result.proofs.map(value => {
    const proof = readFileSync(join(attempt, 'public-proofs/' + value.file + '.bin'));
    const inputs = readFileSync(join(attempt, 'public-proofs/' + value.file + '.inputs.json'));
    assert.equal(sha(proof), value.proofSHA256); assert.equal(sha(inputs), value.publicInputsSHA256);
    return { proof: '0x' + proof.toString('hex'), inputs: JSON.parse(inputs).map(input => '0x' + BigInt(input).toString(16).padStart(64, '0')) };
  });
  const report = checkRetainedIssuePreparation({ evm, artifact: artifact[0], proofs });
  writeFileSync(join(ROOT, '../evidence/retained-issue-preparation-check-20261005.json'), JSON.stringify(report, null, 2) + '\n');
  process.stdout.write(JSON.stringify(report) + '\n');
}
