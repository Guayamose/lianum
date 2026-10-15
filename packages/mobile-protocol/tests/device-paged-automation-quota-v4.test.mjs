import test from 'node:test';
import assert from 'node:assert/strict';
import {devicePagedAutomationCommandQuotaV4 as quota} from '../src/device-paged-automation-quota-v4.mjs';
import * as Lifetime from '../src/device-paged-agent-read-lifetime-v5.mjs';
test('original continuation command budget includes reservation, each edge, admission, final node and settlement',()=>{
 // The action sequence for one independent payment is R proof/commit, initial
 // EDGE proof/commit, ADMISSION proof/commit, NODE proof/commit, T proof/commit.
 assert.equal(quota({pages:'1',nodes:[{id:'one',dependsOn:[]}]}).maxCommands,10);
 const chain=Array.from({length:256},(_,i)=>({id:'n'+i,dependsOn:i?['n'+(i-1)]:[]}));assert.equal(quota({pages:'4',nodes:chain}).maxCommands,1540);assert.equal(quota({pages:'256',nodes:chain}).maxCommands,1540,'page signing happens before START, no extra remote commands');
 assert.equal(quota({pages:'1',nodes:chain.slice(0,3)}).maxCommands,22);const dense=chain.map((node,i)=>({...node,dependsOn:chain.slice(0,i).map(n=>n.id)}));assert.throws(()=>quota({pages:'4',nodes:dense}),/AUTOMATION_QUOTA/);
 assert.throws(()=>quota({pages:'1',nodes:chain}),/AUTOMATION_QUOTA/);assert.throws(()=>quota({pages:'1',nodes:[{id:'one',dependsOn:['two']},{id:'two',dependsOn:[]}]}),/AUTOMATION_QUOTA/);
 let traps=0;const nodes=[{id:'one',dependsOn:[]}];Object.defineProperty(nodes,'0',{get(){traps++;throw Error('must not run');},enumerable:true});assert.throws(()=>quota({pages:'1',nodes}),/AUTOMATION_QUOTA/);assert.equal(traps,0);
});
test('read lifetime discriminator never runs caller accessors or grants a financial command',()=>{let traps=0;const bad={};Object.defineProperty(bad,'profile',{get(){traps++;throw Error('must not run');}});assert.throws(()=>Lifetime.normalizeDevicePagedAgentReadGrantAnyV5(bad),/READ_LIFETIME/);assert.equal(traps,0);assert.throws(()=>Lifetime.devicePagedAgentReadGrantIdV5('bad',{},'bad',0,0));});
