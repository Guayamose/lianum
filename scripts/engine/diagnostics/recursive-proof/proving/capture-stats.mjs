import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const circuits = [];
for (const name of ['arithmetic_sha256', 'wrong_key', 'recursive_join']) {
  const program = JSON.parse(readFileSync(resolve(root, '.local/compiled', name + '.json')));
  const stats = JSON.parse(readFileSync(resolve(root, '.local/compiled', name + '-stats.json')));
  const bytecodeSHA256 = sha(Buffer.from(program.bytecode, 'base64'));
  if (name !== 'wrong_key') {
    const dir = name === 'recursive_join' ? 'm7-recursive-probe' : 'm7-proof-probe';
    const retained = JSON.parse(readFileSync(resolve(root, '../../evidence', dir, 'circuit.json')));
    assert.equal(bytecodeSHA256, sha(Buffer.from(retained.bytecode, 'base64')));
  }
  circuits.push({ name, noirVersion: program.noir_version, oracleHashType: name === 'recursive_join' ? 'keccak' : 'poseidon2', disableZk: false, bytecodeSHA256, sourceSHA256: sha(readFileSync(resolve(root, 'circuits', name, 'src/main.nr'))), stats });
}
const result = { classification: 'ACTUAL_COMPILER_BACKEND_STATISTICS_NOT_PROOFS', recursiveStatsRecomputedForOuterKeccakMode: true, circuits };
writeFileSync(resolve(root, '../../evidence/m7-circuit-stats.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result));
