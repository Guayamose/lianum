import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,unlink,lstat,stat,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash,createECDH,randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {createDeviceGraphSourceHost} from '../../support/device-graph-source-host.mjs';
const h=value=>createHash('sha256').update(value).digest('hex');
const deviceKey=()=>createECDH('secp256k1').generateKeys('hex','uncompressed');
async function fixture(t){
 const scratch=await mkdtemp(join(tmpdir(),'device-graph-source-owner-'));t.after(()=>rm(scratch,{recursive:true,force:true}));
 const root=join(scratch,'product'),flat=join(scratch,'flat'),runId=randomUUID(),directory=join(root,'.local/device-external-flat-ordered-observation-v1','attempt-'+runId,'private-audit');
 await mkdir(directory,{recursive:true,mode:0o700});await mkdir(join(root,'.local/original-device-external-flat-local-v1'),{recursive:true,mode:0o700});
 return{root,flat,identity:{profile:'DEVICE_EXTERNAL_FLAT_ORDERED_OBSERVATION_RECOVERY_V1',directory,runId,sourceSHA256:h('host-source-only'),deadlineMs:Date.now()+60000},devicePublicKey:deviceKey(),head:{number:'0x1',hash:'0x'+h('source-host-head1'),timestamp:'0x40'}};
}

test('HOST GRAPH SOURCE original owner authenticates AEAD, CAS, paired births and live-process refusal',async t=>{
 const config=await fixture(t),local=join(config.root,'.local/original-device-external-flat-local-v1');
 let host=await createDeviceGraphSourceHost(config);t.after(()=>host.restore());let {api,service,account,bridge,runtime}=host;
 await assert.rejects(api.armOriginalDeviceExternalFlatGraphSourceV2({...service}),/HOST_ORIGINAL_SERVICE_ONLY/);
 await assert.rejects(api.readOriginalDeviceGraphSourceConfirmedCheckpointV2({...service}),/DEVICE_GRAPH_SOURCE_UNAVAILABLE/);
 const birth=await api.armOriginalDeviceExternalFlatGraphSourceV2(service);assert.equal(birth.confirmed,true);assert.equal((await host.journal(2)).data.phase,'CONFIRMED');assert.equal(host.counts.runtimeSnapshots,1);
 const confirmed=await api.readOriginalDeviceGraphSourceConfirmedCheckpointV2(service);assert.equal(confirmed.phase,'CONFIRMED');assert.equal(confirmed.processes[0].pid,process.pid);assert.deepEqual(confirmed.head,config.head);assert.ok(!JSON.stringify(confirmed).includes(host.marker));
 assert.ok(!JSON.stringify(await host.journal(2)).includes(host.marker));const snapshot=await host.body(2);assert.equal(snapshot.runtime.localCustody.credential,host.marker);assert.equal(snapshot.sections.system.credential,host.marker);
 const admitted=await api.beginOriginalDeviceGraphSourceActivityV2(account);assert.equal((await host.journal(2)).data.phase,'PENDING');assert.equal(host.counts.effects,0);await assert.rejects(api.readOriginalDeviceGraphSourceConfirmedCheckpointV2(service),/DEVICE_GRAPH_SOURCE_ACTIVE/);
 await assert.rejects(api.reopenOriginalDeviceExternalFlatGraphSourceV2({tls:{},host:'127.0.0.1'}),/DEVICE_GRAPH_SOURCE_HALF_MUTATION_UNKNOWN/);assert.equal(host.counts.openAttempts,0);
 host.counts.effects++;const nested=await api.beginOriginalDeviceGraphSourceActivityV2(runtime),head={number:'0x2',hash:'0x'+h('source-host-head2'),timestamp:'0x41'};host.setHead(head);await api.endOriginalDeviceGraphSourceActivityV2(nested);assert.equal((await host.journal(2)).data.phase,'PENDING');assert.equal(host.counts.runtimeSnapshots,1);
 await api.endOriginalDeviceGraphSourceActivityV2(admitted);assert.equal((await host.journal(2)).data.phase,'CONFIRMED');assert.equal(host.counts.runtimeSnapshots,2);assert.deepEqual((await host.body(2)).runtime.state.head,head);assert.equal(host.counts.effects,1);await assert.rejects(api.endOriginalDeviceGraphSourceActivityV2(admitted),/DEVICE_GRAPH_SOURCE_ACTIVITY_ONCE/);
 await assert.rejects(api.reopenOriginalDeviceExternalFlatGraphSourceV2({tls:{},host:'127.0.0.1'}),/DEVICE_GRAPH_SOURCE_OLD_PROCESS_PRESENT/);assert.equal(host.counts.openAttempts,0);
 const originalRecord=await host.journal(2),firstGenerationPin=originalRecord.data.confirmed,bodyPath=join(config.identity.directory,'graph-source-v2',firstGenerationPin.path),encrypted=await readFile(bodyPath),changed=Buffer.from(encrypted);changed[changed.length-1]^=1;
 try{await writeFile(bodyPath,changed);await assert.rejects(host.body(2),/DEVICE_GRAPH_SOURCE_BODY_PIN/);await assert.rejects(host.body(2,{...firstGenerationPin,sha256:h(changed)}));await writeFile(bodyPath,encrypted);assert.deepEqual((await host.body(2)).runtime.state.head,head);}finally{encrypted.fill(0);changed.fill(0);}
 // A read rejection faults only that original owner. Use the codec for the
 // tamper check above so the remaining live-owner transitions remain usable.
 host.setStandby(true);const preparing=await api.beginOriginalDeviceGraphSourceActivityV2(bridge);await api.endOriginalDeviceGraphSourceActivityV2(preparing);assert.equal((await host.journal(2)).data.phase,'PENDING');assert.equal(host.counts.runtimeSnapshots,2);
 host.setStandby(false);const finalRead=await api.beginOriginalDeviceGraphSourceActivityV2(bridge);await api.endOriginalDeviceGraphSourceActivityV2(finalRead);assert.equal((await host.journal(2)).data.phase,'CONFIRMED');assert.equal(host.counts.effects,1);assert.equal(host.counts.openAttempts,0);
 await assert.rejects(api.checkpointOriginalDeviceGraphSourceObservationV2(service),/DEVICE_GRAPH_SOURCE_SECOND_CHECKPOINT_ONLY/);
 const oldLocator=await readFile(join(local,'graph-source-v2.json')),oldJournal=await readFile(join(config.identity.directory,'graph-source-v2/source.vault'));
 const {Vault}=await import('@lianum/engine/crypto/vault'),secret=await readFile(join(config.identity.directory,'graph-source-v2/source.secret'));
 try{const vault=new Vault(join(config.identity.directory,'graph-source-v2/source.vault')),record=await host.journal(2);await vault.update(secret.toString('hex'),record.revision,data=>({...data,phase:'PENDING'}));await assert.rejects(api.beginOriginalDeviceGraphSourceActivityV2(account),/DEVICE_GRAPH_SOURCE_JOURNAL_CHANGED/);}finally{secret.fill(0);await writeFile(join(config.identity.directory,'graph-source-v2/source.vault'),oldJournal);}
 const failedV3=join(local,'graph-source-v3.json'),failedBytes=Buffer.from('HOST_OLD_FAILED_V3_LOCATOR\n'),failedBirth=Buffer.from('HOST_OLD_FAILED_V3_BIRTH\n');await writeFile(failedV3,failedBytes,{mode:0o600});await writeFile(failedV3+'.birth',failedBirth,{mode:0o600});
 host.restore();host=await createDeviceGraphSourceHost({...config,head});({api,service}=host);
 await assert.rejects(api.armOriginalDeviceExternalFlatGraphSourceV3(service),/DEVICE_GRAPH_SOURCE_PROSPECTIVE_REQUIRED/);
 await api.reserveOriginalDeviceGraphSourceBirthV3(false,config.devicePublicKey);await assert.rejects(api.reserveOriginalDeviceGraphSourceBirthV3(false,config.devicePublicKey),/DEVICE_GRAPH_SOURCE_PROSPECTIVE_ONCE/);
 const freshBirth=await api.armOriginalDeviceExternalFlatGraphSourceV3(service);assert.equal(freshBirth.profile,'ORIGINAL_DEVICE_EXTERNAL_FLAT_SOURCE_OBSERVATION_V3');assert.equal(freshBirth.confirmed,true);
 const pairedHash=h(Buffer.from(config.devicePublicKey,'hex')),otherKey=deviceKey(),otherHash=h(Buffer.from(otherKey,'hex')),newDirectory=join(config.identity.directory,'graph-source-v3'),newLocatorPath=join(local,'graph-source-v3-'+pairedHash+'.json'),otherLocatorPath=join(local,'graph-source-v3-'+otherHash+'.json'),newLocator=await readFile(newLocatorPath);
 try{
  assert.deepEqual(await readFile(failedV3),failedBytes);assert.deepEqual(await readFile(failedV3+'.birth'),failedBirth);
  const pairing={devicePublicKey:config.devicePublicKey,devicePublicKeySHA256:pairedHash};assert.deepEqual((await host.journal(3)).data.pairing,pairing);assert.deepEqual((await host.body(3)).pairing,pairing);await assert.rejects(host.body(3,undefined,{devicePublicKey:otherKey,devicePublicKeySHA256:otherHash}));
  await assert.rejects(api.reopenOriginalDeviceExternalFlatGraphSourceV3({tls:{},host:'127.0.0.1',devicePublicKey:otherKey}),{code:'ENOENT'});
  await writeFile(otherLocatorPath,newLocator,{mode:0o600});await assert.rejects(api.reopenOriginalDeviceExternalFlatGraphSourceV3({tls:{},host:'127.0.0.1',devicePublicKey:otherKey}),/DEVICE_GRAPH_SOURCE_PAIRED_BINDING/);
  const forged=JSON.parse(newLocator);forged.pairing={devicePublicKey:otherKey,devicePublicKeySHA256:otherHash};await writeFile(otherLocatorPath,JSON.stringify(forged));await assert.rejects(api.reopenOriginalDeviceExternalFlatGraphSourceV3({tls:{},host:'127.0.0.1',devicePublicKey:otherKey}),/DEVICE_GRAPH_SOURCE_PAIRED_BINDING/);await unlink(otherLocatorPath);
  for(const generation of [0,1])await assert.rejects(lstat(join(newDirectory,'open-'+generation+'.claimed')),{code:'ENOENT'});assert.equal(host.counts.openAttempts,0);
  assert.deepEqual(await readFile(join(local,'graph-source-v2.json')),oldLocator);assert.deepEqual(await readFile(join(config.identity.directory,'graph-source-v2/source.vault')),oldJournal);assert.equal((await host.journal(3)).data.schema,freshBirth.profile);assert.equal((await host.journal(3)).data.confirmed.schema,freshBirth.profile);assert.equal((await host.body(3)).schema,freshBirth.profile);
  await assert.rejects(host.body(3,firstGenerationPin));await assert.rejects(api.armOriginalDeviceExternalFlatGraphSourceV3(service),/DEVICE_GRAPH_SOURCE_ONCE/);
  await writeFile(newLocatorPath,oldLocator);await assert.rejects(api.reopenOriginalDeviceExternalFlatGraphSourceV3({tls:{},host:'127.0.0.1',devicePublicKey:config.devicePublicKey}));assert.equal(host.counts.openAttempts,0);await writeFile(newLocatorPath,newLocator);
  host.restore();host=await createDeviceGraphSourceHost({...config,head});api=host.api;
  await assert.rejects(api.reserveOriginalDeviceGraphSourceBirthV3(false,config.devicePublicKey),/DEVICE_GRAPH_SOURCE_PROSPECTIVE_EXISTS/);assert.equal((await stat(newDirectory)).mode&0o777,0o700);
  await api.reserveOriginalDeviceGraphSourceBirthV3(false,otherKey);const otherBirth=JSON.parse(await readFile(otherLocatorPath+'.birth'));assert.equal(otherBirth.pairing.devicePublicKey,otherKey);assert.equal(otherBirth.pairing.devicePublicKeySHA256,otherHash);
  await assert.rejects(api.reserveOriginalDeviceGraphSourceBirthV3(false,otherKey),/DEVICE_GRAPH_SOURCE_PROSPECTIVE_ONCE/);
  host.restore();host=await createDeviceGraphSourceHost({...config,head});api=host.api;
  await assert.rejects(api.reserveOriginalDeviceGraphSourceBirthV3(false,otherKey),{code:'EEXIST'});assert.equal(host.counts.openAttempts,0);assert.deepEqual(await readFile(failedV3),failedBytes);assert.deepEqual(await readFile(failedV3+'.birth'),failedBirth);
  await assert.rejects(api.reserveOriginalDeviceGraphSourceBirthV3(false,'04'+'00'.repeat(64)));
 }finally{oldLocator.fill(0);oldJournal.fill(0);newLocator.fill(0);}
});

test('HOST GRAPH SOURCE actual producer exit permits one observation generation with unchanged original effects',async t=>{
 const config=await fixture(t),child=spawn(process.execPath,['--experimental-test-module-mocks',new URL('../../support/device-graph-source-producer-fixture.mjs',import.meta.url).pathname,JSON.stringify(config)],{stdio:['ignore','pipe','pipe']});
 t.after(()=>{if(child.exitCode===null)child.kill('SIGKILL');});
 let out='',err='';child.stdout.setEncoding('utf8').on('data',chunk=>{out+=chunk;});child.stderr.setEncoding('utf8').on('data',chunk=>{err+=chunk;});
 const exit=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{child.kill('SIGKILL');reject(Error('SOURCE_CHILD_TIMEOUT'));},15000);child.once('error',error=>{clearTimeout(timer);reject(error);});child.once('exit',(code,signal)=>{clearTimeout(timer);resolve({code,signal});});});
 assert.deepEqual(exit,{code:0,signal:null},err);const first=JSON.parse(out.trim());assert.equal(first.processes[0].pid,child.pid);await assert.rejects(lstat('/proc/'+child.pid),{code:'ENOENT'});
 const host=await createDeviceGraphSourceHost({...config,allowReopen:true});t.after(()=>host.restore());const {api}=host,firstRecord=await host.journal(2),firstPin=firstRecord.data.confirmed,sameEffectBody=await host.body(2);
 const service=await api.reopenOriginalDeviceExternalFlatGraphSourceV2({tls:{},host:'127.0.0.1'});t.after(()=>service.close());assert.equal(host.counts.openAttempts,1);assert.equal((await host.journal(2)).data.phase,'OBSERVING');assert.equal(host.counts.effects,0);
 await assert.rejects(api.checkpointOriginalDeviceGraphSourceObservationV2({...service}),/DEVICE_GRAPH_SOURCE_UNAVAILABLE/);
 const second=await api.checkpointOriginalDeviceGraphSourceObservationV2(service);assert.equal(second.generation,1);assert.equal(second.phase,'CONFIRMED');assert.deepEqual(second.head,config.head);assert.equal(second.processes[0].pid,process.pid);assert.equal(host.counts.runtimeSnapshots,1);assert.equal(host.counts.effects,0);assert.equal(host.counts.openAttempts,1);assert.ok(!JSON.stringify(second).includes(host.marker));
 const record=await host.journal(2);assert.equal(record.data.confirmed.generation,1);assert.notEqual(record.data.confirmed.path,firstPin.path);assert.deepEqual(await host.body(2),sameEffectBody);await assert.rejects(host.body(2,firstPin));
 await assert.rejects(api.checkpointOriginalDeviceGraphSourceObservationV2(service),/DEVICE_GRAPH_SOURCE_SECOND_CHECKPOINT_ONLY/);assert.deepEqual(await host.journal(2),record);
 await assert.rejects(api.reopenOriginalDeviceExternalFlatGraphSourceV2({tls:{},host:'127.0.0.1'}),/DEVICE_GRAPH_SOURCE_OLD_PROCESS_PRESENT/);assert.equal(host.counts.openAttempts,1);assert.equal(host.counts.effects,0);
 await service.close();assert.equal(host.counts.closed,3);assert.deepEqual(await host.journal(2),record);
});
