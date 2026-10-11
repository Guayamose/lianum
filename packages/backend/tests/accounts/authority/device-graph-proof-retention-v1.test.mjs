/** Actual verification/durable-record mechanisms with fixed proof and chain
 * ports. No consent, prover ownership or financial acceptance is fabricated. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,lstat} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {Vault} from '@lianum/engine/crypto/vault';
import {canonical} from '@lianum/engine/crypto/privacy';
import {proveDeviceGraphOutputWitnessV1,provePrivateDeviceGraphOutputV1} from '../../../src/accounts/authority/device-graph-output-proof-work-v1.mjs';
import * as P from '@lianum/mobile-protocol/device/source-note-v1';
import {retainVerifiedDeviceGraphOutputV1,snapshotDeviceGraphRetentionV1,saveDeviceGraphJournalV1,verifyDeviceGraphRetainedCheckpointV1,serializeDeviceGraphProofFramesV1} from '../../../src/accounts/authority/device-graph-proof-retention-v1.mjs';
const h=value=>createHash('sha256').update(value).digest('hex'),copy=value=>JSON.parse(canonical(value)),sha=value=>h(Buffer.from(canonical(value)));
async function fixture(t,encoding,{empty=false}={}){
 const directory=await mkdtemp(join(tmpdir(),'graph-proof-retention-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 const file=join(directory,'operations.vault'),vault=new Vault(file),password='HOST_SYNTHETIC_GRAPH_PASSWORD',role='change',proofs=[],identity={profile:'HOST_RETENTION_DATA'},frames=[];
 let record=await vault.create({withdrawals:empty?[]:[{noteRole:role,stage:'PROVING',proof:null}]},password);
 const retainedVault=new Vault(join(directory,'retention.vault')),retainedPassword='HOST_SYNTHETIC_RETENTION_PASSWORD';let retained=await retainedVault.create({},retainedPassword);
 const seed=()=>snapshotDeviceGraphRetentionV1({directory,file,password,record,preparation:null,invoiceSignatures:null,proposal:null,proofs},{copy});
 async function persist(candidate=null){frames.push(candidate?'candidate':'confirmed');retained=await retainedVault.update(retainedPassword,retained.revision,()=>({schema:'DEVICE_EXTERNAL_FLAT_GRAPH_DURABLE_V1',confirmed:seed(),candidate}));assert.deepEqual(await retainedVault.read(retainedPassword),retained);}
 const physical=async()=>{for(const path of [directory,file]){const value=await lstat(path);assert.ok(!value.isSymbolicLink());assert.equal(value.mode&0o777,path===directory?0o700:0o600);}};
 const save=change=>saveDeviceGraphJournalV1(change,{current:()=>record,copy,healthy:async()=>{assert.deepEqual(await vault.read(password),record);await physical();},persist,update:async(revision,data)=>{frames.push('CAS');assert.equal((await retainedVault.read(retainedPassword)).data.candidate.revision,revision+1);assert.equal(JSON.parse((await retainedVault.read(retainedPassword)).data.confirmed.proofFrames).length,proofs.length);return vault.update(password,revision,()=>data);},read:()=>vault.read(password),physical,accept:value=>{record=value;}});
 const view={head:{timestamp:'600'},header:{number:'0x1'}},counts={verified:0,reads:0},result={proof:encoding==='binary'?Buffer.from('ab'.repeat(64),'hex'):'ab'.repeat(64),publicInputs:['1','2','3'],metrics:{acceptedResult:true,explicitInertHost:true}},controls={verify:true,epoch:'600',accepted:true,inputs:['1','2','3']};
 const ports={async currentOutputs(){counts.reads++;return{...view,head:{timestamp:controls.epoch}};},originalOutput(v,r){assert.equal(r,role);assert.equal(v.header,view.header);},async verify(relation,proof,inputs,block){counts.verified++;assert.equal(relation,'withdraw_balance');assert.equal(proof.toString('hex'),'ab'.repeat(64));assert.deepEqual(inputs,['1','2','3'].map(x=>'0x'+x.padStart(64,'0')));assert.equal(block,'0x1');return controls.verify;},async assertCurrent(v){assert.equal(v.header,view.header);},appendProof(frame){frames.push('proof');proofs.push(frame);},async updateOutput(selected,fields){assert.equal(selected,role);await save(data=>({...data,withdrawals:data.withdrawals.map(row=>row.noteRole===role?{...row,...fields}:row)}));},publicOutput:()=>structuredClone(record.data.withdrawals[0])};
 const checkpoint=async()=>verifyDeviceGraphRetainedCheckpointV1(seed(),(await retainedVault.read(retainedPassword)).data,identity,{copy,sha});
 await persist();frames.length=0;
 return{save,result,controls,ports,counts,proofs,frames,seed,checkpoint,vault,password,retainedVault,retainedPassword,read:()=>vault.read(password),retained:()=>retainedVault.read(retainedPassword),async tamper(change){retained=await retainedVault.update(retainedPassword,retained.revision,change);}};
}

test('HOST graph output accepted metadata precedes physical CAS and the confirmed SOURCE checkpoint',async t=>{
 for(const encoding of ['binary','hex'])await t.test(encoding,async t=>{
  const f=await fixture(t,encoding),row=await retainVerifiedDeviceGraphOutputV1({role:'change',epoch:'1',result:f.result,expectedPublicInputs:['1','2','3']},f.ports);
  assert.equal(row.stage,'PROVED');assert.equal(f.proofs.length,1);assert.deepEqual(f.frames,['proof','candidate','CAS','confirmed']);assert.equal(f.counts.verified,1);
  const retained=await f.retained();assert.equal(retained.data.candidate,null);assert.equal(retained.data.confirmed.record.data.withdrawals[0].stage,'PROVED');const frames=JSON.parse(retained.data.confirmed.proofFrames);assert.equal(frames.length,1);assert.equal(frames[0].result.proof,'ab'.repeat(64));assert.equal(frames[0].result.metrics.explicitInertHost,true);assert.equal(retained.data.confirmed.proofFramesSHA256,h(Buffer.from(retained.data.confirmed.proofFrames)));
  assert.deepEqual(retained.data.confirmed,f.seed());assert.ok(await f.checkpoint());assert.deepEqual(await f.checkpoint(),await f.checkpoint());
  await f.tamper(data=>({...data,confirmed:{...data.confirmed,proofFrames:'[]'}}));await assert.rejects(f.checkpoint(),/DEVICE_EXTERNAL_GRAPH_SOURCE_CHECKPOINT/);assert.equal(f.proofs.length,1);
 });
});

test('HOST graph output verifier, inputs, epoch and pending retention reject before acceptance',async t=>{
 const f=await fixture(t,'hex'),input={role:'change',epoch:'1',result:f.result,expectedPublicInputs:['1','2','3']},before=await f.read();
 await assert.rejects(retainVerifiedDeviceGraphOutputV1({...input,result:{...f.result,metrics:{acceptedResult:false}}},f.ports),/DEVICE_EXTERNAL_GRAPH_OUTPUT_PROOF_REJECTED/);
 await assert.rejects(retainVerifiedDeviceGraphOutputV1({...input,expectedPublicInputs:['9']},f.ports));
 f.controls.epoch='1200';await assert.rejects(retainVerifiedDeviceGraphOutputV1(input,f.ports),/DEVICE_EXTERNAL_GRAPH_OUTPUT_EPOCH/);f.controls.epoch='600';
 f.controls.verify=false;await assert.rejects(retainVerifiedDeviceGraphOutputV1(input,f.ports),/DEVICE_EXTERNAL_GRAPH_OUTPUT_DEPLOYED_VERIFIER/);
 assert.equal(f.proofs.length,0);assert.deepEqual(f.frames,[]);assert.deepEqual(await f.read(),before);
 await f.tamper(data=>({...data,candidate:{revision:1}}));await assert.rejects(f.checkpoint(),/DEVICE_EXTERNAL_GRAPH_SOURCE_PENDING/);
 assert.throws(()=>serializeDeviceGraphProofFramesV1([{result:{}}]),/DEVICE_EXTERNAL_GRAPH_ORIGINAL_PROOF_METADATA/);
 assert.throws(()=>serializeDeviceGraphProofFramesV1([{result:{proof:'a'.repeat(2097153)}}]),/DEVICE_EXTERNAL_GRAPH_METADATA_BOUND/);
});

test('HOST graph journal refuses a changed physical CAS without replacing confirmed retention',async t=>{
 const f=await fixture(t,'hex'),before=await f.read(),retained=await f.retained();await f.vault.update(f.password,before.revision,data=>({...data,foreign:true}));
 await assert.rejects(retainVerifiedDeviceGraphOutputV1({role:'change',epoch:'1',result:f.result,expectedPublicInputs:['1','2','3']},f.ports));
 assert.deepEqual(await f.retained(),retained);assert.equal((await f.read()).data.foreign,true);
});

test('HOST ordinary and private graph proof work close their producer after durable SOURCE metadata',async t=>{
 for(const kind of ['ordinary','private'])await t.test(kind,async t=>{
  const f=await fixture(t,'hex',{empty:true}),role='change',statement={scope:h('scope'),policy:h('policy'),epoch:'1',root:h('root'),nullifier:h('nullifier'),amount:'400',recipient:'12'.repeat(20),commitment:h('commitment')},path={root:statement.root,index:0,leaf:statement.commitment,siblings:[h('sibling')]},witnessBytes=Buffer.from('HOST_SYNTHETIC_WITNESS');
  const consent={jobId:h('job'),challengeId:h('challenge'),depositJobId:h('deposit'),rootId:h('custody'),noteRevision:1,recipient:statement.recipient,statement,path,witnessSHA256:h(witnessBytes)},wrapper={noteRole:role,consent},binding={kind:'ORIGINAL_CONSENT_V1',jobId:consent.jobId,consentSHA256:h(Buffer.from('HOST_SYNTHETIC_CONSENT')),witnessSHA256:consent.witnessSHA256},quote={used:false,until:Number.MAX_SAFE_INTEGER,value:wrapper};
  const state={closed:0,released:0,fresh:0,poisoned:0,wiped:0},view={head:{timestamp:'600'},header:{number:'0x1'},ledger:{tree:{root:'0x'+path.root,path:()=>({root:'0x'+path.root,index:0,leaf:'0x'+path.leaf,siblings:path.siblings.map(x=>'0x'+x)})}}};
  const ports={quote,hasWithdrawal:()=>false,current:async()=>view,originalOutput:(actual,selected)=>{assert.equal(actual,view);assert.equal(selected,role);return{commitment:statement.commitment,nullifier:statement.nullifier,amount:statement.amount};},fresh(){state.fresh++;},admit:withdrawal=>f.save(data=>({...data,withdrawals:[...data.withdrawals,withdrawal]})),accept:(result,words)=>retainVerifiedDeviceGraphOutputV1({role,epoch:'1',result,expectedPublicInputs:words},f.ports),poison(){state.poisoned++;}};
  let result;
  if(kind==='ordinary'){
   const witness={rho:Array(32).fill(1),key_x:Array(32).fill(2),key_y:Array(32).fill(3),secret:Array(32).fill(4),amount:statement.amount,leaf_index:'0',siblings:path.siblings.map(x=>[...Buffer.from(x,'hex')])};let bytes;
   result=await proveDeviceGraphOutputWitnessV1(wrapper,witness,{...ports,domain:{scope:statement.scope,policy:statement.policy},wallet:{normalize:structuredClone,bytes:()=>{bytes=Buffer.from(witnessBytes);return bytes;},wipe(input){input.secret.fill(0);state.wiped++;},publicWords:()=>[1n,2n,3n],decode:()=>Object.fromEntries(Object.entries(statement).filter(([key])=>key!=='commitment').map(([key,value])=>[key,['epoch','amount'].includes(key)?value:'0x'+value])),commitment:()=>Buffer.from(statement.commitment,'hex'),nullifier:()=>Buffer.from(statement.nullifier,'hex')},createProver:()=>({async prove(relation,input,words,label){assert.equal(relation,'withdraw_balance');assert.equal(label,'device-external-graph-w39-change');assert.deepEqual(words,[1n,2n,3n]);assert.equal((await f.read()).data.withdrawals[0].stage,'PROVING');return f.result;},async close(){assert.ok(bytes.every(x=>x===0));assert.equal(state.wiped,1);assert.equal((await f.retained()).data.confirmed.record.data.withdrawals[0].stage,'PROVED');state.closed++;}})});
  }else{
   const packet={type:'flat-private-proof-inputs',profile:'HOST_SYNTHETIC_PACKET',relation:'withdraw_balance',role:'owner',jobId:consent.jobId,recipientPublicKey:'00',senderPublicKey:'00',authorization:binding,publicInputsSHA256:'00',salt:'00',iv:'00',tag:'00',ciphertext:'00'},client={async proveEncrypted(actual,derivedBinding){assert.equal(actual,packet);assert.deepEqual(derivedBinding,binding);assert.equal((await f.read()).data.withdrawals[0].stage,'PROVING');return f.result;},async close(){assert.equal(state.released,1);assert.equal((await f.retained()).data.confirmed.record.data.withdrawals[0].stage,'PROVED');state.closed++;}};
   result=await provePrivateDeviceGraphOutputV1(wrapper,packet,client,{...ports,permissionFrame:()=>Buffer.from('HOST_SYNTHETIC_CONSENT'),packet:value=>P.externalFlatExactV1(value,['type','profile','relation','role','jobId','recipientPublicKey','senderPublicKey','authorization','publicInputsSHA256','salt','iv','tag','ciphertext']),assertCurrent:async actual=>{assert.equal(actual,view);},derivation:(actual,value)=>{assert.equal(actual,client);assert.equal(value,f.result);return{noteRole:role,jobId:consent.jobId,commitment:statement.commitment,nullifier:statement.nullifier,consentSHA256:binding.consentSHA256,witnessSHA256:binding.witnessSHA256};},publicWords:()=>['1','2','3'],release(){state.released++;}});
  }
  assert.equal(result.stage,'PROVED');assert.equal(quote.used,true);assert.equal(state.fresh,2);assert.equal(state.closed,1);assert.equal(state.poisoned,0);assert.equal(f.proofs.length,1);assert.deepEqual(f.frames,['candidate','CAS','confirmed','proof','candidate','CAS','confirmed']);assert.ok(await f.checkpoint());assert.ok(await f.checkpoint());
  await f.tamper(data=>({...data,confirmed:{...data.confirmed,proofFrames:'[]'}}));await assert.rejects(f.checkpoint(),/DEVICE_EXTERNAL_GRAPH_SOURCE_CHECKPOINT/);assert.equal(f.proofs.length,1);
 });
});
