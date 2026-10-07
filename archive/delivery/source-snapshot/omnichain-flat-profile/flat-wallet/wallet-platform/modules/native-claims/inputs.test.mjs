/** Offline host checks with real fixture signatures. hashFields deliberately
 * is not Poseidon2; no compiled circuit, proof, verifier or node is invoked. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, createECDH, createPrivateKey, sign } from 'node:crypto';
import { buildClaimIngressInputs, buildClaimDischargeInputs } from './inputs.mjs';
import { CLAIM_CONFIG_SCHEMA, claimDomainCommitment, claimReceiptSecret, claimRefundSalt,
  claimDestinationCommitment, claimIngressReceiptCommitment, claimTicketId, claimTicketSecret,
  claimTicketCommitment, nativeClaimEndpointCommitment, decodeClaimIngressInputs, decodeClaimDischargeInputs }
  from './framing.mjs';
import { createCommitmentCodec, ZERO } from '../paeg/commitments.mjs';
import { balanceCommitment } from '../../../../../omnichain-product/src/private-wallet-note-encoding.mjs';
import { nativeAdmissionRuleRoot, nativeAdmissionChainDomain }
  from '../../../../../omnichain-product/src/paeg/native-admission.mjs';
import { NATIVE_QUORUM_PROFILE, nativeQuorumRegistryCommitment }
  from '../../../../../omnichain-product/src/evidence/native-quorum.mjs';
import { FACTS_SCHEMA, nativeFactIdentity, nativeRuleCommitment, nativeCustodyCommitment,
  nativeObservedEffectCommitment, receiptKeyCommitment, encodeNativeFacts, nativeFactsDigest,
  nativeAdmissionNullifier } from '../chain-adapters/native-receipt-binding.mjs';

const h = label => createHash('sha256').update('SYNTHETIC-NATIVE-CLAIMS/' + label).digest('hex');
const hashFields = async fields => '00' + h(fields.map(String).join(':')).slice(2);
const codec = createCommitmentCodec({ hashFields });
const ORDER = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
function fixtureSigner(index) {
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
const attesters = [1, 2, 3, 4].map(fixtureSigner), owner = fixtureSigner(5);
const policyFor = raw => ({ ledgerNamespace: raw.config.ledgerNamespace, hubDomain: raw.config.hubDomain,
  registryCommitment: raw.config.registryCommitment, rule: raw.rule });
function resign(raw, facts) {
  const policy = policyFor(raw), frame = encodeNativeFacts(facts, policy);
  raw.certificates = attesters.slice(0, 3).map((attester, index) => ({ schema: FACTS_SCHEMA, signerIndex: String(index),
    facts: structuredClone(facts), frameHex: frame.toString('hex'), digest: nativeFactsDigest(facts, policy),
    signature: attester.sign(frame) }));
}
function updateObserved(facts) {
  const endpoints = { family: facts.family, genesis: facts.genesis, asset: facts.asset,
    sourceCommitment: facts.observation.sourceCommitment, destinationCommitment: facts.observation.destinationCommitment };
  facts.observation.custodyCommitment = nativeCustodyCommitment(endpoints);
  facts.observation.stateCommitment = nativeObservedEffectCommitment({ ...endpoints, nativeGid: facts.nativeGid,
    blockId: facts.observation.blockId, blockHeight: facts.observation.blockHeight,
    transactionSHA256: facts.transactionSHA256, amount: facts.observation.amount });
}
async function fixture(family = '1') {
  const rule = { family, genesis: h('native-genesis-' + family), asset: h('native-asset-' + family), finalityKind: family,
    minimumConfirmations: family === '1' ? '6' : '0', maximumEvidenceLifetime: '300', maximumClockSkew: '30' };
  const rulePath = { index: '0', siblings: [ZERO, ZERO, ZERO] };
  const registry = { profile: NATIVE_QUORUM_PROFILE, hubDomain: h('hub-domain'), registryEpoch: '1',
    rulesRoot: nativeAdmissionRuleRoot(rule, rulePath), keys: attesters.map(value => value.publicKey) };
  const domain = { scope: h('scope'), policy: h('policy'), asset: h('wrapper-asset'), hubDomain: registry.hubDomain,
    registryCommitment: nativeQuorumRegistryCommitment(registry), verifierSetCommitment: h('twelve-role-set'),
    ledgerNamespace: registry.hubDomain };
  const config = Object.fromEntries(CLAIM_CONFIG_SCHEMA.map(([name, type]) => [name,
    type === 'address' ? h(name).slice(0, 40) : type === 'u256' ? '31337' : type === 'u64' ? '100' : h(name)]));
  Object.assign(config, { poolDomain: await codec.domainCommitment(domain), scope: domain.scope, policy: domain.policy,
    wrapperAssetIdentity: domain.asset, hubDomain: domain.hubDomain, ledgerNamespace: domain.ledgerNamespace,
    registryCommitment: domain.registryCommitment, nativeFamily: family, nativeGenesis: rule.genesis,
    nativeAsset: rule.asset, nativeRuleCommitment: nativeRuleCommitment(rule),
    escrowEndpointCommitment: nativeClaimEndpointCommitment({ family, genesis: rule.genesis, asset: rule.asset,
      endpoint: family === '1' ? '0014' + h('escrow').slice(0, 40) : h('escrow') }) });
  const noteOpening = { rho: h('rho'), ...owner.publicKey, value: '50000', noteSecret: h('fresh-test-note-secret') };
  const q = balanceCommitment(config.scope, config.policy, { type: 4, rho: noteOpening.rho,
    x: noteOpening.x, y: noteOpening.y, value: noteOpening.value, secret: noteOpening.noteSecret }).toString('hex');
  const claimDomain = claimDomainCommitment(config), secret = claimReceiptSecret({ claimDomain, noteSecret: noteOpening.noteSecret, outputQ: q });
  const observation = { blockId: h('block'), stateCommitment: h('placeholder'), blockHeight: '100', observedAt: '1101',
    finalityKind: family, confirmations: family === '1' ? '6' : '0', sourceCommitment: h('source-endpoint'),
    destinationCommitment: config.escrowEndpointCommitment, amount: noteOpening.value, custodyKind: '1',
    custodyCommitment: h('placeholder'), evidenceFrom: '1101', evidenceUntil: '1401' };
  const facts = { ledgerNamespace: domain.ledgerNamespace, hubDomain: domain.hubDomain, registryCommitment: domain.registryCommitment,
    ruleCommitment: config.nativeRuleCommitment, family, genesis: rule.genesis, asset: rule.asset,
    transactionId: h('transaction') + (family === '2' ? h('signature-tail') : ZERO), effectIndex: '0', nativeGid: h('placeholder'),
    transactionSHA256: h('exact-wire'), wireBindingVersion: '1', wireBindingKind: family,
    wireBindingPosition: family === '1' ? '2' : '1', wireKeyCommitment: receiptKeyCommitment({ ledgerNamespace: domain.ledgerNamespace, secret }),
    observation, nativeContext: family === '1'
      ? { observedTipId: h('tip'), observedTipHeight: '105', transactionSlot: '0', parentSlot: '0', observedSlot: '0' }
      : { observedTipId: ZERO, observedTipHeight: '0', transactionSlot: '120', parentSlot: '119', observedSlot: '130' } };
  facts.nativeGid = nativeFactIdentity(Object.fromEntries(['family', 'genesis', 'asset', 'transactionId', 'effectIndex'].map(name => [name, facts[name]])));
  updateObserved(facts);
  const entries = Array(64).fill(ZERO);
  const currentRevocation = { revokedDigest: await codec.revokedDigest(config.poolDomain, config.hubDomain, entries, '0'),
    revokedCount: '0', revocationSequence: '0', entries };
  const raw = { config, domain, registry, rule, rulePath, certificates: [], currentRevocation, noteOpening };
  resign(raw, facts); return raw;
}
async function outbound(family = '1', kind = '1') {
  const raw = await fixture(family), ingress = await buildClaimIngressInputs(raw, { hashFields });
  const claimDomain = claimDomainCommitment(raw.config), facts = structuredClone(raw.certificates[0].facts);
  const destination = { endpoint: facts.observation.sourceCommitment, salt: h('ticket-destination-salt') };
  const ticket = { kind, id: claimTicketId({ claimDomain, kind, nonce: '1' }), claimDomain, amount: '50000',
    destinationCommitment: claimDestinationCommitment({ claimDomain, nativeChainDomain: nativeAdmissionChainDomain(raw.rule),
      endpoint: destination.endpoint, amount: '50000', maxFee: '100', salt: destination.salt }), maxFee: '100',
    referenceIngressN: kind === '2' ? ingress.statement.admissionN : ZERO,
    referenceQ: kind === '2' ? ingress.statement.outputQ : ZERO };
  delete raw.noteOpening;
  Object.assign(raw, { ticket, destination });
  facts.observation.sourceCommitment = raw.config.escrowEndpointCommitment;
  facts.observation.destinationCommitment = destination.endpoint;
  facts.transactionId = h('outbound-transaction') + (family === '2' ? h('outbound-tail') : ZERO);
  facts.nativeGid = nativeFactIdentity(Object.fromEntries(['family', 'genesis', 'asset', 'transactionId', 'effectIndex'].map(name => [name, facts[name]])));
  facts.wireKeyCommitment = receiptKeyCommitment({ ledgerNamespace: raw.config.ledgerNamespace,
    secret: claimTicketSecret({ claimDomain, ticketId: ticket.id }) });
  updateObserved(facts); resign(raw, facts); return raw;
}
const ingress = raw => buildClaimIngressInputs(raw, { hashFields });
const discharge = raw => buildClaimDischargeInputs(raw, { hashFields });

test('CI51 BTC/SOL keep original note, K/N, 829-byte facts and exact public ABI', async () => {
  for (const family of ['1', '2']) {
    const raw = await fixture(family), job = await ingress(raw), s = job.statement;
    assert.equal(job.publicInputs.length, 51);
    assert.deepEqual(decodeClaimIngressInputs(job.publicInputs), s);
    assert.deepEqual(job.publicInputs, job.expectedPublicInputs);
    assert.equal(raw.certificates[0].frameHex.length, 829 * 2);
    const secret = claimReceiptSecret({ claimDomain: s.claimDomain, noteSecret: raw.noteOpening.noteSecret, outputQ: s.outputQ });
    assert.equal(s.admissionN, nativeAdmissionNullifier({ ledgerNamespace: raw.config.ledgerNamespace,
      secret, nativeGid: raw.certificates[0].facts.nativeGid }));
    assert.equal(s.refundDestination, claimDestinationCommitment({ claimDomain: s.claimDomain,
      nativeChainDomain: nativeAdmissionChainDomain(raw.rule), endpoint: raw.certificates[0].facts.observation.sourceCommitment,
      amount: s.amountQ, maxFee: raw.config.refundMaxFee, salt: claimRefundSalt({ claimDomain: s.claimDomain,
        noteSecret: raw.noteOpening.noteSecret, outputQ: s.outputQ }) }));
    assert.equal(s.ingressReceiptLeaf, await codec.receiptLeaf(raw.config.poolDomain, claimIngressReceiptCommitment({
      claimDomain: s.claimDomain, outputQ: s.outputQ, amount: s.amountQ, admissionN: s.admissionN, refundDestination: s.refundDestination })));
    assert.ok(Object.isFrozen(job.inputs.evidence.attester_signatures[0]));
  }
});

test('CI51 requires three genuine ordered distinct low-S signatures on identical facts', async () => {
  const base = await fixture();
  const mutations = [raw => { raw.certificates.pop(); }, raw => { raw.certificates = [raw.certificates[0]]; },
    raw => { raw.certificates[1] = structuredClone(raw.certificates[0]); },
    raw => { raw.certificates.reverse(); },
    ...[0, 1, 2].map(index => raw => { raw.certificates[index].signature = '0'.repeat(128); }),
    raw => { const signature = raw.certificates[0].signature;
      raw.certificates[0].signature = signature.slice(0, 64) + (ORDER - BigInt('0x' + signature.slice(64))).toString(16).padStart(64, '0'); },
    raw => { raw.certificates[1].facts.observation.amount = '50001'; },
    raw => { raw.certificates[2].digest = h('forged-digest'); }];
  for (const change of mutations) { const raw = structuredClone(base); change(raw); await assert.rejects(ingress(raw)); }
});

test('CI51 rejects wrong registered domain/rule/escrow/amount/opening/wire and noncanonical data', async () => {
  const base = await fixture();
  const changes = [raw => { raw.config.nativeGenesis = h('other-genesis'); },
    raw => { raw.config.nativeAsset = h('other-asset'); }, raw => { raw.config.nativeFamily = '3'; },
    raw => { raw.domain.verifierSetCommitment = h('changed-original-set'); },
    raw => { raw.rulePath.siblings[0] = h('wrong-path'); }, raw => { raw.config.escrowEndpointCommitment = h('other-escrow'); },
    raw => { raw.config.ledgerNamespace = h('split-ledger'); }, raw => { raw.noteOpening.value = '50001'; },
    raw => { raw.noteOpening.rho = h('different-note'); }, raw => { raw.noteOpening.noteSecret = h('different-secret'); },
    raw => { raw.noteOpening.noteSecret = ZERO; }, raw => { raw.noteOpening.value = 50000; },
    raw => { raw.config.refundMaxFee = '01'; }, raw => { raw.config.gateway = '0x' + raw.config.gateway; },
    raw => { raw.noteOpening.wallet = {}; }, raw => { raw.currentRevocation.revocationSequence = '0\n'; }];
  for (const change of changes) { const raw = structuredClone(base); change(raw); await assert.rejects(ingress(raw)); }
  for (const change of [facts => { facts.wireKeyCommitment = h('wrong-wire-key'); },
    facts => { facts.observation.destinationCommitment = h('wrong-escrow'); },
    facts => { facts.observation.amount = '50001'; }]) {
    const raw = structuredClone(base), facts = structuredClone(raw.certificates[0].facts);
    change(facts); updateObserved(facts); resign(raw, facts); await assert.rejects(ingress(raw));
  }
});

test('complete current revocation vector is checked and original GID cannot be hidden', async () => {
  const base = await fixture();
  for (const change of [raw => { raw.currentRevocation.entries[63] = h('hidden-padding'); },
    raw => { raw.currentRevocation.revokedCount = '65'; }, raw => { raw.currentRevocation.revokedDigest = h('unchecked-digest'); }]) {
    const raw = structuredClone(base); change(raw); await assert.rejects(ingress(raw));
  }
  const raw = structuredClone(base);
  raw.currentRevocation.entries[0] = raw.certificates[0].facts.nativeGid;
  raw.currentRevocation.revokedCount = '1';
  raw.currentRevocation.revokedDigest = await codec.revokedDigest(raw.config.poolDomain, raw.config.hubDomain,
    raw.currentRevocation.entries, '1');
  await assert.rejects(ingress(raw), /CLAIM_GID_REVOKED/);
});

test('refreshed original ingress keeps Q/N/refund/leaf stable while publishing exact fresh facts times', async () => {
  const raw = await fixture(), first = await ingress(raw), facts = structuredClone(raw.certificates[0].facts);
  Object.assign(facts.observation, { observedAt: '2101', evidenceFrom: '2101', evidenceUntil: '2401' });
  updateObserved(facts); resign(raw, facts);
  const refreshed = await ingress(raw);
  for (const name of ['outputQ', 'admissionN', 'refundDestination', 'ingressReceiptLeaf'])
    assert.equal(refreshed.statement[name], first.statement[name]);
  assert.equal(refreshed.statement.evidenceFrom, '2101'); assert.equal(refreshed.statement.evidenceUntil, '2401');
});

test('CO42 BTC/SOL binds exact REDEEM/REFUND ticket, original K/N and ABI', async () => {
  for (const family of ['1', '2']) for (const kind of ['1', '2']) {
    const raw = await outbound(family, kind), job = await discharge(raw);
    assert.equal(job.publicInputs.length, 42);
    assert.deepEqual(decodeClaimDischargeInputs(job.publicInputs), job.statement);
    assert.equal(job.statement.ticketCommitment, claimTicketCommitment(raw.ticket));
    assert.equal(job.statement.dischargeN, nativeAdmissionNullifier({ ledgerNamespace: raw.config.ledgerNamespace,
      secret: claimTicketSecret({ claimDomain: raw.ticket.claimDomain, ticketId: raw.ticket.id }),
      nativeGid: raw.certificates[0].facts.nativeGid }));
  }
});

test('CO42 rejects ticket substitution, endpoint/amount/fee-opening changes and wrong escrow source', async () => {
  const base = await outbound();
  const changes = [raw => { raw.ticket.id = h('different-ticket'); }, raw => { raw.ticket.amount = '50001'; },
    raw => { raw.ticket.claimDomain = h('different-domain'); }, raw => { raw.ticket.maxFee = '101'; },
    raw => { raw.ticket.referenceIngressN = h('nonzero-redeem-ref'); },
    raw => { raw.ticket.kind = '2'; }, raw => { raw.destination.endpoint = h('different-recipient'); },
    raw => { raw.destination.salt = h('different-salt'); }, raw => { raw.ticket.cancelled = true; },
    raw => { raw.certificates[0].signature = '0'.repeat(128); }];
  for (const change of changes) { const raw = structuredClone(base); change(raw); await assert.rejects(discharge(raw)); }
  for (const change of [facts => { facts.observation.sourceCommitment = h('wrong-source'); },
    facts => { facts.wireKeyCommitment = h('other-ticket-key'); }]) {
    const raw = structuredClone(base), facts = structuredClone(raw.certificates[0].facts);
    change(facts); updateObserved(facts); resign(raw, facts); await assert.rejects(discharge(raw));
  }
});

test('same ticket with a new observed effect keeps ticket commitment; canonical once-only consumption is external', async () => {
  const raw = await outbound('2'), first = await discharge(raw), facts = structuredClone(raw.certificates[0].facts);
  facts.transactionId = h('second-effect') + h('second-tail');
  facts.nativeGid = nativeFactIdentity(Object.fromEntries(['family', 'genesis', 'asset', 'transactionId', 'effectIndex'].map(name => [name, facts[name]])));
  updateObserved(facts); resign(raw, facts); const second = await discharge(raw);
  assert.equal(first.statement.ticketCommitment, second.statement.ticketCommitment);
  assert.notEqual(first.statement.dischargeN, second.statement.dischargeN);
});
