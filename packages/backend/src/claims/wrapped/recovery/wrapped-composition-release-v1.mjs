import assert from 'node:assert/strict';
import {inspectWrappedInstallationSourcesV2} from '@lianum/components/verification/wrapped-installation';
export const WRAPPED_WALLET_ACCEPTANCE_RELEASE_V1 = true;
export const WRAPPED_WALLET_PAYOUT_V4_CONTRACT_RELEASE_V1 = true;
export function assertWrappedWalletCompositionReleaseV1() {
  inspectWrappedInstallationSourcesV2();
  assert.ok(WRAPPED_WALLET_ACCEPTANCE_RELEASE_V1, 'WRAPPED_WALLET_ACCEPTANCE_NOT_RELEASED');
  assert.ok(WRAPPED_WALLET_PAYOUT_V4_CONTRACT_RELEASE_V1, 'WRAPPED_WALLET_ORIGINAL_V4_PAYOUT_PRODUCER_NOT_RELEASED');
}
