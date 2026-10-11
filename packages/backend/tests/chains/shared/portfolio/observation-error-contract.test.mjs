import test from 'node:test';
import assert from 'node:assert/strict';
import {ObservationError, need} from '../../../../src/chains/shared/observations/observation-errors.mjs';
import {ObservationError as RegistryError, need as registryNeed, normalizePortfolioRequest}
  from '../../../../src/chains/shared/portfolio/portfolio-registry.mjs';
import {solanaPublicKey, bitcoinWatchAddress} from '../../../../src/chains/shared/observations/observation-addresses.mjs';

test('address codecs and registry preserve one observation error contract', () => {
  assert.equal(RegistryError, ObservationError);
  assert.equal(registryNeed, need);
  for (const [run, code] of [
    [() => solanaPublicKey('invalid'), 'INVALID_SOLANA_ADDRESS'],
    [() => bitcoinWatchAddress('invalid'), 'INVALID_BITCOIN_WATCH_ADDRESS'],
    [() => normalizePortfolioRequest({chain: 'solana', address: 'invalid', query: 'native-balance'}), 'INVALID_SOLANA_ADDRESS'],
    [() => normalizePortfolioRequest({chain: 'bitcoin', address: 'invalid', query: 'native-balance'}), 'INVALID_BITCOIN_WATCH_ADDRESS'],
  ]) {
    assert.throws(run, error => error instanceof RegistryError && error.code === code && error.status === 'unknown');
  }
  assert.throws(() => need(false, 'BLOCK_STALE', 'stale'), error => error instanceof RegistryError
    && error.code === 'BLOCK_STALE' && error.status === 'stale');
});
