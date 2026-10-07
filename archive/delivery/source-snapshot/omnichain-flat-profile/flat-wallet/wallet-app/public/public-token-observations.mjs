/** Read-only public token schema shared by browser and Node wallet consumers.
 * No aggregation with private-note balances or ERC4626 underlying estimates. */
const need=v=>{if(!v)throw Error('WALLET_PUBLIC_TOKEN_CONTRACT');};
const object=v=>v&&Object.getPrototypeOf(v)===Object.prototype;
const h=v=>typeof v==='string'&&/^[0-9a-f]{64}$/.test(v);
const address=v=>typeof v==='string'&&/^0x[0-9a-f]{40}$/.test(v);
const integer=v=>typeof v==='string'&&/^(0|[1-9][0-9]{0,77})$/.test(v)&&BigInt(v)<(1n<<256n);
export function validatePublicTokenObservations(networks){
 if(networks===undefined||networks===null)return true;
 if(networks.observation==='TRUSTED_RPC_NATIVE_HOLDINGS_ONLY'){need(networks.tokens===undefined);return true;}
 need(networks.observation==='TRUSTED_RPC_PUBLIC_HOLDINGS_ONLY'&&Array.isArray(networks.tokens)&&networks.tokens.length<=16);
 const chainIds={ethereum:'1',base:'8453',arbitrum:'42161',bnb:'56'};need(Array.isArray(networks.chains));const ids=new Set();for(const row of networks.tokens){need(object(row)&&row.schema==='flat-erc20-observation/1'&&row.query==='erc20-balance'&&row.creditEligible===false&&row.privateSpendableAtomic===null&&row.assurance==='trusted-rpc-observation');
  const a=row.asset;need(object(a)&&a.profile==='EXPLICIT_ERC20_OBSERVATION_ASSET_V1'&&a.chain===row.chain&&['ethereum','base','arbitrum','bnb'].includes(a.chain)&&address(a.token)&&address(row.address)&&h(a.runtimeCodeSHA256)&&a.codeHashAlgorithm==='SHA256'&&h(a.observationAssetId));
  need(typeof a.symbol==='string'&&/^[A-Za-z0-9._-]{1,16}$/.test(a.symbol)&&Number.isSafeInteger(a.decimals)&&a.decimals>=0&&a.decimals<=36&&a.metadataSource==='PRIVATE_BOOTSTRAP'&&a.implementationVerified===false);const unique=a.chain+':'+a.token;need(!ids.has(unique));ids.add(unique);need(Array.isArray(networks.observations)&&networks.observations.some(n=>n.chain===row.chain&&n.address===row.address));
  need(a.chainId===chainIds[a.chain]&&typeof a.genesisHash==='string'&&/^0x[0-9a-f]{64}$/.test(a.genesisHash));const configured=networks.chains.find(n=>n.chain===row.chain);need(configured&&configured.configured===true&&configured.network?.chainId===a.chainId&&configured.network?.genesisHash===a.genesisHash);
  need(object(row.network)&&row.network.family==='evm'&&row.network.chain===row.chain&&row.network.chainId===a.chainId&&row.network.genesisHash===a.genesisHash&&row.network.finality?.independentConsensusVerified===false);
  need(['fresh','stale','unknown','reorged'].includes(row.status)&&integer(row.observedAtMs));
  if(row.status==='fresh'){need(row.reason===null&&row.codeIdentityObserved===true&&integer(row.balanceAtomic)&&integer(row.validUntilMs)&&object(row.block)&&integer(row.block.height)&&integer(row.block.timestampMs)&&typeof row.block.hash==='string'&&/^0x[0-9a-f]{64}$/.test(row.block.hash)&&BigInt(row.validUntilMs)>BigInt(row.observedAtMs));}
  else need(row.balanceAtomic===null&&row.block===null&&row.validUntilMs===null&&row.codeIdentityObserved===false&&typeof row.reason==='string');
 }return true;
}
export function projectPublicTokenObservations(networks,chain,{stale=false,now=Date.now()}={}){
 need(Number.isSafeInteger(now)&&now>=0);validatePublicTokenObservations(networks);return (networks?.tokens??[]).filter(row=>row.chain===chain).map(row=>{
  const expired=row.validUntilMs!==null&&BigInt(Math.floor(now))>=BigInt(row.validUntilMs),current=row.status==='fresh'&&!stale&&!expired;
  return {id:row.asset.observationAssetId,token:row.asset.token,symbol:row.asset.symbol,decimals:row.asset.decimals,status:stale||expired?'stale':row.status,amount:current?row.balanceAtomic:null,block:current?row.block.height:null,reason:expired?'OBSERVATION_EXPIRED':row.reason,privateSpendable:false,creditEligible:false};
 });
}
