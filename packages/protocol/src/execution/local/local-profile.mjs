/** Pinned sources for the bounded local funded-graph acceptance.
 * Historical deposit/exit artifacts are reused byte-for-byte. New recursive
 * wrappers are bound through the proof process's full source/key provenance.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { filePin } from '../../../../../experiments/protocol/private-core-proof/wallet-notes/resources.mjs';
import { GENERIC_POOL_SOURCE_SHA256 } from './local-deployment.mjs';

const root = new URL('../../', import.meta.url);
const paths = Object.freeze({
  deposit_balance: 'experiments/private-core-proof/wallet-notes/.local/prepared/deposit_balance.sol',
  withdraw_balance: 'experiments/private-core-proof/wallet-notes/.local/prepared/withdraw_balance.sol',
  withdraw: 'evidence/m23-wallet-capability/2026-10-03T07-20-22-656Z/verifiers/withdraw.sol',
  reserve_generic: '.local/development/generic-wrappers/reserve/prepared/reserve.sol',
  recover_generic: '.local/development/generic-wrappers/refund/prepared/refund.sol',
  pool: 'contracts/PrivateGenericAssetNotePool.sol',
});
const historical = Object.freeze({
  deposit_balance: '47ab7388f52b695fc33b8d71a3fbc0f022b8d50f8007967aa0e4b335ab71ea93',
  withdraw_balance: 'd1d06f9b3689f6d531b19775131cc91700772ffa0bcc5e72b083b9f7393b1824',
  withdraw: '1691a2958f1c0dfacfdc4ec721ad59635808389902750402d7ecfae94684b4b1',
});

export function genericVerifierSources(pins) {
  for (const mode of ['deposit_balance', 'withdraw_balance']) {
    assert.equal(pins[mode].soliditySHA256, historical[mode], 'GENERIC_HISTORICAL_VERIFIER');
  }
  const expected = { ...historical, reserve_generic: pins.reserve.soliditySHA256,
    recover_generic: pins.refund.soliditySHA256, pool: GENERIC_POOL_SOURCE_SHA256 };
  return Object.fromEntries(Object.entries(paths).map(([mode, path]) => {
    assert.match(expected[mode], /^[0-9a-f]{64}$/, 'GENERIC_VERIFIER_PIN');
    const url = new URL(path, root);
    filePin(url, { sha256: expected[mode] });
    return [mode, { content: readFileSync(url, 'utf8'), sha256: expected[mode] }];
  }));
}
