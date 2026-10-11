/** Read-only reconciliation of authenticated SOURCE section data. These
 * transformations cannot issue a checkpoint request, account or actor. */
import assert from 'node:assert/strict';
import {types} from 'node:util';
import {exactRecord} from '@lianum/components/encoding/commitments';
import {normalizeOriginalAccountAccessV2,normalizeOriginalAccountReviewV2} from '@lianum/mobile-protocol/original-account-v2';
/** @param {unknown} value @param {string} code @returns {asserts value} */
function need(value,code){if(!value)throw Object.assign(new Error(code),{code});}
/** @typedef {null | boolean | number | string | {[key:string]: ActorFrame}} ActorFrame */
/** @param {unknown} value @param {readonly string[]} fields @returns {asserts value is Record<string,unknown>} */
export function originalActorExactV1(value, fields) {
  need(value && typeof value==='object' && !types.isProxy(value) && Object.getPrototypeOf(value) === Object.prototype,
    'MOBILE_ORIGINAL_ACTOR_FIELDS');
  const keys = Reflect.ownKeys(value);
  need(keys.length === fields.length && keys.every(key => typeof key==='string' && fields.includes(key))
    && fields.every(key => Object.hasOwn(Object.getOwnPropertyDescriptor(value, key) ?? {}, 'value')),
  'MOBILE_ORIGINAL_ACTOR_FIELDS');
}
// Only untrusted public frames are copied. Opaque constructor originals must
// retain their reference identity and never pass through this normalizer.
/** @param {unknown} value @returns {ActorFrame} */
export function originalActorFrameDataV1(value) {
  let nodes = 0, bytes = 0;
  /** @param {number} size */
  const budget = size => { bytes += size; need(bytes <= 8192, 'MOBILE_ORIGINAL_FRAME_DATA'); };
  /** @param {unknown} input @param {number} depth @returns {ActorFrame} */
  function copy(input, depth) {
    need(++nodes <= 192 && depth <= 6 && !types.isProxy(input), 'MOBILE_ORIGINAL_FRAME_DATA');
    if (input === null || typeof input === 'boolean') { budget(5); return input; }
    if (typeof input === 'number') {
      need(Number.isFinite(input), 'MOBILE_ORIGINAL_FRAME_DATA'); budget(32); return input;
    }
    if (typeof input === 'string') {
      need(input.length <= 512, 'MOBILE_ORIGINAL_FRAME_DATA'); budget(Buffer.byteLength(input, 'utf8')); return input;
    }
    need(input && typeof input === 'object' && Object.getPrototypeOf(input) === Object.prototype,
      'MOBILE_ORIGINAL_FRAME_DATA');
    const names = Reflect.ownKeys(input);
    need(names.length <= 40 && names.every(name => typeof name === 'string' && name.length <= 64),
      'MOBILE_ORIGINAL_FRAME_DATA');
    /** @type {[string,ActorFrame][]} */
    const entries = [];
    for (const name of names) {
      need(typeof name==='string','MOBILE_ORIGINAL_FRAME_DATA');
      const descriptor = Object.getOwnPropertyDescriptor(input, name);
      need(descriptor && Object.hasOwn(descriptor, 'value'), 'MOBILE_ORIGINAL_FRAME_DATA');
      budget(Buffer.byteLength(name, 'utf8')); entries.push([name, copy(descriptor.value, depth + 1)]);
    }
    return Object.fromEntries(entries);
  }
  return copy(value, 0);
}
/** @typedef {{revision:number,data:unknown}} AccountRecord */
/** @typedef {{readAccountRecord(directory:string,password:string):Promise<AccountRecord>,
 * hashRecord(record:AccountRecord):string, immutable<T>(value:T):T}} AccountCheckpointReaders */
/** @param {unknown} input @param {AccountCheckpointReaders} readers */
export async function reconcileNativeSourceAccountCheckpointDataV1(input,readers) {
  assert.equal(arguments.length,2);exactRecord(input,['identity','section','interruptedActor']);
  const {identity,section,interruptedActor}=input;
  assert.ok(identity&&typeof identity==='object'&&'sourceSHA256' in identity&&typeof identity.sourceSHA256==='string');
  exactRecord(section,['schema','sourceSHA256','ownedProcesses','confirmed','candidate']);
  assert.equal(section.schema,'ORIGINAL_NATIVE_SOURCE_ACCOUNT_SECTION_V1');
  assert.equal(section.sourceSHA256,identity.sourceSHA256);assert.deepEqual(section.ownedProcesses,[]);
  const retained=section.confirmed,candidate=section.candidate;
  assert.ok(retained&&typeof retained==='object','NATIVE_SOURCE_ORIGINAL_CHECKPOINT_IDENTITY');
  exactRecord(retained,['schema','sourceSHA256','poolIndex','directory','password','accountId','journalId','checkpointSHA256',
    'identitySHA256','accountIdentity','ownerIdentity','hasNativeExecution','manualMode','providerBindings',
    ...(Object.hasOwn(retained,'interruptedOperation')?['interruptedOperation']:[])]);
  assert.equal(retained.schema,'ORIGINAL_NATIVE_SOURCE_NOTE_ACCOUNT_SEED_V1');
  assert.equal(retained.sourceSHA256,identity.sourceSHA256);
  if(candidate===null){assert.equal(interruptedActor,true,'NATIVE_SOURCE_ORIGINAL_CHECKPOINT_KIND');}
  else {exactRecord(candidate,['kind','revision','checkpointSHA256']);
  assert.ok(typeof candidate.kind==='string'&&['ACCOUNT_CAS','ADMITTED_OPERATION'].includes(candidate.kind),'NATIVE_SOURCE_ORIGINAL_CHECKPOINT_KIND');
  assert.ok(typeof candidate.revision==='number'&&Number.isSafeInteger(candidate.revision)&&candidate.revision>=0,'NATIVE_SOURCE_ORIGINAL_CHECKPOINT_REVISION');
  assert.equal(typeof candidate.checkpointSHA256,'string');assert.ok(typeof candidate.checkpointSHA256==='string');assert.match(candidate.checkpointSHA256,/^[0-9a-f]{64}$/);}
  assert.ok(typeof retained.checkpointSHA256==='string'&&typeof retained.directory==='string'&&typeof retained.password==='string','NATIVE_SOURCE_ORIGINAL_CHECKPOINT_IDENTITY');
  assert.match(retained.checkpointSHA256,/^[0-9a-f]{64}$/);
  const record=await readers.readAccountRecord(retained.directory,retained.password);
  assert.ok(record.data&&typeof record.data==='object'&&'identitySHA256' in record.data&&'accountIdentity' in record.data,'NATIVE_SOURCE_ORIGINAL_CHECKPOINT_IDENTITY');
  assert.equal(record.data.identitySHA256,retained.identitySHA256,'NATIVE_SOURCE_ORIGINAL_CHECKPOINT_IDENTITY');
  assert.deepEqual(record.data.accountIdentity,retained.accountIdentity,'NATIVE_SOURCE_ORIGINAL_CHECKPOINT_IDENTITY');
  const actual=readers.hashRecord(record),isConfirmed=actual===retained.checkpointSHA256,isCandidate=candidate!==null&&actual===candidate.checkpointSHA256;
  assert.ok(isConfirmed||isCandidate,'NATIVE_SOURCE_ORIGINAL_CHECKPOINT_CHANGED');
  if(candidate===null)assert.ok(isConfirmed,'NATIVE_SOURCE_ORIGINAL_CHECKPOINT_CHANGED');
  else if(candidate.kind==='ACCOUNT_CAS'){assert.ok(typeof candidate.revision==='number','NATIVE_SOURCE_ORIGINAL_CHECKPOINT_REVISION');assert.equal(record.revision,isCandidate?candidate.revision:candidate.revision-1,
    'NATIVE_SOURCE_ORIGINAL_CHECKPOINT_REVISION');}
  else{assert.ok(isConfirmed&&isCandidate,'NATIVE_SOURCE_ORIGINAL_CHECKPOINT_CHANGED');
    assert.equal(record.revision,candidate.revision,'NATIVE_SOURCE_ORIGINAL_CHECKPOINT_REVISION');}
  assert.deepEqual(await readers.readAccountRecord(retained.directory,retained.password),record,'NATIVE_SOURCE_ORIGINAL_CHECKPOINT_READBACK');
  return readers.immutable({...section,confirmed:{...retained,checkpointSHA256:actual,interruptedOperation:true},candidate:null});
}

/** @param {unknown} input */
export function reconcileNativeSourceActorCheckpointDataV1(input){
 need(arguments.length===1,'NATIVE_SOURCE_ACTOR_ARGUMENTS');originalActorExactV1(input,['identity','section']);const {identity,section}=input;
 need(identity&&typeof identity==='object'&&'sourceSHA256' in identity&&typeof identity.sourceSHA256==='string','NATIVE_SOURCE_ACTOR_ORIGINAL_BINDING');
 originalActorExactV1(section,['schema','sourceSHA256','ownedProcesses','confirmed','candidate']);need(section.schema==='ORIGINAL_NATIVE_ACTOR_DURABLE_SOURCE_V1'&&section.sourceSHA256===identity.sourceSHA256,'NATIVE_SOURCE_ACTOR_ORIGINAL_BINDING');need(Array.isArray(section.ownedProcesses)&&section.ownedProcesses.length===0,'NATIVE_SOURCE_ACTOR_ORIGINAL_BINDING');
 originalActorExactV1(section.candidate,['kind','method']);need(section.candidate.kind==='ACTOR_PERMISSION_OR_OBSERVATION'&&typeof section.candidate.method==='string'&&['challenge','openReview','submit','privateStateChallenge','openPrivateStateReview','readPrivateState','deviceDepositSignedReadBindingV1','deviceDepositOriginalBinding'].includes(section.candidate.method),'NATIVE_SOURCE_ACTOR_ORIGINAL_INTERRUPTION');
 const seed=section.confirmed;originalActorExactV1(seed,['schema','origin','pairingId','devicePublicKey','initial','challenges']);need(seed.schema==='ORIGINAL_NATIVE_ACTOR_SOURCE_SEED_V1','NATIVE_SOURCE_ACTOR_ORIGINAL_BINDING');originalActorExactV1(seed.challenges,['accesses','reviews','stateAccesses','stateReviews']);
 /** @type {Record<string,{id:unknown,value:unknown,consumed:boolean}[]>} */
 const challenges={};const normalizers={accesses:normalizeOriginalAccountAccessV2,reviews:normalizeOriginalAccountReviewV2,stateAccesses:normalizeOriginalAccountAccessV2,stateReviews:normalizeOriginalAccountReviewV2};
 for(const [name,normalize] of Object.entries(normalizers)){const seen=new Set(),rows=seed.challenges[name];need(Array.isArray(rows)&&rows.length<=4,'MOBILE_ORIGINAL_RECOVERED_CHALLENGES_INVALID');challenges[name]=rows.map(row=>{originalActorExactV1(row,['id','value','consumed']);const value=normalize(originalActorFrameDataV1(row.value));need(row.id===value.challengeId&&!seen.has(row.id)&&typeof row.consumed==='boolean'&&value.origin===seed.origin&&value.pairingId===seed.pairingId&&value.devicePublicKey===seed.devicePublicKey,'MOBILE_ORIGINAL_RECOVERED_CHALLENGE_CHANGED');seen.add(row.id);return{id:row.id,value:structuredClone(row.value),consumed:true};});}
 return{...section,confirmed:{...structuredClone(seed),challenges},candidate:null};
}
