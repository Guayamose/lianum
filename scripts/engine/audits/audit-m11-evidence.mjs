import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, relative, dirname, isAbsolute, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url)), parent = '2c88f5128943c3e40ada90891895d07f318056af';
const git = (...args) => execFileSync('git', args, { cwd: root });
const read = p => readFileSync(resolve(root, p)), sha = b => createHash('sha256').update(b).digest('hex');
const canonical = p => ['.bin', '.png'].includes(extname(p)) ? read(p) : Buffer.from(read(p).toString('utf8').replaceAll('\r\n', '\n'));
const tap = read('evidence/m11-tests.tap').toString();
for (const re of [/^1\.\.285$/m, /^# pass 285$/m, /^# fail 0$/m, /^# skipped 0$/m, /^# cancelled 0$/m]) assert.match(tap, re);
assert.equal((tap.match(/^ok \d+ - /gm) || []).length, 285); assert.doesNotMatch(tap, /^not ok /m);
for (const name of ['deterministic reorg interleaving', 'changing tip is rejected', 'inconsistent headers are rejected', 'EVM terminal refresh and Bitcoin balance query']) assert.ok(tap.includes(name), name);
const history = git('ls-tree', '-r', '--name-only', parent, 'evidence').toString().trim().split('\n');
for (const p of history) assert.equal(git('hash-object', '--path', p, p).toString().trim(), git('rev-parse', `${parent}:${p}`).toString().trim(), p);
const previous = JSON.parse(git('show', `${parent}:evidence/m10-audit.json`).toString());
for (const [p, digest] of Object.entries({ ...previous.sourceSHA256, ...previous.evidenceSHA256 })) assert.equal(sha(git('show', `${parent}:${p}`)), digest, 'Historical M10 ' + p);
const sourceSHA256 = {};
for (const p of git('ls-files', '--cached', '--others', '--exclude-standard', '-z').toString().split('\0').filter(Boolean)) if (!p.startsWith('evidence/')) sourceSHA256[p] = sha(canonical(p));
const report = { classification: 'M11_DETERMINISTIC_RPC_REGRESSIONS_AND_STATIC_SOURCE_DIAGNOSIS_NOT_NATIVE_PAYOUT_ATTACK', parentCommit: parent,
  rootTestsPassed: 285, newObservationRegressionTests: 16, focusedTestsPassed: 28, nativeNodesStarted: 0, nativeTransactions: 0,
  solanaRetried: false, solanaValidatorStarted: false, solanaTransactions: 0, deniedScratchPathRead: false,
  privilegeOrSecurityChanges: false, wslRetried: false, browserSessions: 0, newProofsGenerated: 0,
  privateTripleAccepted: false, historicalEvidenceUnchanged: history, sourceSHA256,
  evidenceSHA256: { 'evidence/m11-tests.tap': sha(canonical('evidence/m11-tests.tap')) },
  diagnosis: { sourceDefect: 'Agave v4.3.0 snapshots/src/hardened_unpack.rs:262 opens extraction parent directory without required Windows directory flag',
    runtimeAttribution: 'Strong inference from preserved error and source path; no syscall trace or precise temporary basename retained',
    proposedCorrection: 'Windows-specific OpenOptions directory handle with FILE_FLAG_BACKUP_SEMANTICS, existing containment and ordinary privileges; not applied or executed' },
  limitations: ['Scripted RPC interleaving, not an executed native payout attack.', 'Bounded stable-tip/header checks are not atomic snapshots and do not prevent later reorganizations.',
    'M10 native/browser/proof evidence remains verified at its historical commit, not promoted to M11 runtime verification.', 'The unchanged ACK binds semantic manifest hash, not captured snapshot byte hash or future availability.'] };
const output = resolve(root, process.argv[2] || '.local/m11-audit-current.json'), within = relative(root, output);
assert.ok(within && !isAbsolute(within) && !within.split(/[\\/]/).includes('..'));
mkdirSync(dirname(output), { recursive: true }); writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ testsPassed: 285, newObservationRegressions: 16, historicalEvidencePreserved: history.length, sourceFiles: Object.keys(sourceSHA256).length, nativeNodesStarted: 0, solanaRetried: false }));
