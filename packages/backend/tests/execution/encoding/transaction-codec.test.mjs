/** Local fake ABI fixtures only. No proof, key, compiler, RPC, EVM or native
 * backend starts; passing these tests establishes serialization, not funds. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { encodeFlatTransaction as encode, FLAT_TRANSACTION_METHODS as methods } from '../../../src/execution/encoding/transaction-codec.mjs';
import { encodeStatement, FIELD_MODULUS } from '../../../src/execution/encoding/statements.mjs';
import { decodeFlatOwnerCalldata } from '../../../../custody/src/signing/flat-owner-custody.mjs';

const hex = value => BigInt(value).toString(16).padStart(64, '0');
const digest = value => '0x' + hex(value);
const address = '0x' + '12'.repeat(20), raw = 'ff'.repeat(32);
const max64 = '18446744073709551615';
const packet = (relation, statement, words = 1) => ({ proof: 'ab'.repeat(32 * words),
  publicInputs: [...encodeStatement(relation, statement)] });
const health = { healthFrom: '100', healthUntil: '120', healthSignatures: [0, 2, 3].map(index => ({
  signerIndex: String(index), v: index === 2 ? '28' : '27', r: digest(index + 1), s: digest(index + 2),
})) };
const authorization = { domainCommitment: hex(1), envelope: hex(2) };
const reservation = { ...authorization, inputRoot: raw, inputNullifier: hex(3), reserveCommitment: hex(4),
  changeCommitment: hex(5), admissionTag: hex(6), fundingNotBefore: '100', fundingValidUntil: '200' };
const reserve = () => ({ authorization: packet('authorization', authorization), reservation: packet('reservation', reservation, 2),
  expectedSequence: max64, expectedPostRoot: digest(77) });
const dependency = { domainCommitment: hex(1), authorizationRoot: hex(2), checkpoint: raw,
  readinessEvidenceState: hex(3), joinCommitment: hex(4), readyFrom: '100', readyUntil: '200' };
const readiness = { ...dependency, readinessCommitment: hex(5) };
const admission = { ...readiness, acceptedCheckpointRoot: raw, admissionRevocationState: hex(6),
  receiptLeaf: hex(7), admissionNullifier: raw, admissionFrom: '210', admissionUntil: '220' };
const admit = () => ({ pool: address, dependency: packet('dependency', dependency), readiness: packet('ready', readiness, 2),
  admission: packet('admission', admission, 3), ...structuredClone(health) });
const common = { domainCommitment: hex(1), authorizationRoot: hex(2), evidenceState: hex(3) };
const nodes = [4, 5, 6, 7].map(value => ({ ...common, completionCommitment: hex(value) }));
const settlement = { ...common, poolRoot: raw, reserveNullifier: raw, outputs: [8, 9, 10, 11].map(hex),
  terminalTags: [12, 13, 14, 15].map(hex), completionCommitments: nodes.map(node => node.completionCommitment),
  validFrom: '100', validUntil: '200' };
const fulfill = () => ({ settlement: packet('settlement', settlement, 2),
  completions: nodes.map((node, index) => packet('node', node, index + 1)), ...structuredClone(health) });
const recovery = () => packet('recovery', { domainCommitment: hex(1), authorizationRoot: hex(2),
  poolRoot: raw, reserveNullifier: hex(3), recoveryCommitment: hex(4), settleBefore: max64 });
const legacy = deposit => ({ proof: 'cd'.repeat(32), publicInputs:
  Array.from({ length: deposit ? 26 : 39 }, (_, index) => index === 16 || index === (deposit ? 17 : 33) ? max64 : String(index + 1)) });

// Retained source-pinned build, read only. No artifact loader or compiler.
const compiledBytes = readFileSync(new URL('../../../.local/contracts/2e02620a-404c-4c27-9ac2-4132713e083b/compiled.json', import.meta.url));
assert.equal(createHash('sha256').update(compiledBytes).digest('hex'),
  '002f75913819548845ebce0928a40b09fdf07b370d104f0a4dd17b2bd051cb58');
const compiled = JSON.parse(compiledBytes);
const poolArtifact = compiled.contracts['PrivateFlatAssetNotePool.sol'].PrivateFlatAssetNotePool;
const hubArtifact = compiled.contracts['PrivateFlatReceiptHub.sol'].PrivateFlatReceiptHub;
const shape = inputs => inputs.map(({ name, type, components }) => ({ name, type,
  ...(components ? { components: shape(components) } : {}) }));
const selectors = { depositBalance: '4d62f43f', depositBalanceIntent: 'e4cb6f9a', withdrawBalance: '6e359c06', withdraw: '67843a5b',
  reserveGenericGuarded: 'a40a8e27', recoverGeneric: 'a1bd17e9', fulfillGeneric: '066a4d80', admit: '843047b3',
  registerPoolDomain: '219c7be5', recordCheckpoint: 'e28a2e5c', revoke: '07130acb',
  checkpointAuthorizationDigest: 'b71ecaf5', revocationMessage: '25cc72b8',
  finalityHealthDigest: 'c1ecea63', verifyFinalityHealth: 'b4c41285' };

test('fixed catalog exactly matches retained pinned contract ABI and selector fixtures', () => {
  assert.deepEqual(Object.keys(methods), Object.keys(selectors));
  for (const [name, entry] of Object.entries(methods)) {
    const artifact = entry.target === 'pool' ? poolArtifact : hubArtifact;
    const actual = artifact.abi.filter(item => item.type === 'function' && item.name === name);
    assert.equal(actual.length, 1);
    assert.deepEqual(shape(entry.inputs), shape(actual[0].inputs));
    assert.equal(entry.stateMutability, actual[0].stateMutability);
    assert.equal(entry.selector, selectors[name]);
    assert.equal(artifact.evm.methodIdentifiers[entry.signature], selectors[name]);
  }
  assert.throws(() => { methods.admit.inputs[1].components[0].type = 'bool'; }, TypeError);
});

// Independent absolute-offset reader. Every expected outer offset below is
// a fixed fixture; this reader does not call the encoder's offset helpers.
function bodyOf(calldata) { return Buffer.from(calldata.slice(10), 'hex'); }
function word(body, offset) {
  assert.ok(Number.isSafeInteger(offset) && offset >= 0 && offset + 32 <= body.length);
  return BigInt('0x' + body.subarray(offset, offset + 32).toString('hex'));
}
function readProof(body, at, expected) {
  assert.equal(word(body, at), 64n);
  const proofBytes = expected.proof.length / 2;
  const padded = Math.ceil(proofBytes / 32) * 32;
  assert.equal(word(body, at + 32), BigInt(96 + padded));
  assert.equal(word(body, at + 64), BigInt(proofBytes));
  assert.equal(body.subarray(at + 96, at + 96 + proofBytes).toString('hex'), expected.proof);
  assert.equal(body.subarray(at + 96 + proofBytes, at + 96 + padded).toString('hex'), '00'.repeat(padded - proofBytes));
  const start = at + 96 + padded;
  assert.equal(word(body, start), BigInt(expected.publicInputs.length));
  assert.deepEqual(expected.publicInputs.map((_, index) => word(body, start + 32 + index * 32).toString()), expected.publicInputs);
  return start + 32 + expected.publicInputs.length * 32;
}
function assertSignatures(body, at, expected) {
  expected.forEach((signature, index) => {
    const start = at + index * 128;
    assert.equal(word(body, start).toString(), signature.signerIndex);
    assert.equal(word(body, start + 32).toString(), signature.v);
    assert.equal(digest(word(body, start + 64)), signature.r);
    assert.equal(digest(word(body, start + 96)), signature.s);
  });
}

test('D26, both W39 methods and F41 preserve original dynamic ABI and owner decoder', () => {
  for (const [method, request, kind] of [ ['depositBalance', legacy(true), 'deposit'],
    ['withdrawBalance', legacy(false), 'withdrawal'], ['recoverGeneric', recovery(), 'recovery'] ]) {
    const calldata = encode(method, request), body = bodyOf(calldata);
    assert.equal(readProof(body, 0, request), body.length);
    assert.deepEqual(decodeFlatOwnerCalldata(poolArtifact, calldata), { kind,
      publicInputs: request.publicInputs, authorizationInputs: null, guards: null });
  }
  const balance = encode('withdrawBalance', legacy(false)), output = encode('withdraw', legacy(false));
  assert.equal(balance.slice(10), output.slice(10));
  assert.equal(output.slice(2, 10), '67843a5b');
});

test('D27 preserves both absolute bounds and the exact output in the new pool ABI', () => {
  const request = packet('deposit_intent', { scope: hex(1), policy: hex(2),
    validFrom: '601', validUntil: '3600', amount: '400', output: hex(3) });
  const calldata = encode('depositBalanceIntent', request), body = bodyOf(calldata);
  assert.equal(calldata.slice(2, 10), 'e4cb6f9a');
  assert.equal(readProof(body, 0, request), body.length);
  assert.equal(request.publicInputs.length, 27);
  assert.deepEqual(request.publicInputs.slice(16, 19), ['601', '3600', '400']);
  assert.throws(() => encode('depositBalanceIntent', legacy(true)), /WIDTH|LENGTH/);
});

test('U16/S58 reserve uses two local dynamic tuples and exact guarded owner ABI', () => {
  const request = reserve(), calldata = encode('reserveGenericGuarded', request), body = bodyOf(calldata);
  assert.equal(body.length, 2848);
  assert.equal(word(body, 0), 128n); assert.equal(word(body, 32), 800n);
  assert.equal(word(body, 64).toString(), max64); assert.equal(digest(word(body, 96)), request.expectedPostRoot);
  assert.equal(readProof(body, 128, request.authorization), 800);
  assert.equal(readProof(body, 800, request.reservation), body.length);
  assert.deepEqual(decodeFlatOwnerCalldata(poolArtifact, calldata), { kind: 'reservation',
    publicInputs: request.reservation.publicInputs, authorizationInputs: request.authorization.publicInputs,
    guards: { expectedSequence: max64, expectedPostRoot: request.expectedPostRoot } });
});

test('P42/R50/I84 admission offsets include all twelve inline signature words', () => {
  const request = admit(), body = bodyOf(encode('admit', request));
  assert.equal(body.length, 6784);
  assert.equal(word(body, 0), BigInt(address));
  assert.deepEqual([32, 64, 96].map(at => word(body, at)), [576n, 2080n, 3872n]);
  assert.equal(word(body, 128), 100n); assert.equal(word(body, 160), 120n);
  assertSignatures(body, 192, health.healthSignatures);
  assert.equal(readProof(body, 576, request.dependency), 2080);
  assert.equal(readProof(body, 2080, request.readiness), 3872);
  assert.equal(readProof(body, 3872, request.admission), body.length);
});

test('T138 plus four ordered N32 tuples use a dynamic fixed array without a length word', () => {
  const request = fulfill(), body = bodyOf(encode('fulfillGeneric', request));
  assert.equal(body.length, 10176);
  assert.equal(word(body, 0), 512n); assert.equal(word(body, 32), 5120n);
  assert.equal(word(body, 64), 100n); assert.equal(word(body, 96), 120n);
  assertSignatures(body, 128, health.healthSignatures);
  assert.equal(readProof(body, 512, request.settlement), 5120);
  const arrayAt = 5120, offsets = [128, 1312, 2528, 3776], ends = [1312, 2528, 3776, 5056];
  request.completions.forEach((completion, index) => {
    assert.equal(word(body, arrayAt + index * 32), BigInt(offsets[index]));
    assert.equal(readProof(body, arrayAt + offsets[index], completion), arrayAt + ends[index]);
  });
  assert.equal(arrayAt + ends.at(-1), body.length);
});

test('checkpoint, revocation and health preserve the original static signature ABI', () => {
  const checkpoint = { pool: address, expectedPoolSequence: '1', expectedHubStateSequence: '2',
    requestId: digest(3), validUntil: max64, signatures: health.healthSignatures };
  const cp = bodyOf(encode('recordCheckpoint', checkpoint));
  assert.equal(cp.length, 17 * 32); assertSignatures(cp, 5 * 32, health.healthSignatures);
  assert.deepEqual([0, 32, 64, 96, 128].map(at => word(cp, at)), [BigInt(address), 1n, 2n, 3n, BigInt(max64)]);
  const { signatures, ...checkpointMessage } = checkpoint;
  assert.equal(bodyOf(encode('checkpointAuthorizationDigest', checkpointMessage)).toString('hex'), cp.subarray(0, 160).toString('hex'));
  const revocation = { gid: digest(4), expectedSequence: '5', reasonCommitment: digest(6),
    authorizationExpiry: max64, signatures };
  const revoked = bodyOf(encode('revoke', revocation));
  assert.equal(revoked.length, 16 * 32); assertSignatures(revoked, 4 * 32, signatures);
  assert.deepEqual([0, 32, 64, 96].map(at => word(revoked, at)), [4n, 5n, 6n, BigInt(max64)]);
  const { signatures: omitted, ...revocationMessage } = revocation;
  assert.equal(bodyOf(encode('revocationMessage', revocationMessage)).toString('hex'), revoked.subarray(0, 128).toString('hex'));
  const healthMessage = { pool: address, validFrom: '100', validUntil: '120' };
  const verified = bodyOf(encode('verifyFinalityHealth', { ...healthMessage, signatures }));
  assert.equal(verified.length, 15 * 32); assertSignatures(verified, 3 * 32, signatures);
  assert.equal(bodyOf(encode('finalityHealthDigest', healthMessage)).toString('hex'), verified.subarray(0, 96).toString('hex'));
  assert.equal(encode('registerPoolDomain', { pool: address }), '0x219c7be5' + hex(BigInt(address)));
});

test('statement widths, canonical u32/u64 limbs and field digests are enforced', () => {
  for (const [method, request] of [['depositBalance', legacy(true)], ['withdrawBalance', legacy(false)], ['recoverGeneric', recovery()]]) {
    assert.throws(() => encode(method, { ...request, publicInputs: request.publicInputs.slice(1) }));
    for (const value of ['01', '0x01', '-1', '1\n', ' 1', 1, 1n, '4294967296']) {
      const words = [...request.publicInputs]; words[0] = value;
      assert.throws(() => encode(method, { ...request, publicInputs: words }));
    }
  }
  const deposit = legacy(true); deposit.publicInputs[17] = '18446744073709551616';
  assert.throws(() => encode('depositBalance', deposit), /UINT_RANGE/);
  const invalidField = reserve();
  invalidField.authorization.publicInputs.splice(0, 8, ...Array.from({ length: 8 }, (_, index) =>
    BigInt('0x' + hex(FIELD_MODULUS).slice(index * 8, index * 8 + 8)).toString()));
  assert.throws(() => encode('reserveGenericGuarded', invalidField), /FIELD_RANGE/);
  assert.throws(() => encode('reserveGenericGuarded', { ...reserve(), expectedSequence: '-0' }));
  assert.throws(() => encode('reserveGenericGuarded', { ...reserve(), expectedSequence: '18446744073709551616' }));
});

test('all atomic bundle joins and four completion slots fail closed', () => {
  const s = reserve(); s.reservation.publicInputs[15] = '99';
  assert.throws(() => encode('reserveGenericGuarded', s), /MISMATCH/);
  const p = admit(); p.dependency.publicInputs[40] = '101';
  assert.throws(() => encode('admit', p), /MISMATCH/);
  const r = admit(); r.readiness.publicInputs[47] = '99';
  assert.throws(() => encode('admit', r), /MISMATCH/);
  const n = fulfill(); [n.completions[0], n.completions[1]] = [n.completions[1], n.completions[0]];
  assert.throws(() => encode('fulfillGeneric', n), /MISMATCH/);
  const short = fulfill(); short.completions.pop(); assert.throws(() => encode('fulfillGeneric', short));
  const changed = fulfill(); changed.completions[0].publicInputs[23] = '99';
  assert.throws(() => encode('fulfillGeneric', changed), /MISMATCH/);
  // Admission's purpose-18 current revocation field is independent from the
  // historical readiness evidence. Their difference is intentional and valid.
  assert.notEqual(admission.admissionRevocationState, admission.readinessEvidenceState);
  assert.ok(encode('admit', admit()).startsWith('0x843047b3'));
});

test('proof transport rejects ambiguous bytes, loose objects, getters and authority options', () => {
  for (const proof of ['', 'ab', '0x' + 'ab'.repeat(32), 'AB'.repeat(32), 'ab'.repeat(32) + '\n',
    Buffer.alloc(32), new Uint8Array(32)]) assert.throws(() => encode('recoverGeneric', { ...recovery(), proof }));
  for (const field of ['verified', 'backend', 'network', 'signer', 'statement', 'evidence', 'value', 'to'])
    assert.throws(() => encode('recoverGeneric', { ...recovery(), [field]: true }));
  assert.throws(() => encode('recoverGeneric', new Proxy(recovery(), {})));
  let accessed = false;
  const getter = { ...recovery() };
  Object.defineProperty(getter, 'proof', { enumerable: true, get() { accessed = true; return 'ab'.repeat(32); } });
  assert.throws(() => encode('recoverGeneric', getter)); assert.equal(accessed, false);
  const sparse = recovery(); delete sparse.publicInputs[0]; assert.throws(() => encode('recoverGeneric', sparse));
  const extra = recovery(); extra.publicInputs.extra = true; assert.throws(() => encode('recoverGeneric', extra));
  const proxy = recovery(); proxy.publicInputs = new Proxy(proxy.publicInputs, {}); assert.throws(() => encode('recoverGeneric', proxy));
  const symbol = recovery(); symbol[Symbol('extra')] = true; assert.throws(() => encode('recoverGeneric', symbol));
  assert.throws(() => encode('toString', {})); assert.throws(() => encode('verify', {}));
  assert.throws(() => encode('recoverGeneric', { ...recovery(), proof: 'ab'.repeat(1024 * 1024 + 32) }), /PROOF_HEX/);
  assert.throws(() => encode('recoverGeneric', { ...recovery(), proof: 'ab'.repeat(1024 * 1024) }), /DATA_LIMIT/);
});

test('quorums require three distinct ordered canonical low-S signatures', () => {
  const cases = [signatures => { signatures.pop(); }, signatures => { signatures[1] = { ...signatures[0] }; },
    signatures => { signatures.reverse(); }, signatures => { signatures[0].signerIndex = '4'; },
    signatures => { signatures[0].v = '0'; }, signatures => { signatures[0].r = digest(0); },
    signatures => { signatures[0].s = digest(0); }, signatures => { signatures[0].s = digest(1n << 255n); },
    signatures => { signatures[0].v = 27; }, signatures => { signatures[0].r += '\n'; },
    signatures => { signatures[0].verified = true; }];
  for (const mutate of cases) { const request = admit(); mutate(request.healthSignatures); assert.throws(() => encode('admit', request)); }
  assert.throws(() => encode('registerPoolDomain', { pool: address + '\n' }));
  assert.throws(() => encode('registerPoolDomain', { pool: '0x' + 'AB'.repeat(20) }));
  assert.throws(() => encode('registerPoolDomain', { pool: address.slice(2) }));
});
