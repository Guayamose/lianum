/** Private application helpers for the already pinned flat proof roles.
 * No root key, caller path/backend, compilation or key generation. U stays in
 * the owner process. A result remains a proof, not permission to send funds.
 */
import assert from 'node:assert/strict';
import { relation } from '../catalog.mjs';
import { FIELD_MODULUS } from '@lianum/components/encoding/statements';
import { loadPinned, resourceModuleURL, circuitIdentity, versionDirectory, loadCompiled, hash } from './tooling.mjs';

export async function loadFlatABI(name) {
  const spec = relation(name), helpers = await import(resourceModuleURL), toolchain = helpers.verifyToolchain();
  const identity = circuitIdentity(spec, toolchain), sourceVersion = hash(JSON.stringify(identity));
  const compiled = await loadCompiled({ spec, identity, sourceVersion, toolchain,
    directory: versionDirectory(spec, sourceVersion) });
  return structuredClone(compiled.program.abi);
}

export async function withFlatHash(work) {
  assert.equal(typeof work, 'function', 'FLAT_HASH_PRIVATE_WORK');
  const helpers = await import(resourceModuleURL); helpers.verifyToolchain();
  const bb = await loadPinned('@aztec/bb.js'); let backend;
  try {
    backend = await bb.Barretenberg.new({ backend: bb.BackendType.Wasm, threads: 1,
      skipSrsInit: true, memory: { initial: 37, maximum: 32768 } });
    return await work(async fields => {
      assert.ok(Array.isArray(fields) && fields.length > 0 && fields.length <= 137, 'FLAT_HASH_WIDTH');
      const inputs = fields.map(value => {
        assert.ok(typeof value === 'bigint' && value >= 0n && value < FIELD_MODULUS, 'FLAT_HASH_FIELD');
        return Buffer.from(value.toString(16).padStart(64, '0'), 'hex');
      });
      return Buffer.from((await backend.poseidon2Hash({ inputs })).hash).toString('hex');
    });
  } finally { await backend?.destroy(); }
}
