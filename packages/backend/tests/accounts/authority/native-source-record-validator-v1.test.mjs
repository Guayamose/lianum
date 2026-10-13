/** Original SOURCE frame admission through the complete pure validator. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {join} from 'node:path';
import {createNativeSourceRecordValidatorV1,ORIGINAL_NATIVE_SOURCE_PROFILE_V1} from '../../../src/operations/recovery/source-journal/record-validator-v1.mjs';
const base='/tmp/source-record-validation',runId='12345678-1234-4123-8123-123456789abc';
const codec=createNativeSourceRecordValidatorV1(base);
const identity={profile:ORIGINAL_NATIVE_SOURCE_PROFILE_V1,directory:join(base,'realms','realm-'+runId),runId,sourceSHA256:'ab'.repeat(32),deadlineMs:123456};
const proc={pid:123,startTicks:'123',uid:process.getuid(),pgrp:123,session:123};
const pin={path:'receiver-confirmed-0.aead',bytes:100,sha256:'ab'.repeat(32),stateSHA256:'cd'.repeat(32),generation:0,genesis:'ef'.repeat(32),head:{number:'1'}};
function frame(){return {revision:0,data:{schema:'ORIGINAL_NATIVE_SOURCE_CAPSULE_V1',identity:structuredClone(identity),phase:'CONFIRMED',generation:0,creator:{...proc},sections:Object.fromEntries(codec.SECTIONS.map(name=>[name,null])),native:{receiver:{pending:null,confirmed:{...pin}},graphNative:null},clockSecond:'1'}};}

test('SOURCE validator accepts original confirmed and candidate frames without storage or runtime authority',()=>{
 const original=frame(),before=structuredClone(original);codec.validate(original,identity);assert.deepEqual(original,before);
 const candidate=frame();candidate.data.native.receiver.pending=1;candidate.data.native.receiver.candidate={revision:1,confirmed:{...pin,path:'receiver-confirmed-1.aead'}};codec.validate(candidate,identity);
 original.data.sections.actor={schema:codec.SECTION_SCHEMAS.actor,sourceSHA256:identity.sourceSHA256,ownedProcesses:[proc],confirmed:{schema:'actor'},candidate:null};codec.validate(original,identity);
});

test('SOURCE validator rejects identity, revision, native path and candidate lineage substitutions',()=>{
 for(const change of [r=>r.revision=-1,r=>r.data.identity.sourceSHA256='ff'.repeat(32),r=>r.data.generation=16,r=>r.data.clockSecond='1\n',r=>r.data.native.receiver.confirmed.path='../receiver-confirmed.aead',r=>r.data.native.receiver.confirmed.bytes=64*1024*1024+1,r=>r.data.creator.uid=-1,r=>r.data.sections.actor={schema:'wrong',sourceSHA256:identity.sourceSHA256,ownedProcesses:[],confirmed:{},candidate:null}]) {
  const value=frame();change(value);assert.throws(()=>codec.validate(value,identity));
 }
 for(const revision of [0,2]){const value=frame();value.data.native.receiver.pending=1;value.data.native.receiver.candidate={revision,confirmed:{...pin,path:'receiver-confirmed-1.aead'}};assert.throws(()=>codec.validate(value,identity),/ORIGINAL_NATIVE_CANDIDATE/);}
 const sameSlot=frame();sameSlot.data.native.receiver.pending=1;sameSlot.data.native.receiver.candidate={revision:1,confirmed:{...pin}};assert.throws(()=>codec.validate(sameSlot,identity),/ORIGINAL_NATIVE_CANDIDATE/);
});
