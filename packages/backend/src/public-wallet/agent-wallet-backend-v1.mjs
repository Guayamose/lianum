import {mkdir,lstat,realpath,readFile,open,rename,unlink} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {validateNativeAccountV1,nativeNetworkV1} from '@lianum/crypto/native-wallet-v1';
import {normalizeAgentContextV1} from '@lianum/mobile-protocol/agent/chat-v1';
import {nativeFiatAmountsV1} from '@lianum/mobile-protocol/wallet/valuation-v1';
const need=(value,reason='DATA')=>{if(!value)throw Error('NATIVE_AGENT_BACKEND_'+reason);};
const exact=(value,fields)=>need(value&&Object.getPrototypeOf(value)===Object.prototype&&Object.keys(value).sort().join(',')===[...fields].sort().join(','));
const owner=id=>need(typeof id==='string'&&/^[0-9a-f]{64}$/.test(id),'IDENTITY');
async function privateDirectory(path){await mkdir(path,{recursive:true,mode:0o700});const s=await lstat(path);need(s.isDirectory()&&!s.isSymbolicLink()&&s.uid===process.getuid()&&(s.mode&0o777)===0o700&&await realpath(path)===resolve(path),'STORAGE');}
async function json(path){const s=await lstat(path);need(s.isFile()&&!s.isSymbolicLink()&&s.nlink===1&&s.uid===process.getuid()&&(s.mode&0o777)===0o600&&s.size<=65536,'STORAGE');return JSON.parse(await readFile(path,'utf8'));}
async function write(path,value){const tmp=path+'.tmp-'+randomUUID();let h;try{h=await open(tmp,'wx',0o600);await h.writeFile(JSON.stringify(value)+'\n');await h.sync();await h.close();h=null;await rename(tmp,path);const d=await open(resolve(path,'..'),'r');try{await d.sync();}finally{await d.close();}}finally{await h?.close();try{await unlink(tmp);}catch(error){if(error.code!=='ENOENT')throw error;}}}

export function createAgentMarketReaderV1({fetchImpl=fetch,now=Date.now}={}){
 let cached=null,running=null;
 return async signal=>{
  if(cached&&now()-cached.observedAt<60000)return cached;
  if(!running)running=(async()=>{try{const response=await fetchImpl('https://api.coinbase.com/v2/exchange-rates?currency=USD',{signal:AbortSignal.any([AbortSignal.timeout(10000),...(signal?[signal]:[])]),redirect:'error'});need(response.ok,'MARKET_UNAVAILABLE');const text=await response.text();need(text.length<=250000,'MARKET_BOUND');const value=JSON.parse(text);need(value?.data?.currency==='USD','MARKET_DATA');const rates={};for(const symbol of ['BTC','ETH','SOL','EUR']){const rate=value.data.rates?.[symbol];need(typeof rate==='string'&&rate.length<=80&&/^\d+(?:\.\d+)?$/.test(rate)&&Number.isFinite(Number(rate))&&Number(rate)>0,'MARKET_DATA');rates[symbol]=rate;}cached={rates,observedAt:now(),source:'Coinbase'};return cached;}catch{if(cached&&now()-cached.observedAt<1800000)return cached;return null;}finally{running=null;}})();
  return running;
 };
}

/** The device signs enrollment of public native accounts. No spending grant,
 * transaction bytes, wallet key or model-selected address enters this reader. */
export async function createAgentWalletBackendV1({directory,native,networks,marketReader=createAgentMarketReaderV1(),now=Date.now}){
 await privateDirectory(directory);const queues=new Map();
 async function read(id){owner(id);try{return await json(join(directory,id+'.json'));}catch(error){if(error.code==='ENOENT')return {profile:'LIANUM_AGENT_WALLET_REGISTRY_V1',owner:id,enabled:false,networks:{}};throw error;}}
 const serialized=(id,work)=>{const p=(queues.get(id)??Promise.resolve()).catch(()=>{}).then(work);queues.set(id,p);void p.finally(()=>{if(queues.get(id)===p)queues.delete(id);}).catch(()=>{});return p;};
 return Object.freeze({
  async link(identity,raw){
   exact(raw,['enabled','network','currency','accounts']);owner(identity.ownerId);need(createHash('sha256').update(identity.devicePublicKey).digest('hex')===identity.ownerId,'IDENTITY');need(typeof raw.enabled==='boolean'&&['mainnet','testnet'].includes(raw.network)&&['EUR','USD'].includes(raw.currency));need(Array.isArray(raw.accounts)&&raw.accounts.length<=3&&(!raw.enabled||raw.accounts.length>0));
   const chains=new Set();for(const a of raw.accounts){exact(a,['networkId','chain','network','address','path','publicKey']);validateNativeAccountV1(a);need(a.network===raw.network&&networks.includes(a.networkId)&&!chains.has(a.chain),'NETWORK');chains.add(a.chain);}
   return serialized(identity.ownerId,async()=>{const prior=await read(identity.ownerId);need(prior.owner===identity.ownerId,'IDENTITY');if(!raw.enabled){prior.enabled=false;prior.networks={};}else{prior.enabled=true;const old=prior.networks[raw.network],value={currency:raw.currency,accounts:structuredClone(raw.accounts)};if(!old||JSON.stringify({currency:old.currency,accounts:old.accounts})!==JSON.stringify(value)||old.expiresAt<now()+86400000)prior.networks[raw.network]={...value,registeredAt:now(),expiresAt:now()+30*86400000};}await write(join(directory,identity.ownerId+'.json'),prior);return {enabled:prior.enabled,network:raw.network,currency:raw.currency,expiresAt:prior.networks[raw.network]?.expiresAt??null,financialPermission:false};});
  },
  async snapshot(id,network,signal){
   owner(id);need(['mainnet','testnet'].includes(network),'NETWORK');const registry=await read(id),subscription=registry.networks[network];need(registry.owner===id&&registry.enabled&&subscription&&now()<subscription.expiresAt,'NOT_LINKED');
   const service=await native(id,network),summaries=service.readOperationSummaries();
   // Only observation of already-retained signed transactions. Never submit,
   // prepare, cancel or retry a send from this background path.
   for(const row of summaries.filter(r=>!r.terminal&&r.id!==null).slice(0,4)){try{await service.observeTransfer({id:row.operationId,networkId:row.networkId},signal);}catch{ /* Current uncertainty remains in its Original journal. */ }}
   const results=await Promise.allSettled(subscription.accounts.map(a=>service.readAccount(a,signal))),market=await marketReader(signal),keys=['total','available','reserved','occupied','paused'];
   const assets=subscription.accounts.map((a,index)=>{const n=nativeNetworkV1(a.networkId),balance=results[index].status==='fulfilled'?results[index].value:null,amounts=nativeFiatAmountsV1(balance,n.decimals,n.symbol,market,subscription.currency);return {symbol:n.symbol,...Object.fromEntries(keys.map(key=>[key,amounts[key]===null?null:amounts[key].toString()]))};});
   const complete=assets.length>0&&assets.every(a=>a.total!==null),operations=service.readOperationSummaries(),context=normalizeAgentContextV1({network,currency:subscription.currency,observedAt:results.every(r=>r.status==='rejected')?null:now(),marketObservedAt:market?.observedAt??null,reading:false,totals:Object.fromEntries(keys.map(key=>[key,complete?assets.reduce((sum,a)=>sum+BigInt(a[key]),0n).toString():null])),assets,operations:{pendingTransfers:operations.filter(r=>!r.terminal&&r.id!==null).length,plan:null}});
   return {profile:'LIANUM_AGENT_BACKEND_SNAPSHOT_V1',source:'BACKEND_RPC',context,operations:operations.slice(-32),expiresAt:subscription.expiresAt,failedAccounts:results.filter(r=>r.status==='rejected').length,financialPermission:false};
  },
 });
}
