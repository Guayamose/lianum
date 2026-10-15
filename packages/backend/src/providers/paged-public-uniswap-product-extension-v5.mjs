/** Fixed Original Uniswap extension of an already prepared Native3 Root.
 * Configuration selects a reviewed venue and private journal locator only;
 * it cannot supply runtimes, systems, keys, grants or factory callbacks. */
import assert from 'node:assert/strict';
import {dirname,resolve} from 'node:path';
import {readOriginalDevicePagedPublicSourceJournalBindingV5} from '../accounts/authority/device-paged-note-authority-v3.mjs';
import {assertOriginalPagedPublicTestnetRuntimeV1,runOriginalPagedPublicSepoliaUniswapTargetV4,runOriginalPagedPublicSepoliaUniswapMixedSourceV4,reopenOriginalPagedPublicSepoliaUniswapTargetV4,reopenOriginalPagedPublicSepoliaUniswapMixedSourceV4} from './paged-public-testnet-runtimes-v1.mjs';
import {assertOriginalFundedPagedGraphSepoliaWalletV4,assertOriginalPagedSepoliaSourceJournalV4} from '../operations/local/funded-graph-paged-public-kernel-v4.mjs';
import {createOriginalPagedSepoliaUniswapVenueV4,closeOriginalPagedSepoliaUniswapVenueV4} from '../chains/public-testnet/sepolia-uniswap-venue-v4.mjs';
import {closeOriginalSepoliaUniswapTargetSystemV5,retainOriginalSepoliaUniswapTargetV4} from '../operations/local/sepolia-uniswap-target-kernel-v4.mjs';
import {createOriginalDeviceSepoliaUniswapFlatAuthorityV4,reopenOriginalDeviceSepoliaUniswapFlatAuthorityV4,retainOriginalDeviceSepoliaUniswapFlatAuthorityV4} from '../accounts/authority/device-sepolia-uniswap-flat-authority-v4.mjs';
import {createOriginalPagedPublicUniswapContextV4,reopenOriginalPagedPublicUniswapContextV5,readOriginalPagedPublicUniswapContextV4} from './paged-public-uniswap-context-v4.mjs';
import {closeOriginalSepoliaUniswapMixedSourcePlanV4,readOriginalSepoliaUniswapMixedSourceBindingV4,retainOriginalSepoliaUniswapMixedSourceV4} from '../operations/local/sepolia-uniswap-mixed-source-kernel-v4.mjs';
import {createOriginalDeviceSepoliaUniswapFlatHttpV5} from '../api/mobile/device-sepolia-uniswap-flat-http-v5.mjs';
import * as P from '@lianum/mobile-protocol/device/paged-owner-v3';
const extensions=new WeakMap(),births=new WeakMap();
function principal(native,parentAccount,raw){
 assertOriginalPagedPublicTestnetRuntimeV1(native);const root=readOriginalDevicePagedPublicSourceJournalBindingV5(parentAccount);assertOriginalFundedPagedGraphSepoliaWalletV4(root.runtime,root.system);assertOriginalPagedSepoliaSourceJournalV4(root.runtime,root.system,root.bundle);assert.equal(native.metadata.keysetId,root.runtime.metadata.keysetId,'PUBLIC_UNISWAP_PRODUCT_SAME_KEYSET');
 const input=P.pagedOwnerExactV3(raw,['venue','flatJournal']);assert.equal(input.venue,'AAVE_USDC','PUBLIC_UNISWAP_PRODUCT_FIXED_VENUE');P.pagedOwnerExactV3(input.flatJournal,['path','password']);assert.equal(input.flatJournal.path,resolve(input.flatJournal.path));assert.notEqual(dirname(input.flatJournal.path),dirname(root.bundle.vault.path),'PUBLIC_UNISWAP_PRODUCT_JOURNAL_ALIAS');return{root,input:structuredClone(input)};
}
async function build(native,parentAccount,raw,recovery=null){
 const {root,input}=principal(native,parentAccount,raw),previous=births.get(parentAccount);if(previous){assert.ok(!previous.closed,'PUBLIC_UNISWAP_EXTENSION_CLOSED_USE_ORIGINAL_REOPEN');assert.strictEqual(previous.native,native);assert.deepEqual(previous.input,input);assert.strictEqual(previous.recovery,recovery);return previous.work;}const state={native,parentAccount,input,recovery,root,venue:null,target:null,mixedSource:null,mixedPlan:null,flatAccount:null,context:null,http:null,closed:false,handle:null,work:null,closing:null};births.set(parentAccount,state);
 state.work=(async()=>{
 try{
  state.venue=await createOriginalPagedSepoliaUniswapVenueV4(root.runtime,input.venue);state.target=recovery===null?await runOriginalPagedPublicSepoliaUniswapTargetV4(root.runtime,root.system,state.venue):await reopenOriginalPagedPublicSepoliaUniswapTargetV4(root.runtime,root.system,state.venue,recovery.target);
  state.mixedSource=recovery===null?await runOriginalPagedPublicSepoliaUniswapMixedSourceV4(root.runtime,state.target):await reopenOriginalPagedPublicSepoliaUniswapMixedSourceV4(root.runtime,state.target,recovery.mixedSource);
  state.mixedPlan=readOriginalSepoliaUniswapMixedSourceBindingV4(root.runtime,state.mixedSource).plan;principal(native,parentAccount,input);const flatInput={origin:root.bundle.descriptor.origin,devicePublicKey:root.bundle.descriptor.devicePublicKey,journal:input.flatJournal};state.flatAccount=recovery===null?await createOriginalDeviceSepoliaUniswapFlatAuthorityV4(root.runtime,state.target,flatInput):await reopenOriginalDeviceSepoliaUniswapFlatAuthorityV4(root.runtime,state.target,flatInput,recovery.flatAuthority);
  state.context=await(recovery===null?createOriginalPagedPublicUniswapContextV4(root.runtime,state.target,state.mixedSource,state.flatAccount):reopenOriginalPagedPublicUniswapContextV5(root.runtime,state.target,state.mixedSource,state.flatAccount,recovery.providerScope));state.http=createOriginalDeviceSepoliaUniswapFlatHttpV5(root.runtime,state.target,state.context,state.flatAccount);const handle=Object.freeze(Object.create(null));state.handle=handle;extensions.set(handle,state);readOriginalPagedPublicUniswapProductExtensionV5(handle);return handle;
 }catch(error){try{await dispose(state);}catch(cleanupError){throw new AggregateError([error,cleanupError],'PUBLIC_UNISWAP_EXTENSION_ACQUISITION_FAILED');}throw error;}
 })();return state.work;
}
export async function createOriginalPagedPublicUniswapProductExtensionV5(native,parentAccount,input){assert.equal(arguments.length,3);return build(native,parentAccount,input);}
/** The three child tokens belong to the dedicated original Sup7. Each lower
 * owner consumes its own token and recomputes contracts/canonical signed wires. */
export async function reopenOriginalPagedPublicUniswapProductExtensionV5(native,parentAccount,input,tokens){
 assert.equal(arguments.length,4);P.pagedOwnerExactV3(tokens,['target','mixedSource','flatAuthority','providerScope']);return build(native,parentAccount,input,tokens);
}
export function readOriginalPagedPublicUniswapProductExtensionV5(handle){
 assert.equal(arguments.length,1);const s=extensions.get(handle);assert.ok(s&&!s.closed,'PUBLIC_UNISWAP_ORIGINAL_PRODUCT_EXTENSION');principal(s.native,s.parentAccount,s.input);const c=readOriginalPagedPublicUniswapContextV4(s.context);assert.strictEqual(c.runtime,s.root.runtime);assert.strictEqual(c.target,s.target);assert.strictEqual(c.source,s.mixedSource);assert.strictEqual(c.targetAccount,s.flatAccount);return Object.freeze({runtime:s.root.runtime,target:s.target,mixedSource:s.mixedSource,flatAccount:s.flatAccount,context:s.context,parentAccount:s.parentAccount,http:s.http});
}
async function dispose(s){
 if(s.closing)return s.closing;s.closed=true;s.closing=(async()=>{const errors=[];for(const action of [()=>s.flatAccount?.close(),()=>s.mixedPlan?closeOriginalSepoliaUniswapMixedSourcePlanV4(s.root.runtime,s.mixedPlan):undefined,()=>s.target?closeOriginalSepoliaUniswapTargetSystemV5(s.root.runtime,s.target):undefined,()=>s.venue?closeOriginalPagedSepoliaUniswapVenueV4(s.venue):undefined]){try{await action();}catch(error){errors.push(error);}}if(errors.length)throw new AggregateError(errors,'PUBLIC_UNISWAP_EXTENSION_CLOSE_UNCONFIRMED');})();return s.closing;
}
export async function closeOriginalPagedPublicUniswapProductExtensionV5(handle){
 assert.equal(arguments.length,1);const s=extensions.get(handle);assert.ok(s,'PUBLIC_UNISWAP_ORIGINAL_PRODUCT_EXTENSION');return dispose(s);
}

/** Current immutable components are captured while the Root/Source are live.
 * DATA cannot reopen; lower owners later require actual Sup7 component tokens. */
export async function retainOriginalPagedPublicUniswapProductExtensionV5(handle){
 assert.equal(arguments.length,1);const h=readOriginalPagedPublicUniswapProductExtensionV5(handle),target=await retainOriginalSepoliaUniswapTargetV4(h.runtime,h.target),mixedSource=await retainOriginalSepoliaUniswapMixedSourceV4(h.runtime,h.mixedSource),flatAuthority=await retainOriginalDeviceSepoliaUniswapFlatAuthorityV4(h.flatAccount);readOriginalPagedPublicUniswapProductExtensionV5(handle);return Object.freeze({target,mixedSource,flatAuthority});
}
