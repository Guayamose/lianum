/** Fixed public SOL descriptors and synthetic fixture amounts. Reading these
 * constants grants no custody, runtime ownership, release or send authority. */
export const SOLANA_CUSTODY_PROFILE = 'OWNED_FLAT_SOLANA_CUSTODY_V1';
// Candidate protocol identity only; not proof-profile activation or send authority.
export const SOLANA_NONCE_INGRESS_PROFILE = 'LIANUM_GENERIC_NATIVE_CLAIM_INGRESS_V3';
// Every fixed payout checks its retained completed authorization after the
// durable first-send latch. This descriptor does not confer send authority.
export const SOLANA_PAYOUT_FINAL_SEND_PROFILE = 'OWNED_SOLANA_PAYOUT_AUTHORITY_LIFETIME_V2';
export const SOLANA_CUSTODY_SYNTHETIC_SURPLUS = '10000000';
export const SOLANA_NONCE_BOOTSTRAP_GRANT = '10000000';
export const SOLANA_GRAPH_SYNTHETIC_LIQUIDITY = '10000000000';
export const SOLANA_GRAPH_RECIPIENT_GRANT = '2000000';
