/** Actual protected keys, EIP1559 wires and durable Source accounting.
 * Original authorization issuance and chain observations are explicit HOST
 * seams; this test does not claim circuit or public-chain acceptance. */
import test,{mock} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {Transaction} from 'micro-eth-signer';
const grants=new WeakMap(),sha=v=>createHash('sha256').update(v).digest('hex');
mock.module(new URL('../../../src/operations/local/funded-graph-paged-public-kernel-v4.mjs',import.meta.url).href,{exports:{
 async readOriginalPagedSepoliaSourceCommandV4(runtime,token){const p=grants.get(token);assert.equal(p?.runtime,runtime,'HOST_ORIGINAL_SOURCE');assert.ok(p,'HOST_ORIGINAL_SOURCE');return structuredClone(p.data);},
 async consumeOriginalPagedSepoliaSourceCommandV4(runtime,token){const p=grants.get(token);assert.ok(p?.runtime===runtime&&!p.used,'HOST_ONE_USE_SOURCE');p.used=true;p.beforeKey?.();return structuredClone(p.data);},
}});
const K=await import('../../../src/chains/public-testnet/key-store-v1.mjs'),RPC=await import('../../../src/chains/public-testnet/sepolia-receiver-rpc-v4.mjs');
const GENESIS='0x25a5cc106eea7138acab33231d7160d69cb777ee0c2c553fcddf5138993e6dd9',q=v=>'0x'+BigInt(v).toString(16);
async function fixture(t){
 const directory=await mkdtemp(join(tmpdir(),'lianum-payout-k-')),keyset=await K.initializePublicPagedServerKeysV1(join(directory,'keys')),account=keyset.accounts[0],wires=new Map();
 let nonce=0n,posts=0,visible=true,keys,created,signer,afterSigned=null;
 const journal=join(directory,'source-operations/native-wallet.json'),disk=async()=>{try{return JSON.parse(await readFile(journal,'utf8'));}catch(error){if(error.code==='ENOENT')return{operations:[]};throw error;}};
 const head={number:'0x100',hash:'0x'+'44'.repeat(32),parentHash:'0x'+'33'.repeat(32),timestamp:q(Math.floor(Date.now()/1000)),gasLimit:'0x1c9c380',baseFeePerGas:'0x1'};
 const timeout=globalThis.setTimeout;t.mock.method(globalThis,'setTimeout',(fn,ms,...args)=>timeout(fn,ms===1000?0:ms,...args));
 t.mock.method(globalThis,'fetch',async(_url,options)=>{
  const req=JSON.parse(options.body);let result;
  switch(req.method){
   case'eth_chainId':result='0xaa36a7';break;
   case'eth_getBlockByNumber':result=req.params[0]==='0x0'?{hash:GENESIS}:head;break;
   case'eth_getTransactionCount':if(afterSigned&&(await disk()).operations.some(r=>r.phase==='SIGNED'))afterSigned();result=q(nonce);break;
   case'eth_getBalance':result='0xde0b6b3a7640000';break;
   case'eth_maxPriorityFeePerGas':result='0x1';break;
   case'eth_estimateGas':result='0x186a0';break;
   case'eth_sendRawTransaction':{
    const tx=Transaction.fromHex(req.params[0]);assert.equal(tx.raw.nonce,nonce);assert.equal((await disk()).operations.find(r=>r.signed?.nativeId===tx.hash).phase,'SUBMITTING');
    posts++;nonce++;wires.set(tx.hash,req.params[0]);throw Error('HOST_LOST_ACK');
   }
   case'eth_getTransactionReceipt':result=visible&&wires.has(req.params[0])?{transactionHash:req.params[0],status:'0x1',blockHash:head.hash,blockNumber:head.number,gasUsed:'0x186a0',effectiveGasPrice:'0x2',contractAddress:null}:null;break;
   case'eth_getTransactionByHash':{
    const wire=wires.get(req.params[0]);if(!wire){result=null;break;}const tx=Transaction.fromHex(wire),r=tx.raw;
    result={hash:tx.hash,from:account.address,to:r.to,input:r.data,type:'0x2',chainId:q(r.chainId),nonce:q(r.nonce),value:q(r.value),gas:q(r.gasLimit),maxFeePerGas:q(r.maxFeePerGas),maxPriorityFeePerGas:q(r.maxPriorityFeePerGas),accessList:[]};break;
   }
   default:throw Error('HOST_UNEXPECTED_RPC:'+req.method);
  }
  return new Response(JSON.stringify({jsonrpc:'2.0',id:req.id,result}),{status:200});
 });
 try{
  keys=await K.openPublicPagedServerKeysV1(join(directory,'keys'));created=await RPC.createOriginalPagedSepoliaRpcV4({endpoint:'https://payout-k-host.invalid',account,keysetId:keyset.keysetId});created.lifecycle.closed.then(()=>created.lifecycle.acknowledge());
  const policy={profile:'ORIGINAL_PAGED_SEPOLIA_OPERATOR_SPONSOR_V4',keysetId:keyset.keysetId,account:account.address,maximumFeePerTransactionAtomic:'1000000',maximumTotalFeeAtomic:'10000000',maximumValuePerTransactionAtomic:'0',maximumTotalValueAtomic:'0',expiresAt:Date.now()+3600000};
  await mkdir(join(directory,'receiver-bootstrap'),{mode:0o700});await writeFile(join(directory,'receiver-bootstrap/native-wallet.json'),JSON.stringify({configurationSHA256:sha(Buffer.from('ORIGINAL_PAGED_PUBLIC_SEPOLIA_RECEIVER_V4\0'+keyset.keysetId+'\0'+GENESIS)),operations:[]}),{mode:0o600});
  const reopen=async()=>{if(signer)await K.closeOriginalPublicPagedSourceSignerV4(signer);signer=await K.openOriginalPublicPagedSourceSignerV4(keys,created.runtime,policy,new AbortController().signal);};await reopen();
  const grant=(index,{collection='1'.repeat(64),total='600000',fee='400000',collectBy=Date.now()+300000,beforeKey}={})=>{
   const h=n=>sha(String(n)),token=Object.freeze(Object.create(null)),data={profile:'ORIGINAL_PAGED_SEPOLIA_SOURCE_COMMAND_V4',identity:'2'.repeat(64),jobId:h('job'+index),action:'WITHDRAW_OUTPUT_W39',label:'WITHDRAW_OUTPUT_W39',from:account.address,to:'0x'+'11'.repeat(20),value:'0',data:'0x12345678'+h(index),expiresAt:collectBy,
    executorPayout:{profile:'ORIGINAL_PAGED_EXECUTOR_PAYOUT_COMMAND_V5',collectionId:collection,planSHA256:'3'.repeat(64),quoteRoot:'4'.repeat(64),id:'pay-'+index,ordinal:String(index),commitment:h('note'+index),nullifier:h('nf'+index),amountAtomic:'100',beneficiary:'0x'+'22'.repeat(20),maximumFeeAtomic:fee,maximumTotalFeeAtomic:total,collectBy}};
   grants.set(token,{runtime:created.runtime,data,used:false,beforeKey});return token;
  };
  return {grant,disk,reopen,get posts(){return posts;},visible:value=>{visible=value;},afterSigned:fn=>{afterSigned=fn;},execute:token=>{const d=grants.get(token)?.data;return K.executeOriginalPublicPagedSourceV4(signer,token,d?.label??'WITHDRAW_OUTPUT_W39',{from:d?.from??account.address,to:d?.to??'0x'+'11'.repeat(20),data:d?.data??'0x',value:0n});},
   async close(){if(signer)await K.closeOriginalPublicPagedSourceSignerV4(signer);await created.runtime.close();K.closePublicPagedServerKeysV1(keys);await rm(directory,{recursive:true,force:true});}};
 }catch(error){if(signer)await K.closeOriginalPublicPagedSourceSignerV4(signer);if(created)await created.runtime.close();K.closePublicPagedServerKeysV1(keys);await rm(directory,{recursive:true,force:true});throw error;}
}
test('payout K reserves once, serializes competing notes and observes the same lost-ACK wire after reopen',async t=>{
 const f=await fixture(t);try{
  await assert.rejects(f.execute({}),/HOST_ORIGINAL_SOURCE/);assert.equal(f.posts,0);
  const a=f.grant(0),b=f.grant(1),results=await Promise.allSettled([f.execute(a),f.execute(b)]);
  assert.equal(results[0].status,'fulfilled');assert.equal(results[1].status,'rejected');assert.match(results[1].reason.message,/TOTAL_FEE_CEILING/);assert.equal(f.posts,1);
  let state=await f.disk();assert.equal(state.operations.length,1);assert.equal(state.operations[0].phase,'FINALIZED');assert.equal(state.operations[0].transaction.nonce,'0');
  await f.reopen();await f.execute(a);await assert.rejects(f.execute(b),/TOTAL_FEE_CEILING/);assert.equal(f.posts,1);assert.equal((await f.disk()).operations.length,1);
  const c=f.grant(2,{collection:'5'.repeat(64)});f.visible(false);await assert.rejects(f.execute(c),/ORIGINAL_SEND_PENDING/);assert.equal(f.posts,2);
  state=await f.disk();const wire=state.operations[1].signed;assert.equal(state.operations[1].phase,'UNKNOWN');await f.reopen();
  await assert.rejects(f.execute(c),/ORIGINAL_SEND_PENDING/);assert.equal(f.posts,2);f.visible(true);const receipt=await f.execute(c);assert.equal(receipt.transactionHash,wire.nativeId);assert.deepEqual((await f.disk()).operations[1].signed,wire);assert.equal(f.posts,2);
 }finally{await f.close();}
});
for(const boundary of ['before-key','before-post'])test('payout K rechecks its signed deadline '+boundary+' and retains an ambiguous attempt',async t=>{
 const f=await fixture(t),now=Date.now;let offset=0;t.mock.method(Date,'now',()=>now()+offset);
 try{
  const token=f.grant(0,{collectBy:now()+10000,beforeKey:boundary==='before-key'?()=>{offset=11000;}:undefined});
  if(boundary==='before-post')f.afterSigned(()=>{offset=11000;});
  await assert.rejects(f.execute(token),/PAYOUT_EXPIRED/);offset=0;f.afterSigned(null);
  const state=await f.disk(),row=state.operations[0];assert.equal(f.posts,0);assert.equal(row.phase,boundary==='before-key'?'KEY_PENDING':'SIGNED');assert.equal(!!row.signed,boundary==='before-post');
  await f.reopen();await assert.rejects(f.execute(token),/ORIGINAL_SEND_PENDING/);assert.deepEqual((await f.disk()).operations,state.operations);assert.equal(f.posts,0);
 }finally{offset=0;await f.close();}
});
