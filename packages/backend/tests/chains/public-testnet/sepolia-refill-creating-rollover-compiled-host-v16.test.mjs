/** Actual compiled PUBLIC deployment and successor + protected keys + Original
 * Sup, Source, OWNER, archives and cold startup. Proof/chain facts and the
 * parent pool occupancy are explicitly HOST. TLS.listen is stopped before any
 * bind. No SNARK or public financial claim. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {fork} from 'node:child_process';
import {once} from 'node:events';
import {readFileSync} from 'node:fs';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {Server} from 'node:net';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {Vault} from '@lianum/engine/crypto/vault';
import {createHostRefillCreatingCompiledV16,createHostRefillIngressV16} from './support-host-refill-creating-compiled-v16.mjs';
const childPath=fileURLToPath(new URL('./device-paged-refill-creating-rollover-publisher-child-v16.mjs',import.meta.url));
test('ACTIVE dead cold CREATING rollover startup recovers ONLY the SAME successor-pool child before listen, Original signed epoch/counters unchanged; HOST',{timeout:600000},async t=>{
 const directory=await mkdtemp(join(tmpdir(),'original-cold-creating-rollover-'));let child,childClosed,ingress;let output='';
 try{
  const env={...process.env};delete env.NODE_OPTIONS;delete env.NODE_TEST_CONTEXT;child=fork(childPath,[directory],{execPath:process.execPath,execArgv:['--experimental-test-module-mocks','--max-old-space-size=768'],env,stdio:['ignore','pipe','pipe','ipc']});childClosed=once(child,'close');
  for(const stream of [child.stdout,child.stderr])stream.on('data',bytes=>{output+=bytes;if(output.length>4*1024*1024)child.kill('SIGKILL');});
  const packet=await Promise.race([new Promise((resolve,reject)=>child.on('message',message=>{if(message?.type==='HOST_ORIGINAL_CREATING_READY')resolve(message);else if(message?.type==='HOST_CREATING_RPC_FAILURE')reject(Error('HOST_CREATING_RPC_FAILURE '+message.method+' '+message.message));})),childClosed.then(([code,signal])=>{throw Error('HOST_CREATING_CHILD_BEFORE_READY '+code+'/'+signal+' '+output.slice(-12000));}),new Promise((_,reject)=>setTimeout(()=>reject(Error('HOST_CREATING_CHILD_TIMEOUT '+output.slice(-12000))),400000).unref())]);assert.equal(packet.type,'HOST_ORIGINAL_CREATING_READY');assert.equal(packet.pid,child.pid);
  const Sup=await import('../../../src/operations/recovery/paged-runtime-recovery-authority-v3.mjs'),fixture=JSON.parse(await readFile(join(directory,'HOST-creating-fixture.json'),'utf8'));assert.equal((await Sup.readOriginalPagedPublicRecoveryModeV4(fixture.supervisorInput)).mode,'ACTIVE_IN_USE');
  child.kill('SIGKILL');const [code,signal]=await childClosed;child=null;assert.equal(code,null);assert.equal(signal,'SIGKILL');
  const host=await createHostRefillCreatingCompiledV16(t,directory,JSON.parse(await readFile(join(directory,'HOST-creating-chain.json'),'utf8'))),Product=await import('../../../src/operations/local/funded-paged-public-native-operator-v4.mjs');ingress=await createHostRefillIngressV16(directory,true);
  const supPath=join(fixture.supervisorInput.directory,'supervisor.vault'),parentPath=fixture.raw.journal.path,childJournal=fixture.next.journal.path;
  const paths={source:join(directory,'source-operations/native-wallet.json'),epoch:join(directory,'source-operations/financial-epochs.vault'),bootstrap:join(directory,'receiver-bootstrap/native-wallet.json'),dispatch:join(directory,'dispatch-journal/native-wallet.json'),child:childJournal,oldOwner:fixture.oldOwnerPath,childOwner:fixture.childOwnerPath,keys:join(directory,'keys/provider-keys.aead')},before=Object.fromEntries(await Promise.all(Object.entries(paths).map(async([key,path])=>[key,await readFile(path)]))),posts=host.posts();
  const parentBefore=await new Vault(parentPath).read(fixture.raw.journal.password);assert.equal(parentBefore.data.refill.stage,'CREATING');assert.deepEqual(parentBefore.data.refill.target.poolRollover,fixture.poolRollover);
  // The TLS primitive is the only startup interception. All lower Original
  // constructors and recovery run normally. No socket reaches bind/listen.
  let listenCapture=null;
  t.mock.method(Server.prototype,'listen',function(){assert.equal(listenCapture,null);listenCapture={sup:readFileSync(supPath),parent:readFileSync(parentPath),child:readFileSync(childJournal)};throw Error('HOST_LISTEN_BLOCKED_AFTER_ORIGINAL_RECOVERY');});
  await assert.rejects(Product.recoverOriginalPagedPublicRefillOpeningOperatorV15(fixture.raw,ingress,fixture.next),/HOST_LISTEN_BLOCKED_AFTER_ORIGINAL_RECOVERY/);assert.ok(listenCapture,'Original recovered successor child reaches final publication before any TLS bind');
  const parent=await new Vault(parentPath).read(fixture.raw.journal.password);assert.equal(parent.data.refill.stage,'CREATED');assert.deepEqual(parent.data.refill.created.descriptor,fixture.birthDescriptor);assert.deepEqual(listenCapture.parent,await readFile(parentPath));assert.deepEqual(listenCapture.child,before.child);assert.deepEqual(listenCapture.sup,await readFile(supPath));
  const current=await new Vault(childJournal).read(fixture.raw.journal.password);assert.deepEqual(current.data.descriptor,fixture.birthDescriptor);assert.equal(current.data.descriptor.pool,fixture.childPool,'recovered Source belongs to the successor pool');assert.notEqual(fixture.childPool,fixture.parentPool);assert.deepEqual(current.data.poolRollover,fixture.poolRollover);assert.deepEqual(current.data.jobs,[]);assert.equal(current.data.pending,null);assert.equal(current.data.graph,null);
  for(const key of ['source','epoch','bootstrap','dispatch','child','oldOwner','childOwner','keys'])assert.deepEqual(await readFile(paths[key]),before[key],key+' remains exact across cold storage and startup');assert.equal(host.posts(),posts,'cold startup never SIGNs or POSTs');
  const sup=await new Vault(supPath).read(fixture.raw.journal.password);assert.equal(sup.data.phase,'ACTIVE');assert.ok(sup.data.activationBase);
 }catch(error){process.stderr.write('HOST_CREATING_ROLLOVER_PARENT_FAILURE '+String(error?.message??error)+'\n'+output.slice(-12000)+'\n');throw error;}finally{if(child){if(child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');await childClosed.catch(()=>{});}if(ingress)(await import('../../../src/api/mobile/paged-remote-ingress-binding-v4.mjs')).closeOriginalPagedRemoteIngressBindingV4(ingress);await writeFile(join(directory,'HOST-child.log'),output,{mode:0o600}).catch(()=>{});await rm(directory,{recursive:true,force:true});}
});
