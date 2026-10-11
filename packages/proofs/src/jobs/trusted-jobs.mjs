/** One-use private IPC intake. This module does not load a witness store, root
 * signing key, caller file or endpoint. The calling process is a scoped role. */
import assert from 'node:assert/strict';
import { types } from 'node:util';
import { RELATIONS, FIELD_MODULUS } from '@lianum/components/encoding/statements';

export const MAX_JOB_BYTES = 2 * 1024 * 1024;
const pending = new Set();
const completed = new Set();

function record(value, names) {
  assert.ok(value && typeof value === 'object' && !types.isProxy(value)
    && Object.getPrototypeOf(value) === Object.prototype, 'PROOF_JOB_PLAIN_RECORD');
  assert.deepEqual(Reflect.ownKeys(value).sort(), [...names].sort(), 'PROOF_JOB_EXACT_FIELDS');
  for (const name of names) {
    const descriptor = Object.getOwnPropertyDescriptor(value, name);
    assert.ok(descriptor && Object.hasOwn(descriptor, 'value') && descriptor.enumerable,
      'PROOF_JOB_DATA_FIELDS');
  }
}
function array(value, length) {
  assert.ok(Array.isArray(value) && !types.isProxy(value)
    && Object.getPrototypeOf(value) === Array.prototype && value.length === length, 'PROOF_JOB_ARRAY_LENGTH');
  assert.equal(Reflect.ownKeys(value).length, length + 1, 'PROOF_JOB_ARRAY_PROPERTIES');
  for (let index = 0; index < length; index++)
    assert.ok(Object.hasOwn(Object.getOwnPropertyDescriptor(value, String(index)) ?? {}, 'value'), 'PROOF_JOB_DENSE_ARRAY');
}
function unsigned(value, bits) {
  if (typeof value === 'number') {
    assert.ok(Number.isSafeInteger(value) && value >= 0 && !Object.is(value, -0), 'PROOF_JOB_INTEGER');
    value = value.toString();
  }
  assert.equal(typeof value, 'string', 'PROOF_JOB_INTEGER_STRING');
  assert.ok(value.length <= 78 && /^(0|[1-9][0-9]*)$/.test(value), 'PROOF_JOB_INTEGER_ENCODING');
  const number = BigInt(value);
  assert.equal(number.toString(), value, 'PROOF_JOB_INTEGER_ROUNDTRIP');
  assert.ok(number < (1n << BigInt(bits)), 'PROOF_JOB_INTEGER_RANGE');
  return number.toString();
}
function valueFor(type, value) {
  if (type.kind === 'integer') {
    assert.equal(type.sign, 'unsigned', 'PROOF_JOB_SIGNED_INTEGER_NOT_IN_PROFILE');
    return unsigned(value, type.width);
  }
  if (type.kind === 'field') {
    const encoded = unsigned(value, 254);
    assert.ok(BigInt(encoded) < FIELD_MODULUS, 'PROOF_JOB_FIELD_RANGE');
    return encoded;
  }
  if (type.kind === 'boolean') {
    assert.equal(typeof value, 'boolean', 'PROOF_JOB_BOOLEAN'); return value;
  }
  if (type.kind === 'array') {
    array(value, type.length); return value.map(item => valueFor(type.type, item));
  }
  if (type.kind === 'struct') {
    record(value, type.fields.map(field => field.name));
    return Object.fromEntries(type.fields.map(field => [field.name, valueFor(field.type, value[field.name])]));
  }
  throw Error('PROOF_JOB_UNSUPPORTED_ABI_TYPE');
}
function flatten(type, value) {
  if (type.kind === 'array') return value.flatMap(item => flatten(type.type, item));
  if (type.kind === 'struct') return type.fields.flatMap(field => flatten(field.type, value[field.name]));
  return [typeof value === 'boolean' ? (value ? '1' : '0') : value];
}

/** Call with the independently pinned compiled ABI before Noir.execute.
 * Public words are derived from those same validated inputs, never a second
 * unchecked statement supplied beside them. No extra private fields survive. */
export function validateJobAgainstABI(abi, inputs, expectedPublicInputs, relation) {
  assert.ok(Object.hasOwn(RELATIONS, relation), 'PROOF_JOB_RELATION');
  assert.ok(abi && Array.isArray(abi.parameters), 'PROOF_JOB_COMPILED_ABI');
  record(inputs, abi.parameters.map(parameter => parameter.name));
  const normalized = Object.fromEntries(abi.parameters.map(parameter =>
    [parameter.name, valueFor(parameter.type, inputs[parameter.name])]));
  const publicInputs = abi.parameters.filter(parameter => parameter.visibility === 'public')
    .flatMap(parameter => flatten(parameter.type, normalized[parameter.name]));
  array(expectedPublicInputs, RELATIONS[relation].wordCount);
  const expected = expectedPublicInputs.map(value => {
    assert.equal(typeof value, 'string', 'PROOF_JOB_EXPECTED_PUBLIC_STRING');
    const encoded = unsigned(value, 254);
    assert.ok(BigInt(encoded) < FIELD_MODULUS, 'PROOF_JOB_EXPECTED_PUBLIC_RANGE');
    return encoded;
  });
  assert.equal(publicInputs.length, RELATIONS[relation].wordCount, 'PROOF_JOB_PUBLIC_WORD_COUNT');
  assert.deepEqual(publicInputs, expected, 'PROOF_JOB_PUBLIC_STATEMENT_MISMATCH');
  assert.ok(Buffer.byteLength(JSON.stringify({ inputs: normalized, expectedPublicInputs: expected })) <= MAX_JOB_BYTES,
    'PROOF_JOB_SIZE_LIMIT');
  return { inputs: normalized, expectedPublicInputs: expected };
}

export function prepareJob({ relation, role, jobId }) {
  assert.ok(Object.hasOwn(RELATIONS, relation), 'PROOF_JOB_RELATION');
  assert.equal(role, RELATIONS[relation].role, 'PROOF_JOB_ROLE');
  assert.equal(typeof jobId, 'string', 'PROOF_JOB_ID');
  assert.ok(/^[a-z0-9-]{8,100}$/.exec(jobId)?.[0] === jobId, 'PROOF_JOB_ID_ENCODING');
  assert.equal(typeof process.send, 'function', 'PROOF_JOB_PRIVATE_IPC_REQUIRED');
  assert.ok(process.connected, 'PROOF_JOB_PRIVATE_IPC_CLOSED');
  assert.ok(!pending.size && !completed.size, 'PROOF_JOB_ONE_USE_WORKER');
  pending.add(jobId);
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      process.removeListener('message', receive);
      process.removeListener('disconnect', disconnect);
      pending.delete(jobId); completed.add(jobId);
      if (error) reject(error); else resolve(result);
    };
    const disconnect = () => finish(Error('PROOF_JOB_PARENT_DISCONNECTED'));
    const receive = message => {
      try {
        record(message, ['type', 'relation', 'role', 'jobId', 'inputs', 'expectedPublicInputs']);
        assert.equal(message.type, 'flat-proof-inputs', 'PROOF_JOB_MESSAGE_TYPE');
        assert.equal(message.relation, relation, 'PROOF_JOB_MESSAGE_RELATION');
        assert.equal(message.role, role, 'PROOF_JOB_MESSAGE_ROLE');
        assert.equal(message.jobId, jobId, 'PROOF_JOB_MESSAGE_ID');
        assert.ok(Buffer.byteLength(JSON.stringify(message)) <= MAX_JOB_BYTES, 'PROOF_JOB_SIZE_LIMIT');
        finish(null, { inputs: message.inputs, expectedPublicInputs: message.expectedPublicInputs });
      } catch {
        // Never copy assertion details or private received values into logs.
        finish(Error('PROOF_JOB_INVALID_PRIVATE_MESSAGE'));
      }
    };
    process.once('message', receive);
    process.once('disconnect', disconnect);
    process.send({ type: 'flat-proof-input-ready', relation, role, jobId }, error => {
      if (error) finish(Error('PROOF_JOB_PARENT_SEND_FAILED'));
    });
  });
}
