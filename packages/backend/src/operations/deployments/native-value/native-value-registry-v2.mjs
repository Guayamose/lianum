/** Complete typed adapter-root inventory. Pure validation grants no ownership. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { exactRecord, fixedArray, ZERO } from '../../../execution/encoding/commitments.mjs';
import { cloneInput, frozenInput, inputUint } from '../../../execution/account/preparation/readiness-inputs.mjs';
import { registryCommitment, assertRegistration, assertSource, profileCommitment, validateProfile }
  from '../../../chains/shared/transfers/generic-native-value-v2.mjs';
import { PROFILE_SCHEMA as EVM_SCHEMA } from '../../../chains/evm/transfers/evm-native-value-v2.mjs';
export const NATIVE_VALUE_REGISTRATION_PROFILE = 'COMPLETE_TYPED_NATIVE_VALUE_ADAPTER_ROOT_V2';
const node = (a, b) => createHash('sha256').update(Buffer.from('01' + a + b, 'hex')).digest('hex');
/** Every nonzero registered leaf is present, with all four ordered sources. An
 * opaque or skipped leaf cannot silently evade health coverage. BTC/SOL custody
 * leaves require their later versioned source integration, not a reinterpretation. */
export function assertNativeValueRegistrations(raw) {
  const input = cloneInput(raw); exactRecord(input, ['registry', 'profiles']);
  registryCommitment(input.registry);
  assert.ok(Array.isArray(input.profiles) && input.profiles.length > 0 && input.profiles.length <= 5,
    'NATIVE_VALUE_REGISTERED_PROFILE_COUNT');
  fixedArray(input.profiles, input.profiles.length);
  const leaves = Array(8).fill(ZERO), profiles = new Set(), chains = new Set();
  for (const entry of input.profiles) {
    exactRecord(entry, ['profile', 'profilePath', 'sources']);
    const p = validateProfile(entry.profile), digest = profileCommitment(p);
    const position = Number(inputUint(entry.profilePath.index, 8, 7n));
    assert.equal(leaves[position], ZERO, 'NATIVE_VALUE_DUPLICATE_PROFILE_POSITION');
    assert.ok(!profiles.has(digest), 'NATIVE_VALUE_DUPLICATE_PROFILE'); profiles.add(digest); leaves[position] = digest;
    const chain = p.schema === EVM_SCHEMA ? 'EVM:' + p.chainId : 'TRON';
    assert.ok(!chains.has(chain), 'NATIVE_VALUE_DUPLICATE_CHAIN_PROFILE'); chains.add(chain);
    assertRegistration(p, input.registry, entry.profilePath); fixedArray(entry.sources, 4);
    const operators = new Set(), endpoints = new Set();
    entry.sources.forEach((source, i) => {
      assertSource(p, source); assert.equal(source.index, String(i), 'NATIVE_VALUE_ORDERED_SOURCE_POSITION');
      assert.ok(!operators.has(source.identity.operatorIdentity), 'NATIVE_VALUE_DUPLICATE_SOURCE_OPERATOR');
      assert.ok(!endpoints.has(source.identity.endpointIdentity), 'NATIVE_VALUE_DUPLICATE_SOURCE_ENDPOINT');
      operators.add(source.identity.operatorIdentity); endpoints.add(source.identity.endpointIdentity);
    });
  }
  let level = leaves;
  while (level.length > 1) level = Array.from({ length: level.length / 2 }, (_, i) => node(level[2 * i], level[2 * i + 1]));
  assert.equal(level[0], input.registry.quorum.rulesRoot, 'NATIVE_VALUE_INCOMPLETE_ADAPTER_INVENTORY');
  // The same signer slot must denote the same operator identity across profiles.
  for (const entry of input.profiles) entry.sources.forEach((source, i) =>
    assert.equal(source.identity.operatorIdentity, input.profiles[0].sources[i].identity.operatorIdentity,
      'NATIVE_VALUE_CROSS_PROFILE_OPERATOR_POSITION'));
  return frozenInput(input);
}
