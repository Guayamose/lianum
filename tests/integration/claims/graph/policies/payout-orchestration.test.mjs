/** Only orchestration is exercised. Every chain, prover, recipient and store
 * dependency below is explicitly synthetic, and no process or file is made. */
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { basename } from 'node:path';
let c;
const n = '34'.repeat(32), domain = '56'.repeat(32), data = '0x12345678', tx = '0x' + '11'.repeat(32), replay = '0x' + '22'.repeat(32);
const forbidden = () => { throw new Error('TEST_UNEXPECTED_GRAPH_PREPARATION'); };
mock.module('../owned-flat-fixture.mjs', { exports: { freshFixtureId: () => '12'.repeat(32), writeFixturePrivate: (path, value) => c.files.set(basename(path), structuredClone(value)) } });
mock.module('../prepare-native-claim-graph.mjs', { exports: { prepareNativeClaimGraph: forbidden } });
mock.module('../../wallet-platform/modules/paeg/flat-system-state.mjs', { exports: {
  createFlatSystemStateReader: async ({ runtime, system, poolIndex }) => {
    assert.equal(runtime, c.fixture.runtime); assert.equal(system, c.fixture.system); c.readers.push(poolIndex);
    return { read: async () => ({ ledger: { commitments: ['0x' + n], tree: { path: index => ({ index }) },
      publicState: { backedAmount: '0', actualAssetBalance: '0', liveReservations: 0 } }, head: { timestamp: '1200' } }) };
  },
} });
mock.module('../../../../omnichain-product/src/paeg/proof-process.mjs', { exports: { createProofProcess: args => {
  assert.deepEqual(args, { purpose: 'recipient', modes: ['withdraw_balance'] });
  return { prove: async (mode, witness, words) => {
    assert.equal(mode, 'withdraw_balance'); assert.deepEqual(witness, { originalOnly: true }); assert.deepEqual(words, ['1']);
    c.events.push('prove'); return { proof: Buffer.alloc(32, 1), publicInputs: ['1'], metrics: { synthetic: true } };
  }, close: async () => c.events.push('close-prover') };
} } });
mock.module('../../../../omnichain-product/src/private-wallet-note-encoding.mjs', { exports: {
  walletInputPublicWords: () => ['1'], decodeWalletPoolInputs: () => ({ nullifier: '0x' + n }),
} });
mock.module('../../wallet-platform/modules/paeg/transaction-codec.mjs', { exports: { encodeFlatTransaction: () => data } });
mock.module('../../wallet-platform/modules/native-claims/framing.mjs', { exports: { claimDomainCommitment: () => domain } });
mock.module('../native-claim-graph-terminal-checks.mjs', { exports: {
  readClaimGraphReplayState: async ({ fixture, readers, sender }) => {
    assert.equal(fixture, c.fixture); assert.equal(readers.length, 2); assert.equal(sender, 'sender');
    c.events.push('read-replay-state'); return { step: c.reads++ };
  },
  assertClaimGraphPayoutReplay: evidence => {
    c.events.push('assert-replay'); assert.equal(evidence.nullifier, '0x' + n);
    assert.equal(evidence.original.hash, tx); assert.equal(evidence.replay.hash, replay);
    assert.equal(evidence.originalReceipt.transactionHash, tx); assert.equal(evidence.receipt.transactionHash, replay);
    assert.equal(evidence.actualReason, 'ASSET_INSUFFICIENT_BACKING');
    assert.deepEqual(evidence.before, { step: 0 }); assert.deepEqual(evidence.after, { step: 1 });
    assert.equal(evidence.proof.proof, '01'.repeat(32));
    if (c.rejectReplay) throw new Error('CLAIM_GRAPH_REPLAY_ACCOUNTING_CHANGED');
    return { status: 'REJECTED_WITHOUT_SECOND_PAYOUT', synthetic: true };
  },
} });
const { exitAndRedeemClaimGraphPayout } = await import('../flows/native-claim-graph-case.mjs');
function setup(rejectReplay = false) {
  c = { reads: 0, readers: [], files: new Map(), events: [], redemptionRequests: 0, payouts: 0, rejectReplay };
  const runtime = { accounts: ['sender', 'solver'], transactions: [], transaction: async hash => ({ hash, from: 'sender' }),
    send: async function(label, call, status, expectedReason) {
      c.events.push('send:' + label); assert.deepEqual(call, { to: 'pool1', data }); assert.equal(expectedReason, undefined);
      if (label === 'claim-graph-solver-note-exit') { assert.equal(status, undefined); this.transactions.push({ transactionHash: tx }); return { transactionHash: tx }; }
      assert.equal(label, 'reject-claim-graph-solver-exit-replay'); assert.equal(status, '0x0');
      this.transactions.push({ transactionHash: replay, revert: { reason: 'ASSET_INSUFFICIENT_BACKING' } }); return { transactionHash: replay };
    } };
  c.fixture = { runtime, system: { pools: [{ address: 'pool0' }, { address: 'pool1' }] },
    claims: { configs: [{}, { refundMaxFee: '5000' }] }, solana: { transfers: [] } };
  c.graphCase = { report: {}, graph: { recipients: [{ withdrawalStatus: async () => ({ scope: 'scope', policy: 'policy', payoutCommitment: n,
    canonicalNullifier: n, recipient: 'solver', amount: '1200000' }), authorizeWithdrawal: async args => {
      assert.equal(args.payoutCommitment, n); assert.equal(args.amount, '1200000'); return { originalOnly: true };
    } }] } };
  c.controller = { requestRedemption: async request => {
    c.events.push('redemption'); c.redemptionRequests++;
    assert.equal(request.caller, 'solver'); assert.equal(request.amount, '1200000'); assert.equal(request.claimDomain, domain);
    return { ticketId: 'original-ticket' };
  }, payout: async ({ ticketId }) => { assert.equal(ticketId, 'original-ticket'); c.payouts++; return { status: 'DISCHARGED' }; } };
  c.run = () => exitAndRedeemClaimGraphPayout({ fixture: c.fixture, graphCase: c.graphCase, controller: c.controller,
    stage: async name => c.events.push(name), audit: async () => c.events.push('audit'), onProof: async () => c.events.push('public-proof'),
    confirmOriginal: forbidden, privateDirectory: '/synthetic-audit' });
  return c;
}
test('exact same original withdrawal is rejected economically, retained, then original solver redemption discharges once', async () => {
  const f = setup(); await f.run();
  assert.deepEqual(f.readers, [1, 0]); assert.equal(f.fixture.runtime.transactions.length, 2);
  assert.equal(f.graphCase.report.solverPayoutExited, true); assert.equal(f.graphCase.report.solverNativeRedemptionDischarged, true);
  assert.equal(f.graphCase.report.finalPoolBacking, '0'); assert.equal(f.graphCase.report.finalPoolAssetBalance, '0');
  assert.equal(f.redemptionRequests, 2); assert.equal(f.payouts, 2); assert.equal(f.files.size, 1);
  assert.ok(f.events.indexOf('assert-replay') < f.events.indexOf('redemption'));
  assert.equal(f.files.get('solver-payout-replay.json').original.hash, tx);
});
test('changed replay accounting fails before any native redemption or completed exit report', async () => {
  const f = setup(true); await assert.rejects(f.run(), /CLAIM_GRAPH_REPLAY_ACCOUNTING_CHANGED/);
  assert.equal(f.redemptionRequests, 0); assert.equal(f.payouts, 0); assert.equal(f.graphCase.report.solverPayoutExited, undefined);
  assert.equal(f.files.size, 0); assert.equal(f.fixture.runtime.transactions.length, 2);
});
