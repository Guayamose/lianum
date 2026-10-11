/** DRAFT: private-process custody for the existing native-owner V1 Vault.
 * No RPC, native runtime, prover, VK, arbitrary signer or key-export capability.
 * The injected observation source is a TRUST BOUNDARY, not owned-chain proof.
 * Install it inside the returning owner's private process; never accept it from
 * an IPC request. All witnesses returned here remain PRIVATE proof inputs.
 * Vault's trusted directory, cooperative locking, rollback and GC limits apply.
 */
import { createHash, createPrivateKey, createPublicKey, verify } from 'node:crypto';
import { lstat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { canonical, digest } from '@lianum/engine/crypto/privacy';
import { Vault } from '@lianum/engine/crypto/vault';
import { nullifier, wordsBE } from '@lianum/engine/notes/private-note-encoding';
import { walletNoteCommitment, walletWithdrawInput, balanceWithdrawFrame, walletInputPublicWords }
  from '@lianum/engine/wallet/notes/private-wallet-note-encoding';
import { PrivateNoteTree, verifyPrivateNotePath, noteWordsToHash }
  from '@lianum/engine/notes/private-note-tree';
import { SECP256K1_ORDER } from '@lianum/engine/notes/private-native-certificate';
import { FUNDED_GRAPH_PROFILE, FUNDED_DOMAINS, fundedAdmission, fundedHash, fundedAuthorizationWords }
  from '@lianum/engine/execution/graph/funded-graph';
import { a0Context } from '@lianum/engine/execution/native/dispatch/native-capsules';
import { decodePrivateProof, wipePrivate } from '@lianum/proofs/execution/proof-worker';

export const OWNER_RECOVERY_SCHEMA = 'LIANUM_SYNTHETIC_NATIVE_OWNER_RECOVERY_V1';
export const OWNER_EXIT_SCHEMA = 'LIANUM_SYNTHETIC_NATIVE_OWNER_EXITS_V1';
const ZERO = '0'.repeat(64);
const NOTES = ['source', 'change', 'recovery'];
const DOMAINS = ['scope', 'policy', 'asset', 'hubDomain', 'registryCommitment'];
const TIMES = ['epoch', 'fundingNotBefore', 'fundingValidUntil', 'settleBefore'];
const BINDING = [...DOMAINS, 'operationId', ...TIMES, 'fundingCommitment', 'admissionTag',
  'reserveCommitment', 'reserveNullifier', 'changeCommitment', 'recoveryCommitment'];
const A0_HASHES = ['scope', 'policy', 'asset', 'operationId', 'inputCommitment', 'inputNullifier',
  'reservationIntent', 'graphCommitment', 'treeRoot', 'reserveCommitment', 'reserveNullifier', 'changeCommitment'];
const REQUEST = ['note', 'scope', 'policy', 'noteCommitment', 'recipient', 'amount', 'canonicalNullifier', 'epoch', 'path'];
const WITNESS = ['scope', 'policy', 'epoch', 'root', 'spent', 'amount', 'recipient', 'siblings',
  'leaf_index', 'rho', 'key_x', 'key_y', 'value', 'secret', 'signature'];
const fail = code => { throw Object.assign(new Error(code), { code }); };
const need = (ok, code = 'INPUT') => { if (!ok) fail('OWNER_RECOVERY_' + code); };
const copy = value => JSON.parse(canonical(value));
const equal = (a, b) => canonical(a) === canonical(b);
const raw = value => Buffer.from(value, 'hex');
const recordHash = value => createHash('sha256').update(canonical(value)).digest('hex');
function exact(value, fields, code = 'EXACT_FIELDS') {
  canonical(value);
  need(value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === fields.length && fields.every(key => Object.hasOwn(value, key)), code);
}
function hash(value, width = 32, allowZero = false) {
  need(typeof value === 'string' && new RegExp(`^[0-9a-f]{${2 * width}}$`).test(value)
    && (allowZero || value !== '0'.repeat(2 * width)));
  return value;
}
function uint(value, positive = false) {
  need(typeof value === 'string' && /^(0|[1-9][0-9]{0,19})$/.test(value)
    && BigInt(value) < 1n << 64n && (!positive || BigInt(value) > 0n));
  return value;
}
function checkBinding(binding) {
  exact(binding, BINDING);
  BINDING.filter(name => !TIMES.includes(name)).forEach(name => hash(binding[name]));
  TIMES.forEach(name => uint(binding[name]));
  need(BigInt(binding.fundingNotBefore) < BigInt(binding.fundingValidUntil)
    && BigInt(binding.fundingValidUntil) <= BigInt(binding.settleBefore), 'DEADLINES');
  need(binding.admissionTag === fundedAdmission(binding), 'ADMISSION_BINDING');
}
function config(input) {
  exact(input, ['recoveryVault', 'exitVault', 'expectedBinding', 'destinations']);
  exact(input.recoveryVault, ['path', 'password']);
  exact(input.exitVault, ['path', 'password', 'mode']);
  for (const vault of [input.recoveryVault, input.exitVault]) {
    need(typeof vault.path === 'string' && vault.path.length > 0 && !vault.path.includes('\0'));
    need(typeof vault.password === 'string' && vault.password.length > 0 && Buffer.byteLength(vault.password) <= 1024);
  }
  const recoveryPath = resolve(input.recoveryVault.path), exitPath = resolve(input.exitVault.path);
  need(![recoveryPath, recoveryPath + '.lock'].some(path => [exitPath, exitPath + '.lock'].includes(path)),
    'SEPARATE_EXIT_VAULT_REQUIRED');
  need(['create', 'recover'].includes(input.exitVault.mode));
  checkBinding(input.expectedBinding);
  exact(input.destinations, NOTES);
  hash(input.destinations.source, 20); hash(input.destinations.recovery, 20);
  if (input.destinations.change !== null) hash(input.destinations.change, 20);
  return copy(input);
}
function checkStoredNote(stored, allowEmpty) {
  exact(stored, ['opening', 'privateKeyPem']);
  const n = stored.opening;
  exact(n, ['type', 'rho', 'x', 'y', 'value', 'secret']);
  need(n.type === 4, 'NOTE_TYPE'); uint(n.value, !allowEmpty);
  for (const field of ['rho', 'x', 'y', 'secret']) hash(n[field], 32, true);
  if (n.value === '0') {
    need(allowEmpty && ['rho', 'x', 'y', 'secret'].every(field => n[field] === ZERO)
      && stored.privateKeyPem === null, 'EMPTY_CHANGE');
    return null;
  }
  need(typeof stored.privateKeyPem === 'string' && stored.privateKeyPem.length < 4096
    && stored.privateKeyPem.startsWith('-----BEGIN PRIVATE KEY-----'), 'KEY');
  let privateKey, publicKey, jwk;
  try {
    privateKey = createPrivateKey(stored.privateKeyPem);
    need(privateKey.asymmetricKeyType === 'ec' && privateKey.asymmetricKeyDetails.namedCurve === 'secp256k1', 'KEY');
    publicKey = createPublicKey(privateKey); jwk = publicKey.export({ format: 'jwk' });
  } catch { fail('OWNER_RECOVERY_KEY'); }
  need(Buffer.from(jwk.x, 'base64url').toString('hex') === n.x
    && Buffer.from(jwk.y, 'base64url').toString('hex') === n.y, 'KEY_NOTE_MISMATCH');
  return { privateKey, publicKey };
}
function digestAt(words, offset) { return noteWordsToHash(words.slice(offset, offset + 8)).slice(2); }
function validateProofBindings(state) {
  if (state.state === 'prepared') {
    need(state.privateProofs === null, 'PREPARED_PROOFS');
    return;
  }
  exact(state.privateProofs, ['authorization', 'capsuleAuthorization'], 'AUTHORIZED_PROOFS_REQUIRED');
  let a0, capsule;
  try {
    // Codec/envelope validation only. This does not verify either proof.
    a0 = decodePrivateProof('authorization', state.privateProofs.authorization);
    capsule = decodePrivateProof('capsule', state.privateProofs.capsuleAuthorization);
    const a = a0.publicInputs, c = capsule.publicInputs, b = state.binding;
    const statement = { profile: FUNDED_GRAPH_PROFILE.id,
      ...Object.fromEntries(A0_HASHES.map((name, i) => [name, digestAt(a, i * 8)])),
      outputs: Array.from({ length: 4 }, (_, i) => digestAt(a, 96 + i * 8)),
      recoveryCommitment: digestAt(a, 128), fundingNotBefore: a[136], fundingValidUntil: a[137], settleBefore: a[138] };
    need(equal(fundedAuthorizationWords(statement), a), 'A0_ENCODING');
    for (const name of ['scope', 'policy', 'asset', 'operationId', 'reserveCommitment', 'reserveNullifier',
      'changeCommitment', 'recoveryCommitment', 'fundingNotBefore', 'fundingValidUntil', 'settleBefore']) {
      need(statement[name] === b[name], 'A0_BINDING');
    }
    need(statement.inputCommitment === b.fundingCommitment
      && statement.inputNullifier === nullifier(b.scope, b.fundingCommitment, state.source.opening.secret).toString('hex'), 'A0_SOURCE_BINDING');
    const reserve = fundedHash(FUNDED_DOMAINS.reserve, [Buffer.from(FUNDED_GRAPH_PROFILE.id),
      ...['scope', 'policy', 'asset'].map(name => raw(b[name])), raw(statement.reservationIntent), raw(statement.graphCommitment)]);
    need(reserve === b.reserveCommitment, 'A0_RESERVE_BINDING');
    const commitments = [b.fundingCommitment, b.reserveCommitment, b.changeCommitment, b.recoveryCommitment, ...statement.outputs];
    need(new Set(commitments).size === commitments.length, 'A0_DISTINCT_COMMITMENTS');
    for (const [name, offset] of [['scope', 0], ['policy', 8], ['asset', 16], ['hubDomain', 24],
      ['registryCommitment', 32], ['reserveCommitment', 48], ['reserveNullifier', 56]]) {
      need(digestAt(c, offset) === b[name], 'CAPSULE_BINDING');
    }
    need(digestAt(c, 40) === a0Context(statement) && c[128] === b.settleBefore, 'CAPSULE_A0_BINDING');
  } finally { wipePrivate(a0); wipePrivate(capsule); }
}
function validateRecovery(state, cfg) {
  exact(state, ['schema', 'state', 'binding', 'reserveSecret', ...NOTES, 'privateProofs']);
  need(state.schema === OWNER_RECOVERY_SCHEMA && ['prepared', 'authorized'].includes(state.state), 'SCHEMA');
  checkBinding(state.binding);
  need(equal(state.binding, cfg.expectedBinding), 'EXPECTED_BINDING');
  hash(state.reserveSecret);
  const keys = Object.fromEntries(NOTES.map(name => [name, checkStoredNote(state[name], name === 'change')]));
  const b = state.binding;
  for (const [name, bindingName] of [['source', 'fundingCommitment'], ['change', 'changeCommitment'], ['recovery', 'recoveryCommitment']]) {
    if (name === 'change' && state.change.opening.value === '0') continue;
    need(walletNoteCommitment(b.scope, b.policy, state[name].opening).toString('hex') === b[bindingName], 'NOTE_COMMITMENT');
  }
  need(BigInt(state.source.opening.value) === BigInt(state.change.opening.value) + BigInt(state.recovery.opening.value), 'CONSERVATION');
  need((state.change.opening.value === '0') === (cfg.destinations.change === null), 'EMPTY_CHANGE_DESTINATION');
  need(nullifier(b.scope, b.reserveCommitment, state.reserveSecret).toString('hex') === b.reserveNullifier, 'RESERVE_NULLIFIER');
  const liveNotes = NOTES.filter(name => keys[name] !== null);
  need(new Set(liveNotes.map(name => state[name].opening.x + state[name].opening.y)).size === liveNotes.length, 'DISTINCT_KEYS');
  need(new Set([b.fundingCommitment, b.reserveCommitment, b.changeCommitment, b.recoveryCommitment]).size === 4, 'DISTINCT_COMMITMENTS');
  validateProofBindings(state);
  return keys;
}
function checkPath(path, commitment) {
  exact(path, ['index', 'leaf', 'root', 'siblings']);
  need(Number.isInteger(path.index) && path.index >= 0 && path.index < 64, 'MEMBERSHIP');
  need(path.leaf === '0x' + commitment && typeof path.root === 'string' && /^0x[0-9a-f]{64}$/.test(path.root)
    && Array.isArray(path.siblings) && path.siblings.length === 6
    && path.siblings.every(item => typeof item === 'string' && /^0x[0-9a-f]{64}$/.test(item)), 'MEMBERSHIP');
  need(verifyPrivateNotePath(path), 'MEMBERSHIP');
}
function statusFor(recovery, exits, name) {
  need(NOTES.includes(name), 'NOTE_SELECTION');
  const b = recovery.binding, opening = recovery[name].opening;
  const noteCommitment = b[{ source: 'fundingCommitment', change: 'changeCommitment', recovery: 'recoveryCommitment' }[name]];
  const stored = exits.withdrawals[name];
  return { note: name, scope: b.scope, policy: b.policy, noteCommitment, recipient: exits.destinations[name],
    amount: opening.value, canonicalNullifier: opening.value === '0' ? null : nullifier(b.scope, noteCommitment, opening.secret).toString('hex'),
    eligibility: opening.value === '0' ? 'NO_CHANGE_NOTE' : recovery.state === 'prepared' && name !== 'source' ? 'AUTHORIZED_RECORD_REQUIRED' : 'OBSERVATION_REQUIRED',
    authorization: stored === null ? null : { epoch: stored.request.epoch, root: stored.request.path.root,
      hash: digest('LIANUM/PAEG/owner-exit-authorization/1', stored) } };
}
function checkRequest(recovery, exits, input) {
  exact(input, REQUEST);
  const request = copy(input), status = statusFor(recovery, exits, request.note);
  need(status.eligibility !== 'NO_CHANGE_NOTE', 'NO_CHANGE_NOTE');
  need(status.eligibility !== 'AUTHORIZED_RECORD_REQUIRED', 'AUTHORIZED_RECORD_REQUIRED');
  uint(request.epoch); uint(request.amount, true); hash(request.recipient, 20); hash(request.canonicalNullifier);
  need(['scope', 'policy', 'noteCommitment', 'recipient', 'amount', 'canonicalNullifier'].every(name => request[name] === status[name]), 'WITHDRAWAL_MISMATCH');
  checkPath(request.path, request.noteCommitment);
  return request;
}
function witnessFields(recovery, request) {
  const note = recovery[request.note].opening, path = request.path;
  return { scope: wordsBE(raw(request.scope)), policy: wordsBE(raw(request.policy)), epoch: request.epoch,
    root: wordsBE(raw(path.root.slice(2))), spent: wordsBE(raw(request.canonicalNullifier)), amount: request.amount,
    recipient: wordsBE(raw(request.recipient)), siblings: path.siblings.map(value => [...raw(value.slice(2))]),
    leaf_index: String(path.index), rho: [...raw(note.rho)], key_x: [...raw(note.x)], key_y: [...raw(note.y)],
    value: note.value, secret: [...raw(note.secret)] };
}
function validateExits(state, recovery, keys, recoveryRecord, cfg) {
  exact(state, ['schema', 'recoveryRecordSHA256', 'recoveryRevision', 'binding', 'destinations', 'withdrawals']);
  need(state.schema === OWNER_EXIT_SCHEMA && state.recoveryRecordSHA256 === recordHash(recoveryRecord.data)
    && state.recoveryRevision === recoveryRecord.revision && equal(state.binding, cfg.expectedBinding)
    && equal(state.destinations, cfg.destinations), 'EXIT_BINDING');
  exact(state.withdrawals, NOTES);
  for (const name of NOTES) {
    const exit = state.withdrawals[name];
    if (exit === null) continue;
    exact(exit, ['request', 'witness']);
    const request = checkRequest(recovery, state, exit.request);
    need(request.note === name, 'EXIT_NOTE_BINDING'); exact(exit.witness, WITNESS);
    const { signature, ...fields } = exit.witness;
    need(equal(fields, witnessFields(recovery, request)) && Array.isArray(signature) && signature.length === 64
      && signature.every(byte => Number.isInteger(byte) && byte >= 0 && byte < 256), 'EXIT_WITNESS');
    const signed = Buffer.from(signature), s = BigInt('0x' + signed.subarray(32).toString('hex'));
    need(s > 0n && s <= SECP256K1_ORDER / 2n && verify('sha256', balanceWithdrawFrame(request.scope, request.policy,
      request.noteCommitment, request.recipient, request.amount, request.epoch),
    { key: keys[name].publicKey, dsaEncoding: 'ieee-p1363' }, signed), 'EXIT_SIGNATURE');
  }
}
async function noLock(vault) {
  try { await lstat(vault.lockPath); fail('OWNER_RECOVERY_VAULT_LOCKED'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
}
async function readStable(vault, password) {
  await noLock(vault);
  const record = await vault.read(password);
  await noLock(vault);
  return record;
}
function observerMethods(observer) {
  need(observer && typeof observer.observe === 'function' && typeof observer.assertCanonical === 'function', 'OBSERVER_REQUIRED');
  // Capture injected functions once; subsequent caller mutation cannot replace them.
  return { observe: observer.observe.bind(observer), assertCanonical: observer.assertCanonical.bind(observer) };
}
function observedView(input, binding) {
  exact(input, [...DOMAINS, 'blockNumber', 'blockHash', 'timestamp', 'poolStateSequence', 'root', 'commitments', 'nullifiers']);
  const view = copy(input);
  need(DOMAINS.every(name => view[name] === binding[name]), 'OBSERVATION_DOMAIN');
  for (const field of ['blockNumber', 'timestamp', 'poolStateSequence']) uint(view[field]);
  need(typeof view.blockHash === 'string' && /^0x[0-9a-f]{64}$/.test(view.blockHash)
    && view.blockHash !== '0x' + ZERO, 'OBSERVATION_BLOCK');
  for (const name of ['commitments', 'nullifiers']) {
    need(Array.isArray(view[name]) && view[name].length <= 64
      && view[name].every(value => typeof value === 'string' && /^0x[0-9a-f]{64}$/.test(value) && value !== '0x' + ZERO)
      && new Set(view[name]).size === view[name].length, 'OBSERVATION_LIST');
  }
  const tree = new PrivateNoteTree(view.commitments);
  need(view.root === tree.root, 'OBSERVATION_ROOT');
  return { view, tree };
}

class GenericOwnerRecoveryCustody {
  #cfg; #recoveryVault; #exitVault; #recoveryRecord; #recovery; #keys; #exits; #revision; #observer;
  #busy = false; #closed = false; #uncertain = false;
  constructor(cfg, recoveryVault, exitVault, recoveryRecord, exitRecord, keys, observer) {
    this.#cfg = cfg; this.#recoveryVault = recoveryVault; this.#exitVault = exitVault;
    this.#recoveryRecord = recoveryRecord; this.#recovery = recoveryRecord.data; this.#keys = keys;
    this.#exits = exitRecord.data; this.#revision = exitRecord.revision; this.#observer = observer;
    Object.freeze(this);
  }
  #open() {
    need(!this.#closed, 'CLOSED'); need(!this.#uncertain, 'REOPEN_REQUIRED'); need(!this.#busy, 'BUSY');
  }
  withdrawalStatus(name) { this.#open(); return copy(statusFor(this.#recovery, this.#exits, name)); }
  recordStatus() {
    this.#open();
    return { state: this.#recovery.state, binding: copy(this.#recovery.binding),
      persistedProofBindingsChecked: this.#recovery.state === 'authorized', cryptographicProofVerification: false };
  }
  async #assertSourceUnchanged() {
    const current = await readStable(this.#recoveryVault, this.#cfg.recoveryVault.password);
    try {
      need(current.revision === this.#recoveryRecord.revision && recordHash(current.data) === this.#exits.recoveryRecordSHA256,
        'RECOVERY_RECORD_CHANGED');
    } finally { wipePrivate(current); }
  }
  async #assertExitsUnchanged() {
    try {
      const current = await readStable(this.#exitVault, this.#cfg.exitVault.password);
      need(current.revision === this.#revision && equal(current.data, this.#exits), 'EXIT_RECORD_CHANGED');
    } catch (error) { this.#uncertain = true; throw error; }
  }
  async #persist(next) {
    try {
      const written = await this.#exitVault.update(this.#cfg.exitVault.password, this.#revision, current => {
        need(equal(current, this.#exits), 'EXIT_RECORD_CHANGED'); return next;
      });
      const reread = await readStable(this.#exitVault, this.#cfg.exitVault.password);
      need(reread.revision === written.revision && equal(reread.data, written.data), 'WRITE_READBACK');
      this.#revision = reread.revision; this.#exits = reread.data;
    } catch (error) {
      // Includes post-rename and readback errors: never acknowledge from stale memory.
      this.#uncertain = true; throw error;
    }
  }
  /** EVERY request, including an exact retry, performs a fresh injected read and
   * canonical check. Only the latest exact request retains its ECDSA signature.
   * Epoch/path renewal changes no economic term or canonical nullifier.
   */
  async authorizeWithdrawal(input) {
    this.#open();
    const request = checkRequest(this.#recovery, this.#exits, input);
    this.#busy = true;
    try {
      await this.#assertSourceUnchanged();
      await this.#assertExitsUnchanged();
      const query = { ...Object.fromEntries(DOMAINS.map(name => [name, this.#recovery.binding[name]])),
        ...statusFor(this.#recovery, this.#exits, request.note) };
      const { view, tree } = observedView(await this.#observer.observe(copy(query)), this.#recovery.binding);
      need(await this.#observer.assertCanonical(copy(view)) === true, 'CANONICAL_OBSERVATION_REQUIRED');
      const observed = { blockNumber: view.blockNumber, blockHash: view.blockHash, poolStateSequence: view.poolStateSequence,
        root: view.root, canonicalNullifier: request.canonicalNullifier, epoch: (BigInt(view.timestamp) / 600n).toString() };
      if (view.nullifiers.includes('0x' + request.canonicalNullifier)) {
        return { status: 'NOTE_CONSUMED_REQUIRES_TRANSACTION_RECONCILIATION', observed };
      }
      const index = view.commitments.indexOf('0x' + request.noteCommitment);
      if (index < 0) return { status: 'NOTE_NOT_ISSUED_AT_OBSERVATION', observed };
      need(request.epoch === observed.epoch && equal(request.path, tree.path(index)), 'CURRENT_MEMBERSHIP_REQUIRED');
      const retained = this.#exits.withdrawals[request.note];
      if (retained === null || !equal(retained.request, request)) {
        const note = { ...this.#recovery[request.note].opening, ...this.#keys[request.note] };
        const witness = walletWithdrawInput({ scope: request.scope, policy: request.policy, epoch: request.epoch,
          note, path: request.path, recipient: request.recipient });
        need(equal(witness.spent, wordsBE(raw(request.canonicalNullifier)))
          && (retained === null || equal(witness.spent, retained.witness.spent)), 'NULLIFIER_CHANGED');
        await this.#persist({ ...this.#exits, withdrawals: { ...this.#exits.withdrawals, [request.note]: { request, witness } } });
      }
      // If the block reorganized during durable I/O, keep the durable intent but
      // return no witness. A later reconciled retry can safely recover it.
      need(await this.#observer.assertCanonical(copy(view)) === true, 'CANONICAL_OBSERVATION_REQUIRED');
      // The injected reader/canonical check may await while another cooperative
      // process renews the same exit. Re-authenticate AFTER those awaits too;
      // exact retries must not return a superseded in-memory authorization.
      await this.#assertSourceUnchanged();
      await this.#assertExitsUnchanged();
      const witness = copy(this.#exits.withdrawals[request.note].witness);
      return { status: 'AUTHORIZED_UNSPENT_AT_OBSERVATION', witness,
        expectedPublicInputs: walletInputPublicWords('withdraw_balance', witness), observed,
        authorization: statusFor(this.#recovery, this.#exits, request.note).authorization };
    } finally { this.#busy = false; }
  }
  close() {
    need(!this.#busy, 'BUSY'); this.#closed = true;
    wipePrivate(this.#cfg); wipePrivate(this.#recoveryRecord); wipePrivate(this.#exits);
    this.#cfg = this.#keys = this.#recoveryRecord = this.#recovery = this.#exits = this.#observer = undefined;
  }
}

/** Call only after the returning owner supplies fixed destinations through
 * private authority. mode=create is explicit and never overwrites. mode=recover
 * never creates a missing sidecar. Original V1 recovery bytes are never edited.
 */
export async function openGenericOwnerRecoveryCustody(input, observer) {
  const cfg = config(input), boundary = observerMethods(observer);
  const recoveryVault = new Vault(cfg.recoveryVault.path), exitVault = new Vault(cfg.exitVault.path);
  const recoveryRecord = await readStable(recoveryVault, cfg.recoveryVault.password);
  const keys = validateRecovery(recoveryRecord.data, cfg);
  let exitRecord;
  if (cfg.exitVault.mode === 'create') {
    const state = { schema: OWNER_EXIT_SCHEMA, recoveryRecordSHA256: recordHash(recoveryRecord.data),
      recoveryRevision: recoveryRecord.revision, binding: copy(cfg.expectedBinding), destinations: copy(cfg.destinations),
      withdrawals: { source: null, change: null, recovery: null } };
    const written = await exitVault.create(state, cfg.exitVault.password);
    exitRecord = await readStable(exitVault, cfg.exitVault.password);
    need(exitRecord.revision === written.revision && equal(exitRecord.data, written.data), 'WRITE_READBACK');
  } else exitRecord = await readStable(exitVault, cfg.exitVault.password);
  validateExits(exitRecord.data, recoveryRecord.data, keys, recoveryRecord, cfg);
  return new GenericOwnerRecoveryCustody(cfg, recoveryVault, exitVault, recoveryRecord, exitRecord, keys, boundary);
}
