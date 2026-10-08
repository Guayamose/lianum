/** Device-local protected encryption root + one prepared PC23 note.
 * No network, witness export, spend method, ledger credit or backend brand.
 * SecureStore is not a transaction or anti-rollback store. Uncertain writes
 * require explicit recovery; the original ciphertext is never deleted here. */
import * as SecureStore from 'expo-secure-store';
import * as Authentication from 'expo-local-authentication';
import * as Crypto from 'expo-crypto';
import { Platform } from 'react-native';
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { bytesToHex, privateKeyFromHex, signDeviceMessage } from './signing.mjs';
import { normalizeLocalDepositChoiceV1, localUnissuedDepositStatementV1, localUnissuedDepositFrameV1,
  type LocalDepositChoiceV1, type LocalDepositStatementV1 } from './unissued-deposit-terms-v1.mjs';
import { localBalanceCommitmentMessageV1, localNoteHexBytesV1, localNoteUintBytesV1,
  type LocalBalanceOpeningV1 } from './balance-note-codec-v1.mjs';

const ROOT = 'lianum.note.root.encryption.v1';
const POINTER = 'lianum.note.root.pointer.v1';
const RECORD = 'lianum.note.root.record.v1';
const PRIVATE: SecureStore.SecureStoreOptions = { requireAuthentication: true,
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  keychainService: 'org.lianum.wallet.note.root.authenticated.v1',
  authenticationPrompt: 'Abrir la custodia local de tu nota Lianum', };
const DATA: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  keychainService: 'org.lianum.wallet.note.encrypted-record.v1', };
const MAX_STORED_BYTES = 2048;
type PreparedNote = { scope: string; policy: string; pool: string; recipient: string;
  commitment: string; privateKey: string; opening: LocalBalanceOpeningV1; status: 'UNISSUED'; depositIntent?: DepositIntent };
type DepositIntent = LocalDepositChoiceV1 & Readonly<{ frameSHA256: string }>;
export type LocalDepositReviewV1 = Readonly<{ version: 1; profile: 'LOCAL_UNISSUED_DEPOSIT_REVIEW_V1';
  reviewId: string; rootId: string; revision: number; createdAt: number; expiresAt: number;
  note: LocalPreparedNoteSummaryV1; choice: LocalDepositChoiceV1; statement: LocalDepositStatementV1 }>;
export type LocalDepositSignatureV1 = Readonly<{ version: 1; relation: 'D26' | 'D27';
  rootId: string; revision: number; commitment: string; statement: LocalDepositStatementV1;
  signature: string; status: 'UNISSUED'; availableBalance: null; nativeEffectsEstablished: false }>;
type State = { version: 1; rootId: string; revision: number; note: PreparedNote | null };
type Pointer = { version: 1; rootId: string; revision: number; recordSHA256: string; state: 'CREATING' | 'ACTIVE' };
type Envelope = { version: 1; rootId: string; revision: number; sealed: string };
export type LocalRootNoteInspectionV1 = Readonly<{ version: 1;
  status: 'UNAVAILABLE' | 'ABSENT_METADATA' | 'ACTIVE' | 'RECOVERY_REQUIRED';
  rootId: string | null; revision: number | null; recordRevision: number | null;
  encryptedRecordPresent: boolean; availableBalance: null; nativeEffectsEstablished: false }>;
export type LocalPreparedNoteSummaryV1 = Readonly<{ commitment: string; amount: string;
  scope: string; policy: string; pool: string; recipient: string; status: 'UNISSUED';
  availableBalance: null; nativeEffectsEstablished: false }>;
function bad(code = 'MOBILE_LOCAL_NOTE_RECORD_INVALID'): never { throw new Error(code); }
const hex = (value: unknown, width = 32): string => {
  if (typeof value !== 'string') return bad(); localNoteHexBytesV1(value, width); return value;
};
const integer = (value: unknown): number => {
  if (!Number.isSafeInteger(value) || (value as number) < 0 || Object.is(value, -0)) return bad();
  return value as number;
};
function parsed(raw: string, fields: string[], maximum = MAX_STORED_BYTES): Record<string, unknown> {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > maximum) return bad();
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).sort().join(',') !== [...fields].sort().join(',')) return bad();
  return value as Record<string, unknown>;
}
const encoded = (value: unknown): Uint8Array => new TextEncoder().encode(JSON.stringify(value));
async function digest(bytes: Uint8Array): Promise<string> {
  const owned = Uint8Array.from(bytes);
  try { return bytesToHex(new Uint8Array(await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, owned))); }
  finally { owned.fill(0); }
}
const binding = (value: { rootId: string; revision: number }) =>
  encoded(['LIANUM/DEVICE/NOTE-VAULT/1', value.rootId, value.revision]);
function pointer(raw: string): Pointer {
  const x = parsed(raw, ['version', 'rootId', 'revision', 'recordSHA256', 'state']);
  if (x.version !== 1 || !['CREATING', 'ACTIVE'].includes(String(x.state))) return bad();
  return { version: 1, rootId: hex(x.rootId), revision: integer(x.revision),
    recordSHA256: hex(x.recordSHA256), state: x.state as Pointer['state'] };
}
function envelope(raw: string): Envelope {
  const x = parsed(raw, ['version', 'rootId', 'revision', 'sealed']);
  if (x.version !== 1 || typeof x.sealed !== 'string' || x.sealed.length === 0
    || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(x.sealed)) return bad();
  return { version: 1, rootId: hex(x.rootId), revision: integer(x.revision), sealed: x.sealed };
}
async function state(bytes: Uint8Array, expected: Envelope): Promise<State> {
  const x = parsed(new TextDecoder('utf-8', { fatal: true }).decode(bytes), ['version', 'rootId', 'revision', 'note']);
  if (x.version !== 1 || x.rootId !== expected.rootId || x.revision !== expected.revision) return bad();
  let note: PreparedNote | null = null;
  if (x.note !== null) {
    if (typeof x.note !== 'object' || Array.isArray(x.note)) bad();
    const sourceNote = parsed(JSON.stringify(x.note), Object.hasOwn(x.note, 'depositIntent')
      ? ['scope', 'policy', 'pool', 'recipient', 'commitment', 'privateKey', 'opening', 'status', 'depositIntent']
      : ['scope', 'policy', 'pool', 'recipient', 'commitment', 'privateKey', 'opening', 'status']);
    const n = sourceNote;
    const o = parsed(JSON.stringify(n.opening), ['type', 'rho', 'x', 'y', 'value', 'secret']);
    if (o.type !== 4 || n.status !== 'UNISSUED' || typeof o.value !== 'string') return bad();
    localNoteUintBytesV1(o.value); if (BigInt(o.value) <= 0n) return bad();
    const opening: LocalBalanceOpeningV1 = { type: 4, rho: hex(o.rho), x: hex(o.x), y: hex(o.y), value: o.value, secret: hex(o.secret) };
    note = { scope: hex(n.scope), policy: hex(n.policy), pool: hex(n.pool, 20), recipient: hex(n.recipient, 20),
      commitment: hex(n.commitment), privateKey: hex(n.privateKey), opening, status: 'UNISSUED' };
    if (note.pool === '0'.repeat(40) || note.recipient === '0'.repeat(40) || note.pool === note.recipient) return bad();
    const key = privateKeyFromHex(note.privateKey);
    try {
      const pub = bytesToHex(secp256k1.getPublicKey(key, false));
      if (pub.slice(2, 66) !== opening.x || pub.slice(66) !== opening.y) return bad();
      if (await digest(localBalanceCommitmentMessageV1(note.scope, note.policy, opening)) !== note.commitment) return bad();
    } finally { key.fill(0); }
    if (Object.hasOwn(n, 'depositIntent')) note.depositIntent = await depositIntent(n.depositIntent, note);
  }
  return { version: 1, rootId: expected.rootId, revision: expected.revision, note };
}
type RootOperationScope = { current(): void; writeStarted(): void };
async function checked<T>(scope: Pick<RootOperationScope, 'current'>, work: () => Promise<T>): Promise<T> {
  scope.current();
  try { const value = await work(); scope.current(); return value; }
  catch (error) { scope.current(); throw error; }
}
async function randomWithinScope(scope: Pick<RootOperationScope, 'current'>): Promise<Uint8Array> {
  scope.current(); const bytes = await Crypto.getRandomBytesAsync(32);
  try { scope.current(); if (bytes.length !== 32) bad('MOBILE_ENTROPY_FAILED'); return bytes; }
  catch (error) { bytes.fill(0); throw error; }
}
async function protectedConsent(prompt: string, scope: Pick<RootOperationScope, 'current'>): Promise<void> {
  scope.current();
  if (!['android', 'ios'].includes(Platform.OS)
    || !await checked(scope, () => SecureStore.isAvailableAsync())
    || !SecureStore.canUseBiometricAuthentication()
    || !await checked(scope, () => Authentication.hasHardwareAsync())
    || !await checked(scope, () => Authentication.isEnrolledAsync())) bad('MOBILE_PROTECTED_STORAGE_UNAVAILABLE');
  const reply = await checked(scope, () => Authentication.authenticateAsync({ promptMessage: prompt, cancelLabel: 'Cancelar',
    disableDeviceFallback: true, biometricsSecurityLevel: 'strong' }));
  if (!reply.success) bad('MOBILE_AUTHENTICATION_CANCELLED');
}
/** Fixed local operation capability, no injected guard/callback or financial
 * authority. Close revokes future async steps. A native set already begun may
 * finish; retain its original entries and require explicit recovery. */
function localRootOperationScope() {
  let closed = false, active = false, writing = false;
  const scope: RootOperationScope = {
    current() { if (closed) bad(active && writing ? 'MOBILE_LOCAL_NOTE_WRITE_UNCERTAIN' : 'MOBILE_LOCAL_NOTE_OPERATION_REVOKED'); },
    writeStarted() { scope.current(); writing = true; },
  };
  async function run<T>(work: () => Promise<T>): Promise<T> {
    scope.current(); if (active) bad('MOBILE_LOCAL_NOTE_BUSY'); active = true; writing = false;
    try { const value = await work(); scope.current(); return value; }
    catch (error) { scope.current(); throw error; }
    finally { active = false; }
  }
  return { scope, run, close() { closed = true; } };
}
export function createLocalRootNoteOperationV1() {
  const context = localRootOperationScope();
  return Object.freeze({
    create: () => context.run(() => createWithinScope(context.scope)),
    restore: (backupJSON: string) => context.run(() => restoreWithinScope(context.scope, backupJSON)),
    recover: (rootHex: string, expectedRevision: number) => context.run(() => recoverWithinScope(context.scope, rootHex, expectedRevision)),
    close: context.close,
  });
}
let busy = false;
async function serial<T>(work: () => Promise<T>): Promise<T> {
  if (busy) bad('MOBILE_LOCAL_NOTE_BUSY'); busy = true;
  try { return await work(); } finally { busy = false; }
}
async function rootIdentity(root: Uint8Array): Promise<string> {
  const domain = new TextEncoder().encode('LIANUM/DEVICE/NOTE-ENCRYPTION-ROOT/1');
  const input = new Uint8Array(domain.length + root.length); input.set(domain); input.set(root, domain.length);
  try { return await digest(input); } finally { input.fill(0); }
}
async function sealedRecord(key: Crypto.AESEncryptionKey, value: State): Promise<string> {
  const clear = encoded(value);
  try {
    if (clear.length > MAX_STORED_BYTES) bad();
    const sealed = await Crypto.aesEncryptAsync(clear, key, { nonce: { length: 12 }, tagLength: 16, additionalData: binding(value) });
    const raw = JSON.stringify({ version: 1, rootId: value.rootId, revision: value.revision, sealed: await sealed.combined('base64') });
    if (raw.length > MAX_STORED_BYTES) bad('MOBILE_LOCAL_NOTE_CAPACITY');
    return raw;
  } finally { clear.fill(0); }
}
async function decrypted(key: Crypto.AESEncryptionKey, raw: string): Promise<State> {
  const e = envelope(raw), sealed = Crypto.AESSealedData.fromCombined(e.sealed, { ivLength: 12, tagLength: 16 });
  const clear = await Crypto.aesDecryptAsync(sealed, key, { output: 'bytes', additionalData: binding(e) });
  try { return await state(clear, e); } finally { clear.fill(0); }
}
async function writeChecked(key: string, raw: string, options: SecureStore.SecureStoreOptions): Promise<void> {
  await SecureStore.setItemAsync(key, raw, options);
  if (await SecureStore.getItemAsync(key, options) !== raw) bad('MOBILE_LOCAL_NOTE_WRITE_UNCERTAIN');
}
async function writeCheckedScoped(scope: RootOperationScope, key: string, raw: string,
  options: SecureStore.SecureStoreOptions): Promise<void> {
  scope.current(); scope.writeStarted();
  await checked(scope, () => SecureStore.setItemAsync(key, raw, options));
  const observed = await checked(scope, () => SecureStore.getItemAsync(key, options));
  if (observed !== raw) bad('MOBILE_LOCAL_NOTE_WRITE_UNCERTAIN');
}
async function initialize(scope: RootOperationScope, root: Uint8Array): Promise<Readonly<{ rootId: string; note: null }>> {
  scope.current();
  if (root.length !== 32 || root.every(byte => byte === 0)) bad('MOBILE_ENTROPY_FAILED');
  if ([await checked(scope, () => SecureStore.getItemAsync(POINTER, DATA)), await checked(scope, () => SecureStore.getItemAsync(RECORD, DATA)),
    await checked(scope, () => SecureStore.getItemAsync(ROOT, PRIVATE))].some(value => value !== null)) bad('MOBILE_LOCAL_NOTE_ALREADY_EXISTS');
  const rootId = await checked(scope, () => rootIdentity(root)), rootHex = bytesToHex(root);
  const creating: Pointer = { version: 1, rootId, revision: 0, recordSHA256: '0'.repeat(64), state: 'CREATING' };
  await writeCheckedScoped(scope, POINTER, JSON.stringify(creating), DATA);
  await writeCheckedScoped(scope, ROOT, rootHex, PRIVATE);
  let key: Crypto.AESEncryptionKey | null = null;
  try {
    const activeKey = key = await checked(scope, () => Crypto.AESEncryptionKey.import(root));
    const raw = await checked(scope, () => sealedRecord(activeKey, { version: 1, rootId, revision: 0, note: null }));
    await writeCheckedScoped(scope, RECORD, raw, DATA);
    const readback = await checked(scope, () => decrypted(activeKey, raw)); if (readback.note !== null) bad();
    await writeCheckedScoped(scope, POINTER, JSON.stringify({ ...creating, recordSHA256: await checked(scope, () => digest(encoded(envelope(raw)))), state: 'ACTIVE' }), DATA);
    scope.current(); return Object.freeze({ rootId, note: null });
  } finally { key = null; }
}
/** Generates only a protected encryption root; it is separate from HTTP ECDSA.
 * The caller must explicitly export and retain its backup. rootId alone cannot
 * recover this key. This module still issues no note and enables no funding. */
export function createLocalRootNoteVaultV1() { return createLocalRootNoteOperationV1().create(); }
async function createWithinScope(scope: RootOperationScope) {
  return serial(async () => {
    scope.current();
    await protectedConsent('Crear una raíz local para cifrar tus notas, distinta de tu identidad HTTP', scope);
    const root = await Crypto.getRandomBytesAsync(32);
    try { scope.current(); return await initialize(scope, root); } finally { root.fill(0); }
  });
}
/** Import is explicit and local. It never replaces an existing root/record. */
export function importLocalRootNoteVaultV1(rootHex: string) {
  const context = localRootOperationScope(), scope = context.scope;
  return context.run(() => serial(async () => {
    scope.current();
    const root = localNoteHexBytesV1(rootHex); if (root.every(byte => byte === 0)) { root.fill(0); return bad(); }
    try { await protectedConsent('Importar tu raíz de recuperación local; no reemplazará otra custodia', scope); return await initialize(scope, root); }
    finally { root.fill(0); }
  }));
}
const preparedSummary = (note: PreparedNote): LocalPreparedNoteSummaryV1 => Object.freeze({
  scope: note.scope, policy: note.policy, pool: note.pool, recipient: note.recipient,
  commitment: note.commitment, amount: note.opening.value, status: 'UNISSUED',
  availableBalance: null, nativeEffectsEstablished: false });
const summary = (value: State): LocalPreparedNoteSummaryV1 | null => value.note === null ? null : preparedSummary(value.note);
async function depositIntent(input: unknown, note: PreparedNote): Promise<DepositIntent> {
  if (!input || typeof input !== 'object' || !('relation' in input)) bad();
  const row = parsed(JSON.stringify(input), input.relation === 'D26'
    ? ['relation', 'epoch', 'frameSHA256'] : ['relation', 'validFrom', 'validUntil', 'frameSHA256']);
  let choice: LocalDepositChoiceV1;
  if (row.relation === 'D26' && typeof row.epoch === 'string') choice = { relation: 'D26', epoch: row.epoch };
  else if (row.relation === 'D27' && typeof row.validFrom === 'string' && typeof row.validUntil === 'string')
    choice = { relation: 'D27', validFrom: row.validFrom, validUntil: row.validUntil };
  else bad();
  choice = normalizeLocalDepositChoiceV1(choice);
  const frame = localUnissuedDepositFrameV1(preparedSummary(note), choice);
  try {
    const hash = hex(row.frameSHA256);
    if (await digest(frame) !== hash) bad('MOBILE_LOCAL_DEPOSIT_INTENT_INVALID');
    return Object.freeze({ ...choice, frameSHA256: hash });
  } finally { frame.fill(0); }
}

/** An original root may recover its stored ciphertext after biometric invalidation
 * or a one-revision uncertain write. Only an interrupted, empty initialization
 * with its original protected root still present may create the missing record. */
export function recoverLocalRootNoteVaultV1(rootHex: string, expectedRevision: number) {
  return createLocalRootNoteOperationV1().recover(rootHex, expectedRevision);
}
async function recoverWithinScope(scope: RootOperationScope, rootHex: string, expectedRevision: number) {
  return serial(async () => {
    scope.current();
    const root = localNoteHexBytesV1(rootHex); integer(expectedRevision);
    let key: Crypto.AESEncryptionKey | null = null;
    try {
      await protectedConsent('Recuperar esta custodia local exacta y conservar su nota original', scope);
      if (root.every(byte => byte === 0)) bad('MOBILE_LOCAL_NOTE_RECOVERY_BINDING');
      const before = await checked(scope, () => SecureStore.getItemAsync(POINTER, DATA)), raw = await checked(scope, () => SecureStore.getItemAsync(RECORD, DATA));
      if (before === null) bad('MOBILE_LOCAL_NOTE_RECOVERY_REQUIRED');
      const p = pointer(before);
      if (await checked(scope, () => rootIdentity(root)) !== p.rootId) bad('MOBILE_LOCAL_NOTE_RECOVERY_BINDING');
      if (raw === null) {
        if (p.state !== 'CREATING' || p.revision !== 0 || expectedRevision !== 0
          || p.recordSHA256 !== '0'.repeat(64)) bad('MOBILE_LOCAL_NOTE_RECOVERY_REQUIRED');
        const originalRoot = await checked(scope, () => SecureStore.getItemAsync(ROOT, PRIVATE));
        if (originalRoot !== bytesToHex(root)) bad('MOBILE_LOCAL_NOTE_RECOVERY_BINDING');
        const activeKey = key = await checked(scope, () => Crypto.AESEncryptionKey.import(root));
        const emptyRaw = await checked(scope, () => sealedRecord(activeKey, { version: 1, rootId: p.rootId, revision: 0, note: null }));
        if (await checked(scope, () => SecureStore.getItemAsync(POINTER, DATA)) !== before
          || await checked(scope, () => SecureStore.getItemAsync(RECORD, DATA)) !== null
          || await checked(scope, () => SecureStore.getItemAsync(ROOT, PRIVATE)) !== originalRoot)
          bad('MOBILE_LOCAL_NOTE_STORAGE_CHANGED');
        try {
          await writeCheckedScoped(scope, RECORD, emptyRaw, DATA);
          const value = await checked(scope, () => decrypted(activeKey, emptyRaw));
          if (value.note !== null || value.revision !== 0) bad();
          if (await checked(scope, () => SecureStore.getItemAsync(POINTER, DATA)) !== before
            || await checked(scope, () => SecureStore.getItemAsync(RECORD, DATA)) !== emptyRaw
            || await checked(scope, () => SecureStore.getItemAsync(ROOT, PRIVATE)) !== originalRoot)
            bad('MOBILE_LOCAL_NOTE_STORAGE_CHANGED');
          await writeCheckedScoped(scope, POINTER, JSON.stringify({ ...p, state: 'ACTIVE',
            recordSHA256: await checked(scope, () => digest(encoded(envelope(emptyRaw)))) }), DATA);
          scope.current(); return Object.freeze({ rootId: p.rootId, revision: 0, note: null });
        } catch (cause) { throw new Error('MOBILE_LOCAL_NOTE_WRITE_UNCERTAIN', { cause }); }
      }
      const e = envelope(raw);
      if (e.rootId !== p.rootId || e.revision !== expectedRevision
        || e.revision < p.revision || e.revision > p.revision + 1) bad('MOBILE_LOCAL_NOTE_RECOVERY_BINDING');
      const activeKey = key = await checked(scope, () => Crypto.AESEncryptionKey.import(root));
      const value = await checked(scope, () => decrypted(activeKey, raw));
      if (await checked(scope, () => SecureStore.getItemAsync(POINTER, DATA)) !== before || await checked(scope, () => SecureStore.getItemAsync(RECORD, DATA)) !== raw)
        bad('MOBILE_LOCAL_NOTE_STORAGE_CHANGED');
      await writeCheckedScoped(scope, ROOT, bytesToHex(root), PRIVATE);
      await writeCheckedScoped(scope, POINTER, JSON.stringify({ version: 1, rootId: p.rootId, revision: value.revision,
        recordSHA256: await checked(scope, () => digest(encoded(e))), state: 'ACTIVE' }), DATA);
      scope.current(); return Object.freeze({ rootId: p.rootId, revision: value.revision, note: summary(value) });
    } finally { root.fill(0); key = null; }
  });
}

/** Public device-local metadata only. It never reads the protected root,
 * decrypts a note or treats a metadata hash as economic confirmation. */
export function inspectLocalRootNoteVaultV1(): Promise<LocalRootNoteInspectionV1> {
  return serial(async () => {
    const base = { version: 1 as const, availableBalance: null, nativeEffectsEstablished: false as const };
    if (!['android', 'ios'].includes(Platform.OS) || !await SecureStore.isAvailableAsync())
      return Object.freeze({ ...base, status: 'UNAVAILABLE', rootId: null, revision: null,
        recordRevision: null, encryptedRecordPresent: false });
    const before = await SecureStore.getItemAsync(POINTER, DATA), raw = await SecureStore.getItemAsync(RECORD, DATA);
    if (before === null) return Object.freeze({ ...base, status: raw === null ? 'ABSENT_METADATA' : 'RECOVERY_REQUIRED',
      rootId: null, revision: null, recordRevision: null, encryptedRecordPresent: raw !== null });
    const p = pointer(before), e = raw === null ? null : envelope(raw);
    const active = p.state === 'ACTIVE' && e !== null && e.rootId === p.rootId && e.revision === p.revision
      && await digest(encoded(e)) === p.recordSHA256;
    if (await SecureStore.getItemAsync(POINTER, DATA) !== before || await SecureStore.getItemAsync(RECORD, DATA) !== raw)
      bad('MOBILE_LOCAL_NOTE_STORAGE_CHANGED');
    return Object.freeze({ ...base, status: active ? 'ACTIVE' : 'RECOVERY_REQUIRED', rootId: p.rootId,
      revision: p.revision, recordRevision: e?.rootId === p.rootId ? e.revision : null, encryptedRecordPresent: raw !== null });
  });
}

/** Restores only the authenticated ciphertext contained in the explicit local
 * backup. No network, identifier lookup, fresh note, key rotation or plaintext
 * witness is involved. An existing record may not be replaced or rolled back. */
export function restoreLocalRootNoteVaultBackupV1(backupJSON: string) { return createLocalRootNoteOperationV1().restore(backupJSON); }
async function restoreWithinScope(scope: RootOperationScope, backupJSON: string) {
  return serial(async () => {
    scope.current();
    const b = parsed(backupJSON, ['version', 'profile', 'rootHex', 'rootId', 'revision', 'recordSHA256', 'encryptedRecord'], 4096);
    if (b.version !== 1 || b.profile !== 'LIANUM_DEVICE_LOCAL_NOTE_BACKUP_V1'
      || typeof b.encryptedRecord !== 'string') bad('MOBILE_LOCAL_NOTE_BACKUP_INVALID');
    const raw = b.encryptedRecord, e = envelope(raw), rootId = hex(b.rootId), revision = integer(b.revision);
    if (e.rootId !== rootId || e.revision !== revision || await checked(scope, () => digest(encoded(e))) !== hex(b.recordSHA256))
      bad('MOBILE_LOCAL_NOTE_BACKUP_INVALID');
    const root = localNoteHexBytesV1(hex(b.rootHex));
    let key: Crypto.AESEncryptionKey | null = null;
    try {
      await protectedConsent('Restaurar esta copia local exacta: contiene la raíz secreta y el registro cifrado', scope);
      if (root.every(byte => byte === 0) || await checked(scope, () => rootIdentity(root)) !== rootId) bad('MOBILE_LOCAL_NOTE_RECOVERY_BINDING');
      const activeKey = key = await checked(scope, () => Crypto.AESEncryptionKey.import(root));
      const value = await checked(scope, () => decrypted(activeKey, raw)); // Authenticate and validate the original opening before any write.
      const before = await checked(scope, () => SecureStore.getItemAsync(POINTER, DATA)), originalRecord = await checked(scope, () => SecureStore.getItemAsync(RECORD, DATA)),
        originalRoot = await checked(scope, () => SecureStore.getItemAsync(ROOT, PRIVATE));
      if (originalRoot !== null && originalRoot !== bytesToHex(root)
        || originalRecord !== null && originalRecord !== raw) bad('MOBILE_LOCAL_NOTE_BACKUP_CONFLICT');
      if (before !== null) {
        const p = pointer(before);
        if (p.rootId !== rootId || p.revision > revision || revision > p.revision + 1
          || originalRecord === null && !(p.recordSHA256 === b.recordSHA256
            || p.state === 'CREATING' && p.revision === 0 && revision === 0 && p.recordSHA256 === '0'.repeat(64)))
          bad('MOBILE_LOCAL_NOTE_BACKUP_CONFLICT');
      } else if (originalRecord !== null || originalRoot !== null) bad('MOBILE_LOCAL_NOTE_BACKUP_CONFLICT');
      if (await checked(scope, () => SecureStore.getItemAsync(POINTER, DATA)) !== before
        || await checked(scope, () => SecureStore.getItemAsync(RECORD, DATA)) !== originalRecord
        || await checked(scope, () => SecureStore.getItemAsync(ROOT, PRIVATE)) !== originalRoot) bad('MOBILE_LOCAL_NOTE_STORAGE_CHANGED');
      const target = { version: 1 as const, rootId, revision, recordSHA256: hex(b.recordSHA256), state: 'ACTIVE' as const };
      try {
        const retainedPointer = before ?? JSON.stringify({ ...target, state: 'CREATING' });
        if (before === null) await writeCheckedScoped(scope, POINTER, retainedPointer, DATA);
        if (originalRoot === null) await writeCheckedScoped(scope, ROOT, bytesToHex(root), PRIVATE);
        if (originalRecord === null) await writeCheckedScoped(scope, RECORD, raw, DATA);
        if (await checked(scope, () => SecureStore.getItemAsync(RECORD, DATA)) !== raw
          || await checked(scope, () => SecureStore.getItemAsync(ROOT, PRIVATE)) !== bytesToHex(root)
          || await checked(scope, () => SecureStore.getItemAsync(POINTER, DATA)) !== retainedPointer) bad('MOBILE_LOCAL_NOTE_STORAGE_CHANGED');
        await writeCheckedScoped(scope, POINTER, JSON.stringify(target), DATA);
        scope.current(); return Object.freeze({ rootId, revision, note: summary(value) });
      } catch (cause) { throw new Error('MOBILE_LOCAL_NOTE_WRITE_UNCERTAIN', { cause }); }
    } finally { root.fill(0); key = null; }
  });
}

/** Opens a device-only capability. It is not an original account approval, has
 * no spend/witness export and cannot be imported into a backend WeakMap.
 * Deposit intent is only local accidental-reuse protection, not global uniqueness:
 * an older backup/other device can lack it. Pools/nullifiers/ledger remain mandatory. */
export function openLocalRootNoteVaultV1(expectedRootId: string) {
  let closed = false, active = false, writing = false;
  const current = () => { if (closed) bad(active && writing ? 'MOBILE_LOCAL_NOTE_WRITE_UNCERTAIN' : 'MOBILE_LOCAL_NOTE_CLOSED'); };
  const scope: RootOperationScope = { current, writeStarted() { current(); writing = true; } };
  const reviews = new WeakMap<LocalDepositReviewV1, LocalDepositChoiceV1>();
  let pendingReview: LocalDepositReviewV1 | null = null;
  const discardReview = () => { if (pendingReview) reviews.delete(pendingReview); pendingReview = null; };
  hex(expectedRootId);
  async function original<T>(prompt: string, work: (value: State, key: Crypto.AESEncryptionKey, originalPointer: string,
    originalRecord: string, originalRoot: Uint8Array) => Promise<T>): Promise<T> {
    return serial(async () => {
      active = true; writing = false;
      try {
      current(); await protectedConsent(prompt, { current }); current();
      const before = await checked(scope, () => SecureStore.getItemAsync(POINTER, DATA)), raw = await checked(scope, () => SecureStore.getItemAsync(RECORD, DATA));
      if (before === null || raw === null) bad('MOBILE_LOCAL_NOTE_RECOVERY_REQUIRED');
      const p = pointer(before), e = envelope(raw);
      if (p.state !== 'ACTIVE' || p.rootId !== expectedRootId || e.rootId !== p.rootId || e.revision !== p.revision
        || await checked(scope, () => digest(encoded(e))) !== p.recordSHA256) bad('MOBILE_LOCAL_NOTE_RECOVERY_REQUIRED');
      let retained: string | null = await checked(scope, () => SecureStore.getItemAsync(ROOT, PRIVATE));
      if (retained === null) bad('MOBILE_LOCAL_NOTE_RECOVERY_REQUIRED');
      const root = localNoteHexBytesV1(retained); retained = null;
      let key: Crypto.AESEncryptionKey | null = null;
      try {
        current(); if (await checked(scope, () => rootIdentity(root)) !== expectedRootId) bad('MOBILE_LOCAL_NOTE_ROOT_CHANGED');
        const activeKey = key = await checked(scope, () => Crypto.AESEncryptionKey.import(root));
        const value = await checked(scope, () => decrypted(activeKey, raw)); current();
        if (await checked(scope, () => SecureStore.getItemAsync(POINTER, DATA)) !== before || await checked(scope, () => SecureStore.getItemAsync(RECORD, DATA)) !== raw)
          bad('MOBILE_LOCAL_NOTE_STORAGE_CHANGED');
        current(); const result = await work(value, key, before, raw, root); current(); return result;
      } finally { root.fill(0); key = null; retained = null; }
      } finally { active = false; }
    });
  }
  return Object.freeze({
    readPreparedNote: () => original('Leer tu nota local preparada; todavía no es saldo disponible', async value => summary(value)),
    /** Explicit local recovery disclosure. Never invoked by HTTP or auto-copied.
     * JS strings/native handles cannot be securely erased; the UI must revoke
     * the capability and discard the returned string when hidden. */
    exportBackup: () => original('Mostrar tu copia secreta de recuperación; guárdala fuera del dispositivo y no la envíes a un servicio',
      async (value, _key, _before, raw, root) => JSON.stringify({ version: 1,
        profile: 'LIANUM_DEVICE_LOCAL_NOTE_BACKUP_V1', rootHex: bytesToHex(root), rootId: value.rootId,
        revision: value.revision, recordSHA256: await digest(encoded(envelope(raw))), encryptedRecord: raw })),
    /** Creates a real cryptographic opening with native random entropy, while
     * retaining UNISSUED. It neither issues a note nor signs a spend. */
    prepareUnissuedBalanceNote: (input: { scope: string; policy: string; pool: string; recipient: string; amount: string }) => {
      const terms = { scope: hex(input.scope), policy: hex(input.policy), pool: hex(input.pool, 20), recipient: hex(input.recipient, 20), amount: input.amount };
      localNoteUintBytesV1(terms.amount);
      if (BigInt(terms.amount) <= 0n || terms.pool === terms.recipient || terms.pool === '0'.repeat(40) || terms.recipient === '0'.repeat(40)) bad();
      return original('Preparar una nota local sin financiarla ni autorizar gasto', async (value, key, before, raw) => {
        if (value.note !== null) bad('MOBILE_LOCAL_NOTE_ORIGINAL_REQUIRED');
        if (value.revision >= Number.MAX_SAFE_INTEGER) bad('MOBILE_LOCAL_NOTE_CAPACITY');
        let secretKey: Uint8Array | null = null;
        let rho: Uint8Array | null = null, secret: Uint8Array | null = null;
        try {
          rho = await randomWithinScope(scope); secret = await randomWithinScope(scope);
          for (let attempt = 0; attempt < 16; attempt++) {
            const candidate = await randomWithinScope(scope);
            if (secp256k1.utils.isValidSecretKey(candidate)) { secretKey = candidate; break; } candidate.fill(0);
          }
          if (!secretKey) bad('MOBILE_ENTROPY_FAILED');
          const pub = bytesToHex(secp256k1.getPublicKey(secretKey, false));
          const opening: LocalBalanceOpeningV1 = { type: 4, rho: bytesToHex(rho), secret: bytesToHex(secret),
            x: pub.slice(2, 66), y: pub.slice(66), value: terms.amount };
          const note: PreparedNote = { scope: terms.scope, policy: terms.policy, pool: terms.pool, recipient: terms.recipient,
            privateKey: bytesToHex(secretKey), commitment: await checked(scope, () => digest(localBalanceCommitmentMessageV1(terms.scope, terms.policy, opening))), opening, status: 'UNISSUED' };
          const next: State = { version: 1, rootId: value.rootId, revision: value.revision + 1, note };
          const nextRaw = await checked(scope, () => sealedRecord(key, next)); current();
          if (await checked(scope, () => SecureStore.getItemAsync(POINTER, DATA)) !== before || await checked(scope, () => SecureStore.getItemAsync(RECORD, DATA)) !== raw)
            bad('MOBILE_LOCAL_NOTE_STORAGE_CHANGED');
          current();
          try {
            await writeCheckedScoped(scope, RECORD, nextRaw, DATA);
            const readback = await checked(scope, () => decrypted(key, nextRaw)); current();
            await writeCheckedScoped(scope, POINTER, JSON.stringify({ version: 1, rootId: value.rootId, revision: next.revision,
              recordSHA256: await checked(scope, () => digest(encoded(envelope(nextRaw)))), state: 'ACTIVE' }), DATA);
            current(); return summary(readback);
          } catch (cause) { closed = true; throw new Error('MOBILE_LOCAL_NOTE_WRITE_UNCERTAIN', { cause }); }
        } finally { secretKey?.fill(0); rho?.fill(0); secret?.fill(0); }
      });
    },
    /** Review only the retained UNISSUED note. No arbitrary message/statement,
     * spend, issuance, proof, network or backend approval is exposed. */
    reviewPreparedDeposit: (input: LocalDepositChoiceV1): Promise<LocalDepositReviewV1> => {
      current(); discardReview();
      const choice = normalizeLocalDepositChoiceV1(input);
      return original('Revisar una firma local de depósito; la nota sigue sin financiar y no se enviará a la red',
        async value => {
          if (!value.note) bad('MOBILE_LOCAL_NOTE_ORIGINAL_REQUIRED');
          const note = preparedSummary(value.note), statement = localUnissuedDepositStatementV1(note, choice);
          const frame = localUnissuedDepositFrameV1(note, choice);
          let random: Uint8Array | null = null;
          try {
            const frameSHA256 = await checked(scope, () => digest(frame));
            if (value.note.depositIntent && JSON.stringify(value.note.depositIntent) !== JSON.stringify({ ...choice, frameSHA256 }))
              bad('MOBILE_LOCAL_DEPOSIT_INTENT_CONFLICT');
            random = await randomWithinScope(scope);
            if (random.length !== 32 || random.every(byte => byte === 0)) bad('MOBILE_ENTROPY_FAILED');
            const createdAt = Date.now();
            if (!Number.isSafeInteger(createdAt) || createdAt < 0 || createdAt > Number.MAX_SAFE_INTEGER - 15_000) bad();
            const review: LocalDepositReviewV1 = Object.freeze({ version: 1, profile: 'LOCAL_UNISSUED_DEPOSIT_REVIEW_V1',
              reviewId: bytesToHex(random), rootId: value.rootId, revision: value.revision,
              createdAt, expiresAt: createdAt + 15_000, note, choice, statement });
            current(); reviews.set(review, choice); pendingReview = review; return review;
          } finally { frame.fill(0); random?.fill(0); }
        });
    },
    /** Consumes the exact local review before the first await. A single intent
     * is encrypted/read back before signing. Reopen can reauthorize only its
     * same terms; copies, another root/revision/choice or expired consent fail.
     * This restriction is local, not anti-rollback/global issuance protection. */
    signPreparedDeposit: (review: LocalDepositReviewV1): Promise<LocalDepositSignatureV1> => {
      current();
      const choice = reviews.get(review);
      if (!choice || pendingReview !== review || review.rootId !== expectedRootId
        || Date.now() < review.createdAt || Date.now() >= review.expiresAt) bad('MOBILE_LOCAL_DEPOSIT_REVIEW_INVALID');
      reviews.delete(review); pendingReview = null;
      const signing: RootOperationScope = {
        current() { current(); if (Date.now() < review.createdAt || Date.now() >= review.expiresAt) bad('MOBILE_LOCAL_DEPOSIT_REVIEW_EXPIRED'); },
        writeStarted() { signing.current(); scope.writeStarted(); },
      };
      return original('Firmar sólo el depósito ' + choice.relation + ' de ' + review.note.amount
        + ' unidades para la nota local ' + review.note.commitment.slice(0, 12) + '; no financiar ni enviar',
        async (value, key, before, raw, root) => {
          signing.current();
          if (!value.note || value.rootId !== review.rootId || value.revision !== review.revision
            || JSON.stringify(preparedSummary(value.note)) !== JSON.stringify(review.note)) bad('MOBILE_LOCAL_DEPOSIT_REVIEW_CHANGED');
          const frame = localUnissuedDepositFrameV1(preparedSummary(value.note), choice);
          let secretKey: Uint8Array | null = null;
          try {
            const frameSHA256 = await checked(signing, () => digest(frame));
            const intent: DepositIntent = Object.freeze({ ...choice, frameSHA256 });
            let finalValue = value, finalRaw = raw, finalPointer = before;
            if (value.note.depositIntent) {
              if (JSON.stringify(value.note.depositIntent) !== JSON.stringify(intent)) bad('MOBILE_LOCAL_DEPOSIT_INTENT_CONFLICT');
            } else {
              if (value.revision >= Number.MAX_SAFE_INTEGER) bad('MOBILE_LOCAL_NOTE_CAPACITY');
              const next: State = { ...value, revision: value.revision + 1, note: { ...value.note, depositIntent: intent } };
              const nextRaw = await checked(signing, () => sealedRecord(key, next));
              if (await checked(signing, () => SecureStore.getItemAsync(POINTER, DATA)) !== before
                || await checked(signing, () => SecureStore.getItemAsync(RECORD, DATA)) !== raw
                || await checked(signing, () => SecureStore.getItemAsync(ROOT, PRIVATE)) !== bytesToHex(root))
                bad('MOBILE_LOCAL_NOTE_STORAGE_CHANGED');
              try {
                await writeCheckedScoped(signing, RECORD, nextRaw, DATA);
                const readback = await checked(signing, () => decrypted(key, nextRaw));
                if (!readback.note || JSON.stringify(readback.note.depositIntent) !== JSON.stringify(intent)
                  || JSON.stringify(preparedSummary(readback.note)) !== JSON.stringify(review.note)) bad();
                const nextPointer = JSON.stringify({ version: 1, rootId: value.rootId, revision: next.revision,
                  recordSHA256: await checked(signing, () => digest(encoded(envelope(nextRaw)))), state: 'ACTIVE' });
                if (await checked(signing, () => SecureStore.getItemAsync(POINTER, DATA)) !== before
                  || await checked(signing, () => SecureStore.getItemAsync(RECORD, DATA)) !== nextRaw) bad('MOBILE_LOCAL_NOTE_STORAGE_CHANGED');
                await writeCheckedScoped(signing, POINTER, nextPointer, DATA);
                finalValue = readback; finalRaw = nextRaw; finalPointer = nextPointer;
              } catch (cause) { closed = true; throw new Error('MOBILE_LOCAL_NOTE_WRITE_UNCERTAIN', { cause }); }
            }
            if (await checked(signing, () => SecureStore.getItemAsync(POINTER, DATA)) !== finalPointer
              || await checked(signing, () => SecureStore.getItemAsync(RECORD, DATA)) !== finalRaw
              || await checked(signing, () => SecureStore.getItemAsync(ROOT, PRIVATE)) !== bytesToHex(root)) bad('MOBILE_LOCAL_NOTE_STORAGE_CHANGED');
            if (!finalValue.note) bad();
            signing.current(); secretKey = privateKeyFromHex(finalValue.note.privateKey);
            const signature = signDeviceMessage(secretKey, frame); signing.current();
            return Object.freeze({ version: 1, relation: choice.relation, rootId: value.rootId,
              revision: finalValue.revision, commitment: review.note.commitment, statement: review.statement,
              signature, status: 'UNISSUED', availableBalance: null, nativeEffectsEstablished: false });
          } finally { secretKey?.fill(0); frame.fill(0); }
        });
    },
    close() { discardReview(); closed = true; },
  });
}
