import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const parent = '2ec744945c04a1495a7a0c303a1b2a36477ac091';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const read = path => readFileSync(resolve(root, path));
const json = path => JSON.parse(read(path));
const git = (...args) => execFileSync('git', args, { cwd: root });
const child = json('evidence/m7-proof-probe/results.json');
const recursive = json('evidence/m7-recursive-probe/attempt-32768.json');
const wrong = json('evidence/m7-recursive-probe/wrong-key-child.json');
const retained = json('evidence/m7-retained-verification.json');
const witnesses = json('evidence/m7-witness-checks.json');
const packages = json('evidence/m7-package-provenance.json');

assert.equal(child.proofsGenerated, 2);
assert.ok(child.cases.every(c => c.verified && Object.values(c.mutations).every(m => m.accepted === false)));
assert.equal(recursive.phase, 'completed');
assert.equal(recursive.outerVerified, true);
for (const name of ['substitutedChildProof', 'changedPrivateChildStatement']) {
  const check = recursive.negativeCases.find(c => c.name === name);
  assert.equal(check?.witnessProduced, true);
  assert.equal(check.candidateProduced, true);
  assert.equal(check.candidateVerified, false);
  assert.equal(check.rejectedAt, 'actual-outer-verifier');
}
assert.equal(wrong.phase, 'completed');
assert.equal(wrong.outerRejected, true);
assert.equal(wrong.unapprovedChildVerifiedUnderOwnKey, true);
assert.equal(wrong.rejectionStage, 'actual-outer-verifier-returned-false');
assert.equal(retained.privateWitnessLoaded, false);
assert.equal(retained.proofsGenerated, 0);
for (const name of ['retained-child-0', 'retained-child-1', 'retained-outer', 'retained-unapproved-child-control']) assert.equal(retained.checks.find(c => c.name === name)?.verified, true);
for (const name of ['retained-invalid-substitutedChildProof', 'retained-invalid-changedPrivateChildStatement', 'retained-invalid-unapproved-child']) assert.equal(retained.checks.find(c => c.name === name)?.verified, false);
assert.equal(witnesses.positive.length, 2);
assert.equal(witnesses.negative.length, 10);
assert.ok(witnesses.negative.every(c => c.rejected && c.message === 'Cannot satisfy constraint'));
assert.equal(packages.packageLockSHA256, sha(read('experiments/pc5-proof-probe/package-lock.json')));
assert.equal(packages.ignoreScripts, true);
assert.equal(packages.packages.filter(p => p.installed).length, 12);
for (const circuit of json('evidence/m7-circuit-stats.json').circuits) {
  assert.equal(sha(read(`experiments/pc5-proof-probe/circuits/${circuit.name}/src/main.nr`)), circuit.sourceSHA256);
  assert.equal(circuit.disableZk, false);
  assert.equal(circuit.oracleHashType, circuit.name === 'recursive_join' ? 'keccak' : 'poseidon2');
  if (circuit.name !== 'wrong_key') {
    const dir = circuit.name === 'recursive_join' ? 'm7-recursive-probe' : 'm7-proof-probe';
    assert.equal(sha(Buffer.from(json(`evidence/${dir}/circuit.json`).bytecode, 'base64')), circuit.bytecodeSHA256);
  }
}
const artifactHashes = {};
for (const [dir, report] of [['evidence/m7-proof-probe', child], ['evidence/m7-recursive-probe', recursive], ['evidence/m7-recursive-probe', wrong]]) {
  for (const [name, expected] of Object.entries(report.artifacts)) {
    assert.equal(basename(name), name);
    const path = dir + '/' + name, bytes = read(path);
    assert.equal(bytes.length, expected.bytes, path);
    assert.equal(sha(bytes), expected.sha256, path);
    artifactHashes[path] = expected.sha256;
  }
}
assert.equal(sha(Buffer.from(json('evidence/m7-recursive-probe/circuit.json').bytecode, 'base64')), recursive.compiledCircuitSHA256);
assert.equal(sha(read('experiments/pc5-proof-probe/circuits/recursive_join/src/main.nr')), recursive.sourceSHA256);
assert.equal(sha(read('experiments/pc5-proof-probe/circuits/recursive_join/src/approved_vk.nr')), recursive.pinnedKeySourceSHA256);
for (const record of json('experiments/pc5-proof-probe/vendor/provenance.json').records) assert.equal(sha(read('experiments/pc5-proof-probe/' + record.target)), record.sha256);

const historicalPaths = git('ls-tree', '-r', '--name-only', parent, 'evidence').toString().trim().split('\n');
assert.equal(historicalPaths.length, 29);
for (const path of historicalPaths) {
  // Windows checkouts can use CRLF while Git stores LF. Compare canonical Git
  // objects under the repository's declared attributes, without rewriting any
  // historical file. The export then compares actual archived bytes directly.
  const currentBlob = git('hash-object', '--path', path, path).toString().trim();
  const originalBlob = git('rev-parse', `${parent}:${path}`).toString().trim();
  assert.equal(currentBlob, originalBlob, path);
}
const sourceSHA256 = {};
function sources(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.local'].includes(entry.name)) continue;
    const path = resolve(dir, entry.name);
    if (entry.isDirectory()) sources(path);
    else sourceSHA256[relative(root, path).replaceAll('\\', '/')] = sha(readFileSync(path));
  }
}
sources(resolve(root, 'experiments/pc5-proof-probe'));
sourceSHA256['scripts/audit-m7-evidence.mjs'] = sha(read('scripts/audit-m7-evidence.mjs'));
const report = {
  classification: 'AUDITED_REAL_LOCAL_PROOF_CAPABILITY_EVIDENCE_NOT_PC5_OR_PRODUCTION',
  parentCommit: parent, historicalEvidenceUnchanged: historicalPaths,
  historicalComparison: 'Canonical Git blob equality under declared attributes; Windows CRLF working copies are not rewritten. Export verifies archived historical bytes exactly.',
  validProofsForIntendedCircuits: 3, validUnapprovedCircuitControlProofs: 1,
  invalidOuterCandidatesGeneratedAndRejected: 3,
  validProofsFreshlyReverifiedWithoutPrivateWitness: 4,
  witnessConstraintChecks: { accepted: 2, rejected: 10, proofVerification: false },
  fullWalletTestSuiteRerun: false, historicalFullSuite: { milestone: 'M6', passed: 221 },
  scope: 'M6 gates 1/2 bounded cryptographic interface; no complete PC5 relation or native chain integration',
  sourceSHA256, artifactHashes,
};
writeFileSync(resolve(root, 'evidence/m7-audit.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ historicalEvidenceUnchanged: historicalPaths.length, sourceFiles: Object.keys(sourceSHA256).length, proofArtifactHashes: Object.keys(artifactHashes).length, validIntendedProofs: 3, rejectedInvalidOuterCandidates: 3 }));
