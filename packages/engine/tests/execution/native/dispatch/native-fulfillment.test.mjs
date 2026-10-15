import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { prepareNativeAggregatePair, prepareNativeAggregateAll, prepareNativeFulfillment,
  NATIVE_AGGREGATE_PAIR_PUBLIC_INPUT_COUNT, NATIVE_AGGREGATE_ALL_PUBLIC_INPUT_COUNT,
  NATIVE_FULFILLMENT_PUBLIC_INPUT_COUNT } from '../../../../src/execution/native/dispatch/native-fulfillment.mjs';
import { a0Context } from '../../../../src/execution/native/dispatch/native-capsules.mjs';
import { FUNDED_GRAPH_PROFILE, fundedAuthorizationWords } from '../../../../src/execution/graph/funded-graph.mjs';
import { PrivateNoteTree } from '../../../../src/notes/private-note-tree.mjs';
import { A0, FIELD_MODULUS, digestWords, digestHex } from '../../../../src/execution/inputs/funding-wrappers.mjs';
import { NATIVE_PROFILES } from '../../../../../proofs/programs/generic-native/pin-key.mjs';

// Host byte/schema tests only. Every recursive proof/VK field package below is
// deliberately synthetic and UNVERIFIED, including the padding placeholders.
// These tests run no compiler, backend, key generation, prover, native runtime
// or campaign. Successful composition confers no cryptographic acceptance.
const ZERO = '0'.repeat(64);
const h = value => createHash('sha256').update(`A67/A98/T131 unverified host fixture: ${value}`).digest('hex');
const copy = value => structuredClone(value);
const fieldsOnly = publicInputs => ({ publicInputs: [...publicInputs], proofFields: Array(458).fill('1'), vkFields: Array(115).fill('2') });
const replaceDigest = (values, offset, digest) => values.splice(offset, 8, ...digestWords(digest));
const ownerFields = ['scope', 'policy', 'asset', 'operationId', 'inputCommitment', 'inputNullifier', 'reservationIntent',
  'graphCommitment', 'treeRoot', 'reserveCommitment', 'reserveNullifier', 'changeCommitment'];

function fixture(activeCount = 2, { from = '200', until = '300', cutoff = '500' } = {}) {
  const statement = { profile: FUNDED_GRAPH_PROFILE.id, ...Object.fromEntries(ownerFields.map(field => [field, h(field)])),
    outputs: Array.from({ length: 4 }, (_, i) => h(`${i < activeCount ? 'payout' : 'opaque-padding'}:${i}`)),
    recoveryCommitment: h('recovery'), fundingNotBefore: '100', fundingValidUntil: '150', settleBefore: cutoff };
  const owner = fieldsOnly(fundedAuthorizationWords(statement));
  const hub = h('hub'), registry = h('registry'), evidence = h('evidence'), context = a0Context(statement);
  const tags = Array.from({ length: 4 }, (_, i) => h(`${i < activeCount ? 'terminal-tag' : 'opaque-padding-tag'}:${i}`));
  const nodes = Array.from({ length: 4 }, (_, i) => fieldsOnly([hub, registry, evidence, context, statement.outputs[i], tags[i]]
    .flatMap(digestWords).concat(String(i), from, until)));
  const tree = new PrivateNoteTree([h('unrelated-reserve'), statement.reserveCommitment]);
  const pair = (index = 0) => ({ nodeProofs: copy(nodes.slice(index * 2, index * 2 + 2)) });
  const all = () => ({ pairProofs: [0, 1].map(i => fieldsOnly(prepareNativeAggregatePair(pair(i)).expectedPublicInputs)) });
  return { owner, nodes, statement, tags, pair, all,
    fulfillment() {
      return copy({ ownerProof: owner, aggregateProof: fieldsOnly(prepareNativeAggregateAll(all()).expectedPublicInputs),
        reservePath: { index: '1', siblings: tree.path(1).siblings }, expectedBindings: {
          scope: statement.scope, policy: statement.policy, asset: statement.asset, acceptedPoolRoot: tree.root,
          hubDomain: hub, registryCommitment: registry, evidenceState: evidence, reserveNullifier: statement.reserveNullifier,
          outputs: statement.outputs, terminalReceiptTags: tags, settleBefore: cutoff, validFrom: from, validUntil: until,
        } });
    },
  };
}
const base = fixture();
const pair = () => base.pair(), all = () => base.all(), fulfillment = () => base.fulfillment();
const cases = [
  ['aggregate_pair', pair, prepareNativeAggregatePair, NATIVE_AGGREGATE_PAIR_PUBLIC_INPUT_COUNT],
  ['aggregate_all', all, prepareNativeAggregateAll, NATIVE_AGGREGATE_ALL_PUBLIC_INPUT_COUNT],
  ['fulfill', fulfillment, prepareNativeFulfillment, NATIVE_FULFILLMENT_PUBLIC_INPUT_COUNT],
];

test('composers match actual A67/A98/T131 source signatures and pinned public ABI order', () => {
  for (const [mode, make, compose, count] of cases) {
    const input = make(), before = copy(input), result = compose(input);
    const source = readFileSync(new URL(`../../../../../../packages/proofs/programs/generic-native/circuits/${mode}/src/main.nr`, import.meta.url), 'utf8');
    const signature = source.split('fn main(')[1].split(') {')[0];
    const parameters = [...signature.matchAll(/^\s+(\w+): (.+),$/gm)].map(match => match[1]);
    const publicParameters = [...signature.matchAll(/^\s+(\w+): pub (.+),$/gm)].map(match => match[1]);
    assert.deepEqual(Object.keys(result), ['inputs', 'expectedPublicInputs']);
    assert.deepEqual(Object.keys(result.inputs), parameters);
    assert.deepEqual(publicParameters, NATIVE_PROFILES[mode].parameters.map(parameter => parameter.name));
    assert.equal(count, NATIVE_PROFILES[mode].words);
    assert.equal(result.expectedPublicInputs.length, count);
    assert.deepEqual(result.expectedPublicInputs, publicParameters.flatMap(name => [result.inputs[name]].flat(Infinity)));
    assert.ok(result.expectedPublicInputs.every(word => typeof word === 'string' && /^(0|[1-9][0-9]*)$/.test(word)));
    assert.deepEqual(input, before);
    const mutateArrays = value => { for (const child of Object.values(value)) {
      if (Array.isArray(child)) child[0] = '999';
      else if (child && typeof child === 'object') mutateArrays(child);
    } };
    mutateArrays(result);
    assert.deepEqual(input, before, `${mode} output arrays must not alias input arrays`);
  }
});

test('one through four active placeholders preserve four mandatory opaque positions', () => {
  for (const count of [1, 2, 3, 4]) {
    const value = fixture(count), result = prepareNativeFulfillment(value.fulfillment());
    assert.deepEqual(result.inputs.outputs.map(digestHex), value.statement.outputs);
    assert.deepEqual(result.inputs.terminal_receipt_tags.map(digestHex), value.tags);
    for (const index of [0, 1]) {
      const joined = prepareNativeAggregatePair(value.pair(index));
      assert.equal(joined.inputs.pair_index, String(index));
      assert.deepEqual(joined.inputs.node_inputs.map(values => values[48]), [String(index * 2), String(index * 2 + 1)]);
    }
    const joined = prepareNativeAggregateAll(value.all());
    assert.deepEqual(joined.inputs.pair_inputs.map(values => values[64]), ['0', '1']);
    assert.deepEqual(joined.inputs.payouts.map(digestHex), value.statement.outputs);
    assert.doesNotMatch(JSON.stringify(result), /active_count|dependency_mask|ownerWitness|receipt_spend_secret|graph_nonce|node_ids/);
    const missing = value.all(); missing.pairProofs.pop();
    assert.throws(() => prepareNativeAggregateAll(missing), /ARRAY/);
  }
});

test('pair and all reject reordered, duplicated, missing and out-of-range coverage', () => {
  for (const slots of [['1', '0'], ['0', '0'], ['0', '2'], ['1', '2'], ['2', '2'], ['3', '4'], ['4', '5'], ['254', '255']]) {
    const input = pair(); slots.forEach((slot, i) => { input.nodeProofs[i].publicInputs[48] = slot; });
    assert.throws(() => prepareNativeAggregatePair(input), /COVERAGE/);
  }
  for (const indexes of [['1', '0'], ['0', '0'], ['1', '1'], ['2', '1'], ['0', '255']]) {
    const input = all(); indexes.forEach((index, i) => { input.pairProofs[i].publicInputs[64] = index; });
    assert.throws(() => prepareNativeAggregateAll(input), /COVERAGE/);
  }
  for (const [make, compose, field] of [[pair, prepareNativeAggregatePair, 'nodeProofs'], [all, prepareNativeAggregateAll, 'pairProofs']]) {
    for (const count of [0, 1, 3, 4]) {
      const input = make(); input[field] = Array.from({ length: count }, () => input[field][0]);
      assert.throws(() => compose(input), /ARRAY/);
    }
  }
});

test('both recursive joins reject cross-graph, hub, registry, evidence-state and time substitutions', () => {
  for (const [make, compose, field, from, until] of [
    [pair, prepareNativeAggregatePair, 'nodeProofs', 49, 50], [all, prepareNativeAggregateAll, 'pairProofs', 65, 66],
  ]) {
    for (const offset of [0, 8, 16, 24]) {
      const input = make(); replaceDigest(input[field][1].publicInputs, offset, h(`substitution:${offset}`));
      assert.throws(() => compose(input), /COMMON_CONTEXT/);
    }
    for (const offset of [from, until]) {
      const input = make(); input[field][1].publicInputs[offset] = '201';
      assert.throws(() => compose(input), /WINDOW_BINDING/);
    }
    for (const [start, end] of [['200', '200'], ['201', '200']]) {
      const input = make(); input[field].forEach(proof => { proof.publicInputs[from] = start; proof.publicInputs[until] = end; });
      assert.throws(() => compose(input), /INTERVAL/);
    }
  }
});

test('all joins require nonzero distinct outputs and tags, including across pairs and padding', () => {
  for (const [make, compose, field, payoutOffsets, tagOffsets] of [
    [pair, prepareNativeAggregatePair, 'nodeProofs', [32], [40]],
    [all, prepareNativeAggregateAll, 'pairProofs', [32, 40], [48, 56]],
  ]) {
    for (const offsets of [payoutOffsets, tagOffsets]) {
      for (const position of [0, 1]) for (const offset of offsets) {
        const input = make(); replaceDigest(input[field][position].publicInputs, offset, ZERO);
        assert.throws(() => compose(input), /ZERO_OUTPUT|ZERO_TAG/);
      }
      const input = make(); input[field][1].publicInputs.splice(offsets.at(-1), 8, ...input[field][0].publicInputs.slice(offsets[0], offsets[0] + 8));
      assert.throws(() => compose(input), /DUPLICATE_OUTPUT|DUPLICATE_TAG/);
    }
  }
  for (const offset of [32, 64]) {
    const input = fulfillment(); replaceDigest(input.aggregateProof.publicInputs, offset, ZERO);
    assert.throws(() => prepareNativeFulfillment(input), /OUTPUT_BINDING|ZERO_TAG/);
  }
  const duplicate = fulfillment();
  duplicate.aggregateProof.publicInputs.splice(88, 8, ...duplicate.aggregateProof.publicInputs.slice(64, 72));
  assert.throws(() => prepareNativeFulfillment(duplicate), /DUPLICATE_TAG/);
});

test('T131 context uses exactly all 139 A0 public fields with C129 framing', () => {
  const ownerInputs = base.owner.publicInputs;
  const wordBytes = digest => Buffer.from(digestHex(digest), 'hex');
  const timeBytes = value => Buffer.from(BigInt(value).toString(16).padStart(16, '0'), 'hex');
  const parts = [Buffer.from('LIANUM/PAEG/a0-context/2'), Buffer.from('LIANUM_PAEG_FUNDED_4_V1'),
    ...Array.from({ length: 17 }, (_, i) => wordBytes(ownerInputs.slice(i * 8, i * 8 + 8))),
    ...ownerInputs.slice(136).map(timeBytes)];
  const frame = Buffer.concat(parts.flatMap(part => {
    const size = Buffer.alloc(4); size.writeUInt32BE(part.length); return [size, part];
  }));
  const expectedContext = createHash('sha256').update(frame).digest('hex');
  assert.equal(expectedContext, a0Context(base.statement));
  assert.equal(digestHex(fulfillment().aggregateProof.publicInputs.slice(24, 32)), expectedContext);
  for (let index = 0; index < 139; index++) {
    const input = fulfillment(); input.ownerProof.publicInputs[index] = String(BigInt(input.ownerProof.publicInputs[index]) + 1n);
    assert.throws(() => prepareNativeFulfillment(input), /A0_CONTEXT/, `A0 index ${index}`);
  }
  const arbitrary = fulfillment(); replaceDigest(arbitrary.aggregateProof.publicInputs, 24, h('caller-context'));
  assert.throws(() => prepareNativeFulfillment(arbitrary), /A0_CONTEXT/);
});

test('T131 binds exact A0 outputs/nullifier/cutoff and the complete expected public statement', () => {
  for (const field of ['scope', 'policy', 'asset', 'hubDomain', 'registryCommitment', 'evidenceState', 'reserveNullifier']) {
    const input = fulfillment(); input.expectedBindings[field] = h(`wrong:${field}`);
    assert.throws(() => prepareNativeFulfillment(input), /EXPECTED_BINDINGS/);
  }
  for (const field of ['outputs', 'terminalReceiptTags']) for (let i = 0; i < 4; i++) {
    const input = fulfillment(); input.expectedBindings[field][i] = h(`wrong:${field}:${i}`);
    assert.throws(() => prepareNativeFulfillment(input), /EXPECTED_BINDINGS/);
  }
  for (const field of ['settleBefore', 'validFrom', 'validUntil']) {
    const input = fulfillment(); input.expectedBindings[field] = String(BigInt(input.expectedBindings[field]) + 1n);
    assert.throws(() => prepareNativeFulfillment(input), /EXPECTED_BINDINGS/);
  }
  for (let i = 0; i < 4; i++) {
    const input = fulfillment(); replaceDigest(input.aggregateProof.publicInputs, 32 + i * 8, h(`wrong-output:${i}`));
    assert.throws(() => prepareNativeFulfillment(input), /OUTPUT_BINDING/);
  }
  for (const offset of [0, 8, 16]) {
    const input = fulfillment(); replaceDigest(input.aggregateProof.publicInputs, offset, h(`other:${offset}`));
    assert.throws(() => prepareNativeFulfillment(input), /EXPECTED_BINDINGS/);
  }
  for (const offset of [96, 97]) {
    const input = fulfillment(); input.aggregateProof.publicInputs[offset] = offset === 96 ? '201' : '301';
    assert.throws(() => prepareNativeFulfillment(input), /EXPECTED_BINDINGS/);
  }
  const late = fulfillment(); late.aggregateProof.publicInputs[97] = '501'; late.expectedBindings.validUntil = '501';
  assert.throws(() => prepareNativeFulfillment(late), /CUTOFF/);
  assert.doesNotThrow(() => prepareNativeFulfillment(fixture(2, { until: '500' }).fulfillment()));
  const reversed = fulfillment(); reversed.aggregateProof.publicInputs[96] = '301';
  assert.throws(() => prepareNativeFulfillment(reversed), /INTERVAL/);
});

test('T131 checks the A0 reserve commitment under the exact depth-six pool root', () => {
  const wrongRoot = fulfillment(); wrongRoot.expectedBindings.acceptedPoolRoot = `0x${h('other-root')}`;
  assert.throws(() => prepareNativeFulfillment(wrongRoot), /RESERVE_MEMBERSHIP/);
  const wrongIndex = fulfillment(); wrongIndex.reservePath.index = '0';
  assert.throws(() => prepareNativeFulfillment(wrongIndex), /RESERVE_MEMBERSHIP/);
  for (let i = 0; i < 6; i++) {
    const input = fulfillment(); input.reservePath.siblings[i] = `0x${h(`wrong-sibling:${i}`)}`;
    assert.throws(() => prepareNativeFulfillment(input), /RESERVE_MEMBERSHIP/);
  }
  const otherLeaf = fulfillment(), tree = new PrivateNoteTree([base.statement.inputCommitment]);
  otherLeaf.reservePath = { index: '0', siblings: tree.path(0).siblings }; otherLeaf.expectedBindings.acceptedPoolRoot = tree.root;
  assert.throws(() => prepareNativeFulfillment(otherLeaf), /RESERVE_MEMBERSHIP/);
  for (const index of ['64', '4294967296', '-1', '01', '0x1', 1, -0, 1n]) {
    const input = fulfillment(); input.reservePath.index = index;
    assert.throws(() => prepareNativeFulfillment(input), /INTEGER|RANGE/);
  }
  const last = fulfillment(), full = new PrivateNoteTree([...Array.from({ length: 63 }, (_, i) => h(`leaf:${i}`)), base.statement.reserveCommitment]);
  last.reservePath = { index: '63', siblings: full.path(63).siblings }; last.expectedBindings.acceptedPoolRoot = full.root;
  assert.equal(prepareNativeFulfillment(last).inputs.reserve_leaf_index, '63');
});

const schemaCases = [
  [pair, prepareNativeAggregatePair, [x => x, x => x.nodeProofs[0], x => x.nodeProofs[1]]],
  [all, prepareNativeAggregateAll, [x => x, x => x.pairProofs[0], x => x.pairProofs[1]]],
  [fulfillment, prepareNativeFulfillment, [x => x, x => x.ownerProof, x => x.aggregateProof, x => x.reservePath, x => x.expectedBindings]],
];
test('exact schemas reject graphs, secrets, keys, masks, trust flags and unknown fields at every boundary', () => {
  for (const [make, compose, selectors] of schemaCases) for (const select of selectors) {
    for (const field of ['graph', 'ownerWitness', 'localCapsule', 'receipt', 'nk', 'ownerKeys', 'signingKey', 'activeCount', 'mask', 'verified', 'context', 'unknown']) {
      const input = make(); select(input)[field] = h('unrequested-material');
      assert.throws(() => compose(input), /FIELDS/);
    }
    const input = make(); delete select(input)[Object.keys(select(input))[0]];
    assert.throws(() => compose(input), /FIELDS/);
  }
  for (const [, make, compose] of cases) {
    assert.doesNotMatch(JSON.stringify(compose(make())), /"verified"|"cryptographicAcceptance"|"ownerKeys"|"nk"|"graph"|"mask"/);
  }
});

test('hidden fields, symbols, accessors and prototype changes cannot bypass object schemas', () => {
  for (const [make, compose, selectors] of schemaCases) for (const select of selectors) {
    for (const kind of ['hidden', 'symbol', 'accessor', 'prototype']) {
      const input = make(), object = select(input);
      if (kind === 'hidden') Object.defineProperty(object, 'hidden', { value: h('hidden') });
      if (kind === 'symbol') object[Symbol('hidden')] = h('hidden');
      if (kind === 'accessor') Object.defineProperty(object, Object.keys(object)[0], { get() { throw new Error('accessor ran'); } });
      if (kind === 'prototype') Object.setPrototypeOf(object, { hidden: h('hidden') });
      assert.throws(() => compose(input), /FIELDS/, kind);
    }
  }
});

const packageCases = [
  [pair, prepareNativeAggregatePair, x => x.nodeProofs[0], 48, 1],
  [all, prepareNativeAggregateAll, x => x.pairProofs[0], 64, 1],
  [fulfillment, prepareNativeFulfillment, x => x.ownerProof, 136, 0],
  [fulfillment, prepareNativeFulfillment, x => x.aggregateProof, 96, 0],
];
test('recursive packages enforce exact dense decimal field arrays and u32/u8/u64/field ranges', () => {
  for (const [make, compose, select, digestCount, byteCount] of packageCases) {
    for (const field of ['publicInputs', 'proofFields', 'vkFields']) {
      for (const invalid of ['01', '0x1', '-1', '1e2', '1\n', '1\r', '1 ', '', 1, 1n, null, FIELD_MODULUS.toString()]) {
        const input = make(); select(input)[field][0] = invalid;
        assert.throws(() => compose(input), /INTEGER|RANGE|ARRAY/);
      }
      for (const kind of ['sparse', 'short', 'long', 'hidden', 'symbol', 'accessor', 'prototype']) {
        const input = make(), value = select(input)[field];
        if (kind === 'sparse') delete value[0];
        if (kind === 'short') value.pop();
        if (kind === 'long') value.push('1');
        if (kind === 'hidden') Object.defineProperty(value, 'hidden', { value: '1' });
        if (kind === 'symbol') value[Symbol('hidden')] = '1';
        if (kind === 'accessor') Object.defineProperty(value, '0', { get() { throw new Error('accessor ran'); } });
        if (kind === 'prototype') Object.setPrototypeOf(value, Object.create(Array.prototype));
        assert.throws(() => compose(input), /ARRAY/);
      }
    }
    for (const [index, value] of [[0, String(1n << 32n)], [digestCount + byteCount, String(1n << 64n)],
      ...(byteCount ? [[digestCount, '256']] : [])]) {
      const input = make(); select(input).publicInputs[index] = value;
      assert.throws(() => compose(input), /RANGE/);
    }
  }
});

test('all other boundary arrays and hashes are strict and fixed width', () => {
  for (const [make, compose, select] of [
    [pair, prepareNativeAggregatePair, x => x.nodeProofs], [all, prepareNativeAggregateAll, x => x.pairProofs],
    [fulfillment, prepareNativeFulfillment, x => x.reservePath.siblings],
    [fulfillment, prepareNativeFulfillment, x => x.expectedBindings.outputs],
    [fulfillment, prepareNativeFulfillment, x => x.expectedBindings.terminalReceiptTags],
  ]) for (const kind of ['sparse', 'short', 'long', 'hidden', 'symbol', 'accessor', 'prototype']) {
    const input = make(), value = select(input);
    if (kind === 'sparse') delete value[0];
    if (kind === 'short') value.pop();
    if (kind === 'long') value.push(value[0]);
    if (kind === 'hidden') Object.defineProperty(value, 'hidden', { value: h('extra') });
    if (kind === 'symbol') value[Symbol('hidden')] = h('extra');
    if (kind === 'accessor') Object.defineProperty(value, '0', { get() { throw new Error('accessor ran'); } });
    if (kind === 'prototype') Object.setPrototypeOf(value, Object.create(Array.prototype));
    assert.throws(() => compose(input), /ARRAY/);
  }
  for (const field of ['scope', 'acceptedPoolRoot']) for (const change of [value => value.toUpperCase(), value => value + '\n', value => value.slice(1), () => 123]) {
    const input = fulfillment(); input.expectedBindings[field] = change(input.expectedBindings[field]);
    assert.throws(() => prepareNativeFulfillment(input), /FIELDS|DIGEST/);
  }
  for (const value of [h('unprefixed'), `0x${h('short').slice(1)}`, `0x${h('uppercase').toUpperCase()}`, `0x${h('newline')}\n`, null]) {
    const input = fulfillment(); input.reservePath.siblings[0] = value;
    assert.throws(() => prepareNativeFulfillment(input), /DIGEST|ARRAY/);
  }
});

test('boundary values serialize without claiming synthetic proof or caller VK authentication', () => {
  const input = pair();
  input.nodeProofs.forEach(proof => { proof.publicInputs[0] = String((1n << 32n) - 1n);
    proof.publicInputs[49] = '0'; proof.publicInputs[50] = String((1n << 64n) - 1n);
    proof.proofFields[0] = String(FIELD_MODULUS - 1n); proof.vkFields[0] = String(FIELD_MODULUS - 1n); });
  const result = prepareNativeAggregatePair(input);
  assert.equal(result.inputs.valid_until, String((1n << 64n) - 1n));
  assert.equal(result.inputs.node_proofs[0][0], String(FIELD_MODULUS - 1n));
  assert.equal(result.inputs.node_vk, undefined);
  const otherVk = copy(input); otherVk.nodeProofs[0].vkFields.fill('0');
  assert.deepEqual(prepareNativeAggregatePair(otherVk), result, 'A67 uses a circuit literal key, not this host value');
  const terminal = fulfillment(); terminal.ownerProof.vkFields[0] = '3';
  assert.equal(prepareNativeFulfillment(terminal).inputs.owner_vk[0], '3', 'T131, not the host codec, checks the frozen A0 VK');
  const maximum = String((1n << 64n) - 1n);
  assert.equal(prepareNativeFulfillment(fixture(2, { until: maximum, cutoff: maximum }).fulfillment()).inputs.settle_before, maximum);
  assert.equal(A0.reserveNullifier, 80);
});
