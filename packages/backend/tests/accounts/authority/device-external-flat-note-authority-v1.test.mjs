/** HOST only: real Vault AES/CAS + original PC23 codecs + actual actor bodies.
 * Synthetic owned ports are explicit; no EVM, native node or proof is started,
 * and this test establishes no financial/mobile/hardware acceptance. */
import test,{mock} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash,createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';
import {registerHooks,stripTypeScriptTypes} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createBalanceNote,walletDepositInput} from '../../../../engine/src/wallet/notes/private-wallet-note-encoding.mjs';
import {derivePrivateAssetIdentity} from '../../../../engine/src/notes/private-asset-runtime.mjs';
import * as P from '../../../../mobile-protocol/src/device-external-flat-note-v1.mjs';
const generated=fileURLToPath(import.meta.url).endsWith('/wallet-platform/modules/global-state/device-external-flat-note-authority-v1.test.mjs');
const url=(raw,mapped)=>new URL(generated?mapped:raw,import.meta.url);
const {devicePublicKey,signDeviceMessage}=await import(url('../../../../../apps/mobile/src/custody/signing.mjs','../../../../../../../apps/mobile/src/custody/signing.mjs'));
const runtimeURL=url('../../../src/chains/evm/runtime/owned-evm-v2-runtime.mjs','../chain-adapters/owned-evm-v2-runtime.mjs');
const facadeURL=url('../../../src/chains/evm/runtime/local-evm-ownership.mjs','../chain-adapters/local-evm-ownership.mjs');
const systemURL=url('../../../src/operations/deployments/system/deploy-system.mjs','../ops/deploy-system.mjs');
const assetURL=url('../../../src/chains/shared/contracts/owned-pool-asset.mjs','../chain-adapters/owned-pool-asset.mjs');
const readerURL=url('../../../src/execution/account/reconciliation/flat-system-state.mjs','../paeg/flat-system-state.mjs');
const observerURL=url('../../../../custody/src/observers/flat-owner-observer.mjs','../../../mobile-core/flat-owner-observer.mjs');
const proofURL=url('../../../../engine/src/execution/proofs/proof-process.mjs','../../../../../omnichain-product/src/paeg/proof-process.mjs');
const accountURL=url('../../../src/accounts/authority/device-external-flat-note-authority-v1.mjs','./device-external-flat-note-authority-v1.mjs');
const brands={runtime:new WeakSet(),system:new WeakSet(),asset:new WeakSet(),observer:new WeakMap()};let view,worker=0,send=0,workerClose=0,deployed=0;
// Preserve all unrelated original exports at mock boundaries. Only explicit
// synthetic ownership/read/proof ports are replaced for this HOST process.
for(const [where,overrides]of [
 [runtimeURL,{assertOwnedLocalEvmV2:r=>assert.ok(brands.runtime.has(r))}],
 [facadeURL,{assertLocalEvm:async r=>assert.ok(brands.runtime.has(r))}],
 [systemURL,{assertOwnedFlatSystem:(r,s)=>assert.ok(brands.runtime.has(r)&&brands.system.has(s))}],
 [assetURL,{assertOwnedPoolAsset:(r,a)=>assert.ok(brands.runtime.has(r)&&brands.asset.has(a))}],
 [readerURL,{createFlatSystemStateReader:async()=>({async read(){return view;},async assertCurrent(v){assert.equal(v,view);}})}],
 [observerURL,{createFlatOwnerObserver:async input=>{const o=Object.freeze({async readTransaction(){return null;}});brands.observer.set(o,input);return o;},assertOwnedFlatOwnerObserver:(o,input)=>assert.deepEqual(brands.observer.get(o),input)}],
 [proofURL,{createProofProcess:()=>({async prove(mode,input,words){worker++;assert.equal(mode,'deposit_balance');return{proof:Buffer.from('ab'.repeat(64),'hex'),publicInputs:words.map(String),metrics:{acceptedResult:true,explicitInertHost:true}};},async close(){workerClose++;}})}],
 ]){const original=await import(where);mock.module(where,{namedExports:{...original,...overrides}});}
const authority=await import(accountURL),h=v=>createHash('sha256').update(v).digest('hex'),key=new Uint8Array(32);key[31]=1;
const sign=c=>signDeviceMessage(key,P.externalFlatPermissionMessageV1(c));
test('HOST DeviceExternalFlat original consent precedes effects; real journal latches one wire and only observes lost reply',async t=>{
 const scratch=await mkdtemp(join(tmpdir(),'external-flat-host-'));t.after(()=>rm(scratch,{recursive:true,force:true}));
 const token='34'.repeat(20),code='0x'+h('token'),domain=Object.fromEntries(['scope','policy','hubDomain','registryCommitment','verifierSetCommitment','ledgerNamespace'].map(k=>[k,h(k)]));domain.ledgerNamespace=domain.hubDomain;domain.asset=derivePrivateAssetIdentity('31337','0x'+token,code).slice(2);
 const asset=Object.freeze({metadata:Object.freeze({kind:'ERC20',address:'0x'+token,codeHash:code,symbol:'USDC',decimals:6,chainId:'31337',genesisHash:'0x'+h('genesis')}),async allowance(){return 20n;},async balance(){return 100n;}});brands.asset.add(asset);
 const pool=Object.freeze({address:'0x'+'12'.repeat(20),codeHash:'0x'+h('pool'),asset:'0x'+token,assetCodeHash:code,assetCapability:asset,assetMetadata:asset.metadata,domain,domainCommitment:'0x'+'01'.repeat(32),artifact:{}});
 const runtime={metadata:{scratchDirectory:scratch,evmGenesis:'0x'+h('genesis')},async dispatchOriginalDeviceExternalFlatNoteV1(request){
  const scope=authority.consumeOriginalDeviceExternalFlatSendV1(request,runtime);assert.throws(()=>authority.consumeOriginalDeviceExternalFlatSendV1(request,runtime));assert.throws(()=>authority.consumeOriginalDeviceExternalFlatSendV1({...request},runtime));
  const expected={from:system.sender,to:pool.address,data:scope.transaction.data,value:'0',chainId:'31337',nonce:'0'};await scope.beforeKey(expected);scope.assertBeforeKey(expected);await scope.onSigned({nativeId:'0x'+h('signed')},expected);await scope.beforeBroadcast(expected);scope.assertBeforeBroadcast(expected);send++;throw Object.assign(Error('EXPLICIT_INERT_HOST_LOST_REPLY'),{transactionRecord:{transactionHash:'0x'+h('signed')}});
 }};brands.runtime.add(runtime);const system=Object.freeze({pools:[pool],sender:'0x'+'56'.repeat(20),hub:{address:'0x'+'78'.repeat(20),codeHash:'0x'+h('hub')},async verify(){deployed++;return true;}});brands.system.add(system);
 view={head:{number:'1',hash:h('head'),timestamp:'6000'},header:{number:'0x1'},ledger:{commitments:[],nullifiers:[],roots:[],publicState:{leaves:0,spent:0,liveReservations:0,outputCapacity:0}},poolObservation:{rawState:'0x00',rawHistory:'0x00',rawBacking:'0x00'}};
 const account=await authority.createOriginalDeviceExternalFlatNoteAuthorityV1({runtime,system,poolIndex:0,origin:'https://127.0.0.1:9443',devicePublicKey:devicePublicKey(key)});t.after(()=>account.close());
 const note=createBalanceNote({scope:domain.scope,policy:domain.policy,value:'20'}),witness=walletDepositInput({scope:domain.scope,policy:domain.policy,epoch:'10',note}),bytes=P.externalFlatWitnessBytesV1('deposit_balance',witness);
 const statement={scope:domain.scope,policy:domain.policy,epoch:'10',amount:'20',output:note.commitment.toString('hex')},draft={action:'PROVE_D26',jobId:null,rootId:h('root'),noteRevision:1,recipient:'90'.repeat(20),statement,path:null,witnessSHA256:h(bytes)};bytes.fill(0);
 const access=account.challenge();await assert.rejects(account.review({access,signature:'01'.repeat(64),draft}));assert.equal(worker,0);assert.equal(send,0);
 const a=account.challenge(),review=await account.review({access:a,signature:sign(a),draft}),c=review.consent;
 await assert.rejects(account.operate({consent:{...c,recipient:'91'.repeat(20)},signature:sign(c),witness:structuredClone(witness)}));assert.equal(worker,0);assert.equal(send,0);
 const proved=P.normalizeExternalFlatRowV1(await account.operate({consent:c,signature:sign(c),witness:structuredClone(witness)}));assert.equal(proved.stage,'PROVED');assert.equal(worker,1);assert.equal(workerClose,1);assert.equal(deployed,1);
 await assert.rejects(account.operate({consent:c,signature:sign(c),witness:structuredClone(witness)}));assert.equal(worker,1);
 const f=proved.consentFields,fd={action:'FUND_D26',...Object.fromEntries(['jobId','rootId','noteRevision','recipient','statement','path','witnessSHA256'].map(k=>[k,f[k]]))},b=account.challenge(),fund=await account.review({access:b,signature:sign(b),draft:fd});
 await assert.rejects(account.operate({consent:fund.consent,signature:sign(fund.consent),witness:null}));assert.equal(send,1);
 const s=account.challenge(),status=P.normalizeExternalFlatStatusV1(await account.status({access:s,signature:sign(s)}));assert.equal(status.jobs[0].stage,'FUNDING_UNKNOWN');assert.equal(status.jobs[0].observation,null);
 const o=account.challenge(),observe=await account.review({access:o,signature:sign(o),draft:{...fd,action:'OBSERVE_D26'}});assert.equal((await account.operate({consent:observe.consent,signature:sign(observe.consent),witness:null})).stage,'FUNDING_UNKNOWN');assert.equal(send,1);assert.equal(worker,1);
 const again=account.challenge(),deny=await account.review({access:again,signature:sign(again),draft:fd});await assert.rejects(account.operate({consent:deny.consent,signature:sign(deny.consent),witness:null}));assert.equal(send,1);
 assert.throws(()=>authority.consumeOriginalDeviceExternalFlatSendV1(Object.freeze({}),runtime));await account.close();assert.throws(()=>account.challenge());
 // Ciphertext exists and cannot be treated as a public source-note grant.
 assert.ok(scratch);P.externalFlatWipeV1(witness);key.fill(0);
});


test('HOST original TLS latest-error slot retains only bounded original metadata before the public mapper',async()=>{
 const source=await readFile(url('../../../src/api/mobile/device-external-flat-note-http-v1.mjs','../mobile/device-external-flat-note-http-v1.mjs'),'utf8');
 const roots=await import(url('../../../../proofs/src/catalog.mjs','../../../proof-workers/catalog.mjs'));
 const diagnostic=await import(url('../../../src/execution/account/reconciliation/failure-diagnostics.mjs','../paeg/failure-diagnostics.mjs'));
 const {types}=await import('node:util'),{AssertionError}=await import('node:assert'),fs=await import('node:fs'),path=await import('node:path');
 const start=source.indexOf('const DIAGNOSTIC_TYPES='),end=source.indexOf('function exact(',start);assert.ok(start>=0&&end>start);
 // Actual producer/getter bodies, explicit HOST slots only. No listener,
 // account, protocol request or financial authority is fabricated here.
 const factory=new Function('diagnosticSlots','types','privateFailureDiagnostic','fail','AssertionError','ROOT','FLAT','GOLDEN','join','relative','resolve','isAbsolute','fileURLToPath','realpathSync','lstatSync',source.slice(start,end).replace('export function readOriginal','function readOriginal')+';return{retainFailure,readOriginalDeviceExternalFlatHttpFailureV1};');
 const slots=new WeakMap(),key=Object.freeze({}),copy=Object.freeze({});slots.set(key,{latest:null});
 const body=factory(slots,types,diagnostic.privateFailureDiagnostic,()=>{throw Error('HOST_DIAGNOSTIC_DENIED');},AssertionError,roots.ROOT,roots.FLAT,roots.GOLDEN,path.join,path.relative,path.resolve,path.isAbsolute,fileURLToPath,fs.realpathSync,fs.lstatSync);
 const error=Object.assign(Error('EXPLICIT_PRIVATE_HOST_MESSAGE_NEVER_OUTPUT'),{code:'NATIVE_ECONOMIC_FIXED_PREPARATION',privateKey:'HOST_PRIVATE_VALUE_NEVER_OUTPUT',actual:'HOST_ACTUAL_NEVER_OUTPUT',expected:'HOST_EXPECTED_NEVER_OUTPUT'});
 const here=fileURLToPath(url('../../../src/api/mobile/device-external-flat-note-http-v1.mjs','../mobile/device-external-flat-note-http-v1.mjs'));error.stack='HOST\n at original ('+here+':31:9)';
 const workMarker='return reader[routes[request.url]](value);})().catch(error=>{retainFailure(reader,error,phase,action);throw error;}).finally(';assert.equal(source.includes(workMarker),true);
 let observed;try{await Promise.reject(error).catch(function(e){body.retainFailure(key,e,'OPERATE','FUND_D26');throw e;});}catch(e){observed=e;}assert.equal(observed,error);
 const first=body.readOriginalDeviceExternalFlatHttpFailureV1(key);assert.deepEqual(Object.keys(first).sort(),['action','errorCode','errorType','format','frames','phase']);assert.equal(first.errorCode,'NATIVE_ECONOMIC_FIXED_PREPARATION');assert.equal(first.errorType,'ERROR');assert.equal(first.phase,'OPERATE');assert.equal(first.action,'FUND_D26');assert.equal(first.frames.length,1);
 const encoded=JSON.stringify(first);for(const word of ['EXPLICIT_PRIVATE_HOST_MESSAGE','HOST_PRIVATE_VALUE','HOST_ACTUAL','HOST_EXPECTED'])assert.equal(encoded.includes(word),false);
 first.errorCode='MUTATED_COPY';assert.equal(body.readOriginalDeviceExternalFlatHttpFailureV1(key).errorCode,'NATIVE_ECONOMIC_FIXED_PREPARATION');
 // A permission-replay rejection is diagnostic only; the following original
 // W39 failure replaces it so the fixed caller catch can retain its cause.
 body.retainFailure(key,Error('DEVICE_EXTERNAL_FLAT_PERMISSION_CONSUMED'),'OPERATE','FUND_D26');body.retainFailure(key,Error('DEVICE_EXTERNAL_FLAT_WITHDRAW_GUARD'),'OPERATE','WITHDRAW_W39');const latest=body.readOriginalDeviceExternalFlatHttpFailureV1(key);assert.equal(latest.errorCode,'DEVICE_EXTERNAL_FLAT_WITHDRAW_GUARD');assert.equal(latest.action,'WITHDRAW_W39');assert.throws(()=>body.readOriginalDeviceExternalFlatHttpFailureV1(copy));
 body.retainFailure(key,error,'OPERATE','PRIVATE_UNBOUNDED_ACTION');assert.deepEqual(body.readOriginalDeviceExternalFlatHttpFailureV1(key),latest);
 const unknown=Object.freeze({});slots.set(unknown,{latest:null});let reads=0;const unsafe={get code(){reads++;throw Error('HOST_USER_GETTER');},get message(){reads++;throw Error('HOST_USER_GETTER');}};body.retainFailure(unknown,unsafe,'OPERATE',null);assert.equal(reads,0);assert.equal(body.readOriginalDeviceExternalFlatHttpFailureV1(unknown).errorType,'THROWN_VALUE');
 const proxy=Object.freeze({});slots.set(proxy,{latest:null});body.retainFailure(proxy,new Proxy({}, {get(){reads++;throw Error('HOST_PROXY');},getOwnPropertyDescriptor(){reads++;throw Error('HOST_PROXY');}}),'OPERATE',null);assert.equal(reads,0);assert.equal(body.readOriginalDeviceExternalFlatHttpFailureV1(proxy).frames.length,0);
});


// HOST ports only: original mobile Vault/SDK stay unchanged. These use Node
// AES-GCM and entropy, with no hardware, proof, chain or receipt authority.
const capacityStore=new Map(),capacityKeys=new WeakMap(),capacityHeldKeys=new Set();let capacityClear=[],capacityLastState=null;
export const externalFlatCapacityHostStoreV1=Object.freeze({WHEN_UNLOCKED_THIS_DEVICE_ONLY:6,isAvailableAsync:async()=>true,canUseBiometricAuthentication:()=>true,
 async getItemAsync(name){return capacityStore.get(name)??null;},async setItemAsync(name,value){assert.ok(value.length<=2048);capacityStore.set(name,value);}});
export const externalFlatCapacityHostAuthV1=Object.freeze({hasHardwareAsync:async()=>true,isEnrolledAsync:async()=>true,authenticateAsync:async()=>({success:true})});
class CapacityKey{static async import(bytes){const key=new CapacityKey(),raw=Buffer.from(bytes);assert.equal(raw.length,32);capacityKeys.set(key,raw);capacityHeldKeys.add(raw);return key;}}
class CapacitySealed{constructor(bytes){this.bytes=Buffer.from(bytes);}static fromCombined(raw,options){assert.deepEqual(options,{ivLength:12,tagLength:16});return new CapacitySealed(Buffer.from(raw,'base64'));}async combined(encoding){assert.equal(encoding,'base64');return this.bytes.toString('base64');}}
export const externalFlatCapacityHostCryptoV1=Object.freeze({CryptoDigestAlgorithm:{SHA256:'SHA-256'},AESEncryptionKey:CapacityKey,AESSealedData:CapacitySealed,
 getRandomBytesAsync:async width=>Uint8Array.from(randomBytes(width)),digest:async(_algorithm,bytes)=>Uint8Array.from(createHash('sha256').update(Buffer.from(bytes)).digest()).buffer,
 aesEncryptAsync:async(clear,key,options)=>{capacityClear.push({bytes:clear.length,logicalBytes:Buffer.byteLength(JSON.stringify(JSON.parse(Buffer.from(clear).toString('utf8'))))});const nonce=randomBytes(12),cipher=createCipheriv('aes-256-gcm',capacityKeys.get(key),nonce);cipher.setAAD(Buffer.from(options.additionalData));return new CapacitySealed(Buffer.concat([nonce,cipher.update(clear),cipher.final(),cipher.getAuthTag()]));},
 aesDecryptAsync:async(sealed,key,options)=>{const b=sealed.bytes,d=createDecipheriv('aes-256-gcm',capacityKeys.get(key),b.subarray(0,12));d.setAAD(Buffer.from(options.additionalData));d.setAuthTag(b.subarray(-16));const clear=Uint8Array.from(Buffer.concat([d.update(b.subarray(12,-16)),d.final()]));if(capacityLastState)P.externalFlatWipeV1(capacityLastState);capacityLastState=JSON.parse(Buffer.from(clear).toString('utf8'));return clear;}});

test('HOST DeviceExternalFlat keeps both confirmed SDK jobs within the original encrypted storage limits',async t=>{
 const vaultURL=url('../../../../../apps/mobile/src/custody/device-external-flat-note-vault-v1.ts','../../../../../../../apps/mobile/src/custody/device-external-flat-note-vault-v1.ts').href;
 const sdkURL=url('../../../../../apps/mobile/src/api/device-external-flat-note-api-v1.mjs','../../../../../../../apps/mobile/src/api/device-external-flat-note-api-v1.mjs').href;
 const codecURL=url('../../../../../apps/mobile/src/custody/device-balance-withdrawal-codec-v1.mjs','../../../../../../../apps/mobile/src/custody/device-balance-withdrawal-codec-v1.mjs');
 const vaultSource=await readFile(new URL(vaultURL),'utf8'),legacyURL=vaultURL+'?host-legacy-storage',currentURL=vaultURL+'?host-shared-descriptor-storage';
 // Restore only the two exact original read/write expressions for the causal
 // comparison. All Vault actor, key, consent, CAS, AEAD and bound bodies remain
 // the actual source. There is no alternate authority or storage algorithm.
 assert.equal(vaultSource.split('clear=utf(persistedState(value))').length,2);assert.equal(vaultSource.split('state(decodedState(JSON.parse(new TextDecoder').length,2);
 const legacySource=vaultSource.replace('clear=utf(persistedState(value))','clear=utf(value)').replace("state(decodedState(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(clear))))","state(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(clear)))");
 const own=import.meta.url,ports={
  'expo-secure-store':`import{externalFlatCapacityHostStoreV1 as p}from${JSON.stringify(own)};export const{WHEN_UNLOCKED_THIS_DEVICE_ONLY,isAvailableAsync,canUseBiometricAuthentication,getItemAsync,setItemAsync}=p;`,
  'expo-local-authentication':`import{externalFlatCapacityHostAuthV1 as p}from${JSON.stringify(own)};export const{hasHardwareAsync,isEnrolledAsync,authenticateAsync}=p;`,
  'expo-crypto':`import{externalFlatCapacityHostCryptoV1 as p}from${JSON.stringify(own)};export const{CryptoDigestAlgorithm,AESEncryptionKey,AESSealedData,getRandomBytesAsync,digest,aesEncryptAsync,aesDecryptAsync}=p;`,
  'react-native':`export const Platform={OS:'android'};`};
 const parents=new Set([legacyURL,currentURL,sdkURL]);const hooks=registerHooks({resolve(specifier,context,next){if(parents.has(context.parentURL)&&Object.hasOwn(ports,specifier))return{url:'data:text/javascript,'+encodeURIComponent(ports[specifier]),shortCircuit:true};return next(specifier,context);},
  load(where,context,next){if(where===legacyURL||where===currentURL)return{format:'module',source:stripTypeScriptTypes(where===legacyURL?legacySource:vaultSource,{mode:'strip'}),shortCircuit:true};return next(where,context);}});
 t.after(()=>{hooks.deregister();for(const bytes of capacityHeldKeys)bytes.fill(0);capacityHeldKeys.clear();capacityStore.clear();});
 const sdk=await import(sdkURL),codec=await import(codecURL),hex=n=>createHash('sha256').update('HOST_'+n).digest('hex'),transportKey=new Uint8Array(32);transportKey[31]=2;
 const descriptor=P.normalizeExternalFlatDescriptorV1({profile:P.DEVICE_EXTERNAL_FLAT_NOTE_V1,origin:'https://localhost:9443',pairingId:hex('pair'),devicePublicKey:devicePublicKey(transportKey),lifetime:hex('lifetime'),poolTerms:Object.fromEntries(['pool','poolCodeHash','scope','policy','assetIdentity','asset','assetCodeHash','genesis','domainCommitment','hub','hubCodeHash','hubDomain','ledgerNamespace'].map(k=>[k,hex(k).slice(0,['pool','asset','hub'].includes(k)?40:64)])),assetMetadata:{kind:'ERC20',symbol:'USDC',decimals:6}});
 const originalObserved={blockNumber:'20',blockHash:hex('observed'),timestamp:'1893456000'},recipient=hex('recipient').slice(0,40),amount='1000000';const measurements=[];let originalJobs=null,originalSummary=null,legacyLogicalBytes=0,effectCalls=0,proveCalls=0;
 for(const [where,legacy]of [[legacyURL,true],[currentURL,false]]){
  if(legacy)capacityStore.clear();capacityClear=[];const original=await import(where),vault=await original.createDeviceExternalFlatNoteVaultV1();let client,sourceWitness,exitWitness,opening,quotePath,quoteStatement;const jobs=new Map(legacy?[]:originalJobs);let ordinal=0;
  const sig=consent=>signDeviceMessage(transportKey,P.externalFlatPermissionMessageV1(consent));
  const confirmation=(row)=>({profile:row.profile,jobId:row.jobId,depositJobId:row.consentFields.depositJobId,rootId:row.consentFields.rootId,commitment:row.mode==='deposit_balance'?row.consentFields.statement.output:row.consentFields.statement.commitment,amount,recipient,proofSHA256:row.consentFields.proofSHA256,publicInputsSHA256:row.consentFields.publicInputsSHA256,transactionHash:hex('tx'+row.mode),calldataSHA256:hex('data'+row.mode),receiptBlockHash:hex('receipt'+row.mode),observed:originalObserved,status:'CONFIRMED',canonicalRpcVerifiedBy:'ORIGINAL_BACKEND_OBSERVER',mobileCanonicalRpcVerified:false});
  const fixtureFetch=async(target,init)=>{const request=JSON.parse(init.body),route=new URL(target).pathname.split('/').at(-1);let reply;
   if(route==='challenges')reply={profile:descriptor.profile,action:'ACCESS',origin:descriptor.origin,pairingId:descriptor.pairingId,devicePublicKey:descriptor.devicePublicKey,challengeId:hex('challenge'+(++ordinal)),nonce:hex('nonce'+ordinal),expiresAt:Date.now()+15000};
   else if(route==='status'){const now=Date.now();reply={descriptor,jobs:[...jobs.values()],observed:originalObserved,observedAt:now,expiresAt:now+15000};}
   else if(route==='reviews'){const d=request.draft,parent=jobs.get(d.jobId);let fields;
    if(d.action==='PROVE_D26')fields={...d,jobId:hex('d26'),depositJobId:hex('d26'),proofSHA256:null,publicInputsSHA256:null};
    else if(d.action==='QUOTE_W39')fields={...d,jobId:hex('w39'),depositJobId:parent.jobId,statement:quoteStatement,path:quotePath,proofSHA256:null,publicInputsSHA256:null};
    else if(d.action==='PROVE_W39')fields={...d,depositJobId:hex('d26'),proofSHA256:null,publicInputsSHA256:null};
    else fields={...parent.consentFields,action:d.action};
    reply={consent:P.normalizeExternalFlatConsentV1({profile:descriptor.profile,...fields,descriptor,challengeId:hex('review'+(++ordinal)),nonce:hex('reviewnonce'+ordinal),expiresAt:Date.now()+15000,observed:originalObserved,openingDisclosure:d.action.startsWith('PROVE_')?P.DEVICE_EXTERNAL_FLAT_OPENING_V1:null})};
   }else{assert.equal(route,'operations');const c=request.consent;if(c.action==='QUOTE_W39')reply={quote:c};
    else if(c.action.startsWith('PROVE_')){proveCalls++;reply={profile:descriptor.profile,descriptor,jobId:c.jobId,mode:c.action==='PROVE_D26'?'deposit_balance':'withdraw_balance',stage:'PROVED',consentFields:Object.fromEntries(['jobId','depositJobId','rootId','noteRevision','recipient','statement','path','witnessSHA256'].map(k=>[k,c[k]])),observation:null,errorCode:null};reply.consentFields.proofSHA256=hex('proof'+reply.mode);reply.consentFields.publicInputsSHA256=hex('inputs'+reply.mode);jobs.set(c.jobId,reply);}
    else{if(['FUND_D26','WITHDRAW_W39'].includes(c.action))effectCalls++;const row=jobs.get(c.jobId);reply={...row,stage:'CONFIRMED',observation:confirmation(row)};jobs.set(c.jobId,reply);if(c.action==='WITHDRAW_W39')throw Object.assign(Error('HOST_ACTUAL_REPLY_LOSS_AFTER_SYNTHETIC_ROW'),{code:'HOST_REPLY_LOST'});}}
   return new Response(JSON.stringify(reply),{status:200,headers:{'content-type':'application/json; charset=utf-8'}});
  };
  client=sdk.createDeviceExternalFlatNoteApiV1({descriptor,fetchImpl:fixtureFetch});const review=async draft=>{const access=await client.challenge();return client.review(access,sig(access),draft);};const perform=async(consent,witness=null)=>{await vault.latch(consent);const reply=await client.submit(consent,sig(consent),witness);if(reply.quote)return reply;await vault.accept(reply);return reply;};
  try{
   if(!legacy){
    // Open the actual prior ACTIVE legacy ciphertext with the SAME root and
    // two jobs. Obtain a fresh SDK response; never manufacture a row brand.
    const access=await client.challenge(),status=await client.status(access,sig(access)),row=status.jobs.find(r=>r.mode==='withdraw_balance');
    await assert.rejects(vault.accept({...row}));const accepted=await vault.accept(row);assert.equal(accepted.rootId,originalSummary.rootId);assert.equal(accepted.commitment,originalSummary.commitment);assert.equal(accepted.jobs.length,2);assert.equal(accepted.jobs.every(r=>r.stage==='CONFIRMED'),true);assert.equal(accepted.pending,null);assert.equal(effectCalls,2);assert.equal(proveCalls,2);
    const currentClear=capacityClear.at(-1).bytes;assert.ok(currentClear<10000);const manifest=JSON.parse(capacityStore.get('lianum.external-flat.record.v1'));assert.ok(manifest.bytes<=16384&&manifest.chunks<=11);assert.equal([...capacityStore.values()].every(v=>v.length<=2048),true);
    const copied=structuredClone(capacityLastState),start=vaultSource.indexOf(' function decodedState('),end=vaultSource.indexOf(' const aad=',start);assert.ok(start>=0&&end>start);const decoded=new Function('P','need','STATE_CODEC',stripTypeScriptTypes(vaultSource.slice(start,end),{mode:'strip'})+';return decodedState;')(P,value=>assert.ok(value),'DEVICE_EXTERNAL_FLAT_SHARED_DESCRIPTOR_STATE_V1');
    assert.equal(decoded(structuredClone(copied)).jobs.length,2);const extra=structuredClone(copied);extra.jobs[0].descriptor=extra.descriptor;assert.throws(()=>decoded(extra));const missing=structuredClone(copied);delete missing.jobs[1].observation;assert.throws(()=>decoded(missing));const mutated=structuredClone(copied);mutated.jobs[0].consentFields.statement.scope=hex('wrongscope');assert.throws(()=>decoded(mutated));
    measurements.push({legacyClearBytes:legacyLogicalBytes,currentClearBytes:currentClear,envelopeBytes:manifest.bytes,chunks:manifest.chunks,clearLimit:10000,envelopeLimit:16384});P.externalFlatWipeV1(copied);P.externalFlatWipeV1(extra);P.externalFlatWipeV1(missing);P.externalFlatWipeV1(mutated);
    await vault.close();const reopened=await original.createDeviceExternalFlatNoteVaultV1();try{const summary=await reopened.summary();assert.equal(summary.rootId,accepted.rootId);assert.equal(summary.commitment,accepted.commitment);assert.equal(summary.jobs.length,2);assert.equal(summary.jobs.every(r=>r.stage==='CONFIRMED'),true);assert.equal(summary.pending,null);}finally{await reopened.close();}continue;
   }
   const prepared=await vault.prepareDeposit(descriptor,recipient,amount,originalObserved.timestamp);sourceWitness=prepared.witness;await perform(await review(prepared.draft),sourceWitness);await perform(await review(await vault.draft('FUND_D26')));
   const toHex=a=>Buffer.from(a).toString('hex');opening={type:4,rho:toHex(sourceWitness.rho),x:toHex(sourceWitness.key_x),y:toHex(sourceWitness.key_y),value:amount,secret:toHex(sourceWitness.secret)};const leaf=(await vault.summary()).commitment,siblings=Array.from({length:6},(_,i)=>hex('sibling'+i));let root=leaf;
   for(const sibling of siblings)root=createHash('sha256').update(Buffer.concat([Buffer.from([1]),Buffer.from(root,'hex'),Buffer.from(sibling,'hex')])).digest('hex');quotePath={root,index:0,leaf,siblings};quoteStatement=codec.localDeviceWithdrawalStatementV1({scope:descriptor.poolTerms.scope,policy:descriptor.poolTerms.policy,epoch:(BigInt(originalObserved.timestamp)/600n).toString(),opening,path:quotePath,recipient});
   const quoteConsent=await review(await vault.draft('QUOTE_W39')),quote=await client.submit(quoteConsent,sig(quoteConsent),null),exitPrepared=await vault.prepareWithdrawal(quote.quote);exitWitness=exitPrepared.witness;await perform(await review(exitPrepared.draft),exitWitness);
   const withdrawal=await review(await vault.draft('WITHDRAW_W39'));await vault.latch(withdrawal);await assert.rejects(client.submit(withdrawal,sig(withdrawal),null),{code:'HOST_REPLY_LOST'});
   const access=await client.challenge(),status=await client.status(access,sig(access)),observedExit=status.jobs.find(r=>r.mode==='withdraw_balance');assert.equal(observedExit.stage,'CONFIRMED');originalSummary=await vault.summary();const logical=structuredClone(capacityLastState);logical.jobs=logical.jobs.map(r=>r.jobId===observedExit.jobId?structuredClone(observedExit):r);logical.pending=null;legacyLogicalBytes=Buffer.byteLength(JSON.stringify(logical));assert.ok(legacyLogicalBytes>10000);P.externalFlatWipeV1(logical);
   const pointerBefore=capacityStore.get('lianum.external-flat.pointer.v1');await assert.rejects(vault.accept(observedExit),error=>error.message==='MOBILE_EXTERNAL_FLAT_BINDING');assert.equal(capacityStore.get('lianum.external-flat.pointer.v1'),pointerBefore);assert.equal(JSON.parse(pointerBefore).state,'ACTIVE');await assert.rejects(async()=>vault.summary());originalJobs=[...jobs.entries()].map(([id,row])=>[id,structuredClone(row)]);
  }finally{client.close();await vault.close();P.externalFlatWipeV1(sourceWitness);P.externalFlatWipeV1(exitWitness);if(opening)for(const k of Object.keys(opening))opening[k]=null;}
 }
 assert.equal(measurements.length,1);t.diagnostic(JSON.stringify({hostOnly:true,...measurements[0],originalProofFixtureCalls:proveCalls,originalEffectFixtureCalls:effectCalls,financialAcceptance:false,hardwareAcceptance:false}));transportKey.fill(0);if(capacityLastState)P.externalFlatWipeV1(capacityLastState);capacityLastState=null;
});
