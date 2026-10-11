/** Owns SOL transfer, retained first-send and resume ordering. The canonical
 * runtime privately supplies its lifecycle state, original maps, codecs and
 * authority controllers. Building another instance never grants runtime custody.
 * Observation/RPC and persistence remain with their original owners. */
import assert from "node:assert/strict";
import { exactRecord } from "@lianum/components/encoding/commitments";
import { cloneInput, frozenInput } from "@lianum/components/plain-input";
export const SOLANA_TRANSFER_DEPENDENCIES = Object.freeze([
  "combined",
  "custody",
  "records",
  "graphRecords",
  "signedPreparations",
  "preparationContexts",
  "roles",
  "genesis",
  "recipientAddresses",
  "PKCS8_ED25519",
  "performance",
  "close",
  "nonceObservations",
  "same",
  "originalKeyControllerV4",
  "payoutController",
  "endpoint",
  "usesNonce",
  "lamportsValue",
  "bytes32",
  "allRecords",
  "routeRecords",
  "sourceKey",
  "createPrivateKey",
  "sign",
  "encodeSolanaBindingMessage",
  "encodeSolanaNonceBindingMessage",
  "validateSolanaNonceBindingTransaction",
  "validateSolanaBindingTransaction",
  "assertOwnedCustodyIntent",
  "prepareAtCurrentHead",
  "healthy",
  "assertRetainedNonceRoute",
  "assertOriginalIngressUnobserved",
  "prepareNonceAtCurrentHead",
  "reservationReads",
  "handle",
  "persistNative",
  "base58Encode",
  "sendOwnedSolanaTransaction",
  "recordFor",
  "readPayoutAuditState",
  "assertSolanaNonceFirstSendState",
]);
export const SOLANA_TRANSFER_STATE = Object.freeze([
  "busy",
  "observationBusy",
  "inventoryBusy",
  "closed",
  "shuttingDown",
  "recoveryCapturing",
  "isolationFailure",
  "nativePersistenceFailure",
  "signingUnresolved",
  "activePrepared",
  "activeRoute",
  "preSignReadWindow",
  "preBroadcastReadWindow",
  "mutationGeneration",
]);
export function createSolanaTransfers(contracts) {
  assert.equal(arguments.length, 1);
  exactRecord(contracts, ["state", "dependencies"]);
  const { state, dependencies } = contracts;
  exactRecord(dependencies, SOLANA_TRANSFER_DEPENDENCIES);
  assert.deepEqual(
    Reflect.ownKeys(state).sort(),
    [...SOLANA_TRANSFER_STATE].sort(),
    "SOLANA_TRANSFER_LIFECYCLE_CONTRACT",
  );
  const {
    combined,
    custody,
    records,
    graphRecords,
    signedPreparations,
    preparationContexts,
    roles,
    genesis,
    recipientAddresses,
    PKCS8_ED25519,
    performance,
    close,
    nonceObservations,
    same,
    originalKeyControllerV4,
    payoutController,
    endpoint,
    usesNonce,
    lamportsValue,
    bytes32,
    allRecords,
    routeRecords,
    sourceKey,
    createPrivateKey,
    sign,
    encodeSolanaBindingMessage,
    encodeSolanaNonceBindingMessage,
    validateSolanaNonceBindingTransaction,
    validateSolanaBindingTransaction,
    assertOwnedCustodyIntent,
    prepareAtCurrentHead,
    healthy,
    assertRetainedNonceRoute,
    assertOriginalIngressUnobserved,
    prepareNonceAtCurrentHead,
    reservationReads,
    handle,
    persistNative,
    base58Encode,
    sendOwnedSolanaTransaction,
    recordFor,
    readPayoutAuditState,
    assertSolanaNonceFirstSendState,
  } = dependencies;
  const requireCondition = (condition, code) => {
    if (!condition) throw new Error(code);
  };
  function retainNonceObservation(prepared, selectedRoute, started) {
    if (!["refund", "redeem"].includes(selectedRoute.name)) return;
    requireCondition(
      !state.closed && !state.shuttingDown && !state.recoveryCapturing,
      "SOLANA_RUNTIME_CLOSED",
    );
    if (state.isolationFailure) throw state.isolationFailure;
    if (state.nativePersistenceFailure) throw state.nativePersistenceFailure;
    handle.assertAlive();
    nonceObservations.set(prepared, {
      started,
      prepared: frozenInput(cloneInput(prepared)),
      route: frozenInput(cloneInput(selectedRoute)),
      genesis,
      runtimeClose: close,
    });
  }
  function assertPayoutNativeObservation(record, prepared, phase) {
    const observation = nonceObservations.get(prepared);
    requireCondition(
      observation !== undefined && preparationContexts.has(prepared),
      "SOLANA_PAYOUT_FULL_NATIVE_OBSERVATION_REQUIRED",
    );
    requireCondition(
      observation.runtimeClose === close && observation.genesis === genesis,
      "SOLANA_PAYOUT_NATIVE_OBSERVATION_RUNTIME",
    );
    requireCondition(
      records.get(record.nativeId) === record &&
        signedPreparations.get(record.nativeId) === prepared &&
        prepared === state.activePrepared,
      "SOLANA_PAYOUT_ORIGINAL_PRIVATE_IDENTITY",
    );
    same(prepared, observation.prepared, "SOLANA_PAYOUT_PREPARATION_CHANGED");
    same(state.activeRoute, observation.route, "SOLANA_PAYOUT_ROUTE_CHANGED");
    requireCondition(
      record.route === observation.route.name &&
        record.sourceRole === observation.route.sourceRole &&
        record.recipientIndex === observation.route.recipientIndex,
      "SOLANA_PAYOUT_ORIGINAL_ROUTE",
    );
    assertRetainedNonceRoute(record);
    requireCondition(
      record.phase === phase &&
        record.broadcastAttempts === (phase === "SIGNED_NOT_BROADCAST" ? 0 : 1),
      "SOLANA_PAYOUT_ORIGINAL_ATTEMPT",
    );
    same(record.intent, prepared.intent, "SOLANA_PAYOUT_ORIGINAL_INTENT");
    requireCondition(
      record.genesis === genesis &&
        record.preparedFee === prepared.funds.feeLamports,
      "SOLANA_PAYOUT_ORIGINAL_GENESIS_OR_FEE",
    );
    const decoded = validateSolanaNonceBindingTransaction(
      record.nativeWire,
      prepared.intent,
    );
    requireCondition(
      decoded.signatureHex === record.nativeId &&
        decoded.transactionSHA256 === record.transactionSHA256 &&
        encodeSolanaNonceBindingMessage(prepared.intent) ===
          prepared.unsignedWire,
      "SOLANA_PAYOUT_ORIGINAL_BYTES",
    );
    const elapsed = performance.now() - observation.started;
    requireCondition(
      Number.isFinite(elapsed) && elapsed >= 0 && elapsed < 30_000,
      "SOLANA_PAYOUT_NATIVE_OBSERVATION_TOO_OLD",
    );
  }
  function assertPayoutTerminalWindows(prepared, authority) {
    const observation = nonceObservations.get(prepared),
      now = performance.now();
    const nativeElapsed = now - observation?.started,
      authorityElapsed = now - authority.originalAuditStarted;
    requireCondition(
      Number.isFinite(nativeElapsed) &&
        nativeElapsed >= 0 &&
        nativeElapsed < 30_000,
      "SOLANA_PAYOUT_NATIVE_OBSERVATION_TOO_OLD",
    );
    requireCondition(
      Number.isFinite(authorityElapsed) &&
        authorityElapsed >= 0 &&
        authorityElapsed < 30_000,
      "SOLANA_PAYOUT_ORIGINAL_AUTHORITY_TOO_OLD",
    );
  }
  async function transfer(selectedRoute, amount, wireKeyCommitment, callbacks) {
    const { recipientIndex } = selectedRoute;
    const nonce = usesNonce(selectedRoute);
    requireCondition(
      combined || custody === (selectedRoute.name !== null),
      "SOLANA_RUNTIME_ROUTE_PROFILE",
    );
    exactRecord(callbacks, [
      "beforeSign",
      "onSigned",
      ...(nonce ? ["beforeBroadcast"] : []),
      ...(nonce && selectedRoute.name === "deposit"
        ? ["beforeSend", "assertBeforeSend"]
        : []),
    ]);
    const beforeSign = callbacks.beforeSign,
      onSigned = callbacks.onSigned,
      beforeBroadcast = callbacks.beforeBroadcast;
    const beforeSend = callbacks.beforeSend,
      assertBeforeSend = callbacks.assertBeforeSend;
    requireCondition(
      typeof beforeSign === "function" && typeof onSigned === "function",
      "SOLANA_REQUIRED_SIGNING_CALLBACKS",
    );
    if (nonce)
      requireCondition(
        typeof beforeBroadcast === "function",
        "SOLANA_REQUIRED_BROADCAST_CALLBACK",
      );
    if (nonce && selectedRoute.name === "deposit")
      requireCondition(
        typeof beforeSend === "function" &&
          typeof assertBeforeSend === "function",
        "SOLANA_REQUIRED_INGRESS_FINAL_SEND_CALLBACKS",
      );
    lamportsValue(amount);
    bytes32(wireKeyCommitment, true);
    requireCondition(
      Number.isSafeInteger(recipientIndex) &&
        !Object.is(recipientIndex, -0) &&
        recipientIndex >= 0 &&
        recipientIndex < recipientAddresses.length,
      "SOLANA_INVALID_RECIPIENT_INDEX",
    );
    requireCondition(
      !state.busy &&
        !state.observationBusy &&
        !state.inventoryBusy &&
        !state.closed &&
        !state.shuttingDown &&
        !state.recoveryCapturing,
      "SOLANA_OPERATION_BUSY_OR_CLOSED",
    );
    requireCondition(
      !state.signingUnresolved,
      "SOLANA_PRIOR_SIGNING_UNRESOLVED",
    );
    requireCondition(
      !allRecords().some((record) => record.phase !== "OBSERVED_FINALIZED"),
      "SOLANA_PRIOR_TRANSFER_UNRESOLVED",
    );
    state.mutationGeneration++;
    state.busy = true;
    state.activeRoute = selectedRoute;
    let record, keyAuthorityV4, nativeKeyAuditStarted;
    try {
      state.activePrepared = await prepareAtCurrentHead(
        selectedRoute,
        amount,
        wireKeyCommitment,
      );
      if (selectedRoute.name !== null)
        assertOwnedCustodyIntent(
          selectedRoute.name,
          roles,
          "2",
          state.activePrepared.intent,
        );
      state.preSignReadWindow = true;
      try {
        const keyAck = await beforeSign(state.activePrepared);
        if (["refund", "redeem"].includes(selectedRoute.name)) {
          keyAuthorityV4 = keyAck;
          const observation = nonceObservations.get(state.activePrepared);
          requireCondition(
            observation &&
              observation.runtimeClose === close &&
              observation.genesis === genesis,
            "SOLANA_KEY_ORIGINAL_NATIVE_OBSERVATION",
          );
          same(
            state.activePrepared,
            observation.prepared,
            "SOLANA_KEY_NATIVE_PREPARATION_CHANGED",
          );
          same(
            state.activeRoute,
            observation.route,
            "SOLANA_KEY_NATIVE_ROUTE_CHANGED",
          );
          nativeKeyAuditStarted = observation.started;
        } else
          requireCondition(
            keyAck === undefined,
            "SOLANA_BEFORE_SIGN_CALLBACK_MUST_ASSERT",
          );
      } finally {
        state.preSignReadWindow = false;
      }
      requireCondition(
        !state.observationBusy && !state.inventoryBusy,
        "SOLANA_PRE_SIGN_OBSERVATION_NOT_AWAITED",
      );
      requireCondition(
        !state.closed && !state.shuttingDown && !state.recoveryCapturing,
        "SOLANA_RUNTIME_CLOSED",
      );
      if (state.isolationFailure) throw state.isolationFailure;
      if (state.nativePersistenceFailure) throw state.nativePersistenceFailure;
      handle.assertAlive();
      // Finish native codecs and key-object preparation before the final
      // one-use assertion. No await or costly work remains before Ed25519.
      const privateKey = createPrivateKey({
        key: Buffer.concat([PKCS8_ED25519, sourceKey(selectedRoute).seed]),
        type: "pkcs8",
        format: "der",
      });
      const message = Buffer.from(state.activePrepared.unsignedWire, "hex");
      if (["refund", "redeem"].includes(selectedRoute.name)) {
        requireCondition(
          (nonce
            ? encodeSolanaNonceBindingMessage
            : encodeSolanaBindingMessage)(state.activePrepared.intent) ===
            state.activePrepared.unsignedWire,
          "SOLANA_ORIGINAL_KEY_WIRE",
        );
        assertOwnedCustodyIntent(
          selectedRoute.name,
          roles,
          "2",
          state.activePrepared.intent,
        );
        requireCondition(
          !state.closed && !state.shuttingDown && !state.recoveryCapturing,
          "SOLANA_RUNTIME_CLOSED",
        );
        if (state.isolationFailure) throw state.isolationFailure;
        if (state.nativePersistenceFailure)
          throw state.nativePersistenceFailure;
        handle.assertAlive();
        const authorityAuditStarted =
          originalKeyControllerV4.consumeNativeClaimOriginalKeyAuthorityV4(
            keyAuthorityV4,
            "payout",
            close,
            genesis,
            selectedRoute.name,
            state.activePrepared,
          );
        const terminalNow = performance.now(),
          elapsed = terminalNow - nativeKeyAuditStarted;
        const authorityElapsed = terminalNow - authorityAuditStarted;
        requireCondition(
          Number.isFinite(authorityElapsed) &&
            authorityElapsed >= 0 &&
            authorityElapsed < 30_000,
          "SOLANA_KEY_ORIGINAL_AUTHORITY_TOO_OLD",
        );
        requireCondition(
          Number.isFinite(elapsed) && elapsed >= 0 && elapsed < 30_000,
          "SOLANA_KEY_NATIVE_OBSERVATION_TOO_OLD",
        );
      }
      state.signingUnresolved = true;
      const signature = sign(null, message, privateKey);
      const nativeWire = Buffer.concat([
        Buffer.from([1]),
        signature,
        message,
      ]).toString("base64");
      const decoded = (
          nonce
            ? validateSolanaNonceBindingTransaction
            : validateSolanaBindingTransaction
        )(nativeWire, state.activePrepared.intent),
        nativeId = decoded.signatureHex;
      requireCondition(
        !records.has(nativeId) && !graphRecords.has(nativeId),
        "SOLANA_SIGNED_IDENTITY_ALREADY_RECORDED",
      );
      record = {
        ...(selectedRoute.name !== null
          ? {
              route: selectedRoute.name,
              sourceRole: selectedRoute.sourceRole,
              preparedFee: state.activePrepared.funds.feeLamports,
            }
          : {}),
        genesis,
        nativeId,
        recipientIndex,
        intent: cloneInput(state.activePrepared.intent),
        nativeWire,
        transactionSHA256: decoded.transactionSHA256,
        phase: "SIGNED_NOT_BROADCAST",
        broadcastAttempts: 0,
        ...(nonce
          ? { failureObservation: null }
          : {
              lastValidBlockHeight:
                state.activePrepared.funds.lastValidBlockHeight,
            }),
        ...(selectedRoute.name === "deposit"
          ? {
              originalPreparedSlot: preparationContexts.get(
                state.activePrepared,
              ).slot,
              externalSubmissionObserved: false,
            }
          : {}),
        observation: null,
      };
      routeRecords(selectedRoute).set(nativeId, record);
      if (nonce) signedPreparations.set(nativeId, state.activePrepared);
      state.signingUnresolved = false;
      // Own local fsync plus the gate's durable custody record both precede
      // any send. A rejected callback leaves a known, never-resend identity.
      await persistNative(record);
      const signedPayload = frozenInput({ nativeWire });
      const signedAck =
        selectedRoute.name !== null
          ? await reservationReads.run(
              () => onSigned(signedPayload),
              () =>
                requireCondition(
                  !state.observationBusy && !state.inventoryBusy,
                  "SOLANA_SIGNED_READ_NOT_AWAITED",
                ),
            )
          : await onSigned(signedPayload);
      requireCondition(
        signedAck === undefined,
        "SOLANA_SIGNED_CALLBACK_MUST_ASSERT",
      );
      return await broadcastRetained(
        record,
        beforeBroadcast,
        beforeSend,
        assertBeforeSend,
      );
    } catch (error) {
      // Once signed, even a known unsent wire remains latched. No public
      // method can reset this map, regenerate a key or replay the transaction.
      if (record) error.nativeId = record.nativeId;
      throw error;
    } finally {
      state.activePrepared = null;
      state.activeRoute = null;
      state.preSignReadWindow = false;
      state.preBroadcastReadWindow = false;
      state.busy = false;
    }
  }
  async function broadcastRetained(
    record,
    beforeBroadcast,
    beforeSend = null,
    assertBeforeSend = null,
  ) {
    const nonce = usesNonce(state.activeRoute);
    await healthy();
    const payout = nonce && ["refund", "redeem"].includes(record.route);
    let broadcastGuardStarted, payoutAuthority;
    if (nonce) {
      assertRetainedNonceRoute(record);
      if (record.route === "deposit")
        await assertOriginalIngressUnobserved(record);
      assertSolanaNonceFirstSendState({
        route: record.route,
        phase: record.phase,
        broadcastAttempts: record.broadcastAttempts,
        signingUnresolved: state.signingUnresolved,
        nativeId: record.nativeId,
        transactionSHA256: record.transactionSHA256,
        nativeWire: record.nativeWire,
        intent: record.intent,
        unsignedWire: state.activePrepared.unsignedWire,
      });
      requireCondition(
        typeof beforeBroadcast === "function",
        "SOLANA_REQUIRED_BROADCAST_CALLBACK",
      );
      await prepareNonceAtCurrentHead(
        state.activeRoute,
        record.intent.lamports,
        record.intent.wireKeyCommitment,
        state.activePrepared,
      );
      state.preBroadcastReadWindow = true;
      broadcastGuardStarted = performance.now();
      try {
        const ack = await reservationReads.run(
          () => beforeBroadcast(state.activePrepared),
          () =>
            requireCondition(
              !state.observationBusy && !state.inventoryBusy,
              "SOLANA_BROADCAST_READ_NOT_AWAITED",
            ),
        );
        if (payout) {
          assertPayoutNativeObservation(
            record,
            state.activePrepared,
            "SIGNED_NOT_BROADCAST",
          );
          payoutAuthority =
            payoutController.openNativeClaimSolanaPayoutAuthority(
              ack,
              close,
              genesis,
              state.activePrepared,
              record,
            );
        } else
          requireCondition(
            ack === undefined,
            "SOLANA_BROADCAST_CALLBACK_MUST_ASSERT",
          );
      } finally {
        state.preBroadcastReadWindow = false;
      }
      if (record.route === "deposit")
        await assertOriginalIngressUnobserved(record);
      if (!payout)
        requireCondition(
          performance.now() - broadcastGuardStarted < 30_000,
          "SOLANA_BROADCAST_AUDIT_TOO_OLD",
        );
      requireCondition(
        !state.closed && !state.shuttingDown && !state.recoveryCapturing,
        "SOLANA_RUNTIME_CLOSED",
      );
      if (state.isolationFailure) throw state.isolationFailure;
      if (state.nativePersistenceFailure) throw state.nativePersistenceFailure;
      handle.assertAlive();
    }
    if (payout) {
      assertPayoutNativeObservation(
        record,
        state.activePrepared,
        "SIGNED_NOT_BROADCAST",
      );
      assertPayoutTerminalWindows(state.activePrepared, payoutAuthority);
    }
    let assertLatchContinuation;
    if (payout) {
      const expected = cloneInput(readPayoutAuditState());
      requireCondition(
        records.get(record.nativeId) === record &&
          record.phase === "SIGNED_NOT_BROADCAST" &&
          record.broadcastAttempts === 0,
        "SOLANA_LATCH_ORIGINAL_RECORD_REQUIRED",
      );
      for (const name of ["transfers", "custodyTransfers"]) {
        const matches = expected[name].filter(
          (item) => item.nativeId === record.nativeId,
        );
        requireCondition(matches.length === 1, "SOLANA_LATCH_EXACT_RECORD");
        matches[0].phase = "BROADCAST_UNKNOWN";
        matches[0].broadcastAttempts = 1;
      }
      requireCondition(
        !expected.graphTransfers.some(
          (item) => item.nativeId === record.nativeId,
        ),
        "SOLANA_LATCH_WRONG_NAMESPACE",
      );
      let consumed = false;
      assertLatchContinuation = () => {
        requireCondition(!consumed, "SOLANA_LATCH_CONTINUATION_USED");
        consumed = true;
        requireCondition(
          records.get(record.nativeId) === record,
          "SOLANA_LATCH_ORIGINAL_RECORD_CHANGED",
        );
        same(
          readPayoutAuditState(),
          expected,
          "SOLANA_LATCH_UNEXPECTED_NATIVE_STATE_CHANGE",
        );
      };
    }
    if (payout)
      assertPayoutTerminalWindows(state.activePrepared, payoutAuthority);
    record.phase = "BROADCAST_UNKNOWN";
    record.broadcastAttempts = 1;
    await persistNative(record); // The latch precedes the sole possible send.
    try {
      if (payout) {
        // Only fixed assertions returned by the genuine original token run.
        // No caller callback may substitute authority after its completion.
        await payoutAuthority.beforeSend(state.activePrepared);
      } else if (nonce) {
        requireCondition(
          typeof beforeSend === "function" &&
            typeof assertBeforeSend === "function",
          record.route === "deposit"
            ? "SOLANA_REQUIRED_INGRESS_FINAL_SEND_CALLBACKS"
            : "SOLANA_REQUIRED_PAYOUT_FINAL_SEND_CALLBACKS",
        );
        // Native history/preparation and latch fsync are already complete.
        // The owned controller now checks its original completed authorization,
        // EVM head and keeper. Payouts cannot collect or sign again here.
        requireCondition(
          (await beforeSend(state.activePrepared)) === undefined,
          "SOLANA_FINAL_SEND_ASSERT_ONLY",
        );
        // This is deliberately synchronous: a returned Promise rejects.
        requireCondition(
          assertBeforeSend(state.activePrepared) === undefined,
          "SOLANA_FINAL_SEND_SYNC_ASSERT_ONLY",
        );
      }
      // Fsync can yield while shutdown or socket isolation fails. Recheck
      // synchronously after it; no await/RPC intervenes before the sole send.
      requireCondition(
        !state.closed && !state.shuttingDown && !state.recoveryCapturing,
        "SOLANA_RUNTIME_CLOSED",
      );
      if (state.isolationFailure) throw state.isolationFailure;
      if (state.nativePersistenceFailure) throw state.nativePersistenceFailure;
      handle.assertAlive();
      if (payout) {
        assertPayoutNativeObservation(
          record,
          state.activePrepared,
          "BROADCAST_UNKNOWN",
        );
        payoutAuthority.assertBeforeSend(state.activePrepared);
        assertLatchContinuation();
        // Full synchronous codec/identity checks above may themselves consume
        // time. Check both original starts at one final owned-clock instant.
        assertPayoutTerminalWindows(state.activePrepared, payoutAuthority);
      } else if (nonce)
        requireCondition(
          performance.now() - broadcastGuardStarted < 30_000,
          "SOLANA_BROADCAST_AUDIT_TOO_OLD",
        );
      const returned = await sendOwnedSolanaTransaction(
        endpoint,
        record.nativeWire,
      );
      requireCondition(
        returned === base58Encode(Buffer.from(record.nativeId, "hex")),
        "SOLANA_BROADCAST_SIGNATURE_MISMATCH",
      );
      record.phase = "BROADCAST";
      await persistNative(record);
      return {
        nativeId: record.nativeId,
        transactionSHA256: record.transactionSHA256,
      };
    } catch (cause) {
      record.broadcastFailure = {
        category: /^SOLANA_RPC_[A-Z_]+$/.test(cause.message ?? "")
          ? cause.message
          : "SOLANA_RPC_RESPONSE_UNAVAILABLE",
        rpcCode: Number.isSafeInteger(cause.rpcCode) ? cause.rpcCode : null,
      };
      await persistNative(record);
      const error = new Error(
        "SOLANA_BROADCAST_UNKNOWN_OBSERVE_EXACT_SIGNATURE",
        { cause },
      );
      error.nativeId = record.nativeId;
      throw error;
    }
  }
  async function resumeReservedPayout(selectedRoute, raw, callbacks) {
    const request = cloneInput(raw);
    exactRecord(request, ["nativeId"]);
    exactRecord(callbacks, ["beforeBroadcast"]);
    const { beforeBroadcast } = callbacks;
    requireCondition(
      typeof beforeBroadcast === "function",
      "SOLANA_REQUIRED_BROADCAST_CALLBACK",
    );
    requireCondition(
      usesNonce(selectedRoute) &&
        ["refund", "redeem"].includes(selectedRoute.name),
      "SOLANA_NONCE_PAYOUT_ROUTE_REQUIRED",
    );
    requireCondition(
      !state.busy &&
        !state.observationBusy &&
        !state.inventoryBusy &&
        !state.closed &&
        !state.shuttingDown &&
        !state.recoveryCapturing,
      "SOLANA_OPERATION_BUSY_OR_CLOSED",
    );
    const record = recordFor(request.nativeId),
      prepared = signedPreparations.get(request.nativeId);
    requireCondition(
      prepared !== undefined,
      "SOLANA_ORIGINAL_PREPARATION_UNAVAILABLE",
    );
    requireCondition(
      record.route === selectedRoute.name &&
        record.recipientIndex === selectedRoute.recipientIndex,
      "SOLANA_OTHER_ROUTE",
    );
    assertSolanaNonceFirstSendState({
      route: record.route,
      phase: record.phase,
      broadcastAttempts: record.broadcastAttempts,
      signingUnresolved: state.signingUnresolved,
      nativeId: record.nativeId,
      transactionSHA256: record.transactionSHA256,
      nativeWire: record.nativeWire,
      intent: record.intent,
      unsignedWire: prepared.unsignedWire,
    });
    requireCondition(
      !allRecords().some(
        (other) => other !== record && other.phase !== "OBSERVED_FINALIZED",
      ),
      "SOLANA_PRIOR_TRANSFER_UNRESOLVED",
    );
    state.mutationGeneration++;
    state.busy = true;
    state.activeRoute = selectedRoute;
    state.activePrepared = prepared;
    try {
      return await broadcastRetained(record, beforeBroadcast);
    } catch (error) {
      error.nativeId = record.nativeId;
      throw error;
    } finally {
      state.activePrepared = null;
      state.activeRoute = null;
      state.preBroadcastReadWindow = false;
      state.busy = false;
    }
  }
  async function resumeReservedIngress(selectedRoute, raw, callbacks) {
    const request = cloneInput(raw);
    exactRecord(request, ["nativeId"]);
    exactRecord(callbacks, [
      "beforeBroadcast",
      "beforeSend",
      "assertBeforeSend",
    ]);
    requireCondition(
      selectedRoute.name === "deposit" && usesNonce(selectedRoute),
      "SOLANA_NONCE_INGRESS_ROUTE_REQUIRED",
    );
    requireCondition(
      typeof callbacks.beforeBroadcast === "function" &&
        typeof callbacks.beforeSend === "function" &&
        typeof callbacks.assertBeforeSend === "function",
      "SOLANA_REQUIRED_INGRESS_FINAL_SEND_CALLBACKS",
    );
    requireCondition(
      !state.busy &&
        !state.observationBusy &&
        !state.inventoryBusy &&
        !state.closed &&
        !state.shuttingDown &&
        !state.recoveryCapturing,
      "SOLANA_OPERATION_BUSY_OR_CLOSED",
    );
    const record = recordFor(request.nativeId),
      prepared = signedPreparations.get(request.nativeId);
    requireCondition(
      record.route === "deposit" &&
        record.recipientIndex === selectedRoute.recipientIndex,
      "SOLANA_OTHER_ROUTE",
    );
    requireCondition(
      prepared !== undefined && preparationContexts.has(prepared),
      "SOLANA_ORIGINAL_PREPARATION_UNAVAILABLE",
    );
    requireCondition(
      !allRecords().some(
        (other) => other !== record && other.phase !== "OBSERVED_FINALIZED",
      ),
      "SOLANA_PRIOR_TRANSFER_UNRESOLVED",
    );
    // Fence concurrency before any await. Observations precede recovery and
    // retain a permanent external-submission fence even for nonfinal status.
    state.mutationGeneration++;
    state.busy = true;
    state.activeRoute = selectedRoute;
    state.activePrepared = prepared;
    try {
      await assertOriginalIngressUnobserved(record);
      assertSolanaNonceFirstSendState({
        route: record.route,
        phase: record.phase,
        broadcastAttempts: record.broadcastAttempts,
        signingUnresolved: state.signingUnresolved,
        nativeId: record.nativeId,
        transactionSHA256: record.transactionSHA256,
        nativeWire: record.nativeWire,
        intent: record.intent,
        unsignedWire: prepared.unsignedWire,
      });
      return await broadcastRetained(
        record,
        callbacks.beforeBroadcast,
        callbacks.beforeSend,
        callbacks.assertBeforeSend,
      );
    } catch (error) {
      error.nativeId = record.nativeId;
      throw error;
    } finally {
      state.activePrepared = null;
      state.activeRoute = null;
      state.preBroadcastReadWindow = false;
      state.busy = false;
    }
  }
  return Object.freeze({
    transfer,
    resumeReservedPayout,
    resumeReservedIngress,
    retainNonceObservation,
    assertPayoutNativeObservation,
  });
}
