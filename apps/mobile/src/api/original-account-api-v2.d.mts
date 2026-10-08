import type { DeviceDepositConsentV1, DeviceDepositStatementV1, DeviceDepositWitnessV1 } from '../../../../packages/mobile-protocol/src/device-deposit-consent-v1.mjs';
import type { OriginalPrivateStateObservationV1 } from '@lianum/mobile-protocol/original-account-v2';
import type { OriginalAccountActionV2, OriginalAccountBindingV2, OriginalAccountAccessV2,
  OriginalAccountReviewV2, OriginalAccountAccessAuthorizationV2, OriginalAccountReviewAuthorizationV2 }
  from '@lianum/mobile-protocol/original-account-v2';
export type OriginalAccountDescriptorV2 = Readonly<{ origin: string; pairingId: string; devicePublicKey: string }>;
export type OriginalAccountServiceV2 = Readonly<{
  version: 2; profile: 'PAIRED_ORIGINAL_ACCOUNT_SERVICE_V2'; connection: 'PAIRED';
  privatePortfolio: null; economicObservation: null; noteCustodyOnDevice: false; nativeEffectsEstablished: false;
  actions: Readonly<{ read: true; reconcile: true }>;
}>;
export type OriginalAccountDiagnosticV2 = Readonly<{
  version: 2; profile: 'PAIRED_ORIGINAL_ACCOUNT_DIAGNOSTIC_V2'; action: OriginalAccountActionV2;
  binding: OriginalAccountBindingV2;
  admission: Readonly<{ version: 1; admitted: true; sequence: number; action: 'reconcile'; requestId: string;
    state: 'SUCCEEDED' | 'FAILED'; errorCode: string | null }> | null;
  privatePortfolio: null; economicObservation: null; noteCustodyOnDevice: false; nativeEffectsEstablished: false;
}>;
export type OriginalPrivateStateApiV1 = Readonly<{
  descriptor: OriginalAccountDescriptorV2;
  challenge(): Promise<OriginalAccountAccessV2>;
  openReview(request: OriginalAccountAccessAuthorizationV2): Promise<OriginalAccountReviewV2>;
  submit(request: OriginalAccountReviewAuthorizationV2): Promise<OriginalPrivateStateObservationV1>;
}>;
export function createOriginalPrivateStateApiV1(options: {
  descriptor: OriginalAccountDescriptorV2; fetchImpl?: typeof fetch;
}): OriginalPrivateStateApiV1;
export function normalizeOriginalAccountServiceV2(value: unknown): OriginalAccountServiceV2;
export function createOriginalAccountApiV2(options: {
  descriptor: OriginalAccountDescriptorV2; fetchImpl?: typeof fetch;
}): Readonly<{
  descriptor: OriginalAccountDescriptorV2;
  privateState: OriginalPrivateStateApiV1;
  deviceDeposit: Readonly<{
    challengeJob(input: { access: OriginalAccountAccessV2; signature: string; statement: DeviceDepositStatementV1;
      rootId: string; noteRevision: number; witnessSHA256: string; jobId: string | null }): Promise<DeviceDepositConsentV1>;
    challenge(action: 'FUND_D26' | 'OBSERVE_D26', input: { access: OriginalAccountAccessV2; signature: string; jobId: string }): Promise<DeviceDepositConsentV1>;
    submit(input: { consent: DeviceDepositConsentV1; signature: string; witness?: DeviceDepositWitnessV1 }): Promise<unknown>;
  }>;

  state(): Promise<OriginalAccountServiceV2>;
  challenge(action: OriginalAccountActionV2): Promise<OriginalAccountAccessV2>;
  openReview(request: OriginalAccountAccessAuthorizationV2): Promise<OriginalAccountReviewV2>;
  submit(request: OriginalAccountReviewAuthorizationV2): Promise<OriginalAccountDiagnosticV2>;
}>;
