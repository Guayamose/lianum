import type {PrivateWalletStateV1} from '../state/private-wallet-state-v1.mjs';
export type PrivateWalletOverviewV32={hasConnections:boolean;unconfirmed:boolean;pending:readonly {key:string;title:string;state:string}[]};
/** Presentation only, from the existing authenticated read actor. No RPC or money aggregation. */
export function privateWalletOverviewV32(snapshot:PrivateWalletStateV1|null,network:'mainnet'|'testnet',hasConnections:boolean):PrivateWalletOverviewV32|null{
 if(network!=='testnet'||!hasConnections&&!snapshot?.rows.length)return null;
 const rows=new Map<string,{key:string;title:string;state:string}>();
 for(const row of snapshot?.rows??[])for(const request of row.requests){
  if(['CONFIRMED','FINALIZED','FULFILLED','RECOVERED','CANCELLED','REJECTED','REVERTED'].includes(request.state))continue;
  const key=JSON.stringify([row.route.origin,row.route.pairingId,request.requestId]);
  if(!rows.has(key))rows.set(key,{key,title:/WITHDRAW/.test(request.kind)?'Retirada':/DEPOSIT|FUND/.test(request.kind)?'Ingreso':request.kind==='PAGED_GRAPH'?'Plan de pagos':'Operación',state:request.state==='UNKNOWN'?'Resultado pendiente':request.state==='FAILED'?'Requiere revisión':row.state!=='LIVE'?'Último estado conocido':'Pendiente'});
 }
 return{hasConnections:hasConnections||!!snapshot?.rows.length,unconfirmed:!snapshot?.coverage.complete||!!snapshot.rows.some(row=>row.state!=='LIVE'),pending:[...rows.values()]};
}
