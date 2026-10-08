import type { MobileAuthorization, MobileChallenge, MobileIntent, MobileAction, MobileReceiptRequest } from '@lianum/mobile-protocol';
export type MobileState = Readonly<{
  version: 1; connection: 'DISCONNECTED' | 'READY'; privatePortfolio: null;
  capabilities: Readonly<Record<MobileAction, boolean>>; notice: string;
}>;
export type MobileOutcome = Readonly<{
  status: 'ACCEPTED' | 'UNKNOWN' | 'REJECTED'; requestId: string;
  operationState: 'ADMITTED' | 'UNKNOWN' | 'REJECTED'; retryAllowed: false;
}>;
export type MobileAdmissionReceipt = Readonly<{
  version: 1; profile: 'LIANUM_MOBILE_AUTHORIZATION_RECEIPT_V1'; nonce: string;
  challengeId: string; action: MobileAction; authorization: MobileOutcome;
}>;
export function normalizeMobileState(value: unknown): MobileState;
export function createMobileApi(options: { origin: string; fetchImpl?: typeof fetch; allowInsecureLocalhost?: boolean }): {
  readonly origin: string;
  state(): Promise<MobileState>;
  challenge(ownerPublicKey: string, intent: MobileIntent): Promise<MobileChallenge>;
  submit(authorization: MobileAuthorization): Promise<MobileOutcome>;
  receipt(request: MobileReceiptRequest): Promise<MobileAdmissionReceipt>;
};
