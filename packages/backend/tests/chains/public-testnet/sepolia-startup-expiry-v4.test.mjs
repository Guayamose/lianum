/** Protected ephemeral original key-store, actual signatures and durable journal. RPC and
 * constructor issuance are explicit HOST fixtures, never public acceptance. */
import test,{mock} from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomBytes} from 'node:crypto';
import {mkdtemp,rm,readFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {sepoliaReceiverCreationUnsignedV4,signSepoliaReceiverCreationWireV4,validateSepoliaReceiverCreationWireV4} from '../../../src/chains/public-testnet/sepolia-receiver-wire-v4.mjs';
import {publicProviderAccountFromKeyV1} from '@lianum/crypto/native-provider-crypto-v1';
import {predictNativeCreateAddress} from '../../../src/execution/native/dispatch/native-deployment.mjs';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex'),h=text=>sha(Buffer.from('HOST_SEPOLIA_RECEIVER_ONLY:'+text)),url=path=>new URL(path,import.meta.url).href,issued=new WeakMap(),completed=new WeakMap(),sourceCommands=new WeakMap(),GENESIS='0x25a5cc106eea7138acab33231d7160d69cb777ee0c2c553fcddf5138993e6dd9',block={number:'0x100',hash:'0x'+h('block'),parentHash:'0x'+h('parent'),timestamp:'0x65000000',gasLimit:'0x1c9c380',baseFeePerGas:'0x3b9aca00'};
mock.module(url('../../../src/chains/public-testnet/adapters-v1.mjs'),{exports:{publicPagedNativeAdapterV1:()=>({identify:async()=>{},head:async()=>block})}});
mock.module(url('../../../src/operations/local/funded-graph-paged-public-kernel-v4.mjs'),{exports:{readOriginalPagedSepoliaSourceCommandV4:async(runtime,token)=>{const r=sourceCommands.get(token);assert.ok(r?.runtime===runtime&&Date.now()<r.data.expiresAt,'HOST_ORIGINAL_SOURCE_COMMAND');return structuredClone(r.data);},consumeOriginalPagedSepoliaSourceCommandV4:async(runtime,token)=>{const r=sourceCommands.get(token);assert.ok(r?.runtime===runtime&&!r.used&&Date.now()<r.data.expiresAt,'HOST_ORIGINAL_SOURCE_COMMAND');r.used=true;return structuredClone(r.data);},retainOriginalFundedPagedGraphSepoliaDeploymentV4(){throw Error('HOST_REOPEN_NOT_IMPLEMENTED');},readOriginalPagedSepoliaDeploymentConstructorV4(runtime,token){const grant=issued.get(token);assert.ok(grant?.runtime===runtime,'HOST_ORIGINAL_CONSTRUCTOR');return structuredClone(grant.data);},readOriginalPagedSepoliaDeploymentCompletionV4(runtime,token){const grant=completed.get(token);assert.ok(grant?.runtime===runtime,'HOST_ORIGINAL_COMPLETION');return structuredClone(grant.system);}}});
function token(runtime,sender,nonce='0'){const handle=Object.freeze(Object.create(null));issued.set(handle,{runtime,data:{profile:'ORIGINAL_PAGED_SEPOLIA_CONSTRUCTOR_V4',securityGeneration:'EXACT_PAYOUT_SET_V4',manifestSHA256:h('manifest'),consumerSHA256:h('consumer'),configurationSHA256:h('configuration'),chainId:'11155111',sender,source:'HOST_ONLY_INERT.sol',name:'HOST_ONLY_INERT',nonce,expectedAddress:predictNativeCreateAddress(sender,BigInt(nonce)),creation:'0x6001600c60003960016000f300',expectedCode:'0x00'}});return handle;}
let currentRPC;const originalFetch=globalThis.fetch;mock.method(globalThis,'fetch',async(endpoint,options)=>{const request=JSON.parse(options.body),result=await currentRPC(request.method,request.params);return new Response(JSON.stringify({jsonrpc:'2.0',id:request.id,result}),{status:200,headers:{'content-type':'application/json'}});});
const {initializePublicPagedServerKeysV1,openPublicPagedServerKeysV1,readPublicPagedServerAccountsV1,closePublicPagedServerKeysV1,signOriginalPublicPagedReceiverCreationV4}=await import('../../../src/chains/public-testnet/key-store-v1.mjs');
const Receiver=await import('../../../src/chains/public-testnet/sepolia-receiver-runtime-v4.mjs'),Native=await import('../../../src/providers/paged-public-testnet-runtimes-v1.mjs');

for(const mode of ['expiry','canonical-reorg','close','pending-close'])test('original startup wait stays bounded and fenced: '+mode+'; HOST issuance/RPC',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'original-startup-wait-host-'));const K=await import('../../../src/chains/public-testnet/key-store-v1.mjs'),RPC=await import('../../../src/chains/public-testnet/sepolia-receiver-rpc-v4.mjs');let keys,created,signer,nonce=0,posts=0,finalityReads=0,reorg=false;
 let resolvePost;const posted=new Promise(resolve=>resolvePost=resolve);const receipts=new Map(),transactions=new Map(),codes=new Map(),prior={...block,number:'0xff',hash:'0x'+h('prior-finality')};
 const realTimeout=globalThis.setTimeout;t.mock.method(globalThis,'setTimeout',(fn,ms,...args)=>realTimeout(fn,ms===5000?25:ms,...args));
 try{
  const keyset=await K.initializePublicPagedServerKeysV1(join(directory,'keys'));keys=await K.openPublicPagedServerKeysV1(join(directory,'keys'));
  currentRPC=async(method,params)=>{
   if(method==='eth_chainId')return'0xaa36a7';
   if(method==='eth_getBlockByNumber'){if(params[0]==='0x0')return{hash:GENESIS};if(params[0]==='0xff')return prior;if(params[0]==='finalized'){finalityReads++;if(mode==='canonical-reorg'&&finalityReads>=2)reorg=true;return prior;}return reorg?{...block,hash:'0x'+h('changed-canonical-hash')}:block;}
   if(method==='eth_getTransactionCount')return'0x'+nonce.toString(16);if(method==='eth_maxPriorityFeePerGas')return'0x1';if(method==='eth_getBalance')return'0xde0b6b3a7640000';if(method==='eth_getCode')return codes.get(params[0])??'0x';if(method==='eth_estimateGas')return'0x186a0';if(method==='eth_getTransactionReceipt')return mode==='pending-close'?null:receipts.get(params[0])??null;if(method==='eth_getTransactionByHash')return transactions.get(params[0])??null;
   if(method==='eth_sendRawTransaction'){
    const row=JSON.parse(await readFile(join(directory,'receiver-bootstrap/native-wallet.json'),'utf8')).operations.at(-1);assert.equal(row.phase,'SUBMITTING');assert.equal(row.signed.nativeWire,params[0]);assert.equal(row.transaction.nonce,String(nonce));const signed=validateSepoliaReceiverCreationWireV4(row.transaction,row.constructor.sender,params[0]),r={transactionHash:signed.nativeId,status:'0x1',contractAddress:row.constructor.expectedAddress,blockNumber:block.number,blockHash:block.hash,gasUsed:'0x186a0',effectiveGasPrice:'0x2'},tx={hash:signed.nativeId,from:row.constructor.sender,to:null,input:row.transaction.creation,type:'0x2',accessList:[]};for(const [key,value]of Object.entries({nonce:row.transaction.nonce,chainId:'11155111',value:'0',gas:row.transaction.gasLimit,maxFeePerGas:row.transaction.maxFeePerGas,maxPriorityFeePerGas:row.transaction.maxPriorityFeePerGas}))tx[key]='0x'+BigInt(value).toString(16);receipts.set(signed.nativeId,r);transactions.set(signed.nativeId,tx);codes.set(row.constructor.expectedAddress,row.constructor.expectedCode);nonce++;posts++;resolvePost();return signed.nativeId;
   }throw Error('HOST_RPC_UNEXPECTED:'+method);
  };
  created=await RPC.createOriginalPagedSepoliaRpcV4({endpoint:'https://startup-progress-host.invalid',account:keyset.accounts[0],keysetId:keyset.keysetId});created.lifecycle.closed.then(()=>created.lifecycle.acknowledge());const runtime=created.runtime;signer=await K.openOriginalPublicCompiledReceiverSignerV4(keys,runtime);
  const limits={maximumTotalFeeAtomic:'1000000000000000000',expiresAt:Date.now()+(mode==='expiry'?1800:60000)};
  if(mode==='pending-close'){const run=K.executeOriginalPublicCompiledReceiverV4(signer,token(runtime,runtime.accounts[0],'0'),limits);run.catch(()=>{});await posted;await runtime.close();await assert.rejects(run,/RECEIVER_CLOSED/);const journal=JSON.parse(await readFile(join(directory,'receiver-bootstrap/native-wallet.json'),'utf8'));assert.equal(posts,1);assert.equal(journal.operations.length,1);assert.ok(journal.operations[0].signed);assert.equal(journal.operations[0].phase,'UNKNOWN');return;}
  for(let i=0;i<4;i++)await K.executeOriginalPublicCompiledReceiverV4(signer,token(runtime,runtime.accounts[0],String(i)),limits);
  const before=JSON.parse(await readFile(join(directory,'receiver-bootstrap/native-wallet.json'),'utf8'));assert.ok(before.operations.every(row=>row.phase==='CONFIRMED'));const complete=Object.freeze(Object.create(null));completed.set(complete,{runtime,system:{receiverProfile:runtime.profile,deployments:before.operations.map(row=>({address:row.constructor.expectedAddress,expectedCode:row.constructor.expectedCode,source:row.constructor.source,name:row.constructor.name,nonce:row.constructor.nonce}))}});
  await assert.rejects(K.waitOriginalPublicCompiledReceiverFinalityV4({...signer},complete),/RECEIVER_CLOSED/);
  await assert.rejects(K.waitOriginalPublicCompiledReceiverFinalityV4(signer,{...complete}),/HOST_ORIGINAL_COMPLETION/);
  const waiting=K.waitOriginalPublicCompiledReceiverFinalityV4(signer,complete);waiting.catch(()=>{});
  if(mode==='close'){await new Promise(resolve=>realTimeout(resolve,40));await runtime.close();await assert.rejects(waiting,/RECEIVER_CLOSED/);}
  else await assert.rejects(waiting,mode==='expiry'?/FINALITY_PENDING/:/RECEIVER_CANONICAL/);
  assert.ok(finalityReads>=1);if(mode==='canonical-reorg')assert.ok(finalityReads>=2);assert.equal(posts,4);assert.deepEqual(JSON.parse(await readFile(join(directory,'receiver-bootstrap/native-wallet.json'),'utf8')),before);
  if(mode==='expiry'){await assert.rejects(K.executeOriginalPublicCompiledReceiverV4(signer,token(runtime,runtime.accounts[0],'4'),{...limits,expiresAt:Date.now()+60000}),/APPROVAL_EXPIRED/);assert.equal(posts,4);}
 }finally{await K.closeOriginalPublicCompiledReceiverSignerV4(signer);await created?.runtime.close();K.closePublicPagedServerKeysV1(keys);await rm(directory,{recursive:true,force:true});}
});

for(const mode of ['before-sign','after-post'])test('Native close cancels its internal original receiver before draining the ETH queue: '+mode+'; HOST issuance/RPC',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'original-native-close-host-'));let native,runtime,release,entered,posts=0,paused=false;
 const held=new Promise(resolve=>entered=resolve);
 try{
  await initializePublicPagedServerKeysV1(join(directory,'keys'));
  currentRPC=async(method,params)=>{
   if(method==='eth_chainId')return'0xaa36a7';if(method==='eth_getBlockByNumber')return params[0]==='0x0'?{hash:GENESIS}:block;
   if(method==='eth_getTransactionCount')return posts?'0x1':'0x0';if(method==='eth_maxPriorityFeePerGas')return'0x1';if(method==='eth_getBalance')return'0xde0b6b3a7640000';if(method==='eth_getCode')return'0x';
   if(method==='eth_estimateGas'){if(mode==='before-sign'&&!paused){paused=true;entered();await new Promise(resolve=>release=resolve);}return'0x186a0';}
   if(method==='eth_sendRawTransaction'){const row=JSON.parse(await readFile(join(directory,'receiver-bootstrap/native-wallet.json'),'utf8')).operations[0];assert.equal(row.phase,'SUBMITTING');assert.equal(row.signed.nativeWire,params[0]);posts++;return row.signed.nativeId;}
   if(method==='eth_getTransactionReceipt'){if(mode==='after-post'&&!paused){paused=true;entered();await new Promise(resolve=>release=resolve);}return null;}
   throw Error('HOST_RPC_UNEXPECTED:'+method);
  };
  native=await Native.createOriginalPagedPublicTestnetRuntimesV1({directory});runtime=await Receiver.createOriginalPagedSepoliaReceiverRuntimeV4({nativeRuntime:native});
  const run=Receiver.executeOriginalPagedSepoliaDeploymentConstructorV4(runtime,token(runtime,runtime.accounts[0]),{maximumTotalFeeAtomic:'1000000000000000000',expiresAt:Date.now()+60000});run.catch(()=>{});await held;
  // Only Native.close is invoked. It must close the receiver it owns itself,
  // before awaiting this still-running original serialized operation.
  const stopped=native.close();stopped.catch(()=>{});assert.throws(()=>Receiver.assertOriginalPagedSepoliaReceiverRuntimeV4(runtime),/RECEIVER_CLOSED/);release();
  await assert.rejects(run,/RECEIVER_CLOSED/);await stopped;assert.equal(posts,mode==='before-sign'?0:1);
  const disk=await readFile(join(directory,'receiver-bootstrap/native-wallet.json'),'utf8').then(JSON.parse).catch(error=>{assert.equal(mode,'before-sign');assert.equal(error.code,'ENOENT');return{operations:[]};});
  assert.equal(disk.operations.length,mode==='before-sign'?0:1);if(mode==='after-post'){assert.equal(disk.operations[0].phase,'UNKNOWN');assert.ok(disk.operations[0].signed);}
  assert.throws(()=>Native.assertOriginalPagedPublicTestnetRuntimeV1(native),/PUBLIC_RUNTIME_CLOSED/);runtime=null;native=null;
 }finally{release?.();await runtime?.close();await native?.close();await rm(directory,{recursive:true,force:true});}
});
