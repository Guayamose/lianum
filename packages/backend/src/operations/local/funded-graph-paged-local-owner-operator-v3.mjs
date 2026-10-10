/** New fixed local OWNER profile. No automatic funding, actor adoption,
 * phone pairing, long wait, proof acceptance DTO or inherited four-slot key.
 * Existing Native/flat/RootNote profiles remain separate. */
import assert from 'node:assert/strict';
import {types} from 'node:util';
import {createOwnedLocalEvmV2} from '../../chains/evm/runtime/owned-evm-v2-runtime.mjs';
import {assertFundedPagedLocalDeploymentArtifactsV3,deployOriginalFundedPagedGraphWalletV3,closeOriginalFundedPagedGraphDeploymentV3} from '../../../../engine/src/execution/local/funded-graph-paged-deployment-v3.mjs';
import {createOriginalFundedPagedLocalOwnerWalletV3,assertOriginalFundedPagedLocalOwnerWalletV3} from '../../../../engine/src/wallet/notes/funded-graph-paged-wallet-v3.mjs';
export const ORIGINAL_PAGED_LOCAL_OWNER_OPERATOR_V3='ORIGINAL_PAGED_LOCAL_OWNER_OPERATOR_V3';
const owned=new WeakMap();
function exact(value,keys){assert.ok(value&&!types.isProxy(value)&&Object.getPrototypeOf(value)===Object.prototype,'PAGED_OPERATOR_DATA');assert.deepEqual(Reflect.ownKeys(value).sort(),[...keys].sort(),'PAGED_OPERATOR_FIELDS');for(const k of keys)assert.ok(Object.hasOwn(Object.getOwnPropertyDescriptor(value,k),'value'),'PAGED_OPERATOR_DATA');}
export async function startOriginalFundedPagedLocalOwnerOperatorV3(input){
 assert.equal(arguments.length,1,'PAGED_OPERATOR_ARITY');exact(input,['deployment','journal']);exact(input.deployment,['manifestSHA256','consumerSHA256','deploymentDomain','policy','registryEpoch','rulesRoot','attesterKeys']);exact(input.journal,['path','password']);assert.ok(typeof input.journal.path==='string'&&typeof input.journal.password==='string','PAGED_OPERATOR_LOCAL_CUSTODY');const configuration=structuredClone(input);
 // Actual gates complete before the first original process/deployment/fund.
 assertFundedPagedLocalDeploymentArtifactsV3(configuration.deployment.manifestSHA256,configuration.deployment.consumerSHA256);
 let runtime,system,wallet;
 try{runtime=await createOwnedLocalEvmV2();system=await deployOriginalFundedPagedGraphWalletV3(runtime,configuration.deployment);wallet=await createOriginalFundedPagedLocalOwnerWalletV3(runtime,system,{journal:configuration.journal});assertOriginalFundedPagedLocalOwnerWalletV3(wallet,runtime,system);}
 catch(error){await wallet?.close();if(system)closeOriginalFundedPagedGraphDeploymentV3(runtime,system);await runtime?.close();throw error;}finally{configuration.journal.password=null;}
 let closing=null,closed=false;const service=Object.freeze({profile:ORIGINAL_PAGED_LOCAL_OWNER_OPERATOR_V3,descriptor:wallet.descriptor(),wallet,
  close(){return closing??=(async()=>{await wallet.close();closeOriginalFundedPagedGraphDeploymentV3(runtime,system);await runtime.close();closed=true;return Object.freeze({closed:true,originalResourcesStopped:true,automaticFunding:false});})();}
 });owned.set(service,{runtime,system,wallet,isClosed:()=>closed,isClosing:()=>closing!==null});return service;
}
export function assertOriginalFundedPagedLocalOwnerOperatorV3(service){assert.equal(arguments.length,1,'PAGED_OPERATOR_ARITY');const s=owned.get(service);assert.ok(s&&!s.isClosed()&&!s.isClosing(),'PAGED_OPERATOR_ORIGINAL');assertOriginalFundedPagedLocalOwnerWalletV3(s.wallet,s.runtime,s.system);return service;}
