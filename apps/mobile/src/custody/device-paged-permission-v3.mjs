import * as L from '@lianum/mobile-protocol/device/paged-agent-read-lifetime-v5';
/** Exact new PoP domain only; legacy arbitrary signer cap is unchanged. */
import {secp256k1} from '@noble/curves/secp256k1.js';
import {sha256} from '@noble/hashes/sha2.js';
import {devicePagedAgentDescriptorSHA256V4} from '@lianum/mobile-protocol/device/paged-agent-v4';
import {normalizeDevicePagedAutomationRequestV4} from '../../../../packages/mobile-protocol/src/device-paged-automation-v4.mjs';
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
const automationSigningActions=new Set(['SIGN_GRAPH','READ_GRAPH','OBSERVE_GRAPH','READ_ECONOMIC_OPERATION','READ_PORTFOLIO','START_AUTOMATION']);
const executionActions=new Set(['SIGN_GRAPH','READ_GRAPH','OBSERVE_GRAPH','READ_ECONOMIC_OPERATION','READ_PORTFOLIO','NEXT_COMMAND','PROVE_R','RESERVE_R','PROVE_EDGE','FOLD','EXECUTE_NATIVE','PROVE_ADMISSION','ADMIT','PROVE_NODE','PROVE_T','FULFILL','RECOVER_CUTOFF']);
export function createDevicePagedGraphExecutionSessionV3(key,rawBinding,current,onAuthorized){
 const binding=P.pagedOwnerExactV3(rawBinding,['descriptor','rootId','graphId','authorizationRoot','reserveNullifier','budget','settleBefore','deadlineMs',...(rawBinding&&typeof rawBinding==='object'&&Object.hasOwn(rawBinding,'automation')?['automation']:[]),...(rawBinding&&typeof rawBinding==='object'&&Object.hasOwn(rawBinding,'agentReadGrant')?['agentReadGrant']:[])]);
 binding.descriptor=P.normalizeDevicePagedDescriptorV3(binding.descriptor);
 for(const field of ['rootId','authorizationRoot','reserveNullifier'])P.pagedOwnerHexV3(binding[field]);
 if(typeof current!=='function'||onAuthorized!==undefined&&typeof onAuthorized!=='function'||!/^paged-graph-[0-9a-f]{32}$/.test(binding.graphId)||!Number.isSafeInteger(binding.deadlineMs)||binding.deadlineMs<=P.devicePagedNowV3()||binding.deadlineMs>Math.min(P.devicePagedNowV3()+DEVICE_PAGED_EXECUTION_MAX_MS_V3,binding.descriptor.deadlineMs)||devicePublicKey(key)!==binding.descriptor.devicePublicKey)throw Error('MOBILE_PAGED_EXECUTION_SESSION');
 P.pagedOwnerUintV3(binding.budget);P.pagedOwnerUintV3(binding.settleBefore);
 if(Object.hasOwn(binding,'automation')){binding.automation=normalizeDevicePagedAutomationRequestV4(binding.automation);if(binding.automation.expiresAt<=P.devicePagedNowV3()||binding.deadlineMs>binding.automation.expiresAt||BigInt(binding.automation.expiresAt)>BigInt(binding.settleBefore)*1000n||binding.automation.expiresAt>binding.descriptor.deadlineMs)throw Error('MOBILE_PAGED_EXECUTION_SESSION_SCOPE');}
 if(binding.agentReadGrant!==undefined){const grant=L.normalizeDevicePagedAgentReadGrantAnyV5(binding.agentReadGrant);if(grant.descriptorSHA256!==devicePagedAgentDescriptorSHA256V4(binding.descriptor)||L.devicePagedAgentReadUntilMsV5(grant)>binding.descriptor.deadlineMs||!binding.automation||grant.readerPublicKey===binding.descriptor.devicePublicKey||!['rootId','graphId','authorizationRoot','reserveNullifier','budget','settleBefore'].every(k=>grant.terms[k]===binding[k])||!['quoteRoot','maxCommands','expiresAt'].every(k=>grant.terms[k]===binding.automation[k]))throw Error('MOBILE_PAGED_EXECUTION_SESSION_SCOPE');binding.agentReadGrant=grant;}
 const state={key:new Uint8Array(key),binding:Object.freeze(binding),current,onAuthorized,closed:false,started:false,used:new Set()},session=Object.freeze(Object.create(null));executionSessions.set(session,state);return session;
}
export function closeDevicePagedGraphExecutionSessionV3(session){const state=executionSessions.get(session);if(!state||state.closed)return;state.closed=true;state.key.fill(0);state.used.clear();}
export function readDevicePagedGraphExecutionSessionV3(session){
 const state=executionSessions.get(session);
 if(!state||state.closed)throw Error('MOBILE_PAGED_EXECUTION_SESSION');
 try{if(P.devicePagedNowV3()>=state.binding.deadlineMs)throw Error('MOBILE_PAGED_EXECUTION_SESSION_EXPIRED');state.current();return state.binding;}catch(error){closeDevicePagedGraphExecutionSessionV3(session);throw error;}
}
export function signDevicePagedGraphSessionConsentV3(session,raw,rawCommand){
 const binding=readDevicePagedGraphExecutionSessionV3(session),state=executionSessions.get(session),consent=C.validateDevicePagedGraphConsentFreshV3(raw);
 if(JSON.stringify(consent.descriptor)!==JSON.stringify(binding.descriptor)||consent.rootId!==binding.rootId||consent.graphId!==binding.graphId||consent.authorizationRoot!==binding.authorizationRoot||consent.reserveNullifier!==binding.reserveNullifier||!(executionActions.has(consent.action)||consent.action==='START_AUTOMATION'&&binding.automation)||state.used.has(consent.challengeId)||state.used.size>=16384)throw Error('MOBILE_PAGED_EXECUTION_SESSION_SCOPE');
 if(binding.automation&&!automationSigningActions.has(consent.action))throw Error('MOBILE_PAGED_EXECUTION_SESSION_SCOPE');
 if(consent.action==='START_AUTOMATION'){if(state.started)throw Error('MOBILE_PAGED_EXECUTION_SESSION_SCOPE');const command=normalizeDevicePagedAutomationRequestV4(rawCommand);if(JSON.stringify(command)!==JSON.stringify(binding.automation)||bytesToHex(sha256(new TextEncoder().encode(JSON.stringify(command))))!==consent.commandSHA256)throw Error('MOBILE_PAGED_EXECUTION_SESSION_SCOPE');}
 const signature=signDevicePagedGraphConsentV3(state.key,consent);readDevicePagedGraphExecutionSessionV3(session);state.used.add(consent.challengeId);if(consent.action==='START_AUTOMATION')state.started=true;try{state.onAuthorized?.();}catch(error){closeDevicePagedGraphExecutionSessionV3(session);throw error;}return signature;
}

/** Read-only domain. Uses the exact reader reviewed by the same original
 * financial session; key bytes and financial permissions never cross it. */
export function signDevicePagedGraphAgentReadGrantV4(session){
 const binding=readDevicePagedGraphExecutionSessionV3(session),state=executionSessions.get(session);if(!binding.agentReadGrant||state.agentReaderSigned)throw Error('MOBILE_PAGED_EXECUTION_SESSION_SCOPE');let frame,signature;
 try{frame=L.devicePagedAgentReadGrantMessageAnyV5(binding.agentReadGrant);signature=secp256k1.sign(frame,state.key,{prehash:true,lowS:true});readDevicePagedGraphExecutionSessionV3(session);state.agentReaderSigned=true;state.onAuthorized?.();return Object.freeze({grant:binding.agentReadGrant,signature:bytesToHex(signature)});}catch(error){closeDevicePagedGraphExecutionSessionV3(session);throw error;}finally{frame?.fill(0);signature?.fill(0);}
}
