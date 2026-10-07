/** Fixed read-only checks. No runtime, compile, proving or signing. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, existsSync, readdirSync, writeFileSync, statfsSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { manualWalletSourcePins } from '../../../tests/integration/runners/source-pins.mjs';
import { linuxRuntimePins } from '../../../packages/engine/src/chains/shared/linux-runtime-pins.mjs';
import { verifyToolchain, verifyCRS } from '../../engine/private-core-proof/wallet-notes/resources.mjs';
const sha = bytes => createHash('sha256').update(bytes).digest('hex'), hash = path => sha(readFileSync(path));
const out = 'experiments/manual-wallet-sdk-acceptance-20261005';
const policy = 'integration/manual-wallet-acceptance-policy.mjs';
assert.equal(process.argv.length, 2); assert.deepEqual(process.execArgv, []);
assert.deepEqual(Object.keys(process.env).sort(), ['LANG', 'PATH']);
assert.equal(process.env.PATH, '/usr/bin:/bin'); assert.equal(process.env.LANG, 'C.UTF-8');
const release = JSON.parse(readFileSync(join(out, 'exclusive-launch-release.json')));
assert.equal(release.approvedToStart, true); assert.equal(release.exclusiveHeavySlotReleased, true);
assert.equal(release.profile, 'MANUAL_EXACT_ONLY_ONE_GENERATION_EVM_VAULT');
const checkpoint = JSON.parse(readFileSync('../../recovery-library-identity.json')).reconstructed_delta;
assert.deepEqual(checkpoint, JSON.parse(readFileSync(join(out, 'frozen-checkpoint-identity.json'))));
assert.equal(checkpoint.version, release.checkpointVersion);
assert.equal(checkpoint.library_file_id, 'libfile_926d76673640819199875c8ae7ebeb61');
assert.equal(hash(checkpoint.local_path), checkpoint.sha256);
const policyPins = JSON.parse(readFileSync(join(out, 'policy-pins.json')));
assert.equal(hash(policy), policyPins.enabledSHA256);
assert.equal(hash('integration/native-claim-graph-v3-policy.mjs'), '57dd5321d6af449be15dfe9676a23ec57a4f2d86fafe3015aec4a706ae2f9abe');
assert.equal(hash(process.execPath), 'bc17c508ffeed0ec622934f9b7fa72f8e78da65350e63c3eceb56fa688aa5e12');
const locks = [];
for (const d of readdirSync('.local', { withFileTypes: true }))
  if (d.isDirectory() && existsSync(join('.local', d.name, 'active.lock'))) locks.push(join('.local', d.name, 'active.lock'));
for (const name of ['envelope-constraints', 'native-constraints', 'completion-constraints', 'pinned-verification', 'verifier-compilation'])
  if (existsSync(join('.local/proof-workers', name + '.lock'))) locks.push(join('.local/proof-workers', name + '.lock'));
if (existsSync('/tmp/lianum-paeg-proof-host.lock')) locks.push('/tmp/lianum-paeg-proof-host.lock');
assert.deepEqual(locks, []);
const availableRAMBytes = Number(/MemAvailable:\s+(\d+)/.exec(readFileSync('/proc/meminfo', 'utf8'))[1]) * 1024;
const disk = statfsSync('.'), freeDiskBytes = disk.bavail * disk.bsize;
assert.ok(availableRAMBytes >= 2684354560); assert.ok(freeDiskBytes >= 5368709120);
const [anvilPath, anvilSHA256] = linuxRuntimePins.anvil;
assert.equal(hash(join('../../omnichain-product/.local/linux-runtimes', anvilPath)), anvilSHA256);
const sourcePins = manualWalletSourcePins();
const expected = JSON.parse(readFileSync(join(out, 'frozen-source-pins.json')));
assert.deepEqual(sourcePins, expected, 'MANUAL_WALLET_EXACT_INSTALLED_SOURCE_CLOSURE');
assert.equal(hash(join(out, 'frozen-source-pins.json')), release.sourcePinsSHA256);
const toolchain = verifyToolchain(), crs = verifyCRS();
const record = { format: 'LIANUM_MANUAL_WALLET_SDK_LAUNCH_V1', createdAt: new Date().toISOString(),
  oneExecutionOnly: true, entry: 'integration/run-manual-wallet-acceptance.mjs',
  profile: release.profile, environment: process.env, checkpoint,
  policySHA256: hash(policy), disabledPolicySHA256: policyPins.disabledSHA256,
  frozenSourcePinsSHA256: hash(join(out, 'frozen-source-pins.json')), sourceFiles: sourcePins.local.length,
  node: { path: realpathSync(process.execPath), version: process.version, sha256: hash(process.execPath) },
  locks, resources: { availableRAMBytes, freeDiskBytes },
  binaryPins: [{ role: 'anvil', path: anvilPath, sha256: anvilSHA256 }], toolchain, crs,
  requiredPath: { sourceDepositAtomic: '500', privatePayoutAtomic: '120', ownerChangeAtomic: '380',
    independentSolverUnderlyingAtomic: '100', privateSharesAtomic: '100', proofPackets: 15,
    manualExactSDKGraph: true, originalCatalogueGenerationCount: 1, generationBoundDeFiRedemption: true },
  realFunds: false, publicNetwork: false, oldFixtureRecovery: false };
writeFileSync(join(out, 'launch-checkpoint.json'), JSON.stringify(record, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
console.log(JSON.stringify({ checked: true, sourceFiles: record.sourceFiles, checkpointVersion: checkpoint.version,
  sourcePinsSHA256: record.frozenSourcePinsSHA256, binaryPins: 1 }));
