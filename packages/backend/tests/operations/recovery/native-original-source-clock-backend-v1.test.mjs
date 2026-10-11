import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildOriginalNativeSourceClockBackendV1 } from '../../../src/operations/recovery/native-original-source-clock-backend-v1.mjs';
import { assertOriginalNativeSourceObservedClockV1 as assertCanonicalClock } from '../../../src/operations/recovery/native-original-source-lifecycle-v1.mjs';
import { createNativeSourceHost } from '../../support/native-source-host.mjs';

function fixture() {
  const authority = Object.freeze({}),
    head = Object.freeze({ number: '1', hash: 'ab'.repeat(32), timestamp: '1' }),
    events = [];
  let gate = null,
    checkpoint = '1',
    failedClose = false;
  const runtime = (name) =>
    Object.freeze({
      async block() {
        return head;
      },
      async assertCanonical(value) {
        assert.deepEqual(value, head);
      },
      lifecycle: [{ event: 'stopped-owned-process', forced: false }],
      async close(input) {
        assert.deepEqual(input, { removeScratch: false });
        events.push('close:' + name);
        if (failedClose) throw Error('HOST_CLOSE_FAILED');
        return { stopped: true };
      },
    });
  const receiver = runtime('receiver'),
    native = runtime('native'),
    pair = Object.freeze({ runtime: receiver, nativeRuntime: native });
  const checkAuthority = (value) => assert.equal(value, authority);
  let backend;
  const ports = Object.freeze({
    assertOriginalNativeSourceCapsuleV1: checkAuthority,
    assertOwnedNativeDurableSourceReceiverV1: (value) => assert.equal(value, receiver),
    assertOwnedNativeDurableSourceGraphRuntimeV1: (value) => assert.equal(value, native),
    readOwnedNativeDurableSourceClockPairV1(r, n) {
      assert.equal(r, receiver);
      assert.equal(n, native);
      return pair;
    },
    async refreshNativeValueReceiverClock(value) {
      assert.equal(value, receiver);
      events.push('receiver');
    },
    async refreshOwnedNativeEconomicObservedGraphClockV2(value) {
      assert.equal(value, native);
      events.push('native');
      if (gate) await gate;
    },
    async createOriginalNativeSourceClockPairV1(value) {
      checkAuthority(value);
      return pair;
    },
    readOriginalNativeSourceClockCheckpointV1(value) {
      checkAuthority(value);
      return checkpoint;
    },
    async retainOriginalNativeSourceClockCheckpointV1(value, clock) {
      checkAuthority(value);
      const refs = backend.readOriginalNativeSourceClockReferencesV1(clock);
      assert.equal(refs.runtime, receiver);
      checkpoint = backend.snapshotOriginalNativeSourceObservedClockV1(clock);
      events.push('checkpoint');
    },
  });
  backend = buildOriginalNativeSourceClockBackendV1(ports);
  return {
    authority,
    pair,
    ports,
    backend,
    events,
    setGate(value) {
      gate = value;
    },
    failClose() {
      failedClose = true;
    },
  };
}

test('SOURCE clock issuer, guard and refresh retain exact instance and pair identities', async () => {
  const f = fixture(),
    other = buildOriginalNativeSourceClockBackendV1(f.ports);
  const joined = await f.backend.createOriginalNativeSourceObservedClocksV1(f.authority);
  assert.deepEqual(f.events, ['native', 'receiver', 'checkpoint']);
  assert.equal(f.backend.assertOriginalNativeSourceObservedClockV1(joined.clock, f.pair), true);
  assert.throws(
    () => f.backend.assertOriginalNativeSourceObservedClockV1({ ...joined.clock }, f.pair),
    /ORIGINAL_CLOCK/,
  );
  assert.throws(
    () => other.assertOriginalNativeSourceObservedClockV1(joined.clock, f.pair),
    /ORIGINAL_CLOCK/,
  );
  assert.throws(() => assertCanonicalClock(joined.clock, f.pair), /ORIGINAL_CLOCK/);
  assert.throws(() =>
    f.backend.reopenOriginalNativeSourceObservedClocksV1(f.authority, {
      runtime: f.pair.nativeRuntime,
      nativeRuntime: f.pair.runtime,
    }),
  );
  let release;
  f.setGate(
    new Promise((resolve) => {
      release = resolve;
    }),
  );
  const refreshing = f.backend.refreshOriginalNativeSourceObservedClockV1(joined.clock);
  assert.throws(
    () => f.backend.refreshOriginalNativeSourceObservedClockV1(joined.clock),
    /CLOCK_BUSY/,
  );
  const closing = joined.close();
  assert.equal(joined.close(), closing);
  assert.throws(
    () => f.backend.refreshOriginalNativeSourceObservedClockV1(joined.clock),
    /CLOCK_CLOSING/,
  );
  release();
  await refreshing;
  assert.deepEqual(await closing, { closed: true, originalResourcesStopped: true });
  assert.deepEqual(f.events.slice(-2), ['close:native', 'close:receiver']);
  assert.throws(
    () => f.backend.readOriginalNativeSourceClockReferencesV1(joined.clock),
    /ORIGINAL_CLOCK/,
  );
});

test('SOURCE clock close attempts both resources and retains a failed closed state', async () => {
  const f = fixture(),
    joined = f.backend.reopenOriginalNativeSourceObservedClocksV1(f.authority, f.pair);
  f.failClose();
  await assert.rejects(
    joined.close(),
    (error) => error instanceof AggregateError && error.errors.length === 2,
  );
  assert.deepEqual(f.events, ['close:native', 'close:receiver']);
  assert.throws(
    () => f.backend.snapshotOriginalNativeSourceObservedClockV1(joined.clock),
    /ORIGINAL_CLOCK/,
  );
});

test('real SOURCE lifecycle checkpoints only its authentic clock into the AEAD journal', async () => {
  const root = await mkdtemp(join(tmpdir(), 'native-source-clock-contract-'));
  let host;
  try {
    host = await createNativeSourceHost(root);
    const { api } = host,
      authority = await api.createOriginalNativeSourceCapsuleV1();
    const joined = await api.createOriginalNativeSourceObservedClocksV1(authority);
    assert.equal(
      api.assertOriginalNativeSourceObservedClockV1(joined.clock, {
        runtime: joined.runtime,
        nativeRuntime: joined.nativeRuntime,
      }),
      true,
    );
    const before = await host.readRecord(authority);
    assert.ok(BigInt(before.data.clockSecond) > 0n);
    await assert.rejects(
      api.retainOriginalNativeSourceClockCheckpointV1(authority, { ...joined.clock }),
      /ORIGINAL_CLOCK/,
    );
    assert.deepEqual(await host.readRecord(authority), before);
    await joined.close();
    await api.closeOriginalNativeSourceCapsuleV1(authority);
  } finally {
    host?.restore();
    await rm(root, { recursive: true, force: true });
  }
});
