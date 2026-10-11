/** Real coordinator, encrypted parent and SOURCE checkpoint transaction.
 * Synthetic authority/session fixtures do not stand in for economic acceptance. */
import test, {mock} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, readFile, rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createDurableGenericAccountKeeperV1, reopenDurableGenericAccountKeeperV1, captureDurableGenericAccountKeeperV1,
  bindOriginalNativeSourceSessionKeeperV1, readOriginalNativeSourceSessionKeeperV1} from '../../../src/accounts/storage/durable-generic-account-keeper.mjs';
import {createGenericAccountKeeper, assertOriginalGenericAccountKeeperV1} from '@lianum/engine/accounts/keeper';
import {genericAccountIdentity, sha} from '@lianum/engine/accounts/journal';
import {Vault} from '@lianum/engine/crypto/vault';
import {startGenericAccountKeeper} from '@lianum/engine/accounts/coordinator-lifecycle';
import {moduleResource, sourcePath} from '@lianum/environment';

const h = n => n.toString(16).padStart(64, '0');
const registry = [{assetId: h(1), kind: 'NATIVE', symbol: 'ETH', decimals: 18, chainId: '31337', genesis: h(2), pool: '3'.repeat(40), scope: h(4), policy: h(5), token: '0'.repeat(40), codeHash: h(6), assetIdentity: h(7), custody: 'ONCHAIN_NOTE_POOL', trust: 'PINNED_LOCAL_CONTRACT_AND_TRUSTED_NATIVE_ISSUER'}];
const config = {journalId: 'journal_process_01', accountId: 'account_process_01', lifetime: h(8), registry};
const request = {requestId: 'request_process_01', assetId: h(1), kind: 'GRAPH', ownerOperationRef: h(9)};

test('HOST SOURCE original session retains keeper candidates before CAS and its real child checkpoint', async t => {
  // These lower account/source memberships are explicitly synthetic. Keeper,
  // child IPC, segmented parent, AEAD and SOURCE session hook bodies are real.
  const directory=await mkdtemp(join(tmpdir(),'source-original-keeper-'));
  const journal={path:join(directory,'journal.vault'),password:'synthetic-source-journal-secret'};
  const sourcePassword='synthetic-source-capsule-secret',sourceVault=new Vault(join(directory,'section.vault'));
  const canonicalGraph=sourcePath('packages/backend/src/api/accounts/flat-manual-graph-session.mjs');
  const graphURL=moduleResource(import.meta.url,'packages/backend/src/api/accounts/flat-manual-graph-session.mjs','../api/flat-manual-graph-session.mjs');
  const keeperURL=moduleResource(import.meta.url,'packages/backend/src/accounts/storage/durable-generic-account-keeper.mjs','../account/durable-generic-account-keeper.mjs');
  const account={config},owner={},runtime={},system={},session=Object.freeze(Object.create(null));
  const identity={profile:'NATIVE_VALUE_DURABLE_SOURCE_RECOVERY_V1',directory,runId:'synthetic_source_session',sourceSHA256:h(60),deadlineMs:Date.now()+60000};
  const sessions=new WeakMap(),handle=Object.freeze(Object.create(null));let sectionRecord=null,updates=0,failAfterCandidate=false;
  const need=(value,code)=>{if(!value)throw Object.assign(new Error(code),{code});};
  const port=async(original,next)=>{assert.equal(original,handle);updates++;
    const actual=await sourceVault.read(sourcePassword);assert.deepEqual(actual,sectionRecord);
    const stored=await sourceVault.update(sourcePassword,actual.revision,()=>next);assert.deepEqual(await sourceVault.read(sourcePassword),stored);sectionRecord=stored;
    if(failAfterCandidate&&next.candidate?.kind==='KEEPER_CAS')throw Object.assign(new Error('SYNTHETIC_SOURCE_REPLY_LOST'),{code:'SYNTHETIC_SOURCE_REPLY_LOST'});
  };
  const source=await readFile(canonicalGraph,'utf8');
  const names=['originalSourceSessionState','assertOriginalNativeSessionSourceKeeperV1','sourceSessionPayload','updateSourceSession',
    'prepareOriginalNativeSessionKeeperSourceCheckpointV1','confirmOriginalNativeSessionKeeperSourceCheckpointV1','originalSourceSessionWork','sourceOwnedCoordinatorProcesses'];
  const body=names.map(name=>{const pattern=new RegExp('(?:export )?(?:async )?function '+name+'\\(');const match=pattern.exec(source);assert.ok(match);
    const start=match.index,end=source.indexOf('\n}',start)+2;assert.ok(end>start);return source.slice(start,end).replace(/^export /,'');}).join('\n')
    .replaceAll("'../../accounts/storage/durable-generic-account-keeper.mjs'",JSON.stringify(keeperURL.href));
  const actual=Function('sessions','need','assertOwnedNativeValueAccountAuthority','assertOriginalNativeAccountSourceV1','sha','genericAccountIdentity','originalNote',
    'updateOriginalNativeSourceSectionV1','exactRecord','nativeSourceRecoveryOwnedProcessV1',body+'\nreturn {assertOriginalNativeSessionSourceKeeperV1,prepareOriginalNativeSessionKeeperSourceCheckpointV1,confirmOriginalNativeSessionKeeperSourceCheckpointV1,originalSourceSessionWork};')
    (sessions,need,(value,expected)=>{assert.equal(value,account);assert.equal(expected.owner,owner);},(value,binding)=>{assert.equal(value,account);assert.deepEqual(binding,identity);},
      sha,genericAccountIdentity,()=>{throw Error('synthetic fixture has no note grants');},port,(value,fields)=>assert.deepEqual(Object.keys(value).sort(),[...fields].sort()),
      async(token,part,pid)=>{assert.equal(token,handle);assert.equal(part,'session');const actual=await readOriginalNativeSourceSessionKeeperV1(keeper,session);assert.equal(actual.ownedProcesses[0].pid,pid);return actual.ownedProcesses[0];});
  const mocked=mock.module(graphURL.href,{namedExports:actual});t.after(()=>mocked.restore());
  const sourceRequest={...request,kind:'TOP_UP'};
  let prepared=null,effects=0,keeper;
  const authority={
    async assertAuthority(value){assert.deepEqual(value,genericAccountIdentity(config));return{version:1,available:true,identity:value};},
    async prepare(value){assert.ok(sectionRecord.data.candidate);prepared=value;return{version:1,state:'PREPARED',bindingSHA256:value.bindingSHA256,assetBindingSHA256:value.assetBindingSHA256};},
    async execute(value){effects++;assert.deepEqual(value,prepared);assert.ok(sectionRecord.data.candidate);return{version:1,state:'CONFIRMED',bindingSHA256:value.bindingSHA256,assetBindingSHA256:value.assetBindingSHA256,outcomeId:h(80),disposition:'APPLIED',blockNumber:'20',blockHash:h(81)};},
    async reconcile(){throw Error('no reconciliation admitted in fixture');},async recover(){throw Error('no recovery admitted in fixture');},
    async observe({request:value,outcome,challenge}){return{version:1,status:'LIVE',bindingSHA256:value.bindingSHA256,assetBindingSHA256:value.assetBindingSHA256,
      outcomeId:outcome.outcomeId,challenge,observedAt:Date.now(),blockNumber:'20',blockHash:h(81),canonicalOutcomeBlockHash:h(81),backing:{held:'10',liabilities:'10',surplus:'0',deficit:'0'}};},
  };
  t.after(async()=>{await keeper?.close().catch(()=>{});await rm(directory,{recursive:true,force:true});});
  keeper=await createDurableGenericAccountKeeperV1({config,journal,authority});
  const state={runtime,system,poolIndex:0,nativeAccount:account,durableKeeper:keeper,nativeFence:null,nativeCaptured:false,graphs:new Map(),notes:new Map(),
    nativeSource:{identity,owner,session,handle,token:handle,section:null,busy:false,fault:false}};sessions.set(session,state);
  const snapshot=await readOriginalNativeSourceSessionKeeperV1(keeper,session);
  const seed={schema:'ORIGINAL_NATIVE_SOURCE_SESSION_SEED_V1',sourceSHA256:identity.sourceSHA256,poolIndex:0,accountIdentitySHA256:sha(genericAccountIdentity(config)),
    journalRevision:snapshot.keeper.checkpoint.revision,keeper:snapshot.keeper,notes:[]};
  const section={schema:'ORIGINAL_NATIVE_SOURCE_SESSION_SECTION_V1',sourceSHA256:identity.sourceSHA256,ownedProcesses:snapshot.ownedProcesses,confirmed:seed,candidate:null};
  sectionRecord=await sourceVault.create(section,sourcePassword);state.nativeSource.section=structuredClone(section);
  await assert.rejects(bindOriginalNativeSourceSessionKeeperV1(keeper, {...session}), {code: 'NATIVE_SOURCE_ORIGINAL_SESSION_REQUIRED'});
  await bindOriginalNativeSourceSessionKeeperV1(keeper,session);
  assert.equal(snapshot.ownedProcesses.length,1);assert.deepEqual(Object.keys(snapshot.ownedProcesses[0]).sort(),['pgrp','pid','session','startTicks','uid']);
  assert.equal(snapshot.ownedProcesses[0].uid,process.getuid());assert.ok(snapshot.ownedProcesses[0].pid!==process.pid);
  await assert.rejects(readOriginalNativeSourceSessionKeeperV1(keeper,{}),{code:'JOURNAL_SOURCE_ORIGINAL_SESSION_CHANGED'});
  const result=await actual.originalSourceSessionWork(session,()=>keeper.prepare(sourceRequest));assert.equal(result.state,'PREPARED');
  assert.equal(sectionRecord.data.candidate,null);assert.ok(updates>=4);assert.equal(sectionRecord.data.confirmed.journalRevision,(await keeper.snapshot()).revision);
  const current=await readOriginalNativeSourceSessionKeeperV1(keeper,session);assert.deepEqual(sectionRecord.data.confirmed.keeper,current.keeper);
  failAfterCandidate=true;
  await assert.rejects(actual.originalSourceSessionWork(session,()=>keeper.execute(sourceRequest.requestId)));
  assert.equal(effects,0);assert.equal(state.nativeSource.fault,true);assert.equal(sectionRecord.data.candidate.kind,'KEEPER_CAS');
  await assert.rejects(readOriginalNativeSourceSessionKeeperV1(keeper,session),{code:'NATIVE_SOURCE_SESSION_UNAVAILABLE'});
  await assert.rejects(actual.originalSourceSessionWork(session,()=>keeper.execute(sourceRequest.requestId)),{code:'NATIVE_SOURCE_SESSION_UNAVAILABLE'});
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
