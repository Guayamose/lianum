/** Offline synthetic host checks only. The existing compiled ABI is read as
 * schema data; no source-pin override, compiler, constraints, proof or runtime
 * is invoked. Test hashFields is deliberately not Poseidon2. All signing keys
 * below are public deterministic fixture material, never deployment keys. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, createECDH, createPrivateKey, sign } from 'node:crypto';
import {readReviewedRelationABI} from '../../../fixtures/execution/reviewed-public-artifacts.mjs';
import { buildAdmissionInputs } from '../../../../src/execution/account/preparation/admission-inputs.mjs';
import { createCommitmentCodec, ZERO } from '@lianum/components/encoding/commitments';
import { readyDescriptorWords } from '../../../../src/execution/account/preparation/readiness-inputs.mjs';
import { FACTS_SCHEMA, nativeFactIdentity, nativeRuleCommitment, nativeCustodyCommitment,
  nativeObservedEffectCommitment, receiptKeyCommitment, encodeNativeFacts, nativeFactsDigest,
  nativeAdmissionNullifier } from '@lianum/engine/native/native-receipt-binding';
import { nativeAdmissionChainDomain, nativeAdmissionRuleRoot, nativeProviderIdentity,
  nativeReadyStatementDigest, nativeDeliveryRiskCommitment, nativeDispatchStatementFrame,
  NATIVE_ADMISSION_LOSS_CLAUSE } from '@lianum/engine/execution/native/dispatch/native-admission';
import { nativeTransferActionCommitment } from '@lianum/engine/execution/native/dispatch/native-capsules';
import { NATIVE_QUORUM_PROFILE, nativeQuorumRegistryCommitment }
  from '@lianum/engine/evidence/native-quorum';
import { PrivateNoteTree } from '@lianum/engine/notes/private-note-tree';

const h = label => createHash('sha256').update('SYNTHETIC-EVM-ADMISSION/' + label).digest('hex');
const field = label => '00' + h(label).slice(2);
const hashFields = async fields => field(fields.map(String).join(':'));
const codec = createCommitmentCodec({ hashFields });
const ORDER = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
const abi=readReviewedRelationABI('admission');
function syntheticSigner(index) {
  const d = Buffer.from(index.toString(16).padStart(64, '0'), 'hex');
  const curve = createECDH('secp256k1'); curve.setPrivateKey(d);
  const point = curve.getPublicKey(null, 'uncompressed'), x = point.subarray(1, 33), y = point.subarray(33);
  const key = createPrivateKey({ format: 'jwk', key: { kty: 'EC', crv: 'secp256k1',
    d: d.toString('base64url'), x: x.toString('base64url'), y: y.toString('base64url') } });
  return { publicKey: { x: x.toString('hex'), y: y.toString('hex') }, sign(frame) {
    const signature = sign('sha256', frame, { key, dsaEncoding: 'ieee-p1363' });
    const s = BigInt('0x' + signature.subarray(32).toString('hex'));
    if (s > ORDER / 2n) Buffer.from((ORDER - s).toString(16).padStart(64, '0'), 'hex').copy(signature, 32);
    return signature.toString('hex');
  } };
}
const attesters = [1, 2, 3, 4].map(syntheticSigner), provider = syntheticSigner(5);
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
async function fixture(family = '3') {
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
const build = raw => buildAdmissionInputs(raw, { hashFields, abi });

test('I84 EVM host witness uses exact family, padded hash, event position, and existing ABI', async () => {
  const raw = await fixture(), job = await build(raw), facts = raw.certificates[0].facts;
  assert.equal(job.expectedPublicInputs.length, 84);
  assert.deepEqual(Object.keys(job.inputs), abi.parameters.map(parameter => parameter.name));
  assert.equal(job.inputs.effect.family, '3');
  assert.equal(job.inputs.effect.effect_index, '0');
  assert.equal(Buffer.from(job.inputs.effect.transaction_id.map(Number)).toString('hex'), facts.transactionId);
  assert.equal(job.inputs.wire.wire_binding_position, '0');
  assert.equal(job.inputs.native_context.observed_tip_height, '105');
  assert.equal(job.statement.admissionNullifier, nativeAdmissionNullifier({ ledgerNamespace: raw.registry.hubDomain,
    secret: raw.receiptSpendSecret, nativeGid: facts.nativeGid }));
  assert.deepEqual(job.inputs.attester_indexes, ['0', '1', '2']);
  assert.ok(Object.isFrozen(job.inputs.effect.transaction_id));
});

test('I84 BTC/SOL host witnesses retain original families, identity widths, and wire positions', async () => {
  for (const family of ['1', '2']) {
    const raw = await fixture(family), job = await build(raw);
    assert.equal(job.expectedPublicInputs.length, 84);
    assert.equal(job.inputs.effect.family, family);
    assert.equal(job.inputs.wire.wire_binding_position, family === '1' ? '2' : '1');
    assert.equal(Buffer.from(job.inputs.effect.transaction_id.map(Number)).toString('hex'), raw.certificates[0].facts.transactionId);
  }
});

test('I84 EVM requires original provider plus all three ordered exact-facts signatures', async () => {
  const raw = await fixture();
  const corrupt = signature => (signature[0] === '0' ? '1' : '0') + signature.slice(1);
  const mutations = [value => { value.provider.signature = corrupt(value.provider.signature); },
    ...[0, 1, 2].map(index => value => { value.certificates[index].signature = corrupt(value.certificates[index].signature); }),
    value => { value.certificates.reverse(); }, value => { value.certificates[1].signerIndex = '0'; },
    value => { value.certificates[1] = value.certificates[0]; }, value => { value.certificates.pop(); },
    value => { value.certificates[0].verified = true; }, value => { value.provider.verified = true; },
    value => { value.certificates[0].facts.wireKeyCommitment = h('unsigned-substitution'); },
    value => { value.provider.dispatchStatement.globalEffectId = h('wrong-dispatch-GID'); }];
  for (const mutate of mutations) { const changed = structuredClone(raw); mutate(changed); await assert.rejects(build(changed)); }
  const disagreed = structuredClone(raw), otherFacts = structuredClone(raw.certificates[0].facts);
  otherFacts.nativeContext.observedTipId = h('different-canonical-tip-claim');
  disagreed.certificates[2] = signFacts(otherFacts, policyFor(raw))[2];
  await assert.rejects(build(disagreed), /INPUT_FACTS_DISAGREE/);
});

test('I84 EVM rejects signed facts that substitute Action endpoints, amount or original K', async () => {
  const raw = await fixture();
  for (const mutate of [facts => { facts.observation.sourceCommitment = h('other-source'); },
    facts => { facts.observation.destinationCommitment = h('other-router-D27-note'); },
    facts => { facts.observation.amount = '50001'; }, facts => { facts.wireKeyCommitment = h('other-K'); }]) {
    const changed = structuredClone(raw), facts = changed.certificates[0].facts;
    mutate(facts); refreshObserved(facts); changed.certificates = signFacts(facts, policyFor(changed));
    await assert.rejects(build(changed), /INPUT_FACTS_ACTION|INPUT_NATIVE_WIRE_KEY/);
  }
});

test('I84 EVM preserves historical seal/receipt joins and current exact GID revocation', async () => {
  const raw = await fixture();
  for (const mutate of [value => { value.readyStatement.joinCommitment = field('wrong-J'); },
    value => { value.receiptOpening.payoutCommitment = h('wrong-payout'); },
    value => { value.receiptOpening.receiptRho = h('wrong-rho'); },
    value => { value.receiptOpening.globalEffectId = h('wrong-GID'); },
    value => { value.checkpointOpening.root = h('wrong-checkpoint-root'); },
    value => { value.admissionUntil = '1402'; }]) {
    const changed = structuredClone(raw); mutate(changed); await assert.rejects(build(changed));
  }
  const revoked = structuredClone(raw), state = revoked.currentRevocation;
  state.entries[0] = raw.certificates[0].facts.nativeGid; state.revokedCount = '1'; state.revocationSequence = '1';
  state.revokedDigest = await codec.revokedDigest(raw.readyStatement.domainCommitment, raw.registry.hubDomain, state.entries, '1');
  await assert.rejects(build(revoked), /INPUT_CURRENT_GID_REVOKED/);
});
