/** Host/source tests only. SHA-based hashFields below is intentionally NOT
 * Poseidon2. No Noir, WASM, proof or native backend is started. The fixture can
 * later receive official Poseidon2 plus actual candidate ABI for ACVM tests. */
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { CATALOG } from '@lianum/proofs/catalog';
import { validateJobAgainstABI } from '@lianum/proofs/jobs/trusted-jobs';
import { buildSyntheticGenericIngressV3Fixture } from '../fixtures/synthetic-ingress-v3.mjs';
import { buildClaimIngressInputs } from '@lianum/engine/claims/inputs';
import { claimDomainCommitment, claimReceiptSecret, claimRefundSalt, claimDestinationCommitment,
  claimIngressReceiptCommitment, claimVerifierSetCommitment, encodeClaimIngressInputs,
  encodeClaimDischargeInputs } from '@lianum/engine/claims/framing';
import { encodeNativeClaimFacts, validateNativeClaimFacts, nativeClaimFactsDigest,
  receiptKeyCommitment, nativeAdmissionNullifier, nativeFactIdentity }
  from '@lianum/engine/native/native-receipt-binding';
import { createNativeQuorumHostVerifier }
  from '@lianum/engine/evidence/native-quorum';

const h = label => createHash('sha256').update(label).digest('hex');
const hashFields = async fields => '00' + h('TEST-ONLY-NOT-POSEIDON/' + fields.map(String).join(':')).slice(2);
const abis = { native_claim_ingress_v3: { parameters: CATALOG.native_claim_ingress.publicABI },
  native_claim_discharge: { parameters: CATALOG.native_claim_discharge.publicABI } };
const fixture = await buildSyntheticGenericIngressV3Fixture({ hashFields, abis });
after(() => fixture.destroy());
const raw = fixture.nonceIngress.raw, entry = fixture.nonceIngress.entry, facts = raw.certificates[0].facts;
const policy = { ledgerNamespace: raw.config.ledgerNamespace, hubDomain: raw.config.hubDomain,
  registryCommitment: raw.config.registryCommitment, rule: raw.rule };
const ZERO = '00'.repeat(32);
const asHex = bytes => Buffer.from(bytes).toString('hex');

// Execute ONLY the exact two endpoint assertions extracted from the checked
// Noir sources. This is a source-level regression, not ACVM constraint execution.
const candidateEvidence = readFileSync(new URL('../lib/src/evidence.nr', import.meta.url), 'utf8');
const baselineEvidence = readFileSync(new URL('../../../proof-relations/native-claim-lib/src/evidence.nr', import.meta.url), 'utf8');
const factsSource = readFileSync(new URL('../../../proof-relations/native-claim-lib/src/facts.nr', import.meta.url), 'utf8');
const sourceDirection = (source, observed, escrow) => {
  assert.ok(observed.sourceCommitment !== ZERO && observed.destinationCommitment !== ZERO);
  assert.match(factsSource, /assert\(observed\.source_commitment != observed\.destination_commitment\)/);
  assert.notEqual(observed.sourceCommitment, observed.destinationCommitment);
  const field = source.match(/assert\(evidence\.observation\.(source|destination)_commitment == config\.escrow_endpoint_commitment\)/)?.[1];
  assert.ok(field, 'exact source endpoint assertion must exist');
  assert.equal(observed[field + 'Commitment'], escrow);
};

test('40 ABI-shaped future constraint cases contain 7 positives and 33 negatives, not execution claims', () => {
  assert.equal(fixture.cases.length, 40);
  assert.equal(fixture.cases.filter(row => row.expected).length, 7);
  assert.equal(new Set(fixture.cases.map(row => row.name)).size, 40);
  for (const row of fixture.cases) {
    const ingress = row.relation === 'native_claim_ingress_v3';
    assert.equal(row.publicInputs.length, ingress ? 51 : 42);
    const publicInputs = abis[row.relation].parameters.flatMap(parameter => [row.inputs[parameter.name]].flat(Infinity).map(String));
    assert.deepEqual(publicInputs, row.publicInputs, row.name);
    for (const parameter of abis[row.relation].parameters) {
      const width = parameter.type.kind === 'array' ? parameter.type.type.width : parameter.type.width;
      for (const value of [row.inputs[parameter.name]].flat(Infinity))
        assert.ok(BigInt(value) >= 0n && BigInt(value) < (1n << BigInt(width)), row.name + ': unsigned public ABI');
    }
    if (row.expected) assert.deepEqual(row.publicInputs,
      [...(ingress ? encodeClaimIngressInputs : encodeClaimDischargeInputs)(row.statement)]);
  }
});

test('all 40 complete witness shapes match read-only baseline ABI metadata; no artifact is executed', () => {
  const baseline = {
    native_claim_ingress: ['c13d5cc0e1be06158727cf933013492fe44efe987d09e4dee9bb9216c04fb418',
      'f28e7684-db9a-4165-948b-5f8961afbb8f', 'c418794daae0160e0f5acfe1dc5f3a1f65bb6a8312c2118a9b4e05a39cc44edf'],
    native_claim_discharge: ['7ddd3be0eaddf7bc08840d6fa0660ee6e6596108e35c9c1ac83ca4f76f468ea5',
      '61d900c0-e5a2-4757-a274-c59fd0d0c645', '5ec7d600e2f1a76d72720f2b3a35b44c4e777e7dee30f46d0be2b98a3eca39e3'],
  };
  const metadata = Object.fromEntries(Object.entries(baseline).map(([relation, [version, artifact, sha256]]) => {
    const bytes = readFileSync(new URL(`../../../.local/proof-workers/relations/${relation}/${version}/compiled/${artifact}/program.json`, import.meta.url));
    assert.equal(h(bytes), sha256);
    const abi = JSON.parse(bytes).abi;
    assert.deepEqual(abi.parameters.filter(parameter => parameter.visibility === 'public'), CATALOG[relation].publicABI);
    return [relation, abi];
  }));
  for (const row of fixture.cases) {
    // The baseline name selects an identical ABI validator only. It does not
    // register V3, execute baseline bytecode or assert that an old key accepts V3.
    const abiRole = row.relation === 'native_claim_ingress_v3' ? 'native_claim_ingress' : row.relation;
    validateJobAgainstABI(metadata[abiRole], row.inputs, row.publicInputs, abiRole);
  }
});

test('positive SOL v2 ingress is complete, distinct-source, fixed-tuple and genuinely quorum signed', () => {
  assert.equal(entry.expected, true);
  validateNativeClaimFacts(facts, policy);
  assert.deepEqual([facts.family, facts.wireBindingVersion, facts.wireBindingKind,
    facts.effectIndex, facts.wireBindingPosition], ['2', '2', '2', '1', '2']);
  assert.equal(facts.observation.destinationCommitment, raw.config.escrowEndpointCommitment);
  assert.notEqual(facts.observation.sourceCommitment, raw.config.escrowEndpointCommitment);
  const frame = encodeNativeClaimFacts(facts, policy);
  assert.equal(frame.length, 829);
  assert.equal(h(frame), nativeClaimFactsDigest(facts, policy));
  createNativeQuorumHostVerifier({ registry: raw.registry, expectedRegistryCommitment: raw.config.registryCommitment })
    .assertQuorumForMessage({ messageBytes: frame, indexes: [0, 1, 2], signatures: raw.certificates.map(c => c.signature) });
});

test('extracted new ingress direction passes deposit and rejects escrow source, wrong target and equal endpoints', () => {
  sourceDirection(candidateEvidence, facts.observation, raw.config.escrowEndpointCommitment);
  assert.throws(() => sourceDirection(baselineEvidence, facts.observation, raw.config.escrowEndpointCommitment));
  for (const patch of [
    { sourceCommitment: raw.config.escrowEndpointCommitment },
    { destinationCommitment: h('wrong-target') },
    { destinationCommitment: facts.observation.sourceCommitment },
    { sourceCommitment: ZERO }, { destinationCommitment: ZERO },
  ]) assert.throws(() => sourceDirection(candidateEvidence, { ...facts.observation, ...patch }, raw.config.escrowEndpointCommitment));
  const payout = { ...facts.observation, sourceCommitment: raw.config.escrowEndpointCommitment,
    destinationCommitment: facts.observation.sourceCommitment };
  sourceDirection(baselineEvidence, payout, raw.config.escrowEndpointCommitment);
  assert.throws(() => sourceDirection(candidateEvidence, payout, raw.config.escrowEndpointCommitment));
});

test('strict unchanged facts reject malformed nonce tuple, non-SOL family, zero key and wrong identity', () => {
  for (const patch of [
    { effectIndex: '0' }, { effectIndex: '2' }, { wireBindingVersion: '0' }, { wireBindingVersion: '3' },
    { wireBindingKind: '1' }, { wireBindingPosition: '1' }, { family: '1' }, { family: '3' },
    { wireKeyCommitment: ZERO }, { transactionSHA256: ZERO }, { nativeGid: h('old-gid') },
  ]) assert.throws(() => validateNativeClaimFacts({ ...facts, ...patch }, policy));
  assert.notEqual(nativeFactIdentity(Object.fromEntries(['family', 'genesis', 'asset', 'transactionId', 'effectIndex']
    .map(name => [name, name === 'effectIndex' ? '0' : facts[name]]))), facts.nativeGid);
});

test('legacy BTC/SOL v1 and escrow-source CO42 v1/v2 positives remain in candidate fixture', () => {
  for (const name of ['ci51-btc-genuine-quorum', 'ci51-sol-genuine-quorum',
    'co42-btc-genuine-redeem', 'co42-sol-genuine-refund',
    'co42-sol-v2-genuine-redeem', 'co42-sol-v2-genuine-refund']) {
    const row = fixture.cases.find(row => row.name === name);
    assert.equal(row?.expected, true, name);
    if (row.relation === 'native_claim_discharge')
      assert.deepEqual(row.inputs.evidence.observation.source_commitment, row.inputs.config.escrow_endpoint_commitment);
  }
  const legacyBTC = fixture.fixtures.btc.ingressRaw;
  assert.equal(legacyBTC.certificates[0].facts.transactionId.slice(64), ZERO);
});

test('candidate verifier-set role identity changes domain, K, N, refund and receipt, never native GID', async () => {
  const role = (index, label) => ({ role: String(index), address: h(label + 'address').slice(0, 40),
    codeHash: h(label + 'code'), width: index ? '42' : '51', sourceCommitment: h(label + 'source'),
    keyCommitment: h(label + 'key') });
  // Synthetic role records test the codec only; these are never usable artifacts.
  const oldRoles = [role(0, 'synthetic-old-ingress'), role(1, 'synthetic-unchanged-discharge')];
  const newRoles = [role(0, 'synthetic-new-ingress-v3'), oldRoles[1]];
  const derive = roles => {
    const config = { ...raw.config, claimVerifierSetCommitment: claimVerifierSetCommitment(roles) };
    const claimDomain = claimDomainCommitment(config), outputQ = entry.statement.outputQ;
    const opening = { claimDomain, outputQ, noteSecret: raw.noteOpening.noteSecret };
    const secret = claimReceiptSecret(opening);
    const key = receiptKeyCommitment({ ledgerNamespace: config.ledgerNamespace, secret });
    const admissionN = nativeAdmissionNullifier({ ledgerNamespace: config.ledgerNamespace, secret, nativeGid: facts.nativeGid });
    const refundDestination = claimDestinationCommitment({ claimDomain, nativeChainDomain: h('same-native-domain'),
      endpoint: facts.observation.sourceCommitment, amount: entry.statement.amountQ, maxFee: config.refundMaxFee,
      salt: claimRefundSalt(opening) });
    const receipt = claimIngressReceiptCommitment({ claimDomain, outputQ, amount: entry.statement.amountQ,
      admissionN, refundDestination });
    return { claimDomain, secret, key, admissionN, refundDestination, receipt };
  };
  const before = derive(oldRoles), after = derive(newRoles);
  for (const name of Object.keys(before)) assert.notEqual(before[name], after[name], name);
  const changed = structuredClone(raw);
  changed.config.claimVerifierSetCommitment = claimVerifierSetCommitment(newRoles);
  await assert.rejects(buildClaimIngressInputs(changed, { hashFields }), /CLAIM_INGRESS_WIRE_KEY/);
});

test('repeat host preparation preserves public identity and queues replay-join constraint negatives', async () => {
  const repeat = await buildClaimIngressInputs(structuredClone(raw), { hashFields });
  assert.deepEqual(repeat.publicInputs, entry.publicInputs);
  for (const name of ['ci51-v3-old-nullifier-public-input', 'ci51-v3-wrong-refund-source-join',
    'ci51-v3-wrong-receipt-leaf-join', 'ci51-v3-wrong-verifier-set-domain-join',
    'ci51-v3-current-index-one-gid-revoked', 'ci51-v3-reused-v1-facts-signatures'])
    assert.equal(fixture.cases.find(row => row.name === name)?.expected, false, name);
});

test('signed endpoint negative frames retain a valid quorum instead of relying on stale signatures', () => {
  const fields = { state_commitment: 519, source_commitment: 592, destination_commitment: 628, custody_commitment: 689 };
  for (const label of ['wrong-destination', 'source-equals-escrow', 'wrong-wire-key']) {
    const row = fixture.cases.find(row => row.name === 'ci51-v3-sol-v2-signed-' + label);
    const frame = Buffer.from(raw.certificates[0].frameHex, 'hex');
    for (const [field, at] of Object.entries(fields)) Buffer.from(row.inputs.evidence.observation[field]).copy(frame, at);
    Buffer.from(row.inputs.evidence.wire.wire_key_commitment).copy(frame, 447);
    createNativeQuorumHostVerifier({ registry: raw.registry, expectedRegistryCommitment: raw.config.registryCommitment })
      .assertQuorumForMessage({ messageBytes: frame, indexes: [0, 1, 2],
        signatures: row.inputs.evidence.attester_signatures.map(asHex) });
  }
});
