import type { MobileAuthorization, MobileReceiptRequest, MobileReceiptReview } from '@lianum/mobile-protocol';

declare const ticketBrand: unique symbol;
declare const leaseBrand: unique symbol;
export type ReceiptTicket = Readonly<{ [ticketBrand]: true }>;
export type ReceiptLease = Readonly<{ [leaseBrand]: true }>;
export type MobileReceiptContext = Readonly<{
  origin: string; ownerPublicKey: string | null; authorization: MobileAuthorization | null; foreground: boolean;
}>;
export function createMobileReceiptLease(options: {
  readContext(): MobileReceiptContext; allowInsecureLocalhost?: boolean; now?: () => number;
}): Readonly<{
  invalidate(): void;
  begin(): ReceiptTicket;
  finish(ticket: ReceiptTicket, review: MobileReceiptReview): Readonly<{ lease: ReceiptLease; review: MobileReceiptReview }>;
  query<T>(lease: ReceiptLease, callbacks: {
    sign(review: MobileReceiptReview): Promise<string>;
    post(request: MobileReceiptRequest): Promise<T>;
    retain(authorization: MobileAuthorization, receipt: T): Promise<void>;
  }): Promise<T>;
}>;
