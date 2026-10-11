/** The original runtime API delegates to the fixed guarded product opener.
 * Historical canonical release remains null; product review has its own gate. */
import { startFixedOwnedTronFirstErrorPrivateProductDriverV3, inspectOwnedTronFirstErrorPrivateDriverPrerequisitesV3 } from '../runtime/guarded/tron-product-node-driver-v1.mjs';
import { TRON_UPSTREAM, OWNED_TRON_RUNTIME_RELEASE } from '../runtime/guarded/tron-upstream-release-v1.mjs';
export { TRON_UPSTREAM, OWNED_TRON_RUNTIME_RELEASE } from '../runtime/guarded/tron-upstream-release-v1.mjs';
export function inspectOwnedTronRuntimePrerequisites() {
 if(arguments.length!==0)throw Error('TRON_PRODUCT_INSPECT_NO_OPTIONS');
 return Object.freeze({...inspectOwnedTronFirstErrorPrivateDriverPrerequisitesV3(),upstream:TRON_UPSTREAM,
  release:OWNED_TRON_RUNTIME_RELEASE,graphAdmissionEligible:false,creditEligible:false});
}
export async function startFixedOwnedTronDriver() {
 if(arguments.length!==0)throw Error('TRON_PRODUCT_ZERO_ARGUMENT_FACTORY');
 return startFixedOwnedTronFirstErrorPrivateProductDriverV3();
}
