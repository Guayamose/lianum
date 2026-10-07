import test from 'node:test';
import assert from 'node:assert/strict';
import { solanaLedgerRetentionArguments } from '../src/chains/solana-runtime.mjs';
import { captureAssemblyEvmReceipt } from '../src/private-assembly-evm-audit.mjs';

test('bounded optional retention preserves omission and rejects unknown or unbounded settings', () => {
  assert.deepEqual(solanaLedgerRetentionArguments(), []);
  assert.deepEqual(solanaLedgerRetentionArguments({ ledgerRetentionShreds: 100_000 }), ['--limit-ledger-size', '100000']);
  assert.deepEqual(solanaLedgerRetentionArguments({ ledgerRetentionShreds: 1_000_000, ticksPerSlot: 64 }), ['--limit-ledger-size', '1000000']);
  assert.deepEqual(solanaLedgerRetentionArguments({ ticksPerSlot: 16 }), []);
  for (const ticksPerSlot of [undefined, null, 0, 32, 65, '64', Infinity]) assert.throws(() => solanaLedgerRetentionArguments({ ticksPerSlot }), /SOLANA_INVALID_SLOT_TIMING/);
  assert.deepEqual(solanaLedgerRetentionArguments({ ledgerRetentionShreds: 10_000 }), ['--limit-ledger-size', '10000']);
  for (const n of [undefined, null, 0, 9999, 1000001, Infinity, '100000', 10000.5]) assert.throws(() => solanaLedgerRetentionArguments({ ledgerRetentionShreds: n }), /SOLANA_INVALID_LEDGER_RETENTION/);
  for (const o of [null, [], Object.create(null), { endpoint: 'http://example.com' }]) assert.throws(() => solanaLedgerRetentionArguments(o), /SOLANA_INVALID_RETENTION_OPTIONS/);
});

function fixture() {
  const txHash = '0x' + '01'.repeat(32), blockHash = '0x' + '02'.repeat(32);
  const request = { from: '0x' + '03'.repeat(20), to: '0x' + '04'.repeat(20), data: '0xabcd', value: '0x10' };
  const receipt = { transactionHash: txHash, blockHash, blockNumber: '0x2', status: '0x1' };
  const transaction = { hash: txHash, blockHash, blockNumber: '0x2', from: request.from, to: request.to, input: request.data, value: request.value };
  const header = { hash: blockHash, number: '0x2', timestamp: '0x123', transactions: [txHash] };
  const calls = [], values = { eth_getTransactionByHash: transaction, eth_getTransactionReceipt: receipt, eth_getBlockByHash: header };
  return { entry: { label: 'fixture', request, receipt }, values, calls, runtime: { evm: async (method, args) => { calls.push({method,args}); return structuredClone(values[method]); } } };
}

test('private EVM archive rereads exact calldata, receipt and containing header', async () => {
  const f = fixture(), result = await captureAssemblyEvmReceipt(f.runtime, f.entry);
  assert.equal(result.kind, 'PRIVATE_EVM_TRANSACTION_RECEIPT_HEADER');
  assert.equal(result.transaction.input, f.entry.request.data);
  assert.equal(result.header.timestamp, '0x123');
  assert.equal(f.calls.length, 3);
  assert.ok(f.calls.every(c => c.method.startsWith('eth_get')));
});

for (const [label, mutate, code] of [
  ['calldata', f => f.values.eth_getTransactionByHash.input = '0xffff', /CALLDATA/],
  ['sender', f => f.values.eth_getTransactionByHash.from = '0x' + '05'.repeat(20), /SENDER/],
  ['value', f => f.values.eth_getTransactionByHash.value = '0x11', /VALUE/],
  ['receipt', f => f.values.eth_getTransactionReceipt = { ...f.entry.receipt, status: '0x0' }, /RECEIPT/],
  ['block', f => f.values.eth_getBlockByHash.hash = '0x' + '06'.repeat(32), /HEADER/],
  ['membership', f => f.values.eth_getBlockByHash.transactions = [], /MEMBERSHIP/],
]) test('private EVM archive rejects mismatched ' + label, async () => {
  const f = fixture(); mutate(f); await assert.rejects(captureAssemblyEvmReceipt(f.runtime, f.entry), code);
});

test('bounded ledger profile selects only the fixed source-derived option, without changing history arguments', () => {
  assert.deepEqual(solanaLedgerRetentionArguments({ ledgerRetentionShreds: 1000000, ticksPerSlot: 64, resourceProfile: 'PC23_BOUNDED_LEDGER_V1' }), ['--limit-ledger-size', '1000000']);
  for (const resourceProfile of [undefined,null,'','legacy','PC23_BOUNDED_LEDGER_V2',{},'../../binary']) assert.throws(() => solanaLedgerRetentionArguments({resourceProfile}), /SOLANA_INVALID_RESOURCE_PROFILE/);
  assert.throws(() => solanaLedgerRetentionArguments({resourceProfile:'PC23_BOUNDED_LEDGER_V1',binary:'/tmp/untrusted'}), /SOLANA_INVALID_RETENTION_OPTIONS/);
});
