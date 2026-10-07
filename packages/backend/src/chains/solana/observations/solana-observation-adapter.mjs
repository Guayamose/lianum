/** Finalized native SOL display observation. No SPL/position or consensus claim. */
import {fields,need,unsignedDecimal,observationBootstrap,definePortfolioAdapter} from '../../shared/portfolio/portfolio-registry.mjs';
import {solanaPublicKey} from '../../shared/observations/observation-addresses.mjs';
const integer = value => {
  const result = unsignedDecimal(value,64);
  need(result <= BigInt(Number.MAX_SAFE_INTEGER),'SOLANA_SLOT_RANGE');
  return Number(result);
};
function block(raw,slot) {
  const value = fields(raw,['blockhash','previousBlockhash','blockTime']);
  solanaPublicKey(value.blockhash);solanaPublicKey(value.previousBlockhash);
  return {height:String(slot),hash:value.blockhash,parentHash:value.previousBlockhash,
    timestampMs:(unsignedDecimal(value.blockTime,64)*1000n).toString()};
}
export function createSolanaObservationAdapter(raw) {
  const config = observationBootstrap(raw,'solana');
  return definePortfolioAdapter(config,async ({request,call}) => {
    const genesis = await call('getGenesisHash',[]);
    need(genesis === config.genesisHash,'GENESIS_MISMATCH');
    const minimumSlot = integer(await call('getSlot',[{commitment:'finalized'}]));
    const response = fields(await call('getBalance',[request.address,{commitment:'finalized',minContextSlot:minimumSlot}]),['context','value']);
    const slot = integer(fields(response.context,['slot']).slot);
    need(slot >= minimumSlot,'SOLANA_CONTEXT_REGRESSED','reorged');
    const balanceAtomic = unsignedDecimal(response.value,64).toString();
    const params = [slot,{commitment:'finalized',transactionDetails:'none',rewards:false,maxSupportedTransactionVersion:0}];
    const observed = block(await call('getBlock',params),slot);
    const repeated = block(await call('getBlock',params),slot);
    need(JSON.stringify(observed) === JSON.stringify(repeated),'BLOCK_CHANGED','reorged');
    need(integer(await call('getSlot',[{commitment:'finalized'}])) >= slot,'FINALITY_REGRESSED','reorged');
    need(await call('getGenesisHash',[]) === genesis,'GENESIS_MISMATCH');
    return {balanceAtomic,block:observed};
  });
}
