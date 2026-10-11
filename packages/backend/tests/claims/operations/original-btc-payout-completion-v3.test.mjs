import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { finishOriginalDeviceRootBtcPayoutV3 } from "../../../src/claims/operations/original-btc-payout-completion-v3.mjs";
const h = (label) =>
  createHash("sha256")
    .update("SYNTHETIC-BTC-PAYOUT/" + label)
    .digest("hex");

// Actual completion helper, with explicit inert native/controller ports.
// No block, finality, wire, proof or economic result is accepted by this HOST.
test("HOST device-root BTC original payout confirms SAME once-sent wire then completes CO42 without another transfer", async () => {
  const { finishOriginalDeviceRootBtcPayoutV3: complete } = await import(
    "../../../src/claims/operations/original-btc-payout-completion-v3.mjs"
  );
  const ticketId = h("same-ticket"),
    receipt = {
      family: "1",
      nativeId: h("same-native-wire-id"),
      transactionSHA256: h("same-native-wire"),
      broadcastAttempts: 1,
    },
    calls = [];
  let count = 0;
  const original = {
    descriptor: { claim: { nativeFamily: "1" } },
    poolIndex: 0,
    claims: {
      nativeRuntimes: [
        {
          async confirm(id) {
            assert.equal(id, receipt.nativeId);
            calls.push("confirm");
          },
        },
      ],
    },
    controller: {
      async privateNativeReceipt(request) {
        assert.deepEqual(request, { operationId: ticketId });
        calls.push("receipt");
        return structuredClone(receipt);
      },
      async payout(request) {
        assert.deepEqual(request, { ticketId });
        count++;
        calls.push("complete");
        return { status: "DISCHARGED" };
      },
    },
  };
  assert.deepEqual(await complete(original, ticketId, { status: "UNKNOWN" }), {
    status: "DISCHARGED",
  });
  assert.deepEqual(calls, ["receipt", "confirm", "receipt", "complete"]);
  assert.equal(count, 1);
  calls.length = 0;
  assert.deepEqual(
    await complete(original, ticketId, { status: "DISCHARGED" }),
    { status: "DISCHARGED" },
  );
  assert.deepEqual(calls, []);
  receipt.broadcastAttempts = 2;
  await assert.rejects(
    complete(original, ticketId, { status: "UNKNOWN" }),
    /ORIGINAL_SEND_REQUIRED/,
  );
  assert.deepEqual(calls, ["receipt"]);
  receipt.broadcastAttempts = 1;
  calls.length = 0;
  original.controller.privateNativeReceipt = async (request) => {
    assert.deepEqual(request, { operationId: ticketId });
    calls.push("receipt");
    return {
      ...receipt,
      transactionSHA256:
        calls.length > 1 ? h("changed-wire") : receipt.transactionSHA256,
    };
  };
  await assert.rejects(
    complete(original, ticketId, { status: "UNKNOWN" }),
    /PAYOUT_WIRE_CHANGED/,
  );
  assert.deepEqual(calls, ["receipt", "confirm", "receipt"]);
  assert.equal(count, 1);
  original.descriptor.claim.nativeFamily = "2";
  calls.length = 0;
  assert.deepEqual(await complete(original, ticketId, { status: "UNKNOWN" }), {
    status: "UNKNOWN",
  });
  assert.deepEqual(calls, []);
});

test("BTC completion fails before discharge when observation changes or confirmation fails", async () => {
  for (const failure of ["family", "nativeId", "attempts", "confirm"]) {
    const receipt = {
      family: "1",
      nativeId: h("wire"),
      transactionSHA256: h("bytes"),
      broadcastAttempts: 1,
    };
    let reads = 0,
      confirms = 0,
      payouts = 0;
    const confirmationError = new Error("HOST_CONFIRMATION_UNAVAILABLE");
    const original = {
      descriptor: { claim: { nativeFamily: "1" } },
      poolIndex: 0,
      claims: {
        nativeRuntimes: [
          {
            async confirm() {
              confirms++;
              if (failure === "confirm") throw confirmationError;
            },
          },
        ],
      },
      controller: {
        async privateNativeReceipt() {
          reads++;
          return {
            ...receipt,
            ...(failure === "family" ? { family: "2" } : {}),
            ...(reads === 2 && failure === "nativeId"
              ? { nativeId: h("other-wire") }
              : {}),
            ...(reads === 2 && failure === "attempts"
              ? { broadcastAttempts: 2 }
              : {}),
          };
        },
        async payout() {
          payouts++;
          return { status: "DISCHARGED" };
        },
      },
    };
    await assert.rejects(
      finishOriginalDeviceRootBtcPayoutV3(original, h("ticket"), {
        status: "UNKNOWN",
      }),
      failure === "confirm"
        ? (error) => error === confirmationError
        : failure === "family"
          ? /BTC_PAYOUT_FAMILY/
          : failure === "nativeId"
            ? /PAYOUT_WIRE_CHANGED/
            : /ORIGINAL_SEND_REQUIRED/,
    );
    assert.equal(payouts, 0);
    assert.equal(confirms, failure === "family" ? 0 : 1);
    assert.equal(reads, failure === "family" || failure === "confirm" ? 1 : 2);
  }
  await assert.rejects(
    finishOriginalDeviceRootBtcPayoutV3(
      {},
      "ticket",
      { status: "DISCHARGED" },
      () => {},
    ),
    /ERR_ASSERTION/,
  );
});
