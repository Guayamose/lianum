/** Actual killed Root/Sup7 processes, real SDK/PoP/note proof retention,
 * Authority/OWNER and child/flat/provider encrypted journals. Financial
 * kernel/RPC/prover and Mixed deployment/source DATA are HOST-only ports;
 * NOT_SNARK, no public financial acceptance and no Date override. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdtemp,rm,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {Vault} from '@lianum/engine/crypto/vault';
import * as S from '../../src/operations/recovery/paged-runtime-recovery-authority-v3.mjs';
import * as M from '../../src/operations/recovery/paged-public-uniswap-mixed-supervisor-v4.mjs';
const fixture=new URL('../../../../apps/mobile/tests/device-paged-active-crash-child-v4.mjs',import.meta.url),genesis='0x25a5cc106eea7138acab33231d7160d69cb777ee0c2c553fcddf5138993e6dd9';
test('expired dead Root/Sup7 seal authentic storage; partial Root seal retries without new permissions or changed proof bytes',{timeout:65000},async t=>{
 const directory=await mkdtemp(join(tmpdir(),'original-expired-dead-storage-'));let child,output='';
 try{
  child=spawn(process.execPath,['--experimental-test-module-mocks',fixture.pathname],{env:{...process.env,LIANUM_ACTIVE_CRASH_DIRECTORY:directory,LIANUM_ACTIVE_CRASH_STAGE:'PROVED',LIANUM_ACTIVE_STORAGE_EXPIRY:'1'},stdio:['ignore','pipe','pipe','ipc']});child.stdout.on('data',chunk=>output+=chunk);child.stderr.on('data',chunk=>output+=chunk);
  const ready=await Promise.race([once(child,'message').then(([data])=>data),once(child,'exit').then(([code,signal])=>{throw Error('HOST_CHILD_BEFORE_READY '+code+'/'+signal+' '+output);}),new Promise((_,reject)=>setTimeout(()=>reject(Error('HOST_CHILD_READY_TIMEOUT '+output)),40000).unref())]);assert.equal(ready.profile,'HOST_ORIGINAL_ACTIVE_READY_V4');
  const saved=(await new Vault(join(directory,'HOST-fixture-state.vault')).read('HOST_ACTIVE_FIXTURE_SECRET_NOT_USER_32')).data,input=saved.mixedStorage.input,rootFile=join(saved.supervisorInput.directory,'supervisor.vault'),mixedFile=join(input.directory,'mixed-supervisor.vault');
  await assert.rejects(M.sealOriginalPagedPublicUniswapMixedDeadStorageV8(input),/PAGED_PROCESS_FENCE_BUSY/);await assert.rejects(S.sealOriginalPagedPublicDeadStorageV8(saved.supervisorInput),/PAGED_PROCESS_FENCE_BUSY/);
  const exited=once(child,'exit');child.kill('SIGKILL');assert.deepEqual(await exited,[null,'SIGKILL']);child=null;
  await assert.rejects(S.sealOriginalPagedPublicDeadStorageV8(saved.supervisorInput),/PAGED_DEAD_STORAGE_NOT_EXPIRED/);
  const protectedPaths=[saved.authorityInput.journal.path,join(directory,'private-owner.vault'),join(saved.nativeDirectory,'source-operations/native-wallet.json'),saved.mixedStorage.mixedPath,saved.mixedStorage.flatPath,saved.mixedStorage.ownerPath,saved.mixedStorage.providerPath],before=new Map(await Promise.all(protectedPaths.map(async path=>[path,await readFile(path)])));
  const block={number:'0x1',hash:'0x'+'f'.repeat(64),parentHash:'0x'+'e'.repeat(64),timestamp:'0x'+1900000250n.toString(16),gasLimit:'0x1c9c380',baseFeePerGas:'0x1'},receipts=new Map(saved.system.deployments.map(row=>[row.receipt.transactionHash,row.receipt]));let forbiddenEffects=0,wrongCode=false;
  t.mock.method(globalThis,'fetch',async(endpoint,options)=>{assert.equal(endpoint,'https://rpc.host.test');const req=JSON.parse(options.body);let result;switch(req.method){case'eth_chainId':result='0xaa36a7';break;case'eth_getBlockByNumber':result=req.params[0]==='0x0'?{hash:genesis}:block;break;case'eth_getCode':result=wrongCode?'0x6001':'0x6000';break;case'eth_getTransactionReceipt':result=receipts.get(req.params[0])??null;break;case'eth_getTransactionByHash':result=null;break;default:forbiddenEffects++;throw Error('HOST_FINANCIAL_EFFECT_FORBIDDEN:'+req.method);}return new Response(JSON.stringify({jsonrpc:'2.0',id:req.id,result}),{status:200,headers:{'content-type':'application/json'}});});
  // Natural expiry of the descriptor selected at original birth. Neither the
  // process clock nor encrypted descriptor/OWNER bytes are changed by the test.
  const remaining=saved.descriptor.deadlineMs-Date.now();assert.ok(remaining<21000);if(remaining>=0)await new Promise(resolve=>setTimeout(resolve,remaining+20));
  assert.equal((await S.readOriginalPagedPublicRecoveryModeV4(saved.supervisorInput)).mode,'ACTIVE_DEAD_EXPIRED_FENCED');await assert.rejects(S.openOriginalPagedPublicActiveRecoveryV4(saved.supervisorInput),/PAGED_ACTIVE_SOURCE_FINANCIAL_EXPIRED/);
  await assert.rejects(S.sealOriginalPagedPublicDeadStorageV8({...saved.supervisorInput,password:'HOST_WRONG_STORAGE_PASSWORD_NOT_OWNER_V8'}));
  wrongCode=true;await assert.rejects(M.sealOriginalPagedPublicUniswapMixedDeadStorageV8(input),/PAGED_ACTIVE_DEPLOYMENT_CODE/);wrongCode=false;assert.equal((await new Vault(rootFile).read(saved.supervisorInput.password)).data.phase,'ACTIVE','canonical failure must not publish a capture');
  // Fail AFTER Root is sealed. Sup7 remains ACTIVE and a retry must recognize
  // the exact already-captured parent, rather than minting another lineage.
  await assert.rejects(M.sealOriginalPagedPublicUniswapMixedDeadStorageV8({...input,flatJournalPassword:'HOST_WRONG_FLAT_STORAGE_PASSWORD_V8'}));
  const rootSealed=await new Vault(rootFile).read(saved.supervisorInput.password),mixedPending=await new Vault(mixedFile).read(input.password);assert.equal(rootSealed.data.phase,'CAPTURED');assert.equal(mixedPending.data.phase,'ACTIVE');assert.deepEqual(rootSealed.data.descriptor,saved.descriptor);
  // A newer child revision cannot be silently called the published capture.
  const childVault=new Vault(saved.mixedStorage.mixedPath),childRow=await childVault.read(input.mixedJournalPassword);await childVault.update(input.mixedJournalPassword,childRow.revision,data=>data);await assert.rejects(M.sealOriginalPagedPublicUniswapMixedDeadStorageV8(input),/MIXED_DEAD_STORAGE_AUTHORITY_ADVANCED/);await writeFile(saved.mixedStorage.mixedPath,before.get(saved.mixedStorage.mixedPath),{mode:0o600});assert.deepEqual(await new Vault(rootFile).read(saved.supervisorInput.password),rootSealed);assert.deepEqual(await new Vault(mixedFile).read(input.password),mixedPending);
  // A concurrent Root financial-journal write during child validation must
  // invalidate the same Original current read, even after Root was captured.
  const originalRead=Vault.prototype.read;let advancedDuringChild=false;const raced=t.mock.method(Vault.prototype,'read',async function(...args){const result=await originalRead.apply(this,args);if(this.path===saved.mixedStorage.mixedPath&&!advancedDuringChild){advancedDuringChild=true;const rootJournal=new Vault(saved.authorityInput.journal.path),row=await rootJournal.read(saved.authorityInput.journal.password);await rootJournal.update(saved.authorityInput.journal.password,row.revision,data=>data);}return result;});
  try{await assert.rejects(M.sealOriginalPagedPublicUniswapMixedDeadStorageV8(input),/PAGED_DEAD_STORAGE_CURRENT_HIGHWATER/);assert.equal(advancedDuringChild,true);}finally{raced.mock.restore();await writeFile(saved.authorityInput.journal.path,before.get(saved.authorityInput.journal.path),{mode:0o600});}
  assert.deepEqual(await new Vault(rootFile).read(saved.supervisorInput.password),rootSealed,'Root remains safely captured after a child-time high-water conflict');assert.deepEqual(await new Vault(mixedFile).read(input.password),mixedPending,'Sup7 never publishes the conflicted capture');
  const receipt=await M.sealOriginalPagedPublicUniswapMixedDeadStorageV8(input);assert.equal(receipt.phase,'CAPTURED');assert.equal(receipt.financialSourcePermissionIssued,false);assert.equal(receipt.transactionsBroadcast,0);assert.equal(receipt.parent.alreadyCaptured,true);assert.equal(receipt.parent.descriptorDeadlineMs,saved.descriptor.deadlineMs);assert.equal(receipt.parent.revision,rootSealed.revision);assert.equal(receipt.alreadyCaptured,false);
  const mixedSealed=await new Vault(mixedFile).read(input.password);assert.equal(mixedSealed.data.identity,mixedPending.data.identity);assert.equal(mixedSealed.data.generation,mixedPending.data.generation);assert.deepEqual(mixedSealed.data.activationBase,mixedPending.data.activationBase);assert.deepEqual(mixedSealed.data.descriptor,mixedPending.data.descriptor);
  const again=await M.sealOriginalPagedPublicUniswapMixedDeadStorageV8(input);assert.equal(again.alreadyCaptured,true);assert.equal(again.revision,mixedSealed.revision);assert.deepEqual(await new Vault(rootFile).read(saved.supervisorInput.password),rootSealed);assert.deepEqual(await new Vault(mixedFile).read(input.password),mixedSealed);
  await assert.rejects(M.sealOriginalPagedPublicUniswapMixedDeadStorageV8({...input,allowExpired:true}),/MIXED_SUP_FIELDS/);
  for(const [path,bytes]of before)assert.deepEqual(await readFile(path),bytes,'retained financial/OWNER/provider bytes unchanged: '+path);
  const current=(await new Vault(saved.authorityInput.journal.path).read(saved.authorityInput.journal.password)).data;assert.equal(current.jobs[0].stage,'PROVED');assert.equal(current.jobs[0].proofSHA256,saved.proofSHA256);assert.equal(forbiddenEffects,0);await assert.rejects(S.readOriginalPagedPublicDeadStorageSealV8(Object.freeze(Object.create(null))),/PAGED_DEAD_STORAGE_ORIGINAL_HANDLE/);
 }finally{if(child&&child.exitCode===null&&child.signalCode===null){const exited=once(child,'exit');child.kill('SIGKILL');await exited;}await rm(directory,{recursive:true,force:true});}
});
