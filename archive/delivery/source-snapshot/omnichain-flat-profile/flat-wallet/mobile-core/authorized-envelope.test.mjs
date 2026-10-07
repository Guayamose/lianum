/** Lightweight host boundaries only. The injected SHA-based test function is
 * deliberately NOT Poseidon2 and provides NO cryptographic conformance claim.
 * No Noir, WASM, proof backend, native executable or network is started. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { buildAuthorizedEnvelope } from './authorized-envelope.mjs';
import { createCommitmentCodec, canonicalField, rawDigestLimbs, bytes32, validateStruct,
  structToNoir, digestBytes, digestWords, FIELD_MODULUS, PROFILE_FIELD, ZERO }
  from '../wallet-platform/modules/paeg/commitments.mjs';
import { authorizationInputs } from '../../../omnichain-product/experiments/private-core-proof/generic-funding/witness.mjs';
import { compileFundedGraph, fundedSigningRequests, attachFundedSignatures }
  from '../../../omnichain-product/src/paeg/funded-graph.mjs';
import { prepareNativeCapsules, nativeReceiptKeyCommitment, nativeTransferActionCommitment,
  localCapsuleToNoir, dependencyCapsuleToNoir, nativeActionToNoir }
  from '../../../omnichain-product/src/paeg/native-capsules.mjs';
import { freshKey, signature } from '../../../omnichain-product/src/private-note-encoding.mjs';

const h = label => createHash('sha256').update('flat owner test: ' + label).digest('hex');
const f = value => BigInt(value).toString(16).padStart(64, '0');
const hx = value => Buffer.from(value).toString('hex');
const testHashFields = async fields => '00' + createHash('sha256')
  .update(fields.map(value => value.toString()).join(':')).digest('hex').slice(2);
const options = { hashFields: testHashFields };
const domain = () => ({ scope: h('scope'), policy: h('policy'), asset: h('asset'), hubDomain: h('hub'),
  registryCommitment: h('registry'), verifierSetCommitment: h('verifiers'), ledgerNamespace: h('hub') });
const note = (key, value, label) => ({ type: 4, rho: h(label + ':rho'), x: hx(key.x), y: hx(key.y),
  value: String(value), secret: h(label + ':secret') });

function fixture(count = 4) {
  const owner = freshKey(), change = freshKey(), recovery = freshKey();
  const recipients = Array.from({ length: count }, () => freshKey());
  const nodes = Array.from({ length: count }, (_, i) => ({ id: 'node-' + i,
    receiptSpendSecret: h('receipt-secret:' + i), action: {
      chainDomain: h('chain:' + i), signerIdentity: h('signer:' + i), sourceCommitment: h('source:' + i),
      destinationCommitment: h('destination:' + i), amount: String((1n << 80n) + BigInt(i + 1)),
      custodyKind: 1, custodyCommitment: h('custody:' + i), executionFrom: '100', executionUntil: '800',
      settleBefore: '900', receiptKeyCommitment: nativeReceiptKeyCommitment(h('hub'), h('receipt-secret:' + i)),
      receiptRho: h('receipt-rho:' + i), deliveryRiskCommitment: h('risk:' + i), actionSalt: h('action-salt:' + i),
    } }));
  const compiled = compileFundedGraph({ ...Object.fromEntries(['scope', 'policy', 'asset'].map(key => [key, h(key)])),
    operationId: h('operation'), budget: String(count * 25), fundingNotBefore: '100', fundingValidUntil: '300', settleBefore: '900',
    reservationNonce: h('reservation-nonce'), reserveSecret: h('reserve-secret'), graphNonce: h('graph-nonce'),
    inputNote: note(owner, count * 25 + 7, 'input'), changeNote: note(change, 7, 'change'),
    recoveryNote: note(recovery, count * 25, 'recovery'),
    nodes: nodes.map((node, i) => ({ id: node.id, chainDomain: node.action.chainDomain,
      evidencePolicy: h('evidence:' + i), actionCommitment: nativeTransferActionCommitment(node.action),
      dependsOn: i === count - 1 ? Array.from({ length: i }, (_, p) => 'node-' + p) : [],
      payout: { x: hx(recipients[i].x), y: hx(recipients[i].y), value: '25', secret: h('payout-secret:' + i),
        randomness: h('payout-randomness:' + i) } })),
    paddingSalts: Array.from({ length: 4 }, (_, i) => h('padding:' + i)),
  });
  const requests = fundedSigningRequests(compiled);
  const signed = attachFundedSignatures(compiled, { ownerSignature: hx(signature(owner, requests.owner.message)),
    invoiceSignatures: requests.invoices.map(request => hx(signature(recipients[request.slot], request.message))) });
  return { signed, domain: domain(), capsuleOptions: { nodes,
    slotSalts: Array.from({ length: 4 }, (_, i) => ({ targetSalt: h('target:' + i), localCapsuleSalt: h('local:' + i),
      dependencyCapsuleSalt: h('dependency:' + i) })) },
    joinBlinds: Array.from({ length: 4 }, (_, i) => h('join:' + i)),
    leafBlinds: Array.from({ length: 16 }, (_, i) => h('leaf:' + i)),
  };
}

test('canonical field/raw digest inputs reject aliases before hashing', async () => {
  assert.equal(canonicalField(f(FIELD_MODULUS - 1n)), FIELD_MODULUS - 1n);
  assert.throws(() => canonicalField(f(FIELD_MODULUS)), /FIELD_RANGE/);
  assert.deepEqual(rawDigestLimbs('f'.repeat(64)), [(1n << 128n) - 1n, (1n << 128n) - 1n]);
  for (const bad of [ZERO + '\n', ZERO + '\r', '0x' + ZERO, 'A'.repeat(64), '0'.repeat(63)])
    assert.throws(() => bytes32(bad), /COMMITMENT/);
  assert.throws(() => bytes32(ZERO, true), /NONZERO/);
  let calls = 0;
  const codec = createCommitmentCodec({ hashFields: async fields => { calls++; return testHashFields(fields); } });
  const core = { context: h('context'), reserveCommitment: h('reserve'), reserveNullifier: h('nf'), settleBefore: '900' };
  for (const bad of ['01', '1\n', '+1', '-1', 1, String(1n << 64n)])
    assert.throws(() => codec.coreLeaf(f(1), { ...core, settleBefore: bad }, h('blind')), /COMMITMENT/);
  assert.throws(() => codec.coreLeaf(f(FIELD_MODULUS), core, h('blind')), /FIELD_RANGE/);
  const accessor = { ...core }; Object.defineProperty(accessor, 'context', { get() { throw Error('getter executed'); }, enumerable: true });
  assert.throws(() => codec.coreLeaf(f(1), accessor, h('blind')), /DATA_FIELDS/);
  assert.throws(() => validateStruct('core', new Proxy(core, {})), /PLAIN_RECORD/);
  assert.equal(calls, 0);
  await assert.rejects(createCommitmentCodec({ hashFields: async () => f(FIELD_MODULUS) }).domainCommitment(domain()), /FIELD_RANGE/);
  await assert.rejects(createCommitmentCodec({ hashFields: async () => ZERO + '\n' }).domainCommitment(domain()), /HEX_LENGTH/);
});

test('all eighteen whole tuple lengths and critical limb orders match the fixed source schemas', async () => {
  const calls = [];
  const codec = createCommitmentCodec({ hashFields: async fields => {
    assert.ok(Object.isFrozen(fields)); calls.push([...fields]); return testHashFields(fields);
  } });
  const input = fixture(4), owner = await buildAuthorizedEnvelope(input, options);
  const reservation = owner.reservation().select(), recovery = owner.recovery().select(), assembler = owner.assembler().select();
  const local = owner.local(3).select(), dependency = owner.dependency(3).select();
  const d = f(1), e = f(2), blind = h('blind');
  const completion = { hubDomain: h('hub'), registryCommitment: h('registry'), evidenceState: f(3), context: h('context'),
    payoutCommitment: h('payout'), terminalReceiptTag: h('tag'), slot: '3', validFrom: '100', validUntil: '200' };
  const state = { hubDomain: h('hub'), registryCommitment: h('registry'), receiptRoot: f(4), receiptCount: '1',
    revokedDigest: f(5), revokedCount: '0', revocationSequence: '2' };
  const join = { envelope: e, targetContext: h('target'), authorizationRoot: f(6), checkpoint: 'f'.repeat(64),
    readinessEvidenceState: f(7), readyFrom: '100', readyUntil: '200', targetJoinBlind: h('join') };
  const ready = { ...Object.fromEntries(['scope', 'policy', 'asset', 'hubDomain', 'registryCommitment', 'snapshotDigest',
    'localCommitment', 'dispatchId', 'chainDomain', 'evidencePolicy', 'actionCommitment', 'payoutCommitment'].map(key => [key, h(key)])),
    readyFrom: '100', readyUntil: '200' };
  await codec.domainCommitment(input.domain);
  await codec.coreLeaf(d, reservation.core.value, blind);
  await codec.localLeaf(d, local.local.value, blind);
  await codec.completionCommitment(d, e, completion, blind);
  await codec.evidenceStateDigest(d, state);
  await codec.revokedDigest(d, h('hub'), Array(64).fill(ZERO), '0');
  await codec.authorizationLeaf(d, e); await codec.receiptLeaf(d, 'f'.repeat(64)); await codec.emptyLeaf(d, 0);
  await codec.nodeHash(d, 2, 6, f(8), f(9));
  await codec.fundingLeaf(d, reservation.funding.value, blind); await codec.recoveryLeaf(d, recovery.recovery.value, blind);
  await codec.settlementLeaf(d, assembler.settlement.value, blind); await codec.dependencyLeaf(d, dependency.dependency.value, blind);
  await codec.payoutLeaf(d, assembler.payouts[0].value, blind); await codec.joinCommitment(d, join);
  await codec.readinessCommitment(d, f(10), blind, ready);
  await codec.admissionRevocationState(d, { currentRevokedDigest: f(11), currentRevokedCount: '64', currentRevocationSequence: '12' });
  const lengths = [18, 16, 37, 22, 14, 137, 6, 8, 6, 9, 21, 16, 24, 74, 12, 16, 34, 8];
  assert.equal(calls.length, 18);
  calls.forEach((fields, i) => {
    assert.equal(fields.length, lengths[i]);
    assert.deepEqual(fields.slice(0, 4), [PROFILE_FIELD, 1n, BigInt(i + 1), BigInt(lengths[i] - 4)]);
  });
  assert.deepEqual(calls[10].slice(17, 19), rawDigestLimbs(input.signed.authorizationStatement.operationId));
  assert.deepEqual(calls[10].slice(19), [100n, 300n]);
  assert.deepEqual(calls[13].slice(13, 32), [0n, ...['sourceNodeCommitment', 'sourceLocalCommitment', 'sourceDispatchId',
    'chainDomain', 'evidencePolicy', 'actionCommitment', 'payoutCommitment', 'receiptKeyCommitment', 'receiptRho']
    .flatMap(key => rawDigestLimbs(dependency.dependency.value.predecessors[0][key]))]);
  assert.deepEqual(calls[15].slice(4), [1n, 2n, ...rawDigestLimbs(join.targetContext), 6n,
    ...rawDigestLimbs(join.checkpoint), 7n, 100n, 200n, ...rawDigestLimbs(join.targetJoinBlind)]);
  assert.deepEqual(calls[16].slice(18, 20), rawDigestLimbs(ready.snapshotDigest));
  assert.equal(calls[3][12], 3n); // F(evidenceState), not a B32 pair.
});

test('fixed revocation vector rejects duplicates, nonzero padding, holes and wrong counts', async () => {
  const codec = createCommitmentCodec(options), entries = [h('revoked'), ...Array(63).fill(ZERO)];
  await codec.revokedDigest(f(1), h('hub'), entries, '1');
  for (const [vector, count] of [[entries.slice(0, 63), '1'], [[h('revoked'), h('revoked'), ...Array(62).fill(ZERO)], '2'],
    [entries, '0'], [Array(64).fill(ZERO), '1'], [entries, '65']])
    assert.throws(() => codec.revokedDigest(f(1), h('hub'), vector, count), /COMMITMENT/);
  const hole = [...entries]; delete hole[3];
  assert.throws(() => codec.revokedDigest(f(1), h('hub'), hole, '1'), /ARRAY_PROPERTIES|DENSE_ARRAY/);
});

test('typed trees bind kind, levels, full depth and occupied indexes', async () => {
  const codec = createCommitmentCodec(options), d = f(1);
  const leaves = Array.from({ length: 16 }, (_, i) => f(i + 10));
  const tree = await codec.buildTree(d, 1, leaves);
  for (const index of [0, 1, 7, 15]) {
    const proof = tree.opening(index);
    assert.equal(await codec.membershipRoot(d, 1, proof.leaf, proof.siblings, index), tree.root);
  }
  assert.throws(() => tree.opening(16), /CONTROL_RANGE/);
  await assert.rejects(codec.membershipRoot(d, 1, f(10), Array(4).fill(ZERO), 16), /CONTROL_RANGE/);
  await assert.rejects(codec.membershipRoot(d, 1, f(10), Array(4).fill(f(FIELD_MODULUS)), 0), /FIELD_RANGE/);
  await assert.rejects(codec.buildTree(d, 1, leaves.slice(1)), /TREE_CAPACITY/);
  await assert.rejects(codec.buildTree(d, 0, [await codec.emptyLeaf(d, 0)]), /EMPTY_OCCUPIED/);
  await assert.rejects(codec.buildTree(d, 0, [ZERO]), /NONZERO/);
  assert.notEqual(await codec.emptySubtree(d, 0), await codec.emptySubtree(d, 2));
  assert.equal((await codec.buildTree(d, 0, [])).root, await codec.emptySubtree(d, 0));
  const sparse = await codec.buildTree(d, 2, [f(2)]);
  assert.equal(sparse.opening(0).siblings.length, 6);
  assert.throws(() => sparse.opening(1), /UNOCCUPIED/);
});

test('U uses the same real signed owner statement and pure capsule witnesses including exact inactive zeros', async () => {
  for (const count of [1, 4]) {
    const input = fixture(count), owner = await buildAuthorizedEnvelope(input, options);
    const statement = owner.publicStatement(), u = owner.ownerAuthorizationInputs();
    const legacy = authorizationInputs(input.signed);
    const capsules = prepareNativeCapsules({ signed: input.signed, hubDomain: input.domain.hubDomain,
      registryCommitment: input.domain.registryCommitment, ...input.capsuleOptions });
    assert.deepEqual(u.owner_witness, legacy.witness);
    assert.deepEqual(u.capsule_witness.graph, legacy.witness.graph);
    assert.deepEqual(u.owner_statement.operation_id, digestBytes(input.signed.authorizationStatement.operationId));
    assert.deepEqual(u.domain_commitment, digestWords(statement.domainCommitment));
    assert.deepEqual(u.envelope, digestWords(statement.envelope));
    assert.equal(u.owner_statement.funding_not_before, '100');
    assert.deepEqual(u.owner_statement.outputs, input.signed.authorizationStatement.outputs.map(digestBytes));
    assert.deepEqual(u.join_blinds, input.joinBlinds.map(digestBytes));
    assert.deepEqual(u.leaf_blinds, input.leafBlinds.map(digestBytes));
    assert.doesNotMatch(JSON.stringify(u), /privateKey|owner_proof|owner_vk|proofFields|vkFields/);
    for (let i = 0; i < 4; i++) {
      assert.deepEqual(u.capsule_witness.local_capsules[i], localCapsuleToNoir(capsules.nodeRole(i).localCapsule));
      assert.deepEqual(u.capsule_witness.dependency_capsules[i], dependencyCapsuleToNoir(capsules.dependencyRole(i).dependencyCapsule));
      assert.deepEqual(u.capsule_witness.target_salts[i], digestBytes(input.capsuleOptions.slotSalts[i].targetSalt));
      if (i < count) assert.deepEqual(u.capsule_witness.actions[i], nativeActionToNoir(capsules.nodeRole(i).action));
      else {
        assert.equal(owner.local(i).select().action, null);
        assert.equal(owner.local(i).select().receiptSpendSecret, ZERO);
        assert.ok(Object.values(u.capsule_witness.actions[i]).every(value => Array.isArray(value)
          ? value.every(byte => byte === 0) : value === 0 || value === '0'));
      }
      assert.equal(owner.local(i).select().local.value.targetJoinBlind, owner.dependency(i).select().dependency.value.targetJoinBlind);
    }
  }
});

test('role capabilities disclose only their leaf openings, remain independent, and survive owner destroy', async () => {
  const input = fixture(4), owner = await buildAuthorizedEnvelope(input, options), codec = createCommitmentCodec(options);
  const localCap = owner.local(3), depCap = owner.dependency(3), assemblerCap = owner.assembler(), recoveryCap = owner.recovery();
  const local = localCap.select(), dep = depCap.select(), assembler = assemblerCap.select(), recovery = recoveryCap.select();
  for (const cap of [owner, localCap, depCap, assemblerCap, recoveryCap]) {
    assert.deepEqual(Object.keys(cap), []); assert.equal(Object.getPrototypeOf(cap), null);
    assert.throws(() => JSON.stringify(cap), /NOT_SERIALIZABLE/);
  }
  assert.equal(localCap.ownerAuthorizationInputs, undefined);
  assert.deepEqual(Object.keys(local).sort(), ['action', 'core', 'domain', 'domainCommitment', 'envelope', 'local', 'receiptSpendSecret']);
  assert.deepEqual(Object.keys(dep).sort(), ['core', 'dependency', 'domain', 'domainCommitment', 'envelope']);
  const localText = JSON.stringify(local), depText = JSON.stringify(dep);
  assert.doesNotMatch(localText, /predecessors|dependencyCount|ownerWitness|targetSalt|graph/);
  assert.doesNotMatch(depText, /receiptSpendSecret|signerIdentity|destinationCommitment|"action"|"local"/);
  for (const text of [JSON.stringify(assembler), JSON.stringify(recovery)])
    assert.doesNotMatch(text, /receiptSpendSecret|predecessors|signerIdentity|destinationCommitment|"action"|"local"|"dependency"/);
  for (let i = 0; i < 4; i++) {
    assert.ok(!depText.includes(input.capsuleOptions.nodes[i].receiptSpendSecret));
    if (i !== 3) {
      assert.ok(!localText.includes(input.capsuleOptions.nodes[i].receiptSpendSecret));
      assert.ok(!localText.includes(owner.local(i).select().local.value.nodeCommitment));
    }
  }
  assert.ok(Object.isFrozen(local.local.value));
  assert.throws(() => { local.local.value.slot = '0'; }, TypeError);
  assert.notEqual(localCap.select(), local);
  const proof = local.local;
  assert.equal(await codec.membershipRoot(local.domainCommitment, 1, proof.leaf, proof.siblings, proof.index), local.envelope);
  assert.deepEqual(structToNoir('local', local.local.value).target_join_blind, digestBytes(input.joinBlinds[3]));
  input.capsuleOptions.nodes[3].receiptSpendSecret = h('later caller mutation');
  assert.deepEqual(localCap.select(), local);
  owner.destroy(); owner.destroy();
  assert.throws(() => owner.ownerAuthorizationInputs(), /DESTROYED/);
  assert.throws(() => owner.local(0), /DESTROYED/);
  assert.throws(() => owner.publicStatement(), /DESTROYED/);
  assert.deepEqual(localCap.select(), local); assert.deepEqual(depCap.select(), dep);
  assert.deepEqual(assemblerCap.select(), assembler); assert.deepEqual(recoveryCap.select(), recovery);
});

test('owner refuses altered signatures, domain, namespace, secrets, padding and extra key material', async () => {
  const input = fixture(1);
  const mutations = [
    value => { value.signed.signatures.ownerSignature = '0'.repeat(128); },
    value => { value.signed.authorizationStatement.outputs[0] = h('wrong'); },
    value => { value.signed.admissionTag = h('wrong'); },
    value => { value.domain.scope = h('wrong'); },
    value => { value.domain.ledgerNamespace = h('wrong'); },
    value => { value.capsuleOptions.nodes[0].receiptSpendSecret = h('wrong'); },
    value => { value.joinBlinds[0] = ZERO; },
    value => { value.leafBlinds[0] = ZERO + '\n'; },
    value => { value.signed.ownerWitness.inputNote.privateKey = 'forbidden'; },
    value => { value.capsuleOptions.nodes[0].privateKey = 'forbidden'; },
    value => { value.capsuleOptions.slotSalts.pop(); },
  ];
  for (const mutate of mutations) {
    const altered = structuredClone(input); mutate(altered);
    await assert.rejects(buildAuthorizedEnvelope(altered, options));
  }
  const accessor = structuredClone(input);
  Object.defineProperty(accessor.signed, 'signatures', { get() { throw Error('accessor executed'); }, enumerable: true });
  await assert.rejects(buildAuthorizedEnvelope(accessor, options), /DATA_FIELDS/);
});
