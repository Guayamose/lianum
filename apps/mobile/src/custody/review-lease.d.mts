import type { MobileAuthorization, MobileChallenge, MobileIntent, MobileAction } from '@lianum/mobile-protocol';

export type ReviewLease = Readonly<object>;
export type ReviewTicket = Readonly<object>;
export type MobileReviewContext = {
  origin: string;
  ownerPublicKey: string | null;
  intent: MobileIntent;
  connection: 'READY' | 'DISCONNECTED' | null;
  capabilities: Readonly<Record<MobileAction, boolean>> | null;
  observedAt: number;
  stale: boolean;
  foreground: boolean;
};

export function createMobileReviewLease(options: {
  readContext(): MobileReviewContext;
  allowInsecureLocalhost?: boolean;
  now?: () => number;
  maxStateAgeMs?: number;
}): Readonly<{
  invalidate(): void;
  begin(): ReviewTicket;
  finish(ticket: ReviewTicket, challenge: MobileChallenge): Readonly<{ lease: ReviewLease; challenge: MobileChallenge }>;
  submit<T>(lease: ReviewLease, callbacks: {
    sign(challenge: MobileChallenge): Promise<string>;
    retain(authorization: MobileAuthorization): Promise<unknown>;
    post(authorization: MobileAuthorization): Promise<T>;
  }): Promise<Readonly<{ authorization: MobileAuthorization; result: T }>>;
}>;
