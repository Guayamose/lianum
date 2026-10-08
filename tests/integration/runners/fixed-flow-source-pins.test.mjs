/** Read-only source capture regression. Starts no backend, chain, compiler or proof. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { evmVaultSourcePins } from './source-pins.mjs';
import { privateMetaMorphoSourcePins } from '../defi/private-metamorpho-source-pins.mjs';
import { developmentDefiEntrySourcePins } from '../defi/entry/development-defi-entry-source-pins.mjs';
import { osakaSmokeSourcePins } from '../evm/osaka/development-osaka-smoke-source-pins.mjs';

for (const [name, capture] of Object.entries({ evmVaultSourcePins, privateMetaMorphoSourcePins,
  developmentDefiEntrySourcePins, osakaSmokeSourcePins })) {
  test(`${name} captures the fixed mobile protocol dependency of the original supervisor`, () => {
    const pins = capture();
    const row = pins.local.find(value => value.path === '../mobile-protocol/src/original-account-private-state-v1.mjs');
    assert.ok(row, 'MOBILE_PRIVATE_STATE_SOURCE_MUST_BE_CAPTURED');
    assert.match(row.sha256, /^[0-9a-f]{64}$/);
    assert.ok(row.bytes > 0);
    assert.equal(new Set(pins.local.map(value => value.path)).size, pins.local.length);
    if (name === 'evmVaultSourcePins') {
      for (const entry of ['run-evm-vault-flow.mjs', 'run-evm-uniswap-flow.mjs'])
        assert.ok(pins.local.some(value => value.path === 'flat-wallet/integration/' + entry), 'BOTH_ORIGINAL_DEFI_ENTRIES_MUST_BE_CAPTURED');
    }
    assert.throws(() => capture({ root: '/tmp' }), /NO_OPTIONS/);
  });
}
