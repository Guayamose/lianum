/** Fixed one-shot public retention. No runtime launch, RPC, signing, proving,
 * lock takeover or cleanup. Missing success-only evidence stays missing. */
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync, readdirSync, lstatSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { nativeClaimSourcePins } from '../../integration/native-claim-source-pins.mjs';
import { validateClaimLoadedV3Result } from '../../integration/native-claim-loaded-v3-policy.mjs';
import { NATIVE_CLAIM_CONTRACT_PIN } from '../../wallet-platform/modules/ops/native-claim-artifacts.mjs';
import { publicKeccak256 } from '../../../../omnichain-product/src/private-cohort-public-native.mjs';
const out = 'experiments/native-claim-loaded-v3-complete-payout-20261005';
assert.equal(process.argv.length, 2); assert.deepEqual(process.execArgv, []);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const json = path => JSON.parse(readFileSync(path)), optional = path => existsSync(path) ? json(path) : null;
const pick = (value, keys) => value ? Object.fromEntries(keys.filter(key => Object.hasOwn(value, key)).map(key => [key, value[key]])) : null;
const pending = new Map();
const emit = (name, value) => pending.set(name, Buffer.from(JSON.stringify(value, null, 2) + '\n'));
const copy = (source, name) => { if (existsSync(source)) pending.set(name, readFileSync(source)); };
const outcome = json(join(out, 'original-process-outcome.json'));
assert.equal(outcome.launchCount, 1); assert.ok(Number.isInteger(outcome.originalProcessReturnCode));
assert.ok(outcome.newAttempts.length <= 1, 'RETENTION_ONE_ATTEMPT_ONLY');
const attempt = outcome.newAttempts[0] ?? null;
if (attempt) assert.match(attempt, /^\.local\/native-claim-loaded-v3-flow\/attempt-[0-9a-f-]{36}$/);
const runId = attempt?.split('attempt-')[1] ?? null;
const result = attempt ? optional(join(attempt, 'result.json')) : null;
const resources = attempt ? optional(join(attempt, 'resources.json')) : null;
const sourcePins = attempt ? optional(join(attempt, 'source-pins.json')) : null;
if (result) assert.equal(result.runId, runId);
if (resources) {
  assert.equal(resources.runId, runId); assert.ok(['completed', 'failed'].includes(resources.phase));
  assert.equal(sha(readFileSync(join(attempt, 'resources.json'))), outcome.resourceReportSHA256);
  if (resources.workerResult && result) assert.equal(sha(readFileSync(join(attempt, 'result.json'))), resources.workerResult.sha256);
}
if (sourcePins) {
  assert.equal(sha(readFileSync(join(attempt, 'source-pins.json'))), resources.sourcePinsSHA256);
  assert.deepEqual(sourcePins, resources.sourcePins); if (result) assert.deepEqual(sourcePins, result.sourcePins);
}
const policy = 'integration/native-claim-loaded-v3-policy.mjs', policyBytes = readFileSync(policy);
const policyHash = sha(policyBytes), disabledHash = '42834dd0f260f3d8e2d0de5091ca95540a54e87dd09b6637ba2b352556d3885b';
let onlySelectedGateRestored = false, postRestoreSourcePinsSHA256 = null;
if (outcome.gateRestored) {
  assert.equal(policyHash, disabledHash); assert.equal(outcome.supervisorTerminalAndOwnedCleanup, true);
  assert.equal(resources?.ownedGroupCleanupConfirmed, true);
  if (sourcePins) {
    const expected = structuredClone(sourcePins), row = expected.local.find(row => row.path === 'flat-wallet/' + policy);
    assert.equal(row.sha256, '78da6c061f6897b494929cf840df1f9c7acc9b6bc6f3c99866f0a581e3f89151');
    row.sha256 = policyHash; row.bytes = policyBytes.length;
    const current = nativeClaimSourcePins(); assert.deepEqual(current, expected, 'ONLY_SELECTED_GATE_RESTORED');
    onlySelectedGateRestored = true; postRestoreSourcePinsSHA256 = sha(JSON.stringify(current, null, 2) + '\n');
  }
}
const locks = [];
for (const row of readdirSync('.local', { withFileTypes: true })) if (row.isDirectory()) {
  const path = join('.local', row.name, 'active.lock'); locks.push({ path, present: existsSync(path) });
}
for (const name of ['envelope-constraints', 'native-constraints', 'completion-constraints', 'pinned-verification', 'verifier-compilation']) {
  const path = join('.local/proof-workers', name + '.lock'); locks.push({ path, present: existsSync(path) });
}
locks.push({ path: '/tmp/lianum-paeg-proof-host.lock', present: existsSync('/tmp/lianum-paeg-proof-host.lock') });
const cleanupConfirmed = outcome.supervisorTerminalAndOwnedCleanup === true && resources?.ownedGroupCleanupConfirmed === true;
const success = resources?.resultAccepted === true;
if (success) {
  assert.equal(outcome.originalProcessReturnCode, 0); assert.equal(result.success, true); validateClaimLoadedV3Result(result);
  assert.equal(cleanupConfirmed, true); assert.equal(resources.sourceClosureUnchanged, true);
  assert.equal(resources.lockReleased, true); assert.equal(resources.workerExitObserved, true); assert.equal(resources.workerCloseObserved, true);
  assert.equal(resources.finalResources?.ownedGroupLiveCount, 0); assert.deepEqual(resources.finalResources?.ownedProcesses, []);
  assert.equal(onlySelectedGateRestored, true); assert.ok(locks.every(lock => !lock.present));
} else if (result) { assert.equal(result.fullNativeGraphAcceptance, false); assert.equal(result.fullWalletAcceptance, false); }
const privateRoot = attempt ? join(attempt, 'private-audit') : null;
const audit = name => privateRoot ? optional(join(privateRoot, name)) : null;
const custody = { bitcoin: audit('bitcoin.json'), solana: audit('solana.json') }, graph = audit('graph-native.json');
const evm = audit('evm.json'), initialNative = audit('initial-native.json'), finalNative = audit('final-native.json');
const finalGraph = audit('final-graph-balances.json'), originalBinding = audit('loaded-facts-retained-claim-binding.json');
const loadedFacts = audit('loaded-facts-genuine-quorum.json'), loadedHealth = audit('loaded-facts-health.json');
const loadedCheckpoint = audit('loaded-facts-checkpoint.json'), unchangedBacking = audit('loaded-facts-unchanged-claim-backing.json');
const error = audit('error-location.json');
const transfer = row => ({ route: row.route ?? null, phase: row.phase ?? null, broadcastAttempts: row.broadcastAttempts ?? null,
  amountAtomic: row.intent?.lamports ?? row.intent?.amount ?? null, transactionSHA256: row.transactionSHA256 ?? null,
  observation: pick(row.observation, ['sourceBefore', 'sourceAfter', 'recipientBefore', 'recipientAfter', 'feeLamports', 'feeSatoshis']) });
const nativeEffects = { custody: Object.fromEntries(Object.entries(custody).map(([name, data]) => [name, data?.transfers.map(transfer) ?? null])),
  graph: graph ? Object.fromEntries(['bitcoin', 'solana'].map(name => [name, graph[name]?.transfers.map(transfer) ?? null])) : null };
const inventory = records => records?.map(record => ({ family: record.family,
  accounts: record.accounts.map(row => pick(row, ['role', 'total', 'spendable', 'unlockedSpendable', 'rentExemptMinimum'])),
  signingUnresolved: record.signingUnresolved })) ?? null;
let economicReceipts = null;
if (evm) {
  const compiledBytes = readFileSync(join('.local/native-claims-contracts', NATIVE_CLAIM_CONTRACT_PIN.runId, 'compiled.json'));
  assert.equal(sha(compiledBytes), NATIVE_CLAIM_CONTRACT_PIN.compiledSHA256);
  const artifact = JSON.parse(compiledBytes).contracts['native-claims/NativeClaimGateway.sol'].NativeClaimGateway;
  const methods = Object.fromEntries(Object.entries(artifact.evm.methodIdentifiers).map(([signature, selector]) => ['0x' + selector, signature.split('(')[0]]));
  const addresses = label => evm.receipts.filter(row => row.label === label).map(row => row.receipt.contractAddress.toLowerCase());
  const gateways = addresses('deploy native claim NativeClaimGateway'), tokens = addresses('deploy native claim NativeClaimToken');
  const pools = addresses('deploy flat PrivateFlatAssetNotePool.sol:PrivateFlatAssetNotePool');
  const receipt = row => ({ label: row.label, receiptSHA256: sha(JSON.stringify(row.receipt)),
    status: row.receipt.status, blockNumber: row.receipt.blockNumber, gasUsed: row.receipt.gasUsed, logCount: row.receipt.logs.length });
  const gatewayCalls = evm.receipts.filter(row => gateways.includes(row.request.to?.toLowerCase()))
    .map(row => ({ method: methods[row.request.data.slice(0, 10)] ?? 'unknown', ...receipt(row) }));
  const transferTopic = '0x' + publicKeccak256(Buffer.from('Transfer(address,address,uint256)')).toString('hex'), zero = '0x' + '0'.repeat(64);
  const tokenAccounting = tokens.map((token, index) => {
    let minted = 0n, burned = 0n, poolNet = 0n;
    const pool = pools[index] ? '0x' + '0'.repeat(24) + pools[index].slice(2) : null;
    for (const row of evm.receipts) for (const log of row.receipt.logs) {
      if (log.address.toLowerCase() !== token || log.topics[0] !== transferTopic) continue;
      assert.equal(row.receipt.status, '0x1'); assert.equal(log.topics.length, 3); const amount = BigInt(log.data);
      if (log.topics[1] === zero) minted += amount; if (log.topics[2] === zero) burned += amount;
      if (log.topics[2] === pool) poolNet += amount; if (log.topics[1] === pool) poolNet -= amount;
    }
    return { assetIndex: index, mintedAtomic: String(minted), burnedAtomic: String(burned),
      outstandingSupplyFromEvents: String(minted - burned), poolTokenBalanceFromEvents: pool ? String(poolNet) : null };
  });
  economicReceipts = { gatewayCalls, tokenAccounting, scope: 'RETAINED_SUCCESSFUL_TRANSACTION_LOGS_NOT_NEW_FINAL_RPC_READ' };
}
const privateReceiptHashes = [];
if (privateRoot) for (const name of ['initial-native.json', 'final-native.json', 'final-graph-balances.json', 'solana-nonce.json',
  'loaded-facts-retained-claim-binding.json', 'loaded-facts-signed-before-broadcast.json', 'loaded-facts-original-finalized.json',
  'loaded-facts-genuine-quorum.json', 'loaded-facts-health.json', 'loaded-facts-checkpoint.json', 'loaded-facts-unchanged-claim-backing.json']) {
  const path = join(privateRoot, name); if (existsSync(path)) { const bytes = readFileSync(path); privateReceiptHashes.push({ label: name, bytes: bytes.length, sha256: sha(bytes) }); }
}
const publicProofs = [];
const expectedRelations = ['deposit_intent', 'native_claim_ingress_v3', 'withdraw_balance', 'native_claim_discharge'];
for (const [index, proof] of (result?.proofs ?? []).entries()) {
  assert.equal(proof.relation, expectedRelations[index], 'EXACT_PARTIAL_PROOF_PREFIX');
  assert.match(proof.file, /^[a-zA-Z0-9_-]+$/);
  const binary = readFileSync(join(attempt, 'public-proofs', proof.file + '.bin'));
  const inputs = readFileSync(join(attempt, 'public-proofs', proof.file + '.inputs.json'));
  assert.equal(sha(binary), proof.proofSHA256); assert.equal(sha(inputs), proof.publicInputsSHA256);
  assert.ok(Array.isArray(JSON.parse(inputs)));
  const binaryName = 'public-' + proof.file + '.bin', inputsName = 'public-' + proof.file + '.inputs.json';
  pending.set(binaryName, binary); pending.set(inputsName, inputs);
  publicProofs.push({ relation: proof.relation, binary: binaryName, inputs: inputsName, proofSHA256: sha(binary), publicInputsSHA256: sha(inputs) });
}
if (attempt) for (const [source, name] of [['attempt.json', 'original-application-attempt.json'], ['resources.json', 'original-application-resources.json'],
  ['source-pins.json', 'original-application-source-pins.json']]) copy(join(attempt, source), name);
const resultKeys = ['format', 'runId', 'profile', 'selectedAssets', 'phase', 'success', 'localOnly', 'fakeFundsOnly', 'publicNetwork',
  'stages', 'ownerStops', 'claims', 'redemptions', 'proofs', 'transactions', 'accountRequests', 'nativeProtocol', 'cleanup', 'acceptance',
  'independentOperators', 'nativeSelfCustody', 'keeperRestart', 'nativeNodeRestart', 'operatorKeyRestart', 'fullHostRestart',
  'systemicPrivacyAcceptance', 'fullWalletAcceptance', 'fullNativeGraphAcceptance', 'ingressRelation', 'ingressSourceVersion', 'ingressKeySHA256',
  'claimCollectionProfile', 'disclosure', 'graphAttestationPreflight', 'nonceInfrastructure', 'privatePortfolio', 'loadedFactsProbe',
  'redemptionAuthorization', 'finalNativeInventoryCaptured', 'finalGraphBalancesReobserved', 'finalClaimState', 'nativeEffects',
  'failureDiagnostics', 'errorCode', 'causeCode', 'errorCauseCodes', 'errorAuditBudget', 'finalAuditUnavailable', 'interruption'];
if (result) emit('original-application-result.sanitized.json', pick(result, resultKeys));
if (error) emit('original-error-location.sanitized.json', { ...pick(error, ['errorCode', 'causeCode']),
  frames: (error.frames ?? []).map(frame => frame.replace(process.cwd() + '/', '')),
  causeFrames: (error.causeFrames ?? []).map(frame => frame.replace(process.cwd() + '/', '')) });
emit('owned-cleanup-verification.json', { runId, originalSupervisorExitObservedByLauncher: true,
  originalProcessReturnCode: outcome.originalProcessReturnCode, supervisorTerminalAndOwnedCleanup: outcome.supervisorTerminalAndOwnedCleanup,
  ownedGroupCleanupConfirmed: resources?.ownedGroupCleanupConfirmed ?? false,
  workerExitObserved: resources?.workerExitObserved ?? false, workerCloseObserved: resources?.workerCloseObserved ?? false,
  workerExit: resources?.workerExit ?? null, workerClose: resources?.workerClose ?? null,
  originalSupervisorFinalResources: resources?.finalResources ?? null, applicationCleanup: result?.cleanup ?? null,
  sourceClosureUnchanged: resources?.sourceClosureUnchanged ?? false, sourceModules: sourcePins?.local.length ?? null,
  onlySelectedGateRestored, currentPolicySHA256: policyHash, runSourcePinsSHA256: resources?.sourcePinsSHA256 ?? null,
  postRestoreSourcePinsSHA256, locks,
  processDeathEvidence: 'ORIGINAL_LAUNCHER_WAIT_AND_ORIGINAL_SUPERVISOR_OWNED_IDENTITY_CLEANUP_ONLY_NO_FOREIGN_PID_NAMESPACE_INFERENCE' });
emit('original-economic-public-receipts.json', { runId, ...economicReceipts, nativeEffects,
  initialNativeAccounting: inventory(initialNative), finalNativeAccounting: inventory(finalNative),
  finalGraphBalances: pick(finalGraph, ['solver', 'recipient']),
  nativeBalanceObservationScope: finalNative ? 'RETAINED_LIVE_FIXTURE_FINAL_INVENTORY_NOT_POST_TEARDOWN_RPC' : 'NO_FINAL_NATIVE_INVENTORY_RETAINED',
  privateReceiptHashes });
const terminal = { format: 'LIANUM_NATIVE_CLAIM_LOADED_V3_REDEMPTION_TERMINAL_V1', runId,
  scope: 'LOADED_POST_DELIVERY_REDEMPTION_INGRESS_V3_ONLY', priorStoppedRun: 'ab8e6290-9673-45d8-89db-0462f4cc6943',
  success, workerReportedSuccess: result?.success ?? null, resultAccepted: resources?.resultAccepted ?? false,
  errorCode: result?.errorCode ?? null, causeCode: result?.causeCode ?? null, errorCauseCodes: result?.errorCauseCodes ?? [],
  errorAuditBudget: result?.errorAuditBudget ?? null, supervisorFailure: resources?.failure ?? null,
  failedStage: success ? null : result?.stages.at(-1)?.name ?? null,
  originalProcessReturnCode: outcome.originalProcessReturnCode, initialPreflight: result?.graphAttestationPreflight ?? null,
  claims: result?.claims ?? [], redemptions: result?.redemptions ?? [], loadedFactsProbe: result?.loadedFactsProbe ?? null,
  loadedOriginalEvidence: { originalClaimBindingRetained: originalBinding !== null, genuineQuorumRetained: loadedFacts !== null,
    healthRetained: loadedHealth !== null, checkpointRetained: loadedCheckpoint !== null, unchangedBackingRetained: unchangedBacking !== null },
  redemptionAuthorization: result?.redemptionAuthorization ?? null, acceptance: result?.acceptance ?? null,
  finalClaimState: result?.finalClaimState ?? null, tokenAccounting: economicReceipts?.tokenAccounting ?? null, nativeEffects,
  finalNativeInventoryCaptured: finalNative !== null, finalGraphBalancesReobserved: result?.finalGraphBalancesReobserved === true && finalGraph !== null,
  finalObservationScope: finalNative ? 'RETAINED_LIVE_FIXTURE_FINAL_INVENTORY' : 'NO_FINAL_NATIVE_INVENTORY_RETAINED',
  allClaimLiabilitiesClosedEstablished: success && result?.acceptance?.allClaimLiabilitiesClosed === true,
  proofPackets: publicProofs.length, publicProofs, originalResultSHA256: result ? sha(readFileSync(join(attempt, 'result.json'))) : null,
  sourceClosureUnchanged: resources?.sourceClosureUnchanged ?? false, sourceModules: sourcePins?.local.length ?? null,
  ownedGroupCleanupConfirmed: cleanupConfirmed, onlySelectedGateRestored, ownedLocksAbsent: locks.every(lock => !lock.present),
  noAutomaticRetryOrReplacement: true, originalFailedFixtureRecovered: false, olderFixtureLiabilitiesClosed: false,
  realFunds: false, publicNetwork: false, fullNativeGraphAcceptance: false, fullWalletAcceptance: false };
if (success) {
  assert.deepEqual(economicReceipts.tokenAccounting.map(row => [row.outstandingSupplyFromEvents, row.poolTokenBalanceFromEvents]), [['0', '0'], ['0', '0']]);
  assert.equal(publicProofs.length, 4); assert.ok(Object.values(terminal.loadedOriginalEvidence).every(Boolean));
  assert.equal(finalNative !== null, true); assert.equal(finalGraph !== null, true);
}
emit('terminal-sanitized.json', terminal);
const sourceFiles = ['README.md', 'run-once.py', 'check-launch.mjs', 'policy-pins.json', 'retain-terminal.mjs',
  'retain-terminal-v2.mjs', 'retention-v1-failure.json', 'retention-v2-correction.json', 'older-evidence-preservation.json',
  'prelaunch-public-allowlist.json', 'frozen-source-pins.json', 'frozen-checkpoint-identity.json', 'launch-checkpoint.json',
  'launch-started.json', 'original-process-outcome.json'];
const publicFiles = [...sourceFiles.filter(name => existsSync(join(out, name))), ...pending.keys()];
const forbidden = new Set();
function gather(value) {
  if (!value || typeof value !== 'object') return;
  for (const [key, item] of Object.entries(value)) {
    if (['nativeWire', 'nativeId', 'signature', 'signatureHex', 'signatureBase58', 'secretKey', 'privateKey', 'password'].includes(key)
      && typeof item === 'string' && item.length >= 32) forbidden.add(item);
    else if (item && typeof item === 'object') gather(item);
  }
}
if (privateRoot) for (const name of readdirSync(privateRoot).filter(name => name.endsWith('.json'))) {
  const path = join(privateRoot, name); if (lstatSync(path).isFile()) gather(json(path));
}
for (const name of publicFiles) {
  const bytes = pending.get(name) ?? readFileSync(join(out, name));
  if (!name.endsWith('.bin')) {
    const text = bytes.toString('utf8'); assert.ok([...forbidden].every(value => !text.includes(value)), 'PRIVATE_NATIVE_VALUE_IN_EXPORT');
  }
}
for (const name of pending.keys()) assert.equal(existsSync(join(out, name)), false, 'RETENTION_NO_OVERWRITE');
assert.equal(existsSync(join(out, 'backup-public-allowlist.json')), false);
for (const [name, bytes] of pending) writeFileSync(join(out, name), bytes, { flag: 'wx', mode: 0o600 });
const records = publicFiles.map(path => { const bytes = readFileSync(join(out, path)); return { path, bytes: bytes.length, sha256: sha(bytes) }; });
writeFileSync(join(out, 'backup-public-allowlist.json'), JSON.stringify({ format: 'LIANUM_NATIVE_CLAIM_LOADED_V3_PUBLIC_BACKUP_ALLOWLIST_V1',
  runId, scope: 'EXACT_PUBLIC_PROOFS_AND_SANITIZED_ONE_SHOT_RESULTS_AND_FIXED_SOURCE_ONLY', records,
  manifestSelf: 'backup-public-allowlist.json', excluded: ['original-supervisor.stdout', 'original-supervisor.stderr',
    'private-audit', 'signed native wires', 'native signatures', 'private keys', 'witnesses', 'encrypted stores', 'native ledgers'],
  originalNativeWireAndSignatureAbsentFromExports: true }, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
console.log(JSON.stringify({ retained: true, runId, success, resultAccepted: resources?.resultAccepted ?? false,
  errorCode: result?.errorCode ?? null, proofPackets: publicProofs.length, cleanupConfirmed, onlySelectedGateRestored, allowlistedFiles: records.length }));
