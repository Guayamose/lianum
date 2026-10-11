/** Fixed public preparation dependencies; generated outputs are separate receipts. */
import assert from 'node:assert/strict';
import {assertCapturedCurrentSources} from '@lianum/proofs/verification/sources/adopted-source-evidence';
import {join,relative,resolve,sep} from 'node:path';
import {ROOT,FLAT,GOLDEN,CANDIDATE,relation} from '@lianum/proofs/catalog';
import {regular,hash,resourceModuleURL,executionSources,verifyAPI,verifyVendor} from '@lianum/proofs/tooling/tooling';
import {nativeFlowSourcePins} from '../../runners/source-pins.mjs';
import {projectRoot} from '@lianum/environment';
const helper=await import(resourceModuleURL);
export function nativeSplClaimV1CompilationSourcePins(){
 assert.equal(arguments.length,0,'SPL_CLAIM_V1_COMPILATION_NO_OPTIONS');const basis=nativeFlowSourcePins(),rows=new Map();
 const roots={wallet:ROOT,candidate:CANDIDATE,flat:FLAT,golden:GOLDEN,mobileProtocol:resolve(FLAT,'../mobile-protocol'),'active-components':join(projectRoot,'packages/components/src'),'active-environment':join(projectRoot,'packages/environment/src'),'active-source':projectRoot};const add=path=>{path=resolve(path);const root=Object.keys(roots).find(name=>path.startsWith(roots[name]+sep));assert.ok(root,'SPL_CLAIM_V1_FIXED_SOURCE_ROOT');const raw=regular(path),label=root+'/'+relative(roots[root],path).split(sep).join('/');rows.set(label,{path:label,bytes:raw.length,sha256:hash(raw)});};for(const row of basis.local)add(resolve(FLAT,row.path));
 assertCapturedCurrentSources(basis,["tests/integration/chains/evm/run-native-spl-claim-v1-compilation.mjs", "tests/integration/chains/evm/native-spl-claim-v1-compilation-worker.mjs", "tests/integration/chains/evm/native-spl-claim-v1-compilation-source-pins.mjs", "tests/integration/chains/evm/native-spl-claim-v1-compilation-policy.mjs", "packages/backend/src/operations/deployments/claims/native-spl-claim-v1-compilation.mjs", "packages/proofs/src/jobs/run-bounded.mjs"]);
 for(const path of [join(GOLDEN,'tools/solidity-js/package-lock.json'),join(GOLDEN,'tools/solidity-js/node_modules/solc/soljson.js')])add(path);
 const execution={};for(const mode of ['compile','stats','prepare-key']){execution[mode]=executionSources(relation('native_claim_ingress'),mode);for(const row of execution[mode]){assert.ok(Object.hasOwn(roots,row.root),'SPL_CLAIM_V1_FIXED_EXECUTION_SOURCE_ROOT');add(join(roots[row.root],row.path));}}
 return {...basis,format:'LIANUM_SPL_CLAIM_V1_COMPILATION_SOURCE_CLOSURE_V1',local:[...rows.values()].sort((a,b)=>a.path.localeCompare(b.path)),execution,toolchain:helper.verifyToolchain(),crs:helper.verifyCRS(),api:verifyAPI(),vendor:verifyVendor()};
}
