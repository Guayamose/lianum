import assert from 'node:assert/strict';
import { writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { createOwnedSolanaRuntime, decodeSolanaTransfer, signSolanaTransfer, base58Encode, verifySolanaWireOffline } from '../../../../../packages/engine/src/chains/solana/solana-runtime.mjs';
import { projectRoot } from '../../../../../packages/engine/src/chains/shared/runtime-harness.mjs';

const evidence = { classification: 'NATIVE_ISOLATED_LINUX_SOLANA_TRANSFER_NOT_TRIPLE_OR_PUBLIC_CONSENSUS', phase: 'starting', checks: [], publicNetworkUsed: false, realFundsUsed: false, hostSecurityChanged: false };
const path = join(projectRoot, 'evidence/m14-solana-linux.json');
const persist = () => writeFile(path, JSON.stringify(evidence, null, 2) + '\n');
let runtime, startupCleanup;
try {
  const wireFixture = signSolanaTransfer({ seed: Buffer.alloc(32, 3), recipient: base58Encode(Buffer.alloc(32, 4)), recentBlockhash: base58Encode(Buffer.alloc(32, 5)), lamports: '3000000' });
  evidence.offlineWireVerification = await verifySolanaWireOffline(wireFixture.transactionBase64);
  await writeFile(join(projectRoot, 'evidence/m14-solana-offline-wire.json'), JSON.stringify(evidence.offlineWireVerification, null, 2) + '\n');
  runtime = await createOwnedSolanaRuntime(async progress => { console.log(progress); });
  evidence.runtime = runtime.metadata;
  evidence.recipientBefore = await runtime.balance();
  evidence.transfer = await runtime.transfer('3000000', { onSigned: async record => {
    assert.equal(record.phase, 'SIGNED_NOT_BROADCAST'); assert.equal(record.broadcastAttempts, 0);
    assert.equal(runtime.transfers[0].signature, record.signature);
    assert.equal(decodeSolanaTransfer(record.transactionBase64).signature, record.signature);
    evidence.signedIdentityBeforeBroadcast = record; evidence.phase = 'signed-before-broadcast'; await persist();
  } });
  evidence.checks.push('Exact Ed25519 signed identity recorded before sole broadcast attempt');
  await assert.rejects(() => runtime.transfer('3000000'), /SOLANA_PRIOR_TRANSFER_UNRESOLVED/);
  evidence.checks.push('Unresolved prior transfer prevents blind replacement');
  evidence.observation = await runtime.observe(evidence.transfer.signature, { expectedLamports: '3000000' });
  console.log(JSON.stringify({ phase: 'native-solana-finalized', signature: evidence.observation.signature, slot: evidence.observation.slot, lamports: evidence.observation.lamports }));
  evidence.phase = 'finalized-before-replay'; await persist();
  evidence.recipientAfter = await runtime.balance();
  assert.equal(BigInt(evidence.recipientAfter) - BigInt(evidence.recipientBefore), 3000000n);
  assert.equal(evidence.observation.finalized, true);
  evidence.checks.push('Native confirmed successful exact single System transfer, finalized status and canonical block membership');
  evidence.checks.push('Exact native recipient balance delta and solver debit plus fee');
  const secondObservation = await runtime.observe(evidence.transfer.signature, { expectedLamports: '3000000' });
  assert.equal(secondObservation.signature, evidence.observation.signature);
  assert.equal(await runtime.balance(), evidence.recipientAfter);
  assert.equal(runtime.transfers[0].broadcastAttempts, 1);
  evidence.checks.push('Repeated read-only observation produces no additional native credit or rebroadcast');
  evidence.nativeReplayControl = await runtime.replayFinalizedForReview(evidence.transfer.signature);
  assert.equal(evidence.nativeReplayControl.additionalRecipientCreditLamports, '0');
  assert.equal(evidence.nativeReplayControl.additionalSolverDebitLamports, '0');
  await assert.rejects(() => runtime.replayFinalizedForReview(evidence.transfer.signature), /SOLANA_REPLAY_REVIEW_ALREADY_ATTEMPTED/);
  evidence.checks.push('Deliberate one-time identical finalized transaction rebroadcast adds no second native credit or fee');
  evidence.downstreamArithmetic = { source: 'validated native recipientDeltaLamports', lamports: evidence.observation.recipientDeltaLamports, divisor: '30', derivedSatoshi: (BigInt(evidence.observation.recipientDeltaLamports) / 30n).toString(), executedBitcoin: false };
  evidence.transfers = runtime.transfers;
  evidence.phase = 'completed';
} catch (error) {
  startupCleanup = error.cleanup;
  evidence.phase = 'failed'; evidence.failure = { message: error.message, ...(error.diagnostic ? { diagnostic: error.diagnostic } : {}), ...(error.transfer ? { transfer: error.transfer } : {}), ...(error.cleanup ? { cleanup: error.cleanup } : {}), ...(error.ownedSockets ? { ownedSockets: error.ownedSockets, offendingSocket: error.offendingSocket } : {}) }; process.exitCode = 1; console.error(JSON.stringify(evidence.failure));
} finally {
  try {
    if (runtime) { evidence.cleanup = await runtime.close(); evidence.ownedProcessStopped = evidence.cleanup.ownedProcessStopped; evidence.syntheticKeysAndLedgerRemoved = evidence.cleanup.syntheticKeysAndLedgerRemoved; }
    else { evidence.ownedProcessStopped = startupCleanup?.ownedProcessStopped === true; evidence.syntheticKeysAndLedgerRemoved = startupCleanup?.syntheticKeysAndLedgerRemoved === true; }
  }
  catch (error) { evidence.phase = 'cleanup-failed'; evidence.cleanupError = error.message; process.exitCode = 1; }
  evidence.sourceSHA256 = {};
  for (const file of ['src/chains/solana-runtime.mjs', 'scripts/integration-solana-linux.mjs', 'test/solana-observation.test.mjs']) evidence.sourceSHA256[file] = createHash('sha256').update(await readFile(join(projectRoot, file))).digest('hex');
  await persist();
}
console.log(JSON.stringify({ phase: evidence.phase, signature: evidence.observation?.signature, nativeLamports: evidence.observation?.lamports, downstreamSatoshi: evidence.downstreamArithmetic?.derivedSatoshi, checks: evidence.checks.length, evidence: 'evidence/m14-solana-linux.json' }));
