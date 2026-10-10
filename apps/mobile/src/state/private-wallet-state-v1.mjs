/** Display union over separately consented original SDK reads. This actor owns
 * no signing, proof, funding, custody key or economic execution capability.
 * Durable operations remain in their original journals; restart starts empty. */
import {readOriginalPrivateStateObservationV1,originalPrivateStateObservationDescriptorV1} from '../api/original-account-api-v2.mjs';
import {readNativeClaimDeviceObservationV1,readOriginalDeviceRootClaimObservationV2} from '../api/native-claim-device-api-v1.mjs';
import {readDeviceDefiPositionObservationV1} from '../api/device-defi-position-read-api-v1.mjs';
import {readDeviceExternalFlatStatusV1} from '../api/device-external-flat-note-api-v1.mjs';
import {normalizeExternalFlatDescriptorV1,externalFlatHexV1,DEVICE_EXTERNAL_FLAT_NOTE_V1,DEVICE_EXTERNAL_FLAT_SHARE_V1} from '../../../../packages/mobile-protocol/src/device-external-flat-note-v1.mjs';
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
const fail=()=>{throw Error('MOBILE_PRIVATE_WALLET_STATE_REJECTED');};
const routeKey=route=>JSON.stringify(route);
const opaqueRow=(row,state)=>({...row,state,available:null,reserved:null,locked:null,recovery:null,shares:null,valuation:null,noteAmount:null});
export function createPrivateWalletStateV1(){
 const sources=new Map();let revision=0,nativeEpoch=0,externalGraphEpoch=0;
 function retain(key,rows,check){
  if(!sources.has(key)&&sources.size>=24)fail();
  if(rows.length+[...sources.entries()].filter(([id])=>id!==key).reduce((n,[,s])=>n+s.rows.length,0)>64)fail();
  const copy=rows.map(row=>freeze({...row,key:routeKey(row.route)}));
  if(new Set(copy.map(row=>row.key)).size!==copy.length)fail();
  sources.set(key,{rows:copy,check});revision++;
 }
 function invalidateExternalRoute(raw,rootId){
   const d=normalizeExternalFlatDescriptorV1(raw);externalFlatHexV1(rootId);
   if(![DEVICE_EXTERNAL_FLAT_NOTE_V1,DEVICE_EXTERNAL_FLAT_SHARE_V1].includes(d.profile))fail();
   const p=d.poolTerms;
   for(const [key,source]of sources){
    const matches=row=>{const r=row.route;return (d.profile===DEVICE_EXTERNAL_FLAT_SHARE_V1?r.component==='DEVICE_SHARE_NOTE':['DEVICE_NOTE','DEVICE_GRAPH_NOTE','DEVICE_GRAPH_RESERVATION'].includes(r.component))&&r.rootId===rootId&&
     r.origin===d.origin&&r.pairingId===d.pairingId&&r.lifetime===d.lifetime&&r.pool===p.pool&&
     r.assetId===p.assetIdentity&&r.genesis===p.genesis&&r.scope===p.scope&&r.policy===p.policy&&r.domain===p.domainCommitment;};
    if(source.rows.some(matches))sources.set(key,{rows:source.rows.map(row=>matches(row)?freeze(opaqueRow(row,'UNKNOWN')):row),check:source.check});
   }
   revision++;
 }
 return Object.freeze({
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
    available:null,reserved:null,locked:null,recovery:null,shares:null,valuation:null,noteAmount:null,requests:row.requests,
    custody:'DEVICE',observed:{observedAt:v.observedAt,observation:'ORIGINAL_DEVICE_ROOT_CLAIM_JOURNAL_AND_CURRENT_SOURCE'}}));
   retain(routeKey(['DEVICE_ROOT_CLAIM',c.origin,c.pairingId,c.claimDomain]),rows,()=>readOriginalDeviceRootClaimObservationV2(raw));
  },
  acceptPositions(raw){
   const v=readDeviceDefiPositionObservationV1(raw);
   const rows=v.positions.positions.map(p=>{
    const i=p.vaultIdentity,route={component:'POSITION',origin:v.origin,pairingId:v.pairingId,generationId:p.generationId,
     assetId:p.shareAssetId,chainId:i.chainId,genesis:i.genesisHash,domain:i.domain,runtimeId:i.runtimeId,vault:p.vault};
    const state=p.ownership.status==='LIVE'?'LIVE':p.ownership.status==='STALE'?'STALE':'UNKNOWN';
    return{route,label:'Participaciones',decimals:null,state,available:null,reserved:state==='LIVE'?p.ownership.balances.reserved:null,
     locked:state==='LIVE'?p.ownership.balances.locked:null,recovery:state==='LIVE'?p.ownership.balances.recovery:null,
     shares:state==='LIVE'?p.ownership.balances.available:null,
     valuation:state==='LIVE'&&p.valuation.status==='LIVE'?{amount:p.valuation.estimatedRedeemableUnderlying,assetId:p.underlyingAssetId,token:p.underlyingToken,spendable:false}:null,
     noteAmount:null,requests:p.ownership.pendingRequests??[],custody:'BACKEND',observed:p.ownership.observed};
   });
   retain(routeKey(['POSITIONS',v.origin,v.pairingId]),rows,()=>readDeviceDefiPositionObservationV1(raw));
  },
  acceptExternal(raw){
   const v=readDeviceExternalFlatStatusV1(raw),d=v.descriptor,p=d.poolTerms;
   const share=d.profile==='LIANUM_DEVICE_EXTERNAL_FLAT_SHARE_NOTE_V1';
   const rows=v.jobs.filter(j=>j.mode===(share?'deposit_intent':'deposit_balance')).map(j=>{
    const c=j.consentFields,exit=v.jobs.find(r=>r.mode==='withdraw_balance'&&r.consentFields.depositJobId===j.jobId);
    const route={component:share?'DEVICE_SHARE_NOTE':'DEVICE_NOTE',origin:d.origin,pairingId:d.pairingId,lifetime:d.lifetime,rootId:c.rootId,
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
   const expiresAt=v.expiresAt,observedAt=v.observedAt;
   retain(routeKey(['EXTERNAL',d.origin,d.pairingId,d.lifetime,p.pool,p.assetIdentity,d.profile]),rows,()=>{const now=Date.now();if(!Number.isSafeInteger(now)||now<observedAt||now>=expiresAt)fail();});
  },
  async acceptExternalGraph(raw){
   const epoch=externalGraphEpoch;
   const {readDeviceExternalFlatGraphStatusV1}=await import('../api/device-external-flat-graph-api-v1.mjs');
   if(epoch!==externalGraphEpoch)fail();
   const v=readDeviceExternalFlatGraphStatusV1(raw),d=v.descriptor,p=d.poolTerms;
   for(const job of v.jobs)if(job.graph.stage!=='SOURCE_CANCELLED')invalidateExternalRoute(d,job.reservation.consentFields.custody.rootId);
   const rows=v.jobs.flatMap(job=>{
    const r=job.reservation,c=r.consentFields,g=job.graph;
    const route={component:'DEVICE_GRAPH_RESERVATION',origin:d.origin,pairingId:d.pairingId,lifetime:d.lifetime,
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
      label:d.assetMetadata.symbol+(n.noteRole==='change'?' · Cambio':' · Recuperación'),decimals:d.assetMetadata.decimals,
      state:live?'LIVE':'UNKNOWN',available,reserved:null,locked:n.state==='LOCKED'?n.amount:null,
      recovery:n.noteRole==='recovery'?available:null,shares:null,valuation:null,
      noteAmount:['UNISSUED','SPENT','UNKNOWN'].includes(n.state)?null:n.amount,noteState:n.state,custody:'DEVICE',observed:v.observed,
      requests:[{requestId:r.jobId,kind:'ERC20_GRAPH',state:g.stage,disposition:g.outcome},
       ...v.withdrawals.filter(w=>w.noteRole===n.noteRole&&w.row.consentFields.depositJobId===r.jobId).map(w=>({requestId:w.row.jobId,kind:'ERC20_GRAPH_EXIT',state:w.row.stage,disposition:null}))]};
    });
    return[reservation,...outputs];
   });
   const {observedAt,expiresAt}=v;
   retain(routeKey(['EXTERNAL_GRAPH',d.origin,d.pairingId,d.lifetime,p.pool,p.assetIdentity]),rows,
    ()=>{const now=Date.now();if(!Number.isSafeInteger(now)||now<observedAt||now>=expiresAt)fail();});
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
    retain(routeKey(['NATIVE',display.rootId]),[{route,label:'Nota fuente nativa',decimals:null,
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
    return{route,label:output.noteRole==='change'?'Cambio nativo':'Recuperación nativa',decimals:null,
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
    sources.set(key,{rows:source.rows.map(row=>freeze(opaqueRow(row,'UNKNOWN'))),check:()=>{}});
   revision++;
  },
  snapshot(){
   const rows=[];for(const source of sources.values()){
    let fresh=true;try{source.check();}catch{fresh=false;}
    rows.push(...source.rows.map(row=>fresh?row:opaqueRow(row,'STALE')));
   }
   return freeze({version:1,revision,rows,aggregateBalance:null,completePortfolio:false,readOnly:true});
  },
  clear(){sources.clear();revision++;nativeEpoch++;externalGraphEpoch++;},
 });
}
