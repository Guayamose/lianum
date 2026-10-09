/** HOST only: real Vault AES/CAS + original PC23 codecs + actual actor bodies.
 * Synthetic owned ports are explicit; no EVM, native node or proof is started,
 * and this test establishes no financial/mobile/hardware acceptance. */
import test,{mock} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
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
