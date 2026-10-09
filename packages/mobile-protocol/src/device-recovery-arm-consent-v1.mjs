/** A fresh device control permission is consumed when arming/disarming.
 * Its signature is never treated as a still-live consent at the later cutoff.
 * It binds the original S, allocation and loss clause in a separate domain. */
import {normalizeDeviceExecutionConsentV1,validateDeviceExecutionConsentFreshV1,deviceExecutionConsentMessageV1}
  from './device-execution-consent-v1.mjs';
export const DEVICE_RECOVERY_ARM_V1='LIANUM_DEVICE_ORIGINAL_LIVE_F_ARM_V1';
const need=x=>{if(!x)throw Error('DEVICE_RECOVERY_ARM_INVALID');};
const exact=(raw,names)=>{need(raw&&Object.getPrototypeOf(raw)===Object.prototype&&Reflect.ownKeys(raw).length===names.length);
 return Object.fromEntries(names.map(name=>{const d=Object.getOwnPropertyDescriptor(raw,name);need(d?.enumerable&&Object.hasOwn(d,'value'));return[name,d.value];}));};
const uint=x=>{need(typeof x==='string'&&/^(0|[1-9][0-9]{0,19})$/.exec(x)?.[0]===x&&BigInt(x)<(1n<<64n));return x;};
const hex=x=>need(typeof x==='string'&&/^[0-9a-f]{64}$/.exec(x)?.[0]===x&&x!=='0'.repeat(64));
export function normalizeDeviceRecoveryArmConsentV1(raw){const v=exact(raw,['version','profile','action','execution','settleBefore']);
 need(v.version===1&&v.profile===DEVICE_RECOVERY_ARM_V1&&['ARM_RECOVERY','DISARM_RECOVERY'].includes(v.action));
 v.execution=normalizeDeviceExecutionConsentV1(v.execution);need(v.execution.action==='RECONCILE_NATIVE');uint(v.settleBefore);return Object.freeze(v);}
export function validateDeviceRecoveryArmConsentFreshV1(raw,now=Date.now()){
 const v=normalizeDeviceRecoveryArmConsentV1(raw);validateDeviceExecutionConsentFreshV1(v.execution,now);return v;}
export function deviceRecoveryArmConsentMessageV1(raw){const v=normalizeDeviceRecoveryArmConsentV1(raw),body=deviceExecutionConsentMessageV1(v.execution);
 const tag=new TextEncoder().encode(DEVICE_RECOVERY_ARM_V1+'\n'),bytes=new Uint8Array(tag.length+9+body.length);bytes.set(tag);bytes[tag.length]=v.action==='ARM_RECOVERY'?1:2;
 let n=BigInt(v.settleBefore);for(let i=7;i>=0;i--){bytes[tag.length+1+i]=Number(n&255n);n>>=8n;}bytes.set(body,tag.length+9);body.fill(0);need(bytes.length<=4096);return bytes;}
export function normalizeDeviceRecoveryArmStatusV1(raw){const v=exact(raw,['jobId','state','settleBefore','armSHA256','terminalOutcome','authorizationSHA256']);
 hex(v.jobId);uint(v.settleBefore);need(['ABSENT','ARMED','FIRING','UNKNOWN','DISARMED','RECOVERED','FULFILLED'].includes(v.state));
 if(v.armSHA256!==null)hex(v.armSHA256);hex(v.authorizationSHA256);need([null,'RECOVERED','FULFILLED'].includes(v.terminalOutcome));
 if(v.state==='ABSENT')need(v.armSHA256===null);else need(v.armSHA256!==null);
 if(['RECOVERED','FULFILLED'].includes(v.state))need(v.terminalOutcome===v.state);return Object.freeze(v);}
