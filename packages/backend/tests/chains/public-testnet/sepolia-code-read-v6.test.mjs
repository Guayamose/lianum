import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {publicProviderAccountFromKeyV1} from '@lianum/crypto/native-provider-crypto-v1';
import {createOriginalPagedSepoliaRpcV4} from '../../../src/chains/public-testnet/sepolia-receiver-rpc-v4.mjs';
import {assertOriginalPagedSepoliaCodeSetV6} from '../../../src/chains/public-testnet/sepolia-code-read-v6.mjs';

const genesis='0x25a5cc106eea7138acab33231d7160d69cb777ee0c2c553fcddf5138993e6dd9';
const head={number:'0x100',hash:'0x'+'44'.repeat(32),parentHash:'0x'+'33'.repeat(32),timestamp:'0x6ac00000',gasLimit:'0xbebc200',baseFeePerGas:'0x10'};
test('repeated Original code sets reuse only the same runtime and exact canonical block',async t=>{
 const key=randomBytes(32),rows=Array.from({length:24},(_,i)=>({address:'0x'+(i+100).toString(16).padStart(40,'0'),expectedCode:'0x6001'}));let opened,codeReads=0,canonicalReads=0,reorg=false,current={...head};
 try{
  t.mock.method(globalThis,'fetch',async(_endpoint,options)=>{
   const q=JSON.parse(options.body);let result;
   if(q.method==='eth_chainId')result='0xaa36a7';
   else if(q.method==='eth_getBlockByNumber'){if(q.params[0]==='0x0')result={hash:genesis};else{canonicalReads++;result={...current,...(reorg?{hash:'0x'+'99'.repeat(32)}:{})};}}
   else{assert.equal(q.method,'eth_getCode');codeReads++;result='0x6001';}
   return Response.json({jsonrpc:'2.0',id:q.id,result});
  });
  opened=await createOriginalPagedSepoliaRpcV4({endpoint:'https://primary.invalid',account:publicProviderAccountFromKeyV1('ethereum-sepolia',key),keysetId:'ab'.repeat(32)});
  for(let i=0;i<20;i++)await assertOriginalPagedSepoliaCodeSetV6(opened.runtime,rows.map(row=>({...row})),current);
  assert.equal(codeReads,24);assert.ok(canonicalReads>=40,'every reused view still observes canonicality before and after');
  reorg=true;await assert.rejects(assertOriginalPagedSepoliaCodeSetV6(opened.runtime,rows,current),/CANONICAL/);assert.equal(codeReads,24);reorg=false;
  await assert.rejects(assertOriginalPagedSepoliaCodeSetV6(opened.runtime,[{...rows[0],expectedCode:'0x6002'}],current),/COMPILED_CODE_CHANGED/);
  current={...head,number:'0x101',hash:'0x'+'55'.repeat(32)};const before=codeReads;await assertOriginalPagedSepoliaCodeSetV6(opened.runtime,rows,current);assert.equal(codeReads-before,24,'a different block cannot inherit the completed view');
  await assert.rejects(assertOriginalPagedSepoliaCodeSetV6({...opened.runtime},rows,current),/SEPOLIA_RECEIVER_CLOSED/);
  t.diagnostic(JSON.stringify({profile:'HOST_EXACT_BLOCK_CODE_REUSE_V20',repeatedChecks:20,contracts:24,uncachedCodeReads:480,observedCodeReads:24,financialTransactions:0}));
 }finally{if(opened){opened.lifecycle.acknowledge();await opened.runtime.close();}key.fill(0);}
});
for(const fault of ['none','timeout','chain','genesis','canonical','reorg','code','revert'])test('compiled code reads preserve exact head and reject alternate facts: '+fault,async t=>{
 const key=randomBytes(32),calls=[];let opened,secondaryHeads=0;
 try{
  const account=publicProviderAccountFromKeyV1('ethereum-sepolia',key);
  t.mock.method(globalThis,'fetch',async(endpoint,options)=>{
   const q=JSON.parse(options.body),fallback=String(endpoint).includes('tenderly');calls.push({fallback,method:q.method});let result,error;
   if(q.method==='eth_chainId')result=fallback&&fault==='chain'?'0x1':'0xaa36a7';
   else if(q.method==='eth_getBlockByNumber'){
    if(q.params[0]==='0x0')result={hash:fallback&&fault==='genesis'?'0x'+'99'.repeat(32):genesis};
    else{if(fallback)secondaryHeads++;result=fallback&&(fault==='canonical'||fault==='reorg'&&secondaryHeads>1)?{...head,hash:'0x'+'99'.repeat(32)}:head;}
   }else if(q.method==='eth_getCode'){
    if(fallback)assert.deepEqual(q.params[1],{blockHash:head.hash,requireCanonical:true});else assert.equal(q.params[1],head.number);
    if(!fallback&&fault==='revert')error={code:3,message:'private provider error'};
    else if(!fallback&&fault!=='none'){const cause=new Error('private connection details');cause.code='ETIMEDOUT';throw new TypeError('private endpoint',{cause});}
    else result=fallback&&fault==='code'?'0x6002':'0x6001';
   }else throw Error('UNEXPECTED_RPC');
   return Response.json({jsonrpc:'2.0',id:q.id,...(error?{error}:{result})});
  });
  opened=await createOriginalPagedSepoliaRpcV4({endpoint:'https://primary.invalid',account,keysetId:'ab'.repeat(32)});
  // Each fault describes a different chain scenario. A contract's code cannot
  // change while retaining the same canonical block hash and address.
  const fixtureAddress='0x'+(1+['none','timeout','chain','genesis','canonical','reorg','code','revert'].indexOf(fault)).toString(16).repeat(40);
  const rows=[{address:fixtureAddress,expectedCode:'0x6001'}],run=()=>assertOriginalPagedSepoliaCodeSetV6(opened.runtime,rows,head);
  if(['none','timeout'].includes(fault))await run();else await assert.rejects(run());
  assert.equal(calls.some(row=>row.fallback),!['none','revert'].includes(fault));
  assert.ok(calls.every(row=>!row.method.startsWith('eth_send')));
  await assert.rejects(assertOriginalPagedSepoliaCodeSetV6({...opened.runtime},rows,head),/SEPOLIA_RECEIVER_CLOSED/);
 }finally{if(opened){opened.lifecycle.acknowledge();await opened.runtime.close();}key.fill(0);}
});

test('a large contract set keeps at most eight concurrent reads',async t=>{
 const key=randomBytes(32);let opened,active=0,maximum=0;
 try{
  const account=publicProviderAccountFromKeyV1('ethereum-sepolia',key);
  t.mock.method(globalThis,'fetch',async(_endpoint,options)=>{
   const q=JSON.parse(options.body);let result;
   if(q.method==='eth_chainId')result='0xaa36a7';
   else if(q.method==='eth_getBlockByNumber')result=q.params[0]==='0x0'?{hash:genesis}:head;
   else{assert.equal(q.method,'eth_getCode');active++;maximum=Math.max(maximum,active);await new Promise(resolve=>setTimeout(resolve,5));active--;result='0x6001';}
   return Response.json({jsonrpc:'2.0',id:q.id,result});
  });
  opened=await createOriginalPagedSepoliaRpcV4({endpoint:'https://primary.invalid',account,keysetId:'ab'.repeat(32)});
  await assertOriginalPagedSepoliaCodeSetV6(opened.runtime,Array.from({length:25},(_,i)=>({address:'0x'+(i+1).toString(16).padStart(40,'0'),expectedCode:'0x6001'})),head);
  assert.equal(maximum,8);
 }finally{if(opened){opened.lifecycle.acknowledge();await opened.runtime.close();}key.fill(0);}
});

// Other Original consumers fan out receipts/getters directly rather than via
// the code-set helper. Their shared runtime must enforce the same bound.
test('direct Original receipt/code/call reads share an eight-request network bound and drain after errors',async t=>{
 const key=randomBytes(32);let opened,active=0,maximum=0;
 try{
  const account=publicProviderAccountFromKeyV1('ethereum-sepolia',key);
  t.mock.method(globalThis,'fetch',async(_endpoint,options)=>{
   const q=JSON.parse(options.body);active++;maximum=Math.max(maximum,active);
   try{if(q.method==='eth_chainId')return Response.json({jsonrpc:'2.0',id:q.id,result:'0xaa36a7'});if(q.method==='eth_getBlockByNumber')return Response.json({jsonrpc:'2.0',id:q.id,result:{hash:genesis}});await new Promise(resolve=>setTimeout(resolve,2));
    assert.ok(['eth_getCode','eth_call','eth_getTransactionReceipt'].includes(q.method));
    return Response.json({jsonrpc:'2.0',id:q.id,...(q.method==='eth_call'?{error:{code:3,message:'HOST_REVERT'}}:{result:q.method==='eth_getCode'?'0x6001':null})});
   }finally{active--;}
  });
  opened=await createOriginalPagedSepoliaRpcV4({endpoint:'https://primary.invalid',account,keysetId:'ab'.repeat(32)});
  const results=await Promise.allSettled(Array.from({length:57},(_,i)=>i%3===0?opened.runtime.code('0x'+(i+1).toString(16).padStart(40,'0')):i%3===1?opened.runtime.call({to:account.address,data:'0x'}):opened.runtime.receipt('0x'+(i+1).toString(16).padStart(64,'0'))));
  assert.equal(maximum,8);assert.equal(results.filter(r=>r.status==='rejected').length,19);assert.equal(active,0);
  assert.equal(await opened.runtime.code(account.address),'0x6001');
 }finally{if(opened){opened.lifecycle.acknowledge();await opened.runtime.close();}key.fill(0);}
});
