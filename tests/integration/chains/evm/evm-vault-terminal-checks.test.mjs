/** Host-only economic postconditions and fixture-wiring regression. No native
 * runtime, compiler, proof, transaction or historical artifact rewrite. */
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const owned = new WeakSet();
mock.module('../wallet-platform/modules/chain-adapters/local-evm-ownership.mjs', {
  exports: { assertLocalEvm: async runtime => assert.ok(owned.has(runtime), 'SYNTHETIC_ORIGINAL_RUNTIME_REQUIRED') },
});
const { readEvmVaultReplayState, assertEvmVaultPayoutReplay, assertEvmVaultTerminalPools,
  EVM_UNISWAP_RECOVERY_RESULT, assertEvmUniswapRecoveryResult } = await import('./evm-vault-terminal-checks.mjs');
const { EVM_METAMORPHO_RECOVERY_RESULT_V1, METAMORPHO_F_REVIEWED_RELEASE_V1, assertOriginalMetaMorphoFAccountingV1,
  assertEvmMetaMorphoRecoveryResultV1, assertMetaMorphoFReleaseV1 } = await import('./evm-metamorpho-recovery-policy-v1.mjs');
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

test('rejected payout replay preserves Uniswap reserves, liquidity and price as well as private balances', () => {
  const input = fixture();
  delete input.before.accounting.vault; delete input.after.accounting.vault;
  const swap = { pool: address('a'), inputReserve: '10001004', outputReserve: '9999000',
    liquidity: '10000000', slot0: ['79228162514264337593543950336', '0', '0', '1', '1', '0', true] };
  input.before.accounting.uniswap = clone(swap); input.after.accounting.uniswap = clone(swap);
  assert.equal(assertEvmVaultPayoutReplay(input).protocolStateAndHistoryUnchanged, true);
  for (const mutate of [value => { value.inputReserve = '10001005'; },
    value => { value.outputReserve = '9998999'; }, value => { value.liquidity = '10000001'; },
    value => { value.slot0[0] = '79228162514264337593543950337'; }, value => { value.pool = address('b'); }]) {
    const changed = clone(input); mutate(changed.after.accounting.uniswap);
    assert.throws(() => assertEvmVaultPayoutReplay(changed));
  }
});

// Public host metadata only. This fixture does not claim a proof or swap run.
function recoveryFixture() {
  const finalPools = [{ backedAmount: '0', actualAssetBalance: '0', liveReservations: 0 },
    { backedAmount: '0', actualAssetBalance: '0', liveReservations: 0 }];
  const result = { format: EVM_UNISWAP_RECOVERY_RESULT, phase: 'completed', success: true,
    protocolProfile: 'OFFICIAL_UNISWAP_V3_V1', cleanup: { closedEvm: true },
    expectedInterruptionCode: 'UNISWAP_F_CONTROLLED_AFTER_DELIVERY', failedStage: 'native-delivered-0',
    actualAdmissionFailureCode: 'FLAT_ACCOUNT_OPERATION_FAILED',
    originalFailedAdmission: { action: 'execute', requestId: 'private_vault_graph', state: 'FAILED',
      sequence: 4, errorCode: 'FLAT_ACCOUNT_OPERATION_FAILED' },
    proofs: ['deposit_balance', 'deposit_intent', 'authorization', 'reservation', 'dependency', 'ready',
      'recovery', 'withdraw_balance', 'withdraw_balance', 'withdraw_balance'].map(relation => ({ relation,
      proofSHA256: '1'.repeat(64), publicInputsSHA256: '2'.repeat(64) })), nativeEffects: { evmVault: 1 },
    originalFRecovery: { actualFProofAccepted: true, ownersAbsentAtIssuance: true, repeatedRecoveryNoEffect: true,
      duplicateExecuteNoEffect: true, originalSwapNotResubmitted: true, swapAccountingUnchanged: true,
      originalRequestId: 'private_vault_graph', disposition: 'RECOVERED', publicInputCount: 41, admittedReceipts: 0,
      cutoff: '8200', publicInputCutoff: '8200', solverPayoutCommitmentIncluded: false },
    economics: { sourceDepositAtomic: '5000000', reservedAtomic: '1200', changeAtomic: '4998800', maximumInputAtomic: '2000',
      deliveredOutputAtomic: '1000', solverPayoutAtomic: '0', actualInputAtomic: '1004', solverBalanceBeforeDelivery: '20000000',
      solverBalanceAfterDelivery: '19998996', solverFinalBalance: '19998996', swapIrreversible: true, targetKeepsOriginalOutput: true },
    recoveryBalances: { source: { available: '5000000', reserved: '0', recovery: '1200', locked: '0' },
      target: { available: '1000', reserved: '0', recovery: '0', locked: '0' },
      sourceRefundAtomic: '1200', sourceChangeAtomic: '4998800', sourceTotalAvailableAtomic: '5000000' },
    originalPrivateExits: { sourceRefundAtomic: '1200', sourceChangeAtomic: '4998800', sourceTotalExitedAtomic: '5000000',
      targetOutputExitedAtomic: '1000', duplicateNoEffect: true },
    failureRecovery: { originalCutoff: '8200', ownerAbsentAtIssuance: true, originalFailurePreserved: true,
      sourceRefundAndChangeExited: '5000000', originalDeliveredOutputExited: '1000', solverUnderlyingLoss: '1004',
      solverPayoutIssued: false, nativeVaultEffects: 1, finalPools }, finalPools,
  };
  for (const field of ['localOnly', 'fakeFundsOnly', 'sourceUnchanged', 'sourceFundingConfirmed',
    'controlledPostDeliveryInterruption', 'expectedInterruptionPreserved', 'targetOwnerExitedBeforeDelivery',
    'partialDeliveryRecoveryAcceptance', 'privateUniswapTimeoutRecoveryAcceptance',
    'sourcePrivateReservationEstablished', 'privateOutputExitEstablished', 'duplicateNoEffect']) result[field] = true;
  for (const field of ['publicNetwork', 'privateUniswapGraphAcceptance', 'privateVaultGraphAcceptance',
    'keeperRestart', 'nodeRestart', 'systemicPrivacyAcceptance', 'independentOperators',
    'performanceTargetAchieved', 'fullWalletAcceptance']) result[field] = false;
  return result;
}

test('original Uniswap F metadata joins source refund/change, irreversible target EXIT and actual uncompensated solver loss', () => {
  const value = assertEvmUniswapRecoveryResult(recoveryFixture());
  assert.equal(value.actualFRecoveryAcceptance, true); assert.equal(value.happyPathTCompleted, false);
  assert.equal(value.solverPayoutIssued, false); assert.equal(value.fullWalletAcceptance, false);
});

test('Uniswap F rejects extra source credit, payout, renewed cutoff, omitted loss and a duplicate swap or T proof', () => {
  for (const mutate of [
    result => { result.recoveryBalances.source.available = '5001200'; },
    result => { result.economics.solverPayoutAtomic = '1200'; },
    result => { result.economics.solverFinalBalance = '20000000'; },
    result => { result.economics.actualInputAtomic = '0'; },
    result => { result.originalFRecovery.publicInputCutoff = '8201'; },
    result => { result.originalFRecovery.ownersAbsentAtIssuance = false; },
    result => { result.originalFRecovery.admittedReceipts = 1; },
    result => { result.originalFRecovery.solverPayoutCommitmentIncluded = true; },
    result => { result.nativeEffects.evmVault = 2; },
    result => { result.originalPrivateExits.targetOutputExitedAtomic = '0'; },
    result => { result.proofs[6].relation = 'settlement'; },
    result => { result.privateUniswapGraphAcceptance = true; },
  ]) { const result = recoveryFixture(); mutate(result); assert.throws(() => assertEvmUniswapRecoveryResult(result)); }
});


// Synthetic ports below run the same original current-head collector. No
// owner, delivery-facts brand, proof, EVM effect or protocol fixture is issued.
test('MetaMorpho F preserves original collected mint/market/position and target accounting while only the source reservation recovers', async () => {
  const head = { hash: h('7'), number: '0xa', parentHash: h('6'), transactions: [h('5')] };
  const reserveNullifier = h('8'), solverPayoutCommitment = h('9');
  const state = index => ({ head: { hash: head.hash.slice(2) }, ledger: {
    publicState: { backedAmount: index ? '1000000000000000000' : '5000000',
      actualAssetBalance: index ? '1000000000000000000' : '5000000', liveReservations: index ? 0 : 1 },
    commitments: [h(index ? 'b' : 'a')], nullifiers: [], roots: [h('c')] },
    poolObservation: { rawState: 'original-state', rawHistory: 'original-history', rawBacking: 'original-backing' },
    authorizationRoots: [h('d')], authorizationTree: { nodes: [h('e')] },
    state: { spentTagCount: '0', receiptCount: '0', stateSequence: '5', reservedTagCapacity: index ? '0' : '4', totalReservedTagCapacity: '4' }, receiptLeaves: [], spentTags: [], revokedEntries: [],
    checkpointCount: '1', checkpointTree: { nodes: [h('f')] }, evidenceHistory: {}, overflow: {}, capacity: { reservedByPool: ['4', '0'], totalReserved: '4' } });
  const views = [state(0), state(1)]; let reads = 0, canonicalChecks = 0, sends = 0;
  const runtime = { block: async () => clone(head), transactions: Array(20),
    assertCanonical: async value => { canonicalChecks++; assert.deepEqual(value, head); },
    balance: async (_holder, block) => { assert.equal(block, head.number); return 1000n; },
    nonce: async (_sender, at) => { assert.equal(at, 'latest'); return 7n; },
    send: () => { sends++; throw Error('NO_SEND'); } };
  owned.add(runtime);
  const readers = views.map(view => ({ read: async () => { reads++; return view; }, assertCurrent: async value => assert.equal(value, view) }));
  const morpho = { protocol: address('a'), marketId: h('b'), positionOwner: address('c'),
    market: { totalSupplyAssets: '1000000', totalSupplyShares: '1000000000000', totalBorrowAssets: '0',
      totalBorrowShares: '0', lastUpdate: '1000', fee: '0' },
    position: { supplyShares: '1000000000000', borrowShares: '0', collateral: '0' } };
  const vault = { observe: async () => ({ identity: { vault: address('c'), asset: address('d'), genesisHash: h('e') },
    snapshot: { blockHash: head.hash.slice(2), totalAssets: '1000000', totalShares: '1000000000000000000' },
    balances: { snapshot: { blockHash: head.hash.slice(2) }, senderAssets: '0', senderShares: '0', allowance: '0', usedNonce: '1' }, morpho }) };
  const assets = [0, 1].map(index => ({ metadata: { assetId: String(index + 1), decimals: index ? 18 : 6 },
    read: async ({ holder, blockNumber }) => { assert.equal(blockNumber, head.number);
      return { blockHash: head.hash, totalSupply: index ? '1000000000000000000' : '10000000',
        balance: holder === pool ? (index ? '1000000000000000000' : '5000000') : '0' }; } }));
  const args = { runtime, readers, vault, capabilities: assets, holders: [sender, recipient, pool], sender };
  const delivered = await readEvmVaultReplayState(args);
  // The source F ledger releases exactly four hub tags, exposed globally by
  // both views. Mint and target-local state do not change; block/nonce changes
  // remain outside the accounting invariant.
  views[0].ledger.nullifiers.push(reserveNullifier); views[0].ledger.publicState.liveReservations = 0;
  views[0].poolObservation.rawState = 'original-recovered-state';
  for (const view of views) { view.state.stateSequence = '6'; view.state.reservedTagCapacity = '0';
    view.state.totalReservedTagCapacity = '0'; view.capacity = { reservedByPool: ['0', '0'], totalReserved: '0' }; }
  const recovered = await readEvmVaultReplayState(args);
  const input = { delivered, recovered, reserveNullifier, solverPayoutCommitment };
  const value = assertOriginalMetaMorphoFAccountingV1(input);
  assert.equal(value.mintAccountingUnchanged, true); assert.equal(value.solverPayoutCommitmentIncluded, false);
  assert.equal(reads, 4); assert.equal(canonicalChecks, 2); assert.equal(sends, 0);
  for (const mutate of [
    x => { x.recovered.accounting.vault.totalAssets = '999999'; },
    x => { x.recovered.accounting.vault.totalShares = '0'; },
    x => { x.recovered.accounting.vault.morpho.market.lastUpdate = '1001'; },
    x => { x.recovered.accounting.vault.morpho.position.supplyShares = '0'; },
    x => { x.recovered.accounting.vault.morpho.position.borrowShares = '1'; },
    x => { x.recovered.accounting.vault.morpho.positionOwner = address('f'); },
    x => { x.recovered.accounting.tokens[1].totalSupply = '0'; },
    x => { x.recovered.accounting.pools[1].publicState.backedAmount = '0'; },
    x => { x.recovered.accounting.pools[0].hubState.receiptCount = '1'; },
    x => { x.recovered.accounting.pools[1].hubState.stateSequence = '5'; },
    x => { x.recovered.accounting.pools[1].hubState.stateSequence = '7'; },
    x => { x.recovered.accounting.pools[1].hubState.totalReservedTagCapacity = '4'; },
    x => { x.recovered.accounting.pools[1].hubState.reservedTagCapacity = '4'; },
    x => { x.recovered.accounting.pools[1].capacity.reservedByPool[1] = '4'; },
    x => { x.recovered.accounting.pools[1].capacity.totalReserved = '4'; },
    x => { x.recovered.accounting.pools[1].receiptLeaves.push(h('a')); },
    x => { x.recovered.accounting.pools[0].nullifiers = []; },
    x => { x.recovered.accounting.pools[0].commitments.push(solverPayoutCommitment); },
    x => { x.recovered.accounting.uniswap = {}; },
  ]) { const changed = clone(input); mutate(changed); assert.throws(() => assertOriginalMetaMorphoFAccountingV1(changed)); }
  views[1].head.hash = h('0').slice(2); await assert.rejects(readEvmVaultReplayState(args), /READ_HEAD/);
});

function metaMorphoRecoveryFixture() {
  const result = recoveryFixture();
  result.format = EVM_METAMORPHO_RECOVERY_RESULT_V1; result.protocolProfile = 'OFFICIAL_METAMORPHO_V1';
  result.expectedInterruptionCode = 'METAMORPHO_F_CONTROLLED_AFTER_DELIVERY';
  result.privateMetaMorphoTimeoutRecoveryAcceptance = true; result.privateUniswapTimeoutRecoveryAcceptance = false;
  result.privateAaveGraphAcceptance = false;
  delete result.originalFRecovery.originalSwapNotResubmitted; delete result.originalFRecovery.swapAccountingUnchanged;
  Object.assign(result.originalFRecovery, { originalMintNotResubmitted: true, mintAccountingUnchanged: true });
  result.metaMorphoFAccounting = { originalObserverFactsAccepted: true, receiptStatus: '0x1', receiptSHA256: '3'.repeat(64),
    D27ProofSHA256: result.proofs[1].proofSHA256, D27PublicInputsSHA256: result.proofs[1].publicInputsSHA256,
    mintAccountingUnchangedAfterF: true, mintAccountingUnchangedAfterExits: true,
    targetAccountingUnchangedAfterF: true, tokenAccountingUnchangedAfterF: true };
  result.economics = { sourceDepositAtomic: '5000000', reservedAtomic: '1200000', changeAtomic: '3800000',
    maximumInputAtomic: '1000000', actualInputAtomic: '1000000', deliveredOutputAtomic: '1000000000000000000',
    solverPayoutAtomic: '0', solverBalanceBeforeDelivery: '20000000', solverBalanceAfterDelivery: '19000000',
    solverFinalBalance: '19000000', mintIrreversible: true, targetKeepsOriginalOutput: true };
  result.recoveryBalances = { source: { available: '5000000', reserved: '0', recovery: '1200000', locked: '0' },
    target: { available: '1000000000000000000', reserved: '0', recovery: '0', locked: '0' },
    sourceRefundAtomic: '1200000', sourceChangeAtomic: '3800000', sourceTotalAvailableAtomic: '5000000' };
  result.originalPrivateExits = { sourceRefundAtomic: '1200000', sourceChangeAtomic: '3800000', sourceTotalExitedAtomic: '5000000',
    targetOutputExitedAtomic: '1000000000000000000', duplicateNoEffect: true };
  Object.assign(result.failureRecovery, { originalDeliveredOutputExited: '1000000000000000000', solverUnderlyingLoss: '1000000' });
  return result;
}

test('finite MetaMorpho F metadata requires one irreversible original mint, original F plus three W39, and no solver payout or substitute Uni profile', () => {
  assert.equal(METAMORPHO_F_REVIEWED_RELEASE_V1, 'SOURCE_REVIEWED_FIXED_LOCAL_METAMORPHO_F_V1');
  assert.doesNotThrow(() => assertMetaMorphoFReleaseV1());
  assert.throws(() => assertMetaMorphoFReleaseV1({ callerOption: true }));
  const value = assertEvmMetaMorphoRecoveryResultV1(metaMorphoRecoveryFixture());
  assert.equal(value.actualFRecoveryAcceptance, true); assert.equal(value.netSolverWealthLossEstablished, false);
  assert.equal(value.happyPathTCompleted, false); assert.equal(value.fullWalletAcceptance, false);
  assert.throws(() => assertEvmUniswapRecoveryResult(metaMorphoRecoveryFixture()));
  assert.throws(() => assertEvmMetaMorphoRecoveryResultV1(recoveryFixture()));
  for (const mutate of [
    x => { x.metaMorphoFAccounting.originalObserverFactsAccepted = false; },
    x => { x.metaMorphoFAccounting.receiptStatus = '0x0'; },
    x => { x.metaMorphoFAccounting.D27ProofSHA256 = '4'.repeat(64); },
    x => { x.metaMorphoFAccounting.mintAccountingUnchangedAfterExits = false; },
    x => { x.recoveryBalances.source.available = '6200000'; },
    x => { x.economics.solverPayoutAtomic = '1200000'; },
    x => { x.economics.solverFinalBalance = '20000000'; },
    x => { x.economics.actualInputAtomic = '1000001'; },
    x => { x.originalFRecovery.publicInputCutoff = '8201'; },
    x => { x.originalFRecovery.ownersAbsentAtIssuance = false; },
    x => { x.originalFRecovery.admittedReceipts = 1; },
    x => { x.originalFRecovery.solverPayoutCommitmentIncluded = true; },
    x => { x.nativeEffects.evmVault = 2; },
    x => { x.originalPrivateExits.targetOutputExitedAtomic = '0'; },
    x => { x.proofs[6].relation = 'settlement'; },
    x => { x.proofs.splice(6, 0, { relation: 'inclusion', proofSHA256: '1'.repeat(64), publicInputsSHA256: '2'.repeat(64) }); },
    x => { x.privateVaultGraphAcceptance = true; },
  ]) { const changed = metaMorphoRecoveryFixture(); mutate(changed); assert.throws(() => assertEvmMetaMorphoRecoveryResultV1(changed)); }
});
