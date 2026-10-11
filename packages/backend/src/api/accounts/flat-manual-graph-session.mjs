import {
  isOriginalNativeManualSessionV1,
  nativeManualGraphReviews,
  nativeManualGraphHandoffBindings,
  nativeManualGraphActionTarget,
  readOriginalNativeSessionWalletEconomicSnapshotV1,
  createOriginalNativeSessionWalletEconomicStateV1,
  reopenOriginalNativeSessionWalletEconomicStateAfterCrashV1,
  readOriginalNativeSessionWalletEconomicStateV1,
} from "../../operations/recovery/native-original-source-lifecycle-v1.mjs";
import assert from "node:assert/strict";

/** Private source-authenticated composition of the existing portfolio, mixed keeper
 * and FlatAccountSession. No new journal, graph schema or HTTP factory.
 * Use at initial trusted bootstrap, never migrate/replace a live keeper. */
import { genericAccountIdentity, sha } from "@lianum/engine/accounts/journal";
import { exactRecord } from "@lianum/components/encoding/commitments";
import {
  assertOwnedFlatPortfolio,
  assertOwnedFlatPortfolioAccount,
} from "../../accounts/authority/flat-portfolio-authority.mjs";
import {
  flatAccountManualGraphDetails,
  assertFlatAccountManualGraphExecution,
} from "../../accounts/authority/flat-account-authority.mjs";

import { wrappedWalletAccountManualGraphDetailsV1, assertWrappedWalletAccountManualGraphExecutionV1 } from '../../accounts/authority/native-value-account-authority-v2.mjs';
import {
  assertOwnedWrappedWalletPortfolioV1,
  assertOwnedWrappedWalletPortfolioAccountV1,
  claimWrappedWalletPortfolioJournalV1,
} from "../../accounts/portfolio/wrapped-wallet-portfolio-v1.mjs";
const sessions = new WeakMap(),
  portfolios = new WeakSet(),
  catalogueSessions = new WeakSet();
const fail = (code) => {
  throw Object.assign(new Error(code), { code });
};
const need = (v, code) => {
  if (!v) fail(code);
};
const id = (v) =>
  typeof v === "string" && /^[A-Za-z0-9_-]{8,100}$/.exec(v)?.[0] === v;

function original(session, approval) {
  const binding = sessions.get(session);
  need(binding, "WALLET_ACCOUNT_GRAPH_FORBIDDEN");
  const details = binding.wrappedPortfolio
    ? wrappedWalletAccountManualGraphDetailsV1(approval)
    : flatAccountManualGraphDetails(approval);
  if (binding.wrappedPortfolio) {
    assertOwnedWrappedWalletPortfolioV1(
      binding.runtime,
      binding.wrappedPortfolio,
    );
    assertOwnedWrappedWalletPortfolioAccountV1(
      binding.wrappedPortfolio,
      details.account,
    );
  } else if (binding.catalogue) {
    binding.assertCatalogue(binding.catalogue, { runtime: binding.runtime });
    const current = binding.assertAccount(binding.catalogue, details.account);
    need(
      current.runtime === binding.runtime,
      "FLAT_ACCOUNT_MANUAL_GRAPH_GENERATION_CHANGED",
    );
    const retained = binding.memberships.get(approval);
    if (retained)
      need(
        current.portfolio === retained.portfolio &&
          current.generationId === retained.generationId,
        "FLAT_ACCOUNT_MANUAL_GRAPH_GENERATION_CHANGED",
      );
  } else {
    assertOwnedFlatPortfolio(binding.runtime, binding.portfolio);
    assertOwnedFlatPortfolioAccount(binding.portfolio, details.account);
  }
  return details;
}

/** Private composition check, never a structural/session-ID membership test. */
export function assertFlatManualGraphCatalogueSession(
  session,
  { runtime, catalogue },
) {
  const binding = sessions.get(session);
  need(
    binding && binding.runtime === runtime && binding.catalogue === catalogue,
    "FLAT_ACCOUNT_ORIGINAL_CATALOGUE_SESSION_REQUIRED",
  );
  binding.assertCatalogue(catalogue, { runtime });
}

/** Retained immutable terms are review metadata, never fresh balance/finality. */
export function flatManualGraphReviews(session) {
  if (isOriginalNativeManualSessionV1(session))
    return nativeManualGraphReviews(session);
  const binding = sessions.get(session);
  if (!binding) return [];
  return [...binding.graphs.values()].map(
    (approval) => original(session, approval).review,
  );
}

/** Public identity metadata derived only from original branded memberships.
 * A browser-supplied generation/account label never selects authority. */
export function flatManualGraphHandoffBindings(session) {
  if (isOriginalNativeManualSessionV1(session))
    return nativeManualGraphHandoffBindings(session);
  const binding = sessions.get(session);
  if (!binding) return [];
  return [...binding.graphs.values(), ...(binding.notes?.values() ?? [])].map(
    (approval) => {
      const details = original(session, approval);
      const membership = binding.catalogue
        ? binding.assertAccount(binding.catalogue, details.account)
        : null;
      return Object.freeze({
        requestId: details.body.requestId,
        accountIdentitySHA256: sha(
          genericAccountIdentity(details.account.config),
        ),
        generationId:
          membership?.generationId ??
          sha(
            genericAccountIdentity(
              (binding.wrappedPortfolio ?? binding.portfolio).config,
            ),
          ),
        originalAccountLifetime: details.review.originalAccountLifetime,
        identitySHA256: details.review.identitySHA256,
      });
    },
  );
}

/** Exact immutable action target for the existing one-use HTTP capability.
 * TOP_UP/EXIT keep their original session target. Known GRAPH ids cannot be
 * disguised as another kind. No lookup from browser-supplied route metadata. */
export function flatManualGraphActionTarget(session, action, input) {
  if (isOriginalNativeManualSessionV1(session))
    return nativeManualGraphActionTarget(session, action, input);
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
    (binding.wrappedPortfolio
      ? assertWrappedWalletAccountManualGraphExecutionV1
      : assertFlatAccountManualGraphExecution)(approval);
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

/** Same original mixed-portfolio keeper and FlatAccountSession, privately constructed
 * together from the genuine portfolio. Accepts no injected keeper, authority,
 * route, endpoint, provider callback, owner key, or replacement checkpoint. */
export async function createFlatManualGraphAccountSession(input) {
  exactRecord(input, ["runtime", "portfolio", "journal"]);
  const { runtime, portfolio } = input;
  exactRecord(input.journal, ["path", "password"]);
  const journal = Object.freeze({
    path: input.journal.path,
    password: input.journal.password,
  });
  assertOwnedFlatPortfolio(runtime, portfolio);
  need(
    !portfolios.has(portfolio),
    "FLAT_ACCOUNT_MANUAL_GRAPH_SESSION_ALREADY_CREATED",
  );
  // Reserve synchronously before creating the original keeper. An uncertain
  // creation never permits another journal to impersonate the original.
  portfolios.add(portfolio);
  const {
    createFlatManualPortfolioKeeper,
    assertOwnedFlatManualPortfolioKeeper,
  } = await import("../../accounts/portfolio/flat-manual-portfolio-keeper.mjs");
  const { createFlatAccountSession } = await import(
    "./flat-account-session.mjs"
  );
  const keeper = await createFlatManualPortfolioKeeper({
    runtime,
    portfolio,
    journal,
  });
  assertOwnedFlatManualPortfolioKeeper(keeper, { runtime, portfolio });
  let session;
  try {
    session = await createFlatAccountSession({
      keeper,
      ownerHandoff: { ownerView: () => portfolio.ownerView() },
    });
  } catch (error) {
    await keeper.close();
    throw error;
  }
  const graphs = new Map();
  sessions.set(session, { runtime, portfolio, graphs });
  return Object.freeze({
    session,
    bindManualGraph(approval) {
      const details = original(session, approval),
        requestId = details.body.requestId;
      const old = graphs.get(requestId);
      need(!old || old === approval, "FLAT_ACCOUNT_MANUAL_GRAPH_REBOUND");
      need(old || graphs.size < 8, "FLAT_ACCOUNT_MANUAL_GRAPH_CAPACITY");
      // Body/approval identity is permanently bound before HTTP admission. A
      // lost reply, expiry or listener close neither removes nor replaces it.
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
}

/** Catalogue already owns every original generation keeper. This private join
 * creates only the existing presentation session around its exact facade; it
 * accepts neither a keeper nor routes/callbacks, and creates no second journal. */
export async function createFlatManualGraphCatalogueSession(input) {
  exactRecord(input, ["runtime", "catalogue"]);
  const { runtime, catalogue } = input;
  const {
    assertOwnedFlatJournalCatalogue: assertCatalogue,
    assertOwnedFlatJournalCatalogueAccount: assertAccount,
  } = await import("../../accounts/storage/flat-journal-catalogue.mjs");
  assertCatalogue(catalogue, { runtime });
  need(
    !catalogueSessions.has(catalogue),
    "FLAT_ACCOUNT_MANUAL_GRAPH_SESSION_ALREADY_CREATED",
  );
  catalogueSessions.add(catalogue);
  const { createFlatAccountSession } = await import(
    "./flat-account-session.mjs"
  );
  const session = await createFlatAccountSession({
    keeper: catalogue.keeper,
    ownerHandoff: { ownerView: () => catalogue.ownerView() },
  });
  const graphs = new Map(),
    memberships = new WeakMap();
  let bindingPending = false;
  sessions.set(session, {
    runtime,
    catalogue,
    graphs,
    memberships,
    assertCatalogue,
    assertAccount,
  });
  return Object.freeze({
    session,
    async bindManualGraph(approval) {
      need(!bindingPending, "FLAT_ACCOUNT_MANUAL_GRAPH_BINDING_BUSY");
      const details = original(session, approval),
        requestId = details.body.requestId,
        old = graphs.get(requestId);
      need(!old || old === approval, "FLAT_ACCOUNT_MANUAL_GRAPH_REBOUND");
      need(old || graphs.size < 8, "FLAT_ACCOUNT_MANUAL_GRAPH_CAPACITY");
      for (const value of graphs.values())
        if (value !== approval)
          need(
            original(session, value).body.ownerOperationRef !==
              details.body.ownerOperationRef,
            "FLAT_ACCOUNT_MANUAL_GRAPH_REBOUND",
          );
      const membership = assertAccount(catalogue, details.account);
      bindingPending = true;
      try {
        // Durable exact ID/ref -> original-generation binding/readback must
        // succeed BEFORE this approval becomes visible to HTTP or token minting.
        const body = await catalogue.bindManualGraphApproval(approval);
        exactRecord(body, [
          "requestId",
          "kind",
          "ownerOperationRef",
          "assetId",
        ]);
        need(
          Object.keys(details.body).every(
            (key) => body[key] === details.body[key],
          ),
          "FLAT_ACCOUNT_MANUAL_GRAPH_REBOUND",
        );
        original(session, approval);
        const current = assertAccount(catalogue, details.account);
        need(
          current.runtime === runtime &&
            current.portfolio === membership.portfolio &&
            current.generationId === membership.generationId,
          "FLAT_ACCOUNT_MANUAL_GRAPH_GENERATION_CHANGED",
        );
        memberships.set(
          approval,
          Object.freeze({
            portfolio: current.portfolio,
            generationId: current.generationId,
          }),
        );
        graphs.set(requestId, approval);
        return structuredClone(details.body);
      } finally {
        bindingPending = false;
      }
    },
  });
}

/** One wrapped BTC/SOL session through the same generic keeper and HTTP/SDK.
 * This is an initial original construction, never catalogue adoption. */
export async function createWrappedWalletManualGraphSessionV1(input) {
  return wrappedGraphSession(input, null);
}
async function wrappedGraphSession(input, recovery) {
  exactRecord(input, ["runtime", "portfolio", "journal"]);
  const { runtime, portfolio } = input;
  exactRecord(input.journal, ["path", "password"]);
  const journal = Object.freeze({
    path: input.journal.path,
    password: input.journal.password,
  });
  assertOwnedWrappedWalletPortfolioV1(runtime, portfolio);
  claimWrappedWalletPortfolioJournalV1(runtime, portfolio); // one attempt, including uncertain/failed creation
  const {
    createDurableGenericAccountKeeperV1,
    reopenDurableGenericAccountKeeperV1,
  } = await import("../../accounts/storage/durable-generic-account-keeper.mjs");
  const { createFlatAccountSession } = await import(
    "./flat-account-session.mjs"
  );
  const lifetimeRegistry = await import(
      "../../claims/wrapped/recovery/wrapped-recovery-authority-v1.mjs"
    ),
    lifetimeIdentity = {
      profile: "WRAPPED_GRAPH_KEEPER_LIFETIME_V1",
      config: portfolio.config,
    };
  let lifetimeHandle;
  if (recovery) {
    const original = await lifetimeRegistry.readWrappedPrivateLifetimePartV1(
      runtime,
      "wallet-graph-keeper",
      lifetimeIdentity,
    );
    assert.deepEqual(
      original.privateState,
      {
        config: portfolio.config,
        journal,
        checkpoint: recovery.keeper.checkpoint,
        pendingCheckpoint: recovery.keeper.pendingCheckpoint,
        parentCheckpoint: recovery.keeper.parentCheckpoint,
      },
      "WRAPPED_GRAPH_REGISTRY_CHECKPOINT_CHANGED",
    );
    lifetimeHandle = original.handle;
  } else
    lifetimeHandle = await lifetimeRegistry.retainWrappedPrivateLifetimePartV1(
      runtime,
      "wallet-graph-keeper",
      lifetimeIdentity,
      {
        config: portfolio.config,
        journal,
        checkpoint: null,
        pendingCheckpoint: null,
        parentCheckpoint: null,
      },
    );
  const keeper = recovery
    ? await reopenDurableGenericAccountKeeperV1(
        { config: portfolio.config, journal, authority: portfolio.authority },
        recovery.keeper,
        lifetimeHandle,
      )
    : await createDurableGenericAccountKeeperV1(
        { config: portfolio.config, journal, authority: portfolio.authority },
        lifetimeHandle,
      );
  let session, state;
  const check = (action, value) =>
    need(
      flatManualGraphActionTarget(
        session,
        action,
        action === "prepare" ? value : { requestId: value },
      ),
      "WALLET_ACCOUNT_GRAPH_FORBIDDEN",
    );
  const originalKeeper = Object.freeze({
    prepare(value) {
      check("prepare", value);
      return keeper.prepare(value);
    },
    execute(value) {
      check("execute", value);
      return keeper.execute(value);
    },
    reconcile(value) {
      check("reconcile", value);
      return keeper.reconcile(value);
    },
    recover(value) {
      check("recover", value);
      return keeper.recover(value);
    },
    snapshot: () => keeper.snapshot(),
    restartCoordinator: () => keeper.restartCoordinator(),
    async close() {
      if (state?.economicAcquisition)
        await state.economicAcquisition.catch(() => {});
      await state?.economicState?.close();
      return keeper.close();
    },
  });
  try {
    session = await createFlatAccountSession({
      keeper: originalKeeper,
      ownerHandoff: { ownerView: () => portfolio.ownerView() },
    });
  } catch (error) {
    await keeper.close();
    throw error;
  }
  const graphs = new Map();
  state = {
    runtime,
    wrappedPortfolio: portfolio,
    graphs,
    journal,
    durableKeeper: keeper,
    captured: false,
  };
  sessions.set(session, state);
  return Object.freeze({
    session,
    bindManualGraph(approval) {
      const details = original(session, approval),
        requestId = details.body.requestId,
        old = graphs.get(requestId);
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
}

/** Private session memberships for read-only economic state. The references
 * come from this original composition, never a caller account ID or route DTO. */

export function assertWrappedWalletEconomicSessionV1(session, expected) {
  need(arguments.length === 2, "WRAPPED_SESSION_ARGUMENTS");
  exactRecord(expected, ["runtime", "portfolio"]);
  const state = sessions.get(session);
  need(
    state?.wrappedPortfolio &&
      state.durableKeeper &&
      !state.recoveryFence &&
      !state.captured,
    "WRAPPED_SESSION_ORIGINAL_REQUIRED",
  );
  need(
    state.runtime === expected.runtime &&
      state.wrappedPortfolio === expected.portfolio,
    "WRAPPED_SESSION_ORIGINAL_MEMBERSHIP_REQUIRED",
  );
  assertOwnedWrappedWalletPortfolioV1(state.runtime, state.wrappedPortfolio);
}
export async function readOriginalSessionWalletEconomicSnapshotV1(session) {
  need(arguments.length === 1, "WALLET_ECONOMIC_SESSION_ARGUMENTS");
  if (isOriginalNativeManualSessionV1(session))
    return readOriginalNativeSessionWalletEconomicSnapshotV1(session);
  const state = sessions.get(session);
  need(state?.wrappedPortfolio, "WALLET_ECONOMIC_ORIGINAL_SESSION_REQUIRED");
  assertWrappedWalletEconomicSessionV1(session, {
    runtime: state.runtime,
    portfolio: state.wrappedPortfolio,
  });
  const snapshot = await session.snapshot(),
    approvals = [...state.graphs.values(), ...(state.notes?.values() ?? [])];
  const requests = snapshot.requests.map((request) => {
    const matches = approvals
      .map((approval) => original(session, approval))
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
    nativeAccounts: [],
    wrappedPortfolios: state.wrappedPortfolio
      ? [{ runtime: state.runtime, portfolio: state.wrappedPortfolio, session }]
      : [],
    journal,
  };
}
async function sessionEconomicState(session, retained, afterCrash = false) {
  const state = sessions.get(session);
  need(
    state?.durableKeeper &&
      state.wrappedPortfolio &&
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
    const module = await import(
      "../../accounts/state/original-wallet-economic-state-v1.mjs"
    );
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
export async function createOriginalSessionWalletEconomicStateV1(session) {
  need(arguments.length === 1, "WALLET_ECONOMIC_SESSION_ARGUMENTS");
  if (isOriginalNativeManualSessionV1(session))
    return createOriginalNativeSessionWalletEconomicStateV1(session);
  const state = sessions.get(session);
  need(state?.wrappedPortfolio, "WALLET_ECONOMIC_ORIGINAL_SESSION_REQUIRED");
  assertWrappedWalletEconomicSessionV1(session, {
    runtime: state.runtime,
    portfolio: state.wrappedPortfolio,
  });
  return sessionEconomicState(session, null);
}
/** PRIVATE: the source session must already have its original authority and
 * keeper restored. The anchor never reconstructs either from a journal ID. */
export async function reopenOriginalSessionWalletEconomicStateAfterCrashV1(
  session,
) {
  need(arguments.length === 1, "WALLET_ECONOMIC_SESSION_ARGUMENTS");
  if (isOriginalNativeManualSessionV1(session))
    return reopenOriginalNativeSessionWalletEconomicStateAfterCrashV1(session);
  const state = sessions.get(session);
  need(state?.wrappedPortfolio, "WALLET_ECONOMIC_ORIGINAL_SESSION_REQUIRED");
  assertWrappedWalletEconomicSessionV1(session, {
    runtime: state.runtime,
    portfolio: state.wrappedPortfolio,
  });
  return sessionEconomicState(session, null, true);
}
export function readOriginalSessionWalletEconomicStateV1(session) {
  need(arguments.length === 1, "WALLET_ECONOMIC_SESSION_ARGUMENTS");
  if (isOriginalNativeManualSessionV1(session))
    return readOriginalNativeSessionWalletEconomicStateV1(session);
  const state = sessions.get(session);
  need(
    state?.durableKeeper && state.wrappedPortfolio,
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

/** Distinct original registry: used only to require the same exact handoff at
 * every HTTP wrapped GRAPH action. A serialized profile never selects it. */
export function flatManualWrappedGraphActionTarget(session, action, input) {
  return sessions.get(session)?.wrappedPortfolio
    ? flatManualGraphActionTarget(session, action, input)
    : null;
}

export async function captureWrappedWalletGraphSessionV1(session) {
  const state = sessions.get(session);
  need(
    state?.wrappedPortfolio && state.durableKeeper && !state.captured,
    "WALLET_ACCOUNT_ORIGINAL_SESSION_REQUIRED",
  );
  if (!state.recoveryFence) fenceWrappedWalletGraphSessionV1(session);
  state.captured = true;
  const drained = await Promise.allSettled([
    state.recoveryFence,
    state.economicCapture ?? Promise.resolve(null),
  ]);
  for (const outcome of drained)
    if (outcome.status === "rejected") throw outcome.reason;
  const { captureDurableGenericAccountKeeperV1 } = await import(
    "../../accounts/storage/durable-generic-account-keeper.mjs"
  );
  try {
    const economicState = await capturedSessionEconomicState(state);
    return {
      schema: economicState
        ? "WRAPPED_ORIGINAL_GRAPH_SESSION_ECONOMIC_RECOVERY_V1"
        : "WRAPPED_ORIGINAL_GRAPH_SESSION_RECOVERY_V1",
      keeper: await captureDurableGenericAccountKeeperV1(state.durableKeeper),
      reviews: state.recoveryReviews,
      ...(economicState ? { economicState } : {}),
    };
  } catch (error) {
    try {
      await state.durableKeeper.close();
    } catch (cleanup) {
      throw new AggregateError(
        [error, cleanup],
        "WRAPPED_GRAPH_CAPTURE_CLEANUP_FAILED",
        { cause: error },
      );
    }
    throw error;
  }
}
export async function reopenWrappedWalletGraphSessionV1(token) {
  const { consumeWrappedWalletRecoveryPartV1 } = await import(
    "../../operations/wallet/wrapped-wallet-composition-v1.mjs"
  );
  const retained = consumeWrappedWalletRecoveryPartV1(token, "graph-keeper");
  exactRecord(retained, ["input", "record", "approvals"]);
  const economic =
    retained.record.schema ===
    "WRAPPED_ORIGINAL_GRAPH_SESSION_ECONOMIC_RECOVERY_V1";
  exactRecord(
    retained.record,
    economic
      ? ["schema", "keeper", "reviews", "economicState"]
      : ["schema", "keeper", "reviews"],
  );
  need(
    economic ||
      retained.record.schema === "WRAPPED_ORIGINAL_GRAPH_SESSION_RECOVERY_V1",
    "WALLET_ACCOUNT_ORIGINAL_SESSION_REQUIRED",
  );
  if (economic)
    exactRecord(retained.record.economicState, ["journal", "checkpoint"]);
  const joined = await wrappedGraphSession(retained.input, retained.record);
  try {
    const reviews = retained.approvals.map((approval) => {
      const details = wrappedWalletAccountManualGraphDetailsV1(approval);
      return { body: details.body, review: details.review };
    });
    // Vault canonicalizes JSON key order; bind every retained term using the
    // same canonical digest as native session recovery.
    need(
      sha(reviews) === sha(retained.record.reviews),
      "WALLET_ACCOUNT_ORIGINAL_REVIEWS_CHANGED",
    );
    for (const approval of retained.approvals) joined.bindManualGraph(approval);
    if (economic)
      await sessionEconomicState(joined.session, retained.record.economicState);
    return joined;
  } catch (error) {
    await joined.session.close();
    throw error;
  }
}

export function fenceWrappedWalletGraphSessionV1(session) {
  const state = sessions.get(session);
  need(
    state?.wrappedPortfolio &&
      state.durableKeeper &&
      !state.captured &&
      !state.recoveryFence,
    "WALLET_ACCOUNT_ORIGINAL_SESSION_REQUIRED",
  );
  state.recoveryReviews = [...state.graphs.values()].map((approval) => {
    const details = original(session, approval);
    return { body: details.body, review: details.review };
  });
  fenceSessionEconomicState(state);
  state.recoveryFence = session.quiesceForPrivateRecovery();
  state.recoveryFence.catch(() => {});
}
