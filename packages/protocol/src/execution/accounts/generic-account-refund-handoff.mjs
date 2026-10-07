/** HOST ONLY: owner-independent encrypted original-A0 handoff.
 *
 * INTEGRITY_AND_DURABILITY_ONLY. There is no proof verifier, RPC, prover,
 * transaction sender, signer, owner process, or native execution capability.
 * A0's nominally public 139-word tuple is PRIVATE intermediate proof material.
 * The private read/refundInputs capabilities must never reach a public journal,
 * HTTP response, export, or audit hook. Give those callers only publicView.
 *
 * One immutable operation per Vault. The surviving trusted keeper retains its
 * password and checkpoint independently of the owner child. The keeper must
 * implement atomic checkpoint CAS and authenticated readback. Losing it is not
 * supported recovery. Vault's cooperative locking/trusted local directory,
 * fsync/platform, rollback, and JS zeroization limitations still apply.
 *
 * Reuses existing codecs and read-only profile pin checks. Genuine proof
 * acceptance remains the existing refund prover and deployed F51 verifier.
 */
import { createHash, randomBytes } from 'node:crypto';
import { lstat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { types } from 'node:util';
import { Vault } from '../../crypto/vault.mjs';
import { canonical } from '../../crypto/privacy.mjs';
import { validateIdentity } from '../balances/generic-balance-custody.mjs';
import { encodePrivateProof, decodePrivateProof, loadProofProfile, wipePrivate }
  from '../proofs/proof-worker.mjs';
import { FUNDED_GRAPH_PROFILE, FUNDED_DOMAINS, fundedHash, fundedAdmission, fundedAuthorizationWords }
  from '../graph/funded-graph.mjs';
import { A0, digestHex, refundInputs as existingRefundInputs, publicWords }
  from '../../../../../experiments/protocol/private-core-proof/generic-wrappers/abi.mjs';

export const HANDOFF_SCHEMA = 'DRAFT_GENERIC_ACCOUNT_REFUND_HANDOFF_V1';
export const HANDOFF_CLASSIFICATION = 'INTEGRITY_AND_DURABILITY_ONLY';
const CHECKPOINT_SCHEMA = 'DRAFT_GENERIC_ACCOUNT_REFUND_CHECKPOINT_V1';
const ZERO = '0'.repeat(64);
const A0_DIGESTS = ['scope', 'policy', 'asset', 'operationId', 'inputCommitment', 'inputNullifier',
  'reservationIntent', 'graphCommitment', 'treeRoot', 'reserveCommitment', 'reserveNullifier', 'changeCommitment', 'recoveryCommitment'];
const TIMES = ['fundingNotBefore', 'fundingValidUntil', 'settleBefore'];
const clone = value => JSON.parse(canonical(value));
const sha = value => createHash('sha256').update(canonical(value)).digest('hex');
const same = (left, right) => canonical(left) === canonical(right);
const fail = suffix => { const code = 'REFUND_HANDOFF_' + suffix; throw Object.assign(new Error(code), { code }); };
const need = (condition, suffix) => { if (!condition) fail(suffix); };
const hex = value => need(typeof value === 'string' && /^[0-9a-f]{64}$/.test(value) && value !== ZERO, 'HASH');

function exact(value, required, optional = []) {
  need(value && !types.isProxy(value) && Object.getPrototypeOf(value) === Object.prototype, 'FIELDS');
  const descriptors = Object.getOwnPropertyDescriptors(value), keys = Reflect.ownKeys(descriptors);
  need(required.every(key => keys.includes(key)) && keys.every(key => [...required, ...optional].includes(key))
    && keys.every(key => descriptors[key].enumerable && Object.hasOwn(descriptors[key], 'value')), 'FIELDS');
}

/** Existing pin loader validates files/ABI/key provenance without starting Wasm.
 * No injected profile, VK, proof verifier, or boolean can substitute for it. */
function currentProfile() {
  const authorization = loadProofProfile('authorization'), refund = loadProofProfile('refund');
  need(authorization.target === 'noir-recursive' && refund.target === 'evm'
    && authorization.publicPins.statementWords === 139 && refund.publicPins.statementWords === 51,
  'PROFILE');
  need(authorization.publicPins.keySHA256 === refund.publicPins.ownerVerificationKeySHA256, 'PROFILE_KEY');
  return { fingerprint: sha({ profile: FUNDED_GRAPH_PROFILE.id,
    authorization: authorization.publicPins, refund: refund.publicPins }), vkFields: authorization.vkFields };
}

function checkedProof(authorization, profile) {
  exact(authorization, ['proof', 'publicInputs', 'proofFields', 'vkFields'], ['metrics']);
  need(!types.isProxy(authorization.proof) && authorization.proof instanceof Uint8Array, 'PROOF_BYTES');
  // Reject getters, non-JSON extras, sparse arrays, and noncanonical encodings.
  canonical({ publicInputs: authorization.publicInputs, proofFields: authorization.proofFields, vkFields: authorization.vkFields });
  const envelope = encodePrivateProof('authorization', authorization);
  const proof = decodePrivateProof('authorization', envelope);
  try {
    need(same(proof.vkFields, profile.vkFields), 'OWNER_KEY_CHANGED');
    need(proof.proof.length === 458 * 32, 'RECURSIVE_BYTES');
    for (let i = 0; i < 458; i++) {
      need(BigInt('0x' + proof.proof.subarray(i * 32, (i + 1) * 32).toString('hex')).toString() === proof.proofFields[i],
        'RECURSIVE_BYTES');
    }
    // Byte/field coherence is not proof validity. Synthetic non-proofs can pass.
    return envelope;
  } finally { wipePrivate(proof); }
}

function deriveBinding(identity, ownerOperationRef, envelope) {
  hex(ownerOperationRef);
  const a = envelope.publicInputs;
  const statement = { profile: FUNDED_GRAPH_PROFILE.id,
    ...Object.fromEntries(A0_DIGESTS.map(key => [key, digestHex(a.slice(A0[key], A0[key] + 8))])),
    outputs: Array.from({ length: 4 }, (_, i) => digestHex(a.slice(A0.outputs + i * 8, A0.outputs + (i + 1) * 8))),
    ...Object.fromEntries(TIMES.map(key => [key, a[A0[key]]])) };
  need(same(fundedAuthorizationWords(statement), a), 'A0_ENCODING');
  need(statement.scope === identity.scope && statement.policy === identity.policy
    && statement.asset === identity.asset.identity, 'A0_DOMAIN');
  const reserve = fundedHash(FUNDED_DOMAINS.reserve, [Buffer.from(FUNDED_GRAPH_PROFILE.id),
    ...['scope', 'policy', 'asset', 'reservationIntent', 'graphCommitment'].map(key => Buffer.from(statement[key], 'hex'))]);
  need(reserve === statement.reserveCommitment, 'A0_RESERVE');
  const commitments = ['inputCommitment', 'reserveCommitment', 'changeCommitment', 'recoveryCommitment']
    .map(key => statement[key]).concat(statement.outputs);
  need(new Set(commitments).size === commitments.length, 'A0_DISTINCT_COMMITMENTS');
  // The A0 tuple does not contain the hub. The trusted bootstrap's immutable
  // validated deployment identity binds hub/registry/pool/code/genesis/lifetime.
  return { profile: FUNDED_GRAPH_PROFILE.id, ownerOperationRef, identitySHA256: sha(identity),
    authorizationSHA256: sha(envelope),
    scope: identity.scope, policy: identity.policy, asset: identity.asset.identity,
    hubDomain: identity.hubDomain, registryCommitment: identity.registryCommitment,
    operationId: statement.operationId, fundingCommitment: statement.inputCommitment,
    inputNullifier: statement.inputNullifier, admissionTag: fundedAdmission(statement),
    reserveCommitment: statement.reserveCommitment, reserveNullifier: statement.reserveNullifier,
    changeCommitment: statement.changeCommitment, recoveryCommitment: statement.recoveryCommitment,
    ...Object.fromEntries(TIMES.map(key => [key, statement[key]])) };
}

/** PRIVATE helper to compare with the existing owner plan/prepared packet.
 * It establishes storage binding, never cryptographic acceptance or authority. */
export function deriveGenericRefundBinding({ identity, ownerOperationRef, authorization }) {
  const id = validateIdentity(identity), profile = currentProfile();
  const envelope = checkedProof(authorization, profile);
  try { return deriveBinding(id, ownerOperationRef, envelope); }
  finally { wipePrivate(envelope); }
}

function validateState(state, cfg, profile) {
  exact(state, ['schema', 'handoffId', 'identity', 'profileSHA256', 'entry']);
  need(state.schema === HANDOFF_SCHEMA, 'SCHEMA'); hex(state.handoffId);
  need(same(state.identity, cfg.identity), 'IDENTITY_CHANGED');
  need(state.profileSHA256 === profile.fingerprint, 'PROFILE_CHANGED');
  if (state.entry === null) return;
  exact(state.entry, ['ownerOperationRef', 'binding', 'authorization']);
  const proof = decodePrivateProof('authorization', state.entry.authorization);
  try {
    need(same(checkedProof(proof, profile), state.entry.authorization), 'PROOF_ENCODING');
    need(same(deriveBinding(cfg.identity, state.entry.ownerOperationRef, state.entry.authorization), state.entry.binding), 'BINDING_CHANGED');
  } finally { wipePrivate(proof); }
}

const recordDigest = record => ({ revision: record.revision, stateSHA256: sha(record.data) });
function checkpoint(record, pending = null) {
  const source = record ?? pending;
  return { schema: CHECKPOINT_SCHEMA, handoffId: source.data.handoffId,
    identitySHA256: sha(source.data.identity), profileSHA256: source.data.profileSHA256,
    acknowledged: record ? recordDigest(record) : null, pending: pending ? recordDigest(pending) : null };
}
function validateCheckpoint(cp, cfg, profile) {
  exact(cp, ['schema', 'handoffId', 'identitySHA256', 'profileSHA256', 'acknowledged', 'pending']);
  need(cp.schema === CHECKPOINT_SCHEMA, 'CHECKPOINT_SCHEMA'); hex(cp.handoffId);
  need(cp.identitySHA256 === sha(cfg.identity), 'CHECKPOINT_IDENTITY');
  need(cp.profileSHA256 === profile.fingerprint, 'CHECKPOINT_PROFILE');
  for (const digest of [cp.acknowledged, cp.pending]) if (digest !== null) {
    exact(digest, ['revision', 'stateSHA256']); hex(digest.stateSHA256);
    need(Number.isSafeInteger(digest.revision) && digest.revision >= 0, 'CHECKPOINT_REVISION');
  }
  need(cp.acknowledged !== null || cp.pending !== null, 'CHECKPOINT_EMPTY');
  if (cp.pending !== null) need(cp.pending.revision === (cp.acknowledged ? cp.acknowledged.revision + 1 : 0), 'CHECKPOINT_REVISION');
}
async function retainCheckpoint(keeper, expected, next) {
  // This is a trusted private storage protocol, not a cryptographic proof.
  // Conditional update prevents concurrent/stale handles from clobbering a
  // newer candidate/acknowledgement outside Vault's cooperative file lock.
  const wanted = clone(next);
  const response = await keeper.compareAndSwapCheckpoint({ expected: clone(expected), next: clone(next) });
  need(same(response, wanted), 'CHECKPOINT_ACK');
  need(same(await keeper.readCheckpoint(), wanted), 'CHECKPOINT_READBACK');
}
async function safePath(path, exists) {
  const directory = await lstat(dirname(path));
  need(directory.isDirectory() && !directory.isSymbolicLink()
    && (process.platform === 'win32' || (directory.mode & 0o077) === 0), 'PRIVATE_DIRECTORY');
  if (exists) {
    const file = await lstat(path);
    need(file.isFile() && !file.isSymbolicLink() && file.nlink === 1
      && (process.platform === 'win32' || (file.mode & 0o077) === 0), 'PRIVATE_FILE');
  }
}
async function stableRead(vault, password, path) {
  const noLock = async () => {
    try { await lstat(path + '.lock'); fail('LOCKED'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  };
  await safePath(path, true); await noLock();
  const record = await vault.read(password);
  await noLock();
  return record;
}

class RefundHandoff {
  #cfg; #profile; #vault; #keeper; #record; #pending = null;
  #fault = false; #busy = false; #closed = false;
  constructor(cfg, profile, vault, keeper, record) {
    this.#cfg = cfg; this.#profile = profile; this.#vault = vault;
    this.#keeper = keeper; this.#record = record;
    Object.freeze(this);
  }
  async #exclusive(work, recovery = false) {
    need(!this.#closed, 'CLOSED'); need(!this.#busy, 'BUSY');
    need(recovery || (!this.#fault && this.#pending === null), 'REOPEN_REQUIRED');
    this.#busy = true;
    try { return await work(); } finally { this.#busy = false; }
  }
  #profileUnchanged() {
    need(currentProfile().fingerprint === this.#profile.fingerprint, 'PROFILE_CHANGED');
  }
  async #authenticate() {
    try {
      this.#profileUnchanged();
      const actual = await stableRead(this.#vault, this.#cfg.password, this.#cfg.path);
      need(same(actual, this.#record), 'STORAGE_CHANGED');
      need(same(await this.#keeper.readCheckpoint(), checkpoint(this.#record)), 'KEEPER_CHANGED');
      validateState(actual.data, this.#cfg, this.#profile);
    } catch (error) { this.#fault = true; throw error; }
  }
  #entry(request) {
    exact(request, ['ownerOperationRef', 'binding']); canonical(request); hex(request.ownerOperationRef);
    const entry = this.#record.data.entry;
    need(entry !== null, 'ORIGINAL_A0_NOT_RETAINED');
    need(entry.ownerOperationRef === request.ownerOperationRef, 'REF_REBOUND');
    need(same(entry.binding, request.binding), 'BINDING_CHANGED');
    return entry;
  }
  #receipt() {
    return { schema: HANDOFF_SCHEMA, classification: HANDOFF_CLASSIFICATION,
      ownerOperationRef: this.#record.data.entry.ownerOperationRef, retained: true };
  }
  async #persist(next, expectedCheckpoint = checkpoint(this.#record)) {
    this.#pending = next;
    try {
      const pendingCheckpoint = checkpoint(this.#record, next);
      await retainCheckpoint(this.#keeper, expectedCheckpoint, pendingCheckpoint);
      const result = await this.#vault.update(this.#cfg.password, this.#record.revision, current => {
        need(same(current, this.#record.data), 'CAS_DATA'); return clone(next.data);
      });
      need(same(result, next), 'CAS_RESULT');
      need(same(await stableRead(this.#vault, this.#cfg.password, this.#cfg.path), next), 'READBACK');
      await retainCheckpoint(this.#keeper, pendingCheckpoint, checkpoint(next));
      this.#record = next; this.#pending = null;
    } catch { this.#fault = true; fail('WRITE_UNCERTAIN'); }
  }
  retain(input) {
    // Own the proof and binding synchronously, before awaiting storage/keeper.
    exact(input, ['ownerOperationRef', 'authorization', 'binding']);
    const authorization = checkedProof(input.authorization, this.#profile);
    const binding = clone(input.binding), ownerOperationRef = input.ownerOperationRef;
    need(same(deriveBinding(this.#cfg.identity, ownerOperationRef, authorization), binding), 'BINDING_CHANGED');
    return this.#exclusive(async () => {
      try {
        await this.#authenticate();
        const entry = { ownerOperationRef, binding, authorization };
        const old = this.#record.data.entry;
        if (old !== null) {
          need(old.ownerOperationRef === ownerOperationRef, 'REF_REBOUND');
          need(same(old, entry), 'ORIGINAL_A0_CHANGED');
          return this.#receipt();
        }
        need(this.#record.revision < Number.MAX_SAFE_INTEGER, 'REVISION_LIMIT');
        const next = clone(this.#record); next.revision++; next.data.entry = clone(entry);
        validateState(next.data, this.#cfg, this.#profile);
        await this.#persist(next);
        return this.#receipt();
      } finally { wipePrivate(authorization); wipePrivate(binding); }
    });
  }
  read(input) {
    const request = clone(input);
    return this.#exclusive(async () => {
      await this.#authenticate();
      const entry = this.#entry(request);
      return { ownerOperationRef: entry.ownerOperationRef, binding: clone(entry.binding),
        authorization: decodePrivateProof('authorization', entry.authorization) };
    });
  }
  refundInputs(input) {
    const request = clone(input);
    exact(request, ['ownerOperationRef', 'binding', 'membership']);
    exact(request.membership, ['identitySHA256', 'acceptedRoot', 'siblings', 'leafIndex', 'validFrom', 'validUntil']);
    return this.#exclusive(async () => {
      await this.#authenticate();
      const entry = this.#entry({ ownerOperationRef: request.ownerOperationRef, binding: request.binding });
      need(request.membership.identitySHA256 === sha(this.#cfg.identity), 'MEMBERSHIP_DOMAIN');
      const { identitySHA256, ...membership } = request.membership;
      const authorization = decodePrivateProof('authorization', entry.authorization);
      try {
        // Existing F51 codec enforces exact reserve membership and original
        // settleBefore <= validFrom < validUntil. Current accepted-root status,
        // deadline, canonicality, spentness, finality and genuine recursive
        // acceptance remain the existing owned observer/prover/pool's job.
        const witness = existingRefundInputs(authorization, membership);
        return { mode: 'refund', witness, expectedPublicInputs: publicWords('refund', witness) };
      } finally { wipePrivate(authorization); }
    });
  }
  /** Same surviving instance only: retry exact absent candidate or acknowledge
   * exact committed candidate. Never invent replacement A0 or permit a send. */
  resumePendingWrite() {
    return this.#exclusive(async () => {
      need(this.#pending !== null, 'NO_PENDING_WRITE');
      try {
        this.#profileUnchanged();
        const actual = await stableRead(this.#vault, this.#cfg.password, this.#cfg.path), next = this.#pending;
        need(same(actual, this.#record) || same(actual, next), 'PENDING_STORAGE_CHANGED');
        const retained = clone(await this.#keeper.readCheckpoint());
        const baseCheckpoint = checkpoint(this.#record), pendingCheckpoint = checkpoint(this.#record, next),
          committedCheckpoint = checkpoint(next);
        if (same(actual, this.#record)) {
          // An acknowledged candidate with absent ciphertext is rollback, not
          // a lost write. Never downgrade that checkpoint to retry the base.
          need(same(retained, baseCheckpoint) || same(retained, pendingCheckpoint), 'PENDING_KEEPER_CHANGED');
          await this.#persist(next, retained);
        }
        else {
          need(same(retained, pendingCheckpoint) || same(retained, committedCheckpoint), 'PENDING_KEEPER_CHANGED');
          validateState(actual.data, this.#cfg, this.#profile);
          await retainCheckpoint(this.#keeper, retained, committedCheckpoint);
          this.#record = next; this.#pending = null;
        }
        this.#fault = false;
        return this.#receipt();
      } catch { this.#fault = true; fail('WRITE_UNCERTAIN'); }
    }, true);
  }
  async projection() {
    return this.#exclusive(async () => {
      await this.#authenticate();
      return { schema: HANDOFF_SCHEMA, classification: HANDOFF_CLASSIFICATION,
        retained: this.#record.data.entry !== null };
    });
  }
  close() {
    need(!this.#busy, 'BUSY'); this.#closed = true;
    wipePrivate(this.#record); wipePrivate(this.#pending); this.#cfg.password = null;
    this.#record = null; this.#pending = null;
    return { closed: true };
  }
}

/** TRUSTED bootstrap only. keeper belongs to the surviving keeper, never
 * an IPC/client request. vaultFactory is a host fault-injection seam only and
 * grants storage trust, not proof acceptance. Production omits it. */
export async function openGenericRefundHandoff(config, deps) {
  exact(config, ['path', 'password', 'identity', 'create', 'checkpoint']);
  exact(deps, ['keeper'], ['vaultFactory']);
  exact(deps.keeper, ['readCheckpoint', 'compareAndSwapCheckpoint']);
  need(typeof config.path === 'string' && config.path.length > 0 && !config.path.includes('\0'), 'PATH');
  need(typeof config.password === 'string' && config.password.length > 0 && Buffer.byteLength(config.password) <= 1024, 'PASSWORD');
  need(typeof config.create === 'boolean'
    && typeof deps.keeper.readCheckpoint === 'function' && typeof deps.keeper.compareAndSwapCheckpoint === 'function', 'CONFIG');
  need(deps.vaultFactory === undefined || typeof deps.vaultFactory === 'function', 'CONFIG');
  const cfg = { path: resolve(config.path), password: config.password, identity: clone(validateIdentity(config.identity)),
    create: config.create, checkpoint: clone(config.checkpoint) };
  const profile = currentProfile();
  const keeper = { readCheckpoint: deps.keeper.readCheckpoint.bind(deps.keeper),
    compareAndSwapCheckpoint: deps.keeper.compareAndSwapCheckpoint.bind(deps.keeper) };
  await safePath(cfg.path, !cfg.create);
  const vault = (deps.vaultFactory ?? (path => new Vault(path)))(cfg.path);
  let record;
  if (cfg.create) {
    need(cfg.checkpoint === null, 'CREATE_CHECKPOINT');
    // An erroneous create cannot replace the only valid keeper checkpoint.
    // CAS below also closes the cooperating concurrent-create race.
    for (const path of [cfg.path, cfg.path + '.lock']) {
      try { await lstat(path); fail('CREATE_PATH_EXISTS'); }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    need(await keeper.readCheckpoint() === null, 'CREATE_KEEPER_EXISTS');
    const initial = { revision: 0, data: { schema: HANDOFF_SCHEMA, handoffId: randomBytes(32).toString('hex'),
      identity: clone(cfg.identity), profileSHA256: profile.fingerprint, entry: null } };
    // Retain the candidate before creation too, covering a lost create reply.
    await retainCheckpoint(keeper, null, checkpoint(null, initial));
    const created = await vault.create(initial.data, cfg.password);
    need(same(created, initial), 'CREATE_RESULT');
    record = await stableRead(vault, cfg.password, cfg.path);
    need(same(record, initial), 'CREATE_READBACK');
    cfg.checkpoint = checkpoint(null, initial);
  } else {
    validateCheckpoint(cfg.checkpoint, cfg, profile);
    need(same(await keeper.readCheckpoint(), cfg.checkpoint), 'KEEPER_CHANGED');
    record = await stableRead(vault, cfg.password, cfg.path);
    need(record.data.handoffId === cfg.checkpoint.handoffId, 'CHECKPOINT_STORE');
    const actual = recordDigest(record), expected = cfg.checkpoint.pending ?? cfg.checkpoint.acknowledged;
    if (cfg.checkpoint.pending && cfg.checkpoint.acknowledged && same(actual, cfg.checkpoint.acknowledged)) fail('PENDING_WRITE_ABSENT');
    need(same(actual, expected), 'CHECKPOINT_STATE');
  }
  validateState(record.data, cfg, profile);
  await retainCheckpoint(keeper, cfg.checkpoint, checkpoint(record));
  const privateStore = new RefundHandoff(cfg, profile, vault, keeper, record);
  return Object.freeze({ privateStore,
    publicView: Object.freeze({ summary: () => privateStore.projection() }) });
}
