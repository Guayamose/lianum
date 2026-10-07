import { CLAIM_GRAPH_V3_PROFILE, CLAIM_GRAPH_V3_PROOF_COUNTS, validateClaimGraphV3Result } from './native-claim-graph-v3-policy.mjs';
import { checkClaimGraphV3Bootstrap, checkClaimGraphV3Transfers } from './native-claim-graph-v3-nonce-checks.mjs';
import { assertClaimGraphPayoutReplay } from './native-claim-graph-terminal-checks.mjs';
import { assertNonceIngressDeployment } from '../wallet-platform/modules/native-claims/ingress-v3-host.mjs';
import { validateClaimConfig } from '../wallet-platform/modules/native-claims/framing.mjs';
import { NATIVE_INGRESS_V3_LOCAL, NATIVE_INGRESS_V3_RELATION, NATIVE_INGRESS_V3_SOURCE_VERSION,
  NATIVE_INGRESS_V3_KEY_SHA256, NATIVE_INGRESS_V3_PROFILE } from '../proof-workers/native-ingress-v3-profile.mjs';
/** Read-only check of a completed retained fixture. This does not run a node,
 * reprove a relation, establish public-chain consensus or perform an audit. */
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { ROOT } from '../proof-workers/catalog.mjs';
import { publicKeccak256 } from '../../../omnichain-product/src/private-cohort-public-native.mjs';
import { decodeWalletPoolInputs } from '../../../omnichain-product/src/private-wallet-note-encoding.mjs';
import { NATIVE_CLAIM_CONTRACT_PIN } from '../wallet-platform/modules/ops/native-claim-artifacts.mjs';
import { decodeClaimIngressInputs, decodeClaimDischargeInputs } from '../wallet-platform/modules/native-claims/framing.mjs';
import { validateSolanaBindingTransaction } from '../wallet-platform/modules/chain-adapters/native-receipt-binding.mjs';
import { validateSolanaNonceBindingTransaction,
  validateSolanaNonceBootstrapTransaction } from '../wallet-platform/modules/chain-adapters/owned-solana-nonce-binding.mjs';
import { auditOwnedSolanaNonceInfrastructure, ownedCustodyFeeAudit } from '../wallet-platform/modules/chain-adapters/owned-native-custody.mjs';
import { FLAT_TRANSACTION_METHODS } from '../wallet-platform/modules/paeg/transaction-codec.mjs';
import { decodeStatement } from '../wallet-platform/modules/paeg/statements.mjs';
import { CLAIM_GRAPH_PROFILE, CLAIM_GRAPH_PROOF_COUNTS, claimGraphProofPackets, validateClaimGraphResult }
  from './native-claim-graph-artifacts.mjs';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const json = path => JSON.parse(readFileSync(path));
const runId = process.argv[2];
assert.equal(process.argv.length, 3);
assert.match(runId, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
const locations = ['.local/native-claim-flow', '.local/native-claim-graph-flow', '.local/native-claim-graph-v3-flow']
  .map(local => join(ROOT, local, 'attempt-' + runId)).filter(directory => existsSync(join(directory, 'result.json')));
assert.equal(locations.length, 1, 'NATIVE_CLAIM_EXACT_RETAINED_ATTEMPT');
const directory = locations[0];
const resultPath = join(directory, 'result.json'), resourcesPath = join(directory, 'resources.json');
const result = json(resultPath), resources = json(resourcesPath);
const priorPartial = runId === 'de8fa0c0-4cda-4396-bc80-775c27fe91c4';
const durablePartial = runId === 'b103f2c3-1210-4d04-aac4-67c0a4c39b5e';
const partial = priorPartial || durablePartial;
const solanaContinuation = result.profile === 'SOLANA_REDEMPTION_AND_REFUND';
const ingressV3Profile = result.profile === CLAIM_GRAPH_V3_PROFILE;
const ingressRelation = ingressV3Profile ? NATIVE_INGRESS_V3_RELATION : 'native_claim_ingress';
const graphProfile = ingressV3Profile || result.profile === CLAIM_GRAPH_PROFILE;
const nonceProfile = graphProfile || result.profile === 'SOLANA_NONCE_DURABLE_API_RESTART';
const durableApiProfile = nonceProfile || result.profile === 'SOLANA_DURABLE_API_RESTART';
const solanaOnly = solanaContinuation || durableApiProfile;
assert.equal(result.runId, runId);
if (priorPartial) {
  assert.equal(result.success, false); assert.equal(result.phase, 'failed');
  assert.equal(result.errorCode, 'CLAIM_KEEPER_CLOSED_OR_UNCERTAIN');
  for (const flag of ['twoNativeAssetsIssued', 'ownerOfflineIssue', 'originalNotesCreditedOnce',
    'controllerRestartNoResend', 'coherentPrivateAccount']) assert.equal(result.acceptance[flag], true);
} else if (durablePartial) {
  assert.equal(durableApiProfile, true); assert.equal(result.success, false); assert.equal(result.phase, 'failed');
  assert.equal(result.errorCode, 'NATIVE_CLAIM_OPERATION_FAILED');
  const completed = ['requestedNativeAssetsIssued', 'ownerOfflineIssue', 'originalNotesCreditedOnce',
    'controllerRestartNoResend', 'coherentPrivateAccount', 'keeperProcessRestart', 'keeperCrashRecovery', 'durableApiAdmissions'];
  const incomplete = ['twoNativeAssetsIssued', 'recipientNativeRedemptions', 'requestedNativeRedemptions',
    'expiredOriginalSourceRefund', 'allClaimLiabilitiesClosed', 'durableApiRedemptionDuplicateNoEffect'];
  assert.deepEqual(result.acceptance, Object.fromEntries([
    ...completed.map(flag => [flag, true]), ...incomplete.map(flag => [flag, false]),
  ]));
  for (const flag of ['closedEvm', 'closedBitcoin', 'closedSolana']) assert.equal(result.cleanup[flag], true);
  const pins = readFileSync(join(directory, 'source-pins.json'));
  assert.equal(sha(pins), resources.sourcePinsSHA256);
  assert.deepEqual(JSON.parse(pins), result.sourcePins); assert.deepEqual(resources.sourcePins, result.sourcePins);
} else {
  assert.equal(result.success, true); assert.equal(result.phase, 'completed');
  for (const [flag, value] of Object.entries(result.acceptance)) {
    const skipped = solanaOnly && ['twoNativeAssetsIssued', 'recipientNativeRedemptions'].includes(flag)
      || durableApiProfile && !graphProfile && flag === 'expiredOriginalSourceRefund';
    assert.equal(value, !skipped, 'PROFILE_SCOPED_ACCEPTANCE_' + flag);
  }
}
if (graphProfile) {
  (ingressV3Profile ? validateClaimGraphV3Result : validateClaimGraphResult)(result);
  const pins = readFileSync(join(directory, 'source-pins.json'));
  assert.equal(sha(pins), resources.sourcePinsSHA256);
  assert.deepEqual(JSON.parse(pins), result.sourcePins); assert.deepEqual(resources.sourcePins, result.sourcePins);
}
if (durableApiProfile) {
  assert.deepEqual(result.selectedAssets, [1]); assert.equal(result.keeperRestart, true);
  for (const field of ['nativeNodeRestart', 'operatorKeyRestart', 'fullHostRestart']) assert.equal(result[field], false);
  assert.equal(result.keeperRestarts.length, 2);
  assert.deepEqual(result.keeperRestarts.map(row => row.phase), ['before-issue-clean-restart', 'after-issue-idle-sigkill']);
  for (const row of result.keeperRestarts) {
    assert.ok(Number.isSafeInteger(row.previousPID) && row.previousPID > 1);
    assert.ok(Number.isSafeInteger(row.processId) && row.processId > 1);
    assert.notEqual(row.previousPID, row.processId); assert.equal(row.storageOpenedFromDisk, true); assert.equal(row.originalsReconciled, true);
  }
  assert.equal(result.keeperRestarts[0].processId, result.keeperRestarts[1].previousPID);
  assert.equal(result.keeperRestarts[1].duplicateHadNoEffect, true);
  assert.ok(result.claimApiRequests.every(row => row.admitted === true && ['deposit', 'restart', 'redeem', 'resume'].includes(row.action)));
  const deposits = result.claimApiRequests.filter(row => row.action === 'deposit');
  assert.equal(deposits.length, 2); assert.deepEqual(deposits.map(row => row.duplicate), [false, true]);
  assert.ok(deposits.every(row => row.requestId === 'original_sol_deposit' && row.state === 'CONFIRMED'));
  const restarts = result.claimApiRequests.filter(row => row.action === 'restart');
  assert.equal(restarts.length, 1); assert.equal(restarts[0].state, 'CONFIRMED');
  const redemptions = result.claimApiRequests.filter(row => row.action === 'redeem');
  assert.equal(redemptions.length, durablePartial ? 1 : 2);
  assert.deepEqual(redemptions.map(row => row.duplicate), durablePartial ? [false] : [false, true]);
  assert.ok(redemptions.every(row => row.requestId === 'original_sol_redemption'));
  if (durablePartial) {
    assert.equal(redemptions[0].state, 'RECONCILIATION_REQUIRED');
    assert.equal(redemptions[0].errorCode, 'NATIVE_CLAIM_OPERATION_FAILED');
    assert.deepEqual(result.claimApiRequests.map(row => row.action), ['deposit', 'restart', 'deposit', 'redeem']);
  } else assert.equal(redemptions[1].state, 'CONFIRMED');
  const owner = json(join(directory, durablePartial ? 'private-audit/durable-native-owner-after-issue.json'
    : 'private-audit/durable-native-owner-after-redemption.json'));
  assert.equal(owner.deposits.length, 1); assert.equal(owner.deposits[0].status, 'ISSUED'); assert.ok(owner.deposits[0].submission);
  assert.equal(owner.tickets.length, durablePartial ? 0 : 1);
  if (!durablePartial) assert.equal(owner.tickets[0].status, 'DISCHARGED');
  assert.ok(owner.requests.every(row => row.state === 'CONFIRMED'));
}
assert.equal(result.privatePortfolio.coherent, true);
assert.deepEqual(result.privatePortfolio.custodyObservations, ['CURRENT_QUORUM', 'CURRENT_QUORUM']);
assert.equal(resources.sourceClosureUnchanged, true); assert.equal(resources.ownedGroupCleanupConfirmed, true);
assert.equal(resources.workerResult.sha256, sha(readFileSync(resultPath)));
const evm = json(join(directory, 'private-audit/evm.json'));
const compiledBytes = readFileSync(join(ROOT, '.local/native-claims-contracts', NATIVE_CLAIM_CONTRACT_PIN.runId, 'compiled.json'));
assert.equal(sha(compiledBytes), NATIVE_CLAIM_CONTRACT_PIN.compiledSHA256);
const gateway = JSON.parse(compiledBytes).contracts['native-claims/NativeClaimGateway.sol'].NativeClaimGateway;
const deployments = label => evm.receipts.filter(row => row.label === label).map(row => {
  assert.equal(row.receipt.status, '0x1'); return row.receipt.contractAddress.toLowerCase();
});
const gateways = deployments('deploy native claim NativeClaimGateway');
const tokens = deployments('deploy native claim NativeClaimToken');
const pools = deployments('deploy flat PrivateFlatAssetNotePool.sol:PrivateFlatAssetNotePool');
const hubs = deployments('deploy flat PrivateFlatReceiptHub.sol:PrivateFlatReceiptHub');
assert.equal(gateways.length, 2); assert.equal(tokens.length, 2); assert.equal(pools.length, 2);
if (graphProfile) assert.equal(hubs.length, 1);
const proofs = result.proofs.map(row => {
  const bytes = readFileSync(join(directory, 'public-proofs', row.file + '.bin'));
  const inputBytes = readFileSync(join(directory, 'public-proofs', row.file + '.inputs.json'));
  assert.equal(sha(bytes), row.proofSHA256); assert.equal(sha(inputBytes), row.publicInputsSHA256);
  return { ...row, bytes: bytes.toString('hex'), inputs: JSON.parse(inputBytes).map(value => BigInt(value).toString(16).padStart(64, '0')), matches: 0 };
});
const word = (hex, at) => {
  assert.ok(Number.isSafeInteger(at) && at >= 0 && at + 64 <= hex.length && at % 64 === 0);
  return BigInt('0x' + hex.slice(at, at + 64));
};
const offset = (hex, at) => {
  const value = word(hex, at); assert.ok(value < 2n ** 24n && value % 32n === 0n); return Number(value) * 2;
};
function packet(hex, base) {
  const proofStart = base + offset(hex, base), inputStart = base + offset(hex, base + 64);
  const size = Number(word(hex, proofStart)), count = Number(word(hex, inputStart));
  assert.ok(size > 0 && size < 1024 * 1024 && count > 0 && count <= 138);
  assert.ok(proofStart + 64 + size * 2 <= hex.length && inputStart + 64 + count * 64 <= hex.length);
  return { bytes: hex.slice(proofStart + 64, proofStart + 64 + size * 2),
    inputs: Array.from({ length: count }, (_, i) => hex.slice(inputStart + 64 + i * 64, inputStart + 128 + i * 64)) };
}
function matchPacket(value, relation) {
  const matches = proofs.filter(row => row.relation === relation && row.bytes === value.bytes
    && JSON.stringify(row.inputs) === JSON.stringify(value.inputs));
  assert.equal(matches.length, 1, 'ONE_RETAINED_PROOF_MATCH'); matches[0].matches++;
}
const selector = name => {
  const entries = Object.entries(gateway.evm.methodIdentifiers).filter(([signature]) => signature.startsWith(name + '('));
  assert.equal(entries.length, 1); return entries[0][1];
};
const methods = new Map(['preposition', 'issue', 'voidDeposit', 'discharge'].map(name => [selector(name), name]));
const withdrawSelector = publicKeccak256(Buffer.from('withdrawBalance(bytes,bytes32[])')).subarray(0, 4).toString('hex');
const calls = { preposition: 0, issue: 0, voidDeposit: 0, discharge: 0, withdrawBalance: 0 };
const graphCalls = { reserveGenericGuarded: 0, admit: 0, fulfillGeneric: 0 };
const gatewayCalls = Object.fromEntries(['preposition', 'issue', 'voidDeposit', 'discharge'].map(name => [name, [0, 0]]));
let graphReplayCount = 0;
for (const row of evm.receipts) {
  if (graphProfile && row.label === 'reject-claim-graph-solver-exit-replay') {
    assert.equal(row.receipt.status, '0x0');
    if (ingressV3Profile) {
      const evidence = json(join(directory, 'private-audit/solver-payout-replay.json'));
      assert.equal(evidence.receipt.transactionHash, row.transactionHash);
      assert.deepEqual(evidence.receipt, row.receipt);
      assert.equal(evidence.actualReason, row.revert?.reason ?? null);
      assert.deepEqual(assertClaimGraphPayoutReplay(evidence), result.claimFundedGraph.solverPayoutReplay);
    } else assert.equal(row.revert?.reason, 'NOTE_ALREADY_SPENT');
    assert.equal(row.receipt.transactionHash, row.transactionHash);
    assert.deepEqual(row.receipt.logs, []);
    const originals = evm.receipts.filter(value => value.label === 'claim-graph-solver-note-exit');
    assert.equal(originals.length, 1); assert.equal(originals[0].receipt.status, '0x1');
    if (ingressV3Profile) {
      const evidence = json(join(directory, 'private-audit/solver-payout-replay.json'));
      assert.equal(evidence.original.hash, originals[0].transactionHash);
      assert.deepEqual(evidence.originalReceipt, originals[0].receipt);
      for (const [observed, journal] of [[evidence.original, originals[0]], [evidence.replay, row]]) {
        assert.equal(observed.hash, journal.transactionHash);
        for (const field of ['from', 'to']) assert.equal(observed[field], journal.request[field]);
        assert.equal(observed.input, journal.request.data);
        assert.equal(observed.value, journal.request.value ?? '0x0');
      }
    }
    assert.equal(row.request.to.toLowerCase(), pools[1]);
    assert.equal(row.request.data, originals[0].request.data);
    assert.equal(row.request.from, originals[0].request.from);
    assert.equal(row.request.value ?? '0x0', originals[0].request.value ?? '0x0');
    graphReplayCount++; continue;
  }
  assert.equal(row.receipt.status, '0x1');
  assert.equal(row.receipt.transactionHash, row.transactionHash);
  const to = row.request.to?.toLowerCase(), calldata = row.request.data?.slice(2);
  if (!calldata) continue;
  const method = gateways.includes(to) ? methods.get(calldata.slice(0, 8)) : null, hex = calldata.slice(8);
  if (method) {
    calls[method]++;
    gatewayCalls[method][gateways.indexOf(to)]++;
    if (method === 'preposition' || method === 'issue') matchPacket(packet(hex, offset(hex, 0)), 'deposit_intent');
    if (method === 'issue') matchPacket(packet(hex, offset(hex, 64)), ingressRelation);
    if (method === 'voidDeposit') matchPacket(packet(hex, offset(hex, 0)), ingressRelation);
    if (method === 'discharge') matchPacket(packet(hex, offset(hex, 0)), 'native_claim_discharge');
  } else if (pools.includes(to) && calldata.slice(0, 8) === withdrawSelector) {
    calls.withdrawBalance++; matchPacket(packet(hex, 0), 'withdraw_balance');
  } else if (graphProfile && Object.keys(graphCalls).some(name => FLAT_TRANSACTION_METHODS[name].selector === calldata.slice(0, 8))) {
    const decoded = claimGraphProofPackets(row.request.data);
    assert.equal(to, decoded.name === 'admit' ? hubs[0] : pools[1], 'CLAIM_GRAPH_TARGET');
    graphCalls[decoded.name]++;
    for (const proof of decoded.packets) matchPacket({ bytes: proof.proof,
      inputs: proof.publicInputs.map(value => BigInt(value).toString(16).padStart(64, '0')) }, proof.relation);
  }
}
if (graphProfile) {
  assert.equal(graphReplayCount, 1);
  assert.deepEqual(graphCalls, { reserveGenericGuarded: 1, admit: 1, fulfillGeneric: 1 });
  const counts = {};
  for (const proof of proofs) counts[proof.relation] = (counts[proof.relation] ?? 0) + 1;
  assert.deepEqual(counts, ingressV3Profile ? CLAIM_GRAPH_V3_PROOF_COUNTS : CLAIM_GRAPH_PROOF_COUNTS);
}
assert.deepEqual(calls, priorPartial
  ? { preposition: 2, issue: 2, voidDeposit: 0, discharge: 1, withdrawBalance: 2 }
  : graphProfile ? { preposition: 2, issue: 1, voidDeposit: 1, discharge: 3, withdrawBalance: 2 }
  : durableApiProfile ? { preposition: 1, issue: 1, voidDeposit: 0, discharge: durablePartial ? 0 : 1, withdrawBalance: 1 }
    : solanaContinuation ? { preposition: 2, issue: 1, voidDeposit: 1, discharge: 2, withdrawBalance: 1 }
    : { preposition: 3, issue: 2, voidDeposit: 1, discharge: 3, withdrawBalance: 2 });
assert.deepEqual(gatewayCalls, priorPartial
  ? { preposition: [1, 1], issue: [1, 1], voidDeposit: [0, 0], discharge: [1, 0] }
  : graphProfile ? { preposition: [0, 2], issue: [0, 1], voidDeposit: [0, 1], discharge: [0, 3] }
  : durableApiProfile ? { preposition: [0, 1], issue: [0, 1], voidDeposit: [0, 0], discharge: [0, durablePartial ? 0 : 1] }
    : solanaContinuation ? { preposition: [0, 2], issue: [0, 1], voidDeposit: [0, 1], discharge: [0, 2] }
    : { preposition: [1, 2], issue: [1, 1], voidDeposit: [0, 1], discharge: [1, 2] });
assert.equal(proofs.length, graphProfile ? 19 : durablePartial ? 3 : durableApiProfile ? 4 : priorPartial || solanaContinuation ? 7 : 11);
assert.ok(proofs.every(row => row.matches > 0));
if (durablePartial) {
  assert.deepEqual(proofs.map(row => [row.relation, row.matches]), [
    ['deposit_intent', 2], ['native_claim_ingress', 1], ['withdraw_balance', 1],
  ]);
  const retained = name => evm.receipts.filter(row => gateways.includes(row.request.to?.toLowerCase())
    && row.request.data?.slice(2, 10) === selector(name));
  const burns = retained('requestRedemption'), begins = retained('beginPayout'), reservations = retained('reserveSignedEffect');
  assert.equal(burns.length, 1); assert.equal(begins.length, 1); assert.equal(reservations.length, 2);
  for (const row of [...burns, ...begins, ...reservations]) assert.equal(row.request.to.toLowerCase(), gateways[1]);
  assert.equal(word(burns[0].request.data.slice(10), 0), 3000000n);
  const ticketId = begins[0].request.data.slice(10, 74);
  assert.equal(reservations.filter(row => row.request.data.slice(10, 74) === ticketId).length, 1);
  const owner = json(join(directory, 'private-audit/durable-native-owner-after-issue.json'));
  const submission = owner.deposits[0].submission;
  const issue = evm.receipts.find(row => row.transactionHash === '0x' + submission.transactionHash);
  assert.ok(issue); assert.equal(issue.request.to.toLowerCase(), gateways[1]);
  assert.equal(issue.request.data.slice(2, 10), selector('issue'));
  assert.equal(sha(Buffer.from(issue.request.data.slice(2), 'hex')), submission.calldataSHA256);
}
const ingressAmounts = proofs.filter(row => row.relation === ingressRelation)
  .map(row => decodeClaimIngressInputs(row.inputs.map(value => BigInt('0x' + value).toString())).amountQ).sort();
assert.deepEqual(ingressAmounts, priorPartial ? ['100000', '3000000']
  : graphProfile ? ['2000000', '3000000'] : durableApiProfile ? ['3000000']
    : solanaContinuation ? ['2000000', '3000000'] : ['100000', '2000000', '3000000']);
const transferTopic = '0x' + publicKeccak256(Buffer.from('Transfer(address,address,uint256)')).toString('hex');
const zero = '0x' + '0'.repeat(64);
const supplies = tokens.map(address => {
  let minted = 0n, burned = 0n;
  for (const row of evm.receipts) for (const log of row.receipt.logs) {
    if (log.address.toLowerCase() !== address || log.topics[0] !== transferTopic) continue;
    assert.equal(log.topics.length, 3); const amount = BigInt(log.data);
    if (log.topics[1] === zero) minted += amount;
    if (log.topics[2] === zero) burned += amount;
  }
  assert.equal(minted, burned); return { minted: String(minted), burned: String(burned) };
});
const btc = solanaOnly ? '0' : '100000';
assert.deepEqual(supplies, [{ minted: btc, burned: btc }, { minted: '3000000', burned: '3000000' }]);
for (const [chain, expected] of [['bitcoin', solanaOnly ? [] : ['deposit', 'redeem']],
  ['solana', priorPartial ? ['deposit'] : graphProfile ? ['deposit', 'redeem', 'redeem', 'deposit', 'refund']
    : durableApiProfile ? ['deposit', 'redeem'] : ['deposit', 'redeem', 'deposit', 'refund']]]) {
  const native = json(join(directory, 'private-audit', chain + '.json'));
  assert.deepEqual(native.transfers.map(row => row.route), expected);
  if (durablePartial && chain === 'solana') {
    const [deposit, payout] = native.transfers;
    for (const row of native.transfers) {
      const decoded = validateSolanaBindingTransaction(row.nativeWire, row.intent);
      assert.equal(decoded.signatureHex, row.nativeId); assert.equal(decoded.transactionSHA256, row.transactionSHA256);
      assert.equal(row.broadcastAttempts, 1); assert.equal(row.intent.lamports, '3000000');
    }
    assert.notEqual(deposit.nativeId, payout.nativeId);
    assert.equal(deposit.phase, 'OBSERVED_FINALIZED'); assert.ok(deposit.observation);
    assert.equal(deposit.observation.nativeId, deposit.nativeId); assert.equal(deposit.observation.nativeWire, deposit.nativeWire);
    assert.equal(payout.phase, 'BROADCAST_UNKNOWN'); assert.equal(payout.observation, null);
    assert.deepEqual(payout.broadcastFailure, { category: 'SOLANA_RPC_BLOCKHASH_NOT_FOUND', rpcCode: -32002 });
  } else assert.ok(native.transfers.every(row => row.broadcastAttempts === 1 && row.observation
      && row.phase === (chain === 'bitcoin' ? 'OBSERVED_CONFIRMED' : 'OBSERVED_FINALIZED')));
}
if (!partial) for (const state of result.finalClaimState)
  for (const field of ['wrapperSupply', 'pendingRedemptions', 'pendingRefunds', 'heldUnissued', 'reservedFees']) assert.equal(state[field], '0');
function assertDischargeReservations(payouts) {
  const co = proofs.filter(row => row.relation === 'native_claim_discharge'); assert.equal(co.length, payouts.length);
  const ticketIds = new Set();
  for (const proof of co) {
    assert.equal(proof.matches, 1);
    const statement = decodeClaimDischargeInputs(proof.inputs.map(value => BigInt('0x' + value).toString()));
    assert.ok(!ticketIds.has(statement.ticketId)); ticketIds.add(statement.ticketId);
    const reserved = evm.receipts.filter(row => row.request.to?.toLowerCase() === gateways[1]
      && row.request.data?.slice(2, 10) === selector('reserveSignedEffect')
      && row.request.data.slice(10, 74) === statement.ticketId);
    assert.equal(reserved.length, 1); assert.equal(reserved[0].request.data.slice(74, 138), statement.dischargeN);
  }
}
if (ingressV3Profile) {
  const native = json(join(directory, 'private-audit/solana.json'));
  const nonce = json(join(directory, 'private-audit/solana-nonce.json'));
  const initial = json(join(directory, 'private-audit/initial-native.json'))[1];
  const final = json(join(directory, 'private-audit/final-native.json'))[1];
  const deployment = json(join(directory, 'private-audit/claim-system.json'));
  deployment.configs.forEach(validateClaimConfig);
  const original = { roles: native.metadata.custody.roles, transfers: native.transfers,
    nonceIngressProfile: NATIVE_INGRESS_V3_PROFILE,
    nonceInfrastructureByAuthority: nonce.infrastructureByAuthority, nonceBootstrapByAuthority: nonce.bootstrapByAuthority };
  assert.equal(assertNonceIngressDeployment({ ...deployment, nativeRuntimes: [{}, original] }), true);
  const summary = checkClaimGraphV3Bootstrap(initial, original, deployment.configs[1]);
  Object.assign(summary, checkClaimGraphV3Transfers(initial, final, original, deployment.configs[1]));
  assert.deepEqual(summary, result.nonceInfrastructure);
  assertDischargeReservations(native.transfers.filter(row => row.route !== 'deposit'));
  for (const proof of proofs.filter(row => row.relation === NATIVE_INGRESS_V3_RELATION)) {
    const originalAttempt = join(NATIVE_INGRESS_V3_LOCAL, 'attempts', proof.evidence.runId);
    const manifest = json(join(originalAttempt, 'proof-manifest.json'));
    assert.equal(manifest.relation, NATIVE_INGRESS_V3_RELATION); assert.equal(manifest.selfVerified, true);
    assert.equal(manifest.sourceVersion, NATIVE_INGRESS_V3_SOURCE_VERSION); assert.equal(manifest.keySHA256, NATIVE_INGRESS_V3_KEY_SHA256);
    assert.equal(manifest.proofSHA256, proof.proofSHA256);
    assert.equal(sha(readFileSync(join(originalAttempt, 'proof.bin'))), proof.proofSHA256);
    assert.equal(sha(readFileSync(join(originalAttempt, 'public-inputs.json'))), manifest.publicInputsSHA256);
    assert.deepEqual(json(join(originalAttempt, 'public-inputs.json')).map(word => BigInt(word).toString(16).padStart(64, '0')), proof.inputs);
  }
} else if (nonceProfile) {
  const native = json(join(directory, 'private-audit/solana.json'));
  const nonce = json(join(directory, 'private-audit/solana-nonce.json'));
  const initial = json(join(directory, 'private-audit/initial-native.json'))[1];
  const final = json(join(directory, 'private-audit/final-native.json'))[1];
  const roles = native.metadata.custody.roles, bootstrap = nonce.bootstrap, infrastructure = nonce.infrastructure;
  const decodedBootstrap = validateSolanaNonceBootstrapTransaction(bootstrap.nativeWire, bootstrap.intent);
  assert.equal(bootstrap.phase, 'OBSERVED_FINALIZED'); assert.equal(bootstrap.broadcastAttempts, 1);
  assert.equal(decodedBootstrap.signatureHex, bootstrap.nativeId); assert.equal(decodedBootstrap.transactionSHA256, bootstrap.transactionSHA256);
  assert.equal(infrastructure.bootstrapNativeId, bootstrap.nativeId); assert.equal(infrastructure.bootstrapTransactionSHA256, bootstrap.transactionSHA256);
  assert.equal(bootstrap.intent.authorityPublicKey, roles.escrow.endpoint);
  assert.equal(bootstrap.intent.payerPublicKey, infrastructure.payerPublicKey);
  assert.equal(bootstrap.intent.nonceAccountPublicKey, infrastructure.nonceAccountPublicKey);
  assert.equal(bootstrap.intent.rentLamports, infrastructure.bootstrapRentLamports);
  assert.ok(bootstrap.observation); assert.equal(bootstrap.observation.nativeId, bootstrap.nativeId);
  assert.equal(bootstrap.observation.nativeWire, bootstrap.nativeWire);
  assert.equal(bootstrap.observation.transactionSHA256, bootstrap.transactionSHA256);
  assert.deepEqual(bootstrap.observation.intent, bootstrap.intent); assert.equal(bootstrap.observation.genesis, initial.genesis);
  assert.equal(bootstrap.observation.sourceBefore, infrastructure.genesisGrant);
  assert.equal(bootstrap.observation.recipientBefore, '0'); assert.equal(bootstrap.observation.recipientAfter, infrastructure.bootstrapRentLamports);
  assert.equal(bootstrap.observation.feeLamports, infrastructure.bootstrapFeeLamports);
  assert.equal(bootstrap.preparedFee, infrastructure.bootstrapFeeLamports);
  for (const [inventory, transfers] of [[initial, []], [final, native.transfers]]) {
    const current = auditOwnedSolanaNonceInfrastructure(inventory.nonceInfrastructure);
    for (const [key, value] of Object.entries(infrastructure)) assert.deepEqual(current[key], value);
    assert.equal(current.authorityPublicKey, roles.escrow.endpoint);
    assert.equal(current.payerBalance, bootstrap.observation.sourceAfter);
    assert.equal(inventory.accounts.length, 3);
    assert.deepEqual(inventory.accounts.map(row => row.role).sort(), ['depositor', 'escrow', 'recipient']);
    for (const account of inventory.accounts) {
      assert.notEqual(account.endpoint, current.payerPublicKey); assert.notEqual(account.endpoint, current.nonceAccountPublicKey);
    }
    assert.deepEqual(ownedCustodyFeeAudit(inventory.feeAudit.transfers), inventory.feeAudit);
    assert.deepEqual(inventory.feeAudit.transfers.map(row => row.nativeId), transfers.map(row => row.nativeId));
    assert.ok(!inventory.feeAudit.transfers.some(row => row.nativeId === bootstrap.nativeId));
    assert.equal(BigInt(inventory.escrow.total), BigInt(inventory.syntheticPrefunding.amount) - BigInt(inventory.feeAudit.escrowActualFees));
  }
  assert.ok(!native.transfers.some(row => row.nativeId === bootstrap.nativeId));
  const payouts = native.transfers.filter(row => row.route !== 'deposit');
  assert.equal(payouts.length, graphProfile ? 3 : 1);
  assert.equal(new Set(native.transfers.map(row => row.nativeId)).size, native.transfers.length);
  assert.equal(new Set(payouts.map(row => row.intent.durableNonce)).size, payouts.length);
  assert.equal(payouts[0].intent.durableNonce, initial.nonceInfrastructure.nonceAccount.durableNonce);
  if (graphProfile) assert.deepEqual(native.transfers.map(row => row.intent.lamports),
    ['3000000', '1800000', '1200000', '2000000', '2000000']);
  for (const row of native.transfers) {
    const incoming = row.route === 'deposit';
    const decoded = incoming ? validateSolanaBindingTransaction(row.nativeWire, row.intent)
      : validateSolanaNonceBindingTransaction(row.nativeWire, row.intent);
    assert.equal(decoded.signatureHex, row.nativeId); assert.equal(decoded.transactionSHA256, row.transactionSHA256);
    assert.equal(row.observation.nativeWire, row.nativeWire); assert.equal(row.observation.nativeId, row.nativeId);
    assert.equal(row.observation.transactionSHA256, row.transactionSHA256); assert.deepEqual(row.observation.intent, row.intent);
    assert.deepEqual([decoded.wireBindingVersion, decoded.effectIndex, decoded.wireBindingPosition],
      incoming ? ['1', '0', '1'] : ['2', '1', '2']);
    assert.equal(row.intent.sourcePublicKey, incoming ? roles.depositor.endpoint : roles.escrow.endpoint);
    assert.equal(row.intent.recipientPublicKey, incoming ? roles.escrow.endpoint
      : row.route === 'refund' ? roles.depositor.endpoint : roles.recipient.endpoint);
    if (!incoming) {
      assert.equal(row.intent.nonceAccountPublicKey, infrastructure.nonceAccountPublicKey);
      assert.notEqual(final.nonceInfrastructure.nonceAccount.durableNonce, row.intent.durableNonce);
    }
    assert.ok(BigInt(final.nativeHead.slot) >= BigInt(row.observation.transactionSlot));
  }
  assertDischargeReservations(payouts);
  assert.deepEqual(result.nativeProtocol, { ingressWireBindingVersion: '1', ingressEffectIndex: '0', ingressMemoPosition: '1',
    payoutWireBindingVersion: '2', payoutAdvanceNoncePosition: '0', payoutEffectIndex: '1', payoutMemoPosition: '2' });
  assert.deepEqual(result.nonceInfrastructure, { profile: 'SYNTHETIC_NONCE_INFRASTRUCTURE_NOT_USER_BACKING', bootstrapFinalized: true,
    bootstrapBroadcastOnce: true, createInstruction: 0, initializeInstruction: 1, separatePayer: true, escrowAuthority: true,
    claimAccountCount: 3, infrastructureAccountCount: 2, rentExcludedFromUserBacking: true,
    bootstrapFeeExcludedFromClaimFees: true, bootstrapExcludedFromClaimTransfers: true, nonceAdvancedWithObservedPayout: true });
}
if (graphProfile) {
  const retained = json(join(directory, 'private-audit/claim-funded-graph.json'));
  const graphNative = json(join(directory, 'private-audit/graph-native.json'));
  const custody = json(join(directory, 'private-audit/solana.json'));
  assert.equal(retained.originalCutoff, result.claimFundedGraph.originalCutoff);
  assert.equal(retained.settlement.reference, retained.graphReference);
  assert.equal(retained.settlement.outcome, 'FULFILLED'); assert.equal(retained.settlement.stage, 'FULFILLED');
  assert.equal(retained.settlement.executionStarted, true); assert.equal(retained.settlement.admittedReceipts, 1);
  assert.deepEqual(retained.settlement.nativeExposure, [{ slot: 0, family: '2', status: 'DELIVERED' }]);
  assert.deepEqual(retained.custody.accounts, retained.beforeCustody.accounts);
  assert.deepEqual(retained.custody.feeAudit, retained.beforeCustody.feeAudit);
  for (const observation of [retained.beforeClaims, retained.claims]) {
    assert.equal(observation.gateways.length, 2);
    assert.deepEqual(observation.gateways.map(row => row.wrapperSupply), ['0', '3000000']);
    for (const gateway of observation.gateways)
      for (const field of ['pendingRedemptions', 'pendingRefunds', 'heldUnissued']) assert.equal(gateway[field], '0');
  }
  assert.equal(retained.privatePortfolio.coherent, true);
  assert.equal(retained.privatePortfolio.assets[1].balances.available, '1800000');
  const graphRequest = retained.privatePortfolio.assets[1].requests.filter(row => row.requestId === 'claim_funded_sol_graph');
  assert.equal(graphRequest.length, 1); assert.equal(graphRequest[0].disposition, 'FULFILLED');
  assert.equal(graphNative.bitcoin.transfers.length, 0); assert.equal(graphNative.solana.transfers.length, 1);
  const delivery = graphNative.solana.transfers[0]; assert.deepEqual(retained.graphDelivery, delivery);
  const wire = validateSolanaBindingTransaction(delivery.nativeWire, delivery.intent);
  assert.equal(wire.signatureHex, delivery.nativeId); assert.equal(wire.transactionSHA256, delivery.transactionSHA256);
  assert.equal(delivery.intent.lamports, '1000000'); assert.equal(delivery.broadcastAttempts, 1);
  assert.equal(delivery.phase, 'OBSERVED_FINALIZED'); assert.ok(delivery.observation);
  assert.equal(delivery.observation.nativeWire, delivery.nativeWire); assert.deepEqual(delivery.observation.intent, delivery.intent);
  assert.equal(delivery.observation.nativeId, delivery.nativeId);
  assert.equal(delivery.observation.transactionSHA256, delivery.transactionSHA256);
  assert.equal('0x' + delivery.intent.sourcePublicKey, graphNative.solana.metadata.solverHex);
  assert.equal('0x' + delivery.intent.recipientPublicKey, graphNative.solana.metadata.recipientHex);
  assert.ok(Object.values(custody.metadata.custody.roles).every(role => role.endpoint !== delivery.intent.sourcePublicKey));
  assert.ok(!custody.transfers.some(row => row.nativeId === delivery.nativeId));
  if (ingressV3Profile) {
    const pins = json(join(directory, 'private-audit/solana-nonce.json')).infrastructureByAuthority;
    const excluded = Object.values(pins).flatMap(pin => [pin.payerPublicKey, pin.nonceAccountPublicKey]);
    for (const key of [delivery.intent.sourcePublicKey, delivery.intent.recipientPublicKey]) assert.ok(!excluded.includes(key));
    assert.deepEqual(retained.custody.nonceInfrastructureByAuthority, retained.beforeCustody.nonceInfrastructureByAuthority);
  }
  const words = proof => proof.inputs.map(value => BigInt('0x' + value).toString());
  const admission = decodeStatement('admission', words(proofs.find(row => row.relation === 'admission')));
  const settlement = decodeStatement('settlement', words(proofs.find(row => row.relation === 'settlement')));
  assert.ok(BigInt(admission.admissionFrom) <= BigInt(settlement.validFrom));
  assert.ok(BigInt(settlement.validFrom) < BigInt(settlement.validUntil));
  assert.ok(BigInt(settlement.validUntil) <= BigInt(admission.admissionUntil));
  assert.ok(BigInt(settlement.validUntil) <= BigInt(retained.originalCutoff));
  assert.ok(BigInt(admission.admissionUntil) - BigInt(admission.admissionFrom) <= 300n);
  const exits = proofs.filter(row => row.relation === 'withdraw_balance').map(row => decodeWalletPoolInputs('withdraw_balance', words(row)));
  assert.deepEqual(exits.map(row => row.amount).sort(), ['1200000', '1800000']);
  assert.notEqual(exits[0].recipient, exits[1].recipient);
  const burns = evm.receipts.filter(row => row.request.to?.toLowerCase() === gateways[1]
    && row.request.data?.slice(2, 10) === selector('requestRedemption'));
  assert.equal(burns.length, 2);
  for (const exit of exits) assert.equal(burns.filter(row => row.request.from === exit.recipient
    && word(row.request.data.slice(10), 0) === BigInt(exit.amount)).length, 1, 'CLAIM_GRAPH_EXIT_BURN_CALLER');
  const refund = result.expiredDepositRefund;
  assert.equal(refund.amount, '2000000');
  for (const key of ['ownerAbsent', 'originalTicketDischarged', 'duplicateHadNoEffect']) assert.equal(refund[key], true);
  const expired = proofs.filter(row => row.relation === 'deposit_intent')
    .map(row => decodeStatement('deposit_intent', words(row))).filter(row => row.amount === '2000000');
  assert.equal(expired.length, 1); assert.equal(expired[0].validUntil, refund.originalCutoff);
}
const checked = { format: 'NATIVE_CLAIM_RETAINED_ARTIFACT_CHECK_V1', runId,
  resultSHA256: sha(readFileSync(resultPath)), resourcesSHA256: sha(readFileSync(resourcesPath)),
  includedProofPacketsMatched: proofs.reduce((sum, row) => sum + row.matches, 0), proofFiles: proofs.length,
  profile: priorPartial ? 'TWO_ASSET_ACCOUNT_AND_BITCOIN_REDEMPTION_PARTIAL'
    : durablePartial ? 'SOLANA_DURABLE_API_ISSUE_AND_KEEPER_RECOVERY_PARTIAL' : result.profile ?? 'FULL_TWO_ASSET',
  calls, gatewayCalls, wrapperMintBurn: supplies, originalNativeEffectsOnly: true, finalLiabilitiesZero: !partial,
  allApplicationAcceptanceFlags: !partial && !solanaOnly,
  selectedApplicationAcceptanceFlags: !partial,
  twoAssetAccountAndBitcoinRedemption: priorPartial,
  solanaRedemptionAndExpiryRefund: solanaContinuation && !priorPartial,
  durableApiKeeperRestartAcceptance: durableApiProfile && !durablePartial,
  ...(graphProfile ? { privateClaimFundedGraph: true, graphCalls, graphReplayRejected: true,
    originalCutoffDepositRefund: true, independentSolverNativeDelivery: true,
    sourceClaimSplit: { source: '3000000', ownerChange: '1800000', solverPayout: '1200000' } } : {}),
  ...(nonceProfile ? { nativeProtocol: result.nativeProtocol, nonceInfrastructure: result.nonceInfrastructure,
    noncePayoutDischargeMatched: true } : {}),
  ...(durablePartial ? { durableApiIssuanceAndKeeperRecovery: true, observedSolanaDeposits: 1,
    unknownSolanaPayouts: 1, solanaPayoutFinality: false, claimDischarge: false,
    nativeBroadcastFailure: { category: 'SOLANA_RPC_BLOCKHASH_NOT_FOUND', rpcCode: -32002 } } : {}),
  unresolvedSolanaTicketInStoppedFixture: partial,
  sameRunCompleteTwoAssetRoundTrip: !partial && !solanaOnly,
  sourceClosureUnchanged: true, cleanupConfirmed: true,
  nativeSelfCustody: false, independentOperators: false, keeperOrNodeRestart: durableApiProfile,
  keeperProcessRestart: durableApiProfile, nativeNodeRestart: false, operatorKeyRestart: false, fullHostRestart: false,
  systemicPrivacyAcceptance: false, fullWalletAcceptance: false };
writeFileSync(ingressV3Profile ? join(directory, 'artifact-check.json') : join(ROOT, 'evidence', priorPartial ? 'native-claim-partial-artifact-check.json'
  : durablePartial ? 'native-claim-durable-partial-artifact-check.json'
    : graphProfile ? 'native-claim-graph-artifact-check.json'
    : durableApiProfile ? 'native-claim-durable-api-artifact-check.json'
    : 'native-claim-actual-artifact-check.json'), JSON.stringify(checked, null, 2) + '\n');
process.stdout.write(JSON.stringify(checked) + '\n');
