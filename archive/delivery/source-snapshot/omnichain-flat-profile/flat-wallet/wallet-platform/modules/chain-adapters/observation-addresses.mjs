/** Public identifier framing only. Never a signing or key derivation API. */
import {need} from './portfolio-registry.mjs';
const alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
export function solanaPublicKey(value) {
  need(typeof value === 'string' && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value), 'INVALID_SOLANA_ADDRESS');
  let number = 0n;
  for (const character of value) number = number * 58n + BigInt(alphabet.indexOf(character));
  let bytes = 0;
  for (let n = number; n; n >>= 8n) bytes++;
  for (const character of value) { if (character !== '1') break; bytes++; }
  need(bytes === 32, 'INVALID_SOLANA_ADDRESS');
  return value;
}
export function bitcoinWatchAddress(value) {
  // Watch coverage and the exact script are checked against the configured node.
  need(typeof value === 'string' && /^(?:bc1|tb1|bcrt1)[023456789acdefghjklmnpqrstuvwxyz]{11,87}$/.test(value)
    && value.length <= 90, 'INVALID_BITCOIN_WATCH_ADDRESS');
  return value;
}
