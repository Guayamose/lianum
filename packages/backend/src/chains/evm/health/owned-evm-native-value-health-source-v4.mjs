/** Genuine owned common-node local source bridge. This never accepts a URL,
 * transport, signer, clock, RPC callback, imported runtime or public brand.
 * Four registered slot descriptors represent four fresh observation passes on
 * one owned node, not independent infrastructure or public-network finality. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, join, parse } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { exactRecord } from '../../../execution/encoding/commitments.mjs';
import { cloneInput, frozenInput } from '../../../execution/account/preparation/readiness-inputs.mjs';
import { validateProfile, assertSource } from '../../shared/transfers/generic-native-value-v2.mjs';
import { PROFILE_SCHEMA } from '../transfers/evm-native-value-v2.mjs';
import { assertOwnedLocalEvmNativeValueRuntime, openOwnedLocalEvmNativeValueSource } from '../runtime/owned-evm-v2-runtime.mjs';
const openings = new WeakMap(), sha = raw => createHash('sha256').update(raw).digest('hex');
function index(value) {
  assert.ok(Number.isSafeInteger(value) && value >= 0 && value < 4 && !Object.is(value, -0), 'OWNED_NATIVE_SOURCE_FIXED_SLOT');
  return value;
}
/** Private token consumer. No issuer is exported, and it exposes no transport. */
export function consumeOwnedEvmNativeSourceRequest(request, nativeRuntime) {
  assert.equal(arguments.length, 2, 'OWNED_NATIVE_SOURCE_TOKEN_ARITY');
  const value = openings.get(request);
  assert.ok(value && value.nativeRuntime === nativeRuntime, 'OWNED_NATIVE_SOURCE_ORIGINAL_REQUEST_REQUIRED');
  openings.delete(request); return value.sourceIndex;
}
async function open(nativeRuntime, sourceIndex) {
  index(sourceIndex); await assertOwnedLocalEvmNativeValueRuntime(nativeRuntime);
  const token = Object.freeze(Object.create(null)); openings.set(token, { nativeRuntime, sourceIndex });
  try { return await openOwnedLocalEvmNativeValueSource(nativeRuntime, token); }
  finally { openings.delete(token); }
}
/** Observed data only. Stable per original runtime/slot, distinct across runtime
 * instances even at the same genesis. No original process is started here. */
export async function describeOwnedLocalEvmNativeValueSource(nativeRuntime, sourceIndex) {
  assert.equal(arguments.length, 2, 'OWNED_NATIVE_SOURCE_DESCRIPTOR_ARITY');
  const source = await open(nativeRuntime, sourceIndex);
  await source.assertCurrent(); return source.descriptor;
}
/** Original local source only. The V4 observer consumes original private history
 * and derives its current receiver clock from that token. There is no caller
 * clock, endpoint, transport or known-good/verified flag at this boundary. */
export async function createOwnedLocalEvmNativeValueHealthSource(raw) {
  assert.equal(arguments.length, 1, 'OWNED_NATIVE_SOURCE_FACTORY_ARITY');
  exactRecord(raw, ['nativeRuntime', 'policy', 'source', 'original', 'currentRegistry', 'history']);
  const { nativeRuntime, currentRegistry, history } = raw;
  const policy = cloneInput(raw.policy), source = cloneInput(raw.source), original = cloneInput(raw.original);
  exactRecord(policy, ['ledgerNamespace', 'registry', 'profile', 'profilePath']);
  exactRecord(source, ['identity', 'index', 'siblings']);
  const profile = validateProfile(policy.profile); assert.equal(profile.schema, PROFILE_SCHEMA, 'OWNED_NATIVE_SOURCE_EVM_PROFILE');
  assert.ok(typeof source.index === 'string' && /^[0-3]$/.exec(source.index)?.[0] === source.index, 'OWNED_NATIVE_SOURCE_FIXED_SLOT');
  const sourceIndex = Number(source.index), owned = await open(nativeRuntime, sourceIndex), descriptor = owned.descriptor;
  assert.equal(profile.chainId, descriptor.chainId, 'OWNED_NATIVE_SOURCE_REGISTERED_CHAIN');
  assert.equal(profile.genesis, descriptor.genesis, 'OWNED_NATIVE_SOURCE_REGISTERED_GENESIS');
  assertSource(profile, source);
  for (const name of ['endpointIdentity', 'clientRelease', 'chainConfiguration'])
    assert.equal(source.identity[name], descriptor.identity[name], 'OWNED_NATIVE_SOURCE_REGISTERED_' + name.toUpperCase());
  assert.equal(source.identity.operatorIdentity, sha('LIANUM/owned-local-native-operator-slot/1\0' + sourceIndex),
    'OWNED_NATIVE_SOURCE_REGISTERED_OPERATOR_SLOT');
  await owned.assertCurrent();
  // The only delegated transport is the original runtime's bounded private
  // read closure. It checks client identity on every call; no results cached.
  const { createOwnedEvmNativeValueHealthSource } = await import('./evm-native-value-health-source-v4.mjs');
  return createOwnedEvmNativeValueHealthSource({ policy: frozenInput(policy),
    source: Object.freeze({ ...frozenInput(source), transport: owned.transport }), original: frozenInput(original),
    currentRegistry, history });
}

// Fixed canonical clients live outside the frozen compiler mapper. Their
// factories authenticate the actual pinned recipe and original kernel births.
let originalRollupClients;
async function rollupClients() {
  if(!originalRollupClients)originalRollupClients=(async()=>{
    let root=dirname(fileURLToPath(import.meta.url));
    while(root!==parse(root).root){
      if(existsSync(join(root,'scripts/layout.json')) && existsSync(join(root,'package.json'))
        && JSON.parse(readFileSync(join(root,'package.json'),'utf8')).name==='lianum')break;
      root=dirname(root);
    }
    assert(root!==parse(root).root,'OWNED_NATIVE_SOURCE_ORIGINAL_REPOSITORY_REQUIRED');root=realpathSync(root);
    return Object.freeze([
      Object.freeze({module:await import(pathToFileURL(join(root,'scripts/development/owned-base-rollup-v1.mjs')).href),
        prefix:'BaseRollup',chainId:'8453',profile:'OWNED_BASE_NATIVE_VALUE_ROLLUP_POS_V1'}),
      Object.freeze({module:await import(pathToFileURL(join(root,'scripts/development/owned-arbitrum-nitro-v1.mjs')).href),
        prefix:'ArbitrumNitro',chainId:'42161',profile:'OWNED_ARBITRUM_NITRO_NATIVE_VALUE_POS_V1'})]);
  })();return originalRollupClients;
}
/** A branded original native client only; copied profile/genesis/identity data
 * never opens this entry. Null lets the old fixed Tron branch stay unchanged. */
export async function openOriginalOwnedRollupNativeValueSourcesV1(nativeRuntime) {
  assert.equal(arguments.length,1,'OWNED_NATIVE_SOURCE_ORIGINAL_CLIENT_ARITY');
  const selected=(await rollupClients()).find(row=>row.module['isOwned'+row.prefix+'NativeValueClusterV1'](nativeRuntime));
  if(!selected)return null;
  const api=selected.module,assertLive=()=>api['assertOwned'+selected.prefix+'NativeValueLiveV1'](nativeRuntime);
  assertLive();
  const original=cloneInput(await api['readOwned'+selected.prefix+'NativeValueIdentityV1'](nativeRuntime));assertLive();
  exactRecord(original,['profile','chainId','genesis','parentGenesis','sourceCommit','publicNetwork',
    'independentInfrastructureEstablished','rollupChallengeFinalityEstablished','identity']);
  assert.equal(original.profile,selected.profile);assert.equal(original.chainId,selected.chainId);
  for(const name of ['genesis','parentGenesis'])assert(/^[0-9a-f]{64}$/.test(original[name]),'OWNED_NATIVE_SOURCE_ORIGINAL_IDENTITY');
  assert(/^[0-9a-f]{40}$/.test(original.sourceCommit),'OWNED_NATIVE_SOURCE_ORIGINAL_IDENTITY');
  for(const flag of ['publicNetwork','independentInfrastructureEstablished','rollupChallengeFinalityEstablished'])assert.equal(original[flag],false);
  exactRecord(original.identity,['endpointIdentity','clientRelease','chainConfiguration']);
  for(const value of Object.values(original.identity))assert(/^[0-9a-f]{64}$/.test(value),'OWNED_NATIVE_SOURCE_ORIGINAL_IDENTITY');
  const descriptors=frozenInput([0,1,2,3].map(sourceIndex=>({chainId:selected.chainId,genesis:original.genesis,
    sourceIndex:String(sourceIndex),publicNetwork:false,commonHost:true,commonNode:true,
    classification:'OWNED_LOCAL_ROLLUP_CLIENT_SOURCE_V1',identity:{...original.identity,
      endpointIdentity:sha('LIANUM/owned-local-rollup-source/1\0'+original.identity.endpointIdentity+'/'+sourceIndex)}})));
  async function assertCurrent() {
    assertLive();const current=cloneInput(await api['readOwned'+selected.prefix+'NativeValueIdentityV1'](nativeRuntime));
    assert.deepEqual(current,original,'OWNED_NATIVE_SOURCE_ORIGINAL_CLIENT_CHANGED');assertLive();
  }
  async function createSource(raw) {
    exactRecord(raw,['policy','source','original','currentRegistry','history']);
    const policy=cloneInput(raw.policy),source=cloneInput(raw.source),transfer=cloneInput(raw.original);
    exactRecord(policy,['ledgerNamespace','registry','profile','profilePath']);exactRecord(source,['identity','index','siblings']);
    const profile=validateProfile(policy.profile);assert.equal(profile.schema,PROFILE_SCHEMA);
    assert.equal(profile.chainId,selected.chainId,'OWNED_NATIVE_SOURCE_REGISTERED_CHAIN');assert.equal(profile.genesis,original.genesis,'OWNED_NATIVE_SOURCE_REGISTERED_GENESIS');
    assert.ok(typeof source.index==='string'&&/^[0-3]$/.test(source.index),'OWNED_NATIVE_SOURCE_FIXED_SLOT');
    const descriptor=descriptors[Number(source.index)];assertSource(profile,source);
    for(const name of ['endpointIdentity','clientRelease','chainConfiguration'])assert.equal(source.identity[name],descriptor.identity[name],'OWNED_NATIVE_SOURCE_REGISTERED_IDENTITY');
    assert.equal(source.identity.operatorIdentity,sha('LIANUM/owned-local-native-operator-slot/1\0'+source.index),'OWNED_NATIVE_SOURCE_REGISTERED_OPERATOR_SLOT');
    await assertCurrent();
    const transport=async(method,params,options)=>{
      assertLive();exactRecord(options,['signal']);assert(options.signal instanceof AbortSignal,'OWNED_NATIVE_SOURCE_ABORT_SIGNAL');options.signal.throwIfAborted();
      const value=await api['readOwned'+selected.prefix+'NativeValueRpcV1'](nativeRuntime,method,params);
      options.signal.throwIfAborted();assertLive();return value;
    };
    const {createOwnedEvmNativeValueHealthSource}=await import('./evm-native-value-health-source-v4.mjs');
    const observer=await createOwnedEvmNativeValueHealthSource({policy:frozenInput(policy),source:Object.freeze({...frozenInput(source),transport}),
      original:frozenInput(transfer),currentRegistry:raw.currentRegistry,history:raw.history});
    assertLive();return observer;
  }
  return Object.freeze({descriptors,assertLive,createSource});
}
