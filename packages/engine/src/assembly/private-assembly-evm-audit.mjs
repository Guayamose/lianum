/** Private operational evidence only. Never publish these records wholesale. */
import assert from 'node:assert/strict';

export async function captureAssemblyEvmReceipt(runtime, entry) {
  const { receipt, request } = entry;
  assert.match(receipt.transactionHash, /^0x[0-9a-f]{64}$/i);
  const transaction = await runtime.evm('eth_getTransactionByHash', [receipt.transactionHash]);
  const rereadReceipt = await runtime.evm('eth_getTransactionReceipt', [receipt.transactionHash]);
  const header = await runtime.evm('eth_getBlockByHash', [receipt.blockHash, false]);
  assert.equal(transaction?.hash, receipt.transactionHash, 'PC18_EVM_AUDIT_TX');
  assert.equal(transaction.blockHash, receipt.blockHash, 'PC18_EVM_AUDIT_TX_BLOCK');
  assert.equal(transaction.blockNumber, receipt.blockNumber, 'PC18_EVM_AUDIT_TX_HEIGHT');
  assert.equal(transaction.from?.toLowerCase(), request.from?.toLowerCase(), 'PC18_EVM_AUDIT_SENDER');
  assert.equal(transaction.to?.toLowerCase() ?? null, request.to?.toLowerCase() ?? null, 'PC18_EVM_AUDIT_TARGET');
  assert.equal(transaction.input?.toLowerCase(), (request.data ?? '0x').toLowerCase(), 'PC18_EVM_AUDIT_CALLDATA');
  assert.equal(BigInt(transaction.value), BigInt(request.value ?? 0), 'PC18_EVM_AUDIT_VALUE');
  assert.deepEqual(rereadReceipt, receipt, 'PC18_EVM_AUDIT_RECEIPT');
  assert.equal(header?.hash, receipt.blockHash, 'PC18_EVM_AUDIT_HEADER');
  assert.equal(header.number, receipt.blockNumber, 'PC18_EVM_AUDIT_HEADER_HEIGHT');
  assert.ok(header.transactions.includes(receipt.transactionHash), 'PC18_EVM_AUDIT_MEMBERSHIP');
  return { kind: 'PRIVATE_EVM_TRANSACTION_RECEIPT_HEADER', ...structuredClone(entry), transaction, header };
}
