/** Distinct wrapped nonce-registry V3 source-only CI51 witness preparation. Exact facts signatures and public
 * joins are checked here for hygiene; only pinned genuine proofs and the
 * canonical gateway/hub establish acceptance. No owner key is accepted. */
import assert from 'node:assert/strict';
import { createCommitmentCodec, exactRecord, fixedArray, bytes32, validateStruct,
  structToNoir, digestBytes, digestWords } from '@lianum/components/encoding/commitments';
import { cloneInput, frozenInput } from '@lianum/components/plain-input';
import { FACTS_SCHEMA, validateNativeClaimFacts as validateNativeFacts,
  encodeNativeClaimFacts as encodeNativeFacts, nativeClaimFactsDigest as nativeFactsDigest,
  receiptKeyCommitment, nativeAdmissionNullifier } from '@lianum/engine/native/native-receipt-binding';
import { nativeAdmissionRuleCommitment, nativeAdmissionRuleRoot, nativeAdmissionChainDomain,
  nativeAdmissionRuleToNoir, nativeAdmissionObservationToNoir, nativeAdmissionRegistryToNoir }
  from '@lianum/engine/execution/native/dispatch/native-admission';
import { nativeEffectToNoir } from '@lianum/engine/execution/native/state/native-receipt';
import { nativeQuorumRegistryCommitment, createNativeQuorumHostVerifier }
  from '@lianum/engine/evidence/native-quorum';
import { balanceCommitment } from '@lianum/engine/wallet/notes/private-wallet-note-encoding';
import { claimUint, validateClaimConfig, claimDomainCommitment, claimConfigToNoir,
  claimReceiptSecret, claimRefundSalt, claimDestinationCommitment, claimIngressReceiptCommitment,
  validateClaimTicket, claimTicketCommitment, claimTicketToNoir, claimTicketSecret,
  encodeClaimIngressInputs, encodeClaimDischargeInputs } from '@lianum/engine/claims/framing';

import { assertCustodyRegistration, assertCustodySources } from '../protocol/registry-envelope-v2.mjs';
import { sourceToNoir } from '../../chains/evm/transfers/evm-native-value-v2.mjs';

const COMMON_FIELDS = ['config', 'domain', 'registry', 'rule', 'custodyProfile', 'profilePath', 'sources', 'certificates', 'currentRevocation'];
function signatureBytes(value) {
  assert.equal(typeof value, 'string', 'CLAIM_SIGNATURE_STRING');
  assert.equal(value.length, 128, 'CLAIM_SIGNATURE_WIDTH');
  assert.match(value, /^[0-9a-f]{128}$/, 'CLAIM_SIGNATURE_ENCODING');
  return [...Buffer.from(value, 'hex')];
}

function factsQuorum(certificates, policy, registry) {
  fixedArray(certificates, 3);
  let facts, frame;
  const indexes = [], signatures = [];
  for (const certificate of certificates) {
    exactRecord(certificate, ['schema', 'signerIndex', 'facts', 'frameHex', 'digest', 'signature']);
    assert.equal(certificate.schema, FACTS_SCHEMA, 'CLAIM_FACTS_SCHEMA');
    const checked = validateNativeFacts(certificate.facts, policy), encoded = encodeNativeFacts(checked, policy);
    assert.equal(certificate.frameHex, encoded.toString('hex'), 'CLAIM_FACTS_FRAME');
    assert.equal(certificate.digest, nativeFactsDigest(checked, policy), 'CLAIM_FACTS_DIGEST');
    assert.equal(encoded.length, 829, 'CLAIM_FACTS_FRAME_WIDTH');
    if (frame) assert.ok(frame.equals(encoded), 'CLAIM_FACTS_DISAGREE');
    else { frame = encoded; facts = checked; }
    const index = claimUint(certificate.signerIndex, 8);
    assert.ok(index < 4n, 'CLAIM_ATTESTER_INDEX');
    signatureBytes(certificate.signature);
    indexes.push(Number(index)); signatures.push(certificate.signature);
  }
  // Original verifier enforces all real low-S signatures, strict ordered
  // positions, and duplicate/sign-negated aliases in the complete registry.
  createNativeQuorumHostVerifier({ registry, expectedRegistryCommitment: nativeQuorumRegistryCommitment(registry) })
    .assertQuorumForMessage({ messageBytes: frame, indexes, signatures });
  return { facts, indexes, signatures };
}

async function context(input, hashFields) {
  const config = validateClaimConfig(input.config), domain = validateStruct('domain', input.domain);
  const codec = createCommitmentCodec({ hashFields });
  assert.equal(await codec.domainCommitment(domain), config.poolDomain, 'CLAIM_POOL_DOMAIN');
  for (const [domainKey, configKey] of [['scope', 'scope'], ['policy', 'policy'], ['asset', 'wrapperAssetIdentity'],
    ['hubDomain', 'hubDomain'], ['ledgerNamespace', 'ledgerNamespace'], ['registryCommitment', 'registryCommitment']])
    assert.equal(domain[domainKey], config[configKey], 'CLAIM_CONFIG_DOMAIN');
  const { registry, rule, custodyProfile, profilePath, sources } = input;
  assertCustodyRegistration({ config, registry, rule, custodyProfile, profilePath });
  assertCustodySources(custodyProfile, sources, input.certificates.map(c => c.signerIndex));
  const policy = { ledgerNamespace: config.ledgerNamespace, hubDomain: config.hubDomain,
    registryCommitment: config.registryCommitment, rule };
  const quorum = factsQuorum(input.certificates, policy, registry.quorum), facts = quorum.facts;
  claimUint(facts.observation.amount);

  const current = input.currentRevocation;
  exactRecord(current, ['revokedDigest', 'revokedCount', 'revocationSequence', 'entries']);
  fixedArray(current.entries, 64); claimUint(current.revokedCount, 32); claimUint(current.revocationSequence);
  assert.equal(await codec.revokedDigest(config.poolDomain, config.hubDomain, current.entries, current.revokedCount),
    current.revokedDigest, 'CLAIM_CURRENT_REVOKED_DIGEST');
  assert.ok(!current.entries.slice(0, Number(current.revokedCount)).includes(facts.nativeGid), 'CLAIM_GID_REVOKED');
  const admissionRevocationState = await codec.admissionRevocationState(config.poolDomain, {
    currentRevokedDigest: current.revokedDigest, currentRevokedCount: current.revokedCount,
    currentRevocationSequence: current.revocationSequence });
  const nativeContext = facts.nativeContext;
  const evidence = {
    registry: nativeAdmissionRegistryToNoir(registry.quorum), rule: nativeAdmissionRuleToNoir(rule),
    profile_siblings: profilePath.siblings.map(digestBytes), profile_index: profilePath.index,
    source_set_root: digestBytes(custodyProfile.sourceSetRoot),
    sources: sources.map(source => sourceToNoir(source.identity)),
    source_siblings: sources.map(source => source.siblings.map(digestBytes)),
    effect: nativeEffectToNoir({ chainDomain: { chain: facts.family === '1' ? 'BTC' : 'SOL',
      genesis: facts.genesis, asset: facts.asset }, effectIdentity: {
      transactionId: facts.family === '2' ? facts.transactionId : facts.transactionId.slice(0, 64),
      effectIndex: facts.effectIndex } }),
    observation: nativeAdmissionObservationToNoir(facts.observation),
    wire: { transaction_sha256: digestBytes(facts.transactionSHA256), wire_binding_version: facts.wireBindingVersion,
      wire_binding_kind: facts.wireBindingKind, wire_binding_position: facts.wireBindingPosition,
      wire_key_commitment: digestBytes(facts.wireKeyCommitment) },
    native_context: { observed_tip_id: digestBytes(nativeContext.observedTipId), observed_tip_height: nativeContext.observedTipHeight,
      transaction_slot: nativeContext.transactionSlot, parent_slot: nativeContext.parentSlot, observed_slot: nativeContext.observedSlot },
    attester_indexes: quorum.indexes, attester_signatures: quorum.signatures.map(signatureBytes),
    current_revoked_entries: current.entries.map(digestBytes), current_revoked_digest: digestBytes(current.revokedDigest),
    current_revoked_count: current.revokedCount, current_revocation_sequence: current.revocationSequence,
  };
  return { config, domain, codec, facts, claimDomain: claimDomainCommitment(config), admissionRevocationState,
    nativeChainDomain: nativeAdmissionChainDomain(rule),
    inputs: { config: claimConfigToNoir(config), domain: structToNoir('domain', domain), evidence } };
}
function publicWitness(statement) {
  return Object.fromEntries(Object.entries(statement).map(([name, value]) =>
    [name.replace(/[A-Z]/g, letter => '_' + letter.toLowerCase()),
      ['amountQ', 'evidenceFrom', 'evidenceUntil'].includes(name) ? value : digestWords(value)]));
}
function result(statement, inputs, encode) {
  const publicInputs = [...encode(statement)];
  return frozenInput({ statement, publicInputs, expectedPublicInputs: [...publicInputs],
    inputs: { ...publicWitness(statement), ...inputs } });
}

/** Scoped opening is exactly one newly prepared note. D27 verification and
 * canonical owner-window/revision joins belong to the receiving gateway. */
export async function buildClaimIngressNonceRegistryV3Inputs(raw, options) {
  exactRecord(options, ['hashFields']); const input = cloneInput(raw);
  exactRecord(input, [...COMMON_FIELDS, 'noteOpening']);
  exactRecord(input.noteOpening, ['rho', 'x', 'y', 'value', 'noteSecret']);
  const opening = input.noteOpening;
  for (const name of ['rho', 'x', 'y']) bytes32(opening[name]);
  bytes32(opening.noteSecret, true); assert.ok(claimUint(opening.value) > 0n, 'CLAIM_POSITIVE_AMOUNT');
  const c = await context(input, options.hashFields), observation = c.facts.observation;
  assert.equal(observation.destinationCommitment, c.config.escrowEndpointCommitment, 'CLAIM_INGRESS_ESCROW');
  assert.equal(observation.amount, opening.value, 'CLAIM_NOTE_AMOUNT');
  const outputQ = balanceCommitment(c.config.scope, c.config.policy, { type: 4, rho: opening.rho,
    x: opening.x, y: opening.y, value: opening.value, secret: opening.noteSecret }).toString('hex');
  bytes32(outputQ, true);
  const secretInput = { claimDomain: c.claimDomain, noteSecret: opening.noteSecret, outputQ };
  const secret = claimReceiptSecret(secretInput); bytes32(secret, true);
  const key = receiptKeyCommitment({ ledgerNamespace: c.config.ledgerNamespace, secret }); bytes32(key, true);
  assert.equal(key, c.facts.wireKeyCommitment, 'CLAIM_INGRESS_WIRE_KEY');
  const admissionN = nativeAdmissionNullifier({ ledgerNamespace: c.config.ledgerNamespace, secret, nativeGid: c.facts.nativeGid });
  bytes32(admissionN, true);
  const refundDestination = claimDestinationCommitment({ claimDomain: c.claimDomain, nativeChainDomain: c.nativeChainDomain,
    endpoint: observation.sourceCommitment, amount: opening.value, maxFee: c.config.refundMaxFee,
    salt: claimRefundSalt(secretInput) });
  const receipt = claimIngressReceiptCommitment({ claimDomain: c.claimDomain, outputQ,
    amount: opening.value, admissionN, refundDestination });
  const statement = { claimDomain: c.claimDomain, outputQ, admissionN, refundDestination,
    admissionRevocationState: c.admissionRevocationState, ingressReceiptLeaf: await c.codec.receiptLeaf(c.config.poolDomain, receipt),
    amountQ: opening.value, evidenceFrom: observation.evidenceFrom, evidenceUntil: observation.evidenceUntil };
  return result(statement, { ...c.inputs, note_opening: { rho: digestBytes(opening.rho), x: digestBytes(opening.x),
    y: digestBytes(opening.y), value: opening.value, note_secret: digestBytes(opening.noteSecret) } }, encodeClaimIngressInputs);
}

