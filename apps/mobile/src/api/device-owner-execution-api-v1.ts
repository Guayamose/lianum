import {validateDeviceRecoveryArmConsentFreshV1,deviceRecoveryArmConsentMessageV1,normalizeDeviceRecoveryArmStatusV1,type DeviceRecoveryArmConsentV1} from '../../../../packages/mobile-protocol/src/device-recovery-arm-consent-v1.mjs';
import {originalAccountAccessMessageV2} from '@lianum/mobile-protocol/original-account-v2';
/** Fixed original native continuation. A response is original TLS provenance,
 * not independent chain verification or a substitute for backend WeakMaps. */
import * as Crypto from 'expo-crypto';
import { createOriginalAccountApiV2, type OriginalAccountDescriptorV2 } from './original-account-api-v2.mjs';
import { validateDeviceExecutionConsentFreshV1, normalizeDeviceExecutionStatusV1, deviceExecutionConsentMessageV1, deviceExecutionSnapshotBytesV1,
  type DeviceExecutionConsentV1, type DeviceExecutionStatusV1 } from '../../../../packages/mobile-protocol/src/device-execution-consent-v1.mjs';
const armReviews=new WeakMap<object,{live():void;value:DeviceRecoveryArmConsentV1;consumed:boolean}>();
const reviews = new WeakMap<object, { live(): void; value: DeviceExecutionConsentV1; consumed: boolean }>();
const terminals = new WeakMap<object, { live(): void; value: DeviceExecutionStatusV1; consent: DeviceExecutionConsentV1; expiresAt: number }>();
function bad(): never { throw Error('MOBILE_DEVICE_EXECUTION_RESPONSE_INVALID'); }
// Values have already passed the protocol's bounded exact-field normalizer.
// This is the original journal canonical JSON (sorted keys), without Node APIs.
function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  const row = value as Record<string, unknown>;
  return '{' + Object.keys(row).sort().map(key => JSON.stringify(key) + ':' + canonical(row[key])).join(',') + '}';
}
const same = (a: unknown, b: unknown) => canonical(a) === canonical(b);
async function sha(bytes: Uint8Array) {
  const owned = new Uint8Array(bytes.length); owned.set(bytes);
  try { return Array.from(new Uint8Array(await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, owned.buffer)), b => b.toString(16).padStart(2, '0')).join(''); }
  finally { owned.fill(0); }
}
export async function createDeviceOwnerExecutionApiV1(descriptor: OriginalAccountDescriptorV2) {
  if (descriptor.origin.length > 64) throw Error('MOBILE_LOCAL_ORIGIN_CAPACITY');
  const { fetch: nativeFetch } = await import('expo/fetch');
  const original = createOriginalAccountApiV2({ descriptor, fetchImpl: nativeFetch }); let closed = false;
  const live = () => { if (closed) throw Error('MOBILE_DEVICE_EXECUTION_CLIENT_CLOSED'); };
  return Object.freeze({ descriptor: original.descriptor,
    async access() { live(); const value = await original.challenge('read'); live(); return value; },
    async challenge(action: DeviceExecutionConsentV1['action'], input: Parameters<typeof original.deviceExecution.challenge>[1]) {
      live(); const value = validateDeviceExecutionConsentFreshV1(await original.deviceExecution.challenge(action, input)); live();
      reviews.set(value, { live, value, consumed: false }); return value;
    },
    async challengeRecoveryArm(action:DeviceRecoveryArmConsentV1['action'],input:Parameters<typeof original.deviceRecoveryArm.challenge>[1]){
      live();const value=validateDeviceRecoveryArmConsentFreshV1(await original.deviceRecoveryArm.challenge(action,input));live();
      armReviews.set(value,{live,value,consumed:false});return value;
    },
    async submitRecoveryArm(input:Parameters<typeof original.deviceRecoveryArm.submit>[0]){
      live();const held=armReviews.get(input.consent);if(!held||held.consumed)bad();
      held.live();const consent=validateDeviceRecoveryArmConsentFreshV1(held.value);if(!same(consent,input.consent))bad();held.consumed=true;
      const value=normalizeDeviceRecoveryArmStatusV1(await original.deviceRecoveryArm.submit(input));live();
      const frame=deviceRecoveryArmConsentMessageV1(consent);try{if(value.authorizationSHA256!==await sha(frame))bad();}finally{frame.fill(0);}
      if(value.jobId!==consent.execution.reservation.jobId||value.settleBefore!==consent.settleBefore
        ||value.state!==(consent.action==='ARM_RECOVERY'?'ARMED':'DISARMED'))bad();live();return value;
    },
    async observeRecoveryArm(input:Parameters<typeof original.deviceRecoveryArm.status>[0]){
      live();const value=normalizeDeviceRecoveryArmStatusV1(await original.deviceRecoveryArm.status(input));live();
      const frame=originalAccountAccessMessageV2(input.access);try{if(value.authorizationSHA256!==await sha(frame))bad();}finally{frame.fill(0);}
      live();return value;
    },
    async submit(input: Parameters<typeof original.deviceExecution.submit>[0]) {
      live(); const retained = reviews.get(input.consent); if (!retained || retained.consumed) bad();
      const consent = validateDeviceExecutionConsentFreshV1(retained.value);
      retained.live(); if (!same(consent, input.consent)) bad(); retained.consumed = true; // before any await; copies are not a review
      const value = normalizeDeviceExecutionStatusV1(await original.deviceExecution.submit(input)); live();
      const frame = deviceExecutionConsentMessageV1(consent), snapshot = deviceExecutionSnapshotBytesV1(value.executionSnapshot);
      try {
        if (value.authorizationSHA256 !== await sha(frame) || value.executionSnapshotSHA256 !== await sha(snapshot)) bad();
      } finally { frame.fill(0); snapshot.fill(0); }
      if (value.jobId !== consent.reservation.jobId || value.nativeBindingSHA256 !== consent.nativeBindingSHA256
        || value.lossClause !== consent.lossClause || value.reservation.stage !== 'RESERVED'
        || value.reservation.observation?.transactionHash !== consent.reservationTransactionHash) bad();
      for (const name of ['depositJobId', 'quoteId', 'jobId', 'custody', 'statement', 'witnessSHA256', 'proofSHA256', 'publicInputsSHA256'] as const)
        if (!same(value.reservation.consentFields[name], consent.reservation[name])) bad();
      if (!same(value.reservation.statement, consent.reservation.statement)) bad();
      validateDeviceExecutionConsentFreshV1(consent); live();
      if (value.stage === 'FULFILLED' || value.stage === 'RECOVERED') {
        if (!value.terminal || value.errorCode !== null || value.executionSnapshot.outcome !== value.outcome
          || value.terminal.outcome !== value.outcome || value.terminal.outcome !== value.stage
          || consent.action === 'RECOVER_NATIVE' && value.outcome !== 'RECOVERED') bad();
        terminals.set(value, { live, value, consent, expiresAt: Math.min(consent.reservation.expiresAt, Date.now() + 15_000) });
      }
      return value;
    },
    close() { closed = true; },
  });
}
export function readDeviceExecutionReviewV1(value: object) {
  const row = reviews.get(value); if (!row || row.consumed) bad(); row.live(); validateDeviceExecutionConsentFreshV1(row.value);
  return row.value;
}
export function readDeviceExecutionTerminalV1(response: object) {
  const row = terminals.get(response); if (!row) bad(); row.live(); if (Date.now() >= row.expiresAt) bad();
  return Object.freeze({ status: row.value, consent: row.consent, expiresAt: row.expiresAt, mobileCanonicalRpcVerification: false as const });
}
