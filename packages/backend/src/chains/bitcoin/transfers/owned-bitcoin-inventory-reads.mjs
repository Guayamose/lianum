/** Bounded read scheduling inside one original Bitcoin inventory window.
 * No observation/result cache and no ownership or signing capability is minted.
 * Every outpoint gets a distinct fresh gettxout call; failures drain started
 * calls before the caller may release its exclusive native-read window. */
import assert from 'node:assert/strict';
import { types } from 'node:util';

export const BITCOIN_INVENTORY_READ_CONCURRENCY = 4;
export async function readBitcoinInventoryOutputs(coins, rpc) {
  assert.ok(Array.isArray(coins) && !types.isProxy(coins), 'BITCOIN_INVENTORY_READ_COINS');
  assert.equal(typeof rpc, 'function', 'BITCOIN_INVENTORY_READ_RPC');
  const requests = Array.from({ length: coins.length }, (_, position) => {
    const descriptor = Object.getOwnPropertyDescriptor(coins, String(position));
    assert.ok(descriptor && Object.hasOwn(descriptor, 'value'), 'BITCOIN_INVENTORY_READ_COIN');
    const coin = descriptor.value;
    assert.ok(coin && typeof coin === 'object' && !types.isProxy(coin), 'BITCOIN_INVENTORY_READ_COIN');
    const txid = Object.getOwnPropertyDescriptor(coin, 'txid')?.value;
    const vout = Object.getOwnPropertyDescriptor(coin, 'vout')?.value;
    assert.ok(typeof txid === 'string' && /^[0-9a-f]{64}$/.test(txid), 'BITCOIN_INVENTORY_READ_TXID');
    assert.ok(Number.isSafeInteger(vout) && !Object.is(vout, -0) && vout >= 0 && vout <= 0xffffffff,
      'BITCOIN_INVENTORY_READ_VOUT');
    return Object.freeze([txid, vout, true]);
  });
  const outputs = new Array(requests.length);
  let next = 0, failed = false, firstError;
  async function worker() {
    while (!failed && next < requests.length) {
      const position = next++;
      try { outputs[position] = await rpc('gettxout', requests[position]); }
      catch (error) { if (!failed) firstError = error; failed = true; }
    }
  }
  await Promise.all(Array.from({ length: Math.min(BITCOIN_INVENTORY_READ_CONCURRENCY, requests.length) }, worker));
  if (failed) throw firstError;
  return outputs;
}
