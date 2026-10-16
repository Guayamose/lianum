/** HOST dispatcher boundary only. Opaque account/slot/command brands and
 * durable Source phases are explicit fakes. No chain/proof/finance acceptance. */
import test,{mock} from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from '../../providers/fixtures/paged-mixed-host-v7.mjs';
const descriptor=fixture().flatAuthority.entries[0].descriptor,account=Object.freeze({descriptor,reviewNote(payload,reference){calls.reviewNote.push({payload,reference});return {consent:{reference}};},async close(){}}),runtime=Object.freeze({async block(){return {number:'0x1',timestamp:'1000'};},async assertCanonical(){}}),target=Object.freeze({}),bindings={protocol:'AAVE_STATIC',target,uniswapTarget:Object.freeze({})};
const scopes=new Map(),slots=new WeakMap(),commands=new WeakMap(),accesses=new Set(),calls={execute:[],observe:[],reviewNote:[]};let sequence=0;
const hex=n=>n.toString(16).padStart(64,'0');
function original(value){assert.strictEqual(value,account,'HOST_ORIGINAL_ACCOUNT');}
function data(id){const row=scopes.get(id);assert.ok(row,'HOST_JOB_REQUIRED');return row;}
function grant(jobId){return {access:{challengeId:String(++sequence)},signature:'HOST_NOTE_ACCESS',reference:data(jobId).review.reference,jobId};}
function proofSlot(value,jobId){original(value);const token=Object.freeze(Object.create(null));slots.set(token,data(jobId));return token;}
function command(slot,kind){const data=slots.get(slot);assert.ok(data,'HOST_ORIGINAL_SLOT');const token=Object.freeze(Object.create(null));commands.set(token,{data,kind});return token;}
const Authority={
 readOriginalDeviceSepoliaDefiSharesBindingV8(r,a){assert.strictEqual(r,runtime);original(a);return bindings;},
 async createOriginalDeviceSepoliaDefiSharesAuthorityV4(){return account;},
 async authorizeOriginalDeviceSepoliaDefiFinancialAccessV8(a,q){original(a);assert.equal(q.signature,'HOST_NOTE_ACCESS');assert.ok(!accesses.has(q.access.challengeId),'HOST_ACCESS_REPLAY');accesses.add(q.access.challengeId);const row=data(q.jobId);assert.equal(q.reference,row.review.reference,'HOST_REVIEW_BINDING');return structuredClone(row);},
 async requestOriginalDeviceSepoliaDefiFinancialIntentV8(a,q){const row=await Authority.authorizeOriginalDeviceSepoliaDefiFinancialAccessV8(a,q);if(data(q.jobId).job.financialRequested)assert.equal(data(q.jobId).job.capitalNodeId,q.capitalNodeId,'HOST_CAPITAL_NODE_REBOUND');data(q.jobId).job.financialRequested=true;data(q.jobId).job.capitalNodeId=q.capitalNodeId;row.job.financialRequested=true;row.job.capitalNodeId=q.capitalNodeId;return row;},
 originalDeviceSepoliaDefiSharesProofSlotV4:proofSlot,
 async prepareOriginalDeviceSepoliaDefiInvestmentCommandV4(slot){const row=slots.get(slot);assert.ok(row?.job.mode==='deposit_intent'&&row.job.stage==='PROVED');return command(slot,'INVEST');},
 async challengeOriginalDeviceSepoliaDefiWithdrawalV4(slot){assert.ok(slots.has(slot));return {jobId:slots.get(slot).job.jobId,action:'WITHDRAW_W39',original:true};},
 async armOriginalDeviceSepoliaDefiWithdrawalCommandV4(slot,consent,signature){assert.equal(consent.original,true);assert.equal(signature,'HOST_FRESH_WITHDRAWAL_POP');return command(slot,'WITHDRAW');},
 async prepareOriginalDeviceSepoliaDefiRedeemCommandV4(slot,hash){assert.equal(hash,'0x'+hex(300));return command(slot,'REDEEM');},
 async readOriginalDeviceSepoliaDefiPendingV8(a){original(a);return structuredClone([...scopes.values()]);},
};
const Native={
 async executeOriginalPagedPublicSepoliaDefiCommandV8(r,token){assert.strictEqual(r,runtime);const c=commands.get(token);assert.ok(c,'HOST_ORIGINAL_COMMAND');commands.delete(token);calls.execute.push(c.kind);const row=c.data;if(c.kind==='REDEEM')row.financial.redemption={dispatchLatched:true,transactionHash:'0x'+hex(400)};else{row.financial.submission={dispatchLatched:true,transactionHash:'0x'+hex(c.kind==='INVEST'?200:300)};row.job.stage=c.kind==='INVEST'?'DELIVERY_UNKNOWN':'WITHDRAWAL_UNKNOWN';}return status(row,c.kind,'SUBMITTED');},
 async observeOriginalPagedPublicSepoliaDefiCommandV8(r,a,jobId,kind){assert.strictEqual(r,runtime);original(a);calls.observe.push(kind);const row=data(jobId),confirmed=kind==='WITHDRAW'&&row.job.stage==='CONFIRMED';return status(row,kind,confirmed?'CONFIRMED':kind==='REDEEM'||row.financial.submission?.transactionHash?'SUBMITTED':'UNKNOWN');},
};
function status(row,kind,phase){return {jobId:row.job.jobId,reference:row.review.reference,phase,transactionHash:(kind==='REDEEM'?row.financial.redemption:row.financial.submission)?.transactionHash??null,canonical:phase==='CONFIRMED',protocol:row.protocol,kind};}
mock.module(new URL('../../../src/accounts/authority/device-sepolia-defi-shares-authority-v4.mjs',import.meta.url).href,{exports:Authority});
mock.module(new URL('../../../src/providers/paged-public-testnet-runtimes-v1.mjs',import.meta.url).href,{exports:Native});
const sourceProvider=Object.freeze({}),providerBindings=[];
mock.module(new URL('../../../src/providers/funded-paged-native-provider-v3.mjs',import.meta.url).href,{exports:{readOriginalPagedPublicNativeSepoliaDefiScopeV8(provider){assert.strictEqual(provider,sourceProvider,'HOST_ORIGINAL_SOURCE7_PROVIDER');return {runtime,aaveAccount:account,morphoAccount:Object.freeze({})};},async bindOriginalPagedPublicNativeSepoliaDefiPreparationV8(provider,slot,{id}){assert.strictEqual(provider,sourceProvider);assert.ok(slots.has(slot),'HOST_ORIGINAL_D27_SLOT');providerBindings.push({id,jobId:slots.get(slot).job.jobId});}}});
const F=await import('../../../src/accounts/authority/device-sepolia-defi-financial-http-v8.mjs');
function job(mode,index){const id=hex(index),row={descriptor,protocol:'AAVE_STATIC',review:{reference:hex(100+index),action:mode==='deposit_intent'?'INVEST':'REDEEM',validFrom:'900',validUntil:'1100'},job:{jobId:id,mode,stage:'PROVED',reviewReference:hex(100+index)},financial:{kind:mode==='deposit_intent'?'INVEST':'WITHDRAW',submission:null,redemption:null}};scopes.set(id,row);return row;}
const path=name=>'/v1/mobile/sepolia-defi-shares/'+name;

test('unconnected private capital rejects preparation/submit/worker before accepting an intent or sending provider funds',async()=>{
 const invest=job('deposit_intent',1),withdraw=job('withdraw_balance',2),handler=F.createOriginalDeviceSepoliaDefiFinancialHttpV8(runtime,account);
 try{
  assert.throws(()=>F.createOriginalDeviceSepoliaDefiFinancialHttpV8(runtime,{...account}),/ORIGINAL_ACCOUNT/);
  for(const name of ['financial-submit','withdrawal-review','withdrawal-arm','redeem-submit'])await assert.rejects(handler.dispatch(path(name),grant(name==='financial-submit'?invest.job.jobId:withdraw.job.jobId)),/PAEG_CAPITAL_NOT_CONNECTED/);
  invest.job.financialRequested=true;await assert.rejects(handler.runApprovedPending(),/PAEG_CAPITAL_NOT_CONNECTED/);handler.startApprovedWorker();await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(calls.execute,[]);assert.deepEqual(calls.observe,[]);assert.equal(accesses.size,0,'blocked submits do not consume access or persist an accepted intent');
  invest.job.financialRequested=false;const observed=await handler.dispatch(path('financial-observe'),grant(invest.job.jobId));assert.equal(observed.phase,'UNKNOWN');assert.equal(observed.canonical,false);assert.deepEqual(calls.execute,[]);
 }finally{await handler.close();}
 await assert.rejects(handler.dispatch(path('financial-observe'),grant(invest.job.jobId)),/CLOSED/);
});

test('retained HTTP mount keeps identity and enforces the same reference in body/header before proof review',async()=>{
 const H=await import('../../../src/accounts/authority/device-sepolia-defi-shares-http-v4.mjs'),handler=H.createOriginalDeviceSepoliaDefiSharesRetainedHttpV8(runtime,account),reference=hex(200),body={access:{},signature:'HOST_NOTE_ACCESS',draft:{},reference};
 try{
  assert.strictEqual(handler.account,account);assert.strictEqual(H.assertOriginalDeviceSepoliaDefiSharesHttpV4(handler),handler);
  await assert.rejects(handler.dispatch(path('reviews'),body,descriptor.pairingId,hex(201)),/REVIEW_REFERENCE/);assert.equal(calls.reviewNote.length,0);
  await handler.dispatch(path('reviews'),body,descriptor.pairingId,reference);assert.equal(calls.reviewNote.length,1);assert.deepEqual(calls.reviewNote[0],{payload:{access:{},signature:'HOST_NOTE_ACCESS',draft:{}},reference});
  assert.strictEqual(H.mountOriginalDeviceSepoliaDefiSharesFinancialHttpV8(handler),handler);
  for(const [route,payload]of [['reviews',{...body,draft:{action:'PROVE_D27'}}],['private-operations',{consent:{action:'PROVE_D27'}}]])await assert.rejects(handler.dispatch(path(route),payload,descriptor.pairingId,reference),/PAEG_CAPITAL_NOT_CONNECTED/);
await handler.dispatch(path('reviews'),body,descriptor.pairingId,reference);assert.equal(calls.reviewNote.length,2);
  await assert.rejects(handler.dispatch(path('financial-observe'),{access:{},signature:'HOST_NOTE_ACCESS',reference,jobId:hex(1)},descriptor.pairingId,hex(201)),/REVIEW_REFERENCE/);
  await H.quiesceOriginalDeviceSepoliaDefiSharesHttpV8(handler);await assert.rejects(handler.dispatch(path('reviews'),body,descriptor.pairingId,reference),/CLOSED/);
 }finally{await handler.close();}
});


test('mounted Original Source7 registers a durable D27 intent without issuing an investment; worker only observes or redeems',async()=>{
 const invest=job('deposit_intent',3),handler=F.createOriginalDeviceSepoliaDefiFinancialHttpV8(runtime,account),beforeExecutions=calls.execute.length;
 try{await assert.rejects(F.mountOriginalDeviceSepoliaDefiFinancialSourceV8(handler,{...sourceProvider}),/HOST_ORIGINAL_SOURCE7_PROVIDER/);await F.mountOriginalDeviceSepoliaDefiFinancialSourceV8(handler,sourceProvider);const prepared=await handler.dispatch(path('financial-submit'),{...grant(invest.job.jobId),capitalNodeId:'investment-random-node-3'});assert.equal(prepared.phase,'PREPARED');assert.equal(invest.job.financialRequested,true);assert.deepEqual(providerBindings.at(-1),{id:'investment-random-node-3',jobId:invest.job.jobId});await assert.rejects(handler.dispatch(path('financial-submit'),{...grant(invest.job.jobId),capitalNodeId:'rebound-node'}),/CAPITAL_NODE_REBOUND/);await handler.runApprovedPending();assert.equal(calls.execute.length,beforeExecutions,'no direct INVEST without reserved Source7 READY');invest.financial.submission={dispatchLatched:true,transactionHash:'0x'+hex(200)};invest.job.stage='DELIVERY_UNKNOWN';await handler.runApprovedPending();assert.equal(calls.execute.length,beforeExecutions);assert.ok(calls.observe.includes('INVEST'));const withdraw=job('withdraw_balance',4);withdraw.job.stage='CONFIRMED';withdraw.financial.submission={dispatchLatched:true,transactionHash:'0x'+hex(300)};const continued=await handler.runApprovedPending();assert.equal(continued.redemptionsStarted,1);assert.deepEqual(calls.execute.slice(beforeExecutions),['REDEEM']);
 }finally{await handler.close();}
});
