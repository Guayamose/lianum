/** Device-local protected encryption root + one prepared PC23 note.
 * No network, witness export, signing method, ledger credit or backend brand.
 * SecureStore is not a transaction or anti-rollback store. Uncertain writes
 * require explicit recovery; the original ciphertext is never deleted here. */
import * as SecureStore from 'expo-secure-store';
import * as Authentication from 'expo-local-authentication';
import * as Crypto from 'expo-crypto';
import { Platform } from 'react-native';
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { bytesToHex, privateKeyFromHex } from './signing.mjs';
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
  commitment: string; privateKey: string; opening: LocalBalanceOpeningV1; status: 'UNISSUED' };
type State = { version: 1; rootId: string; revision: number; note: PreparedNote | null };
type Pointer = { version: 1; rootId: string; revision: number; recordSHA256: string; state: 'CREATING' | 'ACTIVE' };
type Envelope = { version: 1; rootId: string; revision: number; sealed: string };
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
function parsed(raw: string, fields: string[]): Record<string, unknown> {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > MAX_STORED_BYTES) return bad();
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
    const n = parsed(JSON.stringify(x.note), ['scope', 'policy', 'pool', 'recipient', 'commitment', 'privateKey', 'opening', 'status']);
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
  }
  return { version: 1, rootId: expected.rootId, revision: expected.revision, note };
}
async function protectedConsent(prompt: string): Promise<void> {
  if (!['android', 'ios'].includes(Platform.OS) || !await SecureStore.isAvailableAsync()
    || !SecureStore.canUseBiometricAuthentication() || !await Authentication.hasHardwareAsync()
    || !await Authentication.isEnrolledAsync()) bad('MOBILE_PROTECTED_STORAGE_UNAVAILABLE');
  const reply = await Authentication.authenticateAsync({ promptMessage: prompt, cancelLabel: 'Cancelar',
    disableDeviceFallback: true, biometricsSecurityLevel: 'strong' });
  if (!reply.success) bad('MOBILE_AUTHENTICATION_CANCELLED');
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
async function initialize(root: Uint8Array): Promise<Readonly<{ rootId: string; note: null }>> {
  if (root.length !== 32 || root.every(byte => byte === 0)) bad('MOBILE_ENTROPY_FAILED');
  if ([await SecureStore.getItemAsync(POINTER, DATA), await SecureStore.getItemAsync(RECORD, DATA),
    await SecureStore.getItemAsync(ROOT, PRIVATE)].some(value => value !== null)) bad('MOBILE_LOCAL_NOTE_ALREADY_EXISTS');
  const rootId = await rootIdentity(root), rootHex = bytesToHex(root);
  const creating: Pointer = { version: 1, rootId, revision: 0, recordSHA256: '0'.repeat(64), state: 'CREATING' };
  await writeChecked(POINTER, JSON.stringify(creating), DATA);
  await writeChecked(ROOT, rootHex, PRIVATE);
  let key: Crypto.AESEncryptionKey | null = await Crypto.AESEncryptionKey.import(root);
  try {
    const raw = await sealedRecord(key, { version: 1, rootId, revision: 0, note: null });
    await writeChecked(RECORD, raw, DATA);
    const readback = await decrypted(key, raw); if (readback.note !== null) bad();
    await writeChecked(POINTER, JSON.stringify({ ...creating, recordSHA256: await digest(encoded(envelope(raw))), state: 'ACTIVE' }), DATA);
    return Object.freeze({ rootId, note: null });
  } finally { key = null; }
}
/** Generates only a protected encryption root; it is separate from HTTP ECDSA.
 * No recovery copy/export is implemented. Funding must remain disabled until
 * an explicit backup flow exists; rootId alone cannot recover this key. */
export function createLocalRootNoteVaultV1() {
  return serial(async () => {
    await protectedConsent('Crear una raíz local para cifrar tus notas, distinta de tu identidad HTTP');
    const root = await Crypto.getRandomBytesAsync(32);
    try { return await initialize(root); } finally { root.fill(0); }
  });
}
/** Import is explicit and local. It never replaces an existing root/record. */
export function importLocalRootNoteVaultV1(rootHex: string) {
  return serial(async () => {
    const root = localNoteHexBytesV1(rootHex); if (root.every(byte => byte === 0)) { root.fill(0); return bad(); }
    try { await protectedConsent('Importar tu raíz de recuperación local; no reemplazará otra custodia'); return await initialize(root); }
    finally { root.fill(0); }
  });
}
const summary = (value: State): LocalPreparedNoteSummaryV1 | null => value.note === null ? null : Object.freeze({
  scope: value.note.scope, policy: value.note.policy, pool: value.note.pool, recipient: value.note.recipient,
  commitment: value.note.commitment, amount: value.note.opening.value, status: 'UNISSUED',
  availableBalance: null, nativeEffectsEstablished: false });

/** An original root may recover its stored ciphertext after biometric invalidation
 * or a one-revision uncertain write. Only an interrupted, empty initialization
 * with its original protected root still present may create the missing record. */
export function recoverLocalRootNoteVaultV1(rootHex: string, expectedRevision: number) {
  return serial(async () => {
    const root = localNoteHexBytesV1(rootHex); integer(expectedRevision);
    let key: Crypto.AESEncryptionKey | null = null;
    try {
      await protectedConsent('Recuperar esta custodia local exacta y conservar su nota original');
      if (root.every(byte => byte === 0)) bad('MOBILE_LOCAL_NOTE_RECOVERY_BINDING');
      const before = await SecureStore.getItemAsync(POINTER, DATA), raw = await SecureStore.getItemAsync(RECORD, DATA);
      if (before === null) bad('MOBILE_LOCAL_NOTE_RECOVERY_REQUIRED');
      const p = pointer(before);
      if (await rootIdentity(root) !== p.rootId) bad('MOBILE_LOCAL_NOTE_RECOVERY_BINDING');
      if (raw === null) {
        if (p.state !== 'CREATING' || p.revision !== 0 || expectedRevision !== 0
          || p.recordSHA256 !== '0'.repeat(64)) bad('MOBILE_LOCAL_NOTE_RECOVERY_REQUIRED');
        const originalRoot = await SecureStore.getItemAsync(ROOT, PRIVATE);
        if (originalRoot !== bytesToHex(root)) bad('MOBILE_LOCAL_NOTE_RECOVERY_BINDING');
        key = await Crypto.AESEncryptionKey.import(root);
        const emptyRaw = await sealedRecord(key, { version: 1, rootId: p.rootId, revision: 0, note: null });
        if (await SecureStore.getItemAsync(POINTER, DATA) !== before
          || await SecureStore.getItemAsync(RECORD, DATA) !== null
          || await SecureStore.getItemAsync(ROOT, PRIVATE) !== originalRoot)
          bad('MOBILE_LOCAL_NOTE_STORAGE_CHANGED');
        try {
          await writeChecked(RECORD, emptyRaw, DATA);
          const value = await decrypted(key, emptyRaw);
          if (value.note !== null || value.revision !== 0) bad();
          if (await SecureStore.getItemAsync(POINTER, DATA) !== before
            || await SecureStore.getItemAsync(RECORD, DATA) !== emptyRaw
            || await SecureStore.getItemAsync(ROOT, PRIVATE) !== originalRoot)
            bad('MOBILE_LOCAL_NOTE_STORAGE_CHANGED');
          await writeChecked(POINTER, JSON.stringify({ ...p, state: 'ACTIVE',
            recordSHA256: await digest(encoded(envelope(emptyRaw))) }), DATA);
          return Object.freeze({ rootId: p.rootId, revision: 0, note: null });
        } catch (cause) { throw new Error('MOBILE_LOCAL_NOTE_WRITE_UNCERTAIN', { cause }); }
      }
      const e = envelope(raw);
      if (e.rootId !== p.rootId || e.revision !== expectedRevision
        || e.revision < p.revision || e.revision > p.revision + 1) bad('MOBILE_LOCAL_NOTE_RECOVERY_BINDING');
      key = await Crypto.AESEncryptionKey.import(root);
      const value = await decrypted(key, raw);
      if (await SecureStore.getItemAsync(POINTER, DATA) !== before || await SecureStore.getItemAsync(RECORD, DATA) !== raw)
        bad('MOBILE_LOCAL_NOTE_STORAGE_CHANGED');
      await writeChecked(ROOT, bytesToHex(root), PRIVATE);
      await writeChecked(POINTER, JSON.stringify({ version: 1, rootId: p.rootId, revision: value.revision,
        recordSHA256: await digest(encoded(e)), state: 'ACTIVE' }), DATA);
      return Object.freeze({ rootId: p.rootId, revision: value.revision, note: summary(value) });
    } finally { root.fill(0); key = null; }
  });
}

/** Opens a device-only capability. It is not an original account approval, has
 * no signing/witness method and cannot be imported into a backend WeakMap. */
export function openLocalRootNoteVaultV1(expectedRootId: string) {
  let closed = false;
  const current = () => { if (closed) bad('MOBILE_LOCAL_NOTE_CLOSED'); };
  hex(expectedRootId);
  async function original<T>(prompt: string, work: (value: State, key: Crypto.AESEncryptionKey, originalPointer: string, originalRecord: string) => Promise<T>): Promise<T> {
    return serial(async () => {
      current(); await protectedConsent(prompt); current();
      const before = await SecureStore.getItemAsync(POINTER, DATA), raw = await SecureStore.getItemAsync(RECORD, DATA);
      if (before === null || raw === null) bad('MOBILE_LOCAL_NOTE_RECOVERY_REQUIRED');
      const p = pointer(before), e = envelope(raw);
      if (p.state !== 'ACTIVE' || p.rootId !== expectedRootId || e.rootId !== p.rootId || e.revision !== p.revision
        || await digest(encoded(e)) !== p.recordSHA256) bad('MOBILE_LOCAL_NOTE_RECOVERY_REQUIRED');
      let retained: string | null = await SecureStore.getItemAsync(ROOT, PRIVATE);
      if (retained === null) bad('MOBILE_LOCAL_NOTE_RECOVERY_REQUIRED');
      const root = localNoteHexBytesV1(retained); retained = null;
      let key: Crypto.AESEncryptionKey | null = null;
      try {
        current(); if (await rootIdentity(root) !== expectedRootId) bad('MOBILE_LOCAL_NOTE_ROOT_CHANGED');
        key = await Crypto.AESEncryptionKey.import(root);
        const value = await decrypted(key, raw); current();
        if (await SecureStore.getItemAsync(POINTER, DATA) !== before || await SecureStore.getItemAsync(RECORD, DATA) !== raw)
          bad('MOBILE_LOCAL_NOTE_STORAGE_CHANGED');
        current(); const result = await work(value, key, before, raw); current(); return result;
      } finally { root.fill(0); key = null; retained = null; }
    });
  }
  return Object.freeze({
    readPreparedNote: () => original('Leer tu nota local preparada; todavía no es saldo disponible', async value => summary(value)),
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
        const rho = await Crypto.getRandomBytesAsync(32), secret = await Crypto.getRandomBytesAsync(32);
        try {
          for (let attempt = 0; attempt < 16; attempt++) {
            const candidate = await Crypto.getRandomBytesAsync(32);
            if (secp256k1.utils.isValidSecretKey(candidate)) { secretKey = candidate; break; } candidate.fill(0);
          }
          if (!secretKey) bad('MOBILE_ENTROPY_FAILED');
          const pub = bytesToHex(secp256k1.getPublicKey(secretKey, false));
          const opening: LocalBalanceOpeningV1 = { type: 4, rho: bytesToHex(rho), secret: bytesToHex(secret),
            x: pub.slice(2, 66), y: pub.slice(66), value: terms.amount };
          const note: PreparedNote = { scope: terms.scope, policy: terms.policy, pool: terms.pool, recipient: terms.recipient,
            privateKey: bytesToHex(secretKey), commitment: await digest(localBalanceCommitmentMessageV1(terms.scope, terms.policy, opening)), opening, status: 'UNISSUED' };
          const next: State = { version: 1, rootId: value.rootId, revision: value.revision + 1, note };
          const nextRaw = await sealedRecord(key, next); current();
          if (await SecureStore.getItemAsync(POINTER, DATA) !== before || await SecureStore.getItemAsync(RECORD, DATA) !== raw)
            bad('MOBILE_LOCAL_NOTE_STORAGE_CHANGED');
          current();
          try {
            await writeChecked(RECORD, nextRaw, DATA);
            const readback = await decrypted(key, nextRaw); current();
            await writeChecked(POINTER, JSON.stringify({ version: 1, rootId: value.rootId, revision: next.revision,
              recordSHA256: await digest(encoded(envelope(nextRaw))), state: 'ACTIVE' }), DATA);
            current(); return summary(readback);
          } catch (cause) { closed = true; throw new Error('MOBILE_LOCAL_NOTE_WRITE_UNCERTAIN', { cause }); }
        } finally { secretKey?.fill(0); rho.fill(0); secret.fill(0); }
      });
    },
    close() { closed = true; },
  });
}
