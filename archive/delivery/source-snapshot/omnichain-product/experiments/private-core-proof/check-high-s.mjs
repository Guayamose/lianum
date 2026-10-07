// A fixture-specific parity/forced-true check; not a malicious-witness audit.
import assert from 'node:assert/strict';
import { Noir } from '@noir-lang/noir_js';
import { decompressWitnessStack } from '@noir-lang/acvm_js';
import { abiDecode } from '@noir-lang/noirc_abi';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { shaHex } from './encoding.mjs';
const root = fileURLToPath(new URL('.', import.meta.url));
globalThis.fetch = async () => { throw new Error('OFFLINE_ONLY'); };
const programBytes = readFileSync(root + '.local/compiled/official_vector.json');
const program = JSON.parse(programBytes);
const witness = readFileSync(root + '.local/official-high-s-false.witness.gz');
const decoded = abiDecode(program.abi, decompressWitnessStack(witness)[0].witness);
const input = decoded.inputs;
assert.equal(input.expected, false);
const noir = new Noir(program);
let error;
try { await noir.execute({ ...input, expected: true }); } catch (e) { error = e; }
assert.ok(error, 'High-S signature cannot satisfy expected=true in the witness solver');
assert.match(String(error.message), /Cannot satisfy constraint|Assertion failed/);
const result = { classification: 'OFFICIAL_HIGH_S_FIXTURE_FORCED_TRUE_WITNESS_REJECTED', circuitSHA256: shaHex(programBytes), witnessSHA256: shaHex(witness), input, forcedExpectedTrueError: String(error.message), scope: 'This exact retained fixture produced the separate expected=false proof. Only expected is public in that circuit, so an external verifier does not learn which private signature fixture was used. This is a locally observed backend/witness control, not universal equivalence or a malicious-witness audit.' };
writeFileSync(root + '../../evidence/m15-auth-high-s-control.json', JSON.stringify(result, null, 2) + '\n');
writeFileSync(root + '../../evidence/m15-auth-proof/vector-circuit.json', programBytes);
console.log(JSON.stringify({ classification: result.classification, forcedExpectedTrueRejected: true }));
