import { nativeSourceRecoverySectionIdentityV1, retainOriginalNativeSourceSectionV1, consumeOriginalNativeSourceSectionV1,
  updateOriginalNativeSourceSectionV1, resumeOriginalNativeSourceSectionV1, nativeSourceRecoveryOwnedProcessV1 }
  from '../../operations/recovery/native-original-source-lifecycle-v1.mjs';
import { assertOriginalNativeAccountSourceV1 } from '../../accounts/authority/native-value-account-authority-v2.mjs';
/** Private source-authenticated composition of the existing portfolio, mixed keeper
 * and FlatAccountSession. No new journal, graph schema or HTTP factory.
 * Use at initial trusted bootstrap, never migrate/replace a live keeper. */
import { genericAccountIdentity, sha } from '@lianum/engine/accounts/journal';
import { exactRecord } from '@lianum/components/encoding/commitments';
import { assertOwnedFlatPortfolio, assertOwnedFlatPortfolioAccount } from '../../accounts/authority/flat-portfolio-authority.mjs';
import { flatAccountManualGraphDetails, assertFlatAccountManualGraphExecution } from '../../accounts/authority/flat-account-authority.mjs';

import { assertOwnedNativeValueAccountAuthority, nativeValueAccountManualGraphDetails, assertNativeValueAccountManualGraphExecution, nativeValueAccountManualNoteDetails } from '../../accounts/authority/native-value-account-authority-v2.mjs';

import { assertNativeEconomicRecoveryCaptureV1, nativeEconomicRecoverySectionIdentityV1, consumeNativeEconomicRecoverySectionV1 }
  from '../../claims/wrapped/recovery/wrapped-recovery-authority-v1.mjs';
import { nativeValueOriginalRecoverySourceV1 } from '../../operations/deployments/native-value/native-value-system-v2.mjs';
import { wrappedWalletAccountManualGraphDetailsV1, assertWrappedWalletAccountManualGraphExecutionV1 } from '../../accounts/authority/wrapped-wallet-account-authority-v1.mjs';
import { assertOwnedWrappedWalletPortfolioV1, assertOwnedWrappedWalletPortfolioAccountV1, claimWrappedWalletPortfolioJournalV1 } from '../../accounts/portfolio/wrapped-wallet-portfolio-v1.mjs';
const sessions = new WeakMap(), portfolios = new WeakSet(), catalogueSessions = new WeakSet(), nativeAccounts = new WeakSet();
const fail = code => { throw Object.assign(new Error(code), { code }); };
const need = (v, code) => { if (!v) fail(code); };
const id = v => typeof v === 'string' && /^[A-Za-z0-9_-]{8,100}$/.exec(v)?.[0] === v;

function original(session, approval) {
  const binding = sessions.get(session);
  need(binding, 'WALLET_ACCOUNT_GRAPH_FORBIDDEN');
  const details = binding.wrappedPortfolio ? wrappedWalletAccountManualGraphDetailsV1(approval) : binding.nativeAccount ? nativeValueAccountManualGraphDetails(approval) : flatAccountManualGraphDetails(approval);
  if (binding.wrappedPortfolio) {
    assertOwnedWrappedWalletPortfolioV1(binding.runtime, binding.wrappedPortfolio);
    assertOwnedWrappedWalletPortfolioAccountV1(binding.wrappedPortfolio, details.account);
  } else if (binding.nativeAccount) {
    assertOwnedNativeValueAccountAuthority(binding.nativeAccount, { runtime: binding.runtime, system: binding.system, poolIndex: binding.poolIndex });
    need(details.account === binding.nativeAccount, 'FLAT_ACCOUNT_MANUAL_GRAPH_ORIGINAL_ACCOUNT_REQUIRED');
  } else if (binding.catalogue) {
    binding.assertCatalogue(binding.catalogue, { runtime: binding.runtime });
    const current = binding.assertAccount(binding.catalogue, details.account);
    need(current.runtime === binding.runtime, 'FLAT_ACCOUNT_MANUAL_GRAPH_GENERATION_CHANGED');
    const retained = binding.memberships.get(approval);
    if (retained) need(current.portfolio === retained.portfolio && current.generationId === retained.generationId,
      'FLAT_ACCOUNT_MANUAL_GRAPH_GENERATION_CHANGED');
  } else {
    assertOwnedFlatPortfolio(binding.runtime, binding.portfolio);
    assertOwnedFlatPortfolioAccount(binding.portfolio, details.account);
  }
  return details;
}

/** Private composition check, never a structural/session-ID membership test. */
export function assertFlatManualGraphCatalogueSession(session, { runtime, catalogue }) {
  const binding = sessions.get(session);
  need(binding && binding.runtime === runtime && binding.catalogue === catalogue,
    'FLAT_ACCOUNT_ORIGINAL_CATALOGUE_SESSION_REQUIRED');
  binding.assertCatalogue(catalogue, { runtime });
}

/** Retained immutable terms are review metadata, never fresh balance/finality. */
export function flatManualGraphReviews(session) {
  const binding = sessions.get(session);
  if (!binding) return [];
  return [...binding.graphs.values()].map(approval => original(session, approval).review);
}

/** Native notes use their own owner-local approval registry. Neither legacy
 * note metadata nor a graph approval may impersonate native note consent. */
function originalNote(session, approval) {
  const binding = sessions.get(session);
  need(binding?.nativeAccount, 'NATIVE_VALUE_MANUAL_NOTE_SESSION_REQUIRED');
  assertOwnedNativeValueAccountAuthority(binding.nativeAccount, { runtime: binding.runtime,
    system: binding.system, poolIndex: binding.poolIndex });
  const details = nativeValueAccountManualNoteDetails(approval);
  need(details.account === binding.nativeAccount, 'NATIVE_VALUE_MANUAL_NOTE_ACCOUNT_CHANGED');
  return details;
}
export function flatManualNativeNoteReviews(session) {
  const binding = sessions.get(session);
  return [...(binding?.notes?.values() ?? [])].map(approval => originalNote(session, approval).review);
}
export function flatManualNativeNoteActionTarget(session, action, input) {
  const binding = sessions.get(session), approval = binding?.notes?.get(input.requestId);
  if (!approval) return null;
  need(['prepare', 'execute', 'reconcile'].includes(action), 'NATIVE_VALUE_MANUAL_NOTE_ACTION');
  exactRecord(input, action === 'prepare' ? ['requestId', 'kind', 'ownerOperationRef', 'assetId'] : ['requestId']);
  const details = originalNote(session, approval);
  if (action === 'prepare') need(Object.keys(details.body).every(key => input[key] === details.body[key]),
    'NATIVE_VALUE_MANUAL_NOTE_BODY_CHANGED');
  return approval;
}

/** Public identity metadata derived only from original branded memberships.
 * A browser-supplied generation/account label never selects authority. */
export function flatManualGraphHandoffBindings(session) {
  const binding = sessions.get(session);
  if (!binding) return [];
  return [...binding.graphs.values(), ...(binding.notes?.values() ?? [])].map(approval => {
    const details = binding.notes && [...binding.notes.values()].includes(approval) ? originalNote(session, approval) : original(session, approval);
    const membership = binding.catalogue ? binding.assertAccount(binding.catalogue, details.account) : null;
    return Object.freeze({ requestId: details.body.requestId,
      accountIdentitySHA256: sha(genericAccountIdentity(details.account.config)),
      generationId: membership?.generationId ?? sha(genericAccountIdentity((binding.wrappedPortfolio ?? binding.nativeAccount ?? binding.portfolio).config)),
      originalAccountLifetime: details.review.originalAccountLifetime,
      identitySHA256: details.review.identitySHA256 });
  });
}

/** Exact immutable action target for the existing one-use HTTP capability.
 * TOP_UP/EXIT keep their original session target. Known GRAPH ids cannot be
 * disguised as another kind. No lookup from browser-supplied route metadata. */
export function flatManualGraphActionTarget(session, action, input) {
  need(['prepare', 'execute', 'reconcile', 'recover'].includes(action), 'WALLET_ACCOUNT_GRAPH_FORBIDDEN');
  exactRecord(input, action === 'prepare' ? ['requestId', 'kind', 'ownerOperationRef', 'assetId'] : ['requestId']);
  const binding = sessions.get(session), approval = binding?.graphs.get(input.requestId);
  if (!approval) {
    if (action === 'prepare' && input.kind === 'GRAPH') fail('WALLET_ACCOUNT_GRAPH_FORBIDDEN');
    return null;
  }
  const { body } = original(session, approval);
  // Terminal reconciliation/F retains the immutable original even if its
  // provider has become unavailable after delivery. It never creates a route.
  if (action === 'prepare' || action === 'execute')
    (binding.wrappedPortfolio ? assertWrappedWalletAccountManualGraphExecutionV1 : binding.nativeAccount ? assertNativeValueAccountManualGraphExecution : assertFlatAccountManualGraphExecution)(approval);
  need(['prepare', 'execute', 'reconcile', 'recover'].includes(action), 'WALLET_ACCOUNT_GRAPH_FORBIDDEN');
  if (action === 'prepare') {
    exactRecord(input, ['requestId', 'kind', 'ownerOperationRef', 'assetId']);
    need(Object.keys(body).every(key => input[key] === body[key]), 'WALLET_ACCOUNT_GRAPH_BINDING_CHANGED');
  } else {
    exactRecord(input, ['requestId']); need(id(input.requestId), 'WALLET_ACCOUNT_REQUEST_ID');
  }
  return approval;
}

/** Same original mixed-portfolio keeper and FlatAccountSession, privately constructed
 * together from the genuine portfolio. Accepts no injected keeper, authority,
 * route, endpoint, provider callback, owner key, or replacement checkpoint. */
export async function createFlatManualGraphAccountSession(input) {
  exactRecord(input, ['runtime', 'portfolio', 'journal']);
  const { runtime, portfolio } = input;
  exactRecord(input.journal, ['path', 'password']);
  const journal = Object.freeze({ path: input.journal.path, password: input.journal.password });
  assertOwnedFlatPortfolio(runtime, portfolio);
  need(!portfolios.has(portfolio), 'FLAT_ACCOUNT_MANUAL_GRAPH_SESSION_ALREADY_CREATED');
  // Reserve synchronously before creating the original keeper. An uncertain
  // creation never permits another journal to impersonate the original.
  portfolios.add(portfolio);
  const { createFlatManualPortfolioKeeper, assertOwnedFlatManualPortfolioKeeper } = await import('../../accounts/portfolio/flat-manual-portfolio-keeper.mjs');
  const { createFlatAccountSession } = await import('./flat-account-session.mjs');
  const keeper = await createFlatManualPortfolioKeeper({ runtime, portfolio, journal });
  assertOwnedFlatManualPortfolioKeeper(keeper, { runtime, portfolio });
  let session;
  try { session = await createFlatAccountSession({ keeper, ownerHandoff: { ownerView: () => portfolio.ownerView() } }); }
  catch (error) { await keeper.close(); throw error; }
  const graphs = new Map(); sessions.set(session, { runtime, portfolio, graphs });
  return Object.freeze({ session,
    bindManualGraph(approval) {
      const details = original(session, approval), requestId = details.body.requestId;
      const old = graphs.get(requestId);
      need(!old || old === approval, 'FLAT_ACCOUNT_MANUAL_GRAPH_REBOUND');
      need(old || graphs.size < 8, 'FLAT_ACCOUNT_MANUAL_GRAPH_CAPACITY');
      // Body/approval identity is permanently bound before HTTP admission. A
      // lost reply, expiry or listener close neither removes nor replaces it.
      for (const value of graphs.values()) if (value !== approval)
        need(original(session, value).body.ownerOperationRef !== details.body.ownerOperationRef, 'FLAT_ACCOUNT_MANUAL_GRAPH_REBOUND');
      graphs.set(requestId, approval);
      return structuredClone(details.body);
    },
  });
}


/** Catalogue already owns every original generation keeper. This private join
 * creates only the existing presentation session around its exact facade; it
 * accepts neither a keeper nor routes/callbacks, and creates no second journal. */
export async function createFlatManualGraphCatalogueSession(input) {
  exactRecord(input, ['runtime', 'catalogue']);
  const { runtime, catalogue } = input;
  const { assertOwnedFlatJournalCatalogue: assertCatalogue,
    assertOwnedFlatJournalCatalogueAccount: assertAccount } = await import('../../accounts/storage/flat-journal-catalogue.mjs');
  assertCatalogue(catalogue, { runtime });
  need(!catalogueSessions.has(catalogue), 'FLAT_ACCOUNT_MANUAL_GRAPH_SESSION_ALREADY_CREATED');
  catalogueSessions.add(catalogue);
  const { createFlatAccountSession } = await import('./flat-account-session.mjs');
  const session = await createFlatAccountSession({ keeper: catalogue.keeper,
    ownerHandoff: { ownerView: () => catalogue.ownerView() } });
  const graphs = new Map(), memberships = new WeakMap(); let bindingPending = false;
  sessions.set(session, { runtime, catalogue, graphs, memberships, assertCatalogue, assertAccount });
  return Object.freeze({ session,
    async bindManualGraph(approval) {
      need(!bindingPending, 'FLAT_ACCOUNT_MANUAL_GRAPH_BINDING_BUSY');
      const details = original(session, approval), requestId = details.body.requestId, old = graphs.get(requestId);
      need(!old || old === approval, 'FLAT_ACCOUNT_MANUAL_GRAPH_REBOUND');
      need(old || graphs.size < 8, 'FLAT_ACCOUNT_MANUAL_GRAPH_CAPACITY');
      for (const value of graphs.values()) if (value !== approval)
        need(original(session, value).body.ownerOperationRef !== details.body.ownerOperationRef, 'FLAT_ACCOUNT_MANUAL_GRAPH_REBOUND');
      const membership = assertAccount(catalogue, details.account);
      bindingPending = true;
      try {
        // Durable exact ID/ref -> original-generation binding/readback must
        // succeed BEFORE this approval becomes visible to HTTP or token minting.
        const body = await catalogue.bindManualGraphApproval(approval);
        exactRecord(body, ['requestId', 'kind', 'ownerOperationRef', 'assetId']);
        need(Object.keys(details.body).every(key => body[key] === details.body[key]), 'FLAT_ACCOUNT_MANUAL_GRAPH_REBOUND');
        original(session, approval);
        const current = assertAccount(catalogue, details.account);
        need(current.runtime === runtime && current.portfolio === membership.portfolio
          && current.generationId === membership.generationId, 'FLAT_ACCOUNT_MANUAL_GRAPH_GENERATION_CHANGED');
        memberships.set(approval, Object.freeze({ portfolio: current.portfolio, generationId: current.generationId }));
        graphs.set(requestId, approval);
        return structuredClone(details.body);
      } finally { bindingPending = false; }
    },
  });
}


/** Initial trusted bootstrap for one genuine native-value account. This joins
 * its original authority to the existing generic keeper, FlatAccountSession,
 * HTTP one-use handoff and shared browser/Node SDK. It never fabricates a legacy
 * portfolio/catalogue brand, adopts a journal, or enables native-backed claims.
 * The returned session admits only its exact original graph or native note approvals. */
export async function createNativeValueManualGraphAccountSession(input) { return nativeGraphSession(input, null); }
async function nativeGraphSession(input, recovery) {
  exactRecord(input, ['runtime', 'system', 'poolIndex', 'account', 'journal']);
  const { runtime, system, poolIndex, account } = input;
  exactRecord(input.journal, ['path', 'password']);
  const journal = Object.freeze({ path: input.journal.path, password: input.journal.password });
  assertOwnedNativeValueAccountAuthority(account, { runtime, system, poolIndex });
  need(system.claimsEnabled === false && account.features.nativeManualNoteConsent === true,
    'FLAT_ACCOUNT_NATIVE_GRAPH_ONLY_REQUIRED');
  need(!nativeAccounts.has(account), 'FLAT_ACCOUNT_MANUAL_GRAPH_SESSION_ALREADY_CREATED');
  nativeAccounts.add(account); // uncertain creation never grants a second journal
  const { createDurableGenericAccountKeeperV1, reopenDurableGenericAccountKeeperV1 } = await import('../../accounts/storage/durable-generic-account-keeper.mjs');
  const { createFlatAccountSession } = await import('./flat-account-session.mjs');
  const keeper = recovery
    ? await reopenDurableGenericAccountKeeperV1({ config: account.config, journal, authority: account.authority }, recovery.keeper)
    : await createDurableGenericAccountKeeperV1({ config: account.config, journal, authority: account.authority });
  let session, state;
  const originalApproval = (action, value) => {
    const body = action === 'prepare' ? value : { requestId: value };
    const approval = flatManualGraphActionTarget(session, action, body) ?? flatManualNativeNoteActionTarget(session, action, body);
    need(approval, 'WALLET_ACCOUNT_GRAPH_FORBIDDEN');
  };
  const graphKeeper = Object.freeze({
    prepare(value) { originalApproval('prepare', value); return originalSourceSessionWork(session,()=>keeper.prepare(value)); },
    execute(value) { originalApproval('execute', value); return originalSourceSessionWork(session,()=>keeper.execute(value)); },
    reconcile(value) { originalApproval('reconcile', value); return originalSourceSessionWork(session,()=>keeper.reconcile(value)); },
    recover(value) { originalApproval('recover', value); return originalSourceSessionWork(session,()=>keeper.recover(value)); },
    snapshot: () => keeper.snapshot(), restartCoordinator: () => {need(!state?.nativeSource,'NATIVE_SOURCE_LIVE_COORDINATOR_REPLACEMENT_FORBIDDEN');return keeper.restartCoordinator();},
    async close() { if(state?.economicAcquisition)await state.economicAcquisition.catch(()=>{});await state?.economicState?.close(); return keeper.close(); },
  });
  try { session = await createFlatAccountSession({ keeper: graphKeeper, ownerHandoff: { ownerView: () => account.ownerView() } }); }
  catch (error) { await keeper.close(); throw error; }
  const graphs = new Map(), notes = new Map(); state = { runtime, system, poolIndex, nativeAccount: account, graphs, notes, journal,
    durableKeeper: keeper, nativeCaptured: false, nativeFence: null, nativeIdentity: null, nativeRecord: null, nativeCapturePromise: null, nativeKeeperCaptureStarted: false, nativeStopped: false };
  sessions.set(session, state);
  const joined = Object.freeze({ session,
    bindManualNote(approval) {
      const details = originalNote(session, approval), requestId = details.body.requestId, old = notes.get(requestId);
      need(!graphs.has(requestId) && (!old || old === approval), 'NATIVE_VALUE_MANUAL_NOTE_REBOUND');
      need(old || notes.size < 4, 'NATIVE_VALUE_MANUAL_NOTE_CAPACITY');
      for (const value of [...notes.values(), ...graphs.values()]) {
        const other = notes.has(requestId) && value === old ? null
          : [...notes.values()].includes(value) ? originalNote(session, value) : original(session, value);
        if (other && value !== approval) need(other.body.ownerOperationRef !== details.body.ownerOperationRef, 'NATIVE_VALUE_MANUAL_NOTE_REBOUND');
      }
      notes.set(requestId, approval); return structuredClone(details.body);
    },
    bindManualGraph(approval) {
      const details = original(session, approval), requestId = details.body.requestId;
      need(!notes.has(requestId), 'NATIVE_VALUE_MANUAL_NOTE_REBOUND');
      for (const value of notes.values()) need(originalNote(session, value).body.ownerOperationRef !== details.body.ownerOperationRef, 'NATIVE_VALUE_MANUAL_NOTE_REBOUND');
      const old = graphs.get(requestId);
      need(!old || old === approval, 'FLAT_ACCOUNT_MANUAL_GRAPH_REBOUND');
      need(old || graphs.size < 8, 'FLAT_ACCOUNT_MANUAL_GRAPH_CAPACITY');
      for (const value of graphs.values()) if (value !== approval)
        need(original(session, value).body.ownerOperationRef !== details.body.ownerOperationRef, 'FLAT_ACCOUNT_MANUAL_GRAPH_REBOUND');
      graphs.set(requestId, approval); return structuredClone(details.body);
    },
  });
  if (recovery) {
    try {
      assertOwnedNativeValueAccountAuthority(account, { runtime, system, poolIndex, owner: recovery.owner });
      // This original factory reads the SAME owner Vault and the recovered
      // account journal. It does not adopt a saved review as a capability.
      const preparation = recovery.source&&recovery.notes.length===0?null:await account.ownerActions.restoreManualPreparation();
      for (const retained of recovery.notes) {
        await preparation.reconcileOriginal({ requestId: retained.body.requestId });
        const approval = preparation.originalApproval(retained.body.requestId), details = nativeValueAccountManualNoteDetails(approval);
        need(sha({ body: details.body, review: details.review }) === sha(retained), 'NATIVE_SESSION_ORIGINAL_NOTE_CHANGED');
        joined.bindManualNote(approval);
      }
      const snapshot = await session.snapshot();
      need(snapshot.storageAvailable && snapshot.observation === 'CURRENT' && snapshot.revision === recovery.journalRevision,
        'NATIVE_SESSION_ORIGINAL_JOURNAL_CHANGED');
      if (Object.hasOwn(recovery,'economicState')) await sessionEconomicState(session, recovery.economicState);
    } catch (error) { await session.close(); throw error; }
  }
  return joined;
}

/** One wrapped BTC/SOL session through the same generic keeper and HTTP/SDK.
 * This is an initial original construction, never catalogue adoption. */
export async function createWrappedWalletManualGraphSessionV1(input) {return wrappedGraphSession(input,null);}
async function wrappedGraphSession(input,recovery){
  exactRecord(input, ['runtime', 'portfolio', 'journal']); const { runtime, portfolio } = input;
  exactRecord(input.journal, ['path', 'password']);
  const journal = Object.freeze({ path: input.journal.path, password: input.journal.password });
  assertOwnedWrappedWalletPortfolioV1(runtime, portfolio);
  claimWrappedWalletPortfolioJournalV1(runtime, portfolio); // one attempt, including uncertain/failed creation
  const {createDurableGenericAccountKeeperV1,reopenDurableGenericAccountKeeperV1}=await import('../../accounts/storage/durable-generic-account-keeper.mjs');
  const { createFlatAccountSession } = await import('./flat-account-session.mjs');
  const lifetimeRegistry=await import('../../claims/wrapped/recovery/wrapped-recovery-authority-v1.mjs'),lifetimeIdentity={profile:'WRAPPED_GRAPH_KEEPER_LIFETIME_V1',config:portfolio.config};let lifetimeHandle;
  if(recovery){const original=await lifetimeRegistry.readWrappedPrivateLifetimePartV1(runtime,'wallet-graph-keeper',lifetimeIdentity);assert.deepEqual(original.privateState,{config:portfolio.config,journal,checkpoint:recovery.keeper.checkpoint,pendingCheckpoint:recovery.keeper.pendingCheckpoint,parentCheckpoint:recovery.keeper.parentCheckpoint},'WRAPPED_GRAPH_REGISTRY_CHECKPOINT_CHANGED');lifetimeHandle=original.handle;}
  else lifetimeHandle=await lifetimeRegistry.retainWrappedPrivateLifetimePartV1(runtime,'wallet-graph-keeper',lifetimeIdentity,{config:portfolio.config,journal,checkpoint:null,pendingCheckpoint:null,parentCheckpoint:null});
  const keeper = recovery?await reopenDurableGenericAccountKeeperV1({config:portfolio.config,journal,authority:portfolio.authority},recovery.keeper,lifetimeHandle):await createDurableGenericAccountKeeperV1({config:portfolio.config,journal,authority:portfolio.authority},lifetimeHandle);
  let session, state;
  const check = (action, value) => need(flatManualGraphActionTarget(session, action,
    action === 'prepare' ? value : { requestId: value }), 'WALLET_ACCOUNT_GRAPH_FORBIDDEN');
  const originalKeeper = Object.freeze({
    prepare(value) { check('prepare', value); return keeper.prepare(value); },
    execute(value) { check('execute', value); return keeper.execute(value); },
    reconcile(value) { check('reconcile', value); return keeper.reconcile(value); },
    recover(value) { check('recover', value); return keeper.recover(value); },
    snapshot: () => keeper.snapshot(), restartCoordinator: () => keeper.restartCoordinator(),
    async close() { if(state?.economicAcquisition)await state.economicAcquisition.catch(()=>{});await state?.economicState?.close(); return keeper.close(); },
  });
  try { session = await createFlatAccountSession({ keeper: originalKeeper, ownerHandoff: { ownerView: () => portfolio.ownerView() } }); }
  catch (error) { await keeper.close(); throw error; }
  const graphs = new Map(); state = { runtime, wrappedPortfolio: portfolio, graphs, journal, durableKeeper:keeper, captured:false }; sessions.set(session, state);
  return Object.freeze({ session, bindManualGraph(approval) {
    const details = original(session, approval), requestId = details.body.requestId, old = graphs.get(requestId);
    need(!old || old === approval, 'FLAT_ACCOUNT_MANUAL_GRAPH_REBOUND'); need(old || graphs.size < 8, 'FLAT_ACCOUNT_MANUAL_GRAPH_CAPACITY');
    for (const value of graphs.values()) if (value !== approval)
      need(original(session, value).body.ownerOperationRef !== details.body.ownerOperationRef, 'FLAT_ACCOUNT_MANUAL_GRAPH_REBOUND');
    graphs.set(requestId, approval); return structuredClone(details.body);
  } });
}

/** Private session memberships for read-only economic state. The references
 * come from this original composition, never a caller account ID or route DTO. */
export function assertNativeWalletEconomicSessionV1(session, expected) {
  need(arguments.length === 2, 'NATIVE_SESSION_ARGUMENTS'); exactRecord(expected, ['runtime','system','account']);
  const state=sessions.get(session); need(state?.nativeAccount && state.durableKeeper && !state.nativeFence, 'NATIVE_SESSION_ORIGINAL_REQUIRED');
  need(state.runtime===expected.runtime && state.system===expected.system && state.nativeAccount===expected.account, 'NATIVE_SESSION_ORIGINAL_MEMBERSHIP_REQUIRED');
  assertOwnedNativeValueAccountAuthority(state.nativeAccount,{runtime:state.runtime,system:state.system,poolIndex:state.poolIndex});
}
export function assertWrappedWalletEconomicSessionV1(session, expected) {
  need(arguments.length === 2, 'WRAPPED_SESSION_ARGUMENTS'); exactRecord(expected, ['runtime','portfolio']);
  const state=sessions.get(session); need(state?.wrappedPortfolio && state.durableKeeper && !state.recoveryFence && !state.captured, 'WRAPPED_SESSION_ORIGINAL_REQUIRED');
  need(state.runtime===expected.runtime && state.wrappedPortfolio===expected.portfolio, 'WRAPPED_SESSION_ORIGINAL_MEMBERSHIP_REQUIRED');
  assertOwnedWrappedWalletPortfolioV1(state.runtime,state.wrappedPortfolio);
}
export async function readOriginalSessionWalletEconomicSnapshotV1(session) {
  need(arguments.length === 1, 'WALLET_ECONOMIC_SESSION_ARGUMENTS'); const state=sessions.get(session);
  if(state?.nativeAccount) assertNativeWalletEconomicSessionV1(session,{runtime:state.runtime,system:state.system,account:state.nativeAccount});
  else {need(state?.wrappedPortfolio,'WALLET_ECONOMIC_ORIGINAL_SESSION_REQUIRED');assertWrappedWalletEconomicSessionV1(session,{runtime:state.runtime,portfolio:state.wrappedPortfolio});}
  const snapshot=await session.snapshot(), approvals=[...state.graphs.values(),...(state.notes?.values()??[])];
  const requests=snapshot.requests.map(request=>{const matches=approvals.map(approval=>state.notes&&[...state.notes.values()].includes(approval)?originalNote(session,approval):original(session,approval))
    .filter(details=>details.body.requestId===request.requestId);need(matches.length===1&&matches[0].body.kind===request.kind,'WALLET_ECONOMIC_ORIGINAL_REQUEST_REQUIRED');
    return {...request,assetId:matches[0].body.assetId};});
  return {...snapshot,requests};
}
function sessionEconomicInput(state,session,journal) {
  return {catalogues:[],nativeAccounts:state.nativeAccount?[{runtime:state.runtime,system:state.system,account:state.nativeAccount,session}]:[],
    wrappedPortfolios:state.wrappedPortfolio?[{runtime:state.runtime,portfolio:state.wrappedPortfolio,session}]:[],journal};
}
async function sessionEconomicState(session, retained, afterCrash = false) {
  const state=sessions.get(session);need(state?.durableKeeper&&(state.nativeAccount||state.wrappedPortfolio)&&!state.economicInstallation,'WALLET_ECONOMIC_ORIGINAL_SESSION_REQUIRED');
  const journal=Object.freeze({path:state.journal.path+'.economic-state.vault',password:state.journal.password});
  if(retained){exactRecord(retained,['journal','checkpoint']);need(sha(retained.journal)===sha(journal),'WALLET_ECONOMIC_ORIGINAL_JOURNAL_REQUIRED');}
  state.economicInstallation=true; // an ambiguous Vault create/open never permits a replacement
  state.economicAcquisition=(async()=>{
  const module=await import('../../accounts/state/original-wallet-economic-state-v1.mjs');
  const input=sessionEconomicInput(state,session,journal);
  const capability=afterCrash?await module.reopenOriginalWalletEconomicStateAfterCrashV1({...input,journal:{path:journal.path}})
    :retained?await module.openOriginalWalletEconomicStateV1({...input,checkpoint:retained.checkpoint}):await module.createOriginalWalletEconomicStateV1(input);
  try {module.assertOriginalWalletEconomicStateV1(capability);module.assertOriginalWalletEconomicStateJournalV1(capability,journal);need(module.originalWalletEconomicStateBindingsV1(capability).some(row=>row.session===session),'WALLET_ECONOMIC_ORIGINAL_SESSION_REQUIRED');
    state.economicState=capability;state.economicJournal=journal;return capability;
  }catch(error){await capability.close();throw error;}
  })();state.economicAcquisition.catch(()=>{});return state.economicAcquisition;
}
export async function createOriginalSessionWalletEconomicStateV1(session) {
  need(arguments.length===1,'WALLET_ECONOMIC_SESSION_ARGUMENTS');const state=sessions.get(session);
  if(state?.nativeAccount)assertNativeWalletEconomicSessionV1(session,{runtime:state.runtime,system:state.system,account:state.nativeAccount});
  else {need(state?.wrappedPortfolio,'WALLET_ECONOMIC_ORIGINAL_SESSION_REQUIRED');assertWrappedWalletEconomicSessionV1(session,{runtime:state.runtime,portfolio:state.wrappedPortfolio});}
  return sessionEconomicState(session,null);
}
/** PRIVATE: the source session must already have its original authority and
 * keeper restored. The anchor never reconstructs either from a journal ID. */
export async function reopenOriginalSessionWalletEconomicStateAfterCrashV1(session) {
  need(arguments.length===1,'WALLET_ECONOMIC_SESSION_ARGUMENTS');const state=sessions.get(session);
  if(state?.nativeAccount)assertNativeWalletEconomicSessionV1(session,{runtime:state.runtime,system:state.system,account:state.nativeAccount});
  else{need(state?.wrappedPortfolio,'WALLET_ECONOMIC_ORIGINAL_SESSION_REQUIRED');assertWrappedWalletEconomicSessionV1(session,{runtime:state.runtime,portfolio:state.wrappedPortfolio});}
  return sessionEconomicState(session,null,true);
}
export function readOriginalSessionWalletEconomicStateV1(session) {
  need(arguments.length===1,'WALLET_ECONOMIC_SESSION_ARGUMENTS');const state=sessions.get(session);need(state?.durableKeeper&&(state.nativeAccount||state.wrappedPortfolio),'WALLET_ECONOMIC_ORIGINAL_SESSION_REQUIRED');
  return state.economicState??null;
}
function fenceSessionEconomicState(state) {
  if(state.economicState)state.economicCapture=state.economicState.capture();
  else if(state.economicAcquisition)state.economicCapture=(async()=>{const capability=await state.economicAcquisition;return capability.capture();})();
  state.economicCapture?.catch(()=>{});
}
async function capturedSessionEconomicState(state) {
  if(!state.economicState)return null;
  need(state.economicCapture,'WALLET_ECONOMIC_ORIGINAL_CAPTURE_REQUIRED');
  return {journal:{...state.economicJournal},checkpoint:await state.economicCapture};
}

/** Distinct original registry: used only to require the same exact handoff at
 * every HTTP wrapped GRAPH action. A serialized profile never selects it. */
export function flatManualWrappedGraphActionTarget(session, action, input) {
  return sessions.get(session)?.wrappedPortfolio ? flatManualGraphActionTarget(session, action, input) : null;
}

export async function captureWrappedWalletGraphSessionV1(session){
 const state=sessions.get(session);need(state?.wrappedPortfolio&&state.durableKeeper&&!state.captured,'WALLET_ACCOUNT_ORIGINAL_SESSION_REQUIRED');if(!state.recoveryFence)fenceWrappedWalletGraphSessionV1(session);state.captured=true;
 const drained=await Promise.allSettled([state.recoveryFence,state.economicCapture??Promise.resolve(null)]);for(const outcome of drained)if(outcome.status==='rejected')throw outcome.reason;
 const {captureDurableGenericAccountKeeperV1}=await import('../../accounts/storage/durable-generic-account-keeper.mjs');
 try{const economicState=await capturedSessionEconomicState(state);return {schema:economicState?'WRAPPED_ORIGINAL_GRAPH_SESSION_ECONOMIC_RECOVERY_V1':'WRAPPED_ORIGINAL_GRAPH_SESSION_RECOVERY_V1',keeper:await captureDurableGenericAccountKeeperV1(state.durableKeeper),
   reviews:state.recoveryReviews,...(economicState?{economicState}: {})};}
 catch(error){try{await state.durableKeeper.close();}catch(cleanup){throw new AggregateError([error,cleanup],'WRAPPED_GRAPH_CAPTURE_CLEANUP_FAILED',{cause:error});}throw error;}
}
export async function reopenWrappedWalletGraphSessionV1(token){
 const {consumeWrappedWalletRecoveryPartV1}=await import('../../operations/wallet/wrapped-wallet-composition-v1.mjs');
 const retained=consumeWrappedWalletRecoveryPartV1(token,'graph-keeper');exactRecord(retained,['input','record','approvals']);
 const economic=retained.record.schema==='WRAPPED_ORIGINAL_GRAPH_SESSION_ECONOMIC_RECOVERY_V1';
 exactRecord(retained.record,economic?['schema','keeper','reviews','economicState']:['schema','keeper','reviews']);need(economic||retained.record.schema==='WRAPPED_ORIGINAL_GRAPH_SESSION_RECOVERY_V1','WALLET_ACCOUNT_ORIGINAL_SESSION_REQUIRED');
 if(economic)exactRecord(retained.record.economicState,['journal','checkpoint']);
 const joined=await wrappedGraphSession(retained.input,retained.record);
 try{
   const reviews=retained.approvals.map(approval=>{const details=wrappedWalletAccountManualGraphDetailsV1(approval);return {body:details.body,review:details.review};});
   need(JSON.stringify(reviews)===JSON.stringify(retained.record.reviews),'WALLET_ACCOUNT_ORIGINAL_REVIEWS_CHANGED');
   for(const approval of retained.approvals)joined.bindManualGraph(approval);if(economic)await sessionEconomicState(joined.session,retained.record.economicState);return joined;
 }catch(error){await joined.session.close();throw error;}
}

export function fenceWrappedWalletGraphSessionV1(session){
 const state=sessions.get(session);need(state?.wrappedPortfolio&&state.durableKeeper&&!state.captured&&!state.recoveryFence,'WALLET_ACCOUNT_ORIGINAL_SESSION_REQUIRED');
 state.recoveryReviews=[...state.graphs.values()].map(approval=>{const details=original(session,approval);return {body:details.body,review:details.review};});
 fenceSessionEconomicState(state);
 state.recoveryFence=session.quiesceForPrivateRecovery();state.recoveryFence.catch(()=>{});
}

/** Same original durable generic keeper, selected by a native section token.
 * No listener callback, journal ID, or copied approval can recreate membership. */
export function fenceOriginalNativeSessionEconomicRecoveryV1(session, authority) {
  need(arguments.length === 2, 'NATIVE_SESSION_ARGUMENTS');
  const admitted = assertNativeEconomicRecoveryCaptureV1(authority), state = sessions.get(session);
  need(state?.nativeAccount && state.durableKeeper && !state.nativeFence, 'NATIVE_SESSION_ORIGINAL_REQUIRED');
  need(!state.nativeSource,'NATIVE_SOURCE_SESSION_LEGACY_CAPTURE_DENIED');
  assertOwnedNativeValueAccountAuthority(state.nativeAccount, { runtime: state.runtime, system: state.system, poolIndex: state.poolIndex });
  need(nativeValueOriginalRecoverySourceV1(state.runtime, state.system) === admitted.sourceSHA256, 'NATIVE_SESSION_SOURCE_CHANGED');
  // Current mobile composition has only its original note consent. General
  // manual GRAPH grant restoration remains a distinct original producer.
  need(state.graphs.size === 0, 'NATIVE_SESSION_GRAPH_RECOVERY_PRODUCER_REQUIRED');
  state.nativeReviews = [...state.notes.values()].map(approval => { const details = originalNote(session, approval);
    return structuredClone({ body: details.body, review: details.review }); });
  state.nativeIdentity = admitted;
  fenceSessionEconomicState(state);
  state.nativeFence = session.quiesceForPrivateRecovery(); // closing fence runs before first await
  state.nativeFence.catch(() => {});
}
export function captureOriginalNativeSessionEconomicRecoveryV1(session, token) {
  need(arguments.length === 2, 'NATIVE_SESSION_ARGUMENTS');
  const admitted = nativeEconomicRecoverySectionIdentityV1(token, 'session'), state = sessions.get(session);
  need(state?.nativeFence && !state.nativeCaptured, 'NATIVE_SESSION_ORIGINAL_CAPTURE_REQUIRED');
  need(sha(admitted) === sha(state.nativeIdentity), 'NATIVE_SESSION_CAPTURE_CHANGED'); state.nativeCaptured = true;
  state.nativeCapturePromise = (async () => {
    const drained=await Promise.allSettled([state.nativeFence,state.economicCapture??Promise.resolve(null)]);for(const outcome of drained)if(outcome.status==='rejected')throw outcome.reason;
    const originalSnapshot = drained[0].value;
    need(!originalSnapshot.busy && originalSnapshot.queued === 0, 'NATIVE_SESSION_ORIGINAL_IDLE_REQUIRED');
    const { captureDurableGenericAccountKeeperV1 } = await import('../../accounts/storage/durable-generic-account-keeper.mjs');
    state.nativeKeeperCaptureStarted = true;
    const keeper = await captureDurableGenericAccountKeeperV1(state.durableKeeper); // closes actual worker/IPC before returning
    state.nativeStopped = true;
    const economicState=await capturedSessionEconomicState(state);
    state.nativeRecord = { schema: economicState?'ORIGINAL_NATIVE_SESSION_WALLET_STATE_RECOVERY_V1':'ORIGINAL_NATIVE_SESSION_ECONOMIC_RECOVERY_V1', sourceSHA256: admitted.sourceSHA256,
      poolIndex: state.poolIndex, accountIdentitySHA256: sha(genericAccountIdentity(state.nativeAccount.config)),
      journalRevision: originalSnapshot.revision, keeper, notes: structuredClone(state.nativeReviews),...(economicState?{economicState}: {}) };
    return structuredClone(state.nativeRecord);
  })(); state.nativeCapturePromise.catch(() => {}); return state.nativeCapturePromise;
}
export async function stopCapturedNativeSessionEconomicRecoveryV1(session, token) {
  need(arguments.length === 2, 'NATIVE_SESSION_ARGUMENTS');
  const state = sessions.get(session); need(state?.nativeIdentity, 'NATIVE_SESSION_ORIGINAL_REQUIRED');
  need(sha(nativeEconomicRecoverySectionIdentityV1(token, 'session')) === sha(state.nativeIdentity));
  need(state.nativeStopped && state.nativeRecord, 'NATIVE_SESSION_ORIGINAL_CLOSE_UNCONFIRMED');
  state.nativeRecord = null; state.notes.clear(); return { closed: true, originalResourcesStopped: true };
}
export async function abortNativeSessionEconomicRecoveryV1(session, token) {
  need(arguments.length === 2, 'NATIVE_SESSION_ARGUMENTS'); const state = sessions.get(session);
  need(state?.nativeIdentity && sha(nativeEconomicRecoverySectionIdentityV1(token, 'session')) === sha(state.nativeIdentity));
  let captureError = null;
  try { if (state.nativeCapturePromise) await state.nativeCapturePromise; else await state.nativeFence; }
  catch (error) { captureError = error; }
  if (!state.nativeStopped) {
    try {
      const stopped = await state.durableKeeper.close(); need(stopped?.closed === true, 'NATIVE_SESSION_ORIGINAL_CLOSE_UNCONFIRMED');
      // The immutable durable helper sets its closed flag in finally. If its
      // capture/OS-close rejected, a later idempotent {closed:true} cannot prove
      // that original worker/IPC closed. Preserve that uncertainty and cause.
      need(!state.nativeKeeperCaptureStarted, 'NATIVE_SESSION_ORIGINAL_CLOSE_UNCONFIRMED');
      state.nativeStopped = true;
    } catch (cleanup) {
      if (captureError) throw new AggregateError([captureError, cleanup], 'NATIVE_SESSION_CAPTURE_AND_CLOSE_FAILED', { cause: captureError });
      throw cleanup;
    }
  }
  need(state.nativeStopped, 'NATIVE_SESSION_ORIGINAL_CLOSE_UNCONFIRMED'); return { closed: true, originalResourcesStopped: true };
}
export async function reopenOriginalNativeSessionEconomicRecoveryV1(token, contexts) {
  need(arguments.length === 2, 'NATIVE_SESSION_ARGUMENTS'); exactRecord(contexts, ['runtime', 'system', 'account', 'owner']);
  const admitted = nativeEconomicRecoverySectionIdentityV1(token, 'session');
  need(nativeValueOriginalRecoverySourceV1(contexts.runtime, contexts.system) === admitted.sourceSHA256, 'NATIVE_SESSION_SOURCE_CHANGED');
  const retained = consumeNativeEconomicRecoverySectionV1(token, 'session');
  const economic=retained.schema==='ORIGINAL_NATIVE_SESSION_WALLET_STATE_RECOVERY_V1';
  exactRecord(retained, ['schema', 'sourceSHA256', 'poolIndex', 'accountIdentitySHA256', 'journalRevision', 'keeper', 'notes',...(economic?['economicState']:[])]);
  need((economic||retained.schema === 'ORIGINAL_NATIVE_SESSION_ECONOMIC_RECOVERY_V1') && retained.sourceSHA256 === admitted.sourceSHA256);
  if(economic)exactRecord(retained.economicState,['journal','checkpoint']);
  assertOwnedNativeValueAccountAuthority(contexts.account, { runtime: contexts.runtime, system: contexts.system,
    poolIndex: retained.poolIndex, owner: contexts.owner });
  need(sha(genericAccountIdentity(contexts.account.config)) === retained.accountIdentitySHA256, 'NATIVE_SESSION_ORIGINAL_ACCOUNT_CHANGED');
  return nativeGraphSession({ runtime: contexts.runtime, system: contexts.system, poolIndex: retained.poolIndex,
    account: contexts.account, journal: retained.keeper.journal }, { ...retained, owner: contexts.owner });
}

export function assertNativeSessionEconomicMembershipV1(session, expected) {
  need(arguments.length === 2, 'NATIVE_SESSION_ARGUMENTS'); exactRecord(expected, ['runtime', 'system', 'account', 'owner']);
  const state = sessions.get(session); need(state?.nativeAccount && state.durableKeeper && !state.nativeFence, 'NATIVE_SESSION_ORIGINAL_REQUIRED');
  need(state.runtime === expected.runtime && state.system === expected.system && state.nativeAccount === expected.account,
    'NATIVE_SESSION_ORIGINAL_MEMBERSHIP_REQUIRED');
  assertOwnedNativeValueAccountAuthority(expected.account, { runtime: expected.runtime, system: expected.system, poolIndex: state.poolIndex, owner: expected.owner });
}

/** SOURCE section metadata has no economic authority. Each retained approval is
 * rebuilt later from the same original owner/account producer before use. */
function originalSourceSessionState(session,keeper=null) {
  const state=sessions.get(session);need(state?.nativeSource&&state.nativeAccount&&state.durableKeeper
    &&!state.nativeFence&&!state.nativeCaptured,'NATIVE_SOURCE_ORIGINAL_SESSION_REQUIRED');
  need(!state.nativeSource.fault,'NATIVE_SOURCE_SESSION_UNAVAILABLE');
  if(keeper!==null)need(state.durableKeeper===keeper,'NATIVE_SOURCE_ORIGINAL_KEEPER_CHANGED');
  assertOwnedNativeValueAccountAuthority(state.nativeAccount,{runtime:state.runtime,system:state.system,poolIndex:state.poolIndex,owner:state.nativeSource.owner});
  assertOriginalNativeAccountSourceV1(state.nativeAccount,state.nativeSource.identity);
  need(state.graphs.size===0,'NATIVE_SOURCE_GRAPH_RESTORATION_PRODUCER_REQUIRED');return state;
}
export function assertOriginalNativeSessionSourceKeeperV1(session,keeper) {
  need(arguments.length===2,'NATIVE_SOURCE_SESSION_ARGUMENTS');originalSourceSessionState(session,keeper);
}
function sourceSessionPayload(state,snapshot) {
  const checkpoint=snapshot.keeper.checkpoint;
  need(checkpoint&&snapshot.keeper.config.accountId===state.nativeAccount.config.accountId,'NATIVE_SOURCE_ORIGINAL_KEEPER_CHANGED');
  return {schema:'ORIGINAL_NATIVE_SOURCE_SESSION_SEED_V1',sourceSHA256:state.nativeSource.identity.sourceSHA256,
    poolIndex:state.poolIndex,accountIdentitySHA256:sha(genericAccountIdentity(state.nativeAccount.config)),
    journalRevision:checkpoint.revision,keeper:structuredClone(snapshot.keeper),
    notes:[...state.notes.values()].map(approval=>{const details=originalNote(state.nativeSource.session,approval);return structuredClone({body:details.body,review:details.review});})};
}
async function sourceOwnedCoordinatorProcesses(state,snapshot) {
  need(Array.isArray(snapshot.ownedProcesses)&&snapshot.ownedProcesses.length===1,'NATIVE_SOURCE_ORIGINAL_COORDINATOR_REQUIRED');
  const expected=snapshot.ownedProcesses[0],actual=await nativeSourceRecoveryOwnedProcessV1(state.nativeSource.token,'session',expected.pid);
  need(sha(actual)===sha(expected),'NATIVE_SOURCE_ORIGINAL_COORDINATOR_IDENTITY_CHANGED');return [actual];
}
async function updateSourceSession(state,confirmed,ownedProcesses,candidate) {
  const section={schema:'ORIGINAL_NATIVE_SOURCE_SESSION_SECTION_V1',sourceSHA256:state.nativeSource.identity.sourceSHA256,
    ownedProcesses:structuredClone(ownedProcesses),confirmed,candidate};
  await updateOriginalNativeSourceSectionV1(state.nativeSource.handle,section);state.nativeSource.section=structuredClone(section);
}
export async function prepareOriginalNativeSessionKeeperSourceCheckpointV1(session,keeper) {
  need(arguments.length===2,'NATIVE_SOURCE_SESSION_ARGUMENTS');const state=originalSourceSessionState(session,keeper);
  const module=await import('../../accounts/storage/durable-generic-account-keeper.mjs');
  const candidate=await module.readOriginalNativeSourceSessionKeeperCandidateV1(keeper,session);
  exactRecord(candidate,['revision','stateSHA256']);need(Number.isSafeInteger(candidate.revision)&&candidate.revision>=0&&/^[0-9a-f]{64}$/.test(candidate.stateSHA256),'NATIVE_SOURCE_ORIGINAL_CHECKPOINT');
  await updateSourceSession(state,state.nativeSource.section.confirmed,state.nativeSource.section.ownedProcesses,
    {kind:'KEEPER_CAS',parentCheckpoint:structuredClone(candidate)});
}
export async function confirmOriginalNativeSessionKeeperSourceCheckpointV1(session,keeper) {
  need(arguments.length===2,'NATIVE_SOURCE_SESSION_ARGUMENTS');const state=originalSourceSessionState(session,keeper);
  const module=await import('../../accounts/storage/durable-generic-account-keeper.mjs');
  const snapshot=await module.readOriginalNativeSourceSessionKeeperV1(keeper,session);
  // The keeper itself supplies this exact snapshot from its original parent
  // readback; the caller still must hold both of the original references.
  exactRecord(snapshot,['keeper','ownedProcesses']);
  const pending=state.nativeSource.section.candidate;
  need(pending?.kind==='KEEPER_CAS','NATIVE_SOURCE_ORIGINAL_CHECKPOINT');
  need(snapshot.keeper.parentCheckpoint.revision===pending.parentCheckpoint.revision
    &&sha({checkpoint:snapshot.keeper.checkpoint,pendingCheckpoint:snapshot.keeper.pendingCheckpoint})===pending.parentCheckpoint.stateSHA256,
    'NATIVE_SOURCE_ORIGINAL_CHECKPOINT_CHANGED');
  await updateSourceSession(state,sourceSessionPayload(state,snapshot),await sourceOwnedCoordinatorProcesses(state,snapshot),
    state.nativeSource.busy?{kind:'ADMITTED_KEEPER_OPERATION'}:null);
}
async function originalSourceSessionWork(session,work) {
  const state=sessions.get(session);if(!state?.nativeSource)return work();
  const source=state.nativeSource;originalSourceSessionState(session);need(!source.busy&&!source.fault,'NATIVE_SOURCE_SESSION_UNAVAILABLE');source.busy=true;
  try {
    await updateSourceSession(state,source.section.confirmed,source.section.ownedProcesses,{kind:'ADMITTED_KEEPER_OPERATION'});
    const value=await work(),module=await import('../../accounts/storage/durable-generic-account-keeper.mjs');
    const snapshot=await module.readOriginalNativeSourceSessionKeeperV1(state.durableKeeper,session);
    await updateSourceSession(state,sourceSessionPayload(state,snapshot),await sourceOwnedCoordinatorProcesses(state,snapshot),null);return value;
  }catch(error){source.fault=true;throw error;}finally{source.busy=false;}
}
function originalSourceJoinedSession(joined) {
  // SOURCE callers await this binding before funding; ordinary joined sessions
  // keep their existing synchronous methods and no new persistence work.
  return Object.freeze({session:joined.session,
    async bindManualNote(approval){return originalSourceSessionWork(joined.session,()=>joined.bindManualNote(approval));},
    bindManualGraph(){fail('NATIVE_SOURCE_GRAPH_RESTORATION_PRODUCER_REQUIRED');}});
}
/** Initial private composition has no effects until account, keeper and STATE6
 * anchors are all retained. No replacement source can join this session. */
export async function createOriginalNativeSourceGraphAccountSessionV1(token,input) {
  need(arguments.length===2,'NATIVE_SOURCE_SESSION_ARGUMENTS');exactRecord(input,['runtime','system','poolIndex','account','journal','owner']);
  const identity=nativeSourceRecoverySectionIdentityV1(token,'session');need(identity.profile==='NATIVE_VALUE_DURABLE_SOURCE_RECOVERY_V1','NATIVE_SOURCE_ORIGINAL_PROFILE');
  need(nativeValueOriginalRecoverySourceV1(input.runtime,input.system)===identity.sourceSHA256,'NATIVE_SOURCE_ORIGINAL_SOURCE_CHANGED');
  assertOwnedNativeValueAccountAuthority(input.account,{runtime:input.runtime,system:input.system,poolIndex:input.poolIndex,owner:input.owner});
  assertOriginalNativeAccountSourceV1(input.account,identity);
  const {owner,...original}=input,joined=await nativeGraphSession(original,null),state=sessions.get(joined.session);
  state.nativeSource={identity,owner,token,session:joined.session,handle:null,section:null,busy:false,fault:false};
  try {
    const module=await import('../../accounts/storage/durable-generic-account-keeper.mjs');
    const snapshot=await module.readOriginalNativeSourceSessionKeeperV1(state.durableKeeper,joined.session);
    const section={schema:'ORIGINAL_NATIVE_SOURCE_SESSION_SECTION_V1',sourceSHA256:identity.sourceSHA256,
      ownedProcesses:await sourceOwnedCoordinatorProcesses(state,snapshot),confirmed:sourceSessionPayload(state,snapshot),candidate:null};
    state.nativeSource.handle=await retainOriginalNativeSourceSectionV1(token,'session',section);state.nativeSource.section=structuredClone(section);
    await module.bindOriginalNativeSourceSessionKeeperV1(state.durableKeeper,joined.session);
    await createOriginalSessionWalletEconomicStateV1(joined.session);return originalSourceJoinedSession(joined);
  }catch(error){state.nativeSource.fault=true;try{await joined.session.close();}catch(cleanup){throw new AggregateError([error,cleanup],'NATIVE_SOURCE_SESSION_SETUP_CLOSE_FAILED',{cause:error});}throw error;}
}
export async function reopenOriginalNativeSessionSourceV1(token,contexts) {
  need(arguments.length===2,'NATIVE_SOURCE_SESSION_ARGUMENTS');exactRecord(contexts,['runtime','system','account','owner']);
  const identity=nativeSourceRecoverySectionIdentityV1(token,'session');need(identity.profile==='NATIVE_VALUE_DURABLE_SOURCE_RECOVERY_V1','NATIVE_SOURCE_ORIGINAL_PROFILE');
  need(nativeValueOriginalRecoverySourceV1(contexts.runtime,contexts.system)===identity.sourceSHA256,'NATIVE_SOURCE_ORIGINAL_SOURCE_CHANGED');
  assertOriginalNativeAccountSourceV1(contexts.account,identity);
  const section=consumeOriginalNativeSourceSectionV1(token,'session');exactRecord(section,['schema','sourceSHA256','ownedProcesses','confirmed','candidate']);
  need(section.schema==='ORIGINAL_NATIVE_SOURCE_SESSION_SECTION_V1'&&section.sourceSHA256===identity.sourceSHA256,'NATIVE_SOURCE_ORIGINAL_PROFILE');
  need(section.candidate===null,'NATIVE_SOURCE_PENDING_ONLY_UNKNOWN');
  const retained=section.confirmed;exactRecord(retained,['schema','sourceSHA256','poolIndex','accountIdentitySHA256','journalRevision','keeper','notes']);
  need(retained.schema==='ORIGINAL_NATIVE_SOURCE_SESSION_SEED_V1'&&retained.sourceSHA256===identity.sourceSHA256,'NATIVE_SOURCE_ORIGINAL_PROFILE');
  need(sha(genericAccountIdentity(contexts.account.config))===retained.accountIdentitySHA256,'NATIVE_SOURCE_ORIGINAL_ACCOUNT_CHANGED');
  assertOwnedNativeValueAccountAuthority(contexts.account,{runtime:contexts.runtime,system:contexts.system,poolIndex:retained.poolIndex,owner:contexts.owner});
  const handle=await resumeOriginalNativeSourceSectionV1(token,'session');
  const joined=await nativeGraphSession({runtime:contexts.runtime,system:contexts.system,poolIndex:retained.poolIndex,account:contexts.account,journal:retained.keeper.journal},
    {...retained,source:true,owner:contexts.owner}),state=sessions.get(joined.session);
  state.nativeSource={identity,owner:contexts.owner,token,session:joined.session,handle,section:structuredClone(section),busy:false,fault:false};
  try {
    const module=await import('../../accounts/storage/durable-generic-account-keeper.mjs');
    const snapshot=await module.bindOriginalNativeSourceSessionKeeperV1(state.durableKeeper,joined.session);
    await updateSourceSession(state,sourceSessionPayload(state,snapshot),await sourceOwnedCoordinatorProcesses(state,snapshot),null);
    await reopenOriginalSessionWalletEconomicStateAfterCrashV1(joined.session);return originalSourceJoinedSession(joined);
  }catch(error){state.nativeSource.fault=true;try{await joined.session.close();}catch(cleanup){throw new AggregateError([error,cleanup],'NATIVE_SOURCE_SESSION_OPEN_CLOSE_FAILED',{cause:error});}throw error;}
}
