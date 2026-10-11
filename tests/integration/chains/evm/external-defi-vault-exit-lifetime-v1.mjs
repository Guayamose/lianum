/** Fixed before-effects producer for the original five-section issuer. */
import assert from 'node:assert/strict';
import {readFileSync,realpathSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {ROOT} from '@lianum/proofs/catalog';
import {hash} from '@lianum/proofs/tooling/tooling';
import {assertOwnedExternalDefiReceiverV2} from '../../../../packages/backend/src/chains/evm/runtime/owned-evm-v2-runtime.mjs';
import {createWrappedPrivateLifetimeRegistryV1,closeWrappedPrivateLifetimeRegistryV1} from '../../../../packages/backend/src/claims/wrapped/recovery/wrapped-recovery-authority-v1.mjs';
import {createExternalDefiRecoveryAuthorityV1,closeWrappedRecoveryAuthorityV1} from '../../../../packages/backend/src/claims/wrapped/recovery/wrapped-recovery-authority-v1.mjs';
import {NATIVE_FLOW_LIMITS} from '../../native/native-flow-supervisor.mjs';
import {externalDefiVaultExitSourcePinsV1} from './external-defi-vault-exit-source-pins-v1.mjs';
const owned=new WeakMap();
export async function createExternalVaultExitLifetimeV1(runtime,directory){
 assert.equal(arguments.length,2);assertOwnedExternalDefiReceiverV2(runtime);assert.equal(runtime.transactions.length,0,'EXTERNAL_RECOVERY_BORN_BEFORE_CREATE');
 assert.equal(realpathSync(process.argv[1]),join(ROOT,'integration/evm-vault-flow.mjs'));assert.equal(realpathSync(process.cwd()),ROOT);
 const parent=readFileSync(`/proc/${process.ppid}/cmdline`,'utf8').split('\0').filter(Boolean);assert.equal(parent.length,2);
 const entry=realpathSync(resolve(realpathSync(`/proc/${process.ppid}/cwd`),parent[1]));
 assert.ok(['run-evm-metamorpho-exit-recovery-v1.mjs','run-evm-aave-exit-recovery-v1.mjs'].some(name=>entry===join(ROOT,'integration',name)),'EXTERNAL_RECOVERY_FIXED_ORIGINAL_CALLER');
 const local='.local/external-defi-owner-cycle-v1',lock=JSON.parse(readFileSync(join(ROOT,local,'active.lock')));assert.equal(lock.pid,process.ppid);
 assert.match(lock.runId,/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);assert.equal(lock.attempt,local+'/attempt-'+lock.runId);assert.equal(directory,join(ROOT,lock.attempt,'private-audit'));
 const identity={directory,runId:lock.runId,sourceSHA256:hash(JSON.stringify(externalDefiVaultExitSourcePinsV1())),deadlineMs:Date.parse(lock.startedAt)+NATIVE_FLOW_LIMITS.totalMilliseconds-NATIVE_FLOW_LIMITS.cleanupReserveMilliseconds};assert.ok(Date.now()<identity.deadlineMs);
 let registry,authority;
 try{registry=await createWrappedPrivateLifetimeRegistryV1({runtime,...identity});authority=await createExternalDefiRecoveryAuthorityV1(identity);
  const state={runtime,directory,identity,registry,authority,captured:false,closed:false};
  const capability=Object.freeze({async close(){if(state.closed||state.captured)return{closed:true,privateStateRetained:true};state.closed=true;const errors=[];for(const stop of [()=>closeWrappedRecoveryAuthorityV1(authority),()=>closeWrappedPrivateLifetimeRegistryV1(registry)])try{await stop();}catch(error){errors.push(error);}if(errors.length)throw new AggregateError(errors,'EXTERNAL_RECOVERY_LIFETIME_CLOSE_FAILED');return{closed:true};}});owned.set(capability,state);return capability;
 }catch(error){const errors=[];if(authority)try{await closeWrappedRecoveryAuthorityV1(authority);}catch(e){errors.push(e);}if(registry)try{await closeWrappedPrivateLifetimeRegistryV1(registry);}catch(e){errors.push(e);}if(errors.length)throw new AggregateError([error,...errors],'EXTERNAL_RECOVERY_LIFETIME_CREATE_FAILED',{cause:error});throw error;}
}
export function externalVaultExitLifetimeContextV1(capability){assert.equal(arguments.length,1);const state=owned.get(capability);assert.ok(state&&!state.closed&&!state.captured,'EXTERNAL_RECOVERY_ORIGINAL_LIFETIME');assertOwnedExternalDefiReceiverV2(state.runtime);return Object.freeze({...state});}
export function markExternalVaultExitCapturedV1(capability){assert.equal(arguments.length,1);const state=owned.get(capability);assert.ok(state&&!state.closed&&!state.captured,'EXTERNAL_RECOVERY_ORIGINAL_LIFETIME');assert.equal(state.runtime.processStatus().stopped,true);state.captured=true;state.closed=true;return{captured:true};}
