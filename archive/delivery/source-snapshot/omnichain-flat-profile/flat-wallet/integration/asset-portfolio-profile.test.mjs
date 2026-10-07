import test from 'node:test';
import assert from 'node:assert/strict';
import { validateAssetPortfolioResult, validateNativeResult, runAssetPortfolioSupervisor } from './native-flow-supervisor.mjs';

test('EVM-only profile validates only its actually started runtime cleanup', () => {
  const result = { format: 'FLAT_WALLET_ASSET_PORTFOLIO_RESULT_V1', phase: 'completed', success: true,
    localOnly: true, fakeFundsOnly: true, publicNetwork: false,
    supervisor: { supervisorPID: 1, workerPID: 2 }, cleanup: { closedEvm: true, closedBitcoin: null, closedSolana: null } };
  assert.deepEqual(validateAssetPortfolioResult(result, 1, 2).cleanup, { closedEvm: true });
  assert.throws(() => validateAssetPortfolioResult({ ...result, cleanup: { closedEvm: false } }, 1, 2), /RUNTIME_CLEANUP/);
  assert.throws(() => validateNativeResult({ ...result, format: 'FLAT_WALLET_NATIVE_FLOW_RESULT_V1' }, 1, 2), /RUNTIME_CLEANUP/);
});
test('fixed entry accepts no command or runtime-profile override', async () => {
  await assert.rejects(runAssetPortfolioSupervisor({ worker: '/tmp/other.mjs' }), /NO_SUPERVISOR_OPTIONS/);
});
