/** Finite retention envelope for the ORIGINAL durable Paged runtime families.
 * DATA constants only; factory admission, memory/byte budgets and authority stay
 * in their original owners. 64/page and 64 ACTIVE permits are separate limits. */
export const PAGED_RUNTIME_CAPACITY_V3=Object.freeze({payments:256,nativeRecords:256,recipients:258,transactions:2048,blocks:20480,historicalStates:20480});
