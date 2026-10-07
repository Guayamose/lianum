import * as SecureStore from 'expo-secure-store';
import { normalizeMobileAuthorization, type MobileAuthorization } from '@lianum/mobile-protocol';
import type { MobileOutcome } from '../api/wallet-api.mjs';

const KEY = 'lianum.pending.authorizations.v1';
const options: SecureStore.SecureStoreOptions = {
  requireAuthentication: true,
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  keychainService: 'org.lianum.wallet.pending.authenticated.v1',
  authenticationPrompt: 'Acceder a tus operaciones pendientes de Lianum',
};
export type PendingOperation = Readonly<{
  authorization: MobileAuthorization;
  status: 'SUBMITTING' | MobileOutcome['status'];
}>;
function parse(raw: string | null, allowInsecureLocalhost: boolean): PendingOperation | null {
  if (raw === null) return null;
  const value = JSON.parse(raw);
  if (!value || Object.getPrototypeOf(value) !== Object.prototype
    || Object.keys(value).sort().join(',') !== 'authorization,status'
    || !['SUBMITTING', 'ACCEPTED', 'UNKNOWN', 'REJECTED'].includes(value.status))
    throw new Error('MOBILE_PENDING_STATE_INVALID');
  return Object.freeze({ authorization: normalizeMobileAuthorization(value.authorization, { allowInsecureLocalhost }), status: value.status });
}
export async function readPendingOperation(allowInsecureLocalhost = false): Promise<PendingOperation | null> {
  return parse(await SecureStore.getItemAsync(KEY, options), allowInsecureLocalhost);
}
export async function retainPendingOperation(operation: PendingOperation, allowInsecureLocalhost = false): Promise<void> {
  const checked = parse(JSON.stringify(operation), allowInsecureLocalhost);
  if (!checked) throw new Error('MOBILE_PENDING_STATE_INVALID');
  const old = await readPendingOperation(allowInsecureLocalhost);
  // One active operation in this initial client. Retain the original ID until
  // reconciliation can establish completion; ADMITTED is not completion.
  if (old && old.status !== 'REJECTED'
    && (old.authorization.challenge.intent.requestId !== checked.authorization.challenge.intent.requestId
      || old.authorization.challenge.ownerPublicKey !== checked.authorization.challenge.ownerPublicKey
      || old.authorization.challenge.origin !== checked.authorization.challenge.origin))
    throw new Error('MOBILE_ORIGINAL_OPERATION_REQUIRED');
  await SecureStore.setItemAsync(KEY, JSON.stringify(checked), options);
}
