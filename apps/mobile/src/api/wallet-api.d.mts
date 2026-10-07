import type { MobileAuthorization, MobileChallenge, MobileIntent, MobileAction } from '@lianum/mobile-protocol';
export type MobileState = Readonly<{
  version: 1; connection: 'DISCONNECTED' | 'READY'; privatePortfolio: null;
  capabilities: Readonly<Record<MobileAction, boolean>>; notice: string;
}>;
export type MobileOutcome = Readonly<{
  status: 'ACCEPTED' | 'UNKNOWN' | 'REJECTED'; requestId: string;
  operationState: 'ADMITTED' | 'UNKNOWN' | 'REJECTED'; retryAllowed: false;
}>;
export function normalizeMobileState(value: unknown): MobileState;
export function createMobileApi(options: { origin: string; fetchImpl?: typeof fetch; allowInsecureLocalhost?: boolean }): {
  readonly origin: string;
  state(): Promise<MobileState>;
  challenge(ownerPublicKey: string, intent: MobileIntent): Promise<MobileChallenge>;
  submit(authorization: MobileAuthorization): Promise<MobileOutcome>;
};
