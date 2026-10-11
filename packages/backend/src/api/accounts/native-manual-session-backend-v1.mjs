/** Native session lifetime: original account, durable keeper, approvals and
 * SOURCE/economic recovery remain in one private instance. No registry writer
 * or caller-selected canonical ports are exported. */
import { genericAccountIdentity, sha } from "@lianum/engine/accounts/journal";
import { exactRecord } from "@lianum/components/encoding/commitments";
export function buildNativeManualSessionV1(contracts) {
  exactRecord(contracts, ["account", "economic", "source", "resources"]);
  exactRecord(contracts.account, [
    "assertOriginalNativeAccountSourceV1",
    "assertOwnedNativeValueAccountAuthority",
    "nativeValueAccountManualGraphDetails",
    "assertNativeValueAccountManualGraphExecution",
    "nativeValueAccountManualNoteDetails",
  ]);
  const {
    assertOriginalNativeAccountSourceV1,
    assertOwnedNativeValueAccountAuthority,
    nativeValueAccountManualGraphDetails,
    assertNativeValueAccountManualGraphExecution,
    nativeValueAccountManualNoteDetails,
  } = contracts.account;
  for (const method of [
    assertOriginalNativeAccountSourceV1,
    assertOwnedNativeValueAccountAuthority,
    nativeValueAccountManualGraphDetails,
    assertNativeValueAccountManualGraphExecution,
    nativeValueAccountManualNoteDetails,
  ])
    if (typeof method !== "function")
      throw new TypeError("NATIVE_SESSION_FIXED_CONTRACT");
  exactRecord(contracts.economic, [
    "assertNativeEconomicRecoveryCaptureV1",
    "nativeEconomicRecoverySectionIdentityV1",
    "consumeNativeEconomicRecoverySectionV1",
    "nativeValueOriginalRecoverySourceV1",
  ]);
  const {
    assertNativeEconomicRecoveryCaptureV1,
    nativeEconomicRecoverySectionIdentityV1,
    consumeNativeEconomicRecoverySectionV1,
    nativeValueOriginalRecoverySourceV1,
  } = contracts.economic;
  for (const method of [
    assertNativeEconomicRecoveryCaptureV1,
    nativeEconomicRecoverySectionIdentityV1,
    consumeNativeEconomicRecoverySectionV1,
    nativeValueOriginalRecoverySourceV1,
  ])
    if (typeof method !== "function")
      throw new TypeError("NATIVE_SESSION_FIXED_CONTRACT");
  exactRecord(contracts.source, [
    "nativeSourceRecoverySectionIdentityV1",
    "retainOriginalNativeSourceSectionV1",
    "consumeOriginalNativeSourceSectionV1",
    "updateOriginalNativeSourceSectionV1",
    "resumeOriginalNativeSourceSectionV1",
    "nativeSourceRecoveryOwnedProcessV1",
  ]);
  const {
    nativeSourceRecoverySectionIdentityV1,
    retainOriginalNativeSourceSectionV1,
    consumeOriginalNativeSourceSectionV1,
    updateOriginalNativeSourceSectionV1,
    resumeOriginalNativeSourceSectionV1,
    nativeSourceRecoveryOwnedProcessV1,
  } = contracts.source;
  for (const method of [
    nativeSourceRecoverySectionIdentityV1,
    retainOriginalNativeSourceSectionV1,
    consumeOriginalNativeSourceSectionV1,
    updateOriginalNativeSourceSectionV1,
    resumeOriginalNativeSourceSectionV1,
    nativeSourceRecoveryOwnedProcessV1,
  ])
    if (typeof method !== "function")
      throw new TypeError("NATIVE_SESSION_FIXED_CONTRACT");
  exactRecord(contracts.resources, [
    "loadDurableKeeper",
    "loadAccountSession",
    "loadEconomicState",
  ]);
  const { loadDurableKeeper, loadAccountSession, loadEconomicState } =
    contracts.resources;
  for (const method of [
    loadDurableKeeper,
    loadAccountSession,
    loadEconomicState,
  ])
    if (typeof method !== "function")
      throw new TypeError("NATIVE_SESSION_FIXED_CONTRACT");
  const sessions = new WeakMap(),
    nativeAccounts = new WeakSet();
  const fail = (code) => {
    throw Object.assign(new Error(code), { code });
  };
  const need = (value, code) => {
    if (!value) fail(code);
  };
  const id = (v) =>
    typeof v === "string" && /^[A-Za-z0-9_-]{8,100}$/.exec(v)?.[0] === v;
  function originalNote(session, approval) {
    const binding = sessions.get(session);
    need(binding?.nativeAccount, "NATIVE_VALUE_MANUAL_NOTE_SESSION_REQUIRED");
    assertOwnedNativeValueAccountAuthority(binding.nativeAccount, {
      runtime: binding.runtime,
      system: binding.system,
      poolIndex: binding.poolIndex,
    });
    const details = nativeValueAccountManualNoteDetails(approval);
    need(
      details.account === binding.nativeAccount,
      "NATIVE_VALUE_MANUAL_NOTE_ACCOUNT_CHANGED",
    );
    return details;
  }

  function flatManualNativeNoteReviews(session) {
    const binding = sessions.get(session);
    return [...(binding?.notes?.values() ?? [])].map(
      (approval) => originalNote(session, approval).review,
    );
  }

  function flatManualNativeNoteActionTarget(session, action, input) {
    const binding = sessions.get(session),
      approval = binding?.notes?.get(input.requestId);
    if (!approval) return null;
    need(
      ["prepare", "execute", "reconcile"].includes(action),
      "NATIVE_VALUE_MANUAL_NOTE_ACTION",
    );
    exactRecord(
      input,
      action === "prepare"
        ? ["requestId", "kind", "ownerOperationRef", "assetId"]
        : ["requestId"],
    );
    const details = originalNote(session, approval);
    if (action === "prepare")
      need(
        Object.keys(details.body).every(
          (key) => input[key] === details.body[key],
        ),
        "NATIVE_VALUE_MANUAL_NOTE_BODY_CHANGED",
      );
    return approval;
  }

  async function createNativeValueManualGraphAccountSession(input) {
    return nativeGraphSession(input, null);
  }

  async function nativeGraphSession(input, recovery) {
    exactRecord(input, [
      "runtime",
      "system",
      "poolIndex",
      "account",
      "journal",
    ]);
    const { runtime, system, poolIndex, account } = input;
    exactRecord(input.journal, ["path", "password"]);
    const journal = Object.freeze({
      path: input.journal.path,
      password: input.journal.password,
    });
    assertOwnedNativeValueAccountAuthority(account, {
      runtime,
      system,
      poolIndex,
    });
    need(
      system.claimsEnabled === false &&
        account.features.nativeManualNoteConsent === true,
      "FLAT_ACCOUNT_NATIVE_GRAPH_ONLY_REQUIRED",
    );
    need(
      !nativeAccounts.has(account),
      "FLAT_ACCOUNT_MANUAL_GRAPH_SESSION_ALREADY_CREATED",
    );
    nativeAccounts.add(account); // uncertain creation never grants a second journal
    const {
      createDurableGenericAccountKeeperV1,
      reopenDurableGenericAccountKeeperV1,
    } = await loadDurableKeeper();
    const { createFlatAccountSession } = await loadAccountSession();
    const keeper = recovery
      ? await reopenDurableGenericAccountKeeperV1(
          { config: account.config, journal, authority: account.authority },
          recovery.keeper,
        )
      : await createDurableGenericAccountKeeperV1({
          config: account.config,
          journal,
          authority: account.authority,
        });
    let session, state;
    const originalApproval = (action, value) => {
      const body = action === "prepare" ? value : { requestId: value };
      const approval =
        nativeManualGraphActionTarget(session, action, body) ??
        flatManualNativeNoteActionTarget(session, action, body);
      need(approval, "WALLET_ACCOUNT_GRAPH_FORBIDDEN");
    };
    const graphKeeper = Object.freeze({
      prepare(value) {
        originalApproval("prepare", value);
        return originalSourceSessionWork(session, () => keeper.prepare(value));
      },
      execute(value) {
        originalApproval("execute", value);
        return originalSourceSessionWork(session, () => keeper.execute(value));
      },
      reconcile(value) {
        originalApproval("reconcile", value);
        return originalSourceSessionWork(session, () =>
          keeper.reconcile(value),
        );
      },
      recover(value) {
        originalApproval("recover", value);
        return originalSourceSessionWork(session, () => keeper.recover(value));
      },
      snapshot: () => keeper.snapshot(),
      restartCoordinator: () => {
        need(
          !state?.nativeSource,
          "NATIVE_SOURCE_LIVE_COORDINATOR_REPLACEMENT_FORBIDDEN",
        );
        return keeper.restartCoordinator();
      },
      async close() {
        if (state?.economicAcquisition)
          await state.economicAcquisition.catch(() => {});
        await state?.economicState?.close();
        return keeper.close();
      },
    });
    try {
      session = await createFlatAccountSession({
        keeper: graphKeeper,
        ownerHandoff: { ownerView: () => account.ownerView() },
      });
    } catch (error) {
      await keeper.close();
      throw error;
    }
    const graphs = new Map(),
      notes = new Map();
    state = {
      runtime,
      system,
      poolIndex,
      nativeAccount: account,
      graphs,
      notes,
      journal,
      durableKeeper: keeper,
      nativeCaptured: false,
      nativeFence: null,
      nativeIdentity: null,
      nativeRecord: null,
      nativeCapturePromise: null,
      nativeKeeperCaptureStarted: false,
      nativeStopped: false,
    };
    sessions.set(session, state);
    const joined = Object.freeze({
      session,
      bindManualNote(approval) {
        const details = originalNote(session, approval),
          requestId = details.body.requestId,
          old = notes.get(requestId);
        need(
          !graphs.has(requestId) && (!old || old === approval),
          "NATIVE_VALUE_MANUAL_NOTE_REBOUND",
        );
        need(old || notes.size < 4, "NATIVE_VALUE_MANUAL_NOTE_CAPACITY");
        for (const value of [...notes.values(), ...graphs.values()]) {
          const other =
            notes.has(requestId) && value === old
              ? null
              : [...notes.values()].includes(value)
                ? originalNote(session, value)
                : original(session, value);
          if (other && value !== approval)
            need(
              other.body.ownerOperationRef !== details.body.ownerOperationRef,
              "NATIVE_VALUE_MANUAL_NOTE_REBOUND",
            );
        }
        notes.set(requestId, approval);
        return structuredClone(details.body);
      },
      bindManualGraph(approval) {
        const details = original(session, approval),
          requestId = details.body.requestId;
        need(!notes.has(requestId), "NATIVE_VALUE_MANUAL_NOTE_REBOUND");
        for (const value of notes.values())
          need(
            originalNote(session, value).body.ownerOperationRef !==
              details.body.ownerOperationRef,
            "NATIVE_VALUE_MANUAL_NOTE_REBOUND",
          );
        const old = graphs.get(requestId);
        need(!old || old === approval, "FLAT_ACCOUNT_MANUAL_GRAPH_REBOUND");
        need(old || graphs.size < 8, "FLAT_ACCOUNT_MANUAL_GRAPH_CAPACITY");
        for (const value of graphs.values())
          if (value !== approval)
            need(
              original(session, value).body.ownerOperationRef !==
                details.body.ownerOperationRef,
              "FLAT_ACCOUNT_MANUAL_GRAPH_REBOUND",
            );
        graphs.set(requestId, approval);
        return structuredClone(details.body);
      },
    });
    if (recovery) {
      try {
        assertOwnedNativeValueAccountAuthority(account, {
          runtime,
          system,
          poolIndex,
          owner: recovery.owner,
        });
        // This original factory reads the SAME owner Vault and the recovered
        // account journal. It does not adopt a saved review as a capability.
        const preparation =
          recovery.source && recovery.notes.length === 0
            ? null
            : await account.ownerActions.restoreManualPreparation();
        for (const retained of recovery.notes) {
          await preparation.reconcileOriginal({
            requestId: retained.body.requestId,
          });
          const approval = preparation.originalApproval(
              retained.body.requestId,
            ),
            details = nativeValueAccountManualNoteDetails(approval);
          need(
            sha({ body: details.body, review: details.review }) ===
              sha(retained),
            "NATIVE_SESSION_ORIGINAL_NOTE_CHANGED",
          );
          joined.bindManualNote(approval);
        }
        const snapshot = await session.snapshot();
        need(
          snapshot.storageAvailable &&
            snapshot.observation === "CURRENT" &&
            snapshot.revision === recovery.journalRevision,
          "NATIVE_SESSION_ORIGINAL_JOURNAL_CHANGED",
        );
        if (Object.hasOwn(recovery, "economicState"))
          await sessionEconomicState(session, recovery.economicState);
      } catch (error) {
        await session.close();
        throw error;
      }
    }
    return joined;
  }

  function assertNativeWalletEconomicSessionV1(session, expected) {
    need(arguments.length === 2, "NATIVE_SESSION_ARGUMENTS");
    exactRecord(expected, ["runtime", "system", "account"]);
    const state = sessions.get(session);
    need(
      state?.nativeAccount && state.durableKeeper && !state.nativeFence,
      "NATIVE_SESSION_ORIGINAL_REQUIRED",
    );
    need(
      state.runtime === expected.runtime &&
        state.system === expected.system &&
        state.nativeAccount === expected.account,
      "NATIVE_SESSION_ORIGINAL_MEMBERSHIP_REQUIRED",
    );
    assertOwnedNativeValueAccountAuthority(state.nativeAccount, {
      runtime: state.runtime,
      system: state.system,
      poolIndex: state.poolIndex,
    });
  }

  function fenceOriginalNativeSessionEconomicRecoveryV1(session, authority) {
    need(arguments.length === 2, "NATIVE_SESSION_ARGUMENTS");
    const admitted = assertNativeEconomicRecoveryCaptureV1(authority),
      state = sessions.get(session);
    need(
      state?.nativeAccount && state.durableKeeper && !state.nativeFence,
      "NATIVE_SESSION_ORIGINAL_REQUIRED",
    );
    need(!state.nativeSource, "NATIVE_SOURCE_SESSION_LEGACY_CAPTURE_DENIED");
    assertOwnedNativeValueAccountAuthority(state.nativeAccount, {
      runtime: state.runtime,
      system: state.system,
      poolIndex: state.poolIndex,
    });
    need(
      nativeValueOriginalRecoverySourceV1(state.runtime, state.system) ===
        admitted.sourceSHA256,
      "NATIVE_SESSION_SOURCE_CHANGED",
    );
    // Current mobile composition has only its original note consent. General
    // manual GRAPH grant restoration remains a distinct original producer.
    need(
      state.graphs.size === 0,
      "NATIVE_SESSION_GRAPH_RECOVERY_PRODUCER_REQUIRED",
    );
    state.nativeReviews = [...state.notes.values()].map((approval) => {
      const details = originalNote(session, approval);
      return structuredClone({ body: details.body, review: details.review });
    });
    state.nativeIdentity = admitted;
    fenceSessionEconomicState(state);
    state.nativeFence = session.quiesceForPrivateRecovery(); // closing fence runs before first await
    state.nativeFence.catch(() => {});
  }

  function captureOriginalNativeSessionEconomicRecoveryV1(session, token) {
    need(arguments.length === 2, "NATIVE_SESSION_ARGUMENTS");
    const admitted = nativeEconomicRecoverySectionIdentityV1(token, "session"),
      state = sessions.get(session);
    need(
      state?.nativeFence && !state.nativeCaptured,
      "NATIVE_SESSION_ORIGINAL_CAPTURE_REQUIRED",
    );
    need(
      sha(admitted) === sha(state.nativeIdentity),
      "NATIVE_SESSION_CAPTURE_CHANGED",
    );
    state.nativeCaptured = true;
    state.nativeCapturePromise = (async () => {
      const drained = await Promise.allSettled([
        state.nativeFence,
        state.economicCapture ?? Promise.resolve(null),
      ]);
      for (const outcome of drained)
        if (outcome.status === "rejected") throw outcome.reason;
      const originalSnapshot = drained[0].value;
      need(
        !originalSnapshot.busy && originalSnapshot.queued === 0,
        "NATIVE_SESSION_ORIGINAL_IDLE_REQUIRED",
      );
      const { captureDurableGenericAccountKeeperV1 } =
        await loadDurableKeeper();
      state.nativeKeeperCaptureStarted = true;
      const keeper = await captureDurableGenericAccountKeeperV1(
        state.durableKeeper,
      ); // closes actual worker/IPC before returning
      state.nativeStopped = true;
      const economicState = await capturedSessionEconomicState(state);
      state.nativeRecord = {
        schema: economicState
          ? "ORIGINAL_NATIVE_SESSION_WALLET_STATE_RECOVERY_V1"
          : "ORIGINAL_NATIVE_SESSION_ECONOMIC_RECOVERY_V1",
        sourceSHA256: admitted.sourceSHA256,
        poolIndex: state.poolIndex,
        accountIdentitySHA256: sha(
          genericAccountIdentity(state.nativeAccount.config),
        ),
        journalRevision: originalSnapshot.revision,
        keeper,
        notes: structuredClone(state.nativeReviews),
        ...(economicState ? { economicState } : {}),
      };
      return structuredClone(state.nativeRecord);
    })();
    state.nativeCapturePromise.catch(() => {});
    return state.nativeCapturePromise;
  }

  async function stopCapturedNativeSessionEconomicRecoveryV1(session, token) {
    need(arguments.length === 2, "NATIVE_SESSION_ARGUMENTS");
    const state = sessions.get(session);
    need(state?.nativeIdentity, "NATIVE_SESSION_ORIGINAL_REQUIRED");
    need(
      sha(nativeEconomicRecoverySectionIdentityV1(token, "session")) ===
        sha(state.nativeIdentity),
    );
    need(
      state.nativeStopped && state.nativeRecord,
      "NATIVE_SESSION_ORIGINAL_CLOSE_UNCONFIRMED",
    );
    state.nativeRecord = null;
    state.notes.clear();
    return { closed: true, originalResourcesStopped: true };
  }

  async function abortNativeSessionEconomicRecoveryV1(session, token) {
    need(arguments.length === 2, "NATIVE_SESSION_ARGUMENTS");
    const state = sessions.get(session);
    need(
      state?.nativeIdentity &&
        sha(nativeEconomicRecoverySectionIdentityV1(token, "session")) ===
          sha(state.nativeIdentity),
    );
    let captureError = null;
    try {
      if (state.nativeCapturePromise) await state.nativeCapturePromise;
      else await state.nativeFence;
    } catch (error) {
      captureError = error;
    }
    if (!state.nativeStopped) {
      try {
        const stopped = await state.durableKeeper.close();
        need(
          stopped?.closed === true,
          "NATIVE_SESSION_ORIGINAL_CLOSE_UNCONFIRMED",
        );
        // The immutable durable helper sets its closed flag in finally. If its
        // capture/OS-close rejected, a later idempotent {closed:true} cannot prove
        // that original worker/IPC closed. Preserve that uncertainty and cause.
        need(
          !state.nativeKeeperCaptureStarted,
          "NATIVE_SESSION_ORIGINAL_CLOSE_UNCONFIRMED",
        );
        state.nativeStopped = true;
      } catch (cleanup) {
        if (captureError)
          throw new AggregateError(
            [captureError, cleanup],
            "NATIVE_SESSION_CAPTURE_AND_CLOSE_FAILED",
            { cause: captureError },
          );
        throw cleanup;
      }
    }
    need(state.nativeStopped, "NATIVE_SESSION_ORIGINAL_CLOSE_UNCONFIRMED");
    return { closed: true, originalResourcesStopped: true };
  }

  async function reopenOriginalNativeSessionEconomicRecoveryV1(
    token,
    contexts,
  ) {
    need(arguments.length === 2, "NATIVE_SESSION_ARGUMENTS");
    exactRecord(contexts, ["runtime", "system", "account", "owner"]);
    const admitted = nativeEconomicRecoverySectionIdentityV1(token, "session");
    need(
      nativeValueOriginalRecoverySourceV1(contexts.runtime, contexts.system) ===
        admitted.sourceSHA256,
      "NATIVE_SESSION_SOURCE_CHANGED",
    );
    const retained = consumeNativeEconomicRecoverySectionV1(token, "session");
    const economic =
      retained.schema === "ORIGINAL_NATIVE_SESSION_WALLET_STATE_RECOVERY_V1";
    exactRecord(retained, [
      "schema",
      "sourceSHA256",
      "poolIndex",
      "accountIdentitySHA256",
      "journalRevision",
      "keeper",
      "notes",
      ...(economic ? ["economicState"] : []),
    ]);
    need(
      (economic ||
        retained.schema === "ORIGINAL_NATIVE_SESSION_ECONOMIC_RECOVERY_V1") &&
        retained.sourceSHA256 === admitted.sourceSHA256,
    );
    if (economic)
      exactRecord(retained.economicState, ["journal", "checkpoint"]);
    assertOwnedNativeValueAccountAuthority(contexts.account, {
      runtime: contexts.runtime,
      system: contexts.system,
      poolIndex: retained.poolIndex,
      owner: contexts.owner,
    });
    need(
      sha(genericAccountIdentity(contexts.account.config)) ===
        retained.accountIdentitySHA256,
      "NATIVE_SESSION_ORIGINAL_ACCOUNT_CHANGED",
    );
    return nativeGraphSession(
      {
        runtime: contexts.runtime,
        system: contexts.system,
        poolIndex: retained.poolIndex,
        account: contexts.account,
        journal: retained.keeper.journal,
      },
      { ...retained, owner: contexts.owner },
    );
  }

  function assertNativeSessionEconomicMembershipV1(session, expected) {
    need(arguments.length === 2, "NATIVE_SESSION_ARGUMENTS");
    exactRecord(expected, ["runtime", "system", "account", "owner"]);
    const state = sessions.get(session);
    need(
      state?.nativeAccount && state.durableKeeper && !state.nativeFence,
      "NATIVE_SESSION_ORIGINAL_REQUIRED",
    );
    need(
      state.runtime === expected.runtime &&
        state.system === expected.system &&
        state.nativeAccount === expected.account,
      "NATIVE_SESSION_ORIGINAL_MEMBERSHIP_REQUIRED",
    );
    assertOwnedNativeValueAccountAuthority(expected.account, {
      runtime: expected.runtime,
      system: expected.system,
      poolIndex: state.poolIndex,
      owner: expected.owner,
    });
  }

  function originalSourceSessionState(session, keeper = null) {
    const state = sessions.get(session);
    need(
      state?.nativeSource &&
        state.nativeAccount &&
        state.durableKeeper &&
        !state.nativeFence &&
        !state.nativeCaptured,
      "NATIVE_SOURCE_ORIGINAL_SESSION_REQUIRED",
    );
    need(!state.nativeSource.fault, "NATIVE_SOURCE_SESSION_UNAVAILABLE");
    if (keeper !== null)
      need(
        state.durableKeeper === keeper,
        "NATIVE_SOURCE_ORIGINAL_KEEPER_CHANGED",
      );
    assertOwnedNativeValueAccountAuthority(state.nativeAccount, {
      runtime: state.runtime,
      system: state.system,
      poolIndex: state.poolIndex,
      owner: state.nativeSource.owner,
    });
    assertOriginalNativeAccountSourceV1(
      state.nativeAccount,
      state.nativeSource.identity,
    );
    need(
      state.graphs.size === 0,
      "NATIVE_SOURCE_GRAPH_RESTORATION_PRODUCER_REQUIRED",
    );
    return state;
  }

  function assertOriginalNativeSessionSourceKeeperV1(session, keeper) {
    need(arguments.length === 2, "NATIVE_SOURCE_SESSION_ARGUMENTS");
    originalSourceSessionState(session, keeper);
  }

  function sourceSessionPayload(state, snapshot) {
    const checkpoint = snapshot.keeper.checkpoint;
    need(
      checkpoint &&
        snapshot.keeper.config.accountId ===
          state.nativeAccount.config.accountId,
      "NATIVE_SOURCE_ORIGINAL_KEEPER_CHANGED",
    );
    return {
      schema: "ORIGINAL_NATIVE_SOURCE_SESSION_SEED_V1",
      sourceSHA256: state.nativeSource.identity.sourceSHA256,
      poolIndex: state.poolIndex,
      accountIdentitySHA256: sha(
        genericAccountIdentity(state.nativeAccount.config),
      ),
      journalRevision: checkpoint.revision,
      keeper: structuredClone(snapshot.keeper),
      notes: [...state.notes.values()].map((approval) => {
        const details = originalNote(state.nativeSource.session, approval);
        return structuredClone({ body: details.body, review: details.review });
      }),
    };
  }

  async function sourceOwnedCoordinatorProcesses(state, snapshot) {
    need(
      Array.isArray(snapshot.ownedProcesses) &&
        snapshot.ownedProcesses.length === 1,
      "NATIVE_SOURCE_ORIGINAL_COORDINATOR_REQUIRED",
    );
    const expected = snapshot.ownedProcesses[0],
      actual = await nativeSourceRecoveryOwnedProcessV1(
        state.nativeSource.token,
        "session",
        expected.pid,
      );
    need(
      sha(actual) === sha(expected),
      "NATIVE_SOURCE_ORIGINAL_COORDINATOR_IDENTITY_CHANGED",
    );
    return [actual];
  }

  async function updateSourceSession(
    state,
    confirmed,
    ownedProcesses,
    candidate,
  ) {
    const section = {
      schema: "ORIGINAL_NATIVE_SOURCE_SESSION_SECTION_V1",
      sourceSHA256: state.nativeSource.identity.sourceSHA256,
      ownedProcesses: structuredClone(ownedProcesses),
      confirmed,
      candidate,
    };
    await updateOriginalNativeSourceSectionV1(
      state.nativeSource.handle,
      section,
    );
    state.nativeSource.section = structuredClone(section);
  }

  async function prepareOriginalNativeSessionKeeperSourceCheckpointV1(
    session,
    keeper,
  ) {
    need(arguments.length === 2, "NATIVE_SOURCE_SESSION_ARGUMENTS");
    const state = originalSourceSessionState(session, keeper);
    const module = await loadDurableKeeper();
    const candidate =
      await module.readOriginalNativeSourceSessionKeeperCandidateV1(
        keeper,
        session,
      );
    exactRecord(candidate, ["revision", "stateSHA256"]);
    need(
      Number.isSafeInteger(candidate.revision) &&
        candidate.revision >= 0 &&
        /^[0-9a-f]{64}$/.test(candidate.stateSHA256),
      "NATIVE_SOURCE_ORIGINAL_CHECKPOINT",
    );
    await updateSourceSession(
      state,
      state.nativeSource.section.confirmed,
      state.nativeSource.section.ownedProcesses,
      { kind: "KEEPER_CAS", parentCheckpoint: structuredClone(candidate) },
    );
  }

  async function confirmOriginalNativeSessionKeeperSourceCheckpointV1(
    session,
    keeper,
  ) {
    need(arguments.length === 2, "NATIVE_SOURCE_SESSION_ARGUMENTS");
    const state = originalSourceSessionState(session, keeper);
    const module = await loadDurableKeeper();
    const snapshot = await module.readOriginalNativeSourceSessionKeeperV1(
      keeper,
      session,
    );
    // The keeper itself supplies this exact snapshot from its original parent
    // readback; the caller still must hold both of the original references.
    exactRecord(snapshot, ["keeper", "ownedProcesses"]);
    const pending = state.nativeSource.section.candidate;
    need(pending?.kind === "KEEPER_CAS", "NATIVE_SOURCE_ORIGINAL_CHECKPOINT");
    need(
      snapshot.keeper.parentCheckpoint.revision ===
        pending.parentCheckpoint.revision &&
        sha({
          checkpoint: snapshot.keeper.checkpoint,
          pendingCheckpoint: snapshot.keeper.pendingCheckpoint,
        }) === pending.parentCheckpoint.stateSHA256,
      "NATIVE_SOURCE_ORIGINAL_CHECKPOINT_CHANGED",
    );
    await updateSourceSession(
      state,
      sourceSessionPayload(state, snapshot),
      await sourceOwnedCoordinatorProcesses(state, snapshot),
      state.nativeSource.busy ? { kind: "ADMITTED_KEEPER_OPERATION" } : null,
    );
  }

  async function originalSourceSessionWork(session, work) {
    const state = sessions.get(session);
    if (!state?.nativeSource) return work();
    const source = state.nativeSource;
    originalSourceSessionState(session);
    need(!source.busy && !source.fault, "NATIVE_SOURCE_SESSION_UNAVAILABLE");
    source.busy = true;
    try {
      await updateSourceSession(
        state,
        source.section.confirmed,
        source.section.ownedProcesses,
        { kind: "ADMITTED_KEEPER_OPERATION" },
      );
      const value = await work(),
        module = await loadDurableKeeper();
      const snapshot = await module.readOriginalNativeSourceSessionKeeperV1(
        state.durableKeeper,
        session,
      );
      await updateSourceSession(
        state,
        sourceSessionPayload(state, snapshot),
        await sourceOwnedCoordinatorProcesses(state, snapshot),
        null,
      );
      return value;
    } catch (error) {
      source.fault = true;
      throw error;
    } finally {
      source.busy = false;
    }
  }

  function originalSourceJoinedSession(joined) {
    // SOURCE callers await this binding before funding; ordinary joined sessions
    // keep their existing synchronous methods and no new persistence work.
    return Object.freeze({
      session: joined.session,
      async bindManualNote(approval) {
        return originalSourceSessionWork(joined.session, () =>
          joined.bindManualNote(approval),
        );
      },
      bindManualGraph() {
        fail("NATIVE_SOURCE_GRAPH_RESTORATION_PRODUCER_REQUIRED");
      },
    });
  }

  async function createOriginalNativeSourceGraphAccountSessionV1(token, input) {
    need(arguments.length === 2, "NATIVE_SOURCE_SESSION_ARGUMENTS");
    exactRecord(input, [
      "runtime",
      "system",
      "poolIndex",
      "account",
      "journal",
      "owner",
    ]);
    const identity = nativeSourceRecoverySectionIdentityV1(token, "session");
    need(
      identity.profile === "NATIVE_VALUE_DURABLE_SOURCE_RECOVERY_V1",
      "NATIVE_SOURCE_ORIGINAL_PROFILE",
    );
    need(
      nativeValueOriginalRecoverySourceV1(input.runtime, input.system) ===
        identity.sourceSHA256,
      "NATIVE_SOURCE_ORIGINAL_SOURCE_CHANGED",
    );
    assertOwnedNativeValueAccountAuthority(input.account, {
      runtime: input.runtime,
      system: input.system,
      poolIndex: input.poolIndex,
      owner: input.owner,
    });
    assertOriginalNativeAccountSourceV1(input.account, identity);
    const { owner, ...original } = input,
      joined = await nativeGraphSession(original, null),
      state = sessions.get(joined.session);
    state.nativeSource = {
      identity,
      owner,
      token,
      session: joined.session,
      handle: null,
      section: null,
      busy: false,
      fault: false,
    };
    try {
      const module = await loadDurableKeeper();
      const snapshot = await module.readOriginalNativeSourceSessionKeeperV1(
        state.durableKeeper,
        joined.session,
      );
      const section = {
        schema: "ORIGINAL_NATIVE_SOURCE_SESSION_SECTION_V1",
        sourceSHA256: identity.sourceSHA256,
        ownedProcesses: await sourceOwnedCoordinatorProcesses(state, snapshot),
        confirmed: sourceSessionPayload(state, snapshot),
        candidate: null,
      };
      state.nativeSource.handle = await retainOriginalNativeSourceSectionV1(
        token,
        "session",
        section,
      );
      state.nativeSource.section = structuredClone(section);
      await module.bindOriginalNativeSourceSessionKeeperV1(
        state.durableKeeper,
        joined.session,
      );
      await createOriginalNativeSessionWalletEconomicStateV1(joined.session);
      return originalSourceJoinedSession(joined);
    } catch (error) {
      state.nativeSource.fault = true;
      try {
        await joined.session.close();
      } catch (cleanup) {
        throw new AggregateError(
          [error, cleanup],
          "NATIVE_SOURCE_SESSION_SETUP_CLOSE_FAILED",
          { cause: error },
        );
      }
      throw error;
    }
  }

  async function reopenOriginalNativeSessionSourceV1(token, contexts) {
    need(arguments.length === 2, "NATIVE_SOURCE_SESSION_ARGUMENTS");
    exactRecord(contexts, ["runtime", "system", "account", "owner"]);
    const identity = nativeSourceRecoverySectionIdentityV1(token, "session");
    need(
      identity.profile === "NATIVE_VALUE_DURABLE_SOURCE_RECOVERY_V1",
      "NATIVE_SOURCE_ORIGINAL_PROFILE",
    );
    need(
      nativeValueOriginalRecoverySourceV1(contexts.runtime, contexts.system) ===
        identity.sourceSHA256,
      "NATIVE_SOURCE_ORIGINAL_SOURCE_CHANGED",
    );
    assertOriginalNativeAccountSourceV1(contexts.account, identity);
    const section = consumeOriginalNativeSourceSectionV1(token, "session");
    exactRecord(section, [
      "schema",
      "sourceSHA256",
      "ownedProcesses",
      "confirmed",
      "candidate",
    ]);
    need(
      section.schema === "ORIGINAL_NATIVE_SOURCE_SESSION_SECTION_V1" &&
        section.sourceSHA256 === identity.sourceSHA256,
      "NATIVE_SOURCE_ORIGINAL_PROFILE",
    );
    need(section.candidate === null, "NATIVE_SOURCE_PENDING_ONLY_UNKNOWN");
    const retained = section.confirmed;
    exactRecord(retained, [
      "schema",
      "sourceSHA256",
      "poolIndex",
      "accountIdentitySHA256",
      "journalRevision",
      "keeper",
      "notes",
    ]);
    need(
      retained.schema === "ORIGINAL_NATIVE_SOURCE_SESSION_SEED_V1" &&
        retained.sourceSHA256 === identity.sourceSHA256,
      "NATIVE_SOURCE_ORIGINAL_PROFILE",
    );
    need(
      sha(genericAccountIdentity(contexts.account.config)) ===
        retained.accountIdentitySHA256,
      "NATIVE_SOURCE_ORIGINAL_ACCOUNT_CHANGED",
    );
    assertOwnedNativeValueAccountAuthority(contexts.account, {
      runtime: contexts.runtime,
      system: contexts.system,
      poolIndex: retained.poolIndex,
      owner: contexts.owner,
    });
    const handle = await resumeOriginalNativeSourceSectionV1(token, "session");
    const joined = await nativeGraphSession(
        {
          runtime: contexts.runtime,
          system: contexts.system,
          poolIndex: retained.poolIndex,
          account: contexts.account,
          journal: retained.keeper.journal,
        },
        { ...retained, source: true, owner: contexts.owner },
      ),
      state = sessions.get(joined.session);
    state.nativeSource = {
      identity,
      owner: contexts.owner,
      token,
      session: joined.session,
      handle,
      section: structuredClone(section),
      busy: false,
      fault: false,
    };
    try {
      const module = await loadDurableKeeper();
      const snapshot = await module.bindOriginalNativeSourceSessionKeeperV1(
        state.durableKeeper,
        joined.session,
      );
      await updateSourceSession(
        state,
        sourceSessionPayload(state, snapshot),
        await sourceOwnedCoordinatorProcesses(state, snapshot),
        null,
      );
      await reopenOriginalNativeSessionWalletEconomicStateAfterCrashV1(
        joined.session,
      );
      return originalSourceJoinedSession(joined);
    } catch (error) {
      state.nativeSource.fault = true;
      try {
        await joined.session.close();
      } catch (cleanup) {
        throw new AggregateError(
          [error, cleanup],
          "NATIVE_SOURCE_SESSION_OPEN_CLOSE_FAILED",
          { cause: error },
        );
      }
      throw error;
    }
  }

  function nativeManualGraphReviews(session) {
    const binding = sessions.get(session);
    if (!binding) return [];
    return [...binding.graphs.values()].map(
      (approval) => original(session, approval).review,
    );
  }

  function nativeManualGraphHandoffBindings(session) {
    const binding = sessions.get(session);
    if (!binding) return [];
    return [...binding.graphs.values(), ...binding.notes.values()].map(
      (approval) => {
        const details = [...binding.notes.values()].includes(approval)
          ? originalNote(session, approval)
          : original(session, approval);
        return Object.freeze({
          requestId: details.body.requestId,
          accountIdentitySHA256: sha(
            genericAccountIdentity(details.account.config),
          ),
          generationId: sha(
            genericAccountIdentity(binding.nativeAccount.config),
          ),
          originalAccountLifetime: details.review.originalAccountLifetime,
          identitySHA256: details.review.identitySHA256,
        });
      },
    );
  }

  function nativeManualGraphActionTarget(session, action, input) {
    need(
      ["prepare", "execute", "reconcile", "recover"].includes(action),
      "WALLET_ACCOUNT_GRAPH_FORBIDDEN",
    );
    exactRecord(
      input,
      action === "prepare"
        ? ["requestId", "kind", "ownerOperationRef", "assetId"]
        : ["requestId"],
    );
    const binding = sessions.get(session),
      approval = binding?.graphs.get(input.requestId);
    if (!approval) {
      if (action === "prepare" && input.kind === "GRAPH")
        fail("WALLET_ACCOUNT_GRAPH_FORBIDDEN");
      return null;
    }
    const { body } = original(session, approval);
    // Terminal reconciliation/F retains the immutable original even if its
    // provider has become unavailable after delivery. It never creates a route.
    if (action === "prepare" || action === "execute")
      assertNativeValueAccountManualGraphExecution(approval);
    need(
      ["prepare", "execute", "reconcile", "recover"].includes(action),
      "WALLET_ACCOUNT_GRAPH_FORBIDDEN",
    );
    if (action === "prepare") {
      exactRecord(input, ["requestId", "kind", "ownerOperationRef", "assetId"]);
      need(
        Object.keys(body).every((key) => input[key] === body[key]),
        "WALLET_ACCOUNT_GRAPH_BINDING_CHANGED",
      );
    } else {
      exactRecord(input, ["requestId"]);
      need(id(input.requestId), "WALLET_ACCOUNT_REQUEST_ID");
    }
    return approval;
  }

  async function readOriginalNativeSessionWalletEconomicSnapshotV1(session) {
    need(arguments.length === 1, "WALLET_ECONOMIC_SESSION_ARGUMENTS");
    const state = sessions.get(session);
    need(state?.nativeAccount, "WALLET_ECONOMIC_ORIGINAL_SESSION_REQUIRED");
    assertNativeWalletEconomicSessionV1(session, {
      runtime: state.runtime,
      system: state.system,
      account: state.nativeAccount,
    });
    const snapshot = await session.snapshot(),
      approvals = [...state.graphs.values(), ...(state.notes?.values() ?? [])];
    const requests = snapshot.requests.map((request) => {
      const matches = approvals
        .map((approval) =>
          state.notes && [...state.notes.values()].includes(approval)
            ? originalNote(session, approval)
            : original(session, approval),
        )
        .filter((details) => details.body.requestId === request.requestId);
      need(
        matches.length === 1 && matches[0].body.kind === request.kind,
        "WALLET_ECONOMIC_ORIGINAL_REQUEST_REQUIRED",
      );
      return { ...request, assetId: matches[0].body.assetId };
    });
    return { ...snapshot, requests };
  }

  function sessionEconomicInput(state, session, journal) {
    return {
      catalogues: [],
      nativeAccounts: [
        {
          runtime: state.runtime,
          system: state.system,
          account: state.nativeAccount,
          session,
        },
      ],
      wrappedPortfolios: [],
      journal,
    };
  }

  async function sessionEconomicState(session, retained, afterCrash = false) {
    const state = sessions.get(session);
    need(
      state?.durableKeeper &&
        state.nativeAccount &&
        !state.economicInstallation,
      "WALLET_ECONOMIC_ORIGINAL_SESSION_REQUIRED",
    );
    const journal = Object.freeze({
      path: state.journal.path + ".economic-state.vault",
      password: state.journal.password,
    });
    if (retained) {
      exactRecord(retained, ["journal", "checkpoint"]);
      need(
        sha(retained.journal) === sha(journal),
        "WALLET_ECONOMIC_ORIGINAL_JOURNAL_REQUIRED",
      );
    }
    state.economicInstallation = true; // an ambiguous Vault create/open never permits a replacement
    state.economicAcquisition = (async () => {
      const module = await loadEconomicState();
      const input = sessionEconomicInput(state, session, journal);
      const capability = afterCrash
        ? await module.reopenOriginalWalletEconomicStateAfterCrashV1({
            ...input,
            journal: { path: journal.path },
          })
        : retained
          ? await module.openOriginalWalletEconomicStateV1({
              ...input,
              checkpoint: retained.checkpoint,
            })
          : await module.createOriginalWalletEconomicStateV1(input);
      try {
        module.assertOriginalWalletEconomicStateV1(capability);
        module.assertOriginalWalletEconomicStateJournalV1(capability, journal);
        need(
          module
            .originalWalletEconomicStateBindingsV1(capability)
            .some((row) => row.session === session),
          "WALLET_ECONOMIC_ORIGINAL_SESSION_REQUIRED",
        );
        state.economicState = capability;
        state.economicJournal = journal;
        return capability;
      } catch (error) {
        await capability.close();
        throw error;
      }
    })();
    state.economicAcquisition.catch(() => {});
    return state.economicAcquisition;
  }

  async function createOriginalNativeSessionWalletEconomicStateV1(session) {
    need(arguments.length === 1, "WALLET_ECONOMIC_SESSION_ARGUMENTS");
    const state = sessions.get(session);
    need(state?.nativeAccount, "WALLET_ECONOMIC_ORIGINAL_SESSION_REQUIRED");
    assertNativeWalletEconomicSessionV1(session, {
      runtime: state.runtime,
      system: state.system,
      account: state.nativeAccount,
    });
    return sessionEconomicState(session, null);
  }

  async function reopenOriginalNativeSessionWalletEconomicStateAfterCrashV1(
    session,
  ) {
    need(arguments.length === 1, "WALLET_ECONOMIC_SESSION_ARGUMENTS");
    const state = sessions.get(session);
    need(state?.nativeAccount, "WALLET_ECONOMIC_ORIGINAL_SESSION_REQUIRED");
    assertNativeWalletEconomicSessionV1(session, {
      runtime: state.runtime,
      system: state.system,
      account: state.nativeAccount,
    });
    return sessionEconomicState(session, null, true);
  }

  function readOriginalNativeSessionWalletEconomicStateV1(session) {
    need(arguments.length === 1, "WALLET_ECONOMIC_SESSION_ARGUMENTS");
    const state = sessions.get(session);
    need(
      state?.durableKeeper && state.nativeAccount,
      "WALLET_ECONOMIC_ORIGINAL_SESSION_REQUIRED",
    );
    return state.economicState ?? null;
  }

  function fenceSessionEconomicState(state) {
    if (state.economicState)
      state.economicCapture = state.economicState.capture();
    else if (state.economicAcquisition)
      state.economicCapture = (async () => {
        const capability = await state.economicAcquisition;
        return capability.capture();
      })();
    state.economicCapture?.catch(() => {});
  }

  async function capturedSessionEconomicState(state) {
    if (!state.economicState) return null;
    need(state.economicCapture, "WALLET_ECONOMIC_ORIGINAL_CAPTURE_REQUIRED");
    return {
      journal: { ...state.economicJournal },
      checkpoint: await state.economicCapture,
    };
  }

  function original(session, approval) {
    const binding = sessions.get(session);
    need(binding?.nativeAccount, "WALLET_ACCOUNT_GRAPH_FORBIDDEN");
    const details = nativeValueAccountManualGraphDetails(approval);
    assertOwnedNativeValueAccountAuthority(binding.nativeAccount, {
      runtime: binding.runtime,
      system: binding.system,
      poolIndex: binding.poolIndex,
    });
    need(
      details.account === binding.nativeAccount,
      "FLAT_ACCOUNT_MANUAL_GRAPH_ORIGINAL_ACCOUNT_REQUIRED",
    );
    return details;
  }
  function isOriginalNativeManualSessionV1(session) {
    return sessions.has(session);
  }

  return Object.freeze({
    flatManualNativeNoteReviews,
    flatManualNativeNoteActionTarget,
    createNativeValueManualGraphAccountSession,
    assertNativeWalletEconomicSessionV1,
    fenceOriginalNativeSessionEconomicRecoveryV1,
    captureOriginalNativeSessionEconomicRecoveryV1,
    stopCapturedNativeSessionEconomicRecoveryV1,
    abortNativeSessionEconomicRecoveryV1,
    reopenOriginalNativeSessionEconomicRecoveryV1,
    assertNativeSessionEconomicMembershipV1,
    assertOriginalNativeSessionSourceKeeperV1,
    prepareOriginalNativeSessionKeeperSourceCheckpointV1,
    confirmOriginalNativeSessionKeeperSourceCheckpointV1,
    createOriginalNativeSourceGraphAccountSessionV1,
    reopenOriginalNativeSessionSourceV1,
    nativeManualGraphReviews,
    nativeManualGraphHandoffBindings,
    nativeManualGraphActionTarget,
    readOriginalNativeSessionWalletEconomicSnapshotV1,
    createOriginalNativeSessionWalletEconomicStateV1,
    reopenOriginalNativeSessionWalletEconomicStateAfterCrashV1,
    readOriginalNativeSessionWalletEconomicStateV1,
    isOriginalNativeManualSessionV1,
  });
}
