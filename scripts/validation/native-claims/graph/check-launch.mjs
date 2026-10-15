/** Read-only fixed launch checks; no node, proof, signing or deployment. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, existsSync, readdirSync, writeFileSync, statfsSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { nativeClaimSourcePins } from '../../../../tests/integration/claims/lifecycle/native-claim-source-pins.mjs';
import { linuxRuntimePins } from '@lianum/engine/chains/shared/linux-runtime-pins';
import { solanaCandidateBoundedLedgerCompatibilityPin } from '../../../../packages/backend/src/chains/solana/runtime/owned-solana-runtime.mjs';
import { verifyToolchain, verifyCRS } from '../../../../packages/proofs/programs/wallet-notes/resources.mjs';
const sha = bytes => createHash('sha256').update(bytes).digest('hex'), hash = path => sha(readFileSync(path));
const out = 'experiments/native-claim-graph-v3-acceptance', policy = 'integration/native-claim-graph-v3-policy.mjs';
assert.deepEqual(Object.keys(process.env).sort(), ['LANG', 'PATH']);
assert.equal(process.env.PATH, '/usr/bin:/bin'); assert.equal(process.env.LANG, 'C.UTF-8');
const checkpoint = JSON.parse(readFileSync('../../recovery-library-identity.json')).reconstructed_delta;
assert.equal(checkpoint.version, 25); assert.equal(checkpoint.bytes, 5904362);
assert.equal(checkpoint.library_file_id, 'libfile_926d76673640819199875c8ae7ebeb61');
assert.equal(checkpoint.file_id, 'file_00000000506881fda024531a391d31c9');
assert.equal(checkpoint.sha256, 'fef41d2d711c1ba1438caef7466a598af7591c153f1e71833d9d1408121a37f5');
assert.equal(hash(checkpoint.local_path), checkpoint.sha256);
assert.equal(hash(policy), '5a2ffbaa01e478a83ce66e06cc52b9a7a55d4dbb5f12275e7f680394b05442fa');
assert.equal(hash('integration/native-ingress-v3-preflight-policy.mjs'), '6a62f6e72c5159498c5a6ea3a98ab782da42b33833ff45797972d00e49fa959e');
const manifest = JSON.parse(readFileSync('drafts/native-graph-v3-route/manifest.json'));
assert.equal(manifest.patchSHA256, '445dc1be1343596befcc0e1528a9f69b08251af84c47a982a45318a29590b884');
for (const row of manifest.files) if (row.target !== policy) assert.equal(hash(row.target), row.afterSHA256, row.target);
assert.equal(hash(process.execPath), 'bc17c508ffeed0ec622934f9b7fa72f8e78da65350e63c3eceb56fa688aa5e12');
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
const sourcePins = nativeClaimSourcePins(), expected = JSON.parse(readFileSync('drafts/native-graph-v3-route/proposed-source-pins.json'));
const enabled = readFileSync(policy); const row = expected.local.find(row => row.path === 'flat-wallet/' + policy);
assert.equal(row.sha256, '57dd5321d6af449be15dfe9676a23ec57a4f2d86fafe3015aec4a706ae2f9abe');
row.sha256 = sha(enabled); row.bytes = enabled.length;
assert.deepEqual(sourcePins, expected, 'GRAPH_V3_EXACT_INSTALLED_CLOSURE');
const toolchain = verifyToolchain(), crs = verifyCRS();
const prior = '.local/native-ingress-v3-production-preflight/attempt-4eee4965-381d-45b3-9567-9f45886e7f61/';
const accepted = JSON.parse(readFileSync(prior + 'resources.json')), priorResult = JSON.parse(readFileSync(prior + 'result.json'));
assert.equal(accepted.resultAccepted, true); assert.equal(accepted.sourceClosureUnchanged, true);
assert.equal(accepted.ownedGroupCleanupConfirmed, true); assert.equal(priorResult.success, true);
const record = { format: 'LIANUM_NATIVE_CLAIM_GRAPH_V3_LAUNCH_V1', createdAt: new Date().toISOString(), oneExecutionOnly: true,
  entry: 'integration/run-native-claim-graph-v3-flow.mjs', profile: 'SOLANA_PRIVATE_CLAIM_FUNDED_GRAPH_INGRESS_V3', environment: process.env,
  checkpoint, policySHA256: hash(policy), disabledPolicySHA256: '57dd5321d6af449be15dfe9676a23ec57a4f2d86fafe3015aec4a706ae2f9abe',
  manifestSHA256: hash('drafts/native-graph-v3-route/manifest.json'), sourceFiles: sourcePins.local.length,
  sourcePinsSHA256: sha(JSON.stringify(sourcePins, null, 2) + '\n'),
  node: { path: realpathSync(process.execPath), version: process.version, sha256: hash(process.execPath) },
  locks, resources: { availableRAMBytes, freeDiskBytes }, binaryPins, toolchain, crs,
  acceptedZeroDepositPreflight: { runId: priorResult.runId, resultSHA256: hash(prior + 'result.json'), resourcesSHA256: hash(prior + 'resources.json') },
  requiredPath: { privateClaim: '3000000', reserveAndSolverPayout: '1200000', ownerChange: '1800000', independentSolverNativeDelivery: '1000000',
    separateOriginalCutoffRefund: '2000000', proofPackets: 19, sameLiveFixturePostmintGateBeforeUS: true, stopOnPreflightFailure: true },
  realFunds: false, publicNetwork: false, separateFundedDiagnostic: false };
writeFileSync(join(out, 'launch-checkpoint.json'), JSON.stringify(record, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
console.log(JSON.stringify({ checked: true, sourceFiles: record.sourceFiles, checkpointVersion: checkpoint.version,
  sourcePinsSHA256: record.sourcePinsSHA256, binaryPins: binaryPins.length, availableRAMBytes, freeDiskBytes, node: process.version }));
