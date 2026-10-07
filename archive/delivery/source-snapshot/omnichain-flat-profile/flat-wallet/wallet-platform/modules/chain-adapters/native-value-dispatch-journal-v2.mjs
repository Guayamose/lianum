/** Append-only pure control-flow codec. Replaying a JSON history does NOT
 * authenticate its origin. Only the original encrypted CAS owner may supply it.
 * There is deliberately no RESET, replacement, fee-bump or resend transition. */
import assert from 'node:assert/strict';
import { createPublicKey, verify } from 'node:crypto';
import { exactRecord, bytes32, validateStruct } from '../paeg/commitments.mjs';
import { cloneInput, frozenInput, inputUint, readyDescriptorWords } from '../paeg/readiness-inputs.mjs';
import { joinReadiness } from '../paeg/statements.mjs';
import { normalizeNativeValueDispatchBinding, nativeValueBindingDigest, equal, assertNativeValuePrepared, assertNativeValueSigned, normalizeOriginalNativeValueEvmPreparation, normalizeOriginalNativeValueTronPreparation, selectedNativeValueProfile } from './native-value-dispatch-binding-v2.mjs';
import { PROFILE_SCHEMA as EVM_SCHEMA } from './evm-native-value-v2.mjs';
import { nativeTransferActionCommitment } from '../../../../../omnichain-product/src/paeg/native-capsules.mjs';
import { nativeDispatchStatementFrame, nativeReadyStatementDigest } from '../../../../../omnichain-product/src/paeg/native-admission.mjs';
export const JOURNAL_SCHEMA='LIANUM_NATIVE_VALUE_APPEND_ONLY_DISPATCH_JOURNAL_V2';
export const MAX_DISPATCH_EVENTS=128;
const clone=cloneInput,freeze=frozenInput;
const ORDER=0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
export function assertNativeValueRetainedIntent(b,raw) {
  const i=clone(raw);exactRecord(i,['dependency','ready','readinessOpening','action','deliveryRiskSalt','readyStatement','dependencyProofSHA256','readyProofSHA256','leaseId']);
  joinReadiness(i.dependency,i.ready);exactRecord(i.readinessOpening,['domain','descriptor','readinessBlind']);
  equal(i.readinessOpening.domain,b.domain);equal(i.action,b.quote.action);assert.equal(i.deliveryRiskSalt,b.quote.deliveryRiskSalt);assert.equal(i.leaseId,b.leaseId);
  const d=validateStruct('ready',i.readinessOpening.descriptor);bytes32(i.readinessOpening.readinessBlind,true);
  for(const k of ['scope','policy','asset','hubDomain','registryCommitment'])assert.equal(d[k],b.domain[k]);
  assert.equal(d.snapshotDigest,i.ready.checkpoint);assert.equal(d.readyFrom,i.ready.readyFrom);assert.equal(d.readyUntil,i.ready.readyUntil);
  assert.equal(d.payoutCommitment,b.quote.payoutCommitment);assert.equal(d.chainDomain,i.action.chainDomain);assert.equal(d.evidencePolicy,b.profileCommitment);
  bytes32(d.localCommitment,true);bytes32(d.dispatchId,true);assert.equal(d.actionCommitment,nativeTransferActionCommitment(i.action));
  assert.equal(i.readyStatement,nativeReadyStatementDigest([...readyDescriptorWords(d)]));
  bytes32(i.dependencyProofSHA256,true);bytes32(i.readyProofSHA256,true);
  assert.ok(inputUint(i.action.executionFrom)<=inputUint(i.ready.readyFrom)&&inputUint(i.ready.readyFrom)<inputUint(i.ready.readyUntil)
    &&inputUint(i.ready.readyUntil)<=inputUint(i.action.executionUntil)&&inputUint(i.ready.readyUntil)<=inputUint(i.action.settleBefore));return freeze(i);
}
export function nativeValueDispatchStatement(binding,intent,signed,signedAt) {
  return freeze({hubDomain:binding.domain.hubDomain,registryCommitment:binding.domain.registryCommitment,readyStatement:intent.readyStatement,
    localCommitment:intent.readinessOpening.descriptor.localCommitment,dispatchId:intent.readinessOpening.descriptor.dispatchId,
    actionCommitment:intent.readinessOpening.descriptor.actionCommitment,globalEffectId:signed.nativeGid,
    deliveryRiskCommitment:intent.action.deliveryRiskCommitment,signedAt});
}
function signature(key,frame,sig){assert.equal(typeof sig,'string');assert.match(sig,/^[0-9a-f]{128}$/);
 const r=BigInt('0x'+sig.slice(0,64)),s=BigInt('0x'+sig.slice(64));assert.ok(r>0n&&r<ORDER&&s>0n&&s<=ORDER/2n,'NATIVE_VALUE_DISPATCH_PROVIDER_LOW_S');
 const point=createPublicKey({format:'jwk',key:{kty:'EC',crv:'secp256k1',x:Buffer.from(key.x,'hex').toString('base64url'),y:Buffer.from(key.y,'hex').toString('base64url')}});
 assert.ok(verify('sha256',nativeDispatchStatementFrame(frame),{key:point,dsaEncoding:'ieee-p1363'},Buffer.from(sig,'hex')),'NATIVE_VALUE_DISPATCH_PROVIDER_SIGNATURE');}
function event(b,s,event){exactRecord(event,['kind','data']);const v=event.data,phase=s.phase;
 const atPhase=(...phases)=>assert.ok(phases.includes(phase),'NATIVE_VALUE_DISPATCH_EVENT_ORDER');
 switch(event.kind){
 case 'CURRENT_CHECKED':atPhase('BOUND','INTENT','PREPARED','NATIVE_KEY_PENDING','NATIVE_SIGNED','PROVIDER_KEY_PENDING','ATTESTED','SEND_PENDING');
   exactRecord(v,['head']);exactRecord(v.head,['number','hash','timestamp']);inputUint(v.head.number);bytes32(v.head.hash,true);inputUint(v.head.timestamp);
   assert.ok(BigInt(v.head.timestamp)>=BigInt(s.lastTimestamp),'NATIVE_VALUE_DISPATCH_CLOCK_ROLLBACK');s.lastTimestamp=v.head.timestamp;s.lastHead=clone(v.head);break;
 case 'INTENT':atPhase('BOUND');s.intent=assertNativeValueRetainedIntent(b,v);s.phase='INTENT';break;
 case 'PREPARED':atPhase('INTENT');exactRecord(v,['prepared','originalPreparation']);s.prepared=assertNativeValuePrepared(b,v.prepared);
   equal(s.prepared,(selectedNativeValueProfile(b).schema===EVM_SCHEMA?normalizeOriginalNativeValueEvmPreparation:normalizeOriginalNativeValueTronPreparation)(b,s.intent,v.originalPreparation));s.originalPreparation=clone(v.originalPreparation);s.phase='PREPARED';break;
 case 'NATIVE_KEY_PENDING':atPhase('PREPARED');assert.equal(v,null);s.nativeKeyStarted=true;s.phase='NATIVE_KEY_PENDING';break;
 case 'NATIVE_SIGNED':atPhase('NATIVE_KEY_PENDING');exactRecord(v,['signed','admissionNullifier','signedAt']);
   equal(v.signed,assertNativeValueSigned(b,s.prepared,{nativeWire:v.signed.nativeWire}));bytes32(v.admissionNullifier,true);inputUint(v.signedAt);
   assert.ok(BigInt(s.intent.ready.readyFrom)<=BigInt(v.signedAt)&&BigInt(v.signedAt)<BigInt(s.intent.ready.readyUntil),'NATIVE_VALUE_DISPATCH_SIGNED_WINDOW');
   s.signed=clone(v.signed);s.admissionNullifier=v.admissionNullifier;s.signedAt=v.signedAt;s.phase='NATIVE_SIGNED';break;
 case 'PROVIDER_KEY_PENDING':atPhase('NATIVE_SIGNED');equal(v,nativeValueDispatchStatement(b,s.intent,s.signed,s.signedAt));s.dispatchStatement=clone(v);s.providerKeyStarted=true;s.phase='PROVIDER_KEY_PENDING';break;
 case 'ATTESTED':atPhase('PROVIDER_KEY_PENDING');exactRecord(v,['signature']);signature(b.providerKey,s.dispatchStatement,v.signature);s.dispatchSignature=v.signature;s.phase='ATTESTED';break;
 case 'SEND_PENDING':atPhase('ATTESTED');assert.equal(v,null);s.sendStarted=true;s.phase='SEND_PENDING';break;
 case 'BROADCAST':atPhase('SEND_PENDING');exactRecord(v,['nativeId','transactionSHA256']);assert.equal(v.nativeId,s.signed.nativeId);assert.equal(v.transactionSHA256,s.signed.transactionSHA256);s.phase='BROADCAST';break;
 case 'UNKNOWN':assert.ok(!['BOUND','ADVERSE'].includes(phase),'NATIVE_VALUE_DISPATCH_UNKNOWN_ORDER');exactRecord(v,['stage']);
   assert.ok(['preparation','native-key','provider-key','send','persistence','reconciliation'].includes(v.stage));s.phase='UNKNOWN';s.failures.push(clone(v));break;
 case 'OBSERVATION':assert.ok(s.signed&&phase!=='ADVERSE','NATIVE_VALUE_DISPATCH_NO_ORIGINAL_TO_RECONCILE');
   exactRecord(v,['status','nativeId','nativeWire']);assert.equal(v.nativeId,s.signed.nativeId,'NATIVE_VALUE_DISPATCH_ORIGINAL_IDENTITY');
   assert.ok(['observed','pending','unknown','unavailable','adverse'].includes(v.status),'NATIVE_VALUE_DISPATCH_OBSERVATION_STATUS');
   if(v.status==='observed'){assert.equal(v.nativeWire,s.signed.nativeWire,'NATIVE_VALUE_DISPATCH_ORIGINAL_WIRE');s.phase='OBSERVED';}
   else{assert.equal(v.nativeWire,null);s.phase=v.status==='adverse'?'ADVERSE':'UNKNOWN';}
   s.observation=clone(v);break;
 default:throw new Error('NATIVE_VALUE_DISPATCH_EVENT_DENIED');
 }
 return s;
}
export function createNativeValueDispatchJournal(rawBinding){return freeze({schema:JOURNAL_SCHEMA,bindingDigest:nativeValueBindingDigest(rawBinding),events:[]});}
export function readNativeValueDispatchJournal(rawBinding,raw){const b=normalizeNativeValueDispatchBinding(rawBinding),j=clone(raw);
 exactRecord(j,['schema','bindingDigest','events']);assert.equal(j.schema,JOURNAL_SCHEMA);assert.equal(j.bindingDigest,nativeValueBindingDigest(b));
 assert.ok(Array.isArray(j.events)&&j.events.length<=MAX_DISPATCH_EVENTS,'NATIVE_VALUE_DISPATCH_HISTORY_CAPACITY');
 let s={phase:'BOUND',intent:null,prepared:null,originalPreparation:null,signed:null,admissionNullifier:null,signedAt:null,dispatchStatement:null,dispatchSignature:null,observation:null,
   lastTimestamp:'0',lastHead:null,nativeKeyStarted:false,providerKeyStarted:false,sendStarted:false,failures:[]};for(const e of j.events)s=event(b,s,e);return freeze(s);}
export function appendNativeValueDispatchEvent(binding,raw,kind,data){const j=clone(raw);readNativeValueDispatchJournal(binding,j);
 assert.ok(j.events.length<MAX_DISPATCH_EVENTS,'NATIVE_VALUE_DISPATCH_HISTORY_CAPACITY');j.events.push({kind,data:clone(data)});readNativeValueDispatchJournal(binding,j);return freeze(j);}
