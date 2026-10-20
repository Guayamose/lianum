import test from 'node:test';
import assert from 'node:assert/strict';
import {appendAgentExchangeV1,localAgentReplyV1} from '../src/agent/agent-conversation-v1.ts';
import {normalizeMarketSnapshotV1} from '../src/portfolio/market-data-v1.ts';
const account={chain:'ethereum',network:'mainnet',networkId:'ethereum',address:'public-test-address',publicKey:'public-test-key',path:'public-test-path'};
const balance={account,status:'CONFIRMED',balance:{balanceAtomic:'2000000000000000000',spendableAtomic:'1000000000000000000',reservedAtomic:'250000000000000000',hasPendingTransfer:true}};
const data={accounts:[account],balances:[balance],transactions:[],observedAt:Date.now(),reading:false};
const market=normalizeMarketSnapshotV1({data:{currency:'USD',rates:{BTC:'0.00002',ETH:'0.0005',SOL:'0.01',EUR:'0.9'}}});
test('agent summary uses the actual observed amounts and fiat conversion without fictional allocations',()=>{
 const reply=localAgentReplyV1('Summarize my wallet',data,market,'EUR');
 assert.deepEqual(reply.facts.map(row=>row.value),['€3,600.00','€1,800.00','€0.00','€450.00','€1,350.00']);
 assert.equal(reply.action.target,'wallet');assert.match(reply.text,/latest observed summary/);
 assert.equal(localAgentReplyV1('mi saldo',data,market,'USD').facts[0].value,'$4,000.00');
});
test('unknown balance or price cannot produce a zero or a fabricated complete portfolio',()=>{
 for(const [snapshot,prices]of [[{...data,balances:[]},market],[data,null],[{...data,accounts:[]},market]]){
  const reply=localAgentReplyV1('mi saldo',snapshot,prices,'EUR');assert.equal(reply.facts,undefined);assert.equal(reply.checks[0].complete,false);assert.equal(reply.action.target,'wallet');
 }
});
test('permission requests take precedence and never claim a remote delegated budget',()=>{
 const reply=localAgentReplyV1('¿Qué permisos y límites tiene mi cartera?',data,market,'EUR');assert.equal(reply.action.target,'permissions');assert.match(reply.text,/does not authorize a transfer/);assert.equal(reply.facts,undefined);
});
test('an active plan remains visible when no native transfers are pending',()=>{
 const reply=localAgentReplyV1('¿Qué operaciones están pendientes?',{...data,planActivity:{state:'running',completed:2,total:7}},market,'EUR');assert.equal(reply.action.target,'operations');assert.equal(reply.facts[1].value,'2 of 7');
 const pending=localAgentReplyV1('mis envíos',{...data,transactions:[{status:'UNKNOWN'},{status:'PENDING'},{status:'CONFIRMED'}]},market,'EUR');assert.equal(pending.facts[0].value,'2');
});
test('financial instructions only offer the original preparation action and do not invent an amount',()=>{
 const reply=localAgentReplyV1('Envía todo mi saldo',data,market,'EUR');assert.equal(reply.action.target,'plan');assert.equal(reply.facts,undefined);assert.match(reply.text,/does not (?:yet generate|create) or execute/);
 assert.equal(localAgentReplyV1('Ver propuestas',data,market,'EUR').action.target,'approvals');
});
test('conversation appends immutable ordered pairs and bounds retained messages and input size',()=>{
 let rows=[];const original=rows;for(let i=0;i<30;i++)rows=appendAgentExchangeV1(rows,' Consulta '+i+' ',{text:'Respuesta '+i});
 assert.deepEqual(original,[]);assert.equal(rows.length,40);assert.equal(new Set(rows.map(row=>row.id)).size,40);assert.equal(rows.at(-2).text,'Consulta 29');assert.equal(rows.at(-1).role,'agent');
 assert.deepEqual(appendAgentExchangeV1(rows,' ',{text:'No'}),rows);assert.deepEqual(appendAgentExchangeV1(rows,'a'.repeat(2001),{text:'No'}),rows);
});
