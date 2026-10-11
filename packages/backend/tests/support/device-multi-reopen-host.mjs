/** Exercise canonical recovery and graph owners across a real process boundary.
 * Native/account/executor/HTTP resources are explicit inert lower ports. Neither
 * recovery tokens nor private lifetime handles are fabricated by this fixture. */
import assert from "node:assert/strict";
import { mock } from "node:test";
import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import ts from "typescript";
import { Vault } from "@lianum/engine/crypto/vault";
import { canonicalClaimRecordDataV1 } from "@lianum/engine/storage/records";
import * as P from "@lianum/mobile-protocol/device/source-note-v1";
import { devicePublicKey } from "../../../../apps/mobile/src/custody/signing.mjs";
import { sealStoppedNativeFilesV1 } from "../../src/chains/shared/runtime/owned-runtime-recovery-files-v1.mjs";
const [mode, manifestFile, scenario = "success"] = process.argv.slice(2);
const input = JSON.parse(await readFile(manifestFile, "utf8"));
const scratch = join(dirname(input.directory), "native-files");
const h = (value) => createHash("sha256").update(value).digest("hex");
const digest = (value) => h(canonicalClaimRecordDataV1(value));
const key = Buffer.from("12".repeat(32), "hex");
const runtime = Object.freeze({
  metadata: {
    version: "OWNED_FLAT_LOCAL_EVM_V2",
    scratchDirectory: scratch,
    evmGenesis: "0x" + "11".repeat(32),
    chainId: "31337",
  },
  ingressSendState: {},
  async close() {
    return { closed: true };
  },
});
const system = Object.freeze({
  verify() {
    assert.fail("HOST_REOPEN_PROOF_FORBIDDEN");
  },
});
const deliveryObserver = Object.freeze(Object.create(null));
const routers = Object.freeze(
  Array.from({ length: 4 }, (_, i) =>
    Object.freeze({
      address: "0x" + String(i + 1).padStart(40, "0"),
      identity: Object.freeze({ router: String(i + 1).padStart(40, "0") }),
    }),
  ),
);
const systemContext = Object.freeze({
  runtime,
  system,
  deliveryObserver,
  routers,
  async close() {
    return { closed: true };
  },
});
const accounts = new WeakSet();
const counts = {
  acquisitions: 0,
  proofs: 0,
  sends: 0,
  accountStops: 0,
  bridgeStops: 0,
  executionStops: 0,
  listenersStopped: 0,
  partsConsumed: 0,
};
const deny = () => assert.fail("HOST_REOPEN_NEW_EFFECT_FORBIDDEN");
const source = (relative) => new URL("../../src/" + relative, import.meta.url);
// Inspect only public API names; no implementation text is executed or cut.
async function publicNames(url) {
  const text = await readFile(url, "utf8"),
    ast = ts.createSourceFile(
      url.pathname,
      text,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.JS,
    ),
    names = new Set();
  const bindings = (node) => {
    if (ts.isIdentifier(node)) names.add(node.text);
    else
      for (const element of node.elements)
        if (ts.isBindingElement(element)) bindings(element.name);
  };
  for (const statement of ast.statements) {
    if (
      ts.isExportDeclaration(statement) &&
      statement.exportClause &&
      ts.isNamedExports(statement.exportClause)
    )
      for (const element of statement.exportClause.elements)
        names.add(element.name.text);
    if (
      !statement.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
    )
      continue;
    if (
      ts.isFunctionDeclaration(statement) ||
      ts.isClassDeclaration(statement)
    ) {
      if (statement.name) names.add(statement.name.text);
    }
    if (ts.isVariableStatement(statement))
      for (const declaration of statement.declarationList.declarations)
        bindings(declaration.name);
  }
  return names;
}
async function replace(relative, overrides) {
  const url = source(relative),
    namedExports = Object.fromEntries(
      [...(await publicNames(url))].map((name) => [name, deny]),
    );
  mock.module(url, { namedExports: { ...namedExports, ...overrides } });
}
let authority, graph, fixture;
function assertRuntime(value) {
  assert.equal(value, runtime, "EXPLICIT_INERT_NATIVE_RESOURCE");
}
function consume(token, kind) {
  assert.throws(() =>
    graph.consumeOriginalDeviceExternalFlatGraphRecoveryPartV1(
      { ...token },
      kind,
    ),
  );
  assert.throws(() =>
    graph.consumeOriginalDeviceExternalFlatGraphRecoveryPartV1(
      token,
      kind + "-wrong",
    ),
  );
  const result = graph.consumeOriginalDeviceExternalFlatGraphRecoveryPartV1(
    token,
    kind,
  );
  assert.throws(() =>
    graph.consumeOriginalDeviceExternalFlatGraphRecoveryPartV1(token, kind),
  );
  counts.partsConsumed++;
  return result;
}
async function ownedAccount(seed) {
  counts.acquisitions++;
  assert.deepEqual(await new Vault(seed.file).read(seed.password), seed.record);
  const account = Object.freeze({
    descriptor: seed.descriptor,
    async close() {
      counts.accountStops++;
      return { closed: true };
    },
  });
  accounts.add(account);
  return account;
}
await replace("chains/evm/runtime/owned-evm-v2-runtime.mjs", {
  assertOwnedLocalEvmV2: async (r) => assertRuntime(r),
  assertOwnedDeviceExternalFlatReceiverV1: assertRuntime,
  async captureOwnedDeviceExternalFlatReceiverV1(r, token) {
    assertRuntime(r);
    authority.deviceExternalFlatReceiverCaptureIdentityV1(token);
    return {
      schema: "OWNED_EXTERNAL_DEFI_RECEIVER_CAPTURE_V3",
      family: "receiver",
      terminal: { ownedProcessStopped: true, forced: false },
      cwd: scratch,
      files: await sealStoppedNativeFilesV1(scratch),
    };
  },
  async reopenOwnedDeviceExternalFlatReceiverV1(token) {
    authority.consumeDeviceExternalFlatReceiverRuntimeSectionV1(token);
    return runtime;
  },
});
await replace("operations/deployments/system/deploy-system.mjs", {
  assertOwnedFlatSystem(r, s) {
    assertRuntime(r);
    assert.equal(s, system);
  },
});
await replace(
  "operations/recovery/device-external-flat-original-source-v2.mjs",
  { isOriginalDeviceGraphSourceSectionV2: () => false },
);
await replace(
  "accounts/recovery/device-external-flat-ordered-observation-recovery-v1.mjs",
  {
    async retainDeviceExternalFlatSystemForReopenV1({
      runtime: r,
      system: s,
      attemptAuthority: token,
    }) {
      assertRuntime(r);
      assert.equal(s, system);
      await authority.retainOriginalWrappedRecoverySectionV1(token, "system", {
        explicitInertHost: true,
      });
      return { retained: true, originalResourcesStopped: true };
    },
    async reopenDeviceExternalFlatSystemFromAuthorityV1({
      runtime: r,
      attemptAuthority: token,
    }) {
      assertRuntime(r);
      assert.deepEqual(
        authority.consumeOriginalWrappedRecoverySectionV1(token, "system"),
        { explicitInertHost: true },
      );
      return systemContext;
    },
  },
);
await replace("chains/evm/vault/metamorpho-graph-delivery-observer-v1.mjs", {
  isOwnedMetaMorphoGraphDeliveryBatchV4: (o) => o === deliveryObserver,
  readOriginalMetaMorphoGraphBatchRoutersV4(o, q) {
    assert.equal(o, deliveryObserver);
    assertRuntime(q.runtime);
    assert.equal(q.system, system);
    return routers;
  },
});
await replace("accounts/authority/device-external-flat-note-authority-v1.mjs", {
  assertOriginalDeviceExternalFlatNoteAuthorityV1(a) {
    assert.ok(accounts.has(a));
    return a.descriptor;
  },
  assertOriginalDeviceExternalFlatShareNoteAuthorityV1(a, q) {
    assert.ok(accounts.has(a));
    assert.equal(q.deliveryObserver, deliveryObserver);
    return a.descriptor;
  },
  async reopenOriginalDeviceExternalFlatGraphAccountV1(token) {
    const r = consume(token, "account");
    assertRuntime(r.input.runtime);
    assert.equal(r.input.system, system);
    return ownedAccount(r.saved);
  },
  async reopenOriginalDeviceExternalFlatGraphShareBatchV4(token) {
    const r = consume(token, "account-batch");
    assertRuntime(r.runtime);
    assert.equal(r.system, system);
    assert.equal(r.deliveryObserver, deliveryObserver);
    assert.equal(r.routers, routers);
    return Promise.all(r.seeds.map(ownedAccount));
  },
});
await replace("execution/account/execution/flat-native-execution.mjs", {
  async reopenOriginalDeviceExternalFlatGraphExecutionV1(token) {
    const r = consume(token, "execution");
    assert.deepEqual(
      await new Vault(join(r.saved.directory, "operations.vault")).read(
        r.saved.password,
      ),
      r.saved.record,
    );
    return Object.freeze({
      prepare: deny,
      execute: deny,
      recover: deny,
      async close() {
        counts.executionStops++;
        return { closed: true };
      },
    });
  },
});
await replace("accounts/authority/device-external-flat-source-graph-v1.mjs", {
  async reopenOriginalDeviceExternalFlatSourceGraphV1(token) {
    const r = consume(token, "bridge");
    assert.equal(r.multi, true);
    assert.deepEqual(
      await new Vault(r.saved.file).read(r.saved.password),
      r.saved.record,
    );
    return Object.freeze({
      challenge: () => ({ observationOnly: true }),
      preparation: deny,
      review: deny,
      operate: deny,
      outputQuote: deny,
      outputReview: deny,
      outputOperate: deny,
      status: async () => ({ jobs: [], observationOnly: true }),
      async close() {
        counts.bridgeStops++;
        return { closed: true };
      },
    });
  },
});
await replace("api/mobile/device-external-flat-note-http-v1.mjs", {
  async createOriginalDeviceExternalFlatGraphTlsServerV1({
    account,
    targetAccount,
  }) {
    assert.ok(accounts.has(account) && accounts.has(targetAccount));
    return Object.freeze({
      url: account.descriptor.origin,
      async close() {
        counts.listenersStopped++;
        return { closed: true };
      },
    });
  },
  async createOriginalDeviceExternalFlatTlsServerV1({ account }) {
    assert.ok(accounts.has(account));
    return Object.freeze({
      async close() {
        counts.listenersStopped++;
        return { closed: true };
      },
    });
  },
});
if (mode === "capture")
  await replace(
    "operations/local/device-external-flat-source-graph-service-v1.mjs",
    {
      async retainOriginalDeviceExternalFlatGraphServiceSectionV1(
        service,
        token,
      ) {
        assert.equal(service, fixture);
        authority.deviceExternalFlatAccountCaptureIdentityV1(token);
        await authority.retainOriginalWrappedRecoverySectionV1(
          token,
          "deviceAccount",
          fixture.d,
        );
        return { retained: true, originalResourcesStopped: true };
      },
    },
  );
authority = await import(
  source("claims/wrapped/recovery/wrapped-recovery-authority-v1.mjs")
);
async function buildFixture() {
  async function retain(slot, schema, seed) {
    const identity = { profile: "EXPLICIT_INERT_HOST_ORIGINAL_PART", slot },
      value = { schema, confirmed: seed, candidate: null };
    const handle = await authority.retainWrappedPrivateLifetimePartV1(
      runtime,
      slot,
      identity,
      value,
    );
    authority.assertWrappedPrivateLifetimePartSealedV1(handle);
    const row = await authority.readWrappedPrivateLifetimePartV1(
      runtime,
      slot,
      identity,
    );
    assert.equal(row.handle, handle);
    assert.deepEqual(row.privateState, value);
    assert.throws(() =>
      authority.assertWrappedPrivateLifetimePartSealedV1({ ...handle }),
    );
    return { slot, identity, stateSHA256: digest(value) };
  }
  async function actual(directory, file, data) {
    const d = join(scratch, directory);
    await mkdir(d, { mode: 0o700 });
    const secret = h(directory),
      vault = new Vault(join(d, file)),
      record = await vault.create(data, secret);
    assert.deepEqual(await vault.read(secret), record);
    return { directory: d, password: secret, record };
  }
  const descriptor = (i) => ({
      profile:
        i < 0
          ? P.DEVICE_EXTERNAL_FLAT_NOTE_V1
          : P.DEVICE_EXTERNAL_FLAT_SHARE_V1,
      origin: "https://127.0.0.1:" + String(i < 0 ? 9443 : 9443 + i),
      devicePublicKey: devicePublicKey(key),
      pairingId: h("pair" + i),
      lifetime: h("lifetime" + i),
    }),
    source = descriptor(-1),
    targetDescriptors = Array.from({ length: 4 }, (_, i) => descriptor(i)),
    deliveries = Array.from({ length: 4 }, (_, i) => ({
      id: "device-external-share-" + i,
      dependsOn:
        i === 0
          ? []
          : i === 3
            ? ["device-external-share-1", "device-external-share-2"]
            : ["device-external-share-0"],
      origin: targetDescriptors[i].origin,
      maximumInput: "100",
      shareAmount: "100",
      payoutAmount: "100",
    }));
  const accountParts = [];
  for (let i = 0; i < 5; i++) {
    const d = i === 0 ? source : targetDescriptors[i - 1],
      original = await actual(
        "device-external-flat-note-" + i,
        "operations.vault",
        {
          schema: "ORIGINAL_DEVICE_EXTERNAL_FLAT_JOURNAL_V1",
          descriptor: d,
          identitySHA256: h("owner" + i),
          jobs: [],
        },
      );
    accountParts.push(
      await retain(
        i === 0
          ? "device-external-flat-account-0"
          : "device-external-flat-account-multi-" + (i - 1),
        "DEVICE_EXTERNAL_FLAT_GRAPH_ACCOUNT_DURABLE_V1",
        {
          schema: "DEVICE_EXTERNAL_FLAT_GRAPH_ACCOUNT_PRIVATE_V1",
          ...original,
          file: join(original.directory, "operations.vault"),
          descriptor: d,
          identitySHA256: h("owner" + i),
          initialCheckpoint: { revision: 0, commitment: h("initial" + i) },
          proofFrames: "[]",
          proofFramesSHA256: h("[]"),
          shareGraph: null,
        },
      ),
    );
  }
  const executionOriginal = await actual(
      "flat-execution-original",
      "operations.vault",
      { operations: [] },
    ),
    executionPart = await retain(
      "wallet-execution-0",
      "DEVICE_EXTERNAL_FLAT_EXECUTION_DURABLE_V1",
      {
        schema: "DEVICE_EXTERNAL_FLAT_EXECUTION_PRIVATE_V1",
        ...executionOriginal,
      },
    );
  const graphOriginal = await actual(
      "device-external-source-graph-original",
      "operations.vault",
      { job: null, quote: null, withdrawals: [] },
    ),
    bridgePart = await retain(
      "wallet-graph-keeper-0",
      "DEVICE_EXTERNAL_FLAT_GRAPH_DURABLE_V1",
      {
        schema: "DEVICE_EXTERNAL_FLAT_GRAPH_PRIVATE_V1",
        ...graphOriginal,
        file: join(graphOriginal.directory, "operations.vault"),
        preparation: null,
        invoiceSignatures: null,
        proposal: null,
        proofFrames: "[]",
        proofFramesSHA256: h("[]"),
      },
    );
  const rule = { family: "3" },
    rulePath = {},
    providers = [];
  for (let i = 0; i < 4; i++) {
    const original = await actual(
      "device-external-graph-provider-slot-" + i,
      "provider-slot.vault",
      {
        schema: "ORIGINAL_DEVICE_META_PROVIDER_SLOT_V4",
        slot: i,
        ...Object.fromEntries(
          ["maximumInput", "shareAmount", "payoutAmount"].map((k) => [
            k,
            "100",
          ]),
        ),
        rule,
        rulePath,
        state: "BORN",
      },
    );
    providers.push({
      schema: "ORIGINAL_DEVICE_META_PROVIDER_SLOT_CHECKPOINT_V4",
      slot: i,
      directory: original.directory,
      password: original.password,
      router: routers[i].address,
      slotRecord: original.record,
      providerRecord: null,
    });
  }
  const workspacePart = await retain(
    "provider-0",
    "DEVICE_EXTERNAL_FLAT_GRAPH_WORKSPACE_DURABLE_V1",
    {
      schema: "DEVICE_EXTERNAL_FLAT_GRAPH_WORKSPACE_PRIVATE_V1",
      terms: null,
      preparation: null,
      invoiceSignatures: null,
      providers: null,
      provider: null,
      multiDeliveries: deliveries,
      multiProviderPrivate: providers,
      maximumSolverInput: "400",
      rule,
      rulePath,
      proofFrames: "[]",
    },
  );
  const d = {
    schema: "DEVICE_EXTERNAL_FLAT_MULTI_GRAPH_SECTION_V4",
    accounts: accountParts,
    bridge: bridgePart,
    execution: executionPart,
    workspace: workspacePart,
    descriptor: source,
    targetDescriptor: targetDescriptors[0],
    targetDescriptors,
    deliveries,
    observationOnly: true,
  };
  return { d, providers, targetDescriptors };
}
if (mode === "capture") {
  await mkdir(scratch, { mode: 0o700 });
  const owner =
    await authority.createDeviceExternalFlatRecoveryAuthorityV1(input);
  await authority.createWrappedPrivateLifetimeRegistryV1({ ...input, runtime });
  fixture = await buildFixture();
  await authority.retainDeviceExternalFlatGraphRecoveryV1(owner, fixture);
  await authority.retainDeviceExternalFlatSystemRecoveryV1(owner, {
    runtime,
    system,
  });
  await authority.retainDeviceExternalFlatLifetimeRecoveryV1(owner, runtime);
  await authority.retainDeviceExternalFlatReceiverRuntimeV1(owner, runtime);
  const checkpoint =
    await authority.finishDeviceExternalFlatRecoveryCaptureV1(owner);
  await writeFile(
    manifestFile + ".capture",
    JSON.stringify({ checkpoint, fixture, pid: process.pid }),
    { mode: 0o600 },
  );
  console.log(JSON.stringify({ captured: true, pid: process.pid }));
} else {
  const saved = JSON.parse(await readFile(manifestFile + ".capture", "utf8"));
  fixture = saved.fixture;
  assert.notEqual(process.pid, saved.pid);
  graph = await import(
    source("operations/local/device-external-flat-source-graph-service-v1.mjs")
  );
  const owner = await authority.openDeviceExternalFlatRecoveryAuthorityV1(
    input,
    saved.checkpoint,
  );
  assert.throws(() =>
    authority.assertDeviceExternalFlatRecoveryAuthorityV1({ ...owner }),
  );
  const reopened =
    await authority.reopenDeviceExternalFlatReceiverRuntimeV1(owner);
  assert.equal(reopened, runtime);
  const registry = await authority.reopenDeviceExternalFlatLifetimeRecoveryV1(
    owner,
    runtime,
  );
  const context = await authority.reopenDeviceExternalFlatSystemRecoveryV1(
    owner,
    { runtime },
  );
  if (scenario === "provider-checkpoint") {
    const p = fixture.providers[2],
      vault = new Vault(join(p.directory, "provider-slot.vault"));
    await vault.update(p.password, p.slotRecord.revision, (data) => ({
      ...data,
      state: "ACTIVATING",
    }));
  }
  if (scenario === "pending-candidate") {
    const d = fixture.d.workspace,
      row = await authority.readWrappedPrivateLifetimePartV1(
        runtime,
        d.slot,
        d.identity,
      );
    await authority.updateWrappedPrivateLifetimePartV1(row.handle, {
      ...row.privateState,
      candidate: { phase: "PREPARING" },
    });
  }
  const open = async () =>
    authority.reopenDeviceExternalFlatGraphRecoveryV1(owner, {
      runtime,
      systemContext:
        scenario === "routers"
          ? { ...context, routers: [...routers].reverse() }
          : context,
      tls: { explicitInertHost: true },
      host: "127.0.0.1",
    });
  if (scenario === "success") {
    const service = await open();
    assert.equal(service.profile, "DEVICE_EXTERNAL_FLAT_MULTI_GRAPH_V4");
    assert.equal(service.observationOnly, true);
    assert.deepEqual(service.targetDescriptors, fixture.targetDescriptors);
    const observed =
      graph.readOriginalDeviceExternalFlatMultiGraphObservationContextV4(
        service,
      );
    assert.equal(observed.runtime, runtime);
    assert.deepEqual(observed.routers, routers);
    assert.equal(observed.targetAccounts.length, 4);
    assert.throws(() =>
      graph.readOriginalDeviceExternalFlatMultiGraphObservationContextV4({
        ...service,
      }),
    );
    await assert.rejects(open());
    await service.close();
    assert.deepEqual(counts, {
      acquisitions: 5,
      proofs: 0,
      sends: 0,
      accountStops: 5,
      bridgeStops: 1,
      executionStops: 1,
      listenersStopped: 4,
      partsConsumed: 4,
    });
  } else {
    const expected = {
      routers: /DEVICE_EXTERNAL_GRAPH_SLOT_ROUTERS/,
      "provider-checkpoint":
        /DEVICE_EXTERNAL_GRAPH_PROVIDER_ORIGINAL_CHECKPOINT/,
      "pending-candidate": /DEVICE_EXTERNAL_GRAPH_ORIGINAL_PRIVATE_CHECKPOINT/,
    };
    await assert.rejects(open(), expected[scenario]);
    assert.equal(counts.acquisitions, 0);
    assert.equal(counts.partsConsumed, 0);
    await assert.rejects(open());
  }
  await authority.closeWrappedPrivateLifetimeRegistryV1(registry);
  await authority.closeDeviceExternalFlatRecoveryAuthorityV1(owner);
  console.log(JSON.stringify({ scenario, counts, pid: process.pid }));
}
