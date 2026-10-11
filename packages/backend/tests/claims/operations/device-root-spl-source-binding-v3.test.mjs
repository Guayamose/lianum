import test from "node:test";
import assert from "node:assert/strict";
import { buildDeviceRootSplSourceBindingV3 } from "../../../src/claims/controller/device-root-spl-source-binding-v3.mjs";
import { createOriginalDeviceRootSplSourceBindingV3 } from "../../../src/claims/controller/controller.mjs";
import { readOwnedSolanaSplOriginalGraphV3 } from "../../../src/chains/solana/runtime/owned-solana-runtime.mjs";
test("HOST RootNote prospective SPL SOURCE binds only original provider before FUND and preserves UNKNOWN without replay", async () => {
  const { readFile, mkdtemp, mkdir, rm } = await import("node:fs/promises"),
    { join } = await import("node:path"),
    { tmpdir } = await import("node:os");
  const { createClaimVaultSession } = await import(
    "../../../src/claims/storage/vault-session.mjs"
  );
  const providers = new WeakMap(),
    pairs = new WeakMap();
  let captures = 0,
    wraps = 0,
    quotes = 0;
  const ports = {
    readOwnedSolanaSplOriginalGraphV3: (n) => {
      assert.ok(pairs.has(n), "HOST_ORIGINAL_NATIVE_REQUIRED");
      return pairs.get(n);
    },
    assertOwnedSolanaSplGraphPairV1: (n, g) =>
      assert.equal(pairs.get(n), g, "HOST_FOREIGN_GRAPH"),
    assertOwnedFlatNativeProvider: (p, expected) => {
      const actual = providers.get(p);
      assert.ok(actual, "HOST_ORIGINAL_PROVIDER_REQUIRED");
      for (const [k, v] of Object.entries(expected))
        assert.equal(actual[k], v, "HOST_FOREIGN_PROVIDER");
    },
    captureOwnedFlatSolanaSourceForSplV1: async (p) => {
      captures++;
      const x = providers.get(p);
      assert.ok(x?.observed, "HOST_OBSERVED_SOURCE_REQUIRED");
      assert.equal(
        (await x.journal.read()).apiDeviceRootClaims[0].splSource.phase,
        "BINDING",
      );
      return x.token;
    },
  };
  const create = buildDeviceRootSplSourceBindingV3(ports);
  assert.throws(() =>
    buildDeviceRootSplSourceBindingV3({ ...ports, callerProvider: () => ({}) }),
  );
  assert.throws(() => buildDeviceRootSplSourceBindingV3(ports, {}));
  assert.throws(() =>
    buildDeviceRootSplSourceBindingV3({
      ...ports,
      captureOwnedFlatSolanaSourceForSplV1: null,
    }),
  );
  const directory = await mkdtemp(join(tmpdir(), "root-note-spl-source-host-"));
  await mkdir(join(directory, "journals"), { mode: 0o700 });
  const vaults = [],
    producers = [];
  let ordinal = 0;
  async function fixture({
    observed = false,
    wrapFailure = false,
    late = false,
  } = {}) {
    const descriptor = Object.freeze({
        claim: Object.freeze({ claimDomain: "HOST_DISTINCT_SPL_DOMAIN" }),
        profile: "HOST_INERT_DEVICE_ROOT_DESCRIPTOR",
      }),
      runtime = Object.freeze({}),
      graph = Object.freeze({}),
      flatSystem = Object.freeze({}),
      claims = Object.freeze({ flatSystem }),
      ownerIdentitySHA256 = "HOST_ORIGINAL_OWNER";
    let live = true,
      stopped = false,
      busy = false,
      binding = null,
      readers = 0;
    const native = {
      transfers: [],
      async bindOriginalSourceV1(token) {
        wraps++;
        assert.equal(token, providerState.token);
        assert.equal(
          (await journal.read()).apiDeviceRootClaims[0].splSource.phase,
          "BINDING",
        );
        if (wrapFailure) throw Error("HOST_LOST_WRAP_REPLY");
      },
      async quoteOriginalDepositAmountV1() {
        quotes++;
        assert.equal(wrapFailure, false);
        return "123";
      },
    };
    pairs.set(native, graph);
    const vault = createClaimVaultSession({
      path: join(directory, "journals", "journal-" + ordinal++),
      password: "HOST original encrypted SOURCE binding journal",
    });
    vaults.push(vault);
    let record = await vault.create({
      deposits: [],
      tickets: [],
      evm: [],
      apiDeviceRootClaims: [
        { descriptor, ownerIdentitySHA256, phase: "BORN", admissions: [] },
      ],
    });
    const journal = {
      async read() {
        const actual = await vault.read();
        assert.deepEqual(actual, record);
        return structuredClone(actual.data);
      },
      async update(transform) {
        const next = await vault.update(record.revision, transform);
        const actual = await vault.read();
        assert.deepEqual(actual, next);
        record = next;
        return structuredClone(next.data);
      },
    };
    const serial = async (work) => {
        assert.ok(live);
        assert.equal(busy, false);
        busy = true;
        try {
          return await work();
        } finally {
          busy = false;
        }
      },
      original = {
        runtime,
        claims,
        serial,
        alive: () => assert.ok(live),
        journal,
        descriptor,
        ownerIdentitySHA256,
        originalNative: () => native,
        install: (v) => {
          assert.equal(binding, null);
          assert.equal(late, false, "HOST_BEFORE_FUND_REQUIRED");
          binding = v;
        },
        beforeTarget: () =>
          assert.equal(stopped, false, "HOST_BEFORE_D27_REQUIRED"),
        empty: async () => {
          readers++;
          assert.equal(late, false, "HOST_EMPTY_TARGET_REQUIRED");
        },
      };
    const intake = Object.freeze({}),
      provider = Object.freeze({}),
      providerState = {
        runtime,
        system: flatSystem,
        poolIndex: 0,
        nativeRuntime: graph,
        family: "2",
        recipientIndex: 1,
        observed,
        token: Object.freeze({}),
        journal,
      };
    providers.set(provider, providerState);
    return {
      original,
      intake,
      provider,
      providerState,
      journal,
      get record() {
        return record;
      },
      get binding() {
        return binding;
      },
      native,
      graph,
      set stopped(v) {
        stopped = v;
      },
      invalidate() {
        live = false;
      },
      async birth() {
        const p = await create(original, provider);
        producers.push(p);
        return p;
      },
    };
  }
  try {
    const f = await fixture({ observed: true });
    await assert.rejects(
      createOriginalDeviceRootSplSourceBindingV3(f.intake, f.provider),
      /ORIGINAL_INTAKE/,
    );
    await assert.rejects(
      createOriginalDeviceRootSplSourceBindingV3({ ...f.intake }, f.provider),
      /ORIGINAL_INTAKE/,
    );
    await assert.rejects(create(f.original, {}), /ORIGINAL_PROVIDER/);
    const foreign = await fixture({ observed: true });
    await assert.rejects(
      create(f.original, foreign.provider),
      /FOREIGN_PROVIDER/,
    );
    assert.equal(captures, 0);
    assert.equal(wraps, 0);
    const p = await f.birth(),
      initial = await p.status();
    assert.equal(initial.phase, "BORN");
    assert.equal(initial.amount, null);
    assert.equal(initial.privateCreditEstablished, false);
    assert.equal(initial.availablePrivateClaims, null);
    assert.equal(captures, 0);
    assert.equal(wraps, 0);
    await assert.rejects(create(f.original, f.provider), /SOURCE_ONCE/);
    await assert.rejects(create(f.original, f.provider, {}), /ARITY/);
    assert.throws(() => p.bindObservedOriginalOnce({}), /ARITY/);
    assert.equal(captures, 0);
    const ready = await p.bindObservedOriginalOnce();
    assert.equal(ready.amount, "123");
    assert.equal(ready.privateCreditEstablished, false);
    assert.equal(f.binding.phase, "READY");
    assert.equal(
      (await f.journal.read()).apiDeviceRootClaims[0].splSource.amount,
      "123",
    );
    assert.equal(captures, 1);
    assert.equal(wraps, 1);
    assert.equal(quotes, 1);
    assert.throws(() => p.bindObservedOriginalOnce(), /ALREADY_ADMITTED/);
    assert.equal(captures, 1);
    assert.equal(wraps, 1);
    assert.equal((await p.status()).availablePrivateClaims, null);
    const u = await fixture();
    const unknown = await u.birth();
    await assert.rejects(
      unknown.bindObservedOriginalOnce(),
      /OBSERVED_SOURCE_REQUIRED/,
    );
    assert.equal((await unknown.status()).phase, "UNKNOWN");
    assert.equal(
      (await u.journal.read()).apiDeviceRootClaims[0].splSource.amount,
      null,
    );
    assert.throws(() => unknown.bindObservedOriginalOnce(), /ALREADY_ADMITTED/);
    assert.equal(wraps, 1);
    const lost = await fixture({ observed: true, wrapFailure: true });
    const lp = await lost.birth();
    await assert.rejects(lp.bindObservedOriginalOnce(), /LOST_WRAP_REPLY/);
    assert.equal((await lp.status()).phase, "UNKNOWN");
    assert.equal(
      (await lost.journal.read()).apiDeviceRootClaims[0].splSource.amount,
      null,
    );
    assert.throws(() => lp.bindObservedOriginalOnce(), /ALREADY_ADMITTED/);
    assert.equal(wraps, 2);
    assert.equal(quotes, 1);
    const late = await fixture({ late: true });
    await assert.rejects(late.birth(), /EMPTY_TARGET/);
    assert.equal(late.binding, null);
    await p.close();
    assert.throws(() => p.status(), /SOURCE_CLOSED/);
    assert.equal(f.record.revision, 3);
    const ciphertext = await readFile(
      join(directory, "journals", "journal-0"),
      "utf8",
    );
    assert.equal(ciphertext.includes("HOST_DISTINCT_SPL_DOMAIN"), false);
    assert.equal(
      ciphertext.includes("ORIGINAL_DEVICE_ROOT_SPL_SOURCE_BINDING"),
      false,
    );
    // Canonical ownership remains inaccessible to these inert lower runtime ports.
    assert.throws(() => readOwnedSolanaSplOriginalGraphV3(f.native));
    assert.throws(() => readOwnedSolanaSplOriginalGraphV3({ ...f.native }));
    assert.throws(
      () => readOwnedSolanaSplOriginalGraphV3(f.native, f.graph),
      /ARITY/,
    );
  } finally {
    for (const p of producers) await p.close().catch(() => {});
    for (const v of vaults) v.close();
    await rm(directory, { recursive: true, force: true });
  }
});
