/** Display union over separately consented original SDK reads. This actor owns
 * no signing, proof, funding, custody key or economic execution capability.
 * Durable operations remain in their original journals; restart starts empty. */
import {readOriginalPrivateStateObservationV1,originalPrivateStateObservationDescriptorV1} from '../api/original-account-api-v2.mjs';
import {readNativeClaimDeviceObservationV1,readOriginalDeviceRootClaimObservationV2} from '../api/native-claim-device-api-v1.mjs';
import {readDeviceDefiPositionObservationV1,readDeviceDefiPositionObservationWindowV1} from '../api/device-defi-position-read-api-v1.mjs';
import {readDeviceExternalFlatStatusV1} from '../api/device-external-flat-note-api-v1.mjs';
import {normalizeExternalFlatDescriptorV1,externalFlatHexV1,DEVICE_EXTERNAL_FLAT_NOTE_V1,DEVICE_EXTERNAL_FLAT_SHARE_V1} from '../../../../packages/mobile-protocol/src/device-external-flat-note-v1.mjs';
import {normalizeDeviceDefiPositionDescriptorV1} from '../../../../packages/mobile-protocol/src/device-defi-position-read-v1.mjs';
import {walletObservationWindowV1} from './wallet-observation-window-v1.mjs';
import {walletPortfolioGroupsV1} from './wallet-portfolio-v1.mjs';
import {walletConnectionReadBindingV1} from './wallet-connection-read-plan-v1.mjs';
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const bindingMatches=(left,right)=>left&&right&&left.kind===right.kind&&left.mode===right.mode&&same(left.descriptor,right.descriptor);
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
const fail=()=>{throw Error('MOBILE_PRIVATE_WALLET_STATE_REJECTED');};
const routeKey=route=>JSON.stringify(route);
const opaqueRow=(row,state)=>({...row,state,available:null,reserved:null,locked:null,recovery:null,shares:null,valuation:null,noteAmount:null,
 ...(row.pagedProgress?{pagedProgress:{phase:state,pages:null,nodes:null}}:{})});
export function createPrivateWalletStateV1(){
 const sources=new Map(),registered=new Map();let revision=0,nativeEpoch=0,externalGraphEpoch=0,pagedEpoch=0,readState='IDLE',activeRead=null,lastReadAt=null;
 function retain(key,rows,check,binding=null){
  if(!sources.has(key)&&sources.size>=64)fail();
  if(rows.length+[...sources.entries()].filter(([id])=>id!==key).reduce((n,[,s])=>n+s.rows.length,0)>4096)fail();
  const previous=sources.get(key)?.rows??[];
  const copy=structuredClone(rows).map(row=>{const id=routeKey(row.route),old=previous.find(value=>value.key===id)?.lastConfirmed;
   const base=row.lastConfirmed&&old?{...old,...row.lastConfirmed,available:row.lastConfirmed.available??old.available,shares:row.lastConfirmed.shares??old.shares}:row.lastConfirmed??old??null;
   const lastConfirmed=row.state==='LIVE'&&(row.pagedProgress||[row.available,row.reserved,row.locked,row.recovery,row.shares,row.noteAmount].some(value=>value!==null))?{...base,readAt:Date.now(),available:row.available,reserved:row.reserved,locked:row.locked,recovery:row.recovery,shares:row.shares,noteAmount:row.noteAmount,...(row.pagedProgress?{pagedProgress:row.pagedProgress}:{})}:base;
   return freeze({...row,key:id,lastConfirmed});});
  if(new Set(copy.map(row=>row.key)).size!==copy.length)fail();
  sources.set(key,{rows:copy,check,binding:binding?freeze(structuredClone(binding)):null,sequence:revision+1,readAt:Date.now(),invalidated:false});revision++;
 }
 function invalidateExternalRoute(raw,rootId){
   const d=normalizeExternalFlatDescriptorV1(raw);externalFlatHexV1(rootId);
   if(![DEVICE_EXTERNAL_FLAT_NOTE_V1,DEVICE_EXTERNAL_FLAT_SHARE_V1].includes(d.profile))fail();
   const p=d.poolTerms;
   for(const [key,source]of sources){
    const matches=row=>{const r=row.route;return (d.profile===DEVICE_EXTERNAL_FLAT_SHARE_V1?r.component==='DEVICE_SHARE_NOTE':['DEVICE_NOTE','DEVICE_GRAPH_NOTE','DEVICE_GRAPH_RESERVATION'].includes(r.component))&&r.rootId===rootId&&
     r.origin===d.origin&&r.pairingId===d.pairingId&&r.lifetime===d.lifetime&&r.pool===p.pool&&
     r.assetId===p.assetIdentity&&r.genesis===p.genesis&&r.scope===p.scope&&r.policy===p.policy&&r.domain===p.domainCommitment;};
    if(source.rows.some(matches))sources.set(key,{...source,rows:source.rows.map(row=>matches(row)?freeze(opaqueRow(row,'UNKNOWN')):row),invalidated:true});
   }
   revision++;
 }
 function registeredCoverage(){
  let consulted=0,current=0,unavailable=0,pending=0,unresolved=0;const routes=[];
  for(const [key,task]of registered){const matching=[...sources.values()].filter(source=>bindingMatches(source.binding,task.binding)),valid=task.state==='VERIFIED'&&matching.length>0&&matching.every(source=>!source.invalidated&&source.check());
   if(task.state==='VERIFIED')consulted++;else if(task.state==='UNAVAILABLE')unavailable++;else pending++;
   if(valid)current++;if(valid&&matching.some(source=>source.rows.some(row=>row.state!=='LIVE')))unresolved++;
   routes.push({key,label:task.label,state:valid?'CURRENT':task.state==='VERIFIED'?'STALE':task.state,readAt:task.readAt});
  }
  return freeze({scope:'REGISTERED_CONNECTIONS_AND_CUSTODIES',state:readState,total:registered.size,consulted,current,unavailable,pending,unresolved,lastReadAt,routes,complete:registered.size>0&&readState!=='CANCELLED'&&current===registered.size&&unresolved===0});
 }
 return Object.freeze({
  setRegisteredReadPlan(tasks){
   if(!Array.isArray(tasks)||tasks.length>64||new Set(tasks.map(task=>task.key)).size!==tasks.length)fail();
   const next=tasks.map(task=>({key:task.key,label:task.label,binding:walletConnectionReadBindingV1(task)}));registered.clear();for(const task of next)registered.set(task.key,{...task,state:'UNREAD',readAt:null});activeRead=null;readState='RUNNING';revision++;
  },
  beginRegisteredRead(key){const task=registered.get(key);if(!task||activeRead!==null)fail();activeRead={key,sequence:revision};task.state='READING';revision++;},
  finishRegisteredRead(key,ok){const task=registered.get(key),started=activeRead;if(!task||!started||started.key!==key)fail();activeRead=null;const matches=[...sources.values()].filter(source=>bindingMatches(source.binding,task.binding));const verified=ok===true&&matches.length>0&&matches.every(source=>source.sequence>started.sequence&&!source.invalidated&&source.check());task.state=verified?'VERIFIED':'UNAVAILABLE';task.readAt=verified?Date.now():null;lastReadAt=Date.now();revision++;return verified;},
  finishRegisteredReads(){if(activeRead!==null)fail();readState=[...registered.values()].every(task=>task.state==='VERIFIED')?'COMPLETE':'PARTIAL';revision++;},
  invalidateRegisteredCoverage(){for(const task of registered.values())task.state='UNREAD';readState='PARTIAL';revision++;},
  cancelRegisteredReads(){activeRead=null;readState='CANCELLED';for(const task of registered.values())if(task.state==='READING')task.state='CANCELLED';for(const [key,source]of sources)if(source.binding)sources.set(key,{...source,invalidated:true,rows:source.rows.map(row=>freeze(opaqueRow(row,'UNKNOWN')))});nativeEpoch++;externalGraphEpoch++;pagedEpoch++;revision++;},
  acceptAccount(raw){
   const v=readOriginalPrivateStateObservationV1(raw),b=v.binding,a=v.asset,d=originalPrivateStateObservationDescriptorV1(raw);
   const route={component:'ACCOUNT',origin:d.origin,pairingId:d.pairingId,owner:b.accountIdentitySHA256,
    lifetime:b.originalAccountLifetime,generationId:b.generationId,assetId:a.assetId,chainId:a.chainId,genesis:a.genesis,pool:a.pool};
   const requests=new Map((sources.get(routeKey(route))?.rows[0].requests??[]).map(q=>[q.requestId,q]));requests.set(v.request.requestId,v.request);if(requests.size>128)fail();
   const state=v.status==='LIVE'&&[...requests.values()].every(q=>q.state==='CONFIRMED')?'LIVE':v.status==='STALE'?'STALE':'UNKNOWN';
   retain(routeKey(route),[{route,label:a.symbol,decimals:a.decimals,state,available:state==='LIVE'?v.balances.available:null,
    reserved:state==='LIVE'?v.balances.reserved:null,locked:state==='LIVE'?v.balances.locked:null,recovery:state==='LIVE'?v.balances.recovery:null,
    shares:null,valuation:null,noteAmount:null,requests:[...requests.values()],custody:'BACKEND',observed:v.observed}],()=>readOriginalPrivateStateObservationV1(raw));
  },
  acceptNativeClaims(raw){
   const v=readNativeClaimDeviceObservationV1(raw),d=v.descriptor,s=v.state;
   const route={component:'CUSTODIAL_NATIVE_CLAIM',origin:d.origin,pairingId:d.pairingId,
    lifetime:d.lifetimeSHA256,owner:d.accountScopeSHA256,domain:d.claimDomain,
    genesis:d.nativeGenesis,assetId:d.wrapperAssetIdentity,nativeAsset:d.nativeAsset,nativeFamily:d.nativeFamily};
   // These are ORIGINAL journal observations, not current private-ledger/quorum
   // balances. A native receipt or a deposited amount cannot become available.
   const requests=[...s.requests.map(r=>({requestId:r.requestId,kind:'CLAIM_'+r.action.toUpperCase(),state:r.state,disposition:null})),
    ...s.deposits.map(r=>({requestId:r.intentId,kind:'CLAIM_INGRESS',state:r.status,disposition:null})),
    ...s.tickets.map(r=>({requestId:r.ticketId,kind:'CLAIM_NATIVE_DELIVERY',state:r.status,disposition:null}))];
   retain(routeKey(['NATIVE_CLAIM',route]),[{route,label:d.claimSymbol,decimals:d.decimals,state:'UNKNOWN',
    available:null,reserved:null,locked:null,recovery:null,shares:null,valuation:null,noteAmount:null,
    requests,custody:'BACKEND',observed:{observedAt:v.observedAt,observation:'DURABLE_JOURNAL_ONLY'}}],
    ()=>readNativeClaimDeviceObservationV1(raw));
  },
  acceptDeviceRootClaims(raw){
   const v=readOriginalDeviceRootClaimObservationV2(raw),d=v.descriptor,c=d.claim;
   const rows=v.economicState.rows.map(row=>({route:{component:'CUSTODIAL_NATIVE_CLAIM',custodyProfile:d.profile,origin:c.origin,
    pairingId:c.pairingId,lifetime:c.lifetimeSHA256,owner:c.accountScopeSHA256,domain:c.claimDomain,genesis:c.nativeGenesis,
    nativeAsset:c.nativeAsset,nativeFamily:c.nativeFamily,...row.route},label:c.claimSymbol,decimals:c.decimals,state:row.state,
    available:row.state==='LIVE'&&v.note?.state==='LIVE'?row.balances?.available??null:null,reserved:row.state==='LIVE'?row.balances?.reserved??null:null,locked:row.state==='LIVE'?row.balances?.locked??null:null,recovery:row.state==='LIVE'?row.balances?.recovery??null:null,shares:null,valuation:null,noteAmount:null,requests:row.requests,
    custody:'DEVICE',observed:{observedAt:v.observedAt,observation:'ORIGINAL_DEVICE_ROOT_CLAIM_JOURNAL_AND_CURRENT_SOURCE'}}));
   retain(routeKey(['DEVICE_ROOT_CLAIM',c.origin,c.pairingId,c.claimDomain]),rows,()=>readOriginalDeviceRootClaimObservationV2(raw));
  },
  acceptPositions(raw){
   const v=readDeviceDefiPositionObservationV1(raw);
   const rows=v.positions.positions.map(p=>{
    const i=p.vaultIdentity,route={component:'POSITION',origin:v.origin,pairingId:v.pairingId,devicePublicKey:v.devicePublicKey,generationId:p.generationId,
     assetId:p.shareAssetId,chainId:i.chainId,genesis:i.genesisHash,domain:i.domain,runtimeId:i.runtimeId,vault:p.vault};
    const state=p.ownership.status==='LIVE'?'LIVE':p.ownership.status==='STALE'?'STALE':'UNKNOWN';
    return{route,label:"Shares",decimals:null,state,available:null,reserved:state==='LIVE'?p.ownership.balances.reserved:null,
     locked:state==='LIVE'?p.ownership.balances.locked:null,recovery:state==='LIVE'?p.ownership.balances.recovery:null,
     shares:state==='LIVE'?p.ownership.balances.available:null,
     valuation:state==='LIVE'&&p.valuation.status==='LIVE'?{amount:p.valuation.estimatedRedeemableUnderlying,assetId:p.underlyingAssetId,token:p.underlyingToken,spendable:false}:null,
     noteAmount:null,requests:p.ownership.pendingRequests??[],custody:'BACKEND',observed:p.ownership.observed};
   });
   const window=walletObservationWindowV1(readDeviceDefiPositionObservationWindowV1(raw));
   retain(routeKey(['POSITIONS',v.origin,v.pairingId]),rows,window.fresh,{kind:'POSITIONS',descriptor:{origin:v.origin,pairingId:v.pairingId,devicePublicKey:v.devicePublicKey}});
  },
  invalidatePositions(raw){
   const descriptor=normalizeDeviceDefiPositionDescriptorV1(raw);
   for(const [key,source]of sources)if(source.rows.some(row=>row.route.component==='POSITION'&&row.route.origin===descriptor.origin&&row.route.pairingId===descriptor.pairingId&&row.route.devicePublicKey===descriptor.devicePublicKey))
    sources.set(key,{...source,rows:source.rows.map(row=>freeze(opaqueRow(row,'UNKNOWN'))),invalidated:true});
   revision++;
  },
  acceptExternal(raw){
   const v=readDeviceExternalFlatStatusV1(raw),d=v.descriptor,p=d.poolTerms;
   const share=d.profile==='LIANUM_DEVICE_EXTERNAL_FLAT_SHARE_NOTE_V1';
   const rows=v.jobs.filter(j=>j.mode===(share?'deposit_intent':'deposit_balance')).map(j=>{
    const c=j.consentFields,exit=v.jobs.find(r=>r.mode==='withdraw_balance'&&r.consentFields.depositJobId===j.jobId);
    const route={component:share?'DEVICE_SHARE_NOTE':'DEVICE_NOTE',origin:d.origin,pairingId:d.pairingId,devicePublicKey:d.devicePublicKey,lifetime:d.lifetime,rootId:c.rootId,
     noteRevision:c.noteRevision,assetId:p.assetIdentity,genesis:p.genesis,pool:p.pool,scope:p.scope,policy:p.policy,domain:p.domainCommitment};
    // A funding receipt is not a fresh unspent-nullifier observation. Show the
    // original note amount separately; never manufacture available balance.
    const uncertain=!share&&v.graphClaimed===true&&v.note?.state!=='SPENT'||[j,exit].filter(Boolean).some(r=>['PROVING','FUNDING_UNKNOWN','DELIVERY_UNKNOWN','WITHDRAWAL_UNKNOWN'].includes(r.stage));
    const currentNote=!uncertain&&v.note?.state==='LIVE';
    return{route,label:d.assetMetadata.symbol,decimals:d.assetMetadata.decimals,
     state:uncertain||v.note&&!['LIVE','SPENT'].includes(v.note.state)?'UNKNOWN':'LIVE',
     available:currentNote?v.note.available:null,reserved:null,locked:null,recovery:null,
     shares:share&&currentNote?v.note.available:null,valuation:null,
     ...(v.note?{noteState:v.note.state}:{}),
     noteAmount:!share&&(v.graphClaimed===true||v.note?.state==='SPENT')?null:exit?.stage==='CONFIRMED'?'0':j.stage==='CONFIRMED'?c.statement.amount:null,
     requests:[j,exit].filter(Boolean).map(r=>({requestId:r.jobId,kind:r.mode,state:r.stage,disposition:null})),
     custody:'DEVICE',observed:v.observed};
   });
   // This is a frozen display projection, not a reusable SDK permission.
   // Closing the originating screen may close its transport while this already
   // consented reading remains visible until its ORIGINAL expiry.
   const window=walletObservationWindowV1({issuedAt:v.observedAt,expiresAt:v.expiresAt});
   retain(routeKey(['EXTERNAL',d.origin,d.pairingId,d.lifetime,p.pool,p.assetIdentity,d.profile]),rows,window.fresh,{kind:'EXTERNAL_FLAT',descriptor:d});
  },
  async acceptExternalGraph(raw){
   const epoch=externalGraphEpoch;
   const {readDeviceExternalFlatGraphStatusV1}=await import('../api/device-external-flat-graph-api-v1.mjs');
   if(epoch!==externalGraphEpoch)fail();
   const v=readDeviceExternalFlatGraphStatusV1(raw),d=v.descriptor,p=d.poolTerms;
   for(const job of v.jobs)if(job.graph.stage!=='SOURCE_CANCELLED')invalidateExternalRoute(d,job.reservation.consentFields.custody.rootId);
   const rows=v.jobs.flatMap(job=>{
    const r=job.reservation,c=r.consentFields,g=job.graph;
    const route={component:'DEVICE_GRAPH_RESERVATION',origin:d.origin,pairingId:d.pairingId,devicePublicKey:d.devicePublicKey,lifetime:d.lifetime,
     rootId:c.custody.rootId,noteRevision:c.custody.noteRevision,parentJobId:r.jobId,
     assetId:p.assetIdentity,genesis:p.genesis,pool:p.pool,scope:p.scope,policy:p.policy,domain:p.domainCommitment};
    // The signed statement commits to quantities; it does not reveal them.
    // A terminal receipt also cannot prove that an output remains unspent.
    const reservation={route,label:d.assetMetadata.symbol+' · Reserva',decimals:d.assetMetadata.decimals,
     state:g.outcome===null?'UNKNOWN':'LIVE',available:null,reserved:null,locked:null,recovery:null,
     shares:null,valuation:null,noteAmount:null,custody:'DEVICE',observed:v.observed,
     requests:[{requestId:r.jobId,kind:'ERC20_RESERVATION',state:r.stage,disposition:null},
      {requestId:r.jobId,kind:'ERC20_GRAPH',state:g.stage,disposition:g.outcome}]};
    const outputs=job.outputs.filter(n=>n.state!=='EMPTY').map(n=>{
     const live=['UNSPENT','SPENT','LOCKED'].includes(n.state),available=n.state==='UNSPENT'?n.available:null;
     return{route:{...route,component:'DEVICE_GRAPH_NOTE',noteRole:n.noteRole,commitment:n.commitment},
      label:d.assetMetadata.symbol+(n.noteRole==='change'?' · Cambio':" · Recovery"),decimals:d.assetMetadata.decimals,
      state:live?'LIVE':'UNKNOWN',available,reserved:null,locked:n.state==='LOCKED'?n.amount:null,
      recovery:n.noteRole==='recovery'?available:null,shares:null,valuation:null,
      noteAmount:['UNISSUED','SPENT','UNKNOWN'].includes(n.state)?null:n.amount,noteState:n.state,custody:'DEVICE',observed:v.observed,
      requests:[{requestId:r.jobId,kind:'ERC20_GRAPH',state:g.stage,disposition:g.outcome},
       ...v.withdrawals.filter(w=>w.noteRole===n.noteRole&&w.row.consentFields.depositJobId===r.jobId).map(w=>({requestId:w.row.jobId,kind:'ERC20_GRAPH_EXIT',state:w.row.stage,disposition:null}))]};
    });
    return[reservation,...outputs];
   });
   const window=walletObservationWindowV1({issuedAt:v.observedAt,expiresAt:v.expiresAt});
   retain(routeKey(['EXTERNAL_GRAPH',d.origin,d.pairingId,d.lifetime,p.pool,p.assetIdentity]),rows,window.fresh,{kind:'EXTERNAL_FLAT',descriptor:d});
  },
  invalidateExternal(raw,rootId){invalidateExternalRoute(raw,rootId);},
  async acceptNative(raw){
   // Lazy loading keeps unrelated account/DeFi reads independent of native
   // custody. The getter rejects DTOs and cloned local projections.
   const epoch=nativeEpoch;
   const {readLocalDeviceOutputDisplayV1}=await import('../custody/local-root-note-vault-v1.ts');
   if(epoch!==nativeEpoch)fail();
   const display=readLocalDeviceOutputDisplayV1(raw);
   if(display.kind==='SOURCE'){
    const v=display.original,j=display.job,route={component:'DEVICE_NATIVE_SOURCE',rootId:display.rootId,
     noteRevision:display.revision,commitment:display.commitment,pool:display.pool,scope:display.scope,policy:display.policy,
     ...(j?{origin:j.origin,pairingId:j.pairingId,depositJobId:j.jobId}:{}),
     ...(j?.assetIdentity?{assetId:j.assetIdentity}:{}),
     ...(j?.domainCommitment?{domain:j.domainCommitment}:{}),
     ...(v?{ledgerAssetId:v.assetId,genesis:v.genesis}:{})};
    retain(routeKey(['NATIVE',display.rootId]),[{route,label:"Native source note",decimals:null,
     state:v&&!display.hasReservation?'LIVE':'UNKNOWN',available:display.availableBalance,reserved:null,locked:null,recovery:null,
     shares:null,valuation:null,noteAmount:display.hasReservation?null:display.amount,custody:'DEVICE',
     observed:v?.head??null,requests:j?[{requestId:j.jobId,kind:'FUND_D26',
      state:v&&!display.hasReservation?'CONFIRMED':'UNKNOWN',disposition:null}]:[]}],()=>readLocalDeviceOutputDisplayV1(raw));
    return;
   }
   const v=display.original,p=v.poolTerms;
   const rows=display.outputs.map(output=>{
    const route={component:'DEVICE_NATIVE_NOTE',origin:v.origin,pairingId:v.pairingId,rootId:v.rootId,
     noteRevision:v.noteRevision,parentJobId:v.parentJobId,nativeBindingSHA256:v.nativeBindingSHA256,
     assetId:p.assetIdentity,ledgerAssetId:v.assetId,pool:v.pool,scope:p.scope,policy:p.policy,domain:p.domainCommitment,
     noteRole:output.noteRole,commitment:v[output.noteRole].commitment};
    const pending=output.request?.state==='UNKNOWN';
    return{route,label:output.noteRole==='change'?"Native change":"Native Recovery",decimals:null,
     state:pending?'UNKNOWN':'LIVE',available:pending?null:output.availableBalance,reserved:null,
     locked:pending?null:output.state==='LOCKED'?output.amount:null,
     recovery:!pending&&output.noteRole==='recovery'?output.availableBalance:null,
     shares:null,valuation:null,noteAmount:output.amount,custody:'DEVICE',observed:v.observed,
     requests:[{requestId:v.parentJobId,kind:'NATIVE_RESERVATION',state:v.nativeOutcome??'RESERVED',disposition:null},
      ...(output.request?[output.request]:[])]};
   });
   retain(routeKey(['NATIVE',v.rootId]),rows,()=>readLocalDeviceOutputDisplayV1(raw));
  },
  invalidateNative(){
   nativeEpoch++;
   for(const [key,source] of sources)if(source.rows.some(row=>['DEVICE_NATIVE_NOTE','DEVICE_NATIVE_SOURCE'].includes(row.route.component)))
    sources.set(key,{...source,rows:source.rows.map(row=>freeze(opaqueRow(row,'UNKNOWN'))),invalidated:true});
   revision++;
  },
  async acceptPaged(raw){
   const epoch=pagedEpoch;
   const {readDevicePagedWalletDisplayV3,readDevicePagedWalletDisplayCutV3}=await import('../custody/device-paged-note-vault-v3.ts');
   if(epoch!==pagedEpoch)fail();
   const v=readDevicePagedWalletDisplayV3(raw),cut=readDevicePagedWalletDisplayCutV3(raw),d=v.descriptor,n=v.note,g=v.graph;
   const route={origin:d.origin,pairingId:d.pairingId,devicePublicKey:d.devicePublicKey,chainId:d.chainId,genesis:d.genesis,pool:d.pool,
    assetId:d.assetIdentity,scope:d.scope,policy:d.policy,domain:d.domain,rootId:v.rootId,noteRevision:v.noteRevision,
    custodyMode:v.graphMode?'GRAPH':'NOTE'};
   const key=routeKey(['PAGED',d,v.rootId]);
   const binding={kind:'PAGED',descriptor:d,mode:v.graphMode?'GRAPH':'NOTE'};
   const portfolio=v.portfolio??null,sourceOutput=portfolio?.outputs.find(row=>row.role==='source');
   const check=observed=>{if(observed===null)return()=>false;const window=walletObservationWindowV1({...observed,deadlineMs:d.deadlineMs});return()=>cut()&&window.fresh();};
   const requests=n.jobs.map(j=>({requestId:j.jobId,kind:'PAGED_'+j.mode.toUpperCase(),state:j.stage,disposition:null}));
   if(n.pending)requests.push({requestId:n.pending.jobId,kind:n.pending.action,state:'UNKNOWN',disposition:null});
   retain(key+'NOTE',[{route:{...route,component:'DEVICE_PAGED_NOTE',...(n.commitment?{commitment:n.commitment}:{})},
    label:"Demo units",decimals:null,state:sourceOutput?sourceOutput.state==='UNKNOWN'?'UNKNOWN':'LIVE':n.state==='STALE'?'STALE':n.state==='UNKNOWN'?'UNKNOWN':'LIVE',
    available:sourceOutput?sourceOutput.available:n.available,reserved:null,locked:sourceOutput?.issued&&sourceOutput.state==='LOCKED'?sourceOutput.amount:null,recovery:null,shares:null,valuation:null,noteAmount:sourceOutput&&['LIVE','LOCKED'].includes(sourceOutput.state)?sourceOutput.amount:n.amount,
    noteState:sourceOutput?.state??n.state,issued:sourceOutput?.issued,lastConfirmed:typeof n.confirmedDeposit==='string'?{readAt:Date.now(),available:null,reserved:null,locked:null,recovery:null,shares:null,noteAmount:null,confirmedDeposit:n.confirmedDeposit}:null,requests,custody:'DEVICE',observed:portfolio?.observed??n.observed}],check(portfolio?.observed??n.observed),binding);
   if(g!==null)retain(key+'GRAPH',[{route:{...route,component:'DEVICE_PAGED_GRAPH',graphId:g.graphId},
    label:"Paged graph",decimals:null,state:g.phase==='STALE'?'STALE':['UNKNOWN','REQUIRES_OBSERVATION'].includes(g.phase)?'UNKNOWN':'LIVE',
    available:null,reserved:null,locked:null,recovery:null,shares:null,valuation:null,noteAmount:null,
    pagedProgress:{phase:g.phase,pages:g.pages,nodes:g.nodes},
    requests:[{requestId:g.graphId,kind:'PAGED_GRAPH',state:g.phase,disposition:null},
     ...(g.pending?[{requestId:g.pending.jobId,kind:g.pending.action,state:'UNKNOWN',disposition:null}]:[])],
    custody:'DEVICE',observed:g.observed}],check(g.observed),binding);
   if(portfolio){
    const outputs=portfolio.outputs.filter(output=>output.role!=='source').map(output=>({route:{...route,component:'DEVICE_PAGED_OUTPUT',graphId:g.graphId,noteRole:output.role,...(output.id!==null?{id:output.id}:{}),commitment:output.commitment,nullifier:output.nullifier},label:"Demo units · "+(output.role==='change'?"Remaining balance":output.role==='recovery'?"Recovery":"Result of "+output.id),decimals:null,state:output.state==='UNKNOWN'?'UNKNOWN':'LIVE',issued:output.issued,available:output.available,reserved:null,locked:output.issued&&output.state==='LOCKED'?output.amount:null,recovery:output.role==='recovery'&&output.issued?output.available:null,shares:null,valuation:null,noteAmount:output.issued&&output.state!=='SPENT'?output.amount:null,noteState:output.state,custody:'DEVICE',observed:portfolio.observed,requests:[]}));
    outputs.push({route:{...route,component:'DEVICE_PAGED_RESERVATION',graphId:g.graphId},label:"Demo units · Reserve",decimals:null,state:portfolio.ledger.reservedAmount===null?'UNKNOWN':'LIVE',issued:true,available:portfolio.ledger.reservedAmount===null?null:'0',reserved:portfolio.ledger.reservedAmount,locked:null,recovery:null,shares:null,valuation:null,noteAmount:null,noteState:undefined,custody:'DEVICE',observed:portfolio.observed,requests:[]});
    retain(key+'OUTPUTS',outputs,check(portfolio.observed),binding);
   }else if(g!==null){const previous=sources.get(key+'OUTPUTS');if(previous)sources.set(key+'OUTPUTS',{...previous,invalidated:true,rows:previous.rows.map(row=>freeze(opaqueRow(row,'UNKNOWN')))});else retain(key+'OUTPUTS',[],()=>false,binding);}
  },
  invalidatePaged(scope){
   pagedEpoch++;
   for(const [key,source]of sources)if(source.binding?.kind==='PAGED'&&(!scope||same(scope.descriptor,source.binding.descriptor)&&scope.mode===source.binding.mode))
    sources.set(key,{...source,rows:source.rows.map(row=>freeze(opaqueRow(row,'UNKNOWN'))),invalidated:true});
   revision++;
  },
  snapshot(){
   const rows=[],registeredRows=[];for(const source of sources.values()){
    let fresh=!source.invalidated;try{fresh=fresh&&source.check()!==false;}catch{fresh=false;}
    const displayed=source.rows.map(row=>fresh?row:opaqueRow(row,source.invalidated||row.state==='UNKNOWN'?'UNKNOWN':'STALE'));rows.push(...displayed);
    if([...registered.values()].some(task=>bindingMatches(task.binding,source.binding)))registeredRows.push(...displayed);
   }
   const coverage=registeredCoverage(),portfolio=walletPortfolioGroupsV1(registeredRows);
   return freeze({version:1,revision,rows,scope:coverage.scope,coverage,assets:portfolio.assets,duplicatesExcluded:portfolio.duplicatesExcluded,aggregateBalance:null,completePortfolio:coverage.complete&&portfolio.assets.every(asset=>asset.quantities.available.complete),readOnly:true});
  },
  clear(){sources.clear();registered.clear();activeRead=null;readState='IDLE';lastReadAt=null;revision++;nativeEpoch++;externalGraphEpoch++;pagedEpoch++;},
 });
}
