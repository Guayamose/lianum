/** Private same-realm bootstrap only. Public platform HTTP is not connected.
 * Holds original session/approval/owner references; no factories or callbacks.
 * Reads request diagnostics only and reconciles the exact already-latched note.
 * No balance projection, GRAPH, prepare, execute, recover, restart or adoption. */
import { types } from 'node:util';
import { randomBytes, createPublicKey, verify } from 'node:crypto';
import { assertFlatAccountSession } from '../accounts/flat-account-session.mjs';
import { flatManualNativeNoteActionTarget } from '../accounts/flat-manual-graph-session.mjs';
import { nativeValueAccountManualNoteDetails, assertOwnedNativeValueAccountAuthority } from '../../accounts/authority/native-value-account-authority-v2.mjs';
import { genericAccountIdentity, sha } from '../../../../engine/src/execution/accounts/generic-account-journal.mjs';
import { normalizeMobileOrigin } from '../../../../mobile-protocol/src/authorization.mjs';
import { ORIGINAL_ACCOUNT_ACCESS_PROFILE_V2, ORIGINAL_ACCOUNT_REVIEW_PROFILE_V2, ORIGINAL_ACCOUNT_REVIEW_TTL_MS,
  normalizeOriginalAccountAccessV2, normalizeOriginalAccountReviewV2, normalizeOriginalAccountSignatureV2,
  validateOriginalAccountFreshV2, originalAccountAccessMessageV2, originalAccountReviewMessageV2 }
  from '../../../../mobile-protocol/src/original-account-review-v2.mjs';
const pairings = new WeakMap(), actorBrands = new WeakMap();
const fail = code => { throw Object.assign(new Error(code), { code }); };
const need = (value, code) => { if (!value) fail(code); };
const hex = () => randomBytes(32).toString('hex');
function exact(value, fields) {
  need(value && !types.isProxy(value) && Object.getPrototypeOf(value) === Object.prototype,
    'MOBILE_ORIGINAL_ACTOR_FIELDS');
  const keys = Reflect.ownKeys(value);
  need(keys.length === fields.length && keys.every(key => fields.includes(key))
    && fields.every(key => Object.hasOwn(Object.getOwnPropertyDescriptor(value, key) ?? {}, 'value')),
  'MOBILE_ORIGINAL_ACTOR_FIELDS');
}
// Only untrusted public frames are copied. Opaque constructor originals must
// retain their reference identity and never pass through this normalizer.
function frameData(value) {
  let nodes = 0, bytes = 0;
  const budget = size => { bytes += size; need(bytes <= 8192, 'MOBILE_ORIGINAL_FRAME_DATA'); };
  function copy(input, depth) {
    need(++nodes <= 192 && depth <= 6 && !types.isProxy(input), 'MOBILE_ORIGINAL_FRAME_DATA');
    if (input === null || typeof input === 'boolean') { budget(5); return input; }
    if (typeof input === 'number') {
      need(Number.isFinite(input), 'MOBILE_ORIGINAL_FRAME_DATA'); budget(32); return input;
    }
    if (typeof input === 'string') {
      need(input.length <= 512, 'MOBILE_ORIGINAL_FRAME_DATA'); budget(Buffer.byteLength(input, 'utf8')); return input;
    }
    need(input && typeof input === 'object' && Object.getPrototypeOf(input) === Object.prototype,
      'MOBILE_ORIGINAL_FRAME_DATA');
    const names = Reflect.ownKeys(input);
    need(names.length <= 40 && names.every(name => typeof name === 'string' && name.length <= 64),
      'MOBILE_ORIGINAL_FRAME_DATA');
    const entries = [];
    for (const name of names) {
      const descriptor = Object.getOwnPropertyDescriptor(input, name);
      need(descriptor && Object.hasOwn(descriptor, 'value'), 'MOBILE_ORIGINAL_FRAME_DATA');
      budget(Buffer.byteLength(name, 'utf8')); entries.push([name, copy(descriptor.value, depth + 1)]);
    }
    return Object.fromEntries(entries);
  }
  return copy(value, 0);
}
function key(value) {
  need(typeof value === 'string' && /^04[0-9a-f]{128}$/.exec(value)?.[0] === value, 'MOBILE_ORIGINAL_PUBLIC_KEY');
  return createPublicKey({ format: 'jwk', key: { kty: 'EC', crv: 'secp256k1',
    x: Buffer.from(value.slice(2, 66), 'hex').toString('base64url'),
    y: Buffer.from(value.slice(66), 'hex').toString('base64url') } });
}
/** Pairing is a local operator action over retained opaque originals, never a
 * pairingId/publicKey lookup or a challenge request received from HTTP. */
export async function createPairedOriginalAccountActorV2(input) {
  need(arguments.length === 1, 'MOBILE_ORIGINAL_ACTOR_ARGUMENTS');
  exact(input, ['session', 'approval', 'owner', 'origin', 'devicePublicKey']);
  const { session, approval, owner, origin, devicePublicKey } = input;
  normalizeMobileOrigin(origin); const device = key(devicePublicKey);
  assertFlatAccountSession(session);
  const initial = nativeValueAccountManualNoteDetails(approval), account = initial.account;
  const requestId = initial.body.requestId, bodySHA256 = sha(initial.body), reviewSHA256 = sha(initial.review);
  need(['TOP_UP', 'EXIT'].includes(initial.body.kind), 'MOBILE_ORIGINAL_NOTE_ONLY');
  const original = () => {
    assertFlatAccountSession(session);
    const details = nativeValueAccountManualNoteDetails(approval);
    need(details.account === account && sha(details.body) === bodySHA256
      && sha(details.review) === reviewSHA256, 'MOBILE_ORIGINAL_BINDING_CHANGED');
    assertOwnedNativeValueAccountAuthority(account, { owner });
    need(flatManualNativeNoteActionTarget(session, 'reconcile', { requestId }) === approval,
      'MOBILE_ORIGINAL_SESSION_APPROVAL');
    const identity = sha(genericAccountIdentity(account.config));
    need(details.review.accountIdentitySHA256 === identity && details.review.generationId === identity
      && details.review.originalAccountLifetime === account.config.lifetime,
    'MOBILE_ORIGINAL_ACCOUNT_LIFETIME'); return details;
  };
  original();
  const pairingId = hex(), accesses = new Map(), reviews = new Map();
  let busy = false, closed = false;
  function live() { need(!closed, 'MOBILE_ORIGINAL_ACTOR_CLOSED'); original(); }
  async function binding(action) {
    live();
    const journal = await session.snapshot(); live();
    need(journal.available && journal.storageAvailable && journal.observation === 'CURRENT'
      && !journal.busy && journal.queued === 0, 'MOBILE_ORIGINAL_SESSION_UNAVAILABLE');
    const rows = journal.requests.filter(row => row.requestId === requestId);
    need(rows.length === 1 && rows[0].kind === initial.body.kind
      && ['PREPARED', 'UNKNOWN', 'CONFIRMED'].includes(rows[0].state), 'MOBILE_ORIGINAL_ALREADY_ADMITTED_REQUIRED');
    const details = original(), status = await account.privateStatus(); live();
    const operations = status.operations.filter(row => row.ownerOperationRef === initial.body.ownerOperationRef);
    need(operations.length === 1, 'MOBILE_ORIGINAL_OPERATION_REQUIRED');
    const operation = operations[0];
    need(operation.request !== null && Object.keys(initial.body).every(name => operation.request[name] === initial.body[name])
      && sha(operation.nativeManualReview) === details.review.termsSHA256
      && ['READY', 'UNKNOWN', 'CONFIRMED'].includes(operation.stage), 'MOBILE_ORIGINAL_OPERATION_CHANGED');
    if (action === 'reconcile') need(['UNKNOWN', 'CONFIRMED'].includes(rows[0].state)
      && ['UNKNOWN', 'CONFIRMED'].includes(operation.stage) && operation.submission?.dispatchLatched === true
      && typeof operation.submission.transactionHash === 'string', 'MOBILE_ORIGINAL_RECONCILE_NOT_STARTED');
    const process = await owner.publicView.summary(); live();
    const terms = details.review.terms;
    need(process.closed === false && process.identitySHA256 === terms.ownerIdentitySHA256
      && process.keyScopeSHA256 === terms.keyScopeSHA256 && process.processIdentitySHA256 === terms.processIdentitySHA256
      && Number.isSafeInteger(process.processGeneration) && process.processGeneration >= terms.processGeneration,
    'MOBILE_ORIGINAL_OWNER_SCOPE_CHANGED');
    const finalJournal = await session.snapshot(); live();
    const finalRow = finalJournal.requests.find(row => row.requestId === requestId);
    need(finalJournal.available && finalJournal.storageAvailable && finalJournal.observation === 'CURRENT'
      && !finalJournal.busy && finalJournal.queued === 0 && finalJournal.revision === journal.revision
      && finalRow?.kind === rows[0].kind && finalRow.state === rows[0].state,
    'MOBILE_ORIGINAL_REVIEW_STALE');
    const asset = terms.asset;
    return { accountIdentitySHA256: details.review.accountIdentitySHA256,
      originalAccountLifetime: details.review.originalAccountLifetime, generationId: details.review.generationId,
      requestId, kind: initial.body.kind, ownerOperationRef: initial.body.ownerOperationRef, assetId: initial.body.assetId,
      ownerIdentitySHA256: terms.ownerIdentitySHA256, keyScopeSHA256: terms.keyScopeSHA256,
      processIdentitySHA256: terms.processIdentitySHA256, originalProcessGeneration: terms.processGeneration,
      observedProcessGeneration: process.processGeneration, originalReviewSHA256: reviewSHA256,
      termsSHA256: details.review.termsSHA256, requestBindingSHA256: operation.request.bindingSHA256,
      assetBindingSHA256: operation.request.assetBindingSHA256, journalRevision: journal.revision,
      requestState: rows[0].state, authorityStage: operation.stage,
      submission: operation.submission ? { transactionHash: operation.submission.transactionHash,
        calldataSHA256: operation.submission.calldataSHA256, dispatchLatched: operation.submission.dispatchLatched } : null,
      asset: { chainId: asset.chainId, genesis: asset.genesis, pool: asset.pool, kind: asset.kind,
        token: asset.token, symbol: asset.symbol, decimals: asset.decimals },
      amountAtomic: terms.amount, recipient: terms.recipient, role: terms.role,
      custody: 'LINUX_ORIGINAL_OWNER_CUSTODY', publicNetwork: false, mobileNoteCustody: false, economicObservation: false };
  }
  await binding('read');
  // No actor or challenge has escaped yet. A failed initial observation leaves
  // no pairing claim. This synchronous recheck/claim gives concurrent creation
  // exactly one winner while preserving exclusivity after an actor is issued.
  original();
  let retained = pairings.get(session);
  if (!retained) pairings.set(session, retained = new WeakSet());
  need(!retained.has(approval), 'MOBILE_ORIGINAL_ALREADY_PAIRED');
  retained.add(approval);
  function capacity(map) {
    for (const [id, row] of map) if (row.consumed || row.value.expiresAt <= Date.now()) map.delete(id);
    need(map.size < 4, 'MOBILE_ORIGINAL_CHALLENGE_CAPACITY');
  }
  function authenticate(input, normalizer, message, map, field) {
    exact(input, [field, 'signature']);
    const value = validateOriginalAccountFreshV2(normalizer(frameData(input[field])));
    const signature = normalizeOriginalAccountSignatureV2(input.signature), retained = map.get(value.challengeId);
    need(retained && !retained.consumed && JSON.stringify(retained.value) === JSON.stringify(value)
      && value.origin === origin && value.pairingId === pairingId && value.devicePublicKey === devicePublicKey,
    'MOBILE_ORIGINAL_CHALLENGE_CHANGED');
    need(verify('sha256', message(value), { key: device, dsaEncoding: 'ieee-p1363' }, Buffer.from(signature, 'hex')),
      'MOBILE_ORIGINAL_SIGNATURE_INVALID');
    retained.consumed = true; return value;
  }
  const actor = Object.freeze({
    /** The generic nonce reveals no account or operation. The following signed
     * bootstrap permission is required before any private review is returned. */
    challenge(input) {
      need(arguments.length === 1 && !busy && !closed, 'MOBILE_ORIGINAL_ACTOR_UNAVAILABLE');
      exact(input, ['action']); need(['read', 'reconcile'].includes(input.action), 'MOBILE_ORIGINAL_ACTION');
      capacity(accesses);
      const value = normalizeOriginalAccountAccessV2({ version: 2, profile: ORIGINAL_ACCOUNT_ACCESS_PROFILE_V2,
        origin, pairingId, challengeId: hex(), nonce: hex(), expiresAt: Date.now() + ORIGINAL_ACCOUNT_REVIEW_TTL_MS,
        devicePublicKey, action: input.action });
      accesses.set(value.challengeId, { value, consumed: false }); return structuredClone(value);
    },
    async openReview(input) {
      need(arguments.length === 1 && !busy && !closed, 'MOBILE_ORIGINAL_ACTOR_UNAVAILABLE'); busy = true;
      try {
        const access = authenticate(input, normalizeOriginalAccountAccessV2, originalAccountAccessMessageV2, accesses, 'challenge');
        const selected = await binding(access.action); live(); validateOriginalAccountFreshV2(access);
        capacity(reviews);
        const value = normalizeOriginalAccountReviewV2({ version: 2, profile: ORIGINAL_ACCOUNT_REVIEW_PROFILE_V2,
          origin, pairingId, challengeId: hex(), nonce: hex(), expiresAt: Date.now() + ORIGINAL_ACCOUNT_REVIEW_TTL_MS,
          devicePublicKey, action: access.action, bootstrapChallengeId: access.challengeId, binding: selected });
        reviews.set(value.challengeId, { value, consumed: false }); return structuredClone(value);
      } finally { busy = false; }
    },
    async submit(input) {
      need(arguments.length === 1 && !busy && !closed, 'MOBILE_ORIGINAL_ACTOR_UNAVAILABLE'); busy = true;
      try {
        const review = authenticate(input, normalizeOriginalAccountReviewV2, originalAccountReviewMessageV2, reviews, 'review');
        const selected = await binding(review.action); live();
        need(JSON.stringify(selected) === JSON.stringify(review.binding), 'MOBILE_ORIGINAL_REVIEW_STALE');
        validateOriginalAccountFreshV2(review); original();
        let admission = null;
        if (review.action === 'reconcile') {
          // This may write original custody acknowledgements/checkpoints. The
          // genuine coordinator returns cached terminal entries when CONFIRMED;
          // neither branch is treated here as new canonical balance evidence.
          admission = session.reconcile(requestId);
          const completed = await session.idle(); live();
          const row = completed.admissions.find(value => value.sequence === admission.sequence);
          need(row?.action === 'reconcile' && row.requestId === requestId, 'MOBILE_ORIGINAL_ADMISSION_CHANGED');
          admission = { ...admission, state: row.state, errorCode: row.errorCode };
        }
        const observed = await binding('read'); live();
        return { version: 2, profile: 'PAIRED_ORIGINAL_ACCOUNT_DIAGNOSTIC_V2', action: review.action,
          binding: observed, admission, privatePortfolio: null, economicObservation: null,
          noteCustodyOnDevice: false, nativeEffectsEstablished: false };
      } finally { busy = false; }
    },
    close() { need(arguments.length === 0, 'MOBILE_ORIGINAL_ACTOR_ARGUMENTS'); closed = true;
      for (const row of [...accesses.values(), ...reviews.values()]) row.consumed = true;
      return { closed: true, retainedOriginalSession: true, retainedOriginalCustody: true }; },
  });
  actorBrands.set(actor, { live, descriptor: Object.freeze({ origin, pairingId, devicePublicKey }) });
  return actor;
}

/** Authority originates in the private same-realm bootstrap, never metadata. */
export function assertPairedOriginalAccountActorV2(actor) {
  need(arguments.length === 1 && !types.isProxy(actor), 'MOBILE_ORIGINAL_ACTOR_ORIGINAL_REQUIRED');
  const retained = actorBrands.get(actor);
  need(retained, 'MOBILE_ORIGINAL_ACTOR_ORIGINAL_REQUIRED'); retained.live();
}
/** Explicit operator pairing handoff only; HTTP never exposes this descriptor. */
export function pairedOriginalAccountActorDescriptorV2(actor) {
  need(arguments.length === 1, 'MOBILE_ORIGINAL_ACTOR_ARGUMENTS');
  assertPairedOriginalAccountActorV2(actor); return actorBrands.get(actor).descriptor;
}
