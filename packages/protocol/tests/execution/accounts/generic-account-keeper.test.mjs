/** Actual disposable coordinator processes and encrypted journals, deliberately
 * mocked owner/chain authority. No native runtime, compiler, proof or download. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, readFile, rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createGenericAccountKeeper} from '@lianum/protocol/accounts/keeper';
import {ACCOUNT_MAX_BYTES, decodeAccountMessage, encodeAccountMessage} from '../../../../engine/src/execution/accounts/generic-account-process.mjs';
import {genericAccountIdentity, validateBoundRequest} from '../../../../engine/src/execution/accounts/generic-account-journal.mjs';
import {Vault} from '../../../../engine/src/crypto/vault.mjs';

const h = n => n.toString(16).padStart(64, '0');
const registry = [{assetId: h(1), kind: 'NATIVE', symbol: 'ETH', decimals: 18, chainId: '31337', genesis: h(2), pool: '3'.repeat(40), scope: h(4), policy: h(5), token: '0'.repeat(40), codeHash: h(6), assetIdentity: h(7), custody: 'ONCHAIN_NOTE_POOL', trust: 'PINNED_LOCAL_CONTRACT_AND_TRUSTED_NATIVE_ISSUER'}];
const config = {journalId: 'journal_process_01', accountId: 'account_process_01', lifetime: h(8), registry};
const request = {requestId: 'request_process_01', assetId: h(1), kind: 'GRAPH', ownerOperationRef: h(9)};
function deferred() {let resolve; const promise = new Promise(r => {resolve = r;}); return {promise, resolve};}

async function fixture(t, {afterHostOperation, originalRequest = request} = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'generic-account-process-'));
  const journal = {path: join(directory, 'account.vault'), password: 'synthetic-separate-journal-password'};
  const stats = {assertions: 0, preparations: 0, executions: 0, reconciliations: 0, recoveries: 0, recoverySubmissions: 0, observations: 0};
  const control = {observationUnavailable: false, alive: true, interruptGraph: false, beforeRecoveryDeadline: false, recoveryOutcomeUnavailable: false, mutateOutcome: x => x};
  let binding = null, outcome = null, recoverySubmission = null;
  const makeOutcome = (input, disposition) => ({version: 1, state: 'CONFIRMED', bindingSHA256: input.bindingSHA256, assetBindingSHA256: input.assetBindingSHA256, outcomeId: h(disposition === 'APPLIED' ? 10 : 12), disposition, blockNumber: '20', blockHash: h(disposition === 'APPLIED' ? 11 : 13)});
  const authority = {
    async assertAuthority(identity) {stats.assertions++; assert.equal(control.alive, true); assert.deepEqual(identity, genericAccountIdentity(config)); return {version: 1, available: true, identity};},
    async prepare(input) {
      stats.preparations++; validateBoundRequest(input, config);
      assert.deepEqual(Object.fromEntries(Object.keys(originalRequest).map(k => [k, input[k]])), originalRequest);
      const durable = await new Vault(journal.path).read(journal.password);
      assert.equal(durable.data.requests[0].state, 'PREPARING');
      if (binding) assert.deepEqual(input, binding); binding = input;
      return {version: 1, state: 'PREPARED', bindingSHA256: input.bindingSHA256, assetBindingSHA256: input.assetBindingSHA256};
    },
    async execute(input) {
      stats.executions++; assert.deepEqual(input, binding); assert.equal(outcome, null);
      const durable = await new Vault(journal.path).read(journal.password); assert.equal(durable.data.requests[0].state, 'SUBMITTING');
      if (control.interruptGraph) throw Error('mock graph stopped after an original partial effect');
      outcome = makeOutcome(input, 'APPLIED');
      return control.mutateOutcome(outcome);
    },
    async reconcile(input) {stats.reconciliations++; assert.deepEqual(input, binding); assert.ok(outcome); return control.mutateOutcome(outcome);},
    async recover(input) {
      stats.recoveries++; assert.deepEqual(input, binding); assert.equal(input.kind, 'GRAPH');
      const durable = await new Vault(journal.path).read(journal.password);
      assert.equal(durable.data.requests[0].state, 'RECOVERING');
      if (outcome) return control.mutateOutcome(outcome);
      if (!recoverySubmission) {
        if (control.beforeRecoveryDeadline) throw Error('original deadline not reached');
        recoverySubmission = input; stats.recoverySubmissions++;
      }
      assert.deepEqual(input, recoverySubmission);
      if (control.recoveryOutcomeUnavailable) throw Error('latched original refund outcome unknown');
      outcome = makeOutcome(input, 'RECOVERED');
      return control.mutateOutcome(outcome);
    },
    async observe({request: input, outcome: original, challenge}) {
      stats.observations++; assert.deepEqual(input, binding); assert.deepEqual(original, outcome);
      if (control.observationUnavailable) throw Error('OWNER_SECRET_SHOULD_NOT_ESCAPE');
      return {version: 1, status: 'LIVE', bindingSHA256: input.bindingSHA256, assetBindingSHA256: input.assetBindingSHA256, outcomeId: original.outcomeId, challenge, observedAt: Date.now(), blockNumber: '20', blockHash: original.blockHash, canonicalOutcomeBlockHash: original.blockHash, backing: {held: '10', liabilities: '10', surplus: '0', deficit: '0'}};
    },
  };
  const keeper = await createGenericAccountKeeper({config, journal, authority}, afterHostOperation ? {afterHostOperation} : {});
  t.after(async () => {await keeper.close().catch(() => {}); await rm(directory, {recursive: true, force: true});});
  return {keeper, stats, control, journal, authority};
}

test('actual child dies after one successful host execution; surviving keeper reconciles without execute', async t => {
  let killed = false;
  const f = await fixture(t, {afterHostOperation({method, terminateCoordinator}) {if (method === 'execute') {killed = true; terminateCoordinator();}}});
  const original = await f.keeper.prepare(request);
  assert.deepEqual(await f.keeper.prepare(request), original);
  for (const key of ['graph', 'payload', 'ownerVault', 'signingKey', 'noteOpening', 'packets']) await assert.rejects(f.keeper.prepare({...request, [key]: 'SECRET'}), {code: 'JOURNAL_REQUEST_FIELDS'});
  await assert.rejects(f.keeper.prepare({...request, kind: 'EXIT'}), {code: 'JOURNAL_REQUEST_CONFLICT'});
  await assert.rejects(f.keeper.prepare({...request, requestId: 'other_request_id'}), {code: 'JOURNAL_REFERENCE_ALREADY_BOUND'});
  await assert.rejects(f.keeper.execute(request.requestId), {code: 'JOURNAL_CHILD_LOST'});
  assert.equal(killed, true); assert.equal(f.stats.executions, 1);
  assert.equal((await new Vault(f.journal.path).read(f.journal.password)).data.requests[0].state, 'SUBMITTING');
  assert.equal((await f.keeper.restartCoordinator()).requests[0].state, 'SUBMITTING');
  await assert.rejects(f.keeper.execute(request.requestId), {code: 'JOURNAL_RECONCILE_ORIGINAL_REQUEST'});
  const recovered = await f.keeper.reconcile(request.requestId);
  assert.equal(recovered.state, 'CONFIRMED'); assert.deepEqual(recovered.request, original.request);
  assert.equal(f.stats.executions, 1); assert.equal(f.stats.reconciliations, 1);
  assert.deepEqual(await f.keeper.execute(request.requestId), recovered);
  const snapshot = await f.keeper.snapshot();
  assert.equal(snapshot.requests[0].state, 'CONFIRMED');
  assert.doesNotMatch(JSON.stringify(snapshot), /ownerOperationRef|password|graph|SECRET|packets/);
  assert.doesNotMatch(await readFile(f.journal.path, 'utf8'), /ownerOperationRef|password|request_process_01/);
});

test('replacement waits for old in-flight host work to settle before reusing authority', async t => {
  const blocked = deferred(), release = deferred();
  t.after(() => release.resolve());
  const f = await fixture(t, {async afterHostOperation({method, terminateCoordinator}) {
    if (method === 'execute') {terminateCoordinator(); blocked.resolve(); await release.promise;}
  }});
  await f.keeper.prepare(request);
  const executing = assert.rejects(f.keeper.execute(request.requestId), {code: 'JOURNAL_CHILD_LOST'});
  await blocked.promise; await executing;
  const assertions = f.stats.assertions;
  let replaced = false;
  const restarting = f.keeper.restartCoordinator().then(value => {replaced = true; return value;});
  await new Promise(resolve => setTimeout(resolve, 25));
  assert.equal(replaced, false); assert.equal(f.stats.assertions, assertions);
  release.resolve();
  assert.equal((await restarting).requests[0].state, 'SUBMITTING');
  assert.equal((await f.keeper.reconcile(request.requestId)).state, 'CONFIRMED');
  assert.equal(f.stats.executions, 1);
});

test('unavailable observation and malformed host outcome stay UNKNOWN across actual worker restart', async t => {
  const f = await fixture(t); await f.keeper.prepare(request);
  f.control.observationUnavailable = true;
  await assert.rejects(f.keeper.execute(request.requestId), {code: 'JOURNAL_ORIGINAL_OUTCOME_UNRESOLVED'});
  assert.equal((await f.keeper.snapshot()).requests[0].state, 'UNKNOWN');
  assert.equal((await f.keeper.restartCoordinator()).requests[0].state, 'UNKNOWN');
  f.control.observationUnavailable = false;
  f.control.mutateOutcome = outcome => ({...outcome, graph: 'OWNER_SECRET_SHOULD_NOT_ESCAPE'});
  await assert.rejects(f.keeper.reconcile(request.requestId), error => error.message === 'JOURNAL_ORIGINAL_OUTCOME_UNRESOLVED' && !error.cause);
  f.control.mutateOutcome = outcome => outcome;
  assert.equal((await f.keeper.reconcile(request.requestId)).state, 'CONFIRMED');
  assert.equal(f.stats.executions, 1);
  assert.doesNotMatch(JSON.stringify((await new Vault(f.journal.path).read(f.journal.password)).data), /OWNER_SECRET|"graph"/);
});

test('actual child loss after fixed recovery reconciles that refund without another submission', async t => {
  let killed = false;
  const f = await fixture(t, {afterHostOperation({method, terminateCoordinator}) {
    if (method === 'recover' && !killed) {killed = true; terminateCoordinator();}
  }});
  const original = await f.keeper.prepare(request);
  f.control.interruptGraph = true;
  await assert.rejects(f.keeper.execute(request.requestId), {code: 'JOURNAL_ORIGINAL_OUTCOME_UNRESOLVED'});
  await assert.rejects(f.keeper.recover(request.requestId), {code: 'JOURNAL_CHILD_LOST'});
  assert.equal(killed, true);
  assert.equal(f.stats.recoverySubmissions, 1);
  assert.equal((await new Vault(f.journal.path).read(f.journal.password)).data.requests[0].state, 'RECOVERING');
  assert.equal((await f.keeper.restartCoordinator()).requests[0].state, 'RECOVERING');
  await assert.rejects(f.keeper.execute(request.requestId), {code: 'JOURNAL_RECONCILE_ORIGINAL_REQUEST'});
  await assert.rejects(f.keeper.prepare({...request, ownerOperationRef: h(99)}), {code: 'JOURNAL_REQUEST_CONFLICT'});
  await assert.rejects(f.keeper.prepare({...request, requestId: 'replacement_request'}), {code: 'JOURNAL_REFERENCE_ALREADY_BOUND'});
  const recovered = await f.keeper.recover(request.requestId);
  assert.deepEqual(recovered.request, original.request);
  assert.equal(recovered.confirmation.outcome.disposition, 'RECOVERED');
  assert.equal(f.stats.recoveries, 2);
  assert.equal(f.stats.recoverySubmissions, 1);
  assert.equal(f.stats.executions, 1);
  assert.equal(f.stats.observations, 1);
  const stats = {...f.stats};
  for (const method of ['execute', 'reconcile', 'recover']) assert.deepEqual(await f.keeper[method](request.requestId), recovered);
  assert.deepEqual(f.stats, stats);
});

test('early and latched unknown recoveries survive actual restart without native execute retry', async t => {
  const f = await fixture(t);
  await f.keeper.prepare(request);
  f.control.interruptGraph = true;
  await assert.rejects(f.keeper.execute(request.requestId), {code: 'JOURNAL_ORIGINAL_OUTCOME_UNRESOLVED'});
  f.control.beforeRecoveryDeadline = true;
  await assert.rejects(f.keeper.recover(request.requestId), {code: 'JOURNAL_ORIGINAL_OUTCOME_UNRESOLVED'});
  assert.equal(f.stats.recoverySubmissions, 0);
  assert.equal((await f.keeper.restartCoordinator()).requests[0].state, 'RECOVERING');
  f.control.beforeRecoveryDeadline = false;
  f.control.recoveryOutcomeUnavailable = true;
  await assert.rejects(f.keeper.recover(request.requestId), {code: 'JOURNAL_ORIGINAL_OUTCOME_UNRESOLVED'});
  assert.equal(f.stats.recoverySubmissions, 1);
  assert.equal((await f.keeper.restartCoordinator()).requests[0].state, 'RECOVERING');
  await assert.rejects(f.keeper.recover(request.requestId), {code: 'JOURNAL_ORIGINAL_OUTCOME_UNRESOLVED'});
  const recoveries = f.stats.recoveries;
  await assert.rejects(f.keeper.reconcile(request.requestId), {code: 'JOURNAL_ORIGINAL_OUTCOME_UNRESOLVED'});
  assert.equal(f.stats.recoveries, recoveries);
  assert.equal((await f.keeper.snapshot()).requests[0].state, 'RECOVERING');
  await assert.rejects(f.keeper.execute(request.requestId), {code: 'JOURNAL_RECONCILE_ORIGINAL_REQUEST'});
  f.control.recoveryOutcomeUnavailable = false;
  f.control.observationUnavailable = true;
  await assert.rejects(f.keeper.recover(request.requestId), {code: 'JOURNAL_ORIGINAL_OUTCOME_UNRESOLVED'});
  f.control.observationUnavailable = false;
  assert.equal((await f.keeper.reconcile(request.requestId)).confirmation.outcome.disposition, 'RECOVERED');
  assert.equal(f.stats.recoverySubmissions, 1);
  assert.equal(f.stats.executions, 1);
});

test('fixed recovery command rejects replacements and wrong kinds before host effects', async t => {
  const f = await fixture(t);
  await assert.rejects(f.keeper.recover('unknown_request'), {code: 'JOURNAL_REQUEST_UNKNOWN'});
  await assert.rejects(f.keeper.recover({...request, destination: h(90)}), {code: 'JOURNAL_REQUEST_ID'});
  await f.keeper.prepare(request);
  await assert.rejects(f.keeper.recover(request.requestId), {code: 'JOURNAL_NOT_SUBMITTED'});
  const applied = await f.keeper.execute(request.requestId);
  assert.deepEqual(await f.keeper.recover(request.requestId), applied);
  assert.equal(f.stats.recoveries, 0);
  for (const kind of ['TOP_UP', 'EXIT']) {
    const originalRequest = {...request, kind};
    const other = await fixture(t, {originalRequest});
    await other.keeper.prepare(originalRequest);
    await assert.rejects(other.keeper.recover(request.requestId), {code: 'JOURNAL_RECOVERY_GRAPH_REQUIRED'});
    await other.keeper.execute(request.requestId);
    await assert.rejects(other.keeper.recover(request.requestId), {code: 'JOURNAL_RECOVERY_GRAPH_REQUIRED'});
    assert.equal(other.stats.recoveries, 0);
  }
});

test('missing surviving authority prevents actual worker reconstruction', async t => {
  const f = await fixture(t); await f.keeper.prepare(request); f.control.alive = false;
  await assert.rejects(f.keeper.restartCoordinator(), {code: 'JOURNAL_AUTHORITY_UNAVAILABLE'});
  assert.equal(f.stats.executions, 0);
});

test('keeper rejects owner credential bags and executable/environment overrides before opening', async () => {
  const authority = Object.fromEntries(['assertAuthority', 'prepare', 'execute', 'reconcile', 'recover', 'observe'].map(name => [name, async () => {}]));
  const input = {config, journal: {path: '/tmp/unused-account.vault', password: 'synthetic-journal-password'}, authority};
  for (const key of ['ownerVault', 'graph', 'executable', 'env', 'runtime']) await assert.rejects(createGenericAccountKeeper({...input, [key]: {}}), {code: 'JOURNAL_KEEPER_FIELDS'});
  await assert.rejects(createGenericAccountKeeper({...input, journal: {...input.journal, ownerPassword: 'SECRET'}}), {code: 'JOURNAL_CREDENTIAL_FIELDS'});
  await assert.rejects(createGenericAccountKeeper(input, {executable: '/tmp/fake'}), {code: 'JOURNAL_KEEPER_FIELDS'});
});

test('account wire format is bounded, canonical JSON and clears consumed buffers', () => {
  const bytes = encodeAccountMessage({kind: 'example', version: 1});
  assert.deepEqual(decodeAccountMessage(bytes), {kind: 'example', version: 1});
  assert.ok(bytes.every(value => value === 0));
  assert.throws(() => encodeAccountMessage({data: 'x'.repeat(ACCOUNT_MAX_BYTES)}), {code: 'JOURNAL_MESSAGE_LIMIT'});
  assert.throws(() => decodeAccountMessage(Buffer.alloc(ACCOUNT_MAX_BYTES + 1)), {code: 'JOURNAL_MESSAGE_LIMIT'});
  assert.throws(() => encodeAccountMessage({execute() {}}));
});
