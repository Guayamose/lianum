/** Public Context facade retains the Original Account check. The lower owner
 * validates Original Target/Mixed/Vault/slot handles and contains no Authority
 * or key-store dependency. Fixed signing consumers use only that lower owner. */
import assert from 'node:assert/strict';
import {assertOriginalDeviceSepoliaUniswapFlatAuthorityV4,readOriginalDeviceSepoliaUniswapFlatSubjectV4,readOriginalDeviceSepoliaUniswapFlatProofBindingV4,readOriginalDeviceSepoliaUniswapFlatJournalBindingV5} from '../accounts/authority/device-sepolia-uniswap-flat-authority-v4.mjs';
import * as Owner from './paged-public-uniswap-context-owner-v5.mjs';
const accounts=new WeakMap();
function state(context){const binding=Owner.readOriginalPagedPublicUniswapContextOwnerV5(context),account=accounts.get(context);assertOriginalDeviceSepoliaUniswapFlatAuthorityV4(account,binding.runtime,binding.target);return {...binding,targetAccount:account};}
export async function createOriginalPagedPublicUniswapContextV4(runtime,target,source,account){
 assert.equal(arguments.length,4);assertOriginalDeviceSepoliaUniswapFlatAuthorityV4(account,runtime,target);const bundle=readOriginalDeviceSepoliaUniswapFlatJournalBindingV5(account,runtime,target),context=await Owner.createOriginalPagedPublicUniswapContextOwnerV5(runtime,target,source,bundle),old=accounts.get(context);assert.ok(old===undefined||old===account,'PUBLIC_UNISWAP_CONTEXT_ALREADY_BORN');accounts.set(context,account);state(context);return context;
}
export async function reopenOriginalPagedPublicUniswapContextV5(runtime,target,source,account,providerScopeToken){
 assert.equal(arguments.length,5);assertOriginalDeviceSepoliaUniswapFlatAuthorityV4(account,runtime,target);const bundle=readOriginalDeviceSepoliaUniswapFlatJournalBindingV5(account,runtime,target),context=await Owner.reopenOriginalPagedPublicUniswapContextOwnerV5(runtime,target,source,bundle,providerScopeToken),old=accounts.get(context);assert.ok(old===undefined||old===account,'PUBLIC_UNISWAP_CONTEXT_ALREADY_BORN');accounts.set(context,account);state(context);return context;
}
export function readOriginalPagedPublicUniswapContextV4(context){assert.equal(arguments.length,1);return Object.freeze(state(context));}
export async function prepareOriginalPagedPublicUniswapDeliveryV4(context,raw){
 assert.equal(arguments.length,2);const s=state(context),subject=await readOriginalDeviceSepoliaUniswapFlatSubjectV4(s.targetAccount),pool=s.target.target.pools[1],refs=(await import('../chains/public-testnet/sepolia-uniswap-venue-v4.mjs')).readFixedSepoliaUniswapVenueReferencesV4();
 // The upper account performs its durable handoff; the lower owner accepts
 // only the SAME original D27 slot after independently checking the plan.
 const intent=(await import('@lianum/mobile-protocol/device/paged-graph-v3')).normalizeDevicePagedUniswapIntentV3(raw);assert.equal(subject.jobId,intent.depositJobId);assert.equal(subject.rootId,intent.rootId);if(Object.hasOwn(intent,'recipient')){assert.equal(intent.recipient,context.template.recipient,'PUBLIC_UNISWAP_REVIEWED_RECIPIENT');assert.equal(intent.recipient,subject.recipient,'PUBLIC_UNISWAP_ORIGINAL_D27_RECIPIENT');}assert.equal(intent.maximumInput,context.template.maximumInput);assert.equal(intent.outputAmount,context.template.outputAmount);for(const [key,value]of Object.entries({output:intent.outputCommitment,amount:intent.outputAmount,validFrom:intent.validFrom,validUntil:intent.validUntil}))assert.equal(subject.statement[key],value,'PUBLIC_UNISWAP_ORIGINAL_D27_INTENT');if(Owner.hasOriginalPagedPublicUniswapPreparationV5(context)){const previous=readOriginalDeviceSepoliaUniswapFlatProofBindingV4(s.targetAccount,subject.jobId);return Owner.prepareOriginalPagedPublicUniswapDeliveryOwnerV5(context,intent,previous.proofSlot);}
 const plan={identity:{chainId:'11155111',router:s.target.router.address.slice(2),solver:s.target.account.slice(2),inputAsset:refs.input.address.slice(2),outputAsset:pool.asset.slice(2),protocol:refs.router.address.slice(2),targetPool:pool.address.slice(2),inputCode:refs.input.codeSHA256,outputCode:refs.venues.AAVE_USDC.output.codeSHA256,protocolCode:refs.router.codeSHA256,poolCode:s.target.router.immutable.poolCode.slice(2),scope:pool.domain.scope,policy:pool.domain.policy},route:{maximumInput:intent.maximumInput,outputAmount:intent.outputAmount,validFrom:intent.validFrom,validUntil:intent.validUntil},ownerPublicInputs:subject.proof.publicInputs};
 await s.targetAccount.bindDelivery(subject.jobId,plan);const binding=readOriginalDeviceSepoliaUniswapFlatProofBindingV4(s.targetAccount,subject.jobId);state(context);return Owner.prepareOriginalPagedPublicUniswapDeliveryOwnerV5(context,intent,binding.proofSlot);
}
/** Recreate only the retained delivery binding on an Original reopened Context.
 * The financial command reader still requires the durable UNKNOWN handoff. */
export async function restoreOriginalPagedPublicUniswapDeliveryV5(context,raw){
 assert.equal(arguments.length,2);const s=state(context),intent=(await import('@lianum/mobile-protocol/device/paged-graph-v3')).normalizeDevicePagedUniswapIntentV3(raw),binding=readOriginalDeviceSepoliaUniswapFlatProofBindingV4(s.targetAccount,intent.depositJobId);return Owner.restoreOriginalPagedPublicUniswapDeliveryOwnerV5(context,intent,binding.proofSlot);
}
export async function inspectOriginalPagedPublicUniswapDeliveryV4(context,nativeId){assert.equal(arguments.length,2);state(context);return Owner.inspectOriginalPagedPublicUniswapDeliveryOwnerV5(context,nativeId);}
export function readOriginalPagedPublicUniswapPreparedDeliveryV4(context){assert.equal(arguments.length,1);state(context);return Owner.readOriginalPagedPublicUniswapPreparedDeliveryOwnerV5(context);}
