import { assertBeginPayoutAuditReleaseV1, assertBeginPayoutAuditReceiptV1, CLAIM_BEGIN_PAYOUT_AUDIT_PROFILE_V1,
  CLAIM_BEGIN_PAYOUT_AUDIT_STOP_CODE_V1 } from '../payouts/begin-payout-audit-policy-v1.mjs';
import { readOwnedBitcoinRuntimeAuditState } from '../../chains/bitcoin/runtime/owned-bitcoin-runtime.mjs';
import { isOwnedSolanaSplCustodyV1, assertOwnedSolanaSplCustodyV1, readOwnedSolanaSplOriginalGraphV3, assertOwnedSolanaSplGraphPairV1 } from '../../chains/solana/runtime/owned-solana-runtime.mjs';
import {assertOwnedFlatNativeProvider,captureOwnedFlatSolanaSourceForSplV1} from '../../providers/native-provider.mjs';
import { validateNativeSplClaimBindingTransactionV1 } from '../../chains/solana/dispatch/native-spl-custody-codec-v1.mjs';
import { readOwnedSolanaRuntimeAuditState } from '../../chains/solana/runtime/owned-solana-runtime.mjs';
import { CLAIM_BITCOIN_PAYOUT_FINAL_SEND_PROFILE } from '../payouts/bitcoin-payout-broadcast.mjs';
import { createPayoutFinalSendGate } from '../payouts/payout-final-send.mjs';
import { guardIngressBroadcast, createIngressFinalSendGate } from '../ingress/ingress-v3-lifecycle.mjs';
import { assertNonceIngressDeployment, auditNonceIngressPreparation, assertNonceIngressFirstSend }
  from '../ingress/ingress-v3-host.mjs';
/** Fixed custodial BTC/SOL claim lifecycle. No root owner key, arbitrary call,
 * provider, proof callback, native retarget or native retry enters this API.
 * All local funds and same-host operator roles are explicitly synthetic. */
import assert from 'node:assert/strict';
import {randomBytes,createPublicKey,verify} from 'node:crypto';
import { exactRecord, bytes32, ZERO, FIELD_MODULUS, canonicalField } from '../../execution/encoding/commitments.mjs';
import { cloneInput as copy, frozenInput as freeze } from '../../execution/account/preparation/readiness-inputs.mjs';
import { assertOwnedNativeClaimSystem } from '../../operations/deployments/claims/deploy-native-claims.mjs';
import { assertOwnedLocalEvmV2, LOCAL_EVM_PROFILE, assertSignedEvmTransaction, refreshNativeValueReceiverClock, nativeValueReceiverInclusionSecondV1 } from '../../chains/evm/runtime/owned-evm-v2-runtime.mjs';
import { assertOwnedClaimObserver, ownedClaimObserverBindings } from '../operations/owned-state.mjs';
import { assertOwnedClaimOperator, assertOwnedClaimOperatorQuorum } from '../operations/operators.mjs';
import * as claimOperators from '../operations/operators.mjs';
import {assertRoleProofClient,createRoleProofClient,readOriginalDeviceRootClaimDerivationV2} from '../../../../proofs/src/jobs/role-client.mjs';
import * as DeviceClaim from '../../../../mobile-protocol/src/native-claim-device-v1.mjs';
import {originalNativeClaimAssetUnitsV1} from '../operations/native-claim-asset-units-v1.mjs';
import { loadPinned, resourceModuleURL } from '../../../../proofs/src/tooling/tooling.mjs';
import { assertOwnedNativeClaimIngressHandoff,assertOwnedPrivateNativeClaimIngressHandoffV2, assertOwnedFlatOwnerProcess } from '../../../../custody/src/processes/flat-owner-process.mjs';
import { ownedClaimControllerJournal } from './controller-journal.mjs';
import { createClaimEvmDispatchRequest } from '../protocol/evm-dispatch-gate.mjs';
import { createFlatSystemStateReader } from '../../execution/account/reconciliation/flat-system-state.mjs';
import { balanceCommitment } from '../../../../engine/src/wallet/notes/private-wallet-note-encoding.mjs';
import { verifyPrivateNotePath } from '../../../../engine/src/notes/private-note-tree.mjs';
import { nativeAdmissionChainDomain, nativeAdmissionRulesTree } from '../../../../engine/src/execution/native/dispatch/native-admission.mjs';
import { receiptKeyCommitment, validateBitcoinBinding } from '../../chains/shared/dispatch/native-receipt-binding.mjs';
import { validateClaimSolanaBindingTransaction } from '../../chains/solana/runtime/owned-solana-nonce-binding.mjs';
import { claimDomainCommitment, claimIntentId, claimReceiptSecret, claimRefundSalt, claimDestinationCommitment,
  claimTicketId, claimTicketSecret, nativeClaimEndpointCommitment, claimUint } from '../protocol/framing.mjs';
import { decodeClaimIngressInputs, decodeClaimDischargeInputs } from '../protocol/framing.mjs';
import { CLAIM_ACTIONS as A, claimHash, claimRouteCommitment } from '../authorization/permits.mjs';
import { buildClaimIngressInputs, buildClaimDischargeInputs } from '../protocol/inputs.mjs';
import { createClaimReservationBinding, assertCanonicalClaimReservation } from '../authorization/reservation-facts-gate.mjs';
import { assertClaimRoute } from '../operations/backing-audit.mjs';
import { encodeDepositIntentInputs, decodeDepositIntentInputs } from '../../execution/account/preparation/deposit-intent.mjs';
import { encodeControllerClaimCall } from './controller-call.mjs';
import { compactClaimEvmRequest, compactClaimEvmPreparation, originalClaimEvmRecord } from './controller-evm-record.mjs';
import { validateRetainedClaimPacket,validateRetainedPrivateClaimPacketV2,validateRetainedDeviceRootClaimPacketV2, buildDeviceRootClaimIngressPublicV2, canonicalClaimDepositProjection } from './controller-retained-state.mjs';
export { createNativeClaimControllerKeeper, createDurableNativeClaimControllerKeeper,
  openDurableNativeClaimControllerKeeper } from './controller-journal.mjs';
const dispatchTokens = new WeakMap();
const deviceRootClaimSends=new WeakMap();
export function consumeOriginalDeviceRootClaimSendV3(request,runtime){assert.equal(arguments.length,2);const r=deviceRootClaimSends.get(request);assert.ok(r&&r.runtime===runtime&&!r.opened,'CLAIM_DEVICE_ROOT_ORIGINAL_SEND_REQUIRED');r.check();r.opened=true;return r.scope;}
// Minted only by completed genuine controller operations, never by a public
// issuer or a caller-supplied context. Refused consumption burns the token.
const originalKeyAuthoritiesV4 = new WeakMap();
export function consumeNativeClaimOriginalKeyAuthorityV4(token, purpose, runtimeClose, genesis, route, prepared) {
  const state = originalKeyAuthoritiesV4.get(token);
  assert.ok(state, 'CLAIM_ORIGINAL_KEY_AUTHORITY_V4_REQUIRED');
  originalKeyAuthoritiesV4.delete(token);
  assert.equal(purpose, state.purpose, 'CLAIM_ORIGINAL_KEY_PURPOSE');
  assert.equal(runtimeClose, state.runtimeClose, 'CLAIM_ORIGINAL_KEY_RUNTIME');
  assert.equal(genesis, state.genesis, 'CLAIM_ORIGINAL_KEY_GENESIS');
  assert.equal(route, state.route, 'CLAIM_ORIGINAL_KEY_ROUTE');
  assert.equal(prepared, state.prepared, 'CLAIM_ORIGINAL_KEY_PREPARATION_IDENTITY');
  return state.consume();
}

// Only the genuine completed payout closure below can mint these capabilities.
const solanaPayoutAuthorities = new WeakMap();
const splPayoutPreparations = new WeakMap(), splBegins = new WeakMap(), splIngressSends = new WeakMap();
// These consumers cannot mint authority. A rejected use burns the capability.
export async function consumeNativeSplClaimPayoutPreparationV1(token, native, route, request) {
  assert.equal(arguments.length, 4, 'CLAIM_SPL_PREPARATION_ARITY');
  const state=splPayoutPreparations.get(token); assert.ok(state,'CLAIM_SPL_ORIGINAL_PREPARATION_REQUIRED');splPayoutPreparations.delete(token);
  assertOwnedSolanaSplCustodyV1(native);assert.equal(native,state.native);assert.equal(route,state.route);
  return state.consume(request);
}
export async function consumeNativeSplClaimBeginAuthorizationV1(token, native, prepared) {
  assert.equal(arguments.length, 3, 'CLAIM_SPL_BEGIN_ARITY');
  const state=splBegins.get(token);assert.ok(state,'CLAIM_SPL_ORIGINAL_BEGIN_REQUIRED');splBegins.delete(token);
  assertOwnedSolanaSplCustodyV1(native);assert.equal(native,state.native);assert.equal(prepared,state.prepared);
  return state.consume();
}
export function openNativeSplClaimIngressSendV1(token,native,prepared,record) {
  assert.equal(arguments.length,4,'CLAIM_SPL_INGRESS_SEND_ARITY');
  const state=splIngressSends.get(token);assert.ok(state,'CLAIM_SPL_ORIGINAL_INGRESS_SEND_REQUIRED');splIngressSends.delete(token);
  assertOwnedSolanaSplCustodyV1(native);assert.equal(native,state.native);assert.equal(prepared,state.prepared);
  for(const name of ['nativeId','nativeWire','transactionSHA256','route'])assert.equal(record[name],state.record[name]);
  assert.deepEqual(record.intent,prepared.intent);return state.open();
}
const controllers=new WeakMap(),deviceRootClaimHandoffs=new WeakMap(),deviceRootClaimIntakes=new WeakMap(),deviceRootClaimObservationRestartsV3=new WeakMap();
const deviceRootProfile=DeviceClaim.DEVICE_ROOT_NATIVE_CLAIM_HANDOFF_V2;
const isPrivateClaimPacket=p=>p.profile===PRIVATE_CI51_PROFILE_V2||p.profile===deviceRootProfile;
const PRIVATE_CI51_PROFILE_V2='FLAT_OWNER_PRIVATE_NATIVE_CLAIM_INGRESS_HANDOFF_V2';
// Restrict the whole original diagnostic lifetime, including attempted reopen.
// Neither the owner state nor its stop marker is a caller-supplied capability.
const beginAuditSystemsV1 = new WeakMap(), beginAuditKeepersV1 = new WeakMap();
function createBeginAuditOwnerV1() {
  let phase = 'setup', marker = null, receipt = null;
  return Object.freeze({
    assertOpen() { assert.equal(phase, 'setup', 'CLAIM_BEGIN_AUDIT_OWNER_TERMINAL'); },
    begin() { assert.equal(phase, 'setup', 'CLAIM_BEGIN_AUDIT_ATTEMPT_ONCE'); phase = 'attempt'; },
    finish() { if (phase === 'attempt' || phase === 'awaiting-retention') phase = 'failed'; },
    fail() { phase = 'failed'; },
    stop(value) {
      assert.equal(phase, 'attempt', 'CLAIM_BEGIN_AUDIT_STOP_PHASE');
      assertBeginPayoutAuditReceiptV1(value); receipt = freeze(copy(value));
      marker = new Error(CLAIM_BEGIN_PAYOUT_AUDIT_STOP_CODE_V1); phase = 'awaiting-retention';
      throw marker;
    },
    pendingStop(error) { return phase === 'awaiting-retention' && error === marker; },
    acknowledgeRetention(error) {
      assert.equal(phase, 'awaiting-retention', 'CLAIM_BEGIN_AUDIT_RETENTION_REQUIRED');
      assert.equal(error, marker, 'CLAIM_BEGIN_AUDIT_PRIVATE_STOP_IDENTITY'); phase = 'stopped';
    },
    matches(error) { return phase === 'stopped' && error === marker; },
    assertReceipt(value) {
      assert.equal(phase, 'consumed', 'CLAIM_BEGIN_AUDIT_CONSUMED_STOP_REQUIRED');
      assert.equal(value, receipt, 'CLAIM_BEGIN_AUDIT_ISSUED_RECEIPT_REQUIRED');
    },
    consume(error) {
      assert.equal(phase, 'stopped', 'CLAIM_BEGIN_AUDIT_ORIGINAL_STOP_REQUIRED');
      phase = 'consumed'; // Even a forged signal burns this diagnostic outcome.
      assert.equal(error, marker, 'CLAIM_BEGIN_AUDIT_PRIVATE_STOP_IDENTITY');
      return receipt;
    },
  });
}
/** Only the fixed diagnostic constructor can create its owner. This consumer
 * accepts the original controller and its exact terminal thrown object, never
 * a string, copy, caller token, source path or arbitrary callback. */
export function isNativeClaimBeginPayoutAuditStopV1(controller, error) {
  assert.equal(arguments.length, 2, 'CLAIM_BEGIN_AUDIT_STOP_NO_OPTIONS');
  const state = controllers.get(controller);
  return Boolean(state?.matchesBeginAuditStop?.(error));
}
export function assertOwnedNativeClaimBeginPayoutAuditReceiptV1(controller, receipt) {
  assert.equal(arguments.length, 2, 'CLAIM_BEGIN_AUDIT_RECEIPT_NO_OPTIONS');
  const state = controllers.get(controller);
  assert.ok(state?.assertBeginAuditReceipt, 'CLAIM_BEGIN_AUDIT_OWNED_CONTROLLER_REQUIRED');
  state.assertBeginAuditReceipt(receipt);
}
export function consumeNativeClaimBeginPayoutAuditStopV1(controller, error) {
  assert.equal(arguments.length, 2, 'CLAIM_BEGIN_AUDIT_STOP_NO_OPTIONS');
  const state = controllers.get(controller);
  assert.ok(state?.consumeBeginAuditStop, 'CLAIM_BEGIN_AUDIT_OWNED_CONTROLLER_REQUIRED');
  return state.consumeBeginAuditStop(error);
}
// Only the owned controller can mint a token. Runtime callers may assert/enter
// and consume one, but cannot install an arbitrary authorization callback.
const bitcoinPayoutSendTokens = new WeakMap();
export function assertNativeClaimBitcoinPayoutSendToken(token, native, route) {
  const state = bitcoinPayoutSendTokens.get(token);
  assert.ok(state && state.native === native && state.route === route
    && !state.entered && !state.consumed, 'CLAIM_BITCOIN_PRIVATE_SEND_TOKEN_REQUIRED');
  state.live();
}
export async function authorizeNativeClaimBitcoinPayoutSend(token, prepared, signed) {
  const state = bitcoinPayoutSendTokens.get(token);
  assert.ok(state && !state.entered && !state.consumed, 'CLAIM_BITCOIN_PRIVATE_SEND_TOKEN_REQUIRED');
  state.entered = true; // Failure cannot restart a clock or collect again.
  await state.authorize(prepared, signed);
  state.ready = true;
}
export function authorizeNativeClaimBitcoinPayoutLatch(token, prepared, signed) {
  const state = bitcoinPayoutSendTokens.get(token);
  assert.ok(state?.entered && state.ready && !state.latched && !state.consumed, 'CLAIM_BITCOIN_LATCH_PERMISSION_REQUIRED');
  state.latched = true;
  return state.beforeLatch(prepared, signed);
}
export function consumeNativeClaimBitcoinPayoutSend(token, prepared, signed) {
  const state = bitcoinPayoutSendTokens.get(token);
  assert.ok(state?.entered && state.ready && state.latched && !state.consumed, 'CLAIM_BITCOIN_SEND_PERMISSION_REQUIRED');
  state.consumed = true; // A rejected final assertion also burns this permission.
  return state.consume(prepared, signed);
}

const prefix = v => '0x' + v;
const proofABI = result => ({ proof: prefix(result.proof), inputs: result.publicInputs.map(v => '0x' + BigInt(v).toString(16).padStart(64, '0')) });
const hashCalldata = value => claimHash(Buffer.from(value.slice(2), 'hex'));
const nativeIdOf = (row, family) => family === '1' ? row.txid : row.nativeId;
const wireOf = (row, family) => family === '1' ? row.rawTransaction : row.nativeWire;
const terminal = status => ['SUCCEEDED', 'REVERTED', 'REJECTED_NO_KEY'].includes(status);
const FINAL_AUDIT_PROFILE = 'CLAIM_EVM_ORIGINAL_CERTIFICATE_FINAL_AUDIT_V4';
const BACKING_ACTIONS = Object.freeze({ preposition: A.PREPOSITION, issue: A.ISSUE,
  requestRedemption: A.REDEEM, beginPayout: A.BEGIN_PAYOUT });
function exactPreparedHead(prepared) {
  exactRecord(prepared.head, ['number', 'hash', 'timestamp']);
  assert.match(prepared.head.hash, /^0x[0-9a-f]{64}$/, 'CLAIM_EVM_PREPARED_HEAD');
  for (const name of ['number', 'timestamp'])
    assert.match(prepared.head[name], /^0x(?:0|[1-9a-f][0-9a-f]*)$/, 'CLAIM_EVM_PREPARED_HEAD');
  return { number: BigInt(prepared.head.number).toString(), hash: prepared.head.hash.slice(2),
    timestamp: BigInt(prepared.head.timestamp).toString() };
}
function executionWindows(method, args, original) {
  const windows = [], words = proof => proof.inputs.map(value => BigInt(value).toString());
  if (['preposition', 'renewIntent', 'issue'].includes(method)) {
    const statement = decodeDepositIntentInputs(words(args[0]));
    windows.push([statement.validFrom, statement.validUntil]);
  }
  if (method === 'issue' || method === 'voidDeposit') {
    const statement = decodeClaimIngressInputs(words(args[method === 'issue' ? 1 : 0]));
    windows.push([statement.evidenceFrom, statement.evidenceUntil]);
  }
  if (method === 'discharge') {
    const statement = decodeClaimDischargeInputs(words(args[0]));
    windows.push([statement.evidenceFrom, statement.evidenceUntil]);
  }
  if (original?.method === 'health') windows.push([original.captured.message.validFrom, original.captured.message.validUntil]);
  else if (original) {
    const authorization = original.captured.authorization;
    windows.push([authorization.permit.validFrom, authorization.permit.validUntil], [authorization.healthFrom, authorization.healthUntil]);
  }
  return freeze(windows);
}
function assertExecutionWindows(windows, head, runtime) {
  const now = claimUint(head.timestamp);
  // The original observed receiver mines at actual wall time after slow work.
  // Other owned runtimes retain their unchanged manual-mining rule.
  const inclusion = nativeValueReceiverInclusionSecondV1(runtime) ?? now + 1n;
  for (const [rawFrom, rawUntil] of windows) {
    const from = claimUint(rawFrom), until = claimUint(rawUntil);
    assert.ok(from < until && from <= now && now < until && inclusion >= now && inclusion < until, 'CLAIM_EVM_ORIGINAL_WINDOW_EXPIRED');
  }
}
function elapsedEvidence(start) {
  const elapsed = performance.now() - start;
  assert.ok(Number.isFinite(elapsed) && elapsed >= 0 && Number.isSafeInteger(Math.floor(elapsed)), 'CLAIM_EVM_MONOTONIC_CLOCK');
  // Evidence records completed milliseconds; the strict guard uses raw time.
  return Math.floor(elapsed);
}
/** Runtime gate calls this once. No public method mints a token. */
export function openNativeClaimControllerDispatch(token) {
  const state = dispatchTokens.get(token); assert.ok(state && !state.opened, 'CLAIM_PRIVATE_DISPATCH_TOKEN_REQUIRED');
  state.scope.assertLive(); state.opened = true; return state.scope;
}
/** Fixed owned-runtime handoff. This opener cannot register or mint authority.
 * A failed opening burns the token; no serialized object or caller callback is
 * accepted. The runtime separately proves its original private record identity. */
export function openNativeClaimSolanaPayoutAuthority(token, runtimeClose, genesis, prepared, record) {
  const original = solanaPayoutAuthorities.get(token);
  assert.ok(original, 'CLAIM_SOLANA_PRIVATE_PAYOUT_AUTHORITY_REQUIRED');
  solanaPayoutAuthorities.delete(token);
  assert.equal(runtimeClose, original.runtimeClose, 'CLAIM_SOLANA_PAYOUT_PHYSICAL_RUNTIME');
  assert.equal(genesis, original.genesis, 'CLAIM_SOLANA_PAYOUT_GENESIS');
  assert.equal(prepared, original.prepared, 'CLAIM_SOLANA_PAYOUT_ORIGINAL_PREPARATION');
  for (const name of ['nativeId', 'nativeWire', 'transactionSHA256', 'route'])
    assert.equal(record[name], original.record[name], 'CLAIM_SOLANA_PAYOUT_ORIGINAL_RECORD');
  assert.deepEqual(record.intent, original.prepared.intent, 'CLAIM_SOLANA_PAYOUT_ORIGINAL_INTENT');
  original.gate.assertBeforeLatch(prepared);
  return original.gate;
}
function ownerBinding(packet) {
  const s = packet.statement;
  return claimHash(Buffer.concat([Buffer.from(s.scope, 'hex'), Buffer.from(s.policy, 'hex'),
    ...[s.validFrom, s.validUntil, s.amount].map(v => Buffer.from(BigInt(v).toString(16).padStart(64, '0'), 'hex')),
    Buffer.from(s.output, 'hex'), Buffer.from(claimHash(Buffer.from(packet.proofResult.proof, 'hex')), 'hex')]));
}
async function withPinnedHash(work) {
  const helpers = await import(resourceModuleURL); helpers.verifyToolchain();
  const bb = await loadPinned('@aztec/bb.js'); let backend;
  try {
    backend = await bb.Barretenberg.new({ backend: bb.BackendType.Wasm, threads: 1, skipSrsInit: true,
      memory: { initial: 37, maximum: 32768 } });
    return await work(async fields => {
      assert.ok(Array.isArray(fields) && fields.length <= 137, 'CLAIM_HASH_TUPLE');
      const inputs = fields.map(v => { assert.ok(typeof v === 'bigint' && v >= 0n && v < FIELD_MODULUS);
        return Buffer.from(v.toString(16).padStart(64, '0'), 'hex'); });
      const value = Buffer.from((await backend.poseidon2Hash({ inputs })).hash).toString('hex'); canonicalField(value); return value;
    });
  } finally { await backend?.destroy(); }
}

export async function createNativeClaimController(input) { return createController(input, false); }
/** Fixed closed diagnostic constructor. The ordinary public wallet factory and
 * request schema have no audit switch; this owner can only stop an attempt. */
export async function createNativeClaimBeginPayoutAuditControllerV1(input) {
  assert.equal(arguments.length, 1, 'CLAIM_BEGIN_AUDIT_CONTROLLER_NO_OPTIONS');
  assertBeginPayoutAuditReleaseV1(); return createController(input, true);
}
async function createController(input, beginAuditOnly) {
  exactRecord(input, ['runtime', 'claims', 'observer', 'operators', 'quorum', 'proofClients', 'keeper', 'ingressProverIdentity']);
  const { runtime, claims, observer, quorum, keeper, ingressProverIdentity } = input;
  assert.ok(Array.isArray(input.operators)); const operators = input.operators.slice();
  exactRecord(input.proofClients, ['claim_ingress', 'claim_discharge']); const proofClients = { ...input.proofClients };
  await assertOwnedLocalEvmV2(runtime); assertOwnedNativeClaimSystem(runtime, claims); assertOwnedClaimObserver(observer);
  const usesIngressV3 = assertNonceIngressDeployment(claims);
  const bindings = ownedClaimObserverBindings(observer); assert.equal(bindings.runtime, runtime); assert.equal(bindings.system, claims);
  bytes32(ingressProverIdentity, true); exactRecord(proofClients, ['claim_ingress', 'claim_discharge']);
  for (const role of ['claim_ingress', 'claim_discharge']) assertRoleProofClient(proofClients[role], role);
  assert.ok(Array.isArray(operators) && operators.length === 4, 'CLAIM_ALL_FOUR_OPERATORS_REQUIRED');
  operators.forEach((op, i) => { assertOwnedClaimOperator(op, observer); assert.equal(op.signerIndex, i, 'CLAIM_OPERATOR_REGISTRY_ORDER'); });
  assertOwnedClaimOperatorQuorum(quorum, observer);
  assert.ok(!beginAuditSystemsV1.has(claims) && !beginAuditKeepersV1.has(keeper), 'CLAIM_BEGIN_AUDIT_LIFETIME_CANNOT_REOPEN');
  const beginAuditOwner = beginAuditOnly ? createBeginAuditOwnerV1() : null;
  if (beginAuditOwner) { beginAuditSystemsV1.set(claims, beginAuditOwner); beginAuditKeepersV1.set(keeper, beginAuditOwner); }
  const journal = ownedClaimControllerJournal(keeper, runtime, claims); journal.acquire();
  let busy = false, closed = false;
  // One bounded diagnostic copy from the original audit producer. No journal,
  // observer, key or clock is read by its private getter, including after close.
  let privateFinalAuditTiming = null;
  function retainFinalAuditTiming(evidence) {
    privateFinalAuditTiming = freeze({ profile: evidence.profile, phase: evidence.phase,
      originalAuthorizationAgeMilliseconds: evidence.originalAuthorizationAgeMilliseconds,
      auditElapsedMilliseconds: evidence.auditElapsedMilliseconds, limitMilliseconds: evidence.limitMilliseconds });
  }
  const authorizationStarts = new WeakMap(), authorizationOrigins = new WeakMap();
  const ingressFinalSendGuards = new WeakMap();
  async function authorize(method, request) {
    const start = performance.now(), capturedRequest = freeze(copy(request)), result = await quorum[method](capturedRequest);
    const authorization = result.authorization ?? result.abiSignatures;
    assert.ok(!authorizationStarts.has(authorization), 'CLAIM_EVM_ORIGINAL_AUTHORIZATION_REISSUED');
    authorizationStarts.set(authorization, start);
    authorizationOrigins.set(authorization, { method, request: capturedRequest, result, captured: freeze(copy(result)), dispatch: null });
    return result;
  }
  const readers = [], rulePaths = nativeAdmissionRulesTree(bindings.registeredRules).paths.slice(0,claims.configs.length);
  try { for (let i = 0; i < claims.configs.length; i++) readers.push(await createFlatSystemStateReader({ runtime, system: claims.flatSystem, poolIndex: i }));
    await observer.read(); await journal.read(); }
  catch (error) { journal.release(); throw error; }
  function live() {
    assert.ok(!closed, 'CLAIM_CONTROLLER_CLOSED'); assertOwnedNativeClaimSystem(runtime, claims); assertOwnedClaimObserver(observer);
    assertOwnedClaimOperatorQuorum(quorum, observer); operators.forEach(op => assertOwnedClaimOperator(op, observer));
  }
  function assertIngressKeeperLive() {
    const status = keeper.status();
    assert.ok(!status.closed && !status.uncertain && status.controllerOpen === true, 'CLAIM_INGRESS_KEEPER_UNAVAILABLE');
  }
  function otherNativeStateFence(currentNative) {
    const others = claims.nativeRuntimes.map((native, i) => ({ native, family: claims.configs[i].nativeFamily }))
      .filter(({ native }) => native.close !== currentNative.close);
    const read = ({ native, family }) => (family === '1' ? readOwnedBitcoinRuntimeAuditState : readOwnedSolanaRuntimeAuditState)(native);
    const captured = others.map(read); let used = false;
    return () => {
      assert.equal(used, false, 'CLAIM_OTHER_NATIVE_LATCH_FENCE_ALREADY_USED'); used = true;
      others.forEach((original, i) => assert.deepEqual(read(original), captured[i], 'CLAIM_OTHER_NATIVE_LATCH_STATE_CHANGED'));
    };
  }
  async function originalLeaseV4(result, method) {
    assert.equal(quorum.authorizationLifecycleProfile, 'CLAIM_AUTHORIZATION_LIFECYCLE_V4', 'CLAIM_AUTHORIZATION_LIFECYCLE_V4_REQUIRED');
    live(); assertIngressKeeperLive();
    const token = await quorum.validateOriginalAuthorizationV4(result);
    const lease = claimOperators.openClaimOriginalAuthorizationLeaseV4(token, quorum, result);
    assert.equal(lease.profile, 'CLAIM_ORIGINAL_AUTHORIZATION_LEASE_V4');
    assert.equal(lease.method, method, 'CLAIM_ORIGINAL_KEY_METHOD');
    assert.deepEqual(lease.head, result.head, 'CLAIM_ORIGINAL_KEY_HEAD');
    return lease;
  }
  async function payoutKeyAuthorityV4(row, prepared, authorization) {
    const { native, config } = selected(row.claimDomain);
    const routeName = row.ticket.kind === '2' ? 'refund' : 'redeem';
    const capturedPrepared = freeze(copy(prepared)), capturedAuthorization = freeze(copy(authorization));
    const capturedTicket = freeze(copy(row.ticket)), capturedRoute = freeze(copy(row.route));
    const originalNative = row.native, runtimeClose = native.close;
    assert.equal(typeof runtimeClose, 'function', 'CLAIM_ORIGINAL_KEY_RUNTIME');
    const lease = await originalLeaseV4(authorization, 'payout');
    const evmState = freeze(copy(runtime.ingressSendState));
    assert.ok(!evmState.busy && !evmState.uncertain, 'CLAIM_ORIGINAL_KEY_EVM_FENCE');
    const token = Object.freeze({ profile: 'CLAIM_ORIGINAL_NATIVE_KEY_AUTHORITY_V4' });
    originalKeyAuthoritiesV4.set(token, { purpose: 'payout', runtimeClose, genesis: native.genesis,
      route: routeName, prepared, consume() {
        assert.equal(native.close, runtimeClose, 'CLAIM_ORIGINAL_KEY_RUNTIME');
        assert.equal(row.native, originalNative, 'CLAIM_ORIGINAL_KEY_RETAINED_IDENTITY');
        assert.deepEqual(prepared, capturedPrepared, 'CLAIM_ORIGINAL_KEY_PREPARATION_CHANGED');
        assert.deepEqual(row.native.prepared, capturedPrepared, 'CLAIM_ORIGINAL_KEY_RETAINED_PREPARATION');
        assert.deepEqual(row.ticket, capturedTicket, 'CLAIM_ORIGINAL_KEY_TICKET');
        assert.deepEqual(row.route, capturedRoute, 'CLAIM_ORIGINAL_KEY_ROUTE');
        assert.deepEqual(authorization, capturedAuthorization, 'CLAIM_ORIGINAL_KEY_AUTHORIZATION_CHANGED');
        assert.deepEqual(row.native.presignAuthorization, capturedAuthorization, 'CLAIM_ORIGINAL_KEY_RETAINED_AUTHORIZATION');
        assert.equal(row.native.status, 'SIGNING_UNKNOWN', 'CLAIM_ORIGINAL_KEY_PHASE');
        assert.deepEqual(runtime.ingressSendState, evmState, 'CLAIM_ORIGINAL_KEY_EVM_CHANGED');
        live(); assertIngressKeeperLive();
        lease.assertBeforeKey();
        return lease.auditStarted;
      } });
    return token;
  }
  function splPayoutPreparation(row) {
    const {native,config}=selected(row.claimDomain);assertOwnedSolanaSplCustodyV1(native);
    const name=row.ticket.kind==='2'?'refund':'redeem',originalTicket=freeze(copy(row.ticket)),originalNative=row.native;
    const originalKey=row.key,originalSalt=row.salt;let finalized=false;
    const token=Object.freeze(Object.create(null));splPayoutPreparations.set(token,{native,route:name,async consume(request){
      live();assertIngressKeeperLive();assert.equal(row.native,originalNative);assert.equal(row.native.status,'ATTEMPT_STARTED');
      assert.deepEqual(row.ticket,originalTicket);assert.equal(row.key,originalKey);assert.equal(row.salt,originalSalt);
      exactRecord(request,['amount','wireKeyCommitment']);assert.equal(request.amount,originalTicket.amount);assert.equal(request.wireKeyCommitment,originalKey);
      const started=performance.now(),state=await view(row.claimDomain),current=state.gateway.tickets.find(v=>v.ticket.id===row.id);
      assert.equal(current?.state,'1');assert.deepEqual(current.ticket,originalTicket);await observer.assertCurrent(state.snapshot);
      const endpointBytes=native.roles[name==='refund'?'depositor':'recipient'].endpoint;
      const construct=fee=>{
        assert.ok(claimUint(fee)>0n&&claimUint(fee)<=claimUint(originalTicket.maxFee),'CLAIM_SPL_ACTUAL_FEE_BOUND');
        const routeValue={endpoint:endpointBytes,salt:originalSalt,quotedFee:fee,selectedInputValue:'0',changeFloor:'0',destinationFunded:true};
        assert.equal(destination(row.claimDomain,endpointBytes,originalTicket.amount,originalTicket.maxFee,originalSalt),originalTicket.destinationCommitment);
        const action=terms(state,{action:A.BEGIN_PAYOUT,operationId:row.id,revision:'1',amount:originalTicket.amount,
          destinationCommitment:originalTicket.destinationCommitment,maxFee:originalTicket.maxFee,routeCommitment:claimRouteCommitment(routeValue)});
        assert.equal(action.wireBindingCommitment,ZERO);
        return {config,action,routeCommitment:action.routeCommitment,destinationSalt:originalSalt,started};
      };
      return Object.freeze({...construct(originalTicket.maxFee),async withQuotedFee(fee){
        assert.equal(finalized,false,'CLAIM_SPL_ACTUAL_QUOTE_ONCE');finalized=true;
        live();assertIngressKeeperLive();assert.equal(row.native,originalNative);assert.deepEqual(row.ticket,originalTicket);
        await observer.assertCurrent(state.snapshot);
        assert.ok(performance.now()-started>=0&&performance.now()-started<30000,'CLAIM_SPL_ORIGINAL_PREPARATION_TOO_OLD');
        return freeze(construct(fee));
      }});
    }});return token;
  }
  function splBeginAuthority(row,prepared,permit,action,receipt,signing) {
    const {native,config}=selected(row.claimDomain);assertOwnedSolanaSplCustodyV1(native);
    const origin=authorizationOrigins.get(permit.authorization),captured=freeze(copy(permit));
    assert.ok(origin&&origin.result===permit&&origin.dispatch,'CLAIM_SPL_ORIGINAL_BEGIN_DISPATCH');
    assert.equal(origin.method,'backing');assert.equal(origin.request.terms.action,A.BEGIN_PAYOUT);
    assert.deepEqual(origin.request.terms,action);assert.deepEqual(action,prepared.intent.action);
    assert.equal(receipt.method,'beginPayout');assert.equal(receipt.operationId,row.id);assert.equal(receipt.status,'SUCCEEDED');assert.equal(receipt.receipt?.status,'0x1');
    const capturedTicket=freeze(copy(row.ticket)),evmFence=freeze(copy(runtime.ingressSendState)),nativeIdentity=row.native;
    const check=async()=>{
      live();assertIngressKeeperLive();assert.equal(row.native,nativeIdentity);assert.deepEqual(row.ticket,capturedTicket);assert.deepEqual(row.native.prepared,prepared);
      assert.deepEqual(permit,captured);assert.deepEqual(origin.captured,captured);assert.deepEqual(runtime.ingressSendState,evmFence);
      const current=signing.gateway.tickets.find(v=>v.ticket.id===row.id);assert.equal(current?.state,'2');assert.deepEqual(current.ticket,capturedTicket);
      assert.equal(signing.gateway.activePayout,row.id);assert.equal(current.payoutRouteCommitment,action.routeCommitment);
      await observer.assertCurrent(signing.snapshot);
      const now=claimUint(signing.snapshot.head.timestamp);assert.ok(claimUint(permit.message.validFrom)<=now&&now<claimUint(permit.message.validUntil),'CLAIM_SPL_ORIGINAL_BEGIN_EXPIRED');
      const age=performance.now()-authorizationStarts.get(permit.authorization);assert.ok(Number.isFinite(age)&&age>=0&&age<30000,'CLAIM_SPL_ORIGINAL_BEGIN_TOO_OLD');
    };
    const token=Object.freeze(Object.create(null));splBegins.set(token,{native,prepared,async consume(){await check();
      return Object.freeze({config:freeze(copy(config)),action:freeze(copy(action)),head:freeze(copy(signing.snapshot.head)),
        permit:freeze({message:copy(permit.message),indexes:copy(permit.indexes),signatures:copy(permit.signatures)}),assertCurrent:check});
    }});return token;
  }
  function splIngressKey(row,prepared,authorization,started) {
    const {native}=selected(row.claimDomain);assertOwnedSolanaSplCustodyV1(native);
    const originalNative=row.native,preparedCopy=freeze(copy(prepared)),captured=freeze(copy(authorization)),evmFence=freeze(copy(runtime.ingressSendState));
    const token=Object.freeze(Object.create(null));originalKeyAuthoritiesV4.set(token,{purpose:'ingress',runtimeClose:native.close,genesis:native.genesis,route:'deposit',prepared,
      consume(){live();assertIngressKeeperLive();assert.equal(row.native,originalNative);assert.equal(row.native.status,'SIGNING_UNKNOWN');
        assert.deepEqual(prepared,preparedCopy);assert.deepEqual(row.native.prepared,preparedCopy);assert.deepEqual(authorization,captured);assert.deepEqual(row.native.presignAuthorization,captured);
        assert.deepEqual(runtime.ingressSendState,evmFence);assert.ok(!evmFence.busy&&!evmFence.uncertain);
        const age=performance.now()-started;assert.ok(Number.isFinite(age)&&age>=0&&age<30000,'CLAIM_PRESIGN_AUDIT_TOO_OLD');return started;
      }});return token;
  }
  // V1 ingress keeps its original presign + all-four reservation + INCLUDED
  // EVM permit order. This opaque bridge adds exact one-send continuation; it
  // does not claim the separate durable-nonce V3 broadcast codec.
  async function splIngressSend(row,prepared,permit,confirmed) {
    const {native}=selected(row.claimDomain);assertOwnedSolanaSplCustodyV1(native);
    const binding=row.native.binding,capturedBinding=freeze(copy(binding)),capturedPrepared=freeze(copy(prepared)),originalNative=row.native;
    const started=authorizationStarts.get(permit.authorization),capturedPermit=freeze(copy(permit)),evmFence=freeze(copy(runtime.ingressSendState));
    const originals=native.transfers.filter(r=>r.nativeId===binding.request.nativeId);assert.equal(originals.length,1);const record=freeze(copy(originals[0]));
    assert.equal(record.phase,'SIGNED_NOT_BROADCAST');assert.equal(record.broadcastAttempts,0);assert.equal(record.nativeWire,binding.nativeWire);
    assert.equal(record.transactionSHA256,binding.transactionSHA256);assert.deepEqual(record.intent,prepared.intent);
    await observer.assertCurrent(confirmed.snapshot);await observer.assertUnrevoked({claimDomain:binding.claimDomain,nativeGid:binding.nativeGid},confirmed.snapshot);
    const check=phase=>{
      live();assertIngressKeeperLive();assert.equal(row.native,originalNative);assert.equal(row.native.status,'RESERVED_BEFORE_BROADCAST');
      assert.deepEqual(row.native.binding,capturedBinding);assert.deepEqual(row.native.prepared,capturedPrepared);assert.deepEqual(prepared,capturedPrepared);
      assert.deepEqual(permit,capturedPermit);assert.deepEqual(runtime.ingressSendState,evmFence);assert.ok(!evmFence.busy&&!evmFence.uncertain);
      const current=native.transfers.filter(r=>r.nativeId===binding.request.nativeId);assert.equal(current.length,1);
      for(const name of ['nativeId','nativeWire','transactionSHA256','route'])assert.equal(current[0][name],record[name]);
      assert.deepEqual(current[0].intent,prepared.intent);assert.equal(current[0].phase,phase);assert.equal(current[0].broadcastAttempts,phase==='SIGNED_NOT_BROADCAST'?0:1);
      assert.equal(current[0].externalSubmissionObserved,false);
      const age=performance.now()-started;assert.ok(Number.isFinite(age)&&age>=0&&age<30000,'CLAIM_SPL_ORIGINAL_RESERVATION_TOO_OLD');
      const now=claimUint(confirmed.snapshot.head.timestamp);assert.ok(claimUint(permit.message.validFrom)<=now&&now<claimUint(permit.message.validUntil),'CLAIM_SPL_ORIGINAL_RESERVATION_EXPIRED');
    };
    check('SIGNED_NOT_BROADCAST');let entered=false,ready=false,used=false;let otherFence;
    const token=Object.freeze(Object.create(null));splIngressSends.set(token,{native,prepared,record,open(){check('SIGNED_NOT_BROADCAST');otherFence=otherNativeStateFence(native);
      return Object.freeze({async beforeSend(value){assert.equal(value,prepared);assert.equal(entered,false);entered=true;check('BROADCAST_UNKNOWN');
        await observer.assertCurrent(confirmed.snapshot);const reservation=assertCanonicalClaimReservation(binding,await observer.readReservation({claimDomain:binding.claimDomain,admissionN:binding.admissionN},confirmed.snapshot));assert.equal(reservation.consumed,false);
        await observer.assertUnrevoked({claimDomain:binding.claimDomain,nativeGid:binding.nativeGid},confirmed.snapshot);await observer.assertCurrent(confirmed.snapshot);check('BROADCAST_UNKNOWN');ready=true;
      },assertBeforeSend(value){assert.equal(value,prepared);assert.ok(entered&&ready&&!used);used=true;check('BROADCAST_UNKNOWN');otherFence();}});
    }});return token;
  }
  async function serial(work, { readOrReconcile = false } = {}) { live(); beginAuditOwner?.assertOpen(); assert.ok(!busy, 'CLAIM_CONTROLLER_BUSY');
    assert.ok(readOrReconcile || !journal.requiresReconciliation?.(), 'CLAIM_KEEPER_RECONCILIATION_REQUIRED'); busy = true;
    try {
      await journal.read();
      if (!readOrReconcile) {
        // Reconcile the sole original EVM effect before advancing the observed
        // receiver. New consent uses that fresh head; an existing signed call,
        // proof, authorization and its 30-second window are never rewritten.
        await clearUnknown();
        await refreshNativeValueReceiverClock(runtime);
      }
      return await work();
    } finally { beginAuditOwner?.finish(); busy = false; } }
  function selected(domain) {
    bytes32(domain, true); const i = claims.configs.findIndex(c => claimDomainCommitment(c) === domain);
    assert.ok(i >= 0, 'CLAIM_CONTROLLER_DOMAIN');
    return { i, config: claims.configs[i], native: claims.nativeRuntimes[i], gateway: claims.gateways[i], policy: claims.policies[i] };
  }
  async function view(domain) { const snapshot = await observer.read(), gateway = snapshot.gateways.find(g => g.claimDomain === domain);
    assert.ok(gateway, 'CLAIM_CURRENT_DOMAIN'); return { snapshot, gateway }; }
  async function assertAuthorizationSnapshot(snapshot, head, label = 'CLAIM_AUTHORIZATION_HEAD_CHANGED') {
    // Revalidate the original immutable owned reconstruction, never a copy or
    // a replacement head. Native observations are freshly audited by quorum.
    assert.deepEqual(snapshot.head, head, label);
    await observer.assertCurrent(snapshot);
  }
  function validatePacket(packet) {
    return (packet.profile===deviceRootProfile?validateRetainedDeviceRootClaimPacketV2:packet.profile===PRIVATE_CI51_PROFILE_V2?validateRetainedPrivateClaimPacketV2:validateRetainedClaimPacket)(packet, { config: selected(packet.claimDomain).config, ingressProverIdentity });
  }
  async function deposit(id) { bytes32(id, true); const row = (await journal.read()).deposits.find(v => v.id === id);
    assert.ok(row, 'CLAIM_UNKNOWN_DEPOSIT'); validatePacket(row.packet); return row; }
  async function ticket(id) { bytes32(id, true); const row = (await journal.read()).tickets.find(v => v.id === id); assert.ok(row, 'CLAIM_UNKNOWN_TICKET'); return row; }
  async function saveRow(collection, row) { await journal.update(data => { const i = data[collection].findIndex(v => v.id === row.id);
    assert.ok(i >= 0); data[collection][i] = copy(row); return data; }); }
  async function retainFailure(error, work) {
    // The first uncertain write is the actionable failure. A poisoned keeper
    // cannot acknowledge more bookkeeping and must never mask that cause.
    if (keeper.status().uncertain) throw error;
    try { return await work(); }
    catch (secondary) { if (keeper.status().uncertain) throw error; throw secondary; }
  }
  function terms(state, raw) { return { nullifier: ZERO, wireBindingCommitment: ZERO, routeCommitment: ZERO,
    ...raw, claimSequence: state.gateway.claimSequence, hubSequence: state.snapshot.hubStateSequence }; }
  function handoffPacket(handoff, domain) {
    const mobile=deviceRootClaimHandoffs.get(handoff);if(mobile){assert.equal(mobile.controller,controller,'CLAIM_DEVICE_ROOT_ORIGINAL_CONTROLLER');live();assert.ok(!mobile.closed(),'CLAIM_DEVICE_ROOT_INTAKE_CLOSED');const p=handoff.select();if(domain)assert.equal(p.claimDomain,domain);assert.equal(usesIngressV3,false,'CLAIM_DEVICE_ROOT_ORIGINAL_CI51_ONLY');return validatePacket(p);}
    let privateHolder=false;
    try{assertOwnedPrivateNativeClaimIngressHandoffV2(handoff,{...(domain?{claimDomain:domain}:{}),ingressProverIdentity});privateHolder=true;}
    catch{assertOwnedNativeClaimIngressHandoff(handoff,{...(domain?{claimDomain:domain}:{}),ingressProverIdentity});}
    const p = copy(handoff.select()), { config } = selected(p.claimDomain);
    if(privateHolder){assert.equal(p.profile,PRIVATE_CI51_PROFILE_V2,'CLAIM_PRIVATE_CI51_HANDOFF');assert.equal(usesIngressV3,false,'CLAIM_PRIVATE_CI51_ORIGINAL_V1_ONLY');return validatePacket(p);}
    assert.equal(p.statement.scope, config.scope); assert.equal(p.statement.policy, config.policy);
    assert.deepEqual(p.proofResult.publicInputs, [...encodeDepositIntentInputs(p.statement)], 'CLAIM_EXACT_D27_INPUTS');
    const o = p.opening; exactRecord(o, ['rho', 'x', 'y', 'value', 'noteSecret']); bytes32(o.noteSecret, true);
    assert.equal(o.value, p.statement.amount); assert.ok(claimUint(o.value) > 0n);
    assert.equal(balanceCommitment(config.scope, config.policy, { type: 4, rho: o.rho, x: o.x, y: o.y,
      value: o.value, secret: o.noteSecret }).toString('hex'), p.statement.output, 'CLAIM_ORIGINAL_NOTE');
    return validatePacket(p);
  }
  function assertOriginalIntent(row, current) {
    assert.ok(current && current.state === '1', 'CLAIM_ACTIVE_INTENT_REQUIRED');
    for (const [a, b] of [['output', 'output'], ['amount', 'amount'], ['validFrom', 'validFrom'], ['validUntil', 'validUntil']])
      assert.equal(current[a], row.packet.statement[b], 'CLAIM_CANONICAL_ORIGINAL_D27');
    assert.equal(current.proofHash, claimHash(Buffer.from(row.packet.proofResult.proof, 'hex')), 'CLAIM_CANONICAL_D27_PROOF');
  }
  async function updateEvm(id, change) { await journal.update(data => { const row = data.evm.find(v => v.id === id); assert.ok(row); Object.assign(row, copy(change)); return data; }); }
  async function resolveEvm(row, { fresh = false } = {}) {
    if (terminal(row.status) && (!fresh || row.status === 'REJECTED_NO_KEY')) return row;
    const original = originalClaimEvmRecord(row, runtime.transactions);
    const signed = row.signed ?? (original?.signed ? copy(original.signed) : null);
    if (!signed) return row;
    const owned = await runtime.signedTransaction(signed.nativeId); assert.deepEqual(owned, signed, 'CLAIM_EVM_RETAINED_WIRE');
    assertSignedEvmTransaction(signed.nativeWire, original.prepared.transaction);
    const receipt = await runtime.receipt(signed.nativeId), transaction = await runtime.transaction(signed.nativeId);
    if (!receipt || !transaction) { await updateEvm(row.id, { signed, status: 'UNKNOWN' }); return { ...row, signed, status: 'UNKNOWN' }; }
    assert.equal(hashCalldata(transaction.input), row.calldataSHA256); assert.equal(transaction.to, row.transaction.to);
    assert.equal(transaction.from, row.transaction.from); await runtime.checkReceipt(receipt); await runtime.assertCanonical(receipt);
    if (runtime.mutationStatus.uncertain && original.phase === 'uncertain-no-resend'
      && original.uncertaintyCause === 'original-signed-broadcast')
      await runtime.reconcileSignedTransaction(signed.nativeId);
    const status = receipt.status === '0x1' ? 'SUCCEEDED' : 'REVERTED';
    await updateEvm(row.id, { signed, receipt, status }); return { ...row, signed, receipt, status };
  }
  async function clearUnknown() {
    for (const row of (await journal.read()).evm.filter(v => !terminal(v.status))) {
      const resolved = await resolveEvm(row); assert.ok(terminal(resolved.status), 'CLAIM_UNKNOWN_EVM_RECONCILE_ORIGINAL_ONLY');
    }
  }
  async function authorizationView(domain) {
    // A native prepare/sign/retain or a genuine proof can outlive the head at
    // serial admission. Advance only before constructing a NEW authorization
    // snapshot; existing signed calls and their original windows stay intact.
    await clearUnknown();
    await refreshNativeValueReceiverClock(runtime);
    return view(domain);
  }
  async function evm({ domain, operationId, stage, method, args, snapshot, handoff = null, caller = runtime.accounts[0] }) {
    await clearUnknown(); live(); const { gateway } = selected(domain);
    const calldata = encodeControllerClaimCall(gateway.artifact, method, args), calldataSHA256 = hashCalldata(calldata);
    assert.ok(runtime.accounts.includes(caller), 'CLAIM_OWNED_EVM_CALLER');
    const transaction = { from: caller, to: gateway.address, data: calldata, gas: '0x' + BigInt(LOCAL_EVM_PROFILE.maxGas).toString(16), value: '0x0' };
    const id = randomBytes(32).toString('hex');
    const authorization = args.find(value => value && typeof value === 'object' && authorizationStarts.has(value));
    const started = authorization ? authorizationStarts.get(authorization) : performance.now();
    const original = authorization && authorizationOrigins.get(authorization);
    // Missing/copied authorization arguments cannot downgrade a signed call to
    // the legacy non-quorum deadline. Only renewal has no quorum certificate.
    assert.equal(Boolean(original), method !== 'renewIntent', 'CLAIM_EVM_ORIGINAL_AUTHORIZATION_REQUIRED');
    if (original) {
      assert.equal(original.dispatch, null, 'CLAIM_EVM_ORIGINAL_AUTHORIZATION_ALREADY_USED');
      assert.equal(original.request.claimDomain, domain, 'CLAIM_EVM_ORIGINAL_AUTHORIZATION_DOMAIN');
      if (method === 'voidDeposit' || method === 'discharge') {
        assert.equal(original.method, 'health'); assert.equal(original.request.mode, 'debt');
      } else {
        assert.equal(original.method, method === 'reserveSignedEffect' ? 'reservation' : 'backing');
        assert.equal(original.request.terms.operationId, operationId, 'CLAIM_EVM_ORIGINAL_AUTHORIZATION_OPERATION');
        assert.ok(method === 'reserveSignedEffect'
          ? [A.RESERVE_INGRESS, A.RESERVE_PAYOUT].includes(original.request.terms.action)
          : original.request.terms.action === BACKING_ACTIONS[method], 'CLAIM_EVM_ORIGINAL_AUTHORIZATION_ACTION');
      }
      assert.deepEqual(original.captured.head, snapshot.head, 'CLAIM_EVM_ORIGINAL_AUTHORIZATION_HEAD');
    }
    // Route by the immutable genuine request purpose, never by a caller's
    // result profile flag. Unrelated ingress retains its established V2 audit.
    const v4Original = original && (original.method === 'health'
      || original.method === 'backing' && [A.REDEEM, A.BEGIN_PAYOUT].includes(original.request.terms.action)
      || original.method === 'reservation' && original.request.terms.action === A.RESERVE_PAYOUT);
    const capturedArgs = freeze(copy(args)), windows = executionWindows(method, capturedArgs, original);
    await journal.update(data => { assert.ok(data.evm.length < 256, 'CLAIM_EVM_HISTORY_LIMIT');
      data.evm.push({ id, domain, operationId, stage, method, calldataSHA256, transaction: compactClaimEvmRequest(transaction),
        status: 'PREPARING', prepared: null, signed: null, receipt: null }); return data; });
    const token = Object.freeze(Object.create(null)); let active = true, keyUsePermitted = false, guardEntered = false, lease, finalAuditEvidence;
    if (original) original.dispatch = token;
    const assertLive = () => { live(); assert.ok(active, 'CLAIM_EVM_CALL_INACTIVE'); };
    const assertKeeperLive = () => { const status = keeper.status();
      assert.ok(!status.closed && !status.uncertain && status.controllerOpen === true, 'CLAIM_EVM_KEEPER_UNAVAILABLE'); };
    dispatchTokens.set(token, { opened: false, scope: { runtime, transaction: freeze(copy(transaction)), assertLive,
      async beforeSign(prepared) {
        assertLive(); assertKeeperLive();
        assert.equal(guardEntered, false, 'CLAIM_EVM_FINAL_GUARD_ALREADY_USED'); guardEntered = true;
        const capturedPrepared = freeze(copy(prepared)), compactPrepared = compactClaimEvmPreparation(capturedPrepared);
        const assertBinding = () => {
          assert.deepEqual(copy(prepared), capturedPrepared, 'CLAIM_EVM_PREPARATION_CHANGED');
          assert.deepEqual(copy(args), capturedArgs, 'CLAIM_EVM_CALL_ARGUMENTS_CHANGED');
          assert.deepEqual(exactPreparedHead(capturedPrepared), snapshot.head, 'CLAIM_EVM_PREPARED_HEAD_CHANGED');
          assert.equal(capturedPrepared.genesis, runtime.metadata.evmGenesis, 'CLAIM_EVM_PREPARED_GENESIS');
          for (const [field, expected] of Object.entries({ data: calldata, to: gateway.address, from: caller,
            gas: BigInt(transaction.gas).toString(), value: '0', chainId: runtime.metadata.chainId }))
            assert.equal(capturedPrepared.transaction[field], expected, 'CLAIM_EVM_PREPARED_INTENT');
          if (original) {
            assert.equal(original.dispatch, token, 'CLAIM_EVM_FINAL_AUDIT_DISPATCH');
            assert.equal(original.result.authorization ?? original.result.abiSignatures, authorization, 'CLAIM_EVM_ORIGINAL_AUTHORIZATION_IDENTITY');
            assert.deepEqual(copy(original.result), original.captured, 'CLAIM_EVM_ORIGINAL_AUTHORIZATION_CHANGED');
            assert.deepEqual(original.captured.head, snapshot.head, 'CLAIM_EVM_ORIGINAL_AUTHORIZATION_HEAD');
          }
          assertExecutionWindows(windows, snapshot.head, runtime);
        };
        assertBinding();
        const describeAudit = () => ({ profile: v4Original ? FINAL_AUDIT_PROFILE : 'CLAIM_EVM_ORIGINAL_CERTIFICATE_FINAL_AUDIT_V2',
          phase: 'REVALIDATED_BEFORE_FINAL_CHECKS',
          originalAuthorizationSHA256: claimHash(Buffer.from(JSON.stringify(original.captured))),
          preparedSHA256: claimHash(Buffer.from(JSON.stringify(capturedPrepared))),
          originalAuthorizationAgeMilliseconds: elapsedEvidence(started),
          auditElapsedMilliseconds: elapsedEvidence(lease.auditStarted), limitMilliseconds: 30_000 });
        if (original && !v4Original) {
          // Preserve the original V2 ingress order and deadline, including its
          // durable write and current-head check within the same audit scope.
          const auditStarted = performance.now(); let consumed = false;
          assert.equal(await quorum.assertOriginalAuthorizationCurrent(original.result), undefined, 'CLAIM_EVM_FINAL_AUDIT_ASSERT_ONLY');
          lease = Object.freeze({ auditStarted, assertBeforeKey() {
            assert.equal(consumed, false, 'CLAIM_EVM_FINAL_AUDIT_LEASE_REQUIRED'); consumed = true;
            const elapsed = performance.now() - auditStarted;
            assert.ok(Number.isFinite(elapsed) && elapsed >= 0 && elapsed < 30_000, 'CLAIM_EVM_FINAL_AUDIT_TOO_OLD');
          } });
          finalAuditEvidence = describeAudit(); retainFinalAuditTiming(finalAuditEvidence);
        }
        await updateEvm(id, { status: 'SIGNING_UNKNOWN', prepared: compactPrepared,
          ...(finalAuditEvidence ? { finalAudit: finalAuditEvidence } : {}) });
        await observer.assertCurrent(snapshot);
        assertBinding(); assertLive(); assertKeeperLive();
        if (v4Original) {
          // Complete persistence precedes this independent fresh all-signer
          // validation of the exact original signatures, head and bounds.
          lease = await originalLeaseV4(original.result, original.method);
          finalAuditEvidence = describeAudit(); retainFinalAuditTiming(finalAuditEvidence);
        }
        const keyToken = Object.freeze({ profile: 'CLAIM_ORIGINAL_EVM_KEY_AUTHORITY_V4' });
        originalKeyAuthoritiesV4.set(keyToken, { purpose: 'evm', runtimeClose: runtime.close,
          genesis: runtime.metadata.evmGenesis, route: method, prepared, consume() {
            assertBinding(); assertLive(); assertKeeperLive();
            if (original) {
              lease.assertBeforeKey();
              finalAuditEvidence = { ...finalAuditEvidence, phase: 'CONSUMED_BEFORE_KEY',
                originalAuthorizationAgeMilliseconds: elapsedEvidence(started),
                auditElapsedMilliseconds: elapsedEvidence(lease.auditStarted) };
              retainFinalAuditTiming(finalAuditEvidence);
            } else assert.ok(performance.now() - started < 30_000, 'CLAIM_EVM_AUTHORIZATION_TOO_OLD');
            keyUsePermitted = true;
            return original ? lease.auditStarted : started;
          } });
        return keyToken;
      },
      consumeBeforeKey(keyToken, prepared) {
        return consumeNativeClaimOriginalKeyAuthorityV4(keyToken, 'evm', runtime.close, runtime.metadata.evmGenesis, method, prepared);
      },
      async onSigned(signed) {
        assertLive(); const retained = (await journal.read()).evm.find(v => v.id === id);
        const original = originalClaimEvmRecord(retained, runtime.transactions);
        assert.ok(original, 'CLAIM_EVM_ORIGINAL_RUNTIME_REQUIRED');
        assertSignedEvmTransaction(signed.nativeWire, original.prepared.transaction);
        assert.deepEqual(signed, original.signed, 'CLAIM_EVM_ORIGINAL_SIGNED_WIRE');
        await updateEvm(id, { signed, status: 'SIGNED_UNKNOWN', ...(finalAuditEvidence ? { finalAudit: finalAuditEvidence } : {}) });
        // Original D27 was already prepositioned. The owner may be offline;
        // its child is never an issuance/broadcast availability dependency.
        // The exact signed submission stays encrypted here for later owner
        // binding and canonical receipt reconciliation.
      },
    } });
    try { await runtime.dispatch(await createClaimEvmDispatchRequest(token)); }
    catch (error) {
      const resolved = await retainFailure(error, async () => {
        const record = error?.transactionRecord;
        if (!keyUsePermitted || record?.phase === 'pre-sign-rejected') await updateEvm(id, { status: 'REJECTED_NO_KEY' });
        else await updateEvm(id, { status: 'UNKNOWN' });
        return resolveEvm((await journal.read()).evm.find(v => v.id === id));
      });
      if (resolved.status !== 'SUCCEEDED') throw error;
    } finally { active = false; dispatchTokens.delete(token); }
    const result = await resolveEvm((await journal.read()).evm.find(v => v.id === id));
    assert.equal(result.status, 'SUCCEEDED', 'CLAIM_EVM_ORIGINAL_NOT_SUCCESSFUL');
    return result;
  }
  function endpoint(config, value) { return nativeClaimEndpointCommitment({ family: config.nativeFamily, genesis: config.nativeGenesis, asset: config.nativeAsset, endpoint: value }); }
  function destination(domain, endpointBytes, amount, maxFee, salt) { const { config, policy } = selected(domain);
    return claimDestinationCommitment({ claimDomain: domain, nativeChainDomain: nativeAdmissionChainDomain(policy.rule), endpoint: endpoint(config, endpointBytes), amount, maxFee, salt }); }
  async function route(domain, name, amount, maxFee, salt, prepared = null) {
    const { config, native } = selected(domain), inventory = await native.inventory(), btc = config.nativeFamily === '1';
    const endpointBytes = native.roles[name === 'refund' ? 'depositor' : 'recipient'].endpoint;
    const fee = prepared ? btc ? prepared.intent.feeSatoshi : prepared.funds.feeLamports : maxFee;
    let selectedInputValue = '0';
    if (btc) { selectedInputValue = prepared?.intent.sourceSatoshi ?? inventory.escrow.utxos.find(c => c.spendable && c.solvable && c.safe
      && !c.locked && BigInt(c.confirmations) >= (c.coinbase ? 101n : 6n) && BigInt(c.amount) >= BigInt(amount) + BigInt(maxFee) + 1000n)?.amount;
      assert.ok(selectedInputValue, 'CLAIM_NO_DELIVERABLE_UTXO'); }
    const value = { endpoint: endpointBytes, salt, quotedFee: fee, selectedInputValue, changeFloor: btc ? '1000' : '0', destinationFunded: !btc };
    if (!prepared) assertClaimRoute({ config, claimDomain: domain, amount, destinationCommitment: destination(domain, endpointBytes, amount, maxFee, salt), maxFee, route: value, inventory, roles: native.roles });
    return value;
  }
  async function reserveNative(row, collection, prepared, signed) {
    const { config, native } = selected(row.claimDomain), ingress = collection === 'deposits';
    const decoded = config.nativeFamily === '1' ? validateBitcoinBinding(signed.nativeWire, prepared.intent)
      : isOwnedSolanaSplCustodyV1(native)?validateNativeSplClaimBindingTransactionV1(signed.nativeWire,prepared.intent):validateClaimSolanaBindingTransaction(signed.nativeWire, prepared.intent);
    const nativeId = config.nativeFamily === '1' ? decoded.txid : decoded.signatureHex;
    const actual = native.transfers.find(v => nativeIdOf(v, config.nativeFamily) === nativeId);
    assert.ok(actual); assert.equal(wireOf(actual, config.nativeFamily), signed.nativeWire, 'CLAIM_OWNED_NATIVE_WIRE');
    const state = await view(row.claimDomain), current = ingress ? state.gateway.intents.find(v => v.id === row.id) : null;
    const binding = createClaimReservationBinding({ claimDomain: row.claimDomain, gateway: config.gateway, ledgerNamespace: config.ledgerNamespace,
      genesis: config.nativeGenesis, asset: config.nativeAsset, operationId: row.id, revision: ingress ? current.revision : '1', ingress,
      receiptSecret: row.secret, wireSalt: row.native.wireSalt, nativeWire: signed.nativeWire, intent: prepared.intent,
      request: { family: config.nativeFamily, recipientIndex: String(actual.recipientIndex), nativeId, wireKeyCommitment: row.key } });
    row.native = { ...row.native, status: 'SIGNED_UNRESERVED', nativeId, signed: copy(signed), binding }; await saveRow(collection, row);
    const requests = { claimDomain: row.claimDomain, operationId: row.id, receiptSecret: row.secret, wireSalt: row.native.wireSalt, nativeId };
    const retained = [];
    // All four peers retain the private binding, including the spare peer.
    if (ingress && isOwnedSolanaSplCustodyV1(native)) {
      // Each original peer retains into its own journal/CAS. No key, native
      // inventory or sibling receipt participates in this operation. Drain all
      // four before checking equality or beginning the reservation authority.
      const outcomes = await Promise.allSettled(operators.map(op =>
        Promise.resolve().then(() => op.retainSignedEffect(requests))));
      const failed = outcomes.find(outcome => outcome.status === 'rejected');
      if (failed) throw failed.reason;
      retained.push(...outcomes.map(outcome => outcome.value));
    } else {
      for (const op of operators) retained.push(await op.retainSignedEffect(requests));
    }
    retained.forEach(v => assert.deepEqual(v, retained[0], 'CLAIM_ALL_FOUR_BINDINGS_DISAGREE'));
    const fresh = await authorizationView(row.claimDomain), t = terms(fresh, { action: ingress ? A.RESERVE_INGRESS : A.RESERVE_PAYOUT,
      operationId: row.id, revision: binding.revision, amount: ingress ? row.packet.statement.amount : row.ticket.amount,
      destinationCommitment: ingress ? row.refundDestination : row.ticket.destinationCommitment,
      maxFee: ingress ? config.refundMaxFee : row.ticket.maxFee, nullifier: binding.admissionN,
      wireBindingCommitment: binding.wireBindingCommitment, routeCommitment: ingress ? ZERO : claimRouteCommitment(row.route) });
    const permit = await authorize('reservation', { claimDomain: row.claimDomain, terms: t, route: row.route, ownerAuthorization: null });
    await assertAuthorizationSnapshot(fresh.snapshot, permit.head);
    await evm({ domain: row.claimDomain, operationId: row.id, stage: 'RESERVE_SIGNED_EFFECT', method: 'reserveSignedEffect',
      args: [prefix(row.id), prefix(binding.admissionN), prefix(binding.wireBindingCommitment), prefix(ingress ? row.refundDestination : ZERO), permit.authorization], snapshot: fresh.snapshot });
    const confirmed = await view(row.claimDomain);
    assertCanonicalClaimReservation(binding, await observer.readReservation({ claimDomain: row.claimDomain, admissionN: binding.admissionN }, confirmed.snapshot));
    row.native.status = 'RESERVED_BEFORE_BROADCAST'; await saveRow(collection, row);
    if(ingress&&isOwnedSolanaSplCustodyV1(native))return splIngressSend(row,prepared,permit,confirmed);
  }
  async function retainedUnsentIngress(row, collection) {
    if (collection !== 'deposits' || !row.native?.binding) return false;
    const { native, config } = selected(row.claimDomain);
    if (native.nonceIngressProfile !== 'LIANUM_GENERIC_NATIVE_CLAIM_INGRESS_V3') return false;
    const binding = row.native.binding, originals = native.transfers.filter(r => r.nativeId === binding.request.nativeId);
    assert.equal(originals.length, 1, 'CLAIM_INGRESS_ORIGINAL_RUNTIME_MUST_SURVIVE'); const original = originals[0];
    if (original.phase !== 'SIGNED_NOT_BROADCAST' || original.broadcastAttempts !== 0) return false;
    assert.ok(['SIGNED_UNRESERVED', 'RESERVED_BEFORE_BROADCAST'].includes(row.native.status), 'CLAIM_INGRESS_UNSENT_HISTORY');
    assert.equal(row.native.signed.nativeWire, binding.nativeWire, 'CLAIM_INGRESS_ORIGINAL_SIGNED_WIRE');
    assert.equal(row.native.externalSubmissionObserved === true, false, 'CLAIM_INGRESS_EXTERNAL_SUBMISSION');
    const current = await view(row.claimDomain); assertOriginalIntent(row, current.gateway.intents.find(i => i.id === row.id));
    const reservation = assertCanonicalClaimReservation(binding, await observer.readReservation({ claimDomain: row.claimDomain,
      admissionN: binding.admissionN }, current.snapshot));
    const observation = await native.adapter({ asset: config.nativeAsset, route: 'deposit' })
      .observeReservedIngress({ nativeId: binding.request.nativeId });
    const inventory = await native.inventory();
    assertNonceIngressFirstSend({ original, prepared: row.native.prepared, binding, observation,
      currentNonce: inventory.nonceInfrastructureByAuthority.depositor.nonceAccount.durableNonce,
      explicitFirstSend: true, signingUnresolved: inventory.signingUnresolved,
      externalSubmissionObserved: original.externalSubmissionObserved });
    auditNonceIngressPreparation({ gateway: current.gateway, config, intentId: row.id, prepared: row.native.prepared,
      wireSalt: binding.wireSalt, roles: native.roles, infrastructure: native.nonceInfrastructureByAuthority,
      timestamp: current.snapshot.head.timestamp, binding, reservation });
    await observer.assertCurrent(current.snapshot);
    row.native.status = 'RESERVED_BEFORE_BROADCAST'; row.native.firstSendReady = true;
    row.status = 'AWAITING_FIRST_BROADCAST'; await saveRow(collection, row); return true;
  }
  async function authorizeIngressBroadcast(row, prepared, adapter) {
    const { native, config } = selected(row.claimDomain), binding = row.native.binding;
    assertNonceIngressDeployment(claims);
    assert.equal(row.native.status, 'RESERVED_BEFORE_BROADCAST', 'CLAIM_INGRESS_RESERVED_BEFORE_BROADCAST');
    assert.deepEqual(prepared, row.native.prepared, 'CLAIM_INGRESS_ORIGINAL_PREPARATION');
    row.native.firstSendReady = false;
    const evmState = runtime.ingressSendState;
    assert.ok(evmState && !evmState.busy && !evmState.uncertain, 'CLAIM_INGRESS_EVM_FENCE_REQUIRED');
    const assertEvmUnchanged = () => assert.deepEqual(runtime.ingressSendState, evmState, 'CLAIM_INGRESS_EVM_MUTATION_CHANGED');
    const fixed = { config, roles: native.roles, infrastructure: native.nonceInfrastructureByAuthority,
      now: () => performance.now(),
      async readOriginalPreparation() { return { prepared: row.native.prepared, binding: row.native.binding }; },
      async readCurrentView() {
        const state = await view(row.claimDomain); assertOriginalIntent(row, state.gateway.intents.find(i => i.id === row.id));
        return state.snapshot;
      },
      async readFourDurableRetentions() {
        const acknowledgments = [];
        for (const op of operators) {
          const ack = await op.retainSignedEffect({ claimDomain: row.claimDomain, operationId: row.id,
            receiptSecret: row.secret, wireSalt: binding.wireSalt, nativeId: binding.request.nativeId });
          assert.deepEqual(ack, { claimDomain: binding.claimDomain, operationId: binding.operationId, revision: binding.revision,
            admissionN: binding.admissionN, wireBindingCommitment: binding.wireBindingCommitment }, 'CLAIM_INGRESS_DURABLE_BINDING');
          acknowledgments.push({ signerIndex: op.signerIndex, binding });
        }
        return acknowledgments;
      },
      readReservation: (b, snapshot) => observer.readReservation({ claimDomain: b.claimDomain, admissionN: b.admissionN }, snapshot),
      async collectQuorum(request, head) {
        const result = await quorum.authorizeIngressBroadcast({ claimDomain: row.claimDomain, intentId: row.id,
          prepared: request.prepared, wireSalt: binding.wireSalt, nativeId: binding.request.nativeId });
        assert.deepEqual(result.head, head, 'CLAIM_INGRESS_BROADCAST_HEAD'); return result;
      },
      async persistBroadcastAuthorization(_binding, result) { row.native.broadcastAuthorization = copy(result); await saveRow('deposits', row); },
      assertCurrent: snapshot => observer.assertCurrent(snapshot),
      assertUnrevoked: (b, snapshot) => observer.assertUnrevoked({ claimDomain: b.claimDomain, nativeGid: b.nativeGid }, snapshot),
      assertPrepared: value => adapter.assertPrepared(value), assertLive: live, assertKeeperLive: assertIngressKeeperLive,
    };
    const scope = await guardIngressBroadcast(fixed, { binding, prepared });
    assertEvmUnchanged();
    const gate = createIngressFinalSendGate({ ctx: { ...fixed, assertEvmUnchanged,
      assertOriginalRetained(expectedBinding, expectedPrepared, expectedAuthorization) {
        assert.deepEqual(row.native.binding, expectedBinding, 'CLAIM_INGRESS_FINAL_BINDING_CHANGED');
        assert.deepEqual(row.native.prepared, expectedPrepared, 'CLAIM_INGRESS_FINAL_PREPARATION_CHANGED');
        assert.deepEqual(row.native.broadcastAuthorization, expectedAuthorization, 'CLAIM_INGRESS_FINAL_AUTHORIZATION_CHANGED');
        const originals = native.transfers.filter(item => item.nativeId === expectedBinding.request.nativeId);
        assert.equal(originals.length, 1, 'CLAIM_INGRESS_FINAL_ORIGINAL_RUNTIME'); const original = originals[0];
        assert.equal(original.route, 'deposit', 'CLAIM_INGRESS_FINAL_ROUTE');
        assert.equal(original.phase, 'BROADCAST_UNKNOWN', 'CLAIM_INGRESS_FINAL_LATCH_PHASE');
        assert.equal(original.broadcastAttempts, 1, 'CLAIM_INGRESS_FINAL_LATCH_COUNT');
        assert.equal(original.externalSubmissionObserved, false, 'CLAIM_INGRESS_FINAL_EXTERNAL_SUBMISSION');
        assert.equal(original.nativeWire, expectedBinding.nativeWire, 'CLAIM_INGRESS_FINAL_WIRE');
        assert.equal(original.transactionSHA256, expectedBinding.transactionSHA256, 'CLAIM_INGRESS_FINAL_WIRE_HASH');
        assert.deepEqual(original.intent, expectedPrepared.intent, 'CLAIM_INGRESS_FINAL_INTENT');
      },
    }, prepared, binding, scope });
    ingressFinalSendGuards.set(prepared, { operationId: row.id, binding, gate });
  }
  function originalIngressSendGate(row, prepared) {
    const original = ingressFinalSendGuards.get(prepared);
    assert.ok(original && original.operationId === row.id && original.binding === row.native.binding,
      'CLAIM_INGRESS_ORIGINAL_FINAL_SEND_GATE');
    return original.gate;
  }
  async function beforeIngressSend(row, prepared) {
    await originalIngressSendGate(row, prepared).beforeSend(prepared);
  }
  function assertIngressSend(row, prepared) {
    originalIngressSendGate(row, prepared).assertBeforeSend(prepared);
    ingressFinalSendGuards.delete(prepared);
  }
  async function retainedUnsentPayout(row, collection) {
    if (collection !== 'tickets' || !row.native?.binding) return false;
    const { native, config } = selected(row.claimDomain);
    if (config.nativeFamily !== '2' || !(native.nonceInfrastructure || native.nonceInfrastructureByAuthority)) return false;
    const binding = row.native.binding;
    const originals = native.transfers.filter(item => item.nativeId === binding.request.nativeId);
    assert.equal(originals.length, 1, 'CLAIM_NATIVE_RUNTIME_MUST_SURVIVE');
    const original = originals[0];
    if (original.phase !== 'SIGNED_NOT_BROADCAST' || original.broadcastAttempts !== 0) return false;
    assert.ok(['SIGNED_UNRESERVED', 'RESERVED_BEFORE_BROADCAST'].includes(row.native.status), 'CLAIM_UNSENT_HISTORY_CHANGED');
    assert.equal(original.nativeWire, binding.nativeWire, 'CLAIM_UNSENT_ORIGINAL_WIRE');
    assert.equal(row.native.signed.nativeWire, binding.nativeWire, 'CLAIM_UNSENT_SIGNED_WIRE');
    assert.deepEqual(original.intent, row.native.prepared.intent, 'CLAIM_UNSENT_PREPARATION');
    assert.equal(original.route, row.ticket.kind === '2' ? 'refund' : 'redeem', 'CLAIM_UNSENT_ORIGINAL_ROUTE');
    const current = await view(row.claimDomain);
    const ticketState = current.gateway.tickets.find(item => item.ticket.id === row.id);
    assert.ok(ticketState && ticketState.state === '2' && current.gateway.activePayout === row.id, 'CLAIM_UNSENT_CANONICAL_TICKET');
    assert.deepEqual(ticketState.ticket, row.ticket, 'CLAIM_UNSENT_TICKET_CHANGED');
    const reservation = assertCanonicalClaimReservation(binding, await observer.readReservation({
      claimDomain: row.claimDomain, admissionN: binding.admissionN }, current.snapshot));
    assert.equal(reservation.consumed, false, 'CLAIM_UNSENT_RESERVATION_CONSUMED');
    row.native.status = 'RESERVED_BEFORE_BROADCAST';
    row.status = 'AWAITING_FIRST_BROADCAST';
    await saveRow(collection, row);
    // This recovers a known unsent state, not native delivery or a fresh send
    // permit. Only an explicit payout/resume can enter the final current guard.
    return true;
  }
  async function observeNative(row, collection, waitForSolana = false) {
    assert.ok(row.native?.binding, 'CLAIM_NO_ORIGINAL_NATIVE_ID');
    const { native, config } = selected(row.claimDomain), binding = row.native.binding;
    const actual = native.transfers.find(v => nativeIdOf(v, config.nativeFamily) === binding.request.nativeId);
    assert.ok(actual, 'CLAIM_NATIVE_RUNTIME_MUST_SURVIVE'); assert.equal(wireOf(actual, config.nativeFamily), binding.nativeWire);
    const state = await view(row.claimDomain);
    assertCanonicalClaimReservation(binding, await observer.readReservation({ claimDomain: row.claimDomain, admissionN: binding.admissionN }, state.snapshot));
    const routeName = collection === 'deposits' ? 'deposit' : row.ticket.kind === '2' ? 'refund' : 'redeem';
    assert.equal(actual.route, routeName, 'CLAIM_ORIGINAL_NATIVE_ROUTE');
    // Only the owned SOL reader supports this bounded wait. It reads the exact
    // retained signature and cannot sign, replace a blockhash or broadcast.
    if (waitForSolana) {
      assert.equal(config.nativeFamily, '2', 'CLAIM_SOL_RECONCILIATION_ONLY');
      await native.observe(binding.request.nativeId, { timeoutMs: 45_000 });
    }
    const result = await native.adapter({ asset: config.nativeAsset, route: routeName }).observe({ nativeId: binding.request.nativeId });
    await observer.assertCurrent(state.snapshot);
    assertCanonicalClaimReservation(binding, await observer.readReservation({ claimDomain: row.claimDomain, admissionN: binding.admissionN }, state.snapshot));
    if (result.status !== 'observed') {
      // A raw-wire holder may have submitted this exact transaction outside
      // the owned send path. Query its signature before trusting count zero;
      // pending/adverse evidence must never authorize another first send.
      if (result.status === 'unknown' && !row.native.externalSubmissionObserved
        && (await retainedUnsentIngress(row, collection) || await retainedUnsentPayout(row, collection))) return false;
      if (['pending', 'adverse'].includes(result.status) && actual.broadcastAttempts === 0)
        row.native.externalSubmissionObserved = true;
      row.native.status = result.status === 'adverse' ? 'ADVERSE' : 'UNKNOWN';
      await saveRow(collection, row); return false;
    }
    assert.equal(result.nativeWire, binding.nativeWire); row.native.status = 'OBSERVED';
    row.status = collection === 'deposits' ? 'HELD_UNISSUED' : 'OBSERVED_AWAITING_DISCHARGE';
    await saveRow(collection, row); return true;
  }
  function bitcoinPayoutSendToken(row, adapter) {
    const { native, config } = selected(row.claimDomain);
    assert.equal(config.nativeFamily, '1', 'CLAIM_BITCOIN_SEND_FAMILY');
    assert.equal(native.payoutFinalSendProfile, 'OWNED_BITCOIN_PAYOUT_FINAL_SEND_V1', 'CLAIM_BITCOIN_FINAL_RUNTIME_PROFILE');
    const token = Object.freeze({ profile: CLAIM_BITCOIN_PAYOUT_FINAL_SEND_PROFILE });
    const routeName = row.ticket.kind === '2' ? 'refund' : 'redeem';
    let scope;
    const checkKeeper = () => { const status = keeper.status();
      assert.ok(!status.closed && !status.uncertain && status.controllerOpen === true, 'CLAIM_BITCOIN_KEEPER_UNAVAILABLE'); };
    const check = (prepared, signed, latched) => {
      assert.ok(scope, 'CLAIM_BITCOIN_ORIGINAL_SEND_SCOPE');
      assert.equal(prepared, scope.prepared, 'CLAIM_BITCOIN_ORIGINAL_PREPARATION_IDENTITY');
      assert.equal(signed, scope.signed, 'CLAIM_BITCOIN_ORIGINAL_SIGNED_IDENTITY');
      assert.deepEqual(prepared, scope.capturedPrepared, 'CLAIM_BITCOIN_PREPARATION_CHANGED');
      assert.deepEqual(signed, scope.capturedSigned, 'CLAIM_BITCOIN_SIGNED_CHANGED');
      assert.equal(row.native.binding, scope.binding, 'CLAIM_BITCOIN_ORIGINAL_BINDING_IDENTITY');
      assert.deepEqual(row.native.binding, scope.capturedBinding, 'CLAIM_BITCOIN_BINDING_CHANGED');
      assert.deepEqual(row.native.prepared, scope.capturedPrepared, 'CLAIM_BITCOIN_RETAINED_PREPARATION_CHANGED');
      assert.deepEqual(row.route, scope.route, 'CLAIM_BITCOIN_ROUTE_CHANGED');
      assert.deepEqual(row.ticket, scope.ticket, 'CLAIM_BITCOIN_TICKET_CHANGED');
      assert.equal(row.native.status, 'RESERVED_BEFORE_BROADCAST', 'CLAIM_BITCOIN_RESERVATION_STATUS');
      assert.deepEqual(row.native.bitcoinBroadcastAuthorization, scope.capturedAuthorization, 'CLAIM_BITCOIN_AUTHORIZATION_CHANGED');
      assert.deepEqual(scope.view, scope.capturedView, 'CLAIM_BITCOIN_ORIGINAL_VIEW_CHANGED');
      assert.deepEqual(scope.authorization.head, scope.view.head, 'CLAIM_BITCOIN_AUTHORIZATION_HEAD');
      claimOperators.assertOriginalBitcoinPayoutBroadcastAuthorization(quorum, scope.authorization, scope.request);
      const originals = native.transfers.filter(item => item.txid === scope.binding.request.nativeId);
      assert.equal(originals.length, 1, 'CLAIM_BITCOIN_ORIGINAL_RUNTIME'); const original = originals[0];
      assert.equal(original.route, routeName, 'CLAIM_BITCOIN_RUNTIME_ROUTE');
      assert.equal(original.phase, latched ? 'BROADCAST_UNKNOWN' : 'SIGNED_NOT_BROADCAST', 'CLAIM_BITCOIN_ORIGINAL_PHASE');
      assert.equal(original.broadcastAttempts, latched ? 1 : 0, 'CLAIM_BITCOIN_ORIGINAL_ATTEMPT');
      assert.ok(!original.adverseReason, 'CLAIM_BITCOIN_ORIGINAL_ADVERSE');
      assert.equal(original.rawTransaction, scope.binding.nativeWire, 'CLAIM_BITCOIN_ORIGINAL_WIRE');
      assert.equal(original.transactionSHA256, scope.binding.transactionSHA256, 'CLAIM_BITCOIN_ORIGINAL_WIRE_HASH');
      assert.deepEqual(original.intent, prepared.intent, 'CLAIM_BITCOIN_ORIGINAL_INTENT');
      live(); checkKeeper();
      assert.deepEqual(runtime.ingressSendState, scope.evmState, 'CLAIM_BITCOIN_EVM_MUTATION_CHANGED');
      const elapsed = performance.now() - scope.started;
      assert.ok(Number.isFinite(elapsed) && elapsed >= 0 && elapsed < 30_000, 'CLAIM_BITCOIN_FINAL_AUDIT_TOO_OLD');
    };
    bitcoinPayoutSendTokens.set(token, { native, route: routeName, entered: false, ready: false, consumed: false,
      live() { live(); checkKeeper(); },
      async authorize(prepared, signed) {
        live(); checkKeeper();
        const evmState = freeze(copy(runtime.ingressSendState));
        assert.ok(evmState && !evmState.busy && !evmState.uncertain, 'CLAIM_BITCOIN_EVM_FENCE_REQUIRED');
        assert.equal(row.native?.status, 'RESERVED_BEFORE_BROADCAST', 'CLAIM_BITCOIN_RESERVATION_REQUIRED');
        assert.deepEqual(prepared, row.native.prepared, 'CLAIM_BITCOIN_ORIGINAL_PREPARATION');
        const binding = row.native.binding;
        assert.ok(binding && !binding.ingress && binding.request.family === '1', 'CLAIM_BITCOIN_ORIGINAL_PAYOUT');
        assert.deepEqual(signed, { nativeWire: binding.nativeWire }, 'CLAIM_BITCOIN_ORIGINAL_SIGNED_WIRE');
        // RESERVE_PAYOUT mutated EVM. A new post-call owned view is mandatory;
        // neither its pre-reservation permit nor a SOL nonce certificate works.
        const fresh = await view(row.claimDomain);
        const request = freeze({ claimDomain: row.claimDomain, ticketId: row.id, prepared,
          route: copy(row.route), wireSalt: row.native.wireSalt, nativeId: binding.request.nativeId });
        const authorization = await quorum.authorizeBitcoinBroadcast(request);
        claimOperators.assertOriginalBitcoinPayoutBroadcastAuthorization(quorum, authorization, request);
        for (const name of ['admissionN', 'nativeGid', 'wireBindingCommitment'])
          assert.equal(authorization.message[name], binding[name], 'CLAIM_BITCOIN_SIGNED_BINDING');
        scope = { prepared, signed, binding, view: fresh.snapshot, authorization, request,
          capturedPrepared: freeze(copy(prepared)), capturedSigned: freeze(copy(signed)), capturedBinding: freeze(copy(binding)),
          capturedView: freeze(copy(fresh.snapshot)), capturedAuthorization: freeze(copy(authorization)),
          route: freeze(copy(row.route)), ticket: freeze(copy(row.ticket)), evmState };
        row.native.bitcoinBroadcastAuthorization = copy(authorization); await saveRow('tickets', row);
        await assertAuthorizationSnapshot(scope.view, authorization.head, 'CLAIM_BITCOIN_POST_RESERVATION_HEAD_CHANGED');
        const reservation = assertCanonicalClaimReservation(binding, await observer.readReservation({
          claimDomain: row.claimDomain, admissionN: binding.admissionN }, scope.view));
        assert.equal(reservation.consumed, false, 'CLAIM_BITCOIN_RESERVATION_CONSUMED');
        await observer.assertUnrevoked({ claimDomain: row.claimDomain, nativeGid: binding.nativeGid }, scope.view);
        // All operator queues have drained. This final owned preparation check
        // retains the exact native head/outpoint/route and original read window.
        await adapter.assertPrepared(prepared);
        // Keep the exact post-reservation head/certificate. Only a complete
        // independent all-signer validation can open the new V4 audit scope.
        await assertAuthorizationSnapshot(scope.view, authorization.head, 'CLAIM_BITCOIN_POST_RESERVATION_HEAD_CHANGED');
        scope.originalLeaseV4 = await originalLeaseV4(authorization, 'bitcoinBroadcast');
        scope.started = scope.originalLeaseV4.auditStarted;
        check(prepared, signed, false);
      },
      beforeLatch(prepared, signed) {
        check(prepared, signed, false); scope.originalLeaseV4.assertBeforeKey();
        scope.assertOtherNativeState = otherNativeStateFence(native); return scope.started;
      },
      consume(prepared, signed) {
        check(prepared, signed, true); scope.assertOtherNativeState();
        scope.originalLeaseV4.assertContinuationSourceCurrent(); return scope.started;
      },
    });
    return token;
  }
  async function authorizePayoutBroadcast(row, prepared, adapter) {
    const { native } = selected(row.claimDomain);
    assert.equal(native.payoutFinalSendProfile, 'OWNED_SOLANA_PAYOUT_AUTHORITY_LIFETIME_V2', 'CLAIM_PAYOUT_FINAL_RUNTIME_PROFILE');
    const evmState = runtime.ingressSendState;
    assert.ok(evmState && !evmState.busy && !evmState.uncertain, 'CLAIM_PAYOUT_EVM_FENCE_REQUIRED');
    const assertEvmUnchanged = () => assert.deepEqual(runtime.ingressSendState, evmState, 'CLAIM_PAYOUT_EVM_MUTATION_CHANGED');
    assert.equal(row.native?.status, 'RESERVED_BEFORE_BROADCAST', 'CLAIM_BROADCAST_RESERVATION_REQUIRED');
    assert.deepEqual(prepared, row.native.prepared, 'CLAIM_BROADCAST_ORIGINAL_PREPARATION');
    const binding = row.native.binding;
    assert.ok(binding && !binding.ingress, 'CLAIM_BROADCAST_ORIGINAL_PAYOUT');
    const fresh = await view(row.claimDomain);
    const authorization = await quorum.authorizeBroadcast({ claimDomain: row.claimDomain, ticketId: row.id,
      prepared, route: row.route, wireSalt: row.native.wireSalt, nativeId: binding.request.nativeId });
    for (const name of ['admissionN', 'nativeGid', 'wireBindingCommitment'])
      assert.equal(authorization.message[name], binding[name], 'CLAIM_BROADCAST_SIGNED_BINDING');
    row.native.broadcastAuthorization = copy(authorization);
    await saveRow('tickets', row);
    await assertAuthorizationSnapshot(fresh.snapshot, authorization.head, 'CLAIM_BROADCAST_HEAD_CHANGED');
    const reservation = assertCanonicalClaimReservation(binding, await observer.readReservation({
      claimDomain: row.claimDomain, admissionN: binding.admissionN }, fresh.snapshot));
    assert.equal(reservation.consumed, false, 'CLAIM_BROADCAST_RESERVATION_CONSUMED');
    await observer.assertUnrevoked({ claimDomain: row.claimDomain, nativeGid: binding.nativeGid }, fresh.snapshot);
    await adapter.assertPrepared(prepared);
    // Native revalidation yields. Recheck the same original EVM snapshot after
    // it, then close the final-await liveness/age gap before returning to send.
    await assertAuthorizationSnapshot(fresh.snapshot, authorization.head, 'CLAIM_BROADCAST_HEAD_CHANGED');
    live();
    // Every native read precedes the last original all-signer validation.
    // Its strict queue/state fence is never renewed after that validation.
    const originalLease = await originalLeaseV4(authorization, 'broadcast');
    const started = originalLease.auditStarted;
    assertEvmUnchanged();
    const originalRoute = freeze(copy(row.route)), originalTicket = freeze(copy(row.ticket));
    const originalNative = row.native, originalId = row.id, runtimeClose = native.close, originalGenesis = native.genesis;
    assert.equal(typeof runtimeClose, 'function', 'CLAIM_SOLANA_PAYOUT_PHYSICAL_RUNTIME_REQUIRED');
    const originalRecords = native.transfers.filter(item => item.nativeId === binding.request.nativeId);
    assert.equal(originalRecords.length, 1, 'CLAIM_PAYOUT_FINAL_ORIGINAL_RUNTIME');
    const originalRecord = freeze(copy(originalRecords[0]));
    let assertOtherNativeState;
    const gate = createPayoutFinalSendGate({ prepared, binding,
      scope: { started, view: fresh.snapshot, authorization, originalLeaseV4: originalLease },
      ctx: { now: () => performance.now(), assertLive: live, assertEvmUnchanged,
        captureOtherNativeState() { assertOtherNativeState = otherNativeStateFence(native); },
        assertOtherNativeState() { assertOtherNativeState(); },
        assertKeeperLive() { const status = keeper.status();
          assert.ok(!status.closed && !status.uncertain && status.controllerOpen === true, 'CLAIM_PAYOUT_KEEPER_UNAVAILABLE'); },
        assertCurrent: snapshot => observer.assertCurrent(snapshot),
        readReservation: (b, snapshot) => observer.readReservation({ claimDomain: b.claimDomain, admissionN: b.admissionN }, snapshot),
        assertUnrevoked: (b, snapshot) => observer.assertUnrevoked({ claimDomain: b.claimDomain, nativeGid: b.nativeGid }, snapshot),
        assertOriginalRetained(expectedBinding, expectedPrepared, expectedAuthorization, phase) {
          assert.equal(native.close, runtimeClose, 'CLAIM_SOLANA_PAYOUT_PHYSICAL_RUNTIME');
          assert.equal(native.genesis, originalGenesis, 'CLAIM_SOLANA_PAYOUT_GENESIS');
          assert.equal(row.id, originalId, 'CLAIM_PAYOUT_FINAL_TICKET_CHANGED');
          assert.deepEqual(row.ticket, originalTicket, 'CLAIM_PAYOUT_FINAL_TICKET_CHANGED');
          assert.equal(row.native, originalNative, 'CLAIM_PAYOUT_FINAL_NATIVE_IDENTITY_CHANGED');
          assert.equal(row.native.binding, binding, 'CLAIM_PAYOUT_FINAL_BINDING_IDENTITY_CHANGED');
          assert.equal(row.native.status, 'RESERVED_BEFORE_BROADCAST', 'CLAIM_PAYOUT_FINAL_RESERVATION_STATUS');
          assert.deepEqual(row.route, originalRoute, 'CLAIM_PAYOUT_FINAL_ROUTE_CHANGED');
          assert.deepEqual(row.native.binding, expectedBinding, 'CLAIM_PAYOUT_FINAL_BINDING_CHANGED');
          assert.deepEqual(row.native.prepared, expectedPrepared, 'CLAIM_PAYOUT_FINAL_PREPARATION_CHANGED');
          assert.deepEqual(row.native.broadcastAuthorization, expectedAuthorization, 'CLAIM_PAYOUT_FINAL_AUTHORIZATION_CHANGED');
          const originals = native.transfers.filter(item => item.nativeId === expectedBinding.request.nativeId);
          assert.equal(originals.length, 1, 'CLAIM_PAYOUT_FINAL_ORIGINAL_RUNTIME'); const original = originals[0];
          assert.equal(original.route, row.ticket.kind === '2' ? 'refund' : 'redeem', 'CLAIM_PAYOUT_FINAL_ROUTE');
          assert.equal(original.phase, phase, 'CLAIM_PAYOUT_FINAL_LATCH_PHASE');
          assert.equal(original.broadcastAttempts, phase === 'SIGNED_NOT_BROADCAST' ? 0 : 1, 'CLAIM_PAYOUT_FINAL_LATCH_COUNT');
          assert.equal(original.nativeWire, expectedBinding.nativeWire, 'CLAIM_PAYOUT_FINAL_WIRE');
          assert.equal(original.transactionSHA256, expectedBinding.transactionSHA256, 'CLAIM_PAYOUT_FINAL_WIRE_HASH');
          assert.deepEqual(original.intent, expectedPrepared.intent, 'CLAIM_PAYOUT_FINAL_INTENT');
        },
      } });
    const token = Object.freeze({ profile: 'CLAIM_SOLANA_ORIGINAL_PAYOUT_AUTHORITY_V2' });
    solanaPayoutAuthorities.set(token, { runtimeClose, genesis: originalGenesis, prepared, record: originalRecord, gate });
    // The token retains only this original completed authorization. It is never
    // minted by a generic callback registry, nor reconstructible from a journal.
    return token;
  }
  async function reconcileLostSolanaBroadcast(row, collection, error) {
    if (error?.message !== 'SOLANA_BROADCAST_UNKNOWN_OBSERVE_EXACT_SIGNATURE') return false;
    const { native, config } = selected(row.claimDomain), retained = row.native;
    // An error label alone conveys no authority. The keeper and original owned
    // runtime must agree on the already signed, reserved, once-sent identity.
    assert.equal(config.nativeFamily, '2', 'CLAIM_SOL_RECONCILIATION_ONLY');
    assert.ok(retained?.binding && retained.signed && retained.status === 'RESERVED_BEFORE_BROADCAST', 'CLAIM_LOST_BROADCAST_RETAINED_RESERVATION');
    const binding = retained.binding, actual = native.transfers.find(v => v.nativeId === binding.request.nativeId);
    assert.ok(actual && actual.phase === 'BROADCAST_UNKNOWN' && actual.broadcastAttempts === 1, 'CLAIM_LOST_BROADCAST_ORIGINAL_ATTEMPT');
    assert.equal(error.nativeId, binding.request.nativeId, 'CLAIM_LOST_BROADCAST_ERROR_IDENTITY');
    assert.equal(retained.nativeId, binding.request.nativeId, 'CLAIM_LOST_BROADCAST_KEEPER_IDENTITY');
    assert.equal(retained.signed.nativeWire, binding.nativeWire, 'CLAIM_LOST_BROADCAST_KEEPER_WIRE');
    assert.equal(actual.nativeWire, binding.nativeWire, 'CLAIM_LOST_BROADCAST_RUNTIME_WIRE');
    row.status = 'UNKNOWN'; row.native.broadcastOutcome = 'UNKNOWN';
    await saveRow(collection, row);
    // A finalized result is evidence, never a promise that the lost send reply
    // meant success. Pending/absent history remains UNKNOWN in the journal
    // and returns false so the caller preserves the original broadcast error.
    return observeNative(row, collection, true);
  }
  async function evidence(row, collection,privateHandoff=null) {
    assert.ok(await observeNative(row, collection), 'CLAIM_NATIVE_FINALITY_UNRESOLVED');
    const { config, policy, i } = selected(row.claimDomain), facts = await quorum.facts(row.native.binding.request);
    const flat = await readers[i].read(); assert.equal(flat.head.hash, facts.head.hash, 'CLAIM_FACTS_CURRENT_HEAD');
    const common = { config, domain: claims.flatSystem.pools[i].domain, registry: claims.flatSystem.registry, rule: policy.rule,
      rulePath: rulePaths[i], certificates: facts.certificates,
      currentRevocation: { revokedDigest: flat.state.revokedDigest, revokedCount: flat.state.revokedCount,
        revocationSequence: flat.state.revocationSequence, entries: flat.revokedEntries } };
    const ingress = collection === 'deposits', role = ingress ? 'claim_ingress' : 'claim_discharge';
    if(ingress&&row.packet.profile===deviceRootProfile){assert.equal(row.privateCI51Attempt?.phase,'COMPLETED','CLAIM_DEVICE_ROOT_CI51_REQUIRED');const prior=row.proofs?.find(p=>p.result.evidence.jobId===row.privateCI51Attempt.jobId);assert.ok(prior,'CLAIM_DEVICE_ROOT_ORIGINAL_RESULT_REQUIRED');return prior;}
    if(ingress&&row.packet.profile===PRIVATE_CI51_PROFILE_V2) {
      if(row.privateCI51Attempt){assert.equal(row.privateCI51Attempt.phase,'COMPLETED','CLAIM_PRIVATE_CI51_ORIGINAL_ATTEMPT_OBSERVE_ONLY');const prior=row.proofs?.find(p=>p.result.evidence.jobId===row.privateCI51Attempt.jobId);assert.ok(prior,'CLAIM_PRIVATE_CI51_ORIGINAL_RESULT_REQUIRED');return prior;}
      assertOwnedPrivateNativeClaimIngressHandoffV2(privateHandoff,{claimDomain:row.claimDomain,ownerIdentitySHA256:row.packet.ownerIdentitySHA256,ingressProverIdentity});assert.deepEqual(handoffPacket(privateHandoff,row.claimDomain),row.packet,'CLAIM_PRIVATE_CI51_ORIGINAL_HANDOFF');
      row.privateCI51Attempt={phase:'PREPARING'};await saveRow(collection,row);
      const client=proofClients.claim_ingress;let preparedClient=false;
      try {
        const built=await privateHandoff.prepareProof(common);exactRecord(built,['statement','expectedPublicInputs','witnessSHA256']);bytes32(built.witnessSHA256,true);assert.deepEqual(decodeClaimIngressInputs(built.expectedPublicInputs),built.statement,'CLAIM_PRIVATE_CI51_PUBLIC');
        for(const [k,v] of Object.entries({claimDomain:row.claimDomain,outputQ:row.packet.statement.output,amountQ:row.packet.statement.amount,admissionN:row.native.binding.admissionN,refundDestination:row.refundDestination}))assert.equal(built.statement[k],v,'CLAIM_PRIVATE_CI51_ORIGINAL_NATIVE_BINDING');
        row.privateCI51Attempt={phase:'PREPARED',statement:built.statement,witnessSHA256:built.witnessSHA256};await saveRow(collection,row);assertRoleProofClient(client,'claim_ingress');preparedClient=true;
        const recipient=await client.preparePrivateNativeClaimIngressV2(built.expectedPublicInputs),sealed=await privateHandoff.sealProof(recipient);exactRecord(sealed,['packet','authorization']);assert.equal(sealed.authorization.witnessSHA256,built.witnessSHA256,'CLAIM_PRIVATE_CI51_WITNESS_BINDING');assert.equal(sealed.authorization.jobId,recipient.jobId,'CLAIM_PRIVATE_CI51_JOB');
        row.privateCI51Attempt={...row.privateCI51Attempt,phase:'PROVING',jobId:recipient.jobId};await saveRow(collection,row);
        const result=await client.proveEncryptedNativeClaimIngressV2(sealed.packet,sealed.authorization);assert.deepEqual(result.publicInputs,built.expectedPublicInputs,'CLAIM_PRIVATE_CI51_ORIGINAL_PUBLIC');
        row.proofs??=[];const proof={statement:built.statement,result};row.proofs.push(proof);row.privateCI51Attempt.phase='COMPLETED';await saveRow(collection,row);return proof;
      } catch(error) {
        if(preparedClient)try{await client.closePrivateNativeClaimIngressV2();}catch{}
        row.status='UNKNOWN';row.privateCI51Attempt.phase='UNKNOWN';await retainFailure(error,()=>saveRow(collection,row));throw error;
      }
    }
    const built = await withPinnedHash(hashFields => ingress ? buildClaimIngressInputs({ ...common, noteOpening: row.packet.opening }, { hashFields })
      : buildClaimDischargeInputs({ ...common, ticket: row.ticket, destination: { endpoint: endpoint(config, row.route.endpoint), salt: row.route.salt } }, { hashFields }));
    assertRoleProofClient(proofClients[role], role);
    const result = await proofClients[role].prove({ relation: ingress ? (usesIngressV3 ? 'native_claim_ingress_v3' : 'native_claim_ingress') : 'native_claim_discharge', inputs: built.inputs, expectedPublicInputs: built.expectedPublicInputs });
    assert.deepEqual(result.publicInputs, built.expectedPublicInputs); row.proofs ??= []; row.proofs.push({ statement: built.statement, result });
    await saveRow(collection, row); return { statement: built.statement, result };
  }
  function projectDeposit(row) {
    return { intentId: row.id, claimDomain: row.claimDomain, amount: row.packet.statement.amount, status: row.status,
      assetKind: 'CUSTODIAL_NATIVE_CLAIM', nativeSelfCustody: false, spendablePrivateBalance: null,
      ...(row.issueSubmission ? { submission: copy(row.issueSubmission) } : {}) };
  }
  function projectTicket(row) { return { ticketId: row.id, claimDomain: row.claimDomain, amount: row.ticket.amount,
    kind: row.ticket.kind === '2' ? 'REFUND' : 'REDEEM', status: row.status, nativeSelfCustody: false }; }
  async function syncRow(row, collection) {
    const state = await view(row.claimDomain);
    if (collection === 'deposits') {
      validatePacket(row.packet);
      const projection = canonicalClaimDepositProjection({ ...row, refundMaxFee: selected(row.claimDomain).config.refundMaxFee }, state.gateway);
      row.status = projection.status;
      if (row.status === 'UNKNOWN' && row.native?.firstSendReady === true && row.native.status === 'RESERVED_BEFORE_BROADCAST') {
        const { native } = selected(row.claimDomain), original = native.transfers.find(t => t.nativeId === row.native.binding.request.nativeId);
        if (native.nonceIngressProfile === 'LIANUM_GENERIC_NATIVE_CLAIM_INGRESS_V3'
          && original?.phase === 'SIGNED_NOT_BROADCAST' && original.broadcastAttempts === 0
          && original.externalSubmissionObserved === false) row.status = 'AWAITING_FIRST_BROADCAST';
      }
      if (projection.refund) {
        const refund = projection.refund;
        if (!(await journal.read()).tickets.some(v => v.id === refund.ticket.id)) {
          const s = claimTicketSecret({ claimDomain: row.claimDomain, ticketId: refund.ticket.id });
          await journal.update(data => { data.tickets.push({ id: refund.ticket.id, claimDomain: row.claimDomain, ticket: copy(refund.ticket),
            secret: s, key: receiptKeyCommitment({ ledgerNamespace: selected(row.claimDomain).config.ledgerNamespace, secret: s }),
            salt: row.refundSalt, route: null, native: null, proofs: [],
            status: refund.state === '4' ? 'DISCHARGED' : 'REFUND_PENDING' }); return data; });
        }
        row.refundTicketId = refund.ticket.id;
      }
      await saveRow(collection, row); return { ...projectDeposit(row), ...(row.refundTicketId ? { ticketId: row.refundTicketId } : {}) };
    }
    const current = state.gateway.tickets.find(v => v.ticket.id === row.id);
    if (!current) {
      // A retained proposal is not a burned claim. After canonical receipt
      // reconciliation, only a definitely absent/no-key/reverted burn can be
      // retried with its exact original request, salt and expected nonce.
      assert.equal(row.ticket.kind, '1', 'CLAIM_ORIGINAL_REFUND_TICKET');
      assert.equal(row.native, null, 'CLAIM_MISSING_TICKET_WITH_NATIVE_ATTEMPT');
      const attempts = (await journal.read()).evm.filter(item => item.operationId === row.id);
      assert.ok(attempts.every(item => item.method === 'requestRedemption'
        && ['REJECTED_NO_KEY', 'REVERTED'].includes(item.status)), 'CLAIM_UNRESOLVED_OR_MISSING_CANONICAL_TICKET');
      row.status = 'REDEMPTION_READY_TO_RETRY';
      await saveRow(collection, row); return projectTicket(row);
    }
    assert.deepEqual(current.ticket, row.ticket, 'CLAIM_TICKET_CHANGED');
    row.status = current.state === '4' ? 'DISCHARGED' : row.native?.status === 'OBSERVED' ? 'OBSERVED_AWAITING_DISCHARGE'
      : row.native?.status === 'ADVERSE' ? 'NATIVE_ADVERSE'
      : row.native?.status === 'RESERVED_BEFORE_BROADCAST' ? 'AWAITING_FIRST_BROADCAST'
      : current.state === '2' ? 'UNKNOWN' : row.ticket.kind === '2' ? 'REFUND_PENDING' : 'REDEMPTION_PENDING';
    await saveRow(collection, row); return projectTicket(row);
  }
  const controller = Object.freeze({
    /** New original lifetime, bound before any D27/native/financial effect.
     * This creates an owner recipient, not an adopted Linux owner. */
    bindDeviceRootClaimIntakeV2: input => serial(async()=>{
      exactRecord(input,['claimDomain','origin','devicePublicKey']);input=copy(input);assert.equal(usesIngressV3,false,'CLAIM_DEVICE_ROOT_ORIGINAL_CI51_ONLY');
      const {config,i}=selected(input.claimDomain),initial=await journal.read();assert.ok(initial.deposits.length===0&&initial.tickets.length===0&&initial.evm.length===0&&!(initial.apiDeviceRootClaims?.length),'CLAIM_DEVICE_ROOT_BEFORE_FUND_REQUIRED');
      const original=await view(input.claimDomain);assert.ok(original.snapshot.gateways.every(g=>g.intents.length===0&&g.tickets.length===0),'CLAIM_DEVICE_ROOT_EMPTY_ORIGINAL_GATEWAYS');await observer.assertCurrent(original.snapshot);
      const units=originalNativeClaimAssetUnitsV1(runtime,claims,config),pairingId=randomBytes(32).toString('hex'),scope=claimHash(Buffer.from(JSON.stringify(['DEVICE_ROOT_NOTE',config,pairingId,input.devicePublicKey]))),ownerIdentitySHA256=claimHash(Buffer.from(JSON.stringify([scope,input.devicePublicKey,config.pool])));
      const descriptor=DeviceClaim.normalizeDeviceRootClaimDescriptorV2({profile:DeviceClaim.DEVICE_ROOT_NATIVE_CLAIM_NOTE_V2,claim:{version:1,profile:DeviceClaim.NATIVE_CLAIM_DEVICE_PAIRING_V1,origin:input.origin,pairingId,devicePublicKey:input.devicePublicKey,accountScopeSHA256:scope,lifetimeSHA256:claimHash(Buffer.from(JSON.stringify([scope,config.poolDomain,pairingId]))),claimDomain:input.claimDomain,nativeFamily:config.nativeFamily,nativeGenesis:config.nativeGenesis,nativeAsset:config.nativeAsset,wrapperAssetIdentity:config.wrapperAssetIdentity,...units,nativeAssetKind:units.nativeAssetKind??null,mint:units.mint??null},pool:config.pool,scope:config.scope,policy:config.policy,recipient:runtime.accounts[i+3].slice(2),noteCustody:'DEVICE_ROOT_NOTE',nativeCustody:'BACKEND_LOCAL_QUORUM'});
      const {createFlatOwnerObserver}=await import('../../../../custody/src/observers/flat-owner-observer.mjs'),{flatAccountAsset}=await import('../../accounts/authority/flat-account-validation.mjs');
      const noteObserver=await createFlatOwnerObserver({runtime,system:claims.flatSystem,poolIndex:i}),pool=claims.flatSystem.pools[i];
      const asset=flatAccountAsset({identity:noteObserver.identity,chainId:runtime.metadata.chainId,genesis:runtime.metadata.evmGenesis.slice(2),poolCodeHash:pool.codeHash.slice(2),assetMetadata:pool.assetMetadata});
      assert.equal(asset.token,config.wrapper,'CLAIM_DEVICE_ROOT_ORIGINAL_WRAPPER');assert.equal(asset.decimals,units.decimals,'CLAIM_DEVICE_ROOT_ORIGINAL_UNITS');
      const ownerClient=createRoleProofClient('owner'),challenges=new Map();let stopped=false,closing=null,handoff=null,intentId=null,d27=null,ci51=null,splSourceBinding=null;
      const alive=()=>{live();assert.ok(!stopped,'CLAIM_DEVICE_ROOT_INTAKE_CLOSED');assertIngressKeeperLive();};
      await journal.update(data=>{assert.equal(data.deposits.length,0,'CLAIM_DEVICE_ROOT_BEFORE_FUND_REQUIRED');data.apiDeviceRootClaims=[{profile:descriptor.profile,descriptor:copy(descriptor),ownerIdentitySHA256,phase:'BORN',intentId:null,admissions:[]}];return data;});
      const persist=async(phase,admission=null)=>journal.update(data=>{const row=data.apiDeviceRootClaims?.[0];assert.deepEqual(row?.descriptor,descriptor,'CLAIM_DEVICE_ROOT_ORIGINAL_SOURCE');row.phase=phase;row.intentId=intentId;if(d27?.phase==='PROVED'&&d27.derived)row.d27Observation={consent:copy(d27.consent),commitment:d27.derived.commitment,nullifier:d27.derived.nullifier};if(ci51?.phase==='COMPLETED')row.ci51Observation={jobId:ci51.consent.jobId,statement:copy(ci51.built.statement)};if(admission){assert.ok(row.admissions.length<8,'CLAIM_DEVICE_ROOT_ADMISSION_LIMIT');row.admissions.push(admission);}return data;});
      function accessCurrent(permission,deadline){alive();DeviceClaim.validateDeviceRootClaimPermissionFreshV2(permission);assert.ok(performance.now()<deadline,'CLAIM_DEVICE_ROOT_ACCESS_EXPIRED');}
      function challenge(action,fields={},parentExpiry=null){alive();for(const [id,p]of challenges)if(p.expiresAt<=Date.now())challenges.delete(id);assert.ok(challenges.size<8,'CLAIM_DEVICE_ROOT_CHALLENGE_LIMIT');const p=DeviceClaim.validateDeviceRootClaimPermissionFreshV2({version:2,profile:DeviceClaim.DEVICE_ROOT_NATIVE_CLAIM_PERMISSION_V2,action,descriptor,rootId:null,noteRevision:null,jobId:null,statement:null,witnessSHA256:null,commonSHA256:null,recipient:null,...fields,challengeId:randomBytes(32).toString('hex'),nonce:randomBytes(32).toString('hex'),expiresAt:Math.min(Date.now()+15000,parentExpiry??Infinity)});challenges.set(p.challengeId,p);return p;}
      function consume(raw,signature,action){alive();const p=DeviceClaim.validateDeviceRootClaimPermissionFreshV2(raw),original=challenges.get(p.challengeId);assert.equal(p.action,action,'CLAIM_DEVICE_ROOT_PERMISSION_ACTION');assert.ok(original,'CLAIM_DEVICE_ROOT_ORIGINAL_PERMISSION');assert.deepEqual(original,p,'CLAIM_DEVICE_ROOT_PERMISSION_CHANGED');const pub=input.devicePublicKey,key=createPublicKey({format:'jwk',key:{kty:'EC',crv:'secp256k1',x:Buffer.from(pub.slice(2,66),'hex').toString('base64url'),y:Buffer.from(pub.slice(66),'hex').toString('base64url')}}),message=DeviceClaim.deviceRootClaimPermissionMessageV2(p);try{assert.equal(verify('sha256',message,{key,dsaEncoding:'ieee-p1363'},Buffer.from(DeviceClaim.normalizeNativeClaimDeviceSignatureV1(signature),'hex')),true,'CLAIM_DEVICE_ROOT_DEVICE_SIGNATURE');}finally{message.fill(0);}challenges.delete(p.challengeId);return p;}
      const {assertOwnedDeviceExternalFlatReceiverV1}=await import('../../chains/evm/runtime/owned-evm-v2-runtime.mjs');
      const {createOriginalDeviceWalletNoteProofClientV3,readOriginalDeviceWalletNoteDerivationV3}=await import('../../../../proofs/src/jobs/wallet-note-private-client-v3.mjs');
      const {verifyPrivateNotePath}=await import('../../../../engine/src/notes/private-note-tree.mjs');
      const {encodeFlatTransaction}=await import('../../execution/encoding/transaction-codec.mjs');
      const {flatAccountCalldataHash,validateFlatAccountOwnerObservation}=await import('../../accounts/authority/flat-account-validation.mjs');
      const {ownerDigest}=await import('../../../../custody/src/signing/flat-owner-custody.mjs');
      // The fixed proof client and send producer belong to this before-fund
      // intake. A parsed RootNote, descriptor or copied request issues neither.
      const exitClient=createOriginalDeviceWalletNoteProofClientV3('withdraw_balance'),exitQuotes=new Map(),exitChallenges=new Map();let exitReview=null;
      const bare=v=>v.slice(2),exitHash=v=>claimHash(Buffer.from(JSON.stringify(v))),sourceIdentitySHA256=ownerDigest(noteObserver.identity);
      const rootRecord=async()=>{const data=await journal.read(),r=data.apiDeviceRootClaims?.[0];assert.deepEqual(r?.descriptor,descriptor,'CLAIM_DEVICE_ROOT_ORIGINAL_SOURCE');return r;};
      const saveExit=async value=>journal.update(data=>{const r=data.apiDeviceRootClaims?.[0];assert.deepEqual(r?.descriptor,descriptor,'CLAIM_DEVICE_ROOT_ORIGINAL_SOURCE');r.withdrawal=copy(value);return data;});
      const exitPublic=r=>r?freeze({jobId:r.consent.jobId,stage:r.stage,statement:r.consent.statement,path:r.consent.path,quoteId:r.consent.quoteId,
        rootId:r.consent.rootId,noteRevision:r.consent.noteRevision,witnessSHA256:r.consent.witnessSHA256,proofSHA256:r.proofSHA256,publicInputsSHA256:r.publicInputsSHA256,
        transactionHash:r.submission?.transactionHash??null,observation:r.confirmation??null}):null;
      async function currentNote(){
        alive();const row=intentId?await deposit(intentId):null,status=row?await syncRow(row,'deposits'):null,v=await readers[i].read();await readers[i].assertCurrent(v);alive();
        const cm=row?.packet.statement.output??null,nf=d27?.derived?.nullifier??null;
        if(!row||status.status!=='ISSUED'||!cm||!nf)return{v,note:{state:'UNKNOWN',commitment:cm,nullifier:nf,available:null,backing:null,path:null}};
        const at=v.ledger.commitments.indexOf('0x'+cm);assert.ok(at>=0&&v.ledger.commitments.filter(x=>x==='0x'+cm).length===1,'CLAIM_DEVICE_ROOT_ORIGINAL_PATH_REQUIRED');
        const raw=v.ledger.tree.path(at);assert.equal(verifyPrivateNotePath(raw),true,'CLAIM_DEVICE_ROOT_ORIGINAL_PATH_REQUIRED');
        const path={root:bare(raw.root),index:raw.index,leaf:bare(raw.leaf),siblings:raw.siblings.map(bare)};assert.equal(path.leaf,cm);
        const p=v.ledger.publicState,held=String(p.actualAssetBalance),liabilities=String(p.backedAmount),surplus=String(p.surplus);
        assert.ok(BigInt(held)>=BigInt(liabilities)&&BigInt(surplus)===BigInt(held)-BigInt(liabilities),'CLAIM_DEVICE_ROOT_ORIGINAL_BACKING');
        const backing={held,liabilities,surplus,deficit:'0'};
        if(v.ledger.nullifiers.includes('0x'+nf))return{v,note:{state:'SPENT',commitment:cm,nullifier:nf,available:null,backing,path}};
        const exit=(await rootRecord()).withdrawal;if(exit&&exit.stage!=='CONFIRMED')return{v,note:{state:'UNKNOWN',commitment:cm,nullifier:nf,available:null,backing:null,path}};
        assert.ok(BigInt(row.packet.statement.amount)<=BigInt(held),'CLAIM_DEVICE_ROOT_ORIGINAL_BACKING');
        return{v,note:{state:'LIVE',commitment:cm,nullifier:nf,available:row.packet.statement.amount,backing,path}};
      }
      function exitPermission(action,fields,parentExpiry){alive();for(const[id,p]of exitChallenges)if(p.value.expiresAt<=Date.now())exitChallenges.delete(id);assert.ok(exitChallenges.size<8,'CLAIM_DEVICE_ROOT_CHALLENGE_LIMIT');
        const value=DeviceClaim.validateDeviceRootClaimExitPermissionFreshV3({version:3,profile:DeviceClaim.DEVICE_ROOT_NATIVE_CLAIM_EXIT_V3,action,descriptor,
          rootId:d27.consent.rootId,noteRevision:d27.consent.noteRevision,jobId:null,quoteId:null,statement:null,path:null,witnessSHA256:null,proofSHA256:null,publicInputsSHA256:null,recipient:null,
          requestId:null,ticketId:null,amount:null,maxFee:null,...fields,challengeId:randomBytes(32).toString('hex'),nonce:randomBytes(32).toString('hex'),expiresAt:Math.min(Date.now()+15000,parentExpiry)});
        exitChallenges.set(value.challengeId,{value,deadline:performance.now()+Math.min(15000,value.expiresAt-Date.now())});return value;
      }
      function consumeExit(raw,signature){const p=DeviceClaim.validateDeviceRootClaimExitPermissionFreshV3(raw),r=exitChallenges.get(p.challengeId);alive();assert.ok(r&&performance.now()<r.deadline,'CLAIM_DEVICE_ROOT_ORIGINAL_EXIT_PERMISSION');assert.deepEqual(r.value,p);const pub=descriptor.claim.devicePublicKey,key=createPublicKey({format:'jwk',key:{kty:'EC',crv:'secp256k1',x:Buffer.from(pub.slice(2,66),'hex').toString('base64url'),y:Buffer.from(pub.slice(66),'hex').toString('base64url')}}),message=DeviceClaim.deviceRootClaimExitPermissionMessageV3(p);try{assert.equal(verify('sha256',message,{key,dsaEncoding:'ieee-p1363'},Buffer.from(DeviceClaim.normalizeNativeClaimDeviceSignatureV1(signature),'hex')),true,'CLAIM_DEVICE_ROOT_DEVICE_SIGNATURE');}finally{message.fill(0);}exitChallenges.delete(p.challengeId);return{value:p,check(){alive();assert.ok(performance.now()<r.deadline,'CLAIM_DEVICE_ROOT_EXIT_EXPIRED');DeviceClaim.validateDeviceRootClaimExitPermissionFreshV3(p);}};}
      async function observeExit(){
        const r=(await rootRecord()).withdrawal;if(!r||!r.submission)return exitPublic(r);
        // This original observer performs canonical receipt, calldata, nonce,
        // parent-state and token movement checks. It cannot sign or dispatch.
        const o=await noteObserver.readTransaction({kind:'withdraw_source',identitySHA256:sourceIdentitySHA256,transactionHash:r.submission.transactionHash,calldataSHA256:r.submission.calldataSHA256});
        if(!o)return exitPublic(r);validateFlatAccountOwnerObservation({identity:noteObserver.identity,artifact:pool.artifact,submission:r.submission,authorization:null,observation:o});
        const {v,note}=await currentNote();assert.equal(note.state,'SPENT','CLAIM_DEVICE_ROOT_SPEND_NOT_OBSERVED');await readers[i].assertCurrent(v);alive();
        r.stage='CONFIRMED';r.submission.transactionHash=o.transaction.hash;r.submission.observation=o;
        r.confirmation={transactionHash:o.transaction.hash,calldataSHA256:r.submission.calldataSHA256,receiptBlockHash:o.receipt.blockHash,commitment:note.commitment,nullifier:note.nullifier,
          amount:r.consent.statement.amount,recipient:r.consent.statement.recipient,proofSHA256:r.proofSHA256,publicInputsSHA256:r.publicInputsSHA256};await saveExit(r);return exitPublic(r);
      }
      const api=Object.freeze({descriptor,
        challenge(action){assert.equal(arguments.length,1);assert.ok(['ACCESS','READ'].includes(action));return challenge(action);},
        reviewD27: request=>serial(async()=>{exactRecord(request,['access','signature','draft']);const access=consume(request.access,request.signature,'ACCESS'),accessDeadline=performance.now()+Math.min(15000,access.expiresAt-Date.now());assert.equal(d27,null,'CLAIM_DEVICE_ROOT_D27_ALREADY_ADMITTED');const v=request.draft;exactRecord(v,['rootId','noteRevision','statement','witnessSHA256']);const statement=DeviceClaim.normalizeDeviceRootClaimStatementV2(v.statement);if(splSourceBinding){assert.equal(splSourceBinding.phase,'READY','CLAIM_DEVICE_ROOT_SPL_SOURCE_REQUIRED');assert.equal(statement.amount,splSourceBinding.amount,'CLAIM_DEVICE_ROOT_SPL_ORIGINAL_QUOTE');}assert.equal(statement.scope,config.scope);assert.equal(statement.policy,config.policy);const head=await runtime.time();assert.ok(BigInt(statement.validFrom)<=head&&head<BigInt(statement.validUntil),'CLAIM_DEVICE_ROOT_ORIGINAL_WINDOW');
          const recipient=await ownerClient.preparePrivateDeviceRootClaimV2(DeviceClaim.deviceRootClaimPublicInputsV2(statement));accessCurrent(access,accessDeadline);const consent=challenge('PROVE_D27',{...v,statement,jobId:recipient.jobId,recipient},access.expiresAt);d27={consent,phase:'REVIEWED',result:null};return consent;}),
        submitD27: request=>serial(async()=>{exactRecord(request,['permission','signature','packet']);const p=consume(request.permission,request.signature,'PROVE_D27');assert.ok(d27?.phase==='REVIEWED'&&d27.consent.challengeId===p.challengeId,'CLAIM_DEVICE_ROOT_ORIGINAL_D27');d27.phase='PROVING';await persist('D27_PROVING',{action:p.action,jobId:p.jobId,permissionSHA256:claimHash(DeviceClaim.deviceRootClaimPermissionMessageV2(p))});
          const binding={kind:'ORIGINAL_CONSENT_V1',jobId:p.jobId,consentSHA256:claimHash(DeviceClaim.deviceRootClaimPermissionMessageV2(p)),witnessSHA256:p.witnessSHA256};try{const result=await ownerClient.proveEncryptedDeviceRootClaimV2(request.packet,binding),derived=readOriginalDeviceRootClaimDerivationV2(ownerClient,result);alive();assert.equal(derived.claimDomain,input.claimDomain);assert.equal(derived.commitment,p.statement.output);assert.equal(derived.action,'PROVE_D27');
            const packet={version:2,profile:deviceRootProfile,trust:'DEVICE_ROOT_NOTE_NATIVE_BACKEND_LOCAL_QUORUM',ownerIdentitySHA256,claimDomain:input.claimDomain,ingressProverIdentity,intentIdentitySHA256:'0'.repeat(64),revision:0,statement:p.statement,proofResult:result,receiptBinding:derived.receiptBinding};
            // ownerDigest uses the same canonical DATA framing as legacy handoffs.
            const {ownerDigest,FLAT_OWNER_CLAIM_HANDOFF_PROFILE}=await import('../../../../custody/src/signing/flat-owner-custody.mjs');packet.intentIdentitySHA256=ownerDigest({profile:FLAT_OWNER_CLAIM_HANDOFF_PROFILE,identitySHA256:ownerIdentitySHA256,claimDomain:input.claimDomain,scope:p.statement.scope,policy:p.statement.policy,amount:p.statement.amount,output:p.statement.output});packet.handoffIdentitySHA256=ownerDigest(packet);const retained=validatePacket(packet);handoff=Object.freeze({select(){alive();return retained;}});deviceRootClaimHandoffs.set(handoff,{controller,closed:()=>stopped});d27.phase='PROVED';d27.result=result;d27.derived=derived;await persist('D27_PROVED');return{handoff,proof:result};
          }catch(error){d27.phase='UNKNOWN';await retainFailure(error,()=>persist('UNKNOWN'));throw error;}}),
        retainPrepared: prepared=>serial(async()=>{alive();assert.ok(handoff&&d27?.phase==='PROVED');exactRecord(prepared,['intentId']);const row=await deposit(prepared.intentId);assert.deepEqual(row.packet,handoff.select());intentId=row.id;await persist('PREPARED');return freeze(projectDeposit(row));}),
        effectChallenge(action){assert.equal(arguments.length,1);assert.ok(['FUND_NATIVE_CLAIM','ISSUE_CLAIM'].includes(action)&&intentId&&handoff,'CLAIM_DEVICE_ROOT_PREPARED_REQUIRED');if(action==='ISSUE_CLAIM')assert.equal(ci51?.phase,'COMPLETED','CLAIM_DEVICE_ROOT_CI51_REQUIRED');return challenge(action,{rootId:d27.consent.rootId,noteRevision:d27.consent.noteRevision,jobId:d27.consent.jobId,statement:d27.consent.statement});},
        authorizeEffect: request=>serial(async()=>{exactRecord(request,['permission','signature']);const action=DeviceClaim.normalizeDeviceRootClaimPermissionV2(request.permission).action,p=consume(request.permission,request.signature,action);assert.ok(['FUND_NATIVE_CLAIM','ISSUE_CLAIM'].includes(p.action)&&intentId);const row=await deposit(intentId);assert.deepEqual(row.packet,handoff.select());const state=await journal.read(),record=state.apiDeviceRootClaims[0];assert.ok(!record.admissions.some(a=>a.action===p.action),'CLAIM_DEVICE_ROOT_EFFECT_ALREADY_ADMITTED');await persist(p.action+'_ADMITTED',{action:p.action,jobId:p.jobId,permissionSHA256:claimHash(DeviceClaim.deviceRootClaimPermissionMessageV2(p))});return{intentId,handoff};}),
        reviewCI51: request=>serial(async()=>{exactRecord(request,['access','signature','witnessSHA256']);const access=consume(request.access,request.signature,'ACCESS'),accessDeadline=performance.now()+Math.min(15000,access.expiresAt-Date.now());assert.ok(intentId&&handoff&&ci51===null,'CLAIM_DEVICE_ROOT_CI51_ALREADY_ADMITTED');const row=await deposit(intentId);assert.ok(await observeNative(row,'deposits'),'CLAIM_NATIVE_FINALITY_UNRESOLVED');const {policy}=selected(row.claimDomain),facts=await quorum.facts(row.native.binding.request),flat=await readers[i].read();assert.equal(flat.head.hash,facts.head.hash,'CLAIM_FACTS_CURRENT_HEAD');const common={config,domain:claims.flatSystem.pools[i].domain,registry:claims.flatSystem.registry,rule:policy.rule,rulePath:rulePaths[i],certificates:facts.certificates,currentRevocation:{revokedDigest:flat.state.revokedDigest,revokedCount:flat.state.revokedCount,revocationSequence:flat.state.revocationSequence,entries:flat.revokedEntries}};
          const built=await withPinnedHash(hashFields=>buildDeviceRootClaimIngressPublicV2({...common,outputQ:row.packet.statement.output,amountQ:row.packet.statement.amount,receiptBinding:row.packet.receiptBinding},{hashFields}));for(const[k,v]of Object.entries({claimDomain:row.claimDomain,outputQ:row.packet.statement.output,amountQ:row.packet.statement.amount,admissionN:row.native.binding.admissionN,refundDestination:row.refundDestination}))assert.equal(built.statement[k],v,'CLAIM_DEVICE_ROOT_ORIGINAL_NATIVE_BINDING');
          row.privateCI51Attempt={phase:'PREPARING'};await saveRow('deposits',row);const recipient=await proofClients.claim_ingress.preparePrivateDeviceRootClaimV2(built.expectedPublicInputs);alive();const commonSHA256=claimHash(DeviceClaim.deviceRootClaimDataBytesV2(common));row.privateCI51Attempt={phase:'PREPARED',jobId:recipient.jobId,statement:built.statement};await saveRow('deposits',row);accessCurrent(access,accessDeadline);const consent=challenge('PROVE_CI51',{rootId:d27.consent.rootId,noteRevision:d27.consent.noteRevision,jobId:recipient.jobId,statement:built.statement,witnessSHA256:request.witnessSHA256,commonSHA256,recipient},access.expiresAt);ci51={phase:'REVIEWED',consent,built};return freeze({consent,common});}),
        submitCI51: request=>serial(async()=>{exactRecord(request,['permission','signature','packet']);const p=consume(request.permission,request.signature,'PROVE_CI51');assert.ok(ci51?.phase==='REVIEWED'&&ci51.consent.challengeId===p.challengeId);const row=await deposit(intentId);ci51.phase='PROVING';row.privateCI51Attempt.phase='PROVING';await saveRow('deposits',row);await persist('CI51_PROVING',{action:p.action,jobId:p.jobId,permissionSHA256:claimHash(DeviceClaim.deviceRootClaimPermissionMessageV2(p))});try{const binding={kind:'ORIGINAL_CONSENT_V1',jobId:p.jobId,consentSHA256:claimHash(DeviceClaim.deviceRootClaimPermissionMessageV2(p)),witnessSHA256:p.witnessSHA256},result=await proofClients.claim_ingress.proveEncryptedDeviceRootClaimV2(request.packet,binding),derived=readOriginalDeviceRootClaimDerivationV2(proofClients.claim_ingress,result);alive();assert.equal(derived.claimDomain,input.claimDomain);assert.equal(derived.commitment,row.packet.statement.output);assert.equal(derived.commonSHA256,p.commonSHA256);assert.deepEqual(result.publicInputs,ci51.built.expectedPublicInputs);row.proofs??=[];row.proofs.push({statement:ci51.built.statement,result});row.privateCI51Attempt.phase='COMPLETED';await saveRow('deposits',row);ci51.phase='COMPLETED';await persist('CI51_PROVED');return result;}catch(error){ci51.phase='UNKNOWN';row.privateCI51Attempt.phase='UNKNOWN';row.status='UNKNOWN';await retainFailure(error,()=>saveRow('deposits',row));throw error;}}),
        quoteW39: request=>serial(async()=>{exactRecord(request,['access','signature']);assertOwnedDeviceExternalFlatReceiverV1(runtime);const p=consume(request.access,request.signature,'ACCESS'),accessDeadline=performance.now()+Math.min(15000,p.expiresAt-Date.now());assert.ok(intentId&&d27&&ci51?.phase==='COMPLETED');assert.equal((await rootRecord()).withdrawal??null,null,'CLAIM_DEVICE_ROOT_W39_ALREADY_ADMITTED');const {v,note}=await currentNote();assert.equal(note.state,'LIVE','CLAIM_DEVICE_ROOT_NOTE_NOT_AVAILABLE');accessCurrent(p,accessDeadline);const quote=DeviceClaim.normalizeDeviceRootClaimExitQuoteV3({profile:DeviceClaim.DEVICE_ROOT_NATIVE_CLAIM_EXIT_V3,descriptor,quoteId:randomBytes(32).toString('hex'),rootId:d27.consent.rootId,noteRevision:d27.consent.noteRevision,
          statement:{scope:config.scope,policy:config.policy,epoch:(BigInt(v.head.timestamp)/600n).toString(),root:note.path.root,nullifier:note.nullifier,amount:note.available,recipient:descriptor.recipient,commitment:note.commitment},path:note.path,
          observed:{blockNumber:v.head.number,blockHash:v.head.hash,timestamp:v.head.timestamp},expiresAt:p.expiresAt});for(const[id,q]of exitQuotes)if(q.value.expiresAt<=Date.now())exitQuotes.delete(id);assert.ok(exitQuotes.size<8,'CLAIM_DEVICE_ROOT_QUOTE_LIMIT');exitQuotes.set(quote.quoteId,{value:quote,used:false,deadline:performance.now()+Math.max(0,p.expiresAt-Date.now())});return quote;}),
        reviewW39: request=>serial(async()=>{exactRecord(request,['access','signature','quote','witnessSHA256']);assertOwnedDeviceExternalFlatReceiverV1(runtime);const access=consume(request.access,request.signature,'ACCESS'),accessDeadline=performance.now()+Math.min(15000,access.expiresAt-Date.now()),quote=DeviceClaim.normalizeDeviceRootClaimExitQuoteV3(request.quote),q=exitQuotes.get(quote.quoteId);assert.ok(q&&!q.used&&performance.now()<q.deadline&&Date.now()<quote.expiresAt,'CLAIM_DEVICE_ROOT_ORIGINAL_QUOTE');assert.deepEqual(q.value,quote);assert.equal(exitReview,null,'CLAIM_DEVICE_ROOT_ONE_W39_PREPARATION');assert.equal((await rootRecord()).withdrawal??null,null,'CLAIM_DEVICE_ROOT_W39_ALREADY_ADMITTED');const {v,note}=await currentNote();assert.equal(note.state,'LIVE');assert.deepEqual(note.path,quote.path);assert.equal(quote.statement.epoch,(BigInt(v.head.timestamp)/600n).toString());q.used=true;
          const recipient=await exitClient.prepare(DeviceClaim.deviceRootClaimExitPublicInputsV3(quote.statement));await readers[i].assertCurrent(v);accessCurrent(access,accessDeadline);assert.ok(performance.now()<q.deadline&&Date.now()<quote.expiresAt,'CLAIM_DEVICE_ROOT_ORIGINAL_QUOTE');
          const consent=exitPermission('PROVE_W39',{jobId:recipient.jobId,quoteId:quote.quoteId,statement:quote.statement,path:quote.path,witnessSHA256:request.witnessSHA256,recipient},Math.min(access.expiresAt,quote.expiresAt));exitReview={consent};return consent;}),
        exitChallenge: request=>serial(async()=>{exactRecord(request,['access','signature','action']);const access=consume(request.access,request.signature,'ACCESS'),accessDeadline=performance.now()+Math.min(15000,access.expiresAt-Date.now());const record=await rootRecord(),r=record.withdrawal;assert.ok(r,'CLAIM_DEVICE_ROOT_ORIGINAL_W39_REQUIRED');
          if(['WITHDRAW_W39','OBSERVE_W39'].includes(request.action)){assert.ok(r.proof,'CLAIM_DEVICE_ROOT_W39_PROOF_REQUIRED');if(request.action==='WITHDRAW_W39')assert.ok(r.stage==='PROVED'&&r.submission===null,'CLAIM_DEVICE_ROOT_W39_OBSERVE_ONLY');accessCurrent(access,accessDeadline);return exitPermission(request.action,{jobId:r.consent.jobId,quoteId:r.consent.quoteId,statement:r.consent.statement,path:r.consent.path,witnessSHA256:r.consent.witnessSHA256,proofSHA256:r.proofSHA256,publicInputsSHA256:r.publicInputsSHA256},access.expiresAt);}
          assert.ok(['REDEEM_NATIVE','PAYOUT_NATIVE','OBSERVE_NATIVE'].includes(request.action));assert.equal(r.stage,'CONFIRMED','CLAIM_DEVICE_ROOT_W39_CONFIRMATION_REQUIRED');let redemption=record.redemption;
          if(request.action==='REDEEM_NATIVE'){assert.equal(redemption??null,null,'CLAIM_DEVICE_ROOT_REDEMPTION_ALREADY_ADMITTED');accessCurrent(access,accessDeadline);return exitPermission(request.action,{jobId:r.consent.jobId,requestId:randomBytes(32).toString('hex'),amount:r.consent.statement.amount,maxFee:config.refundMaxFee},access.expiresAt);}
          assert.ok(redemption?.ticketId,'CLAIM_DEVICE_ROOT_ORIGINAL_TICKET_REQUIRED');if(request.action==='PAYOUT_NATIVE'){assert.equal(redemption.payoutAdmitted,false,'CLAIM_DEVICE_ROOT_PAYOUT_OBSERVE_ONLY');const t=await ticket(redemption.ticketId);assert.equal(t.native,null,'CLAIM_DEVICE_ROOT_PAYOUT_ALREADY_STARTED');}
          accessCurrent(access,accessDeadline);return exitPermission(request.action,{jobId:r.consent.jobId,requestId:redemption.requestId,ticketId:redemption.ticketId,amount:redemption.amount,maxFee:redemption.maxFee},access.expiresAt);}),
        operateW39: request=>serial(async()=>{exactRecord(request,['permission','signature','packet']);const grant=consumeExit(request.permission,request.signature),p=grant.value;assert.ok(p.action.endsWith('W39'),'CLAIM_DEVICE_ROOT_EXIT_ACTION');
          if(p.action==='PROVE_W39'){
            assert.ok(request.packet&&exitReview?.consent.challengeId===p.challengeId);assert.equal((await rootRecord()).withdrawal??null,null,'CLAIM_DEVICE_ROOT_W39_ALREADY_ADMITTED');const {v,note}=await currentNote();assert.equal(note.state,'LIVE');assert.deepEqual(note.path,p.path);grant.check();
            const r={stage:'PROVING',consent:copy(p),proof:null,proofSHA256:null,publicInputsSHA256:null,submission:null,confirmation:null};await saveExit(r);grant.check();
            try{const binding={kind:'ORIGINAL_CONSENT_V1',jobId:p.jobId,consentSHA256:claimHash(DeviceClaim.deviceRootClaimExitPermissionMessageV3(p)),witnessSHA256:p.witnessSHA256},result=await exitClient.proveEncrypted(request.packet,binding),derived=readOriginalDeviceWalletNoteDerivationV3(exitClient,result);alive();assert.equal(result.metrics.acceptedResult,true);assert.equal(derived.noteRole,null);assert.equal(derived.commitment,p.statement.commitment);assert.equal(derived.nullifier,p.statement.nullifier);assert.equal(derived.jobId,p.jobId);assert.equal(derived.consentSHA256,binding.consentSHA256);assert.equal(derived.witnessSHA256,p.witnessSHA256);const proof={proof:result.proof,publicInputs:[...result.publicInputs]};assert.deepEqual(proof.publicInputs,DeviceClaim.deviceRootClaimExitPublicInputsV3(p.statement));const after=await readers[i].read();assert.ok(after.ledger.commitments.includes('0x'+p.statement.commitment)&&!after.ledger.nullifiers.includes('0x'+p.statement.nullifier));assert.equal(await claims.flatSystem.verify('withdraw_balance',Buffer.from(proof.proof,'hex'),proof.publicInputs.map(w=>'0x'+BigInt(w).toString(16).padStart(64,'0')),after.header.number),true,'CLAIM_DEVICE_ROOT_DEPLOYED_W39_VERIFIER');await readers[i].assertCurrent(after);alive();r.stage='PROVED';r.proof=proof;r.proofSHA256=claimHash(Buffer.from(proof.proof,'hex'));r.publicInputsSHA256=exitHash(proof.publicInputs);r.metrics=JSON.stringify(result.metrics);await saveExit(r);return exitPublic(r);}catch(error){r.stage='UNKNOWN';await retainFailure(error,()=>saveExit(r));throw error;}finally{await exitClient.close();}
          }
          assert.equal(request.packet,null);const r=(await rootRecord()).withdrawal;assert.ok(r);for(const k of ['jobId','quoteId','rootId','noteRevision','statement','path','witnessSHA256'])assert.deepEqual(p[k],r.consent[k],'CLAIM_DEVICE_ROOT_W39_CHANGED');assert.equal(p.proofSHA256,r.proofSHA256);assert.equal(p.publicInputsSHA256,r.publicInputsSHA256);
          if(p.action==='OBSERVE_W39')return observeExit();assert.ok(r.stage==='PROVED'&&r.submission===null,'CLAIM_DEVICE_ROOT_W39_OBSERVE_ONLY');const v=await readers[i].read();assert.ok(v.ledger.commitments.includes('0x'+p.statement.commitment)&&!v.ledger.nullifiers.includes('0x'+p.statement.nullifier)&&v.ledger.roots.includes('0x'+p.statement.root),'CLAIM_DEVICE_ROOT_W39_CURRENT');assert.equal(p.statement.epoch,(BigInt(v.head.timestamp)/600n).toString());assert.ok(v.ledger.publicState.spent+5*v.ledger.publicState.liveReservations+1<=64,'CLAIM_DEVICE_ROOT_W39_HEADROOM');await readers[i].assertCurrent(v);grant.check();
          const calldata=encodeFlatTransaction('withdrawBalance',r.proof),before={identitySHA256:sourceIdentitySHA256,blockHash:v.head.hash,canonicalBlockHashBefore:v.head.hash,canonicalBlockHashAfter:v.head.hash,timestamp:v.head.timestamp,...Object.fromEntries(['rawState','rawHistory','rawBacking'].map(k=>[k,v.poolObservation[k]]))};
          r.stage='WITHDRAWAL_UNKNOWN';r.submission={kind:'withdraw_source',calldata,calldataSHA256:flatAccountCalldataHash(calldata),publicInputs:r.proof.publicInputs,statement:Object.fromEntries(Object.entries(p.statement).filter(([k])=>k!=='commitment')),before,epoch:p.statement.epoch,transactionHash:null,dispatchLatched:true,ownerConfirmed:false,observation:null};await saveExit(r);
          const transaction={from:claims.flatSystem.sender,to:pool.address,data:calldata,value:'0'},requestToken=Object.freeze(Object.create(null)),checkTransaction=e=>{assert.equal(e.from,transaction.from);assert.equal(e.to,transaction.to);assert.equal(e.data,transaction.data);assert.equal(e.value,'0');assert.equal(e.chainId,String(runtime.metadata.chainId));};
          const scope=Object.freeze({transaction:Object.freeze(transaction),async beforeKey(e){checkTransaction(e);await readers[i].assertCurrent(v);grant.check();},assertBeforeKey(e){checkTransaction(e);grant.check();},async onSigned(signed,e){checkTransaction(e);alive();assert.match(signed.nativeId,/^0x[0-9a-f]{64}$/);r.submission.transactionHash=bare(signed.nativeId);r.submission.signedNonce=e.nonce;await saveExit(r);},async beforeBroadcast(e){checkTransaction(e);await readers[i].assertCurrent(v);grant.check();},assertBeforeBroadcast(e){checkTransaction(e);grant.check();}});
          deviceRootClaimSends.set(requestToken,{runtime,opened:false,check:grant.check,scope});try{await runtime.dispatchOriginalDeviceExternalFlatNoteV1(requestToken);alive();return await observeExit();}finally{deviceRootClaimSends.delete(requestToken);}
        }),
        authorizeNativeExit: request=>serial(async()=>{exactRecord(request,['permission','signature']);const grant=consumeExit(request.permission,request.signature),p=grant.value;assert.ok(['REDEEM_NATIVE','PAYOUT_NATIVE','OBSERVE_NATIVE'].includes(p.action));const record=await rootRecord(),r=record.withdrawal;assert.ok(r?.stage==='CONFIRMED'&&r.consent.jobId===p.jobId&&r.consent.rootId===p.rootId&&r.consent.noteRevision===p.noteRevision);assert.equal(p.amount,r.consent.statement.amount);assert.equal(p.maxFee,config.refundMaxFee);
          if(p.action==='OBSERVE_NATIVE'){assert.equal(record.redemption?.requestId,p.requestId);assert.equal(record.redemption?.ticketId,p.ticketId);return{action:p.action,ticketId:p.ticketId};}
          if(p.action==='REDEEM_NATIVE'){assert.equal(record.redemption??null,null,'CLAIM_DEVICE_ROOT_REDEMPTION_ALREADY_ADMITTED');await journal.update(data=>{data.apiDeviceRootClaims[0].redemption={requestId:p.requestId,amount:p.amount,maxFee:p.maxFee,ticketId:null,payoutAdmitted:false,status:'UNKNOWN'};return data;});grant.check();return{action:p.action,requestId:p.requestId,claimDomain:input.claimDomain,caller:'0x'+descriptor.recipient,amount:p.amount,maxFee:p.maxFee};}
          assert.equal(record.redemption.requestId,p.requestId);assert.equal(record.redemption.ticketId,p.ticketId);assert.equal(record.redemption.payoutAdmitted,false,'CLAIM_DEVICE_ROOT_PAYOUT_OBSERVE_ONLY');const t=await ticket(p.ticketId);assert.equal(t.native,null,'CLAIM_DEVICE_ROOT_PAYOUT_ALREADY_STARTED');await journal.update(data=>{data.apiDeviceRootClaims[0].redemption.payoutAdmitted=true;data.apiDeviceRootClaims[0].redemption.status='UNKNOWN';return data;});grant.check();return{action:p.action,ticketId:p.ticketId};
        }),
        retainNativeExit: ()=>serial(async()=>{const record=await rootRecord(),r=record.redemption;if(!r)return null;const rows=(await journal.read()).tickets.filter(t=>t.redemptionRequestId===r.requestId);assert.ok(rows.length<=1,'CLAIM_DEVICE_ROOT_AMBIGUOUS_TICKET');if(rows.length===0)return freeze(copy(r));const t=rows[0];assert.equal(t.claimDomain,input.claimDomain);assert.equal(t.caller,'0x'+descriptor.recipient);assert.equal(t.ticket.amount,r.amount);assert.equal(t.ticket.maxFee,r.maxFee);const projected=await syncRow(t,'tickets');await journal.update(data=>{const x=data.apiDeviceRootClaims[0].redemption;assert.equal(x.requestId,r.requestId);x.ticketId=t.id;x.status=projected.status;return data;});return freeze({requestId:r.requestId,ticketId:t.id,amount:r.amount,maxFee:r.maxFee,payoutAdmitted:r.payoutAdmitted,status:projected.status});},{readOrReconcile:true}),
        read: request=>serial(async()=>{exactRecord(request,['permission','signature']);const p=consume(request.permission,request.signature,'READ');const row=intentId?await deposit(intentId):null;const status=row?await syncRow(row,'deposits'):null;await observeExit();const current=await currentNote(),record=await rootRecord();return freeze({profile:descriptor.profile,descriptor,permissionId:p.challengeId,observedAt:Date.now(),expiresAt:p.expiresAt,noteCustody:'DEVICE_ROOT_NOTE',nativeCustody:'BACKEND_LOCAL_QUORUM',nativeSelfCustody:false,availablePrivateClaims:current.note.available,note:current.note,withdrawal:exitPublic(record.withdrawal),redemption:record.redemption??null,deposit:status,commitment:row?.packet.statement.output??null,nullifier:d27?.derived?.nullifier??null,requiresReconciliation:journal.requiresReconciliation?.()===true});},{readOrReconcile:true}),
        economicSnapshot: ()=>serial(async()=>{
          alive();const current=await currentNote(),before=await journal.read(),source=before.apiDeviceRootClaims?.[0];assert.deepEqual(source.descriptor,descriptor,'CLAIM_DEVICE_ROOT_ORIGINAL_SOURCE');
          const selectedView=await view(input.claimDomain);assert.equal(selectedView.snapshot.head.hash,current.v.head.hash,'CLAIM_DEVICE_ROOT_OBSERVATION_CHANGED');await observer.assertCurrent(selectedView.snapshot);await readers[i].assertCurrent(current.v);
          const after=await journal.read();assert.deepEqual(before,after,'CLAIM_DEVICE_ROOT_OBSERVATION_CHANGED');alive();const depositRow=intentId?before.deposits.find(d=>d.id===intentId):null;
          const requests=source.admissions.map((a,index)=>{const confirmed=a.action==='PROVE_D27'?d27?.phase==='PROVED':a.action==='PROVE_CI51'?ci51?.phase==='COMPLETED':a.action==='FUND_NATIVE_CLAIM'?depositRow?.native?.status==='OBSERVED':a.action==='ISSUE_CLAIM'?depositRow?.status==='ISSUED':false;
            return{requestId:'device_root_claim_'+index+'_'+a.permissionSHA256,assetId:asset.assetId,kind:a.action==='FUND_NATIVE_CLAIM'?'TOP_UP':'GRAPH',state:confirmed?'CONFIRMED':'UNKNOWN',disposition:null};});
          if(source.withdrawal)requests.push({requestId:'device_root_w39_'+source.withdrawal.consent.jobId,assetId:asset.assetId,kind:'EXIT',state:source.withdrawal.stage==='CONFIRMED'?'CONFIRMED':'UNKNOWN',disposition:null});
          if(source.redemption)requests.push({requestId:'device_root_native_'+source.redemption.requestId,assetId:asset.assetId,kind:'EXIT',state:source.redemption.status==='DISCHARGED'?'CONFIRMED':'UNKNOWN',disposition:null});
          const fresh=['LIVE','SPENT'].includes(current.note.state),zero={available:'0',reserved:'0',locked:'0',recovery:'0'};
          return freeze({descriptor,asset,identity:ownerIdentitySHA256,assets:[{asset,status:fresh?'LIVE':'UNAVAILABLE',
            observed:fresh?{blockNumber:current.v.head.number,blockHash:current.v.head.hash,timestamp:current.v.head.timestamp}:null,
            balances:fresh?{...zero,available:current.note.available??'0'}:null,backing:fresh?current.note.backing:null,requests}],journal:requests,revision:null,
            checkpoint:{source,deposit:depositRow,observedHead:current.v.head,note:current.note}});
        },{readOrReconcile:true}),
        close(){assert.equal(arguments.length,0);stopped=true;challenges.clear();exitQuotes.clear();exitChallenges.clear();return closing??=(async()=>{let first;try{await exitClient.close();}catch(e){first=e;}for(const client of [ownerClient,...(ci51?[proofClients.claim_ingress]:[])]){try{client.stop();if(client===ownerClient&&!d27)client.close();else await client.closePrivateDeviceRootClaimV2();}catch(error){try{client.close();}catch{}first??=error;}}if(first)throw first;return{closed:true,inFlight:0};})();},
      });deviceRootClaimIntakes.set(api,{controller,runtime,claims,i,asset,ownerIdentitySHA256,alive,
        splSourceOriginal:{serial,alive,journal,descriptor,ownerIdentitySHA256,
          originalNative:()=>{assert.equal(i,1,'CLAIM_DEVICE_ROOT_SPL_SOURCE_DOMAIN');assert.equal(claims.nativeSplCustodyProfile,true,'CLAIM_DEVICE_ROOT_SPL_SOURCE_SYSTEM');const native=claims.nativeRuntimes[i];assertOwnedSolanaSplCustodyV1(native);return native;},
          install:binding=>{alive();assert.equal(splSourceBinding,null,'CLAIM_DEVICE_ROOT_SPL_SOURCE_ONCE');assert.equal(d27,null,'CLAIM_DEVICE_ROOT_SPL_BEFORE_D27');assert.equal(handoff,null,'CLAIM_DEVICE_ROOT_SPL_BEFORE_D27');assert.equal(intentId,null,'CLAIM_DEVICE_ROOT_SPL_BEFORE_FUND');splSourceBinding=binding;},
          beforeTarget:()=>{alive();assert.equal(d27,null,'CLAIM_DEVICE_ROOT_SPL_BEFORE_D27');assert.equal(handoff,null,'CLAIM_DEVICE_ROOT_SPL_BEFORE_D27');assert.equal(intentId,null,'CLAIM_DEVICE_ROOT_SPL_BEFORE_FUND');},
          empty:async()=>{const v=await view(input.claimDomain);assert.equal(v.snapshot.gateways[i].wrapperSupply,'0','CLAIM_DEVICE_ROOT_SPL_EMPTY_TARGET');assert.equal(v.snapshot.gateways[i].intents.length,0,'CLAIM_DEVICE_ROOT_SPL_EMPTY_TARGET');assert.equal(v.snapshot.gateways[i].tickets.length,0,'CLAIM_DEVICE_ROOT_SPL_EMPTY_TARGET');await observer.assertCurrent(v.snapshot);alive();}},
        retainObservation:()=>serial(async()=>{
          alive();stopped=true;challenges.clear();exitQuotes.clear();exitChallenges.clear();await exitClient.close();
          ownerClient.stop();if(d27)await ownerClient.closePrivateDeviceRootClaimV2();else ownerClient.close();
          if(ci51)await proofClients.claim_ingress.drainPrivateDeviceRootClaimObservationV3();
          const retained=await journal.read(),source=retained.apiDeviceRootClaims?.[0];assert.deepEqual(source?.descriptor,descriptor,'CLAIM_DEVICE_ROOT_ORIGINAL_SOURCE');
          assert.equal(source.ownerIdentitySHA256,ownerIdentitySHA256);if(d27?.phase==='PROVED')assert.deepEqual(source.d27Observation,{consent:d27.consent,commitment:d27.derived.commitment,nullifier:d27.derived.nullifier});
          const token=Object.freeze(Object.create(null));deviceRootClaimObservationRestartsV3.set(token,{controller,runtime,claims,keeper,i,asset,ownerIdentitySHA256,noteObserver,sourceIdentitySHA256,descriptor,source:copy(source),used:false});return token;
        },{readOrReconcile:true})});return api;
    }),
    prepare: request => serial(async () => {
      exactRecord(request, ['handoff']); const packet = handoffPacket(request.handoff), { config } = selected(packet.claimDomain);
      const id = claimIntentId({ claimDomain: packet.claimDomain, outputQ: packet.statement.output, amount: packet.statement.amount });
      const previous = (await journal.read()).deposits.find(v => v.id === id);
      if (previous) { assert.deepEqual(previous.packet, packet, 'CLAIM_PREPARE_ORIGINAL_HANDOFF'); return freeze(projectDeposit(previous)); }
      const privateHolder=isPrivateClaimPacket(packet);
      const secretInput=privateHolder?null:{claimDomain:packet.claimDomain,noteSecret:packet.opening.noteSecret,outputQ:packet.statement.output};
      const secret=privateHolder?packet.receiptBinding.secret:claimReceiptSecret(secretInput),refundSalt=privateHolder?packet.receiptBinding.refundSalt:claimRefundSalt(secretInput);
      const { native } = selected(packet.claimDomain), refundDestination = destination(packet.claimDomain, native.roles.depositor.endpoint,
        packet.statement.amount, config.refundMaxFee, refundSalt);
      const row = { id, claimDomain: packet.claimDomain, packet, history: [], secret,
        key: receiptKeyCommitment({ ledgerNamespace: config.ledgerNamespace, secret }), refundSalt, refundDestination,
        native: null, route: null, proofs: [], status: 'PREPARED' };
      await journal.update(data => { assert.ok(data.deposits.length < 32, 'CLAIM_CONTROLLER_INGRESS_LIMIT'); data.deposits.push(row); return data; });
      return freeze(projectDeposit(row));
    }),
    preposition: request => serial(async () => {
      exactRecord(request, ['intentId']); const row = await deposit(request.intentId), { config } = selected(row.claimDomain);
      await clearUnknown(); const state = await view(row.claimDomain), existing = state.gateway.intents.find(v => v.id === row.id);
      if (existing) { if (existing.state === '1') assertOriginalIntent(row, existing); return freeze(await syncRow(row, 'deposits')); }
      const t = terms(state, { action: A.PREPOSITION, operationId: row.id, revision: '1', amount: row.packet.statement.amount,
        destinationCommitment: config.escrowEndpointCommitment, maxFee: config.refundMaxFee, routeCommitment: ownerBinding(row.packet) });
      const permit = await authorize('backing', { claimDomain: row.claimDomain, terms: t, route: null,
        ownerAuthorization: { statement: row.packet.statement, proof: row.packet.proofResult.proof } });
      await assertAuthorizationSnapshot(state.snapshot, permit.head);
      await evm({ domain: row.claimDomain, operationId: row.id, stage: 'PREPOSITION', method: 'preposition',
        args: [proofABI(row.packet.proofResult), permit.authorization], snapshot: state.snapshot });
      return freeze(await syncRow(row, 'deposits'));
    }),
    ingress: request => serial(async () => {
      exactRecord(request, ['intentId']); const row = await deposit(request.intentId), { config, native } = selected(row.claimDomain);
      await clearUnknown(); const current = await view(row.claimDomain); assertOriginalIntent(row, current.gateway.intents.find(v => v.id === row.id));
      if (row.native) {
        if (row.native.binding) await observeNative(row, 'deposits');
        if (row.native.firstSendReady === true && row.native.status === 'RESERVED_BEFORE_BROADCAST') {
          const adapter = native.adapter({ asset: config.nativeAsset, route: 'deposit' });
          assert.equal(typeof adapter.resumeReservedIngress, 'function', 'CLAIM_INGRESS_EXPLICIT_FIRST_SEND_ONLY');
          row.native.firstSendReady = false; await saveRow('deposits', row);
          try {
            await adapter.resumeReservedIngress({ nativeId: row.native.binding.request.nativeId }, {
              beforeBroadcast: prepared => authorizeIngressBroadcast(row, prepared, adapter),
              beforeSend: prepared => beforeIngressSend(row, prepared),
              assertBeforeSend: prepared => assertIngressSend(row, prepared),
            });
            row.native.status = 'BROADCAST'; await saveRow('deposits', row);
          } catch (error) {
            row.status = 'UNKNOWN'; await retainFailure(error, () => saveRow('deposits', row));
            if (!(await reconcileLostSolanaBroadcast(row, 'deposits', error))) throw error;
          }
        }
        return freeze(await syncRow(row, 'deposits'));
      }
      const adapter = native.adapter({ asset: config.nativeAsset, route: 'deposit' });
      row.route = await route(row.claimDomain, 'refund', row.packet.statement.amount, config.refundMaxFee, row.refundSalt);
      row.native = { status: 'ATTEMPT_STARTED', wireSalt: randomBytes(32).toString('hex'), prepared: null, nativeId: null, signed: null, binding: null };
      row.status = 'UNKNOWN'; await saveRow('deposits', row);
      const originalSplIngress = isOwnedSolanaSplCustodyV1(native);
      // The journal retains bytes; the original SPL adapter retains identity.
      // This continuation stays local to the one transfer, never in the journal.
      let splIngressPreparation = null, splIngressSigned = false;
      try {
        await adapter.transfer({ amount: row.packet.statement.amount, wireKeyCommitment: row.key }, {
          async beforeSign(prepared) {
            if (originalSplIngress) {
              assert.equal(splIngressPreparation, null, 'CLAIM_SPL_INGRESS_PREPARATION_ONCE');
              splIngressPreparation = { prepared, captured: null, ready: false };
              splIngressPreparation.captured = freeze(copy(prepared));
              assert.equal(prepared.intent.wireKeyCommitment, row.key);
            }
            const fresh = await authorizationView(row.claimDomain); assertOriginalIntent(row, fresh.gateway.intents.find(v => v.id === row.id));
            assert.equal(prepared.intent.wireKeyCommitment, row.key);
            const auditStarted = performance.now();
            const authorization = await quorum.authorizeIngress({ claimDomain: row.claimDomain, intentId: row.id, prepared, wireSalt: row.native.wireSalt });
            row.native = { ...row.native, prepared: copy(prepared), presignAuthorization: authorization, status: 'SIGNING_UNKNOWN' };
            await saveRow('deposits', row);
            await assertAuthorizationSnapshot(fresh.snapshot, authorization.head);
            assert.ok(performance.now() - auditStarted < 30_000, 'CLAIM_PRESIGN_AUDIT_TOO_OLD');
            await adapter.assertPrepared(prepared);
            live(); assert.ok(performance.now() - auditStarted < 30_000, 'CLAIM_PRESIGN_AUDIT_TOO_OLD');
            if (originalSplIngress) {
              const token = splIngressKey(row, prepared, authorization, auditStarted);
              assert.equal(prepared, splIngressPreparation.prepared);
              assert.deepEqual(prepared, splIngressPreparation.captured);
              splIngressPreparation.ready = true;
              return token;
            }
          },
          async onSigned(signed) {
            if (!originalSplIngress) return reserveNative(row, 'deposits', row.native.prepared, signed);
            assert.equal(splIngressSigned, false, 'CLAIM_SPL_INGRESS_SIGNED_ONCE');
            splIngressSigned = true;
            assert.ok(splIngressPreparation?.ready, 'CLAIM_SPL_INGRESS_PREPARATION_REQUIRED');
            const prepared = splIngressPreparation.prepared;
            assert.deepEqual(prepared, splIngressPreparation.captured);
            assert.deepEqual(row.native.prepared, splIngressPreparation.captured);
            return reserveNative(row, 'deposits', prepared, signed);
          },
          ...(native.nonceIngressProfile === 'LIANUM_GENERIC_NATIVE_CLAIM_INGRESS_V3' ? {
            beforeBroadcast: prepared => authorizeIngressBroadcast(row, prepared, adapter),
              beforeSend: prepared => beforeIngressSend(row, prepared),
              assertBeforeSend: prepared => assertIngressSend(row, prepared),
          } : {}),
        });
        row.native.status = 'BROADCAST'; await saveRow('deposits', row);
      } catch (error) { row.status = 'UNKNOWN'; await retainFailure(error, () => saveRow('deposits', row));
        if (!(await reconcileLostSolanaBroadcast(row, 'deposits', error))) throw error;
      }
      return freeze(await syncRow(row, 'deposits'));
    }),
    issue: request => serial(async () => {
      exactRecord(request, ['intentId', ...(Object.hasOwn(request, 'handoff') ? ['handoff'] : [])]);
      const row = await deposit(request.intentId);
      if (Object.hasOwn(request, 'handoff'))
        assert.deepEqual(handoffPacket(request.handoff, row.claimDomain), row.packet, 'CLAIM_ISSUE_CURRENT_OWNER_HANDOFF');
      // The authenticated keeper retains this single scoped opening and the
      // original D27. It holds no owner spend key. A restarted keeper must pass
      // fresh original-intent reconciliation before this path becomes usable.
      await clearUnknown(); const original = await view(row.claimDomain);
      if (original.gateway.intents.find(v => v.id === row.id)?.state === '2') return freeze(await syncRow(row, 'deposits'));
      assertOriginalIntent(row, original.gateway.intents.find(v => v.id === row.id));
      if(isPrivateClaimPacket(row.packet))assert.ok(!(await journal.read()).evm.some(v=>v.operationId===row.id&&v.method==='issue'),'CLAIM_PRIVATE_CI51_ORIGINAL_ISSUE_OBSERVE_ONLY');
      const proof = await evidence(row, 'deposits',request.handoff), { config } = selected(row.claimDomain), state = await authorizationView(row.claimDomain);
      const intent = state.gateway.intents.find(v => v.id === row.id); assertOriginalIntent(row, intent);
      const t = terms(state, { action: A.ISSUE, operationId: row.id, revision: intent.revision, amount: row.packet.statement.amount,
        destinationCommitment: row.refundDestination, maxFee: config.refundMaxFee, nullifier: row.native.binding.admissionN,
        wireBindingCommitment: row.native.binding.wireBindingCommitment, routeCommitment: proof.statement.ingressReceiptLeaf });
      const permit = await authorize('backing', { claimDomain: row.claimDomain, terms: t, route: null, ownerAuthorization: null });
      await assertAuthorizationSnapshot(state.snapshot, permit.head);
      const sent = await evm({ domain: row.claimDomain, operationId: row.id, stage: 'ISSUE', method: 'issue', handoff: request.handoff,
        args: [proofABI(row.packet.proofResult), proofABI(proof.result), permit.authorization], snapshot: state.snapshot });
      row.issueSubmission = { transactionHash: sent.signed.nativeId.slice(2), calldataSHA256: sent.calldataSHA256 }; await saveRow('deposits', row);
      return freeze(await syncRow(row, 'deposits'));
    }),
    renew: request => serial(async () => {
      exactRecord(request, ['intentId', 'handoff']); const row = await deposit(request.intentId), packet = handoffPacket(request.handoff, row.claimDomain);
      await clearUnknown(); const state = await view(row.claimDomain), intent = state.gateway.intents.find(v => v.id === row.id);
      assert.equal(intent?.state, '1'); assert.equal(packet.statement.output, row.packet.statement.output); assert.equal(packet.statement.amount, row.packet.statement.amount);
      assert.ok(!isPrivateClaimPacket(row.packet),'CLAIM_PRIVATE_CI51_NO_RENEWAL');
      assert.deepEqual(packet.opening, row.packet.opening, 'CLAIM_RENEW_ORIGINAL_OPENING');
      if (intent.validUntil === packet.statement.validUntil && intent.proofHash === claimHash(Buffer.from(packet.proofResult.proof, 'hex'))) {
        if (row.packet.handoffIdentitySHA256 !== packet.handoffIdentitySHA256) { row.history.push(row.packet); row.packet = packet; await saveRow('deposits', row); }
        return freeze(await syncRow(row, 'deposits'));
      }
      assertOriginalIntent(row, intent); assert.ok(BigInt(packet.statement.validUntil) > BigInt(intent.validUntil), 'CLAIM_RENEW_LATER_EXPIRY');
      // Preserve candidate before the EVM call; reopening can reconcile exactly.
      row.renewalCandidate = packet; await saveRow('deposits', row);
      await evm({ domain: row.claimDomain, operationId: row.id, stage: 'RENEW', method: 'renewIntent',
        args: [proofABI(packet.proofResult), intent.revision, state.gateway.claimSequence], snapshot: state.snapshot });
      row.history.push(row.packet); row.packet = packet; delete row.renewalCandidate; await saveRow('deposits', row);
      return freeze(await syncRow(row, 'deposits'));
    }),
    voidDeposit: request => serial(async () => {
      exactRecord(request,['intentId',...(Object.hasOwn(request,'handoff')?['handoff']:[])]);const row=await deposit(request.intentId);
      if(Object.hasOwn(request,'handoff'))assert.deepEqual(handoffPacket(request.handoff,row.claimDomain),row.packet,'CLAIM_VOID_CURRENT_OWNER_HANDOFF');
      await clearUnknown();
      let state = await view(row.claimDomain), intent = state.gateway.intents.find(v => v.id === row.id);
      if (intent?.state === '3') return freeze(await syncRow(row, 'deposits'));
      assert.equal(intent?.state, '1'); assert.ok(BigInt(state.snapshot.head.timestamp) >= BigInt(intent.validUntil), 'CLAIM_LATEST_EXPIRY_NOT_PASSED');
      const proof = await evidence(row,'deposits',request.handoff);
      state = await authorizationView(row.claimDomain);
      const health = await authorize('health', { claimDomain: row.claimDomain, mode: 'debt' });
      await assertAuthorizationSnapshot(state.snapshot, health.head);
      intent = state.gateway.intents.find(v => v.id === row.id); assert.equal(intent?.state, '1');
      assert.ok(BigInt(state.snapshot.head.timestamp) >= BigInt(intent.validUntil), 'CLAIM_LATEST_EXPIRY_NOT_PASSED');
      await evm({ domain: row.claimDomain, operationId: row.id, stage: 'VOID', method: 'voidDeposit',
        args: [proofABI(proof.result), intent.revision, state.gateway.claimSequence, health.message.validFrom, health.message.validUntil, health.abiSignatures], snapshot: state.snapshot });
      return freeze(await syncRow(row, 'deposits'));
    }),
    requestRedemption: request => serial(async () => {
      exactRecord(request, ['claimDomain', 'caller', 'amount', 'maxFee', ...(Object.hasOwn(request, 'requestId') ? ['requestId'] : [])]);
      const { config } = selected(request.claimDomain);
      claimUint(request.amount); claimUint(request.maxFee); assert.ok(BigInt(request.amount) > 0n && BigInt(request.maxFee) > 0n);
      assert.ok(runtime.accounts.includes(request.caller), 'CLAIM_REDEMPTION_CALLER');
      const immutableRequest = { claimDomain: request.claimDomain, caller: request.caller, amount: request.amount, maxFee: request.maxFee };
      const requestId = request.requestId ?? claimHash(Buffer.from(JSON.stringify(immutableRequest))); bytes32(requestId, true);
      await clearUnknown();
      const prior = (await journal.read()).tickets.find(v => v.redemptionRequestId === requestId);
      if (prior) assert.deepEqual(prior.redemptionRequest, immutableRequest, 'CLAIM_REDEMPTION_REQUEST_REBOUND');
      let state = await view(request.claimDomain);
      if (prior && state.gateway.tickets.some(v => v.ticket.id === prior.id)) return freeze(await syncRow(prior, 'tickets'));
      const salt = prior?.salt ?? randomBytes(32).toString('hex');
      const nativeRoute = await route(request.claimDomain, 'redeem', request.amount, request.maxFee, salt);
      state = await authorizationView(request.claimDomain);
      const dst = destination(request.claimDomain, nativeRoute.endpoint, request.amount, request.maxFee, salt);
      const id = claimTicketId({ claimDomain: request.claimDomain, kind: '1', nonce: state.gateway.nextTicketNonce });
      if (prior) assert.equal(id, prior.id, 'CLAIM_REDEMPTION_ORIGINAL_NONCE_CHANGED');
      const t = terms(state, { action: A.REDEEM, operationId: id, revision: '1', amount: request.amount, destinationCommitment: dst,
        maxFee: request.maxFee, routeCommitment: claimRouteCommitment(nativeRoute), wireBindingCommitment: request.caller.slice(2).padStart(64, '0') });
      const permit = await authorize('backing', { claimDomain: request.claimDomain, terms: t, route: nativeRoute, ownerAuthorization: null });
      const secret = claimTicketSecret({ claimDomain: request.claimDomain, ticketId: id });
      const proposed = { kind: '1', id, claimDomain: request.claimDomain, amount: request.amount, destinationCommitment: dst,
        maxFee: request.maxFee, referenceIngressN: ZERO, referenceQ: ZERO };
      await journal.update(data => {
        if (prior) { const row = data.tickets.find(v => v.id === id); assert.deepEqual(row.ticket, proposed);
          row.redemptionRoute = copy(nativeRoute); }
        else { assert.ok(!data.tickets.some(v => v.id === id), 'CLAIM_REDEMPTION_ALREADY_ATTEMPTED');
          data.tickets.push({ id, claimDomain: request.claimDomain, ticket: proposed, secret,
            key: receiptKeyCommitment({ ledgerNamespace: config.ledgerNamespace, secret }), salt, route: null, native: null, proofs: [],
            status: 'BURN_UNKNOWN', caller: request.caller, redemptionRequestId: requestId, redemptionRequest: immutableRequest,
            redemptionRoute: copy(nativeRoute) }); }
        return data;
      });
      await assertAuthorizationSnapshot(state.snapshot, permit.head);
      await evm({ domain: request.claimDomain, operationId: id, stage: 'REDEEM', method: 'requestRedemption', caller: request.caller,
        args: [request.amount, prefix(dst), request.maxFee, nativeRoute, permit.authorization], snapshot: state.snapshot });
      return freeze(await syncRow(await ticket(id), 'tickets'));
    }),
    payout: request => serial(async () => {
      exactRecord(request, ['ticketId']); beginAuditOwner?.begin();
      const row = await ticket(request.ticketId), { config, native } = selected(row.claimDomain);
      if (beginAuditOwner) {
        assert.equal(config.nativeFamily, '2', 'CLAIM_BEGIN_AUDIT_SOL_ONLY');
        assert.equal(row.ticket.kind, '1', 'CLAIM_BEGIN_AUDIT_REDEMPTION_ONLY');
        assert.equal(row.ticket.amount, '3000000', 'CLAIM_BEGIN_AUDIT_FIXED_AMOUNT');
        assert.equal(row.ticket.maxFee, '5000', 'CLAIM_BEGIN_AUDIT_FIXED_FEE');
        assert.equal(row.native, null, 'CLAIM_BEGIN_AUDIT_FIRST_PAYOUT_ONLY');
        const burns = (await journal.read()).evm.filter(value => value.stage === 'REDEEM' && value.operationId === row.id);
        assert.equal(burns.length, 1, 'CLAIM_BEGIN_AUDIT_ORIGINAL_BURN_REQUIRED');
        const burn = burns[0];
        assert.equal(burn.method, 'requestRedemption'); assert.equal(burn.status, 'SUCCEEDED');
        assert.equal(burn.receipt?.status, '0x1');
        assert.equal(burn.finalAudit?.profile, FINAL_AUDIT_PROFILE);
        assert.equal(burn.finalAudit?.phase, 'CONSUMED_BEFORE_KEY');
        assert.equal(burn.finalAudit.limitMilliseconds, 30000);
        assert.ok(Number.isSafeInteger(burn.finalAudit.auditElapsedMilliseconds)
          && burn.finalAudit.auditElapsedMilliseconds >= 0 && burn.finalAudit.auditElapsedMilliseconds < 30000,
          'CLAIM_BEGIN_AUDIT_ORIGINAL_BURN_BUDGET');
      }
      await clearUnknown(); let state = await view(row.claimDomain), current = state.gateway.tickets.find(v => v.ticket.id === row.id);
      assert.ok(current); assert.deepEqual(current.ticket, row.ticket);
      if (current.state === '4') return freeze(await syncRow(row, 'tickets'));
      if (!row.native) {
        assert.equal(current.state, '1', 'CLAIM_ORIGINAL_PAYOUT_ATTEMPT_REQUIRED');
        const adapter = native.adapter({ asset: config.nativeAsset, route: row.ticket.kind === '2' ? 'refund' : 'redeem' });
        row.native = { status: 'ATTEMPT_STARTED', wireSalt: randomBytes(32).toString('hex'), prepared: null, nativeId: null, signed: null, binding: null };
        row.status = 'UNKNOWN'; await saveRow('tickets', row);
        try {
          await adapter.transfer({ amount: row.ticket.amount, wireKeyCommitment: row.key }, {
            async beforeSign(prepared) {
              row.route = await route(row.claimDomain, row.ticket.kind === '2' ? 'refund' : 'redeem', row.ticket.amount, row.ticket.maxFee, row.salt, prepared);
              assert.equal(destination(row.claimDomain, row.route.endpoint, row.ticket.amount, row.ticket.maxFee, row.salt), row.ticket.destinationCommitment);
              const fresh = await authorizationView(row.claimDomain), t = terms(fresh, { action: A.BEGIN_PAYOUT, operationId: row.id, revision: '1', amount: row.ticket.amount,
                destinationCommitment: row.ticket.destinationCommitment, maxFee: row.ticket.maxFee, routeCommitment: claimRouteCommitment(row.route) });
              const permit = await authorize('backing', { claimDomain: row.claimDomain, terms: t, route: row.route, ownerAuthorization: null, prepared });
              if (beginAuditOwner) {
                // This is the actual original controller/quorum result. No audit
                // round, predicate, await or signing path is replaced or shortened.
                const origin = authorizationOrigins.get(permit.authorization);
                assert.ok(origin && origin.result === permit && origin.dispatch === null, 'CLAIM_BEGIN_AUDIT_ORIGINAL_AUTHORIZATION');
                assert.equal(origin.method, 'backing'); assert.equal(origin.request.terms.action, A.BEGIN_PAYOUT);
                assert.equal(origin.request.terms.operationId, row.id);
                assert.deepEqual(origin.request.prepared, prepared);
                assert.equal(permit.authorizationLifecycleProfile, 'CLAIM_AUTHORIZATION_LIFECYCLE_V4');
                assert.deepEqual(permit.indexes, [0, 1, 2]);
                live(); assertIngressKeeperLive();
                const digest = value => claimHash(Buffer.from(JSON.stringify(value)));
                beginAuditOwner.stop({ profile: CLAIM_BEGIN_PAYOUT_AUDIT_PROFILE_V1, method: 'BEGIN_PAYOUT',
                  phase: 'BACKING_RETURNED_BEFORE_DISPATCH', limitMilliseconds: 30000,
                  originalAuditGuardsPassed: true, selectedSignerCount: permit.indexes.length,
                  originalAuthorizationSHA256: digest(origin.captured), preparedSHA256: digest(prepared),
                  requestSHA256: digest(origin.request), originalHeadSHA256: digest(permit.head) });
              }
              await assertAuthorizationSnapshot(fresh.snapshot, permit.head);
              row.native.prepared = copy(prepared); await saveRow('tickets', row);
              const beginReceipt = await evm({ domain: row.claimDomain, operationId: row.id, stage: 'BEGIN_PAYOUT', method: 'beginPayout',
                args: [prefix(row.id), row.route, permit.authorization], snapshot: fresh.snapshot });
              // beginPayout changes EVM state; its pre-call anchor cannot be reused.
              const signing = await view(row.claimDomain);
              if(isOwnedSolanaSplCustodyV1(native))await adapter.authorizeOriginalBeginV1(prepared,splBeginAuthority(row,prepared,permit,t,beginReceipt,signing));
              const authorization = await quorum.authorizePayout({ claimDomain: row.claimDomain, ticketId: row.id, prepared, route: row.route, wireSalt: row.native.wireSalt });
              row.native.status = 'SIGNING_UNKNOWN'; row.native.presignAuthorization = authorization; await saveRow('tickets', row);
              await assertAuthorizationSnapshot(signing.snapshot, authorization.head);
              await adapter.assertPrepared(prepared);
              // Retain the post-beginPayout original anchor through the final
              // native await; never replace it with a newer head or certificate.
              await assertAuthorizationSnapshot(signing.snapshot, authorization.head);
              live(); return payoutKeyAuthorityV4(row, prepared, authorization);
            },
            async onSigned(signed) { await reserveNative(row, 'tickets', row.native.prepared, signed); },
            ...(config.nativeFamily === '1' ? { payoutSendToken: bitcoinPayoutSendToken(row, adapter) } : {}),
            ...(isOwnedSolanaSplCustodyV1(native)?{payoutPreparationToken:splPayoutPreparation(row)}:{}),
            ...(config.nativeFamily === '2' && (native.nonceInfrastructure || native.nonceInfrastructureByAuthority || isOwnedSolanaSplCustodyV1(native)) ? {
              beforeBroadcast: prepared => authorizePayoutBroadcast(row, prepared, adapter),
            } : {}),
          });
          row.native.status = 'BROADCAST'; await saveRow('tickets', row);
        } catch (error) { row.status = 'UNKNOWN';
          if (beginAuditOwner?.pendingStop(error)) {
            // The stop is evidence only after the original UNKNOWN row is
            // durably acknowledged. Never let retainFailure preserve a stop
            // marker over a poisoned keeper's failed persistence operation.
            await saveRow('tickets', row); assertIngressKeeperLive();
            beginAuditOwner.acknowledgeRetention(error); throw error;
          }
          await retainFailure(error, () => saveRow('tickets', row));
          if (!(await reconcileLostSolanaBroadcast(row, 'tickets', error))) throw error;
        }
      }
      else if (row.native.binding) {
        const alreadyObserved = await observeNative(row, 'tickets');
        if (!alreadyObserved && row.native.status === 'RESERVED_BEFORE_BROADCAST') {
          const adapter = native.adapter({ asset: config.nativeAsset, route: row.ticket.kind === '2' ? 'refund' : 'redeem' });
          assert.equal(typeof adapter.resumeReservedPayout, 'function', 'CLAIM_ORIGINAL_FIRST_SEND_REQUIRED');
          try {
            await adapter.resumeReservedPayout({ nativeId: row.native.binding.request.nativeId }, {
              beforeBroadcast: prepared => authorizePayoutBroadcast(row, prepared, adapter),
            });
            row.native.status = 'BROADCAST'; await saveRow('tickets', row);
          } catch (error) {
            row.status = 'UNKNOWN'; await retainFailure(error, () => saveRow('tickets', row));
            if (!(await reconcileLostSolanaBroadcast(row, 'tickets', error))) throw error;
          }
        }
      }
      // Observation never re-enters transfer, including after a lost reply.
      if (!row.native.binding || !(await observeNative(row, 'tickets'))) return freeze(await syncRow(row, 'tickets'));
      const proof = await evidence(row, 'tickets');
      state = await authorizationView(row.claimDomain);
      const health = await authorize('health', { claimDomain: row.claimDomain, mode: 'debt' });
      await assertAuthorizationSnapshot(state.snapshot, health.head);
      await evm({ domain: row.claimDomain, operationId: row.id, stage: 'DISCHARGE', method: 'discharge',
        args: [proofABI(proof.result), state.gateway.claimSequence, health.message.validFrom, health.message.validUntil, health.abiSignatures], snapshot: state.snapshot });
      return freeze(await syncRow(row, 'tickets'));
    }),
    reconcile: request => serial(async () => {
      exactRecord(request, ['operationId']); bytes32(request.operationId, true);
      for (const row of (await journal.read()).evm.filter(v => v.operationId === request.operationId && !terminal(v.status))) await resolveEvm(row);
      const data = await journal.read(), dep = data.deposits.find(v => v.id === request.operationId), t = data.tickets.find(v => v.id === request.operationId);
      assert.ok(dep || t, 'CLAIM_UNKNOWN_OPERATION'); const row = dep ?? t, collection = dep ? 'deposits' : 'tickets';
      if (row.native?.binding) await observeNative(row, collection);
      if (dep) {
        const issued = data.evm.findLast(v => v.operationId === row.id && v.method === 'issue' && v.status === 'SUCCEEDED');
        if (issued) row.issueSubmission = { transactionHash: issued.signed.nativeId.slice(2), calldataSHA256: issued.calldataSHA256 };
      }
      return freeze(await syncRow(row, collection));
    }, { readOrReconcile: true }),
    reconcileAll: request => serial(async () => {
      exactRecord(request, []);
      // Storage integrity is necessary but cannot certify a chain effect.
      // Re-read terminal receipts too: an old SUCCEEDED marker is not finality.
      for (const row of (await journal.read()).evm) {
        const resolved = await resolveEvm(row, { fresh: true });
        assert.ok(terminal(resolved.status), 'CLAIM_UNKNOWN_EVM_RECONCILE_ORIGINAL_ONLY');
      }
      assert.equal(runtime.mutationStatus.uncertain, false, 'CLAIM_EVM_AUTHORITY_UNCERTAINTY_REMAINS');
      for (const collection of ['deposits', 'tickets']) {
        for (const row of (await journal.read())[collection]) {
          if (collection === 'deposits') {
            validatePacket(row.packet);
            if (row.renewalCandidate) validatePacket(row.renewalCandidate);
          }
          if (row.native) {
            assert.ok(row.native.binding, 'CLAIM_UNRESOLVED_NATIVE_SIGNING_REQUIRES_RECONCILIATION');
            const observed = await observeNative(row, collection);
            assert.ok(observed || collection === 'tickets' && row.native.status === 'RESERVED_BEFORE_BROADCAST',
              'CLAIM_NATIVE_FINALITY_UNRESOLVED');
          }
          if (collection === 'deposits' && row.renewalCandidate) {
            const current = (await view(row.claimDomain)).gateway.intents.find(item => item.id === row.id);
            if (current?.proofHash === claimHash(Buffer.from(row.renewalCandidate.proofResult.proof, 'hex'))) {
              row.history.push(row.packet); row.packet = row.renewalCandidate; delete row.renewalCandidate;
              await saveRow(collection, row);
            }
          }
          if (collection === 'deposits') {
            const issued = (await journal.read()).evm.findLast(item => item.operationId === row.id
              && item.method === 'issue' && item.status === 'SUCCEEDED');
            if (issued) row.issueSubmission = { transactionHash: issued.signed.nativeId.slice(2), calldataSHA256: issued.calldataSHA256 };
          }
          await syncRow(row, collection);
        }
      }
      journal.acknowledgeReconciliation?.();
      return freeze({ reconciled: true, nativeNodeRestart: false });
    }, { readOrReconcile: true }),
    /** Explicit private local-harness handle, separate from public projection.
     * This only reads retained identity; it grants no signing/resend capability. */
    privateNativeReceipt: request => serial(async () => {
      exactRecord(request, ['operationId']); const data = await journal.read(), row = [...data.deposits, ...data.tickets].find(v => v.id === request.operationId);
      assert.ok(row?.native?.binding, 'CLAIM_NO_RETAINED_NATIVE_RECEIPT'); const b = row.native.binding;
      return freeze({ family: b.request.family, nativeId: b.request.nativeId, transactionSHA256: b.transactionSHA256,
        broadcastAttempts: selected(row.claimDomain).native.transfers.find(v => nativeIdOf(v, b.request.family) === b.request.nativeId)?.broadcastAttempts ?? null });
    }, { readOrReconcile: true }),
    status: () => serial(async () => { const data = await journal.read(); return freeze({ profile: 'OWNED_LOCAL_CUSTODIAL_NATIVE_CLAIMS', independentOperators: false,
      controllerRestart: true, keeperRestart: keeper.status().keeperRestart, nativeNodeRestart: false,
      requiresExternalEffectReconciliation: Boolean(journal.requiresReconciliation?.()),
      readiness: 'REQUIRES_FRESH_OPERATION_AUDIT', deposits: data.deposits.map(projectDeposit), tickets: data.tickets.map(projectTicket) }); }, { readOrReconcile: true }),
    close() {
      // Releasing the original idle lease is local teardown, not an effect.
      // A poisoned/closed operator or runtime must still allow its keeper child
      // to stop. Operational methods retain all of live()'s authority checks.
      assert.ok(!closed, 'CLAIM_CONTROLLER_CLOSED'); assert.ok(!busy, 'CLAIM_CONTROLLER_BUSY');
      journal.release(); closed = true;
    },
  });
  controllers.set(controller, { input: { ...input, operators, proofClients }, live, journal, serial, rootView:view, rootSelected:selected, readers, observer, projectDeposit,
    privateFinalAuditTiming: () => privateFinalAuditTiming === null ? null : freeze(copy(privateFinalAuditTiming)),
    ...(beginAuditOwner ? { assertBeginAuditReceipt(receipt) {
      assert.ok(!closed && !busy, 'CLAIM_BEGIN_AUDIT_ORIGINAL_UNWOUND_CONTROLLER');
      beginAuditOwner.assertReceipt(receipt);
    }, matchesBeginAuditStop(error) { return !closed && !busy && beginAuditOwner.matches(error); },
      consumeBeginAuditStop(error) {
      assert.ok(!closed && !busy, 'CLAIM_BEGIN_AUDIT_ORIGINAL_UNWOUND_CONTROLLER');
      try { assertIngressKeeperLive(); } catch (error) { beginAuditOwner.fail(); throw error; }
      return beginAuditOwner.consume(error);
    } } : {}),
    restartPending: false, restartInterrupted: false, replacement: null });
  return controller;
}

/** Private original-brand numeric diagnostics only. Copies/proxies cannot
 * select a journal, renew an authorization or recover financial authority. */
export function nativeClaimControllerPrivateFinalAuditTimingV1(controller) {
  assert.equal(arguments.length, 1, 'CLAIM_PRIVATE_FINAL_AUDIT_TIMING_NO_OPTIONS');
  const original = controllers.get(controller);
  assert.ok(original, 'CLAIM_PRIVATE_FINAL_AUDIT_TIMING_ORIGINAL_CONTROLLER_REQUIRED');
  return original.privateFinalAuditTiming();
}

/** Private bootstrap/session capability access. Serialized lookalikes cannot
 * choose a keeper, runtime, operator set or signing account. */
export function ownedNativeClaimControllerBindings(controller) {
  const state = controllers.get(controller); assert.ok(state, 'CLAIM_OWNED_CONTROLLER_REQUIRED'); state.live();
  const { runtime, claims, keeper } = state.input;
  return Object.freeze({ runtime, claims, keeper });
}

/** Fixed private SOURCE producer context. The original controller and owner
 * must already belong to the SAME SPL system; no caller identity/role packet
 * can mint this binding. The public prover identity is not a signing grant. */
export function originalNativeSplClaimSourceContextV1(controller, owner) {
  assert.equal(arguments.length, 2, 'CLAIM_SPL_SOURCE_CONTEXT_ARITY');
  const state = controllers.get(controller); assert.ok(state, 'CLAIM_OWNED_CONTROLLER_REQUIRED'); state.live();
  const { runtime, claims, keeper, ingressProverIdentity } = state.input;
  assert.equal(claims.nativeSplCustodyProfile, true, 'CLAIM_SPL_ORIGINAL_SOURCE_SYSTEM');
  assert.equal(claims.configs.length, 2, 'CLAIM_SPL_ORIGINAL_SOURCE_SYSTEM');
  const native = claims.nativeRuntimes[1]; assertOwnedSolanaSplCustodyV1(native);
  assertOwnedFlatOwnerProcess(owner, { runtime, system: claims.flatSystem, poolIndex: 1 });
  assert.equal(owner.report().closed, false, 'CLAIM_SPL_SOURCE_OWNER_CLOSED');
  bytes32(ingressProverIdentity, true);
  return Object.freeze({ runtime, claims, keeper, native, ingressProverIdentity });
}

/** A real child-process replacement, preserving the original native/EVM
 * authorities. This never clears an unresolved signing or delivery fence. */
export async function restartNativeClaimController(controller) {
  const state = controllers.get(controller); assert.ok(state, 'CLAIM_OWNED_CONTROLLER_REQUIRED');
  assert.ok(!state.consumeBeginAuditStop, 'CLAIM_BEGIN_AUDIT_LIFETIME_CANNOT_RESTART');
  assert.ok(!state.restartPending && !state.replacement, 'CLAIM_CONTROLLER_RESTART_ALREADY_ACTIVE');
  if (!state.restartInterrupted) state.live();
  assert.equal(typeof state.input.keeper.restart, 'function', 'CLAIM_DURABLE_KEEPER_REQUIRED');
  state.restartPending = true;
  try {
    if (!state.restartInterrupted) { controller.close(); state.restartInterrupted = true; }
    await state.input.keeper.restart();
    const reopened = await createNativeClaimController(state.input);
    state.replacement = reopened;
    // Return the fenced controller even when native history is temporarily
    // unavailable, so the client can reconcile the same original operations.
    try { await reopened.reconcileAll({}); }
    catch { /* The keeper fence remains set; status exposes the limitation. */ }
    return reopened;
  } finally { state.restartPending = false; }
}

// Fixed issuer discrimination; these predicates cannot mint or open authority.
export function isNativeClaimOriginalKeyAuthorityV4(token) { return originalKeyAuthoritiesV4.has(token); }
export function isNativeClaimBitcoinSendTokenV4(token) { return bitcoinPayoutSendTokens.has(token); }
export function isNativeClaimSolanaPayoutAuthorityV4(token) { return solanaPayoutAuthorities.has(token); }


/** Original controller-created intake only; copies cannot open any operation. */
export function assertOriginalDeviceRootClaimIntakeV2(intake){assert.equal(arguments.length,1);const state=deviceRootClaimIntakes.get(intake);assert.ok(state,'CLAIM_DEVICE_ROOT_ORIGINAL_INTAKE_REQUIRED');state.alive();return intake.descriptor;}

/** Prospectively fixes the ORIGINAL provider and co-owned SOL/SPL pair before
 * any controller FUND. It authorizes no SOURCE delivery: that provider still
 * requires its own original GRAPH proofs, invoice, lease and dispatch gate. */
export async function createOriginalDeviceRootSplSourceBindingV3(intake,provider){
  assert.equal(arguments.length,2,'CLAIM_DEVICE_ROOT_SPL_SOURCE_ARITY');const retained=deviceRootClaimIntakes.get(intake);
  assert.ok(retained?.splSourceOriginal,'CLAIM_DEVICE_ROOT_ORIGINAL_INTAKE_REQUIRED');retained.alive();
  const original={...retained.splSourceOriginal,runtime:retained.runtime,claims:retained.claims};
  return createDeviceRootSplSourceBindingV3(original,provider);
}
async function createDeviceRootSplSourceBindingV3(original,provider){
  const {serial,alive,journal,descriptor}=original,native=original.originalNative(),graph=readOwnedSolanaSplOriginalGraphV3(native);
  const expected={runtime:original.runtime,system:original.claims.flatSystem,poolIndex:0,nativeRuntime:graph,family:'2',recipientIndex:1};
  let closed=false,closing=false,closeWork,work=null,admitted=false;const observations=new Set();const binding={phase:'BORN',amount:null};
  const current=()=>{assert.ok(!closed,'CLAIM_DEVICE_ROOT_SPL_SOURCE_CLOSED');alive();assertOwnedSolanaSplGraphPairV1(native,graph);assertOwnedFlatNativeProvider(provider,expected);};
  const open=()=>{assert.ok(!closing,'CLAIM_DEVICE_ROOT_SPL_SOURCE_CLOSED');current();};
  const row=async()=>{const data=await journal.read(),r=data.apiDeviceRootClaims?.[0];assert.deepEqual(r?.descriptor,descriptor,'CLAIM_DEVICE_ROOT_ORIGINAL_SOURCE');assert.equal(r.ownerIdentitySHA256,original.ownerIdentitySHA256);return{data,r};};
  const store=async phase=>{binding.phase=phase;await journal.update(data=>{const r=data.apiDeviceRootClaims?.[0];assert.deepEqual(r?.descriptor,descriptor,'CLAIM_DEVICE_ROOT_ORIGINAL_SOURCE');assert.equal(r.ownerIdentitySHA256,original.ownerIdentitySHA256);r.splSource={profile:'ORIGINAL_DEVICE_ROOT_SPL_SOURCE_BINDING_V3',phase,amount:binding.amount};return data;});};
  await serial(async()=>{current();original.beforeTarget();const {data,r}=await row();assert.equal(data.deposits.length,0,'CLAIM_DEVICE_ROOT_BEFORE_FUND_REQUIRED');assert.equal(data.tickets.length,0,'CLAIM_DEVICE_ROOT_BEFORE_FUND_REQUIRED');assert.equal(data.evm.length,0,'CLAIM_DEVICE_ROOT_BEFORE_FUND_REQUIRED');assert.equal(r.phase,'BORN','CLAIM_DEVICE_ROOT_SPL_BEFORE_D27');assert.equal(r.admissions.length,0,'CLAIM_DEVICE_ROOT_SPL_BEFORE_FUND');assert.equal(r.splSource,undefined,'CLAIM_DEVICE_ROOT_SPL_SOURCE_ONCE');assert.equal(native.transfers.length,0,'CLAIM_DEVICE_ROOT_SPL_BEFORE_NATIVE');await original.empty();current();original.install(binding);await store('BORN');current();});
  const producer=Object.freeze({profile:'ORIGINAL_DEVICE_ROOT_SPL_SOURCE_BINDING_V3',custody:'BACKEND_LOCAL_QUORUM',automaticSourceDelivery:false,
    bindObservedOriginalOnce(){assert.equal(arguments.length,0,'CLAIM_DEVICE_ROOT_SPL_SOURCE_ARITY');open();assert.equal(admitted,false,'CLAIM_DEVICE_ROOT_SPL_SOURCE_ALREADY_ADMITTED');admitted=true;
      work=serial(async()=>{current();original.beforeTarget();const {r}=await row();assert.deepEqual(r.splSource,{profile:'ORIGINAL_DEVICE_ROOT_SPL_SOURCE_BINDING_V3',phase:'BORN',amount:null},'CLAIM_DEVICE_ROOT_SPL_SOURCE_CHANGED');assert.equal(native.transfers.length,0,'CLAIM_DEVICE_ROOT_SPL_BEFORE_NATIVE');await original.empty();current();
        // Durable UNKNOWN fence precedes capture and the original wrapping KEY.
        await store('BINDING');try{const token=await captureOwnedFlatSolanaSourceForSplV1(provider);current();await native.bindOriginalSourceV1(token);current();const amount=await native.quoteOriginalDepositAmountV1();current();assert.ok(typeof amount==='string'&&/^[1-9][0-9]*$/.test(amount),'CLAIM_DEVICE_ROOT_SPL_ORIGINAL_QUOTE');binding.amount=amount;await store('READY');current();return Object.freeze({profile:producer.profile,claimDomain:descriptor.claim.claimDomain,amount,sourceCustody:'BACKEND_LOCAL_QUORUM',privateCreditEstablished:false});}
        catch(error){binding.amount=null;try{await store('UNKNOWN');}catch{}throw error;}});work.catch(()=>{});return work;
    },
    status(){assert.equal(arguments.length,0,'CLAIM_DEVICE_ROOT_SPL_SOURCE_ARITY');open();const observation=serial(async()=>{current();const{r}=await row();current();assert.deepEqual(r.splSource,{profile:producer.profile,phase:binding.phase,amount:binding.amount},'CLAIM_DEVICE_ROOT_SPL_SOURCE_CHANGED');return Object.freeze({profile:producer.profile,phase:binding.phase,amount:binding.phase==='READY'?binding.amount:null,privateCreditEstablished:false,availablePrivateClaims:null});},{readOrReconcile:true});observations.add(observation);observation.finally(()=>observations.delete(observation)).catch(()=>{});return observation;},
    close(){assert.equal(arguments.length,0,'CLAIM_DEVICE_ROOT_SPL_SOURCE_ARITY');closing=true;return closeWork??=(async()=>{let first;try{if(work)await work;}catch(error){first=error;}for(const observation of observations)try{await observation;}catch(error){first??=error;}closed=true;if(first)throw first;return{closed:true};})();},
    toJSON(){throw Error('CLAIM_DEVICE_ROOT_SPL_SOURCE_NOT_SERIALIZABLE');}});
  return producer;
}

/** Original references for the fixed TLS/common-state consumer. A descriptor,
 * controller ID or serialized intake cannot satisfy this private membership. */
export function readOriginalDeviceRootClaimIntakeContextV2(intake) {
  assert.equal(arguments.length,1); const state=deviceRootClaimIntakes.get(intake);
  assert.ok(state,'CLAIM_DEVICE_ROOT_ORIGINAL_INTAKE_REQUIRED');state.alive();
  return Object.freeze({controller:state.controller,runtime:state.runtime,claims:state.claims,
    poolIndex:state.i,asset:state.asset,ownerIdentitySHA256:state.ownerIdentitySHA256});
}

export async function readOriginalDeviceRootClaimEconomicSnapshotV2(intake){
  assert.equal(arguments.length,1);assertOriginalDeviceRootClaimIntakeV2(intake);return intake.economicSnapshot();
}

/** Private observation facade. Its seed is retained by the original intake;
 * only the original controller replacement can select this function. */
function originalDeviceRootClaimObservationFacadeV3(seed,ctx){
 const descriptor=seed.descriptor,challenges=new Map(),exitChallenges=new Map();let stopped=false;
 const alive=()=>{ctx.live();assert.ok(!stopped,'CLAIM_DEVICE_ROOT_INTAKE_CLOSED');};
 const stable=s=>Object.fromEntries(['profile','descriptor','ownerIdentitySHA256','intentId','admissions','d27Observation','ci51Observation'].filter(k=>Object.hasOwn(s,k)).map(k=>[k,s[k]]));
 const source=async()=>{alive();const s=(await ctx.journal.read()).apiDeviceRootClaims?.[0];assert.deepEqual(stable(s),stable(seed.source),'CLAIM_DEVICE_ROOT_RETAINED_OBSERVATION_CHANGED');return s;};
 const publicExit=r=>r?freeze({jobId:r.consent.jobId,stage:r.stage,statement:r.consent.statement,path:r.consent.path,quoteId:r.consent.quoteId,rootId:r.consent.rootId,noteRevision:r.consent.noteRevision,witnessSHA256:r.consent.witnessSHA256,proofSHA256:r.proofSHA256,publicInputsSHA256:r.publicInputsSHA256,transactionHash:r.submission?.transactionHash??null,observation:r.confirmation??null}):null;
 function permission(action,exit=false,fields={},parentExpiry=Infinity){alive();const map=exit?exitChallenges:challenges;for(const[k,r]of map)if(r.value.expiresAt<=Date.now())map.delete(k);assert.ok(map.size<8,'CLAIM_DEVICE_ROOT_CHALLENGE_LIMIT');
  const shared={descriptor,rootId:null,noteRevision:null,jobId:null,statement:null,witnessSHA256:null,recipient:null,challengeId:randomBytes(32).toString('hex'),nonce:randomBytes(32).toString('hex'),expiresAt:Math.min(Date.now()+15000,parentExpiry)};
  const value=exit?DeviceClaim.validateDeviceRootClaimExitPermissionFreshV3({version:3,profile:DeviceClaim.DEVICE_ROOT_NATIVE_CLAIM_EXIT_V3,...shared,action,quoteId:null,path:null,proofSHA256:null,publicInputsSHA256:null,requestId:null,ticketId:null,amount:null,maxFee:null,...fields}):DeviceClaim.validateDeviceRootClaimPermissionFreshV2({version:2,profile:DeviceClaim.DEVICE_ROOT_NATIVE_CLAIM_PERMISSION_V2,...shared,action,commonSHA256:null});
  map.set(value.challengeId,{value,deadline:performance.now()+Math.min(15000,value.expiresAt-Date.now())});return value;
 }
 function consume(raw,signature,action,exit=false){alive();const value=exit?DeviceClaim.validateDeviceRootClaimExitPermissionFreshV3(raw):DeviceClaim.validateDeviceRootClaimPermissionFreshV2(raw),map=exit?exitChallenges:challenges,r=map.get(value.challengeId);assert.ok(r&&performance.now()<r.deadline,'CLAIM_DEVICE_ROOT_ORIGINAL_PERMISSION');assert.equal(value.action,action,'CLAIM_DEVICE_ROOT_REOPENED_OBSERVE_ONLY');assert.deepEqual(value,r.value);const pub=descriptor.claim.devicePublicKey,key=createPublicKey({format:'jwk',key:{kty:'EC',crv:'secp256k1',x:Buffer.from(pub.slice(2,66),'hex').toString('base64url'),y:Buffer.from(pub.slice(66),'hex').toString('base64url')}}),message=exit?DeviceClaim.deviceRootClaimExitPermissionMessageV3(value):DeviceClaim.deviceRootClaimPermissionMessageV2(value);try{assert.equal(verify('sha256',message,{key,dsaEncoding:'ieee-p1363'},Buffer.from(DeviceClaim.normalizeNativeClaimDeviceSignatureV1(signature),'hex')),true,'CLAIM_DEVICE_ROOT_DEVICE_SIGNATURE');}finally{message.fill(0);}map.delete(value.challengeId);return{value,check(){alive();assert.ok(performance.now()<r.deadline,'CLAIM_DEVICE_ROOT_ACCESS_EXPIRED');(exit?DeviceClaim.validateDeviceRootClaimExitPermissionFreshV3:DeviceClaim.validateDeviceRootClaimPermissionFreshV2)(value);}};}
 async function note(){const s=await source(),row=s.intentId?(await ctx.journal.read()).deposits.find(r=>r.id===s.intentId):null,v=await ctx.readers[seed.i].read();await ctx.readers[seed.i].assertCurrent(v);alive();
  const binding=s.d27Observation,cm=binding?.commitment??null,nf=binding?.nullifier??null;
  if(!row||row.status!=='ISSUED'||!binding||!cm||!nf)return{v,row,note:{state:'UNKNOWN',commitment:cm,nullifier:nf,available:null,backing:null,path:null}};
  assert.equal(row.claimDomain,descriptor.claim.claimDomain);assert.equal(row.packet.ownerIdentitySHA256,seed.ownerIdentitySHA256);assert.equal(row.packet.statement.output,cm);assert.equal(binding.consent.statement.output,cm);assert.deepEqual(binding.consent.descriptor,descriptor);
  const at=v.ledger.commitments.indexOf('0x'+cm);assert.ok(at>=0&&v.ledger.commitments.filter(x=>x==='0x'+cm).length===1,'CLAIM_DEVICE_ROOT_ORIGINAL_PATH_REQUIRED');const pathRaw=v.ledger.tree.path(at);
  assert.equal(verifyPrivateNotePath(pathRaw),true,'CLAIM_DEVICE_ROOT_ORIGINAL_PATH_REQUIRED');const path={root:pathRaw.root.slice(2),index:pathRaw.index,leaf:pathRaw.leaf.slice(2),siblings:pathRaw.siblings.map(x=>x.slice(2))};assert.equal(path.leaf,cm);
  const p=v.ledger.publicState,held=String(p.actualAssetBalance),liabilities=String(p.backedAmount),surplus=String(p.surplus);assert.ok(BigInt(held)>=BigInt(liabilities)&&BigInt(surplus)===BigInt(held)-BigInt(liabilities),'CLAIM_DEVICE_ROOT_ORIGINAL_BACKING');const backing={held,liabilities,surplus,deficit:'0'};
  if(v.ledger.nullifiers.includes('0x'+nf))return{v,row,note:{state:'SPENT',commitment:cm,nullifier:nf,available:null,backing,path}};
  if(s.withdrawal&&s.withdrawal.stage!=='CONFIRMED')return{v,row,note:{state:'UNKNOWN',commitment:cm,nullifier:nf,available:null,backing:null,path}};
  assert.ok(BigInt(row.packet.statement.amount)<=BigInt(held));return{v,row,note:{state:'LIVE',commitment:cm,nullifier:nf,available:row.packet.statement.amount,backing,path}};
 }
 async function observeW39(){const s=await source(),r=s.withdrawal;if(!r?.submission)return publicExit(r);const o=await seed.noteObserver.readTransaction({kind:'withdraw_source',identitySHA256:seed.sourceIdentitySHA256,transactionHash:r.submission.transactionHash,calldataSHA256:r.submission.calldataSHA256});if(!o)return publicExit(r);
  const {validateFlatAccountOwnerObservation}=await import('../../accounts/authority/flat-account-validation.mjs');validateFlatAccountOwnerObservation({identity:seed.noteObserver.identity,artifact:seed.claims.flatSystem.pools[seed.i].artifact,submission:r.submission,authorization:null,observation:o});const current=await note();assert.equal(current.note.state,'SPENT','CLAIM_DEVICE_ROOT_SPEND_NOT_OBSERVED');await ctx.readers[seed.i].assertCurrent(current.v);alive();
  r.stage='CONFIRMED';r.submission.transactionHash=o.transaction.hash;r.submission.observation=o;r.confirmation={transactionHash:o.transaction.hash,calldataSHA256:r.submission.calldataSHA256,receiptBlockHash:o.receipt.blockHash,commitment:current.note.commitment,nullifier:current.note.nullifier,amount:r.consent.statement.amount,recipient:r.consent.statement.recipient,proofSHA256:r.proofSHA256,publicInputsSHA256:r.publicInputsSHA256};await ctx.journal.update(d=>{d.apiDeviceRootClaims[0].withdrawal=copy(r);return d;});return publicExit(r);
 }
 async function native(){const s=await source(),r=s.redemption;if(!r)return null;const found=(await ctx.journal.read()).tickets.filter(t=>t.redemptionRequestId===r.requestId);assert.ok(found.length<=1,'CLAIM_DEVICE_ROOT_AMBIGUOUS_TICKET');if(!found.length)return freeze(copy(r));const t=found[0];assert.equal(t.claimDomain,descriptor.claim.claimDomain);assert.equal(t.caller,'0x'+descriptor.recipient);assert.equal(t.ticket.amount,r.amount);assert.equal(t.ticket.maxFee,r.maxFee);await ctx.journal.update(d=>{const x=d.apiDeviceRootClaims[0].redemption;assert.equal(x.requestId,r.requestId);x.ticketId=t.id;x.status=t.status;return d;});return freeze({...r,ticketId:t.id,status:t.status});}
 const deny=()=>{throw Error('CLAIM_DEVICE_ROOT_REOPENED_OBSERVE_ONLY');};
 const api=Object.freeze({descriptor,challenge(action){assert.equal(arguments.length,1);assert.ok(['READ','ACCESS'].includes(action),'CLAIM_DEVICE_ROOT_REOPENED_OBSERVE_ONLY');return permission(action);},
  read:async request=>{exactRecord(request,['permission','signature']);const grant=consume(request.permission,request.signature,'READ');await ctx.controller.reconcile();return ctx.serial(async()=>{await observeW39();const current=await note(),s=await source(),redemption=await native();grant.check();return freeze({profile:descriptor.profile,descriptor,permissionId:grant.value.challengeId,observedAt:Date.now(),expiresAt:grant.value.expiresAt,noteCustody:'DEVICE_ROOT_NOTE',nativeCustody:'BACKEND_LOCAL_QUORUM',nativeSelfCustody:false,availablePrivateClaims:current.note.available,note:current.note,withdrawal:publicExit(s.withdrawal),redemption,deposit:current.row?await ctx.projectDeposit(current.row):null,commitment:current.note.commitment,nullifier:current.note.nullifier,requiresReconciliation:ctx.journal.requiresReconciliation?.()===true});},{readOrReconcile:true});},
  exitChallenge:request=>ctx.serial(async()=>{exactRecord(request,['access','signature','action']);const access=consume(request.access,request.signature,'ACCESS'),s=await source(),r=s.withdrawal;assert.ok(r,'CLAIM_DEVICE_ROOT_ORIGINAL_W39_REQUIRED');assert.ok(['OBSERVE_W39','OBSERVE_NATIVE'].includes(request.action),'CLAIM_DEVICE_ROOT_REOPENED_OBSERVE_ONLY');access.check();let fields;
   if(request.action==='OBSERVE_W39'){assert.ok(r.proof,'CLAIM_DEVICE_ROOT_W39_PROOF_REQUIRED');fields={jobId:r.consent.jobId,rootId:r.consent.rootId,noteRevision:r.consent.noteRevision,quoteId:r.consent.quoteId,statement:r.consent.statement,path:r.consent.path,witnessSHA256:r.consent.witnessSHA256,proofSHA256:r.proofSHA256,publicInputsSHA256:r.publicInputsSHA256};}
   else{assert.ok(r.stage==='CONFIRMED'&&s.redemption?.ticketId);fields={jobId:r.consent.jobId,rootId:r.consent.rootId,noteRevision:r.consent.noteRevision,requestId:s.redemption.requestId,ticketId:s.redemption.ticketId,amount:s.redemption.amount,maxFee:s.redemption.maxFee};}
   access.check();return permission(request.action,true,fields,access.value.expiresAt);
  },{readOrReconcile:true}),
  operateW39:request=>ctx.serial(async()=>{exactRecord(request,['permission','signature','packet']);assert.equal(request.packet,null);consume(request.permission,request.signature,'OBSERVE_W39',true);return observeW39();},{readOrReconcile:true}),
  authorizeNativeExit:request=>ctx.serial(async()=>{exactRecord(request,['permission','signature']);const grant=consume(request.permission,request.signature,'OBSERVE_NATIVE',true),s=await source();assert.equal(s.redemption?.requestId,grant.value.requestId);assert.equal(s.redemption?.ticketId,grant.value.ticketId);return{action:'OBSERVE_NATIVE',ticketId:grant.value.ticketId};},{readOrReconcile:true}),
  retainNativeExit:()=>ctx.serial(native,{readOrReconcile:true}),
  economicSnapshot:()=>ctx.serial(async()=>{const current=await note(),before=await ctx.journal.read(),s=await source(),selected=await ctx.rootView(descriptor.claim.claimDomain);assert.equal(selected.snapshot.head.hash,current.v.head.hash,'CLAIM_DEVICE_ROOT_OBSERVATION_CHANGED');await ctx.observer.assertCurrent(selected.snapshot);await ctx.readers[seed.i].assertCurrent(current.v);assert.deepEqual(await ctx.journal.read(),before,'CLAIM_DEVICE_ROOT_OBSERVATION_CHANGED');alive();
   const requests=s.admissions.map((a,index)=>({requestId:'device_root_claim_'+index+'_'+a.permissionSHA256,assetId:seed.asset.assetId,kind:a.action==='FUND_NATIVE_CLAIM'?'TOP_UP':'GRAPH',state:(a.action==='PROVE_D27'?!!s.d27Observation:a.action==='PROVE_CI51'?!!s.ci51Observation:a.action==='FUND_NATIVE_CLAIM'?current.row?.native?.status==='OBSERVED':a.action==='ISSUE_CLAIM'?current.row?.status==='ISSUED':false)?'CONFIRMED':'UNKNOWN',disposition:null}));if(s.withdrawal)requests.push({requestId:'device_root_w39_'+s.withdrawal.consent.jobId,assetId:seed.asset.assetId,kind:'EXIT',state:s.withdrawal.stage==='CONFIRMED'?'CONFIRMED':'UNKNOWN',disposition:null});if(s.redemption)requests.push({requestId:'device_root_native_'+s.redemption.requestId,assetId:seed.asset.assetId,kind:'EXIT',state:s.redemption.status==='DISCHARGED'?'CONFIRMED':'UNKNOWN',disposition:null});const fresh=['LIVE','SPENT'].includes(current.note.state);return freeze({descriptor,asset:seed.asset,identity:seed.ownerIdentitySHA256,assets:[{asset:seed.asset,status:fresh?'LIVE':'UNAVAILABLE',observed:fresh?{blockNumber:current.v.head.number,blockHash:current.v.head.hash,timestamp:current.v.head.timestamp}:null,balances:fresh?{available:current.note.available??'0',reserved:'0',locked:'0',recovery:'0'}:null,backing:fresh?current.note.backing:null,requests}],journal:requests,revision:null,checkpoint:{source:s,deposit:current.row,observedHead:current.v.head,note:current.note}});
  },{readOrReconcile:true}),
  quoteW39:deny,reviewW39:deny,reviewD27:deny,submitD27:deny,reviewCI51:deny,submitCI51:deny,effectChallenge:deny,authorizeEffect:deny,
  close(){assert.equal(arguments.length,0);stopped=true;challenges.clear();exitChallenges.clear();return Promise.resolve({closed:true,inFlight:0,observationOnly:true});},
 });deviceRootClaimIntakes.set(api,{controller:ctx.controller,runtime:seed.runtime,claims:seed.claims,i:seed.i,asset:seed.asset,ownerIdentitySHA256:seed.ownerIdentitySHA256,alive});return api;
}
/** Retention is produced by the original before-fund intake, never by DATA. */
export function retainOriginalDeviceRootClaimObservationV3(intake){assert.equal(arguments.length,1);const s=deviceRootClaimIntakes.get(intake);assert.ok(s?.retainObservation,'CLAIM_DEVICE_ROOT_ORIGINAL_INTAKE_REQUIRED');s.alive();return s.retainObservation();}
export async function reopenOriginalDeviceRootClaimObservationV3(token,controller){assert.equal(arguments.length,2);const seed=deviceRootClaimObservationRestartsV3.get(token),next=controllers.get(controller);assert.ok(seed&&!seed.used&&next,'CLAIM_DEVICE_ROOT_ORIGINAL_RESTART_REQUIRED');const previous=controllers.get(seed.controller);assert.equal(previous?.replacement,controller,'CLAIM_DEVICE_ROOT_ORIGINAL_CONTROLLER_REPLACEMENT');for(const k of ['runtime','claims','keeper'])assert.equal(next.input[k],seed[k],'CLAIM_DEVICE_ROOT_ORIGINAL_RESTART_SOURCE');next.live();seed.used=true;return next.serial(async()=>{assert.deepEqual((await next.journal.read()).apiDeviceRootClaims?.[0],seed.source,'CLAIM_DEVICE_ROOT_RETAINED_OBSERVATION_CHANGED');return originalDeviceRootClaimObservationFacadeV3(seed,{...next,controller});},{readOrReconcile:true});}
