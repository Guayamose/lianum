import test from 'node:test';
import assert from 'node:assert/strict';
import {sameDeviceRecoveryCheckpointV1,verifyDeviceRecoveryCopyV1,reviewDeviceRecoveryPreparationV1} from '../src/custody/device-recovery-copy-gate-v1.ts';
const checkpoint=Object.freeze({rootId:'a'.repeat(64),noteRevision:1,descriptorSHA256:'b'.repeat(64),revision:2,recordSHA256:'c'.repeat(64)});
function fixture(kind='GRAPH'){
 let mutate=()=>{},after=checkpoint,checks=0,reviews=0,clears=0;const prepared={draft:{action:kind==='GRAPH'?'PROVE_U':'PROVE_D27'},witness:{}},selected={vault:{async recoveryCheckpoint(){mutate();return after;}}};let copy={selected,kind,prepared,checkpoint},current=prepared;
 const ports={readCopy:()=>copy,assertCurrent:(ticket,value)=>{assert.equal(ticket,1);assert.equal(value,selected);checks++;},readGraph:()=>kind==='GRAPH'?current:null,readShare:()=>kind==='SHARE'?current:null,
  reviewGraph:async(value,draft,ticket,witness)=>{assert.equal(kind,'GRAPH');assert.equal(value,selected);assert.equal(draft,prepared.draft);assert.equal(witness,prepared.witness);assert.equal(ticket,1);reviews++;},
  reviewShare:async(value,draft,ticket,witness)=>{assert.equal(kind,'SHARE');assert.equal(value,selected);assert.equal(draft,prepared.draft);assert.equal(witness,prepared.witness);assert.equal(ticket,1);reviews++;},clearPreparation:()=>{clears++;}};
 return{prepared,selected,ports,verify:()=>verifyDeviceRecoveryCopyV1(selected,kind,prepared.witness,1,ports),review:()=>reviewDeviceRecoveryPreparationV1(selected,1,ports),changeCheckpoint:value=>{after=value;},changeDuringRead:work=>{mutate=work;},replacePreparation:()=>{current={...prepared};},replaceCopy:()=>{copy={...copy};},counts:()=>({checks,reviews,clears})};
}
test('saved copy checks every encrypted checkpoint field before reviewing SHARE or GRAPH',async()=>{
 for(const kind of ['SHARE','GRAPH']){const f=fixture(kind);await f.verify();await f.review();assert.deepEqual(f.counts(),{checks:2,reviews:1,clears:1});}
 for(const name of Object.keys(checkpoint)){const f=fixture(),changed={...checkpoint,[name]:typeof checkpoint[name]==='number'?checkpoint[name]+1:'d'.repeat(64)};assert.equal(sameDeviceRecoveryCheckpointV1(checkpoint,changed),false);f.changeCheckpoint(changed);await assert.rejects(f.review(),/MOBILE_EXTERNAL_FLAT_RECOVERY_COPY_CHANGED/);assert.deepEqual(f.counts(),{checks:1,reviews:0,clears:0});}
});
test('saved copy preserves object identity across asynchronous checkpoint reads',async()=>{
 for(const action of ['replaceCopy','replacePreparation']){const f=fixture();f.changeDuringRead(()=>f[action]());await assert.rejects(f.review(),/MOBILE_EXTERNAL_FLAT_RECOVERY_COPY_CHANGED/);assert.deepEqual(f.counts(),{checks:1,reviews:0,clears:0});}
 const f=fixture();await assert.rejects(verifyDeviceRecoveryCopyV1({...f.selected},'GRAPH',f.prepared.witness,1,f.ports),/MOBILE_EXTERNAL_FLAT_RECOVERY_COPY_REQUIRED/);await assert.rejects(verifyDeviceRecoveryCopyV1(f.selected,'SHARE',f.prepared.witness,1,f.ports),/MOBILE_EXTERNAL_FLAT_RECOVERY_COPY_REQUIRED/);await assert.rejects(verifyDeviceRecoveryCopyV1(f.selected,'GRAPH',{...f.prepared.witness},1,f.ports),/MOBILE_EXTERNAL_FLAT_RECOVERY_COPY_REQUIRED/);assert.deepEqual(f.counts(),{checks:0,reviews:0,clears:0});
});
