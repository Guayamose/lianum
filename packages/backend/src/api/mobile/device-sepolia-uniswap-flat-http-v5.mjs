/** Finite Original PUBLIC output-note transport. It has no Core/provider
 * dependency, private key, financial send or caller callback. The upper
 * operator binds this SAME handler to its Original Scope before listening. */
import assert from 'node:assert/strict';
import {assertOriginalDeviceSepoliaUniswapFlatAuthorityV4,readOriginalDeviceSepoliaUniswapFlatJournalBindingV5} from '../../accounts/authority/device-sepolia-uniswap-flat-authority-v4.mjs';
import {readOriginalPagedPublicUniswapContextOwnerV5} from '../../providers/paged-public-uniswap-context-owner-v5.mjs';
import {assertOriginalSepoliaUniswapFlatJournalV4} from '../../operations/local/sepolia-uniswap-target-kernel-v4.mjs';
const handlers=new WeakMap(),prefix='/v1/mobile/external-flat-share/';
export function createOriginalDeviceSepoliaUniswapFlatHttpV5(runtime,target,context,account){
 assert.equal(arguments.length,4);assertOriginalDeviceSepoliaUniswapFlatAuthorityV4(account,runtime,target);const c=readOriginalPagedPublicUniswapContextOwnerV5(context);assert.strictEqual(c.runtime,runtime);assert.strictEqual(c.target,target);const bundle=readOriginalDeviceSepoliaUniswapFlatJournalBindingV5(account,runtime,target);assertOriginalSepoliaUniswapFlatJournalV4(runtime,target,bundle);assert.deepEqual(context.targetDescriptor,account.descriptor());const handler=Object.freeze(Object.create(null));handlers.set(handler,{runtime,target,context,account,bundle,descriptor:account.descriptor()});return handler;
}
export function readOriginalDeviceSepoliaUniswapFlatHttpV5(handler){
 assert.equal(arguments.length,1);const s=handlers.get(handler);assert.ok(s,'PUBLIC_UNISWAP_ORIGINAL_HTTP');assertOriginalDeviceSepoliaUniswapFlatAuthorityV4(s.account,s.runtime,s.target);assertOriginalSepoliaUniswapFlatJournalV4(s.runtime,s.target,s.bundle);const c=readOriginalPagedPublicUniswapContextOwnerV5(s.context);assert.strictEqual(c.target,s.target);assert.strictEqual(c.runtime,s.runtime);assert.deepEqual(s.account.descriptor(),s.descriptor);return Object.freeze({runtime:s.runtime,target:s.target,context:s.context,account:s.account,descriptor:s.account.descriptor()});
}
export async function dispatchOriginalDeviceSepoliaUniswapFlatHttpV5(handler,path,payload,pairingId,observedNativeId=null){
 assert.ok(arguments.length===4||arguments.length===5);const s=readOriginalDeviceSepoliaUniswapFlatHttpV5(handler);assert.equal(pairingId,s.descriptor.pairingId,'PUBLIC_UNISWAP_HTTP_PAIRING');assert.ok(typeof path==='string'&&path.startsWith(prefix)&&!path.includes('?')&&!path.includes('#'),'PUBLIC_UNISWAP_HTTP_ROUTE');assert.ok(Buffer.byteLength(JSON.stringify(payload))<=(path.endsWith('/private-operations')?16384:8192));assert.ok(observedNativeId===null||/^0x[0-9a-f]{64}$/.test(observedNativeId),'PUBLIC_UNISWAP_HTTP_OBSERVATION_HASH');switch(path.slice(prefix.length)){
  case'challenges':assert.deepEqual(payload,{pairingId:s.descriptor.pairingId});assert.equal(observedNativeId,null);return s.account.challengeAccess();
  case'reviews':assert.equal(observedNativeId,null);return s.account.reviewHttp(payload);
  case'private-operations':assert.equal(observedNativeId,null);assert.equal(payload?.consent?.action,'PROVE_D27');return s.account.operationHttp(payload);
  case'operations':assert.equal(payload?.consent?.action,'OBSERVE_D27');return s.account.operationHttp(payload,observedNativeId);
  case'status':assert.equal(observedNativeId,null);return s.account.status(payload);
  default:assert.fail('PUBLIC_UNISWAP_HTTP_ROUTE');
 }
}
