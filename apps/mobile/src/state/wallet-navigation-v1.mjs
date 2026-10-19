/** Navigation DATA only. A running custody keeps its owner and transport. */
const passive = new Set(['native', 'state', 'activity', 'operations', 'agent', 'approvals', 'settings', 'privateActivity']);
const groups = {state:'paged',pagedGraph:'paged',paged:'pagedNote',external:'external',defi:'positions',agentReview:'agent',investment:'investment'};
export function walletNavigationDuringWorkV1(target, activeGroup) {
  return passive.has(target) || activeGroup !== null && groups[target] === activeGroup;
}

/** UI history only. Re-selecting a visited route unwinds instead of making loops.
 * Commit history only when the existing navigation owner accepts a transition. */
export function walletNavigationPushV1(history, target) {
  const previous=history.lastIndexOf(target);
  return previous>=0?history.slice(0,previous+1):[...history.slice(-31),target];
}
export function walletBackTargetV1(history, working=false, activeGroup=null) {
  const current=history.at(-1),previous=history.at(-2)??(current!=='native'?'native':null);
  if(previous===null)return null;
  return working&&!walletNavigationDuringWorkV1(previous,activeGroup)?'native':previous;
}

/** Explicit child priority avoids depending on React effect registration order. */
export function createWalletBackActionsV1(){
 const actions=new Map();let sequence=0;
 return Object.freeze({
  register(action,priority=0){const id=++sequence;actions.set(id,{action,priority});return()=>actions.delete(id);},
  dispatch(){for(const [,entry]of [...actions].sort((a,b)=>b[1].priority-a[1].priority||b[0]-a[0]))if(entry.action())return true;return false;},
 });
}
export const walletBackActionsV1=createWalletBackActionsV1();
