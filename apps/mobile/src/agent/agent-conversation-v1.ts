import {formatFiatV1,pendingTransfersV1,portfolioOverviewV1} from '../portfolio/portfolio-model-v1.ts';
import type {DisplayCurrency,MarketSnapshot} from '../portfolio/market-data-v1';
import type {WalletOverviewData} from '../components/UnifiedWalletOverview';

export type AgentActionV1='wallet'|'operations'|'permissions'|'plan'|'approvals';
export type AgentReplyV1={text:string;facts?:{label:string;value:string}[];checks?:{label:string;complete:boolean}[];action?:{label:string;target:AgentActionV1}};
export type AgentMessageV1=AgentReplyV1&{id:number;role:'you'|'agent';proposalLink?:string};
export const agentPromptsV1=[
 {label:"Summarize my wallet",text:"Summarize my wallet",icon:'wallet'},
 {label:"Prepare a plan",text:"I want to prepare a plan.",icon:'swap'},
 {label:"Explain your permissions",text:"What permissions and limits do you have?",icon:'shield'},
] as const;

/** Finite local queries of observed wallet DATA. No model, signer, remote
 * permission lookup, generated allocation or execution is represented here. */
export function localAgentReplyV1(text:string,data:WalletOverviewData,market:MarketSnapshot|null,currency:DisplayCurrency):AgentReplyV1{
 if(/permiso|autoriz|segur|l[ií]mite|permission|scope/i.test(text))return {
  text:"This chat can summarize the wallet data available on this device. Sending a message does not authorize a transfer. Review plans and permission changes on their dedicated screens.",
  checks:[{label:"Local lookup without signing or moving funds",complete:true}],
  action:{label:"View permissions and limits",target:'permissions'},
 };
 if(/plan|estrateg|asign|rebalanc|invert|invierte|env[ií][aá]|transfiere|compr[ae]|vend[ae]|swap|allocat|invest|send|transfer|buy|sell/i.test(text))return {
  text:"Set a budget, recipients and conditions to prepare a plan. You will review the exact terms before authorizing it. This local chat does not create or execute plans.",
  action:{label:"Prepare a plan",target:'plan'},
 };
 if(/aprobaci|propuesta|approval|proposal/i.test(text))return {
  text:"Open Approvals to review received proposals and their terms. This local chat has not checked your remote inbox.",
  action:{label:"Open Approvals",target:'approvals'},
 };
 if(/operaci[oó]n|operaciones|env[ií]o|movimiento|pendiente|transaction|operation|pending|activity/i.test(text)){
  const pending=pendingTransfersV1(data.transactions),plan=data.planActivity,activePlan=plan&&plan.state!=='complete';
  return {
   text:pending.length?`This wallet has ${pending.length===1?"one pending transfer":pending.length+" pending transfers"}. Open its details to check the result using the same identifier.`:activePlan?"A saved plan is still in progress. Open Operations to check its steps.":"There are no pending transfers in the available record.",
   facts:[{label:"Unconfirmed transfers",value:String(pending.length)},...(activePlan?[{label:"Confirmed plan steps",value:`${plan.completed} of ${plan.total}`}]:[])],
   checks:[{label:"Local activity checked",complete:true}],
   action:{label:"View operations",target:'operations'},
  };
 }
 if(/saldo|cartera|patrimonio|resum|balance|treasury|disponible|liquidez|wallet|summari|portfolio/i.test(text)){
  const p=portfolioOverviewV1(data.accounts,data.balances,market,currency,data.network??'mainnet');
  return p.complete?{
   text:"Here is the latest observed summary of your wallet. Values use indicative market prices; open your wallet for the latest balances.",
   facts:[{label:"Total balance",value:formatFiatV1(p.total,currency)},{label:"Available",value:formatFiatV1(p.available,currency)},{label:"Reserved",value:formatFiatV1(p.reserved,currency)},{label:"In progress",value:formatFiatV1(p.occupied,currency)},...(p.paused!==null&&p.paused>0n?[{label:"Temporarily unavailable",value:formatFiatV1(p.paused,currency)}]:[])],
   checks:[{label:"Wallet balances available",complete:true},{label:"Indicative market valuation calculated",complete:true}],
   action:{label:"Open Wallet",target:'wallet'},
  }:{
   text:"Some balances or prices are still being checked. Unknown amounts are not counted as zero. You can open your wallet while the update finishes.",
   checks:[{label:"Complete balances and market prices",complete:false}],
   action:{label:"Open Wallet",target:'wallet'},
  };
 }
 return {text:"I can summarize your wallet, show saved activity or explain permissions. You can also prepare a plan to review its terms. This local chat is not connected to the AI agent."};
}
export function appendAgentExchangeV1(messages:readonly AgentMessageV1[],raw:string,reply:AgentReplyV1):AgentMessageV1[]{
 const text=raw.trim();if(!text||text.length>2000)return [...messages];
 const id=(messages.at(-1)?.id??0)+1;
 return [...messages,{id,role:'you' as const,text},{...reply,id:id+1,role:'agent' as const}].slice(-40);
}
