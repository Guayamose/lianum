import test from 'node:test';
import assert from 'node:assert/strict';
import {agentContextV1} from '../src/agent/agent-context-v1.ts';
import {normalizeAgentContextV1} from '../../../packages/mobile-protocol/src/agent-chat-v1.mjs';
import {normalizeMarketSnapshotV1} from '../src/portfolio/market-data-v1.ts';
test('agent context contains aggregates and excludes wallet addresses, keys and recipients',()=>{
 const account={chain:'ethereum',network:'mainnet',networkId:'ethereum',address:'private-address-marker',publicKey:'public-key-marker',path:'path-marker'},data={accounts:[account],balances:[{account,status:'CONFIRMED',balance:{balanceAtomic:'2000000000000000000',spendableAtomic:'1000000000000000000',reservedAtomic:'0',hasPendingTransfer:false}}],transactions:[{status:'PENDING',recipient:'recipient-marker'}],observedAt:Date.now(),reading:false};
 const market=normalizeMarketSnapshotV1({data:{currency:'USD',rates:{BTC:'0.00002',ETH:'0.0005',SOL:'0.01',EUR:'0.9'}}}),context=agentContextV1(data,market,'EUR');
 assert.equal(context.network,'mainnet');assert.equal(context.totals.total,'360000');assert.equal(context.operations.pendingTransfers,1);for(const marker of ['private-address-marker','public-key-marker','path-marker','recipient-marker'])assert.equal(JSON.stringify(context).includes(marker),false);
 assert.throws(()=>normalizeAgentContextV1({...context,privateKey:'must not enter'}),/NATIVE_AGENT_DATA/);assert.throws(()=>normalizeAgentContextV1({...context,totals:{...context.totals,total:'1'}}),/NATIVE_AGENT_DATA/);
 const testData={...data,network:'testnet',accounts:[{...account,network:'testnet'}],balances:[]};const testContext=agentContextV1(testData,market,'EUR');assert.equal(testContext.network,'testnet');assert.equal(testContext.totals.total,null);assert.throws(()=>normalizeAgentContextV1({...context,network:'other'}),/NATIVE_AGENT_DATA/);
 assert.equal(agentContextV1({...data,balances:[]},market,'EUR').totals.total,null);
});

test('agent context retains old snapshots and distinguishes paused funds from actual reservations',()=>{
 const account={chain:'ethereum',network:'mainnet',networkId:'ethereum',address:'host',publicKey:'host',path:'host'},market=normalizeMarketSnapshotV1({data:{currency:'USD',rates:{BTC:'0.00002',ETH:'0.0005',SOL:'0.01',EUR:'0.9'}}});
 const context=agentContextV1({accounts:[account],balances:[{account,status:'CONFIRMED',balance:{balanceAtomic:'1000000000000000000',spendableAtomic:'0',reservedAtomic:'1000000000000000',hasPendingTransfer:true}}],transactions:[],observedAt:Date.now(),reading:false},market,'USD');
 assert.deepEqual(context.totals,{total:'200000',available:'0',reserved:'0',occupied:'200',paused:'199800'});
 const old=structuredClone(context);delete old.totals.paused;delete old.assets[0].paused;old.totals.available='199800';old.assets[0].available='199800';assert.deepEqual(normalizeAgentContextV1(old),old,'legacy snapshots retain their original four categories');
 for(const amount of ['0','-1',null]){const invalid=structuredClone(context);invalid.totals.paused=amount;invalid.assets[0].paused=amount;assert.throws(()=>normalizeAgentContextV1(invalid),/NATIVE_AGENT_DATA/);}
 const mixed=structuredClone(context);delete mixed.assets[0].paused;assert.throws(()=>normalizeAgentContextV1(mixed),/NATIVE_AGENT_DATA/);
});
