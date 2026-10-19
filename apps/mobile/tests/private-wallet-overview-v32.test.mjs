import test from 'node:test';
import assert from 'node:assert/strict';
import {privateWalletOverviewV32 as summary} from '../src/portfolio/private-wallet-overview-v32.ts';
const request=(requestId,kind,state)=>({requestId,kind,state,disposition:null});
const row=(requests,route={origin:'https://host.invalid',pairingId:'original'})=>({route,state:'UNKNOWN',requests});
test('a confirmed deposit cannot hide its pending withdrawal or a missing private-account observation',()=>{
 const withdrawal=request('w','PAGED_WITHDRAW','UNKNOWN'),deposit=request('d','PAGED_DEPOSIT','CONFIRMED'),snapshot={coverage:{complete:false},rows:[row([deposit,withdrawal]),row([withdrawal])]};
 const value=summary(snapshot,'testnet',true);assert.equal(value.unconfirmed,true);assert.equal(value.pending.length,1);assert.equal(value.pending[0].title,'Retirada');assert.equal(value.pending[0].state,'Resultado pendiente');
 assert.equal(summary(null,'testnet',true).unconfirmed,true);assert.equal(summary(null,'mainnet',true),null);assert.equal(summary(null,'testnet',false),null);
 assert.equal(summary({...snapshot,rows:[row([withdrawal]),row([withdrawal],{origin:'https://other.invalid',pairingId:'other'})]},'testnet',true).pending.length,2);
});
test('closed operations disappear while failed or stale operations stay visible for review',()=>{
 const snapshot={coverage:{complete:true},rows:[{...row([request('a','PAGED_GRAPH','FULFILLED'),request('b','PAGED_DEPOSIT','FAILED')]),state:'LIVE'}]};
 const value=summary(snapshot,'testnet',true);assert.equal(value.pending.length,1);assert.equal(value.pending[0].title,'Ingreso');assert.equal(value.pending[0].state,'Requiere revisión');assert.equal(value.unconfirmed,false);
 assert.equal(summary({...snapshot,rows:[row([])]},'testnet',true).unconfirmed,true);
});
