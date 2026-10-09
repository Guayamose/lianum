/** Durable read union over original private authorities. This journal records
 * observations; it cannot prepare a note, mint a credit or send a transaction. */
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {types} from 'node:util';
import {lstat, realpath} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {Vault} from '../../../../engine/src/crypto/vault.mjs';
import {genericAccountIdentity, immutable, sha} from '../../../../engine/src/execution/accounts/generic-account-journal.mjs';
import {exactRecord, fixedArray} from '../../execution/encoding/commitments.mjs';
import {assertOwnedFlatJournalCatalogue} from '../storage/flat-journal-catalogue.mjs';
import {assertFlatManualGraphCatalogueSession,assertNativeWalletEconomicSessionV1,assertWrappedWalletEconomicSessionV1,readOriginalSessionWalletEconomicSnapshotV1} from '../../api/accounts/flat-manual-graph-session.mjs';
import {assertOwnedNativeValueAccountAuthority} from '../authority/native-value-account-authority-v2.mjs';
import {assertOwnedWrappedWalletPortfolioV1} from '../portfolio/wrapped-wallet-portfolio-v1.mjs';
import {generationPrivateVaultExitBinding, assertGenerationPrivateVaultExitSession} from '../../defi/withdrawals/generation-private-vault-exit.mjs';
import {validateFlatOwnerReadPayload} from '../../../../../apps/wallet/src/client/features/portfolio/owner-portfolio-contract.mjs';
import {validatePositionStateEnvelope, samePositionHead} from '../../../../../apps/wallet/src/client/features/portfolio/generation-position-state-v2.mjs';
import {ORIGINAL_ECONOMIC_STATE_V1, ORIGINAL_ECONOMIC_STATE_MAX_AGE_MS, validateOriginalWalletEconomicStateV1}
  from '../../../../../apps/wallet/src/client/features/portfolio/original-economic-state-v1.mjs';
const owned = new WeakMap();
const need = (ok, code) => assert.ok(ok, 'ORIGINAL_ECONOMIC_STATE_' + code);
const head = observed => observed ? Object.fromEntries(['blockNumber', 'blockHash', 'timestamp'].map(k => [k, observed[k]])) : null;
const stateHash = value => sha(value);
function route(sourceId, generationId, asset, domainCommitment) {
  return {sourceId, generationId, ...Object.fromEntries(['assetId', 'chainId', 'genesis', 'pool', 'scope', 'policy', 'assetIdentity'].map(k => [k, asset[k]])), domainCommitment};
}
const sourceMetadata = source => ({sourceId: source.id, kind: source.kind, routes: source.routes});
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
    : kind === 'NATIVE_NOTE' ? ['runtime', 'system', 'account',...(paired?['session']:[])] : ['runtime', 'portfolio',...(paired?['session']:[])]);
  const {runtime} = raw; let roots, check, read, identity;
  if (kind === 'FLAT_NOTE') {
    const {catalogue, session, positions} = raw;
    check = () => {assertOwnedFlatJournalCatalogue(catalogue, {runtime}); assertFlatManualGraphCatalogueSession(session, {runtime, catalogue});
      if (positions !== null) {need(generationPrivateVaultExitBinding(runtime, positions)?.catalogue === catalogue, 'ORIGINAL_POSITIONS'); assertGenerationPrivateVaultExitSession(runtime, positions, session);}};
    check(); const generations = catalogue.status().generations;
    roots = generations.flatMap(g => g.registry.map(asset => {
      const r = g.routes.find(r => r.assetId === asset.assetId); need(r && r.pool === asset.pool, 'ORIGINAL_ROUTE');
      return {generationId: g.generationId, asset, domainCommitment: r.domainCommitment};
    }));
    const identities = sha(generations.map(g => ({generationId: g.generationId, identity: g.identity, registry: g.registry, routes: g.routes})));
    identity = identities; const branded = check;
    check = () => {branded(); need(identities === sha(catalogue.status().generations.map(g => ({generationId: g.generationId, identity: g.identity, registry: g.registry, routes: g.routes}))), 'ORIGINAL_ROUTES_CHANGED');};
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
  const id = sha({kind, identity, roots: roots.map(r => ({generationId: r.generationId, asset: r.asset, domainCommitment: r.domainCommitment}))});
  return Object.freeze({id, kind, check, read, session: raw.session ?? null, positions: raw.positions ?? null,
    routes: immutable(roots.map(r => ({route: route(id, r.generationId, r.asset, r.domainCommitment), asset: {kind: r.asset.kind, symbol: r.asset.symbol, decimals: r.asset.decimals}})))});
}
export function assertOriginalWalletEconomicStateV1(capability) {
  assert.equal(arguments.length, 1); const state = owned.get(capability); need(state, 'ORIGINAL_REQUIRED'); state.live();
}
export function originalWalletEconomicStateBindingsV1(capability) {
  assert.equal(arguments.length, 1); assertOriginalWalletEconomicStateV1(capability);
  return Object.freeze(owned.get(capability).sources.filter(s => s.session).map(s => Object.freeze({session: s.session, positions: s.positions})));
}
/** PRIVATE installation over references already emitted by original factories.
 * The password belongs only to this observation Vault, never an owner Vault. */
export async function createOriginalWalletEconomicStateV1(input) {
  assert.equal(arguments.length, 1); exactRecord(input, ['catalogues', 'nativeAccounts', 'wrappedPortfolios', 'journal']);
  return economicState(input, null);
}
export async function openOriginalWalletEconomicStateV1(input) {
  assert.equal(arguments.length, 1); exactRecord(input, ['catalogues', 'nativeAccounts', 'wrappedPortfolios', 'journal', 'checkpoint']);
  exactRecord(input.checkpoint, ['version', 'profile', 'lifetime', 'sourceSetSHA256', 'revision', 'stateSHA256']);
  const checkpoint = immutable(input.checkpoint);
  need(checkpoint.version === 1 && checkpoint.profile === ORIGINAL_ECONOMIC_STATE_V1 && Number.isSafeInteger(checkpoint.revision) && checkpoint.revision >= 0
    && ['lifetime','sourceSetSHA256','stateSHA256'].every(k => typeof checkpoint[k] === 'string' && /^[0-9a-f]{64}$/.exec(checkpoint[k])?.[0] === checkpoint[k]), 'CHECKPOINT');
  return economicState(input, checkpoint);
}
async function economicState(input, checkpoint) {
  const sources = [];
  for (const [key, kind] of [['catalogues', 'FLAT_NOTE'], ['nativeAccounts', 'NATIVE_NOTE'], ['wrappedPortfolios', 'WRAPPED_CLAIM']]) {
    need(Array.isArray(input[key]) && input[key].length <= 8, 'SOURCE_COUNT'); fixedArray(input[key], input[key].length);
    input[key].forEach(value => sources.push(source(value, kind)));
  }
  need(sources.length > 0 && sources.length <= 24 && sources.reduce((n,s) => n + s.routes.length,0) <= 64
    && new Set(sources.map(s => s.id)).size === sources.length, 'ORIGINAL_SOURCES');
  exactRecord(input.journal, ['path', 'password']);
  const path = resolve(input.journal.path); let password = input.journal.password;
  need(typeof password === 'string' && password.length >= 16, 'JOURNAL_PASSWORD');
  const parent = await lstat(dirname(path)); need(parent.isDirectory() && !parent.isSymbolicLink() && (parent.mode & 0o777) === 0o700
    && parent.uid === process.getuid() && await realpath(dirname(path)) === dirname(path), 'PRIVATE_DIRECTORY');
  const directoryIdentity = {dev: parent.dev, ino: parent.ino};
  const vault = new Vault(path), lifetime = checkpoint?.lifetime ?? randomBytes(32).toString('hex');
  let closed = false, fenced = false, busy = false, fault = false, work = null, pending = null, freshAt = null;
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
  let record;
  if (checkpoint === null) record = await vault.create({version: 1, profile: ORIGINAL_ECONOMIC_STATE_V1, lifetime, sources: sourceSet,
    rows: sources.flatMap(s => unknown(s, 'ORIGINAL_SOURCE_UNAVAILABLE', checkpoints.find(c => c.sourceId === s.id).stateSHA256)), checkpoints}, password);
  else {
    need(checkpoint.sourceSetSHA256 === sha(sourceSet), 'ORIGINAL_SOURCE_SET_REQUIRED'); await physical();
    record = await vault.read(password); await physical();
    exactRecord(record.data, ['version','profile','lifetime','sources','rows','checkpoints']);
    need(record.revision === checkpoint.revision && sha(record.data) === checkpoint.stateSHA256 && record.data.lifetime === lifetime
      && record.data.version === 1 && record.data.profile === ORIGINAL_ECONOMIC_STATE_V1, 'ORIGINAL_CHECKPOINT_REQUIRED');
    assert.deepEqual(record.data.sources, sourceSet, 'ORIGINAL_ECONOMIC_STATE_SOURCE_SET_CHANGED');
    const keys = sources.flatMap(s => s.routes.map(r => sha(r.route))).sort();
    assert.deepEqual(record.data.rows.map(r => sha(r.route)).sort(), keys, 'ORIGINAL_ECONOMIC_STATE_ROUTES_CHANGED');
    need(new Set(record.data.checkpoints.map(c => c.sourceId)).size === sources.length
      && sources.every(s => record.data.checkpoints.some(c => c.sourceId === s.id)), 'ORIGINAL_CHECKPOINT_REQUIRED');
    const liveCount = record.data.rows.filter(r => r.state === 'LIVE').length;
    validateOriginalWalletEconomicStateV1({version:1,profile:ORIGINAL_ECONOMIC_STATE_V1,lifetime,status:liveCount === record.data.rows.length && liveCount > 0 ? 'LIVE' : liveCount > 0 ? 'PARTIAL' : record.data.rows.some(r => r.state === 'STALE') ? 'STALE' : 'UNKNOWN',
      revision:record.revision,storageAvailable:true,observedAt:null,rows:record.data.rows,checkpoints:record.data.checkpoints,capabilities});
  }
  await physical(); assert.deepEqual(await vault.read(password), record);
  async function healthy() {try {await physical(); assert.deepEqual(await vault.read(password), record, 'ORIGINAL_ECONOMIC_STATE_CHECKPOINT_CHANGED'); await physical();}
    catch(error){fault=true;freshAt=null;throw error;}}
  function snapshot() {
    const unavailable = new Set(); for (const s of sources) try {s.check();} catch {unavailable.add(s.id);}
    const now = Date.now(), stale = freshAt === null || now < freshAt || now - freshAt > ORIGINAL_ECONOMIC_STATE_MAX_AGE_MS;
    const rows = record.data.rows.map(r => {
      const missing = unavailable.has(r.route.sourceId);
      if (!fault && !missing && !(stale && r.state === 'LIVE')) return r;
      return {...r, state: fault || missing ? 'UNKNOWN' : 'STALE', reason: fault ? 'ORIGINAL_STATE_STORAGE_UNAVAILABLE' : missing ? 'ORIGINAL_SOURCE_UNAVAILABLE' : 'ORIGINAL_HEAD_STALE', head: null, balances: null, backing: null,
        position: r.position ? {...r.position, ownershipStatus: fault || missing ? 'UNKNOWN' : 'STALE', valuationStatus: fault || missing ? 'UNKNOWN' : 'STALE', shares: null, estimate: null, head: null} : null};
    });
    const liveCount = rows.filter(r => r.state === 'LIVE').length;
    return immutable(validateOriginalWalletEconomicStateV1({version: 1, profile: ORIGINAL_ECONOMIC_STATE_V1, lifetime,
      status: fault ? 'UNKNOWN' : liveCount === rows.length && liveCount > 0 ? 'LIVE' : liveCount > 0 ? 'PARTIAL' : rows.some(r => r.state === 'STALE') ? 'STALE' : 'UNKNOWN',
      revision: record.revision, storageAvailable: !fault, observedAt: freshAt, rows, checkpoints: record.data.checkpoints, capabilities}));
  }
  async function persist(rows, nextCheckpoints) {
    const nextData = {...record.data, rows, checkpoints: nextCheckpoints};
    if (sha(nextData) === sha(record.data)) return;
    pending = {revision: record.revision + 1, data: immutable(nextData)};
    try {const next = await vault.update(password, record.revision, () => pending.data); assert.deepEqual(next, pending);
      await physical(); assert.deepEqual(await vault.read(password), next); record = next; pending = null;
    } catch (error) {fault = true; freshAt = null; throw error;}
  }
  async function observe() {
    need(!fault, 'STORAGE_UNAVAILABLE'); await healthy(); need(!closed, 'CLOSED'); const rows = [], checks = [], observedTimes = [];
    for (const s of sources) {
      need(!closed, 'CLOSED'); let result;
      try {result = await s.read(); need(!closed, 'CLOSED');}
      catch {const checkpoint = sha({sourceId: s.id, state: 'UNKNOWN'}); checks.push({sourceId: s.id, stateSHA256: checkpoint, journalRevision: null});
        rows.push(...unknown(s, 'ORIGINAL_SOURCE_UNAVAILABLE', checkpoint, record.data.rows)); continue;}
      const checkpoint = stateHash(result.checkpoint); checks.push({sourceId: s.id, stateSHA256: checkpoint, journalRevision: result.revision});
      const sourceRows=originalRows(s, result.assets, result.journal, checkpoint, result.positions, result.changed);
      rows.push(...sourceRows); for(const row of sourceRows.filter(r=>r.state==='LIVE')) {const item=result.assets.find(a=>a.asset.assetId===row.route.assetId&&(a.generationId??null)===row.route.generationId); observedTimes.push(item.observed.observedAt);}
    }
    need(!closed, 'CLOSED'); await healthy(); await persist(rows, checks); need(!closed, 'CLOSED'); freshAt = observedTimes.length ? Math.min(...observedTimes) : Date.now(); return snapshot();
  }
  function run(fn) {live(); need(!busy, 'BUSY'); busy = true;
    work = (async () => {try {return await fn();} finally {busy = false; work = null;}})(); return work;}
  const capability = Object.freeze({
    checkpoint() {assert.equal(arguments.length,0); live(); need(!busy && !fault && pending === null, 'CHECKPOINT_UNAVAILABLE');
      return immutable({version:1,profile:ORIGINAL_ECONOMIC_STATE_V1,lifetime,sourceSetSHA256:sha(sourceSet),revision:record.revision,stateSHA256:sha(record.data)});},
    capture() {assert.equal(arguments.length,0);live();fenced=true;freshAt=null;const active=work;
      return (async()=>{try{if(active)await active;need(!closed&&!busy&&!fault&&pending===null,'CHECKPOINT_UNAVAILABLE');await healthy();
        const checkpoint=immutable({version:1,profile:ORIGINAL_ECONOMIC_STATE_V1,lifetime,sourceSetSHA256:sha(sourceSet),revision:record.revision,stateSHA256:sha(record.data)});
        need(!closed,'CLOSED');return checkpoint;}finally{closed=true;password=null;}})();},
    observe() {assert.equal(arguments.length, 0); return run(observe);},
    async idle() {assert.equal(arguments.length,0); live(); const active=work; if(active)await active.catch(()=>{}); live(); need(!busy,'BUSY'); return {phase:fault?'UNKNOWN':'READY'};},
    snapshot() {assert.equal(arguments.length, 0); return run(async () => {try {await healthy();} catch {fault = true;} need(!closed, 'CLOSED'); return snapshot();});},
    reconcile() {assert.equal(arguments.length, 0); return run(async () => {
      await physical(); const actual = await vault.read(password); await physical();
      need(sha(actual) === sha(record) || pending !== null && sha(actual) === sha(pending), 'ORIGINAL_CHECKPOINT_REQUIRED');
      record = actual; pending = null; fault = false; freshAt = null;
      // Only fresh observations of the same originals clear UNKNOWN. No account
      // reconcile/prepare/execute call, replacement reader or resend is made.
      return observe();
    });},
    close() {assert.equal(arguments.length, 0); closed = true; freshAt = null; const active = work;
      return (async () => {if (active) await active.catch(() => {}); password = null; return {closed: true, originalResourcesRetained: true};})();},
    toJSON() {throw Error('ORIGINAL_ECONOMIC_STATE_NOT_SERIALIZABLE');},
  });
  sources.forEach(s => s.check()); owned.set(capability, {live, sources}); return capability;
}
