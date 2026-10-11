import {legacyDataRoot} from '@lianum/environment';
/** HOST only: original provider key/signature, Vault AEAD/CAS and issuer AEAD.
 * Native processes/system/quorum/recipient/proofs/journal decoding are explicit
 * private inert substitutes. No test supplies financial or chain acceptance. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdir,rm,readFile,writeFile,lstat,utimes} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';

const mapped=fileURLToPath(import.meta.url).endsWith('/wallet-platform/modules/chain-adapters/native-provider-economic-recovery-v1.test.mjs');
const relative=mapped?{
 "provider": "./native-value-dispatch-owner-v2.mjs",
 "system": "../ops/native-value-system-v2.mjs",
 "quorum": "../ops/native-value-operators-v4.mjs",
 "bootstrap": "../ops/native-value-local-operator-bootstrap-v4.mjs",
 "runtime": "./owned-evm-v2-runtime.mjs",
 "reader": "../paeg/native-value-system-state-v2.mjs",
 "recipient": "../../../../../omnichain-product/src/paeg/native-recipient-process.mjs",
 "binding": "./native-value-dispatch-binding-v2.mjs",
 "journal": "./native-value-dispatch-journal-v2.mjs",
 "gate": "./native-value-evm-dispatch-gate.mjs",
 "profile": "./evm-native-value-v2.mjs",
 "authority": "../native-claims/wrapped-recovery-authority-v1.mjs",
 "admission": "../../../../../omnichain-product/src/paeg/native-admission.mjs",
 "vault": "../../../../../omnichain-product/src/vault.mjs"
}: {
 provider:'../../../../src/chains/shared/dispatch/native-value-dispatch-owner-v2.mjs',system:'../../../../src/operations/deployments/native-value/native-value-system-v2.mjs',
 quorum:'../../../../src/operations/operators/native-value/native-value-operators-v4.mjs',bootstrap:'../../../../src/operations/operators/native-value/native-value-local-operator-bootstrap-v4.mjs',
 runtime:'../../../../src/chains/evm/runtime/owned-evm-v2-runtime.mjs',reader:'../../../../src/execution/native-value/reconciliation/native-value-system-state-v2.mjs',
 recipient:'../../../../src/execution/native/recipients/native-recipient-process.mjs',binding:'../../../../src/chains/shared/dispatch/native-value-dispatch-binding-v2.mjs',
 journal:'../../../../src/chains/shared/dispatch/native-value-dispatch-journal-v2.mjs',gate:'../../../../src/chains/evm/dispatch/native-value-evm-dispatch-gate.mjs',
 profile:'../../../../src/chains/evm/transfers/evm-native-value-v2.mjs',authority:'../../../../src/claims/wrapped/recovery/wrapped-recovery-authority-v1.mjs',
 admission:'../../../../../engine/src/execution/native/dispatch/native-admission.mjs',
 vault:'../../../../../engine/src/crypto/vault.mjs',
};
relative.source=mapped?'../ops/native-original-source-lifecycle-v1.mjs':'../../../../src/operations/recovery/native-original-source-lifecycle-v1.mjs';
const urls=Object.fromEntries(Object.entries(relative).map(([key,path])=>[key,new URL(path,import.meta.url).href]));
const fixedRoot=legacyDataRoot('wallet');

// The same explicit HOST setup is evaluated in a fresh process for one-use
// reopen. Only test substitutes are recreated, never native economic brands.
async function setup(urls){
 const {mock}=await import('node:test'),assert=(await import('node:assert/strict')).default;
 const {createHash,createPublicKey,verify}=await import('node:crypto');
 const h=v=>createHash('sha256').update('INERT provider recovery HOST:'+v).digest('hex'),copy=v=>structuredClone(v);
 // Explicit inert SOURCE issuer ports: the provider and Vault/CAS/signature
 // bodies remain actual; no capsule, process recovery or financial authority
 // is established by these HOST tokens.
 const originalRuntime=await import(urls.runtime);
 const sourceTokens=new WeakMap(),sourceHandles=new WeakMap();
 function sourceToken(data=null){const token=Object.freeze(Object.create(null));sourceTokens.set(token,{data,consumed:false,handle:null});return token;}
 const sourceWrites=[];
 const unusedSourceRuntime=()=>{throw Error('HOST_SOURCE_RUNTIME_PORT_NOT_USED');};
 mock.module(urls.source,{exports:{
  consumeOriginalNativeSourceRuntimeRequestV1:unusedSourceRuntime,
  originalNativeSourceRuntimeRequestIdentityV1:unusedSourceRuntime,
  readOriginalNativeSourceRuntimeSeedV1:unusedSourceRuntime,
  retainOriginalNativeSourceRuntimeSeedV1:unusedSourceRuntime,
  resumeOriginalNativeSourceRuntimeSeedV1:unusedSourceRuntime,
  originalNativeSourceRuntimeOwnedProcessV1:unusedSourceRuntime,
  readOriginalNativeSourceRuntimeStateV1:unusedSourceRuntime,
  attachOriginalNativeSourceRuntimeV1:unusedSourceRuntime,
  beginOriginalNativeSourceMutationV1:unusedSourceRuntime,
  confirmOriginalNativeSourceMutationV1:unusedSourceRuntime,
  confirmOriginalNativeSourceBirthV1:unusedSourceRuntime,
  nativeSourceRecoverySectionIdentityV1(token,section){assert.equal(section,'provider');assert.ok(sourceTokens.has(token),'HOST_ORIGINAL_SOURCE_TOKEN');return {profile:'NATIVE_VALUE_DURABLE_SOURCE_RECOVERY_V1',directory:'EXPLICIT_INERT_HOST',runId:'EXPLICIT_INERT_HOST',sourceSHA256:h('source'),deadlineMs:Date.now()+60000};},
  async nativeSourceRecoveryOwnedProcessV1(token,section,pid){assert.ok(sourceTokens.has(token));assert.equal(section,'provider');assert.equal(pid,process.pid);return {pid,startTicks:'1',uid:process.getuid(),pgrp:pid,session:pid};},
  async retainOriginalNativeSourceSectionV1(token,section,data){assert.equal(section,'provider');const state=sourceTokens.get(token);assert.ok(state&&!state.handle);const handle=Object.freeze(Object.create(null));state.handle=handle;state.data=copy(data);sourceHandles.set(handle,state);sourceWrites.push(copy(data));return handle;},
  async updateOriginalNativeSourceSectionV1(handle,data){const state=sourceHandles.get(handle);assert.ok(state);state.data=copy(data);sourceWrites.push(copy(data));},
  consumeOriginalNativeSourceSectionV1(token,section){assert.equal(section,'provider');const state=sourceTokens.get(token);assert.ok(state&&!state.consumed);state.consumed=true;return copy(state.data);},
  resumeOriginalNativeSourceSectionV1(token,section){assert.equal(section,'provider');const state=sourceTokens.get(token);assert.ok(state?.consumed);const handle=Object.freeze(Object.create(null));sourceHandles.set(handle,state);return handle;},
 }});
 const systems=new WeakMap(),native=new WeakMap(),recipients=new WeakSet(),bindRequests=new WeakMap();
 const original=(runtime,system)=>assert.equal(systems.get(system)?.runtime,runtime,'HOST_ORIGINAL_ECONOMIC_SYSTEM');
 mock.module(urls.system,{exports:{assertOwnedNativeValueSystem:original,nativeValueOriginalRecoverySourceV1(runtime,system){original(runtime,system);return h('source');}}});
 mock.module(urls.quorum,{exports:{assertOwnedNativeValueQuorum(quorum,{runtime,system}){original(runtime,system);assert.equal(system.quorum,quorum);}}});
 mock.module(urls.bootstrap,{exports:{assertNativeValueOperatorBootstrapForSystem(bootstrap,{runtime,system}){original(runtime,system);assert.equal(systems.get(system).bootstrap,bootstrap);return bootstrap.metadata;},
  assertNativeValueBootstrapNativeRuntime(bootstrap,{runtime,system,nativeRuntime}){original(runtime,system);assert.equal(systems.get(system).bootstrap,bootstrap);assert.ok(native.has(nativeRuntime));}}});
 mock.module(urls.runtime,{exports:{...originalRuntime,
  assertOwnedLocalEvmNativeValueRuntime(runtime){assert.ok(native.has(runtime),'HOST_ORIGINAL_NATIVE_RUNTIME');},
  // This explicit inert EVM family has no Base/Nitro/BSC client. Original
  // module pins are exercised by the actual runtime, never replaced here.
  async openOriginalOwnedRollupNativeValueSourcesV1(runtime){assert.ok(native.has(runtime),'HOST_ORIGINAL_NATIVE_RUNTIME');return null;},
  assertOwnedLocalEvmObservedClockV1(){throw Error('HOST_UNUSED_TRON');}}});
 mock.module(urls.reader,{exports:{async createNativeValueSystemStateReader({runtime,system}){original(runtime,system);const view=Object.freeze({financialAcceptance:false});return {async read(){return view;},async assertCurrent(actual){assert.equal(actual,view);}};}}});
 mock.module(urls.recipient,{exports:{assertOwnedNativeRecipientProcess(value){assert.ok(recipients.has(value),'HOST_ORIGINAL_RECIPIENT');}}});
 const equal=(a,b)=>assert.deepEqual(a,b,'HOST_BINDING_REBOUND');
 mock.module(urls.binding,{exports:{normalizeNativeValueDispatchBinding:copy,equal,sha256:v=>createHash('sha256').update(v).digest('hex'),
  async bindNativeValueDispatchRequest(binding,request){assert.equal(request.hostBoundary,true);return {hostBoundary:true,leaseId:binding.leaseId};}}});
 const state=raw=>copy(raw.events.at(-1)?.data??{phase:'BOUND',intent:null,providerKeyStarted:false,dispatchSignature:null,sendStarted:false,signed:null});
 mock.module(urls.journal,{exports:{createNativeValueDispatchJournal(){return {schema:'INERT_HOST_JOURNAL',events:[]};},readNativeValueDispatchJournal(_binding,raw){assert.equal(raw.schema,'INERT_HOST_JOURNAL');return state(raw);},assertNativeValueRetainedIntent:(_binding,intent)=>copy(intent)}});
 mock.module(urls.gate,{exports:{consumeNativeValueProviderBindRequest(request,expected){assert.deepEqual(bindRequests.get(request),expected,'HOST_ORIGINAL_BIND_REQUEST');bindRequests.delete(request);}}});
 const profileModule=await import(urls.profile),admission=await import(urls.admission),provider=await import(urls.provider),authority=await import(urls.authority),{Vault}=await import(urls.vault);
 function contexts(directory){
  const genesis=h('genesis'),profile=profileModule.createProfile({chain:'ethereum',genesisHash:'0x'+genesis,sourceSetRoot:h('sources'),maximumAncestry:'32',maximumEvidenceLifetime:'300',maximumBlockAgeMs:'10000',maximumClockSkewMs:'30000',maximumQueryMs:'1000'});
  const registry={quorum:{keys:[]}},bootstrap={metadata:{adapterProfiles:[{profile}],attesterKeys:[]},retainOriginal(){throw Error('HOST_NO_RETAIN_OR_BROADCAST');}};
  const runtime={metadata:{evmGenesis:'0x'+h('receiver'),chainId:'31337'}},domain={scope:h('scope'),policy:h('policy'),asset:h('asset'),hubDomain:h('hub'),registryCommitment:h('registry'),ledgerNamespace:h('hub')};
  const system={registry,adapterProfiles:bootstrap.metadata.adapterProfiles,quorum:Object.freeze({}),hub:{address:'0x'+'77'.repeat(20)},pools:[{address:'0x'+'11'.repeat(20),domain}],async verify(){return true;}};
  const control={reads:0,wait:null},nativeRuntime={metadata:{scratchDirectory:directory,chainId:'1',evmGenesis:'0x'+genesis},accounts:['0x'+'22'.repeat(20)],
   async assertNativeValuePreparedCurrent(){throw Error('HOST_NO_SEND_CAPABILITY');},async observeNativeValueOriginal(query){control.reads++;if(control.wait)await control.wait;return {status:'unknown',nativeId:query.nativeId,nativeWire:null};}};
  systems.set(system,{runtime,bootstrap});native.set(nativeRuntime,control);return {runtime,system,nativeRuntime,bootstrap,control};
 }
 async function create(directory){
  const c=contexts(directory),profile=c.system.adapterProfiles[0].profile,pool=c.system.pools[0];
  const custody=await provider.createOwnedNativeValueProviderCustody({runtime:c.runtime,system:c.system,nativeRuntime:c.nativeRuntime,bootstrap:c.bootstrap,poolIndex:0,
   profileCommitment:profileModule.profileCommitment(profile),recipientEndpoint:'0x'+'33'.repeat(20),terms:{scope:pool.domain.scope,policy:pool.domain.policy,asset:pool.domain.asset,amount:'100',executionFrom:'1100',executionUntil:'1132',settleBefore:'1200'},
   acceptedLossClause:admission.NATIVE_ADMISSION_LOSS_CLAUSE,directory,password:'INERT_HOST_synthetic_provider_password'});
  const offer=custody.offer(),recipient={async acceptedQuote(){return {...pool.domain,action:{...offer.actionTemplate,receiptKeyCommitment:h('K'),receiptRho:h('rho'),deliveryRiskCommitment:h('loss'),actionSalt:h('salt')},payoutCommitment:h('payout'),deliveryRiskSalt:h('lossSalt')};}};
  // acceptedQuote has only the original seven fields, not the domain extras.
  recipient.acceptedQuote=async()=>({scope:pool.domain.scope,policy:pool.domain.policy,asset:pool.domain.asset,hubDomain:pool.domain.hubDomain,registryCommitment:pool.domain.registryCommitment,
   action:{...offer.actionTemplate,receiptKeyCommitment:h('K'),receiptRho:h('rho'),deliveryRiskCommitment:h('loss'),actionSalt:h('salt')},payoutCommitment:h('payout'),deliveryRiskSalt:h('lossSalt')});
  recipients.add(recipient);await custody.bindQuote({recipientCustody:recipient});
  const lease=await custody.bindDispatch({request:{hostBoundary:true,dependencyProof:{proof:'11'.repeat(32),publicInputs:['0']},readyProof:{proof:'22'.repeat(32),publicInputs:['0']}}});
  const resources=await open(lease,c);return {...c,custody,lease,resources,key:offer.providerKey};
 }
 async function open(lease,c){const request=Object.freeze({});bindRequests.set(request,{runtime:c.runtime,system:c.system,poolIndex:0,lease});return provider.openNativeValueDispatchLease(lease,{runtime:c.runtime,system:c.system,poolIndex:0},request);}
 async function signedUnknown(f){
  const statement={hubDomain:h('hub'),registryCommitment:h('registry'),readyStatement:h('ready'),localCommitment:h('local'),dispatchId:h('dispatch'),actionCommitment:h('action'),globalEffectId:h('gid'),deliveryRiskCommitment:h('loss'),signedAt:'1101'};
  let record=await f.resources.store.load();const pending={phase:'PROVIDER_KEY_PENDING',intent:null,providerKeyStarted:true,dispatchStatement:statement,dispatchSignature:null,sendStarted:false,signed:{nativeId:h('nativeId'),nativeWire:'INERT_HOST_PUBLIC_WIRE'}};
  record=await f.resources.store.commit({expectedRevision:record.revision,nextState:{...record.state,events:[...record.state.events,{kind:'INERT_PENDING',data:pending}]}});
  const signature=await f.resources.signDispatchOnce(statement),pub=createPublicKey({format:'jwk',key:{kty:'EC',crv:'secp256k1',x:Buffer.from(f.key.x,'hex').toString('base64url'),y:Buffer.from(f.key.y,'hex').toString('base64url')}});
  assert.equal(verify('sha256',admission.nativeDispatchStatementFrame(statement),{key:pub,dsaEncoding:'ieee-p1363'},Buffer.from(signature,'hex')),true);
  return f.resources.store.commit({expectedRevision:record.revision,nextState:{...record.state,events:[...record.state.events,{kind:'INERT_UNKNOWN',data:{...pending,phase:'UNKNOWN',dispatchSignature:signature,sendStarted:true}}]}});
 }
 return {h,create,contexts,open,signedUnknown,provider,authority,Vault,sourceToken,sourceWrites,sourceSnapshot(token){return copy(sourceTokens.get(token).data);},closeSystem(c){systems.delete(c.system);}};
}
const host=await setup(urls);
async function fixture(t,release=false){
 let created;const runId=randomUUID(),directory=join(fixedRoot,'.local/native-provider-economic-recovery-v1','attempt-'+runId,'private-audit');
 await mkdir(directory,{recursive:true,mode:0o700});t.after(async()=>{try{if(release&&created){await created.resources.close();await host.authority.closeNativeProviderRecoveryAuthorityV1(created.owner);}}finally{await rm(resolve(directory,'..'),{recursive:true,force:true});}});
 const nativeDirectory=join(directory,'native');await mkdir(nativeDirectory,{mode:0o700});
 const identity={directory,runId,sourceSHA256:host.h('source'),deadlineMs:Date.now()+60000},f=await host.create(nativeDirectory);
 const owner=await host.authority.createNativeProviderRecoveryAuthorityV1(identity);created={...f,owner,identity,nativeDirectory};return created;
}
async function freshProcess(input,body){
 const source=`const input=JSON.parse(process.argv[1]);const host=await (${setup.toString()})(input.urls);${body}`;
 const child=spawn(process.execPath,['--max-old-space-size=384','--experimental-test-module-mocks','--input-type=module','--eval',source,JSON.stringify({...input,urls})],{stdio:['ignore','pipe','pipe'],env:{...process.env,NODE_OPTIONS:''}});
 let stdout='',stderr='';child.stdout.on('data',b=>stdout+=b);child.stderr.on('data',b=>stderr+=b);
 const closed=new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',(code,signal)=>resolve({code,signal}));}),timer=setTimeout(()=>child.kill('SIGTERM'),15000);
 try{const result=await closed;assert.equal(result.code,0,stderr);assert.equal(result.signal,null);assert.throws(()=>process.kill(child.pid,0),{code:'ESRCH'});return JSON.parse(stdout);}
 finally{clearTimeout(timer);if(child.exitCode===null&&child.signalCode===null){child.kill('SIGTERM');await closed;}}
}

test('capture fences all original resources before await and rejects an active native observation',async t=>{
 const f=await fixture(t);let resume;f.control.wait=new Promise(resolve=>resume=resolve);
 const pending=f.resources.observeOriginal({nativeId:host.h('nativeId')});
 assert.throws(()=>host.provider.retainOwnedNativeProviderEconomicRecoveryV1(f.custody,f.owner),/CAPTURE_BUSY/);
 resume();await pending;f.control.wait=null;
 const work=host.provider.retainOwnedNativeProviderEconomicRecoveryV1(f.custody,f.owner);
 assert.throws(()=>f.custody.offer(),/CLOSED_OR_UNCERTAIN/);await assert.rejects(f.resources.store.load(),/CLOSED_OR_UNCERTAIN/);
 assert.throws(()=>f.resources.close(),/CAPTURE_OWNS_LIFETIME/);
 const checkpoint=await work;assert.equal(f.custody.report().closed,true);
 await assert.rejects(host.authority.openNativeProviderRecoveryAuthorityV1(f.identity,checkpoint),/NEW_PROCESS_REQUIRED/);
 assert.throws(()=>host.provider.retainOwnedNativeProviderEconomicRecoveryV1({...f.custody},f.owner),/ORIGINAL_PROVIDER_CUSTODY/);
 assert.throws(()=>host.authority.consumeNativeProviderRecoverySectionV1(Object.freeze({})),/ORIGINAL_SECTION_TOKEN/);
});

test('new-process reopen preserves the same signed UNKNOWN wire, key use, CAS history and windows',async t=>{
 const f=await fixture(t),before=await host.signedUnknown(f),checkpoint=await host.provider.retainOwnedNativeProviderEconomicRecoveryV1(f.custody,f.owner);
 const result=await freshProcess({identity:f.identity,checkpoint,nativeDirectory:f.nativeDirectory,key:f.key,record:before},`
  const assert=(await import('node:assert/strict')).default;
  const owner=await host.authority.openNativeProviderRecoveryAuthorityV1(input.identity,input.checkpoint),c=host.contexts(input.nativeDirectory);
  const custody=await host.authority.reopenNativeProviderFromAuthorityV1(owner,{runtime:c.runtime,system:c.system,nativeRuntime:c.nativeRuntime,bootstrap:c.bootstrap});
  assert.deepEqual(custody.offer().providerKey,input.key);assert.equal(custody.offer().actionTemplate.executionUntil,'1132');
  const lease=host.provider.takeOriginalNativeProviderRecoveredLeaseV1(custody);assert.throws(()=>host.provider.takeOriginalNativeProviderRecoveredLeaseV1(custody),/ORIGINAL_RECOVERED_LEASE/);
  const resources=await host.open(lease,c);assert.deepEqual(await resources.store.load(),input.record);
  assert.throws(()=>resources.signDispatchOnce(input.record.state.events.at(-1).data.dispatchStatement),/KEY_ALREADY_STARTED/);
  await assert.rejects(resources.store.commit({expectedRevision:input.record.revision,nextState:input.record.state}),/APPEND_EXACTLY_ONE_EVENT/);
  assert.deepEqual(await resources.observeOriginal(input.record.state.events.at(-1).data.signed),{status:'unknown',nativeId:host.h('nativeId'),nativeWire:null});
  assert.equal(c.control.reads,1);await resources.close();assert.equal(custody.report().closed,true);
  await assert.rejects(host.authority.openNativeProviderRecoveryAuthorityV1(input.identity,input.checkpoint),/CHECKPOINT_CHANGED|CAPTURE_NOT_COMPLETE|ALREADY_CLAIMED/);
  process.stdout.write(JSON.stringify({ok:true,financialAcceptance:false,originalKey:true,phase:'UNKNOWN',resends:0}));
 `);
 assert.deepEqual(result,{ok:true,financialAcceptance:false,originalKey:true,phase:'UNKNOWN',resends:0});
});

test('authenticated current-head corruption fails before reopen; snapshot copies do not mint a token',async t=>{
 const f=await fixture(t),checkpoint=await host.provider.retainOwnedNativeProviderEconomicRecoveryV1(f.custody,f.owner);
 const path=join(f.identity.directory,'native-provider-economic/authority.vault/HEAD'),value=JSON.parse(await readFile(path,'utf8'));
 function flip(item){if(item&&typeof item==='object')for(const name of Object.keys(item)){if(name==='ciphertext'&&typeof item[name]==='string'&&item[name].length){item[name]=(item[name][0]==='0'?'1':'0')+item[name].slice(1);return true;}if(flip(item[name]))return true;}return false;}
 assert.equal(flip(value),true);await writeFile(path,JSON.stringify(value),{mode:0o600});
 await assert.rejects(host.authority.openNativeProviderRecoveryAuthorityV1(f.identity,checkpoint),{code:'CLAIM_STORE_AUTHENTICATION'});
 await assert.rejects(host.provider.reopenOriginalNativeProviderEconomicRecoveryV1(Object.freeze({schema:'ORIGINAL_NATIVE_PROVIDER_ECONOMIC_RECOVERY_V1'}),{runtime:f.runtime,system:f.system,nativeRuntime:f.nativeRuntime,bootstrap:f.bootstrap}),/ORIGINAL_SECTION_TOKEN/);
});


test('provider current reads fresh ciphertext without KDF, while original CAS and key use authenticate the complete Vault',async t=>{
 const f=await fixture(t,true);
 const original=host.Vault.prototype.read;let reads=0;
 t.mock.method(host.Vault.prototype,'read',async function(password){if(this.path===join(f.nativeDirectory,'native-value-provider.vault'))reads++;return original.call(this,password);});
 const initial=await f.resources.store.load();
 for(let i=0;i<3;i++){assert.deepEqual(await f.resources.store.load(),initial);await f.resources.assertLeaseCurrent();}
 assert.equal(reads,0,'current reads must verify the file without repeating scrypt');
 const unknown=await host.signedUnknown(f);
 assert.equal(reads,5,'two original CAS decrypt/readbacks and full signer authentication');
 assert.deepEqual(await f.resources.store.load(),unknown);assert.equal(reads,5);
 const path=join(f.nativeDirectory,'native-value-provider.vault');await utimes(path,2000000,2000000);
 const before=await lstat(path),raw=await readFile(path,'utf8');
 const envelope=JSON.parse(raw);envelope.ciphertext=(envelope.ciphertext[0]==='A'?'B':'A')+envelope.ciphertext.slice(1);
 const changed=JSON.stringify(envelope);assert.equal(Buffer.byteLength(changed),before.size);await writeFile(path,changed);await utimes(path,before.atime,before.mtime);
 const after=await lstat(path);for(const field of ['dev','ino','mode','uid','gid','nlink','size','mtimeMs'])assert.equal(after[field],before[field]);
 await assert.rejects(f.resources.store.load(),error=>{
  assert.match(error.message,/NATIVE_VALUE_PROVIDER_ORIGINAL_CUSTODY_UNAVAILABLE/);
  assert.notEqual(error.cause.actual.sha256,error.cause.expected.sha256,'the fresh ciphertext hash rejects tamper despite unchanged identity/size/mtime');return true;
 });
 assert.equal(reads,5);assert.equal(f.custody.report().persistenceUncertain,true);
});

test('provider key intent burns before authentication and rejects lifetime closure during the original read',async t=>{
 const f=await fixture(t,true);
 const statement={hubDomain:host.h('hub'),registryCommitment:host.h('registry'),readyStatement:host.h('ready'),localCommitment:host.h('local'),dispatchId:host.h('dispatch'),actionCommitment:host.h('action'),globalEffectId:host.h('gid'),deliveryRiskCommitment:host.h('loss'),signedAt:'1101'};
 const old=await f.resources.store.load(),pending={phase:'PROVIDER_KEY_PENDING',intent:null,providerKeyStarted:true,dispatchStatement:statement,dispatchSignature:null,sendStarted:false,signed:{nativeId:host.h('nativeId'),nativeWire:'INERT_HOST_PUBLIC_WIRE'}};
 await f.resources.store.commit({expectedRevision:old.revision,nextState:{...old.state,events:[...old.state.events,{kind:'INERT_PENDING',data:pending}]}});
 let reached,resume;const entered=new Promise(resolve=>reached=resolve),held=new Promise(resolve=>resume=resolve),original=host.Vault.prototype.read;
 t.mock.method(host.Vault.prototype,'read',async function(password){const value=await original.call(this,password);if(this.path===join(f.nativeDirectory,'native-value-provider.vault')){reached();await held;}return value;});
 const signing=f.resources.signDispatchOnce(statement);assert.throws(()=>f.resources.signDispatchOnce(statement),/KEY_ALREADY_STARTED/);await entered;
 assert.throws(()=>f.resources.close(),/CLOSE_BUSY/);host.closeSystem(f);resume();
 await assert.rejects(signing,/NATIVE_VALUE_PROVIDER_ORIGINAL_CUSTODY_UNAVAILABLE/);
 assert.equal(f.custody.report().persistenceUncertain,true);assert.equal(f.control.reads,0);
});

// One causal case exercises the same provider seed and both original CAS paths.
// Native transport, lower issuer and economic system are inert ports above.
test('HOST SOURCE provider retains original key and lease, and leaves candidate after lost CAS reply',async t=>{
 const f=await fixture(t),token=host.sourceToken();t.after(()=>f.resources.close());
 await assert.rejects(host.provider.retainOriginalNativeSourceProviderV1(Object.freeze({}),f.custody),/HOST_ORIGINAL_SOURCE_TOKEN/);
 const retained=await host.provider.retainOriginalNativeSourceProviderV1(token,f.custody);assert.equal(retained.originalResourcesStopped,false);
 let source=host.sourceSnapshot(token);assert.equal(source.candidate,null);assert.equal(source.confirmed.lease.opened,true);assert.equal(source.confirmed.lease.keyStarted,false);
 assert.deepEqual(source.confirmed.record.data.publicKey,f.key);
 await host.signedUnknown(f);source=host.sourceSnapshot(token);
 assert.equal(source.candidate,null);assert.equal(source.confirmed.lease.keyStarted,true);
 const before=await f.resources.store.load(),confirmed=structuredClone(source.confirmed),update=host.Vault.prototype.update;
 const firstError=Error('EXPLICIT_HOST_LOST_PROVIDER_CAS_REPLY');let injected=false;
 host.Vault.prototype.update=async function(password,revision,transform){
  if(!injected&&this.path===join(f.nativeDirectory,'native-value-provider.vault')){injected=true;await update.call(this,password,revision,transform);throw firstError;}
  return update.call(this,password,revision,transform);
 };
 try{await assert.rejects(f.resources.store.commit({expectedRevision:before.revision,nextState:{...before.state,events:[...before.state.events,{kind:'INERT_UNKNOWN',data:{...before.state.events.at(-1).data}}]}}),/CUSTODY_WRITE_UNCERTAIN/);}
 finally{host.Vault.prototype.update=update;}
 source=host.sourceSnapshot(token);assert.deepEqual(source.confirmed,confirmed);assert.equal(source.candidate.kind,'PROVIDER_VAULT_CAS');
 assert.equal(source.candidate.record.revision,confirmed.record.revision+1);assert.equal(f.custody.report().persistenceUncertain,true);
 const reader=host.sourceToken(source);
 await assert.rejects(host.provider.reopenOriginalNativeSourceProviderV1(reader,{runtime:f.runtime,system:f.system,nativeRuntime:f.nativeRuntime,bootstrap:f.bootstrap}),/NATIVE_SOURCE_PROVIDER_PENDING/);
 assert.ok(host.sourceWrites.some(row=>row.candidate!==null));assert.equal(f.control.reads,0);
});
