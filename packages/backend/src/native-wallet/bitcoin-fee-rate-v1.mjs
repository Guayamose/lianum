import {nativeEsploraV1} from './http-v1.mjs';
import {need,signalCurrent} from './common-v1.mjs';

// Only public, explicit Mempool routes have this second fee source. Account,
// UTXO, proof and broadcast routes stay on the caller's configured provider.
const fallbacks=new Map([
 ['https://mempool.space/testnet/api',{id:'bitcoin-testnet',endpoint:'https://blockstream.info/testnet/api'}],
 ['https://mempool.space/api',{id:'bitcoin-mainnet',endpoint:'https://blockstream.info/api'}],
]);
const validRate=value=>{need(typeof value==='number'&&Number.isFinite(value)&&value>0&&value<=10000,'BTC_FEE_ESTIMATE');return value;};
const transient=error=>error?.code==='NATIVE_WALLET_HTTP_STATUS'&&[429,502,503,504].includes(error.httpStatus);

/** A fee is advisory until the exact transaction review binds its upper bound.
 * No default/stale fee, changed chain, fallback broadcast or retry loop. */
export async function readBitcoinFeeRateV1(config,signal){
 const api=nativeEsploraV1(config.endpoint),mempool=config.feeProvider==='MEMPOOL';
 try{
  const rates=await api(mempool?'/v1/fees/recommended':'/fee-estimates',{signal});
  return validRate(mempool?rates?.hourFee:rates?.['6']);
 }catch(error){
  signalCurrent(signal);
  const fallback=mempool&&fallbacks.get(config.endpoint.replace(/\/$/,''));
  if(!fallback||fallback.id!==config.network.id||!transient(error))throw error;
  const alternate=nativeEsploraV1(fallback.endpoint);
  need(await alternate('/block-height/0',{signal,text:true})===config.network.genesisHash,'NETWORK_IDENTITY');
  return validRate((await alternate('/fee-estimates',{signal}))?.['6']);
 }
}
