import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const commit = '49a592109ec4f18d79212b43d621891aaf36f7b6';
const base = `https://raw.githubusercontent.com/AztecProtocol/aztec-packages/${commit}/barretenberg/`;
const records = [];
const approvedHashes = {
  'noir/bb_proof_verification/src/lib.nr': '258cd5979844a2627688e6efcad07637b1e90624b3af77e0dc3e6ff45a9aa84c',
  LICENSE: '677540d945f4d7b296a885c1a08c0af3e53dcfe66f591c88c507d1a8c5cf1ea7',
};
for (const [source, target] of [
  ['noir/bb_proof_verification/src/lib.nr', 'circuits/recursive_join/src/bb_proof_verification.nr'],
  ['LICENSE', 'vendor/BARRETENBERG-LICENSE'],
]) {
  const response = await fetch(base + source, { redirect: 'error', signal: AbortSignal.timeout(30000) });
  assert.equal(response.status, 200);
  const data = Buffer.from(await response.arrayBuffer());
  assert.ok(data.length > 0 && data.length < 20000);
  assert.equal(createHash('sha256').update(data).digest('hex'), approvedHashes[source]);
  const targetPath = resolve(root, target);
  mkdirSync(resolve(targetPath, '..'), { recursive: true });
  writeFileSync(targetPath, data);
  records.push({ url: base + source, target, bytes: data.length, sha256: createHash('sha256').update(data).digest('hex') });
}
const result = { classification: 'PINNED_OFFICIAL_RECURSIVE_VERIFIER_SOURCE', commit, modified: false, license: 'Apache-2.0, copyright 2023 Spilsbury Holdings Ltd', records };
writeFileSync(resolve(root, 'vendor/provenance.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result));
