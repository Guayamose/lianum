/** HOST DTO boundary tests only. The in-memory write port below is not a Vault,
 * account authority, authenticated CAS, economic acceptance or custody proof. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createNativeValueAccountJournals } from '../../../src/accounts/authority/native-value/native-value-authority-journals.mjs';

function fixture(data, beforeWrite = async () => {}) {
  let record = { revision: 0, data: structuredClone(data) };
  let writes = 0;
  const journals = createNativeValueAccountJournals({
    readRecord: () => record,
    async write(change) {
      writes++;
      await beforeWrite();
      record = { revision: record.revision + 1, data: change(structuredClone(record.data)) };
    },
  });
  return {
    journals,
    get record() { return record; },
    get writes() { return writes; },
    replace(data) { record = { revision: record.revision + 1, data: structuredClone(data) }; },
  };
}
const seed = () => ({
  deviceDeposits: [{ jobId: 'shared_id', note: { amount: '10', witnesses: ['deposit'] } }],
  deviceReservations: [{ jobId: 'shared_id', note: { amount: '7', witnesses: ['reservation'] } }],
  deviceExits: [{ jobId: 'shared_id', note: { amount: '3', witnesses: ['exit'] } }],
  deviceReservationQuotes: [{ quoteId: 'shared_id', terms: { amount: '7', stages: ['quoted'] } }],
  operations: [{ ownerOperationRef: 'shared_id', jobId: 'different_job', result: { state: 'UNKNOWN', frames: ['original'] } }],
});
const readers = journals => [journals.deposits.rows, journals.reservations.rows, journals.withdrawals.rows,
  journals.reservations.quotes, journals.operations.rows];
function deeplyFrozen(value) {
  if (value === null || typeof value !== 'object') return;
  assert.equal(Object.isFrozen(value), true);
  for (const child of Object.values(value)) deeplyFrozen(child);
}

test('all journal domains expose deeply frozen detached snapshots, without freezing the owner record', () => {
  const owner = fixture(seed());
  for (const read of readers(owner.journals)) {
    const snapshot = read();
    deeplyFrozen(snapshot);
    assert.throws(() => snapshot.push({}), TypeError);
    const details = snapshot[0].note ?? snapshot[0].terms ?? snapshot[0].result;
    const key = Object.keys(details)[0];
    assert.throws(() => { details[key] = 'tampered'; }, TypeError);
    const nested = details.witnesses ?? details.stages ?? details.frames;
    assert.throws(() => nested.push('tampered'), TypeError);
    assert.notEqual(read(), snapshot);
    assert.notEqual(read()[0], snapshot[0]);
  }
  assert.equal(Object.isFrozen(owner.record.data.deviceDeposits), false);
  assert.equal(Object.isFrozen(owner.record.data.deviceDeposits[0].note), false);
  owner.record.data.deviceDeposits[0].note.amount = '11';
  assert.equal(owner.journals.deposits.rows()[0].note.amount, '11');
  assert.equal(owner.writes, 0);
  for (const value of Object.values(owner.journals)) assert.equal(Object.isFrozen(value), true);
  assert.equal(Object.isFrozen(owner.journals), true);
});

test('journal reads follow live record replacement after writes while previous snapshots remain stable', async () => {
  const owner = fixture(seed());
  const oldRecord = owner.record, previous = owner.journals.deposits.rows();
  await owner.journals.deposits.patch('shared_id', { stage: 'CONFIRMED' });
  assert.notEqual(owner.record, oldRecord);
  assert.equal(owner.record.revision, 1);
  assert.equal(owner.journals.deposits.rows()[0].stage, 'CONFIRMED');
  assert.equal(previous[0].stage, undefined);
  assert.equal(oldRecord.data.deviceDeposits[0].stage, undefined);
  owner.replace({ ...seed(), deviceDeposits: [{ jobId: 'reopened_original', stage: 'RETAINED' }] });
  assert.deepEqual(owner.journals.deposits.rows(), [{ jobId: 'reopened_original', stage: 'RETAINED' }]);
  assert.equal(previous[0].jobId, 'shared_id');
  assert.equal(owner.writes, 1);
});

test('identical IDs in different domains never patch another journal, quote or profile', async () => {
  const owner = fixture(seed());
  await owner.journals.reservations.patch('shared_id', { stage: 'RESERVED' });
  assert.equal(owner.journals.reservations.rows()[0].stage, 'RESERVED');
  assert.deepEqual(owner.journals.deposits.rows(), seed().deviceDeposits);
  assert.deepEqual(owner.journals.withdrawals.rows(), seed().deviceExits);
  assert.deepEqual(owner.journals.reservations.quotes(), seed().deviceReservationQuotes);
  assert.deepEqual(owner.journals.operations.rows(), seed().operations);
  await owner.journals.operations.patch('different_job', { state: 'WRONG_ID' });
  assert.deepEqual(owner.journals.operations.rows(), seed().operations, 'operations match ownerOperationRef, never jobId');
  await owner.journals.operations.patch('shared_id', { state: 'RECOVERED' });
  assert.equal(owner.journals.operations.rows()[0].state, 'RECOVERED');
  assert.equal(owner.journals.reservations.rows()[0].stage, 'RESERVED');

  assert.equal(owner.journals.deposits.profile(), undefined);
  assert.equal(owner.journals.deposits.workerProfile(), undefined);
  await owner.journals.deposits.installProfile('DEPOSIT_PROFILE');
  await owner.journals.deposits.installWorkerProfile('WORKER_PROFILE');
  await owner.journals.reservations.installProfile('RESERVATION_PROFILE');
  await owner.journals.withdrawals.installProfile('EXIT_PROFILE');
  assert.equal(owner.journals.deposits.profile(), 'DEPOSIT_PROFILE');
  assert.equal(owner.journals.deposits.workerProfile(), 'WORKER_PROFILE');
  assert.equal(owner.journals.reservations.profile(), 'RESERVATION_PROFILE');
  assert.equal(owner.journals.withdrawals.profile(), 'EXIT_PROFILE');
  assert.deepEqual(owner.journals.withdrawals.rows(), seed().deviceExits);
});

test('append and quote bodies are captured before an awaited write and retain no caller aliases', async () => {
  for (const select of [journals => journals.deposits, journals => ({ append: journals.reservations.appendQuote, rows: journals.reservations.quotes })]) {
    const gate = Promise.withResolvers();
    const owner = fixture({}, () => gate.promise);
    const body = { jobId: 'original_job', quoteId: 'original_quote', terms: { amount: '10', frames: ['original'] } };
    const expected = structuredClone(body), journal = select(owner.journals);
    const pending = journal.append(body);
    body.jobId = 'replacement'; body.terms.amount = '999'; body.terms.frames.push('replacement');
    assert.equal(owner.writes, 1);
    assert.deepEqual(journal.rows(), []);
    gate.resolve();
    await pending;
    assert.deepEqual(journal.rows(), [expected]);
    body.terms.frames.length = 0;
    assert.deepEqual(journal.rows(), [expected]);
    assert.equal(owner.writes, 1);
  }
});

test('patch captures nested caller fields before waiting and applies to the latest owner record', async () => {
  const gate = Promise.withResolvers();
  const owner = fixture(seed(), () => gate.promise);
  const fields = { result: { state: 'CONFIRMED', frames: ['bound_original'] } };
  const expected = structuredClone(fields);
  const pending = owner.journals.operations.patch('shared_id', fields);
  fields.result.state = 'replacement'; fields.result.frames.push('replacement');
  owner.replace({ ...seed(), retainedWhileWaiting: { revision: 'newer' }, operations: [
    { ...seed().operations[0], updatedWhileWaiting: true },
    { ownerOperationRef: 'independent_request', result: { state: 'PREPARED' } },
  ] });
  gate.resolve();
  await pending;
  assert.deepEqual(owner.journals.operations.rows(), [
    { ...seed().operations[0], updatedWhileWaiting: true, ...expected },
    { ownerOperationRef: 'independent_request', result: { state: 'PREPARED' } },
  ]);
  assert.deepEqual(owner.record.data.retainedWhileWaiting, { revision: 'newer' });
  assert.equal(owner.record.revision, 2);
  assert.equal(owner.writes, 1);
});

test('write failures propagate with original identity, preserve the record and never retry', async () => {
  const effects = [
    journals => journals.deposits.append({ jobId: 'failed_deposit' }),
    journals => journals.reservations.patch('shared_id', { stage: 'FAILED_WRITE' }),
    journals => journals.reservations.appendQuote({ quoteId: 'failed_quote' }),
    journals => journals.withdrawals.installProfile('FAILED_EXIT_PROFILE'),
    journals => journals.deposits.installWorkerProfile('FAILED_WORKER_PROFILE'),
  ];
  for (const effect of effects) {
    const failure = new Error('HOST_INJECTED_WRITE_UNCERTAINTY');
    const owner = fixture(seed(), async () => { throw failure; });
    const original = owner.record;
    await assert.rejects(effect(owner.journals), error => error === failure);
    await Promise.resolve();
    assert.equal(owner.writes, 1);
    assert.equal(owner.record, original);
    assert.deepEqual(owner.record.data, seed());
  }
});
