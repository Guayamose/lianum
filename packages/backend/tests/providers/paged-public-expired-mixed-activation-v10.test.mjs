/** Actual killed Root/Sup7, protected snapshots, AEAD and OWNER validation.
 * Broker grant/note, deployment, Sup8 storage step and RPC are HOST ports. Original
 * broker PoP/birth is covered separately; no signer, proof or payment runs. */
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
test('V10 resumes the actual dead expired mixed parent without issuing new financial deadlines',{timeout:65000},async t=>{
 const directory=await mkdtemp(join(tmpdir(),'original-expired-mixed-broker-'));let child,sup,output='';
 try{
  child=spawn(process.execPath,['--experimental-test-module-mocks',fixture.pathname],{env:{...process.env,LIANUM_ACTIVE_CRASH_DIRECTORY:directory,LIANUM_ACTIVE_CRASH_STAGE:'PROVED',LIANUM_ACTIVE_STORAGE_EXPIRY:'1',LIANUM_ACTIVE_EXPIRED_BROKER_V10:'1'},stdio:['ignore','pipe','pipe','ipc']});child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>output+=b);
  const ready=await Promise.race([once(child,'message').then(([v])=>v),once(child,'exit').then(([code,signal])=>{throw Error('HOST_CHILD_BEFORE_READY '+code+'/'+signal+' '+output);}),new Promise((_,reject)=>setTimeout(()=>reject(Error('HOST_CHILD_READY_TIMEOUT '+output)),40000).unref())]);assert.equal(ready.profile,'HOST_ORIGINAL_ACTIVE_READY_V4');
  const saved=(await new Vault(join(directory,'HOST-fixture-state.vault')).read('HOST_ACTIVE_FIXTURE_SECRET_NOT_USER_32')).data,input=saved.mixedStorage.input,broker=saved.mixedStorage.expiredBrokerV10,rootFile=join(saved.supervisorInput.directory,'supervisor.vault'),mixedFile=join(input.directory,'mixed-supervisor.vault');assert.ok(broker);
  await assert.rejects(M.sealOriginalPagedPublicUniswapMixedDeadStorageV8(input),/PAGED_PROCESS_FENCE_BUSY/);const exited=once(child,'exit');child.kill('SIGKILL');assert.deepEqual(await exited,[null,'SIGKILL']);child=null;
  const protectedPaths=[saved.authorityInput.journal.path,join(directory,'private-owner.vault'),join(saved.nativeDirectory,'source-operations/native-wallet.json'),saved.mixedStorage.mixedPath,saved.mixedStorage.ownerPath,broker.ownerPath],before=new Map(await Promise.all(protectedPaths.map(async path=>[path,await readFile(path)]))),block={number:'0x1',hash:'0x'+'f'.repeat(64),parentHash:'0x'+'e'.repeat(64),timestamp:'0x'+1900000250n.toString(16),gasLimit:'0x1c9c380',baseFeePerGas:'0x1'},receipts=new Map(saved.system.deployments.map(row=>[row.receipt.transactionHash,row.receipt]));let forbidden=0;
  t.mock.method(globalThis,'fetch',async(endpoint,options)=>{assert.equal(endpoint,'https://rpc.host.test');const req=JSON.parse(options.body);let result;switch(req.method){case'eth_chainId':result='0xaa36a7';break;case'eth_getBlockByNumber':result=req.params[0]==='0x0'?{hash:genesis}:block;break;case'eth_getCode':result='0x6000';break;case'eth_getTransactionReceipt':result=receipts.get(req.params[0])??null;break;case'eth_getTransactionByHash':result=null;break;default:forbidden++;throw Error('HOST_FINANCIAL_EFFECT_FORBIDDEN:'+req.method);}return new Response(JSON.stringify({jsonrpc:'2.0',id:req.id,result}),{status:200,headers:{'content-type':'application/json'}});});
  const remaining=saved.descriptor.deadlineMs-Date.now();assert.ok(remaining<21000);if(remaining>=0)await new Promise(resolve=>setTimeout(resolve,remaining+20));
  const oldDeadline=saved.descriptor.deadlineMs;
  sup=await M.recoverOriginalPagedPublicUniswapMixedActivationV10({directory:input.directory,password:input.password,mixedJournalPassword:input.mixedJournalPassword});
  assert.equal(sup.checkpoint().phase,'OPENING');assert.equal(sup.descriptor().deadlineMs,oldDeadline);assert.ok(Date.now()>oldDeadline);
  assert.equal((await new Vault(rootFile).read(saved.supervisorInput.password)).data.phase,'OPENING');
  assert.equal(sup.expiredMixedWithdrawalBindingsV10().length,1);
  for(const[path,data]of before)assert.deepEqual(await readFile(path),data,'old financial/OWNER bytes remain identical: '+path);
  assert.equal(forbidden,0);
  await sup.close();sup=null;
  const sealed=await M.sealOriginalPagedPublicUniswapMixedDeadStorageV8(input);
  assert.equal(sealed.phase,'CAPTURED');assert.equal(sealed.parent.phase,'CAPTURED');assert.equal(sealed.transactionsBroadcast,0);assert.equal(sealed.financialSourcePermissionIssued,false);
  assert.equal((await new Vault(rootFile).read(saved.supervisorInput.password)).data.phase,'CAPTURED');
  for(const[path,data]of before)assert.deepEqual(await readFile(path),data,'sealing the interrupted opening preserves financial bytes: '+path);
  assert.equal(forbidden,0);
 }finally{await sup?.close();if(child&&child.exitCode===null&&child.signalCode===null){const exited=once(child,'exit');child.kill('SIGKILL');await exited;}await rm(directory,{recursive:true,force:true});}
});
