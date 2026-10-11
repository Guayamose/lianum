import {legacyDataRoot} from '@lianum/environment';
/** HOST only: real four operator keys, encrypted CAS stores and native issuer.
 * Runtime/system/readers/sources are explicit inert WeakMap substitutes. This
 * verifies retention boundaries; no native or financial acceptance is emitted. */
import test,{mock} from 'node:test';
import assert from 'node:assert/strict';
import {createHash,createPrivateKey,createPublicKey,randomUUID} from 'node:crypto';
import {mkdir,readFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {NATIVE_QUORUM_PROFILE} from '@lianum/engine/evidence/native-quorum';
const mapped=import.meta.url.includes('/wallet-platform/modules/operations/operators/native-value/');
const relative=mapped?{
 bootstrap:'../../../ops/native-value-local-operator-bootstrap-v4.mjs',operators:'../../../ops/native-value-operators-v4.mjs',system:'../../../ops/native-value-system-v2.mjs',
 runtime:'../../../chain-adapters/owned-evm-v2-runtime.mjs',health:'../../../chain-adapters/owned-evm-native-value-health-source-v4.mjs',
 reader:'../../../paeg/native-value-system-state-v2.mjs',issuer:'../../../native-claims/wrapped-recovery-authority-v1.mjs',
 store:'../../../native-claims/segmented-record-store.mjs',profile:'../../../chain-adapters/evm-native-value-v2.mjs',
 commitments:'../../../paeg/commitments.mjs'
}:{
 bootstrap:'../../../../src/operations/operators/native-value/native-value-local-operator-bootstrap-v4.mjs',
 operators:'../../../../src/operations/operators/native-value/native-value-operators-v4.mjs',
 system:'../../../../src/operations/deployments/native-value/native-value-system-v2.mjs',
 runtime:'../../../../src/chains/evm/runtime/owned-evm-v2-runtime.mjs',
 health:'../../../../src/chains/evm/health/owned-evm-native-value-health-source-v4.mjs',
 reader:'../../../../src/execution/native-value/reconciliation/native-value-system-state-v2.mjs',
 issuer:'../../../../src/claims/wrapped/recovery/wrapped-recovery-authority-v1.mjs',
 store:'../../../../src/claims/storage/segmented-record-store.mjs',
 profile:'../../../../src/chains/evm/transfers/evm-native-value-v2.mjs',
 commitments:'@lianum/components/encoding/commitments'};
const urls=Object.fromEntries(Object.entries(relative).map(([name,path])=>[name,new URL(path,import.meta.url).href]));
const native=new WeakSet(),systems=new WeakMap(),h=value=>createHash('sha256').update('INERT native bootstrap HOST:'+value).digest('hex');
const recoveryHostTokens=new WeakMap();
let operators;
// Keep actual decoders/source consumers used by the original wire modules.
// Importing these modules creates no runtime; backend subjects still follow mocks.
const [actualRuntime,actualHealth]=await Promise.all([import(urls.runtime),import(urls.health)]);

const inertHealthPorts={async describeOwnedLocalEvmNativeValueSource(value,index){assert.ok(native.has(value));return {
 publicNetwork:false,genesis:h('genesis'),chainId:'1',identity:{endpointIdentity:h('slot'+index),clientRelease:h('client'),chainConfiguration:h('configuration')}};},
 async createOwnedLocalEvmNativeValueHealthSource(){throw Error('HOST_NO_NATIVE_OBSERVATION_OR_SIGNATURE');}};
mock.module(urls.health,{exports:{...actualHealth,...inertHealthPorts}});
mock.module(urls.runtime,{exports:{...actualRuntime,...inertHealthPorts,isOwnedLocalEvmNativeValueRuntime:value=>native.has(value),
 assertOwnedLocalEvmNativeValueRuntimeLive(value){assert.ok(native.has(value),'HOST_ORIGINAL_NATIVE_RUNTIME');}}});
function original(runtime,system){assert.equal(systems.get(system)?.runtime,runtime,'HOST_ORIGINAL_SYSTEM');}
mock.module(urls.system,{exports:{assertOwnedNativeValueSystem:original,nativeValueOriginalRecoverySourceV1(runtime,system){original(runtime,system);return h('source');},nativeValueOperatorResources(runtime,system,token){
 original(runtime,system);const request=operators.consumeNativeValueOperatorBootstrapRequest(token,{runtime,system});
 return systems.get(system).resources[request.signerIndex];}}});
// The system substitute is installed before this import: keep real flat-word
// decoders without preloading the concrete system/bootstrap/operator subjects.
const actualReader=await import(urls.reader);
mock.module(urls.reader,{exports:{...actualReader,async createNativeValueSystemStateReader({runtime,system}){original(runtime,system);return {
 async read(){throw Error('HOST_NO_RECEIVER_INVENTORY');},async assertCurrent(){throw Error('HOST_NO_RECEIVER_INVENTORY');}};},
 assertNativeValueCurrentView(){throw Error('HOST_NO_RECEIVER_INVENTORY');}}});
// The whole economic issuer requires every original section. This HOST-only
// token port supplies the bootstrap section read back from the real AEAD issuer
// below; it makes no claim to restore a runtime or economic system authority.
const actualIssuer=await import(urls.issuer);
mock.module(urls.issuer,{exports:{...actualIssuer,consumeNativeEconomicRecoverySectionV1(token,section){
 const entry=recoveryHostTokens.get(token);
 if(!entry)return actualIssuer.consumeNativeEconomicRecoverySectionV1(token,section);
 assert.equal(section,'bootstrap');assert.equal(entry.used,false,'HOST_BOOTSTRAP_TOKEN_CONSUMED');entry.used=true;return structuredClone(entry.data);
}}});
// Backend imports follow mocks; ESM hoisting must not load concrete dependencies.
operators=await import(urls.operators);
const bootstrapModule=await import(urls.bootstrap),issuer=await import(urls.issuer),storeModule=await import(urls.store),profile=await import(urls.profile);
const fixedRoot=legacyDataRoot('wallet');
async function fixture(t){
 const runId=randomUUID(),directory=join(fixedRoot,'.local/native-value-economic-recovery-v1','attempt-'+runId,'private-audit');
 await mkdir(directory,{recursive:true,mode:0o700});
 const nativeRuntime={metadata:{restoredOriginalState:false}},runtime={};native.add(nativeRuntime);
 const bootstrap=await bootstrapModule.createOwnedLocalNativeValueOperatorBootstrap({nativeRuntimes:[nativeRuntime]});
 const registry={schema:profile.REGISTRY_SCHEMA,quorum:{profile:NATIVE_QUORUM_PROFILE,hubDomain:h('hub'),registryEpoch:'0',rulesRoot:bootstrap.metadata.rulesRoot.slice(2),keys:bootstrap.metadata.attesterKeys}};
 const system={profile:'OWNED_GENERIC_NATIVE_VALUE_SYSTEM_V2',claimsEnabled:false,registry,adapterProfiles:bootstrap.metadata.adapterProfiles};
 const resources=await bootstrapModule.provisionNativeValueOperators(bootstrap,{runtime,registry,adapterProfiles:system.adapterProfiles});systems.set(system,{runtime,resources});
 const handles=await bootstrapModule.finishNativeValueOperators(bootstrap,{runtime,system});Object.assign(system,handles);Object.freeze(system);
 const identity={directory,runId,sourceSHA256:h('source'),deadlineMs:Date.now()+60000};
 const authority=await issuer.createNativeEconomicRecoveryAuthorityV1(identity);
 // Release original lease/keys before deleting only this synthetic test scope.
 t.after(async()=>{try{await issuer.closeNativeEconomicRecoveryAuthorityV1(authority);}finally{try{bootstrap.close();}finally{await rm(join(directory,'..'),{recursive:true,force:true});}}});
 return {bootstrap,runtime,system,resources,handles,identity,authority};
}
async function retainedBootstrap(f){
 const secret=await readFile(join(f.identity.directory,'native-value-economic','synthetic-local-root.secret'));
 let reader;try{reader=await storeModule.observeClaimRecordStoreV1({path:join(f.identity.directory,'native-value-economic','authority.vault'),password:secret.toString('hex'),identity:{profile:'NATIVE_VALUE_ECONOMIC_RECOVERY_V1',...f.identity}});
 return (await reader.read()).data.sections.bootstrap.data;}finally{secret.fill(0);reader?.close();}
}
test('native bootstrap capture fences before await and preserves four original keys and CAS histories',async t=>{
 const f=await fixture(t),before=await Promise.all(f.resources.map(value=>value.store.load()));
 bootstrapModule.fenceOriginalNativeBootstrapEconomicRecoveryV1(f.bootstrap,f.authority);
 assert.throws(()=>f.bootstrap.retainOriginal({}),/NOT_LIVE/);assert.throws(()=>f.bootstrap.close(),/CAPTURE_OWNS_LIFETIME/);
 await assert.rejects(f.resources[0].store.load(),/NOT_LIVE/);
 const status=await issuer.retainNativeEconomicBootstrapV1(f.authority,f.bootstrap);assert.equal(status.phase,'CAPTURING');assert.equal(status.sections.bootstrap,'CAPTURED');
 const record=await retainedBootstrap(f);assert.deepEqual(record.metadata.attesterKeys,f.bootstrap.metadata.attesterKeys);
 for(let i=0;i<4;i++){
   assert.deepEqual(record.signers[i].record,before[i]);assert.deepEqual(record.stores[i].record,before[i]);
   const jwk=createPublicKey(createPrivateKey(record.signers[i].privateKeyPem)).export({format:'jwk'});
   assert.equal(jwk.crv,'secp256k1');assert.deepEqual({x:Buffer.from(jwk.x,'base64url').toString('hex'),y:Buffer.from(jwk.y,'base64url').toString('hex')},f.handles.operators[i].publicKey);
   assert.equal(f.handles.operators[i].status().closed,true);
 }
 await assert.rejects(issuer.openNativeEconomicRecoveryAuthorityV1(f.identity,status.checkpoint),/EEXIST/);
 assert.equal(Object.values(status.sections).filter(value=>value==='CAPTURED').length,1,'partial capture must not authorize whole reopen');
 // The issuer canonicalizes object keys. The historical inventory digest must
 // still validate against the exact original frame, without a journal rewrite.
 assert.equal(record.schema,'ORIGINAL_NATIVE_BOOTSTRAP_ECONOMIC_BINDING_RECOVERY_V2');
 const frameURL=new URL('./native-value-economic-binding-frame-v1.mjs',urls.bootstrap).href;
 const inventoryURL=new URL('./native-value-inventory-v4.mjs',urls.bootstrap).href;
 const frameCodec=await import(frameURL),inventory=await import(inventoryURL);
 for(let i=0;i<4;i++){
   const originalBinding=inventory.nativeValueInventoryBinding({registry:f.system.registry,profiles:f.system.adapterProfiles,
     signerIndex:String(i),publicKey:f.handles.operators[i].publicKey});
   const observed=record.signers[i].binding,digest=before[i].state.bindingDigest,frame=record.bindingFrames[i];
   assert.equal(JSON.stringify(observed)===frame.json,false,'canonical AEAD reordering must exercise the original failure');
   assert.equal(frame.json,JSON.stringify(originalBinding));assert.equal(frame.bindingDigest,digest);
   assert.throws(()=>inventory.validateNativeValueOperatorInventory(before[i].state,observed));
   const restored=frameCodec.restoreNativeValueEconomicBindingFrameV1(frame,observed,digest);
   assert.deepEqual(inventory.validateNativeValueOperatorInventory(before[i].state,restored),before[i].state);
   const wrongObserved=structuredClone(observed);wrongObserved.registry.quorum.registryEpoch='1';
   assert.throws(()=>frameCodec.restoreNativeValueEconomicBindingFrameV1(frame,wrongObserved,digest),/OBSERVED_BINDING_CHANGED/);
   const rewritten=frameCodec.captureNativeValueEconomicBindingFrameV1(observed,createHash('sha256').update(JSON.stringify(observed)).digest('hex'));
   assert.throws(()=>frameCodec.restoreNativeValueEconomicBindingFrameV1(rewritten,observed,digest),/ORIGINAL_BINDING_DIGEST/);
 }
 const token=Object.freeze(Object.create(null));recoveryHostTokens.set(token,{used:false,data:record});
 const nextNative={metadata:{restoredOriginalState:true}},nextRuntime={};native.add(nextNative);
 await assert.rejects(bootstrapModule.reopenOriginalNativeBootstrapEconomicRecoveryV1({...token},nextNative),/ORIGINAL_SECTION_TOKEN/);
 const mutatedToken=Object.freeze(Object.create(null)),mutatedRecord=structuredClone(record),mutatedNative={metadata:{restoredOriginalState:true}};
 mutatedRecord.bindingFrames[0].json+=' ';native.add(mutatedNative);recoveryHostTokens.set(mutatedToken,{used:false,data:mutatedRecord});
 await assert.rejects(bootstrapModule.reopenOriginalNativeBootstrapEconomicRecoveryV1(mutatedToken,mutatedNative),/BINDING_FRAME_DIGEST/);
 assert.deepEqual(record.stores.map(value=>value.record),before,'bad frames must not rewrite history');
 const successor=await bootstrapModule.reopenOriginalNativeBootstrapEconomicRecoveryV1(token,nextNative);t.after(()=>successor.close());
 const nextSystem={profile:'OWNED_GENERIC_NATIVE_VALUE_SYSTEM_V2',claimsEnabled:false,registry:record.registry,adapterProfiles:record.metadata.adapterProfiles};
 const resources=await bootstrapModule.provisionNativeValueOperators(successor,{runtime:nextRuntime,registry:nextSystem.registry,adapterProfiles:nextSystem.adapterProfiles});
 systems.set(nextSystem,{runtime:nextRuntime,resources});
 const handles=await bootstrapModule.finishNativeValueOperators(successor,{runtime:nextRuntime,system:nextSystem});
 Object.assign(nextSystem,handles);Object.freeze(nextSystem);
 assert.deepEqual(await Promise.all(resources.map(value=>value.store.load())),before);
 assert.deepEqual(handles.operators.map(operator=>operator.publicKey),f.handles.operators.map(operator=>operator.publicKey));
 assert.ok(handles.operators.every(operator=>operator.status().bound&&!operator.status().poisoned));
 await assert.rejects(bootstrapModule.reopenOriginalNativeBootstrapEconomicRecoveryV1(token,nextNative),/HOST_BOOTSTRAP_TOKEN_CONSUMED/);
});
test('a durable competing CAS write rejects capture and closes keys without resetting its journal',async t=>{
 const f=await fixture(t),old=await f.resources[0].store.load();
 await f.resources[0].store.commit({expectedRevision:old.revision,nextState:old.state});
 bootstrapModule.fenceOriginalNativeBootstrapEconomicRecoveryV1(f.bootstrap,f.authority);
 await assert.rejects(issuer.retainNativeEconomicBootstrapV1(f.authority,f.bootstrap),/HISTORY_CHANGED/);
 for(const operator of f.handles.operators)assert.equal(operator.status().closed,true);
 assert.equal(issuer.wrappedRecoveryAuthorityStatusV1(f.authority).uncertain,true);
});
test('copies, arbitrary keys and native/wrapped token substitution cannot restore a bootstrap',async t=>{
 const f=await fixture(t);
 assert.throws(()=>bootstrapModule.fenceOriginalNativeBootstrapEconomicRecoveryV1({...f.bootstrap},f.authority),/ORIGINAL_LOCAL_BOOTSTRAP/);
 await assert.rejects(bootstrapModule.reopenOriginalNativeBootstrapEconomicRecoveryV1(Object.freeze({schema:'ORIGINAL_NATIVE_BOOTSTRAP_ECONOMIC_RECOVERY_V1'}),{}),/ORIGINAL_SECTION_TOKEN/);
 assert.throws(()=>bootstrapModule.consumeNativeBootstrapOperatorRecoveryV1({signerIndex:0,privateKeyPem:'caller key'}),/ORIGINAL_OPERATOR_RECOVERY_TOKEN/);
 await assert.rejects(issuer.reopenWrappedRuntimeFromAuthorityV1(f.authority,'receiver'),/NATIVE_ECONOMIC_DISTINCT_RECOVERY_TOKEN/);
});

// Genuine AEAD issuer on an isolated HOST directory. This exercises the exact
// route that failed after F; no runtime/proof/section producer is fabricated.
test('native-note issuer root is selected only by its finite constructor and reopen',async t=>{
 for(const profile of ['native-value-economic-note-recovery-v1','native-value-durable-economic-note-recovery-v1',
   'native-value-private-durable-note-recovery-v2','native-value-private-authorized-durable-note-recovery-v2',
   'native-value-private-worker-durable-note-recovery-v3']){
 const runId=randomUUID(),directory=join(fixedRoot,'.local/'+profile,'attempt-'+runId,'private-audit');
 const identity={directory,runId,sourceSHA256:h('note-source'),deadlineMs:Date.now()+60000};
 const legacy={...identity,directory:join(fixedRoot,'.local/native-value-economic-recovery-v1','attempt-'+runId,'private-audit')};
 await mkdir(directory,{recursive:true,mode:0o700});
 let authority;
 t.after(async()=>{try{if(authority)await issuer.closeNativeEconomicRecoveryAuthorityV1(authority);}
   finally{await rm(join(directory,'..'),{recursive:true,force:true});}});
 await assert.rejects(issuer.createNativeEconomicRecoveryAuthorityV1(identity),/NATIVE_ECONOMIC_FIXED_PRIVATE_DIRECTORY/);
 await assert.rejects(issuer.createNativeEconomicNoteRecoveryAuthorityV1(legacy),/NATIVE_ECONOMIC_FIXED_PRIVATE_DIRECTORY/);
 await assert.rejects(issuer.createNativeEconomicNoteRecoveryAuthorityV1({...identity,directory:join(directory,'..')}),/NATIVE_ECONOMIC_FIXED_PRIVATE_DIRECTORY/);
 assert.throws(()=>issuer.createNativeEconomicNoteRecoveryAuthorityV1(identity,{nativeNotes:true}),{name:'AssertionError'});
 authority=await issuer.createNativeEconomicNoteRecoveryAuthorityV1(identity);
 const status=issuer.wrappedRecoveryAuthorityStatusV1(authority),capture=issuer.assertNativeEconomicRecoveryCaptureV1(authority);
 assert.equal(capture.directory,directory);assert.equal(capture.sourceSHA256,identity.sourceSHA256);
 assert.deepEqual(Object.keys(status.sections).sort(),['receiver','graphNative','bootstrap','system','provider','owner','executor','account','session','actor'].sort());
 assert.ok(Object.values(status.sections).every(value=>value==='ABSENT'));
 assert.throws(()=>issuer.assertNativeEconomicRecoveryCaptureV1({...authority}),/ORIGINAL_IDLE_AUTHORITY/);
 await assert.rejects(issuer.openNativeEconomicRecoveryAuthorityV1(identity,status.checkpoint),/NATIVE_ECONOMIC_FIXED_PRIVATE_DIRECTORY/);
 await assert.rejects(issuer.openNativeEconomicNoteRecoveryAuthorityV1(legacy,status.checkpoint),/NATIVE_ECONOMIC_FIXED_PRIVATE_DIRECTORY/);
 await issuer.closeNativeEconomicRecoveryAuthorityV1(authority);authority=null;
 // An accepted directory is not capture authority: missing original sections
 // still reject before any runtime/account/owner is reconstructed.
 await assert.rejects(issuer.openNativeEconomicNoteRecoveryAuthorityV1(identity,status.checkpoint),/CAPTURE_NOT_COMPLETE/);
 }
});
