import test from 'node:test';
import assert from 'node:assert/strict';
import * as kernel from '../../../src/operations/operators/native-value/native-value-operators-v3.mjs';
import * as evm from '../../../src/chains/evm/health/evm-native-value-health-source-v3.mjs';
import * as tron from '../../../src/chains/tron/health/tron-native-value-health-source-v3.mjs';
import * as shared from '../../../src/chains/shared/health/native-value-health-source-v3.mjs';
import { createEvmNativeValueHealthReaderV3 } from '../../../src/chains/evm/health/evm-native-value-health-reader-v3.mjs';
import { createProfile, PROFILE_SCHEMA } from '../../../src/chains/evm/transfers/evm-native-value-v2.mjs';
import { ObservationError } from '../../../src/chains/shared/portfolio/portfolio-registry.mjs';

test('health facades share the operator provenance owner and reject forged history', () => {
  assert.equal(evm.createOwnedEvmNativeValueHealthSource, kernel.createOwnedEvmNativeValueHealthSource);
  assert.equal(evm.assertOwnedEvmNativeValueHealthObservation, kernel.assertOwnedEvmNativeValueHealthObservation);
  assert.equal(tron.createOwnedTronNativeValueHealthSource, kernel.createOwnedTronNativeValueHealthSource);
  assert.equal(tron.assertOwnedTronNativeValueHealthObservation, kernel.assertOwnedTronNativeValueHealthObservation);
  assert.equal(shared.assertOwnedNativeValueHealthObservation, kernel.assertOwnedNativeValueHealthObservation);
  assert.throws(() => kernel.nativeValueRetainedSourceHistory(Object.freeze(Object.create(null)), {
    policy: {}, sourceIndex: '0', nativeId: '11'.repeat(32),
  }), /NATIVE_VALUE_PRIVATE_RETAINED_HISTORY_REQUIRED/);
  assert.throws(() => tron.assertOwnedTronNativeValueHealthObservation(Object.freeze({ status: 'observed' }), {}),
    /TRON_GRAPH_OBSERVATION_PROVENANCE/);
});

test('calling a low-level RPC reader cannot mint an owned health observation', async () => {
  const profile = createProfile({ chain: 'ethereum', genesisHash: '0x' + '11'.repeat(32), sourceSetRoot: '22'.repeat(32),
    maximumAncestry: '1', maximumEvidenceLifetime: '1', maximumBlockAgeMs: '1000', maximumClockSkewMs: '0', maximumQueryMs: '100' });
  // Deliberately bypass the private bootstrap and construct the public unbranded
  // mechanism directly. Even a real output from it must have no authority.
  const identity = Object.freeze({ nativeId: '33'.repeat(32), nativeGid: '44'.repeat(32) });
  const reader = createEvmNativeValueHealthReaderV3({ policy: {}, sourcePin: { index: '0' }, binding: { inclusion: null },
    identity, signed: {}, registered: profile, profile, config: { now: () => 1000, freshness: { maxQueryMs: 100 } },
    checkState: async () => { throw new ObservationError('OFFLINE_STATE_UNAVAILABLE'); } }, null);
  const result = await reader.observe({ nativeId: identity.nativeId });
  assert.equal(result.status, 'unknown');
  assert.equal(result.reason, 'OFFLINE_STATE_UNAVAILABLE');
  assert.equal(Object.isFrozen(result), true);
  for (const value of [result, { ...result, status: 'observed' }]) {
    assert.throws(() => evm.assertOwnedEvmNativeValueHealthObservation(value, reader), /EVM_GRAPH_SOURCE_OBSERVATION_PROVENANCE/);
    assert.throws(() => shared.assertOwnedNativeValueHealthObservation(value, reader, { profile: { schema: PROFILE_SCHEMA } }),
      /EVM_GRAPH_SOURCE_OBSERVATION_PROVENANCE/);
  }
});
