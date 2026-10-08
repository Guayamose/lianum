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
export function normalizeOriginalAccountServiceV2(value: unknown): OriginalAccountServiceV2;
export function createOriginalAccountApiV2(options: {
  descriptor: OriginalAccountDescriptorV2; fetchImpl?: typeof fetch;
}): Readonly<{
  descriptor: OriginalAccountDescriptorV2;
  state(): Promise<OriginalAccountServiceV2>;
  challenge(action: OriginalAccountActionV2): Promise<OriginalAccountAccessV2>;
  openReview(request: OriginalAccountAccessAuthorizationV2): Promise<OriginalAccountReviewV2>;
  submit(request: OriginalAccountReviewAuthorizationV2): Promise<OriginalAccountDiagnosticV2>;
}>;
