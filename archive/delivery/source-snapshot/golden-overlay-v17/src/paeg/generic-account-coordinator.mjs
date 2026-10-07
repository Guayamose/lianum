/** DRAFT opaque facade. The injected host is an authenticated keeper capability,
 * not a caller-selected RPC target. It must survive coordinator reconstruction. */
import {randomBytes} from 'node:crypto';
import {GenericAccountJournal, exact, fail, immutable, need, same, sha, validateOutcome, validateObservation} from './generic-account-journal.mjs';

export function createGenericAccountCoordinator(config, {store, host, now = Date.now}) {
  need(host && ['assertAuthority', 'proposeCheckpoint', 'retainCheckpoint', 'prepare', 'execute', 'reconcile', 'recover', 'observe'].every(k => typeof host[k] === 'function'), 'JOURNAL_KEEPER_REQUIRED');
  const journal = new GenericAccountJournal(config, {store, retainCheckpoint: checkpoint => host.retainCheckpoint(checkpoint), proposeCheckpoint: checkpoint => host.proposeCheckpoint(checkpoint)});
  let busy = false, closed = false, opened = false;
  const exclusive = async action => {
    need(!busy && !closed, 'JOURNAL_COORDINATOR_UNAVAILABLE');
    busy = true;
    try { return await action(); } finally { busy = false; }
  };
  async function authority() {
    let result;
    try { result = await host.assertAuthority(journal.identity()); }
    catch { fail('JOURNAL_AUTHORITY_UNAVAILABLE'); }
    exact(result, ['version', 'available', 'identity'], 'JOURNAL_AUTHORITY_RESPONSE');
    need(result.version === 1 && result.available === true, 'JOURNAL_AUTHORITY_UNAVAILABLE');
    same(result.identity, journal.identity(), 'JOURNAL_AUTHORITY_CHANGED');
  }
  function ready() { need(opened, 'JOURNAL_NOT_OPEN'); }
  function existing(requestId) {
    const entry = journal.request(requestId);
    need(entry, 'JOURNAL_REQUEST_UNKNOWN');
    return entry;
  }
  async function confirm(request, rawOutcome) {
    const outcome = validateOutcome(rawOutcome, request);
    const challenge = randomBytes(16).toString('hex'), startedAt = now();
    const observation = validateObservation(await host.observe(immutable({request, outcome, challenge})), request, outcome, {challenge, startedAt, now: now()});
    return journal.transition(request.requestId, 'CONFIRMED', {outcome, observationSHA256: sha(observation), observedAt: observation.observedAt, observationBlockNumber: observation.blockNumber, observationBlockHash: observation.blockHash});
  }
  async function submitted(entry, method) {
    try {
      const outcome = await host[method](entry.request);
      return await confirm(entry.request, outcome);
    } catch {
      // Ordinary execute is never retried. Keep recovery explicit so a later
      // recover can resume only the authority's fixed, idempotent refund action.
      // A write/ack failure poisons this instance; disk may be ahead.
      try { await journal.transition(entry.request.requestId, entry.state === 'RECOVERING' ? 'RECOVERING' : 'UNKNOWN'); }
      catch { fail('JOURNAL_STORAGE_UNAVAILABLE'); }
      fail('JOURNAL_ORIGINAL_OUTCOME_UNRESOLVED');
    }
  }
  return Object.freeze({
    open: options => exclusive(async () => {
      need(!opened, 'JOURNAL_ALREADY_OPEN');
      // Snapshot keeper-owned opening input before the first asynchronous call.
      let opening;
      try { opening = immutable(options ?? {}); }
      catch { fail('JOURNAL_OPEN_FAILED'); }
      await authority();
      const snapshot = await journal.open(opening);
      opened = true;
      return snapshot;
    }),
    snapshot() { ready(); return journal.snapshot(); },
    prepare: input => exclusive(async () => {
      ready();
      // Binding is durable before prepare is allowed to resolve/reserve custody.
      const entry = await journal.bind(input);
      if (entry.state !== 'PREPARING') return entry;
      await authority();
      let prepared;
      try { prepared = await host.prepare(entry.request); }
      catch { fail('JOURNAL_OWNER_PREPARATION_UNAVAILABLE'); }
      exact(prepared, ['version', 'state', 'bindingSHA256', 'assetBindingSHA256'], 'JOURNAL_PREPARATION_FIELDS');
      need(prepared.version === 1 && prepared.state === 'PREPARED' && prepared.bindingSHA256 === entry.request.bindingSHA256 && prepared.assetBindingSHA256 === entry.request.assetBindingSHA256, 'JOURNAL_OWNER_PREPARATION_REQUIRED');
      return journal.transition(entry.request.requestId, 'PREPARED');
    }),
    execute: requestId => exclusive(async () => {
      ready();
      let entry = existing(requestId);
      if (entry.state === 'CONFIRMED') return entry;
      need(entry.state === 'PREPARED', 'JOURNAL_RECONCILE_ORIGINAL_REQUEST');
      await authority();
      entry = await journal.transition(requestId, 'SUBMITTING');
      return submitted(entry, 'execute');
    }),
    reconcile: requestId => exclusive(async () => {
      ready();
      const entry = existing(requestId);
      if (entry.state === 'CONFIRMED') return entry;
      need(['SUBMITTING', 'UNKNOWN', 'RECOVERING'].includes(entry.state), 'JOURNAL_NOT_SUBMITTED');
      await authority();
      return submitted(entry, 'reconcile');
    }),
    recover: requestId => exclusive(async () => {
      ready();
      let entry = existing(requestId);
      need(entry.request.kind === 'GRAPH', 'JOURNAL_RECOVERY_GRAPH_REQUIRED');
      if (entry.state === 'CONFIRMED') return entry;
      need(['SUBMITTING', 'UNKNOWN', 'RECOVERING'].includes(entry.state), 'JOURNAL_NOT_SUBMITTED');
      await authority();
      if (entry.state !== 'RECOVERING') entry = await journal.transition(requestId, 'RECOVERING');
      // This is not execute/reconcile retry permission. The authority must
      // prove no fixed-refund send was latched before preparing or submitting;
      // a latched or unknown submission can only reconcile that same original.
      return submitted(entry, 'recover');
    }),
    close() { need(!busy, 'JOURNAL_COORDINATOR_UNAVAILABLE'); closed = true; journal.close(); },
  });
}
