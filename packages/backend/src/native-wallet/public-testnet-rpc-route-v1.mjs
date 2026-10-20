/** Versioned route for the single public Sepolia endpoint used by retained demos.
 * The original network/genesis checks still run. A signed request has exactly
 * one destination and one attempt; this is not a retry or broadcast fallback. */
const RETAINED_SEPOLIA='https://sepolia.drpc.org';
export const PUBLIC_SEPOLIA_RPC_ROUTE_V1=Object.freeze({
 profile:'LIANUM_PUBLIC_SEPOLIA_RPC_ROUTE_V1',
 retainedEndpoint:RETAINED_SEPOLIA,
 effectiveEndpoint:'https://gateway.tenderly.co/public/sepolia',
 chainId:'11155111',
 genesis:'0x25a5cc106eea7138acab33231d7160d69cb777ee0c2c553fcddf5138993e6dd9',
 signedSendAttempts:1,
});
export function resolvePublicTestnetRpcRouteV1(endpoint){
 return endpoint===RETAINED_SEPOLIA||endpoint===RETAINED_SEPOLIA+'/'?PUBLIC_SEPOLIA_RPC_ROUTE_V1.effectiveEndpoint:endpoint;
}
/** Fixed, independently authenticated send transport. The retained read route
 * and its finalized cache stay unchanged. This is selected before attempting
 * a send, never after a rejection or uncertain response. */
export const PUBLIC_SEPOLIA_WRITE_ROUTE_V43=Object.freeze({
 profile:'LIANUM_PUBLIC_SEPOLIA_WRITE_ROUTE_V43',
 endpoint:'https://public.1rpc.io/sepolia',
 signedSendAttempts:1,
});
export function resolvePublicTestnetWriteRpcRouteV43(endpoint,method){
 return method==='eth_sendRawTransaction'&&endpoint===PUBLIC_SEPOLIA_RPC_ROUTE_V1.effectiveEndpoint?PUBLIC_SEPOLIA_WRITE_ROUTE_V43.endpoint:endpoint;
}
/** Some providers add a zero blob counter to non-blob receipts. Keep the
 * original receipt shape while preserving every consensus and log field. */
export function normalizeNonBlobReceiptResultV1(method,value){
 if(method!=='eth_getTransactionReceipt'||!value||!['0x0','0x1','0x2'].includes(value.type)||value.blobGasUsed!=='0x0')return value;
 const normalized={...value};delete normalized.blobGasUsed;return normalized;
}
