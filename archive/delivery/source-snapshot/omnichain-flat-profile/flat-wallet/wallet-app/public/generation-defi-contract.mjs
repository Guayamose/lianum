import {POSITION_STATE_PROFILE,validatePositionStateEnvelope,samePositionHead} from './generation-position-state-v2.mjs';
/** Bounded parsed-data reader for fixed original generation DeFi views.
 * Host-reported identity and consistency only; no chain/proof verification,
 * service choice, authorization, accounting sum or private conversion. */
import { GENERATION_PORTFOLIO_PROFILE } from './owner-portfolio-contract.mjs';
export const GENERATION_DEFI_POSITIONS = 'OWNED_GENERATION_PRIVATE_VAULT_POSITIONS_V1';
export const GENERATION_DEFI_EXITS = 'OWNED_GENERATION_PRIVATE_VAULT_EXITS_V1';
const EXIT = 'OWNED_PRIVATE_VAULT_EXIT_V1';
const need = value => { if (!value) throw new Error('WALLET_GENERATION_DEFI_CONTRACT'); };
const match = (value, pattern) => typeof value === 'string' && pattern.exec(value)?.[0] === value;
function record(value, keys) {
  need(value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype);
  const own = Reflect.ownKeys(value);
  need(own.length === keys.length && keys.every(key => Object.hasOwn(value, key)));
  for (const key of own) { const descriptor = Object.getOwnPropertyDescriptor(value, key);
    need(keys.includes(key) && descriptor.enumerable && Object.hasOwn(descriptor, 'value')); }
}
function array(value, min, max) {
  need(Array.isArray(value) && Object.getPrototypeOf(value) === Array.prototype && value.length >= min && value.length <= max && Reflect.ownKeys(value).length === value.length + 1);
  for (let i = 0; i < value.length; i++) { const descriptor = Object.getOwnPropertyDescriptor(value, String(i));
    need(descriptor?.enumerable && Object.hasOwn(descriptor, 'value')); }
}
const digest = value => need(match(value, /^[0-9a-f]{64}$/));
const address = value => need(match(value, /^[0-9a-f]{40}$/));
const requestId = value => need(match(value, /^[A-Za-z0-9_-]{8,100}$/));
function decimal(value, bits = 256, positive = false) {
  need(match(value, /^(0|[1-9][0-9]{0,77})$/));
  need(BigInt(value) < (1n << BigInt(bits)) && (!positive || BigInt(value) > 0n));
}
function observation(value) {
  record(value, ['observedAt', 'blockNumber', 'blockHash', 'timestamp']);
  need(Number.isSafeInteger(value.observedAt) && value.observedAt >= 0 && !Object.is(value.observedAt, -0));
  decimal(value.blockNumber); decimal(value.timestamp); digest(value.blockHash);
}
const key = row => row.generationId + ':' + row.shareAssetId;
const generations = portfolio => portfolio?.profile === GENERATION_PORTFOLIO_PROFILE ? portfolio.generations : [];
function membership(row, portfolio) {
  if (portfolio === null || portfolio === undefined) return;
  need(portfolio.profile === GENERATION_PORTFOLIO_PROFILE);
  const generation = generations(portfolio).find(item => item.generationId === row.generationId);
  need(generation && generation.routes.some(route => route.assetId === row.shareAssetId));
  if (row.underlyingAssetId !== undefined && row.underlyingAssetId !== null)
    need(generation.routes.some(route => route.assetId === row.underlyingAssetId));
}
function uniqueRows(rows, portfolio) {
  const shares = new Set();
  for (const row of rows) {
    digest(row.generationId); digest(row.shareAssetId);
    need(!shares.has(row.shareAssetId)); shares.add(row.shareAssetId); membership(row, portfolio);
  }
}
function positions(value, portfolio) {
  if(value?.profile===POSITION_STATE_PROFILE) {
    validatePositionStateEnvelope(value);uniqueRows(value.positions,portfolio);return;
  }
  record(value, ['version', 'profile', 'positions', 'privateBalancesAggregated', 'underlyingPrivateSpendable']);
  need(value.version === 1 && value.profile === GENERATION_DEFI_POSITIONS
    && value.privateBalancesAggregated === false && value.underlyingPrivateSpendable === false);
  array(value.positions, 1, 8);
  for (const row of value.positions) {
    record(row, ['generationId', 'shareAssetId', 'underlyingAssetId', 'vault', 'underlyingToken', 'kind', 'status',
      'availableShares', 'estimatedRedeemableUnderlying', 'observed', 'rounding', 'underlyingSpendable', 'privateConversionAccepted', 'errorCode']);
    if (row.underlyingAssetId !== null) { digest(row.underlyingAssetId); need(row.underlyingAssetId !== row.shareAssetId); }
    address(row.vault); address(row.underlyingToken);
    need(row.kind === 'ERC4626_SHARE' && ['LIVE', 'STALE', 'UNAVAILABLE'].includes(row.status)
      && row.rounding === 'down' && row.underlyingSpendable === false && row.privateConversionAccepted === false);
    if (row.status === 'LIVE') {
      need(row.underlyingAssetId !== null && row.errorCode === null);
      decimal(row.availableShares); decimal(row.estimatedRedeemableUnderlying); observation(row.observed);
      if (row.availableShares === '0') need(row.estimatedRedeemableUnderlying === '0');
    } else {
      need(row.availableShares === null && row.estimatedRedeemableUnderlying === null && row.observed === null);
      if (row.status === 'STALE') need(row.underlyingAssetId !== null && row.errorCode === null);
      else need(row.errorCode === (row.underlyingAssetId === null ? 'PRIVATE_VAULT_GENERATION_UNDERLYING_NOT_REGISTERED'
        : 'PRIVATE_VAULT_GENERATION_POSITION_UNAVAILABLE'));
    }
  }
  uniqueRows(value.positions, portfolio);
}
function operation(row) {
  record(row, ['version', 'profile', 'requestId', 'shareAssetId', 'underlyingToken', 'phase', 'shares', 'minimumUnderlying',
    'redeemedUnderlying', 'deadline', 'observation', 'underlyingLocation', 'underlyingPrivateSpendable', 'redemptionPublic',
    'sendBlocked', 'assurance', 'keeperRestart']);
  need(row.version === 1 && row.profile === EXIT); requestId(row.requestId); digest(row.shareAssetId); address(row.underlyingToken);
  need(['BINDING_REDEMPTION', 'READY_TO_REDEEM', 'REDEMPTION_UNRESOLVED', 'REQUOTING_REDEMPTION', 'REDEEMED', 'REVERTED'].includes(row.phase));
  decimal(row.shares, 128, true); decimal(row.minimumUnderlying, 128, true); decimal(row.deadline, 64, true);
  // The original exit service clears proceeds for every non-redeemed phase.
  // Only REDEEMED carries its receipt's positive uint128 amount, satisfying
  // the retained minimum. Historical observation never relaxes this contract
  // and null remains unknown, not a zero payout or a completed redemption.
  if (row.phase === 'REDEEMED') {
    decimal(row.redeemedUnderlying, 128, true);
    need(BigInt(row.redeemedUnderlying) >= BigInt(row.minimumUnderlying));
  } else need(row.redeemedUnderlying === null);
  need(['ORIGINAL_RECONCILIATION', 'PERSISTED_LAST_OBSERVATION'].includes(row.observation)
    && row.underlyingLocation === 'EXTERNAL_OWNER_ADDRESS' && row.underlyingPrivateSpendable === false
    && row.redemptionPublic === true && typeof row.sendBlocked === 'boolean'
    && row.assurance === 'TRUSTED_OWNED_LOCAL_RPC_AND_ORIGINAL_ACCOUNT_EXIT' && row.keeperRestart === false);
}
function exits(value, operations, portfolio) {
  record(value, ['version', 'profile', 'generations']);
  need(value.version === 1 && value.profile === GENERATION_DEFI_EXITS); array(value.generations, 1, 8);
  const ids = new Map();
  for (const row of value.generations) {
    record(row, ['generationId', 'shareAssetId', 'status', 'requestIds', 'errorCode']);
    if (row.status === 'AVAILABLE') {
      need(row.errorCode === null); array(row.requestIds, 0, 128);
      for (const id of row.requestIds) { requestId(id); need(!ids.has(id)); ids.set(id, row.shareAssetId); }
      need(ids.size <= 128);
    } else need(row.status === 'UNAVAILABLE' && row.requestIds === null
      && ['PRIVATE_VAULT_GENERATION_UNAVAILABLE', 'PRIVATE_VAULT_GENERATION_REOPEN_UNAVAILABLE'].includes(row.errorCode));
  }
  uniqueRows(value.generations, portfolio); array(operations, 0, 128);
  const seen = new Set();
  for (const row of operations) {
    operation(row); need(!seen.has(row.requestId) && ids.get(row.requestId) === row.shareAssetId); seen.add(row.requestId);
  }
  need(seen.size === ids.size);
}
/** Legacy single-service payloads are intentionally unchanged. */
export function validateGenerationDefiRead(defi, portfolio) {
  if (!defi || !Object.hasOwn(defi, 'positions') && !Object.hasOwn(defi.snapshot ?? {}, 'generationProjection')) return false;
  record(defi, ['snapshot', 'positions']);
  if (defi.positions !== null) positions(defi.positions, portfolio);
  if (defi.snapshot !== null) {
    record(defi.snapshot, ['version', 'profile', 'operations', 'generationProjection']);
    need(defi.snapshot.version === 1 && defi.snapshot.profile === EXIT);
    exits(defi.snapshot.generationProjection, defi.snapshot.operations, portfolio);
    if (defi.positions !== null) {
      const rows = defi.snapshot.generationProjection.generations;
      need(rows.length === defi.positions.positions.length && rows.every(row => defi.positions.positions.some(position => key(position) === key(row))));
      for (const row of defi.snapshot.operations) need(defi.positions.positions.find(position => position.shareAssetId === row.shareAssetId).underlyingToken === row.underlyingToken);
    }
  } else need(defi.positions === null);
  return true;
}
const sameHead = (left, right) => left && right && ['blockHash', 'blockNumber', 'timestamp'].every(field => left[field] === right[field]);
/** Each estimate joins only its original generation's current nested portfolio.
 * observedAt is read time, not head identity: separate reads may differ there.
 * An unrelated unavailable successor never invalidates a healthy old join. */
export function projectGenerationDefiRead(defi, portfolio, { stale = false, portfolioStale = false, defiStale = false } = {}) {
  const empty = { positions: [], generations: [], generationMode: false, journalsUnknown: false };
  try { if (!validateGenerationDefiRead(defi, portfolio)) return empty; }
  catch { return { ...empty, generationMode: true, journalsUnknown: true }; }
  const originals = generations(portfolio);
  const positionRows = (defi.positions?.positions ?? []).map(row => {
    const generation = originals.find(item => item.generationId === row.generationId), nested = generation?.portfolio;
    const share = nested?.assets.find(item => item.asset.assetId === row.shareAssetId);
    const underlying = nested?.assets.find(item => item.asset.assetId === row.underlyingAssetId);
    const route = generation?.routes.find(item => item.assetId === row.shareAssetId);
    if(defi.positions.profile===POSITION_STATE_PROFILE) {
      const ownership=row.ownership,valuation=row.valuation;
      const pending=share?.requests.filter(request=>request.state!=='CONFIRMED');
      const ownershipCurrent=!stale&&!portfolioStale&&!defiStale&&ownership.status==='LIVE'&&share?.status==='LIVE'
        &&samePositionHead(ownership.observed,share.observed)
        &&['available','reserved','recovery','locked'].every(key=>ownership.balances[key]===share.balances[key])
        &&ownership.pendingRequests.length===pending.length&&ownership.pendingRequests.every(request=>pending.some(original=>
          ['requestId','kind','state','disposition'].every(key=>request[key]===original[key])));
      const valuationCurrent=ownershipCurrent&&valuation.status==='LIVE'&&nested?.status==='LIVE'&&nested.coherent===true
        &&underlying?.status==='LIVE'&&samePositionHead(valuation.observed,underlying.observed)
        &&samePositionHead(valuation.observed,nested.observed);
      return {generationId:row.generationId,shareAssetId:row.shareAssetId,underlyingAssetId:row.underlyingAssetId,
        pool:route?.pool??null,domainCommitment:route?.domainCommitment??null,vault:row.vault,underlyingToken:row.underlyingToken,
        kind:row.kind,status:ownershipCurrent?(valuationCurrent?'LIVE':'PARTIAL'):ownership.status==='UNAVAILABLE'?'UNAVAILABLE':'STALE',
        ownershipStatus:ownershipCurrent?'LIVE':ownership.status==='UNAVAILABLE'?'UNAVAILABLE':'STALE',
        valuationStatus:valuationCurrent?'LIVE':valuation.status==='UNAVAILABLE'?'UNAVAILABLE':'STALE',
        shareSymbol:share?.asset.symbol??'Shares',underlyingSymbol:underlying?.asset.symbol??'Subyacente',
        shares:ownershipCurrent?ownership.balances.available:null,estimate:valuationCurrent?valuation.estimatedRedeemableUnderlying:null,
        ownershipBalances:ownershipCurrent?{...ownership.balances}:null,bucketsAdditive:false,
        pendingRequests:ownershipCurrent?ownership.pendingRequests.map(request=>({...request})):null,
        ownershipObserved:ownershipCurrent?ownership.observed:null,observed:valuationCurrent?valuation.observed:null,
        rounding:'down',underlyingSpendable:false,privateConversionAccepted:false,
        redeemableLiquidityVerified:false,errorCode:valuation.errorCode,join:valuationCurrent?'SAME_GENERATION_AND_HEAD':'UNKNOWN'};
    }
    const current = !stale && !portfolioStale && !defiStale && row.status === 'LIVE' && nested?.status === 'LIVE'
      && nested.coherent === true && share?.status === 'LIVE' && underlying?.status === 'LIVE'
      && sameHead(row.observed, nested.observed) && sameHead(row.observed, share.observed) && sameHead(row.observed, underlying.observed)
      && row.availableShares === share.balances.available;
    return { generationId: row.generationId, shareAssetId: row.shareAssetId, underlyingAssetId: row.underlyingAssetId,
      pool: route?.pool ?? null, domainCommitment: route?.domainCommitment ?? null, vault: row.vault, underlyingToken: row.underlyingToken,
      kind: row.kind, status: current ? 'LIVE' : row.status === 'UNAVAILABLE' ? 'UNAVAILABLE' : 'STALE',
      shareSymbol: share?.asset.symbol ?? 'Shares', underlyingSymbol: underlying?.asset.symbol ?? 'Subyacente',
      shares: current ? row.availableShares : null, estimate: current ? row.estimatedRedeemableUnderlying : null,
      observed: current ? row.observed : null, rounding: 'down', underlyingSpendable: false, privateConversionAccepted: false,
      errorCode: row.errorCode, join: current ? 'SAME_GENERATION_AND_HEAD' : 'UNKNOWN' };
  });
  const journalRows = (defi.snapshot?.generationProjection.generations ?? []).map(row => {
    const known = row.requestIds !== null && !stale && !defiStale;
    return { generationId: row.generationId, shareAssetId: row.shareAssetId,
      status: stale || defiStale ? 'STALE' : row.status, journalContentsKnown: known,
      requestIds: known ? [...row.requestIds] : null, requestCount: known ? row.requestIds.length : null, errorCode: row.errorCode };
  });
  return { positions: positionRows, generations: journalRows, generationMode: true,
    journalsUnknown: !journalRows.length || journalRows.some(row => !row.journalContentsKnown) };
}
