/** Explicit source/registry/facts semantic V2. Pure codecs, no authority flags.
 * Does not mutate or activate the old Rule, 829-byte codec, I key or vault route. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { exactRecord, fixedArray, bytes32, digestBytes } from '@lianum/components/encoding/commitments';
import { cloneInput, frozenInput, inputUint } from '../../../execution/account/preparation/readiness-inputs.mjs';
import { nativeFactIdentity, nativeCustodyCommitment, nativeObservedEffectCommitment } from '@lianum/engine/native/native-receipt-binding';
import { evmNativeTransferNetwork } from '../observations/evm-native-transfer-observer.mjs';
import { nativeQuorumRegistryCommitment, createNativeQuorumHostVerifier } from '@lianum/engine/evidence/native-quorum';

export const PROFILE_SCHEMA = 'LIANUM_NATIVE_VALUE_SOURCE_PROFILE_V2';
export const REGISTRY_SCHEMA = 'LIANUM_NATIVE_ADAPTER_REGISTRY_V2';
export const FACTS_SCHEMA = 'LIANUM_EVM_NATIVE_VALUE_FACTS_V2';
export const RELATION = 'admission_native_value_v2';
export const SEMANTIC_PROFILE = 'LIANUM_GENERIC_EVM_NATIVE_VALUE_ADMISSION_V2';
export const TRACE = 'GETH_COMPATIBLE_CALL_AND_PRESTATE_TRANSACTION_V1';
export const OBLIGATION = 'SUCCESSFUL_AUTHORIZED_ENDPOINT_VALUE_EXECUTION_NO_RETENTION_V1';
export const CHAINS = Object.freeze({ '1': ['ethereum', 'ethereum-rpc-finalized'], '8453': ['base', 'base-node-reported-finalized'],
  '42161': ['arbitrum', 'arbitrum-node-reported-finalized'], '56': ['bnb', 'bsc-rpc-finalized'], '714': ['bsc-local', 'bsc-owned-local-native-finalized'] });
export const sha256 = value => createHash('sha256').update(value).digest('hex');
export const semanticId = sha256(SEMANTIC_PROFILE);
export const registrySemanticId = sha256('LIANUM_NATIVE_ADAPTER_ENVELOPE_V2');
export const h4 = (tag, parts) => Buffer.concat([Buffer.from(tag), ...parts].flatMap(value => {
  const length = Buffer.alloc(4); length.writeUInt32BE(value.length); return [length, value];
}));
const digest = value => Buffer.from(bytes32(value, true), 'hex');
const integer = (value, bytes) => Buffer.from(inputUint(value, bytes * 8).toString(16).padStart(bytes * 2, '0'), 'hex');
const hashed = (tag, parts) => sha256(h4(tag, parts));
const PROFILE_FIELDS = ['schema', 'version', 'chainId', 'genesis', 'asset', 'sourceSetRoot', 'finalityPolicy', 'tracePolicy', 'obligation',
  'maximumAncestry', 'maximumEvidenceLifetime', 'maximumBlockAgeMs', 'maximumClockSkewMs', 'maximumQueryMs'];
const SOURCE_FIELDS = ['operatorIdentity', 'endpointIdentity', 'clientRelease', 'chainConfiguration'];
export const OBSERVATION_FIELDS = Object.freeze(['blockId', 'stateCommitment', 'blockHeight', 'observedAt', 'sourceCommitment',
  'destinationCommitment', 'amount', 'custodyKind', 'custodyCommitment', 'evidenceFrom', 'evidenceUntil']);
const EVIDENCE_FIELDS = ['finalizedBlockId', 'finalizedBlockHeight', 'executionEvidenceCommitment', 'finalityEvidenceCommitment'];
export function validateProfile(raw) {
  const p = cloneInput(raw); exactRecord(p, PROFILE_FIELDS);
  assert.equal(p.schema, PROFILE_SCHEMA); assert.equal(p.version, '2');
  assert.ok(Object.hasOwn(CHAINS, p.chainId), 'NATIVE_VALUE_CHAIN');
  for (const name of ['genesis', 'asset', 'sourceSetRoot', 'finalityPolicy', 'tracePolicy', 'obligation']) digest(p[name]);
  assert.equal(p.finalityPolicy, sha256(CHAINS[p.chainId][1]), 'NATIVE_VALUE_FINALITY_POLICY');
  assert.equal(p.tracePolicy, sha256(TRACE), 'NATIVE_VALUE_TRACE_POLICY');
  assert.equal(p.obligation, sha256(OBLIGATION), 'NATIVE_VALUE_OBLIGATION');
  const bounds = { maximumAncestry: [32, 1n, 256n], maximumEvidenceLifetime: [64, 1n, 300n],
    maximumBlockAgeMs: [64, 1n, 86400000n], maximumClockSkewMs: [64, 0n, 30000n], maximumQueryMs: [64, 1n, 60000n] };
  for (const [name, [bits, min, max]] of Object.entries(bounds)) assert.ok(inputUint(p[name], bits, max) >= min, 'NATIVE_VALUE_PROFILE_BOUND');
  return frozenInput(p);
}
/** Explicit draft-to-V2 policy construction. Facts are never translated or
 * re-signed by this helper. Callers must independently observe the V2 policy. */
export function createProfile({ chain, genesisHash, sourceSetRoot, maximumAncestry, maximumEvidenceLifetime,
  maximumBlockAgeMs, maximumClockSkewMs, maximumQueryMs }) {
  const network = evmNativeTransferNetwork({ chain, genesisHash });
  return validateProfile({ schema: PROFILE_SCHEMA, version: '2', chainId: network.chainId,
    genesis: network.genesisHash.slice(2), asset: network.nativeAssetCommitment, sourceSetRoot,
    finalityPolicy: sha256(CHAINS[network.chainId][1]), tracePolicy: sha256(TRACE), obligation: sha256(OBLIGATION),
    maximumAncestry, maximumEvidenceLifetime, maximumBlockAgeMs, maximumClockSkewMs, maximumQueryMs });
}
export function profileFrame(raw) {
  const p = validateProfile(raw);
  return h4('LIANUM/native-value-source-profile/2', [Buffer.from(PROFILE_SCHEMA), integer(p.version, 4), integer(p.chainId, 8),
    ...['genesis', 'asset', 'sourceSetRoot', 'finalityPolicy', 'tracePolicy', 'obligation'].map(k => digest(p[k])),
    integer(p.maximumAncestry, 4), ...['maximumEvidenceLifetime', 'maximumBlockAgeMs', 'maximumClockSkewMs', 'maximumQueryMs'].map(k => integer(p[k], 8))]);
}
export const profileCommitment = raw => sha256(profileFrame(raw));
export function sourceCommitment(raw) { exactRecord(raw, SOURCE_FIELDS); return hashed('LIANUM/native-value-source/2', SOURCE_FIELDS.map(k => digest(raw[k]))); }
export function pathRoot(leaf, path, depth) {
  exactRecord(path, ['index', 'siblings']); const index = inputUint(path.index, 8, BigInt(2 ** depth - 1)); fixedArray(path.siblings, depth);
  let root = bytes32(leaf, true);
  path.siblings.forEach((sibling, d) => { bytes32(sibling); const values = ((index >> BigInt(d)) & 1n) === 0n ? [root, sibling] : [sibling, root];
    root = sha256(Buffer.concat([Buffer.from([1]), ...values.map(v => Buffer.from(v, 'hex'))])); });
  return root;
}
export function assertSource(profile, source) {
  exactRecord(source, ['identity', 'index', 'siblings']);
  assert.equal(pathRoot(sourceCommitment(source.identity), { index: source.index, siblings: source.siblings }, 2),
    validateProfile(profile).sourceSetRoot, 'NATIVE_VALUE_SOURCE_POSITION');
  return frozenInput(cloneInput(source));
}
/** quorum.rulesRoot explicitly means the V2 typed adapter root inside this NEW
 * registry envelope; old registry framing alone is never accepted as V2. */
export function registryFrame(raw) {
  exactRecord(raw, ['schema', 'quorum']); assert.equal(raw.schema, REGISTRY_SCHEMA, 'NATIVE_VALUE_REGISTRY_SCHEMA');
  const q = raw.quorum, inner = nativeQuorumRegistryCommitment(q);
  return h4('LIANUM/native-adapter-registry/2', [Buffer.from(REGISTRY_SCHEMA), digest(registrySemanticId), digest(q.hubDomain),
    integer(q.registryEpoch, 8), digest(inner), digest(q.rulesRoot)]);
}
export const registryCommitment = raw => sha256(registryFrame(raw));
export function assertRegistration(profile, registry, path) {
  const p = validateProfile(profile), cm = registryCommitment(registry);
  assert.equal(pathRoot(profileCommitment(p), path, 3), registry.quorum.rulesRoot, 'NATIVE_VALUE_PROFILE_MEMBERSHIP');
  return cm;
}
export function chainDomain(raw) { const p = validateProfile(raw); return hashed('LIANUM/evidence-chain/1', [Buffer.from('EVM'), digest(p.genesis), digest(p.asset)]); }
export function validateFacts(raw, policy) {
  exactRecord(policy, ['ledgerNamespace', 'registry', 'profile', 'profilePath']);
  const p = validateProfile(policy.profile), r = policy.registry;
  const registry = assertRegistration(p, r, policy.profilePath), f = cloneInput(raw);
  exactRecord(f, ['schema', 'ledgerNamespace', 'hubDomain', 'registryCommitment', 'registryEpoch', 'profileCommitment', 'sourceSetRoot',
    'family', 'genesis', 'asset', 'transactionId', 'effectIndex', 'nativeGid', 'transactionSHA256', 'wireKeyCommitment', 'observation', ...EVIDENCE_FIELDS]);
  assert.equal(f.schema, FACTS_SCHEMA, 'NATIVE_VALUE_FACTS_SCHEMA');
  assert.equal(f.ledgerNamespace, bytes32(policy.ledgerNamespace, true));
  assert.equal(f.ledgerNamespace, r.quorum.hubDomain, 'NATIVE_VALUE_NAMESPACE');
  assert.equal(f.hubDomain, r.quorum.hubDomain); assert.equal(f.registryCommitment, registry);
  assert.equal(f.registryEpoch, r.quorum.registryEpoch); assert.equal(f.profileCommitment, profileCommitment(p));
  assert.equal(f.sourceSetRoot, p.sourceSetRoot); assert.equal(f.family, '3'); assert.equal(f.genesis, p.genesis);
  assert.equal(f.asset, p.asset); assert.equal(f.effectIndex, '0');
  assert.equal(f.nativeGid, nativeFactIdentity(Object.fromEntries(['family', 'genesis', 'asset', 'transactionId', 'effectIndex'].map(k => [k, f[k]]))), 'NATIVE_VALUE_GID');
  for (const name of ['nativeGid', 'transactionSHA256', 'wireKeyCommitment', 'finalizedBlockId', 'executionEvidenceCommitment', 'finalityEvidenceCommitment']) digest(f[name]);
  const o = f.observation; exactRecord(o, OBSERVATION_FIELDS);
  for (const name of ['blockId', 'stateCommitment', 'sourceCommitment', 'destinationCommitment', 'custodyCommitment']) digest(o[name]);
  assert.notEqual(o.sourceCommitment, o.destinationCommitment); assert.ok(inputUint(o.amount, 128) > 0n); assert.equal(o.custodyKind, '1');
  const endpoints = { family: '3', genesis: p.genesis, asset: p.asset, sourceCommitment: o.sourceCommitment, destinationCommitment: o.destinationCommitment };
  assert.equal(o.custodyCommitment, nativeCustodyCommitment(endpoints), 'NATIVE_VALUE_ENDPOINT_TERM');
  assert.equal(o.stateCommitment, nativeObservedEffectCommitment({ ...endpoints, nativeGid: f.nativeGid,
    blockId: o.blockId, blockHeight: o.blockHeight, transactionSHA256: f.transactionSHA256, amount: o.amount }), 'NATIVE_VALUE_EFFECT');
  const at = inputUint(o.observedAt), until = inputUint(o.evidenceUntil), height = inputUint(o.blockHeight), finalHeight = inputUint(f.finalizedBlockHeight);
  assert.equal(o.evidenceFrom, o.observedAt); assert.equal(until, at + BigInt(p.maximumEvidenceLifetime));
  assert.ok(finalHeight >= height && finalHeight - height <= BigInt(p.maximumAncestry), 'NATIVE_VALUE_FINALITY_BOUND');
  if (height === finalHeight) assert.equal(f.finalizedBlockId, o.blockId, 'NATIVE_VALUE_FINALIZED_ID');
  return frozenInput(f);
}
export function encodeFacts(raw, policy) {
  const f = validateFacts(raw, policy), o = f.observation;
  return h4('LIANUM/native-facts/evm-value/2', [Buffer.from(FACTS_SCHEMA), ...['ledgerNamespace', 'hubDomain', 'registryCommitment'].map(k => digest(f[k])),
    integer(f.registryEpoch, 8), digest(f.profileCommitment), digest(f.sourceSetRoot), integer(f.family, 1), digest(f.genesis), digest(f.asset),
    Buffer.from(f.transactionId, 'hex'), integer(f.effectIndex, 4), ...['nativeGid', 'transactionSHA256', 'wireKeyCommitment'].map(k => digest(f[k])),
    digest(o.blockId), digest(o.stateCommitment), integer(o.blockHeight, 8), integer(o.observedAt, 8), digest(o.sourceCommitment), digest(o.destinationCommitment),
    integer(o.amount, 16), integer(o.custodyKind, 1), digest(o.custodyCommitment), integer(o.evidenceFrom, 8), integer(o.evidenceUntil, 8),
    digest(f.finalizedBlockId), integer(f.finalizedBlockHeight, 8), digest(f.executionEvidenceCommitment), digest(f.finalityEvidenceCommitment)]);
}
export const factsDigest = (raw, policy) => sha256(encodeFacts(raw, policy));
export function assertFactsQuorum(certificates, policy, sources) {
  fixedArray(certificates, 3); fixedArray(sources, 3);
  let first, frame; const indexes = [], signatures = [];
  certificates.forEach((raw, i) => {
    exactRecord(raw, ['schema', 'signerIndex', 'facts', 'frameHex', 'digest', 'signature']);
    assert.equal(raw.schema, FACTS_SCHEMA); const facts = validateFacts(raw.facts, policy), bytes = encodeFacts(facts, policy);
    assert.equal(raw.frameHex, bytes.toString('hex')); assert.equal(raw.digest, sha256(bytes));
    if (frame) assert.ok(frame.equals(bytes), 'NATIVE_VALUE_FACTS_DISAGREE'); else { first = facts; frame = bytes; }
    const source = assertSource(policy.profile, sources[i]); assert.equal(source.index, raw.signerIndex, 'NATIVE_VALUE_SIGNER_SOURCE');
    indexes.push(Number(inputUint(raw.signerIndex, 8, 3n))); signatures.push(raw.signature);
  });
  createNativeQuorumHostVerifier({ registry: policy.registry.quorum,
    expectedRegistryCommitment: nativeQuorumRegistryCommitment(policy.registry.quorum) })
    .assertQuorumForMessage({ messageBytes: frame, indexes, signatures });
  return frozenInput({ facts: first, indexes, signatures });
}
const snake = name => name.replace(/[A-Z]/g, letter => '_' + letter.toLowerCase());
const convert = (raw, integerNames, omitted = []) => Object.fromEntries(Object.entries(raw).filter(([k]) => !omitted.includes(k))
  .map(([k, v]) => [snake(k), integerNames.includes(k) ? v : digestBytes(v)]));
export const profileToNoir = raw => convert(validateProfile(raw), ['version', 'chainId', 'maximumAncestry', 'maximumEvidenceLifetime', 'maximumBlockAgeMs', 'maximumClockSkewMs', 'maximumQueryMs'], ['schema']);
export const sourceToNoir = raw => { sourceCommitment(raw); return convert(raw, []); };
export const observationToNoir = raw => { exactRecord(raw, OBSERVATION_FIELDS); return convert(raw, ['blockHeight', 'observedAt', 'amount', 'custodyKind', 'evidenceFrom', 'evidenceUntil']); };
export const evidenceToNoir = raw => convert(Object.fromEntries(EVIDENCE_FIELDS.map(k => [k, raw[k]])), ['finalizedBlockHeight']);
