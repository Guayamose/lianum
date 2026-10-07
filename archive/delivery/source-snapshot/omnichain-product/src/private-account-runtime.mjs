/** Fixed owned-local account adapters. This creates no externally configured
 * network/asset. Two pools have independent real backing and proof domains;
 * the shared native issuer remains a disclosed trusted source of foreign facts. */
import assert from 'node:assert/strict';
import {randomBytes,createHash} from 'node:crypto';
import {readFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {createOwnedWalletRuntime} from './private-wallet-authority.mjs';
import {createPrivateWalletAuthority,PRIVATE_WALLET_PROFILE} from './private-wallet-engine.mjs';
import {deployPrivateAssetPool,PRIVATE_ASSET_NATIVE} from './private-asset-runtime.mjs';
import {captureAssemblyEvmReceipt} from './private-assembly-evm-audit.mjs';
import {assertPrivateSnapshotCanonical} from './private-wallet-runtime.mjs';
import {projectRoot} from './chains/runtime-harness.mjs';
import {satsFromBTC} from './native-bitcoin.mjs';
import {validatePrivateAccountRegistry} from './private-account-state.mjs';
const sha=x=>createHash('sha256').update(x).digest('hex');
const strip=x=>x.replace(/^0x/,'');
const safe=e=>{const m=/^([A-Z][A-Z0-9_]{1,100})(?:\n|$)/.exec(e?.message??'');return m?.[1]??(/^[A-Z][A-Z0-9_]{1,100}$/.test(e?.code??'')?e.code:'ACCOUNT_OPERATION_FAILED');};
async function verifierSources(){const{loadWalletVerifierSources}=await import('../experiments/private-core-proof/wallet-notes/prover.mjs');const sources={...await loadWalletVerifierSources()};for(const mode of ['reserve','withdraw','sol_ready','btc_ready','fulfill','refund']){const dir=['reserve','withdraw'].includes(mode)?'native-notes':'owner-independent',content=await readFile(join(projectRoot,'experiments/private-core-proof',dir,'.local/prepared',mode+'.sol'),'utf8');sources[mode]={content,sha256:sha(content)};}return sources;}
export function privateAccountNoteSnapshot(snapshot){
 const note={...snapshot};
 // These are adapter accounting facts, not inputs to the unchanged proof actor.
 // Preserve every other field: an unexpected new field must still fail the
 // actor's exact schema rather than being silently discarded here.
 for(const field of ['asset','assetCodeHash','assetIdentity','backedAmount','assetBalance','assetSurplus','assetDeficit','unrelatedNative']){assert.ok(Object.hasOwn(note,field),'ACCOUNT_ASSET_SNAPSHOT_FIELDS');delete note[field];}
 return note;
}
export async function createOwnedPrivateAccountRuntime({accountId,signal,onProgress=async()=>{},guard=()=>{}}){
 let base,closed=false;const assets=new Map();
 try{
  base=await createOwnedWalletRuntime({walletId:accountId,signal,publish:onProgress,guard});const sources=await verifierSources(),registry=[];
  for(const kind of ['NATIVE','ERC20']){
   guard();await onProgress({progressCode:kind==='NATIVE'?'DEPLOYING_ACCOUNT_ETH_POOL':'DEPLOYING_ACCOUNT_TOKEN_POOL'});
   const pool=await base.heavy('deploy-account-'+kind.toLowerCase(),()=>deployPrivateAssetPool(base.runtime,{sources,policy:base.pool.policy,deploymentDomain:'0x'+randomBytes(32).toString('hex'),solAuthority:base.runtime.accounts[2],btcAuthority:base.runtime.accounts[1],...(kind==='NATIVE'?{asset:PRIVATE_ASSET_NATIVE}:{}),onDeployment:d=>base.audit('asset-deployment',d)}));
   const descriptor=Object.freeze({kind,address:strip(pool.asset),codeHash:strip(pool.assetCodeHash),identity:strip(pool.assetIdentity)}),assetId=sha(Buffer.from(base.identity.evmGenesis+descriptor.identity)),walletId=randomBytes(16).toString('hex');
   const identity=Object.freeze({...base.identity,walletId,pool:strip(pool.address),scope:strip(pool.scope),deploymentHash:sha(JSON.stringify(pool.deployments)),asset:descriptor});
   const local=join(base.local,'assets',assetId);await mkdir(local,{recursive:true,mode:0o700});let receiptCursor=0;
   const archiveReceipts=async()=>{for(const entry of pool.receipts.slice(receiptCursor)){await base.audit('asset-evm',await captureAssemblyEvmReceipt(base.runtime,entry));receiptCursor++;}};
   const adapter=Object.freeze({descriptor,balance:pool.assetBalance,backingBalance:async block=>BigInt((await pool.snapshot(block)).backedAmount),fundingTransactionValue:pool.fundingTransactionValue,beforeDeposit:pool.beforeDeposit});
   const notePool=Object.freeze({...pool,snapshot:async block=>privateAccountNoteSnapshot(await pool.snapshot(block))});
   const view=Object.create(null);for(const k of Object.keys(base))if(!['clock','pool','identity','local','close','privateState','archiveReceipts'].includes(k))view[k]=base[k];
   Object.assign(view,{pool:notePool,identity,local,assetAdapter:adapter,archiveReceipts,close:async()=>{},privateState:async()=>{const s=await pool.snapshot();return{identity:{...identity},snapshot:privateAccountNoteSnapshot(s),balance:s.backedAmount};}});Object.defineProperty(view,'clock',{enumerable:true,get:()=>base.clock});Object.freeze(view);
   const authority=createPrivateWalletAuthority({walletId,profile:PRIVATE_WALLET_PROFILE,signal,onCheckpoint:async s=>{await base.audit('asset-checkpoint',{assetId,summary:s});await onProgress({progressCode:s.progressCode,assetId,phase:s.phase});}},{createRuntime:async()=>view});
   await authority.action('open');await archiveReceipts();assets.set(assetId,{authority,pool,view,descriptor});
   registry.push({assetId,kind,symbol:kind==='NATIVE'?'ETH':'PALT',decimals:kind==='NATIVE'?18:6,chainId:identity.chainId,genesis:identity.evmGenesis,pool:identity.pool,scope:identity.scope,policy:identity.policy,token:descriptor.address,codeHash:descriptor.codeHash,assetIdentity:descriptor.identity,custody:'ONCHAIN_NOTE_POOL',trust:'PINNED_LOCAL_CONTRACT_AND_TRUSTED_NATIVE_ISSUER'});
  }
  validatePrivateAccountRegistry(registry);
  async function snapshot(previous={assets:[],nativeHoldings:[]}){
   guard();assert.equal(closed,false,'ACCOUNT_RUNTIME_CLOSED');const result=[];
   for(const a of registry){
    try{const entry=assets.get(a.assetId),privateView=await entry.authority.privateAssetStatus(),s=await entry.pool.snapshot();assert.equal(privateView.asset.identity,a.assetIdentity,'ACCOUNT_ASSET_STATUS_BINDING');await assertPrivateSnapshotCanonical(base.runtime,s);
     result.push({assetId:a.assetId,scope:a.scope,observation:'LIVE',observedAt:Date.now(),blockNumber:BigInt(s.blockNumber).toString(),blockHash:strip(s.blockHash),available:privateView.availableBaseUnits,pending:privateView.pendingBaseUnits,unavailable:privateView.unavailableBaseUnits,positions:privateView.notes.map(n=>({id:n.id,type:n.type,state:n.state,amountBaseUnits:n.amountBaseUnits,operationId:n.operationId})),backing:{held:s.assetBalance,liabilities:s.backedAmount,surplus:s.assetSurplus,deficit:s.assetDeficit},errorCode:null});
    }catch(e){const old=previous.assets.find(p=>p.assetId===a.assetId);result.push(old?{...old,observation:'UNAVAILABLE',errorCode:safe(e)}:{assetId:a.assetId,scope:a.scope,observation:'UNAVAILABLE',observedAt:0,blockNumber:'0',blockHash:'0'.repeat(64),available:'0',pending:'0',unavailable:'0',positions:[],backing:{held:'0',liabilities:'0',surplus:'0',deficit:'0'},errorCode:safe(e)});}
   }
   const nativeHoldings=[];
   for(const chain of ['SOLANA','BITCOIN']){const genesis=chain==='SOLANA'?base.identity.solanaGenesis:base.identity.bitcoinGenesis,id=sha(Buffer.from(chain+genesis+accountId));let h={id,chain,genesis,symbol:chain==='SOLANA'?'SOL':'BTC',decimals:chain==='SOLANA'?9:8,amountBaseUnits:'0',observedAt:0,anchor:'',observation:'UNAVAILABLE',spendability:'OBSERVATION_ONLY',trust:'TRUSTED_LOCAL_RPC_NOT_PRIVATE_NOTE_BACKING',errorCode:null};
    try{if(chain==='SOLANA'){const b=await base.solana.readPublic('getBalance',[base.solana.recipient,{commitment:'finalized'}]);assert.ok(Number.isSafeInteger(b.value)&&b.value>=0&&Number.isSafeInteger(b.context.slot),'ACCOUNT_SOL_BALANCE');h={...h,amountBaseUnits:String(b.value),anchor:String(b.context.slot)};}else{const before=await base.runtime.btc('getbestblockhash'),balance=await base.runtime.btc('getbalance',['*',6], 'm9-recipient'),after=await base.runtime.btc('getbestblockhash');assert.equal(before,after,'ACCOUNT_BTC_TIP_CHANGED');h={...h,amountBaseUnits:satsFromBTC(balance).toString(),anchor:after};}h={...h,observedAt:Date.now(),observation:'LIVE'};}
    catch(e){h={...(previous.nativeHoldings.find(p=>p.id===id)??h),observation:'UNAVAILABLE',errorCode:safe(e)};}nativeHoldings.push(h);
   }
   return{assets:result,nativeHoldings};
  }
  const get=id=>{assert.ok(assets.has(id),'ACCOUNT_ASSET_UNKNOWN');return assets.get(id);};
  return Object.freeze({registry,local:base.local,lifetime:base.identity.issuerLifetime,guard:base.guard,snapshot,
   async prepare(r){const e=get(r.assetId);return e.authority.action('prepareIntent',{intentId:r.intentId,kind:r.kind,terms:r.terms});},
   async execute(r){const e=get(r.assetId);return e.authority.action('execute',{intentId:r.intentId,operationId:r.operationId});},
   async reconcile(r){const e=get(r.assetId),v=await e.authority.privateAssetStatus(),intent=v.intents.find(i=>i.intentId===r.intentId);assert.ok(intent,'ACCOUNT_ORIGINAL_INTENT_REQUIRED');assert.deepEqual({kind:intent.kind,terms:intent.terms},{kind:r.kind,terms:r.terms},'ACCOUNT_INTENT_CHANGED');if(intent.state!=='COMPLETED')await e.authority.action('reconcile',{intentId:r.intentId,operationId:r.operationId});const current=await e.authority.privateAssetStatus();assert.equal(current.intents.find(i=>i.intentId===r.intentId)?.state,'COMPLETED','ACCOUNT_OUTCOME_UNKNOWN');return{state:'CONFIRMED'};},
   async close(){if(closed)return;for(const e of assets.values()){const s=await e.pool.snapshot();assert.equal(s.backedAmount,'0','ACCOUNT_RETAINED_BACKING');assert.equal(s.liveReservations,0);assert.equal(s.liveOutputNotes,0);}for(const e of assets.values())await e.authority.close();await base.close();closed=true;},
   async abort(){if(closed)return;closed=true;for(const e of assets.values())await e.authority.abort().catch(()=>{});await base.close();},
   async audit(label,value){return base.audit('account-'+label,value);},
   // Trusted integration seams return observations only, never key/endpoint input.
   async crossAssetReplayForTest(){
    const entries=[...assets.values()],source=entries.find(e=>e.descriptor.kind==='NATIVE'),target=entries.find(e=>e.descriptor.kind==='ERC20');
    const original=source.pool.receipts.find(r=>r.label==='exact wallet deposit_balance'&&r.receipt.status==='0x1');assert.ok(original,'ACCOUNT_ORIGINAL_DEPOSIT_REQUIRED');
    const before=await Promise.all(entries.map(e=>e.pool.snapshot()));
    await target.pool.send('integration-only cross-asset original D replay',{from:base.runtime.accounts[0],to:target.pool.address,data:original.request.data,value:'0x0'},'0x0','PUBLIC_DOMAIN');
    await source.pool.send('integration-only duplicate original D replay',{...original.request},'0x0','OUTPUT_ALREADY_INSERTED');
    const after=await Promise.all(entries.map(e=>e.pool.snapshot()));for(let i=0;i<entries.length;i++)for(const k of ['root','stateSequence','leafCount','spentCount','liveOutputNotes','backedAmount','assetBalance'])assert.equal(after[i][k],before[i][k],'ACCOUNT_REPLAY_CHANGED_BACKING');
    for(const e of entries)await e.view.archiveReceipts();return{crossAssetRejected:true,duplicateDepositRejected:true,backingUnchanged:true};
   },
   async inspect(){return{pools:await Promise.all([...assets.entries()].map(async([assetId,e])=>({assetId,snapshot:await e.pool.snapshot()}))),native:{solTransfers:base.solana.transfers.length},closed};},
  });
 }catch(e){for(const a of assets.values())await a.authority.abort().catch(()=>{});await base?.close().catch(()=>{});throw e;}
}
