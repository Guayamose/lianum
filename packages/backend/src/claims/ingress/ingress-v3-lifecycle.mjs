/** INACTIVE integration candidate, executable with test-owned ports only.
 * These functions do not brand callbacks as owned or confer send authority.
 * Production installation must bind ports inside existing private constructors,
 * extend their fixed signing allowlists, and pass the normal artifact gate.
 */
import assert from 'node:assert/strict';
import { cloneInput as copy, frozenInput as freeze } from '../../execution/account/preparation/readiness-inputs.mjs';
import { claimUint } from '../protocol/framing.mjs';
import { auditClaimGateway } from '../operations/backing-audit.mjs';
import { auditNonceIngressPreparation, auditDualNonceInventory, validateNonceIngressBinding,
  assertCanonicalNonceIngressReservation, assertProspectiveIngressCoverage, candidateCommitment,
  nonceIngressBroadcastFrame, assertIngressGuardWindow, assertNonceIngressFirstSend }
  from './ingress-v3-host.mjs';
const same = (a, b, label) => assert.deepEqual(a, b, label);

/** Each of three existing owned operators executes this whole body itself.
 * Ports map to its private original(), nativeReads, audit(), jointCurrent(),
 * retainInventoryAudit() and fixed sign('broadcast-ingress-v3') operations.
 */
export async function auditIngressBroadcastOperator(ctx, request, expectedHead) {
  const started = ctx.now(), input = freeze(copy(request));
  const binding = validateNonceIngressBinding(input.binding);
  const view = await ctx.readCurrentView(); same(view.head, expectedHead, 'V3_QUORUM_HEAD');
  const gateway = view.gateways.find(g => g.claimDomain === binding.claimDomain);
  const retained = await ctx.readOriginalPreparation(binding);
  same(retained.prepared, input.prepared, 'V3_RETAINED_PREPARATION');
  same(retained.binding, binding, 'V3_RETAINED_BINDING');
  const original = await ctx.readOriginalNative(binding);
  await ctx.assertPrepared(input.prepared);
  const reservation = await ctx.readReservation(binding, view);
  assertCanonicalNonceIngressReservation(binding, reservation);
  await ctx.assertUnrevoked(binding, view);
  const observation = await ctx.readExactSignature(binding);
  assertNonceIngressFirstSend({ ...original, prepared: input.prepared, binding, observation,
    currentNonce: await ctx.readCurrentNonce(binding), explicitFirstSend: true });
  const terms = auditNonceIngressPreparation({ gateway, config: ctx.config, intentId: binding.operationId,
    prepared: input.prepared, wireSalt: binding.wireSalt, roles: ctx.roles,
    infrastructure: ctx.infrastructure, timestamp: view.head.timestamp, binding, reservation });
  // No callback may reuse another operator's report. This is the existing full
  // retained-native/history/all-domain/joint-graph audit with one exact staged
  // exception; the staged principal is still a liability.
  const report = await ctx.auditEntireSystem({ staged: binding, allowObservedDebt: false });
  assert.equal(report.inventories.length, view.gateways.length, 'V3_COMPLETE_INVENTORIES');
  assert.equal(new Set(report.inventories.map(i => i.claimDomain)).size, report.inventories.length, 'V3_DUPLICATE_INVENTORY');
  for (const item of report.inventories) {
    const scope = ctx.scope(item.claimDomain);
    const g = view.gateways.find(g => g.claimDomain === item.claimDomain);
    assert.ok(g, 'V3_UNREGISTERED_INVENTORY');
    const native = scope.config.nativeFamily === '2'
      ? auditDualNonceInventory(item.inventory, scope.config, scope.roles, scope.bootstrapPins)
      : scope.auditUnchangedBitcoinInventory(item.inventory);
    const liabilities = auditClaimGateway(g, scope.config);
    const funds = report.financials.find(f => f.claimDomain === item.claimDomain);
    for (const field of ['nativePrincipalAvailable', 'feeReserveAvailable']) assert.equal(funds[field], native[field], 'V3_INDEPENDENT_NATIVE_ARITHMETIC');
    for (const field of ['liabilities', 'reservedFees']) assert.equal(funds[field], liabilities[field], 'V3_INDEPENDENT_OBLIGATION_ARITHMETIC');
  }
  assertProspectiveIngressCoverage({ financials: report.financials, gateways: view.gateways, binding });
  const inventoryCommitment = await ctx.retainInventoryAudit(report);
  await ctx.assertPrepared(input.prepared); await ctx.assertUnrevoked(binding, view); await ctx.assertCurrent(view);
  const message = { claimDomain: binding.claimDomain, intentId: binding.operationId, revision: terms.revision,
    claimSequence: gateway.claimSequence, hubStateSequence: view.hubStateSequence,
    amount: terms.amount, wireKeyCommitment: terms.wireKeyCommitment, unsignedWireCommitment: terms.unsignedWireCommitment,
    preparationCommitment: terms.preparationCommitment, maxFee: terms.maxFee, admissionN: binding.admissionN,
    nativeGid: binding.nativeGid, nativeId: binding.request.nativeId, transactionSHA256: binding.transactionSHA256,
    wireBindingCommitment: binding.wireBindingCommitment, nonceAccountPublicKey: binding.intent.nonceAccountPublicKey,
    durableNonce: binding.intent.durableNonce, authorityPublicKey: binding.intent.sourcePublicKey,
    revocationState: gateway.revocationState, inventoryCommitment,
    obligationsCommitment: candidateCommitment('LIANUM/PAEG/native-claim-obligations/1', view.gateways),
    prospectiveIncomingCredit: terms.amount, validFrom: view.head.timestamp,
    validUntil: (claimUint(view.head.timestamp) + 30n).toString() };
  const frame = nonceIngressBroadcastFrame(message);
  ctx.assertLive(); assertIngressGuardWindow(started, ctx.now());
  // Must use the owned operator's durable sign-once journal and fixed purpose.
  const signed = await ctx.signIngressBroadcast(message, frame);
  await ctx.assertPrepared(input.prepared); await ctx.assertUnrevoked(binding, view); await ctx.assertCurrent(view);
  ctx.assertLive(); assertIngressGuardWindow(started, ctx.now());
  return freeze({ signerIndex: ctx.signerIndex, message, signed, head: view.head });
}

/** Scheduling/aggregation only. The existing registry's low-S, ordered 3-of-4
 * verification remains mandatory; these callback objects have no provenance.
 */
export async function collectIngressBroadcastQuorum({ operators, request, head, now, assertLive, verifyQuorum }) {
  assert.equal(operators.length, 3, 'V3_THREE_COMPLETE_AUDITS');
  assert.equal(new Set(operators).size, 3, 'V3_DISTINCT_OPERATOR_OBJECTS');
  const indexes = operators.map(c => c.signerIndex);
  assert.ok(indexes.every((i, n) => Number.isInteger(i) && i >= 0 && i < 4 && (n === 0 || indexes[n - 1] < i)), 'V3_ORDERED_DISTINCT_SIGNERS');
  const started = now(), results = [];
  for (const operator of operators) results.push(await auditIngressBroadcastOperator(operator, request, head));
  const frame = nonceIngressBroadcastFrame(results[0].message);
  for (const result of results) {
    same(result.head, head, 'V3_SAME_CANONICAL_HEAD');
    same(nonceIngressBroadcastFrame(result.message), frame, 'V3_ALL_AUDITS_AGREE');
  }
  await verifyQuorum({ frame, results }); assertLive(); assertIngressGuardWindow(started, now());
  return freeze({ message: results[0].message, results, head });
}

/** Controller integration body, invoked only after native fsync, all-four
 * binding retention and INCLUDED canonical reservation, before the send latch.
 * It returns the exact ephemeral scope only to the private controller. The
 * controller installs a nonserializable final-send gate and returns undefined
 * to the native beforeBroadcast callback. Serialized scope data is no permit.
 */
export async function guardIngressBroadcast(ctx, request) {
  const started = ctx.now(), input = freeze(copy(request));
  ctx.assertLive(); ctx.assertKeeperLive();
  const binding = validateNonceIngressBinding(input.binding);
  const retained = await ctx.readOriginalPreparation(binding);
  same(retained.prepared, input.prepared, 'V3_CONTROLLER_ORIGINAL_PREPARATION');
  same(retained.binding, binding, 'V3_CONTROLLER_ORIGINAL_BINDING');
  const view = await ctx.readCurrentView();
  const acknowledgments = await ctx.readFourDurableRetentions(binding);
  assert.equal(acknowledgments.length, 4, 'V3_ALL_FOUR_RETENTIONS');
  assert.equal(new Set(acknowledgments.map(v => v.signerIndex)).size, 4, 'V3_DISTINCT_RETENTIONS');
  for (const ack of acknowledgments) {
    assert.ok(Number.isInteger(ack.signerIndex) && ack.signerIndex >= 0 && ack.signerIndex < 4);
    same(ack.binding, binding, 'V3_EXACT_RETAINED_BINDING');
  }
  assertCanonicalNonceIngressReservation(binding, await ctx.readReservation(binding, view));
  const result = await ctx.collectQuorum({ binding, prepared: input.prepared }, view.head);
  const expectedTerms = auditNonceIngressPreparation({ gateway: view.gateways.find(g => g.claimDomain === binding.claimDomain),
    config: ctx.config, intentId: binding.operationId, prepared: input.prepared, wireSalt: binding.wireSalt,
    roles: ctx.roles, infrastructure: ctx.infrastructure, timestamp: view.head.timestamp, binding,
    reservation: await ctx.readReservation(binding, view) });
  for (const [field, value] of Object.entries({ claimDomain: binding.claimDomain, intentId: binding.operationId,
    revision: binding.revision, admissionN: binding.admissionN, nativeGid: binding.nativeGid,
    nativeId: binding.request.nativeId, transactionSHA256: binding.transactionSHA256,
    wireBindingCommitment: binding.wireBindingCommitment, preparationCommitment: expectedTerms.preparationCommitment,
    unsignedWireCommitment: expectedTerms.unsignedWireCommitment, amount: expectedTerms.amount,
    maxFee: expectedTerms.maxFee, wireKeyCommitment: expectedTerms.wireKeyCommitment,
    prospectiveIncomingCredit: expectedTerms.amount, claimSequence: view.gateways.find(g => g.claimDomain === binding.claimDomain).claimSequence,
    hubStateSequence: view.hubStateSequence, revocationState: view.gateways.find(g => g.claimDomain === binding.claimDomain).revocationState,
    nonceAccountPublicKey: binding.intent.nonceAccountPublicKey, durableNonce: binding.intent.durableNonce,
    authorityPublicKey: binding.intent.sourcePublicKey, obligationsCommitment: candidateCommitment('LIANUM/PAEG/native-claim-obligations/1', view.gateways) })) assert.equal(result.message[field], value, 'V3_CONTROLLER_PERMIT_' + field);
  nonceIngressBroadcastFrame(result.message); same(result.head, view.head, 'V3_CONTROLLER_PERMIT_HEAD');
  assert.ok(claimUint(result.message.validFrom) <= claimUint(view.head.timestamp)
    && claimUint(view.head.timestamp) < claimUint(result.message.validUntil), 'V3_CONTROLLER_PERMIT_EXPIRED');
  await ctx.persistBroadcastAuthorization(binding, result);
  await ctx.assertCurrent(view);
  assertCanonicalNonceIngressReservation(binding, await ctx.readReservation(binding, view));
  await ctx.assertUnrevoked(binding, view); await ctx.assertPrepared(input.prepared);
  // Preparation yielded after the former final head check. Revalidate the
  // same owned view again, then check keeper/role liveness synchronously.
  await ctx.assertCurrent(view);
  ctx.assertLive(); ctx.assertKeeperLive(); assertIngressGuardWindow(started, ctx.now());
  return Object.freeze({ view, authorization: result, started });
}

/** Testable runtime first-send control model. No reconstruction from serialized
 * state is supported. Production must retain the actual private runtime and
 * prepared-object provenance in existing WeakMaps, and latch its native record.
 * Caller callbacks are NOT recognized as genuine owned capabilities here.
 */
export function createIngressFirstSendModel({ runtime, prepared, binding, original, now }) {
  const bound = freeze(copy(binding)), preparedSnapshot = freeze(copy(prepared));
  let attempted = false;
  return Object.freeze({ async firstSend({ runtime: liveRuntime, prepared: livePrepared, check, guard, persistLatch, sendOriginal, beforeSend, assertBeforeSend, assertLive }) {
    assert.equal(liveRuntime, runtime, 'V3_ORIGINAL_RUNTIME_MUST_SURVIVE');
    assert.equal(livePrepared, prepared, 'V3_ORIGINAL_PREPARATION_MUST_SURVIVE');
    assert.equal(attempted, false, 'V3_NO_SECOND_ATTEMPT');
    same(prepared, preparedSnapshot, 'V3_PREPARATION_MUTATED'); same(binding, bound, 'V3_BINDING_MUTATED');
    // Claim the local invocation before the first await, fencing concurrency.
    attempted = true;
    let latched = false;
    try {
      const state = await check();
      assertNonceIngressFirstSend({ ...state, original, prepared, binding });
      const started = now(); await guard(); assertLive(); assertIngressGuardWindow(started, now());
      same(prepared, preparedSnapshot, 'V3_PREPARATION_MUTATED'); same(binding, bound, 'V3_BINDING_MUTATED');
      assertNonceIngressFirstSend({ ...state, original, prepared, binding });
      original.phase = 'BROADCAST_UNKNOWN'; original.broadcastAttempts = 1; latched = true;
      await persistLatch(copy(original));
      await beforeSend(prepared); assertBeforeSend(prepared);
      assertLive(); assertIngressGuardWindow(started, now());
      return await sendOriginal(bound.nativeWire);
    } finally {
      // Rejected before a durable/send latch may be explicitly attempted later
      // after a fresh full guard. Any latch uncertainty permanently fences it.
      if (!latched) attempted = false;
    }
  } });
}


/** Nonserializable one-use final-send gate. Construct only inside the owned
 * controller after guardIngressBroadcast returns its exact original scope.
 * All final async checks occur AFTER native attempt-latch fsync. The runtime
 * calls assertBeforeSend synchronously after them, with no further await before
 * its own liveness checks and sole transport invocation.
 */
export function createIngressFinalSendGate({ ctx, prepared, binding, scope }) {
  const originalPrepared = prepared, originalBinding = binding, originalStarted = scope.started;
  const capturedPrepared = freeze(copy(prepared)), capturedBinding = freeze(copy(binding));
  const originalView = scope.view, capturedView = freeze(copy(scope.view));
  const originalAuthorization = scope.authorization, capturedAuthorization = freeze(copy(scope.authorization));
  const frame = nonceIngressBroadcastFrame(capturedAuthorization.message);
  let entered = false, ready = false, consumed = false;
  const check = value => {
    assert.equal(value, originalPrepared, 'V3_FINAL_ORIGINAL_PREPARATION_IDENTITY');
    same(value, capturedPrepared, 'V3_FINAL_PREPARATION_CHANGED');
    same(originalBinding, capturedBinding, 'V3_FINAL_BINDING_CHANGED');
    same(originalView, capturedView, 'V3_FINAL_ORIGINAL_HEAD_CHANGED');
    same(originalAuthorization, capturedAuthorization, 'V3_FINAL_ORIGINAL_AUTHORIZATION_CHANGED');
    same(nonceIngressBroadcastFrame(originalAuthorization.message), frame, 'V3_FINAL_FRAME_CHANGED');
    ctx.assertOriginalRetained(capturedBinding, capturedPrepared, capturedAuthorization);
    ctx.assertLive(); ctx.assertKeeperLive(); ctx.assertEvmUnchanged();
    assertIngressGuardWindow(originalStarted, ctx.now());
  };
  return Object.freeze({
    async beforeSend(value) {
      assert.equal(entered, false, 'V3_FINAL_GUARD_ALREADY_ENTERED'); entered = true;
      check(value);
      await ctx.assertCurrent(originalView);
      assertCanonicalNonceIngressReservation(capturedBinding, await ctx.readReservation(capturedBinding, originalView));
      await ctx.assertUnrevoked(capturedBinding, originalView);
      // Last await is a full current-head check on the ORIGINAL owned view.
      // The synchronous epoch check below also fences a completed mutation
      // between this read and the runtime continuation.
      await ctx.assertCurrent(originalView);
      check(value); ready = true;
    },
    assertBeforeSend(value) {
      assert.ok(entered && ready && !consumed, 'V3_FINAL_ONE_USE_PERMISSION_REQUIRED');
      check(value); consumed = true;
    },
  });
}
