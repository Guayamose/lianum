import {createNativeSourceRecordValidatorV1, ORIGINAL_NATIVE_SOURCE_PROFILE_V1} from './source-journal/record-validator-v1.mjs';
import { createNativeSourceStateCipherV1 } from "./source-journal/native-state-cipher-v1.mjs";
import {
  genericAccountIdentity,
  immutable,
  sha as accountJournalSHA256,
} from "@lianum/engine/accounts/journal";

import {
  privateDirectory,
  syncDirectory,
  readPrivate,
  exclusive,
  replace,
} from "./source-journal/private-files-v1.mjs";
import {
  processIdentity,
  validateProcess,
  absent,
} from "./source-journal/process-identity-v1.mjs";
import { clearNativeSourceAccountCheckpointLockV1 } from "./source-journal/account-lock-v1.mjs";
import { createNativeSourceJournalCodecV1 } from "./source-journal/journal-codec-v1.mjs";

/** Original same-host durable source. It can reopen a confirmed point between
 * operations after every old owned PID is absent. Pending writes/mutations stay
 * UNKNOWN; this does not recover a destroyed native process mid-mutation. */
import assert from "node:assert/strict";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { mkdir, lstat, unlink } from "node:fs/promises";
import { join, resolve } from "node:path";

import { canonical } from "@lianum/engine/crypto/privacy";
import { exactRecord } from "@lianum/components/encoding/commitments";

export { ORIGINAL_NATIVE_SOURCE_PROFILE_V1 };
/** Fixed binding names only; this data exposes no canonical instance or issuer. */
export const SOURCE_LIFECYCLE_LOADERS_V1 = Object.freeze([
  "nativeOriginalSourcePartsV1",
  "nativeValueAccountAuthorityV2",
  "wrappedRecoveryAuthorityV1",
  "nativeValueExecutionV2",
  "deviceExternalFlatNoteAuthorityV1",
  "evmDispatchGate",
  "controller",
  "wrappedControllerV1",
  "fundedPagedNativeProviderV3",
  "nativeValueEvmDispatchGate",
  "wrappedClaimGraphDispatchGateV1",
  "evmNativeValueHealthSourceV4",
  "flatAccountSession",
  "nativeValueSystemV2",
  "durableGenericAccountKeeper",
  "originalWalletEconomicStateV1",
]);
export const SOURCE_LIFECYCLE_DEPENDENCIES_V1 = Object.freeze([
  "buildNativeManualSessionV1",
  "originalActorFrameDataV1",
  "reconcileNativeSourceActorCheckpointDataV1",
  "reconcileNativeSourceAccountCheckpointDataV1",
  "buildOriginalNativeSourceClockBackendV1",
  "ROOT",
  "Vault",
  "NATIVE_VALUE_DEV_RELEASE_V5",
  "buildOwnedEvmRuntimeBackendV1",
  "buildPairedOriginalAccountActorV2",
]);
/** One closed SOURCE implementation. Its canonical composition owns the
 * fixed lazy resources; no registry writer or canonical contract selector is
 * exported. Every original inspection gate remains ahead of its loader. */
export function buildOriginalNativeSourceLifecycleV1(contracts) {
  assert.equal(arguments.length, 1);
  exactRecord(contracts, [
    "wrappedRecovery",
    "deviceSourceAuthority",
    "assertOwnedEvmRecoveryStateDumpV1",
    "load",
    "dependencies",
  ]);
  const {
    wrappedRecovery,
    deviceSourceAuthority,
    assertOwnedEvmRecoveryStateDumpV1,
    load,
    dependencies,
  } = contracts;
  exactRecord(dependencies, SOURCE_LIFECYCLE_DEPENDENCIES_V1);
  const {
    buildNativeManualSessionV1,
    originalActorFrameDataV1,
    reconcileNativeSourceActorCheckpointDataV1,
    reconcileNativeSourceAccountCheckpointDataV1,
    buildOriginalNativeSourceClockBackendV1,
    ROOT,
    Vault,
    NATIVE_VALUE_DEV_RELEASE_V5,
    buildOwnedEvmRuntimeBackendV1,
    buildPairedOriginalAccountActorV2,
  } = dependencies;
  exactRecord(load, SOURCE_LIFECYCLE_LOADERS_V1);
  assert.equal(typeof assertOwnedEvmRecoveryStateDumpV1, "function");
  for (const name of SOURCE_LIFECYCLE_LOADERS_V1)
    assert.equal(
      typeof load[name],
      "function",
      "NATIVE_SOURCE_FIXED_RESOURCE_CONTRACT",
    );
  const SCHEMA = "ORIGINAL_NATIVE_SOURCE_CAPSULE_V1";
  const BASE = join(ROOT, ".local/original-native-source-durable-operator-v1");
  const LOCATOR = join(BASE, "source.json"),
    MAX_RECORD = 64 * 1024 * 1024;
  const {SECTIONS, FAMILIES, SECTION_SCHEMAS, validateIdentity, validateSection, validate, validateNativePin} =
    createNativeSourceRecordValidatorV1(BASE);
  const authorities = new WeakMap(),
    writes = new WeakMap(),
    reads = new WeakMap(),
    handles = new WeakMap(),
    runtimes = new WeakMap(),
    mutations = new WeakMap(),
    requests = new WeakMap(),
    checkpointRequests = new WeakMap();
  const opaque = () => Object.freeze(Object.create(null));
  const copy = (value) => JSON.parse(JSON.stringify(value));
  const { sourceJSON, dataCopy, decodeRecord, readJournal, encodeJournal } =
    createNativeSourceJournalCodecV1({
      canonical,
      validateIdentity,
      readPrivate,
      replace,
    });
  const {
    overhead: STATE_OVERHEAD,
    encryptState,
    decryptState,
  } = createNativeSourceStateCipherV1(canonical);
  const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
  const hex = (value) =>
    typeof value === "string" && /^[0-9a-f]{64}$/.exec(value)?.[0] === value;
  async function readNativeState(s, family, pin) {
    validateNativePin(pin, family);
    const bytes = await readPrivate(
      join(s.identity.directory, pin.path),
      MAX_RECORD,
    );
    let plaintext;
    try {
      assert.equal(bytes.length, pin.bytes);
      assert.equal(
        hash(bytes),
        pin.sha256,
        "NATIVE_SOURCE_CONFIRMED_NATIVE_BYTES",
      );
      plaintext = decryptState(s, family, pin, bytes);
      assert.equal(
        hash(plaintext),
        pin.stateSHA256,
        "NATIVE_SOURCE_ORIGINAL_NATIVE_FRAME",
      );
      const value = JSON.parse(plaintext.toString("utf8"));
      assertOwnedEvmRecoveryStateDumpV1(value.stateDump);
      assert.equal(value.schema, "OWNED_NATIVE_SOURCE_PRIVATE_STATE_V1");
      assert.equal(value.family, family);
      assert.equal(value.genesisHash, pin.genesis);
      assert.deepEqual(value.head, pin.head);
      assert.equal(value.processGeneration, pin.generation);
      assert.equal(
        value.uncertainMutation,
        false,
        "NATIVE_SOURCE_HALF_MUTATION",
      );
      return value;
    } finally {
      plaintext?.fill(0);
      bytes.fill(0);
    }
  }
  function resumableCheckpoints(data) {
    return (
      FAMILIES.every((name) => {
        const row = data.native[name];
        return (
          row &&
          row.confirmed &&
          (row.pending === null || row.candidate?.revision === row.pending)
        );
      }) &&
      SECTIONS.every((name) => {
        const row = data.sections[name];
        return (
          row &&
          (row.candidate === null ||
            (name === "account" &&
              ["ACCOUNT_CAS", "ADMITTED_OPERATION"].includes(
                row.candidate?.kind,
              )) ||
            (name === "actor" &&
              row.candidate?.kind === "ACTOR_PERMISSION_OR_OBSERVATION"))
        );
      })
    );
  }
  function consumeOriginalNativeSourceAccountCheckpointV1(request) {
    assert.equal(arguments.length, 1);
    const r = checkpointRequests.get(request);
    assert.ok(
      r &&
        r.section === "account" &&
        !r.used &&
        !r.s.closed &&
        !r.s.fault &&
        r.revision === r.s.record.revision,
      "NATIVE_SOURCE_ORIGINAL_CHECKPOINT_REQUEST",
    );
    r.used = true;
    assert.ok(
      Date.now() < r.s.identity.deadlineMs,
      "NATIVE_SOURCE_ORIGINAL_DEADLINE",
    );
    return Object.freeze({
      identity: Object.freeze(copy(r.s.identity)),
      section: dataCopy(r.s.record.data.sections.account),
      interruptedActor: r.s.record.data.sections.actor.candidate !== null,
    });
  }
  function consumeOriginalNativeSourceActorCheckpointV1(request) {
    assert.equal(arguments.length, 1);
    const r = checkpointRequests.get(request);
    assert.ok(
      r &&
        r.section === "actor" &&
        !r.used &&
        !r.s.closed &&
        !r.s.fault &&
        r.revision === r.s.record.revision,
      "NATIVE_SOURCE_ORIGINAL_CHECKPOINT_REQUEST",
    );
    r.used = true;
    assert.ok(
      Date.now() < r.s.identity.deadlineMs,
      "NATIVE_SOURCE_ORIGINAL_DEADLINE",
    );
    return Object.freeze({
      identity: Object.freeze(copy(r.s.identity)),
      section: dataCopy(r.s.record.data.sections.actor),
    });
  }
  async function reconcileCheckpoints(s) {
    const before = copy(s.record.data),
      native = {};
    for (const name of FAMILIES) {
      const row = before.native[name];
      if (row.pending !== null) {
        await readNativeState(s, name, row.candidate.confirmed);
        native[name] = {
          pending: null,
          confirmed: copy(row.candidate.confirmed),
          candidate: null,
        };
      }
    }
    let actor = null;
    if (before.sections.actor.candidate !== null) {
      const request = opaque();
      checkpointRequests.set(request, {
        s,
        section: "actor",
        revision: s.record.revision,
        used: false,
      });
      await Promise.resolve();
      actor = await reconcileOriginalNativeActorSourceCheckpointV1(request);
      validateSection(actor, s.identity, "actor");
      assert.equal(actor.candidate, null);
    }
    let account = null;
    if (before.sections.account.candidate !== null || actor) {
      const request = opaque();
      checkpointRequests.set(request, {
        s,
        section: "account",
        revision: s.record.revision,
        used: false,
      });
      account = await reconcileNativeSourceAccountCheckpointDataV1(
        consumeOriginalNativeSourceAccountCheckpointV1(request),
        {
          readAccountRecord: (directory, password) =>
            new Vault(join(directory, "operations.vault")).read(password),
          hashRecord: accountJournalSHA256,
          immutable,
        },
      );
      validateSection(account, s.identity, "account");
      assert.equal(account.candidate, null);
      await clearOriginalAccountCheckpointLock(s, account);
    }
    if (Object.keys(native).length || account || actor)
      await update(s, (data) => {
        assert.deepEqual(
          data,
          before,
          "NATIVE_SOURCE_ORIGINAL_CHECKPOINT_CHANGED",
        );
        for (const name of Object.keys(native))
          data.native[name] = native[name];
        if (account) data.sections.account = dataCopy(account);
        if (actor) data.sections.actor = dataCopy(actor);
        return data;
      });
  }
  function original(authority, allowUnknown = false) {
    const s = authorities.get(authority);
    assert.ok(s && !s.closed && !s.fault, "NATIVE_SOURCE_ORIGINAL_CAPSULE");
    assert.ok(
      allowUnknown || s.record.data.phase !== "UNKNOWN",
      "NATIVE_SOURCE_PENDING_UNKNOWN",
    );
    assert.ok(
      Date.now() < s.identity.deadlineMs,
      "NATIVE_SOURCE_ORIGINAL_DEADLINE",
    );
    return s;
  }
  async function update(s, change) {
    const operation = s.tail.then(async () => {
      assert.ok(!s.closed && !s.fault, "NATIVE_SOURCE_UNAVAILABLE");
      await privateDirectory(s.identity.directory);
      const stored = await s.vault.read(s.password),
        current = await decodeRecord(stored, s.identity, s.password);
      validate(current, s.identity);
      assert.deepEqual(current, s.record, "NATIVE_SOURCE_CHECKPOINT_CHANGED");
      const changed = change(copy(current.data));
      validate({ revision: current.revision + 1, data: changed }, s.identity);
      const index = await encodeJournal(
        changed,
        s.identity,
        s.password,
        current.revision + 1,
        stored.data,
      );
      const published = await s.vault.update(
        s.password,
        current.revision,
        (data) => {
          assert.deepEqual(
            data,
            stored.data,
            "NATIVE_SOURCE_CHECKPOINT_CHANGED",
          );
          return index;
        },
      );
      const next = await decodeRecord(published, s.identity, s.password);
      validate(next, s.identity);
      const actual = await readJournal(s.vault, s.password, s.identity);
      assert.deepEqual(actual, next, "NATIVE_SOURCE_CHECKPOINT_READBACK");
      s.record = next;
      return next;
    });
    s.tail = operation.catch(() => {});
    try {
      return await operation;
    } catch (e) {
      s.fault = true;
      throw e;
    }
  }
  function uncertain(data) {
    return (
      FAMILIES.some(
        (name) =>
          data.native[name]?.pending !== null && data.native[name] !== null,
      ) ||
      SECTIONS.some(
        (name) =>
          data.sections[name]?.candidate !== null &&
          data.sections[name] !== null,
      )
    );
  }
  async function clearOriginalSourceVaultLock(s) {
    const path = s.vault.lockPath;
    let bytes;
    try {
      bytes = await readPrivate(path, 2048);
    } catch (e) {
      if (e.code === "ENOENT") return;
      throw e;
    }
    try {
      const lock = JSON.parse(bytes.toString("utf8"));
      exactRecord(lock, ["version", "pid", "token"]);
      assert.equal(lock.version, 1);
      assert.equal(
        lock.pid,
        s.record.data.creator.pid,
        "NATIVE_SOURCE_STALE_LOCK_OWNER",
      );
      assert.ok(hex(lock.token));
      await absent(s.record.data.creator);
      const again = await readPrivate(path, 2048);
      try {
        assert.deepEqual(again, bytes);
      } finally {
        again.fill(0);
      }
      await unlink(path);
      await syncDirectory(s.identity.directory);
    } finally {
      bytes.fill(0);
    }
  }
  // Explicit recovery of this authenticated account's own Vault lock. The
  // capsule has already proved the former original creator physically absent.
  const clearOriginalAccountCheckpointLock = (s, account) =>
    clearNativeSourceAccountCheckpointLockV1(s.record.data.creator, account);
  async function acquire(s, creating) {
    const path = join(s.identity.directory, "source.active");
    if (!creating) {
      let bytes;
      try {
        bytes = await readPrivate(path, 2048);
      } catch (e) {
        if (e.code !== "ENOENT") throw e;
      }
      if (bytes)
        try {
          const old = JSON.parse(bytes.toString("utf8"));
          exactRecord(old, ["profile", "creator", "token"]);
          assert.equal(old.profile, ORIGINAL_NATIVE_SOURCE_PROFILE_V1);
          assert.deepEqual(old.creator, s.record.data.creator);
          assert.ok(hex(old.token));
          await absent(old.creator);
          const again = await readPrivate(path, 2048);
          try {
            assert.deepEqual(again, bytes);
          } finally {
            again.fill(0);
          }
          await unlink(path);
          await syncDirectory(s.identity.directory);
        } finally {
          bytes.fill(0);
        }
    }
    const creator = await processIdentity(process.pid),
      bytes = Buffer.from(
        JSON.stringify({
          profile: ORIGINAL_NATIVE_SOURCE_PROFILE_V1,
          creator,
          token: randomBytes(32).toString("hex"),
        }),
      );
    await exclusive(path, bytes);
    const pin = await lstat(path);
    s.release = async () => {
      const actual = await readPrivate(path, 2048);
      try {
        const named = await lstat(path);
        assert.equal(named.ino, pin.ino);
        assert.equal(named.dev, pin.dev);
        assert.deepEqual(actual, bytes, "NATIVE_SOURCE_LEASE_CHANGED");
        await unlink(path);
        await syncDirectory(s.identity.directory);
      } finally {
        actual.fill(0);
        bytes.fill(0);
      }
    };
    return creator;
  }
  async function createOriginalNativeSourceCapsuleV1() {
    assert.equal(arguments.length, 0);
    await mkdir(join(BASE, "realms"), { recursive: true, mode: 0o700 });
    await privateDirectory(BASE);
    await privateDirectory(join(BASE, "realms"));
    try {
      await lstat(LOCATOR);
      assert.fail("NATIVE_SOURCE_EXISTING_ORIGINAL_REALM");
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
    }
    const identity = {
      profile: ORIGINAL_NATIVE_SOURCE_PROFILE_V1,
      directory: join(BASE, "realms", "realm-" + randomUUID()),
      runId: null,
      sourceSHA256: NATIVE_VALUE_DEV_RELEASE_V5.hostSourceClosureSHA256,
      deadlineMs: Date.now() + 9 * 60 * 60 * 1000,
    };
    identity.runId = identity.directory.slice(
      identity.directory.lastIndexOf("realm-") + 6,
    );
    validateIdentity(identity);
    await mkdir(identity.directory, { mode: 0o700 });
    await privateDirectory(identity.directory);
    const key = randomBytes(32);
    let s;
    try {
      await exclusive(join(identity.directory, "source.secret"), key);
      const password = key.toString("hex"),
        vault = new Vault(join(identity.directory, "source.vault")),
        creator = await processIdentity(process.pid);
      const initial = {
        schema: SCHEMA,
        identity,
        phase: "SEEDING",
        generation: 0,
        creator,
        clockSecond: "0",
        sections: Object.fromEntries(SECTIONS.map((k) => [k, null])),
        native: { receiver: null, graphNative: null },
      };
      const index = await encodeJournal(initial, identity, password, 0, null),
        record = await decodeRecord(
          await vault.create(index, password),
          identity,
          password,
        );
      validate(record, identity);
      assert.deepEqual(await readJournal(vault, password, identity), record);
      s = {
        identity,
        vault,
        password,
        record,
        tail: Promise.resolve(),
        closed: false,
        fault: false,
        opening: false,
        opened: new Set(),
        references: new Map(),
        release: null,
      };
      await acquire(s, true);
      await exclusive(
        LOCATOR,
        Buffer.from(JSON.stringify({ schema: SCHEMA, identity })),
      );
      const authority = opaque();
      authorities.set(authority, s);
      return authority;
    } catch (e) {
      if (s?.release) await s.release();
      throw e;
    } finally {
      key.fill(0);
    }
  }
  function assertOriginalNativeSourceCapsuleV1(authority) {
    assert.equal(arguments.length, 1);
    return Object.freeze(copy(original(authority).identity));
  }
  function originalNativeSourceCapsuleStatusV1(authority) {
    assert.equal(arguments.length, 1);
    const s = original(authority, true),
      d = s.record.data;
    return Object.freeze({
      profile: s.identity.profile,
      phase: d.phase,
      generation: d.generation,
      pending: uncertain(d),
      observationOnly: d.phase === "UNKNOWN",
      financialRestoreEstablished: false,
      betweenOperationsOnly: true,
    });
  }
  /** Private owned-process evidence for the fixed outer supervisor, never a PID selector. */
  function readOriginalNativeSourceOwnedProcessesV1(authority) {
    assert.equal(arguments.length, 1);
    const s = original(authority, true);
    return Object.freeze(
      [
        s.record.data.creator,
        ...SECTIONS.flatMap(
          (name) => s.record.data.sections[name]?.ownedProcesses ?? [],
        ),
      ].map((value) => Object.freeze(copy(value))),
    );
  }
  async function openOriginalNativeSourceCapsuleV1() {
    assert.equal(arguments.length, 0);
    const bytes = await readPrivate(LOCATOR, 16384);
    let locator;
    try {
      locator = JSON.parse(bytes.toString("utf8"));
    } finally {
      bytes.fill(0);
    }
    exactRecord(locator, ["schema", "identity"]);
    assert.equal(locator.schema, SCHEMA);
    const identity = locator.identity;
    validateIdentity(identity);
    assert.equal(
      identity.sourceSHA256,
      NATIVE_VALUE_DEV_RELEASE_V5.hostSourceClosureSHA256,
      "NATIVE_SOURCE_ORIGINAL_CLOSURE",
    );
    assert.ok(
      Date.now() < identity.deadlineMs,
      "NATIVE_SOURCE_ORIGINAL_DEADLINE",
    );
    await privateDirectory(identity.directory);
    const key = await readPrivate(
      join(identity.directory, "source.secret"),
      32,
    );
    let password;
    try {
      assert.equal(key.length, 32);
      password = key.toString("hex");
    } finally {
      key.fill(0);
    }
    const vault = new Vault(join(identity.directory, "source.vault")),
      record = await readJournal(vault, password, identity);
    validate(record, identity);
    assert.ok(
      ["CONFIRMED", "OPENING"].includes(record.data.phase),
      "NATIVE_SOURCE_CONFIRMED_POINT_REQUIRED",
    );
    const processes = [
      record.data.creator,
      ...SECTIONS.flatMap((k) => record.data.sections[k]?.ownedProcesses ?? []),
    ];
    for (const p of processes) await absent(p);
    const authority = opaque(),
      s = {
        identity,
        vault,
        password,
        record,
        tail: Promise.resolve(),
        closed: false,
        fault: false,
        opening: true,
        opened: new Set(),
        references: new Map(),
        release: null,
      };
    authorities.set(authority, s);
    if (uncertain(record.data) && !resumableCheckpoints(record.data)) {
      s.record = { ...record, data: { ...record.data, phase: "UNKNOWN" } };
      return authority;
    }
    try {
      assert.ok(
        SECTIONS.every((k) => record.data.sections[k]) &&
          FAMILIES.every((k) => record.data.native[k]?.confirmed),
        "NATIVE_SOURCE_COMPLETE_ORIGINAL_MEMBERSHIP",
      );
      await clearOriginalSourceVaultLock(s);
      await acquire(s, false);
      if (uncertain(record.data)) await reconcileCheckpoints(s);
      // A claim survives partial reopen; it is never reset by cleanup.
      await exclusive(
        join(
          identity.directory,
          "open-" + s.record.data.generation + ".claimed",
        ),
        Buffer.from(
          JSON.stringify({
            profile: identity.profile,
            generation: s.record.data.generation,
            checkpointSHA256: hash(Buffer.from(JSON.stringify(s.record))),
          }),
        ),
      );
      const creator = await processIdentity(process.pid);
      await update(s, (d) => ({
        ...d,
        phase: "OPENING",
        generation: d.generation + 1,
        creator,
      }));
      return authority;
    } catch (error) {
      s.closed = true;
      authorities.delete(authority);
      try {
        await s.release?.();
      } catch (cleanup) {
        throw new AggregateError(
          [error, cleanup],
          "NATIVE_SOURCE_OPEN_CLEANUP_FAILED",
        );
      } finally {
        s.password = null;
      }
      throw error;
    }
  }
  // Fixed producer tokens never leave these module-to-module calls.
  function writer(s, section) {
    const token = opaque();
    writes.set(token, {
      token,
      s,
      section,
      generation: s.record.data.generation,
      used: false,
      runtimeConsumed: false,
      processes: new Map(),
    });
    return token;
  }
  const processKey = (value) => canonical(value);
  function producerProcesses(t, values) {
    for (const value of values)
      assert.ok(
        t.processes.has(processKey(value)),
        "NATIVE_SOURCE_ORIGINAL_PROCESS_PROVENANCE",
      );
  }
  function nativeSourceRecoverySectionIdentityV1(token, section) {
    assert.equal(arguments.length, 2);
    const t = writes.get(token) ?? reads.get(token);
    assert.ok(
      t &&
        t.section === section &&
        t.generation === t.s.record.data.generation &&
        SECTIONS.includes(section) &&
        (writes.has(token) ||
          (reads.has(token) &&
            (t.s.record.data.phase === "OPENING" ||
              (t.used && t.resumed && t.s.record.data.phase === "CONFIRMED")))),
      "NATIVE_SOURCE_ORIGINAL_SECTION_TOKEN",
    );
    originalFromState(t.s);
    return Object.freeze(copy(t.s.identity));
  }
  function originalFromState(s) {
    assert.ok(
      !s.closed &&
        !s.fault &&
        s.record.data.phase !== "UNKNOWN" &&
        Date.now() < s.identity.deadlineMs,
      "NATIVE_SOURCE_UNAVAILABLE",
    );
  }
  function nativeSourceRecoveryOriginalReferenceV1(token, section, name) {
    assert.equal(arguments.length, 3);
    nativeSourceRecoverySectionIdentityV1(token, section);
    const t = writes.get(token) ?? reads.get(token);
    assert.ok(
      SECTIONS.includes(name) && t.s.references.has(name),
      "NATIVE_SOURCE_ORIGINAL_PART_REFERENCE",
    );
    return t.s.references.get(name);
  }
  async function nativeSourceRecoveryOwnedProcessV1(token, section, pid) {
    assert.equal(arguments.length, 3);
    nativeSourceRecoverySectionIdentityV1(token, section);
    assert.ok(
      writes.has(token) || reads.has(token),
      "NATIVE_SOURCE_ORIGINAL_PROCESS_PRODUCER",
    );
    const t = writes.get(token) ?? reads.get(token),
      identity = await processIdentity(pid);
    t.processes.set(processKey(identity), identity);
    return Object.freeze(identity);
  }
  async function retainOriginalNativeSourceSectionV1(token, section, data) {
    assert.equal(arguments.length, 3);
    nativeSourceRecoverySectionIdentityV1(token, section);
    const t = writes.get(token);
    assert.ok(t && !t.used, "NATIVE_SOURCE_ORIGINAL_SECTION_WRITER");
    t.used = true;
    const value = dataCopy(data);
    validateSection(value, t.s.identity, section);
    producerProcesses(t, value.ownedProcesses);
    await update(t.s, (d) => {
      assert.equal(d.sections[section], null, "NATIVE_SOURCE_SECTION_ONCE");
      d.sections[section] = value;
      return d;
    });
    const handle = opaque();
    handles.set(handle, {
      s: t.s,
      section,
      tokenState: t,
      processesBound: !FAMILIES.includes(section),
    });
    return handle;
  }
  async function updateOriginalNativeSourceSectionV1(handle, data) {
    assert.equal(arguments.length, 2);
    const h = handles.get(handle);
    assert.ok(h, "NATIVE_SOURCE_ORIGINAL_SECTION_HANDLE");
    nativeSourceRecoverySectionIdentityV1(h.tokenState.token, h.section);
    const value = dataCopy(data);
    validateSection(value, h.s.identity, h.section);
    producerProcesses(h.tokenState, value.ownedProcesses);
    await update(h.s, (d) => {
      assert.ok(
        d.sections[h.section],
        "NATIVE_SOURCE_ORIGINAL_SECTION_REQUIRED",
      );
      assert.equal(value.schema, d.sections[h.section].schema);
      if (h.processesBound)
        assert.deepEqual(
          value.ownedProcesses,
          d.sections[h.section].ownedProcesses,
          "NATIVE_SOURCE_ORIGINAL_PROCESS_CHANGED",
        );
      else {
        assert.ok(
          (h.s.record.data.phase === "SEEDING" &&
            FAMILIES.includes(h.section)) ||
            (h.resumed && h.s.record.data.phase === "OPENING"),
          "NATIVE_SOURCE_PROCESS_REBIND_ONCE",
        );
        h.processesBound = true;
      }
      d.sections[h.section] = value;
      return d;
    });
  }
  function consumeOriginalNativeSourceSectionV1(token, section) {
    assert.equal(arguments.length, 2);
    nativeSourceRecoverySectionIdentityV1(token, section);
    const t = reads.get(token);
    assert.ok(t && !t.used, "NATIVE_SOURCE_ORIGINAL_SECTION_READER");
    t.used = true;
    t.s.opened.add(section);
    return copy(t.s.record.data.sections[section]);
  }
  function resumeOriginalNativeSourceSectionV1(token, section) {
    assert.equal(arguments.length, 2);
    nativeSourceRecoverySectionIdentityV1(token, section);
    const t = reads.get(token);
    assert.ok(
      t && t.used && !t.resumed,
      "NATIVE_SOURCE_ORIGINAL_SECTION_RESUME",
    );
    t.resumed = true;
    const handle = opaque();
    handles.set(handle, {
      s: t.s,
      section,
      tokenState: t,
      resumed: true,
      processesBound: false,
    });
    return handle;
  }
  async function retainOriginalNativeSourceReferenceV1(
    authority,
    section,
    resource,
  ) {
    assert.equal(arguments.length, 3);
    const s = original(authority);
    assert.equal(s.record.data.phase, "SEEDING");
    assert.ok(
      SECTIONS.includes(section) &&
        !FAMILIES.includes(section) &&
        s.record.data.sections[section] === null,
    );
    const token = writer(s, section);
    const producer = await load.nativeOriginalSourcePartsV1();
    const retained = await producer.retainFixedOriginalNativeSourcePartV1(
      token,
      section,
      resource,
    );
    s.references.set(section, retained);
    return retained;
  }
  async function createOriginalNativeSourceAccountV1(authority, input) {
    assert.equal(arguments.length, 2);
    const s = original(authority);
    assert.equal(s.record.data.phase, "SEEDING");
    assert.equal(s.record.data.sections.account, null);
    const module = await load.nativeValueAccountAuthorityV2(),
      account = await module.createOriginalNativeSourceNoteAccountAuthorityV1(
        writer(s, "account"),
        input,
      );
    s.references.set("account", account);
    return account;
  }
  async function createOriginalNativeSourceSessionV1(authority, input) {
    assert.equal(arguments.length, 2);
    const s = original(authority);
    assert.equal(s.record.data.phase, "SEEDING");
    assert.equal(s.record.data.sections.session, null);
    assert.equal(
      input.account,
      s.references.get("account"),
      "NATIVE_SOURCE_ORIGINAL_SESSION_ACCOUNT",
    );
    await Promise.resolve();
    const joined = await createOriginalNativeSourceGraphAccountSessionV1(
      writer(s, "session"),
      input,
    );
    s.references.set("session", joined.session);
    return joined;
  }
  async function reopenOriginalNativeSourceReferenceV1(
    authority,
    section,
    contexts,
  ) {
    assert.equal(arguments.length, 3);
    const s = original(authority);
    assert.ok(s.opening && s.record.data.phase === "OPENING");
    assert.equal(
      SECTIONS[s.opened.size],
      section,
      "NATIVE_SOURCE_ORIGINAL_OPEN_ORDER",
    );
    const token = opaque();
    reads.set(token, {
      token,
      s,
      section,
      generation: s.record.data.generation,
      used: false,
      processes: new Map(),
    });
    try {
      const producer = await load.nativeOriginalSourcePartsV1();
      const retained = await producer.reopenFixedOriginalNativeSourcePartV1(
        token,
        section,
        contexts,
      );
      s.references.set(section, retained);
      return retained;
    } catch (e) {
      s.fault = true;
      throw e;
    }
  }
  async function createOriginalNativeSourceClockPairV1(authority) {
    assert.equal(arguments.length, 1);
    const s = original(authority);
    assert.equal(s.record.data.phase, "SEEDING");
    const module = sourceRuntimeAPI;
    let runtime, nativeRuntime;
    try {
      runtime = await module.createOwnedNativeDurableSourceRuntimeV1(
        writer(s, "receiver"),
      );
      nativeRuntime = await module.createOwnedNativeDurableSourceRuntimeV1(
        writer(s, "graphNative"),
      );
      return module.bindOwnedNativeDurableSourceClockPairV1(
        runtime,
        nativeRuntime,
      );
    } catch (e) {
      for (const r of [nativeRuntime, runtime])
        if (r)
          try {
            await r.close({ removeScratch: false });
          } catch {}
      throw e;
    }
  }
  function consumeOriginalNativeSourceRuntimeRequestV1(token) {
    assert.equal(arguments.length, 1);
    const t = writes.get(token) ?? reads.get(token);
    assert.ok(
      t && FAMILIES.includes(t.section) && !t.runtimeConsumed,
      "NATIVE_SOURCE_ORIGINAL_RUNTIME_REQUEST",
    );
    nativeSourceRecoverySectionIdentityV1(token, t.section);
    t.runtimeConsumed = true;
    const request = opaque();
    requests.set(request, {
      token,
      s: t.s,
      family: t.section,
      opening: reads.has(token),
      seed: reads.has(token)
        ? consumeOriginalNativeSourceSectionV1(token, t.section)
        : null,
    });
    return request;
  }
  function runtimeRequest(request) {
    const r = requests.get(request);
    assert.ok(r, "NATIVE_SOURCE_ORIGINAL_RUNTIME_REQUEST");
    nativeSourceRecoverySectionIdentityV1(r.token, r.family);
    return r;
  }
  function originalNativeSourceRuntimeRequestIdentityV1(request) {
    assert.equal(arguments.length, 1);
    const r = runtimeRequest(request);
    return Object.freeze({
      family: r.family,
      opening: r.opening,
      identity: Object.freeze(copy(r.s.identity)),
    });
  }
  function readOriginalNativeSourceRuntimeSeedV1(request) {
    assert.equal(arguments.length, 1);
    const r = runtimeRequest(request);
    assert.ok(r.opening && r.seed, "NATIVE_SOURCE_ORIGINAL_RUNTIME_SEED");
    return copy(r.seed);
  }
  async function retainOriginalNativeSourceRuntimeSeedV1(request, data) {
    assert.equal(arguments.length, 2);
    const r = runtimeRequest(request);
    assert.equal(r.opening, false);
    return retainOriginalNativeSourceSectionV1(r.token, r.family, data);
  }
  function resumeOriginalNativeSourceRuntimeSeedV1(request) {
    assert.equal(arguments.length, 1);
    const r = runtimeRequest(request);
    assert.equal(r.opening, true);
    return resumeOriginalNativeSourceSectionV1(r.token, r.family);
  }
  async function originalNativeSourceRuntimeOwnedProcessV1(request, pid) {
    assert.equal(arguments.length, 2);
    const r = runtimeRequest(request),
      t = writes.get(r.token) ?? reads.get(r.token),
      identity = await processIdentity(pid);
    t.processes.set(processKey(identity), identity);
    return Object.freeze(identity);
  }
  async function readOriginalNativeSourceRuntimeStateV1(request) {
    assert.equal(arguments.length, 1);
    const r = runtimeRequest(request),
      s = r.s;
    assert.ok(
      r.opening && s.opening && s.opened.has(r.family),
      "NATIVE_SOURCE_ORIGINAL_RUNTIME_REOPEN",
    );
    return readNativeState(
      s,
      r.family,
      s.record.data.native[r.family].confirmed,
    );
  }
  async function attachOriginalNativeSourceRuntimeV1(request, runtime) {
    assert.equal(arguments.length, 2);
    const r = runtimeRequest(request);
    assert.equal(
      runtimes.has(runtime),
      false,
      "NATIVE_SOURCE_RUNTIME_ALREADY_ATTACHED",
    );
    const module = sourceRuntimeAPI;
    module.assertOwnedNativeDurableSourceRuntimeV1(runtime);
    runtimes.set(runtime, { s: r.s, family: r.family });
    r.s.references.set(r.family, runtime);
  }
  async function beginOriginalNativeSourceMutationV1(runtime) {
    assert.equal(arguments.length, 1);
    const r = runtimes.get(runtime);
    assert.ok(r, "NATIVE_SOURCE_ORIGINAL_MUTATION");
    originalFromState(r.s);
    const token = opaque();
    const next = await update(r.s, (d) => {
      const old = d.native[r.family];
      assert.ok(!old || old.pending === null, "NATIVE_SOURCE_PENDING_MUTATION");
      d.native[r.family] = {
        pending: r.s.record.revision + 1,
        confirmed: old?.confirmed ?? null,
        candidate: null,
      };
      return d;
    });
    mutations.set(token, {
      ...r,
      runtime,
      revision: next.revision,
      used: false,
    });
    return token;
  }
  async function confirmOriginalNativeSourceMutationV1(token) {
    assert.equal(arguments.length, 1);
    const m = mutations.get(token);
    assert.ok(m && !m.used, "NATIVE_SOURCE_ORIGINAL_MUTATION_TOKEN");
    m.used = true;
    originalFromState(m.s);
    const module = sourceRuntimeAPI;
    const value = await module.readOriginalNativeDurableSourceStateV1(
      m.runtime,
    );
    assertOwnedEvmRecoveryStateDumpV1(value.stateDump);
    assert.equal(value.uncertainMutation, false, "NATIVE_SOURCE_HALF_MUTATION");
    const plaintext = Buffer.from(JSON.stringify(value));
    assert.ok(
      plaintext.length > 0 && plaintext.length <= MAX_RECORD - STATE_OVERHEAD,
      "NATIVE_SOURCE_NATIVE_RECORD_BOUND",
    );
    const previous = m.s.record.data.native[m.family].confirmed,
      path =
        m.family +
        "-confirmed-" +
        (previous?.path === m.family + "-confirmed-0.aead" ? "1" : "0") +
        ".aead";
    const pin = {
      path,
      bytes: plaintext.length + STATE_OVERHEAD,
      sha256: null,
      stateSHA256: hash(plaintext),
      generation: value.processGeneration,
      genesis: value.genesisHash,
      head: copy(value.head),
    };
    let bytes;
    try {
      bytes = encryptState(m.s, m.family, pin, plaintext);
      assert.equal(bytes.length, pin.bytes);
      pin.sha256 = hash(bytes);
      await replace(join(m.s.identity.directory, path), bytes);
      await update(m.s, (d) => {
        assert.equal(d.native[m.family].pending, m.revision);
        assert.deepEqual(d.native[m.family].confirmed, previous);
        d.native[m.family] = {
          pending: m.revision,
          confirmed: previous,
          candidate: { revision: m.revision, confirmed: pin },
        };
        return d;
      });
      await update(m.s, (d) => {
        assert.equal(d.native[m.family].pending, m.revision);
        assert.deepEqual(d.native[m.family].candidate, {
          revision: m.revision,
          confirmed: pin,
        });
        d.native[m.family] = { pending: null, confirmed: pin, candidate: null };
        return d;
      });
    } finally {
      bytes?.fill(0);
      plaintext.fill(0);
    }
  }
  async function confirmOriginalNativeSourceBirthV1(runtime) {
    assert.equal(arguments.length, 1);
    const token = await beginOriginalNativeSourceMutationV1(runtime);
    return confirmOriginalNativeSourceMutationV1(token);
  }
  function readOriginalNativeSourceClockCheckpointV1(authority) {
    assert.equal(arguments.length, 1);
    return original(authority).record.data.clockSecond;
  }
  async function retainOriginalNativeSourceClockCheckpointV1(authority, clock) {
    assert.equal(arguments.length, 2);
    const s = original(authority),
      module = await Promise.resolve(originalSourceClockBackend),
      pair = module.readOriginalNativeSourceClockReferencesV1(clock);
    for (const resource of [pair.runtime, pair.nativeRuntime])
      assert.equal(
        runtimes.get(resource)?.s,
        s,
        "NATIVE_SOURCE_CLOCK_ORIGINAL_REALM",
      );
    const second = module.snapshotOriginalNativeSourceObservedClockV1(clock);
    assert.ok(
      /^[1-9][0-9]{0,19}$/.exec(second)?.[0] === second,
      "NATIVE_SOURCE_ORIGINAL_CLOCK_CHECKPOINT",
    );
    await update(s, (d) => {
      assert.ok(
        BigInt(second) >= BigInt(d.clockSecond),
        "NATIVE_SOURCE_CLOCK_ROLLBACK",
      );
      d.clockSecond = second;
      return d;
    });
  }
  async function finishOriginalNativeSourceBirthV1(authority) {
    assert.equal(arguments.length, 1);
    const s = original(authority);
    assert.equal(s.record.data.phase, "SEEDING");
    await update(s, (d) => {
      assert.ok(
        SECTIONS.every((k) => d.sections[k]) &&
          FAMILIES.every((k) => d.native[k]?.confirmed) &&
          BigInt(d.clockSecond) > 0n &&
          !uncertain(d),
        "NATIVE_SOURCE_COMPLETE_ORIGINAL_MEMBERSHIP",
      );
      d.phase = "CONFIRMED";
      return d;
    });
    return originalNativeSourceCapsuleStatusV1(authority);
  }
  async function finishOriginalNativeSourceReopenV1(authority) {
    assert.equal(arguments.length, 1);
    const s = original(authority);
    assert.ok(s.opening && s.opened.size === SECTIONS.length);
    await update(s, (d) => {
      assert.equal(d.phase, "OPENING");
      assert.equal(uncertain(d), false);
      d.phase = "CONFIRMED";
      return d;
    });
    s.opening = false;
    return originalNativeSourceCapsuleStatusV1(authority);
  }
  async function closeOriginalNativeSourceCapsuleV1(authority) {
    assert.equal(arguments.length, 1);
    const s = authorities.get(authority);
    assert.ok(s, "NATIVE_SOURCE_ORIGINAL_CAPSULE");
    if (s.closed) return { closed: true };
    await s.tail;
    for (const name of FAMILIES) {
      const resource = s.references.get(name);
      if (resource)
        assert.equal(
          resource.processStatus().stopped,
          true,
          "NATIVE_SOURCE_CLOSE_OWNED_PROCESS_UNCONFIRMED",
        );
    }
    for (const section of SECTIONS)
      for (const owned of s.record.data.sections[section]?.ownedProcesses ?? [])
        if (owned.pid !== process.pid) await absent(owned);
    s.closed = true;
    s.password = undefined;
    if (s.release) await s.release();
    return { closed: true, betweenOperationsOnly: true };
  }

  // This instance is the only runtime issuer admitted to this journal. Callers may
  // construct isolated mechanical backends, but cannot access this instance or
  // register their runtimes as SOURCE authority.
  const originalEvmRuntimeBackend = buildOwnedEvmRuntimeBackendV1(
    Object.freeze({
      journal: Object.freeze({
        originalNativeSourceRuntimeRequestIdentityV1,
        readOriginalNativeSourceRuntimeSeedV1,
        retainOriginalNativeSourceRuntimeSeedV1,
        resumeOriginalNativeSourceRuntimeSeedV1,
        originalNativeSourceRuntimeOwnedProcessV1,
        readOriginalNativeSourceRuntimeStateV1,
        updateOriginalNativeSourceSectionV1,
        beginOriginalNativeSourceMutationV1,
        confirmOriginalNativeSourceMutationV1,
      }),
      recovery: Object.freeze({
        consumeExternalDefiReceiverRepairV1:
          wrappedRecovery.consumeExternalDefiReceiverRepairV1,
        consumeWrappedRuntimeRecoveryV1:
          wrappedRecovery.consumeWrappedRuntimeRecoveryV1,
        assertNativeEconomicRecoveryCaptureV1:
          wrappedRecovery.assertNativeEconomicRecoveryCaptureV1,
        nativeEconomicRecoverySectionIdentityV1:
          wrappedRecovery.nativeEconomicRecoverySectionIdentityV1,
        externalDefiReceiverCaptureIdentityV2:
          wrappedRecovery.externalDefiReceiverCaptureIdentityV2,
        consumeExternalDefiReceiverRuntimeSectionV2:
          wrappedRecovery.consumeExternalDefiReceiverRuntimeSectionV2,
        deviceExternalFlatReceiverCaptureIdentityV1:
          wrappedRecovery.deviceExternalFlatReceiverCaptureIdentityV1,
        consumeDeviceExternalFlatReceiverRuntimeSectionV1:
          wrappedRecovery.consumeDeviceExternalFlatReceiverRuntimeSectionV1,
        assertNativeLiveArmedRecoveryCaptureV1:
          wrappedRecovery.assertNativeLiveArmedRecoveryCaptureV1,
        nativeLiveArmedRecoverySectionIdentityV1:
          wrappedRecovery.nativeLiveArmedRecoverySectionIdentityV1,
        consumeNativeLiveArmedRecoverySectionV1:
          wrappedRecovery.consumeNativeLiveArmedRecoverySectionV1,
        async nativeD26() {
          const module0 = await load.wrappedRecoveryAuthorityV1();
          return Object.freeze({
            consumeNativeD26ObservationSectionV1:
              module0.consumeNativeD26ObservationSectionV1,
          });
        },
        async economic() {
          const module0 = await load.wrappedRecoveryAuthorityV1();
          return Object.freeze({
            consumeNativeEconomicRecoverySectionV1:
              module0.consumeNativeEconomicRecoverySectionV1,
          });
        },
      }),
      deviceSource: Object.freeze({
        consumeOriginalDeviceGraphSourceRequestV2:
          deviceSourceAuthority.consumeOriginalDeviceGraphSourceRequestV2,
        consumeOriginalDeviceGraphSourceSectionV2:
          deviceSourceAuthority.consumeOriginalDeviceGraphSourceSectionV2,
        originalDeviceGraphSourceSectionIdentityV2:
          deviceSourceAuthority.originalDeviceGraphSourceSectionIdentityV2,
        beginOriginalDeviceGraphSourceActivityV2:
          deviceSourceAuthority.beginOriginalDeviceGraphSourceActivityV2,
        endOriginalDeviceGraphSourceActivityV2:
          deviceSourceAuthority.endOriginalDeviceGraphSourceActivityV2,
      }),
      reorg: Object.freeze({
        async probe() {
          const module0 = await load.nativeValueExecutionV2();
          return Object.freeze({
            consumeOriginalNativeFReorgProbeV1:
              module0.consumeOriginalNativeFReorgProbeV1,
          });
        },
        async recovery() {
          const module0 = await load.nativeValueExecutionV2();
          return Object.freeze({
            consumeOriginalNativeRecoveryReorgWireV1:
              module0.consumeOriginalNativeRecoveryReorgWireV1,
          });
        },
      }),
      dispatch: Object.freeze({
        async deviceNote() {
          const module0 = await load.deviceExternalFlatNoteAuthorityV1();
          return Object.freeze({
            consumeOriginalDeviceExternalFlatSendV1:
              module0.consumeOriginalDeviceExternalFlatSendV1,
          });
        },
        async claim() {
          const module0 = await load.evmDispatchGate();
          const module1 = await load.controller();
          const module2 = await load.wrappedControllerV1();
          return Object.freeze({
            assertOwnedEvmDispatchRequest:
              module0.assertOwnedEvmDispatchRequest,
            isOwnedClaimEvmDispatchRequest:
              module1.isOwnedClaimEvmDispatchRequest,
            assertOwnedClaimEvmDispatchRequest:
              module1.assertOwnedClaimEvmDispatchRequest,
            isWrapped: module2.isOwnedClaimEvmDispatchRequest,
            openWrapped: module2.assertOwnedClaimEvmDispatchRequest,
          });
        },
        async paged() {
          const module0 = await load.fundedPagedNativeProviderV3();
          return Object.freeze({
            openOriginalPagedNativeDispatchV3:
              module0.openOriginalPagedNativeDispatchV3,
            openOriginalPagedUniswapProviderDispatchV3:
              module0.openOriginalPagedUniswapProviderDispatchV3,
          });
        },
        async native() {
          const module0 = await load.nativeValueEvmDispatchGate();
          const module1 = await load.wrappedClaimGraphDispatchGateV1();
          return Object.freeze({
            assertOwnedNativeValueEvmDispatchRequest:
              module0.assertOwnedNativeValueEvmDispatchRequest,
            isWrappedClaimGraphDispatchRequestV1:
              module1.isWrappedClaimGraphDispatchRequestV1,
            openWrappedNativeValueEvmDispatchRequest:
              module1.assertOwnedNativeValueEvmDispatchRequest,
            consumeWrappedGraphDispatchAuthorityV4:
              module1.consumeWrappedGraphDispatchAuthorityV4,
          });
        },
      }),
      observation: Object.freeze({
        async nativeValue() {
          const module0 = await load.evmNativeValueHealthSourceV4();
          return Object.freeze({
            createOwnedEvmNativeValueHealthSource:
              module0.createOwnedEvmNativeValueHealthSource,
          });
        },
      }),
    }),
  );
  const originalSourceRuntimeBackend = originalEvmRuntimeBackend.sourceRuntime;

  // These functions retain the same closed backend as SOURCE. No instance or
  // configurable issuer is exported by either public facade.
  const {
    createOwnedPagedObservedHubEvmV4,
    assertOwnedPagedObservedHubEvmV4,
    createOwnedLocalEvmObservedClockV1,
    refreshNativeValueReceiverClock,
    nativeValueReceiverInclusionSecondV1,
    assertOwnedLocalEvmObservedClockV1,
    consumeNativeEconomicObservedCustodyRequestV2,
    createOwnedNativeEconomicObservedReceiverV2,
    createOwnedNativeEconomicObservedGraphRuntimeV2,
    createOwnedNativeEconomicObservedClockPairV2,
    assertOwnedNativeEconomicObservedReceiverV2,
    assertOwnedNativeEconomicObservedGraphRuntimeV2,
    createOwnedNativeLiveArmedObservedClockPairV1,
    assertOwnedNativeLiveArmedReceiverV1,
    assertOwnedNativeLiveArmedGraphRuntimeV1,
    bindOwnedNativeLiveArmedObservedClockPairV1,
    readOwnedNativeLiveArmedObservedClockPairV1,
    fenceOwnedNativeLiveArmedRuntimeV1,
    captureOwnedNativeLiveArmedRuntimeV1,
    abortOwnedNativeLiveArmedRuntimeV1,
    reopenOwnedNativeLiveArmedReceiverV1,
    reopenOwnedNativeLiveArmedGraphRuntimeV1,
    refreshOwnedNativeEconomicObservedGraphClockV2,
    probeOwnedOsakaTransactionGasRejectionV1,
    createOwnedOriginalNativeFReorgReceiverV1,
    isOwnedOriginalNativeFReorgReceiverV1,
    retainOwnedOriginalFReorgProbeV1,
    rewindOwnedOriginalFReorgProbeV1,
    reemitOwnedOriginalNativeRecoveryV1,
    armOwnedEvmRecoveryRetentionV1,
    captureOwnedEvmRecoveryV1,
    captureOwnedPagedEvmRecoveryV3,
    reopenOwnedPagedHubEvmV3,
    reopenOwnedPagedNativeEvmV3,
    createOwnedPagedHubDurableEvmV3,
    createOwnedPagedNativeDurableEvmV3,
    reopenOwnedReceiverRecoveryV1,
    reopenOwnedNativeD26ObservationReceiverV1,
    reopenOwnedNativeEconomicReceiverV1,
    reopenOwnedExternalDefiReceiverV2,
    reopenOwnedDeviceExternalFlatReceiverV1,
    reopenOwnedNativeEconomicGraphRuntimeV1,
    reopenOwnedReceiverPreopenRepairV1,
    reopenOwnedGraphNativeRecoveryV1,
    isOwnedLocalEvmNativeValueRuntime,
    assertOwnedLocalEvmNativeValueRuntime,
    assertOwnedLocalEvmNativeValueRuntimeLive,
    readOwnedLocalEvmNativeValueAuditStateV4,
    readOwnedEvmWrappedGraphOperationV4,
    ownedLocalEvmNativeValueRuntimeIdentity,
    openOwnedLocalEvmNativeValueSource,
    isOwnedLocalEvmNativeValueV1,
    assertOwnedLocalEvmNativeValueV1,
    isOwnedLocalEvmV2,
    ownedLocalEvmTransactionGasLimit,
    assertOwnedLocalEvmV2,
    createOwnedLocalEvmV2,
    createOwnedLocalEvmOsakaV1,
    createOwnedLocalEvmNativeValueV1,
    createOwnedLocalPagedNativeEvmV3,
    assertOwnedLocalPagedNativeEvmV3,
    createOwnedLocalEvmNativeValueBaseV1,
    createOwnedLocalEvmNativeValueArbitrumV1,
    createOwnedLocalEvmNativeValueBnbV1,
    createOwnedLocalEvmV2PoolGenerationAcceptance,
    ownedPoolGenerationTransportControls,
    recoveryAnvilPinV1,
    createOwnedRecoverableReceiverV1,
    createOwnedRecoverableGraphNativeV1,
    createOwnedNativeEconomicReceiverV2,
    createOwnedNativeEconomicGraphRuntimeV2,
    createOwnedExternalDefiReceiverV2,
    assertOwnedExternalDefiReceiverV2,
    captureOwnedExternalDefiReceiverV2,
    abortOwnedExternalDefiReceiverCaptureV2,
    createOwnedDeviceExternalFlatReceiverV1,
    createOwnedDeviceExternalFlatSourceReceiverV2,
    assertOwnedDeviceExternalFlatSourceReceiverV2,
    checkpointOwnedDeviceExternalFlatSourceReceiverV2,
    reopenOwnedDeviceExternalFlatSourceReceiverV2,
    assertOwnedDeviceExternalFlatReceiverV1,
    assertOwnedDeviceExternalFlatReceiverLiveV1,
    captureOwnedDeviceExternalFlatReceiverV1,
    abortOwnedDeviceExternalFlatReceiverCaptureV1,
    isOwnedNativeEconomicRuntimeV2,
    assertOwnedNativeEconomicRuntimeRecoverableV1,
    fenceOwnedNativeEconomicRuntimeV1,
    captureOwnedNativeEconomicRuntimeV1,
    abortOwnedNativeEconomicRuntimeV1,
    createNativeEconomicLocalCustodyV2,
    createNativeEconomicObservedLocalCustodyV2,
    assertNativeEconomicGenesisV2,
    reopenNativeEconomicLocalCustodyV2,
    reopenNativeEconomicObservedLocalCustodyV2,
    nativeEconomicLocalCustodyPublicV2,
    checkNativeEconomicLocalCustodyV2,
    signNativeEconomicCustodyTransactionV2,
    captureNativeEconomicLocalCustodyV2,
    prepareNativeEconomicCustodySigningV2,
    consumeNativeEconomicCustodySigningV2,
    revokeNativeEconomicCustodySigningV2,
    closeNativeEconomicLocalCustodyV2,
    consumeOwnedEvmNativeSourceRequest,
    describeOwnedLocalEvmNativeValueSource,
    createOwnedLocalEvmNativeValueHealthSource,
    openOriginalOwnedRollupNativeValueSourcesV1,
  } = originalEvmRuntimeBackend;

  const originalDurableSourceRuntimesV1 = new WeakMap(),
    originalDurableSourcePairsV1 = new WeakMap();
  async function createOwnedNativeDurableSourceRuntimeV1(token) {
    assert.equal(arguments.length, 1);
    const request = consumeOriginalNativeSourceRuntimeRequestV1(token);
    let runtime;
    try {
      runtime = await originalSourceRuntimeBackend.create(request);
      originalDurableSourceRuntimesV1.set(
        runtime,
        originalSourceRuntimeBackend.identity(runtime),
      );
      await attachOriginalNativeSourceRuntimeV1(request, runtime);
      await confirmOriginalNativeSourceBirthV1(runtime);
      return runtime;
    } catch (error) {
      if (runtime)
        try {
          error.cleanup = await runtime.close({ removeScratch: true });
        } catch (cleanupError) {
          error.cleanupError = cleanupError;
        }
      throw error;
    }
  }
  function durableSourceRuntime(runtime, family) {
    const state = originalDurableSourceRuntimesV1.get(runtime);
    assert.ok(
      state && (!family || state.family === family),
      "NATIVE_SOURCE_ORIGINAL_RUNTIME_REQUIRED",
    );
    originalSourceRuntimeBackend.assert(runtime);
    return state;
  }
  function assertOwnedNativeDurableSourceRuntimeV1(runtime) {
    assert.equal(arguments.length, 1);
    durableSourceRuntime(runtime);
  }
  function assertOwnedNativeDurableSourceReceiverV1(runtime) {
    assert.equal(arguments.length, 1);
    durableSourceRuntime(runtime, "receiver");
    assertOwnedNativeEconomicObservedReceiverV2(runtime);
  }
  function assertOwnedNativeDurableSourceGraphRuntimeV1(runtime) {
    assert.equal(arguments.length, 1);
    durableSourceRuntime(runtime, "graphNative");
    assertOwnedNativeEconomicObservedGraphRuntimeV2(runtime);
  }
  function bindOwnedNativeDurableSourceClockPairV1(receiver, native) {
    assert.equal(arguments.length, 2);
    const r = durableSourceRuntime(receiver, "receiver"),
      n = durableSourceRuntime(native, "graphNative");
    assert.deepEqual(
      r.identity,
      n.identity,
      "NATIVE_SOURCE_PAIR_ORIGINAL_REALM",
    );
    assert.equal(
      r.generation,
      n.generation,
      "NATIVE_SOURCE_PAIR_ORIGINAL_GENERATION",
    );
    assert.ok(
      !originalDurableSourcePairsV1.has(receiver) &&
        !originalDurableSourcePairsV1.has(native),
      "NATIVE_SOURCE_PAIR_ONCE",
    );
    originalSourceRuntimeBackend.bindClocks(receiver, native);
    const pair = Object.freeze({ runtime: receiver, nativeRuntime: native });
    originalDurableSourcePairsV1.set(receiver, pair);
    originalDurableSourcePairsV1.set(native, pair);
    return pair;
  }
  function readOwnedNativeDurableSourceClockPairV1(receiver, native) {
    assert.equal(arguments.length, 2);
    durableSourceRuntime(receiver, "receiver");
    durableSourceRuntime(native, "graphNative");
    const pair = originalDurableSourcePairsV1.get(receiver);
    assert.ok(
      pair &&
        pair.runtime === receiver &&
        pair.nativeRuntime === native &&
        originalDurableSourcePairsV1.get(native) === pair,
      "NATIVE_SOURCE_PAIR_ORIGINAL_REFERENCES",
    );
    return pair;
  }
  async function readOriginalNativeDurableSourceStateV1(runtime) {
    assert.equal(arguments.length, 1);
    durableSourceRuntime(runtime);
    return originalSourceRuntimeBackend.snapshot(runtime);
  }

  const sourceRuntimeAPI = Object.freeze({
    createOwnedNativeDurableSourceRuntimeV1,
    assertOwnedNativeDurableSourceRuntimeV1,
    bindOwnedNativeDurableSourceClockPairV1,
    readOriginalNativeDurableSourceStateV1,
  });

  // The journal and clock share one closed composition; callers cannot select its ports.
  const originalSourceClockBackend = buildOriginalNativeSourceClockBackendV1(
    Object.freeze({
      assertOriginalNativeSourceCapsuleV1,
      assertOwnedNativeDurableSourceReceiverV1,
      assertOwnedNativeDurableSourceGraphRuntimeV1,
      readOwnedNativeDurableSourceClockPairV1,
      refreshNativeValueReceiverClock,
      refreshOwnedNativeEconomicObservedGraphClockV2,
      createOriginalNativeSourceClockPairV1,
      readOriginalNativeSourceClockCheckpointV1,
      retainOriginalNativeSourceClockCheckpointV1,
    }),
  );
  const {
    assertOriginalNativeSourceObservedClockV1,
    readOriginalNativeSourceClockReferencesV1,
    snapshotOriginalNativeSourceObservedClockV1,
    refreshOriginalNativeSourceObservedClockV1,
    createOriginalNativeSourceObservedClocksV1,
    reopenOriginalNativeSourceObservedClocksV1,
  } = originalSourceClockBackend;

  // The fixed lower actor contracts load only during asynchronous birth/reopen.
  // Child owner modules retain their inspection-before-import boundary. Neither
  // the one instance nor its initialization promise can be selected by callers.
  let originalPairedActor = null;
  let originalPairedActorPending = null;
  async function prepareOriginalPairedActor() {
    if (!originalPairedActorPending)
      originalPairedActorPending = (async () => {
        const [originalFlatAccountSession, originalNativeAccount] =
          await Promise.all([
            load.flatAccountSession(),
            load.nativeValueAccountAuthorityV2(),
          ]);
        // Fixed original actor composition. The instance and all selected contracts stay private.
        return buildPairedOriginalAccountActorV2(
          Object.freeze({
            format: Object.freeze({
              genericAccountIdentity,
              sha: accountJournalSHA256,
            }),
            session: Object.freeze({
              assertFlatAccountSession: (...args) =>
                originalFlatAccountSession.assertFlatAccountSession(...args),
              flatManualNativeNoteActionTarget: (...args) =>
                flatManualNativeNoteActionTarget(...args),
            }),
            account: Object.freeze({
              nativeValueAccountManualNoteDetails: (...args) =>
                originalNativeAccount.nativeValueAccountManualNoteDetails(
                  ...args,
                ),
              assertOwnedNativeValueAccountAuthority: (...args) =>
                originalNativeAccount.assertOwnedNativeValueAccountAuthority(
                  ...args,
                ),
              nativeValueOriginalRecoverySourceV1FromAccount: (...args) =>
                originalNativeAccount.nativeValueOriginalRecoverySourceV1FromAccount(
                  ...args,
                ),
            }),
            economic: Object.freeze({
              assertNativeEconomicRecoveryCaptureV1: (...args) =>
                wrappedRecovery.assertNativeEconomicRecoveryCaptureV1(...args),
              nativeEconomicRecoverySectionIdentityV1: (...args) =>
                wrappedRecovery.nativeEconomicRecoverySectionIdentityV1(
                  ...args,
                ),
              consumeNativeEconomicRecoverySectionV1: (...args) =>
                wrappedRecovery.consumeNativeEconomicRecoverySectionV1(...args),
            }),
            source: Object.freeze({
              nativeSourceRecoveryOriginalReferenceV1: (...args) =>
                nativeSourceRecoveryOriginalReferenceV1(...args),
              nativeSourceRecoverySectionIdentityV1: (...args) =>
                nativeSourceRecoverySectionIdentityV1(...args),
              retainOriginalNativeSourceSectionV1: (...args) =>
                retainOriginalNativeSourceSectionV1(...args),
              consumeOriginalNativeSourceSectionV1: (...args) =>
                consumeOriginalNativeSourceSectionV1(...args),
              resumeOriginalNativeSourceSectionV1: (...args) =>
                resumeOriginalNativeSourceSectionV1(...args),
              updateOriginalNativeSourceSectionV1: (...args) =>
                updateOriginalNativeSourceSectionV1(...args),
            }),
          }),
        );
      })().then((instance) => (originalPairedActor = instance));
    return originalPairedActorPending;
  }
  function originalActorFamily() {
    if (!originalPairedActor)
      throw Object.assign(
        new Error("MOBILE_ORIGINAL_ACTOR_ORIGINAL_REQUIRED"),
        {
          code: "MOBILE_ORIGINAL_ACTOR_ORIGINAL_REQUIRED",
        },
      );
    return originalPairedActor;
  }
  async function createPairedOriginalAccountActorV2(...args) {
    const actor = await prepareOriginalPairedActor();
    return actor.createPairedOriginalAccountActorV2(...args);
  }
  function assertPairedOriginalAccountActorV2(...args) {
    return originalActorFamily().assertPairedOriginalAccountActorV2(...args);
  }
  function pairedOriginalAccountActorDescriptorV2(...args) {
    return originalActorFamily().pairedOriginalAccountActorDescriptorV2(
      ...args,
    );
  }
  function assertPairedOriginalAccountActorAccountV2(...args) {
    return originalActorFamily().assertPairedOriginalAccountActorAccountV2(
      ...args,
    );
  }
  function pairedOriginalAccountPublicFrameV2(value) {
    assert.equal(arguments.length, 1, "MOBILE_ORIGINAL_ACTOR_ARGUMENTS");
    return originalActorFrameDataV1(value);
  }
  function fenceOriginalNativeActorEconomicRecoveryV1(...args) {
    return originalActorFamily().fenceOriginalNativeActorEconomicRecoveryV1(
      ...args,
    );
  }
  function captureOriginalNativeActorEconomicRecoveryV1(...args) {
    return originalActorFamily().captureOriginalNativeActorEconomicRecoveryV1(
      ...args,
    );
  }
  function stopCapturedNativeActorEconomicRecoveryV1(...args) {
    return originalActorFamily().stopCapturedNativeActorEconomicRecoveryV1(
      ...args,
    );
  }
  function abortNativeActorEconomicRecoveryV1(...args) {
    return originalActorFamily().abortNativeActorEconomicRecoveryV1(...args);
  }
  async function reopenOriginalNativeActorEconomicRecoveryV1(...args) {
    const actor = await prepareOriginalPairedActor();
    return actor.reopenOriginalNativeActorEconomicRecoveryV1(...args);
  }
  function assertNativeActorEconomicMembershipV1(...args) {
    return originalActorFamily().assertNativeActorEconomicMembershipV1(...args);
  }
  function nativePairedActorEconomicSourceV1(...args) {
    return originalActorFamily().nativePairedActorEconomicSourceV1(...args);
  }
  function assertNativeActorSessionAccountMembershipV1(...args) {
    return originalActorFamily().assertNativeActorSessionAccountMembershipV1(
      ...args,
    );
  }
  function reconcileOriginalNativeActorSourceCheckpointV1(request) {
    assert.equal(arguments.length, 1, "NATIVE_SOURCE_ACTOR_ARGUMENTS");
    return reconcileNativeSourceActorCheckpointDataV1(
      consumeOriginalNativeSourceActorCheckpointV1(request),
    );
  }
  function retainOriginalNativeActorSourceV1(...args) {
    return originalActorFamily().retainOriginalNativeActorSourceV1(...args);
  }
  async function reopenOriginalNativeActorSourceV1(...args) {
    const actor = await prepareOriginalPairedActor();
    return actor.reopenOriginalNativeActorSourceV1(...args);
  }

  // SOURCE owns the one admitted native-session instance. All resources load from
  // fixed modules during asynchronous birth/reopen; guards never initialize it.
  let originalNativeSessions = null;
  let originalNativeSessionsPending = null;
  async function prepareOriginalNativeSessions() {
    if (!originalNativeSessionsPending)
      originalNativeSessionsPending = (async () => {
        const [account, system] = await Promise.all([
          load.nativeValueAccountAuthorityV2(),
          load.nativeValueSystemV2(),
        ]);
        return buildNativeManualSessionV1(
          Object.freeze({
            format: Object.freeze({
              genericAccountIdentity,
              sha: accountJournalSHA256,
            }),
            account: Object.freeze({
              assertOriginalNativeAccountSourceV1: (...args) =>
                account.assertOriginalNativeAccountSourceV1(...args),
              assertOwnedNativeValueAccountAuthority: (...args) =>
                account.assertOwnedNativeValueAccountAuthority(...args),
              nativeValueAccountManualGraphDetails: (...args) =>
                account.nativeValueAccountManualGraphDetails(...args),
              assertNativeValueAccountManualGraphExecution: (...args) =>
                account.assertNativeValueAccountManualGraphExecution(...args),
              nativeValueAccountManualNoteDetails: (...args) =>
                account.nativeValueAccountManualNoteDetails(...args),
            }),
            economic: Object.freeze({
              assertNativeEconomicRecoveryCaptureV1: (...args) =>
                wrappedRecovery.assertNativeEconomicRecoveryCaptureV1(...args),
              nativeEconomicRecoverySectionIdentityV1: (...args) =>
                wrappedRecovery.nativeEconomicRecoverySectionIdentityV1(
                  ...args,
                ),
              consumeNativeEconomicRecoverySectionV1: (...args) =>
                wrappedRecovery.consumeNativeEconomicRecoverySectionV1(...args),
              nativeValueOriginalRecoverySourceV1: (...args) =>
                system.nativeValueOriginalRecoverySourceV1(...args),
            }),
            source: Object.freeze({
              nativeSourceRecoverySectionIdentityV1: (...args) =>
                nativeSourceRecoverySectionIdentityV1(...args),
              retainOriginalNativeSourceSectionV1: (...args) =>
                retainOriginalNativeSourceSectionV1(...args),
              consumeOriginalNativeSourceSectionV1: (...args) =>
                consumeOriginalNativeSourceSectionV1(...args),
              updateOriginalNativeSourceSectionV1: (...args) =>
                updateOriginalNativeSourceSectionV1(...args),
              resumeOriginalNativeSourceSectionV1: (...args) =>
                resumeOriginalNativeSourceSectionV1(...args),
              nativeSourceRecoveryOwnedProcessV1: (...args) =>
                nativeSourceRecoveryOwnedProcessV1(...args),
            }),
            resources: Object.freeze({
              loadDurableKeeper: () => load.durableGenericAccountKeeper(),
              loadAccountSession: () => load.flatAccountSession(),
              loadEconomicState: () => load.originalWalletEconomicStateV1(),
            }),
          }),
        );
      })().then((instance) => (originalNativeSessions = instance));
    return originalNativeSessionsPending;
  }
  function originalNativeSessionFamily() {
    if (!originalNativeSessions)
      throw Object.assign(new Error("NATIVE_SESSION_ORIGINAL_REQUIRED"), {
        code: "NATIVE_SESSION_ORIGINAL_REQUIRED",
      });
    return originalNativeSessions;
  }
  function flatManualNativeNoteReviews(...args) {
    return originalNativeSessions?.flatManualNativeNoteReviews(...args) ?? [];
  }
  function flatManualNativeNoteActionTarget(...args) {
    return (
      originalNativeSessions?.flatManualNativeNoteActionTarget(...args) ?? null
    );
  }
  async function createNativeValueManualGraphAccountSession(...args) {
    const family = await prepareOriginalNativeSessions();
    return family.createNativeValueManualGraphAccountSession(...args);
  }
  function assertNativeWalletEconomicSessionV1(...args) {
    return originalNativeSessionFamily().assertNativeWalletEconomicSessionV1(
      ...args,
    );
  }
  function fenceOriginalNativeSessionEconomicRecoveryV1(...args) {
    return originalNativeSessionFamily().fenceOriginalNativeSessionEconomicRecoveryV1(
      ...args,
    );
  }
  function captureOriginalNativeSessionEconomicRecoveryV1(...args) {
    return originalNativeSessionFamily().captureOriginalNativeSessionEconomicRecoveryV1(
      ...args,
    );
  }
  function stopCapturedNativeSessionEconomicRecoveryV1(...args) {
    return originalNativeSessionFamily().stopCapturedNativeSessionEconomicRecoveryV1(
      ...args,
    );
  }
  function abortNativeSessionEconomicRecoveryV1(...args) {
    return originalNativeSessionFamily().abortNativeSessionEconomicRecoveryV1(
      ...args,
    );
  }
  async function reopenOriginalNativeSessionEconomicRecoveryV1(...args) {
    const family = await prepareOriginalNativeSessions();
    return family.reopenOriginalNativeSessionEconomicRecoveryV1(...args);
  }
  function assertNativeSessionEconomicMembershipV1(...args) {
    return originalNativeSessionFamily().assertNativeSessionEconomicMembershipV1(
      ...args,
    );
  }
  function assertOriginalNativeSessionSourceKeeperV1(...args) {
    return originalNativeSessionFamily().assertOriginalNativeSessionSourceKeeperV1(
      ...args,
    );
  }
  function prepareOriginalNativeSessionKeeperSourceCheckpointV1(...args) {
    return originalNativeSessionFamily().prepareOriginalNativeSessionKeeperSourceCheckpointV1(
      ...args,
    );
  }
  function confirmOriginalNativeSessionKeeperSourceCheckpointV1(...args) {
    return originalNativeSessionFamily().confirmOriginalNativeSessionKeeperSourceCheckpointV1(
      ...args,
    );
  }
  async function createOriginalNativeSourceGraphAccountSessionV1(...args) {
    const family = await prepareOriginalNativeSessions();
    return family.createOriginalNativeSourceGraphAccountSessionV1(...args);
  }
  async function reopenOriginalNativeSessionSourceV1(...args) {
    const family = await prepareOriginalNativeSessions();
    return family.reopenOriginalNativeSessionSourceV1(...args);
  }
  function nativeManualGraphReviews(...args) {
    return originalNativeSessionFamily().nativeManualGraphReviews(...args);
  }
  function nativeManualGraphHandoffBindings(...args) {
    return originalNativeSessionFamily().nativeManualGraphHandoffBindings(
      ...args,
    );
  }
  function nativeManualGraphActionTarget(...args) {
    return originalNativeSessionFamily().nativeManualGraphActionTarget(...args);
  }
  function readOriginalNativeSessionWalletEconomicSnapshotV1(...args) {
    return originalNativeSessionFamily().readOriginalNativeSessionWalletEconomicSnapshotV1(
      ...args,
    );
  }
  function createOriginalNativeSessionWalletEconomicStateV1(...args) {
    return originalNativeSessionFamily().createOriginalNativeSessionWalletEconomicStateV1(
      ...args,
    );
  }
  function reopenOriginalNativeSessionWalletEconomicStateAfterCrashV1(...args) {
    return originalNativeSessionFamily().reopenOriginalNativeSessionWalletEconomicStateAfterCrashV1(
      ...args,
    );
  }
  function readOriginalNativeSessionWalletEconomicStateV1(...args) {
    return originalNativeSessionFamily().readOriginalNativeSessionWalletEconomicStateV1(
      ...args,
    );
  }
  function isOriginalNativeManualSessionV1(session) {
    return (
      originalNativeSessions?.isOriginalNativeManualSessionV1(session) ?? false
    );
  }

  return Object.freeze({
    consumeOriginalNativeSourceAccountCheckpointV1,
    consumeOriginalNativeSourceActorCheckpointV1,
    createOriginalNativeSourceCapsuleV1,
    assertOriginalNativeSourceCapsuleV1,
    originalNativeSourceCapsuleStatusV1,
    readOriginalNativeSourceOwnedProcessesV1,
    openOriginalNativeSourceCapsuleV1,
    nativeSourceRecoverySectionIdentityV1,
    nativeSourceRecoveryOriginalReferenceV1,
    nativeSourceRecoveryOwnedProcessV1,
    retainOriginalNativeSourceSectionV1,
    updateOriginalNativeSourceSectionV1,
    consumeOriginalNativeSourceSectionV1,
    resumeOriginalNativeSourceSectionV1,
    retainOriginalNativeSourceReferenceV1,
    createOriginalNativeSourceAccountV1,
    createOriginalNativeSourceSessionV1,
    reopenOriginalNativeSourceReferenceV1,
    createOriginalNativeSourceClockPairV1,
    consumeOriginalNativeSourceRuntimeRequestV1,
    originalNativeSourceRuntimeRequestIdentityV1,
    readOriginalNativeSourceRuntimeSeedV1,
    retainOriginalNativeSourceRuntimeSeedV1,
    resumeOriginalNativeSourceRuntimeSeedV1,
    originalNativeSourceRuntimeOwnedProcessV1,
    readOriginalNativeSourceRuntimeStateV1,
    attachOriginalNativeSourceRuntimeV1,
    beginOriginalNativeSourceMutationV1,
    confirmOriginalNativeSourceMutationV1,
    confirmOriginalNativeSourceBirthV1,
    readOriginalNativeSourceClockCheckpointV1,
    retainOriginalNativeSourceClockCheckpointV1,
    finishOriginalNativeSourceBirthV1,
    finishOriginalNativeSourceReopenV1,
    closeOriginalNativeSourceCapsuleV1,
    createOwnedPagedObservedHubEvmV4,
    assertOwnedPagedObservedHubEvmV4,
    createOwnedLocalEvmObservedClockV1,
    refreshNativeValueReceiverClock,
    nativeValueReceiverInclusionSecondV1,
    assertOwnedLocalEvmObservedClockV1,
    consumeNativeEconomicObservedCustodyRequestV2,
    createOwnedNativeEconomicObservedReceiverV2,
    createOwnedNativeEconomicObservedGraphRuntimeV2,
    createOwnedNativeEconomicObservedClockPairV2,
    assertOwnedNativeEconomicObservedReceiverV2,
    assertOwnedNativeEconomicObservedGraphRuntimeV2,
    createOwnedNativeLiveArmedObservedClockPairV1,
    assertOwnedNativeLiveArmedReceiverV1,
    assertOwnedNativeLiveArmedGraphRuntimeV1,
    bindOwnedNativeLiveArmedObservedClockPairV1,
    readOwnedNativeLiveArmedObservedClockPairV1,
    fenceOwnedNativeLiveArmedRuntimeV1,
    captureOwnedNativeLiveArmedRuntimeV1,
    abortOwnedNativeLiveArmedRuntimeV1,
    reopenOwnedNativeLiveArmedReceiverV1,
    reopenOwnedNativeLiveArmedGraphRuntimeV1,
    refreshOwnedNativeEconomicObservedGraphClockV2,
    probeOwnedOsakaTransactionGasRejectionV1,
    createOwnedOriginalNativeFReorgReceiverV1,
    isOwnedOriginalNativeFReorgReceiverV1,
    retainOwnedOriginalFReorgProbeV1,
    rewindOwnedOriginalFReorgProbeV1,
    reemitOwnedOriginalNativeRecoveryV1,
    armOwnedEvmRecoveryRetentionV1,
    captureOwnedEvmRecoveryV1,
    captureOwnedPagedEvmRecoveryV3,
    reopenOwnedPagedHubEvmV3,
    reopenOwnedPagedNativeEvmV3,
    createOwnedPagedHubDurableEvmV3,
    createOwnedPagedNativeDurableEvmV3,
    reopenOwnedReceiverRecoveryV1,
    reopenOwnedNativeD26ObservationReceiverV1,
    reopenOwnedNativeEconomicReceiverV1,
    reopenOwnedExternalDefiReceiverV2,
    reopenOwnedDeviceExternalFlatReceiverV1,
    reopenOwnedNativeEconomicGraphRuntimeV1,
    reopenOwnedReceiverPreopenRepairV1,
    reopenOwnedGraphNativeRecoveryV1,
    isOwnedLocalEvmNativeValueRuntime,
    assertOwnedLocalEvmNativeValueRuntime,
    assertOwnedLocalEvmNativeValueRuntimeLive,
    readOwnedLocalEvmNativeValueAuditStateV4,
    readOwnedEvmWrappedGraphOperationV4,
    ownedLocalEvmNativeValueRuntimeIdentity,
    openOwnedLocalEvmNativeValueSource,
    isOwnedLocalEvmNativeValueV1,
    assertOwnedLocalEvmNativeValueV1,
    isOwnedLocalEvmV2,
    ownedLocalEvmTransactionGasLimit,
    assertOwnedLocalEvmV2,
    createOwnedLocalEvmV2,
    createOwnedLocalEvmOsakaV1,
    createOwnedLocalEvmNativeValueV1,
    createOwnedLocalPagedNativeEvmV3,
    assertOwnedLocalPagedNativeEvmV3,
    createOwnedLocalEvmNativeValueBaseV1,
    createOwnedLocalEvmNativeValueArbitrumV1,
    createOwnedLocalEvmNativeValueBnbV1,
    createOwnedLocalEvmV2PoolGenerationAcceptance,
    ownedPoolGenerationTransportControls,
    recoveryAnvilPinV1,
    createOwnedRecoverableReceiverV1,
    createOwnedRecoverableGraphNativeV1,
    createOwnedNativeEconomicReceiverV2,
    createOwnedNativeEconomicGraphRuntimeV2,
    createOwnedExternalDefiReceiverV2,
    assertOwnedExternalDefiReceiverV2,
    captureOwnedExternalDefiReceiverV2,
    abortOwnedExternalDefiReceiverCaptureV2,
    createOwnedDeviceExternalFlatReceiverV1,
    createOwnedDeviceExternalFlatSourceReceiverV2,
    assertOwnedDeviceExternalFlatSourceReceiverV2,
    checkpointOwnedDeviceExternalFlatSourceReceiverV2,
    reopenOwnedDeviceExternalFlatSourceReceiverV2,
    assertOwnedDeviceExternalFlatReceiverV1,
    assertOwnedDeviceExternalFlatReceiverLiveV1,
    captureOwnedDeviceExternalFlatReceiverV1,
    abortOwnedDeviceExternalFlatReceiverCaptureV1,
    isOwnedNativeEconomicRuntimeV2,
    assertOwnedNativeEconomicRuntimeRecoverableV1,
    fenceOwnedNativeEconomicRuntimeV1,
    captureOwnedNativeEconomicRuntimeV1,
    abortOwnedNativeEconomicRuntimeV1,
    createNativeEconomicLocalCustodyV2,
    createNativeEconomicObservedLocalCustodyV2,
    assertNativeEconomicGenesisV2,
    reopenNativeEconomicLocalCustodyV2,
    reopenNativeEconomicObservedLocalCustodyV2,
    nativeEconomicLocalCustodyPublicV2,
    checkNativeEconomicLocalCustodyV2,
    signNativeEconomicCustodyTransactionV2,
    captureNativeEconomicLocalCustodyV2,
    prepareNativeEconomicCustodySigningV2,
    consumeNativeEconomicCustodySigningV2,
    revokeNativeEconomicCustodySigningV2,
    closeNativeEconomicLocalCustodyV2,
    consumeOwnedEvmNativeSourceRequest,
    describeOwnedLocalEvmNativeValueSource,
    createOwnedLocalEvmNativeValueHealthSource,
    openOriginalOwnedRollupNativeValueSourcesV1,
    createOwnedNativeDurableSourceRuntimeV1,
    assertOwnedNativeDurableSourceRuntimeV1,
    assertOwnedNativeDurableSourceReceiverV1,
    assertOwnedNativeDurableSourceGraphRuntimeV1,
    bindOwnedNativeDurableSourceClockPairV1,
    readOwnedNativeDurableSourceClockPairV1,
    readOriginalNativeDurableSourceStateV1,
    assertOriginalNativeSourceObservedClockV1,
    readOriginalNativeSourceClockReferencesV1,
    snapshotOriginalNativeSourceObservedClockV1,
    refreshOriginalNativeSourceObservedClockV1,
    createOriginalNativeSourceObservedClocksV1,
    reopenOriginalNativeSourceObservedClocksV1,
    createPairedOriginalAccountActorV2,
    assertPairedOriginalAccountActorV2,
    pairedOriginalAccountActorDescriptorV2,
    assertPairedOriginalAccountActorAccountV2,
    pairedOriginalAccountPublicFrameV2,
    fenceOriginalNativeActorEconomicRecoveryV1,
    captureOriginalNativeActorEconomicRecoveryV1,
    stopCapturedNativeActorEconomicRecoveryV1,
    abortNativeActorEconomicRecoveryV1,
    reopenOriginalNativeActorEconomicRecoveryV1,
    assertNativeActorEconomicMembershipV1,
    nativePairedActorEconomicSourceV1,
    assertNativeActorSessionAccountMembershipV1,
    reconcileOriginalNativeActorSourceCheckpointV1,
    retainOriginalNativeActorSourceV1,
    reopenOriginalNativeActorSourceV1,
    flatManualNativeNoteReviews,
    flatManualNativeNoteActionTarget,
    createNativeValueManualGraphAccountSession,
    assertNativeWalletEconomicSessionV1,
    fenceOriginalNativeSessionEconomicRecoveryV1,
    captureOriginalNativeSessionEconomicRecoveryV1,
    stopCapturedNativeSessionEconomicRecoveryV1,
    abortNativeSessionEconomicRecoveryV1,
    reopenOriginalNativeSessionEconomicRecoveryV1,
    assertNativeSessionEconomicMembershipV1,
    assertOriginalNativeSessionSourceKeeperV1,
    prepareOriginalNativeSessionKeeperSourceCheckpointV1,
    confirmOriginalNativeSessionKeeperSourceCheckpointV1,
    createOriginalNativeSourceGraphAccountSessionV1,
    reopenOriginalNativeSessionSourceV1,
    nativeManualGraphReviews,
    nativeManualGraphHandoffBindings,
    nativeManualGraphActionTarget,
    readOriginalNativeSessionWalletEconomicSnapshotV1,
    createOriginalNativeSessionWalletEconomicStateV1,
    reopenOriginalNativeSessionWalletEconomicStateAfterCrashV1,
    readOriginalNativeSessionWalletEconomicStateV1,
    isOriginalNativeManualSessionV1,
  });
}
