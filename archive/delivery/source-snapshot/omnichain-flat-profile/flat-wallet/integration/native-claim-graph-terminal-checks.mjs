/** Integration-only original withdrawal replay evidence. Adapted from the
 * reviewed EVM terminal checks; no vault semantics or economic actions. */
import assert from 'node:assert/strict';
import { assertLocalEvm } from '../wallet-platform/modules/chain-adapters/local-evm-ownership.mjs';
import { exactRecord } from '../wallet-platform/modules/paeg/commitments.mjs';
import { decodeWalletPoolInputs } from '../../../omnichain-product/src/private-wallet-note-encoding.mjs';
import { encodeFlatTransaction } from '../wallet-platform/modules/paeg/transaction-codec.mjs';
const copy = value => structuredClone(value);
const match = (value, expression) => typeof value === 'string' && expression.exec(value)?.[0] === value;
const quantity = value => { assert.ok(match(value, /^0x(?:0|[1-9a-f][0-9a-f]*)$/), 'CLAIM_GRAPH_REPLAY_QUANTITY'); return BigInt(value); };
const integer = value => { assert.ok(match(value, /^(?:0|[1-9][0-9]*)$/), 'CLAIM_GRAPH_REPLAY_INTEGER'); return BigInt(value); };
const economicInventory = ({ nativeHead: _head, ...inventory }) => inventory;

/** Current-head state reads through the original owned fixture. Native chain
 * heads may advance independently; their accounting and complete owned effect
 * histories must remain unchanged. No signature, send, or proof is requested. */
export async function readClaimGraphReplayState({ fixture, readers, sender }) {
  const { runtime, system, claims, observer } = fixture;
  await assertLocalEvm(runtime);
  assert.equal(readers.length, 2, 'CLAIM_GRAPH_REPLAY_BOTH_POOLS');
  const header = await runtime.block(), views = [];
  for (const reader of readers) {
    const view = await reader.read();
    assert.equal('0x' + view.head.hash, header.hash, 'CLAIM_GRAPH_REPLAY_READ_HEAD'); views.push(view);
  }
  const claimView = await observer.read();
  assert.equal('0x' + claimView.head.hash, header.hash, 'CLAIM_GRAPH_REPLAY_READ_HEAD');
  const participants = [...new Set([...runtime.accounts, ...system.pools.map(p => p.address),
    ...claims.gateways.map(g => g.address), ...claims.wrappers.map(t => t.address), claims.authority.address, system.hub.address])];
  assert.ok(participants.includes(sender), 'CLAIM_GRAPH_REPLAY_ORIGINAL_SENDER');
  const tokens = [];
  for (const pool of system.pools) {
    const balances = {}; let totalSupply;
    for (const holder of participants) {
      const observed = await pool.assetCapability.read({ holder, blockNumber: header.number });
      assert.equal(observed.blockHash, header.hash, 'CLAIM_GRAPH_REPLAY_READ_HEAD');
      if (totalSupply !== undefined) assert.equal(observed.totalSupply, totalSupply);
      totalSupply = observed.totalSupply; balances[holder] = observed.balance;
    }
    tokens.push({ metadata: pool.assetCapability.metadata, totalSupply, balances });
  }
  const nativeBalances = {};
  for (const holder of participants) nativeBalances[holder] = String(await runtime.balance(holder, header.number));
  const custody = [];
  for (const native of [fixture.bitcoin, fixture.solana]) custody.push({
    inventory: economicInventory(await native.inventory()), transfers: native.transfers });
  const graphBalances = {};
  for (const address of [fixture.graphSolana.solver, ...fixture.graphSolana.recipients])
    graphBalances[address] = await fixture.graphSolana.balance(address);
  const bitcoinHead = await fixture.graphBitcoin.health();
  const native = { custody, graph: { solana: { balances: graphBalances, transfers: fixture.graphSolana.transfers },
    bitcoin: { genesis: bitcoinHead.genesis, height: bitcoinHead.height, tip: bitcoinHead.tip,
      transfers: fixture.graphBitcoin.transfers } } };
  const senderNonce = String(await runtime.nonce(sender, 'latest'));
  for (let i = 0; i < readers.length; i++) await readers[i].assertCurrent(views[i]);
  await observer.assertCurrent(claimView);
  await runtime.assertCanonical(header); assert.deepEqual(await runtime.block(), header, 'CLAIM_GRAPH_REPLAY_READ_HEAD');
  return copy({ head: header, senderNonce, transactionCount: runtime.transactions.length, nativeBalances,
    accounting: { pools: views.map(view => ({ publicState: view.ledger.publicState,
      commitments: view.ledger.commitments, nullifiers: view.ledger.nullifiers, roots: view.ledger.roots,
      rawState: view.poolObservation.rawState, rawHistory: view.poolObservation.rawHistory,
      rawBacking: view.poolObservation.rawBacking, authorizationRoots: view.authorizationRoots,
      authorizationNodes: view.authorizationTree.nodes, hubState: view.state,
      receiptLeaves: view.receiptLeaves, spentTags: view.spentTags, revokedEntries: view.revokedEntries,
      checkpointCount: view.checkpointCount, checkpointNodes: view.checkpointTree.nodes,
      evidenceHistory: view.evidenceHistory, overflow: view.overflow, capacity: view.capacity })),
    tokens, claims: { hubStateSequence: claimView.hubStateSequence, gateways: claimView.gateways }, native } });
}

/** A rejected original call must preserve the exact proof/nullifier and every
 * economic state/history, with just its one sender nonce, block and gas fee.
 * Error text is corroborating evidence, never the replay acceptance criterion. */
export function assertClaimGraphPayoutReplay(input) {
  exactRecord(input, ['original', 'originalReceipt', 'replay', 'receipt', 'before', 'after', 'nullifier', 'proof', 'actualReason']);
  const { original, originalReceipt, replay, receipt, before, after, nullifier, proof, actualReason } = input;
  assert.ok(match(nullifier, /^0x[0-9a-f]{64}$/), 'CLAIM_GRAPH_REPLAY_NULLIFIER');
  const statement = decodeWalletPoolInputs('withdraw_balance', proof.publicInputs);
  assert.equal(statement.nullifier, nullifier, 'CLAIM_GRAPH_REPLAY_ORIGINAL_N');
  assert.equal(statement.amount, '1200000', 'CLAIM_GRAPH_REPLAY_ORIGINAL_AMOUNT');
  assert.equal(encodeFlatTransaction('withdrawBalance', proof), original.input, 'CLAIM_GRAPH_REPLAY_ORIGINAL_PROOF');
  assert.equal(originalReceipt.status, '0x1', 'CLAIM_GRAPH_REPLAY_ORIGINAL_SUCCEEDED');
  assert.equal(originalReceipt.transactionHash, original.hash, 'CLAIM_GRAPH_REPLAY_ORIGINAL_TRANSACTION');
  assert.equal(originalReceipt.from, original.from); assert.equal(originalReceipt.to, original.to);
  assert.equal(originalReceipt.blockHash, original.blockHash); assert.equal(originalReceipt.blockNumber, original.blockNumber);
  assert.equal(before.head.hash, original.blockHash, 'CLAIM_GRAPH_REPLAY_ORIGINAL_INCLUDED_HEAD');
  assert.equal(before.head.number, original.blockNumber, 'CLAIM_GRAPH_REPLAY_ORIGINAL_INCLUDED_HEAD');
  assert.deepEqual(before.head.transactions, [original.hash], 'CLAIM_GRAPH_REPLAY_ORIGINAL_ONE_TRANSACTION');
  assert.equal(receipt.status, '0x0', 'CLAIM_GRAPH_REPLAY_MUST_REVERT');
  assert.deepEqual(receipt.logs, [], 'CLAIM_GRAPH_REPLAY_LOGS');
  assert.equal(receipt.transactionHash, replay.hash, 'CLAIM_GRAPH_REPLAY_ORIGINAL_TRANSACTION');
  assert.notEqual(replay.hash, original.hash, 'CLAIM_GRAPH_REPLAY_DISTINCT_TRANSACTION');
  for (const key of ['from', 'to', 'input', 'value']) assert.equal(replay[key], original[key], 'CLAIM_GRAPH_REPLAY_SAME_CALL');
  assert.equal(quantity(replay.value), 0n, 'CLAIM_GRAPH_REPLAY_NO_NATIVE_PRINCIPAL');
  assert.equal(receipt.from, replay.from); assert.equal(receipt.to, replay.to);
  assert.equal(replay.blockHash, receipt.blockHash); assert.equal(replay.blockNumber, receipt.blockNumber);
  assert.equal(after.head.hash, receipt.blockHash, 'CLAIM_GRAPH_REPLAY_INCLUDED_HEAD');
  assert.equal(after.head.parentHash, before.head.hash, 'CLAIM_GRAPH_REPLAY_ONE_BLOCK');
  assert.equal(quantity(after.head.number), quantity(before.head.number) + 1n, 'CLAIM_GRAPH_REPLAY_ONE_BLOCK');
  assert.deepEqual(after.head.transactions, [replay.hash], 'CLAIM_GRAPH_REPLAY_ONE_TRANSACTION');
  assert.equal(after.transactionCount, before.transactionCount + 1, 'CLAIM_GRAPH_REPLAY_ONE_TRANSACTION');
  assert.equal(quantity(replay.nonce), integer(before.senderNonce), 'CLAIM_GRAPH_REPLAY_ORIGINAL_NONCE');
  assert.equal(integer(after.senderNonce), integer(before.senderNonce) + 1n, 'CLAIM_GRAPH_REPLAY_NONCE_PROGRESSION');
  assert.equal(before.accounting.pools.length, 2, 'CLAIM_GRAPH_REPLAY_BOTH_POOLS');
  for (const state of [before, after]) assert.ok(state.accounting.pools[1].nullifiers.includes(nullifier), 'CLAIM_GRAPH_REPLAY_ORIGINAL_NULLIFIER_NOT_SPENT');
  assert.deepEqual(after.accounting, before.accounting, 'CLAIM_GRAPH_REPLAY_ACCOUNTING_CHANGED');
  const fee = quantity(receipt.gasUsed) * quantity(receipt.effectiveGasPrice);
  assert.ok(fee > 0n, 'CLAIM_GRAPH_REPLAY_GAS_REQUIRED');
  assert.deepEqual(Object.keys(after.nativeBalances).sort(), Object.keys(before.nativeBalances).sort());
  for (const address of Object.keys(before.nativeBalances))
    assert.equal(integer(after.nativeBalances[address]), integer(before.nativeBalances[address]) - (address === replay.from ? fee : 0n),
      'CLAIM_GRAPH_REPLAY_NATIVE_PRINCIPAL_CHANGED');
  assert.ok(['NOTE_ALREADY_SPENT', 'ASSET_INSUFFICIENT_BACKING'].includes(actualReason), 'CLAIM_GRAPH_REPLAY_UNEXPECTED_REJECTION');
  if (actualReason === 'ASSET_INSUFFICIENT_BACKING') assert.ok(integer(before.accounting.pools[1].publicState.backedAmount) < integer(statement.amount), 'CLAIM_GRAPH_REPLAY_BACKING_REASON');
  return Object.freeze({ status: 'REJECTED_WITHOUT_SECOND_PAYOUT', actualReason, exactOriginalProofAndNullifier: true,
    originalNullifierRemainsSpent: true, claimTokenPoolNativeAccountingUnchanged: true, protocolStateAndHistoryUnchanged: true,
    logs: 0, additionalTransactions: 1, senderNonceIncrease: 1, nativePrincipalTransferred: '0', gasFeePaid: true });
}
