/** Owner-process preparation and least-data handoffs for U/S/P/R/I/N/T/F.
 * A capability/commitment is not proof authorization. No signer or proof
 * backend is started here. Keep the owner capability on the owner device. */
import assert from 'node:assert/strict';
import { types } from 'node:util';
import { authorizationInputs, A0_HASH_FIELDS, A0_TIME_FIELDS }
  from '@lianum/engine/execution/inputs/funding-witness';
import { prepareNativeCapsules, localCapsuleToNoir, dependencyCapsuleToNoir, nativeActionToNoir, a0Context }
  from '@lianum/engine/execution/native/dispatch/native-capsules';
import { fundedAdmission } from '@lianum/engine/execution/graph/funded-graph';
import {assertDistinctNativeReceiptSpendSecretsV1} from '@lianum/engine/execution/balances/generic-balance-native-preparation';
import { createCommitmentCodec, exactRecord, fixedArray, bytes32, validateStruct,
  structToNoir, digestBytes, digestWords, ZERO }
  from '@lianum/components/encoding/commitments';

function freeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
const detached = value => freeze(structuredClone(value));
// Reject accessors, proxies, sparse arrays, symbols and executable values
// before invoking any legacy adapter or copying owner material.
function plainData(value, ancestors = new Set()) {
  if (value === null || ['string', 'boolean'].includes(typeof value)) return;
  if (typeof value === 'number') { assert.ok(Number.isSafeInteger(value) && !Object.is(value, -0), 'OWNER_INTEGER'); return; }
  assert.ok(value && typeof value === 'object' && !types.isProxy(value), 'OWNER_PLAIN_DATA');
  assert.ok(!ancestors.has(value), 'OWNER_CYCLIC_DATA'); ancestors.add(value);
  if (Array.isArray(value)) fixedArray(value, value.length);
  else {
    assert.equal(Object.getPrototypeOf(value), Object.prototype, 'OWNER_PLAIN_DATA');
    const keys = Reflect.ownKeys(value);
    assert.ok(keys.every(key => typeof key === 'string'), 'OWNER_DATA_KEYS');
    exactRecord(value, keys);
  }
  for (const child of Object.values(value)) plainData(child, ancestors);
  ancestors.delete(value);
}
function slot(index) {
  assert.ok(Number.isInteger(index) && !Object.is(index, -0) && index >= 0 && index < 4, 'OWNER_SLOT');
  return index;
}
function opaqueCapability(methods) {
  const result = Object.create(null);
  for (const [name, method] of Object.entries(methods)) Object.defineProperty(result, name, { value: method });
  Object.defineProperty(result, 'toJSON', { value() { throw new TypeError('OWNER_CAPABILITY_NOT_SERIALIZABLE'); } });
  return Object.freeze(result);
}
// Deliberately outside the owner builder: closure contains only this packet,
// without an owner capability, full graph, selector table or caller input.
function scopedCapability(value) {
  const packet = detached(value);
  return opaqueCapability({ select: () => detached(packet) });
}
function ownerCapability(initialState) {
  let owned = initialState;
  initialState = null;
  const requireOwner = () => { assert.ok(owned, 'OWNER_CAPABILITY_DESTROYED'); return owned; };
  const select = name => scopedCapability(requireOwner().roles[name]);
  return opaqueCapability({
    publicStatement: () => detached(requireOwner().publicStatement),
    ownerAuthorizationInputs: () => detached(requireOwner().authorizationInputs),
    reservation: () => select('reservation'),
    recovery: () => select('recovery'),
    assembler: () => select('assembler'),
    local: index => scopedCapability(requireOwner().roles.local[slot(index)]),
    dependency: index => scopedCapability(requireOwner().roles.dependency[slot(index)]),
    destroy() { owned = null; },
  });
}

// Native capsule's pure public encoder intentionally accepts active actions
// only. U nevertheless has four Action witnesses; the original inactive
// branch requires every byte/integer to be zero.
function inactiveActionToNoir() {
  return {
    chain_domain: digestBytes(ZERO), signer_identity: digestBytes(ZERO), source_commitment: digestBytes(ZERO),
    destination_commitment: digestBytes(ZERO), amount: '0', custody_kind: 0, custody_commitment: digestBytes(ZERO),
    execution_from: '0', execution_until: '0', settle_before: '0', receipt_key_commitment: digestBytes(ZERO),
    receipt_rho: digestBytes(ZERO), delivery_risk_commitment: digestBytes(ZERO), action_salt: digestBytes(ZERO),
  };
}
const pick = (value, keys) => Object.fromEntries(keys.map(key => [key, value[key]]));

/**
 * input = {signed,domain,capsuleOptions:{nodes,slotSalts},joinBlinds[4],leafBlinds[16]}.
 * signed is the REAL original detached owner/invoice-signed funded graph.
 * capsuleOptions is the original native preparation's private options. This
 * builder prepares/validates its native selectors from that same signed value.
 * hashFields receives complete bigint[] field tuples and returns canonical hex32.
 * No randomness is generated: the owner must supply independent fresh blinds.
 */
export async function buildAuthorizedEnvelope(input, options) {
  exactRecord(input, ['signed', 'domain', 'capsuleOptions', 'joinBlinds', 'leafBlinds']);
  plainData(input);
  const { signed, domain, capsuleOptions, joinBlinds, leafBlinds } = structuredClone(input);
  exactRecord(capsuleOptions, ['nodes', 'slotSalts']);
  assertDistinctNativeReceiptSpendSecretsV1(capsuleOptions.nodes);
  validateStruct('domain', domain);
  assert.equal(domain.ledgerNamespace, domain.hubDomain, 'OWNER_INITIAL_LEDGER_NAMESPACE');
  fixedArray(joinBlinds, 4); fixedArray(leafBlinds, 16);
  [...joinBlinds, ...leafBlinds].forEach(value => bytes32(value, true));
  const codec = createCommitmentCodec(options);

  // This checks the actual existing owner/invoice signatures, the original
  // graph opening and each action/K/capsule association. Circuit U still
  // enforces the complete original economic and authorization relation.
  const prepared = prepareNativeCapsules({ signed, hubDomain: domain.hubDomain,
    registryCommitment: domain.registryCommitment, ...capsuleOptions });
  const statement = signed.authorizationStatement;
  for (const key of ['scope', 'policy', 'asset']) assert.equal(statement[key], domain[key], 'OWNER_DOMAIN_JOIN');
  assert.equal(signed.admissionTag, fundedAdmission(statement), 'OWNER_ADMISSION_TAG');
  const legacyInputs = authorizationInputs(signed);
  const context = a0Context(statement);
  assert.equal(prepared.statement.context, context, 'OWNER_CONTEXT_JOIN');
  const nodePackets = Array.from({ length: 4 }, (_, i) => prepared.nodeRole(i));
  const dependencyPackets = Array.from({ length: 4 }, (_, i) => prepared.dependencyRole(i));
  const keys = nodePackets.filter(packet => packet.localCapsule.active).map(packet => packet.localCapsule.receiptKeyCommitment);
  assert.equal(new Set(keys).size, keys.length, 'OWNER_DISTINCT_ACTIVE_RECEIPT_KEYS');

  // Direct pure witness assembly. Never ask the legacy recursive C adapter
  // for a witness by supplying dummy A0 proof/VK arrays.
  const ownerStatement = Object.fromEntries(A0_HASH_FIELDS.map(([key, abi]) => [abi, digestBytes(statement[key])]));
  ownerStatement.outputs = statement.outputs.map(digestBytes);
  ownerStatement.recovery_commitment = digestBytes(statement.recoveryCommitment);
  for (const [key, abi] of A0_TIME_FIELDS) ownerStatement[abi] = statement[key];
  const capsuleWitness = {
    graph: structuredClone(legacyInputs.witness.graph),
    local_capsules: nodePackets.map(packet => localCapsuleToNoir(packet.localCapsule)),
    dependency_capsules: dependencyPackets.map(packet => dependencyCapsuleToNoir(packet.dependencyCapsule)),
    actions: nodePackets.map(packet => packet.localCapsule.active ? nativeActionToNoir(packet.action) : inactiveActionToNoir()),
    receipt_spend_secrets: nodePackets.map(packet => digestBytes(packet.receiptSpendSecret)),
    target_salts: capsuleOptions.slotSalts.map(value => digestBytes(value.targetSalt)),
  };
  const core = { context, ...pick(statement, ['reserveCommitment', 'reserveNullifier', 'settleBefore']) };
  const funding = pick(statement, ['inputCommitment', 'inputNullifier', 'reserveCommitment', 'changeCommitment',
    'operationId', 'fundingNotBefore', 'fundingValidUntil']);
  const recovery = pick(statement, ['reserveCommitment', 'reserveNullifier', 'recoveryCommitment', 'settleBefore']);
  const settlement = { context, ...pick(statement, ['reserveCommitment', 'reserveNullifier', 'outputs', 'settleBefore']) };
  const locals = nodePackets.map((packet, i) => ({ ...packet.localCapsule, slot: String(i), targetJoinBlind: joinBlinds[i] }));
  const dependencies = dependencyPackets.map((packet, i) => ({ ...packet.dependencyCapsule,
    targetSlot: String(i), dependencyCount: String(packet.dependencyCapsule.dependencyCount),
    predecessors: packet.dependencyCapsule.predecessors.map(source => ({ ...source, sourceSlot: String(source.sourceSlot) })),
    targetJoinBlind: joinBlinds[i] }));
  const payouts = statement.outputs.map((commitment, i) => ({ slot: String(i), commitment }));

  const domainCommitment = await codec.domainCommitment(domain);
  const descriptors = [{ kind: 'core', value: core }, { kind: 'funding', value: funding },
    { kind: 'recovery', value: recovery }, { kind: 'settlement', value: settlement },
    ...locals.map(value => ({ kind: 'local', value })), ...dependencies.map(value => ({ kind: 'dependency', value })),
    ...payouts.map(value => ({ kind: 'payout', value }))];
  const leaves = [];
  for (let i = 0; i < 16; i++) leaves.push(await codec[descriptors[i].kind + 'Leaf'](domainCommitment,
    descriptors[i].value, leafBlinds[i]));
  const tree = await codec.buildTree(domainCommitment, 1, leaves);
  const envelope = tree.root;
  bytes32(envelope, true);
  const opening = index => ({ value: descriptors[index].value, blind: leafBlinds[index], ...tree.opening(index) });
  const common = { domainCommitment, envelope, domain, core: opening(0) };
  const publicStatement = { domainCommitment, envelope };
  const authorization = {
    domain_commitment: digestWords(domainCommitment), envelope: digestWords(envelope),
    domain: structToNoir('domain', domain), owner_statement: ownerStatement,
    owner_witness: legacyInputs.witness, capsule_witness: capsuleWitness,
    join_blinds: joinBlinds.map(digestBytes), leaf_blinds: leafBlinds.map(digestBytes),
  };
  return ownerCapability({ publicStatement, authorizationInputs: authorization, roles: {
    reservation: { ...common, funding: opening(1) },
    recovery: { ...common, recovery: opening(2) },
    assembler: { ...common, settlement: opening(3), payouts: Array.from({ length: 4 }, (_, i) => opening(12 + i)) },
    local: nodePackets.map((packet, i) => ({ ...common, local: opening(4 + i),
      action: packet.action, receiptSpendSecret: packet.receiptSpendSecret })),
    dependency: dependencies.map((_, i) => ({ ...common, dependency: opening(8 + i) })),
  } });
}
