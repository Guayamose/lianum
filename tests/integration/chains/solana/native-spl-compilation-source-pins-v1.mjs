import assert from 'node:assert/strict';
import {assertCapturedCurrentSources} from '@lianum/proofs/verification/sources/adopted-source-evidence';
import {join,relative,sep} from 'node:path';
import {ROOT,FLAT} from '@lianum/proofs/catalog';
import {regular,hash} from '@lianum/proofs/tooling/tooling';
import {nativeFlowSourcePins} from '../../runners/source-pins.mjs';
import {nativeSplCompilationMaterialV1} from './native-spl-compilation-material-v1.mjs';
export function nativeSplCompilationSourcePinsV1(){
 assert.equal(arguments.length,0,'SPL_COMPILATION_SOURCE_NO_OPTIONS');const basis=nativeFlowSourcePins(),rows=new Map(basis.local.map(row=>[row.path,row]));
 for(const row of nativeSplCompilationMaterialV1().records)rows.set(row.path,row);
 assertCapturedCurrentSources(basis,["tests/integration/chains/solana/run-native-spl-compilation-v1.mjs","tests/integration/chains/solana/native-spl-compilation-worker-v1.mjs","tests/integration/chains/solana/native-spl-compilation-policy-v1.mjs","tests/integration/chains/solana/native-spl-compilation-source-pins-v1.mjs","tests/integration/chains/solana/native-spl-compilation-material-v1.mjs"]);
 return {...basis,format:'LIANUM_NEW_SPL_COMPILATION_SOURCE_CLOSURE_V1',local:[...rows.values()].sort((a,b)=>a.path.localeCompare(b.path))};
}
