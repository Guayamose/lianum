import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { canonicalNativeOwnerNodes, createNativeOwnerProcess, nativeOwnerPayoutNote,
  normalizeNativeOwnerPrepare, normalizeNativeOwnerAuthorize } from '../../../../src/execution/native/dispatch/native-owner.mjs';
import { compileFundedGraph, fundedSigningRequests, attachFundedSignatures } from '../../../../src/execution/graph/funded-graph.mjs';
import { nativeReceiptKeyCommitment, nativeTransferActionCommitment } from '../../../../src/execution/native/dispatch/native-capsules.mjs';
import { nativeDeliveryRiskCommitment, NATIVE_ADMISSION_LOSS_CLAUSE } from '../../../../src/execution/native/dispatch/native-admission.mjs';
import { nativeRecipientInvoiceRequest, nativeRecipientInvoiceMessage, nativeRecipientPayoutNote } from '../../../../src/execution/native/recipients/native-recipient-custody.mjs';
import { walletNoteCommitment } from '../../../../src/wallet/notes/private-wallet-note-encoding.mjs';
import { freshKey, signature } from '../../../../src/notes/private-note-encoding.mjs';
import { runGenericNativeOwnerWorker } from '../../../../../../scripts/protocol/proofs/generic-native-owner-worker.mjs';

const h = text => createHash('sha256').update('native owner pure fixture: ' + text).digest('hex');
const hx = bytes => Buffer.from(bytes).toString('hex');
const ZERO = '0'.repeat(64);
const copy = value => structuredClone(value);
function fixture(count = 3) {
  const recipients = Array.from({ length: count }, freshKey);
  return { recipients, config: { scope: h('scope'), policy: h('policy'), asset: h('asset'), hubDomain: h('hub'),
    registryCommitment: h('registry'), operationId: h('operation'), epoch: '10', fundingNotBefore: '100',
    fundingValidUntil: '200', settleBefore: '500', fundingAmount: String(count * 25),
    vault: { path: '/tmp/native-owner-pure-unused.vault', password: 'fixture-only-unused' },
    nodes: recipients.map((key, i) => ({ id: `leg-${i}`, dependsOn: i ? [`leg-${i - 1}`] : [], evidencePolicy: h('evidence:' + i),
      actionTemplate: { chainDomain: h('chain:' + i), signerIdentity: h('signer:' + i), sourceCommitment: h('source:' + i),
        destinationCommitment: h('destination:' + i), amount: String((1n << 90n) + BigInt(i)), custodyKind: 1,
        custodyCommitment: h('custody:' + i), executionFrom: '220', executionUntil: '450' },
      recipientOffer: { x: hx(key.x), y: hx(key.y), value: '25', secret: h('secret:' + i), randomness: h('random:' + i) } })).reverse() } };
}
const balance = (key, value, tag) => ({ type: 4, rho: h(tag + ':rho'), x: hx(key.x), y: hx(key.y), value, secret: h(tag + ':secret') });

test('owner accepts any bounded one-to-four-node native graph with canonical independent ordering', () => {
  for (const count of [1, 2, 3, 4]) {
    const { config } = fixture(count);
    const normalized = normalizeNativeOwnerPrepare(config);
    assert.notEqual(normalized, config);
    assert.deepEqual(canonicalNativeOwnerNodes(normalized.nodes).map(n => n.id), Array.from({ length: count }, (_, i) => `leg-${i}`));
    config.nodes[0].actionTemplate.amount = '1';
    assert.notEqual(normalized.nodes[0].actionTemplate.amount, '1');
    const first = normalized.nodes.find(node => node.id === 'leg-0');
    first.dependsOn = [];
    normalized.nodes.forEach(node => { node.dependsOn = []; });
    assert.deepEqual(canonicalNativeOwnerNodes(normalized.nodes).map(n => n.id), Array.from({ length: count }, (_, i) => `leg-${i}`));
  }
  // Existing graph codec sorts all nodes ready in one wave before reconsidering
  // children; a plain smallest-ready queue would incorrectly order a,b,z.
  assert.deepEqual(canonicalNativeOwnerNodes([{ id: 'z', dependsOn: [] }, { id: 'b', dependsOn: ['a'] }, { id: 'a', dependsOn: [] }])
    .map(node => node.id), ['a', 'z', 'b']);
});

test('exact owner input rejects private key injection, owner-supplied salts and action overrides', () => {
  const { config } = fixture();
  for (const mutate of [
    c => { c.sourceKey = 'forbidden'; }, c => { c.graphNonce = h('forbidden'); },
    c => { c.nodes[0].recipientOffer.privateKey = 'forbidden'; },
    c => { c.nodes[0].actionTemplate.receiptSpendSecret = h('forbidden'); },
    c => { c.nodes[0].actionTemplate.receiptRho = h('forbidden'); },
    c => { c.nodes[0].actionTemplate.deliveryRiskCommitment = h('forbidden'); },
    c => { c.nodes[0].actionTemplate.actionSalt = h('forbidden'); },
    c => { c.nodes[0].actionTemplate.settleBefore = '500'; },
    c => { c.nodes[0].operationId = h('forbidden'); },
    c => { c.nodes[0].payout = c.nodes[0].recipientOffer; },
  ]) { const changed = copy(config); mutate(changed); assert.throws(() => normalizeNativeOwnerPrepare(changed), /PAEG_NATIVE_OWNER_EXACT_FIELDS/); }
});

test('owner fails closed on graph, economic, deadline, encoding and Vault boundaries', () => {
  const { config } = fixture();
  const changes = [
    c => { c.nodes = []; }, c => { c.nodes.push(copy(c.nodes[0]), copy(c.nodes[0])); },
    c => { c.nodes[0].id = c.nodes[1].id; }, c => { c.nodes[0].dependsOn = [c.nodes[0].id]; },
    c => { c.nodes[0].dependsOn = ['absent']; }, c => { c.nodes[0].dependsOn = ['leg-0', 'leg-0']; },
    c => { c.nodes.find(n => n.id === 'leg-0').dependsOn = ['leg-2']; },
    c => { c.nodes[0].id += '\n'; }, c => { c.nodes[0].id = 'x'.repeat(65); },
    c => { c.fundingAmount = '74'; }, c => { c.fundingAmount = String(1n << 64n); },
    c => { c.fundingAmount = '075'; }, c => { c.nodes[0].recipientOffer.value = '0'; },
    c => { c.fundingNotBefore = c.fundingValidUntil; }, c => { c.fundingValidUntil = '501'; },
    c => { c.nodes[0].actionTemplate.executionUntil = '501'; },
    c => { c.nodes[0].actionTemplate.executionFrom = '450'; },
    c => { c.nodes[0].actionTemplate.amount = String(1n << 128n); },
    c => { c.nodes[0].actionTemplate.custodyKind = '1'; },
    c => { c.nodes[0].recipientOffer.x = ZERO; },
    c => { c.nodes[0].recipientOffer.y = h('not-a-valid-point'); },
    c => { c.scope += '\n'; }, c => { c.scope = '0x' + c.scope; },
    c => { c.vault.path = 'relative.vault'; }, c => { c.vault.path = '/tmp/with\0null'; },
    c => { c.vault.password = ''; }, c => { c.vault.password = 'x'.repeat(1025); },
  ];
  for (const mutate of changes) { const changed = copy(config); mutate(changed); assert.throws(() => normalizeNativeOwnerPrepare(changed), /PAEG_NATIVE_OWNER/); }
  for (const target of ['config', 'nodes', 'node', 'action', 'offer', 'vault']) {
    const changed = copy(config);
    const value = ({ config: changed, nodes: changed.nodes, node: changed.nodes[0], action: changed.nodes[0].actionTemplate,
      offer: changed.nodes[0].recipientOffer, vault: changed.vault })[target];
    Object.defineProperty(value, 'hidden', { value: 'injection', enumerable: false });
    assert.throws(() => normalizeNativeOwnerPrepare(changed), /PAEG_NATIVE_OWNER/);
  }
  let called = false;
  const getter = copy(config);
  Object.defineProperty(getter.nodes[0].actionTemplate, 'amount', { enumerable: true, get() { called = true; return '1'; } });
  assert.throws(() => normalizeNativeOwnerPrepare(getter), /PAEG_NATIVE_OWNER/); assert.equal(called, false);
  const sparse = copy(config); delete sparse.nodes[1]; assert.throws(() => normalizeNativeOwnerPrepare(sparse), /PAEG_NATIVE_OWNER_ARRAY/);
});

test('payout rho and fixed risk quote match recipient and funded codecs for one-to-four nodes', () => {
  for (const count of [1, 2, 3, 4]) {
    const { config, recipients } = fixture(count), normalized = normalizeNativeOwnerPrepare(config);
    const sourceKey = freshKey(), recoveryKey = freshKey();
    const ordered = canonicalNativeOwnerNodes(normalized.nodes), actions = [], invoices = [];
    for (const [slot, node] of ordered.entries()) {
      const terms = { ...Object.fromEntries(['scope', 'policy', 'asset', 'hubDomain', 'registryCommitment', 'operationId', 'settleBefore']
        .map(key => [key, normalized[key]])), slot, evidencePolicy: node.evidencePolicy, value: node.recipientOffer.value,
      actionTemplate: { ...node.actionTemplate, settleBefore: config.settleBefore } };
      const payout = nativeOwnerPayoutNote(normalized, node.recipientOffer, slot);
      assert.deepEqual(payout, nativeRecipientPayoutNote(terms, node.recipientOffer));
      const payoutCommitment = walletNoteCommitment(config.scope, config.policy, payout).toString('hex'), riskSalt = h('risk:' + slot);
      const action = { ...terms.actionTemplate, receiptKeyCommitment: nativeReceiptKeyCommitment(config.hubDomain, h('nk:' + slot)),
        receiptRho: h('receipt-rho:' + slot), actionSalt: h('action:' + slot),
        deliveryRiskCommitment: nativeDeliveryRiskCommitment({ clause: NATIVE_ADMISSION_LOSS_CLAUSE,
          hubDomain: config.hubDomain, registryCommitment: config.registryCommitment,
          chainDomain: node.actionTemplate.chainDomain, sourceCommitment: node.actionTemplate.sourceCommitment,
          destinationCommitment: node.actionTemplate.destinationCommitment, amount: node.actionTemplate.amount,
          scope: config.scope, policy: config.policy, asset: config.asset, payoutCommitment, settleBefore: config.settleBefore, salt: riskSalt }) };
      actions.push(action);
      invoices.push(nativeRecipientInvoiceRequest(terms, node.recipientOffer, { action, deliveryRiskSalt: riskSalt }));
      assert.throws(() => nativeRecipientInvoiceRequest(terms, node.recipientOffer, { action, deliveryRiskSalt: h('wrong') }), /PAEG_RECIPIENT_DELIVERY_RISK/);
    }
    const compiled = compileFundedGraph({ ...Object.fromEntries(['scope', 'policy', 'asset', 'operationId', 'fundingNotBefore', 'fundingValidUntil', 'settleBefore']
      .map(key => [key, config[key]])), budget: config.fundingAmount,
    reservationNonce: h('reservation'), reserveSecret: h('reserve'), graphNonce: h('graph'),
    inputNote: balance(sourceKey, config.fundingAmount, 'source'), recoveryNote: balance(recoveryKey, config.fundingAmount, 'recovery'),
    changeNote: { type: 4, rho: ZERO, x: ZERO, y: ZERO, value: '0', secret: ZERO },
    nodes: ordered.map((node, slot) => ({ id: node.id, dependsOn: node.dependsOn, chainDomain: node.actionTemplate.chainDomain,
      evidencePolicy: node.evidencePolicy, actionCommitment: nativeTransferActionCommitment(actions[slot]), payout: node.recipientOffer })),
    paddingSalts: Array.from({ length: 4 }, (_, slot) => h('padding:' + slot)) });
    const requests = fundedSigningRequests(compiled);
    const invoiceSignatures = requests.invoices.map((request, slot) => {
      assert.equal(request.id, ordered[slot].id);
      assert.deepEqual(request.message, nativeRecipientInvoiceMessage(invoices[slot]));
      assert.equal(compiled.authorizationStatement.outputs[slot], invoices[slot].payoutCommitment);
      assert.equal(compiled.ownerWitness.payouts[slot].rho, invoices[slot].rho);
      return hx(signature(recipients[Number(request.id.slice(4))], request.message));
    });
    const signed = attachFundedSignatures(compiled, { ownerSignature: hx(signature(sourceKey, requests.owner.message)), invoiceSignatures });
    assert.equal(signed.ownerWitness.graph.activeCount, count);
    assert.deepEqual(signed.ownerWitness.changeNote, { type: 4, rho: ZERO, x: ZERO, y: ZERO, value: '0', secret: ZERO });
  }
});

test('authorize accepts only bounded detached signatures, and owner never starts for invalid sequencing', async () => {
  assert.deepEqual(normalizeNativeOwnerAuthorize({ invoiceSignatures: ['ab'.repeat(64)] }), { invoiceSignatures: ['ab'.repeat(64)] });
  for (const input of [{ invoiceSignatures: [] }, { invoiceSignatures: Array(5).fill('ab'.repeat(64)) },
    { invoiceSignatures: ['ab'.repeat(64) + '\n'] }, { invoiceSignatures: ['AB'.repeat(64)] },
    { invoiceSignatures: ['ab'.repeat(64)], privateKey: 'forbidden' }]) assert.throws(() => normalizeNativeOwnerAuthorize(input), /PAEG_NATIVE_OWNER/);
  const owner = createNativeOwnerProcess();
  await assert.rejects(owner.authorize({ invoiceSignatures: ['ab'.repeat(64)] }), /PAEG_NATIVE_OWNER_NOT_READY/);
  assert.equal(owner.report().started, false);
  assert.deepEqual(await owner.close(), { closed: true, exited: true, started: false });
  await assert.rejects(owner.prepare(fixture(1).config), /PAEG_NATIVE_OWNER_PREPARE_ONCE/);
  assert.throws(() => createNativeOwnerProcess({ worker: '/tmp/untrusted' }), /PAEG_NATIVE_OWNER_NO_CONFIGURATION/);
  await assert.rejects(runGenericNativeOwnerWorker(), /PAEG_NATIVE_OWNER_PRIVATE_IPC_REQUIRED/);
});
