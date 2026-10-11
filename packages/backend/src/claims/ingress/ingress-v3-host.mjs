/** INACTIVE CANDIDATE. Pure byte/arithmetic checks; no owned capability,
 * signer, RPC, runtime, proof, key pin, native send or production export.
 * Prospective incoming credit is authorization arithmetic, never backing.
 */
import assert from 'node:assert/strict';
import { exactRecord, bytes32, ZERO } from '../../execution/encoding/commitments.mjs';
import { cloneInput as copy, frozenInput as freeze } from '../../execution/account/preparation/readiness-inputs.mjs';
import { ownedCustodyRoute, assertOwnedCustodyIntent, auditOwnedSolanaNonceInfrastructure,
  ownedCustodyFeeAudit } from '../../chains/shared/runtime/owned-native-custody.mjs';
import { encodeSolanaNonceBindingMessage, validateSolanaNonceBindingTransaction }
  from '../../chains/solana/runtime/owned-solana-nonce-binding.mjs';
import { receiptKeyCommitment, nativeFactIdentity, nativeAdmissionNullifier }
  from '../../chains/shared/dispatch/native-receipt-binding.mjs';
import { claimUint, claimDomainCommitment, claimIntentId, claimVerifierSetCommitment }
  from '../protocol/framing.mjs';
import { claimFrame, claimHash, claimUnsignedWireCommitment, claimSignedWireCommitment }
  from '../authorization/permits.mjs';
import { auditClaimNativeInventoryBase as auditClaimNativeInventory, auditClaimGateway, assertClaimHealthState }
  from '../operations/claim-backing-arithmetic.mjs';

export const CANDIDATE = freeze({ profile: 'LIANUM_GENERIC_NATIVE_CLAIM_INGRESS_V3',
  relation: 'native_claim_ingress_v3', active: false, publicFields: 51, factsFrameBytes: 829,
  wireBindingVersion: '2', effectIndex: '1', wireBindingKind: '2', wireBindingPosition: '2' });
export const INGRESS_BROADCAST_TAG = 'LIANUM/PAEG/native-claim-broadcast-ingress/3';
const u = (v, bits = 64) => claimUint(v, bits);
const same = (a, b, label) => assert.deepEqual(a, b, label);
const b32 = v => Buffer.from(bytes32(v, true), 'hex');
const canonical = value => JSON.stringify((function sort(v) {
  return Array.isArray(v) ? v.map(sort) : v && typeof v === 'object'
    ? Object.fromEntries(Object.keys(v).sort().map(k => [k, sort(v[k])])) : v;
})(copy(value)));
export const candidateCommitment = (tag, value) => claimHash(claimFrame(tag, [Buffer.from(canonical(value))]));
const BOOTSTRAP_FIELDS = ['classification', 'genesisGrant', 'payerPublicKey', 'nonceAccountPublicKey',
  'authorityPublicKey', 'bootstrapNativeId', 'bootstrapTransactionSHA256', 'bootstrapRentLamports',
  'bootstrapFeeLamports', 'bootstrapBroadcastAttempts'];
const pick = (v, keys) => Object.fromEntries(keys.map(k => [k, v[k]]));

/** Exactly two independently identified infrastructure records. Their payers,
 * nonce accounts and three economic roles are seven distinct public keys.
 * The original bootstrap pins are fixed by owned construction, never the caller.
 */
export function auditDualNonceInfrastructure(raw, roles, originalPins) {
  const values = copy(raw); exactRecord(values, ['depositor', 'escrow']);
  exactRecord(originalPins, ['depositor', 'escrow']);
  const keys = ['depositor', 'escrow', 'recipient'].map(role => bytes32(roles[role].endpoint, true));
  const ids = new Set(), hashes = new Set(); let grants = 0n, rent = 0n, fees = 0n, balances = 0n;
  for (const role of ['depositor', 'escrow']) {
    const value = auditOwnedSolanaNonceInfrastructure(values[role]);
    same(pick(value, BOOTSTRAP_FIELDS), originalPins[role], 'V3_NONCE_BOOTSTRAP_PIN');
    assert.equal(value.authorityPublicKey, roles[role].endpoint, 'V3_NONCE_ROUTE_AUTHORITY');
    keys.push(value.payerPublicKey, value.nonceAccountPublicKey);
    assert.ok(!ids.has(value.bootstrapNativeId) && !hashes.has(value.bootstrapTransactionSHA256), 'V3_NONCE_BOOTSTRAP_REUSE');
    ids.add(value.bootstrapNativeId); hashes.add(value.bootstrapTransactionSHA256);
    grants += u(value.genesisGrant); rent += u(value.bootstrapRentLamports);
    fees += u(value.bootstrapFeeLamports); balances += u(value.payerBalance);
  }
  assert.equal(new Set(keys).size, 7, 'V3_NONCE_ECONOMIC_OR_INFRASTRUCTURE_ALIAS');
  assert.equal(grants, rent + fees + balances, 'V3_NONCE_INFRASTRUCTURE_CONSERVATION');
  return freeze({ infrastructure: values, excludedGenesisGrants: grants.toString(), excludedRent: rent.toString(),
    excludedBootstrapFees: fees.toString(), excludedPayerBalances: balances.toString() });
}
export function nonceForRoute(routeName, infrastructure, roles) {
  const route = ownedCustodyRoute(routeName), role = route.sourceRole;
  exactRecord(infrastructure, ['depositor', 'escrow']);
  const value = infrastructure[role];
  assert.equal(value.authorityPublicKey, roles[role].endpoint, 'V3_NONCE_ROUTE_AUTHORITY');
  assert.notEqual(infrastructure.depositor.nonceAccountPublicKey, infrastructure.escrow.nonceAccountPublicKey, 'V3_NONCE_SHARED');
  return freeze({ role, nonceAccountPublicKey: bytes32(value.nonceAccountPublicKey, true),
    authorityPublicKey: bytes32(value.authorityPublicKey, true) });
}

/** Existing three-account backing arithmetic is unchanged. Audit both complete
 * infrastructure snapshots first, then feed only escrow infrastructure into
 * the unchanged legacy audit. No infrastructure balance enters either pool.
 */
export function auditDualNonceInventory(raw, config, roles, originalPins) {
  const inventory = copy(raw);
  assert.equal(config.nativeFamily, '2', 'V3_SOL_ONLY');
  assert.ok(Object.hasOwn(inventory, 'nonceInfrastructureByAuthority'), 'V3_COMPLETE_NONCE_INVENTORY');
  assert.ok(!Object.hasOwn(inventory, 'nonceInfrastructure'), 'V3_AMBIGUOUS_NONCE_INVENTORY');
  const excluded = auditDualNonceInfrastructure(inventory.nonceInfrastructureByAuthority, roles, originalPins);
  const legacy = { ...inventory, nonceInfrastructure: excluded.infrastructure.escrow };
  delete legacy.nonceInfrastructureByAuthority;
  const backing = auditClaimNativeInventory(legacy, config, roles);
  const fees = ownedCustodyFeeAudit(inventory.feeAudit.transfers);
  const depositorActualFees = u(fees.actualFees) - u(fees.escrowActualFees);
  const depositorUnresolvedPreparedFees = fees.transfers.filter(t => t.route === 'deposit' && t.actualFee === null)
    .reduce((n, t) => n + u(t.preparedFee), 0n);
  return freeze({ ...backing, depositorActualFees: depositorActualFees.toString(),
    depositorUnresolvedPreparedFees: depositorUnresolvedPreparedFees.toString(),
    infrastructureExcluded: pick(excluded, ['excludedGenesisGrants', 'excludedRent', 'excludedBootstrapFees', 'excludedPayerBalances']) });
}

const PRIVATE_BINDING_FIELDS = ['claimDomain', 'gateway', 'ledgerNamespace', 'genesis', 'asset', 'operationId',
  'revision', 'ingress', 'request', 'receiptSecret', 'wireSalt', 'nativeWire', 'intent'];
const DERIVED = ['nativeGid', 'admissionN', 'transactionSHA256', 'wireBindingCommitment'];
/** A separate ingress-only binding constructor. Active v1/payout dispatcher is
 * deliberately unchanged. Uses the exact original signature/index-1 GID/K/N.
 */
export function createNonceIngressBinding(raw) {
  const value = copy(raw); exactRecord(value, PRIVATE_BINDING_FIELDS);
  for (const name of ['claimDomain', 'ledgerNamespace', 'genesis', 'asset', 'operationId', 'receiptSecret', 'wireSalt']) bytes32(value[name], true);
  assert.match(value.gateway, /^[0-9a-f]{40}$/); assert.notEqual(value.gateway, '0'.repeat(40));
  assert.equal(value.ingress, true, 'V3_INGRESS_ONLY'); assert.ok(u(value.revision) > 0n);
  exactRecord(value.request, ['family', 'recipientIndex', 'nativeId', 'wireKeyCommitment']);
  assert.equal(value.request.family, '2', 'V3_SOL_ONLY'); assert.equal(value.request.recipientIndex, '0', 'V3_INGRESS_RECIPIENT');
  const decoded = validateSolanaNonceBindingTransaction(value.nativeWire, value.intent);
  assert.equal(value.request.nativeId, decoded.signatureHex, 'V3_ORIGINAL_SIGNATURE');
  assert.equal(value.request.wireKeyCommitment, decoded.wireKeyCommitment, 'V3_ORIGINAL_K');
  assert.equal(receiptKeyCommitment({ ledgerNamespace: value.ledgerNamespace, secret: value.receiptSecret }), decoded.wireKeyCommitment, 'V3_SECRET_K');
  const nativeGid = nativeFactIdentity({ family: '2', genesis: value.genesis, asset: value.asset,
    transactionId: decoded.signatureHex, effectIndex: '1' });
  const admissionN = nativeAdmissionNullifier({ ledgerNamespace: value.ledgerNamespace, secret: value.receiptSecret, nativeGid });
  const transactionSHA256 = decoded.transactionSHA256;
  const wireBindingCommitment = claimSignedWireCommitment({ claimDomain: value.claimDomain, operationId: value.operationId,
    revision: value.revision, admissionN, nativeGid, transactionSHA256, wireSalt: value.wireSalt, wireKeyCommitment: decoded.wireKeyCommitment });
  return freeze({ ...value, nativeGid, admissionN, transactionSHA256, wireBindingCommitment });
}
export function validateNonceIngressBinding(raw) {
  const value = copy(raw); exactRecord(value, [...PRIVATE_BINDING_FIELDS, ...DERIVED]);
  const rebuilt = createNonceIngressBinding(pick(value, PRIVATE_BINDING_FIELDS));
  same(value, rebuilt, 'V3_ORIGINAL_BINDING_CHANGED'); return rebuilt;
}
export function assertCanonicalNonceIngressReservation(rawBinding, raw) {
  const binding = validateNonceIngressBinding(rawBinding), value = copy(raw);
  exactRecord(value, ['gateway', 'operationId', 'revision', 'wireBindingCommitment', 'ingress', 'consumed']);
  for (const name of ['gateway', 'operationId', 'revision', 'wireBindingCommitment', 'ingress'])
    assert.equal(value[name], binding[name], 'V3_CANONICAL_RESERVATION_' + name);
  assert.equal(value.consumed, false, 'V3_RESERVATION_CONSUMED'); return freeze(value);
}
export function nonceIngressPreparationCommitment(prepared) {
  return candidateCommitment('LIANUM/PAEG/native-claim-ingress-preparation/3', prepared);
}

/** Post-reservation calls require N=original N, never N=0. A changed owner
 * revision fails closed; renewal cannot retarget an already signed effect.
 * Fresh native state and rent checks are owned runtime responsibilities.
 */
export function auditNonceIngressPreparation({ gateway, config, intentId, prepared: raw, wireSalt, roles,
  infrastructure, timestamp, binding = null, reservation = null }) {
  const prepared = copy(raw); exactRecord(prepared, ['genesis', 'intent', 'unsignedWire', 'funds']);
  assert.equal(config.nativeFamily, '2', 'V3_SOL_ONLY');
  assert.equal(gateway.claimDomain, claimDomainCommitment(config), 'V3_CLAIM_DOMAIN');
  auditClaimGateway(gateway, config); assertClaimHealthState(gateway, { allocateIngress: true });
  const rows = gateway.intents.filter(row => row.id === intentId);
  assert.equal(rows.length, 1, 'V3_EXACT_INTENT'); const intent = rows[0];
  assert.equal(intent.id, claimIntentId({ claimDomain: gateway.claimDomain, outputQ: intent.output, amount: intent.amount }));
  assert.equal(intent.state, '1', 'V3_HELD_INTENT'); assert.equal(gateway.activePayout, ZERO, 'V3_PAYOUT_FENCE');
  assert.ok(u(intent.validFrom) <= u(timestamp) && u(timestamp) < u(intent.validUntil), 'V3_OWNER_EXPIRED');
  assert.equal(prepared.genesis, config.nativeGenesis, 'V3_GENESIS');
  assertOwnedCustodyIntent('deposit', roles, '2', prepared.intent);
  const nonce = nonceForRoute('deposit', infrastructure, roles);
  assert.equal(prepared.intent.nonceAccountPublicKey, nonce.nonceAccountPublicKey, 'V3_DEPOSITOR_NONCE');
  assert.equal(prepared.intent.sourcePublicKey, nonce.authorityPublicKey, 'V3_DEPOSITOR_AUTHORITY');
  assert.equal(prepared.intent.lamports, intent.amount, 'V3_AMOUNT');
  assert.equal(prepared.unsignedWire, encodeSolanaNonceBindingMessage(prepared.intent), 'V3_UNSIGNED_WIRE');
  assert.ok(u(prepared.funds.feeLamports) > 0n && u(prepared.funds.feeLamports) <= u(config.refundMaxFee), 'V3_FEE_BOUND');
  assert.equal(prepared.funds.nonceAccount.publicKey, nonce.nonceAccountPublicKey, 'V3_PREPARED_NONCE_ACCOUNT');
  assert.equal(prepared.funds.nonceAccount.authorityPublicKey, nonce.authorityPublicKey, 'V3_PREPARED_NONCE_AUTHORITY');
  assert.equal(prepared.funds.nonceAccount.durableNonce, prepared.intent.durableNonce, 'V3_PREPARED_NONCE_VALUE');
  assert.equal(prepared.funds.feeLamports, prepared.funds.nonceAccount.lamportsPerSignature, 'V3_NONCE_FEE');
  bytes32(wireSalt, true);
  if (binding === null) {
    assert.equal(reservation, null, 'V3_UNEXPECTED_RESERVATION');
    assert.equal(intent.nullifier, ZERO, 'V3_PRESIGN_N_MUST_BE_ZERO');
  } else {
    const original = validateNonceIngressBinding(binding);
    assertCanonicalNonceIngressReservation(original, reservation);
    same(original.intent, prepared.intent, 'V3_BINDING_PREPARATION');
    for (const [name, actual] of Object.entries({ claimDomain: gateway.claimDomain, operationId: intentId,
      revision: intent.revision, gateway: config.gateway, ledgerNamespace: config.ledgerNamespace,
      genesis: config.nativeGenesis, asset: config.nativeAsset, wireSalt }))
      assert.equal(original[name], actual, 'V3_ORIGINAL_' + name);
    assert.equal(intent.nullifier, original.admissionN, 'V3_RESERVED_INTENT_N');
  }
  const unsignedWireCommitment = claimUnsignedWireCommitment({ claimDomain: gateway.claimDomain, intentId,
    revision: intent.revision, wireKeyCommitment: prepared.intent.wireKeyCommitment, unsignedWire: prepared.unsignedWire, wireSalt });
  return freeze({ revision: intent.revision, amount: intent.amount, maxFee: config.refundMaxFee,
    actualPreparedFee: prepared.funds.feeLamports, wireKeyCommitment: prepared.intent.wireKeyCommitment,
    unsignedWireCommitment, preparationCommitment: nonceIngressPreparationCommitment(prepared) });
}

/** The allowlist contains exactly the one original staged ingress. No skipped
 * retained observation, discharged debt or second incoming amount is allowed.
 * Caller must have independently computed every complete financial report.
 */
export function assertProspectiveIngressCoverage({ financials: raw, gateways, binding: rawBinding }) {
  const binding = validateNonceIngressBinding(rawBinding), financials = copy(raw);
  assert.equal(financials.length, gateways.length, 'V3_COMPLETE_DOMAIN_COVERAGE');
  const domains = gateways.map(g => g.claimDomain);
  assert.equal(new Set(domains).size, domains.length, 'V3_DUPLICATE_GATEWAY');
  assert.equal(new Set(financials.map(v => v.claimDomain)).size, financials.length, 'V3_DUPLICATE_INVENTORY');
  assert.ok(domains.includes(binding.claimDomain), 'V3_INGRESS_DOMAIN_MISSING');
  for (const funds of financials) {
    const gateway = gateways.find(g => g.claimDomain === funds.claimDomain);
    assert.ok(gateway, 'V3_UNKNOWN_DOMAIN'); assert.equal(gateway.activePayout, ZERO, 'V3_OUTGOING_FENCE');
    assert.equal(funds.dischargedCredit, '0', 'V3_NO_DELIVERY_CREDIT');
    assert.equal(funds.dischargedFeeCredit, '0', 'V3_NO_DELIVERY_FEE_CREDIT');
    const selected = funds.claimDomain === binding.claimDomain;
    if (selected) {
      const intent = gateway.intents.find(i => i.id === binding.operationId);
      assert.ok(intent && intent.state === '1' && intent.nullifier === binding.admissionN
        && intent.revision === binding.revision && intent.amount === binding.intent.lamports, 'V3_EXACT_PROSPECTIVE_INTENT');
      assert.ok(u(gateway.heldUnissued, 256) >= u(intent.amount), 'V3_HELD_LIABILITY_MISSING');
    }
    const credit = selected ? u(binding.intent.lamports) : 0n;
    const principal = u(funds.nativePrincipalAvailable, 256), liabilities = u(funds.liabilities, 256);
    assert.ok(principal + credit < 1n << 256n && principal + credit >= liabilities, 'V3_PRINCIPAL_DEFICIT');
    assert.equal(funds.reservedFees, gateway.reservedFees, 'V3_FEE_RESERVATIONS');
    assert.ok(u(funds.feeReserveAvailable, 256) >= u(funds.reservedFees, 256), 'V3_FEE_DEFICIT');
  }
  return freeze({ prospectiveIncomingCredit: binding.intent.lamports, backingCredit: '0', spendableCredit: '0' });
}

export const INGRESS_BROADCAST_FIELDS = freeze([
  ['claimDomain', 32], ['intentId', 32], ['revision', 8], ['claimSequence', 8], ['hubStateSequence', 8],
  ['amount', 8], ['wireKeyCommitment', 32], ['unsignedWireCommitment', 32], ['preparationCommitment', 32],
  ['maxFee', 8], ['admissionN', 32], ['nativeGid', 32], ['nativeId', 64], ['transactionSHA256', 32],
  ['wireBindingCommitment', 32], ['nonceAccountPublicKey', 32], ['durableNonce', 32], ['authorityPublicKey', 32],
  ['revocationState', 32], ['inventoryCommitment', 32], ['obligationsCommitment', 32],
  ['prospectiveIncomingCredit', 8], ['validFrom', 8], ['validUntil', 8],
]);
export function nonceIngressBroadcastFrame(raw) {
  const value = copy(raw); exactRecord(value, INGRESS_BROADCAST_FIELDS.map(([name]) => name));
  const parts = INGRESS_BROADCAST_FIELDS.map(([name, width]) => {
    if (width === 8) return Buffer.from(u(value[name]).toString(16).padStart(16, '0'), 'hex');
    if (width === 32) return b32(value[name]);
    assert.match(value[name], /^[0-9a-f]{128}$/); assert.notEqual(value[name], '0'.repeat(128)); return Buffer.from(value[name], 'hex');
  });
  assert.ok(u(value.amount) > 0n && u(value.maxFee) > 0n && u(value.revision) > 0n, 'V3_PERMIT_TERMS');
  assert.equal(value.prospectiveIncomingCredit, value.amount, 'V3_EXACT_INCOMING_CREDIT');
  assert.ok(u(value.validFrom) < u(value.validUntil) && u(value.validUntil) - u(value.validFrom) <= 30n, 'V3_PERMIT_WINDOW');
  return claimFrame(INGRESS_BROADCAST_TAG, parts);
}

/** Model-only monotonic checks: production must use raw performance.now()
 * values directly after its awaits (no rounding or serialized age authority).
 */
export function assertIngressGuardWindow(started, now) {
  assert.ok(Number.isFinite(started) && Number.isFinite(now) && now >= started && now - started < 30_000, 'V3_BROADCAST_AUDIT_TOO_OLD');
}

/** Exact first-send fence after a fresh original-signature read. Not-found is
 * not noninclusion/finality or replacement permission. This permits only the
 * surviving runtime's first send of these identical bytes, never a new wire.
 */
export function assertNonceIngressFirstSend({ original, prepared, binding: rawBinding, observation,
  currentNonce, explicitFirstSend, signingUnresolved, externalSubmissionObserved }) {
  const binding = validateNonceIngressBinding(rawBinding);
  assert.equal(explicitFirstSend, true, 'V3_EXPLICIT_FIRST_SEND_REQUIRED');
  assert.equal(original.route, 'deposit', 'V3_INGRESS_ROUTE');
  assert.equal(original.phase, 'SIGNED_NOT_BROADCAST', 'V3_FIRST_SEND_PHASE');
  assert.equal(original.broadcastAttempts, 0, 'V3_FIRST_SEND_ATTEMPTS');
  assert.equal(signingUnresolved, false, 'V3_UNKNOWN_KEY_USE');
  assert.equal(externalSubmissionObserved, false, 'V3_EXTERNAL_SUBMISSION_FENCE');
  assert.equal(original.nativeId, binding.request.nativeId, 'V3_ORIGINAL_SIGNATURE');
  assert.equal(original.nativeWire, binding.nativeWire, 'V3_ORIGINAL_WIRE');
  assert.equal(original.transactionSHA256, binding.transactionSHA256, 'V3_ORIGINAL_WIRE_HASH');
  same(original.intent, binding.intent, 'V3_ORIGINAL_INTENT'); same(prepared.intent, binding.intent, 'V3_ORIGINAL_PREPARATION');
  assert.equal(prepared.unsignedWire, encodeSolanaNonceBindingMessage(binding.intent), 'V3_ORIGINAL_UNSIGNED_WIRE');
  assert.equal(currentNonce, binding.intent.durableNonce, 'V3_NONCE_CHANGED');
  exactRecord(observation, ['nativeId', 'status', 'historyAvailable', 'statusRead', 'transactionRead']);
  assert.equal(observation.nativeId, binding.request.nativeId, 'V3_OBSERVE_ORIGINAL_SIGNATURE');
  assert.equal(observation.status, 'not-found', 'V3_ORIGINAL_ALREADY_OBSERVED_OR_UNKNOWN');
  assert.equal(observation.historyAvailable, true, 'V3_NATIVE_HISTORY_UNAVAILABLE');
  assert.equal(observation.statusRead, true, 'V3_STATUS_READ_REQUIRED');
  assert.equal(observation.transactionRead, true, 'V3_TRANSACTION_READ_REQUIRED');
  return undefined;
}

/** Additional gate on an ALREADY BRANDED owned system. The caller must first
 * assertOwnedNativeClaimSystem / ownedClaimObserverBindings; this pure function
 * never authenticates a caller-supplied deployment object. Old CI51 source/key
 * lineage cannot satisfy this gate. No candidate JSON or boolean enables it.
 */
export function assertNonceIngressDeployment(system) {
  const selected = system.nativeRuntimes.map((native, i) => ({ native, config: system.configs[i] }))
    .filter(({ native }) => native.nonceIngressProfile !== undefined || native.nonceInfrastructureByAuthority !== undefined);
  if (selected.length === 0 && system.verifiers?.CI51?.source !== 'native_claim_ingress_v3.sol') return false;
  for (const { native, config } of selected) {
    assert.equal(config.nativeFamily, '2', 'V3_DEPLOYMENT_SOL_ONLY');
    assert.equal(native.nonceIngressProfile, CANDIDATE.profile, 'V3_OWNED_RUNTIME_PROFILE');
    exactRecord(native.nonceInfrastructureByAuthority, ['depositor', 'escrow']);
  }
  const ingress = system.verifiers.CI51, discharge = system.verifiers.CO42;
  assert.equal(ingress.source, 'native_claim_ingress_v3.sol', 'V3_ACTUAL_INGRESS_VERIFIER_REQUIRED');
  assert.equal(discharge.source, 'native_claim_discharge.sol', 'V3_ORIGINAL_DISCHARGE_VERIFIER_REQUIRED');
  assert.equal(system.verifierPins.length, 2, 'V3_TWO_ACTUAL_VERIFIER_ROLES');
  for (const [index, verifier] of [ingress, discharge].entries()) {
    const pin = system.verifierPins[index];
    assert.equal(pin.role, String(index), 'V3_VERIFIER_ROLE');
    assert.equal(pin.width, index === 0 ? '51' : '42', 'V3_VERIFIER_ABI');
    assert.equal(verifier.lineage.actualGeneratedKeyAndSource, true, 'V3_GENUINE_VERIFIER_LINEAGE');
    assert.equal(pin.sourceCommitment, verifier.lineage.sourceVersion, 'V3_VERIFIER_SOURCE_PIN');
    assert.equal(pin.keyCommitment, verifier.lineage.keySHA256, 'V3_VERIFIER_KEY_PIN');
    assert.equal(verifier.address, '0x' + pin.address, 'V3_VERIFIER_ADDRESS_PIN');
    assert.equal(verifier.codeHash, '0x' + pin.codeHash, 'V3_VERIFIER_CODE_PIN');
  }
  const verifierSet = claimVerifierSetCommitment(system.verifierPins);
  for (const config of system.configs) assert.equal(config.claimVerifierSetCommitment, verifierSet, 'V3_AUTHENTICATED_VERIFIER_SET');
  return true;
}
