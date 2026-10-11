/** Local capability isolation: no transaction, proof, funding or public network. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { buildOwnedEvmRuntimeBackendV1 } from '../../../src/chains/evm/runtime/owned-evm-runtime-backend-v1.mjs';
import * as canonical from '../../../src/chains/evm/runtime/owned-evm-v2-runtime.mjs';
import * as source from '../../../src/operations/recovery/native-original-source-lifecycle-v1.mjs';

const opaque = () => Object.freeze(Object.create(null));
const forbidden = () => assert.fail('ISOLATED_BACKEND_UNEXPECTED_EFFECT');
function isolatedContracts(journal = {}) {
  const names = names => Object.fromEntries(names.map(name => [name, forbidden]));
  return {
    journal: { ...names(['originalNativeSourceRuntimeRequestIdentityV1', 'readOriginalNativeSourceRuntimeSeedV1',
      'retainOriginalNativeSourceRuntimeSeedV1', 'resumeOriginalNativeSourceRuntimeSeedV1',
      'originalNativeSourceRuntimeOwnedProcessV1', 'readOriginalNativeSourceRuntimeStateV1',
      'updateOriginalNativeSourceSectionV1', 'beginOriginalNativeSourceMutationV1', 'confirmOriginalNativeSourceMutationV1']), ...journal },
    recovery: names(['consumeExternalDefiReceiverRepairV1', 'consumeWrappedRuntimeRecoveryV1',
      'assertNativeEconomicRecoveryCaptureV1', 'nativeEconomicRecoverySectionIdentityV1',
      'externalDefiReceiverCaptureIdentityV2', 'consumeExternalDefiReceiverRuntimeSectionV2',
      'deviceExternalFlatReceiverCaptureIdentityV1', 'consumeDeviceExternalFlatReceiverRuntimeSectionV1',
      'assertNativeLiveArmedRecoveryCaptureV1', 'nativeLiveArmedRecoverySectionIdentityV1',
      'consumeNativeLiveArmedRecoverySectionV1', 'nativeD26', 'economic']),
    deviceSource: names(['consumeOriginalDeviceGraphSourceRequestV2', 'consumeOriginalDeviceGraphSourceSectionV2',
      'originalDeviceGraphSourceSectionIdentityV2', 'beginOriginalDeviceGraphSourceActivityV2', 'endOriginalDeviceGraphSourceActivityV2']),
    reorg: names(['probe', 'recovery']), dispatch: names(['deviceNote', 'claim', 'paged', 'native']),
    observation: names(['nativeValue']),
  };
}

test('isolated runtime custody cannot be read, signed or captured by another owner', async t => {
  const root = await mkdtemp(join(tmpdir(), 'lianum-evm-backend-isolation-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const backend = buildOwnedEvmRuntimeBackendV1(isolatedContracts());
  const other = buildOwnedEvmRuntimeBackendV1(isolatedContracts());
  const cwd = join(root, 'custody'); await mkdir(cwd, { mode: 0o700 });
  const custody = await backend.createNativeEconomicLocalCustodyV2({ cwd, family: 'receiver', profile: canonical.LOCAL_EVM_PROFILE });
  t.after(() => backend.closeNativeEconomicLocalCustodyV2(custody));
  const view = backend.nativeEconomicLocalCustodyPublicV2(custody);
  const prepared = Object.freeze({ transaction: Object.freeze({ chainId: '31337', from: view.accounts[0],
    to: '0x' + '22'.repeat(20), nonce: '0', gas: '21000', gasPrice: '1000000000', value: '1', data: '0x' }) });
  for (const owner of [canonical, other]) {
    assert.throws(() => owner.nativeEconomicLocalCustodyPublicV2(custody), /NATIVE_ECONOMIC_ORIGINAL_CUSTODY/);
    await assert.rejects(owner.prepareNativeEconomicCustodySigningV2(custody, prepared), /NATIVE_ECONOMIC_ORIGINAL_CUSTODY/);
    await assert.rejects(owner.captureNativeEconomicLocalCustodyV2(custody), /NATIVE_ECONOMIC_ORIGINAL_CUSTODY/);
  }
  const lease = await backend.prepareNativeEconomicCustodySigningV2(custody, prepared);
  assert.throws(() => canonical.consumeNativeEconomicCustodySigningV2(custody, lease, prepared), /NATIVE_ECONOMIC_ORIGINAL_CUSTODY/);
  assert.equal(typeof backend.consumeNativeEconomicCustodySigningV2(custody, lease, prepared).nativeWire, 'string');
  assert.deepEqual(backend.nativeEconomicLocalCustodyPublicV2(custody), view);
  assert.equal(canonical.createNativeEconomicLocalCustodyV2, source.createNativeEconomicLocalCustodyV2);
});

test('a real child from an arbitrary journal never acquires canonical runtime authority', { timeout: 20000 }, async () => {
  const request = opaque(), handle = opaque(), identity = Object.freeze({ sourceSHA256: 'ab'.repeat(32) });
  let retained = null, owned = null;
  const backend = buildOwnedEvmRuntimeBackendV1(isolatedContracts({
    originalNativeSourceRuntimeRequestIdentityV1(value) { assert.equal(value, request); return { family: 'receiver', opening: false, identity }; },
    async retainOriginalNativeSourceRuntimeSeedV1(value, seed) { assert.equal(value, request); retained = seed; return handle; },
    async originalNativeSourceRuntimeOwnedProcessV1(value, pid) { assert.equal(value, request); owned = { pid }; return owned; },
    async updateOriginalNativeSourceSectionV1(value, seed) { assert.equal(value, handle); assert.equal(seed, retained); },
  }));
  const other = buildOwnedEvmRuntimeBackendV1(isolatedContracts());
  let runtime;
  try {
    runtime = await backend.sourceRuntime.create(request);
    assert.ok(retained && owned && owned.pid !== process.pid);
    assert.equal(typeof retained.confirmed.localCustody.password, 'string');
    assert.equal(backend.isOwnedLocalEvmV2(runtime), true);
    assert.equal(backend.isOwnedNativeEconomicRuntimeV2(runtime), true);
    backend.assertOwnedNativeEconomicObservedReceiverV2(runtime);
    for (const owner of [canonical, other]) {
      assert.equal(owner.isOwnedLocalEvmV2(runtime), false);
      assert.equal(owner.isOwnedNativeEconomicRuntimeV2(runtime), false);
      assert.throws(() => owner.assertOwnedNativeEconomicObservedReceiverV2(runtime), /ORIGINAL|REQUIRED/);
      await assert.rejects(owner.assertOwnedLocalEvmV2(runtime), /ORIGINAL|REQUIRED/);
      assert.throws(() => owner.assertOwnedNativeEconomicRuntimeRecoverableV1(runtime), /ORIGINAL|REQUIRED/);
    }
    for (const copy of [runtime, { ...runtime }]) {
      assert.throws(() => source.assertOwnedNativeDurableSourceRuntimeV1(copy), /NATIVE_SOURCE_ORIGINAL_RUNTIME_REQUIRED/);
      assert.throws(() => other.sourceRuntime.identity(copy), /NATIVE_SOURCE_BACKEND_ORIGINAL_RUNTIME/);
      await assert.rejects(source.beginOriginalNativeSourceMutationV1(copy), /NATIVE_SOURCE_ORIGINAL_MUTATION/);
    }
    assert.equal(backend.sourceRuntime.identity(runtime).family, 'receiver');
    assert.throws(() => source.originalNativeSourceRuntimeRequestIdentityV1(request), /NATIVE_SOURCE_ORIGINAL_RUNTIME_REQUEST/);
  } finally {
    if (runtime) await runtime.close({ removeScratch: true });
    if (retained) retained.confirmed.localCustody.password = undefined;
  }
  await assert.rejects(readFile('/proc/' + owned.pid + '/stat'), { code: 'ENOENT' });
});


test('the canonical observed EVM graph retains its brands and does not open rollup sources', { timeout: 20000 }, async () => {
  let runtime;
  try {
    runtime = await canonical.createOwnedNativeEconomicObservedGraphRuntimeV2();
    assert.equal(canonical.isOwnedLocalEvmNativeValueRuntime(runtime), true);
    assert.equal(canonical.isOwnedNativeEconomicRuntimeV2(runtime), true);
    canonical.assertOwnedNativeEconomicObservedGraphRuntimeV2(runtime);
    assert.equal(await canonical.openOriginalOwnedRollupNativeValueSourcesV1(runtime), null);
    assert.equal(canonical.assertOwnedNativeDurableSourceRuntimeV1, source.assertOwnedNativeDurableSourceRuntimeV1);
    assert.throws(() => source.assertOwnedNativeDurableSourceRuntimeV1(runtime), /NATIVE_SOURCE_ORIGINAL_RUNTIME_REQUIRED/);
  } finally {
    if (runtime) await runtime.close({ removeScratch: true });
  }
});
