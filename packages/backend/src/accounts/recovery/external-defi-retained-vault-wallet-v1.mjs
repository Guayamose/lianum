/** Original retained EXIT catalogues and finite TOP_UP/EXIT note catalogues,
 * born before funding. GRAPH keeps its separate original authority. */
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {mkdtemp} from 'node:fs/promises';
import {join} from 'node:path';
import {exactRecord} from '@lianum/components/encoding/commitments';
import {assertOwnedFlatSystem} from '../../operations/deployments/system/deploy-system.mjs';
import {assertOwnedFlatOwnerProcess} from '../../custody/processes/flat-owner-process.mjs';
import {createRetainedFlatAccountAuthorityV1,createRetainedExternalVaultNoteAccountV1} from '../authority/flat-account-authority.mjs';
import {createFlatPortfolioAuthority} from '../authority/flat-portfolio-authority.mjs';
import {createFlatPoolAdmissionPolicy} from '../authority/flat-pool-admission-policy.mjs';
import {createRetainedFlatJournalGenerationV1,createRetainedFlatJournalCatalogueV1,createRetainedExternalVaultNoteCatalogueV1,closeRetainedFlatJournalCatalogueV1} from '../storage/flat-journal-catalogue.mjs';
import {createRetainedOwnedMetaMorphoVaultV1,createRetainedOwnedAaveStaticVaultV1} from '../../defi/vaults/owned-metamorpho-vault.mjs';
import {createRetainedOwnedPrivateVaultExitV1} from '../../defi/withdrawals/private-vault-exit.mjs';
import {createGenerationPrivateVaultExit} from '../../defi/withdrawals/generation-private-vault-exit.mjs';
import {createFlatManualGraphCatalogueSession} from '../../api/accounts/flat-manual-graph-session.mjs';
const original=new WeakMap(),economicCatalogues=new WeakMap();
export function createRetainedMetaMorphoExitWalletV1(input,callbacks={}){assert.ok(arguments.length===1||arguments.length===2);return create(input,callbacks,false);}
export function createRetainedAaveExitWalletV1(input,callbacks={}){assert.ok(arguments.length===1||arguments.length===2);return create(input,callbacks,true);}
export function createRetainedMetaMorphoNoteExitWalletV1(input,callbacks={}){assert.ok(arguments.length===1||arguments.length===2);return create(input,callbacks,false,true);}
export function createRetainedAaveNoteExitWalletV1(input,callbacks={}){assert.ok(arguments.length===1||arguments.length===2);return create(input,callbacks,true,true);}
// One private operator installation per original wallet. Admission is fenced
// synchronously; the same acquisition is retained and drained before custody.
function createOriginalDevicePositionPortV1(wallet) {
 let used=false,closed=false,acquisition=null,handle=null,closing=null;
 return Object.freeze({
  install(input) {
   assert.equal(arguments.length,1);assert.ok(!used&&!closed,'EXTERNAL_DEVICE_POSITION_INSTALL_ONCE');
   exactRecord(input,['origin','devicePublicKey','tls']);exactRecord(input.tls,['certificate','privateKey']);
   for(const value of [input.origin,input.devicePublicKey,input.tls.certificate,input.tls.privateKey])assert.equal(typeof value,'string');
   const snapshot=Object.freeze({origin:input.origin,devicePublicKey:input.devicePublicKey,tls:Object.freeze({...input.tls})});
   used=true;
   acquisition=(async()=>{
    const {installRetainedVaultDevicePositionServiceV1}=await import('./retained-vault-device-position-service-v1.mjs');
    assert.equal(closed,false,'EXTERNAL_DEVICE_POSITION_CLOSED');
    handle=await installRetainedVaultDevicePositionServiceV1(wallet,snapshot);
    if(closed){await handle.close();throw Error('EXTERNAL_DEVICE_POSITION_CLOSED');}
    return handle;
   })();return acquisition;
  },
  close() {
   assert.equal(arguments.length,0);closed=true;if(closing)return closing;
   const original=handle,stop=original?.close(),pending=acquisition;
   closing=(async()=>{
    let failure;try{if(pending)await pending;}catch(error){failure=error;}
    // A handle acquired while closing is withheld from its caller. Always
    // retry its original idempotent close; no OS/socket state is inferred.
    try{await stop;if(handle&&handle!==original)await handle.close();}catch(error){if(failure)throw new AggregateError([failure,error],'EXTERNAL_DEVICE_POSITION_CLOSE_FAILED',{cause:failure});throw error;}
    if(failure)throw failure;
    return {closed:true,retainedOriginalCustody:true};
   })();return closing;
  },
 });
}

async function create(input,callbacks,aave,vaultNotes=false){
 exactRecord(input,['runtime','system','owners','protocolFixture']);exactRecord(callbacks,Object.keys(callbacks));assert.ok(Object.keys(callbacks).every(key=>key==='onProof'));if(callbacks.onProof!==undefined)assert.equal(typeof callbacks.onProof,'function');
 const {runtime,system,owners,protocolFixture}=input;assertOwnedFlatSystem(runtime,system);assert.ok(Array.isArray(owners)&&owners.length===2&&owners[0]!==owners[1]);owners.forEach((owner,poolIndex)=>assertOwnedFlatOwnerProcess(owner,{runtime,system,poolIndex}));
 const directory=await mkdtemp(join(runtime.metadata.scratchDirectory,'external-retained-exit-wallet-')),accounts=[];let portfolio,catalogue,vault,service,session,devicePositionPort,economicState,economicJournal;
 const stop=async()=>{const errors=[];for(const work of [()=>economicState?.close(),()=>devicePositionPort?.close(),async()=>{if(session&&(await session.idle()).phase!=='CLOSED')await session.quiesceForPrivateRecovery();return session?.close();},()=>service?.close(),()=>vault?.close(),()=>catalogue?closeRetainedFlatJournalCatalogueV1(catalogue):undefined,...accounts.map(account=>()=>account.close()),()=>portfolio?.close()])try{await work();}catch(error){errors.push(error);}if(economicJournal)economicJournal.password=null;if(errors.length)throw new AggregateError(errors,'EXTERNAL_EXIT_WALLET_ORIGINAL_CLOSE_FAILED');return{closed:true};};
 try{
  for(let poolIndex=0;poolIndex<2;poolIndex++)accounts.push(await(vaultNotes?createRetainedExternalVaultNoteAccountV1:createRetainedFlatAccountAuthorityV1)({runtime,system,poolIndex,owner:owners[poolIndex],nativeExecution:null,accountId:(vaultNotes?'retained_vault_note_asset_':'retained_vault_exit_asset_')+poolIndex,journalId:(vaultNotes?'retained_vault_note_asset_journal_':'retained_vault_exit_asset_journal_')+poolIndex},callbacks));
  // This is the only writable manual preparation for each original owner.
  // Construction is read-only and precedes funding; later EXIT reuses it.
  if(vaultNotes)for(const account of accounts)await account.ownerActions.createManualPreparation();
  const members=accounts.map((account,poolIndex)=>({account,poolIndex})),poolAdmissions=await createFlatPoolAdmissionPolicy({runtime,system,accounts:members,routeOrder:accounts.map(account=>account.assetId)});
  portfolio=createFlatPortfolioAuthority({runtime,system,accounts:members,poolAdmissions,accountId:'retained_vault_exit_portfolio',journalId:'retained_vault_exit_portfolio_journal'});
  const journal=name=>({path:join(directory,name+'.vault'),password:randomBytes(32).toString('hex')});
  const generation=await createRetainedFlatJournalGenerationV1({runtime,portfolio,poolAdmissions,journal:journal('generation')});
  catalogue=await(vaultNotes?createRetainedExternalVaultNoteCatalogueV1:createRetainedFlatJournalCatalogueV1)({runtime,initialGeneration:generation,journal:journal('catalogue')});
  vault=await(aave?createRetainedOwnedAaveStaticVaultV1:createRetainedOwnedMetaMorphoVaultV1)({runtime,protocolFixture});
  service=await createRetainedOwnedPrivateVaultExitV1({runtime,system,poolIndex:1,account:accounts[1],vault});
  const exit=createGenerationPrivateVaultExit({runtime,catalogue,services:[service]});
  session=(await createFlatManualGraphCatalogueSession({runtime,catalogue})).session;
  // Observe the original catalogue and exact position facade from their first
  // lifetime. This Vault records read checkpoints and holds no owner opening.
  const {createOriginalWalletEconomicStateV1}=await import('../state/original-wallet-economic-state-v1.mjs');
  economicJournal=journal('economic-observations');
  economicState=await createOriginalWalletEconomicStateV1({catalogues:[{runtime,catalogue,session,positions:exit}],nativeAccounts:[],wrappedPortfolios:[],journal:economicJournal});
  const wallet=Object.freeze({catalogue,portfolio,accounts:Object.freeze(accounts),vault,service,exit,session,economicState,
   closeEconomicState(){assert.equal(arguments.length,0);return economicState.close();},
   installDevicePositionRead(input){assert.equal(arguments.length,1);return devicePositionPort.install(input);},
   closeDevicePositionRead(){assert.equal(arguments.length,0);return devicePositionPort.close();},close:stop});
  devicePositionPort=createOriginalDevicePositionPortV1(wallet);
  const context={runtime,system,owners,protocolFixture,directory,catalogue,portfolio,accounts,vault,service,session,economicState,economicJournal,economicCaptureStarted:false,vaultNotes,variant:aave?'AAVE_STATIC':'METAMORPHO'};original.set(wallet,context);economicCatalogues.set(catalogue,context);return wallet;
 }catch(error){try{await stop();}catch(cleanup){throw new AggregateError([error,cleanup],'EXTERNAL_EXIT_WALLET_ORIGINAL_CREATE_FAILED',{cause:error});}throw error;}
}
export function retainedExternalVaultWalletContextV1(wallet){assert.equal(arguments.length,1);const context=original.get(wallet);assert.ok(context,'EXTERNAL_EXIT_WALLET_ORIGINAL_REQUIRED');assertOwnedFlatSystem(context.runtime,context.system);return Object.freeze({...context});}

/** Only the original wallet producer can retain observation credentials inside
 * the existing AEAD wallet section. No caller journal/checkpoint is accepted. */
export async function captureOriginalRetainedVaultEconomicStateV1(catalogue){
 assert.equal(arguments.length,1);const context=economicCatalogues.get(catalogue);if(!context)return null;
 assertOwnedFlatSystem(context.runtime,context.system);assert.equal(context.economicCaptureStarted,false,'EXTERNAL_ECONOMIC_CAPTURE_ONCE');context.economicCaptureStarted=true;
 assert.equal((await context.economicState.idle()).phase,'READY');const checkpoint=context.economicState.checkpoint();
 const saved={version:1,profile:checkpoint.profile,journal:{...context.economicJournal},checkpoint};
 assert.equal((await context.economicState.close()).closed,true);context.economicJournal.password=null;return saved;
}
