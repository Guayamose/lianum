/** Actual EVM controls only. Mock verifiers provide NO proof-security evidence. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import { join } from 'node:path';
import { CLASSIFICATION, runPrivateFinalityControls } from '../scripts/integration-private-finality-controls.mjs';
import { projectRoot } from '../src/chains/runtime-harness.mjs';
import { linuxRuntimePins } from '../src/chains/linux-runtime-pins.mjs';

let unavailable = process.platform !== 'linux' || process.arch !== 'x64' ? 'requires the reviewed Linux x64 local binaries' : null;
if (!unavailable) {
  try { for (const pin of [linuxRuntimePins.anvil, linuxRuntimePins.solc]) await access(join(projectRoot, '.local/linux-runtimes', pin[0])); }
  catch (error) { if (error.code !== 'ENOENT') throw error; unavailable = 'official pinned local Anvil/solc unavailable; no EVM control coverage claimed'; }
}
// Missing runtimes skip explicitly; a present-but-wrong binary hash FAILS.
test(`${CLASSIFICATION}: unmodified current-native-finality pool`, { skip: unavailable ?? false, timeout: 180000 }, async t => {
  const result = await runPrivateFinalityControls({ runCase: (name, fn) => t.test(name, fn) });
  assert.equal(result.status, 'PASSED');
  assert.ok(result.passedCases >= 20);
  assert.equal(result.cases.every(item => item.passed), true);
  assert.ok(result.receipts.some(item => item.revert?.reason === 'FINALITY_NOT_CURRENT'));
  assert.ok(result.receipts.some(item => item.nestedCallTrace));
});
