import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { prepareNativeReady, NATIVE_READY_PUBLIC_INPUT_COUNT } from '../../../../src/execution/native/dispatch/native-ready.mjs';
import { prepareNativeNode, NATIVE_NODE_PUBLIC_INPUT_COUNT } from '../../../../src/execution/native/dispatch/native-node.mjs';
import { prepareNativeCapsules, nativeTransferActionCommitment, capsuleAuthorizationWords,
  localCapsuleCommitment } from '../../../../src/execution/native/dispatch/native-capsules.mjs';
import { nativeReceiptKeyCommitment, nativeReceiptCommitment, nativeReceiptNullifier,
  RECEIPT_HASH_FIELDS } from '../../../../src/execution/native/state/native-receipt.mjs';
import { prepareNativeDependency } from '../../../../src/execution/native/dispatch/native-dependency.mjs';
import { compileFundedGraph, fundedSigningRequests, attachFundedSignatures } from '../../../../src/execution/graph/funded-graph.mjs';
import { freshKey, signature } from '../../../../src/notes/private-note-encoding.mjs';
import { PrivateNoteTree } from '../../../../src/notes/private-note-tree.mjs';
import { boundedListDigest, snapshotDigest, evidenceStateDigest, nativeDigestWords } from '../../../../src/execution/native/state/native-state.mjs';
import { NATIVE_PROFILES } from '../../../../../../experiments/engine/private-core-proof/generic-native/pin-key.mjs';

// Host schema and byte-binding tests only. Recursive fields below are deliberately
// synthetic and unverified. No compiler, prover, chain runtime or native admission
// runs here, and a successful composition is never called proof acceptance.
const ZERO = '0'.repeat(64), prefixedZero = `0x${ZERO}`;
const h = value => createHash('sha256').update(`R98/N51 host fixture: ${value}`).digest('hex');
const hx = value => Buffer.from(value).toString('hex');
const copy = value => structuredClone(value);
const fieldsOnly = publicInputs => ({ publicInputs: [...publicInputs], proofFields: Array(458).fill('1'), vkFields: Array(115).fill('2') });
const words = value => nativeDigestWords(`0x${value}`);
const replaceDigest = (values, offset, value) => values.splice(offset, 8, ...words(value));
const note = (key, value, label) => ({ type: 4, rho: h(`${label}:rho`), x: hx(key.x), y: hx(key.y), value: String(value), secret: h(`${label}:secret`) });
const readyPublic = ['scope', 'policy', 'asset', 'hub_domain', 'registry_commitment', 'snapshot_digest',
  'local_commitment', 'dispatch_id', 'chain_domain', 'evidence_policy', 'action_commitment', 'payout_commitment', 'ready_from', 'ready_until'];
const nodePublic = ['hub_domain', 'registry_commitment', 'evidence_state', 'context', 'payout_commitment',
  'terminal_receipt_tag', 'slot', 'valid_from', 'valid_until'];

function fixture(count = 2, { from = '200', until = '300', timestamp = '250', cutoff = '500', executionFrom = '100', executionUntil = '400' } = {}) {
  const hub = h('hub'), registry = h('registry'), owner = freshKey(), change = freshKey(), recovery = freshKey();
  const payoutKeys = Array.from({ length: count }, () => freshKey());
  const nodes = Array.from({ length: count }, (_, i) => ({ id: `node-${i}`, receiptSpendSecret: h(`nk:${i}`),
    action: { chainDomain: h(`chain:${i}`), signerIdentity: h(`signer:${i}`), sourceCommitment: h(`source:${i}`),
      destinationCommitment: h(`destination:${i}`), amount: String((1n << 80n) + BigInt(i + 1)), custodyKind: 1,
      custodyCommitment: h(`custody:${i}`), executionFrom, executionUntil, settleBefore: cutoff,
      receiptKeyCommitment: nativeReceiptKeyCommitment(hub, h(`nk:${i}`)), receiptRho: h(`rho:${i}`),
      deliveryRiskCommitment: h(`risk:${i}`), actionSalt: h(`action:${i}`) } }));
  const compiled = compileFundedGraph({ scope: h('scope'), policy: h('policy'), asset: h('asset'), operationId: h('operation'),
    budget: String(count * 25), fundingNotBefore: executionFrom, fundingValidUntil: until, settleBefore: cutoff,
    reservationNonce: h('reservation'), reserveSecret: h('reserve-secret'), graphNonce: h('graph-nonce'),
    inputNote: note(owner, count * 25 + 7, 'input'), changeNote: note(change, 7, 'change'), recoveryNote: note(recovery, count * 25, 'recovery'),
    nodes: nodes.map((node, i) => ({ id: node.id, chainDomain: node.action.chainDomain, evidencePolicy: h(`evidence:${i}`),
      actionCommitment: nativeTransferActionCommitment(node.action), dependsOn: i ? [`node-${i - 1}`] : [],
      payout: { x: hx(payoutKeys[i].x), y: hx(payoutKeys[i].y), value: '25', secret: h(`payout-secret:${i}`), randomness: h(`payout-randomness:${i}`) } })),
    paddingSalts: Array.from({ length: 4 }, (_, i) => h(`padding:${i}`)),
  });
  const signing = fundedSigningRequests(compiled);
  const signed = attachFundedSignatures(compiled, { ownerSignature: hx(signature(owner, signing.owner.message)),
    invoiceSignatures: signing.invoices.map(request => hx(signature(payoutKeys[request.slot], request.message))) });
  const capsules = prepareNativeCapsules({ signed, hubDomain: hub, registryCommitment: registry, nodes,
    slotSalts: Array.from({ length: 4 }, (_, i) => ({ targetSalt: h(`target:${i}`), localCapsuleSalt: h(`local-salt:${i}`), dependencyCapsuleSalt: h(`dependency-salt:${i}`) })) });
  const openings = nodes.map((_, i) => {
    const packet = capsules.nodeRole(i), local = packet.localCapsule;
    return { hubDomain: hub, registryCommitment: registry, globalEffectId: h(`gid:${i}`), scope: packet.scope, policy: packet.policy,
      ...Object.fromEntries(['localCommitment', 'dispatchId', 'chainDomain', 'evidencePolicy', 'actionCommitment', 'payoutCommitment',
        'receiptKeyCommitment', 'receiptRho'].map(field => [field, local[field]])), validFrom: executionFrom, validUntil: executionUntil };
  });
  const receiptTree = new PrivateNoteTree([h('unrelated-receipt'), ...openings.map(nativeReceiptCommitment)]);
  const reserveTree = new PrivateNoteTree([h('unrelated-reserve'), capsules.statement.reserveCommitment]);
  const revokedEntries = [`0x${h('unrelated-revoked')}`], poolSpentEntries = [`0x${h('unrelated-spent')}`];
  const state = { hubDomain: `0x${hub}`, registryCommitment: `0x${registry}`, receiptRoot: receiptTree.root,
    receiptCount: String(receiptTree.leafCount), revokedDigest: boundedListDigest(0x32, `0x${hub}`, revokedEntries),
    revokedCount: '1', revocationSequence: '7' };
  const snapshot = { ...state, pool: `0x${'12'.repeat(20)}`, scope: `0x${capsules.statement.scope}`, policy: `0x${capsules.statement.policy}`,
    assetIdentity: `0x${capsules.statement.asset}`, poolRoot: reserveTree.root,
    poolSpentDigest: boundedListDigest(0x02, `0x${capsules.statement.scope}`, poolSpentEntries), poolSpentCount: '1', poolStateSequence: '4',
    spentTagDigest: boundedListDigest(0x31, `0x${hub}`, []), spentTagCount: '0', spentTagSequence: '5',
    hubStateSequence: '8', registryEpoch: '9', halt: '0', timestamp };
  const path = (tree, i) => ({ index: String(i), siblings: tree.path(i).siblings });
  const c = () => fieldsOnly(capsuleAuthorizationWords(capsules.statement));
  return {
    ready(slot = count - 1) {
      const packet = capsules.readyRole(slot), dependencyPacket = capsules.dependencyRole(slot);
      const dependency = prepareNativeDependency({ packet: dependencyPacket, snapshot, snapshotDigest: snapshotDigest(snapshot),
        receipts: dependencyPacket.dependencyCapsule.predecessors.slice(0, dependencyPacket.dependencyCapsule.dependencyCount)
          .map(source => ({ sourceSlot: source.sourceSlot, opening: openings[source.sourceSlot], path: path(receiptTree, source.sourceSlot + 1) })),
        revokedEntries, validFrom: from, validUntil: until });
      return copy({ packet, capsuleProof: c(), dependencyProof: fieldsOnly(dependency.expectedPublicInputs), snapshot,
        snapshotDigest: snapshotDigest(snapshot), reservePath: path(reserveTree, 1), poolSpentEntries, readyFrom: from, readyUntil: until });
    },
    node(slot = 0) {
      return copy({ packet: capsules.nodeRole(slot), capsuleProof: c(), evidenceState: state, evidenceStateDigest: evidenceStateDigest(state),
        receipt: slot < count ? { opening: openings[slot], path: path(receiptTree, slot + 1) } : null,
        revokedEntries, validFrom: from, validUntil: until });
    },
  };
}
const base = fixture();
const ready = () => base.ready(), node = () => base.node(), padding = () => base.node(3);
const rebindSnapshot = input => { input.snapshotDigest = snapshotDigest(input.snapshot); replaceDigest(input.dependencyProof.publicInputs, 40, input.snapshotDigest.slice(2)); };
const rebindState = input => { input.evidenceStateDigest = evidenceStateDigest(input.evidenceState); };
const rebindLocal = input => { input.packet.localCapsuleCommitment = localCapsuleCommitment(input.packet, input.packet.localCapsule); };

test('R98 and N51 compose actual role packets in the current source and pin ABI order', () => {
  for (const [mode, input, compose, names, count] of [
    ['ready', ready(), prepareNativeReady, readyPublic, NATIVE_READY_PUBLIC_INPUT_COUNT],
    ['node', node(), prepareNativeNode, nodePublic, NATIVE_NODE_PUBLIC_INPUT_COUNT],
    ['node', padding(), prepareNativeNode, nodePublic, NATIVE_NODE_PUBLIC_INPUT_COUNT],
  ]) {
    const before = copy(input), result = compose(input);
    const main = readFileSync(new URL(`../../../../../../experiments/engine/private-core-proof/generic-native/circuits/${mode}/src/main.nr`, import.meta.url), 'utf8');
    const signature = main.split('fn main(')[1].split(') {')[0];
    const parameters = [...signature.matchAll(/^\s+(\w+): (.+),$/gm)].map(match => match[1]);
    assert.deepEqual(Object.keys(result.inputs), parameters);
    assert.deepEqual(NATIVE_PROFILES[mode].parameters.map(parameter => parameter.name), names);
    assert.equal(count, NATIVE_PROFILES[mode].words);
    assert.equal(result.expectedPublicInputs.length, count);
    assert.deepEqual(result.expectedPublicInputs, names.flatMap(name => result.inputs[name]));
    assert.ok(result.expectedPublicInputs.every(value => typeof value === 'string' && /^(0|[1-9][0-9]*)$/.test(value)));
    assert.equal(result.inputs.capsule_proof.length, 458);
    assert.equal(result.inputs.capsule_inputs.length, 129);
    assert.deepEqual(input, before);
    result.inputs.capsule_proof[0] = '9'; result.inputs.local.capsule_salt[0] ^= 1;
    result.inputs[mode === 'ready' ? 'snapshot' : 'state_opening'].hub_domain[0] ^= 1;
    assert.deepEqual(input, before);
  }
});

test('active Node produces the bound secret-derived receipt tag; padding is wholly canonical', () => {
  const active = node(), result = prepareNativeNode(active);
  assert.deepEqual(result.inputs.terminal_receipt_tag, words(nativeReceiptNullifier(active.receipt.opening, active.packet.receiptSpendSecret)));
  assert.equal(result.inputs.receipt_index, '1');
  const input = padding(), dummy = prepareNativeNode(input);
  assert.equal(dummy.inputs.slot, '3');
  assert.deepEqual(dummy.inputs.terminal_receipt_tag, words(input.packet.localCapsule.dummyTerminalTag));
  for (const [field, value] of Object.entries(dummy.inputs.own_receipt)) {
    assert.deepEqual(value, ['valid_from', 'valid_until'].includes(field) ? '0' : Array(32).fill(0));
  }
  assert.deepEqual(dummy.inputs.receipt_spend_secret, Array(32).fill(0));
  assert.deepEqual(dummy.inputs.receipt_siblings, Array.from({ length: 6 }, () => Array(32).fill(0)));
  assert.equal(dummy.inputs.receipt_index, '0');
  assert.equal(dummy.inputs.revoked_entries.length, 64);
  assert.equal(prepareNativeReady(ready()).inputs.pool_spent_entries.length, 64);
});

test('one through four active obligations preserve all fixed C-selected Node slots', () => {
  for (const count of [1, 2, 3, 4]) {
    const value = fixture(count);
    for (let slot = 0; slot < 4; slot++) {
      const result = prepareNativeNode(value.node(slot));
      assert.equal(result.inputs.local.active, slot < count);
      assert.equal(result.inputs.slot, String(slot));
    }
    assert.equal(prepareNativeReady(value.ready()).expectedPublicInputs.length, 98);
  }
});

test('scoped schemas reject graphs, predecessor data, flags, keys and unknown fields at every boundary', () => {
  for (const [make, compose, selectors] of [
    [ready, prepareNativeReady, [x => x, x => x.packet, x => x.packet.localCapsule, x => x.packet.action,
      x => x.capsuleProof, x => x.dependencyProof, x => x.snapshot, x => x.reservePath]],
    [node, prepareNativeNode, [x => x, x => x.packet, x => x.packet.localCapsule, x => x.packet.action,
      x => x.capsuleProof, x => x.evidenceState, x => x.receipt, x => x.receipt.opening, x => x.receipt.path]],
  ]) {
    for (const field of ['graph', 'ownerWitness', 'predecessors', 'predecessorReceipts', 'dependencyCapsule', 'nk', 'signingKey', 'verified', 'unknown']) {
      for (const select of selectors) {
        const input = make(); select(input)[field] = h('extra');
        assert.throws(() => compose(input), /FIELDS/, field);
      }
    }
  }
  for (const select of [x => x, x => x.packet, x => x.packet.localCapsule, x => x.packet.action, x => x.snapshot, x => x.capsuleProof]) {
    const input = ready(); select(input).receiptSpendSecret = h('private');
    assert.throws(() => prepareNativeReady(input), /FIELDS/);
  }
  const serialized = JSON.stringify(prepareNativeReady(ready()));
  assert.doesNotMatch(serialized, /predecessor|receipt_spend_secret|ownerWitness|graph_nonce|node_ids|dependency_counts|verified/);
  assert.doesNotMatch(JSON.stringify(prepareNativeNode(node())), /predecessor|ownerWitness|graph_nonce|node_ids|dependency_counts|"action"|verified/);
});

test('hidden fields, symbols, accessors and prototypes cannot bypass object schemas', () => {
  for (const [make, compose, selectors] of [
    [ready, prepareNativeReady, [x => x, x => x.packet, x => x.packet.localCapsule, x => x.packet.action, x => x.capsuleProof,
      x => x.dependencyProof, x => x.snapshot, x => x.reservePath]],
    [node, prepareNativeNode, [x => x, x => x.packet, x => x.packet.localCapsule, x => x.packet.action, x => x.capsuleProof,
      x => x.evidenceState, x => x.receipt, x => x.receipt.opening, x => x.receipt.path]],
  ]) {
    for (const select of selectors) for (const kind of ['hidden', 'symbol', 'accessor', 'prototype']) {
      const input = make(), object = select(input);
      if (kind === 'hidden') Object.defineProperty(object, 'hidden', { value: h('hidden') });
      if (kind === 'symbol') object[Symbol('hidden')] = h('hidden');
      if (kind === 'accessor') Object.defineProperty(object, Object.keys(object)[0], { get() { throw new Error('accessor ran'); }, enumerable: true });
      if (kind === 'prototype') Object.setPrototypeOf(object, { hidden: h('hidden') });
      assert.throws(() => compose(input), /FIELDS/, kind);
    }
  }
});

test('recursive packages require exact dense decimal fields and ABI width bounds', () => {
  for (const [make, compose, selectProof] of [
    [ready, prepareNativeReady, x => x.capsuleProof], [ready, prepareNativeReady, x => x.dependencyProof], [node, prepareNativeNode, x => x.capsuleProof],
  ]) {
    for (const field of ['publicInputs', 'proofFields', 'vkFields']) {
      for (const value of ['01', '0x1', '1e2', '-1', 1, 1n, String(1n << 254n)]) {
        const input = make(); selectProof(input)[field][0] = value;
        assert.throws(() => compose(input), /INTEGER|RANGE/);
      }
      for (const kind of ['sparse', 'short', 'long', 'hidden', 'symbol', 'accessor', 'prototype']) {
        const input = make(), array = selectProof(input)[field];
        if (kind === 'sparse') delete array[0];
        if (kind === 'short') array.pop();
        if (kind === 'long') array.push('1');
        if (kind === 'hidden') Object.defineProperty(array, 'nk', { value: h('hidden') });
        if (kind === 'symbol') array[Symbol('hidden')] = h('hidden');
        if (kind === 'accessor') Object.defineProperty(array, '0', { get() { throw new Error('accessor ran'); } });
        if (kind === 'prototype') Object.setPrototypeOf(array, Object.create(Array.prototype));
        assert.throws(() => compose(input), /ARRAY/, kind);
      }
    }
    for (const position of [0, selectProof(make()).publicInputs.length - 1]) {
      const input = make(), values = selectProof(input).publicInputs;
      values[position] = String(position ? 1n << 64n : 1n << 32n);
      assert.throws(() => compose(input), /RANGE/);
    }
  }
});

test('Ready binds every C context, selected local/dependency capsule, cutoff and P50 public word', () => {
  for (const offset of [0, 8, 16, 24, 32, 40, 64 + 8, 96 + 8]) {
    const input = ready(); replaceDigest(input.capsuleProof.publicInputs, offset, h(`changed:${offset}`));
    assert.throws(() => prepareNativeReady(input), /CAPSULE_(CONTEXT|LOCAL|DEPENDENCY)/);
  }
  const cutoff = ready(); cutoff.capsuleProof.publicInputs[128] = '501';
  assert.throws(() => prepareNativeReady(cutoff), /CAPSULE_CUTOFF/);
  for (let i = 0; i < 50; i++) {
    const input = ready(); input.dependencyProof.publicInputs[i] = String(BigInt(input.dependencyProof.publicInputs[i]) ^ 1n);
    assert.throws(() => prepareNativeReady(input), /DEPENDENCY_BINDING/);
  }
  for (const field of ['localCommitment', 'dispatchId', 'chainDomain', 'evidencePolicy', 'actionCommitment', 'payoutCommitment',
    'targetContext', 'receiptKeyCommitment', 'receiptRho', 'nodeCommitment', 'capsuleSalt']) {
    const input = ready(); input.packet.localCapsule[field] = h(`changed:${field}`);
    assert.throws(() => prepareNativeReady(input), /LOCAL_COMMITMENT/);
  }
  const rebound = ready(); rebound.packet.localCapsule.payoutCommitment = h('changed-payout'); rebindLocal(rebound);
  assert.throws(() => prepareNativeReady(rebound), /CAPSULE_LOCAL/);
  for (const field of ['amount', 'sourceCommitment', 'destinationCommitment', 'deliveryRiskCommitment']) {
    const input = ready(); input.packet.action[field] = field === 'amount' ? '26' : h(`changed:${field}`);
    assert.throws(() => prepareNativeReady(input), /ACTION_COMMITMENT/);
  }
});

test('Ready enforces reserve membership, scope-domain spent list, checkpoint identity and halt/time', () => {
  const changes = [
    x => { x.reservePath.index = '0'; }, x => { x.reservePath.index = '64'; },
    x => { x.reservePath.siblings[0] = `0x${h('wrong-path')}`; },
    x => { replaceDigest(x.capsuleProof.publicInputs, 48, h('other-reserve')); },
    x => { x.poolSpentEntries[0] = `0x${h('other-spent')}`; },
    x => { x.poolSpentEntries[0] = '0x' + x.capsuleProof.publicInputs.slice(56, 64).map(v => BigInt(v).toString(16).padStart(8, '0')).join('');
      x.snapshot.poolSpentDigest = boundedListDigest(0x02, x.snapshot.scope, x.poolSpentEntries); rebindSnapshot(x); },
    x => { x.snapshot.poolSpentDigest = boundedListDigest(0x02, x.snapshot.hubDomain, x.poolSpentEntries); rebindSnapshot(x); },
    ...['hubDomain', 'registryCommitment', 'scope', 'policy', 'assetIdentity'].map(field => x => { x.snapshot[field] = `0x${h(`other:${field}`)}`; rebindSnapshot(x); }),
    x => { x.snapshot.halt = '1'; rebindSnapshot(x); }, x => { x.snapshot.timestamp = '199'; rebindSnapshot(x); },
    x => { x.snapshot.timestamp = '300'; rebindSnapshot(x); }, x => { x.snapshot.hubStateSequence = '10'; },
  ];
  for (const change of changes) { const input = ready(); change(input); assert.throws(() => prepareNativeReady(input), /PAEG_/); }
});

test('Node binds every context, local capsule, receipt field, secret, membership and evidence revocation', () => {
  for (const offset of [0, 8, 16, 24, 32, 40, 64]) {
    const input = node(); replaceDigest(input.capsuleProof.publicInputs, offset, h(`changed:${offset}`));
    assert.throws(() => prepareNativeNode(input), /CAPSULE_(CONTEXT|LOCAL)/);
  }
  for (const field of [...RECEIPT_HASH_FIELDS, 'receiptKeyCommitment', 'receiptRho']) {
    const input = node(); input.receipt.opening[field] = h(`changed:${field}`);
    assert.throws(() => prepareNativeNode(input), /PAEG_|NATIVE_RECEIPT/);
  }
  for (const change of [
    x => { x.packet.receiptSpendSecret = h('wrong-secret'); },
    x => { x.receipt.path.index = '0'; }, x => { x.receipt.path.index = '64'; },
    x => { x.receipt.path.siblings[0] = `0x${h('wrong-path')}`; },
    x => { x.evidenceState.receiptCount = '1'; rebindState(x); },
    x => { x.evidenceState.receiptRoot = `0x${h('wrong-root')}`; rebindState(x); },
    x => { x.evidenceState.revocationSequence = '8'; },
    x => { x.revokedEntries[0] = `0x${x.receipt.opening.globalEffectId}`;
      x.evidenceState.revokedDigest = boundedListDigest(0x32, x.evidenceState.hubDomain, x.revokedEntries); rebindState(x); },
    x => { x.revokedEntries[0] = `0x${h('new-revoked')}`; },
    x => { x.packet.localCapsule.slot = 1; rebindLocal(x); },
    x => { x.packet.action.amount = '26'; }, x => { x.capsuleProof.publicInputs[128] = '501'; },
  ]) { const input = node(); change(input); assert.throws(() => prepareNativeNode(input), /PAEG_|NATIVE_RECEIPT/); }
});

test('padding cannot omit an active obligation, accept a receipt, or supply nonzero secret/native terms', () => {
  for (const change of [
    x => { x.packet.receiptSpendSecret = h('secret'); }, x => { x.packet.action = node().packet.action; },
    x => { x.receipt = node().receipt; }, x => { x.packet.localCapsule.receiptRho = h('rho'); },
    x => { x.packet.localCapsule.dummyTerminalTag = ZERO; },
    x => { x.packet.localCapsule.dummyTerminalTag = h('different-tag'); rebindLocal(x); },
  ]) { const input = padding(); change(input); assert.throws(() => prepareNativeNode(input), /PAEG_/); }
  const missing = node(); missing.receipt = null;
  assert.throws(() => prepareNativeNode(missing), /RECEIPT_FIELDS/);
  const forged = node(), dummy = padding().packet.localCapsule;
  forged.packet.localCapsule = { ...dummy, slot: 0 }; forged.packet.action = null; forged.packet.receiptSpendSecret = ZERO; forged.receipt = null;
  rebindLocal(forged);
  assert.throws(() => prepareNativeNode(forged), /CAPSULE_LOCAL/);
});

test('canonical hex, exact state paths, bounded lists and half-open times reject ambiguous inputs', () => {
  for (const [make, compose, path, entries, fromField, untilField] of [
    [ready, prepareNativeReady, x => x.reservePath, x => x.poolSpentEntries, 'readyFrom', 'readyUntil'],
    [node, prepareNativeNode, x => x.receipt.path, x => x.revokedEntries, 'validFrom', 'validUntil'],
  ]) {
    for (const value of [200, 200n, '0200', '2e2', '-1', '18446744073709551616']) {
      const input = make(); input[fromField] = value;
      assert.throws(() => compose(input), /PAEG_/);
    }
    for (const value of [prefixedZero.toUpperCase(), 'ab'.repeat(32), `0x${'ab'.repeat(31)}`, '0x' + 'AB'.repeat(32)]) {
      const input = make(); path(input).siblings[0] = value;
      assert.throws(() => compose(input), /HEX/);
    }
    for (const value of ['0x' + h('scope'), h('scope').toUpperCase(), ZERO]) {
      const input = make(); input.packet.scope = value;
      assert.throws(() => compose(input), /DIGEST/);
    }
    for (const value of ['200', '99', '501']) {
      const input = make(); input[untilField] = value;
      assert.throws(() => compose(input), /PAEG_/);
    }
    for (const select of [x => path(x).siblings, entries]) for (const kind of ['sparse', 'accessor', 'hidden', 'symbol']) {
      const input = make(), array = select(input);
      if (kind === 'sparse') delete array[0];
      if (kind === 'accessor') Object.defineProperty(array, '0', { get() { throw new Error('accessor ran'); } });
      if (kind === 'hidden') Object.defineProperty(array, 'nk', { value: h('secret') });
      if (kind === 'symbol') array[Symbol('secret')] = h('secret');
      assert.throws(() => compose(input), /ARRAY/);
    }
  }
});

test('u64 values above Number precision survive R98/N51 composition unchanged', () => {
  const high = fixture(1, { executionFrom: '9007199254740993', from: '9007199254740994', timestamp: '9007199254740995',
    until: '18446744073709551613', executionUntil: '18446744073709551614', cutoff: '18446744073709551615' });
  for (const [input, compose, names] of [[high.ready(), prepareNativeReady, ['ready_from', 'ready_until']],
    [high.node(), prepareNativeNode, ['valid_from', 'valid_until']]]) {
    const result = compose(input);
    assert.deepEqual(names.map(name => result.inputs[name]), ['9007199254740994', '18446744073709551613']);
    assert.deepEqual(result.expectedPublicInputs.slice(-2), ['9007199254740994', '18446744073709551613']);
  }
});

test('final newlines, CR and Unicode line terminators cannot masquerade as canonical decimal or hex', () => {
  for (const [make, compose, selectors] of [
    [ready, prepareNativeReady, [x => [x, 'readyFrom'], x => [x.packet, 'settleBefore'], x => [x.packet.action, 'amount'],
      x => [x.packet.action, 'actionSalt'], x => [x.packet.localCapsule, 'targetContext'], x => [x.snapshot, 'timestamp'],
      x => [x.snapshot, 'scope'], x => [x.reservePath, 'index'], x => [x.reservePath.siblings, 0],
      x => [x.poolSpentEntries, 0], x => [x.capsuleProof.proofFields, 0], x => [x.capsuleProof.vkFields, 0],
      x => [x.capsuleProof.publicInputs, 0], x => [x.dependencyProof.publicInputs, 48]]],
    [node, prepareNativeNode, [x => [x, 'validFrom'], x => [x.packet, 'receiptSpendSecret'], x => [x.evidenceState, 'revocationSequence'],
      x => [x.evidenceState, 'receiptRoot'], x => [x.receipt.opening, 'validFrom'], x => [x.receipt.opening, 'globalEffectId'],
      x => [x.receipt.path, 'index'], x => [x.receipt.path.siblings, 0], x => [x.revokedEntries, 0],
      x => [x.capsuleProof.proofFields, 0], x => [x.capsuleProof.vkFields, 0], x => [x.capsuleProof.publicInputs, 128]]],
  ]) {
    for (const select of selectors) for (const ending of ['\n', '\r', '\r\n', '\u2028', '\u2029']) {
      const input = make(), [object, key] = select(input); object[key] += ending;
      assert.throws(() => compose(input), /PAEG_/);
    }
  }
});
