/** The original runtime API delegates to the fixed guarded product opener.
 * Historical canonical release remains null; product review has its own gate. */
import { startFixedOwnedTronFirstErrorPrivateProductDriverV3, inspectOwnedTronFirstErrorPrivateDriverPrerequisitesV3 } from '../runtime/guarded/tron-product-node-driver-v1.mjs';
export const TRON_UPSTREAM=Object.freeze({repository:'https://github.com/tronprotocol/java-tron',tag:'GreatVoyage-v4.8.2.3',commit:'5c449a18a2bb995d3b688d1587e664d909b473c7',
  fullNodeSHA256:'faef7f4d89b9f154632bbab2db1712c25f02ee37b356013e098558ea994accec',fullNodeBytes:145750002,requiredJava:'1.8',arch:'x64'});
// This is a release gate, not configuration. Do not populate from environment,
// argument, a caller manifest or the digest of a just-compiled unreviewed binary.
export const OWNED_TRON_RUNTIME_RELEASE=null;
export function inspectOwnedTronRuntimePrerequisites() {
 if(arguments.length!==0)throw Error('TRON_PRODUCT_INSPECT_NO_OPTIONS');
 return Object.freeze({...inspectOwnedTronFirstErrorPrivateDriverPrerequisitesV3(),upstream:TRON_UPSTREAM,
  release:OWNED_TRON_RUNTIME_RELEASE,graphAdmissionEligible:false,creditEligible:false});
}
export async function startFixedOwnedTronDriver() {
 if(arguments.length!==0)throw Error('TRON_PRODUCT_ZERO_ARGUMENT_FACTORY');
 return startFixedOwnedTronFirstErrorPrivateProductDriverV3();
}
