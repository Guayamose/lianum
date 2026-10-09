/** Surviving same-host account keeper. Authority/custody lifetime is injected,
 * never reconstructed from a fresh pool, ref, balance or replacement runtime. */
import {types} from 'node:util';
import {open} from 'node:fs/promises';
import {dirname} from 'node:path';
import {genericAccountIdentity, immutable, need, same, sha, validateCheckpoint, validateGenericAccountConfig} from './generic-account-journal.mjs';
import {createGenericAccountCoordinatorProcess, validateJournalCredentials, readOriginalGenericAccountCoordinatorIdentityV1} from './generic-account-process.mjs';

function capabilities(value, fields) {
  need(value && !types.isProxy(value) && Object.getPrototypeOf(value) === Object.prototype && Reflect.ownKeys(value).length === fields.length && fields.every(k => Object.hasOwn(Object.getOwnPropertyDescriptor(value, k) ?? {}, 'value')), 'JOURNAL_KEEPER_FIELDS');
}
const durableKeepers = new WeakMap(), originalKeepers = new WeakMap();
export function assertOriginalGenericAccountKeeperV1(keeper, expected) {
  need(arguments.length===2,'JOURNAL_ORIGINAL_KEEPER_REQUIRED'); capabilities(expected,['config','authority']);
  const original=originalKeepers.get(keeper); need(original&&original.authority===expected.authority,'JOURNAL_ORIGINAL_KEEPER_REQUIRED');
  same(original.config,validateGenericAccountConfig(expected.config),'JOURNAL_ORIGINAL_CONFIG_CHANGED'); original.live();
}
export async function createGenericAccountKeeper(input, options = {}) { return accountKeeper(input,options,null); }
export async function createDurableGenericAccountKeeperV1(input,lifetimeHandle=null) { return accountKeeper(input,{}, {create:true,lifetimeHandle}); }
export async function reopenDurableGenericAccountKeeperV1(input,retained,lifetimeHandle=null) {
  capabilities(retained,['schema','config','journal','checkpoint','pendingCheckpoint','parentCheckpoint']);
  need(retained.schema==='WRAPPED_DURABLE_GRAPH_KEEPER_V1','JOURNAL_ORIGINAL_KEEPER_REQUIRED');
  same(input.config,retained.config,'JOURNAL_ORIGINAL_CONFIG_CHANGED');same(input.journal,retained.journal,'JOURNAL_ORIGINAL_CREDENTIALS_CHANGED');
  return accountKeeper(input,{}, {create:false,retained,lifetimeHandle});
}
/** Private caller must possess the original opaque keeper. Capture is terminal
 * even when publication later fails; no listener or request can adopt it. */
export async function captureDurableGenericAccountKeeperV1(keeper) {
  const state=durableKeepers.get(keeper);need(state,'JOURNAL_ORIGINAL_KEEPER_REQUIRED');return state.capture();
}
/** Private SOURCE join validates both original references in the session's
 * own WeakMap. Ordinary keepers retain their existing lifecycle and ABI. */
export async function bindOriginalNativeSourceSessionKeeperV1(keeper,session) {
  need(arguments.length===2,'JOURNAL_SOURCE_ARGUMENTS');const state=durableKeepers.get(keeper);need(state,'JOURNAL_ORIGINAL_KEEPER_REQUIRED');return state.bindSource(session);
}
export async function readOriginalNativeSourceSessionKeeperV1(keeper,session) {
  need(arguments.length===2,'JOURNAL_SOURCE_ARGUMENTS');const state=durableKeepers.get(keeper);need(state,'JOURNAL_ORIGINAL_KEEPER_REQUIRED');return state.readSource(session);
}
export async function readOriginalNativeSourceSessionKeeperCandidateV1(keeper,session) {
  need(arguments.length===2,'JOURNAL_SOURCE_ARGUMENTS');const state=durableKeepers.get(keeper);need(state,'JOURNAL_ORIGINAL_KEEPER_REQUIRED');return state.readSourceCandidate(session);
}
async function accountKeeper(input, options = {}, durable) {
  capabilities(input, ['config', 'journal', 'authority']);
  capabilities(options, Object.hasOwn(options, 'afterHostOperation') ? ['afterHostOperation'] : []);
  const config = validateGenericAccountConfig(input.config), journal = validateJournalCredentials(input.journal), authority = input.authority;
  need(authority && ['assertAuthority', 'prepare', 'execute', 'reconcile', 'recover', 'observe'].every(k => typeof authority[k] === 'function'), 'JOURNAL_KEEPER_REQUIRED');
  const afterHostOperation = options.afterHostOperation ?? (async () => {});
  need(typeof afterHostOperation === 'function', 'JOURNAL_TEST_HOOK');
  const identity = genericAccountIdentity(config);
  let worker, checkpoint = null, pendingCheckpoint = null, busy = false, closed = false, capturing=false, fault=false, parentStore=null,parentRecord=null,sourceSession=null;
  if(durable){
    const {createClaimRecordStore,openClaimRecordStore}=await import('../../../../backend/src/claims/storage/segmented-record-store.mjs');
    const settings={path:journal.path+'.private-parent-v1',password:journal.password,identity:{profile:'WRAPPED_GRAPH_PARENT_CHECKPOINT_V1',identity}};
    parentStore=durable.create?await createClaimRecordStore(settings,{checkpoint:null,pendingCheckpoint:null}):await openClaimRecordStore(settings);
    try{
      parentRecord=await parentStore.read();
      if(!durable.create){same({revision:parentRecord.revision,commitment:parentRecord.commitment},durable.retained.parentCheckpoint,'JOURNAL_PARENT_CHECKPOINT_CHANGED');
        same(parentRecord.data,{checkpoint:durable.retained.checkpoint,pendingCheckpoint:durable.retained.pendingCheckpoint},'JOURNAL_PARENT_CHECKPOINT_CHANGED');
        checkpoint=immutable(parentRecord.data.checkpoint);pendingCheckpoint=parentRecord.data.pendingCheckpoint===null?null:immutable(parentRecord.data.pendingCheckpoint);
        // Persisted one-use admission survives failed startup and separate
        // authorities holding a copied original private descriptor.
        const marker=settings.path+'.reopen-'+parentRecord.commitment+'.claimed';
        const claim=await open(marker,'wx',0o600);try{await claim.writeFile(JSON.stringify({profile:'WRAPPED_GRAPH_PARENT_REOPEN_V1',commitment:parentRecord.commitment})+'\n');await claim.sync();}finally{await claim.close();}
        const directory=await open(dirname(marker),'r');try{await directory.sync();}finally{await directory.close();}
      }
    }catch(error){parentStore.close();throw error;}
  }
  async function persistCheckpoints(){
    if(!parentStore)return;
    try{
      if(sourceSession){const source=await import('../../../../backend/src/api/accounts/flat-manual-graph-session.mjs');
        await source.prepareOriginalNativeSessionKeeperSourceCheckpointV1(sourceSession,keeper);}
      const next=await parentStore.update(parentRecord.revision,()=>({checkpoint,pendingCheckpoint}));const actual=await parentStore.read();same(actual,next,'JOURNAL_PARENT_READBACK');parentRecord=actual;
      if(sourceSession){const source=await import('../../../../backend/src/api/accounts/flat-manual-graph-session.mjs');
        await source.confirmOriginalNativeSessionKeeperSourceCheckpointV1(sourceSession,keeper);}if(durable.lifetimeHandle){const {updateWrappedPrivateLifetimePartV1}=await import('../../../../backend/src/claims/wrapped/recovery/wrapped-private-lifetime-registry-v1.mjs');await updateWrappedPrivateLifetimePartV1(durable.lifetimeHandle,{config,journal:{...journal},checkpoint,pendingCheckpoint,parentCheckpoint:{revision:actual.revision,commitment:actual.commitment}});}}
    catch(error){fault=true;throw error;}
  }
  const host = {
    ...Object.fromEntries(['assertAuthority', 'prepare', 'execute', 'reconcile', 'recover', 'observe'].map(method => [method, value => authority[method](value)])),
    async proposeCheckpoint(candidate) {
      need(!closed&&!fault, 'JOURNAL_AUTHORITY_UNAVAILABLE'); validateCheckpoint(candidate, identity);
      need(candidate.revision === (checkpoint ? checkpoint.revision + 1 : 0), 'JOURNAL_CHECKPOINT_SEQUENCE');
      if (pendingCheckpoint) same(candidate, pendingCheckpoint, 'JOURNAL_CHECKPOINT_CANDIDATE');
      pendingCheckpoint = immutable(candidate);
      await persistCheckpoints();
      return {proposed: true, checkpointSHA256: sha(candidate)};
    },
    async retainCheckpoint(candidate) {
      need(!closed&&!fault, 'JOURNAL_AUTHORITY_UNAVAILABLE'); validateCheckpoint(candidate, identity);
      if (checkpoint && candidate.revision === checkpoint.revision) same(candidate, checkpoint, 'JOURNAL_CHECKPOINT_CHANGED');
      else { need(pendingCheckpoint, 'JOURNAL_CHECKPOINT_CANDIDATE'); same(candidate, pendingCheckpoint, 'JOURNAL_CHECKPOINT_CANDIDATE'); }
      checkpoint = immutable(candidate); pendingCheckpoint = null;
      await persistCheckpoints();
      return {retained: true, checkpointSHA256: sha(candidate)};
    },
  };
  const exclusive = async work => {need(!busy && !closed && !capturing && !fault, 'JOURNAL_COORDINATOR_UNAVAILABLE'); busy = true; try {return await work();} finally {busy = false;}};
  const start = create => createGenericAccountCoordinatorProcess({config, journal, host, afterHostOperation, opening: create ? {create: true} : {checkpoint, pendingCheckpoint}});
  try {worker = await start(durable?durable.create:true);} catch (error) {journal.password = null; parentStore?.close(); throw error;}
  async function sourceSnapshot(){
    need(durable&&parentStore&&!closed&&!fault&&!capturing,'JOURNAL_SOURCE_ORIGINAL_KEEPER_REQUIRED');
    const actual=await parentStore.read();same(actual,parentRecord,'JOURNAL_PARENT_READBACK');
    return immutable({keeper:{schema:'WRAPPED_DURABLE_GRAPH_KEEPER_V1',config,journal:{...journal},checkpoint,pendingCheckpoint,
      parentCheckpoint:{revision:actual.revision,commitment:actual.commitment}},ownedProcesses:[await readOriginalGenericAccountCoordinatorIdentityV1(worker)]});
  }
  const keeper=Object.freeze({
    prepare: request => exclusive(() => worker.request('prepare', request)),
    execute: requestId => exclusive(() => worker.request('execute', {requestId})),
    reconcile: requestId => exclusive(() => worker.request('reconcile', {requestId})),
    recover: requestId => exclusive(() => worker.request('recover', {requestId})),
    snapshot: () => exclusive(() => worker.request('snapshot')),
    restartCoordinator: () => exclusive(async () => {
      await worker.close(); // includes OS exit and the original in-flight host work
      need(checkpoint, 'JOURNAL_ORIGINAL_CHECKPOINT_REQUIRED');
      worker = await start(false);
      return worker.initial;
    }),
    close: async () => {
      if(closed)return {closed:true};
      need(!busy&&!capturing,'JOURNAL_COORDINATOR_UNAVAILABLE');busy=true;
      try{await worker.close();}finally{closed=true;busy=false;journal.password=null;parentStore?.close();}
      // Ownership of injected custody/authority stays with the caller. Closing
      // this wrapper does not close a retained balance or shared runtime.
      return {closed: true};
    },
  });
  if(durable)durableKeepers.set(keeper,{
    async bindSource(session){need(!sourceSession&&!busy&&!closed&&!capturing&&!fault,'JOURNAL_SOURCE_ORIGINAL_KEEPER_REQUIRED');
      const source=await import('../../../../backend/src/api/accounts/flat-manual-graph-session.mjs');source.assertOriginalNativeSessionSourceKeeperV1(session,keeper);sourceSession=session;return sourceSnapshot();},
    async readSource(session){need(!sourceSession||sourceSession===session,'JOURNAL_SOURCE_ORIGINAL_SESSION_CHANGED');
      const source=await import('../../../../backend/src/api/accounts/flat-manual-graph-session.mjs');source.assertOriginalNativeSessionSourceKeeperV1(session,keeper);return sourceSnapshot();},
    async readSourceCandidate(session){need(sourceSession===session&&busy&&!closed&&!fault&&!capturing,'JOURNAL_SOURCE_ORIGINAL_SESSION_CHANGED');
      const source=await import('../../../../backend/src/api/accounts/flat-manual-graph-session.mjs');source.assertOriginalNativeSessionSourceKeeperV1(session,keeper);
      const actual=await parentStore.read();same(actual,parentRecord,'JOURNAL_PARENT_READBACK');
      return immutable({revision:parentRecord.revision+1,stateSHA256:sha({checkpoint,pendingCheckpoint})});},
    async capture(){
    need(sourceSession===null,'JOURNAL_SOURCE_LEGACY_CAPTURE_DENIED');
    need(!busy&&!closed&&!capturing&&!fault,'JOURNAL_COORDINATOR_UNAVAILABLE');capturing=true;
    let retained;
    try{
      need(checkpoint,'JOURNAL_ORIGINAL_CHECKPOINT_REQUIRED');
      const current=await parentStore.read();same(current,parentRecord,'JOURNAL_PARENT_READBACK');
      retained={schema:'WRAPPED_DURABLE_GRAPH_KEEPER_V1',config,journal:{...journal},checkpoint,pendingCheckpoint,
        parentCheckpoint:{revision:current.revision,commitment:current.commitment}};
    }catch(error){try{await worker.close();}finally{closed=true;journal.password=null;parentStore.close();}throw error;}
    try{await worker.close();}finally{closed=true;journal.password=null;parentStore.close();}
    return immutable(retained);
  }});
  originalKeepers.set(keeper,{config,authority,live(){need(!closed&&!capturing&&!fault,'JOURNAL_COORDINATOR_UNAVAILABLE');}});
  return keeper;
}
