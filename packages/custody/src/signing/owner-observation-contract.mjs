/** Shared owner identity and observation data contracts.
 * Parsing a snapshot does not confer the branded observer or custody authority. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { canonical } from '@lianum/engine/crypto/privacy';
import { derivePrivateAssetIdentity } from '@lianum/engine/notes/private-asset-runtime';
import { inspectGenericSnapshot } from '@lianum/engine/execution/local/local-ledger';
import { exactRecord, canonicalField, validateStruct, ZERO } from '@lianum/components/encoding/commitments';

export const FLAT_OWNER_OBSERVATION_TRUST = 'OWNED_LOCAL_RPC_NOT_NATIVE_CONSENSUS';
export const ownerCopy = value => JSON.parse(canonical(value));
export const ownerDigest = value => createHash('sha256').update(canonical(value)).digest('hex');

export function flatOwnerHex(value, width = 32, nonzero = true) {
  assert.ok(typeof value === 'string' && value.length === width * 2
    && /^[0-9a-f]+$/.test(value) && (!nonzero || value !== '0'.repeat(width * 2)), 'FLAT_OWNER_HEX');
  return value;
}
export function flatOwnerUint(value, positive = false) {
  assert.ok(typeof value === 'string' && /^(0|[1-9][0-9]*)$/.test(value) && value.length <= 20
    && BigInt(value) < (1n << 64n) && BigInt(value).toString() === value
    && (!positive || BigInt(value) > 0n), 'FLAT_OWNER_UINT'); return BigInt(value);
}

export function flatOwnerIdentity(input) {
  const value = ownerCopy(input), token = Object.hasOwn(value, 'assetBinding');
  exactRecord(value, ['pool', 'domain', 'domainCommitment', ...(token ? ['assetBinding'] : [])]);
  flatOwnerHex(value.pool, 20); validateStruct('domain', value.domain); canonicalField(value.domainCommitment, true);
  assert.equal(value.domain.ledgerNamespace, value.domain.hubDomain, 'FLAT_OWNER_INITIAL_NAMESPACE');
  let asset = '0'.repeat(40), codeHash = ZERO;
  if (token) {
    exactRecord(value.assetBinding, ['token', 'codeHash']);
    asset = flatOwnerHex(value.assetBinding.token, 20); codeHash = flatOwnerHex(value.assetBinding.codeHash);
    assert.notEqual(asset, value.pool, 'FLAT_OWNER_ASSET_POOL');
  }
  assert.equal(value.domain.asset, derivePrivateAssetIdentity(31337, '0x' + asset, '0x' + codeHash).slice(2),
    'FLAT_OWNER_ASSET_DOMAIN');
  return value;
}

export function flatOwnerSnapshot(rawInput, identity) {
  const raw = ownerCopy(rawInput);
  exactRecord(raw, ['identitySHA256', 'blockHash', 'canonicalBlockHashBefore', 'canonicalBlockHashAfter',
    'timestamp', 'rawState', 'rawHistory', 'rawBacking']);
  assert.equal(raw.identitySHA256, ownerDigest(identity), 'FLAT_OWNER_OBSERVATION_IDENTITY');
  for (const name of ['blockHash', 'canonicalBlockHashBefore', 'canonicalBlockHashAfter']) flatOwnerHex(raw[name]);
  assert.equal(raw.blockHash, raw.canonicalBlockHashBefore); assert.equal(raw.blockHash, raw.canonicalBlockHashAfter);
  flatOwnerUint(raw.timestamp);
  for (const [field, length] of [['rawState', 135], ['rawHistory', 68], ['rawBacking', 6]])
    assert.ok(typeof raw[field] === 'string' && /^0x(?:[0-9a-f]{64})*$/.test(raw[field])
      && raw[field].length === 2 + 64 * length, 'FLAT_OWNER_RAW_STATE');
  const decoded = inspectGenericSnapshot({ ...raw, scope: '0x' + identity.domain.scope });
  const p = decoded.publicState;
  assert.equal(new Set(decoded.commitments).size, decoded.commitments.length);
  assert.equal(new Set(decoded.nullifiers).size, decoded.nullifiers.length);
  assert.ok(p.leaves + 4 * p.liveReservations <= 64 && p.spent + 5 * p.liveReservations + p.outputCapacity <= 64,
    'FLAT_OWNER_HEADROOM');
  return { ...decoded, raw };
}
