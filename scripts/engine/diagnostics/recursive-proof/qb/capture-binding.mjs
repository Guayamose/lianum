import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { H } from './wire.mjs';
const root = fileURLToPath(new URL('../../../../../experiments/', import.meta.url));
const read = p => readFileSync(resolve(root, p));
const program = JSON.parse(read('experiments/pc5-proof-probe/.local/qb/circuit.json'));
const retained = JSON.parse(read('evidence/m8-qb-proof/circuit.json'));
for (const key of ['noir_version', 'abi', 'bytecode']) assert.deepEqual(program[key], retained[key]);
const entries = Object.values(program.file_map).filter(e => e.path.startsWith('/qb/'));
assert.deepEqual(entries.map(e => e.path).sort(), ['/qb/src/main.nr', '/qb/src/sha256.nr', '/qb/src/wire.nr']);
const sources = {};
for (const e of entries) {
  const path = 'experiments/pc5-proof-probe/qb/circuits/quote_binding/' + e.path.slice(4);
  const bytes = read(path); assert.equal(bytes.toString('utf8'), e.source, 'Compiler source map matches current source');
  sources[path] = H(bytes).toString('hex');
}
const record = {
  classification: 'RETAINED_COMPILER_SOURCE_MAP_AND_BYTECODE_COMPARISON_NOT_COMPILER_CORRECTNESS_PROOF',
  noirVersion: program.noir_version,
  sourceSHA256: sources,
  bytecodeSHA256: H(Buffer.from(program.bytecode, 'base64')).toString('hex'),
  retainedCircuitSHA256: H(read('evidence/m8-qb-proof/circuit.json')).toString('hex'),
  packageLockSHA256: H(read('experiments/pc5-proof-probe/package-lock.json')).toString('hex'),
  notes: 'Read-only comparison with the existing compiler artifact; no recompile or new proof. Private working compiler debug output is not exported.',
};
writeFileSync(resolve(root, 'evidence/m8-qb-compilation-binding.json'), JSON.stringify(record, null, 2) + '\n');
console.log(JSON.stringify({ sourcesChecked: entries.length, bytecodeMatches: true, bytecodeSHA256: record.bytecodeSHA256 }));
