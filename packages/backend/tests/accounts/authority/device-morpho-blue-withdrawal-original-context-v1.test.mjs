/** HOST regression: trusted runtime/system are opaque references, not JSON.
 * Explicit observer/row ports below issue no financial or native authority. */
import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {types} from 'node:util';
import {externalFlatExactV1} from '../../../../mobile-protocol/src/device-external-flat-note-v1.mjs';
const source=readFileSync(new URL('../../../src/accounts/authority/device-external-flat-note-authority-v1.mjs',import.meta.url),'utf8');
const start=source.indexOf('const blueWithdrawal=raw=>run(async()=>{'),end=source.indexOf('\n const shareCapability=',start);
assert(start>=0&&end>start);
test('Blue confirmed W39 retains opaque original runtime identity and denies replacement or proxy',async()=>{
 let visited=0,observations=0,currentReads=0;
 const runtime=Object.freeze(Object.defineProperty({},'nativeProcess',{enumerable:true,get(){visited++;throw Error('HOST_OPAQUE_RUNTIME_VISITED');}}));
 const system=Object.freeze(Object.defineProperty({},'ownedDeployment',{enumerable:true,get(){visited++;throw Error('HOST_OPAQUE_SYSTEM_VISITED');}})),poolIndex=1;
 const jobId='ab'.repeat(32),nullifier='cd'.repeat(32);
 const retained={jobId,mode:'withdraw_balance',stage:'CONFIRMED',submission:{dispatchLatched:true,transactionHash:'ef'.repeat(32)},observation:{confirmed:true},nullifier};
 const view={ledger:{nullifiers:['0x'+nullifier]}};
 const need=(ok,code)=>{if(!ok)throw Object.assign(Error(code),{code});};
 const ports={run:work=>work(),need,types,protocol:{externalFlatExactV1},share:{},runtime,system,poolIndex,
  row:id=>{assert.equal(id,jobId);return retained;},observe:async row=>{assert.equal(row,retained);observations++;},
  current:async()=>{currentReads++;return view;},reader:{assertCurrent:async current=>assert.equal(current,view)},
  observed:current=>{assert.equal(current,view);return {confirmed:true};},admitted:()=>{},copy:structuredClone,publicRow:row=>({jobId:row.jobId,stage:row.stage})};
 const check=new Function(...Object.keys(ports),source.slice(start,end)+'\nreturn blueWithdrawal;')(...Object.values(ports));
 const actual=await check({runtime,system,poolIndex,jobId});assert.equal(actual.row.stage,'CONFIRMED');assert.equal(visited,0);assert.equal(observations,1);assert.equal(currentReads,1);
 for(const raw of [{runtime:{},system,poolIndex,jobId},{runtime,system:{},poolIndex,jobId},{runtime,system,poolIndex:0,jobId},new Proxy({runtime,system,poolIndex,jobId},{})])
  await assert.rejects(check(raw),{code:'DEVICE_EXTERNAL_FLAT_SHARE_CONTEXT'});
 assert.equal(observations,1);assert.equal(currentReads,1);assert.equal(visited,0);
});
