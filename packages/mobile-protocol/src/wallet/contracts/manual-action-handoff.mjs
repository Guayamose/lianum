import { validNativeNoteReview, NATIVE_NOTE_HANDOFF_PROFILE } from './native-note-review.mjs';
/** Parsed metadata only. This module cannot issue authority or choose a host.
 * The original local shell is the trust boundary; no ambient message listener. */
export const HANDOFF_PROFILE = 'ORIGINAL_MANUAL_GRAPH_HANDOFF_V1';
const fail = () => { throw new Error('WALLET_MANUAL_HANDOFF_INVALID'); };
const need = value => { if (!value) fail(); };
const digest = v => typeof v === 'string' && /^[0-9a-f]{64}$/.exec(v)?.[0] === v;
export const manualHandoffActions = Object.freeze(['accountPrepare', 'accountExecute', 'accountReconcile', 'accountRecover']);
// Canonical parsed-data comparison. Reject accessors, non-data prototypes,
// non-finite values, extra properties on arrays, and excessively large input.
export function handoffData(input) {
  let count = 0;
  function visit(value, depth) {
    need(++count <= 4096 && depth <= 16);
    if (value === null || typeof value === 'boolean' || typeof value === 'string') {
      if (typeof value === 'string') need(value.length <= 4096); return value;
    }
    if (typeof value === 'number') { need(Number.isSafeInteger(value) && !Object.is(value, -0)); return value; }
    need(value && typeof value === 'object');
    const array = Array.isArray(value);
    need(Object.getPrototypeOf(value) === (array ? Array.prototype : Object.prototype));
    const keys = Reflect.ownKeys(value);
    need(keys.every(k => typeof k === 'string'));
    if (array) need(value.length <= 4096 && keys.length === value.length + 1 && keys.includes('length')
      && Array.from({ length: value.length }, (_, index) => String(index)).every(key => keys.includes(key)));
    const result = array ? [] : {};
    for (const key of keys.filter(k => !array || k !== 'length').sort()) {
      const d = Object.getOwnPropertyDescriptor(value, key);
      need(d?.enumerable && Object.hasOwn(d, 'value'));
      Object.defineProperty(result, key, { value: visit(d.value, depth + 1), enumerable: true, writable: true, configurable: true });
    }
    return Object.freeze(result);
  }
  const value = visit(input, 0); need(JSON.stringify(value).length <= 24000); return value;
}
export const sameHandoff = (left, right) => JSON.stringify(handoffData(left)) === JSON.stringify(handoffData(right));
export function handoffDescriptor(value) {
  need(value && Object.keys(value).sort().join(',') === 'listenerId,origin');
  const port = typeof value.origin === 'string' && /^http:\/\/127\.0\.0\.1:([1-9][0-9]{0,4})$/.exec(value.origin);
  need(port && port[0] === value.origin && Number(port[1]) <= 65535 && digest(value.listenerId));
  return Object.freeze({ origin: value.origin, listenerId: value.listenerId });
}
export function manualReviewRequest(data, action, body, reviewId, descriptor) {
  const pinned = handoffDescriptor(descriptor), source = data?.manualActionHandoff;
  need(source?.profile === HANDOFF_PROFILE && source.origin === pinned.origin && source.listenerId === pinned.listenerId
    && manualHandoffActions.includes(action) && digest(reviewId));
  const nativeNote = data.account?.manualNativeNotes?.find(n => n.requestId === body.requestId);
  const graph = data.account?.manualGraphs?.find(g => g.requestId === body.requestId);
  if (nativeNote) need(!graph && validNativeNoteReview(nativeNote) && action !== 'accountRecover');
  const review = nativeNote ?? graph;
  const bindings = source.bindings?.filter(b => b.requestId === body.requestId);
  need(review && bindings?.length === 1);
  const binding = bindings[0];
  need(digest(binding.accountIdentitySHA256) && digest(binding.generationId)
    && binding.originalAccountLifetime === review.originalAccountLifetime && binding.identitySHA256 === review.identitySHA256);
  const journal = data.account.snapshot;
  need(journal?.phase === 'READY' && journal.available && journal.observation === 'CURRENT'
    && journal.storageAvailable && !journal.busy && journal.queued === 0 && Number.isSafeInteger(journal.revision));
  // Head metadata is the original source generation's observed head, never an
  // aggregate or a browser timestamp. Recovery may explicitly have no head.
  const p = data.portfolio;
  const generation = p?.generations?.find(g => g.generationId === binding.generationId);
  const rows = p?.generations ? generation?.portfolio?.assets ?? [] : p?.assets ?? (p ? [p] : []);
  const row = rows.find(r => r.asset?.assetId === review.assetId);
  const observed = !data.errors.portfolio && row?.status === 'LIVE' ? row.observed : null;
  const head = observed ? Object.fromEntries(['blockHash', 'blockNumber', 'timestamp'].map(k => [k, observed[k]])) : null;
  if (head) need(digest(head.blockHash) && ['blockNumber', 'timestamp'].every(k => typeof head[k] === 'string' && /^(0|[1-9][0-9]*)$/.test(head[k])));
  if (['accountPrepare', 'accountExecute'].includes(action)) need(head);
  if (nativeNote) {
    need(binding.accountIdentitySHA256 === nativeNote.accountIdentitySHA256 && binding.generationId === nativeNote.generationId);
    const fields = action === 'accountPrepare' ? ['requestId', 'kind', 'ownerOperationRef', 'assetId'] : ['requestId'];
    need(Object.keys(body).sort().join(',') === fields.sort().join(',') && fields.every(k => body[k] === nativeNote[k]));
    if (['accountPrepare', 'accountExecute'].includes(action)) need(String(BigInt(head.timestamp) / 600n) === nativeNote.terms.epoch);
    return handoffData({ version: 1, profile: NATIVE_NOTE_HANDOFF_PROFILE, ...pinned, reviewId, action, body,
      bodySHA256: nativeNote.actionBodySHA256[action], binding, note: nativeNote, head, journalRevision: journal.revision });
  }
  if (['ORIGINAL_MANUAL_WRAPPED_WALLET_GRAPH_REVIEW_V1', 'ORIGINAL_MANUAL_WRAPPED_WALLET_GRAPH_REVIEW_V2'].includes(graph?.profile))
    need(graph.wrappedBinding.accountIdentitySHA256 === binding.accountIdentitySHA256);
  return handoffData({ version: 1, profile: HANDOFF_PROFILE, ...pinned, reviewId, action, body,
    binding, graph, head, journalRevision: journal.revision });
}

/** Optional versioned state section; it carries no grant token or authority. */
export function validateManualHandoffMetadata(input) {
  const value = handoffData(input);
  need(Object.keys(value).sort().join(',') === 'bindings,grant,listenerId,origin,profile' && value.profile === HANDOFF_PROFILE);
  handoffDescriptor({ origin: value.origin, listenerId: value.listenerId });
  need(Array.isArray(value.bindings) && value.bindings.length <= 12);
  const ids = new Set();
  for (const b of value.bindings) {
    need(Object.keys(b).sort().join(',') === 'accountIdentitySHA256,generationId,identitySHA256,originalAccountLifetime,requestId'
      && typeof b.requestId === 'string' && /^[A-Za-z0-9_-]{8,100}$/.exec(b.requestId)?.[0] === b.requestId && !ids.has(b.requestId)
      && ['accountIdentitySHA256', 'generationId', 'identitySHA256', 'originalAccountLifetime'].every(key => digest(b[key])));
    ids.add(b.requestId);
  }
  need(value.grant === null || Object.keys(value.grant).sort().join(',') === 'reviewId,tokenSHA256'
    && digest(value.grant.reviewId) && digest(value.grant.tokenSHA256));
  return value;
}
