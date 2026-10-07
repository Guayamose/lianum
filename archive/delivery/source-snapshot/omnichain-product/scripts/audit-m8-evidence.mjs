import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, relative, dirname, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseStrictJSON } from '../experiments/pc5-proof-probe/strict-json.mjs';
import { loadRetainedInventory, validateRetainedChecks } from '../experiments/pc5-proof-probe/retained-inventory.mjs';
import { publicInputs } from '../experiments/pc5-proof-probe/qb/wire.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const parent = '1390a30620d85f1500bc1b0c711da0a7d97ba549';
const read = p => readFileSync(resolve(root, p));
const json = p => parseStrictJSON(read(p).toString('utf8'));
const sha = b => createHash('sha256').update(b).digest('hex');
const git = (...args) => execFileSync('git', args, { cwd: root });
const exact = (actual, expected) => assert.deepEqual([...actual].sort(), [...expected].sort());
const report = json('evidence/m8-qb-proof/results.json');
assert.equal(report.phase, 'completed'); assert.equal(report.zeroKnowledge, true);
assert.equal(report.mode, 'noir-recursive'); assert.equal(report.threads, 1);
assert.equal(report.wasmMaximumMiB, 2048); assert.equal(report.crsPoints, 131072);
assert.equal(report.noNewPackages, true);
const names = ['verification-key.bin', 'circuit.json', ...[0, 1].flatMap(j => [`branch-${j}-proof.bin`, `branch-${j}-statement.bin`, `branch-${j}-public-inputs.json`])];
exact(Object.keys(report.artifacts), names);
exact(readdirSync(resolve(root, 'evidence/m8-qb-proof')), [...names, 'results.json']);
for (const name of names) {
  const bytes = read('evidence/m8-qb-proof/' + name), expected = report.artifacts[name];
  assert.equal(bytes.length, expected.bytes); assert.equal(sha(bytes), expected.sha256, name);
}
assert.equal(report.cases.length, 2); exact(report.cases.map(c => c.branch), [0, 1]);
for (const c of report.cases) {
  assert.equal(typeof c.branch, 'number'); assert.equal(c.verified, true); assert.equal(c.replayVerifies, true);
  assert.equal(c.proofBytes, 14656); assert.equal(c.publicInputCount, 161);
  exact(Object.keys(c.mutations), ['scope', 'session', 'branch', 'menuBinding', 'SConstraint', 'BConstraint']);
  for (const m of Object.values(c.mutations)) {
    assert.equal(m.accepted, false); assert.equal(m.rejection, 'verifier-returned-false'); assert.equal(m.stage, 'actual-verifier');
  }
  assert.deepEqual(json(`evidence/m8-qb-proof/branch-${c.branch}-public-inputs.json`), publicInputs(read(`evidence/m8-qb-proof/branch-${c.branch}-statement.bin`)));
}
assert.equal(report.crossBranchSubstitution.accepted, false);
assert.equal(report.crossBranchSubstitution.rejection, 'verifier-returned-false');
const binding = json('evidence/m8-qb-compilation-binding.json'), circuit = json('evidence/m8-qb-proof/circuit.json');
assert.equal(binding.noirVersion, circuit.noir_version);
assert.equal(binding.retainedCircuitSHA256, sha(read('evidence/m8-qb-proof/circuit.json')));
assert.equal(binding.bytecodeSHA256, sha(Buffer.from(circuit.bytecode, 'base64')));
exact(Object.keys(binding.sourceSHA256), ['main.nr', 'wire.nr', 'sha256.nr'].map(n => 'experiments/pc5-proof-probe/qb/circuits/quote_binding/src/' + n));
for (const [p, h] of Object.entries(binding.sourceSHA256)) assert.equal(sha(read(p)), h, p);
const lockPath = 'experiments/pc5-proof-probe/package-lock.json';
assert.equal(binding.packageLockSHA256, sha(read(lockPath)));
assert.equal(binding.packageLockSHA256, json('evidence/m7-package-provenance.json').packageLockSHA256);
const lock = json(lockPath);
for (const [name, version] of [['@noir-lang/noir_wasm', '1.0.0-beta.25'], ['@noir-lang/noir_js', '1.0.0-beta.25'], ['@aztec/bb.js', '5.2.0']]) assert.equal(lock.packages['node_modules/' + name].version, version);
const stats = json('evidence/m8-qb-circuit-stats.json');
assert.equal(stats.numGates, 107006); assert.equal(stats.numGatesDyadic, 131072);
const witness = json('evidence/m8-qb-witness-checks.json');
assert.equal(witness.positive.length, 2); exact(witness.positive.map(c => c.branch), [0, 1]);
assert.ok(witness.positive.every(c => c.accepted === true));
assert.equal(witness.negative.length, 26); assert.equal(new Set(witness.negative.map(c => c.name)).size, 26);
assert.ok(witness.negative.every(c => c.rejected === true && c.publicCommitmentsRecomputed === true && c.stage === 'witness-constraint'));
const hashes = json('evidence/m8-sha256-vectors.json');
assert.equal(hashes.proofCount, 0); assert.equal(hashes.officialPositiveCount, 4); assert.equal(hashes.independentBoundaryCount, 9);
assert.equal(hashes.vectors.length, 13); assert.equal(hashes.negatives.length, 13);
assert.equal(hashes.vectors.filter(c => c.official === true).length, 4);
assert.ok(hashes.negatives.every(c => c.rejected === true && c.provenance === 'locally derived mutation; not an official negative vector'));
for (const v of hashes.vectors) assert.equal(sha(Buffer.from(v.messageHex, 'hex')), v.digest);
const fixtures = json('evidence/m8-qb-wire-fixtures.json');
const independent = parseStrictJSON(execFileSync('python', ['-B', 'scripts/verify-qb-fixtures.py'], { cwd: root, encoding: 'utf8' }));
assert.deepEqual(independent.branchesChecked, [0, 1]); assert.equal(independent.schemasChecked, 5);
assert.equal(independent.fixtureSHA256, sha(read('evidence/m8-qb-wire-fixtures.json')));
const roles = json('evidence/m8-qb-role-checks.json');
exact(roles.roles.map(r => r.role), ['E_S', 'P_S', 'E_B', 'P_B']);
assert.equal(new Set(roles.roles.map(r => r.processId)).size, 4);
assert.equal(roles.completePc5Capsule, false); assert.equal(roles.ownerOfflineClaimProved, false);
for (const r of roles.roles) {
  assert.equal(r.ownerWitnessLoaded, false); assert.equal(r.logicalFileSeparationOnly, true);
  exact(r.checks.map(c => c.branch), [0, 1]);
  const isS = r.role.endsWith('_S');
  const expectedNames = ['verification-key.bin', ...[0, 1].flatMap(j => [`branch-${j}-proof.bin`, `branch-${j}-statement.bin`, `branch-${j}-opening.bin`]), ...(isS ? ['result-salt.bin'] : [])];
  exact(r.applicationFilesRead.map(f => f.name), expectedNames);
  for (const f of r.applicationFilesRead) {
    const opening = /^branch-([01])-opening\.bin$/.exec(f.name);
    const bytes = opening ? Buffer.from(fixtures.branches[Number(opening[1])][isS ? 'legSHex' : 'legBHex'], 'hex')
      : f.name === 'result-salt.bin' ? Buffer.from(fixtures.resultSaltHex, 'hex') : read('evidence/m8-qb-proof/' + f.name);
    assert.equal(f.bytes, bytes.length); assert.equal(f.sha256, sha(bytes));
  }
  for (const c of r.checks) {
    assert.equal(c.proofVerified, true); assert.equal(c.ownOpeningMatched, true); assert.equal(c.actualEffectProved, false);
    assert.equal(c.exactStaticPredecessorChecked, !isS);
    const a = fixtures.branches[c.branch].amounts;
    assert.equal(c.ownAmount, isS ? a.S : a.K); assert.equal(c.ownConditionalPayout, isS ? a.PS : a.PB);
  }
}
exact(roles.negatives.map(c => c.name), ['tampered-own-opening', 'empty-branch-proof']);
assert.ok(roles.negatives.every(c => c.rejected === true));
loadRetainedInventory(resolve(root, 'evidence'));
const m7 = json('evidence/m8-m7-reverification.json'); validateRetainedChecks(m7.checks);
assert.equal(m7.privateWitnessLoaded, false); assert.equal(m7.proofsGenerated, 0);
const tap = read('evidence/m8-tests.tap').toString();
assert.match(tap, /^1\.\.34$/m); assert.match(tap, /^# pass 34$/m); assert.match(tap, /^# fail 0$/m);
assert.match(tap, /^# skipped 0$/m); assert.equal((tap.match(/^ok \d+ - /gm) || []).length, 34); assert.doesNotMatch(tap, /^not ok /m);
const history = git('ls-tree', '-r', '--name-only', parent, 'evidence').toString().trim().split('\n');
for (const p of history) assert.equal(git('hash-object', '--path', p, p).toString().trim(), git('rev-parse', `${parent}:${p}`).toString().trim(), p);
const sourceSHA256 = {}, evidenceSHA256 = {};
function sourceTree(dir) {
  for (const e of readdirSync(resolve(root, dir), { withFileTypes: true })) {
    assert.equal(e.isSymbolicLink(), false);
    if (e.isDirectory()) sourceTree(dir + '/' + e.name);
    else sourceSHA256[dir + '/' + e.name] = sha(read(dir + '/' + e.name));
  }
}
sourceTree('experiments/pc5-proof-probe/qb');
for (const p of ['prove.mjs', 'verify-retained.mjs', 'retained-inventory.mjs', 'strict-json.mjs', 'verifier-negative.mjs']) {
  const path = 'experiments/pc5-proof-probe/' + p; sourceSHA256[path] = sha(read(path));
}
for (const p of ['scripts/audit-m8-evidence.mjs', 'scripts/verify-qb-fixtures.py', 'test/retained-proof-harness.test.mjs', 'test/quote-binding-wire.test.mjs', 'docs/QUOTE-BINDING-SPEC-008.md', 'docs/PRIMITIVES-INVENTORY-008.md', 'docs/CHECKPOINT-M8.md']) sourceSHA256[p] = sha(read(p));
function evidenceTree(dir) {
  for (const e of readdirSync(resolve(root, dir), { withFileTypes: true })) {
    const p = dir + '/' + e.name;
    if (dir === 'evidence' && (!e.name.startsWith('m8-') || e.name === 'm8-audit.json')) continue;
    if (e.isDirectory()) evidenceTree(p); else evidenceSHA256[p] = sha(read(p));
  }
}
evidenceTree('evidence');
const result = {
  classification: 'AUDITED_SELECTED_BRANCH_APPLICATION_SUBRELATION_NOT_PC5_ACCEPTANCE',
  parentCommit: parent, historicalEvidenceUnchanged: history,
  historicalComparison: 'Canonical Git blobs under declared attributes; no historical evidence rewritten. Original M7 source hashes must be checked at the M7 commit.',
  relation: 'PC5-QB-1', actualProofsGenerated: 2, actualVerifierMutationRejections: 13,
  unchangedProofReplayAccepted: true, roleProcessCount: 4, roleProofChecks: 8,
  witnessConstraintChecks: { accepted: 2, rejected: 26, proofVerification: false },
  shaChecks: { officialPositive: 4, independentBoundary: 9, derivedNegative: 13, proofCount: 0 },
  targetedTestsPassed: 34, m7FreshVerificationChecks: 8, m7ProofsRegenerated: 0,
  independentWireChecker: independent, compilationBinding: binding,
  fullWalletTestSuiteRerun: false, nativeRuntimeRerun: false, fullPc5Accepted: false,
  historicalFullSuite: { milestone: 'M6', passed: 221 },
  sourceSHA256, evidenceSHA256,
};
const output = resolve(root, process.argv[2] || '.local/m8-audit-current.json');
const outputRelative = relative(root, output);
assert.ok(outputRelative && !isAbsolute(outputRelative) && !outputRelative.split(/[\\/]/).includes('..'), 'Output stays in project');
mkdirSync(dirname(output), { recursive: true }); writeFileSync(output, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ actualProofs: 2, verifierRejections: 13, roleChecks: 8, targetedTests: 34, historicalEvidencePreserved: history.length, sourceFilesHashed: Object.keys(sourceSHA256).length, evidenceFilesHashed: Object.keys(evidenceSHA256).length, pc5Accepted: false }));
