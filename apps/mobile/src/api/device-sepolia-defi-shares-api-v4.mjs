/** The dedicated public route shares the existing PC23 custody/response
 * brands. One sensitive review approval precedes NoteOwner signing/witness. */
import * as P from '@lianum/mobile-protocol/device/source-note-v1';
import * as R from '@lianum/mobile-protocol/device/sepolia-defi-review-v4';
import {createDeviceSepoliaDefiSharesNoteApiV4,readDeviceExternalFlatConsentV1} from './device-external-flat-note-api-v1.mjs';
import * as Session from '../custody/wallet-session-v1.ts';
import {assertOriginalDeviceExternalFlatNoteVaultV1} from '../custody/device-external-flat-note-vault-v1.ts';
const own=new WeakMap(),prepared=new WeakMap();
const need=ok=>{if(!ok)throw Error('MOBILE_SEPOLIA_DEFI_REVIEW_BINDING');},same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export function createDeviceSepoliaDefiSharesApiV4({descriptor,fetchImpl=globalThis.fetch}={}){
 const d=P.normalizeExternalFlatDescriptorV1(descriptor);need(d.profile===P.DEVICE_EXTERNAL_FLAT_SHARE_V1&&typeof fetchImpl==='function');let closed=false;const notes=new Set(),controllers=new Set(),pending=new Set();
 const live=()=>need(!closed);
 async function post(path,payload){live();const target=d.origin+'/v1/mobile/sepolia-defi-shares/'+path,body=JSON.stringify(payload);need(new TextEncoder().encode(body).length<=8192);const abort=new AbortController();controllers.add(abort);const timer=setTimeout(()=>abort.abort(),15000);let reader,buffer;
  try{const response=await fetchImpl(target,{method:'POST',headers:{Origin:d.origin,Accept:'application/json','Content-Type':'application/json','x-lianum-defi-pairing-id':d.pairingId},body,redirect:'error',credentials:'omit',cache:'no-store',signal:abort.signal});live();need(response.ok&&!response.redirected&&(!response.url||response.url===target)&&/^application\/json(?:;\s*charset=utf-8)?$/i.test(response.headers.get('content-type')??''));const declared=response.headers.get('content-length');need(declared===null||/^(0|[1-9][0-9]{0,4})$/.test(declared)&&Number(declared)<=16384);need(response.body?.getReader);reader=response.body.getReader();buffer=new Uint8Array(16384);let used=0;for(;;){const chunk=await reader.read();live();need(!abort.signal.aborted);if(chunk.done)break;need(chunk.value instanceof Uint8Array&&used+chunk.value.length<=buffer.length);buffer.set(chunk.value,used);used+=chunk.value.length;}return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(buffer.subarray(0,used)));}
  finally{clearTimeout(timer);controllers.delete(abort);try{await reader?.cancel();}catch{}buffer?.fill(0);}
 }
 function noteApi(reference=null){const api=createDeviceSepoliaDefiSharesNoteApiV4({descriptor:d,fetchImpl,sepoliaReviewReference:reference});notes.add(api);return api;}
 async function access(api){const c=await api.challenge(),signature=await Session.signWalletSessionExternalV1('NOTE',c,d.origin,d.pairingId);return{access:c,signature};}
 async function reviewedInput(vault,rawReview){
  live();const review=R.normalizeDeviceSepoliaDefiReviewV4(rawReview);need(same(review.descriptor,d));assertOriginalDeviceExternalFlatNoteVaultV1(vault,d,review.rootId);const summary=await vault.summary();need(summary.rootId===review.rootId&&summary.noteRevision===review.noteRevision);return review;
 }
 async function prepareAuthorized(vault,rawReview,authorization,signal){
  const review=await reviewedInput(vault,rawReview);let witness=null,success=false,note;
   try{Session.assertWalletSessionSepoliaDefiV4(authorization,review);need(!signal?.aborted);note=noteApi(review.reference);const a=await access(note),existing=P.externalFlatExactV1(await post('defi-read-review',{...a,reference:review.reference}),['reference','state','review']);need(existing.reference===review.reference);
    if(existing.state==='AUTHORIZED')need(same(R.normalizeDeviceSepoliaDefiReviewV4(existing.review),review));else{need(existing.state==='NOT_ISSUED'&&existing.review===null);const challenge=R.validateDeviceSepoliaDefiReviewFreshV4(await post('defi-reviews',{review}));need(same(challenge.review,review));const signature=Session.signWalletSessionSepoliaDefiReviewV4(authorization,challenge);const approved=P.externalFlatExactV1(await post('defi-authorizations',{challenge,signature}),['reference','authorized','financialNativeMounted']);need(approved.reference===review.reference&&approved.authorized===true&&approved.financialNativeMounted===false);}
    Session.assertWalletSessionSepoliaDefiV4(authorization,review);assertOriginalDeviceExternalFlatNoteVaultV1(vault,d,review.rootId);let built;
    if(review.action==='INVEST')built=await vault.prepareDeposit(d,review.shareWithdrawalRecipient.slice(2),review.shares,review.validFrom,review.validUntil);
    else{const request=await vault.draft('QUOTE_W39'),a=await access(note),c=await note.review(a.access,a.signature,request),sig=await Session.signWalletSessionExternalV1('NOTE',c,d.origin,d.pairingId),quoted=await note.submit(c,sig,null);Session.assertWalletSessionSepoliaDefiV4(authorization,review);built=await vault.prepareWithdrawal(quoted.quote);}
    witness=built.witness;need(built.draft.rootId===review.rootId&&built.draft.noteRevision===review.noteRevision&&built.draft.statement.amount===review.shares&&built.draft.recipient===review.shareWithdrawalRecipient.slice(2));Session.assertWalletSessionSepoliaDefiV4(authorization,review);need(!signal?.aborted);const token=Object.freeze(Object.create(null));prepared.set(token,{api,vault,review,authorization,note,draft:built.draft,witness,submitted:false});pending.add(token);success=true;return token;
   }finally{if(!success){P.externalFlatWipeV1(witness);Session.closeWalletSessionAuthorizationV1(authorization);note?.close();}}
 }
 const api=Object.freeze({descriptor:d,
  async prepare(vault,rawReview,signal){const review=await reviewedInput(vault,rawReview),authorization=await Session.approveWalletSessionSepoliaDefiV4(review,signal);return prepareAuthorized(vault,review,authorization,signal);},
  async prepareWithReviewedAuthorizationV5(vault,rawReview,authorization,signal){return prepareAuthorized(vault,rawReview,authorization,signal);},
  async submit(token){live();const s=prepared.get(token);need(s?.api===api&&!s.submitted);Session.assertWalletSessionSepoliaDefiV4(s.authorization,s.review);assertOriginalDeviceExternalFlatNoteVaultV1(s.vault,d,s.review.rootId);const a=await access(s.note),consent=await s.note.review(a.access,a.signature,s.draft);Session.assertWalletSessionSepoliaDefiV4(s.authorization,s.review);const signature=await Session.signWalletSessionSepoliaDefiNoteV4(s.authorization,consent);await s.vault.latch(consent);s.submitted=true;
   try{const row=await s.note.submit(consent,signature,s.witness);Session.bindWalletSessionSepoliaDefiProofV4(s.authorization,row);s.proofAccepted=true;return await s.vault.accept(row);}finally{P.externalFlatWipeV1(s.witness);s.witness=null;if(s.review.action==='INVEST'||!s.proofAccepted){pending.delete(token);Session.closeWalletSessionAuthorizationV1(s.authorization);}}
  },
  async signPreparedWithdrawal(token,rawConsent){live();const s=prepared.get(token);need(s?.api===api&&s.proofAccepted&&s.review.action==='REDEEM');const consent=readDeviceExternalFlatConsentV1(rawConsent);need(consent.action==='WITHDRAW_W39');const signature=await Session.signWalletSessionSepoliaDefiNoteV4(s.authorization,consent);pending.delete(token);Session.closeWalletSessionAuthorizationV1(s.authorization);return signature;},
  async observe(vault){live();const summary=await vault.summary();assertOriginalDeviceExternalFlatNoteVaultV1(vault,d,summary.rootId);const note=noteApi(),a=await access(note);try{const status=await note.status(a.access,a.signature);return await vault.reconcileOriginalStatus(status);}finally{note.close();notes.delete(note);}},
  close(){if(closed)return;closed=true;for(const c of controllers)c.abort();for(const token of pending){const s=prepared.get(token);P.externalFlatWipeV1(s?.witness);if(s)Session.closeWalletSessionAuthorizationV1(s.authorization);prepared.delete(token);}pending.clear();for(const note of notes)note.close();notes.clear();}
 });own.set(api,{live,descriptor:d});return api;
}
