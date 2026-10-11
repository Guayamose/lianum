/** Real SOURCE lifecycle and encrypted claim Vault/AEAD/CAS. All financial
 * ports below are explicitly inert: no circuit, node, credit or wire is used. */
import test, { mock } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
const runtimeFixtures = new WeakMap(),
  providerFixtures = new WeakMap(),
  accountFixtures = new WeakMap(),
  birthDirectories = new Map();
mock.module(
  new URL("../../../src/providers/native-provider.mjs", import.meta.url),
  {
    exports: {
      assertOwnedFlatNativeProvider: (provider, expected) => {
        const f = providerFixtures.get(provider);
        assert.ok(f, "HOST_ORIGINAL_PROVIDER_REQUIRED");
        assert.equal(provider, f.provider);
        for (const [k, v] of Object.entries(expected))
          assert.equal(v, f.expected[k]);
      },
    },
  },
);
mock.module(
  new URL(
    "../../../src/custody/observers/flat-owner-native-claim-observer.mjs",
    import.meta.url,
  ),
  {
    exports: {
      createFlatOwnerNativeClaimObserver: async (input) => {
        const f = runtimeFixtures.get(input.runtime);
        assert.ok(f, "HOST_ORIGINAL_RUNTIME_REQUIRED");
        assert.equal(input.runtime, f.runtime);
        assert.equal(input.claims, f.claims);
        assert.equal(f.funds, 0);
        return Object.freeze({ profile: "HOST_INERT_OBSERVER" });
      },
    },
  },
);
mock.module(
  new URL(
    "../../../src/custody/processes/flat-owner-process.mjs",
    import.meta.url,
  ),
  {
    exports: {
      createFlatOwnerProcess: async (input) => {
        const f = runtimeFixtures.get(input.runtime);
        assert.ok(f, "HOST_ORIGINAL_RUNTIME_REQUIRED");
        assert.equal(input.runtime, f.runtime);
        assert.equal(input.system, f.system);
        assert.equal(input.poolIndex, 0);
        assert.equal(f.funds, 0);
        f.births.push("owner");
        return f.owner;
      },
    },
  },
);
mock.module(
  new URL(
    "../../../src/execution/native/recipients/native-recipient-process.mjs",
    import.meta.url,
  ),
  {
    exports: {
      createNativeRecipientProcess: async (boot) => {
        const f = birthDirectories.get(path.dirname(boot.path));
        assert.ok(f, "HOST_ORIGINAL_BIRTH_REQUIRED");
        assert.equal(f.funds, 0);
        assert.equal(boot.expectedTerms.value, "20000");
        assert.equal(boot.expectedTerms.actionTemplate.amount, "10000000");
        f.births.push("recipient");
        return f.recipient;
      },
    },
  },
);
mock.module(
  new URL(
    "../../../src/execution/account/execution/flat-native-execution.mjs",
    import.meta.url,
  ),
  {
    exports: {
      createFlatNativeExecution: async (input, callbacks) => {
        const f = runtimeFixtures.get(input.runtime);
        assert.ok(f, "HOST_ORIGINAL_RUNTIME_REQUIRED");
        assert.equal(f.funds, 0);
        assert.equal(input.quorum, f.quorum);
        f.births.push("execution");
        f.execCallbacks = callbacks;
        return f.execution;
      },
    },
  },
);
mock.module(
  new URL(
    "../../../src/accounts/authority/flat-account-authority.mjs",
    import.meta.url,
  ),
  {
    exports: {
      createFlatAccountAuthority: async (input, callbacks) => {
        const f = runtimeFixtures.get(input.runtime);
        assert.ok(f, "HOST_ORIGINAL_RUNTIME_REQUIRED");
        assert.equal(f.funds, 0);
        assert.equal(input.owner, f.owner);
        assert.equal(input.nativeExecution, f.execution);
        f.births.push("account");
        f.accountCallbacks = callbacks;
        return f.account;
      },
    },
  },
);
mock.module("@lianum/engine/accounts/keeper", {
  exports: {
    createGenericAccountKeeper: async (input) => {
      const f = accountFixtures.get(input.config);
      assert.ok(f, "HOST_ORIGINAL_ACCOUNT_REQUIRED");
      assert.equal(f.funds, 0);
      assert.equal(input.config, f.account.config);
      assert.equal(input.authority, f.account.authority);
      f.births.push("keeper");
      return f.accountKeeper;
    },
  },
});
mock.module("@lianum/engine/execution/inputs/deposit-intent", {
  exports: { decodeDepositIntentInputs: () => ({ amount: "100000" }) },
});
mock.module("@lianum/engine/claims/framing", {
  exports: {
    claimDomainCommitment: () => "HOST_DISTINCT_ORIGINAL_CBTC_DOMAIN",
  },
});
mock.module("@lianum/engine/native/native-receipt-binding", {
  exports: {
    validateSolanaBindingTransaction: (wire, intent) => {
      assert.equal(wire, "HOST_INERT_WIRE");
      assert.equal(intent.lamports, "10000000");
      return {
        signatureHex: "HOST_INERT_NATIVE_ID",
        transactionSHA256: "HOST_INERT_WIRE_SHA",
      };
    },
  },
});
const { createDeviceRootSplOriginalSourceExecutionV4: create } = await import(
  "../../../src/operations/recovery/device-root-spl-source-execution-v4.mjs"
);
const { createClaimVaultSession } = await import(
  "../../../src/claims/storage/vault-session.mjs"
);
test("original SOURCE fixes birth before FUND and lost GRAPH replies only observe", async () => {
  const { mkdtemp, rm } = fs;
  const root = await mkdtemp(
      path.join(os.tmpdir(), "root-note-spl-consumer-host-"),
    ),
    fixtures = [];
  async function fixture(lost = false) {
    const directory = path.join(root, String(fixtures.length));
    await fs.mkdir(directory, { mode: 0o700 });
    const domain = {
        scope: "HOST_SCOPE",
        policy: "HOST_POLICY",
        asset: "HOST_ASSET",
        hubDomain: "HOST_HUB",
        registryCommitment: "HOST_REGISTRY",
      },
      runtime = {
        accounts: ["00", "01", "02", "03"].map((v) => "0x" + v.repeat(20)),
        time: async () => 1000n,
      },
      system = { pools: [{ domain }] },
      graphBitcoin = { transfers: [] },
      graphSolana = { transfers: [] },
      quorum = Object.freeze({}),
      claims = { flatSystem: system, configs: [{}] },
      template = {
        amount: "10000000",
        executionFrom: "1000",
        executionUntil: "8140",
        settleBefore: "8200",
      };
    const f = {
      directory,
      runtime,
      system,
      claims,
      graphBitcoin,
      graphSolana,
      quorum,
      births: [],
      funds: 0,
      send: 0,
      confirms: 0,
      issues: 0,
      proofs: 0,
      graphs: 0,
      reconciles: 0,
      wrapped: 0,
      providerBound: 0,
      closed: [],
      available: true,
      childExited: false,
      phase: "BORN",
      lost,
    };
    fixtures.push(f);
    const result = () => {
      f.proofs++;
      return {
        proof: "00",
        publicInputs: ["0"],
        metrics: { scope: "HOST_INERT_NOT_GENUINE_PROOF" },
      };
    };
    const provider = {
      offer: () => ({
        evidencePolicy: "HOST_INERT_POLICY",
        actionTemplate: template,
      }),
      async bindQuote({ recipientCustody }) {
        assert.equal(recipientCustody, f.recipient);
        f.providerBound++;
      },
    };
    f.provider = provider;
    f.expected = {
      runtime,
      system,
      poolIndex: 0,
      nativeRuntime: graphSolana,
      operatorQuorum: quorum,
      family: "2",
      recipientIndex: 1,
    };
    f.owner = {
      owner: {
        async prepareDepositIntent(terms) {
          assert.equal(terms.amount, "100000");
          assert.equal(f.funds, 0);
        },
        async createNativeClaimIngressHandoff() {
          return Object.freeze({});
        },
        async reconcileDepositIntent() {},
        async prepareAuthorization(config) {
          assert.equal(config.nativeConfig.nodes.length, 1);
          assert.equal(
            config.nativeConfig.nodes[0].actionTemplate.amount,
            "10000000",
          );
          assert.equal(f.issues, 1);
        },
        async invoiceRequests() {
          return [{ slot: 0, invoice: "HOST_INERT_INVOICE" }];
        },
        async authorize() {
          assert.equal(f.providerBound, 1);
        },
      },
      ownerProof: {
        async proveDepositIntent() {
          return result();
        },
        async proveAuthorization() {
          return result();
        },
      },
      async suspend() {
        f.available = false;
        f.childExited = true;
      },
      async restart() {
        f.available = true;
        f.childExited = false;
      },
      report: () => ({ available: f.available, childExited: f.childExited }),
      roles: Object.fromEntries(
        ["reservation", "recovery", "assembler", "local", "dependency"].map(
          (role) => [
            role,
            async (slot) => ({
              select: () =>
                role === "local"
                  ? { local: { value: { active: slot === 0 } } }
                  : { profile: "HOST_INERT_ROLE" },
            }),
          ],
        ),
      ),
      close: async () => {
        f.closed.push("owner");
      },
    };
    f.recipient = {
      offer: async () => ({ profile: "HOST_INERT_OFFER" }),
      acceptInvoice: async () => ({ invoiceSignature: "HOST_INERT_SIGNATURE" }),
      acceptedQuote: async () => ({ deliveryRiskSalt: "HOST_INERT_RISK" }),
      close: async () => {
        f.closed.push("recipient");
      },
    };
    f.execution = {
      snapshot: () => ({ outcome: f.graphs ? "FULFILLED" : null }),
      close: async () => {
        f.closed.push("execution");
      },
    };
    f.account = {
      config: Object.freeze({}),
      authority: Object.freeze({}),
      assetId: "HOST_INERT_ASSET",
      ownerActions: {
        async registerGraph(g) {
          assert.equal(g.providers[0].provider, provider);
          assert.equal(g.providers[0].recipientIndex, 1);
          assert.equal(
            g.prepared.rolePackets.local.filter((r) => r.local.value.active)
              .length,
            1,
          );
        },
      },
      abort: async () => {
        f.closed.push("abort");
      },
      close: async () => {
        f.closed.push("account");
      },
    };
    f.accountKeeper = {
      async prepare(request) {
        f.request = request;
      },
      async execute(id) {
        assert.equal(id, f.request.requestId);
        f.graphs++;
        await f.execCallbacks.onProof({
          label: "HOST_INERT_S",
          relation: "reservation",
          proof: result(),
        });
        graphSolana.transfers.push({
          phase: "OBSERVED_FINALIZED",
          broadcastAttempts: 1,
          intent: { lamports: "10000000" },
          nativeWire: "HOST_INERT_WIRE",
          nativeId: "HOST_INERT_NATIVE_ID",
          transactionSHA256: "HOST_INERT_WIRE_SHA",
          observation: { nativeWire: "HOST_INERT_WIRE" },
        });
        if (lost) throw Error("HOST_LOST_ORIGINAL_GRAPH_REPLY");
      },
      async reconcile(id) {
        assert.equal(id, f.request.requestId);
        f.reconciles++;
      },
      close: async () => {
        f.closed.push("keeper");
      },
    };
    f.bitcoin = {
      transfers: [],
      async confirm(id) {
        assert.equal(id, "HOST_ORIGINAL_BTC_ID");
        f.confirms++;
      },
    };
    f.controller = {
      async prepare() {
        return { intentId: "HOST_ORIGINAL_BTC_INTENT" };
      },
      async preposition() {
        f.funds++;
        assert.deepEqual(f.births, [
          "owner",
          "recipient",
          "execution",
          "account",
          "keeper",
        ]);
      },
      async ingress() {
        assert.equal(f.available, false);
        f.send++;
        f.bitcoin.transfers.push({ route: "deposit" });
      },
      async privateNativeReceipt() {
        return {
          family: "1",
          broadcastAttempts: 1,
          nativeId: "HOST_ORIGINAL_BTC_ID",
        };
      },
      async reconcile() {
        f.reconciles++;
      },
      async issue() {
        f.issues++;
        return { status: "ISSUED", submission: "HOST_INERT_SUBMISSION" };
      },
    };
    f.binding = {
      status: async () => ({
        phase: f.phase,
        availablePrivateClaims: null,
        privateCreditEstablished: false,
      }),
      async bindObservedOriginalOnce() {
        assert.equal(graphSolana.transfers.length, 1);
        f.wrapped++;
        f.phase = "READY";
        return { amount: "123", privateCreditEstablished: false };
      },
    };
    const original = {
      runtime,
      bitcoin: f.bitcoin,
      graphBitcoin,
      graphSolana,
      claims,
      bootstrap: { graphSolanaRule: { family: "2" }, rulePaths: [[], [], []] },
      observer: Object.freeze({}),
      graphQuorum: quorum,
      controller: f.controller,
      ingressProverIdentity: "HOST_INERT_PROVER_ID",
      sourceProvider: provider,
      sourceBinding: f.binding,
      directory,
    };
    f.original = original;
    runtimeFixtures.set(runtime, f);
    providerFixtures.set(provider, f);
    accountFixtures.set(f.account.config, f);
    birthDirectories.set(path.join(directory, "original-btc-source"), f);
    f.producer = await create(original);
    return f;
  }
  try {
    const f = await fixture();
    assert.equal(f.funds, 0);
    assert.equal(f.proofs, 0);
    assert.equal((await f.producer.status()).phase, "BORN");
    assert.throws(
      () => f.producer.deliverOnce({}),
      /NATIVE_CLAIM_DEVICE_TLS_CONFIGURATION/,
    );
    await assert.rejects(
      create({
        ...f.original,
        sourceProvider: { ...f.original.sourceProvider },
      }),
      /HOST_ORIGINAL_PROVIDER_REQUIRED/,
    );
    const completed = await f.producer.deliverOnce();
    assert.equal(completed.phase, "TARGET_QUOTED");
    assert.equal(completed.privateCreditEstablished, false);
    assert.equal(completed.claimCustody, "DEVICE_ROOT_NOTE");
    assert.equal(f.funds, 1);
    assert.equal(f.send, 1);
    assert.equal(f.confirms, 1);
    assert.equal(f.issues, 1);
    assert.equal(f.graphs, 1);
    assert.equal(f.wrapped, 1);
    assert.equal(f.proofs, 3);
    assert.throws(() => f.producer.deliverOnce(), /ALREADY_ADMITTED/);
    const counts = [f.funds, f.send, f.proofs, f.graphs, f.wrapped];
    let callback = false;
    await f.producer.observe.call({
      status() {
        callback = true;
      },
    });
    assert.equal(callback, false);
    assert.deepEqual([f.funds, f.send, f.proofs, f.graphs, f.wrapped], counts);
    const u = await fixture(true);
    await assert.rejects(u.producer.deliverOnce(), /LOST_ORIGINAL_GRAPH_REPLY/);
    assert.equal((await u.producer.status()).phase, "UNKNOWN");
    assert.equal(u.wrapped, 0);
    const before = [u.funds, u.send, u.proofs, u.graphs, u.wrapped];
    await u.producer.observe();
    await u.producer.observe();
    assert.deepEqual([u.funds, u.send, u.proofs, u.graphs, u.wrapped], before);
    assert.throws(() => u.producer.deliverOnce(), /ALREADY_ADMITTED/);
    assert.equal((await f.producer.observe()).phase, "TARGET_QUOTED");
    assert.deepEqual([f.funds, f.send, f.proofs, f.graphs, f.wrapped], counts);
    assert.throws(() => JSON.stringify(f.producer), /NOT_SERIALIZABLE/);
    await f.producer.close();
    assert.deepEqual(f.closed, [
      "abort",
      "keeper",
      "account",
      "execution",
      "recipient",
      "owner",
    ]);
    assert.throws(() => f.producer.deliverOnce(), /CLOSED/);
    assert.throws(() => f.producer.status(), /CLOSED/);
  } finally {
    for (const f of fixtures) await f.producer?.close().catch(() => {});
    await rm(root, { recursive: true, force: true });
  }
});
