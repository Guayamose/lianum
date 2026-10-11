/** Integration host checks with explicit data/codec ports. They never issue
 * claim authority; production callers keep their original fixed runtime checks. */
import assert from "node:assert/strict";
import { exactRecord } from "@lianum/components/encoding/commitments";
export function createRuntimeOnlyFinalSendChecks(
  { runtime, guard, route, prepared, preparedCopy, signed, started },
  codecs,
) {
  exactRecord(codecs, ["decode", "profile", "now"]);
  const {
    decode: validateSolanaNonceBindingTransaction,
    profile: SOLANA_PAYOUT_FINAL_SEND_PROFILE,
    now,
  } = codecs;
  assert.ok(
    ["deposit", "redeem"].includes(route),
    "SOLANA_CANDIDATE_FIXED_NONCE_ROUTE",
  );
  assert.equal(
    runtime.payoutFinalSendProfile,
    SOLANA_PAYOUT_FINAL_SEND_PROFILE,
    "SOLANA_CANDIDATE_FINAL_SEND_PROFILE",
  );
  assert.equal(
    JSON.stringify(prepared),
    JSON.stringify(preparedCopy),
    "SOLANA_CANDIDATE_PREPARED_CHANGED",
  );
  const preparedBytes = JSON.stringify(preparedCopy),
    original = Object.freeze({
      nativeId: signed.nativeId,
      nativeWire: signed.nativeWire,
      transactionSHA256: signed.transactionSHA256,
    });
  let asyncAttempted = false,
    finalReady = false,
    consumed = false;
  function assertCurrent(value) {
    guard.check();
    guard.verifyRuntimePID(runtime.metadata.processId);
    assert.equal(
      runtime.metadata.periodicSocketAudit.failure,
      null,
      "SOLANA_CANDIDATE_SOCKET_AUDIT_FAILED",
    );
    assert.equal(
      value,
      prepared,
      "SOLANA_CANDIDATE_ORIGINAL_PREPARATION_REQUIRED",
    );
    assert.equal(
      JSON.stringify(value),
      preparedBytes,
      "SOLANA_CANDIDATE_PREPARED_CHANGED",
    );
    const matches = runtime.transfers.filter(
      (record) => record.nativeId === original.nativeId,
    );
    assert.equal(
      matches.length,
      1,
      "SOLANA_CANDIDATE_ORIGINAL_RECORD_REQUIRED",
    );
    const record = matches[0];
    assert.equal(
      record.route,
      route,
      "SOLANA_CANDIDATE_ORIGINAL_ROUTE_CHANGED",
    );
    assert.equal(
      record.genesis,
      runtime.genesis,
      "SOLANA_CANDIDATE_ORIGINAL_GENESIS_CHANGED",
    );
    assert.equal(
      record.phase,
      "BROADCAST_UNKNOWN",
      "SOLANA_CANDIDATE_DURABLE_ATTEMPT_REQUIRED",
    );
    assert.equal(
      record.broadcastAttempts,
      1,
      "SOLANA_CANDIDATE_DURABLE_ATTEMPT_REQUIRED",
    );
    assert.deepEqual(
      record.intent,
      prepared.intent,
      "SOLANA_CANDIDATE_ORIGINAL_INTENT_CHANGED",
    );
    for (const field of ["nativeId", "nativeWire", "transactionSHA256"])
      assert.equal(
        record[field],
        original[field],
        "SOLANA_CANDIDATE_ORIGINAL_WIRE_CHANGED",
      );
    const decoded = validateSolanaNonceBindingTransaction(
      original.nativeWire,
      prepared.intent,
    );
    assert.equal(
      decoded.signatureHex,
      original.nativeId,
      "SOLANA_CANDIDATE_ORIGINAL_SIGNATURE_CHANGED",
    );
    assert.equal(
      decoded.transactionSHA256,
      original.transactionSHA256,
      "SOLANA_CANDIDATE_ORIGINAL_HASH_CHANGED",
    );
    assert.equal(
      Buffer.from(original.nativeWire, "base64").subarray(65).toString("hex"),
      prepared.unsignedWire,
      "SOLANA_CANDIDATE_ORIGINAL_UNSIGNED_BYTES_CHANGED",
    );
    assert.ok(now() - started < 30_000, "SOLANA_CANDIDATE_FINAL_SEND_TOO_OLD");
  }
  return Object.freeze({
    async beforeSend(value) {
      assert.equal(asyncAttempted, false, "SOLANA_CANDIDATE_FINAL_SEND_ONCE");
      asyncAttempted = true;
      assertCurrent(value);
      finalReady = true;
    },
    assertBeforeSend(value) {
      assert.ok(finalReady && !consumed, "SOLANA_CANDIDATE_FINAL_SEND_ONCE");
      consumed = true;
      assertCurrent(value);
    },
  });
}

export async function prepareNonceRoutes(ports) {
  exactRecord(ports, [
    "routes",
    "solana",
    "config",
    "ownedCustodyRoute",
    "nonceForRoute",
    "hash",
    "encodeSolanaNonceBindingMessage",
    "copy",
    "noEffects",
    "runtime",
    "epoch",
  ]);
  const {
    routes,
    solana,
    config,
    ownedCustodyRoute,
    nonceForRoute,
    hash,
    encodeSolanaNonceBindingMessage,
    copy,
    noEffects,
    runtime,
    epoch,
  } = ports;
  const preparedRoutes = [],
    preparedByRoute = {};
  for (const route of routes) {
    const adapter = solana.adapter({ asset: config.nativeAsset, route }),
      roles = ownedCustodyRoute(route);
    const nonce = nonceForRoute(
      route,
      solana.nonceInfrastructureByAuthority,
      solana.roles,
    );
    const stop = Object.freeze(
      new Error("V3_PREFLIGHT_STOP_BEFORE_NATIVE_KEY"),
    );
    let reached = false,
      result;
    const unreachable = () =>
      assert.fail("V3_PREFLIGHT_CROSSED_NATIVE_KEY_BOUNDARY");
    const wireKeyCommitment = hash(route),
      callbacks = {
        async beforeSign(prepared) {
          assert.equal(reached, false);
          reached = true;
          assert.equal(prepared.genesis, config.nativeGenesis);
          assert.equal(
            prepared.intent.sourcePublicKey,
            solana.roles[roles.sourceRole].endpoint,
          );
          assert.equal(
            prepared.intent.recipientPublicKey,
            solana.roles[roles.destinationRole].endpoint,
          );
          assert.equal(
            prepared.intent.nonceAccountPublicKey,
            nonce.nonceAccountPublicKey,
          );
          assert.equal(
            prepared.funds.nonceAccount.authorityPublicKey,
            nonce.authorityPublicKey,
          );
          assert.equal(
            prepared.funds.nonceAccount.durableNonce,
            prepared.intent.durableNonce,
          );
          assert.equal(prepared.intent.lamports, "1000000");
          assert.equal(prepared.intent.wireKeyCommitment, wireKeyCommitment);
          assert.equal(
            prepared.unsignedWire,
            encodeSolanaNonceBindingMessage(prepared.intent),
          );
          assert.ok(
            BigInt(prepared.funds.feeLamports) > 0n &&
              BigInt(prepared.funds.feeLamports) <= BigInt(config.refundMaxFee),
          );
          await adapter.assertPrepared(prepared);
          result = copy(prepared);
          throw stop;
        },
        onSigned: unreachable,
        beforeBroadcast: unreachable,
        ...(route === "deposit"
          ? { beforeSend: unreachable, assertBeforeSend: unreachable }
          : {}),
      };
    let rejected;
    try {
      await adapter.transfer(
        { amount: "1000000", wireKeyCommitment },
        callbacks,
      );
    } catch (error) {
      rejected = error;
    }
    assert.equal(rejected, stop, "V3_PREFLIGHT_EXACT_PRESIGN_REJECTION");
    assert.equal(reached, true);
    noEffects();
    assert.deepEqual(
      runtime.ingressSendState,
      epoch,
      "V3_PREFLIGHT_EVM_MUTATED",
    );
    preparedByRoute[route] = result;
    preparedRoutes.push({
      route,
      unsignedPreparationRevalidated: true,
      stoppedBeforeNativeKey: true,
    });
  }
  return { preparedRoutes, preparedByRoute };
}
