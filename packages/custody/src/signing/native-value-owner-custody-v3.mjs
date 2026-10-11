/** Separately versioned native-value original custody. The original native vault and note keys are retained; legacy manual records are never adopted. Proof relations and note encodings remain unchanged. */
/** Fixed local fake-value owner custody. Only a private, authenticated owner
 * process may instantiate this module. Observations are trusted local RPC
 * records, not native consensus. No proof, chain, or backend starts here. */
import assert from 'node:assert/strict';
import { createHash, createPrivateKey, createPublicKey, randomBytes, verify } from 'node:crypto';
import { lstat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { Vault } from '@lianum/engine/crypto/vault';
import { canonical } from '@lianum/engine/crypto/privacy';
import { signature, nullifier } from '@lianum/engine/notes/private-note-encoding';
import { derivePrivateAssetIdentity } from '@lianum/engine/notes/private-asset-runtime';
import { createBalanceNote, balanceCommitment, walletDepositInput, walletWithdrawInput,
  balanceDepositFrame, balanceWithdrawFrame, walletInputPublicWords, encodeWalletPoolInputs }
  from '@lianum/engine/wallet/notes/private-wallet-note-encoding';
import { compileFundedGraph, attachFundedSignatures, fundedSigningRequests }
  from '@lianum/engine/execution/graph/funded-graph';
import { createGenericBalanceNativePreparation, validateGenericBalanceNativePreparation,
  genericBalanceNativeTerms, genericBalanceNativeInvoiceRequests }
  from '@lianum/engine/execution/balances/generic-balance-native-preparation';
import { inspectGenericSnapshot, reserveProjection } from '@lianum/engine/execution/local/local-ledger';
import { buildAuthorizedEnvelope } from './authorized-envelope.mjs';
import { createCommitmentCodec, exactRecord, canonicalField, validateStruct, ZERO }
  from '@lianum/components/encoding/commitments';
import { encodeStatement, decodeStatement } from '@lianum/components/encoding/statements';
import { encodeDepositIntentInputs, decodeDepositIntentInputs, depositIntentFrame, depositIntentWitness }
  from '@lianum/engine/execution/inputs/deposit-intent';
import { decodeEvmVaultDeliveryCall } from '@lianum/engine/encoding/evm-vault-delivery';
import { FLAT_OWNER_NATIVE_CLAIM_ISSUE, validateFlatOwnerNativeClaimTransition } from '../claims/flat-owner-claim-transition.mjs';

import { validateNativeValueManualReview, validateNativeValueManualRecords, validateNativeValueManualReauthorization, currentNativeValueManualAuthorization } from '../preparation/native-value-owner-manual-binding-v1.mjs';

export const NATIVE_VALUE_OWNER_PROFILE = 'FIXED_LOCAL_FLAT_OWNER_CUSTODY_V1';
export const FLAT_OWNER_OBSERVATION_TRUST = 'OWNED_LOCAL_RPC_NOT_NATIVE_CONSENSUS';
export const FLAT_OWNER_CLAIM_HANDOFF_PROFILE = 'FLAT_OWNER_NATIVE_CLAIM_INGRESS_HANDOFF_V1';
export const FLAT_OWNER_CLAIM_HANDOFF_TRUST = 'INGRESS_PROVER_LEARNS_THIS_NOTE_OPENING_BUT_CANNOT_SIGN_SPEND';
export const ownerCopy = value => JSON.parse(canonical(value));
export const ownerDigest = value => createHash('sha256').update(canonical(value)).digest('hex');
const same = (a, b) => assert.equal(canonical(a), canonical(b), 'FLAT_OWNER_BINDING');
const fresh = () => randomBytes(32).toString('hex');
const EMPTY = { type: 4, rho: ZERO, x: ZERO, y: ZERO, value: '0', secret: ZERO };
const KINDS = ['deposit', 'deposit_intent', 'reservation', 'recovery', 'withdraw_source', 'withdraw_change', 'withdraw_recovery'];
const METHODS = {
  deposit: ['depositBalance(bytes,bytes32[])', 26],
  deposit_intent: ['depositBalanceIntent(bytes,bytes32[])', 27],
  reservation: ['reserveGenericGuarded((bytes,bytes32[]),(bytes,bytes32[]),uint64,bytes32)', 58],
  recovery: ['recoverGeneric(bytes,bytes32[])', 41],
  withdrawal: ['withdrawBalance(bytes,bytes32[])', 39],
};
function hex(value, width = 32, nonzero = true) {
  assert.ok(typeof value === 'string' && value.length === width * 2
    && /^[0-9a-f]+$/.test(value) && (!nonzero || value !== '0'.repeat(width * 2)), 'FLAT_OWNER_HEX');
  return value;
}
function uint(value, positive = false) {
  assert.ok(typeof value === 'string' && /^(0|[1-9][0-9]*)$/.test(value) && value.length <= 20
    && BigInt(value) < (1n << 64n) && BigInt(value).toString() === value
    && (!positive || BigInt(value) > 0n), 'FLAT_OWNER_UINT'); return BigInt(value);
}
function role(value) { assert.ok(['source', 'change', 'recovery'].includes(value), 'FLAT_OWNER_NOTE_ROLE'); return value; }
function freeze(value) { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
const detached = value => freeze(ownerCopy(value));
const calldataDigest = value => createHash('sha256').update(Buffer.from(value.slice(2), 'hex')).digest('hex');
export function flatOwnerIdentity(input) {
  const value = ownerCopy(input), token = Object.hasOwn(value, 'assetBinding');
  exactRecord(value, ['pool', 'domain', 'domainCommitment', ...(token ? ['assetBinding'] : [])]);
  hex(value.pool, 20); validateStruct('domain', value.domain); canonicalField(value.domainCommitment, true);
  assert.equal(value.domain.ledgerNamespace, value.domain.hubDomain, 'FLAT_OWNER_INITIAL_NAMESPACE');
  let asset = '0'.repeat(40), codeHash = ZERO;
  if (token) {
    exactRecord(value.assetBinding, ['token', 'codeHash']);
    asset = hex(value.assetBinding.token, 20); codeHash = hex(value.assetBinding.codeHash);
    assert.notEqual(asset, value.pool, 'FLAT_OWNER_ASSET_POOL');
  }
  assert.equal(value.domain.asset, derivePrivateAssetIdentity(31337, '0x' + asset, '0x' + codeHash).slice(2),
    'FLAT_OWNER_ASSET_DOMAIN');
  return value;
}

function assetBalance(value) {
  assert.ok(typeof value === 'string' && value.length <= 78 && /^(0|[1-9][0-9]*)$/.test(value)
    && BigInt(value) < (1n << 256n), 'FLAT_OWNER_ASSET_BALANCE');
  return BigInt(value);
}

/** A typed historical token record is mandatory for token custody, including
 * transitions that only change notes. Native custody accepts no such record. */
function validateAssetObservation(record, id, op, tx, before, after) {
  exactRecord(record, ['kind', 'token', 'codeHash', 'pool', 'participant', 'participantRole', 'before', 'after']);
  assert.equal(record.kind, 'ERC20', 'FLAT_OWNER_ASSET_KIND');
  assert.equal(record.token, id.assetBinding.token, 'FLAT_OWNER_ASSET_TOKEN');
  assert.equal(record.codeHash, id.assetBinding.codeHash, 'FLAT_OWNER_ASSET_CODE');
  assert.equal(record.pool, id.pool, 'FLAT_OWNER_ASSET_POOL');
  const withdrawal = op.kind.startsWith('withdraw_');
  assert.equal(record.participantRole, withdrawal ? 'RECIPIENT' : 'SENDER', 'FLAT_OWNER_ASSET_PARTICIPANT_ROLE');
  assert.equal(record.participant, withdrawal ? op.statement.recipient : tx.from, 'FLAT_OWNER_ASSET_PARTICIPANT');
  hex(record.participant, 20);
  assert.notEqual(record.participant, id.pool, 'FLAT_OWNER_ASSET_SELF_MOVEMENT');
  for (const [phase, snapshot] of [['before', before], ['after', after]]) {
    exactRecord(record[phase], ['blockHash', 'poolBalance', 'participantBalance']);
    assert.equal(record[phase].blockHash, snapshot.raw.blockHash, 'FLAT_OWNER_ASSET_BLOCK');
    assetBalance(record[phase].poolBalance); assetBalance(record[phase].participantBalance);
    assert.equal(record[phase].poolBalance, snapshot.publicState.actualAssetBalance, 'FLAT_OWNER_ASSET_BACKING');
  }
  const delta = op.kind === 'deposit' ? uint(op.statement.amount, true)
    : withdrawal ? -uint(op.statement.amount, true) : 0n;
  assert.equal(assetBalance(record.after.poolBalance), assetBalance(record.before.poolBalance) + delta,
    'FLAT_OWNER_ASSET_POOL_DELTA');
  assert.equal(assetBalance(record.after.participantBalance), assetBalance(record.before.participantBalance) - delta,
    'FLAT_OWNER_ASSET_PARTICIPANT_DELTA');
}
function keyFor(note) {
  const privateKey = createPrivateKey(note.privateKeyPem), publicKey = createPublicKey(privateKey);
  const key = publicKey.export({ format: 'jwk' });
  assert.equal(privateKey.asymmetricKeyType, 'ec'); assert.equal(privateKey.asymmetricKeyDetails.namedCurve, 'secp256k1');
  assert.equal(Buffer.from(key.x, 'base64url').toString('hex'), note.opening.x, 'FLAT_OWNER_KEY');
  assert.equal(Buffer.from(key.y, 'base64url').toString('hex'), note.opening.y, 'FLAT_OWNER_KEY');
  return { privateKey, publicKey };
}
function newNote(id, amount, recipient) {
  hex(recipient, 20); assert.notEqual(recipient, id.pool, 'FLAT_OWNER_SELF_EXIT'); uint(amount, true);
  const n = createBalanceNote({ scope: id.domain.scope, policy: id.domain.policy, value: amount });
  return { commitment: n.commitment.toString('hex'), opening: { type: 4, rho: n.rho.toString('hex'),
    x: n.x.toString('hex'), y: n.y.toString('hex'), value: amount, secret: n.secret.toString('hex') },
    privateKeyPem: n.privateKey.export({ type: 'pkcs8', format: 'pem' }), recipient, status: 'UNISSUED' };
}
function noteNF(id, n) { return nullifier(id.domain.scope, n.commitment, n.opening.secret).toString('hex'); }
function validateNote(id, n) {
  exactRecord(n, ['commitment', 'opening', 'privateKeyPem', 'recipient', 'status']);
  exactRecord(n.opening, ['type', 'rho', 'x', 'y', 'value', 'secret']);
  assert.equal(n.opening.type, 4); uint(n.opening.value, true); hex(n.commitment); hex(n.recipient, 20);
  assert.notEqual(n.recipient, id.pool, 'FLAT_OWNER_SELF_EXIT');
  for (const name of ['rho', 'x', 'y', 'secret']) hex(n.opening[name], 32, false);
  assert.equal(balanceCommitment(id.domain.scope, id.domain.policy, n.opening).toString('hex'), n.commitment, 'FLAT_OWNER_NOTE');
  keyFor(n); assert.ok(['UNISSUED', 'AVAILABLE', 'LOCKED', 'SPENT', 'WITHDRAWN'].includes(n.status));
}
function compile(state) {
  const a = state.authorization, { scope, policy, asset } = state.identity.domain;
  return compileFundedGraph({ scope, policy, asset, ...genericBalanceNativeTerms(a.preparation), ...a.nonces,
    inputNote: state.notes.source.opening, changeNote: state.notes.change?.opening ?? EMPTY,
    recoveryNote: state.notes.recovery.opening });
}
function validateIntentAuthorization(a, state, id) {
  assert.equal(a.statement.scope, id.domain.scope); assert.equal(a.statement.policy, id.domain.policy);
  assert.equal(a.statement.output, state.notes.source?.commitment, 'FLAT_OWNER_INTENT_NOTE');
  assert.equal(a.statement.amount, state.notes.source.opening.value, 'FLAT_OWNER_INTENT_NOTE');
  same(encodeDepositIntentInputs(a.statement), a.publicInputs);
  if (a.intent !== null) assert.equal(a.intent, depositIntentFrame(a.statement).toString('hex'));
  if (a.proof !== null) {
    exactRecord(a.proof, ['proof', 'publicInputs', 'evidence']);
    assert.ok(typeof a.proof.proof === 'string' && /^(?:[0-9a-f]{2})+$/.test(a.proof.proof)
      && a.proof.proof.length <= 2 * 1024 * 1024, 'FLAT_OWNER_INTENT_PROOF');
    same(a.proof.publicInputs, a.publicInputs);
    assert.ok(a.witness && a.intent, 'FLAT_OWNER_INTENT_NOT_AUTHORIZED');
  }
}
// An owner-local stable binding, not the gateway's H4 native-claim-intent id.
// No claim secret or destination is derived in custody: the scoped prover uses
// the pinned claim codec on this exact retained opening.
function claimIntentIdentity(id, claimDomain, statement) {
  return ownerDigest({ profile: FLAT_OWNER_CLAIM_HANDOFF_PROFILE, identitySHA256: ownerDigest(id), claimDomain,
    scope: statement.scope, policy: statement.policy, amount: statement.amount, output: statement.output });
}
function claimHandoffPacket(state, authorization, revision) {
  const binding = state.operations.deposit_intent.nativeClaim, n = state.notes.source.opening;
  assert.ok(authorization.proof, 'FLAT_OWNER_INTENT_PROOF_REQUIRED');
  hex(n.secret); // This new disclosure profile must never adopt a zero secret.
  const packet = { version: 1, profile: FLAT_OWNER_CLAIM_HANDOFF_PROFILE, trust: FLAT_OWNER_CLAIM_HANDOFF_TRUST,
    ownerIdentitySHA256: ownerDigest(state.identity), claimDomain: binding.claimDomain,
    ingressProverIdentity: binding.ingressProverIdentity, intentIdentitySHA256: binding.intentIdentitySHA256,
    revision, statement: authorization.statement, proofResult: authorization.proof,
    opening: { rho: n.rho, x: n.x, y: n.y, value: n.value, noteSecret: n.secret } };
  return { ...packet, handoffIdentitySHA256: ownerDigest(packet) };
}
function claimIntentQuery(state, authorization, handoff, submission) {
  return { identitySHA256: ownerDigest(state.identity), claimDomain: handoff.claimDomain,
    intentIdentitySHA256: handoff.intentIdentitySHA256, handoffIdentitySHA256: handoff.handoffIdentitySHA256,
    statement: authorization.statement,
    proofSHA256: createHash('sha256').update(Buffer.from(authorization.proof.proof, 'hex')).digest('hex'), submission };
}
function validateClaimRenewalObservation(input, query, id) {
  assert.ok(input, 'FLAT_OWNER_CLAIM_INTENT_UNOBSERVED');
  const o = ownerCopy(input);
  exactRecord(o, ['identitySHA256', 'claimDomain', 'intentIdentitySHA256', 'handoffIdentitySHA256',
    'snapshot', 'intent', 'submissionResolution']);
  for (const field of ['identitySHA256', 'claimDomain', 'intentIdentitySHA256', 'handoffIdentitySHA256'])
    assert.equal(o[field], query[field], 'FLAT_OWNER_CLAIM_OBSERVATION_BINDING');
  const view = flatOwnerSnapshot(o.snapshot, id);
  exactRecord(o.intent, ['status', 'revision', 'statement', 'proofSHA256']);
  assert.equal(o.intent.status, 'ACTIVE_UNISSUED', 'FLAT_OWNER_CLAIM_INTENT_NOT_ACTIVE');
  uint(o.intent.revision); same(o.intent.statement, query.statement);
  assert.equal(o.intent.proofSHA256, query.proofSHA256, 'FLAT_OWNER_CLAIM_PROOF_BINDING');
  assert.ok(!view.commitments.includes('0x' + query.statement.output), 'FLAT_OWNER_INTENT_ALREADY_CREDITED');
  if (query.submission === null) assert.equal(o.submissionResolution, null, 'FLAT_OWNER_CLAIM_SUBMISSION_BINDING');
  else {
    // A canonical reverted receipt is conclusive for this exact signed EVM
    // operation. Mere absence, expiry or a caller's "unissued" flag is not.
    const resolution = o.submissionResolution;
    exactRecord(resolution, ['transactionHash', 'calldataSHA256', 'receipt', 'canonicalBlockHashBefore', 'canonicalBlockHashAfter']);
    for (const field of ['transactionHash', 'calldataSHA256'])
      assert.equal(resolution[field], query.submission[field], 'FLAT_OWNER_CLAIM_SUBMISSION_BINDING');
    exactRecord(resolution.receipt, ['transactionHash', 'blockHash', 'status']);
    assert.equal(resolution.receipt.transactionHash, query.submission.transactionHash, 'FLAT_OWNER_CLAIM_SUBMISSION_BINDING');
    hex(resolution.receipt.blockHash);
    assert.equal(resolution.receipt.status, 0, 'FLAT_OWNER_CLAIM_SUBMISSION_UNRESOLVED');
    assert.equal(resolution.canonicalBlockHashBefore, resolution.receipt.blockHash, 'FLAT_OWNER_CLAIM_SUBMISSION_CANONICAL');
    assert.equal(resolution.canonicalBlockHashAfter, resolution.receipt.blockHash, 'FLAT_OWNER_CLAIM_SUBMISSION_CANONICAL');
  }
  return { observation: o, view };
}
function validateNativeClaimBinding(state, op, id) {
  const binding = op.nativeClaim;
  exactRecord(binding, ['version', 'claimDomain', 'ingressProverIdentity', 'intentIdentitySHA256', 'handoff']);
  assert.equal(binding.version, 1); assert.ok(id.assetBinding, 'FLAT_OWNER_CLAIM_TOKEN_REQUIRED');
  hex(binding.claimDomain); hex(binding.ingressProverIdentity); hex(binding.intentIdentitySHA256);
  assert.equal(binding.intentIdentitySHA256, claimIntentIdentity(id, binding.claimDomain, op.statement), 'FLAT_OWNER_CLAIM_BINDING');
  let previous = null, canonicalRevision = null;
  for (const [revision, old] of op.history.entries()) {
    exactRecord(old, ['before', 'statement', 'publicInputs', 'intent', 'witness', 'proof', 'handoff', 'submission', 'canonicalIntent']);
    validateIntentAuthorization(old, state, id);
    assert.ok(old.proof && old.handoff, 'FLAT_OWNER_CLAIM_HISTORY');
    same(old.handoff, claimHandoffPacket(state, old, revision));
    if (old.submission !== null) {
      exactRecord(old.submission, ['transactionHash', 'calldataSHA256']); hex(old.submission.transactionHash); hex(old.submission.calldataSHA256);
    }
    validateClaimRenewalObservation(old.canonicalIntent, claimIntentQuery(state, old, old.handoff, old.submission), id);
    const observedRevision = uint(old.canonicalIntent.intent.revision);
    if (canonicalRevision !== null) assert.ok(observedRevision > canonicalRevision, 'FLAT_OWNER_CLAIM_CANONICAL_REVISION');
    canonicalRevision = observedRevision;
    if (previous) assert.ok(uint(old.statement.validUntil) > uint(previous.validUntil)
      && uint(old.statement.validFrom) >= uint(previous.validFrom), 'FLAT_OWNER_CLAIM_RENEWAL_WINDOW');
    previous = old.statement;
  }
  if (previous) assert.ok(uint(op.statement.validUntil) > uint(previous.validUntil)
    && uint(op.statement.validFrom) >= uint(previous.validFrom), 'FLAT_OWNER_CLAIM_RENEWAL_WINDOW');
  if (binding.handoff !== null) same(binding.handoff, claimHandoffPacket(state, op, op.history.length));
}
function validateState(state, id) {
  // Absence is the exact legacy schema, not an empty extension. Reads never
  // migrate it. First manual mutation validates old state, then checkpoint-saves
  // the extension while preserving every existing field and operation.
  const manual = Object.hasOwn(state, 'nativeNotePreparations');
  exactRecord(state, ['version', 'profile', 'identity', 'notes', 'authorization', 'operations',
    ...(manual ? ['nativeNotePreparations'] : [])]);
  if (manual) {
    validateNativeValueManualRecords(state.nativeNotePreparations);
    for (const entry of state.nativeNotePreparations.records) {
      const { review, ownerState } = entry, currentAuthorization = currentNativeValueManualAuthorization(entry);
      assert.equal(review.ownerIdentitySHA256, ownerDigest(id), 'FLAT_OWNER_MANUAL_IDENTITY');
      for (const field of ['pool']) assert.equal(review.asset[field], id[field]);
      for (const field of ['scope', 'policy']) assert.equal(review.asset[field], id.domain[field]);
      assert.equal(review.asset.assetIdentity, id.domain.asset);
      assert.equal(review.asset.token, id.assetBinding?.token ?? '0'.repeat(40));
      const prepared = state.operations[review.ownerKind];
      if (ownerState === 'LATCHED') assert.equal(prepared, undefined, 'FLAT_OWNER_MANUAL_STATE');
      else {
        assert.ok(prepared, 'FLAT_OWNER_MANUAL_STATE');
        const note = state.notes[review.kind === 'TOP_UP' ? 'source' : review.role];
        assert.equal(prepared.epoch, currentAuthorization.epoch, 'FLAT_OWNER_MANUAL_EPOCH');
        assert.equal(prepared.statement.epoch, currentAuthorization.epoch, 'FLAT_OWNER_MANUAL_EPOCH');
        assert.equal(prepared.statement.amount, review.amount, 'FLAT_OWNER_MANUAL_AMOUNT');
        assert.equal(note?.opening.value, review.amount, 'FLAT_OWNER_MANUAL_AMOUNT');
        assert.equal(note?.recipient, review.recipient, 'FLAT_OWNER_MANUAL_RECIPIENT');
        if (review.kind === 'EXIT') assert.equal(prepared.statement.recipient, review.recipient, 'FLAT_OWNER_MANUAL_RECIPIENT');
      }
    }
  }
  assert.equal(state.version, 1); assert.equal(state.profile, NATIVE_VALUE_OWNER_PROFILE); same(state.identity, id);
  exactRecord(state.notes, ['source', 'change', 'recovery']);
  Object.values(state.notes).filter(Boolean).forEach(note => validateNote(id, note));
  assert.equal(new Set(Object.values(state.notes).filter(Boolean).map(note => note.commitment)).size,
    Object.values(state.notes).filter(Boolean).length, 'FLAT_OWNER_DISTINCT_NOTES');
  for (const [kind, op] of Object.entries(state.operations)) {
    assert.ok(KINDS.includes(kind), 'FLAT_OWNER_OPERATION');
    exactRecord(op, ['kind', 'stage', 'epoch', 'before', 'statement', 'publicInputs', 'intent', 'witness', 'submission', 'confirmation', 'history',
      ...(kind === 'deposit_intent' ? ['proof', ...(Object.hasOwn(op, 'nativeClaim') ? ['nativeClaim'] : [])] : [])]);
    assert.equal(op.kind, kind); assert.ok(['PREPARED', 'SIGNING', 'AUTHORIZED', 'SUBMITTING', 'UNKNOWN', 'CONFIRMED'].includes(op.stage));
    if (op.epoch !== null) uint(op.epoch);
    assert.ok(Array.isArray(op.history) && op.history.length <= 32, 'FLAT_OWNER_RENEWAL_LIMIT');
    if (op.submission) { hex(op.submission.calldataSHA256); assert.ok(['SUBMITTING', 'UNKNOWN', 'CONFIRMED'].includes(op.stage)); }
    if (kind === 'deposit_intent') {
      assert.equal(op.epoch, null, 'FLAT_OWNER_INTENT_ABSOLUTE_WINDOW');
      assert.equal(state.operations.deposit, undefined, 'FLAT_OWNER_FUNDING_METHOD_FIXED');
      validateIntentAuthorization(op, state, id);
      if (Object.hasOwn(op, 'nativeClaim')) validateNativeClaimBinding(state, op, id);
      else assert.equal(op.history.length, 0, 'FLAT_OWNER_INTENT_NO_RENEWAL');
      if (op.submission) {
        exactRecord(op.submission, ['calldataSHA256', 'transactionHash']);
        hex(op.submission.transactionHash);
      }
    }
  }
  if (state.authorization) {
    const a = state.authorization;
    exactRecord(a, ['request', 'preparation', 'nonces', 'joinBlinds', 'leafBlinds', 'invoiceSignatures', 'signed', 'envelope']);
    validateGenericBalanceNativePreparation(a.preparation, a.request.nativeConfig);
    exactRecord(a.nonces, ['reservationNonce', 'reserveSecret', 'graphNonce', 'paddingSalts']);
    assert.equal(a.joinBlinds.length, 4); assert.equal(a.leafBlinds.length, 16); assert.equal(a.nonces.paddingSalts.length, 4);
    [...a.joinBlinds, ...a.leafBlinds, ...a.nonces.paddingSalts, a.nonces.reservationNonce,
      a.nonces.reserveSecret, a.nonces.graphNonce].forEach(value => hex(value));
    const c = compile(state);
    if (a.signed) same(a.signed, attachFundedSignatures(c, { ownerSignature: a.signed.signatures.ownerSignature,
      invoiceSignatures: a.invoiceSignatures }));
    if (a.envelope) { assert.ok(a.signed); same(a.envelope.publicStatement.domainCommitment, id.domainCommitment); }
  }
}
export function flatOwnerSnapshot(rawInput, identity) {
  const raw = ownerCopy(rawInput);
  exactRecord(raw, ['identitySHA256', 'blockHash', 'canonicalBlockHashBefore', 'canonicalBlockHashAfter',
    'timestamp', 'rawState', 'rawHistory', 'rawBacking']);
  assert.equal(raw.identitySHA256, ownerDigest(identity), 'FLAT_OWNER_OBSERVATION_IDENTITY');
  for (const name of ['blockHash', 'canonicalBlockHashBefore', 'canonicalBlockHashAfter']) hex(raw[name]);
  assert.equal(raw.blockHash, raw.canonicalBlockHashBefore); assert.equal(raw.blockHash, raw.canonicalBlockHashAfter);
  uint(raw.timestamp);
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

/** Canonical fixed ABI decoder for owned transaction matching. Proof bytes are
 * opaque here; only the deployed verifier establishes proof acceptance. */
export function decodeFlatOwnerCalldata(artifact, calldata) {
  assert.ok(typeof calldata === 'string' && /^0x(?:[0-9a-f]{2})+$/.test(calldata)
    && calldata.length <= 2 * 1024 * 1024, 'FLAT_OWNER_CALLDATA');
  const entries = Object.entries(METHODS).filter(([, [name]]) => artifact.evm.methodIdentifiers[name] === calldata.slice(2, 10));
  assert.equal(entries.length, 1, 'FLAT_OWNER_CALLDATA_METHOD');
  const [kind, [, size]] = entries[0], body = calldata.slice(10);
  const word = at => { assert.ok(Number.isSafeInteger(at) && at >= 0 && (at + 32) * 2 <= body.length); return body.slice(at * 2, (at + 32) * 2); };
  const number = at => { const value = BigInt('0x' + word(at)); assert.ok(value <= 1024n * 1024n); return Number(value); };
  function tuple(at, count) {
    assert.equal(number(at), 64, 'FLAT_OWNER_PROOF_OFFSET');
    const proofLength = number(at + 64); assert.ok(proofLength > 0);
    const padded = Math.ceil(proofLength / 32) * 32;
    assert.equal(number(at + 32), 96 + padded, 'FLAT_OWNER_INPUT_OFFSET');
    assert.equal(body.slice((at + 96 + proofLength) * 2, (at + 96 + padded) * 2), '0'.repeat((padded - proofLength) * 2));
    const wordsAt = at + 96 + padded; assert.equal(number(wordsAt), count);
    const publicInputs = Array.from({ length: count }, (_, i) => BigInt('0x' + word(wordsAt + 32 + i * 32)).toString());
    return { publicInputs, end: wordsAt + 32 + count * 32 };
  }
  if (kind === 'reservation') {
    assert.equal(number(0), 128); const u = tuple(128, 16); assert.equal(number(32), u.end);
    const s = tuple(u.end, 58); assert.equal(body.length, s.end * 2);
    const expectedSequence = BigInt('0x' + word(64)).toString(); uint(expectedSequence);
    return { kind, publicInputs: s.publicInputs, authorizationInputs: u.publicInputs,
      guards: { expectedSequence, expectedPostRoot: '0x' + word(96) } };
  }
  const result = tuple(0, size); assert.equal(body.length, result.end * 2);
  return { kind, publicInputs: result.publicInputs, authorizationInputs: null, guards: null };
}
const recordMark = record => ({ revision: record.revision, stateSHA256: ownerDigest(record.data) });
function checkpoint(id, record, pending = null) { return { version: 1, identitySHA256: ownerDigest(id),
  acknowledged: recordMark(record), pending: pending ? recordMark(pending) : null }; }
function operation(kind, before, statement, publicInputs, epoch = null) {
  return { kind, stage: 'PREPARED', epoch, before, statement, publicInputs, intent: null, witness: null,
    submission: null, confirmation: null, history: [] };
}
async function safePath(path, existing) {
  const directory = await lstat(dirname(resolve(path)));
  assert.ok(directory.isDirectory() && !directory.isSymbolicLink() && (directory.mode & 0o077) === 0, 'FLAT_OWNER_PRIVATE_DIRECTORY');
  if (existing) { const file = await lstat(path); assert.ok(file.isFile() && !file.isSymbolicLink()
    && file.nlink === 1 && (file.mode & 0o077) === 0, 'FLAT_OWNER_PRIVATE_FILE'); }
}

/** PRIVATE bootstrap / focused host test seam. The process wrapper supplies an
 * actually owned observer and an internal pinned child-only hash capability.
 * This function never claims arbitrary injected observations are owned. */
export async function openTrustedNativeValueOwnerCustody(config, deps) {
  exactRecord(config, ['path', 'password', 'identity', 'poolArtifact', 'create', 'checkpoint', 'processIdentitySHA256', 'processGeneration']);
  exactRecord(deps, ['observer', 'onCheckpoint', 'withHashFields']);
  hex(config.processIdentitySHA256);
  assert.ok(Number.isSafeInteger(config.processGeneration) && config.processGeneration > 0);
  const processScope = { processIdentitySHA256: config.processIdentitySHA256, processGeneration: config.processGeneration };
  const id = flatOwnerIdentity(config.identity), artifact = ownerCopy(config.poolArtifact);
  assert.equal(typeof config.create, 'boolean'); assert.ok(typeof config.password === 'string' && config.password.length > 0);
  assert.equal(typeof deps.onCheckpoint, 'function'); assert.equal(typeof deps.withHashFields, 'function');
  assert.equal(typeof deps.observer.readSnapshot, 'function'); assert.equal(typeof deps.observer.readTransaction, 'function');
  await safePath(config.path, !config.create);
  const vault = new Vault(config.path); let password = config.password, closed = false, busy = false, fault = false;
  if (config.create) {
    assert.equal(config.checkpoint, null);
    await vault.create({ version: 1, profile: NATIVE_VALUE_OWNER_PROFILE, identity: id,
      notes: { source: null, change: null, recovery: null }, authorization: null, operations: {} }, password);
  }
  let record = await vault.read(password); validateState(record.data, id); await safePath(config.path, true);
  if (!config.create) {
    const cp = ownerCopy(config.checkpoint); exactRecord(cp, ['version', 'identitySHA256', 'acknowledged', 'pending']);
    assert.equal(cp.version, 1); assert.equal(cp.identitySHA256, ownerDigest(id));
    const mark = value => { exactRecord(value, ['revision', 'stateSHA256']);
      assert.ok(Number.isSafeInteger(value.revision) && value.revision >= 0); hex(value.stateSHA256); };
    mark(cp.acknowledged);
    if (cp.pending) { mark(cp.pending); assert.equal(cp.pending.revision, cp.acknowledged.revision + 1); }
    same(recordMark(record), cp.pending ?? cp.acknowledged); // Missing pending candidate fails closed.
  }
  const keyScopeSHA256 = ownerDigest({ profile: 'NATIVE_VALUE_OWNER_NOTE_KEY_SCOPE_V1',
    processIdentitySHA256: processScope.processIdentitySHA256, identitySHA256: ownerDigest(id) });
  await deps.onCheckpoint(checkpoint(id, record));
  const read = async () => flatOwnerSnapshot(await deps.observer.readSnapshot(), id);
  const op = kind => { assert.ok(KINDS.includes(kind)); assert.ok(record.data.operations[kind], 'FLAT_OWNER_OPERATION_ABSENT'); return record.data.operations[kind]; };
  const publicOperation = kind => { const a = op(kind); return detached({ kind, stage: a.stage,
    reconcileRequired: ['SUBMITTING', 'UNKNOWN'].includes(a.stage), dispatchAllowed: false }); };
  const sourceExitChosen = () => Boolean(record.data.operations.withdraw_source);
  const requireAuthorizationOpen = () => assert.ok(!sourceExitChosen(), 'FLAT_OWNER_SOURCE_EXIT_CHOSEN');
  async function exclusive(work) {
    assert.ok(!closed && !busy && !fault, 'FLAT_OWNER_UNAVAILABLE'); busy = true;
    try {
      try { const actual = await vault.read(password); same(actual, record); validateState(actual.data, id); }
      catch { fault = true; throw Error('FLAT_OWNER_STORAGE_CHANGED'); }
      return await work();
    }
    finally { busy = false; }
  }
  async function save(update) {
    const next = ownerCopy(record); next.revision++; update(next.data); validateState(next.data, id);
    try {
      await deps.onCheckpoint(checkpoint(id, record, next));
      await vault.update(password, record.revision, actual => { same(actual, record.data); return next.data; });
      same(await vault.read(password), next); await deps.onCheckpoint(checkpoint(id, next)); record = next;
    } catch { fault = true; throw Error('FLAT_OWNER_WRITE_UNCERTAIN'); }
  }
  const pathFor = (view, note) => {
    const index = view.commitments.indexOf('0x' + note.commitment);
    assert.ok(index >= 0 && !view.nullifiers.includes('0x' + noteNF(id, note)), 'FLAT_OWNER_MEMBERSHIP');
    return view.tree.path(index);
  };
  function noteStatement(kind, epoch, view) {
    const name = kind === 'deposit' ? 'source' : role(kind.slice(9));
    const n = record.data.notes[name]; assert.ok(n);
    return kind === 'deposit' ? { scope: id.domain.scope, policy: id.domain.policy, epoch,
      amount: n.opening.value, output: n.commitment } : { scope: id.domain.scope, policy: id.domain.policy,
      epoch, root: view.publicState.root.slice(2), nullifier: noteNF(id, n), amount: n.opening.value, recipient: n.recipient };
  }
  async function signNote(kind) {
    let a = op(kind); assert.ok(kind === 'deposit' || kind.startsWith('withdraw_'));
    if (kind === 'withdraw_source') assert.notEqual(record.data.notes.source.status, 'SPENT', 'FLAT_OWNER_RESERVATION_WON');
    if (a.witness) return detached({ inputs: a.witness, statement: a.statement, publicInputs: a.publicInputs });
    assert.ok(['PREPARED', 'SIGNING'].includes(a.stage));
    const n = record.data.notes[kind === 'deposit' ? 'source' : kind.slice(9)], s = a.statement;
    const intent = (kind === 'deposit' ? balanceDepositFrame(s.scope, s.policy, s.epoch, s.amount, s.output)
      : balanceWithdrawFrame(s.scope, s.policy, n.commitment, s.recipient, s.amount, s.epoch)).toString('hex');
    if (a.stage === 'PREPARED') await save(state => { state.operations[kind].intent = intent; state.operations[kind].stage = 'SIGNING'; });
    else assert.equal(a.intent, intent);
    a = op(kind); const note = { ...n.opening, ...keyFor(n) };
    const witness = kind === 'deposit' ? walletDepositInput({ ...s, note }) : walletWithdrawInput({ ...s, note,
      path: pathFor(flatOwnerSnapshot(a.before, id), n) });
    same(walletInputPublicWords(kind === 'deposit' ? 'deposit_balance' : 'withdraw_balance', witness), a.publicInputs);
    await save(state => { state.operations[kind].witness = ownerCopy(witness); state.operations[kind].stage = 'AUTHORIZED'; });
    return detached({ inputs: witness, statement: a.statement, publicInputs: a.publicInputs });
  }
  const manualRecords = () => record.data.nativeNotePreparations?.records ?? [];
  function requireManualOriginal(kind, manual) {
    const entry = manualRecords().find(entry => entry.review.ownerKind === kind);
    assert.ok(!entry || manual === entry.review, 'FLAT_OWNER_MANUAL_ORIGINAL_ONLY');
  }
  function finishManual(state, manual) {
    if (manual) state.nativeNotePreparations.records.find(entry => entry.review.request.ownerOperationRef
      === manual.request.ownerOperationRef).ownerState = 'PREPARED';
  }
  async function prepareDeposit(input, manual = null) {
      const r = ownerCopy(input); exactRecord(r, ['amount', 'epoch', 'exitRecipient']); uint(r.amount, true); uint(r.epoch); hex(r.exitRecipient, 20);
      requireManualOriginal('deposit', manual);
      assert.ok(!record.data.operations.deposit_intent, 'FLAT_OWNER_FUNDING_METHOD_FIXED');
      if (record.data.notes.source) { const a = op('deposit'); assert.equal(a.statement.amount, r.amount);
        assert.equal(a.epoch, r.epoch); assert.equal(record.data.notes.source.recipient, r.exitRecipient); return publicOperation('deposit'); }
      const view = await read(); assert.equal(BigInt(view.raw.timestamp) / 600n, uint(r.epoch));
      const note = newNote(id, r.amount, r.exitRecipient);
      const statement = { scope: id.domain.scope, policy: id.domain.policy, epoch: r.epoch, amount: r.amount, output: note.commitment };
      await save(state => { finishManual(state, manual); state.notes.source = note; state.operations.deposit = operation('deposit', view.raw, statement,
        encodeWalletPoolInputs('deposit_balance', statement), r.epoch); }); return publicOperation('deposit');
  }
  async function prepareWithdrawal(input, manual = null) {
      const r = ownerCopy(input); exactRecord(r, ['role', 'epoch']); role(r.role); uint(r.epoch);
      const kind = 'withdraw_' + r.role; requireManualOriginal(kind, manual);
      if (record.data.operations[kind]) { assert.equal(op(kind).epoch, r.epoch); return publicOperation(kind); }
      const note = record.data.notes[r.role];
      if (r.role === 'source') {
        assert.ok(!record.data.operations.reservation?.submission, 'FLAT_OWNER_RESERVATION_LATCHED');
        assert.ok(note?.status === 'AVAILABLE' || (note?.status === 'LOCKED' && record.data.authorization), 'FLAT_OWNER_EXIT_UNAVAILABLE');
      } else assert.equal(note?.status, 'AVAILABLE', 'FLAT_OWNER_EXIT_UNAVAILABLE');
      const view = await read(); assert.equal(BigInt(view.raw.timestamp) / 600n, BigInt(r.epoch)); pathFor(view, note);
      const statement = noteStatement(kind, r.epoch, view);
      await save(state => { finishManual(state, manual); state.notes[r.role].status = 'LOCKED'; state.operations[kind] = operation(kind, view.raw, statement,
        encodeWalletPoolInputs('withdraw_balance', statement), r.epoch); }); return publicOperation(kind);
  }
  async function preparationTerms(input) {
      exactRecord(input, ['kind']);
      assert.ok(['deposit', 'withdraw_source', 'withdraw_change', 'withdraw_recovery'].includes(input.kind),
        'FLAT_OWNER_MANUAL_KIND');
      const kind = input.kind, name = kind === 'deposit' ? 'source' : kind.slice(9);
      const view = await read(), note = record.data.notes[name], a = record.data.operations[kind];
      for (const prior of Object.values(record.data.operations)) if (prior.confirmation) {
        assert.ok(BigInt(view.publicState.sequence) >= BigInt(prior.confirmation.postSequence)
          && view.roots.includes(prior.confirmation.postRoot), 'FLAT_OWNER_STALE_OBSERVATION');
      }
      const observedUnspent = Boolean(note && view.commitments.includes('0x' + note.commitment)
        && !view.nullifiers.includes('0x' + noteNF(id, note)));
      const eligible = kind === 'deposit'
        ? !record.data.operations.deposit_intent && !note && !a
        : !a && observedUnspent && (name === 'source'
          ? !record.data.operations.reservation?.submission
            && (note.status === 'AVAILABLE' || note.status === 'LOCKED' && Boolean(record.data.authorization))
          : note.status === 'AVAILABLE');
      return detached({ identitySHA256: ownerDigest(id), kind,
        observed: { blockHash: view.raw.blockHash, timestamp: view.raw.timestamp }, eligible,
        note: note ? { role: name, amount: note.opening.value, recipient: note.recipient,
          status: note.status, observedUnspent } : null,
        prepared: a ? { stage: a.stage, epoch: a.statement.epoch, amount: a.statement.amount,
          recipient: kind === 'deposit' ? note.recipient : a.statement.recipient,
          submissionBound: a.submission !== null } : null });
  }
  async function renewEpoch(input, manualAuthorization = null) {
      const r = ownerCopy(input); exactRecord(r, ['kind', 'epoch']); uint(r.epoch);
      assert.ok(r.kind === 'deposit' || r.kind.startsWith('withdraw_'));
      assert.ok(manualAuthorization || !manualRecords().some(entry => entry.review.ownerKind === r.kind), 'FLAT_OWNER_MANUAL_EPOCH_FIXED');
      const a = op(r.kind);
      assert.ok(!a.submission && ['PREPARED', 'SIGNING', 'AUTHORIZED'].includes(a.stage), 'FLAT_OWNER_RENEWAL_LATCHED');
      if (a.epoch === r.epoch) return publicOperation(r.kind);
      const view = await read(); assert.equal(BigInt(view.raw.timestamp) / 600n, BigInt(r.epoch)); assert.ok(BigInt(r.epoch) > BigInt(a.epoch));
      const note = record.data.notes[r.kind === 'deposit' ? 'source' : role(r.kind.slice(9))];
      if (r.kind === 'deposit') { assert.equal(note.status, 'UNISSUED'); assert.ok(!view.commitments.includes('0x' + note.commitment)); }
      else { assert.equal(note.status, 'LOCKED'); pathFor(view, note); }
      const statement = noteStatement(r.kind, r.epoch, view);
      await save(state => {
        if (manualAuthorization) {
          if (state.nativeNotePreparations.version === 1) {
            state.nativeNotePreparations = { version: 2, records: state.nativeNotePreparations.records.map(entry => ({ ...entry, reauthorizations: [] })) };
          }
          state.nativeNotePreparations.records.find(entry => entry.review.ownerKind === r.kind).reauthorizations.push(manualAuthorization);
        }
        const o = state.operations[r.kind]; o.history.push({ epoch: o.epoch, before: o.before, intent: o.intent, witness: o.witness });
        o.epoch = r.epoch; o.before = view.raw; o.statement = statement;
        o.publicInputs = encodeWalletPoolInputs(r.kind === 'deposit' ? 'deposit_balance' : 'withdraw_balance', statement);
        o.intent = null; o.witness = null; o.stage = 'PREPARED'; }); return publicOperation(r.kind);
  }
  const methods = {
    summary: () => detached({ profile: NATIVE_VALUE_OWNER_PROFILE, identitySHA256: ownerDigest(id), closed,
      keyScopeSHA256, manualNoteProfile: 'NATIVE_VALUE_OWNER_NOTE_CONSENT_V1', ...processScope,
      operations: Object.fromEntries(Object.entries(record.data.operations).map(([kind, a]) => [kind, a.stage])) }),
    privateSummary: () => exclusive(async () => {
      // A fresh observation is mandatory. Missing access is an error, never a
      // successful zero balance. A visible leaf alone cannot credit a note.
      const view = await read(), balances = { available: 0n, reserved: 0n, recovery: 0n, locked: 0n };
      for (const operation of Object.values(record.data.operations)) if (operation.confirmation) {
        assert.ok(BigInt(view.publicState.sequence) >= BigInt(operation.confirmation.postSequence)
          && view.roots.includes(operation.confirmation.postRoot), 'FLAT_OWNER_STALE_OBSERVATION');
      }
      const notes = Object.fromEntries(Object.entries(record.data.notes).map(([name, note]) => {
        if (!note) return [name, null];
        if (note.status !== 'UNISSUED') assert.ok(view.commitments.includes('0x' + note.commitment), 'FLAT_OWNER_STALE_OBSERVATION');
        const observedUnspent = view.commitments.includes('0x' + note.commitment)
          && !view.nullifiers.includes('0x' + noteNF(id, note));
        const available = observedUnspent && note.status === 'AVAILABLE';
        const locked = observedUnspent && note.status === 'LOCKED';
        if (available) balances.available += BigInt(note.opening.value);
        if (locked) balances.locked += BigInt(note.opening.value);
        if (name === 'recovery' && (available || locked)) balances.recovery += BigInt(note.opening.value);
        return [name, { status: note.status, value: note.opening.value, observedUnspent, available,
          pendingReconciliation: observedUnspent && note.status === 'UNISSUED' }];
      }));
      const reservation = record.data.operations.reservation, original = record.data.authorization?.signed?.authorizationStatement;
      if (reservation?.stage === 'CONFIRMED' && reservation.confirmation && original
        && view.commitments.includes('0x' + original.reserveCommitment)
        && !view.nullifiers.includes('0x' + original.reserveNullifier)) {
        assert.ok(view.publicState.liveReservations > 0, 'FLAT_OWNER_RESERVATION_OBSERVATION');
        balances.reserved = BigInt(record.data.notes.recovery.opening.value);
      }
      return detached({ profile: NATIVE_VALUE_OWNER_PROFILE, identitySHA256: ownerDigest(id),
        observed: { blockHash: view.raw.blockHash, timestamp: view.raw.timestamp },
        balances: Object.fromEntries(Object.entries(balances).map(([name, value]) => [name, value.toString()])), notes });
    }),
    // Private owner-local manual review only. No witness, commitment, path,
    // nullifier, signing material or HTTP/public summary extension is returned.
    graphPreparationTerms: () => exclusive(async () => {
      requireAuthorizationOpen();
      const a = record.data.authorization;
      assert.ok(a?.envelope && a.signed, 'FLAT_OWNER_NOT_AUTHORIZED');
      assert.ok(!record.data.operations.reservation?.submission, 'FLAT_OWNER_RESERVATION_LATCHED');
      const view = await read(), terms = genericBalanceNativeTerms(a.preparation);
      assert.ok(BigInt(view.raw.timestamp) < BigInt(terms.fundingValidUntil), 'FLAT_OWNER_EXPIRED');
      pathFor(view, record.data.notes.source);
      return detached({ identitySHA256: ownerDigest(id), envelope: a.envelope.publicStatement.envelope,
        sourceAmount: record.data.notes.source.opening.value, reservedAmount: terms.budget,
        changeAmount: record.data.notes.change?.opening.value ?? '0',
        changeRecipient: a.request.changeRecipient, recoveryRecipient: a.request.recoveryRecipient,
        fundingNotBefore: terms.fundingNotBefore, fundingValidUntil: terms.fundingValidUntil,
        settleBefore: terms.settleBefore });
    }),
    preparationTerms: input => exclusive(() => preparationTerms(input)),
    nativeNotePreparations: input => exclusive(async () => {
      assert.equal(input, null); return detached(record.data.nativeNotePreparations ?? { version: 1, records: [] });
    }),
    prepareNativeNotePreparation: input => exclusive(async () => {
      exactRecord(input, ['review']); validateNativeValueManualReview(input.review);
      const review = ownerCopy(input.review);
      assert.equal(review.keyScopeSHA256, keyScopeSHA256, 'NATIVE_VALUE_MANUAL_KEY_SCOPE');
      for (const [key, value] of Object.entries(processScope)) assert.equal(review[key], value, 'NATIVE_VALUE_MANUAL_PROCESS_SCOPE');
      assert.equal(review.ownerIdentitySHA256, ownerDigest(id), 'FLAT_OWNER_MANUAL_IDENTITY');
      assert.ok(!manualRecords().some(entry => entry.review.ownerKind === review.ownerKind
        || entry.review.request.requestId === review.request.requestId
        || entry.review.request.ownerOperationRef === review.request.ownerOperationRef), 'FLAT_OWNER_MANUAL_ORIGINAL_ONLY');
      const terms = await preparationTerms({ kind: review.ownerKind });
      assert.ok(terms.eligible && terms.prepared === null, 'FLAT_OWNER_MANUAL_REVIEW_STALE');
      same(terms.observed, review.observed);
      assert.equal(String(BigInt(terms.observed.timestamp) / 600n), review.epoch, 'FLAT_OWNER_MANUAL_REVIEW_STALE');
      if (review.kind === 'TOP_UP') assert.equal(terms.note, null);
      else {
        assert.equal(terms.note?.amount, review.amount); assert.equal(terms.note?.recipient, review.recipient);
        assert.equal(terms.note?.status, review.noteStatus); assert.equal(terms.note?.observedUnspent, true);
      }
      // The reviewed binding is acknowledged durably BEFORE creating a note,
      // locking it, signing or registering. Failure is never a retry grant.
      await save(state => {
        state.nativeNotePreparations ??= { version: 1, records: [] };
        state.nativeNotePreparations.records.push({ review, ownerState: 'LATCHED', ...(state.nativeNotePreparations.version === 2 ? { reauthorizations: [] } : {}) });
      });
      const retained = manualRecords().find(entry => entry.review.ownerKind === review.ownerKind).review;
      return review.kind === 'TOP_UP'
        ? prepareDeposit({ amount: review.amount, epoch: review.epoch, exitRecipient: review.recipient }, retained)
        : prepareWithdrawal({ role: review.role, epoch: review.epoch }, retained);
    }),
    prepareDeposit: input => exclusive(() => prepareDeposit(input)),
    depositWitness: () => exclusive(() => signNote('deposit')),
    prepareDepositIntent: input => exclusive(async () => {
      const r = ownerCopy(input); exactRecord(r, ['amount', 'validFrom', 'validUntil', 'exitRecipient']);
      uint(r.amount, true); uint(r.validFrom); uint(r.validUntil); hex(r.exitRecipient, 20);
      assert.ok(BigInt(r.validFrom) < BigInt(r.validUntil), 'FLAT_OWNER_INTENT_WINDOW');
      assert.ok(!record.data.operations.deposit, 'FLAT_OWNER_FUNDING_METHOD_FIXED');
      if (record.data.notes.source) {
        const a = op('deposit_intent');
        for (const name of ['amount', 'validFrom', 'validUntil']) assert.equal(a.statement[name], r[name], 'FLAT_OWNER_INTENT_FIXED');
        assert.equal(record.data.notes.source.recipient, r.exitRecipient, 'FLAT_OWNER_INTENT_FIXED');
        return publicOperation('deposit_intent');
      }
      const view = await read(); assert.ok(BigInt(view.raw.timestamp) < BigInt(r.validUntil), 'FLAT_OWNER_INTENT_EXPIRED');
      const note = newNote(id, r.amount, r.exitRecipient);
      const statement = { scope: id.domain.scope, policy: id.domain.policy, validFrom: r.validFrom,
        validUntil: r.validUntil, amount: r.amount, output: note.commitment };
      await save(state => {
        state.notes.source = note;
        state.operations.deposit_intent = { ...operation('deposit_intent', view.raw, statement,
          encodeDepositIntentInputs(statement)), proof: null };
      });
      return publicOperation('deposit_intent');
    }),
    // PRIVATE child-only job. The process has no IPC method for this witness.
    depositIntentProofJob: () => exclusive(async () => {
      let a = op('deposit_intent');
      if (a.proof) return detached({ proofResult: a.proof });
      assert.ok(!a.submission && !a.confirmation, 'FLAT_OWNER_INTENT_DELIVERY_LATCHED');
      assert.equal(record.data.notes.source.status, 'UNISSUED', 'FLAT_OWNER_INTENT_ALREADY_CREDITED');
      if (a.witness) return detached({ inputs: a.witness, statement: a.statement, publicInputs: a.publicInputs });
      assert.ok(['PREPARED', 'SIGNING'].includes(a.stage));
      const frame = depositIntentFrame(a.statement), intent = frame.toString('hex');
      if (a.stage === 'PREPARED') await save(state => {
        state.operations.deposit_intent.intent = intent; state.operations.deposit_intent.stage = 'SIGNING';
      });
      else assert.equal(a.intent, intent);
      a = op('deposit_intent'); const note = record.data.notes.source;
      const job = depositIntentWitness({ statement: a.statement, note: note.opening,
        signature: signature(keyFor(note), frame).toString('hex') });
      same(job.publicInputs, a.publicInputs);
      await save(state => { state.operations.deposit_intent.witness = ownerCopy(job.inputs);
        state.operations.deposit_intent.stage = 'AUTHORIZED'; });
      return detached(job);
    }),
    // Called only with the fixed owner proof worker's public result; synthetic
    // focused tests do not claim that injected proof bytes are valid proofs.
    retainDepositIntentProof: input => exclusive(async () => {
      const result = ownerCopy(input); exactRecord(result, ['proof', 'publicInputs', 'evidence']);
      const a = op('deposit_intent'); same(result.publicInputs, a.publicInputs);
      assert.ok(a.witness && a.intent, 'FLAT_OWNER_INTENT_NOT_AUTHORIZED');
      if (a.proof) { same(a.proof, result); return detached(a.proof); }
      assert.ok(!a.submission && !a.confirmation, 'FLAT_OWNER_INTENT_DELIVERY_LATCHED');
      await save(state => { state.operations.deposit_intent.proof = result; });
      return detached(op('deposit_intent').proof);
    }),
    // Explicit additional disclosure capability. Only the authenticated private
    // owner plane may request it. The process wraps the retained packet in a
    // deposit-scoped capability before giving it to the chosen prover; its only
    // additional action is latching this exact revision's EVM issue identity.
    createNativeClaimIngressHandoff: input => exclusive(async () => {
      const r = ownerCopy(input); exactRecord(r, ['claimDomain', 'ingressProverIdentity', 'statement']);
      hex(r.claimDomain); hex(r.ingressProverIdentity); encodeDepositIntentInputs(r.statement);
      const a = op('deposit_intent');
      if (a.nativeClaim) {
        assert.equal(a.nativeClaim.claimDomain, r.claimDomain, 'FLAT_OWNER_CLAIM_BINDING');
        assert.equal(a.nativeClaim.ingressProverIdentity, r.ingressProverIdentity, 'FLAT_OWNER_CLAIM_BINDING');
        // A retry of an already disclosed revision stays byte-identical even
        // after renewal. It cannot authorize another disclosure destination.
        for (const old of a.history) if (canonical(old.statement) === canonical(r.statement)) return detached(old.handoff);
      }
      same(a.statement, r.statement);
      if (a.nativeClaim?.handoff) return detached(a.nativeClaim.handoff);
      assert.ok(id.assetBinding, 'FLAT_OWNER_CLAIM_TOKEN_REQUIRED');
      assert.ok(a.proof, 'FLAT_OWNER_INTENT_PROOF_REQUIRED');
      assert.ok(!a.submission && !a.confirmation, 'FLAT_OWNER_INTENT_DELIVERY_LATCHED');
      assert.equal(record.data.notes.source.status, 'UNISSUED', 'FLAT_OWNER_INTENT_ALREADY_CREDITED');
      assert.ok(!record.data.authorization && !record.data.operations.withdraw_source, 'FLAT_OWNER_INTENT_ALREADY_USED');
      hex(record.data.notes.source.opening.secret);
      await save(state => {
        const active = state.operations.deposit_intent;
        active.nativeClaim ??= { version: 1, claimDomain: r.claimDomain, ingressProverIdentity: r.ingressProverIdentity,
          intentIdentitySHA256: claimIntentIdentity(id, r.claimDomain, active.statement), handoff: null };
        active.nativeClaim.handoff = claimHandoffPacket(state, active, active.history.length);
      });
      return detached(op('deposit_intent').nativeClaim.handoff);
    }),
    renewNativeClaimDepositIntent: input => exclusive(async () => {
      const r = ownerCopy(input); exactRecord(r, ['handoffIdentitySHA256', 'validFrom', 'validUntil']);
      hex(r.handoffIdentitySHA256); uint(r.validFrom); uint(r.validUntil);
      assert.ok(BigInt(r.validFrom) < BigInt(r.validUntil), 'FLAT_OWNER_INTENT_WINDOW');
      const a = op('deposit_intent'), binding = a.nativeClaim;
      assert.ok(binding, 'FLAT_OWNER_CLAIM_HANDOFF_REQUIRED');
      // The exact accepted renewal request is idempotent across a crash, even
      // before its new proof or handoff has been prepared.
      const previous = a.history.at(-1), accepted = a.history.findIndex(old => old.handoff.handoffIdentitySHA256 === r.handoffIdentitySHA256);
      if (accepted !== -1) {
        const statement = a.history[accepted + 1]?.statement ?? a.statement;
        assert.equal(statement.validFrom, r.validFrom, 'FLAT_OWNER_CLAIM_RENEWAL_FIXED');
        assert.equal(statement.validUntil, r.validUntil, 'FLAT_OWNER_CLAIM_RENEWAL_FIXED');
        return publicOperation('deposit_intent');
      }
      assert.ok(binding.handoff && a.proof, 'FLAT_OWNER_CLAIM_HANDOFF_REQUIRED');
      assert.equal(binding.handoff.handoffIdentitySHA256, r.handoffIdentitySHA256, 'FLAT_OWNER_CLAIM_BINDING');
      assert.ok(!a.confirmation && record.data.notes.source.status === 'UNISSUED', 'FLAT_OWNER_INTENT_ALREADY_CREDITED');
      assert.ok(!record.data.authorization && !record.data.operations.withdraw_source, 'FLAT_OWNER_INTENT_ALREADY_USED');
      assert.ok(BigInt(r.validUntil) > BigInt(a.statement.validUntil)
        && BigInt(r.validFrom) >= BigInt(a.statement.validFrom), 'FLAT_OWNER_CLAIM_RENEWAL_WINDOW');
      assert.ok(a.history.length < 32, 'FLAT_OWNER_RENEWAL_LIMIT');
      assert.ok(typeof deps.observer.readNativeClaimIntent === 'function', 'FLAT_OWNER_CLAIM_OBSERVER_REQUIRED');
      const query = claimIntentQuery(record.data, a, binding.handoff, a.submission);
      const { observation, view } = validateClaimRenewalObservation(await deps.observer.readNativeClaimIntent(detached(query)), query, id);
      if (previous) assert.ok(uint(observation.intent.revision) > uint(previous.canonicalIntent.intent.revision),
        'FLAT_OWNER_CLAIM_CANONICAL_REVISION');
      assert.ok(BigInt(view.raw.timestamp) < BigInt(r.validUntil), 'FLAT_OWNER_INTENT_EXPIRED');
      await save(state => {
        const active = state.operations.deposit_intent;
        active.history.push({ before: active.before, statement: active.statement, publicInputs: active.publicInputs,
          intent: active.intent, witness: active.witness, proof: active.proof, handoff: active.nativeClaim.handoff,
          submission: active.submission, canonicalIntent: observation });
        active.statement = { ...active.statement, validFrom: r.validFrom, validUntil: r.validUntil };
        active.publicInputs = encodeDepositIntentInputs(active.statement); active.before = view.raw;
        active.intent = null; active.witness = null; active.proof = null; active.submission = null;
        active.nativeClaim.handoff = null; active.stage = 'PREPARED';
      });
      return publicOperation('deposit_intent');
    }),
    bindNativeClaimIssuance: input => exclusive(async () => {
      const r = ownerCopy(input); exactRecord(r, ['handoffIdentitySHA256', 'transactionHash', 'calldataSHA256']);
      hex(r.handoffIdentitySHA256); hex(r.transactionHash); hex(r.calldataSHA256);
      const a = op('deposit_intent'); assert.ok(a.nativeClaim?.handoff && a.proof, 'FLAT_OWNER_CLAIM_HANDOFF_REQUIRED');
      assert.equal(a.nativeClaim.handoff.handoffIdentitySHA256, r.handoffIdentitySHA256, 'FLAT_OWNER_CLAIM_BINDING');
      const submission = { transactionHash: r.transactionHash, calldataSHA256: r.calldataSHA256 };
      if (a.submission) { same(a.submission, submission); return publicOperation('deposit_intent'); }
      assert.ok(!a.confirmation && record.data.notes.source.status === 'UNISSUED', 'FLAT_OWNER_INTENT_ALREADY_CREDITED');
      await save(state => { state.operations.deposit_intent.submission = submission; state.operations.deposit_intent.stage = 'SUBMITTING'; });
      return publicOperation('deposit_intent');
    }),
    bindDepositIntentDelivery: input => exclusive(async () => {
      const r = ownerCopy(input); exactRecord(r, ['transactionHash', 'calldataSHA256']);
      hex(r.transactionHash); hex(r.calldataSHA256); const a = op('deposit_intent');
      assert.ok(a.proof, 'FLAT_OWNER_INTENT_PROOF_REQUIRED');
      if (a.submission) { same(a.submission, r); return publicOperation('deposit_intent'); }
      assert.ok(!a.confirmation && record.data.notes.source.status === 'UNISSUED', 'FLAT_OWNER_INTENT_ALREADY_CREDITED');
      await save(state => { state.operations.deposit_intent.submission = r; state.operations.deposit_intent.stage = 'SUBMITTING'; });
      return publicOperation('deposit_intent');
    }),
    reconcileDepositIntent: input => exclusive(async () => {
      const r = ownerCopy(input); exactRecord(r, ['transactionHash', 'calldataSHA256']);
      hex(r.transactionHash); hex(r.calldataSHA256); const a = op('deposit_intent');
      assert.ok(a.proof, 'FLAT_OWNER_INTENT_PROOF_REQUIRED');
      if (a.submission) same(a.submission, r);
      assert.equal(typeof deps.observer.readDepositIntentDelivery, 'function', 'FLAT_OWNER_DELIVERY_OBSERVER_REQUIRED');
      const observed = await deps.observer.readDepositIntentDelivery({ identitySHA256: ownerDigest(id),
        ...r, publicInputs: a.publicInputs });
      if (observed === null) {
        if (a.stage === 'SUBMITTING') await save(state => { state.operations.deposit_intent.stage = 'UNKNOWN'; });
        return publicOperation('deposit_intent');
      }
      const confirmation = validateFlatOwnerDepositIntentTransition(observed, a, record.data, r);
      if (a.confirmation) { same(a.confirmation, confirmation); return publicOperation('deposit_intent'); }
      assert.equal(record.data.notes.source.status, 'UNISSUED', 'FLAT_OWNER_INTENT_ALREADY_CREDITED');
      assert.ok(!record.data.operations.withdraw_source && !record.data.authorization, 'FLAT_OWNER_INTENT_ALREADY_USED');
      await save(state => {
        state.operations.deposit_intent.submission = r; state.operations.deposit_intent.confirmation = confirmation;
        state.operations.deposit_intent.stage = 'CONFIRMED'; state.notes.source.status = 'AVAILABLE';
      });
      return publicOperation('deposit_intent');
    }),
    prepareAuthorization: input => exclusive(async () => {
      requireAuthorizationOpen();
      const r = ownerCopy(input); exactRecord(r, ['nativeConfig', 'changeRecipient', 'recoveryRecipient']);
      hex(r.changeRecipient, 20); hex(r.recoveryRecipient, 20);
      if (record.data.authorization) { same(record.data.authorization.request, r); return { prepared: true }; }
      const source = record.data.notes.source; assert.equal(source?.status, 'AVAILABLE', 'FLAT_OWNER_SOURCE_UNAVAILABLE');
      const view = await read(); pathFor(view, source);
      for (const key of ['scope', 'policy', 'asset', 'hubDomain', 'registryCommitment'])
        assert.equal(r.nativeConfig[key], id.domain[key], 'FLAT_OWNER_NATIVE_DOMAIN');
      const preparation = createGenericBalanceNativePreparation(r.nativeConfig), terms = genericBalanceNativeTerms(preparation);
      assert.ok(BigInt(view.raw.timestamp) < BigInt(terms.fundingValidUntil), 'FLAT_OWNER_EXPIRED');
      const delta = BigInt(source.opening.value) - BigInt(terms.budget); assert.ok(delta >= 0n);
      const change = delta ? newNote(id, String(delta), r.changeRecipient) : null;
      const recovery = newNote(id, terms.budget, r.recoveryRecipient);
      await save(state => { state.notes.source.status = 'LOCKED'; state.notes.change = change; state.notes.recovery = recovery;
        state.authorization = { request: r, preparation, nonces: { reservationNonce: fresh(), reserveSecret: fresh(),
          graphNonce: fresh(), paddingSalts: Array.from({ length: 4 }, fresh) }, joinBlinds: Array.from({ length: 4 }, fresh),
          leafBlinds: Array.from({ length: 16 }, fresh), invoiceSignatures: null, signed: null, envelope: null }; });
      return { prepared: true };
    }),
    invoiceRequests: () => exclusive(async () => {
      requireAuthorizationOpen();
      assert.ok(record.data.authorization); const requests = fundedSigningRequests(compile(record.data)).invoices
        .map(value => ({ ...value, message: value.message.toString('hex') }));
      return detached(genericBalanceNativeInvoiceRequests(record.data.authorization.preparation, requests));
    }),
    authorize: input => exclusive(async () => {
      requireAuthorizationOpen();
      const r = ownerCopy(input); exactRecord(r, ['invoiceSignatures']); let a = record.data.authorization; assert.ok(a);
      // attachFundedSignatures verifies all recipient signatures before any
      // signed result or envelope can leave. The signature intent is durable.
      const invoiceRequests = fundedSigningRequests(compile(record.data)).invoices;
      assert.ok(Array.isArray(r.invoiceSignatures) && r.invoiceSignatures.length === invoiceRequests.length, 'FLAT_OWNER_INVOICE_COUNT');
      invoiceRequests.forEach((request, index) => {
        const value = hex(r.invoiceSignatures[index], 64);
        const s = BigInt('0x' + value.slice(64));
        assert.ok(s > 0n && s <= 0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0n, 'FLAT_OWNER_LOW_S');
        const publicKey = createPublicKey({ format: 'jwk', key: { kty: 'EC', crv: 'secp256k1',
          x: Buffer.from(request.x, 'hex').toString('base64url'), y: Buffer.from(request.y, 'hex').toString('base64url') } });
        assert.ok(verify('sha256', request.message, { key: publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(value, 'hex')),
          'FLAT_OWNER_RECIPIENT_SIGNATURE');
      });
      if (a.invoiceSignatures !== null) same(a.invoiceSignatures, r.invoiceSignatures);
      else await save(state => { state.authorization.invoiceSignatures = r.invoiceSignatures; });
      a = record.data.authorization;
      if (!a.signed) {
        const compiled = compile(record.data), requests = fundedSigningRequests(compiled);
        const signed = attachFundedSignatures(compiled, { ownerSignature: signature(keyFor(record.data.notes.source), requests.owner.message).toString('hex'),
          invoiceSignatures: a.invoiceSignatures });
        await save(state => { state.authorization.signed = signed; });
      }
      a = record.data.authorization;
      if (!a.envelope) {
        const envelope = await deps.withHashFields(async hashFields => {
          assert.equal(await createCommitmentCodec({ hashFields }).domainCommitment(id.domain), id.domainCommitment, 'FLAT_OWNER_DOMAIN_COMMITMENT');
          const cap = await buildAuthorizedEnvelope({ signed: a.signed, domain: id.domain,
            capsuleOptions: { nodes: a.preparation.nodes.map(({ id, action, receiptSpendSecret }) => ({ id, action, receiptSpendSecret })),
              slotSalts: a.preparation.slotSalts }, joinBlinds: a.joinBlinds, leafBlinds: a.leafBlinds }, { hashFields });
          try { return { publicStatement: cap.publicStatement(), ownerInputs: cap.ownerAuthorizationInputs(),
            reservation: cap.reservation().select(), recovery: cap.recovery().select(), assembler: cap.assembler().select(),
            local: Array.from({ length: 4 }, (_, i) => cap.local(i).select()),
            dependency: Array.from({ length: 4 }, (_, i) => cap.dependency(i).select()) }; }
          finally { cap.destroy(); }
        });
        await save(state => { state.authorization.envelope = envelope; });
      }
      return detached(record.data.authorization.envelope.publicStatement);
    }),
    ownerProofJob: () => exclusive(async () => { requireAuthorizationOpen(); const e = record.data.authorization?.envelope; assert.ok(e, 'FLAT_OWNER_NOT_AUTHORIZED');
      return detached({ inputs: e.ownerInputs, statement: e.publicStatement, publicInputs: encodeStatement('authorization', e.publicStatement) }); }),
    selectRole: input => exclusive(async () => {
      const r = ownerCopy(input), indexed = ['local', 'dependency'].includes(r.role);
      exactRecord(r, indexed ? ['role', 'slot'] : ['role']); assert.ok(['reservation', 'recovery', 'assembler', 'local', 'dependency'].includes(r.role));
      // An emitted U/S cannot be revoked locally. If that exact reservation
      // wins the source-NF race, only its retained recovery opening may leave.
      if (sourceExitChosen()) assert.ok(r.role === 'recovery' && record.data.operations.reservation?.stage === 'CONFIRMED'
        && record.data.notes.source.status === 'SPENT', 'FLAT_OWNER_SOURCE_EXIT_CHOSEN');
      if (indexed) assert.ok(Number.isSafeInteger(r.slot) && r.slot >= 0 && r.slot < 4 && !Object.is(r.slot, -0));
      const e = record.data.authorization?.envelope; assert.ok(e, 'FLAT_OWNER_NOT_AUTHORIZED');
      return detached(indexed ? e[r.role][r.slot] : e[r.role]);
    }),
    prepareWithdrawal: input => exclusive(() => prepareWithdrawal(input)),
    withdrawalWitness: input => exclusive(async () => { const r = ownerCopy(input); exactRecord(r, ['role']); return signNote('withdraw_' + role(r.role)); }),
    renewEpoch: input => exclusive(() => renewEpoch(input)),
    reauthorizeNativeNotePreparation: input => {
      throw Error('NATIVE_VALUE_MANUAL_REAUTHORIZATION_NOT_RELEASED');
      exactRecord(input, ['authorization']); validateNativeValueManualReauthorization(input.authorization);
      const authorization = ownerCopy(input.authorization);
      return exclusive(async () => {
        const entry = manualRecords().find(entry => entry.review.request.requestId === authorization.request.requestId);
        assert.ok(entry && entry.ownerState === 'PREPARED', 'FLAT_OWNER_MANUAL_ORIGINAL_ONLY');
        const previous = currentNativeValueManualAuthorization(entry);
        same(entry.review.request, authorization.request);
        for (const key of ['ownerIdentitySHA256', 'accountIdentitySHA256', 'amount', 'recipient', 'role'])
          assert.equal(authorization[key], entry.review[key], 'FLAT_OWNER_MANUAL_REAUTHORIZATION_BINDING');
        assert.equal(authorization.previousAuthorizationSHA256, ownerDigest(previous));
        assert.equal(authorization.revision, (entry.reauthorizations?.length ?? 0) + 1);
        assert.equal(authorization.priorEpoch, previous.epoch);
        const prepared = op(entry.review.ownerKind);
        assert.equal(prepared.epoch, previous.epoch); assert.equal(prepared.submission, null);
        // The linked authority/keeper establish their own no-dispatch provenance.
        // This private owner method authenticates only original custody state;
        // caller data is never accepted as an authority no-effect certificate.
        return renewEpoch({ kind: entry.review.ownerKind, epoch: authorization.epoch }, authorization);
      });
    },
    bindSubmission: input => exclusive(async () => {
      const r = ownerCopy(input); exactRecord(r, ['kind', 'calldata']); assert.ok(KINDS.includes(r.kind));
      assert.notEqual(r.kind, 'deposit_intent', 'FLAT_OWNER_INTENT_DELIVERY_METHOD_REQUIRED');
      if (r.kind === 'reservation') requireAuthorizationOpen();
      const decoded = decodeFlatOwnerCalldata(artifact, r.calldata);
      assert.equal(decoded.kind, r.kind.startsWith('withdraw_') ? 'withdrawal' : r.kind);
      const existing = record.data.operations[r.kind];
      if (existing?.submission) { assert.equal(existing.submission.calldata, r.calldata); return publicOperation(r.kind); }
      assert.ok(!existing?.confirmation, 'FLAT_OWNER_ALREADY_CONFIRMED');
      const view = await read(); let prepared = existing;
      if (r.kind === 'reservation') {
        assert.ok(record.data.authorization?.envelope); const a = record.data.authorization.signed.authorizationStatement;
        pathFor(view, record.data.notes.source);
        const statement = { domainCommitment: id.domainCommitment, envelope: record.data.authorization.envelope.publicStatement.envelope,
          inputRoot: view.publicState.root.slice(2), inputNullifier: a.inputNullifier, reserveCommitment: a.reserveCommitment,
          changeCommitment: a.changeCommitment, admissionTag: record.data.authorization.signed.admissionTag,
          fundingNotBefore: a.fundingNotBefore, fundingValidUntil: a.fundingValidUntil };
        same(decoded.authorizationInputs, encodeStatement('authorization', record.data.authorization.envelope.publicStatement));
        const projection = reserveProjection(view, '0x' + a.reserveCommitment, '0x' + a.changeCommitment);
        same(decoded.guards, { expectedSequence: projection.expectedSequence, expectedPostRoot: projection.expectedPostRoot });
        assert.ok(BigInt(view.raw.timestamp) >= BigInt(a.fundingNotBefore) && BigInt(view.raw.timestamp) < BigInt(a.fundingValidUntil));
        prepared = operation(r.kind, view.raw, statement, encodeStatement(r.kind, statement)); prepared.stage = 'AUTHORIZED';
      } else if (r.kind === 'recovery') {
        assert.equal(op('reservation').stage, 'CONFIRMED'); const a = record.data.authorization.signed.authorizationStatement;
        const statement = decodeStatement('recovery', decoded.publicInputs);
        for (const [key, value] of Object.entries({ domainCommitment: id.domainCommitment, reserveNullifier: a.reserveNullifier,
          recoveryCommitment: a.recoveryCommitment, settleBefore: a.settleBefore })) assert.equal(statement[key], value);
        assert.ok(BigInt(view.raw.timestamp) >= BigInt(a.settleBefore));
        assert.ok(view.roots.includes('0x' + statement.poolRoot) && view.commitments.includes('0x' + a.reserveCommitment)
          && !view.nullifiers.includes('0x' + a.reserveNullifier));
        prepared = operation(r.kind, view.raw, statement, decoded.publicInputs); prepared.stage = 'AUTHORIZED';
      } else {
        assert.equal(prepared?.stage, 'AUTHORIZED'); assert.equal(BigInt(view.raw.timestamp) / 600n, BigInt(prepared.epoch), 'FLAT_OWNER_EPOCH_EXPIRED');
        if (r.kind === 'deposit') assert.ok(!view.commitments.includes('0x' + record.data.notes.source.commitment));
        else pathFor(view, record.data.notes[role(r.kind.slice(9))]);
      }
      same(decoded.publicInputs, prepared.publicInputs);
      const submission = { calldata: r.calldata, calldataSHA256: createHash('sha256').update(Buffer.from(r.calldata.slice(2), 'hex')).digest('hex'), transactionHash: null };
      await save(state => { state.operations[r.kind] = ownerCopy(prepared); state.operations[r.kind].stage = 'SUBMITTING'; state.operations[r.kind].submission = submission; });
      return { ...publicOperation(r.kind), dispatchAllowed: true };
    }),
    acknowledgeSubmitted: input => exclusive(async () => {
      const r = ownerCopy(input); exactRecord(r, ['kind', 'transactionHash']); hex(r.transactionHash); const a = op(r.kind); assert.ok(a.submission);
      if (a.submission.transactionHash) assert.equal(a.submission.transactionHash, r.transactionHash);
      else await save(state => { state.operations[r.kind].submission.transactionHash = r.transactionHash; }); return publicOperation(r.kind);
    }),
    reconcileCompetingReservation: input => exclusive(async () => {
      const r = ownerCopy(input); exactRecord(r, ['transactionHash', 'calldataSHA256']); hex(r.transactionHash); hex(r.calldataSHA256);
      assert.ok(sourceExitChosen() && record.data.authorization?.envelope, 'FLAT_OWNER_SOURCE_EXIT_REQUIRED');
      const observed = await deps.observer.readTransaction({ kind: 'reservation', identitySHA256: ownerDigest(id), ...r });
      assert.ok(observed, 'FLAT_OWNER_COMPETING_RESERVATION_UNOBSERVED');
      const decoded = decodeFlatOwnerCalldata(artifact, observed.transaction.calldata); assert.equal(decoded.kind, 'reservation');
      assert.equal(observed.transaction.hash, r.transactionHash);
      assert.equal(createHash('sha256').update(Buffer.from(observed.transaction.calldata.slice(2), 'hex')).digest('hex'), r.calldataSHA256);
      const view = flatOwnerSnapshot(observed.before, id), a = record.data.authorization.signed.authorizationStatement;
      pathFor(view, record.data.notes.source);
      const statement = { domainCommitment: id.domainCommitment, envelope: record.data.authorization.envelope.publicStatement.envelope,
        inputRoot: view.publicState.root.slice(2), inputNullifier: a.inputNullifier, reserveCommitment: a.reserveCommitment,
        changeCommitment: a.changeCommitment, admissionTag: record.data.authorization.signed.admissionTag,
        fundingNotBefore: a.fundingNotBefore, fundingValidUntil: a.fundingValidUntil };
      same(decoded.publicInputs, encodeStatement('reservation', statement));
      same(decoded.authorizationInputs, encodeStatement('authorization', record.data.authorization.envelope.publicStatement));
      const candidate = operation('reservation', view.raw, statement, decoded.publicInputs);
      candidate.submission = { calldata: observed.transaction.calldata, calldataSHA256: r.calldataSHA256, transactionHash: r.transactionHash };
      const confirmation = validateFlatOwnerTransition(observed, candidate, record.data, artifact);
      if (record.data.operations.reservation) {
        assert.equal(op('reservation').stage, 'CONFIRMED'); same(op('reservation').confirmation, confirmation);
      } else {
        // Preserve the withdrawal operation and any submitted/unknown latch.
        // This is observation of the competing spend, never a send permission.
        assert.equal(record.data.notes.source.status, 'LOCKED');
        await save(state => { candidate.stage = 'CONFIRMED'; candidate.confirmation = confirmation;
          state.operations.reservation = candidate; state.notes.source.status = 'SPENT';
          if (state.notes.change) state.notes.change.status = 'AVAILABLE'; });
      }
      return { ...publicOperation('reservation'), sourceExit: 'RESERVATION_WON' };
    }),
    reconcileRecovery: input => exclusive(async () => {
      const r = ownerCopy(input); exactRecord(r, ['transactionHash', 'calldataSHA256']); hex(r.transactionHash); hex(r.calldataSHA256);
      const reservation = record.data.operations.reservation;
      assert.ok(reservation?.stage === 'CONFIRMED' && reservation.confirmation && reservation.submission
        && record.data.notes.source?.status === 'SPENT', 'FLAT_OWNER_RECOVERY_SOURCE_UNCONFIRMED');
      const previous = record.data.operations.recovery;
      if (previous?.confirmation) {
        assert.equal(previous.confirmation.transactionHash, r.transactionHash, 'FLAT_OWNER_RECOVERY_REUSE');
        assert.equal(previous.confirmation.calldataSHA256, r.calldataSHA256, 'FLAT_OWNER_RECOVERY_REUSE');
      }
      // Re-read the original S from this owned runtime's journal. An old stage
      // label or a currently present reserve leaf is not source provenance.
      const source = await deps.observer.readTransaction({ kind: 'reservation', identitySHA256: ownerDigest(id),
        transactionHash: reservation.confirmation.transactionHash, calldataSHA256: reservation.submission.calldataSHA256 });
      assert.ok(source, 'FLAT_OWNER_RECOVERY_SOURCE_UNOBSERVED');
      same(validateFlatOwnerTransition(source, reservation, record.data, artifact), reservation.confirmation);
      const observed = await deps.observer.readTransaction({ kind: 'recovery', identitySHA256: ownerDigest(id), ...r });
      assert.ok(observed, 'FLAT_OWNER_RECOVERY_UNOBSERVED');
      const decoded = decodeFlatOwnerCalldata(artifact, observed.transaction.calldata);
      assert.equal(decoded.kind, 'recovery', 'FLAT_OWNER_RECOVERY_METHOD');
      const statement = decodeStatement('recovery', decoded.publicInputs), original = record.data.authorization.signed.authorizationStatement;
      const note = record.data.notes.recovery;
      assert.equal(note.commitment, original.recoveryCommitment, 'FLAT_OWNER_RECOVERY_NOTE');
      assert.equal(note.opening.value, genericBalanceNativeTerms(record.data.authorization.preparation).budget, 'FLAT_OWNER_RECOVERY_NOTE');
      const before = flatOwnerSnapshot(observed.before, id), funded = flatOwnerSnapshot(source.after, id);
      for (const field of ['commitments', 'nullifiers', 'roots']) same(before[field].slice(0, funded[field].length), funded[field]);
      assert.ok(BigInt(before.publicState.sequence) >= BigInt(funded.publicState.sequence)
        && BigInt(before.raw.timestamp) >= BigInt(funded.raw.timestamp), 'FLAT_OWNER_RECOVERY_SOURCE_HISTORY');
      assert.ok(before.roots.indexOf('0x' + statement.poolRoot) >= funded.roots.length - 1, 'FLAT_OWNER_RECOVERY_ACCEPTED_ROOT');
      const inclusion = { calldata: observed.transaction.calldata, ...r };
      const candidate = previous ?? operation('recovery', before.raw, statement, decoded.publicInputs);
      same(candidate.publicInputs, decoded.publicInputs); same(candidate.statement, statement);
      if (candidate.submission) {
        assert.equal(candidate.submission.calldata, inclusion.calldata, 'FLAT_OWNER_RECOVERY_REUSE');
        assert.equal(candidate.submission.calldataSHA256, r.calldataSHA256, 'FLAT_OWNER_RECOVERY_REUSE');
        if (candidate.submission.transactionHash) assert.equal(candidate.submission.transactionHash, r.transactionHash, 'FLAT_OWNER_RECOVERY_REUSE');
      }
      const confirmation = validateFlatOwnerTransition(observed, candidate, record.data, artifact, inclusion);
      if (previous?.confirmation) same(previous.confirmation, confirmation);
      else {
        assert.equal(note.status, 'UNISSUED', 'FLAT_OWNER_RECOVERY_ALREADY_CREDITED');
        assert.ok(!record.data.operations.withdraw_recovery, 'FLAT_OWNER_RECOVERY_WITHDRAWAL_EXISTS');
        await save(state => {
          // This is an observed credit, not a dispatch authorization. Preserve
          // an existing exact latch; a detached F gets no synthetic submission.
          state.operations.recovery = { ...ownerCopy(candidate), stage: 'CONFIRMED', confirmation };
          state.notes.recovery.status = 'AVAILABLE';
        });
      }
      return publicOperation('recovery');
    }),
    reconcile: input => exclusive(async () => {
      const r = ownerCopy(input); exactRecord(r, ['kind']); const a = op(r.kind); assert.ok(a.submission);
      assert.notEqual(r.kind, 'deposit_intent', 'FLAT_OWNER_INTENT_DELIVERY_METHOD_REQUIRED');
      const observation = await deps.observer.readTransaction({ kind: r.kind, identitySHA256: ownerDigest(id),
        transactionHash: a.submission.transactionHash, calldataSHA256: a.submission.calldataSHA256 });
      if (observation === null) { if (a.stage === 'SUBMITTING') await save(state => { state.operations[r.kind].stage = 'UNKNOWN'; }); return publicOperation(r.kind); }
      const confirmation = validateFlatOwnerTransition(observation, a, record.data, artifact);
      if (a.confirmation) { same(a.confirmation, confirmation); return publicOperation(r.kind); }
      await save(state => { const o = state.operations[r.kind]; o.confirmation = confirmation; o.stage = 'CONFIRMED';
        if (r.kind === 'deposit') state.notes.source.status = 'AVAILABLE';
        else if (r.kind === 'reservation') { state.notes.source.status = 'SPENT'; if (state.notes.change) state.notes.change.status = 'AVAILABLE'; }
        else if (r.kind === 'recovery') state.notes.recovery.status = 'AVAILABLE';
        else state.notes[role(r.kind.slice(9))].status = 'WITHDRAWN'; }); return publicOperation(r.kind);
    }),
    close() { assert.ok(!busy, 'FLAT_OWNER_BUSY'); closed = true; password = null; record = null; return { closed: true }; },
  };
  return Object.freeze(methods);
}

/** PURE typed-ledger validation only. This accepts explicit synthetic records
 * in focused tests; production must use the privately branded owned observer.
 * It neither invents an intermediate router balance nor accepts a substitute
 * pool call supplied by a caller. Source PAEG settlement/recovery is irrelevant
 * to destination ownership once this exact atomic delivery was observed. */
export function validateFlatOwnerDepositIntentTransition(input, op, state, inclusion = op.submission) {
  if (input?.kind === FLAT_OWNER_NATIVE_CLAIM_ISSUE) return validateFlatOwnerNativeClaimTransition(input, op, state, inclusion);
  const o = ownerCopy(input), id = flatOwnerIdentity(state.identity);
  assert.equal(op.kind, 'deposit_intent'); assert.ok(id.assetBinding, 'FLAT_OWNER_DELIVERY_TOKEN_REQUIRED');
  assert.ok(op.proof && inclusion, 'FLAT_OWNER_INTENT_PROOF_REQUIRED');
  exactRecord(inclusion, ['transactionHash', 'calldataSHA256']); hex(inclusion.transactionHash); hex(inclusion.calldataSHA256);
  exactRecord(o, ['identitySHA256', 'transaction', 'receipt', 'before', 'after', 'stateAdvanced',
    'delivery', 'deliveryEvent', 'assetObservation']);
  assert.equal(o.identitySHA256, ownerDigest(id));
  exactRecord(o.transaction, ['hash', 'from', 'to', 'value', 'calldata']);
  exactRecord(o.receipt, ['transactionHash', 'blockHash', 'status']);
  exactRecord(o.delivery, ['descriptor', 'descriptorCommitment', 'receiptKeyCommitment', 'publicInputs']);
  const tx = o.transaction, d = o.delivery;
  hex(tx.hash); hex(tx.from, 20); hex(tx.to, 20); assert.equal(tx.value, '0', 'FLAT_OWNER_NATIVE_VALUE');
  assert.equal(tx.hash, inclusion.transactionHash, 'FLAT_OWNER_DELIVERY_TRANSACTION');
  assert.equal(calldataDigest(tx.calldata), inclusion.calldataSHA256, 'FLAT_OWNER_CALLDATA_DIGEST');
  assert.equal(o.receipt.status, 1); assert.equal(o.receipt.transactionHash, tx.hash);
  const call = decodeEvmVaultDeliveryCall(tx.calldata, d.descriptor.identity);
  same(call.descriptor, d.descriptor);
  assert.equal(call.receiptKeyCommitment, d.receiptKeyCommitment);
  assert.equal(call.descriptorCommitment, d.descriptorCommitment);
  assert.equal(call.proof, op.proof.proof, 'FLAT_OWNER_DELIVERY_PROOF');
  const route = call.descriptor.route, identity = call.descriptor.identity;
  for (const [field, value] of Object.entries({ targetPool: id.pool, targetDomain: id.domainCommitment,
    targetScope: id.domain.scope, targetPolicy: id.domain.policy, ledgerNamespace: id.domain.ledgerNamespace,
    shareIdentity: id.domain.asset, vault: id.assetBinding.token, router: tx.to, solver: tx.from })) {
    assert.equal(identity[field], value, 'FLAT_OWNER_DELIVERY_IDENTITY');
  }
  const publicInputs = call.descriptor.publicInputs.map(word => BigInt('0x' + word).toString());
  same(publicInputs, d.publicInputs); same(publicInputs, op.publicInputs);
  same(decodeDepositIntentInputs(publicInputs), op.statement);
  assert.equal(op.statement.output, state.notes.source.commitment, 'FLAT_OWNER_INTENT_NOTE');
  assert.equal(op.statement.amount, state.notes.source.opening.value, 'FLAT_OWNER_INTENT_NOTE');
  assert.equal(route.shareAmount, op.statement.amount);
  const before = flatOwnerSnapshot(o.before, id), after = flatOwnerSnapshot(o.after, id);
  const b = before.publicState, a = after.publicState, q = uint(op.statement.amount, true);
  assert.equal(o.receipt.blockHash, after.raw.blockHash);
  assert.ok(BigInt(after.raw.timestamp) >= BigInt(before.raw.timestamp), 'FLAT_OWNER_TRANSACTION_TIME');
  for (const [from, until] of [[op.statement.validFrom, op.statement.validUntil], [route.executionFrom, route.executionUntil]])
    assert.ok(BigInt(after.raw.timestamp) >= BigInt(from) && BigInt(after.raw.timestamp) < BigInt(until), 'FLAT_OWNER_INTENT_EXPIRED');
  assert.equal(BigInt(a.sequence), BigInt(b.sequence) + 1n);
  assert.ok(!before.commitments.includes('0x' + op.statement.output), 'FLAT_OWNER_INTENT_ALREADY_INSERTED');
  same(after.commitments, [...before.commitments, '0x' + op.statement.output]);
  same(after.nullifiers, before.nullifiers); same(after.roots, [...before.roots, a.root]);
  assert.equal(a.leaves, b.leaves + 1); assert.equal(a.spent, b.spent); assert.equal(a.spentDigest, b.spentDigest);
  assert.equal(a.liveReservations, b.liveReservations); assert.equal(a.outputCapacity, b.outputCapacity + 1);
  for (const name of ['backedAmount', 'actualAssetBalance']) assert.equal(BigInt(a[name]), BigInt(b[name]) + q);
  for (const name of ['surplus', 'unrelatedNative']) assert.equal(a[name], b[name]);
  same(o.stateAdvanced, { address: id.pool, transactionHash: tx.hash, blockHash: o.receipt.blockHash, sequence: a.sequence,
    root: a.root, spent: a.spentDigest, leaves: a.leaves, consumed: a.spent });
  same(o.deliveryEvent, { address: identity.router, transactionHash: tx.hash, blockHash: o.receipt.blockHash,
    position: 0, ledgerNamespace: identity.ledgerNamespace, receiptKeyCommitment: d.receiptKeyCommitment,
    descriptorCommitment: d.descriptorCommitment, outputCommitment: op.statement.output, shareAmount: op.statement.amount });
  const movement = o.assetObservation;
  exactRecord(movement, ['kind', 'token', 'codeHash', 'pool', 'underlyingToken', 'underlyingCodeSHA256',
    'vault', 'router', 'solver', 'underlyingAmount', 'shareAmount', 'before', 'after']);
  for (const [field, value] of Object.entries({ kind: 'EVM_VAULT_DELIVERY', token: id.assetBinding.token,
    codeHash: id.assetBinding.codeHash, pool: id.pool, underlyingToken: identity.asset,
    underlyingCodeSHA256: identity.assetCodeSHA256, vault: identity.vault, router: identity.router, solver: identity.solver,
    underlyingAmount: route.assetAmount, shareAmount: route.shareAmount })) assert.equal(movement[field], value, 'FLAT_OWNER_DELIVERY_ASSET');
  const balanceFields = ['poolBalance', 'shareTotalSupply', 'vaultUnderlyingBalance', 'solverUnderlyingBalance',
    'routerUnderlyingBalance', 'routerShareBalance'];
  for (const [phase, snapshot] of [['before', before], ['after', after]]) {
    exactRecord(movement[phase], ['blockHash', ...balanceFields]);
    assert.equal(movement[phase].blockHash, snapshot.raw.blockHash, 'FLAT_OWNER_DELIVERY_ASSET_BLOCK');
    balanceFields.forEach(field => assetBalance(movement[phase][field]));
    assert.equal(movement[phase].poolBalance, snapshot.publicState.actualAssetBalance, 'FLAT_OWNER_ASSET_BACKING');
  }
  const amount = BigInt(route.assetAmount);
  for (const [field, delta] of Object.entries({ poolBalance: q, shareTotalSupply: q, vaultUnderlyingBalance: amount,
    solverUnderlyingBalance: -amount, routerUnderlyingBalance: 0n, routerShareBalance: 0n })) {
    assert.equal(BigInt(movement.after[field]), BigInt(movement.before[field]) + delta, 'FLAT_OWNER_DELIVERY_ASSET_DELTA');
  }
  return { transactionHash: tx.hash, blockHash: o.receipt.blockHash, postRoot: a.root, postSequence: a.sequence,
    calldataSHA256: inclusion.calldataSHA256, trust: FLAT_OWNER_OBSERVATION_TRUST,
    assetObservationSHA256: ownerDigest(movement), observationSHA256: ownerDigest(o),
    descriptorCommitment: d.descriptorCommitment, receiptKeyCommitment: d.receiptKeyCommitment };
}

export function validateFlatOwnerTransition(input, op, state, artifact, inclusion = op.submission) {
  assert.notEqual(op.kind, 'deposit_intent', 'FLAT_OWNER_INTENT_DELIVERY_METHOD_REQUIRED');
  const o = ownerCopy(input), id = flatOwnerIdentity(state.identity), withdrawal = op.kind.startsWith('withdraw_');
  const token = Object.hasOwn(id, 'assetBinding');
  exactRecord(o, ['identitySHA256', 'transaction', 'receipt', 'before', 'after', 'stateAdvanced',
    ...(op.kind === 'recovery' ? ['recoveryRoots'] : []), ...(withdrawal ? ['withdrawal'] : []),
    ...(token ? ['assetObservation'] : [])]);
  assert.equal(o.identitySHA256, ownerDigest(id));
  exactRecord(o.transaction, ['hash', 'to', 'value', 'calldata', ...(token ? ['from'] : [])]);
  exactRecord(o.receipt, ['transactionHash', 'blockHash', 'status']);
  assert.ok(inclusion, 'FLAT_OWNER_INCLUSION_REQUIRED');
  const tx = o.transaction; hex(tx.hash); assert.equal(tx.to, id.pool); assert.equal(tx.calldata, inclusion.calldata);
  assert.equal(calldataDigest(tx.calldata), inclusion.calldataSHA256, 'FLAT_OWNER_CALLDATA_DIGEST');
  assert.equal(tx.value, op.kind === 'deposit' && !token ? op.statement.amount : '0', 'FLAT_OWNER_NATIVE_VALUE');
  if (token) hex(tx.from, 20);
  if (inclusion.transactionHash) assert.equal(tx.hash, inclusion.transactionHash);
  assert.equal(o.receipt.status, 1); assert.equal(o.receipt.transactionHash, tx.hash);
  const decoded = decodeFlatOwnerCalldata(artifact, tx.calldata);
  assert.equal(decoded.kind, withdrawal ? 'withdrawal' : op.kind); same(decoded.publicInputs, op.publicInputs);
  if (op.kind === 'deposit' || withdrawal) {
    assert.equal(op.statement.scope, id.domain.scope, 'FLAT_OWNER_NOTE_SCOPE');
    assert.equal(op.statement.policy, id.domain.policy, 'FLAT_OWNER_NOTE_POLICY');
    same(decoded.publicInputs, encodeWalletPoolInputs(withdrawal ? 'withdraw_balance' : 'deposit_balance', op.statement));
  }
  const before = flatOwnerSnapshot(o.before, id), after = flatOwnerSnapshot(o.after, id), b = before.publicState, a = after.publicState;
  if (token) validateAssetObservation(o.assetObservation, id, op, tx, before, after);
  assert.equal(o.receipt.blockHash, after.raw.blockHash); assert.equal(BigInt(a.sequence), BigInt(b.sequence) + 1n);
  assert.ok(BigInt(after.raw.timestamp) >= BigInt(before.raw.timestamp), 'FLAT_OWNER_TRANSACTION_TIME');
  let inserts = [], spends = [];
  if (op.kind === 'deposit') inserts = [op.statement.output];
  else if (op.kind === 'reservation') { inserts = [op.statement.reserveCommitment, op.statement.changeCommitment]; spends = [op.statement.inputNullifier];
    const prepared = flatOwnerSnapshot(op.before, id);
    same(before.publicState, prepared.publicState); same(before.commitments, prepared.commitments);
    same(before.nullifiers, prepared.nullifiers); same(before.roots, prepared.roots);
    same(decoded.authorizationInputs, encodeStatement('authorization', state.authorization.envelope.publicStatement));
    assert.equal(b.sequence, decoded.guards.expectedSequence); assert.equal(a.root, decoded.guards.expectedPostRoot);
    assert.ok(BigInt(after.raw.timestamp) >= BigInt(op.statement.fundingNotBefore) && BigInt(after.raw.timestamp) < BigInt(op.statement.fundingValidUntil)); }
  else if (op.kind === 'recovery') {
    const original = state.authorization.signed.authorizationStatement;
    assert.equal(state.operations.reservation?.stage, 'CONFIRMED', 'FLAT_OWNER_RECOVERY_SOURCE_UNCONFIRMED');
    for (const [key, value] of Object.entries({ domainCommitment: id.domainCommitment, reserveNullifier: original.reserveNullifier,
      recoveryCommitment: original.recoveryCommitment, settleBefore: original.settleBefore })) assert.equal(op.statement[key], value, 'FLAT_OWNER_RECOVERY_BINDING');
    same(decoded.publicInputs, encodeStatement('recovery', op.statement));
    assert.ok(before.commitments.includes('0x' + original.reserveCommitment)
      && before.roots.includes('0x' + op.statement.poolRoot), 'FLAT_OWNER_RECOVERY_ACCEPTED_ROOT');
    exactRecord(o.recoveryRoots, ['rawAuthorizationRootHistory', 'rawAuthorizationRootHistoryCount']);
    const history = o.recoveryRoots.rawAuthorizationRootHistory, count = o.recoveryRoots.rawAuthorizationRootHistoryCount;
    assert.ok(typeof history === 'string' && /^0x[0-9a-f]{4160}$/.test(history)
      && typeof count === 'string' && /^0x[0-9a-f]{64}$/.test(count), 'FLAT_OWNER_AUTHORIZATION_ROOT_HISTORY');
    assert.ok(BigInt(count) > 0n && BigInt(count) <= 65n, 'FLAT_OWNER_AUTHORIZATION_ROOT_HISTORY');
    const roots = Array.from({ length: 65 }, (_, i) => history.slice(2 + i * 64, 66 + i * 64)), length = Number(BigInt(count));
    assert.equal(new Set(roots.slice(0, length)).size, length, 'FLAT_OWNER_AUTHORIZATION_ROOT_HISTORY');
    assert.ok(roots.slice(length).every(value => value === ZERO) && roots.slice(0, length).includes(op.statement.authorizationRoot),
      'FLAT_OWNER_RECOVERY_AUTHORIZATION_ROOT');
    assert.ok(b.liveReservations > 0, 'FLAT_OWNER_RECOVERY_RESERVATION_COUNT');
    inserts = [op.statement.recoveryCommitment]; spends = [op.statement.reserveNullifier];
    assert.ok(BigInt(after.raw.timestamp) >= BigInt(op.statement.settleBefore), 'FLAT_OWNER_RECOVERY_DEADLINE');
  }
  else spends = [op.statement.nullifier];
  same(after.commitments, [...before.commitments, ...inserts.map(value => '0x' + value)]);
  same(after.nullifiers, [...before.nullifiers, ...spends.map(value => '0x' + value)]);
  same(after.roots, inserts.length ? [...before.roots, a.root] : before.roots);
  for (const value of inserts) assert.ok(!before.commitments.includes('0x' + value));
  for (const value of spends) assert.ok(!before.nullifiers.includes('0x' + value));
  const delta = op.kind === 'deposit' ? BigInt(op.statement.amount) : withdrawal ? -BigInt(op.statement.amount) : 0n;
  for (const name of ['backedAmount', 'actualAssetBalance']) assert.equal(BigInt(a[name]), BigInt(b[name]) + delta);
  for (const name of ['surplus', 'unrelatedNative']) assert.equal(a[name], b[name]);
  assert.equal(a.liveReservations, b.liveReservations + (op.kind === 'reservation' ? 1 : op.kind === 'recovery' ? -1 : 0));
  assert.equal(a.outputCapacity, b.outputCapacity + (['deposit', 'recovery'].includes(op.kind) ? 1 : withdrawal ? -1 : 0));
  if (op.epoch !== null) assert.equal(BigInt(after.raw.timestamp) / 600n, BigInt(op.epoch));
  exactRecord(o.stateAdvanced, ['address', 'transactionHash', 'blockHash', 'sequence', 'root', 'spent', 'leaves', 'consumed']);
  same(o.stateAdvanced, { address: id.pool, transactionHash: tx.hash, blockHash: o.receipt.blockHash, sequence: a.sequence,
    root: a.root, spent: a.spentDigest, leaves: a.leaves, consumed: a.spent });
  if (withdrawal) same(o.withdrawal, { address: id.pool, transactionHash: tx.hash, blockHash: o.receipt.blockHash,
    recipient: op.statement.recipient, amount: op.statement.amount, nullifier: op.statement.nullifier });
  return { transactionHash: tx.hash, blockHash: o.receipt.blockHash, postRoot: a.root, postSequence: a.sequence,
    calldataSHA256: inclusion.calldataSHA256, trust: FLAT_OWNER_OBSERVATION_TRUST,
    ...(token ? { assetObservationSHA256: ownerDigest(o.assetObservation) } : {}),
    ...(op.kind === 'recovery' ? { observationSHA256: ownerDigest(o), sourceConfirmationSHA256: ownerDigest(state.operations.reservation.confirmation) } : {}) };
}
