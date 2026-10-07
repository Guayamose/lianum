/** DRAFT / HOST ONLY. Persistent owner-side type-4 custody for generic S66.
 * The injected observer is TRUSTED, not owned-chain verification. No RPC,
 * runtime, proof generation, coordinator or HTTP entry point lives here.
 * All bootstrap arguments and methods on `owner` are private capabilities.
 * Give a coordinator only `publicView`. Keys are independent per note.
 */
import {createHash, createPrivateKey, createPublicKey, randomBytes, verify} from 'node:crypto';
import {lstat} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {Vault} from '../../crypto/vault.mjs';
import {canonical} from '../../crypto/privacy.mjs';
import {signature, nullifier, wordsBE} from '../../notes/private-note-encoding.mjs';
import {
  createBalanceNote, balanceCommitment, walletDepositInput, walletInputPublicWords, encodeWalletPoolInputs,
  balanceDepositFrame, walletWithdrawInput, balanceWithdrawFrame
} from '../../wallet/notes/private-wallet-note-encoding.mjs';
import {validatePrivateWalletAssetDescriptor} from '../../wallet/notes/private-wallet-asset-binding.mjs';
import {derivePrivateAssetPoolScope} from '../../notes/private-asset-runtime.mjs';
import {compileFundedGraph, attachFundedSignatures, fundedSigningRequests, fundedAuthorizationWords} from '../graph/funded-graph.mjs';
import {inspectGenericSnapshot, reserveProjection} from '../local/local-ledger.mjs';
import {genericProofCalldata} from '../local/local-deployment.mjs';
import {
  normalizeGenericBalanceNativeConfig, createGenericBalanceNativePreparation, validateGenericBalanceNativePreparation,
  genericBalanceNativeTerms, genericBalanceNativeInvoiceRequests, prepareGenericBalanceNativeCapsules
} from './generic-balance-native-preparation.mjs';
import {capsuleAuthorizationWords} from '../native/dispatch/native-capsules.mjs';
export const PROFILE = 'DRAFT_GENERIC_BALANCE_OWNER_V3';
const STATE_VERSION = 3;
const RECOVERY_METHOD = 'recoverGeneric(bytes,bytes32[])';
export const OBSERVATION_TRUST = 'TRUSTED_INJECTED_HOST_OBSERVATIONS_NOT_CHAIN_VERIFICATION';
const ZERO = '0'.repeat(64);
const METHODS = {
  D26: 'depositBalance(bytes,bytes32[])', S66: 'reserveGenericGuarded(bytes,bytes32[],uint64,bytes32)',
  W39: 'withdrawBalance(bytes,bytes32[])'
};
const copy = x => JSON.parse(canonical(x));
const equal = (a, b) => canonical(a) === canonical(b);
export const objectDigest = x => createHash('sha256').update(canonical(x)).digest('hex');
const bytesDigest = x => createHash('sha256').update(x).digest('hex');
const random = () => randomBytes(32).toString('hex');
const fail = code => {
  throw Object.assign(new Error(code), {
    code
  });
};
const need = (ok, code) => {
  if (!ok) fail(code);
};
function exact(x, keys) {
  need(x && Object.getPrototypeOf(x) === Object.prototype && equal(Object.keys(x).sort(), [...keys].sort()),
    'CUSTODY_FIELDS');
}

function hex(x, bytes = 32, zero = false) {
  need(typeof x === 'string' && new RegExp(`^[0-9a-f]{${bytes*2}}$`).test(x) && (zero || x !== '0'.repeat(bytes * 2)),
    'CUSTODY_HEX');
  return x;
}

function uint(x, positive = false) {
  need(typeof x === 'string' && /^(0|[1-9][0-9]{0,19})$/.test(x) && BigInt(x) < (1n << 64n) && (!positive
    || BigInt(x) > 0n), 'CUSTODY_UINT');
  return BigInt(x);
}

function ref(x) {
  need(typeof x === 'string' && /^[a-zA-Z0-9_-]{8,128}$/.test(x), 'CUSTODY_REFERENCE');
  return x;
}

function proofHex(x) {
  need(typeof x === 'string' && /^(?:[0-9a-f]{2})+$/.test(x) && x.length <= 512 * 1024, 'CUSTODY_PROOF_ENCODING');
}
const EMPTY_NOTE = Object.freeze({
  type: 4, rho: ZERO, x: ZERO, y: ZERO, value: '0', secret: ZERO
});
const noteNF = (n, id) => nullifier(id.scope, n.commitment, n.opening.secret).toString('hex');
const binding = identity => objectDigest(identity);
export function validateIdentity(input) {
  exact(input, ['walletId', 'chainId', 'evmGenesis', 'bitcoinGenesis', 'solanaGenesis', 'pool', 'poolCodeHash',
    'scope', 'policy', 'deploymentDomain', 'verifierSetHash', 'issuerLifetime', 'hubDomain', 'registryCommitment',
    'poolAbiSHA256', 'asset', 'backing']);
  const id = copy(input);
  ref(id.walletId);
  uint(id.chainId, true);
  hex(id.pool, 20);
  for (const k of ['evmGenesis', 'bitcoinGenesis', 'solanaGenesis', 'poolCodeHash', 'scope', 'policy',
    'deploymentDomain', 'verifierSetHash', 'issuerLifetime', 'hubDomain', 'registryCommitment', 'poolAbiSHA256']) hex(id[k]);
  id.asset = validatePrivateWalletAssetDescriptor(id.asset, id.chainId);
  need(id.backing === 'SYNTHETIC_LOCAL_POOL_ASSET', 'CUSTODY_BACKING_LABEL');
  need(derivePrivateAssetPoolScope(id.chainId, '0x' + id.pool, '0x' + id.deploymentDomain, '0x' + id.asset.identity) === '0x' + id.scope,
    'CUSTODY_POOL_SCOPE');
  return id;
}

function keyFor(n) {
  const privateKey = createPrivateKey(n.privateKeyPem), publicKey = createPublicKey(privateKey), j = publicKey.export({
    format: 'jwk'
  });
  need(privateKey.asymmetricKeyType === 'ec' && privateKey.asymmetricKeyDetails?.namedCurve === 'secp256k1'
    && Buffer.from(j.x, 'base64url').toString('hex') === n.opening.x && Buffer.from(j.y, 'base64url').toString('hex') === n.opening.y,
    'CUSTODY_NOTE_KEY');
  return {
    privateKey, publicKey
  };
}

function makeNote(identity, value, operationRef, role) {
  const n = createBalanceNote({
    scope: identity.scope, policy: identity.policy, value
  });
  return {
    noteId: random(), identitySHA256: binding(identity), commitment: n.commitment.toString('hex'), opening: {
      type: 4, rho: n.rho.toString('hex'), x: n.x.toString('hex'), y: n.y.toString('hex'), value: String(n.value),
      secret: n.secret.toString('hex')
    }, privateKeyPem: n.privateKey.export({
      type: 'pkcs8', format: 'pem'
    }), status: 'UNISSUED', role, operationRef, provenance: null
  };
}

function validateNote(n, id) {
  exact(n, ['noteId', 'identitySHA256', 'commitment', 'opening', 'privateKeyPem', 'status', 'role',
    'operationRef', 'provenance']);
  hex(n.noteId);
  hex(n.commitment);
  ref(n.operationRef);
  need(n.identitySHA256 === binding(id), 'CUSTODY_NOTE_IDENTITY');
  exact(n.opening, ['type', 'rho', 'x', 'y', 'value', 'secret']);
  need(n.opening.type === 4, 'CUSTODY_NOTE_TYPE');
  uint(n.opening.value, true);
  for (const k of ['rho', 'x', 'y', 'secret']) hex(n.opening[k], 32, true);
  need(balanceCommitment(id.scope, id.policy, n.opening).toString('hex') === n.commitment, 'CUSTODY_NOTE_COMMITMENT');
  keyFor(n);
  need(['UNISSUED', 'AVAILABLE', 'LOCKED', 'SPENT_INTERNALLY', 'WITHDRAWN'].includes(n.status), 'CUSTODY_NOTE_STATUS');
  need(['SOURCE', 'CHANGE', 'RECOVERY'].includes(n.role), 'CUSTODY_NOTE_ROLE');
  if (n.status !== 'UNISSUED') need(n.provenance !== null && n.provenance.identitySHA256 === binding(id) && n.provenance.trust === OBSERVATION_TRUST,
    'CUSTODY_NOTE_PROVENANCE');
}
/** Every snapshot includes exact deployment identity and independently captured
 * header hashes surrounding all reads. These are adapter assertions, not proof.
 * rawState/rawHistory/rawBacking reuse the existing bounded ledger decoder.
 */
function snapshot(raw, id) {
  exact(raw, ['identitySHA256', 'blockHash', 'canonicalBlockHashBefore', 'canonicalBlockHashAfter',
    'timestamp', 'rawState', 'rawHistory', 'rawBacking']);
  need(raw.identitySHA256 === binding(id), 'CUSTODY_OBSERVER_IDENTITY');
  hex(raw.blockHash);
  uint(raw.timestamp);
  need(raw.blockHash === raw.canonicalBlockHashBefore && raw.blockHash === raw.canonicalBlockHashAfter,
    'CUSTODY_CANONICAL');
  const inspected = inspectGenericSnapshot({
    ...raw, scope: '0x' + id.scope
  });
  need(new Set(inspected.commitments).size === inspected.commitments.length, 'CUSTODY_DUPLICATE_LEAF');
  need(new Set(inspected.nullifiers).size === inspected.nullifiers.length, 'CUSTODY_DUPLICATE_NULLIFIER');
  const p = inspected.publicState;
  need(p.leaves + 4 * p.liveReservations <= 64 && p.spent + 5 * p.liveReservations + p.outputCapacity <= 64,
    'CUSTODY_HEADROOM');
  return {
    raw: copy(raw), ...inspected
  };
}

function compile(a, state) {
  const n = id => state.notes.find(n => n.noteId === id), id = state.identity;
  return compileFundedGraph({
    scope: id.scope, policy: id.policy, asset: id.asset.identity, ...copy(a.terms), ...copy(a.nonces),
    inputNote: copy(n(a.source).opening), changeNote: a.change === null ? copy(EMPTY_NOTE): copy(n(a.change).opening),
    recoveryNote: copy(n(a.recovery).opening)
  });
}

function s66(a, state) {
  const id = state.identity, s = a.authorizationStatement, b = snapshot(a.before, id), p = reserveProjection(b,
    '0x' + s.reserveCommitment, '0x' + s.changeCommitment);
  const statement = {
    scope: id.scope, policy: id.policy, asset: id.asset.identity, baseRoot: b.publicState.root.slice(2),
    inputNullifier: s.inputNullifier, reserveCommitment: s.reserveCommitment, changeCommitment: s.changeCommitment,
    admissionTag: a.admissionTag, validFrom: s.fundingNotBefore, validUntil: s.fundingValidUntil
  };
  const publicInputs = ['scope', 'policy', 'asset', 'baseRoot', 'inputNullifier', 'reserveCommitment',
  'changeCommitment', 'admissionTag'].flatMap(k => wordsBE(Buffer.from(statement[k], 'hex')).map(String)).concat(statement.validFrom,
    statement.validUntil);
  need(publicInputs.length === 66, 'CUSTODY_S66_WORDS');
  return {
    statement, publicInputs, guards: {
      expectedSequence: p.expectedSequence, expectedPostRoot: p.expectedPostRoot
    }, inputPath: b.tree.path(b.commitments.indexOf('0x' + s.inputCommitment))
  };
}

function d26(a, state) {
  const n = state.notes.find(n => n.noteId === a.source), id = state.identity;
  const statement = {
    scope: id.scope, policy: id.policy, epoch: a.terms.epoch, amount: a.terms.amount, output: n.commitment
  };
  return {
    statement, publicInputs: encodeWalletPoolInputs('deposit_balance', statement)
  };
}

function w39(a, state) {
  const source = state.notes.find(n => n.noteId === a.source), id = state.identity, before = snapshot(a.before,
    id);
  const statement = {
    scope: id.scope, policy: id.policy, epoch: a.terms.epoch, root: before.publicState.root.slice(2),
    nullifier: noteNF(source, id), amount: source.opening.value, recipient: a.terms.recipient
  };
  const inputPath = before.tree.path(before.commitments.indexOf('0x' + source.commitment));
  return {
    statement, publicInputs: encodeWalletPoolInputs('withdraw_balance', statement), inputPath
  };
}

function plan(a, state) {
  return a.kind === 'S66' ? s66(a, state): a.kind === 'D26' ? d26(a, state): w39(a, state);
}
const signedResult = a => a.kind === 'S66' ? a.authorization: a.kind === 'D26' ? a.depositWitness: a.withdrawalWitness;
/** Fixed before ANY signature computation. Recipient signatures are included,
 * while the owner message is reconstructed from the durable note/A0 records. */
function signingIntent(a, state, invoiceSignatures = []) {
  if (a.kind === 'D26') {
    need(equal(invoiceSignatures, []), 'CUSTODY_INVOICES');
    const s = d26(a, state).statement;
    return {
      messageHex: balanceDepositFrame(s.scope, s.policy, s.epoch, s.amount, s.output).toString('hex'),
      publicInputs: d26(a, state).publicInputs, invoiceSignatures: []
    };
  }
  if (a.kind === 'W39') {
    need(equal(invoiceSignatures, []), 'CUSTODY_INVOICES');
    const s = w39(a, state).statement;
    const source = state.notes.find(n => n.noteId === a.source);
    return {
      messageHex: balanceWithdrawFrame(s.scope, s.policy, source.commitment, s.recipient, s.amount,
        s.epoch).toString('hex'), publicInputs: w39(a, state).publicInputs, invoiceSignatures: []
    };
  }
  const c = compile(a, state), requests = fundedSigningRequests(c);
  need(Array.isArray(invoiceSignatures) && invoiceSignatures.length === requests.invoices.length, 'CUSTODY_INVOICES');
  requests.invoices.forEach((v, i) => {
    need(typeof invoiceSignatures[i] === 'string' && /^[0-9a-f]{128}$/.test(invoiceSignatures[i]), 'CUSTODY_INVOICE_SIGNATURE');
    const key = createPublicKey({
      format: 'jwk', key: {
        kty: 'EC', crv: 'secp256k1', x: Buffer.from(v.x, 'hex').toString('base64url'), y: Buffer.from(v.y,
          'hex').toString('base64url')
      }
    });
    need(verify('sha256', v.message, {
      key, dsaEncoding: 'ieee-p1363'
    }, Buffer.from(invoiceSignatures[i], 'hex')), 'CUSTODY_INVOICE_SIGNATURE');
  });
  return {
    messageHex: requests.owner.message.toString('hex'), publicInputs: fundedAuthorizationWords(c.authorizationStatement),
    invoiceSignatures: copy(invoiceSignatures)
  };
}
const MUTATIONS = ['PREPARATION', 'SIGNING_INTENT', 'SIGNED_RESULT', 'SUBMISSION_LATCH', 'TRANSACTION_HASH',
'UNKNOWN', 'CONFIRMATION', 'RECOVERY_CREDIT', 'D26_RENEWAL', 'W39_RENEWAL'];
function validateMutation(m) {
  if (m.type === 'RECOVERY') {
    exact(m, ['type', 'original', 'originalCandidateSHA256']);
    validateMutation(m.original);
    need(m.original.type !== 'RECOVERY', 'CUSTODY_RECOVERY_NESTING');
    hex(m.originalCandidateSHA256);
    return;
  }

  exact(m, ['type', 'ownerOperationRef', 'operationKind', 'requestSHA256',
    ...(m.type === 'RECOVERY_CREDIT' ? ['recoveryRequest', 'recoveryObservationSHA256'] : [])]);
  need(MUTATIONS.includes(m.type), 'CUSTODY_MUTATION');
  ref(m.ownerOperationRef);
  need(['D26', 'S66', 'W39'].includes(m.operationKind), 'CUSTODY_KIND');
  hex(m.requestSHA256);
  if (m.type === 'RECOVERY_CREDIT') {
    validateRecoveryRequest(m.recoveryRequest);
    need(m.operationKind === 'S66' && m.recoveryRequest.ownerOperationRef === m.ownerOperationRef,
      'CUSTODY_RECOVERY_REQUEST');
    hex(m.recoveryObservationSHA256);
  }
}

function mutationFor(before, after) {
  const changed = after.operations.filter(a => !equal(before.operations.find(v => v.ownerOperationRef === a.ownerOperationRef) ?? null,
    a));
  need(changed.length === 1, 'CUSTODY_MUTATION_COUNT');
  const a = changed[0], old = before.operations.find(v => v.ownerOperationRef === a.ownerOperationRef);
  let type;
  if (!old) {
    type = 'PREPARATION';
  } else if (!equal(a.recoveryCredit, old.recoveryCredit)) {
    type = 'RECOVERY_CREDIT';
  } else if (['D26', 'W39'].includes(a.kind) && a.terms.epoch !== old.terms.epoch) {
    type = `${a.kind}_RENEWAL`;
  } else if (a.stage !== old.stage) {
    const stageMutations = {
      SIGNING: 'SIGNING_INTENT', AUTHORIZED: 'SIGNED_RESULT', SUBMITTING: 'SUBMISSION_LATCH', UNKNOWN: 'UNKNOWN',
      CONFIRMED: 'CONFIRMATION',
    };
    type = stageMutations[a.stage];
  } else {
    type = 'TRANSACTION_HASH';
  }
  const result = {
    type, ownerOperationRef: a.ownerOperationRef, operationKind: a.kind, requestSHA256: objectDigest(a.request),
    ...(type === 'RECOVERY_CREDIT' ? {recoveryRequest: copy(a.recoveryCredit.request),
      recoveryObservationSHA256: objectDigest(a.recoveryCredit.observation)} : {})
  };
  validateMutation(result);
  return result;
}

function validateState(s, identity, artifact) {
  exact(s, ['version', 'profile', 'identity', 'notes', 'operations', 'tombstones', 'writeRecoveries']);
  need(s.version === STATE_VERSION && s.profile === PROFILE, 'CUSTODY_VERSION');
  need(equal(s.identity, identity), 'CUSTODY_IDENTITY_CHANGED');
  need(Array.isArray(s.notes) && s.notes.length <= 192 && Array.isArray(s.operations) && s.operations.length <= 64,
    'CUSTODY_CAPACITY');
  s.notes.forEach(n => validateNote(n, identity));
  for (const field of ['noteId', 'commitment']) need(new Set(s.notes.map(n => n[field])).size === s.notes.length,
    'CUSTODY_DUPLICATE_NOTE');
  need(new Set(s.operations.map(a => a.ownerOperationRef)).size === s.operations.length, 'CUSTODY_DUPLICATE_REFERENCE');
  need(Array.isArray(s.tombstones) && s.tombstones.length <= 64 && Array.isArray(s.writeRecoveries) && s.writeRecoveries.length <= 128,
    'CUSTODY_RECOVERY_CAPACITY');
  for (const t of s.tombstones) {
    exact(t, ['ownerOperationRef', 'kind', 'requestSHA256', 'reason']);
    ref(t.ownerOperationRef);
    hex(t.requestSHA256);
    need(['D26', 'S66', 'W39'].includes(t.kind) && ['UNCOMMITTED_PREPARATION_KEYS_LOST', 'UNCOMMITTED_PREPARATION_NOT_ADOPTED'].includes(t.reason),
      'CUSTODY_TOMBSTONE');
  }

  need(new Set([...s.operations, ...s.tombstones].map(a => a.ownerOperationRef)).size === s.operations.length + s.tombstones.length,
    'CUSTODY_DUPLICATE_REFERENCE');
  for (const r of s.writeRecoveries) {
    exact(r, ['candidateSHA256', 'baseStateSHA256', 'mutation']);
    hex(r.candidateSHA256);
    hex(r.baseStateSHA256);
    validateMutation(r.mutation);
  }
  for (const a of s.operations) {
    exact(a, ['ownerOperationRef', 'kind', 'request', 'stage', 'source', 'change', 'recovery', 'before',
      'terms', 'nonces', 'authorizationStatement', 'admissionTag', 'signingIntent', 'authorization',
      'depositWitness', 'withdrawalWitness', 'submission', 'transactionHash', 'confirmation', 'nativePreparation',
      'fundingHistory', 'withdrawalHistory', 'recoveryCredit']);
    ref(a.ownerOperationRef);
    need(['D26', 'S66', 'W39'].includes(a.kind), 'CUSTODY_KIND');
    need(['PREPARED', 'SIGNING', 'AUTHORIZED', 'SUBMITTING', 'UNKNOWN', 'CONFIRMED'].includes(a.stage),
      'CUSTODY_STAGE');
    need(a.request.ownerOperationRef === a.ownerOperationRef && a.request.identitySHA256 === binding(identity),
      'CUSTODY_REQUEST_BINDING');
    snapshot(a.before, identity);
    const source = s.notes.find(n => n.noteId === a.source);
    need(source, 'CUSTODY_SOURCE');
    if (a.signingIntent !== null) need(equal(a.signingIntent, signingIntent(a, s, a.signingIntent.invoiceSignatures)),
      'CUSTODY_SIGNING_INTENT');
    if (a.stage !== 'PREPARED') need(a.signingIntent !== null, 'CUSTODY_SIGNING_INTENT_REQUIRED');
    if (a.stage === 'SIGNING') need(a.authorization === null && a.depositWitness === null && a.withdrawalWitness === null
      && a.submission === null, 'CUSTODY_SIGNING_STAGE');
    if (a.kind !== 'S66') need(a.recoveryCredit === null, 'CUSTODY_RECOVERY_FIELDS');
    if (a.kind !== 'W39') need(a.withdrawalWitness === null && equal(a.withdrawalHistory, []), 'CUSTODY_WITHDRAWAL_FIELDS');
    if (a.kind === 'S66') {
      need(a.source === a.request.sourceNoteId && equal(a.fundingHistory, []), 'CUSTODY_REQUEST_CHANGED');
      if (a.nativePreparation !== null) {
        validateGenericBalanceNativePreparation(a.nativePreparation, a.request.nativeConfig);
        need(equal(a.terms, genericBalanceNativeTerms(a.nativePreparation)), 'CUSTODY_NATIVE_TERMS');
      } else need(equal(a.terms, a.request.terms), 'CUSTODY_REQUEST_CHANGED');
      const c = compile(a, s);
      need(equal(c.authorizationStatement, a.authorizationStatement) && c.admissionTag === a.admissionTag,
        'CUSTODY_A0_BINDING');
      need(noteNF(source, identity) === c.authorizationStatement.inputNullifier, 'CUSTODY_SOURCE_NULLIFIER');
      need(source.status ===(a.stage === 'CONFIRMED' ? 'SPENT_INTERNALLY': 'LOCKED'), 'CUSTODY_SOURCE_LOCK');
      if (a.authorization) {
        const signed = attachFundedSignatures(c, {
          ownerSignature: a.authorization.signatures.ownerSignature, invoiceSignatures: a.authorization.signatures.invoiceSignatures.slice(0,
            c.ownerWitness.graph.activeCount)
        });
        need(equal(signed, a.authorization), 'CUSTODY_AUTHORIZATION');
        need(equal(a.authorization.signatures.invoiceSignatures.slice(0, c.ownerWitness.graph.activeCount),
          a.signingIntent.invoiceSignatures), 'CUSTODY_INVOICE_BINDING');
      }
      const recovery = s.notes.find(n => n.noteId === a.recovery);
      need(recovery?.role === 'RECOVERY' && recovery.operationRef === a.ownerOperationRef
        && recovery.commitment === a.authorizationStatement.recoveryCommitment
        && recovery.opening.value === a.terms.budget, 'CUSTODY_RECOVERY_NOTE');
      if (a.recoveryCredit === null) need(recovery.status === 'UNISSUED', 'CUSTODY_RECOVERY_UNISSUED');
      else {
        const credit = a.recoveryCredit;
        exact(credit, ['version', 'request', 'observation', 'confirmation']);
        need(credit.version === 1, 'CUSTODY_RECOVERY_VERSION');
        const evidence = validateRecoveryTransition(credit.observation, a, s, artifact, credit.request);
        need(equal(credit.confirmation, evidence) && equal(recovery.provenance, evidence), 'CUSTODY_RECOVERY_CONFIRMATION');
        need(['AVAILABLE', 'LOCKED', 'SPENT_INTERNALLY', 'WITHDRAWN'].includes(recovery.status), 'CUSTODY_RECOVERY_STATUS');
      }
      if (a.change !== null) {
        const change = s.notes.find(n => n.noteId === a.change);
        need(change && (a.stage === 'CONFIRMED' ? ['AVAILABLE', 'LOCKED', 'SPENT_INTERNALLY', 'WITHDRAWN'].includes(change.status): change.status === 'UNISSUED'),
          'CUSTODY_CHANGE_STATUS');
      }
    } else if (a.kind === 'D26') {
      need(a.nativePreparation === null && a.terms.amount === a.request.amount, 'CUSTODY_REQUEST_CHANGED');
      need(Array.isArray(a.fundingHistory) && a.fundingHistory.length <= 64, 'CUSTODY_FUNDING_HISTORY');
      for (const prior of a.fundingHistory) {
        exact(prior, ['epoch', 'signingIntent', 'depositWitness']);
        uint(prior.epoch);
        if (prior.signingIntent !== null) need(equal(prior.signingIntent, signingIntent({
          ...a, terms: {
            ...a.terms, epoch: prior.epoch
          }
        }, s)), 'CUSTODY_FUNDING_HISTORY');
        if (prior.depositWitness !== null) need(prior.signingIntent !== null && equal(walletInputPublicWords('deposit_balance',
          prior.depositWitness), prior.signingIntent.publicInputs), 'CUSTODY_FUNDING_HISTORY');
      }
      if (a.fundingHistory.length) {
        const epochs = [...a.fundingHistory.map(v => v.epoch), a.terms.epoch];
        need(epochs[0] === a.request.epoch && epochs.every((v, i) => uint(v) >= 0n && (i === 0 || BigInt(v) > BigInt(epochs[i - 1]))),
          'CUSTODY_FUNDING_HISTORY');
      } else need(a.terms.epoch === a.request.epoch, 'CUSTODY_REQUEST_CHANGED');
      need(a.change === null && a.recovery === null && a.nonces === null && a.authorizationStatement === null
        && a.authorization === null && a.admissionTag === null, 'CUSTODY_D26_FIELDS');
      need(source.opening.value === a.terms.amount, 'CUSTODY_DEPOSIT_VALUE');
      if (a.stage !== 'CONFIRMED') need(source.status === 'UNISSUED', 'CUSTODY_DEPOSIT_STATUS');
      if (a.depositWitness) need(equal(walletInputPublicWords('deposit_balance', a.depositWitness),
        d26(a, s).publicInputs), 'CUSTODY_D26_WITNESS');
    } else {
      need(a.source === a.request.sourceNoteId && a.terms.recipient === a.request.recipient && a.terms.amount === source.opening.value,
        'CUSTODY_WITHDRAWAL_TERMS');
      hex(a.terms.recipient, 20);
      uint(a.terms.epoch);
      need(source.status ===(a.stage === 'CONFIRMED' ? 'WITHDRAWN': 'LOCKED'), 'CUSTODY_SOURCE_LOCK');
      need(a.nativePreparation === null && equal(a.fundingHistory, []) && a.change === null && a.recovery === null
        && a.nonces === null && a.authorizationStatement === null && a.authorization === null && a.depositWitness === null
        && a.admissionTag === null, 'CUSTODY_W39_FIELDS');
      need(Array.isArray(a.withdrawalHistory) && a.withdrawalHistory.length <= 64, 'CUSTODY_WITHDRAWAL_HISTORY');
      for (const prior of a.withdrawalHistory) {
        exact(prior, ['epoch', 'before', 'signingIntent', 'withdrawalWitness']);
        uint(prior.epoch);
        snapshot(prior.before, identity);
        const historical = {
          ...a, before: prior.before, terms: {
            ...a.terms, epoch: prior.epoch
          }
        };
        if (prior.signingIntent !== null) need(equal(prior.signingIntent, signingIntent(historical,
          s)), 'CUSTODY_WITHDRAWAL_HISTORY');
        if (prior.withdrawalWitness !== null) need(prior.signingIntent !== null && equal(walletInputPublicWords('withdraw_balance',
          prior.withdrawalWitness), prior.signingIntent.publicInputs), 'CUSTODY_WITHDRAWAL_HISTORY');
      }
      const epochs = [...a.withdrawalHistory.map(v => v.epoch), a.terms.epoch];
      need(epochs[0] === a.request.epoch && epochs.every((v, i) => uint(v) >= 0n && (i === 0 || BigInt(v) > BigInt(epochs[i - 1]))),
        'CUSTODY_WITHDRAWAL_HISTORY');
      if (a.withdrawalWitness) need(equal(walletInputPublicWords('withdraw_balance', a.withdrawalWitness),
        w39(a, s).publicInputs), 'CUSTODY_W39_WITNESS');
    }
    if (a.submission) {
      const p = plan(a, s), v = a.submission;
      exact(v, ['proofHex', 'proofSHA256', 'publicInputs', 'calldata', 'calldataSHA256', 'guards', 'authorizationSHA256']);
      proofHex(v.proofHex);
      need(equal(v.publicInputs, p.publicInputs) && equal(v.guards, p.guards ?? null), 'CUSTODY_SUBMISSION_WORDS');
      need(v.proofSHA256 === bytesDigest(Buffer.from(v.proofHex, 'hex')) && v.calldataSHA256 === bytesDigest(Buffer.from(v.calldata.slice(2),
        'hex')), 'CUSTODY_SUBMISSION_DIGEST');
      need(v.authorizationSHA256 ===(a.kind === 'S66' ? objectDigest(a.authorization): null), 'CUSTODY_A0_HASH');
      need(v.calldata === genericProofCalldata(artifact, METHODS[a.kind], Buffer.from(v.proofHex, 'hex'),
        p.publicInputs, p.guards), 'CUSTODY_CALLDATA');
      need(signedResult(a) !== null, 'CUSTODY_AUTHORIZATION_REQUIRED');
    }
    if (['SUBMITTING', 'UNKNOWN', 'CONFIRMED'].includes(a.stage)) need(a.submission !== null, 'CUSTODY_SUBMISSION_REQUIRED');
    if (['AUTHORIZED', 'SUBMITTING', 'UNKNOWN', 'CONFIRMED'].includes(a.stage)) need(signedResult(a) !== null,
      'CUSTODY_SIGNED_RESULT_REQUIRED');
    if (a.stage === 'CONFIRMED') need(a.confirmation !== null, 'CUSTODY_CONFIRMATION_REQUIRED');
  }
  const credits = s.operations.filter(operation => operation.recoveryCredit !== null);
  for (const field of ['transactionHash', 'calldataSHA256']) {
    need(new Set(credits.map(operation => operation.recoveryCredit.request[field])).size === credits.length,
      'CUSTODY_RECOVERY_REUSE');
  }
  return s;
}

function checkpointRecord(r) {
  return {
    revision: r.revision, stateSHA256: objectDigest(r.data)
  };
}

function checkpoint(identity, record, pending = null, mutation = null) {
  return {
    version: STATE_VERSION, identitySHA256: binding(identity), acknowledged: checkpointRecord(record), pending: pending
    ? {
      ...checkpointRecord(pending), mutation: copy(mutation)
    }: null
  };
}
const pendingRecord = cp => cp.pending ? {
  revision: cp.pending.revision, stateSHA256: cp.pending.stateSHA256
}: cp.acknowledged;
function validateCheckpoint(cp, identity) {
  exact(cp, ['version', 'identitySHA256', 'acknowledged', 'pending']);
  need(cp.version === STATE_VERSION && cp.identitySHA256 === binding(identity), 'CUSTODY_CHECKPOINT_IDENTITY');
  exact(cp.acknowledged, ['revision', 'stateSHA256']);
  need(Number.isSafeInteger(cp.acknowledged.revision) && cp.acknowledged.revision >= 0, 'CUSTODY_CHECKPOINT_REVISION');
  hex(cp.acknowledged.stateSHA256);
  if (cp.pending) {
    exact(cp.pending, ['revision', 'stateSHA256', 'mutation']);
    hex(cp.pending.stateSHA256);
    validateMutation(cp.pending.mutation);
    need(Number.isSafeInteger(cp.pending.revision) && cp.pending.revision === cp.acknowledged.revision + 1,
      'CUSTODY_CHECKPOINT_REVISION');
  }
}

function publicOperation(a) {
  return {
    ownerOperationRef: a.ownerOperationRef, kind: a.kind, stage: a.stage, reconcileRequired: ['SIGNING',
    'SUBMITTING', 'UNKNOWN'].includes(a.stage), dispatchAllowed: false
  };
}
class OwnerCustody {
  #vault;
  #password;
  #identity;
  #artifact;
  #observer;
  #onCheckpoint;
  #record;
  #pending = null;
  #pendingMutation = null;
  #fault = false;
  #busy = false;
  #closed = false;
  constructor(cfg, deps, record) {
    this.#vault = deps.vault;
    this.#password = cfg.password;
    this.#identity = cfg.identity;
    this.#artifact = copy(cfg.poolArtifact);
    this.#observer = Object.freeze({
      readSnapshot: deps.observer.readSnapshot.bind(deps.observer), readTransaction: deps.observer.readTransaction.bind(deps.observer)
    });
    this.#onCheckpoint = deps.onCheckpoint;
    this.#record = copy(record);
    validateState(record.data, this.#identity, this.#artifact);
  }

  #ready() {
    need(!this.#closed, 'CUSTODY_CLOSED');
    need(!this.#fault && !this.#pending, 'CUSTODY_WRITE_UNCERTAIN');
  }

  async #exclusive(f) {
    this.#ready();
    need(!this.#busy, 'CUSTODY_BUSY');
    this.#busy = true;
    try {
      return await f();
    } finally {
      this.#busy = false;
    }
  }

  #operation(r) {
    ref(r);
    const a = this.#record.data.operations.find(a => a.ownerOperationRef === r);
    need(a, 'CUSTODY_UNKNOWN_OPERATION');
    return a;
  }

  async #authenticate() {
    try {
      const r = await this.#vault.read(this.#password);
      need(equal(r, this.#record), 'CUSTODY_STORAGE_CHANGED');
      validateState(r.data, this.#identity, this.#artifact);
    } catch (error) {
      this.#fault = true;
      throw error;
    }
  }

  async #write(update, recoveryMutation = null) {
    this.#ready();
    await this.#authenticate();
    need(this.#record.revision < Number.MAX_SAFE_INTEGER, 'CUSTODY_REVISION_LIMIT');
    const next = copy(this.#record);
    next.revision++;
    update(next.data);
    validateState(next.data, this.#identity, this.#artifact);
    this.#pending = next;
    this.#pendingMutation = recoveryMutation ?? mutationFor(this.#record.data, next.data);
    validateMutation(this.#pendingMutation);
    try {
      // Keeper retains BOTH hashes before the ciphertext mutation. An uncertain
      // write must never be reopened using only the old acknowledged checkpoint.
      await this.#onCheckpoint(checkpoint(this.#identity, this.#record, next, this.#pendingMutation));
      await this.#vault.update(this.#password, this.#record.revision, current => {
        need(equal(current, this.#record.data), 'CUSTODY_CAS_DATA');
        return next.data;
      });
      need(equal(await this.#vault.read(this.#password), next), 'CUSTODY_READBACK');
      await this.#onCheckpoint(checkpoint(this.#identity, next));
      this.#record = next;
      this.#pending = null;
      this.#pendingMutation = null;
    } catch {
      this.#fault = true;
      fail('CUSTODY_WRITE_UNCERTAIN');
    }
  }
  /** Adopt only an EXACT committed candidate. This method rejects an absent
   * write; use the explicit absent-write routes below to recover availability.
   * No regenerated notes/signatures, unlock or repeated dispatch here. */
  async authenticateCommittedWrite() {
    need(!this.#closed && !this.#busy && this.#pending, 'CUSTODY_NO_PENDING_WRITE');
    this.#busy = true;
    try {
      const r = await this.#vault.read(this.#password);
      need(equal(r, this.#pending), 'CUSTODY_PENDING_WRITE_NOT_COMMITTED');
      validateState(r.data, this.#identity, this.#artifact);
      await this.#onCheckpoint(checkpoint(this.#identity, r));
      this.#record = copy(r);
      this.#pending = null;
      this.#pendingMutation = null;
      this.#fault = false;
      return this.summary();
    } finally {
      this.#busy = false;
    }
  }
  /** Retry an authenticated ABSENT write using its exact retained candidate.
   * Only an absent first dispatch latch can grant the initial send. Finding an
   * already committed latch never grants send, including after a lost reply. */
  async resumePendingWrite() {
    need(!this.#closed && !this.#busy && this.#pending, 'CUSTODY_NO_PENDING_WRITE');
    this.#busy = true;
    try {
      const actual = await this.#vault.read(this.#password), next = this.#pending, m = this.#pendingMutation;
      need(equal(actual, this.#record) || equal(actual, next), 'CUSTODY_PENDING_STORAGE_CHANGED');
      const wasAbsent = equal(actual, this.#record);
      if (wasAbsent) {
        await this.#onCheckpoint(checkpoint(this.#identity, this.#record, next, m));
        await this.#vault.update(this.#password, this.#record.revision, current => {
          need(equal(current, this.#record.data), 'CUSTODY_CAS_DATA');
          return next.data;
        });
      }
      need(equal(await this.#vault.read(this.#password), next), 'CUSTODY_READBACK');
      validateState(next.data, this.#identity, this.#artifact);
      await this.#onCheckpoint(checkpoint(this.#identity, next));
      this.#record = copy(next);
      this.#pending = null;
      this.#pendingMutation = null;
      this.#fault = false;
      return {
        disposition: wasAbsent ? 'EXACT_ABSENT_CANDIDATE_COMMITTED': 'EXACT_COMMITTED_CANDIDATE_ADOPTED',
        ownerOperationRef: m.ownerOperationRef ?? m.original.ownerOperationRef, dispatchAllowed: wasAbsent
        && m.type === 'SUBMISSION_LATCH'
      };
    } catch {
      this.#fault = true;
      fail('CUSTODY_WRITE_UNCERTAIN');
    } finally {
      this.#busy = false;
    }
  }
  /** Called only by explicit trusted restart recovery after verifying that disk
   * is EXACTLY the keeper's acknowledged base, not an arbitrary older revision.
   * Missing preparation keys cannot be recreated: persist a tombstone instead. */
  async recoverAbsentCheckpoint(cp) {
    const retained = copy(cp);
    validateCheckpoint(retained, this.#identity);
    cp = retained;
    return this.#exclusive(async () => {
      await this.#authenticate();
      need(cp.pending && equal(checkpointRecord(this.#record), cp.acknowledged), 'CUSTODY_ABSENT_CHECKPOINT');
      const m = cp.pending.mutation, original = m.type === 'RECOVERY' ? m.original: m;
      validateMutation(m);
      const candidateSHA256 = m.type === 'RECOVERY' ? m.originalCandidateSHA256: cp.pending.stateSHA256;
      const a = this.#record.data.operations.find(a => a.ownerOperationRef === original.ownerOperationRef);
      if (original.type === 'PREPARATION') {
        const alreadyTombstoned = this.#record.data.tombstones.some(
          tombstone => tombstone.ownerOperationRef === original.ownerOperationRef);
        need(!a && !alreadyTombstoned, 'CUSTODY_TOMBSTONE_CONFLICT');
      } else {
        need(a && a.kind === original.operationKind && objectDigest(a.request) === original.requestSHA256,
          'CUSTODY_RECOVERY_REQUEST');
        const expected = {
          SIGNING_INTENT: ['PREPARED'],
          SIGNED_RESULT: ['SIGNING'],
          SUBMISSION_LATCH: ['AUTHORIZED'],
          TRANSACTION_HASH: ['SUBMITTING', 'UNKNOWN', 'CONFIRMED'],
          UNKNOWN: ['SUBMITTING'],
          CONFIRMATION: ['SUBMITTING', 'UNKNOWN'],
          RECOVERY_CREDIT: ['CONFIRMED'],
          D26_RENEWAL: ['PREPARED', 'SIGNING', 'AUTHORIZED'],
          W39_RENEWAL: ['PREPARED', 'SIGNING', 'AUTHORIZED'],
        };
        need(expected[original.type]?.includes(a.stage), 'CUSTODY_RECOVERY_STAGE');
        if (original.type === 'RECOVERY_CREDIT') need(a.kind === 'S66' && a.recoveryCredit === null,
          'CUSTODY_RECOVERY_ALREADY_CREDITED');
      }
      const recoveryMutation = {
        type: 'RECOVERY', original: copy(original), originalCandidateSHA256: candidateSHA256
      };
      await this.#write(s => {
        s.writeRecoveries.push({
          candidateSHA256, baseStateSHA256: cp.acknowledged.stateSHA256, mutation: copy(original)
        });
        if (original.type === 'PREPARATION') {
          const reason = original.operationKind === 'W39'
            ? 'UNCOMMITTED_PREPARATION_NOT_ADOPTED'
            : 'UNCOMMITTED_PREPARATION_KEYS_LOST';
          s.tombstones.push({
            ownerOperationRef: original.ownerOperationRef,
            kind: original.operationKind,
            requestSHA256: original.requestSHA256,
            reason,
          });
        } else {
          const op = s.operations.find(a => a.ownerOperationRef === original.ownerOperationRef);
          if (op.stage === 'SUBMITTING') op.stage = 'UNKNOWN';
        }
      }, recoveryMutation);
      return {
        disposition: original.type === 'PREPARATION' ? 'PREPARATION_TOMBSTONED': 'ABSENT_WRITE_RECORDED',
        ownerOperationRef: original.ownerOperationRef, dispatchAllowed: false
      };
    });
  }

  checkpoint() {
    need(!this.#closed, 'CUSTODY_CLOSED');
    return copy(checkpoint(this.#identity, this.#record, this.#pending, this.#pendingMutation));
  }

  summary() {
    return {
      profile: PROFILE, storageAvailable: !this.#closed && !this.#fault && !this.#pending, trust: OBSERVATION_TRUST,
      backing: 'SYNTHETIC_LOCAL_POOL_ASSET', masterRootKeyWallet: false
    };
  }

  projection(r) {
    this.#ready();
    ref(r);
    const t = this.#record.data.tombstones.find(t => t.ownerOperationRef === r);
    return t ? {
      ownerOperationRef: r, kind: t.kind, stage: 'ABANDONED', reconcileRequired: false, dispatchAllowed: false
    }: publicOperation(this.#operation(r));
  }

  privateBalance() {
    this.#ready();
    const totals = {
      available: '0', locked: '0'
    };
    const notes = this.#record.data.notes.map(n => ({
      noteId: n.noteId, commitment: n.commitment, value: n.opening.value, status: n.status, role: n.role,
      provenance: copy(n.provenance)
    }));
    for (const n of notes) if (['AVAILABLE', 'LOCKED'].includes(n.status)) {
      const k = n.status === 'AVAILABLE' ? 'available': 'locked';
      totals[k] = String(BigInt(totals[k]) + BigInt(n.value));
    }
    return {
      ...this.summary(), ...totals, notes, freshChainTruth: false
    };
  }

  #duplicate(request, kind) {
    const a = this.#record.data.operations.find(a => a.ownerOperationRef === request.ownerOperationRef);
    need(!this.#record.data.tombstones.some(t => t.ownerOperationRef === request.ownerOperationRef),
      'CUSTODY_OPERATION_TOMBSTONED');
    if (a) {
      need(a.kind === kind && equal(a.request, request), 'CUSTODY_REFERENCE_REUSE');
      return a;
    }
    return null;
  }

  #request(input, keys) {
    const r = copy(input);
    exact(r, keys);
    ref(r.ownerOperationRef);
    need(r.identitySHA256 === binding(this.#identity), 'CUSTODY_REQUEST_IDENTITY');
    return r;
  }

  async prepareFunding(input) {
    const r = this.#request(input, ['ownerOperationRef', 'identitySHA256', 'amount', 'epoch']);
    uint(r.amount, true);
    uint(r.epoch);
    return this.#exclusive(async () => {
      await this.#authenticate();
      const old = this.#duplicate(r, 'D26');
      if (old) return publicOperation(old);
      const before = snapshot(await this.#observer.readSnapshot(), this.#identity);
      need(BigInt(before.raw.timestamp) / 600n === BigInt(r.epoch), 'CUSTODY_EPOCH');
      const b = before.publicState;
      need(b.leaves + 1 + 4 * b.liveReservations <= 64 && b.spent + 5 * b.liveReservations + b.outputCapacity + 1 <= 64,
        'CUSTODY_HEADROOM');
      const n = makeNote(this.#identity, r.amount, r.ownerOperationRef, 'SOURCE');
      await this.#write(s => {
        s.notes.push(n);
        s.operations.push({
          ownerOperationRef: r.ownerOperationRef, kind: 'D26', request: r, stage: 'PREPARED', source: n.noteId,
          change: null, recovery: null, before: before.raw, terms: {
            amount: r.amount, epoch: r.epoch
          }, nonces: null, authorizationStatement: null, admissionTag: null, signingIntent: null, authorization: null,
          depositWitness: null, submission: null, transactionHash: null, confirmation: null, nativePreparation: null,
          fundingHistory: [], withdrawalHistory: [], withdrawalWitness: null, recoveryCredit: null
        });
      });
      return publicOperation(this.#operation(r.ownerOperationRef));
    });
  }

  async prepareOperation(input) {
    const r = this.#request(input, ['ownerOperationRef', 'identitySHA256', 'sourceNoteId', 'terms']);
    hex(r.sourceNoteId);
    exact(r.terms, ['operationId', 'budget', 'fundingNotBefore', 'fundingValidUntil', 'settleBefore',
      'nodes']);
    hex(r.terms.operationId);
    uint(r.terms.budget, true);
    return this.#prepareOperation(r, false);
  }

  async prepareNativeOperation(input) {
    const r = this.#request(input, ['ownerOperationRef', 'identitySHA256', 'sourceNoteId', 'nativeConfig']);
    hex(r.sourceNoteId);
    r.nativeConfig = normalizeGenericBalanceNativeConfig(r.nativeConfig);
    const id = this.#identity;
    need(r.nativeConfig.scope === id.scope && r.nativeConfig.policy === id.policy && r.nativeConfig.asset === id.asset.identity
      && r.nativeConfig.hubDomain === id.hubDomain && r.nativeConfig.registryCommitment === id.registryCommitment,
      'CUSTODY_NATIVE_BINDING');
    return this.#prepareOperation(r, true);
  }

  async #prepareOperation(r, native) {
    return this.#exclusive(async () => {
      await this.#authenticate();
      const old = this.#duplicate(r, 'S66');
      if (old) return publicOperation(old);
      const nativePreparation = native ? createGenericBalanceNativePreparation(r.nativeConfig): null;
      const terms = native ? genericBalanceNativeTerms(nativePreparation): r.terms;
      need(!this.#record.data.operations.some(a => a.kind === 'S66' && a.terms.operationId === terms.operationId),
        'CUSTODY_INTENT_REUSE');
      const n = this.#record.data.notes.find(n => n.noteId === r.sourceNoteId);
      need(n?.status === 'AVAILABLE', 'CUSTODY_SOURCE_UNAVAILABLE');
      validateNote(n, this.#identity);
      const b = snapshot(await this.#observer.readSnapshot(), this.#identity);
      need(b.commitments.includes('0x' + n.commitment) && !b.nullifiers.includes('0x' + noteNF(n, this.#identity)),
        'CUSTODY_SOURCE_MEMBERSHIP');
      const ledger = b.publicState;
      need(ledger.outputCapacity > 0 && ledger.leaves + 2 + 4 *(ledger.liveReservations + 1) <= 64 && ledger.spent + 1 + 5 *(ledger.liveReservations + 1) + ledger.outputCapacity <= 64,
        'CUSTODY_HEADROOM');
      need(BigInt(b.raw.timestamp) < uint(terms.fundingValidUntil, true), 'CUSTODY_FUNDING_EXPIRED');
      const delta = BigInt(n.opening.value) - BigInt(terms.budget);
      need(delta >= 0n, 'CUSTODY_CONSERVATION');
      const change = delta > 0n ? makeNote(this.#identity, String(delta), r.ownerOperationRef, 'CHANGE'): null;
      const recovery = makeNote(this.#identity, terms.budget, r.ownerOperationRef, 'RECOVERY');
      const a = {
        ownerOperationRef: r.ownerOperationRef, kind: 'S66', request: r, stage: 'PREPARED', source: n.noteId,
        change: change?.noteId ?? null, recovery: recovery.noteId, before: b.raw, terms, nativePreparation,
        fundingHistory: [], withdrawalHistory: [], withdrawalWitness: null, recoveryCredit: null, nonces: {
          reservationNonce: random(), reserveSecret: random(), graphNonce: random(), paddingSalts: Array.from({
            length: 4
          }, random)
        }, authorizationStatement: null, admissionTag: null, signingIntent: null, authorization: null,
        depositWitness: null, submission: null, transactionHash: null, confirmation: null
      };
      await this.#write(s => {
        s.notes.find(v => v.noteId === n.noteId).status = 'LOCKED';
        s.notes.push(...(change ? [change]: []), recovery);
        const c = compile(a, s);
        a.authorizationStatement = copy(c.authorizationStatement);
        a.admissionTag = c.admissionTag;
        // Reconstruct exact post-root now, before asking for any authorization.
        s66(a, s);
        s.operations.push(a);
      });
      return publicOperation(this.#operation(r.ownerOperationRef));
    });
  }

  async prepareWithdrawal(input) {
    const request = this.#request(input, ['ownerOperationRef', 'identitySHA256', 'sourceNoteId', 'recipient',
      'epoch']);
    hex(request.sourceNoteId);
    hex(request.recipient, 20);
    uint(request.epoch);
    return this.#exclusive(async () => {
      await this.#authenticate();
      const existing = this.#duplicate(request, 'W39');
      if (existing) return publicOperation(existing);
      const source = this.#record.data.notes.find(note => note.noteId === request.sourceNoteId);
      need(source?.status === 'AVAILABLE', 'CUSTODY_SOURCE_UNAVAILABLE');
      validateNote(source, this.#identity);
      const observed = snapshot(await this.#observer.readSnapshot(), this.#identity);
      need(BigInt(observed.raw.timestamp) / 600n === BigInt(request.epoch), 'CUSTODY_EPOCH');
      need(observed.commitments.includes('0x' + source.commitment) && !observed.nullifiers.includes('0x' + noteNF(source,
        this.#identity)), 'CUSTODY_SOURCE_MEMBERSHIP');
      need(observed.publicState.outputCapacity > 0, 'CUSTODY_OUTPUT_CAPACITY');
      await this.#write(state => {
        state.notes.find(note => note.noteId === source.noteId).status = 'LOCKED';
        state.operations.push({
          ownerOperationRef: request.ownerOperationRef, kind: 'W39', request, stage: 'PREPARED', source: source.noteId,
          change: null, recovery: null, before: observed.raw, terms: {
            epoch: request.epoch, recipient: request.recipient, amount: source.opening.value
          }, nonces: null, authorizationStatement: null, admissionTag: null, signingIntent: null, authorization: null,
          depositWitness: null, withdrawalWitness: null, submission: null, transactionHash: null, confirmation: null,
          nativePreparation: null, fundingHistory: [], withdrawalHistory: [], recoveryCredit: null,
        });
      });
      return publicOperation(this.#operation(request.ownerOperationRef));
    });
  }

  async withdrawalInput(reference) {
    ref(reference);
    return this.#exclusive(async () => {
      await this.#authenticate();
      const operation = this.#operation(reference);
      need(operation.kind === 'W39', 'CUSTODY_KIND');
      if (operation.withdrawalWitness) return copy(operation.withdrawalWitness);
      need(operation.stage === 'PREPARED', 'CUSTODY_STAGE');
      const intent = signingIntent(operation, this.#record.data);
      await this.#write(state => {
        const action = state.operations.find(value => value.ownerOperationRef === reference);
        action.signingIntent = intent;
        action.stage = 'SIGNING';
      });
      return this.#finishSigning(reference);
    });
  }
  /** Only an expired, never-dispatched W39 may renew. The locked note, full
   * value, canonical nullifier and destination stay fixed across every epoch. */
  async renewWithdrawalEpoch(input) {
    const request = copy(input);
    exact(request, ['ownerOperationRef', 'epoch']);
    ref(request.ownerOperationRef);
    uint(request.epoch);
    return this.#exclusive(async () => {
      await this.#authenticate();
      const operation = this.#operation(request.ownerOperationRef);
      need(operation.kind === 'W39' && operation.submission === null && ['PREPARED', 'SIGNING', 'AUTHORIZED'].includes(operation.stage),
        'CUSTODY_RENEWAL_STAGE');
      if (operation.terms.epoch === request.epoch) return publicOperation(operation);
      const observed = snapshot(await this.#observer.readSnapshot(), this.#identity);
      const source = this.#record.data.notes.find(note => note.noteId === operation.source);
      need(BigInt(observed.raw.timestamp) / 600n === BigInt(request.epoch) && BigInt(request.epoch) > BigInt(operation.terms.epoch),
        'CUSTODY_RENEWAL_EPOCH');
      need(source.status === 'LOCKED' && observed.commitments.includes('0x' + source.commitment) && !observed.nullifiers.includes('0x' + noteNF(source,
        this.#identity)), 'CUSTODY_RENEWAL_SOURCE');
      await this.#write(state => {
        const action = state.operations.find(value => value.ownerOperationRef === request.ownerOperationRef);
        action.withdrawalHistory.push({
          epoch: action.terms.epoch, before: action.before, signingIntent: action.signingIntent, withdrawalWitness: action.withdrawalWitness
        });
        action.terms.epoch = request.epoch;
        action.before = observed.raw;
        action.signingIntent = null;
        action.withdrawalWitness = null;
        action.stage = 'PREPARED';
      });
      return publicOperation(this.#operation(request.ownerOperationRef));
    });
  }
  /** Expired D26 authorization can renew only before any dispatch latch. Its
   * source note/key/value stay fixed; the old epoch is canonically unusable. */
  async renewFundingEpoch(input) {
    const r = copy(input);
    exact(r, ['ownerOperationRef', 'epoch']);
    ref(r.ownerOperationRef);
    uint(r.epoch);
    return this.#exclusive(async () => {
      await this.#authenticate();
      const a = this.#operation(r.ownerOperationRef);
      need(a.kind === 'D26' && a.submission === null && ['PREPARED', 'SIGNING', 'AUTHORIZED'].includes(a.stage),
        'CUSTODY_RENEWAL_STAGE');
      if (a.terms.epoch === r.epoch) return publicOperation(a);
      const observed = snapshot(await this.#observer.readSnapshot(), this.#identity), n = this.#record.data.notes.find(n => n.noteId === a.source);
      need(BigInt(observed.raw.timestamp) / 600n === BigInt(r.epoch) && BigInt(r.epoch) > BigInt(a.terms.epoch),
        'CUSTODY_RENEWAL_EPOCH');
      need(n.status === 'UNISSUED' && !observed.commitments.includes('0x' + n.commitment), 'CUSTODY_RENEWAL_SOURCE');
      await this.#write(s => {
        const op = s.operations.find(v => v.ownerOperationRef === r.ownerOperationRef);
        op.fundingHistory.push({
          epoch: op.terms.epoch, signingIntent: op.signingIntent, depositWitness: op.depositWitness
        });
        op.terms.epoch = r.epoch;
        op.before = observed.raw;
        op.signingIntent = null;
        op.depositWitness = null;
        op.stage = 'PREPARED';
      });
      return publicOperation(this.#operation(r.ownerOperationRef));
    });
  }

  nativeInvoiceRequests(r) {
    this.#ready();
    const a = this.#operation(r);
    need(a.nativePreparation !== null, 'CUSTODY_NATIVE_REQUIRED');
    return genericBalanceNativeInvoiceRequests(a.nativePreparation, this.invoiceRequests(r));
  }

  nativeCapsuleInputs(input) {
    const r = copy(input);
    exact(r, ['ownerOperationRef', 'authorizationProof']);
    this.#ready();
    const a = this.#operation(r.ownerOperationRef);
    need(a.nativePreparation !== null && a.authorization !== null, 'CUSTODY_NATIVE_AUTHORIZATION_REQUIRED');
    const prepared = prepareGenericBalanceNativeCapsules({
      preparation: a.nativePreparation, signed: a.authorization, authorizationWords: fundedAuthorizationWords(a.authorizationStatement)
    });
    return copy({
      statement: prepared.capsules.statement, expectedPublicInputs: capsuleAuthorizationWords(prepared.capsules.statement),
      inputs: prepared.capsules.ownerAuthorizationInputs(r.authorizationProof), rolePackets: prepared.rolePackets,
      providerRiskSalts: prepared.providerRiskSalts, invoiceRequests: prepared.invoiceRequests
    });
  }
  /** Owner-only circuit/prover channel. Caches the original signature before
   * release; no arbitrary message, PEM, signing callback or imported note. */
  async depositInput(r) {
    ref(r);
    return this.#exclusive(async () => {
      await this.#authenticate();
      const a = this.#operation(r);
      need(a.kind === 'D26', 'CUSTODY_KIND');
      if (a.depositWitness) return copy(a.depositWitness);
      need(a.stage === 'PREPARED', 'CUSTODY_STAGE');
      const intent = signingIntent(a, this.#record.data);
      await this.#write(s => {
        const op = s.operations.find(a => a.ownerOperationRef === r);
        op.signingIntent = intent;
        op.stage = 'SIGNING';
      });
      return this.#finishSigning(r);
    });
  }

  invoiceRequests(r) {
    this.#ready();
    const a = this.#operation(r);
    need(a.kind === 'S66', 'CUSTODY_KIND');
    return fundedSigningRequests(compile(a, this.#record.data)).invoices.map(v => ({
      ...v, message: v.message.toString('hex')
    }));
  }

  async authorizeOperation(input) {
    const r = copy(input);
    exact(r, ['ownerOperationRef', 'invoiceSignatures']);
    ref(r.ownerOperationRef);
    return this.#exclusive(async () => {
      await this.#authenticate();
      const a = this.#operation(r.ownerOperationRef);
      need(a.kind === 'S66', 'CUSTODY_KIND');
      if (a.authorization) {
        need(equal(a.authorization.signatures.invoiceSignatures.slice(0, r.invoiceSignatures.length),
          r.invoiceSignatures) && r.invoiceSignatures.length === a.authorization.ownerWitness.graph.activeCount,
          'CUSTODY_AUTHORIZATION_REUSE');
        return copy(a.authorization);
      }
      need(a.stage === 'PREPARED', 'CUSTODY_STAGE');
      const intent = signingIntent(a, this.#record.data, r.invoiceSignatures);
      await this.#write(s => {
        const op = s.operations.find(a => a.ownerOperationRef === r.ownerOperationRef);
        op.signingIntent = intent;
        op.stage = 'SIGNING';
      });
      return this.#finishSigning(r.ownerOperationRef);
    });
  }

  async #finishSigning(r) {
    const a = this.#operation(r);
    need(a.stage === 'SIGNING' && a.submission === null, 'CUSTODY_RESUME_STAGE');
    need(equal(a.signingIntent, signingIntent(a, this.#record.data, a.signingIntent.invoiceSignatures)),
      'CUSTODY_SIGNING_INTENT');
    const n = this.#record.data.notes.find(n => n.noteId === a.source);
    validateNote(n, this.#identity);
    let result;
    let resultField;
    if (a.kind === 'D26') {
      result = walletDepositInput({
        scope: this.#identity.scope, policy: this.#identity.policy, epoch: a.terms.epoch, note: {
          ...n.opening, ...keyFor(n)
        },
      });
      resultField = 'depositWitness';
    } else if (a.kind === 'W39') {
      result = walletWithdrawInput({
        scope: this.#identity.scope, policy: this.#identity.policy, epoch: a.terms.epoch, note: {
          ...n.opening, ...keyFor(n)
        }, path: w39(a, this.#record.data).inputPath, recipient: a.terms.recipient,
      });
      resultField = 'withdrawalWitness';
    } else {
      result = attachFundedSignatures(compile(a, this.#record.data), {
        ownerSignature: signature(keyFor(n), Buffer.from(a.signingIntent.messageHex, 'hex')).toString('hex'),
        invoiceSignatures: a.signingIntent.invoiceSignatures,
      });
      resultField = 'authorization';
    }
    await this.#write(s => {
      const op = s.operations.find(a => a.ownerOperationRef === r);
      op[resultField] = copy(result);
      op.stage = 'AUTHORIZED';
    });
    return copy(result);
  }
  /** Explicit private recovery. It accepts only the opaque reference, never new
   * terms, nonces, notes, message bytes or invoice signatures. A new ECDSA byte
   * string for the SAME durable authorization is safe before a dispatch latch. */
  async resumeAuthorization(r) {
    ref(r);
    return this.#exclusive(async () => {
      await this.#authenticate();
      const a = this.#operation(r);
      if (signedResult(a) !== null) return copy(signedResult(a));
      need(a.submission === null && a.stage === 'SIGNING', 'CUSTODY_RESUME_STAGE');
      return this.#finishSigning(r);
    });
  }

  ownerPlan(r) {
    this.#ready();
    const a = this.#operation(r);
    return copy({
      ...plan(a, this.#record.data), ...(a.kind === 'S66' ? {
        authorizationSHA256: a.authorization ? objectDigest(a.authorization): null, authorizationPublicInputs: fundedAuthorizationWords(a.authorizationStatement)
      }: {
      })
    });
  }
  /** The single dispatch permission is persisted/read back before returning.
   * A retry, including a lost response, NEVER issues a second dispatch lease. */
  async bindSubmission(input) {
    const r = copy(input);
    exact(r, ['ownerOperationRef', 'proofHex', 'publicInputs', 'calldata', 'authorizationSHA256']);
    ref(r.ownerOperationRef);
    proofHex(r.proofHex);
    return this.#exclusive(async () => {
      await this.#authenticate();
      const a = this.#operation(r.ownerOperationRef), p = plan(a, this.#record.data);
      need(equal(r.publicInputs, p.publicInputs), 'CUSTODY_SUBMISSION_WORDS');
      need(r.authorizationSHA256 ===(a.kind === 'S66' && a.authorization ? objectDigest(a.authorization): null),
        'CUSTODY_A0_HASH');
      const calldata = genericProofCalldata(this.#artifact, METHODS[a.kind], Buffer.from(r.proofHex,
        'hex'), p.publicInputs, p.guards);
      need(r.calldata === calldata, 'CUSTODY_CALLDATA');
      const submission = {
        proofHex: r.proofHex, proofSHA256: bytesDigest(Buffer.from(r.proofHex, 'hex')), publicInputs: p.publicInputs,
        calldata, calldataSHA256: bytesDigest(Buffer.from(calldata.slice(2), 'hex')), guards: p.guards ?? null,
        authorizationSHA256: r.authorizationSHA256
      };
      if (a.submission) {
        need(equal(a.submission, submission), 'CUSTODY_SUBMISSION_REUSE');
        return {
          ...publicOperation(a), dispatchAllowed: false
        };
      }
      need(a.stage === 'AUTHORIZED', 'CUSTODY_AUTHORIZATION_REQUIRED');
      await this.#write(s => {
        const op = s.operations.find(a => a.ownerOperationRef === r.ownerOperationRef);
        op.submission = submission;
        op.stage = 'SUBMITTING';
      });
      return {
        ...publicOperation(this.#operation(r.ownerOperationRef)), dispatchAllowed: true
      };
    });
  }

  async acknowledgeSubmitted(input) {
    const r = copy(input);
    exact(r, ['ownerOperationRef', 'transactionHash']);
    hex(r.transactionHash);
    return this.#exclusive(async () => {
      await this.#authenticate();
      const a = this.#operation(r.ownerOperationRef);
      need(a.submission, 'CUSTODY_SUBMISSION_REQUIRED');
      if (a.transactionHash) need(a.transactionHash === r.transactionHash, 'CUSTODY_TRANSACTION_REUSE');
      else await this.#write(s => {
        s.operations.find(a => a.ownerOperationRef === r.ownerOperationRef).transactionHash = r.transactionHash;
      });
      return publicOperation(this.#operation(r.ownerOperationRef));
    });
  }

  async markUnknown(r) {
    ref(r);
    return this.#exclusive(async () => {
      await this.#authenticate();
      const a = this.#operation(r);
      need(['SUBMITTING', 'UNKNOWN'].includes(a.stage), 'CUSTODY_STAGE');
      if (a.stage !== 'UNKNOWN') await this.#write(s => {
        s.operations.find(a => a.ownerOperationRef === r).stage = 'UNKNOWN';
      });
      return publicOperation(this.#operation(r));
    });
  }

  async reconcile(r) {
    ref(r);
    return this.#exclusive(async () => {
      await this.#authenticate();
      const a = this.#operation(r);
      need(a.submission, 'CUSTODY_SUBMISSION_REQUIRED');
      const observation = await this.#observer.readTransaction({
        ownerOperationRef: r, transactionHash: a.transactionHash, identitySHA256: binding(this.#identity),
        calldataSHA256: a.submission.calldataSHA256
      });
      if (observation === null) {
        if (a.stage === 'SUBMITTING') await this.#write(s => {
          s.operations.find(a => a.ownerOperationRef === r).stage = 'UNKNOWN';
        });
        return publicOperation(this.#operation(r));
      }
      const evidence = validateTransition(observation, a, this.#record.data);
      if (a.stage === 'CONFIRMED') {
        need(equal(evidence, a.confirmation), 'CUSTODY_CONFIRMATION_CHANGED');
        return publicOperation(a);
      }
      need(['SUBMITTING', 'UNKNOWN'].includes(a.stage), 'CUSTODY_STAGE');
      await this.#write(s => {
        const op = s.operations.find(a => a.ownerOperationRef === r);
        op.stage = 'CONFIRMED';
        op.confirmation = evidence;
        const n = s.notes.find(n => n.noteId === op.source);
        if (op.kind === 'D26') {
          n.status = 'AVAILABLE';
          n.provenance = evidence;
        } else if (op.kind === 'W39') {
          n.status = 'WITHDRAWN';
        } else {
          n.status = 'SPENT_INTERNALLY';
          if (op.change !== null) {
            const c = s.notes.find(n => n.noteId === op.change);
            c.status = 'AVAILABLE';
            c.provenance = evidence;
          }
        }
      });
      return publicOperation(this.#operation(r));
    });
  }


  /** Credit only the original S66's pre-created recovery note. This read-only
   * reconciliation never signs, regenerates A0, proves, sends or guesses from a
   * latest spent bit. Reconcile the original S66 first if its result is unknown. */
  async reconcileRecovery(input) {
    const request = copy(input);
    validateRecoveryRequest(request);
    return this.#exclusive(async () => {
      await this.#authenticate();
      const operation = this.#operation(request.ownerOperationRef);
      need(operation.kind === 'S66' && operation.stage === 'CONFIRMED'
        && operation.confirmation !== null, 'CUSTODY_RECOVERY_SOURCE_UNCONFIRMED');
      if (operation.recoveryCredit !== null) need(equal(operation.recoveryCredit.request, request),
        'CUSTODY_RECOVERY_REUSE');
      need(!this.#record.data.operations.some(other => other !== operation && other.recoveryCredit !== null
        && (other.recoveryCredit.request.transactionHash === request.transactionHash
          || other.recoveryCredit.request.calldataSHA256 === request.calldataSHA256)), 'CUSTODY_RECOVERY_REUSE');
      const interruptedCredits = this.#record.data.writeRecoveries.map(value => value.mutation)
        .filter(value => value.type === 'RECOVERY_CREDIT' && value.ownerOperationRef === request.ownerOperationRef);
      for (const mutation of interruptedCredits) need(equal(mutation.recoveryRequest, request), 'CUSTODY_RECOVERY_REUSE');
      const observation = await this.#observer.readTransaction({
        ...request, identitySHA256: binding(this.#identity)
      });
      need(observation !== null, 'CUSTODY_RECOVERY_UNOBSERVED');
      for (const mutation of interruptedCredits) need(objectDigest(observation) === mutation.recoveryObservationSHA256,
        'CUSTODY_RECOVERY_CONFIRMATION_CHANGED');
      const confirmation = validateRecoveryTransition(observation, operation, this.#record.data,
        this.#artifact, request);
      const credit = {version: 1, request, observation: copy(observation), confirmation};
      if (operation.recoveryCredit !== null) need(equal(operation.recoveryCredit, credit),
        'CUSTODY_RECOVERY_CONFIRMATION_CHANGED');
      else await this.#write(state => {
        const original = state.operations.find(value => value.ownerOperationRef === request.ownerOperationRef);
        const note = state.notes.find(value => value.noteId === original.recovery);
        need(note.status === 'UNISSUED', 'CUSTODY_RECOVERY_ALREADY_CREDITED');
        original.recoveryCredit = credit;
        note.status = 'AVAILABLE';
        note.provenance = confirmation;
      });
      return {ownerOperationRef: request.ownerOperationRef, recoveryStage: 'CONFIRMED', dispatchAllowed: false};
    });
  }

  close() {
    this.#closed = true;
    this.#password = null;
    this.#record = null;
    this.#pending = null;
    this.#pendingMutation = null;
  }
}
/** Reject all incomplete/reverted/latest-state-only observations. Successful
 * exact transaction + StateAdvanced + full transaction-specific delta required.
 * Status zero is intentionally NOT an unlock protocol in this draft. */
function validateTransition(o, a, state) {
  exact(o, ['identitySHA256', 'transaction', 'receipt', 'before', 'after', 'stateAdvanced', 'transition',
    ...(a.kind === 'W39' ? ['withdrawal']: [])]);
  const id = state.identity;
  need(o.identitySHA256 === binding(id), 'CUSTODY_OBSERVER_IDENTITY');
  const tx = o.transaction, r = o.receipt, e = o.stateAdvanced, tr = o.transition;
  exact(tx, ['hash', 'to', 'value', 'calldata']);
  exact(r, ['transactionHash', 'blockHash', 'status']);
  hex(tx.hash);
  need(tx.to === id.pool && tx.calldata === a.submission.calldata && tx.value ===(a.kind === 'D26' && id.asset.kind === 'NATIVE'
    ? a.terms.amount: '0'), 'CUSTODY_EXACT_TRANSACTION');
  need(r.status === 1 && r.transactionHash === tx.hash, 'CUSTODY_SUCCESS_REQUIRED');
  if (a.transactionHash) need(a.transactionHash === tx.hash, 'CUSTODY_TRANSACTION_HASH');
  const before = snapshot(o.before, id), after = snapshot(o.after, id), prepared = snapshot(a.before,
    id), p = plan(a, state);
  need(r.blockHash === after.raw.blockHash, 'CUSTODY_RECEIPT_BLOCK');
  if (a.kind === 'S66') need(equal(before.publicState, prepared.publicState) && equal(before.commitments,
    prepared.commitments) && equal(before.nullifiers, prepared.nullifiers) && equal(before.roots, prepared.roots),
    'CUSTODY_BEFORE_CHANGED');
  need(BigInt(after.publicState.sequence) === BigInt(before.publicState.sequence) + 1n, 'CUSTODY_SEQUENCE');
  const inserts = a.kind === 'D26' ? [p.statement.output]: a.kind === 'S66' ? [p.statement.reserveCommitment,
  p.statement.changeCommitment]: [];
  const spends = a.kind === 'D26' ? []: [a.kind === 'S66' ? p.statement.inputNullifier: p.statement.nullifier];
  exact(tr, ['insertedCommitments', 'spentNullifiers', 'admissionTag']);
  need(equal(tr.insertedCommitments, inserts) && equal(tr.spentNullifiers, spends) && tr.admissionTag ===(a.kind === 'S66'
    ? a.admissionTag: null), 'CUSTODY_TRANSITION');
  need(equal(after.commitments, [...before.commitments, ...inserts.map(x => '0x' + x)]) && equal(after.nullifiers,
    [...before.nullifiers, ...spends.map(x => '0x' + x)]), 'CUSTODY_TRANSITION');
  need(equal(after.roots, a.kind === 'W39' ? before.roots: [...before.roots, after.publicState.root]),
    'CUSTODY_ROOT_HISTORY');
  exact(e, ['address', 'transactionHash', 'blockHash', 'sequence', 'root', 'spent', 'leaves', 'consumed']);
  need(e.address === id.pool && e.transactionHash === tx.hash && e.blockHash === r.blockHash && e.sequence === after.publicState.sequence
    && e.root === after.publicState.root && e.spent === after.publicState.spentDigest && e.leaves === after.publicState.leaves
    && e.consumed === after.publicState.spent, 'CUSTODY_STATE_ADVANCED');
  if (a.kind === 'S66') {
    need(before.publicState.sequence === p.guards.expectedSequence && after.publicState.root === p.guards.expectedPostRoot,
      'CUSTODY_S66_GUARDS');
    need(BigInt(after.raw.timestamp) >= BigInt(p.statement.validFrom) && BigInt(after.raw.timestamp) < BigInt(p.statement.validUntil),
      'CUSTODY_WINDOW');
    for (const key of ['backedAmount', 'actualAssetBalance', 'surplus', 'outputCapacity', 'unrelatedNative']) need(before.publicState[key] === after.publicState[key],
      'CUSTODY_BACKING_CHANGED');
    need(after.publicState.liveReservations === before.publicState.liveReservations + 1, 'CUSTODY_RESERVATION_DELTA');
  } else if (a.kind === 'D26') {
    need(!before.commitments.includes('0x' + p.statement.output), 'CUSTODY_DEPOSIT_ALREADY_PRESENT');
    need(BigInt(after.raw.timestamp) / 600n === BigInt(a.terms.epoch), 'CUSTODY_EPOCH');
    for (const k of ['backedAmount', 'actualAssetBalance']) need(BigInt(after.publicState[k]) === BigInt(before.publicState[k]) + BigInt(a.terms.amount),
      'CUSTODY_DEPOSIT_BACKING');
    need(after.publicState.outputCapacity === before.publicState.outputCapacity + 1 && after.publicState.liveReservations === before.publicState.liveReservations,
      'CUSTODY_DEPOSIT_COUNTERS');
    need(after.publicState.surplus === before.publicState.surplus && after.publicState.unrelatedNative === before.publicState.unrelatedNative,
      'CUSTODY_DEPOSIT_BACKING');
  } else {
    const source = state.notes.find(note => note.noteId === a.source);
    const withdrawal = o.withdrawal;
    exact(withdrawal, ['address', 'transactionHash', 'blockHash', 'recipient', 'amount', 'nullifier']);
    need(withdrawal.address === id.pool && withdrawal.transactionHash === tx.hash && withdrawal.blockHash === r.blockHash
      && withdrawal.recipient === a.terms.recipient && withdrawal.amount === source.opening.value && withdrawal.nullifier === p.statement.nullifier,
      'CUSTODY_WITHDRAWAL_EVENT');
    need(before.commitments.includes('0x' + source.commitment) && !before.nullifiers.includes('0x' + p.statement.nullifier)
      && before.roots.includes('0x' + p.statement.root), 'CUSTODY_WITHDRAWAL_MEMBERSHIP');
    need(BigInt(after.raw.timestamp) / 600n === BigInt(a.terms.epoch), 'CUSTODY_EPOCH');
    need(before.publicState.root === after.publicState.root, 'CUSTODY_WITHDRAWAL_ROOT');
    for (const field of ['backedAmount', 'actualAssetBalance']) {
      need(BigInt(after.publicState[field]) === BigInt(before.publicState[field]) - BigInt(a.terms.amount),
        'CUSTODY_WITHDRAWAL_BACKING');
    }
    need(before.publicState.outputCapacity > 0 && after.publicState.outputCapacity === before.publicState.outputCapacity - 1
      && after.publicState.liveReservations === before.publicState.liveReservations, 'CUSTODY_WITHDRAWAL_COUNTERS');
    need(after.publicState.surplus === before.publicState.surplus && after.publicState.unrelatedNative === before.publicState.unrelatedNative,
      'CUSTODY_WITHDRAWAL_BACKING');
  }
  return {
    identitySHA256: binding(id), transactionHash: tx.hash, blockHash: r.blockHash, method: METHODS[a.kind],
    postRoot: after.publicState.root, postSequence: after.publicState.sequence, calldataSHA256: a.submission.calldataSHA256,
    trust: OBSERVATION_TRUST, backing: id.backing, ...(a.kind === 'W39' ? {
      recipient: a.terms.recipient, amount: a.terms.amount, nullifier: p.statement.nullifier
    }: {
    })
  };
}

function validateRecoveryRequest(request) {
  exact(request, ['ownerOperationRef', 'transactionHash', 'calldataSHA256']);
  ref(request.ownerOperationRef);
  hex(request.transactionHash);
  hex(request.calldataSHA256);
}

/** Decode only enough F51 framing to round-trip the exact observed bytes. The
 * owned observer establishes chain success; this independently binds its typed
 * recovery statement to that transaction, without accepting arbitrary calldata. */
function validateRecoveryCalldata(calldata, recovery, artifact) {
  need(typeof calldata === 'string' && /^0x(?:[0-9a-f]{2})+$/.test(calldata)
    && calldata.length <= 1024 * 1024 + 2, 'CUSTODY_RECOVERY_CALLDATA');
  const body = calldata.slice(10);
  const word = offset => {
    need(Number.isSafeInteger(offset) && offset >= 0 && (offset + 32) * 2 <= body.length,
      'CUSTODY_RECOVERY_CALLDATA');
    return BigInt('0x' + body.slice(offset * 2, (offset + 32) * 2));
  };
  need(word(0) === 64n, 'CUSTODY_RECOVERY_CALLDATA');
  const size = word(64);
  need(size > 0n && size <= 512n * 1024n, 'CUSTODY_RECOVERY_CALLDATA');
  const proofBytes = Number(size), inputsOffset = 96 + Math.ceil(proofBytes / 32) * 32;
  need(word(32) === BigInt(inputsOffset) && word(inputsOffset) === 51n
    && body.length === (inputsOffset + 32 + 51 * 32) * 2, 'CUSTODY_RECOVERY_CALLDATA');
  const proof = Buffer.from(body.slice(192, (96 + proofBytes) * 2), 'hex');
  const inputs = ['scope', 'policy', 'asset', 'acceptedRoot', 'reserveNullifier', 'recoveryCommitment']
    .flatMap(key => wordsBE(Buffer.from(recovery[key], 'hex')).map(String))
    .concat(recovery.settleBefore, recovery.validFrom, recovery.validUntil);
  need(calldata === genericProofCalldata(artifact, RECOVERY_METHOD, proof, inputs), 'CUSTODY_RECOVERY_CALLDATA');
}

function validateRecoveryTransition(observation, operation, state, artifact, request) {
  validateRecoveryRequest(request);
  const id = state.identity, a = operation, o = observation;
  need(a.kind === 'S66' && a.stage === 'CONFIRMED' && a.confirmation !== null
    && a.ownerOperationRef === request.ownerOperationRef, 'CUSTODY_RECOVERY_SOURCE_UNCONFIRMED');
  exact(o, ['identitySHA256', 'transaction', 'receipt', 'before', 'after', 'stateAdvanced', 'transition', 'recovery']);
  need(o.identitySHA256 === binding(id), 'CUSTODY_OBSERVER_IDENTITY');
  const tx = o.transaction, receipt = o.receipt, event = o.stateAdvanced, transition = o.transition;
  const recovery = o.recovery, original = a.authorizationStatement;
  exact(recovery, ['scope', 'policy', 'asset', 'acceptedRoot', 'reserveNullifier', 'recoveryCommitment',
    'settleBefore', 'validFrom', 'validUntil']);
  for (const key of ['scope', 'policy', 'asset', 'acceptedRoot', 'reserveNullifier', 'recoveryCommitment']) hex(recovery[key]);
  for (const key of ['settleBefore', 'validFrom', 'validUntil']) uint(recovery[key]);
  need(recovery.scope === id.scope && recovery.policy === id.policy && recovery.asset === id.asset.identity
    && recovery.reserveNullifier === original.reserveNullifier
    && recovery.recoveryCommitment === original.recoveryCommitment
    && recovery.settleBefore === original.settleBefore, 'CUSTODY_RECOVERY_BINDING');
  const note = state.notes.find(value => value.noteId === a.recovery);
  need(note?.role === 'RECOVERY' && note.operationRef === a.ownerOperationRef
    && note.commitment === recovery.recoveryCommitment && note.opening.value === a.terms.budget,
    'CUSTODY_RECOVERY_NOTE');
  const source = state.notes.find(value => value.noteId === a.source);
  need(source?.status === 'SPENT_INTERNALLY', 'CUSTODY_RECOVERY_SOURCE_UNCONFIRMED');
  exact(tx, ['hash', 'to', 'value', 'calldata']);
  exact(receipt, ['transactionHash', 'blockHash', 'status']);
  need(tx.hash === request.transactionHash && tx.to === id.pool && tx.value === '0', 'CUSTODY_EXACT_TRANSACTION');
  validateRecoveryCalldata(tx.calldata, recovery, artifact);
  need(bytesDigest(Buffer.from(tx.calldata.slice(2), 'hex')) === request.calldataSHA256, 'CUSTODY_RECOVERY_CALLDATA');
  need(receipt.status === 1 && receipt.transactionHash === tx.hash, 'CUSTODY_SUCCESS_REQUIRED');
  const before = snapshot(o.before, id), after = snapshot(o.after, id), prepared = snapshot(a.before, id);
  const originalPlan = s66(a, state), confirmation = a.confirmation;
  need(confirmation.identitySHA256 === binding(id) && confirmation.method === METHODS.S66
    && confirmation.calldataSHA256 === a.submission.calldataSHA256
    && confirmation.postRoot === originalPlan.guards.expectedPostRoot
    && BigInt(confirmation.postSequence) === BigInt(prepared.publicState.sequence) + 1n,
    'CUSTODY_RECOVERY_SOURCE_UNCONFIRMED');
  // All historical state captured by S66 must remain an exact prefix. Other
  // operations may intervene, including a real spend of the original change.
  const prefix = (whole, part) => equal(whole.slice(0, part.length), part);
  need(prefix(before.commitments, [...prepared.commitments, '0x' + original.reserveCommitment,
    '0x' + original.changeCommitment])
    && prefix(before.nullifiers, [...prepared.nullifiers, '0x' + original.inputNullifier])
    && prefix(before.roots, [...prepared.roots, confirmation.postRoot])
    && BigInt(before.publicState.sequence) >= BigInt(confirmation.postSequence), 'CUSTODY_RECOVERY_SOURCE_HISTORY');
  need(before.roots.indexOf('0x' + recovery.acceptedRoot) >= prepared.roots.length,
    'CUSTODY_RECOVERY_ACCEPTED_ROOT');
  need(!before.commitments.includes('0x' + recovery.recoveryCommitment)
    && !before.nullifiers.includes('0x' + recovery.reserveNullifier), 'CUSTODY_RECOVERY_ALREADY_CONSUMED');
  need(BigInt(recovery.settleBefore) <= BigInt(recovery.validFrom)
    && BigInt(recovery.validFrom) < BigInt(recovery.validUntil)
    && BigInt(after.raw.timestamp) >= BigInt(recovery.validFrom)
    && BigInt(after.raw.timestamp) < BigInt(recovery.validUntil)
    && BigInt(after.raw.timestamp) >= BigInt(before.raw.timestamp), 'CUSTODY_RECOVERY_WINDOW');
  need(receipt.blockHash === after.raw.blockHash, 'CUSTODY_RECEIPT_BLOCK');
  need(BigInt(after.publicState.sequence) === BigInt(before.publicState.sequence) + 1n, 'CUSTODY_SEQUENCE');
  exact(transition, ['insertedCommitments', 'spentNullifiers', 'admissionTag']);
  need(equal(transition, {insertedCommitments: [recovery.recoveryCommitment],
    spentNullifiers: [recovery.reserveNullifier], admissionTag: null}), 'CUSTODY_RECOVERY_TRANSITION');
  need(equal(after.commitments, [...before.commitments, '0x' + recovery.recoveryCommitment])
    && equal(after.nullifiers, [...before.nullifiers, '0x' + recovery.reserveNullifier]), 'CUSTODY_RECOVERY_TRANSITION');
  need(equal(after.roots, [...before.roots, after.publicState.root]), 'CUSTODY_ROOT_HISTORY');
  need(before.publicState.liveReservations > 0
    && after.publicState.liveReservations === before.publicState.liveReservations - 1
    && after.publicState.outputCapacity === before.publicState.outputCapacity + 1,
    'CUSTODY_RECOVERY_COUNTERS');
  for (const field of ['backedAmount', 'actualAssetBalance', 'surplus', 'unrelatedNative']) {
    need(before.publicState[field] === after.publicState[field], 'CUSTODY_RECOVERY_BACKING');
  }
  exact(event, ['address', 'transactionHash', 'blockHash', 'sequence', 'root', 'spent', 'leaves', 'consumed']);
  need(event.address === id.pool && event.transactionHash === tx.hash && event.blockHash === receipt.blockHash
    && event.sequence === after.publicState.sequence && event.root === after.publicState.root
    && event.spent === after.publicState.spentDigest && event.leaves === after.publicState.leaves
    && event.consumed === after.publicState.spent, 'CUSTODY_STATE_ADVANCED');
  return {
    identitySHA256: binding(id), ownerOperationRef: a.ownerOperationRef, transactionHash: tx.hash,
    blockHash: receipt.blockHash, method: RECOVERY_METHOD, calldataSHA256: request.calldataSHA256,
    postRoot: after.publicState.root, postSequence: after.publicState.sequence,
    sourceConfirmationSHA256: objectDigest(confirmation), beforeSnapshotSHA256: objectDigest(o.before),
    afterSnapshotSHA256: objectDigest(o.after), recovery: copy(recovery), trust: OBSERVATION_TRUST, backing: id.backing
  };
}

async function safePath(path, exists) {
  const directory = await lstat(dirname(resolve(path)));
  need(directory.isDirectory() && !directory.isSymbolicLink() && (process.platform === 'win32' || (directory.mode & 0o077) === 0),
    'CUSTODY_PRIVATE_DIRECTORY');
  if (exists) {
    const f = await lstat(path);
    need(f.isFile() && !f.isSymbolicLink() && f.nlink === 1 && (process.platform === 'win32' || (f.mode & 0o077) === 0),
      'CUSTODY_PRIVATE_FILE');
  }
}
/** TRUSTED OWNER BOOTSTRAP ONLY. Never deserialize this configuration/dependency
 * bag from HTTP, coordinator IPC or user intent. A real owned-runtime wrapper
 * must construct/pin it internally. Injection exists solely for host testing. */
async function openOwner(config, deps, allowAbsentRecovery) {
  exact(config, ['path', 'password', 'identity', 'poolArtifact', 'create', 'checkpoint']);
  exact(deps, ['observer', 'onCheckpoint', ...(Object.hasOwn(deps, 'vaultFactory') ? ['vaultFactory']: [])]);
  need(typeof config.path === 'string' && typeof config.password === 'string' && config.password.length > 0,
    'CUSTODY_CONFIG');
  need(typeof config.create === 'boolean', 'CUSTODY_CONFIG');
  exact(deps.observer, ['trust', 'readSnapshot', 'readTransaction']);
  need(deps.observer.trust === OBSERVATION_TRUST && typeof deps.observer.readSnapshot === 'function' && typeof deps.observer.readTransaction === 'function'
    && typeof deps.onCheckpoint === 'function', 'CUSTODY_TRUSTED_CAPABILITIES');
  const cfg = {
    ...config, identity: validateIdentity(config.identity), poolArtifact: copy(config.poolArtifact),
    checkpoint: copy(config.checkpoint)
  };
  need(objectDigest(cfg.poolArtifact) === cfg.identity.poolAbiSHA256, 'CUSTODY_ABI_IDENTITY');
  await safePath(cfg.path, !cfg.create);
  const vault = (deps.vaultFactory ?? (p => new Vault(p)))(cfg.path);
  if (cfg.create) {
    need(cfg.checkpoint === null, 'CUSTODY_CREATE_CHECKPOINT');
    need(!allowAbsentRecovery, 'CUSTODY_RECOVERY_CREATE');
    await vault.create({
      version: STATE_VERSION, profile: PROFILE, identity: cfg.identity, notes: [], operations: [], tombstones: [],
      writeRecoveries: []
    }, cfg.password);
  }
  const record = await vault.read(cfg.password);
  validateState(record.data, cfg.identity, cfg.poolArtifact);
  await safePath(cfg.path, true);
  let absent = false;
  if (!cfg.create) {
    const cp = cfg.checkpoint;
    validateCheckpoint(cp, cfg.identity);
    absent = Boolean(cp.pending && equal(checkpointRecord(record), cp.acknowledged));
    need(equal(checkpointRecord(record), pendingRecord(cp)) || (allowAbsentRecovery && absent), 'CUSTODY_CHECKPOINT');
  }
  const owner = new OwnerCustody(cfg, {
    ...deps, vault
  }, record);
  // Never acknowledge the old base before the explicit recovery record and any
  // tombstone have themselves passed CAS/readback/checkpoint retention.
  const recovery = absent ? await owner.recoverAbsentCheckpoint(cfg.checkpoint): null;
  if (!absent) await deps.onCheckpoint(checkpoint(cfg.identity, record));
  const publicView = Object.freeze({
    summary:() => owner.summary(), operation: r => owner.projection(r)
  });
  return Object.freeze({
    owner, publicView, recovery
  });
}
export const openTrustedOwnerDraft = (config, deps) => openOwner(config, deps, false);
/** Explicit surviving-keeper restart recovery; ordinary open never adopts an
 * absent pending write. Mismatched identity or non-exact storage still fails. */
export const recoverUncommittedOwnerDraft = (config, deps) => openOwner(config, deps, true);
