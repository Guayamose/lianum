import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, relative, dirname, isAbsolute, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const parent = '57546f9b6ea48cf9d0cb6d96525cf0d993a769ce';
const git = (...args) => execFileSync('git', args, { cwd: root });
const read = p => readFileSync(resolve(root, p));
const sha = b => createHash('sha256').update(b).digest('hex');
const canonical = p => ['.bin', '.png'].includes(extname(p)) ? read(p) : Buffer.from(read(p).toString('utf8').replaceAll('\r\n', '\n'));
const reportPaths = ['agave-source', 'agave-workspace', 'build-readiness', 'patched-helper-tests', 'patched-helper-tests-rust197', 'project-rust', 'rust-toolchain-plan'].map(n => `evidence/m13-${n}.json`);
const [source, workspace, readiness, helper194, helper197, rust, rustPlan] = reportPaths.map(p => JSON.parse(read(p)));
assert.equal(source.commit, '825efd18292aff6ffcf9daa0f7612f21b3531a72');
assert.equal(source.archiveSHA256, 'f1f1d7ccf6fc2946a42488d63a503c4a45862015fc326bbb055e0ae7c6c187d8');
assert.equal(source.archiveBytes, 5447637);
assert.equal(source.requiredRust, '1.97.1');
assert.equal(source.buildExecuted, false);
assert.equal(readiness.officialSourceCommit, source.commit);
assert.equal(readiness.officialSourceArchiveSHA256, source.archiveSHA256);
assert.equal(readiness.reviewedSandboxNetworkRetry.attemptsAfterAuthorization, 1);
assert.equal(readiness.reviewedSandboxNetworkRetry.succeeded, true);
assert.equal(readiness.reviewedSandboxNetworkRetry.windowsAdministratorElevationRequested, false);
assert.equal(readiness.reviewedSandboxNetworkRetry.firewallProxyAclChanges, false);
const patchHash = sha(read('experiments/agave-windows-directory-probe/agave-v4.3.0-directory-open.patch'));
for (const helper of [helper194, helper197]) {
  assert.equal(helper.phase, 'completed');
  assert.equal(helper.testsPassed, 7);
  assert.ok(helper.commands.every(c => c.exitCode === 0));
  assert.match(helper.commands.at(-1).stdout, /test result: ok\. 7 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out;/);
  assert.equal((helper.commands.at(-1).stdout.match(/^test tests::.+ \.\.\. ok$/gm) || []).length, 7);
  assert.equal(helper.patchSHA256, patchHash);
  assert.equal(helper.vendorOriginalSHA256, 'b14cbb7dc87bee04ad26ce6bf77e506c5a3839f1701ca0958eec91ef9ac6398d');
  assert.equal(helper.patchedModuleSHA256, '699c0c6576b8181e75b48b452a401a72a30d934078cfd4a7da4ebfce0849dfe8');
  assert.equal(helper.generatedHelperSourceSHA256, '20c485714e3a626ead106cbc43a5a89d09d35e35f68b01a2e54a1dc5bee8fa85');
  assert.equal(helper.allOtherVendorBytesUnchanged, true);
  assert.equal(helper.fullAgaveModuleTested, false);
  assert.equal(helper.genesisOrValidatorExecuted, false);
}
assert.match(helper197.compilerVersion, /^rustc 1\.97\.1 /);
assert.equal(rust.phase, 'completed');
assert.ok(rust.commands.every(c => c.exitCode === 0));
assert.equal(rust.verifiedManifestSHA256, rustPlan.manifestSHA256);
assert.equal(rustPlan.manifestSHA256, '03569b1886ceb5c05276b50c8431ab111de944cd6140fe1fa7d821dd8e0f29cf');
assert.deepEqual(rust.officialComponents, rustPlan.components);
assert.deepEqual(rust.installedBinarySHA256, readiness.projectToolchain.binarySHA256);
assert.equal(rust.globalConfigurationChanged, false);
assert.equal(rust.agaveBuildStarted, false);
assert.match(rust.commands[1].stdout, /^rustc 1\.97\.1 /);
assert.match(rust.commands[2].stdout, /^cargo 1\.97\.1 /);
assert.match(readiness.globalDefaultsAfterPreparation.rustc, /^rustc 1\.94\.0 /);
assert.match(readiness.globalDefaultsAfterPreparation.cargo, /^cargo 1\.94\.0 /);
assert.equal(workspace.commit, source.commit);
assert.equal(workspace.regularFilesVerified, 1830);
assert.equal(workspace.omittedSymlinks.length, 4);
assert.ok(workspace.omittedSymlinks.every(x => x.materialized === false));
assert.deepEqual(Object.keys(workspace.modified), ['snapshots/src/hardened_unpack.rs']);
assert.equal(workspace.modified['snapshots/src/hardened_unpack.rs'].customSHA256, helper197.patchedModuleSHA256);
for (const [name, field] of [['Cargo.lock', 'cargoLockUnchangedSHA256'], ['Cargo.toml', 'cargoManifestUnchangedSHA256']]) {
  assert.equal(workspace[field], source.selectedUnmodifiedFiles.find(x => x.path === name).sha256);
}
assert.equal(workspace.metadataCommand.exitCode, 0);
for (const arg of ['metadata', '--no-deps', '--offline', '--locked']) assert.ok(workspace.metadataCommand.args.includes(arg));
assert.equal(workspace.metadataSummary.workspacePackages, 125);
assert.deepEqual(workspace.metadataSummary.selectedBinaries.sort(), ['agave-validator', 'solana-genesis']);
for (const field of ['dependencyResolutionVerified', 'buildScriptsExecuted', 'fullBuildStarted', 'solanaExecuted']) assert.equal(workspace[field], false);
for (const field of ['officialPublishingScriptsExecuted', 'fullBuildStarted', 'solanaValidatorStarted', 'hostSecurityChanges', 'wslRetried', 'privateTripleAccepted']) assert.equal(readiness[field], false);
assert.equal(readiness.solanaTransactions, 0);
assert.equal(readiness.unresolvedBuildRequirements.length, 5);
const history = git('ls-tree', '-r', '--name-only', parent, 'evidence').toString().trim().split('\n');
assert.equal(history.length, 110);
for (const p of history) assert.equal(git('hash-object', '--path', p, p).toString().trim(), git('rev-parse', `${parent}:${p}`).toString().trim(), p);
const previous = JSON.parse(git('show', `${parent}:evidence/m12-audit.json`).toString());
assert.equal(previous.rootTestsPassed, 287);
for (const [p, digest] of Object.entries({ ...previous.sourceSHA256, ...previous.evidenceSHA256 })) assert.equal(sha(git('show', `${parent}:${p}`)), digest, 'Historical M12 ' + p);
const unchangedProductAndTestFiles = git('ls-tree', '-r', '--name-only', parent, 'src', 'client', 'contracts', 'sdk', 'test', 'tests', 'package.json', 'package-lock.json').toString().trim().split('\n');
assert.ok(unchangedProductAndTestFiles.length > 0);
for (const p of unchangedProductAndTestFiles) assert.equal(sha(canonical(p)), sha(git('show', `${parent}:${p}`)), 'Unchanged product/test ' + p);
const sourceSHA256 = {};
for (const p of git('ls-files', '--cached', '--others', '--exclude-standard', '-z').toString().split('\0').filter(Boolean)) if (!p.startsWith('evidence/')) sourceSHA256[p] = sha(canonical(p));
const evidenceSHA256 = Object.fromEntries(reportPaths.map(p => [p, sha(canonical(p))]));
const report = {
  classification: 'M13_ACTUAL_OFFICIAL_SOURCE_PATCH_HELPER_TESTS_AND_ISOLATED_COMPILER_PREPARATION_NOT_NATIVE_SOLANA', parentCommit: parent,
  reviewedSourceNetworkRetrySucceeded: true, agaveSourceDownloaded: true, agavePatchApplied: true, projectRustVersion: '1.97.1', globalRustVersionUnchanged: '1.94.0',
  helperTestsPerCompiler: 7, helperTestExecutionsPassed: 14, fullAgaveModuleTested: false, offlineWorkspaceMetadataPassed: true,
  historicalRootTestsPassed: 287, rootTestSuiteRerun: false, unchangedProductAndTestFiles,
  agaveBuildStarted: false, solanaRetried: false, solanaTransactions: 0, nativeNodesStarted: 0, newProofsGenerated: 0,
  browserSessions: 0, securityOrAclChanges: false, privateTripleAccepted: false,
  historicalEvidenceUnchanged: history, sourceSHA256, evidenceSHA256,
  limitations: ['Seven exact vendor helper tests ran under two compilers; no full hardened-unpack crate/genesis/validator verification.',
    'Offline --no-deps Cargo metadata validates manifest parsing only, not dependency closure or compilation.',
    'Four CI/net symlinks were recorded but omitted from the custom working copy; the original archive is preserved.',
    'Windows crossbeam delta, OpenSSL, protoc and libclang/native prerequisites remain to be prepared and verified.',
    'The 287 JavaScript tests are historical M12 results; product and test files are unchanged in M13.',
    'This audit checks retained evidence consistency and hashes; it is not an independent security review.']
};
const output = resolve(root, process.argv[2] || '.local/m13-audit-current.json'), within = relative(root, output);
assert.ok(within && !isAbsolute(within) && !within.split(/[\\/]/).includes('..'));
mkdirSync(dirname(output), { recursive: true }); writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ helperTestExecutionsPassed: 14, historicalRootTestsPassed: 287, rootTestSuiteRerun: false, historicalEvidencePreserved: history.length, unchangedProductAndTestFiles: unchangedProductAndTestFiles.length, sourceFiles: Object.keys(sourceSHA256).length, agaveBuildStarted: false }));
