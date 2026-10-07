/** Focused host/source checks only. Fake proof bytes and mock result records
 * certify neither proof acceptance nor funded/native execution. No nodes run. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CLAIM_GRAPH_PROFILE, CLAIM_GRAPH_PROOF_COUNTS, claimGraphProofPackets, validateClaimGraphResult }
  from './native-claim-graph-artifacts.mjs';
import { encodeFlatTransaction, FLAT_TRANSACTION_METHODS } from '../../../../../packages/backend/src/execution/encoding/transaction-codec.mjs';
import { encodeStatement } from '../../../../../packages/backend/src/execution/encoding/statements.mjs';
import { flatCompletionWindow } from '../../../../../packages/backend/src/execution/account/reconciliation/flat-completion-window.mjs';

const h = value => BigInt(value).toString(16).padStart(64, '0');
const packet = (relation, statement, bytes = 1) => ({ proof: 'ab'.repeat(32 * bytes),
  publicInputs: [...encodeStatement(relation, statement)] });
const health = { healthFrom: '120', healthUntil: '150', healthSignatures: [0, 1, 2].map(index => ({
  signerIndex: String(index), v: '27', r: '0x' + h(index + 1), s: '0x' + h(index + 2),
})) };
function calls() {
  const authorization = { domainCommitment: h(1), envelope: h(2) };
  const reservation = { ...authorization, inputRoot: h(3), inputNullifier: h(4), reserveCommitment: h(5),
    changeCommitment: h(6), admissionTag: h(7), fundingNotBefore: '100', fundingValidUntil: '1900' };
  const dependency = { domainCommitment: h(1), authorizationRoot: h(8), checkpoint: h(9),
    readinessEvidenceState: h(10), joinCommitment: h(11), readyFrom: '100', readyUntil: '7200' };
  const ready = { ...dependency, readinessCommitment: h(12) };
  const admission = { ...ready, acceptedCheckpointRoot: h(13), admissionRevocationState: h(14),
    receiptLeaf: h(15), admissionNullifier: h(16), admissionFrom: '105', admissionUntil: '405' };
  const common = { domainCommitment: h(1), authorizationRoot: h(8), evidenceState: h(17) };
  const nodes = [18, 19, 20, 21].map(value => ({ ...common, completionCommitment: h(value) }));
  const settlement = { ...common, poolRoot: h(22), reserveNullifier: h(23),
    outputs: [24, 25, 26, 27].map(h), terminalTags: [28, 29, 30, 31].map(h),
    completionCommitments: nodes.map(node => node.completionCommitment), validFrom: '120', validUntil: '405' };
  return [
    ['reserveGenericGuarded', { authorization: packet('authorization', authorization),
      reservation: packet('reservation', reservation, 2), expectedSequence: '2', expectedPostRoot: '0x' + h(32) },
    ['authorization', 'reservation']],
    ['admit', { pool: '0x' + '12'.repeat(20), dependency: packet('dependency', dependency, 2),
      readiness: packet('ready', ready), admission: packet('admission', admission, 3), ...health },
    ['dependency', 'ready', 'admission']],
    ['fulfillGeneric', { settlement: packet('settlement', settlement, 2),
      completions: nodes.map((node, index) => packet('node', node, index + 1)), ...health },
    ['settlement', 'node', 'node', 'node', 'node']],
  ];
}

function completeResult() {
  const acceptance = Object.fromEntries(['requestedNativeAssetsIssued', 'ownerOfflineIssue', 'originalNotesCreditedOnce',
    'controllerRestartNoResend', 'coherentPrivateAccount', 'requestedNativeRedemptions',
    'expiredOriginalSourceRefund', 'allClaimLiabilitiesClosed', 'keeperProcessRestart', 'keeperCrashRecovery',
    'durableApiAdmissions', 'durableApiRedemptionDuplicateNoEffect', 'nonceBootstrapFinalized',
    'nonceInfrastructureExcluded', 'noncePayoutObserved', 'nonceAdvanceBoundToOriginal'].map(key => [key, true]));
  Object.assign(acceptance, { twoNativeAssetsIssued: false, recipientNativeRedemptions: false });
  return { profile: CLAIM_GRAPH_PROFILE, phase: 'completed', success: true, selectedAssets: [1], acceptance,
    fundedGraphAttestationPreflight: { checkpoint: true, health: true, issuedClaimAmount: '3000000',
      beforeGraphProofs: true, custodyTransfers: 1, graphTransfers: 0, originalFinalizedDepositOnly: true,
      noCheckpointTransactionSubmitted: true },
    graphAttestationPreflight: { checkpoint: true, health: true, beforeAnyOwnerOrProof: true,
      custodyTransfers: 0, graphTransfers: 0, noCheckpointTransactionSubmitted: true },
    ownerStops: [{ assetIndex: 1, phase: 'after-reservation-before-graph-native',
      ownerAbsent: true, noNativeGraphEffectYet: true, at: '2026-10-05T04:00:00.000Z' }],
    claimFundedGraph: { originalPrivateSource: '3000000', ownerChange: '1800000', solverPayout: '1200000',
      nativeDelivery: '1000000', ownerOfflineSettlement: true, ownerStoppedBeforeNative: true, custodyPrincipalUnchangedDuringGraph: true,
      wrapperSupplyAndPoolBackingConserved: true, duplicateAndRestartNoNewEffect: true,
      fourCompletionSlotsConsumed: true, solverPayoutExited: true, solverNativeRedemptionDischarged: true,
      originalCutoff: '7300', timeoutRecoveryThisRun: false, finalPoolBacking: '0', finalPoolAssetBalance: '0',
      fullWalletAcceptance: false },
    expiredDepositRefund: { amount: '2000000', originalCutoff: '8000', ownerAbsent: true,
      originalTicketDischarged: true, duplicateHadNoEffect: true },
    redemptions: [{ assetIndex: 1, amount: '1800000', status: 'DISCHARGED', duplicateHadNoEffect: true },
      { assetIndex: 1, amount: '1200000', role: 'solver', status: 'DISCHARGED', duplicateHadNoEffect: true }],
    nativeEffects: { bitcoin: 0, solana: 5, eachBroadcastOnce: true },
    finalClaimState: Array.from({ length: 2 }, () => ({ wrapperSupply: '0', pendingRedemptions: '0',
      pendingRefunds: '0', heldUnissued: '0', reservedFees: '0' })),
    cleanup: { closedEvm: true, closedBitcoin: true, closedSolana: true, closedController: true, closedKeeper: true,
      application: { closed: true, keeper: { exitObserved: true }, errors: [] },
      owners: Array.from({ length: 3 }, () => ({ closed: true })),
      resources: Array.from({ length: 2 }, () => ({ closed: true })),
      operators: Array.from({ length: 4 }, () => ({ closed: true })) },
    localOnly: true, fakeFundsOnly: true, publicNetwork: false, nativeSelfCustody: false,
    independentOperators: false, nativeNodeRestart: false, operatorKeyRestart: false, fullHostRestart: false,
    systemicPrivacyAcceptance: false, fullWalletAcceptance: false };
}

test('fixed graph profile requires the 3m claim split, both burns, refund, and complete cleanup', () => {
  assert.equal(validateClaimGraphResult(completeResult()), true);
  assert.equal(Object.values(CLAIM_GRAPH_PROOF_COUNTS).reduce((sum, count) => sum + count, 0), 19);
  assert.equal(CLAIM_GRAPH_PROOF_COUNTS.node, 4);
});

test('missing acceptance, unsplit redemptions, leftover liabilities and incomplete resource cleanup fail', () => {
  for (const change of [
    row => { delete row.acceptance.expiredOriginalSourceRefund; },
    row => { row.acceptance.expiredOriginalSourceRefund = false; },
    row => { row.claimFundedGraph.ownerChange = '2000000'; },
    row => { row.claimFundedGraph.solverPayout = '1000000'; },
    row => { row.claimFundedGraph.nativeDelivery = '1200000'; },
    row => { delete row.claimFundedGraph.ownerStoppedBeforeNative; },
    row => { row.claimFundedGraph.ownerStoppedBeforeNative = false; },
    row => { delete row.ownerStops; },
    row => { row.ownerStops[0].noNativeGraphEffectYet = false; },
    row => { row.ownerStops.push({ ...row.ownerStops[0] }); },
    row => { row.redemptions[0].amount = '3000000'; },
    row => { row.redemptions.pop(); },
    row => { row.expiredDepositRefund.duplicateHadNoEffect = false; },
    row => { row.finalClaimState[1].reservedFees = '5000'; },
    row => { row.claimFundedGraph.finalPoolBacking = '1200000'; },
    row => { row.nativeEffects.solana = 3; },
    row => { row.cleanup.resources[1].closed = false; },
    row => { row.cleanup.owners.pop(); },
    row => { row.cleanup.application.keeper.exitObserved = false; },
    row => { row.cleanup.closedController = false; },
    row => { delete row.fundedGraphAttestationPreflight; },
    row => { row.fundedGraphAttestationPreflight.graphTransfers = 1; },
    row => { row.graphAttestationPreflight.custodyTransfers = 1; },
    row => { row.fullWalletAcceptance = true; },
  ]) {
    const changed = completeResult(); change(changed);
    assert.throws(() => validateClaimGraphResult(changed));
  }
});

test('all ten graph proof packets are found in exact canonical U/S, P/R/I and T/N calls', () => {
  let count = 0;
  for (const [name, request, relations] of calls()) {
    const calldata = encodeFlatTransaction(name, request), decoded = claimGraphProofPackets(calldata);
    assert.equal(decoded.name, name); assert.deepEqual(decoded.packets.map(row => row.relation), relations);
    const packets = name === 'reserveGenericGuarded' ? [request.authorization, request.reservation]
      : name === 'admit' ? [request.dependency, request.readiness, request.admission]
        : [request.settlement, ...request.completions];
    assert.deepEqual(decoded.packets.map(({ relation: _relation, ...value }) => value), packets);
    count += decoded.packets.length;
  }
  assert.equal(count, 10);
});

test('graph packet matching rejects extra bytes, missing words, rebound offsets and unknown methods', () => {
  for (const [name, request] of calls()) {
    const calldata = encodeFlatTransaction(name, request);
    assert.throws(() => claimGraphProofPackets(calldata + '00'.repeat(32)));
    assert.throws(() => claimGraphProofPackets(calldata.slice(0, -64)));
    const pointer = name === 'admit' ? 10 + 64 : 10;
    assert.throws(() => claimGraphProofPackets(calldata.slice(0, pointer) + h(1) + calldata.slice(pointer + 64)));
  }
  assert.throws(() => claimGraphProofPackets('0x' + FLAT_TRANSACTION_METHODS.withdrawBalance.selector + '00'.repeat(64)),
    /CLAIM_GRAPH_METHOD/);
});

test('long owner cutoff does not extend the 300-second admitted certificate window', () => {
  const original = { timestamp: '110', settleBefore: '7300', receipts: [{ validFrom: '105', validUntil: '405' }] };
  assert.deepEqual(flatCompletionWindow(original), { validFrom: '110', validUntil: '405' });
  assert.equal(original.receipts[0].validUntil, '405'); assert.equal(original.settleBefore, '7300');
  assert.throws(() => flatCompletionWindow({ ...original, timestamp: '405' }), /WINDOW_EXPIRED/);
  assert.throws(() => flatCompletionWindow({ ...original, timestamp: '104' }), /WINDOW_INVALID/);
});

test('claim profile wires the native graph capability and retains a caller-bound change exit', () => {
  const source = name => readFileSync(new URL(name, import.meta.url), 'utf8');
  const flow = source('./native-claim-flow.mjs'), graph = source('./native-claim-graph-case.mjs');
  const preparation = source('./prepare-native-claim-graph.mjs');
  assert.match(flow, /nativeExecution:\s*graphProfile && index === 1 \? graphExecution : null/);
  assert.match(graph, /registerGraph\(/); assert.match(graph, /kind:\s*'GRAPH'/);
  assert.match(flow, /const exitRole = graphProfile \? 'change' : 'source'/);
  assert.match(flow, /const exitAmount = graphProfile \? CLAIM_GRAPH_AMOUNTS.change/);
  assert.match(preparation, /changeRecipient:\s*bare\(runtime.accounts\[poolIndex \+ 3\]\)/);
  assert.match(preparation, /recoveryRecipient:\s*bare\(runtime.accounts\[poolIndex \+ 3\]\)/);
  assert.match(flow, /if \(!loadedFactsProfile && \(!durableApiProfile \|\| graphProfile\)\)/);
  assert.match(graph, /caller:\s*runtime.accounts\[1\], amount:\s*CLAIM_GRAPH_AMOUNTS.payout/);
});
