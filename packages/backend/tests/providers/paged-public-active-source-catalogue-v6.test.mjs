/** Actual SIGKILL/process fence, typed signed Source wire, private AEAD and
 * current reader. Catalogue archive markers and financial RPC are explicit
 * HOST ports; Original OWNER validation stays actual. No prover/public POST. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdtemp,mkdir,readFile,writeFile,unlink,rm} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {Vault} from '@lianum/engine/crypto/vault';
import {canonical} from '@lianum/engine/crypto/privacy';
import * as P from '@lianum/mobile-protocol/device/paged-owner-v3';
import {claimOriginalPagedProcessFenceV4,readOriginalPagedDeadProcessFenceV4} from '../../src/operations/recovery/paged-original-process-fence-v4.mjs';
const hash=x=>createHash('sha256').update(x).digest('hex'),sha=x=>hash(canonical(x));
const fixturePassword='HOST_ACTIVE_FIXTURE_SECRET_NOT_USER_32',genesis='0x25a5cc106eea7138acab33231d7160d69cb777ee0c2c553fcddf5138993e6dd9';
const fixture=new URL('../../../../apps/mobile/tests/device-paged-active-crash-child-v4.mjs',import.meta.url);

test('whole ACTIVE catalogue cold read preserves expired immutable ancestor, current UNKNOWN and Original readonly token boundary; HOST', {timeout:120000},async t=>{
 const directory=await mkdtemp(join(tmpdir(),'paged-active-catalogue-'));let child,fence;let output='';
 try{
  child=spawn(process.execPath,['--experimental-test-module-mocks',fixture.pathname],{env:{...process.env,LIANUM_ACTIVE_CRASH_DIRECTORY:directory,LIANUM_ACTIVE_CRASH_STAGE:'UNKNOWN',LIANUM_ACTIVE_REAL_MANIFEST:'1'},stdio:['ignore','pipe','pipe','ipc']});
  child.stdout.on('data',chunk=>output+=chunk);child.stderr.on('data',chunk=>output+=chunk);
  await Promise.race([once(child,'message'),once(child,'exit').then(()=>{throw Error('HOST_FIXTURE_BEFORE_READY');}),new Promise((_,reject)=>setTimeout(()=>reject(Error('HOST_FIXTURE_TIMEOUT')),45000).unref())]);
  const saved=(await new Vault(join(directory,'HOST-fixture-state.vault')).read(fixturePassword)).data;const password=saved.authorityInput.journal.password;
  await assert.rejects(claimOriginalPagedProcessFenceV4({directory:saved.supervisorInput.directory,purpose:'PAGED_SUPERVISOR'}),/PAGED_PROCESS_FENCE_BUSY/);
  const died=once(child,'exit');child.kill('SIGKILL');assert.equal((await died)[1],'SIGKILL');child=null;
  fence=await claimOriginalPagedProcessFenceV4({directory:saved.supervisorInput.directory,purpose:'PAGED_SUPERVISOR'});const dead=await readOriginalPagedDeadProcessFenceV4(fence);
  const path=saved.authorityInput.journal.path,tipRecord=await new Vault(path).read(saved.authorityInput.journal.password),ownerPath=join(dirname(path),'private-owner.vault'),ownerPassword=hash('LIANUM/PAGED/OWNER-RETENTION/V3\0'+saved.authorityInput.journal.password+'\0'+saved.descriptor.pairingId),tipOwner=await new Vault(ownerPath).read(ownerPassword);
  const walletRootId=tipRecord.data.jobs[0].rootId,principalSHA256=hash('HOST-current-principal'),sourceId=hash('HOST-archived-source');
  const oldDescriptor={...structuredClone(saved.descriptor),pairingId:'host-expired-ancestor',deadlineMs:Date.now()+15000},oldDirectory=join(directory,'old-source');await mkdir(oldDirectory,{mode:0o700});const oldPath=join(oldDirectory,'authority.vault'),oldOwnerPath=join(oldDirectory,'private-owner.vault'),oldOwnerPassword=hash('LIANUM/PAGED/OWNER-RETENTION/V3\0'+password+'\0'+oldDescriptor.pairingId);
  const oldData={schema:P.DEVICE_PAGED_OWNER_V3,identity:hash('HOST-ancestor-identity'),descriptor:oldDescriptor,jobs:[],pending:null,graph:null};
  const Store=await import('../../src/operations/local/device-paged-owner-read-store-v4.mjs'),Owner=await import('../../src/operations/local/device-paged-private-graph-v3.mjs'),oldRetention=await Store.createDevicePagedOwnerRetentionV3({path:oldOwnerPath,password:oldOwnerPassword,expected:null},oldDescriptor),oldController=Owner.createOriginalDevicePagedPrivateGraphV3(oldDescriptor);try{await oldRetention.commit(Owner.retainOriginalDevicePagedPrivateGraphV3(oldController));}finally{oldRetention.close();await oldController.close();}
  const oldOwner=await new Vault(oldOwnerPath).read(oldOwnerPassword),oldCheckpoint={profile:oldOwner.data.profile,descriptorSHA256:sha(oldDescriptor),revision:oldOwner.revision,dataSHA256:sha(oldOwner.data),public:structuredClone(oldOwner.data.controller.public)};
  const lineage={profile:'DEVICE_PAGED_ORIGINAL_SOURCE_REFILL_V4',walletRootId,sourceRevision:2,predecessorPairingId:oldDescriptor.pairingId,predecessorSourceId:sourceId,principalSHA256};
  const tipData=structuredClone(tipRecord.data);tipData.sourceLineage=lineage;tipData.jobs[0].revision=2;
  const tipChanged=await new Vault(path).update(saved.authorityInput.journal.password,tipRecord.revision,()=>tipData);
  const tipCheckpoint={profile:tipOwner.data.profile,descriptorSHA256:sha(saved.descriptor),revision:tipOwner.revision,dataSHA256:sha(tipOwner.data),public:structuredClone(tipOwner.data.controller.public)};
  oldData.refill={profile:'DEVICE_PAGED_ORIGINAL_SOURCE_REFILL_V4',principalSHA256,sourceId,archiveIdentity:hash('HOST-archive-identity'),archiveRevision:1,snapshotSHA256:hash('HOST-immutable-archive-snapshot'),walletRootId,sourceRevision:1,nextSourceRevision:2,stage:'CREATED',target:{journalPath:path,journalCredentialSHA256:hash(saved.authorityInput.journal.password),systemSHA256:sha(saved.system),identity:tipChanged.data.identity,pairingId:saved.descriptor.pairingId},created:{descriptor:structuredClone(saved.descriptor),journalRevision:tipChanged.revision,journalDataSHA256:sha(tipChanged.data),ownerCheckpoint:tipCheckpoint}};
  const oldRecord=await new Vault(oldPath).create(oldData,password);
  const authority=(record,checkpoint)=>({profile:'DEVICE_PAGED_AUTHORITY_RETAINED_V3',descriptor:record.data.descriptor,identity:record.data.identity,journalRevision:record.revision,journalDataSHA256:sha(record.data),ownerCheckpoint:checkpoint});
  const base=JSON.parse(saved.anchorJSON);base.authority={profile:'ORIGINAL_PAGED_PUBLIC_SOURCE_CATALOGUE_V5',entries:[{authority:authority(oldRecord,oldCheckpoint),systemIndex:0,journalPath:oldPath,sourceLineage:null,sourceAnchor:{walletRootId,sourceRevision:1,sourceId,principalSHA256}},{authority:authority(tipChanged,tipCheckpoint),systemIndex:0,journalPath:path,sourceLineage:lineage,sourceAnchor:null}]};
  const oldLock=join(oldDirectory,'authority.vault.lock'),oldOwnerLock=join(oldDirectory,'private-owner.vault.lock');
  const oldBytes=await readFile(oldPath),oldOwnerBytes=await readFile(oldOwnerPath),tipBytes=await readFile(path),tipOwnerBytes=await readFile(ownerPath),sourcePath=join(saved.nativeDirectory,'source-operations/native-wallet.json'),signedSourceBytes=await readFile(sourcePath);let publicPosts=0,observations=0;
  const block={number:'0x1',hash:'0x'+'f'.repeat(64),parentHash:'0x'+'e'.repeat(64),timestamp:'0x'+1900000250n.toString(16),gasLimit:'0x1c9c380',baseFeePerGas:'0x1'},receipts=new Map(saved.system.deployments.map(row=>[row.receipt.transactionHash,row.receipt]));
  t.mock.method(globalThis,'fetch',async(_endpoint,options)=>{const req=JSON.parse(options.body);let result;switch(req.method){case'eth_chainId':result='0xaa36a7';break;case'eth_getBlockByNumber':result=req.params[0]==='0x0'?{hash:genesis}:block;break;case'eth_getCode':result='0x6000';break;case'eth_getTransactionReceipt':observations++;result=receipts.get(req.params[0])??null;break;case'eth_getTransactionByHash':result=null;break;case'eth_sendRawTransaction':publicPosts++;throw Error('HOST_PUBLIC_POST_FORBIDDEN');default:throw Error('HOST_UNEXPECTED_RPC');}return new Response(JSON.stringify({jsonrpc:'2.0',id:req.id,result}),{status:200,headers:{'content-type':'application/json'}});});
  const {readPagedPublicActiveCurrentDataV4:read}=await import('../../src/operations/recovery/paged-public-active-current-data-v4.mjs');const expiryWaitStarted=performance.now();while(Date.now()<=oldDescriptor.deadlineMs&&performance.now()-expiryWaitStarted<25000)await new Promise(resolve=>setTimeout(resolve,Math.max(25,Math.min(100,oldDescriptor.deadlineMs-Date.now()+25))));assert.ok(Date.now()>oldDescriptor.deadlineMs,'Old Source actually expired before readonly validation');
  await t.test('cold read and lost reply query same signed wire without changing either source or old locks',async()=>{
   const first=await read(base,password,fence,dead);assert.equal(first.authority.profile,base.authority.profile);assert.deepEqual(first.authority.entries[0],base.authority.entries[0]);assert.equal(first.authority.entries[1].authority.journalRevision,tipChanged.revision);assert.deepEqual(first.authority.entries[1].sourceLineage,lineage);
   const second=await read(base,password,fence,dead);assert.deepEqual(second,first);assert.ok(observations>0);assert.equal(publicPosts,0);
   assert.deepEqual(await readFile(oldPath),oldBytes);assert.deepEqual(await readFile(oldOwnerPath),oldOwnerBytes);assert.deepEqual(await readFile(path),tipBytes);assert.deepEqual(await readFile(ownerPath),tipOwnerBytes);assert.deepEqual(await readFile(sourcePath),signedSourceBytes);
   await assert.rejects(readFile(oldLock),{code:'ENOENT'});await assert.rejects(readFile(oldOwnerLock),{code:'ENOENT'});
   await assert.rejects(read(base,password,{...fence},dead),/PAGED_PROCESS_FENCE_ORIGINAL/);
  });
  await t.test('ancestor advance and forged marker fail closed without replacing immutable capture',async()=>{
   await writeFile(oldLock,'HOST_ANCESTOR_LOCK_MUST_NOT_BE_TOUCHED',{mode:0o600});await writeFile(oldOwnerLock,'HOST_ANCESTOR_OWNER_LOCK_MUST_NOT_BE_TOUCHED',{mode:0o600});try{await assert.rejects(read(base,password,fence,dead),/PAGED_OWNER_CHECKPOINT_LOCKED/);assert.equal((await readFile(oldLock)).toString(),'HOST_ANCESTOR_LOCK_MUST_NOT_BE_TOUCHED');assert.equal((await readFile(oldOwnerLock)).toString(),'HOST_ANCESTOR_OWNER_LOCK_MUST_NOT_BE_TOUCHED');}finally{await unlink(oldLock);await unlink(oldOwnerLock);}
   const changed=structuredClone(oldData);changed.refill.snapshotSHA256=hash('HOST-wrong-archive');await new Vault(oldPath).update(password,oldRecord.revision,()=>changed);await assert.rejects(read(base,password,fence,dead),/PAGED_ACTIVE_HISTORICAL_CHANGED/);await writeFile(oldPath,oldBytes,{mode:0o600});
   const wrong=structuredClone(base);wrong.authority.entries[0].sourceAnchor.sourceId=hash('HOST-forged-source');await assert.rejects(read(wrong,password,fence,dead));assert.equal(publicPosts,0);
  });
  await t.test('private historical job union is bounded, withdraw-only and uniquely scoped; no new public jobs or wire',async()=>{
   const history={profile:P.DEVICE_PAGED_OWNER_V3,descriptor:structuredClone(saved.descriptor),jobId:'host-historical-withdraw',rootId:walletRootId,revision:1,mode:'withdraw',publicInputs:Array.from({length:39},(_,index)=>String(index+1)),witnessSHA256:hash('HOST-historical-witness'),proofSHA256:hash(Buffer.from('01','hex')),proof:'01',stage:'PROVED',commitment:hash('HOST-historical-commitment'),nullifier:hash('HOST-historical-nullifier'),transactionHash:null,errorCode:null};
   const versions=[];let revision=tipChanged.revision;
   async function writeCurrent(data){const next=await new Vault(path).update(saved.authorityInput.journal.password,revision,()=>data);revision=next.revision;versions.push(next);return next;}
   try{
    const data=structuredClone(tipData);data.historicalExitJobs=[history];const current=await writeCurrent(data);const result=await read(base,password,fence,dead);assert.equal(result.authority.entries[1].authority.journalRevision,current.revision);assert.deepEqual((await new Vault(path).read(saved.authorityInput.journal.password)).data.jobs,tipData.jobs);assert.deepEqual(await readFile(sourcePath),signedSourceBytes);assert.equal(publicPosts,0);
    for(const [label,change,pattern]of [
     ['duplicate ID',d=>d.historicalExitJobs[0].jobId=d.jobs[0].jobId,/PAGED_ACTIVE_DUPLICATE_JOB/],
     ['wrong mode',d=>d.historicalExitJobs[0].mode='deposit',/PAGED_ACTIVE_HISTORICAL_JOB_MODE|MOBILE_PAGED_OWNER_BINDING/],
     ['wrong descriptor',d=>d.historicalExitJobs[0].descriptor=oldDescriptor,/PAGED_ACTIVE_HISTORICAL_CURRENT_DESCRIPTOR/],
     ['current revision',d=>d.historicalExitJobs[0].revision=2,/PAGED_ACTIVE_HISTORICAL_JOB_REVISION/],
     ['wrong root',d=>d.historicalExitJobs[0].rootId=hash('HOST-other-root'),/PAGED_ACTIVE_HISTORICAL_JOB_REVISION/],
     ['seventeenth exit',d=>d.historicalExitJobs=Array.from({length:17},(_,index)=>({...history,jobId:'host-old-'+index})),/PAGED_ACTIVE_HISTORICAL_JOB_BOUND/],
     ['orphan pending',d=>d.pending={...d.pending,jobId:'host-unclaimed-old'},/PAGED_ACTIVE_PENDING_NOTE_JOB/]
    ]){const changed=structuredClone(data);change(changed);await writeCurrent(changed);await assert.rejects(read(base,password,fence,dead),pattern,label);}
   }finally{await writeFile(path,tipBytes,{mode:0o600});}
   assert.deepEqual(await readFile(oldPath),oldBytes);assert.deepEqual(await readFile(oldOwnerPath),oldOwnerBytes);assert.equal(publicPosts,0);
  });
  await t.test('current window remains financial fence while expired ancestor is strictly readonly',async()=>{
   const now=Date.now;t.mock.method(Date,'now',()=>saved.descriptor.deadlineMs+1);try{await assert.rejects(read(base,password,fence,dead),/PAGED_ACTIVE_SOURCE_FINANCIAL_EXPIRED/);}finally{Date.now=now;}assert.equal(publicPosts,0);
  });
 }finally{if(child){const died=once(child,'exit');child.kill('SIGKILL');await died;}await fence?.close();await rm(directory,{recursive:true,force:true});}
});
