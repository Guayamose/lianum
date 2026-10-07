import { createHash, createHmac, createPublicKey, generateKeyPairSync, randomBytes, sign, verify } from 'node:crypto';
import { base58Decode, base58Encode, decodeSolanaTransfer } from './chains/solana-runtime.mjs';
import { observeBitcoinDelivery, satsFromBTC } from './native-bitcoin.mjs';

// Host-only trusted-observer bridge. No consensus, funding or ZK claim follows
// from a signature here. Test runtimes are synthetic, even when cryptography is real.
export const PRIVATE_NATIVE_PROFILE = 'TRUSTED_ISSUER_UNIQUENESS_V1';
export const SECP256K1_ORDER = BigInt('0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141');
const ZERO32 = '00'.repeat(32);
const need = (condition, code) => { if (!condition) throw new Error(code); };
const sha = value => createHash('sha256').update(value).digest();
const exact = (object, fields, code = 'PC15_UNEXPECTED_FIELDS') => {
  need(object !== null && typeof object === 'object' && !Array.isArray(object), code);
  need(Object.keys(object).length === fields.length && fields.every(k => Object.hasOwn(object, k)), code);
};
const bytes32 = value => { need(typeof value === 'string' && /^[0-9a-f]{64}$/.test(value), 'PC15_NONCANONICAL_BYTES32'); return Buffer.from(value, 'hex'); };
const uint = (value, width) => {
  need((typeof value === 'string' && /^(0|[1-9][0-9]*)$/.test(value)) || (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0), 'PC15_NONCANONICAL_UINT');
  const n = BigInt(value); need(n < (1n << BigInt(width * 8)), 'PC15_UINT_OVERFLOW');
  return Buffer.from(n.toString(16).padStart(width * 2, '0'), 'hex');
};
const number = bytes => { const n = BigInt('0x' + bytes.toString('hex')); need(n <= BigInt(Number.MAX_SAFE_INTEGER), 'PC15_UNSAFE_NUMBER'); return Number(n); };
const decimal = bytes => BigInt('0x' + bytes.toString('hex')).toString();
const same = (a, b, code) => need(a === b, code);
const hashHex = value => sha(value).toString('hex');
function immutable(value) { for (const child of Object.values(value)) if (child && typeof child === 'object') immutable(child); return Object.freeze(value); }

/** ENC(tag, fields), without type coercion, omitted fields, or trailing bytes. */
export function encodePC15Frame(tag, fields) {
  need(typeof tag === 'string' && /^[\x20-\x7e]+$/.test(tag) && tag.length <= 65535, 'PC15_INVALID_TAG');
  need(Array.isArray(fields), 'PC15_INVALID_FIELDS');
  const tagBytes = Buffer.from(tag, 'ascii'), head = Buffer.alloc(2); head.writeUInt16BE(tagBytes.length);
  const parts = [head, tagBytes];
  for (const value of fields) {
    need(Buffer.isBuffer(value) || value instanceof Uint8Array, 'PC15_FIELD_REQUIRES_BYTES');
    const field = Buffer.from(value); need(field.length <= 0xffffffff, 'PC15_FIELD_TOO_LONG');
    const size = Buffer.alloc(4); size.writeUInt32BE(field.length); parts.push(size, field);
  }
  return Buffer.concat(parts);
}

/** Decoder is deliberately independent of the encoder's length construction. */
export function decodePC15Frame(input, expectedTag, widths) {
  need(Buffer.isBuffer(input) || input instanceof Uint8Array, 'PC15_FRAME_REQUIRES_BYTES');
  const data = Buffer.from(input); need(data.length >= 2, 'PC15_TRUNCATED_FRAME');
  const length = data.readUInt16BE(0); need(data.length >= 2 + length, 'PC15_TRUNCATED_FRAME');
  const tag = data.subarray(2, 2 + length);
  need(tag.equals(Buffer.from(expectedTag, 'ascii')), 'PC15_WRONG_FRAME_DOMAIN');
  let offset = 2 + length; const fields = [];
  for (const width of widths) {
    need(offset + 4 <= data.length, 'PC15_TRUNCATED_FIELD'); const count = data.readUInt32BE(offset); offset += 4;
    need(width === null || count === width, 'PC15_WRONG_FIELD_WIDTH');
    need(offset + count <= data.length, 'PC15_TRUNCATED_FIELD'); fields.push(data.subarray(offset, offset + count)); offset += count;
  }
  need(offset === data.length, 'PC15_TRAILING_FIELDS'); return fields;
}

export function encodeChainDomain(domain) {
  exact(domain, ['chain', 'genesis']); need(['SOL', 'BTC'].includes(domain.chain), 'PC15_UNSUPPORTED_CHAIN');
  return encodePC15Frame('PC15/chain-domain/1', [Buffer.from([domain.chain === 'SOL' ? 1 : 2]), bytes32(domain.genesis)]);
}
function decodeChainDomain(bytes) {
  const [chain, genesis] = decodePC15Frame(bytes, 'PC15/chain-domain/1', [1, 32]);
  need(chain[0] === 1 || chain[0] === 2, 'PC15_UNSUPPORTED_CHAIN');
  return { chain: chain[0] === 1 ? 'SOL' : 'BTC', genesis: genesis.toString('hex') };
}
export function encodeCanonicalEffect(chain, effect) {
  if (chain === 'SOL') {
    exact(effect, ['signature', 'instructionIndex']); same(effect.instructionIndex, 0, 'PC15_UNSUPPORTED_SOLANA_INSTRUCTION');
    return encodePC15Frame('PC15/solana-effect/1', [base58Decode(effect.signature, 64), uint(effect.instructionIndex, 4)]);
  }
  same(chain, 'BTC', 'PC15_UNSUPPORTED_CHAIN'); exact(effect, ['txid', 'vout']);
  need(Number.isSafeInteger(effect.vout) && !Object.is(effect.vout, -0), 'PC15_NONCANONICAL_VOUT');
  return encodePC15Frame('PC15/bitcoin-effect/1', [bytes32(effect.txid), uint(effect.vout, 4)]);
}
function decodeCanonicalEffect(chain, bytes) {
  if (chain === 'SOL') {
    const [signature, index] = decodePC15Frame(bytes, 'PC15/solana-effect/1', [64, 4]);
    return { signature: base58Encode(signature), instructionIndex: number(index) };
  }
  const [txid, vout] = decodePC15Frame(bytes, 'PC15/bitcoin-effect/1', [32, 4]);
  return { txid: txid.toString('hex'), vout: number(vout) };
}
export function encodeOpaqueEffectTagInput(identityNamespace, domain, effect) {
  return encodePC15Frame('PC15/canonical-effect-tag/1', [bytes32(identityNamespace), encodeChainDomain(domain), encodeCanonicalEffect(domain.chain, effect)]);
}
export function effectConsumptionHash(poolScope, domain, opaqueTag) {
  return sha(encodePC15Frame('PC15/effect-consumption/1', [bytes32(poolScope), encodeChainDomain(domain), bytes32(opaqueTag)]));
}

export const NATIVE_CERTIFICATE_FIELDS = Object.freeze(['version', 'profile', 'policyId', 'identityNamespace', 'chainDomain', 'canonicalEffect', 'localInstructionCommitment', 'source', 'recipientOrScriptHash', 'amount', 'success', 'finalityKind', 'finalityMeasure', 'observedBlockIdentity', 'observedBlockNumber', 'observedTipIdentity', 'observedTipNumber', 'observedAt', 'validFromEpoch', 'validUntilEpoch', 'opaqueTag']);
const CERT_WIDTHS = [2, PRIVATE_NATIVE_PROFILE.length, 32, 32, null, null, 32, 32, 32, 8, 1, 1, 8, 32, 8, 32, 8, 8, 8, 8, 32];
export function encodeNativeCertificate(c) {
  exact(c, NATIVE_CERTIFICATE_FIELDS); same(c.version, 1, 'PC15_WRONG_VERSION'); same(c.profile, PRIVATE_NATIVE_PROFILE, 'PC15_WRONG_PROFILE');
  const sol = c.chainDomain?.chain === 'SOL';
  same(c.success, true, 'PC15_UNSUCCESSFUL_CERTIFICATE'); same(c.finalityKind, sol ? 'SOL_FINALIZED' : 'BTC_CONFIRMATIONS', 'PC15_WRONG_FINALITY_KIND');
  const amount = uint(c.amount, 8), measure = uint(c.finalityMeasure, 8), block = uint(c.observedBlockNumber, 8), tip = uint(c.observedTipNumber, 8);
  need(BigInt(c.amount) > 0n && BigInt(c.finalityMeasure) > 0n, 'PC15_ZERO_AMOUNT_OR_FINALITY');
  need(BigInt(c.observedTipNumber) >= BigInt(c.observedBlockNumber), 'PC15_INCOHERENT_BLOCK_CONTEXT');
  if (sol) { same(c.finalityMeasure, '1', 'PC15_SOLANA_FINALIZED_MEASURE'); same(c.observedTipIdentity, ZERO32, 'PC15_SOLANA_UNUSED_TIP_HASH'); }
  else { same(c.source, ZERO32, 'PC15_BITCOIN_UNUSED_SOURCE'); need(BigInt(c.observedTipNumber) - BigInt(c.observedBlockNumber) + 1n === BigInt(c.finalityMeasure), 'PC15_INCOHERENT_BITCOIN_DEPTH'); }
  need(BigInt(decimal(uint(c.validFromEpoch, 8))) < BigInt(decimal(uint(c.validUntilEpoch, 8))), 'PC15_EMPTY_VALIDITY_INTERVAL');
  return encodePC15Frame('PC15/native-certificate/1', [uint(c.version, 2), Buffer.from(c.profile, 'ascii'), bytes32(c.policyId), bytes32(c.identityNamespace), encodeChainDomain(c.chainDomain), encodeCanonicalEffect(c.chainDomain.chain, c.canonicalEffect), bytes32(c.localInstructionCommitment), bytes32(c.source), bytes32(c.recipientOrScriptHash), amount, Buffer.from([1]), Buffer.from([sol ? 1 : 2]), measure, bytes32(c.observedBlockIdentity), block, bytes32(c.observedTipIdentity), tip, uint(c.observedAt, 8), uint(c.validFromEpoch, 8), uint(c.validUntilEpoch, 8), bytes32(c.opaqueTag)]);
}
export function decodeNativeCertificate(frame) {
  const f = decodePC15Frame(frame, 'PC15/native-certificate/1', CERT_WIDTHS), domain = decodeChainDomain(f[4]);
  need(f[10][0] === 1, 'PC15_UNSUCCESSFUL_CERTIFICATE'); need([1, 2].includes(f[11][0]), 'PC15_WRONG_FINALITY_KIND');
  const c = { version: number(f[0]), profile: f[1].toString('ascii'), policyId: f[2].toString('hex'), identityNamespace: f[3].toString('hex'), chainDomain: domain, canonicalEffect: decodeCanonicalEffect(domain.chain, f[5]), localInstructionCommitment: f[6].toString('hex'), source: f[7].toString('hex'), recipientOrScriptHash: f[8].toString('hex'), amount: decimal(f[9]), success: true, finalityKind: f[11][0] === 1 ? 'SOL_FINALIZED' : 'BTC_CONFIRMATIONS', finalityMeasure: decimal(f[12]), observedBlockIdentity: f[13].toString('hex'), observedBlockNumber: decimal(f[14]), observedTipIdentity: f[15].toString('hex'), observedTipNumber: decimal(f[16]), observedAt: decimal(f[17]), validFromEpoch: decimal(f[18]), validUntilEpoch: decimal(f[19]), opaqueTag: f[20].toString('hex') };
  need(encodeNativeCertificate(c).equals(Buffer.from(frame)), 'PC15_NONCANONICAL_CERTIFICATE'); return immutable(c);
}
export const certificateMessageHash = certificate => sha(encodeNativeCertificate(certificate));

function normalizeSignature(signature) {
  need(signature.length === 64, 'PC15_SIGNATURE_WIDTH');
  const r = BigInt('0x' + signature.subarray(0, 32).toString('hex')), s = BigInt('0x' + signature.subarray(32).toString('hex'));
  need(r > 0n && r < SECP256K1_ORDER && s > 0n && s < SECP256K1_ORDER, 'PC15_SIGNATURE_SCALAR_RANGE');
  return Buffer.concat([signature.subarray(0, 32), Buffer.from((s > SECP256K1_ORDER / 2n ? SECP256K1_ORDER - s : s).toString(16).padStart(64, '0'), 'hex')]);
}
function coordinates(key) {
  const jwk = key.export({ format: 'jwk' }); return immutable({ x: Buffer.from(jwk.x, 'base64url').toString('hex'), y: Buffer.from(jwk.y, 'base64url').toString('hex') });
}
function publicKey(key) {
  exact(key, ['x', 'y']); return createPublicKey({ key: { kty: 'EC', crv: 'secp256k1', x: bytes32(key.x).toString('base64url'), y: bytes32(key.y).toString('base64url') }, format: 'jwk' });
}
export function nativeIssuerPolicyId({ policyFamilyId, identityNamespace, chainDomain, issuerPublicKey, identityKeyCommitment, epochSeconds, minimumConfirmations }) {
  return hashHex(encodePC15Frame('PC15/native-issuer-policy/1', [bytes32(policyFamilyId), bytes32(identityNamespace), encodeChainDomain(chainDomain), bytes32(issuerPublicKey.x), bytes32(issuerPublicKey.y), bytes32(identityKeyCommitment), uint(epochSeconds, 8), uint(minimumConfirmations, 4)]));
}
function validatePolicy(policy) {
  exact(policy, ['policyId', 'policyFamilyId', 'identityNamespace', 'chainDomain', 'issuerPublicKey', 'identityKeyCommitment', 'epochSeconds', 'minimumConfirmations']);
  bytes32(policy.policyId); bytes32(policy.identityNamespace); encodeChainDomain(policy.chainDomain); publicKey(policy.issuerPublicKey);
  need(Number.isSafeInteger(policy.epochSeconds) && policy.epochSeconds > 0, 'PC15_INVALID_EPOCH_DURATION');
  need(Number.isSafeInteger(policy.minimumConfirmations) && policy.minimumConfirmations > 0 && policy.minimumConfirmations <= 0xffffffff, 'PC15_INVALID_CONFIRMATION_POLICY');
  if (policy.chainDomain.chain === 'SOL') same(policy.minimumConfirmations, 1, 'PC15_SOLANA_FINALITY_POLICY');
  same(policy.policyId, nativeIssuerPolicyId(policy), 'PC15_ISSUER_POLICY_FINGERPRINT_MISMATCH');
}
function policyChecks(c, policy, epoch) {
  validatePolicy(policy); same(c.policyId, policy.policyId, 'PC15_WRONG_POLICY'); same(c.identityNamespace, policy.identityNamespace, 'PC15_WRONG_IDENTITY_NAMESPACE');
  need(encodeChainDomain(c.chainDomain).equals(encodeChainDomain(policy.chainDomain)), 'PC15_WRONG_CHAIN_DOMAIN');
  const start = BigInt(c.validFromEpoch), end = BigInt(c.validUntilEpoch), at = BigInt(c.observedAt), size = BigInt(policy.epochSeconds);
  need(at >= start * size && at < end * size, 'PC15_OBSERVATION_OUTSIDE_INTERVAL');
  need(epoch >= start && epoch < end && at <= (epoch + 1n) * size - 1n, 'PC15_CERTIFICATE_NOT_CURRENT');
  need(BigInt(c.finalityMeasure) >= BigInt(policy.minimumConfirmations), 'PC15_INSUFFICIENT_FINALITY');
}
/** Cryptographic authenticity under an externally pinned issuer, not truth. */
export function verifyNativeCertificate(envelope, policy, { settlementEpoch } = {}) {
  try {
    exact(envelope, ['certificate', 'signature', 'issuerPublicKey']);
    const message = encodeNativeCertificate(envelope.certificate); policyChecks(envelope.certificate, policy, BigInt(decimal(uint(settlementEpoch, 8))));
    need(typeof envelope.signature === 'string' && /^[0-9a-f]{128}$/.test(envelope.signature), 'PC15_SIGNATURE_WIDTH');
    const signature = Buffer.from(envelope.signature, 'hex'); need(normalizeSignature(signature).equals(signature), 'PC15_HIGH_S');
    exact(envelope.issuerPublicKey, ['x', 'y']); same(envelope.issuerPublicKey.x, policy.issuerPublicKey.x, 'PC15_UNAPPROVED_ISSUER'); same(envelope.issuerPublicKey.y, policy.issuerPublicKey.y, 'PC15_UNAPPROVED_ISSUER');
    return verify('sha256', message, { key: publicKey(policy.issuerPublicKey), dsaEncoding: 'ieee-p1363' }, signature);
  } catch { return false; }
}

const allocatedLifetimes = new Set(), allocatedNamespaces = new Set();
const REQUEST_FIELDS = ['localInstructionCommitment', 'invocationNonce', 'source', 'recipient', 'amount', 'executeAfter', 'executeBefore', 'validFromEpoch', 'validUntilEpoch'];
function validateRequest(request, chain, policy, now) {
  exact(request, REQUEST_FIELDS); bytes32(request.localInstructionCommitment); bytes32(request.invocationNonce);
  uint(request.amount, 8); need(BigInt(request.amount) > 0n, 'PC15_ZERO_AMOUNT');
  if (chain === 'SOL') { base58Decode(request.source, 32); base58Decode(request.recipient, 32); }
  else { same(request.source, ZERO32, 'PC15_BITCOIN_UNUSED_SOURCE'); need(typeof request.recipient === 'string' && request.recipient.length > 0 && request.recipient.length <= 128, 'PC15_INVALID_BITCOIN_ADDRESS'); }
  const after = BigInt(decimal(uint(request.executeAfter, 8))), before = BigInt(decimal(uint(request.executeBefore, 8)));
  need(after <= now && now < before, 'PC15_DISPATCH_OUTSIDE_EXECUTION_WINDOW');
  const start = BigInt(decimal(uint(request.validFromEpoch, 8))), end = BigInt(decimal(uint(request.validUntilEpoch, 8))), size = BigInt(policy.epochSeconds);
  need(start < end && after >= start * size && before <= end * size, 'PC15_INVALID_REQUEST_INTERVAL');
}

/**
 * Explicit NEW disposable pool lifetime only. Private KeyObjects and HMAC
 * buffers never leave this closure. There is no reset, rekey or key export.
 * This does not implement a restart-safe production issuer/key vault.
 */
export function createDisposableNativeIssuerLifetime({ lifetimeId, identityNamespace, mode }) {
  bytes32(lifetimeId); bytes32(identityNamespace); same(mode, 'DISPOSABLE_LOCAL_ONLY_NO_RESTART', 'PC15_EXPLICIT_DISPOSABLE_LIFETIME_REQUIRED');
  need(!allocatedLifetimes.has(lifetimeId) && !allocatedNamespaces.has(identityNamespace), 'PC15_LIFETIME_OR_NAMESPACE_ALREADY_ALLOCATED');
  allocatedLifetimes.add(lifetimeId); allocatedNamespaces.add(identityNamespace);
  const issuers = new Map(['SOL', 'BTC'].map(chain => { const pair = generateKeyPairSync('ec', { namedCurve: 'secp256k1' }); return [chain, { privateKey: pair.privateKey, publicKey: pair.publicKey, coordinates: coordinates(pair.publicKey), hmacKey: randomBytes(32), invocations: new Set(), effects: new Map() }]; }));
  let closed = false;
  const live = () => need(!closed, 'PC15_ISSUER_LIFETIME_CLOSED');

  function bind({ chain, genesis, policyFamilyId, epochSeconds, minimumConfirmations, runtime, authorizeLocalInvocation, retainSignedDispatch, archiveCertificate, nowSeconds = () => Math.floor(Date.now() / 1000), maximumBitcoinFeeSatoshi = '10000', maximumSolanaFeeLamports = '10000' }) {
    live(); const issuer = issuers.get(chain); need(issuer, 'PC15_UNSUPPORTED_CHAIN');
    const domain = immutable({ chain, genesis }), identityKeyCommitment = hashHex(encodePC15Frame('PC15/identity-key-commitment/1', [bytes32(identityNamespace), Buffer.from(chain, 'ascii'), issuer.hmacKey]));
    const policyFields = { policyFamilyId, identityNamespace, chainDomain: domain, issuerPublicKey: issuer.coordinates, identityKeyCommitment, epochSeconds, minimumConfirmations };
    const policyId = nativeIssuerPolicyId(policyFields), policy = immutable({ policyId, ...policyFields }); validatePolicy(policy);
    for (const callback of [authorizeLocalInvocation, retainSignedDispatch, archiveCertificate, nowSeconds]) need(typeof callback === 'function', 'PC15_REQUIRED_BOUND_CALLBACK');
    const clock = () => { live(); return BigInt(decimal(uint(nowSeconds(), 8))); };
    uint(maximumBitcoinFeeSatoshi, 8); uint(maximumSolanaFeeLamports, 8);
    // Capture adapter methods once. The runtime/callback provider is inside the
    // trusted computing boundary; requests cannot replace it after binding.
    const transfer = chain === 'SOL' && runtime?.transfer?.bind(runtime), observe = chain === 'SOL' && runtime?.observe?.bind(runtime), balance = chain === 'SOL' && runtime?.balance?.bind(runtime), btc = chain === 'BTC' && runtime?.btc?.bind(runtime);
    need(chain === 'SOL' ? transfer && observe && balance : btc, 'PC15_REQUIRED_NATIVE_ADAPTER');
    const solanaRuntime = chain === 'SOL' ? Object.freeze({ genesis: runtime.genesis, solver: runtime.solver, recipient: runtime.recipient }) : null;
    if (chain === 'SOL') same(base58Decode(solanaRuntime.genesis, 32).toString('hex'), genesis, 'PC15_WRONG_RUNTIME_GENESIS');
    const handles = new WeakMap();
    function recordFor(handle) { live(); const record = handles.get(handle); need(record, 'PC15_UNKNOWN_DISPATCH_CAPABILITY'); return record; }
    async function dispatch(localRequest) {
      live(); const request = immutable(structuredClone(localRequest)); validateRequest(request, chain, policy, clock());
      const nonce = genesis + ':' + request.invocationNonce; need(!issuer.invocations.has(nonce), 'PC15_INVOCATION_ALREADY_USED');
      // Consume before the first await: concurrent calls cannot both authorize.
      issuer.invocations.add(nonce); same(await authorizeLocalInvocation(request, policy), undefined, 'PC15_AUTHORIZATION_CALLBACK_MUST_ASSERT'); validateRequest(request, chain, policy, clock());
      const handle = Object.freeze({}), record = { request, phase: 'AUTHORIZED', signed: null, operation: null, observedCertificate: null }; handles.set(handle, record);
      const retain = async (signed, effect) => {
        live(); validateRequest(request, chain, policy, clock());
        const effectKey = encodeOpaqueEffectTagInput(identityNamespace, domain, effect).toString('hex');
        need(!issuer.effects.has(effectKey), 'PC15_EFFECT_ALREADY_BOUND_TO_DISPATCH');
        issuer.effects.set(effectKey, { commitment: request.localInstructionCommitment });
        record.effect = effect; record.signed = immutable(structuredClone(signed)); record.phase = 'SIGNED_NOT_BROADCAST';
        await retainSignedDispatch(request, record.signed, policy); validateRequest(request, chain, policy, clock()); record.phase = 'BROADCAST_POSSIBLE';
      };
      try {
        if (chain === 'SOL') {
          same(request.source, solanaRuntime.solver, 'PC15_OWNED_SOLANA_SOURCE_REQUIRED'); same(request.recipient, solanaRuntime.recipient, 'PC15_OWNED_SOLANA_RECIPIENT_REQUIRED');
          const inventory = BigInt(decimal(uint(await balance(request.source), 8))); uint(await balance(request.recipient), 8);
          need(inventory >= BigInt(request.amount) + BigInt(maximumSolanaFeeLamports), 'PC15_INSUFFICIENT_SOLANA_INVENTORY');
          let captured = false;
          const result = await transfer(request.amount, { onSigned: async signed => {
            need(!captured, 'PC15_DUPLICATE_SIGNED_CALLBACK'); captured = true;
            const decoded = decodeSolanaTransfer(signed.transactionBase64);
            for (const k of ['signature', 'solver', 'recipient', 'lamports', 'transactionSHA256']) same(signed[k], decoded[k], 'PC15_SIGNED_SOLANA_MISMATCH');
            same(decoded.solver, request.source, 'PC15_WRONG_SOLANA_SOURCE'); same(decoded.recipient, request.recipient, 'PC15_WRONG_SOLANA_RECIPIENT'); same(decoded.lamports, request.amount, 'PC15_WRONG_SOLANA_AMOUNT');
            same(signed.genesis, solanaRuntime.genesis, 'PC15_WRONG_SIGNED_GENESIS');
            // Retain an allowlisted public wire record, not arbitrary adapter
            // properties (which could accidentally include key material).
            await retain({ ...decoded, transactionBase64: signed.transactionBase64, genesis: solanaRuntime.genesis }, { signature: decoded.signature, instructionIndex: 0 });
          } });
          need(captured, 'PC15_SIGNED_CALLBACK_MISSING'); same(result.signature, record.effect.signature, 'PC15_BROADCAST_IDENTITY_MISMATCH');
        } else {
          same((await btc('getblockchaininfo')).chain, 'regtest', 'PC15_LOCAL_BITCOIN_REQUIRED'); same(await btc('getblockhash', [0]), genesis, 'PC15_WRONG_RUNTIME_GENESIS');
          const network = await btc('getnetworkinfo'); need(network.connections === 0 && network.networkactive === false, 'PC15_BITCOIN_NETWORK_ACTIVE');
          need(satsFromBTC(await btc('getbalance', ['*', 1], 'm9-solver')) >= BigInt(request.amount) + BigInt(maximumBitcoinFeeSatoshi), 'PC15_INSUFFICIENT_BITCOIN_INVENTORY');
          const address = await btc('getaddressinfo', [request.recipient], 'm9-recipient'); need(address.ismine === true && /^0014[0-9a-f]{40}$/.test(address.scriptPubKey), 'PC15_OWNED_P2WPKH_REQUIRED');
          const sats = BigInt(request.amount), amount = `${sats / 100000000n}.${(sats % 100000000n).toString().padStart(8, '0')}`;
          const raw = await btc('createrawtransaction', [[], { [request.recipient]: amount }, 0, false]);
          const funded = await btc('fundrawtransaction', [raw, { fee_rate: 1, lockUnspents: true }], 'm9-solver');
          need(satsFromBTC(funded.fee) <= BigInt(maximumBitcoinFeeSatoshi), 'PC15_BITCOIN_FEE_LIMIT');
          const signed = await btc('signrawtransactionwithwallet', [funded.hex], 'm9-solver'); same(signed.complete, true, 'PC15_BITCOIN_SIGNING_INCOMPLETE');
          need(typeof signed.hex === 'string' && /^(?:[0-9a-f]{2})+$/.test(signed.hex), 'PC15_NONCANONICAL_BITCOIN_WIRE');
          const decoded = await btc('decoderawtransaction', [signed.hex]); bytes32(decoded.txid);
          const matches = decoded.vout.filter(v => v.scriptPubKey.hex === address.scriptPubKey && satsFromBTC(v.value).toString() === request.amount);
          need(matches.length === 1, 'PC15_BITCOIN_UNIQUE_OUTPUT_REQUIRED'); const effect = { txid: decoded.txid, vout: matches[0].n }; encodeCanonicalEffect('BTC', effect);
          record.operation = { order: { bitcoinGenesis: genesis, recipientScript: address.scriptPubKey, sats: request.amount, minimumConfirmations }, recipientAddress: request.recipient, bitcoin: effect };
          await retain({ txid: decoded.txid, vout: effect.vout, rawTransaction: signed.hex }, effect);
          same(await btc('sendrawtransaction', [signed.hex]), decoded.txid, 'PC15_BROADCAST_IDENTITY_MISMATCH');
        }
        record.phase = 'SUBMITTED'; return Object.freeze({ handle, nativeReceipt: structuredClone(record.signed) });
      } catch (error) {
        // Preserve the same capability after ambiguous broadcast. Recovery may
        // observe it, but never creates/rebroadcasts a replacement transaction.
        error.dispatchHandle = handle; error.nativeReceipt = structuredClone(record.signed); throw error;
      }
    }
    async function observeAndCertify(handle) {
      const record = recordFor(handle); need(record.signed && ['BROADCAST_POSSIBLE', 'SUBMITTED', 'CERTIFIED'].includes(record.phase), 'PC15_NO_BROADCAST_CAPABILITY');
      const r = record.request; let fields;
      if (chain === 'SOL') {
        const fact = await observe(record.effect.signature, { expectedLamports: r.amount, commitment: 'finalized' });
        for (const k of ['signature', 'solver', 'recipient', 'lamports', 'transactionSHA256']) same(fact[k], record.signed[k], 'PC15_OBSERVED_SOLANA_MISMATCH');
        need(fact.success === true && fact.finalized === true && fact.confirmationStatus === 'finalized' && fact.instructionIndex === 0, 'PC15_SOLANA_NOT_FINALIZED');
        same(base58Decode(fact.genesis, 32).toString('hex'), genesis, 'PC15_WRONG_OBSERVED_GENESIS');
        same(fact.recipientDeltaLamports, r.amount, 'PC15_WRONG_SOLANA_BALANCE_DELTA');
        need(BigInt(decimal(uint(fact.feeLamports, 8))) <= BigInt(maximumSolanaFeeLamports), 'PC15_SOLANA_FEE_LIMIT');
        need(Number.isSafeInteger(fact.slot) && Number.isSafeInteger(fact.currentSlot) && fact.slot >= 0 && fact.currentSlot >= fact.slot, 'PC15_INCOHERENT_SOLANA_CONTEXT');
        fields = { source: base58Decode(fact.solver, 32).toString('hex'), recipientOrScriptHash: base58Decode(fact.recipient, 32).toString('hex'), amount: fact.lamports, finalityKind: 'SOL_FINALIZED', finalityMeasure: '1', observedBlockIdentity: base58Decode(fact.blockhash, 32).toString('hex'), observedBlockNumber: String(fact.slot), observedTipIdentity: ZERO32, observedTipNumber: String(fact.currentSlot) };
      } else {
        const fact = await observeBitcoinDelivery({ btc }, record.operation);
        same(fact.txid, record.effect.txid, 'PC15_WRONG_BITCOIN_TXID'); same(fact.vout, record.effect.vout, 'PC15_WRONG_BITCOIN_VOUT'); same(fact.rawTransaction, record.signed.rawTransaction, 'PC15_WRONG_BITCOIN_WIRE');
        need(BigInt(decimal(uint(fact.feeSatoshi, 8))) <= BigInt(maximumBitcoinFeeSatoshi), 'PC15_BITCOIN_FEE_LIMIT');
        need(fact.confirmations >= minimumConfirmations && fact.blockhash !== null && fact.blockHeight !== null, 'PC15_BITCOIN_NOT_FINAL');
        fields = { source: ZERO32, recipientOrScriptHash: hashHex(Buffer.from(fact.script, 'hex')), amount: fact.amountSatoshi, finalityKind: 'BTC_CONFIRMATIONS', finalityMeasure: String(fact.confirmations), observedBlockIdentity: fact.blockhash, observedBlockNumber: String(fact.blockHeight), observedTipIdentity: fact.observedTip, observedTipNumber: String(BigInt(fact.blockHeight) + BigInt(fact.confirmations) - 1n) };
      }
      const at = clock(), tagInput = encodeOpaqueEffectTagInput(identityNamespace, domain, record.effect);
      need(at >= BigInt(r.executeAfter) && at < BigInt(r.executeBefore), 'PC15_OBSERVATION_OUTSIDE_EXECUTION_WINDOW');
      const certificate = immutable({ version: 1, profile: PRIVATE_NATIVE_PROFILE, policyId, identityNamespace, chainDomain: domain, canonicalEffect: record.effect, localInstructionCommitment: r.localInstructionCommitment, ...fields, success: true, observedAt: at.toString(), validFromEpoch: r.validFromEpoch, validUntilEpoch: r.validUntilEpoch, opaqueTag: createHmac('sha256', issuer.hmacKey).update(tagInput).digest('hex') });
      const message = encodeNativeCertificate(certificate); policyChecks(certificate, policy, at / BigInt(epochSeconds));
      // sha256 exactly once: Node hashes the frame; do not pass its hash here.
      const signature = normalizeSignature(sign('sha256', message, { key: issuer.privateKey, dsaEncoding: 'ieee-p1363' }));
      need(verify('sha256', message, { key: issuer.publicKey, dsaEncoding: 'ieee-p1363' }, signature), 'PC15_INDEPENDENT_SIGNATURE_CHECK_FAILED');
      const envelope = immutable({ certificate, signature: signature.toString('hex'), issuerPublicKey: issuer.coordinates });
      await archiveCertificate(envelope, policy); live(); record.observedCertificate = envelope; record.phase = 'CERTIFIED'; return envelope;
    }
    return Object.freeze({ policy, dispatch, observeAndCertify, nativeReceipt: handle => structuredClone(recordFor(handle).signed) });
  }
  return Object.freeze({ lifetimeId, identityNamespace, classification: 'DISPOSABLE_HOST_TRUSTED_ISSUER_NO_RESTART', bind,
    publicKeys: () => { live(); return immutable(Object.fromEntries([...issuers].map(([chain, issuer]) => [chain, issuer.coordinates]))); },
    close: () => { if (!closed) { closed = true; for (const issuer of issuers.values()) { issuer.hmacKey.fill(0); issuer.privateKey = null; } } },
  });
}
