/** Private continuation of one device U/S bridge. The fixed bootstrap supplies
 * original provider custodies and the account's same native executor. Requests
 * contain neither providers nor an execution replacement/callback. */
import assert from 'node:assert/strict';
import {types} from 'node:util';
import {createHash,createPublicKey,randomBytes,verify} from 'node:crypto';
import {exactRecord} from '../../execution/encoding/commitments.mjs';
import {cloneInput} from '../../execution/account/preparation/readiness-inputs.mjs';
import {assertOwnedNativeValueExecution} from '../../execution/native-value/execution/native-value-execution-v2.mjs';
import {assertOwnedNativeValueProviderCustody} from '../../chains/shared/dispatch/native-value-dispatch-owner-v2.mjs';
import {assertDeviceOwnerReservationBridgeV1,deviceOwnerReservationBridgeActorV1} from './device-owner-reservation-bridge-v1.mjs';
import {installDeviceOwnerExecutionV1,readDeviceOwnerExecutionStatusV1,runDeviceOwnerExecutionAuthorizationV1,
  assertOwnedNativeValueAccountAuthority}
  from './native-value-account-authority-v2.mjs';
import {createNativeValueSystemStateReader} from '../../execution/native-value/reconciliation/native-value-system-state-v2.mjs';
import {normalizeOriginalAccountSignatureV2} from '../../../../mobile-protocol/src/original-account-review-v2.mjs';
import {DEVICE_EXECUTION_CONSENT_V1,normalizeDeviceExecutionConsentV1,validateDeviceExecutionConsentFreshV1,
  deviceExecutionConsentMessageV1} from '../../../../mobile-protocol/src/device-execution-consent-v1.mjs';
import {DEVICE_RESERVATION_CONSENT_V1} from '../../../../mobile-protocol/src/device-reservation-consent-v1.mjs';
const bridges=new WeakMap(),admissions=new WeakMap(),sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const nonce=()=>randomBytes(32).toString('hex');
export async function createDeviceOwnerExecutionBridgeV1(input){
  assert.equal(arguments.length,1);exactRecord(input,['account','reservationBridge','nativeExecution','providers','runtime','system','poolIndex']);
  const {account,reservationBridge,nativeExecution,runtime,system,poolIndex}=input;
  const original=()=>{assertOwnedNativeValueAccountAuthority(account,{runtime,system,poolIndex});
    assertDeviceOwnerReservationBridgeV1(reservationBridge,account);assertOwnedNativeValueExecution(nativeExecution,{runtime,system,poolIndex});};
  original();const descriptor=assertDeviceOwnerReservationBridgeV1(reservationBridge,account),actor=deviceOwnerReservationBridgeActorV1(reservationBridge);
  assert.ok(Array.isArray(input.providers)&&input.providers.length>0&&input.providers.length<=4);
  const providers=Object.freeze(input.providers.map(row=>{exactRecord(row,['slot','custody','deliveryRiskSalt']);
    assert.ok(Number.isSafeInteger(row.slot)&&row.slot>=0&&row.slot<4);assertOwnedNativeValueProviderCustody(row.custody,{runtime,system,poolIndex});
    assert.match(row.deliveryRiskSalt,/^[0-9a-f]{64}$/);assert.notEqual(row.deliveryRiskSalt,'0'.repeat(64));return Object.freeze({...row});}));
  const reader=await createNativeValueSystemStateReader({runtime,system,poolIndex});
  const key=createPublicKey({format:'jwk',key:{kty:'EC',crv:'secp256k1',
    x:Buffer.from(descriptor.devicePublicKey.slice(2,66),'hex').toString('base64url'),
    y:Buffer.from(descriptor.devicePublicKey.slice(66),'hex').toString('base64url')}});
  let closed=false,busy=false,completion;const pending=new Map(),admitted=new Map();
  const live=()=>{assert.ok(!closed,'DEVICE_EXECUTION_BRIDGE_CLOSED');original();};
  const grant=value=>{const cap=Object.freeze(Object.defineProperty(Object.create(null),'toJSON',{
    value(){throw Error('DEVICE_EXECUTION_NOT_SERIALIZABLE');}}));admissions.set(cap,{bridge,account,...value,consumed:false});return cap;};
  async function challenge(input,action){exactRecord(input,['access','signature','jobId']);live();assert.ok(!busy,'DEVICE_EXECUTION_BRIDGE_BUSY');busy=true;
    try{const binding=await actor.deviceDepositSignedReadBindingV1({challenge:cloneInput(input.access),signature:input.signature});live();
      const status=await readDeviceOwnerExecutionStatusV1(account,bridge,input.jobId),view=await reader.read();await reader.assertCurrent(view);live();
      assert.equal(status.reservation.stage,'RESERVED','DEVICE_EXECUTION_ORIGINAL_S_REQUIRED');
      for(const[id,row]of pending)if(row.consumed||row.value.reservation.expiresAt<=Date.now())pending.delete(id);
      assert.ok(pending.size<4,'DEVICE_EXECUTION_CHALLENGE_CAPACITY');
      const value=normalizeDeviceExecutionConsentV1({version:1,profile:DEVICE_EXECUTION_CONSENT_V1,action,
        reservation:{version:1,profile:DEVICE_RESERVATION_CONSENT_V1,action:'OBSERVE_S',...descriptor,
          challengeId:nonce(),nonce:nonce(),expiresAt:Date.now()+15000,binding,poolTerms:{scope:view.domain.scope,policy:view.domain.policy,
            codeHash:account.config.registry[0].codeHash,assetIdentity:view.domain.asset,domainCommitment:view.domainCommitment},
          ...status.reservation.consentFields,observed:{blockNumber:view.head.number,blockHash:view.head.hash,timestamp:view.head.timestamp},openingDisclosure:null},
        nativeBindingSHA256:status.nativeBindingSHA256,reservationTransactionHash:status.reservation.observation.transactionHash,
        executionSnapshotSHA256:status.executionSnapshotSHA256,lossClause:status.lossClause});
      // Enforce the protected signer capacity before returning any challenge.
      deviceExecutionConsentMessageV1(value);pending.set(value.reservation.challengeId,{value,consumed:false});return cloneInput(value);
    }finally{busy=false;}}
  async function work(input,action){exactRecord(input,['consent','signature']);live();assert.ok(!busy,'DEVICE_EXECUTION_BRIDGE_BUSY');busy=true;
    let retained,failure;try{const consent=validateDeviceExecutionConsentFreshV1(cloneInput(input.consent)),row=pending.get(consent.reservation.challengeId);
      assert.ok(row&&!row.consumed&&consent.action===action,'DEVICE_EXECUTION_ORIGINAL_CONSENT');assert.deepEqual(consent,row.value);
      assert.equal(verify('sha256',deviceExecutionConsentMessageV1(consent),{key,dsaEncoding:'ieee-p1363'},
        Buffer.from(normalizeOriginalAccountSignatureV2(input.signature),'hex')),true,'DEVICE_EXECUTION_DEVICE_SIGNATURE');
      assert.deepEqual(await actor.deviceDepositOriginalBinding(),consent.reservation.binding,'DEVICE_EXECUTION_BINDING_CHANGED');live();
      validateDeviceExecutionConsentFreshV1(consent);const id=consent.reservation.jobId+':'+action;
      if(action==='EXECUTE_NATIVE')assert.ok(!admitted.has(id),'DEVICE_EXECUTION_RECONCILE_ORIGINAL_ONLY');
      row.consumed=true;retained=Promise.withResolvers();retained.promise.catch(()=>{});
      if(action==='EXECUTE_NATIVE')admitted.set(id,retained.promise);completion=retained.promise;
      return await runDeviceOwnerExecutionAuthorizationV1(account,bridge,grant({action,consent}));
    }catch(error){failure=error;throw error;}finally{busy=false;if(retained){if(failure)retained.reject(failure);else retained.resolve();}}}
  const bridge=Object.freeze({challengeExecution(input){assert.equal(arguments.length,1);return challenge(input,'EXECUTE_NATIVE');},
    execute(input){assert.equal(arguments.length,1);return work(input,'EXECUTE_NATIVE');},
    challengeReconciliation(input){assert.equal(arguments.length,1);return challenge(input,'RECONCILE_NATIVE');},
    reconcile(input){assert.equal(arguments.length,1);return work(input,'RECONCILE_NATIVE');},
    challengeRecovery(input){assert.equal(arguments.length,1);return challenge(input,'RECOVER_NATIVE');},
    recover(input){assert.equal(arguments.length,1);return work(input,'RECOVER_NATIVE');},
    close(){assert.equal(arguments.length,0);closed=true;pending.clear();return{closed:true,originalWorkRetained:true};}});
  bridges.set(bridge,{account,reservationBridge,nativeExecution,providers,actor,descriptor,original,
    installationConsumed:false,get completion(){return completion;}});await installDeviceOwnerExecutionV1(account,bridge);return bridge;
}
export function assertDeviceOwnerExecutionBridgeV1(bridge,account){assert.equal(arguments.length,2);assert.ok(!types.isProxy(bridge));
  const row=bridges.get(bridge);assert.ok(row&&row.account===account,'DEVICE_EXECUTION_ORIGINAL_BRIDGE');row.original();return row.descriptor;}
export function consumeDeviceOwnerExecutionInstallationV1(bridge,account){assertDeviceOwnerExecutionBridgeV1(bridge,account);
  const row=bridges.get(bridge);assert.equal(row.installationConsumed,false,'DEVICE_EXECUTION_ORIGINAL_INSTALLATION_ONCE');
  row.installationConsumed=true;return{reservationBridge:row.reservationBridge,nativeExecution:row.nativeExecution,providers:row.providers,descriptor:row.descriptor};}
export function deviceOwnerExecutionBridgeActorV1(bridge){assert.equal(arguments.length,1);assert.ok(!types.isProxy(bridge));
  const row=bridges.get(bridge);assert.ok(row,'DEVICE_EXECUTION_ORIGINAL_BRIDGE');row.original();return row.actor;}
export function consumeDeviceOwnerExecutionAuthorizationV1(bridge,cap,account){assert.equal(arguments.length,3);
  assertDeviceOwnerExecutionBridgeV1(bridge,account);assert.ok(!types.isProxy(cap));const row=admissions.get(cap);
  assert.ok(row&&!row.consumed&&row.bridge===bridge&&row.account===account,'DEVICE_EXECUTION_ORIGINAL_ADMISSION');row.consumed=true;return row;}
export async function awaitDeviceOwnerExecutionOriginalWorkV1(bridge){assert.equal(arguments.length,1);assert.ok(!types.isProxy(bridge));
  const row=bridges.get(bridge);assert.ok(row?.completion,'DEVICE_EXECUTION_ORIGINAL_WORK');row.original();await row.completion;row.original();}
