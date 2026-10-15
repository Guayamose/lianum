import type {Hex} from '../../../defi/vaults/morpho-v2-sepolia-types-v4.d.mts';
export interface FixedMorphoV2SepoliaPrimaryDataV4 {
 readonly networkId:'ethereum-sepolia';readonly chainId:'11155111';readonly genesis:Hex;
 readonly addresses:Readonly<{underlying:Hex;vault:Hex;adapter:Hex;factory:Hex;adapterFactory:Hex;morpho:Hex;irm:Hex}>;
 readonly pins:Readonly<Record<Hex,Readonly<{bytes:number;sha256:string}>>>;
 readonly assetProxy:Readonly<{slot:Hex;implementation:Hex;bytes:number;codeSHA256:string}>;readonly minimumShares:string;readonly [key:string]:unknown;
}
export function readFixedMorphoV2SepoliaPrimaryDataV4():FixedMorphoV2SepoliaPrimaryDataV4;
