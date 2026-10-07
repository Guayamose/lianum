import { isWrappedClaimGraphDispatchRequestV1, consumeOwnedNativeValueTronDispatchRequest as consumeWrapped } from './wrapped-claim-graph-dispatch-gate-v1.mjs';
/** Fixed original Tron dispatch opener. Issuance lives in the ONE integrated
 * provider factory after its genuine custody/lease/system/quorum joins. This
 * module cannot issue a request from public bytes, callbacks or copied brands. */
import { consumeOwnedNativeValueTronDispatchRequest } from './native-value-evm-dispatch-gate.mjs';
export const TRON_DISPATCH_JOIN_BLOCKERS=Object.freeze([
 'TRON_RUNTIME_BUILD_NO_EGRESS_AND_NATIVE_ACCEPTANCE_UNEXECUTED',
 'TRON_VALIDATION_PRESTATE_RECORDER_UNBUILT_UNACCEPTED',
 'FINAL_NATIVE_VALUE_HOST_ROLE_RELEASE_CLOSURES_UNRELEASED',
 'ACTUAL_ORIGINAL_WALLET_TRON_GRAPH_ACCEPTANCE_UNEXECUTED',
]);
export function assertOwnedNativeValueTronDispatchRequest(request,nativeRuntime) {
 return isWrappedClaimGraphDispatchRequestV1(request) ? consumeWrapped(request,nativeRuntime)
  : consumeOwnedNativeValueTronDispatchRequest(request,nativeRuntime);
}
