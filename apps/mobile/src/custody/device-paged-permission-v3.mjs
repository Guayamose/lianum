/** Exact new PoP domain only; legacy arbitrary signer cap is unchanged. */
import {secp256k1} from '@noble/curves/secp256k1.js';
import {devicePublicKey,bytesToHex} from './signing.mjs';
import * as P from '../../../../packages/mobile-protocol/src/device-paged-owner-v3.mjs';
export function signDevicePagedConsentV3(key,raw){const c=P.validateDevicePagedConsentFreshV3(raw);if(devicePublicKey(key)!==c.descriptor.devicePublicKey)throw Error('MOBILE_KEY_BINDING_CHANGED');let frame,signed;try{frame=P.devicePagedPermissionMessageV3(c);if(frame.length===0||frame.length>8192)throw Error('MOBILE_MESSAGE_INVALID');signed=secp256k1.sign(frame,key,{prehash:true,lowS:true});if(!secp256k1.verify(signed,frame,secp256k1.getPublicKey(key),{prehash:true,lowS:true}))throw Error('MOBILE_SIGNATURE_INVALID');P.validateDevicePagedConsentFreshV3(c);return bytesToHex(signed);}finally{frame?.fill(0);signed?.fill(0);}}

import * as C from '../../../../packages/mobile-protocol/src/device-paged-graph-v3.mjs';
export function signDevicePagedGraphConsentV3(key,raw){const c=C.validateDevicePagedGraphConsentFreshV3(raw);if(devicePublicKey(key)!==c.descriptor.devicePublicKey)throw Error('MOBILE_KEY_BINDING_CHANGED');let frame,signed;try{frame=C.devicePagedGraphPermissionMessageV3(c);if(frame.length===0||frame.length>8192)throw Error('MOBILE_MESSAGE_INVALID');signed=secp256k1.sign(frame,key,{prehash:true,lowS:true});if(!secp256k1.verify(signed,frame,secp256k1.getPublicKey(key),{prehash:true,lowS:true}))throw Error('MOBILE_SIGNATURE_INVALID');C.validateDevicePagedGraphConsentFreshV3(c);return bytesToHex(signed);}finally{frame?.fill(0);signed?.fill(0);}}

/** Finite foreground key lease. The hardware/key-store entrypoint supplies the
 * authenticated Vault review and revokes its activity callback on background.
 * Each server permission is still freshly validated and signed only once. */
export const DEVICE_PAGED_EXECUTION_MAX_MS_V3=30*60*1000;
const executionSessions=new WeakMap();
const executionActions=new Set(['SIGN_GRAPH','READ_GRAPH','OBSERVE_GRAPH','READ_PORTFOLIO','NEXT_COMMAND','PROVE_R','RESERVE_R','PROVE_EDGE','FOLD','EXECUTE_NATIVE','PROVE_ADMISSION','ADMIT','PROVE_NODE','PROVE_T','FULFILL','RECOVER_CUTOFF']);
export function createDevicePagedGraphExecutionSessionV3(key,rawBinding,current,onAuthorized){
 const binding=P.pagedOwnerExactV3(rawBinding,['descriptor','rootId','graphId','authorizationRoot','reserveNullifier','budget','settleBefore','deadlineMs']);
 binding.descriptor=P.normalizeDevicePagedDescriptorV3(binding.descriptor);
 for(const field of ['rootId','authorizationRoot','reserveNullifier'])P.pagedOwnerHexV3(binding[field]);
 if(typeof current!=='function'||onAuthorized!==undefined&&typeof onAuthorized!=='function'||!/^paged-graph-[0-9a-f]{32}$/.test(binding.graphId)||!Number.isSafeInteger(binding.deadlineMs)||binding.deadlineMs<=P.devicePagedNowV3()||binding.deadlineMs>Math.min(P.devicePagedNowV3()+DEVICE_PAGED_EXECUTION_MAX_MS_V3,binding.descriptor.deadlineMs)||devicePublicKey(key)!==binding.descriptor.devicePublicKey)throw Error('MOBILE_PAGED_EXECUTION_SESSION');
 P.pagedOwnerUintV3(binding.budget);P.pagedOwnerUintV3(binding.settleBefore);
 const state={key:new Uint8Array(key),binding:Object.freeze(binding),current,onAuthorized,closed:false,used:new Set()},session=Object.freeze(Object.create(null));executionSessions.set(session,state);return session;
}
export function closeDevicePagedGraphExecutionSessionV3(session){const state=executionSessions.get(session);if(!state||state.closed)return;state.closed=true;state.key.fill(0);state.used.clear();}
export function readDevicePagedGraphExecutionSessionV3(session){
 const state=executionSessions.get(session);
 if(!state||state.closed)throw Error('MOBILE_PAGED_EXECUTION_SESSION');
 try{if(P.devicePagedNowV3()>=state.binding.deadlineMs)throw Error('MOBILE_PAGED_EXECUTION_SESSION_EXPIRED');state.current();return state.binding;}catch(error){closeDevicePagedGraphExecutionSessionV3(session);throw error;}
}
export function signDevicePagedGraphSessionConsentV3(session,raw){
 const binding=readDevicePagedGraphExecutionSessionV3(session),state=executionSessions.get(session),consent=C.validateDevicePagedGraphConsentFreshV3(raw);
 if(JSON.stringify(consent.descriptor)!==JSON.stringify(binding.descriptor)||consent.rootId!==binding.rootId||consent.graphId!==binding.graphId||consent.authorizationRoot!==binding.authorizationRoot||consent.reserveNullifier!==binding.reserveNullifier||!executionActions.has(consent.action)||state.used.has(consent.challengeId)||state.used.size>=16384)throw Error('MOBILE_PAGED_EXECUTION_SESSION_SCOPE');
 const signature=signDevicePagedGraphConsentV3(state.key,consent);readDevicePagedGraphExecutionSessionV3(session);state.used.add(consent.challengeId);try{state.onAuthorized?.();}catch(error){closeDevicePagedGraphExecutionSessionV3(session);throw error;}return signature;
}
