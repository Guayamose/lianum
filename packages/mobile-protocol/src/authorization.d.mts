export type MobileChain = 'ethereum' | 'base' | 'arbitrum' | 'bnb' | 'solana' | 'bitcoin' | 'tron';
export type MobileAction = 'prepare' | 'execute' | 'reconcile' | 'recover';
export type MobileIntent = Readonly<{
  requestId: string; action: MobileAction; kind: 'TOP_UP' | 'EXIT'; chain: MobileChain;
  assetId: string; amountAtomic: string; recipient: string; maxFeeAtomic: string;
}>;
export type MobileChallenge = Readonly<{
  version: 1; profile: typeof MOBILE_AUTHORIZATION_PROFILE; origin: string;
  challengeId: string; nonce: string; expiresAt: number; ownerPublicKey: string; intent: MobileIntent;
}>;
export type MobileAuthorization = Readonly<{ challenge: MobileChallenge; signature: string }>;
export type OriginOptions = { allowInsecureLocalhost?: boolean };
export const MOBILE_AUTHORIZATION_PROFILE: 'LIANUM_MOBILE_AUTHORIZATION_V1';
export const MOBILE_CHALLENGE_TTL_MS: 300000;
export const MOBILE_CHAINS: readonly MobileChain[];
export const MOBILE_ACTIONS: readonly MobileAction[];
export function normalizeMobileOrigin(value: unknown, options?: OriginOptions): string;
export function normalizeMobileIntent(value: unknown): MobileIntent;
export function normalizeMobileChallenge(value: unknown, options?: OriginOptions): MobileChallenge;
export function validateMobileChallenge(value: unknown, options: OriginOptions & { origin: string; ownerPublicKey: string; now?: number }): MobileChallenge;
export function mobileAuthorizationMessage(value: MobileChallenge, options?: OriginOptions): Uint8Array;
export function normalizeMobileAuthorization(value: unknown, options?: OriginOptions): MobileAuthorization;
