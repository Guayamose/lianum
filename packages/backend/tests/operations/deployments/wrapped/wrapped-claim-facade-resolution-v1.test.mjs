/** Actual source-extracted wrapped facades over synthetic artifacts/RPC.
 * Real ABI encoders and selector hashes; no factory/runtime/key/compiler. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { encodeClaimABI, claimABIType } from '@lianum/engine/claims/abi';
import { evmFunctionSelector } from '../../../../src/chains/evm/contracts/evm-code-hash.mjs';
import { exactRecord, fixedArray } from '@lianum/components/encoding/commitments';
import { nativeStaticArguments } from '../../../../src/execution/native/dispatch/native-deployment.mjs';
const read=name=>readFileSync(new URL(name,import.meta.url),'utf8');
const system=read('./wrapped-claim-system-v1.mjs'),plan=read('./wrapped-claim-deployment-plan-v1.mjs');
const cut=(text,start,end)=>{const a=text.indexOf(start),b=text.indexOf(end,a);assert.ok(a>=0&&b>a);return text.slice(a,b);};
const compile=(text,env)=>vm.runInThisContext('(function({'+Object.keys(env).join(',')+'}){'+text+'\n})')(env);
const resolve=(selector=evmFunctionSelector)=>compile(cut(plan,'export function claimArtifactMethod(', '\n/** Native currency identity').replace('export ', '')+';return claimArtifactMethod;', {assert,claimABIType,evmFunctionSelector:selector});
const claimFactory=(method=resolve())=>compile(cut(system,'function abiValues(', '\nfunction artifactFor(')+';return facade;',
  {assert,fixedArray,exactRecord,encodeClaimABI,prefix:x=>'0x'+x,claimArtifactMethod:method});
const graphFactory=(selector=evmFunctionSelector)=>compile(cut(system,'const canonicalType =','\n/** The exact object')
  +cut(system,'function viewFacade(', '\nasync function unchangedHead')+';return viewFacade;',
  {assert,fixedArray,exactRecord,nativeStaticArguments,evmFunctionSelector:selector});
function artifact(){
  const methods=[['totalSupply',[],'view'],['balanceOf',[{name:'owner',type:'address'}],'view'],['setValue',[{name:'value',type:'uint256'}],'nonpayable']];
  return {abi:methods.map(([name,inputs,stateMutability])=>({type:'function',name,inputs,stateMutability})),evm:{methodIdentifiers:Object.fromEntries(methods.map(([name,inputs])=>{const s=name+'('+inputs.map(x=>x.type).join(',')+')';return[s,evmFunctionSelector(s)];}))}};
}
function fixture(factory){const calls=[],data=artifact(),record={address:'0x'+'12'.repeat(20)},target=factory({call:async(...args)=>{calls.push(args);return calls.length;}},record,data);return{calls,data,record,target};}

test('wrapped claim facade resolves once per RPC and every call/block/argument remains fresh',async()=>{
  let resolves=0;const method=resolve();const f=fixture(claimFactory((...args)=>{resolves++;return method(...args);}));
  for(const block of ['0x1','0x2'])assert.equal(await f.target.call('balanceOf(address)',['0x'+'34'.repeat(20)],block),f.calls.length);
  assert.equal(resolves,2);assert.deepEqual(f.calls,['0x1','0x2'].map(block=>[{to:f.record.address,data:'0x70a08231'+'34'.repeat(20).padStart(64,'0')},block]));
  assert.equal(f.target.data('balanceOf(address)',['0x'+'56'.repeat(20)]),'0x70a08231'+'56'.repeat(20).padStart(64,'0'));assert.equal(resolves,3);assert.equal(f.calls.length,2);
});

test('wrapped GRAPH facade resolves once per RPC and preserves read-only/compiler checks on every invocation',async()=>{
  let resolves=0;const f=fixture(graphFactory(s=>{resolves++;return evmFunctionSelector(s);}));
  for(const block of ['0x1','0x2'])await f.target.call('totalSupply()',[],block);
  assert.equal(resolves,2);assert.deepEqual(f.calls,['0x1','0x2'].map(block=>[{to:f.record.address,data:'0x18160ddd'},block]));
  f.data.evm.methodIdentifiers['totalSupply()']='00000000';await assert.rejects(f.target.call('totalSupply()'),/METHOD_SELECTOR/);
  f.data.evm.methodIdentifiers['totalSupply()']='18160ddd';f.data.abi[0].stateMutability='nonpayable';await assert.rejects(f.target.call('totalSupply()'),/READ_ONLY_METHOD/);
  assert.equal(f.calls.length,2);
});

test('both wrapped facades reject invalid mutable ABI/compiler maps, duplicate methods, and unsafe argument containers before RPC',async()=>{
  for(const factory of [claimFactory(),graphFactory()]){
    const f=fixture(factory);await f.target.call('balanceOf(address)',['0x'+'34'.repeat(20)]);
    await assert.rejects(f.target.call('setValue(uint256)',['1']),/VIEW_ONLY|READ_ONLY_METHOD/);
    for(const args of [[],['bad'],new Proxy(['0x'+'34'.repeat(20)],{}),Object.defineProperty([],'0',{get(){throw Error('must not invoke');},enumerable:true})])await assert.rejects(f.target.call('balanceOf(address)',args));
    f.data.evm.methodIdentifiers['balanceOf(address)']='00000000';await assert.rejects(f.target.call('balanceOf(address)',['0x'+'34'.repeat(20)]),/COMPILER_SELECTOR|METHOD_SELECTOR/);
    f.data.evm.methodIdentifiers['balanceOf(address)']='70a08231';f.data.abi.push(structuredClone(f.data.abi[1]));await assert.rejects(f.target.call('balanceOf(address)',['0x'+'34'.repeat(20)]),/ABI_METHOD/);
    assert.equal(f.calls.length,1);
  }
});

test('wrapped nominal library selector remains compiler-authoritative while tuple/array ABI words remain exact',async()=>{
  const input={name:'value',type:'tuple',internalType:'struct Lib.Item',components:[{name:'amount',type:'uint256'},{name:'owners',type:'address[2]'}]};
  const canonical='inspect((uint256,address[2]))',nominal='inspect(Lib.Item)',data={abi:[{type:'function',name:'inspect',inputs:[input],stateMutability:'view'}],evm:{methodIdentifiers:{[nominal]:evmFunctionSelector(nominal)}}};
  const args=[{amount:'7',owners:['0x'+'12'.repeat(20),'0x'+'34'.repeat(20)]}],wanted='0x'+evmFunctionSelector(nominal)+'7'.padStart(64,'0')+'12'.repeat(20).padStart(64,'0')+'34'.repeat(20).padStart(64,'0');
  for(const factory of [claimFactory(),graphFactory()]){const calls=[],target=factory({call:async x=>calls.push(x)},{address:'0x'+'56'.repeat(20)},data);await target.call(canonical,args);assert.equal(calls[0].data,wanted);assert.equal(target.data(nominal,args),wanted);}
  data.evm.methodIdentifiers[nominal]=evmFunctionSelector(canonical);assert.throws(()=>resolve()(data,canonical),/COMPILER_SELECTOR/);
});

test('wrapped claim dynamic ABI bytes and integer conversion are unchanged',async()=>{
  const signature='inspect(bytes,uint256[])',inputs=[{name:'wire',type:'bytes'},{name:'values',type:'uint256[]'}],calls=[];
  const data={abi:[{type:'function',name:'inspect',inputs,stateMutability:'view'}],evm:{methodIdentifiers:{[signature]:evmFunctionSelector(signature)}}};
  const target=claimFactory()({call:async x=>calls.push(x)},{address:'0x'+'12'.repeat(20)},data);
  await target.call(signature,['0xabcd',[7,8]]);assert.equal(calls[0].data,'0x'+evmFunctionSelector(signature)+encodeClaimABI(inputs,['0xabcd',['7','8']]).slice(2));
  await assert.rejects(target.call(signature,['0xabcd',[-1]]));assert.equal(calls.length,1);
});

test('shared exact-byte cache obeys its original accounting bound and FIFO eviction, without digest-key collisions',()=>{
  const text=read('../chain-adapters/evm-code-hash.mjs');const body=text.slice(text.indexOf('const MAX_RUNTIME_BYTES')).replaceAll('export ','');
  let hashes=0;const api=compile(body+';return {evmRuntimeCodeHash,evmFunctionSelector,state:()=>({retainedBytes,keys:[...digests.keys()],limit:MAX_RETAINED_BYTES})};',
    {assert,Buffer,publicKeccak256:bytes=>{hashes++;return Buffer.alloc(32,17);}});
  api.evmFunctionSelector('a()');api.evmFunctionSelector('b()');assert.equal(hashes,2,'equal output digests do not alias different cache byte keys');
  api.evmFunctionSelector('a()');api.evmRuntimeCodeHash('0x'+Buffer.from('a()').toString('hex'));assert.equal(hashes,2);
  const codes=Array.from({length:48},(_,i)=>'0x'+i.toString(16).padStart(2,'0')+'00'.repeat(23999));
  for(const code of codes){api.evmRuntimeCodeHash(code);assert.ok(api.state().retainedBytes<=api.state().limit);}
  assert.ok(!api.state().keys.includes(codes[0]));assert.equal(api.state().limit,4*1024*1024);
  const oldest=api.state().keys[0];api.evmRuntimeCodeHash(oldest);api.evmRuntimeCodeHash('0xff'+'00'.repeat(23999));assert.ok(!api.state().keys.includes(oldest),'hits do not change original FIFO policy');
  const before=api.state();api.evmFunctionSelector('x'.repeat(24577));api.evmFunctionSelector('x'.repeat(24577));assert.deepEqual(api.state(),before,'oversize selector is not retained');
});
