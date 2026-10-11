/** Canonical native terminal calldata only. This parser starts no runtime,
 * observes no chain and cannot issue a terminal observation or recovery token. */
import assert from 'node:assert/strict';
import { decodeStatement } from '@lianum/components/encoding/statements';
import { encodeFlatTransaction, FLAT_TRANSACTION_METHODS } from './transaction-codec.mjs';
const MAX_BYTES = 1024 * 1024;
/** @param {string} value */
const prefix = (value) => '0x' + value;
/** @template T @param {T} value @returns {T} */
function freeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
/** @template T @param {T} value @returns {T} */
const detached = (value) => freeze(structuredClone(value));
/** @param {string | bigint} value @param {bigint} [maximum] */
function uint(value, maximum = (1n << 64n) - 1n) {
  const n = BigInt(value);
  assert.ok(n >= 0n && n <= maximum, 'FLAT_TERMINAL_INTEGER');
  return n;
}
/** Fixed ABI, canonical re-encoding, and statement joins only. Fake proof bytes
 * are valid parser fixtures but can never pass the owned observer constructor. */
/** @param {string} calldata */
export function decodeNativeValueTerminalCalldata(calldata) {
  assert.ok(
    typeof calldata === 'string' &&
      /^0x(?:[0-9a-f]{2})+$/.test(calldata) &&
      calldata.length <= MAX_BYTES * 2,
    'FLAT_TERMINAL_CALLDATA',
  );
  const name = /** @type {const} */ (['fulfillGeneric', 'recoverGeneric']).find(
    (name) => FLAT_TRANSACTION_METHODS[name].selector === calldata.slice(2, 10),
  );
  assert.ok(name, 'FLAT_TERMINAL_METHOD');
  const body = calldata.slice(10);
  /** @param {number} at */
  const word = (at) => {
    assert.ok(
      Number.isSafeInteger(at) && at >= 0 && (at + 32) * 2 <= body.length,
      'FLAT_TERMINAL_ABI_BOUNDS',
    );
    return body.slice(at * 2, (at + 32) * 2);
  };
  /** @param {number} at */
  const number = (at) => Number(uint('0x' + word(at), BigInt(MAX_BYTES)));
  /** @param {number} at @param {number} count */
  function proof(at, count) {
    assert.equal(number(at), 64, 'FLAT_TERMINAL_PROOF_OFFSET');
    const length = number(at + 64);
    assert.ok(length > 0 && length % 32 === 0, 'FLAT_TERMINAL_PROOF_LENGTH');
    assert.equal(number(at + 32), 96 + length, 'FLAT_TERMINAL_INPUT_OFFSET');
    const inputsAt = at + 96 + length;
    assert.equal(number(inputsAt), count, 'FLAT_TERMINAL_INPUT_COUNT');
    const publicInputs = Array.from({ length: count }, (_, i) =>
      BigInt('0x' + word(inputsAt + 32 + i * 32)).toString(),
    );
    return {
      packet: { proof: body.slice((at + 96) * 2, (at + 96 + length) * 2), publicInputs },
      end: inputsAt + 32 + count * 32,
    };
  }
  let request, statement, kind;
  if (name === 'recoverGeneric') {
    const parsed = proof(0, 41);
    assert.equal(body.length, parsed.end * 2, 'FLAT_TERMINAL_TRAILING_DATA');
    request = parsed.packet;
    kind = 'recovery';
    statement = decodeStatement(kind, request.publicInputs);
  } else {
    assert.equal(number(0), 512, 'FLAT_TERMINAL_SETTLEMENT_OFFSET');
    const settlement = proof(512, 138),
      arrayAt = settlement.end;
    assert.equal(number(32), arrayAt, 'FLAT_TERMINAL_COMPLETIONS_OFFSET');
    let cursor = arrayAt + 128;
    const completions = [];
    for (let i = 0; i < 4; i++) {
      assert.equal(number(arrayAt + i * 32), cursor - arrayAt, 'FLAT_TERMINAL_COMPLETION_OFFSET');
      const parsed = proof(cursor, 32);
      completions.push(parsed.packet);
      cursor = parsed.end;
    }
    assert.equal(body.length, cursor * 2, 'FLAT_TERMINAL_TRAILING_DATA');
    request = {
      settlement: settlement.packet,
      completions,
      healthFrom: uint('0x' + word(64)).toString(),
      healthUntil: uint('0x' + word(96)).toString(),
      healthSignatures: Array.from({ length: 3 }, (_, i) => ({
        signerIndex: uint('0x' + word(128 + i * 128), 255n).toString(),
        v: uint('0x' + word(160 + i * 128), 255n).toString(),
        r: prefix(word(192 + i * 128)),
        s: prefix(word(224 + i * 128)),
      })),
    };
    kind = 'settlement';
    statement = decodeStatement(kind, settlement.packet.publicInputs);
  }
  assert.equal(encodeFlatTransaction(name, request), calldata, 'FLAT_TERMINAL_NONCANONICAL_ABI');
  return detached({ kind, name, statement, request });
}
