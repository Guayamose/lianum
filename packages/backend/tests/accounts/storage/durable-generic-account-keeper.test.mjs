/** Real coordinator, encrypted parent and SOURCE checkpoint transaction.
 * Lower authority/SOURCE fixtures do not stand in for economic acceptance. */
import test, {mock} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createDurableGenericAccountKeeperV1, reopenDurableGenericAccountKeeperV1, captureDurableGenericAccountKeeperV1,
  bindOriginalNativeSourceSessionKeeperV1, readOriginalNativeSourceSessionKeeperV1} from '../../../src/accounts/storage/durable-generic-account-keeper.mjs';
import {createGenericAccountKeeper, assertOriginalGenericAccountKeeperV1} from '@lianum/engine/accounts/keeper';
import {genericAccountIdentity} from '@lianum/engine/accounts/journal';
import {Vault} from '@lianum/engine/crypto/vault';
import {startGenericAccountKeeper} from '@lianum/engine/accounts/coordinator-lifecycle';
import * as durableKeeperAPI from '../../../src/accounts/storage/durable-generic-account-keeper.mjs';
import {processIdentity} from '../../../src/operations/recovery/source-journal/process-identity-v1.mjs';

const h = n => n.toString(16).padStart(64, '0');
const registry = [{assetId: h(1), kind: 'NATIVE', symbol: 'ETH', decimals: 18, chainId: '31337', genesis: h(2), pool: '3'.repeat(40), scope: h(4), policy: h(5), token: '0'.repeat(40), codeHash: h(6), assetIdentity: h(7), custody: 'ONCHAIN_NOTE_POOL', trust: 'PINNED_LOCAL_CONTRACT_AND_TRUSTED_NATIVE_ISSUER'}];
const config = {journalId: 'journal_process_01', accountId: 'account_process_01', lifetime: h(8), registry};
const request = {requestId: 'request_process_01', assetId: h(1), kind: 'GRAPH', ownerOperationRef: h(9)};

test('HOST SOURCE original session retains keeper candidates before CAS and its real child checkpoint', async t => {
  // Only lower authority and SOURCE retention ports are synthetic. The session,
  // keeper membership, coordinator child, segmented parent and AEAD are real.
  const directory=await mkdtemp(join(tmpdir(),'source-original-keeper-'));
  const journal={path:join(directory,'journal.vault'),password:'synthetic-source-journal-secret'};
  const sourcePassword='synthetic-source-capsule-secret',sourceVault=new Vault(join(directory,'section.vault'));
  const backend=new URL('../../../src/',import.meta.url),owner={},runtime={},system={claimsEnabled:false};
  const handle=Object.freeze(Object.create(null)),token=Object.freeze(Object.create(null));
  const identity={profile:'NATIVE_VALUE_DURABLE_SOURCE_RECOVERY_V1',directory,runId:'synthetic_source_session',sourceSHA256:h(60),deadlineMs:Date.now()+60000};
  const sourceRequest={...request,kind:'TOP_UP'},approval=Object.freeze({fixture:'original-note'});
  let sectionRecord=null,updates=0,failAfterCandidate=false,prepared=null,effects=0,keeper,session;
  const authority={
    async assertAuthority(value){assert.deepEqual(value,genericAccountIdentity(config));return{version:1,available:true,identity:value};},
    async prepare(value){assert.ok(sectionRecord.data.candidate);prepared=value;return{version:1,state:'PREPARED',bindingSHA256:value.bindingSHA256,assetBindingSHA256:value.assetBindingSHA256};},
    async execute(value){effects++;assert.deepEqual(value,prepared);assert.ok(sectionRecord.data.candidate);return{version:1,state:'CONFIRMED',bindingSHA256:value.bindingSHA256,assetBindingSHA256:value.assetBindingSHA256,outcomeId:h(80),disposition:'APPLIED',blockNumber:'20',blockHash:h(81)};},
    async reconcile(){throw Error('no reconciliation admitted in fixture');},async recover(){throw Error('no recovery admitted in fixture');},
    async observe({request:value,outcome,challenge}){return{version:1,status:'LIVE',bindingSHA256:value.bindingSHA256,assetBindingSHA256:value.assetBindingSHA256,
      outcomeId:outcome.outcomeId,challenge,observedAt:Date.now(),blockNumber:'20',blockHash:h(81),canonicalOutcomeBlockHash:h(81),backing:{held:'10',liabilities:'10',surplus:'0',deficit:'0'}};},
  };
  const account={config,authority,features:{nativeManualNoteConsent:true},ownerView(){return{};}};
  const mocks=[],forbidden=()=>{throw Error('HOST_SOURCE_UNUSED_PORT');};
  const lowerModules=new Map();
  const install=(path,exports)=>{lowerModules.set(path,exports);mocks.push(mock.module(new URL(path,backend),{exports}));};
  const unused=(path,names)=>install(path,Object.fromEntries(names.map(name=>[name,forbidden])));
  t.after(async()=>{try{await session?.close().catch(()=>{});await keeper?.close().catch(()=>{});}finally{for(const installed of mocks.reverse())installed.restore();await rm(directory,{recursive:true,force:true});}});
  install('accounts/authority/native-value-account-authority-v2.mjs',{
    assertOwnedNativeValueAccountAuthority(value,binding){assert.equal(value,account);assert.equal(binding.runtime,runtime);assert.equal(binding.system,system);assert.equal(binding.poolIndex,0);if(binding.owner!==undefined)assert.equal(binding.owner,owner);},
    assertOriginalNativeAccountSourceV1(value,binding){assert.equal(value,account);assert.deepEqual(binding,identity);},
    nativeValueAccountManualGraphDetails:forbidden,assertNativeValueAccountManualGraphExecution:forbidden,
    nativeValueAccountManualNoteDetails(value){assert.equal(value,approval);return{account,body:sourceRequest,review:{fixture:'lower-original-note-consent'}};},
  });
  const sourcePorts={
    nativeSourceRecoverySectionIdentityV1(value,part){assert.equal(value,token);assert.equal(part,'session');return identity;},
    async nativeSourceRecoveryOwnedProcessV1(value,part,pid){assert.equal(value,token);assert.equal(part,'session');assert.notEqual(pid,process.pid);return processIdentity(pid);},
    async retainOriginalNativeSourceSectionV1(value,part,section){assert.equal(value,token);assert.equal(part,'session');assert.equal(sectionRecord,null);sectionRecord=await sourceVault.create(section,sourcePassword);return handle;},
    async updateOriginalNativeSourceSectionV1(original,next){assert.equal(original,handle);updates++;
      const actual=await sourceVault.read(sourcePassword);assert.deepEqual(actual,sectionRecord);
      const stored=await sourceVault.update(sourcePassword,actual.revision,()=>next);assert.deepEqual(await sourceVault.read(sourcePassword),stored);sectionRecord=stored;
      if(failAfterCandidate&&next.candidate?.kind==='KEEPER_CAS')throw Object.assign(new Error('SYNTHETIC_SOURCE_REPLY_LOST'),{code:'SYNTHETIC_SOURCE_REPLY_LOST'});
    },
    consumeOriginalNativeSourceSectionV1:forbidden,resumeOriginalNativeSourceSectionV1:forbidden,
  };
  install('operations/deployments/native-value/native-value-system-v2.mjs',{
    nativeValueOriginalRecoverySourceV1(value,contracts){assert.equal(value,runtime);assert.equal(contracts,system);return identity.sourceSHA256;},
  });
  unused('accounts/authority/flat-portfolio-authority.mjs',['assertOwnedFlatPortfolio','assertOwnedFlatPortfolioAccount']);
  unused('accounts/authority/flat-account-authority.mjs',['flatAccountManualGraphDetails','assertFlatAccountManualGraphExecution']);
  unused('claims/wrapped/recovery/wrapped-recovery-authority-v1.mjs',['assertNativeEconomicRecoveryCaptureV1','nativeEconomicRecoverySectionIdentityV1','consumeNativeEconomicRecoverySectionV1']);
  unused('accounts/authority/wrapped-wallet-account-authority-v1.mjs',['wrappedWalletAccountManualGraphDetailsV1','assertWrappedWalletAccountManualGraphExecutionV1']);
  unused('accounts/portfolio/wrapped-wallet-portfolio-v1.mjs',['assertOwnedWrappedWalletPortfolioV1','assertOwnedWrappedWalletPortfolioAccountV1','claimWrappedWalletPortfolioJournalV1']);
  unused('claims/operations/portfolio-view.mjs',['readOriginalNativeClaimPortfolioViewV1']);
  const economic=Object.freeze({async close(){return{closed:true};}});let economicInput;
  install('accounts/state/original-wallet-economic-state-v1.mjs',{
    async createOriginalWalletEconomicStateV1(input){economicInput=input;return economic;},
    assertOriginalWalletEconomicStateV1(value){assert.equal(value,economic);},
    assertOriginalWalletEconomicStateJournalV1(value,settings){assert.equal(value,economic);assert.deepEqual(settings,economicInput.journal);},
    originalWalletEconomicStateBindingsV1(value){assert.equal(value,economic);return economicInput.nativeAccounts;},
  });
  install('accounts/storage/durable-generic-account-keeper.mjs',{
    ...durableKeeperAPI,
    async createDurableGenericAccountKeeperV1(input){assert.equal(keeper,undefined);keeper=await createDurableGenericAccountKeeperV1(input);return keeper;},
  });
  const {buildNativeManualSessionV1}=await import('../../../src/api/accounts/native-manual-session-backend-v1.mjs');
  const actual=buildNativeManualSessionV1({account:lowerModules.get('accounts/authority/native-value-account-authority-v2.mjs'),
    economic:{...lowerModules.get('claims/wrapped/recovery/wrapped-recovery-authority-v1.mjs'),...lowerModules.get('operations/deployments/native-value/native-value-system-v2.mjs')},
    source:sourcePorts,resources:{loadDurableKeeper:()=>import('../../../src/accounts/storage/durable-generic-account-keeper.mjs'),
      loadAccountSession:()=>import('../../../src/api/accounts/flat-account-session.mjs'),loadEconomicState:()=>import('../../../src/accounts/state/original-wallet-economic-state-v1.mjs')}});
  install('operations/recovery/native-original-source-lifecycle-v1.mjs',{...sourcePorts,...actual});
  const joined=await actual.createOriginalNativeSourceGraphAccountSessionV1(token,{runtime,system,poolIndex:0,account,journal,owner});
  session=joined.session;
  const snapshot=await readOriginalNativeSourceSessionKeeperV1(keeper,session);
  assert.throws(()=>actual.assertOriginalNativeSessionSourceKeeperV1({...session},keeper),{code:'NATIVE_SOURCE_ORIGINAL_SESSION_REQUIRED'});
  assert.throws(()=>actual.assertOriginalNativeSessionSourceKeeperV1(session,{...keeper}),{code:'NATIVE_SOURCE_ORIGINAL_KEEPER_CHANGED'});
  assert.equal(snapshot.ownedProcesses.length,1);assert.deepEqual(Object.keys(snapshot.ownedProcesses[0]).sort(),['pgrp','pid','session','startTicks','uid']);
  assert.equal(snapshot.ownedProcesses[0].uid,process.getuid());assert.ok(snapshot.ownedProcesses[0].pid!==process.pid);
  assert.deepEqual(snapshot.ownedProcesses[0],await processIdentity(snapshot.ownedProcesses[0].pid));
  await assert.rejects(readOriginalNativeSourceSessionKeeperV1(keeper,{}),{code:'JOURNAL_SOURCE_ORIGINAL_SESSION_CHANGED'});
  await joined.bindManualNote(approval);
  const admitted=session.prepare(sourceRequest);assert.equal(admitted.admitted,true);
  const ready=await session.idle();assert.equal(ready.requests[0].state,'PREPARED');assert.equal(ready.admissions.at(-1).state,'SUCCEEDED');
  assert.equal(sectionRecord.data.candidate,null);assert.ok(updates>=4);assert.equal(sectionRecord.data.confirmed.journalRevision,(await keeper.snapshot()).revision);
  const current=await readOriginalNativeSourceSessionKeeperV1(keeper,session);assert.deepEqual(sectionRecord.data.confirmed.keeper,current.keeper);
  failAfterCandidate=true;
  assert.equal(session.execute(sourceRequest.requestId).admitted,true);
  const failed=await session.idle();assert.equal(failed.admissions.at(-1).state,'FAILED');
  assert.equal(effects,0);assert.equal(sectionRecord.data.candidate.kind,'KEEPER_CAS');
  await assert.rejects(readOriginalNativeSourceSessionKeeperV1(keeper,session),{code:'NATIVE_SOURCE_SESSION_UNAVAILABLE'});
  await assert.rejects(joined.bindManualNote(approval),{code:'NATIVE_SOURCE_SESSION_UNAVAILABLE'});
  assert.equal(effects,0);assert.deepEqual(await new Vault(journal.path).read(journal.password).then(value=>value.data.requests[0].state),'PREPARED');
});

test('durable identity survives capture/reopen and rejects copies, generic keepers and stale reopen descriptors', {timeout: 30000}, async t => {
  const directory = await mkdtemp(join(tmpdir(), 'durable-keeper-identity-'));
  const journal = {path: join(directory, 'account.vault'), password: 'synthetic-durable-journal-secret'};
  const noOperation = async () => {throw Error('fixture does not authorize operations');};
  const authority = {
    async assertAuthority(identity) {
      assert.deepEqual(identity, genericAccountIdentity(config));
      return {version: 1, available: true, identity};
    },
    prepare: noOperation, execute: noOperation, reconcile: noOperation, recover: noOperation, observe: noOperation,
  };
  const live = [];
  t.after(async () => {for (const keeper of live) await keeper.close().catch(() => {}); await rm(directory, {recursive: true, force: true});});
  const input = {config, journal, authority};
  await assert.rejects(createDurableGenericAccountKeeperV1({...input, persistence: {retain() {}}}), {code: 'JOURNAL_KEEPER_FIELDS'});
  const keeper = await createDurableGenericAccountKeeperV1(input); live.push(keeper);
  assertOriginalGenericAccountKeeperV1(keeper, {config, authority});
  for (const copy of [{...keeper}, Object.freeze({...keeper}), new Proxy(keeper, {})]) {
    assert.throws(() => assertOriginalGenericAccountKeeperV1(copy, {config, authority}), {code: 'JOURNAL_ORIGINAL_KEEPER_REQUIRED'});
    await assert.rejects(captureDurableGenericAccountKeeperV1(copy), {code: 'JOURNAL_ORIGINAL_KEEPER_REQUIRED'});
    await assert.rejects(bindOriginalNativeSourceSessionKeeperV1(copy, {}), {code: 'JOURNAL_ORIGINAL_KEEPER_REQUIRED'});
  }
  const generic = await createGenericAccountKeeper({...input, journal: {...journal, path: join(directory, 'generic.vault')}}); live.push(generic);
  await assert.rejects(captureDurableGenericAccountKeeperV1(generic), {code: 'JOURNAL_ORIGINAL_KEEPER_REQUIRED'});
  // Implementing the engine's persistence port grants no durable membership.
  const forged = await startGenericAccountKeeper({...input, journal: {...journal, path: join(directory, 'forged.vault')}}, {}, {
    opening: {create: true, checkpoint: null, pendingCheckpoint: null}, retain() {}, close() {},
  }); live.push(forged.keeper);
  await assert.rejects(captureDurableGenericAccountKeeperV1(forged.keeper), {code: 'JOURNAL_ORIGINAL_KEEPER_REQUIRED'});
  await assert.rejects(bindOriginalNativeSourceSessionKeeperV1(forged.keeper, {}), {code: 'JOURNAL_ORIGINAL_KEEPER_REQUIRED'});
  const snapshot = await keeper.snapshot();
  const retained = await captureDurableGenericAccountKeeperV1(keeper);
  assert.equal(retained.checkpoint.revision, snapshot.revision);
  assert.equal(retained.journal.password, journal.password);
  assert.throws(() => assertOriginalGenericAccountKeeperV1(keeper, {config, authority}), {code: 'JOURNAL_COORDINATOR_UNAVAILABLE'});
  await assert.rejects(keeper.snapshot(), {code: 'JOURNAL_COORDINATOR_UNAVAILABLE'});
  const reopened = await reopenDurableGenericAccountKeeperV1(input, retained); live.push(reopened);
  assertOriginalGenericAccountKeeperV1(reopened, {config, authority});
  assert.deepEqual(await reopened.snapshot(), snapshot);
  await reopened.close();
  await assert.rejects(reopenDurableGenericAccountKeeperV1(input, retained), {code: 'JOURNAL_PARENT_CHECKPOINT_CHANGED'});
});
