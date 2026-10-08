/** Pure canonical Base58 byte codec. No owned runtime, RPC or native authority. */
const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const fail = code => { throw new Error(code); };
const requireCondition = (condition, code) => { if (!condition) fail(code); };
export function base58Encode(bytes) {
  const data = Buffer.from(bytes); let value = data.length ? BigInt('0x' + data.toString('hex')) : 0n, out = '';
  while (value > 0n) { out = ALPHABET[Number(value % 58n)] + out; value /= 58n; }
  for (const byte of data) { if (byte !== 0) break; out = '1' + out; }
  return out;
}
export function base58Decode(text, length) {
  requireCondition(typeof text === 'string' && text.length > 0 && text.length <= 128, 'SOLANA_INVALID_BASE58');
  let value = 0n;
  for (const char of text) { const index = ALPHABET.indexOf(char); requireCondition(index >= 0, 'SOLANA_INVALID_BASE58'); value = value * 58n + BigInt(index); }
  let hex = value ? value.toString(16) : ''; if (hex.length % 2) hex = '0' + hex;
  const zeroes = text.match(/^1*/)[0].length;
  const result = Buffer.concat([Buffer.alloc(zeroes), Buffer.from(hex, 'hex')]);
  requireCondition(base58Encode(result) === text && (length === undefined || result.length === length), 'SOLANA_INVALID_BASE58_LENGTH');
  return result;
}
