/** Protected keys, real signed wires, Source CAS and nonce/history checks.
 * Target/consent producers and chain observations are explicit HOST ports.
 * This test claims neither circuit verification nor public DeFi acceptance. */
import test,{mock} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {Transaction} from 'micro-eth-signer';
import {predictNativeCreateAddress} from '../../../src/execution/native/dispatch/native-deployment.mjs';
const sha=v=>createHash('sha256').update(v).digest('hex'),canonical=v=>v===null||typeof v!=='object'?JSON.stringify(v):Array.isArray(v)?'['+v.map(canonical).join(',')+']':'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}';
const GENESIS='0x25a5cc106eea7138acab33231d7160d69cb777ee0c2c553fcddf5138993e6dd9',permits=new WeakMap(),commands=new WeakMap(),capitalCommands=new WeakMap(),faucetPermits=new WeakMap();let plan,target,accountHandle,originalRuntime;
mock.module(new URL('../../../src/operations/deployments/defi/morpho-v2-sepolia-target-v4.mjs',import.meta.url).href,{exports:{}});
mock.module(new URL('../../../src/operations/deployments/defi/aave-sepolia-target-v4.mjs',import.meta.url).href,{exports:{
 async readOriginalAaveSepoliaInitializationV4(runtime,token){const p=permits.get(token);assert.ok(p&&p.runtime===runtime,'HOST_ORIGINAL_TARGET_PERMIT');return p.grant;},
 async consumeOriginalAaveSepoliaInitializationV4(runtime,token){const p=permits.get(token);assert.ok(p&&p.runtime===runtime&&!p.used,'HOST_TARGET_PERMIT_ONE_USE');p.used=true;return p.grant;},
 async prepareOriginalAaveSepoliaInitializationDispatchV8(runtime,token){const p=permits.get(token);assert.ok(p?.runtime===runtime,'HOST_ORIGINAL_TARGET_PERMIT');return p.grant;},
 async readOriginalAaveSepoliaInitializationDispatchV8(runtime,token){const p=permits.get(token);assert.ok(p?.runtime===runtime,'HOST_ORIGINAL_TARGET_PERMIT');return p.grant;},
 async consumeOriginalAaveSepoliaInitializationDispatchV8(runtime,token){const p=permits.get(token);assert.ok(p?.runtime===runtime&&!p.used,'HOST_TARGET_PERMIT_ONE_USE');p.used=true;return p.grant;},
 readOriginalAaveSepoliaInitializationAttemptV8(runtime,token){const p=permits.get(token);assert.ok(p?.runtime===runtime);return{consumed:p.used,observationOnly:false};},
 readOriginalAaveSepoliaTargetBindingV4(runtime,value){assert.equal(runtime,originalRuntime);assert.equal(value,target);return{plan};},
 readOriginalAaveSepoliaTargetPlanV4(runtime,value){assert.equal(runtime,originalRuntime);assert.equal(value,plan);return plan;},
}});
mock.module(new URL('../../../src/accounts/authority/device-sepolia-defi-shares-authority-v4.mjs',import.meta.url).href,{exports:{
 async readOriginalDeviceSepoliaDefiFinancialCommandV4(runtime,token){const p=commands.get(token);assert.ok(p&&p.runtime===runtime,'HOST_ORIGINAL_FINANCIAL_PERMIT');return structuredClone(p.grant);},
 async readOriginalDeviceSepoliaDefiFinancialTargetV4(runtime,token){assert.ok(commands.get(token)?.runtime===runtime);return target;},
 async consumeOriginalDeviceSepoliaDefiFinancialCommandV4(runtime,token){const p=commands.get(token);assert.ok(p&&p.runtime===runtime&&!p.used,'HOST_FINANCIAL_ONE_USE');p.used=true;p.grant.journalRevision++;p.beforeKey?.();return structuredClone(p.grant);},
 async readOriginalDeviceSepoliaDefiFinancialDispatchV8(runtime,token){const p=commands.get(token);assert.ok(p?.used&&p.runtime===runtime);p.beforeDispatch?.();return structuredClone(p.grant);},
 async retainOriginalDeviceSepoliaDefiSubmissionV4(runtime,token,id){const p=commands.get(token);assert.ok(p?.used&&p.runtime===runtime);p.nativeId=id;},
 async readOriginalDeviceSepoliaDefiSharesAuthorityBindingV8(account){assert.equal(account,accountHandle);return{runtime:originalRuntime,target,descriptor:{pairingId:'1'.repeat(64)},protocol:'AAVE_STATIC'};},
}});
mock.module(new URL('../../../src/providers/paged-public-sepolia-defi-capital-owner-v8.mjs',import.meta.url).href,{exports:{
 async readOriginalPagedPublicSepoliaDefiCapitalCommandV8(runtime,token){const p=capitalCommands.get(token);assert.ok(p?.runtime===runtime,'HOST_ORIGINAL_CAPITAL_COMMAND');p.beforeRead?.();return structuredClone(p.data);},
 async consumeOriginalPagedPublicSepoliaDefiCapitalCommandV8(runtime,token){const p=capitalCommands.get(token);assert.ok(p?.runtime===runtime&&!p.used&&commands.get(token)?.used,'HOST_CAPITAL_AFTER_FINANCIAL_ONE_USE');p.used=true;commands.get(token).grant.journalRevision++;return structuredClone(p.data);},
}});
mock.module(new URL('../../../src/chains/public-testnet/aave-sepolia-faucet-v8.mjs',import.meta.url).href,{exports:{
 async readOriginalAaveSepoliaFaucetV8(runtime,token){const p=faucetPermits.get(token);assert.ok(p?.runtime===runtime,'HOST_ORIGINAL_FAUCET_PERMISSION');return structuredClone(p.data);},
 async consumeOriginalAaveSepoliaFaucetV8(runtime,token){const p=faucetPermits.get(token);assert.ok(p?.runtime===runtime&&!p.used,'HOST_FAUCET_ONE_USE');p.used=true;return structuredClone(p.data);},
}});
function permit(runtime,index){const token=Object.freeze(Object.create(null));permits.set(token,{runtime,used:false,grant:{profile:'ORIGINAL_AAVE_SEPOLIA_INITIALIZATION_V4',plan,index,kind:index<5?'CREATE':'CALL',request:index<5?plan.constructors[index]:plan.postDeploymentCalls[index-5]}});return token;}
for(const staleBoundary of ['fee-clock-before-key','capital-before-post','withdrawal-before-post'])test('DeFi protected signing preserves lost replies and rejects '+staleBoundary,async t=>{
 const directory=await mkdtemp(join(tmpdir(),'lianum-defi-source-')),K=await import('../../../src/chains/public-testnet/key-store-v1.mjs'),RPC=await import('../../../src/chains/public-testnet/sepolia-receiver-rpc-v4.mjs');let keys,created,source,nonce=0n,posts=0,visible=true,allowance=0n,tokenBalance=2000000n,afterSignedBalance=null;
 const wires=new Map(),codes=new Map(),block={number:'0x100',hash:'0x'+'44'.repeat(32),parentHash:'0x'+'33'.repeat(32),timestamp:'0x'+Math.floor(Date.now()/1000).toString(16),gasLimit:'0x1c9c380',baseFeePerGas:'0x1'},q=v=>'0x'+BigInt(v).toString(16),word=v=>'0x'+BigInt(v).toString(16).padStart(64,'0');
 const timeout=globalThis.setTimeout;t.mock.method(globalThis,'setTimeout',(fn,ms,...args)=>timeout(fn,ms===1000?0:ms,...args));
 const keyset=await K.initializePublicPagedServerKeysV1(join(directory,'keys')),account=keyset.accounts[0];accountHandle=Object.freeze({});
 t.mock.method(globalThis,'fetch',async(_url,options)=>{
  const req=JSON.parse(options.body);let result;
  switch(req.method){
   case'eth_chainId':result='0xaa36a7';break;
   case'eth_getBlockByNumber':result=req.params[0]==='0x0'?{hash:GENESIS}:block;break;
   case'eth_getTransactionCount':result=q(nonce);break;
   case'eth_getBalance':afterSignedBalance?.();result='0xde0b6b3a7640000';break;
   case'eth_maxPriorityFeePerGas':result='0x1';break;
   case'eth_estimateGas':result='0x186a0';break;
   case'eth_getCode':result=codes.get(req.params[0])??'0x';break;
   case'eth_call':result=req.params[0].data.startsWith('0x70a08231')?word(tokenBalance):word(allowance);break;
   case'eth_sendRawTransaction':{
    const tx=Transaction.fromHex(req.params[0]),raw=tx.raw;assert.equal(raw.nonce,nonce);posts++;wires.set(tx.hash,req.params[0]);
    const row=JSON.parse(await readFile(join(directory,'source-operations/native-wallet.json'),'utf8')).operations.find(row=>row.signed?.nativeId===tx.hash);assert.equal(row.phase,'SUBMITTING');
    if(row.command.kind==='CREATE')codes.set(row.command.request.expectedAddress,row.command.request.expectedCode);
    if(raw.data?.startsWith('0x095ea7b3'))allowance=BigInt('0x'+raw.data.slice(-64));nonce++;throw Error('HOST_LOST_ACK');
   }
   case'eth_getTransactionReceipt':{
    const wire=wires.get(req.params[0]);if(!visible||!wire){result=null;break;}const tx=Transaction.fromHex(wire),raw=tx.raw;
    const row=JSON.parse(await readFile(join(directory,'source-operations/native-wallet.json'),'utf8')).operations.find(row=>row.signed?.nativeId===tx.hash);
    result={transactionHash:tx.hash,status:'0x1',blockHash:block.hash,blockNumber:block.number,gasUsed:'0x186a0',effectiveGasPrice:'0x2',contractAddress:row.command.kind==='CREATE'?row.command.request.expectedAddress:null};break;
   }
   case'eth_getTransactionByHash':{
    const wire=wires.get(req.params[0]);if(!wire){result=null;break;}const tx=Transaction.fromHex(wire),raw=tx.raw;
    const row=JSON.parse(await readFile(join(directory,'source-operations/native-wallet.json'),'utf8')).operations.find(row=>row.signed?.nativeId===tx.hash);
    result={hash:tx.hash,from:account.address,to:row.command.kind==='CREATE'?null:raw.to,input:raw.data,type:'0x2',chainId:q(raw.chainId),nonce:q(raw.nonce),value:q(raw.value),gas:q(raw.gasLimit),maxFeePerGas:q(raw.maxFeePerGas),maxPriorityFeePerGas:q(raw.maxPriorityFeePerGas),accessList:[]};break;
   }
   default:throw Error('HOST_RPC_UNEXPECTED:'+req.method);
  }
  return new Response(JSON.stringify({jsonrpc:'2.0',id:req.id,result}),{status:200});
 });
 try{
  keys=await K.openPublicPagedServerKeysV1(join(directory,'keys'));created=await RPC.createOriginalPagedSepoliaRpcV4({endpoint:'https://defi-source-host.invalid',account,keysetId:keyset.keysetId});created.lifecycle.closed.then(()=>created.lifecycle.acknowledge());const runtime=created.runtime;originalRuntime=runtime;
  const policy={profile:'ORIGINAL_PAGED_SEPOLIA_OPERATOR_SPONSOR_V4',keysetId:keyset.keysetId,account:account.address,maximumFeePerTransactionAtomic:'500000000000000',maximumTotalFeeAtomic:'5000000000000000',maximumValuePerTransactionAtomic:'1000000000000000',maximumTotalValueAtomic:'2000000000000000',expiresAt:Date.now()+3600000};
  await mkdir(join(directory,'receiver-bootstrap'),{mode:0o700});await writeFile(join(directory,'receiver-bootstrap/native-wallet.json'),JSON.stringify({configurationSHA256:sha(Buffer.from('ORIGINAL_PAGED_PUBLIC_SEPOLIA_RECEIVER_V4\0'+keyset.keysetId+'\0'+GENESIS)),operations:[]}),{mode:0o600});source=await K.openOriginalPublicPagedSourceSignerV4(keys,runtime,policy,new AbortController().signal);
  const addresses=Array.from({length:5},(_,i)=>predictNativeCreateAddress(account.address,BigInt(i))),underlying='0x94a9d9ac8a22534e3faca9f4e7f2e2cf85d5e4c8',pools=[{address:addresses[1],asset:underlying,domain:{scope:'2'.repeat(64)}},{address:addresses[2],asset:'0x'+'34'.repeat(20),scope:'0x'+'3'.repeat(64),domain:{scope:'3'.repeat(64)}}];
  const data={profile:'ORIGINAL_AAVE_SEPOLIA_TARGET_PLAN_V4',chainId:'11155111',keysetId:keyset.keysetId,account:account.address,policySHA256:sha(JSON.stringify(policy)),startNonce:'0',target:{hub:{address:addresses[0]},pools},delivery:{address:addresses[3]},exit:{address:addresses[4]},constructors:addresses.map((address,index)=>({nonce:String(index),expectedAddress:address,creation:'0x6001600055',expectedCode:'0x6000'})),postDeploymentCalls:pools.map((pool,index)=>({nonce:String(5+index),from:account.address,to:addresses[0],value:'0',pool:pool.address,data:'0x12345678'+pool.address.slice(2).padStart(64,'0')}))};plan={...data,planSHA256:sha(canonical(data))};target=Object.freeze({planSHA256:plan.planSHA256});
  await assert.rejects(K.executeOriginalPublicSepoliaDefiTargetInitializationV8(source,{},'AAVE_STATIC'),/HOST_ORIGINAL/);assert.equal(posts,0);
  for(let i=0;i<7;i++){const token=permit(runtime,i);await K.executeOriginalPublicSepoliaDefiTargetInitializationV8(source,token,'AAVE_STATIC');await K.executeOriginalPublicSepoliaDefiTargetInitializationV8(source,token,'AAVE_STATIC');}
  assert.equal(posts,7);let disk=JSON.parse(await readFile(join(directory,'source-operations/native-wallet.json'),'utf8'));assert.equal(disk.operations.length,7);assert.ok(disk.operations.every(row=>row.phase==='FINALIZED'));K.assertOriginalPublicSepoliaDefiRetainedPlanV8(source,plan);
  const command=Object.freeze(Object.create(null)),grant={profile:'ORIGINAL_SEPOLIA_DEFI_FINANCIAL_COMMAND_V4',protocol:'AAVE_STATIC',kind:'INVEST',from:account.address,to:addresses[3],value:'0',data:'0xabcdef12',review:{reference:'4'.repeat(64),protocol:'AAVE_STATIC',maximumInputAtomic:'1000000'},descriptor:{pairingId:'1'.repeat(64),poolTerms:{scope:'3'.repeat(64)}},jobId:'5'.repeat(64),journalRevision:1,journalDataSHA256:'6'.repeat(64),financialNativeMounted:false};commands.set(command,{runtime,grant,used:false});
  await assert.rejects(K.executeOriginalPublicSepoliaDefiCommandV8(source,command),/HOST_ORIGINAL_CAPITAL_COMMAND/);assert.equal(posts,7,'an unreserved investment cannot even approve tokens');
  const capital={profile:'ORIGINAL_SEPOLIA_DEFI_CAPITAL_COMMAND_V8',protocol:grant.protocol,jobId:grant.jobId,reference:grant.review.reference,targetPlanSHA256:plan.planSHA256,dispatch:{id:'investment',authorizationRoot:'7'.repeat(64),actionCommitment:'8'.repeat(64)},id:'investment',authorizationRoot:'7'.repeat(64),actionCommitment:'8'.repeat(64),quoteTermsSHA256:'9'.repeat(64),budget:'300',payout:{amountAtomic:'100'},inputCeiling:{amountAtomic:grant.review.maximumInputAtomic},feeCeiling:{amountAtomic:'500000000000000'},delivery:{profile:'PUBLIC_SEPOLIA_DEFI_PAGED_DELIVERY_DATA_V8',protocol:grant.protocol,context:{targetPlanSHA256:plan.planSHA256},encodedDescriptor:'a'.repeat(64)}};capitalCommands.set(command,{runtime,data:capital,used:false});
  tokenBalance=0n;await assert.rejects(K.executeOriginalPublicSepoliaDefiCommandV8(source,command),/TOKEN_FUNDS_REQUIRED/);assert.equal(posts,7);tokenBalance=2000000n;
  visible=false;await assert.rejects(K.executeOriginalPublicSepoliaDefiCommandV8(source,command),/ORIGINAL_APPROVAL_PENDING/);assert.equal(posts,8);assert.equal(allowance,1000000n);assert.equal(commands.get(command).used,false);
  await assert.rejects(K.executeOriginalPublicSepoliaDefiCommandV8(source,command),/ORIGINAL_APPROVAL_PENDING/);assert.equal(posts,8,'effective allowance cannot bypass observation of the retained UNKNOWN approval');visible=true;
  const submitted=await K.executeOriginalPublicSepoliaDefiCommandV8(source,command);assert.equal(posts,9);assert.equal(submitted.phase,'SUBMITTED');assert.equal(submitted.canonical,false);assert.equal(allowance,1000000n);assert.ok(commands.get(command).nativeId);
  const observed=await K.observeOriginalPublicSepoliaDefiCommandV8(source,accountHandle,grant.jobId,'INVEST');assert.equal(observed.phase,'CONFIRMED');assert.equal(observed.transactionHash,submitted.transactionHash);assert.equal(posts,9);
  await assert.rejects(K.executeOriginalPublicSepoliaDefiCommandV8(source,{...command}),/HOST_ORIGINAL/);const evidence=await K.issueOriginalPublicSepoliaDefiSubmissionEvidenceV8(source,accountHandle,grant.jobId,'INVEST');assert.throws(()=>K.consumeOriginalPublicSepoliaDefiSubmissionEvidenceV8(runtime,accountHandle,{...evidence}),/ORIGINAL_SUBMISSION_EVIDENCE/);assert.equal(K.consumeOriginalPublicSepoliaDefiSubmissionEvidenceV8(runtime,accountHandle,evidence).transactionHash,submitted.transactionHash);assert.throws(()=>K.consumeOriginalPublicSepoliaDefiSubmissionEvidenceV8(runtime,accountHandle,evidence),/ORIGINAL_SUBMISSION_EVIDENCE/);
  const actualDelivery=await K.readOriginalPublicSepoliaDefiDeliveryDataV8(source,accountHandle,grant.jobId);assert.equal(actualDelivery.phase,'FINALIZED');assert.equal(actualDelivery.signed.nativeId,submitted.transactionHash);assert.deepEqual(actualDelivery.capital,capital);assert.equal(capitalCommands.get(command).used,true);assert.equal(K.readOriginalPublicPagedSourceCheckpointV4(source).immutableRowsAnchor.count,9);
  const f=await import('../../../src/chains/public-testnet/aave-sepolia-faucet-data-v8.mjs'),faucet=Object.freeze(Object.create(null)),mint={profile:'ORIGINAL_AAVE_SEPOLIA_FAUCET_GRANT_V8',targetPlanSHA256:plan.planSHA256,policySHA256:sha(JSON.stringify(policy)),chainId:'11155111',from:account.address,to:f.FAUCET,value:'0',calldata:'0xc6c3bbe6'+f.USDC.slice(2).padStart(64,'0')+account.address.slice(2).padStart(64,'0')+(2000000n).toString(16).padStart(64,'0'),token:f.USDC,recipient:account.address,amountAtomic:'2000000',faucetCodeSHA256:f.CODE_SHA256};faucetPermits.set(faucet,{runtime,data:mint,used:false});
  await assert.rejects(K.executeOriginalPublicAaveTestLiquidityV8(source,{...faucet}),/HOST_ORIGINAL_FAUCET_PERMISSION/);assert.equal(posts,9);const minted=await K.executeOriginalPublicAaveTestLiquidityV8(source,faucet);assert.equal(minted.confirmed,true);assert.equal(posts,10);assert.equal((await K.executeOriginalPublicAaveTestLiquidityV8(source,faucet)).transactionHash,minted.transactionHash);assert.equal(posts,10);assert.equal((await K.observeOriginalPublicAaveTestLiquidityV8(source,plan.planSHA256)).transactionHash,minted.transactionHash);
  const finalDisk=await readFile(join(directory,'source-operations/native-wallet.json'),'utf8');await K.closeOriginalPublicPagedSourceSignerV4(source);source=await K.openOriginalPublicPagedSourceSignerV4(keys,runtime,policy,new AbortController().signal);assert.equal((await K.observeOriginalPublicSepoliaDefiCommandV8(source,accountHandle,grant.jobId,'INVEST')).transactionHash,submitted.transactionHash);assert.equal(posts,10);assert.equal(await readFile(join(directory,'source-operations/native-wallet.json'),'utf8'),finalDisk);
  // An Original permission remains necessary, but cannot renew the fee clock
  // observed before its final asynchronous consumption. No key or wire is
  // produced when that work exhausts the preparation's five minutes.
  const stale=Object.freeze(Object.create(null)),staleGrant={...structuredClone(grant),jobId:'b'.repeat(64),review:{...grant.review,reference:'c'.repeat(64)}};
  if(staleBoundary==='fee-clock-before-key'){
   staleGrant.kind='WITHDRAW';staleGrant.to=addresses[2];const now=Date.now;let offset=0;t.mock.method(Date,'now',()=>now()+offset);commands.set(stale,{runtime,grant:staleGrant,used:false,beforeKey:()=>{offset=300001;}});
   await assert.rejects(K.executeOriginalPublicSepoliaDefiCommandV8(source,stale),/SEPOLIA_DEFI_FINANCIAL_PREPARATION_EXPIRED/);offset=0;
   const rejected=JSON.parse(await readFile(join(directory,'source-operations/native-wallet.json'),'utf8')).operations.at(-1);assert.equal(rejected.command.grant.jobId,staleGrant.jobId);assert.equal(rejected.phase,'KEY_PENDING');assert.equal(rejected.signed,null);assert.equal(posts,10,'a stale fee preparation never reaches the protected key or broadcast');
  }else if(staleBoundary==='capital-before-post'){
   commands.set(stale,{runtime,grant:staleGrant,used:false});capitalCommands.set(stale,{runtime,data:{...structuredClone(capital),jobId:staleGrant.jobId,reference:staleGrant.review.reference},used:false,beforeRead:()=>{assert.ok(!commands.get(stale).nativeId,'HOST_CAPITAL_AUTHORIZATION_EXPIRED');}});
   await assert.rejects(K.executeOriginalPublicSepoliaDefiCommandV8(source,stale),/HOST_CAPITAL_AUTHORIZATION_EXPIRED/);
   const rejected=JSON.parse(await readFile(join(directory,'source-operations/native-wallet.json'),'utf8')).operations.at(-1);assert.equal(rejected.phase,'SUBMITTING');assert.ok(rejected.signed.nativeId);assert.equal(posts,10,'expired capital never broadcasts an already retained wire');
   const pending=await K.observeOriginalPublicSepoliaDefiCommandV8(source,accountHandle,staleGrant.jobId,'INVEST');assert.equal(pending.transactionHash,rejected.signed.nativeId);assert.equal(posts,10,'recovery only observes the same retained wire');
  }else{
   staleGrant.kind='WITHDRAW';staleGrant.to=addresses[2];const now=Date.now,expiresAt=now()+15000;let offset=0;t.mock.method(Date,'now',()=>now()+offset);
   commands.set(stale,{runtime,grant:staleGrant,used:false,beforeDispatch:()=>{assert.ok(Date.now()<expiresAt,'HOST_WITHDRAWAL_AUTHORIZATION_EXPIRED');}});afterSignedBalance=()=>{if(commands.get(stale).nativeId)offset=16000;};
   await assert.rejects(K.executeOriginalPublicSepoliaDefiCommandV8(source,stale),/HOST_WITHDRAWAL_AUTHORIZATION_EXPIRED/);offset=0;afterSignedBalance=null;
   const rejected=JSON.parse(await readFile(join(directory,'source-operations/native-wallet.json'),'utf8')).operations.at(-1);assert.equal(rejected.phase,'SUBMITTING');assert.ok(rejected.signed.nativeId);assert.equal(posts,10,'a withdrawal expiry during fee RPCs never reaches POST');
  }
 }finally{if(source)await K.closeOriginalPublicPagedSourceSignerV4(source);await created?.runtime.close();K.closePublicPagedServerKeysV1(keys);await rm(directory,{recursive:true,force:true});}
});
