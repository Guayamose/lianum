/** Select exact observed assets and bind action reviews to their original requests. */
import { GENERATION_PORTFOLIO_PROFILE, ownerPortfolioAssetRows } from '../../contracts/owner-portfolio-contract.mjs';
import { accountDigest, copy } from '../validation/values.mjs';
import { accountAction } from './catalog.mjs';
import { validNativeNoteReview } from '../../contracts/native-note-review.mjs';
import { reconcileStates, accountKinds } from '../validation/account.mjs';
import { validGraphReview } from '../validation/graph-review.mjs';

function currentAccountAssetChoices(state, kind) {
  const portfolio = state.data?.portfolio;
  if (state.stale || state.portfolioStale || !portfolio) return [];
  const partialOriginalExit = kind === 'EXIT' && portfolio.profile === GENERATION_PORTFOLIO_PROFILE
    && portfolio.status === 'PARTIAL';
  if (!partialOriginalExit && (portfolio.status !== 'LIVE'
    || (Array.isArray(portfolio.assets) || portfolio.profile === GENERATION_PORTFOLIO_PROFILE
      ? portfolio.coherent !== true : !portfolio.observed))) return [];
  const values = ownerPortfolioAssetRows(portfolio), identities = values.map(row => row.asset?.assetId);
  if (new Set(identities).size !== identities.length) return [];
  // Only a healthy original component, never a missing/stale generation or a
  // combined inferred balance. No current-route switch or consent is created.
  const live = values.filter(row => row.status === 'LIVE' && accountDigest(row.asset?.assetId)
    && typeof row.asset.symbol === 'string' && /^[A-Z0-9]{2,12}$/.exec(row.asset.symbol)?.[0] === row.asset.symbol
    && (!partialOriginalExit || portfolio.generations.some(generation => generation.generationId === row.generationId
      && generation.errorCode === null && generation.portfolio?.status === 'LIVE'
      && generation.portfolio.coherent === true && generation.portfolio.observed !== null && row.observed
      && ['blockHash', 'blockNumber', 'timestamp'].every(key => row.observed[key] === generation.portfolio.observed[key]))));
  if (partialOriginalExit) {
    const observed = values.filter(row => row.observed !== null && row.observed !== undefined).map(row => row.observed);
    // PARTIAL can also contain inconsistent surviving heads. Do not weaken the
    // coherent-read fence for those cases merely because a third route is down.
    if (!observed.length || observed.some(head => ['blockHash', 'blockNumber', 'timestamp'].some(key => head[key] !== observed[0][key]))) return [];
  }
  return live.map(row => copy(row.asset));
}

/** New TOP_UP choices follow only the authenticated catalogue preference.
 * Legacy generation payloads remain readable but cannot guess a fresh route.
 * Original bound work uses its own exact row below, never this preference. */
export function accountAssetChoices(state, kind = 'TOP_UP') {
  const choices = currentAccountAssetChoices(state, kind), portfolio = state.data?.portfolio;
  if (!['TOP_UP', 'GRAPH'].includes(kind) || portfolio?.profile !== GENERATION_PORTFOLIO_PROFILE) return choices;
  const admission = portfolio.freshAdmissions;
  if (!admission || admission.version !== 1 || admission.fenced !== false || !Array.isArray(admission.routes)) return [];
  return kind === 'GRAPH' ? choices : choices.filter(asset => admission.routes.some(route => route.assetId === asset.assetId
    && portfolio.generations.some(generation => generation.generationId === route.generationId
      && generation.routes.some(original => original.assetId === route.assetId))));
}

function originalExitGeneration(state, asset) {
  if (!asset || state.data?.portfolio?.profile !== GENERATION_PORTFOLIO_PROFILE) return null;
  const rows = ownerPortfolioAssetRows(state.data.portfolio).filter(row => row.asset.assetId === asset.assetId);
  if (rows.length !== 1 || rows[0].status !== 'LIVE' || !rows[0].observed) return null;
  const row = rows[0];
  // Review binds this exact current host-observed route/head. It does not
  // grant authority; the original owner/keeper rechecks the same domain.
  return copy({ generationId: row.generationId, pool: row.pool, domainCommitment: row.domainCommitment,
    observed: { blockNumber: row.observed.blockNumber, blockHash: row.observed.blockHash, timestamp: row.observed.timestamp } });
}

export function accountActionContext(state, action, body) {
  if (!accountAction(action)) return null;
  const originalRow = state.data.account.snapshot.requests.find(row => row.requestId === body.requestId);
  const kind = action === 'accountPrepare' ? body.kind : originalRow?.kind;
  // A prepared old TOP_UP may finish on its original route after rollover.
  // It may not select a successor, bypass a catalogue fence or create a new ID.
  const boundOriginalTopUp = originalRow?.kind === 'TOP_UP' && kind === 'TOP_UP'
    && state.data.portfolio?.profile === GENERATION_PORTFOLIO_PROFILE
    && state.data.portfolio.freshAdmissions?.version === 1 && state.data.portfolio.freshAdmissions.fenced === false;
  const choices = boundOriginalTopUp ? currentAccountAssetChoices(state, kind) : accountAssetChoices(state, kind);
  const graph = state.data.account.manualGraphs?.find(row => row.requestId === body.requestId);
  const nativeNote = state.data.account.manualNativeNotes?.find(row => row.requestId === body.requestId);
  if (nativeNote) {
    if (graph || !validNativeNoteReview(nativeNote) || state.data.capabilities.manualNativeNotes !== true
      || action === 'accountRecover' || action === 'accountPrepare' && ['kind', 'assetId', 'ownerOperationRef'].some(key => body[key] !== nativeNote[key])
      || originalRow && originalRow.kind !== nativeNote.kind
      || (action === 'accountPrepare' ? originalRow && originalRow.state !== 'PREPARING'
        : !originalRow || !(action === 'accountExecute' ? originalRow.state === 'PREPARED' : reconcileStates.includes(originalRow.state)))
      || action !== 'accountReconcile' && !choices.some(asset => asset.assetId === nativeNote.assetId))
      throw new Error('La nota nativa requiere su preparación, titular y términos originales');
    return { kind: nativeNote.kind, asset: copy(nativeNote.asset), journalState: originalRow?.state ?? null,
      preparingContinuation: action === 'accountPrepare' && Boolean(originalRow), nativeNote: copy(nativeNote) };
  }

  if (body.kind === 'GRAPH' || originalRow?.kind === 'GRAPH' || graph) {
    if (!graph || !validGraphReview(graph) || state.data.capabilities.manualEvmVaultGraph !== true
      || action === 'accountPrepare' && ['kind', 'assetId', 'ownerOperationRef'].some(key => body[key] !== graph[key])
      || originalRow && originalRow.kind !== 'GRAPH'
      || (action === 'accountPrepare' ? originalRow && originalRow.state !== 'PREPARING'
        : !originalRow || !(action === 'accountExecute' ? originalRow.state === 'PREPARED' : reconcileStates.includes(originalRow.state)))
      || !['accountReconcile', 'accountRecover'].includes(action) && !choices.some(asset => asset.assetId === graph.assetId))
      throw new Error('GRAPH requiere la preparación original fijada por el titular, su ID y términos exactos');
    return { kind: 'GRAPH', asset: copy(graph.asset), journalState: originalRow?.state ?? null,
      preparingContinuation: action === 'accountPrepare' && Boolean(originalRow), graph: copy(graph) };
  }
  if (action === 'accountRecover') throw new Error('Solo GRAPH original registrado admite recuperación');
  if (action === 'accountPrepare') {
    const asset = choices.find(value => value.assetId === body.assetId);
    const existing = state.data.account.snapshot.requests.find(row => row.requestId === body.requestId);
    const originalAssets = existing ? ownerPortfolioAssetRows(state.data.portfolio).filter(value =>
      (value.requests ?? []).some(request => request.requestId === body.requestId && request.kind === body.kind)) : [];
    if (!asset || existing && (existing.state !== 'PREPARING' || !accountKinds.includes(existing.kind) || existing.kind !== body.kind
      || state.data.portfolio?.profile === GENERATION_PORTFOLIO_PROFILE
        && (originalAssets.length !== 1 || originalAssets[0].asset.assetId !== body.assetId)))
      throw new Error('Usa un activo observado y un ID nuevo, o conserva el ID y tipo original PREPARING; no se permite cambiar su vinculación');
    return { kind: body.kind, asset: copy(asset), journalState: existing?.state ?? null, preparingContinuation: Boolean(existing),
      ...(body.kind === 'EXIT' && state.data.portfolio?.profile === GENERATION_PORTFOLIO_PROFILE ? { originalGeneration: originalExitGeneration(state, asset) } : {}) };
  }
  const row = state.data.account.snapshot.requests.find(value => value.requestId === body.requestId);
  if (!row || !accountKinds.includes(row.kind)
    || !(action === 'accountExecute' ? row.state === 'PREPARED' : reconcileStates.includes(row.state)))
    throw new Error('La solicitud original requiere TOP_UP o EXIT y un estado compatible; GRAPH y los IDs desconocidos están bloqueados');
  const portfolio = state.data.portfolio;
  const values = ownerPortfolioAssetRows(portfolio);
  const matches = values.flatMap(value => (value.requests ?? []).filter(request => request.requestId === body.requestId)
    .map(request => ({ request, asset: choices.find(asset => asset.assetId === value.asset.assetId) })));
  const asset = matches.length === 1 && matches[0].request.kind === row.kind ? matches[0].asset ?? null : null;
  if (action === 'accountExecute' && !asset) throw new Error('No se pudo identificar de forma única el activo original; actualiza su vista privada antes de ejecutar');
  return { kind: row.kind, asset: asset ? copy(asset) : null, journalState: row.state,
    ...(row.kind === 'EXIT' && state.data.portfolio?.profile === GENERATION_PORTFOLIO_PROFILE ? { originalGeneration: originalExitGeneration(state, asset) } : {}) };
}
