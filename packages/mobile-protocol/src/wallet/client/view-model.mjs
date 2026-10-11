/** Compatibility entry for the wallet client API. Prefer the focused package entries for new consumers. */
export { WALLET_PROFILE, ACTIONS, DEFI_PROFILE, DEFI_ACTIONS, ACCOUNT_ACTIONS, ALL_ACTIONS } from './actions/catalog.mjs';
export { NATIVE_IDENTITY_PROFILE, WRAPPED_CLAIM_IDENTITY_PROFILE, originalNativeIdentity } from './validation/native-identity.mjs';
export { accountAssetChoices, accountActionContext } from './actions/account-context.mjs';
export { accountReviewDetails } from './presentation/account-review.mjs';
export { nativeIdentityDetails, nativeAmountDetails, displayUnits } from './presentation/native-review.mjs';
export { atomic } from './validation/values.mjs';
export { validateWalletState } from './validation/wallet-state.mjs';
export { projectWalletState } from './presentation/wallet-state.mjs';
export { buildActionBody, actionAvailability } from './actions/rules.mjs';
export { actionReview } from './presentation/action-review.mjs';
export { createWalletClient } from './session.mjs';
