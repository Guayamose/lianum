/** Import-safe checks for retained claim-funded graph evidence. These pure
 * checks do not verify a proof, query a chain, or establish native finality. */
import assert from 'node:assert/strict';
import { encodeFlatTransaction, FLAT_TRANSACTION_METHODS } from '../../../../../packages/backend/src/execution/encoding/transaction-codec.mjs';
import { decodeFlatTerminalCalldata } from '../../../../../packages/backend/src/execution/account/reconciliation/flat-terminal-observer.mjs';

export const CLAIM_GRAPH_PROFILE = 'SOLANA_PRIVATE_CLAIM_FUNDED_GRAPH';
export const CLAIM_GRAPH_PROOF_COUNTS = Object.freeze({ deposit_intent: 2, native_claim_ingress: 2,
  native_claim_discharge: 3, withdraw_balance: 2, authorization: 1, reservation: 1,
  dependency: 1, ready: 1, admission: 1, node: 4, settlement: 1 });

/** Canonical graph calldata, with every public proof packet exposed for exact
 * matching to the files retained by the acceptance run. Unknown selectors fail. */
export function claimGraphProofPackets(calldata) {
  assert.ok(typeof calldata === 'string' && /^0x(?:[0-9a-f]{2})+$/.test(calldata)
    && calldata.length <= 2 * 1024 * 1024, 'CLAIM_GRAPH_CALLDATA');
  const name = ['reserveGenericGuarded', 'admit', 'fulfillGeneric']
    .find(name => FLAT_TRANSACTION_METHODS[name].selector === calldata.slice(2, 10));
  assert.ok(name, 'CLAIM_GRAPH_METHOD');
  const body = calldata.slice(10), entries = [];
  const word = at => {
    assert.ok(Number.isSafeInteger(at) && at >= 0 && at % 32 === 0 && (at + 32) * 2 <= body.length,
      'CLAIM_GRAPH_ABI_BOUNDS');
    return body.slice(at * 2, (at + 32) * 2);
  };
  const offset = at => { const value = BigInt('0x' + word(at));
    assert.ok(value < 1024n * 1024n && value % 32n === 0n, 'CLAIM_GRAPH_ABI_OFFSET'); return Number(value); };
  const packet = at => {
    const proofAt = at + offset(at), inputsAt = at + offset(at + 32);
    const size = BigInt('0x' + word(proofAt)), count = BigInt('0x' + word(inputsAt));
    assert.ok(size > 0n && size < 1024n * 1024n && size % 32n === 0n
      && count > 0n && count <= 138n && (proofAt + 32 + Number(size)) * 2 <= body.length,
    'CLAIM_GRAPH_PROOF_BOUNDS');
    return { proof: body.slice((proofAt + 32) * 2, (proofAt + 32 + Number(size)) * 2),
      publicInputs: Array.from({ length: Number(count) }, (_, i) => BigInt('0x' + word(inputsAt + 32 + i * 32)).toString()) };
  };
  const add = (relation, value) => { entries.push({ relation, ...value }); return value; };
  let request;
  if (name === 'reserveGenericGuarded') {
    request = { authorization: add('authorization', packet(offset(0))),
      reservation: add('reservation', packet(offset(32))),
      expectedSequence: BigInt('0x' + word(64)).toString(), expectedPostRoot: '0x' + word(96) };
  } else if (name === 'admit') {
    request = { pool: '0x' + word(0).slice(24), dependency: add('dependency', packet(offset(32))),
      readiness: add('ready', packet(offset(64))), admission: add('admission', packet(offset(96))),
      healthFrom: BigInt('0x' + word(128)).toString(), healthUntil: BigInt('0x' + word(160)).toString(),
      healthSignatures: Array.from({ length: 3 }, (_, i) => ({
        signerIndex: BigInt('0x' + word(192 + i * 128)).toString(),
        v: BigInt('0x' + word(224 + i * 128)).toString(),
        r: '0x' + word(256 + i * 128), s: '0x' + word(288 + i * 128),
      })) };
  } else {
    const decoded = decodeFlatTerminalCalldata(calldata);
    request = decoded.request;
    add('settlement', request.settlement); request.completions.forEach(value => add('node', value));
  }
  assert.equal(encodeFlatTransaction(name, request), calldata, 'CLAIM_GRAPH_NONCANONICAL_CALLDATA');
  return { name, packets: entries };
}

export function validateClaimGraphResult(result) {
  return validateGraphResult(result, CLAIM_GRAPH_PROFILE);
}
export function validateClaimGraphV3CommonResult(result) {
  return validateGraphResult(result, 'SOLANA_PRIVATE_CLAIM_FUNDED_GRAPH_INGRESS_V3');
}
function validateGraphResult(result, profile) {
  assert.equal(result.profile, profile);
  assert.equal(result.success, true); assert.equal(result.phase, 'completed');
  assert.deepEqual(result.selectedAssets, [1]);
  assert.deepEqual(result.graphAttestationPreflight, { checkpoint: true, health: true,
    beforeAnyOwnerOrProof: true, custodyTransfers: 0, graphTransfers: 0,
    noCheckpointTransactionSubmitted: true });
  assert.deepEqual(result.fundedGraphAttestationPreflight, { checkpoint: true, health: true,
    issuedClaimAmount: '3000000', beforeGraphProofs: true, custodyTransfers: 1, graphTransfers: 0,
    originalFinalizedDepositOnly: true, noCheckpointTransactionSubmitted: true });
  const report = result.claimFundedGraph;
  for (const [key, value] of Object.entries({ originalPrivateSource: '3000000', ownerChange: '1800000',
    solverPayout: '1200000', nativeDelivery: '1000000' })) assert.equal(report[key], value, 'CLAIM_GRAPH_' + key);
  assert.equal(BigInt(report.ownerChange) + BigInt(report.solverPayout), BigInt(report.originalPrivateSource));
  for (const key of ['ownerOfflineSettlement', 'ownerStoppedBeforeNative', 'custodyPrincipalUnchangedDuringGraph',
    'wrapperSupplyAndPoolBackingConserved', 'duplicateAndRestartNoNewEffect', 'fourCompletionSlotsConsumed',
    'solverPayoutExited', 'solverNativeRedemptionDischarged']) assert.equal(report[key], true, 'CLAIM_GRAPH_' + key);
  assert.equal(report.timeoutRecoveryThisRun, false); assert.equal(report.fullWalletAcceptance, false);
  assert.equal(report.finalPoolBacking, '0'); assert.equal(report.finalPoolAssetBalance, '0');
  assert.ok(Array.isArray(result.ownerStops), 'CLAIM_GRAPH_OWNER_STOP_EVIDENCE');
  const stops = result.ownerStops.filter(row => row.phase === 'after-reservation-before-graph-native');
  assert.equal(stops.length, 1, 'CLAIM_GRAPH_OWNER_STOP_EVIDENCE');
  assert.equal(stops[0].assetIndex, 1); assert.equal(stops[0].ownerAbsent, true);
  assert.equal(stops[0].noNativeGraphEffectYet, true, 'CLAIM_GRAPH_STOP_BEFORE_NATIVE');
  assert.ok(typeof report.originalCutoff === 'string' && /^(0|[1-9][0-9]*)$/.test(report.originalCutoff)
    && BigInt(report.originalCutoff) > 0n, 'CLAIM_GRAPH_CUTOFF');
  for (const flag of ['requestedNativeAssetsIssued', 'ownerOfflineIssue', 'originalNotesCreditedOnce',
    'controllerRestartNoResend', 'coherentPrivateAccount', 'requestedNativeRedemptions',
    'expiredOriginalSourceRefund', 'allClaimLiabilitiesClosed', 'keeperProcessRestart',
    'keeperCrashRecovery', 'durableApiAdmissions', 'durableApiRedemptionDuplicateNoEffect',
    'nonceBootstrapFinalized', 'nonceInfrastructureExcluded', 'noncePayoutObserved', 'nonceAdvanceBoundToOriginal'])
    assert.equal(result.acceptance[flag], true, 'CLAIM_GRAPH_REQUIRED_ACCEPTANCE_' + flag);
  for (const flag of ['twoNativeAssetsIssued', 'recipientNativeRedemptions']) assert.equal(result.acceptance[flag], false);
  assert.deepEqual(result.redemptions.map(row => [row.assetIndex, row.amount, row.status, row.duplicateHadNoEffect]),
    [[1, '1800000', 'DISCHARGED', true], [1, '1200000', 'DISCHARGED', true]]);
  assert.equal(result.redemptions[1].role, 'solver');
  assert.equal(result.expiredDepositRefund.amount, '2000000');
  for (const key of ['ownerAbsent', 'originalTicketDischarged', 'duplicateHadNoEffect'])
    assert.equal(result.expiredDepositRefund[key], true, 'CLAIM_GRAPH_REFUND_' + key);
  assert.deepEqual(result.nativeEffects, { bitcoin: 0, solana: 5, eachBroadcastOnce: true });
  assert.equal(result.finalClaimState.length, 2);
  for (const state of result.finalClaimState)
    for (const field of ['wrapperSupply', 'pendingRedemptions', 'pendingRefunds', 'heldUnissued', 'reservedFees'])
      assert.equal(state[field], '0', 'CLAIM_GRAPH_FINAL_' + field);
  for (const key of ['closedEvm', 'closedBitcoin', 'closedSolana']) assert.equal(result.cleanup[key], true);
  assert.equal(result.cleanup.closedController, true); assert.equal(result.cleanup.closedKeeper, true);
  assert.equal(result.cleanup.application.closed, true);
  assert.equal(result.cleanup.application.keeper.exitObserved, true);
  assert.deepEqual(result.cleanup.application.errors, []);
  for (const [key, count] of [['owners', 3], ['resources', 2], ['operators', 4]]) {
    assert.ok(Array.isArray(result.cleanup[key]) && result.cleanup[key].length === count, 'CLAIM_GRAPH_CLEANUP_' + key);
    assert.ok(result.cleanup[key].every(row => row.closed === true), 'CLAIM_GRAPH_CLEANUP_' + key);
  }
  for (const key of ['localOnly', 'fakeFundsOnly']) assert.equal(result[key], true);
  for (const key of ['publicNetwork', 'nativeSelfCustody', 'independentOperators', 'nativeNodeRestart',
    'operatorKeyRestart', 'fullHostRestart', 'systemicPrivacyAcceptance', 'fullWalletAcceptance']) assert.equal(result[key], false);
  return true;
}
