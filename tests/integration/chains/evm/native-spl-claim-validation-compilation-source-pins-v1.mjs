/** Fixed compilation closure and official material, no caller roots. */
import assert from 'node:assert/strict';
import {join,relative,sep} from 'node:path';
import {ROOT,FLAT,GOLDEN} from '../../../../packages/proofs/src/catalog.mjs';
import {regular,hash} from '../../../../packages/proofs/src/tooling/tooling.mjs';
import {nativeSplClaimValidationCompilationSourcesV1} from '../../../../packages/backend/src/operations/deployments/claims/native-spl-claim-validation-compilation-v1.mjs';
import {nativeFlowSourcePins} from '../../runners/source-pins.mjs';
export function nativeSplClaimValidationCompilationSourcePinsV1(){
 assert.equal(arguments.length,0,'SPL_VALIDATION_COMPILATION_SOURCE_NO_OPTIONS');
 const originals=Object.keys(nativeSplClaimValidationCompilationSourcesV1()).map(name=>join(ROOT,'contracts',name));
 const basis=nativeFlowSourcePins(),rows=new Map(basis.local.map(row=>[row.path,row]));
 for(const path of ['run-native-spl-claim-validation-compilation-v1.mjs','native-spl-claim-validation-compilation-worker-v1.mjs','native-spl-claim-validation-compilation-source-pins-v1.mjs','native-spl-claim-validation-compilation-policy-v1.mjs'].map(name=>join(ROOT,'integration',name)).concat(originals,[
  join(ROOT,'contracts/native-claims/NativeSplClaimValidationV1.sol'),join(GOLDEN,'tools/solidity-js/package-lock.json'),join(GOLDEN,'tools/solidity-js/node_modules/solc/soljson.js')])){
  const raw=regular(path),base=path.startsWith(ROOT+sep)?ROOT:GOLDEN;assert.ok(path.startsWith(base+sep),'SPL_VALIDATION_SOURCE_LOCATION');
  const label=(base===ROOT?'wallet/':'golden/')+relative(base,path).split(sep).join('/');rows.set(label,{path:label,bytes:raw.length,sha256:hash(raw)});
 }
 return {...basis,format:'LIANUM_SPL_VALIDATION_COMPILATION_SOURCE_CLOSURE_V1',local:[...rows.values()].sort((a,b)=>a.path.localeCompare(b.path))};
}
