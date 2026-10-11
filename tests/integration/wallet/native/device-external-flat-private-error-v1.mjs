/** Bounded original first-error diagnostic; no credentials or exception body. */
import {types} from 'node:util';
import {privateNativeEconomicSuccessorFirstErrorV1} from './native-device-economic-private-error-v1.mjs';
import {writeFixturePrivate} from '../../fixtures/runners/owned-flat-fixture.mjs';
const ORIGINAL_MOBILE_FAILURE_CODES_V1=new Set([
 'MOBILE_EXTERNAL_FLAT_RESPONSE_REJECTED','MOBILE_EXTERNAL_FLAT_REQUEST_TIMEOUT','MOBILE_EXTERNAL_FLAT_REQUEST_CLOSED','MOBILE_PRIVATE_D27_TRANSIT_REJECTED',
 'MOBILE_ENTROPY_FAILED','MOBILE_EXTERNAL_FLAT_ALREADY_OPEN','MOBILE_EXTERNAL_FLAT_BINDING',
 'MOBILE_EXTERNAL_FLAT_BUSY','MOBILE_EXTERNAL_FLAT_CAPACITY','MOBILE_EXTERNAL_FLAT_OBSERVE_ONLY',
 'MOBILE_EXTERNAL_FLAT_ORIGINAL_JOB','MOBILE_EXTERNAL_FLAT_ORIGINAL_JOBS',
 'MOBILE_EXTERNAL_FLAT_RECOVERY_REQUIRED','MOBILE_EXTERNAL_FLAT_STORAGE_CHANGED',
 'MOBILE_EXTERNAL_FLAT_UNAVAILABLE','MOBILE_EXTERNAL_FLAT_WRITE_UNCERTAIN'
]);
function originalDeviceExternalFlatMobileFailureCodeV1(error){
 if(!error||typeof error!=='object'||types.isProxy(error)||!types.isNativeError(error))return null;
 for(const key of ['code','message']){
  const descriptor=Object.getOwnPropertyDescriptor(error,key);
  if(descriptor&&Object.hasOwn(descriptor,'value')&&typeof descriptor.value==='string'
   &&ORIGINAL_MOBILE_FAILURE_CODES_V1.has(descriptor.value))return descriptor.value;
 }
 return null;
}
export function retainOriginalDeviceExternalFlatFirstErrorV1(path,error){
 try{
  const originalMobileErrorCode=originalDeviceExternalFlatMobileFailureCodeV1(error);
  const first=privateNativeEconomicSuccessorFirstErrorV1(error);
  writeFixturePrivate(path,{...first,originalMobileErrorCode});
 }catch{}
}
