import assert from 'node:assert/strict';
import { join, resolve } from 'node:path';
import { readFileSync, realpathSync } from 'node:fs';
import { ROOT, LOCAL, CANDIDATE } from '../../../../packages/proofs/src/catalog.mjs';
import { assertID, regular, hash, replaceJSON } from '../../../../packages/proofs/src/tooling/tooling.mjs';
import { createPinnedVerifier, assertPinnedVerifier } from '../../../../packages/proofs/src/verification/pinned-verifier.mjs';
import { integrationSourcePins } from '../../runners/source-pins.mjs';

assert.equal(process.argv.length, 3, 'PINNED_CHECK_FIXED_ARGS');
const runId = assertID(process.argv[2]), attempt = join(LOCAL, 'pinned-verification', runId);
const args = readFileSync(`/proc/${process.ppid}/cmdline`, 'utf8').split('\0').filter(Boolean);
assert.equal(args.length, 2, 'PINNED_CHECK_PARENT_ARGS');
assert.equal(realpathSync(resolve(realpathSync(`/proc/${process.ppid}/cwd`), args[1])),
  join(ROOT, 'integration/run-pinned-verification.mjs'), 'PINNED_CHECK_PARENT');
const lock = JSON.parse(regular(join(LOCAL, 'pinned-verification.lock')));
assert.equal(lock.pid, process.ppid); assert.equal(lock.runId, runId);
const pins = integrationSourcePins('verification');
assert.deepEqual(pins, JSON.parse(regular(join(attempt, 'resources.json'))).sourcePins);
const result = { format: 'FLAT_PINNED_VERIFIER_BOUNDARY_V1', runId, phase: 'checking',
  startedAt: new Date().toISOString(), sourcePins: pins, proofRegenerated: false,
  classification: 'EXISTING_SYNTHETIC_NODE_PROOF_THROUGH_NEW_PINNED_ROLE_CAPABILITY', cases: [] };
const save = () => replaceJSON(join(attempt, 'result.json'), result);
let capability;
try {
  save();
  const proof = regular(join(CANDIDATE, '.local/component/attempts/prove-2/proof.bin'));
  assert.equal(hash(proof), 'bb3d26bbc55f861002e71038fa21b3c7ee26fdaae0b55b58576f2c004a35bd03');
  const publicInputs = JSON.parse(regular(join(CANDIDATE, '.local/component/attempts/prove-2/public-inputs.json')));
  result.proofSHA256 = hash(proof);
  assert.throws(() => assertPinnedVerifier({ verify() { return undefined; } }, 'settlement'),
    /PINNED_VERIFY_OWNED_CAPABILITY/);
  result.cases.push({ name: 'forged-host-verifier', rejected: true });
  capability = await createPinnedVerifier('settlement');
  assertPinnedVerifier(capability, 'settlement');
  assert.throws(() => assertPinnedVerifier(capability, 'dispatch'), /PINNED_VERIFY_OWNED_CAPABILITY/);
  assert.equal(await capability.verify({ relation: 'node', proof: proof.toString('hex'), publicInputs }), undefined);
  result.cases.push({ name: 'existing-genuine-proof', accepted: true }); save();
  await capability.dispose();
  assert.throws(() => assertPinnedVerifier(capability, 'settlement'), /PINNED_VERIFY_OWNED_CAPABILITY/);
  const changed = Buffer.from(proof), start = 28 * 32;
  let offset = start + 31;
  while (offset > start && changed[offset] === 0) offset--;
  changed[offset] ^= changed[offset] === 0 ? 1 : changed[offset] & -changed[offset];
  capability = await createPinnedVerifier('settlement');
  await assert.rejects(capability.verify({ relation: 'node', proof: changed.toString('hex'), publicInputs }),
    /PINNED_VERIFY_INVALID_PROOF/);
  result.cases.push({ name: 'altered-proof', rejectedByBackend: true }); save();
  await capability.dispose();
  capability = await createPinnedVerifier('settlement');
  const changedInputs = [...publicInputs], index = 7;
  changedInputs[index] = (BigInt(changedInputs[index]) ^ 1n).toString();
  await assert.rejects(capability.verify({ relation: 'node', proof: proof.toString('hex'), publicInputs: changedInputs }),
    /PINNED_VERIFY_INVALID_PROOF/);
  result.cases.push({ name: 'altered-public-word', rejectedByBackend: true });
  assert.deepEqual(integrationSourcePins('verification'), pins, 'PINNED_CHECK_SOURCE_CHANGED');
  result.phase = 'completed';
} catch (error) {
  result.phase = 'failed'; result.errorCode = String(error.message).match(/\b(?:PINNED|PW)_[A-Z0-9_]+\b/)?.[0]
    ?? 'PINNED_CHECK_FAILED'; process.exitCode = 1;
} finally {
  if (capability) await capability.dispose();
  result.completedAt = new Date().toISOString(); save();
}
