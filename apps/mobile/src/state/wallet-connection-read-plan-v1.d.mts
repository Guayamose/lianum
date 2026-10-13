import type {PublicWalletConnectionKindV1,PublicWalletConnectionV1} from './public-connection-registry-v1.mjs';
export type WalletConnectionReadTaskV1=Readonly<{key:string;id:string;kind:PublicWalletConnectionKindV1;profile:string;route:Readonly<Record<string,string|number>>|null;mode?:'NOTE'|'GRAPH';label:string;origin:string}>;
export type WalletReadCoverageV1=Readonly<{state:'RUNNING'|'COMPLETE'|'PARTIAL'|'CANCELLED';total:number;consulted:number;unavailable:number;pending:number;current:string|null}>;
export type WalletConnectionReadBindingV1=Readonly<{kind:PublicWalletConnectionKindV1;descriptor:any;mode?:'NOTE'|'GRAPH'}>;
export function walletConnectionReadBindingV1(task:WalletConnectionReadTaskV1):WalletConnectionReadBindingV1;
export function walletConnectionReadTasksV1(entries:readonly PublicWalletConnectionV1[],devicePublicKey:string,pagedModes?:Readonly<Record<string,readonly ('NOTE'|'GRAPH')[]>>):readonly WalletConnectionReadTaskV1[];
export function runWalletConnectionReadsV1(input:{tasks:readonly WalletConnectionReadTaskV1[];read(task:WalletConnectionReadTaskV1,signal?:AbortSignal):Promise<boolean>;onProgress?(coverage:WalletReadCoverageV1):void|Promise<void>;signal?:AbortSignal}):Promise<WalletReadCoverageV1>;
