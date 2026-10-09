/** Read projection only. A frame never grants custody, credit or execution. */
export const ORIGINAL_ECONOMIC_STATE_V1 = 'ORIGINAL_PRIVATE_WALLET_ECONOMIC_STATE_V1';
export const ORIGINAL_ECONOMIC_STATE_MAX_AGE_MS = 30000;
const need = ok => { if (!ok) throw Error('WALLET_ORIGINAL_ECONOMIC_STATE'); };
const match = (v, re) => typeof v === 'string' && re.exec(v)?.[0] === v;
const hex = v => match(v, /^[0-9a-f]{64}$/);
const uint = v => match(v, /^(0|[1-9][0-9]{0,77})$/) && BigInt(v) < (1n << 256n);
function exact(v, keys) {
  need(v && Object.getPrototypeOf(v) === Object.prototype && Reflect.ownKeys(v).length === keys.length);
  need(keys.every(k => Object.hasOwn(Object.getOwnPropertyDescriptor(v, k) ?? {}, 'value')));
}
function list(v, max) {
  need(Array.isArray(v) && Object.getPrototypeOf(v) === Array.prototype && v.length <= max
    && Reflect.ownKeys(v).length === v.length + 1);
  for (let i = 0; i < v.length; i++) need(Object.hasOwn(Object.getOwnPropertyDescriptor(v, String(i)) ?? {}, 'value'));
}
function head(v) { exact(v, ['blockNumber', 'blockHash', 'timestamp']); need(uint(v.blockNumber) && hex(v.blockHash) && uint(v.timestamp)); }
function amounts(v, keys) { exact(v, keys); need(Object.values(v).every(uint)); }
export function originalEconomicRouteKeyV1(route) {
  exact(route, ['sourceId', 'generationId', 'assetId', 'chainId', 'genesis', 'pool', 'scope', 'policy', 'assetIdentity', 'domainCommitment']);
  need(['sourceId', 'assetId', 'genesis', 'scope', 'policy', 'assetIdentity'].every(k => hex(route[k]))
    && (route.generationId === null || hex(route.generationId)) && uint(route.chainId)
    && match(route.pool, /^[0-9a-f]{40}$/) && (route.domainCommitment === null || hex(route.domainCommitment)));
  // Never identify a row by asset/symbol alone, even across two EVM realms.
  return JSON.stringify(['sourceId', 'generationId', 'assetId', 'chainId', 'genesis', 'pool', 'scope', 'policy', 'assetIdentity', 'domainCommitment'].map(k => route[k]));
}
export function validateOriginalWalletEconomicStateV1(value) {
  exact(value, ['version', 'profile', 'lifetime', 'status', 'revision', 'storageAvailable', 'observedAt', 'rows', 'checkpoints', 'capabilities']);
  need(value.version === 1 && value.profile === ORIGINAL_ECONOMIC_STATE_V1 && hex(value.lifetime)
    && ['LIVE', 'PARTIAL', 'STALE', 'UNKNOWN'].includes(value.status) && Number.isSafeInteger(value.revision) && value.revision >= 0
    && typeof value.storageAvailable === 'boolean' && (value.observedAt === null || Number.isSafeInteger(value.observedAt) && value.observedAt >= 0));
  exact(value.capabilities, ['readOnly', 'privateBalancesAggregated', 'underlyingCredit', 'deviceRootsIncluded', 'crossNetworkAtomicState']);
  need(value.capabilities.readOnly === true && Object.entries(value.capabilities).filter(([k]) => k !== 'readOnly').every(([,v]) => v === false));
  list(value.checkpoints, 24); const sources = new Map();
  for (const c of value.checkpoints) {
    exact(c, ['sourceId', 'stateSHA256', 'journalRevision']);
    need(hex(c.sourceId) && hex(c.stateSHA256) && !sources.has(c.sourceId)
      && (c.journalRevision === null || Number.isSafeInteger(c.journalRevision) && c.journalRevision >= 0)); sources.set(c.sourceId, c);
  }
  list(value.rows, 64); const keys = new Set();
  for (const r of value.rows) {
    exact(r, ['route', 'asset', 'component', 'state', 'reason', 'head', 'balances', 'backing', 'requests', 'position', 'checkpointSHA256', ...(Object.hasOwn(r, 'observedAt') ? ['observedAt'] : [])]);
    if (Object.hasOwn(r, 'observedAt')) need(r.observedAt === null || Number.isSafeInteger(r.observedAt) && r.observedAt >= 0);
    const key = originalEconomicRouteKeyV1(r.route); need(!keys.has(key)); keys.add(key);
    need(sources.get(r.route.sourceId)?.stateSHA256 === r.checkpointSHA256);
    exact(r.asset, ['kind', 'symbol', 'decimals']); need(['NATIVE', 'ERC20'].includes(r.asset.kind)
      && match(r.asset.symbol, /^[A-Z0-9]{2,12}$/) && Number.isInteger(r.asset.decimals) && r.asset.decimals >= 0 && r.asset.decimals <= 18);
    need(['FLAT_NOTE', 'NATIVE_NOTE', 'WRAPPED_CLAIM', 'NATIVE_CLAIM'].includes(r.component) && ['LIVE', 'STALE', 'UNKNOWN'].includes(r.state)
      && [null, 'ORIGINAL_SOURCE_UNAVAILABLE', 'ORIGINAL_JOURNAL_UNKNOWN', 'ORIGINAL_HEAD_STALE', 'ORIGINAL_VIEW_CHANGED', 'ORIGINAL_STATE_STORAGE_UNAVAILABLE'].includes(r.reason));
    if (r.state === 'LIVE') {
      need(r.reason === null); head(r.head); amounts(r.balances, ['available', 'reserved', 'recovery', 'locked']);
      amounts(r.backing, ['held', 'liabilities', 'surplus', 'deficit']);
      need(BigInt(r.balances.recovery) <= BigInt(r.balances.available) + BigInt(r.balances.locked)
        && BigInt(r.backing.held) >= BigInt(r.backing.liabilities) && r.backing.deficit === '0'
        && BigInt(r.backing.surplus) === BigInt(r.backing.held) - BigInt(r.backing.liabilities));
    } else need(r.head === null && r.balances === null && r.backing === null && r.reason !== null);
    list(r.requests, 128); const requests = new Set();
    for (const q of r.requests) {
      exact(q, ['requestId', 'kind', 'state', 'disposition']);
      need(match(q.requestId, /^[A-Za-z0-9_-]{8,100}$/) && !requests.has(q.requestId)); requests.add(q.requestId);
      need(['TOP_UP', 'GRAPH', 'EXIT'].includes(q.kind) && ['PREPARING', 'PREPARED', 'SUBMITTING', 'RECOVERING', 'REAUTHORIZING', 'UNKNOWN', 'CONFIRMED', 'UNRESOLVED', 'STALE'].includes(q.state)
        && [null, 'APPLIED', 'FULFILLED', 'RECOVERED'].includes(q.disposition));
      if (q.state !== 'CONFIRMED') need(q.disposition === null);
    }
    if (r.position !== null) {
      const p = r.position; exact(p, ['ownershipStatus', 'valuationStatus', 'underlyingAssetId', 'underlyingToken', 'vault', 'shares', 'estimate', 'head', 'underlyingSpendable']);
      need(['LIVE', 'STALE', 'UNKNOWN'].includes(p.ownershipStatus) && ['LIVE', 'STALE', 'UNKNOWN'].includes(p.valuationStatus)
        && (p.underlyingAssetId === null || hex(p.underlyingAssetId)) && match(p.underlyingToken, /^[0-9a-f]{40}$/) && match(p.vault, /^[0-9a-f]{40}$/) && p.underlyingSpendable === false);
      if (p.ownershipStatus === 'LIVE') need(r.state === 'LIVE' && uint(p.shares) && p.shares === r.balances.available); else need(p.shares === null);
      if (p.valuationStatus === 'LIVE') {
        need(p.ownershipStatus === 'LIVE' && p.underlyingAssetId !== null && uint(p.estimate)); head(p.head);
        need(['blockNumber', 'blockHash', 'timestamp'].every(k => p.head[k] === r.head[k]));
      } else need(p.estimate === null && p.head === null);
    }
  }
  const live = value.rows.filter(r => r.state === 'LIVE').length;
  need(value.status === (!value.storageAvailable ? 'UNKNOWN' : live === value.rows.length && live > 0 ? 'LIVE'
    : live > 0 ? 'PARTIAL' : value.rows.some(r => r.state === 'STALE') ? 'STALE' : 'UNKNOWN'));
  if (!value.storageAvailable) need(live === 0);
  return value;
}
export function projectOriginalWalletEconomicStateV1(value, {stale = false, now = Date.now()} = {}) {
  validateOriginalWalletEconomicStateV1(value);
  const rows = value.rows.map(row => {
    // Old frames retain their original whole-frame expiry. New readings carry
    // each original domain's time; a slower source cannot expire another row.
    const observedAt = Object.hasOwn(row, 'observedAt') ? row.observedAt : value.observedAt;
    const expired = stale || observedAt === null || !Number.isSafeInteger(now) || now < observedAt
      || now - observedAt > ORIGINAL_ECONOMIC_STATE_MAX_AGE_MS;
    if (!expired || row.state !== 'LIVE') return structuredClone(row);
    return {...structuredClone(row), state: 'STALE', reason: 'ORIGINAL_HEAD_STALE', head: null, balances: null, backing: null,
      position: row.position ? {...row.position, ownershipStatus: 'STALE', valuationStatus: 'STALE', shares: null, estimate: null, head: null} : null};
  });
  const live = rows.filter(r => r.state === 'LIVE').length;
  return {...value, status: !value.storageAvailable ? 'UNKNOWN' : live === rows.length && live > 0 ? 'LIVE' : live > 0 ? 'PARTIAL' : rows.some(r => r.state === 'STALE') ? 'STALE' : 'UNKNOWN', rows};
}
