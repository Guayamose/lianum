/** Presentation DATA only. A retained native attempt is not current finality,
 * spendable balance, a withdrawal or a signer capability. */
import {normalizeDevicePagedEconomicOperationViewAnyV5 as normalizeDevicePagedEconomicOperationViewV4} from '../../../../packages/mobile-protocol/src/device-paged-economic-operation-v4.mjs';

/** Presentation DATA only. Family, an address prefix and a testnet offer
 * classification do not identify the network. Use the original configured
 * networkId only when its family and chainDomain match the observed row. */
export function devicePagedNativeCostPresentationDataV4(native,configuration){
 const names={EVM:'Ethereum',BTC:'Bitcoin',SOL:'Solana',UNISWAP:'Uniswap',AAVE:'Aave · Sepolia',MORPHO:'Morpho · Sepolia'},units={EVM:'wei',BTC:'satoshi',SOL:'lamport',UNISWAP:'wei',AAVE:'wei',MORPHO:'wei'},ids={EVM:{'ethereum-sepolia':'Ethereum · Sepolia','ethereum-mainnet':'Ethereum · red principal'},BTC:{'bitcoin-testnet':'Bitcoin · testnet','bitcoin-mainnet':'Bitcoin · red principal'},SOL:{'solana-devnet':'Solana · devnet','solana-mainnet':'Solana · red principal'}};
 const family=native?.family,matching=Array.isArray(configuration?.networks)?configuration.networks.filter(row=>row?.family===family&&row.chainDomain===native.chainDomain):[];
 const network=matching.length===1&&ids[family]?.[matching[0].networkId]||names[family]||'Red por consultar',fee=native?.fee;
 const confirmed=fee?.status==='OBSERVED'&&fee.unit===units[family]&&typeof fee.amount==='string'&&/^[1-9][0-9]{0,77}$/.test(fee.amount)&&typeof fee.asset==='string'&&/^[0-9a-f]{64}$/.test(fee.asset);
 return Object.freeze({network,fee:confirmed?fee.amount+' '+fee.unit+' · activo '+fee.asset.slice(0,12)+'…':'sin dato confirmado'});
}
export function devicePagedEconomicOperationDisplayV4(raw,descriptor){
 const view=normalizeDevicePagedEconomicOperationViewV4(raw,descriptor);
 const count=rows=>Object.freeze({total:rows.length,retained:rows.filter(row=>row.attempt.stage==='MINED').length,uncertain:rows.filter(row=>['KEY_PENDING','SIGNED'].includes(row.attempt.stage)).length});
 const native=view.rows.filter(row=>row.quote!==null&&!['UNISWAP','AAVE','MORPHO'].includes(row.quote.terms.deliver.family)),services=view.rows.filter(row=>['UNISWAP','AAVE','MORPHO'].includes(row.quote?.terms.deliver.family)),unclassified=view.rows.filter(row=>row.quote===null).length;
 const disposition={NOT_RESERVED:'Presupuesto aún no reservado',RESERVED:'Presupuesto reservado',PROVIDER_NOTES_ISSUED:'Salidas para el proveedor emitidas',OWNER_RECOVERY_NOTE_ISSUED:'Salida de recuperación emitida'}[view.settlement.budgetDisposition];
 const result={PENDING:'Operación pendiente',FULL:'Operación finalizada',PARTIAL:'Operación parcial',TIMEOUT:'Plazo agotado',RECOVERED_WITH_UNCERTAIN_DELIVERIES:'Recuperación con envíos por comprobar'}[view.settlement.outcome];
 return Object.freeze({result,disposition,budget:view.budget,native:count(native),services:count(services),unclassified,pending:view.pending,available:null,requiresNativeRefresh:true,recoveryIssued:view.settlement.budgetDisposition==='OWNER_RECOVERY_NOTE_ISSUED'});
}
