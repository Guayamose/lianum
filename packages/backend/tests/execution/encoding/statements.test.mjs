import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { RELATIONS, FIELD_MODULUS, decodeStatement, encodeStatement,
  joinAdmission, joinReadiness, joinReservation, joinSettlement } from '../../../src/execution/encoding/statements.mjs';

const hex = value => BigInt(value).toString(16).padStart(64, '0');
const raw = 'ff'.repeat(32);
const readiness = { domainCommitment: hex(1), authorizationRoot: hex(2),
  checkpoint: raw, readinessEvidenceState: hex(3), joinCommitment: hex(4),
  readyFrom: '100', readyUntil: '200' };

test('decodes and re-encodes the independently verified frozen N public inputs', () => {
  const url = new URL('../../../../candidate-poseidon/.local/component/attempts/prove-2/public-inputs.json', import.meta.url);
  const words = JSON.parse(readFileSync(url));
  const statement = decodeStatement('node', words);
  assert.deepEqual(encodeStatement('node', statement), words);
  assert.equal(RELATIONS.node.wordCount, 32);
});

test('reservation includes the original admission tag and exact U/S join', () => {
  const u = { domainCommitment: hex(1), envelope: hex(2) };
  const s = { ...u, inputRoot: raw, inputNullifier: hex(3), reserveCommitment: hex(4),
    changeCommitment: hex(5), admissionTag: hex(6), fundingNotBefore: '100', fundingValidUntil: '200' };
  assert.equal(encodeStatement('reservation', s).length, 58);
  assert.deepEqual(joinReservation(u, s), s);
  const { admissionTag, ...missingTag } = s;
  assert.throws(() => encodeStatement('reservation', missingTag));
  assert.throws(() => joinReservation(u, { ...s, envelope: hex(7) }), /MISMATCH/);
});

test('readiness is exact while admission has an independent current revocation state', () => {
  const ready = { ...readiness, readinessCommitment: hex(5) };
  const admission = { ...ready, acceptedCheckpointRoot: raw, admissionRevocationState: hex(9),
    receiptLeaf: hex(10), admissionNullifier: raw, admissionFrom: '300', admissionUntil: '400' };
  assert.deepEqual(joinAdmission(readiness, ready, admission), admission);
  assert.equal(encodeStatement('admission', admission).length, 84);
  assert.throws(() => joinReadiness(readiness, { ...ready, joinCommitment: hex(8) }), /MISMATCH/);
  assert.throws(() => joinAdmission(readiness, ready, { ...admission, readyUntil: '201' }), /MISMATCH/);
});

test('settlement joins exactly four ordered opaque completions', () => {
  const common = { domainCommitment: hex(1), authorizationRoot: hex(2), evidenceState: hex(3) };
  const nodes = [4, 5, 6, 7].map(value => ({ ...common, completionCommitment: hex(value) }));
  const t = { ...common, poolRoot: raw, reserveNullifier: raw,
    outputs: [8, 9, 10, 11].map(hex), terminalTags: [12, 13, 14, 15].map(hex),
    completionCommitments: nodes.map(node => node.completionCommitment), validFrom: '100', validUntil: '200' };
  assert.equal(encodeStatement('settlement', t).length, 138);
  assert.deepEqual(joinSettlement(nodes, t), t);
  assert.throws(() => joinSettlement(nodes.slice(0, 3), t));
  assert.throws(() => joinSettlement([nodes[1], nodes[0], nodes[2], nodes[3]], t), /MISMATCH/);
});

test('field values reject r and spellings that would normalize during decoding', () => {
  const statement = { domainCommitment: hex(FIELD_MODULUS), envelope: hex(2) };
  assert.throws(() => encodeStatement('authorization', statement), /FIELD_RANGE/);
  assert.throws(() => encodeStatement('authorization', { domainCommitment: hex(1) + '\n', envelope: hex(2) }));
  const words = [...encodeStatement('authorization', { domainCommitment: hex(1), envelope: hex(2) })];
  words[0] = '0\n'; assert.throws(() => decodeStatement('authorization', words));
});
