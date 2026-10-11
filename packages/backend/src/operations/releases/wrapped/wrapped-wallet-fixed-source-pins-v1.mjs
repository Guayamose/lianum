/** Current wrapped execution uses one adopted source authority. Original ABI
 * and constraint data remain retained resources with their own physical hashes. */
import assert from 'node:assert/strict';
import {join,relative,sep} from 'node:path';
import {projectRoot} from '@lianum/environment';
import {ROOT,FLAT} from '@lianum/proofs/catalog';
import {regular,hash} from '@lianum/proofs/tooling/tooling';
import {captureAdoptedSourceEvidence,assertCapturedCurrentSources} from '@lianum/proofs/verification/sources/adopted-source-evidence';
export function wrappedWalletFixedSourcePinsV1(){
 assert.equal(arguments.length,0,'WRAPPED_FIXED_SOURCE_NO_OPTIONS');
 const base=captureAdoptedSourceEvidence();
 assertCapturedCurrentSources(base,["tests/integration/deployments/wrapped/run-wrapped-deployment-only-v1.mjs", "tests/integration/deployments/wrapped/wrapped-deployment-only-v1.mjs", "tests/integration/wallet/wrapped/flows/run-wrapped-wallet-fixed-acceptance-v1.mjs", "tests/integration/wallet/wrapped/validation/run-wrapped-wallet-fixed-preflight-v1.mjs", "tests/integration/wallet/wrapped/flows/wrapped-wallet-fixed-acceptance-v1.mjs", "tests/integration/wallet/wrapped/validation/wrapped-wallet-fixed-preflight-v1.mjs", "tests/integration/wallet/wrapped/flows/wrapped-wallet-fixed-driver-v1.mjs", "packages/backend/src/operations/local/wrapped-wallet-runtime-v1.mjs", "tests/integration/wallet/wrapped/flows/wrapped-wallet-fixed-steps-v1.mjs", "packages/backend/src/claims/wrapped/recovery/wrapped-terminal-baseline-v1.mjs", "packages/backend/src/operations/releases/wrapped/wrapped-wallet-fixed-policy-v1.mjs", "packages/backend/src/operations/releases/wrapped/wrapped-wallet-fixed-source-pins-v1.mjs", "packages/backend/src/operations/wallet/wrapped-wallet-composition-v1.mjs", "packages/backend/src/proving/wrapped-claims/runtime/wrapped-claim-role-process-v1.mjs", "packages/backend/src/proving/wrapped-claims/runtime/wrapped-claim-worker-v1.mjs", "packages/components/src/verification/wrapped-installation-source-inspector-v2.mjs"]);
 const files=new Map(base.local.map(row=>[row.path,row]));
 const bootstrap=join(projectRoot,'packages/components/src/verification/wrapped-installation-source-inspector-v2.mjs'),bootstrapBytes=regular(bootstrap);
 const externalInstallationBootstrap={path:relative(FLAT,bootstrap).split(sep).join('/'),bytes:bootstrapBytes.length,sha256:hash(bootstrapBytes),classification:'EXTERNALLY_INSTALLED_ROOT_LIFETIME_OBSERVATION_NOT_AUTHORITY'};
 for(const name of ['wrapped-claim-abi-source-v1.json','wrapped-claim-abi-reviewed-v2.json','wrapped-claim-abi-reviewed-v3.json','wrapped-claim-constraint-batches-v1.json']){
  const path=join(ROOT,'proof-workers',name),bytes=regular(path),label=relative(FLAT,path).split(sep).join('/');
  files.set(label,{path:label,bytes:bytes.length,sha256:hash(bytes)});
 }
 return {...base,format:'LIANUM_FIXED_WRAPPED_WALLET_ADOPTED_SOURCE_CLOSURE_V3',externalInstallationBootstrap,local:[...files.values()].sort((a,b)=>a.path.localeCompare(b.path))};
}
