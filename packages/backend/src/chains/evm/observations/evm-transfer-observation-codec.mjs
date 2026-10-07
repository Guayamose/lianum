/** Shared strict transaction/receipt/block projection. No I/O or authority.
 * Extracted unchanged from the existing original native-transfer observer. */
import { types } from 'node:util';
import { fields, need, freeze, hash32, rpcQuantity } from '../../shared/portfolio/portfolio-registry.mjs';
import { normalizeEvmBlock } from './evm-observation-adapter.mjs';
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const address = value => need(typeof value === 'string' && /^0x[0-9a-f]{40}$/.exec(value)?.[0] === value, 'EVM_TRANSFER_RPC_ADDRESS');
function hexData(value, maximum, exactBytes) {
  need(typeof value === 'string' && value.length <= 2 + maximum * 2
    && /^0x(?:[0-9a-f]{2})*$/.exec(value)?.[0] === value
    && (exactBytes === undefined || value.length === 2 + exactBytes * 2), 'EVM_TRANSFER_RPC_BYTES');
  return value;
}
function list(raw, maximum) {
  need(Array.isArray(raw) && !types.isProxy(raw) && Object.getPrototypeOf(raw) === Array.prototype
    && raw.length <= maximum && Reflect.ownKeys(raw).length === raw.length + 1, 'EVM_TRANSFER_RPC_ARRAY');
  return Array.from({ length: raw.length }, (_, index) => {
    const descriptor = Object.getOwnPropertyDescriptor(raw, String(index));
    need(descriptor && descriptor.enumerable && Object.hasOwn(descriptor, 'value'), 'EVM_TRANSFER_RPC_ARRAY');
    return descriptor.value;
  });
}
function rpcSignature(value) {
  need(typeof value === 'string' && value.length <= 66 && /^0x[0-9a-f]+$/.exec(value)?.[0] === value,
    'EVM_TRANSFER_RPC_SIGNATURE'); return BigInt(value).toString();
}
function rpcAccessList(raw) {
  return list(raw, 1024).map(item => {
    const value = fields(item, ['address', 'storageKeys']); address(value.address);
    return { address: value.address, storageKeys: list(value.storageKeys, 1024).map(key => hexData(key, 32, 32)) };
  });
}
export function normalizeObservedEvmTransaction(raw, signed) {
  const value = fields(raw, ['hash', 'type', 'chainId', 'nonce', 'from', 'to', 'value', 'gas', 'input', 'gasPrice',
    'v', 'r', 's', 'blockHash', 'blockNumber', 'transactionIndex'],
  ['maxFeePerGas', 'maxPriorityFeePerGas', 'accessList', 'yParity']);
  need(value.hash === signed.nativeId && rpcQuantity(value.type, 8).toString() === signed.type, 'EVM_TRANSFER_RPC_ORIGINAL_HASH_TYPE');
  const projected = { hash: value.hash, type: signed.type };
  for (const key of ['chainId', 'nonce', 'value', 'gas']) {
    projected[key] = rpcQuantity(value[key]).toString();
    need(projected[key] === signed[key], 'EVM_TRANSFER_RPC_SIGNED_FIELDS');
  }
  for (const key of ['from', 'to']) { address(value[key]); need(value[key] === signed[key], 'EVM_TRANSFER_RPC_SIGNED_FIELDS'); projected[key] = value[key]; }
  need(value.input === signed.data, 'EVM_TRANSFER_RPC_SIGNED_FIELDS'); projected.input = value.input;
  projected.gasPrice = rpcQuantity(value.gasPrice).toString();
  if (signed.type !== '2') need(projected.gasPrice === signed.gasPrice, 'EVM_TRANSFER_RPC_SIGNED_FEES');
  else {
    for (const key of ['maxFeePerGas', 'maxPriorityFeePerGas']) {
      projected[key] = rpcQuantity(value[key]).toString();
      need(projected[key] === signed[key], 'EVM_TRANSFER_RPC_SIGNED_FEES');
    }
    need(BigInt(projected.gasPrice) <= BigInt(signed.maxFeePerGas), 'EVM_TRANSFER_RPC_EFFECTIVE_FEE');
  }
  for (const key of ['v', 'r', 's']) {
    projected[key] = rpcSignature(value[key]); need(projected[key] === signed.signature[key], 'EVM_TRANSFER_RPC_SIGNATURE');
  }
  if (value.yParity !== undefined) need(signed.type !== '0'
    && rpcQuantity(value.yParity, 1).toString() === signed.signature.v, 'EVM_TRANSFER_RPC_SIGNATURE');
  if (signed.type !== '0') {
    projected.accessList = rpcAccessList(value.accessList);
    need(same(projected.accessList, signed.accessList), 'EVM_TRANSFER_RPC_ACCESS_LIST');
  } else need(value.accessList === undefined || list(value.accessList, 0).length === 0, 'EVM_TRANSFER_RPC_ACCESS_LIST');
  const pending = [value.blockHash, value.blockNumber, value.transactionIndex].every(field => field === null);
  if (pending) Object.assign(projected, { blockId: null, blockHeight: null, transactionIndex: null });
  else {
    projected.blockId = hash32(value.blockHash).slice(2);
    projected.blockHeight = rpcQuantity(value.blockNumber, 64).toString();
    projected.transactionIndex = rpcQuantity(value.transactionIndex, 64).toString();
  }
  return freeze(projected);
}
export function normalizeObservedEvmReceipt(raw, tx) {
  const value = fields(raw, ['transactionHash', 'transactionIndex', 'blockHash', 'blockNumber', 'from', 'to', 'type',
    'status', 'gasUsed', 'cumulativeGasUsed', 'effectiveGasPrice', 'contractAddress', 'logsBloom', 'logs']);
  need(value.transactionHash === tx.hash && value.from === tx.from && value.to === tx.to
    && value.contractAddress === null, 'EVM_TRANSFER_RECEIPT_IDENTITY');
  need(rpcQuantity(value.type, 8).toString() === tx.type, 'EVM_TRANSFER_RECEIPT_TYPE');
  const blockId = hash32(value.blockHash).slice(2), blockHeight = rpcQuantity(value.blockNumber, 64).toString();
  const transactionIndex = rpcQuantity(value.transactionIndex, 64).toString();
  need(blockId === tx.blockId && blockHeight === tx.blockHeight && transactionIndex === tx.transactionIndex,
    'EVM_TRANSFER_RECEIPT_INCLUSION');
  need(value.status === '0x0' || value.status === '0x1', 'EVM_TRANSFER_RECEIPT_STATUS');
  const gasUsed = rpcQuantity(value.gasUsed), cumulativeGasUsed = rpcQuantity(value.cumulativeGasUsed);
  const effectiveGasPrice = rpcQuantity(value.effectiveGasPrice);
  need(gasUsed > 0n && gasUsed <= BigInt(tx.gas) && cumulativeGasUsed >= gasUsed
    && effectiveGasPrice.toString() === tx.gasPrice, 'EVM_TRANSFER_RECEIPT_GAS');
  let previousLog = -1n;
  const logs = list(value.logs, 4096).map(rawLog => {
    const log = fields(rawLog, ['address', 'topics', 'data', 'blockNumber', 'blockHash', 'transactionHash', 'transactionIndex', 'logIndex', 'removed']);
    address(log.address);
    need(log.removed === false && log.transactionHash === tx.hash && log.blockHash === value.blockHash
      && log.blockNumber === value.blockNumber && log.transactionIndex === value.transactionIndex, 'EVM_TRANSFER_RECEIPT_LOG');
    const logIndex = rpcQuantity(log.logIndex, 64); need(logIndex > previousLog, 'EVM_TRANSFER_RECEIPT_LOG_ORDER'); previousLog = logIndex;
    return { address: log.address, topics: list(log.topics, 4).map(topic => hexData(topic, 32, 32)),
      data: hexData(log.data, 65536), logIndex: logIndex.toString() };
  });
  return freeze({ transactionHash: tx.hash, blockId, blockHeight, transactionIndex, from: value.from, to: value.to, type: tx.type,
    status: value.status === '0x1' ? 'success' : 'reverted', gasUsed: gasUsed.toString(), cumulativeGasUsed: cumulativeGasUsed.toString(),
    effectiveGasPrice: effectiveGasPrice.toString(), contractAddress: null, logsBloom: hexData(value.logsBloom, 256, 256), logs });
}
export function normalizeEvmInclusionBlock(raw, tx) {
  const block = normalizeEvmBlock(raw), transactions = list(fields(raw, ['transactions']).transactions, 131072);
  const ids = transactions.map(value => hash32(value));
  need(new Set(ids).size === ids.length, 'EVM_TRANSFER_BLOCK_DUPLICATE_TRANSACTION');
  need(block.hash.slice(2) === tx.blockId && block.height === tx.blockHeight, 'EVM_TRANSFER_CANONICAL_BLOCK_CHANGED', 'reorged');
  need(BigInt(tx.transactionIndex) < BigInt(ids.length) && ids[Number(tx.transactionIndex)] === tx.hash,
    'EVM_TRANSFER_BLOCK_TRANSACTION_INDEX');
  return block;
}

