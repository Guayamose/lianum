import type {Hex} from '../../../defi/vaults/aave-sepolia-types-v4.d.mts';
export interface FixedAaveSepoliaPrimaryDataV4 {
 readonly networkId:'ethereum-sepolia';readonly chainId:'11155111';readonly genesis:Hex;
 readonly addresses:Readonly<{underlying:Hex;pool:Hex;factory:Hex;wrapper:Hex;aToken:Hex;provider:Hex}>;
 readonly pins:Readonly<Record<Hex,Readonly<{bytes:number;sha256:string}>>>;
 readonly proxies:Readonly<Record<Hex,Readonly<{implementation:Hex;bytes:number;sha256:string}>>>;
 readonly proxySlot:Hex;readonly minimumShares:string;readonly [key:string]:unknown;
}
export function readFixedAaveSepoliaPrimaryDataV4():FixedAaveSepoliaPrimaryDataV4;
