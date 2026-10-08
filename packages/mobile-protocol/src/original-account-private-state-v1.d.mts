import type { OriginalAccountAccessV2, OriginalAccountReviewV2, OriginalAccountBindingV2 }
  from './original-account-review-v2.mjs';
export const PRIVATE_STATE_SCOPE_V1: 'READ_ORIGINAL_ACCOUNT_POOL_BALANCE_ONLY';
export const PRIVATE_STATE_ACCESS_V1: 'LIANUM_ORIGINAL_PRIVATE_STATE_ACCESS_V1';
export const PRIVATE_STATE_REVIEW_V1: 'LIANUM_ORIGINAL_PRIVATE_STATE_REVIEW_V1';
export const PRIVATE_STATE_OBSERVATION_V1: 'LIANUM_ORIGINAL_PRIVATE_STATE_OBSERVATION_V1';
export type OriginalPrivateStateAccessV1 = Readonly<{ version: 1; profile: typeof PRIVATE_STATE_ACCESS_V1;
  scope: typeof PRIVATE_STATE_SCOPE_V1; challenge: OriginalAccountAccessV2 }>;
export type OriginalPrivateStateReviewV1 = Readonly<{ version: 1; profile: typeof PRIVATE_STATE_REVIEW_V1;
  scope: typeof PRIVATE_STATE_SCOPE_V1; review: OriginalAccountReviewV2 }>;
export type OriginalPrivateStateObservationV1 = Readonly<{
  version: 1; profile: typeof PRIVATE_STATE_OBSERVATION_V1; scope: typeof PRIVATE_STATE_SCOPE_V1;
  binding: OriginalAccountBindingV2; status: 'LIVE' | 'STALE' | 'UNAVAILABLE';
  asset: Readonly<OriginalAccountBindingV2['asset'] & { assetId: string }>;
  observed: Readonly<{ observedAt: number; blockNumber: string; blockHash: string; timestamp: string }> | null;
  balances: Readonly<{ available: string; reserved: string; recovery: string; locked: string }> | null;
  backing: Readonly<{ held: string; liabilities: string; surplus: string; deficit: string }> | null;
  request: Readonly<{ requestId: string; kind: 'TOP_UP' | 'EXIT'; state: 'CONFIRMED' | 'UNRESOLVED' | 'STALE';
    disposition: 'APPLIED' | null }>;
  custody: 'LINUX_ORIGINAL_OWNER_CUSTODY'; mobileNoteCustody: false; completePortfolio: false;
}>;
export function privateStateAccessFrameV1(raw: unknown): OriginalPrivateStateAccessV1;
export function privateStateReviewFrameV1(raw: unknown): OriginalPrivateStateReviewV1;
export function normalizePrivateStateAccessV1(raw: unknown): OriginalPrivateStateAccessV1;
export function normalizePrivateStateReviewV1(raw: unknown): OriginalPrivateStateReviewV1;
export function privateStateAccessMessageV1(raw: unknown): Uint8Array;
export function privateStateReviewMessageV1(raw: unknown): Uint8Array;
export function normalizePrivateStateObservationV1(raw: unknown): OriginalPrivateStateObservationV1;
export function validatePrivateStateFreshV1(value: OriginalPrivateStateObservationV1, now?: number): OriginalPrivateStateObservationV1;
