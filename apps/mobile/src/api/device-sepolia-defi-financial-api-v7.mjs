import {DEVICE_OPERATION_REQUEST_MS_V41} from '@lianum/mobile-protocol/device/paged-owner-v3';
/** Fixed paired transport for already reviewed Original DeFi jobs. Read calls
 * use the unlocked session; only the existing review/note signer authorizes
 * effects. A lost write reply is observed, never automatically submitted again. */
import * as P from '@lianum/mobile-protocol/device/source-note-v1';
import * as R from '@lianum/mobile-protocol/device/sepolia-defi-review-v4';
import {normalizeDeviceSepoliaDefiConnectionV7} from '@lianum/mobile-protocol/device/sepolia-defi-connection-v7';
import {normalizeDeviceSepoliaDefiFinancialStatusV7} from '@lianum/mobile-protocol/device/sepolia-defi-financial-status-v7';
import {createDeviceSepoliaDefiSharesNoteApiV4} from './device-external-flat-note-api-v1.mjs';
import {assertOriginalDeviceExternalFlatNoteVaultV1} from '../custody/device-external-flat-note-vault-v1.ts';
import {signWalletSessionExternalV1} from '../custody/wallet-session-v1.ts';
const need=value=>{if(!value)throw Error('MOBILE_SEPOLIA_DEFI_FINANCIAL_BINDING');};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const publicErrors=new Set(['SEPOLIA_DEFI_PAEG_CAPITAL_NOT_CONNECTED','SEPOLIA_DEFI_PROPOSAL_SPONSOR_WINDOW','SEPOLIA_DEFI_PROPOSAL_INPUT_LIMIT','SEPOLIA_DEFI_PROPOSAL_MINIMUM_OUTPUT','SEPOLIA_DEFI_PROPOSAL_LIQUIDITY','SEPOLIA_DEFI_PROPOSAL_TOKEN_FUNDS_REQUIRED','SEPOLIA_DEFI_PROPOSAL_SHARE_LIMIT']);
export function createDeviceSepoliaDefiFinancialApiV7({connection,fetchImpl=globalThis.fetch}={}) {
  const profile=normalizeDeviceSepoliaDefiConnectionV7(connection),d=profile.descriptor;
  need(typeof fetchImpl==='function');
  const notes=createDeviceSepoliaDefiSharesNoteApiV4({descriptor:d,fetchImpl}),controllers=new Set(),writes=new Set(),consents=new WeakMap(),observations=new WeakMap();
  let closed=false;
  const live=()=>need(!closed);
  async function post(path,payload) {
    live();const target=d.origin+'/v1/mobile/sepolia-defi-shares/'+path,body=JSON.stringify(payload);
    need(new TextEncoder().encode(body).length<=8192);
    const controller=new AbortController();controllers.add(controller);let reader,timer,bytes;
    const stop=new Promise((_,reject)=>controller.signal.addEventListener('abort',()=>reject(Error('MOBILE_SEPOLIA_DEFI_REQUEST_CLOSED')),{once:true}));
    // Preparation can warm the service before it issues a fresh short consent.
    // Financial effects keep their original timeout and are never replayed.
    const timeoutMs=DEVICE_OPERATION_REQUEST_MS_V41;
    timer=setTimeout(()=>controller.abort(),timeoutMs);
    const work=(async()=>{
      const response=await fetchImpl(target,{method:'POST',headers:{Accept:'application/json',Origin:d.origin,'Content-Type':'application/json','x-lianum-defi-pairing-id':d.pairingId},body,redirect:'error',credentials:'omit',cache:'no-store',signal:controller.signal});
      live();need(!controller.signal.aborted&&!response.redirected&&(!response.url||response.url===target)&&/^application\/json(?:;\s*charset=utf-8)?$/i.test(response.headers.get('content-type')??''));
      const length=response.headers.get('content-length');need(length===null||/^(0|[1-9][0-9]{0,4})$/.test(length)&&Number(length)<=16384);need(response.body?.getReader);
      reader=response.body.getReader();bytes=new Uint8Array(16384);let used=0;
      for(;;){const part=await reader.read();live();need(!controller.signal.aborted);if(part.done)break;need(part.value instanceof Uint8Array&&used+part.value.length<=bytes.length);bytes.set(part.value,used);used+=part.value.length;}
      need(length===null||Number(length)===used);const parsed=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes.subarray(0,used)));
      if(!response.ok){const failure=P.externalFlatExactV1(parsed,['error']);if(publicErrors.has(failure.error))throw Error(failure.error);need(false);}return parsed;
    })();
    try{return await Promise.race([work,stop]);}finally{clearTimeout(timer);controller.abort();controllers.delete(controller);bytes?.fill(0);if(reader){void reader.cancel().catch(()=>{});try{reader.releaseLock();}catch{}}}
  }
  async function access(){live();const access=await notes.challenge(),signature=await signWalletSessionExternalV1('NOTE',access,d.origin,d.pairingId);live();return{access,signature};}
  async function scope(vault,rawReview,jobId=null) {
    live();const review=R.normalizeDeviceSepoliaDefiReviewV4(rawReview);
    need(same(review.descriptor,d)&&review.protocol===profile.protocol&&review.shareWithdrawalRecipient===profile.terms.shareWithdrawalRecipient&&(profile.terms.underlyingReceiver===null||review.underlyingReceiver===profile.terms.underlyingReceiver));
    need(review.action==='INVEST'?BigInt(review.maximumInputAtomic)<=BigInt(profile.terms.maximumInputAtomic):BigInt(review.minimumAssetsAtomic)>=BigInt(profile.terms.minimumAssetsAtomic));
    assertOriginalDeviceExternalFlatNoteVaultV1(vault,d,review.rootId);const summary=await vault.summary();
    need(summary.rootId===review.rootId&&summary.noteRevision===review.noteRevision);
    if(jobId!==null){P.externalFlatHexV1(jobId);const job=summary.jobs.find(job=>job.jobId===jobId);need(job&&job.consentFields.rootId===review.rootId&&job.mode===(review.action==='INVEST'?'deposit_intent':'withdraw_balance'));}
    return review;
  }
  function financial(raw,review,jobId,kinds) {
    const result=normalizeDeviceSepoliaDefiFinancialStatusV7(raw);
    need(result.jobId===jobId&&result.reference===review.reference&&result.protocol===review.protocol&&kinds.includes(result.kind));return result;
  }
  async function request(path,vault,rawReview,jobId,kinds,write=false,extra={}) {
    const review=await scope(vault,rawReview,jobId),auth=await access(),key=path+':'+review.reference+':'+jobId;
    if(write){need(!writes.has(key));writes.add(key);}
    return financial(await post(path,{...auth,reference:review.reference,jobId,...extra}),review,jobId,kinds);
  }
  return Object.freeze({connection:profile,
    async propose(vault,raw) {
      const input=P.externalFlatExactV1(raw,['action','sharesAtomic','maximumInputAtomic','minimumAssetsAtomic','underlyingReceiver',...(Object.hasOwn(raw??{},'receiptCommitment')?['receiptCommitment']:[])]);need(['INVEST','REDEEM'].includes(input.action));
      if(input.action==='INVEST'){P.externalFlatHexV1(input.receiptCommitment);need(input.receiptCommitment!=='0'.repeat(64));}else{need(input.receiptCommitment===undefined||input.receiptCommitment===null);input.receiptCommitment=null;}
      need(typeof input.underlyingReceiver==='string'&&/^0x[0-9a-f]{40}$/.test(input.underlyingReceiver)&&input.underlyingReceiver!=='0x'+'0'.repeat(40)&&(profile.terms.underlyingReceiver===null||input.underlyingReceiver===profile.terms.underlyingReceiver));
      P.externalFlatUintV1(input.sharesAtomic);need(BigInt(input.sharesAtomic)>0n);
      if(input.action==='INVEST')need(input.minimumAssetsAtomic===null&&typeof input.maximumInputAtomic==='string'&&/^[1-9][0-9]{0,38}$/.test(input.maximumInputAtomic)&&BigInt(input.maximumInputAtomic)<=BigInt(profile.terms.maximumInputAtomic));
      else{need(input.maximumInputAtomic===null);P.externalFlatUintV1(input.minimumAssetsAtomic);need(BigInt(input.minimumAssetsAtomic)>=BigInt(profile.terms.minimumAssetsAtomic));}
      const summary=await vault.summary();assertOriginalDeviceExternalFlatNoteVaultV1(vault,d,summary.rootId);const auth=await access();
      const reply=P.externalFlatExactV1(await post('defi-proposals',{...auth,protocol:profile.protocol,...input,rootId:summary.rootId,noteRevision:summary.noteRevision,shareWithdrawalRecipient:profile.terms.shareWithdrawalRecipient}),['review']);
      const review=await scope(vault,reply.review);need(review.action===input.action&&review.shares===input.sharesAtomic&&review.underlyingReceiver===input.underlyingReceiver);
      need(review.receiptCommitment===input.receiptCommitment);need(input.action==='INVEST'?BigInt(review.maximumInputAtomic)<=BigInt(input.maximumInputAtomic):BigInt(review.minimumAssetsAtomic)>=BigInt(input.minimumAssetsAtomic));return review;
    },
    submitInvestment:(vault,review,jobId,capitalNodeId)=>{need(review.action==='INVEST');if(profile.paegSource)need(typeof capitalNodeId==='string'&&/^[A-Za-z][A-Za-z0-9_.-]{0,79}$/.test(capitalNodeId));return request('financial-submit',vault,review,jobId,['INVEST'],true,capitalNodeId===undefined?{}:{capitalNodeId});},
    async continueInvestment(vault,review,jobId,observation,capitalNodeId) {
      const original=observations.get(observation);need(original&&!original.used&&observation.phase==='PREPARED'&&observation.kind==='INVEST'&&observation.reference===review.reference&&observation.jobId===jobId);original.used=true;
      // Explicit continuation after a new authenticated read only. The server
      // reuses its Original command and journal; no signer callback or replay
      // permission is created by this public PREPARED observation.
      if(profile.paegSource)need(typeof capitalNodeId==='string'&&/^[A-Za-z][A-Za-z0-9_.-]{0,79}$/.test(capitalNodeId));writes.delete('financial-submit:'+review.reference+':'+jobId);return request('financial-submit',vault,review,jobId,['INVEST'],true,capitalNodeId===undefined?{}:{capitalNodeId});
    },
    async withdrawalReview(vault,rawReview,jobId) {
      const review=await scope(vault,rawReview,jobId);need(review.action==='REDEEM');const auth=await access();
      const consent=P.normalizeExternalFlatConsentV1(P.externalFlatExactV1(await post('withdrawal-review',{...auth,reference:review.reference,jobId}),['consent']).consent);
      P.validateExternalFlatFreshV1(consent);need(consent.action==='WITHDRAW_W39'&&same(consent.descriptor,d)&&consent.jobId===jobId&&consent.rootId===review.rootId&&consent.noteRevision===review.noteRevision&&consent.recipient===review.shareWithdrawalRecipient.slice(2)&&consent.statement.amount===review.shares);
      const summary=await vault.summary(),proved=summary.jobs.find(job=>job.jobId===jobId);need(proved?.stage==='PROVED');
      for(const key of ['jobId','depositJobId','rootId','noteRevision','recipient','statement','path','witnessSHA256','proofSHA256','publicInputsSHA256'])need(same(consent[key],proved.consentFields[key]));
      consents.set(consent,{review,jobId,used:false});return consent;
    },
    async armWithdrawal(vault,review,jobId,consent,consentSignature) {
      const original=consents.get(consent);need(original&&!original.used&&original.jobId===jobId&&same(original.review,review));P.validateExternalFlatFreshV1(consent);P.normalizeExternalFlatSignatureV1(consentSignature);original.used=true;
      return request('withdrawal-arm',vault,review,jobId,['WITHDRAW'],true,{consent,consentSignature});
    },
    redeem:(vault,review,jobId)=>{need(review.action==='REDEEM');return request('redeem-submit',vault,review,jobId,['WITHDRAW','REDEEM'],true);},
    async observe(vault,review,jobId){const result=await request('financial-observe',vault,review,jobId,review.action==='INVEST'?['INVEST']:['WITHDRAW','REDEEM']);observations.set(result,{used:false});return result;},
    close(){if(closed)return;closed=true;notes.close();for(const controller of controllers)controller.abort();controllers.clear();},
  });
}
