/** Two surviving account owners, two immutable asset pools and one owned-local
 * issuer/node lifetime. This is trusted host composition, not hostile-host
 * isolation, native private custody, privacy acceptance or restart recovery. */
import assert from 'node:assert/strict';
import {randomBytes,createHash} from 'node:crypto';
import {readFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {createOwnedCohortWalletRuntime,createPrivateCohortParticipantView} from '../wallet/custody/private-wallet-authority.mjs';
import {createPrivateWalletAuthority,createOwnedWalletOperationHost,PRIVATE_WALLET_PROFILE} from '../wallet/runtime/private-wallet-engine.mjs';
import {deployPrivateAssetPool,PRIVATE_ASSET_NATIVE} from '../notes/private-asset-runtime.mjs';
import {privateAccountNoteSnapshot} from './private-account-runtime.mjs';
import {validatePrivateAccountRegistry} from './private-account-state.mjs';
import {applyPrivateWalletCapacityTransition} from '../wallet/resources/private-wallet-capacity.mjs';
import {assertPrivateSnapshotCanonical} from '../wallet/runtime/private-wallet-runtime.mjs';
import {captureAssemblyEvmReceipt} from '../assembly/private-assembly-evm-audit.mjs';
import {projectRoot} from '../chains/shared/runtime-harness.mjs';
import {satsFromBTC} from '../native/native-bitcoin.mjs';

export const SHARED_ACCOUNT_INITIAL_PALT_SUPPLY=1_000_000_000n;
export const SHARED_ACCOUNT_OWNER1_PALT_PREFUND=500_000_000n;
const sha=x=>createHash('sha256').update(x).digest('hex');
const strip=x=>x.replace(/^0x/,'');
const clone=x=>structuredClone(x);
const owner=n=>assert.ok(n===0||n===1,'PC26_OWNER_INDEX');
const safe=e=>/^([A-Z][A-Z0-9_]{1,100})(?:\n|$)/.exec(e?.message??'')?.[1]??'PC26_ACCOUNT_OPERATION_FAILED';
const freeze=x=>{for(const v of Object.values(x))if(v&&typeof v==='object')freeze(v);return Object.freeze(x);};
const binding=r=>clone(Object.fromEntries(['requestId','assetId','intentId','operationId','kind','terms'].map(k=>[k,r[k]])));
async function loadSources(){
 const{loadWalletVerifierSources}=await import('../../../../experiments/engine/private-core-proof/wallet-notes/prover.mjs');
 const sources={...await loadWalletVerifierSources()};
 for(const mode of ['reserve','withdraw','sol_ready','btc_ready','fulfill','refund']){
  const dir=['reserve','withdraw'].includes(mode)?'native-notes':'owner-independent';
  const content=await readFile(join(projectRoot,'experiments/private-core-proof',dir,'.local/prepared',mode+'.sol'),'utf8');
  sources[mode]={content,sha256:sha(content)};
 }
 return sources;
}
const production={createBase:createOwnedCohortWalletRuntime,deployPool:deployPrivateAssetPool,loadSources,createAuthority:createPrivateWalletAuthority,createHost:createOwnedWalletOperationHost,participantView:createPrivateCohortParticipantView,captureReceipt:captureAssemblyEvmReceipt};
export const createOwnedSharedAccountRuntime=options=>createShared(options,production);
/** Trusted test injection is not exposed through account IPC or HTTP. */
export const createOwnedSharedAccountRuntimeForTest=(options,deps)=>createShared(options,{...production,...deps});

async function createShared({groupId,signal,onProgress=async()=>{},guard:outerGuard=()=>{}},deps){
 assert.match(groupId,/^[0-9a-f]{32}$/,'PC26_GROUP_ID');
 let base,controller,closed=false,closing=false,closePromise,ordinaryBusy=false,lease=null;
 const pools=new Map(),owners=new Map(),reservedOwners=new Set(),accountIds=new Set(),admissions=new Map();
 const live=()=>{outerGuard();assert.ok(!closed&&!closing&&!signal?.aborted,'PC26_SHARED_ACCOUNT_UNAVAILABLE');base?.guard();};
 const noCohort=()=>assert.ok(!controller?.status().active,'PC26_COHORT_STILL_EXECUTING');
 const active=(index,operationId)=>{live();assert.equal(controller?.isOperationActive(index,operationId),true,'PC26_ENROLLED_ACTIVE_OPERATION_REQUIRED');};
 const mutate=async(label,work)=>{live();return base.mutate(label,async()=>{assert.equal(lease,null,'PC26_SHARED_MUTATION_BUSY');lease=label;try{return await work();}finally{lease=null;}});};
 const ordinary=async work=>{live();noCohort();assert.equal(ordinaryBusy,false,'PC26_ACCOUNT_ACTION_BUSY');ordinaryBusy=true;try{return await work();}finally{ordinaryBusy=false;}};
 const getOwner=index=>{owner(index);const o=owners.get(index);assert.ok(o&&!o.closed,'PC26_ORIGINAL_OWNER_REQUIRED');o.guard();return o;};
 const getEntry=(index,assetId)=>{const o=getOwner(index),entry=o.assets.get(assetId);assert.ok(entry,'ACCOUNT_ASSET_UNKNOWN');return entry;};
 const original=(index,r)=>{const o=getOwner(index),old=o.requests.get(r.requestId);assert.ok(old,'PC26_ORIGINAL_REQUEST_REQUIRED');assert.deepEqual(binding(r),old,'PC26_ORIGINAL_REQUEST_CHANGED');return old;};
 async function archived(entry){
  const task=entry.archiveQueue.then(async()=>{for(const receipt of entry.pool.receipts.slice(entry.receiptCursor)){await base.audit('shared-asset-evm',await deps.captureReceipt(base.runtime,receipt));entry.receiptCursor++;}});
  entry.archiveQueue=task.catch(()=>{});return task;
 }
 async function admission(index,r,{waiting=false}={}){
  live();owner(index);assert.equal(r.kind,'payment','PC26_PAYMENT_REQUIRED');original(index,r);
  const entry=getEntry(index,r.assetId),shared=pools.get(r.assetId);
  const a=await entry.authority.privatePaymentAdmission({intentId:r.intentId,operationId:r.operationId});
  assert.deepEqual({intentId:a.intentId,operationId:a.operationId,kind:a.kind,terms:a.terms},{intentId:r.intentId,operationId:r.operationId,kind:r.kind,terms:r.terms},'PC26_ORIGINAL_REQUEST_CHANGED');
  assert.equal(a.state,waiting?'EXECUTING':'PREPARED','PC26_ORIGINAL_ADMISSION_REQUIRED');
  for(const key of ['pool','scope','policy'])assert.equal(a.identity[key],shared.registry[key],'PC26_ADMISSION_POOL_BINDING');
  assert.deepEqual(a.identity.asset,shared.descriptor,'PC26_ADMISSION_ASSET_BINDING');
  assert.equal(a.identity.issuerLifetime,base.identity.issuerLifetime,'PC26_ADMISSION_ISSUER_BINDING');
  assert.equal(a.identity.walletId,entry.walletId,'PC26_ADMISSION_OWNER_BINDING');
  assert.match(a.inputCommitment,/^[0-9a-f]{64}$/,'PC26_INPUT_COMMITMENT');
  assert.ok(BigInt(a.inputValue)>BigInt(r.terms.budget),'PC26_INPUT_VALUE');
  const old=admissions.get(r.operationId);
  if(old){assert.equal(old.ownerIndex,index,'PC26_REQUEST_OWNER_CHANGED');assert.deepEqual(old.request,binding(r),'PC26_ORIGINAL_REQUEST_CHANGED');assert.equal(a.inputCommitment,old.inputCommitment,'PC26_ORIGINAL_INPUT_CHANGED');assert.equal(a.inputValue,old.inputValue,'PC26_ORIGINAL_INPUT_CHANGED');}
  else{assert.equal(waiting,false,'PC26_ORIGINAL_ADMISSION_REQUIRED');admissions.set(r.operationId,{ownerIndex:index,request:freeze(binding(r)),inputCommitment:a.inputCommitment,inputValue:a.inputValue,phase:'ADMITTED',executing:false});}
  return a;
 }
 async function validateAdmission(index,r){
  assert.equal(r.state,'PREPARED','PC26_ORIGINAL_ADMISSION_REQUIRED');
  await admission(index,r);return clone(r);
 }
 async function validateRound({roundNumber,assetId,requests}){
  live();assert.equal(lease,'cohort-reservation','PC26_RESERVATION_LEASE_REQUIRED');
  assert.ok(Array.isArray(requests)&&requests.length===2,'PC26_PAIR_REQUIRED');
  const entry=pools.get(assetId);assert.ok(entry,'ACCOUNT_ASSET_UNKNOWN');
  // Both engines must be parked at their original host.prepare gate. Nothing
  // in this wait writes custody or starts a proof. Cancellation/failure ends it.
  for(const [index,r]of requests.entries()){
   assert.equal(r.assetId,assetId,'PC26_ASSET_MISMATCH');
   while(admissions.get(r.operationId)?.phase!=='WAITING_FOR_PREPARE'){
    active(index,r.operationId);const a=admissions.get(r.operationId);
    assert.ok(a&&!['FAILED','PREPARING','COMPLETED'].includes(a.phase),'PC26_ORIGINAL_ADMISSION_REQUIRED');
    await new Promise(resolve=>setTimeout(resolve,20));
   }
  }
  const reads=[];
  for(const [index,r]of requests.entries()){active(index,r.operationId);reads.push(await admission(index,r,{waiting:true}));}
  assert.notEqual(reads[0].inputCommitment,reads[1].inputCommitment,'PC26_DISTINCT_OWNER_INPUTS_REQUIRED');
  assert.notEqual(reads[0].identity.walletId,reads[1].identity.walletId,'PC26_DISTINCT_OWNER_CUSTODY_REQUIRED');
  const snapshot=await entry.pool.snapshot();
  for(const read of reads)assert.deepEqual(read.snapshot,privateAccountNoteSnapshot(snapshot),'PC26_PAIR_SNAPSHOT_CHANGED');
  assert.equal(snapshot.assetDeficit,'0','PC26_ASSET_BACKING_DEFICIT');
  assert.ok(BigInt(snapshot.assetBalance)>=BigInt(snapshot.backedAmount),'PC26_ASSET_BACKING_DEFICIT');
  assert.ok(reads.reduce((n,r)=>n+BigInt(r.inputValue),0n)<=BigInt(snapshot.backedAmount),'PC26_COMBINED_INPUT_BACKING');
  applyPrivateWalletCapacityTransition(applyPrivateWalletCapacityTransition(snapshot,'reserve_from_note'),'reserve_from_note');
  await assertPrivateSnapshotCanonical(base.runtime,snapshot);
  for(const [index,r]of requests.entries())active(index,r.operationId);
  return{roundNumber,assetId,requestIds:requests.map(r=>r.requestId),samePool:true,distinctOwnerNotes:true,capacityAvailable:true};
 }
 async function createOwnerRuntime(index,{accountId,signal:ownerSignal,onProgress:ownerProgress=async()=>{},guard:ownerOuterGuard=()=>{}}){
  owner(index);assert.match(accountId,/^[0-9a-f]{32}$/,'PC26_ACCOUNT_ID');
  return ordinary(async()=>{
   assert.ok(!reservedOwners.has(index)&&!accountIds.has(accountId),'PC26_ORIGINAL_OWNER_REQUIRED');reservedOwners.add(index);accountIds.add(accountId);
   const stop=new AbortController(),combined=AbortSignal.any([stop.signal,...[signal,ownerSignal].filter(Boolean)]);
   const o={index,accountId,assets:new Map(),requests:new Map(),btcAddresses:new Set(),closed:false,running:new Set(),stop};
   const ownerGuard=()=>{live();ownerOuterGuard();assert.ok(!o.closed&&!combined.aborted,'PC26_OWNER_UNAVAILABLE');};o.guard=ownerGuard;
   const participant=await deps.participantView(base,{ownerIndex:index,walletId:accountId}),local=participant.local;
   const runtime=Object.freeze({...participant.runtime,btc:async(method,args,wallet)=>{
    ownerGuard();const value=await participant.runtime.btc(method,args,wallet);
    if(method==='getnewaddress'&&wallet==='m9-recipient'){
     assert.ok(typeof value==='string'&&value.length<128&&o.btcAddresses.size<64,'PC26_BTC_DESTINATION_BOUND');
     assert.ok(![...owners.values()].some(peer=>peer.btcAddresses.has(value)),'PC26_DISTINCT_BTC_DESTINATIONS');
     o.btcAddresses.add(value);await base.audit('owner-native-destination',{ownerIndex:index,accountId,address:value,trust:'COMMON_OWNED_NATIVE_WALLET_OBSERVATION_ONLY'});
    }
    return value;
   }});
   const signalCancel=()=>{if(controller?.status().active)void Promise.resolve().then(()=>controller.cancel(index)).catch(()=>{});};combined.addEventListener('abort',signalCancel,{once:true});
   try{
    for(const [assetId,common]of pools){
     ownerGuard();const walletId=randomBytes(16).toString('hex'),assetLocal=join(local,'assets',assetId);await mkdir(assetLocal,{recursive:true,mode:0o700});
     const identity=freeze({...base.identity,walletId,pool:strip(common.pool.address),scope:strip(common.pool.scope),deploymentHash:sha(JSON.stringify(common.pool.deployments)),asset:common.descriptor});
     const notePool=Object.freeze({...common.pool,snapshot:async block=>privateAccountNoteSnapshot(await common.pool.snapshot(block))});
     const adapter=Object.freeze({descriptor:common.descriptor,balance:common.pool.assetBalance,backingBalance:async block=>BigInt((await common.pool.snapshot(block)).backedAmount),fundingTransactionValue:common.pool.fundingTransactionValue,beforeDeposit:common.pool.beforeDeposit});
     const entry={walletId,executingOperationId:null};
     const view=Object.create(null);
     for(const key of Object.keys(participant))if(!['clock','runtime','local','pool','identity','close','privateState','guard','mutate','archiveReceipts'].includes(key))view[key]=participant[key];
     Object.assign(view,{runtime,local:assetLocal,pool:notePool,identity,assetAdapter:adapter,guard:ownerGuard,close:async()=>{},archiveReceipts:()=>archived(common),
      isPaymentAdmissionSafe:operationId=>admissions.get(operationId)?.ownerIndex===index&&admissions.get(operationId)?.phase==='WAITING_FOR_PREPARE'&&controller?.isOperationActive(index,operationId)===true&&lease==='cohort-reservation',
      assertPaymentExposure:operationId=>{ownerGuard();active(index,operationId);},
      mutate:async(label,work)=>{ownerGuard();if(label==='wallet-payment'){active(index,entry.executingOperationId);return work();}noCohort();return mutate(label,work);},
      privateState:async()=>{ownerGuard();const snapshot=await common.pool.snapshot();return{identity:{...identity},snapshot:privateAccountNoteSnapshot(snapshot),balance:snapshot.backedAmount};},
     });Object.defineProperty(view,'clock',{enumerable:true,get:()=>base.clock});Object.freeze(view);
     const createHost=async(context,shared,custody,terms)=>{
      active(index,context.operationId);const admitted=admissions.get(context.operationId);
      assert.ok(admitted&&admitted.ownerIndex===index,'PC26_ORIGINAL_ADMISSION_REQUIRED');assert.equal(context.inputCommitment,admitted.inputCommitment,'PC26_ORIGINAL_INPUT_CHANGED');
      const duringExecution=()=>{context.guard();ownerGuard();if(admitted.executing)active(index,context.operationId);};
      // A cancelled cohort must not poison the original host's lifetime guard:
      // that guard also protects retained refund/withdrawal recovery. Keep
      // cancellation on exposure boundaries and the scheduling wrappers.
      const guardedContext={...context,guard:()=>{context.guard();ownerGuard();},beforeEvm:async(...args)=>{duringExecution();await context.beforeEvm(...args);duringExecution();},beforeNative:async(...args)=>{duringExecution();await context.beforeNative(...args);duringExecution();},submitSpend:async(...args)=>{duringExecution();return context.submitSpend(...args);}};
      const host=await deps.createHost(guardedContext,shared,custody,terms);
      const preflight=new Proxy(host,{get(target,key){if(key==='prepare')return async(...args)=>{duringExecution();assert.equal(admitted.phase,'WAITING_FOR_PREPARE','PC26_ADMISSION_PHASE');admitted.phase='PREPARING';return target.prepare(...args);};return Reflect.get(target,key,target);}});
      const wrapped=controller.wrapOperationHost(index,context.operationId,preflight);
      return new Proxy(wrapped,{get(target,key){if(key==='prepare')return async(...args)=>{duringExecution();admitted.phase='WAITING_FOR_PREPARE';return target.prepare(...args);};return Reflect.get(target,key,target);}});
     };
     entry.authority=deps.createAuthority({walletId,profile:PRIVATE_WALLET_PROFILE,signal:combined,onCheckpoint:async summary=>{await base.audit('owner-asset-checkpoint',{ownerIndex:index,assetId,summary});await ownerProgress({progressCode:summary.progressCode,assetId,phase:summary.phase});}},{createRuntime:async()=>view,createOperationHost:createHost});
     entry.view=view;o.assets.set(assetId,entry);await entry.authority.action('open');
    }
    owners.set(index,o);
   }catch(error){stop.abort();for(const entry of o.assets.values())await entry.authority.abort().catch(()=>{});o.closed=true;throw error;}
   async function snapshot(previous={assets:[],nativeHoldings:[]}){
    ownerGuard();const assets=[];
    for(const a of registry){
     try{const entry=o.assets.get(a.assetId),privateView=await entry.authority.privateAssetStatus(),s=await pools.get(a.assetId).pool.snapshot();assert.equal(privateView.asset.identity,a.assetIdentity,'ACCOUNT_ASSET_STATUS_BINDING');await assertPrivateSnapshotCanonical(base.runtime,s);
      assets.push({assetId:a.assetId,scope:a.scope,observation:'LIVE',observedAt:Date.now(),blockNumber:BigInt(s.blockNumber).toString(),blockHash:strip(s.blockHash),available:privateView.availableBaseUnits,pending:privateView.pendingBaseUnits,unavailable:privateView.unavailableBaseUnits,positions:privateView.notes.map(n=>({id:n.id,type:n.type,state:n.state,amountBaseUnits:n.amountBaseUnits,operationId:n.operationId})),backing:{held:s.assetBalance,liabilities:s.backedAmount,surplus:s.assetSurplus,deficit:s.assetDeficit},errorCode:null});
     }catch(error){const old=previous.assets.find(p=>p.assetId===a.assetId);assets.push(old?{...old,observation:'UNAVAILABLE',errorCode:safe(error)}:{assetId:a.assetId,scope:a.scope,observation:'UNAVAILABLE',observedAt:0,blockNumber:'0',blockHash:'0'.repeat(64),available:'0',pending:'0',unavailable:'0',positions:[],backing:{held:'0',liabilities:'0',surplus:'0',deficit:'0'},errorCode:safe(error)});}
    }
    const nativeHoldings=[];
    for(const chain of ['SOLANA','BITCOIN']){
     const genesis=chain==='SOLANA'?base.identity.solanaGenesis:base.identity.bitcoinGenesis,id=sha(Buffer.from(chain+genesis+accountId));
     let h={id,chain,genesis,symbol:chain==='SOLANA'?'SOL':'BTC',decimals:chain==='SOLANA'?9:8,amountBaseUnits:'0',observedAt:0,anchor:'',observation:'UNAVAILABLE',spendability:'OBSERVATION_ONLY',trust:'TRUSTED_LOCAL_RPC_NOT_PRIVATE_NOTE_BACKING',errorCode:null};
     try{
      // Recipient views deliberately omit arbitrary RPC. The shared host owns
      // this read capability; the destination remains the fixed owner binding.
      if(chain==='SOLANA'){const b=await base.solana.readPublic('getBalance',[participant.solana.recipient,{commitment:'finalized'}]);assert.ok(Number.isSafeInteger(b.value)&&b.value>=0&&Number.isSafeInteger(b.context.slot)&&b.context.slot>=0,'ACCOUNT_SOL_BALANCE');h={...h,amountBaseUnits:String(b.value),anchor:String(b.context.slot)};}
      else{const before=await base.runtime.btc('getbestblockhash');let amount=0n;
       if(o.btcAddresses.size){const rows=await base.runtime.btc('listunspent',[6,9999999,[...o.btcAddresses],true,{maximumCount:4097}],'m9-recipient');assert.ok(Array.isArray(rows)&&rows.length<=4096,'PC26_BTC_OBSERVATION_BOUND');const seen=new Set();for(const row of rows){assert.ok(o.btcAddresses.has(row.address)&&Number.isSafeInteger(row.confirmations)&&row.confirmations>=6,'PC26_BTC_OWNER_DESTINATION');const key=row.txid+':'+row.vout;assert.ok(!seen.has(key),'PC26_BTC_DUPLICATE_UTXO');seen.add(key);amount+=satsFromBTC(row.amount);}}
       assert.equal(await base.runtime.btc('getbestblockhash'),before,'ACCOUNT_BTC_TIP_CHANGED');h={...h,amountBaseUnits:amount.toString(),anchor:before};
      }
      h={...h,observedAt:Date.now(),observation:'LIVE'};
     }catch(error){h={...(previous.nativeHoldings.find(p=>p.id===id)??h),observation:'UNAVAILABLE',errorCode:safe(error)};}nativeHoldings.push(h);
    }
    return{assets,nativeHoldings};
   }
   const track=async work=>{const pending=Promise.resolve().then(work);o.running.add(pending);try{return await pending;}finally{o.running.delete(pending);}};
   const result=Object.freeze({registry,local,lifetime:base.identity.issuerLifetime,guard:ownerGuard,snapshot,
    prepare:r=>track(()=>ordinary(async()=>{ownerGuard();const entry=getEntry(index,r.assetId),old=o.requests.get(r.requestId);if(old)assert.deepEqual(binding(r),old,'PC26_ORIGINAL_REQUEST_CHANGED');await entry.authority.action('prepareIntent',{intentId:r.intentId,kind:r.kind,terms:r.terms});o.requests.set(r.requestId,freeze(binding(r)));})),
    execute:r=>track(async()=>{ownerGuard();original(index,r);const entry=getEntry(index,r.assetId);
     const work=()=>entry.authority.action('execute',{intentId:r.intentId,operationId:r.operationId});
     if(r.kind!=='payment')return ordinary(work);
     active(index,r.operationId);assert.equal(ordinaryBusy,false,'PC26_ACCOUNT_ACTION_BUSY');const a=admissions.get(r.operationId);assert.ok(a&&a.ownerIndex===index&&a.phase==='ADMITTED','PC26_ORIGINAL_ADMISSION_REQUIRED');
     entry.executingOperationId=r.operationId;a.executing=true;
     try{const value=await work();a.phase='COMPLETED';return value;}catch(error){a.phase='FAILED';throw error;}finally{a.executing=false;entry.executingOperationId=null;}
    }),
    reconcile:r=>track(()=>ordinary(async()=>{ownerGuard();original(index,r);const entry=getEntry(index,r.assetId),view=await entry.authority.privateAssetStatus(),intent=view.intents.find(i=>i.intentId===r.intentId);assert.ok(intent,'ACCOUNT_ORIGINAL_INTENT_REQUIRED');assert.deepEqual({kind:intent.kind,terms:intent.terms},{kind:r.kind,terms:r.terms},'ACCOUNT_INTENT_CHANGED');if(intent.state!=='COMPLETED')await entry.authority.action('reconcile',{intentId:r.intentId,operationId:r.operationId});assert.equal((await entry.authority.privateAssetStatus()).intents.find(i=>i.intentId===r.intentId)?.state,'COMPLETED','ACCOUNT_OUTCOME_UNKNOWN');return{state:'CONFIRMED'};})),
    close:()=>ordinary(async()=>{ownerGuard();for(const entry of o.assets.values()){const v=await entry.authority.privateAssetStatus();assert.equal(v.availableBaseUnits,'0','ACCOUNT_RETAINED_BACKING');assert.equal(v.pendingBaseUnits,'0','ACCOUNT_RETAINED_BACKING');assert.equal(v.unavailableBaseUnits,'0','ACCOUNT_RETAINED_BACKING');assert.ok(v.notes.every(n=>['WITHDRAWN','SPENT','DISCARDED'].includes(n.state)),'ACCOUNT_RETAINED_BACKING');assert.ok(v.intents.every(i=>!['EXECUTING','UNKNOWN'].includes(i.state)),'PC26_OWNER_UNRESOLVED_OPERATION');}for(const entry of o.assets.values())await entry.authority.abort();o.closed=true;combined.removeEventListener('abort',signalCancel);}),
    async abort(){if(o.closed)return;stop.abort();signalCancel();await Promise.allSettled([...o.running]);for(const entry of o.assets.values())await entry.authority.abort().catch(()=>{});o.closed=true;combined.removeEventListener('abort',signalCancel);},
    audit:(label,value)=>base.audit('owner-account-'+label,{ownerIndex:index,value}),
    async inspect(){return{ownerIndex:index,accountId,closed:o.closed,assetWalletIds:[...o.assets].map(([assetId,e])=>({assetId,walletId:e.walletId})),native:{solRecipient:participant.solana.recipient,btcRegisteredDestinations:o.btcAddresses.size},pools:await Promise.all([...pools].map(async([assetId,e])=>({assetId,snapshot:await e.pool.snapshot()})))};},
   });o.runtime=result;return result;
  });
 }
 let registry;
 try{
  base=await deps.createBase({walletId:groupId,signal,publish:onProgress,guard:outerGuard});live();
  assert.equal(base.runtime.accounts.length,9,'PC26_NINE_FIXED_ACCOUNTS');
  const sources=await deps.loadSources(),rows=[];
  for(const kind of ['NATIVE','ERC20']){
   live();await onProgress({progressCode:kind==='NATIVE'?'DEPLOYING_SHARED_ACCOUNT_ETH_POOL':'DEPLOYING_SHARED_ACCOUNT_TOKEN_POOL'});
   const pool=await base.heavy('deploy-shared-account-'+kind.toLowerCase(),()=>deps.deployPool(base.runtime,{sources,policy:base.pool.policy,deploymentDomain:'0x'+randomBytes(32).toString('hex'),solAuthority:base.cohortBindings.authorities.sol,btcAuthority:base.cohortBindings.authorities.btc,...(kind==='NATIVE'?{asset:PRIVATE_ASSET_NATIVE}:{initialSupply:SHARED_ACCOUNT_INITIAL_PALT_SUPPLY}),onDeployment:d=>base.audit('shared-asset-deployment',d)}));
   const descriptor=freeze({kind,address:strip(pool.asset),codeHash:strip(pool.assetCodeHash),identity:strip(pool.assetIdentity)}),assetId=sha(Buffer.from(base.identity.evmGenesis+descriptor.identity));
   const row=freeze({assetId,kind,symbol:kind==='NATIVE'?'ETH':'PALT',decimals:kind==='NATIVE'?18:6,chainId:base.identity.chainId,genesis:base.identity.evmGenesis,pool:strip(pool.address),scope:strip(pool.scope),policy:strip(pool.policy),token:descriptor.address,codeHash:descriptor.codeHash,assetIdentity:descriptor.identity,custody:'ONCHAIN_NOTE_POOL',trust:'PINNED_LOCAL_CONTRACT_AND_TRUSTED_NATIVE_ISSUER'});
   const entry={pool,descriptor,registry:row,receiptCursor:0,archiveQueue:Promise.resolve()};pools.set(assetId,entry);rows.push(row);
   if(kind==='ERC20')await mutate('shared-account-explicit-palt-fixture',async()=>{
    const [from,to]=base.runtime.accounts,before=await Promise.all([pool.assetBalance(from),pool.assetBalance(to)]);
    assert.deepEqual(before,[SHARED_ACCOUNT_INITIAL_PALT_SUPPLY,0n],'PC26_FIXED_INITIAL_TOKEN_SUPPLY');
    assert.equal(BigInt(await pool.assetCall('totalSupply()')),SHARED_ACCOUNT_INITIAL_PALT_SUPPLY,'PC26_FIXED_INITIAL_TOKEN_SUPPLY');
    const receipt=await pool.send('explicit fixture PALT transfer owner0 to owner1',{from,to:pool.asset,data:pool.assetData('transfer(address,uint256)',[to,SHARED_ACCOUNT_OWNER1_PALT_PREFUND]),value:'0x0'});
    assert.deepEqual(await Promise.all([pool.assetBalance(from),pool.assetBalance(to)]),[before[0]-SHARED_ACCOUNT_OWNER1_PALT_PREFUND,before[1]+SHARED_ACCOUNT_OWNER1_PALT_PREFUND],'PC26_EXACT_TOKEN_PREFUND');
    assert.equal(BigInt(await pool.assetCall('totalSupply()')),SHARED_ACCOUNT_INITIAL_PALT_SUPPLY,'PC26_FIXED_INITIAL_TOKEN_SUPPLY');
    await base.audit('explicit-owner1-palt-fixture',{kind:'EXPLICIT_LOCAL_INITIAL_SUPPLY_TRANSFER',from,to,asset:pool.asset,amountBaseUnits:SHARED_ACCOUNT_OWNER1_PALT_PREFUND.toString(),initialSupply:SHARED_ACCOUNT_INITIAL_PALT_SUPPLY.toString(),transactionHash:receipt.transactionHash});
   });
   await archived(entry);
  }
  validatePrivateAccountRegistry(rows);registry=freeze(rows);
  return Object.freeze({registry,local:base.local,lifetime:base.identity.issuerLifetime,createOwnerRuntime,mutate,validateAdmission,validateRound,
   bindCohort(value){live();assert.equal(controller,undefined,'PC26_COHORT_ALREADY_BOUND');assert.ok(value&&['status','isOperationActive','wrapOperationHost','cancel'].every(k=>typeof value[k]==='function'),'PC26_COHORT_CONTROLLER_REQUIRED');assert.equal(owners.size,2,'PC26_TWO_ORIGINAL_OWNERS_REQUIRED');controller=value;},
   async assertRoundResolved({round}){live();noCohort();assert.equal(lease,'cohort-verify-recovery','PC26_RECOVERY_LEASE_REQUIRED');
    // No claim that a failed signed authorization has been revoked merely
    // because counts are zero. Only never-prepared originals can be reset.
    for(const r of round.requests){const a=admissions.get(r.operationId);assert.ok(a&&a.phase==='ADMITTED'&&!a.executing,'PC26_UNRESOLVED_ORIGINAL_OBLIGATIONS');await admission(a.ownerIndex,{...r,state:'PREPARED'});}
    for(const e of pools.values()){const s=await e.pool.snapshot();assert.equal(s.liveReservations,0,'PC26_UNRESOLVED_ORIGINAL_OBLIGATIONS');assert.equal(s.assetDeficit,'0','PC26_ASSET_BACKING_DEFICIT');}
    return{roundNumber:round.roundNumber,noUnresolvedObligations:true,noUsableAuthorizations:true};
   },
   async inspect(){return{closed,ownerCount:owners.size,trackedAssetPoolCount:pools.size,bootstrapPool:base.pool.address,observerModel:base.cohortBindings.observerModel,pools:await Promise.all([...pools].map(async([assetId,e])=>({assetId,snapshot:await e.pool.snapshot()}))),owners:await Promise.all([...owners.values()].map(o=>o.runtime.inspect()))};},
   async close(){live();noCohort();assert.equal(ordinaryBusy,false,'PC26_ACCOUNT_ACTION_BUSY');for(const e of pools.values()){const s=await e.pool.snapshot();assert.equal(s.backedAmount,'0','ACCOUNT_RETAINED_BACKING');assert.equal(s.liveReservations,0,'ACCOUNT_RETAINED_BACKING');assert.equal(s.liveOutputNotes,0,'ACCOUNT_RETAINED_BACKING');}for(const o of owners.values())if(!o.closed)await o.runtime.close();closing=true;await base.close();closed=true;closing=false;},
   abort(){if(closePromise)return closePromise;closing=true;closePromise=(async()=>{for(const o of owners.values())o.stop.abort();await Promise.allSettled([...owners.values()].map(o=>o.runtime.abort()));try{await base.close();}finally{closed=true;closing=false;}})();return closePromise;},
  });
 }catch(error){for(const o of owners.values())await o.runtime?.abort().catch(()=>{});await base?.close().catch(()=>{});throw error;}
}
