/** Explicitly paired diagnostic transport. Descriptor selectors are checked on
 * every response; possession of those public fields never supplies authority.
 * No dispatch, proof, balance projection or automatic retry lives here. */
import { normalizeMobileOrigin } from '@lianum/mobile-protocol';
import { normalizeOriginalAccountAccessV2, normalizeOriginalAccountReviewV2,
  normalizeOriginalAccountBindingV2, normalizeOriginalAccountSignatureV2,
  validateOriginalAccountFreshV2 } from '@lianum/mobile-protocol/original-account-v2';
import { normalizePrivateStateAccessV1, normalizePrivateStateReviewV1,
  privateStateAccessFrameV1, privateStateReviewFrameV1, normalizePrivateStateObservationV1,
  validatePrivateStateFreshV1 } from '@lianum/mobile-protocol/original-account-v2';
import { normalizeDeviceDepositConsentEitherV2 as normalizeDeviceDepositConsentV1, validateDeviceDepositConsentEitherFreshV2 as validateDeviceDepositConsentFreshV1,
  normalizeDeviceDepositWitnessV1 } from '../../../../packages/mobile-protocol/src/device-native-private-deposit-v2.mjs';
import {sealOriginalNativeDeviceDepositWitnessV2} from './native-private-deposit-transit-v2.mjs';
import { normalizeDeviceReservationConsentV1, validateDeviceReservationConsentFreshV1,
  normalizeDeviceReservationWitnessV1, wipeDeviceReservationWitnessV1 }
  from '../../../../packages/mobile-protocol/src/device-reservation-consent-v1.mjs';
import {normalizeDeviceExitConsentEitherV2 as normalizeDeviceExitConsentV1,validateDeviceExitConsentEitherFreshV2 as validateDeviceExitConsentFreshV1,normalizeDeviceExitWitnessV1,wipeDeviceExitWitnessV1} from '../../../../packages/mobile-protocol/src/device-native-private-exit-v2.mjs';
import {sealOriginalNativeDeviceExitWitnessV2} from './native-private-exit-transit-v2.mjs';
import { validateDeviceExecutionConsentFreshV1 }
  from '../../../../packages/mobile-protocol/src/device-execution-consent-v1.mjs';
import {validateDeviceRecoveryArmConsentFreshV1,normalizeDeviceRecoveryArmStatusV1} from '../../../../packages/mobile-protocol/src/device-recovery-arm-consent-v1.mjs';
const MAX_RESPONSE = 16 * 1024;
const fail = code => { throw new Error(code); };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const privateStateObservations = new WeakMap();
/** Read handle issued only after the original SDK verified a signed review.
 * Copies and persisted frames cannot manufacture a new live observation. */
export function readOriginalPrivateStateObservationV1(value) {
  const entry = privateStateObservations.get(value);
  if (!entry || Date.now() >= entry.expiresAt) fail('MOBILE_PRIVATE_STATE_INVALID');
  return validatePrivateStateFreshV1(value);
}
export function originalPrivateStateObservationDescriptorV1(value) {
  readOriginalPrivateStateObservationV1(value);return privateStateObservations.get(value).descriptor;
}
function exact(value, names) {
  if (!value || Object.getPrototypeOf(value) !== Object.prototype) return false;
  const keys = Reflect.ownKeys(value);
  return keys.length === names.length && keys.every(key => names.includes(key))
    && names.every(name => Object.hasOwn(Object.getOwnPropertyDescriptor(value, name) ?? {}, 'value'));
}
export function normalizeOriginalAccountServiceV2(value) {
  if (!exact(value, ['version', 'profile', 'connection', 'privatePortfolio', 'economicObservation',
    'noteCustodyOnDevice', 'nativeEffectsEstablished', 'actions'])
    || value.version !== 2 || value.profile !== 'PAIRED_ORIGINAL_ACCOUNT_SERVICE_V2'
    || value.connection !== 'PAIRED' || value.privatePortfolio !== null || value.economicObservation !== null
    || value.noteCustodyOnDevice !== false || value.nativeEffectsEstablished !== false
    || !exact(value.actions, ['read', 'reconcile']) || value.actions.read !== true || value.actions.reconcile !== true) {
    fail('MOBILE_ORIGINAL_RESPONSE_INVALID');
  }
  return Object.freeze({ ...value, actions: Object.freeze({ ...value.actions }) });
}
export function createOriginalAccountApiV2({ descriptor, fetchImpl = globalThis.fetch } = {}) {
  if (!exact(descriptor, ['origin', 'pairingId', 'devicePublicKey']) || typeof fetchImpl !== 'function'
    || typeof descriptor.pairingId !== 'string' || !/^[0-9a-f]{64}$/.test(descriptor.pairingId)
    || typeof descriptor.devicePublicKey !== 'string' || !/^04[0-9a-f]{128}$/.test(descriptor.devicePublicKey)) {
    fail('MOBILE_ORIGINAL_DESCRIPTOR_INVALID');
  }
  const original = Object.freeze({ origin: normalizeMobileOrigin(descriptor.origin),
    pairingId: descriptor.pairingId, devicePublicKey: descriptor.devicePublicKey });
  function scope(value) {
    if (Object.keys(original).some(name => value[name] !== original[name])) fail('MOBILE_REVIEW_CHANGED');
    return validateOriginalAccountFreshV2(value);
  }
  const privateDepositConsents=new WeakMap(),privateExitConsents=new WeakMap();let privateExitClosed=false;
  async function request(path, payload, privateState = false) {
    const privateDepositProof=privateState==='device-deposit'&&path==='private-jobs'||privateState==='device-exit'&&path==='private-jobs';
    if(privateDepositProof&&new TextEncoder().encode(JSON.stringify(payload)).byteLength>(privateState==='device-exit'?32768:16384))fail('MOBILE_ORIGINAL_REQUEST_INVALID');
    const target = original.origin + (privateState === 'device-execution' ? '/v1/mobile/device-execution/'
      : privateState === 'device-exit' ? '/v1/mobile/device-exit/'
      : privateState === 'device-reservation' ? '/v1/mobile/device-reservation/'
      : privateState === 'device-deposit' ? '/v1/mobile/device-deposit/'
      : privateState ? '/v1/mobile/original-account/private-state/'
      : '/v2/mobile/original-account/') + path;
    const controller = new AbortController();
    let timeout, reader;
    try {
      const deadline = new Promise((_resolve, reject) => {
        timeout = setTimeout(() => { controller.abort(); reject(new Error('MOBILE_SERVICE_UNAVAILABLE')); }, privateDepositProof?900_000:15_000);
      });
      const work = (async () => {
        const response = await fetchImpl(target, { method: payload === undefined ? 'GET' : 'POST',
          headers: { Accept: 'application/json', Origin: original.origin,
            ...(payload === undefined ? {} : { 'Content-Type': 'application/json' }) },
          ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
          credentials: 'omit', cache: 'no-store', redirect: 'error', signal: controller.signal });
        if (controller.signal.aborted) fail('MOBILE_SERVICE_UNAVAILABLE');
        if (response.redirected || response.url && response.url !== target) fail('MOBILE_RESPONSE_ORIGIN');
        const type = response.headers.get('content-type') ?? '', length = response.headers.get('content-length');
        if (!/^application\/json(?:;\s*charset=utf-8)?$/i.test(type)
          || length !== null && (!/^(0|[1-9][0-9]*)$/.test(length) || Number(length) > MAX_RESPONSE)) {
          fail('MOBILE_ORIGINAL_RESPONSE_INVALID');
        }
        if (!response.ok) fail('MOBILE_SERVICE_UNAVAILABLE');
        if (!response.body || typeof response.body.getReader !== 'function') fail('MOBILE_ORIGINAL_STREAM_REQUIRED');
        reader = response.body.getReader();
        const data = new Uint8Array(MAX_RESPONSE); let size = 0;
        while (true) {
          const chunk = await reader.read();
          if (controller.signal.aborted) fail('MOBILE_SERVICE_UNAVAILABLE');
          if (chunk.done) break;
          if (!(chunk.value instanceof Uint8Array) || size + chunk.value.byteLength > MAX_RESPONSE) {
            fail('MOBILE_ORIGINAL_RESPONSE_INVALID');
          }
          data.set(chunk.value, size); size += chunk.value.byteLength;
        }
        return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(data.subarray(0, size)));
      })();
      return await Promise.race([work, deadline]);
    } finally {
      clearTimeout(timeout); controller.abort();
      // Stops only this client's response stream, never the original keeper
      // action. Do not await an untrusted stream's cancellation implementation.
      if (reader) { void reader.cancel().catch(() => {}); reader.releaseLock(); }
    }
  }
  const privateState = Object.freeze({
    descriptor: original,
    async challenge() {
      const raw = await request('challenges', {}, true);
      if (!exact(raw, ['challenge'])) fail('MOBILE_ORIGINAL_RESPONSE_INVALID');
      return scope(normalizePrivateStateAccessV1(raw.challenge).challenge);
    },
    async openReview(raw) {
      if (!exact(raw, ['challenge', 'signature'])) fail('MOBILE_ORIGINAL_REQUEST_INVALID');
      const challenge = scope(normalizeOriginalAccountAccessV2(raw.challenge));
      const signature = normalizeOriginalAccountSignatureV2(raw.signature);
      const value = await request('reviews', { challenge: privateStateAccessFrameV1(challenge), signature }, true);
      if (!exact(value, ['review'])) fail('MOBILE_ORIGINAL_RESPONSE_INVALID');
      const review = scope(normalizePrivateStateReviewV1(value.review).review);
      if (review.bootstrapChallengeId !== challenge.challengeId) fail('MOBILE_REVIEW_CHANGED');
      return review;
    },
    async submit(raw) {
      if (!exact(raw, ['review', 'signature'])) fail('MOBILE_ORIGINAL_REQUEST_INVALID');
      const review = scope(normalizeOriginalAccountReviewV2(raw.review));
      const signature = normalizeOriginalAccountSignatureV2(raw.signature);
      const value = await request('observations', { review: privateStateReviewFrameV1(review), signature }, true);
      const observed = validatePrivateStateFreshV1(normalizePrivateStateObservationV1(value));
      if (!same(observed.binding, review.binding)) fail('MOBILE_REVIEW_CHANGED');
      scope(review);
      privateStateObservations.set(observed, {descriptor:original,expiresAt:Math.min(review.expiresAt,
        observed.observed === null ? review.expiresAt : observed.observed.observedAt + 15000)});
      return observed;
    },
  });
  return Object.freeze({
    descriptor: original,
    privateState,
    deviceRecoveryArm: Object.freeze({
      async challenge(action,input){
        if(!['ARM_RECOVERY','DISARM_RECOVERY'].includes(action)||!exact(input,['access','signature','jobId']))fail('MOBILE_ORIGINAL_REQUEST_INVALID');
        const access=scope(normalizeOriginalAccountAccessV2(input.access));if(access.action!=='read')fail('MOBILE_ORIGINAL_ACTION');normalizeOriginalAccountSignatureV2(input.signature);
        const value=validateDeviceRecoveryArmConsentFreshV1(await request(action==='ARM_RECOVERY'?'arm-reviews':'disarm-reviews',input,'device-execution'));
        if(value.action!==action||value.execution.reservation.jobId!==input.jobId||Object.keys(original).some(name=>value.execution.reservation[name]!==original[name]))fail('MOBILE_REVIEW_CHANGED');return value;
      },
      async submit(input){if(!exact(input,['consent','signature']))fail('MOBILE_ORIGINAL_REQUEST_INVALID');const consent=validateDeviceRecoveryArmConsentFreshV1(input.consent);
        if(Object.keys(original).some(name=>consent.execution.reservation[name]!==original[name]))fail('MOBILE_REVIEW_CHANGED');const signature=normalizeOriginalAccountSignatureV2(input.signature);
        return normalizeDeviceRecoveryArmStatusV1(await request(consent.action==='ARM_RECOVERY'?'arm':'disarm',{consent,signature},'device-execution'));
      },
      async status(input){if(!exact(input,['access','signature','jobId']))fail('MOBILE_ORIGINAL_REQUEST_INVALID');
        const access=scope(normalizeOriginalAccountAccessV2(input.access));if(access.action!=='read')fail('MOBILE_ORIGINAL_ACTION');normalizeOriginalAccountSignatureV2(input.signature);
        const value=normalizeDeviceRecoveryArmStatusV1(await request('arm-status',input,'device-execution'));if(value.jobId!==input.jobId)fail('MOBILE_REVIEW_CHANGED');return value;
      },
    }),
    deviceExecution: Object.freeze({
      async outputBalances(input) {
        if (!exact(input, ['access', 'signature', 'parentJobId', 'rootId', 'noteRevision', 'changeNullifier', 'recoveryNullifier'])) fail('MOBILE_ORIGINAL_REQUEST_INVALID');
        const access = scope(normalizeOriginalAccountAccessV2(input.access));
        if (access.action !== 'read') fail('MOBILE_ORIGINAL_ACTION'); normalizeOriginalAccountSignatureV2(input.signature);
        return await request('output-balances', input, 'device-execution');
      },
      async challenge(action, input) {
        if (!['EXECUTE_NATIVE', 'RECONCILE_NATIVE', 'RECOVER_NATIVE'].includes(action)
          || !exact(input, ['access', 'signature', 'jobId'])) fail('MOBILE_ORIGINAL_REQUEST_INVALID');
        const access = scope(normalizeOriginalAccountAccessV2(input.access));
        if (access.action !== 'read') fail('MOBILE_ORIGINAL_ACTION'); normalizeOriginalAccountSignatureV2(input.signature);
        const path = action === 'EXECUTE_NATIVE' ? 'execution-reviews' : action === 'RECONCILE_NATIVE' ? 'reconciliation-reviews' : 'recovery-reviews';
        const value = validateDeviceExecutionConsentFreshV1(await request(path, input, 'device-execution'));
        if (value.action !== action || value.reservation.jobId !== input.jobId
          || Object.keys(original).some(name => value.reservation[name] !== original[name])) fail('MOBILE_REVIEW_CHANGED');
        return value;
      },
      async submit(input) {
        if (!exact(input, ['consent', 'signature'])) fail('MOBILE_ORIGINAL_REQUEST_INVALID');
        const consent = validateDeviceExecutionConsentFreshV1(input.consent);
        if (Object.keys(original).some(name => consent.reservation[name] !== original[name])) fail('MOBILE_REVIEW_CHANGED');
        const signature = normalizeOriginalAccountSignatureV2(input.signature);
        // One request. Lost response keeps the original reservation/job; the
        // caller may explicitly reconcile it, never replay execution/recovery.
        return await request(consent.action === 'EXECUTE_NATIVE' ? 'execute' : consent.action === 'RECONCILE_NATIVE' ? 'reconcile' : 'recover',
          { consent, signature }, 'device-execution');
      },
    }),
    deviceExit: Object.freeze({
      async preparation(input) {
        if (!exact(input, ['access', 'signature', 'parentJobId', 'noteRole', 'rootId', 'noteRevision', 'nullifier', 'recipient'])) fail('MOBILE_ORIGINAL_REQUEST_INVALID');
        const access = scope(normalizeOriginalAccountAccessV2(input.access));
        if (access.action !== 'read') fail('MOBILE_ORIGINAL_ACTION'); normalizeOriginalAccountSignatureV2(input.signature);
        return await request('preparation-reviews', input, 'device-exit');
      },
      async challengeJob(input) {
        if (!exact(input, ['access', 'signature', 'quoteId', 'jobId', 'witnessSHA256'])) fail('MOBILE_ORIGINAL_REQUEST_INVALID');
        const access = scope(normalizeOriginalAccountAccessV2(input.access));
        if (access.action !== 'read') fail('MOBILE_ORIGINAL_ACTION'); normalizeOriginalAccountSignatureV2(input.signature);
        const value = validateDeviceExitConsentFreshV1(await request('job-reviews', input, 'device-exit'));
        if (value.action !== 'PROVE_W39' || Object.keys(original).some(name => value[name] !== original[name])
          || value.quoteId !== input.quoteId || value.witnessSHA256 !== input.witnessSHA256
          || input.jobId !== null && value.jobId !== input.jobId) fail('MOBILE_REVIEW_CHANGED'); if(value.version===2){if(privateExitClosed)fail('MOBILE_PRIVATE_EXIT_CLIENT_CLOSED');privateExitConsents.set(value,{value,used:false});}return value;
      },
      async challenge(action, input) {
        if (!['WITHDRAW_W39', 'OBSERVE_W39'].includes(action) || !exact(input, ['access', 'signature', 'jobId'])) fail('MOBILE_ORIGINAL_REQUEST_INVALID');
        const access = scope(normalizeOriginalAccountAccessV2(input.access));
        if (access.action !== 'read') fail('MOBILE_ORIGINAL_ACTION'); normalizeOriginalAccountSignatureV2(input.signature);
        const value = validateDeviceExitConsentFreshV1(await request(action === 'WITHDRAW_W39'
          ? 'withdrawal-reviews' : 'observation-reviews', input, 'device-exit'));
        if (value.action !== action || value.jobId !== input.jobId || Object.keys(original).some(name => value[name] !== original[name])) fail('MOBILE_REVIEW_CHANGED');if(value.version===2){if(privateExitClosed)fail('MOBILE_PRIVATE_EXIT_CLIENT_CLOSED');privateExitConsents.set(value,{value,used:false});}return value;
      },
      async submit(input) {
        if (!exact(input, input?.consent?.action === 'PROVE_W39' ? ['consent', 'signature', 'witness'] : ['consent', 'signature'])) fail('MOBILE_ORIGINAL_REQUEST_INVALID');
        const consent = validateDeviceExitConsentFreshV1(normalizeDeviceExitConsentV1(input.consent));
        if (Object.keys(original).some(name => consent[name] !== original[name])) fail('MOBILE_REVIEW_CHANGED');
        const signature = normalizeOriginalAccountSignatureV2(input.signature);let witness,packet;
        if(consent.version===2){if(privateExitClosed)fail('MOBILE_PRIVATE_EXIT_CLIENT_CLOSED');const held=privateExitConsents.get(input.consent);if(!held||held.used||!same(held.value,consent))fail('MOBILE_REVIEW_CHANGED');held.used=true;}
        try {
          if (consent.action === 'PROVE_W39'){witness=normalizeDeviceExitWitnessV1(input.witness);if(consent.version===2)packet=await sealOriginalNativeDeviceExitWitnessV2(consent,signature,witness);if(consent.version===2&&privateExitClosed)fail('MOBILE_PRIVATE_EXIT_CLIENT_CLOSED');}
          return await request(consent.action === 'PROVE_W39' ? (consent.version===2?'private-jobs':'jobs') : consent.action === 'WITHDRAW_W39' ? 'withdraw' : 'observations',
            { consent, signature, ...(witness ? { witness:packet??witness } : {}) }, 'device-exit');
        } finally {if(packet)packet.ciphertext=null;if(witness)wipeDeviceExitWitnessV1(witness);}
      },
      close(){privateExitClosed=true;},
    }),
    deviceReservation: Object.freeze({
      async preparation(input) {
        if (!exact(input, ['access', 'signature', 'depositJobId', 'rootId'])) fail('MOBILE_ORIGINAL_REQUEST_INVALID');
        const access = scope(normalizeOriginalAccountAccessV2(input.access));
        if (access.action !== 'read') fail('MOBILE_ORIGINAL_ACTION');
        normalizeOriginalAccountSignatureV2(input.signature);
        return await request('preparation-reviews', input, 'device-reservation');
      },
      async challengeJob(input) {
        if (!exact(input, ['access', 'signature', 'depositJobId', 'quoteId', 'custody', 'statement', 'witnessSHA256', 'jobId'])) {
          fail('MOBILE_ORIGINAL_REQUEST_INVALID');
        }
        const access = scope(normalizeOriginalAccountAccessV2(input.access));
        if (access.action !== 'read') fail('MOBILE_ORIGINAL_ACTION');
        normalizeOriginalAccountSignatureV2(input.signature);
        const value = validateDeviceReservationConsentFreshV1(await request('job-reviews', input, 'device-reservation'));
        if (value.action !== 'PROVE_U' || Object.keys(original).some(name => value[name] !== original[name])
          || value.depositJobId !== input.depositJobId || value.quoteId !== input.quoteId
          || value.witnessSHA256 !== input.witnessSHA256 || !same(value.statement, input.statement)
          || !same(value.custody, input.custody) || input.jobId !== null && value.jobId !== input.jobId) fail('MOBILE_REVIEW_CHANGED');
        return value;
      },
      async challenge(action, input) {
        if (!['RESERVE_S', 'OBSERVE_S'].includes(action) || !exact(input, ['access', 'signature', 'jobId'])) fail('MOBILE_ORIGINAL_REQUEST_INVALID');
        const access = scope(normalizeOriginalAccountAccessV2(input.access));
        if (access.action !== 'read') fail('MOBILE_ORIGINAL_ACTION');
        normalizeOriginalAccountSignatureV2(input.signature);
        const value = validateDeviceReservationConsentFreshV1(await request(action === 'RESERVE_S'
          ? 'reservation-reviews' : 'observation-reviews', input, 'device-reservation'));
        if (value.action !== action || value.jobId !== input.jobId || Object.keys(original).some(name => value[name] !== original[name])) fail('MOBILE_REVIEW_CHANGED');
        return value;
      },
      async submit(input) {
        if (!exact(input, input?.consent?.action === 'PROVE_U' ? ['consent', 'signature', 'witness'] : ['consent', 'signature'])) fail('MOBILE_ORIGINAL_REQUEST_INVALID');
        const consent = validateDeviceReservationConsentFreshV1(normalizeDeviceReservationConsentV1(input.consent));
        if (Object.keys(original).some(name => consent[name] !== original[name])) fail('MOBILE_REVIEW_CHANGED');
        const signature = normalizeOriginalAccountSignatureV2(input.signature); let witness;
        try {
          if (consent.action === 'PROVE_U') witness = normalizeDeviceReservationWitnessV1(input.witness);
          // One request. A lost reply is UNKNOWN, never an automatic reproof,
          // fresh quote, reservation or second native submission.
          return await request(consent.action === 'PROVE_U' ? 'jobs'
            : consent.action === 'RESERVE_S' ? 'reserve' : 'observations',
            { consent, signature, ...(witness ? { witness } : {}) }, 'device-reservation');
        } finally { if (witness) wipeDeviceReservationWitnessV1(witness); }
      },
    }),
    deviceDeposit: Object.freeze({
      async challengeJob(input) {
        if (!exact(input, ['access', 'signature', 'statement', 'rootId', 'noteRevision', 'witnessSHA256', 'jobId'])) fail('MOBILE_ORIGINAL_REQUEST_INVALID');
        scope(normalizeOriginalAccountAccessV2(input.access)); normalizeOriginalAccountSignatureV2(input.signature);
        const value = validateDeviceDepositConsentFreshV1(await request('job-reviews', input, 'device-deposit'));
        if (value.action !== 'PROVE_D26' || Object.keys(original).some(name => value[name] !== original[name])
          || !same(value.statement, input.statement) || value.rootId !== input.rootId
          || value.noteRevision !== input.noteRevision || value.witnessSHA256 !== input.witnessSHA256) fail('MOBILE_REVIEW_CHANGED');
        if(value.version===2)privateDepositConsents.set(value,{snapshot:JSON.stringify(value),used:false});
        return value;
      },
      async challenge(action, input) {
        if (!['FUND_D26', 'OBSERVE_D26'].includes(action) || !exact(input, ['access', 'signature', 'jobId'])) fail('MOBILE_ORIGINAL_REQUEST_INVALID');
        scope(normalizeOriginalAccountAccessV2(input.access)); normalizeOriginalAccountSignatureV2(input.signature);
        const value = validateDeviceDepositConsentFreshV1(await request(action === 'FUND_D26'
          ? 'funding-reviews' : 'observation-reviews', input, 'device-deposit'));
        if (value.action !== action || value.jobId !== input.jobId || Object.keys(original).some(name => value[name] !== original[name])) fail('MOBILE_REVIEW_CHANGED');
        if(value.version===2)privateDepositConsents.set(value,{snapshot:JSON.stringify(value),used:false});
        return value;
      },
      async submit(input) {
        if (!exact(input, input?.consent?.action === 'PROVE_D26' ? ['consent', 'signature', 'witness'] : ['consent', 'signature'])) fail('MOBILE_ORIGINAL_REQUEST_INVALID');
        const consent = validateDeviceDepositConsentFreshV1(normalizeDeviceDepositConsentV1(input.consent));
        if (Object.keys(original).some(name => consent[name] !== original[name])) fail('MOBILE_REVIEW_CHANGED');
        const signature=normalizeOriginalAccountSignatureV2(input.signature);
        if(consent.version===2){const issued=privateDepositConsents.get(input.consent);
          if(!issued||issued.used||issued.snapshot!==JSON.stringify(consent))fail('MOBILE_ORIGINAL_PRIVATE_CONSENT');issued.used=true;}
        let witness,packet;
        try {
          if (consent.action === 'PROVE_D26') witness = normalizeDeviceDepositWitnessV1(input.witness);
          if(consent.version===2&&consent.action==='PROVE_D26'){
            packet=await sealOriginalNativeDeviceDepositWitnessV2(consent,signature,witness);
            validateDeviceDepositConsentFreshV1(consent);
          }
          // The original review is burned before encryption/POST. Reply loss
          // requires a fresh explicit observation of the SAME durable job.
          return await request(consent.action === 'PROVE_D26' ? (consent.version===2?'private-jobs':'jobs')
            : consent.action === 'FUND_D26' ? 'fund' : 'observations', { consent, signature,
              ...(witness ? { witness:packet??witness } : {}) }, 'device-deposit');
        } finally { if (witness) for (const item of Object.values(witness)) if (Array.isArray(item)) item.fill(0);
          if(packet)for(const name of ['ciphertext','tag','iv','salt'])packet[name]=''; }
      },
    }),
    async state() { return normalizeOriginalAccountServiceV2(await request('state')); },
    async challenge(action) {
      if (!['read', 'reconcile'].includes(action)) fail('MOBILE_ORIGINAL_ACTION');
      const raw = await request('challenges', { action });
      if (!exact(raw, ['challenge'])) fail('MOBILE_ORIGINAL_RESPONSE_INVALID');
      const value = scope(normalizeOriginalAccountAccessV2(raw.challenge));
      if (value.action !== action) fail('MOBILE_REVIEW_CHANGED'); return value;
    },
    async openReview(raw) {
      if (!exact(raw, ['challenge', 'signature'])) fail('MOBILE_ORIGINAL_REQUEST_INVALID');
      const challenge = scope(normalizeOriginalAccountAccessV2(raw.challenge));
      const signature = normalizeOriginalAccountSignatureV2(raw.signature);
      const value = await request('reviews', { challenge, signature });
      if (!exact(value, ['review'])) fail('MOBILE_ORIGINAL_RESPONSE_INVALID');
      const review = scope(normalizeOriginalAccountReviewV2(value.review));
      if (review.action !== challenge.action || review.bootstrapChallengeId !== challenge.challengeId) {
        fail('MOBILE_REVIEW_CHANGED');
      }
      return review;
    },
    async submit(raw) {
      if (!exact(raw, ['review', 'signature'])) fail('MOBILE_ORIGINAL_REQUEST_INVALID');
      const review = scope(normalizeOriginalAccountReviewV2(raw.review));
      const signature = normalizeOriginalAccountSignatureV2(raw.signature);
      const value = await request('diagnostics', { review, signature });
      if (!exact(value, ['version', 'profile', 'action', 'binding', 'admission', 'privatePortfolio',
        'economicObservation', 'noteCustodyOnDevice', 'nativeEffectsEstablished'])
        || value.version !== 2 || value.profile !== 'PAIRED_ORIGINAL_ACCOUNT_DIAGNOSTIC_V2'
        || value.action !== review.action || value.privatePortfolio !== null || value.economicObservation !== null
        || value.noteCustodyOnDevice !== false || value.nativeEffectsEstablished !== false) {
        fail('MOBILE_ORIGINAL_RESPONSE_INVALID');
      }
      const binding = normalizeOriginalAccountBindingV2(value.binding), mutable = new Set([
        'observedProcessGeneration', 'journalRevision', 'requestState', 'authorityStage', 'submission',
      ]);
      const requestStates = ['PREPARED', 'UNKNOWN', 'CONFIRMED'], authorityStates = ['READY', 'UNKNOWN', 'CONFIRMED'];
      if (Object.keys(review.binding).some(name => !mutable.has(name) && !same(binding[name], review.binding[name]))
        || binding.journalRevision < review.binding.journalRevision
        || binding.observedProcessGeneration < review.binding.observedProcessGeneration
        || requestStates.indexOf(binding.requestState) < requestStates.indexOf(review.binding.requestState)
        || authorityStates.indexOf(binding.authorityStage) < authorityStates.indexOf(review.binding.authorityStage)
        || review.binding.submission !== null && !same(binding.submission, review.binding.submission)) {
        fail('MOBILE_REVIEW_CHANGED');
      }
      let admission = null;
      if (review.action === 'reconcile') {
        const row = value.admission;
        if (!exact(row, ['version', 'admitted', 'sequence', 'action', 'requestId', 'state', 'errorCode'])
          || row.version !== 1 || row.admitted !== true || !Number.isSafeInteger(row.sequence)
          || row.sequence < 1 || row.action !== 'reconcile' || row.requestId !== review.binding.requestId
          || !['SUCCEEDED', 'FAILED'].includes(row.state)
          || !(row.state === 'SUCCEEDED' ? row.errorCode === null
            : typeof row.errorCode === 'string' && /^[A-Z][A-Z0-9_]{0,95}$/.test(row.errorCode))) {
          fail('MOBILE_ORIGINAL_RESPONSE_INVALID');
        }
        admission = Object.freeze({ ...row });
      } else if (value.admission !== null) fail('MOBILE_ORIGINAL_RESPONSE_INVALID');
      return Object.freeze({ ...value, binding, admission });
    },
  });
}

/** The same bounded/origin-bound transport, separate signature domain and fixed
 * routes. It exposes only read consent and never a raw path or execute hook. */
export function createOriginalPrivateStateApiV1(options) {
  return createOriginalAccountApiV2(options).privateState;
}
