/** Fixed original two-account exit wallet. All credentials are retained in the
 * existing private lifetime registry before any keeper can accept requests. */
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {join} from 'node:path';
import {exactRecord} from '@lianum/components/encoding/commitments';
import {assertOwnedFlatSystem} from '../../operations/deployments/system/deploy-system.mjs';
import {assertOwnedFlatOwnerProcess} from '../../custody/processes/flat-owner-process.mjs';
import {createRetainedFlatAccountAuthorityV1,captureRetainedFlatAccountV1,reopenRetainedFlatAccountV1,retainedFlatAccountInventoryV1} from '../authority/flat-account-authority.mjs';
import {createDurableGenericAccountKeeperV1,reopenDurableGenericAccountKeeperV1,captureDurableGenericAccountKeeperV1} from '../storage/durable-generic-account-keeper.mjs';
import {genericAccountIdentity,sha} from '@lianum/engine/accounts/journal';
import {retainWrappedPrivateLifetimePartV1,readWrappedPrivateLifetimePartV1,assertWrappedPrivateLifetimeAttemptV1} from '../../claims/wrapped/recovery/wrapped-recovery-authority-v1.mjs';
import {retainOriginalWrappedRecoverySectionV1,consumeOriginalWrappedRecoverySectionV1,originalWrappedRecoverySectionIdentityV1} from '../../claims/wrapped/recovery/wrapped-recovery-authority-v1.mjs';
const wallets=new WeakMap(),tokens=new WeakMap();
const clone=value=>structuredClone(value);
const identity=config=>({profile:'EXTERNAL_FLAT_EXIT_KEEPER_V1',identity:genericAccountIdentity(config)});
function inputCheck(input){exactRecord(input,['runtime','system','owners','directory']);assertOwnedFlatSystem(input.runtime,input.system);
 assert.ok(Array.isArray(input.owners)&&input.owners.length===2&&input.owners[0]!==input.owners[1]);
 input.owners.forEach((owner,poolIndex)=>assertOwnedFlatOwnerProcess(owner,{runtime:input.runtime,system:input.system,poolIndex}));}
async function closeEntries(entries){const errors=[];for(const entry of entries)for(const resource of [entry.keeper,entry.account])if(resource)try{await resource.close();}catch(error){errors.push(error);}if(errors.length)throw new AggregateError(errors,'EXTERNAL_WALLET_CLOSE_FAILED');}
function expose(input,entries){let closed=false,capturing=false;const wallet=Object.freeze({async inventory(){assert.ok(!closed&&!capturing,'EXTERNAL_WALLET_ORIGINAL_REQUIRED');const inventory=[];for(const entry of entries)inventory.push({poolIndex:entry.poolIndex,account:await retainedFlatAccountInventoryV1(entry.account),journal:await entry.keeper.snapshot()});return Object.freeze(clone(inventory));},entries:Object.freeze(entries.map(row=>Object.freeze({...row}))),
 async close(){if(closed)return {closed:true};assert.equal(capturing,false,'EXTERNAL_WALLET_CAPTURE_PENDING');try{await closeEntries(entries);}finally{closed=true;}return {closed:true};}});
 wallets.set(wallet,{input,entries,fence(){assert.ok(!closed&&!capturing,'EXTERNAL_WALLET_ORIGINAL_REQUIRED');capturing=true;},finish(){closed=true;}});return wallet;}
function validateCallbacks(callbacks){exactRecord(callbacks,Object.keys(callbacks));assert.ok(Object.keys(callbacks).every(key=>key==='onProof'));if(callbacks.onProof!==undefined)assert.equal(typeof callbacks.onProof,'function');}
export async function createExternalDefiExitWalletV1(input,callbacks={}){
 validateCallbacks(callbacks);inputCheck(input);const entries=[];
 try{for(let poolIndex=0;poolIndex<2;poolIndex++){
  const account=await createRetainedFlatAccountAuthorityV1({runtime:input.runtime,system:input.system,poolIndex,owner:input.owners[poolIndex],nativeExecution:null,
    accountId:'external_destination_'+poolIndex,journalId:'external_destination_journal_'+poolIndex},callbacks);
  const entry={poolIndex,account,keeper:null};entries.push(entry);
  const journal={path:join(input.directory,'external-exit-'+poolIndex+'.vault'),password:randomBytes(32).toString('hex')};
  const handle=await retainWrappedPrivateLifetimePartV1(input.runtime,'wallet-graph-keeper-'+poolIndex,identity(account.config),
    {config:account.config,journal,checkpoint:null,pendingCheckpoint:null,parentCheckpoint:null});
  entry.keeper=await createDurableGenericAccountKeeperV1({config:account.config,authority:account.authority,journal},handle);
 }return expose(input,entries);}catch(error){try{await closeEntries(entries);}catch(cleanup){throw new AggregateError([error,cleanup],'EXTERNAL_WALLET_CREATE_FAILED');}throw error;}
}
export async function retainExternalDefiWalletForReopenV1(wallet,attemptAuthority){
 const state=wallets.get(wallet);assert.ok(state,'EXTERNAL_WALLET_ORIGINAL_REQUIRED');assertWrappedPrivateLifetimeAttemptV1(state.input.runtime,originalWrappedRecoverySectionIdentityV1(attemptAuthority,'wallet'));state.fence();const retained=[];let failure;
 try{for(const entry of state.entries){const keeper=await captureDurableGenericAccountKeeperV1(entry.keeper);
   const account=await captureRetainedFlatAccountV1(entry.account);retained.push({poolIndex:entry.poolIndex,account,keeper});}
  await retainOriginalWrappedRecoverySectionV1(attemptAuthority,'wallet',{schema:'EXTERNAL_ORIGINAL_EXIT_WALLET_V1',directory:state.input.directory,entries:retained});
 }catch(error){failure=error;}
 try{await closeEntries(state.entries);}catch(error){failure=failure?new AggregateError([failure,error],'EXTERNAL_WALLET_CAPTURE_CLOSE_FAILED'):error;}finally{state.finish();}
 if(failure)throw failure;return {retained:true,originalResourcesStopped:true};
}
export function consumeExternalDefiAccountReopenV1(token){const state=tokens.get(token);assert.ok(state&&!state.used,'EXTERNAL_ACCOUNT_ORIGINAL_REOPEN_TOKEN');state.used=true;return {input:state.input,saved:clone(state.saved),callbacks:state.callbacks};}
export async function reopenExternalDefiWalletFromRecoveryV1(input,callbacks={}){
 validateCallbacks(callbacks);
 exactRecord(input,['runtime','system','owners','attemptAuthority']);
 assertWrappedPrivateLifetimeAttemptV1(input.runtime,originalWrappedRecoverySectionIdentityV1(input.attemptAuthority,'wallet'));
 const retained=consumeOriginalWrappedRecoverySectionV1(input.attemptAuthority,'wallet');exactRecord(retained,['schema','directory','entries']);
 assert.equal(retained.schema,'EXTERNAL_ORIGINAL_EXIT_WALLET_V1');assert.equal(retained.entries.length,2);
 const original={runtime:input.runtime,system:input.system,owners:input.owners,directory:retained.directory};inputCheck(original);const entries=[];
 try{for(let poolIndex=0;poolIndex<2;poolIndex++){
  const row=retained.entries[poolIndex];exactRecord(row,['poolIndex','account','keeper']);assert.equal(row.poolIndex,poolIndex);assert.equal(row.account.poolIndex,poolIndex);
  const token=Object.freeze(Object.create(null));const state={used:false,saved:row.account,callbacks,input:{runtime:input.runtime,system:input.system,poolIndex,owner:input.owners[poolIndex],nativeExecution:null,
    accountId:row.account.accountId,journalId:row.account.journalId}};tokens.set(token,state);let account;
  try{account=await reopenRetainedFlatAccountV1(token);assert.equal(state.used,true);}finally{tokens.delete(token);}
  const entry={poolIndex,account,keeper:null};entries.push(entry);assert.deepEqual(account.config,row.account.config);
  const saved=await readWrappedPrivateLifetimePartV1(input.runtime,'wallet-graph-keeper-'+poolIndex,identity(account.config));
  const {schema,...keeperState}=row.keeper;assert.equal(schema,'WRAPPED_DURABLE_GRAPH_KEEPER_V1');assert.deepEqual(saved.privateState,keeperState,'EXTERNAL_KEEPER_ORIGINAL_CHECKPOINT_CHANGED');
  entry.keeper=await reopenDurableGenericAccountKeeperV1({config:account.config,authority:account.authority,journal:row.keeper.journal},row.keeper,saved.handle);
 }return expose(original,entries);}catch(error){try{await closeEntries(entries);}catch(cleanup){throw new AggregateError([error,cleanup],'EXTERNAL_WALLET_REOPEN_FAILED');}throw error;}
}
