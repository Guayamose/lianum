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
