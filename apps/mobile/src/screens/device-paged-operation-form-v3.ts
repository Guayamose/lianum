import {pagedBitcoinRecipientDataValidV4} from '../custody/paged-bitcoin-recipient-data-v4.mjs';
import {DEVICE_PAGED_PAYMENT_BUFFER_LIMIT_V3} from '@lianum/mobile-protocol/device/paged-payment-list-v3';
export type PagedNativeNetworkV3={family:'EVM'|'BTC'|'SOL';networkId?:'ethereum-sepolia'|'bitcoin-testnet'|'solana-devnet';label:string;chainDomain:string;evidencePolicy:string;assetSymbol:string;decimals:number;destinations?:Array<{id:string;address:string;label:string}>};
// Existing local demo policy, not a price quote or a conversion from native
// currency. The original Vault derives and validates dates from chain time.
export const PAGED_GUIDED_DEFAULTS_V3=Object.freeze({reservePerPayment:'100',reservationMinutes:'60',executionMinutes:'120'});
/** Input defaults from the original provider network configuration only.
 * No new terms/grant: custom fields and existing operations retain their values. */
export function pagedGuidedDefaultsV4(configuration:any,payments?:readonly {intent?:unknown}[]){
 const bitcoin=pagedNativeNetworksV3(configuration).some(network=>network.networkId==='bitcoin-testnet'&&network.family==='BTC');
 return bitcoin&&(payments===undefined||payments.some(payment=>{const intent=payment.intent;return !!intent&&typeof intent==='object'&&'family' in intent&&intent.family==='BTC';}))?{...PAGED_GUIDED_DEFAULTS_V3,executionMinutes:'360'}:PAGED_GUIDED_DEFAULTS_V3;
}
/** Input hint only; the original Vault checks the descriptor again at prepare. */
export function pagedDepositAmountValidV3(value:string,minimumAtomic:unknown):boolean{
 if(!/^[1-9][0-9]{0,19}$/.test(value)||BigInt(value)>=(1n<<64n))return false;
 if(minimumAtomic===undefined)return true;
 return typeof minimumAtomic==='string'&&/^[1-9][0-9]{0,19}$/.test(minimumAtomic)
  &&BigInt(minimumAtomic)<(1n<<64n)&&BigInt(value)>=BigInt(minimumAtomic);
}
export type PagedNativePaymentDraftV3={id:string;amount:string;dependsOn:string[];intent:{family:'EVM'|'BTC'|'SOL';recipient:string;amount:string}};

export function pagedPaymentBudgetV3(payments:readonly {amount:string}[]):string{
 if(payments.length===0)throw Error('MOBILE_PAGED_STEP_ID');
 if(payments.length>DEVICE_PAGED_PAYMENT_BUFFER_LIMIT_V3)throw Error('MOBILE_PAGED_PAYMENT_LIST_CAPACITY');
 const total=payments.reduce((sum,payment)=>{if(!/^[1-9][0-9]{0,19}$/.test(payment.amount))throw Error('MOBILE_PAGED_STEP_AMOUNT');return sum+BigInt(payment.amount);},0n);
 if(total>=(1n<<64n))throw Error('MOBILE_PAGED_STEP_BUDGET');
 return total.toString();
}

export function pagedNativePaymentDraftV3(configuration:any,fields:{family:'EVM'|'BTC'|'SOL';recipient:string;amount:string;knownIds:readonly string[];id?:string;reserve?:string;dependsOn?:readonly string[]}):PagedNativePaymentDraftV3{
 const network=pagedNativeNetworksV3(configuration).find(row=>row.family===fields.family);
 if(!network)throw Error('MOBILE_PAGED_NATIVE_PROVIDER_REQUIRED');
 const knownIds=new Set(fields.knownIds),prefix=fields.family==='EVM'?'ethereum':fields.family==='BTC'?'bitcoin':'solana';let id=fields.id?.trim()||prefix;
 if(!fields.id?.trim()){let suffix=2;while(knownIds.has(id))id=prefix+suffix++;}
 if(!/^[A-Za-z][A-Za-z0-9_.-]{0,79}$/.test(id)||knownIds.has(id))throw Error('MOBILE_PAGED_STEP_ID');
 const reserve=fields.reserve?.trim()??PAGED_GUIDED_DEFAULTS_V3.reservePerPayment;
 pagedPaymentBudgetV3([{amount:reserve}]);
 const dependsOn=fields.dependsOn?[...fields.dependsOn]:fields.knownIds.length?[fields.knownIds.at(-1)!]:[];
 if(new Set(dependsOn).size!==dependsOn.length||dependsOn.some(previous=>!knownIds.has(previous)))throw Error('MOBILE_PAGED_STEP_ID');
 return{id,amount:reserve,dependsOn,intent:{family:network.family,recipient:pagedNativeRecipientV3(network.family,fields.recipient),amount:pagedNativeAmountV3(fields.amount,network.decimals)}};
}

export function pagedNativeNetworksV3(configuration:any):PagedNativeNetworkV3[]{
 if(!configuration)return[];
 if(Array.isArray(configuration.networks))return configuration.networks;
 if(configuration.family==='EVM')return[{...configuration,label:'Ethereum',assetSymbol:'ETH',decimals:18}];
 return[];
}

/** Decimal text is converted exactly. Number/parseFloat would lose money at
 * Ethereum precision, and rounding an excessive fraction is never allowed. */
export function pagedNativeAmountV3(value:string,decimals:number):string{
 const input=value.trim().replace(',','.');
 if(!Number.isSafeInteger(decimals)||decimals<0||decimals>18||!/^\d+(?:\.\d+)?$/.test(input))throw Error('MOBILE_PAGED_NATIVE_AMOUNT');
 const [whole,fraction='']=input.split('.');
 if(fraction.length>decimals)throw Error('MOBILE_PAGED_NATIVE_AMOUNT');
 const amount=BigInt(whole)*10n**BigInt(decimals)+BigInt((fraction+'0'.repeat(decimals)).slice(0,decimals)||'0');
 if(amount<=0n||amount>=(1n<<128n))throw Error('MOBILE_PAGED_NATIVE_AMOUNT');
 return amount.toString();
}

export function pagedNativeRecipientV3(family:'EVM'|'BTC'|'SOL',value:string):string{
 const address=value.trim();
 const valid=family==='EVM'?/^0x[0-9a-fA-F]{40}$/.test(address)&&address.toLowerCase()!=='0x'+'0'.repeat(40):family==='BTC'?pagedBitcoinRecipientDataValidV4(address):/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
 if(!valid)throw Error('MOBILE_PAGED_STEP_DESTINATION');
 return family==='EVM'?address.toLowerCase():address;
}

export function pagedNativeDisplayAmountV3(value:string,decimals:number):string{
 if(!/^\d+$/.test(value)||!Number.isSafeInteger(decimals)||decimals<0||decimals>18)return value;
 if(decimals===0)return value;
 const digits=value.padStart(decimals+1,'0'),fraction=digits.slice(-decimals).replace(/0+$/,'');
 return digits.slice(0,-decimals)+(fraction?'.'+fraction:'');
}

/** Presentation DATA only: a service is never an asset, and the technical
 * demo reserve never supplies an unknown native payment amount. */
export function pagedPaymentPresentationV3(step:{intent?:any},configuration:any):{title:string;amount:string;network:string;recipient:string;service?:string;maximumInput?:string}{
 const intent=step.intent;
 if(intent?.kind==='UNISWAP_V3_EXACT_OUTPUT_SINGLE'){
  const target=configuration?.uniswap?.configuration,input=configuration?.uniswap?.template?.inputAsset,recipient=configuration?.uniswap?.template?.recipient;
  const symbol=target?.assetSymbol??'token';
  return{title:'Recibir '+symbol,amount:target?pagedNativeDisplayAmountV3(intent.outputAmount,target.decimals)+' '+symbol:intent.outputAmount+' unidades mínimas de token',network:'Ethereum local',recipient:recipient?'0x'+recipient:'Destino del token por consultar',service:'Uniswap local',maximumInput:input?pagedNativeDisplayAmountV3(intent.maximumInput,input.decimals)+' '+input.symbol:intent.maximumInput+' unidades mínimas del activo de entrada'};
 }
 const network=pagedNativeNetworksV3(configuration).find(row=>row.family===intent?.family);
 return network&&intent?{title:'Enviar '+network.assetSymbol,amount:pagedNativeDisplayAmountV3(intent.amount,network.decimals)+' '+network.assetSymbol,network:network.label,recipient:intent.recipient}:{title:'Acción preparada',amount:'Importe de red por consultar',network:'Red por consultar',recipient:''};
}

export function pagedOperationPhaseV3(phase:string):string{
 return({BUILDING:'Preparando tus pagos',SIGNING:'Revisión pendiente',PREPARED:'Lista para autorizar',RESERVED:'Pagos en marcha',FULFILLED:'Pagos completados',RECOVERED:'Fondos recuperados',UNKNOWN:'Resultado por comprobar',REQUIRES_OBSERVATION:'Consultando tus pagos',STALE:'Estado por actualizar',FAILED:'Operación detenida'} as Record<string,string>)[phase]??phase;
}

export function pagedOperationStageV3(stage:string):string{
 if(stage==='observe-recovery')return 'Actualizando la confirmación de la misma operación';
 return({'confirm-reserve':'Confirmando la reserva',dependencies:'Comprobando los pasos anteriores','send-native':'Enviando y comprobando el pago','confirm-admission':'Confirmando el pago','confirm-node':'Guardando el resultado del paso','confirm-fold':'Confirmando avance',settle:'Liquidando la operación','confirm-terminal':'Confirmando la liquidación',recover:'Recuperando los fondos','confirm-withdraw':'Confirmando la retirada',reserve:'Reservando fondos',edge:'Comprobando los pasos anteriores',fold:'Confirmando avance',native:'Enviando a la red',admission:'Confirmando el pago',node:'Guardando el resultado del paso',terminal:'Liquidando la operación',withdraw:'Retirando fondos',PROVE_R:'Preparando la reserva',RESERVE_R:'Reservando fondos',PROVE_EDGE:'Comprobando dependencias',FOLD:'Confirmando avance',EXECUTE_NATIVE:'Enviando y comprobando el pago',PROVE_ADMISSION:'Preparando la confirmación del pago',ADMIT:'Confirmando el pago',PROVE_NODE:'Guardando el resultado del paso',PROVE_T:'Preparando la liquidación',FULFILL:'Liquidando la operación'} as Record<string,string>)[stage]??'Procesando la operación';
}
