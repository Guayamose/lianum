import * as sourceAnchorDataV8 from '../operations/recovery/paged-source-immutable-rows-anchor-v8.mjs';
/** Separate public-testnet execution. No local runtime brand or public READY adoption. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {join,resolve} from 'node:path';
import {openNativeWalletJournalV1} from '../native-wallet/journal-v1.mjs';
import {exact,need,freeze,clone,signalCurrent} from '../native-wallet/common-v1.mjs';
import {publicPagedTestnetNetworksV1,PUBLIC_PAGED_TESTNET_PROFILE_V1} from '../chains/public-testnet/profile-v1.mjs';
import {publicPagedNativeAdapterV1} from '../chains/public-testnet/adapters-v1.mjs';
import {openPublicPagedServerKeysV1,readPublicPagedServerAccountsV1,signOriginalPublicPagedPreparedV1,closePublicPagedServerKeysV1} from '../chains/public-testnet/key-store-v1.mjs';
import {readPublicPagedDispatchV1} from '../chains/public-testnet/original-dispatch-v1.mjs';
import {validatePublicPagedPreparedV1,validatePublicPagedSignedV1} from '../chains/public-testnet/wire-v1.mjs';
import {assertSepoliaReceiverBootstrapReadyV4} from '../chains/public-testnet/key-store-v1.mjs';
import {createOriginalPagedSepoliaRpcV4} from '../chains/public-testnet/sepolia-receiver-rpc-v4.mjs';
import {normalizePagedPublicDefiRecoveryLocatorDataV8} from '../operations/recovery/paged-public-defi-source-current-data-v8.mjs';

const owners=new WeakMap(),issuedFacts=new WeakMap(),issuedPreparations=new WeakMap(),sha=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const current=s=>{need(s&&!s.closed&&!s.closing&&!s.poisoned,'PUBLIC_RUNTIME_CLOSED');return s;};
const publicRow=row=>freeze({id:row.id,authorizationRoot:row.authorizationRoot,networkId:row.prepared.networkId,nativeId:row.signed?.nativeId??null,transactionSHA256:row.signed?.transactionSHA256??null,status:row.signed?(row.observation?.status??'UNKNOWN'):'UNKNOWN',automaticRebroadcast:false});
const key=(id,authorizationRoot)=>authorizationRoot+':'+id;

/** The keyset is prospectively initialized on its server. This constructor
 * opens its same protected identity and journal; it never regenerates keys. */
export async function createOriginalPagedPublicTestnetRuntimesV1(options){return openOriginalPagedPublicTestnetRuntime(options,null);}
async function openOriginalPagedPublicTestnetRuntime(options,recovery,refillRecoveryStorage=false){
 exact(options,['directory'],['configuration']);const directory=resolve(options.directory),keys=await openPublicPagedServerKeysV1(join(directory,'keys'));let journal;
 try{
  const keyset=readPublicPagedServerAccountsV1(keys),configs=publicPagedTestnetNetworksV1(options.configuration),identity=sha({profile:PUBLIC_PAGED_TESTNET_PROFILE_V1,keysetId:keyset.keysetId,networks:configs.map(c=>({network:c.network,rule:c.rule}))});
  journal=await openNativeWalletJournalV1(join(directory,'dispatch-journal'),identity);
  const s={directory,keys,keyset,configs,journal,identity,refillRecoveryStorage,refillRecoveryNativeCheckpoint:refillRecoveryStorage?recovery.checkpoint:null,originalPorts:null,receiverBootstrap:null,providerIdentity:null,providerBinding:false,receivers:new Set(),sourceControls:new Set(),capturing:false,retainedSource:recovery?.source??null,retainedBootstrap:recovery?.bootstrap??null,adapters:configs.map(c=>publicPagedNativeAdapterV1(c)),queue:Promise.resolve(),active:new Set(),closed:false,closing:false,poisoned:false};
  validateRecords(s);if(recovery){assert.equal(keyset.keysetId,recovery.keysetId,'PUBLIC_RUNTIME_REOPEN_KEYSET');const data=journal.read();assert.deepEqual({profile:'PUBLIC_PAGED_RUNTIME_CHECKPOINT_V1',identity,revision:data.revision,dataSHA256:sha(data.operations),keysetId:keyset.keysetId},recovery.checkpoint,'PUBLIC_RUNTIME_REOPEN_CHECKPOINT');assert.deepEqual({classification:PUBLIC_PAGED_TESTNET_PROFILE_V1,signing:'SERVER_PROTECTED_TESTNET_KEYS',trust:'RPC_PROVIDER',independentQuorum:false,automaticRebroadcast:false,keysetId:keyset.keysetId,networks:configs.map((c,i)=>({...c.configuration,source:keyset.accounts[i].address,publicKey:keyset.accounts[i].publicKey}))},recovery.configuration.publicConfiguration,'PUBLIC_RUNTIME_REOPEN_CONFIGURATION');const K=await import('../chains/public-testnet/key-store-v1.mjs');assertOriginalRetainedJournalCheckpointV5(await K.readOriginalPublicCompiledReceiverCheckpointV4(keys),recovery.bootstrap,'PUBLIC_RUNTIME_REOPEN_BOOTSTRAP');}for(const adapter of s.adapters)await adapter.identify();
  const runtime=Object.freeze({profile:PUBLIC_PAGED_TESTNET_PROFILE_V1,metadata:freeze({classification:PUBLIC_PAGED_TESTNET_PROFILE_V1,chainId:'11155111',evmGenesis:configs[0].network.genesisHash,keysetId:keyset.keysetId,runtimePin:'PUBLIC_RPC_NO_LOCAL_BINARY',processId:null}),publicConfiguration:freeze({classification:PUBLIC_PAGED_TESTNET_PROFILE_V1,signing:'SERVER_PROTECTED_TESTNET_KEYS',trust:'RPC_PROVIDER',independentQuorum:false,automaticRebroadcast:false,keysetId:keyset.keysetId,networks:configs.map((c,i)=>({...c.configuration,source:keyset.accounts[i].address,publicKey:keyset.accounts[i].publicKey}))}),
   health(signal){return tracked(s,async()=>{for(const a of s.adapters)await a.identify(signal);return freeze({profile:runtime.profile,networkIdentitiesVerified:true,trust:'RPC_PROVIDER',independentConsensus:false});});},
   balances(signal){return tracked(s,async()=>{const rows=[];for(let i=0;i<s.adapters.length;i++){await s.adapters[i].identify(signal);rows.push({network:s.configs[i].network,account:s.keyset.accounts[i],...(await s.adapters[i].balances(s.keyset.accounts[i],signal))});}return freeze(rows);});},
   block(signal){return tracked(s,()=>s.adapters[0].head(signal));},
   execute(provider,grant,signal){return serialized(s,()=>execute(s,runtime,provider,grant,signal));},
   observe(id,authorizationRoot,signal){return serialized(s,()=>observe(s,runtime,id,authorizationRoot,signal));},
   checkpoint(){current(s);const data=journal.read();return freeze({profile:'PUBLIC_PAGED_RUNTIME_CHECKPOINT_V1',identity,revision:data.revision,dataSHA256:sha(data.operations),keysetId:keyset.keysetId});},
   async close(){if(s.closed)return;if(s.closing)return s.closePromise;s.closing=true;for(const control of s.sourceControls)control.abort();const receiverClosures=[...s.receivers].map(receiver=>receiver.close());for(const closing of receiverClosures)closing.catch(()=>{});s.closePromise=(async()=>{try{await Promise.allSettled([...s.active]);await s.queue;await Promise.all(receiverClosures);await s.journal.close();}finally{s.closed=true;closePublicPagedServerKeysV1(s.keys);}})();return s.closePromise;},
  });owners.set(runtime,s);return runtime;
 }catch(error){await journal?.close().catch(()=>{});closePublicPagedServerKeysV1(keys);throw error;}
}
function validateRecords(s){
 const rows=s.journal.read().operations,ids=new Set();for(const row of rows){exact(row,['id','authorizationRoot','actionCommitment','phase','prepared','signed','observation']);need(/^[A-Za-z][A-Za-z0-9_.-]{0,79}$/.test(row.id)&&/^[0-9a-f]{64}$/.test(row.authorizationRoot)&&/^[0-9a-f]{64}$/.test(row.actionCommitment)&&!ids.has(key(row.id,row.authorizationRoot)),'PUBLIC_JOURNAL_BINDING');ids.add(key(row.id,row.authorizationRoot));const account=s.keyset.accounts.find(a=>a.networkId===row.prepared.networkId);need(account,'PUBLIC_JOURNAL_NETWORK');assert.deepEqual(row.prepared.account,account);need(row.prepared.id===row.id&&row.prepared.authorizationRoot===row.authorizationRoot&&row.prepared.actionCommitment===row.actionCommitment,'PUBLIC_JOURNAL_BINDING');validatePublicPagedPreparedV1(account,row.prepared);need(['KEY_PENDING','SIGNED','SUBMITTING','SUBMITTED','UNKNOWN'].includes(row.phase),'PUBLIC_JOURNAL_PHASE');if(row.signed){assert.deepEqual(validatePublicPagedSignedV1(account,row.prepared,row.signed.nativeWire),row.signed);need(row.phase!=='KEY_PENDING','PUBLIC_JOURNAL_PHASE');}else need(row.phase==='KEY_PENDING'&&row.observation===null,'PUBLIC_JOURNAL_PHASE');}
 return rows;
}
function tracked(s,work){current(s);need(!s.capturing,'PUBLIC_RUNTIME_CAPTURE_IN_PROGRESS');need(!s.financialEpochWork,'SEPOLIA_SOURCE_EPOCH_NOT_QUIESCENT');const p=work();s.active.add(p);return p.finally(()=>s.active.delete(p));}
function serialized(s,work){return tracked(s,()=>{const p=s.queue.then(work);s.queue=p.catch(()=>{});return p;});}
/** A financial review owns the existing queue and excludes independent native
 * reads while its checkpoint is signed. Its own tracked task remains drainable. */
function exclusiveFinancialReview(s,work){current(s);need(s.active.size===0&&!s.financialEpochWork,'SEPOLIA_SOURCE_EPOCH_NOT_QUIESCENT');const promise=serialized(s,work);s.financialEpochWork=promise;return promise.finally(()=>{if(s.financialEpochWork===promise)s.financialEpochWork=null;});}
async function commit(s,rows){try{await s.journal.commit(rows);}catch(error){s.poisoned=true;throw error;}}
async function execute(s,runtime,provider,grant,signal){
 current(s);need(!s.refillRecoveryStorage,'PUBLIC_REFILL_RECOVERY_STORAGE_ONLY');need(s.receiverBootstrap===null,'PUBLIC_RECEIVER_BOOTSTRAP_ACTIVE');signalCurrent(signal);let row,account;
 // Only the fixed shared-provider reader may unwrap a grant and identify the action.
 const ports=s.originalPorts;need(ports&&ports.provider===provider,'PUBLIC_PAGED_ORIGINAL_PROVIDER_SEAM_REQUIRED');const original=await ports.readDispatch(grant);
 need(original.classification===runtime.profile,'PUBLIC_PAGED_LOCAL_PROVIDER_FORBIDDEN');account=s.keyset.accounts.find(a=>a.address===original.from);need(account,'PUBLIC_RUNTIME_ACCOUNT');await readPublicPagedDispatchV1(ports,grant,account);const index=s.keyset.accounts.indexOf(account),adapter=s.adapters[index];
 for(const receiver of s.receivers){const r=receiverOwners.get(receiver);if(r?.sourceSigner){const K=await import('../chains/public-testnet/key-store-v1.mjs');await K.observeOriginalPublicPagedSourceV4(r.sourceSigner);K.assertOriginalPublicPagedSourceUnblockedV4(r.sourceSigner);}}const rows=validateRecords(s),existing=rows.find(r=>r.id===original.id&&r.authorizationRoot===original.authorizationRoot);
 if(existing){need(existing.actionCommitment===original.actionCommitment,'PUBLIC_JOURNAL_READY_CHANGED');return existing.signed?observe(s,runtime,existing.id,existing.authorizationRoot,signal):publicRow(existing);}
 // Prevent concurrent nonce/UTXO/blockhash claims from the same source. A lost
 // send remains pending; a fresh operation cannot take its source inventory.
 need(!rows.some(r=>r.prepared.networkId===account.networkId&&r.observation?.status!=='OBSERVED'&&r.observation?.status!=='ADVERSE'),'PUBLIC_RUNTIME_SOURCE_PENDING');
 await adapter.identify(signal);const prepared=await adapter.prepare(account,original.destination,original.action.amount,original.action.receiptKeyCommitment,signal);Object.assign(prepared,{id:original.id,authorizationRoot:original.authorizationRoot,actionCommitment:original.actionCommitment});freeze(prepared);issuedPreparations.set(prepared,{runtime,digest:sha(prepared)});await readPublicPagedDispatchV1(ports,grant,account,prepared);await adapter.beforeSend(prepared,signal);signalCurrent(signal);
 row={id:original.id,authorizationRoot:original.authorizationRoot,actionCommitment:original.actionCommitment,phase:'KEY_PENDING',prepared:clone(prepared),signed:null,observation:null};rows.push(row);await commit(s,rows);
 // This original provider journal also precedes the final grant and key access.
 await ports.recordIntent(grant,prepared);current(s);await adapter.beforeSend(prepared,signal);signalCurrent(signal);
 const signed=await signOriginalPublicPagedPreparedV1(s.keys,ports,grant,prepared);current(s);row.signed=clone(signed);row.phase='SIGNED';await commit(s,rows);
 await ports.recordSigned(grant,prepared,signed);await adapter.beforeSend(prepared,signal);await readPublicPagedDispatchV1(ports,grant,account,prepared);current(s);signalCurrent(signal);
 // The attempted disposition is durable before the sole POST. Every later
 // call, including reopening a SIGNED or UNKNOWN row, performs observation.
 row.phase='SUBMITTING';await commit(s,rows);
 try{const actual=await adapter.broadcast(signed.nativeWire,signal);need(actual===signed.nativeId,'PUBLIC_BROADCAST_ID');row.phase='SUBMITTED';}catch{row.phase='UNKNOWN';}
 await commit(s,rows);return publicRow(row);
}
async function observe(s,runtime,id,authorizationRoot,signal){
 current(s);need(typeof id==='string'&&typeof authorizationRoot==='string','PUBLIC_OBSERVATION_ID');const rows=validateRecords(s),row=rows.find(r=>r.id===id&&r.authorizationRoot===authorizationRoot);need(row,'PUBLIC_JOURNAL_NOT_FOUND');if(!row.signed)return publicRow(row);
 const index=s.configs.findIndex(c=>c.network.id===row.prepared.networkId),adapter=s.adapters[index];let facts;try{await adapter.identify(signal);facts=await adapter.observe(row,signal);}catch{facts={status:'UNKNOWN',finalized:false,confirmations:'0',blockId:null,blockHeight:null,blockTimestamp:null,observedAt:null,feeAtomic:null};}
 row.observation=clone(facts);await commit(s,rows);const result=freeze({...publicRow(row),facts:clone(facts)});issuedFacts.set(result,{runtime,id,authorizationRoot,actionCommitment:row.actionCommitment,wireSHA256:row.signed.transactionSHA256});return result;
}
export function assertOriginalPagedPublicTestnetRuntimeV1(runtime){current(owners.get(runtime));return runtime;}
export function assertOriginalPagedPublicProviderBirthV1(runtime){const s=current(owners.get(runtime));need(s.originalPorts===null&&s.providerIdentity===null&&s.receiverBootstrap===null,'PUBLIC_PROVIDER_ALREADY_BOUND');assertSepoliaReceiverBootstrapReadyV4(s.directory,s.keyset.keysetId);return runtime;}
/** Called once by the fixed ORIGINAL public-provider constructor before service
 * publication. These methods close over that constructor's private owner;
 * neither HTTP fields nor a mutable registry can replace them afterwards. */
export function bindOriginalPagedPublicProviderPortsV1(runtime,ports,claim){const s=current(owners.get(runtime));need(claim&&s.providerIdentity===claim&&s.providerBinding,'PUBLIC_PROVIDER_ORIGINAL_IDENTITY');exact(ports,['provider','readDispatch','recordIntent','recordSigned']);assertSepoliaReceiverBootstrapReadyV4(s.directory,s.keyset.keysetId);need(s.receiverBootstrap===null,'PUBLIC_RECEIVER_BOOTSTRAP_ACTIVE');need(Object.isFrozen(ports)&&ports.provider&&Object.isFrozen(ports.provider)&&typeof ports.readDispatch==='function'&&typeof ports.recordIntent==='function'&&typeof ports.recordSigned==='function'&&s.originalPorts===null,'PUBLIC_PROVIDER_FIXED_COMPOSITION');s.originalPorts=ports;s.providerBinding=false;}
export function assertOriginalPagedPublicPreparedV1(prepared,runtime){assertOriginalPagedPublicTestnetRuntimeV1(runtime);const record=issuedPreparations.get(prepared);need(record?.runtime===runtime&&record.digest===sha(prepared),'PUBLIC_PREPARATION_ORIGINAL_REQUIRED');return prepared;}
/** Read-only facts from this original prospective birth. A copied context cannot
 * be substituted for the runtime handle or authorize an execution. */
export function readOriginalPagedPublicRuntimeContextV1(runtime){const s=current(owners.get(runtime));return freeze({profile:PUBLIC_PAGED_TESTNET_PROFILE_V1,keysetId:s.keyset.keysetId,accounts:clone(s.keyset.accounts),rules:s.configs.map(c=>clone(c.rule)),configuration:clone(runtime.publicConfiguration)});}
/** Provenance and retained-wire membership only. Admission requires the original
 * provider, registry, quorum, current receiver and circuit as before. */
export function assertOriginalPagedPublicObservationV1(result,runtime){assertOriginalPagedPublicTestnetRuntimeV1(runtime);need(issuedFacts.get(result)?.runtime===runtime,'PUBLIC_OBSERVATION_ORIGINAL_REQUIRED');return result;}


// Prospective provider identity and signer orchestration point downwards only.
export function reserveOriginalPagedPublicProviderIdentityV4(runtime){assert.equal(arguments.length,1);assertOriginalPagedPublicProviderBirthV1(runtime);const s=current(owners.get(runtime)),claim=Object.freeze(Object.create(null));s.providerIdentity=claim;return claim;}
export function releaseOriginalPagedPublicProviderIdentityV4(runtime,claim){assert.equal(arguments.length,2);const s=current(owners.get(runtime));need(s.providerIdentity===claim&&s.originalPorts===null,'PUBLIC_PROVIDER_ORIGINAL_IDENTITY');s.providerIdentity=null;}
const receiverOwners=new WeakMap();
function originalReceiver(receiver){const r=receiverOwners.get(receiver);need(r&&!r.closed,'SEPOLIA_RECEIVER_CLOSED');current(r.s);return r;}
export async function createOriginalPagedPublicSepoliaReceiverV4(runtime){assert.equal(arguments.length,1);need(!current(owners.get(runtime)).refillRecoveryStorage,'PUBLIC_REFILL_RECOVERY_STORAGE_ONLY');return createOriginalSepoliaReceiver(runtime,false);}
async function createOriginalSepoliaReceiver(runtime,reopening){const s=current(owners.get(runtime));need(s.receiverBootstrap===null&&s.originalPorts===null&&!s.providerBinding&&s.active.size===0,'PUBLIC_RECEIVER_BOOTSTRAP_BIRTH');if(!reopening)need(validateRecords(s).every(row=>row.observation?.status==='OBSERVED'||row.observation?.status==='ADVERSE'),'PUBLIC_RECEIVER_NATIVE_SOURCE_PENDING');const request=Object.freeze(Object.create(null));s.receiverBootstrap=request;let rpc,signer,lifecycle;try{const created=await createOriginalPagedSepoliaRpcV4({endpoint:s.configs[0].endpoint,account:s.keyset.accounts[0],keysetId:s.keyset.keysetId});rpc=created.runtime;lifecycle=created.lifecycle;const K=await import('../chains/public-testnet/key-store-v1.mjs');signer=await K.openOriginalPublicCompiledReceiverSignerV4(s.keys,rpc);const r={s,native:runtime,request,receiver:rpc,signer,sourceSigner:null,defiRecoveryLocator:s.retainedSource?.defiRetentionV8??null,sourceControl:new AbortController(),lifecycle,closed:false,finalized:false,rootSystem:null,poolKernel:null,poolSystems:new WeakSet(),successorSystems:new Map()};receiverOwners.set(rpc,r);s.receivers.add(rpc);s.sourceControls.add(r.sourceControl);r.sourcePump=pumpOriginalSepoliaSourceRequestsV4(r);r.sourcePump.catch(()=>{});lifecycle.closed.then(async()=>{try{r.sourceControl.abort();await s.queue;if(r.sourceSigner)await K.closeOriginalPublicPagedSourceSignerV4(r.sourceSigner);await K.closeOriginalPublicCompiledReceiverSignerV4(signer);}finally{r.closed=true;s.receivers.delete(rpc);s.sourceControls.delete(r.sourceControl);if(s.receiverBootstrap===request)s.receiverBootstrap=null;lifecycle.acknowledge();}});return rpc;}catch(error){if(signer){const K=await import('../chains/public-testnet/key-store-v1.mjs');await K.closeOriginalPublicCompiledReceiverSignerV4(signer);}if(rpc){lifecycle.acknowledge();await rpc.close();}if(s.receiverBootstrap===request)s.receiverBootstrap=null;throw error;}}
export async function dispatchOriginalPagedPublicSepoliaBootstrapV4(receiver,method,args){assert.equal(arguments.length,3);need(['PREFLIGHT','EXECUTE','FINALIZE','START_NONCE'].includes(method)&&Array.isArray(args),'SEPOLIA_RECEIVER_FIXED_BOOTSTRAP_METHOD');const r=originalReceiver(receiver);need(!r.finalized&&r.s.receiverBootstrap===r.request,'SEPOLIA_RECEIVER_BOOTSTRAP_RELEASED');return serialized(r.s,async()=>{originalReceiver(receiver);const K=await import('../chains/public-testnet/key-store-v1.mjs');if(method==='PREFLIGHT'){need(args.length===1,'SEPOLIA_RECEIVER_ARITY');return K.preflightOriginalPublicCompiledReceiverV4(r.signer,args[0]);}if(method==='EXECUTE'){need(args.length===2,'SEPOLIA_RECEIVER_ARITY');return K.executeOriginalPublicCompiledReceiverV4(r.signer,args[0],args[1]);}if(method==='START_NONCE'){need(args.length===0,'SEPOLIA_RECEIVER_ARITY');return K.readOriginalPublicCompiledReceiverStartNonceV4(r.signer);}need(args.length===1,'SEPOLIA_RECEIVER_ARITY');const result=await K.finalizeOriginalPublicCompiledReceiverV4(r.signer,args[0]);await K.closeOriginalPublicCompiledReceiverSignerV4(r.signer);r.finalized=true;r.s.receiverBootstrap=null;return result;});}
export async function runOriginalPagedPublicSepoliaPlanV4(receiver,input,limits=null){assert.ok(arguments.length===2||arguments.length===3);const r=originalReceiver(receiver);need(!r.finalized&&r.s.receiverBootstrap===r.request,'SEPOLIA_RECEIVER_BOOTSTRAP_RELEASED');return serialized(r.s,async()=>{const K=await import('../chains/public-testnet/key-store-v1.mjs'),P=await import('../operations/local/funded-graph-paged-public-kernel-v4.mjs'),start=await K.readOriginalPublicCompiledReceiverStartNonceV4(r.signer),plan=await P.prepareOriginalFundedPagedGraphSepoliaPlanV4(receiver,input,start);let complete=false;try{for(;;){current(r.s);const next=await P.readOriginalPagedSepoliaPlanStepV4(receiver,plan);if(next.kind==='READY'){need(limits!==null,'SEPOLIA_PREFLIGHT_NO_CONSTRUCTOR');await K.waitOriginalPublicCompiledReceiverFinalityV4(r.signer,next.completion);await K.closeOriginalPublicCompiledReceiverSignerV4(r.signer);r.finalized=true;r.rootSystem=next.system;r.poolSystems.add(next.system);r.s.receiverBootstrap=null;complete=true;return next.system;}if(limits===null)return await K.preflightOriginalPublicCompiledReceiverV4(r.signer,next.token);let receipt;try{receipt=await K.executeOriginalPublicCompiledReceiverV4(r.signer,next.token,limits);}catch(error){if(error.message!=='SEPOLIA_RECEIVER_ORIGINAL_DEPLOYMENT_PENDING')throw error;receipt=await K.waitOriginalPublicCompiledReceiverConstructorV4(r.signer,next.token);}await P.advanceOriginalPagedSepoliaPlanV4(receiver,plan,next.token,receipt);}}finally{if(!complete)await P.closeOriginalPagedSepoliaPlanV4(receiver,plan);}});}

/** Source bind claims its own signer lifecycle before any provider journal CAS. */
export function beginOriginalPagedPublicProviderBindV4(runtime,claim){assert.equal(arguments.length,2);const s=current(owners.get(runtime));need(claim&&s.providerIdentity===claim&&!s.providerBinding&&s.originalPorts===null&&s.receiverBootstrap===null,'PUBLIC_PROVIDER_ORIGINAL_BIND');assertSepoliaReceiverBootstrapReadyV4(s.directory,s.keyset.keysetId);s.providerBinding=true;}

/** RPC requests enter the same serialized ETH queue as constructors and native
 * deliveries. Source financial authority remains the Kernel-issued command. */
async function pumpOriginalSepoliaSourceRequestsV4(r){for(;;){const request=await r.lifecycle.readSourceRequest();if(request===null)return;let receipt=null,error=null;try{receipt=await serialized(r.s,async()=>{originalReceiver(r.receiver);need(r.finalized&&r.s.receiverBootstrap===null&&r.sourceSigner,'SEPOLIA_SOURCE_LANE_NOT_CONFIGURED');need(validateRecords(r.s).filter(row=>row.prepared.networkId==='ethereum-sepolia').every(row=>['OBSERVED','ADVERSE'].includes(row.observation?.status)),'PUBLIC_RUNTIME_SOURCE_PENDING');const data=r.lifecycle.readSourceRequestData(request),K=await import('../chains/public-testnet/key-store-v1.mjs'),M=await import('../operations/local/sepolia-uniswap-mixed-source-kernel-v4.mjs'),D=await import('../operations/local/sepolia-defi-mixed-source-kernel-v8.mjs');return D.isOriginalSepoliaDefiMixedSourceCommandV8(data.command)?K.executeOriginalPublicSepoliaDefiMixedSourceCallV8(r.sourceSigner,data.command,data.label,data.transaction):M.isOriginalSepoliaUniswapMixedSourceCommandV4(data.command)?K.executeOriginalPublicUniswapMixedSourceCallV4(r.sourceSigner,data.command,data.label,data.transaction):K.executeOriginalPublicPagedSourceV4(r.sourceSigner,data.command,data.label,data.transaction);});}catch(e){error=e instanceof Error?e:Error('SEPOLIA_SOURCE_SEND_FAILED');}await r.lifecycle.finishSourceRequest(request,receipt,error);}}
// Canonical re-observation may advance only the protected journal revision.
// Every operation byte, identity, keyset, policy and epoch remains anchored to
// the authenticated retention; changed or rolled-back histories stay fenced.
function assertOriginalRetainedJournalCheckpointV5(actual,retained,label){
 const {revision:currentRevision,...current}=actual,{revision:retainedRevision,...previous}=retained;need(Number.isSafeInteger(currentRevision)&&Number.isSafeInteger(retainedRevision)&&currentRevision>=0&&retainedRevision>=0&&!Object.is(currentRevision,-0)&&!Object.is(retainedRevision,-0)&&currentRevision>=retainedRevision,label+'_REVISION');const {assertSourceCheckpointAnchorCompatibilityDataV8}=sourceAnchorDataV8;assertSourceCheckpointAnchorCompatibilityDataV8(current,previous,label);
}
export async function configureOriginalPagedPublicSepoliaSourceV4(receiver,policy){assert.equal(arguments.length,2);const r=originalReceiver(receiver);return serialized(r.s,async()=>{originalReceiver(receiver);need(r.finalized&&r.s.receiverBootstrap===null&&!r.sourceSigner,'SEPOLIA_SOURCE_BOOTSTRAP_NOT_RELEASED');const K=await import('../chains/public-testnet/key-store-v1.mjs');if(r.s.retainedSource)assert.deepEqual(policy,r.s.retainedSource.configuration.policy,'SEPOLIA_SOURCE_REOPEN_POLICY');r.sourceSigner=await K.openOriginalPublicPagedSourceSignerV4(r.s.keys,receiver,policy,r.sourceControl.signal);if(r.s.retainedSource)assertOriginalRetainedJournalCheckpointV5(K.readOriginalPublicPagedSourceCheckpointV4(r.sourceSigner),r.s.retainedSource.checkpoint,'SEPOLIA_SOURCE_REOPEN_CHECKPOINT');const data=await K.observeOriginalPublicPagedSourceV4(r.sourceSigner);return freeze({profile:'ORIGINAL_PAGED_SEPOLIA_SOURCE_CONFIGURATION_V4',keysetId:r.s.keyset.keysetId,account:r.s.keyset.accounts[0].address,policySHA256:data.policySHA256,sponsorship:data.sponsorship,automaticRebroadcast:false});});}
/** New explicit server review; never refreshes wallet/START terms. */
export async function readOriginalPagedPublicSepoliaFinancialStateV5(receiver){assert.equal(arguments.length,1);const r=originalReceiver(receiver);need(r.sourceSigner,'SEPOLIA_SOURCE_LANE_NOT_CONFIGURED');return serialized(r.s,async()=>{originalReceiver(receiver);const K=await import('../chains/public-testnet/key-store-v1.mjs');return K.readOriginalPublicPagedSourceFinancialStateV5(r.sourceSigner);});}
export async function authorizeOriginalPagedPublicSepoliaFinancialEpochV5(receiver,review){assert.equal(arguments.length,2);const r=originalReceiver(receiver);need(!r.s.refillRecoveryStorage,'PUBLIC_REFILL_RECOVERY_STORAGE_ONLY');need(r.sourceSigner,'SEPOLIA_SOURCE_LANE_NOT_CONFIGURED');return exclusiveFinancialReview(r.s,async()=>{originalReceiver(receiver);need(r.finalized&&r.s.receiverBootstrap===null&&r.s.active.size===1,'SEPOLIA_SOURCE_EPOCH_NOT_QUIESCENT');need(validateRecords(r.s).filter(row=>row.prepared.networkId==='ethereum-sepolia').every(row=>['OBSERVED','ADVERSE'].includes(row.observation?.status)),'PUBLIC_RUNTIME_SOURCE_PENDING');if(r.financialReview)assert.deepEqual(review,r.financialReview.review,'SEPOLIA_SOURCE_FINANCIAL_REVIEW_SAME_INTENT');const K=await import('../chains/public-testnet/key-store-v1.mjs');return K.authorizeOriginalPublicPagedSourceFinancialEpochV5(r.sourceSigner,review);});}
export async function readOriginalPagedPublicSepoliaSourceV4(receiver){assert.equal(arguments.length,1);const r=originalReceiver(receiver);need(r.sourceSigner,'SEPOLIA_SOURCE_LANE_NOT_CONFIGURED');return serialized(r.s,async()=>{originalReceiver(receiver);const K=await import('../chains/public-testnet/key-store-v1.mjs');return K.observeOriginalPublicPagedSourceV4(r.sourceSigner);});}
export async function preflightOriginalPagedPublicSepoliaSourceV4(receiver,command){assert.equal(arguments.length,2);const r=originalReceiver(receiver);need(r.sourceSigner,'SEPOLIA_SOURCE_LANE_NOT_CONFIGURED');return serialized(r.s,async()=>{originalReceiver(receiver);const K=await import('../chains/public-testnet/key-store-v1.mjs');return K.preflightOriginalPublicPagedSourceV4(r.sourceSigner,command);});}

export async function reopenOriginalPagedPublicSepoliaReceiverV4(nativeRuntime,deploymentToken){assert.equal(arguments.length,2);return reopenOriginalSepoliaReceiver(nativeRuntime,deploymentToken,null);}
export async function reopenOriginalPagedPublicFinancialReviewReceiverV5(nativeRuntime,deploymentToken,reviewToken){assert.equal(arguments.length,3);const {consumeOriginalPagedCapturedFinancialEpochReviewV5}=await import('../operations/recovery/paged-runtime-recovery-authority-v3.mjs'),review=await consumeOriginalPagedCapturedFinancialEpochReviewV5(reviewToken);return reopenOriginalSepoliaReceiver(nativeRuntime,deploymentToken,review);}
async function reopenOriginalSepoliaReceiver(nativeRuntime,deploymentToken,financialReview,refillRecoveryStorage=false){const native=current(owners.get(nativeRuntime));need(native.refillRecoveryStorage===refillRecoveryStorage,'PUBLIC_REFILL_RECOVERY_STORAGE_ONLY');if(financialReview){assert.deepEqual(native.retainedSource,financialReview.previousNative.source,'SEPOLIA_SOURCE_FINANCIAL_REVIEW_NATIVE');assert.deepEqual(native.keyset.keysetId,financialReview.previousNative.keysetId);}
const receiver=await createOriginalSepoliaReceiver(nativeRuntime,true),r=originalReceiver(receiver);try{return await serialized(r.s,async()=>{const K=await import('../chains/public-testnet/key-store-v1.mjs'),P=await import('../operations/local/funded-graph-paged-public-kernel-v4.mjs'),start=await K.readOriginalPublicCompiledReceiverReopenNonceV4(r.signer),plan=await (refillRecoveryStorage?P.prepareOriginalFundedPagedGraphSepoliaRefillRecoveryPlanV16:P.prepareOriginalFundedPagedGraphSepoliaReopenPlanV4)(receiver,deploymentToken,start);let complete=false;try{for(;;){current(r.s);const step=await P.readOriginalPagedSepoliaPlanStepV4(receiver,plan);if(step.kind==='READY'){await (financialReview||refillRecoveryStorage?K.inspectOriginalPublicCompiledReceiverFinalityV5:K.finalizeOriginalPublicCompiledReceiverV4)(r.signer,step.completion);await K.closeOriginalPublicCompiledReceiverSignerV4(r.signer);r.finalized=true;r.rootSystem=step.system;r.poolSystems.add(step.system);r.s.receiverBootstrap=null;if(r.s.retainedSource){const saved=r.s.retainedSource;assert.deepEqual(saved.configuration.receiver,(await import('../chains/public-testnet/sepolia-receiver-rpc-v4.mjs')).readOriginalPagedSepoliaRpcContextV4(receiver),'SEPOLIA_SOURCE_REOPEN_RECEIVER');const financial=await K.readOriginalPublicPagedSourceFinancialHistoryV5(r.s.keys,receiver,saved.configuration.policy),open=!financialReview&&!refillRecoveryStorage&&financial.effectivePolicy.expiresAt>Date.now()?K.openOriginalPublicPagedSourceSignerV4:K.openOriginalPublicPagedSourceObserverV4;r.sourceSigner=await open(r.s.keys,receiver,saved.configuration.policy,r.sourceControl.signal);if(refillRecoveryStorage){r.refillRecoveryState=await readOriginalRefillRecoverySourceStateV16(r,K,saved);const RPC=await import('../chains/public-testnet/sepolia-receiver-rpc-v4.mjs');const rows=K.readOriginalPublicPagedSourceObserverRowsV16(r.sourceSigner,receiver);assert.deepEqual(rows.checkpoint,r.refillRecoveryState.checkpoint,'SEPOLIA_REFILL_RECOVERY_SOURCE_CHANGED');await RPC.bindOriginalPagedSepoliaRefillRecoveryObserverFinancialStateV16(receiver,{history:{basePolicyWire:JSON.stringify(r.refillRecoveryState.basePolicy),history:r.refillRecoveryState.history},source:{revision:rows.checkpoint.revision,operations:rows.operations},checkpoint:rows.checkpoint});}else if(financialReview){await K.validateOriginalPublicPagedSourceFinancialReviewV5(r.sourceSigner,financialReview.review,saved);r.financialReview=financialReview;}else{assertOriginalRetainedJournalCheckpointV5(K.readOriginalPublicPagedSourceCheckpointV4(r.sourceSigner),saved.checkpoint,'SEPOLIA_SOURCE_REOPEN_CHECKPOINT');await K.observeOriginalPublicPagedSourceV4(r.sourceSigner);}}const successor=await observeRetainedOriginalSuccessorV4(r,step.system);complete=true;return Object.freeze({runtime:receiver,system:step.system,...(successor?{successor}: {})});}let actual;try{actual=await K.observeOriginalPublicCompiledReceiverConstructorV4(r.signer,step.token);}catch(error){if(error.message!=='NATIVE_WALLET_SEPOLIA_RECEIVER_ORIGINAL_CONSTRUCTOR')throw error;actual=await K.observeOriginalPublicCompletedPartialLibraryV5(r.signer,step.token);}await P.advanceOriginalPagedSepoliaPlanV4(receiver,plan,step.token,actual);}}finally{if(!complete)await P.closeOriginalPagedSepoliaPlanV4(receiver,plan);}});}catch(error){await receiver.close();throw error;}}


/** SAMEpool storage reconstruction observes the original compiled deployment
 * and the signed Source history without a lane, signature or journal commit. */
export async function reopenOriginalPagedPublicRefillRecoveryReceiverV16(native,deploymentToken){
 assert.equal(arguments.length,2);return reopenOriginalSepoliaReceiver(native,deploymentToken,null,true);
}
async function readOriginalRefillRecoverySourceStateV16(r,K,saved){
 const state=await K.readOriginalPublicPagedSourceFinancialStateV5(r.sourceSigner),rows=K.readOriginalPublicPagedSourceObserverRowsV16(r.sourceSigner,r.receiver),actual=state.checkpoint,retained=saved.checkpoint;
 need(rows.profile==='ORIGINAL_PAGED_PUBLIC_REFILL_SOURCE_ROWS_V16'&&!state.financialSigningEnabled,'SEPOLIA_REFILL_RECOVERY_OBSERVER_REQUIRED');assert.deepEqual(rows.checkpoint,actual,'SEPOLIA_REFILL_RECOVERY_SOURCE_CHANGED');
 for(const field of ['profile','keysetId','identity'])assert.deepEqual(actual[field],retained[field],'SEPOLIA_REFILL_RECOVERY_SOURCE_IDENTITY');
 need(Number.isSafeInteger(actual.revision)&&actual.revision>=retained.revision,'SEPOLIA_REFILL_RECOVERY_SOURCE_ROLLBACK');
 // The authenticated capture may precede FUND. Its exact operation prefix must
 // still exist in the protected journal; observation cannot replace its bytes.
 const prefix=createHash('sha256').update('[');let found=prefix.copy().update(']').digest('hex')===retained.dataSHA256;
 for(let i=0;i<rows.operations.length;i++){prefix.update(i?',':'').update(JSON.stringify(rows.operations[i]));if(prefix.copy().update(']').digest('hex')===retained.dataSHA256)found=true;}
 need(found,'SEPOLIA_REFILL_RECOVERY_SOURCE_PREFIX_CHANGED');
 const old=retained.financialEpoch;
 if(old){
  need(Number.isSafeInteger(old.revision)&&old.revision>0&&old.revision<=state.history.length,'SEPOLIA_REFILL_RECOVERY_EPOCH_ROLLBACK');
  const epochs=state.history.slice(0,old.revision),{canonical}=await import('@lianum/engine/crypto/privacy'),history={profile:'ORIGINAL_PAGED_SEPOLIA_FINANCIAL_EPOCH_HISTORY_V5',journalIdentity:actual.identity,basePolicyWire:JSON.stringify(state.basePolicy),epochs};
  assert.deepEqual(old,{profile:'ORIGINAL_PAGED_SEPOLIA_FINANCIAL_EPOCH_CHECKPOINT_V5',identity:actual.identity,revision:epochs.length,dataSHA256:createHash('sha256').update(canonical(history)).digest('hex'),epochId:epochs.at(-1).epoch.epochId},'SEPOLIA_REFILL_RECOVERY_EPOCH_PREFIX_CHANGED');
  assert.equal(retained.policySHA256,sha(epochs.at(-1).epoch.policy),'SEPOLIA_REFILL_RECOVERY_RETAINED_POLICY');
 }else assert.equal(retained.policySHA256,state.basePolicySHA256,'SEPOLIA_REFILL_RECOVERY_RETAINED_POLICY');
 assert.deepEqual(await K.readOriginalPublicPagedSourceFinancialStateV5(r.sourceSigner),state,'SEPOLIA_REFILL_RECOVERY_SOURCE_CHANGED');return state;
}

/** DATA from the SAME protected observer, for the fixed Kernel recovered-birth
 * producer. Reading it never creates a Source lane or an activation token. */
export async function readOriginalPagedPublicRefillRecoveryFinancialStateV16(receiver){
 assert.equal(arguments.length,1);const r=originalReceiver(receiver);need(r.s.refillRecoveryStorage&&r.refillRecoveryState&&r.sourceSigner&&!r.refillRecoveredActivation,'SEPOLIA_REFILL_RECOVERY_OBSERVER_REQUIRED');
 return serialized(r.s,async()=>{originalReceiver(receiver);const K=await import('../chains/public-testnet/key-store-v1.mjs'),actual=await K.readOriginalPublicPagedSourceFinancialStateV5(r.sourceSigner);assert.deepEqual(actual,r.refillRecoveryState,'SEPOLIA_REFILL_RECOVERY_SOURCE_CHANGED');assert.deepEqual(r.native.checkpoint(),r.s.refillRecoveryNativeCheckpoint,'SEPOLIA_REFILL_RECOVERY_NATIVE_CHANGED');const rows=K.readOriginalPublicPagedSourceObserverRowsV16(r.sourceSigner,receiver);assert.deepEqual(rows.checkpoint,actual.checkpoint,'SEPOLIA_REFILL_RECOVERY_SOURCE_CHANGED');const RPC=await import('../chains/public-testnet/sepolia-receiver-rpc-v4.mjs'),view=await RPC.readOriginalPagedSepoliaRefillRecoveryObserverFinancialStateV16(receiver);assert.deepEqual(view.checkpoint,actual.checkpoint,'SEPOLIA_REFILL_RECOVERY_READ_VIEW');assert.deepEqual(view.source,{revision:actual.checkpoint.revision,operations:rows.operations},'SEPOLIA_REFILL_RECOVERY_READ_VIEW');assert.deepEqual(view.history.history,actual.history,'SEPOLIA_REFILL_RECOVERY_READ_VIEW');assert.deepEqual(view.history.effectivePolicy,actual.effectivePolicy,'SEPOLIA_REFILL_RECOVERY_READ_VIEW');need(view.financialAuthorization===false,'SEPOLIA_REFILL_RECOVERY_READ_ONLY');return view;});
}

/** Only the recovered, still-current Original Source can activate its already
 * signed finite policy. Storage recovery and read tokens cannot mint this cap. */
export async function activateOriginalPagedPublicRefillRecoveredSourceV16(receiver,token){
 assert.equal(arguments.length,2);const r=originalReceiver(receiver);need(r.s.refillRecoveryStorage&&r.refillRecoveryState&&r.sourceSigner&&!r.refillRecoveredActivation,'SEPOLIA_REFILL_RECOVERY_ACTIVATION_REQUIRED');
 return serialized(r.s,async()=>{
  originalReceiver(receiver);need(!r.refillRecoveredActivation,'SEPOLIA_REFILL_RECOVERY_ALREADY_ACTIVATED');
  const P=await import('../operations/local/funded-graph-paged-public-kernel-v4.mjs'),binding=P.consumeOriginalPagedSepoliaRefillRecoveredActivationV16(token),K=await import('../chains/public-testnet/key-store-v1.mjs');
  need(binding.profile==='ORIGINAL_PAGED_REFILL_RECOVERED_SOURCE_ACTIVATION_DATA_V16'&&binding.runtime===receiver&&binding.financialAuthorization===false,'SEPOLIA_REFILL_RECOVERY_ORIGINAL_ACTIVATION');P.assertOriginalPagedSepoliaSourceJournalV4(receiver,binding.system,binding.bundle);assert.deepEqual(binding.descriptor,binding.bundle.descriptor,'SEPOLIA_REFILL_RECOVERY_ORIGINAL_DESCRIPTOR');
  assert.deepEqual(r.native.checkpoint(),r.s.refillRecoveryNativeCheckpoint,'SEPOLIA_REFILL_RECOVERY_NATIVE_CHANGED');
  const before=await K.readOriginalPublicPagedSourceFinancialStateV5(r.sourceSigner);assert.deepEqual(before,r.refillRecoveryState,'SEPOLIA_REFILL_RECOVERY_SOURCE_CHANGED');
  need(before.epoch&&before.history.length>0&&before.reviewEligible,'SEPOLIA_REFILL_RECOVERY_SIGNED_POLICY');need(BigInt(P.readOriginalPagedSepoliaSourceBirthDepthV5(receiver,binding.bundle))<=BigInt(before.limits.maximumSourcesPerWallet),'SEPOLIA_REFILL_RECOVERY_SIGNED_WALLET_QUOTA');await readOriginalRefillRecoverySourceStateV16(r,K,r.s.retainedSource);
  need(Date.now()<binding.descriptor.deadlineMs&&binding.descriptor.deadlineMs<=before.effectivePolicy.expiresAt-30*60*1000,'SEPOLIA_REFILL_RECOVERY_SOURCE_WINDOW');
  await K.closeOriginalPublicPagedSourceSignerV4(r.sourceSigner);r.sourceSigner=null;
  r.sourceSigner=await K.openOriginalPublicPagedSourceSignerV4(r.s.keys,receiver,r.s.retainedSource.configuration.policy,r.sourceControl.signal);
  try{assert.deepEqual({...await K.readOriginalPublicPagedSourceFinancialStateV5(r.sourceSigner),financialSigningEnabled:false},before,'SEPOLIA_REFILL_RECOVERY_ACTIVATION_CHANGED');assert.deepEqual(r.native.checkpoint(),r.s.refillRecoveryNativeCheckpoint,'SEPOLIA_REFILL_RECOVERY_NATIVE_CHANGED');}
  catch(error){await K.closeOriginalPublicPagedSourceSignerV4(r.sourceSigner);r.sourceSigner=null;throw error;}
  r.refillRecoveredActivation=true;r.s.refillRecoveryStorage=false;return null;
 });
}

/** Finish the SAME signed review without changing the retained Source rows
 * or bootstrap checkpoint. The Supervisor performs its separate snapshot CAS. */
export async function captureOriginalPagedPublicFinancialReviewV5(receiver){
 assert.equal(arguments.length,1);const r=originalReceiver(receiver);need(r.financialReview&&r.sourceSigner,'SEPOLIA_SOURCE_FINANCIAL_REVIEW_REQUIRED');const saved=await exclusiveFinancialReview(r.s,async()=>{
  originalReceiver(receiver);const K=await import('../chains/public-testnet/key-store-v1.mjs');await K.assertOriginalPublicPagedSourceFinancialReviewCompletionV5(r.sourceSigner,r.financialReview.review,r.financialReview.previousNative.source);const checkpoint=r.native.checkpoint(),source=K.readOriginalPublicPagedSourceActivationBaseV4(r.sourceSigner),bootstrap=await K.readOriginalPublicCompiledReceiverCheckpointV4(r.s.keys);originalReceiver(receiver);assert.deepEqual(checkpoint,r.financialReview.previousNative.checkpoint,'SEPOLIA_SOURCE_FINANCIAL_REVIEW_NATIVE_CHANGED');assert.deepEqual(bootstrap,r.financialReview.previousNative.source.bootstrap,'SEPOLIA_SOURCE_FINANCIAL_REVIEW_BOOTSTRAP_CHANGED');const actual=freeze({profile:'ORIGINAL_PAGED_PUBLIC_RUNTIME_RETENTION_V4',directory:r.s.directory,keysetId:r.s.keyset.keysetId,configuration:{profile:'ORIGINAL_PAGED_PUBLIC_RUNTIME_CONFIGURATION_V4',networks:r.s.configs.map(c=>({id:c.network.id,endpoint:c.endpoint,feeProvider:c.feeProvider})),publicConfiguration:clone(r.native.publicConfiguration)},checkpoint,source:{...source,bootstrap,...(r.defiRecoveryLocator?{defiRetentionV8:clone(r.defiRecoveryLocator)}:{})}});r.s.capturing=true;return actual;
 });await receiver.close();await r.native.close();return saved;
}

/** Release an unsigned captured review without a capture commit. Only its
 * Original observer can corroborate the same physical histories and checkpoint. */
export async function closeOriginalPagedPublicFinancialReviewWithoutEpochV5(receiver){
 assert.equal(arguments.length,1);const r=originalReceiver(receiver);need(r.financialReview&&r.sourceSigner,'SEPOLIA_SOURCE_FINANCIAL_REVIEW_REQUIRED');const saved=await exclusiveFinancialReview(r.s,async()=>{
  originalReceiver(receiver);const K=await import('../chains/public-testnet/key-store-v1.mjs');await K.assertOriginalPublicPagedSourceNoFinancialEpochV5(r.sourceSigner,r.financialReview.review,r.financialReview.previousNative.source);const checkpoint=r.native.checkpoint(),source=K.readOriginalPublicPagedSourceActivationBaseV4(r.sourceSigner),bootstrap=await K.readOriginalPublicCompiledReceiverCheckpointV4(r.s.keys);originalReceiver(receiver);const actual=freeze({profile:'ORIGINAL_PAGED_PUBLIC_RUNTIME_RETENTION_V4',directory:r.s.directory,keysetId:r.s.keyset.keysetId,configuration:{profile:'ORIGINAL_PAGED_PUBLIC_RUNTIME_CONFIGURATION_V4',networks:r.s.configs.map(c=>({id:c.network.id,endpoint:c.endpoint,feeProvider:c.feeProvider})),publicConfiguration:clone(r.native.publicConfiguration)},checkpoint,source:{...source,bootstrap,...(r.defiRecoveryLocator?{defiRetentionV8:clone(r.defiRecoveryLocator)}:{})}});assert.deepEqual(actual,r.financialReview.previousNative,'SEPOLIA_SOURCE_FINANCIAL_REVIEW_NO_EPOCH_NATIVE_CHANGED');r.s.capturing=true;return actual;
 });await receiver.close();await r.native.close();return saved;
}

/** Observing saved signed wires remains available after the sponsor deadline;
 * this capability cannot issue a lane, prepare, sign or repost a Source call. */
export async function reopenOriginalPagedPublicSepoliaSourceObserverV4(receiver,policy){assert.equal(arguments.length,2);const r=originalReceiver(receiver);return serialized(r.s,async()=>{originalReceiver(receiver);need(r.finalized&&r.s.receiverBootstrap===null&&!r.sourceSigner,'SEPOLIA_SOURCE_BOOTSTRAP_NOT_RELEASED');const K=await import('../chains/public-testnet/key-store-v1.mjs');if(r.s.retainedSource)assert.deepEqual(policy,r.s.retainedSource.configuration.policy,'SEPOLIA_SOURCE_REOPEN_POLICY');r.sourceSigner=await K.openOriginalPublicPagedSourceObserverV4(r.s.keys,receiver,policy,r.sourceControl.signal);if(r.s.retainedSource)assertOriginalRetainedJournalCheckpointV5(K.readOriginalPublicPagedSourceCheckpointV4(r.sourceSigner),r.s.retainedSource.checkpoint,'SEPOLIA_SOURCE_REOPEN_CHECKPOINT');return K.observeOriginalPublicPagedSourceV4(r.sourceSigner);});}

/** Capture closes only our own RPC/signers/journals/keys. External chains keep
 * running, and pending signed wires remain pending, without a new broadcast. */
/** A private activation base is taken from the SAME original native/signer
 * handles before publication. It never closes, observes, commits or signs. */
export async function readOriginalPagedPublicRuntimeActivationBaseV4(runtime){
 assert.equal(arguments.length,1);const s=current(owners.get(runtime));need(!s.capturing&&s.receiverBootstrap===null&&s.receivers.size===1&&s.active.size===0,'PUBLIC_RUNTIME_ACTIVATION_QUIESCENT');await s.queue;current(s);need(s.active.size===0,'PUBLIC_RUNTIME_ACTIVATION_QUIESCENT');const receiver=[...s.receivers][0],r=receiverOwners.get(receiver);need(r?.finalized&&r.sourceSigner&&!r.closed,'PUBLIC_RUNTIME_ACTIVATION_SOURCE_REQUIRED');const before=runtime.checkpoint(),K=await import('../chains/public-testnet/key-store-v1.mjs'),source=K.readOriginalPublicPagedSourceActivationBaseV4(r.sourceSigner),bootstrap=await K.readOriginalPublicCompiledReceiverCheckpointV4(s.keys);current(s);need(s.active.size===0,'PUBLIC_RUNTIME_ACTIVATION_QUIESCENT');assert.deepEqual(runtime.checkpoint(),before,'PUBLIC_RUNTIME_ACTIVATION_HIGHWATER');assert.deepEqual(K.readOriginalPublicPagedSourceCheckpointV4(r.sourceSigner),source.checkpoint,'PUBLIC_RUNTIME_ACTIVATION_SOURCE_HIGHWATER');return freeze({profile:'ORIGINAL_PAGED_PUBLIC_RUNTIME_RETENTION_V4',directory:s.directory,keysetId:s.keyset.keysetId,configuration:{profile:'ORIGINAL_PAGED_PUBLIC_RUNTIME_CONFIGURATION_V4',networks:s.configs.map(c=>({id:c.network.id,endpoint:c.endpoint,feeProvider:c.feeProvider})),publicConfiguration:clone(runtime.publicConfiguration)},checkpoint:before,source:{...source,bootstrap,...(r.defiRecoveryLocator?{defiRetentionV8:clone(r.defiRecoveryLocator)}:{})}});
}
export async function captureOriginalPagedPublicTestnetRuntimesV4(runtime){
 assert.equal(arguments.length,1);const s=current(owners.get(runtime));need(!s.capturing&&s.receiverBootstrap===null&&s.receivers.size===1,'PUBLIC_RUNTIME_CAPTURE_SOURCE_REQUIRED');s.capturing=true;
 try{
  await Promise.allSettled([...s.active]);await s.queue;current(s);const receiver=[...s.receivers][0],r=receiverOwners.get(receiver);need(r?.finalized&&r.sourceSigner&&!r.closed,'PUBLIC_RUNTIME_CAPTURE_SOURCE_REQUIRED');
  const K=await import('../chains/public-testnet/key-store-v1.mjs'),source=await K.captureOriginalPublicPagedSourceV4(r.sourceSigner),bootstrap=await K.readOriginalPublicCompiledReceiverCheckpointV4(s.keys);await commit(s,validateRecords(s));
  const saved=freeze({profile:'ORIGINAL_PAGED_PUBLIC_RUNTIME_RETENTION_V4',directory:s.directory,keysetId:s.keyset.keysetId,configuration:{profile:'ORIGINAL_PAGED_PUBLIC_RUNTIME_CONFIGURATION_V4',networks:s.configs.map(c=>({id:c.network.id,endpoint:c.endpoint,feeProvider:c.feeProvider})),publicConfiguration:clone(runtime.publicConfiguration)},checkpoint:runtime.checkpoint(),source:{...source,bootstrap,...(r.defiRecoveryLocator?{defiRetentionV8:clone(r.defiRecoveryLocator)}:{})}});await runtime.close();return saved;
 }catch(error){s.capturing=false;throw error;}
}
export async function reopenOriginalPagedPublicTestnetRuntimesV4(input,token){
 assert.equal(arguments.length,2);exact(input,['directory']);const {consumeOriginalPagedComponentRecoveryV3}=await import('../operations/recovery/paged-runtime-recovery-authority-v3.mjs'),saved=consumeOriginalPagedComponentRecoveryV3(token,'native');return reopenOriginalRetainedPublicRuntimeV16(input,saved,false);
}

/** The fixed Parent storage token can reconstruct existing state only. It is
 * never accepted by the ordinary Native or deployment financial openers. */
export async function reopenOriginalPagedPublicRefillRecoveryRuntimeV16(input,token){
 assert.equal(arguments.length,2);exact(input,['directory']);const {consumeOriginalPagedPublicRefillRecoveryComponentV16}=await import('../operations/recovery/paged-runtime-recovery-authority-v3.mjs'),saved=consumeOriginalPagedPublicRefillRecoveryComponentV16(token,'native');return reopenOriginalRetainedPublicRuntimeV16(input,saved,true);
}
async function reopenOriginalRetainedPublicRuntimeV16(input,saved,refillRecoveryStorage){
 exact(saved,['profile','directory','keysetId','configuration','checkpoint','source']);need(saved.profile==='ORIGINAL_PAGED_PUBLIC_RUNTIME_RETENTION_V4'&&resolve(input.directory)===saved.directory,'PUBLIC_RUNTIME_REOPEN_PROFILE');
 exact(saved.source,['profile','configuration','checkpoint','bootstrap'],['defiRetentionV8']);need(saved.source.profile==='ORIGINAL_PAGED_PUBLIC_SOURCE_RETENTION_V4','PUBLIC_RUNTIME_REOPEN_SOURCE');if(Object.hasOwn(saved.source,'defiRetentionV8'))normalizePagedPublicDefiRecoveryLocatorDataV8(saved.source.defiRetentionV8,{chainId:'11155111',keysetId:saved.keysetId,account:saved.source.configuration.receiver.account.address});exact(saved.configuration,['profile','networks','publicConfiguration']);need(saved.configuration.profile==='ORIGINAL_PAGED_PUBLIC_RUNTIME_CONFIGURATION_V4','PUBLIC_RUNTIME_REOPEN_CONFIGURATION');const configuration={networks:saved.configuration.networks};
 const runtime=await openOriginalPagedPublicTestnetRuntime({directory:saved.directory,configuration},{...saved,bootstrap:saved.source.bootstrap},refillRecoveryStorage);return runtime;
}

/** Explicit bounded box allocation uses the same Source signer, sponsored
 * ceilings and serialized ETH queue. It never restarts initial bootstrap. */
export async function runOriginalPagedPublicSepoliaSuccessorV4(receiver,priorSystem,input){assert.equal(arguments.length,3);return originalSuccessorRun(receiver,priorSystem,input,false);}
export async function preflightOriginalPagedPublicSepoliaSuccessorV4(receiver,priorSystem,input){assert.equal(arguments.length,3);return originalSuccessorRun(receiver,priorSystem,input,true);}
async function originalSuccessorRun(receiver,priorSystem,input,preflight){const r=originalReceiver(receiver);need(r.finalized&&r.s.receiverBootstrap===null&&r.sourceSigner,'SEPOLIA_SUCCESSOR_SOURCE_REQUIRED');return serialized(r.s,async()=>{
 originalReceiver(receiver);need(validateRecords(r.s).every(row=>row.observation?.status==='OBSERVED'||row.observation?.status==='ADVERSE'),'SEPOLIA_SUCCESSOR_NATIVE_SOURCE_PENDING');const K=await import('../chains/public-testnet/key-store-v1.mjs'),P=await import('../operations/local/funded-graph-paged-public-kernel-v4.mjs');assertOriginalSuccessorParent(r,P,priorSystem);const savedChild=r.successorSystems.get(priorSystem);if(savedChild&&!preflight)return P.assertOriginalPagedSepoliaSuccessorSelectionV4(receiver,priorSystem,savedChild,input);const attempt=P.readOriginalPagedSepoliaSuccessorAttemptV4(receiver,priorSystem),start=attempt?BigInt(attempt.startNonce):await receiver.nonce(receiver.accounts[0],'pending'),plan=await P.prepareOriginalFundedPagedGraphSepoliaSuccessorPlanV4(receiver,priorSystem,input,start);let complete=false;
 try{for(;;){current(r.s);const step=await P.readOriginalPagedSepoliaPlanStepV4(receiver,plan);if(step.kind==='READY'){await K.waitOriginalPublicPagedSuccessorFinalityV4(r.sourceSigner,step.completion);rememberOriginalSuccessor(r,P,priorSystem,step.system);complete=true;return step.system;}if(preflight)return await K.preflightOriginalPublicPagedSuccessorV4(r.sourceSigner,step.token);let actual;try{actual=await K.executeOriginalPublicPagedSuccessorV4(r.sourceSigner,step.token);}catch(error){if(error.message!=='SEPOLIA_SUCCESSOR_ORIGINAL_SEND_PENDING')throw error;actual=await K.waitOriginalPublicPagedSuccessorConstructorV4(r.sourceSigner,step.token);}await P.advanceOriginalPagedSepoliaPlanV4(receiver,plan,step.token,actual);}}finally{if(!complete)await P.closeOriginalPagedSepoliaPlanV4(receiver,plan);}
 });}
function assertOriginalSuccessorParent(r,P,parent){
 // Kernel validates the actual handles and lineage before a map lookup.
 let root=parent;for(let count=0;;count++){need(count<=16,'SEPOLIA_SUCCESSOR_CHAIN_QUOTA');const previous=P.readOriginalPagedSepoliaPoolParentV5(r.receiver,root);if(previous===null)break;root=previous;}
 need(r.rootSystem===null||r.rootSystem===root,'SEPOLIA_SUCCESSOR_ORIGINAL_ROOT');r.rootSystem=root;need(P.readOriginalPagedSepoliaPoolChainV5(r.receiver,root).includes(parent),'SEPOLIA_SUCCESSOR_ORIGINAL_PARENT');r.poolKernel=P;r.poolSystems.add(root);r.poolSystems.add(parent);return parent;
}
function rememberOriginalSuccessor(r,P,parent,child){assertOriginalSuccessorParent(r,P,parent);need(P.readOriginalPagedSepoliaPoolParentV5(r.receiver,child)===parent,'SEPOLIA_SUCCESSOR_ORIGINAL_CHILD');need(P.readOriginalPagedSepoliaPoolChainV5(r.receiver,r.rootSystem).includes(child),'SEPOLIA_SUCCESSOR_ORIGINAL_CHILD');const previous=r.successorSystems.get(parent);need(previous===undefined||previous===child,'SEPOLIA_SUCCESSOR_ORIGINAL_CHILD');r.poolSystems.add(child);r.successorSystems.set(parent,child);if(parent===r.rootSystem)r.successorSystem=child;return child;}
async function observeRetainedOriginalSuccessorV4(r,system){
 const P=await import('../operations/local/funded-graph-paged-public-kernel-v4.mjs'),K=await import('../chains/public-testnet/key-store-v1.mjs');let parent=system,first=null;
 for(let depth=0;;depth++){
  assertOriginalSuccessorParent(r,P,parent);const attempt=P.readOriginalPagedSepoliaSuccessorAttemptV4(r.receiver,parent);if(!attempt?.system)return first;need(depth<16,'SEPOLIA_SUCCESSOR_CHAIN_QUOTA');const token=P.issueOriginalPagedSepoliaRetainedSuccessorV4(r.receiver,parent);need(token,'SEPOLIA_SUCCESSOR_ORIGINAL_REOPEN');const plan=await P.prepareOriginalFundedPagedGraphSepoliaSuccessorReopenPlanV4(r.receiver,parent,token);let complete=false,child;
  // Review and refill storage recovery observe the retained successor without
  // committing a phase; only an ordinary reopen may finalize its journal row.
  const readOnly=!!(r.financialReview||r.refillRecoveryState);
  try{for(;;){const step=await P.readOriginalPagedSepoliaPlanStepV4(r.receiver,plan);if(step.kind==='READY'){await (readOnly?K.inspectOriginalPublicPagedSuccessorFinalityV5:K.finalizeOriginalPublicPagedSuccessorV4)(r.sourceSigner,step.completion);child=rememberOriginalSuccessor(r,P,parent,step.system);complete=true;break;}const actual=await (readOnly?K.inspectOriginalPublicPagedSuccessorConstructorV5:K.observeOriginalPublicPagedSuccessorConstructorV4)(r.sourceSigner,step.token);await P.advanceOriginalPagedSepoliaPlanV4(r.receiver,plan,step.token,actual);}}finally{if(!complete)await P.closeOriginalPagedSepoliaPlanV4(r.receiver,plan);}
  first??=child;parent=child;
 }
}
export function readOriginalPagedPublicSepoliaSuccessorV4(receiver){assert.equal(arguments.length,1);const r=originalReceiver(receiver);need(r.successorSystem,'SEPOLIA_SUCCESSOR_NOT_FINALIZED');return r.successorSystem;}
export function readOriginalPagedPublicSepoliaSuccessorForParentV5(receiver,parentSystem){assert.equal(arguments.length,2);const r=originalReceiver(receiver);need(r.poolSystems.has(parentSystem),'SEPOLIA_SUCCESSOR_ORIGINAL_PARENT');const child=r.successorSystems.get(parentSystem);need(child,'SEPOLIA_SUCCESSOR_NOT_FINALIZED');r.poolKernel.assertOriginalFundedPagedGraphSepoliaWalletV4(receiver,parentSystem);r.poolKernel.assertOriginalFundedPagedGraphSepoliaWalletV4(receiver,child);need(r.poolKernel.readOriginalPagedSepoliaPoolParentV5(receiver,child)===parentSystem,'SEPOLIA_SUCCESSOR_ORIGINAL_CHILD');return child;}

/** Prospective replacement-provider claim only. The fixed inspector is called
 * HERE over physical state; no caller checkpoint object or callback can mint
 * the claim. No compiled CREATE, Source policy or send permission is issued. */
export async function reserveOriginalPagedPublicPartialProviderBirthV5(native,input){
 assert.equal(arguments.length,2);exact(input,['operatorDirectory','checkpointSHA256','operatorConfigurationSHA256','approval']);exact(input.approval,['maximumTotalFeeAtomic','expiresAt']);const s=current(owners.get(native));need(s.originalPorts===null&&s.providerIdentity===null&&s.receiverBootstrap===null&&!s.providerBinding&&s.active.size===0&&s.receivers.size===0&&!s.partialBirthWork,'SEPOLIA_PARTIAL_NATIVE_EXCLUSIVE');need(validateRecords(s).length===0,'SEPOLIA_PARTIAL_NATIVE_NOT_EMPTY');need(typeof input.checkpointSHA256==='string'&&/^[0-9a-f]{64}$/.test(input.checkpointSHA256)&&typeof input.operatorConfigurationSHA256==='string'&&/^[0-9a-f]{64}$/.test(input.operatorConfigurationSHA256),'SEPOLIA_PARTIAL_CHECKPOINT');need(Number.isSafeInteger(input.approval.expiresAt)&&Date.now()<input.approval.expiresAt&&input.approval.expiresAt<=Date.now()+3600000&&/^[1-9][0-9]*$/.test(input.approval.maximumTotalFeeAtomic),'SEPOLIA_PARTIAL_NEW_APPROVAL');const request=clone(input);
 const actual=s.partialInspection;need(actual,'SEPOLIA_PARTIAL_ORIGINAL_INSPECTION_REQUIRED');assert.equal(actual.checkpointSHA256,request.checkpointSHA256,'SEPOLIA_PARTIAL_CHECKPOINT_CHANGED');assert.equal(actual.checkpoint.operatorConfigurationSHA256,request.operatorConfigurationSHA256,'SEPOLIA_PARTIAL_CONFIGURATION_CHANGED');assert.equal(actual.checkpoint.keysetId,s.keyset.keysetId,'SEPOLIA_PARTIAL_KEYSET');assert.deepEqual(actual.checkpoint.accounts,s.keyset.accounts,'SEPOLIA_PARTIAL_ACCOUNTS');need(BigInt(request.approval.maximumTotalFeeAtomic)>=BigInt(actual.checkpoint.maximumFeeAlreadyReservedAtomic),'SEPOLIA_PARTIAL_PRIOR_FEES_EXCEED_APPROVAL');need(Date.now()<request.approval.expiresAt,'SEPOLIA_PARTIAL_NEW_APPROVAL');const claim=Object.freeze(Object.create(null));s.providerIdentity=claim;s.partialBirth={claim,checkpoint:actual.checkpoint,checkpointSHA256:actual.checkpointSHA256,approval:freeze(request.approval),operatorDirectory:resolve(request.operatorDirectory),providerDirectory:join(resolve(request.operatorDirectory),'provider-replacement-v5')};return claim;
}
export function assertOriginalPagedPublicPartialProviderBirthV5(native,claim,directory){assert.equal(arguments.length,3);const s=current(owners.get(native)),p=s.partialBirth;need(p?.claim===claim&&s.providerIdentity===claim&&s.originalPorts===null&&!s.providerBinding&&s.receiverBootstrap===null,'SEPOLIA_PARTIAL_ORIGINAL_PROVIDER_CLAIM');need(resolve(directory)===p.providerDirectory&&directory===p.providerDirectory,'SEPOLIA_PARTIAL_REPLACEMENT_DIRECTORY');need(Date.now()<p.approval.expiresAt,'SEPOLIA_PARTIAL_NEW_APPROVAL');return Object.freeze({profile:'ORIGINAL_PUBLIC_PARTIAL_PROVIDER_BIRTH_V5',keysetId:s.keyset.keysetId,checkpointSHA256:p.checkpointSHA256,operatorConfigurationSHA256:p.checkpoint.operatorConfigurationSHA256,legacyConfigurationSHA256:p.checkpoint.bootstrapCheckpoint.legacyConfigurationSHA256,providerDirectory:p.providerDirectory,maximumTotalFeeAtomic:p.approval.maximumTotalFeeAtomic,expiresAt:p.approval.expiresAt});}

/** Inspect before acquiring the Native writer lock, then authenticate the SAME
 * physical checkpoint against the newly opened Original runtime. No DTO
 * inspection, timestamp or keyset supplied by a caller becomes authority. */
export async function createOriginalPagedPublicPartialBootstrapRuntimesV5(input){
 assert.equal(arguments.length,1);exact(input,['operatorDirectory','nativeDirectory','checkpointSHA256','operatorConfigurationSHA256','approval']);const {inspectOriginalPagedPublicPartialBootstrapV5}=await import('../chains/public-testnet/sepolia-partial-bootstrap-inspector-v5.mjs'),actual=await inspectOriginalPagedPublicPartialBootstrapV5({operatorDirectory:input.operatorDirectory,nativeDirectory:input.nativeDirectory});assert.equal(actual.checkpointSHA256,input.checkpointSHA256,'SEPOLIA_PARTIAL_CHECKPOINT_CHANGED');assert.equal(actual.checkpoint.operatorConfigurationSHA256,input.operatorConfigurationSHA256,'SEPOLIA_PARTIAL_CONFIGURATION_CHANGED');const {readFile}=await import('node:fs/promises'),bytes=await readFile(join(input.operatorDirectory,'operator.json'));need(createHash('sha256').update(bytes).digest('hex')===input.operatorConfigurationSHA256,'SEPOLIA_PARTIAL_CONFIGURATION_CHANGED');const configuration=JSON.parse(bytes.toString('utf8')),runtime=await openOriginalPagedPublicTestnetRuntime({directory:input.nativeDirectory,configuration:configuration.networkConfiguration},null),s=current(owners.get(runtime));try{assert.equal(s.keyset.keysetId,actual.checkpoint.keysetId);assert.deepEqual(s.keyset.accounts,actual.checkpoint.accounts);const cp=runtime.checkpoint();assert.deepEqual({identity:cp.identity,revision:cp.revision,dataSHA256:cp.dataSHA256},{identity:actual.checkpoint.dispatchCheckpoint.identity,revision:actual.checkpoint.dispatchCheckpoint.revision,dataSHA256:actual.checkpoint.dispatchCheckpoint.dataSHA256});const bootstrapBytes=await readFile(join(input.nativeDirectory,'receiver-bootstrap','native-wallet.json'));assert.equal(createHash('sha256').update(bootstrapBytes).digest('hex'),actual.checkpoint.bootstrapCheckpoint.fileSHA256,'SEPOLIA_PARTIAL_BOOTSTRAP_CHANGED');s.partialInspection=actual;s.partialOperatorConfiguration=configuration;return runtime;}catch(error){await runtime.close();throw error;}
}
/** Fixed continuation of the compiled initial plan. Registry keys are read
 * from the SAME early AEAD provider seed rather than caller configuration. */
export async function runOriginalPagedPublicPartialBootstrapV5(receiver,claim,journalPassword){
 assert.equal(arguments.length,3);const r=originalReceiver(receiver),s=r.s,p=s.partialBirth;need(p?.claim===claim&&s.providerIdentity===claim&&!r.finalized&&s.receiverBootstrap===r.request,'SEPOLIA_PARTIAL_ORIGINAL_CLAIM');return serialized(s,async()=>{
 const K=await import('../chains/public-testnet/key-store-v1.mjs'),P=await import('../operations/local/funded-graph-paged-public-kernel-v4.mjs'),B=await import('./paged-public-provider-birth-retention-v5.mjs'),record=await B.readPagedPublicProviderBirthV5(p.providerDirectory,journalPassword);need(record.keysetId===s.keyset.keysetId&&record.nativeConfigurationSHA256===createHash('sha256').update((await import('./paged-native-provider-state-v3.mjs')).canonicalPagedProviderDataV3(readOriginalPagedPublicRuntimeContextV1(r.native))).digest('hex'),'SEPOLIA_PARTIAL_PROVIDER_SEED_CONTEXT');const cfg=s.partialOperatorConfiguration;need(journalPassword===cfg.journal.password,'SEPOLIA_PARTIAL_OPERATOR_CREDENTIAL');const configuration={...clone(cfg.deployment),registryEpoch:'1',rulesRoot:'0x'+record.providerData.rulesRoot,attesterKeys:record.providerData.attesterKeys.map(k=>({x:k.x,y:k.y}))};record.providerPassword=null;for(const k of record.providerData.attesterKeys)k.pkcs8=null;record.providerData.providerKey.pkcs8=null;const normalized=(await import('../operations/local/funded-graph-paged-kernel-data-v4.mjs')).normalizePagedDeploymentConfigurationDataV4(configuration),approved=s.partialRetentionToken?await K.restoreOriginalPublicPartialBootstrapApprovalV5(r.signer,s.partialRetentionToken):await K.authorizeOriginalPublicPartialBootstrapV5(r.signer,{profile:'ORIGINAL_PARTIAL_BOOTSTRAP_DEPLOY_APPROVAL_V5',checkpointSHA256:p.checkpointSHA256,operatorConfigurationSHA256:p.checkpoint.operatorConfigurationSHA256,legacyConfigurationSHA256:p.checkpoint.bootstrapCheckpoint.legacyConfigurationSHA256,configurationSHA256:sha(normalized),keysetId:s.keyset.keysetId,account:s.keyset.accounts[0].address,providerDirectory:p.providerDirectory,maximumTotalFeeAtomic:p.approval.maximumTotalFeeAtomic,expiresAt:p.approval.expiresAt},journalPassword,p.operatorDirectory),plan=await P.prepareOriginalFundedPagedGraphSepoliaPartialPlanV5(receiver,normalized,approved);let complete=false;
 try{for(;;){current(s);const step=await P.readOriginalPagedSepoliaPlanStepV4(receiver,plan);if(step.kind==='READY'){await K.waitOriginalPublicCompiledReceiverFinalityV4(r.signer,step.completion);current(s);await K.closeOriginalPublicCompiledReceiverSignerV4(r.signer);r.finalized=true;s.receiverBootstrap=null;complete=true;return step.system;}const grant=P.readOriginalPagedSepoliaDeploymentConstructorV4(receiver,step.token);let receipt;if(BigInt(grant.nonce)<2n)receipt=await K.observeOriginalPublicPartialBootstrapLibraryV5(r.signer,step.token,approved);else try{receipt=await K.executeOriginalPublicCompiledReceiverV4(r.signer,step.token,p.approval);}catch(error){if(error.message!=='SEPOLIA_RECEIVER_ORIGINAL_DEPLOYMENT_PENDING')throw error;receipt=await K.waitOriginalPublicCompiledReceiverConstructorV4(r.signer,step.token);}await P.advanceOriginalPagedSepoliaPlanV4(receiver,plan,step.token,receipt);}}finally{if(!complete)await P.closeOriginalPagedSepoliaPlanV4(receiver,plan);}
 });
}

/** Restore the same pre-Source transition from the fixed physical AEAD
 * retention. A signed permission is verified again by KeyStore before a plan;
 * no new expiry, provider keys, budget or journal is initialized here. */
export async function reopenOriginalPagedPublicPartialBootstrapRuntimesV5(input){
 assert.equal(arguments.length,1);exact(input,['operatorDirectory','nativeDirectory']);const R=await import('../chains/public-testnet/sepolia-partial-bootstrap-retention-v5.mjs'),token=await R.readOriginalPagedPublicPartialRetentionV5(input),saved=await R.readOriginalPagedPublicPartialRetentionDataV5(token),runtime=await openOriginalPagedPublicTestnetRuntime({directory:input.nativeDirectory,configuration:saved.configuration.networkConfiguration},null),s=current(owners.get(runtime));try{need(s.journal.read().revision===0&&validateRecords(s).length===0,'SEPOLIA_PARTIAL_NATIVE_ALREADY_USED');const a=saved.record.frame.approval;need(a.keysetId===s.keyset.keysetId&&a.account===s.keyset.accounts[0].address,'SEPOLIA_PARTIAL_REOPEN_KEYSET');await R.readOriginalPagedPublicPartialRetentionDataV5(token);s.partialRetentionToken=token;s.partialOperatorConfiguration=saved.configuration;s.partialReopening=true;s.partialBirth={claim:null,checkpoint:{operatorConfigurationSHA256:a.operatorConfigurationSHA256,bootstrapCheckpoint:{legacyConfigurationSHA256:a.legacyConfigurationSHA256}},checkpointSHA256:a.checkpointSHA256,approval:freeze({maximumTotalFeeAtomic:a.maximumTotalFeeAtomic,expiresAt:a.expiresAt}),operatorDirectory:input.operatorDirectory,providerDirectory:a.providerDirectory};return runtime;}catch(error){await runtime.close();throw error;}
}
export function reserveOriginalPagedPublicPartialContinuationV5(native){assert.equal(arguments.length,1);const s=current(owners.get(native)),p=s.partialBirth;need(s.partialReopening&&s.partialRetentionToken&&p?.claim===null&&s.providerIdentity===null&&s.originalPorts===null&&s.receiverBootstrap===null&&!s.providerBinding,'SEPOLIA_PARTIAL_ORIGINAL_REOPEN');need(Date.now()<p.approval.expiresAt,'SEPOLIA_PARTIAL_APPROVAL_EXPIRED');const claim=Object.freeze(Object.create(null));p.claim=claim;s.providerIdentity=claim;return claim;}

/** Private operator DATA only. This accessor cannot emit a signing or Source
 * capability, and the returned object never substitutes the Original handle. */
export function readOriginalPagedPublicPartialContinuationContextV5(native){assert.equal(arguments.length,1);const s=current(owners.get(native));need(s.partialReopening&&s.partialRetentionToken&&s.partialBirth,'SEPOLIA_PARTIAL_ORIGINAL_REOPEN');const p=s.partialBirth;return freeze({configuration:clone(s.partialOperatorConfiguration),providerDirectory:p.providerDirectory,checkpointSHA256:p.checkpointSHA256,approval:clone(p.approval)});}

export async function runOriginalPagedPublicSepoliaUniswapTargetV4(receiver,parent,venue){
 assert.equal(arguments.length,3);const r=originalReceiver(receiver);need(r.finalized&&r.s.receiverBootstrap===null&&r.sourceSigner,'SEPOLIA_UNISWAP_TARGET_SOURCE_REQUIRED');return serialized(r.s,async()=>{
  originalReceiver(receiver);need(validateRecords(r.s).every(row=>['OBSERVED','ADVERSE'].includes(row.observation?.status)),'SEPOLIA_UNISWAP_TARGET_NATIVE_SOURCE_PENDING');const K=await import('../chains/public-testnet/key-store-v1.mjs'),T=await import('../operations/local/sepolia-uniswap-target-kernel-v4.mjs');
  if(r.uniswapTargetSystem){const binding=T.readOriginalSepoliaUniswapTargetSourceBindingV4(receiver,r.uniswapTargetSystem);assert.strictEqual(binding.parent,parent);assert.strictEqual(binding.venue,venue);return T.assertOriginalSepoliaUniswapTargetReadyV4(receiver,r.uniswapTargetSystem);}
  const previous=r.uniswapTargetAttempt;if(previous){assert.strictEqual(previous.parent,parent);assert.strictEqual(previous.venue,venue);}const start=previous?previous.startNonce:await receiver.nonce(receiver.accounts[0],'pending'),plan=previous?.plan??await T.prepareOriginalSepoliaUniswapTargetV4(receiver,parent,venue,start);r.uniswapTargetAttempt={parent,venue,startNonce:start,plan};
  for(let index=T.readOriginalSepoliaUniswapTargetProgressV4(receiver,plan).nextIndex;index<7;index++){current(r.s);const token=index<5?T.issueOriginalSepoliaUniswapTargetConstructorV4(receiver,plan,index):T.issueOriginalSepoliaUniswapTargetRegistrationV4(receiver,plan,index-5);let actual;
   try{actual=await K.executeOriginalPublicUniswapTargetInitializationV4(r.sourceSigner,token);}catch(error){if(error.message!=='SEPOLIA_UNISWAP_TARGET_ORIGINAL_SEND_PENDING')throw error;actual=await K.waitOriginalPublicUniswapTargetInitializationV4(r.sourceSigner,token);}
   if(index<5)await T.advanceOriginalSepoliaUniswapTargetConstructorV4(receiver,plan,token,actual.transactionHash);else await T.advanceOriginalSepoliaUniswapTargetRegistrationV4(receiver,plan,token,actual.transactionHash);
  }
  const system=await K.waitOriginalPublicUniswapTargetFinalityV4(r.sourceSigner,plan);originalReceiver(receiver);r.uniswapTargetSystem=system;return system;
 });
}

/** DeFi uses the same protected ETH queue and sponsor high-water as Native3
 * and Uniswap. It does not expose a generic server signer to HTTP handlers. */
export async function executeOriginalPagedPublicSepoliaDefiCommandV8(receiver,command){
 assert.equal(arguments.length,2);const r=originalReceiver(receiver);need(r.finalized&&r.sourceSigner,'SEPOLIA_DEFI_SOURCE_REQUIRED');
 return serialized(r.s,async()=>{current(r.s);const K=await import('../chains/public-testnet/key-store-v1.mjs');return K.executeOriginalPublicSepoliaDefiCommandV8(r.sourceSigner,command);});
}
export async function observeOriginalPagedPublicSepoliaDefiCommandV8(receiver,account,jobId,kind){
 assert.equal(arguments.length,4);const r=originalReceiver(receiver);need(r.finalized&&r.sourceSigner,'SEPOLIA_DEFI_SOURCE_REQUIRED');
 return serialized(r.s,async()=>{
  current(r.s);const K=await import('../chains/public-testnet/key-store-v1.mjs'),A=await import('../accounts/authority/device-sepolia-defi-shares-authority-v4.mjs'),status=await K.observeOriginalPublicSepoliaDefiCommandV8(r.sourceSigner,account,jobId,kind);
  if(status.transactionHash){const evidence=await K.issueOriginalPublicSepoliaDefiSubmissionEvidenceV8(r.sourceSigner,account,jobId,kind);await A.restoreOriginalDeviceSepoliaDefiRetainedSubmissionV8(account,evidence);}
  if(status.canonical){if(kind==='REDEEM')await A.observeOriginalDeviceSepoliaDefiRedemptionV8(account,jobId);else await A.observeOriginalDeviceSepoliaDefiSharesJobV4(account,jobId);}
  return status;
 });
}
/** Canonical delivery evidence is issued only from the Original account,
 * protected signed wire, immutable capital grant and observed private output. */
export async function readOriginalPagedPublicSepoliaDefiDeliveryV8(native,account,jobId){
 assert.equal(arguments.length,3);const s=current(owners.get(native));return serialized(s,async()=>{
  const A=await import('../accounts/authority/device-sepolia-defi-shares-authority-v4.mjs'),K=await import('../chains/public-testnet/key-store-v1.mjs'),binding=await A.readOriginalDeviceSepoliaDefiSharesAuthorityBindingV8(account),r=originalReceiver(binding.runtime);
  need(r.s===s&&r.finalized&&r.sourceSigner,'SEPOLIA_DEFI_ORIGINAL_SOURCE');
  const row=await K.readOriginalPublicSepoliaDefiDeliveryDataV8(r.sourceSigner,account,jobId),base={profile:'ORIGINAL_PUBLIC_PAGED_SEPOLIA_DEFI_DELIVERY_V8',protocol:row.protocol,jobId:row.jobId,reference:row.reference,nativeId:row.signed?.nativeId??null};
  if(row.phase!=='FINALIZED'||row.receipt?.status!=='0x1'||!row.signed)return freeze({...base,status:'UNKNOWN',finalized:false});
  const retained=await K.issueOriginalPublicSepoliaDefiSubmissionEvidenceV8(r.sourceSigner,account,jobId,'INVEST');await A.restoreOriginalDeviceSepoliaDefiRetainedSubmissionV8(account,retained);await A.observeOriginalDeviceSepoliaDefiSharesJobV4(account,jobId);
  const delivery=await A.readOriginalDeviceSepoliaDefiDeliveryEvidenceV8(account,jobId),capital=row.capital;
  need(delivery.protocol===row.protocol&&delivery.jobId===jobId&&delivery.reference===row.reference&&delivery.transactionHash===row.signed.nativeId,'SEPOLIA_DEFI_DELIVERY_ORIGINAL_WIRE');
  need(delivery.descriptor===capital.delivery.encodedDescriptor&&delivery.receiptCommitment===row.grant.review.receiptCommitment&&delivery.shareAmount===row.grant.review.shares,'SEPOLIA_DEFI_DELIVERY_ORIGINAL_OUTPUT');
  need(BigInt(delivery.inputSpent)>0n&&BigInt(delivery.inputSpent)<=BigInt(capital.inputCeiling.amountAtomic),'SEPOLIA_DEFI_DELIVERY_INPUT_CEILING');
  const fee=(BigInt(row.receipt.gasUsed)*BigInt(row.receipt.effectiveGasPrice)).toString();need(BigInt(fee)<=BigInt(capital.feeCeiling.amountAtomic),'SEPOLIA_DEFI_DELIVERY_FEE_CEILING');
  const facts=freeze({...base,status:'OBSERVED',finalized:true,nativeWire:row.signed.nativeWire,transactionSHA256:row.signed.transactionSHA256,feeAtomic:fee,blockId:row.receipt.blockHash.slice(2),blockHeight:BigInt(row.receipt.blockNumber).toString(),confirmations:(BigInt(row.finalizedHead.number)-BigInt(row.receipt.blockNumber)+1n).toString(),descriptor:clone(capital.delivery),receiptCommitment:delivery.receiptCommitment,shareAmount:delivery.shareAmount,inputSpent:delivery.inputSpent,underlyingAssetIdentity:delivery.underlyingAssetIdentity,shareAssetIdentity:delivery.shareAssetIdentity});
  issuedFacts.set(facts,{runtime:native,actionCommitment:capital.dispatch.actionCommitment,wireSHA256:row.signed.transactionSHA256});return facts;
 });
}
export async function readOriginalPagedPublicSepoliaSourceRecoveryRowsV8(receiver){
 assert.equal(arguments.length,1);const r=originalReceiver(receiver);need(r.finalized&&r.sourceSigner,'SEPOLIA_SOURCE_READ_REQUIRED');const K=await import('../chains/public-testnet/key-store-v1.mjs');originalReceiver(receiver);return K.readOriginalPublicPagedSourceRecoveryRowsV8(r.sourceSigner,receiver);
}
async function defiTargetKernelV8(protocol){
 need(['AAVE_STATIC','MORPHO_V2'].includes(protocol),'SEPOLIA_DEFI_PROTOCOL');
 return protocol==='AAVE_STATIC'?{module:await import('../operations/deployments/defi/aave-sepolia-target-v4.mjs'),name:'Aave'}:{module:await import('../operations/deployments/defi/morpho-v2-sepolia-target-v4.mjs'),name:'MorphoV2'};
}
/** Explicit administrative faucet preparation; no automatic user funding.
 * Existing source rows are observed before asking for another one-use grant. */
export async function claimOriginalPagedPublicAaveTestLiquidityV8(receiver,retention,target){
 assert.equal(arguments.length,3);const r=originalReceiver(receiver);need(r.finalized&&r.sourceSigner,'AAVE_FAUCET_SOURCE_REQUIRED');return serialized(r.s,async()=>{
  const A=await import('../operations/deployments/defi/aave-sepolia-target-v4.mjs'),R=await import('../operations/recovery/sepolia-defi-retention-v8.mjs'),K=await import('../chains/public-testnet/key-store-v1.mjs');A.assertOriginalAaveSepoliaTargetV4(receiver,target);const binding=await R.readOriginalSepoliaDefiRetentionBindingV8(retention);need(binding.runtime===receiver&&binding.uniswapTarget===r.uniswapTargetSystem&&A.readOriginalAaveSepoliaTargetBindingV4(receiver,target).uniswapTarget===binding.uniswapTarget,'AAVE_FAUCET_ORIGINAL_PARENT');
  const existing=await K.observeOriginalPublicAaveTestLiquidityV8(r.sourceSigner,target.planSHA256);if(existing){need(existing.confirmed,'AAVE_FAUCET_ORIGINAL_SEND_PENDING');return existing;}
  const balance=BigInt(await receiver.call({to:target.target.pools[0].asset,data:'0x70a08231'+target.account.slice(2).padStart(64,'0')}));if(balance>=2000000n)return freeze({profile:'ORIGINAL_AAVE_TEST_LIQUIDITY_STATUS_V8',targetPlanSHA256:target.planSHA256,phase:'FUNDED',confirmed:true,transactionHash:null,amountAtomic:'0',balanceAtomic:balance.toString(),automaticRebroadcast:false});
  const F=await import('../chains/public-testnet/aave-sepolia-faucet-v8.mjs'),token=await F.prepareOriginalAaveSepoliaFaucetV8(receiver,retention,target),status=await K.executeOriginalPublicAaveTestLiquidityV8(r.sourceSigner,token);need(status.confirmed,'AAVE_FAUCET_ORIGINAL_SEND_PENDING');return status;
 });
}
/** Initialize both independent venue targets before waiting for finality.
 * This returns routing DATA only; no finalized Target/system capability. */
export async function initializeOriginalPagedPublicSepoliaDefiTargetV8(receiver,uniswapTarget,venue,protocol,retention){
 assert.equal(arguments.length,5);return originalDefiTargetV8(receiver,uniswapTarget,venue,protocol,retention,null,'create',true);
}
export async function runOriginalPagedPublicSepoliaDefiTargetV8(receiver,uniswapTarget,venue,protocol,retention){
 assert.equal(arguments.length,5);return originalDefiTargetV8(receiver,uniswapTarget,venue,protocol,retention,null,'create');
}
/** Only a live Original retention owner can register the locator subsequently
 * authenticated in the Native activation/capture. No password is serialized. */
export async function bindOriginalPagedPublicSepoliaDefiRecoveryV8(receiver,retention){
 assert.equal(arguments.length,2);const r=originalReceiver(receiver),R=await import('../operations/recovery/sepolia-defi-retention-v8.mjs'),owned=await R.readOriginalSepoliaDefiRetentionBindingV8(retention);
 need(owned.runtime===receiver&&owned.uniswapTarget===r.uniswapTargetSystem&&owned.directory===resolve(owned.directory),'SEPOLIA_DEFI_ORIGINAL_RETENTION');
 const target=owned.uniswapTarget,T=await import('../operations/local/sepolia-uniswap-target-kernel-v4.mjs'),actual=T.readOriginalSepoliaUniswapTargetSourceBindingV4(receiver,target),locator=freeze({directory:owned.directory,credential:'ROOT_DOMAIN_PASSWORD_V8',binding:{chainId:'11155111',keysetId:r.s.keyset.keysetId,account:r.s.keyset.accounts[0].address,uniswapTargetPlanSHA256:target.planSHA256,parentPool:actual.parent.pool}});
 if(r.defiRecoveryLocator)assert.deepEqual(r.defiRecoveryLocator,locator,'SEPOLIA_DEFI_RETENTION_LOCATOR_CHANGED');r.defiRecoveryLocator=locator;return locator;
}
export async function reopenOriginalPagedPublicSepoliaDefiTargetV8(receiver,uniswapTarget,venue,protocol,retention,token){
 assert.equal(arguments.length,6);return originalDefiTargetV8(receiver,uniswapTarget,venue,protocol,retention,token,'reopen');
}
export async function resumeOriginalPagedPublicSepoliaDefiTargetV8(receiver,uniswapTarget,venue,protocol,retention,token){
 assert.equal(arguments.length,6);return originalDefiTargetV8(receiver,uniswapTarget,venue,protocol,retention,token,'resume');
}
export async function runOriginalPagedPublicSepoliaDefiMixedSourceV8(receiver,uniswapTarget,aaveTarget,morphoTarget,retention){
 assert.equal(arguments.length,5);return originalDefiMixedSourceV8(receiver,uniswapTarget,aaveTarget,morphoTarget,retention,null,'create');
}
export async function reopenOriginalPagedPublicSepoliaDefiMixedSourceV8(receiver,uniswapTarget,aaveTarget,morphoTarget,retention,token){
 assert.equal(arguments.length,6);return originalDefiMixedSourceV8(receiver,uniswapTarget,aaveTarget,morphoTarget,retention,token,'reopen');
}
export async function resumeOriginalPagedPublicSepoliaDefiMixedSourceV8(receiver,uniswapTarget,aaveTarget,morphoTarget,retention,token){
 assert.equal(arguments.length,6);return originalDefiMixedSourceV8(receiver,uniswapTarget,aaveTarget,morphoTarget,retention,token,'resume');
}
async function originalDefiMixedSourceV8(receiver,uniswapTarget,aaveTarget,morphoTarget,retention,token,mode){
 const r=originalReceiver(receiver);need(r.finalized&&r.sourceSigner&&r.uniswapTargetSystem===uniswapTarget&&r.defiTargets?.get('AAVE_STATIC')===aaveTarget&&r.defiTargets?.get('MORPHO_V2')===morphoTarget,'SEPOLIA_DEFI_MIXED_SAME_TARGETS');
 return serialized(r.s,async()=>{
  const R=await import('../operations/recovery/sepolia-defi-retention-v8.mjs'),owner=await R.readOriginalSepoliaDefiRetentionBindingV8(retention);need(owner.runtime===receiver&&owner.uniswapTarget===uniswapTarget,'SEPOLIA_DEFI_ORIGINAL_RETENTION');
  const M=await import('../operations/local/sepolia-defi-mixed-source-kernel-v8.mjs'),K=await import('../chains/public-testnet/key-store-v1.mjs');
  if(r.defiMixedSystem)return M.assertOriginalSepoliaDefiMixedSourceReadyV8(receiver,r.defiMixedSystem);
  let attempt=r.defiMixedAttempt;
  if(!attempt){const plan=mode==='create'?await M.prepareOriginalSepoliaDefiMixedSourceV8(receiver,uniswapTarget,aaveTarget,morphoTarget):await M[mode==='reopen'?'prepareOriginalSepoliaDefiMixedSourceReopenV8':'prepareOriginalSepoliaDefiMixedSourceResumeV8'](receiver,uniswapTarget,aaveTarget,morphoTarget,token);attempt={plan,step:null,next:0,retained:mode==='create'?0:M.readOriginalSepoliaDefiMixedSourceRetainedReceiptsV8(receiver,plan).length};r.defiMixedAttempt=attempt;}
  for(;;){
   current(r.s);const step=attempt.step??await M.readOriginalSepoliaDefiMixedSourceStepV8(receiver,attempt.plan);attempt.step=step;
   if(step.kind==='READY'){
    await(mode==='reopen'?K.inspectOriginalPublicSepoliaDefiMixedSourceFinalityV8:K.waitOriginalPublicSepoliaDefiMixedSourceFinalityV8)(r.sourceSigner,step.completion);await M.assertOriginalSepoliaDefiMixedSourceReadyV8(receiver,step.system);r.defiMixedSystem=step.system;return step.system;
   }
   if(mode==='create')await retention.publishMixedInitialization(attempt.plan);
   let receipt;
   if(mode==='reopen'||attempt.next<attempt.retained)receipt=await K.observeOriginalPublicSepoliaDefiMixedSourceInitializationV8(r.sourceSigner,step.token);
   else{try{receipt=await K.executeOriginalPublicSepoliaDefiMixedSourceInitializationV8(r.sourceSigner,step.token);}catch(error){if(error.message!=='SEPOLIA_DEFI_MIXED_ORIGINAL_SEND_PENDING')throw error;receipt=await K.waitOriginalPublicSepoliaDefiMixedSourceInitializationV8(r.sourceSigner,step.token);}}
   await M.advanceOriginalSepoliaDefiMixedSourceV8(receiver,attempt.plan,step.token,receipt);attempt.step=null;attempt.next++;
   if(mode==='create')await retention.publishMixedInitialization(attempt.plan);
  }
 });
}
async function originalDefiTargetV8(receiver,uniswapTarget,venue,protocol,retention,token,mode,initializationOnly=false){
 const r=originalReceiver(receiver);need(r.finalized&&r.sourceSigner&&r.uniswapTargetSystem===uniswapTarget,'SEPOLIA_DEFI_SAME_UNISWAP_TARGET');
 return serialized(r.s,async()=>{
  const R=await import('../operations/recovery/sepolia-defi-retention-v8.mjs'),owner=await R.readOriginalSepoliaDefiRetentionBindingV8(retention);need(owner.runtime===receiver&&owner.uniswapTarget===uniswapTarget,'SEPOLIA_DEFI_ORIGINAL_RETENTION');
  const K=await import('../chains/public-testnet/key-store-v1.mjs'),k=await defiTargetKernelV8(protocol),T=k.module,n=k.name;
  r.defiTargets??=new Map();r.defiAttempts??=new Map();if(r.defiTargets.has(protocol)){const system=r.defiTargets.get(protocol);T['assertOriginal'+n+'SepoliaTargetV4'](receiver,system);return system;}
  let attempt=r.defiAttempts.get(protocol);
  if(!attempt){
   const plan=mode==='create'?await T['prepareOriginal'+n+'SepoliaTargetV4'](receiver,uniswapTarget,venue,await receiver.nonce(receiver.accounts[0],'pending')):await T['prepareOriginal'+n+'SepoliaTarget'+(mode==='reopen'?'Reopen':'Resume')+'V8'](receiver,uniswapTarget,venue,token);
   const data=T['readOriginal'+n+'SepoliaTargetPlanV4'](receiver,plan);if(mode!=='create')K.assertOriginalPublicSepoliaDefiRetainedPlanV8(r.sourceSigner,data);
   attempt={plan,next:0,retained:mode==='create'?0:T['readOriginal'+n+'SepoliaTargetRetainedReceiptsV8'](receiver,plan).length,mode};r.defiAttempts.set(protocol,attempt);
   if(mode==='create')await retention.publishInitialization(protocol,plan);
  }
  for(let index=attempt.next;index<7;index++){
   current(r.s);const permit=T['issueOriginal'+n+'SepoliaInitializationV4'](receiver,attempt.plan,index);let receipt;
   if(mode==='reopen'||index<attempt.retained)receipt=await K.observeOriginalPublicSepoliaDefiTargetInitializationV8(r.sourceSigner,permit,protocol);
   else{try{receipt=await K.executeOriginalPublicSepoliaDefiTargetInitializationV8(r.sourceSigner,permit,protocol);}catch(error){if(error.message!=='SEPOLIA_DEFI_TARGET_ORIGINAL_SEND_PENDING')throw error;receipt=await K.waitOriginalPublicSepoliaDefiTargetInitializationV8(r.sourceSigner,permit,protocol);}}
   await T['advanceOriginal'+n+'SepoliaInitializationV4'](receiver,attempt.plan,permit,receipt.transactionHash);attempt.next=index+1;
   if(mode==='create')await retention.publishInitialization(protocol,attempt.plan);
  }
  if(initializationOnly)return freeze({profile:'ORIGINAL_SEPOLIA_DEFI_TARGET_INITIALIZED_V8',protocol,planSHA256:T['readOriginal'+n+'SepoliaTargetPlanV4'](receiver,attempt.plan).planSHA256,financialAcceptance:false});
  const system=await(mode==='reopen'?K.inspectOriginalPublicSepoliaDefiTargetFinalityV8:K.waitOriginalPublicSepoliaDefiTargetFinalityV8)(r.sourceSigner,attempt.plan,protocol);current(r.s);r.defiTargets.set(protocol,system);return system;
 });
}

/** A distinct four-rule Source reuses the original verifiers and occupies the
 * same ETH queue/sponsor journal. Repeating a warm call observes the exact
 * retained constructor token; it cannot reserve another set of nonce slots. */
export async function runOriginalPagedPublicSepoliaUniswapMixedSourceV4(receiver,target){
 assert.equal(arguments.length,2);const r=originalReceiver(receiver);need(r.finalized&&r.s.receiverBootstrap===null&&r.sourceSigner,'SEPOLIA_UNISWAP_MIXED_SOURCE_REQUIRED');return serialized(r.s,async()=>{
  originalReceiver(receiver);need(validateRecords(r.s).every(row=>['OBSERVED','ADVERSE'].includes(row.observation?.status)),'SEPOLIA_UNISWAP_MIXED_NATIVE_SOURCE_PENDING');const K=await import('../chains/public-testnet/key-store-v1.mjs'),M=await import('../operations/local/sepolia-uniswap-mixed-source-kernel-v4.mjs');
  if(r.uniswapMixedSystem){assert.strictEqual(r.uniswapMixedAttempt.target,target);return M.assertOriginalSepoliaUniswapMixedSourceReadyV4(receiver,r.uniswapMixedSystem);}
  if(r.uniswapMixedAttempt)assert.strictEqual(r.uniswapMixedAttempt.target,target);else r.uniswapMixedAttempt={target,plan:await M.prepareOriginalSepoliaUniswapMixedSourceV4(receiver,target),step:null};const attempt=r.uniswapMixedAttempt;
  for(;;){current(r.s);const step=attempt.step??await M.readOriginalSepoliaUniswapMixedSourceStepV4(receiver,attempt.plan);attempt.step=step;if(step.kind==='READY'){await K.waitOriginalPublicUniswapMixedSourceFinalityV4(r.sourceSigner,step.completion);await M.assertOriginalSepoliaUniswapMixedSourceReadyV4(receiver,step.system);originalReceiver(receiver);r.uniswapMixedSystem=step.system;attempt.step=null;return step.system;}
   let receipt;try{receipt=await K.executeOriginalPublicUniswapMixedSourceInitializationV4(r.sourceSigner,step.token);}catch(error){if(error.message!=='SEPOLIA_UNISWAP_MIXED_ORIGINAL_SEND_PENDING')throw error;receipt=await K.waitOriginalPublicUniswapMixedSourceInitializationV4(r.sourceSigner,step.token);}await M.advanceOriginalSepoliaUniswapMixedSourceV4(receiver,attempt.plan,step.token,receipt);attempt.step=null;
  }
 });
}

export async function executeOriginalPagedPublicUniswapDeliveryV4(native,provider,grant,context){
 assert.equal(arguments.length,4);const s=current(owners.get(native));return serialized(s,async()=>{
  current(s);need(s.receiverBootstrap===null,'PUBLIC_RECEIVER_BOOTSTRAP_ACTIVE');const ports=s.originalPorts;need(ports?.provider===provider,'PUBLIC_PAGED_ORIGINAL_PROVIDER_SEAM_REQUIRED');const original=await ports.readDispatch(grant);need(original.classification===native.profile&&original.variant==='UNISWAP_PUBLIC_V4'&&original.context===context,'PUBLIC_UNISWAP_ORIGINAL_PROVIDER_DISPATCH');
  const C=await import('./paged-public-uniswap-context-v4.mjs'),D=await import('../chains/public-testnet/sepolia-uniswap-paged-delivery-command-v4.mjs'),K=await import('../chains/public-testnet/key-store-v1.mjs'),handles=original.sourceHandles,c=C.readOriginalPagedPublicUniswapContextV4(context);need(handles&&handles.runtime===c.runtime&&handles.system===c.source&&handles.ready.id===original.id,'PUBLIC_UNISWAP_ORIGINAL_SOURCE_HANDLES');const r=originalReceiver(c.runtime);need(r.s===s&&r.finalized&&r.sourceSigner,'PUBLIC_UNISWAP_ORIGINAL_SIGNER');need(validateRecords(s).filter(row=>row.prepared.networkId==='ethereum-sepolia').every(row=>['OBSERVED','ADVERSE'].includes(row.observation?.status)),'PUBLIC_RUNTIME_SOURCE_PENDING');
  const command=await D.armOriginalPagedPublicUniswapDeliveryCommandV4(context,handles.journalToken,handles.graphClient,handles.ready,handles.permission,original.quote),p=await K.prepareOriginalPublicUniswapDeliveryV4(r.sourceSigner,command),prepared=freeze({profile:'ORIGINAL_PUBLIC_PAGED_UNISWAP_PREPARED_V4',networkId:'ethereum-sepolia',account:clone(s.keyset.accounts[0]),id:original.id,authorizationRoot:handles.ready.public.authorizationRoot,actionCommitment:original.quote.actionCommitment,recipient:original.destination,amountAtomic:handles.ready.action.amount,wireKeyCommitment:handles.ready.action.receiptKeyCommitment,feeAtomic:p.maximumFeeAtomic,transaction:clone(p.transaction),head:clone(original.head),delivery:clone(C.readOriginalPagedPublicUniswapPreparedDeliveryV4(context).delivery),source:clone(D.readOriginalPagedPublicUniswapDeliveryLocatorV4(c.runtime,command))});issuedPreparations.set(prepared,{runtime:native,digest:sha(prepared)});
  await ports.recordIntent(grant,prepared);current(s);const signed=await K.signOriginalPublicUniswapDeliveryV4(r.sourceSigner,p);current(s);await ports.recordSigned(grant,prepared,signed);await K.submitOriginalPublicUniswapDeliveryV4(r.sourceSigner,p);current(s);return freeze({id:original.id,nativeId:signed.nativeId,transactionSHA256:signed.transactionSHA256,status:'SUBMITTED'});
 });
}

export async function observeOriginalPagedPublicUniswapDeliveryV4(native,context,identity,jobId){
 assert.equal(arguments.length,4);const s=current(owners.get(native));return serialized(s,async()=>{
  const C=await import('./paged-public-uniswap-context-v4.mjs'),K=await import('../chains/public-testnet/key-store-v1.mjs'),W=await import('../chains/public-testnet/sepolia-uniswap-paged-delivery-codec-v4.mjs'),c=C.readOriginalPagedPublicUniswapContextV4(context),r=originalReceiver(c.runtime);need(r.s===s&&r.sourceSigner,'PUBLIC_UNISWAP_ORIGINAL_SIGNER');const row=await K.observeOriginalPublicUniswapDeliveryV4(r.sourceSigner,identity,jobId);if(!row.signed)return freeze({status:'UNKNOWN',finalized:false,nativeId:null});const wire=W.validateSepoliaUniswapPagedDeliveryWireV4(row.signed.nativeWire,row.command.delivery),inspection=await C.inspectOriginalPagedPublicUniswapDeliveryV4(context,wire.nativeId);if(inspection.status!=='FINALIZED')return freeze({status:'UNKNOWN',finalized:false,nativeId:wire.nativeId});const confirmations=(BigInt(inspection.finalizedHead.number)-BigInt(inspection.block.number)+1n).toString(),facts=freeze({profile:'ORIGINAL_PUBLIC_PAGED_UNISWAP_FACTS_V4',status:'OBSERVED',finalized:true,confirmations,blockId:inspection.block.hash.slice(2),blockHeight:BigInt(inspection.block.number).toString(),blockTimestamp:BigInt(inspection.block.timestamp).toString(),observedAt:BigInt((await c.runtime.block()).timestamp).toString(),feeAtomic:inspection.feeWei,nativeId:wire.nativeId,signed:clone(row.signed),wire,inspection});issuedFacts.set(facts,{runtime:native,actionCommitment:row.command.dispatch.actionCommitment,wireSHA256:row.signed.transactionSHA256});return facts;
 });
}

/** Target cold recovery observes the SAME seven protected signed rows. It
 * never calls a constructor executor or creates a fresh Target namespace. */
export async function reopenOriginalPagedPublicSepoliaUniswapTargetV4(receiver,parent,venue,targetToken){
 assert.equal(arguments.length,4);const r=originalReceiver(receiver);need(r.finalized&&r.s.retainedSource&&r.sourceSigner&&!r.uniswapTargetSystem&&!r.uniswapTargetAttempt,'PUBLIC_UNISWAP_TARGET_ORIGINAL_REOPEN');
 return serialized(r.s,async()=>{originalReceiver(receiver);const K=await import('../chains/public-testnet/key-store-v1.mjs'),T=await import('../operations/local/sepolia-uniswap-target-kernel-v4.mjs'),plan=await T.prepareOriginalSepoliaUniswapTargetReopenV4(receiver,parent,venue,targetToken),data=T.readOriginalSepoliaUniswapTargetPlanV4(receiver,plan);r.uniswapTargetAttempt={parent,venue,startNonce:BigInt(data.startNonce),plan};
  for(let index=0;index<7;index++){current(r.s);const token=index<5?T.issueOriginalSepoliaUniswapTargetConstructorV4(receiver,plan,index):T.issueOriginalSepoliaUniswapTargetRegistrationV4(receiver,plan,index-5),actual=await K.observeOriginalPublicUniswapTargetInitializationV4(r.sourceSigner,token);originalReceiver(receiver);if(index<5)await T.advanceOriginalSepoliaUniswapTargetConstructorV4(receiver,plan,token,actual.transactionHash);else await T.advanceOriginalSepoliaUniswapTargetRegistrationV4(receiver,plan,token,actual.transactionHash);}
  const system=await K.waitOriginalPublicUniswapTargetFinalityV4(r.sourceSigner,plan);originalReceiver(receiver);r.uniswapTargetSystem=system;return system;
 });
}

/** Reopen the SAME Mixed Source from its compiled lineage and signed rows. */
export async function reopenOriginalPagedPublicSepoliaUniswapMixedSourceV4(receiver,target,mixedSourceToken){
 assert.equal(arguments.length,3);const r=originalReceiver(receiver);need(r.finalized&&r.s.retainedSource&&r.sourceSigner&&r.uniswapTargetSystem===target&&!r.uniswapMixedSystem&&!r.uniswapMixedAttempt,'PUBLIC_UNISWAP_MIXED_ORIGINAL_REOPEN');
 return serialized(r.s,async()=>{originalReceiver(receiver);const K=await import('../chains/public-testnet/key-store-v1.mjs'),M=await import('../operations/local/sepolia-uniswap-mixed-source-kernel-v4.mjs'),plan=await M.prepareOriginalSepoliaUniswapMixedSourceReopenV4(receiver,target,mixedSourceToken),attempt={target,plan,step:null};r.uniswapMixedAttempt=attempt;
  for(;;){current(r.s);const step=attempt.step??await M.readOriginalSepoliaUniswapMixedSourceStepV4(receiver,plan);attempt.step=step;if(step.kind==='READY'){await K.waitOriginalPublicUniswapMixedSourceFinalityV4(r.sourceSigner,step.completion);await M.assertOriginalSepoliaUniswapMixedSourceReadyV4(receiver,step.system);originalReceiver(receiver);r.uniswapMixedSystem=step.system;attempt.step=null;return step.system;}const receipt=await K.observeOriginalPublicUniswapMixedSourceInitializationV4(r.sourceSigner,step.token);originalReceiver(receiver);await M.advanceOriginalSepoliaUniswapMixedSourceV4(receiver,plan,step.token,receipt);attempt.step=null;}
 });
}
/** The same protected ETH queue executes a reviewed private USDC exit. The
 * original account supplies its issued command; no caller transaction DTO. */
export async function executeOriginalPagedPublicUniswapWithdrawalV4(native,flatAccount,command){
 assert.equal(arguments.length,3);const s=current(owners.get(native));return serialized(s,async()=>{current(s);need(s.receiverBootstrap===null,'PUBLIC_RECEIVER_BOOTSTRAP_ACTIVE');const A=await import('../accounts/authority/device-sepolia-uniswap-flat-authority-v4.mjs'),T=await import('../operations/local/sepolia-uniswap-target-kernel-v4.mjs'),K=await import('../chains/public-testnet/key-store-v1.mjs'),handles=await A.readOriginalDeviceSepoliaUniswapFlatWithdrawalHandlesV4(flatAccount,command),r=originalReceiver(handles.runtime);need(r.s===s&&r.finalized&&r.sourceSigner,'PUBLIC_UNISWAP_ORIGINAL_SIGNER');const binding=T.readOriginalSepoliaUniswapTargetSourceBindingV4(handles.runtime,handles.system);need(binding.parent!==null&&handles.system.keysetId===s.keyset.keysetId&&handles.system.account===s.keyset.accounts[0].address,'PUBLIC_UNISWAP_W39_ORIGINAL_TARGET');need(validateRecords(s).filter(row=>row.prepared.networkId==='ethereum-sepolia').every(row=>['OBSERVED','ADVERSE'].includes(row.observation?.status)),'PUBLIC_RUNTIME_SOURCE_PENDING');const request=await T.readOriginalSepoliaUniswapFlatWithdrawalCommandV4(handles.runtime,command);current(s);return K.executeOriginalPublicUniswapFlatWithdrawalV4(r.sourceSigner,command,request.label,{from:request.from,to:request.to,data:request.data,value:BigInt(request.value)});});
}
/** Recovery only restores the right to request a fresh device approval. It
 * does not reset UNKNOWN or manufacture a financial command/signature. */
export async function recoverOriginalPagedPublicUniswapUnarmedWithdrawalV4(native,flatAccount,jobId){
 assert.equal(arguments.length,3);const s=current(owners.get(native));return serialized(s,async()=>{const A=await import('../accounts/authority/device-sepolia-uniswap-flat-authority-v4.mjs'),K=await import('../chains/public-testnet/key-store-v1.mjs'),binding=await A.readOriginalDeviceSepoliaUniswapFlatUnarmedWithdrawalV4(flatAccount,jobId),r=originalReceiver(binding.runtime);need(r.s===s&&r.sourceSigner,'PUBLIC_UNISWAP_ORIGINAL_SIGNER');const evidence=K.issueOriginalPublicUniswapWithdrawalNoAttemptV4(r.sourceSigner,binding.identity,binding.jobId,binding.calldataSHA256);current(s);return A.restoreOriginalDeviceSepoliaUniswapFlatUnarmedWithdrawalV4(flatAccount,jobId,evidence);});
}
