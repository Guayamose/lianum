/** One reviewed exact share plan, distinct original note custody per leaf.
 * A caller explicitly submits a leaf once; lost/preparation/proof replies retain
 * UNKNOWN. Observation never automatically repeats a signature or operation. */
import {normalizeDeviceSepoliaMorphoBatchReviewV5} from '@lianum/mobile-protocol/device/sepolia-morpho-batch-review-v5';
import {externalFlatExactV1} from '@lianum/mobile-protocol/device/source-note-v1';
import * as Session from '../custody/wallet-session-v1.ts';
import {assertOriginalDeviceExternalFlatNoteVaultV1} from '../custody/device-external-flat-note-vault-v1.ts';
import {createDeviceSepoliaDefiSharesApiV4} from './device-sepolia-defi-shares-api-v4.mjs';
const batches=new WeakMap();
const need=value=>{if(!value)throw Error('MOBILE_MORPHO_SHARE_BATCH_BINDING');};
export function createDeviceSepoliaMorphoShareBatchApiV5({fetchImpl=globalThis.fetch}={}){
 need(typeof fetchImpl==='function');let closed=false,busy=false;const active=new Set();
 function closeBatch(state){if(state.closed)return;state.closed=true;state.signal?.removeEventListener('abort',state.abort);Session.closeWalletSessionAuthorizationV1(state.authorization);for(const note of state.notes.values())note.api.close();active.delete(state);}
 const api=Object.freeze({
  async prepare(rawReview,entries,signal){
   need(!closed&&!busy&&!signal?.aborted&&active.size<4);busy=true;let state;
   try{
    const review=normalizeDeviceSepoliaMorphoBatchReviewV5(rawReview);need(Array.isArray(entries)&&Object.getPrototypeOf(entries)===Array.prototype&&entries.length===review.notes.length&&Reflect.ownKeys(entries).length===entries.length+1);
    const held=Array.from({length:entries.length},(_,index)=>{const property=Object.getOwnPropertyDescriptor(entries,String(index));need(property?.enumerable&&Object.hasOwn(property,'value'));const entry=externalFlatExactV1(property.value,['id','vault']);need(entry.id===review.notes[index].id);return entry;});need(new Set(held.map(note=>note.vault)).size===held.length);
    for(let index=0;index<held.length;index++){const {vault}=held[index],leaf=review.notes[index].review;assertOriginalDeviceExternalFlatNoteVaultV1(vault,leaf.descriptor,leaf.rootId);const summary=await vault.summary();need(!closed&&!signal?.aborted&&summary.rootId===leaf.rootId&&summary.noteRevision===leaf.noteRevision&&summary.commitment===null);}
    const authorization=await Session.approveWalletSessionSepoliaMorphoBatchV5(review,signal);
    state={owner:api,review,authorization,signal,abort:null,closed:false,notes:new Map()};
    for(let index=0;index<held.length;index++){const leaf=review.notes[index].review;state.notes.set(held[index].id,{vault:held[index].vault,review:leaf,api:createDeviceSepoliaDefiSharesApiV4({descriptor:leaf.descriptor,fetchImpl}),phase:'READY'});}
    state.abort=()=>closeBatch(state);signal?.addEventListener('abort',state.abort,{once:true});need(!closed&&!signal?.aborted);Session.assertWalletSessionSepoliaMorphoBatchV5(authorization,review);const token=Object.freeze(Object.create(null));batches.set(token,state);active.add(state);return token;
   }catch(error){if(state)closeBatch(state);throw error;}finally{busy=false;}
  },
  async submitNote(token,id){
   const state=batches.get(token);need(!closed&&state?.owner===api&&!state.closed&&!state.signal?.aborted);Session.assertWalletSessionSepoliaMorphoBatchV5(state.authorization,state.review);const note=state.notes.get(id);need(note&&note.phase==='READY');note.phase='PREPARING';let authorization;
   try{authorization=Session.walletSessionSepoliaMorphoBatchLeafV5(state.authorization,id);const prepared=await note.api.prepareWithReviewedAuthorizationV5(note.vault,note.review,authorization,state.signal);need(!state.closed&&!state.signal?.aborted);note.phase='SUBMITTING';const reply=await note.api.submit(prepared);need(!state.closed&&!state.signal?.aborted);note.phase='PROVED';return reply;}
   catch(error){note.phase='UNKNOWN';note.api.close();throw error;}finally{if(authorization)Session.closeWalletSessionAuthorizationV1(authorization);}
  },
  async observe(token,id){const state=batches.get(token);need(!closed&&state?.owner===api&&!state.closed);const note=state.notes.get(id);need(note);const observer=createDeviceSepoliaDefiSharesApiV4({descriptor:note.review.descriptor,fetchImpl});try{return await observer.observe(note.vault);}finally{observer.close();}},
  state(token){const state=batches.get(token);need(!closed&&state?.owner===api&&!state.closed);return Object.freeze({reference:state.review.reference,notes:Object.freeze([...state.notes].map(([id,note])=>Object.freeze({id,phase:note.phase}))),financialNativeMounted:false});},
  close(){if(closed)return;closed=true;for(const state of [...active])closeBatch(state);}
 });return api;
}
