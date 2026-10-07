/** Scoped public-proof verification using the installed, source-pinned official
 * WASM backend and the actual generated relation keys. No witness/key override.
 * Call only inside an owned supervised role; dispose when its work is done. */
import assert from 'node:assert/strict';
import { types } from 'node:util';
import { PROFILE, SETTINGS, LIMITS, MEMORY, relation } from './catalog.mjs';
import { loadPinned, resourceModuleURL, verifierCRSModuleURL, regular, hash,
  circuitIdentity, versionDirectory, loadCompiled, loadPrepared, publicWords,
  verifierWords, verifyAPI, verifyVendor, resources, resourceFailure } from './tooling.mjs';

const ROLES = Object.freeze({
  dispatch: Object.freeze(['dependency', 'ready']),
  admission: Object.freeze(['dependency', 'ready', 'admission']),
  settlement: Object.freeze(['node', 'settlement']),
  reservation: Object.freeze(['authorization', 'reservation']),
  recovery: Object.freeze(['recovery']),
});
const owned = new WeakMap();

function exact(value, keys) {
  assert.ok(value && !types.isProxy(value) && Object.getPrototypeOf(value) === Object.prototype,
    'PINNED_VERIFY_RECORD');
  assert.deepEqual(Reflect.ownKeys(value).sort(), [...keys].sort(), 'PINNED_VERIFY_FIELDS');
  for (const key of keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    assert.ok(descriptor && Object.hasOwn(descriptor, 'value') && descriptor.enumerable,
      'PINNED_VERIFY_DATA_FIELDS');
  }
}
function currentResources() {
  const measured = resources(process.pid);
  const failure = resourceFailure(measured);
  assert.equal(failure, null, 'PINNED_VERIFY_RESOURCE_BOUND');
  return measured;
}
function normalizeRequest(request, allowed) {
  exact(request, ['relation', 'proof', 'publicInputs']);
  assert.ok(allowed.includes(request.relation), 'PINNED_VERIFY_ROLE_SCOPE');
  const spec = relation(request.relation);
  assert.equal(typeof request.proof, 'string', 'PINNED_VERIFY_HEX');
  assert.ok(request.proof.length > 0 && request.proof.length <= LIMITS.outputBytes * 2
    && request.proof.length % 64 === 0
    && /^[0-9a-f]+$/.exec(request.proof)?.[0] === request.proof, 'PINNED_VERIFY_HEX');
  assert.ok(Array.isArray(request.publicInputs) && !types.isProxy(request.publicInputs)
    && Object.getPrototypeOf(request.publicInputs) === Array.prototype
    && request.publicInputs.length === spec.publicWords, 'PINNED_VERIFY_PUBLIC_ARRAY');
  assert.equal(Reflect.ownKeys(request.publicInputs).length, spec.publicWords + 1, 'PINNED_VERIFY_DENSE_PUBLIC');
  for (let i = 0; i < spec.publicWords; i++) {
    const descriptor = Object.getOwnPropertyDescriptor(request.publicInputs, String(i));
    assert.ok(descriptor && Object.hasOwn(descriptor, 'value'), 'PINNED_VERIFY_PUBLIC_DATA');
    const value = descriptor.value;
    assert.ok(typeof value === 'string' && /^(0|[1-9][0-9]*)$/.exec(value)?.[0] === value,
      'PINNED_VERIFY_DECIMAL');
  }
  return { spec, proof: Buffer.from(request.proof, 'hex'), words: publicWords(spec, request.publicInputs) };
}

/** The constructor itself is a trusted bootstrap boundary. A plain object,
 * boolean-returning test verifier or capability for another role is rejected. */
export function assertPinnedVerifier(capability, role) {
  const state = owned.get(capability);
  assert.ok(state && state.role === role && !state.closed && !state.failed,
    'PINNED_VERIFY_OWNED_CAPABILITY');
}

export async function createPinnedVerifier(role) {
  assert.ok(typeof role === 'string' && Object.hasOwn(ROLES, role), 'PINNED_VERIFY_FIXED_ROLE');
  currentResources();
  const helpers = await import(resourceModuleURL);
  const toolchain = helpers.verifyToolchain();
  assert.equal(toolchain.barretenberg, '5.2.0', 'PINNED_VERIFY_BB_VERSION');
  const originalCRS = helpers.verifyCRS();
  assert.equal(originalCRS.points, LIMITS.provingCRSPoints, 'PINNED_VERIFY_FULL_CRS');
  const apiPins = verifyAPI(), vendorPins = verifyVendor(), entries = new Map();
  for (const name of ROLES[role]) {
    const spec = relation(name), identity = circuitIdentity(spec, toolchain);
    const sourceVersion = hash(JSON.stringify(identity));
    const context = { spec, toolchain, identity, sourceVersion, directory: versionDirectory(spec, sourceVersion) };
    const compiled = await loadCompiled(context);
    const prepared = await loadPrepared(context, compiled, originalCRS);
    entries.set(name, { context, compiled, prepared });
  }
  const bb = await loadPinned('@aztec/bb.js');
  let backend;
  const state = { role, closed: false, failed: false, busy: false };
  try {
    // skipSrsInit plus the verified local CRS prevents an implicit download.
    backend = await bb.Barretenberg.new({ backend: bb.BackendType.Wasm, threads: 1,
      skipSrsInit: true, memory: { initial: 37, maximum: MEMORY.standard } });
    const { initializePrivateVerifierCRS } = await import(verifierCRSModuleURL);
    await initializePrivateVerifierCRS(backend, bb.BN254_G1_GENERATOR,
      regular(helpers.CRS + 'bn254_g2.dat'));
    currentResources();
  } catch (error) {
    if (backend) await backend.destroy();
    throw error;
  }
  const verifier = new bb.UltraHonkVerifierBackend(backend);
  const capability = Object.create(null);
  async function verify(request) {
    assertPinnedVerifier(capability, role);
    assert.equal(state.busy, false, 'PINNED_VERIFY_SINGLE_JOB');
    const { spec, proof, words } = normalizeRequest(request, ROLES[role]);
    state.busy = true;
    try {
      currentResources();
      assert.deepEqual(verifyAPI(), apiPins, 'PINNED_VERIFY_API_CHANGED');
      assert.deepEqual(verifyVendor(), vendorPins, 'PINNED_VERIFY_VENDOR_CHANGED');
      const entry = entries.get(spec.name);
      assert.deepEqual(circuitIdentity(spec, helpers.verifyToolchain()), entry.context.identity,
        'PINNED_VERIFY_CIRCUIT_CHANGED');
      const live = await loadPrepared(entry.context, entry.compiled, originalCRS);
      assert.equal(live.manifestSHA256, entry.prepared.manifestSHA256, 'PINNED_VERIFY_KEY_CHANGED');
      const accepted = await verifier.verifyProof({ proof, publicInputs: verifierWords(spec, words),
        verificationKey: entry.prepared.key }, { verifierTarget: 'evm' });
      // False is a cryptographic refusal. Backend exceptions remain operational
      // errors, never an alleged successful verification or an expected false.
      assert.equal(accepted, true, 'PINNED_VERIFY_INVALID_PROOF');
      currentResources();
      return undefined;
    } catch (error) {
      // Malformed requests are rejected before entering here. After a backend
      // or pin/resource failure the whole capability is unusable until closed.
      state.failed = true; throw error;
    } finally { state.busy = false; }
  }
  async function dispose() {
    if (state.closed) return;
    assert.equal(state.busy, false, 'PINNED_VERIFY_DISPOSE_WHILE_BUSY');
    state.closed = true;
    try { await backend.destroy(); } finally { backend = undefined; entries.clear(); }
  }
  Object.defineProperties(capability, {
    verify: { value: verify }, dispose: { value: dispose },
    describe: { value: () => Object.freeze({ profile: PROFILE, role,
      relations: Object.freeze(ROLES[role].map(name => {
        const entry = entries.get(name);
        assert.ok(entry, 'PINNED_VERIFY_CLOSED');
        return Object.freeze({ relation: name, keySHA256: hash(entry.prepared.key),
          keyManifestSHA256: entry.prepared.manifestSHA256 });
      })) }) },
    toJSON: { value: () => { throw Error('PINNED_VERIFY_NOT_SERIALIZABLE'); } },
  });
  Object.freeze(capability); owned.set(capability, state); return capability;
}
