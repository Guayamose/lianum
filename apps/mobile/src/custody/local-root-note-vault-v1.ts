/** Device-local protected encryption root + one PC23 source and its retained
 * change/recovery custody. No network, native send, U/S proof or backend brand.
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
import { normalizeDeviceDepositWitnessV1, deviceDepositWitnessBytesV1, validateDeviceDepositConsentFreshV1,
  type DeviceDepositConsentV1, type DeviceDepositWitnessV1 } from '../../../../packages/mobile-protocol/src/device-deposit-consent-v1.mjs';
import { readDeviceDepositInclusionV1 } from '../api/device-owner-deposit-api-v1';
import { compileLocalFundedBalanceGraphV1, normalizeLocalFundedProposalV1, localFundedOwnerFrameV1,
  localFundedAuthorizationWordsV1, localFundedSpendNullifierV1, localFundedInvoiceFrameV1, localNativeTransferActionCommitmentV1,
  type LocalFundedProposalV1, type LocalFundedStatementV1 } from './funded-balance-owner-codec-v1.mjs';

import { readDeviceReservationQuoteV1, readDeviceReservationInclusionV1 } from '../api/device-owner-reservation-api-v1';
import { normalizeDeviceReservationCapsuleOptionsV1, normalizeDeviceReservationWitnessV1,
  deviceReservationWitnessBytesV1, wipeDeviceReservationWitnessV1, validateDeviceReservationConsentFreshV1,
  type DeviceReservationCapsuleOptionsV1, type DeviceReservationWitnessV1, type DeviceReservationConsentV1 }
  from '../../../../packages/mobile-protocol/src/device-reservation-consent-v1.mjs';

import { readDeviceExitQuoteV1, readDeviceExitConfirmationV1 } from '../api/device-owner-exit-api-v1';
import { localDeviceWithdrawalStatementV1, localDeviceWithdrawalFrameV1, localDeviceWithdrawalWitnessV1,
  type LocalDeviceWithdrawalStatementV1, type LocalDeviceWithdrawalPathV1 } from './device-balance-withdrawal-codec-v1.mjs';
import { normalizeDeviceExitWitnessV1, wipeDeviceExitWitnessV1, deviceExitWitnessBytesV1, validateDeviceExitConsentFreshV1,
  type DeviceExitConsentV1, type DeviceExitWitnessV1 } from '../../../../packages/mobile-protocol/src/device-exit-consent-v1.mjs';
import { readDeviceExecutionReviewV1, readDeviceExecutionTerminalV1, readDeviceExecutionObservationV1 } from '../api/device-owner-execution-api-v1';
import { readDeviceOutputBalanceV1 } from '../api/device-owner-output-balance-api-v1';
import { deviceExecutionConsentMessageV1 } from '../../../../packages/mobile-protocol/src/device-execution-consent-v1.mjs';
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
const MAX_CLEAR_BYTES = 65536, MAX_ENVELOPE_BYTES = 98304, CHUNK_BYTES = 1800, MAX_CHUNKS = 55;
const CHUNK_PROFILE = 'LIANUM_DEVICE_ENCRYPTED_CHUNKS_V1';
const chunkKey = (sha256: string, index: number) => 'lianum.note.record.chunk.v1.' + sha256 + '.' + index;
/** The manifest points only to bounded immutable CIPHERTEXT chunks. Each native
 * SecureStore value remains below 2048 bytes. Pointer/AES/AAD and V1 backups
 * authenticate the same full original envelope, not the manifest as authority. */
async function readStoredRecord(scope?: Pick<RootOperationScope, 'current'>): Promise<string | null> {
  const read = (key: string) => scope ? checked(scope, () => SecureStore.getItemAsync(key, DATA)) : SecureStore.getItemAsync(key, DATA);
  const original = await read(RECORD); if (original === null) return null;
  const value = JSON.parse(original);
  if (value.version !== 2) { envelope(original); return original; }
  const m = parsed(original, ['version', 'profile', 'rootId', 'revision', 'sha256', 'bytes', 'chunks']);
  if (m.profile !== CHUNK_PROFILE) bad();
  const rootId = hex(m.rootId), revision = integer(m.revision), checksum = hex(m.sha256);
  const bytes = integer(m.bytes), count = integer(m.chunks);
  if (bytes <= MAX_STORED_BYTES || bytes > MAX_ENVELOPE_BYTES || count !== Math.ceil(bytes / CHUNK_BYTES)
    || count < 2 || count > MAX_CHUNKS) bad('MOBILE_LOCAL_NOTE_CAPACITY');
  const parts: string[] = [];
  for (let index = 0; index < count; index++) {
    const part = await read(chunkKey(checksum, index));
    if (part === null || part.length !== Math.min(CHUNK_BYTES, bytes - index * CHUNK_BYTES)
      || !/^[\x20-\x7e]+$/.test(part)) bad('MOBILE_LOCAL_NOTE_RECOVERY_REQUIRED');
    parts.push(part);
  }
  const raw = parts.join('');
  if (await (scope ? checked(scope, () => digest(new TextEncoder().encode(raw))) : digest(new TextEncoder().encode(raw))) !== checksum
    || await read(RECORD) !== original) bad('MOBILE_LOCAL_NOTE_STORAGE_CHANGED');
  const e = envelope(raw); if (e.rootId !== rootId || e.revision !== revision) bad(); return raw;
}
async function writeStoredRecord(scope: RootOperationScope, raw: string): Promise<void> {
  scope.current(); const e = envelope(raw);
  if (raw.length <= MAX_STORED_BYTES) { await writeCheckedScoped(scope, RECORD, raw, DATA); return; }
  const checksum = await checked(scope, () => digest(new TextEncoder().encode(raw)));
  const count = Math.ceil(raw.length / CHUNK_BYTES);
  if (count > MAX_CHUNKS) bad('MOBILE_LOCAL_NOTE_CAPACITY');
  for (let index = 0; index < count; index++) {
    const key = chunkKey(checksum, index), part = raw.slice(index * CHUNK_BYTES, (index + 1) * CHUNK_BYTES);
    const previous = await checked(scope, () => SecureStore.getItemAsync(key, DATA));
    if (previous !== null && previous !== part) bad('MOBILE_LOCAL_NOTE_STORAGE_CHANGED');
    if (previous === null) await writeCheckedScoped(scope, key, part, DATA);
    if (await checked(scope, () => SecureStore.getItemAsync(key, DATA)) !== part) bad('MOBILE_LOCAL_NOTE_WRITE_UNCERTAIN');
  }
  const manifest = JSON.stringify({ version: 2, profile: CHUNK_PROFILE, rootId: e.rootId, revision: e.revision,
    sha256: checksum, bytes: raw.length, chunks: count });
  if (manifest.length > MAX_STORED_BYTES) bad('MOBILE_LOCAL_NOTE_CAPACITY');
  // All chunks are retained and read back BEFORE exposing this new revision.
  await writeCheckedScoped(scope, RECORD, manifest, DATA);
  if (await readStoredRecord(scope) !== raw) bad('MOBILE_LOCAL_NOTE_WRITE_UNCERTAIN');
}
type PreparedNote = { scope: string; policy: string; pool: string; recipient: string;
  commitment: string; privateKey: string; opening: LocalBalanceOpeningV1; status: 'UNISSUED' | 'FUNDED'; depositIntent?: DepositIntent;
  deviceJob?: DeviceJob; funding?: DeviceFunding };
type DeviceJob = { jobId: string; origin: string; pairingId: string; noteRevision: number;
  assetIdentity?: string; domainCommitment?: string };
type LocalSpendOpening = { privateKey: string | null; opening: LocalBalanceOpeningV1 };
type DeviceSpend = { version: 1; phase: 'PREPARED' | 'SIGNED'; proposal: LocalFundedProposalV1;
  reservationNonce: string; reserveSecret: string; graphNonce: string; paddingSalts: string[];
  change: LocalSpendOpening; recovery: LocalSpendOpening; statement: LocalFundedStatementV1;
  frameSHA256: string; signature: string | null; preparation?: LocalEnvelopePreparation;
  proofJob?: LocalReservationProofJob; reservation?: LocalReservationReceipt; execution?: LocalNativeExecutionV1;
  exits?: Partial<Record<DeviceExitRoleV1, LocalExitIntentV1>> };
type LocalNativeAttemptV1 = { consentSHA256: string; executionSnapshotSHA256: string };
type LocalNativeTerminalV1 = { transactionHash: string; blockHash: string; blockNumber: string; calldataSHA256: string; outcome: 'FULFILLED' | 'RECOVERED' };
type LocalNativeExecutionV1 = { version: 1; jobId: string; nativeBindingSHA256: string; reservationTransactionHash: string;
  execute?: LocalNativeAttemptV1; recovery?: LocalNativeAttemptV1;
  terminal?: LocalNativeTerminalV1; reorganizations?: LocalNativeTerminalV1[];
  reorganizationPending?: {state: 'OBSERVATION_PENDING'; authorizationSHA256: string; executionSnapshotSHA256: string} };
type DeviceExitRoleV1 = 'change' | 'recovery';
type LocalExitIntentV1 = { version: 1; phase: 'PREPARED' | 'SIGNED'; parentJobId: string; nativeBindingSHA256: string;
  quoteId: string; jobId: string; origin: string; pairingId: string; devicePublicKey: string; rootId: string;
  noteRevision: number; noteRole: DeviceExitRoleV1; statement: LocalDeviceWithdrawalStatementV1;
  path: LocalDeviceWithdrawalPathV1; signature: string | null; witnessSHA256: string | null;
  receipt?: { transactionHash: string; blockHash: string; blockNumber: string; calldataSHA256: string; timestamp: string; domainCommitment: string } };
export type LocalDeviceExitProofRequestV1 = Readonly<{ rootId: string; parentJobId: string; nativeBindingSHA256: string;
  quoteId: string; jobId: string; noteRevision: number; noteRole: DeviceExitRoleV1;
  statement: LocalDeviceWithdrawalStatementV1; witnessSHA256: string; expiresAt: number; close(): void }>;
type LocalReservationReceipt = { jobId: string; transactionHash: string; blockHash: string;
  blockNumber: string; timestamp: string; domainCommitment: string; envelope: string; admissionTag: string };
type LocalEnvelopePreparation = { capsuleOptions: DeviceReservationCapsuleOptionsV1; joinBlinds: string[];
  leafBlinds: string[]; invoiceSignatures: string[] };
type LocalReservationProofJob = { jobId: string; quoteId: string; depositJobId: string; origin: string;
  pairingId: string; devicePublicKey: string; witnessSHA256: string };
export type LocalDeviceAuthorizationRequestV1 = Readonly<{ version: 1; rootId: string; jobId: string;
  depositJobId: string; quoteId: string; witnessSHA256: string; statement: Readonly<LocalFundedStatementV1>;
  custody: LocalDeviceReservationSignatureV1['custody']; expiresAt: number; close(): void }>;

export type LocalDeviceReservationReviewV1 = Readonly<{ version: 1; rootId: string; revision: number;
  operationId: string; sourceCommitment: string; sourceNullifier: string; budget: string; changeAmount: string;
  recoveryAmount: string; graphCommitment: string; reserveCommitment: string; changeCommitment: string;
  recoveryCommitment: string; settleBefore: string; frameSHA256: string; expiresAt: number;
  actions: readonly Readonly<{ id: string; chainDomain: string; evidencePolicy: string; actionCommitment: string;
    payoutCommitment: string; payoutAmount: string }>[];
  nativeTransfers: readonly Readonly<{ chainDomain: string; signerIdentity: string; destinationCommitment: string; amount: string;
    executionFrom: string; executionUntil: string; settleBefore: string }>[] }>;
export type LocalDeviceReservationSignatureV1 = Readonly<{ version: 1; rootId: string; revision: number;
  statement: Readonly<LocalFundedStatementV1>; signature: string; intermediateWords: readonly string[];
  custody: Readonly<{ rootId: string; noteRevision: number; encryptedRecordSHA256: string; frameSHA256: string;
    sourceCommitment: string; sourceNullifier: string; changeCommitment: string; recoveryCommitment: string }> }>;
type DeviceFunding = { transactionHash: string; assetId: string };
export type LocalDeviceProofRequestV1 = Readonly<{ rootId: string; noteRevision: number; commitment: string;
  statement: Readonly<{ scope: string; policy: string; epoch: string; amount: string; output: string }>;
  witnessSHA256: string; jobId: string | null; close(): void }>;
type DepositIntent = LocalDepositChoiceV1 & Readonly<{ frameSHA256: string }>;
export type LocalDepositReviewV1 = Readonly<{ version: 1; profile: 'LOCAL_UNISSUED_DEPOSIT_REVIEW_V1';
  reviewId: string; rootId: string; revision: number; createdAt: number; expiresAt: number;
  note: LocalPreparedNoteSummaryV1; choice: LocalDepositChoiceV1; statement: LocalDepositStatementV1 }>;
export type LocalDepositSignatureV1 = Readonly<{ version: 1; relation: 'D26' | 'D27';
  rootId: string; revision: number; commitment: string; statement: LocalDepositStatementV1;
  signature: string; status: 'UNISSUED'; availableBalance: null; nativeEffectsEstablished: false }>;
type State = { version: 1; rootId: string; revision: number; note: PreparedNote | null; spend?: DeviceSpend };
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
  const x = parsed(raw, ['version', 'rootId', 'revision', 'sealed'], MAX_ENVELOPE_BYTES);
  if (x.version !== 1 || typeof x.sealed !== 'string' || x.sealed.length === 0
    || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(x.sealed)) return bad();
  return { version: 1, rootId: hex(x.rootId), revision: integer(x.revision), sealed: x.sealed };
}
async function state(bytes: Uint8Array, expected: Pick<Envelope, 'rootId' | 'revision'>): Promise<State> {
  const source = new TextDecoder('utf-8', { fatal: true }).decode(bytes), initial: unknown = JSON.parse(source);
  if (!initial || typeof initial !== 'object' || Array.isArray(initial)) bad();
  const x = parsed(source, ['version', 'rootId', 'revision', 'note', ...(Object.hasOwn(initial, 'spend') ? ['spend'] : [])], MAX_CLEAR_BYTES);
  if (x.version !== 1 || x.rootId !== expected.rootId || x.revision !== expected.revision) return bad();
  let note: PreparedNote | null = null;
  if (x.note !== null) {
    const noteData = x.note;
    if (typeof noteData !== 'object' || Array.isArray(noteData)) bad();
    const optional = ['depositIntent', 'deviceJob', 'funding'].filter(field => Object.hasOwn(noteData, field));
    const sourceNote = parsed(JSON.stringify(noteData),
      ['scope', 'policy', 'pool', 'recipient', 'commitment', 'privateKey', 'opening', 'status', ...optional], MAX_CLEAR_BYTES);
    const n = sourceNote;
    const o = parsed(JSON.stringify(n.opening), ['type', 'rho', 'x', 'y', 'value', 'secret']);
    if (o.type !== 4 || !['UNISSUED', 'FUNDED'].includes(String(n.status)) || typeof o.value !== 'string') return bad();
    localNoteUintBytesV1(o.value); if (BigInt(o.value) <= 0n) return bad();
    const opening: LocalBalanceOpeningV1 = { type: 4, rho: hex(o.rho), x: hex(o.x), y: hex(o.y), value: o.value, secret: hex(o.secret) };
    note = { scope: hex(n.scope), policy: hex(n.policy), pool: hex(n.pool, 20), recipient: hex(n.recipient, 20),
      commitment: hex(n.commitment), privateKey: hex(n.privateKey), opening, status: n.status === 'FUNDED' ? 'FUNDED' : 'UNISSUED' };
    if (note.pool === '0'.repeat(40) || note.recipient === '0'.repeat(40) || note.pool === note.recipient) return bad();
    const key = privateKeyFromHex(note.privateKey);
    try {
      const pub = bytesToHex(secp256k1.getPublicKey(key, false));
      if (pub.slice(2, 66) !== opening.x || pub.slice(66) !== opening.y) return bad();
      if (await digest(localBalanceCommitmentMessageV1(note.scope, note.policy, opening)) !== note.commitment) return bad();
    } finally { key.fill(0); }
    if (Object.hasOwn(n, 'depositIntent')) note.depositIntent = await depositIntent(n.depositIntent, note);
    if (Object.hasOwn(n, 'deviceJob')) {
      const j = n.deviceJob;
      if (!j || typeof j !== 'object' || Array.isArray(j)) bad();
      const bound = Object.hasOwn(j, 'assetIdentity') || Object.hasOwn(j, 'domainCommitment');
      const job = parsed(JSON.stringify(j), ['jobId', 'origin', 'pairingId', 'noteRevision',
        ...(bound ? ['assetIdentity', 'domainCommitment'] : [])]);
      if (typeof job.origin !== 'string' || job.origin.length > 64 || !job.origin.startsWith('https://') || !note.depositIntent
        || note.depositIntent.relation !== 'D26') bad();
      note.deviceJob = { jobId: hex(job.jobId), origin: job.origin, pairingId: hex(job.pairingId),
        noteRevision: integer(job.noteRevision), ...(bound ? { assetIdentity: hex(job.assetIdentity), domainCommitment: hex(job.domainCommitment) } : {}) };
    }
    if (Object.hasOwn(n, 'funding')) {
      const funded = parsed(JSON.stringify(n.funding), ['transactionHash', 'assetId']);
      note.funding = { transactionHash: hex(funded.transactionHash), assetId: hex(funded.assetId) };
    }
    if (note.status === 'FUNDED' ? !note.deviceJob || !note.funding : note.funding !== undefined) bad();
  }
  const result: State = { version: 1, rootId: expected.rootId, revision: expected.revision, note };
  if (Object.hasOwn(x, 'spend')) {
    if (!note || note.status !== 'FUNDED') bad('MOBILE_LOCAL_FUNDED_NOTE_REQUIRED');
    result.spend = await retainedSpend(x.spend, note);
    for (const intent of Object.values(result.spend.exits ?? {}))
      if (intent.rootId !== result.rootId || intent.noteRevision > result.revision) bad();
  }
  return result;
}
function compiledSpend(note: PreparedNote, spend: DeviceSpend) {
  return compileLocalFundedBalanceGraphV1({ ...spend.proposal, reservationNonce: spend.reservationNonce,
    reserveSecret: spend.reserveSecret, graphNonce: spend.graphNonce, inputNote: note.opening,
    changeNote: spend.change.opening, recoveryNote: spend.recovery.opening, paddingSalts: spend.paddingSalts });
}
async function retainedSpend(raw: unknown, note: PreparedNote): Promise<DeviceSpend> {
  const value = parsed(JSON.stringify(raw), ['version', 'phase', 'proposal', 'reservationNonce', 'reserveSecret',
    'graphNonce', 'paddingSalts', 'change', 'recovery', 'statement', 'frameSHA256', 'signature',
    ...(raw && typeof raw === 'object' && Object.hasOwn(raw, 'preparation') ? ['preparation'] : []),
    ...(raw && typeof raw === 'object' && Object.hasOwn(raw, 'proofJob') ? ['proofJob'] : []),
    ...(raw && typeof raw === 'object' && Object.hasOwn(raw, 'reservation') ? ['reservation'] : []),
    ...(raw && typeof raw === 'object' && Object.hasOwn(raw, 'execution') ? ['execution'] : []),
    ...(raw && typeof raw === 'object' && Object.hasOwn(raw, 'exits') ? ['exits'] : [])], MAX_CLEAR_BYTES);
  if (value.version !== 1 || !['PREPARED', 'SIGNED'].includes(String(value.phase))) bad();
  const proposal = normalizeLocalFundedProposalV1(value.proposal);
  if (!note.deviceJob?.assetIdentity || proposal.asset !== note.deviceJob.assetIdentity
    || proposal.scope !== note.scope || proposal.policy !== note.policy) bad('MOBILE_LOCAL_ORIGINAL_DOMAIN_CHANGED');
  const validate = async (raw: unknown, amount: string): Promise<LocalSpendOpening> => {
    const item = parsed(JSON.stringify(raw), ['privateKey', 'opening']);
    const record = parsed(JSON.stringify(item.opening), ['type', 'rho', 'x', 'y', 'value', 'secret']);
    if (record.type !== 4 || record.value !== amount) bad();
    const opening: LocalBalanceOpeningV1 = { type: 4, rho: hex(record.rho), x: hex(record.x), y: hex(record.y),
      value: amount, secret: hex(record.secret) };
    if (amount === '0') {
      if (item.privateKey !== null || [opening.rho, opening.x, opening.y, opening.secret].some(value => value !== '0'.repeat(64))) bad();
      return { privateKey: null, opening };
    }
    const privateKey = hex(item.privateKey), key = privateKeyFromHex(privateKey);
    try { const pub = bytesToHex(secp256k1.getPublicKey(key, false));
      if (pub.slice(2, 66) !== opening.x || pub.slice(66) !== opening.y) bad(); }
    finally { key.fill(0); }
    return { privateKey, opening };
  };
  if (!Array.isArray(value.paddingSalts) || value.paddingSalts.length !== 4
    || BigInt(proposal.budget) > BigInt(note.opening.value)) bad();
  const spend: DeviceSpend = { version: 1, phase: value.phase === 'SIGNED' ? 'SIGNED' : 'PREPARED', proposal,
    reservationNonce: hex(value.reservationNonce), reserveSecret: hex(value.reserveSecret), graphNonce: hex(value.graphNonce),
    paddingSalts: value.paddingSalts.map(value => hex(value)),
    change: await validate(value.change, String(BigInt(note.opening.value) - BigInt(proposal.budget))),
    recovery: await validate(value.recovery, proposal.budget), statement: value.statement as LocalFundedStatementV1,
    frameSHA256: hex(value.frameSHA256), signature: value.signature === null ? null : hex(value.signature, 64) };
  if (Object.hasOwn(value, 'preparation')) {
    const prep = parsed(JSON.stringify(value.preparation), ['capsuleOptions', 'joinBlinds', 'leafBlinds', 'invoiceSignatures'], MAX_CLEAR_BYTES);
    const list = (raw: unknown, count: number, width = 32): string[] => {
      if (!Array.isArray(raw) || raw.length !== count) bad(); return raw.map(item => hex(item, width)); };
    spend.preparation = { capsuleOptions: normalizeDeviceReservationCapsuleOptionsV1(prep.capsuleOptions),
      joinBlinds: list(prep.joinBlinds, 4), leafBlinds: list(prep.leafBlinds, 16),
      invoiceSignatures: list(prep.invoiceSignatures, proposal.nodes.length, 64) };
    validatePreparedInvoices(spend, note);
  }
  if (Object.hasOwn(value, 'proofJob')) {
    if (!spend.preparation || spend.phase !== 'SIGNED' || !spend.signature) bad();
    const job = parsed(JSON.stringify(value.proofJob), ['jobId', 'quoteId', 'depositJobId', 'origin', 'pairingId', 'devicePublicKey', 'witnessSHA256']);
    if (typeof job.origin !== 'string' || job.origin !== note.deviceJob?.origin || job.pairingId !== note.deviceJob.pairingId
      || job.depositJobId !== note.deviceJob.jobId) bad('MOBILE_LOCAL_ORIGINAL_DOMAIN_CHANGED');
    spend.proofJob = { jobId: hex(job.jobId), quoteId: hex(job.quoteId), depositJobId: hex(job.depositJobId), origin: job.origin,
      pairingId: hex(job.pairingId), devicePublicKey: hex(job.devicePublicKey, 65), witnessSHA256: hex(job.witnessSHA256) };
    const request = reservationWitness(note, spend), bytes = deviceReservationWitnessBytesV1(request);
    try { if (await digest(bytes) !== spend.proofJob.witnessSHA256) bad(); }
    finally { bytes.fill(0); wipeDeviceReservationWitnessV1(request); }
  }
  if (Object.hasOwn(value, 'reservation')) {
    if (!spend.proofJob || !spend.signature) bad();
    const r = parsed(JSON.stringify(value.reservation), ['jobId', 'transactionHash', 'blockHash', 'blockNumber',
      'timestamp', 'domainCommitment', 'envelope', 'admissionTag']);
    if (r.jobId !== spend.proofJob.jobId || r.domainCommitment !== note.deviceJob?.domainCommitment) bad();
    if (typeof r.blockNumber !== 'string' || typeof r.timestamp !== 'string') bad();
    localNoteUintBytesV1(r.blockNumber); localNoteUintBytesV1(r.timestamp);
    spend.reservation = { jobId: hex(r.jobId), transactionHash: hex(r.transactionHash), blockHash: hex(r.blockHash),
      blockNumber: r.blockNumber, timestamp: r.timestamp, domainCommitment: hex(r.domainCommitment),
      envelope: hex(r.envelope), admissionTag: hex(r.admissionTag) };
  }
  if (Object.hasOwn(value, 'execution')) {
    if (!spend.reservation || !spend.proofJob || !value.execution || typeof value.execution !== 'object') bad();
    const source = value.execution;
    const e = parsed(JSON.stringify(source), ['version', 'jobId', 'nativeBindingSHA256', 'reservationTransactionHash',
      ...['execute', 'recovery', 'terminal', 'reorganizations', 'reorganizationPending'].filter(name => Object.hasOwn(source, name))], MAX_CLEAR_BYTES);
    if (e.version !== 1 || e.jobId !== spend.proofJob.jobId || e.reservationTransactionHash !== spend.reservation.transactionHash
      || !['execute', 'recovery', 'terminal'].some(name => Object.hasOwn(e, name))) bad();
    const execution: LocalNativeExecutionV1 = { version: 1, jobId: hex(e.jobId), nativeBindingSHA256: hex(e.nativeBindingSHA256),
      reservationTransactionHash: hex(e.reservationTransactionHash) };
    for (const name of ['execute', 'recovery'] as const) if (Object.hasOwn(e, name)) {
      const attempt = parsed(JSON.stringify(e[name]), ['consentSHA256', 'executionSnapshotSHA256']);
      execution[name] = { consentSHA256: hex(attempt.consentSHA256), executionSnapshotSHA256: hex(attempt.executionSnapshotSHA256) };
    }
    if (Object.hasOwn(e, 'terminal')) {
      const terminal = parsed(JSON.stringify(e.terminal), ['transactionHash', 'blockHash', 'blockNumber', 'calldataSHA256', 'outcome']);
      if (!['FULFILLED', 'RECOVERED'].includes(String(terminal.outcome)) || typeof terminal.blockNumber !== 'string') bad();
      localNoteUintBytesV1(terminal.blockNumber);
      execution.terminal = { transactionHash: hex(terminal.transactionHash), blockHash: hex(terminal.blockHash), blockNumber: terminal.blockNumber,
        calldataSHA256: hex(terminal.calldataSHA256), outcome: terminal.outcome === 'FULFILLED' ? 'FULFILLED' : 'RECOVERED' };
    }
    if (Object.hasOwn(e, 'reorganizations')) {
      if (!execution.terminal || execution.terminal.outcome !== 'RECOVERED' || !Array.isArray(e.reorganizations)
        || e.reorganizations.length < 1 || e.reorganizations.length > 16) bad();
      const blocks = new Set<string>([execution.terminal.blockHash]);
      execution.reorganizations = [];
      for (const original of e.reorganizations) {
        const row = parsed(JSON.stringify(original), ['transactionHash', 'blockHash', 'blockNumber', 'calldataSHA256', 'outcome']);
        if (row.outcome !== 'RECOVERED' || row.transactionHash !== execution.terminal.transactionHash
          || row.calldataSHA256 !== execution.terminal.calldataSHA256 || typeof row.blockNumber !== 'string') bad();
        localNoteUintBytesV1(row.blockNumber);
        const blockHash = hex(row.blockHash); if (blocks.has(blockHash)) bad(); blocks.add(blockHash);
        execution.reorganizations.push({ transactionHash: hex(row.transactionHash), blockHash, blockNumber: row.blockNumber,
          calldataSHA256: hex(row.calldataSHA256), outcome: 'RECOVERED' });
      }
    }
    if (Object.hasOwn(e, 'reorganizationPending')) {
      const pending = parsed(JSON.stringify(e.reorganizationPending), ['state','authorizationSHA256','executionSnapshotSHA256']);
      if (pending.state !== 'OBSERVATION_PENDING' || execution.terminal?.outcome !== 'RECOVERED') bad();
      execution.reorganizationPending = {state:'OBSERVATION_PENDING', authorizationSHA256:hex(pending.authorizationSHA256),
        executionSnapshotSHA256:hex(pending.executionSnapshotSHA256)};
    }
    spend.execution = execution;
  }
  if (Object.hasOwn(value, 'exits')) {
    if (!spend.reservation || !spend.proofJob || !value.exits || typeof value.exits !== 'object' || Array.isArray(value.exits)) bad();
    const roles = Object.keys(value.exits); if (roles.length < 1 || roles.some(role => !['change', 'recovery'].includes(role))) bad();
    spend.exits = {};
    for (const rawRole of roles) {
      const role = rawRole as DeviceExitRoleV1, source = (value.exits as Record<string, unknown>)[role];
      const e = parsed(JSON.stringify(source), ['version', 'phase', 'parentJobId', 'nativeBindingSHA256', 'quoteId', 'jobId',
        'origin', 'pairingId', 'devicePublicKey', 'rootId', 'noteRevision', 'noteRole', 'statement', 'path', 'signature', 'witnessSHA256',
        ...(source && typeof source === 'object' && Object.hasOwn(source, 'receipt') ? ['receipt'] : [])], MAX_CLEAR_BYTES);
      if (e.version !== 1 || !['PREPARED', 'SIGNED'].includes(String(e.phase)) || e.parentJobId !== spend.proofJob.jobId
        || e.origin !== spend.proofJob.origin || e.pairingId !== spend.proofJob.pairingId || e.devicePublicKey !== spend.proofJob.devicePublicKey
        || e.noteRole !== role || e.noteRevision !== integer(e.noteRevision)) bad();
      const storedStatement = e.statement as LocalDeviceWithdrawalStatementV1, member = e.path as LocalDeviceWithdrawalPathV1;
      const statement = localDeviceWithdrawalStatementV1({ scope: note.scope, policy: note.policy, epoch: storedStatement.epoch,
        opening: spend[role].opening, path: member, recipient: storedStatement.recipient });
      if (JSON.stringify(statement) !== JSON.stringify(storedStatement) || statement.commitment !== spend.statement[role === 'change' ? 'changeCommitment' : 'recoveryCommitment']) bad();
      const retained: LocalExitIntentV1 = { version: 1, phase: e.phase === 'SIGNED' ? 'SIGNED' : 'PREPARED',
        parentJobId: hex(e.parentJobId), nativeBindingSHA256: hex(e.nativeBindingSHA256), quoteId: hex(e.quoteId), jobId: hex(e.jobId),
        origin: e.origin as string, pairingId: hex(e.pairingId), devicePublicKey: hex(e.devicePublicKey, 65), rootId: hex(e.rootId),
        noteRevision: integer(e.noteRevision), noteRole: role, statement, path: member,
        signature: e.signature === null ? null : hex(e.signature, 64), witnessSHA256: e.witnessSHA256 === null ? null : hex(e.witnessSHA256) };
      if ((retained.phase === 'SIGNED') !== (retained.signature !== null && retained.witnessSHA256 !== null)) bad();
      if (retained.phase === 'PREPARED' && (retained.signature !== null || retained.witnessSHA256 !== null)) bad();
      if (retained.signature) {
        const frame = localDeviceWithdrawalFrameV1(statement), opening = spend[role].opening;
        try { if (!secp256k1.verify(localNoteHexBytesV1(retained.signature, 64), frame,
          localNoteHexBytesV1('04' + opening.x + opening.y, 65), { prehash: true, lowS: true })) bad(); }
        finally { frame.fill(0); }
        const witness = localDeviceWithdrawalWitnessV1({ statement, opening, path: member, signature: retained.signature }), bytes = deviceExitWitnessBytesV1(witness);
        try { if (await digest(bytes) !== retained.witnessSHA256) bad(); } finally { bytes.fill(0); wipeDeviceExitWitnessV1(witness); }
      }
      if (Object.hasOwn(e, 'receipt')) {
        if (retained.phase !== 'SIGNED') bad();
        const r = parsed(JSON.stringify(e.receipt), ['transactionHash', 'blockHash', 'blockNumber', 'calldataSHA256', 'timestamp', 'domainCommitment']);
        if (typeof r.blockNumber !== 'string' || typeof r.timestamp !== 'string' || r.domainCommitment !== note.deviceJob?.domainCommitment) bad();
        localNoteUintBytesV1(r.blockNumber); localNoteUintBytesV1(r.timestamp);
        retained.receipt = { transactionHash: hex(r.transactionHash), blockHash: hex(r.blockHash), blockNumber: r.blockNumber,
          calldataSHA256: hex(r.calldataSHA256), timestamp: r.timestamp, domainCommitment: hex(r.domainCommitment) };
      }
      spend.exits[role] = retained;
    }
  }
  const compiled = compiledSpend(note, spend), frame = localFundedOwnerFrameV1(compiled.authorizationStatement);
  try {
    if (JSON.stringify(compiled.authorizationStatement) !== JSON.stringify(value.statement)
      || await digest(frame) !== spend.frameSHA256 || (spend.phase === 'SIGNED') !== (spend.signature !== null)) bad();
    if (spend.signature && !secp256k1.verify(localNoteHexBytesV1(spend.signature, 64), frame,
      localNoteHexBytesV1('04' + note.opening.x + note.opening.y, 65), { prehash: true, lowS: true })) bad();
  } finally { frame.fill(0); }
  return spend;
}
function validatePreparedInvoices(spend: DeviceSpend, note: PreparedNote) {
  const preparation = spend.preparation; if (!preparation) bad('MOBILE_LOCAL_ORIGINAL_QUOTE_REQUIRED');
  const compiled = compiledSpend(note, spend);
  if (preparation.capsuleOptions.nodes.length !== compiled.ownerWitness.graph.nodes.length) bad();
  for (let slot = 0; slot < compiled.ownerWitness.graph.nodes.length; slot++) {
    const node = compiled.ownerWitness.graph.nodes[slot], action = preparation.capsuleOptions.nodes[slot];
    if (action.id !== node.id || action.action.chainDomain !== node.chainDomain
      || localNativeTransferActionCommitmentV1(action.action) !== node.actionCommitment
      || action.action.settleBefore !== spend.proposal.settleBefore) bad('MOBILE_LOCAL_ORIGINAL_QUOTE_CHANGED');
    const frame = localFundedInvoiceFrameV1(compiled.authorizationStatement, node, slot), payout = spend.proposal.nodes[slot].payout;
    try { if (!secp256k1.verify(localNoteHexBytesV1(preparation.invoiceSignatures[slot], 64), frame,
      localNoteHexBytesV1('04' + payout.x + payout.y, 65), { prehash: true, lowS: true })) bad('MOBILE_LOCAL_RECIPIENT_INVOICE_REQUIRED'); }
    finally { frame.fill(0); }
  }
}
function reservationWitness(note: PreparedNote, spend: DeviceSpend): DeviceReservationWitnessV1 {
  if (!spend.preparation || !spend.signature || spend.phase !== 'SIGNED') bad('MOBILE_LOCAL_PROOF_SIGNATURE_REQUIRED');
  return normalizeDeviceReservationWitnessV1({ input: { ...spend.proposal, reservationNonce: spend.reservationNonce,
    reserveSecret: spend.reserveSecret, graphNonce: spend.graphNonce, inputNote: { ...note.opening },
    changeNote: { ...spend.change.opening }, recoveryNote: { ...spend.recovery.opening }, paddingSalts: [...spend.paddingSalts] },
    ownerSignature: spend.signature, invoiceSignatures: [...spend.preparation.invoiceSignatures],
    envelopePreparation: { capsuleOptions: spend.preparation.capsuleOptions, joinBlinds: [...spend.preparation.joinBlinds],
      leafBlinds: [...spend.preparation.leafBlinds] } });
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
    if (clear.length > MAX_CLEAR_BYTES) bad('MOBILE_LOCAL_NOTE_CAPACITY');
    const sealed = await Crypto.aesEncryptAsync(clear, key, { nonce: { length: 12 }, tagLength: 16, additionalData: binding(value) });
    const raw = JSON.stringify({ version: 1, rootId: value.rootId, revision: value.revision, sealed: await sealed.combined('base64') });
    if (raw.length > MAX_ENVELOPE_BYTES) bad('MOBILE_LOCAL_NOTE_CAPACITY');
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
  if ([await checked(scope, () => SecureStore.getItemAsync(POINTER, DATA)), await readStoredRecord(scope),
    await checked(scope, () => SecureStore.getItemAsync(ROOT, PRIVATE))].some(value => value !== null)) bad('MOBILE_LOCAL_NOTE_ALREADY_EXISTS');
  const rootId = await checked(scope, () => rootIdentity(root)), rootHex = bytesToHex(root);
  const creating: Pointer = { version: 1, rootId, revision: 0, recordSHA256: '0'.repeat(64), state: 'CREATING' };
  await writeCheckedScoped(scope, POINTER, JSON.stringify(creating), DATA);
  await writeCheckedScoped(scope, ROOT, rootHex, PRIVATE);
  let key: Crypto.AESEncryptionKey | null = null;
  try {
    const activeKey = key = await checked(scope, () => Crypto.AESEncryptionKey.import(root));
    const raw = await checked(scope, () => sealedRecord(activeKey, { version: 1, rootId, revision: 0, note: null }));
    await writeStoredRecord(scope, raw);
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
const preparedSummary = (note: PreparedNote): LocalPreparedNoteSummaryV1 => {
  if (note.status !== 'UNISSUED') bad('MOBILE_LOCAL_NOTE_ALREADY_FUNDED');
  return Object.freeze({
  scope: note.scope, policy: note.policy, pool: note.pool, recipient: note.recipient,
  commitment: note.commitment, amount: note.opening.value, status: 'UNISSUED',
  availableBalance: null, nativeEffectsEstablished: false }); };
const summary = (value: State): LocalPreparedNoteSummaryV1 | null => value.note === null || value.note.status !== 'UNISSUED' ? null : preparedSummary(value.note);
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
  // Historical framing of the retained deposit intent also verifies a funded
  // record. This does not change that note's status or authorize another job.
  const frame = localUnissuedDepositFrameV1({ scope: note.scope, policy: note.policy, pool: note.pool,
    recipient: note.recipient, commitment: note.commitment, amount: note.opening.value,
    status: 'UNISSUED', availableBalance: null, nativeEffectsEstablished: false }, choice);
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
      const before = await checked(scope, () => SecureStore.getItemAsync(POINTER, DATA)), raw = await readStoredRecord(scope);
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
          || await readStoredRecord(scope) !== null
          || await checked(scope, () => SecureStore.getItemAsync(ROOT, PRIVATE)) !== originalRoot)
          bad('MOBILE_LOCAL_NOTE_STORAGE_CHANGED');
        try {
          await writeStoredRecord(scope, emptyRaw);
          const value = await checked(scope, () => decrypted(activeKey, emptyRaw));
          if (value.note !== null || value.revision !== 0) bad();
          if (await checked(scope, () => SecureStore.getItemAsync(POINTER, DATA)) !== before
            || await readStoredRecord(scope) !== emptyRaw
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
      if (await checked(scope, () => SecureStore.getItemAsync(POINTER, DATA)) !== before || await readStoredRecord(scope) !== raw)
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
    const before = await SecureStore.getItemAsync(POINTER, DATA), raw = await readStoredRecord();
    if (before === null) return Object.freeze({ ...base, status: raw === null ? 'ABSENT_METADATA' : 'RECOVERY_REQUIRED',
      rootId: null, revision: null, recordRevision: null, encryptedRecordPresent: raw !== null });
    const p = pointer(before), e = raw === null ? null : envelope(raw);
    const active = p.state === 'ACTIVE' && e !== null && e.rootId === p.rootId && e.revision === p.revision
      && await digest(encoded(e)) === p.recordSHA256;
    if (await SecureStore.getItemAsync(POINTER, DATA) !== before || await readStoredRecord() !== raw)
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
    const b = parsed(backupJSON, ['version', 'profile', 'rootHex', 'rootId', 'revision', 'recordSHA256', 'encryptedRecord'], MAX_ENVELOPE_BYTES + 1024);
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
      const before = await checked(scope, () => SecureStore.getItemAsync(POINTER, DATA)),
        originalPhysical = await checked(scope, () => SecureStore.getItemAsync(RECORD, DATA)),
        originalRoot = await checked(scope, () => SecureStore.getItemAsync(ROOT, PRIVATE));
      let originalRecord: string | null, missingOriginalChunks = false;
      try { originalRecord = await readStoredRecord(scope); }
      catch (cause) {
        if (!(cause instanceof Error) || cause.message !== 'MOBILE_LOCAL_NOTE_RECOVERY_REQUIRED'
          || originalPhysical === null) throw cause;
        // Only fill missing chunks of this already authenticated EXACT backup.
        // Never overwrite an existing different part, accept a changed manifest,
        // re-encrypt/rotate a root, or roll back to another envelope/revision.
        const m = parsed(originalPhysical, ['version', 'profile', 'rootId', 'revision', 'sha256', 'bytes', 'chunks']);
        if (m.version !== 2 || m.profile !== CHUNK_PROFILE || m.rootId !== rootId || m.revision !== revision
          || m.bytes !== raw.length || m.chunks !== Math.ceil(raw.length / CHUNK_BYTES)
          || m.sha256 !== await checked(scope, () => digest(new TextEncoder().encode(raw)))) bad('MOBILE_LOCAL_NOTE_BACKUP_CONFLICT');
        for (let index = 0; index < Number(m.chunks); index++) {
          const part = await checked(scope, () => SecureStore.getItemAsync(chunkKey(String(m.sha256), index), DATA));
          if (part !== null && part !== raw.slice(index * CHUNK_BYTES, (index + 1) * CHUNK_BYTES)) bad('MOBILE_LOCAL_NOTE_BACKUP_CONFLICT');
        }
        originalRecord = raw; missingOriginalChunks = true;
      }
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
        || (missingOriginalChunks
          ? await checked(scope, () => SecureStore.getItemAsync(RECORD, DATA)) !== originalPhysical
          : await readStoredRecord(scope) !== originalRecord)
        || await checked(scope, () => SecureStore.getItemAsync(ROOT, PRIVATE)) !== originalRoot) bad('MOBILE_LOCAL_NOTE_STORAGE_CHANGED');
      const target = { version: 1 as const, rootId, revision, recordSHA256: hex(b.recordSHA256), state: 'ACTIVE' as const };
      try {
        const retainedPointer = before ?? JSON.stringify({ ...target, state: 'CREATING' });
        if (before === null) await writeCheckedScoped(scope, POINTER, retainedPointer, DATA);
        if (originalRoot === null) await writeCheckedScoped(scope, ROOT, bytesToHex(root), PRIVATE);
        if (originalRecord === null || missingOriginalChunks) await writeStoredRecord(scope, raw);
        if (await readStoredRecord(scope) !== raw
          || await checked(scope, () => SecureStore.getItemAsync(ROOT, PRIVATE)) !== bytesToHex(root)
          || await checked(scope, () => SecureStore.getItemAsync(POINTER, DATA)) !== retainedPointer) bad('MOBILE_LOCAL_NOTE_STORAGE_CHANGED');
        await writeCheckedScoped(scope, POINTER, JSON.stringify(target), DATA);
        scope.current(); return Object.freeze({ rootId, revision, note: summary(value) });
      } catch (cause) { throw new Error('MOBILE_LOCAL_NOTE_WRITE_UNCERTAIN', { cause }); }
    } finally { root.fill(0); key = null; }
  });
}

/** Opens a device-only capability. It is not an original account approval and
 * cannot be imported into a backend WeakMap. Its source-note signatures require
 * exact local reviews and retained custody before leaving this capability.
 * Deposit intent is only local accidental-reuse protection, not global uniqueness:
 * an older backup/other device can lack it. Pools/nullifiers/ledger remain mandatory. */
export function openLocalRootNoteVaultV1(expectedRootId: string) {
  let closed = false, active = false, writing = false;
  const current = () => { if (closed) bad(active && writing ? 'MOBILE_LOCAL_NOTE_WRITE_UNCERTAIN' : 'MOBILE_LOCAL_NOTE_CLOSED'); };
  const scope: RootOperationScope = { current, writeStarted() { current(); writing = true; } };
  const reviews = new WeakMap<LocalDepositReviewV1, LocalDepositChoiceV1>();
  const reservationReviews = new WeakMap<LocalDeviceReservationReviewV1, { createdAt: number; frameSHA256: string }>();
  let pendingReservation: LocalDeviceReservationReviewV1 | null = null;
  const reservationSignatures = new WeakMap<LocalDeviceReservationSignatureV1, number>();
  const authorizationRequests = new WeakMap<LocalDeviceAuthorizationRequestV1, { witness: DeviceReservationWitnessV1;
    quote: object; consumed: boolean }>();
  const exitRequests = new WeakMap<LocalDeviceExitProofRequestV1, { witness: DeviceExitWitnessV1; quote: object; consumed: boolean }>();
  const outstandingExitWitnesses = new Set<DeviceExitWitnessV1>();
  const wipeExit = (witness: DeviceExitWitnessV1) => { wipeDeviceExitWitnessV1(witness); outstandingExitWitnesses.delete(witness); };
  const outstandingAuthorizationWitnesses = new Set<DeviceReservationWitnessV1>();
  const wipeAuthorization = (witness: DeviceReservationWitnessV1) => {
    wipeDeviceReservationWitnessV1(witness); outstandingAuthorizationWitnesses.delete(witness); };

  let liveInclusion: object | null = null;
  let liveOutputBalances: object | null = null;
  const signatures = new WeakMap<LocalDepositSignatureV1, number>();
  const proofRequests = new WeakMap<LocalDeviceProofRequestV1, { witness: DeviceDepositWitnessV1; consumed: boolean }>();
  const outstandingWitnesses = new Set<DeviceDepositWitnessV1>();
  const wipeWitness = (witness: DeviceDepositWitnessV1) => {
    for (const item of Object.values(witness)) if (Array.isArray(item)) item.fill(0);
    outstandingWitnesses.delete(witness);
  };
  let pendingReview: LocalDepositReviewV1 | null = null;
  const discardReview = () => { if (pendingReview) reviews.delete(pendingReview); pendingReview = null;
    if (pendingReservation) reservationReviews.delete(pendingReservation); pendingReservation = null; };
  hex(expectedRootId);
  async function original<T>(prompt: string, work: (value: State, key: Crypto.AESEncryptionKey, originalPointer: string,
    originalRecord: string, originalRoot: Uint8Array) => Promise<T>): Promise<T> {
    return serial(async () => {
      active = true; writing = false;
      try {
      current(); await protectedConsent(prompt, { current }); current();
      const before = await checked(scope, () => SecureStore.getItemAsync(POINTER, DATA)), raw = await readStoredRecord(scope);
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
        if (await checked(scope, () => SecureStore.getItemAsync(POINTER, DATA)) !== before || await readStoredRecord(scope) !== raw)
          bad('MOBILE_LOCAL_NOTE_STORAGE_CHANGED');
        current(); const result = await work(value, key, before, raw, root); current(); return result;
      } finally { root.fill(0); key = null; retained = null; }
      } finally { active = false; }
    });
  }
  async function persistSpend(next: State, key: Crypto.AESEncryptionKey, before: string, raw: string, root: Uint8Array) {
    // Local mutations/withdrawal intent invalidate an earlier monetary read.
    // Freshness is ephemeral and is never restored from ciphertext or a DTO.
    liveOutputBalances = null;
    // Validate/reconstruct the exact candidate before encryption. The same
    // decoder gives nested fields a stable order without weakening readback.
    const candidateBytes = encoded(next);
    let candidate: State;
    try { candidate = await checked(scope, () => state(candidateBytes,
      { rootId: next.rootId, revision: next.revision })); }
    finally { candidateBytes.fill(0); }
    const nextRaw = await checked(scope, () => sealedRecord(key, candidate));
    if (await checked(scope, () => SecureStore.getItemAsync(POINTER, DATA)) !== before
      || await readStoredRecord(scope) !== raw
      || await checked(scope, () => SecureStore.getItemAsync(ROOT, PRIVATE)) !== bytesToHex(root)) bad('MOBILE_LOCAL_NOTE_STORAGE_CHANGED');
    try {
      await writeStoredRecord(scope, nextRaw);
      const stored = await readStoredRecord(scope);
      if (stored !== nextRaw) bad('MOBILE_LOCAL_NOTE_WRITE_UNCERTAIN');
      const readback = await checked(scope, () => decrypted(key, stored));
      if (JSON.stringify(readback) !== JSON.stringify(candidate)) bad('MOBILE_LOCAL_NOTE_WRITE_UNCERTAIN');
      if (await checked(scope, () => SecureStore.getItemAsync(POINTER, DATA)) !== before
        || await checked(scope, () => SecureStore.getItemAsync(ROOT, PRIVATE)) !== bytesToHex(root)) bad('MOBILE_LOCAL_NOTE_STORAGE_CHANGED');
      const nextPointer = JSON.stringify({ version: 1, rootId: next.rootId, revision: next.revision,
        recordSHA256: await checked(scope, () => digest(encoded(envelope(nextRaw)))), state: 'ACTIVE' });
      await writeCheckedScoped(scope, POINTER, nextPointer, DATA);
      if (await readStoredRecord(scope) !== nextRaw) bad('MOBILE_LOCAL_NOTE_STORAGE_CHANGED');
      return readback;
    } catch (cause) { closed = true; throw new Error('MOBILE_LOCAL_NOTE_WRITE_UNCERTAIN', { cause }); }
  }
  function fundedSource(value: State) {
    const note = value.note, observation = liveInclusion ? readDeviceDepositInclusionV1(liveInclusion) : null;
    if (!note || note.status !== 'FUNDED' || !note.funding || !note.deviceJob?.assetIdentity || !note.deviceJob.domainCommitment
      || !observation || observation.commitment !== note.commitment || observation.rootId !== value.rootId
      || observation.jobId !== note.deviceJob.jobId || observation.transactionHash !== note.funding?.transactionHash
      || observation.assetId !== note.funding.assetId || observation.scope !== note.scope || observation.policy !== note.policy
      || observation.pool !== note.pool || observation.domainCommitment !== note.deviceJob.domainCommitment
      || observation.amount !== note.opening.value
      || localFundedSpendNullifierV1(note.scope, note.commitment, note.opening.secret) !== observation.nullifier)
      bad('MOBILE_LOCAL_FRESH_FUNDED_SOURCE_REQUIRED');
    return { note, observation };
  }
  async function spendOpening(amount: string): Promise<LocalSpendOpening> {
    if (amount === '0') return { privateKey: null, opening: { type: 4, rho: '0'.repeat(64), x: '0'.repeat(64),
      y: '0'.repeat(64), value: '0', secret: '0'.repeat(64) } };
    let key: Uint8Array | null = null, rho: Uint8Array | null = null, secret: Uint8Array | null = null;
    try {
      rho = await randomWithinScope(scope); secret = await randomWithinScope(scope);
      for (let attempt = 0; attempt < 16; attempt++) {
        const candidate = await randomWithinScope(scope);
        if (secp256k1.utils.isValidSecretKey(candidate)) { key = candidate; break; } candidate.fill(0);
      }
      if (!key) bad('MOBILE_ENTROPY_FAILED');
      const pub = bytesToHex(secp256k1.getPublicKey(key, false));
      return { privateKey: bytesToHex(key), opening: { type: 4, rho: bytesToHex(rho), x: pub.slice(2, 66),
        y: pub.slice(66), value: amount, secret: bytesToHex(secret) } };
    } finally { key?.fill(0); rho?.fill(0); secret?.fill(0); }
  }
  function reservationReview(value: State): LocalDeviceReservationReviewV1 {
    if (!value.note || !value.spend) bad();
    fundedSource(value);
    const spend = value.spend, compiled = compiledSpend(value.note, spend), createdAt = Date.now();
    const review: LocalDeviceReservationReviewV1 = Object.freeze({ version: 1, rootId: value.rootId, revision: value.revision,
      operationId: spend.proposal.operationId, sourceCommitment: value.note.commitment,
      sourceNullifier: compiled.authorizationStatement.inputNullifier, budget: spend.proposal.budget,
      changeAmount: spend.change.opening.value, recoveryAmount: spend.recovery.opening.value,
      graphCommitment: spend.statement.graphCommitment, reserveCommitment: spend.statement.reserveCommitment,
      changeCommitment: spend.statement.changeCommitment, recoveryCommitment: spend.statement.recoveryCommitment,
      settleBefore: spend.statement.settleBefore, frameSHA256: spend.frameSHA256, expiresAt: createdAt + 15_000,
      actions: Object.freeze(compiled.ownerWitness.graph.nodes.map((node, slot) => Object.freeze({ id: node.id,
        chainDomain: node.chainDomain, evidencePolicy: node.evidencePolicy, actionCommitment: node.actionCommitment,
        payoutCommitment: node.payoutCommitment, payoutAmount: compiled.ownerWitness.payouts[slot].value }))),
      nativeTransfers: Object.freeze((spend.preparation?.capsuleOptions.nodes ?? []).map(node => Object.freeze({
        chainDomain: node.action.chainDomain, signerIdentity: node.action.signerIdentity,
        destinationCommitment: node.action.destinationCommitment, amount: node.action.amount,
        executionFrom: node.action.executionFrom, executionUntil: node.action.executionUntil, settleBefore: node.action.settleBefore }))) });
    reservationReviews.set(review, { createdAt, frameSHA256: spend.frameSHA256 }); pendingReservation = review; return review;
  }
  function prepareReservation(input: LocalFundedProposalV1, quoteHandle?: object): Promise<LocalDeviceReservationReviewV1> {
      current(); discardReview(); const quote = quoteHandle ? readDeviceReservationQuoteV1(quoteHandle) : null;
      const proposal = normalizeLocalFundedProposalV1(input);
      return original('Preparar el gasto de ' + proposal.budget + ' unidades: guardar primero tu cambio y recuperación cifrados; todavía no reservar',
        async (value, key, before, raw, root) => {
          const { note, observation } = fundedSource(value);
          if (proposal.scope !== note.scope || proposal.policy !== note.policy || proposal.asset !== note.deviceJob?.assetIdentity
            || BigInt(proposal.budget) > BigInt(note.opening.value)
            || BigInt(proposal.fundingNotBefore) > BigInt(observation.head.timestamp)
            || BigInt(proposal.fundingValidUntil) <= BigInt(observation.head.timestamp)) bad('MOBILE_LOCAL_ORIGINAL_RESERVATION_TERMS');
          if (quote && (quote.rootId !== value.rootId || quote.depositJobId !== note.deviceJob?.jobId
            || quote.sourceCommitment !== note.commitment || quote.sourceNullifier !== observation.nullifier
            || quote.poolTerms.domainCommitment !== note.deviceJob.domainCommitment
            || JSON.stringify(normalizeLocalFundedProposalV1(quote.proposal)) !== JSON.stringify(proposal))) bad('MOBILE_LOCAL_ORIGINAL_QUOTE_CHANGED');
          if (value.spend) {
            if (JSON.stringify(value.spend.proposal) !== JSON.stringify(proposal)) bad('MOBILE_LOCAL_RESERVATION_INTENT_CONFLICT');
            if (value.spend.proofJob) bad('MOBILE_LOCAL_RESERVATION_JOB_ALREADY_COMMITTED');
            if (quote) {
              if (!value.spend.preparation || JSON.stringify(value.spend.preparation.capsuleOptions) !== JSON.stringify(quote.capsuleOptions)
                || JSON.stringify(value.spend.preparation.invoiceSignatures) !== JSON.stringify(quote.invoiceSignatures)) bad('MOBILE_LOCAL_ORIGINAL_QUOTE_CHANGED');
              validatePreparedInvoices(value.spend, note); readDeviceReservationQuoteV1(quoteHandle!);
            }
            return reservationReview(value);
          }
          if (value.revision >= Number.MAX_SAFE_INTEGER) bad('MOBILE_LOCAL_NOTE_CAPACITY');
          const random: Uint8Array[] = [];
          try {
            for (let index = 0; index < 7; index++) random.push(await randomWithinScope(scope));
            if (random.some(bytes => bytes.every(byte => byte === 0))) bad('MOBILE_ENTROPY_FAILED');
            const custody = {
              reservationNonce: bytesToHex(random[0]), reserveSecret: bytesToHex(random[1]), graphNonce: bytesToHex(random[2]),
              paddingSalts: random.slice(3).map(bytesToHex),
              change: await spendOpening(String(BigInt(note.opening.value) - BigInt(proposal.budget))),
              recovery: await spendOpening(proposal.budget) };
            const compiled = compileLocalFundedBalanceGraphV1({ ...proposal, reservationNonce: custody.reservationNonce,
              reserveSecret: custody.reserveSecret, graphNonce: custody.graphNonce, paddingSalts: custody.paddingSalts, inputNote: note.opening,
              changeNote: custody.change.opening, recoveryNote: custody.recovery.opening });
            const frame = localFundedOwnerFrameV1(compiled.authorizationStatement);
            let frameSHA256: string;
            try { frameSHA256 = await checked(scope, () => digest(frame)); } finally { frame.fill(0); }
            const spend: DeviceSpend = { version: 1, phase: 'PREPARED', proposal, ...custody,
              statement: compiled.authorizationStatement, frameSHA256, signature: null };
            if (quote) {
              for (let index = 0; index < 20; index++) random.push(await randomWithinScope(scope));
              if (random.slice(7).some(bytes => bytes.every(byte => byte === 0))) bad('MOBILE_ENTROPY_FAILED');
              spend.preparation = { capsuleOptions: normalizeDeviceReservationCapsuleOptionsV1(quote.capsuleOptions),
                invoiceSignatures: [...quote.invoiceSignatures], joinBlinds: random.slice(7, 11).map(bytesToHex),
                leafBlinds: random.slice(11, 27).map(bytesToHex) };
              validatePreparedInvoices(spend, note); readDeviceReservationQuoteV1(quoteHandle!); current();
            }
            const next: State = { ...value, revision: value.revision + 1, spend };
            const readback = await persistSpend(next, key, before, raw, root);
            fundedSource(readback); return reservationReview(readback);
          } finally { for (const bytes of random) bytes.fill(0); }
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
          if (await checked(scope, () => SecureStore.getItemAsync(POINTER, DATA)) !== before || await readStoredRecord(scope) !== raw)
            bad('MOBILE_LOCAL_NOTE_STORAGE_CHANGED');
          current();
          try {
            await writeStoredRecord(scope, nextRaw);
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
                || await readStoredRecord(signing) !== raw
                || await checked(signing, () => SecureStore.getItemAsync(ROOT, PRIVATE)) !== bytesToHex(root))
                bad('MOBILE_LOCAL_NOTE_STORAGE_CHANGED');
              try {
                await writeStoredRecord(signing, nextRaw);
                const readback = await checked(signing, () => decrypted(key, nextRaw));
                if (!readback.note || JSON.stringify(readback.note.depositIntent) !== JSON.stringify(intent)
                  || JSON.stringify(preparedSummary(readback.note)) !== JSON.stringify(review.note)) bad();
                const nextPointer = JSON.stringify({ version: 1, rootId: value.rootId, revision: next.revision,
                  recordSHA256: await checked(signing, () => digest(encoded(envelope(nextRaw)))), state: 'ACTIVE' });
                if (await checked(signing, () => SecureStore.getItemAsync(POINTER, DATA)) !== before
                  || await readStoredRecord(signing) !== nextRaw) bad('MOBILE_LOCAL_NOTE_STORAGE_CHANGED');
                await writeCheckedScoped(signing, POINTER, nextPointer, DATA);
                finalValue = readback; finalRaw = nextRaw; finalPointer = nextPointer;
              } catch (cause) { closed = true; throw new Error('MOBILE_LOCAL_NOTE_WRITE_UNCERTAIN', { cause }); }
            }
            if (await checked(signing, () => SecureStore.getItemAsync(POINTER, DATA)) !== finalPointer
              || await readStoredRecord(signing) !== finalRaw
              || await checked(signing, () => SecureStore.getItemAsync(ROOT, PRIVATE)) !== bytesToHex(root)) bad('MOBILE_LOCAL_NOTE_STORAGE_CHANGED');
            if (!finalValue.note) bad();
            signing.current(); secretKey = privateKeyFromHex(finalValue.note.privateKey);
            const signature = signDeviceMessage(secretKey, frame); signing.current();
            const result: LocalDepositSignatureV1 = Object.freeze({ version: 1, relation: choice.relation, rootId: value.rootId,
              revision: finalValue.revision, commitment: review.note.commitment, statement: review.statement,
              signature, status: 'UNISSUED', availableBalance: null, nativeEffectsEstablished: false });
            signatures.set(result, Date.now() + 15_000); return result;
          } finally { secretKey?.fill(0); frame.fill(0); }
        });
    },
    /** Creates a revocable in-memory request for the EXACT signed local D26.
     * The returned object exposes its public hash, never root/privateKey.
     * Only bindDeviceProofRequest can consume its original retained opening. */
    createDeviceProofRequest: (signed: LocalDepositSignatureV1): Promise<LocalDeviceProofRequestV1> => {
      current(); const expiry = signatures.get(signed);
      if (expiry === undefined || Date.now() >= expiry || signed.relation !== 'D26'
        || signed.rootId !== expectedRootId || !('epoch' in signed.statement)) bad('MOBILE_LOCAL_PROOF_SIGNATURE_REQUIRED');
      signatures.delete(signed);
      return original('Preparar la revelación de una sola apertura D26 al worker; la raíz y la clave de nota permanecen aquí',
        async value => {
          if (!value.note || value.note.status !== 'UNISSUED'
            || value.revision !== signed.revision || value.note.commitment !== signed.commitment
            || value.note.depositIntent?.relation !== 'D26' || !('epoch' in signed.statement)
            || value.note.depositIntent.epoch !== signed.statement.epoch || Date.now() >= expiry) bad('MOBILE_LOCAL_PROOF_SIGNATURE_CHANGED');
          const note = value.note, words = (raw: string) => Array.from({ length: 8 }, (_, index) => Number.parseInt(raw.slice(index * 8, index * 8 + 8), 16));
          const witness = normalizeDeviceDepositWitnessV1({ scope: words(note.scope), policy: words(note.policy),
            epoch: signed.statement.epoch, amount: note.opening.value, output: words(note.commitment),
            rho: [...localNoteHexBytesV1(note.opening.rho)], key_x: [...localNoteHexBytesV1(note.opening.x)],
            key_y: [...localNoteHexBytesV1(note.opening.y)], secret: [...localNoteHexBytesV1(note.opening.secret)],
            signature: [...localNoteHexBytesV1(signed.signature, 64)] });
          const bytes = deviceDepositWitnessBytesV1(witness);
          try {
            const witnessSHA256 = await checked(scope, () => digest(bytes));
            const request: LocalDeviceProofRequestV1 = Object.freeze({ rootId: value.rootId, noteRevision: note.deviceJob?.noteRevision ?? value.revision,
              commitment: note.commitment, statement: { scope: note.scope, policy: note.policy,
                epoch: signed.statement.epoch, amount: note.opening.value, output: note.commitment }, witnessSHA256,
              jobId: note.deviceJob?.jobId ?? null,
              close() { const row = proofRequests.get(request); if (row) { row.consumed = true; wipeWitness(row.witness); } } });
            proofRequests.set(request, { witness, consumed: false }); outstandingWitnesses.add(witness); return request;
          } catch (error) { wipeWitness(witness); throw error; } finally { bytes.fill(0); }
        });
    },
    bindDeviceProofRequest: (request: LocalDeviceProofRequestV1, rawConsent: DeviceDepositConsentV1): Promise<DeviceDepositWitnessV1> => {
      current(); const row = proofRequests.get(request), consent = validateDeviceDepositConsentFreshV1(rawConsent);
      if (consent.origin.length > 64) bad('MOBILE_LOCAL_ORIGIN_CAPACITY');
      if (!row || row.consumed || consent.action !== 'PROVE_D26' || consent.rootId !== expectedRootId
        || consent.noteRevision !== request.noteRevision || consent.witnessSHA256 !== request.witnessSHA256
        || JSON.stringify(consent.statement) !== JSON.stringify(request.statement)) bad('MOBILE_LOCAL_PROOF_REQUEST_REQUIRED');
      row.consumed = true;
      return original('Entregar sólo esta apertura D26 por TLS a ' + new URL(consent.origin).hostname + '; todavía no financiar',
        async (value, key, before, raw, root) => {
          validateDeviceDepositConsentFreshV1(consent);
          if (!value.note || value.note.status !== 'UNISSUED' || (!value.note.deviceJob && value.revision !== request.noteRevision)
            || value.note.commitment !== request.commitment || value.note.pool !== consent.binding.asset.pool
            || value.note.scope !== consent.poolTerms.scope || value.note.policy !== consent.poolTerms.policy) bad('MOBILE_LOCAL_PROOF_REQUEST_CHANGED');
          if (value.note.deviceJob) {
            const originalJob = value.note.deviceJob;
            if (originalJob.jobId !== consent.jobId || originalJob.origin !== consent.origin || originalJob.pairingId !== consent.pairingId
              || originalJob.noteRevision !== consent.noteRevision) bad('MOBILE_LOCAL_ORIGINAL_JOB_CHANGED');
            const witness = normalizeDeviceDepositWitnessV1(row.witness); wipeWitness(row.witness); return witness;
          }
          const next: State = { ...value, revision: value.revision + 1, note: { ...value.note,
            deviceJob: { jobId: consent.jobId, origin: consent.origin, pairingId: consent.pairingId,
              noteRevision: consent.noteRevision, assetIdentity: consent.poolTerms.assetIdentity,
              domainCommitment: consent.poolTerms.domainCommitment } } };
          const nextRaw = await checked(scope, () => sealedRecord(key, next));
          if (await checked(scope, () => SecureStore.getItemAsync(POINTER, DATA)) !== before
            || await readStoredRecord(scope) !== raw
            || await checked(scope, () => SecureStore.getItemAsync(ROOT, PRIVATE)) !== bytesToHex(root)) bad('MOBILE_LOCAL_NOTE_STORAGE_CHANGED');
          try {
            await writeStoredRecord(scope, nextRaw);
            const nextPointer = JSON.stringify({ version: 1, rootId: value.rootId, revision: next.revision,
              recordSHA256: await checked(scope, () => digest(encoded(envelope(nextRaw)))), state: 'ACTIVE' });
            await checked(scope, () => decrypted(key, nextRaw));
            if (await checked(scope, () => SecureStore.getItemAsync(POINTER, DATA)) !== before) bad('MOBILE_LOCAL_NOTE_STORAGE_CHANGED');
            await writeCheckedScoped(scope, POINTER, nextPointer, DATA); validateDeviceDepositConsentFreshV1(consent);
            const witness = normalizeDeviceDepositWitnessV1(row.witness); wipeWitness(row.witness); return witness;
          } catch (cause) { closed = true; throw new Error('MOBILE_LOCAL_NOTE_WRITE_UNCERTAIN', { cause }); }
        }).finally(() => wipeWitness(row.witness));
    },
    readDeviceOutputBalanceSubject: () => original('Leer sólo los identificadores de estas dos notas; no revelar aperturas ni autorizar W39', async value => {
      const note = value.note, spend = value.spend;
      if (!note?.deviceJob || !note.funding || !spend?.proofJob || !spend.reservation) bad('MOBILE_LOCAL_ORIGINAL_RESERVATION_REQUIRED');
      return Object.freeze({ parentJobId: spend.proofJob.jobId, rootId: value.rootId, noteRevision: value.revision,
        changeNullifier: localFundedSpendNullifierV1(note.scope, spend.statement.changeCommitment, spend.change.opening.secret),
        recoveryNullifier: localFundedSpendNullifierV1(note.scope, spend.statement.recoveryCommitment, spend.recovery.opening.secret) });
    }),
    applyDeviceOutputBalances: (handle: object) => {
      current(); const observation = readDeviceOutputBalanceV1(handle);
      return original('Guardar en memoria la lectura original de cambio/recuperación; no firmar, probar ni enviar', async value => {
        const note = value.note, spend = value.spend, job = spend?.proofJob;
        if (!note?.deviceJob || !note.funding || !spend?.reservation || !job || observation.rootId !== value.rootId
          || observation.noteRevision !== value.revision || observation.parentJobId !== job.jobId
          || observation.origin !== job.origin || observation.pairingId !== job.pairingId || observation.devicePublicKey !== job.devicePublicKey
          || observation.pool !== note.pool || observation.assetId !== note.funding.assetId
          || observation.poolTerms.scope !== note.scope || observation.poolTerms.policy !== note.policy
          || observation.poolTerms.assetIdentity !== note.deviceJob.assetIdentity || observation.poolTerms.domainCommitment !== note.deviceJob.domainCommitment
          || observation.reservationTransactionHash !== spend.reservation.transactionHash
          || observation.sourceNullifier !== spend.statement.inputNullifier) bad('MOBILE_LOCAL_ORIGINAL_OUTPUT_BALANCE_REQUIRED');
        if (spend.execution?.reorganizationPending) bad('MOBILE_LOCAL_ORIGINAL_OUTPUT_BALANCE_CHANGED');
        if (spend.execution && (spend.execution.nativeBindingSHA256 !== observation.nativeBindingSHA256
          || spend.execution.terminal && spend.execution.terminal.outcome !== observation.nativeOutcome)) bad('MOBILE_LOCAL_ORIGINAL_OUTPUT_BALANCE_CHANGED');
        for (const role of ['change', 'recovery'] as const) {
          const output = observation[role], opening = spend[role].opening;
          const frame = localBalanceCommitmentMessageV1(note.scope, note.policy, opening); let commitment: string;
          try { commitment = await checked(scope, () => digest(frame)); } finally { frame.fill(0); }
          if (output.commitment !== commitment || output.commitment !== spend.statement[role === 'change' ? 'changeCommitment' : 'recoveryCommitment']
            || output.nullifier !== localFundedSpendNullifierV1(note.scope, commitment, opening.secret)
            || BigInt(output.amount) !== BigInt(opening.value)) bad('MOBILE_LOCAL_ORIGINAL_OUTPUT_BALANCE_CHANGED');
          if (spend.exits?.[role]?.receipt && output.state !== 'SPENT') bad('MOBILE_LOCAL_ORIGINAL_OUTPUT_BALANCE_CHANGED');
        }
        current(); if (readDeviceOutputBalanceV1(handle) !== observation) bad('MOBILE_LOCAL_ORIGINAL_OUTPUT_BALANCE_CHANGED');
        liveOutputBalances = handle; return Object.freeze({ observedHead: observation.observed.blockHash, expiresAt: observation.expiresAt,
          assetIdentity: observation.poolTerms.assetIdentity, domainCommitment: observation.poolTerms.domainCommitment });
      });
    },
    forgetDeviceOutputBalanceObservation() { current(); liveOutputBalances = null; },
    readDeviceNote: () => original('Consultar el estado de tu nota local y su envío original', async value => {
      const note = value.note; if (!note) return null;
      let observation = null;
      try { observation = liveInclusion ? readDeviceDepositInclusionV1(liveInclusion) : null; } catch { liveInclusion = null; }
      const fresh = !value.spend && note.status === 'FUNDED' && observation?.commitment === note.commitment
        && observation.transactionHash === note.funding?.transactionHash;
      let outputObservation: ReturnType<typeof readDeviceOutputBalanceV1> | null = null;
      try { outputObservation = liveOutputBalances ? readDeviceOutputBalanceV1(liveOutputBalances) : null; } catch { liveOutputBalances = null; }
      const output = (role: 'change' | 'recovery') => {
        const spend = value.spend; if (!spend) return null;
        const intent = spend.exits?.[role], observed = outputObservation?.[role];
        const confirmed = !!intent?.receipt;
        // A confirmed local receipt alone remains UNKNOWN. Zero additionally
        // requires this live original READ to observe the same NF as SPENT.
        const usable = !!observed && (!intent || confirmed && observed.state === 'SPENT');
        return Object.freeze({ commitment: spend.statement[role === 'change' ? 'changeCommitment' : 'recoveryCommitment'],
          amount: spend[role].opening.value, state: confirmed ? 'WITHDRAWN' : intent ? 'WITHDRAWAL_PENDING'
            : observed?.state ?? (role === 'recovery' ? 'LOCKED' : spend.reservation ? 'INCLUDED_AT_RETAINED_HEAD' : 'PENDING_RESERVATION'),
          availableBalance: usable ? observed!.state === 'UNSPENT' ? observed!.amount : observed!.state === 'SPENT' ? '0' : null : null,
          freshness: usable ? 'OBSERVED_AT_RETAINED_HEAD' : 'UNKNOWN',
          observation: usable ? { headHash: outputObservation!.observed.blockHash, expiresAt: outputObservation!.expiresAt } : null,
          withdrawnAmount: confirmed ? intent!.statement.amount : null, withdrawalTransactionHash: intent?.receipt?.transactionHash ?? null });
      };
      return Object.freeze({ rootId: value.rootId, revision: value.revision, commitment: note.commitment,
        amount: note.opening.value, status: note.status, job: note.deviceJob ? Object.freeze({ ...note.deviceJob }) : null,
        observation: observation ? Object.freeze({ transactionHash: observation.transactionHash, assetId: observation.assetId,
          headHash: observation.head.hash, observedAt: observation.observedAt, expiresAt: observation.expiresAt }) : null,
        availableBalance: fresh ? note.opening.value : null, nativeEffectsEstablished: note.status === 'FUNDED',
        freshness: fresh ? 'OBSERVED_AT_RETAINED_HEAD' : 'UNKNOWN',
        localReservation: value.spend ? { operationId: value.spend.proposal.operationId, phase: value.spend.phase,
          stage: value.spend.reservation ? 'RESERVED_AT_RETAINED_HEAD' : 'UNKNOWN',
          sourceSpentAtRetainedHead: value.spend.reservation !== undefined,
          sourceNullifier: value.spend.statement.inputNullifier,
          transactionHash: value.spend.reservation?.transactionHash ?? null,
          changeCommitment: value.spend.statement.changeCommitment,
          recoveryCommitment: value.spend.statement.recoveryCommitment,
          changeAvailableBalance: output('change')!.availableBalance, recoveryAvailableBalance: output('recovery')!.availableBalance,
          assetIdentity: note.deviceJob?.assetIdentity ?? null, domainCommitment: note.deviceJob?.domainCommitment ?? null,
          change: output('change'), recovery: output('recovery'),
          budget: value.spend.proposal.budget, changeAmount: value.spend.change.opening.value,
          recoveryAmount: value.spend.recovery.opening.value } : null });
    }),
    applyDeviceDepositInclusion: (capability: object) => {
      current(); const inclusion = readDeviceDepositInclusionV1(capability);
      return original('Guardar la inclusión original de esta misma nota; la apertura y la clave siguen aquí',
        async (value, key, before, raw, root) => {
          readDeviceDepositInclusionV1(capability); const note = value.note;
          if (!note || !note.deviceJob || note.deviceJob.jobId !== inclusion.jobId || inclusion.rootId !== value.rootId
            || note.commitment !== inclusion.commitment || note.opening.value !== inclusion.amount
            || note.pool !== inclusion.pool || note.scope !== inclusion.scope || note.policy !== inclusion.policy) bad('MOBILE_LOCAL_ORIGINAL_INCLUSION_REQUIRED');
          // Verify the original spend nullifier from this exact device opening,
          // in addition to the exact PC23 commitment checked on every open.
          const tag = new TextEncoder().encode('PC15/note-spend/1'), frame = new Uint8Array(2 + tag.length + 3 * 36);
          frame[0] = tag.length >> 8; frame[1] = tag.length & 255; frame.set(tag, 2);
          let cursor = 2 + tag.length;
          for (const field of [note.scope, note.commitment, note.opening.secret]) {
            frame[cursor + 3] = 32; frame.set(localNoteHexBytesV1(field), cursor + 4); cursor += 36;
          }
          try { if (await checked(scope, () => digest(frame)) !== inclusion.nullifier) bad('MOBILE_LOCAL_NULLIFIER_CHANGED'); }
          finally { frame.fill(0); }
          if (note.funding && (note.funding.transactionHash !== inclusion.transactionHash
            || note.funding.assetId !== inclusion.assetId)) bad('MOBILE_LOCAL_ORIGINAL_INCLUSION_CHANGED');
          if (note.status === 'FUNDED' && note.funding) {
            // A fresh observation of this exact original funding changes only
            // the ephemeral handle. Preserve ciphertext, revision and intent.
            if (await checked(scope, () => SecureStore.getItemAsync(POINTER, DATA)) !== before
              || await readStoredRecord(scope) !== raw
              || await checked(scope, () => SecureStore.getItemAsync(ROOT, PRIVATE)) !== bytesToHex(root)) bad('MOBILE_LOCAL_NOTE_STORAGE_CHANGED');
            current(); readDeviceDepositInclusionV1(capability); liveInclusion = capability;
            return { commitment: note.commitment, availableBalance: !value.spend ? note.opening.value : null,
              nativeEffectsEstablished: true, observedHead: inclusion.head.hash };
          }
          const next: State = { ...value, revision: value.revision + 1, note: { ...note, status: 'FUNDED',
            funding: { transactionHash: inclusion.transactionHash, assetId: inclusion.assetId } } };
          const nextRaw = await checked(scope, () => sealedRecord(key, next));
          if (await checked(scope, () => SecureStore.getItemAsync(POINTER, DATA)) !== before
            || await readStoredRecord(scope) !== raw
            || await checked(scope, () => SecureStore.getItemAsync(ROOT, PRIVATE)) !== bytesToHex(root)) bad('MOBILE_LOCAL_NOTE_STORAGE_CHANGED');
          try {
            readDeviceDepositInclusionV1(capability); await writeStoredRecord(scope, nextRaw);
            const nextPointer = JSON.stringify({ version: 1, rootId: value.rootId, revision: next.revision,
              recordSHA256: await checked(scope, () => digest(encoded(envelope(nextRaw)))), state: 'ACTIVE' });
            await checked(scope, () => decrypted(key, nextRaw));
            if (await checked(scope, () => SecureStore.getItemAsync(POINTER, DATA)) !== before) bad('MOBILE_LOCAL_NOTE_STORAGE_CHANGED');
            await writeCheckedScoped(scope, POINTER, nextPointer, DATA);
            liveInclusion = capability;
            return { commitment: note.commitment, availableBalance: !value.spend && Date.now() < inclusion.expiresAt ? note.opening.value : null,
              nativeEffectsEstablished: true, observedHead: inclusion.head.hash };
          } catch (cause) { closed = true; throw new Error('MOBILE_LOCAL_NOTE_WRITE_UNCERTAIN', { cause }); }
        });
    },
    /** Retain the original S receipt against this same encrypted opening and U
     * job. No backend DTO/receipt copy supplies authority. Outputs are INCLUDED,
     * never free balance without their own fresh unspent-nullifier observation. */
    applyDeviceReservationInclusion: (response: object) => {
      current(); const inclusion = readDeviceReservationInclusionV1(response);
      return original('Guardar la reserva S original y conservar las aperturas de cambio/recuperación; no ejecutar ni reenviar',
        async (value, key, before, raw, root) => {
          const currentInclusion = readDeviceReservationInclusionV1(response), status = currentInclusion.status;
          const note = value.note, spend = value.spend, job = spend?.proofJob, observed = status.observation;
          if (currentInclusion !== inclusion || !note?.deviceJob || !note.funding || !spend || !job || !observed
            || status.stage !== 'RESERVED' || spend.phase !== 'SIGNED' || !spend.signature
            || job.jobId !== status.jobId || job.depositJobId !== status.consentFields.depositJobId
            || job.quoteId !== status.consentFields.quoteId || job.witnessSHA256 !== status.consentFields.witnessSHA256
            || job.origin !== inclusion.origin || job.pairingId !== inclusion.pairingId || job.devicePublicKey !== inclusion.devicePublicKey
            || note.pool !== inclusion.pool || note.scope !== inclusion.poolTerms.scope || note.policy !== inclusion.poolTerms.policy
            || note.deviceJob.assetIdentity !== inclusion.poolTerms.assetIdentity || note.deviceJob.domainCommitment !== inclusion.poolTerms.domainCommitment
            || status.consentFields.custody.rootId !== value.rootId || status.consentFields.custody.noteRevision > value.revision
            || status.consentFields.custody.frameSHA256 !== spend.frameSHA256
            || JSON.stringify(spend.statement) !== JSON.stringify(status.statement)
            || note.commitment !== observed.sourceCommitment
            || localFundedSpendNullifierV1(note.scope, note.commitment, note.opening.secret) !== observed.sourceNullifier
            || status.statement.changeCommitment !== observed.changeCommitment
            || status.statement.reserveCommitment !== observed.reserveCommitment) bad('MOBILE_LOCAL_ORIGINAL_RESERVATION_REQUIRED');
          const receipt: LocalReservationReceipt = { jobId: job.jobId, transactionHash: observed.transactionHash,
            blockHash: observed.blockHash, blockNumber: observed.blockNumber, timestamp: observed.timestamp,
            domainCommitment: observed.domainCommitment, envelope: observed.envelope, admissionTag: observed.admissionTag };
          if (spend.reservation && JSON.stringify(spend.reservation) !== JSON.stringify(receipt)) bad('MOBILE_LOCAL_ORIGINAL_RESERVATION_CHANGED');
          if (!spend.reservation) {
            const next: State = { ...value, revision: value.revision + 1, spend: { ...spend, reservation: receipt } };
            readDeviceReservationInclusionV1(response); await persistSpend(next, key, before, raw, root);
          }
          current(); readDeviceReservationInclusionV1(response); liveInclusion = null;
          return Object.freeze({ rootId: value.rootId, jobId: job.jobId, transactionHash: receipt.transactionHash,
            sourceCommitment: note.commitment, sourceSpentAtRetainedHead: true, availableBalance: null,
            change: Object.freeze({ commitment: spend.statement.changeCommitment, amount: spend.change.opening.value,
              includedAtRetainedHead: true, availableBalance: null }),
            recovery: Object.freeze({ commitment: spend.statement.recoveryCommitment, amount: spend.recovery.opening.value,
              availableBalance: null, requiresOriginalFailure: true }),
            nativeDispatchEstablished: false, withdrawalEstablished: false, mobileCanonicalRpcVerification: false });
        });
    },
    /** No signing or reservation occurs here. Persist and reread BOTH future
     * openings plus all original nonce/secret/terms before releasing review.
     * Authenticated device-source inclusion is mandatory. Raw proposal data
     * cannot supply a funded source, an opening or signing key. */
    prepareDeviceReservation: (input: LocalFundedProposalV1): Promise<LocalDeviceReservationReviewV1> => prepareReservation(input),
    prepareDeviceReservationFromQuote: (quoteHandle: object): Promise<LocalDeviceReservationReviewV1> => {
      current(); const quote = readDeviceReservationQuoteV1(quoteHandle); return prepareReservation(quote.proposal, quoteHandle);
    },
    /** Consumes an exact local review before await. The source note key signs
     * only the original H4 authorization after all custody was reread. This
     * returns an intermediate signature, not a U/S proof or backend grant. */
    signDeviceReservation: (review: LocalDeviceReservationReviewV1): Promise<LocalDeviceReservationSignatureV1> => {
      current(); const retained = reservationReviews.get(review);
      if (!retained || pendingReservation !== review || review.rootId !== expectedRootId
        || Date.now() < retained.createdAt || Date.now() >= review.expiresAt) bad('MOBILE_LOCAL_RESERVATION_REVIEW_REQUIRED');
      reservationReviews.delete(review); pendingReservation = null;
      return original('Autorizar sólo este grafo por ' + review.budget + ' unidades con cambio ' + review.changeAmount
        + ' y recuperación ' + review.recoveryAmount + '; las claves permanecen en tu dispositivo',
        async (value, key, before, raw, root) => {
          const { note } = fundedSource(value), spend = value.spend;
          if (!spend || value.revision !== review.revision || spend.frameSHA256 !== retained.frameSHA256
            || Date.now() < retained.createdAt || Date.now() >= review.expiresAt) bad('MOBILE_LOCAL_RESERVATION_REVIEW_CHANGED');
          const compiled = compiledSpend(note, spend), frame = localFundedOwnerFrameV1(compiled.authorizationStatement);
          let sourceKey: Uint8Array | null = null;
          try {
            if (await checked(scope, () => digest(frame)) !== retained.frameSHA256) bad('MOBILE_LOCAL_RESERVATION_REVIEW_CHANGED');
            let signature = spend.signature;
            if (signature === null) {
              sourceKey = privateKeyFromHex(note.privateKey); signature = signDeviceMessage(sourceKey, frame); current();
              const next: State = { ...value, revision: value.revision + 1, spend: { ...spend, phase: 'SIGNED', signature } };
              await persistSpend(next, key, before, raw, root);
              // A signature never escapes an uncertain local write or expiry.
              fundedSource(next);
              if (Date.now() < retained.createdAt || Date.now() >= review.expiresAt) bad('MOBILE_LOCAL_RESERVATION_REVIEW_CHANGED');
              value = next;
            }
            current(); fundedSource(value);
            if (Date.now() < retained.createdAt || Date.now() >= review.expiresAt) bad('MOBILE_LOCAL_RESERVATION_REVIEW_CHANGED');
            const observedPointer = await checked(scope, () => SecureStore.getItemAsync(POINTER, DATA)), observedRaw = await readStoredRecord(scope);
            if (observedPointer === null || observedRaw === null) bad('MOBILE_LOCAL_NOTE_RECOVERY_REQUIRED');
            const p = pointer(observedPointer), e = envelope(observedRaw);
            if (p.state !== 'ACTIVE' || p.rootId !== value.rootId || p.revision !== value.revision || e.rootId !== value.rootId
              || e.revision !== value.revision || await checked(scope, () => digest(encoded(e))) !== p.recordSHA256
              || await checked(scope, () => SecureStore.getItemAsync(POINTER, DATA)) !== observedPointer)
              bad('MOBILE_LOCAL_NOTE_STORAGE_CHANGED');
            current(); fundedSource(value);
            if (Date.now() < retained.createdAt || Date.now() >= review.expiresAt) bad('MOBILE_LOCAL_RESERVATION_REVIEW_CHANGED');
            const signed: LocalDeviceReservationSignatureV1 = Object.freeze({ version: 1, rootId: value.rootId, revision: value.revision,
              statement: Object.freeze({ ...compiled.authorizationStatement,
                outputs: Object.freeze([...compiled.authorizationStatement.outputs]) }), signature,
              intermediateWords: Object.freeze(localFundedAuthorizationWordsV1(compiled.authorizationStatement)),
              custody: Object.freeze({ rootId: value.rootId, noteRevision: value.revision, encryptedRecordSHA256: p.recordSHA256,
                frameSHA256: retained.frameSHA256, sourceCommitment: note.commitment,
                sourceNullifier: compiled.authorizationStatement.inputNullifier,
                changeCommitment: compiled.authorizationStatement.changeCommitment,
                recoveryCommitment: compiled.authorizationStatement.recoveryCommitment }) });
            reservationSignatures.set(signed, review.expiresAt); return signed;
          } finally { sourceKey?.fill(0); frame.fill(0); }
        });
    },
    /** Commits one exact U job locally before its consent/POST. The same source,
     * recipient acceptance, native preparation and all output custody are read
     * back first. Closing/crashing this pending job requires explicit original
     * observation; it never creates a fresh job or another authorization. */
    createDeviceAuthorizationRequest: (signed: LocalDeviceReservationSignatureV1, quoteHandle: object): Promise<LocalDeviceAuthorizationRequestV1> => {
      current(); const until = reservationSignatures.get(signed);
      if (!until || Date.now() >= until || signed.rootId !== expectedRootId) bad('MOBILE_LOCAL_PROOF_SIGNATURE_REQUIRED');
      reservationSignatures.delete(signed);
      const quote = readDeviceReservationQuoteV1(quoteHandle);
      return original('Preparar una sola prueba U: revelar únicamente las aperturas de este grafo al worker original; raíz y claves permanecen aquí',
        async (value, key, before, raw, root) => {
          const { note, observation } = fundedSource(value), spend = value.spend;
          if (!spend || spend.phase !== 'SIGNED' || !spend.preparation || spend.proofJob
            || spend.signature !== signed.signature || value.revision !== signed.revision
            || JSON.stringify(spend.statement) !== JSON.stringify(signed.statement)
            || pointer(before).recordSHA256 !== signed.custody.encryptedRecordSHA256
            || quote.rootId !== value.rootId || quote.depositJobId !== note.deviceJob?.jobId
            || quote.sourceCommitment !== note.commitment || quote.sourceNullifier !== observation.nullifier
            || quote.origin !== note.deviceJob.origin || quote.pairingId !== note.deviceJob.pairingId
            || JSON.stringify(quote.proposal) !== JSON.stringify(spend.proposal)
            || JSON.stringify(quote.capsuleOptions) !== JSON.stringify(spend.preparation.capsuleOptions)
            || JSON.stringify(quote.invoiceSignatures) !== JSON.stringify(spend.preparation.invoiceSignatures)) bad('MOBILE_LOCAL_ORIGINAL_QUOTE_CHANGED');
          validatePreparedInvoices(spend, note);
          const witness = reservationWitness(note, spend), bytes = deviceReservationWitnessBytesV1(witness);
          let witnessSHA256: string, jobEntropy: Uint8Array | null = null;
          try {
            witnessSHA256 = await checked(scope, () => digest(bytes)); current(); fundedSource(value);
            readDeviceReservationQuoteV1(quoteHandle);
            if (Date.now() >= until) bad('MOBILE_LOCAL_PROOF_SIGNATURE_REQUIRED');
            jobEntropy = await randomWithinScope(scope); if (jobEntropy.every(byte => byte === 0)) bad('MOBILE_ENTROPY_FAILED');
            const proofJob: LocalReservationProofJob = { jobId: bytesToHex(jobEntropy), quoteId: quote.quoteId,
              depositJobId: quote.depositJobId, origin: quote.origin, pairingId: quote.pairingId,
              devicePublicKey: quote.devicePublicKey, witnessSHA256 };
            const next: State = { ...value, revision: value.revision + 1, spend: { ...spend, proofJob } };
            const readback = await persistSpend(next, key, before, raw, root); fundedSource(readback);
            readDeviceReservationQuoteV1(quoteHandle);
            if (Date.now() >= until) bad('MOBILE_LOCAL_PROOF_SIGNATURE_REQUIRED');
            const after = await checked(scope, () => SecureStore.getItemAsync(POINTER, DATA));
            if (after === null) bad('MOBILE_LOCAL_NOTE_RECOVERY_REQUIRED');
            const p = pointer(after), createdAt = Date.now();
            if (p.rootId !== next.rootId || p.revision !== next.revision) bad('MOBILE_LOCAL_NOTE_STORAGE_CHANGED');
            const request: LocalDeviceAuthorizationRequestV1 = Object.freeze({ version: 1, rootId: next.rootId,
              jobId: proofJob.jobId, depositJobId: proofJob.depositJobId, quoteId: proofJob.quoteId, witnessSHA256,
              statement: Object.freeze({ ...spend.statement, outputs: Object.freeze([...spend.statement.outputs]) }),
              custody: Object.freeze({ ...signed.custody, noteRevision: next.revision, encryptedRecordSHA256: p.recordSHA256 }),
              expiresAt: Math.min(until, quote.expiresAt, createdAt + 15_000),
              close() { const retained = authorizationRequests.get(request); if (retained) { retained.consumed = true; wipeAuthorization(retained.witness); } },
            });
            authorizationRequests.set(request, { witness, quote: quoteHandle, consumed: false });
            outstandingAuthorizationWitnesses.add(witness); return request;
          } catch (cause) { wipeDeviceReservationWitnessV1(witness); throw cause; }
          finally { bytes.fill(0); jobEntropy?.fill(0); }
        });
    },
    /** Consumes the exact request once before awaiting protected access. The
     * opening packet contains no encryption root or private signing key. */
    bindDeviceAuthorizationRequest: (request: LocalDeviceAuthorizationRequestV1, rawConsent: DeviceReservationConsentV1): Promise<DeviceReservationWitnessV1> => {
      current(); const retained = authorizationRequests.get(request);
      if (!retained || retained.consumed || request.rootId !== expectedRootId || Date.now() >= request.expiresAt) bad('MOBILE_LOCAL_AUTHORIZATION_REQUEST_REQUIRED');
      retained.consumed = true;
      let consent: DeviceReservationConsentV1;
      try { consent = validateDeviceReservationConsentFreshV1(rawConsent);
        const quote = readDeviceReservationQuoteV1(retained.quote);
        if (consent.action !== 'PROVE_U' || consent.jobId !== request.jobId || consent.quoteId !== request.quoteId
          || consent.depositJobId !== request.depositJobId || consent.origin !== quote.origin
          || consent.pairingId !== quote.pairingId || consent.devicePublicKey !== quote.devicePublicKey
          || consent.witnessSHA256 !== request.witnessSHA256 || JSON.stringify(consent.statement) !== JSON.stringify(request.statement)
          || JSON.stringify(consent.custody) !== JSON.stringify(request.custody)
          || JSON.stringify(consent.poolTerms) !== JSON.stringify(quote.poolTerms)) bad('MOBILE_LOCAL_AUTHORIZATION_CONSENT_CHANGED');
      } catch (cause) { wipeAuthorization(retained.witness); throw cause; }
      return original('Confirmar la revelación acotada de esta única apertura U; nunca la raíz ni una clave privada',
        async (value, _key, before) => {
          try {
            fundedSource(value); readDeviceReservationQuoteV1(retained.quote);
            validateDeviceReservationConsentFreshV1(consent);
            if (!value.spend?.proofJob || value.spend.proofJob.jobId !== request.jobId || value.revision !== request.custody.noteRevision
              || pointer(before).recordSHA256 !== request.custody.encryptedRecordSHA256 || Date.now() >= request.expiresAt) bad('MOBILE_LOCAL_AUTHORIZATION_CONSENT_CHANGED');
            const bytes = deviceReservationWitnessBytesV1(retained.witness);
            try { if (await checked(scope, () => digest(bytes)) !== request.witnessSHA256) bad('MOBILE_LOCAL_AUTHORIZATION_CONSENT_CHANGED'); }
            finally { bytes.fill(0); }
            current(); fundedSource(value); validateDeviceReservationConsentFreshV1(consent);
            if (Date.now() >= request.expiresAt) bad('MOBILE_LOCAL_AUTHORIZATION_CONSENT_CHANGED');
            return retained.witness;
          } catch (cause) { wipeAuthorization(retained.witness); throw cause; }
        }).catch(cause => { wipeAuthorization(retained.witness); throw cause; });
    },
    readDeviceExitSubject: (role: DeviceExitRoleV1, recipient: string) => {
      current(); if (!['change', 'recovery'].includes(role)) bad('MOBILE_LOCAL_EXIT_ROLE'); hex(recipient, 20);
      if (recipient === '0'.repeat(40)) bad('MOBILE_LOCAL_EXIT_RECIPIENT');
      return original('Consultar la salida de esta misma apertura local; todavía requiere estado original y consentimiento W39', async value => {
        const note = value.note, spend = value.spend;
        if (!note || !spend?.reservation || !spend.proofJob || !spend[role].privateKey || BigInt(spend[role].opening.value) <= 0n) bad('MOBILE_LOCAL_ORIGINAL_RESERVATION_REQUIRED');
        if (spend.exits?.[role]) bad('MOBILE_LOCAL_ORIGINAL_EXIT_ALREADY_RETAINED');
        const commitment = spend.statement[role === 'change' ? 'changeCommitment' : 'recoveryCommitment'];
        return Object.freeze({ parentJobId: spend.proofJob.jobId, noteRole: role, rootId: value.rootId, noteRevision: value.revision,
          nullifier: localFundedSpendNullifierV1(note.scope, commitment, spend[role].opening.secret), recipient,
          commitment, amount: spend[role].opening.value, availableBalance: null });
      });
    },
    createDeviceExitProofRequest: (handle: object): Promise<LocalDeviceExitProofRequestV1> => {
      current(); discardReview(); const quote = readDeviceExitQuoteV1(handle);
      return original('Autorizar W39 para esta apertura de ' + quote.noteRole + ', importe ' + quote.statement.amount + ' y destinatario ' + quote.statement.recipient
        + '; revelar sólo la apertura al worker, ninguna raíz o clave privada', async (value, key, before, raw, root) => {
          const note = value.note, spend = value.spend, role = quote.noteRole, job = spend?.proofJob;
          if (!note?.deviceJob || !spend?.reservation || !job || !spend[role].privateKey || spend.exits?.[role]
            || quote.rootId !== value.rootId || quote.noteRevision !== value.revision || quote.parentJobId !== job.jobId
            || quote.origin !== job.origin || quote.pairingId !== job.pairingId || quote.devicePublicKey !== job.devicePublicKey
            || quote.poolTerms.scope !== note.scope || quote.poolTerms.policy !== note.policy
            || quote.poolTerms.assetIdentity !== note.deviceJob.assetIdentity || quote.poolTerms.domainCommitment !== note.deviceJob.domainCommitment)
            bad('MOBILE_LOCAL_ORIGINAL_EXIT_QUOTE_REQUIRED');
          const statement = localDeviceWithdrawalStatementV1({ scope: note.scope, policy: note.policy, epoch: quote.statement.epoch,
            opening: spend[role].opening, path: quote.path, recipient: quote.statement.recipient });
          if (JSON.stringify(statement) !== JSON.stringify(quote.statement)
            || statement.commitment !== spend.statement[role === 'change' ? 'changeCommitment' : 'recoveryCommitment']) bad('MOBILE_LOCAL_ORIGINAL_EXIT_QUOTE_CHANGED');
          const entropy = await checked(scope, () => Crypto.getRandomBytesAsync(32));
          let witness: DeviceExitWitnessV1 | null = null, message: Uint8Array | null = null, noteKey: Uint8Array | null = null;
          try {
            const intent: LocalExitIntentV1 = { version: 1, phase: 'PREPARED', parentJobId: job.jobId, nativeBindingSHA256: quote.nativeBindingSHA256,
              quoteId: quote.quoteId, jobId: bytesToHex(entropy), origin: quote.origin, pairingId: quote.pairingId, devicePublicKey: quote.devicePublicKey,
              rootId: value.rootId, noteRevision: quote.noteRevision, noteRole: role, statement, path: quote.path, signature: null, witnessSHA256: null };
            if (intent.jobId === '0'.repeat(64)) bad('MOBILE_ENTROPY_FAILED');
            const next: State = { ...value, revision: value.revision + 1, spend: { ...spend, exits: { ...spend.exits, [role]: intent } } };
            readDeviceExitQuoteV1(handle); await persistSpend(next, key, before, raw, root); current(); readDeviceExitQuoteV1(handle);
            const nextBefore = await checked(scope, () => SecureStore.getItemAsync(POINTER, DATA)), nextRaw = await readStoredRecord(scope);
            if (nextBefore === null || nextRaw === null || pointer(nextBefore).revision !== next.revision) bad('MOBILE_LOCAL_NOTE_WRITE_UNCERTAIN');
            const retainedNoteKey = spend[role].privateKey; if (retainedNoteKey === null) bad('MOBILE_LOCAL_EXIT_KEY_REQUIRED');
            noteKey = privateKeyFromHex(retainedNoteKey); message = localDeviceWithdrawalFrameV1(statement);
            const signature = signDeviceMessage(noteKey, message);
            witness = normalizeDeviceExitWitnessV1(localDeviceWithdrawalWitnessV1({ statement, opening: spend[role].opening, path: quote.path, signature }));
            const encodedWitness = deviceExitWitnessBytesV1(witness);
            let witnessSHA256: string;
            try { witnessSHA256 = await checked(scope, () => digest(encodedWitness)); } finally { encodedWitness.fill(0); }
            const signed: LocalExitIntentV1 = { ...intent, phase: 'SIGNED', signature, witnessSHA256 };
            const persistedSpend = next.spend; if (!persistedSpend) bad('MOBILE_LOCAL_ORIGINAL_RESERVATION_REQUIRED');
            const final: State = { ...next, revision: next.revision + 1, spend: { ...persistedSpend, exits: { ...persistedSpend.exits, [role]: signed } } };
            readDeviceExitQuoteV1(handle); await persistSpend(final, key, nextBefore, nextRaw, root); current(); readDeviceExitQuoteV1(handle);
            const request: LocalDeviceExitProofRequestV1 = Object.freeze({ rootId: value.rootId, parentJobId: job.jobId,
              nativeBindingSHA256: intent.nativeBindingSHA256, quoteId: intent.quoteId, jobId: intent.jobId, noteRevision: intent.noteRevision,
              noteRole: role, statement, witnessSHA256, expiresAt: quote.expiresAt,
              close() { const row = exitRequests.get(request); if (row) { row.consumed = true; wipeExit(row.witness); } } });
            exitRequests.set(request, { witness, quote: handle, consumed: false }); outstandingExitWitnesses.add(witness); witness = null; return request;
          } finally { entropy.fill(0); message?.fill(0); noteKey?.fill(0); if (witness) wipeDeviceExitWitnessV1(witness); }
        });
    },
    bindDeviceExitProofRequest: (request: LocalDeviceExitProofRequestV1, rawConsent: DeviceExitConsentV1): Promise<DeviceExitWitnessV1> => {
      current(); const row = exitRequests.get(request);
      if (!row || row.consumed || request.rootId !== expectedRootId || Date.now() >= request.expiresAt) bad('MOBILE_LOCAL_ORIGINAL_EXIT_REQUEST_REQUIRED');
      row.consumed = true; let consent: DeviceExitConsentV1;
      try { consent = validateDeviceExitConsentFreshV1(rawConsent); const quote = readDeviceExitQuoteV1(row.quote);
        if (consent.action !== 'PROVE_W39' || consent.origin !== quote.origin || consent.pairingId !== quote.pairingId
          || consent.devicePublicKey !== quote.devicePublicKey || JSON.stringify(consent.statement) !== JSON.stringify(request.statement)) bad('MOBILE_LOCAL_EXIT_CONSENT_CHANGED');
        for (const name of ['parentJobId', 'nativeBindingSHA256', 'quoteId', 'jobId', 'rootId', 'noteRevision', 'noteRole', 'witnessSHA256'] as const)
          if (consent[name] !== request[name]) bad('MOBILE_LOCAL_EXIT_CONSENT_CHANGED');
        if (JSON.stringify(consent.poolTerms) !== JSON.stringify(quote.poolTerms)) bad('MOBILE_LOCAL_EXIT_CONSENT_CHANGED');
      } catch (cause) { wipeExit(row.witness); throw cause; }
      return original('Confirmar esta única revelación W39; no exportar raíz/clave ni repetir otro trabajo', async value => {
        try {
          const retained = value.spend?.exits?.[request.noteRole];
          if (!retained || retained.phase !== 'SIGNED' || retained.jobId !== request.jobId || retained.witnessSHA256 !== request.witnessSHA256
            || retained.receipt || JSON.stringify(retained.statement) !== JSON.stringify(request.statement)) bad('MOBILE_LOCAL_EXIT_CONSENT_CHANGED');
          const bytes = deviceExitWitnessBytesV1(row.witness);
          try { if (await checked(scope, () => digest(bytes)) !== request.witnessSHA256) bad('MOBILE_LOCAL_EXIT_CONSENT_CHANGED'); }
          finally { bytes.fill(0); }
          readDeviceExitQuoteV1(row.quote); validateDeviceExitConsentFreshV1(consent); current();
          if (Date.now() >= request.expiresAt) bad('MOBILE_LOCAL_EXIT_CONSENT_CHANGED'); return row.witness;
        } catch (cause) { wipeExit(row.witness); throw cause; }
      }).catch(cause => { wipeExit(row.witness); throw cause; });
    },
    readDeviceExitIntent: (role: DeviceExitRoleV1) => original('Consultar el trabajo W39 durable original; no regenerar/reintentar salida', async value => {
      if (!['change', 'recovery'].includes(role)) bad('MOBILE_LOCAL_EXIT_ROLE'); const row = value.spend?.exits?.[role];
      return row ? Object.freeze({ parentJobId: row.parentJobId, nativeBindingSHA256: row.nativeBindingSHA256, jobId: row.jobId,
        quoteId: row.quoteId, rootId: row.rootId, noteRevision: row.noteRevision, noteRole: role, phase: row.phase,
        statement: row.statement, witnessSHA256: row.witnessSHA256, receipt: row.receipt ? Object.freeze({ ...row.receipt }) : null,
        availableBalance: null }) : null;
    }),
    applyDeviceExitConfirmation: (response: object) => {
      current(); const confirmation = readDeviceExitConfirmationV1(response);
      return original('Guardar la salida W39 canónica original de esta misma apertura; no reenviar ni sumar dinero local', async (value, key, before, raw, root) => {
        const repeated = readDeviceExitConfirmationV1(response), consent = confirmation.consent, status = confirmation.status;
        const spend = value.spend, row = spend?.exits?.[consent.noteRole], observed = status.observation;
        if (repeated.status !== status || !spend || !row || !observed || row.phase !== 'SIGNED' || status.stage !== 'CONFIRMED'
          || row.origin !== consent.origin || row.pairingId !== consent.pairingId || row.devicePublicKey !== consent.devicePublicKey
          || JSON.stringify(row.statement) !== JSON.stringify(status.statement) || row.witnessSHA256 !== consent.witnessSHA256) bad('MOBILE_LOCAL_ORIGINAL_EXIT_CONFIRMATION_REQUIRED');
        for (const name of ['parentJobId', 'nativeBindingSHA256', 'quoteId', 'jobId', 'rootId', 'noteRevision', 'noteRole'] as const)
          if (row[name] !== consent[name]) bad('MOBILE_LOCAL_ORIGINAL_EXIT_CONFIRMATION_REQUIRED');
        const receipt = { transactionHash: observed.transactionHash, blockHash: observed.blockHash, blockNumber: observed.blockNumber,
          calldataSHA256: observed.calldataSHA256, timestamp: observed.timestamp, domainCommitment: observed.domainCommitment };
        if (row.receipt && JSON.stringify(row.receipt) !== JSON.stringify(receipt)) bad('MOBILE_LOCAL_ORIGINAL_EXIT_CONFIRMATION_CHANGED');
        if (!row.receipt) { const next: State = { ...value, revision: value.revision + 1, spend: { ...spend,
          exits: { ...spend.exits, [consent.noteRole]: { ...row, receipt } } } }; readDeviceExitConfirmationV1(response); await persistSpend(next, key, before, raw, root); }
        current(); readDeviceExitConfirmationV1(response); return Object.freeze({ jobId: row.jobId, noteRole: row.noteRole,
          commitment: row.statement.commitment, nullifier: row.statement.nullifier, recipient: row.statement.recipient,
          withdrawnAmount: row.statement.amount, transactionHash: receipt.transactionHash, availableBalance: null,
          independentCanonicalRpc: false, localSourceKeyPreserved: true });
      });
    },
    /** Local intent is reread before a native action leaves this device. This
     * does not claim server admission; a lost reply remains original-only. An
     * old backup is not anti-rollback: native ledger/latches still fence effects. */
    retainDeviceExecutionIntent: (review: object) => {
      current(); const consent = readDeviceExecutionReviewV1(review);
      if (consent.action === 'RECONCILE_NATIVE') bad('MOBILE_LOCAL_NATIVE_ACTION_REQUIRED');
      return original('Guardar una única intención de ' + consent.action + ' para la reserva original; no repetir tras respuesta perdida',
        async (value, key, before, raw, root) => {
          if (readDeviceExecutionReviewV1(review) !== consent) bad('MOBILE_LOCAL_ORIGINAL_EXECUTION_REQUIRED');
          const note = value.note, spend = value.spend, job = spend?.proofJob, reservation = spend?.reservation, fields = consent.reservation;
          if (!note?.deviceJob || !spend || !job || !reservation || fields.jobId !== job.jobId
            || fields.depositJobId !== job.depositJobId || fields.quoteId !== job.quoteId || fields.witnessSHA256 !== job.witnessSHA256
            || fields.custody.rootId !== value.rootId || fields.custody.frameSHA256 !== spend.frameSHA256
            || JSON.stringify(fields.statement) !== JSON.stringify(spend.statement)
            || fields.origin !== job.origin || fields.pairingId !== job.pairingId || fields.devicePublicKey !== job.devicePublicKey
            || fields.poolTerms.scope !== note.scope || fields.poolTerms.policy !== note.policy
            || fields.poolTerms.assetIdentity !== note.deviceJob.assetIdentity || fields.poolTerms.domainCommitment !== reservation.domainCommitment
            || consent.reservationTransactionHash !== reservation.transactionHash) bad('MOBILE_LOCAL_ORIGINAL_EXECUTION_REQUIRED');
          const previous = spend.execution;
          if (previous && (previous.nativeBindingSHA256 !== consent.nativeBindingSHA256
            || previous.reservationTransactionHash !== consent.reservationTransactionHash)) bad('MOBILE_LOCAL_ORIGINAL_EXECUTION_CHANGED');
          const action = consent.action === 'EXECUTE_NATIVE' ? 'execute' : 'recovery';
          if (previous?.[action] || previous?.terminal) bad('MOBILE_LOCAL_NATIVE_RECONCILE_ORIGINAL_ONLY');
          const frame = deviceExecutionConsentMessageV1(consent);
          let consentSHA256: string;
          try { consentSHA256 = await checked(scope, () => digest(frame)); } finally { frame.fill(0); }
          readDeviceExecutionReviewV1(review);
          const execution: LocalNativeExecutionV1 = { ...previous, version: 1, jobId: job.jobId,
            nativeBindingSHA256: consent.nativeBindingSHA256, reservationTransactionHash: consent.reservationTransactionHash,
            [action]: { consentSHA256, executionSnapshotSHA256: consent.executionSnapshotSHA256 } };
          await persistSpend({ ...value, revision: value.revision + 1, spend: { ...spend, execution } }, key, before, raw, root);
          readDeviceExecutionReviewV1(review); current(); liveInclusion = null;
          return Object.freeze({ jobId: job.jobId, action: consent.action, consentSHA256, availableBalance: null, serverAdmissionEstablished: false });
        });
    },
    readDeviceExecutionIntent: () => original('Consultar la intención nativa original; no ejecutar ni recuperar de nuevo', async value => {
      const row = value.spend?.execution; return row ? Object.freeze({ jobId: row.jobId, rootId: value.rootId,
        nativeBindingSHA256: row.nativeBindingSHA256, reservationTransactionHash: row.reservationTransactionHash,
        executeAttemptRetained: !!row.execute, recoveryAttemptRetained: !!row.recovery, outcome: row.reorganizationPending ? null : row.terminal?.outcome ?? null,
        transactionHash: row.terminal?.transactionHash ?? null, availableBalance: null, independentCanonicalRpc: false }) : null;
    }),
    /** Retain only uncertainty reported by the same original SDK reconciliation.
     * No status JSON or hash can grant economic authority. */
    applyDeviceExecutionObservation: (response: object) => {
      current(); const originalStatus = readDeviceExecutionObservationV1(response);
      liveInclusion = null; liveOutputBalances = null;
      return original('Conservar la incertidumbre de la recuperación original antes de volver a observarla',
        async (value, key, before, raw, root) => {
          const actual = readDeviceExecutionObservationV1(response), {status, consent} = actual;
          const spend = value.spend, row = spend?.execution;
          if (actual.status !== originalStatus.status || consent.action !== 'RECONCILE_NATIVE'
            || status.jobId !== spend?.proofJob?.jobId || row && (status.nativeBindingSHA256 !== row.nativeBindingSHA256
            || consent.reservationTransactionHash !== row.reservationTransactionHash)) bad('MOBILE_LOCAL_ORIGINAL_EXECUTION_REQUIRED');
          if (status.terminal !== null || status.outcome !== null) bad('MOBILE_LOCAL_ORIGINAL_EXECUTION_REQUIRED');
          // Initial executions remain covered by their existing intent. Only a
          // previously confirmed F needs an invalidation record on this device.
          if (row?.terminal?.outcome === 'RECOVERED' && status.stage === 'UNKNOWN' && !row.reorganizationPending) {
            const execution: LocalNativeExecutionV1 = {...row, reorganizationPending:{state:'OBSERVATION_PENDING',
              authorizationSHA256:status.authorizationSHA256,executionSnapshotSHA256:status.executionSnapshotSHA256}};
            readDeviceExecutionObservationV1(response);
            await persistSpend({...value,revision:value.revision+1,spend:{...spend,execution}},key,before,raw,root);
          }
          readDeviceExecutionObservationV1(response); current();
          return Object.freeze({jobId:status.jobId,outcome:null,availableBalance:null,originalOnly:true});
        });
    },
    applyDeviceExecutionTerminal: (response: object) => {
      current(); const observation = readDeviceExecutionTerminalV1(response);
      // A new original terminal revokes monetary freshness before storage/auth.
      liveInclusion = null; liveOutputBalances = null;
      return original('Guardar el resultado original de esta ejecución; no cambiar claves, repetir entregas ni proyectar saldo libre',
        async (value, key, before, raw, root) => {
          const actual = readDeviceExecutionTerminalV1(response), status = actual.status, consent = actual.consent;
          const note = value.note, spend = value.spend, job = spend?.proofJob, reservation = spend?.reservation, terminal = status.terminal;
          if (actual.status !== observation.status || !note?.deviceJob || !spend || !job || !reservation || !terminal
            || status.jobId !== job.jobId || status.reservation.consentFields.depositJobId !== job.depositJobId
            || status.reservation.consentFields.quoteId !== job.quoteId || status.reservation.consentFields.witnessSHA256 !== job.witnessSHA256
            || status.reservation.consentFields.custody.rootId !== value.rootId
            || status.reservation.consentFields.custody.frameSHA256 !== spend.frameSHA256
            || JSON.stringify(status.reservation.statement) !== JSON.stringify(spend.statement)
            || consent.reservation.origin !== job.origin || consent.reservation.pairingId !== job.pairingId
            || consent.reservation.devicePublicKey !== job.devicePublicKey
            || consent.reservation.poolTerms.scope !== note.scope || consent.reservation.poolTerms.policy !== note.policy
            || consent.reservation.poolTerms.assetIdentity !== note.deviceJob.assetIdentity
            || consent.reservation.poolTerms.domainCommitment !== reservation.domainCommitment
            || consent.reservationTransactionHash !== reservation.transactionHash) bad('MOBILE_LOCAL_ORIGINAL_EXECUTION_REQUIRED');
          const previous = spend.execution;
          if (previous && (previous.nativeBindingSHA256 !== status.nativeBindingSHA256
            || previous.reservationTransactionHash !== consent.reservationTransactionHash)) bad('MOBILE_LOCAL_ORIGINAL_EXECUTION_CHANGED');
          const receipt = { transactionHash: terminal.transactionHash, blockHash: terminal.blockHash, blockNumber: terminal.blockNumber,
            calldataSHA256: terminal.calldataSHA256, outcome: terminal.outcome };
          if (previous?.reorganizationPending && consent.action !== 'RECONCILE_NATIVE') bad('MOBILE_LOCAL_ORIGINAL_EXECUTION_CHANGED');
          const changed = previous?.terminal && JSON.stringify(previous.terminal) !== JSON.stringify(receipt);
          let reorganizations = previous?.reorganizations;
          if (changed) {
            const prior = previous.terminal!;
            // Only the original F wire may be observed in a new canonical block.
            // SDK provenance is not independent RPC verification or new consent.
            if (!previous.reorganizationPending || consent.action !== 'RECONCILE_NATIVE' || prior.outcome !== 'RECOVERED' || receipt.outcome !== 'RECOVERED'
              || prior.transactionHash !== receipt.transactionHash || prior.calldataSHA256 !== receipt.calldataSHA256
              || prior.blockHash === receipt.blockHash || (reorganizations?.length ?? 0) >= 16
              || reorganizations?.some(row => row.blockHash === receipt.blockHash)) bad('MOBILE_LOCAL_ORIGINAL_EXECUTION_CHANGED');
            reorganizations = [...(reorganizations ?? []), { ...prior }];
          }
          if (!previous?.terminal || changed || previous.reorganizationPending) {
            const execution: LocalNativeExecutionV1 = { ...previous, version: 1, jobId: job.jobId,
              nativeBindingSHA256: status.nativeBindingSHA256, reservationTransactionHash: consent.reservationTransactionHash,
              terminal: receipt, ...(reorganizations ? { reorganizations } : {}) };
            delete execution.reorganizationPending;
            readDeviceExecutionTerminalV1(response); await persistSpend({ ...value, revision: value.revision + 1, spend: { ...spend, execution } }, key, before, raw, root);
          }
          readDeviceExecutionTerminalV1(response); current(); liveInclusion = null;
          return Object.freeze({ jobId: job.jobId, outcome: receipt.outcome, transactionHash: receipt.transactionHash,
            availableBalance: null, localOpeningsPreserved: true, independentCanonicalRpc: false });
        });
    },
    readDeviceReservationIntent: () => original('Consultar el identificador de tu prueba/reserva original; no generar otra ni reenviar',
      async value => value.spend?.proofJob ? Object.freeze({ ...value.spend.proofJob, rootId: value.rootId,
        operationId: value.spend.proposal.operationId, nativeEffectsEstablished: false as const }) : null),
    close() { discardReview(); closed = true; liveInclusion = null; liveOutputBalances = null;
      for (const witness of outstandingWitnesses) wipeWitness(witness);
      for (const witness of outstandingAuthorizationWitnesses) wipeAuthorization(witness);
      for (const witness of outstandingExitWitnesses) wipeExit(witness); },

  });
}
