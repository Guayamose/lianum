import * as SecureStore from 'expo-secure-store';
import { normalizeMobileAuthorization, normalizeMobileIntent, normalizeMobileOrigin,
  type MobileAuthorization, type MobileIntent } from '@lianum/mobile-protocol';
import type { MobileOutcome } from '../api/wallet-api.mjs';

const KEY = 'lianum.pending.authorizations.v1';
const options: SecureStore.SecureStoreOptions = {
  requireAuthentication: true,
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  keychainService: 'org.lianum.wallet.pending.authenticated.v1',
  authenticationPrompt: 'Acceder a tus operaciones pendientes de Lianum',
};
export type PendingAuthorization = Readonly<{
  authorization: MobileAuthorization;
  status: 'SUBMITTING' | MobileOutcome['status'];
}>;
export type PendingOperation = Readonly<{
  authorization: MobileAuthorization;
  status: PendingAuthorization['status'];
  economicState: 'UNRESOLVED';
  originalAuthorization: MobileAuthorization;
  authorizations: readonly PendingAuthorization[];
  legacyEvidenceIncomplete: boolean;
}>;
type StoredOperation = Readonly<{
  version: 2;
  economicState: 'UNRESOLVED';
  originalAuthorization: MobileAuthorization;
  authorizations: readonly PendingAuthorization[];
  legacyEvidenceIncomplete: boolean;
}>;
function fail(code: string): never { throw new Error(code); }
function exact(value: unknown, names: string[]): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype
    && Reflect.ownKeys(value).length === names.length && names.every(name => {
      const descriptor = Object.getOwnPropertyDescriptor(value, name);
      return descriptor?.enumerable && Object.hasOwn(descriptor, 'value');
    });
}
function permission(raw: unknown, allowInsecureLocalhost: boolean): PendingAuthorization {
  if (!exact(raw, ['authorization', 'status'])
    || typeof raw.status !== 'string' || !['SUBMITTING', 'ACCEPTED', 'UNKNOWN', 'REJECTED'].includes(raw.status))
    fail('MOBILE_PENDING_STATE_INVALID');
  return Object.freeze({ authorization: normalizeMobileAuthorization(raw.authorization, { allowInsecureLocalhost }),
    status: raw.status as PendingAuthorization['status'] });
}
function operationTerms(challenge: { origin: string; ownerPublicKey: string; intent: MobileIntent }): string {
  const { action: _action, ...terms } = challenge.intent;
  return JSON.stringify({ origin: challenge.origin, ownerPublicKey: challenge.ownerPublicKey, terms });
}
export function assertPendingOperationIdentity(original: PendingOperation | null,
  input: { origin: string; ownerPublicKey: string; intent: MobileIntent }, allowInsecureLocalhost = false): void {
  if (original && operationTerms(original.originalAuthorization.challenge) !== operationTerms({ ...input,
    origin: normalizeMobileOrigin(input.origin, { allowInsecureLocalhost }), intent: normalizeMobileIntent(input.intent) }))
    fail('MOBILE_ORIGINAL_OPERATION_REQUIRED');
}
function view(stored: StoredOperation): PendingOperation {
  const latest = stored.authorizations.at(-1)!;
  return Object.freeze({ ...latest, economicState: stored.economicState,
    originalAuthorization: stored.originalAuthorization, authorizations: stored.authorizations,
    legacyEvidenceIncomplete: stored.legacyEvidenceIncomplete });
}
function parse(raw: string | null, allowInsecureLocalhost: boolean): PendingOperation | null {
  if (raw === null) return null;
  const value = JSON.parse(raw);
  if (exact(value, ['authorization', 'status'])) {
    // V1 stored one permission and may already have lost an earlier action.
    // Preserve those exact bytes' meaning; do not invent missing history or
    // infer an economic rejection from a legacy permission's REJECTED status.
    const retained = permission(value, allowInsecureLocalhost);
    return view({ version: 2, economicState: 'UNRESOLVED', originalAuthorization: retained.authorization,
      authorizations: Object.freeze([retained]), legacyEvidenceIncomplete: true });
  }
  if (!exact(value, ['version', 'economicState', 'originalAuthorization', 'authorizations', 'legacyEvidenceIncomplete'])
    || value.version !== 2 || value.economicState !== 'UNRESOLVED' || typeof value.legacyEvidenceIncomplete !== 'boolean'
    || !Array.isArray(value.authorizations) || value.authorizations.length < 1 || value.authorizations.length > 4)
    fail('MOBILE_PENDING_STATE_INVALID');
  const originalAuthorization = normalizeMobileAuthorization(value.originalAuthorization, { allowInsecureLocalhost });
  const authorizations = (value.authorizations as unknown[]).map(row => permission(row, allowInsecureLocalhost));
  if (JSON.stringify(originalAuthorization) !== JSON.stringify(authorizations[0].authorization)
    || new Set(authorizations.map(row => row.authorization.challenge.intent.action)).size !== authorizations.length
    || authorizations.some(row => operationTerms(row.authorization.challenge) !== operationTerms(originalAuthorization.challenge)))
    fail('MOBILE_PENDING_STATE_INVALID');
  return view({ version: 2, economicState: 'UNRESOLVED', originalAuthorization,
    authorizations: Object.freeze(authorizations), legacyEvidenceIncomplete: value.legacyEvidenceIncomplete });
}
async function read(allowInsecureLocalhost: boolean): Promise<PendingOperation | null> {
  return parse(await SecureStore.getItemAsync(KEY, options), allowInsecureLocalhost);
}
// Serialize this JS realm's reads/writes. SecureStore is not a cross-process
// CAS/antirollback journal; those native guarantees remain a separate task.
let tail: Promise<unknown> = Promise.resolve();
function serial<T>(work: () => Promise<T>): Promise<T> {
  const result = tail.then(work); tail = result.catch(() => {}); return result;
}
export function readPendingOperation(allowInsecureLocalhost = false): Promise<PendingOperation | null> {
  return serial(() => read(allowInsecureLocalhost));
}
export function retainPendingOperation(operation: PendingAuthorization, allowInsecureLocalhost = false): Promise<PendingOperation> {
  // Detach and validate before the queued asynchronous boundary.
  const checked = permission(operation, allowInsecureLocalhost);
  return serial(async () => {
    const old = await read(allowInsecureLocalhost);
    assertPendingOperationIdentity(old, checked.authorization.challenge, allowInsecureLocalhost);
    const authorizations = [...(old?.authorizations ?? [])];
    const index = authorizations.findIndex(row => row.authorization.challenge.intent.action === checked.authorization.challenge.intent.action);
    if (index >= 0) {
      const previous = authorizations[index];
      if (JSON.stringify(previous.authorization) !== JSON.stringify(checked.authorization))
        fail('MOBILE_ORIGINAL_AUTHORIZATION_REQUIRED');
      if (previous.status !== checked.status && (['ACCEPTED', 'REJECTED'].includes(previous.status)
        || checked.status === 'SUBMITTING')) fail('MOBILE_AUTHORIZATION_STATE_CONFLICT');
      authorizations[index] = checked;
    } else {
      if (checked.status !== 'SUBMITTING') fail('MOBILE_AUTHORIZATION_NOT_RETAINED');
      authorizations.push(checked);
    }
    const stored: StoredOperation = { version: 2, economicState: 'UNRESOLVED',
      originalAuthorization: old?.originalAuthorization ?? checked.authorization,
      authorizations, legacyEvidenceIncomplete: old?.legacyEvidenceIncomplete ?? false };
    const bytes = JSON.stringify(stored), next = parse(bytes, allowInsecureLocalhost)!;
    await SecureStore.setItemAsync(KEY, bytes, options);
    if (await SecureStore.getItemAsync(KEY, options) !== bytes) fail('MOBILE_PENDING_READBACK_FAILED');
    return next;
  });
}
