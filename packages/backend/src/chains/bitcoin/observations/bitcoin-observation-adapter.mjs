/** Read-only existing watch-wallet view. No import, scan, create, signing or send.
 * Coverage is explicitly declared by bootstrap, then checked against node state.
 * Confirmations are a policy, not deterministic finality. Immature coinbase is excluded. */
import {types} from 'node:util';
import {fields,need,freeze,hash32,unsignedDecimal,observationBootstrap,definePortfolioAdapter} from '../../shared/portfolio/portfolio-registry.mjs';
import {bitcoinWatchAddress} from '../../shared/observations/observation-addresses.mjs';
const MAX_MONEY = 21000000n * 100000000n;
function array(raw,limit) {
  need(Array.isArray(raw)&&!types.isProxy(raw)&&raw.length<=limit&&Reflect.ownKeys(raw).length===raw.length+1,'BITCOIN_ARRAY');
  return Array.from({length:raw.length},(_,i)=>{const d=Object.getOwnPropertyDescriptor(raw,String(i));need(d?.enumerable&&Object.hasOwn(d,'value'),'BITCOIN_ARRAY');return d.value;});
}
function sats(raw) {
  need(typeof raw==='string'&&/^(0|[1-9][0-9]{0,7})(?:\.[0-9]{1,8})?$/.test(raw),'BITCOIN_AMOUNT');
  const [whole,fraction='']=raw.split('.'),value=BigInt(whole)*100000000n+BigInt(fraction.padEnd(8,'0'));
  need(value<=MAX_MONEY,'BITCOIN_AMOUNT');return value;
}
export function bitcoinWatchPolicy(raw) {
  const value=fields(raw,['addresses','coverage','minimumConfirmations'],[],true);
  need(value.coverage==='COMPLETE_FROM_GENESIS','BITCOIN_WATCH_COVERAGE_REQUIRED');
  need(Number.isSafeInteger(value.minimumConfirmations)&&value.minimumConfirmations>=1&&value.minimumConfirmations<=100,'BITCOIN_CONFIRMATION_POLICY');
  const addresses=array(value.addresses,16).map(bitcoinWatchAddress);
  need(addresses.length>0&&new Set(addresses).size===addresses.length,'BITCOIN_WATCH_ADDRESSES');
  return freeze({...value,addresses});
}
export function createBitcoinObservationAdapter(raw) {
  const input=fields(raw,['chain','genesisHash','transport','watch'],['now','freshness'],true);
  const {watch:declared,...bootstrap}=input,watch=bitcoinWatchPolicy(declared),base=observationBootstrap(bootstrap,'bitcoin');
  const config=Object.freeze({...base,descriptor:freeze({...base.descriptor,finality:{...base.descriptor.finality,minimumConfirmations:watch.minimumConfirmations,watchCoverage:'BOOTSTRAP_OPERATOR_ASSERTION_NOT_VERIFIED'}})});
  return definePortfolioAdapter(config,async({request,call})=>{
    need(watch.addresses.includes(request.address),'BITCOIN_ADDRESS_NOT_REGISTERED');
    const genesis=await call('getblockhash',[0]);need(genesis===config.genesisHash,'GENESIS_MISMATCH');
    const tip=hash32(await call('getbestblockhash',[]),false);
    const header=fields(await call('getblockheader',[tip,true]),['hash','height','time','confirmations'],['previousblockhash']);
    need(header.hash===tip&&unsignedDecimal(header.confirmations,64)>0n,'BITCOIN_HEADER');
    const height=unsignedDecimal(header.height,64);if(height>0n)hash32(header.previousblockhash,false);
    const timestampMs=(unsignedDecimal(header.time,64)*1000n).toString();
    const chainInfo=fields(await call('getblockchaininfo',[]),['bestblockhash','blocks','initialblockdownload']);
    need(chainInfo.bestblockhash===tip&&unsignedDecimal(chainInfo.blocks,64)===height&&chainInfo.initialblockdownload===false,'BITCOIN_NODE_NOT_SYNCED');
    const wallet=async()=>{
      const info=fields(await call('getwalletinfo',[]),['private_keys_enabled','descriptors','scanning','lastprocessedblock']);
      need(info.private_keys_enabled===false&&info.descriptors===true&&info.scanning===false,'BITCOIN_WATCH_WALLET_UNREADY');
      const last=fields(info.lastprocessedblock,['hash','height']);
      need(last.hash===tip&&unsignedDecimal(last.height,64)===height,'BITCOIN_WATCH_BEHIND');
      need(array(await call('listlockunspent',[]),256).length===0,'BITCOIN_LOCKED_COVERAGE_UNKNOWN');
    };
    await wallet();
    const owner=fields(await call('getaddressinfo',[request.address]),['address','ismine','scriptPubKey']);
    need(owner.address===request.address&&owner.ismine===true&&typeof owner.scriptPubKey==='string'&&/^(?:[0-9a-f]{2}){1,10000}$/.test(owner.scriptPubKey),'BITCOIN_WATCH_ADDRESS_UNKNOWN');
    const read=async()=>{
      // A sentinel extra result reveals truncation; never return a partial sum.
      const rows=array(await call('listunspent',[0,9999999,[request.address],true,{maximumCount:257,include_immature_coinbase:false}]),257);
      need(rows.length<=256,'BITCOIN_UTXO_LIMIT');const seen=new Set();let confirmed=0n,pending=0n;
      const projection=[];
      for(const raw of rows){const row=fields(raw,['txid','vout','address','scriptPubKey','amount','confirmations','safe']);
        hash32(row.txid,false);const vout=unsignedDecimal(row.vout,32),confirmations=unsignedDecimal(row.confirmations,64),amount=sats(row.amount);
        need(row.address===request.address&&row.scriptPubKey===owner.scriptPubKey&&typeof row.safe==='boolean','BITCOIN_UTXO_IDENTITY');
        const key=row.txid+':'+vout;need(!seen.has(key),'BITCOIN_DUPLICATE_UTXO');seen.add(key);
        if(confirmations>=BigInt(watch.minimumConfirmations)&&row.safe)confirmed+=amount;else pending+=amount;
        need(confirmed+pending<=MAX_MONEY,'BITCOIN_AMOUNT');projection.push([key,amount.toString(),confirmations.toString(),row.safe]);
      }
      projection.sort((a,b)=>a[0].localeCompare(b[0]));return {confirmed,pending,projection};
    };
    const first=await read(),second=await read();
    need(JSON.stringify(first.projection)===JSON.stringify(second.projection),'BITCOIN_UTXO_SET_CHANGED','reorged');
    await wallet();need(await call('getbestblockhash',[])===tip,'BLOCK_CHANGED','reorged');
    need(await call('getblockhash',[0])===genesis,'GENESIS_MISMATCH');
    return {balanceAtomic:first.confirmed.toString(),pendingBalanceAtomic:first.pending.toString(),block:{height:height.toString(),hash:tip,parentHash:header.previousblockhash??null,timestampMs}};
  });
}
