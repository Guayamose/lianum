import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, relative, dirname, isAbsolute, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url)), parent = '15feb11a9aa13c9aa26b7f88ee170e05631d2aa7';
const git = (...args) => execFileSync('git', args, { cwd: root });
const read = p => readFileSync(resolve(root, p)), sha = b => createHash('sha256').update(b).digest('hex');
const canonical = p => ['.bin', '.png'].includes(extname(p)) ? read(p) : Buffer.from(read(p).toString('utf8').replaceAll('\r\n', '\n'));
const tap = read('evidence/m12-tests.tap').toString();
for (const re of [/^1\.\.287$/m, /^# pass 287$/m, /^# fail 0$/m, /^# skipped 0$/m, /^# cancelled 0$/m]) assert.match(tap, re);
assert.equal((tap.match(/^ok \d+ - /gm) || []).length, 287); assert.doesNotMatch(tap, /^not ok /m);
for (const name of ['rejected eligibility still persists adverse Bitcoin facts', 'Bitcoin observation persistence failure cannot return eligible facts']) assert.ok(tap.includes(name), name);
const probe = JSON.parse(read('evidence/m12-directory-probe.json')), feasibility = JSON.parse(read('evidence/m12-feasibility.json'));
assert.equal(probe.phase, 'completed'); assert.equal(probe.commands.length, 3); assert.ok(probe.commands.every(c => c.exitCode === 0));
assert.equal(probe.result.ordinaryDirectoryOpenError, 5); assert.equal(probe.result.directoryOpenWithRequiredFlag, true);
assert.equal(probe.result.privilegeOrAclCalls, false); assert.equal(probe.result.readonlyAttributeUnchanged, true);
assert.equal(sha(read('experiments/agave-windows-directory-probe/directory_open.rs')), probe.sourceSHA256);
assert.equal(sha(read('experiments/agave-windows-directory-probe/agave-v4.3.0-directory-open.patch')), feasibility.proposalSHA256);
assert.equal(feasibility.blockedSourceAcquisition.vendorSourceArchiveDownloaded, false); assert.equal(feasibility.blockedSourceAcquisition.sourceCopyPatched, false);
assert.equal(feasibility.blockedSourceAcquisition.fullBuildStarted, false); assert.equal(feasibility.solanaRetried, false);
const history = git('ls-tree', '-r', '--name-only', parent, 'evidence').toString().trim().split('\n');
for (const p of history) assert.equal(git('hash-object', '--path', p, p).toString().trim(), git('rev-parse', `${parent}:${p}`).toString().trim(), p);
const previous = JSON.parse(git('show', `${parent}:evidence/m11-audit.json`).toString());
for (const [p, digest] of Object.entries({ ...previous.sourceSHA256, ...previous.evidenceSHA256 })) assert.equal(sha(git('show', `${parent}:${p}`)), digest, 'Historical M11 ' + p);
const sourceSHA256 = {};
for (const p of git('ls-files', '--cached', '--others', '--exclude-standard', '-z').toString().split('\0').filter(Boolean)) if (!p.startsWith('evidence/')) sourceSHA256[p] = sha(canonical(p));
const evidenceSHA256 = Object.fromEntries(['evidence/m12-tests.tap', 'evidence/m12-directory-probe.json', 'evidence/m12-feasibility.json'].map(p => [p, sha(canonical(p))]));
const report = { classification: 'M12_ACTUAL_WINDOWS_API_PROBE_AND_SCRIPTED_OBSERVATION_RETENTION_NOT_AGAVE_RUNTIME', parentCommit: parent,
  rootTestsPassed: 287, newObservationRetentionRegressions: 2, focusedTestsPassed: 18, stdOnlyWindowsProbeCompiledAndExecuted: true,
  agaveSourceDownloaded: false, agavePatchApplied: false, agaveBuildStarted: false, solanaRetried: false, solanaTransactions: 0,
  nativeNodesStarted: 0, newProofsGenerated: 0, browserSessions: 0, securityOrAclChanges: false, privateTripleAccepted: false,
  historicalEvidenceUnchanged: history, sourceSHA256, evidenceSHA256,
  limitations: ['Directory flag behavior verified on fresh owned Windows fixtures; no full hardened-unpack or Agave genesis test.',
    'Official source acquisition stopped at socket permission denial 10013; no retry or alternate route.',
    'Vendor hash and toolchain/permission findings recorded in feasibility evidence; no host-wide dependency completeness claim.',
    'Adverse-fact retention uses scripted RPC and persistence callbacks; no native payout attack or heavy proof rerun.'] };
const output = resolve(root, process.argv[2] || '.local/m12-audit-current.json'), within = relative(root, output);
assert.ok(within && !isAbsolute(within) && !within.split(/[\\/]/).includes('..'));
mkdirSync(dirname(output), { recursive: true }); writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ testsPassed: 287, newRetentionRegressions: 2, historicalEvidencePreserved: history.length, sourceFiles: Object.keys(sourceSHA256).length, actualWindowsDirectoryProbe: true, solanaRetried: false }));
