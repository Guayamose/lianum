/** Host-only actual runtime factory + exact-source wrapped provider gate and
 * provider-key closure. Ownership, quorum, hash-backend and native I/O ports
 * are explicitly synthetic. No native process, compiler, prover or real funds. */
import {mock} from 'node:test';import assert from 'node:assert/strict';import {performance} from 'node:perf_hooks';
import {EventEmitter} from 'node:events';import {mkdtemp,readFile} from 'node:fs/promises';import {readFileSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {freshKey,signature as actualSignature} from '../../../../../omnichain-product/src/private-note-encoding.mjs';
import {publicKeccak256} from '../../../../../omnichain-product/src/private-cohort-public-native.mjs';
let control,Gate;
const url=p=>new URL(p,import.meta.url).href,quantity=v=>'0x'+BigInt(v).toString(16);
const harnessURL=url('../../../../../omnichain-product/src/chains/runtime-harness.mjs'),actualHarness=await import(harnessURL);
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
 async pinnedBinary(){return '/inert/anvil';},async scratchDirectory(){control.directory=await mkdtemp(join(tmpdir(),'wrapped-graph-v4-host-'));return control.directory;},async unusedLoopbackPort(){return 31338;},async sleep(){},
 async removeOwnScratch(){},startOwnProcess(binary,args){assert.equal(binary,'/inert/anvil');assert.equal(args[args.indexOf('--chain-id')+1],'1');const child=new EventEmitter();Object.assign(child,{pid:42,exitCode:null,signalCode:null});control.child=child;return {child,assertAlive(){assert.equal(child.exitCode,null,'HOST_PROCESS_DEAD');}};},
 async stopOwnProcess(handle){handle.child.exitCode=0;handle.child.emit('exit',0,null);return {stopped:true,forced:false};},
 async ownedRuntimeRpc(endpoint,method,params){assert.equal(endpoint,'http://127.0.0.1:31338');return lowerRpc(method,params);},
}});
mock.method(globalThis,'fetch',async(endpoint,options)=>{assert.equal(endpoint,'http://127.0.0.1:31338');const requests=JSON.parse(options.body);
 const one=async r=>({jsonrpc:'2.0',id:r.id,result:await lowerRpc(r.method,r.params)});return new Response(JSON.stringify(Array.isArray(requests)?await Promise.all(requests.map(one)):await one(requests)));});
// Fixed actual source export names. Calls delegate to the gate's exact source
// module closure below, never to a caller-selected signer or authority issuer.
const gateExports=['isWrappedClaimGraphDispatchRequestV1','assertOwnedNativeValueEvmDispatchRequest','consumeOwnedNativeValueTronDispatchRequest','consumeWrappedGraphDispatchAuthorityV4','consumeWrappedGraphProviderAuthorityV4','readWrappedGraphDispatchOperationV4','consumeNativeValueProviderBindRequest','assertOwnedNativeValueProvider','createOwnedNativeValueProvider'];
mock.module(url('./wrapped-claim-graph-dispatch-gate-v1.mjs'),{exports:Object.fromEntries(gateExports.map(name=>[name,(...args)=>{
 if(['assertOwnedNativeValueEvmDispatchRequest','consumeOwnedNativeValueTronDispatchRequest'].includes(name)&&control)control.runtimeRequest=args[0];
 if(name==='consumeWrappedGraphDispatchAuthorityV4'&&control){control.lastNativeAuthority=args.slice();control.beforeNativeConsume?.(args);
  if(control.nativeAuthorityFault===args[1]){const fault=control.authorityFault;
   if(fault==='copy')args[0]={...args[0]};if(fault==='prepared-copy')args[4]=clone(args[4]);if(fault==='operation-copy')args[2]={...args[2]};if(fault==='runtime-copy')args[3]={...args[3]};if(fault==='purpose')args[1]=args[1]==='send'?'native-key':'send';
   if(fault==='replay')Gate[name](...args);
  }}
 return Gate[name](...args);
}]))});
mock.module(url('./owned-tron-node-driver.mjs'),{exports:{
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
const Evm=await import('./owned-evm-v2-runtime.mjs'),Tron=await import('./owned-tron-native-value-runtime.mjs');
const Public=await import('./wrapped-graph-v4-public.fixture.mjs'),B=await import('./wrapped-claim-dispatch-binding-v1.mjs'),J=await import('./wrapped-claim-dispatch-journal-v1.mjs');
const Commitments=await import('../paeg/commitments.mjs'),Inputs=await import('../paeg/readiness-inputs.mjs'),Health=await import('./native-value-health-v2.mjs'),Generic=await import('./generic-native-value-v2.mjs');
const NativeHealth=await import('./native-health.mjs'),EvmProfile=await import('./evm-native-value-v2.mjs'),TronProfile=await import('./tron-native-graph-profile.mjs');
const NativeAdmission=await import('../../../../../omnichain-product/src/paeg/native-admission.mjs'),Binding=await import('./evm-graph-transfer-binding.mjs');
const clone=structuredClone,freeze=Inputs.frozenInput;
const exportNames=source=>[...source.matchAll(/^export (?:async )?(?:function|const)\s+(\w+)/gm)].map(x=>x[1]);
function executeSource(file,env){let source=readFileSync(new URL(file,import.meta.url),'utf8');const names=exportNames(source);
 source=source.replace(/^import\s+[\s\S]*?\sfrom\s+['"][^'"]+['"];\n/gm,'').replace(/^export\s*\{[^}]+\};\n/gm,'').replace(/^export\s+/gm,'');
 return new Function(...Object.keys(env),source+'\nreturn {'+names.join(',')+'};')(...Object.values(env));}
const syntheticLeases=new WeakMap(),syntheticOriginals=new WeakMap();
let graphAPI;
function snapshotOperation(operation){return Gate.readWrappedGraphDispatchOperationV4(operation);}
function healthResult(quorum,request){const c=control;assert.equal(quorum,c.quorum);const message={...clone(c.health),validFrom:c.headView.timestamp,validUntil:request.validUntil};delete message.timestamp;
 return freeze({message,indexes:[0,1,2],signatures:c.keys.slice(0,3).map(key=>actualSignature(key,Health.encodeNativeValueHealth(message)).toString('hex')),abiSignatures:[],head:clone(c.headView),audits:[]});}
graphAPI={
 assertOwnedNativeValueQuorum(q,{runtime,system}){assert.equal(q,control.quorum);assert.equal(runtime,control.receiver);assert.equal(system,control.system);},
 async issueWrappedGraphDispatchHealthV4(q,request,operation){const physical=snapshotOperation(operation);assert.equal(physical.physicalState.busy,true);assert.equal(physical.physicalState.activeMutations,1);
  const result=healthResult(q,request);syntheticOriginals.set(result,{quorum:q,operation,captured:clone(result),phase:physical.phase});control.issued.push(result);control.operations.push(operation);await control.issueHook?.(physical.phase,result);return result;},
 async validateWrappedGraphOriginalAuthorizationV4(q,result){const original=syntheticOriginals.get(result);assert.ok(original&&original.quorum===q);assert.deepEqual(result,original.captured);
  const started=performance.now();await control.validationHook?.(original.phase,result);const operation=snapshotOperation(original.operation);assert.equal(operation.phase,original.phase);
  const token=Object.freeze({});syntheticLeases.set(token,{...original,result,started,snapshot:operation});control.validations.push({phase:original.phase,result,operation});control.afterValidationHook?.(original.phase,result);return token;},
 consumeWrappedGraphOriginalAuthorizationV4(token,q,result){const state=syntheticLeases.get(token);assert.ok(state&&state.quorum===q&&state.result===result,'HOST_ORIGINAL_GRAPH_LEASE');syntheticLeases.delete(token);
  assert.deepEqual(result,state.captured);assert.deepEqual(snapshotOperation(state.operation),state.snapshot,'HOST_GRAPH_NATIVE_STATE_CHANGED');const elapsed=performance.now()-state.started;assert.ok(Number.isFinite(elapsed)&&elapsed>=0&&elapsed<30000,'HOST_GRAPH_AUDIT_TOO_OLD');
  control.consumeHook?.(state.phase,result);return state.started;},
};
const ownerSource=readFileSync(new URL('./wrapped-claim-dispatch-owner-v1.mjs',import.meta.url),'utf8');
const signStart=ownerSource.indexOf('      signDispatchOnce(statement,authority,operation){'),signEnd=ownerSource.indexOf('      observeOriginal:',signStart);assert.ok(signStart>0&&signEnd>signStart);
function actualProviderSigner(c,scoped,key){let keyStarted=false;const expression=ownerSource.slice(signStart,signEnd).trim().replace(/,$/,'');
 const factory=new Function('env','const {live,assert,readNativeValueDispatchJournal,binding,record,equal,nativeDispatchStatementFrame,consumeWrappedGraphProviderAuthorityV4,nativeRuntime,performance,signature,key,scoped}=env;let keyStarted=false;return ({'+expression+'}).signDispatchOnce;');
 return factory({live(){assert.equal(c.closed,false);},assert,readNativeValueDispatchJournal:J.readNativeValueDispatchJournal,binding:c.data.binding,
  record:{get data(){return {dispatch:c.record};}},equal:B.equal,nativeDispatchStatementFrame:NativeAdmission.nativeDispatchStatementFrame,
  consumeWrappedGraphProviderAuthorityV4:(...args)=>{control.lastProviderAuthority=args.slice();control.beforeProviderConsume?.(args);return Gate.consumeWrappedGraphProviderAuthorityV4(...args);},nativeRuntime:c.native,performance,
  signature(key,frame){c.providerSigns++;return actualSignature(key,frame);},key,scoped});}
const env={refreshNativeValueReceiverClock:async()=>{},readOwnedEvmWrappedGraphOperationV4:Evm.readOwnedEvmWrappedGraphOperationV4,readOwnedTronWrappedGraphOperationV4:Tron.readOwnedTronWrappedGraphOperationV4,
 graphAuthorizationV4:graphAPI,assert,performance,...Commitments,...Inputs,
 assertOwnedWrappedClaimGraphSystem(runtime,system){assert.equal(runtime,control.receiver);assert.equal(system,control.system);},assertOwnedNativeValueQuorum:graphAPI.assertOwnedNativeValueQuorum,
 async createWrappedClaimGraphStateReaderV1(){return {read:async()=>control.view,assertCurrent:async view=>{assert.equal(view,control.view);await control.currentHook?.();}};},
 assertWrappedClaimGraphCurrentViewV1(view){assert.equal(view,control.view);},decodeFlatWords:()=>['0'],assertNativeValueHealth:Health.assertNativeValueHealth,assertFactsQuorum:Generic.assertFactsQuorum,
 TRON_SCHEMA:TronProfile.PROFILE_SCHEMA,EVM_SCHEMA:EvmProfile.PROFILE_SCHEMA,encodeEvmGraphTransferMemo:Binding.encodeEvmGraphTransferMemo,
 async openNativeValueDispatchLease(lease,expected,request){const c=control;assert.equal(lease,c.lease);assert.deepEqual(expected,{runtime:c.receiver,system:c.system,poolIndex:0});Gate.consumeNativeValueProviderBindRequest(request,{...expected,lease});return c.resources;},
 NATIVE_VALUE_DISPATCH_OWNER_BLOCKERS:Object.freeze(['EXPLICIT_HOST_FIXTURE_ONLY']),...B,...J};
Gate=executeSource('./wrapped-claim-graph-dispatch-gate-v1.mjs',env);
export async function fixture({family='EVM'}={}){
 const keys=Array.from({length:4},()=>freshKey()),providerKey=freshKey(),publicKey=key=>({x:key.x.toString('hex'),y:key.y.toString('hex')});
 const options={providerKeyOverride:publicKey(providerKey),keysOverride:keys.map(publicKey)};
 const data=family==='TRON'?await Public.tronLowerFixture(options):await Public.fixture('ethereum',0,options),intent=await B.bindNativeValueDispatchRequest(data.binding,data.request,{hashFields:Public.traceHash});
 const timestamp=family==='TRON'?'1900000000':'1900000310',headView={number:'7',hash:Public.H('receiver-head'),timestamp};
 const c=control={data,keys,closed:false,providerSigns:0,signs:0,sends:0,calls:[],issued:[],operations:[],validations:[],headView,
  receiver:{},lease:Object.freeze({}),nonce:'0x0',accounts:[data.binding.native.solverEndpoint,...['22','44','55','66'].map(v=>'0x'+v.repeat(20))],
  genesis:{number:'0x0',hash:'0x'+data.profile.genesis,timestamp:quantity(timestamp),transactions:[],baseFeePerGas:quantity(1000000000)},};c.head=clone(c.genesis);c.blocks=new Map([['0',clone(c.genesis)]]);
 const tx=data.prepared.transaction;if(family==='EVM')c.signRequest={from:tx.from,to:tx.to,gas:quantity(tx.gas),value:quantity(tx.value),data:Binding.encodeEvmGraphTransferMemo(tx.wireKeyCommitment),nonce:'0x0',chainId:'0x1',gasPrice:quantity(tx.fees.gasPrice),type:'0x0'};
 if(family==='TRON')c.dateMock=mock.method(Date,'now',()=>Number(data.raw.transaction.timestampMs));
 c.native=family==='TRON'?await Tron.createOwnedLocalTronNativeValueV1():await Evm.createOwnedLocalEvmNativeValueV1();for(const name of ['advanceTo','send','dispatch','rpc','sign'])assert.equal(c.native[name],undefined,'ACTUAL_NATIVE_FACADE');
 c.quorum=Object.freeze({signerIndexes:Object.freeze([0,1,2]),health:async request=>healthResult(c.quorum,request)});
 c.system=Object.freeze({registry:data.binding.registry,adapterProfiles:data.binding.profiles,claimsEnabled:true,quorum:c.quorum,
  pools:Object.freeze([Object.freeze({address:'0x'+data.binding.pool,domain:data.binding.domain})]),hub:Object.freeze({call:async()=> '0x'+'00'.repeat(32)}),async verify(){return true;}});
 c.health=Object.fromEntries(NativeHealth.FLAT_HEALTH_FIELDS.slice(0,-2).map(([name,width,kind])=>[name,width===20?data.binding.pool:['bytes','field'].includes(kind)?Public.F(name):'0']));
 Object.assign(c.health,{pool:data.binding.pool,hubDomain:data.binding.domain.hubDomain,registryCommitment:data.binding.domain.registryCommitment,timestamp});
 c.view=freeze({head:headView,header:{number:'0x7'},dispatch:{checkpointSnapshot:{timestamp}},snapshot:{timestamp},evidenceState:intent.ready.readinessEvidenceState,
  healthState:c.health,overflow:{count:'0'},revokedEntries:[],state:{revokedCount:'0'}});
 c.record={revision:'0',state:J.createNativeValueDispatchJournal(data.binding)};
 const store=Object.freeze({async load(){await c.storeHook?.('read');return clone(c.record);},async commit({expectedRevision,nextState}){assert.equal(c.record.revision,expectedRevision);await c.storeHook?.('write');c.record={revision:String(BigInt(c.record.revision)+1n),state:clone(nextState)};return clone(c.record);}});
 const signer=actualProviderSigner(c,c.lease,providerKey);
 c.resources=Object.freeze({binding:data.binding,approvedIntent:intent,nativeRuntime:c.native,store,hashFields:Public.traceHash,gasLimit:'100000',
  assertLive(){assert.equal(c.closed,false,'HOST_OWNER_CLOSED');},async assertLeaseCurrent(){assert.equal(c.closed,false);await c.native.health();},
  assertPreparedCurrent:prepared=>c.native.assertNativeValuePreparedCurrent(prepared),signDispatchOnce:signer,observeOriginal:q=>c.native.observeNativeValueOriginal(q),retainOriginal(){throw Error('HOST_NO_RECONCILIATION');},async close(){c.closed=true;}});
 const provider=await Gate.createOwnedNativeValueProvider({runtime:c.receiver,system:c.system,poolIndex:0,dispatchLease:c.lease});c.provider=provider;
 return {c,provider,Gate,Evm,Tron,data,intent,async close(){await provider.close();await c.native.close();c.dateMock?.mock.restore();}};
}
export {Gate,Evm,Public,B,J};
