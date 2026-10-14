import test,{mock} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {randomBytes,createHash,createECDH,createPublicKey,verify,randomUUID} from 'node:crypto';
import {signDeviceMessage} from '../../../../../apps/mobile/src/custody/signing.mjs';
import * as P from '@lianum/mobile-protocol/device/source-note-v1';
import {Vault} from '@lianum/engine/crypto/vault';
import {derivePrivateAssetIdentity} from '@lianum/engine/notes/private-asset-runtime';
import {flatOwnerIdentity} from '@lianum/custody/owner';
import {createNativeRecipientCustody,nativeRecipientInvoiceMessage,nativeRecipientInvoiceRequest} from '@lianum/engine/execution/native/recipients/native-recipient-custody';
import {validateGenericBalanceNativePreparation,genericBalanceNativeTerms} from '@lianum/engine/execution/balances/generic-balance-native-preparation';
const h=value=>createHash('sha256').update(value).digest('hex');
const preparationDeadline=()=>process.hrtime.bigint()+30_000_000_000n;
const base=new URL('../../../src/',import.meta.url),path=value=>new URL(value,base);
const modulePaths={
 service:path('operations/local/device-external-flat-source-graph-service-v1.mjs'),graph:path('accounts/authority/device-external-flat-source-graph-v1.mjs'),
 account:path('accounts/authority/device-external-flat-note-authority-v1.mjs'),system:path('operations/deployments/system/deploy-system.mjs'),local:path('chains/evm/runtime/local-evm-ownership.mjs'),asset:path('chains/shared/contracts/owned-pool-asset.mjs'),
 execution:path('execution/account/execution/flat-native-execution.mjs'),reader:path('execution/account/reconciliation/flat-system-state.mjs'),observer:path('custody/observers/flat-owner-observer.mjs'),provider:path('providers/evm-vault-provider.mjs'),
 router:path('operations/deployments/defi/deploy-private-external-router-v1.mjs'),delivery:path('chains/evm/vault/metamorpho-graph-delivery-observer-v1.mjs'),deliveryOwner:path('chains/evm/dispatch/owned-evm-graph-delivery-v1.mjs'),quorum:path('operations/operators/claims/native-operators.mjs'),
 recipient:path('execution/native/recipients/native-recipient-process.mjs'),tls:path('api/mobile/device-external-flat-note-http-v1.mjs'),proof:'@lianum/backend/proving/roles/scoped-proof-runner',vault:'@lianum/engine/crypto/vault',
};
const originals=Object.fromEntries(await Promise.all(Object.entries(modulePaths).map(async([key,url])=>[key,await import(url)])));
async function setup(t,count,{providerTamper=null}={}){
 const directory=await mkdtemp(join(tmpdir(),'multi-graph-real-owner-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 const k=randomBytes(32),ecdh=createECDH('secp256k1');ecdh.setPrivateKey(k);const publicBytes=ecdh.getPublicKey(),pub=publicBytes.toString('hex');t.after(()=>k.fill(0));
 const domain=Object.fromEntries(['scope','policy','asset','hubDomain','registryCommitment','ledgerNamespace','verifierSetCommitment'].map(key=>[key,h('multi-'+key)])),poolAddress='0x'+'11'.repeat(20),assetAddress='0x'+'22'.repeat(20),assetCodeHash='0x'+h('asset-code'),domainCommitment='1'.padStart(64,'0');
 domain.ledgerNamespace=domain.hubDomain;domain.asset=derivePrivateAssetIdentity(31337,assetAddress,assetCodeHash).slice(2);
 const descriptor=P.normalizeExternalFlatDescriptorV1({profile:P.DEVICE_EXTERNAL_FLAT_NOTE_V1,origin:'https://localhost:9443',pairingId:h('multi-pair'),devicePublicKey:pub,lifetime:h('multi-lifetime'),poolTerms:{...Object.fromEntries(['pool','poolCodeHash','scope','policy','assetIdentity','asset','assetCodeHash','genesis','domainCommitment','hub','hubCodeHash','hubDomain','ledgerNamespace'].map(key=>[key,h('multi-'+key).slice(0,['pool','asset','hub'].includes(key)?40:64)])),scope:domain.scope,policy:domain.policy,assetIdentity:domain.asset,hubDomain:domain.hubDomain,ledgerNamespace:domain.hubDomain,pool:poolAddress.slice(2),asset:assetAddress.slice(2),assetCodeHash:assetCodeHash.slice(2),domainCommitment},assetMetadata:{kind:'ERC20',symbol:'USDC',decimals:6}});
 const pool={address:poolAddress,domain,domainCommitment:'0x'+domainCommitment,assetCapability:Object.freeze({}),assetMetadata:{kind:'ERC20',address:assetAddress,codeHash:assetCodeHash}},runtime={metadata:{scratchDirectory:directory},time:async()=>1000n},system={pools:[pool],sender:'0x'+'34'.repeat(20)},deliveryObserver=Object.freeze({}),quorum=Object.freeze({}),routers=Object.freeze(Array.from({length:count},(_,slot)=>Object.freeze({slot}))),rule={},rulePath=[];
 const accounts=new Map(),providers=new Set(),slots=new Set(),expectedInputs=[],journals=new Map(),counts={consumes:0,bound:0,providers:0,recipientsClosed:0,workspaces:0};
 const account=Object.freeze({});accounts.set(account,descriptor);let serviceApi,graphApi,workspace,bridge,prepared,closed=false,release,entered;
 const gate=new Promise(resolve=>{release=resolve;}),started=new Promise(resolve=>{entered=resolve;});
 const deliveries=Array.from({length:count},(_,i)=>({id:'device-external-share-'+i,dependsOn:i?['device-external-share-'+(i-1)]:[],origin:i?'https://localhost:'+(9443+i):descriptor.origin,maximumInput:String(10+i),shareAmount:String(100+i),payoutAmount:'5'})),terms={depositJobId:h('multi-deposit'),rootId:h('multi-root'),assetAmount:deliveries.reduce((n,d)=>n+BigInt(d.maximumInput),0n).toString(),shareAmount:deliveries.reduce((n,d)=>n+BigInt(d.shareAmount),0n).toString(),payoutAmount:String(count*5),validFrom:'1000',settleBefore:'2000'};
 const identity=flatOwnerIdentity({pool:poolAddress.slice(2),domain,domainCommitment,assetBinding:{token:assetAddress.slice(2),codeHash:assetCodeHash.slice(2)}}),source={descriptor,identity,depositJobId:terms.depositJobId,rootId:terms.rootId,commitment:h('multi-source'),nullifier:h('multi-nullifier'),noteRevision:1,amount:'80'};
 const view={head:{number:'1',hash:h('multi-head'),timestamp:'1000'},ledger:{commitments:[],nullifiers:[]}},reader={async read(){return view;},async assertCurrent(value){assert.equal(value,view);}},observer=Object.freeze({}),execution=Object.freeze({close:async()=>({closed:true})});
 const assertContext=input=>{assert.equal(input.runtime,runtime);assert.equal(input.system,system);};
 const graphJournal=()=>{const entry=[...journals.entries()].find(([file])=>file.includes('device-external-source-graph-'));assert.ok(entry);return entry[1].vault.read(entry[1].password);};
 const replacements={
  vault:{Vault:class ObservedVault extends Vault{#file;constructor(file){super(file);this.#file=file;}async create(data,password){const record=await super.create(data,password);journals.set(this.#file,{vault:this,password});return record;}}},
  system:{assertOwnedFlatSystem(r,s){assert.equal(r,runtime);assert.equal(s,system);}},local:{async assertLocalEvm(r){assert.equal(r,runtime);}},asset:{assertOwnedPoolAsset(r,a){assert.equal(r,runtime);assert.equal(a,pool.assetCapability);}},
  account:{assertOriginalDeviceExternalFlatNoteAuthorityV1(a){assert.ok(accounts.has(a));return accounts.get(a);},assertOriginalDeviceExternalFlatShareNoteAuthorityV1(a,input){assertContext(input);assert.ok(accounts.has(a)&&a!==account);return accounts.get(a);},
   async createOriginalDeviceExternalFlatPrivateShareBatchV4(input){assertContext(input);assert.deepEqual(input.origins,deliveries.map(d=>d.origin));return deliveries.map(d=>{const a=Object.freeze({close:async()=>({closed:true})});accounts.set(a,P.normalizeExternalFlatDescriptorV1({...descriptor,profile:P.DEVICE_EXTERNAL_FLAT_SHARE_V1,origin:d.origin}));return a;});},
   async readOriginalDeviceExternalFlatSourceSubjectV1(a,input){assert.equal(a,account);assertContext(input);assert.equal(input.depositJobId,terms.depositJobId);assert.equal(input.rootId,terms.rootId);return structuredClone(source);},
   async consumeOriginalDeviceExternalFlatShareProofV1(a,input){assert.ok(accounts.has(a));assertContext(input);assert.equal((await graphJournal()).data.preparationAttempt.stage,'PREPARING','HOST_ADMISSION_BEFORE_EFFECT');counts.consumes++;if(counts.consumes===1){entered();await gate;}return{proof:'ab',publicInputs:[String(counts.consumes)]};},
   async bindOriginalDeviceExternalFlatShareGraphV1(a,input){assert.ok(accounts.has(a));assertContext(input);counts.bound++;},
  },
  execution:{async createFlatNativeExecution(input){assertContext(input);return execution;},assertOwnedFlatNativeExecution(e,input){assert.equal(e,execution);assertContext(input);}},
  reader:{async createFlatSystemStateReader(input){assertContext(input);return reader;}},observer:{async createFlatOwnerObserver(input){assertContext(input);return observer;},assertOwnedFlatOwnerObserver(o,input){assert.equal(o,observer);assertContext(input);}},
  router:{assertOwnedPrivateExternalRouterV1(r,input){assert.equal(r,routers[0]);assertContext(input);}},deliveryOwner:{assertOwnedEvmGraphDeliveryObserverV1(o,input){assert.equal(o,deliveryObserver);assertContext(input);}},quorum:{assertOwnedFlatOperatorQuorum(q,input){assert.equal(q,quorum);assertContext(input);}},
  delivery:{isOwnedMetaMorphoGraphDeliveryBatchV4:o=>o===deliveryObserver,isOwnedMetaMorphoGraphDeliveryObserverV1:o=>o===deliveryObserver,readOriginalMetaMorphoGraphBatchRoutersV4(o,input){assert.equal(o,deliveryObserver);assertContext(input);return routers;},prepareOwnedMetaMorphoGraphDescriptorV1(input){assert.equal(input.observer,deliveryObserver);return structuredClone(input);}},
  provider:{
   async createOriginalDeviceMetaMorphoProviderSlotV4(input){assertContext(input);assert.equal(input.router,routers[input.slot]);const token=Object.freeze({slot:input.slot});slots.add(token);return token;},async snapshotOriginalDeviceMetaMorphoProviderSlotV4(token){assert.ok(slots.has(token));return{slot:token.slot,explicitInertHost:true};},async closeOriginalDeviceMetaMorphoProviderSlotV4(token){assert.ok(slots.has(token));return{closed:true};},
   async activateOriginalDeviceMetaMorphoProviderSlotV4(token,input){assert.ok(slots.has(token));assertContext(input);const slot=token.slot;assert.equal(input.router,routers[slot]);counts.providers++;const offer={evidencePolicy:h('multi-evidence'),actionTemplate:{chainDomain:h('multi-chain'),signerIdentity:h('multi-signer-'+slot),sourceCommitment:h('multi-source-'+slot),destinationCommitment:h('multi-destination-'+slot),amount:input.terms.amount,custodyKind:1,custodyCommitment:h('multi-custody-'+slot),executionFrom:input.terms.executionFrom,executionUntil:input.terms.executionUntil,settleBefore:input.terms.settleBefore}};
    const provider=Object.freeze({offer:()=>offer,async bindQuote({recipientCustody}){assert.equal((await recipientCustody.acceptedQuote()).action.amount,input.terms.amount);},async close(){return{closed:true};}});providers.add(provider);return provider;},
   assertOwnedFlatEvmVaultProvider(provider,input){assertContext(input);assert.ok(providers.has(provider),'ORIGINAL_PROVIDER_ONLY');},
  },
  recipient:{async createNativeRecipientProcess(input){expectedInputs.push(structuredClone(input.expectedTerms));const{mode,...options}=input;assert.equal(mode,'create');const custody=await createNativeRecipientCustody(options);return Object.freeze({offer:async()=>custody.offer(),acceptInvoice:request=>custody.acceptInvoice(request),acceptedQuote:async()=>custody.acceptedQuote(),async close(){await custody.close();counts.recipientsClosed++;return{exited:true,exit:{code:0,signal:null}};}});}},
  tls:{async createOriginalDeviceExternalFlatGraphTlsServerV1(input){workspace=input.workspace;return{url:descriptor.origin,async close(){return{closed:true,ownedSocketsRemaining:0,originalOperationsInFlight:0};}};},async createOriginalDeviceExternalFlatTlsServerV1(){return{close:async()=>({closed:true})};}},
  proof:{createFlatProofRunner(){return{close:async()=>({closed:true})};}},
  service:Object.fromEntries(['assertOriginalDeviceExternalFlatGraphWorkspaceV1','readOriginalDeviceExternalFlatMultiGraphBindingsV4','isOriginalDeviceExternalFlatMultiGraphWorkspaceV4'].map(name=>[name,(...args)=>serviceApi[name](...args)])),
  graph:{async createOriginalDeviceExternalFlatPrivateMultiSourceGraphV4(input){bridge=await graphApi.createOriginalDeviceExternalFlatPrivateMultiSourceGraphV4(input);return bridge;}},
 };
 replacements.service.prepareOriginalDeviceExternalFlatGraphWorkspaceV1=async(...args)=>{counts.workspaces++;const result=await serviceApi.prepareOriginalDeviceExternalFlatGraphWorkspaceV1(...args);prepared=result;return providerTamper?providerTamper(result):result;};
 const boundaries=[];try{for(const[key,exports]of Object.entries(replacements))boundaries.push(mock.module(modulePaths[key],{exports:{...originals[key],...exports}}));serviceApi=await import(modulePaths.service.href+'?actual-multi-service='+randomUUID());graphApi=await import(modulePaths.graph.href+'?actual-multi-graph='+randomUUID());}
 catch(error){for(const b of boundaries.reverse())b.restore();throw error;}
 let service;try{service=await serviceApi.createOriginalDeviceExternalFlatMultiGraphServiceV4({account,runtime,system,quorum,router:routers[0],deliveryObserver,rule,rulePath,deliveries,tls:{},host:'127.0.0.1'});}catch(error){release();for(const b of boundaries.reverse())b.restore();throw error;}
 t.after(async()=>{release();if(!closed)await service.close();for(const b of boundaries.reverse())b.restore();});
 const request=extra=>{const access=workspace.challenge(),signature=signDeviceMessage(k,P.externalFlatPermissionMessageV1(access));return{access,signature,...terms,...extra};};
 return{workspace,bridge,service,serviceApi,graphApi,account,descriptor,deliveries,terms,counts,expectedInputs,request,started,release,graphJournal,prepared:()=>prepared,async close(){release();await service.close();closed=true;},source};
}

test('HOST original multi workspace and bridge retain one admitted preparation and exact recipient DAG invoices',async t=>{
 for(const count of [2,4])await t.test(String(count)+' targets',async t=>{
  const host=await setup(t,count),{workspace,request,counts}=host;
  const oldChallenge=request(),original=request(),lost=await workspace.preparation(original);assert.equal(lost.stage,'PREPARING');await host.started;assert.equal(counts.workspaces,1);assert.equal(counts.consumes,1);
  assert.throws(()=>host.serviceApi.readOriginalDeviceExternalFlatMultiGraphContextV4({...host.service}),/DEVICE_EXTERNAL_GRAPH_ORIGINAL_MULTI_SERVICE/);
  await assert.rejects(host.serviceApi.prepareOriginalDeviceExternalFlatGraphWorkspaceV1(workspace,{...host.bridge},Object.fromEntries(['assetAmount','shareAmount','payoutAmount','validFrom','settleBefore'].map(k=>[k,host.terms[k]]))),/DEVICE_EXTERNAL_GRAPH_WORKSPACE_BINDING/);
  const before=performance.now();t.mock.method(performance,'now',()=>before+15001);
  await assert.rejects(workspace.preparation(oldChallenge),/DEVICE_EXTERNAL_GRAPH_PERMISSION/);
  const pending=await workspace.preparation(request());assert.equal(pending.preparationId,lost.preparationId);assert.equal(pending.stage,'PREPARING');assert.equal(counts.workspaces,1);
  await assert.rejects(workspace.preparation(original),/DEVICE_EXTERNAL_GRAPH_PERMISSION/);await assert.rejects(workspace.preparation(request({assetAmount:'1'})),/DEVICE_EXTERNAL_GRAPH_TERMS_CHANGED/);assert.equal(counts.workspaces,1);
  host.release();let first;for(const deadline=preparationDeadline();process.hrtime.bigint()<deadline;){first=await workspace.preparation(request());if(first.quote)break;assert.notEqual(first.stage,'FAILED');await new Promise(resolve=>setTimeout(resolve,10));}assert.ok(first.quote,'Original preparation did not finish');
  const second=await workspace.preparation(request());assert.equal(first.quote.quoteId,second.quote.quoteId);assert.equal(first.quote.depositJobId,host.source.depositJobId);assert.equal(first.quote.sourceCommitment,host.source.commitment);assert.equal(counts.workspaces,1);assert.equal((await host.graphJournal()).data.preparationAttempt.stage,'PREPARED');
  const result=host.prepared(),preparation=validateGenericBalanceNativePreparation(result.preparation);assert.equal(genericBalanceNativeTerms(preparation).budget,String(count*5));assert.equal(preparation.slotSalts.length,4);assert.equal(result.invoiceSignatures.length,count);assert.equal(new Set(result.providers.map(v=>v.provider)).size,count);assert.equal(counts.consumes,count);assert.equal(counts.bound,count);assert.equal(counts.providers,count);assert.equal(counts.recipientsClosed,count);assert.deepEqual(preparation.config.nodes.map(v=>v.dependsOn),host.deliveries.map(v=>v.dependsOn));
  assert.deepEqual(host.expectedInputs.map(v=>v.slot),Array.from({length:count},(_,i)=>i));assert.equal(new Set(host.expectedInputs.map(v=>v.operationId)).size,1);
  for(let slot=0;slot<count;slot++){const offer=preparation.config.nodes[slot].recipientOffer,node=preparation.nodes[slot],request=nativeRecipientInvoiceRequest(host.expectedInputs[slot],offer,{action:node.action,deliveryRiskSalt:node.deliveryRiskSalt}),key=createPublicKey({format:'jwk',key:{kty:'EC',crv:'secp256k1',x:Buffer.from(offer.x,'hex').toString('base64url'),y:Buffer.from(offer.y,'hex').toString('base64url')}});assert.equal(verify('sha256',nativeRecipientInvoiceMessage(request),{key,dsaEncoding:'ieee-p1363'},Buffer.from(result.invoiceSignatures[slot],'hex')),true);assert.equal(result.providers[slot].slot,slot);assert.equal(result.providers[slot].deliveryRiskSalt,node.deliveryRiskSalt);}
  const two=host.deliveries.slice(0,2),normalize=host.serviceApi.normalizeOriginalDeviceExternalFlatMultiDeliveriesV4;assert.throws(()=>normalize(two.map(v=>({...v,origin:two[0].origin}))));assert.throws(()=>normalize([...two,...two,...two]));assert.throws(()=>normalize([{...two[0],dependsOn:[two[1].id]},two[1]]));let getters=0;assert.throws(()=>normalize([new Proxy(two[0],{get(){getters++;throw Error('HOST_GETTER');}}),two[1]]));assert.equal(getters,0);
  await host.close();assert.throws(()=>workspace.challenge(),/DEVICE_EXTERNAL_GRAPH_WORKSPACE_CLOSED/);
 });
});

test('HOST original multi bridge rejects wrong quota, copied providers and duplicate slots without retrying work',async t=>{
 for(const kind of ['quota','copied provider','duplicate slot'])await t.test(kind,async t=>{
  const providerTamper=kind==='copied provider'?value=>({...value,providers:value.providers.map((p,i)=>i?p:{...p,provider:Object.freeze({...p.provider})})}):kind==='duplicate slot'?value=>({...value,providers:value.providers.map(p=>({...p,slot:0}))}):null;
  const host=await setup(t,2,{providerTamper});host.release();const request=()=>host.request(kind==='quota'?{payoutAmount:'1'}:{}),pending=await host.workspace.preparation(request());assert.equal(pending.stage,'PREPARING');
  let result;for(const deadline=preparationDeadline();process.hrtime.bigint()<deadline;){result=await host.workspace.preparation(request());if(result.stage==='FAILED')break;await new Promise(resolve=>setTimeout(resolve,10));}assert.equal(result.stage,'FAILED');assert.equal(host.counts.workspaces,1);assert.equal(host.counts.consumes,kind==='quota'?0:2);assert.equal(host.counts.providers,kind==='quota'?0:2);
  assert.equal((await host.graphJournal()).data.preparationAttempt.stage,'FAILED');assert.equal((await host.graphJournal()).data.quote,null);const again=await host.workspace.preparation(request());assert.equal(again.preparationId,pending.preparationId);assert.equal(again.stage,'FAILED');assert.equal(host.counts.workspaces,1);
 });
});
