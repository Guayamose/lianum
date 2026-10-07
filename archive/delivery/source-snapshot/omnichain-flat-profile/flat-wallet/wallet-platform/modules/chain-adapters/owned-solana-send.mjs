/** Fixed-method transport for the owned validator. Error details are reduced
 * to protocol categories; native wires, RPC log text and endpoints never enter
 * the retained diagnostic. Every failure remains an uncertain original send. */
import assert from 'node:assert/strict';

export function solanaSendFailure(error) {
  const code = Number.isSafeInteger(error?.code) ? error.code : null;
  const detail = error?.data?.err;
  const category = detail === 'BlockhashNotFound' ? 'SOLANA_RPC_BLOCKHASH_NOT_FOUND'
    : detail === 'AlreadyProcessed' ? 'SOLANA_RPC_ALREADY_PROCESSED'
      : Array.isArray(detail?.InstructionError) ? 'SOLANA_RPC_INSTRUCTION_ERROR'
        : code === -32003 ? 'SOLANA_RPC_SIGNATURE_VERIFICATION_FAILED'
          : code === -32002 ? 'SOLANA_RPC_SIMULATION_FAILED'
            : code === -32005 ? 'SOLANA_RPC_NODE_UNHEALTHY' : 'SOLANA_RPC_REMOTE_ERROR';
  return Object.freeze({ category, rpcCode: code });
}

export async function sendOwnedSolanaTransaction(endpoint, nativeWire) {
  assert.match(endpoint, /^http:\/\/127\.0\.0\.1:[1-9][0-9]{0,4}$/);
  assert.equal(typeof nativeWire, 'string');
  const response = await fetch(endpoint, { method: 'POST', redirect: 'error',
    signal: AbortSignal.timeout(15000), headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'sendTransaction',
      params: [nativeWire, { encoding: 'base64', skipPreflight: false,
        preflightCommitment: 'confirmed', maxRetries: 0 }] }) });
  assert.ok(response.ok, 'SOLANA_RPC_HTTP_ERROR');
  const value = await response.json();
  if (value.error) {
    const diagnostic = solanaSendFailure(value.error);
    const error = new Error(diagnostic.category); error.rpcCode = diagnostic.rpcCode;
    throw error;
  }
  return value.result;
}
