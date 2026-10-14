/** Load the complete note owner with fixed lower infrastructure ports.
 * Account/permission/send WeakMaps remain inside the production module. */
import {mock} from 'node:test';
import {randomUUID} from 'node:crypto';
const backend=new URL('../../src/',import.meta.url);
const boundaries=[
 ['chains/evm/runtime/owned-evm-v2-runtime.mjs',['assertOwnedLocalEvmV2','assertOwnedDeviceExternalFlatReceiverV1']],
 ['chains/evm/runtime/local-evm-ownership.mjs',['assertLocalEvm']],
 ['operations/deployments/system/deploy-system.mjs',['assertOwnedFlatSystem']],
 ['chains/shared/contracts/owned-pool-asset.mjs',['assertOwnedPoolAsset']],
 ['execution/account/reconciliation/flat-system-state.mjs',['createFlatSystemStateReader']],
 ['custody/observers/flat-owner-observer.mjs',['createFlatOwnerObserver','assertOwnedFlatOwnerObserver']],
 ['operations/recovery/device-external-flat-original-source-v2.mjs',['consumeOriginalDeviceGraphSourceRequestV2','assertOriginalDeviceGraphSourceAvailableV2','beginOriginalDeviceGraphSourceActivityV2','endOriginalDeviceGraphSourceActivityV2']],
 ['accounts/authority/device-external-flat-source-graph-v1.mjs',['consumeOriginalDeviceExternalFlatGraphOutputSendV1','assertOriginalDeviceExternalFlatGraphAccountBindingV1','assertOriginalDeviceExternalFlatSourceGraphV1','readOriginalDeviceExternalFlatSourceGraphClaimV1','readOriginalDeviceExternalFlatSourceGraphReleaseV1']],
 ['chains/evm/dispatch/owned-evm-graph-delivery-v1.mjs',['assertOwnedEvmGraphDeliveryObserverV1','assertOwnedEvmGraphDeliveryDescriptorV1']],
 ['accounts/authority/flat-account-validation.mjs',['validateFlatAccountOwnerObservation']],
 ['claims/controller/controller.mjs',['consumeOriginalDeviceRootClaimSendV3']],
 ['claims/wrapped/recovery/wrapped-recovery-authority-v1.mjs',['retainWrappedPrivateLifetimePartV1','readWrappedPrivateLifetimePartV1','updateWrappedPrivateLifetimePartV1','assertWrappedPrivateLifetimePartSealedV1','assertWrappedPrivateLifetimeAttemptV1','assertDeviceExternalFlatRecoveryAuthorityV1','deviceExternalFlatAccountCaptureIdentityV1','retainOriginalWrappedRecoverySectionV1']],
];
export async function loadDeviceNoteAuthorityHost(t,ports,lowerBirthExports={}){
 const mocks=[];t.after(()=>{for(const m of mocks.reverse())m.restore();});
 const originals=await Promise.all(boundaries.map(([path])=>import(new URL(path,backend))));
 for(const [index,[path,names]]of boundaries.entries()){const exports={...originals[index],...(lowerBirthExports[path]??{}),...Object.fromEntries(names.map(name=>[name,ports[name]??(()=>{throw Error('HOST_UNEXPECTED_NOTE_PORT_'+name);})]))};mocks.push(mock.module(new URL(path,backend),{exports}));}
 mocks.push(mock.module('@lianum/proofs/execution/proof-process',{exports:{createProofProcess:ports.createProofProcess}}));
 return import(new URL('accounts/authority/device-external-flat-note-authority-v1.mjs?host='+randomUUID(),backend));
}
