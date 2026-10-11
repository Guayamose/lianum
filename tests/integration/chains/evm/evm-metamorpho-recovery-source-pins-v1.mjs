/** Fixed current MetaMorpho F consumers; compiler/key artifacts are unchanged. */
import assert from 'node:assert/strict';
import {assertCapturedCurrentSources} from '@lianum/proofs/verification/sources/adopted-source-evidence';
import {join,relative,sep} from 'node:path';
import {ROOT,FLAT} from '@lianum/proofs/catalog';
import {regular,hash} from '@lianum/proofs/tooling/tooling';
import {evmVaultSourcePins} from '../../runners/source-pins.mjs';
export function evmMetaMorphoRecoverySourcePinsV1(){
 assert.equal(arguments.length,0,'METAMORPHO_F_SOURCE_NO_OPTIONS');
 const original=evmVaultSourcePins(),files=new Map(original.local.map(row=>[row.path,row]));
 assertCapturedCurrentSources(original,["tests/integration/chains/evm/run-evm-metamorpho-recovery-flow-v1.mjs","tests/integration/chains/evm/evm-metamorpho-recovery-source-pins-v1.mjs","tests/integration/chains/evm/evm-metamorpho-recovery-policy-v1.mjs"]);
 return {...original,format:'ORIGINAL_FIXED_METAMORPHO_F_SOURCE_CLOSURE_V1',local:[...files.values()].sort((a,b)=>a.path.localeCompare(b.path))};
}
