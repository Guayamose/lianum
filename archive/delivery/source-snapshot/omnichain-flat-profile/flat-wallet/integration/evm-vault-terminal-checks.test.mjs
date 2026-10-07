/** Host-only economic postconditions and fixture-wiring regression. No native
 * runtime, compiler, proof, transaction or historical artifact rewrite. */
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const owned = new WeakSet();
mock.module('../wallet-platform/modules/chain-adapters/local-evm-ownership.mjs', {
  exports: { assertLocalEvm: async runtime => assert.ok(owned.has(runtime), 'SYNTHETIC_ORIGINAL_RUNTIME_REQUIRED') },
});
const { readEvmVaultReplayState, assertEvmVaultPayoutReplay, assertEvmVaultTerminalPools } = await import('./evm-vault-terminal-checks.mjs');
const h = n => '0x' + n.repeat(64), address = n => '0x' + n.repeat(40), clone = structuredClone;
const sender = address('1'), recipient = address('2'), pool = address('3'), nullifier = h('4');
function fixture(reason = 'ASSET_INSUFFICIENT_BACKING', backing = '0') {
  const original = { hash: h('5'), from: sender, to: pool, input: '0x1234', value: '0x0', nonce: '0x6' };
  const replay = { ...original, hash: h('6'), nonce: '0x7', blockHash: h('8'), blockNumber: '0xb' };
  const receipt = { transactionHash: replay.hash, from: sender, to: pool, status: '0x0', logs: [],
    blockHash: replay.blockHash, blockNumber: replay.blockNumber, gasUsed: '0xa', effectiveGasPrice: '0x2' };
  const before = { head: { hash: h('7'), number: '0xa' }, senderNonce: '7', transactionCount: 20,
    nativeBalances: { [sender]: '1000', [recipient]: '2000', [pool]: '0' },
    accounting: { pools: [{ nullifiers: [nullifier], roots: [h('9')], rawState: 'original-state', rawHistory: 'original-history',
      publicState: { backedAmount: backing, actualAssetBalance: backing, spent: 4, outputCapacity: 3 } }, { nullifiers: [] }],
    tokens: [{ totalSupply: '1000000', balances: { [recipient]: '120', [pool]: backing } }],
    vault: { totalAssets: '100', totalShares: '100', balances: { allowance: '0', usedNonce: '0' } } } };
  const after = clone(before); after.head = { hash: replay.blockHash, number: '0xb', parentHash: before.head.hash, transactions: [replay.hash] };
  after.senderNonce = '8'; after.transactionCount++; after.nativeBalances[sender] = '980';
  return { original, replay, receipt, before, after, nullifier, actualReason: reason };
}

test('empty backing and funded pool guard precedence both establish the same economic rejection', () => {
  const source = readFileSync(new URL('../contracts/PrivateFlatAssetNotePool.sol', import.meta.url), 'utf8');
  const withdraw = source.slice(source.indexOf('    function _withdraw('), source.indexOf('    /// @notice Verify all four'));
  assert.ok(withdraw.indexOf('require(backedAmount >= amount') < withdraw.indexOf('_availableNullifier(nullifier)'));
  // Synthetic guard examples, not an EVM claim: the actual contract order is
  // anchored above. The validator must not encode one preferred error reason.
  const firstGuard = backed => BigInt(backed) < 120n ? 'ASSET_INSUFFICIENT_BACKING' : 'NOTE_ALREADY_SPENT';
  for (const backing of ['0', '380']) {
    const input = fixture(firstGuard(backing), backing), view = assertEvmVaultPayoutReplay(input);
    assert.equal(view.actualReason, firstGuard(backing)); assert.equal(view.status, 'REJECTED_WITHOUT_SECOND_PAYOUT');
    assert.equal(view.senderNonceIncrease, 1); assert.equal(view.gasFeePaid, true);
    assert.equal(view.protocolStateAndHistoryUnchanged, true);
  }
});

test('any extra token, native-principal, vault, pool, nullifier or history mutation rejects', () => {
  for (const change of [
    x => { x.after.accounting.tokens[0].balances[recipient] = '240'; },
    x => { x.after.accounting.tokens[0].totalSupply = '1000120'; },
    x => { x.after.accounting.vault.totalAssets = '99'; }, x => { x.after.accounting.vault.totalShares = '99'; },
    x => { x.after.accounting.vault.balances.allowance = '120'; }, x => { x.after.accounting.vault.balances.usedNonce = '1'; },
    x => { x.after.accounting.pools[0].rawState = 'changed'; }, x => { x.after.accounting.pools[0].rawHistory = 'changed'; },
    x => { x.after.accounting.pools[0].publicState.outputCapacity = 2; },
    x => { x.after.accounting.pools[0].nullifiers = []; }, x => { x.before.accounting.pools[0].nullifiers = []; },
    x => { x.after.nativeBalances[recipient] = '2001'; }, x => { x.after.nativeBalances[pool] = '1'; },
    x => { x.after.nativeBalances[sender] = '1000'; },
  ]) { const input = fixture(); change(input); assert.throws(() => assertEvmVaultPayoutReplay(input)); }
});

test('successful replay, substituted call, logs, extra transaction and wrong nonce/gas are rejected', () => {
  for (const change of [
    x => { x.receipt.status = '0x1'; }, x => { x.receipt.logs = [{}]; },
    x => { x.replay.input = '0x1235'; }, x => { x.replay.to = recipient; },
    x => { x.replay.from = recipient; }, x => { x.replay.value = '0x1'; },
    x => { x.replay.hash = x.original.hash; }, x => { x.receipt.transactionHash = h('a'); },
    x => { x.after.transactionCount += 1; }, x => { x.after.head.transactions.push(h('a')); },
    x => { x.after.head.number = '0xc'; }, x => { x.after.head.parentHash = h('a'); },
    x => { x.replay.nonce = '0x8'; }, x => { x.after.senderNonce = '7'; }, x => { x.after.senderNonce = '9'; },
    x => { x.receipt.gasUsed = '0x0'; }, x => { x.receipt.effectiveGasPrice = '0x3'; },
    x => { x.actualReason = 'raw private error\n'; },
  ]) { const input = fixture(); change(input); assert.throws(() => assertEvmVaultPayoutReplay(input)); }
});

test('no reason precedence is required, but actual reason is retained without promoting another acceptance', () => {
  assert.equal(assertEvmVaultPayoutReplay(fixture(null)).actualReason, null);
  assert.equal(assertEvmVaultPayoutReplay(fixture('ANOTHER_EARLIER_GUARD')).actualReason, 'ANOTHER_EARLIER_GUARD');
  assert.equal(Object.hasOwn(assertEvmVaultPayoutReplay(fixture()), 'privateVaultGraphAcceptance'), false);
});

const pools = () => [{ backedAmount: '0', actualAssetBalance: '0', liveReservations: 0, outputCapacity: 3, leaves: 7, spent: 4 },
  { backedAmount: '0', actualAssetBalance: '0', liveReservations: 0, outputCapacity: 0, leaves: 1, spent: 1 }];
test('terminal accounting truthfully retains three padding slots and rejects fake zero capacity or remaining value', () => {
  const result = assertEvmVaultTerminalPools(pools()); assert.deepEqual(result.conservativeOutputCapacity, [3, 0]);
  assert.equal(result.capacityReclaimed, false); assert.equal(result.repeatedWalletRolloverAccepted, false);
  for (const patch of [{ outputCapacity: 0 }, { outputCapacity: 4 }, { backedAmount: '1' },
    { actualAssetBalance: '1' }, { liveReservations: 1 }, { leaves: 65 }, { spent: 62 }]) {
    const states = pools(); Object.assign(states[0], patch); assert.throws(() => assertEvmVaultTerminalPools(states));
  }
});

test('source pool has bounded future capacity, not a reusable infinite or immediately blocked ledger', () => {
  const source = readFileSync(new URL('../contracts/PrivateFlatAssetNotePool.sol', import.meta.url), 'utf8');
  assert.ok(source.includes('leaves + FUTURE_PAYOUT_SLOTS * reservations <= CAPACITY'));
  assert.ok(source.includes('consumed + (FUTURE_PAYOUT_SLOTS + 1) * reservations + outputs <= CAPACITY'));
  for (let cycles = 1; cycles <= 9; cycles++) assert.ok(7 * cycles <= 64);
  assert.ok(7 * 10 > 64); // Same full cycle: deposit+reserve+four outputs.
  assert.ok(7 + 1 + 2 + 4 <= 64); // One further deposit/reservation still fits.
  assert.ok(4 + 1 + 5 + (3 + 1) <= 64);
});

test('state collector pins every balance/head and retains protocol arrays without mutating the fixture', async () => {
  const head = { hash: h('7'), number: '0xa', parentHash: h('6'), transactions: [h('5')] };
  const makeView = () => ({ head: { hash: head.hash.slice(2) }, ledger: { publicState: pools()[0], commitments: [h('a')],
    nullifiers: [nullifier], roots: [h('b')] }, poolObservation: { rawState: 'state', rawHistory: 'history', rawBacking: 'backing' },
    authorizationRoots: [h('c')], authorizationTree: { nodes: [h('d')] }, state: { spentTagCount: '4' },
    receiptLeaves: [h('e')], spentTags: [h('f')], revokedEntries: [], checkpointCount: '1',
    checkpointTree: { nodes: [h('a')] }, evidenceHistory: { values: [h('b')] }, overflow: { count: '0' }, capacity: { totalReserved: '0' } });
  let reads = 0, mutations = 0; const view = makeView();
  const runtime = { block: async () => clone(head), assertCanonical: async value => assert.deepEqual(value, head),
    transactions: Array(20), balance: async (_holder, at) => { assert.equal(at, head.number); return 1000n; },
    nonce: async (_sender, at) => { assert.equal(at, 'latest'); return 7n; }, send: () => { mutations++; throw Error('NO_SEND'); } };
  owned.add(runtime);
  const reader = { read: async () => { reads++; return view; }, assertCurrent: async value => assert.equal(value, view) };
  const vault = { observe: async () => ({ identity: { vault: pool }, snapshot: { blockHash: head.hash.slice(2), totalAssets: '100', totalShares: '100' },
    balances: { snapshot: { blockHash: head.hash.slice(2) }, senderAssets: '0', senderShares: '100', allowance: '0', usedNonce: '0' } }) };
  const asset = { metadata: { symbol: 'PALT' }, read: async ({ holder, blockNumber }) => {
    assert.equal(blockNumber, head.number); return { blockHash: head.hash, totalSupply: '1000000', balance: holder === recipient ? '120' : '0' }; } };
  const args = { runtime, readers: [reader, reader], vault, capabilities: [asset, asset], holders: [sender, recipient, pool], sender };
  const result = await readEvmVaultReplayState(args); assert.equal(reads, 2); assert.equal(mutations, 0);
  assert.deepEqual(result.accounting.pools[0].nullifiers, [nullifier]); assert.equal(result.accounting.tokens[0].balances[recipient], '120');
  assert.equal(Object.hasOwn(result.accounting.vault.balances, 'snapshot'), false);
  view.head.hash = h('9').slice(2); await assert.rejects(readEvmVaultReplayState(args), /READ_HEAD/);
});

test('remaining harness postconditions bind target redemption, original recipient, final value and truthful capacity together', () => {
  const source = readFileSync(new URL('./evm-vault-flow.mjs', import.meta.url), 'utf8');
  assert.ok(source.includes("{ to: system.pools[0].address, data: exitData }, '0x0');"));
  assert.ok(!source.includes("'0x0', 'NOTE_ALREADY_SPENT'"));
  assert.ok(source.includes("nullifier: '0x' + status.canonicalNullifier"));
  assert.ok(source.includes('result.solverPayoutReplay = assertEvmVaultPayoutReplay(replayEvidence)'));
  assert.ok(source.includes("requestId: 'vault_exit_1', minimumOutput: '100'"));
  for (const fragment of ["preparedRedemption.shares, '100'", "redemptionResult.redeemedUnderlying, '100'",
    "redemptionResult.underlyingPrivateSpendable, false", 'capabilities[0].balance(runtime.accounts[4]), 100n',
    "vault.snapshot.totalAssets, '0'", "vault.snapshot.totalShares, '0'", 'result.finalCapacity = assertEvmVaultTerminalPools(result.finalPools)',
    "final.assets.map(asset => asset.balances.available), ['0', '0']", 'runtime.transactions.filter(entry => entry.signed).length, 1'])
    assert.ok(source.includes(fragment), fragment);
});
