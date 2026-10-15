/** Original readonly per-note previews. Quantities come from the pure exact
 * partition; each quantity reaches the actual fixed venue previewMint reader.
 * The resulting DATA owns no custody, signing grant or execution capability. */
import assert from 'node:assert/strict';
import {planDeviceSepoliaMorphoShareNotesV4} from '@lianum/mobile-protocol/device/sepolia-defi-share-plan-v4';
import {externalFlatExactV1} from '@lianum/mobile-protocol/device/source-note-v1';
import {normalizeDeviceSepoliaMorphoBatchReviewV5,DEVICE_SEPOLIA_MORPHO_BATCH_REVIEW_V5} from '@lianum/mobile-protocol/device/sepolia-morpho-batch-review-v5';
import {quoteOriginalMorphoV2SepoliaSharesV4} from './morpho-v2-sepolia-original-v4.mjs';
const original=new WeakMap();
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
export async function quoteOriginalMorphoV2SepoliaSharePlanV5(venue,input){
 assert.equal(arguments.length,2);const plan=planDeviceSepoliaMorphoShareNotesV4(input),notes=[];let maximumInput=0n,identity;
 for(const note of plan.notes){
  const quote=await quoteOriginalMorphoV2SepoliaSharesV4(venue,note.sharesAtomic),view=quote.view;
  const observedIdentity={networkId:view.networkId,genesis:view.genesis,shareAsset:view.addresses.vault,underlying:view.addresses.underlying};if(identity)assert.deepEqual(observedIdentity,identity);else identity=observedIdentity;
  assert.equal(view.shares,note.sharesAtomic);assert.equal(view.shareDecimals,18);assert.equal(view.underlyingDecimals,6);
  assert.ok(quote.quoteIsAuthorization===false&&quote.privateOutputPrepared===false&&view.financialAuthority===false);
  maximumInput+=BigInt(view.maximumInputAtomic);assert.ok(maximumInput>0n&&maximumInput<(1n<<128n),'MORPHO_SHARE_PLAN_USDC_LIMIT');
  notes.push({...note,maximumInputAtomic:view.maximumInputAtomic,estimatedUnderlyingAtomic:view.estimatedUnderlyingAtomic,head:view.head});
 }
 const data=freeze({profile:'ORIGINAL_MORPHO_V2_SEPOLIA_SHARE_PLAN_QUOTES_V5',plan,maximumNodes:input.maximumNodes,...identity,underlyingDecimals:6,maximumInputAtomic:maximumInput.toString(),notes,quoteIsAuthorization:false,originalCustodyPerNoteRequired:true,aggregateReviewRequired:true});
 original.set(data,venue);return data;
}
/** A copied price DTO cannot establish original reader provenance. This read
 * still grants no signing permission; every note needs its reviewed issuer. */
export function readOriginalMorphoV2SepoliaSharePlanQuotesV5(venue,data){
 assert.equal(arguments.length,2);assert.ok(original.has(data)&&original.get(data)===venue,'MORPHO_SHARE_PLAN_ORIGINAL_QUOTES');return data;
}

/** Wire DATA built from this actual Original quote plan. The supplied leaves
 * remain public requests: original mobile custody/approval and each original
 * issuer/D27 must separately establish the rights for those exact quantities. */
export function buildOriginalMorphoV2SepoliaShareBatchReviewV5(venue,data,raw){
 assert.equal(arguments.length,3);readOriginalMorphoV2SepoliaSharePlanQuotesV5(venue,data);const input=externalFlatExactV1(raw,['reference','notes']);
 const review=normalizeDeviceSepoliaMorphoBatchReviewV5({profile:DEVICE_SEPOLIA_MORPHO_BATCH_REVIEW_V5,reference:input.reference,totalSharesAtomic:data.plan.totalSharesAtomic,maximumNodes:data.maximumNodes,maximumInputAtomic:data.maximumInputAtomic,notes:input.notes});
 for(let index=0;index<review.notes.length;index++){const leaf=review.notes[index].review;assert.equal(leaf.maximumInputAtomic,data.notes[index].maximumInputAtomic,'MORPHO_SHARE_PLAN_ORIGINAL_PREVIEW_REQUIRED');assert.equal(leaf.descriptor.poolTerms.asset,data.shareAsset.slice(2),'MORPHO_SHARE_PLAN_ORIGINAL_ASSET');assert.equal(leaf.descriptor.poolTerms.genesis,data.genesis.slice(2),'MORPHO_SHARE_PLAN_ORIGINAL_GENESIS');}
 return review;
}
