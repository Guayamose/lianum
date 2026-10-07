import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, cpSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, dirname, basename } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadRetainedInventory, validateRetainedChecks, expectedChecks } from '../experiments/pc5-proof-probe/retained-inventory.mjs';
import { parseStrictJSON } from '../experiments/pc5-proof-probe/strict-json.mjs';
import { requireVerifierRejection } from '../experiments/pc5-proof-probe/verifier-negative.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
function fixture(run) {
  const dir = mkdtempSync(resolve(tmpdir(), 'paeg-m7-inventory-'));
  try {
    for (const name of ['m7-proof-probe', 'm7-recursive-probe']) cpSync(resolve(root, 'evidence', name), resolve(dir, name), { recursive: true });
    return run(dir);
  } finally {
    assert.equal(dirname(resolve(dir)), resolve(tmpdir()));
    assert.ok(basename(dir).startsWith('paeg-m7-inventory-'));
    rmSync(dir, { recursive: true, force: true });
  }
}
const edit = (dir, file, mutate) => { const path = resolve(dir, file), data = JSON.parse(readFileSync(path, 'utf8')); mutate(data); writeFileSync(path, JSON.stringify(data)); };
test('complete retained inventory accepts all required artifacts', () => { const r = loadRetainedInventory(resolve(root, 'evidence')); assert.equal(r.childInputs.length, 2); });
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
test('CLI fails nonzero without success output on missing outer material', () => fixture(dir => {
  rmSync(resolve(dir, 'm7-recursive-probe/proof.bin'));
  const result = spawnSync(process.execPath, [resolve(root, 'experiments/pc5-proof-probe/verify-retained.mjs'), dir, resolve(dir, 'result.json')], { encoding: 'utf8' });
  assert.notEqual(result.status, 0); assert.equal(result.stdout, '');
}));
