import {normalizeAgentContextV1,type AgentContextV1} from '@lianum/mobile-protocol/agent/chat-v1';
import {portfolioOverviewV1,pendingTransfersV1} from '../portfolio/portfolio-model-v1.ts';
import type {WalletOverviewData} from '../components/UnifiedWalletOverview';
import type {MarketSnapshot,DisplayCurrency} from '../portfolio/market-data-v1';
/** The server receives aggregates, never account addresses, keys, public
 * connection credentials or the transaction recipient/history objects. */
export function agentContextV1(data:WalletOverviewData,market:MarketSnapshot|null,currency:DisplayCurrency):AgentContextV1{
 const p=portfolioOverviewV1(data.accounts,data.balances,market,currency,data.network??'mainnet'),amount=(n:bigint|null)=>n===null?null:n.toString(),plan=data.planActivity;
 return normalizeAgentContextV1({network:data.network??'mainnet',currency,observedAt:data.observedAt,marketObservedAt:market?.observedAt??null,reading:data.reading,totals:{total:amount(p.total),available:amount(p.available),reserved:amount(p.reserved),occupied:amount(p.occupied)},assets:p.rows.map(row=>({symbol:row.asset.symbol,total:amount(row.total),available:amount(row.available),reserved:amount(row.reserved),occupied:amount(row.occupied)})),operations:{pendingTransfers:pendingTransfersV1(data.transactions).length,plan:plan?{state:plan.state,completed:plan.completed,total:plan.total}:null}});
}
