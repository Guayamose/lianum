/** Real protected keyset, type-2 signatures and durable Source journal. Kernel
 * commands, retirement owner and RPC are HOST seams; no SNARK/public acceptance. */
import test,{mock} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {Transaction} from 'micro-eth-signer';
import {publicKeccak256} from '@lianum/engine/cohorts/private-cohort-public-native';
import {encodeWalletPoolInputs} from '@lianum/engine/wallet/notes/private-wallet-note-encoding';
import * as D from '../../../src/chains/public-testnet/sepolia-deposit-retry-data-v18.mjs';
const sha=v=>createHash('sha256').update(v).digest('hex'),h=n=>n.toString(16).padStart(64,'0'),a=n=>'0x'+n.toString(16).padStart(40,'0'),w=n=>BigInt(n).toString(16).padStart(64,'0');
const commands=new WeakMap(),retirements=new WeakMap(),url=p=>new URL('../../../src/'+p,import.meta.url).href;
async function readCommand(runtime,token){const g=commands.get(token);assert.ok(g&&g.runtime===runtime&&Date.now()<g.request.expiresAt,'HOST_ORIGINAL_COMMAND');return structuredClone(g.request);}
async function consumeCommand(runtime,token){const request=await readCommand(runtime,token),g=commands.get(token);assert.equal(g.used,false);g.used=true;return request;}
mock.module(url('operations/local/funded-graph-paged-public-kernel-v4.mjs'),{exports:{readOriginalPagedSepoliaSourceCommandV4:readCommand,consumeOriginalPagedSepoliaSourceCommandV4:consumeCommand,isOriginalPagedSepoliaExpiredDepositRetirementV18:t=>retirements.get(t)?.namespace==='NATIVE',consumeOriginalPagedSepoliaExpiredDepositRetirementV18:(r,t)=>consumeRetirement(r,t,'NATIVE')}});
async function consumeRetirement(runtime,token,namespace){const g=retirements.get(token);assert.ok(g&&g.runtime===runtime&&g.namespace===namespace&&!g.used,'HOST_ORIGINAL_RETIREMENT');g.used=true;return structuredClone(g.data);}
mock.module(url('operations/local/sepolia-defi-mixed-source-kernel-v8.mjs'),{exports:{readOriginalSepoliaDefiMixedSourceCommandV8:readCommand,consumeOriginalSepoliaDefiMixedSourceCommandV8:consumeCommand,consumeOriginalSepoliaDefiExpiredDepositRetirementV18:(r,t)=>consumeRetirement(r,t,'DEFI')}});
mock.module(url('operations/local/sepolia-uniswap-mixed-source-kernel-v4.mjs'),{exports:{readOriginalSepoliaUniswapMixedSourceCommandV4:readCommand,consumeOriginalSepoliaUniswapMixedSourceCommandV4:consumeCommand,isOriginalSepoliaUniswapExpiredDepositRetirementV18:t=>retirements.get(t)?.namespace==='UNISWAP',consumeOriginalSepoliaUniswapExpiredDepositRetirementV18:(r,t)=>consumeRetirement(r,t,'UNISWAP')}});
function input(epoch=1,change={}){return encodeWalletPoolInputs('deposit_balance',{scope:'0x'+h(1),policy:'0x'+h(2),epoch:String(epoch),amount:'10',output:'0x'+h(3),...change});}
const selector=publicKeccak256(Buffer.from('depositBalance(bytes,bytes32[])')).subarray(0,4).toString('hex');
function calldata(inputs){return'0x'+selector+w(64)+w(128)+w(1)+'01'.padEnd(64,'0')+w(inputs.length)+inputs.map(w).join('');}
function request(from,epoch=1,change={}){return{profile:'ORIGINAL_PAGED_SEPOLIA_SOURCE_COMMAND_V4',label:'device paged FUND_D26',from,to:a(10),value:'10',data:calldata(input(epoch)),identity:h(12),jobId:'host-same-deposit-job',action:'FUND_D26',journalRevision:1,journalDataSHA256:h(13),expiresAt:Date.now()+15000,...change};}
test('deposit retry data preserves scope, policy, value and commitment; ABI ambiguity and active nonce aliases fail',()=>{
 const old=request(a(1)),next=request(a(1),2);assert.equal(D.readDepositSourceStatementV18(old).epoch,'1');D.assertSameDepositRetryV18(old,next);
 const row={profile:'ORIGINAL_PAGED_SEPOLIA_DEFI_SOURCE_ROW_V8',id:D.depositSourceBaseIdV18(old),command:old,transaction:{nonce:'0'},phase:D.EXPIRED_DEPOSIT_V18,signed:{nativeId:'0x'+h(1)},receipt:null};
 const retry={...row,id:D.depositSourceRetryIdV18(next),command:next,phase:'UNKNOWN'};D.assertDepositRetryNonceHistoryV18([row,retry]);
 for(const changed of [{output:'0x'+h(9)},{scope:'0x'+h(9)},{policy:'0x'+h(9)},{amount:'11'}]){
  const c={...next,data:calldata(input(2,changed)),...(changed.amount?{value:changed.amount}:{})};assert.throws(()=>D.assertSameDepositRetryV18(old,c));
 }
 assert.throws(()=>D.readDepositSourceStatementV18({...old,data:old.data+'00'}));
 assert.throws(()=>D.readDepositSourceStatementV18({...old,data:'0xdeadbeef'+old.data.slice(10)}));
 assert.throws(()=>D.assertDepositRetryNonceHistoryV18([{...row,phase:'UNKNOWN'},retry]),/ORIGINAL_EXPIRED|DUPLICATE_NONCE/);
 assert.throws(()=>D.assertDepositRetryNonceHistoryV18([retry]),/ORIGINAL_EXPIRED/);
 assert.throws(()=>D.assertDepositRetryNonceHistoryV18([{...row,receipt:{status:'0x1'}}]),/EXPIRED_SUCCESS/);
});
for(const namespace of ['NATIVE','UNISWAP','DEFI'])test(namespace+': Original Source retires only an absent, finalized-expired deposit and requires a new scoped command to retry',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'sepolia-expired-deposit-v18-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 const K=await import('../../../src/chains/public-testnet/key-store-v1.mjs'),RPC=await import('../../../src/chains/public-testnet/sepolia-receiver-rpc-v4.mjs');
 const execute=namespace==='NATIVE'?K.executeOriginalPublicPagedSourceV4:namespace==='UNISWAP'?K.executeOriginalPublicUniswapMixedSourceCallV4:K.executeOriginalPublicSepoliaDefiMixedSourceCallV8;
 const keyset=await K.initializePublicPagedServerKeysV1(join(directory,'keys')),keys=await K.openPublicPagedServerKeysV1(join(directory,'keys')),account=keyset.accounts[0],genesis='0x25a5cc106eea7138acab33231d7160d69cb777ee0c2c553fcddf5138993e6dd9';
 let signer,created,posts=0,wire=null,receiptAvailable=false,nonce=0n,finalizedNonce=null,reorg=false,epoch=1n,visible=false,inserted=false,stale=true,code='0x6000';
 const head=()=>({number:'0x100',hash:'0x'+h(44),parentHash:'0x'+h(43),timestamp:'0x'+(epoch*600n).toString(16),gasLimit:'0x1c9c380',baseFeePerGas:'0x1'});
 const receipt=()=>({transactionHash:Transaction.fromHex(wire).hash,status:'0x1',blockHash:head().hash,blockNumber:head().number,gasUsed:'0x7530',effectiveGasPrice:'0x2',logs:[]});
 const staleBytes='0x08c379a0'+w(32)+w(11)+Buffer.from('STALE_EPOCH').toString('hex').padEnd(64,'0');
 t.mock.method(globalThis,'fetch',async(_endpoint,options)=>{
  const req=JSON.parse(options.body);let result,error;
  switch(req.method){
   case'eth_chainId':result='0xaa36a7';break;
   case'eth_getBlockByNumber':result=req.params[0]==='0x0'?{hash:genesis}:{...head(),...(reorg&&req.params[0]==='0x100'?{hash:'0x'+h(99)}:{})};break;
   case'eth_getTransactionCount':result='0x'+(req.params[1]==='0x100'?(finalizedNonce??nonce):nonce).toString(16);break;
   case'eth_getBalance':result='0x1bc16d674ec80000';break;
   case'eth_maxPriorityFeePerGas':result='0x1';break;
   case'eth_estimateGas':result='0x7530';break;
   case'eth_getCode':result=code;break;
   case'eth_call':if(req.params[0].data.startsWith('0x'+selector)){if(stale)error={code:3,message:'private provider details',data:staleBytes};else result='0x';}else result='0x'+w(inserted?1:0);break;
   case'eth_sendRawTransaction':posts++;wire=req.params[0];if(posts===1)return new Response('private rejected POST body',{status:503});nonce=1n;receiptAvailable=true;result=Transaction.fromHex(wire).hash;break;
   case'eth_getTransactionReceipt':result=receiptAvailable&&req.params[0]===Transaction.fromHex(wire).hash?receipt():null;break;
   case'eth_getTransactionByHash':if(receiptAvailable&&req.params[0]===Transaction.fromHex(wire).hash){const x=Transaction.fromHex(wire).raw;result={hash:Transaction.fromHex(wire).hash,from:account.address,to:x.to,input:x.data,type:'0x2',chainId:'0x'+x.chainId.toString(16),nonce:'0x'+x.nonce.toString(16),value:'0x'+x.value.toString(16),gas:'0x'+x.gasLimit.toString(16),maxFeePerGas:'0x'+x.maxFeePerGas.toString(16),maxPriorityFeePerGas:'0x'+x.maxPriorityFeePerGas.toString(16),accessList:[]};}else result=visible?{hash:req.params[0]}:null;break;
   default:throw Error('HOST_UNEXPECTED_RPC:'+req.method);
  }
  return Response.json({jsonrpc:'2.0',id:req.id,...(error?{error}:{result})});
 });
 const timeout=globalThis.setTimeout;t.mock.method(globalThis,'setTimeout',(fn,ms,...args)=>timeout(fn,ms===1000?0:ms,...args));
 function command(runtime,c){const token=Object.freeze({});commands.set(token,{runtime,request:c,used:false});return token;}
 function retirement(runtime,c,change={}){const token=Object.freeze({});retirements.set(token,{runtime,namespace,used:false,data:{identity:c.identity,jobId:c.jobId,from:c.from,to:c.to,value:c.value,calldataSHA256:sha(Buffer.from(c.data.slice(2),'hex')),publicInputs:input(),poolCodeHash:publicKeccak256(Buffer.from('6000','hex')).toString('hex'),...change}});return token;}
 const file=join(directory,'source-operations/native-wallet.json'),disk=async()=>JSON.parse(await readFile(file,'utf8'));
 try{
  created=await RPC.createOriginalPagedSepoliaRpcV4({endpoint:'https://retry-host.invalid',account,keysetId:keyset.keysetId});created.lifecycle.closed.then(()=>created.lifecycle.acknowledge());const runtime=created.runtime;
  const policy={profile:'ORIGINAL_PAGED_SEPOLIA_OPERATOR_SPONSOR_V4',keysetId:keyset.keysetId,account:account.address,maximumFeePerTransactionAtomic:'500000000000000',maximumTotalFeeAtomic:'5000000000000000',maximumValuePerTransactionAtomic:'1000000000000000',maximumTotalValueAtomic:'2000000000000000',expiresAt:Date.now()+3600000};
  await mkdir(join(directory,'receiver-bootstrap'),{mode:0o700});await writeFile(join(directory,'receiver-bootstrap/native-wallet.json'),JSON.stringify({configurationSHA256:sha(Buffer.from('ORIGINAL_PAGED_PUBLIC_SEPOLIA_RECEIVER_V4\0'+keyset.keysetId+'\0'+genesis)),operations:[]}),{mode:0o600});
  signer=await K.openOriginalPublicPagedSourceSignerV4(keys,runtime,policy,new AbortController().signal);
  const old=request(account.address),cap=command(runtime,old),raw=c=>({from:c.from,to:c.to,data:c.data,value:BigInt(c.value)});
  // A current Original owner can also recover an UNKNOWN account intent
  // when the serialized signer proves no durable Source intent ever existed.
  await assert.rejects(readFile(file),{code:'ENOENT'});epoch=2n;
  const noAttempt=await K.retireOriginalPublicExpiredDepositV18(signer,retirement(runtime,old));
  assert.equal(noAttempt.originalSignerNoAttempt,true);assert.equal(noAttempt.financialSignatureIssued,false);assert.equal(noAttempt.broadcasts,0);assert.equal(posts,0);await assert.rejects(readFile(file),{code:'ENOENT'});epoch=1n;
  await assert.rejects(execute(signer,cap,old.label,raw(old)),/ORIGINAL_SEND_PENDING/);assert.equal(posts,1);
  const before=await disk();assert.equal(before.operations[0].phase,'UNKNOWN');
  await assert.rejects(K.retireOriginalPublicExpiredDepositV18(signer,{}),/HOST_ORIGINAL_RETIREMENT/);
  await assert.rejects(K.retireOriginalPublicExpiredDepositV18(signer,retirement(runtime,old)),/NOT_FINALIZED/);epoch=2n;
  for(const [field,value,reason]of [['visible',true,'STILL_VISIBLE'],['inserted',true,'ALREADY_INSERTED'],['stale',false,'REVERT_UNCONFIRMED'],['code','0x6001','POOL_CODE'],['nonce',1n,'NONCE_CHANGED']]){
   const restore={visible,inserted,stale,code,nonce};if(field==='visible')visible=value;if(field==='inserted')inserted=value;if(field==='stale')stale=value;if(field==='code')code=value;if(field==='nonce')nonce=value;
   await assert.rejects(K.retireOriginalPublicExpiredDepositV18(signer,retirement(runtime,old)),new RegExp(reason));({visible,inserted,stale,code,nonce}=restore);assert.deepEqual(await disk(),before);assert.equal(posts,1);
  }
  const retired=await K.retireOriginalPublicExpiredDepositV18(signer,retirement(runtime,old));assert.equal(retired.retired,true);assert.equal(retired.broadcasts,0);assert.equal(retired.reservationsReleased,false);assert.equal(posts,1);
  const original=(await disk()).operations[0],{phase,...unchanged}=original,{phase:oldPhase,...oldFields}=before.operations[0];assert.equal(phase,D.EXPIRED_DEPOSIT_V18);assert.deepEqual(unchanged,oldFields);K.assertOriginalPublicPagedSourceUnblockedV4(signer);
  const unconsumed=await K.readOriginalPublicPagedSourceFinancialStateV5(signer);
  assert.equal(unconsumed.reviewEligible,false,'retired/absent is insufficient while its nonce remains available');
  const blockedReview={intentId:h(70),expectedCheckpoint:unconsumed.checkpoint,expectedEpochId:null,policy,limits:{maximumTotalSuccessorPools:'1',maximumSourcesPerWallet:'5'}};
  await assert.rejects(K.authorizeOriginalPublicPagedSourceFinancialEpochV5(signer,blockedReview),/PENDING_FENCED/);
  assert.equal(posts,1);assert.deepEqual((await disk()).operations[0],original);
  const bad=request(account.address,2,{data:calldata(input(2,{output:'0x'+h(99)}))});await assert.rejects(execute(signer,command(runtime,bad),bad.label,raw(bad)),/SUBSTITUTION/);assert.equal(posts,1);
  const next=request(account.address,2),confirmed=await execute(signer,command(runtime,next),next.label,raw(next));assert.equal(confirmed.status,'0x1');assert.equal(posts,2);
  const final=await disk();assert.equal(final.operations.length,2);assert.equal(final.operations[0].phase,D.EXPIRED_DEPOSIT_V18);assert.equal(final.operations[1].phase,'FINALIZED');assert.equal(final.operations[1].transaction.nonce,original.transaction.nonce);
  assert.ok(BigInt(final.operations[1].transaction.maxPriorityFeePerGas)>BigInt(original.transaction.maxPriorityFeePerGas));assert.ok(BigInt(final.operations[1].transaction.maxFeePerGas)>BigInt(original.transaction.maxFeePerGas));
  const financial=await K.readOriginalPublicPagedSourceFinancialStateV5(signer);assert.equal(financial.reserved.valueAtomic,'20','retirement must not refund/release the original reservation');
  assert.equal(financial.reviewEligible,true,'the same retired nonce has now been consumed by a finalized replacement');
  const review={intentId:h(71),expectedCheckpoint:financial.checkpoint,expectedEpochId:null,policy,limits:{maximumTotalSuccessorPools:'1',maximumSourcesPerWallet:'5'}};
  finalizedNonce=0n;
  assert.equal((await K.readOriginalPublicPagedSourceFinancialStateV5(signer)).reviewEligible,false,'latest/pending nonce must not substitute for finalized nonce');
  await assert.rejects(K.authorizeOriginalPublicPagedSourceFinancialEpochV5(signer,review),/PENDING_FENCED/);finalizedNonce=null;
  reorg=true;await assert.rejects(K.authorizeOriginalPublicPagedSourceFinancialEpochV5(signer,review),/CANONICAL/);reorg=false;
  const replacementWire=wire;wire=original.signed.nativeWire;
  await assert.rejects(K.authorizeOriginalPublicPagedSourceFinancialEpochV5(signer,review),/RETIRED_SUCCESS/);wire=replacementWire;
  const accepted=await K.authorizeOriginalPublicPagedSourceFinancialEpochV5(signer,review);
  assert.equal(accepted.limits.maximumSourcesPerWallet,'5');assert.deepEqual(accepted.effectivePolicy,policy);
  assert.deepEqual(accepted.reserved,financial.reserved,'quota-only review retains even retired fee/value reservations');
  assert.deepEqual(await disk(),final,'quota review never rewrites retired history, phases, wires or checkpoints');assert.equal(posts,2);
  assert.deepEqual(await K.authorizeOriginalPublicPagedSourceFinancialEpochV5(signer,review),accepted,'lost review ACK is idempotent');
  await K.closeOriginalPublicPagedSourceSignerV4(signer);signer=null;
  const captured=await K.readOriginalPublicPagedCapturedFinancialStateV5(keys,runtime,policy);
  assert.equal(captured.reviewEligible,true);assert.deepEqual(captured.reserved,accepted.reserved);assert.equal(captured.limits.maximumSourcesPerWallet,'5');
  assert.deepEqual(await disk(),final);assert.equal(posts,2,'read-only captured review never broadcasts');
  signer=await K.openOriginalPublicPagedSourceSignerV4(keys,runtime,policy,new AbortController().signal);K.assertOriginalPublicPagedSourceUnblockedV4(signer);assert.equal(posts,2);
 }finally{if(signer)await K.closeOriginalPublicPagedSourceSignerV4(signer);if(created)await created.runtime.close();K.closePublicPagedServerKeysV1(keys);}
});
