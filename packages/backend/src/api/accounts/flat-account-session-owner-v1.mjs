/** One canonical session family, composed with the original engine keeper guard.
 * Only its read/action API escapes; callers cannot select or replace its ports. */
import { assertOriginalGenericAccountKeeperV1 } from '@lianum/engine/accounts/keeper';
import { buildFlatAccountSessionFamilyV1 } from './flat-account-session-core.mjs';
export { validateFlatAccountPrepare, FLAT_ACCOUNT_API_PROFILE, FLAT_ACCOUNT_ADMISSION_LIMIT } from './flat-account-session-core.mjs';
const originalSessions = buildFlatAccountSessionFamilyV1(Object.freeze({ assertOriginalGenericAccountKeeperV1 }));
export const { assertFlatAccountSessionOwnerViewV1, assertFlatAccountOwnerSessionBindingV1, readFlatAccountOwnerSessionSnapshotV1, flatAccountErrorCode, assertFlatAccountSession, createFlatAccountSession } = originalSessions;
