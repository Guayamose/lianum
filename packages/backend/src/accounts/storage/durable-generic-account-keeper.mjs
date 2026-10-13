/** Canonical durable keeper composition. Only this instance binds original
 * SOURCE and wrapped owners; the implementation owns its private membership. */
import { genericAccountIdentity, immutable, need, same, sha } from '@lianum/engine/accounts/journal';
import { keeperFields, keeperInput, startGenericAccountKeeper } from '@lianum/engine/accounts/coordinator-lifecycle';
import { createClaimRecordStore, openClaimRecordStore } from '@lianum/engine/storage/records';
import { buildDurableGenericAccountKeeperV1 } from './durable-generic-account-keeper-backend-v1.mjs';
const originalKeepers = buildDurableGenericAccountKeeperV1(Object.freeze({
    dependencies: Object.freeze({ genericAccountIdentity, immutable, need, same, sha, keeperFields, keeperInput, startGenericAccountKeeper, createClaimRecordStore, openClaimRecordStore }),
    load: Object.freeze({ source: () => import('../../operations/recovery/native-original-source-lifecycle-v1.mjs'), lifetime: () => import('../../claims/wrapped/recovery/wrapped-recovery-authority-v1.mjs') })
}));
export const { createDurableGenericAccountKeeperV1, reopenDurableGenericAccountKeeperV1, captureDurableGenericAccountKeeperV1, bindOriginalNativeSourceSessionKeeperV1, readOriginalNativeSourceSessionKeeperV1, readOriginalNativeSourceSessionKeeperCandidateV1 } = originalKeepers;
