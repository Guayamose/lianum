/** Original native-value transaction/receipt observation across the four named
 * EVM networks. Trusted RPC evidence only: no delivery/custody/spendable credit,
 * K-binding, graph admission, independent consensus, signer or broadcast. */
import { createHash } from 'node:crypto';
import { types } from 'node:util';
import { fields, need, freeze, hash32, rpcQuantity, safeMilliseconds, observationBootstrap,
  describeNetwork, PORTFOLIO_CHAINS, checkFreshBlock, ObservationError } from '../../shared/portfolio/portfolio-registry.mjs';
import { normalizeEvmBlock } from './evm-observation-adapter.mjs';
import { bindOriginalEvmNativeTransfer } from '../transfers/evm-native-transfer-wire.mjs';
import { evmFundingEndpointCommitment } from '../dispatch/evm-facts-binding.mjs';
import { nativeFactIdentity, nativeObservedEffectCommitment } from '../../shared/dispatch/native-receipt-binding.mjs';

const issued = new WeakMap(), owners = new WeakSet();
const ZERO = '0'.repeat(64), RECHECK_MS = 30000;
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const digest = (tag, value) => sha(Buffer.from(tag + '\0' + JSON.stringify(value)));
const exact = (raw, required, optional = []) => fields(raw, required, optional, true);
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const hexQuantity = value => '0x' + BigInt(value).toString(16);
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
function transaction(raw, signed) {
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
function receipt(raw, tx) {
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
function inclusionBlock(raw, tx) {
  const block = normalizeEvmBlock(raw), transactions = list(fields(raw, ['transactions']).transactions, 131072);
  const ids = transactions.map(value => hash32(value));
  need(new Set(ids).size === ids.length, 'EVM_TRANSFER_BLOCK_DUPLICATE_TRANSACTION');
  need(block.hash.slice(2) === tx.blockId && block.height === tx.blockHeight, 'EVM_TRANSFER_CANONICAL_BLOCK_CHANGED', 'reorged');
  need(BigInt(tx.transactionIndex) < BigInt(ids.length) && ids[Number(tx.transactionIndex)] === tx.hash,
    'EVM_TRANSFER_BLOCK_TRANSACTION_INDEX');
  return block;
}

/** Derived native asset key is separate from existing pool-backed asset IDs.
 * Integrators must register this exact domain rather than aliasing token names. */
export function evmNativeTransferNetwork(raw) {
  const value = exact(raw, ['chain', 'genesisHash']);
  need(typeof value.chain === 'string' && Object.hasOwn(PORTFOLIO_CHAINS, value.chain)
    && PORTFOLIO_CHAINS[value.chain].family === 'evm', 'EVM_TRANSFER_CHAIN'); hash32(value.genesisHash);
  const network = describeNetwork(value.chain, value.genesisHash);
  return freeze({ ...network, nativeAssetCommitment: digest('LIANUM/native-value-asset/1', { nativeAssetId: network.nativeAsset.id }),
    finality: { ...network.finality,
      rule: value.chain === 'ethereum' ? 'ethereum-rpc-finalized' : value.chain === 'bnb' ? 'bsc-rpc-finalized'
        : value.chain === 'bsc-local' ? 'bsc-owned-local-native-finalized'
        : value.chain === 'base' ? 'base-node-reported-finalized' : 'arbitrum-node-reported-finalized',
      rollupExecutionProofVerified: false, rollupWithdrawalSettlementVerified: false } });
}
/** Private bootstrap brand. Copied shapes, callbacks and proxies cannot
 * become an original-bound reader. This asserts provenance, not permission. */
export function assertEvmNativeTransferObserver(observer) {
  need(owners.has(observer), 'EVM_TRANSFER_OBSERVER_PROVENANCE');
}
/** Provenance only; does not establish freshness, ownership, consensus or
 * permission for a private credit. Calling observe again performs fresh I/O. */
export function assertEvmNativeTransferObservation(observation, observer) {
  need(owners.has(observer) && issued.get(observation) === observer, 'EVM_TRANSFER_OBSERVATION_PROVENANCE');
}

export function createEvmNativeTransferObserver(raw) {
  const options = exact(raw, ['chain', 'genesisHash', 'transport', 'original'], ['now', 'freshness']);
  const config = observationBootstrap(Object.fromEntries(Object.entries(options).filter(([key]) => key !== 'original')), 'evm');
  const network = evmNativeTransferNetwork({ chain: config.chain, genesisHash: config.genesisHash });
  const { signed, inclusion: restored } = bindOriginalEvmNativeTransfer(options.original, config.descriptor.chainId);
  const genesis = config.genesisHash.slice(2), asset = network.nativeAssetCommitment, nativeId = signed.nativeId.slice(2);
  const transactionId = nativeId + ZERO;
  const sourceCommitment = evmFundingEndpointCommitment({ genesis, asset, address: signed.from.slice(2) });
  const destinationCommitment = evmFundingEndpointCommitment({ genesis, asset, address: signed.to.slice(2) });
  const identity = freeze({ family: '3', genesis, asset, nativeId, transactionId, effectIndex: '0',
    nativeGid: nativeFactIdentity({ family: '3', genesis, asset, transactionId, effectIndex: '0' }),
    transactionSHA256: signed.transactionSHA256, from: signed.from, to: signed.to, amount: signed.value, nonce: signed.nonce,
    transactionType: signed.type, sourceCommitment, destinationCommitment });
  // App-safe fixed identity: configuration metadata only. It deliberately
  // excludes raw wire, signature, arbitrary RPC selection and receipt/log data.
  const publicOriginal = freeze({ schema: 'flat-evm-original-transfer-identity/1',
    nativeId, chain: network.chain, family: 'evm', chainId: network.chainId,
    genesisHash: network.genesisHash, networkId: network.networkId,
    asset: { ...network.nativeAsset, commitment: asset }, from: signed.from, to: signed.to,
    value: signed.value, nonce: signed.nonce, transactionType: signed.type,
    metadataOnly: true, currentFinalityVerified: false, creditEligible: false,
    privateSpendableAtomic: null, graphAdmissionEligible: false,
    deliveryVerified: false, recipientRetainedValueVerified: false });
  const publicStatus = (status, reason, observedAtMs, validUntilMs) => freeze({ ...publicOriginal,
    schema: 'flat-evm-original-transfer-status/1', source: 'retained-observation-metadata',
    freshness: 'not-revalidated', status, reason, observedAtMs, validUntilMs });
  let latestStatus = publicStatus('unobserved', 'EVM_TRANSFER_NOT_OBSERVED', null, null);
  let retained = restored, busy = false;
  function output(status, reason, at, evidence = null) {
    const result = freeze({ schema: 'flat-evm-original-transfer-observation/1', status, reason, nativeId,
      nativeWire: status === 'observed' ? signed.nativeWire.slice(2) : null, network, identity, observedAtMs: String(at),
      validUntilMs: evidence?.validUntilMs ?? null, evidence,
      assurance: 'trusted-rpc-original-transaction-receipt-observation', creditEligible: false, privateSpendableAtomic: null,
      graphAdmissionEligible: false, deliveryVerified: false, recipientRetainedValueVerified: false });
    issued.set(result, observer);
    latestStatus = publicStatus(status, reason, result.observedAtMs, result.validUntilMs);
    return result;
  }
  const observer = Object.freeze({ network, identity,
    originalIdentity() {
      need(arguments.length === 0, 'EVM_TRANSFER_METADATA_ARGUMENTS'); return publicOriginal;
    },
    status() {
      need(arguments.length === 0, 'EVM_TRANSFER_METADATA_ARGUMENTS'); return latestStatus;
    },
    async observe(rawQuery) {
      const query = exact(rawQuery, ['nativeId']); need(query.nativeId === nativeId, 'EVM_TRANSFER_ORIGINAL_QUERY');
      const started = safeMilliseconds(config.now());
      if (busy) return output('unknown', 'EVM_TRANSFER_BUSY', started);
      busy = true; const controller = new AbortController(); let timer;
      const call = async (method, params) => {
        need(!controller.signal.aborted, 'EVM_TRANSFER_QUERY_TIMEOUT');
        try { return await config.transport(method, freeze(params), { signal: controller.signal }); }
        catch { need(false, 'EVM_TRANSFER_RPC_UNAVAILABLE'); }
      };
      const checkIdentity = async () => {
        need(rpcQuantity(await call('eth_chainId', []), 64).toString() === network.chainId, 'EVM_TRANSFER_CHAIN_ID_MISMATCH');
        const observed = normalizeEvmBlock(await call('eth_getBlockByNumber', ['0x0', false]));
        need(observed.height === '0' && observed.hash === config.genesisHash, 'EVM_TRANSFER_GENESIS_MISMATCH');
      };
      try {
        const examined = await Promise.race([(async () => {
          await checkIdentity();
          const finalized = normalizeEvmBlock(await call('eth_getBlockByNumber', ['finalized', false]));
          const txRaw = await call('eth_getTransactionByHash', [signed.nativeId]);
          const receiptRaw = await call('eth_getTransactionReceipt', [signed.nativeId]);
          if (txRaw === null && receiptRaw === null) return { status: 'unknown', reason: 'EVM_TRANSFER_ORIGINAL_NOT_FOUND' };
          need(txRaw !== null, 'EVM_TRANSFER_INCOMPLETE_HISTORY'); const tx = transaction(txRaw, signed);
          if (tx.blockId === null) {
            need(receiptRaw === null, 'EVM_TRANSFER_INCOMPLETE_HISTORY');
            return { status: 'pending', reason: 'EVM_TRANSFER_NOT_INCLUDED' };
          }
          need(receiptRaw !== null, 'EVM_TRANSFER_RECEIPT_MISSING'); const observedReceipt = receipt(receiptRaw, tx);
          const block = inclusionBlock(await call('eth_getBlockByNumber', [hexQuantity(tx.blockHeight), false]), tx);
          const inclusion = freeze({ blockId: tx.blockId, blockHeight: tx.blockHeight, transactionIndex: tx.transactionIndex,
            receiptCommitment: digest('LIANUM/original-evm-receipt/1', observedReceipt) });
          if (retained) need(same(inclusion, retained), 'EVM_TRANSFER_ORIGINAL_INCLUSION_CHANGED', 'reorged');
          const repeatedTx = transaction(await call('eth_getTransactionByHash', [signed.nativeId]), signed);
          const repeatedReceipt = receipt(await call('eth_getTransactionReceipt', [signed.nativeId]), repeatedTx);
          need(same(tx, repeatedTx) && same(observedReceipt, repeatedReceipt), 'EVM_TRANSFER_RPC_RECEIPT_CHANGED', 'reorged');
          const repeatedBlock = inclusionBlock(await call('eth_getBlockByNumber', [hexQuantity(tx.blockHeight), false]), repeatedTx);
          need(same(block, repeatedBlock), 'EVM_TRANSFER_CANONICAL_BLOCK_CHANGED', 'reorged');
          const repeatedFinalized = normalizeEvmBlock(await call('eth_getBlockByNumber', ['finalized', false]));
          need(BigInt(repeatedFinalized.height) >= BigInt(finalized.height), 'EVM_TRANSFER_FINALITY_REGRESSED', 'reorged');
          if (repeatedFinalized.height === finalized.height)
            need(same(finalized, repeatedFinalized), 'EVM_TRANSFER_FINALIZED_BLOCK_CHANGED', 'reorged');
          const oldFinalizedCanonical = normalizeEvmBlock(await call('eth_getBlockByNumber', [hexQuantity(finalized.height), false]));
          need(same(finalized, oldFinalizedCanonical), 'EVM_TRANSFER_FINALIZED_BLOCK_CHANGED', 'reorged');
          const finalCanonical = normalizeEvmBlock(await call('eth_getBlockByNumber', [hexQuantity(repeatedFinalized.height), false]));
          need(same(repeatedFinalized, finalCanonical), 'EVM_TRANSFER_FINALIZED_BLOCK_CHANGED', 'reorged');
          await checkIdentity();
          const at = safeMilliseconds(config.now()); checkFreshBlock(repeatedFinalized, at, config.freshness);
          if (BigInt(tx.blockHeight) > BigInt(finalized.height)) return { status: 'pending', reason: 'EVM_TRANSFER_NOT_FINALIZED' };
          need(BigInt(block.timestampMs) <= BigInt(finalized.timestampMs), 'EVM_TRANSFER_BLOCK_TIME');
          if (block.height === finalized.height) need(same(block, finalized), 'EVM_TRANSFER_FINALIZED_BLOCK_CHANGED', 'reorged');
          const confirmations = BigInt(repeatedFinalized.height) - BigInt(tx.blockHeight) + 1n;
          need(confirmations > 0n && confirmations < 1n << 32n, 'EVM_TRANSFER_DEPTH_BOUND');
          const recheckAt = BigInt(at) + BigInt(RECHECK_MS), headExpires = BigInt(repeatedFinalized.timestampMs) + BigInt(config.freshness.maxBlockAgeMs);
          const validUntilMs = (recheckAt < headExpires ? recheckAt : headExpires).toString();
          const evidence = { inclusion, receipt: observedReceipt, block, finalized: repeatedFinalized,
            rpcFinalizedDepth: confirmations.toString(), validUntilMs,
            observedEffectCommitment: observedReceipt.status === 'success' ? nativeObservedEffectCommitment({
              family: '3', genesis, asset, nativeGid: identity.nativeGid, blockId: tx.blockId, blockHeight: tx.blockHeight,
              transactionSHA256: signed.transactionSHA256, sourceCommitment, destinationCommitment, amount: signed.value }) : null };
          return { status: observedReceipt.status === 'success' ? 'observed' : 'reverted', reason: observedReceipt.status === 'success'
            ? null : 'EVM_TRANSFER_TRANSACTION_REVERTED', evidence, inclusion };
        })(), new Promise((_, reject) => { timer = setTimeout(() => {
          controller.abort(); reject(new ObservationError('EVM_TRANSFER_QUERY_TIMEOUT'));
        }, config.freshness.maxQueryMs); })]);
        const at = safeMilliseconds(config.now());
        need(at >= started && at - started < config.freshness.maxQueryMs, 'EVM_TRANSFER_QUERY_TIMEOUT');
        // Only after the complete bounded read may the original inclusion latch
        // advance from absent to retained. Timeout losers never mutate it.
        if (examined.inclusion) retained ??= examined.inclusion;
        return output(examined.status, examined.reason, at, examined.evidence ?? null);
      } catch (error) {
        return output(error instanceof ObservationError ? error.status : 'unknown',
          error instanceof ObservationError ? error.code : 'EVM_TRANSFER_OBSERVATION_INVALID', safeMilliseconds(config.now()));
      } finally { clearTimeout(timer); controller.abort(); busy = false; }
    },
  });
  owners.add(observer); return observer;
}
