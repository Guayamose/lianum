/** Fiat checkout DATA only. No chain signer, private note, or settlement grant. */
import { createHash } from 'node:crypto';
export const MOONPAY_ASSETS_V1 = Object.freeze({
  BTC: Object.freeze({ asset: 'BTC', code: 'btc', network: 'bitcoin', decimals: 8, sandboxChain: 'BITCOIN_TESTNET3', productionChain: 'BITCOIN_MAINNET' }),
  ETH: Object.freeze({ asset: 'ETH', code: 'eth', network: 'ethereum', decimals: 18, sandboxChain: 'ETHEREUM_SEPOLIA', productionChain: 'ETHEREUM_MAINNET' }),
  SOL: Object.freeze({ asset: 'SOL', code: 'sol', network: 'solana', decimals: 9, sandboxChain: 'SOLANA_DEVNET', productionChain: 'SOLANA_MAINNET' }),
});
export const failMoonPayV1 = code => { throw Object.assign(new Error(code), { code }); };
export const needMoonPayV1 = (value, code = 'FIAT_REQUEST_INVALID') => { if (!value) failMoonPayV1(code); };
export function exactMoonPayV1(raw, fields) {
  needMoonPayV1(raw && Object.getPrototypeOf(raw) === Object.prototype && Reflect.ownKeys(raw).sort().join(',') === [...fields].sort().join(','));
  for (const field of fields) needMoonPayV1(Object.getOwnPropertyDescriptor(raw, field)?.enumerable === true && Object.hasOwn(Object.getOwnPropertyDescriptor(raw, field), 'value'));
  return raw;
}
export function moonPayOwnerV1(value) { needMoonPayV1(typeof value === 'string' && /^[0-9a-f]{64}$/.test(value), 'FIAT_OWNER_REQUIRED'); return value; }
export function moonPayIdV1(value) { needMoonPayV1(typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value), 'FIAT_ID_INVALID'); return value; }
export function moonPayDecimalV1(value, decimals = 18, zero = false) {
  needMoonPayV1(typeof value === 'string' && value.length <= 64 && /^(0|[1-9][0-9]{0,11})(\.[0-9]{1,18})?$/.test(value), 'FIAT_AMOUNT_INVALID');
  const [whole, fraction = ''] = value.split('.'); needMoonPayV1(fraction.length <= decimals, 'FIAT_AMOUNT_INVALID');
  const normalized = whole + (fraction.replace(/0+$/, '') ? '.' + fraction.replace(/0+$/, '') : '');
  needMoonPayV1(zero || normalized !== '0', 'FIAT_AMOUNT_INVALID'); return normalized;
}
export function moonPayProviderDecimalV1(value, zero = false) {
  if (typeof value === 'number') {
    needMoonPayV1(Number.isFinite(value) && value >= 0 && value < 1e12, 'FIAT_PROVIDER_RESPONSE_INVALID');
    let text = String(value); if (/e/.test(text)) {
      const [mantissa, exponent] = text.split('e'), [whole, fraction = ''] = mantissa.split('.'), digits = whole + fraction, point = whole.length + Number(exponent);
      text = point <= 0 ? '0.' + '0'.repeat(-point) + digits : point >= digits.length ? digits + '0'.repeat(point - digits.length) : digits.slice(0, point) + '.' + digits.slice(point);
    }
    value = text;
  }
  try { return moonPayDecimalV1(value, 18, zero); } catch { failMoonPayV1('FIAT_PROVIDER_RESPONSE_INVALID'); }
}
const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz', B32 = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
function base58(text) {
  needMoonPayV1(typeof text === 'string' && text.length >= 26 && text.length <= 44 && /^[1-9A-HJ-NP-Za-km-z]+$/.test(text), 'FIAT_WALLET_INVALID');
  let n = 0n; for (const c of text) n = n * 58n + BigInt(B58.indexOf(c));
  let h = n ? n.toString(16) : ''; if (h.length % 2) h = '0' + h;
  return Buffer.concat([Buffer.alloc(text.match(/^1*/)[0].length), Buffer.from(h, 'hex')]);
}
function bitcoin(text, sandbox) {
  needMoonPayV1(typeof text === 'string' && text.length >= 14 && text.length <= 90 && text === text.toLowerCase(), 'FIAT_WALLET_INVALID');
  const hrp = sandbox ? 'tb' : 'bc', split = text.lastIndexOf('1'); needMoonPayV1(text.slice(0, split) === hrp && split + 7 <= text.length, 'FIAT_WALLET_NETWORK_MISMATCH');
  const data = [...text.slice(split + 1)].map(c => B32.indexOf(c)); needMoonPayV1(data.every(v => v >= 0), 'FIAT_WALLET_INVALID');
  const expanded = [...hrp].map(c => c.charCodeAt(0) >> 5).concat([0], [...hrp].map(c => c.charCodeAt(0) & 31));
  let chk = 1; const gen = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
  for (const v of [...expanded, ...data]) { const top = chk >>> 25; chk = ((chk & 0x1ffffff) << 5) ^ v; for (let i = 0; i < 5; i++) if ((top >>> i) & 1) chk ^= gen[i]; }
  const version = data[0]; needMoonPayV1(version === 0 && (chk >>> 0) === 1 || version === 1 && (chk >>> 0) === 0x2bc830a3, 'FIAT_WALLET_INVALID');
  let bits = 0, acc = 0; const program = []; for (const v of data.slice(1, -6)) { acc = ((acc << 5) | v) & 0xffff; bits += 5; while (bits >= 8) { bits -= 8; program.push((acc >>> bits) & 255); } }
  needMoonPayV1(bits < 5 && ((acc << (8 - bits)) & 255) === 0 && (version === 0 && [20, 32].includes(program.length) || version === 1 && program.length === 32), 'FIAT_WALLET_INVALID');
  return text;
}
export function moonPayWalletV1(asset, value, environment) {
  needMoonPayV1(Object.hasOwn(MOONPAY_ASSETS_V1, asset));
  if (asset === 'BTC') return bitcoin(value, environment === 'SANDBOX');
  if (asset === 'ETH') { needMoonPayV1(typeof value === 'string' && /^0x[0-9a-fA-F]{40}$/.test(value) && !/^0x0{40}$/.test(value), 'FIAT_WALLET_INVALID'); return value.toLowerCase(); }
  const bytes = base58(value); needMoonPayV1(bytes.length === 32 && bytes.some(v => v !== 0), 'FIAT_WALLET_INVALID'); return value;
}
export function normalizeMoonPaySessionRequestV1(raw, environment) {
  const value = exactMoonPayV1(raw, ['requestId', 'flow', 'asset', 'network', 'fiatCurrency', 'amount', 'walletAddress']);
  moonPayIdV1(value.requestId); needMoonPayV1(['BUY', 'SELL'].includes(value.flow) && Object.hasOwn(MOONPAY_ASSETS_V1, value.asset));
  const asset = MOONPAY_ASSETS_V1[value.asset]; needMoonPayV1(value.network === asset.network && value.fiatCurrency === 'EUR', 'FIAT_ASSET_NETWORK_UNAVAILABLE');
  return Object.freeze({ requestId: value.requestId, flow: value.flow, asset: value.asset, network: value.network, fiatCurrency: 'EUR', amount: moonPayDecimalV1(value.amount, value.flow === 'BUY' ? 2 : asset.decimals), walletAddress: moonPayWalletV1(value.asset, value.walletAddress, environment) });
}
export const moonPayHashV1 = bytes => createHash('sha256').update(bytes).digest('hex');
export const moonPayChainV1 = (asset, environment) => MOONPAY_ASSETS_V1[asset][environment === 'SANDBOX' ? 'sandboxChain' : 'productionChain'];

export function moonPayAtomicAmountV1(value, decimals) { const amount = moonPayDecimalV1(value, decimals), [whole, fraction = ''] = amount.split('.'); return BigInt(whole + fraction.padEnd(decimals, '0')).toString(); }
export const moonPayNativeNetworkIdV1 = (asset, environment) => ({ BTC: environment === 'SANDBOX' ? 'bitcoin-testnet' : 'bitcoin-mainnet', ETH: environment === 'SANDBOX' ? 'ethereum-sepolia' : 'ethereum-mainnet', SOL: environment === 'SANDBOX' ? 'solana-devnet' : 'solana-mainnet' })[asset];
