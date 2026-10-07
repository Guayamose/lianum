/** Inactive TRX leaf for a NEW generic native-value catalogue/key closure.
 * Existing family4 is only canonical native identity; it activates no old I.
 * All byte frames are explicit. No signature/finality flag authorizes a credit. */
import { createHash } from 'node:crypto';
import { fields, need, freeze, describeNetwork, unsignedDecimal as uint } from './portfolio-registry.mjs';
import { bindOriginalTronNativeTransfer } from './tron-native-transfer-wire.mjs';
import { fundedFrame } from '../../../../../omnichain-product/src/paeg/funded-graph.mjs';
import { canonicalNativeEffectId } from '../../../../../omnichain-product/src/paeg/native-receipt.mjs';
import { nativeTransferActionCommitment } from '../../../../../omnichain-product/src/paeg/native-capsules.mjs';
import { nativeQuorumRegistryCommitment } from '../../../../../omnichain-product/src/evidence/native-quorum.mjs';
import { createCommitmentCodec, validateStruct, fixedArray } from '../paeg/commitments.mjs';
import { cloneInput, inputPath } from '../paeg/readiness-inputs.mjs';
import { validateStatement, joinReadiness } from '../paeg/statements.mjs';
import { membership } from '../../../../../omnichain-product/src/paeg/native-state.mjs';
export const PROFILE_SCHEMA = 'LIANUM_TRON_NATIVE_VALUE_SOURCE_PROFILE_V2';
export const FACTS_SCHEMA = 'LIANUM_TRON_NATIVE_VALUE_FACTS_V2';
export const REGISTRY_SCHEMA = 'LIANUM_NATIVE_ADAPTER_REGISTRY_V2';
export const FINALITY = 'TRON_REGISTERED_NODE_SOLIDIFIED_ANCESTRY_V1';
export const PERMISSION = 'TRON_EXACT_PRETRANSACTION_OWNER_PERMISSION_REPLAY_V1';
export const TAPOS_EXPIRY = 'TRON_PARENT_RECENT_BLOCK_AND_CHAIN_TIME_EXPIRY_V1';
export const OBLIGATION = 'SUCCESSFUL_NATIVE_TRX_ENDPOINT_TRANSFER_EXACT_K_NO_RETENTION_V1';
export const REPLAY_SCHEMA = 'LIANUM_TRON_PRETRANSACTION_REPLAY_CONTEXT_V1';
export const sha256 = b => createHash('sha256').update(b).digest('hex');
export const exact = (raw, names, optional = []) => fields(raw, names, optional, true);
export function integer(v, bits = 64) { const n = uint(v, bits); need(n.toString() === v, 'TRON_GRAPH_CANONICAL_INTEGER'); return n; }
export function hex(v, width = 32, zero = false) {
  need(typeof v === 'string' && v.length === width * 2 && /^[0-9a-f]+$/.exec(v)?.[0] === v
    && (zero || /[1-9a-f]/.test(v)), 'TRON_GRAPH_HEX'); return Buffer.from(v, 'hex');
}
export const be = (v, width) => Buffer.from(integer(v, width * 8).toString(16).padStart(width * 2, '0'), 'hex');
export const hashFrame = (tag, parts) => sha256(fundedFrame(tag, parts));
const ZERO = '0'.repeat(64), LEGACY = Buffer.from('LIANUM_PAEG_NATIVE_4_V2');
const brands = new WeakSet();
export function tronGraphAsset(genesis) {
  hex(genesis); const network = describeNetwork('tron', genesis);
  // Existing holdings/observer native asset identity, not a spendable claim.
  return sha256('LIANUM/native-value-asset/1\0' + JSON.stringify({ nativeAssetId: network.nativeAsset.id }));
}
export function tronGraphChainDomain(genesis, asset) {
  return hashFrame('LIANUM/evidence-chain/1', [Buffer.from('TRON'), hex(genesis), hex(asset)]);
}
export function tronGraphEndpoint(genesis, asset, address) {
  hex(address, 21); need(address.startsWith('41'), 'TRON_GRAPH_ADDRESS');
  return hashFrame('LIANUM/PAEG/native-endpoint/2', [LEGACY, Buffer.from('TRON'), hex(genesis), hex(asset), Buffer.from('TRON_ADDRESS'), hex(address, 21)]);
}
export function tronGraphCustody({ genesis, asset, sourceCommitment, destinationCommitment }) {
  return hashFrame('LIANUM/PAEG/native-recipient-custody/2', [LEGACY, hex(tronGraphChainDomain(genesis, asset)), hex(sourceCommitment), hex(destinationCommitment)]);
}
export function tronGraphObservedEffect({ genesis, asset, nativeGid, blockId, blockHeight, transactionSHA256, sourceCommitment, destinationCommitment, amount }) {
  return hashFrame('LIANUM/PAEG/local-native-observed-effect/2', [LEGACY, hex(tronGraphChainDomain(genesis, asset)), hex(nativeGid), hex(blockId), be(blockHeight, 8),
    hex(transactionSHA256), hex(sourceCommitment), hex(destinationCommitment), be(amount, 16)]);
}
export function bindOriginalTronGraphTransfer(raw, genesis) {
  const original = exact(raw, ['nativeWire', 'expected'], ['inclusion']); hex(genesis);
  const { signed } = bindOriginalTronNativeTransfer({ nativeWire: original.nativeWire, expected: original.expected });
  need(signed.wireKeyCommitment !== null, 'TRON_GRAPH_EXACT_K_REQUIRED');
  const asset = tronGraphAsset(genesis), nativeId = signed.nativeId;
  const sourceCommitment = tronGraphEndpoint(genesis, asset, signed.ownerAddress);
  const destinationCommitment = tronGraphEndpoint(genesis, asset, signed.recipientAddress);
  const nativeGid = canonicalNativeEffectId({ chainDomain: { chain: 'TRON', genesis, asset }, effectIdentity: { transactionId: nativeId, effectIndex: '0' } });
  const identity = { family: '4', genesis, asset, nativeId, transactionId: nativeId + ZERO, effectIndex: '0', nativeGid,
    transactionSHA256: signed.transactionSHA256, sourceCommitment, destinationCommitment, amount: signed.amountSun };
  const actionTerms = { chainDomain: tronGraphChainDomain(genesis, asset), sourceCommitment, destinationCommitment, amount: signed.amountSun,
    custodyKind: 1, custodyCommitment: tronGraphCustody(identity), receiptKeyCommitment: signed.wireKeyCommitment };
  const result = freeze({ signed, identity, actionTerms, original: cloneInput(original) }); brands.add(result); return result;
}
export function assertTronGraphAction(binding, raw) {
  need(brands.has(binding), 'TRON_GRAPH_BINDING_PROVENANCE');
  const a = cloneInput(raw), cm = nativeTransferActionCommitment(a);
  for (const [k, v] of Object.entries(binding.actionTerms)) need(a[k] === v, 'TRON_GRAPH_ACTION_WIRE_MISMATCH');
  return cm;
}
const PROFILE_FIELDS = ['schema', 'version', 'genesis', 'asset', 'sourceSetRoot', 'finalityPolicy', 'permissionPolicy', 'taposExpiryPolicy', 'obligation',
  'maximumAncestry', 'maximumTaposDistance', 'maximumEvidenceLifetime', 'maximumBlockAgeMs', 'maximumClockSkewMs', 'maximumQueryMs'];
export function validateProfile(raw) {
  const p = exact(raw, PROFILE_FIELDS);
  need(p.schema === PROFILE_SCHEMA && p.version === '2', 'TRON_GRAPH_PROFILE_VERSION');
  for (const k of ['genesis', 'asset', 'sourceSetRoot']) hex(p[k]);
  need(p.asset === tronGraphAsset(p.genesis), 'TRON_GRAPH_NATIVE_ASSET');
  for (const [k, value] of Object.entries({ finalityPolicy: FINALITY, permissionPolicy: PERMISSION, taposExpiryPolicy: TAPOS_EXPIRY, obligation: OBLIGATION }))
    need(p[k] === sha256(value), 'TRON_GRAPH_PROFILE_SEMANTICS');
  const bounds = { maximumAncestry: [32, 1n, 256n], maximumTaposDistance: [32, 0n, 256n], maximumEvidenceLifetime: [64, 1n, 300n],
    maximumBlockAgeMs: [64, 1n, 86400000n], maximumClockSkewMs: [64, 0n, 30000n], maximumQueryMs: [64, 1n, 60000n] };
  for (const [k, [bits, min, max]] of Object.entries(bounds)) { const n = integer(p[k], bits); need(n >= min && n <= max, 'TRON_GRAPH_PROFILE_BOUNDS'); }
  return freeze(p);
}
export function profileFrame(raw) {
  const p = validateProfile(raw);
  return fundedFrame('LIANUM/tron-native-value-source-profile/2', [Buffer.from(PROFILE_SCHEMA), be(p.version, 4),
    ...['genesis', 'asset', 'sourceSetRoot', 'finalityPolicy', 'permissionPolicy', 'taposExpiryPolicy', 'obligation'].map(k => hex(p[k])),
    be(p.maximumAncestry, 4), be(p.maximumTaposDistance, 4), ...['maximumEvidenceLifetime', 'maximumBlockAgeMs', 'maximumClockSkewMs', 'maximumQueryMs'].map(k => be(p[k], 8))]);
}
export const profileCommitment = p => sha256(profileFrame(p));
export function sourceCommitment(raw) {
  const s = exact(raw, ['operatorIdentity', 'endpointIdentity', 'clientRelease', 'chainConfiguration']);
  // Same typed source position as generic EVM V2. Endpoint identity MUST cover
  // BOTH SolidityNode and historical replay source; callbacks are bootstrap-only.
  return hashFrame('LIANUM/native-value-source/2', Object.values(s).map(v => hex(v)));
}
export function pathRoot(leaf, raw, depth) {
  const p = exact(raw, ['index', 'siblings']); const index = integer(p.index, 8); fixedArray(p.siblings, depth);
  need(index < 1n << BigInt(depth), 'TRON_GRAPH_PATH_INDEX'); hex(leaf); let root = leaf;
  p.siblings.forEach((v, d) => { hex(v, 32, true); const parts = (index >> BigInt(d)) & 1n ? [v, root] : [root, v];
    root = sha256(Buffer.concat([Buffer.from([1]), ...parts.map(x => hex(x, 32, true))])); }); return root;
}
export function assertSource(profile, raw) {
  const s = exact(raw, ['identity', 'index', 'siblings']);
  need(pathRoot(sourceCommitment(s.identity), { index: s.index, siblings: s.siblings }, 2) === validateProfile(profile).sourceSetRoot, 'TRON_GRAPH_SOURCE_POSITION');
  return freeze(cloneInput(s));
}
export function registryCommitment(raw) {
  const r = exact(raw, ['schema', 'quorum']); need(r.schema === REGISTRY_SCHEMA, 'TRON_GRAPH_REGISTRY_VERSION');
  const q = r.quorum, inner = nativeQuorumRegistryCommitment(q);
  return hashFrame('LIANUM/native-adapter-registry/2', [Buffer.from(REGISTRY_SCHEMA), hex(sha256('LIANUM_NATIVE_ADAPTER_ENVELOPE_V2')), hex(q.hubDomain),
    be(q.registryEpoch, 8), hex(inner), hex(q.rulesRoot)]);
}
export function assertRegistration(raw) {
  const policy = exact(raw, ['ledgerNamespace', 'registry', 'profile', 'profilePath']);
  const p = validateProfile(policy.profile), r = registryCommitment(policy.registry);
  need(policy.ledgerNamespace === policy.registry.quorum.hubDomain, 'TRON_GRAPH_INITIAL_NAMESPACE'); hex(policy.ledgerNamespace);
  need(pathRoot(profileCommitment(p), policy.profilePath, 3) === policy.registry.quorum.rulesRoot, 'TRON_GRAPH_PROFILE_MEMBERSHIP');
  return freeze({ ...cloneInput(policy), registryCommitment: r, profileCommitment: profileCommitment(p) });
}
const OBS = ['blockId', 'stateCommitment', 'blockHeight', 'observedAt', 'sourceCommitment', 'destinationCommitment', 'amount', 'custodyKind', 'custodyCommitment', 'evidenceFrom', 'evidenceUntil'];
export function validateFacts(raw, policy) {
  const p = assertRegistration(policy), f = exact(raw, ['schema', 'ledgerNamespace', 'hubDomain', 'registryCommitment', 'registryEpoch', 'profileCommitment', 'sourceSetRoot',
    'family', 'genesis', 'asset', 'transactionId', 'effectIndex', 'nativeGid', 'transactionSHA256', 'wireKeyCommitment', 'observation',
    'finalizedBlockId', 'finalizedBlockHeight', 'executionEvidenceCommitment', 'finalityEvidenceCommitment']);
  need(f.schema === FACTS_SCHEMA, 'TRON_GRAPH_FACTS_SCHEMA');
  for (const [k, v] of Object.entries({ ledgerNamespace: p.ledgerNamespace, hubDomain: p.registry.quorum.hubDomain, registryCommitment: p.registryCommitment,
    registryEpoch: p.registry.quorum.registryEpoch, profileCommitment: p.profileCommitment, sourceSetRoot: p.profile.sourceSetRoot,
    family: '4', genesis: p.profile.genesis, asset: p.profile.asset, effectIndex: '0' })) need(f[k] === v, 'TRON_GRAPH_FACTS_POLICY');
  hex(f.transactionId, 64); need(f.transactionId.slice(64) === ZERO, 'TRON_GRAPH_TXID_PADDING');
  need(f.nativeGid === canonicalNativeEffectId({ chainDomain: { chain: 'TRON', genesis: f.genesis, asset: f.asset },
    effectIdentity: { transactionId: f.transactionId.slice(0, 64), effectIndex: '0' } }), 'TRON_GRAPH_GID');
  for (const k of ['transactionSHA256', 'wireKeyCommitment', 'finalizedBlockId', 'executionEvidenceCommitment', 'finalityEvidenceCommitment']) hex(f[k]);
  const o = exact(f.observation, OBS); for (const k of ['blockId', 'stateCommitment', 'sourceCommitment', 'destinationCommitment', 'custodyCommitment']) hex(o[k]);
  need(o.sourceCommitment !== o.destinationCommitment && o.custodyKind === '1', 'TRON_GRAPH_ENDPOINT_TERM');
  need(integer(o.amount, 63) > 0n, 'TRON_GRAPH_AMOUNT');
  const endpoints = { genesis: f.genesis, asset: f.asset, sourceCommitment: o.sourceCommitment, destinationCommitment: o.destinationCommitment };
  need(o.custodyCommitment === tronGraphCustody(endpoints), 'TRON_GRAPH_CUSTODY_TERM');
  need(o.stateCommitment === tronGraphObservedEffect({ ...endpoints, nativeGid: f.nativeGid, blockId: o.blockId, blockHeight: o.blockHeight,
    transactionSHA256: f.transactionSHA256, amount: o.amount }), 'TRON_GRAPH_EFFECT');
  const at = integer(o.observedAt), until = integer(o.evidenceUntil), height = integer(o.blockHeight), solid = integer(f.finalizedBlockHeight);
  need(o.evidenceFrom === o.observedAt && until === at + BigInt(p.profile.maximumEvidenceLifetime), 'TRON_GRAPH_LIFETIME');
  need(height > 0n && solid >= height && solid - height <= BigInt(p.profile.maximumAncestry), 'TRON_GRAPH_SOLIDIFIED_BOUND');
  if (solid === height) need(f.finalizedBlockId === o.blockId, 'TRON_GRAPH_SOLIDIFIED_ID');
  return freeze({ ...f, observation: o });
}
export function encodeFacts(raw, policy) {
  const f = validateFacts(raw, policy), o = f.observation;
  return fundedFrame('LIANUM/native-facts/tron-value/2', [Buffer.from(FACTS_SCHEMA), ...['ledgerNamespace', 'hubDomain', 'registryCommitment'].map(k => hex(f[k])),
    be(f.registryEpoch, 8), hex(f.profileCommitment), hex(f.sourceSetRoot), be(f.family, 1), hex(f.genesis), hex(f.asset), hex(f.transactionId, 64), be(f.effectIndex, 4),
    ...['nativeGid', 'transactionSHA256', 'wireKeyCommitment'].map(k => hex(f[k])), hex(o.blockId), hex(o.stateCommitment), be(o.blockHeight, 8), be(o.observedAt, 8),
    hex(o.sourceCommitment), hex(o.destinationCommitment), be(o.amount, 16), be(o.custodyKind, 1), hex(o.custodyCommitment), be(o.evidenceFrom, 8), be(o.evidenceUntil, 8),
    hex(f.finalizedBlockId), be(f.finalizedBlockHeight, 8), hex(f.executionEvidenceCommitment), hex(f.finalityEvidenceCommitment)]);
}
/** Existing local P/R/opening checks, deliberately separate from peers. */
export async function bindTronGraphReadiness(raw, { hashFields }) {
  const i = exact(cloneInput(raw), ['policy', 'original', 'action', 'dependencyStatement', 'readyStatement', 'readinessOpening', 'checkpointOpening']);
  const registration = assertRegistration(i.policy), binding = bindOriginalTronGraphTransfer(i.original, registration.profile.genesis);
  const actionCommitment = assertTronGraphAction(binding, i.action), d = validateStatement('dependency', i.dependencyStatement), r = validateStatement('ready', i.readyStatement);
  joinReadiness(d, r);
  const ro = exact(i.readinessOpening, ['domain', 'descriptor', 'readinessBlind']), domain = validateStruct('domain', ro.domain), descriptor = validateStruct('ready', ro.descriptor);
  need(domain.ledgerNamespace === registration.ledgerNamespace && domain.hubDomain === registration.registry.quorum.hubDomain
    && domain.registryCommitment === registration.registryCommitment, 'TRON_GRAPH_READY_REGISTRY');
  for (const k of ['scope', 'policy', 'asset', 'hubDomain', 'registryCommitment']) need(domain[k] === descriptor[k], 'TRON_GRAPH_READY_DOMAIN');
  need(descriptor.actionCommitment === actionCommitment && descriptor.chainDomain === binding.actionTerms.chainDomain
    && descriptor.evidencePolicy === registration.profileCommitment, 'TRON_GRAPH_READY_ACTION_PROFILE');
  need(descriptor.snapshotDigest === r.checkpoint && descriptor.readyFrom === r.readyFrom && descriptor.readyUntil === r.readyUntil, 'TRON_GRAPH_READY_CHECKPOINT');
  need(BigInt(i.action.executionFrom) <= BigInt(r.readyFrom) && BigInt(r.readyFrom) < BigInt(r.readyUntil)
    && BigInt(r.readyUntil) <= BigInt(i.action.executionUntil), 'TRON_GRAPH_READY_WINDOW');
  const codec = createCommitmentCodec({ hashFields }), domainCommitment = await codec.domainCommitment(domain);
  need(domainCommitment === r.domainCommitment && await codec.readinessCommitment(domainCommitment, r.joinCommitment, ro.readinessBlind, descriptor) === r.readinessCommitment, 'TRON_GRAPH_READY_SEAL');
  const checkpoint = inputPath(i.checkpointOpening, 6);
  membership('0x' + r.checkpoint, checkpoint.siblings.map(s => '0x' + s), String(checkpoint.index), '0x' + checkpoint.root);
  return freeze({ registration, binding, domain, domainCommitment, descriptor, action: i.action, actionCommitment, ready: r, checkpoint, activation: 'INACTIVE' });
}
export async function assertTronGraphCurrentState(context, raw, { hashFields }) {
  const s = exact(cloneInput(raw), ['head', 'registry', 'acceptedCheckpointRoot', 'currentRevocation', 'halt']);
  const h = exact(s.head, ['hash', 'height', 'timestamp']); hex(h.hash); integer(h.height); integer(h.timestamp);
  need(s.halt === '0' && registryCommitment(s.registry) === context.registration.registryCommitment, 'TRON_GRAPH_CURRENT_REGISTRY');
  need(s.acceptedCheckpointRoot === context.checkpoint.root, 'TRON_GRAPH_CHECKPOINT_NOT_ACCEPTED');
  const r = exact(s.currentRevocation, ['revokedDigest', 'revokedCount', 'revocationSequence', 'entries']); fixedArray(r.entries, 64); integer(r.revocationSequence);
  const codec = createCommitmentCodec({ hashFields });
  need(await codec.revokedDigest(context.domainCommitment, context.domain.hubDomain, r.entries, r.revokedCount) === r.revokedDigest, 'TRON_GRAPH_CURRENT_REVOCATION_DIGEST');
  need(!r.entries.slice(0, Number(r.revokedCount)).includes(context.binding.identity.nativeGid), 'TRON_GRAPH_CURRENT_GID_REVOKED');
  return freeze({ state: s, admissionRevocationState: await codec.admissionRevocationState(context.domainCommitment, { currentRevokedDigest: r.revokedDigest,
    currentRevokedCount: r.revokedCount, currentRevocationSequence: r.revocationSequence }) });
}
export function buildTronGraphAdmissionInputs() { throw new Error('TRON_GRAPH_INACTIVE_REQUIRES_GENERIC_UNION_SOURCE_CATALOGUE_NEW_KEY'); }
