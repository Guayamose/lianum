import * as WalletSession from './wallet-session-v1.ts';
export {approveWalletSessionExternalV1,closeWalletSessionAuthorizationV1} from './wallet-session-v1.ts';
import {devicePagedNowV3} from '@lianum/mobile-protocol/device/paged-owner-v3';
import * as blueRedemption from '../../../../packages/mobile-protocol/src/device-morpho-blue-redemption-v1.mjs';
import {sealDeviceCustodyBackupV1,unsealDeviceCustodyBackupV1,DEVICE_CUSTODY_BACKUP_MAX_SERIALIZED_BYTES_V1} from './sealed-custody-backup-v1.mjs';
import {validateExternalFlatGraphOutputFreshV1,externalFlatGraphOutputPermissionMessageV1} from '../../../../packages/mobile-protocol/src/device-external-flat-graph-v1.mjs';
import {validateExternalFlatGraphFreshV1,externalFlatGraphPermissionMessageV1} from '../../../../packages/mobile-protocol/src/device-external-flat-graph-v1.mjs';
import {validateExternalFlatFreshV1,externalFlatPermissionMessageV1} from '../../../../packages/mobile-protocol/src/device-external-flat-note-v1.mjs';
import * as defiPositionReadProtocol from '../../../../packages/mobile-protocol/src/device-defi-position-read-v1.mjs';
import {validateDeviceRecoveryArmConsentFreshV1,deviceRecoveryArmConsentMessageV1} from '../../../../packages/mobile-protocol/src/device-recovery-arm-consent-v1.mjs';
import * as SecureStore from 'expo-secure-store';
import * as LocalAuthentication from 'expo-local-authentication';
import * as Crypto from 'expo-crypto';
import { AppState, Platform } from 'react-native';
import { mobileAuthorizationMessage, validateMobileChallenge, mobileReceiptMessage,
  validateMobileReceiptReview, type MobileChallenge, type MobileReceiptReview } from '@lianum/mobile-protocol';
import { normalizeOriginalAccountAccessV2, normalizeOriginalAccountReviewV2,
  validateOriginalAccountFreshV2, originalAccountAccessMessageV2, originalAccountReviewMessageV2 }
  from '@lianum/mobile-protocol/original-account-v2';
import { privateStateAccessMessageV1, privateStateReviewMessageV1 }
  from '@lianum/mobile-protocol/original-account-v2';
import { bytesToHex, privateKeyFromHex, devicePublicKey, signDeviceMessage, signNativePrivateDeviceConsentV2 } from './signing.mjs';
import { validateDeviceDepositConsentEitherFreshV2 as validateDeviceDepositConsentFreshV1, deviceDepositConsentEitherMessageV2 as deviceDepositConsentMessageV1 }
  from '../../../../packages/mobile-protocol/src/device-native-private-deposit-v2.mjs';

import { validateDeviceReservationConsentEitherFreshV2 as validateDeviceReservationConsentFreshV1, deviceReservationConsentEitherMessageV2 as deviceReservationConsentMessageV1 }
  from '../../../../packages/mobile-protocol/src/device-native-private-reservation-v2.mjs';

import { validateDeviceExitConsentEitherFreshV2 as validateDeviceExitConsentFreshV1,deviceExitConsentEitherMessageV2 as deviceExitConsentMessageV1 }
  from '../../../../packages/mobile-protocol/src/device-native-private-exit-v2.mjs';
import { validateDeviceExecutionConsentFreshV1, deviceExecutionConsentMessageV1 }
  from '../../../../packages/mobile-protocol/src/device-execution-consent-v1.mjs';
const PRIVATE_KEY = 'lianum.owner.secp256k1.v1';
const PUBLIC_KEY = 'lianum.owner.public.v1';
const privateOptions: SecureStore.SecureStoreOptions = {
  requireAuthentication: true,
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  keychainService: 'org.lianum.wallet.owner.authenticated.v1',
  authenticationPrompt: "Confirm this authorization from Lianum",
};
const publicOptions: SecureStore.SecureStoreOptions = { keychainService: 'org.lianum.wallet.owner.public.v1' };
async function assertProtectedStorage() {
  if (!['ios', 'android'].includes(Platform.OS) || !await SecureStore.isAvailableAsync()
    || !SecureStore.canUseBiometricAuthentication()
    || !await LocalAuthentication.hasHardwareAsync() || !await LocalAuthentication.isEnrolledAsync())
    throw new Error('MOBILE_PROTECTED_STORAGE_UNAVAILABLE');
}
export async function readDevicePublicKey(): Promise<string | null> {
  await assertProtectedStorage();
  const value = await SecureStore.getItemAsync(PUBLIC_KEY, publicOptions);
  if (value !== null && !/^04[0-9a-f]{128}$/.test(value)) throw new Error('MOBILE_PUBLIC_KEY_INVALID');
  return value;
}
let identityCustodyBusy = false;
async function identityCustodyWork<T>(work: () => Promise<T>): Promise<T> {
  if (identityCustodyBusy) throw Error('MOBILE_IDENTITY_CUSTODY_BUSY');
  identityCustodyBusy = true;
  try { return await work(); } finally { identityCustodyBusy = false; }
}
export async function createDeviceIdentity(): Promise<string> {
 return identityCustodyWork(async () => {
  if(WalletSession.walletSessionStatusV1().managed)WalletSession.lockWalletSessionV1();
  await assertProtectedStorage();
  const approval = await LocalAuthentication.authenticateAsync({
    promptMessage: "Create or recover your local Lianum identity",
    cancelLabel: "Cancel", disableDeviceFallback: true, biometricsSecurityLevel: 'strong',
  });
  if (!approval.success) throw new Error('MOBILE_AUTHENTICATION_CANCELLED');
  // Never silently replace an existing private key when its public metadata is
  // missing. Read/repair the original first; invalidated storage requires the
  // user to follow the documented recovery path, not automatic key rotation.
  let retained: string | null = await SecureStore.getItemAsync(PRIVATE_KEY, privateOptions);
  const publicMetadata = await SecureStore.getItemAsync(PUBLIC_KEY, publicOptions);
  if (retained === null && publicMetadata !== null) throw new Error('MOBILE_KEY_RECOVERY_REQUIRED');
  let privateKey: Uint8Array | undefined;
  try {
    if (retained !== null) privateKey = privateKeyFromHex(retained);
    else {
      for (let attempt = 0; attempt < 16; attempt++) {
        const entropy = await Crypto.getRandomBytesAsync(32);
        try { privateKey = privateKeyFromHex(bytesToHex(entropy)); break; }
        catch { /* Zero/out-of-range draws are rejected, never weakened. */ }
        finally { entropy.fill(0); }
      }
      if (!privateKey) throw new Error('MOBILE_ENTROPY_FAILED');
      await SecureStore.setItemAsync(PRIVATE_KEY, bytesToHex(privateKey), privateOptions);
    }
    const publicKey = devicePublicKey(privateKey);
    if (publicMetadata !== null && publicMetadata !== publicKey) throw new Error('MOBILE_KEY_BINDING_CHANGED');
    await SecureStore.setItemAsync(PUBLIC_KEY, publicKey, publicOptions);
    return publicKey;
  } finally { privateKey?.fill(0); retained = null; }
 });
}
export async function signReviewedChallenge(challenge: MobileChallenge, expectedOrigin: string,
  allowInsecureLocalhost = false): Promise<string> {
  await assertProtectedStorage();
  const publicKey = await readDevicePublicKey();
  if (publicKey === null) throw new Error('MOBILE_KEY_REQUIRED');
  const checked = validateMobileChallenge(challenge, { origin: expectedOrigin, ownerPublicKey: publicKey, allowInsecureLocalhost });
  let retained: string | null = await SecureStore.getItemAsync(PRIVATE_KEY, privateOptions);
  if (retained === null) throw new Error('MOBILE_KEY_RECOVERY_REQUIRED');
  const privateKey = privateKeyFromHex(retained);
  try {
    if (devicePublicKey(privateKey) !== publicKey) throw new Error('MOBILE_KEY_BINDING_CHANGED');
    // Authentication may take time: reject an expired permission after the
    // protected read as well, before any signature or network transmission.
    validateMobileChallenge(checked, { origin: expectedOrigin, ownerPublicKey: publicKey, allowInsecureLocalhost });
    return signDeviceMessage(privateKey, mobileAuthorizationMessage(checked, { allowInsecureLocalhost }));
  } finally { privateKey.fill(0); retained = null; }
}
export async function signReviewedReceipt(review: MobileReceiptReview, expectedOrigin: string,
  allowInsecureLocalhost = false): Promise<string> {
  await assertProtectedStorage();
  const publicKey = await readDevicePublicKey();
  if (publicKey === null) throw new Error('MOBILE_KEY_REQUIRED');
  const checked = validateMobileReceiptReview(review, {
    origin: expectedOrigin, ownerPublicKey: publicKey, allowInsecureLocalhost,
  });
  let retained: string | null = await SecureStore.getItemAsync(PRIVATE_KEY, {
    ...privateOptions, authenticationPrompt: "Check Lianum's original permission",
  });
  if (retained === null) throw new Error('MOBILE_KEY_RECOVERY_REQUIRED');
  const privateKey = privateKeyFromHex(retained);
  try {
    if (devicePublicKey(privateKey) !== publicKey) throw new Error('MOBILE_KEY_BINDING_CHANGED');
    validateMobileReceiptReview(checked, { origin: expectedOrigin, ownerPublicKey: publicKey, allowInsecureLocalhost });
    return signDeviceMessage(privateKey, mobileReceiptMessage(checked, { allowInsecureLocalhost }));
  } finally { privateKey.fill(0); retained = null; }
}
type OriginalAccessV2 = ReturnType<typeof normalizeOriginalAccountAccessV2>;
type OriginalReviewV2 = ReturnType<typeof normalizeOriginalAccountReviewV2>;
// Only these two reviewed domains are exposed. This helper stays private:
// protected storage never offers a general arbitrary-message signing API.
async function signOriginalAccountPermissionV2(raw: OriginalAccessV2 | OriginalReviewV2,
  expectedOrigin: string, expectedPairingId: string, phase: 'access' | 'review',
  purpose: 'diagnostic' | 'private-state' = 'diagnostic'): Promise<string> {
  await assertProtectedStorage();
  const publicKey = await readDevicePublicKey();
  if (publicKey === null) throw new Error('MOBILE_KEY_REQUIRED');
  const checked = phase === 'access' ? normalizeOriginalAccountAccessV2(raw) : normalizeOriginalAccountReviewV2(raw);
  const current = () => {
    if (checked.origin !== expectedOrigin || checked.pairingId !== expectedPairingId
      || checked.devicePublicKey !== publicKey) throw new Error('MOBILE_REVIEW_CHANGED');
    validateOriginalAccountFreshV2(checked);
  };
  current();
  if (purpose === 'private-state' && checked.action !== 'read') throw new Error('MOBILE_PRIVATE_STATE_INVALID');
  let retained: string | null = await SecureStore.getItemAsync(PRIVATE_KEY, {
    ...privateOptions, authenticationPrompt: purpose === 'private-state'
      ? phase === 'access' ? "Show which account and pool can reveal your private balance"
        : "Read the current private balance of this account and this pool; without sending funds"
      : phase === 'access' ? "Show private review of your original account"
        : "Consult or reconcile this original request",
  });
  if (retained === null) throw new Error('MOBILE_KEY_RECOVERY_REQUIRED');
  const privateKey = privateKeyFromHex(retained);
  try {
    if (devicePublicKey(privateKey) !== publicKey) throw new Error('MOBILE_KEY_BINDING_CHANGED');
    if (await readDevicePublicKey() !== publicKey) throw new Error('MOBILE_KEY_BINDING_CHANGED');
    current();
    const message = purpose === 'private-state'
      ? phase === 'access' ? privateStateAccessMessageV1(checked) : privateStateReviewMessageV1(checked)
      : checked.profile === 'LIANUM_ORIGINAL_ACCOUNT_ACCESS_V2' ? originalAccountAccessMessageV2(checked)
        : originalAccountReviewMessageV2(checked);
    return signDeviceMessage(privateKey, message);
  } finally { privateKey.fill(0); retained = null; }
}
export function signOriginalAccountAccessV2(value: OriginalAccessV2, origin: string, pairingId: string): Promise<string> {
  return signOriginalAccountPermissionV2(value, origin, pairingId, 'access');
}
export function signOriginalAccountReviewV2(value: OriginalReviewV2, origin: string, pairingId: string): Promise<string> {
  return signOriginalAccountPermissionV2(value, origin, pairingId, 'review');
}

/** Explicit protected signing for account/pool balance disclosure. These
 * signatures cannot be used for diagnostic/reconcile or native note spending. */
export function signOriginalPrivateStateAccessV1(value: OriginalAccessV2, origin: string, pairingId: string): Promise<string> {
  return signOriginalAccountPermissionV2(value, origin, pairingId, 'access', 'private-state');
}
export function signOriginalPrivateStateReviewV1(value: OriginalReviewV2, origin: string, pairingId: string): Promise<string> {
  return signOriginalAccountPermissionV2(value, origin, pairingId, 'review', 'private-state');
}
/** Only these fixed D26 domains, never an arbitrary-message signing callback.
 * This is the device transport identity; the circuit verifies the separate
 * note key/signature hidden in its opening. */
export async function signDeviceDepositConsentV1(raw: Parameters<typeof validateDeviceDepositConsentFreshV1>[0],
  expectedOrigin: string, expectedPairingId: string): Promise<string> {
  const value = validateDeviceDepositConsentFreshV1(raw);
  await assertProtectedStorage(); validateDeviceDepositConsentFreshV1(value); const publicKey = await readDevicePublicKey();
  if (publicKey === null) throw new Error('MOBILE_KEY_REQUIRED');
  const current = () => { validateDeviceDepositConsentFreshV1(value);
    if (value.origin !== expectedOrigin || value.pairingId !== expectedPairingId || value.devicePublicKey !== publicKey)
      throw new Error('MOBILE_REVIEW_CHANGED'); };
  current(); let retained: string | null = await SecureStore.getItemAsync(PRIVATE_KEY, { ...privateOptions,
    authenticationPrompt: value.action === 'PROVE_D26'
      ? value.version===2?"Send the opening of this note to the original recipient D26; keep the root and key on the phone"
        :"Reveal only the opening of this note to the worker D26; retain the root and key on the phone"
      : value.action === 'FUND_D26' ? "One-time financing of this " + value.statement.amount + ' unidades'
        : "Check the original submission of this note; do not forward or generate any other proof" });
  if (retained === null) throw new Error('MOBILE_KEY_RECOVERY_REQUIRED');
  const key = privateKeyFromHex(retained);
  try {
    if (devicePublicKey(key) !== publicKey || await readDevicePublicKey() !== publicKey) throw new Error('MOBILE_KEY_BINDING_CHANGED');
    current(); return value.version===2 ? signNativePrivateDeviceConsentV2(key,value)
      : signDeviceMessage(key, deviceDepositConsentMessageV1(value));
  } finally { key.fill(0); retained = null; }
}

/** Fixed U/S consent domains. The transport identity signs the original
 * opening-disclosure/job statement; the distinct source note key signs H4.
 * Neither protected key is serialized into a proof job. */
export async function signDeviceReservationConsentV1(raw: Parameters<typeof validateDeviceReservationConsentFreshV1>[0],
  expectedOrigin: string, expectedPairingId: string): Promise<string> {
  const value = validateDeviceReservationConsentFreshV1(raw);
  await assertProtectedStorage(); const publicKey = await readDevicePublicKey();
  if (publicKey === null) throw new Error('MOBILE_KEY_REQUIRED');
  const current = () => { validateDeviceReservationConsentFreshV1(value);
    if (value.origin !== expectedOrigin || value.pairingId !== expectedPairingId || value.devicePublicKey !== publicKey)
      throw new Error('MOBILE_REVIEW_CHANGED'); };
  current(); let retained: string | null = await SecureStore.getItemAsync(PRIVATE_KEY, { ...privateOptions,
    authenticationPrompt: value.action === 'PROVE_U'
      ? value.version===2 ? "Authorize this graph with its encrypted openings for the original recipient" : "Reveal only the openings of this graph to the U worker; no root or private key"
      : value.action === 'RESERVE_S' ? "Book this note only once; change and recovery are already encrypted"
        : "Check this original reservation; do not repeat the test or transfer" });
  if (retained === null) throw new Error('MOBILE_KEY_RECOVERY_REQUIRED');
  const key = privateKeyFromHex(retained); let message: Uint8Array | null = null;
  try {
    if (devicePublicKey(key) !== publicKey || await readDevicePublicKey() !== publicKey) throw new Error('MOBILE_KEY_BINDING_CHANGED');
    current(); if(value.version===2)return signNativePrivateDeviceConsentV2(key,value);
    message = deviceReservationConsentMessageV1(value);
    return signDeviceMessage(key, message);
  } finally { message?.fill(0); key.fill(0); retained = null; }
}

/** Device PoP for these three W39 operations only. The separate note key signs
 * the exact PC23 withdrawal frame locally; neither protected key is exported. */
export async function signDeviceExitConsentV1(raw: Parameters<typeof validateDeviceExitConsentFreshV1>[0],
  expectedOrigin: string, expectedPairingId: string): Promise<string> {
  const value=validateDeviceExitConsentFreshV1(raw);await assertProtectedStorage();const publicKey=await readDevicePublicKey();
  if(publicKey===null)throw new Error('MOBILE_KEY_REQUIRED');
  const current = () => { validateDeviceExitConsentFreshV1(value);
    if (value.origin !== expectedOrigin || value.pairingId !== expectedPairingId || value.devicePublicKey !== publicKey)
      throw new Error('MOBILE_REVIEW_CHANGED'); };
  current(); let retained: string | null = await SecureStore.getItemAsync(PRIVATE_KEY, { ...privateOptions,
    authenticationPrompt: value.action === 'PROVE_W39'
      ? (value.version===2?"Encrypt this unique W39 opening for the original recipient; no root or private key":"Reveal a single opening of "+value.noteRole+" W39 worker; no root or private key")
      : value.action === 'WITHDRAW_W39' ? "Remove once only " + value.statement.amount + " units to the consignee " + value.statement.recipient
        : "Check this original output; do not generate another test or forward" });
  if (retained === null) throw new Error('MOBILE_KEY_RECOVERY_REQUIRED');
  const key = privateKeyFromHex(retained); let message: Uint8Array | null = null;
  try {
    if (devicePublicKey(key) !== publicKey || await readDevicePublicKey() !== publicKey) throw new Error('MOBILE_KEY_BINDING_CHANGED');
    current(); if(value.version===2)return signNativePrivateDeviceConsentV2(key,value);
    message = deviceExitConsentMessageV1(value); return signDeviceMessage(key, message);
  } finally { message?.fill(0); key.fill(0); retained = null; }
}

/** Native continuation is a separate consent domain. The same protected PoP
 * identity authorizes only this original reservation/provider-risk clause;
 * its signature never replaces the hidden note owner or native provider. */
export async function signDeviceExecutionConsentV1(raw: Parameters<typeof validateDeviceExecutionConsentFreshV1>[0],
  expectedOrigin: string, expectedPairingId: string, signal?: AbortSignal): Promise<string> {
  await assertProtectedStorage(); const publicKey = await readDevicePublicKey();
  if (publicKey === null) throw Error('MOBILE_KEY_REQUIRED');
  const value = validateDeviceExecutionConsentFreshV1(raw);
  const current = () => { if (signal?.aborted) throw Error('MOBILE_DEVICE_EXECUTION_REVOKED'); validateDeviceExecutionConsentFreshV1(value);
    if (value.reservation.origin !== expectedOrigin || value.reservation.pairingId !== expectedPairingId
      || value.reservation.devicePublicKey !== publicKey) throw Error('MOBILE_REVIEW_CHANGED'); };
  current(); let retained: string | null = await SecureStore.getItemAsync(PRIVATE_KEY, { ...privateOptions,
    authenticationPrompt: value.action === 'EXECUTE_NATIVE'
      ? "Run this original reservation only once; irreversible delivery to the risk accepted by the supplier"
      : value.action === 'RECOVER_NATIVE' ? "Recover the original reservation upon expiration of the deadline; delivery loss by the supplier"
        : "Reconcile this original execution; do not repeat the reservation or a delivery" });
  if (retained === null) throw Error('MOBILE_KEY_RECOVERY_REQUIRED');
  const key = privateKeyFromHex(retained); let message: Uint8Array | null = null;
  try {
    if (devicePublicKey(key) !== publicKey || await readDevicePublicKey() !== publicKey) throw Error('MOBILE_KEY_BINDING_CHANGED');
    current(); message = deviceExecutionConsentMessageV1(value); return signDeviceMessage(key, message);
  } finally { message?.fill(0); key.fill(0); retained = null; }
}

/** Arm is consumed now; no root/note key is revealed and the PoP signature is
 * not reused as a fresh economic permission hours later. */
export async function signDeviceRecoveryArmConsentV1(raw:Parameters<typeof validateDeviceRecoveryArmConsentFreshV1>[0],
 expectedOrigin:string,expectedPairingId:string,signal?:AbortSignal):Promise<string>{
  await assertProtectedStorage();const publicKey=await readDevicePublicKey();if(publicKey===null)throw Error('MOBILE_KEY_REQUIRED');
  const value=validateDeviceRecoveryArmConsentFreshV1(raw),reservation=value.execution.reservation;
  const current=()=>{if(signal?.aborted)throw Error('MOBILE_DEVICE_RECOVERY_ARM_REVOKED');validateDeviceRecoveryArmConsentFreshV1(value);
    if(reservation.origin!==expectedOrigin||reservation.pairingId!==expectedPairingId||reservation.devicePublicKey!==publicKey)throw Error('MOBILE_REVIEW_CHANGED');};
  current();let retained:string|null=await SecureStore.getItemAsync(PRIVATE_KEY,{...privateOptions,authenticationPrompt:value.action==='ARM_RECOVERY'
    ?"Enable automatic recovery of this reservation to the original deadline; the service must remain active":"Disable automatic recovery before it starts"});
  if(retained===null)throw Error('MOBILE_KEY_RECOVERY_REQUIRED');const key=privateKeyFromHex(retained);let frame:Uint8Array|null=null;
  try{if(devicePublicKey(key)!==publicKey||await readDevicePublicKey()!==publicKey)throw Error('MOBILE_KEY_BINDING_CHANGED');
    current();frame=deviceRecoveryArmConsentMessageV1(value);return signDeviceMessage(key,frame);
  }finally{frame?.fill(0);key.fill(0);retained=null;}
}


/** READ DeFi has two distinct protected domains. It discloses Linux-owned
 * positions only; neither signature authorizes a note/economic operation. */
export async function signDeviceDefiPositionAccessV1(raw: import('../../../../packages/mobile-protocol/src/device-defi-position-read-v1.mjs').DeviceDefiPositionAccessV1,
  expectedOrigin: string, expectedPairingId: string, signal?: AbortSignal): Promise<string> {
  return signDeviceDefiPositionPermissionV1(raw, expectedOrigin, expectedPairingId, false, signal);
}
export async function signDeviceDefiPositionReadV1(raw: import('../../../../packages/mobile-protocol/src/device-defi-position-read-v1.mjs').DeviceDefiPositionReadV1,
  expectedOrigin: string, expectedPairingId: string, signal?: AbortSignal): Promise<string> {
  return signDeviceDefiPositionPermissionV1(raw, expectedOrigin, expectedPairingId, true, signal);
}
async function signDeviceDefiPositionPermissionV1(raw: import('../../../../packages/mobile-protocol/src/device-defi-position-read-v1.mjs').DeviceDefiPositionAccessV1 | import('../../../../packages/mobile-protocol/src/device-defi-position-read-v1.mjs').DeviceDefiPositionReadV1,
  expectedOrigin: string, expectedPairingId: string, read: boolean, signal?: AbortSignal): Promise<string> {
  if(WalletSession.walletSessionStatusV1().managed)return WalletSession.signWalletSessionDefiPositionV1(raw,expectedOrigin,expectedPairingId,signal);
  const protocol = defiPositionReadProtocol;
  const value = read ? protocol.normalizeDeviceDefiPositionReadV1(raw) : protocol.normalizeDeviceDefiPositionAccessV1(raw);
  const descriptor = protocol.normalizeDeviceDefiPositionDescriptorV1({ origin: expectedOrigin, pairingId: expectedPairingId, devicePublicKey: value.devicePublicKey });
  const current = () => { if (signal?.aborted) throw Error('MOBILE_DEFI_POSITION_READ_REVOKED');
    protocol.validateDeviceDefiPositionFreshV1(value);
    if (Object.keys(descriptor).some(name => value[name as keyof typeof value] !== descriptor[name as keyof typeof descriptor])) throw Error('MOBILE_REVIEW_CHANGED'); };
  current(); await assertProtectedStorage(); const publicKey = await readDevicePublicKey(); current();
  if (publicKey === null || publicKey !== value.devicePublicKey) throw Error('MOBILE_KEY_BINDING_CHANGED');
  let retained: string | null = await SecureStore.getItemAsync(PRIVATE_KEY, { ...privateOptions,
    authenticationPrompt: read ? "Read these DeFi positions guarded in the service; do not withdraw or execute"
      : "Review the DeFi positions of this original service; do not authorize operations" });
  if (retained === null) throw Error('MOBILE_KEY_RECOVERY_REQUIRED');
  const key = privateKeyFromHex(retained); let frame: Uint8Array | null = null;
  try { if (devicePublicKey(key) !== publicKey || await readDevicePublicKey() !== publicKey) throw Error('MOBILE_KEY_BINDING_CHANGED');
    current(); frame = protocol.deviceDefiPositionPermissionMessageV1(value); return signDeviceMessage(key, frame);
  } finally { frame?.fill(0); key.fill(0); retained = null; }
}

/** Separate fixed external source-note domain, never NativeValue EXECUTE/F. */
export async function signDeviceExternalFlatPermissionV1(raw:unknown,expectedOrigin:string,expectedPairingId:string,signal?:AbortSignal,authorization?:object):Promise<string>{
 if(WalletSession.walletSessionStatusV1().managed)return WalletSession.signWalletSessionExternalV1('NOTE',raw,expectedOrigin,expectedPairingId,signal,authorization);
 const value=validateExternalFlatFreshV1(raw);
 await assertProtectedStorage();const publicKey=await readDevicePublicKey();
 if(publicKey===null)throw Error('MOBILE_KEY_REQUIRED');
 const check=()=>{if(signal?.aborted)throw Error('MOBILE_EXTERNAL_FLAT_CANCELLED');const v=validateExternalFlatFreshV1(value);const subject=v.action==='ACCESS'?v:v.descriptor;
 if(subject.origin!==expectedOrigin||subject.pairingId!==expectedPairingId||subject.devicePublicKey!==publicKey)throw Error('MOBILE_EXTERNAL_FLAT_BINDING');return v;};
 const consent=check();const approved=await LocalAuthentication.authenticateAsync({promptMessage:consent.action==='ACCESS'?"Authorize reading of note ERC20":`${consent.action}: ${consent.statement.amount} units to ${consent.recipient}`,cancelLabel:"Cancel",disableDeviceFallback:true,biometricsSecurityLevel:'strong'});check();if(!approved.success)throw Error('MOBILE_AUTHENTICATION_CANCELLED');let retained:string|null=await SecureStore.getItemAsync(PRIVATE_KEY,privateOptions);
 if(retained===null)throw Error('MOBILE_KEY_RECOVERY_REQUIRED');const privateKey=privateKeyFromHex(retained);
 try{if(devicePublicKey(privateKey)!==publicKey||await readDevicePublicKey()!==publicKey)throw Error('MOBILE_KEY_BINDING_CHANGED');return signDeviceMessage(privateKey,externalFlatPermissionMessageV1(check()));}
 finally{privateKey.fill(0);retained=null;}
}

/** Fixed device SOURCE graph domain; opens only this device permission key. */
export async function signDeviceExternalFlatGraphPermissionV1(raw:unknown,expectedOrigin:string,expectedPairingId:string,signal?:AbortSignal,authorization?:object):Promise<string>{
 if(WalletSession.walletSessionStatusV1().managed)return WalletSession.signWalletSessionExternalV1('GRAPH',raw,expectedOrigin,expectedPairingId,signal,authorization);
 const value=validateExternalFlatGraphFreshV1(raw);await assertProtectedStorage();const publicKey=await readDevicePublicKey();if(publicKey===null)throw Error('MOBILE_KEY_REQUIRED');
 const check=()=>{if(signal?.aborted)throw Error('MOBILE_EXTERNAL_FLAT_CANCELLED');const v=validateExternalFlatGraphFreshV1(value),subject=v.descriptor;if(subject.origin!==expectedOrigin||subject.pairingId!==expectedPairingId||subject.devicePublicKey!==publicKey)throw Error('MOBILE_EXTERNAL_FLAT_BINDING');return v;};
 const consent=check(),approved=await LocalAuthentication.authenticateAsync({promptMessage:`${consent.draft.action}: budget ${consent.draft.statement.budget ?? "Graph"}; expires ${consent.draft.statement.settleBefore}`,cancelLabel:"Cancel",disableDeviceFallback:true,biometricsSecurityLevel:'strong'});check();if(!approved.success)throw Error('MOBILE_AUTHENTICATION_CANCELLED');let retained:string|null=await SecureStore.getItemAsync(PRIVATE_KEY,privateOptions);if(retained===null)throw Error('MOBILE_KEY_RECOVERY_REQUIRED');const privateKey=privateKeyFromHex(retained);let frame:Uint8Array|undefined;
 try{if(devicePublicKey(privateKey)!==publicKey||await readDevicePublicKey()!==publicKey)throw Error('MOBILE_KEY_BINDING_CHANGED');frame=externalFlatGraphPermissionMessageV1(check());return signDeviceMessage(privateKey,frame);}finally{frame?.fill(0);privateKey.fill(0);retained=null;}
}

/** Fixed GRAPH-output W39 role permission; the protected note root never leaves. */
export async function signDeviceExternalFlatGraphOutputPermissionV1(raw:unknown,expectedOrigin:string,expectedPairingId:string,signal?:AbortSignal,authorization?:object):Promise<string>{
 if(WalletSession.walletSessionStatusV1().managed)return WalletSession.signWalletSessionExternalV1('OUTPUT',raw,expectedOrigin,expectedPairingId,signal,authorization);
 const value=validateExternalFlatGraphOutputFreshV1(raw);await assertProtectedStorage();const publicKey=await readDevicePublicKey();if(publicKey===null)throw Error('MOBILE_KEY_REQUIRED');const check=()=>{if(signal?.aborted)throw Error('MOBILE_EXTERNAL_FLAT_CANCELLED');const v=validateExternalFlatGraphOutputFreshV1(value),subject=v.consent.descriptor;if(subject.origin!==expectedOrigin||subject.pairingId!==expectedPairingId||subject.devicePublicKey!==publicKey)throw Error('MOBILE_EXTERNAL_FLAT_BINDING');return v;};const reviewed=check(),c=reviewed.consent,approved=await LocalAuthentication.authenticateAsync({promptMessage:`${c.action}: output ${reviewed.noteRole}, ${c.statement.amount} units to ${c.recipient}`,cancelLabel:"Cancel",disableDeviceFallback:true,biometricsSecurityLevel:'strong'});check();if(!approved.success)throw Error('MOBILE_AUTHENTICATION_CANCELLED');let retained:string|null=await SecureStore.getItemAsync(PRIVATE_KEY,privateOptions);if(retained===null)throw Error('MOBILE_KEY_RECOVERY_REQUIRED');const privateKey=privateKeyFromHex(retained);let frame:Uint8Array|undefined;try{if(devicePublicKey(privateKey)!==publicKey||await readDevicePublicKey()!==publicKey)throw Error('MOBILE_KEY_BINDING_CHANGED');frame=externalFlatGraphOutputPermissionMessageV1(check());return signDeviceMessage(privateKey,frame);}finally{frame?.fill(0);privateKey.fill(0);retained=null;}
}

/** Explicit local identity backup. Returns ciphertext only, never a private key.
 * Pairing descriptors are not changed; notes need their own matching snapshots. */
export async function exportDeviceIdentityBackupV1(passphrase: string, expectedPublicKey: string, signal?: AbortSignal): Promise<string> {
  if (arguments.length !== 2 && arguments.length !== 3) throw Error('MOBILE_CUSTODY_BACKUP_INVALID');
  identityBackupPublicKey(expectedPublicKey); const current = () => identityBackupCurrent(signal);
  return identityCustodyWork(async () => {
    if(WalletSession.walletSessionStatusV1().managed)return WalletSession.exportWalletSessionIdentityBackupV1(passphrase,expectedPublicKey,signal);
    let retained: string | null = null, privateKey: Uint8Array | undefined, clear: Uint8Array | undefined;
    try {
      current(); await assertProtectedStorage(); current();
      const approval = await LocalAuthentication.authenticateAsync({promptMessage:"Create an encrypted copy of your own identity; save the copy and password outside the device",cancelLabel:"Cancel",disableDeviceFallback:true,biometricsSecurityLevel:'strong'});
      current(); if (!approval.success) throw Error('MOBILE_AUTHENTICATION_CANCELLED');
      const originalPublic = await SecureStore.getItemAsync(PUBLIC_KEY, publicOptions); current();
      if (originalPublic !== expectedPublicKey) throw Error('MOBILE_CUSTODY_BACKUP_BINDING');
      retained = await SecureStore.getItemAsync(PRIVATE_KEY, privateOptions); current();
      if (retained === null) throw Error('MOBILE_KEY_RECOVERY_REQUIRED');
      privateKey = privateKeyFromHex(retained);
      if (devicePublicKey(privateKey) !== expectedPublicKey) throw Error('MOBILE_CUSTODY_BACKUP_BINDING');
      clear = new TextEncoder().encode(JSON.stringify({profile:'DEVICE_IDENTITY_PRIVATE_SNAPSHOT_V1',devicePublicKey:expectedPublicKey,privateKeyHex:bytesToHex(privateKey)}));
      const sealed = await sealDeviceCustodyBackupV1(clear,passphrase,{profile:'DEVICE_IDENTITY_CUSTODY_V1',devicePublicKey:expectedPublicKey,routeSHA256:null},signal); current();
      if (await SecureStore.getItemAsync(PRIVATE_KEY,privateOptions) !== retained) throw Error('MOBILE_CUSTODY_BACKUP_STORAGE_CHANGED'); current();
      if (await SecureStore.getItemAsync(PUBLIC_KEY,publicOptions) !== originalPublic) throw Error('MOBILE_CUSTODY_BACKUP_STORAGE_CHANGED'); current();
      return sealed;
    } finally {clear?.fill(0);privateKey?.fill(0);retained=null;passphrase='';}
  });
}
function identityBackupCurrent(signal?: AbortSignal) { if (signal?.aborted) throw Error('MOBILE_CUSTODY_BACKUP_CANCELLED'); }
function identityBackupPublicKey(value: string) { if (typeof value !== 'string' || /^04[0-9a-f]{128}$/.exec(value)?.[0] !== value) throw Error('MOBILE_CUSTODY_BACKUP_BINDING'); }
function identityBackupSnapshot(clear: Uint8Array, expectedPublicKey: string): Uint8Array {
  if (clear.length > 1024) throw Error('MOBILE_CUSTODY_BACKUP_INVALID');
  let text = new TextDecoder('utf-8',{fatal:true}).decode(clear), value: any;
  try {value=JSON.parse(text);} finally {text='';}
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).sort().join(',') !== 'devicePublicKey,privateKeyHex,profile'
    || value.profile !== 'DEVICE_IDENTITY_PRIVATE_SNAPSHOT_V1' || value.devicePublicKey !== expectedPublicKey || typeof value.privateKeyHex !== 'string') throw Error('MOBILE_CUSTODY_BACKUP_INVALID');
  let privateKey: Uint8Array | undefined;
  try {privateKey=privateKeyFromHex(value.privateKeyHex); if(devicePublicKey(privateKey)!==expectedPublicKey) throw Error('MOBILE_CUSTODY_BACKUP_BINDING'); return privateKey;}
  catch(error){privateKey?.fill(0);throw error;} finally {value.privateKeyHex=null;}
}
/** Restores only the same authenticated identity. Existing different identities
 * are never overwritten; a partial write can only be retried with the same key.
 * No pairing, note, SDK permission or economic state is created here. */
export async function importDeviceIdentityBackupV1(sealedJSON: string, passphrase: string, expectedPublicKey: string, signal?: AbortSignal,recoveryAuthorization?:object): Promise<{devicePublicKey:string;restored:true}> {
  if (arguments.length !== 3 && arguments.length !== 4 && arguments.length !== 5) throw Error('MOBILE_CUSTODY_BACKUP_INVALID');
  identityBackupPublicKey(expectedPublicKey);
  if (typeof sealedJSON !== 'string' || sealedJSON.length > DEVICE_CUSTODY_BACKUP_MAX_SERIALIZED_BYTES_V1) throw Error('MOBILE_CUSTODY_BACKUP_INVALID');
  let recoveryCheck:(()=>void)|undefined;const current=()=>{identityBackupCurrent(signal);recoveryCheck?.();};
  return identityCustodyWork(async () => {
    const session=WalletSession.walletSessionStatusV1();
    if(session.managed&&!session.active){if(!recoveryAuthorization||!(signal instanceof AbortSignal))throw Error('MOBILE_WALLET_SESSION_LOCKED');recoveryCheck=WalletSession.consumeWalletSessionJointIdentityRecoveryV1(recoveryAuthorization,sealedJSON,expectedPublicKey,signal);}
    if(session.managed&&session.active){
      if(session.publicKey!==expectedPublicKey)throw Error('MOBILE_CUSTODY_BACKUP_CONFLICT');
      return WalletSession.verifyWalletSessionIdentityBackupV1(sealedJSON,passphrase,expectedPublicKey,signal);
    }
    let clear:Uint8Array|undefined,privateKey:Uint8Array|undefined,existingKey:Uint8Array|undefined;
    let beforePrivate:string|null=null,imported:string|null=null;
    try {
      current();await assertProtectedStorage();current();
      if(!recoveryCheck){const approval=await LocalAuthentication.authenticateAsync({promptMessage:"Restore the same identity from your encrypted copy; do not replace another existing identity",cancelLabel:"Cancel",disableDeviceFallback:true,biometricsSecurityLevel:'strong'});current();if(!approval.success)throw Error('MOBILE_AUTHENTICATION_CANCELLED');}
      const beforePublic=await SecureStore.getItemAsync(PUBLIC_KEY,publicOptions);current();
      if(beforePublic!==null&&beforePublic!==expectedPublicKey)throw Error('MOBILE_CUSTODY_BACKUP_CONFLICT');
      beforePrivate=await SecureStore.getItemAsync(PRIVATE_KEY,privateOptions);current();
      if(beforePrivate!==null){existingKey=privateKeyFromHex(beforePrivate);if(devicePublicKey(existingKey)!==expectedPublicKey)throw Error('MOBILE_CUSTODY_BACKUP_CONFLICT');}
      clear=await unsealDeviceCustodyBackupV1(sealedJSON,passphrase,{profile:'DEVICE_IDENTITY_CUSTODY_V1',devicePublicKey:expectedPublicKey,routeSHA256:null},signal);current();
      privateKey=identityBackupSnapshot(clear,expectedPublicKey);imported=bytesToHex(privateKey);
      if(beforePrivate!==null&&beforePrivate!==imported)throw Error('MOBILE_CUSTODY_BACKUP_CONFLICT');
      if(await SecureStore.getItemAsync(PRIVATE_KEY,privateOptions)!==beforePrivate)throw Error('MOBILE_CUSTODY_BACKUP_STORAGE_CHANGED');current();
      if(await SecureStore.getItemAsync(PUBLIC_KEY,publicOptions)!==beforePublic)throw Error('MOBILE_CUSTODY_BACKUP_STORAGE_CHANGED');current();
      if(beforePrivate===null){await SecureStore.setItemAsync(PRIVATE_KEY,imported,privateOptions);current();}
      if(await SecureStore.getItemAsync(PRIVATE_KEY,privateOptions)!==imported)throw Error('MOBILE_CUSTODY_BACKUP_WRITE_UNCERTAIN');current();
      if(await SecureStore.getItemAsync(PUBLIC_KEY,publicOptions)!==beforePublic)throw Error('MOBILE_CUSTODY_BACKUP_STORAGE_CHANGED');current();
      if(beforePublic===null){await SecureStore.setItemAsync(PUBLIC_KEY,expectedPublicKey,publicOptions);current();}
      if(await SecureStore.getItemAsync(PUBLIC_KEY,publicOptions)!==expectedPublicKey||await SecureStore.getItemAsync(PRIVATE_KEY,privateOptions)!==imported)throw Error('MOBILE_CUSTODY_BACKUP_WRITE_UNCERTAIN');current();
      return {devicePublicKey:expectedPublicKey,restored:true as const};
    } finally {clear?.fill(0);privateKey?.fill(0);existingKey?.fill(0);beforePrivate=null;imported=null;sealedJSON='';passphrase='';}
  });
}

/** Separate manual Blue redemption after the SAME original SHARE withdrawal. */
export async function signDeviceMorphoBlueRedemptionPermissionV1(raw:unknown,expectedOrigin:string,expectedPairingId:string,signal?:AbortSignal,authorization?:object):Promise<string>{
 if(WalletSession.walletSessionStatusV1().managed)return WalletSession.signWalletSessionExternalV1('BLUE',raw,expectedOrigin,expectedPairingId,signal,authorization);
 const value=blueRedemption.validateDeviceMorphoBlueRedemptionFreshV1(raw);await assertProtectedStorage();const publicKey=await readDevicePublicKey();if(publicKey===null)throw Error('MOBILE_KEY_REQUIRED');
 const check=()=>{if(signal?.aborted)throw Error('MOBILE_EXTERNAL_FLAT_CANCELLED');const v=blueRedemption.validateDeviceMorphoBlueRedemptionFreshV1(value),d=v.descriptor;if(d.origin!==expectedOrigin||d.pairingId!==expectedPairingId||d.devicePublicKey!==publicKey)throw Error('MOBILE_EXTERNAL_FLAT_BINDING');return v;};
 const reviewed=check(),prompt=reviewed.action==='ACCESS_BLUE'?"Check the original Blue redemption":`${reviewed.action}: ${reviewed.shares} shares, minimum ${reviewed.minimumAssets} underlying units to ${reviewed.recipient}`;
 const approved=await LocalAuthentication.authenticateAsync({promptMessage:prompt,cancelLabel:"Cancel",disableDeviceFallback:true,biometricsSecurityLevel:'strong'});check();if(!approved.success)throw Error('MOBILE_AUTHENTICATION_CANCELLED');let retained:string|null=await SecureStore.getItemAsync(PRIVATE_KEY,privateOptions);if(retained===null)throw Error('MOBILE_KEY_RECOVERY_REQUIRED');const key=privateKeyFromHex(retained);let frame:Uint8Array|undefined;
 try{if(devicePublicKey(key)!==publicKey||await readDevicePublicKey()!==publicKey)throw Error('MOBILE_KEY_BINDING_CHANGED');frame=blueRedemption.deviceMorphoBlueRedemptionPermissionMessageV1(check());return signDeviceMessage(key,frame);}finally{frame?.fill(0);key.fill(0);retained=null;}
}

/** Separate manual Aave redemption after the SAME original SHARE withdrawal. */
export async function signDeviceAaveStaticRedemptionPermissionV1(raw:unknown,expectedOrigin:string,expectedPairingId:string,signal?:AbortSignal,authorization?:object):Promise<string>{
 if(WalletSession.walletSessionStatusV1().managed)return WalletSession.signWalletSessionExternalV1('AAVE',raw,expectedOrigin,expectedPairingId,signal,authorization);
 const value=blueRedemption.validateDeviceAaveStaticRedemptionFreshV1(raw);await assertProtectedStorage();const publicKey=await readDevicePublicKey();if(publicKey===null)throw Error('MOBILE_KEY_REQUIRED');
 const check=()=>{if(signal?.aborted)throw Error('MOBILE_EXTERNAL_FLAT_CANCELLED');const v=blueRedemption.validateDeviceAaveStaticRedemptionFreshV1(value),d=v.descriptor;if(d.origin!==expectedOrigin||d.pairingId!==expectedPairingId||d.devicePublicKey!==publicKey)throw Error('MOBILE_EXTERNAL_FLAT_BINDING');return v;};
 const reviewed=check(),prompt=reviewed.action==='ACCESS_AAVE'?"Consult the original Aave redemption":`${reviewed.action}: ${reviewed.shares} shares, minimum ${reviewed.minimumAssets} underlying units to ${reviewed.recipient}`;
 const approved=await LocalAuthentication.authenticateAsync({promptMessage:prompt,cancelLabel:"Cancel",disableDeviceFallback:true,biometricsSecurityLevel:'strong'});check();if(!approved.success)throw Error('MOBILE_AUTHENTICATION_CANCELLED');let retained:string|null=await SecureStore.getItemAsync(PRIVATE_KEY,privateOptions);if(retained===null)throw Error('MOBILE_KEY_RECOVERY_REQUIRED');const key=privateKeyFromHex(retained);let frame:Uint8Array|undefined;
 try{if(devicePublicKey(key)!==publicKey||await readDevicePublicKey()!==publicKey)throw Error('MOBILE_KEY_BINDING_CHANGED');frame=blueRedemption.deviceAaveStaticRedemptionPermissionMessageV1(check());return signDeviceMessage(key,frame);}finally{frame?.fill(0);key.fill(0);retained=null;}
}

/** SAME native-claim journal only. Pairing never imports the backend's native key. */
export async function signNativeClaimDevicePermissionV1(raw:unknown,expectedOrigin:string,expectedPairingId:string,signal?:AbortSignal):Promise<string>{
 const protocol=await import('../../../../packages/mobile-protocol/src/native-claim-device-v1.mjs');
 const value=protocol.validateNativeClaimDevicePermissionFreshV1(raw);
 const current=()=>{if(signal?.aborted)throw Error('MOBILE_NATIVE_CLAIM_CANCELLED');const v=protocol.validateNativeClaimDevicePermissionFreshV1(value);
 if(v.descriptor.origin!==expectedOrigin||v.descriptor.pairingId!==expectedPairingId)throw Error('MOBILE_NATIVE_CLAIM_BINDING');return v;};
 current();await assertProtectedStorage();const publicKey=await readDevicePublicKey();current();
 if(publicKey===null||publicKey!==value.descriptor.devicePublicKey)throw Error('MOBILE_KEY_BINDING_CHANGED');
 const approved=await LocalAuthentication.authenticateAsync({promptMessage:value.action==='REDEEM_NATIVE_CLAIM'
  ?"Burn this amount of claims and deliver only once to the original native recipient; operator custody"
  :value.action==='READ_CLAIM_JOURNAL'
  ?"Read the journal of claims guarded by this operator; do not spend funds"
  :"Conciliate this original claim request; do not sign, test or forward funds",
  cancelLabel:"Cancel",disableDeviceFallback:true,biometricsSecurityLevel:'strong'});
 current();if(!approved.success)throw Error('MOBILE_AUTHENTICATION_CANCELLED');
 let retained:string|null=null,key:Uint8Array|undefined,frame:Uint8Array|undefined;
 try{retained=await SecureStore.getItemAsync(PRIVATE_KEY,privateOptions);current();
  if(retained===null)throw Error('MOBILE_KEY_RECOVERY_REQUIRED');key=privateKeyFromHex(retained);
  if(devicePublicKey(key)!==publicKey||await readDevicePublicKey()!==publicKey)throw Error('MOBILE_KEY_BINDING_CHANGED');
  frame=protocol.nativeClaimDevicePermissionMessageV1(current());return signDeviceMessage(key,frame);
 }finally{frame?.fill(0);key?.fill(0);retained=null;}
}


/** Explicit device-root claim permission; pairing never imports the note root. */
export async function signDeviceRootNativeClaimPermissionV2(raw:unknown,expectedOrigin:string,expectedPairingId:string,signal?:AbortSignal):Promise<string>{
 const protocol=await import('../../../../packages/mobile-protocol/src/native-claim-device-v1.mjs'),signing=await import('./signing.mjs');const value=protocol.validateDeviceRootClaimPermissionFreshV2(raw);
 const current=()=>{if(signal?.aborted)throw Error('MOBILE_NATIVE_CLAIM_CANCELLED');const c=protocol.validateDeviceRootClaimPermissionFreshV2(value);if(c.descriptor.claim.origin!==expectedOrigin||c.descriptor.claim.pairingId!==expectedPairingId)throw Error('MOBILE_KEY_BINDING_CHANGED');return c;};current();await assertProtectedStorage();const publicKey=await readDevicePublicKey();current();if(publicKey===null||publicKey!==value.descriptor.claim.devicePublicKey)throw Error('MOBILE_KEY_BINDING_CHANGED');
 const approved=await LocalAuthentication.authenticateAsync({promptMessage:"Authorize "+value.action+" for this note of "+value.descriptor.claim.claimSymbol+"; the native asset remains in custody of the local quorum",cancelLabel:"Cancel",disableDeviceFallback:true,biometricsSecurityLevel:'strong'});current();if(!approved.success)throw Error('MOBILE_AUTHENTICATION_CANCELLED');let retained:string|null=null,key:Uint8Array|undefined;
 try{retained=await SecureStore.getItemAsync(PRIVATE_KEY,privateOptions);current();if(retained===null)throw Error('MOBILE_KEY_RECOVERY_REQUIRED');key=privateKeyFromHex(retained);if(devicePublicKey(key)!==publicKey||await readDevicePublicKey()!==publicKey)throw Error('MOBILE_KEY_BINDING_CHANGED');const signature=signing.signDeviceRootNativeClaimPermissionV2(key,current());current();return signature;}finally{key?.fill(0);retained=null;}
}

/** Separate original RootNote W39/native-exit PoP; no native key is imported. */
export async function signDeviceRootNativeClaimExitPermissionV3(raw:unknown,expectedOrigin:string,expectedPairingId:string,signal?:AbortSignal):Promise<string>{
 const protocol=await import('../../../../packages/mobile-protocol/src/native-claim-device-v1.mjs'),signing=await import('./signing.mjs');const value=protocol.validateDeviceRootClaimExitPermissionFreshV3(raw);
 const current=()=>{if(signal?.aborted)throw Error('MOBILE_NATIVE_CLAIM_CANCELLED');const c=protocol.validateDeviceRootClaimExitPermissionFreshV3(value);if(c.descriptor.claim.origin!==expectedOrigin||c.descriptor.claim.pairingId!==expectedPairingId)throw Error('MOBILE_KEY_BINDING_CHANGED');return c;};current();await assertProtectedStorage();const publicKey=await readDevicePublicKey();current();if(publicKey===null||publicKey!==value.descriptor.claim.devicePublicKey)throw Error('MOBILE_KEY_BINDING_CHANGED');
 const approved=await LocalAuthentication.authenticateAsync({promptMessage:"Authorize "+value.action+" for this note of "+value.descriptor.claim.claimSymbol+"; the native asset remains in custody of the local quorum",cancelLabel:"Cancel",disableDeviceFallback:true,biometricsSecurityLevel:'strong'});current();if(!approved.success)throw Error('MOBILE_AUTHENTICATION_CANCELLED');let retained:string|null=null,key:Uint8Array|undefined;
 try{retained=await SecureStore.getItemAsync(PRIVATE_KEY,privateOptions);current();if(retained===null)throw Error('MOBILE_KEY_RECOVERY_REQUIRED');key=privateKeyFromHex(retained);if(devicePublicKey(key)!==publicKey||await readDevicePublicKey()!==publicKey)throw Error('MOBILE_KEY_BINDING_CHANGED');const signature=signing.signDeviceRootNativeClaimExitPermissionV3(key,current());current();return signature;}finally{key?.fill(0);retained=null;}
}

/** Prospectively paired Paged device domain, independent of RootNote/Claims. */
export async function signDevicePagedOwnerPermissionV3(raw:unknown,expectedOrigin:string,expectedPairingId:string,signal?:AbortSignal,authorization?:object):Promise<string>{
 if(WalletSession.walletSessionStatusV1().managed)return WalletSession.signWalletSessionPagedOwnerV1(raw,expectedOrigin,expectedPairingId,signal,authorization);
 const protocol=await import('../../../../packages/mobile-protocol/src/device-paged-owner-v3.mjs'),value=protocol.validateDevicePagedConsentFreshV3(raw);
 const current=()=>{if(signal?.aborted)throw Error('MOBILE_PAGED_CANCELLED');const c=protocol.validateDevicePagedConsentFreshV3(value);if(c.descriptor.origin!==expectedOrigin||c.descriptor.pairingId!==expectedPairingId)throw Error('MOBILE_PAGED_BINDING');return c;};current();await assertProtectedStorage();current();const publicKey=await readDevicePublicKey();current();if(publicKey===null||publicKey!==value.descriptor.devicePublicKey)throw Error('MOBILE_KEY_REQUIRED');
 const approved=await LocalAuthentication.authenticateAsync({promptMessage:`${value.action}: Paged note of this service`,cancelLabel:"Cancel",disableDeviceFallback:true,biometricsSecurityLevel:'strong'});current();if(!approved.success)throw Error('MOBILE_AUTHENTICATION_CANCELLED');let retained:string|null=null,key:Uint8Array|undefined;
 try{retained=await SecureStore.getItemAsync(PRIVATE_KEY,privateOptions);current();if(retained===null)throw Error('MOBILE_KEY_RECOVERY_REQUIRED');key=privateKeyFromHex(retained);if(devicePublicKey(key)!==publicKey||await readDevicePublicKey()!==publicKey)throw Error('MOBILE_KEY_BINDING_CHANGED');current();const {signDevicePagedConsentV3}=await import('./device-paged-permission-v3.mjs');current();return signDevicePagedConsentV3(key,current());}finally{key?.fill(0);retained=null;}
}

/** MetaMorpho permission remains separate from SHARE W39 and Graph. */
export async function signDeviceMetaMorphoRedemptionPermissionV2(raw:unknown,expectedOrigin:string,expectedPairingId:string,signal?:AbortSignal,authorization?:object):Promise<string>{
 if(WalletSession.walletSessionStatusV1().managed)return WalletSession.signWalletSessionExternalV1('META',raw,expectedOrigin,expectedPairingId,signal,authorization);
 const value=blueRedemption.validateDeviceMetaMorphoRedemptionFreshV2(raw);await assertProtectedStorage();const publicKey=await readDevicePublicKey();if(publicKey===null)throw Error('MOBILE_KEY_REQUIRED');
 const check=()=>{if(signal?.aborted)throw Error('MOBILE_EXTERNAL_FLAT_CANCELLED');const v=blueRedemption.validateDeviceMetaMorphoRedemptionFreshV2(value),d=v.descriptor;if(d.origin!==expectedOrigin||d.pairingId!==expectedPairingId||d.devicePublicKey!==publicKey)throw Error('MOBILE_EXTERNAL_FLAT_BINDING');return v;};
 const reviewed=check(),prompt=reviewed.action==='ACCESS_META'?"Consult the original MetaMorpho redemption":`${reviewed.action}: ${reviewed.shares} shares, minimum ${reviewed.minimumAssets} underlying units to ${reviewed.recipient}`;
 const approved=await LocalAuthentication.authenticateAsync({promptMessage:prompt,cancelLabel:"Cancel",disableDeviceFallback:true,biometricsSecurityLevel:'strong'});check();if(!approved.success)throw Error('MOBILE_AUTHENTICATION_CANCELLED');let retained:string|null=await SecureStore.getItemAsync(PRIVATE_KEY,privateOptions);if(retained===null)throw Error('MOBILE_KEY_RECOVERY_REQUIRED');const key=privateKeyFromHex(retained);let frame:Uint8Array|undefined;
 try{if(devicePublicKey(key)!==publicKey||await readDevicePublicKey()!==publicKey)throw Error('MOBILE_KEY_BINDING_CHANGED');frame=blueRedemption.deviceMetaMorphoRedemptionPermissionMessageV2(check());return signDeviceMessage(key,frame);}finally{frame?.fill(0);key.fill(0);retained=null;}
}

/** Prospectively paired Paged device domain, independent of RootNote/Claims. */
export async function signDevicePagedGraphPermissionV3(raw:unknown,expectedOrigin:string,expectedPairingId:string,signal?:AbortSignal,authorization?:{authorization:object;command:unknown}):Promise<string>{
 if(WalletSession.walletSessionStatusV1().managed)return WalletSession.signWalletSessionPagedGraphV1(raw,expectedOrigin,expectedPairingId,signal,authorization);
 const protocol=await import('../../../../packages/mobile-protocol/src/device-paged-graph-v3.mjs'),value=protocol.validateDevicePagedGraphConsentFreshV3(raw);
 const current=()=>{if(signal?.aborted)throw Error('MOBILE_PAGED_CANCELLED');const c=protocol.validateDevicePagedGraphConsentFreshV3(value);if(c.descriptor.origin!==expectedOrigin||c.descriptor.pairingId!==expectedPairingId)throw Error('MOBILE_PAGED_BINDING');return c;};current();await assertProtectedStorage();current();const publicKey=await readDevicePublicKey();current();if(publicKey===null||publicKey!==value.descriptor.devicePublicKey)throw Error('MOBILE_KEY_REQUIRED');
 const approved=await LocalAuthentication.authenticateAsync({promptMessage:`${value.action}: Paged graph of this service`,cancelLabel:"Cancel",disableDeviceFallback:true,biometricsSecurityLevel:'strong'});current();if(!approved.success)throw Error('MOBILE_AUTHENTICATION_CANCELLED');let retained:string|null=null,key:Uint8Array|undefined;
 try{retained=await SecureStore.getItemAsync(PRIVATE_KEY,privateOptions);current();if(retained===null)throw Error('MOBILE_KEY_RECOVERY_REQUIRED');key=privateKeyFromHex(retained);if(devicePublicKey(key)!==publicKey||await readDevicePublicKey()!==publicKey)throw Error('MOBILE_KEY_BINDING_CHANGED');current();const {signDevicePagedGraphConsentV3}=await import('./device-paged-permission-v3.mjs');current();return signDevicePagedGraphConsentV3(key,current());}finally{key?.fill(0);retained=null;}
}


/** One explicit economic review opens a finite foreground signing lease.
 * Fresh server PoP, statement bindings and the original graph are unchanged.
 * Withdrawals, deposits and other graphs require their own authorization. */
const pagedExecutionClosers=new WeakMap<object,()=>void>();
let activePagedExecution:object|null=null;
export async function openDevicePagedGraphExecutionSessionV3(rawReview:unknown,signal?:AbortSignal,refreshOriginalReview?:()=>Promise<unknown>):Promise<object>{
 if(WalletSession.walletSessionStatusV1().managed)return WalletSession.openWalletSessionPagedExecutionV1(rawReview,signal,refreshOriginalReview);
 // Refreshing original reads here requires the already-open managed identity;
 // the historical protected-key path keeps its existing two-argument contract.
 if(refreshOriginalReview!==undefined)throw Error('MOBILE_PAGED_EXECUTION_REVIEW');
 return identityCustodyWork(async()=>{
  const custody=await import('./device-paged-note-vault-v3.ts'),permission=await import('./device-paged-permission-v3.mjs');
  const review=custody.readDevicePagedExecutionReviewV3(rawReview),current=()=>{if(signal?.aborted||AppState.currentState==='background')throw Error('MOBILE_PAGED_CANCELLED');custody.assertDevicePagedExecutionReviewActiveV3(rawReview);};
  current();await assertProtectedStorage();const publicKey=await readDevicePublicKey();current();
  if(publicKey!==review.descriptor.devicePublicKey)throw Error('MOBILE_KEY_BINDING_CHANGED');
  const approval=await LocalAuthentication.authenticateAsync({promptMessage:`Authorize ${review.steps.length} payments and reserve ${review.budget} units of this note. Session up to 15 minutes with the app open.`,cancelLabel:"Cancel",disableDeviceFallback:true,biometricsSecurityLevel:'strong'});
  current();if(!approval.success)throw Error('MOBILE_AUTHENTICATION_CANCELLED');
  let retained:string|null=null,key:Uint8Array|undefined,session:object|undefined;
  try{
   retained=await SecureStore.getItemAsync(PRIVATE_KEY,{...privateOptions,authenticationPrompt:"Open key to execute only this authorized operation"});current();
   if(retained===null)throw Error('MOBILE_KEY_RECOVERY_REQUIRED');key=privateKeyFromHex(retained);
   if(devicePublicKey(key)!==publicKey||await readDevicePublicKey()!==publicKey)throw Error('MOBILE_KEY_BINDING_CHANGED');
   custody.readDevicePagedExecutionReviewV3(rawReview);current();
   if(activePagedExecution)closeDevicePagedGraphExecutionSessionV3(activePagedExecution);
   session=permission.createDevicePagedGraphExecutionSessionV3(key,{descriptor:review.descriptor,rootId:review.rootId,graphId:review.graphId,authorizationRoot:review.authorizationRoot,reserveNullifier:review.reserveNullifier,budget:review.budget,settleBefore:review.settleBefore,deadlineMs:Math.min(devicePagedNowV3()+15*60*1000,review.descriptor.deadlineMs)},()=>{current();if(AppState.currentState!=='active')throw Error('MOBILE_PAGED_CANCELLED');});
   const opened=session,onAbort=()=>closeDevicePagedGraphExecutionSessionV3(opened),subscription=AppState.addEventListener('change',state=>{if(state==='background')closeDevicePagedGraphExecutionSessionV3(opened);});
   const timer=setTimeout(onAbort,permission.readDevicePagedGraphExecutionSessionV3(opened).deadlineMs-devicePagedNowV3());
   signal?.addEventListener('abort',onAbort,{once:true});
   pagedExecutionClosers.set(opened,()=>{clearTimeout(timer);subscription.remove();signal?.removeEventListener('abort',onAbort);permission.closeDevicePagedGraphExecutionSessionV3(opened);if(activePagedExecution===opened)activePagedExecution=null;});
   activePagedExecution=opened;current();return opened;
  }catch(error){if(session){closeDevicePagedGraphExecutionSessionV3(session);permission.closeDevicePagedGraphExecutionSessionV3(session);}throw error;}
  finally{key?.fill(0);retained=null;}
 });
}
export function closeDevicePagedGraphExecutionSessionV3(session:object):void{WalletSession.closeWalletSessionPagedExecutionV1(session);pagedExecutionClosers.get(session)?.();pagedExecutionClosers.delete(session);}
/** Server continuation still needs this protected, explicit original review. */
export async function openDevicePagedGraphAutomationSessionV4(review:unknown,signal?:AbortSignal,refreshOriginalReview?:()=>Promise<unknown>):Promise<object>{
 if(!WalletSession.walletSessionStatusV1().managed)throw Error('MOBILE_WALLET_SESSION_LOCKED');return WalletSession.openWalletSessionPagedAutomationV4(review,signal,refreshOriginalReview);
}
export async function signDevicePagedGraphExecutionPermissionV3(session:object,rawConsent:unknown,signal?:AbortSignal,command?:unknown):Promise<string>{
 const permission=await import('./device-paged-permission-v3.mjs'),binding=permission.readDevicePagedGraphExecutionSessionV3(session);
 if(signal?.aborted||AppState.currentState!=='active')throw Error('MOBILE_PAGED_CANCELLED');
 await assertProtectedStorage();if(await readDevicePublicKey()!==binding.descriptor.devicePublicKey)throw Error('MOBILE_KEY_BINDING_CHANGED');
 if(signal?.aborted||AppState.currentState!=='active')throw Error('MOBILE_PAGED_CANCELLED');
 return permission.signDevicePagedGraphSessionConsentV3(session,rawConsent,command);
}

/** Original review includes the external reader before the single biometric. */
export async function openDevicePagedGraphAgentAutomationSessionV4(review:unknown,signal?:AbortSignal,refreshOriginalReview?:()=>Promise<unknown>):Promise<object>{if(!WalletSession.walletSessionStatusV1().managed)throw Error('MOBILE_WALLET_SESSION_LOCKED');return WalletSession.openWalletSessionPagedAgentAutomationV4(review,signal,refreshOriginalReview);}
export async function signDevicePagedAgentReadGrantV4(session:object,signal?:AbortSignal):Promise<import('@lianum/mobile-protocol/device/paged-agent-read-lifetime-v5').DevicePagedSignedAgentReadGrantAnyV5>{const permission=await import('./device-paged-permission-v3.mjs'),binding=permission.readDevicePagedGraphExecutionSessionV3(session);if(signal?.aborted||AppState.currentState!=='active')throw Error('MOBILE_PAGED_CANCELLED');await assertProtectedStorage();if(await readDevicePublicKey()!==binding.descriptor.devicePublicKey)throw Error('MOBILE_KEY_BINDING_CHANGED');if(signal?.aborted||AppState.currentState!=='active')throw Error('MOBILE_PAGED_CANCELLED');return permission.signDevicePagedGraphAgentReadGrantV4(session);}
