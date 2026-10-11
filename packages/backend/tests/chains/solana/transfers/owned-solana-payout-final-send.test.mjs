/** Whole transfer and integration host-interface tests. All process, RPC, persistence, signing and codec ports are inert
 * controlled mocks. No runtime factory, native node, network, key or proof runs.
 * These tests establish host ordering, not native execution or authority. */
import test from "node:test";
import assert from "node:assert/strict";
import { exactRecord } from "@lianum/components/encoding/commitments";
import { createRuntimeFixture as fixture } from "../../../fixtures/chains/solana/runtime/solana-payout-authority-runtime.fixture.mjs";
import {
  createRuntimeOnlyFinalSendChecks,
  prepareNonceRoutes,
} from "../../../../../../tests/integration/chains/solana/host-send-checks.mjs";
import { assertSolanaCandidateAcceptanceGate } from "../../../../../../tests/integration/chains/solana/solana-candidate-acceptance-policy.mjs";
import { PREFLIGHT_REAL_RUN_DISABLED } from "../../../../../../tests/integration/claims/ingress/native-ingress-v3-preflight-policy.mjs";
const signature = Buffer.alloc(64, 7),
  nativeId = signature.toString("hex");
const prepared = {
  genesis: "genesis",
  unsignedWire: "010203",
  intent: {
    sourcePublicKey: "11",
    recipientPublicKey: "22",
    nonceAccountPublicKey: "33",
    durableNonce: "44",
    lamports: "10",
    wireKeyCommitment: "55",
  },
  funds: { feeLamports: "1" },
};
const originalWire = Buffer.concat([
  Buffer.from([1]),
  signature,
  Buffer.from(prepared.unsignedWire, "hex"),
]).toString("base64");

test("deposit still uses the existing final-send contract and ingress-only history checks", async () => {
  const f = fixture("deposit");
  await f.start("transfer");
  assert.equal(
    f.events.filter((event) => event === "ingress-history").length,
    2,
  );
  assert.equal(f.counters().sendCalls, 1);
  const missing = fixture("deposit"),
    callbacks = missing.callbacks();
  callbacks.beforeSend = null;
  await assert.rejects(
    missing.start("transfer", callbacks),
    /SOLANA_REQUIRED_INGRESS_FINAL_SEND_CALLBACKS/,
  );
  assert.equal(missing.counters().signCalls, 0);
});

function nativeOnlyChecks(route = "redeem") {
  const state = {
    now: 100,
    guard: true,
    process: true,
    socketFailure: null,
    checks: 0,
    pids: 0,
  };
  const originalPrepared = structuredClone(prepared),
    preparedCopy = structuredClone(prepared);
  const record = {
    nativeId,
    nativeWire: originalWire,
    transactionSHA256: "retained-sha256",
    route,
    genesis: "native-genesis",
    intent: structuredClone(prepared.intent),
    phase: "BROADCAST_UNKNOWN",
    broadcastAttempts: 1,
  };
  const runtime = {
    payoutFinalSendProfile: "OWNED_SOLANA_PAYOUT_POST_FSYNC_V1",
    genesis: "native-genesis",
    transfers: [record],
    get metadata() {
      return {
        processId: 123,
        periodicSocketAudit: { failure: state.socketFailure },
      };
    },
  };
  const checks = createRuntimeOnlyFinalSendChecks(
    {
      runtime,
      route,
      prepared: originalPrepared,
      preparedCopy,
      signed: {
        nativeId,
        nativeWire: originalWire,
        transactionSHA256: "retained-sha256",
      },
      started: 100,
      guard: {
        check() {
          state.checks++;
          assert.ok(state.guard, "HOST_RESOURCE_NOT_LIVE");
        },
        verifyRuntimePID(pid) {
          state.pids++;
          assert.equal(pid, 123);
          assert.ok(state.process, "OWNED_PROCESS_NOT_LIVE");
        },
      },
    },
    {
      profile: "OWNED_SOLANA_PAYOUT_POST_FSYNC_V1",
      now: () => state.now,
      decode(wire, intent) {
        assert.equal(wire, originalWire);
        assert.deepEqual(intent, prepared.intent);
        return { signatureHex: nativeId, transactionSHA256: "retained-sha256" };
      },
    },
  );
  return { checks, state, originalPrepared, preparedCopy, record, runtime };
}
for (const route of ["deposit", "redeem"]) {
  test(`disabled native-only ${route} callback guard retains the original and consumes once without claim authority`, async () => {
    const f = nativeOnlyChecks(route);
    assert.throws(
      () => f.checks.assertBeforeSend(f.originalPrepared),
      /FINAL_SEND_ONCE/,
    );
    assert.equal(await f.checks.beforeSend(f.originalPrepared), undefined);
    assert.equal(f.checks.assertBeforeSend(f.originalPrepared), undefined);
    assert.equal(f.state.checks, 2);
    assert.equal(f.state.pids, 2);
    assert.throws(
      () => f.checks.assertBeforeSend(f.originalPrepared),
      /FINAL_SEND_ONCE/,
    );
    await assert.rejects(
      f.checks.beforeSend(f.originalPrepared),
      /FINAL_SEND_ONCE/,
    );
  });
  for (const stage of ["async", "sync"])
    for (const fault of [
      "prepared-reference",
      "prepared-bytes",
      "wire",
      "hash",
      "route",
      "intent",
      "genesis",
      "attempt",
      "phase",
      "missing",
      "duplicate",
      "resource",
      "process",
      "socket",
      "expiry",
    ]) {
      test(`disabled native-only ${route} ${stage} gate rejects late ${fault}`, async () => {
        const f = nativeOnlyChecks(route);
        let value = f.originalPrepared;
        if (stage === "sync") await f.checks.beforeSend(value);
        if (fault === "prepared-reference") value = structuredClone(value);
        if (fault === "prepared-bytes") f.originalPrepared.unsignedWire = "ff";
        if (fault === "wire") f.record.nativeWire = "changed-wire";
        if (fault === "hash") f.record.transactionSHA256 = "changed-hash";
        if (fault === "route") f.record.route = "wrong-route";
        if (fault === "intent") f.record.intent.lamports = "99";
        if (fault === "genesis") f.record.genesis = "wrong-genesis";
        if (fault === "attempt") f.record.broadcastAttempts = 0;
        if (fault === "phase") f.record.phase = "SIGNED_NOT_BROADCAST";
        if (fault === "missing") f.runtime.transfers = [];
        if (fault === "duplicate")
          f.runtime.transfers.push(structuredClone(f.record));
        if (fault === "resource") f.state.guard = false;
        if (fault === "process") f.state.process = false;
        if (fault === "socket") f.state.socketFailure = "lost-isolation";
        if (fault === "expiry") f.state.now += 30_000;
        const reason =
          /SOLANA_CANDIDATE_|HOST_RESOURCE_NOT_LIVE|OWNED_PROCESS_NOT_LIVE/;
        if (stage === "async") {
          await assert.rejects(f.checks.beforeSend(value), reason);
          await assert.rejects(f.checks.beforeSend(value), /FINAL_SEND_ONCE/);
        } else {
          assert.throws(() => f.checks.assertBeforeSend(value), reason);
          assert.throws(
            () => f.checks.assertBeforeSend(value),
            /FINAL_SEND_ONCE/,
          );
        }
      });
    }
}

test("actual preflight route loop supplies strict nonce callbacks and stops at its exact before-key sentinel", async () => {
  const routes = ["deposit", "refund", "redeem"],
    calls = [],
    sentinels = [];
  const roleNames = {
    deposit: ["depositor", "escrow"],
    refund: ["escrow", "depositor"],
    redeem: ["escrow", "recipient"],
  };
  const roles = Object.fromEntries(
    ["depositor", "escrow", "recipient"].map((role) => [
      role,
      { endpoint: role + "-endpoint" },
    ]),
  );
  const runtime = { ingressSendState: { busy: false, uncertain: false } };
  const solana = {
    roles,
    nonceInfrastructureByAuthority: {},
    adapter({ route }) {
      const [sourceRole, destinationRole] = roleNames[route];
      const value = {
        genesis: "genesis",
        unsignedWire: "unsigned",
        intent: {
          sourcePublicKey: roles[sourceRole].endpoint,
          recipientPublicKey: roles[destinationRole].endpoint,
          nonceAccountPublicKey: sourceRole + "-nonce",
          durableNonce: sourceRole + "-value",
          lamports: "1000000",
          wireKeyCommitment: route + "-key",
        },
        funds: {
          feeLamports: "1",
          nonceAccount: {
            authorityPublicKey: roles[sourceRole].endpoint,
            durableNonce: sourceRole + "-value",
          },
        },
      };
      return {
        async assertPrepared(input) {
          assert.equal(input, value);
          calls.push(route + "-prepare");
        },
        async transfer(request, callbacks) {
          exactRecord(callbacks, [
            "beforeSign",
            "onSigned",
            "beforeBroadcast",
            ...(route === "deposit" ? ["beforeSend", "assertBeforeSend"] : []),
          ]);
          assert.equal(callbacks.onSigned, callbacks.beforeBroadcast);
          if (route === "deposit") {
            assert.equal(callbacks.onSigned, callbacks.beforeSend);
            assert.equal(callbacks.onSigned, callbacks.assertBeforeSend);
          }
          assert.equal(request.wireKeyCommitment, route + "-key");
          try {
            await callbacks.beforeSign(value);
            assert.fail("MUST_STOP_BEFORE_KEY");
          } catch (error) {
            sentinels.push(error);
            throw error;
          }
        },
      };
    },
  };
  const result = await prepareNonceRoutes({
    routes,
    solana,
    runtime,
    epoch: runtime.ingressSendState,
    config: {
      nativeAsset: "asset",
      nativeGenesis: "genesis",
      refundMaxFee: "2",
    },
    ownedCustodyRoute: (route) => ({
      sourceRole: roleNames[route][0],
      destinationRole: roleNames[route][1],
    }),
    nonceForRoute: (route) => ({
      nonceAccountPublicKey: roleNames[route][0] + "-nonce",
      authorityPublicKey: roles[roleNames[route][0]].endpoint,
    }),
    hash: (route) => route + "-key",
    encodeSolanaNonceBindingMessage: () => "unsigned",
    copy: structuredClone,
    noEffects() {
      calls.push("no-effects");
    },
  });
  assert.deepEqual(
    calls,
    routes.flatMap((route) => [route + "-prepare", "no-effects"]),
  );
  assert.equal(sentinels.length, 3);
  assert.ok(
    sentinels.every(
      (error) => error.message === "V3_PREFLIGHT_STOP_BEFORE_NATIVE_KEY",
    ),
  );
  assert.deepEqual(
    result.preparedRoutes,
    routes.map((route) => ({
      route,
      unsignedPreparationRevalidated: true,
      stoppedBeforeNativeKey: true,
    })),
  );
});

test("runtime-only acceptance requires its exact opt-in; zero-deposit preflight remains disabled", () => {
  for (const arguments_ of [
    [],
    ["--run"],
    ["--run-reviewed-local-candidate", "--override"],
  ])
    assert.throws(
      () => assertSolanaCandidateAcceptanceGate(arguments_),
      /EXACT_OPT_IN_REQUIRED/,
    );
  assert.equal(PREFLIGHT_REAL_RUN_DISABLED, true);
});
