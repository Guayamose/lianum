/** Actual private Original D26 and PAGED W39 producers, authenticated Vault,
 * SIGKILL during computation, expired intake lease and same-witness recovery.
 * Membership/descriptor are isolated DATA; no chain, signing or payment claim. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp,readFile,readdir,rm,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {projectRoot,resourceRoot} from '@lianum/environment';
import {freshKey,signature,nullifier} from '../../../src/notes/private-note-encoding.mjs';
import {noteNodeHash} from '../../../src/notes/private-note-tree.mjs';
import {walletDepositInput,balanceWithdrawFrame,walletInputPublicWords,walletNoteCommitment} from '../../../src/wallet/notes/private-wallet-note-encoding.mjs';
import * as Transit from '../../../src/crypto/private-proof-transit-v1.mjs';
import * as P from '@lianum/mobile-protocol/device/paged-owner-v3';
import {prepareOriginalDevicePagedDurableProofClientV6,reopenOriginalDevicePagedDurableProofClientV6,readOriginalDevicePagedDurableProofResultV6,readOriginalDevicePagedNoteProofCheckpointV6} from '../../../src/execution/local/device-paged-proof-client-v3.mjs';

const hash=value=>createHash('sha256').update(value).digest('hex');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function processes(group){
 const rows=[];
 for(const pid of await readdir('/proc'))if(/^[1-9][0-9]*$/.test(pid))try{
  const stat=await readFile('/proc/'+pid+'/stat','utf8'),tail=stat.slice(stat.lastIndexOf(')')+2).trim().split(/\s+/);
  if(Number(tail[2])!==group||['Z','X'].includes(tail[0]))continue;
  const argv=(await readFile('/proc/'+pid+'/cmdline','utf8')).split('\0').filter(Boolean);
  rows.push({pid:Number(pid),ppid:Number(tail[1]),group,startTicks:tail[19],cpuTicks:Number(tail[11])+Number(tail[12]),role:argv.some(arg=>arg.endsWith('/wallet-note-private-worker-v4.mjs'))?'D26_WASM':argv.some(arg=>arg.endsWith('/bb'))?'W39_NATIVE':argv.some(arg=>arg.endsWith('/paged-proof-process-v3.mjs'))?'W39_COORDINATOR':'FIXED_ACTOR'});
 }catch(error){if(!['ENOENT','ESRCH'].includes(error.code))throw error;}
 return rows;
}
async function actualCalculation(mode,group){
 const began=performance.now(),before=new Map();
 for(;;){
  assert.ok(performance.now()-began<90000,'ACTUAL_PRIVATE_CALCULATION_TIMEOUT');
  const rows=await processes(group);
  if(mode==='deposit'){
   const directory=join(resourceRoot('engine'),'evidence/m23-wallet-proof-attempts');
   let proving=false;
   for(const name of await readdir(directory).catch(()=>[]))if(name.endsWith('-device-paged-d26-durable.json')){
    const report=JSON.parse(await readFile(join(directory,name),'utf8'));
    if(report.phase==='actual-proof-generation'&&Date.parse(report.startedAt)>=Date.now()-90000)proving=true;
   }
   const worker=rows.find(row=>row.role==='D26_WASM');
   if(proving&&worker){before.set(worker.pid,before.get(worker.pid)??worker.cpuTicks);if(worker.cpuTicks-before.get(worker.pid)>=25)return{classification:'ACTUAL_ORIGINAL_D26_WASM_PROOF_GENERATION',rows};}
  }else{
   // The fixed Native backend is used only by the SAME admitted W39 actor.
   // Sustained CPU after initialization proves calculation is live, not queued.
   // This is process evidence, not a public verifier or consensus assertion.
   const worker=rows.find(row=>row.role==='W39_NATIVE');
   if(worker){before.set(worker.pid,before.get(worker.pid)??worker.cpuTicks);if(worker.cpuTicks-before.get(worker.pid)>=800&&rows.some(row=>row.role==='W39_COORDINATOR'))return{classification:'ACTUAL_ORIGINAL_W39_NATIVE_SUSTAINED_COMPUTATION',rows};}
  }
  await delay(50);
 }
}
for(const mode of ['deposit','withdraw'])test('Original '+mode+' survives actual SIGKILL and expired 15s consent without another witness or financial grant',{timeout:600000},async()=>{
 const directory=await mkdtemp(join(tmpdir(),'original-paged-durable-note-'));let client,reopened,replayed;
 try{
  const selection=JSON.parse(await readFile(join(projectRoot,'scripts/development/active-paged-generation.json'),'utf8'));
  const device=freshKey(),owner=freshKey(),H=label=>hash('durable Original '+mode+' '+label),jobId='paged-durable-original-'+mode;
  const descriptor=P.normalizeDevicePagedDescriptorV3({profile:P.DEVICE_PAGED_OWNER_V3,graphProfile:P.DEVICE_PAGED_GRAPH_V3,sparseEncoding:P.DEVICE_PAGED_SPARSE_V3,origin:'https://127.0.0.1:9443',pairingId:'original-durable-'+mode,devicePublicKey:'04'+device.x.toString('hex')+device.y.toString('hex'),deadlineMs:P.devicePagedNowV3()+3600000,chainId:'31337',manifestSHA256:selection.manifestSHA256,consumerSHA256:selection.consumerSHA256,...Object.fromEntries(['genesis','scope','policy','assetIdentity','domain','hubDomain','registryCommitment','poolCodeHash','stateCodeHash','nativeCodeHash','mathCodeHash'].map(key=>[key,H(key)])),...Object.fromEntries(['pool','state','native','math'].map((key,i)=>[key,'0x'+String(i+1).repeat(40)]))});
  const note={type:4,...owner,rho:Buffer.from(H('rho'),'hex'),secret:Buffer.from(H('secret'),'hex'),value:'20'},commitment=walletNoteCommitment(descriptor.scope,descriptor.policy,note).toString('hex'),nf=nullifier(descriptor.scope,commitment,note.secret).toString('hex');
  let root='0x'+commitment,empty='0x'+'0'.repeat(64);const siblings=[];
  for(let i=0;i<8;i++){siblings.push(empty);root=noteNodeHash(root,empty);empty=noteNodeHash(empty,empty);}
  const path={leaf:'0x'+commitment,index:0,root,siblings};
  const witness=mode==='deposit'?walletDepositInput({scope:descriptor.scope,policy:descriptor.policy,epoch:'10',note}):{scope:Array.from({length:8},(_,i)=>String(Buffer.from(descriptor.scope,'hex').readUInt32BE(i*4))),policy:Array.from({length:8},(_,i)=>String(Buffer.from(descriptor.policy,'hex').readUInt32BE(i*4))),epoch:'10',root:Array.from({length:8},(_,i)=>String(Buffer.from(root.slice(2),'hex').readUInt32BE(i*4))),spent:Array.from({length:8},(_,i)=>String(Buffer.from(nf,'hex').readUInt32BE(i*4))),amount:note.value,recipient:Array(5).fill(String(0x90909090)),source_siblings:siblings.map(value=>Array.from(Buffer.from(value.slice(2),'hex'))),output_siblings:Array.from({length:64},()=>Array(32).fill(0)),leaf_index:'0',sparse_output:false,rho:Array.from(note.rho),key_x:Array.from(note.x),key_y:Array.from(note.y),value:note.value,secret:Array.from(note.secret),signature:Array.from(signature(owner,balanceWithdrawFrame(descriptor.scope,descriptor.policy,commitment,'90'.repeat(20),note.value,'10')))};
  if(mode==='withdraw')delete witness.siblings;
  const expected=walletInputPublicWords(mode==='deposit'?'deposit_balance':'withdraw_balance',witness),witnessSHA256=hash(JSON.stringify(P.snapshotDevicePagedWitnessV3(witness))),retention={path:join(directory,'private-'+mode+'-proof.vault'),password:H('password')};
  client=await prepareOriginalDevicePagedDurableProofClientV6(mode,jobId,selection.manifestSHA256,descriptor,retention);
  const consent=P.normalizeDevicePagedConsentV3({version:3,profile:P.DEVICE_PAGED_OWNER_V3,descriptor,action:mode==='deposit'?'PROVE_D26':'PROVE_W39',mode,jobId,challengeId:'original-durable-challenge-'+mode,nonce:H('nonce'),rootId:H('root'),revision:1,authorizationRoot:null,reserveNullifier:null,previousCommitment:null,nextCommitment:null,publicInputs:expected,witnessSHA256,recipient:client.ready(),proofSHA256:null,expiresAt:P.devicePagedWallNowV3()+15000});
  const authorization={kind:'ORIGINAL_CONSENT_V1',jobId,consentSHA256:hash(P.devicePagedPermissionMessageV3(consent)),witnessSHA256},pop=signature(device,P.devicePagedPermissionMessageV3(consent)).toString('hex'),cipher=Transit.sealPrivateProofJobV1(consent.recipient,{inputs:{profile:'ORIGINAL_DEVICE_PAGED_PRIVATE_INPUT_V3',consent,signature:pop,witness},expectedPublicInputs:expected,authorization});
  const intent=await client.prepareProofIntentV6(cipher,consent),before=client.checkpoint(),encrypted=await readFile(retention.path,'utf8');
  assert.equal(encrypted.includes(note.secret.toString('hex')),false);assert.equal(before.public.stage,'INTENT');assert.equal(before.public.witnessSHA256,witnessSHA256);
  await assert.rejects(reopenOriginalDevicePagedDurableProofClientV6(mode,jobId,selection.manifestSHA256,descriptor,retention,before),'second live process is fenced');
  await assert.rejects(client.continueProofIntentV6({...intent},expected),/ORIGINAL_COMPUTATION_INTENT/);
  const attempt=client.continueProofIntentV6(intent,expected).then(result=>({result}),error=>({error})),running=await actualCalculation(mode,before.public.ownerProcess.processGroup);
  process.kill(-before.public.ownerProcess.processGroup,'SIGKILL');const interrupted=await attempt;assert.ok(interrupted.error,'no Original result before hard kill');await client.close();client=null;
  for(let i=0;i<100&&(await processes(before.public.ownerProcess.processGroup)).length;i++)await delay(20);
  assert.equal((await processes(before.public.ownerProcess.processGroup)).length,0,'no escaped prover descendant');
  await delay(Math.max(0,consent.expiresAt-P.devicePagedWallNowV3()+20));assert.throws(()=>P.validateDevicePagedConsentFreshV3(consent));
  assert.deepEqual(await readOriginalDevicePagedNoteProofCheckpointV6(retention,descriptor,mode,jobId,before),before);
  await assert.rejects(reopenOriginalDevicePagedDurableProofClientV6(mode,jobId,selection.manifestSHA256,descriptor,{...retention,password:H('wrong')},before));
  await assert.rejects(reopenOriginalDevicePagedDurableProofClientV6(mode,jobId,selection.manifestSHA256,descriptor,retention,{...before,dataSHA256:H('tamper')}));
  reopened=await reopenOriginalDevicePagedDurableProofClientV6(mode,jobId,selection.manifestSHA256,descriptor,retention,before);const restored=reopened.restoredProofIntentV6();assert.throws(()=>reopened.restoredProofIntentV6(),/ONE_RESTORED_INTENT/);
  await assert.rejects(reopened.continueProofIntentV6(intent,expected),/ORIGINAL_COMPUTATION_INTENT/);
  const result=await reopened.continueProofIntentV6(restored,expected),actual=readOriginalDevicePagedDurableProofResultV6(reopened,result);assert.ok(actual.proof.length>1000,'genuine Original proof, no fixture bytes');assert.deepEqual(actual.publicInputs,expected);assert.deepEqual(actual.source,{commitment,nullifier:nf});assert.equal(actual.checkpoint.revision,before.revision+1);assert.equal(actual.checkpoint.public.consentSHA256,authorization.consentSHA256);assert.equal(actual.checkpoint.public.witnessSHA256,witnessSHA256);assert.throws(()=>readOriginalDevicePagedDurableProofResultV6(reopened,structuredClone(result)),/ORIGINAL_DURABLE_RESULT/);
  const completed=actual.checkpoint,proofSHA256=hash(actual.proof);actual.proof.fill(0);await reopened.close();reopened=null;
  assert.deepEqual(await readOriginalDevicePagedNoteProofCheckpointV6(retention,descriptor,mode,jobId,before),completed,'result durable before lost authority ACK');
  replayed=await reopenOriginalDevicePagedDurableProofClientV6(mode,jobId,selection.manifestSHA256,descriptor,retention,completed);const repeated=await replayed.continueProofIntentV6(replayed.restoredProofIntentV6(),expected),same=readOriginalDevicePagedDurableProofResultV6(replayed,repeated);assert.equal(hash(same.proof),proofSHA256);assert.deepEqual(same.checkpoint,completed,'recovered public response never starts a second proof');same.proof.fill(0);
  const evidence={mode,jobId,classification:'ACTUAL_PRIVATE_ORIGINAL_PROOF_SIGKILL_RECOVERY',before,completed,running,expiredConsent:true,sameWitness:true,sameProofRequest:true,deviceProofSignatures:1,noteWitnesses:1,financialSignatures:0,payments:0,financialAcceptance:false};
  await writeFile(join(projectRoot,'.local','durable-note-'+mode+'-causal-evidence-v6.json'),JSON.stringify(evidence,null,2)+'\n');
 }finally{await Promise.allSettled([client?.close(),reopened?.close(),replayed?.close()]);await rm(directory,{recursive:true,force:true});}
});
