/** Load the complete fixed IPC backend with explicit inert process/actor ports.
 * No source rewriting, recovery-map access or production issuer replacement. */
import {mock} from 'node:test';
import {randomUUID} from 'node:crypto';
const backend=new URL('../../src/',import.meta.url);
const integration=new URL('../../../../tests/integration/',import.meta.url);
const imports=[
 [new URL('operations/local/device-external-flat-local-operator-v1.mjs',backend),['createOriginalDeviceAaveStaticSourceLocalOperatorV3','openOriginalDeviceAaveStaticSourceLocalOperatorV3','createOriginalDeviceExternalFlatSourceLocalOperatorV3','createOriginalDeviceUniswapSourceLocalOperatorV3','openOriginalDeviceExternalFlatSourceLocalOperatorV3','openOriginalDeviceUniswapSourceLocalOperatorV3','createOriginalDeviceExternalFlatSourceLocalOperatorV2','createOriginalDeviceUniswapSourceLocalOperatorV2','openOriginalDeviceExternalFlatSourceLocalOperatorV2','openOriginalDeviceUniswapSourceLocalOperatorV2','readOriginalDeviceGraphSourceLocalOperatorContextV2']],
 [new URL('operations/deployments/system/deployment-artifacts.mjs',backend),['loadFlatDeploymentArtifacts']],
 [new URL('execution/account/reconciliation/flat-system-state.mjs',backend),['createFlatSystemStateReader']],
 [new URL('operations/recovery/device-external-flat-original-source-v2.mjs',backend),['checkpointOriginalDeviceGraphSourceObservationV2','readOriginalDeviceGraphSourceConfirmedCheckpointV2']],
 [new URL('operations/local/device-external-flat-source-graph-service-v1.mjs',backend),['readOriginalDeviceExternalFlatSourceGraphServiceProofsV1']],
 [new URL('accounts/authority/device-external-flat-note-authority-v1.mjs',backend),['readOriginalDeviceExternalFlatProofReceiptsV1']],
 [new URL('api/mobile/device-external-flat-note-http-v1.mjs',backend),['readOriginalDeviceExternalFlatHttpFailureV1']],
 [new URL('wallet/native/device-external-flat-erc20-policy-v1.mjs',integration),['deviceAaveConfirmedGraphSourceProfileV3','deviceConfirmedGraphSourceProfileV3','deviceConfirmedGraphSourceProfileV2','deviceConfirmedSourceProfileV2']],
 [new URL('native/native-flow-owned-files-v1.mjs',integration),['readNativeFlowRegularV1','nativeProcStatV1']],
 [new URL('wallet/native/device-external-flat-private-error-v1.mjs',integration),['retainOriginalDeviceExternalFlatFirstErrorV1']],
];
export async function startConfirmedSourceBackendHost(t,ports){
 const contexts=[];t.after(()=>{for(const context of contexts.reverse())context.restore();});
 const fs=await import('node:fs');contexts.push(mock.module('node:fs',{exports:{...fs,default:{...fs.default},...Object.fromEntries(['mkdirSync','readFileSync','realpathSync','existsSync'].filter(name=>Object.hasOwn(ports,name)).map(name=>[name,ports[name]]))}}));
 contexts.push(mock.module('node:process',{exports:{default:ports.process}}));
 contexts.push(mock.module('@lianum/proofs/catalog',{exports:{ROOT:ports.ROOT}}));
 for(const [specifier,names] of imports)contexts.push(mock.module(specifier,{exports:Object.fromEntries(names.map(name=>[name,ports[name]??(()=>{throw Error('HOST_UNEXPECTED_SOURCE_PORT_'+name);})]))}));
 const api=await import(new URL('wallet/native/device-confirmed-source-backend-v2.mjs?host='+randomUUID(),integration));
 await api.runConfirmedSourceBackendV2();
 return api;
}
