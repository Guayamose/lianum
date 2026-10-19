/** Amounts from verified display rows, separated by economic identity. No
 * market prices, chain access, persisted permissions or custody handles. */
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
const uint=value=>typeof value==='string'&&/^(0|[1-9][0-9]{0,77})$/.test(value);
function identity(row){
 const r=row.route;if(!r.assetId||!r.genesis||!r.domain)return null;
 const unit=r.component==='POSITION'?'POSITION_SHARES':['DEVICE_PAGED_NOTE','DEVICE_PAGED_OUTPUT','DEVICE_PAGED_RESERVATION'].includes(r.component)?'DEMO_UNITS':'TOKEN_ATOMIC';
 const domain=JSON.stringify([r.genesis,r.domain,r.pool??r.vault??null,r.scope??null,r.policy??null,r.runtimeId??null]);
 return{key:JSON.stringify([r.assetId,domain,unit,row.decimals]),assetId:String(r.assetId),genesis:String(r.genesis),domain,unit,decimals:row.decimals,label:unit==='DEMO_UNITS'?"Demo units":row.label.split(' · ')[0]};
}
function holdingKey(row,asset){const r=row.route;return JSON.stringify([asset.key,r.component==='POSITION'?[r.generationId,r.vault,r.runtimeId,r.devicePublicKey]:r.commitment??[r.component,r.rootId,r.parentJobId,r.noteRole,r.id]]);}
function amount(row,field){
 if(row.state!=='LIVE')return null;
 const value=field==='available'&&row.route.component==='POSITION'?row.shares:row[field];
 if(uint(value))return value;
 if(field==='available'&&['SPENT','UNISSUED','LOCKED'].includes(row.noteState)||field!=='available'&&value===null)return'0';
 return null;
}
export function walletPortfolioGroupsV1(rows){
 if(!Array.isArray(rows)||rows.length>4096)throw Error('MOBILE_WALLET_PORTFOLIO_ROWS');
 const groups=new Map(),seen=new Map();let duplicatesExcluded=0;
 for(const row of rows){
  if(['DEVICE_PAGED_GRAPH','DEVICE_GRAPH_RESERVATION'].includes(row.route.component)||row.issued===false)continue;
  const asset=identity(row);if(!asset)continue;const id=holdingKey(row,asset),previous=seen.get(id);
  if(previous){duplicatesExcluded++;const previousHead=previous.observed?.blockNumber,nextHead=row.observed?.blockNumber;
   const newer=uint(previousHead)&&uint(nextHead)&&BigInt(nextHead)>BigInt(previousHead);
   if(previous.state==='LIVE'&&(row.state!=='LIVE'||!newer)||previous.state!=='LIVE'&&row.state!=='LIVE')continue;
   const group=groups.get(asset.key);group.rows=group.rows.filter(item=>item!==previous);
  }
  seen.set(id,row);if(!groups.has(asset.key))groups.set(asset.key,{...asset,rows:[]});groups.get(asset.key).rows.push(row);
 }
 return freeze({duplicatesExcluded,assets:[...groups.values()].map(group=>{
  const heads=new Set(group.rows.filter(row=>row.state==='LIVE').map(row=>row.observed?.blockHash??null));
  const headConsistent=!heads.has(null)&&heads.size<=1;
  const quantities={};for(const field of ['available','reserved','locked','recovery']){let sum=0n,known=0;for(const row of group.rows){const value=amount(row,field);if(value!==null){sum+=BigInt(value);known++;}}quantities[field]={amount:headConsistent&&known?sum.toString():null,complete:headConsistent&&known===group.rows.length,known,total:group.rows.length};}
  const {rows:unused,...asset}=group;
  return{...asset,headConsistent,rowKeys:group.rows.map(row=>row.key),custodies:group.rows.length,current:group.rows.filter(row=>row.state==='LIVE').length,pending:group.rows.filter(row=>row.state==='UNKNOWN').length,stale:group.rows.filter(row=>row.state==='STALE').length,quantities,underlyingValuationIncluded:false,bucketsAdditive:false};
 })});
}
