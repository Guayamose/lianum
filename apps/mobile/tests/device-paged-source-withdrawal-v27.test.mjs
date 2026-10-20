/** Controller ports only. The real custody/Authority/OWNER/Source path is
 * exercised by device-paged-warm-proof-intent-recovery-v10.test.mjs. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {runDevicePagedSourceWithdrawalV27} from '../src/screens/device-paged-source-withdrawal-v27.mjs';
import {createDevicePagedOwnerApiV3} from '../src/api/device-paged-owner-api-v3.mjs';
import {descriptor as hostDescriptor} from '../../../packages/backend/tests/providers/fixtures/paged-mixed-host-v7.mjs';
import * as P from '../../../packages/mobile-protocol/src/device-paged-owner-v3.mjs';
const recipient='0x'+'9'.repeat(40),words=Array(39).fill('0');words[16]='1';words[33]='25';words.fill(String(0x99999999),34);
const draft={action:'PROVE_W39',jobId:'paged-w39-host-v27',rootId:'a'.repeat(64),revision:1,mode:'withdraw',publicInputs:words,witnessSHA256:'b'.repeat(64),authorizationRoot:null,reserveNullifier:null,previousCommitment:null,nextCommitment:null,proofSHA256:null};
let hostFrameSequence=0;
function fixture({initial=null,lose=null,cancel=false,changeAfterReview=false,expireDuringApproval=false,sessionLoss=false,brandReads=false,closeStatusDuringApproval=false,rejectProofChallenge=false}={}){
 let job=initial?{...draft,stage:initial,proofSHA256:'c'.repeat(64),errorCode:null}:null,reviewed=false,epoch='1',live=true;
 const calls=[],secret={privateBytes:[1,2,3]},signal=new AbortController().signal,sdkClients=[];
 const status=()=>({epoch,jobs:job?[structuredClone(job)]:[],note:{state:job?.stage==='CONFIRMED'?'SPENT':'LIVE',commitment:changeAfterReview&&reviewed?'changed':'c'.repeat(64),nullifier:'d'.repeat(64),amount:job?.stage==='CONFIRMED'?null:'25'}});
 async function readStatus(){
  const value=status();if(!brandReads||job)return value;
  // Real SDK branding over an inert HTTP port. No network, custody or proof.
  const frame=++hostFrameSequence;
  const sdk=createDevicePagedOwnerApiV3({descriptor:hostDescriptor,fetchImpl:async(url,options)=>{
   const now=Date.now();if(url.endsWith('/challenges'))return Response.json({...JSON.parse(options.body),version:3,profile:P.DEVICE_PAGED_OWNER_V3,descriptor:hostDescriptor,challengeId:'host-withdraw-status-'+frame,nonce:'b'.repeat(64),recipient:null,issuedAt:now,expiresAt:now+300000});
   return Response.json({...value,profile:P.DEVICE_PAGED_OWNER_V3,descriptor:hostDescriptor,issuedAt:now,expiresAt:now+120000,blockHash:'0x'+frame.toString(16).padStart(64,'0'),blockNumber:'1',note:{...value.note,available:'25',path:{root:'f'.repeat(64),index:'0',siblings:Array(8).fill('0'.repeat(64))}}});
  }});sdkClients.push(sdk);
  const consent=await sdk.challenge({...draft,action:'READ_STATE',mode:null,publicInputs:null,witnessSHA256:null}),result=await sdk.submit(consent,'0'.repeat(128));return brandReads==='copy'?structuredClone(result):result;
 }
 const close=()=>Promise.all(sdkClients.map(api=>api.close()));
 const f={calls,secret,close,get job(){return job;},input:{descriptor:brandReads?hostDescriptor:{},signal,recipient:initial?null:recipient,assertCurrent:()=>{assert.ok(live,'SESSION_CLOSED');},sign:async(c,approval)=>{if(!['READ_STATE','OBSERVE_JOB'].includes(c.action))assert.ok(approval);return'HOST_SIGNATURE';},
  vault:{beginReadStorage:async()=>{},endReadStorage(){},readDraft:async()=>({action:'READ_STATE'}),acceptStatus:async()=>{},acceptRow:async()=>{},resumePreparedWithdrawalV10:async()=>null,prepareWithdrawal:async()=>{calls.push('PREPARE');return{draft:structuredClone(draft),witness:secret};},prearmDraft:async()=>({}),consumeArm:async()=>{},effectDraft:async(action,jobId)=>({action,jobId})},
  api:{challenge:async d=>{if(sessionLoss&&d.action==='WITHDRAW_W39')live=false;if(rejectProofChallenge&&d.action==='PROVE_W39')throw Error('PAGED_DEVICE_NOTE_EPOCH_CHANGED');return d;},submit:async(c)=>{calls.push(c.action);if(c.action==='READ_STATE')return readStatus();if(c.action==='PROVE_W39')job={...draft,stage:'PROVED',proofSHA256:'c'.repeat(64)};if(c.action==='WITHDRAW_W39')job={...job,stage:'CONFIRMED'};if(c.action===lose)throw Error('HOST_LOST_REPLY');return structuredClone(job);}},
  review:async()=>{calls.push('REVIEW');reviewed=true;if(cancel)throw Error('REVIEW_CANCELLED');},authorization:{approve:async()=>{calls.push('APPROVE');if(expireDuringApproval)epoch='2';if(closeStatusDuringApproval)await close();return{};},bind(){calls.push('BIND');},close(){calls.push('CLOSE_APPROVAL');}}}};
 return f;
}
test('fresh review and biometric precede the original proof and one withdrawal',async()=>{
 const f=fixture(),result=await runDevicePagedSourceWithdrawalV27(f.input);assert.equal(result.state,'CONFIRMED');assert.equal(result.recipient,recipient);assert.equal(result.amount,'25');
 assert.equal(f.calls.filter(x=>x==='PROVE_W39').length,1);assert.equal(f.calls.filter(x=>x==='WITHDRAW_W39').length,1);
 assert.ok(f.calls.indexOf('REVIEW')<f.calls.indexOf('PREPARE'));assert.ok(f.calls.indexOf('APPROVE')<f.calls.indexOf('PROVE_W39'));assert.equal(f.calls.at(-1),'CLOSE_APPROVAL');assert.equal(f.secret.privateBytes,null);
});
test('lost proof or send reply preserves pending state and never blindly retries',async()=>{
 for(const action of ['PROVE_W39','WITHDRAW_W39']){const f=fixture({lose:action}),result=await runDevicePagedSourceWithdrawalV27(f.input);assert.equal(result.state,'PENDING');assert.equal(f.calls.filter(x=>x===action).length,1);assert.equal(f.calls.at(-1),'CLOSE_APPROVAL');if(action==='PROVE_W39')assert.ok(!f.calls.includes('WITHDRAW_W39'));}
});
test('an already confirmed withdrawal only reads; unresolved jobs only observe',async()=>{
 for(const initial of ['CONFIRMED','UNKNOWN','PROVING']){const f=fixture({initial}),result=await runDevicePagedSourceWithdrawalV27(f.input);assert.equal(result.state,initial==='CONFIRMED'?'CONFIRMED':'PENDING');assert.ok(!f.calls.includes('APPROVE'));assert.ok(!f.calls.includes('PROVE_W39'));assert.ok(!f.calls.includes('WITHDRAW_W39'));}
});
test('a proved job resumes the same effect after a new review and approval',async()=>{
 const f=fixture({initial:'PROVED'});assert.equal((await runDevicePagedSourceWithdrawalV27(f.input)).state,'CONFIRMED');assert.ok(!f.calls.includes('PREPARE'));assert.ok(!f.calls.includes('PROVE_W39'));assert.equal(f.calls.filter(x=>x==='WITHDRAW_W39').length,1);
});
test('cancelled review, changed source, expired epoch and locked session cannot send',async()=>{
 for(const options of [{cancel:true},{changeAfterReview:true},{expireDuringApproval:true},{sessionLoss:true}]){const f=fixture(options);await assert.rejects(runDevicePagedSourceWithdrawalV27(f.input));assert.ok(!f.calls.includes('WITHDRAW_W39'));if(!options.sessionLoss)assert.ok(!f.calls.includes('PROVE_W39'));}
});
test('a fresh SDK post-review observation avoids the duplicate read after approval',async()=>{
 const f=fixture({brandReads:true});try{
  assert.equal((await runDevicePagedSourceWithdrawalV27(f.input)).state,'CONFIRMED');
  assert.equal(f.calls.filter(x=>x==='READ_STATE').length,3);
  assert.equal(f.calls.filter(x=>x==='APPROVE').length,1);
  assert.equal(f.calls.filter(x=>x==='WITHDRAW_W39').length,1);
 }finally{await f.close();}
});
test('copied observations cannot skip the approval-time read',async()=>{
 const f=fixture({brandReads:'copy'});try{
  assert.equal((await runDevicePagedSourceWithdrawalV27(f.input)).state,'CONFIRMED');
  assert.equal(f.calls.filter(x=>x==='READ_STATE').length,4);
 }finally{await f.close();}
});
test('closed SDK observations are read again and a changed epoch cannot prove or send',async()=>{
 const f=fixture({brandReads:true,closeStatusDuringApproval:true,expireDuringApproval:true});try{
  await assert.rejects(runDevicePagedSourceWithdrawalV27(f.input),/MOBILE_PAGED_NOTE_EPOCH_CHANGED/);
  assert.equal(f.calls.filter(x=>x==='READ_STATE').length,3);
  assert.ok(!f.calls.includes('PROVE_W39'));assert.ok(!f.calls.includes('WITHDRAW_W39'));
 }finally{await f.close();}
});
test('reusing an observation never bypasses the fresh server proof challenge',async()=>{
 const f=fixture({brandReads:true,rejectProofChallenge:true});try{
  await assert.rejects(runDevicePagedSourceWithdrawalV27(f.input),/PAGED_DEVICE_NOTE_EPOCH_CHANGED/);
  assert.ok(!f.calls.includes('PROVE_W39'));assert.ok(!f.calls.includes('WITHDRAW_W39'));
  assert.equal(f.calls.at(-1),'CLOSE_APPROVAL');
 }finally{await f.close();}
});
