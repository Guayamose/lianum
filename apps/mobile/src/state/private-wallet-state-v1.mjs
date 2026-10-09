/** Display union over separately consented original SDK reads. This actor owns
 * no signing, proof, funding, custody key or economic execution capability.
 * Durable operations remain in their original journals; restart starts empty. */
import {readOriginalPrivateStateObservationV1,originalPrivateStateObservationDescriptorV1} from '../api/original-account-api-v2.mjs';
import {readDeviceDefiPositionObservationV1} from '../api/device-defi-position-read-api-v1.mjs';
import {readDeviceExternalFlatStatusV1} from '../api/device-external-flat-note-api-v1.mjs';
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
const fail=()=>{throw Error('MOBILE_PRIVATE_WALLET_STATE_REJECTED');};
const routeKey=route=>JSON.stringify(route);
const opaqueRow=(row,state)=>({...row,state,available:null,reserved:null,locked:null,recovery:null,shares:null,valuation:null,noteAmount:null});
export function createPrivateWalletStateV1(){
 const sources=new Map();let revision=0,nativeEpoch=0;
 function retain(key,rows,check){
  if(!sources.has(key)&&sources.size>=24)fail();
  if(rows.length+[...sources.entries()].filter(([id])=>id!==key).reduce((n,[,s])=>n+s.rows.length,0)>64)fail();
  const copy=rows.map(row=>freeze({...row,key:routeKey(row.route)}));
  if(new Set(copy.map(row=>row.key)).size!==copy.length)fail();
  sources.set(key,{rows:copy,check});revision++;
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
    const uncertain=!share&&v.graphClaimed===true||[j,exit].filter(Boolean).some(r=>['PROVING','FUNDING_UNKNOWN','DELIVERY_UNKNOWN','WITHDRAWAL_UNKNOWN'].includes(r.stage));
    const currentShare=share&&!uncertain&&v.note.state==='LIVE';
    return{route,label:d.assetMetadata.symbol,decimals:d.assetMetadata.decimals,
     state:uncertain||share&&!['LIVE','SPENT'].includes(v.note.state)?'UNKNOWN':'LIVE',
     available:currentShare?v.note.available:null,reserved:null,locked:null,recovery:null,
     shares:currentShare?v.note.available:null,valuation:null,
     ...(share?{noteState:v.note.state}:{}),
     noteAmount:!share&&v.graphClaimed===true?null:exit?.stage==='CONFIRMED'?'0':j.stage==='CONFIRMED'?c.statement.amount:null,
     requests:[j,exit].filter(Boolean).map(r=>({requestId:r.jobId,kind:r.mode,state:r.stage,disposition:null})),
     custody:'DEVICE',observed:v.observed};
   });
   // This is a frozen display projection, not a reusable SDK permission.
   // Closing the originating screen may close its transport while this already
   // consented reading remains visible until its ORIGINAL expiry.
   const expiresAt=v.expiresAt,observedAt=v.observedAt;
   retain(routeKey(['EXTERNAL',d.origin,d.pairingId,d.lifetime,p.pool,p.assetIdentity,d.profile]),rows,()=>{const now=Date.now();if(!Number.isSafeInteger(now)||now<observedAt||now>=expiresAt)fail();});
  },
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
  clear(){sources.clear();revision++;nativeEpoch++;},
 });
}
