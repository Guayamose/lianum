/** Compose actual protected custody with the fixed pinned wire SDK. */
import {readDevicePagedSourceRecoveryScopeV4,assertDevicePagedSourceRecoveryTokenV4} from '../custody/device-paged-note-vault-v3.ts';
import {createDevicePagedExpiredWithdrawalWireV10} from './device-paged-expired-withdrawal-wire-v10.mjs';
export {readDevicePagedExpiredWithdrawalConsentV10,readDevicePagedExpiredWithdrawalReplyV10} from './device-paged-expired-withdrawal-wire-v10.mjs';
export async function createDevicePagedExpiredWithdrawalApiV10({sourceToken,transport}){
 const {descriptor}=await readDevicePagedSourceRecoveryScopeV4(sourceToken);
 return createDevicePagedExpiredWithdrawalWireV10({sourceToken,transport,descriptor,guard:()=>assertDevicePagedSourceRecoveryTokenV4(sourceToken)});
}
