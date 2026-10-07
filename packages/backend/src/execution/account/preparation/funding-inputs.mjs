/** Production S58/F41 codecs. Inputs are one exact scoped packet and public
 * roots/paths. Host consistency checks never authenticate roots or funds. */
import assert from 'node:assert/strict';
import { createCommitmentCodec, exactRecord, fixedArray, bytes32, canonicalField,
  validateStruct, structToNoir, digestBytes, digestWords }
  from '../../encoding/commitments.mjs';
import { encodeStatement, validateStatement } from '../../encoding/statements.mjs';
import { fundedAdmission } from '../../../../../engine/src/execution/graph/funded-graph.mjs';
import { verifyPrivateNotePath } from '../../../../../engine/src/notes/private-note-tree.mjs';

function frozenCopy(value) {
  const result = structuredClone(value);
  const freeze = item => { if (item && typeof item === 'object') { Object.values(item).forEach(freeze); Object.freeze(item); } };
  freeze(result); return result;
}
function index(value, depth) {
  assert.ok(Number.isSafeInteger(value) && !Object.is(value, -0) && value >= 0 && value < 2 ** depth,
    'SCOPED_PATH_INDEX');
  return value;
}
function path(value, depth, internal) {
  exactRecord(value, ['leaf', 'index', 'siblings']); index(value.index, depth);
  fixedArray(value.siblings, depth);
  if (internal) {
    canonicalField(value.leaf, true); value.siblings.forEach(item => canonicalField(item));
  } else {
    bytes32(value.leaf, true); value.siblings.forEach(item => bytes32(item));
  }
  return frozenCopy(value);
}
function opening(value, kind, expectedIndex) {
  exactRecord(value, ['value', 'blind', 'leaf', 'index', 'siblings']);
  const payload = validateStruct(kind, value.value);
  bytes32(value.blind, true);
  const proof = path({ leaf: value.leaf, index: value.index, siblings: value.siblings }, 4, true);
  assert.equal(proof.index, expectedIndex, 'SCOPED_ENVELOPE_POSITION');
  return frozenCopy({ value: payload, blind: value.blind, ...proof });
}
function packet(value, role, leafIndex) {
  exactRecord(value, ['domainCommitment', 'envelope', 'domain', 'core', role]);
  canonicalField(value.domainCommitment, true); canonicalField(value.envelope, true);
  const domain = validateStruct('domain', value.domain);
  const core = opening(value.core, 'core', 0), selected = opening(value[role], role, leafIndex);
  return frozenCopy({ domainCommitment: value.domainCommitment, envelope: value.envelope,
    domain, core, [role]: selected });
}
async function assertEnvelope(codec, value, role) {
  assert.equal(await codec.domainCommitment(value.domain), value.domainCommitment, 'SCOPED_DOMAIN_COMMITMENT');
  for (const name of ['core', role]) {
    const selected = value[name];
    const leaf = await codec[name + 'Leaf'](value.domainCommitment, selected.value, selected.blind);
    assert.equal(leaf, selected.leaf, 'SCOPED_LEAF_COMMITMENT');
    assert.equal(await codec.membershipRoot(value.domainCommitment, 1, leaf, selected.siblings, selected.index),
      value.envelope, 'SCOPED_ENVELOPE_MEMBERSHIP');
  }
}
function legacyMembership(commitment, proof, root) {
  bytes32(root); assert.equal(proof.leaf, commitment, 'SCOPED_NOTE_COMMITMENT');
  assert.ok(verifyPrivateNotePath({ ...proof, root }), 'SCOPED_NOTE_MEMBERSHIP');
}
const openingInputs = (value, name) => ({
  [name]: structToNoir(name, value[name].value),
  [name + '_blind']: digestBytes(value[name].blind),
  [name + '_siblings']: value[name].siblings.map(digestBytes),
});
function result(mode, statement, inputs) {
  const checked = validateStatement(mode, statement);
  return frozenCopy({ statement: checked, publicInputs: [...encodeStatement(mode, checked)], inputs });
}

/** Public state is {inputRoot,inputPath:{leaf,index,siblings[6]}}. */
export async function reservationWitness(rolePacket, publicState, options) {
  const selected = packet(rolePacket, 'funding', 1);
  exactRecord(publicState, ['inputRoot', 'inputPath']);
  const inputRoot = bytes32(publicState.inputRoot);
  const inputPath = path(publicState.inputPath, 6, false);
  const codec = createCommitmentCodec(options);
  await assertEnvelope(codec, selected, 'funding');
  const funding = selected.funding.value, core = selected.core.value;
  assert.equal(funding.reserveCommitment, core.reserveCommitment, 'SCOPED_RESERVE_COMMITMENT');
  assert.ok(BigInt(funding.fundingValidUntil) <= BigInt(core.settleBefore), 'SCOPED_FUNDING_CUTOFF');
  legacyMembership(funding.inputCommitment, inputPath, inputRoot);
  // The original golden SHA H4 codec includes funded profile, scope, policy,
  // asset and the operationId authenticated in the selected Funding leaf.
  const admissionTag = fundedAdmission({ ...selected.domain, operationId: funding.operationId });
  const statement = { domainCommitment: selected.domainCommitment, envelope: selected.envelope, inputRoot,
    inputNullifier: funding.inputNullifier, reserveCommitment: funding.reserveCommitment,
    changeCommitment: funding.changeCommitment, admissionTag,
    fundingNotBefore: funding.fundingNotBefore, fundingValidUntil: funding.fundingValidUntil };
  return result('reservation', statement, {
    domain_commitment: digestWords(statement.domainCommitment), envelope: digestWords(statement.envelope),
    input_root: digestWords(inputRoot), input_nullifier: digestWords(statement.inputNullifier),
    reserve_commitment: digestWords(statement.reserveCommitment), change_commitment: digestWords(statement.changeCommitment),
    admission_tag: digestWords(admissionTag), funding_not_before: statement.fundingNotBefore,
    funding_valid_until: statement.fundingValidUntil, domain: structToNoir('domain', selected.domain),
    ...openingInputs(selected, 'core'), ...openingInputs(selected, 'funding'),
    input_commitment: digestBytes(funding.inputCommitment), input_siblings: inputPath.siblings.map(digestBytes),
    input_leaf_index: inputPath.index,
  });
}

/** Public state is {authorizationRoot,authorizationPath,poolRoot,reservePath}.
 * Authorization membership uses purpose7(D,E), kind0/depth6; note membership
 * preserves original SHA leaves and nodes. Neither root's provenance is inferred. */
export async function recoveryWitness(rolePacket, publicState, options) {
  const selected = packet(rolePacket, 'recovery', 2);
  exactRecord(publicState, ['authorizationRoot', 'authorizationPath', 'poolRoot', 'reservePath']);
  canonicalField(publicState.authorizationRoot);
  const authorizationRoot = publicState.authorizationRoot, poolRoot = bytes32(publicState.poolRoot);
  const authorizationPath = path(publicState.authorizationPath, 6, true), reservePath = path(publicState.reservePath, 6, false);
  const codec = createCommitmentCodec(options);
  await assertEnvelope(codec, selected, 'recovery');
  const recovery = selected.recovery.value, core = selected.core.value;
  for (const key of ['reserveCommitment', 'reserveNullifier', 'settleBefore'])
    assert.equal(recovery[key], core[key], 'SCOPED_RECOVERY_JOIN');
  const authorizationLeaf = await codec.authorizationLeaf(selected.domainCommitment, selected.envelope);
  assert.equal(authorizationLeaf, authorizationPath.leaf, 'SCOPED_AUTHORIZATION_LEAF');
  assert.equal(await codec.membershipRoot(selected.domainCommitment, 0, authorizationLeaf,
    authorizationPath.siblings, authorizationPath.index), authorizationRoot, 'SCOPED_AUTHORIZATION_MEMBERSHIP');
  legacyMembership(core.reserveCommitment, reservePath, poolRoot);
  const statement = { domainCommitment: selected.domainCommitment, authorizationRoot, poolRoot,
    reserveNullifier: recovery.reserveNullifier, recoveryCommitment: recovery.recoveryCommitment,
    settleBefore: recovery.settleBefore };
  return result('recovery', statement, {
    domain_commitment: digestWords(statement.domainCommitment), authorization_root: digestWords(authorizationRoot),
    pool_root: digestWords(poolRoot), reserve_nullifier: digestWords(statement.reserveNullifier),
    recovery_commitment: digestWords(statement.recoveryCommitment), settle_before: statement.settleBefore,
    domain: structToNoir('domain', selected.domain), envelope: digestBytes(selected.envelope),
    authorization_siblings: authorizationPath.siblings.map(digestBytes), authorization_index: authorizationPath.index,
    ...openingInputs(selected, 'core'), ...openingInputs(selected, 'recovery'),
    reserve_siblings: reservePath.siblings.map(digestBytes), reserve_leaf_index: reservePath.index,
  });
}
