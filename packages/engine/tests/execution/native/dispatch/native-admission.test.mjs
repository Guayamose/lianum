import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  NATIVE_ADMISSION_PUBLIC_INPUT_COUNT, NATIVE_ADMISSION_LOSS_CLAUSE, NATIVE_ADMISSION_TAGS,
  nativeAdmissionRuleFrame, nativeAdmissionRuleCommitment, nativeAdmissionRuleToNoir,
  nativeAdmissionChainDomainFrame, nativeAdmissionChainDomain, nativeAdmissionRulesTree, nativeAdmissionRuleRoot,
  nativeProviderIdentityFrame, nativeProviderIdentity, nativeReadyStatementFrame, nativeReadyStatementDigest,
  nativeDeliveryRiskFrame, nativeDeliveryRiskCommitment, nativeDispatchStatementFrame, nativeDispatchStatementDigest,
  nativeAttestationStatementFrame, nativeAttestationStatementDigest, nativeAdmissionObservationToNoir,
  nativeAdmissionRegistryToNoir, prepareNativeAdmission,
} from '../../../../src/execution/native/dispatch/native-admission.mjs';
import { nativeTransferActionCommitment } from '../../../../src/execution/native/dispatch/native-capsules.mjs';
import { nativeReceiptCommitment, canonicalNativeEffectId } from '../../../../src/execution/native/state/native-receipt.mjs';
import { NATIVE_QUORUM_PROFILE, nativeQuorumRegistryCommitment } from '../../../../src/evidence/native-quorum.mjs';

const PROFILE = Buffer.from('LIANUM_PAEG_NATIVE_4_V2', 'ascii');
const ZERO = '0'.repeat(64), U64 = (1n << 64n) - 1n;
const ORDER = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
const FIELD_MODULUS = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;
const hash = value => createHash('sha256').update(value).digest('hex');
const h = label => hash(Buffer.from(label));
const bytes = value => Buffer.from(value, 'hex');
const uint = (value, width) => Buffer.from(BigInt(value).toString(16).padStart(width * 2, '0'), 'hex');
const frame = (tag, fields) => Buffer.concat([Buffer.from(tag, 'ascii'), ...fields]
  .flatMap(value => [uint(value.length, 4), value]));
const words = value => Array.from({ length: 8 }, (_, i) => bytes(value).readUInt32BE(i * 4).toString());
const digestAt = (values, offset) => values.slice(offset, offset + 8).map(value => BigInt(value).toString(16).padStart(8, '0')).join('');
const clone = value => structuredClone(value);
const node = (left, right) => hash(Buffer.concat([Buffer.from([1]), bytes(left), bytes(right)]));
const rule = (family = '1') => ({ family, genesis: h(`genesis-${family}`), asset: h(`asset-${family}`),
  finalityKind: family, minimumConfirmations: family === '1' ? '6' : family === '3' ? '1' : '0',
  maximumEvidenceLifetime: '300', maximumClockSkew: '30' });
function keyPair() {
  const pair = generateKeyPairSync('ec', { namedCurve: 'secp256k1' });
  const jwk = pair.publicKey.export({ format: 'jwk' });
  // Test-only keys stay in this closure; none are serialized, returned, or saved.
  return { key: { x: Buffer.from(jwk.x, 'base64url').toString('hex'), y: Buffer.from(jwk.y, 'base64url').toString('hex') },
    sign(message) {
      const signature = sign('sha256', message, { key: pair.privateKey, dsaEncoding: 'ieee-p1363' });
      const s = BigInt('0x' + signature.subarray(32).toString('hex'));
      return signature.subarray(0, 32).toString('hex') + (s > ORDER / 2n ? ORDER - s : s).toString(16).padStart(64, '0');
    } };
}
function messages(input) {
  const readyStatement = nativeReadyStatementDigest(input.readyProof.publicInputs);
  const dispatch = { hubDomain: input.registry.hubDomain, registryCommitment: nativeQuorumRegistryCommitment(input.registry),
    readyStatement, localCommitment: input.opening.localCommitment, dispatchId: input.opening.dispatchId,
    actionCommitment: input.opening.actionCommitment, globalEffectId: input.opening.globalEffectId,
    deliveryRiskCommitment: input.action.deliveryRiskCommitment, signedAt: input.dispatchSignedAt };
  const attestation = { hubDomain: dispatch.hubDomain, registryCommitment: dispatch.registryCommitment,
    ruleCommitment: nativeAdmissionRuleCommitment(input.rule), readyStatement,
    dispatchStatement: nativeDispatchStatementDigest(dispatch), receiptCommitment: nativeReceiptCommitment(input.opening),
    globalEffectId: dispatch.globalEffectId, observation: input.observation };
  return { dispatch, attestation };
}
function fixture(family = '1') {
  const provider = keyPair(), attesters = Array.from({ length: 4 }, keyPair), registeredRule = rule(family);
  const tree = nativeAdmissionRulesTree([registeredRule]);
  const registry = { profile: NATIVE_QUORUM_PROFILE, hubDomain: h('hub'), registryEpoch: '7',
    rulesRoot: tree.root, keys: attesters.map(value => value.key) };
  const registryId = nativeQuorumRegistryCommitment(registry), chain = nativeAdmissionChainDomain(registeredRule);
  const risk = { clause: NATIVE_ADMISSION_LOSS_CLAUSE, hubDomain: registry.hubDomain, registryCommitment: registryId,
    chainDomain: chain, sourceCommitment: h('source'), destinationCommitment: h('destination'), amount: '999999999999999999999',
    scope: h('scope'), policy: h('policy'), asset: h('pool-asset'), payoutCommitment: h('payout'), settleBefore: '1500', salt: h('risk-salt') };
  const action = { chainDomain: chain, signerIdentity: nativeProviderIdentity(provider.key), sourceCommitment: risk.sourceCommitment,
    destinationCommitment: risk.destinationCommitment, amount: risk.amount, custodyKind: 1, custodyCommitment: h('custody'),
    executionFrom: '1000', executionUntil: '1400', settleBefore: risk.settleBefore,
    receiptKeyCommitment: h('receipt-key'), receiptRho: h('receipt-rho'),
    deliveryRiskCommitment: nativeDeliveryRiskCommitment(risk), actionSalt: h('action-salt') };
  const actionCommitment = nativeTransferActionCommitment(action);
  const publicInputs = [risk.scope, risk.policy, risk.asset, registry.hubDomain, registryId, h('checkpoint'), h('local'),
    h('dispatch'), chain, nativeAdmissionRuleCommitment(registeredRule), actionCommitment, risk.payoutCommitment].flatMap(words)
    .concat('1000', '1400');
  const checkpointPath = { index: '5', siblings: Array.from({ length: 6 }, (_, i) => h(`checkpoint-sibling-${i}`)) };
  let checkpointRoot = h('checkpoint');
  checkpointPath.siblings.forEach((sibling, depth) => {
    checkpointRoot = (5 >> depth) & 1 ? node(sibling, checkpointRoot) : node(checkpointRoot, sibling);
  });
  const effect = { chainDomain: { chain: ['BTC', 'SOL', 'EVM', 'TRON'][Number(family) - 1],
    genesis: registeredRule.genesis, asset: registeredRule.asset },
  effectIdentity: { transactionId: family === '2' ? h('tx') + h('signature-second-half') : h('tx'), effectIndex: '17' } };
  const opening = { hubDomain: registry.hubDomain, registryCommitment: registryId, globalEffectId: canonicalNativeEffectId(effect),
    scope: risk.scope, policy: risk.policy, localCommitment: h('local'), dispatchId: h('dispatch'), chainDomain: chain,
    evidencePolicy: nativeAdmissionRuleCommitment(registeredRule), actionCommitment, payoutCommitment: risk.payoutCommitment,
    validFrom: '1050', validUntil: '1300', receiptKeyCommitment: action.receiptKeyCommitment, receiptRho: action.receiptRho };
  const observation = { blockId: h('block'), stateCommitment: h('state'), blockHeight: '72623859790382856', observedAt: '1100',
    finalityKind: family, confirmations: registeredRule.minimumConfirmations,
    sourceCommitment: action.sourceCommitment, destinationCommitment: action.destinationCommitment, amount: action.amount,
    custodyKind: '1', custodyCommitment: action.custodyCommitment, evidenceFrom: opening.validFrom, evidenceUntil: opening.validUntil };
  const input = {
    // Deliberately synthetic, UNVERIFIED recursive fields. Signatures are real;
    // this fixture proves host conformance only, never a native/recursive fact.
    readyProof: { publicInputs, proofFields: Array(458).fill('0'), vkFields: Array(115).fill('0') },
    registry, rule: registeredRule, rulePath: tree.paths[0], checkpointPath, action, effect, opening, observation,
    providerKey: provider.key, dispatchSignedAt: '1080', dispatchSignature: '', deliveryRiskClause: risk.clause,
    deliveryRiskSalt: risk.salt, attesterIndexes: ['0', '1', '3'], attesterSignatures: [], admissionFrom: '1100', admissionUntil: '1200',
  };
  function resign(value = input, doubleHashProvider = false, doubleHashAttestation = false) {
    const { dispatch, attestation } = messages(value);
    value.dispatchSignature = provider.sign(doubleHashProvider ? bytes(nativeDispatchStatementDigest(dispatch)) : nativeDispatchStatementFrame(dispatch));
    value.attesterSignatures = value.attesterIndexes.map(index => attesters[Number(index)].sign(doubleHashAttestation
      ? bytes(nativeAttestationStatementDigest(attestation)) : nativeAttestationStatementFrame(attestation)));
    return value;
  }
  resign();
  return { input, risk, configuration: { expectedRegistryCommitment: registryId, acceptedCheckpointRoot: checkpointRoot }, resign };
}

test('rule and original chain-domain frames preserve exact I42 H4 bytes for all four families', () => {
  for (const family of ['1', '2', '3', '4']) {
    const r = rule(family), witness = nativeAdmissionRuleToNoir(r);
    const expected = frame('LIANUM/PAEG/native-rule/2', [PROFILE, uint(r.family, 1), bytes(r.genesis), bytes(r.asset),
      uint(r.finalityKind, 1), uint(r.minimumConfirmations, 4), uint(r.maximumEvidenceLifetime, 8), uint(r.maximumClockSkew, 8)]);
    assert.equal(expected.length, 170);
    assert.deepEqual(nativeAdmissionRuleFrame(r), expected);
    assert.equal(nativeAdmissionRuleCommitment(r), hash(expected));
    assert.deepEqual(witness, { family, genesis: [...bytes(r.genesis)], asset: [...bytes(r.asset)], finality_kind: family,
      minimum_confirmations: r.minimumConfirmations, maximum_evidence_lifetime: '300', maximum_clock_skew: '30' });
    const expectedChain = frame('LIANUM/evidence-chain/1', [Buffer.from(['BTC', 'SOL', 'EVM', 'TRON'][Number(family) - 1]),
      bytes(r.genesis), bytes(r.asset)]);
    assert.equal(expectedChain.length, family === '4' ? 107 : 106);
    assert.deepEqual(nativeAdmissionChainDomainFrame(r), expectedChain);
    assert.equal(nativeAdmissionChainDomain(r), hash(expectedChain));
    // Finality policy changes alter the rule, never the existing GID domain.
    const changed = { ...r, maximumEvidenceLifetime: '301' };
    assert.equal(nativeAdmissionChainDomain(changed), nativeAdmissionChainDomain(r));
    assert.notEqual(nativeAdmissionRuleCommitment(changed), nativeAdmissionRuleCommitment(r));
  }
});

test('rule registry uses eight raw commitment leaves and three ordered SHA256 node levels', () => {
  const rules = Array.from({ length: 8 }, (_, i) => ({ ...rule(String(i % 4 + 1)), genesis: h(`distinct-genesis-${i}`) }));
  for (const count of [1, 4, 8]) {
    const tree = nativeAdmissionRulesTree(rules.slice(0, count));
    let leaves = rules.slice(0, count).map(nativeAdmissionRuleCommitment).concat(Array(8 - count).fill(ZERO));
    assert.deepEqual(tree.commitments, leaves);
    while (leaves.length > 1) leaves = Array.from({ length: leaves.length / 2 }, (_, i) => node(leaves[2 * i], leaves[2 * i + 1]));
    assert.equal(tree.root, leaves[0]);
    tree.paths.forEach((path, i) => { assert.equal(path.siblings.length, 3); assert.equal(path.index, String(i));
      assert.equal(nativeAdmissionRuleRoot(rules[i], path), tree.root); });
  }
  assert.throws(() => nativeAdmissionRulesTree([]), /RULE_COUNT/);
  assert.throws(() => nativeAdmissionRulesTree([...rules, rules[0]]), /RULE_COUNT/);
});

test('provider, compact Ready, explicit loss, dispatch, and attestation bytes match the source offsets', () => {
  const f = fixture(), { input: i, risk } = f, m = messages(i), o = i.observation;
  const provider = frame('LIANUM/PAEG/provider-identity/2', [PROFILE, bytes(i.providerKey.x), bytes(i.providerKey.y)]);
  assert.equal(provider.length, 134); assert.deepEqual(nativeProviderIdentityFrame(i.providerKey), provider);
  assert.equal(nativeProviderIdentity(i.providerKey), hash(provider));
  const body = Buffer.concat(i.readyProof.publicInputs.map((word, index) => uint(word, index < 96 ? 4 : 8)));
  assert.equal(body.length, 400);
  const ready = frame('LIANUM/PAEG/ready-statement/2', [PROFILE, body]);
  assert.equal(ready.length, 464); assert.deepEqual(nativeReadyStatementFrame(i.readyProof.publicInputs), ready);
  assert.equal(nativeReadyStatementDigest(i.readyProof.publicInputs), hash(ready));
  const loss = frame('LIANUM/PAEG/delivery-loss-acceptance/2', [PROFILE, Buffer.from('FULL_OWNER_REFUND_PROVIDER_LOSS_V1'),
    ...['hubDomain', 'registryCommitment', 'chainDomain', 'sourceCommitment', 'destinationCommitment'].map(key => bytes(risk[key])),
    uint(risk.amount, 16), ...['scope', 'policy', 'asset', 'payoutCommitment'].map(key => bytes(risk[key])),
    uint(risk.settleBefore, 8), bytes(risk.salt)]);
  assert.equal(loss.length, 499); assert.deepEqual(nativeDeliveryRiskFrame(risk), loss);
  assert.equal(nativeDeliveryRiskCommitment(risk), hash(loss));
  const d = m.dispatch;
  const dispatch = frame('LIANUM/PAEG/provider-dispatch/2', [PROFILE,
    ...['hubDomain', 'registryCommitment', 'readyStatement', 'localCommitment', 'dispatchId', 'actionCommitment',
      'globalEffectId', 'deliveryRiskCommitment'].map(key => bytes(d[key])), uint(d.signedAt, 8)]);
  assert.equal(dispatch.length, 362); assert.deepEqual(nativeDispatchStatementFrame(d), dispatch);
  assert.equal(nativeDispatchStatementDigest(d), hash(dispatch));
  const a = m.attestation;
  const attestation = frame('LIANUM/PAEG/native-attestation/2', [PROFILE,
    ...['hubDomain', 'registryCommitment', 'ruleCommitment', 'readyStatement', 'dispatchStatement', 'receiptCommitment', 'globalEffectId']
      .map(key => bytes(a[key])), bytes(o.blockId), bytes(o.stateCommitment), uint(o.blockHeight, 8), uint(o.observedAt, 8),
    uint(o.finalityKind, 1), uint(o.confirmations, 4), bytes(o.sourceCommitment), bytes(o.destinationCommitment), uint(o.amount, 16),
    uint(o.custodyKind, 1), bytes(o.custodyCommitment), uint(o.evidenceFrom, 8), uint(o.evidenceUntil, 8)]);
  assert.equal(attestation.length, 581); assert.deepEqual(nativeAttestationStatementFrame(a), attestation);
  assert.equal(nativeAttestationStatementDigest(a), hash(attestation));
  const source = readFileSync(new URL('../../../../../../experiments/engine/private-core-proof/generic-native/circuits/admission/src/statement.nr', import.meta.url), 'utf8');
  for (const tag of Object.values(NATIVE_ADMISSION_TAGS)) {
    assert.ok(source.includes([...Buffer.from(tag)].join(', ')), `Noir must contain the exact ASCII tag: ${tag}`);
  }
  assert.ok(source.includes([...Buffer.from(NATIVE_ADMISSION_LOSS_CLAUSE)].join(', ')));
});

test('compact Ready and observation codecs retain full widths without field-word inflation', () => {
  const fields = Array(96).fill('4294967295').concat('72623859790382856', U64.toString());
  const result = nativeReadyStatementFrame(fields);
  assert.equal(result.length, 464);
  assert.equal(result.subarray(64, 448).toString('hex'), 'ff'.repeat(384));
  assert.equal(result.subarray(448).toString('hex'), '0102030405060708ffffffffffffffff');
  const f = fixture(), o = { ...f.input.observation, amount: ((1n << 128n) - 1n).toString(), blockHeight: U64.toString() };
  const witness = nativeAdmissionObservationToNoir(o);
  assert.equal(witness.amount, o.amount); assert.equal(witness.block_height, o.blockHeight);
  assert.deepEqual(witness.block_id, [...bytes(o.blockId)]);
});

test('composer emits exact I42 ABI and real host signatures while synthetic recursion remains unverified', () => {
  const source = readFileSync(new URL('../../../../../../experiments/engine/private-core-proof/generic-native/circuits/admission/src/main.nr', import.meta.url), 'utf8');
  const parameters = [...source.slice(source.indexOf('fn main('), source.indexOf(') {', source.indexOf('fn main(')))
    .matchAll(/^\s*(\w+): (?:pub )?/gm)].map(match => match[1]);
  for (const family of ['1', '2', '3', '4']) {
    const f = fixture(family), actual = prepareNativeAdmission(f.input, f.configuration), i = f.input;
    assert.equal(actual.assurance, 'host-bindings-and-signatures-only');
    assert.equal(actual.recursiveProofVerification, 'unverified');
    assert.equal(actual.expectedPublicInputs.length, NATIVE_ADMISSION_PUBLIC_INPUT_COUNT);
    assert.equal(NATIVE_ADMISSION_PUBLIC_INPUT_COUNT, 42);
    assert.deepEqual(Object.keys(actual.inputs), parameters);
    assert.deepEqual(actual.expectedPublicInputs, [i.registry.hubDomain, f.configuration.expectedRegistryCommitment,
      f.configuration.acceptedCheckpointRoot, canonicalNativeEffectId(i.effect), nativeReceiptCommitment(i.opening)]
      .flatMap(words).concat(i.admissionFrom, i.admissionUntil));
    assert.deepEqual(actual.inputs.ready_proof, Array(458).fill('0'));
    assert.deepEqual(actual.inputs.ready_inputs, i.readyProof.publicInputs);
    assert.deepEqual(actual.inputs.registry, nativeAdmissionRegistryToNoir(i.registry));
    assert.equal(actual.inputs.rule_index, '0'); assert.equal(actual.inputs.checkpoint_index, '5');
    assert.deepEqual(actual.inputs.attester_indexes, ['0', '1', '3']);
    assert.deepEqual(actual.inputs.attester_signatures, i.attesterSignatures.map(value => [...bytes(value)]));
    assert.equal(actual.inputs.effect.transaction_id.length, 64);
    assert.deepEqual(actual.inputs.rule, nativeAdmissionRuleToNoir(i.rule));
    assert.deepEqual(actual.inputs.observation, nativeAdmissionObservationToNoir(i.observation));
    assert.ok(!Object.hasOwn(actual.inputs, 'ready_vk'));
    i.readyProof.proofFields[0] = '1'; i.attesterIndexes[0] = '2';
    assert.equal(actual.inputs.ready_proof[0], '0'); assert.equal(actual.inputs.attester_indexes[0], '0');
  }
});

test('all ordered choices of three real registry signatures work; fake, repeated, high-S and double-hashed signatures fail', () => {
  const f = fixture();
  for (const indexes of [['0', '1', '2'], ['0', '1', '3'], ['0', '2', '3'], ['1', '2', '3']]) {
    const i = clone(f.input); i.attesterIndexes = indexes; f.resign(i);
    assert.doesNotThrow(() => prepareNativeAdmission(i, f.configuration));
  }
  for (const mutation of [i => { i.dispatchSignature = '0'.repeat(128); },
    i => { i.attesterSignatures[1] = i.attesterSignatures[0]; },
    i => { i.attesterIndexes = ['0', '0', '3']; }, i => { i.attesterIndexes = ['1', '0', '3']; },
    i => { i.attesterIndexes = ['0', '1']; }, i => { i.attesterSignatures = i.attesterSignatures.slice(0, 2); },
    i => { f.resign(i, true); }, i => { f.resign(i, false, true); }]) {
    const i = clone(f.input); mutation(i);
    assert.throws(() => prepareNativeAdmission(i, f.configuration));
  }
  for (const target of ['dispatchSignature', 'attesterSignatures']) {
    const i = clone(f.input), signature = target === 'dispatchSignature' ? i.dispatchSignature : i.attesterSignatures[0];
    const high = signature.slice(0, 64) + (ORDER - BigInt('0x' + signature.slice(64))).toString(16).padStart(64, '0');
    if (target === 'dispatchSignature') i.dispatchSignature = high; else i.attesterSignatures[0] = high;
    assert.throws(() => prepareNativeAdmission(i, f.configuration), /HIGH_S/);
  }
});

test('registered rule bounds and exact message schema reject weakened or aliased policy', () => {
  const r = rule();
  for (const change of [{ family: '0' }, { family: '5' }, { family: 1 }, { finalityKind: '3' },
    { minimumConfirmations: '5' }, { maximumEvidenceLifetime: '0' }, { maximumEvidenceLifetime: '86401' },
    { maximumClockSkew: '31' }, { genesis: ZERO }, { asset: ZERO }]) {
    assert.throws(() => nativeAdmissionRuleFrame({ ...r, ...change }), /PAEG_ADMISSION/);
  }
  assert.throws(() => nativeAdmissionRuleFrame({ ...rule('3'), minimumConfirmations: '0' }), /CONFIRMATIONS/);
  for (const family of ['2', '4']) assert.throws(() => nativeAdmissionRuleFrame({ ...rule(family), minimumConfirmations: '1' }), /CONFIRMATIONS/);
  const f = fixture();
  for (const clause of ['INSURED_PROVIDER_RECOVERY_V1', '', NATIVE_ADMISSION_LOSS_CLAUSE + '\n']) {
    assert.throws(() => nativeDeliveryRiskFrame({ ...f.risk, clause }), /LOSS_CLAUSE/);
  }
  assert.throws(() => nativeDeliveryRiskFrame({ ...f.risk, insured: true }), /LOSS_FIELDS/);
  assert.throws(() => nativeDispatchStatementFrame({ ...messages(f.input).dispatch, verified: true }), /DISPATCH_FIELDS/);
  assert.throws(() => nativeAttestationStatementFrame({ ...messages(f.input).attestation, threshold: 1 }), /ATTESTATION_FIELDS/);
});

test('host binding failures survive even fresh honest signatures on changed observation or receipt', () => {
  const f = fixture();
  const cases = [
    ['OBSERVER_AMOUNT', i => { i.observation.amount = '1'; }],
    ['OBSERVER_RECIPIENT', i => { i.observation.destinationCommitment = h('wrong-recipient'); }],
    ['OBSERVER_SOURCE', i => { i.observation.sourceCommitment = h('wrong-source'); }],
    ['CUSTODY', i => { i.observation.custodyKind = '2'; }],
    ['CUSTODY_COMMITMENT', i => { i.observation.custodyCommitment = h('wrong-custody'); }],
    ['FINALITY', i => { i.observation.finalityKind = '2'; }],
    ['CONFIRMATIONS', i => { i.observation.confirmations = '5'; }],
    ['RECEIPT_SALT', i => { i.opening.receiptRho = h('re-salted-receipt'); }],
    ['RECEIPT_KEY', i => { i.opening.receiptKeyCommitment = h('re-keyed-receipt'); }],
    ['RECEIPT_DISPATCH', i => { i.opening.dispatchId = h('other-dispatch'); }],
    ['RECEIPT_WINDOW', i => { i.opening.validUntil = '1299'; }],
    ['RECEIPT_GID', i => { i.opening.globalEffectId = h('other-gid'); }],
    ['READY_HUB', i => { i.readyProof.publicInputs.splice(24, 8, ...words(h('other-hub'))); }],
    ['READY_RULE', i => { i.readyProof.publicInputs.splice(72, 8, ...words(h('other-rule'))); }],
    ['READY_CHAIN', i => { i.readyProof.publicInputs.splice(64, 8, ...words(h('other-chain'))); }],
    ['EFFECT_GENESIS', i => { i.effect.chainDomain.genesis = h('other-genesis'); }],
    ['EFFECT_ASSET', i => { i.effect.chainDomain.asset = h('other-asset'); }],
    ['EFFECT_POSITION', i => { i.effect.effectIdentity.effectIndex = '18'; }],
  ];
  for (const [label, change] of cases) {
    const i = clone(f.input); change(i); f.resign(i);
    assert.throws(() => prepareNativeAdmission(i, f.configuration), undefined, label);
  }
});

test('trust configuration, paths, risk salt, and provider identity cannot be swapped', () => {
  const f = fixture();
  for (const key of ['expectedRegistryCommitment', 'acceptedCheckpointRoot']) {
    assert.throws(() => prepareNativeAdmission(f.input, { ...f.configuration, [key]: h('other-root') }));
  }
  for (const change of [i => { i.rulePath.index = '1'; }, i => { i.rulePath.siblings[0] = h('other-sibling'); },
    i => { i.checkpointPath.index = '6'; }, i => { i.checkpointPath.siblings[5] = h('other-checkpoint-sibling'); },
    i => { i.deliveryRiskSalt = h('other-risk-salt'); }, i => { i.deliveryRiskSalt = ZERO; },
    i => { i.deliveryRiskClause = 'PROVIDER_RECOVERY'; }, i => { i.providerKey = keyPair().key; },
    i => { i.registry.keys[3] = clone(i.registry.keys[0]); }]) {
    const i = clone(f.input); change(i);
    assert.throws(() => prepareNativeAdmission(i, f.configuration));
  }
  assert.throws(() => prepareNativeAdmission(f.input), /CONFIGURATION_FIELDS/);
});

test('bounded evidence, dispatch, admission windows and subtraction-based clock skew match I42', () => {
  const f = fixture();
  for (const [label, change] of [
    ['empty admission', i => { i.admissionUntil = i.admissionFrom; }],
    ['early admission', i => { i.admissionFrom = '1049'; }],
    ['late admission', i => { i.admissionUntil = '1301'; }],
    ['future observation skew', i => { i.admissionFrom = '1069'; }],
    ['dispatch skew', i => { i.dispatchSignedAt = '1131'; }],
    ['early dispatch', i => { i.dispatchSignedAt = '999'; }],
    ['late dispatch', i => { i.dispatchSignedAt = '1400'; }],
    ['Ready start', i => { i.readyProof.publicInputs[96] = '1081'; }],
    ['Ready end', i => { i.readyProof.publicInputs[97] = '1080'; }],
    ['observation before evidence', i => { i.observation.observedAt = '1049'; }],
    ['observation at evidence end', i => { i.observation.observedAt = '1300'; }],
    ['evidence lifetime', i => { i.observation.evidenceFrom = '999'; }],
    ['evidence cutoff', i => { i.observation.evidenceFrom = '1300'; i.observation.observedAt = '1350'; i.observation.evidenceUntil = '1501'; }],
  ]) {
    const i = clone(f.input); change(i); f.resign(i);
    assert.throws(() => prepareNativeAdmission(i, f.configuration), undefined, label);
  }
  const boundary = clone(f.input); boundary.admissionFrom = '1070'; boundary.dispatchSignedAt = '1130'; f.resign(boundary);
  assert.doesNotThrow(() => prepareNativeAdmission(boundary, f.configuration));
});

test('strict decimals, bare hex, hidden fields, accessors, sparse arrays and fake acceptance flags fail closed', () => {
  const f = fixture();
  for (const value of ['01', '-1', '1.0', '1e2', '0x1', '1\n', '1\r', '1\r\n', 1, 1n, U64.toString() + '0']) {
    assert.throws(() => nativeAdmissionRuleToNoir({ ...f.input.rule, maximumClockSkew: value }), /PAEG_ADMISSION/);
    const i = clone(f.input); i.admissionFrom = value;
    assert.throws(() => prepareNativeAdmission(i, f.configuration), /PAEG_ADMISSION/);
  }
  for (const value of [h('x').toUpperCase(), '0x' + h('x'), h('x') + '\n', Buffer.from(h('x'), 'hex')]) {
    assert.throws(() => nativeAdmissionRuleFrame({ ...f.input.rule, genesis: value }), /HEX/);
  }
  for (const field of ['proofFields', 'vkFields', 'publicInputs']) {
    for (const value of ['1\n', '0x1', '01', 1, FIELD_MODULUS.toString()]) {
      const i = clone(f.input); i.readyProof[field][0] = value;
      assert.throws(() => prepareNativeAdmission(i, f.configuration), /PAEG_ADMISSION/);
    }
    const sparse = clone(f.input); delete sparse.readyProof[field][0];
    assert.throws(() => prepareNativeAdmission(sparse, f.configuration), /ARRAY/);
  }
  for (const field of ['proofFields', 'vkFields', 'publicInputs']) {
    const i = clone(f.input); i.readyProof[field].push('0');
    assert.throws(() => prepareNativeAdmission(i, f.configuration), /ARRAY/);
  }
  for (const [offset, value] of [[0, '4294967296'], [96, (U64 + 1n).toString()]]) {
    const fields = [...f.input.readyProof.publicInputs]; fields[offset] = value;
    assert.throws(() => nativeReadyStatementFrame(fields), /RANGE/);
  }
  for (const change of [i => { i.attesterIndexes[0] = 0; }, i => { i.rulePath.index = '8'; },
    i => { i.checkpointPath.index = '64'; }, i => { i.registry.registryEpoch = '7\n'; },
    i => { i.action.amount += '\n'; }, i => { i.effect.effectIdentity.effectIndex += '\n'; }]) {
    const i = clone(f.input); change(i);
    assert.throws(() => prepareNativeAdmission(i, f.configuration));
  }
  assert.throws(() => prepareNativeAdmission({ ...f.input, verified: true }, f.configuration), /INPUT_FIELDS/);
  assert.throws(() => prepareNativeAdmission(f.input, { ...f.configuration, nativeConsensus: true }), /CONFIGURATION_FIELDS/);
  const extra = clone(f.input); Object.defineProperty(extra.action, 'privateKey', { value: 'never-read' });
  assert.throws(() => prepareNativeAdmission(extra, f.configuration), /ACTION_FIELDS/);
  const symbol = clone(f.input.rule); symbol[Symbol('private')] = true;
  assert.throws(() => nativeAdmissionRuleToNoir(symbol), /RULE_FIELDS/);
  const getter = clone(f.input.rule);
  Object.defineProperty(getter, 'family', { get() { throw new Error('must not run accessor'); } });
  assert.throws(() => nativeAdmissionRuleToNoir(getter), /RULE_FIELDS/);
  const inherited = Object.create(f.input.rule);
  assert.throws(() => nativeAdmissionRuleToNoir(inherited), /RULE_FIELDS/);
});

test('changing any loss term changes the commitment; dispatch binds the exact delivery-risk commitment', () => {
  const f = fixture(), original = nativeDeliveryRiskCommitment(f.risk);
  for (const key of Object.keys(f.risk).filter(key => key !== 'clause')) {
    const terms = { ...f.risk, [key]: key === 'amount' || key === 'settleBefore' ? String(BigInt(f.risk[key]) + 1n) : h(`changed-${key}`) };
    assert.notEqual(nativeDeliveryRiskCommitment(terms), original, key);
  }
  const dispatch = messages(f.input).dispatch;
  assert.notEqual(nativeDispatchStatementDigest({ ...dispatch, deliveryRiskCommitment: h('changed-risk') }), nativeDispatchStatementDigest(dispatch));
  assert.equal(digestAt(f.input.readyProof.publicInputs, 80), nativeTransferActionCommitment(f.input.action));
});
