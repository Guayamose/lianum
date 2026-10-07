/** Owner-only position state: exact note buckets and optional valuation are
 * independent observations. No sum, authorization, credit or consensus proof. */
export const POSITION_STATE_PROFILE = 'OWNED_GENERATION_PRIVATE_VAULT_POSITIONS_V2';
const need = value => { if (!value) throw Error('WALLET_POSITION_STATE_CONTRACT'); };
function record(value, keys) {
  need(value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype);
  const own = Reflect.ownKeys(value);
  need(own.length === keys.length && keys.every(key => own.includes(key)));
  for (const key of own) {
    const field = Object.getOwnPropertyDescriptor(value,key);
    need(field?.enumerable && Object.hasOwn(field,'value'));
  }
}
function array(value,max) {
  need(Array.isArray(value) && Object.getPrototypeOf(value) === Array.prototype && value.length <= max
    && Reflect.ownKeys(value).length === value.length + 1);
  for(let i=0;i<value.length;i++){const field=Object.getOwnPropertyDescriptor(value,String(i));need(field?.enumerable&&Object.hasOwn(field,'value'));}
}
const hash = value => need(typeof value === 'string' && /^[0-9a-f]{64}$/.test(value));
const address = value => need(typeof value === 'string' && /^[0-9a-f]{40}$/.test(value));
function amount(value) {
  need(typeof value === 'string' && /^(0|[1-9][0-9]{0,77})$/.test(value) && BigInt(value)<(1n<<256n));
}
function observation(value) {
  record(value,['observedAt','blockNumber','blockHash','timestamp']);hash(value.blockHash);
  amount(value.blockNumber);amount(value.timestamp);
  need(Number.isSafeInteger(value.observedAt)&&value.observedAt>=0&&!Object.is(value.observedAt,-0));
}
export const samePositionHead = (left,right) => Boolean(left&&right
  && ['blockNumber','blockHash','timestamp'].every(key=>left[key]===right[key]));
export function validatePositionStateRow(row) {
  record(row,['generationId','shareAssetId','underlyingAssetId','vault','underlyingToken','vaultIdentity','kind',
    'ownership','valuation','underlyingSpendable','privateConversionAccepted']);
  hash(row.generationId);hash(row.shareAssetId);
  if(row.underlyingAssetId!==null){hash(row.underlyingAssetId);need(row.underlyingAssetId!==row.shareAssetId);}
  address(row.vault);address(row.underlyingToken);
  const identity=row.vaultIdentity;
  record(identity,['chainId','genesisHash','domain','runtimeId','asset','assetCodeSHA256','vault','vaultCodeSHA256']);
  need(identity.chainId==='31337'&&identity.vault===row.vault&&identity.asset===row.underlyingToken&&identity.asset!==identity.vault);
  for(const key of ['genesisHash','domain','runtimeId','assetCodeSHA256','vaultCodeSHA256'])hash(identity[key]);
  need(row.kind==='ERC4626_SHARE'&&row.underlyingSpendable===false&&row.privateConversionAccepted===false);
  const ownership=row.ownership;
  record(ownership,['status','observed','balances','pendingRequests','bucketsAdditive']);
  need(['LIVE','STALE','UNAVAILABLE'].includes(ownership.status)&&ownership.bucketsAdditive===false);
  if(ownership.status==='LIVE') {
    observation(ownership.observed);record(ownership.balances,['available','reserved','recovery','locked']);
    Object.values(ownership.balances).forEach(amount);
    need(BigInt(ownership.balances.recovery)<=BigInt(ownership.balances.available)+BigInt(ownership.balances.locked));
    array(ownership.pendingRequests,128);const seen=new Set();
    for(const request of ownership.pendingRequests){record(request,['requestId','kind','state','disposition']);
      need(typeof request.requestId==='string'&&/^[A-Za-z0-9_-]{8,100}$/.test(request.requestId)&&!seen.has(request.requestId));seen.add(request.requestId);
      need(['TOP_UP','GRAPH','EXIT'].includes(request.kind)&&request.state==='UNRESOLVED'&&request.disposition===null);
    }
  } else need(ownership.observed===null&&ownership.balances===null&&ownership.pendingRequests===null);
  const valuation=row.valuation;
  record(valuation,['status','availableShares','estimatedRedeemableUnderlying','observed','rounding','method','redeemableLiquidityVerified','errorCode']);
  need(['LIVE','STALE','UNAVAILABLE'].includes(valuation.status)&&valuation.rounding==='down'
    &&valuation.method==='PINNED_LOCAL_VAULT_PREVIEW_V1'&&valuation.redeemableLiquidityVerified===false);
  if(valuation.status==='LIVE') {
    need(ownership.status==='LIVE'&&row.underlyingAssetId!==null&&valuation.errorCode===null);
    amount(valuation.availableShares);amount(valuation.estimatedRedeemableUnderlying);observation(valuation.observed);
    need(valuation.availableShares===ownership.balances.available&&samePositionHead(ownership.observed,valuation.observed));
    if(valuation.availableShares==='0')need(valuation.estimatedRedeemableUnderlying==='0');
  } else {
    need(valuation.availableShares===null&&valuation.estimatedRedeemableUnderlying===null&&valuation.observed===null);
    need(['PRIVATE_POSITION_OWNER_UNAVAILABLE','PRIVATE_POSITION_UNDERLYING_UNREGISTERED','PRIVATE_POSITION_VALUATION_UNAVAILABLE','PRIVATE_POSITION_HEAD_MISMATCH'].includes(valuation.errorCode));
  }
  return row;
}
export function validatePositionStateEnvelope(value) {
  record(value,['version','profile','positions','privateBalancesAggregated','underlyingPrivateSpendable']);
  need(value.version===2&&value.profile===POSITION_STATE_PROFILE&&value.privateBalancesAggregated===false&&value.underlyingPrivateSpendable===false);
  array(value.positions,8);need(value.positions.length>0);const seen=new Set();
  for(const row of value.positions){validatePositionStateRow(row);need(!seen.has(row.shareAssetId));seen.add(row.shareAssetId);}
  return value;
}
