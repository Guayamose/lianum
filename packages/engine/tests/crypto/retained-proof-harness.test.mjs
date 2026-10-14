import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, dirname, basename } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { loadRetainedInventory, validateRetainedChecks, expectedChecks } from '../../../../experiments/engine/pc5-proof-probe/validation/retained-inventory.mjs';
import { parseStrictJSON } from '../../../../experiments/engine/pc5-proof-probe/proving/strict-json.mjs';
import { requireVerifierRejection } from '../../../../experiments/engine/pc5-proof-probe/validation/verifier-negative.mjs';

/** Structural validation only. Every byte and report below is synthetic DATA.
 * Metadata's true/false cases exercise the parser; no verifier, proof issuer,
 * grant, historical M7 evidence, or cryptographic acceptance is involved. */
const reader = new URL('../../../../experiments/engine/pc5-proof-probe/validation/retained-inventory.mjs', import.meta.url);
const synthetic = 'SYNTHETIC_STRUCTURE_ONLY_NOT_VERIFIED';
function fixture(run) {
  const dir = mkdtempSync(resolve(tmpdir(), 'paeg-m7-inventory-'));
  const child = resolve(dir, 'm7-proof-probe'), outer = resolve(dir, 'm7-recursive-probe');
  mkdirSync(child); mkdirSync(outer);
  const word = '0x' + '00'.repeat(32);
  const artifacts = (directory, names) => Object.fromEntries(names.map(name => {
    const bytes = Buffer.from(name.endsWith('public-inputs.json')
      ? JSON.stringify(Array(name.startsWith('branch-') ? 11 : 1).fill(word))
      : synthetic + ':' + name);
    writeFileSync(resolve(directory, name), bytes);
    return [name, { bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') }];
  }));
  const childFiles = ['verification-key.bin','wrong-verification-key.bin','circuit.json','branch-0-proof.bin','branch-0-public-inputs.json','branch-1-proof.bin','branch-1-public-inputs.json'];
  const outerFiles = ['verification-key.bin','proof.bin','public-inputs.json','circuit.json','substitutedChildProof-invalid-proof.bin','changedPrivateChildStatement-invalid-proof.bin'];
  const wrongFiles = ['unapproved-child-proof.bin','unapproved-child-invalid-outer-proof.bin','unapproved-child-outer-public-inputs.json'];
  const writeJSON = (directory, name, value) => writeFileSync(resolve(directory, name), JSON.stringify(value));
  writeJSON(child, 'results.json', {classification:synthetic, proofsGenerated:2,
    cases:[0,1].map(branch=>({branch,verified:true,mutations:{changedPublicInput:false,tamperedProof:false,wrongVerificationKey:false}})),artifacts:artifacts(child,childFiles)});
  writeJSON(child, 'recursive-preparation.json', {classification:synthetic});
  writeJSON(outer, 'attempt-32768.json', {classification:synthetic, phase:'completed',proofGenerated:true,outerVerified:true,
    negativeCases:['changedOuterPublicInput','substitutedChildProof','changedPrivateChildStatement','wrongApprovedVk'].map(name=>({name,witnessProduced:true,candidateProduced:true,candidateVerified:false,rejectedAt:'actual-outer-verifier'})),artifacts:artifacts(outer,outerFiles)});
  writeJSON(outer, 'wrong-key-child.json', {classification:synthetic,phase:'completed',outerRejected:true,unapprovedChildVerifiedUnderOwnKey:true,outerCandidateProduced:true,artifacts:artifacts(outer,wrongFiles)});
  try { return run(dir); } finally {
    assert.equal(dirname(resolve(dir)), resolve(tmpdir()));
    assert.ok(basename(dir).startsWith('paeg-m7-inventory-'));
    rmSync(dir, { recursive:true, force:true });
  }
}
const edit = (dir, file, mutate) => { const path = resolve(dir, file), data = JSON.parse(readFileSync(path, 'utf8')); mutate(data); writeFileSync(path, JSON.stringify(data)); };
test('synthetic structural inventory validates exact artifact bytes without cryptographic acceptance', () => fixture(dir => { const r = loadRetainedInventory(dir); assert.equal(r.childInputs.length, 2); assert.ok(r.blobs.child['branch-0-proof.bin'].toString().startsWith(synthetic)); }));
for (const [name, mutate] of [
  ['missing outer report', dir => rmSync(resolve(dir, 'm7-recursive-probe/attempt-32768.json'))],
  ['missing outer proof', dir => rmSync(resolve(dir, 'm7-recursive-probe/proof.bin'))],
  ['missing negative proof', dir => rmSync(resolve(dir, 'm7-recursive-probe/substitutedChildProof-invalid-proof.bin'))],
  ['missing wrong-key report', dir => rmSync(resolve(dir, 'm7-recursive-probe/wrong-key-child.json'))],
  ['unexpected artifact file', dir => writeFileSync(resolve(dir, 'm7-recursive-probe/extra.bin'), 'x')],
  ['missing negative entry', dir => edit(dir, 'm7-recursive-probe/attempt-32768.json', r => { delete r.artifacts['substitutedChildProof-invalid-proof.bin']; })],
  ['unexpected artifact entry', dir => edit(dir, 'm7-recursive-probe/attempt-32768.json', r => { r.artifacts.extra = r.artifacts['proof.bin']; })],
  ['duplicate negative identity', dir => edit(dir, 'm7-recursive-probe/attempt-32768.json', r => { r.negativeCases[1] = r.negativeCases[0]; })],
  ['duplicate branch identity', dir => edit(dir, 'm7-proof-probe/results.json', r => { r.cases[1] = r.cases[0]; })],
  ['incomplete phase', dir => edit(dir, 'm7-recursive-probe/attempt-32768.json', r => { r.phase = 'outer-proof-generation'; })],
  ['tampered bytes', dir => { const p = resolve(dir, 'm7-recursive-probe/proof.bin'), b = readFileSync(p); b[0] ^= 1; writeFileSync(p, b); }],
  ['duplicate JSON artifact key', dir => { const p = resolve(dir, 'm7-recursive-probe/attempt-32768.json'); writeFileSync(p, readFileSync(p, 'utf8').replace('"phase":', '"phase":"completed","phase":')); }],
]) test(name + ' is rejected before proving/verifying', () => fixture(dir => { mutate(dir); assert.throws(() => loadRetainedInventory(dir)); }));
test('verification checks require exactly the eight names and outcomes', () => {
  const checks = Object.entries(expectedChecks).map(([name, verified]) => ({ name, verified }));
  validateRetainedChecks(checks);
  for (const bad of [checks.slice(1), [...checks, checks[0]], [...checks.slice(0, -1), checks[0]], [...checks.slice(0, -1), { name: 'unexpected', verified: false }], checks.map((c, i) => i ? c : { ...c, verified: false })]) assert.throws(() => validateRetainedChecks(bad));
});
test('strict JSON rejects duplicate decoded names at every depth', () => {
  for (const text of ['{"a":1,"a":2}', '{"x":{"a":1,"\\u0061":2}}', '[{"a":1,"a":2}]', '{"a":1,}', '[1,]', '{} {}']) assert.throws(() => parseStrictJSON(text));
  assert.deepEqual(parseStrictJSON('{"s":"escaped \\\" string","a":[true,null,1.5]}').a, [true, null, 1.5]);
});
test('negative classifier separates false and the pinned malformed-point error', async () => {
  assert.equal((await requireVerifierRejection(async () => false)).stage, 'actual-verifier');
  assert.equal((await requireVerifierRejection(async () => { throw new Error('Deserialized point is not on the curve'); }, { allowPinnedPointDecoderError: true })).stage, 'malformed-point-decoder');
  for (const error of ['out of memory', 'worker stopped', 'unknown backend error', 'Deserialized point is not on the curve: extra']) await assert.rejects(requireVerifierRejection(async () => { throw new Error(error); }, { allowPinnedPointDecoderError: true }));
  await assert.rejects(requireVerifierRejection(async () => { throw new Error('Deserialized point is not on the curve'); }));
  await assert.rejects(requireVerifierRejection(async () => true));
  await assert.rejects(requireVerifierRejection(async () => undefined));
});
test('structural preflight CLI rejects missing outer material without loading a verifier', () => fixture(dir => {
  rmSync(resolve(dir, 'm7-recursive-probe/proof.bin'));
  const code = `import {loadRetainedInventory} from ${JSON.stringify(reader.href)}; loadRetainedInventory(process.argv[1]);`;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', code, dir], {encoding:'utf8'});
  assert.notEqual(result.status, 0); assert.equal(result.stdout, ''); assert.match(result.stderr,/outer directory count/);
  assert.equal(result.stderr.includes('Barretenberg'),false);
}));
