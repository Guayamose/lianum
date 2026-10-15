/** Original D27 preparation for a mixed graph. A completed dependency never
 * grants custody of its ERC20 output. Native Paged and target TLS are drained
 * separately; callers close Paged before opening this target connection. */
import {sha256} from '@noble/hashes/sha2.js';
import {createDevicePagedPublicUniswapFetchV5} from './device-paged-uniswap-public-routing-v5.mjs';
import {normalizeDevicePagedUniswapPreparationV3,normalizeDevicePagedUniswapIntentV3} from '../../../../packages/mobile-protocol/src/device-paged-uniswap-v3.mjs';
import {DEVICE_PAGED_PUBLIC_UNISWAP_PREPARATION_V4,normalizeDevicePagedPublicUniswapPreparationV4} from '../../../../packages/mobile-protocol/src/device-paged-uniswap-public-v4.mjs';
import * as P from '../../../../packages/mobile-protocol/src/device-paged-owner-v3.mjs';
import * as E from '../../../../packages/mobile-protocol/src/device-external-flat-note-v1.mjs';
import type {DevicePagedUniswapPreparationV3,DevicePagedUniswapIntentV3} from '../../../../packages/mobile-protocol/src/device-paged-uniswap-v3.mjs';
import {createDeviceExternalFlatRoutedNoteVaultV1} from '../custody/device-external-flat-note-vault-v1';
import {readDevicePublicKey,approveWalletSessionExternalV1,closeWalletSessionAuthorizationV1,signDeviceExternalFlatPermissionV1} from '../custody/key-store';
import {createDeviceExternalFlatNoteApiV1,readDeviceExternalFlatRowV1} from './device-external-flat-note-api-v1.mjs';
import {createDeviceExternalFlatPinnedTransportV1} from './device-paged-connection-transport-v3';
type Input=Readonly<{maximumInput:string;outputAmount:string;recipient:string}>;
type PreparationInput=Input&Readonly<{settleBefore:string}>;
export type DevicePagedUniswapReviewV3=Readonly<Input&{rootId:string;outputCommitment:string;validFrom:string;validUntil:string;targetDescriptor:any;proofReady:boolean}>;
export type DevicePagedUniswapPreparedNodeV3=Readonly<{intent:DevicePagedUniswapIntentV3;targetConnection:DevicePagedUniswapPreparationV3['targetConnection'];targetDescriptor:any;custody:'DEVICE_ERC20_D27';outputSpendAuthorized:false}>;
const reviews=new WeakMap<object,any>(),copies=new WeakMap<object,any>(),proofs=new WeakMap<object,any>(),nodes=new WeakMap<object,any>();
type PreparationFailureStageV3='FIELDS'|'STORAGE'|'ACCESS'|'STATUS'|'RECONCILE'|'DEPOSIT'|'APPROVE'|'SUBMISSION_STORAGE'|'REVIEW'|'BIND'|'SIGN'|'CONSUME'|'SUBMIT'|'ACCEPT';
const preparationFailures=new WeakMap<Error,PreparationFailureStageV3>();
/** Finite diagnostic provenance only; never a review or signing permission. */
export function readDevicePagedUniswapPreparationFailureV3(error:unknown):PreparationFailureStageV3|null{return error instanceof Error?preparationFailures.get(error)??null:null;}
const same=(left:unknown,right:unknown)=>JSON.stringify(left)===JSON.stringify(right);
function need(value:unknown,code='MOBILE_PAGED_UNISWAP_PREPARATION'):asserts value{if(!value)throw Error(code);}
export function readDevicePagedUniswapPreparedNodeV3(value:object,pagedDescriptor:unknown):DevicePagedUniswapPreparedNodeV3{const row=nodes.get(value);need(row&&same(row.paged,P.normalizeDevicePagedDescriptorV3(pagedDescriptor)));return value as DevicePagedUniswapPreparedNodeV3;}
export async function createDevicePagedUniswapPreparationV3(input:{pagedDescriptor:unknown;preparation:unknown;signal:AbortSignal}){
 need(input.signal instanceof AbortSignal&&!input.signal.aborted);const paged=P.normalizeDevicePagedDescriptorV3(input.pagedDescriptor),preparation=(input.preparation as {profile?:unknown})?.profile===DEVICE_PAGED_PUBLIC_UNISWAP_PREPARATION_V4?normalizeDevicePagedPublicUniswapPreparationV4(input.preparation,paged):normalizeDevicePagedUniswapPreparationV3(input.preparation,paged),descriptor=preparation.targetConnection.descriptor;
 need(await readDevicePublicKey()===paged.devicePublicKey);const controller=new AbortController(),abort=()=>controller.abort();input.signal.addEventListener('abort',abort,{once:true});if(input.signal.aborted)controller.abort();
 let transport:Awaited<ReturnType<typeof createDeviceExternalFlatPinnedTransportV1>>|null=null,vault:Awaited<ReturnType<typeof createDeviceExternalFlatRoutedNoteVaultV1>>|null=null,client:ReturnType<typeof createDeviceExternalFlatNoteApiV1>|null=null,closed=false,closing:Promise<void>|null=null,busy=false,work:Promise<unknown>|null=null,activeReview:DevicePagedUniswapReviewV3|null=null;
 const live=()=>need(!closed&&!controller.signal.aborted&&!input.signal.aborted,'MOBILE_PAGED_UNISWAP_CLOSED');
 async function close(){if(closing)return closing;closed=true;controller.abort();input.signal.removeEventListener('abort',abort);client?.close();closing=(async()=>{await work?.catch(()=>{});if(activeReview){const row=reviews.get(activeReview);E.externalFlatWipeV1(row?.witness);reviews.delete(activeReview);activeReview=null;}const result=await Promise.allSettled([vault?.close(),transport?.close()]);need(result.every(row=>row.status==='fulfilled'),'MOBILE_PAGED_UNISWAP_CLOSE_UNCONFIRMED');})();return closing;}
 async function run<T>(fn:()=>Promise<T>):Promise<T>{live();need(!busy,'MOBILE_PAGED_UNISWAP_BUSY');busy=true;const current=(async()=>{try{return await fn();}finally{busy=false;}})();work=current;return current;}
 function proofResult(row:ReturnType<typeof readDeviceExternalFlatRowV1>,review:DevicePagedUniswapReviewV3){const result=Object.freeze({jobId:row.jobId,rootId:row.consentFields.rootId,proofSHA256:row.consentFields.proofSHA256});proofs.set(result,{owner:apiMarker,review,row,used:false});return result;}
 async function access(){live();const consent=await client!.challenge(),signature=await signDeviceExternalFlatPermissionV1(consent,descriptor.origin,descriptor.pairingId,controller.signal);live();return{consent,signature};}
 try{transport=await createDeviceExternalFlatPinnedTransportV1({descriptor,...preparation.targetConnection.transport,signal:controller.signal});live();vault=await createDeviceExternalFlatRoutedNoteVaultV1(descriptor);live();const originalFetch=transport.fetchImpl;
  const fetchImpl:typeof fetch=(preparation as {profile?:unknown}).profile===DEVICE_PAGED_PUBLIC_UNISWAP_PREPARATION_V4?createDevicePagedPublicUniswapFetchV5(originalFetch,descriptor):originalFetch;client=createDeviceExternalFlatNoteApiV1({descriptor,fetchImpl});}
 catch(error){await close().catch(()=>{});throw error;}
 return Object.freeze({targetConnection:preparation.targetConnection,
  prepare(raw:PreparationInput){return run(async()=>{
   let failureStage:PreparationFailureStageV3='FIELDS';try{
   need(activeReview===null);const fields=E.externalFlatExactV1(raw,['maximumInput','outputAmount','recipient','settleBefore']);
   need(fields.maximumInput===preparation.template.maximumInput&&fields.outputAmount===preparation.template.outputAmount&&fields.recipient===preparation.template.recipient);
   E.externalFlatUintV1(fields.settleBefore);E.externalFlatUintV1(fields.maximumInput);E.externalFlatUintV1(fields.outputAmount);E.externalFlatHexV1(fields.recipient,40);
   need(BigInt(fields.maximumInput)>0n&&BigInt(fields.outputAmount)>0n&&fields.recipient!=='0'.repeat(40));
   // Open/migrate this local ROOT before either original 15-second read lease.
   // The discarded summary cannot issue an SDK observation or permission.
   failureStage='STORAGE';await vault!.summary();live();
   failureStage='ACCESS';const granted=await access();failureStage='STATUS';const status=await client!.status(granted.consent,granted.signature);live();
   failureStage='RECONCILE';const summary=await vault!.reconcileOriginalStatus(status);live();const chainLimit=BigInt(paged.chainDeadlineSeconds??Math.floor(paged.deadlineMs/1000));
   if(status.jobs.length!==0){
    need(status.jobs.length===1&&summary.jobs.length===1&&summary.pending===null&&summary.graph===null);
    const row=readDeviceExternalFlatRowV1(status.jobs[0]),c=row.consentFields,statement=E.normalizeExternalFlatIntentStatementV1(c.statement);
    need(row.mode==='deposit_intent'&&row.stage==='PROVED'&&same(row,summary.jobs[0])&&same(row.descriptor,descriptor));
    need(c.rootId===summary.rootId&&c.recipient===fields.recipient&&statement.amount===fields.outputAmount&&statement.output===summary.commitment);
    need(typeof statement.validFrom==='string'&&typeof statement.validUntil==='string'&&typeof statement.output==='string');
    need(BigInt(status.observed.timestamp)>=BigInt(statement.validFrom)&&BigInt(status.observed.timestamp)<BigInt(statement.validUntil)&&BigInt(statement.validUntil)<chainLimit&&BigInt(statement.validUntil)<=BigInt(fields.settleBefore));
    const review=Object.freeze({...fields,rootId:c.rootId,outputCommitment:statement.output,validFrom:statement.validFrom,validUntil:statement.validUntil,targetDescriptor:descriptor,proofReady:true});
    reviews.set(review,{owner:apiMarker,draft:null,witness:null,accepted:row,used:false});activeReview=review;return review;
   }
   need(summary.pending===null);const validFrom=status.observed.timestamp,validUntil=[BigInt(validFrom)+7200n,chainLimit-1n,BigInt(fields.settleBefore)].reduce((minimum,value)=>value<minimum?value:minimum).toString();need(BigInt(validFrom)<BigInt(validUntil));
   failureStage='DEPOSIT';const prepared=await vault!.prepareDeposit(descriptor,fields.recipient,fields.outputAmount,validFrom,validUntil);let retained=false;
   try{live();need(prepared.draft.action==='PROVE_D27'&&prepared.draft.statement!==null);const review=Object.freeze({...fields,rootId:prepared.draft.rootId,outputCommitment:prepared.draft.statement.output,validFrom,validUntil,targetDescriptor:descriptor,proofReady:false});reviews.set(review,{owner:apiMarker,draft:prepared.draft,witness:prepared.witness,accepted:null,used:false});activeReview=review;retained=true;return review;}finally{if(!retained)E.externalFlatWipeV1(prepared.witness);}
   }catch(error){if(error instanceof Error)preparationFailures.set(error,failureStage);throw error;}
  });},
  provePrepared(review:DevicePagedUniswapReviewV3){return run(async()=>{const selected=reviews.get(review);need(selected?.owner===apiMarker&&!selected.used&&activeReview===review);if(selected.accepted){selected.used=true;return proofResult(selected.accepted,review);}if(!selected.witness){const rebuilt=await vault!.prepareDeposit(descriptor,review.recipient,review.outputAmount,review.validFrom,review.validUntil);need(same(rebuilt.draft,selected.draft));selected.witness=rebuilt.witness;}selected.used=true;let authorization:object|null=null,storage:object|null=null,arm:object|null=null,consent:any=null,consumed=false,failureStage:PreparationFailureStageV3='APPROVE';
   try{authorization=await approveWalletSessionExternalV1('NOTE',descriptor,selected.draft,controller.signal);live();failureStage='SUBMISSION_STORAGE';storage=await vault!.beginSubmissionStorage('NOTE',selected.draft,controller.signal);failureStage='ACCESS';const granted=await access();failureStage='REVIEW';consent=await client!.review(granted.consent,granted.signature,selected.draft);live();need(storage);failureStage='BIND';arm=await vault!.bindSubmissionStorage(storage,consent);need(arm);storage=null;failureStage='SIGN';const signature=await signDeviceExternalFlatPermissionV1(consent,descriptor.origin,descriptor.pairingId,controller.signal,authorization??undefined);authorization=null;failureStage='CONSUME';await vault!.consumeSubmissionArm(arm,consent);consumed=true;failureStage='SUBMIT';const submitted=await client!.submit(consent,signature,selected.witness);need(!('quote' in submitted));const accepted=readDeviceExternalFlatRowV1(submitted);live();need(accepted.stage==='PROVED'&&accepted.mode==='deposit_intent');failureStage='ACCEPT';await vault!.accept(accepted);return proofResult(accepted,review);}
   catch(error){if(error instanceof Error)preparationFailures.set(error,failureStage);if(!consumed&&arm&&consent){await vault!.recoverUnsubmittedStorage(arm,consent);selected.used=false;}else if(!arm&&!consent)selected.used=false;throw error;}
   finally{if(authorization)closeWalletSessionAuthorizationV1(authorization);if(storage)vault!.endSubmissionStorage(storage);E.externalFlatWipeV1(selected.witness);selected.witness=null;}
  });},
  exportBackup(passphrase:string){return run(async()=>{const serialized=await vault!.exportBackup(passphrase,paged.devicePublicKey,controller.signal);live();return serialized;});},
  verifyBackupCopy(serialized:string,passphrase:string){return run(async()=>{need(activeReview!==null);const checkpoint=await vault!.verifyBackupCopy(serialized,passphrase,paged.devicePublicKey,controller.signal);live();const receipt=Object.freeze({backupSHA256:Array.from(sha256(new TextEncoder().encode(serialized)),byte=>byte.toString(16).padStart(2,'0')).join(''),rootId:checkpoint.rootId});copies.set(receipt,{owner:apiMarker,checkpoint,used:false});return receipt;});},
  completePreparedNode(result:object,copy:object){return run(async()=>{const proof=proofs.get(result),receipt=copies.get(copy);need(proof?.owner===apiMarker&&!proof.used&&receipt?.owner===apiMarker&&!receipt.used);proof.used=true;receipt.used=true;const checkpoint=await vault!.recoveryCheckpoint();need(same(checkpoint,receipt.checkpoint));const summary=await vault!.summary(),row=summary.jobs.find(value=>value.jobId===proof.row.jobId),review=proof.review;need(summary.pending===null&&row?.stage==='PROVED'&&same(row,proof.row)&&summary.rootId===review.rootId&&summary.commitment===review.outputCommitment);const intent=normalizeDevicePagedUniswapIntentV3({kind:'UNISWAP_V3_EXACT_OUTPUT_SINGLE',depositJobId:row.jobId,rootId:review.rootId,outputCommitment:review.outputCommitment,maximumInput:review.maximumInput,outputAmount:review.outputAmount,validFrom:review.validFrom,validUntil:review.validUntil,...((preparation as {profile?:unknown}).profile===DEVICE_PAGED_PUBLIC_UNISWAP_PREPARATION_V4?{recipient:review.recipient}:{})}),node=Object.freeze({intent,targetConnection:preparation.targetConnection,targetDescriptor:descriptor,custody:'DEVICE_ERC20_D27' as const,outputSpendAuthorized:false as const});nodes.set(node,{paged});return node;});},
  close,
 });
 // Each prepared review and copy belongs exclusively to this helper instance.
 function apiMarker(){}
}
