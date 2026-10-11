/** Complete runtime, bootstrap, quorum, gate and provider owners over explicit
 * lower chain, deployment, hash and storage ports. Private constructor requests,
 * operation tokens and one-use authorizations are produced by their real owners. */
import {mock} from 'node:test';import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';import {mkdtemp,mkdir,rm} from 'node:fs/promises';import {randomUUID} from 'node:crypto';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {writeFileSync} from 'node:fs';
import {freshKey} from '@lianum/engine/notes/private-note-encoding';
import {legacyDataRoot} from '@lianum/environment';
import * as originalRecords from '@lianum/engine/storage/records';
import {Vault} from '@lianum/engine/crypto/vault';
let control,Gate;
const url=p=>new URL(p,import.meta.url).href,quantity=v=>'0x'+BigInt(v).toString(16);
const harnessURL='@lianum/engine/chains/shared/runtime-harness',actualHarness=await import(harnessURL);
const source=p=>url('../../../../../src/'+p);
const gateURL=source('chains/shared/dispatch/wrapped-claim-graph-dispatch-gate-v1.mjs');
async function lowerRpc(method,params=[]){const c=control;c.calls.push(method);await c.rpcHook?.(method,params);
 switch(method){
 case 'eth_chainId':return '0x1';case 'eth_accounts':return [...c.accounts];case 'eth_blockNumber':return c.head.number;
 case 'eth_getBlockByNumber':{const tag=params[0],n=tag==='latest'?BigInt(c.head.number):tag==='finalized'?(BigInt(c.head.number)>64n?BigInt(c.head.number)-64n:0n):BigInt(tag);return structuredClone(c.blocks.get(n.toString())??null);} 
 case 'eth_getTransactionCount':return c.nonce;case 'eth_getBalance':return quantity(10n**19n);case 'eth_getCode':return '0x';case 'eth_estimateGas':return quantity(50000);
 case 'eth_signTransaction':c.signs++;assert.deepEqual(params[0],c.signRequest);if(c.signFailure)throw Error('HOST_SIGN_UNCERTAIN');return c.data.original.nativeWire;
 case 'eth_sendRawTransaction':c.sends++;assert.equal(params[0],c.data.original.nativeWire);if(c.sendFailure)throw Error('HOST_SEND_UNCERTAIN');c.sent=true;return '0x'+c.data.signed.nativeId;
 case 'evm_setNextBlockTimestamp':c.nextTime=params[0];return null;
 case 'evm_mine':{const old=c.head,n=BigInt(old.number)+1n;c.head={...old,number:quantity(n),hash:'0x'+(100n+n).toString(16).padStart(64,'0'),parentHash:old.hash,timestamp:quantity(c.nextTime),transactions:c.sent&&!c.included?['0x'+c.data.signed.nativeId]:[]};if(c.head.transactions.length)c.included=structuredClone(c.head);c.blocks.set(n.toString(),structuredClone(c.head));c.nonce='0x1';await c.afterMineHook?.(c.head);return null;}
 case 'eth_getTransactionReceipt':return c.included?{transactionHash:'0x'+c.data.signed.nativeId,status:'0x1',blockHash:c.included.hash,blockNumber:c.included.number,transactionIndex:'0x0',gasUsed:quantity(50000)}:null;
 case 'eth_getTransactionByHash':return c.included?{...c.signRequest,hash:'0x'+c.data.signed.nativeId,input:c.signRequest.data,type:'0x0',blockHash:c.included.hash,blockNumber:c.included.number,transactionIndex:'0x0'}:null;
 case 'web3_clientVersion':return 'INERT_GRAPH_CLIENT';
 default:throw Error('HOST_FORBIDDEN_RPC_'+method);
 }
}
mock.module(harnessURL,{exports:{...actualHarness,
 async pinnedBinary(){return '/inert/anvil';},async scratchDirectory(prefix){control.directory=await actualHarness.scratchDirectory(prefix);return control.directory;},async unusedLoopbackPort(){return 31338;},async sleep(){},
 startOwnProcess(binary,args){assert.equal(binary,'/inert/anvil');assert.equal(args[args.indexOf('--chain-id')+1],'1');
  // Public BIP39 test vector: the lower process only emits the startup file;
  // the complete runtime still validates and retains it through its own guard.
  writeFileSync(args[args.indexOf('--config-out')+1],JSON.stringify({available_accounts:control.accounts,wallet:{mnemonic:'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about'}}));
  const child=new EventEmitter();Object.assign(child,{pid:42,exitCode:null,signalCode:null});control.child=child;return {child,assertAlive(){assert.equal(child.exitCode,null,'HOST_PROCESS_DEAD');}};},
 async stopOwnProcess(handle){handle.child.exitCode=0;handle.child.emit('exit',0,null);return {stopped:true,forced:false};},
 async ownedRuntimeRpc(endpoint,method,params){assert.equal(endpoint,'http://127.0.0.1:31338');return lowerRpc(method,params);},
}});
mock.method(globalThis,'fetch',async(endpoint,options)=>{assert.equal(endpoint,'http://127.0.0.1:31338');const requests=JSON.parse(options.body);
 const one=async r=>({jsonrpc:'2.0',id:r.id,result:await lowerRpc(r.method,r.params)});return new Response(JSON.stringify(Array.isArray(requests)?await Promise.all(requests.map(one)):await one(requests)));});
// Fixed actual source export names. Calls delegate to the gate's exact source
// module closure below, never to a caller-selected signer or authority issuer.
const gateExports=['isWrappedClaimGraphDispatchRequestV1','assertOwnedNativeValueEvmDispatchRequest','consumeOwnedNativeValueTronDispatchRequest','consumeWrappedGraphDispatchAuthorityV4','consumeWrappedGraphProviderAuthorityV4','readWrappedGraphDispatchOperationV4','consumeNativeValueProviderBindRequest','assertOwnedNativeValueProvider','createOwnedNativeValueProvider'];
const gatePorts=Object.fromEntries(gateExports.map(name=>[name,(...args)=>{
 if(['assertOwnedNativeValueEvmDispatchRequest','consumeOwnedNativeValueTronDispatchRequest'].includes(name)&&control)control.runtimeRequest=args[0];
 if(name==='consumeWrappedGraphDispatchAuthorityV4'&&control){control.lastNativeAuthority=args.slice();control.beforeNativeConsume?.(args);
  if(control.nativeAuthorityFault===args[1]){const fault=control.authorityFault;
   if(fault==='copy')args[0]={...args[0]};if(fault==='prepared-copy')args[4]=clone(args[4]);if(fault==='operation-copy')args[2]={...args[2]};if(fault==='runtime-copy')args[3]={...args[3]};if(fault==='purpose')args[1]=args[1]==='send'?'native-key':'send';
   if(fault==='replay')Gate[name](...args);
  }}
 if(name==='consumeWrappedGraphProviderAuthorityV4'&&control){control.lastProviderAuthority=args.slice();control.beforeProviderConsume?.(args);}
 return Gate[name](...args);
}]));
const initialGateMock=mock.module(gateURL,{exports:gatePorts});
mock.module(source('chains/tron/transfers/owned-tron-node-driver.mjs'),{exports:{
 async startFixedOwnedTronDriver(){const c=control;c.directory=await mkdtemp(join(tmpdir(),'wrapped-tron-v4-host-'));const id='12'.repeat(32);let closed=false;
  return {directory:c.directory,metadata:{classification:'LOCAL_SYNTHETIC_TRON_JAVA_TRON_CONSENSUS',genesis:c.data.profile.genesis,solverEndpoint:c.data.binding.native.solverEndpoint,recipientEndpoint:c.data.binding.native.recipientEndpoint},
   assertAlive(){assert.equal(closed,false,'HOST_TRON_PROCESS_DEAD');},async health(){return {genesis:c.data.profile.genesis};},
   async prepare(amount,key){assert.equal(amount,c.data.raw.transaction.amountSun);assert.equal(key,c.data.raw.transaction.wireKeyCommitment);return {preparationId:id,snapshot:clone(c.data.raw.snapshot),timestampMs:c.data.raw.transaction.timestampMs,unsignedWire:c.data.raw.unsignedWire};},
   async current(preparationId){assert.equal(preparationId,id);await c.rpcHook?.('tron-current',[]);return clone(c.data.raw.snapshot);},
   async armKey(preparationId){assert.equal(preparationId,id);},async sign(preparationId,wire){assert.equal(preparationId,id);assert.equal(wire,c.data.raw.unsignedWire);c.signs++;if(c.signFailure)throw Error('HOST_SIGN_UNCERTAIN');return {nativeWire:c.data.original.nativeWire,nativeId:c.data.signed.nativeId,transactionSHA256:c.data.signed.transactionSHA256};},
   async armSend(preparationId){assert.equal(preparationId,id);},async broadcast(preparationId,nativeId,sha){assert.equal(preparationId,id);assert.equal(nativeId,c.data.signed.nativeId);assert.equal(sha,c.data.signed.transactionSHA256);c.sends++;if(c.sendFailure)throw Error('HOST_SEND_UNCERTAIN');return {nativeId,accepted:true};},
   async observe(){return {status:'unknown',nativeId:c.data.signed.nativeId,nativeWire:null};},async close(){closed=true;}};
 },inspectOwnedTronRuntimePrerequisites(){throw Error('HOST_NATIVE_STARTUP_DISABLED');}
}});
const {buildOwnedEvmRuntimeBackendV1}=await import(source('chains/evm/runtime/owned-evm-runtime-backend-v1.mjs'));
const deny=()=>assert.fail('HOST_UNRELATED_AUTHORITY_PORT');
const methods=names=>Object.fromEntries(names.map(name=>[name,deny]));
const Evm=buildOwnedEvmRuntimeBackendV1({journal:methods(['beginOriginalNativeSourceMutationV1','confirmOriginalNativeSourceMutationV1','originalNativeSourceRuntimeOwnedProcessV1','originalNativeSourceRuntimeRequestIdentityV1','readOriginalNativeSourceRuntimeSeedV1','readOriginalNativeSourceRuntimeStateV1','resumeOriginalNativeSourceRuntimeSeedV1','retainOriginalNativeSourceRuntimeSeedV1','updateOriginalNativeSourceSectionV1']),
 recovery:methods(['consumeExternalDefiReceiverRepairV1','consumeWrappedRuntimeRecoveryV1','assertNativeEconomicRecoveryCaptureV1','nativeEconomicRecoverySectionIdentityV1','externalDefiReceiverCaptureIdentityV2','consumeExternalDefiReceiverRuntimeSectionV2','deviceExternalFlatReceiverCaptureIdentityV1','consumeDeviceExternalFlatReceiverRuntimeSectionV1','assertNativeLiveArmedRecoveryCaptureV1','nativeLiveArmedRecoverySectionIdentityV1','consumeNativeLiveArmedRecoverySectionV1','nativeD26','economic']),
 deviceSource:methods(['consumeOriginalDeviceGraphSourceRequestV2','consumeOriginalDeviceGraphSourceSectionV2','originalDeviceGraphSourceSectionIdentityV2','beginOriginalDeviceGraphSourceActivityV2','endOriginalDeviceGraphSourceActivityV2']),
 reorg:methods(['probe','recovery']),dispatch:{...methods(['deviceNote','claim','paged']),native:async()=>({...gatePorts,assertOwnedNativeValueEvmDispatchRequest:deny,openWrappedNativeValueEvmDispatchRequest:gatePorts.assertOwnedNativeValueEvmDispatchRequest})},
 observation:{nativeValue:()=>import('../../../../../src/chains/evm/health/evm-native-value-health-source-v4.mjs?complete-wrapped-native')},
});
const Tron=await import(source('chains/tron/runtime/owned-tron-native-value-runtime.mjs')+'?complete-wrapped-native');
initialGateMock.restore();
const Host=await import('../../../../support/wrapped-authorization-host.mjs');
const Public=await import('../transfers/wrapped-graph-v4-public.fixture.mjs'),B=await import(source('chains/shared/dispatch/wrapped-claim-dispatch-binding-v1.mjs')),J=await import(source('chains/shared/dispatch/wrapped-claim-dispatch-journal-v1.mjs'));
const Binding=await import(source('chains/evm/transfers/evm-graph-transfer-binding.mjs'));
const NativeAdmission=await import('@lianum/engine/execution/native/dispatch/native-admission');
const clone=structuredClone;
// Runtime brands are confined to the real isolated family. The receiver used
// for deployment/current reads is the explicit lower, observation-only port.
await Host.mockLower(source('chains/evm/runtime/owned-evm-v2-runtime.mjs'),{exports:{...Evm,
 refreshNativeValueReceiverClock:async runtime=>{assert.equal(runtime,control.receiver);},
 assertOwnedLocalEvmObservedClockV1:runtime=>assert.equal(runtime,control.receiver),
}});
await Host.mockLower(source('chains/tron/runtime/owned-tron-native-value-runtime.mjs'),{exports:{...Tron}});
// The native runtime calls the same actual gate whose operation map the full
// graph quorum reads. No fixture creates an operation or authorization token.
await Host.mockLower(gateURL,{exports:gatePorts});
Host.readWrappedHostPhysicalOperations(operation=>Gate.readWrappedGraphDispatchOperationV4(operation));
const graphURL=source('operations/operators/wrapped/wrapped-claim-graph-operators-v1.mjs');
await Host.mockLower(graphURL,{exports:{...Host.graphModule,
 async issueWrappedGraphDispatchHealthV4(q,request,operation){
  const snapshot=Gate.readWrappedGraphDispatchOperationV4(operation),result=await Host.graphModule.issueWrappedGraphDispatchHealthV4(q,request,operation);
  control.issued.push(result);control.operations.push(operation);control.issuePhases.push(snapshot.phase);await control.issueHook?.(snapshot.phase,result);return result;
 },
 async validateWrappedGraphOriginalAuthorizationV4(q,result){const index=control.issued.indexOf(result);assert.ok(index>=0);const phase=control.issuePhases[index];
  await control.validationHook?.(phase,result);const lease=await Host.graphModule.validateWrappedGraphOriginalAuthorizationV4(q,result);
  const operation=Gate.readWrappedGraphDispatchOperationV4(control.operations[index]);control.validations.push({phase,result,operation});control.afterValidationHook?.(phase,result);return lease;
 },
 consumeWrappedGraphOriginalAuthorizationV4(token,q,result){const started=Host.graphModule.consumeWrappedGraphOriginalAuthorizationV4(token,q,result);
  control.consumeHook?.(control.issuePhases[control.issued.indexOf(result)],result);return started;
 },
}});
const {buildWrappedPrivateLifetimeRegistryV1}=await import(source('claims/wrapped/recovery/wrapped-lifetime-registry-backend-v1.mjs'));
const Lifetime=buildWrappedPrivateLifetimeRegistryV1({runtime:{assertOwnedLocalEvmV2:async runtime=>assert.equal(runtime,control.receiver),assertOwnedDeviceExternalFlatReceiverV1:deny},
 recovery:methods(['retainOriginalWrappedRecoverySectionV1','originalWrappedRecoverySectionIdentityV1','consumeOriginalWrappedRecoverySectionV1']),
 deviceSource:methods(['originalDeviceGraphSourceSectionIdentityV2','consumeOriginalDeviceGraphSourceSectionV2']),
 storage:{async create({directory,identity}){return originalRecords.createClaimRecordStore({path:join(directory,'registry.vault'),password:control.password,identity},{profile:'WRAPPED_FIXED_PRIVATE_LIFETIME_REGISTRY_V1',identity,parts:{}});},open:deny},
});
await Host.mockLower(source('claims/wrapped/recovery/wrapped-recovery-authority-v1.mjs'),{exports:{...Lifetime}});
await Host.mockLower(source('execution/native/recipients/native-recipient-process.mjs'),{exports:{assertOwnedNativeRecipientProcess:recipient=>assert.equal(recipient,control.recipient)}});
// Real provider custody keeps its original Vault CAS and private scoped lease.
// Only the lower Poseidon implementation is a deterministic schema fixture.
const toolsURL='@lianum/proofs/tooling/tooling';
await Host.mockLower(toolsURL,{exports:{resourceModuleURL:new URL('../../../../support/wrapped-hash-port.fixture.mjs',import.meta.url).href,
 async loadPinned(name){assert.equal(name,'@aztec/bb.js');return {BackendType:{Wasm:'HOST'},Barretenberg:{async new(){return {async poseidon2Hash({inputs}){return {hash:Buffer.from(await Public.traceHash(inputs.map(bytes=>BigInt('0x'+Buffer.from(bytes).toString('hex')))),'hex')};},async destroy(){}};}}};}
}});
function observeProviderRecord(record){if(record?.data?.schema==='OWNED_WRAPPED_CLAIM_GRAPH_PROVIDER_CUSTODY_V1')control.record=clone(record.data.dispatch);return record;}
class ObservedVault extends Vault {
 async create(...args){return observeProviderRecord(await super.create(...args));}
 async read(...args){return observeProviderRecord(await super.read(...args));}
 async update(...args){return observeProviderRecord(await super.update(...args));}
}
await Host.mockLower('@lianum/engine/crypto/vault',{exports:{Vault:ObservedVault}});
const ownerURL=source('chains/shared/dispatch/wrapped-claim-dispatch-owner-v1.mjs'),originalOwner=await import(ownerURL);
let Owner;
mock.module(ownerURL,{exports:Object.fromEntries(Object.entries(originalOwner).map(([name,value])=>[name,typeof value==='function'?(...args)=>Owner[name](...args):value]))});
Owner=await import(ownerURL+'?complete-wrapped-owner');
Gate=await import(gateURL+'?complete-wrapped-gate');

export async function fixture({family='EVM'}={}){
 const cleanup=[];const providerKey=freshKey(),publicKey=key=>({x:key.x.toString('hex'),y:key.y.toString('hex')});
 const options={providerKeyOverride:publicKey(providerKey)};
 const preliminary=family==='TRON'?await Public.tronLowerFixture(options):await Public.fixture('ethereum',0,options);
 const timestamp=family==='TRON'?'1900000000':'1900000310';
 const c=control={data:preliminary,password:'wrapped-runtime-fixture-'+randomUUID(),closed:false,providerSigns:0,signs:0,sends:0,calls:[],issued:[],operations:[],issuePhases:[],validations:[],
  receiver:{metadata:{version:'OWNED_FLAT_LOCAL_EVM_V2',evmGenesis:'0x'+'55'.repeat(32),chainId:'31337'},ingressSendState:{epoch:'0',busy:false,uncertain:false}},nonce:'0x0',
  accounts:[preliminary.binding.native.solverEndpoint,...['22','44','55','66'].map(v=>'0x'+v.repeat(20))],
  genesis:{number:'0x0',hash:'0x'+preliminary.profile.genesis,timestamp:quantity(timestamp),transactions:[],baseFeePerGas:quantity(1000000000)},};c.head=clone(c.genesis);c.blocks=new Map([['0',clone(c.genesis)]]);
 if(family==='TRON')c.dateMock=mock.method(Date,'now',()=>Number(preliminary.raw.transaction.timestampMs));
 let lifetimeDirectory;
 async function close(){
  const failures=[];const step=async fn=>{try{await fn();}catch(error){failures.push(error);}};
  await step(()=>c.provider?c.provider.close():c.custody?.close());
  await step(()=>c.native?.close());
  for(const fn of cleanup.splice(0).reverse())await step(fn);
  if(c.lifetime)await step(()=>Lifetime.closeWrappedPrivateLifetimeRegistryV1(c.lifetime));
  c.dateMock?.mock.restore();Host.observeWrappedHostKeys();
  if(lifetimeDirectory)await step(()=>rm(join(lifetimeDirectory,'..'),{recursive:true,force:true}));
  if(c.directory)await step(()=>rm(c.directory,{recursive:true,force:true}));
  if(failures.length)throw new AggregateError(failures,'WRAPPED_HOST_FIXTURE_CLEANUP');
 }
 try {
 c.native=family==='TRON'?await Tron.createOwnedLocalTronNativeValueV1():await Evm.createOwnedLocalEvmNativeValueV1();
 for(const name of ['advanceTo','send','dispatch','rpc','sign'])assert.equal(c.native[name],undefined,'ACTUAL_NATIVE_FACADE');
 const runId=randomUUID();lifetimeDirectory=join(legacyDataRoot('wallet'),'.local/wrapped-deployment-only-v1','attempt-'+runId,'private-audit');
 await mkdir(lifetimeDirectory,{recursive:true,mode:0o700});c.lifetime=await Lifetime.createWrappedPrivateLifetimeRegistryV1({runtime:c.receiver,directory:lifetimeDirectory,runId,sourceSHA256:Public.H('host-source'),deadlineMs:Date.now()+600000});
 let keyAllocations=0;
 Host.observeWrappedHostKeys({freshKey(){assert.equal(keyAllocations++,0);return providerKey;},signature(key){if(key.x.equals(providerKey.x)&&key.y.equals(providerKey.y))c.providerSigns++;}});
 const host=await Host.fixture({after:fn=>cleanup.push(fn)},{receiver:c.receiver,hubDomain:preliminary.binding.domain.hubDomain,timestamp,
  nativeGraph:{runtime:c.native,family,genesis:preliminary.profile.genesis,chainId:preliminary.profile.chainId,read:()=>family==='TRON'?Tron.readOwnedLocalTronNativeValueAuditStateV4(c.native):Evm.readOwnedLocalEvmNativeValueAuditStateV4(c.native)},
  deployment:{async prepare({registration}){
   const args={...options,registrationOverride:registration,poolOverride:registration.claims[0].config.pool};
   c.data=family==='TRON'?await Public.tronLowerFixture(args):await Public.fixture('ethereum',0,args);
   c.intent=await B.bindNativeValueDispatchRequest(c.data.binding,c.data.request,{hashFields:Public.traceHash});
   return {pools:[{address:'0x'+c.data.binding.pool,domain:c.data.binding.domain}],async verify(){return true;}};
  },view(value){return {...value,dispatch:{checkpointSnapshot:{...value.snapshot,timestamp}},evidenceState:c.intent.ready.readinessEvidenceState,
   overflow:{count:'0'},revokedEntries:[],state:{revokedCount:'0'}};}}
 });
 c.host=host;c.system=host.system;c.quorum=host.graphQuorum;c.headView=host.head;
 host.controls.beforeGraphCurrent=()=>c.currentHook?.();
 const data=c.data,tx=data.prepared.transaction;
 if(family==='EVM')c.signRequest={from:tx.from,to:tx.to,gas:quantity(tx.gas),value:quantity(tx.value),data:Binding.encodeEvmGraphTransferMemo(tx.wireKeyCommitment),nonce:'0x0',chainId:'0x1',gasPrice:quantity(tx.fees.gasPrice),type:'0x0'};
 // The real custody chooses the same original ephemeral key only after ownership
// and path checks. Recipient acceptance is public quote data at the lower port.
 const action=data.binding.quote.action,terms=Object.fromEntries(['scope','policy','asset'].map(k=>[k,data.binding.domain[k]]));
 for(const k of ['amount','executionFrom','executionUntil','settleBefore'])terms[k]=action[k];
 const custody=await Owner.createOwnedNativeValueProviderCustody({runtime:c.receiver,system:c.system,poolIndex:0,nativeRuntime:c.native,bootstrap:host.bootstrap,profileCommitment:data.binding.profileCommitment,
  recipientEndpoint:data.binding.native.recipientEndpoint,terms,acceptedLossClause:NativeAdmission.NATIVE_ADMISSION_LOSS_CLAUSE,directory:c.directory,password:c.password});
 c.custody=custody;
 Host.wrappedHostDiagnostic('provider-custody-created');
 const offer=custody.offer();assert.deepEqual(offer.providerKey,publicKey(providerKey));
 const leaseId=B.sha256('LIANUM/original-native-value-provider/2\0'+data.binding.providerKey.x+data.binding.providerKey.y+data.binding.domain.hubDomain);
 const amended={...options,registrationOverride:host.c.registration,poolOverride:data.binding.pool,leaseIdOverride:leaseId};
 c.data=family==='TRON'?await Public.tronLowerFixture(amended):await Public.fixture('ethereum',0,amended);c.intent=await B.bindNativeValueDispatchRequest(c.data.binding,c.data.request,{hashFields:Public.traceHash});
 for(const [name,value] of Object.entries(offer.actionTemplate))assert.equal(c.data.binding.quote.action[name],value,'HOST_QUOTE_'+name);
 c.recipient=Object.freeze({acceptedQuote:async()=>({...Object.fromEntries(['scope','policy','asset','hubDomain','registryCommitment'].map(k=>[k,c.data.binding.domain[k]])),...c.data.binding.quote})});
 await custody.bindQuote({recipientCustody:c.recipient});
 Host.wrappedHostDiagnostic('provider-quote-bound');
 c.lease=await custody.bindDispatch({request:c.data.request});
 Host.wrappedHostDiagnostic('provider-dispatch-bound');
 const provider=await Gate.createOwnedNativeValueProvider({runtime:c.receiver,system:c.system,poolIndex:0,dispatchLease:c.lease});c.provider=provider;
 Host.wrappedHostDiagnostic('provider-gate-opened');
 return {c,provider,Gate,Evm,Tron,data:c.data,intent:c.intent,close};
 }catch(error){try{await close();}catch(cleanupError){throw new AggregateError([error,cleanupError],'WRAPPED_HOST_FIXTURE_SETUP_FAILED',{cause:error});}throw error;}

}
export {Gate,Evm,Public,B,J};
