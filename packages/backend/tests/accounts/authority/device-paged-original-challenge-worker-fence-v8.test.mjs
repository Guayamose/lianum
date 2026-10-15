/** Actual Authority, OWNER subprocess, recipient, PoP and encrypted Vault.
 * System/RPC/confirmed deposit are HOST facts. Scheduling captures exactly
 * the callbacks emitted by this Authority; no proof or financial grant. */
import test,{mock} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {freshKey,signature,nullifier} from '@lianum/engine/notes/private-note-encoding';
import {walletNoteCommitment} from '@lianum/engine/wallet/notes/private-wallet-note-encoding';
import {noteNodeHash} from '@lianum/engine/notes/private-note-tree';
import {Vault} from '@lianum/engine/crypto/vault';
import * as P from '@lianum/mobile-protocol/device/paged-owner-v3';
import * as C from '@lianum/mobile-protocol/device/paged-graph-v3';
import * as Transit from '@lianum/engine/crypto/private-proof-transit-v1';
import {projectRoot} from '@lianum/environment';
const H=v=>createHash('sha256').update('Original Authority challenge fence '+v).digest('hex'),word=v=>'0x'+BigInt(v).toString(16).padStart(64,'0'),Z='0x'+'00'.repeat(32);

test('Original prepared permission defers worker without OWNER calls/CAS, signed submit releases it, and only expired Original recipients are discarded',{timeout:90000},async()=>{
 const directory=await mkdtemp(join(tmpdir(),'original-authority-challenge-fence-')),password=H('password'),device=freshKey(),owner=freshKey(),change=freshKey(),recovery=freshKey();let account,ports;
 const sourceURL=new URL('../../../src/operations/local/funded-graph-paged-deployment-v3.mjs',import.meta.url).href,workerURL=new URL('../../../src/operations/local/paged-approved-continuation-worker-v4.mjs',import.meta.url).href,actualWorker=await import(workerURL);
 mock.module(workerURL,{exports:{...actualWorker,createPagedApprovedContinuationWorkerV4(actualPorts){ports=actualPorts;return actualWorker.createPagedApprovedContinuationWorkerV4(actualPorts);}}});
 const active=JSON.parse(await readFile(join(projectRoot,'scripts/development/active-paged-generation.json'),'utf8')),head={number:'0x1',hash:'0x'+H('head'),timestamp:'0x'+Math.floor(Date.now()/1000).toString(16)},system={securityGeneration:active.securityGeneration,minimumDepositAtomic:'10',manifestSHA256:active.manifestSHA256,consumerSHA256:active.consumerSHA256,...Object.fromEntries(['pool','state','native'].map((k,i)=>[k,'0x'+String(i+1).repeat(40)])),...Object.fromEntries(['scope','policy','assetIdentity','domain','hubDomain','registryCommitment'].map(k=>[k,H(k)])),deployments:[{name:'PagedSparsePoseidon2V3',address:'0x'+'4'.repeat(40),codeHash:'0x'+H('math')} ]};
 const note=(key,label,value)=>({type:4,rho:H(label+'rho'),x:key.x.toString('hex'),y:key.y.toString('hex'),value,secret:H(label+'secret')}),inputNote=note(owner,'source','20'),commitment=walletNoteCommitment(system.scope,system.policy,inputNote).toString('hex'),nf=nullifier(system.scope,commitment,inputNote.secret).toString('hex');let level=['0x'+commitment,...Array(255).fill(Z)];while(level.length>1)level=Array.from({length:level.length/2},(_,i)=>noteNodeHash(level[i*2],level[i*2+1]));
 const d={...Object.fromEntries(['pool','state','native'].map(k=>[k,{expectedCode:'0x6000',codeHash:'0x'+H(k+'code')} ])),ledgerLeaves:async()=>({leaves:['0x'+commitment],root:level[0]}),call:async(_kind,name)=>name==='currentRoot()'?level[0]:word(0)},runtime={metadata:{chainId:'31337',evmGenesis:'0x'+H('genesis')},accounts:['0x'+'5'.repeat(40)],receipts:[],health:async()=>{},block:async()=>head,assertCanonical:async value=>assert.equal(value.hash,head.hash),code:async()=>'0x6000',balance:async()=>0n};
 mock.module(sourceURL,{exports:{assertOriginalFundedPagedGraphWalletV3:(r,s)=>{assert.strictEqual(r,runtime);assert.strictEqual(s,system);},readOriginalFundedPagedGraphDeploymentV3:()=>d,pagedGraphProofDataV3(){throw Error('HOST_NO_PROOF');},pagedGraphStaticDataV3(){throw Error('HOST_NO_EFFECT');}}});
 try{
  const Authority=await import('../../../src/accounts/authority/device-paged-note-authority-v3.mjs'),path=join(directory,'operations.vault');account=await Authority.createOriginalDevicePagedGraphNoteAuthorityV3(runtime,system,{origin:'https://127.0.0.1:9443',devicePublicKey:'04'+device.x.toString('hex')+device.y.toString('hex'),journal:{path,password}});
  const descriptor=account.descriptor(),vault=new Vault(path),first=await vault.read(password),proof='11',publicInputs=Array(26).fill('0');publicInputs[17]='20';await vault.update(password,first.revision,data=>({...data,jobs:[{profile:P.DEVICE_PAGED_OWNER_V3,descriptor,jobId:'host-confirmed-deposit',rootId:H('root'),revision:1,mode:'deposit',publicInputs,witnessSHA256:H('inert-witness'),proofSHA256:createHash('sha256').update(Buffer.from(proof,'hex')).digest('hex'),proof,stage:'CONFIRMED',commitment,nullifier:nf,transactionHash:'0x'+H('inert-fund'),errorCode:null}]}));
  const seed={operationId:H('op'),budget:'10',fundingNotBefore:String(BigInt(head.timestamp)-1n),fundingValidUntil:String(BigInt(head.timestamp)+100n),settleBefore:String(BigInt(head.timestamp)+200n),reservationNonce:H('nonce'),reserveSecret:H('reserve'),graphSalt:H('salt'),inputNote,changeNote:note(change,'change','10'),recoveryNote:note(recovery,'recovery','10')},draft=(action,id,body)=>({action,graphId:'paged-graph-'+H('graph').slice(0,32),jobId:id,rootId:H('root'),revision:1,commandSHA256:createHash('sha256').update(JSON.stringify(body)).digest('hex'),replyPublicKey:null});
  const mode=P.DEVICE_PAGED_MODES_V3[C.DEVICE_PAGED_GRAPH_COMMANDS_V3.BEGIN_GRAPH],reply=Transit.createPrivateProofRecipientV1({relation:mode.relation,role:mode.role,jobId:'paged-job-original-fence-begin'});let consent;
  try{
   const raw=draft('BEGIN_GRAPH','paged-job-original-fence-begin',seed);raw.replyPublicKey=Transit.readPrivateProofRecipientV1(reply).recipientPublicKey;consent=await account.graphChallenge(raw);const before=await readFile(path),ownerBefore=await readFile(join(directory,'private-owner.vault'));
   assert.deepEqual(await ports.stepOriginal(),{state:'PENDING'});assert.deepEqual(await ports.observeOriginal(),{state:'PENDING'});assert.deepEqual(await readFile(path),before);assert.deepEqual(await readFile(join(directory,'private-owner.vault')),ownerBefore);
   const pop=signature(device,C.devicePagedGraphPermissionMessageV3(consent)).toString('hex'),cipher=Transit.sealPrivateProofJobV1(consent.recipient,{inputs:{profile:C.DEVICE_PAGED_GRAPH_OWNER_V3,consent,signature:pop,command:seed},expectedPublicInputs:null,authorization:{kind:'ORIGINAL_CONSENT_V1',jobId:consent.jobId,consentSHA256:createHash('sha256').update(C.devicePagedGraphPermissionMessageV3(consent)).digest('hex'),witnessSHA256:consent.commandSHA256}});const submitted=await account.graphSubmit(consent,pop,cipher);assert.equal(submitted.status.phase,'BUILDING');assert.deepEqual(await ports.observeOriginal(),{state:'STOPPED'},'submitted permission frees Original client without inventing START');
  }finally{Transit.closePrivateProofRecipientV1(reply);}
  const idle=draft('OBSERVE_GRAPH','paged-job-original-fence-observe',{});idle.replyPublicKey=consent.replyPublicKey;const pending=await account.graphChallenge(idle),before=await readFile(path);assert.deepEqual(await ports.observeOriginal(),{state:'PENDING'});await new Promise(resolve=>setTimeout(resolve,Math.max(1,pending.expiresAt-P.devicePagedWallNowV3()+30)));assert.deepEqual(await ports.observeOriginal(),{state:'STOPPED'});assert.deepEqual(await readFile(path),before);const next={...idle,jobId:'paged-job-original-fence-after-expiry'};assert.ok((await account.graphChallenge(next)).recipient);await assert.rejects(account.graphSubmit(pending,'00'.repeat(64),null));
 }finally{await account?.close();mock.reset();device.privateKey=null;await rm(directory,{recursive:true,force:true});}
});
