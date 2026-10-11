/** Complete graph checkpoint and birth owners with real AEAD/CAS. Lower runtime,
 * reader and service references are inert; no proof, provider or send is born. */
import test from "node:test";
import assert from "node:assert/strict";
import { types } from "node:util";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { Vault } from "@lianum/engine/crypto/vault";
import { canonicalClaimRecordDataV1 } from "@lianum/engine/storage/records";
import { buildDeviceGraphRecoveryPartsV1 } from "../../../src/operations/local/device-graph-recovery-parts-v1.mjs";
import { buildRetainedDeviceVaultGraphBirthV1 } from "../../../src/operations/local/retained-device-vault-graph-birth-v1.mjs";
import { consumeOriginalDeviceExternalFlatGraphRecoveryPartV1 as canonicalConsume } from "../../../src/operations/local/device-external-flat-source-graph-service-v1.mjs";
import { saveDeviceGraphJournalV1 } from "../../../src/accounts/authority/device-graph-proof-retention-v1.mjs";
test("HOST original Graph backend stores exact encrypted checkpoints and denies pending, substituted or copied recovery parts", async (t) => {
  const directory = await mkdtemp(
    join(tmpdir(), "device-external-graph-checkpoint-"),
  );
  t.after(() => rm(directory, { recursive: true, force: true }));
  const sha = (v) =>
      createHash("sha256").update(canonicalClaimRecordDataV1(v)).digest("hex"),
    password = "07".repeat(32),
    vault = new Vault(join(directory, "part.vault"));
  const confirmed = {
    schema: "EXPLICIT_INERT_ORIGINAL_GRAPH_SEED",
    jobId: "01".repeat(32),
    claim: { jobId: "01".repeat(32) },
    submission: { dispatchLatched: true, transactionHash: null },
    withdrawals: [],
  };
  let record = await vault.create(
      {
        schema: "DEVICE_EXTERNAL_FLAT_GRAPH_DURABLE_V1",
        confirmed,
        candidate: null,
      },
      password,
    ),
    reads = 0;
  const runtime = Object.freeze({}),
    handle = Object.freeze({}),
    identity = { lifetime: "02".repeat(32) },
    descriptor = {
      slot: "wallet-graph-keeper-0",
      identity,
      stateSHA256: sha(record.data),
    };
  const ports = {
    sha,
    readWrappedPrivateLifetimePartV1: async (r, name, id) => {
      assert.equal(r, runtime);
      assert.equal(name, descriptor.slot);
      assert.deepEqual(id, identity);
      reads++;
      return { privateState: (await vault.read(password)).data, handle };
    },
    assertWrappedPrivateLifetimePartSealedV1: (h) => assert.equal(h, handle),
  };
  const api = buildDeviceGraphRecoveryPartsV1(ports),
    foreign = buildDeviceGraphRecoveryPartsV1(ports);
  assert.throws(() => buildDeviceGraphRecoveryPartsV1(ports, {}));
  assert.throws(() =>
    buildDeviceGraphRecoveryPartsV1({ ...ports, callerIssuer: () => ({}) }),
  );
  const cap = api.part("bridge", { confirmed });
  assert.throws(() =>
    foreign.consumeOriginalDeviceExternalFlatGraphRecoveryPartV1(cap, "bridge"),
  );
  assert.throws(() => canonicalConsume(cap, "bridge"));
  assert.throws(() =>
    api.consumeOriginalDeviceExternalFlatGraphRecoveryPartV1(
      { ...cap },
      "bridge",
    ),
  );
  const consume = api.consumeOriginalDeviceExternalFlatGraphRecoveryPartV1;
  assert.deepEqual(
    await api.checkedPart(
      runtime,
      descriptor,
      "DEVICE_EXTERNAL_FLAT_GRAPH_DURABLE_V1",
    ),
    confirmed,
  );
  assert.equal(reads, 1);
  const token = api.part("bridge", { confirmed });
  assert.deepEqual(consume(token, "bridge"), { confirmed });
  assert.throws(() => consume(token, "bridge"));
  assert.throws(() => consume(Object.freeze({}), "bridge"));
  const other = api.part("execution", { confirmed });
  assert.throws(() => consume(other, "bridge"));
  assert.deepEqual(consume(other, "execution"), { confirmed });
  let failOriginalCAS = false;
  const events = [];
  class FaultVault extends Vault {
    async update(...args) {
      events.push("original-cas");
      assert.notEqual((await vault.read(password)).data.candidate, null);
      if (failOriginalCAS)
        throw Object.assign(Error("EXPLICIT_INERT_CAS_FAILURE"), {
          code: "EIO",
        });
      return super.update(...args);
    }
  }
  const operationVault = new FaultVault(join(directory, "operations.vault"));
  let operation = await operationVault.create(
    { jobId: confirmed.jobId, dispatchLatched: false },
    password,
  );
  let poisoned = false;
  const writer = {
    async save(change) {
      try {
        await saveDeviceGraphJournalV1(change, {
          current: () => operation,
          copy: structuredClone,
          healthy: async () =>
            assert.deepEqual(await operationVault.read(password), operation),
          persist: async (candidate = null) => {
            events.push(candidate ? "candidate" : "confirmed");
            record = await vault.update(password, record.revision, (d) => ({
              ...d,
              confirmed: structuredClone(operation.data),
              candidate,
            }));
            assert.deepEqual(await vault.read(password), record);
          },
          update: (revision, data) =>
            operationVault.update(password, revision, () => data),
          read: () => operationVault.read(password),
          physical: async () => {},
          accept: (next) => {
            operation = next;
          },
        });
      } catch (error) {
        poisoned = true;
        throw error;
      }
    },
    current: () => operation,
    poisoned: () => poisoned,
  };
  await writer.save((d) => ({ ...d, dispatchLatched: true }));
  operation = writer.current();
  assert.deepEqual(events, ["candidate", "original-cas", "confirmed"]);
  assert.equal(record.data.candidate, null);
  assert.equal(record.data.confirmed.dispatchLatched, true);
  failOriginalCAS = true;
  await assert.rejects(
    writer.save((d) => ({ ...d, secondAdmission: true })),
    { code: "EIO" },
  );
  assert.equal(writer.poisoned(), true);
  assert.equal(
    (await operationVault.read(password)).data.secondAdmission,
    undefined,
  );
  const pending = { ...descriptor, stateSHA256: sha(record.data) };
  await assert.rejects(
    api.checkedPart(runtime, pending, "DEVICE_EXTERNAL_FLAT_GRAPH_DURABLE_V1"),
    /DEVICE_EXTERNAL_GRAPH_PENDING_REOPEN_DENIED/,
  );
  await assert.rejects(
    api.checkedPart(
      runtime,
      descriptor,
      "DEVICE_EXTERNAL_FLAT_GRAPH_DURABLE_V1",
    ),
    /DEVICE_EXTERNAL_GRAPH_ORIGINAL_PRIVATE_CHECKPOINT/,
  );
  assert.equal(
    (await vault.read(password)).data.confirmed.dispatchLatched,
    true,
  );
  assert.equal(
    (await vault.read(password)).data.candidate.data.secondAdmission,
    true,
  );
});

test("HOST original Aave mobile constructor rejects a funded, foreign or moving original source before service birth", async () => {
  const runtime = Object.freeze({}),
    system = Object.freeze({}),
    observer = Object.freeze({}),
    authority = Object.freeze({}),
    protocols = Object.freeze({}),
    registry = Object.freeze({}),
    account = Object.freeze({}),
    targetAccount = Object.freeze({});
  let funded = -1,
    nullifier = -1,
    moved = false,
    births = 0,
    reads = 0,
    checks = 0;
  const exact = (q, keys) => {
      assert.ok(q && !types.isProxy(q));
      assert.deepEqual(Reflect.ownKeys(q).sort(), [...keys].sort());
      return q;
    },
    need = (value, code) => assert.ok(value, code);
  const ports = {
    assert,
    exact,
    need,
    assertOwnedFlatSystem: (r, s) => {
      assert.equal(r, runtime);
      assert.equal(s, system);
    },
    assertOwnedEvmGraphDeliveryObserverV1: (o, q) => {
      assert.equal(o, observer);
      assert.equal(q.runtime, runtime);
      assert.equal(q.system, system);
      assert.equal(q.poolIndex, 1);
    },
    isOwnedAaveStaticGraphDeliveryObserverV1: (o) => o === observer,
    createFlatSystemStateReader: async (q) => {
      assert.equal(q.runtime, runtime);
      return {
        async read() {
          reads++;
          return {
            head: { number: moved && q.poolIndex === 1 ? "2" : "1" },
            ledger: {
              commitments:
                funded === q.poolIndex ? ["ORIGINAL_ALREADY_FUNDED"] : [],
              nullifiers:
                nullifier === q.poolIndex ? ["ORIGINAL_ALREADY_SPENT"] : [],
            },
          };
        },
        async assertCurrent() {
          checks++;
        },
      };
    },
    createService: async (q, r, blue, multi, aave) => {
      births++;
      assert.equal(q.account, account);
      assert.equal(q.targetAccount, targetAccount);
      assert.equal(r.authority, authority);
      assert.equal(r.protocols, protocols);
      assert.equal(r.registry, registry);
      assert.equal(blue, false);
      assert.equal(multi, null);
      assert.equal(aave, true);
      return Object.freeze({ profile: "EXPLICIT_INERT_ORIGINAL_AAVE_SERVICE" });
    },
  };
  const owner = buildRetainedDeviceVaultGraphBirthV1({
      assertOwnedFlatSystem: ports.assertOwnedFlatSystem,
      assertOwnedEvmGraphDeliveryObserverV1:
        ports.assertOwnedEvmGraphDeliveryObserverV1,
      isOwnedAaveStaticGraphDeliveryObserverV1:
        ports.isOwnedAaveStaticGraphDeliveryObserverV1,
      isOwnedUniswapGraphDeliveryObserverV1: () => false,
      createFlatSystemStateReader: ports.createFlatSystemStateReader,
      createService: ports.createService,
    }),
    create = owner.createOriginalRetainedDeviceAaveStaticGraphServiceV1,
    input = {
      account,
      targetAccount,
      runtime,
      system,
      quorum: Object.freeze({}),
      router: Object.freeze({}),
      deliveryObserver: observer,
      rule: {},
      rulePath: {},
      maximumSolverInput: "500",
      tls: {},
      host: "EXPLICIT_INERT_HOST",
      recoveryAuthority: authority,
      registry,
      protocols,
    };
  await create(input);
  assert.equal(births, 1);
  assert.equal(reads, 2);
  assert.equal(checks, 4);
  for (const pool of [0, 1]) {
    funded = pool;
    await assert.rejects(create(input), /DEVICE_AAVE_GRAPH_BEFORE_FUNDING/);
    funded = -1;
    nullifier = pool;
    await assert.rejects(create(input), /DEVICE_AAVE_GRAPH_BEFORE_FUNDING/);
    nullifier = -1;
  }
  moved = true;
  await assert.rejects(
    create(input),
    /DEVICE_AAVE_GRAPH_SAME_BEFORE_FUND_HEAD/,
  );
  moved = false;
  await assert.rejects(create({ ...input, deliveryObserver: {} }));
  await assert.rejects(create({ ...input, runtime: {} }));
  await assert.rejects(create({ ...input, callerSelectedProvider: {} }));
  assert.equal(births, 1);
});

test("HOST original Uniswap mobile constructor rejects a funded, foreign or moving original source before service birth", async () => {
  const runtime = Object.freeze({}),
    system = Object.freeze({}),
    observer = Object.freeze({}),
    authority = Object.freeze({}),
    protocols = Object.freeze({}),
    registry = Object.freeze({}),
    account = Object.freeze({}),
    targetAccount = Object.freeze({});
  let funded = -1,
    nullifier = -1,
    moved = false,
    births = 0,
    reads = 0,
    checks = 0;
  const exact = (q, keys) => {
      assert.ok(q && !types.isProxy(q));
      assert.deepEqual(Reflect.ownKeys(q).sort(), [...keys].sort());
      return q;
    },
    need = (value, code) => assert.ok(value, code);
  const ports = {
    assert,
    exact,
    need,
    assertOwnedFlatSystem: (r, s) => {
      assert.equal(r, runtime);
      assert.equal(s, system);
    },
    assertOwnedEvmGraphDeliveryObserverV1: (o, q) => {
      assert.equal(o, observer);
      assert.equal(q.runtime, runtime);
      assert.equal(q.system, system);
      assert.equal(q.poolIndex, 1);
    },
    isOwnedUniswapGraphDeliveryObserverV1: (o) => o === observer,
    createFlatSystemStateReader: async (q) => {
      assert.equal(q.runtime, runtime);
      return {
        async read() {
          reads++;
          return {
            head: { number: moved && q.poolIndex === 1 ? "2" : "1" },
            ledger: {
              commitments:
                funded === q.poolIndex ? ["ORIGINAL_ALREADY_FUNDED"] : [],
              nullifiers:
                nullifier === q.poolIndex ? ["ORIGINAL_ALREADY_SPENT"] : [],
            },
          };
        },
        async assertCurrent() {
          checks++;
        },
      };
    },
    createService: async (q, r, blue, multi, aave, uniswap) => {
      births++;
      assert.equal(q.account, account);
      assert.equal(q.targetAccount, targetAccount);
      assert.equal(r.authority, authority);
      assert.equal(r.protocols, protocols);
      assert.equal(r.registry, registry);
      assert.equal(blue, false);
      assert.equal(multi, null);
      assert.equal(aave, false);
      assert.equal(uniswap, true);
      return Object.freeze({
        profile: "EXPLICIT_INERT_ORIGINAL_UNISWAP_SERVICE",
      });
    },
  };
  const owner = buildRetainedDeviceVaultGraphBirthV1({
      assertOwnedFlatSystem: ports.assertOwnedFlatSystem,
      assertOwnedEvmGraphDeliveryObserverV1:
        ports.assertOwnedEvmGraphDeliveryObserverV1,
      isOwnedAaveStaticGraphDeliveryObserverV1: () => false,
      isOwnedUniswapGraphDeliveryObserverV1:
        ports.isOwnedUniswapGraphDeliveryObserverV1,
      createFlatSystemStateReader: ports.createFlatSystemStateReader,
      createService: ports.createService,
    }),
    create = owner.createOriginalRetainedDeviceUniswapGraphServiceV1,
    input = {
      account,
      targetAccount,
      runtime,
      system,
      quorum: Object.freeze({}),
      router: Object.freeze({}),
      deliveryObserver: observer,
      rule: {},
      rulePath: {},
      maximumSolverInput: "500",
      tls: {},
      host: "EXPLICIT_INERT_HOST",
      recoveryAuthority: authority,
      registry,
      protocols,
    };
  await create(input);
  assert.equal(births, 1);
  assert.equal(reads, 2);
  assert.equal(checks, 4);
  for (const pool of [0, 1]) {
    funded = pool;
    await assert.rejects(create(input), /DEVICE_UNISWAP_GRAPH_BEFORE_FUNDING/);
    funded = -1;
    nullifier = pool;
    await assert.rejects(create(input), /DEVICE_UNISWAP_GRAPH_BEFORE_FUNDING/);
    nullifier = -1;
  }
  moved = true;
  await assert.rejects(
    create(input),
    /DEVICE_UNISWAP_GRAPH_SAME_BEFORE_FUND_HEAD/,
  );
  moved = false;
  await assert.rejects(create({ ...input, deliveryObserver: {} }));
  await assert.rejects(create({ ...input, runtime: {} }));
  await assert.rejects(create({ ...input, callerSelectedProvider: {} }));
  assert.equal(births, 1);
});

test("retained graph birth keeps its original field snapshot across awaited reader observations", async () => {
  for (const protocol of ["AaveStatic", "Uniswap"]) {
    const runtime = {},
      system = {},
      account = {},
      targetAccount = {},
      authority = {},
      registry = {},
      protocols = {},
      observer = {};
    const input = {
      runtime,
      system,
      account,
      targetAccount,
      quorum: {},
      router: {},
      deliveryObserver: observer,
      rule: {},
      rulePath: {},
      maximumSolverInput: "200",
      tls: {},
      host: "HOST",
      recoveryAuthority: authority,
      registry,
      protocols,
    };
    let births = 0;
    const owner = buildRetainedDeviceVaultGraphBirthV1({
      assertOwnedFlatSystem: (r, s) => {
        assert.equal(r, runtime);
        assert.equal(s, system);
      },
      assertOwnedEvmGraphDeliveryObserverV1: (value) =>
        assert.equal(value, observer),
      isOwnedAaveStaticGraphDeliveryObserverV1: (value) => value === observer,
      isOwnedUniswapGraphDeliveryObserverV1: (value) => value === observer,
      createFlatSystemStateReader: async (expected) => {
        assert.equal(expected.runtime, runtime);
        return {
          async read() {
            input.runtime = {};
            input.account = {};
            input.recoveryAuthority = {};
            return {
              head: { number: "1" },
              ledger: { commitments: [], nullifiers: [] },
            };
          },
          async assertCurrent() {},
        };
      },
      createService: async (ordinary, retained) => {
        births++;
        assert.equal(ordinary.runtime, runtime);
        assert.equal(ordinary.account, account);
        assert.equal(retained.authority, authority);
        return Object.freeze({});
      },
    });
    await owner["createOriginalRetainedDevice" + protocol + "GraphServiceV1"](
      input,
    );
    assert.equal(births, 1);
  }
});
