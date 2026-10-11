import {
  originalActorExactV1 as exact,
  originalActorFrameDataV1 as frameData,
} from "../../operations/recovery/source-journal/checkpoint-reconciliation-v1.mjs";

/** Private same-realm bootstrap only. Public platform HTTP is not connected.
 * Holds original session/approval/owner references; no factories or callbacks.
 * Diagnostics and separately consented account/pool state use the same opaque
 * originals. No GRAPH, prepare, execute, recover, restart or adoption. */
import { types } from "node:util";
import { randomBytes, createPublicKey, verify } from "node:crypto";

import { genericAccountIdentity, sha } from "@lianum/engine/accounts/journal";

import { normalizeMobileOrigin } from "@lianum/mobile-protocol";
import {
  ORIGINAL_ACCOUNT_ACCESS_PROFILE_V2,
  ORIGINAL_ACCOUNT_REVIEW_PROFILE_V2,
  ORIGINAL_ACCOUNT_REVIEW_TTL_MS,
  normalizeOriginalAccountAccessV2,
  normalizeOriginalAccountReviewV2,
  normalizeOriginalAccountSignatureV2,
  validateOriginalAccountFreshV2,
  originalAccountAccessMessageV2,
  originalAccountReviewMessageV2,
} from "@lianum/mobile-protocol/original-account-v2";
import {
  privateStateAccessFrameV1,
  privateStateReviewFrameV1,
  normalizePrivateStateAccessV1,
  normalizePrivateStateReviewV1,
  privateStateAccessMessageV1,
  privateStateReviewMessageV1,
  PRIVATE_STATE_SCOPE_V1,
  PRIVATE_STATE_OBSERVATION_V1,
  normalizePrivateStateObservationV1,
  validatePrivateStateFreshV1,
} from "@lianum/mobile-protocol/original-account-private-state-v1";
import { exactRecord } from "@lianum/components/encoding/commitments";

/** An isolated actor family. Only the closed lifecycle composition owns the
 * instance admitted by canonical guards. Source/economic tokens are consumed
 * through fixed contracts; no private map or issuer is exposed. */
export function buildPairedOriginalAccountActorV2(contracts) {
  exactRecord(contracts, ["session", "account", "economic", "source"]);
  exactRecord(contracts.session, [
    "assertFlatAccountSession",
    "flatManualNativeNoteActionTarget",
  ]);
  const { assertFlatAccountSession, flatManualNativeNoteActionTarget } =
    contracts.session;
  for (const method of [
    assertFlatAccountSession,
    flatManualNativeNoteActionTarget,
  ])
    if (typeof method !== "function")
      throw new TypeError("MOBILE_ORIGINAL_ACTOR_FIXED_CONTRACT");
  exactRecord(contracts.account, [
    "nativeValueAccountManualNoteDetails",
    "assertOwnedNativeValueAccountAuthority",
    "nativeValueOriginalRecoverySourceV1FromAccount",
  ]);
  const {
    nativeValueAccountManualNoteDetails,
    assertOwnedNativeValueAccountAuthority,
    nativeValueOriginalRecoverySourceV1FromAccount,
  } = contracts.account;
  for (const method of [
    nativeValueAccountManualNoteDetails,
    assertOwnedNativeValueAccountAuthority,
    nativeValueOriginalRecoverySourceV1FromAccount,
  ])
    if (typeof method !== "function")
      throw new TypeError("MOBILE_ORIGINAL_ACTOR_FIXED_CONTRACT");
  exactRecord(contracts.economic, [
    "assertNativeEconomicRecoveryCaptureV1",
    "nativeEconomicRecoverySectionIdentityV1",
    "consumeNativeEconomicRecoverySectionV1",
  ]);
  const {
    assertNativeEconomicRecoveryCaptureV1,
    nativeEconomicRecoverySectionIdentityV1,
    consumeNativeEconomicRecoverySectionV1,
  } = contracts.economic;
  for (const method of [
    assertNativeEconomicRecoveryCaptureV1,
    nativeEconomicRecoverySectionIdentityV1,
    consumeNativeEconomicRecoverySectionV1,
  ])
    if (typeof method !== "function")
      throw new TypeError("MOBILE_ORIGINAL_ACTOR_FIXED_CONTRACT");
  exactRecord(contracts.source, [
    "nativeSourceRecoveryOriginalReferenceV1",
    "nativeSourceRecoverySectionIdentityV1",
    "retainOriginalNativeSourceSectionV1",
    "consumeOriginalNativeSourceSectionV1",
    "resumeOriginalNativeSourceSectionV1",
    "updateOriginalNativeSourceSectionV1",
  ]);
  const {
    nativeSourceRecoveryOriginalReferenceV1,
    nativeSourceRecoverySectionIdentityV1,
    retainOriginalNativeSourceSectionV1,
    consumeOriginalNativeSourceSectionV1,
    resumeOriginalNativeSourceSectionV1,
    updateOriginalNativeSourceSectionV1,
  } = contracts.source;
  for (const method of [
    nativeSourceRecoveryOriginalReferenceV1,
    nativeSourceRecoverySectionIdentityV1,
    retainOriginalNativeSourceSectionV1,
    consumeOriginalNativeSourceSectionV1,
    resumeOriginalNativeSourceSectionV1,
    updateOriginalNativeSourceSectionV1,
  ])
    if (typeof method !== "function")
      throw new TypeError("MOBILE_ORIGINAL_ACTOR_FIXED_CONTRACT");
  const pairings = new WeakMap(),
    actorBrands = new WeakMap();
  const fail = (code) => {
    throw Object.assign(new Error(code), { code });
  };
  const need = (value, code) => {
    if (!value) fail(code);
  };
  const hex = () => randomBytes(32).toString("hex");
  function key(value) {
    need(
      typeof value === "string" &&
        /^04[0-9a-f]{128}$/.exec(value)?.[0] === value,
      "MOBILE_ORIGINAL_PUBLIC_KEY",
    );
    return createPublicKey({
      format: "jwk",
      key: {
        kty: "EC",
        crv: "secp256k1",
        x: Buffer.from(value.slice(2, 66), "hex").toString("base64url"),
        y: Buffer.from(value.slice(66), "hex").toString("base64url"),
      },
    });
  }
  /** Pairing is a local operator action over retained opaque originals, never a
   * pairingId/publicKey lookup or a challenge request received from HTTP. */
  async function createPairedOriginalAccountActorV2(input) {
    need(arguments.length === 1, "MOBILE_ORIGINAL_ACTOR_ARGUMENTS");
    return createOriginalActor(input, null);
  }
  async function createOriginalActor(input, recovery) {
    exact(input, ["session", "approval", "owner", "origin", "devicePublicKey"]);
    const { session, approval, owner, origin, devicePublicKey } = input;
    normalizeMobileOrigin(origin);
    const device = key(devicePublicKey);
    assertFlatAccountSession(session);
    const initial = nativeValueAccountManualNoteDetails(approval),
      account = initial.account;
    const requestId = initial.body.requestId,
      bodySHA256 = sha(initial.body),
      reviewSHA256 = sha(initial.review);
    need(
      ["TOP_UP", "EXIT"].includes(initial.body.kind),
      "MOBILE_ORIGINAL_NOTE_ONLY",
    );
    const original = () => {
      assertFlatAccountSession(session);
      const details = nativeValueAccountManualNoteDetails(approval);
      need(
        details.account === account &&
          sha(details.body) === bodySHA256 &&
          sha(details.review) === reviewSHA256,
        "MOBILE_ORIGINAL_BINDING_CHANGED",
      );
      assertOwnedNativeValueAccountAuthority(account, { owner });
      need(
        flatManualNativeNoteActionTarget(session, "reconcile", {
          requestId,
        }) === approval,
        "MOBILE_ORIGINAL_SESSION_APPROVAL",
      );
      const identity = sha(genericAccountIdentity(account.config));
      need(
        details.review.accountIdentitySHA256 === identity &&
          details.review.generationId === identity &&
          details.review.originalAccountLifetime === account.config.lifetime,
        "MOBILE_ORIGINAL_ACCOUNT_LIFETIME",
      );
      return details;
    };
    original();
    const pairingId = recovery?.pairingId ?? hex(),
      accesses = new Map(),
      reviews = new Map(),
      stateAccesses = new Map(),
      stateReviews = new Map();
    let busy = false,
      closed = false,
      capturing = false,
      captureIdentity = null,
      captured = false,
      sourceHandle = null,
      sourceWrapper = null,
      sourceBusy = false,
      sourceClosing = false,
      sourceWork = null,
      sourceFault = false;
    function sourceSeed() {
      const rows = (map) =>
        [...map].map(([id, row]) => ({
          id,
          value: structuredClone(row.value),
          consumed: row.consumed,
        }));
      return {
        schema: "ORIGINAL_NATIVE_ACTOR_SOURCE_SEED_V1",
        origin,
        pairingId,
        devicePublicKey,
        initial: structuredClone({
          body: initial.body,
          review: initial.review,
        }),
        challenges: {
          accesses: rows(accesses),
          reviews: rows(reviews),
          stateAccesses: rows(stateAccesses),
          stateReviews: rows(stateReviews),
        },
      };
    }
    async function sourceCheckpoint(candidate) {
      if (sourceHandle) {
        const next = { ...sourceWrapper, confirmed: sourceSeed(), candidate };
        await updateOriginalNativeSourceSectionV1(sourceHandle, next);
        sourceWrapper = next;
      }
    }
    function live() {
      need(
        !closed && !capturing && !sourceFault,
        "MOBILE_ORIGINAL_ACTOR_CLOSED",
      );
      original();
    }
    async function binding(action) {
      live();
      const journal = await session.snapshot();
      live();
      need(
        journal.available &&
          journal.storageAvailable &&
          journal.observation === "CURRENT" &&
          !journal.busy &&
          journal.queued === 0,
        "MOBILE_ORIGINAL_SESSION_UNAVAILABLE",
      );
      const rows = journal.requests.filter(
        (row) => row.requestId === requestId,
      );
      need(
        rows.length === 1 &&
          rows[0].kind === initial.body.kind &&
          ["PREPARED", "UNKNOWN", "CONFIRMED"].includes(rows[0].state),
        "MOBILE_ORIGINAL_ALREADY_ADMITTED_REQUIRED",
      );
      const details = original(),
        status = await account.privateStatus();
      live();
      const operations = status.operations.filter(
        (row) => row.ownerOperationRef === initial.body.ownerOperationRef,
      );
      need(operations.length === 1, "MOBILE_ORIGINAL_OPERATION_REQUIRED");
      const operation = operations[0];
      need(
        operation.request !== null &&
          Object.keys(initial.body).every(
            (name) => operation.request[name] === initial.body[name],
          ) &&
          sha(operation.nativeManualReview) === details.review.termsSHA256 &&
          ["READY", "UNKNOWN", "CONFIRMED"].includes(operation.stage),
        "MOBILE_ORIGINAL_OPERATION_CHANGED",
      );
      if (action === "reconcile")
        need(
          ["UNKNOWN", "CONFIRMED"].includes(rows[0].state) &&
            ["UNKNOWN", "CONFIRMED"].includes(operation.stage) &&
            operation.submission?.dispatchLatched === true &&
            typeof operation.submission.transactionHash === "string",
          "MOBILE_ORIGINAL_RECONCILE_NOT_STARTED",
        );
      const process = await owner.publicView.summary();
      live();
      const terms = details.review.terms;
      need(
        process.closed === false &&
          process.identitySHA256 === terms.ownerIdentitySHA256 &&
          process.keyScopeSHA256 === terms.keyScopeSHA256 &&
          process.processIdentitySHA256 === terms.processIdentitySHA256 &&
          Number.isSafeInteger(process.processGeneration) &&
          process.processGeneration >= terms.processGeneration,
        "MOBILE_ORIGINAL_OWNER_SCOPE_CHANGED",
      );
      const finalJournal = await session.snapshot();
      live();
      const finalRow = finalJournal.requests.find(
        (row) => row.requestId === requestId,
      );
      need(
        finalJournal.available &&
          finalJournal.storageAvailable &&
          finalJournal.observation === "CURRENT" &&
          !finalJournal.busy &&
          finalJournal.queued === 0 &&
          finalJournal.revision === journal.revision &&
          finalRow?.kind === rows[0].kind &&
          finalRow.state === rows[0].state,
        "MOBILE_ORIGINAL_REVIEW_STALE",
      );
      const asset = terms.asset;
      return {
        accountIdentitySHA256: details.review.accountIdentitySHA256,
        originalAccountLifetime: details.review.originalAccountLifetime,
        generationId: details.review.generationId,
        requestId,
        kind: initial.body.kind,
        ownerOperationRef: initial.body.ownerOperationRef,
        assetId: initial.body.assetId,
        ownerIdentitySHA256: terms.ownerIdentitySHA256,
        keyScopeSHA256: terms.keyScopeSHA256,
        processIdentitySHA256: terms.processIdentitySHA256,
        originalProcessGeneration: terms.processGeneration,
        observedProcessGeneration: process.processGeneration,
        originalReviewSHA256: reviewSHA256,
        termsSHA256: details.review.termsSHA256,
        requestBindingSHA256: operation.request.bindingSHA256,
        assetBindingSHA256: operation.request.assetBindingSHA256,
        journalRevision: journal.revision,
        requestState: rows[0].state,
        authorityStage: operation.stage,
        submission: operation.submission
          ? {
              transactionHash: operation.submission.transactionHash,
              calldataSHA256: operation.submission.calldataSHA256,
              dispatchLatched: operation.submission.dispatchLatched,
            }
          : null,
        asset: {
          chainId: asset.chainId,
          genesis: asset.genesis,
          pool: asset.pool,
          kind: asset.kind,
          token: asset.token,
          symbol: asset.symbol,
          decimals: asset.decimals,
        },
        amountAtomic: terms.amount,
        recipient: terms.recipient,
        role: terms.role,
        custody: "LINUX_ORIGINAL_OWNER_CUSTODY",
        publicNetwork: false,
        mobileNoteCustody: false,
        economicObservation: false,
      };
    }
    await binding("read");
    // No actor or challenge has escaped yet. A failed initial observation leaves
    // no pairing claim. This synchronous recheck/claim gives concurrent creation
    // exactly one winner while preserving exclusivity after an actor is issued.
    original();
    let retained = pairings.get(session);
    if (!retained) pairings.set(session, (retained = new WeakSet()));
    need(!retained.has(approval), "MOBILE_ORIGINAL_ALREADY_PAIRED");
    retained.add(approval);
    function capacity(map) {
      for (const [id, row] of map)
        if (row.consumed || row.value.expiresAt <= Date.now()) map.delete(id);
      need(map.size < 4, "MOBILE_ORIGINAL_CHALLENGE_CAPACITY");
    }
    function authenticate(input, normalizer, message, map, field) {
      exact(input, [field, "signature"]);
      const value = validateOriginalAccountFreshV2(
        normalizer(frameData(input[field])),
      );
      const signature = normalizeOriginalAccountSignatureV2(input.signature),
        retained = map.get(value.challengeId);
      need(
        retained &&
          !retained.consumed &&
          JSON.stringify(retained.value) === JSON.stringify(value) &&
          value.origin === origin &&
          value.pairingId === pairingId &&
          value.devicePublicKey === devicePublicKey,
        "MOBILE_ORIGINAL_CHALLENGE_CHANGED",
      );
      need(
        verify(
          "sha256",
          message(value),
          { key: device, dsaEncoding: "ieee-p1363" },
          Buffer.from(signature, "hex"),
        ),
        "MOBILE_ORIGINAL_SIGNATURE_INVALID",
      );
      retained.consumed = true;
      return value;
    }
    let actor = Object.freeze({
      /** The generic nonce reveals no account or operation. The following signed
       * bootstrap permission is required before any private review is returned. */
      challenge(input) {
        need(
          arguments.length === 1 && !busy && !closed && !capturing,
          "MOBILE_ORIGINAL_ACTOR_UNAVAILABLE",
        );
        exact(input, ["action"]);
        need(
          ["read", "reconcile"].includes(input.action),
          "MOBILE_ORIGINAL_ACTION",
        );
        capacity(accesses);
        const value = normalizeOriginalAccountAccessV2({
          version: 2,
          profile: ORIGINAL_ACCOUNT_ACCESS_PROFILE_V2,
          origin,
          pairingId,
          challengeId: hex(),
          nonce: hex(),
          expiresAt: Date.now() + ORIGINAL_ACCOUNT_REVIEW_TTL_MS,
          devicePublicKey,
          action: input.action,
        });
        accesses.set(value.challengeId, { value, consumed: false });
        return structuredClone(value);
      },
      async openReview(input) {
        need(
          arguments.length === 1 && !busy && !closed && !capturing,
          "MOBILE_ORIGINAL_ACTOR_UNAVAILABLE",
        );
        busy = true;
        try {
          const access = authenticate(
            input,
            normalizeOriginalAccountAccessV2,
            originalAccountAccessMessageV2,
            accesses,
            "challenge",
          );
          const selected = await binding(access.action);
          live();
          validateOriginalAccountFreshV2(access);
          capacity(reviews);
          const value = normalizeOriginalAccountReviewV2({
            version: 2,
            profile: ORIGINAL_ACCOUNT_REVIEW_PROFILE_V2,
            origin,
            pairingId,
            challengeId: hex(),
            nonce: hex(),
            expiresAt: Date.now() + ORIGINAL_ACCOUNT_REVIEW_TTL_MS,
            devicePublicKey,
            action: access.action,
            bootstrapChallengeId: access.challengeId,
            binding: selected,
          });
          reviews.set(value.challengeId, { value, consumed: false });
          return structuredClone(value);
        } finally {
          busy = false;
        }
      },
      async submit(input) {
        need(
          arguments.length === 1 && !busy && !closed && !capturing,
          "MOBILE_ORIGINAL_ACTOR_UNAVAILABLE",
        );
        busy = true;
        try {
          const review = authenticate(
            input,
            normalizeOriginalAccountReviewV2,
            originalAccountReviewMessageV2,
            reviews,
            "review",
          );
          const selected = await binding(review.action);
          live();
          need(
            JSON.stringify(selected) === JSON.stringify(review.binding),
            "MOBILE_ORIGINAL_REVIEW_STALE",
          );
          validateOriginalAccountFreshV2(review);
          original();
          let admission = null;
          if (review.action === "reconcile") {
            // This may write original custody acknowledgements/checkpoints. The
            // genuine coordinator returns cached terminal entries when CONFIRMED;
            // neither branch is treated here as new canonical balance evidence.
            admission = session.reconcile(requestId);
            const completed = await session.idle();
            live();
            const row = completed.admissions.find(
              (value) => value.sequence === admission.sequence,
            );
            need(
              row?.action === "reconcile" && row.requestId === requestId,
              "MOBILE_ORIGINAL_ADMISSION_CHANGED",
            );
            admission = {
              ...admission,
              state: row.state,
              errorCode: row.errorCode,
            };
          }
          const observed = await binding("read");
          live();
          return {
            version: 2,
            profile: "PAIRED_ORIGINAL_ACCOUNT_DIAGNOSTIC_V2",
            action: review.action,
            binding: observed,
            admission,
            privatePortfolio: null,
            economicObservation: null,
            noteCustodyOnDevice: false,
            nativeEffectsEstablished: false,
          };
        } finally {
          busy = false;
        }
      },
      /** A distinct permission asks for the account/pool balance. Existing
       * diagnostic nonces/signatures never authorize private financial state. */
      privateStateChallenge() {
        need(
          arguments.length === 0 && !busy && !closed && !capturing,
          "MOBILE_ORIGINAL_ACTOR_UNAVAILABLE",
        );
        live();
        capacity(stateAccesses);
        const value = normalizeOriginalAccountAccessV2({
          version: 2,
          profile: ORIGINAL_ACCOUNT_ACCESS_PROFILE_V2,
          origin,
          pairingId,
          challengeId: hex(),
          nonce: hex(),
          expiresAt: Date.now() + ORIGINAL_ACCOUNT_REVIEW_TTL_MS,
          devicePublicKey,
          action: "read",
        });
        stateAccesses.set(value.challengeId, { value, consumed: false });
        return structuredClone(privateStateAccessFrameV1(value));
      },
      async openPrivateStateReview(input) {
        need(
          arguments.length === 1 && !busy && !closed && !capturing,
          "MOBILE_ORIGINAL_ACTOR_UNAVAILABLE",
        );
        busy = true;
        try {
          exact(input, ["challenge", "signature"]);
          const inner = normalizePrivateStateAccessV1(
            frameData(input.challenge),
          ).challenge;
          const access = authenticate(
            { challenge: inner, signature: input.signature },
            normalizeOriginalAccountAccessV2,
            privateStateAccessMessageV1,
            stateAccesses,
            "challenge",
          );
          const selected = await binding("read");
          live();
          validateOriginalAccountFreshV2(access);
          capacity(stateReviews);
          const value = normalizeOriginalAccountReviewV2({
            version: 2,
            profile: ORIGINAL_ACCOUNT_REVIEW_PROFILE_V2,
            origin,
            pairingId,
            challengeId: hex(),
            nonce: hex(),
            expiresAt: Date.now() + ORIGINAL_ACCOUNT_REVIEW_TTL_MS,
            devicePublicKey,
            action: "read",
            bootstrapChallengeId: access.challengeId,
            binding: selected,
          });
          stateReviews.set(value.challengeId, { value, consumed: false });
          return structuredClone(privateStateReviewFrameV1(value));
        } finally {
          busy = false;
        }
      },
      async readPrivateState(input) {
        need(
          arguments.length === 1 && !busy && !closed && !capturing,
          "MOBILE_ORIGINAL_ACTOR_UNAVAILABLE",
        );
        busy = true;
        try {
          exact(input, ["review", "signature"]);
          const inner = normalizePrivateStateReviewV1(
            frameData(input.review),
          ).review;
          const review = authenticate(
            { review: inner, signature: input.signature },
            normalizeOriginalAccountReviewV2,
            privateStateReviewMessageV1,
            stateReviews,
            "review",
          );
          const selected = await binding("read");
          live();
          need(
            JSON.stringify(selected) === JSON.stringify(review.binding),
            "MOBILE_ORIGINAL_REVIEW_STALE",
          );
          validateOriginalAccountFreshV2(review);
          // This original method revalidates retained receipts, owner/reader
          // head equality and backing. It does not acknowledge, reconcile, prove,
          // send, discover a new terminal or write the account journal.
          const first = await account.ownerView();
          live();
          const observed = await account.ownerView();
          live();
          // Two original reads fence head/backing changes during disclosure.
          // Timestamps may advance; every monetary field and retained request
          // disposition must still agree. No retry refreshes an old permission.
          const observationIdentity = (value) =>
            JSON.stringify({
              status: value.status,
              asset: value.asset,
              observed: value.observed
                ? {
                    blockNumber: value.observed.blockNumber,
                    blockHash: value.observed.blockHash,
                    timestamp: value.observed.timestamp,
                  }
                : null,
              balances: value.balances,
              backing: value.backing,
              requests: value.requests,
            });
          need(
            observationIdentity(first) === observationIdentity(observed),
            "MOBILE_PRIVATE_STATE_HEAD_CHANGED",
          );
          const after = await binding("read");
          live();
          need(
            JSON.stringify(after) === JSON.stringify(selected),
            "MOBILE_ORIGINAL_REVIEW_STALE",
          );
          validateOriginalAccountFreshV2(review);
          need(
            observed.asset.assetId === selected.assetId &&
              observed.asset.symbol === selected.asset.symbol &&
              observed.asset.decimals === selected.asset.decimals,
            "MOBILE_ORIGINAL_ASSET_CHANGED",
          );
          const rows = observed.requests.filter(
            (row) =>
              row.requestId === requestId && row.kind === initial.body.kind,
          );
          need(rows.length === 1, "MOBILE_ORIGINAL_OPERATION_REQUIRED");
          const current = observed.status === "LIVE";
          const request = current
            ? rows[0]
            : {
                ...rows[0],
                state: rows[0].state === "UNRESOLVED" ? "UNRESOLVED" : "STALE",
                disposition: null,
              };
          return validatePrivateStateFreshV1(
            normalizePrivateStateObservationV1({
              version: 1,
              profile: PRIVATE_STATE_OBSERVATION_V1,
              scope: PRIVATE_STATE_SCOPE_V1,
              binding: after,
              status: observed.status,
              asset: { assetId: selected.assetId, ...selected.asset },
              observed: current ? observed.observed : null,
              balances: current ? observed.balances : null,
              backing: current ? observed.backing : null,
              request,
              custody: "LINUX_ORIGINAL_OWNER_CUSTODY",
              mobileNoteCustody: false,
              completePortfolio: false,
            }),
          );
        } finally {
          busy = false;
        }
      },
      /** A signed read releases only the original binding. The device bridge
       * issues its own distinct economic consent; no unused V2 review is created. */
      async deviceDepositSignedReadBindingV1(input) {
        need(
          arguments.length === 1 && !busy && !closed && !capturing,
          "MOBILE_ORIGINAL_ACTOR_UNAVAILABLE",
        );
        busy = true;
        try {
          const access = authenticate(
            input,
            normalizeOriginalAccountAccessV2,
            originalAccountAccessMessageV2,
            accesses,
            "challenge",
          );
          need(
            access.action === "read",
            "DEVICE_OWNER_BRIDGE_READ_AUTH_REQUIRED",
          );
          const selected = await binding("read");
          live();
          validateOriginalAccountFreshV2(access);
          return structuredClone(selected);
        } finally {
          busy = false;
        }
      },
      async deviceDepositOriginalBinding() {
        need(
          arguments.length === 0 && !busy && !closed && !capturing,
          "MOBILE_ORIGINAL_ACTOR_UNAVAILABLE",
        );
        busy = true;
        try {
          const value = await binding("read");
          live();
          return value;
        } finally {
          busy = false;
        }
      },
      close() {
        need(arguments.length === 0, "MOBILE_ORIGINAL_ACTOR_ARGUMENTS");
        need(!capturing || closed, "MOBILE_ORIGINAL_CAPTURE_OWNS_LIFETIME");
        closed = true;
        for (const row of [
          ...accesses.values(),
          ...reviews.values(),
          ...stateAccesses.values(),
          ...stateReviews.values(),
        ])
          row.consumed = true;
        return {
          closed: true,
          retainedOriginalSession: true,
          retainedOriginalCustody: true,
        };
      },
    });
    if (recovery) {
      exact(recovery.initial, ["body", "review"]);
      need(
        sha(recovery.initial.body) === bodySHA256 &&
          sha(recovery.initial.review) === reviewSHA256,
        "MOBILE_ORIGINAL_RECOVERED_APPROVAL_CHANGED",
      );
      need(
        /^[0-9a-f]{64}$/.test(pairingId),
        "MOBILE_ORIGINAL_RECOVERED_PAIRING_INVALID",
      );
      exact(recovery.challenges, [
        "accesses",
        "reviews",
        "stateAccesses",
        "stateReviews",
      ]);
      const sets = {
        accesses: [accesses, normalizeOriginalAccountAccessV2],
        reviews: [reviews, normalizeOriginalAccountReviewV2],
        stateAccesses: [stateAccesses, normalizeOriginalAccountAccessV2],
        stateReviews: [stateReviews, normalizeOriginalAccountReviewV2],
      };
      for (const [name, [map, normalize]] of Object.entries(sets)) {
        need(
          Array.isArray(recovery.challenges[name]) &&
            recovery.challenges[name].length <= 4,
          "MOBILE_ORIGINAL_RECOVERED_CHALLENGES_INVALID",
        );
        for (const retained of recovery.challenges[name]) {
          exact(retained, ["id", "value", "consumed"]);
          const value = normalize(frameData(retained.value));
          need(
            retained.id === value.challengeId &&
              !map.has(retained.id) &&
              typeof retained.consumed === "boolean" &&
              value.origin === origin &&
              value.pairingId === pairingId &&
              value.devicePublicKey === devicePublicKey,
            "MOBILE_ORIGINAL_RECOVERED_CHALLENGE_CHANGED",
          );
          // Preserve consumed status and exact expiry even when it is past. The
          // ordinary authenticate/capacity guards reject replay; no renewal here.
          map.set(retained.id, { value, consumed: retained.consumed });
        }
      }
    }
    const rawActor = actor;
    function installSourceFacade() {
      const entries = Object.entries(rawActor).map(([name, method]) => [
        name,
        name === "close"
          ? function () {
              need(arguments.length === 0, "MOBILE_ORIGINAL_ACTOR_ARGUMENTS");
              sourceClosing = true;
              const pending = sourceWork;
              return (async () => {
                if (pending)
                  try {
                    await pending;
                  } catch {}
                return rawActor.close();
              })();
            }
          : async function (...args) {
              need(
                !sourceClosing && !sourceFault && !sourceBusy,
                "NATIVE_SOURCE_ACTOR_UNAVAILABLE",
              );
              sourceBusy = true;
              const work = (async () => {
                await sourceCheckpoint({
                  kind: "ACTOR_PERMISSION_OR_OBSERVATION",
                  method: name,
                });
                try {
                  const result = await method(...args);
                  await sourceCheckpoint(null);
                  return result;
                } catch (error) {
                  sourceFault = true;
                  throw error;
                }
              })();
              sourceWork = work;
              try {
                return await work;
              } finally {
                sourceBusy = false;
                if (sourceWork === work) sourceWork = null;
              }
            },
      ]);
      actor = Object.freeze(Object.fromEntries(entries));
      actorBrands.set(actor, state);
      actorBrands.delete(rawActor);
      return actor;
    }
    const state = {
      account,
      session,
      owner,
      live,
      descriptor: Object.freeze({ origin, pairingId, devicePublicKey }),
      async sourceRetain(token) {
        const identity = nativeSourceRecoverySectionIdentityV1(token, "actor");
        need(
          account ===
            nativeSourceRecoveryOriginalReferenceV1(
              token,
              "actor",
              "account",
            ) &&
            session ===
              nativeSourceRecoveryOriginalReferenceV1(
                token,
                "actor",
                "session",
              ) &&
            owner ===
              nativeSourceRecoveryOriginalReferenceV1(token, "actor", "owner"),
          "NATIVE_SOURCE_ACTOR_ORIGINAL_REFERENCES",
        );
        live();
        need(!sourceHandle && !busy, "NATIVE_SOURCE_ORIGINAL_ACTOR_IDLE");
        need(
          nativeValueOriginalRecoverySourceV1FromAccount(account) ===
            identity.sourceSHA256,
        );
        sourceWrapper = {
          schema: "ORIGINAL_NATIVE_ACTOR_DURABLE_SOURCE_V1",
          sourceSHA256: identity.sourceSHA256,
          ownedProcesses: [],
          confirmed: sourceSeed(),
          candidate: null,
        };
        sourceHandle = await retainOriginalNativeSourceSectionV1(
          token,
          "actor",
          sourceWrapper,
        );
        return installSourceFacade();
      },
      async sourceResume(token, wrapper) {
        const identity = nativeSourceRecoverySectionIdentityV1(token, "actor");
        live();
        need(!sourceHandle && !busy, "NATIVE_SOURCE_ORIGINAL_ACTOR_IDLE");
        need(
          nativeValueOriginalRecoverySourceV1FromAccount(account) ===
            identity.sourceSHA256 &&
            sha(sourceSeed()) === sha(wrapper.confirmed),
          "NATIVE_SOURCE_ACTOR_SEED_CHANGED",
        );
        sourceWrapper = structuredClone(wrapper);
        sourceHandle = resumeOriginalNativeSourceSectionV1(token, "actor");
        await sourceCheckpoint(null);
        return installSourceFacade();
      },
      fence(authority) {
        const admitted = assertNativeEconomicRecoveryCaptureV1(authority);
        original();
        const source = nativeValueOriginalRecoverySourceV1FromAccount(account);
        need(
          source === admitted.sourceSHA256,
          "MOBILE_ORIGINAL_CAPTURE_SOURCE_CHANGED",
        );
        need(
          !busy && !closed && !capturing && !sourceHandle,
          "MOBILE_ORIGINAL_CAPTURE_IDLE_REQUIRED",
        );
        captureIdentity = admitted;
        capturing = true;
      },
      capture(token) {
        const admitted = nativeEconomicRecoverySectionIdentityV1(
          token,
          "actor",
        );
        need(
          capturing &&
            !closed &&
            !captured &&
            sha(admitted) === sha(captureIdentity),
          "MOBILE_ORIGINAL_CAPTURE_REQUIRED",
        );
        captured = true;
        const rows = (map) =>
          [...map].map(([id, row]) => ({
            id,
            value: structuredClone(row.value),
            consumed: row.consumed,
          }));
        return {
          schema: "ORIGINAL_NATIVE_PAIRED_ACTOR_ECONOMIC_RECOVERY_V1",
          sourceSHA256: admitted.sourceSHA256,
          origin,
          pairingId,
          devicePublicKey,
          initial: structuredClone({
            body: initial.body,
            review: initial.review,
          }),
          challenges: {
            accesses: rows(accesses),
            reviews: rows(reviews),
            stateAccesses: rows(stateAccesses),
            stateReviews: rows(stateReviews),
          },
        };
      },
      stop(token) {
        need(
          sha(nativeEconomicRecoverySectionIdentityV1(token, "actor")) ===
            sha(captureIdentity),
        );
        need(
          capturing && captured && !busy && !closed,
          "MOBILE_ORIGINAL_CAPTURE_OWNS_LIFETIME",
        );
        closed = true;
        accesses.clear();
        reviews.clear();
        stateAccesses.clear();
        stateReviews.clear();
        return { closed: true, originalResourcesStopped: true };
      },
      abort(token) {
        need(
          capturing &&
            !busy &&
            sha(nativeEconomicRecoverySectionIdentityV1(token, "actor")) ===
              sha(captureIdentity),
        );
        closed = true;
        accesses.clear();
        reviews.clear();
        stateAccesses.clear();
        stateReviews.clear();
        return { closed: true, originalResourcesStopped: true };
      },
    };
    actorBrands.set(actor, state);
    return actor;
  }

  /** Authority originates in the private same-realm bootstrap, never metadata. */
  function assertPairedOriginalAccountActorV2(actor) {
    need(
      arguments.length === 1 && !types.isProxy(actor),
      "MOBILE_ORIGINAL_ACTOR_ORIGINAL_REQUIRED",
    );
    const retained = actorBrands.get(actor);
    need(retained, "MOBILE_ORIGINAL_ACTOR_ORIGINAL_REQUIRED");
    retained.live();
  }
  /** Explicit operator pairing handoff only; HTTP never exposes this descriptor. */
  function pairedOriginalAccountActorDescriptorV2(actor) {
    need(arguments.length === 1, "MOBILE_ORIGINAL_ACTOR_ARGUMENTS");
    assertPairedOriginalAccountActorV2(actor);
    return actorBrands.get(actor).descriptor;
  }

  /** Only original reference membership, never IDs or copied capabilities. */
  function assertPairedOriginalAccountActorAccountV2(actor, account) {
    need(arguments.length === 2, "MOBILE_ORIGINAL_ACTOR_ARGUMENTS");
    assertPairedOriginalAccountActorV2(actor);
    need(
      actorBrands.get(actor).account === account,
      "MOBILE_ORIGINAL_ACTOR_ACCOUNT_CHANGED",
    );
  }

  /** One fixed producer from the genuine actor. Grants, pair identity and nonce
   * state are encrypted by the issuer; HTTP never receives this checkpoint. */
  function fenceOriginalNativeActorEconomicRecoveryV1(actor, authority) {
    need(
      arguments.length === 2 && !types.isProxy(actor),
      "MOBILE_ORIGINAL_ACTOR_ARGUMENTS",
    );
    const state = actorBrands.get(actor);
    need(state, "MOBILE_ORIGINAL_ACTOR_ORIGINAL_REQUIRED");
    return state.fence(authority);
  }
  function captureOriginalNativeActorEconomicRecoveryV1(actor, token) {
    need(
      arguments.length === 2 && !types.isProxy(actor),
      "MOBILE_ORIGINAL_ACTOR_ARGUMENTS",
    );
    const state = actorBrands.get(actor);
    need(state, "MOBILE_ORIGINAL_ACTOR_ORIGINAL_REQUIRED");
    return state.capture(token);
  }
  function stopCapturedNativeActorEconomicRecoveryV1(actor, token) {
    need(
      arguments.length === 2 && !types.isProxy(actor),
      "MOBILE_ORIGINAL_ACTOR_ARGUMENTS",
    );
    const state = actorBrands.get(actor);
    need(state, "MOBILE_ORIGINAL_ACTOR_ORIGINAL_REQUIRED");
    return state.stop(token);
  }
  function abortNativeActorEconomicRecoveryV1(actor, token) {
    need(
      arguments.length === 2 && !types.isProxy(actor),
      "MOBILE_ORIGINAL_ACTOR_ARGUMENTS",
    );
    const state = actorBrands.get(actor);
    need(state, "MOBILE_ORIGINAL_ACTOR_ORIGINAL_REQUIRED");
    return state.abort(token);
  }
  async function reopenOriginalNativeActorEconomicRecoveryV1(token, contexts) {
    need(arguments.length === 2, "MOBILE_ORIGINAL_ACTOR_ARGUMENTS");
    exact(contexts, ["session", "account", "owner"]);
    const admitted = nativeEconomicRecoverySectionIdentityV1(token, "actor");
    need(
      nativeValueOriginalRecoverySourceV1FromAccount(contexts.account) ===
        admitted.sourceSHA256,
      "MOBILE_ORIGINAL_CAPTURE_SOURCE_CHANGED",
    );
    const retained = consumeNativeEconomicRecoverySectionV1(token, "actor");
    exact(retained, [
      "schema",
      "sourceSHA256",
      "origin",
      "pairingId",
      "devicePublicKey",
      "initial",
      "challenges",
    ]);
    need(
      retained.schema === "ORIGINAL_NATIVE_PAIRED_ACTOR_ECONOMIC_RECOVERY_V1" &&
        retained.sourceSHA256 === admitted.sourceSHA256,
    );
    assertOwnedNativeValueAccountAuthority(contexts.account, {
      owner: contexts.owner,
    });
    // The restored session must already hold the original note approval minted
    // from owner Vault and account journal, not from this serialized checkpoint.
    const approval = flatManualNativeNoteActionTarget(
      contexts.session,
      "reconcile",
      { requestId: retained.initial.body.requestId },
    );
    need(approval, "MOBILE_ORIGINAL_RECOVERED_SESSION_APPROVAL_REQUIRED");
    return createOriginalActor(
      {
        session: contexts.session,
        approval,
        owner: contexts.owner,
        origin: retained.origin,
        devicePublicKey: retained.devicePublicKey,
      },
      retained,
    );
  }

  function assertNativeActorEconomicMembershipV1(actor, expected) {
    need(
      arguments.length === 2 && !types.isProxy(actor),
      "MOBILE_ORIGINAL_ACTOR_ARGUMENTS",
    );
    exact(expected, ["session", "account", "owner"]);
    const state = actorBrands.get(actor);
    need(state, "MOBILE_ORIGINAL_ACTOR_ORIGINAL_REQUIRED");
    state.live();
    need(
      state.session === expected.session &&
        state.account === expected.account &&
        state.owner === expected.owner,
      "MOBILE_ORIGINAL_ACTOR_MEMBERSHIP_CHANGED",
    );
  }

  function nativePairedActorEconomicSourceV1(actor) {
    need(
      arguments.length === 1 && !types.isProxy(actor),
      "MOBILE_ORIGINAL_ACTOR_ARGUMENTS",
    );
    const state = actorBrands.get(actor);
    need(state, "MOBILE_ORIGINAL_ACTOR_ORIGINAL_REQUIRED");
    state.live();
    return nativeValueOriginalRecoverySourceV1FromAccount(state.account);
  }

  function assertNativeActorSessionAccountMembershipV1(actor, expected) {
    need(
      arguments.length === 2 && !types.isProxy(actor),
      "MOBILE_ORIGINAL_ACTOR_ARGUMENTS",
    );
    exact(expected, ["session", "account"]);
    const state = actorBrands.get(actor);
    need(state, "MOBILE_ORIGINAL_ACTOR_ORIGINAL_REQUIRED");
    state.live();
    need(
      state.session === expected.session && state.account === expected.account,
      "MOBILE_ORIGINAL_ACTOR_MEMBERSHIP_CHANGED",
    );
  }

  /** Pending actor calls never restore a possibly used permission. Only the
   * original capsule can request this read-only fold of its authenticated seed. */

  async function retainOriginalNativeActorSourceV1(token, actor) {
    need(arguments.length === 2, "MOBILE_ORIGINAL_ACTOR_ARGUMENTS");
    const state = actorBrands.get(actor);
    need(state, "NATIVE_SOURCE_ORIGINAL_ACTOR");
    return state.sourceRetain(token);
  }
  async function reopenOriginalNativeActorSourceV1(token, contexts) {
    need(arguments.length === 2, "MOBILE_ORIGINAL_ACTOR_ARGUMENTS");
    exact(contexts, ["session", "account", "owner"]);
    const identity = nativeSourceRecoverySectionIdentityV1(token, "actor"),
      wrapper = consumeOriginalNativeSourceSectionV1(token, "actor");
    exact(wrapper, [
      "schema",
      "sourceSHA256",
      "ownedProcesses",
      "confirmed",
      "candidate",
    ]);
    need(
      wrapper.schema === "ORIGINAL_NATIVE_ACTOR_DURABLE_SOURCE_V1" &&
        wrapper.candidate === null &&
        wrapper.sourceSHA256 === identity.sourceSHA256,
      "NATIVE_SOURCE_ACTOR_PENDING",
    );
    const seed = wrapper.confirmed;
    exact(seed, [
      "schema",
      "origin",
      "pairingId",
      "devicePublicKey",
      "initial",
      "challenges",
    ]);
    need(
      seed.schema === "ORIGINAL_NATIVE_ACTOR_SOURCE_SEED_V1" &&
        nativeValueOriginalRecoverySourceV1FromAccount(contexts.account) ===
          identity.sourceSHA256,
      "NATIVE_SOURCE_ACTOR_ORIGINAL_BINDING",
    );
    assertOwnedNativeValueAccountAuthority(contexts.account, {
      owner: contexts.owner,
    });
    const approval = flatManualNativeNoteActionTarget(
      contexts.session,
      "reconcile",
      { requestId: seed.initial.body.requestId },
    );
    need(approval, "MOBILE_ORIGINAL_RECOVERED_SESSION_APPROVAL_REQUIRED");
    const actor = await createOriginalActor(
      {
        session: contexts.session,
        approval,
        owner: contexts.owner,
        origin: seed.origin,
        devicePublicKey: seed.devicePublicKey,
      },
      seed,
    );
    try {
      return await actorBrands.get(actor).sourceResume(token, wrapper);
    } catch (error) {
      actor.close();
      throw error;
    }
  }

  return Object.freeze({
    createPairedOriginalAccountActorV2,
    assertPairedOriginalAccountActorV2,
    pairedOriginalAccountActorDescriptorV2,
    assertPairedOriginalAccountActorAccountV2,
    fenceOriginalNativeActorEconomicRecoveryV1,
    captureOriginalNativeActorEconomicRecoveryV1,
    stopCapturedNativeActorEconomicRecoveryV1,
    abortNativeActorEconomicRecoveryV1,
    reopenOriginalNativeActorEconomicRecoveryV1,
    assertNativeActorEconomicMembershipV1,
    nativePairedActorEconomicSourceV1,
    assertNativeActorSessionAccountMembershipV1,
    retainOriginalNativeActorSourceV1,
    reopenOriginalNativeActorSourceV1,
  });
}
