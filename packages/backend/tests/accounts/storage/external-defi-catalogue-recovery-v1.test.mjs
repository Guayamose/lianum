/** HOST only: actual catalogue/recovery closures and encrypted journals.
 * Account, keeper, admission, issuer and chain brands are synthetic ports.
 * This tests new-object continuation/unchanged routing, not native recovery. */
import test,{mock} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {Vault} from '@lianum/engine/crypto/vault';
import {canonical} from '@lianum/engine/crypto/privacy';
const h=value=>createHash('sha256').update(canonical(value)).digest('hex'),copy=structuredClone;
const runtimes=new WeakMap(),accounts=new WeakMap(),portfolios=new WeakMap(),keepers=new WeakMap(),policies=new WeakMap(),writes=new WeakMap(),reads=new WeakMap();
const lifetime=new Map(),actions=new Map();let recovery;
mock.module('@lianum/engine/accounts/journal',{exports:{
 copy,immutable:copy,sha:h,genericAccountIdentity:config=>copy(config),validateInput:copy,
 bindGenericAccountRequest:(request,config)=>({...copy(request),bindingSHA256:h({request,config}),assetBindingSHA256:h(config.registry[0])}),
 validateBoundRequest:request=>copy(request),
}});
mock.module('@lianum/engine/execution/accounts/generic-account-process',{exports:{validateJournalCredentials:copy}});
mock.module(new URL('../../../src/operations/deployments/system/deploy-system.mjs',import.meta.url),{exports:{assertOwnedFlatSystem:(runtime,system)=>assert.equal(runtimes.get(runtime)?.system,system)}});
mock.module(new URL('../../../src/custody/processes/flat-owner-process.mjs',import.meta.url),{exports:{assertOwnedFlatOwnerProcess:(owner,expected)=>assert.equal(runtimes.get(expected.runtime)?.owners[expected.poolIndex],owner)}});
function portfolio(input){const value={config:{accountId:input.accountId,journalId:input.journalId,lifetime:h(input.accounts.map(row=>row.account.config)),registry:input.accounts.flatMap(row=>row.account.registry)},registry:input.accounts.flatMap(row=>row.account.registry),close(){return {closed:true};}};portfolios.set(value,input);return value;}
mock.module(new URL('../../../src/accounts/authority/flat-portfolio-authority.mjs',import.meta.url),{exports:{createFlatPortfolioAuthority:portfolio,
 assertOwnedFlatPortfolio:(runtime,value)=>assert.equal(portfolios.get(value)?.runtime,runtime),
 describeFlatPortfolioJournalAuthority:(runtime,value)=>{const input=portfolios.get(value);assert.equal(input?.runtime,runtime);return {runtime,system:input.system,accounts:input.accounts};},
}});
function policy(input){const routes=input.accounts.map(row=>({assetId:row.account.registry[0].assetId,pool:'11'.repeat(20),domainCommitment:h('domain'),economicIdentitySHA256:h('economic')}));const result={verifyFreshGeneration:async()=>routes.map(route=>({route})),identityForAsset:id=>routes.find(row=>row.assetId===id),status:()=>({current:input.routeOrder})};policies.set(result,input);return result;}
mock.module(new URL('../../../src/accounts/authority/flat-pool-admission-policy.mjs',import.meta.url),{exports:{createFlatPoolAdmissionPolicy:async input=>policy(input),assertOwnedFlatPoolAdmissionPolicy:(value,expected)=>{const input=policies.get(value);assert.equal(input?.runtime,expected.runtime);assert.deepEqual(input.accounts,expected.accounts);}}});
function account(runtime,system,poolIndex,config){const value={config:copy(config),registry:copy(config.registry),close:async()=>({closed:true})};accounts.set(value,{runtime,system,poolIndex});return value;}
mock.module(new URL('../../../src/accounts/authority/flat-account-authority.mjs',import.meta.url),{exports:{
 assertRetainedExternalVaultNoteAccountV1:()=>assert.fail('HOST_NOTE_ACCOUNT_NOT_USED'),
 retainedFlatAccountInventoryV1:async value=>({poolIndex:accounts.get(value).poolIndex}),
 captureRetainedFlatAccountV1:async value=>({config:value.config,accountId:value.config.accountId,journalId:value.config.journalId,poolIndex:accounts.get(value).poolIndex}),
 reopenRetainedCatalogueFlatAccountV1:async token=>{const {input,saved}=recovery.consumeExternalDefiCatalogueAccountReopenV1(token);return account(input.runtime,input.system,input.poolIndex,saved.config);},
}});
async function keeper(input,saved){const path=input.journal.path;let record;
 if(saved)record=await new Vault(path).read(input.journal.password);else record=await new Vault(path).create({requests:[]},input.journal.password);
 const world=actions.get(path)??{sends:0};actions.set(path,world);
 const value={
 async prepare(request){if(world.rejectPreparation)throw Error('HOST_PREPARATION_REJECTED');const bound={...copy(request),bindingSHA256:h({request,config:input.portfolio.config}),assetBindingSHA256:h(input.portfolio.config.registry[0])};const prior=record.data.requests.find(row=>row.request.requestId===request.requestId);if(prior){assert.deepEqual(prior.request,bound);return {request:copy(prior.request)};}record=await new Vault(path).update(input.journal.password,record.revision,data=>({requests:[...data.requests,{request:bound,state:'PREPARED',generation:0}]}));return {request:copy(bound)};},
 async execute(id){const row=record.data.requests.find(row=>row.request.requestId===id);assert.ok(row);if(row.state!=='CONFIRMED'){world.sends++;record=await new Vault(path).update(input.journal.password,record.revision,data=>({requests:data.requests.map(row=>({...row,state:'CONFIRMED'}))}));if(world.loseReply){world.loseReply=false;throw Error('HOST_LOST_REPLY');}}return {request:copy(row.request)};},
 async reconcile(id){const row=record.data.requests.find(row=>row.request.requestId===id);assert.ok(row);world.reconciles=(world.reconciles??0)+1;return {state:row.state,generation:row.generation};},
 async privateStatus(){return {requests:record.data.requests.map(row=>({request:copy(row.request),phase:row.state,generation:row.generation}))};},
 async snapshot(){return {revision:record.revision,storageAvailable:true,requests:record.data.requests.map(row=>({requestId:row.request.requestId,assetId:row.request.assetId,kind:row.request.kind,state:row.state}))};},
 close(){keepers.get(value).closed=true;return {closed:true};},
 };keepers.set(value,{input,record:()=>record,closed:false});return value;
}
mock.module(new URL('../../../src/accounts/portfolio/flat-manual-portfolio-keeper.mjs',import.meta.url),{exports:{createFlatManualPortfolioKeeper:()=>{throw Error('HOST_LEGACY_FACTORY_FORBIDDEN');},createRetainedFlatManualPortfolioKeeperV1:input=>keeper(input),
 assertOwnedFlatManualPortfolioKeeper:(value,expected)=>{const state=keepers.get(value);assert.ok(state&&!state.closed);assert.equal(state.input.runtime,expected.runtime);assert.equal(state.input.portfolio,expected.portfolio);},
 captureRetainedFlatManualPortfolioKeeperV1:async value=>{const state=keepers.get(value),record=state.record();value.close();return {schema:'EXTERNAL_FLAT_MANUAL_KEEPER_RECOVERY_V1',config:state.input.portfolio.config,journal:state.input.journal,checkpoint:{version:1,identitySHA256:h(state.input.portfolio.config),acknowledged:{revision:record.revision,stateSHA256:h(record.data)},pending:null}};},
 reopenRetainedFlatManualPortfolioKeeperV1:async token=>{const {input,saved}=recovery.consumeExternalDefiCatalogueKeeperReopenV1(token);return keeper(input,saved);},
}});
mock.module(new URL('../../../src/claims/wrapped/recovery/wrapped-recovery-authority-v1.mjs',import.meta.url),{exports:{
 retainWrappedPrivateLifetimePartV1:async(runtime,name,identity,privateState)=>{const handle={};lifetime.set(handle,{runtime,name,identity:copy(identity),privateState:copy(privateState)});return handle;},
 updateWrappedPrivateLifetimePartV1:async(handle,privateState)=>{lifetime.get(handle).privateState=copy(privateState);},
 assertWrappedPrivateLifetimePartSealedV1:handle=>assert.ok(lifetime.has(handle)),
 readWrappedPrivateLifetimePartV1:async(runtime,name,identity)=>{const rows=[...lifetime.entries()].filter(([,row])=>row.runtime===runtime&&row.name===name&&h(row.identity)===h(identity));assert.equal(rows.length,1);return {handle:rows[0][0],privateState:copy(rows[0][1].privateState)};},
 assertWrappedPrivateLifetimeAttemptV1:(runtime,identity)=>assert.equal(runtimes.get(runtime)?.sourceSHA256,identity.sourceSHA256),

 originalWrappedRecoverySectionIdentityV1:(token,section)=>{assert.equal(section,'wallet');const row=writes.get(token)??reads.get(token);assert.ok(row);return row.identity;},
 retainOriginalWrappedRecoverySectionV1:async(token,section,data)=>{assert.equal(section,'wallet');const row=writes.get(token);assert.ok(row&&!row.used);row.used=true;row.data=copy(data);},
 consumeOriginalWrappedRecoverySectionV1:(token,section)=>{assert.equal(section,'wallet');const row=reads.get(token);assert.ok(row&&!row.used);row.used=true;return copy(row.data);},
}});
const catalogues=await import('../../../src/accounts/storage/flat-journal-catalogue.mjs');
recovery=await import('../../../src/accounts/recovery/external-defi-catalogue-recovery-v1.mjs');
test('HOST original catalogue consumes admission before child preparation and retains it across retry and EXIT',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'catalogue-admission-host-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 const runtime={metadata:{evmGenesis:'0x'+h('genesis-budget')}},system={};runtimes.set(runtime,{system,owners:[{},{}],sourceSHA256:h('source-budget')});
 const config={accountId:'admission_account',journalId:'admission_account_journal',registry:[{assetId:h('budget-share'),kind:'ERC20',token:'33'.repeat(20),genesis:h('genesis-budget')}]};
 const original=account(runtime,system,0,config),members=[{poolIndex:0,account:original}],admissions=policy({runtime,system,accounts:members,routeOrder:[config.registry[0].assetId]});
 const parent=portfolio({runtime,system,accounts:members,accountId:'admission_portfolio',journalId:'admission_portfolio_journal'});
 const generation=await catalogues.createRetainedFlatJournalGenerationV1({runtime,portfolio:parent,poolAdmissions:admissions,journal:{path:join(directory,'keeper.vault'),password:'synthetic-keeper-password'}});
 const journal={path:join(directory,'catalogue.vault'),password:'synthetic-catalogue-password'};
 const catalogue=await catalogues.createRetainedFlatJournalCatalogueV1({runtime,initialGeneration:generation,journal});
 const request={requestId:'original_top_up',kind:'TOP_UP',assetId:config.registry[0].assetId,ownerOperationRef:h('budget-top-up')};
 actions.get(join(directory,'keeper.vault')).rejectPreparation=true;
 await assert.rejects(catalogue.keeper.prepare(request),/HOST_PREPARATION_REJECTED/);
 assert.equal(catalogue.status().admissionBudget.consumed,1);
 const durable=(await new Vault(journal.path).read(journal.password)).data;
 assert.deepEqual(durable.bindings[0].request,request,'the original AEAD journal counts before calling the child');
 actions.get(join(directory,'keeper.vault')).rejectPreparation=false;
 await catalogue.keeper.prepare(request);await catalogue.keeper.prepare(request);
 assert.equal(catalogue.status().admissionBudget.consumed,1,'same original request consumes only once');
 await assert.rejects(catalogue.keeper.prepare({...request,ownerOperationRef:h('rebind')}),/REQUEST_ID_REUSE/);
 const exit={...request,requestId:'original_budget_exit',kind:'EXIT',ownerOperationRef:h('budget-exit')};
 await catalogue.keeper.prepare(exit);await catalogue.keeper.execute(exit.requestId);
 assert.equal(catalogue.status().admissionBudget.consumed,1,'capital withdrawal never refunds admission');
 assert.equal(catalogue.status().bindings.length,2);
 await catalogue.keeper.close();
});
test('HOST reopened catalogue preserves original EXIT binding and lost-reply outcome on new objects; no fresh admission',async t=>{
 const directory=await mkdtemp(join(tmpdir(),'external-catalogue-host-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 const runtime={metadata:{evmGenesis:'0x'+h('genesis')}},system={},owners=[{},{}],sourceSHA256=h('source');runtimes.set(runtime,{system,owners,sourceSHA256});
 const config={accountId:'original_account',journalId:'original_account_journal',registry:[{assetId:h('share'),kind:'ERC20',token:'22'.repeat(20),genesis:h('genesis')}]};
 const original=account(runtime,system,0,config),members=[{poolIndex:0,account:original}],admissions=policy({runtime,system,accounts:members,routeOrder:[config.registry[0].assetId]});
 const parent=portfolio({runtime,system,accounts:members,accountId:'original_portfolio',journalId:'original_portfolio_journal'});
 const generation=await catalogues.createRetainedFlatJournalGenerationV1({runtime,portfolio:parent,poolAdmissions:admissions,journal:{path:join(directory,'keeper.vault'),password:'synthetic-keeper-password'}});
 const catalogue=await catalogues.createRetainedFlatJournalCatalogueV1({runtime,initialGeneration:generation,journal:{path:join(directory,'catalogue.vault'),password:'synthetic-catalogue-password'}});
 const request={requestId:'original_exit_01',kind:'EXIT',assetId:config.registry[0].assetId,ownerOperationRef:h('original-owner-reference')};
 await catalogue.keeper.prepare(request);actions.get(join(directory,'keeper.vault')).loseReply=true;await assert.rejects(catalogue.keeper.execute(request.requestId),/HOST_LOST_REPLY/);
 const oldStatus=catalogue.status(),capture={identity:{sourceSHA256}},writeToken=Object.freeze({});writes.set(writeToken,capture);
 await recovery.retainExternalDefiCatalogueForReopenV1(catalogue,writeToken);assert.equal(capture.used,true);
 const token=Object.freeze({});reads.set(token,{identity:{sourceSHA256},data:capture.data});
 const reopened=await recovery.reopenExternalDefiCatalogueFromRecoveryV1({runtime,system,owners,attemptAuthority:token});
 assert.notEqual(reopened,catalogue);assert.deepEqual(reopened.status().bindings,oldStatus.bindings);assert.deepEqual(reopened.status().generations,oldStatus.generations);
 await assert.rejects(catalogue.keeper.execute(request.requestId),/UNAVAILABLE/);
 await reopened.keeper.execute(request.requestId);assert.equal(actions.get(join(directory,'keeper.vault')).sends,1);assert.equal(actions.get(join(directory,'keeper.vault')).reconciles,1);
 await assert.rejects(reopened.keeper.prepare({...request,requestId:'replacement_exit'}),/RECOVERY_ORIGINAL_REQUEST_ONLY/);
 assert.throws(()=>recovery.consumeExternalDefiCatalogueReopenV1(Object.freeze({})),/ORIGINAL_REOPEN_TOKEN/);
 assert.equal(reopened.status().pendingOwnerPreparation,null);assert.equal(reopened.status().admissionFault,true);
 await reopened.keeper.close();
});
