import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { freshKey, signature } from '../../../../engine/src/notes/private-note-encoding.mjs';
import {
  attachFundedSignatures, compileFundedGraph, fundedAuthorizationWords,
  fundedSigningRequests, ownerAuthorizationMessage, payoutInvoiceMessage,
} from '../../../../engine/src/execution/graph/funded-graph.mjs';
import {
  capsuleAuthorizationWords, dependencyCapsuleCommitment, localCapsuleCommitment,
} from '../../../../engine/src/execution/native/dispatch/native-capsules.mjs';
import { nativeRecipientInvoiceMessage } from '../../../../engine/src/execution/native/recipients/native-recipient-custody.mjs';
import {
  createGenericBalanceNativePreparation, genericBalanceNativeInvoiceRequests,
  genericBalanceNativeTerms, normalizeGenericBalanceNativeConfig,
  prepareGenericBalanceNativeCapsules, validateGenericBalanceNativePreparation,
} from '../../../../engine/src/execution/balances/generic-balance-native-preparation.mjs';

const h = value => createHash('sha256').update('balance native preparation fixture: ' + value).digest('hex');
const hex = value => Buffer.from(value).toString('hex');
const copy = value => structuredClone(value);
const ZERO = '0'.repeat(64);

function fixture(count = 3) {
  const recipients = Array.from({ length: count }, () => freshKey());
  return {
    sourceKey: freshKey(),
    changeKey: freshKey(),
    recoveryKey: freshKey(),
    recipients,
    config: {
      scope: h('scope'), policy: h('policy'), asset: h('asset'), hubDomain: h('hub'),
      registryCommitment: h('registry'), operationId: h('operation'),
      fundingNotBefore: '100', fundingValidUntil: '200', settleBefore: '500',
      nodes: recipients.map((key, slot) => ({
        id: `leg-${slot}`,
        dependsOn: slot ? [`leg-${slot - 1}`] : [],
        evidencePolicy: h('evidence:' + slot),
        actionTemplate: {
          chainDomain: h('chain:' + slot), signerIdentity: h('signer:' + slot),
          sourceCommitment: h('source:' + slot), destinationCommitment: h('destination:' + slot),
          amount: String((1n << 90n) + BigInt(slot)), custodyKind: 1,
          custodyCommitment: h('custody:' + slot), executionFrom: '220', executionUntil: '450',
        },
        recipientOffer: {
          x: hex(key.x), y: hex(key.y), value: '25',
          secret: h('payout-secret:' + slot), randomness: h('payout-randomness:' + slot),
        },
      })).reverse(),
    },
  };
}

function note(key, value, tag) {
  return { type: 4, rho: h(tag + ':rho'), x: hex(key.x), y: hex(key.y), value, secret: h(tag + ':secret') };
}

function compileFor(f, record, overrides = {}) {
  const terms = genericBalanceNativeTerms(record);
  const change = (100n - BigInt(terms.budget)).toString();
  return compileFundedGraph({
    scope: f.config.scope, policy: f.config.policy, asset: f.config.asset,
    ...terms,
    reservationNonce: h('reservation'), reserveSecret: h('reserve'), graphNonce: h('graph'),
    inputNote: note(f.sourceKey, '100', 'source'),
    changeNote: change === '0'
      ? { type: 4, rho: ZERO, x: ZERO, y: ZERO, value: '0', secret: ZERO }
      : note(f.changeKey, change, 'change'),
    recoveryNote: note(f.recoveryKey, terms.budget, 'recovery'),
    paddingSalts: Array.from({ length: 4 }, (_, slot) => h('padding:' + slot)),
    ...overrides,
  });
}

function signFor(f, compiled) {
  const requests = fundedSigningRequests(compiled);
  const signed = attachFundedSignatures(compiled, {
    ownerSignature: hex(signature(f.sourceKey, requests.owner.message)),
    invoiceSignatures: requests.invoices.map(request =>
      hex(signature(f.recipients[Number(request.id.slice(4))], request.message))),
  });
  return {
    signed,
    authorizationWords: fundedAuthorizationWords(compiled.authorizationStatement),
    custodyRequests: requests.invoices.map(request => ({ ...request, message: hex(request.message) })),
  };
}

function prepareFor(f) {
  const preparation = createGenericBalanceNativePreparation(f.config);
  return { preparation, ...signFor(f, compileFor(f, preparation)) };
}

const finish = prepared => prepareGenericBalanceNativeCapsules({
  preparation: prepared.preparation,
  signed: prepared.signed,
  authorizationWords: prepared.authorizationWords,
});

test('one-to-four-node preparation reuses funded source and matches the exact invoice and C129 codecs', () => {
  for (const count of [1, 2, 3, 4]) {
    const f = fixture(count);
    const prepared = prepareFor(f);
    const terms = genericBalanceNativeTerms(prepared.preparation);
    assert.equal(terms.budget, String(count * 25));
    assert.deepEqual(Object.keys(terms).sort(), [
      'operationId', 'budget', 'fundingNotBefore', 'fundingValidUntil', 'settleBefore', 'nodes',
    ].sort());
    const requests = genericBalanceNativeInvoiceRequests(prepared.preparation, prepared.custodyRequests);
    requests.forEach((request, slot) => {
      assert.equal(request.id, `leg-${slot}`);
      assert.equal(hex(nativeRecipientInvoiceMessage(request.invoice)), prepared.custodyRequests[slot].message);
      assert.equal(request.invoice.payoutCommitment, prepared.signed.authorizationStatement.outputs[slot]);
      assert.equal(request.invoice.rho, prepared.signed.ownerWitness.payouts[slot].rho);
      assert.equal(request.invoice.deliveryRiskSalt, prepared.preparation.nodes[slot].deliveryRiskSalt);
    });
    assert.deepEqual(prepared.signed.ownerWitness.inputNote, note(f.sourceKey, '100', 'source'));

    const result = finish(prepared);
    assert.deepEqual(result.invoiceRequests, requests);
    assert.equal(capsuleAuthorizationWords(result.capsules.statement).length, 129);
    assert.equal(prepared.authorizationWords.length, 139);
    for (let slot = 0; slot < 4; slot++) {
      const node = result.rolePackets.node[slot];
      const dependency = result.rolePackets.dependency[slot];
      assert.equal(node.localCapsule.slot, slot);
      assert.equal(node.localCapsule.active, slot < count);
      assert.equal(node.localCapsule.payoutCommitment, prepared.signed.authorizationStatement.outputs[slot]);
      assert.equal(localCapsuleCommitment(node, node.localCapsule), result.capsules.statement.localCapsuleCommitments[slot]);
      assert.equal(dependencyCapsuleCommitment(dependency, dependency.dependencyCapsule),
        result.capsules.statement.dependencyCapsuleCommitments[slot]);
      assert.equal(Object.hasOwn(dependency, 'action'), false);
      assert.equal(Object.hasOwn(dependency, 'receiptSpendSecret'), false);
      assert.equal(Object.hasOwn(node, 'dependencyCapsule'), false);
      if (slot >= count) {
        assert.equal(result.rolePackets.ready[slot], null);
        assert.equal(result.providerRiskSalts[slot], null);
        assert.equal(node.receiptSpendSecret, ZERO);
      }
    }
  }
});

test('serialized preparation replays the same terms, invoices, capsule commitments and role packets', () => {
  const f = fixture();
  const prepared = prepareFor(f);
  const stored = JSON.stringify(prepared.preparation);
  const restored = validateGenericBalanceNativePreparation(JSON.parse(stored), f.config);
  assert.deepEqual(restored, prepared.preparation);
  assert.deepEqual(genericBalanceNativeTerms(restored), genericBalanceNativeTerms(prepared.preparation));
  const before = finish(prepared);
  const after = finish({ ...prepared, preparation: restored });
  assert.deepEqual(after.rolePackets, before.rolePackets);
  assert.deepEqual(after.capsules.statement, before.capsules.statement);
  assert.deepEqual(after.invoiceRequests, before.invoiceRequests);
  assert.deepEqual(after.providerRiskSalts, before.providerRiskSalts);
  assert.equal(JSON.stringify(prepared.preparation), stored);
  restored.nodes[0].action.actionSalt = h('caller-mutation');
  assert.equal(JSON.stringify(prepared.preparation), stored);
  assert.doesNotMatch(stored, /privateKey|publicKey|sourceKey|changeKey|recoveryKey|inputNote|graphNonce|reservationNonce|reserveSecret/);
});

test('normalization preserves canonical wave order and makes input node/edge ordering irrelevant', () => {
  const f = fixture(4);
  const byId = Object.fromEntries(f.config.nodes.map(node => [node.id, node]));
  byId['leg-0'].dependsOn = [];
  byId['leg-1'].dependsOn = ['leg-0'];
  byId['leg-2'].dependsOn = [];
  byId['leg-3'].dependsOn = ['leg-1', 'leg-2'];
  const normalized = normalizeGenericBalanceNativeConfig(f.config);
  assert.deepEqual(normalized.nodes.map(node => node.id), ['leg-0', 'leg-2', 'leg-1', 'leg-3']);
  const record = createGenericBalanceNativePreparation(f.config);
  f.config.nodes.reverse();
  byId['leg-3'].dependsOn.reverse();
  assert.deepEqual(validateGenericBalanceNativePreparation(record, f.config), record);
});

test('invalid retained records fail instead of recreating missing secrets or accepting changed requests', () => {
  const f = fixture();
  const record = createGenericBalanceNativePreparation(f.config);
  const mutations = [
    r => { r.schema = 'unknown'; },
    r => { delete r.slotSalts; },
    r => { r.slotSalts[0].targetSalt = ZERO; },
    r => { delete r.nodes[0].receiptSpendSecret; },
    r => { r.nodes[0].receiptSpendSecret = h('changed-secret'); },
    r => { r.nodes[0].deliveryRiskSalt = h('changed-risk'); },
    r => { r.nodes[0].payout.value = '26'; },
    r => { r.nodes[0].payout.rho = h('changed-rho'); },
    r => { r.nodes[0].action.amount = '1'; },
    r => { r.nodes.reverse(); },
    r => { r.sourceKey = 'forbidden'; },
    r => { r.config.hubDomain = h('other-hub'); },
    r => { r.config.registryCommitment = h('other-registry'); },
    r => { r.config.nodes[0].recipientOffer.secret = h('other-secret'); },
    r => { r.config.nodes[0].actionTemplate.receiptRho = h('injected'); },
  ];
  for (const mutate of mutations) {
    const changed = copy(record);
    mutate(changed);
    assert.throws(() => validateGenericBalanceNativePreparation(changed, f.config));
  }
  assert.throws(() => validateGenericBalanceNativePreparation(null));
  assert.throws(() => genericBalanceNativeTerms({}));
  const changedConfig = copy(f.config);
  changedConfig.operationId = h('other-operation');
  assert.throws(() => validateGenericBalanceNativePreparation(record, changedConfig), /CONFIG_BINDING/);
});

test('exact configuration rejects deposit fields, malformed graphs, amounts and executable objects', () => {
  const { config } = fixture();
  const mutations = [
    c => { c.vault = { path: '/tmp/unused', password: 'unused' }; },
    c => { c.epoch = '1'; },
    c => { c.fundingAmount = '100'; },
    c => { c.sourceNote = {}; },
    c => { c.nodes = []; },
    c => { c.nodes.push(copy(c.nodes[0]), copy(c.nodes[0])); },
    c => { c.nodes[0].dependsOn = ['missing']; },
    c => { c.nodes[0].recipientOffer.privateKey = 'forbidden'; },
    c => { c.nodes[0].recipientOffer.y = h('invalid-point'); },
    c => { c.nodes[0].recipientOffer.value = String(1n << 64n); },
    c => { c.nodes.forEach(n => { n.recipientOffer.value = String((1n << 64n) - 1n); }); },
    c => { c.nodes[0].actionTemplate.amount = String(1n << 128n); },
    c => { c.nodes[0].actionTemplate.executionUntil = '501'; },
    c => { c.nodes[0].actionTemplate.custodyKind = 2; },
    c => { c.fundingValidUntil = c.fundingNotBefore; },
    c => { c.scope = '0x' + c.scope; },
    c => { delete c.nodes[1]; },
    c => { Object.defineProperty(c, 'hidden', { value: 'forbidden' }); },
  ];
  for (const mutate of mutations) {
    const changed = copy(config);
    mutate(changed);
    assert.throws(() => createGenericBalanceNativePreparation(changed));
  }
  let called = false;
  const accessor = copy(config);
  Object.defineProperty(accessor.nodes[0].actionTemplate, 'amount', {
    enumerable: true, get() { called = true; return '1'; },
  });
  assert.throws(() => createGenericBalanceNativePreparation(accessor));
  assert.equal(called, false);
});

test('scoped invoice conversion rejects mismatched custody signing bytes, recipients, slots and count', () => {
  const prepared = prepareFor(fixture());
  for (const mutate of [
    r => { r[0].message = r[1].message; },
    r => { r[0].message = r[0].message.toUpperCase(); },
    r => { r[0].x = r[1].x; },
    r => { r[0].slot = 1; },
    r => { r[0].id = r[1].id; },
    r => { r.pop(); },
    r => { r[0].sourceNote = {}; },
  ]) {
    const requests = copy(prepared.custodyRequests);
    mutate(requests);
    assert.throws(() => genericBalanceNativeInvoiceRequests(prepared.preparation, requests));
  }
});

test('a different valid funded graph cannot replace the A0 pinned by current custody', () => {
  const f = fixture();
  const prepared = prepareFor(f);
  for (const overrides of [
    { graphNonce: h('other-graph') },
    { inputNote: note(f.sourceKey, '100', 'other-source') },
    { reservationNonce: h('other-reservation') },
  ]) {
    const other = signFor(f, compileFor(f, prepared.preparation, overrides));
    assert.throws(() => finish({ ...prepared, signed: other.signed }), /A0_BINDING/);
  }
  assert.throws(() => prepareGenericBalanceNativeCapsules({ preparation: prepared.preparation, signed: prepared.signed }));
});

test('reconstruction rejects validly signed alternate graph edges, payouts, domains and action terms', () => {
  const f = fixture();
  const prepared = prepareFor(f);
  const terms = genericBalanceNativeTerms(prepared.preparation);
  const changedNodes = change => {
    const nodes = copy(terms.nodes);
    change(nodes);
    return { nodes };
  };
  for (const overrides of [
    { operationId: h('other-operation') },
    { scope: h('other-scope') },
    { policy: h('other-policy') },
    { asset: h('other-asset') },
    { settleBefore: '501' },
    changedNodes(nodes => { nodes[2].dependsOn = ['leg-0']; }),
    changedNodes(nodes => { nodes[0].payout.secret = h('other-payout'); }),
    changedNodes(nodes => { nodes[0].chainDomain = h('other-chain'); }),
    changedNodes(nodes => { nodes[0].evidencePolicy = h('other-evidence'); }),
    changedNodes(nodes => { nodes[0].actionCommitment = h('other-action'); }),
  ]) {
    const other = signFor(f, compileFor(f, prepared.preparation, overrides));
    assert.throws(() => finish({ ...prepared, signed: other.signed, authorizationWords: other.authorizationWords }),
      /FUNDED_BINDING/);
  }
});

test('reconstruction rejects self-inconsistent note openings even with genuine statement signatures', () => {
  const f = fixture();
  const prepared = prepareFor(f);
  for (const mutate of [
    s => { s.ownerWitness.inputNote.secret = h('other-source-secret'); },
    s => { s.ownerWitness.changeNote.secret = h('other-change-secret'); },
    s => { s.ownerWitness.recoveryNote.secret = h('other-recovery-secret'); },
    s => { s.ownerWitness.payouts[0].secret = h('other-recipient-secret'); },
    s => { s.ownerWitness.paddingSalts[0] = h('noncanonical-active-padding'); },
    s => { s.admissionTag = h('other-admission'); },
    s => { s.ownerWitness.budget = '74'; },
  ]) {
    const signed = copy(prepared.signed);
    mutate(signed);
    assert.throws(() => finish({ ...prepared, signed }), /FUNDED_BINDING/);
  }
  const signed = copy(prepared.signed);
  signed.authorizationStatement.inputCommitment = h('invented-source-commitment');
  signed.signatures.ownerSignature = hex(signature(f.sourceKey, ownerAuthorizationMessage(signed.authorizationStatement)));
  signed.signatures.invoiceSignatures = signed.ownerWitness.graph.nodes.map((node, slot) =>
    hex(signature(f.recipients[slot], payoutInvoiceMessage(signed.authorizationStatement, node, slot))));
  signed.signatures.invoiceSignatures.push('0'.repeat(128));
  assert.throws(() => finish({ ...prepared, signed,
    authorizationWords: fundedAuthorizationWords(signed.authorizationStatement) }), /FUNDED_BINDING/);
});

test('owner and all recipient signatures remain mandatory, including canonical inactive slots', () => {
  const prepared = prepareFor(fixture());
  for (const mutate of [
    s => { s.signatures.ownerSignature = 'ab'.repeat(64); },
    s => { s.signatures.invoiceSignatures[0] = 'ab'.repeat(64); },
    s => { s.signatures.invoiceSignatures.reverse(); },
    s => { s.signatures.invoiceSignatures[3] = 'ab'.repeat(64); },
    s => { s.signatures.invoiceSignatures.pop(); },
  ]) {
    const signed = copy(prepared.signed);
    mutate(signed);
    assert.throws(() => finish({ ...prepared, signed }), /PAEG_CAPSULE/);
  }
});

test('recursive input conversion binds exact A0 words without claiming the placeholder fields are proofs', () => {
  const prepared = prepareFor(fixture());
  const result = finish(prepared);
  // Deliberately invalid proof/key material: exercising only the host codec.
  const codecOnlyA0 = {
    publicInputs: prepared.authorizationWords,
    proofFields: Array(458).fill('0'),
    vkFields: Array(115).fill('0'),
  };
  const inputs = result.capsules.ownerAuthorizationInputs(codecOnlyA0);
  assert.deepEqual(inputs.owner_inputs, prepared.authorizationWords);
  assert.equal(inputs.witness.local_capsules.length, 4);
  assert.equal(inputs.witness.dependency_capsules.length, 4);
  const other = copy(codecOnlyA0);
  other.publicInputs[0] = String(BigInt(other.publicInputs[0]) + 1n);
  assert.throws(() => result.capsules.ownerAuthorizationInputs(other), /A0_STATEMENT/);
});
