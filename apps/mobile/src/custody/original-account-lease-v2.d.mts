import type { normalizeOriginalAccountAccessV2, normalizeOriginalAccountReviewV2 }
  from '@lianum/mobile-protocol/original-account-v2';
type Access = ReturnType<typeof normalizeOriginalAccountAccessV2>;
type Review = ReturnType<typeof normalizeOriginalAccountReviewV2>;
declare const ticketBrand: unique symbol;
declare const accessBrand: unique symbol;
declare const reviewBrand: unique symbol;
export type OriginalAccountTicketV2 = Readonly<{ [ticketBrand]: true }>;
export type OriginalAccountAccessLeaseV2 = Readonly<{ [accessBrand]: true }>;
export type OriginalAccountReviewLeaseV2 = Readonly<{ [reviewBrand]: true }>;
export type OriginalAccountContextV2 = Readonly<{
  origin: string; pairingId: string; devicePublicKey: string | null;
  action: 'read' | 'reconcile'; foreground: boolean;
}>;
export function createOriginalAccountLeaseV2(options: {
  readContext(): OriginalAccountContextV2; now?: () => number;
}): Readonly<{
  invalidate(): void;
  begin(): OriginalAccountTicketV2;
  finishAccess(ticket: OriginalAccountTicketV2, value: Access): Readonly<{
    lease: OriginalAccountAccessLeaseV2; value: Access;
  }>;
  openReview(lease: OriginalAccountAccessLeaseV2, callbacks: {
    sign(value: Access): Promise<string>;
    post(request: { challenge: Access; signature: string }): Promise<Review>;
  }): Promise<Readonly<{ lease: OriginalAccountReviewLeaseV2; value: Review }>>;
  submit<T>(lease: OriginalAccountReviewLeaseV2, callbacks: {
    sign(value: Review): Promise<string>;
    post(request: { review: Review; signature: string }): Promise<T>;
  }): Promise<T>;
}>;
