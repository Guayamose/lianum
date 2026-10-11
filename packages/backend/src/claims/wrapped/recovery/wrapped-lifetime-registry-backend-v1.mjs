import {
  wrappedLifetimeInputIdentityV1,
  isDeviceWrappedLifetimeDirectoryV1,
} from './wrapped-lifetime-record-v1.mjs';
/** One private fixed-attempt initialization/checkpoint registry. Credentials
 * remain local; their retention is not permission to replay, sign or reopen.
 * Only an authority-pinned ordered reopen may attach this registry anew. */
import assert from 'node:assert/strict';
import { isDeepStrictEqual } from 'node:util';
import { lstat, mkdir, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { legacyDataRoot } from '@lianum/environment';
import { exactRecord } from '@lianum/components/encoding/commitments';
import {
  WRAPPED_LIFETIME_PROFILE_V1 as PROFILE,
  WRAPPED_LIFETIME_PARTS_V1 as PARTS,
  assertWrappedLifetimeRecordV1 as recordValid,
  wrappedLifetimeCheckpointV1 as checkpoint,
} from './wrapped-lifetime-record-v1.mjs';
import {
  syncWrappedLifetimeDirectoryV1 as syncDirectory,
  assertWrappedLifetimePrivateDirectoryV1 as privateDirectory,
  readWrappedLifetimePrivateFileV1 as privateRead,
  acquireWrappedLifetimeLeaseV1,
} from './wrapped-lifetime-files-v1.mjs';
const ROOT = legacyDataRoot('wallet');
/** @typedef {import('./wrapped-lifetime-record-v1.mjs').LifetimeIdentity} LifetimeIdentity
 * @typedef {import('./wrapped-lifetime-record-v1.mjs').LifetimeCheckpoint} LifetimeCheckpoint
 * @typedef {import('./wrapped-lifetime-record-v1.mjs').LifetimeRecord} LifetimeRecord
 * @typedef {import('./wrapped-lifetime-record-v1.mjs').LifetimeData} LifetimeData
 * @typedef {{directory: string, runId: string, sourceSHA256: string, deadlineMs: number}} AttemptIdentity
 * @typedef {{metadata: {version: string, evmGenesis: string, chainId: string}, ingressSendState: unknown}} LifetimeRuntime
 * @typedef {AttemptIdentity & {runtime: LifetimeRuntime}} RegistryInput
 * @typedef {{read(): Promise<unknown>, update(revision: number, transform: (data: LifetimeData) => LifetimeData): Promise<unknown>, close(): void}} LifetimeStore
 * @typedef {{directory: string, identity: LifetimeIdentity}} StoreInput
 * @typedef {{schema: string, input: AttemptIdentity, checkpoint: LifetimeCheckpoint}} LifetimeCapture
 * @typedef {{input: AttemptIdentity, checkpoint: LifetimeCheckpoint, creator: {pid: number, startTicks: string, uid: number, pgrp: number, session: number}}} SourceCapture
 * @typedef {{runtime: {
 * assertOwnedLocalEvmV2(runtime: LifetimeRuntime): Promise<unknown>,
 * assertOwnedDeviceExternalFlatReceiverV1(runtime: LifetimeRuntime): unknown},
 * recovery: {
 * retainOriginalWrappedRecoverySectionV1(token: object, section: string, data: LifetimeCapture): Promise<unknown>,
 * originalWrappedRecoverySectionIdentityV1(token: object, section: string): AttemptIdentity,
 * consumeOriginalWrappedRecoverySectionV1(token: object, section: string): LifetimeCapture},
 * deviceSource: {
 * originalDeviceGraphSourceSectionIdentityV2(token: object, section: string): AttemptIdentity,
 * consumeOriginalDeviceGraphSourceSectionV2(token: object, section: string): SourceCapture},
 * storage: {create(input: StoreInput): Promise<LifetimeStore>, open(input: StoreInput): Promise<LifetimeStore>}
 * }} LifetimeContracts
 * @typedef {{runtime: LifetimeRuntime, identity: LifetimeIdentity, directory: string,
 * store: LifetimeStore, record: LifetimeRecord, release: () => Promise<void>,
 * closed: boolean, sealed: boolean, fault: boolean, pending: number, tail: Promise<unknown>,
 * handles: Map<string, object>, captured: {identity: AttemptIdentity, checkpoint: LifetimeCheckpoint} | null,
 * releaseError?: unknown}} RegistryState
 */
/** @type {readonly (keyof AttemptIdentity)[]} */
const ATTEMPT_KEYS = Object.freeze(['directory', 'runId', 'sourceSHA256', 'deadlineMs']);

/** Creates an isolated owner. All authentic handles remain in its private maps;
 * canonical composition supplies only the fixed runtime and recovery contracts.
 * @param {LifetimeContracts} contracts
 */
export function buildWrappedPrivateLifetimeRegistryV1(contracts) {
  exactRecord(contracts, ['runtime', 'recovery', 'deviceSource', 'storage']);
  const { runtime, recovery, deviceSource, storage } = contracts;
  exactRecord(runtime, ['assertOwnedLocalEvmV2', 'assertOwnedDeviceExternalFlatReceiverV1']);
  exactRecord(recovery, [
    'retainOriginalWrappedRecoverySectionV1',
    'originalWrappedRecoverySectionIdentityV1',
    'consumeOriginalWrappedRecoverySectionV1',
  ]);
  exactRecord(deviceSource, [
    'originalDeviceGraphSourceSectionIdentityV2',
    'consumeOriginalDeviceGraphSourceSectionV2',
  ]);
  exactRecord(storage, ['create', 'open']);
  const { create: createStore, open: openStore } = storage;
  for (const contract of [runtime, recovery, deviceSource, storage])
    for (const method of Object.values(contract))
      assert.equal(typeof method, 'function', 'WRAPPED_LIFETIME_FIXED_CONTRACT');
  const { assertOwnedLocalEvmV2, assertOwnedDeviceExternalFlatReceiverV1 } = runtime;
  const {
    retainOriginalWrappedRecoverySectionV1,
    originalWrappedRecoverySectionIdentityV1,
    consumeOriginalWrappedRecoverySectionV1,
  } = recovery;
  const { originalDeviceGraphSourceSectionIdentityV2, consumeOriginalDeviceGraphSourceSectionV2 } =
    deviceSource;
  /** @type {WeakMap<object, RegistryState>} */
  const registries = new WeakMap();
  /** @type {WeakMap<LifetimeRuntime, RegistryState>} */
  const runtimes = new WeakMap();
  /** @type {WeakMap<object, {s: RegistryState, name: string, version: number}>} */
  const parts = new WeakMap();
  /** @param {unknown} a @param {unknown} b @param {string} [code] */
  const same = (a, b, code = 'WRAPPED_LIFETIME_PRIVATE_IDENTITY_CHANGED') =>
    assert.ok(isDeepStrictEqual(a, b), code);
  /** @template T @param {T} value @returns {T} */
  const copy = (value) => structuredClone(value);
  /** @returns {object} */
  const opaque = () => Object.freeze(Object.create(null));
  /** @param {RegistryInput} input @returns {LifetimeIdentity} */
  function inputIdentity(input) {
    const identity = wrappedLifetimeInputIdentityV1(input, ROOT);
    if (isDeviceWrappedLifetimeDirectoryV1(input.directory, input.runId, ROOT)) {
      assertOwnedDeviceExternalFlatReceiverV1(input.runtime);
    }
    return {
      ...identity,
      genesis: input.runtime.metadata.evmGenesis,
      chainId: input.runtime.metadata.chainId,
    };
  }
  /** @param {RegistryState | undefined} s @returns {asserts s is RegistryState} */
  function live(s) {
    assert.ok(
      s && !s.closed && !s.sealed && !s.fault,
      'WRAPPED_LIFETIME_ORIGINAL_LIVE_REGISTRY_REQUIRED',
    );
    void s.runtime.ingressSendState;
  }
  /** @param {LifetimeRuntime} runtime */
  function forRuntime(runtime) {
    const s = runtimes.get(runtime);
    live(s);
    return s;
  }
  /** @param {RegistryInput} input @param {LifetimeCheckpoint | null} expected @param {boolean} create */
  async function factory(input, expected, create) {
    await assertOwnedLocalEvmV2(input.runtime);
    assert.equal(
      input.runtime.metadata.version,
      'OWNED_FLAT_LOCAL_EVM_V2',
      'WRAPPED_LIFETIME_ORIGINAL_RECEIVER_REQUIRED',
    );
    const identity = inputIdentity(input);
    assert.ok(!runtimes.has(input.runtime), 'WRAPPED_LIFETIME_RUNTIME_ALREADY_BOUND');
    await privateDirectory(input.directory);
    const directory = join(input.directory, 'private-lifetime-v1');
    if (create) {
      await mkdir(directory, { mode: 0o700 });
      await syncDirectory(input.directory);
    }
    await privateDirectory(directory);
    const release = await acquireWrappedLifetimeLeaseV1(directory, identity.runId);
    let store;
    try {
      store = await (create ? createStore : openStore)({ directory, identity });
      const record = await store.read();
      recordValid(record, identity);
      if (!create) {
        exactRecord(expected, ['revision', 'commitment']);
        same(checkpoint(record), expected, 'WRAPPED_LIFETIME_CAPTURE_CHECKPOINT_CHANGED');
      }
      const registry = opaque();
      /** @type {RegistryState} */
      const s = {
        runtime: input.runtime,
        identity,
        directory,
        store,
        record,
        release,
        closed: false,
        sealed: false,
        fault: false,
        pending: 0,
        tail: Promise.resolve(),
        handles: new Map(),
        captured: null,
      };
      registries.set(registry, s);
      runtimes.set(input.runtime, s);
      return registry;
    } catch (error) {
      store?.close();
      try {
        await release();
      } catch (cleanup) {
        throw new AggregateError([error, cleanup], 'WRAPPED_LIFETIME_OPEN_CLEANUP_FAILED', {
          cause: error,
        });
      }
      throw error;
    }
  }
  /** @param {RegistryInput} input */
  function createWrappedPrivateLifetimeRegistryV1(input) {
    assert.equal(arguments.length, 1);
    return factory(input, null, true);
  }
  /** @param {RegistryInput} input @param {LifetimeCheckpoint} expected */
  function openWrappedPrivateLifetimeRegistryV1(input, expected) {
    assert.equal(arguments.length, 2);
    return factory(input, expected, false);
  }
  /** @template T @param {RegistryState} s @param {() => Promise<T>} work @returns {Promise<T>} */
  function serialize(s, work) {
    live(s);
    s.pending++;
    const next = s.tail.then(async () => {
      live(s);
      try {
        const current = await s.store.read();
        same(current, s.record, 'WRAPPED_LIFETIME_RECORD_CHANGED');
        return await work();
      } catch (error) {
        s.fault = true;
        throw error;
      }
    });
    s.tail = next.catch(() => {});
    return next.finally(() => {
      s.pending--;
    });
  }
  /** @param {RegistryState} s @param {(data: LifetimeData) => LifetimeData} transform */
  async function persist(s, transform) {
    const next = await s.store.update(s.record.revision, transform),
      actual = await s.store.read();
    same(actual, next, 'WRAPPED_LIFETIME_DURABLE_READBACK');
    recordValid(actual, s.identity);
    s.record = actual;
  }
  /** @param {RegistryState} s @param {string} name */
  function handleFor(s, name) {
    let handle = s.handles.get(name);
    if (!handle) {
      handle = opaque();
      const row = s.record.data.parts[name];
      parts.set(handle, { s, name, version: row.version });
      s.handles.set(name, handle);
    }
    return handle;
  }
  /** @param {LifetimeRuntime} runtime @param {string} name @param {unknown} identity @param {unknown} privateState */
  async function retainWrappedPrivateLifetimePartV1(runtime, name, identity, privateState) {
    assert.equal(arguments.length, 4);
    assert.ok(PARTS.includes(name), 'WRAPPED_LIFETIME_FIXED_PART_REQUIRED');
    const s = forRuntime(runtime),
      normalizedIdentity = copy(identity),
      normalizedState = copy(privateState);
    return serialize(s, async () => {
      const old = s.record.data.parts[name];
      if (old) {
        same(old.identity, normalizedIdentity, 'WRAPPED_LIFETIME_PART_IDENTITY_CHANGED');
        same(old.privateState, normalizedState, 'WRAPPED_LIFETIME_INITIALIZATION_CHANGED');
      } else
        await persist(s, (data) => {
          assert.equal(data.parts[name], undefined);
          data.parts[name] = {
            identity: normalizedIdentity,
            privateState: normalizedState,
            version: 1,
          };
          return data;
        });
      return handleFor(s, name);
    });
  }
  /** @param {LifetimeRuntime} runtime @param {string} name @param {unknown} identity */
  async function readWrappedPrivateLifetimePartV1(runtime, name, identity) {
    assert.equal(arguments.length, 3);
    assert.ok(PARTS.includes(name));
    const s = forRuntime(runtime);
    return serialize(s, async () => {
      const row = s.record.data.parts[name];
      assert.ok(row, 'WRAPPED_LIFETIME_ORIGINAL_PART_REQUIRED');
      same(row.identity, identity, 'WRAPPED_LIFETIME_PART_IDENTITY_CHANGED');
      return Object.freeze({
        privateState: copy(row.privateState),
        version: row.version,
        handle: handleFor(s, name),
      });
    });
  }
  /** @param {object} handle @param {unknown} privateState */
  async function updateWrappedPrivateLifetimePartV1(handle, privateState) {
    assert.equal(arguments.length, 2);
    const part = parts.get(handle);
    assert.ok(part, 'WRAPPED_LIFETIME_ORIGINAL_PART_HANDLE');
    const { s, name } = part,
      normalized = copy(privateState);
    return serialize(s, async () => {
      assert.equal(
        s.record.data.parts[name].version,
        part.version,
        'WRAPPED_LIFETIME_PART_VERSION_CHANGED',
      );
      await persist(s, (data) => {
        const row = data.parts[name];
        row.privateState = normalized;
        row.version++;
        return data;
      });
      part.version = s.record.data.parts[name].version;
      return Object.freeze({ version: part.version, durable: true, recoveryAuthorized: false });
    });
  }
  /** @param {object} handle */
  function assertWrappedPrivateLifetimePartSealedV1(handle) {
    assert.equal(arguments.length, 1);
    const part = parts.get(handle);
    assert.ok(part, 'WRAPPED_LIFETIME_ORIGINAL_PART_HANDLE');
    live(part.s);
    assert.equal(part.s.pending, 0, 'WRAPPED_LIFETIME_DURABLE_WRITE_PENDING');
    assert.equal(part.s.record.data.parts[part.name].version, part.version);
    return Object.freeze({ durable: true, recoveryAuthorized: false });
  }
  /** @param {object} registry */
  async function wrappedPrivateLifetimeRegistryCheckpointV1(registry) {
    assert.equal(arguments.length, 1);
    const s = registries.get(registry);
    live(s);
    assert.equal(s.pending, 0);
    same(await s.store.read(), s.record);
    return checkpoint(s.record);
  }
  /** @param {object} registry */
  async function closeWrappedPrivateLifetimeRegistryV1(registry) {
    assert.equal(arguments.length, 1);
    const s = registries.get(registry);
    assert.ok(s && !s.pending);
    if (s.releaseError) throw s.releaseError;
    if (s.closed) return { closed: true, privateStateRetained: true };
    s.sealed = true;
    s.store.close();
    s.closed = true;
    try {
      await s.release();
    } catch (error) {
      s.releaseError = error;
      throw error;
    }
    return { closed: true, privateStateRetained: true };
  }
  /** @param {LifetimeRuntime} runtime @param {object} token */
  async function retainWrappedPrivateLifetimeRegistryForReopenV1(runtime, token) {
    assert.equal(arguments.length, 2);
    const s = forRuntime(runtime);
    assert.equal(s.pending, 0, 'WRAPPED_LIFETIME_DURABLE_WRITE_PENDING');
    s.sealed = true;
    let releaseAttempted = false;
    try {
      const authority = originalWrappedRecoverySectionIdentityV1(token, 'privateLifetime');
      for (const key of ATTEMPT_KEYS)
        assert.equal(s.identity[key], authority[key], 'WRAPPED_LIFETIME_ORIGINAL_ATTEMPT');
      same(await s.store.read(), s.record);
      const { profile, genesis, chainId, ...input } = s.identity;
      await retainOriginalWrappedRecoverySectionV1(token, 'privateLifetime', {
        schema: PROFILE,
        input,
        checkpoint: checkpoint(s.record),
      });
      s.store.close();
      s.closed = true;
      releaseAttempted = true;
      try {
        await s.release();
      } catch (error) {
        s.releaseError = error;
        throw error;
      }
      s.captured = Object.freeze({ identity: copy(authority), checkpoint: checkpoint(s.record) });
      return { retained: true, originalResourcesStopped: true };
    } catch (error) {
      s.fault = true;
      s.store.close();
      s.closed = true;
      if (!releaseAttempted) {
        try {
          await s.release();
        } catch (cleanup) {
          s.releaseError = cleanup;
          throw new AggregateError([error, cleanup], 'WRAPPED_LIFETIME_CAPTURE_CLEANUP_FAILED', {
            cause: error,
          });
        }
      }
      throw error;
    }
  }
  /** @param {{runtime: LifetimeRuntime, attemptAuthority: object}} input */
  async function reopenWrappedPrivateLifetimeRegistryFromAuthorityV1({
    runtime,
    attemptAuthority,
  }) {
    const authority = originalWrappedRecoverySectionIdentityV1(attemptAuthority, 'privateLifetime'),
      saved = consumeOriginalWrappedRecoverySectionV1(attemptAuthority, 'privateLifetime');
    exactRecord(saved, ['schema', 'input', 'checkpoint']);
    assert.equal(saved.schema, PROFILE);
    for (const key of ATTEMPT_KEYS) assert.equal(saved.input[key], authority[key]);
    return openWrappedPrivateLifetimeRegistryV1({ runtime, ...saved.input }, saved.checkpoint);
  }
  /** @param {LifetimeRuntime} runtime @param {string} family @param {unknown} identity @param {unknown} privateState */
  async function retainWrappedPrivateLifetimeIndexedPartV1(
    runtime,
    family,
    identity,
    privateState,
  ) {
    assert.equal(arguments.length, 4);
    assert.ok(
      [
        'provider',
        'recipient',
        'wallet-catalogue-keeper',
        'wallet-official-vault',
        'wallet-vault-exit',
      ].includes(family),
    );
    const s = forRuntime(runtime),
      normalizedIdentity = copy(identity),
      normalizedState = copy(privateState);
    return serialize(s, async () => {
      const names = PARTS.filter((name) => name.startsWith(family + '-')),
        existing = names.filter(
          (name) =>
            s.record.data.parts[name] &&
            isDeepStrictEqual(s.record.data.parts[name].identity, normalizedIdentity),
        );
      assert.ok(existing.length <= 1, 'WRAPPED_LIFETIME_INDEXED_IDENTITY_AMBIGUOUS');
      if (existing.length) {
        same(
          s.record.data.parts[existing[0]].privateState,
          normalizedState,
          'WRAPPED_LIFETIME_INITIALIZATION_CHANGED',
        );
        return handleFor(s, existing[0]);
      }
      const name = names.find((name) => s.record.data.parts[name] === undefined);
      assert.ok(name, 'WRAPPED_LIFETIME_INDEXED_CAPACITY');
      await persist(s, (data) => {
        assert.equal(data.parts[name], undefined);
        data.parts[name] = {
          identity: normalizedIdentity,
          privateState: normalizedState,
          version: 1,
        };
        return data;
      });
      return handleFor(s, name);
    });
  }
  /** @param {LifetimeRuntime} runtime @param {string} family @param {unknown} identity */
  async function readWrappedPrivateLifetimeIndexedPartV1(runtime, family, identity) {
    assert.equal(arguments.length, 3);
    assert.ok(
      [
        'provider',
        'recipient',
        'wallet-catalogue-keeper',
        'wallet-official-vault',
        'wallet-vault-exit',
      ].includes(family),
    );
    const s = forRuntime(runtime);
    return serialize(s, async () => {
      const matches = Object.entries(s.record.data.parts).filter(
        ([name, row]) => name.startsWith(family + '-') && isDeepStrictEqual(row.identity, identity),
      );
      assert.equal(matches.length, 1, 'WRAPPED_LIFETIME_ORIGINAL_INDEXED_PART_REQUIRED');
      const [name, row] = matches[0];
      return Object.freeze({
        privateState: copy(row.privateState),
        version: row.version,
        handle: handleFor(s, name),
      });
    });
  }
  /** @param {object} registry */
  function wrappedPrivateLifetimeRegistryIdentityV1(registry) {
    assert.equal(arguments.length, 1);
    const s = registries.get(registry);
    live(s);
    return Object.freeze({ ...s.identity });
  }
  /** Original registry admission must match the fixed section's attempt. */
  /** @param {LifetimeRuntime} runtime @param {AttemptIdentity} expected */
  function assertWrappedPrivateLifetimeAttemptV1(runtime, expected) {
    assert.equal(arguments.length, 2);
    const s = forRuntime(runtime);
    for (const key of ATTEMPT_KEYS)
      assert.equal(s.identity[key], expected[key], 'WRAPPED_LIFETIME_ORIGINAL_ATTEMPT');
    assert.equal(
      s.identity.genesis,
      runtime.metadata.evmGenesis,
      'WRAPPED_LIFETIME_ORIGINAL_GENESIS',
    );
    assert.equal(s.identity.chainId, runtime.metadata.chainId, 'WRAPPED_LIFETIME_ORIGINAL_CHAIN');
    assert.equal(s.pending, 0, 'WRAPPED_LIFETIME_DURABLE_WRITE_PENDING');
    return true;
  }
  /** Receiver-last admission uses the original registry's completed capture,
   * never an ordinarily closed registry or a serialized stopped descriptor. */
  /** @param {LifetimeRuntime} runtime @param {{identity: AttemptIdentity, checkpoint: LifetimeCheckpoint}} expected */
  function assertStoppedWrappedPrivateLifetimeAttemptV1(runtime, expected) {
    assert.equal(arguments.length, 2);
    exactRecord(expected, ['identity', 'checkpoint']);
    exactRecord(expected.checkpoint, ['revision', 'commitment']);
    const s = runtimes.get(runtime);
    assert.ok(
      s && s.closed && s.sealed && !s.fault && !s.releaseError && s.captured,
      'WRAPPED_LIFETIME_ORIGINAL_CAPTURED_REGISTRY_REQUIRED',
    );
    assert.equal(s.pending, 0, 'WRAPPED_LIFETIME_DURABLE_WRITE_PENDING');
    same(s.captured.identity, expected.identity, 'WRAPPED_LIFETIME_ORIGINAL_ATTEMPT');
    same(s.captured.checkpoint, expected.checkpoint, 'WRAPPED_LIFETIME_CAPTURE_CHECKPOINT_CHANGED');
    same(checkpoint(s.record), expected.checkpoint, 'WRAPPED_LIFETIME_CAPTURE_CHECKPOINT_CHANGED');
    for (const key of ATTEMPT_KEYS)
      assert.equal(s.identity[key], expected.identity[key], 'WRAPPED_LIFETIME_ORIGINAL_ATTEMPT');
    assert.equal(
      s.identity.genesis,
      runtime.metadata.evmGenesis,
      'WRAPPED_LIFETIME_ORIGINAL_GENESIS',
    );
    assert.equal(s.identity.chainId, runtime.metadata.chainId, 'WRAPPED_LIFETIME_ORIGINAL_CHAIN');
    return true;
  }
  /** Public inventory completeness only; names do not expose private rows. */
  /** @param {LifetimeRuntime} runtime @param {string[]} expectedNames */
  function assertWrappedPrivateLifetimePartsV1(runtime, expectedNames) {
    assert.equal(arguments.length, 2);
    const s = forRuntime(runtime);
    assert.equal(s.pending, 0, 'WRAPPED_LIFETIME_DURABLE_WRITE_PENDING');
    assert.ok(
      Array.isArray(expectedNames) &&
        expectedNames.length > 0 &&
        new Set(expectedNames).size === expectedNames.length &&
        expectedNames.every((name) => PARTS.includes(name)),
      'WRAPPED_LIFETIME_EXPECTED_PARTS',
    );
    same(
      Object.keys(s.record.data.parts).sort(),
      [...expectedNames].sort(),
      'WRAPPED_LIFETIME_INVENTORY_INCOMPLETE',
    );
    return Object.freeze({
      parts: Object.freeze([...expectedNames].sort()),
      checkpoint: checkpoint(s.record),
      credentialsExposed: false,
    });
  }
  /** Private read-only checkpoint for a fixed runtime-attached registry. */
  /** @param {LifetimeRuntime} runtime */
  async function wrappedPrivateLifetimeRuntimeCheckpointV1(runtime) {
    assert.equal(arguments.length, 1);
    const s = forRuntime(runtime);
    assert.equal(s.pending, 0, 'WRAPPED_LIFETIME_DURABLE_WRITE_PENDING');
    same(await s.store.read(), s.record, 'WRAPPED_LIFETIME_RECORD_CHANGED');
    live(s);
    assert.equal(s.pending, 0, 'WRAPPED_LIFETIME_DURABLE_WRITE_PENDING');
    return checkpoint(s.record);
  }
  /** Fixed composition checks the SAME original registry/runtime refs. */
  /** @param {object} registry @param {LifetimeRuntime} runtime */
  function assertWrappedPrivateLifetimeRegistryRuntimeV1(registry, runtime) {
    assert.equal(arguments.length, 2);
    const s = registries.get(registry);
    live(s);
    assert.equal(s.runtime, runtime, 'WRAPPED_LIFETIME_ORIGINAL_RUNTIME');
    assert.equal(runtimes.get(runtime), s, 'WRAPPED_LIFETIME_ORIGINAL_REGISTRY');
    return true;
  }
  /** SOURCE repairs only the old original parent's authenticated physical lease.
   * The registry's exact AEAD checkpoint is verified before removing that lease;
   * no caller-selected PID or latest checkpoint is admitted. */
  /** @param {LifetimeRuntime} runtime @param {object} token */
  async function reopenOriginalDeviceGraphSourceRegistryV2(runtime, token) {
    assert.equal(arguments.length, 2);
    const authority = originalDeviceGraphSourceSectionIdentityV2(token, 'privateLifetime'),
      saved = consumeOriginalDeviceGraphSourceSectionV2(token, 'privateLifetime');
    exactRecord(saved, ['input', 'checkpoint', 'creator']);
    exactRecord(saved.input, ['directory', 'runId', 'sourceSHA256', 'deadlineMs']);
    for (const k of ATTEMPT_KEYS) assert.equal(saved.input[k], authority[k]);
    exactRecord(saved.creator, ['pid', 'startTicks', 'uid', 'pgrp', 'session']);
    assert.ok(process.getuid);
    assert.equal(saved.creator.uid, process.getuid());
    assert.ok(Number.isSafeInteger(saved.creator.pid) && saved.creator.pid > 0);
    try {
      await lstat('/proc/' + saved.creator.pid);
      assert.fail('DEVICE_GRAPH_SOURCE_OLD_PARENT_PRESENT');
    } catch (error) {
      if (
        !(
          error instanceof Error &&
          'code' in error &&
          ['ENOENT', 'ESRCH'].includes(String(error.code))
        )
      )
        throw error;
    }
    const input = { runtime, ...saved.input },
      identity = inputIdentity(input),
      directory = join(input.directory, 'private-lifetime-v1');
    await privateDirectory(directory);
    let store;
    try {
      store = await openStore({ directory, identity });
      const record = await store.read();
      recordValid(record, identity);
      same(checkpoint(record), saved.checkpoint, 'WRAPPED_LIFETIME_CAPTURE_CHECKPOINT_CHANGED');
    } finally {
      store?.close();
    }
    const path = join(directory, 'registry.active'),
      before = await lstat(path),
      bytes = await privateRead(path, 1024);
    try {
      const lease = JSON.parse(bytes.toString());
      exactRecord(lease, ['profile', 'runId', 'pid', 'nonce']);
      assert.equal(lease.profile, PROFILE);
      assert.equal(lease.runId, saved.input.runId);
      assert.equal(lease.pid, saved.creator.pid);
      assert.equal(typeof lease.nonce, 'string');
      assert.ok(typeof lease.nonce === 'string' && /^[0-9a-f]{64}$/.test(lease.nonce));
      const again = await lstat(path);
      /** @type {readonly ('dev'|'ino'|'uid'|'mode'|'nlink'|'size'|'mtimeMs'|'ctimeMs')[]} */
      const statFields = ['dev', 'ino', 'uid', 'mode', 'nlink', 'size', 'mtimeMs', 'ctimeMs'];
      for (const k of statFields) assert.equal(before[k], again[k]);
      same(await privateRead(path, 1024), bytes);
      await unlink(path);
      await syncDirectory(directory);
    } finally {
      bytes.fill(0);
    }
    return openWrappedPrivateLifetimeRegistryV1(input, saved.checkpoint);
  }
  return Object.freeze({
    createWrappedPrivateLifetimeRegistryV1,
    openWrappedPrivateLifetimeRegistryV1,
    retainWrappedPrivateLifetimePartV1,
    readWrappedPrivateLifetimePartV1,
    updateWrappedPrivateLifetimePartV1,
    assertWrappedPrivateLifetimePartSealedV1,
    wrappedPrivateLifetimeRegistryCheckpointV1,
    closeWrappedPrivateLifetimeRegistryV1,
    retainWrappedPrivateLifetimeRegistryForReopenV1,
    reopenWrappedPrivateLifetimeRegistryFromAuthorityV1,
    retainWrappedPrivateLifetimeIndexedPartV1,
    readWrappedPrivateLifetimeIndexedPartV1,
    wrappedPrivateLifetimeRegistryIdentityV1,
    assertWrappedPrivateLifetimeAttemptV1,
    assertStoppedWrappedPrivateLifetimeAttemptV1,
    assertWrappedPrivateLifetimePartsV1,
    wrappedPrivateLifetimeRuntimeCheckpointV1,
    assertWrappedPrivateLifetimeRegistryRuntimeV1,
    reopenOriginalDeviceGraphSourceRegistryV2,
  });
}
