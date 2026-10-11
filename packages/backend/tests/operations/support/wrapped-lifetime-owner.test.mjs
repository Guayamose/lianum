import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile, readFile, chmod } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { legacyDataRoot } from '@lianum/environment';
import { createClaimRecordStore, openClaimRecordStore } from '@lianum/engine/storage/records';
import { createOwnedLocalEvmV2 } from '../../../src/chains/evm/runtime/owned-evm-v2-runtime.mjs';
import * as canonical from '../../../src/claims/wrapped/recovery/wrapped-recovery-authority-v1.mjs';
import { buildWrappedPrivateLifetimeRegistryV1 } from '../../../src/claims/wrapped/recovery/wrapped-lifetime-registry-backend-v1.mjs';
import {
  acquireWrappedLifetimeLeaseV1,
  readWrappedLifetimePrivateFileV1,
} from '../../../src/claims/wrapped/recovery/wrapped-lifetime-files-v1.mjs';
import {
  WRAPPED_LIFETIME_PROFILE_V1,
  assertWrappedLifetimeRecordV1,
} from '../../../src/claims/wrapped/recovery/wrapped-lifetime-record-v1.mjs';

const forbidden = () => assert.fail('UNEXPECTED_RECOVERY_EFFECT');
async function attempt(t, stem = 'wrapped-wallet-fixed-preflight-v1') {
  const runId = randomUUID();
  const root = join(legacyDataRoot('wallet'), '.local', stem, 'attempt-' + runId);
  const directory = join(root, 'private-audit');
  await mkdir(directory, { recursive: true, mode: 0o700 });
  t.after(() => rm(root, { recursive: true, force: true }));
  return { directory, runId, sourceSHA256: 'a1'.repeat(32), deadlineMs: Date.now() + 60_000 };
}
function isolated() {
  const original = new WeakSet();
  const runtime = Object.freeze({
    metadata: Object.freeze({
      version: 'OWNED_FLAT_LOCAL_EVM_V2',
      evmGenesis: '0x' + '91'.repeat(32),
      chainId: '31337',
    }),
    ingressSendState: Object.freeze({}),
  });
  original.add(runtime);
  const guard = (value) => assert.ok(original.has(value), 'ISOLATED_ORIGINAL_RUNTIME');
  const options = ({ directory, identity }) => ({
    path: join(directory, 'registry.vault'),
    password: 'isolated-test-store-password',
    identity,
  });
  const backend = buildWrappedPrivateLifetimeRegistryV1({
    runtime: {
      assertOwnedLocalEvmV2: async (value) => guard(value),
      assertOwnedDeviceExternalFlatReceiverV1: guard,
    },
    recovery: {
      retainOriginalWrappedRecoverySectionV1: forbidden,
      originalWrappedRecoverySectionIdentityV1: forbidden,
      consumeOriginalWrappedRecoverySectionV1: forbidden,
    },
    deviceSource: {
      originalDeviceGraphSourceSectionIdentityV2: forbidden,
      consumeOriginalDeviceGraphSourceSectionV2: forbidden,
    },
    storage: {
      create: (input) =>
        createClaimRecordStore(options(input), {
          profile: WRAPPED_LIFETIME_PROFILE_V1,
          identity: input.identity,
          parts: {},
        }),
      open: (input) => openClaimRecordStore(options(input)),
    },
  });
  return { runtime, backend };
}

test('isolated lifetime handles never enter the canonical owner; real encrypted CAS stays usable', async (t) => {
  const input = await attempt(t),
    { runtime, backend } = isolated(),
    other = isolated();
  const registry = await backend.createWrappedPrivateLifetimeRegistryV1({ ...input, runtime });
  try {
    const identity = { owner: 'alice' };
    const handle = await backend.retainWrappedPrivateLifetimePartV1(runtime, 'wallet', identity, {
      nonce: 0,
    });
    assert.throws(
      () => canonical.assertWrappedPrivateLifetimeRegistryRuntimeV1(registry, runtime),
      /ORIGINAL_LIVE_REGISTRY/,
    );
    assert.throws(
      () => canonical.assertWrappedPrivateLifetimePartSealedV1(handle),
      /ORIGINAL_PART_HANDLE/,
    );
    assert.throws(
      () => other.backend.assertWrappedPrivateLifetimePartSealedV1(handle),
      /ORIGINAL_PART_HANDLE/,
    );
    await assert.rejects(
      canonical.updateWrappedPrivateLifetimePartV1(handle, { nonce: 90 }),
      /ORIGINAL_PART_HANDLE/,
    );
    await assert.rejects(
      backend.updateWrappedPrivateLifetimePartV1({ ...handle }, { nonce: 90 }),
      /ORIGINAL_PART_HANDLE/,
    );
    const before = await backend.wrappedPrivateLifetimeRegistryCheckpointV1(registry);
    assert.equal(
      (await backend.updateWrappedPrivateLifetimePartV1(handle, { nonce: 1 })).version,
      2,
    );
    const after = await backend.wrappedPrivateLifetimeRegistryCheckpointV1(registry);
    assert.equal(after.revision, before.revision + 1);
    assert.notEqual(after.commitment, before.commitment);
    assert.deepEqual(
      (await backend.readWrappedPrivateLifetimePartV1(runtime, 'wallet', identity)).privateState,
      { nonce: 1 },
    );
    assert.equal(backend.assertWrappedPrivateLifetimePartSealedV1(handle).durable, true);
    await assert.rejects(
      other.backend.readWrappedPrivateLifetimePartV1(runtime, 'wallet', identity),
      /ORIGINAL_LIVE_REGISTRY/,
    );
  } finally {
    await backend.closeWrappedPrivateLifetimeRegistryV1(registry);
  }
});

test(
  'canonical lifetime retains through the fixed original recovery producer and rejects copied identities',
  { timeout: 20000 },
  async (t) => {
    const input = await attempt(t, 'wrapped-wallet-fixed-acceptance-v1'),
      runtime = await createOwnedLocalEvmV2();
    let registry, authority;
    try {
      registry = await canonical.createWrappedPrivateLifetimeRegistryV1({ ...input, runtime });
      const handle = await canonical.retainWrappedPrivateLifetimePartV1(
        runtime,
        'wallet',
        { account: 'one' },
        { revision: 0 },
      );
      assert.equal(
        canonical.assertWrappedPrivateLifetimeRegistryRuntimeV1(registry, runtime),
        true,
      );
      assert.throws(
        () => canonical.assertWrappedPrivateLifetimeRegistryRuntimeV1({ ...registry }, runtime),
        /ORIGINAL_LIVE_REGISTRY/,
      );
      assert.throws(
        () => canonical.assertWrappedPrivateLifetimeAttemptV1({ ...runtime }, input),
        /ORIGINAL_LIVE_REGISTRY/,
      );
      assert.equal(
        (await canonical.updateWrappedPrivateLifetimePartV1(handle, { revision: 1 })).durable,
        true,
      );
      assert.equal(
        (await canonical.readWrappedPrivateLifetimePartV1(runtime, 'wallet', { account: 'one' }))
          .version,
        2,
      );
      authority = await canonical.createWrappedRecoveryAuthorityV1(input);
      await assert.rejects(
        canonical.retainOriginalWrappedRecoverySectionV1({}, 'privateLifetime', {}),
        /ORIGINAL_CAPTURE_TOKEN/,
      );
      const checkpoint = await canonical.wrappedPrivateLifetimeRegistryCheckpointV1(registry);
      const status = await canonical.retainWrappedPrivateLifetimeRecoveryV1(authority, runtime);
      assert.equal(status.sections.privateLifetime, 'CAPTURED');
      assert.equal(status.uncertain, false);
      canonical.assertStoppedWrappedPrivateLifetimeAttemptV1(runtime, {
        identity: { profile: 'WRAPPED_FIXED_PRIVATE_RECOVERY_AUTHORITY_V1', ...input },
        checkpoint,
      });
      await assert.rejects(
        canonical.readWrappedPrivateLifetimePartV1(runtime, 'wallet', { account: 'one' }),
        /ORIGINAL_LIVE_REGISTRY/,
      );
      await assert.rejects(canonical.retainWrappedPrivateLifetimeRecoveryV1(authority, runtime));
    } finally {
      if (authority) await canonical.closeWrappedRecoveryAuthorityV1(authority);
      if (registry) await canonical.closeWrappedPrivateLifetimeRegistryV1(registry);
      await runtime.close({ removeScratch: true });
    }
  },
);

test('private lease preserves replaced bytes and excludes a second writer', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'lianum-lifetime-lease-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const release = await acquireWrappedLifetimeLeaseV1(directory, randomUUID());
  await assert.rejects(acquireWrappedLifetimeLeaseV1(directory, randomUUID()), { code: 'EEXIST' });
  const path = join(directory, 'registry.active'),
    original = await readFile(path);
  await writeFile(path, Buffer.from('changed'));
  await assert.rejects(release);
  assert.equal((await readFile(path)).toString(), 'changed');
  await writeFile(path, original);
  await release();
  await release();
  await assert.rejects(readFile(path), { code: 'ENOENT' });
  await writeFile(path, original, { mode: 0o600 });
  await chmod(path, 0o644);
  await assert.rejects(readWrappedLifetimePrivateFileV1(path, 1024), /PRIVATE_FILE/);
});

test('record validation rejects foreign identities, unknown parts and invalid revisions', () => {
  const identity = {
    profile: WRAPPED_LIFETIME_PROFILE_V1,
    directory: '/unused',
    runId: randomUUID(),
    sourceSHA256: 'a1'.repeat(32),
    deadlineMs: 1,
    genesis: '0x' + '92'.repeat(32),
    chainId: '31337',
  };
  const record = {
    revision: 1,
    commitment: 'ca'.repeat(32),
    data: {
      profile: WRAPPED_LIFETIME_PROFILE_V1,
      identity,
      parts: { wallet: { identity: {}, privateState: {}, version: 1 } },
    },
  };
  assertWrappedLifetimeRecordV1(record, identity);
  for (const mutation of [
    (value) => {
      value.data.identity.runId = randomUUID();
    },
    (value) => {
      value.data.parts.unrecognized = value.data.parts.wallet;
    },
    (value) => {
      value.data.parts.wallet.version = 0;
    },
    (value) => {
      value.revision = -1;
    },
  ]) {
    const bad = structuredClone(record);
    mutation(bad);
    assert.throws(() => assertWrappedLifetimeRecordV1(bad, identity));
  }
});
