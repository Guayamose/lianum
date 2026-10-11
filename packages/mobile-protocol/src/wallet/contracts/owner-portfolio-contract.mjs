/** Shared parsed-data codec for owner-private reads. Fixed versioned schemas;
 * no signer, pool selection, journal update, aggregation or proof verification.
 * Browser and Node consume JSON transport payloads, never live capabilities. */
const INVALID = 'FLAT_ACCOUNT_OWNER_CLIENT_RESPONSE_INVALID';
const PORTFOLIO = 'OWNED_FLAT_PRIVATE_PORTFOLIO_V1';
/** Fixed presentation of the original owned SPL custody asset. These labels
 * authenticate no mint, chain state, custody, private credit or spend authority. */
export const ORIGINAL_SPL_USDC_UNITS_V1 = Object.freeze({ nativeAssetKind: 'SOLANA_SPL_USDC',
  mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', claimSymbol: 'cUSDC',
  nativeSymbol: 'USDC', decimals: 6, atomicUnit: 'micro-USDC' });
const splPositionFields = ['nativeAssetKind', 'decimals', 'atomicUnit', 'mint'];
const labels = /^(?:FLAT|CLAIM|NATIVE_CLAIM|COMBINED_OPERATOR|OPERATOR_NATIVE|SOLANA|BITCOIN|LOCAL_EVM|ROLE_CLIENT|PW|VAULT|NATIVE|COMMITMENT)_[A-Z0-9_]{1,100}$/;
const limitations = Object.freeze({ source: 'HOST_REPORTED', chainVerifiedByClient: false,
  proofsVerifiedByClient: false, nativeSelfCustodyEstablished: false, crossAssetTotalsProvided: false });
function need(value) { if (!value) throw new Error(INVALID); }
const matches = (value, pattern) => typeof value === 'string' && pattern.exec(value)?.[0] === value;
function record(value, required, optional = []) {
  need(value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype);
  const keys = Reflect.ownKeys(value);
  need(required.every(key => Object.hasOwn(value, key)) && keys.every(key => required.includes(key) || optional.includes(key)));
  for (const key of keys) need(Object.hasOwn(Object.getOwnPropertyDescriptor(value, key), 'value'));
  return value;
}
const frozen = value => {
  if (value && typeof value === 'object') { Object.values(value).forEach(frozen); Object.freeze(value); }
  return value;
};
function decimal(value) {
  need(matches(value, /^(0|[1-9][0-9]{0,77})$/)); const number = BigInt(value);
  need(number.toString() === value && number < (1n << 256n)); return number;
}
const digest = value => need(matches(value, /^[0-9a-f]{64}$/));
const same = (left, right) => need(Object.keys(left).every(key => left[key] === right[key]));
function observation(value) {
  record(value, ['observedAt', 'blockNumber', 'blockHash', 'timestamp']);
  need(Number.isSafeInteger(value.observedAt) && value.observedAt >= 0 && !Object.is(value.observedAt, -0));
  decimal(value.blockNumber); decimal(value.timestamp); digest(value.blockHash);
}
function account(value) {
  record(value, ['version', 'status', 'asset', 'observed', 'balances', 'backing', 'requests']);
  need(value.version === 1 && ['LIVE', 'STALE', 'UNAVAILABLE'].includes(value.status));
  record(value.asset, ['assetId', 'symbol', 'decimals']); digest(value.asset.assetId);
  need(matches(value.asset.symbol, /^[A-Z0-9]{2,12}$/) && Number.isInteger(value.asset.decimals)
    && value.asset.decimals >= 0 && value.asset.decimals <= 18);
  need(Array.isArray(value.requests) && value.requests.length <= 128);
  const ids = new Set();
  for (const row of value.requests) {
    record(row, ['requestId', 'kind', 'state', 'disposition']);
    need(matches(row.requestId, /^[A-Za-z0-9_-]{8,100}$/) && !ids.has(row.requestId)); ids.add(row.requestId);
    need(['TOP_UP', 'GRAPH', 'EXIT'].includes(row.kind) && ['CONFIRMED', 'UNRESOLVED', 'STALE'].includes(row.state));
    if (row.state === 'CONFIRMED') need(row.kind === 'GRAPH'
      ? ['FULFILLED', 'RECOVERED'].includes(row.disposition) : row.disposition === 'APPLIED');
    else need(row.disposition === null);
  }
  if (value.status === 'UNAVAILABLE') {
    need(value.observed === null && value.balances === null && value.backing === null);
    need(value.requests.every(row => row.state !== 'CONFIRMED' && row.disposition === null));
  } else {
    observation(value.observed); record(value.balances, ['available', 'reserved', 'recovery', 'locked']);
    for (const amount of Object.values(value.balances)) decimal(amount);
    need(BigInt(value.balances.recovery) <= BigInt(value.balances.available) + BigInt(value.balances.locked));
    record(value.backing, ['held', 'liabilities', 'surplus', 'deficit']);
    for (const amount of Object.values(value.backing)) decimal(amount);
    need(BigInt(value.backing.held) >= BigInt(value.backing.liabilities) && value.backing.deficit === '0');
    need(value.backing.surplus === String(BigInt(value.backing.held) - BigInt(value.backing.liabilities)));
    need(value.status === (value.requests.some(row => row.state === 'STALE') ? 'STALE' : 'LIVE'));
  }
  return value;
}
function diagnostic(value) {
  record(value, ['code', 'causeCode', 'causeCodes']);
  need(matches(value.code, labels) && Array.isArray(value.causeCodes) && value.causeCodes.length <= 4);
  need(value.causeCodes.every(code => matches(code, labels) && code !== value.code));
  need(new Set(value.causeCodes).size === value.causeCodes.length);
  need(value.causeCode === (value.causeCodes.at(-1) ?? null));
}
function nativeClaims(value, portfolio) {
  need(Array.isArray(value) && value.length >= 1 && value.length <= portfolio.assets.length);
  const ids = new Set();
  for (const row of value) {
    record(row, ['kind', 'assetId', 'nativeSymbol', 'nativeGenesis', 'availablePrivateClaims', 'custodyObservation',
      'nativeSelfCustody', 'underlyingSpendable', 'redemption', 'independentOperators', 'assurance'], ['custodyDiagnostic', ...splPositionFields]);
    digest(row.assetId); digest(row.nativeGenesis); need(!ids.has(row.assetId)); ids.add(row.assetId);
    const asset = portfolio.assets.find(asset => asset.asset.assetId === row.assetId); need(asset);
    need(row.kind === 'CUSTODIAL_NATIVE_CLAIM');
    if (splPositionFields.some(key => Object.hasOwn(row, key))) {
      need(splPositionFields.every(key => Object.hasOwn(row, key) && row[key] === ORIGINAL_SPL_USDC_UNITS_V1[key]));
      need(row.nativeSymbol === ORIGINAL_SPL_USDC_UNITS_V1.nativeSymbol
        && asset.asset.symbol === 'CUSDC' && asset.asset.decimals === ORIGINAL_SPL_USDC_UNITS_V1.decimals);
    } else need(['BTC', 'SOL'].includes(row.nativeSymbol));
    need(row.nativeSelfCustody === false && row.underlyingSpendable === false && row.independentOperators === false);
    need(row.redemption === 'EXPLICIT_BURN_TICKET_AND_ORIGINAL_NATIVE_DELIVERY');
    need(row.assurance === 'LOCAL_THREE_OF_FOUR_OBSERVATIONS_WITH_COMMON_HOST_AND_NATIVE_CUSTODIAN_TRUST');
    need(row.availablePrivateClaims === (asset.status === 'LIVE' ? asset.balances.available : null));
    need(['CURRENT_QUORUM', 'UNAVAILABLE'].includes(row.custodyObservation));
    if (row.custodyObservation === 'CURRENT_QUORUM')
      need(portfolio.status === 'LIVE' && portfolio.coherent === true && asset.status === 'LIVE'
        && !Object.hasOwn(row, 'custodyDiagnostic'));
    else if (Object.hasOwn(row, 'custodyDiagnostic')) diagnostic(row.custodyDiagnostic);
  }
}
function portfolio(value) {
  record(value, ['version', 'profile', 'status', 'coherent', 'observed', 'assets', 'capabilities'], ['nativeClaims']);
  need(value.version === 1 && [PORTFOLIO, 'OWNED_WRAPPED_WALLET_PORTFOLIO_V1'].includes(value.profile) && ['LIVE', 'PARTIAL', 'STALE', 'UNAVAILABLE'].includes(value.status));
  need(Array.isArray(value.assets) && value.assets.length >= 1 && value.assets.length <= 2);
  value.assets.forEach(account); need(new Set(value.assets.map(row => row.asset.assetId)).size === value.assets.length);
  const observed = value.assets.filter(row => row.observed !== null);
  const coherent = observed.length === value.assets.length && observed.every(row =>
    ['blockHash', 'blockNumber', 'timestamp'].every(key => row.observed[key] === observed[0].observed[key]));
  need(value.coherent === coherent);
  if (coherent) { observation(value.observed); same(value.observed, observed[0].observed); }
  else need(value.observed === null);
  const status = observed.length === 0 ? 'UNAVAILABLE' : observed.length < value.assets.length ? 'PARTIAL'
    : coherent && value.assets.every(row => row.status === 'LIVE') ? 'LIVE' : 'STALE';
  need(value.status === status);
  record(value.capabilities, ['coordinatorRestart', 'keeperRestart', 'crossAssetAtomicConversion', 'privateDeFiComposability', 'fullWalletAcceptance']);
  need(value.capabilities.coordinatorRestart === true);
  for (const key of ['keeperRestart', 'crossAssetAtomicConversion', 'privateDeFiComposability', 'fullWalletAcceptance'])
    need(value.capabilities[key] === false);
  if (Object.hasOwn(value, 'nativeClaims')) nativeClaims(value.nativeClaims, value);
  return value;
}

export const GENERATION_PORTFOLIO_PROFILE = 'FLAT_IMMUTABLE_JOURNAL_CATALOGUE_V2';
function boundedArray(value, minimum, maximum) {
  need(Array.isArray(value) && value.length >= minimum && value.length <= maximum);
  need(Reflect.ownKeys(value).length === value.length + 1);
  for (let i = 0; i < value.length; i++) need(Object.hasOwn(Object.getOwnPropertyDescriptor(value, String(i)) ?? {}, 'value'));
}
function catalogue(value) {
  record(value, ['version', 'profile', 'status', 'coherent', 'observed', 'generations', 'capabilities'], ['freshAdmissions']);
  need(value.version === 2 && value.profile === GENERATION_PORTFOLIO_PROFILE);
  boundedArray(value.generations, 1, 8);
  const generations = new Set(), assetIds = new Set(), requestIds = new Set(), observed = [], assets = [];
  let routeCount = 0;
  for (const generation of value.generations) {
    record(generation, ['generationId', 'routes', 'portfolio', 'errorCode']);
    digest(generation.generationId); need(!generations.has(generation.generationId)); generations.add(generation.generationId);
    boundedArray(generation.routes, 1, 2); routeCount += generation.routes.length; need(routeCount <= 8);
    for (const route of generation.routes) {
      record(route, ['assetId', 'pool', 'domainCommitment']); digest(route.assetId); digest(route.domainCommitment);
      need(matches(route.pool, /^[0-9a-f]{40}$/));
      need(!assetIds.has(route.assetId)); assetIds.add(route.assetId);
    }
    if (generation.portfolio === null) {
      need(generation.errorCode === 'FLAT_CATALOGUE_GENERATION_VIEW_UNAVAILABLE'); continue;
    }
    need(generation.errorCode === null); portfolio(generation.portfolio);
    const nested = generation.portfolio.assets;
    need(nested.length === generation.routes.length && nested.every(row => generation.routes.some(route => route.assetId === row.asset.assetId)));
    for (const row of nested) {
      assets.push(row); if (row.observed !== null) observed.push(row.observed);
      for (const request of row.requests) { need(!requestIds.has(request.requestId)); requestIds.add(request.requestId); }
    }
    need(requestIds.size <= 128);
  }
  if (Object.hasOwn(value, 'freshAdmissions')) {
    const admission = value.freshAdmissions;
    record(admission, ['version', 'fenced', 'routes']); need(admission.version === 1 && typeof admission.fenced === 'boolean');
    boundedArray(admission.routes, 1, 8);
    const selected = new Set();
    for (const route of admission.routes) {
      record(route, ['generationId', 'assetId']); digest(route.generationId); digest(route.assetId);
      need(!selected.has(route.assetId)); selected.add(route.assetId);
      const original = value.generations.find(generation => generation.generationId === route.generationId);
      need(original && original.routes.some(item => item.assetId === route.assetId));
    }
  }
  const coherent = observed.length === routeCount && observed.every(row =>
    ['blockHash', 'blockNumber', 'timestamp'].every(key => row[key] === observed[0][key]));
  need(value.coherent === coherent);
  if (coherent) { observation(value.observed); same(value.observed, observed[0]); }
  else need(value.observed === null);
  const state = observed.length === 0 ? 'UNAVAILABLE' : observed.length < routeCount ? 'PARTIAL'
    : coherent && assets.every(row => row.status === 'LIVE') ? 'LIVE' : 'STALE';
  need(value.status === state);
  record(value.capabilities, ['coordinatorRestart', 'keeperRestart', 'nodeRestart', 'privateBalancesAggregated', 'implicitNoteMigration', 'fullWalletAcceptance']);
  need(value.capabilities.coordinatorRestart === true);
  for (const name of ['keeperRestart', 'nodeRestart', 'privateBalancesAggregated', 'implicitNoteMigration', 'fullWalletAcceptance']) need(value.capabilities[name] === false);
  return value;
}
/** Parsed private HTTP data only. Shape/accounting consistency, never proof,
 * authority, consensus, custody attestation or an authorization to mutate. */
export function validateFlatOwnerReadPayload(value) {
  let payloadKind, data;
  if (value?.profile === GENERATION_PORTFOLIO_PROFILE) { data = catalogue(value); payloadKind = 'IMMUTABLE_JOURNAL_GENERATIONS'; }
  else if (value && Object.hasOwn(value, 'assets')) { data = portfolio(value); payloadKind = 'REGISTERED_PORTFOLIO'; }
  else { data = account(value); payloadKind = 'SINGLE_ASSET_ACCOUNT'; }
  return { payloadKind, data };
}
/** Original asset rows are tagged for display/routing only, never summed. A
 * missing generation retains its route identities with unknown amounts. */
export function ownerPortfolioAssetRows(value) {
  if (!value) return [];
  if (value.profile !== GENERATION_PORTFOLIO_PROFILE) return Array.isArray(value.assets) ? value.assets : [value];
  return value.generations.flatMap(generation => generation.routes.map(route => {
    const original = generation.portfolio?.assets.find(row => row.asset.assetId === route.assetId);
    return { ...(original ?? { version: 1, status: 'UNAVAILABLE', asset: { assetId: route.assetId, symbol: null, decimals: null },
      observed: null, balances: null, backing: null, requests: [] }),
      generationId: generation.generationId, pool: route.pool, domainCommitment: route.domainCommitment };
  }));
}
export function ownerPortfolioGenerations(value) {
  return value?.profile === GENERATION_PORTFOLIO_PROFILE ? value.generations : [];
}
