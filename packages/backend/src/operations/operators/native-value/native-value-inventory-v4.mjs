/** Pure native-only inventory codec. One operator CAS record includes every
 * original, signed frame, pending intent, watermark and health authorization.
 * No expiry/admission pruning and no side journal that can lose old signatures. */
import assert from 'node:assert/strict';
import { createPublicKey, verify } from 'node:crypto';
import { exactRecord, fixedArray, bytes32 } from '../../../execution/encoding/commitments.mjs';
import { cloneInput, frozenInput, inputUint } from '../../../execution/account/preparation/readiness-inputs.mjs';
import { encodeFacts, validateFacts, factsSchema, profileCommitment, nativeWireBytes, registryCommitment, sha256 }
  from '../../../chains/shared/transfers/generic-native-value-v2.mjs';
import { checkpointAuthorizationFrame, MAX_NATIVE_VALUE_CHECKPOINTS } from '../../recovery/native-value-checkpoint-v4.mjs';
import { encodeNativeValueHealth } from '../../../chains/shared/health/native-value-health-v2.mjs';
import { assertNativeValueRegistrations } from '../../deployments/native-value/native-value-registry-v2.mjs';
import { decodeEvmSignedTransactionWire } from '../../../chains/evm/transfers/evm-signed-transaction-wire.mjs';
import { decodeTronNativeTransferWire } from '../../../chains/tron/transfers/tron-native-transfer-wire.mjs';
import { decodeWireCommitment } from '../../../chains/shared/dispatch/native-receipt-binding.mjs';
import { evmFundingEndpointCommitment } from '../../../chains/evm/dispatch/evm-facts-binding.mjs';
import { tronGraphEndpoint } from '../../../chains/tron/transfers/tron-native-graph-profile.mjs';
export const NATIVE_VALUE_INVENTORY_SCHEMA = 'OWNED_NATIVE_VALUE_FULL_HISTORY_CHECKPOINT_INVENTORY_V4';
export const MAX_CERTIFICATES_PER_ORIGINAL = 256;
const ORDER = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
const equal = (a, b) => assert.deepEqual(a, b, 'NATIVE_VALUE_RETAINED_IDENTITY_CHANGED');
export function assertNativeValueSignature(publicKey, signature, bytes) {
  exactRecord(publicKey, ['x', 'y']); bytes32(publicKey.x, true); bytes32(publicKey.y, true);
  assert.equal(typeof signature, 'string'); assert.match(signature, /^[0-9a-f]{128}$/);
  const r = BigInt('0x' + signature.slice(0, 64)), s = BigInt('0x' + signature.slice(64));
  assert.ok(r > 0n && r < ORDER && s > 0n && s <= ORDER / 2n, 'NATIVE_VALUE_SIGNATURE_LOW_S');
  const key = createPublicKey({ format: 'jwk', key: { kty: 'EC', crv: 'secp256k1',
    x: Buffer.from(publicKey.x, 'hex').toString('base64url'), y: Buffer.from(publicKey.y, 'hex').toString('base64url') } });
  assert.ok(verify('sha256', bytes, { key, dsaEncoding: 'ieee-p1363' }, Buffer.from(signature, 'hex')), 'NATIVE_VALUE_SIGNATURE_INVALID');
}
export function nativeValueInventoryBinding(raw) {
  const value = cloneInput(raw); exactRecord(value, ['registry', 'profiles', 'signerIndex', 'publicKey']);
  assertNativeValueRegistrations({ registry: value.registry, profiles: value.profiles });
  const i = Number(inputUint(value.signerIndex, 8, 3n)); equal(value.publicKey, value.registry.quorum.keys[i]);
  return frozenInput(value);
}
export function nativeValuePolicy(binding, registration) {
  return frozenInput({ ledgerNamespace: binding.registry.quorum.hubDomain, registry: binding.registry,
    profile: registration.profile, profilePath: registration.profilePath });
}
export function createNativeValueOperatorInventory(raw) {
  const binding = nativeValueInventoryBinding(raw);
  return frozenInput({ schema: NATIVE_VALUE_INVENTORY_SCHEMA, bindingDigest: sha256(JSON.stringify(binding)), lastClock: '0',
    inventories: binding.profiles.map(row => ({ profileCommitment: profileCommitment(row.profile), entries: [] })), authorizations: [], checkpoints: [] });
}
/** Compares immutable native identity against an independently authenticated
 * observation; timestamps/finality evidence are deliberately not rewritten. */
export function assertStableNativeValueOriginal(original, observed) {
  equal(original.nativeWire, observed.nativeWire); equal(original.inclusion, observed.inclusion);
  for (const key of ['schema', 'ledgerNamespace', 'hubDomain', 'registryCommitment', 'registryEpoch', 'profileCommitment', 'sourceSetRoot',
    'family', 'genesis', 'asset', 'transactionId', 'effectIndex', 'nativeGid', 'transactionSHA256', 'wireKeyCommitment', 'executionEvidenceCommitment'])
    equal(original.facts[key], observed.facts[key]);
  for (const key of ['blockId', 'stateCommitment', 'blockHeight', 'sourceCommitment', 'destinationCommitment', 'amount', 'custodyKind', 'custodyCommitment'])
    equal(original.facts.observation[key], observed.facts.observation[key]);
}
export function assertNativeValueWatermark(previous, facts) {
  exactRecord(previous, ['blockId', 'blockHeight']); bytes32(previous.blockId, true); inputUint(previous.blockHeight);
  assert.ok(BigInt(facts.finalizedBlockHeight) >= BigInt(previous.blockHeight), 'NATIVE_VALUE_FINALITY_ROLLBACK');
  if (facts.finalizedBlockHeight === previous.blockHeight)
    assert.equal(facts.finalizedBlockId, previous.blockId, 'NATIVE_VALUE_FINALITY_SAME_HEIGHT_CHANGED');
}
export const nativeValueWatermark = facts => ({ blockId: facts.finalizedBlockId, blockHeight: facts.finalizedBlockHeight });
function original(raw, policy) {
  exactRecord(raw, ['nativeId', 'nativeWire', 'inclusion', 'facts']); bytes32(raw.nativeId, true);
  const facts = validateFacts(raw.facts, policy);
  assert.equal(facts.transactionId, raw.nativeId + '0'.repeat(64), 'NATIVE_VALUE_TRANSACTION_ID');
  assert.equal(sha256(nativeWireBytes(raw.nativeWire, policy)), facts.transactionSHA256, 'NATIVE_VALUE_ORIGINAL_WIRE_SHA');
  const evm = facts.family === '3', wire = evm ? decodeEvmSignedTransactionWire(raw.nativeWire) : decodeTronNativeTransferWire(raw.nativeWire);
  assert.equal(evm ? wire.nativeId.slice(2) : wire.nativeId, raw.nativeId, 'NATIVE_VALUE_ORIGINAL_SIGNED_ID');
  assert.equal(wire.transactionSHA256, facts.transactionSHA256, 'NATIVE_VALUE_ORIGINAL_SIGNED_SHA');
  assert.equal(evm ? decodeWireCommitment(Buffer.from(wire.data.slice(2), 'hex')) : wire.wireKeyCommitment, facts.wireKeyCommitment, 'NATIVE_VALUE_ORIGINAL_SIGNED_K');
  assert.equal(evm ? wire.value : wire.amountSun, facts.observation.amount, 'NATIVE_VALUE_ORIGINAL_SIGNED_AMOUNT');
  if (evm) assert.equal(wire.chainId, policy.profile.chainId, 'NATIVE_VALUE_ORIGINAL_CHAIN');
  const endpoint = address => evm ? evmFundingEndpointCommitment({genesis:facts.genesis,asset:facts.asset,address:address.slice(2)}) : tronGraphEndpoint(facts.genesis,facts.asset,address);
  assert.equal(endpoint(evm ? wire.from : wire.ownerAddress), facts.observation.sourceCommitment, 'NATIVE_VALUE_ORIGINAL_SOURCE');
  assert.equal(endpoint(evm ? wire.to : wire.recipientAddress), facts.observation.destinationCommitment, 'NATIVE_VALUE_ORIGINAL_DESTINATION');
  exactRecord(raw.inclusion, ['blockId', 'blockHeight', 'transactionIndex', 'receiptCommitment']);
  bytes32(raw.inclusion.receiptCommitment, true); inputUint(raw.inclusion.transactionIndex, 32);
  assert.equal(raw.inclusion.blockId, facts.observation.blockId); assert.equal(raw.inclusion.blockHeight, facts.observation.blockHeight);
}
export function assertNativeValueCertificate(certificate, policy, binding) {
  exactRecord(certificate, ['schema', 'signerIndex', 'facts', 'frameHex', 'digest', 'signature']);
  assert.equal(certificate.schema, factsSchema(policy)); assert.equal(certificate.signerIndex, binding.signerIndex);
  const bytes = encodeFacts(certificate.facts, policy);
  assert.equal(certificate.frameHex, bytes.toString('hex')); assert.equal(certificate.digest, sha256(bytes));
  assertNativeValueSignature(binding.publicKey, certificate.signature, bytes);
}
export function validateNativeValueOperatorInventory(raw, rawBinding) {
  const binding = nativeValueInventoryBinding(rawBinding), data = cloneInput(raw), initial = createNativeValueOperatorInventory(binding);
  exactRecord(data, ['schema', 'bindingDigest', 'lastClock', 'inventories', 'authorizations', 'checkpoints']);
  assert.equal(data.schema, initial.schema); assert.equal(data.bindingDigest, initial.bindingDigest); inputUint(data.lastClock);
  fixedArray(data.inventories, binding.profiles.length);
  data.inventories.forEach((inventory, i) => {
    exactRecord(inventory, ['profileCommitment', 'entries']); assert.equal(inventory.profileCommitment, initial.inventories[i].profileCommitment);
    assert.ok(Array.isArray(inventory.entries) && inventory.entries.length <= 64); fixedArray(inventory.entries, inventory.entries.length);
    const seen = new Set(), policy = nativeValuePolicy(binding, binding.profiles[i]);
    for (const entry of inventory.entries) {
      exactRecord(entry, ['original', 'history', 'pending', 'watermark', 'status', 'reason', 'lastCheckedAt', 'maximumEvidenceUntil']);
      original(entry.original, policy); assert.ok(!seen.has(entry.original.nativeId), 'NATIVE_VALUE_DUPLICATE_ORIGINAL'); seen.add(entry.original.nativeId);
      assert.ok(['live', 'unknown', 'adverse'].includes(entry.status));
      assert.ok(entry.status === 'live' ? entry.reason === null : typeof entry.reason === 'string' && /^[A-Z0-9_]{1,100}$/.test(entry.reason));
      assert.ok(inputUint(entry.lastCheckedAt) <= inputUint(data.lastClock));
      assertNativeValueWatermark(nativeValueWatermark(entry.original.facts), { finalizedBlockId: entry.watermark.blockId, finalizedBlockHeight: entry.watermark.blockHeight });
      assert.ok(Array.isArray(entry.history) && entry.history.length <= MAX_CERTIFICATES_PER_ORIGINAL); fixedArray(entry.history, entry.history.length);
      let maximum = 0n; const digests = new Set();
      for (const certificate of entry.history) {
        assertNativeValueCertificate(certificate, policy, binding);
        assertStableNativeValueOriginal(entry.original, { ...entry.original, facts: certificate.facts });
        assertNativeValueWatermark(nativeValueWatermark(certificate.facts), { finalizedBlockId: entry.watermark.blockId, finalizedBlockHeight: entry.watermark.blockHeight });
        assert.ok(!digests.has(certificate.digest), 'NATIVE_VALUE_DUPLICATE_SIGNED_FRAME'); digests.add(certificate.digest);
        const until = BigInt(certificate.facts.observation.evidenceUntil); if (until > maximum) maximum = until;
      }
      assert.equal(inputUint(entry.maximumEvidenceUntil), maximum, 'NATIVE_VALUE_EXACT_MAXIMUM_ISSUED_EXPIRY');
      if (entry.pending !== null) {
        exactRecord(entry.pending, ['facts', 'frameHex', 'digest']);
        const bytes = encodeFacts(entry.pending.facts, policy);
        assert.equal(entry.pending.frameHex, bytes.toString('hex')); assert.equal(entry.pending.digest, sha256(bytes));
        assertStableNativeValueOriginal(entry.original, { ...entry.original, facts: entry.pending.facts });
        assert.ok(!digests.has(entry.pending.digest), 'NATIVE_VALUE_PENDING_ALREADY_SIGNED');
      }
    }
  });
  assert.ok(Array.isArray(data.authorizations) && data.authorizations.length <= 256); fixedArray(data.authorizations, data.authorizations.length);
  const seen = new Set();
  for (const entry of data.authorizations) {
    exactRecord(entry, ['message', 'frameHex', 'digest', 'head', 'signature', 'abiSignature']);
    const bytes = encodeNativeValueHealth(entry.message); assert.equal(entry.frameHex, bytes.toString('hex')); assert.equal(entry.digest, sha256(bytes));
    assert.equal(entry.message.registryCommitment, registryCommitment(binding.registry));
    assert.equal(entry.message.hubDomain, binding.registry.quorum.hubDomain);
    assert.ok(!seen.has(entry.digest), 'NATIVE_VALUE_DUPLICATE_AUTHORIZATION'); seen.add(entry.digest);
    exactRecord(entry.head, ['number', 'hash', 'timestamp']); inputUint(entry.head.number); inputUint(entry.head.timestamp); bytes32(entry.head.hash, true);
    if (entry.signature !== null) {
      assertNativeValueSignature(binding.publicKey, entry.signature, bytes);
      exactRecord(entry.abiSignature, ['signerIndex', 'v', 'r', 's']);
      assert.equal(String(entry.abiSignature.signerIndex), binding.signerIndex); assert.ok(['27', '28'].includes(String(entry.abiSignature.v)));
      assert.equal(entry.abiSignature.r, '0x' + entry.signature.slice(0, 64)); assert.equal(entry.abiSignature.s, '0x' + entry.signature.slice(64));
    } else assert.equal(entry.abiSignature, null);
  }
  // Every issued checkpoint remains in the SAME authenticated CAS record as
  // every original/certificate/health authorization. V3 records cannot load.
  assert.ok(Array.isArray(data.checkpoints) && data.checkpoints.length <= MAX_NATIVE_VALUE_CHECKPOINTS);
  fixedArray(data.checkpoints, data.checkpoints.length);
  const requests = new Set();
  for (const entry of data.checkpoints) {
    exactRecord(entry, ['message', 'frameHex', 'digest', 'head', 'signature', 'abiSignature']);
    const bytes = checkpointAuthorizationFrame(entry.message);
    assert.equal(entry.frameHex, bytes.toString('hex')); assert.equal(entry.digest, sha256(bytes));
    assert.equal(entry.message.registryCommitment, '0x' + registryCommitment(binding.registry));
    assert.equal(entry.message.hubDomain, '0x' + binding.registry.quorum.hubDomain);
    assert.notEqual(entry.message.requestId, '0x' + '0'.repeat(64));
    assert.ok(!requests.has(entry.message.requestId), 'NATIVE_VALUE_DUPLICATE_CHECKPOINT_REQUEST'); requests.add(entry.message.requestId);
    exactRecord(entry.head, ['number', 'hash', 'timestamp']); inputUint(entry.head.number); inputUint(entry.head.timestamp); bytes32(entry.head.hash, true);
    assert.ok(inputUint(entry.head.timestamp) <= inputUint(data.lastClock), 'NATIVE_VALUE_CHECKPOINT_FUTURE_HISTORY');
    assert.equal(inputUint(entry.message.validUntil), inputUint(entry.head.timestamp) + 30n, 'NATIVE_VALUE_CHECKPOINT_ORIGINAL_WINDOW_CHANGED');
    if (entry.signature !== null) {
      assertNativeValueSignature(binding.publicKey, entry.signature, bytes);
      exactRecord(entry.abiSignature, ['signerIndex', 'v', 'r', 's']);
      assert.equal(String(entry.abiSignature.signerIndex), binding.signerIndex); assert.ok(['27', '28'].includes(String(entry.abiSignature.v)));
      assert.equal(entry.abiSignature.r, '0x' + entry.signature.slice(0, 64)); assert.equal(entry.abiSignature.s, '0x' + entry.signature.slice(64));
    } else assert.equal(entry.abiSignature, null);
  }
  assert.ok(Buffer.byteLength(JSON.stringify(data)) <= 16 * 1024 * 1024, 'NATIVE_VALUE_INVENTORY_BYTE_BOUND');
  return data;
}
