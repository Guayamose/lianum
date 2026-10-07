import test from 'node:test';
import assert from 'node:assert/strict';
import { solanaSendFailure, sendOwnedSolanaTransaction } from '../../../../src/chains/solana/transfers/owned-solana-send.mjs';

test('owned SOL send errors retain categories without RPC payload or native identifiers', () => {
  const source = { code: -32002, message: 'private wire', data: { err: 'BlockhashNotFound', logs: ['private log'] } };
  assert.deepEqual(solanaSendFailure(source), { category: 'SOLANA_RPC_BLOCKHASH_NOT_FOUND', rpcCode: -32002 });
  assert.deepEqual(solanaSendFailure({ code: -32002, data: { err: { InstructionError: [1, 'PrivateValue'] } } }),
    { category: 'SOLANA_RPC_INSTRUCTION_ERROR', rpcCode: -32002 });
  assert.equal(solanaSendFailure({ code: -32002 }).category, 'SOLANA_RPC_SIMULATION_FAILED');
});

test('fixed send preserves preflight, one attempt, loopback and exact signed wire', async t => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async (endpoint, options) => {
    calls++; assert.equal(endpoint, 'http://127.0.0.1:12345');
    assert.equal(options.redirect, 'error');
    assert.deepEqual(JSON.parse(options.body), { jsonrpc: '2.0', id: 1, method: 'sendTransaction',
      params: ['original-wire', { encoding: 'base64', skipPreflight: false, preflightCommitment: 'confirmed', maxRetries: 0 }] });
    return { ok: true, json: async () => ({ error: { code: -32002, data: { err: 'BlockhashNotFound' } } }) };
  });
  await assert.rejects(sendOwnedSolanaTransaction('https://example.com', 'original-wire'));
  assert.equal(calls, 0);
  await assert.rejects(sendOwnedSolanaTransaction('http://127.0.0.1:12345', 'original-wire'),
    error => error.message === 'SOLANA_RPC_BLOCKHASH_NOT_FOUND' && error.rpcCode === -32002);
  assert.equal(calls, 1);
});
