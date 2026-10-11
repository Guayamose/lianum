/** Generic coordinator lifecycle. Storage retains checkpoints; it cannot mint
 * backend durable membership, choose authority, or replace a live keeper.
 * The backend durable factory owns and validates its SOURCE/lifetime bindings. */
import {types} from 'node:util';
import {genericAccountIdentity, immutable, need, same, sha, validateCheckpoint, validateGenericAccountConfig} from './generic-account-journal.mjs';
import {createGenericAccountCoordinatorProcess, validateJournalCredentials, readOriginalGenericAccountCoordinatorIdentityV1} from './generic-account-process.mjs';

export function keeperFields(value, fields) {
  need(value && !types.isProxy(value) && Object.getPrototypeOf(value) === Object.prototype && Reflect.ownKeys(value).length === fields.length && fields.every(k => Object.hasOwn(Object.getOwnPropertyDescriptor(value, k) ?? {}, 'value')), 'JOURNAL_KEEPER_FIELDS');
}
const originalKeepers = new WeakMap();
export function assertOriginalGenericAccountKeeperV1(keeper, expected) {
  need(arguments.length === 2, 'JOURNAL_ORIGINAL_KEEPER_REQUIRED');
  keeperFields(expected, ['config', 'authority']);
  const original = originalKeepers.get(keeper);
  need(original && original.authority === expected.authority, 'JOURNAL_ORIGINAL_KEEPER_REQUIRED');
  same(original.config, validateGenericAccountConfig(expected.config), 'JOURNAL_ORIGINAL_CONFIG_CHANGED');
  original.live();
}
export function keeperInput(input) {
  keeperFields(input, ['config', 'journal', 'authority']);
  const config = validateGenericAccountConfig(input.config), journal = validateJournalCredentials(input.journal), authority = input.authority;
  need(authority && ['assertAuthority', 'prepare', 'execute', 'reconcile', 'recover', 'observe'].every(k => typeof authority[k] === 'function'), 'JOURNAL_KEEPER_REQUIRED');
  return {config, journal, authority};
}
/** Private composition port: opening is checkpoint metadata, retain writes that
 * metadata, close releases storage. All authority calls remain fixed below. */
export async function startGenericAccountKeeper(input, options = {}, persistence = null) {
  const {config, journal, authority} = keeperInput(input);
  keeperFields(options, Object.hasOwn(options, 'afterHostOperation') ? ['afterHostOperation'] : []);
  const afterHostOperation = options.afterHostOperation ?? (async () => {});
  need(typeof afterHostOperation === 'function', 'JOURNAL_TEST_HOOK');
  if (persistence) {
    keeperFields(persistence, ['opening', 'retain', 'close']);
    need(typeof persistence.retain === 'function' && typeof persistence.close === 'function', 'JOURNAL_KEEPER_PERSISTENCE');
    keeperFields(persistence.opening, ['create', 'checkpoint', 'pendingCheckpoint']);
    need(typeof persistence.opening.create === 'boolean', 'JOURNAL_KEEPER_PERSISTENCE');
    if (persistence.opening.create) {
      need(persistence.opening.checkpoint === null && persistence.opening.pendingCheckpoint === null, 'JOURNAL_KEEPER_PERSISTENCE');
    }
  }
  const identity = genericAccountIdentity(config);
  let worker, checkpoint = persistence?.opening.checkpoint ?? null, pendingCheckpoint = persistence?.opening.pendingCheckpoint ?? null;
  let busy = false, closed = false, capturing = false, fault = false;
  async function persistCheckpoints() {
    if (!persistence) return;
    try {await persistence.retain(immutable({checkpoint, pendingCheckpoint}));}
    catch (error) {fault = true; throw error;}
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
  try {worker = await start(persistence ? persistence.opening.create : true);} catch (error) {journal.password = null; persistence?.close(); throw error;}
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
      try{await worker.close();}finally{closed=true;busy=false;journal.password=null;persistence?.close();}
      // Ownership of injected custody/authority stays with the caller. Closing
      // this wrapper does not close a retained balance or shared runtime.
      return {closed: true};
    },
  });
  const control = Object.freeze({
    assertIdle() {need(!busy && !closed && !capturing && !fault, 'JOURNAL_SOURCE_ORIGINAL_KEEPER_REQUIRED');},
    assertBusy() {need(busy && !closed && !fault && !capturing, 'JOURNAL_SOURCE_ORIGINAL_SESSION_CHANGED');},
    readCheckpoints() {
      need(!closed && !fault && !capturing, 'JOURNAL_SOURCE_ORIGINAL_KEEPER_REQUIRED');
      return immutable({checkpoint, pendingCheckpoint});
    },
    async readCoordinator() {
      need(!closed && !fault && !capturing, 'JOURNAL_SOURCE_ORIGINAL_KEEPER_REQUIRED');
      return readOriginalGenericAccountCoordinatorIdentityV1(worker);
    },
    async capture(readRetained) {
      need(!busy && !closed && !capturing && !fault, 'JOURNAL_COORDINATOR_UNAVAILABLE');
      capturing = true;
      let retained;
      try {
        need(checkpoint, 'JOURNAL_ORIGINAL_CHECKPOINT_REQUIRED');
        retained = await readRetained(immutable({checkpoint, pendingCheckpoint}));
      } catch (error) {
        try {await worker.close();}
        finally {closed = true; journal.password = null; persistence?.close();}
        throw error;
      }
      try {await worker.close();}
      finally {closed = true; journal.password = null; persistence?.close();}
      return immutable(retained);
    },
  });
  originalKeepers.set(keeper, {config, authority, live() {need(!closed && !capturing && !fault, 'JOURNAL_COORDINATOR_UNAVAILABLE');}});
  return Object.freeze({keeper, control});
}
