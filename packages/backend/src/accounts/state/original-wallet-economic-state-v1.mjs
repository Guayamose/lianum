/** Durable read union over original private authorities. This journal records
 * observations; it cannot prepare a note, mint a credit or send a transaction. */
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {types} from 'node:util';
import {lstat, realpath, mkdir, open, readFile, readlink, unlink} from 'node:fs/promises';
import {constants} from 'node:fs';
import {dirname, resolve} from 'node:path';
import {Vault} from '../../../../engine/src/crypto/vault.mjs';
import {genericAccountIdentity, immutable, sha} from '../../../../engine/src/execution/accounts/generic-account-journal.mjs';
import {exactRecord, fixedArray} from '../../execution/encoding/commitments.mjs';
import {assertOwnedFlatJournalCatalogue} from '../storage/flat-journal-catalogue.mjs';
import {assertFlatManualGraphCatalogueSession,assertNativeWalletEconomicSessionV1,assertWrappedWalletEconomicSessionV1,readOriginalSessionWalletEconomicSnapshotV1} from '../../api/accounts/flat-manual-graph-session.mjs';
import {assertOwnedNativeValueAccountAuthority} from '../authority/native-value-account-authority-v2.mjs';
import {assertOwnedWrappedWalletPortfolioV1} from '../portfolio/wrapped-wallet-portfolio-v1.mjs';
import {generationPrivateVaultExitBinding, assertGenerationPrivateVaultExitSession} from '../../defi/withdrawals/generation-private-vault-exit.mjs';
import {validateFlatOwnerReadPayload} from '@lianum/mobile-protocol/wallet/owner-portfolio-contract';
import {validatePositionStateEnvelope, samePositionHead} from '@lianum/mobile-protocol/wallet/generation-position-state-v2';
import {ORIGINAL_ECONOMIC_STATE_V1, ORIGINAL_ECONOMIC_STATE_MAX_AGE_MS, validateOriginalWalletEconomicStateV1}
  from '@lianum/mobile-protocol/wallet/economic-state-v1';

import {readOriginalNativeClaimPortfolioViewV1} from '../../claims/operations/portfolio-view.mjs';
import {originalNativeClaimAssetUnitsV1} from '../../claims/operations/native-claim-asset-units-v1.mjs';
import {claimDomainCommitment} from '../../claims/protocol/framing.mjs';
import {assertOriginalNativeClaimEconomicSessionV1,readOriginalNativeClaimEconomicSnapshotV1} from '../../api/accounts/flat-account-session.mjs';
import {assertOriginalDeviceRootClaimIntakeV2,readOriginalDeviceRootClaimIntakeContextV2,readOriginalDeviceRootClaimEconomicSnapshotV2} from '../../claims/controller/controller.mjs';
const owned = new WeakMap();
const need = (ok, code) => assert.ok(ok, 'ORIGINAL_ECONOMIC_STATE_' + code);
const head = observed => observed ? Object.fromEntries(['blockNumber', 'blockHash', 'timestamp'].map(k => [k, observed[k]])) : null;
const stateHash = value => sha(value);
function route(sourceId, generationId, asset, domainCommitment) {
  return {sourceId, generationId, ...Object.fromEntries(['assetId', 'chainId', 'genesis', 'pool', 'scope', 'policy', 'assetIdentity'].map(k => [k, asset[k]])), domainCommitment};
}
const sourceMetadata = source => ({sourceId: source.id, kind: source.kind, routes: source.routes,
  ...(source.generations === null ? {} : {generations: source.generations})});
const catalogueGenerations = catalogue => immutable(catalogue.status().generations.map(g =>
  ({generationId: g.generationId, identity: g.identity, registry: g.registry, routes: g.routes})));
function catalogueRoots(generations) {
  return generations.flatMap(g => g.registry.map(asset => {
    const r = g.routes.find(r => r.assetId === asset.assetId); need(r && r.pool === asset.pool, 'ORIGINAL_ROUTE');
    return {generationId: g.generationId, asset, domainCommitment: r.domainCommitment};
  }));
}
function bindOriginalSourceSet(sources, saved) {
  need(Array.isArray(saved) && saved.length === sources.length, 'ORIGINAL_SOURCE_SET_REQUIRED');
  sources.forEach((source, i) => source.bind(saved[i]));
}
function unknown(source, reason, checkpointSHA256, previous = []) {
  return source.routes.map(({route, asset}) => ({route, asset, component: source.kind, state: 'UNKNOWN', reason,
    head: null, balances: null, backing: null, requests: previous.find(r => sha(r.route) === sha(route))?.requests.map(q => ({...q, state: 'UNKNOWN', disposition: null})) ?? [],
    position: (() => {const p = previous.find(r => sha(r.route) === sha(route))?.position; return p ? {...p, ownershipStatus: 'UNKNOWN', valuationStatus: 'UNKNOWN', shares: null, estimate: null, head: null} : null;})(), checkpointSHA256}));
}
function originalRows(source, assets, journals, checkpointSHA256, positions = null, changed = false) {
  return source.routes.map(({route, asset}) => {
    const item = assets.find(a => a.asset.assetId === route.assetId && (a.generationId ?? null) === route.generationId);
    need(item, 'ORIGINAL_ROUTE');
    const originalRequests = [...item.requests];
    for (const j of journals.filter(j => j.assetId === route.assetId && (j.generationId ?? null) === route.generationId))
      if (!originalRequests.some(q => q.requestId === j.requestId)) originalRequests.push({requestId: j.requestId, kind: j.kind, state: 'UNRESOLVED', disposition: null});
    const requests = originalRequests.map(q => {
      const matches = journals.filter(j => j.requestId === q.requestId && j.assetId === route.assetId
        && (j.generationId ?? null) === route.generationId);
      need(matches.length <= 1, 'ORIGINAL_REQUEST');
      const phase = matches[0]?.state;
      const state = phase === 'CONFIRMED' ? q.state === 'CONFIRMED' ? 'CONFIRMED' : 'STALE'
        : phase ?? (q.state === 'UNRESOLVED' ? 'UNKNOWN' : q.state);
      return {...q, state, disposition: state === 'CONFIRMED' && q.state === 'CONFIRMED' ? q.disposition : null};
    });
    // Journal CONFIRMED alone never replaces the original owner observation.
    const uncertain = requests.some(q => ['UNKNOWN', 'UNRESOLVED', 'SUBMITTING', 'RECOVERING', 'REAUTHORIZING', 'PREPARING', 'PREPARED'].includes(q.state));
    const staleRequest = requests.some(q => q.state === 'STALE');
    const state = changed || uncertain || item.status === 'UNAVAILABLE' ? 'UNKNOWN' : item.status === 'LIVE' && !staleRequest ? 'LIVE' : 'STALE';
    const reason = changed ? 'ORIGINAL_VIEW_CHANGED' : uncertain ? 'ORIGINAL_JOURNAL_UNKNOWN'
      : item.status === 'UNAVAILABLE' ? 'ORIGINAL_SOURCE_UNAVAILABLE' : state === 'STALE' ? 'ORIGINAL_HEAD_STALE' : null;
    const row = {route, asset, component: source.kind, state, reason, head: state === 'LIVE' ? head(item.observed) : null,
      balances: state === 'LIVE' ? item.balances : null, backing: state === 'LIVE' ? item.backing : null, requests, position: null, checkpointSHA256};
    const p = positions?.positions.find(p => p.generationId === route.generationId && p.shareAssetId === route.assetId);
    if (p) {
      const ownership = state === 'LIVE' && p.ownership.status === 'LIVE' && samePositionHead(item.observed, p.ownership.observed)
        && sha(item.balances) === sha(p.ownership.balances);
      const valuation = ownership && p.valuation.status === 'LIVE' && samePositionHead(item.observed, p.valuation.observed);
      row.position = {ownershipStatus: ownership ? 'LIVE' : p.ownership.status === 'STALE' ? 'STALE' : 'UNKNOWN',
        valuationStatus: valuation ? 'LIVE' : p.valuation.status === 'STALE' ? 'STALE' : 'UNKNOWN',
        underlyingAssetId: p.underlyingAssetId, underlyingToken: p.underlyingToken, vault: p.vault, shares: ownership ? p.ownership.balances.available : null,
        estimate: valuation ? p.valuation.estimatedRedeemableUnderlying : null, head: valuation ? head(p.valuation.observed) : null, underlyingSpendable: false};
    }
    return row;
  });
}
function sessionObservationChanged(before,after) {
  return before!==null&&(sha(before)!==sha(after)||!after.storageAvailable||after.observation!=='CURRENT'||after.busy||after.queued!==0);
}
function combineOriginalSessionJournal(journal,snapshot) {
  if(snapshot===null)return journal;
  const rows=[...journal];for(const request of snapshot.requests){const previous=rows.find(row=>row.requestId===request.requestId);
    if(previous){need(previous.assetId===request.assetId&&previous.kind===request.kind,'ORIGINAL_REQUEST');previous.state=previous.state==='UNKNOWN'?'UNKNOWN':request.state;}
    else rows.push({requestId:request.requestId,assetId:request.assetId,kind:request.kind,state:request.state});}
  return rows;
}
function source(raw, kind) {
  need(!types.isProxy(raw), 'ORIGINAL_REQUIRED');
  const paired=Object.hasOwn(raw,'session');
  exactRecord(raw, kind === 'FLAT_NOTE' ? ['runtime', 'catalogue', 'session', 'positions']
    : kind === 'NATIVE_CLAIM' ? (Object.hasOwn(raw,'intake')?['intake']:['runtime', 'view', 'session'])
    : kind === 'NATIVE_NOTE' ? ['runtime', 'system', 'account',...(paired?['session']:[])] : ['runtime', 'portfolio',...(paired?['session']:[])]);
  const {runtime} = raw; let roots, check, read, identity, flat = null;
  if (kind === 'FLAT_NOTE') {
    const {catalogue, session, positions} = raw;
    check = () => {assertOwnedFlatJournalCatalogue(catalogue, {runtime}); assertFlatManualGraphCatalogueSession(session, {runtime, catalogue});
      if (positions !== null) {need(generationPrivateVaultExitBinding(runtime, positions)?.catalogue === catalogue, 'ORIGINAL_POSITIONS'); assertGenerationPrivateVaultExitSession(runtime, positions, session);}};
    check(); flat = {catalogue, generations: catalogueGenerations(catalogue), includeIdentities: true};
    roots = catalogueRoots(flat.generations); identity = sha(flat.generations); const branded = check;
    check = () => {
      branded(); const current = catalogueGenerations(catalogue);
      need(current.length >= flat.generations.length, 'ORIGINAL_ROUTES_CHANGED');
      assert.deepEqual(current.slice(0, flat.generations.length), flat.generations, 'ORIGINAL_ECONOMIC_STATE_ORIGINAL_ROUTES_CHANGED');
    };
    read = async () => {
      check(); const before = await catalogue.keeper.snapshot();
      const view = validateFlatOwnerReadPayload(await catalogue.ownerView()).data;
      const p = positions === null ? null : validatePositionStateEnvelope(await positions.ownerStateView());
      const after = await catalogue.keeper.snapshot(); check();
      const status = catalogue.status(), bindings = status.bindings;
      const journal = after.requests.map(q => {const b = bindings.filter(b => b.request.requestId === q.requestId);
        need(b.length === 1 && b[0].request.assetId === q.assetId && b[0].request.kind === q.kind, 'ORIGINAL_REQUEST'); return {...q, generationId: b[0].generationId};});
      const changed = sha(before) !== sha(after) || !after.storageAvailable || status.storageFault || status.uncertainWrite;
      const assets = view.generations.flatMap(g => g.portfolio ? g.portfolio.assets.map(a => ({...a, generationId: g.generationId}))
        : g.routes.map(r => ({asset: {assetId: r.assetId}, generationId: g.generationId, status: 'UNAVAILABLE', requests: []})));
      return {assets, journal, positions: p, revision: after.revision, changed,
        checkpoint: {journal: after, bindings, storageFault: status.storageFault, uncertainWrite: status.uncertainWrite}};
    };
  } else if (kind === 'NATIVE_CLAIM' && Object.hasOwn(raw,'intake')) {
    const {intake}=raw,descriptor=assertOriginalDeviceRootClaimIntakeV2(intake),context=readOriginalDeviceRootClaimIntakeContextV2(intake);
    check=()=>{assert.deepEqual(assertOriginalDeviceRootClaimIntakeV2(intake),descriptor,'ORIGINAL_ECONOMIC_STATE_SOURCE_CHANGED');
      const actual=readOriginalDeviceRootClaimIntakeContextV2(intake);need(actual.controller===context.controller&&actual.runtime===context.runtime
        &&actual.claims===context.claims&&actual.asset===context.asset,'ORIGINAL_REQUIRED');};check();
    roots=[{generationId:null,asset:context.asset,domainCommitment:descriptor.claim.claimDomain}];identity=sha({descriptor,asset:context.asset});
    read=async()=>{check();const snapshot=await readOriginalDeviceRootClaimEconomicSnapshotV2(intake);check();
      return {...snapshot,positions:null,changed:false};};
  } else if (kind === 'NATIVE_CLAIM') {
    const {view, session} = raw, expected = Object.freeze({runtime, view});
    const original = readOriginalNativeClaimPortfolioViewV1(view, runtime), {claims, portfolio} = original;
    check = () => {readOriginalNativeClaimPortfolioViewV1(view, runtime); assertOriginalNativeClaimEconomicSessionV1(session, expected);}; check();
    roots = claims.configs.map(config => {const matches = portfolio.registry.filter(a => a.token === config.wrapper && a.pool === config.pool && a.scope === config.scope && a.policy === config.policy);
      need(matches.length === 1, 'ORIGINAL_ROUTE'); const asset=matches[0], units=originalNativeClaimAssetUnitsV1(runtime,claims,config);
      need(asset.decimals===units.decimals&&asset.symbol===units.claimSymbol.toUpperCase(),'ORIGINAL_CLAIM_UNITS');
      return {generationId:null,asset,domainCommitment:claimDomainCommitment(config)};});
    identity = sha({portfolio:genericAccountIdentity(portfolio.config), domains:roots.map(r=>r.domainCommitment)});
    read = async () => {check(); const before=await readOriginalNativeClaimEconomicSnapshotV1(session,expected);
      const observed=validateFlatOwnerReadPayload(await session.ownerView()).data;
      const after=await readOriginalNativeClaimEconomicSnapshotV1(session,expected); check();
      need(Array.isArray(observed.nativeClaims)&&observed.nativeClaims.length===roots.length,'ORIGINAL_CLAIM_OBSERVATION');
      const assets=roots.map(({asset})=>{const matches=observed.assets.filter(a=>a.asset.assetId===asset.assetId), custody=observed.nativeClaims.filter(a=>a.assetId===asset.assetId);
        need(matches.length===1&&custody.length===1&&custody[0].nativeSelfCustody===false&&custody[0].underlyingSpendable===false,'ORIGINAL_CLAIM_OBSERVATION');
        return custody[0].custodyObservation==='CURRENT_QUORUM'?matches[0]:{...matches[0],status:'UNAVAILABLE',balances:null,backing:null};});
      need(after.requests.every(q=>roots.some(r=>r.asset.assetId===q.assetId)),'ORIGINAL_REQUEST');
      return {assets,journal:after.requests,positions:null,revision:after.revision,changed:sessionObservationChanged(before,after),
        checkpoint:{session:after,claims:observed.nativeClaims,requests:assets.map(a=>({assetId:a.asset.assetId,requests:a.requests}))}};};
  } else if (kind === 'NATIVE_NOTE') {
    const {system, account} = raw;
    check = () => {assertOwnedNativeValueAccountAuthority(account, {runtime, system});if(paired)assertNativeWalletEconomicSessionV1(raw.session,{runtime,system,account});}; check();
    identity = genericAccountIdentity(account.config);
    roots = account.registry.map(asset => ({generationId: null, asset, domainCommitment: null}));
    read = async () => {check(); const sessionBefore=paired?await readOriginalSessionWalletEconomicSnapshotV1(raw.session):null;
      const before = await account.privateStatus(); const view = validateFlatOwnerReadPayload(await account.ownerView()).data;
      const after = await account.privateStatus();const sessionAfter=paired?await readOriginalSessionWalletEconomicSnapshotV1(raw.session):null; check();
      const journal = after.operations.filter(o => o.request).map(o => ({requestId: o.request.requestId, assetId: o.request.assetId,
        kind: o.request.kind, state: o.outcome === null ? 'UNKNOWN' : 'CONFIRMED'}));
      const combined=combineOriginalSessionJournal(journal,sessionAfter);
      return {assets: [view], journal:combined, positions: null, revision:sessionAfter?.revision??null, changed: sha(before) !== sha(after)||sessionObservationChanged(sessionBefore,sessionAfter), checkpoint:paired?{account:after,session:sessionAfter}:after};};
  } else {
    const {portfolio} = raw; check = () => {assertOwnedWrappedWalletPortfolioV1(runtime, portfolio);if(paired)assertWrappedWalletEconomicSessionV1(raw.session,{runtime,portfolio});}; check();
    identity = genericAccountIdentity(portfolio.config);
    roots = portfolio.registry.map(asset => ({generationId: null, asset, domainCommitment: null}));
    read = async () => {check();const before=paired?await readOriginalSessionWalletEconomicSnapshotV1(raw.session):null;const view = validateFlatOwnerReadPayload(await portfolio.ownerView()).data;
      const after=paired?await readOriginalSessionWalletEconomicSnapshotV1(raw.session):null;check();
      return {assets: view.assets, journal:combineOriginalSessionJournal([],after), positions: null, revision:after?.revision??null, changed:sessionObservationChanged(before,after),
        checkpoint:paired?{assets:view.assets.map(a => ({assetId: a.asset.assetId, requests: a.requests})),session:after}:view.assets.map(a=>({assetId:a.asset.assetId,requests:a.requests}))};};
  }
  need(roots.length > 0 && roots.length <= 16, 'ROUTES');
  const sourceId = (identity, roots) => sha({kind, identity,
    roots: roots.map(r => ({generationId: r.generationId, asset: r.asset, domainCommitment: r.domainCommitment}))});
  let id = sourceId(identity, roots);
  const routes = () => immutable(roots.map(r => ({route: route(id, r.generationId, r.asset, r.domainCommitment),
    asset: {kind: r.asset.kind, symbol: r.asset.symbol, decimals: r.asset.decimals}})));
  const original = Object.freeze({get id() {return id;}, kind, check, read, intake:raw.intake??null, session: raw.session ?? null, positions: raw.positions ?? null,
    get routes() {return routes();}, get generations() {return flat?.includeIdentities ? flat.generations : null;},
    refresh() {
      check(); if (flat) {flat.generations = catalogueGenerations(flat.catalogue); roots = catalogueRoots(flat.generations);
        flat.includeIdentities = true; need(roots.length > 0 && roots.length <= 16, 'ROUTES');}
    },
    // Only authenticated observation-journal/anchor metadata reaches this
    // private binder. Every descriptor is independently rejoined to the SAME
    // branded catalogue, including all pre-existing generation identities.
    bind(saved) {
      if (!flat) {assert.deepEqual(saved, sourceMetadata(original), 'ORIGINAL_ECONOMIC_STATE_SOURCE_SET_CHANGED'); return;}
      exactRecord(saved, ['sourceId', 'kind', 'routes', ...(Object.hasOwn(saved, 'generations') ? ['generations'] : [])]);
      need(saved.kind === kind && Array.isArray(saved.routes) && saved.routes.length > 0, 'ORIGINAL_SOURCE_SET_REQUIRED');
      const current = catalogueGenerations(flat.catalogue), ids = [...new Set(saved.routes.map(r => r.route.generationId))];
      need(ids.length > 0 && ids.length <= current.length && ids.every((value, i) => value === current[i].generationId), 'ORIGINAL_ROUTES_CHANGED');
      const retained = current.slice(0, ids.length);
      if (Object.hasOwn(saved, 'generations')) assert.deepEqual(saved.generations, retained, 'ORIGINAL_ECONOMIC_STATE_ORIGINAL_ROUTES_CHANGED');
      // The source ID remains its birth identity. A later append never aliases
      // old notes or changes row keys. Legacy multi-generation births stay valid.
      need(retained.some((_, i) => sourceId(sha(retained.slice(0, i + 1)), catalogueRoots(retained.slice(0, i + 1))) === saved.sourceId), 'ORIGINAL_SOURCE_SET_REQUIRED');
      const expected = catalogueRoots(retained).map(r => ({route: route(saved.sourceId, r.generationId, r.asset, r.domainCommitment),
        asset: {kind: r.asset.kind, symbol: r.asset.symbol, decimals: r.asset.decimals}}));
      assert.deepEqual(saved.routes, expected, 'ORIGINAL_ECONOMIC_STATE_ORIGINAL_ROUTES_CHANGED');
      id = saved.sourceId; flat.generations = retained; roots = catalogueRoots(retained); flat.includeIdentities = Object.hasOwn(saved, 'generations'); check();
    },
  }); return original;
}
export function assertOriginalWalletEconomicStateV1(capability) {
  assert.equal(arguments.length, 1); const state = owned.get(capability); need(state, 'ORIGINAL_REQUIRED'); state.live();
}
export function originalWalletEconomicStateBindingsV1(capability) {
  assert.equal(arguments.length, 1); assertOriginalWalletEconomicStateV1(capability);
  return Object.freeze(owned.get(capability).sources.filter(s => s.session).map(s => Object.freeze({session: s.session, positions: s.positions})));
}
/** Private equality check only: this does not return a journal password or
 * issue authority from a route/digest. The capability must still be original. */
export function assertOriginalWalletEconomicStateJournalV1(capability,journal) {
  assert.equal(arguments.length,2);assertOriginalWalletEconomicStateV1(capability);exactRecord(journal,['path','password']);
  need(typeof journal.path==='string'&&typeof journal.password==='string','ORIGINAL_JOURNAL_REQUIRED');
  need(owned.get(capability).journalSHA256===sha({path:resolve(journal.path),password:journal.password}),'ORIGINAL_JOURNAL_REQUIRED');
}
/** PRIVATE installation over references already emitted by original factories.
 * The password belongs only to this observation Vault, never an owner Vault. */
export async function createOriginalWalletEconomicStateV1(input) {
  assert.equal(arguments.length, 1); exactRecord(input, ['catalogues', 'nativeAccounts', 'wrappedPortfolios', 'journal', ...(Object.hasOwn(input,'claimPortfolios')?['claimPortfolios']:[]),...(Object.hasOwn(input,'deviceRootClaimIntakes')?['deviceRootClaimIntakes']:[])]);
  return economicState(input, null);
}
function economicCheckpoint(value) {
  exactRecord(value, ['version', 'profile', 'lifetime', 'sourceSetSHA256', 'revision', 'stateSHA256']);
  need(value.version === 1 && value.profile === ORIGINAL_ECONOMIC_STATE_V1 && Number.isSafeInteger(value.revision) && value.revision >= 0
    && ['lifetime','sourceSetSHA256','stateSHA256'].every(k => typeof value[k] === 'string' && /^[0-9a-f]{64}$/.exec(value[k])?.[0] === value[k]), 'CHECKPOINT');
  return immutable(value);
}
export async function openOriginalWalletEconomicStateV1(input) {
  assert.equal(arguments.length, 1); exactRecord(input, ['catalogues', 'nativeAccounts', 'wrappedPortfolios', 'journal', 'checkpoint', ...(Object.hasOwn(input,'claimPortfolios')?['claimPortfolios']:[]),...(Object.hasOwn(input,'deviceRootClaimIntakes')?['deviceRootClaimIntakes']:[])]);
  return economicState(input, economicCheckpoint(input.checkpoint));
}
/** Local recovery of observations over ALREADY restored original sources. The
 * private anchor supplies this observation journal's credentials, never owner
 * keys, source capabilities, consents or permission to retry an economic job. */
export async function reopenOriginalWalletEconomicStateAfterCrashV1(input) {
  assert.equal(arguments.length, 1); exactRecord(input, ['catalogues', 'nativeAccounts', 'wrappedPortfolios', 'journal', ...(Object.hasOwn(input,'claimPortfolios')?['claimPortfolios']:[]),...(Object.hasOwn(input,'deviceRootClaimIntakes')?['deviceRootClaimIntakes']:[])]);
  exactRecord(input.journal, ['path']);
  return economicState(input, null, true);
}
const ANCHOR_PROFILE = 'ORIGINAL_WALLET_ECONOMIC_LOCAL_ANCHOR_V1';
async function localWriterIdentity() {
  need(process.platform === 'linux', 'LOCAL_RECOVERY_PLATFORM');
  const text = await readFile('/proc/self/stat', 'utf8'), tail = text.slice(text.lastIndexOf(')') + 2).trim().split(/\s+/);
  need(/^[0-9]+$/.test(tail[19]), 'LOCAL_WRITER_IDENTITY');
  const bootId = (await readFile('/proc/sys/kernel/random/boot_id', 'utf8')).trim(), pidNamespace = await readlink('/proc/self/ns/pid');
  need(/^[0-9a-f-]{36}$/.test(bootId) && /^pid:\[[0-9]+\]$/.test(pidNamespace), 'LOCAL_WRITER_IDENTITY');
  return {pid: process.pid, startTicks: tail[19], bootId, pidNamespace};
}
async function originalWriterStopped(prior, current) {
  exactRecord(prior, ['pid','startTicks','bootId','pidNamespace']);
  need(Number.isSafeInteger(prior.pid) && prior.pid > 0 && /^[0-9]+$/.test(prior.startTicks)
    && /^[0-9a-f-]{36}$/.test(prior.bootId) && /^pid:\[[0-9]+\]$/.test(prior.pidNamespace), 'LOCAL_WRITER_IDENTITY');
  if (prior.bootId !== current.bootId) return true;
  need(prior.pidNamespace === current.pidNamespace, 'LOCAL_WRITER_NAMESPACE_CHANGED');
  let text;
  try {text = await readFile('/proc/' + prior.pid + '/stat', 'utf8');}
  catch (error) {if (error.code === 'ENOENT' || error.code === 'ESRCH') return true; throw error;}
  const tail = text.slice(text.lastIndexOf(')') + 2).trim().split(/\s+/);
  need(/^[0-9]+$/.test(tail[19]), 'LOCAL_WRITER_IDENTITY');
  return tail[19] !== prior.startTicks;
}
async function privateAnchorFile(path, maximum) {
  const named = await lstat(path); need(named.isFile() && !named.isSymbolicLink() && named.nlink === 1 && named.uid === process.getuid()
    && (named.mode & 0o777) === 0o600 && await realpath(path) === path, 'ANCHOR_PRIVATE_FILE');
  const fd = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW); let bytes;
  try {
    const before = await fd.stat(); need(before.isFile() && before.dev === named.dev && before.ino === named.ino && before.size <= maximum, 'ANCHOR_PRIVATE_FILE');
    bytes = Buffer.alloc(maximum + 1); let offset = 0;
    while (offset < bytes.length) {const result = await fd.read(bytes, offset, bytes.length - offset, offset); if (result.bytesRead === 0) break; offset += result.bytesRead;}
    need(offset <= maximum, 'ANCHOR_PRIVATE_FILE'); const after = await fd.stat(), final = await lstat(path);
    need(after.dev === before.dev && after.ino === before.ino && after.size === before.size && after.mtimeMs === before.mtimeMs
      && final.dev === before.dev && final.ino === before.ino && final.size === offset && final.uid === process.getuid() && final.nlink === 1
      && (final.mode & 0o777) === 0o600 && after.uid === final.uid && after.nlink === 1 && (after.mode & 0o777) === 0o600, 'ANCHOR_PRIVATE_FILE');
    return {bytes: Buffer.from(bytes.subarray(0, offset)), dev: before.dev, ino: before.ino};
  } finally {bytes?.fill(0); await fd.close();}
}
async function syncAnchorDirectory(path) {const fd = await open(path, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW); try {await fd.sync();} finally {await fd.close();}}
/** Infrastructure-only single writer: every process identity is observed from
 * the local kernel. A stale lease is reclaimed only after its ORIGINAL writer
 * is absent/replaced; no stale Vault lock or temporary file is adopted/removed. */
async function claimAnchorWriter(path, sourceSetSHA256, allowStopped) {
  const processIdentity = await localWriterIdentity();
  const value = {version: 1, sourceSetSHA256, process: processIdentity, token: randomBytes(32).toString('hex')};
  const claim = () => open(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  let fd;
  try {fd = await claim();} catch (error) {
    if (error.code !== 'EEXIST' || !allowStopped) throw error;
    const prior = await privateAnchorFile(path, 1024); let old;
    try {old = JSON.parse(prior.bytes.toString('utf8'));} finally {prior.bytes.fill(0);}
    exactRecord(old, ['version','sourceSetSHA256','process','token']);
    need(old.version === 1 && old.sourceSetSHA256 === sourceSetSHA256 && /^[0-9a-f]{64}$/.test(old.token), 'ANCHOR_WRITER_REQUIRED');
    need(await originalWriterStopped(old.process, processIdentity), 'ANCHOR_WRITER_STILL_LIVE');
    const current = await lstat(path); need(current.dev === prior.dev && current.ino === prior.ino, 'ANCHOR_WRITER_CHANGED');
    await unlink(path); await syncAnchorDirectory(dirname(path)); fd = await claim();
  }
  try {await fd.writeFile(JSON.stringify(value), 'utf8'); await fd.sync();} finally {await fd.close();}
  await syncAnchorDirectory(dirname(path)); let released = false;
  return async () => {
    if (released) return; const actual = await privateAnchorFile(path, 1024); let row;
    try {row = JSON.parse(actual.bytes.toString('utf8'));} finally {actual.bytes.fill(0);}
    assert.deepEqual(row, value, 'ORIGINAL_ECONOMIC_STATE_ANCHOR_WRITER_CHANGED');
    const current = await lstat(path); need(current.dev === actual.dev && current.ino === actual.ino, 'ANCHOR_WRITER_CHANGED');
    await unlink(path); await syncAnchorDirectory(dirname(path)); released = true;
  };
}
async function localEconomicAnchor(journal, sources, lifetime, initial, opening) {
  const directory = journal.path + '.original-state-anchor-v1';
  if (!opening) await mkdir(directory, {mode: 0o700});
  const metadata = await lstat(directory); need(metadata.isDirectory() && !metadata.isSymbolicLink() && metadata.uid === process.getuid()
    && (metadata.mode & 0o777) === 0o700 && await realpath(directory) === directory, 'ANCHOR_PRIVATE_DIRECTORY');
  const location = {path: journal.path, directoryDevice: String(metadata.dev), directoryInode: String(metadata.ino)};
  const physical = async () => {const actual = await lstat(directory); need(actual.dev === metadata.dev && actual.ino === metadata.ino && actual.isDirectory()
    && !actual.isSymbolicLink() && actual.uid === process.getuid() && (actual.mode & 0o777) === 0o700 && await realpath(directory) === directory, 'ANCHOR_PRIVATE_DIRECTORY');};
  const keyPath = directory + '/local-observation-root.secret';
  if (!opening) {const bytes = randomBytes(32), fd = await open(keyPath, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    try {await fd.writeFile(bytes); await fd.sync();} finally {bytes.fill(0); await fd.close();} await syncAnchorDirectory(directory);}
  const key = await privateAnchorFile(keyPath, 32); let password;
  try {need(key.bytes.length === 32, 'ANCHOR_LOCAL_KEY'); password = key.bytes.toString('hex');} finally {key.bytes.fill(0);}
  const vault = new Vault(directory + '/anchor.vault'); let record;
  const readAnchor=async()=>{const physicalFile=await privateAnchorFile(vault.path,2*1024*1024);physicalFile.bytes.fill(0);return vault.read(password);};
  if (opening) {record = await readAnchor(); bindOriginalSourceSet(sources, record.data.sources);}
  const sourceSet = opening ? immutable(record.data.sources) : immutable(sources.map(sourceMetadata));
  // The writer remains bound to these birth sources; appended generations are
  // authenticated by the same original catalogue and the CAS checkpoint below.
  const release = await claimAnchorWriter(directory + '/writer.lock', sha(sourceSet), opening);
  const checkpoint = value => economicCheckpoint({version:1,profile:ORIGINAL_ECONOMIC_STATE_V1,lifetime,
    sourceSetSHA256:sha(value.data.sources),revision:value.revision,stateSHA256:sha(value.data)});
  const validate = value => {
    exactRecord(value.data, ['version','profile','location','lifetime','sources','journal','confirmed','candidate']);
    const data = value.data; need(data.version === 1 && data.profile === ANCHOR_PROFILE, 'ANCHOR_REQUIRED');
    assert.deepEqual(data.location, location, 'ORIGINAL_ECONOMIC_STATE_ANCHOR_LOCATION_CHANGED');
    assert.deepEqual(data.sources, sourceSet, 'ORIGINAL_ECONOMIC_STATE_SOURCE_SET_CHANGED'); exactRecord(data.journal, ['path','password']);
    need(data.journal.path === journal.path && typeof data.journal.password === 'string' && data.journal.password.length >= 16, 'ANCHOR_ORIGINAL_JOURNAL');
    need(typeof data.lifetime === 'string' && /^[0-9a-f]{64}$/.test(data.lifetime), 'ANCHOR_REQUIRED');
    for (const k of ['confirmed','candidate']) if(data[k] !== null) {economicCheckpoint(data[k]);need(data[k].lifetime === data.lifetime, 'ANCHOR_CHECKPOINT');}
    need(data.confirmed !== null || data.candidate !== null, 'ANCHOR_CHECKPOINT');
    if(data.candidate !== null) need(data.candidate.revision === (data.confirmed === null ? 0 : data.confirmed.revision + 1), 'ANCHOR_CHECKPOINT_SEQUENCE');
    return data;
  };
  try {
    await physical();
    record = opening ? await readAnchor() : await vault.create({version:1,profile:ANCHOR_PROFILE,location,lifetime,sources:sourceSet,
      journal:{...journal},confirmed:null,candidate:checkpoint({revision:0,data:initial})}, password);
    validate(record); await physical(); assert.deepEqual(await readAnchor(), record);
  } catch (error) {try {await release();} finally {password=null;} throw error;}
  const healthy = async () => {await physical();
    assert.deepEqual(await readAnchor(), record, 'ORIGINAL_ECONOMIC_STATE_ANCHOR_CHECKPOINT_CHANGED'); await physical();};
  const mutate = async transform => {await healthy(); const next = await vault.update(password, record.revision, transform); validate(next);
    await physical(); assert.deepEqual(await readAnchor(), next); record = next;};
  let closing = null;
  return {
    data: () => immutable(record.data), healthy,
    async prepare(before, next) {assert.deepEqual(record.data.confirmed, before, 'ORIGINAL_ECONOMIC_STATE_ANCHOR_CHECKPOINT_CHANGED');
      need(record.data.candidate === null, 'ANCHOR_CANDIDATE_PENDING'); await mutate(data=>({...data,candidate:next}));},
    async settle(actual) {const data=record.data; need(sha(actual)===sha(data.confirmed)||sha(actual)===sha(data.candidate), 'ANCHOR_CHECKPOINT_REQUIRED');
      if(data.candidate!==null)await mutate(row=>({...row,confirmed:actual,candidate:null}));},
    close() {return closing ??= (async()=>{try {await release();} finally {password=null;}})();},
  };
}
async function economicState(input, checkpoint, afterCrash = false) {
  const sources = [];
  for (const [key, kind] of [['catalogues', 'FLAT_NOTE'], ['nativeAccounts', 'NATIVE_NOTE'], ['wrappedPortfolios', 'WRAPPED_CLAIM']]) {
    need(Array.isArray(input[key]) && input[key].length <= 8, 'SOURCE_COUNT'); fixedArray(input[key], input[key].length);
    input[key].forEach(value => sources.push(source(value, kind)));
  }
  if(Object.hasOwn(input,'claimPortfolios')) {need(Array.isArray(input.claimPortfolios)&&input.claimPortfolios.length<=8,'SOURCE_COUNT'); fixedArray(input.claimPortfolios,input.claimPortfolios.length);
    input.claimPortfolios.forEach(value=>sources.push(source(value,'NATIVE_CLAIM')));}
  if(Object.hasOwn(input,'deviceRootClaimIntakes')){need(Array.isArray(input.deviceRootClaimIntakes)&&input.deviceRootClaimIntakes.length<=8,'SOURCE_COUNT');fixedArray(input.deviceRootClaimIntakes,input.deviceRootClaimIntakes.length);input.deviceRootClaimIntakes.forEach(intake=>sources.push(source({intake},'NATIVE_CLAIM')));}
  need(sources.length > 0 && sources.length <= 24 && sources.reduce((n,s) => n + s.routes.length,0) <= 64
    && new Set(sources.map(s => s.id)).size === sources.length, 'ORIGINAL_SOURCES');
  exactRecord(input.journal, afterCrash ? ['path'] : ['path', 'password']);
  need(typeof input.journal.path === 'string', 'ORIGINAL_JOURNAL_PATH');
  const path=resolve(input.journal.path);if(afterCrash)need(path===input.journal.path,'ORIGINAL_JOURNAL_PATH'); let password = afterCrash ? null : input.journal.password;
  if (!afterCrash) need(typeof password === 'string' && password.length >= 16, 'JOURNAL_PASSWORD');
  const parent = await lstat(dirname(path)); need(parent.isDirectory() && !parent.isSymbolicLink() && (parent.mode & 0o777) === 0o700
    && parent.uid === process.getuid() && await realpath(dirname(path)) === dirname(path), 'PRIVATE_DIRECTORY');
  const directoryIdentity = {dev: parent.dev, ino: parent.ino};
  const vault = new Vault(path); let lifetime = checkpoint?.lifetime ?? randomBytes(32).toString('hex'), anchor = null;
  let closed = false, fenced = false, busy = false, fault = false, work = null, pending = null, freshAt = null;
  let rowFreshness = new Map();
  function live() {need(!closed&&!fenced, 'CLOSED');}
  async function physical(required = true) {
    const p = await lstat(dirname(path)); need(p.isDirectory() && !p.isSymbolicLink() && p.dev === directoryIdentity.dev && p.ino === directoryIdentity.ino
      && p.uid === process.getuid() && (p.mode & 0o777) === 0o700 && await realpath(dirname(path)) === dirname(path), 'PRIVATE_DIRECTORY');
    if (required) {const f = await lstat(path); need(f.isFile() && !f.isSymbolicLink() && f.nlink === 1 && f.uid === process.getuid()
      && (f.mode & 0o777) === 0o600 && await realpath(path) === path, 'PRIVATE_FILE');}
  }
  const capabilities = {readOnly: true, privateBalancesAggregated: false, underlyingCredit: false, deviceRootsIncluded: false, crossNetworkAtomicState: false};
  const checkpoints = sources.map(s => ({sourceId: s.id, stateSHA256: sha({sourceId: s.id, state: 'UNKNOWN'}), journalRevision: null}));
  const sourceSet = immutable(sources.map(sourceMetadata));
  const makeCheckpoint = value => economicCheckpoint({version:1,profile:ORIGINAL_ECONOMIC_STATE_V1,lifetime,sourceSetSHA256:sha(value.data.sources),revision:value.revision,stateSHA256:sha(value.data)});
  let record;
  try {
    const initial = {version:1,profile:ORIGINAL_ECONOMIC_STATE_V1,lifetime,sources:sourceSet,
      rows:sources.flatMap(s=>unknown(s,'ORIGINAL_SOURCE_UNAVAILABLE',checkpoints.find(c=>c.sourceId===s.id).stateSHA256)),checkpoints};
    if(checkpoint===null&&!afterCrash) {
      // Preserve the old duplicate-create rejection; never adopt an old file.
      try {await lstat(path); const error=Error('ORIGINAL_ECONOMIC_STATE_JOURNAL_EXISTS'); error.code='VAULT_EXISTS'; throw error;} catch(error) {if(error.code!=='ENOENT')throw error;}
      anchor=await localEconomicAnchor({path,password},sources,lifetime,initial,false);
      record=await vault.create(initial,password);await physical();assert.deepEqual(await vault.read(password),record);await anchor.settle(makeCheckpoint(record));
    } else {
      // Legacy ordered captures remain exact. A missing anchor is accepted only
      // for that OLD checkpoint-bearing contract, never for crash recovery.
      let hasAnchor=true;try{await lstat(path+'.original-state-anchor-v1');}catch(error){if(error.code==='ENOENT')hasAnchor=false;else throw error;}
      if(afterCrash||hasAnchor) {
        anchor=await localEconomicAnchor({path,...(afterCrash?{}:{password})},sources,lifetime,null,true);
        const data=anchor.data();if(!afterCrash)assert.deepEqual(data.journal,{path,password},'ORIGINAL_ECONOMIC_STATE_ANCHOR_CREDENTIALS_CHANGED');
        password=data.journal.password;lifetime=data.lifetime;
      }
      if(afterCrash) {try {await lstat(vault.lockPath);need(false,'ANCHOR_STATE_VAULT_LOCKED');}catch(error){if(error.code!=='ENOENT')throw error;}}
      await physical();record=await vault.read(password);await physical();
      exactRecord(record.data,['version','profile','lifetime','sources','rows','checkpoints']);
      const actual=makeCheckpoint(record);
      if(afterCrash) {const data=anchor.data();need(sha(actual)===sha(data.confirmed)||sha(actual)===sha(data.candidate),'ANCHOR_CHECKPOINT_REQUIRED');await anchor.settle(actual);checkpoint=actual;}
      need(record.revision===checkpoint.revision&&sha(record.data)===checkpoint.stateSHA256&&record.data.lifetime===lifetime
        &&record.data.version===1&&record.data.profile===ORIGINAL_ECONOMIC_STATE_V1,'ORIGINAL_CHECKPOINT_REQUIRED');
      if(anchor&&!afterCrash)assert.deepEqual(anchor.data().confirmed,checkpoint,'ORIGINAL_ECONOMIC_STATE_ANCHOR_CHECKPOINT_CHANGED');
      need(checkpoint.sourceSetSHA256===sha(record.data.sources),'ORIGINAL_SOURCE_SET_REQUIRED');
      bindOriginalSourceSet(sources,record.data.sources);
      assert.deepEqual(record.data.sources,immutable(sources.map(sourceMetadata)),'ORIGINAL_ECONOMIC_STATE_SOURCE_SET_CHANGED');
      const keys=sources.flatMap(s=>s.routes.map(r=>sha(r.route))).sort();
      assert.deepEqual(record.data.rows.map(r=>sha(r.route)).sort(),keys,'ORIGINAL_ECONOMIC_STATE_ROUTES_CHANGED');
      need(new Set(record.data.checkpoints.map(c=>c.sourceId)).size===sources.length&&sources.every(s=>record.data.checkpoints.some(c=>c.sourceId===s.id)),'ORIGINAL_CHECKPOINT_REQUIRED');
      const liveCount=record.data.rows.filter(r=>r.state==='LIVE').length;
      validateOriginalWalletEconomicStateV1({version:1,profile:ORIGINAL_ECONOMIC_STATE_V1,lifetime,status:liveCount===record.data.rows.length&&liveCount>0?'LIVE':liveCount>0?'PARTIAL':record.data.rows.some(r=>r.state==='STALE')?'STALE':'UNKNOWN',
        revision:record.revision,storageAvailable:true,observedAt:null,rows:record.data.rows,checkpoints:record.data.checkpoints,capabilities});
    }
    await physical();assert.deepEqual(await vault.read(password),record);
  } catch(error) {try {await anchor?.close();} finally {password=null;} throw error;}
  async function healthy() {try {await anchor?.healthy(); await physical(); assert.deepEqual(await vault.read(password), record, 'ORIGINAL_ECONOMIC_STATE_CHECKPOINT_CHANGED'); await physical();}
    catch(error){fault=true;freshAt=null;throw error;}}
  function snapshot() {
    const unavailable = new Set(); for (const s of sources) try {s.check();} catch {unavailable.add(s.id);}
    const now = Date.now();
    const rows = record.data.rows.map(r => {
      const observedAt = rowFreshness.get(sha(r.route)) ?? null;
      const stale = freshAt === null || observedAt === null || now < observedAt || now - observedAt > ORIGINAL_ECONOMIC_STATE_MAX_AGE_MS;
      const missing = unavailable.has(r.route.sourceId);
      if (!fault && !missing && !(stale && r.state === 'LIVE')) return {...r, observedAt};
      return {...r, observedAt: null, state: fault || missing ? 'UNKNOWN' : 'STALE', reason: fault ? 'ORIGINAL_STATE_STORAGE_UNAVAILABLE' : missing ? 'ORIGINAL_SOURCE_UNAVAILABLE' : 'ORIGINAL_HEAD_STALE', head: null, balances: null, backing: null,
        position: r.position ? {...r.position, ownershipStatus: fault || missing ? 'UNKNOWN' : 'STALE', valuationStatus: fault || missing ? 'UNKNOWN' : 'STALE', shares: null, estimate: null, head: null} : null};
    });
    const liveCount = rows.filter(r => r.state === 'LIVE').length;
    return immutable(validateOriginalWalletEconomicStateV1({version: 1, profile: ORIGINAL_ECONOMIC_STATE_V1, lifetime,
      status: fault ? 'UNKNOWN' : liveCount === rows.length && liveCount > 0 ? 'LIVE' : liveCount > 0 ? 'PARTIAL' : rows.some(r => r.state === 'STALE') ? 'STALE' : 'UNKNOWN',
      revision: record.revision, storageAvailable: !fault, observedAt: freshAt, rows, checkpoints: record.data.checkpoints, capabilities}));
  }
  async function persist(rows, nextCheckpoints) {
    const nextSources = immutable(sources.map(sourceMetadata));
    need(nextSources.reduce((n, s) => n + s.routes.length, 0) <= 64, 'ROUTES');
    const nextData = {...record.data, sources: nextSources, rows, checkpoints: nextCheckpoints};
    if (sha(nextData) === sha(record.data)) return;
    pending = {revision: record.revision + 1, data: immutable(nextData)};
    try {await anchor?.prepare(makeCheckpoint(record),makeCheckpoint(pending));
      const next = await vault.update(password, record.revision, () => pending.data); assert.deepEqual(next, pending);
      await physical(); assert.deepEqual(await vault.read(password), next); await anchor?.settle(makeCheckpoint(next)); record = next; pending = null;
    } catch (error) {fault = true; freshAt = null; throw error;}
  }
  async function observe() {
    need(!fault, 'STORAGE_UNAVAILABLE'); await healthy(); need(!closed, 'CLOSED'); const rows = [], checks = [], observedTimes = [], nextFreshness = new Map();
    for (const s of sources) {
      need(!closed, 'CLOSED'); let result;
      try {s.refresh(); result = await s.read(); need(!closed, 'CLOSED');}
      catch {const checkpoint = sha({sourceId: s.id, state: 'UNKNOWN'}); checks.push({sourceId: s.id, stateSHA256: checkpoint, journalRevision: null});
        rows.push(...unknown(s, 'ORIGINAL_SOURCE_UNAVAILABLE', checkpoint, record.data.rows)); continue;}
      const checkpoint = stateHash(result.checkpoint); checks.push({sourceId: s.id, stateSHA256: checkpoint, journalRevision: result.revision});
      const sourceRows=originalRows(s, result.assets, result.journal, checkpoint, result.positions, result.changed);
      rows.push(...sourceRows); for(const row of sourceRows.filter(r=>r.state==='LIVE')) {const item=result.assets.find(a=>a.asset.assetId===row.route.assetId&&(a.generationId??null)===row.route.generationId); observedTimes.push(item.observed.observedAt); nextFreshness.set(sha(row.route), item.observed.observedAt);}
    }
    need(!closed, 'CLOSED'); await healthy(); await persist(rows, checks); need(!closed, 'CLOSED'); rowFreshness = nextFreshness; freshAt = observedTimes.length ? Math.min(...observedTimes) : Date.now(); return snapshot();
  }
  function run(fn) {live(); need(!busy, 'BUSY'); busy = true;
    work = (async () => {try {return await fn();} finally {busy = false; work = null;}})(); return work;}
  const capability = Object.freeze({
    checkpoint() {assert.equal(arguments.length,0); live(); need(!busy && !fault && pending === null, 'CHECKPOINT_UNAVAILABLE');
      return makeCheckpoint(record);},
    capture() {assert.equal(arguments.length,0);live();fenced=true;freshAt=null;const active=work;
      return (async()=>{try{if(active)await active;need(!closed&&!busy&&!fault&&pending===null,'CHECKPOINT_UNAVAILABLE');await healthy();
        const checkpoint=makeCheckpoint(record);
        need(!closed,'CLOSED');return checkpoint;}finally{closed=true;try{await anchor?.close();}finally{password=null;}}})();},
    observe() {assert.equal(arguments.length, 0); return run(observe);},
    async idle() {assert.equal(arguments.length,0); live(); const active=work; if(active)await active.catch(()=>{}); live(); need(!busy,'BUSY'); return {phase:fault?'UNKNOWN':'READY'};},
    snapshot() {assert.equal(arguments.length, 0); return run(async () => {try {await healthy();} catch {fault = true;} need(!closed, 'CLOSED'); return snapshot();});},
    reconcile() {assert.equal(arguments.length, 0); return run(async () => {
      await physical(); const actual = await vault.read(password); await physical();
      need(sha(actual) === sha(record) || pending !== null && sha(actual) === sha(pending), 'ORIGINAL_CHECKPOINT_REQUIRED');
      await anchor?.settle(makeCheckpoint(actual)); record = actual; pending = null; fault = false; freshAt = null;
      // Only fresh observations of the same originals clear UNKNOWN. No account
      // reconcile/prepare/execute call, replacement reader or resend is made.
      return observe();
    });},
    close() {assert.equal(arguments.length, 0); closed = true; freshAt = null; const active = work;
      return (async () => {if (active) await active.catch(() => {}); try {await anchor?.close();} finally {password=null;} return {closed: true, originalResourcesRetained: true};})();},
    toJSON() {throw Error('ORIGINAL_ECONOMIC_STATE_NOT_SERIALIZABLE');},
  });
  try {sources.forEach(s=>s.check()); owned.set(capability,{live,sources,journalSHA256:sha({path,password})}); return capability;}
  catch(error) {try {await anchor?.close();} finally {password=null;} throw error;}
}

/** Original device-root intake membership, for its fixed paired transport. */
export function originalWalletEconomicDeviceRootClaimBindingsV2(capability){
  assert.equal(arguments.length,1);assertOriginalWalletEconomicStateV1(capability);
  return Object.freeze(owned.get(capability).sources.filter(s=>s.intake).map(s=>{s.check();return s.intake;}));
}
