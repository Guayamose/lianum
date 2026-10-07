/** Explicitly registered public ERC20 observations, not private-note credit.
 * SHA256 identifies exact observed runtime code; it is not EVM EXTCODEHASH.
 * Metadata is bootstrap-pinned display data, not token implementation audit. */
import {createHash} from 'node:crypto';
import {types} from 'node:util';
import {fields,need,freeze,hash32,rpcQuantity,safeMilliseconds,checkFreshBlock,
 observationBootstrap,ObservationError,PORTFOLIO_CHAINS} from '../../shared/portfolio/portfolio-registry.mjs';
import {normalizeEvmBlock} from './evm-observation-adapter.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
const address=v=>typeof v==='string'&&/^0x[0-9a-f]{40}$/.test(v)&&v!=='0x'+'0'.repeat(40);
export function registeredErc20Assets(chain,genesisHash,raw){
 need(PORTFOLIO_CHAINS[chain]?.family==='evm','ERC20_CHAIN');hash32(genesisHash);
 need(Array.isArray(raw)&&!types.isProxy(raw)&&raw.length<=16&&Reflect.ownKeys(raw).length===raw.length+1,'ERC20_ASSET_LIMIT');const seen=new Set();
 return freeze(Array.from({length:raw.length},(_,i)=>{const d=Object.getOwnPropertyDescriptor(raw,String(i));need(d?.enumerable&&Object.hasOwn(d,'value'),'ERC20_ASSET_DATA');const a=fields(d.value,['token','runtimeCodeSHA256','symbol','decimals'],[],true);
  need(address(a.token)&&!seen.has(a.token),'ERC20_TOKEN_IDENTITY');seen.add(a.token);need(typeof a.runtimeCodeSHA256==='string'&&/^[0-9a-f]{64}$/.test(a.runtimeCodeSHA256),'ERC20_CODE_IDENTITY');
  need(typeof a.symbol==='string'&&/^[A-Za-z0-9._-]{1,16}$/.test(a.symbol)&&Number.isSafeInteger(a.decimals)&&a.decimals>=0&&a.decimals<=36,'ERC20_DISPLAY_METADATA');
  return {profile:'EXPLICIT_ERC20_OBSERVATION_ASSET_V1',chain,chainId:PORTFOLIO_CHAINS[chain].chainId,genesisHash,...a,codeHashAlgorithm:'SHA256',observationAssetId:sha('LIANUM/public-erc20/1\0'+JSON.stringify([chain,genesisHash,a.token,a.runtimeCodeSHA256])),metadataSource:'PRIVATE_BOOTSTRAP',implementationVerified:false};}));
}
export function createErc20ObservationAdapter(raw){
 const input=fields(raw,['chain','genesisHash','transport','assets'],['now','freshness'],true),{assets:declared,...bootstrap}=input;
 const config=observationBootstrap(bootstrap,'evm'),assets=registeredErc20Assets(input.chain,input.genesisHash,declared),byToken=new Map(assets.map(a=>[a.token,a]));
 const result=(request,asset,at,status,reason,observed)=>freeze({schema:'flat-erc20-observation/1',chain:config.chain,address:request.address,query:'erc20-balance',asset,network:config.descriptor,status,reason,observedAtMs:String(at),validUntilMs:status==='fresh'?(BigInt(observed.block.timestampMs)+BigInt(config.freshness.maxBlockAgeMs)).toString():null,balanceAtomic:status==='fresh'?observed.balanceAtomic:null,block:status==='fresh'?observed.block:null,assurance:'trusted-rpc-observation',creditEligible:false,privateSpendableAtomic:null,codeIdentityObserved:status==='fresh'});
 return Object.freeze({listAssets:()=>assets,async observe(rawRequest){
  const request=fields(rawRequest,['chain','address','query','token'],[],true);need(request.chain===config.chain&&request.query==='erc20-balance'&&address(request.address),'ERC20_REQUEST');const asset=byToken.get(request.token);need(asset,'ERC20_NOT_REGISTERED');
  const started=safeMilliseconds(config.now()),controller=new AbortController();let timer;
  const call=async(method,params)=>{need(!controller.signal.aborted,'QUERY_TIMEOUT');try{return await config.transport(method,freeze(params),{signal:controller.signal});}catch{throw new ObservationError('RPC_UNAVAILABLE');}};
  const network=async()=>{need(rpcQuantity(await call('eth_chainId',[]),64).toString()===asset.chainId,'CHAIN_ID_MISMATCH');const g=normalizeEvmBlock(await call('eth_getBlockByNumber',['0x0',false]));need(g.height==='0'&&g.hash===asset.genesisHash,'GENESIS_MISMATCH');};
  const read=async()=>{await network();const block=normalizeEvmBlock(await call('eth_getBlockByNumber',['finalized',false])),selector={blockHash:block.hash,requireCanonical:true};
   const code=await call('eth_getCode',[asset.token,selector]);need(typeof code==='string'&&/^0x(?:[0-9a-f]{2})+$/.test(code)&&code.length<=131074,'ERC20_CODE_UNAVAILABLE');need(sha(Buffer.from(code.slice(2),'hex'))===asset.runtimeCodeSHA256,'ERC20_CODE_CHANGED');
   const wire=await call('eth_call',[{to:asset.token,data:'0x70a08231'+'0'.repeat(24)+request.address.slice(2)},selector]);need(typeof wire==='string'&&/^0x[0-9a-f]{64}$/.test(wire),'ERC20_BALANCE_ABI');const balanceAtomic=BigInt(wire).toString();
   need(await call('eth_getCode',[asset.token,selector])===code,'ERC20_CODE_CHANGED');const repeated=normalizeEvmBlock(await call('eth_getBlockByNumber',['0x'+BigInt(block.height).toString(16),false]));need(JSON.stringify(block)===JSON.stringify(repeated),'BLOCK_CHANGED','reorged');
   const final=normalizeEvmBlock(await call('eth_getBlockByNumber',['finalized',false]));need(BigInt(final.height)>=BigInt(block.height),'FINALITY_REGRESSED','reorged');if(final.height===block.height)need(JSON.stringify(final)===JSON.stringify(block),'BLOCK_CHANGED','reorged');await network();return {block,balanceAtomic};};
  try{const observed=await Promise.race([read(),new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new ObservationError('QUERY_TIMEOUT'));},config.freshness.maxQueryMs);})]);const at=safeMilliseconds(config.now());need(at>=started,'CLOCK_REGRESSED');need(at-started<config.freshness.maxQueryMs,'QUERY_TIMEOUT');checkFreshBlock(observed.block,at,config.freshness);return result(request,asset,at,'fresh',null,observed);
  }catch(error){return result(request,asset,safeMilliseconds(config.now()),error instanceof ObservationError?error.status:'unknown',error instanceof ObservationError?error.code:'MALFORMED_RESPONSE');}finally{clearTimeout(timer);controller.abort();}
 }});
}
