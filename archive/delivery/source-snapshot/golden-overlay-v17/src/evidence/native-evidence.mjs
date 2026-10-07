/**
 * Strict, host-side native-evidence boundary. This is federated attestation,
 * NOT a native consensus predicate or circuit/contract enforcement.
 * Ed25519 has no current Noir/EVM verification predicate in this repository;
 * existing native circuits use secp256k1. The enforceable signature scheme and
 * matching predicate must be chosen/integrated before strict deployment.
 *
 * Provision the mobile root public key through the wallet's trusted setup.
 * A host-supplied replacement root defeats that trust anchor. The mobile root
 * authorizes the exact profile and registry; it does not sign native facts here.
 * Operation authorization, native custody and privacy remain separate checks.
 * Four keys/processes under one administrator are ONE operator. Administrative
 * independence cannot be established by these signatures or by member labels.
 */
import { createHash, createPublicKey, verify } from 'node:crypto';

export const FEDERATED_PROFILE = 'FEDERATED_QUORUM_3_OF_4_V1';
export const FEDERATED_RULESET = createHash('sha256').update(
  'LIANUM/native-evidence-rules/1:ed25519:3-of-4:transfer-credit-v1:global-effect-nullifier',
).digest('hex');
export const UNSUPPORTED_CONSENSUS_PROFILES = Object.freeze([
  'BITCOIN_CONSENSUS_V1', 'SOLANA_CONSENSUS_V1', 'EVM_CONSENSUS_V1',
]);
export const EVIDENCE_LIMITS = Object.freeze({
  registryMembers: 4, quorum: 3, maximumLifetimeSeconds: 86400,
  maximumStatementBytes: 4096,
});
const MAX_U64 = (1n << 64n) - 1n;
const MAX_U128 = (1n << 128n) - 1n;
const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');
const need = (condition, code) => { if (!condition) throw new Error(code); };

function exact(value, fields, code) {
  need(value !== null && typeof value === 'object'
    && Object.getPrototypeOf(value) === Object.prototype, code);
  const keys = Reflect.ownKeys(value);
  need(keys.length === fields.length && fields.every(field => keys.includes(field)), code);
  need(fields.every(field => Object.hasOwn(Object.getOwnPropertyDescriptor(value, field), 'value')), code);
}
function text(value, code, maximum = 64) {
  need(typeof value === 'string' && value.length >= 1 && value.length <= maximum
    && /^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(value), code);
  return value;
}
function hex(value, bytes, code) {
  need(typeof value === 'string' && value.length === bytes * 2 && /^[0-9a-f]+$/.test(value), code);
  return value;
}
function uint(value, maximum, code) {
  need(typeof value === 'string' && value.length <= 39 && /^(0|[1-9][0-9]*)$/.test(value), code);
  need(BigInt(value) <= maximum, code);
  return value;
}
function interval(value, code) {
  exact(value, ['validFrom', 'validUntil'], code);
  const validFrom = uint(value.validFrom, MAX_U64, code);
  const validUntil = uint(value.validUntil, MAX_U64, code);
  need(BigInt(validFrom) < BigInt(validUntil), code);
  return { validFrom, validUntil };
}
function freeze(value) {
  for (const child of Object.values(value)) if (child && typeof child === 'object') freeze(child);
  return Object.freeze(value);
}

// Explicit length-prefix framing; no JSON ordering, Unicode, number coercion,
// optional fields or unbounded payload is part of a signature/hash preimage.
function frame(domain, fields) {
  const chunks = [];
  for (const value of [domain, ...fields]) {
    const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value, 'ascii');
    const length = Buffer.alloc(4);
    length.writeUInt32BE(bytes.length);
    chunks.push(length, bytes);
  }
  return Buffer.concat(chunks);
}
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const b = value => Buffer.from(value, 'hex');
function publicKey(raw) {
  hex(raw, 32, 'EVIDENCE_PUBLIC_KEY');
  return createPublicKey({ key: Buffer.concat([ED25519_SPKI_PREFIX, b(raw)]), type: 'spki', format: 'der' });
}
function signatureValid(key, bytes, signature) {
  hex(signature, 64, 'EVIDENCE_SIGNATURE_ENCODING');
  return verify(null, bytes, publicKey(key), b(signature));
}

function domain(value) {
  exact(value, ['chain', 'genesis', 'asset'], 'EVIDENCE_CHAIN_FIELDS');
  need(['BTC', 'SOL', 'EVM'].includes(value.chain), 'EVIDENCE_CHAIN_UNSUPPORTED');
  return { chain: value.chain, genesis: hex(value.genesis, 32, 'EVIDENCE_GENESIS'),
    asset: hex(value.asset, 32, 'EVIDENCE_ASSET') };
}
const domainBytes = value => frame('LIANUM/evidence-chain/1', [value.chain, b(value.genesis), b(value.asset)]);

function normalizeRegistry(value) {
  exact(value, ['version', 'registryId', 'epoch', 'members'], 'EVIDENCE_REGISTRY_FIELDS');
  need(value.version === 1, 'EVIDENCE_REGISTRY_VERSION');
  hex(value.registryId, 32, 'EVIDENCE_REGISTRY_ID');
  uint(value.epoch, MAX_U64, 'EVIDENCE_REGISTRY_EPOCH');
  need(Array.isArray(value.members) && value.members.length === 4, 'EVIDENCE_REGISTRY_REQUIRES_FOUR');
  const memberIds = new Set(), keys = new Set();
  const members = value.members.map(member => {
    exact(member, ['memberId', 'publicKey'], 'EVIDENCE_MEMBER_FIELDS');
    text(member.memberId, 'EVIDENCE_MEMBER_ID');
    hex(member.publicKey, 32, 'EVIDENCE_PUBLIC_KEY');
    need(!memberIds.has(member.memberId), 'EVIDENCE_DUPLICATE_MEMBER');
    need(!keys.has(member.publicKey), 'EVIDENCE_DUPLICATE_KEY');
    memberIds.add(member.memberId); keys.add(member.publicKey);
    return { memberId: member.memberId, publicKey: member.publicKey };
  }).sort((left, right) => left.memberId < right.memberId ? -1 : left.memberId > right.memberId ? 1 : 0);
  return { version: 1, registryId: value.registryId, epoch: value.epoch, members };
}
export function encodeEvidenceRegistry(input) {
  const r = normalizeRegistry(input);
  return frame('LIANUM/evidence-registry/1', ['1', b(r.registryId), r.epoch,
    ...r.members.map(member => frame('member', [member.memberId, b(member.publicKey)]))]);
}
export const evidenceRegistryCommitment = registry => hash(encodeEvidenceRegistry(registry));

function normalizePolicy(value) {
  exact(value, ['version', 'profile', 'ruleset', 'registryId', 'registryEpoch', 'registryCommitment',
    'chainDomain', 'finalityPolicy', 'settlementScope', 'validity', 'maximumEvidenceLifetimeSeconds'],
  'EVIDENCE_POLICY_FIELDS');
  need(value.version === 1, 'EVIDENCE_POLICY_VERSION');
  const normalized = {
    version: 1, profile: text(value.profile, 'EVIDENCE_PROFILE'),
    ruleset: hex(value.ruleset, 32, 'EVIDENCE_RULESET'),
    registryId: hex(value.registryId, 32, 'EVIDENCE_REGISTRY_ID'),
    registryEpoch: uint(value.registryEpoch, MAX_U64, 'EVIDENCE_REGISTRY_EPOCH'),
    registryCommitment: hex(value.registryCommitment, 32, 'EVIDENCE_REGISTRY_COMMITMENT'),
    chainDomain: domain(value.chainDomain),
    finalityPolicy: hex(value.finalityPolicy, 32, 'EVIDENCE_FINALITY_POLICY'),
    settlementScope: hex(value.settlementScope, 32, 'EVIDENCE_SETTLEMENT_SCOPE'),
    validity: interval(value.validity, 'EVIDENCE_POLICY_VALIDITY'),
    maximumEvidenceLifetimeSeconds: uint(value.maximumEvidenceLifetimeSeconds, 86400n, 'EVIDENCE_LIFETIME'),
  };
  need(BigInt(normalized.maximumEvidenceLifetimeSeconds) > 0n, 'EVIDENCE_LIFETIME');
  return normalized;
}
/** These bytes must be signed on the mobile device with its pinned root key. */
export function encodeMobileEvidencePolicy(input) {
  const p = normalizePolicy(input);
  return frame('LIANUM/mobile-evidence-policy/1', ['1', p.profile, b(p.ruleset), b(p.registryId),
    p.registryEpoch, b(p.registryCommitment), domainBytes(p.chainDomain), b(p.finalityPolicy),
    b(p.settlementScope), p.validity.validFrom, p.validity.validUntil, p.maximumEvidenceLifetimeSeconds]);
}
export const mobileEvidencePolicyCommitment = policy => hash(encodeMobileEvidencePolicy(policy));

function identity(value, chain) {
  // Ruleset position convention: BTC vout; SOL top-level instruction index;
  // EVM receipt-local log index, with 0xffffffff reserved for the transaction's
  // top-level native-value credit. SOL inner effects and EVM internal native
  // transfers are unsupported. Attesters must decode/enforce these conventions.
  exact(value, ['transactionId', 'effectIndex'], 'EVIDENCE_IDENTITY_FIELDS');
  return { transactionId: hex(value.transactionId, chain === 'SOL' ? 64 : 32, 'EVIDENCE_TRANSACTION_ID'),
    effectIndex: uint(value.effectIndex, 0xffffffffn, 'EVIDENCE_EFFECT_INDEX') };
}
/**
 * Identity is chain genesis + asset + canonical transaction/effect position.
 * IDs use lowercase displayed transaction-hash bytes (BTC/EVM) or the primary
 * 64-byte transaction signature (SOL). Attesters are responsible for native
 * decoding and the ruleset's effect-position assignment; this host does not
 * prove either, or prove that the anchor belongs to canonical chain history.
 * Operation, pool/scope, anchor, registry, policy, amount and destination do
 * not change this nullifier: re-attesting the same effect cannot refresh it.
 * ALL pools sharing backing MUST atomically consume this global identifier in
 * the same authoritative consumption ledger. Per-pool consumed sets are not
 * sufficient. Settlement scope is signed separately as the intended consumer.
 * This module has no consumption ledger and establishes no onchain uniqueness.
 */
export function canonicalGlobalEffectId(input) {
  exact(input, ['chainDomain', 'effectIdentity'], 'EVIDENCE_NULLIFIER_FIELDS');
  const d = domain(input.chainDomain), i = identity(input.effectIdentity, d.chain);
  return hash(frame('LIANUM/native-global-effect/1', [domainBytes(d), b(i.transactionId), i.effectIndex]));
}
// The signed effectNullifier is this global ID, never a pool-scoped derivative.
export const canonicalEffectNullifier = canonicalGlobalEffectId;

export function normalizeEvidenceStatement(value) {
  exact(value, ['version', 'profile', 'ruleset', 'registryId', 'registryEpoch', 'registryCommitment',
    'chainDomain', 'anchor', 'finalityPolicy', 'operationId', 'localCommitment', 'effect',
    'effectNullifier', 'settlementScope', 'issuedAt', 'validity'], 'EVIDENCE_STATEMENT_FIELDS');
  need(value.version === 1, 'EVIDENCE_STATEMENT_VERSION');
  const d = domain(value.chainDomain);
  exact(value.anchor, ['blockId', 'stateCommitment', 'height'], 'EVIDENCE_ANCHOR_FIELDS');
  const anchor = { blockId: hex(value.anchor.blockId, 32, 'EVIDENCE_ANCHOR_BLOCK'),
    stateCommitment: hex(value.anchor.stateCommitment, 32, 'EVIDENCE_ANCHOR_STATE'),
    height: uint(value.anchor.height, MAX_U64, 'EVIDENCE_ANCHOR_HEIGHT') };
  exact(value.effect, ['kind', 'identity', 'amount', 'source', 'destination', 'custodyCondition'], 'EVIDENCE_EFFECT_FIELDS');
  need(value.effect.kind === 'transfer-credit-v1', 'EVIDENCE_EFFECT_KIND');
  exact(value.effect.custodyCondition, ['kind', 'commitment'], 'EVIDENCE_CUSTODY_FIELDS');
  need(['pool-deposit-v1', 'native-transfer-v1'].includes(value.effect.custodyCondition.kind), 'EVIDENCE_CUSTODY_KIND');
  const effect = { kind: value.effect.kind, identity: identity(value.effect.identity, d.chain),
    amount: uint(value.effect.amount, MAX_U128, 'EVIDENCE_AMOUNT'),
    source: hex(value.effect.source, 32, 'EVIDENCE_SOURCE'),
    destination: hex(value.effect.destination, 32, 'EVIDENCE_DESTINATION'),
    custodyCondition: { kind: value.effect.custodyCondition.kind,
      commitment: hex(value.effect.custodyCondition.commitment, 32, 'EVIDENCE_CUSTODY_COMMITMENT') } };
  need(BigInt(effect.amount) > 0n, 'EVIDENCE_AMOUNT');
  const result = { version: 1, profile: text(value.profile, 'EVIDENCE_PROFILE'),
    ruleset: hex(value.ruleset, 32, 'EVIDENCE_RULESET'),
    registryId: hex(value.registryId, 32, 'EVIDENCE_REGISTRY_ID'),
    registryEpoch: uint(value.registryEpoch, MAX_U64, 'EVIDENCE_REGISTRY_EPOCH'),
    registryCommitment: hex(value.registryCommitment, 32, 'EVIDENCE_REGISTRY_COMMITMENT'),
    chainDomain: d, anchor, finalityPolicy: hex(value.finalityPolicy, 32, 'EVIDENCE_FINALITY_POLICY'),
    operationId: hex(value.operationId, 32, 'EVIDENCE_OPERATION'),
    localCommitment: hex(value.localCommitment, 32, 'EVIDENCE_LOCAL_COMMITMENT'), effect,
    effectNullifier: hex(value.effectNullifier, 32, 'EVIDENCE_NULLIFIER'),
    settlementScope: hex(value.settlementScope, 32, 'EVIDENCE_SETTLEMENT_SCOPE'),
    issuedAt: uint(value.issuedAt, MAX_U64, 'EVIDENCE_ISSUED_AT'),
    validity: interval(value.validity, 'EVIDENCE_VALIDITY') };
  need(BigInt(result.issuedAt) >= BigInt(result.validity.validFrom)
    && BigInt(result.issuedAt) < BigInt(result.validity.validUntil), 'EVIDENCE_ISSUED_OUTSIDE_VALIDITY');
  need(result.effectNullifier === canonicalGlobalEffectId({ chainDomain: d,
    effectIdentity: effect.identity }), 'EVIDENCE_WRONG_NULLIFIER');
  return freeze(result);
}
export function encodeEvidenceStatement(input) {
  const s = normalizeEvidenceStatement(input), e = s.effect;
  const bytes = frame('LIANUM/native-evidence-statement/1', ['1', s.profile, b(s.ruleset),
    b(s.registryId), s.registryEpoch, b(s.registryCommitment), domainBytes(s.chainDomain),
    b(s.anchor.blockId), b(s.anchor.stateCommitment), s.anchor.height, b(s.finalityPolicy),
    b(s.operationId), b(s.localCommitment), e.kind, b(e.identity.transactionId), e.identity.effectIndex,
    e.amount, b(e.source), b(e.destination), e.custodyCondition.kind, b(e.custodyCondition.commitment),
    b(s.effectNullifier), b(s.settlementScope), s.issuedAt, s.validity.validFrom, s.validity.validUntil]);
  need(bytes.length <= EVIDENCE_LIMITS.maximumStatementBytes, 'EVIDENCE_STATEMENT_SIZE');
  return bytes;
}
export const evidenceStatementCommitment = statement => hash(encodeEvidenceStatement(statement));

/**
 * No key, threshold, verified flag, profile override or fallback is accepted at
 * verification time. Use a NEW mobile-authorized boundary for a registry epoch
 * change; select the current epoch through trusted wallet configuration.
 * Revocation/rollback protection and trusted time are deployment obligations.
 */
export function createNativeEvidenceBoundary(configuration) {
  exact(configuration, ['mobileRootPublicKey', 'policyAuthorization', 'registry'], 'EVIDENCE_CONFIGURATION_FIELDS');
  const { mobileRootPublicKey, policyAuthorization, registry } = configuration;
  publicKey(mobileRootPublicKey);
  exact(policyAuthorization, ['policy', 'signature'], 'EVIDENCE_MOBILE_AUTHORIZATION_FIELDS');
  const policy = freeze(normalizePolicy(policyAuthorization.policy));
  need(signatureValid(mobileRootPublicKey, encodeMobileEvidencePolicy(policy), policyAuthorization.signature),
    'EVIDENCE_MOBILE_AUTHORIZATION_INVALID');
  // Unsupported consensus/legacy profiles MUST fail closed even with signatures.
  need(policy.profile === FEDERATED_PROFILE, 'EVIDENCE_PROFILE_UNSUPPORTED');
  need(policy.ruleset === FEDERATED_RULESET, 'EVIDENCE_RULESET_UNSUPPORTED');
  const approvedRegistry = freeze(normalizeRegistry(registry));
  need(policy.registryId === approvedRegistry.registryId
    && policy.registryEpoch === approvedRegistry.epoch
    && policy.registryCommitment === evidenceRegistryCommitment(approvedRegistry), 'EVIDENCE_REGISTRY_NOT_PINNED');
  const policyCommitment = mobileEvidencePolicyCommitment(policy);
  const receipts = new WeakMap();

  return Object.freeze({
    /** Expected statement comes from independently authorized operation intent. */
    assertEvidenceFor(input) {
      exact(input, ['evidence', 'expectedStatement'], 'EVIDENCE_REQUEST_FIELDS');
      const { evidence } = input;
      exact(evidence, ['statement', 'signatures'], 'EVIDENCE_ENVELOPE_FIELDS');
      const statement = normalizeEvidenceStatement(evidence.statement);
      const message = encodeEvidenceStatement(statement);
      need(message.equals(encodeEvidenceStatement(input.expectedStatement)), 'EVIDENCE_EXPECTATION_MISMATCH');
      for (const field of ['profile', 'ruleset', 'registryId', 'registryEpoch', 'registryCommitment',
        'finalityPolicy', 'settlementScope']) {
        need(statement[field] === policy[field], 'EVIDENCE_PIN_MISMATCH:' + field);
      }
      need(domainBytes(statement.chainDomain).equals(domainBytes(policy.chainDomain)), 'EVIDENCE_CHAIN_NOT_PINNED');
      const now = BigInt(Math.floor(Date.now() / 1000));
      need(now >= BigInt(policy.validity.validFrom) && now < BigInt(policy.validity.validUntil), 'EVIDENCE_POLICY_NOT_CURRENT');
      need(now >= BigInt(statement.validity.validFrom) && now < BigInt(statement.validity.validUntil)
        && BigInt(statement.issuedAt) <= now, 'EVIDENCE_NOT_CURRENT');
      need(BigInt(statement.validity.validFrom) >= BigInt(policy.validity.validFrom)
        && BigInt(statement.validity.validUntil) <= BigInt(policy.validity.validUntil), 'EVIDENCE_VALIDITY_OUTSIDE_POLICY');
      need(BigInt(statement.validity.validUntil) - BigInt(statement.validity.validFrom)
        <= BigInt(policy.maximumEvidenceLifetimeSeconds), 'EVIDENCE_LIFETIME_EXCEEDED');
      need(Array.isArray(evidence.signatures) && evidence.signatures.length >= 3
        && evidence.signatures.length <= 4, 'EVIDENCE_QUORUM_REQUIRES_THREE_OF_FOUR');
      const seen = new Set();
      let signerBitmap = 0;
      for (const entry of evidence.signatures) {
        exact(entry, ['memberId', 'signature'], 'EVIDENCE_SIGNATURE_FIELDS');
        text(entry.memberId, 'EVIDENCE_MEMBER_ID');
        need(!seen.has(entry.memberId), 'EVIDENCE_DUPLICATE_SIGNER');
        seen.add(entry.memberId);
        const index = approvedRegistry.members.findIndex(member => member.memberId === entry.memberId);
        need(index >= 0, 'EVIDENCE_SIGNER_NOT_APPROVED');
        need(signatureValid(approvedRegistry.members[index].publicKey, message, entry.signature), 'EVIDENCE_SIGNATURE_INVALID');
        signerBitmap |= 1 << index;
      }
      const receipt = freeze({ kind: 'federated-attestation', statementCommitment: hash(message),
        assurance: { nativeConsensus: 'unsupported', anchorAuthentication: 'federated-signatures-only',
          administrativeIndependence: 'external-deployment-assumption', custody: 'not-verified',
          privacy: 'not-established', operationAuthorization: 'separate-check-required',
          consumption: 'shared-authoritative-global-ledger-required',
          enforcement: 'host-only' } });
      receipts.set(receipt, freeze({ version: 1, profile: FEDERATED_PROFILE, policyCommitment,
        registryCommitment: policy.registryCommitment, registryEpoch: policy.registryEpoch,
        ruleset: policy.ruleset, statementCommitment: receipt.statementCommitment, operationId: statement.operationId,
        localCommitment: statement.localCommitment, anchor: statement.anchor,
        globalEffectId: statement.effectNullifier, settlementScope: statement.settlementScope,
        validity: statement.validity, signerBitmap }));
      return receipt;
    },
    /**
     * A narrow candidate public-input interface for future enforcement work.
     * It accepts only this instance's cryptographically checked receipt. These
     * values require a real signature/statement circuit or contract predicate
     * (Ed25519 has no current Noir/EVM predicate here), plus atomic globalEffectId
     * consumption in one authoritative ledger shared by all backing-sharing
     * pools. Serializing a receipt does not preserve its host authenticity.
     */
    enforcementInputsFor(receipt) {
      need(receipts.has(receipt), 'EVIDENCE_RECEIPT_NOT_ISSUED_HERE');
      const inputs = receipts.get(receipt), now = BigInt(Math.floor(Date.now() / 1000));
      need(now >= BigInt(inputs.validity.validFrom) && now < BigInt(inputs.validity.validUntil)
        && now >= BigInt(policy.validity.validFrom) && now < BigInt(policy.validity.validUntil),
      'EVIDENCE_RECEIPT_NOT_CURRENT');
      return inputs;
    },
  });
}
