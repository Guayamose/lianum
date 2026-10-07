import { handoffData, handoffDescriptor, sameHandoff } from './manual-action-handoff.mjs';

/** Display binding for an explicitly imported existing exact capability.
 * This module issues no authority. The server registry checks the token,
 * exact body, current original target, listener lifetime and single use. */
export const EXACT_BROWSER_REVIEW_PROFILE = 'ORIGINAL_EXACT_ACTION_BROWSER_REVIEW_V1';
export const EXACT_BROWSER_ACTIONS = Object.freeze(['accountPrepare', 'accountExecute', 'accountReconcile',
  'defiPrepare', 'defiRequote', 'defiExecute', 'defiReconcile', 'defiReopen']);
export function exactBrowserReview({ descriptor, revision, reviewId, action, body, context }) {
  const pinned = handoffDescriptor(handoffData(descriptor));
  if (!EXACT_BROWSER_ACTIONS.includes(action) || !Number.isSafeInteger(revision) || revision < 0
    || typeof reviewId !== 'string' || /^[0-9a-f]{64}$/.exec(reviewId)?.[0] !== reviewId
    || context?.graph || context?.nativeNote) throw new Error('WALLET_EXACT_BROWSER_REVIEW_INVALID');
  return handoffData({ version: 1, profile: EXACT_BROWSER_REVIEW_PROFILE, ...pinned,
    revision, reviewId, action, body, context });
}
export function exactBrowserAccess(input, expected, usedTokens) {
  const grant = handoffData(input);
  if (Object.keys(grant).sort().join(',') !== 'access,review'
    || !grant.access || Object.keys(grant.access).sort().join(',') !== 'origin,token'
    || grant.access.origin !== expected.origin || typeof grant.access.token !== 'string'
    || /^[0-9a-f]{64}$/.exec(grant.access.token)?.[0] !== grant.access.token
    || usedTokens.has(grant.access.token) || !sameHandoff(grant.review, expected))
    throw new Error('WALLET_EXACT_BROWSER_ACCESS_INVALID');
  return grant.access.token;
}
