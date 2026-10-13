/** Navigation DATA only. A running custody keeps its owner and transport. */
const passive = new Set(['state', 'activity', 'settings']);
const groups = {state:'paged',pagedGraph:'paged',paged:'pagedNote',external:'external',defi:'positions'};
export function walletNavigationDuringWorkV1(target, activeGroup) {
  return passive.has(target) || activeGroup !== null && groups[target] === activeGroup;
}
