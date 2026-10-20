/** Fixed transport for one privately Original issuer. Paths, references and
 * public DTOs select requests only; no opaque financial token crosses HTTP. */
import assert from 'node:assert/strict';
import * as A from './device-sepolia-defi-shares-authority-v4.mjs';
import * as P from '@lianum/mobile-protocol/device/source-note-v1';
import {createOriginalDeviceSepoliaDefiFinancialHttpV8,isDeviceSepoliaDefiFinancialHttpRouteV8,mountOriginalDeviceSepoliaDefiFinancialSourceV8} from './device-sepolia-defi-financial-http-v8.mjs';
import {readDeviceSepoliaDefiProposalDataV8,normalizeDeviceSepoliaDefiProposalRequestDataV8,DEVICE_SEPOLIA_DEFI_PROPOSAL_FIELDS_V8} from './device-sepolia-defi-proposals-v8.mjs';
const handlers=new WeakMap(),prefix='/v1/mobile/sepolia-defi-shares/';
function original(handler){const state=handlers.get(handler);assert.ok(state,'SEPOLIA_DEFI_ORIGINAL_HTTP');return state;}
function createHandler(runtime,target,account){
 const d=account.descriptor,state={runtime,target,account,financial:null,closed:false};
 async function dispatchOrdinary(path,payload,reference){switch(path.slice(prefix.length)){
  case'challenges':assert.deepEqual(payload,{});return account.challenge();
  case'defi-proposals':{
   // Only this account owner consumes ACCESS. The leaf receives quote inputs
   // and the authenticated read context, never an authorization callback.
   const q=P.externalFlatExactV1(payload,['access','signature',...DEVICE_SEPOLIA_DEFI_PROPOSAL_FIELDS_V8]),request=normalizeDeviceSepoliaDefiProposalRequestDataV8(Object.fromEntries(DEVICE_SEPOLIA_DEFI_PROPOSAL_FIELDS_V8.map(key=>[key,q[key]]))),binding=A.readOriginalDeviceSepoliaDefiSharesBindingV8(runtime,account),original=await A.authorizeOriginalDeviceSepoliaDefiProposalAccessV8(account,{access:q.access,signature:q.signature});
   assert.equal(original.protocol,q.protocol,'SEPOLIA_DEFI_PROPOSAL_ACCOUNT_PROTOCOL');assert.strictEqual(original.target,binding.target,'SEPOLIA_DEFI_PROPOSAL_ORIGINAL_TARGET');return readDeviceSepoliaDefiProposalDataV8(runtime,original,request);
  }
  case'defi-reviews':assert.deepEqual(Object.keys(payload),['review']);return account.review(payload.review);
  case'defi-read-review':return account.readReviewReference(payload);
  case'defi-authorizations':assert.deepEqual(Object.keys(payload).sort(),['challenge','signature']);await account.authorizeReview(payload.challenge,payload.signature);return{reference:payload.challenge.review.reference,authorized:true,financialNativeMounted:false};
  case'reviews':{
   const withReference=Object.hasOwn(payload,'reference');
   if(withReference){P.externalFlatExactV1(payload,['access','signature','draft','reference']);P.externalFlatHexV1(payload.reference);if(reference!==null)assert.equal(reference,payload.reference,'SEPOLIA_DEFI_HTTP_REVIEW_REFERENCE');}
   const selected=withReference?payload.reference:reference,body=withReference?Object.fromEntries(['access','signature','draft'].map(key=>[key,payload[key]])):payload;
   return account.reviewNote(body,selected);
  }
  case'private-operations':case'operations':return account.operation(payload);
  case'status':return account.status(payload);
  default:assert.fail('SEPOLIA_DEFI_HTTP_ROUTE');
 }}
 const handler=Object.freeze({descriptor:d,account,
  async dispatch(path,payload,pairingId,reference=null){
   assert.ok(!state.closed,'SEPOLIA_DEFI_HTTP_CLOSED');assert.equal(pairingId,d.pairingId,'SEPOLIA_DEFI_HTTP_PAIRING');assert.ok(typeof path==='string'&&!path.includes('?')&&!path.includes('#'));assert.ok(Buffer.byteLength(JSON.stringify(payload))<=(path.endsWith('/private-operations')?16384:8192));assert.ok(path.startsWith(prefix),'SEPOLIA_DEFI_HTTP_ROUTE');
   if(state.financial&&(path===prefix+'reviews'&&payload?.draft?.action?.startsWith('PROVE_')||[prefix+'private-operations',prefix+'operations'].includes(path)&&payload?.consent?.action?.startsWith('PROVE_')))state.financial.assertPaegSource();
   if(isDeviceSepoliaDefiFinancialHttpRouteV8(path)){assert.ok(state.financial,'SEPOLIA_DEFI_NATIVE_MOUNT_PENDING');if(reference!==null)assert.equal(reference,payload.reference,'SEPOLIA_DEFI_HTTP_REVIEW_REFERENCE');return state.financial.dispatch(path,payload);}
   const ordinary=async()=>{
    // Finish validation before creating a fresh, short-lived challenge. A
    // restarted/idle process must not depend on a still-current startup lease.
    if(state.financial&&path===prefix+'defi-reviews')await state.financial.warmBeforeChallenge();
    const result=await dispatchOrdinary(path,payload,reference);if(state.financial&&[prefix+'private-operations',prefix+'operations'].includes(path)&&payload?.consent?.action?.startsWith('PROVE_')&&result?.stage==='PROVED')await state.financial.warmAfterProof();return result;
   };return state.financial?state.financial.runExclusive(ordinary):ordinary();
  },
  async close(){state.closed=true;await state.financial?.close();await account.close();},
 });handlers.set(handler,state);return handler;
}
export async function createOriginalDeviceSepoliaDefiSharesHttpV4(runtime,target,input){assert.equal(arguments.length,3);return createHandler(runtime,target,await A.createOriginalDeviceSepoliaDefiSharesAuthorityV4(runtime,target,input));}
/** Retained Original accounts keep their identity instead of birthing a new
 * wallet or journal to mount the public listener after a restart. */
export function createOriginalDeviceSepoliaDefiSharesRetainedHttpV8(runtime,account){assert.equal(arguments.length,2);const binding=A.readOriginalDeviceSepoliaDefiSharesBindingV8(runtime,account);return createHandler(runtime,binding.target,account);}
export function assertOriginalDeviceSepoliaDefiSharesHttpV4(handler){assert.equal(arguments.length,1);original(handler);return handler;}
export function mountOriginalDeviceSepoliaDefiSharesFinancialHttpV8(handler){assert.equal(arguments.length,1);const state=original(handler);assert.ok(!state.closed,'SEPOLIA_DEFI_HTTP_CLOSED');if(!state.financial)state.financial=createOriginalDeviceSepoliaDefiFinancialHttpV8(state.runtime,state.account);return handler;}
/** Start only after the enclosing Original product has completed activation. */
export function startOriginalDeviceSepoliaDefiSharesApprovedWorkerV8(handler){assert.equal(arguments.length,1);const state=original(handler);assert.ok(state.financial&&!state.closed,'SEPOLIA_DEFI_NATIVE_MOUNT_PENDING');state.financial.startApprovedWorker();}
export async function runOriginalDeviceSepoliaDefiSharesApprovedPendingV8(handler){assert.equal(arguments.length,1);const state=original(handler);assert.ok(state.financial&&!state.closed,'SEPOLIA_DEFI_NATIVE_MOUNT_PENDING');return state.financial.runApprovedPending();}
/** A live snapshot shares the queue used by HTTP and the approved worker.
 * Holding only the authority's fail-fast lock can race the worker after listen. */
export async function withOriginalDeviceSepoliaDefiSharesIdleV10(handler,operation){assert.equal(arguments.length,2);const state=original(handler);assert.ok(state.financial&&!state.closed,'SEPOLIA_DEFI_NATIVE_MOUNT_PENDING');assert.equal(typeof operation,'function');return state.financial.runExclusive(operation);}
/** Drain transport and its approved worker before retaining the SAME account. */
export async function quiesceOriginalDeviceSepoliaDefiSharesHttpV8(handler){assert.equal(arguments.length,1);const state=original(handler);state.closed=true;await state.financial?.close();await A.quiesceOriginalDeviceSepoliaDefiFinancialWarmupV8(state.account);}

/** Bind the real seven-rule Source after retained targets/accounts exist. */
export async function mountOriginalDeviceSepoliaDefiPaegFinancialHttpV8(handler,provider){assert.equal(arguments.length,2);const state=original(handler);assert.ok(!state.closed,'SEPOLIA_DEFI_HTTP_CLOSED');mountOriginalDeviceSepoliaDefiSharesFinancialHttpV8(handler);await mountOriginalDeviceSepoliaDefiFinancialSourceV8(state.financial,provider);return handler;}
