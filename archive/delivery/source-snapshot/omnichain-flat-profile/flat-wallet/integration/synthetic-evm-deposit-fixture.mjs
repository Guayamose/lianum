/** Fixed synthetic D27/I84 constraint fixtures. No backend, node:test, proof,
 * keys from custody, native transaction or deployment is loaded here. The
 * caller injects the pinned official Poseidon2; SHA-labelled history values
 * below are explicitly synthetic roots, not fabricated Poseidon openings.
 * Every signing scalar is public deterministic fixture material. */
import assert from 'node:assert/strict';
import { createHash, createECDH, createPrivateKey, sign } from 'node:crypto';
import { buildAdmissionInputs } from '../wallet-platform/modules/paeg/admission-inputs.mjs';
import { createCommitmentCodec, digestBytes, digestWords, ZERO } from '../wallet-platform/modules/paeg/commitments.mjs';
import { readyDescriptorWords } from '../wallet-platform/modules/paeg/readiness-inputs.mjs';
import { FACTS_SCHEMA, nativeFactIdentity, nativeRuleCommitment, nativeCustodyCommitment,
  nativeObservedEffectCommitment, receiptKeyCommitment, encodeNativeFacts, nativeFactsDigest,
  nativeAdmissionNullifier } from '../wallet-platform/modules/chain-adapters/native-receipt-binding.mjs';
import { nativeAdmissionChainDomain, nativeAdmissionRuleRoot, nativeProviderIdentity,
  nativeReadyStatementDigest, nativeDeliveryRiskCommitment, nativeDispatchStatementFrame,
  NATIVE_ADMISSION_LOSS_CLAUSE } from '../../../omnichain-product/src/paeg/native-admission.mjs';
import { nativeTransferActionCommitment } from '../../../omnichain-product/src/paeg/native-capsules.mjs';
import { NATIVE_QUORUM_PROFILE, nativeQuorumRegistryCommitment }
  from '../../../omnichain-product/src/evidence/native-quorum.mjs';
import { PrivateNoteTree } from '../../../omnichain-product/src/private-note-tree.mjs';

import { depositIntentWitness, depositIntentFrame } from '../wallet-platform/modules/paeg/deposit-intent.mjs';
import { balanceCommitment } from '../../../omnichain-product/src/private-wallet-note-encoding.mjs';

const h = label => createHash('sha256').update('SYNTHETIC-EVM-ADMISSION/' + label).digest('hex');
const field = label => '00' + h(label).slice(2);
const ORDER = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
function syntheticSigner(index) {
  const d = Buffer.from(index.toString(16).padStart(64, '0'), 'hex');
  const curve = createECDH('secp256k1'); curve.setPrivateKey(d);
  const point = curve.getPublicKey(null, 'uncompressed'), x = point.subarray(1, 33), y = point.subarray(33);
  let key = createPrivateKey({ format: 'jwk', key: { kty: 'EC', crv: 'secp256k1',
    d: d.toString('base64url'), x: x.toString('base64url'), y: y.toString('base64url') } });
  d.fill(0);
  return { publicKey: { x: x.toString('hex'), y: y.toString('hex') }, sign(frame) {
    assert.ok(key, 'ENVELOPE_SYNTHETIC_SIGNER_DESTROYED');
    const signature = sign('sha256', frame, { key, dsaEncoding: 'ieee-p1363' });
    const s = BigInt('0x' + signature.subarray(32).toString('hex'));
    if (s > ORDER / 2n) Buffer.from((ORDER - s).toString(16).padStart(64, '0'), 'hex').copy(signature, 32);
    return signature.toString('hex');
  }, destroy() { key = null; } };
}

export async function buildSyntheticEvmDepositFixture({ hashFields, abis }) {
const attesters = [1, 2, 3, 4].map(syntheticSigner), provider = syntheticSigner(5), owner = syntheticSigner(6);
const codec = createCommitmentCodec({ hashFields });
function policyFor(raw) { return { ledgerNamespace: raw.readinessOpening.domain.ledgerNamespace,
  hubDomain: raw.registry.hubDomain, registryCommitment: raw.readinessOpening.domain.registryCommitment, rule: raw.rule }; }
function signFacts(facts, policy) {
  const frame = encodeNativeFacts(facts, policy);
  return attesters.slice(0, 3).map((attester, index) => ({ schema: FACTS_SCHEMA, signerIndex: String(index),
    facts: structuredClone(facts), frameHex: frame.toString('hex'), digest: nativeFactsDigest(facts, policy),
    signature: attester.sign(frame) }));
}
function refreshObserved(facts) {
  const endpoints = { family: facts.family, genesis: facts.genesis, asset: facts.asset,
    sourceCommitment: facts.observation.sourceCommitment, destinationCommitment: facts.observation.destinationCommitment };
  facts.observation.custodyCommitment = nativeCustodyCommitment(endpoints);
  facts.observation.stateCommitment = nativeObservedEffectCommitment({ ...endpoints, nativeGid: facts.nativeGid,
    blockId: facts.observation.blockId, blockHeight: facts.observation.blockHeight,
    transactionSHA256: facts.transactionSHA256, amount: facts.observation.amount });
}
async function admissionFixture(family) {
  const rule = { family, genesis: h('genesis-' + family), asset: h('delivery-asset-' + family), finalityKind: family,
    minimumConfirmations: family === '1' ? '6' : family === '2' ? '0' : '1',
    maximumEvidenceLifetime: '300', maximumClockSkew: '30' };
  const rulePath = { index: '0', siblings: [ZERO, ZERO, ZERO] };
  const registry = { profile: NATIVE_QUORUM_PROFILE, hubDomain: h('hub'), registryEpoch: '1',
    rulesRoot: nativeAdmissionRuleRoot(rule, rulePath), keys: attesters.map(signer => signer.publicKey) };
  const domain = { scope: h('source-scope'), policy: h('source-policy'), asset: h('source-PALT'),
    hubDomain: registry.hubDomain, registryCommitment: nativeQuorumRegistryCommitment(registry),
    verifierSetCommitment: h('synthetic-verifier-set'), ledgerNamespace: registry.hubDomain };
  const d = await codec.domainCommitment(domain), secret = h('receipt-secret');
  const endpoints = { family, genesis: rule.genesis, asset: rule.asset,
    sourceCommitment: h('typed-funding-' + family), destinationCommitment: h('typed-descriptor-and-D27-' + family) };
  const action = { chainDomain: nativeAdmissionChainDomain(rule), signerIdentity: nativeProviderIdentity(provider.publicKey),
    sourceCommitment: endpoints.sourceCommitment, destinationCommitment: endpoints.destinationCommitment,
    amount: '50000', custodyKind: 1, custodyCommitment: nativeCustodyCommitment(endpoints),
    executionFrom: '1100', executionUntil: '1600', settleBefore: '2000',
    receiptKeyCommitment: receiptKeyCommitment({ ledgerNamespace: domain.ledgerNamespace, secret }),
    receiptRho: h('rho'), deliveryRiskCommitment: h('placeholder'), actionSalt: h('action-salt') };
  const payoutCommitment = h('original-solver-private-PALT-note'), deliveryRiskSalt = h('risk-salt');
  action.deliveryRiskCommitment = nativeDeliveryRiskCommitment({ clause: NATIVE_ADMISSION_LOSS_CLAUSE,
    hubDomain: domain.hubDomain, registryCommitment: domain.registryCommitment, chainDomain: action.chainDomain,
    sourceCommitment: action.sourceCommitment, destinationCommitment: action.destinationCommitment,
    amount: action.amount, scope: domain.scope, policy: domain.policy, asset: domain.asset,
    payoutCommitment, settleBefore: action.settleBefore, salt: deliveryRiskSalt });
  const descriptor = { scope: domain.scope, policy: domain.policy, asset: domain.asset, hubDomain: domain.hubDomain,
    registryCommitment: domain.registryCommitment, snapshotDigest: h('historical-checkpoint'),
    localCommitment: h('historical-local'), dispatchId: h('dispatch'), chainDomain: action.chainDomain,
    evidencePolicy: nativeRuleCommitment(rule), actionCommitment: nativeTransferActionCommitment(action),
    payoutCommitment, readyFrom: '1100', readyUntil: '1150' };
  const readinessBlind = h('readiness-blind'), joinCommitment = field('historical-join');
  const readyStatement = { domainCommitment: d, authorizationRoot: field('historical-authorization'),
    checkpoint: descriptor.snapshotDigest, readinessEvidenceState: field('historical-evidence'), joinCommitment,
    readinessCommitment: await codec.readinessCommitment(d, joinCommitment, readinessBlind, descriptor),
    readyFrom: descriptor.readyFrom, readyUntil: descriptor.readyUntil };
  const tree = new PrivateNoteTree(), checkpointIndex = tree.append(readyStatement.checkpoint), path = tree.path(checkpointIndex);
  const checkpointOpening = { root: tree.root.slice(2), index: path.index, siblings: path.siblings.map(value => value.slice(2)) };
  const observation = { blockId: h('synthetic-block'), stateCommitment: h('placeholder'), blockHeight: '100', observedAt: '1101',
    finalityKind: family, confirmations: family === '2' ? '0' : '6', sourceCommitment: action.sourceCommitment,
    destinationCommitment: action.destinationCommitment, amount: action.amount, custodyKind: '1',
    custodyCommitment: action.custodyCommitment, evidenceFrom: '1101', evidenceUntil: '1401' };
  const facts = { ledgerNamespace: domain.ledgerNamespace, hubDomain: domain.hubDomain, registryCommitment: domain.registryCommitment,
    ruleCommitment: nativeRuleCommitment(rule), family, genesis: rule.genesis, asset: rule.asset,
    transactionId: h('transaction') + (family === '2' ? h('signature-tail') : ZERO), effectIndex: '0', nativeGid: h('placeholder'),
    transactionSHA256: h('synthetic-complete-wire'), wireBindingVersion: '1', wireBindingKind: family,
    wireBindingPosition: family === '1' ? '2' : family === '2' ? '1' : '0', wireKeyCommitment: action.receiptKeyCommitment,
    observation, nativeContext: family === '2'
      ? { observedTipId: ZERO, observedTipHeight: '0', transactionSlot: '120', parentSlot: '119', observedSlot: '130' }
      : { observedTipId: h('synthetic-tip'), observedTipHeight: '105', transactionSlot: '0', parentSlot: '0', observedSlot: '0' } };
  facts.nativeGid = nativeFactIdentity(Object.fromEntries(['family', 'genesis', 'asset', 'transactionId', 'effectIndex'].map(name => [name, facts[name]])));
  refreshObserved(facts);
  const dispatchStatement = { hubDomain: domain.hubDomain, registryCommitment: domain.registryCommitment,
    readyStatement: nativeReadyStatementDigest([...readyDescriptorWords(descriptor)]),
    localCommitment: descriptor.localCommitment, dispatchId: descriptor.dispatchId, actionCommitment: descriptor.actionCommitment,
    globalEffectId: facts.nativeGid, deliveryRiskCommitment: action.deliveryRiskCommitment, signedAt: '1100' };
  const receiptOpening = Object.fromEntries(['hubDomain', 'registryCommitment', 'scope', 'policy', 'localCommitment',
    'dispatchId', 'chainDomain', 'evidencePolicy', 'actionCommitment', 'payoutCommitment'].map(name => [name, descriptor[name]]));
  Object.assign(receiptOpening, { globalEffectId: facts.nativeGid, validFrom: '1101', validUntil: '1401',
    receiptKeyCommitment: action.receiptKeyCommitment, receiptRho: action.receiptRho });
  const entries = Array(64).fill(ZERO);
  const currentRevocation = { revokedDigest: await codec.revokedDigest(d, domain.hubDomain, entries, '0'),
    revokedCount: '0', revocationSequence: '0', entries };
  const raw = { readyStatement, readinessOpening: { domain, descriptor, readinessBlind }, action,
    receiptSpendSecret: secret, receiptOpening, checkpointOpening, registry, rule, rulePath,
    provider: { publicKey: provider.publicKey, dispatchStatement, signature: provider.sign(nativeDispatchStatementFrame(dispatchStatement)), deliveryRiskSalt },
    certificates: [], currentRevocation, admissionFrom: '1101', admissionUntil: '1401' };
  raw.certificates = signFacts(facts, policyFor(raw)); return raw;
}

  const cases = [];
  function positive(name, relation, job) {
    const entry = { name, relation, inputs: job.inputs, statement: job.statement,
      publicInputs: job.publicInputs ?? job.expectedPublicInputs, expected: true };
    cases.push(entry); return entry;
  }
  function negative(name, genuine, mutate) {
    const inputs = structuredClone(genuine.inputs); mutate(inputs);
    // Mutated public values are taken from the actual pinned ABI. Each negative
    // must survive ABI validation, then fail Noir constraints rather than host hygiene.
    const publicInputs = abis[genuine.relation].parameters
      .filter(parameter => parameter.visibility === 'public')
      .flatMap(parameter => [inputs[parameter.name]].flat(Infinity).map(String));
    const entry = { name, relation: genuine.relation, inputs, publicInputs, expected: false };
    cases.push(entry); return entry;
  }
  const destroy = () => { for (const signer of [...attesters, provider, owner]) signer.destroy(); };
  try {
    const note = { type: 4, rho: h('D27-note-rho'), x: owner.publicKey.x, y: owner.publicKey.y,
      value: '400', secret: h('D27-note-secret') };
    const statement = { scope: h('D27-scope'), policy: h('D27-policy'),
      validFrom: '1700000000', validUntil: '1700007200', amount: note.value,
      output: balanceCommitment(h('D27-scope'), h('D27-policy'), note).toString('hex') };
    const deposit = positive('d27-genuine-owner', 'deposit_intent', depositIntentWitness({
      statement, note, signature: owner.sign(depositIntentFrame(statement)) }));
    negative('d27-changed-amount', deposit, inputs => { inputs.amount = '401'; });
    negative('d27-changed-output', deposit, inputs => { inputs.output[0] = (Number(inputs.output[0]) ^ 1) >>> 0; });
    negative('d27-changed-window', deposit, inputs => { inputs.valid_until = '1700007201'; });
    negative('d27-wrong-owner-signature', deposit, inputs => {
      inputs.signature = [...Buffer.from(provider.sign(depositIntentFrame(statement)), 'hex')];
    });
    const raw = await admissionFixture('3');
    const evm = positive('i84-evm-genuine-provider-quorum', 'admission',
      await buildAdmissionInputs(raw, { hashFields, abi: abis.admission }));
    for (const [family, label] of [['1', 'btc'], ['2', 'sol']])
      positive('i84-' + label + '-legacy-branch', 'admission',
        await buildAdmissionInputs(await admissionFixture(family), { hashFields, abi: abis.admission }));
    negative('i84-evm-wrong-wire-position', evm, inputs => { inputs.wire.wire_binding_position = '1'; });
    negative('i84-evm-nonzero-transaction-tail', evm, inputs => { inputs.effect.transaction_id[63] = 1; });
    negative('i84-evm-wrong-wire-key', evm, inputs => { inputs.wire.wire_key_commitment[0] ^= 1; });
    negative('i84-evm-wrong-provider-signature', evm, inputs => {
      inputs.dispatch_signature = [...Buffer.from(owner.sign(nativeDispatchStatementFrame(raw.provider.dispatchStatement)), 'hex')];
    });
    const entries = Array(64).fill(ZERO); entries[0] = raw.certificates[0].facts.nativeGid;
    const revokedDigest = await codec.revokedDigest(raw.readyStatement.domainCommitment, raw.registry.hubDomain, entries, '1');
    const revocationState = await codec.admissionRevocationState(raw.readyStatement.domainCommitment, {
      currentRevokedDigest: revokedDigest, currentRevokedCount: '1', currentRevocationSequence: '1' });
    negative('i84-evm-current-gid-revoked', evm, inputs => {
      inputs.current_revoked_entries = entries.map(digestBytes);
      inputs.current_revoked_digest = digestBytes(revokedDigest);
      inputs.current_revoked_count = '1'; inputs.current_revocation_sequence = '1';
      inputs.admission_revocation_state = digestWords(revocationState);
    });
    assert.equal(cases.length, 13, 'ENVELOPE_EVM_DEPOSIT_EXACT_CASE_COUNT');
    assert.equal(cases.filter(item => item.expected).length, 4, 'ENVELOPE_EVM_DEPOSIT_POSITIVE_COUNT');
    return { cases, destroy };
  } catch (error) { destroy(); throw error; }
}
