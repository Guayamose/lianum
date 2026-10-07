/** Private bootstrap fixes token identities and RPC endpoints. No API request
 * can register a token, choose an endpoint or submit arbitrary calldata. */
import {types} from 'node:util';
import {fields,need,freeze,PORTFOLIO_CHAINS} from './portfolio-registry.mjs';
import {createErc20ObservationAdapter} from './erc20-observation-adapter.mjs';
import {createEvmHttpObservationTransport} from './observation-http-transport.mjs';
function array(v,limit){need(Array.isArray(v)&&!types.isProxy(v)&&v.length<=limit&&Reflect.ownKeys(v).length===v.length+1,'ERC20_CONFIG_LIMIT');return Array.from({length:v.length},(_,i)=>{const d=Object.getOwnPropertyDescriptor(v,String(i));need(d?.enumerable&&Object.hasOwn(d,'value'),'ERC20_CONFIG_DATA');return d.value;});}
export function createHttpErc20Portfolio(raw){
 const input=fields(raw,['networks','assets'],[],true),networks=new Map();
 for(const row of array(input.networks,7)){const n=fields(row,['chain','genesisHash','endpoint'],['freshness','timeoutMs','maxResponseBytes','watch'],true);need(!networks.has(n.chain),'ERC20_DUPLICATE_NETWORK');networks.set(n.chain,n);}
 const grouped=new Map();for(const row of array(input.assets,16)){const a=fields(row,['chain','token','runtimeCodeSHA256','symbol','decimals'],[],true);need(PORTFOLIO_CHAINS[a.chain]?.family==='evm'&&networks.has(a.chain),'ERC20_NETWORK_NOT_CONFIGURED');const {chain,...token}=a;const group=grouped.get(chain)??[];group.push(token);grouped.set(chain,group);}
 const adapters=new Map();for(const [chain,assets]of grouped){const n=networks.get(chain),transport=createEvmHttpObservationTransport({endpoint:n.endpoint,...(n.timeoutMs===undefined?{}:{timeoutMs:n.timeoutMs}),...(n.maxResponseBytes===undefined?{}:{maxResponseBytes:n.maxResponseBytes})});adapters.set(chain,createErc20ObservationAdapter({chain,genesisHash:n.genesisHash,transport,assets,...(n.freshness===undefined?{}:{freshness:n.freshness})}));}
 return Object.freeze({listAssets:()=>freeze([...adapters.values()].flatMap(adapter=>adapter.listAssets())),observe(request){const a=adapters.get(fields(request,['chain']).chain);need(a,'ERC20_NETWORK_NOT_CONFIGURED');return a.observe(request);}});
}
