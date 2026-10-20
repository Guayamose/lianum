import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareDevicePagedPaymentListV3} from '../src/screens/device-paged-guided-preparation-v3.mjs';
import {pagedDepositAmountValidV3,pagedNativePaymentDraftV3,pagedPaymentBudgetV3,PAGED_GUIDED_DEFAULTS_V3} from '../src/screens/device-paged-operation-form-v3.ts';
import {devicePagedPaymentPagesV3} from '@lianum/mobile-protocol/device/paged-payment-list-v3';

const configuration={networks:[{family:'EVM',decimals:18},{family:'BTC',decimals:8},{family:'SOL',decimals:9}]};
const addresses={EVM:'0xbb30ba2b1c9bbb78bb7a1a59b2badbb268e371a8',BTC:'bcrt1qpufg5vncjtnetgy4882vvvdsqtrmk96ylstvs7',SOL:'BWe97ToaeSZc8PKdUPhj4DzEskZ4mHKFiSKGbmo3KUYg'};
test('deposit minimum follows the original descriptor without imposing a withdrawal minimum',()=>{
 for(const amount of ['','0','99','1.5','18446744073709551616'])assert.equal(pagedDepositAmountValidV3(amount,'100'),false);
 for(const amount of ['100','600','18446744073709551615'])assert.equal(pagedDepositAmountValidV3(amount,'100'),true);
 assert.equal(pagedDepositAmountValidV3('1',undefined),true);assert.equal(pagedDepositAmountValidV3('100','invalid'),false);
});
test('guided payments keep native amounts separate and reserve only explicit demo units',()=>{
 const rows=[];
 for(const family of ['EVM','BTC','SOL'])rows.push(pagedNativePaymentDraftV3(configuration,{family,recipient:addresses[family],amount:'0.001',knownIds:rows.map(row=>row.id)}));
 assert.equal(pagedPaymentBudgetV3(rows),'300');assert.deepEqual(rows.map(row=>row.intent.amount),['1000000000000000','100000','1000000']);
 assert.deepEqual(rows.map(row=>row.dependsOn),[[],['ethereum'],['bitcoin']]);
 assert.equal(PAGED_GUIDED_DEFAULTS_V3.reservationMinutes,'360');assert.equal(PAGED_GUIDED_DEFAULTS_V3.executionMinutes,'480');
 assert.equal(pagedNativePaymentDraftV3(configuration,{family:'EVM',recipient:addresses.EVM,amount:'0.002',knownIds:['ethereum']}).id,'ethereum2');
 assert.equal(pagedNativePaymentDraftV3(configuration,{family:'EVM',recipient:addresses.EVM,amount:'0.002',knownIds:Array.from({length:64},(_,i)=>'saved'+i)}).id,'ethereum','saved pages do not cap a new page at64 total nodes');
 assert.throws(()=>pagedNativePaymentDraftV3(configuration,{family:'BTC',recipient:addresses.EVM,amount:'0.001',knownIds:[]}),/DESTINATION/);
 assert.throws(()=>pagedNativePaymentDraftV3(configuration,{family:'BTC',recipient:addresses.BTC,amount:'0.000000001',knownIds:[]}),/NATIVE_AMOUNT/);
 assert.throws(()=>pagedPaymentBudgetV3([{amount:'18446744073709551615'},{amount:'1'}]),/BUDGET/);
});

test('one user continuation prepares the list before returning to the original approval',async()=>{
 let state={phase:null,beginPrepared:false,pending:false,pagePending:false,pagesMatch:true,savedPayments:0,draftPayments:3};const calls=[];
 const result=await prepareDevicePagedPaymentListV3({read:async()=>({...state}),begin:async()=>{calls.push('BEGIN');state.phase='BUILDING';},resumeBegin:async()=>{throw Error('unexpected');},append:async()=>{calls.push('APPEND');state.savedPayments=3;state.draftPayments=0;},seal:async()=>{calls.push('SEAL');state.phase='SIGNING';}});
 assert.deepEqual(calls,['BEGIN','APPEND','SEAL']);assert.deepEqual(result,{type:'ready',phase:'SIGNING'});
});

test('uncertain prepared page is retained; retry observes and completes the same page',async()=>{
 let state={phase:'BUILDING',beginPrepared:false,pending:false,pagePending:true,pagesMatch:true,savedPayments:0,draftPayments:0},appendCalls=0,sealCalls=0;
 const ports={read:async()=>({...state}),begin:async()=>{throw Error('no new graph');},resumeBegin:async()=>{throw Error('no new begin');},append:async()=>{appendCalls++;state.pending=true;throw Error('original response lost');},seal:async()=>{sealCalls++;state.phase='SIGNING';}};
 await assert.rejects(()=>prepareDevicePagedPaymentListV3(ports),/response lost/);
 await assert.rejects(()=>prepareDevicePagedPaymentListV3(ports),/REQUIRES_OBSERVATION/);assert.equal(appendCalls,1);assert.equal(sealCalls,0);
 // Original observation reconciles APPEND; a continuation must only seal.
 state={...state,pending:false,pagePending:false,savedPayments:3};
 await prepareDevicePagedPaymentListV3(ports);assert.equal(appendCalls,1);assert.equal(sealCalls,1);
});

test('cancellation, unknown state and stale/unmoving ports never start approval or loop',async()=>{
 const controller=new AbortController();let calls=0;const state={phase:'BUILDING',beginPrepared:false,pending:false,pagePending:true,pagesMatch:true,savedPayments:0,draftPayments:0};
 const ports={read:async()=>state,begin:async()=>calls++,resumeBegin:async()=>calls++,append:async()=>{calls++;controller.abort();},seal:async()=>calls++,signal:controller.signal};
 await assert.rejects(()=>prepareDevicePagedPaymentListV3(ports),/CANCELLED/);assert.equal(calls,1);
 calls=0;await assert.rejects(()=>prepareDevicePagedPaymentListV3({...ports,signal:undefined,read:async()=>({...state,phase:'UNKNOWN'})}),/REQUIRES_OBSERVATION/);assert.equal(calls,0);
 await assert.rejects(()=>prepareDevicePagedPaymentListV3({...ports,signal:undefined,read:async()=>({...state,phase:'SIGNING',pending:true})}),/REQUIRES_OBSERVATION/);assert.equal(calls,0);
 await assert.rejects(()=>prepareDevicePagedPaymentListV3({...ports,signal:undefined,append:async()=>calls++,maximumTransitions:2}),/GUIDED_PREPARATION/);assert.equal(calls,2);
});

test('more than64 payments preserve cross-page dependencies and one preparation/read loop',async()=>{
 const rows=[];for(let index=0;index<130;index++)rows.push(pagedNativePaymentDraftV3(configuration,{family:'EVM',recipient:addresses.EVM,amount:'0.001',knownIds:rows.map(row=>row.id)}));
 assert.equal(pagedPaymentBudgetV3(rows),'13000');const pages=devicePagedPaymentPagesV3(rows);assert.deepEqual(pages.map(page=>page.length),[64,64,2]);assert.deepEqual(pages[1][0].dependsOn,[pages[0].at(-1).id]);assert.deepEqual(pages[2][0].dependsOn,[pages[1].at(-1).id]);
 let state={phase:null,beginPrepared:false,pending:false,pagePending:false,pagesMatch:true,savedPayments:0,draftPayments:130};const calls=[];
 const result=await prepareDevicePagedPaymentListV3({read:async()=>({...state}),begin:async()=>{calls.push('BEGIN');state.phase='BUILDING';},resumeBegin:async()=>assert.fail('newseed'),append:async()=>{const page=pages.shift();calls.push('APPEND'+page.length);state.savedPayments+=page.length;state.draftPayments-=page.length;},seal:async()=>{calls.push('SEAL');state.phase='SIGNING';}});
 assert.deepEqual(calls,['BEGIN','APPEND64','APPEND64','APPEND2','SEAL']);assert.equal(result.phase,'SIGNING');
});
test('current product cap is256 total payments, separate from a64-node page',async()=>{
 assert.deepEqual(devicePagedPaymentPagesV3(Array.from({length:256},(_,id)=>({id}))).map(page=>page.length),[64,64,64,64]);
 assert.throws(()=>devicePagedPaymentPagesV3(Array(257).fill(null)),/LIST_CAPACITY/);
 assert.throws(()=>pagedPaymentBudgetV3(Array(257).fill({amount:'100'})),/LIST_CAPACITY/);
 let actions=0;await assert.rejects(()=>prepareDevicePagedPaymentListV3({read:async()=>({phase:'BUILDING',beginPrepared:false,pending:false,pagePending:false,pagesMatch:true,savedPayments:128,draftPayments:129}),begin:async()=>actions++,resumeBegin:async()=>actions++,append:async()=>actions++,seal:async()=>actions++}),/LIST_CAPACITY/);assert.equal(actions,0);
});

test('an uncertain middle page must reconcile the same persisted page before later pages',async()=>{
 let state={phase:'BUILDING',beginPrepared:false,pending:false,pagePending:false,pagesMatch:true,savedPayments:64,draftPayments:66},retained=false;const calls=[];
 const ports={read:async()=>({...state}),begin:async()=>assert.fail('newseed'),resumeBegin:async()=>assert.fail('newseed'),append:async()=>{if(!retained){calls.push('PERSIST64');retained=true;state.pagePending=true;state.draftPayments-=64;state.pending=true;throw Error('response lost');}if(state.pagePending){calls.push('RECONCILE_SAME_PAGE');state.pagePending=false;state.savedPayments+=64;}else{calls.push('APPEND2');state.savedPayments+=2;state.draftPayments=0;}},seal:async()=>{calls.push('SEAL');state.phase='SIGNING';}};
 await assert.rejects(()=>prepareDevicePagedPaymentListV3(ports),/response lost/);
 await assert.rejects(()=>prepareDevicePagedPaymentListV3(ports),/REQUIRES_OBSERVATION/);assert.deepEqual(calls,['PERSIST64']);
 state.pending=false;await prepareDevicePagedPaymentListV3(ports);assert.deepEqual(calls,['PERSIST64','RECONCILE_SAME_PAGE','APPEND2','SEAL']);assert.equal(state.savedPayments,130);
});
