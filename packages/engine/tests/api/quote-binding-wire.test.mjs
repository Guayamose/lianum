import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { schemas, decode, encode, u64, publicInputs, H } from '../../../../scripts/engine/diagnostics/recursive-proof/qb/wire.mjs';

import { fixtures as originalSyntheticFixtures } from '../../../../scripts/engine/diagnostics/recursive-proof/qb/fixtures.mjs';
const root = fileURLToPath(new URL('../../../../', import.meta.url));
// New public synthetic vectors from the original emitter. No historical m8
// result, proof, verifier acceptance or authorization is claimed.
const generated = originalSyntheticFixtures();
const text = JSON.stringify({
  classification: 'PUBLIC_SYNTHETIC_CANONICAL_WIRE_FIXTURES_NOT_AUTHORIZATION',
  menuHex: generated.menu.toString('hex'), resultSaltHex: generated.resultSalt.toString('hex'),
  menuBinding: H(generated.menu).toString('hex'),
  schemas: Object.fromEntries(Object.entries(schemas).map(([name, value]) => [name,
    { tag: value.tag, fields: value.fields, offsets: value.offsets, bytes: value.length }])),
  branches: generated.branches.map(value => ({ branch: value.branch, amounts: value.amounts,
    legSHex: value.legS.toString('hex'), legBHex: value.legB.toString('hex'),
    statementHex: value.statement.toString('hex'),
    commitments: { C_S: H(value.legS).toString('hex'), C_B: H(value.legB).toString('hex') } })),
}, (_, value) => typeof value === 'bigint' ? value.toString() : value);
const fixture = JSON.parse(text), raw = Buffer.from(fixture.branches[0].legBHex, 'hex');
test('canonical byte records round trip and expose exactly 161 byte-valued public inputs', () => {
  for (const branch of fixture.branches) {
    for (const [name, field] of [['legS', 'legSHex'], ['legB', 'legBHex'], ['statement', 'statementHex']]) {
      const bytes = Buffer.from(branch[field], 'hex'); assert.deepEqual(encode(name, decode(name, bytes)), bytes);
    }
    const pi = publicInputs(Buffer.from(branch.statementHex, 'hex'));
    assert.equal(pi.length, 161); assert.ok(pi.every(v => BigInt(v) <= 255n));
  }
});
for (const [name, mutate] of [
  ['truncation', b => b.subarray(0, -1)],
  ['trailing bytes', b => Buffer.concat([b, Buffer.from([0])])],
  ['tag alias', b => { b[3] ^= 1; return b; }],
  ['field length alias', b => { b.writeUInt32BE(31, schemas.legB.offsets.scope - 4); return b; }],
  ['version alias', b => { b[schemas.legB.offsets.version + 1] = 2; return b; }],
  ['role alias', b => { b[schemas.legB.offsets.role] = 1; return b; }],
  ['branch alias', b => { b[schemas.legB.offsets.branch] = 2; return b; }],
  ['parent rule alias', b => { b[schemas.legB.offsets.parentRule] = 0; return b; }],
]) test(`wire rejects ${name}`, () => assert.throws(() => decode('legB', mutate(Buffer.from(raw)))));
test('encoding rejects unknown or missing fields and non-u64 inputs', () => {
  const fields = decode('legB', raw);
  assert.throws(() => encode('legB', { ...fields, extra: Buffer.alloc(0) }));
  delete fields.scope; assert.throws(() => encode('legB', fields));
  for (const n of [-1n, 1n << 64n, 1, '1']) assert.throws(() => u64(n));
});
function pythonCheck(contents, expectedError) {
  const dir = mkdtempSync(resolve(tmpdir(), 'paeg-qb-wire-'));
  try {
    const path = resolve(dir, 'fixture.json'); writeFileSync(path, contents);
    const result = spawnSync('python3', ['-B', '-O', fileURLToPath(new URL('../helpers/qb-wire-check-v1.py', import.meta.url)), path], { cwd: root, encoding: 'utf8', timeout: 10000 });
    assert.equal(result.error, undefined); assert.equal(result.signal, null);
    if (expectedError) { assert.equal(result.status, 1); assert.match(result.stderr, expectedError); assert.equal(result.stdout, ''); }
    else { assert.equal(result.status, 0, result.stderr); assert.deepEqual(JSON.parse(result.stdout).branchesChecked, [0, 1]); }
  } finally {
    assert.equal(dirname(resolve(dir)), resolve(tmpdir())); assert.ok(basename(dir).startsWith('paeg-qb-wire-'));
    rmSync(dir, { recursive: true, force: true });
  }
}
test('independent Python accepts canonical fixture with assertions disabled', () => pythonCheck(text));
for (const [name, mutate, error] of [
  ['boolean branch alias', d => { d.branches[1].branch = true; }, /exact branches/],
  ['duplicate branch', d => { d.branches[1].branch = 0; }, /exact branches/],
  ['boolean width alias', d => { d.schemas.menu.fields.at(-1)[1] = true; }, /integer schema widths/],
  ['arithmetic tampering', d => { d.branches[0].amounts.K = '168751'; }, /independent arithmetic/],
  ['unknown top-level field', d => { d.extra = true; }, /fixture fields/],
]) test(`independent Python rejects ${name}`, () => { const d = structuredClone(fixture); mutate(d); pythonCheck(JSON.stringify(d), error); });
test('independent Python rejects duplicate decoded JSON keys', () => pythonCheck(text.replace('"menuBinding":', '"menuBinding":"invalid","menuBinding":'), /duplicate JSON key/));
