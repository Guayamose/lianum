/** Scoped direct I84 preparation. Accepts this node's sealed historical Ready
 * descriptor/action/secret, signed native facts and a separate current revoked
 * vector. It never receives E, owner/graph keys, incoming receipts or child
 * proof material, and never substitutes a host flag for actual P/R/I proofs.
 */
import assert from 'node:assert/strict';
import { createPublicKey, verify } from 'node:crypto';
import { createCommitmentCodec, exactRecord, fixedArray, bytes32, validateStruct,
  structToNoir, digestBytes, digestWords } from '@lianum/components/encoding/commitments';
import { validateStatement } from '@lianum/components/encoding/statements';
import { cloneInput, frozenInput, inputUint, inputPath, readyDescriptorWords, validateFlatInputs } from './readiness-inputs.mjs';
import { FACTS_SCHEMA, validateNativeFacts, encodeNativeFacts, nativeFactsDigest,
  receiptKeyCommitment, nativeAdmissionNullifier } from '@lianum/engine/native/native-receipt-binding';
import { nativeTransferActionCommitment, nativeActionToNoir }
  from '@lianum/engine/execution/native/dispatch/native-capsules';
import { nativeReceiptReadOpening, nativeReceiptCommitment, nativeReceiptToNoir, nativeEffectToNoir }
  from '@lianum/engine/execution/native/state/native-receipt';
import { nativeAdmissionRuleCommitment, nativeAdmissionRuleToNoir, nativeAdmissionRuleRoot,
  nativeAdmissionChainDomain, nativeAdmissionObservationToNoir, nativeAdmissionRegistryToNoir,
  nativeProviderIdentity, nativeReadyStatementDigest, nativeDeliveryRiskCommitment,
  nativeDispatchStatementFrame, NATIVE_ADMISSION_LOSS_CLAUSE }
  from '@lianum/engine/execution/native/dispatch/native-admission';
import { nativeQuorumRegistryCommitment, createNativeQuorumHostVerifier }
  from '@lianum/engine/evidence/native-quorum';
import { membership } from '@lianum/engine/execution/native/state/native-state';

const ORDER = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
function hex(value, size) {
  assert.equal(typeof value, 'string'); assert.equal(value.length, size * 2);
  assert.match(value, new RegExp(`^[0-9a-f]{${size * 2}}$`)); return Buffer.from(value, 'hex');
}
function providerSignature(publicKey, signature, frame) {
  exactRecord(publicKey, ['x', 'y']); const x = hex(publicKey.x, 32), y = hex(publicKey.y, 32), bytes = hex(signature, 64);
  const r = BigInt('0x' + signature.slice(0, 64)), s = BigInt('0x' + signature.slice(64));
  assert.ok(r > 0n && r < ORDER && s > 0n && s <= ORDER / 2n, 'INPUT_PROVIDER_LOW_S');
  const key = createPublicKey({ format: 'jwk', key: { kty: 'EC', crv: 'secp256k1',
    x: x.toString('base64url'), y: y.toString('base64url') } });
  assert.ok(verify('sha256', frame, { key, dsaEncoding: 'ieee-p1363' }, bytes), 'INPUT_PROVIDER_SIGNATURE');
}
function factsQuorum(certificates, policy, registry) {
  fixedArray(certificates, 3);
  let facts, frame;
  const indexes = [], signatures = [];
  for (const certificate of certificates) {
    exactRecord(certificate, ['schema', 'signerIndex', 'facts', 'frameHex', 'digest', 'signature']);
    assert.equal(certificate.schema, FACTS_SCHEMA, 'INPUT_FACTS_SCHEMA');
    const checked = validateNativeFacts(certificate.facts, policy), encoded = encodeNativeFacts(checked, policy);
    assert.equal(certificate.frameHex, encoded.toString('hex'), 'INPUT_FACTS_FRAME');
    assert.equal(certificate.digest, nativeFactsDigest(checked, policy), 'INPUT_FACTS_DIGEST');
    if (frame) assert.ok(frame.equals(encoded), 'INPUT_FACTS_DISAGREE'); else { facts = checked; frame = encoded; }
    indexes.push(Number(inputUint(certificate.signerIndex, 8, 3n))); signatures.push(certificate.signature);
  }
  // The reused pure verifier checks real signatures, strict ordered positions,
  // all four public points/aliases and the exact original registry commitment.
  createNativeQuorumHostVerifier({ registry, expectedRegistryCommitment: policy.registryCommitment })
    .assertQuorumForMessage({ messageBytes: frame, indexes, signatures });
  return { facts, indexes, signatures };
}
function publicInputs(statement) {
  return Object.fromEntries(Object.entries(statement).map(([name, value]) => [name.replace(/[A-Z]/g, letter => '_' + letter.toLowerCase()),
    name.endsWith('From') || name.endsWith('Until') ? value : digestWords(value)]));
}

export async function buildAdmissionInputs(raw, options) {
  exactRecord(options, ['hashFields', 'abi']); const input = cloneInput(raw);
  exactRecord(input, ['readyStatement', 'readinessOpening', 'action', 'receiptSpendSecret', 'receiptOpening',
    'checkpointOpening', 'registry', 'rule', 'rulePath', 'provider', 'certificates',
    'currentRevocation', 'admissionFrom', 'admissionUntil']);
  const ready = validateStatement('ready', input.readyStatement), codec = createCommitmentCodec({ hashFields: options.hashFields });
  exactRecord(input.readinessOpening, ['domain', 'descriptor', 'readinessBlind']);
  const domain = validateStruct('domain', input.readinessOpening.domain);
  const descriptor = validateStruct('ready', input.readinessOpening.descriptor), d = ready.domainCommitment;
  bytes32(input.readinessOpening.readinessBlind, true);
  assert.equal(await codec.domainCommitment(domain), d, 'INPUT_DOMAIN_OPENING');
  assert.equal(domain.ledgerNamespace, domain.hubDomain, 'INPUT_INITIAL_NAMESPACE');
  for (const name of ['scope', 'policy', 'asset', 'hubDomain', 'registryCommitment'])
    assert.equal(descriptor[name], domain[name], 'INPUT_READY_DOMAIN');
  assert.equal(descriptor.snapshotDigest, ready.checkpoint, 'INPUT_HISTORICAL_CHECKPOINT');
  assert.equal(descriptor.readyFrom, ready.readyFrom, 'INPUT_HISTORICAL_READY_FROM');
  assert.equal(descriptor.readyUntil, ready.readyUntil, 'INPUT_HISTORICAL_READY_UNTIL');
  assert.equal(await codec.readinessCommitment(d, ready.joinCommitment, input.readinessOpening.readinessBlind, descriptor),
    ready.readinessCommitment, 'INPUT_READY_SEAL');
  const checkpoint = inputPath(input.checkpointOpening, 6);
  membership('0x' + ready.checkpoint, checkpoint.siblings.map(value => '0x' + value), String(checkpoint.index), '0x' + checkpoint.root);

  const { registry, rule, action } = input;
  assert.equal(registry.hubDomain, domain.hubDomain, 'INPUT_REGISTRY_HUB');
  assert.equal(nativeQuorumRegistryCommitment(registry), domain.registryCommitment, 'INPUT_REGISTRY');
  assert.equal(nativeAdmissionRuleRoot(rule, input.rulePath), registry.rulesRoot, 'INPUT_RULE_MEMBERSHIP');
  assert.equal(nativeAdmissionRuleCommitment(rule), descriptor.evidencePolicy, 'INPUT_RULE_COMMITMENT');
  assert.equal(nativeAdmissionChainDomain(rule), descriptor.chainDomain, 'INPUT_RULE_CHAIN');
  assert.equal(nativeTransferActionCommitment(action), descriptor.actionCommitment, 'INPUT_ACTION_COMMITMENT');
  assert.equal(action.chainDomain, descriptor.chainDomain, 'INPUT_ACTION_CHAIN');
  const policy = { ledgerNamespace: domain.ledgerNamespace, hubDomain: domain.hubDomain,
    registryCommitment: domain.registryCommitment, rule };
  const quorum = factsQuorum(input.certificates, policy, registry), facts = quorum.facts;
  for (const name of ['sourceCommitment', 'destinationCommitment', 'amount', 'custodyCommitment'])
    assert.equal(facts.observation[name], action[name], 'INPUT_FACTS_ACTION');
  assert.equal(facts.observation.custodyKind, String(action.custodyKind), 'INPUT_FACTS_CUSTODY');
  const key = receiptKeyCommitment({ ledgerNamespace: domain.ledgerNamespace, secret: input.receiptSpendSecret });
  assert.equal(key, action.receiptKeyCommitment, 'INPUT_ACTION_KEY');
  assert.equal(key, facts.wireKeyCommitment, 'INPUT_NATIVE_WIRE_KEY');

  const opening = nativeReceiptReadOpening(input.receiptOpening);
  for (const name of ['hubDomain', 'registryCommitment', 'scope', 'policy', 'localCommitment', 'dispatchId',
    'chainDomain', 'evidencePolicy', 'actionCommitment', 'payoutCommitment'])
    assert.equal(opening[name], descriptor[name], 'INPUT_RECEIPT_READY_TERMS');
  assert.equal(opening.globalEffectId, facts.nativeGid, 'INPUT_RECEIPT_GID');
  assert.equal(opening.receiptKeyCommitment, key, 'INPUT_RECEIPT_KEY');
  assert.equal(opening.receiptRho, action.receiptRho, 'INPUT_RECEIPT_RHO');
  const factsFrom = inputUint(facts.observation.evidenceFrom), factsUntil = inputUint(facts.observation.evidenceUntil);
  const cutoff = inputUint(action.settleBefore), receiptUntil = factsUntil < cutoff ? factsUntil : cutoff;
  assert.equal(opening.validFrom, facts.observation.evidenceFrom, 'INPUT_RECEIPT_FROM');
  assert.equal(inputUint(opening.validUntil), receiptUntil, 'INPUT_RECEIPT_UNTIL');
  const from = inputUint(input.admissionFrom), until = inputUint(input.admissionUntil);
  assert.ok(factsFrom < receiptUntil && factsFrom <= from && from < until && until <= receiptUntil, 'INPUT_ADMISSION_WINDOW');

  exactRecord(input.provider, ['publicKey', 'dispatchStatement', 'signature', 'deliveryRiskSalt']);
  const provider = input.provider, signedAt = inputUint(provider.dispatchStatement.signedAt);
  assert.equal(nativeProviderIdentity(provider.publicKey), action.signerIdentity, 'INPUT_PROVIDER_IDENTITY');
  bytes32(provider.deliveryRiskSalt, true);
  assert.equal(nativeDeliveryRiskCommitment({ clause: NATIVE_ADMISSION_LOSS_CLAUSE,
    hubDomain: domain.hubDomain, registryCommitment: domain.registryCommitment, chainDomain: action.chainDomain,
    sourceCommitment: action.sourceCommitment, destinationCommitment: action.destinationCommitment,
    amount: action.amount, scope: domain.scope, policy: domain.policy, asset: domain.asset,
    payoutCommitment: descriptor.payoutCommitment, settleBefore: action.settleBefore, salt: provider.deliveryRiskSalt }),
  action.deliveryRiskCommitment, 'INPUT_DELIVERY_RISK');
  assert.ok(inputUint(ready.readyFrom) <= signedAt && signedAt < inputUint(ready.readyUntil)
    && inputUint(action.executionFrom) <= signedAt && signedAt < inputUint(action.executionUntil), 'INPUT_HISTORICAL_DISPATCH_WINDOW');
  const observedAt = inputUint(facts.observation.observedAt);
  if (observedAt < signedAt) assert.ok(signedAt - observedAt <= inputUint(rule.maximumClockSkew), 'INPUT_DISPATCH_SKEW');
  const expectedDispatch = { hubDomain: domain.hubDomain, registryCommitment: domain.registryCommitment,
    readyStatement: nativeReadyStatementDigest([...readyDescriptorWords(descriptor)]),
    localCommitment: descriptor.localCommitment, dispatchId: descriptor.dispatchId, actionCommitment: descriptor.actionCommitment,
    globalEffectId: facts.nativeGid, deliveryRiskCommitment: action.deliveryRiskCommitment, signedAt: provider.dispatchStatement.signedAt };
  assert.deepEqual(provider.dispatchStatement, expectedDispatch, 'INPUT_ORIGINAL_DISPATCH');
  providerSignature(provider.publicKey, provider.signature, nativeDispatchStatementFrame(provider.dispatchStatement));

  // No historical Snapshot accepted here: this is the separately supplied
  // CURRENT vector, whose digest/count/sequence the contract must recheck.
  const current = input.currentRevocation;
  exactRecord(current, ['revokedDigest', 'revokedCount', 'revocationSequence', 'entries']); fixedArray(current.entries, 64);
  assert.equal(await codec.revokedDigest(d, domain.hubDomain, current.entries, current.revokedCount), current.revokedDigest, 'INPUT_CURRENT_REVOKED_DIGEST');
  inputUint(current.revocationSequence);
  assert.ok(!current.entries.slice(0, Number(current.revokedCount)).includes(facts.nativeGid), 'INPUT_CURRENT_GID_REVOKED');
  const admissionRevocationState = await codec.admissionRevocationState(d, { currentRevokedDigest: current.revokedDigest,
    currentRevokedCount: current.revokedCount, currentRevocationSequence: current.revocationSequence });
  const receiptCommitment = nativeReceiptCommitment(opening), receiptLeaf = await codec.receiptLeaf(d, receiptCommitment);
  const admissionNullifier = nativeAdmissionNullifier({ ledgerNamespace: domain.ledgerNamespace,
    secret: input.receiptSpendSecret, nativeGid: facts.nativeGid }); bytes32(admissionNullifier, true);
  const statement = { ...ready, acceptedCheckpointRoot: checkpoint.root, admissionRevocationState,
    receiptLeaf, admissionNullifier, admissionFrom: input.admissionFrom, admissionUntil: input.admissionUntil };
  // validateNativeFacts admitted exactly BTC/SOL/EVM; preserve their original
  // family labels and canonical native identity widths in the I84 witness.
  const effect = nativeEffectToNoir({ chainDomain: { chain: facts.family === '1' ? 'BTC' : facts.family === '2' ? 'SOL' : 'EVM',
    genesis: facts.genesis, asset: facts.asset },
    effectIdentity: { transactionId: facts.family === '2' ? facts.transactionId : facts.transactionId.slice(0, 64), effectIndex: facts.effectIndex } });
  const context = facts.nativeContext;
  const inputs = { ...publicInputs(statement), domain: structToNoir('domain', domain), descriptor: structToNoir('ready', descriptor),
    readiness_blind: digestBytes(input.readinessOpening.readinessBlind), checkpoint_siblings: checkpoint.siblings.map(digestBytes),
    checkpoint_index: checkpoint.index, registry: nativeAdmissionRegistryToNoir(registry), rule: nativeAdmissionRuleToNoir(rule),
    rule_siblings: input.rulePath.siblings.map(digestBytes), rule_index: input.rulePath.index,
    action: nativeActionToNoir(action), effect, opening: nativeReceiptToNoir(opening), observation: nativeAdmissionObservationToNoir(facts.observation),
    wire: { transaction_sha256: digestBytes(facts.transactionSHA256), wire_binding_version: facts.wireBindingVersion,
      wire_binding_kind: facts.wireBindingKind, wire_binding_position: facts.wireBindingPosition, wire_key_commitment: digestBytes(facts.wireKeyCommitment) },
    native_context: { observed_tip_id: digestBytes(context.observedTipId), observed_tip_height: context.observedTipHeight,
      transaction_slot: context.transactionSlot, parent_slot: context.parentSlot, observed_slot: context.observedSlot },
    provider_key_x: digestBytes(provider.publicKey.x), provider_key_y: digestBytes(provider.publicKey.y),
    dispatch_signed_at: provider.dispatchStatement.signedAt, dispatch_signature: [...hex(provider.signature, 64)],
    delivery_risk_salt: digestBytes(provider.deliveryRiskSalt), receipt_secret: digestBytes(input.receiptSpendSecret),
    attester_indexes: quorum.indexes, attester_signatures: quorum.signatures.map(value => [...hex(value, 64)]),
    current_revoked_entries: current.entries.map(digestBytes), current_revoked_digest: digestBytes(current.revokedDigest),
    current_revoked_count: current.revokedCount, current_revocation_sequence: current.revocationSequence };
  return frozenInput({ ...validateFlatInputs('admission', options.abi, inputs, statement), receiptCommitment });
}
