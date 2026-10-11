/** Capability isolation only: temporary local vaults, no node or network. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as kernel from '../../../src/chains/evm/runtime/owned-evm-v2-runtime.mjs';
import * as custody from '../../../src/chains/evm/runtime/native-economic-local-custody-v2.mjs';
import { buildNativeEconomicCustodyBackend } from '../../../src/chains/evm/runtime/native-economic-local-custody-backend-v2.mjs';
import { LOCAL_EVM_PROFILE } from '../../../src/chains/evm/runtime/local-evm-profiles.mjs';

const preparation = from => Object.freeze({ transaction: Object.freeze({ chainId: '31337', from,
  to: '0x' + '22'.repeat(20), nonce: '0', gas: '21000', gasPrice: '1000000000', value: '1', data: '0x' }) });

test('a custody backend with a forged issuer cannot mint or consume original capabilities', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'lianum-custody-kernel-boundary-'));
  const originalDirectory = join(cwd, 'original'), foreignDirectory = join(cwd, 'foreign');
  const { mkdir } = await import('node:fs/promises');
  await mkdir(originalDirectory, { mode: 0o700 });
  await mkdir(foreignDirectory, { mode: 0o700 });
  const forgedRequest = Object.freeze(Object.create(null));
  const foreign = buildNativeEconomicCustodyBackend(() => ({ cwd: foreignDirectory, family: 'receiver',
    profile: { ...LOCAL_EVM_PROFILE, name: 'LOCAL_NATIVE_ECONOMIC_OBSERVED_RECEIVER_V2', genesisTimestamp: Math.floor(Date.now() / 1000) } }));
  let originalHandle, foreignHandle, originalLease, foreignLease;
  try {
    for (const name of Object.keys(foreign)) assert.equal(custody[name], kernel[name], name + ' must retain one owner');
    await assert.rejects(custody.createNativeEconomicObservedLocalCustodyV2(forgedRequest), /ECONOMIC_OBSERVED_ORIGINAL_CUSTODY_REQUEST/);
    originalHandle = await custody.createNativeEconomicLocalCustodyV2({ cwd: originalDirectory, family: 'receiver', profile: LOCAL_EVM_PROFILE });
    foreignHandle = await foreign.createNativeEconomicObservedLocalCustodyV2(forgedRequest);
    assert.throws(() => custody.nativeEconomicLocalCustodyPublicV2(foreignHandle), /NATIVE_ECONOMIC_ORIGINAL_CUSTODY/);
    assert.throws(() => foreign.nativeEconomicLocalCustodyPublicV2(originalHandle), /NATIVE_ECONOMIC_ORIGINAL_CUSTODY/);
    const originalPrepared = preparation(custody.nativeEconomicLocalCustodyPublicV2(originalHandle).accounts[0]);
    const foreignPrepared = preparation(foreign.nativeEconomicLocalCustodyPublicV2(foreignHandle).accounts[0]);
    originalLease = await custody.prepareNativeEconomicCustodySigningV2(originalHandle, originalPrepared);
    foreignLease = await foreign.prepareNativeEconomicCustodySigningV2(foreignHandle, foreignPrepared);
    assert.throws(() => custody.consumeNativeEconomicCustodySigningV2(originalHandle, foreignLease, originalPrepared), /NATIVE_ECONOMIC_ORIGINAL_SIGNING_LEASE/);
    assert.throws(() => foreign.consumeNativeEconomicCustodySigningV2(foreignHandle, originalLease, foreignPrepared), /NATIVE_ECONOMIC_ORIGINAL_SIGNING_LEASE/);
    // Rejected cross-instance consumption must not burn either original lease.
    assert.equal(typeof custody.consumeNativeEconomicCustodySigningV2(originalHandle, originalLease, originalPrepared).nativeWire, 'string');
    assert.equal(typeof foreign.consumeNativeEconomicCustodySigningV2(foreignHandle, foreignLease, foreignPrepared).nativeWire, 'string');
    assert.throws(() => kernel.assertOwnedNativeDurableSourceRuntimeV1(foreignHandle), /NATIVE_SOURCE_ORIGINAL_RUNTIME_REQUIRED/);
    assert.equal(kernel.isOwnedNativeEconomicRuntimeV2(foreignHandle), false);
  } finally {
    if (originalLease) custody.revokeNativeEconomicCustodySigningV2(originalLease);
    if (foreignLease) foreign.revokeNativeEconomicCustodySigningV2(foreignLease);
    if (originalHandle) custody.closeNativeEconomicLocalCustodyV2(originalHandle);
    if (foreignHandle) foreign.closeNativeEconomicLocalCustodyV2(foreignHandle);
    await rm(cwd, { recursive: true, force: true });
  }
});

test('a source backend cannot lend tokens to the original runtime or retain them after failure', async () => {
  const { buildOwnedEvmNativeSourceBackend } = await import('../../../src/chains/evm/health/owned-evm-native-value-health-source-backend-v4.mjs');
  const facade = await import('../../../src/chains/evm/health/owned-evm-native-value-health-source-v4.mjs');
  const runtime = Object.freeze(Object.create(null)), otherRuntime = Object.freeze(Object.create(null));
  const descriptor = Object.freeze({ sourceIndex: '2', explicitHostDataOnly: true });
  let request, failOpening = false, foreign;
  foreign = buildOwnedEvmNativeSourceBackend({
    assertOwnedLocalEvmNativeValueRuntime(value) { assert.equal(value, runtime); },
    async openOwnedLocalEvmNativeValueSource(value, token) {
      request = token;
      assert.throws(() => kernel.consumeOwnedEvmNativeSourceRequest(token, value), /OWNED_NATIVE_SOURCE_ORIGINAL_REQUEST_REQUIRED/);
      if (failOpening) throw new Error('EXPLICIT_HOST_OPEN_FAILURE');
      assert.throws(() => foreign.consumeOwnedEvmNativeSourceRequest(token, otherRuntime), /OWNED_NATIVE_SOURCE_ORIGINAL_REQUEST_REQUIRED/);
      assert.equal(foreign.consumeOwnedEvmNativeSourceRequest(token, runtime), 2);
      assert.throws(() => foreign.consumeOwnedEvmNativeSourceRequest(token, runtime), /OWNED_NATIVE_SOURCE_ORIGINAL_REQUEST_REQUIRED/);
      return Object.freeze({ descriptor, async assertCurrent() {} });
    },
    createOwnedEvmNativeValueHealthSource() { throw new Error('HOST_OBSERVER_MUST_NOT_RUN'); },
  });
  for (const name of Object.keys(foreign)) assert.equal(facade[name], kernel[name]);
  await assert.rejects(kernel.describeOwnedLocalEvmNativeValueSource(runtime, 2), /OWNED_NATIVE_VALUE_ORIGINAL_RUNTIME_REQUIRED/);
  assert.equal(await foreign.describeOwnedLocalEvmNativeValueSource(runtime, 2), descriptor);
  failOpening = true;
  await assert.rejects(foreign.describeOwnedLocalEvmNativeValueSource(runtime, 2), /EXPLICIT_HOST_OPEN_FAILURE/);
  assert.throws(() => foreign.consumeOwnedEvmNativeSourceRequest(request, runtime), /OWNED_NATIVE_SOURCE_ORIGINAL_REQUEST_REQUIRED/);
});

test('wallet eligibility remains owned by the original deployment and rejects metadata impersonation', async () => {
  const native = await import('../../../src/operations/deployments/native-value/native-value-system-v2.mjs');
  const nativeEntry = await import('../../../src/operations/deployments/native-value/native-value-wallet-binding-v2.mjs');
  const wrapped = await import('../../../src/operations/deployments/wrapped/wrapped-claim-system-v1.mjs');
  const wrappedEntry = await import('../../../src/operations/deployments/wrapped/wrapped-claim-wallet-binding-v1.mjs');
  for (const [owner, entry, name] of [[native, nativeEntry, 'assertOwnedNativeValueWalletSystem'],
    [wrapped, wrappedEntry, 'assertOwnedWrappedClaimWalletSystemV1']]) {
    assert.equal(entry[name], owner[name]);
    let metadataRead = false;
    const forged = Object.freeze({ get profile() { metadataRead = true; throw new Error('UNTRUSTED_METADATA_READ'); } });
    assert.throws(() => owner[name]({}, forged), /NATIVE_VALUE_OWNED_DEPLOYMENT_REQUIRED/);
    assert.equal(metadataRead, false);
  }
});
