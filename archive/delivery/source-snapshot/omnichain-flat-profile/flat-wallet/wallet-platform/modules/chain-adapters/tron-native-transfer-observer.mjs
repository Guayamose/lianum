/** Original retained TRX transaction observation only. Trusted SolidityNode RPC,
 * no signer, submission, permission verification, private credit or consensus. */
import { createHash } from 'node:crypto';
import { types } from 'node:util';
import { fields, need, freeze, hash32, safeMilliseconds, observationBootstrap,
  describeNetwork, checkFreshBlock, ObservationError } from './portfolio-registry.mjs';
import { normalizeTronInteger, normalizeTronBlock } from './tron-observation-adapter.mjs';
import { bindOriginalTronNativeTransfer } from './tron-native-transfer-wire.mjs';
const owners = new WeakSet(), issued = new WeakMap();
const exact = (value, required, optional = []) => fields(value, required, optional, true);
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const digest = (tag, value) => createHash('sha256').update(tag + '\0' + JSON.stringify(value)).digest('hex');
const P = '/walletsolidity/';
const bareHash = value => { need(typeof value === 'string' && value.length === 64, 'TRON_TRANSFER_HASH'); return hash32(value, false); };
function integer(value) {
  if (typeof value === 'string') need(/^(0|[1-9][0-9]*)$/.exec(value)?.[0] === value, 'TRON_TRANSFER_RPC_INTEGER');
  return normalizeTronInteger(value);
}
function rpcBlock(raw, genesis = false) {
  const header = fields(fields(fields(raw, ['block_header']).block_header, ['raw_data']).raw_data, [], ['number', 'timestamp']);
  for (const key of ['number', 'timestamp']) if (header[key] !== undefined) integer(header[key]);
  const block = normalizeTronBlock(raw, genesis); bareHash(block.hash);
  need(block.parentHash.length === 64, 'TRON_TRANSFER_PARENT_HASH'); return block;
}
const limits = Object.freeze({ currentFinalityVerified: false, independentConsensusVerified: false,
  accountPermissionVerified: false, taposVerified: false, expirationVerified: false,
  creditEligible: false, privateSpendableAtomic: null, graphAdmissionEligible: false,
  deliveryVerified: false, recipientRetainedValueVerified: false });
function list(raw, maximum) {
  need(Array.isArray(raw) && !types.isProxy(raw) && Object.getPrototypeOf(raw) === Array.prototype
    && raw.length <= maximum && Reflect.ownKeys(raw).length === raw.length + 1, 'TRON_TRANSFER_RPC_ARRAY');
  return Array.from({ length: raw.length }, (_, index) => {
    const descriptor = Object.getOwnPropertyDescriptor(raw, String(index));
    need(descriptor?.enumerable && Object.hasOwn(descriptor, 'value'), 'TRON_TRANSFER_RPC_ARRAY');
    return descriptor.value;
  });
}
function missing(raw) {
  fields(raw, []); return Reflect.ownKeys(raw).length === 0;
}
function transaction(raw, signed) {
  const value = fields(raw, ['txID', 'raw_data_hex', 'signature', 'ret']);
  need(value.txID === signed.nativeId && value.raw_data_hex === signed.rawDataHex, 'TRON_TRANSFER_RPC_ORIGINAL_BYTES');
  const signatures = list(value.signature, 1);
  const signature = signed.signature.r + signed.signature.s + Number(signed.signature.v).toString(16).padStart(2, '0');
  need(signatures.length === 1 && signatures[0] === signature, 'TRON_TRANSFER_RPC_ORIGINAL_SIGNATURE');
  const results = list(value.ret, 1); need(results.length === 1, 'TRON_TRANSFER_RPC_RESULT');
  const result = fields(results[0], ['contractRet'], ['ret']);
  // Never infer success from an omitted enum. A plain TRX transfer needs an
  // explicit transaction contractRet SUCCESS; missing history remains unknown.
  need(result.contractRet === 'SUCCESS' && (result.ret === undefined || result.ret === 'SUCESS'),
    'TRON_TRANSFER_REPORTED_RESULT_NOT_SUCCESS');
  return freeze({ nativeId: value.txID, transactionSHA256: signed.transactionSHA256, result: 'SUCCESS' });
}
function receipt(raw, signed) {
  const value = fields(raw, ['id', 'blockNumber', 'blockTimeStamp'], ['result', 'fee', 'receipt']);
  need(value.id === signed.nativeId, 'TRON_TRANSFER_RECEIPT_IDENTITY');
  // TransactionInfo's default enum is spelled SUCESS by the protocol. Its
  // absence alone proves nothing; transaction() separately requires SUCCESS.
  need(value.result === undefined || value.result === 'SUCESS', 'TRON_TRANSFER_RECEIPT_NOT_SUCCESS');
  const resource = value.receipt === undefined ? {} : fields(value.receipt, [], ['result']);
  need(resource.result === undefined || resource.result === 'SUCCESS', 'TRON_TRANSFER_RECEIPT_NOT_SUCCESS');
  const blockHeight = integer(value.blockNumber), timestampMs = integer(value.blockTimeStamp);
  need(blockHeight !== '0' && timestampMs !== '0', 'TRON_TRANSFER_RECEIPT_BLOCK');
  // Deliberately not a full fee/resource receipt commitment. Omitted fee is null,
  // not zero, and no custody/recipient balance inference is made from it.
  return freeze({ nativeId: value.id, blockHeight, timestampMs, transactionResult: 'SUCCESS',
    infoResult: value.result ?? null, resourceResult: resource.result ?? null,
    feeSun: value.fee === undefined ? null : integer(value.fee) });
}
function included(raw, info, signed) {
  const block = rpcBlock(raw), transactions = list(fields(raw, ['transactions']).transactions, 131072);
  need(block.height === info.blockHeight && block.timestampMs === info.timestampMs, 'TRON_TRANSFER_BLOCK_RECEIPT_MISMATCH', 'reorged');
  const ids = transactions.map(tx => bareHash(fields(tx, ['txID']).txID));
  need(new Set(ids).size === ids.length, 'TRON_TRANSFER_BLOCK_DUPLICATE_TRANSACTION');
  const index = ids.indexOf(signed.nativeId); need(index >= 0, 'TRON_TRANSFER_ORIGINAL_NOT_IN_BLOCK', 'reorged');
  transaction(transactions[index], signed);
  return { block, transactionIndex: String(index) };
}
function restoredInclusion(raw) {
  if (raw === undefined) return null;
  const value = exact(raw, ['blockId', 'blockHeight', 'transactionIndex', 'receiptCommitment']);
  bareHash(value.blockId); bareHash(value.receiptCommitment);
  for (const key of ['blockHeight', 'transactionIndex']) {
    need(typeof value[key] === 'string' && integer(value[key]) === value[key], 'TRON_TRANSFER_ORIGINAL_INCLUSION');
  }
  need(value.blockHeight !== '0' && BigInt(value.transactionIndex) < 131072n
    && BigInt('0x' + value.blockId.slice(0, 16)).toString() === value.blockHeight, 'TRON_TRANSFER_ORIGINAL_INCLUSION');
  return freeze(value);
}
export function assertTronNativeTransferObserver(observer) {
  need(owners.has(observer), 'TRON_TRANSFER_OBSERVER_PROVENANCE');
}
export function assertTronNativeTransferObservation(observation, observer) {
  need(owners.has(observer) && issued.get(observation) === observer, 'TRON_TRANSFER_OBSERVATION_PROVENANCE');
}
export function createTronNativeTransferObserver(raw) {
  const options = exact(raw, ['chain', 'genesisHash', 'transport', 'original'], ['now', 'freshness']);
  const config = observationBootstrap(Object.fromEntries(Object.entries(options).filter(([key]) => key !== 'original')), 'tron');
  bareHash(config.genesisHash);
  const original = exact(options.original, ['nativeWire', 'expected'], ['inclusion']);
  const { signed } = bindOriginalTronNativeTransfer({ nativeWire: original.nativeWire, expected: original.expected });
  let retained = restoredInclusion(original.inclusion), busy = false;
  const descriptor = describeNetwork(config.chain, config.genesisHash);
  const assetCommitment = digest('LIANUM/native-value-asset/1', { nativeAssetId: descriptor.nativeAsset.id });
  const network = freeze({ ...descriptor, nativeAssetCommitment: assetCommitment,
    finality: { ...descriptor.finality, rule: 'tron-node-reported-solidified' } });
  const publicOriginal = freeze({ schema: 'flat-tron-original-transfer-identity/1', nativeId: signed.nativeId,
    chain: 'tron', family: 'tron', chainId: null, genesisHash: config.genesisHash, networkId: network.networkId,
    asset: { ...network.nativeAsset, commitment: assetCommitment }, from: signed.ownerAddress, to: signed.recipientAddress,
    value: signed.amountSun, nonce: null, transactionType: 'TransferContract', metadataOnly: true,
    finalitySource: 'rpc-solidified', ...limits });
  const projection = (status, reason, observedAtMs, validUntilMs) => freeze({ ...publicOriginal,
    schema: 'flat-tron-original-transfer-status/1', source: 'retained-observation-metadata',
    freshness: 'not-revalidated', status, reason, observedAtMs, validUntilMs });
  let latest = projection('unobserved', 'TRON_TRANSFER_NOT_OBSERVED', null, null);
  function output(status, reason, at, evidence = null) {
    const result = freeze({ schema: 'flat-tron-original-transfer-observation/1', status, reason, nativeId: signed.nativeId,
      nativeWire: status === 'observed' ? signed.nativeWire : null, network,
      original: publicOriginal, observedAtMs: String(at), validUntilMs: evidence?.validUntilMs ?? null, evidence,
      assurance: 'trusted-rpc-original-transaction-receipt-observation', ...limits });
    issued.set(result, observer); latest = projection(status, reason, result.observedAtMs, result.validUntilMs); return result;
  }
  const observer = Object.freeze({ network,
    originalIdentity() { need(arguments.length === 0, 'TRON_TRANSFER_METADATA_ARGUMENTS'); return publicOriginal; },
    status() { need(arguments.length === 0, 'TRON_TRANSFER_METADATA_ARGUMENTS'); return latest; },
    async observe(rawQuery) {
      const query = exact(rawQuery, ['nativeId']); need(query.nativeId === signed.nativeId, 'TRON_TRANSFER_ORIGINAL_QUERY');
      const started = safeMilliseconds(config.now());
      if (busy) return output('unknown', 'TRON_TRANSFER_BUSY', started);
      busy = true; const controller = new AbortController(); let timer;
      const call = async (path, body) => {
        need(!controller.signal.aborted, 'TRON_TRANSFER_QUERY_TIMEOUT');
        try { return await config.transport(P + path, freeze(body), { signal: controller.signal }); }
        catch { need(false, 'TRON_TRANSFER_RPC_UNAVAILABLE'); }
      };
      const blockAt = async height => rpcBlock(await call('getblockbynum', { num: height }), height === '0');
      const checkGenesis = async () => {
        const genesis = await blockAt('0');
        need(genesis.height === '0' && genesis.hash === config.genesisHash, 'TRON_TRANSFER_GENESIS_MISMATCH');
      };
      const originalBody = { value: signed.nativeId };
      try {
        const examined = await Promise.race([(async () => {
          await checkGenesis();
          const solid = rpcBlock(await call('getnowblock', {}));
          const txRaw = await call('gettransactionbyid', originalBody), infoRaw = await call('gettransactioninfobyid', originalBody);
          if (missing(txRaw) && missing(infoRaw)) return { status: 'unknown', reason: 'TRON_TRANSFER_ORIGINAL_NOT_FOUND' };
          need(!missing(txRaw) && !missing(infoRaw), 'TRON_TRANSFER_INCOMPLETE_HISTORY');
          const tx = transaction(txRaw, signed), info = receipt(infoRaw, signed);
          const first = included(await call('getblockbynum', { num: info.blockHeight }), info, signed);
          const inclusion = freeze({ blockId: first.block.hash, blockHeight: first.block.height, transactionIndex: first.transactionIndex,
            receiptCommitment: digest('LIANUM/original-tron-status-receipt/1', info) });
          if (retained) need(same(inclusion, retained), 'TRON_TRANSFER_ORIGINAL_INCLUSION_CHANGED', 'reorged');
          const txAgain = transaction(await call('gettransactionbyid', originalBody), signed);
          const infoAgain = receipt(await call('gettransactioninfobyid', originalBody), signed);
          need(same(tx, txAgain) && same(info, infoAgain), 'TRON_TRANSFER_RPC_RECEIPT_CHANGED', 'reorged');
          const second = included(await call('getblockbynum', { num: info.blockHeight }), infoAgain, signed);
          need(same(first, second), 'TRON_TRANSFER_CANONICAL_BLOCK_CHANGED', 'reorged');
          const solidAgain = rpcBlock(await call('getnowblock', {}));
          need(BigInt(solidAgain.height) >= BigInt(solid.height), 'TRON_TRANSFER_FINALITY_REGRESSED', 'reorged');
          if (solidAgain.height === solid.height) need(same(solid, solidAgain), 'TRON_TRANSFER_SOLIDIFIED_BLOCK_CHANGED', 'reorged');
          need(BigInt(solidAgain.timestampMs) >= BigInt(solid.timestampMs), 'TRON_TRANSFER_SOLIDIFIED_TIME_REGRESSED', 'reorged');
          need(same(solid, await blockAt(solid.height)) && same(solidAgain, await blockAt(solidAgain.height)),
            'TRON_TRANSFER_SOLIDIFIED_BLOCK_CHANGED', 'reorged');
          await checkGenesis();
          const at = safeMilliseconds(config.now()); checkFreshBlock(solidAgain, at, config.freshness);
          if (BigInt(info.blockHeight) > BigInt(solid.height)) return { status: 'pending', reason: 'TRON_TRANSFER_NOT_SOLIDIFIED_AT_START' };
          need(BigInt(info.timestampMs) <= BigInt(solid.timestampMs), 'TRON_TRANSFER_BLOCK_TIME');
          if (first.block.height === solid.height) need(same(first.block, solid), 'TRON_TRANSFER_SOLIDIFIED_BLOCK_CHANGED', 'reorged');
          const deadline = BigInt(solidAgain.timestampMs) + BigInt(config.freshness.maxBlockAgeMs), recheck = BigInt(at) + 30000n;
          const validUntilMs = (deadline < recheck ? deadline : recheck).toString();
          return { status: 'observed', reason: null, inclusion, evidence: { inclusion, receipt: info, block: first.block,
            solidified: solidAgain, rpcSolidifiedDepth: (BigInt(solidAgain.height) - BigInt(info.blockHeight) + 1n).toString(), validUntilMs } };
        })(), new Promise((_, reject) => { timer = setTimeout(() => {
          controller.abort(); reject(new ObservationError('TRON_TRANSFER_QUERY_TIMEOUT'));
        }, config.freshness.maxQueryMs); })]);
        const at = safeMilliseconds(config.now());
        need(at >= started && at - started < config.freshness.maxQueryMs, 'TRON_TRANSFER_QUERY_TIMEOUT');
        // Timeout losers never latch inclusion. Persistence is the caller's job.
        if (examined.inclusion) retained ??= examined.inclusion;
        return output(examined.status, examined.reason, at, examined.evidence ?? null);
      } catch (error) {
        return output(error instanceof ObservationError ? error.status : 'unknown',
          error instanceof ObservationError ? error.code : 'TRON_TRANSFER_OBSERVATION_INVALID', safeMilliseconds(config.now()));
      } finally { clearTimeout(timer); controller.abort(); busy = false; }
    },
  });
  owners.add(observer); return observer;
}
