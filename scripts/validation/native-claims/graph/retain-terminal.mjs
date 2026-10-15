/** Fixed read-only retained-result checks and public-only projection. Never
 * imports a signed native wire, private journal, key or witness into export. */
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { nativeClaimSourcePins } from '../../../../tests/integration/claims/lifecycle/native-claim-source-pins.mjs';
import { NATIVE_CLAIM_CONTRACT_PIN } from '../../../../packages/backend/src/operations/deployments/claims/native-claim-artifacts.mjs';
const runId = '30e3131f-9928-4a79-9e8c-4ae0e75727e0', out = 'experiments/native-claim-graph-v3-acceptance';
const attempt = '.local/native-claim-graph-v3-flow/attempt-' + runId;
const json = path => JSON.parse(readFileSync(path)), sha = bytes => createHash('sha256').update(bytes).digest('hex');
const write = (name, value) => writeFileSync(join(out, name), JSON.stringify(value, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
const result = json(join(attempt, 'result.json')), resources = json(join(attempt, 'resources.json'));
const processOutcome = json(join(out, 'original-process-outcome.json'));
assert.equal(result.runId, runId); assert.equal(resources.runId, runId);
assert.equal(result.success, false); assert.equal(result.phase, 'failed'); assert.equal(result.errorCode, 'CLAIM_QUORUM_AUDIT_TOO_OLD');
assert.equal(resources.resultAccepted, false); assert.equal(resources.sourceClosureUnchanged, true); assert.equal(resources.ownedGroupCleanupConfirmed, true);
assert.equal(processOutcome.originalProcessReturnCode, 1); assert.equal(processOutcome.gateRestored, true);
assert.equal(resources.workerExit.code, 1); assert.equal(resources.workerClose.code, 1);
assert.equal(resources.workerExit.signal, null); assert.equal(resources.workerClose.signal, null);
assert.equal(resources.lockReleased, true);
for (const key of ['closedEvm', 'closedBitcoin', 'closedSolana', 'closedController', 'closedKeeper']) assert.equal(result.cleanup[key], true);
assert.equal(result.cleanup.application.closed, true); assert.equal(result.cleanup.application.keeper.exitObserved, true);
assert.deepEqual(result.cleanup.application.errors, []);
const sourcePins = json(join(attempt, 'source-pins.json'));
assert.equal(sha(readFileSync(join(attempt, 'source-pins.json'))), resources.sourcePinsSHA256);
assert.deepEqual(sourcePins, result.sourcePins); assert.deepEqual(sourcePins, resources.sourcePins);
const current = nativeClaimSourcePins(), expected = structuredClone(sourcePins), policy = 'integration/native-claim-graph-v3-policy.mjs';
const bytes = readFileSync(policy), record = expected.local.find(r => r.path === 'flat-wallet/' + policy);
assert.equal(record.sha256, '5a2ffbaa01e478a83ce66e06cc52b9a7a55d4dbb5f12275e7f680394b05442fa');
assert.equal(sha(bytes), '57dd5321d6af449be15dfe9676a23ec57a4f2d86fafe3015aec4a706ae2f9abe');
record.sha256 = sha(bytes); record.bytes = bytes.length;
assert.deepEqual(current, expected, 'ONLY_SELECTED_GATE_RESTORED');
const locks = ['.local/native-claim-graph-v3-flow/active.lock', '.local/proof-workers/active.lock', '/tmp/lianum-paeg-proof-host.lock'];
assert.ok(locks.every(path => !existsSync(path)));
const custody = json(join(attempt, 'private-audit/solana.json')), bitcoin = json(join(attempt, 'private-audit/bitcoin.json'));
const graph = json(join(attempt, 'private-audit/graph-native.json'));
assert.equal(custody.transfers.length, 1); const original = custody.transfers[0];
assert.equal(original.route, 'deposit'); assert.equal(original.phase, 'SIGNED_NOT_BROADCAST'); assert.equal(original.broadcastAttempts, 0);
assert.equal(original.intent.lamports, '3000000'); assert.equal(original.observation, null);
assert.equal(bitcoin.transfers.length, 0); assert.equal(graph.bitcoin.transfers.length, 0); assert.equal(graph.solana.transfers.length, 0);
assert.deepEqual(result.claims, []); assert.deepEqual(result.redemptions, []);
assert.deepEqual(result.proofs.map(p => p.relation), ['deposit_intent']);
assert.equal(result.acceptance.nonceBootstrapFinalized, true); assert.equal(result.acceptance.nonceInfrastructureExcluded, true);
const error = json(join(attempt, 'private-audit/error-location.json'));
assert.equal(error.errorCode, 'CLAIM_QUORUM_AUDIT_TOO_OLD'); assert.equal(error.causeCode, null);
const frames = error.frames.map(frame => frame.replace(process.cwd() + '/', ''));
assert.ok(frames.some(frame => frame.includes('operators.mjs:884:14')));
const evm = json(join(attempt, 'private-audit/evm.json'));
const compiledBytes = readFileSync(join('.local/native-claims-contracts', NATIVE_CLAIM_CONTRACT_PIN.runId, 'compiled.json'));
assert.equal(sha(compiledBytes), NATIVE_CLAIM_CONTRACT_PIN.compiledSHA256);
const artifact = JSON.parse(compiledBytes).contracts['native-claims/NativeClaimGateway.sol'].NativeClaimGateway;
const methods = Object.fromEntries(Object.entries(artifact.evm.methodIdentifiers).map(([signature, selector]) => ['0x' + selector, signature.split('(')[0]]));
const gateways = evm.receipts.filter(row => row.label === 'deploy native claim NativeClaimGateway').map(row => row.receipt.contractAddress.toLowerCase());
const gatewayCalls = evm.receipts.filter(row => gateways.includes(row.request.to?.toLowerCase())).map(row => ({
  method: methods[row.request.data.slice(0, 10)], transactionHash: row.transactionHash,
  status: row.receipt.status, blockNumber: row.receipt.blockNumber, gasUsed: row.gasUsed, logCount: row.receipt.logs.length }));
assert.deepEqual(gatewayCalls.filter(row => row.method !== 'seal').map(row => row.method), ['preposition', 'reserveSignedEffect']);
assert.ok(gatewayCalls.every(row => row.status === '0x1'));
const initial = json(join(attempt, 'private-audit/initial-native.json'));
const initialBalances = initial.map(n => ({ family: n.family,
  economicAccounts: n.accounts.map(a => ({ role: a.role, totalAtomic: a.total, spendableAtomic: a.spendable })),
  actualEconomicFees: n.feeAudit.actualFees, escrowActualEconomicFees: n.feeAudit.escrowActualFees }));
const nonce = json(join(attempt, 'private-audit/solana-nonce.json'));
const infrastructure = Object.entries(nonce.bootstrapByAuthority).map(([authorityRole, b]) => {
  assert.equal(b.phase, 'OBSERVED_FINALIZED'); assert.equal(b.broadcastAttempts, 1);
  const pin = nonce.infrastructureByAuthority[authorityRole];
  return { authorityRole, phase: b.phase, bootstrapBroadcastAttempts: b.broadcastAttempts,
    bootstrapRentLamports: pin.bootstrapRentLamports, bootstrapFeeLamports: pin.bootstrapFeeLamports,
    genesisGrantLamports: pin.genesisGrant, classification: pin.classification };
});
for (const [source, name] of [['attempt.json', 'original-application-attempt.json'], ['resources.json', 'original-application-resources.json'],
  ['result.json', 'original-application-result.json'], ['source-pins.json', 'original-application-source-pins.json']]) {
  const bytes = readFileSync(join(attempt, source)); writeFileSync(join(out, name), bytes, { flag: 'wx', mode: 0o600 });
}
const publicProofs = [];
for (const proof of result.proofs) {
  const binary = readFileSync(join(attempt, 'public-proofs', proof.file + '.bin'));
  const inputs = readFileSync(join(attempt, 'public-proofs', proof.file + '.inputs.json'));
  assert.equal(sha(binary), proof.proofSHA256); assert.equal(sha(inputs), proof.publicInputsSHA256);
  const binaryName = 'public-' + proof.file + '.bin', inputsName = 'public-' + proof.file + '.inputs.json';
  writeFileSync(join(out, binaryName), binary, { flag: 'wx', mode: 0o600 }); writeFileSync(join(out, inputsName), inputs, { flag: 'wx', mode: 0o600 });
  publicProofs.push({ relation: proof.relation, binary: binaryName, inputs: inputsName, proofSHA256: sha(binary), publicInputsSHA256: sha(inputs) });
}
write('original-error-location.sanitized.json', { errorCode: error.errorCode, causeCode: null, frames, causeFrames: [] });
write('original-gateway-public-receipts.json', gatewayCalls);
write('gate-restoration-check.json', { onlySelectedGateRestored: true, disabledPolicySHA256: sha(bytes),
  sourceModules: current.local.length, runSourcePinsSHA256: resources.sourcePinsSHA256,
  postRestoreSourcePinsSHA256: sha(JSON.stringify(current, null, 2) + '\n'),
  locks: locks.map(path => ({ path, present: false })) });
write('terminal-sanitized.json', { format: 'LIANUM_NATIVE_CLAIM_GRAPH_V3_FIRST_RUN_TERMINAL_V1', runId,
  success: false, errorCode: result.errorCode, causeCode: result.causeCode, errorCauseCodes: result.errorCauseCodes,
  failedStage: result.stages.at(-1).name, failureBoundary: 'ORIGINAL_V3_INGRESS_BEFORE_BROADCAST_AGGREGATE_QUORUM_30_SECOND_GUARD',
  originalSignedEffect: { route: original.route, amountAtomic: '3000000', phase: original.phase, broadcastAttempts: 0,
    canonicalSignedEffectReservationIncluded: true, allFourRetentionChecksPassedBeforeQuorum: true,
    nativeAttemptLatchReached: false, nativeFinalityEstablished: false, wireOrSignatureExported: false },
  noAutomaticRetryOrReplacement: true, originalAttemptCount: 1,
  nativeEconomicBroadcastAttempts: { solanaCustody: 0, bitcoinCustody: 0, solanaGraph: 0, bitcoinGraph: 0 },
  bootstrapInfrastructure: infrastructure, graphAttestationPreflight: result.graphAttestationPreflight,
  ownerSuspendedBeforeOriginalDeposit: result.ownerStops.some(row => row.phase === 'before-first-native-transfer'),
  issuanceAccepted: false, sourceReservationSIncluded: false, graphNativeDelivery: false, graphSettlement: false,
  privateNoteExits: false, nativeRedemptions: false, originalCutoffRefund: false, fundedPostmintPreflightReached: false,
  allClaimLiabilitiesClosedEstablished: false, nativeBalanceEvidence: { initial: initialBalances,
    finalInventoryCaptured: existsSync(join(attempt, 'private-audit/final-native.json')),
    independentlyReobservedFinalBalances: false,
    limitation: 'Only retained initial balances and zero owned economic broadcast attempts are established; runtimes are now closed.' },
  publicProofs, originalProcessReturnCode: processOutcome.originalProcessReturnCode,
  supervisorFailure: resources.failure, workerExit: resources.workerExit, workerClose: resources.workerClose,
  sourceClosureUnchanged: true, sourceModules: sourcePins.local.length, ownedGroupCleanupConfirmed: true,
  runtimeCleanup: Object.fromEntries(['closedEvm','closedBitcoin','closedSolana','closedController','closedKeeper'].map(k => [k, true])),
  keeperExitObserved: true, applicationCleanupErrors: [], applicationLockReleased: resources.lockReleased,
  ownedLocksAbsent: true, selectedGateRestored: true, disabledPolicySHA256: sha(bytes),
  freshnessGuardRelaxed: false, cutoffChanged: false, realFunds: false, publicNetwork: false,
  oldUnknownDepositsRecovered: false, registeredDomainV3IssuanceAccepted: false, fullNativeGraphAcceptance: false,
  changedRetainedSuccessArtifactCheckerRun: false,
  limitation: 'This run failed before native broadcast. Synthetic-proof preflight remains separate accepted evidence; funded V3 acceptance remains open.' });
console.log(JSON.stringify({ retained: true, runId, errorCode: result.errorCode, attemptedEconomicBroadcasts: 0,
  proofs: ['deposit_intent'], cleanupConfirmed: true, selectedGateRestored: true, noPrivateNativeWireKeyOrWitnessExported: true }));
