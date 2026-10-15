/** Actual compiled PUBLIC deployment + protected keys + Original Sup, Source,
 * OWNER, archives and cold startup. Proof/chain facts are explicitly HOST.
 * TLS.listen is stopped before any bind. No SNARK or public financial claim. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {fork} from 'node:child_process';
import {once} from 'node:events';
import {readFileSync} from 'node:fs';
import {mkdtemp,readFile,writeFile,rm,readdir} from 'node:fs/promises';
import {Server} from 'node:net';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {Vault} from '@lianum/engine/crypto/vault';
import {createHostRefillCreatingCompiledV16,createHostRefillIngressV16} from './support-host-refill-creating-collection-compiled-v16.mjs';
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms)),childPath=fileURLToPath(new URL('./device-paged-refill-creating-collection-publisher-child-v16.mjs',import.meta.url));
test('ACTIVE dead catalogue Source2 expired recovers SAME existing Source3 before listen, Original epochs/counters unchanged; HOST',{timeout:600000},async t=>{
 const directory=await mkdtemp(join(tmpdir(),'original-cold-creating-collection-'));let child,childClosed,ingress,supervisor,native,receiver,product;let output='';
 try{
  const env={...process.env};delete env.NODE_OPTIONS;delete env.NODE_TEST_CONTEXT;child=fork(childPath,[directory],{execPath:process.execPath,execArgv:['--experimental-test-module-mocks','--max-old-space-size=768'],env,stdio:['ignore','pipe','pipe','ipc']});childClosed=once(child,'close');
  for(const stream of [child.stdout,child.stderr])stream.on('data',bytes=>{output+=bytes;if(output.length>4*1024*1024)child.kill('SIGKILL');});
  const packet=await Promise.race([new Promise((resolve,reject)=>child.on('message',message=>{if(message?.type==='HOST_ORIGINAL_CREATING_READY')resolve(message);else if(message?.type==='HOST_CREATING_RPC_FAILURE')reject(Error('HOST_CREATING_RPC_FAILURE '+message.method+' '+message.message));})),childClosed.then(([code,signal])=>{throw Error('HOST_CREATING_CHILD_BEFORE_READY '+code+'/'+signal+' '+output.slice(-12000));}),new Promise((_,reject)=>setTimeout(()=>reject(Error('HOST_CREATING_CHILD_TIMEOUT '+output.slice(-12000))),400000).unref())]);assert.equal(packet.type,'HOST_ORIGINAL_CREATING_READY');assert.equal(packet.pid,child.pid);
  const Sup=await import('../../../src/operations/recovery/paged-runtime-recovery-authority-v3.mjs'),fixture=JSON.parse(await readFile(join(directory,'HOST-creating-fixture.json'),'utf8'));assert.equal((await Sup.readOriginalPagedPublicRecoveryModeV4(fixture.supervisorInput)).mode,'ACTIVE_IN_USE');await assert.rejects(Sup.openOriginalPagedPublicRefillRecoveryStorageV16(fixture.supervisorInput),/PAGED_PROCESS_FENCE_BUSY/);
  child.kill('SIGKILL');const [code,signal]=await childClosed;child=null;assert.equal(code,null);assert.equal(signal,'SIGKILL');
  await delay(Math.max(0,fixture.descriptor.deadlineMs-Date.now()+30));assert.ok(Date.now()>fixture.descriptor.deadlineMs);assert.ok(Date.now()<fixture.birthDescriptor.deadlineMs);
  const host=await createHostRefillCreatingCompiledV16(t,directory,JSON.parse(await readFile(join(directory,'HOST-creating-chain.json'),'utf8'))),Native=host.Native,Product=await import('../../../src/operations/local/funded-paged-public-native-operator-v4.mjs');ingress=await createHostRefillIngressV16(directory,true);
  const supPath=join(fixture.supervisorInput.directory,'supervisor.vault'),sourcePath=join(directory,'source-operations/native-wallet.json'),epochPath=join(directory,'source-operations/financial-epochs.vault'),parentPath=fixture.markerJournal,childJournal=fixture.next.journal.path;
  const paths={sup:supPath,source:sourcePath,epoch:epochPath,bootstrap:join(directory,'receiver-bootstrap/native-wallet.json'),dispatch:join(directory,'dispatch-journal/native-wallet.json'),child:childJournal,oldOwner:fixture.oldOwnerPath,childOwner:fixture.childOwnerPath,keys:join(directory,'keys/provider-keys.aead'),ancestor:fixture.ancestorJournal,ancestorOwner:fixture.ancestorOwnerPath},before=Object.fromEntries(await Promise.all(Object.entries(paths).map(async([key,path])=>[key,await readFile(path)]))),posts=host.posts();
  assert.equal((await new Vault(parentPath).read(fixture.raw.journal.password)).data.refill.stage,'CREATING');
  supervisor=await Sup.openOriginalPagedPublicRefillRecoveryStorageV16(fixture.supervisorInput);const checkpoint=supervisor.checkpoint(),nativeToken=await supervisor.issueComponent('native');
  await assert.rejects(Native.reopenOriginalPagedPublicTestnetRuntimesV4({directory},nativeToken),/STORAGE_ONLY|ORIGINAL_OPEN_TOKEN/);await assert.rejects(Native.reopenOriginalPagedPublicRefillRecoveryRuntimeV16({directory},{...nativeToken}),/ORIGINAL|STORAGE/);
  native=await Native.reopenOriginalPagedPublicRefillRecoveryRuntimeV16({directory},nativeToken);const deploymentToken=await supervisor.issueComponent('deployment'),opened=await Native.reopenOriginalPagedPublicRefillRecoveryReceiverV16(native,deploymentToken);receiver=opened.runtime;
  const observed=await Native.readOriginalPagedPublicRefillRecoveryFinancialStateV16(receiver);assert.equal(observed.financialAuthorization,false);assert.equal(observed.source.operations.length,2);assert.equal(observed.source.operations[0].command.action,'FUND_D26');assert.ok(observed.source.operations[0].signed);assert.equal(observed.history.epochId,fixture.financial.epoch.epochId);assert.deepEqual(observed.history.limits,fixture.financial.limits);
  await assert.rejects(Native.authorizeOriginalPagedPublicSepoliaFinancialEpochV5(receiver,{}),/STORAGE_ONLY/);await assert.rejects(Native.activateOriginalPagedPublicRefillRecoveredSourceV16(receiver,{}),/ORIGINAL_ACTIVATION/);await assert.rejects(Native.reopenOriginalPagedPublicSepoliaReceiverV4(native,{}),/STORAGE_ONLY/);
  await receiver.close();receiver=null;await native.close();native=null;await supervisor.close();supervisor=null;assert.deepEqual(await readFile(supPath),before.sup);assert.equal(checkpoint.phase,'ACTIVE');
  // The TLS primitive is the only startup interception. All lower Original
  // constructors and recovery run normally. No socket reaches bind/listen.
  let listenCapture=null;
  t.mock.method(Server.prototype,'listen',function(){assert.equal(listenCapture,null);listenCapture={sup:readFileSync(supPath),parent:readFileSync(parentPath),child:readFileSync(childJournal)};throw Error('HOST_LISTEN_BLOCKED_AFTER_ORIGINAL_RECOVERY');});
  await assert.rejects(Product.recoverOriginalPagedPublicRefillOpeningOperatorV15(fixture.raw,ingress,fixture.next),/HOST_LISTEN_BLOCKED_AFTER_ORIGINAL_RECOVERY/);assert.ok(listenCapture,'Original recovered child reaches final publication before any TLS bind');
  const parent=await new Vault(parentPath).read(fixture.raw.journal.password);assert.equal(parent.data.refill.stage,'CREATED');assert.deepEqual(parent.data.refill.created.descriptor,fixture.birthDescriptor);assert.deepEqual(listenCapture.parent,await readFile(parentPath));assert.deepEqual(listenCapture.child,before.child);assert.deepEqual(listenCapture.sup,await readFile(supPath));
  const current=await new Vault(childJournal).read(fixture.raw.journal.password);assert.deepEqual(current.data.descriptor,fixture.birthDescriptor);assert.deepEqual(current.data.jobs,[]);assert.equal(current.data.sourceLineage.sourceRevision,3);assert.equal(current.data.pending,null);assert.equal(current.data.graph,null);assert.equal(current.data.descriptor.deadlineMs,fixture.birthDescriptor.deadlineMs);
  for(const key of ['source','epoch','bootstrap','dispatch','child','oldOwner','childOwner','keys','ancestor','ancestorOwner'])assert.deepEqual(await readFile(paths[key]),before[key],key+' remains exact across cold storage and startup');assert.equal(host.posts(),posts,'cold startup never SIGNs or POSTs');
  // Existing child recovery remains the only operation on an interrupted ACK.
  // Parent publication may change only its authenticated activation snapshot.
  const sup=await new Vault(supPath).read(fixture.raw.journal.password);assert.equal(sup.data.phase,'ACTIVE');assert.equal(sup.data.generation,checkpoint.generation);assert.ok(sup.data.activationBase);assert.ok(Date.now()>fixture.descriptor.deadlineMs);assert.ok(Date.now()<fixture.birthDescriptor.deadlineMs);
 }catch(error){process.stderr.write('HOST_CREATING_PARENT_FAILURE '+String(error?.message??error)+'\n'+output.slice(-12000)+'\n');throw error;}finally{if(child){if(child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');await childClosed.catch(()=>{});}await product?.close();await receiver?.close();await native?.close();await supervisor?.close();if(ingress)(await import('../../../src/api/mobile/paged-remote-ingress-binding-v4.mjs')).closeOriginalPagedRemoteIngressBindingV4(ingress);await writeFile(join(directory,'HOST-child.log'),output,{mode:0o600}).catch(()=>{});await rm(directory,{recursive:true,force:true});}
});
