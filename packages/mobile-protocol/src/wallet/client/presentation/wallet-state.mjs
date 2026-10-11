/** Project read payloads for presentation while preserving stale and unknown fences. */
import { record, atomic, validId, copy } from '../validation/values.mjs';
import { ownerPortfolioAssetRows, ownerPortfolioGenerations, ORIGINAL_SPL_USDC_UNITS_V1, GENERATION_PORTFOLIO_PROFILE } from '../../contracts/owner-portfolio-contract.mjs';
import { displayUnits } from './native-review.mjs';
import { projectGenerationDefiRead, projectOriginalVaultExitNativeCostsV1 } from '../../contracts/generation-defi-contract.mjs';
import { projectOriginalWalletEconomicStateV1, originalEconomicRouteKeyV1 } from '../../../original-wallet-economic-state-v1.mjs';
import { validAccountSnapshot, journalReady } from '../validation/account.mjs';
import { validTransferSection } from '../validation/transfers.mjs';
import { originalNativeIdentity } from '../validation/native-identity.mjs';
import { projectPublicTokenObservations } from '../../contracts/public-token-observations.mjs';

const status = (value, stale) => stale ? 'STALE' : ['LIVE', 'STALE', 'PARTIAL', 'UNAVAILABLE'].includes(value) ? value : 'UNAVAILABLE';

const text = (value, fallback = 'No disponible') => typeof value === 'string' && value.length ? value : fallback;

const rows = value => Array.isArray(value) ? value.filter(record) : [];

export function projectWalletState(value, { stale = false, reading = false, sending = false, portfolioStale = false, nativeStale = false,
  nativeIdentityMismatch = false, accountStale = false, accountSnapshotFresh, nativeSnapshotFresh,
  networksStale = false, defiStale = false, transfersStale = false } = {}) {
  const portfolio = value?.portfolio ?? null;
  const sourceAssets = ownerPortfolioAssetRows(portfolio);
  const generationRows = ownerPortfolioGenerations(portfolio);
  const componentPortfolios = generationRows.length ? generationRows.flatMap(row => row.portfolio ? [row.portfolio] : []) : [portfolio].filter(Boolean);
  let assets = sourceAssets.map(item => {
    const meta = item.asset ?? {}, itemStatus = status(item.status, stale || portfolioStale);
    const balances = Object.fromEntries(['available', 'reserved', 'recovery', 'locked'].map(key => [key,
      item.status === 'UNAVAILABLE' ? null : atomic(item.balances?.[key])]));
    return { generationId: item.generationId ?? null, pool: item.pool ?? null, domainCommitment: item.domainCommitment ?? null, id: text(meta.assetId, ''), symbol: text(meta.symbol, 'Activo'), decimals: meta.decimals,
      status: itemStatus, observed: item.observed ?? null, balances,
      amounts: Object.fromEntries(Object.entries(balances).map(([key, amount]) => [key, displayUnits(amount, meta.decimals)])),
      backing: item.backing ?? null };
  });
  const lookup = id => assets.find(asset => asset.id === id);
  const nativeClaims = componentPortfolios.flatMap(part => rows(part.nativeClaims)).filter(item => item.kind === 'CUSTODIAL_NATIVE_CLAIM').map(item => {
    const asset = lookup(item.assetId), typed = ['nativeAssetKind', 'decimals', 'atomicUnit', 'mint'].some(key => Object.hasOwn(item, key));
    const spl = typed && ['nativeAssetKind', 'decimals', 'atomicUnit', 'mint', 'nativeSymbol']
      .every(key => item[key] === ORIGINAL_SPL_USDC_UNITS_V1[key]) && asset?.symbol === 'CUSDC' && asset?.decimals === 6;
    const valid = !typed || spl, amount = valid ? atomic(item.availablePrivateClaims) : null;
    return { assetId: text(item.assetId, ''), nativeSymbol: valid ? text(item.nativeSymbol, 'Nativo') : 'Nativo',
      symbol: asset?.symbol ?? 'Claim', amount,
      custody: !valid ? 'UNAVAILABLE' : stale || portfolioStale ? 'STALE' : text(item.custodyObservation),
      ...(spl ? { nativeAssetKind: item.nativeAssetKind, mint: item.mint, decimals: 6,
        atomicUnit: item.atomicUnit, display: displayUnits(amount, 6) } : {}),
      nativeSelfCustody: false, underlyingSpendable: false,
      diagnostic: valid ? text(item.custodyDiagnostic?.code, '') : 'CLAIM_PORTFOLIO_ASSET_METADATA_UNAVAILABLE',
    };
  });
  const positions = componentPortfolios.flatMap(part => rows(part.positions)).filter(item => item.kind === 'ERC4626_SHARE').map(item => {
    const safe = item.underlyingSpendable === false;
    const current = safe && item.status === 'LIVE' && !stale && !portfolioStale && portfolio.status === 'LIVE' && portfolio.coherent === true;
    return { kind: item.kind, status: safe ? status(item.status, stale || portfolioStale || !current && item.status === 'LIVE') : 'UNAVAILABLE',
      shareSymbol: lookup(item.shareAssetId)?.symbol ?? 'Shares', underlyingSymbol: lookup(item.underlyingAssetId)?.symbol ?? 'Subyacente',
      shares: current ? atomic(item.availableShares) : null,
      estimate: current ? atomic(item.estimatedRedeemableUnderlying) : null,
      underlyingSpendable: false };
  });
  const generationDefi = projectGenerationDefiRead(value?.defi, portfolio, {
    stale: stale || reading || sending || value?.connection !== 'CONNECTED',
    portfolioStale: portfolioStale || Boolean(value?.errors.portfolio), defiStale: defiStale || Boolean(value?.errors.defi) });
  positions.push(...generationDefi.positions);
  const economicState = value?.economicState ? projectOriginalWalletEconomicStateV1(value.economicState, {stale: stale || reading || sending || value.connection !== 'CONNECTED' || Boolean(value.errors.economicState)}) : null;
  if (economicState) {
    // The common original claim source owns availability. A prepared/unknown
    // job must not leave the legacy custody card advertising its old balance.
    // Ambiguous routes are kept unavailable rather than summed or guessed.
    for (const claim of nativeClaims) {
      const matches=economicState.rows.filter(row=>row.component==='NATIVE_CLAIM'&&row.route.assetId===claim.assetId);
      if(matches.length){const row=matches.length===1?matches[0]:null;
        claim.amount=row?.state==='LIVE'?row.balances.available:null;
        claim.custody=row?.state==='LIVE'?'CURRENT_QUORUM':row?.state==='STALE'?'STALE':'UNAVAILABLE';
        if(Object.hasOwn(claim,'display'))claim.display=displayUnits(claim.amount,claim.decimals);}
    }
    assets = economicState.rows.map(row => ({id: row.route.assetId, rowKey: originalEconomicRouteKeyV1(row.route),
      generationId: row.route.generationId, pool: row.route.pool, domainCommitment: row.route.domainCommitment, domain: row.route,
      symbol: row.asset.symbol, decimals: row.asset.decimals, status: row.state, observed: row.head,
      balances: row.balances ?? {available: null, reserved: null, recovery: null, locked: null},
      amounts: Object.fromEntries(['available','reserved','recovery','locked'].map(k => [k, displayUnits(row.balances?.[k] ?? null, row.asset.decimals)])), backing: row.backing}));
    positions.splice(0, positions.length, ...economicState.rows.filter(r => r.position).map(row => ({
      kind: 'ERC4626_SHARE', status: row.position.ownershipStatus, ownershipStatus: row.position.ownershipStatus, valuationStatus: row.position.valuationStatus,
      generationId: row.route.generationId, shareAssetId: row.route.assetId, underlyingAssetId: row.position.underlyingAssetId,
      shareSymbol: row.asset.symbol, underlyingSymbol: economicState.rows.find(r => r.route.sourceId === row.route.sourceId && r.route.generationId === row.route.generationId && r.route.assetId === row.position.underlyingAssetId)?.asset.symbol ?? 'Subyacente',
      shares: row.position.shares, estimate: row.position.estimate, observed: row.position.head, vault: row.position.vault,
      underlyingToken: row.position.underlyingToken, pool: row.route.pool, domainCommitment: row.route.domainCommitment,
      ownershipBalances: row.balances, pendingRequests: row.state === 'UNKNOWN' ? null : row.requests.filter(q => q.state !== 'CONFIRMED'),
      join: row.position.valuationStatus === 'LIVE' ? 'SAME_GENERATION_AND_HEAD' : 'UNKNOWN', underlyingSpendable: false})));
  }
  const requests = [];
  for (const asset of sourceAssets) for (const row of rows(asset.requests)) requests.push({
    requestId: text(row.requestId, ''), source: text(asset.asset?.symbol, 'Portafolio'), native: false,
    action: text(row.kind), state: stale || portfolioStale || asset.status === 'UNAVAILABLE' ? 'STALE' : text(row.state),
    disposition: stale || portfolioStale || asset.status === 'UNAVAILABLE' ? '' : text(row.disposition, ''), errorCode: '' });
  const nativeRows = new Map();
  for (const row of [...rows(value?.nativeClaims?.snapshot?.requests), ...rows(value?.nativeClaims?.owner?.requests)])
    if (validId(row.requestId)) nativeRows.set(row.requestId, { requestId: row.requestId, source: 'Claim nativo', native: true,
      action: text(row.action), state: stale || nativeStale ? 'STALE' : text(row.state),
      disposition: stale || nativeStale ? '' : text(row.result?.status, ''), errorCode: text(row.errorCode, '') });
  if (economicState) requests.splice(0, requests.length, ...economicState.rows.flatMap(row => row.requests.map(q => ({
    requestId: q.requestId, rowKey: originalEconomicRouteKeyV1(row.route), source: row.asset.symbol, native: false,
    action: q.kind, state: row.state === 'UNKNOWN' ? 'UNKNOWN' : q.state, disposition: q.disposition ?? '', errorCode: row.reason ?? ''}))));
  // Native-claim jobs belong to their original session, outside note/portfolio
  // routes. Preserve their own deduplication and native reconcile destination.
  requests.push(...nativeRows.values());
  const transferHistory = stale || reading || sending || transfersStale || Boolean(value?.errors.transfers || value?.errors.account || value?.errors.nativeClaims) || accountStale || nativeStale
    || value?.connection !== 'CONNECTED'
    || Boolean(value?.account && (accountSnapshotFresh === false || !validAccountSnapshot(value.account.snapshot)
      || !journalReady(value.account.snapshot) || value.account.snapshot.observation !== 'CURRENT' || !value.account.snapshot.available))
    || Boolean(value?.nativeClaims && (nativeSnapshotFresh === false || !journalReady(value.nativeClaims.snapshot)));
  const transfers = validTransferSection(value?.transfers) ? value.transfers.rows.map(row => {
    const item = row.status;
    return { ownerAddress: row.ownerAddress, direction: row.direction, refreshStatus: row.refreshStatus, errorCode: row.errorCode,
      historical: Boolean(transferHistory || row.refreshStatus !== 'REFRESHED'), status: item.status, reason: item.reason,
      nativeId: item.nativeId, family: item.family, chain: item.chain, chainId: item.chainId, genesisHash: item.genesisHash, networkId: item.networkId,
      assetId: item.asset.id, assetCommitment: item.asset.commitment, symbol: item.asset.symbol, decimals: item.asset.decimals,
      from: item.from, to: item.to, value: item.value, display: displayUnits(item.value, item.asset.decimals), nonce: item.nonce,
      transactionType: item.transactionType, observedAtMs: item.observedAtMs, validUntilMs: item.validUntilMs,
      source: 'retained-observation-metadata', freshness: 'not-revalidated', metadataOnly: true, currentFinalityVerified: false,
      creditEligible: false, privateSpendableAtomic: null, graphAdmissionEligible: false, deliveryVerified: false, recipientRetainedValueVerified: false };
  }) : [];
  const assetsCoherent=economicState ? economicState.rows.length > 0 && economicState.rows.every(r => r.state === 'LIVE') : Boolean(!stale&&!portfolioStale&&portfolio?.status==='LIVE'
    &&(Array.isArray(portfolio.assets)||portfolio.profile===GENERATION_PORTFOLIO_PROFILE?portfolio.coherent===true:portfolio.observed!=null));
  const positionsExpected=positions.length>0||generationDefi.generationMode;
  const positionOwnershipCoherent=!positionsExpected||positions.length>0&&positions.every(position=>(position.ownershipStatus??position.status)==='LIVE');
  const positionValuationCoherent=!positionsExpected||positions.length>0&&positions.every(position=>(position.valuationStatus??position.status)==='LIVE');
  const journalsCoherent=(!economicState || economicState.storageAvailable && economicState.rows.every(r => r.state !== 'UNKNOWN'))&&!stale&&!reading&&!sending&&!accountStale&&!nativeStale&&!nativeIdentityMismatch
    &&!value?.errors.account&&!value?.errors.nativeClaims&&!value?.errors.wrappedWithdrawals
    &&(!value?.account||accountSnapshotFresh!==false&&journalReady(value.account.snapshot)&&value.account.snapshot.available===true&&value.account.snapshot.observation==='CURRENT')
    &&(!value?.nativeClaims||nativeSnapshotFresh!==false&&journalReady(value.nativeClaims.snapshot))
    &&(!value?.wrappedWithdrawals||journalReady(value.wrappedWithdrawals.snapshot))
    &&(!generationDefi.generationMode||!generationDefi.journalsUnknown);
  const ownerStateCoherence={assets:assetsCoherent,positionOwnership:positionOwnershipCoherent,
    positionValuation:positionValuationCoherent,journals:journalsCoherent};
  return { portfolioStatus: economicState ? economicState.rows.every(r => r.state === 'LIVE') ? 'LIVE' : economicState.rows.some(r => r.state === 'LIVE') ? 'PARTIAL' : economicState.rows.some(r => r.state === 'STALE') ? 'STALE' : 'UNAVAILABLE' : status(portfolio?.status, stale || portfolioStale),ownerStateCoherence, economicState,

    coherent: Object.values(ownerStateCoherence).every(Boolean),
    generations: generationRows.map((row, index) => ({ generationId: row.generationId, ordinal: index + 1, status: status(row.portfolio?.status, stale || portfolioStale), errorCode: row.errorCode, routes: copy(row.routes) })),
    assets, nativeClaims, positions, requests, transfers,
    nativeIdentity: nativeIdentityMismatch ? null : originalNativeIdentity(value?.nativeClaims),
    deposits: rows(value?.nativeClaims?.owner?.deposits), tickets: rows(value?.nativeClaims?.owner?.tickets),
    nativeStatus: stale || nativeStale ? 'STALE' : text(value?.nativeClaims?.snapshot?.phase, 'UNAVAILABLE'),
    nativeObservation: text(value?.nativeClaims?.snapshot?.observation, 'No disponible'),
    accountStatus: stale || accountStale ? 'STALE' : value?.account?.snapshot?.busy || value?.account?.snapshot?.queued > 0
      ? 'RUNNING' : text(value?.account?.snapshot?.phase, 'UNAVAILABLE'),
    accountRequests: rows(value?.account?.snapshot?.requests).map(row => ({ requestId: text(row.requestId), kind: text(row.kind),
      state: stale || accountStale ? 'STALE' : text(row.state), errorCode: text(row.errorCode, ''), supported: row.kind !== 'GRAPH' || Boolean(value?.capabilities.manualEvmVaultGraph && value?.account?.manualGraphs?.some(graph => graph.requestId === row.requestId)) })),
    accountAdmissions: rows(value?.account?.snapshot?.admissions).map(row => ({ requestId: text(row.requestId),
      action: text(row.action), state: stale || accountStale ? 'STALE' : text(row.state) })),
    networks: rows(value?.networks?.chains).map(chain => {
      const observations = rows(value?.networks?.observations).filter(row => row.chain === chain.chain);
      return { chain: text(chain.chain), configured: chain.configured === true,...(value?.networks?.tokens?{tokenObservations:projectPublicTokenObservations(value.networks,chain.chain,{stale:stale||networksStale}).map(row=>({...row,display:displayUnits(row.amount,row.decimals)}))}:{}),
        observations: observations.map(row => {
          const safe = row.schema === 'flat-portfolio-observation/1' && row.creditEligible === false && row.privateSpendableAtomic === null;
          const expired = atomic(row.validUntilMs)!==null && BigInt(row.validUntilMs)<=BigInt(Date.now());
          const fresh = safe && row.status === 'fresh' && !stale && !networksStale && !expired;
          const amount = fresh ? atomic(row.balanceAtomic) : null;
          return { status: !safe ? 'unknown' : stale || networksStale || expired ? 'stale' : text(row.status, 'unknown'),
            symbol: text(row.network?.nativeAsset?.symbol, 'Nativo'), amount,
            display: displayUnits(amount, row.network?.nativeAsset?.decimals),
            block: text(row.block?.height, ''), reason: expired?'OBSERVATION_EXPIRED':text(row.reason, ''), privateSpendable: false,
            ...(row.chain==='bitcoin'?{pendingAmount:fresh?atomic(row.pendingBalanceAtomic):null,
              pendingDisplay:displayUnits(fresh?atomic(row.pendingBalanceAtomic):null,8),minimumConfirmations:row.minimumConfirmations,
              coverage:'Cobertura declarada del watch wallet; coinbase inmaduro excluido'}:{}) };
        }) };
    }),
    defiGenerations: generationDefi.generations, defiGenerationMode: generationDefi.generationMode,
    defiJournalsUnknown: generationDefi.journalsUnknown,
    defiOperations: rows(value?.defi?.snapshot?.operations).map(row => ({ requestId: text(row.requestId, ''),
      ...(generationDefi.generationMode ? { generationId: generationDefi.generations.find(item => item.shareAssetId === row.shareAssetId)?.generationId ?? null,
        shareAssetId: row.shareAssetId } : {}),
      phase: stale || defiStale ? 'STALE' : text(row.phase), shares: atomic(row.shares),
      minimumUnderlying: atomic(row.minimumUnderlying), deadline: atomic(row.deadline),
      redeemedUnderlying: row.underlyingPrivateSpendable === false && row.underlyingLocation === 'EXTERNAL_OWNER_ADDRESS'
        ? atomic(row.redeemedUnderlying) : null, observation: text(row.observation),
      underlyingLocation: 'EXTERNAL_OWNER_ADDRESS', underlyingPrivateSpendable: false, redemptionPublic: true,
      sendBlocked: row.sendBlocked !== false, keeperRestart: false,
      nativeCosts: projectOriginalVaultExitNativeCostsV1(row.nativeCosts) })) };
}
