/** Wrapped-registry CI/CO certificate collection. Exact signed 829-byte original
 * facts retain the OUTER registry commitment; the inner registry is used only
 * to verify signatures after custody and source memberships are authenticated.
 * This is host conformance, never an owned observer or backing/signing authority. */
import assert from 'node:assert/strict';
import { exactRecord, fixedArray, bytes32 } from '../../execution/encoding/commitments.mjs';
import { cloneInput, frozenInput, inputUint } from '../../execution/account/preparation/readiness-inputs.mjs';
import { FACTS_SCHEMA, validateNativeClaimFacts, encodeNativeClaimFacts, nativeClaimFactsDigest } from '../../chains/shared/dispatch/native-receipt-binding.mjs';
import { createNativeQuorumHostVerifier, nativeQuorumRegistryCommitment } from '../../../../engine/src/evidence/native-quorum.mjs';
import { assertCustodyRegistration, assertCustodySources } from './registry-envelope-v2.mjs';

export function createWrappedClaimFactsCollector(input) {
  exactRecord(input, ['config', 'registry', 'rule', 'custodyProfile', 'profilePath', 'sources', 'clock']);
  const { clock, ...publicInput } = input, data = frozenInput(cloneInput(publicInput));
  exactRecord(clock, ['read', 'assertCurrent']);
  assert.equal(typeof clock.read, 'function'); assert.equal(typeof clock.assertCurrent, 'function');
  const read = clock.read.bind(clock), assertCurrent = clock.assertCurrent.bind(clock);
  assertCustodyRegistration({ config: data.config, registry: data.registry, rule: data.rule,
    custodyProfile: data.custodyProfile, profilePath: data.profilePath });
  assertCustodySources(data.custodyProfile, data.sources, ['0', '1', '2', '3']);
  const policy = frozenInput({ ledgerNamespace: data.config.ledgerNamespace, hubDomain: data.config.hubDomain,
    registryCommitment: data.config.registryCommitment, rule: data.rule });
  const verifier = createNativeQuorumHostVerifier({ registry: data.registry.quorum,
    expectedRegistryCommitment: nativeQuorumRegistryCommitment(data.registry.quorum) });
  return Object.freeze({ async collect(raw) {
    const request = cloneInput(raw); exactRecord(request, ['certificates']); fixedArray(request.certificates, 3);
    // Snapshot the entire request before the first asynchronous current-head read.
    const head = frozenInput(cloneInput(await read())); exactRecord(head, ['timestamp', 'head']);
    const now = inputUint(head.timestamp); bytes32(head.head, true);
    let first = null; const indexes = [], signatures = [];
    for (const certificate of request.certificates) {
      exactRecord(certificate, ['schema', 'signerIndex', 'facts', 'frameHex', 'digest', 'signature']);
      assert.equal(certificate.schema, FACTS_SCHEMA, 'WRAPPED_CLAIM_FACT_SCHEMA');
      const facts = validateNativeClaimFacts(certificate.facts, policy), bytes = encodeNativeClaimFacts(facts, policy);
      assert.equal(bytes.length, 829, 'WRAPPED_CLAIM_ORIGINAL_FACT_FRAME');
      assert.equal(certificate.frameHex, bytes.toString('hex'), 'WRAPPED_CLAIM_FACT_FRAME');
      assert.equal(certificate.digest, nativeClaimFactsDigest(facts, policy), 'WRAPPED_CLAIM_FACT_DIGEST');
      assert.ok(inputUint(facts.observation.evidenceFrom) <= now && now < inputUint(facts.observation.evidenceUntil),
        'WRAPPED_CLAIM_FACT_EXPIRED');
      if (first) assert.ok(first.bytes.equals(bytes), 'WRAPPED_CLAIM_FACTS_DISAGREE'); else first = { facts, bytes };
      indexes.push(Number(inputUint(certificate.signerIndex, 8, 3n))); signatures.push(certificate.signature);
    }
    assertCustodySources(data.custodyProfile, indexes.map(index => data.sources[index]), indexes.map(String));
    verifier.assertQuorumForMessage({ messageBytes: first.bytes, indexes, signatures });
    assert.equal(await assertCurrent(head), undefined, 'WRAPPED_CLAIM_CURRENT_HEAD_ASSERTION');
    return frozenInput({ schema: FACTS_SCHEMA, facts: first.facts, frameHex: first.bytes.toString('hex'),
      digest: request.certificates[0].digest, indexes: indexes.map(String), signatures,
      assurance: 'HOST_CERTIFICATE_CONFORMANCE_NOT_NATIVE_BACKING_OR_PROOF_ACCEPTANCE' });
  } });
}
