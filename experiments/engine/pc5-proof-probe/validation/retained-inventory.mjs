import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseStrictJSON } from '../proving/strict-json.mjs';

const childFiles = ['verification-key.bin', 'wrong-verification-key.bin', 'circuit.json', 'branch-0-proof.bin', 'branch-0-public-inputs.json', 'branch-1-proof.bin', 'branch-1-public-inputs.json'];
const outerFiles = ['verification-key.bin', 'proof.bin', 'public-inputs.json', 'circuit.json', 'substitutedChildProof-invalid-proof.bin', 'changedPrivateChildStatement-invalid-proof.bin'];
const wrongFiles = ['unapproved-child-proof.bin', 'unapproved-child-invalid-outer-proof.bin', 'unapproved-child-outer-public-inputs.json'];
export const expectedChecks = Object.freeze({
  'retained-child-0': true, 'retained-child-1': true, 'retained-outer': true,
  'changed-outer-public-input': false, 'retained-invalid-substitutedChildProof': false,
  'retained-invalid-changedPrivateChildStatement': false, 'retained-unapproved-child-control': true,
  'retained-invalid-unapproved-child': false,
});
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
function exactNames(actual, expected, label) {
  assert.equal(actual.length, expected.length, label + ' count');
  assert.equal(new Set(actual).size, actual.length, label + ' duplicates');
  assert.deepEqual([...actual].sort(), [...expected].sort(), label + ' names');
}
export function validateRetainedChecks(checks) {
  assert.ok(Array.isArray(checks));
  exactNames(checks.map(c => c.name), Object.keys(expectedChecks), 'verification checks');
  for (const check of checks) assert.equal(check.verified, expectedChecks[check.name], check.name);
}
export function loadRetainedInventory(evidence) {
  const childDir = resolve(evidence, 'm7-proof-probe'), outerDir = resolve(evidence, 'm7-recursive-probe');
  const json = (dir, name) => parseStrictJSON(readFileSync(resolve(dir, name), 'utf8'));
  exactNames(readdirSync(childDir), [...childFiles, 'results.json', 'recursive-preparation.json'], 'child directory');
  exactNames(readdirSync(outerDir), [...outerFiles, ...wrongFiles, 'attempt-32768.json', 'wrong-key-child.json'], 'outer directory');
  const child = json(childDir, 'results.json'), outer = json(outerDir, 'attempt-32768.json'), wrong = json(outerDir, 'wrong-key-child.json');
  assert.equal(child.proofsGenerated, 2);
  exactNames(child.cases.map(c => String(c.branch)), ['0', '1'], 'child cases');
  for (const c of child.cases) {
    assert.equal(c.verified, true);
    exactNames(Object.keys(c.mutations), ['changedPublicInput', 'tamperedProof', 'wrongVerificationKey'], 'child mutations');
  }
  assert.equal(outer.phase, 'completed'); assert.equal(outer.proofGenerated, true); assert.equal(outer.outerVerified, true);
  exactNames(outer.negativeCases.map(c => c.name), ['changedOuterPublicInput', 'substitutedChildProof', 'changedPrivateChildStatement', 'wrongApprovedVk'], 'outer cases');
  for (const name of ['substitutedChildProof', 'changedPrivateChildStatement']) {
    const c = outer.negativeCases.find(c => c.name === name);
    assert.equal(c.witnessProduced, true); assert.equal(c.candidateProduced, true); assert.equal(c.candidateVerified, false); assert.equal(c.rejectedAt, 'actual-outer-verifier');
  }
  assert.equal(wrong.phase, 'completed'); assert.equal(wrong.outerRejected, true);
  assert.equal(wrong.unapprovedChildVerifiedUnderOwnKey, true);
  assert.equal(wrong.outerCandidateProduced, true);
  const blobs = {};
  for (const [label, dir, report, names] of [['child', childDir, child, childFiles], ['outer', outerDir, outer, outerFiles], ['wrong', outerDir, wrong, wrongFiles]]) {
    exactNames(Object.keys(report.artifacts), names, label + ' artifacts');
    blobs[label] = {};
    for (const name of names) {
      const record = report.artifacts[name];
      exactNames(Object.keys(record), ['bytes', 'sha256'], 'artifact record');
      assert.ok(Number.isSafeInteger(record.bytes) && record.bytes > 0);
      assert.match(record.sha256, /^[a-f0-9]{64}$/);
      const bytes = readFileSync(resolve(dir, name));
      assert.equal(bytes.length, record.bytes, name); assert.equal(sha(bytes), record.sha256, name);
      blobs[label][name] = bytes;
    }
  }
  const inputs = (label, file, count) => {
    const values = parseStrictJSON(blobs[label][file].toString('utf8'));
    assert.ok(Array.isArray(values)); assert.equal(values.length, count);
    for (const value of values) assert.match(value, /^0x[0-9a-f]{64}$/);
    return values;
  };
  const childInputs = [inputs('child', 'branch-0-public-inputs.json', 11), inputs('child', 'branch-1-public-inputs.json', 11)];
  const outerInputs = inputs('outer', 'public-inputs.json', 1);
  const wrongInputs = inputs('wrong', 'unapproved-child-outer-public-inputs.json', 1);
  assert.deepEqual(wrongInputs, outerInputs);
  return { blobs, childInputs, outerInputs, wrongInputs };
}
