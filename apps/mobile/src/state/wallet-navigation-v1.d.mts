export function walletNavigationDuringWorkV1(target:string,activeGroup:'paged'|'pagedNote'|'external'|'positions'|'agent'|'investment'|null):boolean;
export function walletNavigationPushV1<T extends string>(history:readonly T[],target:T):T[];
export function walletBackTargetV1(history:readonly string[],working?:boolean,activeGroup?:string|null):string|null;
export type WalletBackActionsV1={register(action:()=>boolean,priority?:number):()=>boolean;dispatch():boolean};
export function createWalletBackActionsV1():WalletBackActionsV1;
export const walletBackActionsV1:WalletBackActionsV1;
