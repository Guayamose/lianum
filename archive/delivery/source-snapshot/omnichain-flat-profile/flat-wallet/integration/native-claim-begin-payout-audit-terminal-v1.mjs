/** Read-only evidence after the exact private controller stop was consumed.
 * These helpers mint no stop, signature, observation or operational authority. */
import assert from 'node:assert/strict';
import { assertOwnedNativeClaimSystem } from '../wallet-platform/modules/ops/deploy-native-claims.mjs';
import { assertOwnedClaimObserver } from '../wallet-platform/modules/native-claims/owned-state.mjs';
import { readOwnedSolanaRuntimeAuditState } from '../wallet-platform/modules/chain-adapters/owned-solana-runtime.mjs';
import { auditClaimNativeInventory } from '../wallet-platform/modules/native-claims/backing-audit.mjs';
import { assertBeginPayoutAuditReceiptV1 } from '../wallet-platform/modules/native-claims/begin-payout-audit-policy-v1.mjs';
import { assertOwnedNativeClaimBeginPayoutAuditReceiptV1, ownedNativeClaimControllerBindings } from '../wallet-platform/modules/native-claims/controller.mjs';
import { claimHash } from '../wallet-platform/modules/native-claims/permits.mjs';
const beforeStates = new WeakMap(), capturedOwners = new WeakSet();
const runtimes = fixture => [fixture.bitcoin, fixture.solana, fixture.graphBitcoin, fixture.graphSolana];
const effects = fixture => runtimes(fixture).map(native => native.transfers.map(row => Object.fromEntries(
  ['genesis', 'route', 'sourceRole', 'preparedFee', 'nativeId', 'txid', 'nativeWire', 'rawTransaction',
    'transactionSHA256', 'intent', 'phase', 'broadcastAttempts'].filter(key => Object.hasOwn(row, key)).map(key => [key, row[key]]))));
export function captureBeginPayoutAuditBeforeV1(fixture, controller) {
  assert.equal(arguments.length, 2); assertOwnedNativeClaimSystem(fixture.runtime, fixture.claims);
  const bindings = ownedNativeClaimControllerBindings(controller);
  assert.equal(bindings.runtime, fixture.runtime); assert.equal(bindings.claims, fixture.claims);
  assert.equal(fixture.bitcoin, fixture.claims.nativeRuntimes[0]); assert.equal(fixture.solana, fixture.claims.nativeRuntimes[1]);
  assert.ok(!capturedOwners.has(controller), 'CLAIM_BEGIN_AUDIT_CAPTURE_ONCE'); capturedOwners.add(controller);
  beforeStates.set(controller, { fixture, evmRequests: fixture.runtime.transactions.length,
    evmFence: structuredClone(fixture.runtime.ingressSendState), effects: structuredClone(effects(fixture)) });
}

export async function captureBeginPayoutAuditTerminalV1(fixture, controller, receipt) {
  assert.equal(arguments.length, 3);
  assertOwnedNativeClaimBeginPayoutAuditReceiptV1(controller, receipt);
  const bindings = ownedNativeClaimControllerBindings(controller);
  assert.equal(bindings.runtime, fixture.runtime); assert.equal(bindings.claims, fixture.claims); const before = beforeStates.get(controller);
  assert.ok(before && before.fixture === fixture, 'CLAIM_BEGIN_AUDIT_ORIGINAL_BEFORE_STATE'); beforeStates.delete(controller);
  assertOwnedNativeClaimSystem(fixture.runtime, fixture.claims); assertOwnedClaimObserver(fixture.observer);
  assertBeginPayoutAuditReceiptV1(receipt);
  const unchanged = () => {
    assert.equal(fixture.runtime.transactions.length, before.evmRequests, 'CLAIM_BEGIN_AUDIT_EVM_EFFECT');
    assert.deepEqual(fixture.runtime.ingressSendState, before.evmFence, 'CLAIM_BEGIN_AUDIT_EVM_FENCE');
    assert.deepEqual(effects(fixture), before.effects, 'CLAIM_BEGIN_AUDIT_ORIGINAL_EFFECTS_CHANGED');
  };
  unchanged();
  const methods = Object.entries(fixture.claims.gateways[1].artifact.evm.methodIdentifiers).filter(([name]) => name.startsWith('beginPayout('));
  assert.equal(methods.length, 1, 'CLAIM_BEGIN_AUDIT_PINNED_ABI');
  assert.equal(fixture.runtime.transactions.filter(row => row.request?.data?.slice(0, 10) === '0x' + methods[0][1]).length, 0,
    'CLAIM_BEGIN_AUDIT_NO_BEGIN_PAYOUT');
  assert.deepEqual(runtimes(fixture).map(native => native.transfers.length), [0, 1, 0, 1]);
  const deposit = fixture.solana.transfers[0], graph = fixture.graphSolana.transfers[0];
  assert.equal(deposit.route, 'deposit'); assert.equal(deposit.intent.lamports, '3000000');
  assert.equal(graph.intent.lamports, '1000000');
  for (const row of [deposit, graph]) { assert.equal(row.phase, 'OBSERVED_FINALIZED'); assert.equal(row.broadcastAttempts, 1); }
  const nativeState = readOwnedSolanaRuntimeAuditState(fixture.solana);
  assert.equal(nativeState.activePrepared, null); assert.equal(nativeState.activeRoute, null);
  for (const key of ['operationBusy', 'observationBusy', 'inventoryBusy', 'signingUnresolved', 'persistenceFailed', 'isolationFailed', 'adverseHistory'])
    assert.equal(nativeState[key], false, 'CLAIM_BEGIN_AUDIT_PREPARATION_NOT_UNWOUND');
  assert.equal(nativeState.activeReads, 0); assert.equal(nativeState.activeMutations, 0);
  const view = await fixture.observer.read(); await fixture.observer.assertCurrent(view);
  assert.equal(claimHash(Buffer.from(JSON.stringify(view.head))), receipt.originalHeadSHA256, 'CLAIM_BEGIN_AUDIT_ORIGINAL_HEAD');
  assert.equal(view.gateways.length, 2);
  for (const [i, gateway] of view.gateways.entries()) {
    for (const name of ['wrapperSupply', 'pendingRefunds', 'heldUnissued']) assert.equal(gateway[name], '0');
    assert.equal(gateway.pendingRedemptions, i ? '3000000' : '0');
    assert.equal(gateway.reservedFees, i ? '5000' : '0');
    assert.equal(gateway.intentCount, String(i)); assert.equal(gateway.ticketCount, String(i));
    assert.equal(gateway.activePayout, '0'.repeat(64));
  }
  const ticket = view.gateways[1].tickets[0]; assert.equal(ticket.state, '1');
  assert.equal(ticket.ticket.kind, '1'); assert.equal(ticket.ticket.amount, '3000000'); assert.equal(ticket.ticket.maxFee, '5000');
  const inventories = [await fixture.bitcoin.inventory(), await fixture.solana.inventory()];
  assert.equal(auditClaimNativeInventory(inventories[1], fixture.claims.configs[1], fixture.solana.roles,
    fixture.solana.nonceInfrastructureByAuthority).nativePrincipalAvailable, '3000000');
  const graphBalances = { solver: await fixture.graphSolana.balance(fixture.graphSolana.solver),
    recipient: await fixture.graphSolana.balance(fixture.graphSolana.recipients[0]) };
  assert.equal(graphBalances.solver, graph.observation.sourceAfter); assert.equal(graphBalances.recipient, graph.observation.recipientAfter);
  await fixture.observer.assertCurrent(view); unchanged();
  return { inventories, graphBalances, public: { beginPayoutRequests: 0, evmRequestsUnchanged: true,
    nativePayoutPresignReached: false, nativePayoutKeyAuthorityCreated: false,
    nativePayoutSigningReached: false, nativePayoutSendReached: false,
    custodySolTransfers: 1, custodyBtcTransfers: 0, graphSolTransfers: 1, graphBtcTransfers: 0,
    originalEffectsUnchanged: true, preparationUnwound: true, originalHeadUnchanged: true,
    pendingRedemptions: '3000000', reservedFees: '5000', wrapperSupply: '0', pendingRefunds: '0', heldUnissued: '0',
    activePayoutIsZero: true, solTicketState: '1', solIntentCount: '1', solTicketCount: '1', completedRedemptions: 0 } };
}
