import {createSolanaObservationAdapter} from './solana-observation-adapter.mjs';
import {createBitcoinObservationAdapter} from './bitcoin-observation-adapter.mjs';
import {createSolanaHttpObservationTransport,createBitcoinHttpObservationTransport} from './observation-http-transport.mjs';
/** Backend/Node SDK bootstrap for the seven native display adapters.
 * All network selection is fixed before exposing the returned read capability.
 * This is not a signer, private ledger authority, or public-consensus verifier. */
import { types } from 'node:util';
import { fields, need, PORTFOLIO_CHAINS, createPortfolioRegistry } from './portfolio-registry.mjs';
import { createEvmObservationAdapter } from './evm-observation-adapter.mjs';
import { createTronObservationAdapter } from './tron-observation-adapter.mjs';
import { createEvmHttpObservationTransport, createTronHttpObservationTransport } from './observation-http-transport.mjs';

export function createHttpPortfolioRegistry(raw) {
  const { networks, now } = fields(raw, ['networks'], ['now'], true);
  need(Array.isArray(networks) && !types.isProxy(networks) && Object.getPrototypeOf(networks) === Array.prototype
    && networks.length <= 7 && Reflect.ownKeys(networks).length === networks.length + 1, 'INVALID_NETWORK_CONFIG');
  need(now === undefined || typeof now === 'function', 'INVALID_CLOCK');
  const selected = new Set(), configured = [];
  for (let index = 0; index < networks.length; index++) {
    const item = Object.getOwnPropertyDescriptor(networks, String(index));
    need(item && item.enumerable && Object.hasOwn(item, 'value'), 'INVALID_NETWORK_CONFIG');
    const network = fields(item.value, ['chain', 'genesisHash', 'endpoint'], ['freshness', 'timeoutMs', 'maxResponseBytes','watch'], true);
    need(typeof network.chain === 'string' && Object.hasOwn(PORTFOLIO_CHAINS, network.chain)
      && !selected.has(network.chain), 'INVALID_NETWORK_CONFIG');
    selected.add(network.chain);
    const { chain, genesisHash, endpoint, freshness, timeoutMs, maxResponseBytes } = network;
    need(network.watch===undefined||chain==='bitcoin','INVALID_NETWORK_CONFIG');
    const isTron = PORTFOLIO_CHAINS[chain].family === 'tron';
    const transport = (chain==='bitcoin'?createBitcoinHttpObservationTransport:chain==='solana'?createSolanaHttpObservationTransport:isTron ? createTronHttpObservationTransport : createEvmHttpObservationTransport)({
      endpoint, ...(chain==='bitcoin'?{watch:network.watch}:{}), ...(timeoutMs === undefined ? {} : { timeoutMs }),
      ...(maxResponseBytes === undefined ? {} : { maxResponseBytes }),
    });
    configured.push((chain==='bitcoin'?createBitcoinObservationAdapter:chain==='solana'?createSolanaObservationAdapter:isTron ? createTronObservationAdapter : createEvmObservationAdapter)({ chain, genesisHash, transport,...(chain==='bitcoin'?{watch:network.watch}:{}),
      ...(freshness === undefined ? {} : { freshness }), ...(now === undefined ? {} : { now }) }));
  }
  return createPortfolioRegistry({ adapters: configured });
}
