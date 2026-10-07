/** Fixed synthetic CI51/CO42 constraint fixtures. The caller injects official
 * Poseidon2; every dependent claim domain, key and facts signature is rebuilt
 * from it. Native observations, chain identities and deployment identities are
 * explicitly synthetic. No native node, proof, custody key or witness file is
 * loaded or written. Signing scalars are public deterministic fixture material.
 */
import assert from 'node:assert/strict';
import { createHash, createECDH, createPrivateKey, sign } from 'node:crypto';
import { buildClaimIngressInputs, buildClaimDischargeInputs }
  from '../../../../../packages/backend/src/claims/protocol/inputs.mjs';
import { CLAIM_CONFIG_SCHEMA, CLAIM_INGRESS_PUBLIC_WORDS, CLAIM_DISCHARGE_PUBLIC_WORDS,
  claimDomainCommitment, claimReceiptSecret, claimDestinationCommitment,
  claimTicketId, claimTicketSecret, nativeClaimEndpointCommitment }
  from '../../../../../packages/backend/src/claims/protocol/framing.mjs';
import { createCommitmentCodec, digestBytes, digestWords, ZERO }
  from '../../../../../packages/backend/src/execution/encoding/commitments.mjs';
import { balanceCommitment } from '../../../../../packages/engine/src/wallet/notes/private-wallet-note-encoding.mjs';
import { nativeAdmissionRuleRoot, nativeAdmissionChainDomain }
  from '../../../../../packages/engine/src/execution/native/dispatch/native-admission.mjs';
import { NATIVE_QUORUM_PROFILE, nativeQuorumRegistryCommitment, createNativeQuorumHostVerifier }
  from '../../../../../packages/engine/src/evidence/native-quorum.mjs';
import { FACTS_SCHEMA, nativeFactIdentity, nativeRuleCommitment, nativeCustodyCommitment,
  nativeObservedEffectCommitment, receiptKeyCommitment, nativeAdmissionNullifier,
  encodeNativeClaimFacts, nativeClaimFactsDigest }
  from '../../../../../packages/backend/src/chains/shared/dispatch/native-receipt-binding.mjs';

const h = label => createHash('sha256').update('SYNTHETIC-NATIVE-CLAIMS/' + label).digest('hex');
const ORDER = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
// Data offsets in the unchanged 829-byte H4 facts frame. These fixture-only
// patches produce signed invalid statements without weakening a host codec.
const INVALID_FACT_FIELDS = Object.freeze({
  effectIndex: { offset: 349, width: 4, section: null },
  nativeGid: { offset: 357, width: 32, section: null },
  wireBindingVersion: { offset: 429, width: 1, section: null },
  wireBindingKind: { offset: 434, width: 1, section: null },
  wireBindingPosition: { offset: 439, width: 4, section: null },
  stateCommitment: { offset: 519, width: 32, section: 'observation' },
  observedTipId: { offset: 749, width: 32, section: 'nativeContext' },
});
function frameFieldBytes(value, width) {
  if (width === 32) return Buffer.from(digestBytes(value));
  assert.match(value, /^(0|[1-9][0-9]*)$/);
  const number = BigInt(value);
  assert.ok(number < (1n << BigInt(width * 8)));
  return Buffer.from(number.toString(16).padStart(width * 2, '0'), 'hex');
}

function syntheticSigner(index) {
  const d = Buffer.from(index.toString(16).padStart(64, '0'), 'hex');
  const curve = createECDH('secp256k1');
  curve.setPrivateKey(d);
  const point = curve.getPublicKey(null, 'uncompressed');
  const x = point.subarray(1, 33), y = point.subarray(33);
  let key = createPrivateKey({ format: 'jwk', key: { kty: 'EC', crv: 'secp256k1',
    d: d.toString('base64url'), x: x.toString('base64url'), y: y.toString('base64url') } });
  d.fill(0);
  return {
    publicKey: { x: x.toString('hex'), y: y.toString('hex') },
    sign(frame) {
      assert.ok(key, 'ENVELOPE_SYNTHETIC_SIGNER_DESTROYED');
      const signature = sign('sha256', frame, { key, dsaEncoding: 'ieee-p1363' });
      const s = BigInt('0x' + signature.subarray(32).toString('hex'));
      if (s > ORDER / 2n)
        Buffer.from((ORDER - s).toString(16).padStart(64, '0'), 'hex').copy(signature, 32);
      return signature.toString('hex');
    },
    destroy() { key = null; },
  };
}

function refreshIdentity(facts) {
  facts.nativeGid = nativeFactIdentity(Object.fromEntries(
    ['family', 'genesis', 'asset', 'transactionId', 'effectIndex'].map(name => [name, facts[name]])));
}

function refreshObserved(facts) {
  const endpoints = { family: facts.family, genesis: facts.genesis, asset: facts.asset,
    sourceCommitment: facts.observation.sourceCommitment,
    destinationCommitment: facts.observation.destinationCommitment };
  facts.observation.custodyCommitment = nativeCustodyCommitment(endpoints);
  facts.observation.stateCommitment = nativeObservedEffectCommitment({ ...endpoints,
    nativeGid: facts.nativeGid, blockId: facts.observation.blockId,
    blockHeight: facts.observation.blockHeight, transactionSHA256: facts.transactionSHA256,
    amount: facts.observation.amount });
}

export async function buildSyntheticNativeClaimFixture({ hashFields, abis }) {
  const attesters = [1, 2, 3, 4].map(syntheticSigner), owner = syntheticSigner(5);
  const codec = createCommitmentCodec({ hashFields });
  const cases = [];
  const destroy = () => { for (const signer of [...attesters, owner]) signer.destroy(); };

  function signFacts(raw, facts) {
    const policy = { ledgerNamespace: raw.config.ledgerNamespace, hubDomain: raw.config.hubDomain,
      registryCommitment: raw.config.registryCommitment, rule: raw.rule };
    const frame = encodeNativeClaimFacts(facts, policy);
    assert.equal(frame.length, 829, 'ENVELOPE_NATIVE_CLAIM_FACTS_WIDTH');
    return attesters.slice(0, 3).map((attester, index) => ({
      schema: FACTS_SCHEMA, signerIndex: String(index), facts: structuredClone(facts),
      frameHex: frame.toString('hex'), digest: nativeClaimFactsDigest(facts, policy),
      signature: attester.sign(frame),
    }));
  }

  function signedInvalidFrame(raw, replacements) {
    const original = raw.certificates[0], facts = original.facts;
    const frame = Buffer.from(original.frameHex, 'hex');
    const policy = { ledgerNamespace: raw.config.ledgerNamespace, hubDomain: raw.config.hubDomain,
      registryCommitment: raw.config.registryCommitment, rule: raw.rule };
    assert.deepEqual(frame, encodeNativeClaimFacts(facts, policy));
    assert.equal(frame.length, 829, 'ENVELOPE_NATIVE_CLAIM_INVALID_FRAME_WIDTH');
    for (const [name, value] of Object.entries(replacements)) {
      assert.ok(Object.hasOwn(INVALID_FACT_FIELDS, name));
      const { offset, width, section } = INVALID_FACT_FIELDS[name];
      const before = (section ? facts[section] : facts)[name];
      assert.equal(frame.readUInt32BE(offset - 4), width);
      assert.deepEqual(frame.subarray(offset, offset + width), frameFieldBytes(before, width));
      frameFieldBytes(value, width).copy(frame, offset);
    }
    const signatures = attesters.slice(0, 3).map(attester => attester.sign(frame));
    // Independently verify all three signatures over the patched raw frame.
    // Production claim validation remains strict and rejects these facts.
    createNativeQuorumHostVerifier({ registry: raw.registry,
      expectedRegistryCommitment: raw.config.registryCommitment })
      .assertQuorumForMessage({ messageBytes: frame, indexes: [0, 1, 2], signatures });
    return signatures.map(signature => [...Buffer.from(signature, 'hex')]);
  }

  async function ingressFixture(family) {
    const rule = { family, genesis: h('native-genesis-' + family), asset: h('native-asset-' + family),
      finalityKind: family, minimumConfirmations: family === '1' ? '6' : '0',
      maximumEvidenceLifetime: '300', maximumClockSkew: '30' };
    const rulePath = { index: '0', siblings: [ZERO, ZERO, ZERO] };
    const registry = { profile: NATIVE_QUORUM_PROFILE, hubDomain: h('hub-domain'), registryEpoch: '1',
      rulesRoot: nativeAdmissionRuleRoot(rule, rulePath), keys: attesters.map(signer => signer.publicKey) };
    const domain = { scope: h('scope'), policy: h('policy'), asset: h('wrapper-asset'),
      hubDomain: registry.hubDomain, registryCommitment: nativeQuorumRegistryCommitment(registry),
      verifierSetCommitment: h('synthetic-original-twelve-role-set'), ledgerNamespace: registry.hubDomain };
    const config = Object.fromEntries(CLAIM_CONFIG_SCHEMA.map(([name, type]) => [name,
      type === 'address' ? h(name).slice(0, 40)
        : type === 'u256' ? '31337' : type === 'u64' ? '100' : h(name)]));
    Object.assign(config, { poolDomain: await codec.domainCommitment(domain), scope: domain.scope,
      policy: domain.policy, wrapperAssetIdentity: domain.asset, hubDomain: domain.hubDomain,
      ledgerNamespace: domain.ledgerNamespace, registryCommitment: domain.registryCommitment,
      claimVerifierSetCommitment: h('synthetic-separate-two-role-claim-set'), nativeFamily: family,
      nativeGenesis: rule.genesis, nativeAsset: rule.asset, nativeRuleCommitment: nativeRuleCommitment(rule),
      escrowEndpointCommitment: nativeClaimEndpointCommitment({ family, genesis: rule.genesis,
        asset: rule.asset, endpoint: family === '1' ? '0014' + h('escrow').slice(0, 40) : h('escrow') }) });
    const noteOpening = { rho: h('rho'), ...owner.publicKey, value: '50000',
      noteSecret: h('synthetic-note-secret') };
    const outputQ = balanceCommitment(config.scope, config.policy, { type: 4, rho: noteOpening.rho,
      x: noteOpening.x, y: noteOpening.y, value: noteOpening.value,
      secret: noteOpening.noteSecret }).toString('hex');
    // Official poolDomain must precede the SHA claim domain, receipt secret,
    // wire K and signatures. Nothing is copied from a fake-field fixture.
    const claimDomain = claimDomainCommitment(config);
    const secret = claimReceiptSecret({ claimDomain, noteSecret: noteOpening.noteSecret, outputQ });
    const observation = { blockId: h('synthetic-block'), stateCommitment: h('placeholder'),
      blockHeight: '100', observedAt: '1101', finalityKind: family,
      confirmations: family === '1' ? '6' : '0', sourceCommitment: h('synthetic-source-endpoint'),
      destinationCommitment: config.escrowEndpointCommitment, amount: noteOpening.value,
      custodyKind: '1', custodyCommitment: h('placeholder'), evidenceFrom: '1101', evidenceUntil: '1401' };
    const facts = { ledgerNamespace: domain.ledgerNamespace, hubDomain: domain.hubDomain,
      registryCommitment: domain.registryCommitment, ruleCommitment: config.nativeRuleCommitment,
      family, genesis: rule.genesis, asset: rule.asset,
      transactionId: h('synthetic-transaction') + (family === '2' ? h('synthetic-signature-tail') : ZERO),
      effectIndex: '0', nativeGid: h('placeholder'), transactionSHA256: h('synthetic-complete-wire'),
      wireBindingVersion: '1', wireBindingKind: family, wireBindingPosition: family === '1' ? '2' : '1',
      wireKeyCommitment: receiptKeyCommitment({ ledgerNamespace: domain.ledgerNamespace, secret }),
      observation, nativeContext: family === '1'
        ? { observedTipId: h('synthetic-tip'), observedTipHeight: '105',
          transactionSlot: '0', parentSlot: '0', observedSlot: '0' }
        : { observedTipId: ZERO, observedTipHeight: '0',
          transactionSlot: '120', parentSlot: '119', observedSlot: '130' } };
    refreshIdentity(facts);
    refreshObserved(facts);
    const entries = Array(64).fill(ZERO);
    const currentRevocation = {
      revokedDigest: await codec.revokedDigest(config.poolDomain, config.hubDomain, entries, '0'),
      revokedCount: '0', revocationSequence: '0', entries,
    };
    const raw = { config, domain, registry, rule, rulePath, certificates: [], currentRevocation, noteOpening };
    raw.certificates = signFacts(raw, facts);
    return raw;
  }

  function dischargeFixture(ingressRaw, ingressStatement, kind, nonce = '1') {
    const raw = structuredClone(ingressRaw), claimDomain = claimDomainCommitment(raw.config);
    const facts = structuredClone(raw.certificates[0].facts);
    const destination = { endpoint: facts.observation.sourceCommitment, salt: h('ticket-destination-salt') };
    const ticket = { kind, id: claimTicketId({ claimDomain, kind, nonce }), claimDomain, amount: '50000',
      destinationCommitment: claimDestinationCommitment({ claimDomain,
        nativeChainDomain: nativeAdmissionChainDomain(raw.rule), endpoint: destination.endpoint,
        amount: '50000', maxFee: '100', salt: destination.salt }), maxFee: '100',
      referenceIngressN: kind === '2' ? ingressStatement.admissionN : ZERO,
      referenceQ: kind === '2' ? ingressStatement.outputQ : ZERO };
    delete raw.noteOpening;
    Object.assign(raw, { ticket, destination });
    facts.observation.sourceCommitment = raw.config.escrowEndpointCommitment;
    facts.observation.destinationCommitment = destination.endpoint;
    facts.transactionId = h('synthetic-outbound-transaction') +
      (facts.family === '2' ? h('synthetic-outbound-tail') : ZERO);
    refreshIdentity(facts);
    facts.wireKeyCommitment = receiptKeyCommitment({ ledgerNamespace: raw.config.ledgerNamespace,
      secret: claimTicketSecret({ claimDomain, ticketId: ticket.id }) });
    refreshObserved(facts);
    raw.certificates = signFacts(raw, facts);
    return raw;
  }

  function solNonceFixture(original, label) {
    const raw = structuredClone(original), facts = structuredClone(raw.certificates[0].facts);
    assert.equal(facts.family, '2');
    Object.assign(facts, { effectIndex: '1', wireBindingVersion: '2', wireBindingKind: '2',
      wireBindingPosition: '2', transactionId: h(label + '-transaction') + h(label + '-signature-tail'),
      transactionSHA256: h(label + '-complete-wire') });
    refreshIdentity(facts);
    refreshObserved(facts);
    raw.certificates = signFacts(raw, facts);
    return raw;
  }

  function constraintCase(name, relation, job, expected = true) {
    const publicInputs = job.publicInputs;
    assert.equal(publicInputs.length, relation === 'native_claim_ingress'
      ? CLAIM_INGRESS_PUBLIC_WORDS : CLAIM_DISCHARGE_PUBLIC_WORDS, 'ENVELOPE_NATIVE_CLAIM_PUBLIC_WIDTH');
    const entry = { name, relation, inputs: job.inputs, statement: job.statement, publicInputs, expected };
    cases.push(entry);
    return entry;
  }

  function negative(name, genuine, mutate) {
    const inputs = structuredClone(genuine.inputs);
    mutate(inputs);
    // The pinned compiled ABI supplies public order. All mutations preserve
    // types, array lengths and public agreement, reaching actual constraints.
    const publicInputs = abis[genuine.relation].parameters
      .filter(parameter => parameter.visibility === 'public')
      .flatMap(parameter => [inputs[parameter.name]].flat(Infinity).map(String));
    cases.push({ name, relation: genuine.relation, inputs, publicInputs, expected: false });
  }

  async function revokedGidCase(name, genuine, raw) {
    const entries = Array(64).fill(ZERO);
    entries[0] = raw.certificates[0].facts.nativeGid;
    const { poolDomain, hubDomain } = raw.config;
    const revokedDigest = await codec.revokedDigest(poolDomain, hubDomain, entries, '1');
    const revocationState = await codec.admissionRevocationState(poolDomain, {
      currentRevokedDigest: revokedDigest, currentRevokedCount: '1', currentRevocationSequence: '1',
    });
    negative(name, genuine, inputs => {
      Object.assign(inputs.evidence, { current_revoked_entries: entries.map(digestBytes),
        current_revoked_digest: digestBytes(revokedDigest), current_revoked_count: '1',
        current_revocation_sequence: '1' });
      inputs.admission_revocation_state = digestWords(revocationState);
    });
  }

  try {
    const fixtures = {};
    for (const [family, label, kind] of [['1', 'btc', '1'], ['2', 'sol', '2']]) {
      const ingressRaw = await ingressFixture(family);
      const ingress = constraintCase('ci51-' + label + '-genuine-quorum', 'native_claim_ingress',
        await buildClaimIngressInputs(ingressRaw, { hashFields }));
      const dischargeRaw = dischargeFixture(ingressRaw, ingress.statement, kind);
      const discharge = constraintCase('co42-' + label + '-genuine-' + (kind === '1' ? 'redeem' : 'refund'),
        'native_claim_discharge', await buildClaimDischargeInputs(dischargeRaw, { hashFields }));
      fixtures[label] = { ingressRaw, ingress, dischargeRaw, discharge };
    }
    const { btc, sol } = fixtures;
    negative('ci51-btc-mismatched-note-opening', btc.ingress, inputs => {
      inputs.note_opening.rho[0] ^= 1;
    });

    // Keep the facts quorum genuinely valid while breaking the independently
    // derived receipt K, so this negative reaches the CI51 key-binding check.
    const wrongKeyFacts = structuredClone(sol.ingressRaw.certificates[0].facts);
    wrongKeyFacts.wireKeyCommitment = h('wrong-receipt-key');
    const wrongKeyCertificates = signFacts(sol.ingressRaw, wrongKeyFacts);
    negative('ci51-sol-signed-wrong-wire-key', sol.ingress, inputs => {
      inputs.evidence.wire.wire_key_commitment = digestBytes(wrongKeyFacts.wireKeyCommitment);
      inputs.evidence.attester_signatures = wrongKeyCertificates.map(certificate =>
        [...Buffer.from(certificate.signature, 'hex')]);
    });

    const wrongSignature = attesters[3].sign(Buffer.from(btc.dischargeRaw.certificates[0].frameHex, 'hex'));
    negative('co42-btc-wrong-quorum-signature', btc.discharge, inputs => {
      inputs.evidence.attester_signatures[2] = [...Buffer.from(wrongSignature, 'hex')];
    });
    negative('ci51-btc-reversed-quorum-order', btc.ingress, inputs => {
      inputs.evidence.attester_indexes.reverse();
      inputs.evidence.attester_signatures.reverse();
    });

    await revokedGidCase('co42-sol-current-gid-revoked', sol.discharge, sol.dischargeRaw);

    // Open a different, internally consistent ticket against the original
    // public immutable ticket commitment. Native signatures remain unchanged.
    const alteredDestination = claimDestinationCommitment({ claimDomain: btc.dischargeRaw.ticket.claimDomain,
      nativeChainDomain: nativeAdmissionChainDomain(btc.dischargeRaw.rule),
      endpoint: btc.dischargeRaw.destination.endpoint, amount: btc.dischargeRaw.ticket.amount,
      maxFee: '101', salt: btc.dischargeRaw.destination.salt });
    negative('co42-btc-changed-immutable-ticket', btc.discharge, inputs => {
      inputs.ticket.max_fee = '101';
      inputs.ticket.destination_commitment = digestBytes(alteredDestination);
    });
    negative('co42-sol-wrong-destination-opening', sol.discharge, inputs => {
      inputs.destination_salt[0] ^= 1;
    });

    const nonceDischarges = {};
    for (const [kind, label, nonce] of [['1', 'redeem', '2'], ['2', 'refund', '3']]) {
      const raw = solNonceFixture(dischargeFixture(sol.ingressRaw, sol.ingress.statement, kind, nonce),
        'synthetic-sol-nonce-' + label);
      assert.notEqual(raw.certificates[0].facts.nativeGid, sol.dischargeRaw.certificates[0].facts.nativeGid);
      assert.notEqual(raw.certificates[0].facts.wireKeyCommitment,
        sol.dischargeRaw.certificates[0].facts.wireKeyCommitment);
      const entry = constraintCase('co42-sol-v2-genuine-' + label, 'native_claim_discharge',
        await buildClaimDischargeInputs(raw, { hashFields }));
      nonceDischarges[label] = { raw, entry };
    }

    // Host preparation deliberately builds the complete new index-1 CI51
    // statement, including its N and receipt leaf. Only the circuit's v2
    // source-to-escrow guard rejects these otherwise genuine ingress facts.
    const nonceIngressRaw = solNonceFixture(sol.ingressRaw, 'synthetic-sol-nonce-ingress');
    constraintCase('ci51-sol-v2-signed-ingress-rejected', 'native_claim_ingress',
      await buildClaimIngressInputs(nonceIngressRaw, { hashFields }), false);

    const { raw: nonceRaw, entry: nonceDischarge } = nonceDischarges.redeem;
    for (const [label, factName, witnessName, value] of [
      ['wrong-kind', 'wireBindingKind', 'wire_binding_kind', '1'],
      ['wrong-position', 'wireBindingPosition', 'wire_binding_position', '1'],
      ['unknown-version', 'wireBindingVersion', 'wire_binding_version', '3'],
    ]) {
      const signatures = signedInvalidFrame(nonceRaw, { [factName]: value });
      negative('co42-sol-v2-signed-' + label, nonceDischarge, inputs => {
        inputs.evidence.wire[witnessName] = value;
        inputs.evidence.attester_signatures = signatures;
      });
    }

    // Change the actual effect index and recompute its canonical GID, observed
    // effect commitment and public N before re-signing. This is an independent
    // index guard rejection, not a stale signature or stale identity check.
    const wrongIndexFacts = structuredClone(nonceRaw.certificates[0].facts);
    wrongIndexFacts.effectIndex = '0';
    refreshIdentity(wrongIndexFacts);
    refreshObserved(wrongIndexFacts);
    const wrongIndexSignatures = signedInvalidFrame(nonceRaw, { effectIndex: '0',
      nativeGid: wrongIndexFacts.nativeGid, stateCommitment: wrongIndexFacts.observation.stateCommitment });
    const wrongIndexN = nativeAdmissionNullifier({ ledgerNamespace: nonceRaw.config.ledgerNamespace,
      secret: claimTicketSecret({ claimDomain: nonceRaw.ticket.claimDomain, ticketId: nonceRaw.ticket.id }),
      nativeGid: wrongIndexFacts.nativeGid });
    negative('co42-sol-v2-signed-index-zero-rebound', nonceDischarge, inputs => {
      inputs.evidence.effect.effect_index = '0';
      inputs.evidence.observation.state_commitment = digestBytes(wrongIndexFacts.observation.stateCommitment);
      inputs.evidence.attester_signatures = wrongIndexSignatures;
      inputs.discharge_n = digestWords(wrongIndexN);
    });

    const nonzeroTip = h('invalid-sol-nonce-tip-padding');
    const wrongPaddingSignatures = signedInvalidFrame(nonceRaw, { observedTipId: nonzeroTip });
    negative('co42-sol-v2-signed-nonzero-tip-padding', nonceDischarge, inputs => {
      inputs.evidence.native_context.observed_tip_id = digestBytes(nonzeroTip);
      inputs.evidence.attester_signatures = wrongPaddingSignatures;
    });
    await revokedGidCase('co42-sol-v2-current-index-one-gid-revoked', nonceDischarge, nonceRaw);

    assert.equal(cases.length, 20, 'ENVELOPE_NATIVE_CLAIM_EXACT_CASE_COUNT');
    assert.equal(cases.filter(item => item.expected).length, 6, 'ENVELOPE_NATIVE_CLAIM_POSITIVE_COUNT');
    return { cases, destroy };
  } catch (error) {
    destroy();
    throw error;
  }
}
