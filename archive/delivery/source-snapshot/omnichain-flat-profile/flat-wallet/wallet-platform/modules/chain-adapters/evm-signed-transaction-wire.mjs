/** Shared public-only EIP-155/2930/1559 wire parser, extracted unchanged from
 * the native-transfer observer. This parser alone selects NO action profile.
 * No signer, broadcast, recipient-code, execution or native-consensus claim. */
import { createHash } from 'node:crypto';
import { decodeCanonicalEvmTransaction, recoverSecp256k1Sender } from './owned-evm-v2-runtime.mjs';
import { publicKeccak256 } from '../../../../../omnichain-product/src/private-cohort-public-native.mjs';
import { need, freeze } from './portfolio-registry.mjs';

const MAX_WIRE = 131072;
const integerBytes = number => {
  if (number === 0n) return Buffer.alloc(0);
  const hex = number.toString(16); return Buffer.from(hex.length % 2 ? '0' + hex : hex, 'hex');
};
function lengthPrefix(length, offset) {
  if (length < 56) return Buffer.from([offset + length]);
  const bytes = integerBytes(BigInt(length)); return Buffer.concat([Buffer.from([offset + 55 + bytes.length]), bytes]);
}
function encode(value) {
  if (Array.isArray(value)) { const body = Buffer.concat(value.map(encode)); return Buffer.concat([lengthPrefix(body.length, 192), body]); }
  if (value.length === 1 && value[0] < 128) return value;
  return Buffer.concat([lengthPrefix(value.length, 128), value]);
}
function rlp(raw) {
  let cursor = 0, nodes = 0;
  function item(boundary, depth) {
    need(cursor < boundary && depth <= 6 && ++nodes <= 8192, 'EVM_TRANSFER_RLP_BOUND');
    const first = raw[cursor++]; if (first < 128) return Buffer.from([first]);
    const list = first >= 192, offset = list ? 192 : 128;
    let size = first - offset;
    if (size > 55) {
      const width = size - 55;
      need(width <= 4 && cursor + width <= boundary && raw[cursor] !== 0, 'EVM_TRANSFER_RLP_SIZE');
      size = Number(BigInt('0x' + raw.subarray(cursor, cursor + width).toString('hex'))); cursor += width;
      need(size >= 56, 'EVM_TRANSFER_RLP_NONCANONICAL');
    }
    const end = cursor + size; need(end <= boundary, 'EVM_TRANSFER_RLP_TRUNCATED');
    if (!list) {
      const bytes = raw.subarray(cursor, end); cursor = end;
      need(size !== 1 || bytes[0] >= 128, 'EVM_TRANSFER_RLP_NONCANONICAL'); return bytes;
    }
    const result = []; while (cursor < end) result.push(item(end, depth + 1)); return result;
  }
  const output = item(raw.length, 0);
  need(cursor === raw.length && encode(output).equals(raw), 'EVM_TRANSFER_RLP_NONCANONICAL'); return output;
}
function uint(raw) {
  need(Buffer.isBuffer(raw) && raw.length <= 32 && (raw.length === 0 || raw[0] !== 0), 'EVM_TRANSFER_WIRE_INTEGER');
  return raw.length ? BigInt('0x' + raw.toString('hex')) : 0n;
}
function accessList(raw) {
  need(Array.isArray(raw) && raw.length <= 1024, 'EVM_TRANSFER_ACCESS_LIST');
  return raw.map(entry => {
    need(Array.isArray(entry) && entry.length === 2 && Buffer.isBuffer(entry[0]) && entry[0].length === 20
      && Array.isArray(entry[1]) && entry[1].length <= 1024, 'EVM_TRANSFER_ACCESS_LIST');
    return { address: '0x' + entry[0].toString('hex'), storageKeys: entry[1].map(key => {
      need(Buffer.isBuffer(key) && key.length === 32, 'EVM_TRANSFER_ACCESS_LIST'); return '0x' + key.toString('hex');
    }) };
  });
}

export function decodeEvmSignedTransactionWire(nativeWire) {
  need(typeof nativeWire === 'string' && nativeWire.length > 2 && nativeWire.length <= 2 + 2 * MAX_WIRE
    && /^0x(?:[0-9a-f]{2})+$/.exec(nativeWire)?.[0] === nativeWire, 'EVM_TRANSFER_WIRE');
  const bytes = Buffer.from(nativeWire.slice(2), 'hex'), type = bytes[0] >= 192 ? 0 : bytes[0];
  need(type === 0 || type === 1 || type === 2, 'EVM_TRANSFER_TRANSACTION_TYPE');
  const values = rlp(type ? bytes.subarray(1) : bytes);
  need(Array.isArray(values) && values.length === (type === 0 ? 9 : type === 1 ? 11 : 12), 'EVM_TRANSFER_WIRE_FIELDS');
  const signature = values.slice(-3).map(uint), [v, r, s] = signature;
  let decoded;
  if (type === 0) {
    try { decoded = { ...decodeCanonicalEvmTransaction(nativeWire), type: '0', accessList: [] }; }
    catch { need(false, 'EVM_TRANSFER_WIRE_SIGNATURE'); }
  } else {
    const feeCount = type === 1 ? 1 : 2, targetIndex = 3 + feeCount;
    const chainId = uint(values[0]), nonce = uint(values[1]), gas = uint(values[2 + feeCount]), value = uint(values[targetIndex + 1]);
    need(chainId > 0n && v <= 1n, 'EVM_TRANSFER_WIRE_CHAIN_SIGNATURE');
    need(Buffer.isBuffer(values[targetIndex]) && values[targetIndex].length === 20
      && Buffer.isBuffer(values[targetIndex + 2]), 'EVM_TRANSFER_WIRE_TARGET');
    const fees = type === 1 ? { gasPrice: uint(values[2]).toString() }
      : { maxPriorityFeePerGas: uint(values[2]).toString(), maxFeePerGas: uint(values[3]).toString() };
    if (type === 2) need(BigInt(fees.maxFeePerGas) >= BigInt(fees.maxPriorityFeePerGas), 'EVM_TRANSFER_FEE_CAP');
    const signingWire = Buffer.concat([Buffer.from([type]), encode(values.slice(0, -3))]);
    let from;
    try { from = recoverSecp256k1Sender({ digest: publicKeccak256(signingWire).toString('hex'),
      r: r.toString(16).padStart(64, '0'), s: s.toString(16).padStart(64, '0'), parity: Number(v) }); }
    catch { need(false, 'EVM_TRANSFER_WIRE_SIGNATURE'); }
    decoded = { type: String(type), chainId: chainId.toString(), nonce: nonce.toString(), gas: gas.toString(), ...fees,
      from, to: '0x' + values[targetIndex].toString('hex'), value: value.toString(), data: '0x' + values[targetIndex + 2].toString('hex'),
      accessList: accessList(values[targetIndex + 3]), nativeId: '0x' + publicKeccak256(bytes).toString('hex'),
      transactionSHA256: createHash('sha256').update(bytes).digest('hex'), nativeWire };
  }
  return freeze({ ...decoded, signature: { v: v.toString(), r: r.toString(), s: s.toString() } });
}
