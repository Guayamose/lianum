/** Fixed external-DeFi catalogue continuation. Only the existing ordered AEAD
 * issuer may supply a successor token. This restores retained EXIT bindings;
 * it neither adopts legacy journals nor restores consent/new admissions. */
import assert from 'node:assert/strict';
import {exactRecord} from '../../execution/encoding/commitments.mjs';
import {captureRetainedFlatJournalCatalogueV1,retainedFlatJournalCatalogueRuntimeV1,reopenRetainedFlatJournalCatalogueV1,reopenRetainedFlatJournalGenerationV1} from '../storage/flat-journal-catalogue.mjs';
import {captureRetainedFlatAccountV1,reopenRetainedCatalogueFlatAccountV1} from '../authority/flat-account-authority.mjs';
import {createFlatPortfolioAuthority} from '../authority/flat-portfolio-authority.mjs';
import {createFlatPoolAdmissionPolicy} from '../authority/flat-pool-admission-policy.mjs';
import {reopenRetainedFlatManualPortfolioKeeperV1} from '../portfolio/flat-manual-portfolio-keeper.mjs';
import {assertOwnedFlatSystem} from '../../operations/deployments/system/deploy-system.mjs';
import {assertOwnedFlatOwnerProcess} from '../../../../custody/src/processes/flat-owner-process.mjs';
import {assertWrappedPrivateLifetimeAttemptV1} from '../../claims/wrapped/recovery/wrapped-private-lifetime-registry-v1.mjs';
import {retainOriginalWrappedRecoverySectionV1,consumeOriginalWrappedRecoverySectionV1,originalWrappedRecoverySectionIdentityV1} from '../../claims/wrapped/recovery/wrapped-recovery-authority-v1.mjs';
const tokens=new WeakMap(),opaque=()=>Object.freeze(Object.create(null));
function consume(token,kind){const row=tokens.get(token);assert.ok(row&&row.kind===kind&&!row.used,'EXTERNAL_CATALOGUE_ORIGINAL_REOPEN_TOKEN');row.used=true;return row.value;}
export function consumeExternalDefiCatalogueAccountReopenV1(token){assert.equal(arguments.length,1);return consume(token,'account');}
export function consumeExternalDefiCatalogueKeeperReopenV1(token){assert.equal(arguments.length,1);return consume(token,'keeper');}
export function consumeExternalDefiCatalogueGenerationReopenV1(token){assert.equal(arguments.length,1);return consume(token,'generation');}
export function consumeExternalDefiCatalogueReopenV1(token){assert.equal(arguments.length,1);return consume(token,'catalogue');}
async function issue(kind,value,work){const token=opaque(),entry={kind,value,used:false};tokens.set(token,entry);try{const result=await work(token);assert.equal(entry.used,true,'EXTERNAL_CATALOGUE_TOKEN_UNUSED');return result;}finally{tokens.delete(token);}}
function callbacksCheck(callbacks){exactRecord(callbacks,Object.keys(callbacks));assert.ok(Object.keys(callbacks).every(name=>name==='onProof'));if(callbacks.onProof!==undefined)assert.equal(typeof callbacks.onProof,'function');}
async function closeResources(resources){const failures=[];for(const resource of [...resources].reverse())try{await resource.close();}catch(error){failures.push(error);}if(failures.length)throw new AggregateError(failures,'EXTERNAL_CATALOGUE_ORIGINAL_CLOSE_FAILED');}
export async function retainExternalDefiCatalogueForReopenV1(catalogue,attemptAuthority){
 assert.equal(arguments.length,2);
 const original=originalWrappedRecoverySectionIdentityV1(attemptAuthority,'wallet');
 assertWrappedPrivateLifetimeAttemptV1(retainedFlatJournalCatalogueRuntimeV1(catalogue),original);
 const saved=await captureRetainedFlatJournalCatalogueV1(catalogue),accounts=saved.generations.flatMap(row=>row.accounts.map(member=>member.account)),seen=new Set();
 let failure;
 try{
  for(const generation of saved.generations){const retained=[];
   for(const member of generation.accounts){assert.ok(!seen.has(member.account),'EXTERNAL_CATALOGUE_ACCOUNT_REUSE');seen.add(member.account);
    const account=await captureRetainedFlatAccountV1(member.account);assert.equal(account.poolIndex,member.poolIndex);
    retained.push({poolIndex:member.poolIndex,account});
   }
   generation.accounts=retained;
  }
  // No service password/state is accepted from a caller. Every saved value was
  // produced by the branded closures and committed to the original lifetime.
  await retainOriginalWrappedRecoverySectionV1(attemptAuthority,'wallet',{schema:'EXTERNAL_ORIGINAL_CATALOGUE_WALLET_V1',sourceSHA256:original.sourceSHA256,saved});
 }catch(error){failure=error;}
 try{await closeResources(accounts);}catch(cleanup){failure=failure?new AggregateError([failure,cleanup],'EXTERNAL_CATALOGUE_CAPTURE_FAILED',{cause:failure}):cleanup;}
 if(failure)throw failure;return {retained:true,originalResourcesStopped:true};
}
export async function reopenExternalDefiCatalogueFromRecoveryV1(input,callbacks={}){
 callbacksCheck(callbacks);exactRecord(input,['runtime','system','owners','attemptAuthority']);
 const {runtime,system,owners,attemptAuthority}=input;
 assertWrappedPrivateLifetimeAttemptV1(runtime,originalWrappedRecoverySectionIdentityV1(attemptAuthority,'wallet'));
 assertOwnedFlatSystem(runtime,system);assert.ok(Array.isArray(owners)&&owners.length===2&&owners[0]!==owners[1]);
 owners.forEach((owner,poolIndex)=>assertOwnedFlatOwnerProcess(owner,{runtime,system,poolIndex}));
 const original=originalWrappedRecoverySectionIdentityV1(attemptAuthority,'wallet');
 const retained=consumeOriginalWrappedRecoverySectionV1(attemptAuthority,'wallet');
 exactRecord(retained,['schema','sourceSHA256','saved']);assert.equal(retained.schema,'EXTERNAL_ORIGINAL_CATALOGUE_WALLET_V1');assert.equal(retained.sourceSHA256,original.sourceSHA256);
 const saved=retained.saved;exactRecord(saved,['schema','identity','journal','checkpoint','record','generations']);assert.equal(saved.schema,'EXTERNAL_FLAT_CATALOGUE_RECOVERY_V1');
 assert.equal(saved.identity.genesis,runtime.metadata.evmGenesis);assert.ok(Array.isArray(saved.generations)&&saved.generations.length>=1&&saved.generations.length<=8);
 const generations=[],resources=[],pools=new Set();
 try{
  for(const row of saved.generations){exactRecord(row,['descriptor','config','keeper','accounts','routeOrder']);const accounts=[];
   for(const member of row.accounts){exactRecord(member,['poolIndex','account']);const poolIndex=member.poolIndex;assert.ok((poolIndex===0||poolIndex===1)&&!pools.has(poolIndex),'EXTERNAL_CATALOGUE_ORIGINAL_POOL_REQUIRED');pools.add(poolIndex);
    const account=await issue('account',{input:{runtime,system,poolIndex,owner:owners[poolIndex],nativeExecution:null,accountId:member.account.accountId,journalId:member.account.journalId},saved:member.account,callbacks,manualKeeper:row.keeper},reopenRetainedCatalogueFlatAccountV1);
    resources.push(account);assert.deepEqual(account.config,member.account.config);accounts.push({poolIndex,account});
   }
   const poolAdmissions=await createFlatPoolAdmissionPolicy({runtime,system,accounts,routeOrder:row.routeOrder});
   const portfolio=createFlatPortfolioAuthority({runtime,system,accounts,poolAdmissions,accountId:row.config.accountId,journalId:row.config.journalId});resources.push(portfolio);
   assert.deepEqual(portfolio.config,row.config,'EXTERNAL_CATALOGUE_ORIGINAL_PORTFOLIO');
   const keeper=await issue('keeper',{input:{runtime,portfolio,journal:row.keeper.journal},saved:row.keeper},reopenRetainedFlatManualPortfolioKeeperV1);resources.push(keeper);
   generations.push(await issue('generation',{runtime,portfolio,poolAdmissions,keeper,saved:row},reopenRetainedFlatJournalGenerationV1));
  }
  const catalogue=await issue('catalogue',{input:{runtime,initialGeneration:generations[0],journal:saved.journal},saved,generations},reopenRetainedFlatJournalCatalogueV1);
  // An opener performs read-only original reconciliation before it returns any
  // executable facade. A failed/UNKNOWN result does not manufacture permission.
  for(const row of saved.record.data.bindings)await catalogue.keeper.reconcile(row.request.requestId);
  return catalogue;
 }catch(error){try{await closeResources(resources);}catch(cleanup){throw new AggregateError([error,cleanup],'EXTERNAL_CATALOGUE_REOPEN_FAILED',{cause:error});}throw error;}
}
