/** Synthetic pure-call counters only: no timing instrumentation, EVM, proofs or
 * native observations. This tests caching mechanics, not Poseidon correctness. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { canonical } from '../../../../../omnichain-product/src/privacy.mjs';
import { FIELD_MODULUS } from './commitments.mjs';
import { memoizedFlatPureHash as hash, discardFlatPureMathCache as discard, createFlatPureMathLease, FLAT_PURE_MATH_LIMITS as LIMIT } from './flat-pure-math-cache.mjs';
const b32=n=>'0x'+BigInt(n).toString(16).padStart(64,'0');
const result=(signature,args)=>b32(BigInt('0x'+createHash('sha256').update(canonical([signature,args])).digest('hex'))%FIELD_MODULUS);
function fixture(implementation=null){
  const calls=[];
  const facade=Object.freeze({source:'crypto/Poseidon2Domains.sol',contractName:'Poseidon2Domains',address:'0x'+'12'.repeat(20),
    codeHash:b32(33),expectedCode:'0x60006000',async call(signature,args,at){
      calls.push({signature,args,at});return implementation?implementation(signature,args,at):result(signature,args);
    }});
  return{facade,calls};
}
const EMPTY='emptyLeaf(uint256,uint256)',AUTH='authorizationLeaf(uint256,uint256)';
const REVOKED='revokedDigest(uint256,bytes32,bytes32[64],uint256)';
const EVIDENCE='evidenceState(uint256,(bytes32,bytes32,uint256,uint256,uint256,uint256,uint256))';
const fixtures=[
  ['domainCommitment(bytes32,bytes32,bytes32,bytes32,bytes32,bytes32,bytes32)',Array.from({length:7},(_,i)=>b32(i+1))],
  [EMPTY,[b32(1),0]],['nodeHash(uint256,uint256,uint256,uint256,uint256)',[b32(1),0,1,b32(2),b32(3)]],
  [AUTH,[b32(1),b32(2)]],[REVOKED,[b32(1),b32(2),Array(64).fill(b32(0)),'0']],
  [EVIDENCE,[b32(1),{hubDomain:b32(2),registryCommitment:b32(3),receiptRoot:b32(4),receiptCount:'1',revokedDigest:b32(5),revokedCount:'0',revocationSequence:'1'}]],
  ['admissionRevocationState(uint256,uint256,uint256,uint256)',[b32(1),b32(2),'0','1']],
];
function leaves(value,path=[]){
  if(value&&typeof value==='object')return Object.keys(value).flatMap(k=>leaves(value[k],[...path,k]));
  return[path];
}
function change(value,path){let target=value;for(const k of path.slice(0,-1))target=target[k];const k=path.at(-1),old=target[k];
  target[k]=typeof old==='number'?old+1:old.startsWith('0x')?b32(BigInt(old)+1n):String(BigInt(old)+1n);}
test('same frozen facade reuses pure hashes across heads; different facade objects never share',async()=>{
  const a=fixture(),b=fixture();const first=await hash(a.facade,'0x1',EMPTY,[b32(1),0]);
  assert.equal(await hash(a.facade,'0x2',EMPTY,['1','0']),first);assert.equal(a.calls.length,1);
  assert.equal(a.calls[0].at,'0x1');assert.deepEqual(a.calls[0].args,['1','0']);
  await hash(b.facade,'0x2',EMPTY,['1','0']);assert.equal(b.calls.length,1);
  await hash(a.facade,'0x2',AUTH,['1','0']);assert.equal(a.calls.length,2);
});
test('all seven complete ABI schemas include every scalar and all 64 vector entries in the key',async()=>{
  const f=fixture();
  for(const[signature,args]of fixtures){
    const original=await hash(f.facade,'0x1',signature,args);
    for(const path of leaves(args)){
      const changed=structuredClone(args);change(changed,path);const before=f.calls.length;
      const after=await hash(f.facade,'0x2',signature,changed);assert.equal(f.calls.length,before+1);
      assert.notEqual(after,original,'changed complete ABI input '+signature+' '+path.join('.'));
    }
  }
});
test('pending identical calls share one immutable snapshot and first block tag',async()=>{
  let release;const gate=new Promise(resolve=>{release=resolve;}),f=fixture(async(signature,args)=>{await gate;return result(signature,args);});
  const args=structuredClone(fixtures.find(([s])=>s===EVIDENCE)[1]);
  const first=hash(f.facade,'0x1',EVIDENCE,args),second=hash(f.facade,'0x2',EVIDENCE,structuredClone(args));
  args[1].receiptCount='99';await Promise.resolve();assert.equal(f.calls.length,1);
  assert.ok(Object.isFrozen(f.calls[0].args)&&Object.isFrozen(f.calls[0].args[1]));assert.equal(f.calls[0].args[1].receiptCount,'1');
  release();assert.equal(await first,await second);assert.equal(f.calls[0].at,'0x1');
  const reordered=[b32(1),Object.fromEntries(Object.entries(fixtures.find(([s])=>s===EVIDENCE)[1][1]).reverse())];
  await hash(f.facade,'0x3',EVIDENCE,reordered);assert.equal(f.calls.length,1);
});
test('RPC failures and malformed/noncanonical field results are evicted before immediate retry',async()=>{
  for(const bad of [new Error('TEST_PURE_RPC_FAILURE'),'0x01',b32(FIELD_MODULUS),b32(1)+'\n']){
    let attempts=0;const f=fixture(()=>{if(attempts++===0){if(bad instanceof Error)throw bad;return bad;}return b32(7);});
    await assert.rejects(hash(f.facade,'0x1',EMPTY,['1','0']));
    assert.equal(await hash(f.facade,'0x2',EMPTY,['1','0']),b32(7).slice(2));assert.equal(attempts,2);
  }
});
test('reader-failure invalidation clears completed hashes and prevents old in-flight work reseeding',async()=>{
  let release;const gate=new Promise(resolve=>{release=resolve;});let blocked=true;
  const f=fixture(async(signature,args)=>{if(blocked)await gate;return result(signature,args);});
  const old=hash(f.facade,'0x1',EMPTY,['1','0']);await Promise.resolve();discard(f.facade);blocked=false;
  const fresh=await hash(f.facade,'0x2',EMPTY,['1','0']);assert.equal(f.calls.length,2);
  discard(f.facade);release();await old;
  assert.equal(await hash(f.facade,'0x3',EMPTY,['1','0']),fresh);assert.equal(f.calls.length,3);
  discard(f.facade);await hash(f.facade,'0x4',EMPTY,['1','0']);assert.equal(f.calls.length,4);
});
test('completed LRU has a fixed total bound and preserves recently used entries',async()=>{
  const f=fixture();for(let i=1;i<=LIMIT.entries;i++)await hash(f.facade,'0x1',EMPTY,[String(i),'0']);
  assert.equal(f.calls.length,LIMIT.entries);await hash(f.facade,'0x2',EMPTY,['1','0']);assert.equal(f.calls.length,LIMIT.entries);
  await hash(f.facade,'0x2',EMPTY,[String(LIMIT.entries+1),'0']);
  await hash(f.facade,'0x3',EMPTY,['1','0']);assert.equal(f.calls.length,LIMIT.entries+1);
  await hash(f.facade,'0x3',EMPTY,['2','0']);assert.equal(f.calls.length,LIMIT.entries+2);
});
test('unique queued work and actual concurrency are bounded without caching failures',async()=>{
  let release;const gate=new Promise(resolve=>{release=resolve;});let active=0,maximum=0;
  const f=fixture(async(signature,args)=>{active++;maximum=Math.max(maximum,active);try{await gate;return result(signature,args);}finally{active--;}});
  const pending=Array.from({length:LIMIT.pending},(_,i)=>hash(f.facade,'0x1',EMPTY,[String(i+1),'0']));
  await Promise.resolve();assert.equal(f.calls.length,LIMIT.inFlight);
  await assert.rejects(hash(f.facade,'0x1',EMPTY,[String(LIMIT.pending+1),'0']),/PENDING_BOUND/);
  release();await Promise.all(pending);assert.equal(maximum,LIMIT.inFlight);assert.equal(f.calls.length,LIMIT.pending);
  await hash(f.facade,'0x2',EMPTY,[String(LIMIT.pending+1),'0']);assert.equal(f.calls.length,LIMIT.pending+1);
});
test('mutable/accessor facades, non-pure methods and malformed input shapes cannot seed entries',async()=>{
  const f=fixture();await assert.rejects(hash({...f.facade},'0x1',EMPTY,['1','0']),/IMMUTABLE_FACADE/);
  const getter=Object.freeze({...f.facade,get call(){return f.facade.call;}});
  await assert.rejects(hash(getter,'0x1',EMPTY,['1','0']),/FIXED_CALL/);
  await assert.rejects(hash(f.facade,'0x1','balanceOf(address)',['0x'+'11'.repeat(20)]),/METHOD/);
  await assert.rejects(hash(f.facade,'latest',EMPTY,['1','0']),/BLOCK/);
  await assert.rejects(hash(f.facade,'0x1',EMPTY,['1','0\n']),/UINT/);
  await assert.rejects(hash(f.facade,'0x1',REVOKED,['1',b32(2),Array(63).fill(b32(0)),'0']));
  const extra=structuredClone(fixtures.find(([s])=>s===EVIDENCE)[1]);extra[1].nativeId=b32(99);
  await assert.rejects(hash(f.facade,'0x1',EVIDENCE,extra));assert.equal(f.calls.length,0);
});

test('later branches of an invalidated read cannot obtain a new cache generation',async()=>{
  const f=fixture(),oldRead=createFlatPureMathLease(f.facade,'0x1');
  await oldRead(EMPTY,['1','0']);discard(f.facade);
  await assert.rejects(oldRead(EMPTY,['2','0']),/READ_INVALIDATED/);
  assert.equal(f.calls.length,1);
  const newRead=createFlatPureMathLease(f.facade,'0x2');await newRead(EMPTY,['2','0']);
  assert.equal(f.calls.length,2);assert.equal(f.calls[1].at,'0x2');
});
