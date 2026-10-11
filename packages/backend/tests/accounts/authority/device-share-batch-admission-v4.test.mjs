/** Real per-pool and per-batch account ownership. Fixed lower chain/observer
 * ports provide an empty fixture pool; no proof or delivery is constructed. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {derivePrivateAssetIdentity} from '@lianum/engine/notes/private-asset-runtime';
import {devicePublicKey} from '../../../../../apps/mobile/src/custody/signing.mjs';
import {loadDeviceNoteAuthorityHost} from '../../support/device-note-authority-host.mjs';
const h=value=>createHash('sha256').update(value).digest('hex');
test('HOST private SHARE batch owns two-to-four original slots without reopening the legacy pool claim',async t=>{
 const scratch=await mkdtemp(join(tmpdir(),'share-batch-admission-'));t.after(()=>rm(scratch,{recursive:true,force:true}));
 const runtime={metadata:{scratchDirectory:scratch,evmGenesis:'0x'+h('genesis')},dispatchOriginalDeviceExternalFlatNoteV1(){assert.fail('HOST_BATCH_MUST_NOT_SEND');}},systems=new Set(),delivery=Object.freeze({}),observer=Object.freeze({}),accounts=[];
 const token='34'.repeat(20),code='0x'+h('token'),domain=Object.fromEntries(['scope','policy','hubDomain','registryCommitment','verifierSetCommitment','ledgerNamespace'].map(k=>[k,h(k)]));domain.ledgerNamespace=domain.hubDomain;domain.asset=derivePrivateAssetIdentity('31337','0x'+token,code).slice(2);
 const asset={metadata:{kind:'ERC20',address:'0x'+token,codeHash:code,symbol:'SHARE',decimals:6,chainId:'31337',genesisHash:'0x'+h('genesis')}};
 const pool={address:'0x'+'12'.repeat(20),codeHash:'0x'+h('pool'),asset:'0x'+token,assetCodeHash:code,assetCapability:asset,assetMetadata:asset.metadata,domain,domainCommitment:'0x'+'01'.repeat(32),artifact:{}};
 const empty=()=>({ledger:{commitments:[],nullifiers:[],publicState:{liveReservations:0}}});let view=empty();const guards={runtime,deliveryObserver:delivery,poolIndex:1};
 const api=await loadDeviceNoteAuthorityHost(t,{
  assertOwnedLocalEvmV2:r=>assert.equal(r,runtime),assertLocalEvm:async r=>assert.equal(r,runtime),assertOwnedFlatSystem:(r,s)=>{assert.equal(r,runtime);assert.ok(systems.has(s));},assertOwnedPoolAsset:(r,a)=>{assert.equal(r,runtime);assert.equal(a,asset);},
  assertOwnedEvmGraphDeliveryObserverV1(d,input){assert.equal(d,delivery);assert.equal(input.runtime,runtime);assert.ok(systems.has(input.system));assert.equal(input.poolIndex,1);},
  createFlatSystemStateReader:async()=>({async read(){return view;},async assertCurrent(v){assert.equal(v,view);}}),createFlatOwnerObserver:async()=>observer,assertOwnedFlatOwnerObserver:o=>assert.equal(o,observer),
 });
 t.after(async()=>{await Promise.allSettled(accounts.map(account=>account.close()));});
 const key=new Uint8Array(32);key[31]=21;const publicKey=devicePublicKey(key);key.fill(0);
 const freshSystem=()=>{const system={pools:[pool,pool],sender:'0x'+'56'.repeat(20),hub:{address:'0x'+'78'.repeat(20),codeHash:'0x'+h('hub')}};systems.add(system);return system;};
 for(const count of [2,4]){
  const system=freshSystem(),origins=Array.from({length:count},(_,i)=>'https://localhost:'+(9440+i)),input={...guards,system,origins,devicePublicKey:publicKey};
  const batch=await api.createOriginalDeviceExternalFlatPrivateShareBatchV4(input);accounts.push(...batch);assert.equal(Object.isFrozen(batch),true);assert.equal(batch.length,count);assert.equal(new Set(batch).size,count);assert.equal(new Set(batch.map(account=>account.descriptor.lifetime)).size,count);
  for(const [slot,account]of batch.entries()){
   assert.equal(Object.isFrozen(account),true);const original=api.assertOriginalDeviceExternalFlatShareNoteAuthorityV1(account,{...guards,system});assert.equal(original,account.descriptor);assert.equal(original.origin,origins[slot]);assert.equal(original.devicePublicKey,publicKey);
   assert.equal(api.isOriginalDeviceExternalFlatPrivateNoteAuthorityV3(account),true);
   assert.throws(()=>api.assertOriginalDeviceExternalFlatShareNoteAuthorityV1({...account},{...guards,system}));assert.throws(()=>api.assertOriginalDeviceExternalFlatShareNoteAuthorityV1(new Proxy(account,{}),{...guards,system}));
   assert.throws(()=>api.assertOriginalDeviceExternalFlatShareNoteAuthorityV1(account,{...guards,system:freshSystem()}),/DEVICE_EXTERNAL_FLAT_SHARE_CONTEXT/);
  }
  const one={...guards,system,origin:origins[0],devicePublicKey:publicKey};
  for(const name of ['createOriginalDeviceExternalFlatShareNoteAuthorityV1','createOriginalDeviceExternalFlatPrivateShareNoteAuthorityV2','createOriginalDeviceExternalFlatPrivateShareNoteAuthorityV3'])await assert.rejects(api[name](one),/DEVICE_EXTERNAL_FLAT_ALREADY_CREATED/);
  await assert.rejects(api.createOriginalDeviceExternalFlatPrivateShareBatchV4(input),/DEVICE_EXTERNAL_FLAT_ALREADY_CREATED/);
  await Promise.all(batch.map(account=>account.close()));await assert.rejects(api.createOriginalDeviceExternalFlatPrivateShareBatchV4(input),/DEVICE_EXTERNAL_FLAT_ALREADY_CREATED/);
 }
 const system=freshSystem(),origins=['https://localhost:9440','https://localhost:9441'],input={...guards,system,origins,devicePublicKey:publicKey};
 for(const invalid of [[origins[0]],[...origins,...origins,...origins],[origins[0],origins[0]]])await assert.rejects(api.createOriginalDeviceExternalFlatPrivateShareBatchV4({...input,origins:invalid}),/DEVICE_EXTERNAL_FLAT_SHARE_BATCH/);
 let reads=0;const accessor=Object.defineProperty([...origins],'0',{get(){reads++;throw Error('HOST_ACCESSOR');},enumerable:true});await assert.rejects(api.createOriginalDeviceExternalFlatPrivateShareBatchV4({...input,origins:accessor}),/DEVICE_EXTERNAL_FLAT_DATA/);assert.equal(reads,0);
 view={ledger:{commitments:['0x'+h('already-funded')],nullifiers:[]}};await assert.rejects(api.createOriginalDeviceExternalFlatPrivateShareBatchV4(input),/DEVICE_EXTERNAL_FLAT_SHARE_BATCH_BEFORE_FUNDING/);view=empty();
 const original=await api.createOriginalDeviceExternalFlatPrivateShareNoteAuthorityV3({...guards,system,origin:origins[0],devicePublicKey:publicKey});accounts.push(original);await assert.rejects(api.createOriginalDeviceExternalFlatPrivateShareBatchV4(input),/DEVICE_EXTERNAL_FLAT_ALREADY_CREATED/);
});
