/** Genuine owned common-node local source bridge. This never accepts a URL,
 * transport, signer, clock, RPC callback, imported runtime or public brand.
 * Four registered slot descriptors represent four fresh observation passes on
 * one owned node, not independent infrastructure or public-network finality. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
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
