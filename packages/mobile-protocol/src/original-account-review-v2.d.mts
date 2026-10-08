import type { OriginOptions } from './authorization.mjs';
export type OriginalAccountActionV2 = 'read' | 'reconcile';
export type OriginalAccountBindingV2 = Readonly<{
  accountIdentitySHA256: string; originalAccountLifetime: string; generationId: string;
  requestId: string; kind: 'TOP_UP' | 'EXIT'; ownerOperationRef: string; assetId: string;
  ownerIdentitySHA256: string; keyScopeSHA256: string; processIdentitySHA256: string;
  originalProcessGeneration: number; observedProcessGeneration: number;
  originalReviewSHA256: string; termsSHA256: string; requestBindingSHA256: string; assetBindingSHA256: string;
  journalRevision: number; requestState: 'PREPARED' | 'UNKNOWN' | 'CONFIRMED';
  authorityStage: 'READY' | 'UNKNOWN' | 'CONFIRMED';
  submission: Readonly<{ transactionHash: string; calldataSHA256: string; dispatchLatched: true }> | null;
  asset: Readonly<{ chainId: string; genesis: string; pool: string; kind: 'NATIVE' | 'ERC20';
    token: string; symbol: string; decimals: number }>;
  amountAtomic: string; recipient: string; role: 'source' | 'change' | 'recovery' | null;
  custody: 'LINUX_ORIGINAL_OWNER_CUSTODY'; publicNetwork: false; mobileNoteCustody: false; economicObservation: false;
}>;
export type OriginalAccountAccessV2 = Readonly<{
  version: 2; profile: typeof ORIGINAL_ACCOUNT_ACCESS_PROFILE_V2; origin: string;
  pairingId: string; challengeId: string; nonce: string; expiresAt: number;
  devicePublicKey: string; action: OriginalAccountActionV2;
}>;
export type OriginalAccountReviewV2 = Readonly<Omit<OriginalAccountAccessV2, 'profile'> & {
  profile: typeof ORIGINAL_ACCOUNT_REVIEW_PROFILE_V2; bootstrapChallengeId: string; binding: OriginalAccountBindingV2;
}>;
export type OriginalAccountAccessAuthorizationV2 = Readonly<{ challenge: OriginalAccountAccessV2; signature: string }>;
export type OriginalAccountReviewAuthorizationV2 = Readonly<{ review: OriginalAccountReviewV2; signature: string }>;
export const ORIGINAL_ACCOUNT_ACCESS_PROFILE_V2: 'LIANUM_ORIGINAL_ACCOUNT_ACCESS_V2';
export const ORIGINAL_ACCOUNT_REVIEW_PROFILE_V2: 'LIANUM_ORIGINAL_ACCOUNT_REVIEW_V2';
export const ORIGINAL_ACCOUNT_REVIEW_TTL_MS: 60000;
export function normalizeOriginalAccountAccessV2(raw: unknown, options?: OriginOptions): OriginalAccountAccessV2;
export function normalizeOriginalAccountBindingV2(raw: unknown): OriginalAccountBindingV2;
export function normalizeOriginalAccountReviewV2(raw: unknown, options?: OriginOptions): OriginalAccountReviewV2;
export function validateOriginalAccountFreshV2<T extends OriginalAccountAccessV2 | OriginalAccountReviewV2>(value: T, now?: number): T;
export function originalAccountAccessMessageV2(raw: OriginalAccountAccessV2, options?: OriginOptions): Uint8Array;
export function originalAccountReviewMessageV2(raw: OriginalAccountReviewV2, options?: OriginOptions): Uint8Array;
export function normalizeOriginalAccountSignatureV2(value: unknown): string;
