/** Exact flat-native-health/1 H4 host codec. A genuine quorum authenticates
 * these bytes, but cannot prove inventory completeness or native consensus.
 * Current state must come from the separately owned pinned-state reader.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { exactRecord, fixedArray, bytes32, canonicalField } from '@lianum/components/encoding/commitments';
import { cloneInput, frozenInput, inputUint } from "@lianum/components/plain-input";
import { createNativeQuorumHostVerifier }
  from '@lianum/engine/evidence/native-quorum';

export const FLAT_HEALTH_TAG = 'LIANUM/PAEG/flat-native-health/1';
export const FLAT_HEALTH_PROFILE = 'LIANUM_PAEG_P2_V1';
export const FLAT_HEALTH_FIELDS = frozenInput([
  ['pool', 20, 'bytes'], ['domain', 32, 'field'], ['hubDomain', 32, 'bytes'],
  ['registryCommitment', 32, 'bytes'], ['evidenceState', 32, 'field'],
  ['receiptRoot', 32, 'field'], ['receiptCount', 4, 'count'],
  ['spentTagDigest', 32, 'bytes'], ['spentTagCount', 4, 'count'],
  ['spentTagSequence', 8, 'uint'], ['revokedDigest', 32, 'field'],
  ['revokedCount', 4, 'count'], ['revocationSequence', 8, 'uint'],
  ['stateSequence', 8, 'uint'], ['revocationOverflowDigest', 32, 'bytes'],
  ['revocationOverflowCount', 8, 'uint'], ['halted', 1, 'bool'],
  ['validFrom', 8, 'uint'], ['validUntil', 8, 'uint'],
]);

export function encodeFlatNativeHealth(raw) {
  const value = cloneInput(raw); exactRecord(value, FLAT_HEALTH_FIELDS.map(([key]) => key));
  const parts = [Buffer.from(FLAT_HEALTH_TAG), Buffer.from(FLAT_HEALTH_PROFILE)];
  for (const [name, width, kind] of FLAT_HEALTH_FIELDS) {
    let part;
    if (kind === 'bytes' || kind === 'field') {
      if (width === 32) (kind === 'field' ? canonicalField : bytes32)(value[name]);
      else {
        assert.equal(typeof value[name], 'string'); assert.equal(value[name].length, width * 2);
        assert.match(value[name], /^[0-9a-f]{40}$/);
      }
      part = Buffer.from(value[name], 'hex');
    } else {
      const number = inputUint(value[name], width * 8,
        kind === 'bool' ? 1n : kind === 'count' ? 64n : (1n << BigInt(width * 8)) - 1n);
      part = Buffer.from(number.toString(16).padStart(width * 2, '0'), 'hex');
    }
    parts.push(part);
  }
  return Buffer.concat(parts.flatMap(part => {
    const length = Buffer.alloc(4); length.writeUInt32BE(part.length); return [length, part];
  }));
}

export const flatNativeHealthDigest = message => createHash('sha256').update(encodeFlatNativeHealth(message)).digest('hex');

/** The signatures are original unprefixed low-S P1363 bytes. Host verification
 * does not establish EVM recovery-v correctness, independent operators, native
 * finality, or that every outstanding certificate was included in the audit.
 */
export function assertFlatNativeHealth(raw, current, registry) {
  const permit = cloneInput(raw); exactRecord(permit, ['message', 'indexes', 'signatures']);
  const expected = cloneInput(current);
  exactRecord(expected, [...FLAT_HEALTH_FIELDS.slice(0, -2).map(([key]) => key), 'timestamp']);
  const frame = encodeFlatNativeHealth(permit.message);
  inputUint(expected.timestamp);
  for (const [key] of FLAT_HEALTH_FIELDS.slice(0, -2))
    assert.equal(permit.message[key], expected[key], 'DISPATCH_HEALTH_STATE_CHANGED');
  assert.equal(expected.halted, '0', 'DISPATCH_HALTED');
  assert.equal(expected.revocationOverflowCount, '0', 'DISPATCH_REVOCATION_OVERFLOW');
  for (const key of ['receiptCount', 'spentTagCount', 'revokedCount'])
    assert.ok(inputUint(expected[key], 32, 64n) < 64n, 'DISPATCH_STATE_SATURATED');
  const from = inputUint(permit.message.validFrom), until = inputUint(permit.message.validUntil);
  const now = inputUint(expected.timestamp);
  assert.ok(from < until && from <= now && now < until && until - from <= 30n, 'DISPATCH_HEALTH_WINDOW');
  fixedArray(permit.indexes, 3); fixedArray(permit.signatures, 3);
  for (const signature of permit.signatures) {
    assert.equal(typeof signature, 'string'); assert.equal(signature.length, 128);
    assert.match(signature, /^[0-9a-f]{128}$/);
  }
  createNativeQuorumHostVerifier({ registry, expectedRegistryCommitment: expected.registryCommitment })
    .assertQuorumForMessage({ messageBytes: frame, indexes: permit.indexes, signatures: permit.signatures });
  return undefined;
}
