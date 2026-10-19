import {formatFiatV1,pendingTransfersV1,portfolioOverviewV1} from '../portfolio/portfolio-model-v1.ts';
import type {DisplayCurrency,MarketSnapshot} from '../portfolio/market-data-v1';
import type {WalletOverviewData} from '../components/UnifiedWalletOverview';

export type AgentActionV1='wallet'|'operations'|'permissions'|'plan'|'approvals';
export type AgentReplyV1={text:string;facts?:{label:string;value:string}[];checks?:{label:string;complete:boolean}[];action?:{label:string;target:AgentActionV1}};
export type AgentMessageV1=AgentReplyV1&{id:number;role:'you'|'agent';proposalLink?:string};
export const agentPromptsV1=[
 {label:'Resume mi cartera',text:'Resume mi cartera',icon:'wallet'},
 {label:'Preparar un plan',text:'Quiero preparar un plan',icon:'swap'},
 {label:'Explica tus permisos',text:'¿Qué permisos y límites tienes?',icon:'shield'},
] as const;

/** Finite local queries of observed wallet DATA. No model, signer, remote
 * permission lookup, generated allocation or execution is represented here. */
export function localAgentReplyV1(text:string,data:WalletOverviewData,market:MarketSnapshot|null,currency:DisplayCurrency):AgentReplyV1{
 if(/permiso|autoriz|segur|l[ií]mite|permission|scope/i.test(text))return {
  text:'Este chat puede resumir los datos disponibles de tu cartera. Escribir aquí no autoriza movimientos. Los planes y los cambios de permisos se revisan en sus propias pantallas.',
  checks:[{label:'Consulta local sin firma ni envío de fondos',complete:true}],
  action:{label:'Ver permisos y límites',target:'permissions'},
 };
 if(/plan|estrateg|asign|rebalanc|invert|invierte|env[ií][aá]|transfiere|compr[ae]|vend[ae]|swap|allocat/i.test(text))return {
  text:'Puedes preparar un plan indicando su presupuesto, destinatarios y condiciones. La preparación te mostrará los datos que debes revisar antes de autorizar. Este chat todavía no genera ni ejecuta planes.',
  action:{label:'Preparar un plan',target:'plan'},
 };
 if(/aprobaci|propuesta|approval|proposal/i.test(text))return {
  text:'En Aprobaciones puedes abrir las propuestas recibidas y revisar sus condiciones. El chat no ha consultado un buzón remoto de solicitudes.',
  action:{label:'Abrir aprobaciones',target:'approvals'},
 };
 if(/operaci[oó]n|operaciones|env[ií]o|movimiento|pendiente|transaction/i.test(text)){
  const pending=pendingTransfersV1(data.transactions),plan=data.planActivity,activePlan=plan&&plan.state!=='complete';
  return {
   text:pending.length?`En el registro de esta cartera hay ${pending.length===1?'un envío pendiente':pending.length+' envíos pendientes'}. Abre su detalle para consultar el resultado con el mismo identificador.`:activePlan?'Hay un plan pendiente de completar en el registro disponible. Puedes consultar sus pasos en Operaciones.':'En el registro disponible no aparecen envíos pendientes.',
   facts:[{label:'Envíos por confirmar',value:String(pending.length)},...(activePlan?[{label:'Pasos del plan confirmados',value:`${plan.completed} de ${plan.total}`}]:[])],
   checks:[{label:'Registro local de movimientos consultado',complete:true}],
   action:{label:'Ver operaciones',target:'operations'},
  };
 }
 if(/saldo|cartera|patrimonio|resum|balance|treasury|disponible|liquidez/i.test(text)){
  const p=portfolioOverviewV1(data.accounts,data.balances,market,currency,data.network??'mainnet');
  return p.complete?{
   text:'Este es el último resumen observado de tu cartera. La valoración usa cotizaciones indicativas; consulta la cartera para comprobar sus datos más recientes.',
   facts:[{label:'Patrimonio total',value:formatFiatV1(p.total,currency)},{label:'Disponible',value:formatFiatV1(p.available,currency)},{label:'Reservado',value:formatFiatV1(p.reserved,currency)},{label:'En operaciones',value:formatFiatV1(p.occupied,currency)}],
   checks:[{label:'Saldos de las cuentas principales disponibles',complete:true},{label:'Valoración indicativa de mercado calculada',complete:true}],
   action:{label:'Abrir cartera',target:'wallet'},
  }:{
   text:'Falta confirmar algún saldo o cotización para mostrar un resumen completo. Los importes desconocidos no se cuentan como cero. Puedes abrir la cartera mientras termina la actualización.',
   checks:[{label:'Saldos y cotizaciones completos',complete:false}],
   action:{label:'Abrir cartera',target:'wallet'},
  };
 }
 return {text:'Puedo resumir tu cartera, mostrar los movimientos registrados o explicar los permisos. También puedes abrir la preparación de un plan para revisar sus condiciones. Esta conversación usa consultas locales; todavía no está conectada al agente con IA.'};
}
export function appendAgentExchangeV1(messages:readonly AgentMessageV1[],raw:string,reply:AgentReplyV1):AgentMessageV1[]{
 const text=raw.trim();if(!text||text.length>2000)return [...messages];
 const id=(messages.at(-1)?.id??0)+1;
 return [...messages,{id,role:'you' as const,text},{...reply,id:id+1,role:'agent' as const}].slice(-40);
}
