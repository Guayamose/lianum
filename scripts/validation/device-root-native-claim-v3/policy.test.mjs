import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

test("HOST SPL SOURCE financial policy keeps target four receipts separate and rejects mixed domains or duplicate original receipts", async () => {
  const p = await import("./policy.mjs");
  p.assertRelease();
  p.assertSplSourceRelease();
  assert.throws(() => p.assertSplSourceRelease({}), /ERR_ASSERTION/);
  assert.throws(() => p.assertSolRelease(), /DEVICE_ROOT_SOL_RELEASE_REQUIRED/);
  assert.throws(() => p.assertSplRelease(), /DEVICE_ROOT_SPL_RELEASE_REQUIRED/);
  assert.ok(Object.isFrozen(p.SPL_SOURCE_REVIEWED_RELEASE));
  for (const relations of [
    p.SPL_SOURCE_REVIEWED_RELEASE.sourceRelations,
    p.SPL_SOURCE_REVIEWED_RELEASE.targetRelations,
  ]) {
    assert.ok(Object.isFrozen(relations));
    assert.throws(() => relations.pop(), TypeError);
  }
  const h = (n) => n.toString(16).padStart(64, "0"),
    id = (n) => "00000000-0000-4000-8000-" + n.toString(16).padStart(12, "0");
  const proof = (relation, n) => ({
    relation,
    proofSHA256: h(n),
    publicInputsSHA256: h(n + 100),
    manifestSHA256: h(n + 200),
    resultSHA256: h(n + 300),
    resourcesSHA256: h(n + 400),
    evidence: {
      runId: id(n),
      jobId: id(n + 100),
      relation,
      sourceVersion: h(901),
      keySHA256: h(902),
      selfVerified: true,
      resourceReceiptCompleted: true,
      manifestSHA256: h(n + 200),
      resultSHA256: h(n + 300),
      resourcesSHA256: h(n + 400),
    },
  });
  const note = { commitment: h(701), nullifier: h(702) },
    before = {
      state: "LIVE",
      available: "321",
      path: { leaf: note.commitment },
    },
    after = {
      state: "SPENT",
      available: null,
      path: { leaf: note.commitment },
    };
  const target = [
    "deposit_intent",
    "native_claim_ingress",
    "withdraw_balance",
    "native_claim_discharge",
  ].map((r, i) => proof(r, i + 21));
  target[2].evidence = {
    id: id(23),
    mode: "withdraw_balance",
    acceptedResult: true,
    exit: { code: 0, signal: null },
    worker: { verified: true, publicInputCount: 39 },
    resourceReceiptCompleted: true,
  };
  const source = p.SPL_SOURCE_RELATIONS.map((r, i) => ({
    ...proof(r, i + 1),
    ...(["deposit_intent", "native_claim_ingress"].includes(r)
      ? { claimDomain: h(801) }
      : { graphDomainCommitment: h(802) }),
  }));
  const v = {
    profile: p.SPL_SOURCE_PROFILE,
    format: p.SPL_SOURCE_RESULT,
    phase: "completed",
    success: true,
    interrupted: false,
    sourceUnchanged: true,
    localOnly: true,
    fakeFundsOnly: true,
    originalDeviceRootSplSourceNoteExitEstablished: true,
    originalBtcToSolSourceGraphEstablished: true,
    originalDeviceRootObservationRestartEstablished: true,
    originalDeviceRootCommonStateEstablished: true,
    noteCustody: "DEVICE_ROOT_NOTE",
    nativeCustody: "BACKEND_LOCAL_QUORUM",
    amountAtomic: "321",
    nativeClaimBinding: {
      nativeFamily: "2",
      decimals: 6,
      nativeAssetKind: "SOLANA_SPL_USDC",
      mint: "A".repeat(32),
      nativeGenesis: h(810),
      nativeAsset: h(811),
      claimDomain: h(803),
    },
    proofs: target,
    sourceProofs: source,
    note: { ...note, before, after },
    withdrawal: {
      stage: "CONFIRMED",
      statement: note,
      proofSHA256: target[2].proofSHA256,
    },
    redemption: {
      status: "DISCHARGED",
      requestId: "original",
      ticketId: "ticket",
    },
    redemptionBeforeRestart: { requestId: "original", ticketId: "ticket" },
    restart: {
      observationOnly: true,
      sameOriginalRuntime: true,
      keeperChildRestarted: true,
      sameDescriptor: true,
    },
    loss: {
      actions: ["WITHDRAW_W39", "PAYOUT_NATIVE"],
      sdkBothReportedUnknown: true,
      withdrawPosts: 1,
      payoutPosts: 1,
      proofCountBeforeRestart: 4,
      proofCountAfterRestart: 4,
      effectsAfterRestart: 0,
      totalProofCountBeforeRestart: 16,
      totalProofCountAfterRestart: 16,
      sourceFinancialEffectsAfterRestart: 0,
    },
    mobile: {
      nodeAesGcm: true,
      nodeCryptographicEntropy: true,
      ciphertextPersisted: true,
      rootPersistedToFile: false,
      secureStoreHardware: false,
      biometricHardware: false,
      physicalPhoneEstablished: false,
    },
    economic: {
      sameBirthIdentity: true,
      sameAsset: true,
      availableAfter: "0",
      requestsConfirmed: true,
    },
    originalSource: {
      profile: "ORIGINAL_DEVICE_ROOT_SPL_SOURCE_EXECUTION_V4",
      phase: "TARGET_QUOTED",
      sourceCustody: "BACKEND_LOCAL_QUORUM",
      targetClaimCustody: "DEVICE_ROOT_NOTE",
      duplicateAdmissionRejected: true,
      observationNoNewEffect: true,
      sameOriginalAfterRestart: true,
      nativeFinalityObserved: true,
      nativeBroadcastAttempts: 1,
      graphBroadcastAttempts: 1,
      claimDomain: h(801),
      graphDomainCommitment: h(802),
      targetClaimDomain: h(803),
      targetAmountAtomic: "321",
      btcNativeIdSHA256: h(804),
      solNativeIdSHA256: h(805),
      solWireSHA256: h(806),
      quoteSHA256: h(807),
    },
  };
  for (const flag of [
    "publicNetwork",
    "physicalPhoneEstablished",
    "reactRendererEstablished",
    "nativeSelfCustody",
    "independentOperators",
    "fullWalletAcceptance",
    "nativeProcessRestartEstablished",
    "wholeBackendCrashRecoveryEstablished",
    "crossNetworkGraphAcceptance",
    "originalDeviceRootBtcNoteExitEstablished",
    "originalDeviceRootSolNoteExitEstablished",
    "originalDeviceRootSplNoteExitEstablished",
  ])
    v[flag] = false;
  assert.equal(
    p.assertSplSourceResult(v).originalDeviceRootSplSourceNoteExitEstablished,
    true,
  );
  for (const change of [
    (x) => x.sourceProofs.pop(),
    (x) => (x.sourceProofs[0].claimDomain = x.originalSource.targetClaimDomain),
    (x) => (x.sourceProofs[6].relation = "ready"),
    (x) => (x.sourceProofs[0].proofSHA256 = x.proofs[0].proofSHA256),
    (x) => (x.sourceProofs[1].evidence.runId = x.proofs[1].evidence.runId),
    (x) => (x.loss.totalProofCountAfterRestart = 15),
    (x) => (x.originalSource.observationNoNewEffect = false),
    (x) => (x.originalDeviceRootSplNoteExitEstablished = true),
  ]) {
    const copy = structuredClone(v);
    change(copy);
    assert.throws(() => p.assertSplSourceResult(copy));
  }
  const { selectFixedDeviceRootClaimFinancialProfileV3: select } = await import(
    "./flow.mjs"
  );
  const { createOriginalDeviceRootSplSourceClaimExitLocalOperatorV4: create } =
    await import("@lianum/backend/claims/http");
  const chosen = select(["node", "fixed", "--spl-source"]);
  assert.equal(chosen.entry, "run-spl-source.mjs");
  assert.equal(chosen.source, true);
  assert.equal(chosen.create, create);
  assert.equal(select(["node", "fixed", "--spl"]).source, undefined);
  assert.throws(() => select(["node", "fixed", "--spl-source", "--spl"]));
  // The selector is inspected only; no constructor, chain or prover runs.
});

test("original CLI selects only its four fixed constructors and rejects extra options", async () => {
  const { selectFixedDeviceRootClaimFinancialProfileV3: select } = await import(
    "./flow.mjs"
  );
  const constructors = await import("@lianum/backend/claims/http");
  const p = await import("./policy.mjs");
  const pins = await import("./source-pins.mjs");
  for (const [
    argv,
    entry,
    profile,
    family,
    decimals,
    create,
    capture,
    check,
  ] of [
    [
      [],
      "run-btc.mjs",
      p.PROFILE,
      "1",
      8,
      constructors.createOriginalDeviceRootBtcClaimExitLocalOperatorV3,
      pins.sourcePins,
      p.assertResult,
    ],
    [
      ["--sol"],
      "run-sol.mjs",
      p.SOL_PROFILE,
      "2",
      9,
      constructors.createOriginalDeviceRootSolClaimExitLocalOperatorV3,
      pins.sourcePinsSol,
      p.assertSolResult,
    ],
    [
      ["--spl"],
      "run-spl.mjs",
      p.SPL_PROFILE,
      "2",
      6,
      constructors.createOriginalDeviceRootSplClaimExitLocalOperatorV3,
      pins.sourcePinsSpl,
      p.assertSplResult,
    ],
    [
      ["--spl-source"],
      "run-spl-source.mjs",
      p.SPL_SOURCE_PROFILE,
      "2",
      6,
      constructors.createOriginalDeviceRootSplSourceClaimExitLocalOperatorV4,
      pins.sourcePinsSplSource,
      p.assertSplSourceResult,
    ],
  ]) {
    const selected = select(["node", "fixed", ...argv]);
    assert.ok(Object.isFrozen(selected));
    assert.deepEqual(selected.args, argv);
    assert.equal(selected.entry, entry);
    assert.equal(selected.profile, profile);
    assert.equal(selected.nativeFamily, family);
    assert.equal(selected.decimals, decimals);
    assert.equal(selected.create, create);
    assert.equal(selected.pins, capture);
    assert.equal(selected.check, check);
  }
  for (const argv of [
    null,
    {},
    [],
    ["node"],
    ["node", "fixed", "--other"],
    ["node", "fixed", "--sol", "--spl"],
    ["node", "fixed", "--spl-source", "--spl"],
  ])
    assert.throws(
      () => select(argv),
      /DEVICE_ROOT_FIXED_FINANCIAL_ENTRY_REQUIRED/,
    );
  assert.throws(() => select(["node", "fixed"], {}), /ERR_ASSERTION/);
  // Execute only the rejected main entry with read access and no child-process
  // permission. A new key, write or worker cannot mask the original CLI guard.
  const entry = fileURLToPath(new URL("./flow.mjs", import.meta.url));
  const project = fileURLToPath(new URL("../../../", import.meta.url));
  const rejected = spawnSync(
    process.execPath,
    ["--permission", "--allow-fs-read=" + project, entry, "--unknown"],
    {
      cwd: "/",
      env: { LANG: "C.UTF-8", PATH: "/usr/bin:/bin" },
      timeout: 4000,
      maxBuffer: 65536,
      encoding: "utf8",
    },
  );
  assert.equal(rejected.error, undefined);
  assert.equal(rejected.status, 1);
  assert.match(rejected.stderr, /DEVICE_ROOT_FIXED_FINANCIAL_ENTRY_REQUIRED/);
});
