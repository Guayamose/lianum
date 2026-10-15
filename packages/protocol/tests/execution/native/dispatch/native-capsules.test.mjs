import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { prepareNativeCapsules, nativeReceiptKeyCommitment, nativeTransferActionCommitment,
  a0Context, capsuleAuthorizationWords, localCapsuleCommitment, dependencyCapsuleCommitment,
  localCapsuleToNoir, dependencyCapsuleToNoir, nativeActionToNoir,
  NATIVE_CAPSULE_PROFILE } from '../../../../../engine/src/execution/native/dispatch/native-capsules.mjs';
import { compileFundedGraph, fundedSigningRequests, attachFundedSignatures,
  fundedAuthorizationWords } from '../../../../../engine/src/execution/graph/funded-graph.mjs';
import { freshKey, signature, uintBE } from '../../../../../engine/src/notes/private-note-encoding.mjs';

const ZERO = '0'.repeat(64);
const h = label => createHash('sha256').update('capsule fixture: ' + label).digest('hex');
const b = hex => Buffer.from(hex, 'hex');
const hx = bytes => Buffer.from(bytes).toString('hex');
const nativeProfile = Buffer.from('LIANUM_PAEG_NATIVE_4_V2');
const h4 = (tag, parts) => createHash('sha256').update(Buffer.concat([Buffer.from(tag), ...parts]
  .flatMap(value => [uintBE(value.length, 4), value]))).digest('hex');
const note = (key, value, tag) => ({ type: 4, rho: h(tag + ':rho'), x: hx(key.x), y: hx(key.y),
  value: String(value), secret: h(tag + ':secret') });
const action = (slot, hubDomain = h('hub')) => ({ chainDomain: h('chain:' + slot), signerIdentity: h('signer:' + slot),
  sourceCommitment: h('source:' + slot), destinationCommitment: h('destination:' + slot),
  amount: String((1n << 80n) + BigInt(slot + 1)), custodyKind: 1, custodyCommitment: h('custody:' + slot),
  executionFrom: '1791000000', executionUntil: '1791000800', settleBefore: '1791000900',
  receiptKeyCommitment: nativeReceiptKeyCommitment(hubDomain, h('nk:' + slot)), receiptRho: h('rho:' + slot),
  deliveryRiskCommitment: h('risk:' + slot), actionSalt: h('action-salt:' + slot) });

function fixture(count = 4, shape = 'fan-in') {
  const hubDomain = h('hub'), registryCommitment = h('registry');
  const ownerKey = freshKey(), changeKey = freshKey(), recoveryKey = freshKey();
  const payoutKeys = Array.from({ length: count }, () => freshKey());
  const nodes = Array.from({ length: count }, (_, i) => ({ id: `node-${i}`, action: action(i), receiptSpendSecret: h('nk:' + i) }));
  const fundedInput = {
    scope: h('scope'), policy: h('policy'), asset: h('asset'), operationId: h('operation'), budget: String(count * 25),
    fundingNotBefore: '1791000000', fundingValidUntil: '1791000300', settleBefore: '1791000900',
    reservationNonce: h('reservation'), reserveSecret: h('reserve'), graphNonce: h('graph'),
    inputNote: note(ownerKey, count * 25 + 7, 'input'), changeNote: note(changeKey, 7, 'change'),
    recoveryNote: note(recoveryKey, count * 25, 'recovery'),
    nodes: nodes.map((node, i) => ({ id: node.id, chainDomain: node.action.chainDomain,
      evidencePolicy: h('evidence:' + i), actionCommitment: nativeTransferActionCommitment(node.action),
      dependsOn: shape === 'chain' && i ? [`node-${i - 1}`]
        : shape === 'fan-in' && i === count - 1 ? Array.from({ length: i }, (_, p) => `node-${p}`) : [],
      payout: { x: hx(payoutKeys[i].x), y: hx(payoutKeys[i].y), value: '25', secret: h('payout-secret:' + i), randomness: h('payout-random:' + i) } })),
    paddingSalts: Array.from({ length: 4 }, (_, i) => h('padding:' + i)),
  };
  const compiled = compileFundedGraph(fundedInput), requests = fundedSigningRequests(compiled);
  const signed = attachFundedSignatures(compiled, { ownerSignature: hx(signature(ownerKey, requests.owner.message)),
    invoiceSignatures: requests.invoices.map(request => hx(signature(payoutKeys[request.slot], request.message))) });
  const input = { signed, hubDomain, registryCommitment, nodes,
    slotSalts: Array.from({ length: 4 }, (_, i) => ({ targetSalt: h('target:' + i),
      localCapsuleSalt: h('local-salt:' + i), dependencyCapsuleSalt: h('dependency-salt:' + i) })) };
  return { input, prepared: prepareNativeCapsules(input) };
}

// Deliberately unverified fields exercise only the pure ABI converter. They
// are not accepted proofs, and no test here claims Noir/recursive verification.
function codecOnlyA0(signed) {
  return { publicInputs: fundedAuthorizationWords(signed.authorizationStatement),
    proofFields: Array(458).fill('0'), vkFields: Array(115).fill('0') };
}
const digestFromWords = words => words.map(value => Number(value).toString(16).padStart(8, '0')).join('');

test('C129 exact public order and A0 139-word private conversion retain all four slots', () => {
  for (const count of [1, 2, 3, 4]) {
    const { input, prepared } = fixture(count), s = prepared.statement;
    const words = capsuleAuthorizationWords(s), witness = prepared.ownerAuthorizationInputs(codecOnlyA0(input.signed));
    assert.equal(words.length, 129);
    assert.equal(witness.owner_inputs.length, 139);
    assert.equal(witness.owner_proof.length, 458);
    assert.equal(witness.owner_vk.length, 115);
    const publicOrder = ['scope', 'policy', 'asset', 'hub_domain', 'registry_commitment', 'context',
      'reserve_commitment', 'reserve_nullifier', 'local_capsule_commitments', 'dependency_capsule_commitments', 'settle_before'];
    assert.deepEqual(publicOrder.flatMap(key => [witness[key]].flat(Infinity)).map(String), words);
    for (let i = 0; i < 4; i++) {
      assert.equal(digestFromWords(words.slice(64 + i * 8, 72 + i * 8)), s.localCapsuleCommitments[i]);
      assert.equal(digestFromWords(words.slice(96 + i * 8, 104 + i * 8)), s.dependencyCapsuleCommitments[i]);
    }
    assert.equal(words[128], input.signed.authorizationStatement.settleBefore);
    assert.equal(witness.witness.graph.active_count, count);
    assert.equal(witness.witness.local_capsules.length, 4);
    assert.equal(witness.witness.dependency_capsules.length, 4);
  }
});

test('C source ABI matches the host order and calls the existing pinned A0 verifier once', () => {
  const main = readFileSync(new URL('../../../../circuits/generic-native/circuits/capsule/src/main.nr', import.meta.url), 'utf8');
  const declarations = [...main.matchAll(/^\s+(\w+): pub (.+),$/gm)].map(match => [match[1], match[2]]);
  assert.deepEqual(declarations, [
    ...['scope', 'policy', 'asset', 'hub_domain', 'registry_commitment', 'context', 'reserve_commitment', 'reserve_nullifier']
      .map(name => [name, '[u32; 8]']),
    ['local_capsule_commitments', '[[u32; 8]; 4]'], ['dependency_capsule_commitments', '[[u32; 8]; 4]'],
    ['settle_before', 'u64'],
  ]);
  assert.equal([...main.matchAll(/owner::verify\(owner_vk, owner_proof, owner_inputs\)/g)].length, 1);
  const verifier = readFileSync(new URL('../../../../circuits/generic-wrappers/lib/src/owner.nr', import.meta.url), 'utf8');
  assert.match(verifier, /assert\(vk == approved_owner_key::OWNER_VK\)/);
  assert.match(verifier, /bb_proof_verification::verify_honk_proof\([\s\S]*approved_owner_key::OWNER_VK_HASH/);
  assert.match(main, /owner_vk: \[Field; 115\]/);
  assert.match(main, /owner_proof: \[Field; 458\]/);
  assert.match(main, /owner_inputs: \[Field; 139\]/);
});

test('context hashes original funded profile, all seventeen digest parts, and all three u64s', () => {
  const { input } = fixture(2), s = input.signed.authorizationStatement;
  const digestFields = ['scope', 'policy', 'asset', 'operationId', 'inputCommitment', 'inputNullifier', 'reservationIntent',
    'graphCommitment', 'treeRoot', 'reserveCommitment', 'reserveNullifier', 'changeCommitment'];
  const times = ['fundingNotBefore', 'fundingValidUntil', 'settleBefore'];
  const parts = [...digestFields.map(key => b(s[key])), ...s.outputs.map(b), b(s.recoveryCommitment), ...times.map(key => uintBE(s[key], 8))];
  const context = a0Context(s);
  assert.equal(context, h4('LIANUM/PAEG/a0-context/2', [Buffer.from('LIANUM_PAEG_FUNDED_4_V1'), ...parts]));
  assert.notEqual(context, h4('LIANUM/PAEG/a0-context/2', [nativeProfile, ...parts]));
  assert.notEqual(context, h4('LIANUM/PAEG/a0-context/2', [Buffer.from('LIANUM_PAEG_FUNDED_4_V1'), Buffer.concat(parts)]));
  for (const key of [...digestFields, 'recoveryCommitment']) {
    const changed = structuredClone(s); changed[key] = h('changed:' + key); assert.notEqual(a0Context(changed), context, key);
  }
  for (let i = 0; i < 4; i++) {
    const changed = structuredClone(s); changed.outputs[i] = h('changed:output:' + i); assert.notEqual(a0Context(changed), context);
  }
  for (const key of times) {
    const changed = structuredClone(s); changed[key] = String(BigInt(changed[key]) + 1n); assert.notEqual(a0Context(changed), context, key);
  }
});

test('action commitment uses exact flat fields, u128BE amount, and execution/cutoff constraints', () => {
  const a = action(0), fields = ['chainDomain', 'signerIdentity', 'sourceCommitment', 'destinationCommitment'];
  const parts = [...fields.map(key => b(a[key])), uintBE(a.amount, 16), uintBE(a.custodyKind, 1), b(a.custodyCommitment),
    ...['executionFrom', 'executionUntil', 'settleBefore'].map(key => uintBE(a[key], 8)),
    ...['receiptKeyCommitment', 'receiptRho', 'deliveryRiskCommitment', 'actionSalt'].map(key => b(a[key]))];
  const cm = nativeTransferActionCommitment(a);
  assert.equal(cm, h4('LIANUM/PAEG/native-transfer-action/2', [nativeProfile, ...parts]));
  assert.equal(nativeReceiptKeyCommitment(h('hub'), h('nk:0')), h4('LIANUM/PAEG/receipt-key/2', [b(h('hub')), b(h('nk:0'))]));
  for (const [key, value] of [['amount', '0'], ['amount', String(1n << 128n)], ['amount', '01'],
    ['custodyKind', 2], ['executionFrom', a.executionUntil], ['executionUntil', String(BigInt(a.settleBefore) + 1n)],
    ['receiptRho', ZERO], ['actionSalt', ZERO], ['settleBefore', String(1n << 64n)]]) {
    assert.throws(() => nativeTransferActionCommitment({ ...a, [key]: value }), /PAEG_CAPSULE/);
  }
  for (const key of [...fields, 'custodyCommitment', 'receiptKeyCommitment', 'receiptRho', 'deliveryRiskCommitment', 'actionSalt']) {
    assert.notEqual(nativeTransferActionCommitment({ ...a, [key]: h('new:' + key) }), cm, key);
  }
  assert.throws(() => nativeTransferActionCommitment({ ...a, privateKey: 'forbidden' }), /PAEG_CAPSULE_ACTION_FIELDS/);
});

test('Dependency receives only its sorted incoming fragment and read openings, never target native terms or any nk', () => {
  const { input, prepared } = fixture(4), target = prepared.nodeRole(3), dependency = prepared.dependencyRole(3);
  const capsule = dependency.dependencyCapsule;
  assert.equal(capsule.targetSlot, 3);
  assert.equal(capsule.targetContext, target.localCapsule.targetContext);
  assert.equal(capsule.dependencyCount, 3);
  assert.deepEqual(capsule.predecessors.map(source => source.sourceSlot), [0, 1, 2]);
  capsule.predecessors.forEach((source, i) => {
    const local = prepared.nodeRole(i).localCapsule;
    assert.equal(source.sourceNodeCommitment, local.nodeCommitment);
    assert.equal(source.sourceLocalCommitment, local.localCommitment);
    assert.equal(source.sourceDispatchId, local.dispatchId);
    for (const key of ['chainDomain', 'evidencePolicy', 'actionCommitment', 'payoutCommitment', 'receiptKeyCommitment', 'receiptRho']) {
      assert.equal(source[key], local[key]);
    }
  });
  const serialized = JSON.stringify(dependency);
  for (const value of [target.localCapsule.chainDomain, target.localCapsule.actionCommitment, target.localCapsule.payoutCommitment,
    target.localCapsule.nodeCommitment, target.localCapsule.localCommitment, target.localCapsule.dispatchId,
    target.localCapsule.receiptKeyCommitment, target.localCapsule.receiptRho,
    ...input.nodes.map(node => node.receiptSpendSecret)]) assert.ok(!serialized.includes(value), value);
  assert.doesNotMatch(serialized, /receiptSpendSecret|localCapsule|graphNonce|activeCount|dependencyMask|targetSalt|signerIdentity/);
  assert.equal(dependencyCapsuleCommitment(dependency, capsule), prepared.statement.dependencyCapsuleCommitments[3]);
});

test('Ready/Node receive only own local capsule; only Node receives its receipt spend secret', () => {
  const { input, prepared } = fixture(4, 'chain');
  for (let i = 0; i < 4; i++) {
    const ready = prepared.readyRole(i), node = prepared.nodeRole(i), dependency = prepared.dependencyRole(i);
    assert.equal(node.receiptSpendSecret, h('nk:' + i));
    assert.equal(ready.localCapsule.active, true);
    assert.equal(ready.localCapsule.dummyTerminalTag, ZERO);
    assert.equal(localCapsuleCommitment(ready, ready.localCapsule), prepared.statement.localCapsuleCommitments[i]);
    assert.equal(dependency.dependencyCapsule.dependencyCount, i ? 1 : 0);
    if (i) assert.equal(dependency.dependencyCapsule.predecessors[0].sourceSlot, i - 1);
    for (const packet of [ready, node, dependency]) {
      const text = JSON.stringify(packet);
      assert.ok(!text.includes(input.signed.ownerWitness.graph.nonce));
      assert.doesNotMatch(text, /"(?:nonce|activeCount|dependencyMask|graph|nodes|targetSalt|ownerWitness|ownerSignature)"/);
      for (let j = 0; j < 4; j++) {
        if (packet !== node || j !== i) assert.ok(!text.includes(input.nodes[j].receiptSpendSecret));
      }
    }
    assert.doesNotMatch(JSON.stringify(ready), /predecessors|dependencyCapsule"|receiptSpendSecret/);
    assert.doesNotMatch(JSON.stringify(node), /predecessors|dependencyCapsule/);
  }
  assert.deepEqual(Object.keys(prepared).sort(), ['statement', 'readyRole', 'nodeRole', 'dependencyRole', 'ownerAuthorizationInputs'].sort());
  assert.doesNotMatch(JSON.stringify(prepared), /capsuleSalt|receiptRho|receiptSpendSecret|graphNonce/);
});

test('inactive slots bind exact graph empties and A0 payouts, zero native witnesses and unique dummy tags', () => {
  const { input, prepared } = fixture(1), s = input.signed.authorizationStatement;
  const witness = prepared.ownerAuthorizationInputs(codecOnlyA0(input.signed));
  const targets = [];
  for (let i = 0; i < 4; i++) {
    const node = prepared.nodeRole(i), c = node.localCapsule;
    targets.push(c.targetContext);
    assert.equal(c.nodeCommitment, input.signed.ownerWitness.graph.leaves[i]);
    assert.equal(c.payoutCommitment, s.outputs[i]);
    assert.equal(c.targetContext, h4('LIANUM/PAEG/readiness-target/2', [nativeProfile, b(input.hubDomain),
      b(prepared.statement.context), uintBE(i, 1), b(input.slotSalts[i].targetSalt)]));
    if (i) {
      assert.equal(c.active, false);
      assert.equal(node.action, null);
      assert.equal(node.receiptSpendSecret, ZERO);
      for (const key of ['localCommitment', 'dispatchId', 'chainDomain', 'evidencePolicy', 'actionCommitment', 'receiptKeyCommitment', 'receiptRho']) {
        assert.equal(c[key], ZERO);
      }
      assert.equal(c.dummyTerminalTag, h4('LIANUM/PAEG/unused-receipt-spend/2', [b(input.hubDomain), b(s.reserveNullifier),
        b(input.signed.ownerWitness.graph.nonce), uintBE(i, 1)]));
      assert.notEqual(c.nodeCommitment, ZERO); assert.notEqual(c.payoutCommitment, ZERO);
      assert.throws(() => prepared.readyRole(i), /PAEG_CAPSULE_INACTIVE_READY/);
      const dependency = prepared.dependencyRole(i).dependencyCapsule;
      assert.equal(dependency.dependencyCount, 0);
      for (const source of dependency.predecessors) assert.ok(Object.values(source).every(value => value === 0 || value === ZERO));
      assert.ok(Object.values(witness.witness.actions[i]).every(value => Array.isArray(value)
        ? value.every(byte => byte === 0) : value === 0 || value === '0'));
    }
  }
  assert.equal(new Set(targets).size, 4);
});

test('owner rejects graph changes, omitted nodes, spend substitutions and unknown signing-key fields', () => {
  const { input } = fixture(4);
  const mutations = [
    value => { value.signed.ownerWitness.graph.activeCount = 1; },
    value => { value.signed.ownerWitness.graph.nodes[3].dependencyIndexes = [0]; },
    value => { value.signed.ownerWitness.graph.nodes[3].dependsOn = ['node-0']; },
    value => { value.signed.ownerWitness.graph.leaves[1] = h('bad-leaf'); },
    value => { value.signed.authorizationStatement.outputs[3] = h('bad-payout'); },
    value => { value.signed.signatures.ownerSignature = '0'.repeat(128); },
    value => { value.signed.signatures.invoiceSignatures[0] = '0'.repeat(128); },
    value => { value.nodes.pop(); },
    value => { value.nodes[0].id = 'wrong'; },
    value => { value.nodes[0].receiptSpendSecret = h('wrong-spend-secret'); },
    value => { value.nodes[0].action.settleBefore = '1791000901'; },
    value => { value.nodes[0].action.chainDomain = h('wrong-chain'); },
    value => { value.nodes[0].action.destinationCommitment = h('wrong-destination'); },
    value => { value.slotSalts[0].targetSalt = ZERO; },
    value => { value.slotSalts[0].localCapsuleSalt = ZERO; },
    value => { value.ownerKey = 'forbidden'; },
    value => { value.nodes[0].privateKey = 'forbidden'; },
    value => { value.nodes[0].action.signingKey = 'forbidden'; },
    value => { value.signed.ownerWitness.inputNote.privateKey = 'forbidden'; },
    value => { value.signed.ownerWitness.recoveryNote.secret = { privateKey: 'forbidden' }; },
    value => { value.signed.ownerWitness.budget = { privateKey: 'forbidden' }; },
    value => { value.signed.ownerWitness.paddingSalts[0] = { privateKey: 'forbidden' }; },
    value => { value.signed.ownerWitness.graph.nodes[0].privateKey = 'forbidden'; },
  ];
  for (const mutate of mutations) {
    const bad = structuredClone(input); mutate(bad); assert.throws(() => prepareNativeCapsules(bad), /PAEG_CAPSULE/);
  }
});

test('pure witness conversion rejects malformed recursion arrays or a mismatched A0 statement', () => {
  const { input, prepared } = fixture(2);
  const valid = codecOnlyA0(input.signed);
  for (const mutate of [value => value.proofFields.pop(), value => value.vkFields.pop(), value => value.publicInputs.pop(),
    value => { value.publicInputs[0] = '0'; }, value => { value.vkFields[0] = '-1'; },
    value => { value.proofFields[0] = String(1n << 255n); }, value => { value.verified = true; }]) {
    const bad = structuredClone(valid); mutate(bad);
    assert.throws(() => prepared.ownerAuthorizationInputs(bad), /PAEG_CAPSULE_A0/);
  }
  assert.equal(NATIVE_CAPSULE_PROFILE.cryptographicAcceptance, false);
});

test('selectors return detached immutable packets and are insensitive to caller node array order', () => {
  const { input, prepared } = fixture(4), reordered = structuredClone(input);
  reordered.nodes.reverse();
  assert.deepEqual(prepareNativeCapsules(reordered).statement, prepared.statement);
  const expected = prepared.nodeRole(0);
  input.nodes[0].receiptSpendSecret = h('mutated-after-preparation');
  input.slotSalts[0].targetSalt = h('mutated-after-preparation');
  assert.deepEqual(prepared.nodeRole(0), expected);
  assert.notEqual(prepared.nodeRole(0), expected);
  assert.ok(Object.isFrozen(expected.localCapsule));
  assert.throws(() => { expected.localCapsule.slot = 1; }, TypeError);
  for (const badSlot of [-1, 4, '0', 0.5]) for (const method of ['readyRole', 'nodeRole', 'dependencyRole']) {
    assert.throws(() => prepared[method](badSlot), /PAEG_CAPSULE_SLOT/);
  }
});

test('role-local validated Noir converters need no owner or graph capability', () => {
  for (const count of [2, 4]) {
    const { input, prepared } = fixture(count);
    const all = prepared.ownerAuthorizationInputs(codecOnlyA0(input.signed)).witness;
    for (let i = 0; i < 4; i++) {
      const node = prepared.nodeRole(i), dependency = prepared.dependencyRole(i);
      assert.deepEqual(localCapsuleToNoir(node.localCapsule), all.local_capsules[i]);
      assert.deepEqual(dependencyCapsuleToNoir(dependency.dependencyCapsule), all.dependency_capsules[i]);
      if (i < count) assert.deepEqual(nativeActionToNoir(prepared.readyRole(i).action), all.actions[i]);
      else assert.throws(() => nativeActionToNoir(node.action), /PAEG_CAPSULE_ACTION_FIELDS/);
    }
    const local = structuredClone(prepared.nodeRole(0).localCapsule);
    assert.throws(() => localCapsuleToNoir({ ...local, active: 1 }), /PAEG_CAPSULE_ACTIVE/);
    assert.throws(() => localCapsuleToNoir({ ...local, receiptSpendSecret: h('bad') }), /PAEG_CAPSULE_LOCAL_FIELDS/);
    assert.throws(() => localCapsuleToNoir({ ...local, dummyTerminalTag: h('bad') }), /PAEG_CAPSULE_ACTIVE_DUMMY/);
    const empty = structuredClone(prepared.dependencyRole(0).dependencyCapsule);
    empty.predecessors[0].receiptRho = h('hidden-unused-data');
    assert.throws(() => dependencyCapsuleToNoir(empty), /PAEG_CAPSULE_UNUSED_PREDECESSOR/);
    const incoming = structuredClone(prepared.dependencyRole(count - 1).dependencyCapsule);
    incoming.predecessors[0].sourceSlot = count - 1;
    assert.throws(() => dependencyCapsuleToNoir(incoming), /PAEG_CAPSULE_DEPENDENCY_ORDER/);
    if (count === 4) {
      const duplicate = structuredClone(prepared.dependencyRole(3).dependencyCapsule);
      duplicate.predecessors[1] = structuredClone(duplicate.predecessors[0]);
      assert.throws(() => dependencyCapsuleToNoir(duplicate), /PAEG_CAPSULE_DEPENDENCY_ORDER/);
    } else {
      const inactive = structuredClone(prepared.nodeRole(3).localCapsule); inactive.receiptRho = h('bad-padding');
      assert.throws(() => localCapsuleToNoir(inactive), /PAEG_CAPSULE_INACTIVE_NATIVE/);
    }
  }
});

// A lightweight source transcript check, not execution of Noir. Reconstruct the
// literal offsets and flat expressions from its framing source and compare to
// the independent host encodings. This catches byte/length/order drift without
// running the compiler while the native build owns the machine.
function noirFramingTranscript(name, values) {
  const source = readFileSync(new URL('../../../../circuits/generic-native/lib/src/capsule_framing.nr', import.meta.url), 'utf8');
  const body = source.slice(source.indexOf(`pub fn ${name}(`)).split('\n}\n')[0];
  const length = Number(/let mut message: \[u8; (\d+)\]/.exec(body)?.[1]);
  assert.ok(length > 0);
  const message = Buffer.alloc(length), written = Buffer.alloc(length);
  const resolve = expression => {
    let expr = expression.trim();
    const numberBytes = /^(u64_bytes|u128_bytes)\((.+)\)$/.exec(expr);
    if (numberBytes) return uintBE(resolve(numberBytes[2]), numberBytes[1] === 'u64_bytes' ? 8 : 16);
    if (expr.startsWith('[')) return expr.slice(1, -1).split(',').map(item => Number(resolve(item.replace(' as u8', ''))));
    if (/^\d+$/.test(expr)) return Number(expr);
    return expr.replaceAll('[', '.').replaceAll(']', '').split('.').reduce((value, key) => value[key], values);
  };
  for (const match of body.matchAll(/message = part\(message, (\d+), (.+)\);/g)) {
    const offset = Number(match[1]), value = Buffer.from(resolve(match[2])), framed = Buffer.concat([uintBE(value.length, 4), value]);
    assert.ok(offset + framed.length <= length);
    for (let i = offset; i < offset + framed.length; i++) { assert.equal(written[i], 0); written[i] = 1; }
    framed.copy(message, offset);
  }
  assert.ok(written.every(byte => byte === 1), name + ' has framing holes');
  const sha = /sha256::<(\d+), (\d+)>/.exec(body);
  assert.equal(Number(sha[1]), length);
  assert.equal(Number(sha[2]), Math.ceil((length + 9) / 64) * 64);
  return createHash('sha256').update(message).digest('hex');
}

test('all seven Noir framing transcripts match exact JS H4 bytes, including bool/u128 and tuple padding', () => {
  const { input, prepared } = fixture(2), s = input.signed.authorizationStatement;
  const abi = prepared.ownerAuthorizationInputs(codecOnlyA0(input.signed)), w = abi.witness;
  const ownerWords = fundedAuthorizationWords(s);
  const digests = Array.from({ length: 17 }, (_, i) => b(digestFromWords(ownerWords.slice(i * 8, i * 8 + 8))));
  const common = { hub: b(input.hubDomain), registry: b(input.registryCommitment), context: b(prepared.statement.context) };
  assert.equal(noirFramingTranscript('a0_context', { digests, times: ownerWords.slice(136) }), prepared.statement.context);
  assert.equal(noirFramingTranscript('receipt_key', { hub: common.hub, nk: b(input.nodes[0].receiptSpendSecret) }),
    input.nodes[0].action.receiptKeyCommitment);
  assert.equal(noirFramingTranscript('native_transfer_action', { action: w.actions[0] }), prepared.nodeRole(0).localCapsule.actionCommitment);
  for (let i = 0; i < 4; i++) {
    assert.equal(noirFramingTranscript('target_context', { ...common, slot: i, salt: w.target_salts[i] }),
      prepared.nodeRole(i).localCapsule.targetContext);
    assert.equal(noirFramingTranscript('local_capsule', { ...common, capsule: w.local_capsules[i] }), prepared.statement.localCapsuleCommitments[i]);
    assert.equal(noirFramingTranscript('dependency_capsule', { ...common, capsule: w.dependency_capsules[i] }), prepared.statement.dependencyCapsuleCommitments[i]);
    if (i >= 2) assert.equal(noirFramingTranscript('unused_receipt_spend', { hub: common.hub,
      reserve_nf: b(s.reserveNullifier), graph_nonce: w.graph.nonce, slot: i }), prepared.nodeRole(i).localCapsule.dummyTerminalTag);
  }
});
