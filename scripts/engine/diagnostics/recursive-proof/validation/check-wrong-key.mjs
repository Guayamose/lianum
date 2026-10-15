import { Noir } from '@noir-lang/noir_js';
import { deflattenFields } from '@aztec/bb.js';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { requireConstraintFailure } from './expected-constraint-failure.mjs';

const load = path => readFileSync(new URL(path, import.meta.url));
const circuit = load('.local/compiled/recursive_join.json');
const input = JSON.parse(load('.local/recursive-input.json'));
const key = load('../../evidence/m7-proof-probe/wrong-verification-key.bin');
input.vk = deflattenFields(key);
globalThis.fetch = async () => { throw new Error('Witness check must remain offline'); };
const cause = await requireConstraintFailure(() => new Noir(JSON.parse(circuit)).execute(input));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const report = { classification: 'ACTUAL_NOIR_WRONG_VK_WITNESS_CONSTRAINT_REJECTION_NOT_PROOF_VERIFICATION', phase: 'completed', cause, compiledCircuitSHA256: sha(circuit), wrongVerificationKeySHA256: sha(key), proofGenerated: false, oldEvidenceOverwritten: false };
writeFileSync(new URL('../../evidence/m9-wrong-key-witness.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report));
