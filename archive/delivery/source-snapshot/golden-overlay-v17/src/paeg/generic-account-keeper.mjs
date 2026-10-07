/** Surviving same-host account keeper. Authority/custody lifetime is injected,
 * never reconstructed from a fresh pool, ref, balance or replacement runtime. */
import {types} from 'node:util';
import {genericAccountIdentity, immutable, need, same, sha, validateCheckpoint, validateGenericAccountConfig} from './generic-account-journal.mjs';
import {createGenericAccountCoordinatorProcess, validateJournalCredentials} from './generic-account-process.mjs';

function capabilities(value, fields) {
  need(value && !types.isProxy(value) && Object.getPrototypeOf(value) === Object.prototype && Reflect.ownKeys(value).length === fields.length && fields.every(k => Object.hasOwn(Object.getOwnPropertyDescriptor(value, k) ?? {}, 'value')), 'JOURNAL_KEEPER_FIELDS');
}
export async function createGenericAccountKeeper(input, options = {}) {
  capabilities(input, ['config', 'journal', 'authority']);
  capabilities(options, Object.hasOwn(options, 'afterHostOperation') ? ['afterHostOperation'] : []);
  const config = validateGenericAccountConfig(input.config), journal = validateJournalCredentials(input.journal), authority = input.authority;
  need(authority && ['assertAuthority', 'prepare', 'execute', 'reconcile', 'recover', 'observe'].every(k => typeof authority[k] === 'function'), 'JOURNAL_KEEPER_REQUIRED');
  const afterHostOperation = options.afterHostOperation ?? (async () => {});
  need(typeof afterHostOperation === 'function', 'JOURNAL_TEST_HOOK');
  const identity = genericAccountIdentity(config);
  let worker, checkpoint = null, pendingCheckpoint = null, busy = false, closed = false;
  const host = {
    ...Object.fromEntries(['assertAuthority', 'prepare', 'execute', 'reconcile', 'recover', 'observe'].map(method => [method, value => authority[method](value)])),
    async proposeCheckpoint(candidate) {
      need(!closed, 'JOURNAL_AUTHORITY_UNAVAILABLE'); validateCheckpoint(candidate, identity);
      need(candidate.revision === (checkpoint ? checkpoint.revision + 1 : 0), 'JOURNAL_CHECKPOINT_SEQUENCE');
      if (pendingCheckpoint) same(candidate, pendingCheckpoint, 'JOURNAL_CHECKPOINT_CANDIDATE');
      pendingCheckpoint = immutable(candidate);
      return {proposed: true, checkpointSHA256: sha(candidate)};
    },
    async retainCheckpoint(candidate) {
      need(!closed, 'JOURNAL_AUTHORITY_UNAVAILABLE'); validateCheckpoint(candidate, identity);
      if (checkpoint && candidate.revision === checkpoint.revision) same(candidate, checkpoint, 'JOURNAL_CHECKPOINT_CHANGED');
      else { need(pendingCheckpoint, 'JOURNAL_CHECKPOINT_CANDIDATE'); same(candidate, pendingCheckpoint, 'JOURNAL_CHECKPOINT_CANDIDATE'); }
      checkpoint = immutable(candidate); pendingCheckpoint = null;
      return {retained: true, checkpointSHA256: sha(candidate)};
    },
  };
  const exclusive = async work => {need(!busy && !closed, 'JOURNAL_COORDINATOR_UNAVAILABLE'); busy = true; try {return await work();} finally {busy = false;}};
  const start = create => createGenericAccountCoordinatorProcess({config, journal, host, afterHostOperation, opening: create ? {create: true} : {checkpoint, pendingCheckpoint}});
  try {worker = await start(true);} catch (error) {journal.password = null; throw error;}
  return Object.freeze({
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
    close: () => exclusive(async () => {
      await worker.close(); closed = true; journal.password = null;
      // Ownership of injected custody/authority stays with the caller. Closing
      // this wrapper does not close a retained balance or shared runtime.
      return {closed: true};
    }),
  });
}
