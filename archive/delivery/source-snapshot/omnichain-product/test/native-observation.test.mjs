import test from 'node:test';
import assert from 'node:assert/strict';
import { observeBitcoinDelivery, mergeBitcoinObservation, markObservation, retainBitcoinObservation } from '../src/native-bitcoin.mjs';
import { nativeOutcome } from '../client/native-outcome.mjs';

// Scripted RPC replies only. These regressions do not run a native node, execute
// a payout attack, or establish an atomic node snapshot.
const operation = () => ({ order: { bitcoinGenesis: 'genesis', recipientScript: '0014recipient', sats: '100000' }, recipientAddress: 'recipient', bitcoin: { txid: 'delivery' } });
function fixture({ confirmations = 6, pending = false, spent = false, spendPending = false, reorg = false, utxoFailure = false, changingTip = false, inconsistentHeader = false } = {}) {
  let replaced = false, tips = 0, headerReads = 0;
  const calls = [];
  return { calls, btc: async (method, args = []) => {
    calls.push({ method, args });
    switch (method) {
      case 'getblockchaininfo': return { chain: 'regtest' };
      case 'getnetworkinfo': return { connections: 0, networkactive: false };
      case 'getaddressinfo': return { ismine: true, scriptPubKey: '0014recipient' };
      case 'getbestblockhash': return changingTip ? `tip-${++tips}` : replaced ? 'tip-B' : 'tip-A';
      case 'getrawtransaction': return { txid: 'delivery', ...(!pending && !replaced ? { blockhash: 'block-A' } : {}), vout: [{ n: 0, value: 0.001, scriptPubKey: { hex: '0014recipient' } }] };
      case 'getblockheader': return { height: 100, confirmations: replaced ? -1 : inconsistentHeader ? (++headerReads % 2 ? 1 : 6) : confirmations };
      case 'getblockhash':
        if (args[0] === 0) return 'genesis';
        if (reorg && !replaced) { replaced = true; return 'block-A'; }
        return replaced ? 'block-B' : 'block-A';
      case 'getblockcount': return replaced ? 105 : 100; // old vulnerable sequence only
      case 'getmempoolentry': return { vsize: 140 };
      case 'gettransaction': return { hex: 'signed-local-fixture', fee: -0.00000140 };
      case 'gettxout':
        if (utxoFailure) throw new Error('SCRIPTED_AUXILIARY_FAILURE');
        return spent || (spendPending && args[2]) ? null : { bestblock: replaced ? 'tip-B' : 'tip-A' };
      default: throw new Error(`Unexpected read: ${method}`);
    }
  } };
}

test('header confirmation count cannot be inflated by a later taller tip', async () => {
  const r = fixture({ confirmations: 1 }); const result = await observeBitcoinDelivery(r, operation());
  assert.equal(result.confirmations, 1); assert.equal(result.observationAttempts, 1);
  assert.equal(r.calls.some(c => c.method === 'getblockcount'), false);
});

test('deterministic reorg interleaving: old arithmetic invents six, new observation retries to mempool', async () => {
  const legacy = fixture({ confirmations: 1, reorg: true });
  const header = await legacy.btc('getblockheader', ['block-A']);
  assert.equal(await legacy.btc('getblockhash', [header.height]), 'block-A');
  assert.equal((await legacy.btc('getblockcount')) - header.height + 1, 6);
  const r = fixture({ confirmations: 1, reorg: true });
  const result = await observeBitcoinDelivery(r, operation());
  assert.equal(result.confirmations, 0); assert.equal(result.blockhash, null);
  assert.equal(result.observationAttempts, 2); assert.equal(result.paidFeeSatoshi, null);
  assert.equal(r.calls.some(c => c.method === 'getblockcount'), false);
});

test('changing tip is rejected after exactly three bounded attempts', async () => {
  const r = fixture({ changingTip: true }); await assert.rejects(observeBitcoinDelivery(r, operation()), /BITCOIN_OBSERVATION_UNSTABLE/);
  assert.equal(r.calls.filter(c => c.method === 'getbestblockhash').length, 6);
});

test('inconsistent headers are rejected even when sampled tip hashes match', async () => {
  await assert.rejects(observeBitcoinDelivery(fixture({ inconsistentHeader: true }), operation()), /BITCOIN_OBSERVATION_UNSTABLE/);
});

for (const [name, options, expected] of [
  ['spent chain output', { spent: true }, 'SPENT_IN_OBSERVED_CHAIN'],
  ['mempool spend', { spendPending: true }, 'SPENT_IN_MEMPOOL_OBSERVED'],
  ['unspent output', {}, 'UNSPENT_OBSERVED'],
  ['unavailable UTXO query', { utxoFailure: true }, 'UNKNOWN'],
]) test(`historical confirmed delivery stays admissible with ${name}`, async () => {
  const result = await observeBitcoinDelivery(fixture(options), operation());
  assert.equal(result.confirmations, 6); assert.equal(result.outputState, expected);
  assert.equal(result.paidFeeSatoshi, '140'); assert.equal(result.feeStatus, 'CONFIRMED_IN_OBSERVED_CHAIN');
});

test('mempool fee is a transaction term, never presented as paid', async () => {
  const result = await observeBitcoinDelivery(fixture({ pending: true }), operation());
  assert.equal(result.feeSatoshi, '140'); assert.equal(result.paidFeeSatoshi, null); assert.equal(result.feeStatus, 'UNCONFIRMED_NOT_PAID');
});

test('reorg keeps historical confirmation but removes current delivery and fee claim', async () => {
  const confirmed = mergeBitcoinObservation({}, await observeBitcoinDelivery(fixture(), operation()));
  const pending = mergeBitcoinObservation(confirmed, await observeBitcoinDelivery(fixture({ pending: true }), operation()));
  assert.equal(pending.transactionState, 'REORGED_MEMPOOL'); assert.equal(pending.reorgObserved, true);
  assert.equal(pending.lastConfirmed.blockhash, 'block-A'); assert.equal(pending.confirmations, 0); assert.equal(pending.paidFeeSatoshi, null);
  const text = nativeOutcome({ operation: { bitcoin: pending, terminalDecision: 'REFUNDED' }, observations: { bitcoin: { delivery: { status: 'OBSERVED' } } } });
  assert.match(text, /reorganización/); assert.doesNotMatch(text, /Comisión incluida|el solver la financia/);
});

for (const [transactionState, expected] of [
  ['SIGNED', /no consta envío ni entrega/], ['SUBMISSION_UNKNOWN', /aceptación, entrega y comisión pagada sin verificar/],
  ['MEMPOOL', /sin confirmaciones/], ['UNKNOWN', /entrega y comisión pagada sin verificar/],
]) test(`refund text retains uncertainty for ${transactionState}`, () => {
  const text = nativeOutcome({ operation: { terminalDecision: 'REFUNDED', bitcoin: { transactionState } } });
  assert.match(text, expected); assert.doesNotMatch(text, /Comisión incluida|el solver la financia|destinatario recibió/);
});

test('EVM terminal refresh and Bitcoin balance query do not freshen cached Bitcoin delivery', () => {
  const old = '2026-10-02T00:00:00.000Z';
  const s = { operation: { terminalDecision: 'PAID', bitcoin: { transactionState: 'CONFIRMED_IN_OBSERVED_CHAIN', confirmations: 6, observedAt: old } }, observations: { bitcoin: { delivery: { status: 'OBSERVED', observedAt: old } } } };
  markObservation(s, 'bitcoin', 'delivery', 'NOT_RECHECKED');
  markObservation(s, 'evm', 'authority', 'OBSERVED', true); markObservation(s, 'bitcoin', 'balance', 'OBSERVED', true);
  assert.equal(s.observations.bitcoin.delivery.observedAt, old); assert.equal(s.operation.bitcoin.observedAt, old);
  assert.equal(s.observations.bitcoin.delivery.status, 'NOT_RECHECKED'); assert.equal(s.observations.bitcoin.balance.status, 'OBSERVED');
  assert.match(nativeOutcome(s), /estado actual de Bitcoin no se ha actualizado/);
  markObservation(s, 'bitcoin', 'delivery', 'UNAVAILABLE_OR_REJECTED');
  assert.equal(s.observations.bitcoin.delivery.observedAt, old);
});

test('spent confirmed refund describes observed fee and conditional economic exposure', async () => {
  const bitcoin = mergeBitcoinObservation({}, await observeBitcoinDelivery(fixture({ spent: true }), operation()));
  const text = nativeOutcome({ operation: { terminalDecision: 'REFUNDED', bitcoin }, observations: { bitcoin: { delivery: { status: 'OBSERVED' } } } });
  assert.match(text, /salida ya se había gastado/); assert.match(text, /Comisión incluida: 140 sats/);
  assert.match(text, /si esta entrega permanece canónica/);
});

test('rejected eligibility still persists adverse Bitcoin facts with their fresh marker', async () => {
  const confirmed = mergeBitcoinObservation({}, await observeBitcoinDelivery(fixture(), operation()));
  confirmed.certifiedBlockhash = confirmed.blockhash; confirmed.observedAtEvmTime = 100;
  const state = { status: 'BTC_CONFIRMED', operation: { ...operation(), bitcoin: confirmed } }; let journal;
  await assert.rejects(async () => {
    const observed = await retainBitcoinObservation(state, () => observeBitcoinDelivery(fixture({ pending: true }), state.operation), async () => { journal = JSON.stringify(state); });
    assert.ok(observed.confirmations >= 6, 'INSUFFICIENT_CONFIRMATIONS');
  }, /INSUFFICIENT_CONFIRMATIONS/);
  const stored = JSON.parse(journal);
  assert.equal(stored.status, 'BTC_PENDING');
  assert.equal(stored.operation.bitcoin.confirmations, 0); assert.equal(stored.operation.bitcoin.paidFeeSatoshi, null);
  assert.equal(stored.operation.bitcoin.transactionState, 'REORGED_MEMPOOL');
  assert.equal(stored.operation.bitcoin.certifiedBlockhash, undefined); assert.equal(stored.operation.bitcoin.observedAtEvmTime, undefined);
  assert.equal(stored.observations.bitcoin.delivery.status, 'OBSERVED');
  assert.equal(stored.operation.bitcoin.lastConfirmed.blockhash, 'block-A');
  assert.equal(state.operation.bitcoin.observedAt, stored.operation.bitcoin.observedAt);
});

test('Bitcoin observation persistence failure cannot return eligible facts to the payer', async () => {
  const state = { operation: operation() }; let reachedEligibility = false;
  await assert.rejects(async () => {
    await retainBitcoinObservation(state, () => observeBitcoinDelivery(fixture(), state.operation), async () => { throw new Error('JOURNAL_WRITE_FAILED'); });
    reachedEligibility = true;
  }, /JOURNAL_WRITE_FAILED/);
  assert.equal(reachedEligibility, false);
});
