/** I42 messages and private witness preparation for LIANUM_PAEG_NATIVE_4_V2.
 * Host checks bind bytes and verify real provider/quorum signatures only.
 * Recursive fields remain UNVERIFIED until the pinned Admission circuit verifies
 * them. Neither this module nor a quorum establishes native consensus, trusted
 * checkpoint provenance, provider gate chronology, or attester independence.
 * No API accepts a private signing key. Keep returned witnesses private.
 */
import assert from 'node:assert/strict';
import { createHash, createPublicKey, ECDH, verify } from 'node:crypto';
import { fundedFrame } from '../../graph/funded-graph.mjs';
import { nativeTransferActionCommitment, nativeActionToNoir } from './native-capsules.mjs';
import { NATIVE_EXECUTION_PROFILE, nativeReceiptReadOpening, nativeReceiptCommitment,
  nativeReceiptToNoir, canonicalNativeEffectId, nativeEffectToNoir } from '../state/native-receipt.mjs';
import { nodeHash, membership } from '../state/native-state.mjs';
import { normalizeNativeQuorumRegistry, nativeQuorumRegistryCommitment,
  createNativeQuorumHostVerifier } from '../../../evidence/native-quorum.mjs';

export const NATIVE_ADMISSION_PUBLIC_INPUT_COUNT = 42;
export const NATIVE_ADMISSION_RULE_CAPACITY = 8;
export const NATIVE_ADMISSION_LOSS_CLAUSE = 'FULL_OWNER_REFUND_PROVIDER_LOSS_V1';
export const NATIVE_ADMISSION_TAGS = Object.freeze({
  rule: 'LIANUM/PAEG/native-rule/2', chain: 'LIANUM/evidence-chain/1',
  provider: 'LIANUM/PAEG/provider-identity/2', ready: 'LIANUM/PAEG/ready-statement/2',
  loss: 'LIANUM/PAEG/delivery-loss-acceptance/2', dispatch: 'LIANUM/PAEG/provider-dispatch/2',
  attestation: 'LIANUM/PAEG/native-attestation/2',
});
const ZERO = '0'.repeat(64);
const PROFILE = Buffer.from(NATIVE_EXECUTION_PROFILE, 'ascii');
const U32 = (1n << 32n) - 1n, U64 = (1n << 64n) - 1n;
const FIELD_MAX = 21888242871839275222246405745257275088548364400416034343698204186575808495616n;
const ORDER = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
const FAMILIES = ['BTC', 'SOL', 'EVM', 'TRON'];
const RULE_SPEC = [
  ['family', 1], ['genesis', 32], ['asset', 32], ['finalityKind', 1],
  ['minimumConfirmations', 4], ['maximumEvidenceLifetime', 8], ['maximumClockSkew', 8],
];
const OBSERVATION_SPEC = [
  ['blockId', 32], ['stateCommitment', 32], ['blockHeight', 8], ['observedAt', 8],
  ['finalityKind', 1], ['confirmations', 4], ['sourceCommitment', 32],
  ['destinationCommitment', 32], ['amount', 16], ['custodyKind', 1], ['custodyCommitment', 32],
  ['evidenceFrom', 8], ['evidenceUntil', 8],
];
const ACTION_FIELDS = ['chainDomain', 'signerIdentity', 'sourceCommitment', 'destinationCommitment',
  'amount', 'custodyKind', 'custodyCommitment', 'executionFrom', 'executionUntil', 'settleBefore',
  'receiptKeyCommitment', 'receiptRho', 'deliveryRiskCommitment', 'actionSalt'];
const LOSS_FIELDS = ['clause', 'hubDomain', 'registryCommitment', 'chainDomain', 'sourceCommitment',
  'destinationCommitment', 'amount', 'scope', 'policy', 'asset', 'payoutCommitment', 'settleBefore', 'salt'];
const DISPATCH_FIELDS = ['hubDomain', 'registryCommitment', 'readyStatement', 'localCommitment',
  'dispatchId', 'actionCommitment', 'globalEffectId', 'deliveryRiskCommitment', 'signedAt'];
const ATTESTATION_FIELDS = ['hubDomain', 'registryCommitment', 'ruleCommitment', 'readyStatement',
  'dispatchStatement', 'receiptCommitment', 'globalEffectId', 'observation'];

function exact(value, fields, label) {
  const code = `PAEG_ADMISSION_${label}_FIELDS`;
  assert.ok(value && Object.getPrototypeOf(value) === Object.prototype, code);
  const keys = Reflect.ownKeys(value);
  assert.ok(keys.every(key => typeof key === 'string'), code);
  assert.deepEqual(keys.sort(), [...fields].sort(), code);
  for (const key of fields) assert.ok(Object.hasOwn(Object.getOwnPropertyDescriptor(value, key), 'value'), code);
}
function array(value, length, label) {
  const code = `PAEG_ADMISSION_${label}_ARRAY`;
  assert.ok(Array.isArray(value) && Object.getPrototypeOf(value) === Array.prototype, code);
  assert.equal(value.length, length, code);
  const keys = Reflect.ownKeys(value);
  assert.ok(keys.every(key => typeof key === 'string'), code);
  assert.deepEqual(keys.sort(), ['length', ...Array.from({ length }, (_, i) => String(i))].sort(), code);
  for (let i = 0; i < length; i++) assert.ok(Object.hasOwn(Object.getOwnPropertyDescriptor(value, i), 'value'), code);
}
function uint(value, maximum, label) {
  const match = typeof value === 'string' ? /^(0|[1-9][0-9]*)$/.exec(value) : null;
  assert.ok(match && match[0] === value && value.length <= 77,
    `PAEG_ADMISSION_${label}_INTEGER`);
  const result = BigInt(value);
  assert.ok(result <= maximum, `PAEG_ADMISSION_${label}_RANGE`);
  return result;
}
function integer(value, width, label) {
  return Buffer.from(uint(value, (1n << BigInt(width * 8)) - 1n, label).toString(16).padStart(width * 2, '0'), 'hex');
}
function hex(value, width, label, allowZero = false) {
  assert.ok(typeof value === 'string' && value.length === width * 2 && new RegExp(`^[0-9a-f]{${width * 2}}$`).test(value),
    `PAEG_ADMISSION_${label}_HEX`);
  assert.ok(allowZero || value !== '0'.repeat(width * 2), `PAEG_ADMISSION_${label}_ZERO`);
  return Buffer.from(value, 'hex');
}
const digest = (value, label = 'DIGEST', allowZero = false) => hex(value, 32, label, allowZero);
const sha256 = value => createHash('sha256').update(value).digest('hex');
const snake = field => field.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
const words = value => {
  const bytes = digest(value);
  return Array.from({ length: 8 }, (_, i) => bytes.readUInt32BE(i * 4).toString());
};
const digestAt = (inputs, offset) => inputs.slice(offset, offset + 8)
  .map(value => BigInt(value).toString(16).padStart(8, '0')).join('');
const merkleNode = (left, right) => nodeHash(`0x${left}`, `0x${right}`).slice(2);

function specBytes(value, spec, label) {
  exact(value, spec.map(([field]) => field), label);
  return spec.map(([field, width]) => width === 32 ? digest(value[field], field) : integer(value[field], width, field));
}
function specToNoir(value, spec, encoded) {
  return Object.fromEntries(spec.map(([field, width], i) => [snake(field), width === 32 ? [...encoded[i]] : value[field]]));
}
function ruleBytes(rule) {
  const encoded = specBytes(rule, RULE_SPEC, 'RULE');
  assert.ok(['1', '2', '3', '4'].includes(rule.family), 'PAEG_ADMISSION_RULE_FAMILY');
  assert.equal(rule.finalityKind, rule.family, 'PAEG_ADMISSION_RULE_FINALITY');
  const confirmations = BigInt(rule.minimumConfirmations);
  assert.ok(rule.family === '1' ? confirmations >= 6n : rule.family === '3' ? confirmations >= 1n
    : confirmations === 0n, 'PAEG_ADMISSION_RULE_CONFIRMATIONS');
  assert.ok(BigInt(rule.maximumEvidenceLifetime) > 0n && BigInt(rule.maximumEvidenceLifetime) <= 86400n,
    'PAEG_ADMISSION_RULE_LIFETIME');
  assert.ok(BigInt(rule.maximumClockSkew) <= 30n, 'PAEG_ADMISSION_RULE_CLOCK_SKEW');
  return encoded;
}

export function nativeAdmissionRuleFrame(rule) {
  return fundedFrame(NATIVE_ADMISSION_TAGS.rule, [PROFILE, ...ruleBytes(rule)]);
}
export const nativeAdmissionRuleCommitment = rule => sha256(nativeAdmissionRuleFrame(rule));
export function nativeAdmissionRuleToNoir(rule) { return specToNoir(rule, RULE_SPEC, ruleBytes(rule)); }

/** Original evidence-chain/1 frame, also embedded verbatim in canonical GID. */
export function nativeAdmissionChainDomainFrame(rule) {
  ruleBytes(rule);
  return fundedFrame(NATIVE_ADMISSION_TAGS.chain, [Buffer.from(FAMILIES[Number(rule.family) - 1], 'ascii'),
    digest(rule.genesis), digest(rule.asset)]);
}
export const nativeAdmissionChainDomain = rule => sha256(nativeAdmissionChainDomainFrame(rule));

function path(value, depth, label) {
  exact(value, ['index', 'siblings'], label);
  uint(value.index, (1n << BigInt(depth)) - 1n, `${label}_INDEX`);
  array(value.siblings, depth, `${label}_SIBLINGS`);
  value.siblings.forEach(sibling => digest(sibling, `${label}_SIBLING`, true));
}
export function nativeAdmissionRuleRoot(rule, rulePath) {
  path(rulePath, 3, 'RULE_PATH');
  let root = nativeAdmissionRuleCommitment(rule);
  const index = Number(rulePath.index);
  rulePath.siblings.forEach((sibling, depth) => {
    root = (index >> depth) & 1 ? merkleNode(sibling, root) : merkleNode(root, sibling);
  });
  return root;
}

/** One to eight ordered rules; unused leaf slots are exactly 32 zero bytes. */
export function nativeAdmissionRulesTree(rules) {
  assert.ok(Array.isArray(rules) && rules.length > 0 && rules.length <= NATIVE_ADMISSION_RULE_CAPACITY,
    'PAEG_ADMISSION_RULE_COUNT');
  array(rules, rules.length, 'RULES');
  const commitments = rules.map(nativeAdmissionRuleCommitment);
  while (commitments.length < NATIVE_ADMISSION_RULE_CAPACITY) commitments.push(ZERO);
  const levels = [commitments];
  for (let depth = 0; depth < 3; depth++) {
    levels.push(Array.from({ length: levels[depth].length / 2 }, (_, i) =>
      merkleNode(levels[depth][i * 2], levels[depth][i * 2 + 1])));
  }
  return { root: levels[3][0], commitments: [...commitments], paths: rules.map((_, index) => ({
    index: String(index), siblings: levels.slice(0, 3).map((level, depth) => level[(index >> depth) ^ 1]),
  })) };
}

function providerKey(key) {
  exact(key, ['x', 'y'], 'PROVIDER_KEY');
  const x = digest(key.x, 'PROVIDER_KEY_X', true), y = digest(key.y, 'PROVIDER_KEY_Y', true);
  try { ECDH.convertKey(Buffer.concat([Buffer.from([4]), x, y]), 'secp256k1'); }
  catch { assert.fail('PAEG_ADMISSION_PROVIDER_KEY_NOT_ON_CURVE'); }
  return [x, y];
}
export function nativeProviderIdentityFrame(key) {
  return fundedFrame(NATIVE_ADMISSION_TAGS.provider, [PROFILE, ...providerKey(key)]);
}
export const nativeProviderIdentity = key => sha256(nativeProviderIdentityFrame(key));

function readyInputs(value) {
  array(value, 98, 'READY_INPUTS');
  value.forEach((word, index) => uint(word, index < 96 ? U32 : U64, 'READY_INPUT'));
}
/** Compact 400-byte body: 96 u32BE words followed by two full u64BE times. */
export function nativeReadyStatementFrame(inputs) {
  readyInputs(inputs);
  return fundedFrame(NATIVE_ADMISSION_TAGS.ready, [PROFILE,
    Buffer.concat(inputs.map((word, i) => integer(word, i < 96 ? 4 : 8, 'READY_INPUT')))]);
}
export const nativeReadyStatementDigest = inputs => sha256(nativeReadyStatementFrame(inputs));

/** Explicit provider acceptance of FULL_OWNER_REFUND_PROVIDER_LOSS_V1.
 * The clause allows a full owner refund with provider delivery loss; it promises
 * neither insurance nor provider recovery. These are commitment bytes only;
 * the provider's dispatch signature must bind the resulting action commitment.
 * Terms are separate from the action to avoid a circular action/risk digest.
 */
export function nativeDeliveryRiskFrame(terms) {
  exact(terms, LOSS_FIELDS, 'LOSS');
  assert.equal(terms.clause, NATIVE_ADMISSION_LOSS_CLAUSE, 'PAEG_ADMISSION_LOSS_CLAUSE');
  const encoded = LOSS_FIELDS.slice(1).map(field => field === 'amount' ? integer(terms[field], 16, field)
    : field === 'settleBefore' ? integer(terms[field], 8, field) : digest(terms[field], field));
  assert.ok(BigInt(terms.amount) > 0n, 'PAEG_ADMISSION_LOSS_AMOUNT');
  return fundedFrame(NATIVE_ADMISSION_TAGS.loss, [PROFILE, Buffer.from(terms.clause, 'ascii'), ...encoded]);
}
export const nativeDeliveryRiskCommitment = terms => sha256(nativeDeliveryRiskFrame(terms));

/** Give these original bytes to SHA256/ECDSA signers, never hash the digest again. */
export function nativeDispatchStatementFrame(statement) {
  exact(statement, DISPATCH_FIELDS, 'DISPATCH');
  return fundedFrame(NATIVE_ADMISSION_TAGS.dispatch, [PROFILE,
    ...DISPATCH_FIELDS.map(field => field === 'signedAt' ? integer(statement[field], 8, field) : digest(statement[field], field))]);
}
export const nativeDispatchStatementDigest = statement => sha256(nativeDispatchStatementFrame(statement));

export function nativeAdmissionObservationToNoir(observation) {
  return specToNoir(observation, OBSERVATION_SPEC, specBytes(observation, OBSERVATION_SPEC, 'OBSERVATION'));
}
export function nativeAttestationStatementFrame(statement) {
  exact(statement, ATTESTATION_FIELDS, 'ATTESTATION');
  return fundedFrame(NATIVE_ADMISSION_TAGS.attestation, [PROFILE,
    ...ATTESTATION_FIELDS.slice(0, -1).map(field => digest(statement[field], field)),
    ...specBytes(statement.observation, OBSERVATION_SPEC, 'OBSERVATION')]);
}
export const nativeAttestationStatementDigest = statement => sha256(nativeAttestationStatementFrame(statement));

/** All four registered points are validated, including the unused fourth key. */
export function nativeAdmissionRegistryToNoir(input) {
  const registry = normalizeNativeQuorumRegistry(input);
  integer(registry.registryEpoch, 8, 'REGISTRY_EPOCH');
  return { hub_domain: [...digest(registry.hubDomain)], epoch: registry.registryEpoch,
    rules_root: [...digest(registry.rulesRoot)], keys_x: registry.keys.map(key => [...digest(key.x, 'KEY_X', true)]),
    keys_y: registry.keys.map(key => [...digest(key.y, 'KEY_Y', true)]) };
}

function recursivePackage(value) {
  exact(value, ['publicInputs', 'proofFields', 'vkFields'], 'READY_PROOF');
  readyInputs(value.publicInputs);
  for (const [field, size] of [['proofFields', 458], ['vkFields', 115]]) {
    array(value[field], size, `READY_${field}`);
    value[field].forEach(word => uint(word, FIELD_MAX, `READY_${field}`));
  }
  // vkFields is checked only for exact shape. Admission uses its embedded key;
  // passing a caller's key to that relation would defeat the pin.
  return { inputs: [...value.publicInputs], proof: [...value.proofFields] };
}
function assertProviderSignature(key, message, signature) {
  providerKey(key);
  const bytes = hex(signature, 64, 'PROVIDER_SIGNATURE');
  const r = BigInt('0x' + signature.slice(0, 64)), s = BigInt('0x' + signature.slice(64));
  assert.ok(r > 0n && r < ORDER && s > 0n && s < ORDER, 'PAEG_ADMISSION_PROVIDER_SIGNATURE_RANGE');
  assert.ok(s <= ORDER / 2n, 'PAEG_ADMISSION_PROVIDER_SIGNATURE_HIGH_S');
  const publicKey = createPublicKey({ format: 'jwk', key: { kty: 'EC', crv: 'secp256k1',
    x: digest(key.x, 'KEY_X', true).toString('base64url'), y: digest(key.y, 'KEY_Y', true).toString('base64url') } });
  assert.ok(verify('sha256', message, { key: publicKey, dsaEncoding: 'ieee-p1363' }, bytes),
    'PAEG_ADMISSION_PROVIDER_SIGNATURE_INVALID');
}

/**
 * trustedConfiguration is exactly { expectedRegistryCommitment,
 * acceptedCheckpointRoot }, obtained from the intended authenticated hub.
 * Do not derive that configuration from an untrusted request. The composer
 * cannot establish its provenance, currentness, or a deployment's trust model.
 *
 * input.readyProof is an exact { publicInputs[98], proofFields[458],
 * vkFields[115] } selection, all canonical decimal strings. Shape-valid fake
 * proofs are deliberately NOT accepted as proof of anything: the return value
 * always labels the recursive fields unverified. A real proof still needs the
 * pinned circuit/backend; there is no host boolean that skips that verifier.
 *
 * All new integers/indexes are decimal strings and all hex is bare lowercase.
 * action uses the existing native-capsules schema (custodyKind is numeric 1).
 * Both paths are { index: decimal, siblings: bare digest[] }; depths are 6/3.
 * Provider and three quorum signatures must be real canonical low-S signatures
 * over their original message frames. No signer secrets are accepted or kept.
 */
export function prepareNativeAdmission(input, trustedConfiguration) {
  exact(trustedConfiguration, ['expectedRegistryCommitment', 'acceptedCheckpointRoot'], 'CONFIGURATION');
  digest(trustedConfiguration.expectedRegistryCommitment, 'TRUSTED_REGISTRY');
  digest(trustedConfiguration.acceptedCheckpointRoot, 'TRUSTED_CHECKPOINT_ROOT');
  exact(input, ['readyProof', 'registry', 'rule', 'rulePath', 'checkpointPath', 'action', 'effect', 'opening',
    'observation', 'providerKey', 'dispatchSignedAt', 'dispatchSignature', 'deliveryRiskClause', 'deliveryRiskSalt',
    'attesterIndexes', 'attesterSignatures', 'admissionFrom', 'admissionUntil'], 'INPUT');
  const ready = recursivePackage(input.readyProof), r = ready.inputs;
  const registry = normalizeNativeQuorumRegistry(input.registry), hub = registry.hubDomain;
  const registryId = nativeQuorumRegistryCommitment(registry);
  const quorum = createNativeQuorumHostVerifier({ registry,
    expectedRegistryCommitment: trustedConfiguration.expectedRegistryCommitment });
  const registryWitness = nativeAdmissionRegistryToNoir(registry);
  assert.equal(digestAt(r, 24), hub, 'PAEG_ADMISSION_READY_HUB');
  assert.equal(digestAt(r, 32), registryId, 'PAEG_ADMISSION_READY_REGISTRY');
  path(input.checkpointPath, 6, 'CHECKPOINT_PATH');
  membership(`0x${digestAt(r, 40)}`, input.checkpointPath.siblings.map(value => `0x${value}`),
    input.checkpointPath.index, `0x${trustedConfiguration.acceptedCheckpointRoot}`);

  const ruleWitness = nativeAdmissionRuleToNoir(input.rule), rule = input.rule;
  const ruleCommitment = nativeAdmissionRuleCommitment(rule);
  assert.equal(nativeAdmissionRuleRoot(rule, input.rulePath), registry.rulesRoot, 'PAEG_ADMISSION_RULE_MEMBERSHIP');
  assert.equal(ruleCommitment, digestAt(r, 72), 'PAEG_ADMISSION_READY_RULE');
  const chain = nativeAdmissionChainDomain(rule);
  assert.equal(chain, digestAt(r, 64), 'PAEG_ADMISSION_READY_CHAIN');
  exact(input.effect, ['chainDomain', 'effectIdentity'], 'EFFECT');
  exact(input.effect.chainDomain, ['chain', 'genesis', 'asset'], 'EFFECT_DOMAIN');
  exact(input.effect.effectIdentity, ['transactionId', 'effectIndex'], 'EFFECT_IDENTITY');
  const effectDomain = input.effect.chainDomain, effectIdentity = input.effect.effectIdentity;
  assert.ok(FAMILIES.includes(effectDomain.chain), 'PAEG_ADMISSION_EFFECT_FAMILY');
  digest(effectDomain.genesis, 'EFFECT_GENESIS'); digest(effectDomain.asset, 'EFFECT_ASSET');
  hex(effectIdentity.transactionId, effectDomain.chain === 'SOL' ? 64 : 32, 'EFFECT_TRANSACTION', true);
  integer(effectIdentity.effectIndex, 4, 'EFFECT_INDEX');
  const effectWitness = nativeEffectToNoir(input.effect), gid = canonicalNativeEffectId(input.effect);
  assert.equal(effectWitness.family, rule.family, 'PAEG_ADMISSION_EFFECT_FAMILY');
  assert.equal(input.effect.chainDomain.genesis, rule.genesis, 'PAEG_ADMISSION_EFFECT_GENESIS');
  assert.equal(input.effect.chainDomain.asset, rule.asset, 'PAEG_ADMISSION_EFFECT_ASSET');

  exact(input.action, ACTION_FIELDS, 'ACTION');
  for (const field of ACTION_FIELDS) {
    if (field === 'custodyKind') assert.equal(input.action[field], 1, 'PAEG_ADMISSION_ACTION_CUSTODY_KIND');
    else if (field === 'amount') integer(input.action[field], 16, 'ACTION_AMOUNT');
    else if (['executionFrom', 'executionUntil', 'settleBefore'].includes(field)) integer(input.action[field], 8, field);
    else digest(input.action[field], field);
  }
  const action = input.action, actionWitness = nativeActionToNoir(action);
  const actionCommitment = nativeTransferActionCommitment(action);
  assert.equal(actionCommitment, digestAt(r, 80), 'PAEG_ADMISSION_READY_ACTION');
  assert.equal(action.chainDomain, chain, 'PAEG_ADMISSION_ACTION_CHAIN');
  assert.equal(nativeProviderIdentity(input.providerKey), action.signerIdentity, 'PAEG_ADMISSION_PROVIDER_IDENTITY');
  const risk = nativeDeliveryRiskCommitment({ clause: input.deliveryRiskClause, hubDomain: hub,
    registryCommitment: registryId, chainDomain: action.chainDomain, sourceCommitment: action.sourceCommitment,
    destinationCommitment: action.destinationCommitment, amount: action.amount, scope: digestAt(r, 0),
    policy: digestAt(r, 8), asset: digestAt(r, 16), payoutCommitment: digestAt(r, 88),
    settleBefore: action.settleBefore, salt: input.deliveryRiskSalt });
  assert.equal(risk, action.deliveryRiskCommitment, 'PAEG_ADMISSION_DELIVERY_RISK');

  const observed = input.observation, observationWitness = nativeAdmissionObservationToNoir(observed);
  for (const field of ['sourceCommitment', 'destinationCommitment', 'amount', 'custodyCommitment']) {
    assert.equal(observed[field], action[field], 'PAEG_ADMISSION_OBSERVATION_ACTION');
  }
  assert.equal(observed.custodyKind, String(action.custodyKind), 'PAEG_ADMISSION_OBSERVATION_CUSTODY');
  assert.equal(observed.finalityKind, rule.finalityKind, 'PAEG_ADMISSION_OBSERVATION_FINALITY');
  assert.ok(BigInt(observed.confirmations) >= BigInt(rule.minimumConfirmations), 'PAEG_ADMISSION_OBSERVATION_CONFIRMATIONS');
  const evidenceFrom = BigInt(observed.evidenceFrom), evidenceUntil = BigInt(observed.evidenceUntil);
  const observedAt = BigInt(observed.observedAt), skew = BigInt(rule.maximumClockSkew);
  assert.ok(evidenceFrom <= observedAt && observedAt < evidenceUntil, 'PAEG_ADMISSION_EVIDENCE_WINDOW');
  assert.ok(evidenceUntil - evidenceFrom <= BigInt(rule.maximumEvidenceLifetime), 'PAEG_ADMISSION_EVIDENCE_LIFETIME');
  assert.ok(evidenceUntil <= BigInt(action.settleBefore), 'PAEG_ADMISSION_EVIDENCE_CUTOFF');
  const from = uint(input.admissionFrom, U64, 'FROM'), until = uint(input.admissionUntil, U64, 'UNTIL');
  assert.ok(from < until && evidenceFrom <= from && until <= evidenceUntil, 'PAEG_ADMISSION_INTERVAL');
  const signedAt = uint(input.dispatchSignedAt, U64, 'DISPATCH_TIME');
  assert.ok(from >= observedAt || observedAt - from <= skew, 'PAEG_ADMISSION_OBSERVATION_CLOCK_SKEW');
  assert.ok(observedAt >= signedAt || signedAt - observedAt <= skew, 'PAEG_ADMISSION_DISPATCH_CLOCK_SKEW');
  assert.ok(BigInt(r[96]) <= signedAt && signedAt < BigInt(r[97]), 'PAEG_ADMISSION_READY_DISPATCH_WINDOW');
  assert.ok(BigInt(action.executionFrom) <= signedAt && signedAt < BigInt(action.executionUntil),
    'PAEG_ADMISSION_ACTION_DISPATCH_WINDOW');

  const opening = nativeReceiptReadOpening(input.opening);
  for (const [field, expected] of Object.entries({ hubDomain: hub, registryCommitment: registryId,
    globalEffectId: gid, scope: digestAt(r, 0), policy: digestAt(r, 8), localCommitment: digestAt(r, 48),
    dispatchId: digestAt(r, 56), chainDomain: chain, evidencePolicy: ruleCommitment, actionCommitment,
    payoutCommitment: digestAt(r, 88), receiptKeyCommitment: action.receiptKeyCommitment,
    receiptRho: action.receiptRho, validFrom: observed.evidenceFrom, validUntil: observed.evidenceUntil })) {
    assert.equal(opening[field], expected, `PAEG_ADMISSION_RECEIPT_${field}`);
  }
  const receiptCommitment = nativeReceiptCommitment(opening), readyStatement = nativeReadyStatementDigest(r);
  const dispatch = { hubDomain: hub, registryCommitment: registryId, readyStatement,
    localCommitment: opening.localCommitment, dispatchId: opening.dispatchId, actionCommitment,
    globalEffectId: gid, deliveryRiskCommitment: action.deliveryRiskCommitment, signedAt: input.dispatchSignedAt };
  assertProviderSignature(input.providerKey, nativeDispatchStatementFrame(dispatch), input.dispatchSignature);
  const attestation = { hubDomain: hub, registryCommitment: registryId, ruleCommitment, readyStatement,
    dispatchStatement: nativeDispatchStatementDigest(dispatch), receiptCommitment, globalEffectId: gid, observation: observed };
  array(input.attesterIndexes, 3, 'ATTESTER_INDEXES');
  array(input.attesterSignatures, 3, 'ATTESTER_SIGNATURES');
  const indexes = input.attesterIndexes.map(index => Number(uint(index, 3n, 'ATTESTER_INDEX')));
  quorum.assertQuorumForMessage({ messageBytes: nativeAttestationStatementFrame(attestation),
    indexes, signatures: input.attesterSignatures });

  const publicInputs = { hub_domain: words(hub), registry_commitment: words(registryId),
    accepted_checkpoint_root: words(trustedConfiguration.acceptedCheckpointRoot), global_effect_id: words(gid),
    receipt_commitment: words(receiptCommitment), admission_from: input.admissionFrom, admission_until: input.admissionUntil };
  const expectedPublicInputs = Object.values(publicInputs).flat();
  assert.equal(expectedPublicInputs.length, NATIVE_ADMISSION_PUBLIC_INPUT_COUNT, 'PAEG_ADMISSION_ABI');
  return { assurance: 'host-bindings-and-signatures-only', recursiveProofVerification: 'unverified',
    inputs: { ...publicInputs, ready_proof: ready.proof, ready_inputs: ready.inputs,
      checkpoint_siblings: input.checkpointPath.siblings.map(value => [...digest(value, 'SIBLING', true)]),
      checkpoint_index: input.checkpointPath.index, registry: registryWitness, rule: ruleWitness,
      rule_siblings: input.rulePath.siblings.map(value => [...digest(value, 'SIBLING', true)]), rule_index: input.rulePath.index,
      action: actionWitness, effect: effectWitness, opening: nativeReceiptToNoir(opening), observation: observationWitness,
      provider_key_x: [...digest(input.providerKey.x, 'KEY_X', true)], provider_key_y: [...digest(input.providerKey.y, 'KEY_Y', true)],
      dispatch_signed_at: input.dispatchSignedAt, dispatch_signature: [...hex(input.dispatchSignature, 64, 'SIGNATURE')],
      delivery_risk_salt: [...digest(input.deliveryRiskSalt)], attester_indexes: [...input.attesterIndexes],
      attester_signatures: input.attesterSignatures.map(value => [...hex(value, 64, 'SIGNATURE')]) }, expectedPublicInputs };
}
