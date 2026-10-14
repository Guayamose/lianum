/** Private HOST DATA codec only; AES/ROOT/SDK restore tested by the Vault HOST. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import * as P from '../../../packages/mobile-protocol/src/device-paged-owner-v3.mjs';
import {internPagedGraphHistoryDataV3,packPagedGraphEventDataV3,expandPagedGraphEventDataV3,encodePagedGraphEventChunkV3,decodePagedGraphEventChunkV3,measurePagedGraphProjectionDataV3} from '../src/custody/paged-graph-event-data-v3.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex'),size=v=>Buffer.byteLength(JSON.stringify(v));

test('130 growing replies retain exact history with shared original DATA and a bounded lossless archive',()=>{
 let prior=null,totalRaw=0,totalPacked=0;const events=[],payloads=[];
 for(let i=0;i<130;i++){
  const event={type:'reply',status:{phase:'RESERVED',head:String(i),jobs:Array.from({length:i+1},(_,j)=>({jobId:'host-inert-'+j,stage:'CONFIRMED',publicInputs:Array.from({length:39},(_,k)=>String(j+k)),originalPayload:'a'.repeat(2048)}))},private:{type:'next-command',completed:String(i),total:'130'}};
  const payload=packPagedGraphEventDataV3(event,prior,hash),encoded=Buffer.from(JSON.stringify(payload));totalRaw+=size(event);totalPacked+=encoded.length;
  const chunks=[];for(let at=0;at<encoded.length;at+=4096){const chunk=Uint8Array.from(encoded.subarray(at,at+4096));chunks.push(decodePagedGraphEventChunkV3(encodePagedGraphEventChunkV3(chunk)));}
  const loaded=JSON.parse(Buffer.concat(chunks.map(b=>Buffer.from(b))).toString()),actual=expandPagedGraphEventDataV3(loaded,prior,hash);assert.deepEqual(actual,event);if(i)assert.equal(actual.status.jobs[0],prior.status.jobs[0]);events.push(actual);payloads.push(loaded);prior=actual;
 }
 assert.ok(totalRaw>16*1024*1024);assert.ok(totalPacked<1024*1024);assert.ok(measurePagedGraphProjectionDataV3(events,8*1024*1024)<8*1024*1024);
 let restored=null;for(const payload of JSON.parse(JSON.stringify(payloads)))restored=expandPagedGraphEventDataV3(payload,restored,hash);assert.deepEqual(restored,events.at(-1));assert.equal(restored.status.jobs.length,130);
 assert.throws(()=>expandPagedGraphEventDataV3(payloads.at(-1),events[64],hash),/MOBILE_PAGED_GRAPH_EVENT_BASE/);const corrupt=structuredClone(payloads.at(-1));corrupt.eventSHA256='0'.repeat(64);assert.throws(()=>expandPagedGraphEventDataV3(corrupt,events.at(-2),hash),/MOBILE_PAGED_GRAPH_EVENT_DIGEST/);
});

test('chunk canonical encoding and literal/reordered JSON preserve exact semantics without SDK authority',()=>{
 for(const n of [1,2,3,4095,4096]){const bytes=Uint8Array.from({length:n},(_,i)=>i%256);assert.deepEqual(decodePagedGraphEventChunkV3(encodePagedGraphEventChunkV3(bytes)),bytes);}
 for(const bad of ['AB==','AAB=','AA=','!!!!','AA==='])assert.throws(()=>decodePagedGraphEventChunkV3(bad));
 const previous={type:'reply',status:{a:1,b:2}},next={type:'reply',status:{b:2,a:1}},payload=packPagedGraphEventDataV3(next,previous,hash);assert.equal(JSON.stringify(expandPagedGraphEventDataV3(payload,previous,hash)),JSON.stringify(next));
 assert.throws(()=>packPagedGraphEventDataV3({type:'reply',secret:'x'.repeat(2*1024*1024)},null,hash));
});

/** Structurally valid Node/W39 public-input DATA only. No SDK brand, proof or
 * native/financial acceptance is created by serializing these synthetic rows. */
test('256 Node/W39 state histories cross4096 records and preserve all final states without issuing authority',()=>{
 const inputs={fold:P.normalizeDevicePagedPublicInputsV3('fold',Array(P.DEVICE_PAGED_MODES_V3.fold.words).fill('1')),withdraw:P.normalizeDevicePagedPublicInputsV3('withdraw',Array(P.DEVICE_PAGED_MODES_V3.withdraw.words).fill('1'))},payloads=[];let previous=null;
 for(let node=0;node<256;node++)for(let step=0;step<20;step++){
  const mode=step<10?'fold':'withdraw',event={type:'reply',status:{phase:'UNKNOWN',job:{jobId:'host-inert-job-'+node+'-'+step,mode,stage:step%2?'CONFIRMED':'PROVED',publicInputs:inputs[mode],proofSHA256:hash(Buffer.from('HOST-inert-'+node+'-'+step))}},private:{type:'HOST_INERT_STATE_DATA',id:'node-'+node,role:mode==='withdraw'?'payout':'node',amount:'100',recipient:'0x'+'1'.repeat(40)}};
  const packed=packPagedGraphEventDataV3(event,previous,hash),loaded=JSON.parse(JSON.stringify(packed));previous=expandPagedGraphEventDataV3(loaded,previous,hash);assert.deepEqual(previous,event);payloads.push(loaded);
 }
 assert.equal(payloads.length,5120);assert.ok(size(payloads)<16*1024*1024);const retained=JSON.parse(JSON.stringify(payloads));let reopened=null;for(const value of retained)reopened=expandPagedGraphEventDataV3(value,reopened,hash);assert.deepEqual(reopened,previous);assert.equal(reopened.private.id,'node-255');assert.equal(reopened.status.job.stage,'CONFIRMED');
 const broken=structuredClone(retained[5119]);broken.eventSHA256='0'.repeat(64);let prior=null;for(const value of retained.slice(0,-1))prior=expandPagedGraphEventDataV3(value,prior,hash);assert.throws(()=>expandPagedGraphEventDataV3(broken,prior,hash));
});

test('private history shares identical openings across event types while respecting hash collisions and caller ownership',()=>{
 const opening={x:'1'.repeat(64),y:'2'.repeat(64),rho:'3'.repeat(64),secret:'4'.repeat(64),value:'100'},events=[{type:'page-prepared',node:{opening:structuredClone(opening)}},{type:'command',payout:{opening:structuredClone(opening)}}],result=internPagedGraphHistoryDataV3(events,hash);
 assert.deepEqual(result,events);assert.equal(result[0].node.opening,result[1].payout.opening);result[0].node.opening.secret=null;assert.equal(events[0].node.opening.secret,opening.secret);assert.equal(events[1].payout.opening.secret,opening.secret);
 const unequal=[{type:'one',data:{value:'100'}},{type:'two',data:{value:'200'}}];assert.deepEqual(internPagedGraphHistoryDataV3(unequal,()=> 'fixed-hash-collision'),unequal);
 const sparse=[];sparse.length=2;sparse[0]=1;sparse.extra=2;assert.throws(()=>packPagedGraphEventDataV3({type:'reply',data:sparse},null,hash));
});
