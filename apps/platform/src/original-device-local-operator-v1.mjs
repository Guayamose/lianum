/** Explicit local operator startup, independent of SQL/Cloud run.mjs. The only
 * backend import is the canonical authority owner. Public device identity and
 * operator TLS are the inputs; source and app share the same private maps.
 * This creates a NEW local realm; it never adopts an existing funded database. */
import { types } from 'node:util';
function exact(value, names) {
  if (!value || types.isProxy(value) || Object.getPrototypeOf(value) !== Object.prototype
    || Reflect.ownKeys(value).length !== names.length || !names.every(name =>
      Object.hasOwn(Object.getOwnPropertyDescriptor(value, name) ?? {}, 'value')))
    throw Error('PLATFORM_ORIGINAL_LOCAL_OPERATOR_CONFIGURATION');
}
const original = new URL('../../../packages/backend/src/operations/recovery/native-device-local-operator-v1.mjs', import.meta.url);
export async function startPlatformOriginalDeviceLocalOperatorV1(input) {
  if (arguments.length !== 1) throw Error('PLATFORM_ORIGINAL_LOCAL_OPERATOR_ARGUMENTS');
  exact(input, ['origin', 'devicePublicKey', 'tls']); exact(input.tls, ['certificate', 'privateKey']);
  const selected = { origin: input.origin, devicePublicKey: input.devicePublicKey,
    tls: { certificate: input.tls.certificate, privateKey: input.tls.privateKey } };
  for (const value of [selected.origin, selected.devicePublicKey, selected.tls.certificate, selected.tls.privateKey])
    if (typeof value !== 'string') throw Error('PLATFORM_ORIGINAL_LOCAL_OPERATOR_CONFIGURATION');
  const { createOriginalNativeDeviceLocalOperatorV1 } = await import(original);
  return createOriginalNativeDeviceLocalOperatorV1(selected);
}
/** Infrastructure ports only, before birth; genuine fixed backend factories
 * create account/keeper/bridges and install SQL admission in the same realm. */
export async function startPlatformOriginalDeviceDurableLocalOperatorV1(input) {
  if (arguments.length !== 1) throw Error('PLATFORM_ORIGINAL_LOCAL_OPERATOR_ARGUMENTS');
  exact(input, ['origin', 'devicePublicKey', 'tls', 'pool', 'privacyKey']); exact(input.tls, ['certificate', 'privateKey']);
  const selected = { origin: input.origin, devicePublicKey: input.devicePublicKey,
    tls: { certificate: input.tls.certificate, privateKey: input.tls.privateKey }, pool: input.pool, privacyKey: input.privacyKey };
  const { createOriginalNativeDeviceDurableLocalOperatorV1 } = await import(original);
  return createOriginalNativeDeviceDurableLocalOperatorV1(selected);
}
export async function platformOriginalDeviceDurableLocalConfigurationPathV1(){
 if(arguments.length!==0)throw Error('PLATFORM_ORIGINAL_LOCAL_OPERATOR_ARGUMENTS');
 const module=await import(new URL('../../../packages/backend/src/operations/recovery/native-device-local-restart-v1.mjs',import.meta.url));
 return module.originalNativeDeviceDurableLocalConfigurationPathV1();
}
export async function reopenPlatformOriginalDeviceDurableLocalOperatorV1(input){
 if(arguments.length!==1)throw Error('PLATFORM_ORIGINAL_LOCAL_OPERATOR_ARGUMENTS');
 exact(input,['origin','devicePublicKey','tls','pool','privacyKey']);exact(input.tls,['certificate','privateKey']);
 const selected={origin:input.origin,devicePublicKey:input.devicePublicKey,tls:{certificate:input.tls.certificate,privateKey:input.tls.privateKey},pool:input.pool,privacyKey:input.privacyKey};
 const module=await import(new URL('../../../packages/backend/src/operations/recovery/native-device-local-restart-v1.mjs',import.meta.url));
 return module.reopenOriginalNativeDeviceDurableLocalOperatorV1(selected);
}
export async function platformOriginalDeviceLocalConfigurationPathV1() {
  if (arguments.length !== 0) throw Error('PLATFORM_ORIGINAL_LOCAL_OPERATOR_ARGUMENTS');
  const { originalNativeDeviceLocalConfigurationPathV1 } = await import(original);
  return originalNativeDeviceLocalConfigurationPathV1();
}

/** A separate fixed caller opens one complete original NativeNote F checkpoint.
 * The private reference JSON is not an account/runtime/permission. */
export async function reopenPlatformOriginalDeviceLocalOperatorV1(input) {
  if (arguments.length !== 1) throw Error('PLATFORM_ORIGINAL_LOCAL_OPERATOR_ARGUMENTS');
  exact(input, ['origin', 'devicePublicKey', 'tls']); exact(input.tls, ['certificate', 'privateKey']);
  const selected = { origin: input.origin, devicePublicKey: input.devicePublicKey,
    tls: { certificate: input.tls.certificate, privateKey: input.tls.privateKey } };
  for (const value of [selected.origin, selected.devicePublicKey, selected.tls.certificate, selected.tls.privateKey])
    if (typeof value !== 'string') throw Error('PLATFORM_ORIGINAL_LOCAL_OPERATOR_CONFIGURATION');
  const module = await import(new URL('../../../packages/backend/src/operations/recovery/native-device-local-restart-v1.mjs', import.meta.url));
  return module.reopenOriginalNativeDeviceLocalOperatorV1(selected);
}

/** Separate full native observed realm with separately armed F; no mode in config. */
export async function startPlatformOriginalDeviceLiveRecoveryOperatorV1(input){
  if(arguments.length!==1)throw Error('PLATFORM_ORIGINAL_LOCAL_OPERATOR_ARGUMENTS');
  exact(input,['origin','devicePublicKey','tls']);exact(input.tls,['certificate','privateKey']);
  const selected={origin:input.origin,devicePublicKey:input.devicePublicKey,tls:{certificate:input.tls.certificate,privateKey:input.tls.privateKey}};
  for(const value of [selected.origin,selected.devicePublicKey,selected.tls.certificate,selected.tls.privateKey])
    if(typeof value!=='string')throw Error('PLATFORM_ORIGINAL_LOCAL_OPERATOR_CONFIGURATION');
  const {createOriginalNativeDeviceLiveRecoveryOperatorV1}=await import(original);
  return createOriginalNativeDeviceLiveRecoveryOperatorV1(selected);
}


/** New users choose this fixed private D26/W39 + SQL realm before funding.
 * The original TLS API owns all jobs/permissions; V1 gateway remains separate. */
export async function startPlatformOriginalPrivateNativeNoteDurableOperatorV2(input) {
  if(arguments.length!==1)throw Error('PLATFORM_ORIGINAL_LOCAL_OPERATOR_ARGUMENTS');
  exact(input,['origin','devicePublicKey','tls','pool','privacyKey']);exact(input.tls,['certificate','privateKey']);
  const selected={origin:input.origin,devicePublicKey:input.devicePublicKey,
    tls:{certificate:input.tls.certificate,privateKey:input.tls.privateKey},pool:input.pool,privacyKey:input.privacyKey};
  for(const value of [selected.origin,selected.devicePublicKey,selected.tls.certificate,selected.tls.privateKey,selected.privacyKey])
    if(typeof value!=='string')throw Error('PLATFORM_ORIGINAL_LOCAL_OPERATOR_CONFIGURATION');
  const {createOriginalPrivateNativeNoteDurableOperatorV2}=await import(original);let service;
  try {
    service=await createOriginalPrivateNativeNoteDurableOperatorV2(selected);
    if(service.profile!=='ORIGINAL_NATIVE_DEVICE_PRIVATE_DURABLE_NOTE_OPERATOR_V2'
      ||service.descriptor.origin!==selected.origin||service.descriptor.devicePublicKey!==selected.devicePublicKey
      ||service.automaticFunding!==false||service.durableOriginalAdmission!==true)
      throw Error('PLATFORM_ORIGINAL_PRIVATE_DURABLE_OPERATOR_REQUIRED');
    return service;
  }catch(error){
    if(service)try{const stopped=await service.close();if(!stopped.closed||!stopped.originalResourcesStopped)throw Error('PLATFORM_ORIGINAL_LOCAL_CLOSE_UNCONFIRMED');}
      catch(failure){throw new AggregateError([error,failure],'PLATFORM_ORIGINAL_PRIVATE_DURABLE_START_CLOSE');}
    throw error;
  }
}

/** New users choose this fixed private D26/U/W39 + SQL realm before funding.
 * The original TLS API owns all jobs/permissions; V1 gateway remains separate. */
export async function startPlatformOriginalPrivateNativeAuthorizedNoteDurableOperatorV2(input) {
  if(arguments.length!==1)throw Error('PLATFORM_ORIGINAL_LOCAL_OPERATOR_ARGUMENTS');
  exact(input,['origin','devicePublicKey','tls','pool','privacyKey']);exact(input.tls,['certificate','privateKey']);
  const selected={origin:input.origin,devicePublicKey:input.devicePublicKey,
    tls:{certificate:input.tls.certificate,privateKey:input.tls.privateKey},pool:input.pool,privacyKey:input.privacyKey};
  for(const value of [selected.origin,selected.devicePublicKey,selected.tls.certificate,selected.tls.privateKey,selected.privacyKey])
    if(typeof value!=='string')throw Error('PLATFORM_ORIGINAL_LOCAL_OPERATOR_CONFIGURATION');
  const {createOriginalPrivateNativeAuthorizedNoteDurableOperatorV2}=await import(original);let service;
  try {
    service=await createOriginalPrivateNativeAuthorizedNoteDurableOperatorV2(selected);
    if(service.profile!=='ORIGINAL_NATIVE_DEVICE_PRIVATE_AUTHORIZED_DURABLE_NOTE_OPERATOR_V2'
      ||service.descriptor.origin!==selected.origin||service.descriptor.devicePublicKey!==selected.devicePublicKey
      ||service.automaticFunding!==false||service.durableOriginalAdmission!==true)
      throw Error('PLATFORM_ORIGINAL_PRIVATE_DURABLE_OPERATOR_REQUIRED');
    return service;
  }catch(error){
    if(service)try{const stopped=await service.close();if(!stopped.closed||!stopped.originalResourcesStopped)throw Error('PLATFORM_ORIGINAL_LOCAL_CLOSE_UNCONFIRMED');}
      catch(failure){throw new AggregateError([error,failure],'PLATFORM_ORIGINAL_PRIVATE_DURABLE_START_CLOSE');}
    throw error;
  }
}

/** New users choose this fixed private D26/U/W39 + SQL and encrypted Native worker IPC realm before funding.
 * The original TLS API owns all jobs/permissions; V1 gateway remains separate. */
export async function startPlatformOriginalPrivateNativeWorkerNoteDurableOperatorV3(input) {
  if(arguments.length!==1)throw Error('PLATFORM_ORIGINAL_LOCAL_OPERATOR_ARGUMENTS');
  exact(input,['origin','devicePublicKey','tls','pool','privacyKey']);exact(input.tls,['certificate','privateKey']);
  const selected={origin:input.origin,devicePublicKey:input.devicePublicKey,
    tls:{certificate:input.tls.certificate,privateKey:input.tls.privateKey},pool:input.pool,privacyKey:input.privacyKey};
  for(const value of [selected.origin,selected.devicePublicKey,selected.tls.certificate,selected.tls.privateKey,selected.privacyKey])
    if(typeof value!=='string')throw Error('PLATFORM_ORIGINAL_LOCAL_OPERATOR_CONFIGURATION');
  const {createOriginalPrivateNativeWorkerNoteDurableOperatorV3}=await import(original);let service;
  try {
    service=await createOriginalPrivateNativeWorkerNoteDurableOperatorV3(selected);
    if(service.profile!=='ORIGINAL_NATIVE_DEVICE_PRIVATE_WORKER_DURABLE_NOTE_OPERATOR_V3'
      ||service.descriptor.origin!==selected.origin||service.descriptor.devicePublicKey!==selected.devicePublicKey
      ||service.automaticFunding!==false||service.durableOriginalAdmission!==true)
      throw Error('PLATFORM_ORIGINAL_PRIVATE_DURABLE_OPERATOR_REQUIRED');
    return service;
  }catch(error){
    if(service)try{const stopped=await service.close();if(!stopped.closed||!stopped.originalResourcesStopped)throw Error('PLATFORM_ORIGINAL_LOCAL_CLOSE_UNCONFIRMED');}
      catch(failure){throw new AggregateError([error,failure],'PLATFORM_ORIGINAL_PRIVATE_DURABLE_START_CLOSE');}
    throw error;
  }
}

/** Fixed private-worker ordered continuation. Infrastructure is authenticated
 * by the original opener before any issuer section is consumed. */
export async function reopenPlatformOriginalPrivateNativeWorkerNoteDurableOperatorV3(input){
 if(arguments.length!==1)throw Error('PLATFORM_ORIGINAL_LOCAL_OPERATOR_ARGUMENTS');
 exact(input,['origin','devicePublicKey','tls','pool','privacyKey']);exact(input.tls,['certificate','privateKey']);
 const selected={origin:input.origin,devicePublicKey:input.devicePublicKey,tls:{certificate:input.tls.certificate,privateKey:input.tls.privateKey},pool:input.pool,privacyKey:input.privacyKey};
 const module=await import(new URL('../../../packages/backend/src/operations/recovery/native-device-local-restart-v1.mjs',import.meta.url));
 return module.reopenOriginalPrivateNativeWorkerDurableLocalOperatorV3(selected);
}
