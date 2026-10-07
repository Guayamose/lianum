/** Exact calldata for the flat pool/hub ABI. This is serialization only:
 * no proof verification, signing authority, state freshness or dispatch grant.
 * Importing this module starts no compiler, prover, backend, RPC or runtime. */
import assert from 'node:assert/strict';
import { exactRecord, fixedArray } from './commitments.mjs';
import { RELATIONS, decodeStatement, joinReservation, joinAdmission, joinSettlement } from './statements.mjs';
import { nativeStaticArguments, nativeProofCalldata }
  from '../../../../engine/src/execution/native/dispatch/native-deployment.mjs';
import { nativeHubSignatureToHost }
  from '../../../../engine/src/evidence/native-hub-messages.mjs';
import { decodeWalletPoolInputs, encodeWalletPoolInputs }
  from '../../../../engine/src/wallet/notes/private-wallet-note-encoding.mjs';
import { publicKeccak256 }
  from '../../../../engine/src/cohorts/private-cohort-public-native.mjs';

const MAX_CALLDATA_HEX_LENGTH = 2 * 1024 * 1024; // Same bound as owner custody.
const MAX_PROOF_BYTES = 1024 * 1024;
const PUBLIC_WORDS = Object.freeze({ authorization: 16, reservation: 58, dependency: 42, ready: 50,
  admission: 84, node: 32, settlement: 138, recovery: 41, deposit_balance: 26, deposit_intent: 27,
  withdraw_balance: 39, withdraw: 39 });
const scalar = (name, type) => ({ name, type });
const proofComponents = [scalar('proof', 'bytes'), scalar('inputs', 'bytes32[]')];
const proof = name => ({ name, type: 'tuple', components: proofComponents });
const quorum = name => ({ name, type: 'tuple[3]', components: [
  scalar('signerIndex', 'uint8'), scalar('v', 'uint8'), scalar('r', 'bytes32'), scalar('s', 'bytes32'),
] });
const healthInputs = [scalar('healthFrom', 'uint64'), scalar('healthUntil', 'uint64'), quorum('healthSignatures')];
const plainProofInputs = [scalar('proof', 'bytes'), scalar('inputs', 'bytes32[]')];
const typeName = input => input.type.startsWith('tuple')
  ? '(' + input.components.map(typeName).join(',') + ')' + input.type.slice(5) : input.type;
const selectorFor = signature => publicKeccak256(Buffer.from(signature)).subarray(0, 4).toString('hex');
function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
function method(target, name, inputs, stateMutability, publicWords = {}) {
  const signature = name + '(' + inputs.map(typeName).join(',') + ')';
  return { target, signature, selector: selectorFor(signature), inputs, stateMutability, publicWords };
}

/** Fixed method names only. Targets identify the contract kind, never an
 * address/network to use. Read methods encode eth_call payloads only. */
export const FLAT_TRANSACTION_METHODS = freeze({
  depositBalance: method('pool', 'depositBalance', plainProofInputs, 'payable', { proof: 26 }),
  depositBalanceIntent: method('pool', 'depositBalanceIntent', plainProofInputs, 'payable', { proof: 27 }),
  withdrawBalance: method('pool', 'withdrawBalance', plainProofInputs, 'nonpayable', { proof: 39 }),
  withdraw: method('pool', 'withdraw', plainProofInputs, 'nonpayable', { proof: 39 }),
  reserveGenericGuarded: method('pool', 'reserveGenericGuarded', [proof('authorization'), proof('reservation'),
    scalar('expectedSequence', 'uint64'), scalar('expectedPostRoot', 'bytes32')], 'nonpayable',
  { authorization: 16, reservation: 58 }),
  recoverGeneric: method('pool', 'recoverGeneric', plainProofInputs, 'nonpayable', { proof: 41 }),
  fulfillGeneric: method('pool', 'fulfillGeneric', [proof('settlement'),
    { ...proof('completions'), type: 'tuple[4]' }, ...healthInputs], 'nonpayable', { settlement: 138, completions: 32 }),
  admit: method('hub', 'admit', [scalar('pool', 'address'), proof('dependency'), proof('readiness'),
    proof('admission'), ...healthInputs], 'nonpayable', { dependency: 42, readiness: 50, admission: 84 }),
  registerPoolDomain: method('hub', 'registerPoolDomain', [scalar('pool', 'address')], 'nonpayable'),
  recordCheckpoint: method('hub', 'recordCheckpoint', [scalar('pool', 'address'),
    scalar('expectedPoolSequence', 'uint64'), scalar('expectedHubStateSequence', 'uint64'),
    scalar('requestId', 'bytes32'), scalar('validUntil', 'uint64'), quorum('signatures')], 'nonpayable'),
  revoke: method('hub', 'revoke', [scalar('gid', 'bytes32'), scalar('expectedSequence', 'uint64'),
    scalar('reasonCommitment', 'bytes32'), scalar('authorizationExpiry', 'uint64'), quorum('signatures')], 'nonpayable'),
  checkpointAuthorizationDigest: method('hub', 'checkpointAuthorizationDigest', [scalar('pool', 'address'),
    scalar('expectedPoolSequence', 'uint64'), scalar('expectedHubStateSequence', 'uint64'),
    scalar('requestId', 'bytes32'), scalar('validUntil', 'uint64')], 'view'),
  revocationMessage: method('hub', 'revocationMessage', [scalar('gid', 'bytes32'), scalar('expectedSequence', 'uint64'),
    scalar('reasonCommitment', 'bytes32'), scalar('authorizationExpiry', 'uint64')], 'view'),
  finalityHealthDigest: method('hub', 'finalityHealthDigest', [scalar('pool', 'address'),
    scalar('validFrom', 'uint64'), scalar('validUntil', 'uint64')], 'view'),
  verifyFinalityHealth: method('hub', 'verifyFinalityHealth', [scalar('pool', 'address'),
    scalar('validFrom', 'uint64'), scalar('validUntil', 'uint64'), quorum('signatures')], 'view'),
});

function uint(value, width) {
  assert.equal(typeof value, 'string', 'FLAT_CALL_UINT_STRING');
  assert.ok(value.length <= 20 && /^(0|[1-9][0-9]*)$/.exec(value)?.[0] === value, 'FLAT_CALL_UINT_ENCODING');
  const integer = BigInt(value);
  assert.ok(integer < (1n << BigInt(width)), 'FLAT_CALL_UINT_RANGE');
  return value;
}
function hex(value, bytes) {
  assert.equal(typeof value, 'string', 'FLAT_CALL_HEX_STRING');
  assert.ok(value.length === 2 + bytes * 2 && /^0x[0-9a-f]+$/.exec(value)?.[0] === value, 'FLAT_CALL_HEX_ENCODING');
  return value;
}
function signatures(values) {
  fixedArray(values, 3);
  values.forEach((value, index) => {
    exactRecord(value, ['signerIndex', 'v', 'r', 's']);
    uint(value.signerIndex, 8); uint(value.v, 8); hex(value.r, 32); hex(value.s, 32);
    // Existing original quorum syntax: index 0..3, v 27/28, nonzero r,
    // nonzero low-S, and strictly ascending indexes. No recovery is performed.
    nativeHubSignatureToHost(value);
    if (index) assert.ok(BigInt(values[index - 1].signerIndex) < BigInt(value.signerIndex), 'FLAT_CALL_SIGNER_ORDER');
  });
  return values;
}
function checkedStatic(input, value) {
  if (input.type === 'tuple[3]') return signatures(value);
  if (input.type === 'address') return hex(value, 20);
  if (input.type === 'bytes32') return hex(value, 32);
  assert.equal(input.type, 'uint64', 'FLAT_CALL_STATIC_TYPE');
  return uint(value, 64);
}
function staticFields(inputs, request) {
  return nativeStaticArguments(inputs, inputs.map(input => checkedStatic(input, request[input.name]))).slice(2);
}
const offsetWord = value => nativeStaticArguments([{ type: 'uint256' }], [value]).slice(2);

/** Offset origins are local to each containing tuple. A fixed array of
 * dynamic tuples has four offset words and no length word. Static parts may
 * span many words (notably the twelve words of a three-signature array). */
function sequence(parts) {
  let offset = parts.reduce((size, part) => size + (part.dynamic ? 32 : part.data.length / 2), 0);
  const head = [], tail = [];
  for (const part of parts) {
    if (part.dynamic) {
      head.push(offsetWord(offset)); tail.push(part.data); offset += part.data.length / 2;
    } else head.push(part.data);
  }
  return head.join('') + tail.join('');
}
const dynamic = data => ({ dynamic: true, data });
const statics = data => ({ dynamic: false, data });

// Reuse the original bytes/bytes32[] encoder for each proof tuple. This local
// immutable ABI descriptor supplies encoding only; no verifier is called.
const tupleSignature = 'verify(bytes,bytes32[])';
const tupleArtifact = freeze({ abi: [{ type: 'function', name: 'verify', inputs: plainProofInputs }],
  evm: { methodIdentifiers: { [tupleSignature]: selectorFor(tupleSignature) } } });
function checkedProof(packet, relation) {
  exactRecord(packet, ['proof', 'publicInputs']);
  assert.ok(Object.hasOwn(PUBLIC_WORDS, relation), 'FLAT_CALL_PROOF_RELATION');
  fixedArray(packet.publicInputs, PUBLIC_WORDS[relation]);
  assert.equal(typeof packet.proof, 'string', 'FLAT_CALL_PROOF_HEX');
  assert.ok(packet.proof.length > 0 && packet.proof.length <= MAX_PROOF_BYTES * 2
    && packet.proof.length % 64 === 0 && /^[0-9a-f]+$/.exec(packet.proof)?.[0] === packet.proof,
  'FLAT_CALL_PROOF_HEX');
  let statement;
  if (Object.hasOwn(RELATIONS, relation)) statement = decodeStatement(relation, packet.publicInputs);
  else {
    const deposit = relation === 'deposit_balance';
    assert.ok(deposit || relation === 'withdraw_balance' || relation === 'withdraw', 'FLAT_CALL_PROOF_RELATION');
    packet.publicInputs.forEach((value, index) => uint(value,
      index === 16 || index === (deposit ? 17 : 33) ? 64 : 32));
    // W39 output and balance withdrawals have the original identical public
    // layout; their distinct method selectors choose distinct pinned verifiers.
    const mode = deposit ? 'deposit_balance' : 'withdraw_balance';
    statement = decodeWalletPoolInputs(mode, packet.publicInputs);
    assert.deepEqual(encodeWalletPoolInputs(mode, statement), packet.publicInputs, 'FLAT_CALL_LEGACY_ROUNDTRIP');
  }
  const data = nativeProofCalldata(tupleArtifact, tupleSignature,
    Buffer.from(packet.proof, 'hex'), packet.publicInputs).slice(10);
  return { statement, data };
}

const SIMPLE_RELATIONS = Object.freeze({ depositBalance: 'deposit_balance', depositBalanceIntent: 'deposit_intent', withdrawBalance: 'withdraw_balance',
  withdraw: 'withdraw', recoverGeneric: 'recovery' });

/** request is an exact plain data record, with no transaction metadata.
 * Proofs are {proof: bare lowercase hex, publicInputs: decimal strings[]}.
 * ABI addresses/digests use lowercase 0x hex; all ABI integers use decimal
 * strings. Select the proof/publicInputs fields from a retained proof result;
 * passing metrics, selfVerified flags, paths or authority claims is rejected. */
export function encodeFlatTransaction(name, request) {
  assert.equal(typeof name, 'string', 'FLAT_CALL_METHOD');
  assert.ok(Object.hasOwn(FLAT_TRANSACTION_METHODS, name), 'FLAT_CALL_METHOD');
  const entry = FLAT_TRANSACTION_METHODS[name];
  let body;
  if (Object.hasOwn(SIMPLE_RELATIONS, name)) {
    body = checkedProof(request, SIMPLE_RELATIONS[name]).data;
  } else if (name === 'reserveGenericGuarded') {
    exactRecord(request, ['authorization', 'reservation', 'expectedSequence', 'expectedPostRoot']);
    const u = checkedProof(request.authorization, 'authorization'), s = checkedProof(request.reservation, 'reservation');
    joinReservation(u.statement, s.statement);
    body = sequence([dynamic(u.data), dynamic(s.data), statics(staticFields(entry.inputs.slice(2), request))]);
  } else if (name === 'admit') {
    exactRecord(request, ['pool', 'dependency', 'readiness', 'admission', 'healthFrom', 'healthUntil', 'healthSignatures']);
    const p = checkedProof(request.dependency, 'dependency'), r = checkedProof(request.readiness, 'ready');
    const i = checkedProof(request.admission, 'admission');
    joinAdmission(p.statement, r.statement, i.statement);
    body = sequence([statics(staticFields(entry.inputs.slice(0, 1), request)), dynamic(p.data), dynamic(r.data),
      dynamic(i.data), statics(staticFields(healthInputs, request))]);
  } else if (name === 'fulfillGeneric') {
    exactRecord(request, ['settlement', 'completions', 'healthFrom', 'healthUntil', 'healthSignatures']);
    fixedArray(request.completions, 4);
    const t = checkedProof(request.settlement, 'settlement');
    const nodes = request.completions.map(packet => checkedProof(packet, 'node'));
    joinSettlement(nodes.map(node => node.statement), t.statement);
    const completions = sequence(nodes.map(node => dynamic(node.data)));
    body = sequence([dynamic(t.data), dynamic(completions), statics(staticFields(healthInputs, request))]);
  } else {
    exactRecord(request, entry.inputs.map(input => input.name));
    body = staticFields(entry.inputs, request);
  }
  const calldata = '0x' + entry.selector + body;
  assert.ok(calldata.length <= MAX_CALLDATA_HEX_LENGTH, 'FLAT_CALL_DATA_LIMIT');
  return calldata;
}
