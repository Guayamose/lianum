/** Read-only fixed launch checks; no node, proof, signing or deployment. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, existsSync, readdirSync, writeFileSync, statfsSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { nativeClaimSourcePins } from '../../../../tests/integration/claims/lifecycle/native-claim-source-pins.mjs';
import { loadNativeClaimIngressV3Artifacts } from '../../../../packages/backend/src/operations/deployments/claims/native-claim-ingress-v3-artifacts.mjs';
import { linuxRuntimePins } from '@lianum/engine/chains/shared/linux-runtime-pins';
import { solanaCandidateBoundedLedgerCompatibilityPin } from '../../../../packages/backend/src/chains/solana/runtime/owned-solana-runtime.mjs';
import { verifyToolchain, verifyCRS } from '../../../../packages/proofs/programs/wallet-notes/resources.mjs';
const sha = bytes => createHash('sha256').update(bytes).digest('hex'), hash = path => sha(readFileSync(path));
const out = 'experiments/native-claim-loaded-v3-complete-payout-20261005', policy = 'integration/native-claim-loaded-v3-policy.mjs';
assert.deepEqual(Object.keys(process.env).sort(), ['LANG', 'PATH']);
assert.equal(process.env.PATH, '/usr/bin:/bin'); assert.equal(process.env.LANG, 'C.UTF-8');
const checkpoint = JSON.parse(readFileSync('../../recovery-library-identity.json')).reconstructed_delta;
assert.deepEqual(checkpoint, JSON.parse(readFileSync(join(out, 'frozen-checkpoint-identity.json'))));
assert.equal(checkpoint.version, 35);
assert.equal(checkpoint.library_file_id, 'libfile_926d76673640819199875c8ae7ebeb61');
assert.equal(hash(checkpoint.local_path), checkpoint.sha256);
assert.equal(hash(policy), '78da6c061f6897b494929cf840df1f9c7acc9b6bc6f3c99866f0a581e3f89151');
assert.equal(hash('integration/native-ingress-v3-preflight-policy.mjs'), '6a62f6e72c5159498c5a6ea3a98ab782da42b33833ff45797972d00e49fa959e');
assert.equal(hash(process.execPath), 'bc17c508ffeed0ec622934f9b7fa72f8e78da65350e63c3eceb56fa688aa5e12');
assert.equal(hash('integration/native-claim-graph-v3-policy.mjs'), '57dd5321d6af449be15dfe9676a23ec57a4f2d86fafe3015aec4a706ae2f9abe');
assert.equal(hash('integration/manual-wallet-acceptance-policy.mjs'), 'a77c32b40704928ff299e686f0b83ab11517b9a41748c2a1b1891cfccbecd1cd');
const locks = [];
for (const d of readdirSync('.local', { withFileTypes: true })) if (d.isDirectory() && existsSync(join('.local', d.name, 'active.lock'))) locks.push(join('.local', d.name, 'active.lock'));
for (const name of ['envelope-constraints', 'native-constraints', 'completion-constraints', 'pinned-verification', 'verifier-compilation'])
  if (existsSync(join('.local/proof-workers', name + '.lock'))) locks.push(join('.local/proof-workers', name + '.lock'));
if (existsSync('/tmp/lianum-paeg-proof-host.lock')) locks.push('/tmp/lianum-paeg-proof-host.lock');
assert.deepEqual(locks, []);
const availableRAMBytes = Number(/MemAvailable:\s+(\d+)/.exec(readFileSync('/proc/meminfo', 'utf8'))[1]) * 1024;
const d = statfsSync('.'), freeDiskBytes = d.bavail * d.bsize;
assert.ok(availableRAMBytes >= 2684354560); assert.ok(freeDiskBytes >= 5368709120);
const binaryPins = [];
for (const [role, pin] of [...Object.entries(linuxRuntimePins).filter(([name]) => name !== 'solc'), ['solanaCandidate', solanaCandidateBoundedLedgerCompatibilityPin]]) {
  assert.equal(hash(join('../../omnichain-product/.local/linux-runtimes', pin[0])), pin[1], role);
  binaryPins.push({ role, path: pin[0], sha256: pin[1] });
}
const sourcePins = nativeClaimSourcePins(), expected = JSON.parse(readFileSync(join(out, 'frozen-source-pins.json')));
expected.local.sort((a, b) => a.path.localeCompare(b.path));
const correctionPins = {
  'wallet-platform/modules/native-claims/controller.mjs': '80c09e3fe6a07f5c1f155cae8a3dba42190b68589390214ba79806eca5d0e22e',
  'wallet-platform/modules/native-claims/payout-final-send.mjs': '1916b8ebe3165156f16627af05fdac1f20fcaecfd95eef157068a15356bb166b',
  'wallet-platform/modules/chain-adapters/owned-solana-runtime.mjs': 'dbbe646506655372f1bf3d9de4a7a71363f643051e523a00fe7cdfa5856af1b0',
  'wallet-platform/modules/ops/owned-native-operator-reads.mjs': '5bef89507ed9778f38fa13d114c549d02ea597e3a439c691dcbe6c22d4dded02',
  'integration/native-claim-flow.mjs': 'afe5982293157761b11de90155016565558acd2792e494f0cef8ea2df3b45dd7',
  'wallet-platform/modules/ops/native-operators.mjs': '296bbf891859ddb5383a781cc74e763172fe07d945934c7ad3d7f94962cc8c1c',
  'wallet-platform/modules/native-claims/operators.mjs': 'b12277c058cf5c4e37c76f63a75cbb886c097a770fa09c4cc25bc9d171bbdd4a',
  'wallet-platform/modules/ops/combined-native-operators.mjs': '1c1fdf9ace6656999e527f07540060085b054ed0834f6fb358fb4dd297e47524',
};
for (const [path, expectedHash] of Object.entries(correctionPins)) assert.equal(hash(path), expectedHash, path);
assert.deepEqual(sourcePins, expected, 'LOADED_V3_EXACT_INSTALLED_CLOSURE');
const toolchain = verifyToolchain(), crs = verifyCRS();
const artifactPreflight = await loadNativeClaimIngressV3Artifacts();
assert.deepEqual(Object.keys(artifactPreflight.verifiers).sort(), ['CI51', 'CO42']);
const prior = '.local/native-ingress-v3-production-preflight/attempt-4eee4965-381d-45b3-9567-9f45886e7f61/';
const accepted = JSON.parse(readFileSync(prior + 'resources.json')), priorResult = JSON.parse(readFileSync(prior + 'result.json'));
assert.equal(accepted.resultAccepted, true); assert.equal(accepted.sourceClosureUnchanged, true);
assert.equal(accepted.ownedGroupCleanupConfirmed, true); assert.equal(priorResult.success, true);
const record = { format: 'LIANUM_NATIVE_CLAIM_LOADED_V3_REDEMPTION_LAUNCH_V1', createdAt: new Date().toISOString(), oneExecutionOnly: true,
  reviewedCorrectionPins: correctionPins, priorStoppedRun: 'e70615b9-931d-4444-8d17-1bebc478e852',
  entry: 'integration/run-native-claim-loaded-v3-flow.mjs', profile: 'SOLANA_LOADED_POST_DELIVERY_REDEMPTION_INGRESS_V3', environment: process.env,
  checkpoint, policySHA256: hash(policy), disabledPolicySHA256: '42834dd0f260f3d8e2d0de5091ca95540a54e87dd09b6637ba2b352556d3885b',
  frozenSourcePinsSHA256: hash(join(out, 'frozen-source-pins.json')), sourceFiles: sourcePins.local.length,
  sourcePinsSHA256: sha(JSON.stringify(sourcePins, null, 2) + '\n'),
  node: { path: realpathSync(process.execPath), version: process.version, sha256: hash(process.execPath) },
  locks, resources: { availableRAMBytes, freeDiskBytes }, binaryPins, toolchain, crs,
  actualReadOnlyClaimArtifactsPreflight: true, priorZeroFundingRun: '27f601c8-a92c-4a9f-ab00-22a13ccddaa9',
  acceptedZeroDepositPreflight: { runId: priorResult.runId, resultSHA256: hash(prior + 'result.json'), resourcesSHA256: hash(prior + 'resources.json') },
  requiredPath: { privateClaim: '3000000', privateClaimExit: '3000000', nativeRedemption: '3000000',
    independentSolverNativeDelivery: '1000000', proofPackets: 4, originalFinalAuthorizationConsumedBeforeKey: true,
    loadedJointInventory: true, noFullGraphProofs: true, noRefund: true, stopOnPreflightFailure: true },
  realFunds: false, publicNetwork: false, separateFundedDiagnostic: false };
writeFileSync(join(out, 'launch-checkpoint.json'), JSON.stringify(record, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
console.log(JSON.stringify({ checked: true, sourceFiles: record.sourceFiles, checkpointVersion: checkpoint.version,
  sourcePinsSHA256: record.sourcePinsSHA256, binaryPins: binaryPins.length, availableRAMBytes, freeDiskBytes, node: process.version }));
