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
import { Platform } from 'react-native';
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
  authenticationPrompt: 'Confirma esta autorización de Lianum',
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
  await assertProtectedStorage();
  const approval = await LocalAuthentication.authenticateAsync({
    promptMessage: 'Crear o recuperar tu identidad local de Lianum',
    cancelLabel: 'Cancelar', disableDeviceFallback: true, biometricsSecurityLevel: 'strong',
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
    ...privateOptions, authenticationPrompt: 'Consultar el permiso original de Lianum',
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
      ? phase === 'access' ? 'Mostrar qué cuenta y pool podrán revelar su saldo privado'
        : 'Leer el saldo privado actual de esta cuenta y este pool; sin enviar fondos'
      : phase === 'access' ? 'Mostrar la revisión privada de tu cuenta original'
        : 'Consultar o reconciliar esta petición original',
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
      ? value.version===2?'Enviar cifrada la apertura de esta nota al destinatario D26 original; conserva la raíz y la clave en el teléfono'
        :'Revelar únicamente la apertura de esta nota al worker D26; conserva la raíz y la clave en el teléfono'
      : value.action === 'FUND_D26' ? 'Financiar una sola vez esta nota de ' + value.statement.amount + ' unidades'
        : 'Consultar el envío original de esta nota; no reenviar ni generar otra prueba' });
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
      ? value.version===2 ? 'Autorizar este grafo con sus aperturas cifradas para el destinatario original' : 'Revelar sólo las aperturas de este grafo al worker U; ninguna raíz ni clave privada'
      : value.action === 'RESERVE_S' ? 'Reservar una sola vez esta nota; cambio y recuperación ya están cifrados'
        : 'Consultar esta reserva original; no repetir la prueba ni el envío' });
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
      ? (value.version===2?'Cifrar esta única apertura W39 para el destinatario original; ninguna raíz o clave privada':'Revelar una única apertura de '+value.noteRole+' al worker W39; ninguna raíz o clave privada')
      : value.action === 'WITHDRAW_W39' ? 'Retirar una sola vez ' + value.statement.amount + ' unidades al destinatario ' + value.statement.recipient
        : 'Consultar esta salida original; no generar otra prueba ni reenviar' });
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
      ? 'Ejecutar una sola vez esta reserva original; entrega irreversible al riesgo aceptado por el proveedor'
      : value.action === 'RECOVER_NATIVE' ? 'Recuperar la reserva original al vencer el plazo; pérdida de entrega a cargo del proveedor'
        : 'Reconciliar esta ejecución original; no repetir la reserva ni una entrega' });
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
    ?'Activar recuperación automática de esta reserva al plazo original; el servicio debe seguir activo':'Desactivar recuperación automática antes de que comience'});
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
  const protocol = defiPositionReadProtocol;
  const value = read ? protocol.normalizeDeviceDefiPositionReadV1(raw) : protocol.normalizeDeviceDefiPositionAccessV1(raw);
  const descriptor = protocol.normalizeDeviceDefiPositionDescriptorV1({ origin: expectedOrigin, pairingId: expectedPairingId, devicePublicKey: value.devicePublicKey });
  const current = () => { if (signal?.aborted) throw Error('MOBILE_DEFI_POSITION_READ_REVOKED');
    protocol.validateDeviceDefiPositionFreshV1(value);
    if (Object.keys(descriptor).some(name => value[name as keyof typeof value] !== descriptor[name as keyof typeof descriptor])) throw Error('MOBILE_REVIEW_CHANGED'); };
  current(); await assertProtectedStorage(); const publicKey = await readDevicePublicKey(); current();
  if (publicKey === null || publicKey !== value.devicePublicKey) throw Error('MOBILE_KEY_BINDING_CHANGED');
  let retained: string | null = await SecureStore.getItemAsync(PRIVATE_KEY, { ...privateOptions,
    authenticationPrompt: read ? 'Leer estas posiciones DeFi custodiadas en el servicio; no retirar ni ejecutar'
      : 'Revisar las posiciones DeFi de este servicio original; no autorizar operaciones' });
  if (retained === null) throw Error('MOBILE_KEY_RECOVERY_REQUIRED');
  const key = privateKeyFromHex(retained); let frame: Uint8Array | null = null;
  try { if (devicePublicKey(key) !== publicKey || await readDevicePublicKey() !== publicKey) throw Error('MOBILE_KEY_BINDING_CHANGED');
    current(); frame = protocol.deviceDefiPositionPermissionMessageV1(value); return signDeviceMessage(key, frame);
  } finally { frame?.fill(0); key.fill(0); retained = null; }
}

/** Separate fixed external source-note domain, never NativeValue EXECUTE/F. */
export async function signDeviceExternalFlatPermissionV1(raw:unknown,expectedOrigin:string,expectedPairingId:string,signal?:AbortSignal):Promise<string>{
 const value=validateExternalFlatFreshV1(raw);
 await assertProtectedStorage();const publicKey=await readDevicePublicKey();
 if(publicKey===null)throw Error('MOBILE_KEY_REQUIRED');
 const check=()=>{if(signal?.aborted)throw Error('MOBILE_EXTERNAL_FLAT_CANCELLED');const v=validateExternalFlatFreshV1(value);const subject=v.action==='ACCESS'?v:v.descriptor;
 if(subject.origin!==expectedOrigin||subject.pairingId!==expectedPairingId||subject.devicePublicKey!==publicKey)throw Error('MOBILE_EXTERNAL_FLAT_BINDING');return v;};
 const consent=check();const approved=await LocalAuthentication.authenticateAsync({promptMessage:consent.action==='ACCESS'?'Autorizar lectura de la nota ERC20':`${consent.action}: ${consent.statement.amount} unidades a ${consent.recipient}`,cancelLabel:'Cancelar',disableDeviceFallback:true,biometricsSecurityLevel:'strong'});check();if(!approved.success)throw Error('MOBILE_AUTHENTICATION_CANCELLED');let retained:string|null=await SecureStore.getItemAsync(PRIVATE_KEY,privateOptions);
 if(retained===null)throw Error('MOBILE_KEY_RECOVERY_REQUIRED');const privateKey=privateKeyFromHex(retained);
 try{if(devicePublicKey(privateKey)!==publicKey||await readDevicePublicKey()!==publicKey)throw Error('MOBILE_KEY_BINDING_CHANGED');return signDeviceMessage(privateKey,externalFlatPermissionMessageV1(check()));}
 finally{privateKey.fill(0);retained=null;}
}

/** Fixed device SOURCE graph domain; opens only this device permission key. */
export async function signDeviceExternalFlatGraphPermissionV1(raw:unknown,expectedOrigin:string,expectedPairingId:string,signal?:AbortSignal):Promise<string>{
 const value=validateExternalFlatGraphFreshV1(raw);await assertProtectedStorage();const publicKey=await readDevicePublicKey();if(publicKey===null)throw Error('MOBILE_KEY_REQUIRED');
 const check=()=>{if(signal?.aborted)throw Error('MOBILE_EXTERNAL_FLAT_CANCELLED');const v=validateExternalFlatGraphFreshV1(value),subject=v.descriptor;if(subject.origin!==expectedOrigin||subject.pairingId!==expectedPairingId||subject.devicePublicKey!==publicKey)throw Error('MOBILE_EXTERNAL_FLAT_BINDING');return v;};
 const consent=check(),approved=await LocalAuthentication.authenticateAsync({promptMessage:`${consent.draft.action}: presupuesto ${consent.draft.statement.budget ?? 'del grafo'}; vencimiento ${consent.draft.statement.settleBefore}`,cancelLabel:'Cancelar',disableDeviceFallback:true,biometricsSecurityLevel:'strong'});check();if(!approved.success)throw Error('MOBILE_AUTHENTICATION_CANCELLED');let retained:string|null=await SecureStore.getItemAsync(PRIVATE_KEY,privateOptions);if(retained===null)throw Error('MOBILE_KEY_RECOVERY_REQUIRED');const privateKey=privateKeyFromHex(retained);let frame:Uint8Array|undefined;
 try{if(devicePublicKey(privateKey)!==publicKey||await readDevicePublicKey()!==publicKey)throw Error('MOBILE_KEY_BINDING_CHANGED');frame=externalFlatGraphPermissionMessageV1(check());return signDeviceMessage(privateKey,frame);}finally{frame?.fill(0);privateKey.fill(0);retained=null;}
}

/** Fixed GRAPH-output W39 role permission; the protected note root never leaves. */
export async function signDeviceExternalFlatGraphOutputPermissionV1(raw:unknown,expectedOrigin:string,expectedPairingId:string,signal?:AbortSignal):Promise<string>{
 const value=validateExternalFlatGraphOutputFreshV1(raw);await assertProtectedStorage();const publicKey=await readDevicePublicKey();if(publicKey===null)throw Error('MOBILE_KEY_REQUIRED');const check=()=>{if(signal?.aborted)throw Error('MOBILE_EXTERNAL_FLAT_CANCELLED');const v=validateExternalFlatGraphOutputFreshV1(value),subject=v.consent.descriptor;if(subject.origin!==expectedOrigin||subject.pairingId!==expectedPairingId||subject.devicePublicKey!==publicKey)throw Error('MOBILE_EXTERNAL_FLAT_BINDING');return v;};const reviewed=check(),c=reviewed.consent,approved=await LocalAuthentication.authenticateAsync({promptMessage:`${c.action}: salida ${reviewed.noteRole}, ${c.statement.amount} unidades a ${c.recipient}`,cancelLabel:'Cancelar',disableDeviceFallback:true,biometricsSecurityLevel:'strong'});check();if(!approved.success)throw Error('MOBILE_AUTHENTICATION_CANCELLED');let retained:string|null=await SecureStore.getItemAsync(PRIVATE_KEY,privateOptions);if(retained===null)throw Error('MOBILE_KEY_RECOVERY_REQUIRED');const privateKey=privateKeyFromHex(retained);let frame:Uint8Array|undefined;try{if(devicePublicKey(privateKey)!==publicKey||await readDevicePublicKey()!==publicKey)throw Error('MOBILE_KEY_BINDING_CHANGED');frame=externalFlatGraphOutputPermissionMessageV1(check());return signDeviceMessage(privateKey,frame);}finally{frame?.fill(0);privateKey.fill(0);retained=null;}
}

/** Explicit local identity backup. Returns ciphertext only, never a private key.
 * Pairing descriptors are not changed; notes need their own matching snapshots. */
export async function exportDeviceIdentityBackupV1(passphrase: string, expectedPublicKey: string, signal?: AbortSignal): Promise<string> {
  if (arguments.length !== 2 && arguments.length !== 3) throw Error('MOBILE_CUSTODY_BACKUP_INVALID');
  identityBackupPublicKey(expectedPublicKey); const current = () => identityBackupCurrent(signal);
  return identityCustodyWork(async () => {
    let retained: string | null = null, privateKey: Uint8Array | undefined, clear: Uint8Array | undefined;
    try {
      current(); await assertProtectedStorage(); current();
      const approval = await LocalAuthentication.authenticateAsync({promptMessage:'Crear una copia cifrada de tu misma identidad; guarda la copia y su contraseña fuera del dispositivo',cancelLabel:'Cancelar',disableDeviceFallback:true,biometricsSecurityLevel:'strong'});
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
export async function importDeviceIdentityBackupV1(sealedJSON: string, passphrase: string, expectedPublicKey: string, signal?: AbortSignal): Promise<{devicePublicKey:string;restored:true}> {
  if (arguments.length !== 3 && arguments.length !== 4) throw Error('MOBILE_CUSTODY_BACKUP_INVALID');
  identityBackupPublicKey(expectedPublicKey);
  if (typeof sealedJSON !== 'string' || sealedJSON.length > DEVICE_CUSTODY_BACKUP_MAX_SERIALIZED_BYTES_V1) throw Error('MOBILE_CUSTODY_BACKUP_INVALID');
  const current=()=>identityBackupCurrent(signal);
  return identityCustodyWork(async () => {
    let clear:Uint8Array|undefined,privateKey:Uint8Array|undefined,existingKey:Uint8Array|undefined;
    let beforePrivate:string|null=null,imported:string|null=null;
    try {
      current();await assertProtectedStorage();current();
      const approval=await LocalAuthentication.authenticateAsync({promptMessage:'Restaurar la misma identidad desde tu copia cifrada; no sustituir otra identidad existente',cancelLabel:'Cancelar',disableDeviceFallback:true,biometricsSecurityLevel:'strong'});
      current();if(!approval.success)throw Error('MOBILE_AUTHENTICATION_CANCELLED');
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
export async function signDeviceMorphoBlueRedemptionPermissionV1(raw:unknown,expectedOrigin:string,expectedPairingId:string,signal?:AbortSignal):Promise<string>{
 const value=blueRedemption.validateDeviceMorphoBlueRedemptionFreshV1(raw);await assertProtectedStorage();const publicKey=await readDevicePublicKey();if(publicKey===null)throw Error('MOBILE_KEY_REQUIRED');
 const check=()=>{if(signal?.aborted)throw Error('MOBILE_EXTERNAL_FLAT_CANCELLED');const v=blueRedemption.validateDeviceMorphoBlueRedemptionFreshV1(value),d=v.descriptor;if(d.origin!==expectedOrigin||d.pairingId!==expectedPairingId||d.devicePublicKey!==publicKey)throw Error('MOBILE_EXTERNAL_FLAT_BINDING');return v;};
 const reviewed=check(),prompt=reviewed.action==='ACCESS_BLUE'?'Consultar la redención Blue original':`${reviewed.action}: ${reviewed.shares} participaciones, mínimo ${reviewed.minimumAssets} unidades de underlying a ${reviewed.recipient}`;
 const approved=await LocalAuthentication.authenticateAsync({promptMessage:prompt,cancelLabel:'Cancelar',disableDeviceFallback:true,biometricsSecurityLevel:'strong'});check();if(!approved.success)throw Error('MOBILE_AUTHENTICATION_CANCELLED');let retained:string|null=await SecureStore.getItemAsync(PRIVATE_KEY,privateOptions);if(retained===null)throw Error('MOBILE_KEY_RECOVERY_REQUIRED');const key=privateKeyFromHex(retained);let frame:Uint8Array|undefined;
 try{if(devicePublicKey(key)!==publicKey||await readDevicePublicKey()!==publicKey)throw Error('MOBILE_KEY_BINDING_CHANGED');frame=blueRedemption.deviceMorphoBlueRedemptionPermissionMessageV1(check());return signDeviceMessage(key,frame);}finally{frame?.fill(0);key.fill(0);retained=null;}
}

/** Separate manual Aave redemption after the SAME original SHARE withdrawal. */
export async function signDeviceAaveStaticRedemptionPermissionV1(raw:unknown,expectedOrigin:string,expectedPairingId:string,signal?:AbortSignal):Promise<string>{
 const value=blueRedemption.validateDeviceAaveStaticRedemptionFreshV1(raw);await assertProtectedStorage();const publicKey=await readDevicePublicKey();if(publicKey===null)throw Error('MOBILE_KEY_REQUIRED');
 const check=()=>{if(signal?.aborted)throw Error('MOBILE_EXTERNAL_FLAT_CANCELLED');const v=blueRedemption.validateDeviceAaveStaticRedemptionFreshV1(value),d=v.descriptor;if(d.origin!==expectedOrigin||d.pairingId!==expectedPairingId||d.devicePublicKey!==publicKey)throw Error('MOBILE_EXTERNAL_FLAT_BINDING');return v;};
 const reviewed=check(),prompt=reviewed.action==='ACCESS_AAVE'?'Consultar la redención Aave original':`${reviewed.action}: ${reviewed.shares} participaciones, mínimo ${reviewed.minimumAssets} unidades de underlying a ${reviewed.recipient}`;
 const approved=await LocalAuthentication.authenticateAsync({promptMessage:prompt,cancelLabel:'Cancelar',disableDeviceFallback:true,biometricsSecurityLevel:'strong'});check();if(!approved.success)throw Error('MOBILE_AUTHENTICATION_CANCELLED');let retained:string|null=await SecureStore.getItemAsync(PRIVATE_KEY,privateOptions);if(retained===null)throw Error('MOBILE_KEY_RECOVERY_REQUIRED');const key=privateKeyFromHex(retained);let frame:Uint8Array|undefined;
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
  ?'Quemar este importe de claims y entregar una sola vez al destinatario nativo original; custodia del operador'
  :value.action==='READ_CLAIM_JOURNAL'
  ?'Leer el journal de claims custodiados por este operador; no gastar fondos'
  :'Conciliar esta solicitud original de claims; no firmar, probar ni reenviar fondos',
  cancelLabel:'Cancelar',disableDeviceFallback:true,biometricsSecurityLevel:'strong'});
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
 const approved=await LocalAuthentication.authenticateAsync({promptMessage:'Autorizar '+value.action+' para esta nota de '+value.descriptor.claim.claimSymbol+'; el activo nativo permanece en custodia del quórum local',cancelLabel:'Cancelar',disableDeviceFallback:true,biometricsSecurityLevel:'strong'});current();if(!approved.success)throw Error('MOBILE_AUTHENTICATION_CANCELLED');let retained:string|null=null,key:Uint8Array|undefined;
 try{retained=await SecureStore.getItemAsync(PRIVATE_KEY,privateOptions);current();if(retained===null)throw Error('MOBILE_KEY_RECOVERY_REQUIRED');key=privateKeyFromHex(retained);if(devicePublicKey(key)!==publicKey||await readDevicePublicKey()!==publicKey)throw Error('MOBILE_KEY_BINDING_CHANGED');const signature=signing.signDeviceRootNativeClaimPermissionV2(key,current());current();return signature;}finally{key?.fill(0);retained=null;}
}
