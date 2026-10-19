/** Closed original producer failures only; never interpret an arbitrary HTTP
 * message as a policy, minimum amount or a permission. */
const messages=Object.freeze({
 FLAT_LEGACY_FRESH_DEPOSIT_DISABLED:"This old connection does not support new deposits. It retains its funds and uses the original query, withdrawal or recovery; a new deposit needs a current connection.",
 FLAT_DEPOSIT_BELOW_MINIMUM:"The deposit does not reach the original minimum of this asset and pool. Check that amount in the current connection before authorizing. This minimum does not prevent withdrawal or recovery of funds.",
 FLAT_MINIMUM_LOCAL_ACCEPTANCE_NOT_RELEASED:"Deposits for this generation are not enabled yet. You can inspect and recover existing custody; do not authorize another deposit until the service enables it.",
});
export function originalFlatIngressFailureMessageV3(error){
 if(!(error instanceof Error))return null;
 for(const key of ['code','message']){const descriptor=Object.getOwnPropertyDescriptor(error,key);if(descriptor&&Object.hasOwn(descriptor,'value')&&typeof descriptor.value==='string'&&Object.hasOwn(messages,descriptor.value))return messages[descriptor.value];}
 return null;
}
