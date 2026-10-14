/** Synthetic state/wire tests only. No native nodes or proof backends. */
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { encodeWalletPoolInputs } from '@lianum/engine/wallet/notes/private-wallet-note-encoding';
import { encodeFlatTransaction } from '../../../../../packages/backend/src/execution/encoding/transaction-codec.mjs';
const owned = new WeakSet();
mock.module('../../../../../packages/backend/src/chains/evm/runtime/local-evm-ownership.mjs', {
  exports: { assertLocalEvm: async runtime => assert.ok(owned.has(runtime), 'TEST_ORIGINAL_RUNTIME_REQUIRED') },
});
const { readClaimGraphReplayState, assertClaimGraphPayoutReplay } = await import('../validation/native-claim-graph-terminal-checks.mjs');
const h = n => '0x' + n.repeat(64), a = n => '0x' + n.repeat(40), clone = structuredClone;
const sender = a('1'), recipient = a('2'), pool = a('3'), nullifier = h('4');
function evidence(reason = 'ASSET_INSUFFICIENT_BACKING', backing = '0') {
  const proof = { proof: 'ab'.repeat(32), publicInputs: encodeWalletPoolInputs('withdraw_balance', {
    scope: h('1'), policy: h('2'), epoch: '10', root: h('3'), nullifier, amount: '1200000', recipient }) };
  const original = { hash: h('5'), from: sender, to: pool, input: encodeFlatTransaction('withdrawBalance', proof), value: '0x0', nonce: '0x6', blockHash: h('7'), blockNumber: '0xa' };
  const replay = { ...original, hash: h('6'), nonce: '0x7', blockHash: h('8'), blockNumber: '0xb' };
  const receipt = { transactionHash: replay.hash, from: sender, to: pool, status: '0x0', logs: [], blockHash: replay.blockHash,
    blockNumber: replay.blockNumber, gasUsed: '0xa', effectiveGasPrice: '0x2' };
  const originalReceipt = { status: '0x1', transactionHash: original.hash, from: sender, to: pool, blockHash: original.blockHash, blockNumber: original.blockNumber };
  const before = { head: { hash: h('7'), number: '0xa', transactions: [original.hash] }, senderNonce: '7', transactionCount: 20,
    nativeBalances: { [sender]: '1000', [recipient]: '2000', [pool]: '0' }, accounting: {
      pools: [{ nullifiers: [] }, { nullifiers: [nullifier], roots: [h('9')], rawState: 'state', rawHistory: 'history',
        publicState: { backedAmount: backing, actualAssetBalance: backing, outputCapacity: 3 } }],
      tokens: [{ totalSupply: '1200000', balances: { [recipient]: '1200000', [pool]: backing } }],
      claims: { hubStateSequence: '9', gateways: [{ wrapperSupply: '1200000', intents: [{}], tickets: [{}] }] },
      native: { custody: [{ inventory: { accounts: [{ total: '3000000' }], nonceInfrastructureByAuthority: { depositor: {}, escrow: {} } }, transfers: [{}] }],
        graph: { solana: { balances: { solver: '9000000', recipient: '1000000' }, transfers: [{}] }, bitcoin: { transfers: [] } } } } };
  const after = clone(before); after.head = { hash: replay.blockHash, number: '0xb', parentHash: before.head.hash, transactions: [replay.hash] };
  after.senderNonce = '8'; after.transactionCount++; after.nativeBalances[sender] = '980';
  return { original, originalReceipt, replay, receipt, before, after, nullifier, proof, actualReason: reason };
}
test('backing-first and spent-N rejection require the same full economic invariants', () => {
  const source = readFileSync(new URL('../../../../../contracts/wallet/PrivateFlatAssetNotePool.sol', import.meta.url), 'utf8');
  const body = source.slice(source.indexOf('    function _withdraw('), source.indexOf('    /// @notice Verify all four'));
  assert.ok(body.indexOf('require(backedAmount >= amount') < body.indexOf('_availableNullifier(nullifier)'));
  for (const [reason, backing] of [['ASSET_INSUFFICIENT_BACKING', '0'], ['NOTE_ALREADY_SPENT', '2000000']]) {
    const result = assertClaimGraphPayoutReplay(evidence(reason, backing));
    assert.equal(result.status, 'REJECTED_WITHOUT_SECOND_PAYOUT'); assert.equal(result.exactOriginalProofAndNullifier, true);
    assert.equal(result.claimTokenPoolNativeAccountingUnchanged, true); assert.equal(result.actualReason, reason);
  }
});
test('replay refuses changed proof/N, success, call, log, block, nonce, gas or arbitrary error', () => {
  for (const change of [
    x => x.nullifier = h('a'), x => x.proof.proof = 'cd'.repeat(32), x => x.originalReceipt.status = '0x0',
    x => x.originalReceipt.transactionHash = h('a'), x => x.receipt.status = '0x1', x => x.receipt.logs = [{}],
    x => x.replay.input += '00', x => x.replay.to = recipient, x => x.replay.from = recipient, x => x.replay.value = '0x1',
    x => x.after.head.parentHash = h('a'), x => x.after.head.number = '0xc', x => x.after.head.transactions.push(h('a')),
    x => x.after.transactionCount++, x => x.after.senderNonce = '9', x => x.replay.nonce = '0x8',
    x => x.receipt.gasUsed = '0x0', x => x.receipt.effectiveGasPrice = '0x3',
    x => x.actualReason = 'ANY_ERROR', x => x.actualReason = null,
  ]) { const x = evidence(); change(x); assert.throws(() => assertClaimGraphPayoutReplay(x)); }
  assert.throws(() => assertClaimGraphPayoutReplay(evidence('ASSET_INSUFFICIENT_BACKING', '2000000')), /BACKING_REASON/);
});
test('every claim/token/pool/native balance and history mutation rejects', () => {
  for (const change of [
    x => x.after.accounting.pools[1].nullifiers = [], x => x.before.accounting.pools[1].nullifiers = [],
    x => x.after.accounting.pools[1].rawHistory = 'changed', x => x.after.accounting.pools[1].publicState.outputCapacity = 0,
    x => x.after.accounting.tokens[0].totalSupply = '2400000', x => x.after.accounting.tokens[0].balances[recipient] = '2400000',
    x => x.after.accounting.claims.gateways[0].wrapperSupply = '0', x => x.after.accounting.claims.gateways[0].tickets.push({}),
    x => x.after.accounting.native.custody[0].inventory.accounts[0].total = '0',
    x => x.after.accounting.native.custody[0].inventory.nonceInfrastructureByAuthority.depositor.changed = true,
    x => x.after.accounting.native.custody[0].transfers.push({}),
    x => x.after.accounting.native.graph.solana.balances.solver = '8000000',
    x => x.after.accounting.native.graph.solana.transfers.push({}), x => x.after.accounting.native.graph.bitcoin.transfers.push({}),
    x => x.after.nativeBalances[sender] = '1000', x => x.after.nativeBalances[recipient] = '2001',
  ]) { const x = evidence(); change(x); assert.throws(() => assertClaimGraphPayoutReplay(x)); }
});
test('collector uses all original pools/tokens/claims, current heads and separate native balances/history', async () => {
  const head = { hash: h('7'), number: '0xa' }, checks = [];
  const view = index => ({ head: { hash: head.hash.slice(2) }, ledger: { publicState: {}, commitments: [], nullifiers: index ? [nullifier] : [], roots: [] },
    poolObservation: {}, authorizationTree: { nodes: [] }, checkpointTree: { nodes: [] } });
  const views = [view(0), view(1)];
  const readers = views.map(v => ({ read: async () => v, assertCurrent: async x => { assert.equal(x, v); checks.push('pool'); } }));
  const runtime = { accounts: [sender, recipient], transactions: [], block: async () => clone(head), balance: async () => '0', nonce: async () => 7n,
    assertCanonical: async x => assert.deepEqual(x, head) }; owned.add(runtime);
  const reads = [], asset = { metadata: { address: a('a') }, read: async ({ holder, blockNumber }) => {
    reads.push(holder); assert.equal(blockNumber, head.number); return { blockHash: head.hash, totalSupply: '1200000', balance: holder === recipient ? '1200000' : '0' }; } };
  const claimsView = { head: { hash: head.hash.slice(2) }, hubStateSequence: '9', gateways: [{ wrapperSupply: '1200000' }] };
  const fixture = { runtime, system: { pools: [a('3'), a('4')].map(address => ({ address, assetCapability: asset })), hub: { address: a('5') } },
    claims: { gateways: [{ address: a('6') }, { address: a('7') }], wrappers: [{ address: a('8') }, { address: a('9') }], authority: { address: a('a') } },
    observer: { read: async () => claimsView, assertCurrent: async x => { assert.equal(x, claimsView); checks.push('claims'); } },
    bitcoin: { inventory: async () => ({ nativeHead: { height: '99' }, accounts: [{ total: '42' }] }), transfers: [] },
    solana: { inventory: async () => ({ nativeHead: { slot: '999' }, accounts: [{ total: '10' }], nonceInfrastructureByAuthority: { depositor: {}, escrow: {} } }), transfers: [{}] },
    graphSolana: { solver: 'solver', recipients: ['recipient0', 'recipient1'], balance: async a => ({ solver: '9', recipient0: '1', recipient1: '0' })[a], transfers: [{}] },
    graphBitcoin: { health: async () => ({ genesis: 'genesis', height: 50, tip: 'tip' }), transfers: [] } };
  const result = await readClaimGraphReplayState({ fixture, readers, sender });
  assert.deepEqual(checks, ['pool', 'pool', 'claims']); assert.equal(result.accounting.tokens.length, 2);
  assert.equal(new Set(reads).size, 10); assert.equal(reads.length, 20);
  assert.deepEqual(result.accounting.native.graph.solana.balances, { solver: '9', recipient0: '1', recipient1: '0' });
  assert.equal(result.accounting.native.custody[1].inventory.nativeHead, undefined);
  assert.equal(result.accounting.native.custody[1].transfers.length, 1);
  claimsView.head.hash = h('8').slice(2);
  await assert.rejects(readClaimGraphReplayState({ fixture, readers, sender }), /READ_HEAD/);
});
