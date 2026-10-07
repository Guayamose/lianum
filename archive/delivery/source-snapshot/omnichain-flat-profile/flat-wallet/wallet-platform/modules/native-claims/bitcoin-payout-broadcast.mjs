/** A distinct BTC-only post-reservation attester purpose. It grants neither
 * native signing nor a generic transport callback. Existing SOL bytes stay
 * unchanged; nesting their validated fields under this tag cannot replay a SOL
 * signature as BTC authority. No compiler-pinned codec is changed. */
import { claimFrame, claimPayoutBroadcastFrame } from './permits.mjs';
export const CLAIM_BITCOIN_PAYOUT_BROADCAST_PROFILE = 'CLAIM_BITCOIN_PAYOUT_BROADCAST_V1';
export const CLAIM_BITCOIN_PAYOUT_FINAL_SEND_PROFILE = 'CLAIM_BITCOIN_PAYOUT_ORIGINAL_FINAL_SEND_V1';
export function claimBitcoinPayoutBroadcastFrame(message) {
  return claimFrame('LIANUM/PAEG/native-claim-bitcoin-broadcast-payout/1', [claimPayoutBroadcastFrame(message)]);
}
