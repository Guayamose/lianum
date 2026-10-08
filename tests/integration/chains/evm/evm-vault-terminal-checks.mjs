/** Integration-only economic assertions. Read collection uses the original
 * owned fixture; the pure validators alone confer no chain/proof authority. */
import assert from 'node:assert/strict';
import { assertLocalEvm } from '../../../../packages/backend/src/chains/evm/runtime/local-evm-ownership.mjs';
import { exactRecord } from '../../../../packages/backend/src/execution/encoding/commitments.mjs';
const copy = value => structuredClone(value);
const match = (value, expression) => typeof value === 'string' && expression.exec(value)?.[0] === value;
const quantity = value => { assert.ok(match(value, /^0x(?:0|[1-9a-f][0-9a-f]*)$/), 'EVM_VAULT_REPLAY_QUANTITY'); return BigInt(value); };
const integer = value => { assert.ok(match(value, /^(?:0|[1-9][0-9]*)$/), 'EVM_VAULT_REPLAY_INTEGER'); return BigInt(value); };

/** No sends, signatures, proof work or new runtime. Every balance is read at
 * the captured original head, and the complete read is checked against it. */
export async function readEvmVaultReplayState({ runtime, readers, vault, protocolFixture = null, capabilities, holders, sender }) {
  await assertLocalEvm(runtime);
  const header = await runtime.block();
  const views = [];
  for (const reader of readers) {
    const view = await reader.read();
    assert.equal('0x' + view.head.hash, header.hash, 'EVM_VAULT_REPLAY_READ_HEAD');
    views.push(view);
  }
  let protocolAccounting;
  if (protocolFixture !== null) {
    assert.equal(vault, undefined, 'UNISWAP_REPLAY_VAULT_ABSENT');
    const { assertOfficialProtocolFixture } = await import('../../../../packages/backend/tests/fixtures/operations/deployments/system/official-protocol-fixture-v3.mjs');
    assertOfficialProtocolFixture(runtime, protocolFixture);
    const original = protocolFixture, factoryRows = original.deployments.filter(row => row.name === 'uniswap-factory');
    assert.equal(factoryRows.length, 1, 'UNISWAP_REPLAY_ORIGINAL_FACTORY');
    const factory = factoryRows[0], read = async (contract, method, args = []) => Array.from(contract.iface.decodeFunctionResult(method,
      await runtime.call({ to: contract.address, data: contract.iface.encodeFunctionData(method, args) }, header.number)))
      .map(value => typeof value === 'boolean' ? value : value.toString());
    const poolCode = await runtime.code(original.pool.address, header.number);
    assert.ok(poolCode !== '0x', 'UNISWAP_REPLAY_ORIGINAL_POOL_CODE');
    const rows = await Promise.all([read(factory, 'getPool', [original.first.address, original.second.address, 3000]),
      read(original.pool, 'factory'), read(original.pool, 'token0'), read(original.pool, 'token1'), read(original.pool, 'fee'),
      read(original.pool, 'slot0'), read(original.pool, 'liquidity'),
      read(original.first, 'balanceOf', [original.pool.address]), read(original.second, 'balanceOf', [original.pool.address])]);
    assert.equal(rows[0][0].toLowerCase(), original.pool.address); assert.equal(rows[1][0].toLowerCase(), factory.address);
    assert.equal(rows[4][0], '3000');
    protocolAccounting = { uniswap: { factory: factory.address, pool: original.pool.address, router: original.swapRouter.address,
      poolCode, token0: rows[2][0].toLowerCase(), token1: rows[3][0].toLowerCase(), fee: rows[4][0],
      slot0: rows[5], liquidity: rows[6][0], inputReserve: rows[7][0], outputReserve: rows[8][0] } };
  } else {
    const position = await vault.observe();
    assert.equal('0x' + position.snapshot.blockHash, header.hash, 'EVM_VAULT_REPLAY_READ_HEAD');
    const { snapshot: _block, ...vaultBalances } = position.balances;
    protocolAccounting = { vault: { identity: position.identity, balances: vaultBalances,
      totalAssets: position.snapshot.totalAssets, totalShares: position.snapshot.totalShares } };
  }
  const participants = [...new Set(holders)]; assert.ok(participants.includes(sender));
  const tokens = [];
  for (const asset of capabilities) {
    const balances = {};
    let totalSupply;
    for (const holder of participants) {
      const observed = await asset.read({ holder, blockNumber: header.number });
      assert.equal(observed.blockHash, header.hash, 'EVM_VAULT_REPLAY_READ_HEAD');
      if (totalSupply !== undefined) assert.equal(observed.totalSupply, totalSupply);
      totalSupply = observed.totalSupply; balances[holder] = observed.balance;
    }
    tokens.push({ metadata: asset.metadata, totalSupply, balances });
  }
  const nativeBalances = {};
  for (const holder of participants) nativeBalances[holder] = String(await runtime.balance(holder, header.number));
  const senderNonce = String(await runtime.nonce(sender, 'latest'));
  for (let i = 0; i < readers.length; i++) await readers[i].assertCurrent(views[i]);
  await runtime.assertCanonical(header); assert.deepEqual(await runtime.block(), header, 'EVM_VAULT_REPLAY_READ_HEAD');
  return copy({ head: header, senderNonce, transactionCount: runtime.transactions.length, nativeBalances,
    accounting: { pools: views.map(view => ({ publicState: view.ledger.publicState,
      commitments: view.ledger.commitments, nullifiers: view.ledger.nullifiers, roots: view.ledger.roots,
      rawState: view.poolObservation.rawState, rawHistory: view.poolObservation.rawHistory,
      rawBacking: view.poolObservation.rawBacking, authorizationRoots: view.authorizationRoots,
      authorizationNodes: view.authorizationTree.nodes, hubState: view.state,
      receiptLeaves: view.receiptLeaves, spentTags: view.spentTags, revokedEntries: view.revokedEntries,
      checkpointCount: view.checkpointCount, checkpointNodes: view.checkpointTree.nodes,
      evidenceHistory: view.evidenceHistory, overflow: view.overflow, capacity: view.capacity })),
    tokens, ...protocolAccounting } });
}

/** Check economic replay rejection, not which earlier contract guard fired.
 * A mined revert must consume exactly one sender nonce and its gas fee. */
export function assertEvmVaultPayoutReplay(input) {
  exactRecord(input, ['original', 'replay', 'receipt', 'before', 'after', 'nullifier', 'actualReason']);
  const { original, replay, receipt, before, after, nullifier, actualReason } = input;
  assert.ok(match(nullifier, /^0x[0-9a-f]{64}$/), 'EVM_VAULT_REPLAY_NULLIFIER');
  assert.equal(receipt.status, '0x0', 'EVM_VAULT_REPLAY_MUST_REVERT');
  assert.deepEqual(receipt.logs, [], 'EVM_VAULT_REPLAY_LOGS');
  assert.equal(receipt.transactionHash, replay.hash, 'EVM_VAULT_REPLAY_ORIGINAL_TRANSACTION');
  assert.notEqual(replay.hash, original.hash, 'EVM_VAULT_REPLAY_DISTINCT_TRANSACTION');
  for (const key of ['from', 'to', 'input', 'value']) assert.equal(replay[key], original[key], 'EVM_VAULT_REPLAY_SAME_CALL');
  assert.equal(quantity(replay.value), 0n, 'EVM_VAULT_REPLAY_NO_NATIVE_PRINCIPAL');
  assert.equal(receipt.from, replay.from); assert.equal(receipt.to, replay.to);
  assert.equal(replay.blockHash, receipt.blockHash); assert.equal(replay.blockNumber, receipt.blockNumber);
  assert.equal(after.head.hash, receipt.blockHash, 'EVM_VAULT_REPLAY_INCLUDED_HEAD');
  assert.equal(after.head.parentHash, before.head.hash, 'EVM_VAULT_REPLAY_ONE_BLOCK');
  assert.equal(quantity(after.head.number), quantity(before.head.number) + 1n, 'EVM_VAULT_REPLAY_ONE_BLOCK');
  assert.deepEqual(after.head.transactions, [replay.hash], 'EVM_VAULT_REPLAY_ONE_TRANSACTION');
  assert.equal(after.transactionCount, before.transactionCount + 1, 'EVM_VAULT_REPLAY_ONE_TRANSACTION');
  assert.equal(quantity(replay.nonce), integer(before.senderNonce), 'EVM_VAULT_REPLAY_ORIGINAL_NONCE');
  assert.equal(integer(after.senderNonce), integer(before.senderNonce) + 1n, 'EVM_VAULT_REPLAY_NONCE_PROGRESSION');
  assert.ok(before.accounting.pools[0].nullifiers.includes(nullifier), 'EVM_VAULT_REPLAY_ORIGINAL_NULLIFIER_NOT_SPENT');
  assert.ok(after.accounting.pools[0].nullifiers.includes(nullifier), 'EVM_VAULT_REPLAY_ORIGINAL_NULLIFIER_NOT_SPENT');
  assert.deepEqual(after.accounting, before.accounting, 'EVM_VAULT_REPLAY_ACCOUNTING_CHANGED');
  const fee = quantity(receipt.gasUsed) * quantity(receipt.effectiveGasPrice);
  assert.ok(fee > 0n, 'EVM_VAULT_REPLAY_GAS_REQUIRED');
  assert.deepEqual(Object.keys(after.nativeBalances).sort(), Object.keys(before.nativeBalances).sort());
  for (const address of Object.keys(before.nativeBalances))
    assert.equal(integer(after.nativeBalances[address]), integer(before.nativeBalances[address]) - (address === replay.from ? fee : 0n),
      'EVM_VAULT_REPLAY_NATIVE_PRINCIPAL_CHANGED');
  assert.ok(actualReason === null || match(actualReason, /^[A-Z][A-Z0-9_]{0,99}$/), 'EVM_VAULT_REPLAY_REASON');
  return Object.freeze({ status: 'REJECTED_WITHOUT_SECOND_PAYOUT', actualReason, originalNullifierRemainsSpent: true,
    tokenVaultPoolAccountingUnchanged: true, protocolStateAndHistoryUnchanged: true, logs: 0,
    additionalTransactions: 1, senderNonceIncrease: 1, nativePrincipalTransferred: '0', gasFeePaid: true });
}

/** This fixed one-active-slot graph has three permanent empty-payout capacity
 * markers. They are not spendable notes or outstanding asset liabilities. */
export function assertEvmVaultTerminalPools(states) {
  assert.ok(Array.isArray(states) && states.length === 2, 'EVM_VAULT_TERMINAL_POOLS');
  for (const [index, state] of states.entries()) {
    assert.equal(state.backedAmount, '0', 'EVM_VAULT_TERMINAL_BACKING');
    assert.equal(state.actualAssetBalance, '0', 'EVM_VAULT_TERMINAL_ASSETS');
    assert.equal(state.liveReservations, 0, 'EVM_VAULT_TERMINAL_RESERVATIONS');
    assert.equal(state.outputCapacity, index === 0 ? 3 : 0, 'EVM_VAULT_TERMINAL_PADDING_CAPACITY');
    assert.ok(state.leaves + 4 * state.liveReservations <= 64 && state.spent + 5 * state.liveReservations + state.outputCapacity <= 64,
      'EVM_VAULT_TERMINAL_HEADROOM');
  }
  return Object.freeze({ fundedObligations: '0', conservativeOutputCapacity: Object.freeze([3, 0]),
    paddingSpendable: false, capacityReclaimed: false, repeatedWalletRolloverAccepted: false });
}
