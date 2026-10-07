/** Host fixture boundaries only; this deterministic SHA-based injected hash
 * is NOT Poseidon2. No Noir, native executable, WASM or proof backend runs. */
import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash, createPublicKey, verify } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { buildSyntheticEnvelopeFixture } from './synthetic-envelope-fixture.mjs';
import { reservationWitness, recoveryWitness } from '../../../../../packages/backend/src/execution/account/preparation/funding-inputs.mjs';
import { createCommitmentCodec, digestBytes, FIELD_MODULUS, ZERO }
  from '../../../../../packages/backend/src/execution/encoding/commitments.mjs';
import { RELATIONS, encodeStatement } from '../../../../../packages/backend/src/execution/encoding/statements.mjs';
import { fundedAdmission, fundedHash } from '../../../../../packages/engine/src/execution/graph/funded-graph.mjs';
import { verifyPrivateNotePath } from '../../../../../packages/engine/src/notes/private-note-tree.mjs';
import { nativeDispatchStatementFrame, nativeDeliveryRiskCommitment }
  from '../../../../../packages/engine/src/execution/native/dispatch/native-admission.mjs';
import { nativeFactIdentity, nativeObservedEffectCommitment, encodeNativeFacts, validateSolanaBindingTransaction }
  from '../../../../../packages/backend/src/chains/shared/dispatch/native-receipt-binding.mjs';

const h = value => createHash('sha256').update(value).digest('hex');
const options = { hashFields: async fields => '00' + h(fields.map(String).join(':')).slice(2) };
const fixture = await buildSyntheticEnvelopeFixture(options);
const stateForS = () => ({ inputRoot: fixture.public.poolBefore.root, inputPath: fixture.public.poolBefore.inputPath });
const stateForF = () => ({ authorizationRoot: fixture.public.authorization.root, authorizationPath: fixture.public.authorization.path,
  poolRoot: fixture.public.poolAfter.root, reservePath: fixture.public.poolAfter.reservePath });
const wordsFromInputs = (relation, inputs) => RELATIONS[relation].fields.flatMap(({ name }) => {
  const value = inputs[name.replace(/[A-Z]/g, letter => '_' + letter.toLowerCase())];
  return (Array.isArray(value) ? value.flat(Infinity) : [value]).map(String);
});
const checkSignature = (key, message, signature) => verify('sha256', message, { dsaEncoding: 'ieee-p1363',
  key: createPublicKey({ format: 'jwk', key: { kty: 'EC', crv: 'secp256k1',
    x: Buffer.from(key.x, 'hex').toString('base64url'), y: Buffer.from(key.y, 'hex').toString('base64url') } }) },
Buffer.from(signature, 'hex'));

test('genuine two-leg BTC to SOL U/S/F fixture has exact current ABI and deterministic public statements', async () => {
  assert.equal(fixture.synthetic, true);
  assert.deepEqual(fixture.public.native.chains, ['BTC', 'SOL']);
  const u = fixture.jobs.authorization.inputs;
  assert.equal(u.owner_witness.graph.active_count, 2);
  assert.equal(u.capsule_witness.dependency_capsules[0].dependency_count, 0);
  assert.equal(u.capsule_witness.dependency_capsules[1].dependency_count, 1);
  assert.equal(u.capsule_witness.dependency_capsules[1].predecessors[0].source_slot, 0);
  assert.deepEqual(u.capsule_witness.dependency_capsules[1].predecessors[0].source_node_commitment,
    u.capsule_witness.local_capsules[0].node_commitment);
  for (const [name, job] of Object.entries(fixture.jobs)) {
    assert.deepEqual(job.publicInputs, [...encodeStatement(name, job.statement)]);
    assert.deepEqual(job.publicInputs, wordsFromInputs(name, job.inputs));
    assert.equal(job.publicInputs.length, { authorization: 16, reservation: 58, recovery: 41 }[name]);
    const main = readFileSync(new URL('../proof-relations/' + name + '/src/main.nr', import.meta.url), 'utf8');
    const params = main.slice(main.indexOf('fn main('), main.indexOf(') {', main.indexOf('fn main(')));
    const names = [...params.matchAll(/^\s+(\w+): /gm)].map(match => match[1]);
    assert.deepEqual(Object.keys(job.inputs).sort(), names.sort(), name + ' exact source ABI parameter names');
  }
  const second = await buildSyntheticEnvelopeFixture(options);
  assert.deepEqual(second.public, fixture.public);
  second.destroy();
  assert.doesNotMatch(JSON.stringify(fixture.jobs), /privateKey|proofFields|vkFields|owner_proof|owner_vk/);
});

test('pool paths use the legacy SHA tree and authorization membership uses actual purpose7(D,E)', async () => {
  const { poolBefore, poolAfter, authorization, statements } = fixture.public;
  assert.equal(poolBefore.count, 1); assert.equal(poolAfter.count, 3); assert.equal(authorization.count, 1);
  assert.ok(verifyPrivateNotePath({ ...poolBefore.inputPath, root: poolBefore.root }));
  assert.ok(verifyPrivateNotePath({ ...poolAfter.reservePath, root: poolAfter.root }));
  assert.ok(verifyPrivateNotePath({ ...poolAfter.changePath, root: poolAfter.root }));
  assert.equal(poolAfter.reservePath.leaf, statements.reservation.reserveCommitment);
  assert.equal(poolAfter.changePath.leaf, statements.reservation.changeCommitment);
  const codec = createCommitmentCodec(options), u = statements.authorization;
  assert.equal(authorization.path.leaf, await codec.authorizationLeaf(u.domainCommitment, u.envelope));
  assert.equal(authorization.root, await codec.membershipRoot(u.domainCommitment, 0, authorization.path.leaf,
    authorization.path.siblings, authorization.path.index));
  assert.deepEqual(fixture.jobs.recovery.inputs.reserve_siblings, poolAfter.reservePath.siblings.map(digestBytes));
  assert.equal(statements.reservation.admissionTag, fundedAdmission({ ...fixture.public.domain,
    operationId: fixture.scoped.reservation.funding.value.operationId }));
});

test('S/F codecs require only the matching role packet and reject mismatched scope, leaf, index and paths', async () => {
  assert.deepEqual(await reservationWitness(fixture.scoped.reservation, stateForS(), options), fixture.jobs.reservation);
  assert.deepEqual(await recoveryWitness(fixture.scoped.recovery, stateForF(), options), fixture.jobs.recovery);
  await assert.rejects(reservationWitness(fixture.scoped.local[0], stateForS(), options), /EXACT_FIELDS/);
  await assert.rejects(recoveryWitness(fixture.scoped.assembler, stateForF(), options), /EXACT_FIELDS/);
  for (const change of [
    value => { value.domain.scope = h('wrong-scope'); },
    value => { value.funding.value.operationId = h('wrong-operation'); },
    value => { value.funding.index = 2; },
    value => { value.funding.siblings[0] = ZERO; },
    value => { value.owner_witness = {}; },
  ]) {
    const bad = structuredClone(fixture.scoped.reservation); change(bad);
    await assert.rejects(reservationWitness(bad, stateForS(), options));
  }
  const wrongNote = structuredClone(stateForS()); wrongNote.inputPath.siblings[0] = h('wrong-sibling');
  await assert.rejects(reservationWitness(fixture.scoped.reservation, wrongNote, options), /NOTE_MEMBERSHIP/);
  const wrongLeaf = structuredClone(stateForS()); wrongLeaf.inputPath.leaf = h('wrong-leaf');
  await assert.rejects(reservationWitness(fixture.scoped.reservation, wrongLeaf, options), /NOTE_COMMITMENT/);
  const wrongAuth = structuredClone(stateForF()); wrongAuth.authorizationPath.siblings[0] = ZERO;
  await assert.rejects(recoveryWitness(fixture.scoped.recovery, wrongAuth, options), /AUTHORIZATION_MEMBERSHIP/);
  const noncanonical = structuredClone(stateForF());
  noncanonical.authorizationRoot = FIELD_MODULUS.toString(16).padStart(64, '0');
  await assert.rejects(recoveryWitness(fixture.scoped.recovery, noncanonical, options), /FIELD_RANGE/);
  const wrongIndex = structuredClone(stateForF()); wrongIndex.reservePath.index = 64;
  await assert.rejects(recoveryWitness(fixture.scoped.recovery, wrongIndex, options), /PATH_INDEX/);
  assert.doesNotMatch(JSON.stringify([fixture.jobs.reservation.inputs, fixture.jobs.recovery.inputs]),
    /owner_witness|owner_signature|receipt_spend_secret|predecessors|signer_identity|input_note/);
});

test('six future constraint negatives keep valid ABI encodings and mutated public self-agreement', () => {
  assert.equal(fixture.negativeCases.length, 6);
  assert.equal(new Set(fixture.negativeCases.map(item => item.name)).size, 6);
  for (const item of fixture.negativeCases) {
    assert.match(item.name, /^[a-z][a-z0-9-]{0,70}$/);
    assert.deepEqual(Object.keys(item).sort(), ['inputs', 'name', 'publicInputs', 'relation']);
    assert.deepEqual(item.publicInputs, wordsFromInputs(item.relation, item.inputs));
    assert.deepEqual(Object.keys(item.inputs), Object.keys(fixture.jobs[item.relation].inputs));
    assert.notDeepEqual(item.inputs, fixture.jobs[item.relation].inputs);
  }
  for (const name of ['s-changed-input-nullifier', 'f-changed-reserve-nullifier']) {
    const item = fixture.negativeCases.find(value => value.name === name);
    assert.notDeepEqual(item.publicInputs, fixture.jobs[item.relation].publicInputs);
  }
  // No assertion about circuit rejection is made here; these are future ACVM inputs.
});

test('raw native endpoints open exact original H4 commitments and the one-key SOL capability signs the bounded wire', () => {
  for (let slot = 0; slot < 2; slot++) {
    const endpoint = fixture.public.native.endpoints[slot], rule = fixture.public.native.rules[slot];
    const family = slot ? 'SOL' : 'BTC';
    for (const side of ['source', 'destination']) {
      const raw = endpoint[side + 'Endpoint'];
      assert.match(raw, slot ? /^[0-9a-f]{64}$/ : /^0014[0-9a-f]{40}$/);
      const cm = fundedHash('LIANUM/PAEG/native-endpoint/2', [Buffer.from('LIANUM_PAEG_NATIVE_4_V2'), Buffer.from(family),
        Buffer.from(rule.genesis, 'hex'), Buffer.from(rule.asset, 'hex'),
        Buffer.from(slot ? 'SOL_PUBLIC_KEY' : 'BTC_P2WPKH_SCRIPT'), Buffer.from(raw, 'hex')]);
      assert.equal(cm, endpoint[side + 'Commitment']);
      assert.equal(cm, fixture.scoped.local[slot].action[side + 'Commitment']);
    }
    if (!slot) assert.equal(endpoint.sourceEndpoint, '0014' + createHash('ripemd160')
      .update(createHash('sha256').update(Buffer.from(endpoint.sourceCompressedPublicKey, 'hex')).digest()).digest('hex'));
  }
  const endpoint = fixture.public.native.endpoints[1], action = fixture.scoped.local[1].action;
  const intent = { sourcePublicKey: endpoint.sourceEndpoint, recipientPublicKey: endpoint.destinationEndpoint,
    recentBlockhash: h('synthetic recent blockhash'), lamports: action.amount, wireKeyCommitment: action.receiptKeyCommitment };
  const transaction = fixture.signers.native.solana.signTransaction(intent);
  const checked = validateSolanaBindingTransaction(transaction, intent);
  assert.equal(checked.wireKeyCommitment, action.receiptKeyCommitment);
  assert.equal(checked.sourcePublicKey, endpoint.sourceEndpoint);
  assert.throws(() => fixture.signers.native.solana.signTransaction({ ...intent, sourcePublicKey: endpoint.destinationEndpoint }), /SOL_SOURCE/);
});

function factsFor(slot) {
  const native = fixture.public.native, rule = native.rules[slot], action = fixture.scoped.local[slot].action;
  const family = rule.family, transactionId = h('synthetic transaction ' + slot) + (slot ? h('synthetic signature suffix') : ZERO);
  const identity = { family, genesis: rule.genesis, asset: rule.asset, transactionId, effectIndex: '0' };
  const nativeGid = nativeFactIdentity(identity), transactionSHA256 = h('synthetic wire ' + slot);
  const endpoints = { family, genesis: rule.genesis, asset: rule.asset,
    sourceCommitment: action.sourceCommitment, destinationCommitment: action.destinationCommitment };
  const observedAt = native.observedAt[slot], blockId = h('synthetic block ' + slot), blockHeight = '100';
  const observation = { blockId, blockHeight, observedAt, finalityKind: family, confirmations: slot ? '0' : '6',
    sourceCommitment: action.sourceCommitment, destinationCommitment: action.destinationCommitment,
    amount: action.amount, custodyKind: '1', custodyCommitment: action.custodyCommitment,
    evidenceFrom: observedAt, evidenceUntil: String(BigInt(observedAt) + 300n),
    stateCommitment: nativeObservedEffectCommitment({ ...endpoints, nativeGid, blockId, blockHeight,
      transactionSHA256, amount: action.amount }) };
  return { ...identity, ledgerNamespace: fixture.public.domain.ledgerNamespace,
    hubDomain: fixture.public.domain.hubDomain, registryCommitment: fixture.public.domain.registryCommitment,
    ruleCommitment: fixture.scoped.local[slot].local.value.evidencePolicy, nativeGid, transactionSHA256,
    wireBindingVersion: '1', wireBindingKind: family, wireBindingPosition: slot ? '1' : '2',
    wireKeyCommitment: action.receiptKeyCommitment, observation,
    nativeContext: slot ? { observedTipId: ZERO, observedTipHeight: '0', transactionSlot: '100', parentSlot: '99', observedSlot: '101' }
      : { observedTipId: h('synthetic btc tip'), observedTipHeight: '105', transactionSlot: '0', parentSlot: '0', observedSlot: '0' } };
}

test('coherent risk/custody terms and separate fixture-only one-key signers verify real canonical messages', () => {
  for (let slot = 0; slot < 2; slot++) {
    const local = fixture.scoped.local[slot], native = fixture.public.native;
    assert.equal(native.riskTerms[slot].payoutCommitment, local.local.value.payoutCommitment);
    assert.equal(nativeDeliveryRiskCommitment(native.riskTerms[slot]), local.action.deliveryRiskCommitment);
    const dispatch = { hubDomain: local.domain.hubDomain, registryCommitment: local.domain.registryCommitment,
      readyStatement: h('future genuine ready descriptor ' + slot), localCommitment: local.local.value.localCommitment,
      dispatchId: local.local.value.dispatchId, actionCommitment: local.local.value.actionCommitment,
      globalEffectId: factsFor(slot).nativeGid, deliveryRiskCommitment: local.action.deliveryRiskCommitment, signedAt: slot ? '1210' : '1110' };
    const provider = fixture.signers.providers[slot];
    const dispatchSignature = provider.signDispatch(dispatch);
    assert.ok(checkSignature(native.providers[slot], nativeDispatchStatementFrame(dispatch), dispatchSignature));
    assert.ok(!checkSignature(native.providers[1 - slot], nativeDispatchStatementFrame(dispatch), dispatchSignature));
    const facts = factsFor(slot), policy = { ledgerNamespace: local.domain.ledgerNamespace, hubDomain: local.domain.hubDomain,
      registryCommitment: local.domain.registryCommitment, rule: native.rules[slot] };
    for (const i of [0, 1, 3]) {
      const signer = fixture.signers.attesters[i], signed = signer.signFacts(facts, policy);
      assert.ok(checkSignature(native.registry.keys[i], encodeNativeFacts(facts, policy), signed));
      assert.deepEqual(Object.keys(signer), []); assert.throws(() => JSON.stringify(signer), /NOT_SERIALIZABLE/);
    }
    assert.deepEqual(Object.keys(provider), []); assert.throws(() => JSON.stringify(provider), /NOT_SERIALIZABLE/);
  }
  fixture.destroy(); fixture.destroy();
  assert.throws(() => fixture.signers.providers[0].signDispatch({}), /DESTROYED/);
  assert.throws(() => fixture.signers.attesters[0].signFacts({}, {}), /DESTROYED/);
  assert.throws(() => fixture.signers.native.solana.signTransaction({}), /DESTROYED/);
  assert.equal(fixture.jobs.authorization.publicInputs.length, 16);
});
