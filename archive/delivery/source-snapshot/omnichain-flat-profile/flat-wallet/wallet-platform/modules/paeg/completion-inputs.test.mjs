/** Read existing compiled ABIs only. Test hash is explicitly not Poseidon2;
 * this suite never loads Noir/ACVM/BB/WASM or executes circuit constraints. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { buildNodeInputs, buildSettlementInputs } from './completion-inputs.mjs';
import { createCommitmentCodec, ZERO } from './commitments.mjs';
import { buildSyntheticEnvelopeFixture } from '../../../integration/synthetic-envelope-fixture.mjs';
import { nativeReceiptCommitment } from '../../../../../omnichain-product/src/paeg/native-receipt.mjs';
import { terminalReceiptTag } from '../../../../src/framing.mjs';

const h = value => createHash('sha256').update(value).digest('hex');
const hashFields = async fields => '00' + h(fields.map(String).join(':')).slice(2);
const codec = createCommitmentCodec({ hashFields });
// These existing artifacts are read as data. Production loading/pinning is
// owned by the worker; the constructors receive that independently loaded ABI.
const nodeABI = JSON.parse(readFileSync(new URL('../../../../candidate-poseidon/.local/component/compiled/'
  + '29084da7f9d90365578b32a87e54b9e4ce165ae7e3701b803df250db738c4004/program.json', import.meta.url))).abi;
const settlementABI = JSON.parse(readFileSync(new URL('../../../.local/proof-workers/relations/settlement/'
  + 'f94b24a32eecca0a2866706198898fd8f520908efc045157613a5afefec63b2c/compiled/'
  + '637abfeb-d926-4718-9a5f-f357f145d631/program.json', import.meta.url))).abi;
const fixture = await buildSyntheticEnvelopeFixture({ hashFields });
const d = fixture.public.statements.authorization.domainCommitment;
const auth = fixture.public.authorization;
const authorization = { root: auth.root, index: auth.path.index, siblings: auth.path.siblings };
const receipts = fixture.scoped.local.slice(0, 2).map((packet, slot) => {
  const local = packet.local.value;
  return { hubDomain: packet.domain.hubDomain, registryCommitment: packet.domain.registryCommitment,
    scope: packet.domain.scope, policy: packet.domain.policy, globalEffectId: h('synthetic completion GID ' + slot),
    ...Object.fromEntries(['localCommitment', 'dispatchId', 'chainDomain', 'evidencePolicy', 'actionCommitment',
      'payoutCommitment', 'receiptKeyCommitment', 'receiptRho'].map(name => [name, local[name]])),
    validFrom: slot ? '1250' : '1150', validUntil: slot ? '1550' : '1450' };
});
const receiptLeaves = await Promise.all(receipts.map(receipt => codec.receiptLeaf(d, nativeReceiptCommitment(receipt))));
const tree = await codec.buildTree(d, 2, receiptLeaves);
const revokedEntries = Array(64).fill(ZERO);
const stateOpening = { hubDomain: fixture.public.domain.hubDomain, registryCommitment: fixture.public.domain.registryCommitment,
  receiptRoot: tree.root, receiptCount: '2', revokedDigest: await codec.revokedDigest(d, fixture.public.domain.hubDomain, revokedEntries, '0'),
  revokedCount: '0', revocationSequence: '0' };
const evidenceState = await codec.evidenceStateDigest(d, stateOpening);
const nodeRaw = slot => {
  const path = slot < 2 ? tree.opening(slot) : null;
  return { packet: fixture.scoped.local[slot], authorization, stateOpening, evidenceState, revokedEntries,
    receiptOpening: slot < 2 ? receipts[slot] : null,
    receiptPath: path ? { root: tree.root, index: path.index, siblings: path.siblings } : null,
    validFrom: '1300', validUntil: '1350', completionBlind: h('completion blind ' + slot) };
};
const nodes = [];
for (let slot = 0; slot < 4; slot++) nodes.push(await buildNodeInputs(nodeRaw(slot), { hashFields, abi: nodeABI }));
const reserve = fixture.public.poolAfter;
const settlementRaw = () => ({ packet: fixture.scoped.assembler, authorization, evidenceState,
  reservePath: { root: reserve.root, index: reserve.reservePath.index, siblings: reserve.reservePath.siblings },
  completions: nodes.map(node => node.completionOpening), validFrom: '1300', validUntil: '1350' });

test('four N jobs validate against the actual frozen ABI with exact SHA tags and complete padding zeros', () => {
  for (let slot = 0; slot < 4; slot++) {
    const n = nodes[slot];
    assert.equal(n.expectedPublicInputs.length, 32);
    assert.equal(n.completionOpening.completion.slot, String(slot));
    assert.deepEqual(Object.keys(n.inputs), nodeABI.parameters.map(parameter => parameter.name));
    assert.deepEqual(Object.keys(n.completionOpening).sort(), ['blind', 'completion', 'envelope', 'statement']);
    const handoff = JSON.stringify(n.completionOpening);
    assert.doesNotMatch(handoff, /globalEffectId|receiptSpendSecret|receipt_spend_secret|own_receipt|predecessors|signerIdentity|"action"|"local"/);
    if (slot < 2) assert.equal(n.completionOpening.completion.terminalReceiptTag, terminalReceiptTag({
      ledgerNamespace: fixture.public.domain.ledgerNamespace, secret: fixture.scoped.local[slot].receiptSpendSecret,
      receiptCommitment: nativeReceiptCommitment(receipts[slot]) }));
    else {
      assert.ok(Object.values(n.inputs.own_receipt).every(value => Array.isArray(value)
        ? value.every(byte => byte === '0') : value === '0'));
      assert.ok(n.inputs.receipt_spend_secret.every(byte => byte === '0'));
      assert.ok(n.inputs.receipt_siblings.flat().every(byte => byte === '0'));
      assert.equal(n.inputs.receipt_index, '0');
      assert.equal(n.completionOpening.completion.terminalReceiptTag, fixture.scoped.local[slot].local.value.dummyTerminalTag);
    }
  }
});

test('T validates its actual ABI and receives only four sealed descriptors plus its assembler openings', async () => {
  const t = await buildSettlementInputs(settlementRaw(), { hashFields, abi: settlementABI });
  assert.equal(t.expectedPublicInputs.length, 138);
  assert.deepEqual(Object.keys(t.inputs), settlementABI.parameters.map(parameter => parameter.name));
  assert.deepEqual(t.statement.completionCommitments, nodes.map(node => node.statement.completionCommitment));
  assert.deepEqual(t.statement.outputs, fixture.scoped.assembler.settlement.value.outputs);
  assert.deepEqual(t.statement.terminalTags, nodes.map(node => node.completionOpening.completion.terminalReceiptTag));
  assert.doesNotMatch(JSON.stringify(t.inputs), /own_receipt|receipt_spend_secret|state_opening|local_commitment|dispatch_id|predecessors|action_commitment/);
  assert.ok(Object.isFrozen(t.inputs.completions[0]));
});

test('N rejects wrong local receipt, path, key, revoked GID, window and nonzero padding before a job is handed off', async () => {
  for (const change of [
    value => { value.receiptOpening.payoutCommitment = h('wrong payout'); },
    value => { value.receiptPath.index = 2; },
    value => { value.receiptPath.siblings[0] = ZERO; },
    value => { value.packet.receiptSpendSecret = h('wrong secret'); },
    value => { value.validUntil = '1451'; },
    value => { value.validFrom = '1300\n'; },
    value => { value.completionBlind = ZERO; },
  ]) {
    const changed = structuredClone(nodeRaw(0)); change(changed);
    await assert.rejects(buildNodeInputs(changed, { hashFields, abi: nodeABI }));
  }
  const revoked = structuredClone(nodeRaw(0)); revoked.revokedEntries[0] = receipts[0].globalEffectId;
  revoked.stateOpening.revokedCount = '1';
  revoked.stateOpening.revokedDigest = await codec.revokedDigest(d, fixture.public.domain.hubDomain, revoked.revokedEntries, '1');
  revoked.evidenceState = await codec.evidenceStateDigest(d, revoked.stateOpening);
  await assert.rejects(buildNodeInputs(revoked, { hashFields, abi: nodeABI }), /OWN_GID_REVOKED/);
  const padding = structuredClone(nodeRaw(2)); padding.receiptOpening = receipts[0];
  await assert.rejects(buildNodeInputs(padding, { hashFields, abi: nodeABI }), /PADDING_RECEIPT/);
  const wrongABI = structuredClone(nodeABI); wrongABI.parameters[0].type.length = 7;
  await assert.rejects(buildNodeInputs(nodeRaw(0), { hashFields, abi: wrongABI }), /PUBLIC_ABI/);
});

test('T rejects reordered seals, changed E/domain/root/state, duplicate tag, narrowed N window and wrong SHA reserve path', async () => {
  for (const change of [
    value => { [value.completions[0], value.completions[1]] = [value.completions[1], value.completions[0]]; },
    value => { value.completions[0].envelope = '0'.repeat(63) + '1'; },
    value => { value.completions[0].statement.domainCommitment = '0'.repeat(63) + '1'; },
    value => { value.completions[0].statement.authorizationRoot = '0'.repeat(63) + '1'; },
    value => { value.completions[0].statement.evidenceState = '0'.repeat(63) + '1'; },
    value => { value.completions[1].completion.terminalReceiptTag = value.completions[0].completion.terminalReceiptTag; },
    value => { value.completions[0].completion.validUntil = '1349'; },
    value => { value.reservePath.siblings[0] = ZERO; },
    value => { value.completions.pop(); },
    value => { value.completions[0].receipt = receipts[0]; },
  ]) {
    const changed = structuredClone(settlementRaw()); change(changed);
    await assert.rejects(buildSettlementInputs(changed, { hashFields, abi: settlementABI }));
  }
  fixture.destroy();
});
