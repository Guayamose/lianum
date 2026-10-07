import assert from 'node:assert/strict';
import { Noir } from '@noir-lang/noir_js';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
globalThis.fetch = async () => { throw new Error('Witness checks are offline'); };
const program = JSON.parse(readFileSync(resolve(root, '../../evidence/m7-proof-probe/circuit.json')));
const noir = new Noir(program);
const result = { classification: 'CIRCUIT_WITNESS_CHECKS_NOT_PROOF_VERIFICATION', positive: [], negative: [], correction: 'Digest mutations are explicitly unsigned u32; the earlier JS XOR could become signed and reject at the ABI instead of the hash constraint.' };
for (const [branch, s] of [3000000n, 3500000n].entries()) {
  const salt = Array.from({ length: 24 }, (_, i) => i + branch * 32);
  const message = Buffer.alloc(32); message.writeBigUInt64BE(s); Buffer.from(salt).copy(message, 8);
  const digest = createHash('sha256').update(message).digest();
  const cost = (s + 9n) / 10n;
  const input = { s: String(s), salt, k: String((1000000n - 25000n - cost) / 4n), payout_s: String(cost + 10000n), payout_b: String(1000000n - cost - 10000n), digest: Array.from({ length: 8 }, (_, i) => digest.readUInt32BE(i * 4)) };
  await noir.execute(input);
  result.positive.push({ branch, accepted: true });
  const mutations = {
    wrongK: { ...input, k: String(BigInt(input.k) + 1n) },
    wrongUnsignedDigest: { ...input, digest: [(input.digest[0] ^ 1) >>> 0, ...input.digest.slice(1)] },
    nonMenuS: { ...input, s: '3000001' },
    wrongSalt: { ...input, salt: [input.salt[0] ^ 1, ...input.salt.slice(1)] },
    inflatedPayout: { ...input, payout_s: String(BigInt(input.payout_s) + 1n) },
  };
  for (const [name, candidate] of Object.entries(mutations)) {
    assert.ok(candidate.digest.every(word => Number.isInteger(word) && word >= 0 && word <= 0xffffffff));
    let error;
    try { await noir.execute(candidate); } catch (caught) { error = caught; }
    assert.ok(error, `Witness accepted ${name}`);
    result.negative.push({ branch, name, rejected: true, message: error.message });
  }
}
writeFileSync(resolve(root, '../../evidence/m7-witness-checks.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result));
