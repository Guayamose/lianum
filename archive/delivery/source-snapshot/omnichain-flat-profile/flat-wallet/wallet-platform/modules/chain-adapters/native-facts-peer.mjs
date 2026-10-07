/** Facts-only host boundary for I84. No RPC startup, native signing/broadcast,
 * wallet/owner keys, proof execution, consensus proof or independence claim.
 * Fact reader, fixed-head clock, durable CAS store and ONE signer are trusted
 * construction capabilities. Public peer requests cannot replace them.
 */
import { createHash, createPublicKey, ECDH, KeyObject, sign, verify } from 'node:crypto';
import { types } from 'node:util';
import { FACTS_SCHEMA, validateNativeFacts, encodeNativeFacts, nativeFactsDigest,
  validateNativeClaimFacts, encodeNativeClaimFacts, nativeClaimFactsDigest,
  nativeRuleCommitment, nativeFactIdentity, nativeCustodyCommitment,
  nativeObservedEffectCommitment, validateBitcoinBinding,
  validateSolanaBindingTransaction } from './native-receipt-binding.mjs';
import { validateClaimSolanaBindingTransaction } from './owned-solana-nonce-binding.mjs';
import { validateEvmDeliveryWire, evmFundingEndpointCommitment } from './evm-facts-binding.mjs';

export const FACTS_QUORUM_PROFILE = 'LIANUM_NATIVE_QUORUM_3_OF_4_SECP256K1_V2';
export const FACTS_INVENTORY_SCHEMA = 'LIANUM_FLAT_FACTS_PEER_INVENTORY_V1';
export const CLAIM_FACTS_INVENTORY_SCHEMA = 'LIANUM_FLAT_CLAIM_FACTS_PEER_INVENTORY_V2';
// Fixed module-private codecs. Public construction accepts no profile selector
// or validation callback, and claim inventories cannot reopen as generic v1.
const V1_CODEC = Object.freeze({ validate: validateNativeFacts, encode: encodeNativeFacts, digest: nativeFactsDigest,
  solana: validateSolanaBindingTransaction, inventorySchema: FACTS_INVENTORY_SCHEMA, claim: false });
const CLAIM_CODEC = Object.freeze({ validate: validateNativeClaimFacts, encode: encodeNativeClaimFacts, digest: nativeClaimFactsDigest,
  solana: validateClaimSolanaBindingTransaction, inventorySchema: CLAIM_FACTS_INVENTORY_SCHEMA, claim: true });
export const FACTS_PEER_ASSURANCE = 'HOST_BOUNDARY_ONLY_NOT_NATIVE_CONSENSUS_OR_INDEPENDENT_OPERATORS';
const ZERO = '0'.repeat(64);
const ORDER = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
const CAPACITY = 64;
const LEGACY_PROFILE = Buffer.from('LIANUM_PAEG_NATIVE_4_V2');
const fail = code => { throw new Error(`FACTS_PEER_${code}`); };
const need = (value, code) => { if (!value) fail(code); };
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const frozen = value => {
  if (value && typeof value === 'object') { Object.values(value).forEach(frozen); Object.freeze(value); }
  return value;
};
function exact(value, fields, code = 'FIELDS') {
  need(value && !types.isProxy(value) && Object.getPrototypeOf(value) === Object.prototype, code);
  const keys = Reflect.ownKeys(value);
  need(keys.length === fields.length && fields.every(name => keys.includes(name)), code);
  for (const name of fields) {
    const d = Object.getOwnPropertyDescriptor(value, name);
    need(d && Object.hasOwn(d, 'value') && d.enumerable, code);
  }
}
function array(value, count, code = 'ARRAY') {
  need(Array.isArray(value) && !types.isProxy(value) && Object.getPrototypeOf(value) === Array.prototype
    && value.length === count && Reflect.ownKeys(value).length === count + 1, code);
  for (let i = 0; i < count; i++) need(Object.hasOwn(Object.getOwnPropertyDescriptor(value, String(i)) ?? {}, 'value'), code);
}
function hex(value, bytes = 32, nonzero = true) {
  need(typeof value === 'string' && value.length === bytes * 2 && /^[0-9a-f]+$/.test(value)
    && (!nonzero || /[1-9a-f]/.test(value)), 'HEX');
  return Buffer.from(value, 'hex');
}
function uint(value, width = 8) {
  need(typeof value === 'string' && value.length <= 39 && /^(0|[1-9][0-9]*)$/.test(value)
    && BigInt(value) < (1n << BigInt(width * 8)), 'UINT');
  const number = BigInt(value);
  need(number.toString() === value, 'UINT');
  return number;
}
function integer(value, width) { return Buffer.from(uint(value, width).toString(16).padStart(width * 2, '0'), 'hex'); }
function frame(tag, parts) {
  return Buffer.concat([Buffer.from(tag, 'ascii'), ...parts].flatMap(part => [integer(String(part.length), 4), part]));
}
// Reject executable/object-shape surprises before cloning or canonicalizing.
function data(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number') { need(Number.isSafeInteger(value), 'DATA_NUMBER'); return; }
  need(value && typeof value === 'object' && !types.isProxy(value), 'DATA');
  if (Array.isArray(value)) { array(value, value.length); value.forEach(data); return; }
  const keys = Reflect.ownKeys(value); need(keys.every(key => typeof key === 'string'), 'DATA_KEY');
  exact(value, keys); keys.forEach(key => data(value[key]));
}
function canonical(value) {
  data(value);
  const sort = v => Array.isArray(v) ? v.map(sort) : v && typeof v === 'object'
    ? Object.fromEntries(Object.keys(v).sort().map(key => [key, sort(v[key])])) : v;
  return JSON.stringify(sort(value));
}
function copy(value) { data(value); return JSON.parse(JSON.stringify(value)); }
function point(input) {
  exact(input, ['x', 'y']); const x = hex(input.x), y = hex(input.y);
  try { ECDH.convertKey(Buffer.concat([Buffer.from([4]), x, y]), 'secp256k1'); }
  catch { fail('PUBLIC_KEY'); }
  return frozen(copy(input));
}
function keyObject(input) {
  const p = point(input);
  return createPublicKey({ format: 'jwk', key: { kty: 'EC', crv: 'secp256k1',
    x: Buffer.from(p.x, 'hex').toString('base64url'), y: Buffer.from(p.y, 'hex').toString('base64url') } });
}
function verifySignature(publicKey, signature, bytes) {
  const raw = hex(signature, 64);
  const r = BigInt('0x' + signature.slice(0, 64)), s = BigInt('0x' + signature.slice(64));
  need(r > 0n && r < ORDER && s > 0n && s <= ORDER / 2n, 'SIGNATURE_LOW_S');
  need(verify('sha256', bytes, { key: keyObject(publicKey), dsaEncoding: 'ieee-p1363' }, raw), 'SIGNATURE_INVALID');
}
function policyCopy(input, codec) {
  exact(input, ['ledgerNamespace', 'hubDomain', 'registryCommitment', 'rule']);
  for (const key of ['ledgerNamespace', 'hubDomain', 'registryCommitment']) hex(input[key]);
  nativeRuleCommitment(input.rule); // exact family/genesis/asset/finality/bounds
  if (codec.claim) need(['1', '2'].includes(input.rule.family), 'CLAIM_FAMILY');
  return frozen(copy(input));
}

/** Dedicated single-key signer. The only method accepts canonical native
 * facts under one pinned policy, never arbitrary bytes/digests. Private keys
 * must be dedicated attester keys; a wallet/owner/native key is not an input.
 */
export function createNativeFactsSigner(input) { return createFactsSigner(input, V1_CODEC); }
export function createNativeClaimFactsSigner(input) { return createFactsSigner(input, CLAIM_CODEC); }
function createFactsSigner(input, codec) {
  exact(input, ['privateKey', 'policy']);
  const policy = policyCopy(input.policy, codec), privateKey = input.privateKey;
  need(privateKey instanceof KeyObject && privateKey.type === 'private'
    && privateKey.asymmetricKeyType === 'ec'
    && privateKey.asymmetricKeyDetails?.namedCurve === 'secp256k1', 'DEDICATED_SECP_KEY');
  const jwk = createPublicKey(privateKey).export({ format: 'jwk' });
  const publicKey = point({ x: Buffer.from(jwk.x, 'base64url').toString('hex'), y: Buffer.from(jwk.y, 'base64url').toString('hex') });
  return Object.freeze({ publicKey, signFacts(facts) {
    const bytes = codec.encode(facts, policy);
    const signature = sign('sha256', bytes, { key: privateKey, dsaEncoding: 'ieee-p1363' });
    const s = BigInt('0x' + signature.subarray(32).toString('hex'));
    return signature.subarray(0, 32).toString('hex') + (s > ORDER / 2n ? ORDER - s : s).toString(16).padStart(64, '0');
  } });
}

function registryCopy(input) {
  exact(input, ['profile', 'hubDomain', 'registryEpoch', 'rulesRoot', 'keys']);
  need(input.profile === FACTS_QUORUM_PROFILE, 'REGISTRY_PROFILE');
  hex(input.hubDomain); hex(input.rulesRoot); uint(input.registryEpoch);
  array(input.keys, 4); const keys = input.keys.map(point);
  need(new Set(keys.map(key => key.x)).size === 4, 'REGISTRY_KEY_ALIAS');
  return frozen({ ...copy(input), keys });
}
/** Exact original registry SHA codec, public keys only. */
export function nativeFactsRegistryCommitment(input) {
  const r = registryCopy(input);
  return sha(frame('LIANUM/native-registry/secp256k1/2', [Buffer.from(r.profile),
    hex(r.hubDomain), integer(r.registryEpoch, 8), hex(r.rulesRoot), ...r.keys.flatMap(key => [hex(key.x), hex(key.y)])]));
}
function verifyRulePath(rule, path, root) {
  exact(path, ['index', 'siblings']); need(uint(path.index, 1) < 8n, 'RULE_INDEX'); array(path.siblings, 3);
  let current = nativeRuleCommitment(rule);
  path.siblings.forEach((sibling, depth) => {
    const pair = ((Number(path.index) >> depth) & 1) === 0 ? [current, sibling] : [sibling, current];
    current = sha(Buffer.concat([Buffer.from([1]), ...pair.map(value => hex(value, 32, false))]));
  });
  need(current === root, 'RULE_MEMBERSHIP');
}
function clockCapabilities(clock) {
  exact(clock, ['read', 'assertCurrent']); need(typeof clock.read === 'function' && typeof clock.assertCurrent === 'function', 'CLOCK_CAPABILITY');
  return { read: clock.read.bind(clock), assertCurrent: clock.assertCurrent.bind(clock) };
}
async function clockSnapshot(clock) {
  const result = await clock.read(); exact(result, ['timestamp', 'head']); uint(result.timestamp); hex(result.head);
  return frozen(copy(result));
}
async function sameHead(clock, header) { need(await clock.assertCurrent(header) === undefined, 'CLOCK_MUST_ASSERT'); }
function certificateFor(entry, signerIndex, policy, codec) {
  return frozen({ schema: FACTS_SCHEMA, signerIndex, facts: copy(entry.facts),
    frameHex: codec.encode(entry.facts, policy).toString('hex'),
    digest: codec.digest(entry.facts, policy), signature: entry.signature });
}
function validateCertificate(input, policy, publicKey, now, codec) {
  exact(input, ['schema', 'signerIndex', 'facts', 'frameHex', 'digest', 'signature']);
  need(input.schema === FACTS_SCHEMA && uint(input.signerIndex, 1) < 4n, 'CERTIFICATE_SCHEMA');
  const facts = codec.validate(input.facts, policy), bytes = codec.encode(facts, policy);
  need(input.frameHex === bytes.toString('hex') && input.digest === sha(bytes), 'CERTIFICATE_FRAME');
  need(uint(facts.observation.evidenceFrom) <= now && now < uint(facts.observation.evidenceUntil), 'CERTIFICATE_EXPIRED');
  verifySignature(publicKey, input.signature, bytes);
  return { facts, bytes };
}
/** Configure with authenticated deployment pins and public registry only.
 * Exactly three ordered certificates are accepted; this is host conformance.
 */
export function createNativeFactsCollector(input) { return createFactsCollector(input, V1_CODEC); }
export function createNativeClaimFactsCollector(input) { return createFactsCollector(input, CLAIM_CODEC); }
function createFactsCollector(input, codec) {
  exact(input, ['policy', 'registry', 'rulePath', 'clock']);
  const policy = policyCopy(input.policy, codec), registry = registryCopy(input.registry), clock = clockCapabilities(input.clock);
  need(registry.hubDomain === policy.hubDomain
    && nativeFactsRegistryCommitment(registry) === policy.registryCommitment, 'REGISTRY_PIN');
  verifyRulePath(policy.rule, copy(input.rulePath), registry.rulesRoot);
  return Object.freeze({ async collect(request) {
    exact(request, ['certificates']); array(request.certificates, 3, 'EXACTLY_THREE_CERTIFICATES');
    // Snapshot before any awaited clock call; callers cannot mutate a pending collection.
    const certificates = copy(request.certificates), header = await clockSnapshot(clock), now = uint(header.timestamp);
    let first;
    for (let i = 0; i < 3; i++) {
      const index = uint(certificates[i].signerIndex, 1); need(index < 4n, 'SIGNER_INDEX');
      need(i === 0 || uint(certificates[i - 1].signerIndex, 1) < index, 'SIGNER_ORDER');
      const checked = validateCertificate(certificates[i], policy, registry.keys[Number(index)], now, codec);
      if (first) need(checked.bytes.equals(first.bytes), 'FACTS_DISAGREE'); else first = checked;
    }
    await sameHead(clock, header);
    return frozen({ schema: FACTS_SCHEMA, facts: copy(first.facts), frameHex: first.bytes.toString('hex'),
      digest: sha(first.bytes), indexes: certificates.map(c => c.signerIndex),
      signatures: certificates.map(c => c.signature), assurance: FACTS_PEER_ASSURANCE });
  } });
}

function endpoint(family, genesis, asset, rawHex) {
  if (family === '3') return evmFundingEndpointCommitment({ genesis, asset, address: rawHex });
  const raw = hex(rawHex, family === '1' ? 22 : 32);
  if (family === '1') need(/^0014[0-9a-f]{40}$/.test(rawHex), 'P2WPKH');
  return sha(frame('LIANUM/PAEG/native-endpoint/2', [LEGACY_PROFILE,
    Buffer.from(family === '1' ? 'BTC' : 'SOL'), hex(genesis), hex(asset),
    Buffer.from(family === '1' ? 'BTC_P2WPKH_SCRIPT' : 'SOL_PUBLIC_KEY'), raw]));
}
function publicConfiguration(input, codec) {
  exact(input, ['policy', 'signerIndex', 'publicKey', 'recipients']);
  const policy = policyCopy(input.policy, codec), publicKey = point(input.publicKey);
  need(uint(input.signerIndex, 1) < 4n, 'SIGNER_INDEX');
  need(Array.isArray(input.recipients) && input.recipients.length >= 1 && input.recipients.length <= 2, 'RECIPIENTS');
  array(input.recipients, input.recipients.length);
  const seen = new Set(), recipients = input.recipients.map(recipient => {
    exact(recipient, ['recipientIndex', 'sourceEndpoint', 'destinationEndpoint']); uint(recipient.recipientIndex, 1);
    need(!seen.has(recipient.recipientIndex), 'RECIPIENT_DUPLICATE'); seen.add(recipient.recipientIndex);
    for (const name of ['sourceEndpoint', 'destinationEndpoint']) endpoint(policy.rule.family, policy.rule.genesis, policy.rule.asset, recipient[name]);
    need(recipient.sourceEndpoint !== recipient.destinationEndpoint, 'ENDPOINTS'); return copy(recipient);
  });
  return frozen({ policy, signerIndex: input.signerIndex, publicKey, recipients });
}
function configurationDigest(config, codec) {
  return sha(Buffer.from(canonical(codec.claim ? { profile: codec.inventorySchema, configuration: config } : config)));
}
/** Explicit first-use bootstrap data. Never silently create this after loss,
 * restore it over an existing inventory, or use it to reset an issuer history.
 */
export function createNativeFactsInventory(input) { return createFactsInventory(input, V1_CODEC); }
export function createNativeClaimFactsInventory(input) { return createFactsInventory(input, CLAIM_CODEC); }
function createFactsInventory(input, codec) {
  const config = publicConfiguration(input, codec);
  return frozen({ schema: codec.inventorySchema, configurationDigest: configurationDigest(config, codec), lastClock: '0', entries: [] });
}
function requestCopy(input, config) {
  exact(input, ['family', 'recipientIndex', 'nativeId', 'wireKeyCommitment']);
  need(input.family === config.policy.rule.family, 'REQUEST_FAMILY'); uint(input.recipientIndex, 1);
  need(config.recipients.some(row => row.recipientIndex === input.recipientIndex), 'OWNED_RECIPIENT');
  hex(input.nativeId, input.family === '2' ? 64 : 32); hex(input.wireKeyCommitment);
  return frozen(copy(input));
}
function requestedGid(request, policy, effectIndex) {
  return nativeFactIdentity({ family: request.family, genesis: policy.rule.genesis, asset: policy.rule.asset,
    transactionId: request.nativeId + (request.family === '2' ? '' : ZERO), effectIndex });
}
function readerRequest(request) {
  return frozen({ family: request.family, recipientIndex: request.recipientIndex, nativeId: request.nativeId });
}
function deriveFacts(result, request, config, at, codec) {
  exact(result, ['status', 'genesis', 'asset', 'nativeWire', 'intent', 'blockId', 'blockHeight', 'finalityKind', 'confirmations', 'nativeContext']);
  need(result.status === 'observed', 'OBSERVATION_STATUS');
  const { policy } = config, { rule } = policy;
  need(result.genesis === rule.genesis && result.asset === rule.asset, 'OBSERVATION_DOMAIN');
  const route = config.recipients.find(row => row.recipientIndex === request.recipientIndex);
  const wire = request.family === '1' ? validateBitcoinBinding(result.nativeWire, result.intent)
    : request.family === '2' ? codec.solana(result.nativeWire, result.intent)
      : validateEvmDeliveryWire(result.nativeWire, result.intent);
  if (request.family === '1') need(wire.containsWitness, 'UNSIGNED_BTC');
  need((request.family === '1' ? wire.txid : request.family === '2' ? wire.signatureHex : wire.nativeId) === request.nativeId, 'NATIVE_ID');
  need(wire.wireKeyCommitment === request.wireKeyCommitment, 'NATIVE_WIRE_KEY');
  const source = request.family === '1' ? result.intent.sourceScript
    : request.family === '2' ? result.intent.sourcePublicKey : wire.sourceEndpoint;
  const destination = request.family === '1' ? result.intent.recipientScript
    : request.family === '2' ? result.intent.recipientPublicKey : wire.destinationEndpoint;
  need(source === route.sourceEndpoint && destination === route.destinationEndpoint, 'OWNED_ENDPOINTS');
  if (request.family === '3') {
    const identity = result.intent.descriptor.identity;
    need(identity.genesisHash === rule.genesis && identity.shareIdentity === rule.asset
      && identity.ledgerNamespace === policy.ledgerNamespace, 'EVM_DESCRIPTOR_DOMAIN');
  }
  const sourceCommitment = endpoint(request.family, rule.genesis, rule.asset, source);
  const destinationCommitment = request.family === '3' ? wire.destinationCommitment
    : endpoint(request.family, rule.genesis, rule.asset, destination);
  const endpoints = { family: request.family, genesis: rule.genesis, asset: rule.asset, sourceCommitment, destinationCommitment };
  const nativeGid = requestedGid(request, policy, wire.effectIndex), amount = request.family === '1' ? result.intent.amountSatoshi
    : request.family === '2' ? result.intent.lamports : wire.amount;
  const evidenceUntil = (uint(at) + uint(rule.maximumEvidenceLifetime)).toString(); uint(evidenceUntil);
  const observation = { blockId: result.blockId, stateCommitment: nativeObservedEffectCommitment({ ...endpoints,
    nativeGid, blockId: result.blockId, blockHeight: result.blockHeight, transactionSHA256: wire.transactionSHA256, amount }),
    blockHeight: result.blockHeight, observedAt: at, finalityKind: result.finalityKind, confirmations: result.confirmations,
    sourceCommitment, destinationCommitment, amount, custodyKind: '1', custodyCommitment: nativeCustodyCommitment(endpoints),
    evidenceFrom: at, evidenceUntil };
  const facts = { ledgerNamespace: policy.ledgerNamespace, hubDomain: policy.hubDomain, registryCommitment: policy.registryCommitment,
    ruleCommitment: nativeRuleCommitment(rule), family: request.family, genesis: rule.genesis, asset: rule.asset,
    transactionId: request.nativeId + (request.family === '2' ? '' : ZERO), effectIndex: wire.effectIndex, nativeGid,
    transactionSHA256: wire.transactionSHA256, wireBindingVersion: wire.wireBindingVersion, wireBindingKind: wire.wireBindingKind,
    wireBindingPosition: wire.wireBindingPosition, wireKeyCommitment: wire.wireKeyCommitment,
    observation, nativeContext: copy(result.nativeContext) };
  return { facts: codec.validate(facts, policy), nativeWire: result.nativeWire, intent: copy(result.intent) };
}
function stableIdentity(entry, observed, codec) {
  need(entry.nativeWire === observed.nativeWire, 'CERTIFIED_WIRE_CHANGED');
  for (const field of ['nativeGid', 'family', 'genesis', 'asset', 'transactionId', 'effectIndex', 'transactionSHA256',
    'wireBindingVersion', 'wireBindingKind', 'wireBindingPosition', 'wireKeyCommitment'])
    need(entry.facts[field] === observed.facts[field], 'CERTIFIED_IDENTITY_CHANGED');
  // A changed certified block is adverse even if the same transaction later
  // regains finality. Revocation resolution is a separate future authority.
  for (const field of ['blockId', 'blockHeight', 'sourceCommitment', 'destinationCommitment', 'amount', 'custodyKind', 'custodyCommitment'])
    need(entry.facts.observation[field] === observed.facts.observation[field], 'CERTIFIED_FACT_CHANGED');
  if (codec.claim || entry.facts.family === '3') {
    need(canonical(entry.intent) === canonical(observed.intent), 'CERTIFIED_INTENT_CHANGED');
    const before = entry.facts.nativeContext, after = observed.facts.nativeContext;
    if (entry.facts.family === '2') {
      need(after.transactionSlot === before.transactionSlot && after.parentSlot === before.parentSlot, 'SOL_SLOT_CHANGED');
      need(uint(after.observedSlot) >= uint(before.observedSlot), 'SOL_SLOT_ROLLBACK');
    } else {
      need(uint(after.observedTipHeight) >= uint(before.observedTipHeight), 'EVM_TIP_ROLLBACK');
      if (after.observedTipHeight === before.observedTipHeight)
        need(after.observedTipId === before.observedTipId, 'EVM_SAME_HEIGHT_TIP_CHANGED');
    }
  }
}
function validateInventory(state, config, codec) {
  exact(state, ['schema', 'configurationDigest', 'lastClock', 'entries']);
  need(state.schema === codec.inventorySchema && state.configurationDigest === configurationDigest(config, codec), 'INVENTORY_CONFIGURATION');
  uint(state.lastClock); need(Array.isArray(state.entries) && state.entries.length <= CAPACITY, 'INVENTORY_CAPACITY'); array(state.entries, state.entries.length);
  const gids = new Set(), nativeIds = new Set();
  for (const entry of state.entries) {
    exact(entry, ['request', 'nativeWire', 'intent', 'facts', 'maximumEvidenceUntil', 'status', 'reason', 'lastCheckedAt', 'signature']);
    requestCopy(entry.request, config); const facts = codec.validate(entry.facts, config.policy);
    need(!gids.has(facts.nativeGid), 'INVENTORY_DUPLICATE'); gids.add(facts.nativeGid);
    if (codec.claim) {
      need(!nativeIds.has(entry.request.nativeId), 'INVENTORY_NATIVE_ID_DUPLICATE'); nativeIds.add(entry.request.nativeId);
    }
    need(facts.nativeGid === requestedGid(entry.request, config.policy, facts.effectIndex), 'INVENTORY_IDENTITY');
    const rebuilt = deriveFacts({ status: 'observed', genesis: facts.genesis, asset: facts.asset, nativeWire: entry.nativeWire,
      intent: entry.intent, blockId: facts.observation.blockId, blockHeight: facts.observation.blockHeight,
      finalityKind: facts.observation.finalityKind, confirmations: facts.observation.confirmations,
      nativeContext: facts.nativeContext }, entry.request, config, facts.observation.observedAt, codec);
    need(canonical(rebuilt.facts) === canonical(facts), 'INVENTORY_FACTS');
    need(uint(entry.maximumEvidenceUntil) >= uint(facts.observation.evidenceUntil), 'INVENTORY_EXPIRY');
    need(uint(entry.lastCheckedAt) <= uint(state.lastClock), 'INVENTORY_CLOCK');
    need(['live', 'unknown', 'adverse'].includes(entry.status), 'INVENTORY_STATUS');
    need(entry.status === 'live' ? entry.reason === null : typeof entry.reason === 'string' && /^[A-Z0-9_]{1,80}$/.test(entry.reason), 'INVENTORY_REASON');
    if (entry.signature !== null) verifySignature(config.publicKey, entry.signature, codec.encode(facts, config.policy));
  }
  return copy(state);
}

/** Trusted construction only. Returned peer never exposes the signer, store,
 * reader, a generic sign method, root wallets or any private key material.
 */
export async function createNativeFactsPeer(input) { return createFactsPeer(input, V1_CODEC); }
export async function createNativeClaimFactsPeer(input) { return createFactsPeer(input, CLAIM_CODEC); }
async function createFactsPeer(input, codec) {
  exact(input, ['policy', 'signerIndex', 'recipients', 'signer', 'reader', 'clock', 'store']);
  exact(input.signer, ['publicKey', 'signFacts']); need(typeof input.signer.signFacts === 'function', 'SIGNER_CAPABILITY');
  exact(input.reader, ['observe']); need(typeof input.reader.observe === 'function', 'READER_CAPABILITY');
  exact(input.store, ['load', 'commit']); need(typeof input.store.load === 'function' && typeof input.store.commit === 'function', 'STORE_CAPABILITY');
  const config = publicConfiguration({ policy: input.policy, signerIndex: input.signerIndex,
    publicKey: input.signer.publicKey, recipients: input.recipients }, codec);
  const signer = input.signer.signFacts.bind(input.signer), observe = input.reader.observe.bind(input.reader);
  const load = input.store.load.bind(input.store), save = input.store.commit.bind(input.store), clock = clockCapabilities(input.clock);
  let saved = await load(); exact(saved, ['revision', 'state']); uint(saved.revision);
  let revision = saved.revision, state = validateInventory(saved.state, config, codec), busy = false, poisoned = false;
  async function commit(next) {
    try {
      const checked = validateInventory(next, config, codec), expectedRevision = revision;
      const result = await save(frozen({ expectedRevision, nextState: copy(checked) }));
      exact(result, ['revision', 'state']);
      need(uint(result.revision) === uint(expectedRevision) + 1n
        && canonical(result.state) === canonical(checked), 'STORE_COMMIT_ACK');
      const persisted = await load(); exact(persisted, ['revision', 'state']);
      need(persisted.revision === result.revision && canonical(persisted.state) === canonical(checked), 'STORE_READBACK');
      revision = result.revision; state = checked;
    } catch (cause) { poisoned = true; throw new Error('FACTS_PEER_DURABLE_WRITE_FAILED_REOPEN_REQUIRED', { cause }); }
  }
  async function serial(work) {
    need(!busy && !poisoned, poisoned ? 'REOPEN_REQUIRED' : 'BUSY'); busy = true;
    try {
      const current = await load(); exact(current, ['revision', 'state']);
      if (current.revision !== revision || canonical(current.state) !== canonical(state)) { poisoned = true; fail('INVENTORY_CHANGED_REOPEN_REQUIRED'); }
      return await work();
    } finally { busy = false; }
  }
  async function now() {
    const header = await clockSnapshot(clock);
    need(uint(header.timestamp) >= uint(state.lastClock), 'CLOCK_ROLLBACK'); return header;
  }
  async function inspect(request, header) {
    let result;
    try { result = await observe(readerRequest(request)); }
    catch { return { status: 'unknown', reason: 'NATIVE_READ_UNAVAILABLE' }; }
    try {
      data(result); // Do not invoke a status getter or accept a proxy first.
      if (result?.status !== 'observed') {
        exact(result, ['status', 'reason']);
        need(['unknown', 'unavailable', 'adverse'].includes(result.status)
          && typeof result.reason === 'string' && /^[A-Z0-9_]{1,80}$/.test(result.reason), 'OBSERVATION_FAILURE');
        return { status: result.status === 'adverse' ? 'adverse' : 'unknown', reason: result.reason };
      }
      return { status: 'observed', ...deriveFacts(result, request, config, header.timestamp, codec) };
    } catch { return { status: 'adverse', reason: 'NATIVE_OBSERVATION_INVALID' }; }
  }
  async function mark(index, status, reason, at) {
    const next = copy(state); next.lastClock = at;
    Object.assign(next.entries[index], { status, reason, lastCheckedAt: at });
    if (status === 'live' && canonical(next) === canonical(state)) {
      // A fresh observation at the same canonical clock can leave the exact
      // retained state unchanged. Do not append an identical durable revision,
      // but re-read after that awaited observation: serial()'s earlier load
      // cannot establish that the original store is still unchanged now.
      try {
        const current = await load(); exact(current, ['revision', 'state']);
        need(current.revision === revision && canonical(current.state) === canonical(state),
          'INVENTORY_CHANGED_REOPEN_REQUIRED');
      } catch (cause) { poisoned = true; throw new Error('FACTS_PEER_DURABLE_WRITE_FAILED_REOPEN_REQUIRED', { cause }); }
      return;
    }
    // Changed clocks/statuses and every unknown/adverse result keep the
    // original validated CAS commit, readback and poisoning behavior.
    await commit(next);
  }
  async function audit(header) {
    const observations = new Map(), blockers = [];
    // No early exit on a missing RPC: another entry's adverse observation must
    // still be durably marked. Adverse entries never clear merely by expiring.
    for (let i = 0; i < state.entries.length; i++) {
      const entry = state.entries[i], gid = entry.facts.nativeGid;
      if (entry.status === 'adverse') { blockers.push({ nativeGid: gid, status: 'adverse', reason: entry.reason }); continue; }
      // EVM and fixed claim deliveries remain outstanding after certificate
      // expiry. Generic BTC/SOL peer expiry behavior is preserved; their
      // operator-level audit independently re-observes retained certificates.
      if (!codec.claim && config.policy.rule.family !== '3' && uint(entry.maximumEvidenceUntil) <= uint(header.timestamp)) continue;
      let observed = await inspect(entry.request, header);
      if (observed.status === 'observed') {
        try { stableIdentity(entry, observed, codec); }
        catch { observed = { status: 'adverse', reason: 'CERTIFIED_NATIVE_FACT_CHANGED' }; }
      }
      if (observed.status !== 'observed') {
        await mark(i, observed.status, observed.reason, header.timestamp);
        blockers.push({ nativeGid: gid, status: observed.status, reason: observed.reason });
      } else {
        observations.set(gid, observed);
        await mark(i, 'live', null, header.timestamp);
      }
    }
    await sameHead(clock, header);
    return { observations, blockers };
  }
  async function issue(raw, requireExisting) {
    const request = requestCopy(raw, config);
    return serial(async () => {
      const header = await now();
      // A claim wire's effect index is not known until its strict parser ran.
      // Reissuance finds the retained native transaction first, then requires
      // the complete original public request, without guessing a v1 GID.
      const initialIndex = codec.claim
        ? state.entries.findIndex(entry => entry.request.nativeId === request.nativeId)
        : state.entries.findIndex(entry => entry.facts.nativeGid === requestedGid(request, config.policy, '0'));
      need(!requireExisting || initialIndex >= 0, 'REFRESH_UNKNOWN_ID');
      if (initialIndex >= 0) need(canonical(state.entries[initialIndex].request) === canonical(request), 'REISSUANCE_REQUEST_CHANGED');
      const { observations, blockers } = await audit(header);
      need(blockers.length === 0, 'INVENTORY_BLOCKED');
      const prior = initialIndex >= 0 ? state.entries[initialIndex] : null;
      need(prior || state.entries.length < CAPACITY, 'INVENTORY_SATURATED');
      let observed = (prior ? observations.get(prior.facts.nativeGid) : undefined) ?? await inspect(request, header);
      if (observed.status === 'observed' && prior) {
        try { stableIdentity(prior, observed, codec); }
        catch { observed = { status: 'adverse', reason: 'CERTIFIED_NATIVE_FACT_CHANGED' }; }
      }
      if (observed.status !== 'observed') {
        if (prior) await mark(initialIndex, observed.status, observed.reason, header.timestamp);
        fail(observed.status === 'adverse' ? 'NATIVE_ADVERSE' : 'NATIVE_HISTORY_UNAVAILABLE');
      }
      await sameHead(clock, header);
      if (prior?.signature && canonical(prior.facts) === canonical(observed.facts))
        return certificateFor(prior, config.signerIndex, config.policy, codec);
      const entry = { request: copy(request), nativeWire: observed.nativeWire, intent: observed.intent,
        facts: copy(observed.facts), maximumEvidenceUntil: (prior && uint(prior.maximumEvidenceUntil) > uint(observed.facts.observation.evidenceUntil)
          ? prior.maximumEvidenceUntil : observed.facts.observation.evidenceUntil), status: 'live', reason: null,
        lastCheckedAt: header.timestamp, signature: null };
      const next = copy(state); next.lastClock = header.timestamp;
      const index = initialIndex < 0 ? next.entries.length : initialIndex;
      next.entries[index] = entry;
      // Conservative pre-sign inventory survives signer failure/lost reply.
      await commit(next);
      await sameHead(clock, header);
      const signature = await signer(frozen(copy(entry.facts)));
      verifySignature(config.publicKey, signature, codec.encode(entry.facts, config.policy));
      const signed = copy(state); signed.entries[index].signature = signature;
      await commit(signed);
      await sameHead(clock, header);
      return certificateFor(state.entries[index], config.signerIndex, config.policy, codec);
    });
  }
  return Object.freeze({ signerIndex: config.signerIndex, publicKey: config.publicKey, assurance: FACTS_PEER_ASSURANCE,
    certify: request => issue(request, false), refresh: request => issue(request, true),
    auditInventory: () => serial(async () => {
      const header = await now(), { blockers } = await audit(header);
      return frozen({ ready: blockers.length === 0 && state.entries.length < CAPACITY,
        certifiedInventoryCount: String(state.entries.length), at: header.timestamp,
        capacityAvailable: state.entries.length < CAPACITY, blockers, assurance: FACTS_PEER_ASSURANCE });
    }) });
}
