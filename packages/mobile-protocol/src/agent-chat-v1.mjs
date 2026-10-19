const need=(value)=>{if(!value)throw Error('NATIVE_AGENT_DATA');};
const exact=(value,keys)=>{need(value&&Object.getPrototypeOf(value)===Object.prototype&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key)));};
const text=(value,max)=>need(typeof value==='string'&&value.trim().length>0&&value.length<=max);
const amount=value=>need(value===null||typeof value==='string'&&/^(0|[1-9][0-9]{0,39})$/.test(value));
const time=value=>need(value===null||Number.isSafeInteger(value)&&value>=0);
export const AGENT_SCREENS_V1=Object.freeze(['wallet','operations','permissions','plan','approvals']);
export const AGENT_TOOLS_V1=Object.freeze(['read_wallet','read_operations','read_permissions','offer_screen']);

/** Only aggregated observations cross this boundary. No account, recipient,
 * device identity, connection, custody or signature field is accepted. */
export function normalizeAgentContextV1(value){
 exact(value,['currency','observedAt','marketObservedAt','reading','totals','assets','operations',...(Object.hasOwn(value??{},'network')?['network']:[])]);
 if(value.network!==undefined)need(value.network==='mainnet'||value.network==='testnet');
 need(['EUR','USD'].includes(value.currency)&&typeof value.reading==='boolean');time(value.observedAt);time(value.marketObservedAt);
 const keys=['total','available','reserved','occupied'];exact(value.totals,keys);keys.forEach(key=>amount(value.totals[key]));
 need(Array.isArray(value.assets)&&value.assets.length<=3);const seen=new Set();
 for(const row of value.assets){exact(row,['symbol',...keys]);need(['BTC','ETH','SOL'].includes(row.symbol)&&!seen.has(row.symbol));seen.add(row.symbol);keys.forEach(key=>amount(row[key]));
  need(keys.every(key=>row[key]===null)||keys.every(key=>row[key]!==null));
  if(row.total!==null)need(BigInt(row.total)===BigInt(row.available)+BigInt(row.reserved)+BigInt(row.occupied));
 }
 const complete=value.assets.length>0&&value.assets.every(row=>row.total!==null);
 for(const key of keys)need(complete?value.totals[key]!==null&&BigInt(value.totals[key])===value.assets.reduce((sum,row)=>sum+BigInt(row[key]),0n):value.totals[key]===null);
 exact(value.operations,['pendingTransfers','plan']);need(Number.isSafeInteger(value.operations.pendingTransfers)&&value.operations.pendingTransfers>=0&&value.operations.pendingTransfers<=100000);
 const plan=value.operations.plan;if(plan!==null){exact(plan,['state','completed','total']);need(['idle','running','observing','pending','paused','complete','error'].includes(plan.state)&&Number.isSafeInteger(plan.completed)&&Number.isSafeInteger(plan.total)&&plan.completed>=0&&plan.total>=plan.completed&&plan.total<=100000);}
 return JSON.parse(JSON.stringify(value));
}
export function normalizeAgentRequestV1(value){
 exact(value,['message','history','context']);text(value.message,2000);need(Array.isArray(value.history)&&value.history.length<=12);
 for(const row of value.history){exact(row,['role','text']);need(['you','agent'].includes(row.role));text(row.text,6000);}
 return {message:value.message.trim(),history:value.history.map(row=>({...row})),context:normalizeAgentContextV1(value.context)};
}
export function normalizeAgentReplyV1(value){
 exact(value,['profile','text','facts','checks','action','tools']);need(value.profile==='LIANUM_AGENT_REPLY_V1');text(value.text,6000);
 need(Array.isArray(value.facts)&&value.facts.length<=12&&Array.isArray(value.checks)&&value.checks.length<=8&&Array.isArray(value.tools)&&value.tools.length<=6);
 for(const row of value.facts){exact(row,['label','value']);text(row.label,100);text(row.value,150);}
 for(const row of value.checks){exact(row,['label','complete']);text(row.label,150);need(typeof row.complete==='boolean');}
 for(const tool of value.tools)need(AGENT_TOOLS_V1.includes(tool));
 if(value.action!==null){exact(value.action,['label','target']);text(value.action.label,100);need(AGENT_SCREENS_V1.includes(value.action.target));}
 return JSON.parse(JSON.stringify(value));
}
