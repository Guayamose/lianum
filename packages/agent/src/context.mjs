/** Bounded reference data for one durable input. Never a wallet capability or
 * a replacement for the provider's session history and managed compaction. */
export const observationExpired=(at,now)=>at===null||at===undefined||at>now+5000||now-at>120000;
export function walletObservation(state,now){
 const network=state.context?.network,link=state.walletLinks?.[network],snapshot=state.backendSnapshot;
 if(state.backendAvailable===true&&link?.enabled===true&&link.expiresAt>now&&snapshot?.context?.network===network){
  return {context:snapshot.context,source:'BACKEND_RPC',refreshError:state.backendRead?.network===network?state.backendRead?.error??null:null};
 }
 return {context:state.context,source:'MOBILE_OBSERVATION',refreshError:state.backendRead?.network===network?state.backendRead?.error??null:null};
}
export function observationReference(context,now){
 const network=context?.network??null;
 return {network,networkKnown:network!==null,environment:network==='mainnet'?'Principal':network==='testnet'?'Pruebas':null,currency:context?.currency??null,observedAt:context?.observedAt??null,marketObservedAt:context?.marketObservedAt??null,walletStale:observationExpired(context?.observedAt,now)||observationExpired(context?.marketObservedAt,now),operationsStale:observationExpired(context?.observedAt,now)};
}
export function memoryReference(store,owner,maximumBytes=3500,limit=8){
 let bytes=0;const all=store.notes(owner),notes=[];
 for(const note of [...all].sort((a,b)=>b.updatedAt-a.updatedAt||a.key.localeCompare(b.key))){const size=Buffer.byteLength(JSON.stringify(note));if(notes.length>=limit||bytes+size>maximumBytes)continue;notes.push(note);bytes+=size;}
 return {notes,omittedNotes:all.length-notes.length,forgottenKeys:store.forgottenNotes(owner).map(row=>row.key)};
}
export function conversationReference(store,state,text,now){
 const waiting=store.waitingTasks(state.owner);
 return {recentVoice:store.recentVoice(state.owner),memory:memoryReference(store,state.owner),history:store.searchHistory(state.owner,text),operations:state.context?.network==='testnet'?store.operations(state.owner).slice(0,6):[],followups:{waiting:waiting.length,next:waiting.slice(0,4).map(task=>({id:task.id,text:task.text.slice(0,240),dueAt:task.dueAt}))}};
}
