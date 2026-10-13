import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { join } from 'node:path';

// Execute the exact private DATA formatter. No runtime capability, original
// ledger, native process or economic state is fabricated by this HOST test.
const source = await readFile(new URL('../../../../src/chains/solana/runtime/owned-solana-runtime.mjs', import.meta.url), 'utf8');
const start = source.indexOf('function solanaCaptureFailureDiagnosticV1(');
const end = source.indexOf('\nconst ownedSolanaRuntimes', start);
assert.ok(start >= 0 && end > start);
const diagnostic = runInNewContext(source.slice(start, end) + '\nsolanaCaptureFailureDiagnosticV1');
const state = { nativeExitTimeoutObserved: true, nativeChildCloseObserved: true, nativeExitZero: true, nativeSignalPresent: false };
const cleanup = { ownedProcessStopped: true, forced: false, nativeOrderlyExit: false, nativeStopFailure: 'SOLANA_RECOVERY_NATIVE_EXIT_TIMEOUT' };
const copy = value => JSON.parse(JSON.stringify(value));

test('STOP diagnostics retain exact native failure and booleans without changing acceptance', () => {
  const error = new Error('SOLANA_RECOVERY_REQUIRES_ORDERLY_NATIVE_TERMINAL');
  const before = copy(cleanup);
  assert.deepEqual(copy(diagnostic('STOP', error, cleanup, state)), {
    stage: 'STOP', code: error.message, ...before,
    nativeExitTimeoutObserved: true, nativeChildCloseObserved: true,
    nativeExitZero: true, nativeSignalPresent: false,
  });
  assert.deepEqual(cleanup, before);
  assert.equal(error.message, 'SOLANA_RECOVERY_REQUIRES_ORDERLY_NATIVE_TERMINAL');
});

test('SEAL logs only allowlisted code and never exception text, custom fields or getters', () => {
  const error = new Error('SECRET_NATIVE_STDERR_AND_PATH');
  Object.defineProperty(error, 'code', { get() { throw Error('GETTER_MUST_NOT_EXECUTE'); } });
  error.privateKey = 'SECRET_PRIVATE_KEY';
  const row = diagnostic('SEAL', error, { ...cleanup, nativeStopFailure: 'SECRET_DIAGNOSTIC' }, state);
  assert.equal(row.code, 'UNCLASSIFIED');
  assert.equal(row.nativeStopFailure, null);
  assert.ok(!JSON.stringify(row).includes('SECRET'));
  assert.equal(diagnostic('SEAL', new Error('NATIVE_RECOVERY_FILE_CHANGED'), cleanup, state).code, 'NATIVE_RECOVERY_FILE_CHANGED');
  assert.equal(diagnostic(null, error, cleanup, state), null);
  assert.equal(diagnostic('PREPARE', error, cleanup, state), null);
});

test('Node AssertionError first line retains a fixed code while details stay private', () => {
  let error;
  try { assert.equal(1, 2, 'NATIVE_RECOVERY_FILE_CHANGED'); } catch (failure) { error = failure; }
  assert.ok(error instanceof Error);
  assert.equal(diagnostic('SEAL', error, cleanup, state).code, 'NATIVE_RECOVERY_FILE_CHANGED');
  assert.ok(!JSON.stringify(diagnostic('SEAL', error, cleanup, state)).includes('!=='));
  assert.equal(diagnostic('SEAL', new Error('NATIVE_RECOVERY_FILE_CHANGED SECRET'), cleanup, state).code, 'UNCLASSIFIED');
});

test('only original Paged child receives the fixed official exit grace with isolated environment', () => {
  const declaration = source.match(/^const envFor = .+;$/m)?.[0];
  const scopedGrace = source.match(/^  if \(originalPagedGraph\) env\.SOLANA_VALIDATOR_EXIT_TIMEOUT = '30';$/m)?.[0];
  assert.ok(declaration && scopedGrace);
  // Run the exact private environment constructor and exact conditional used
  // before spawn; the parent environment is deliberately hostile HOST data.
  const prepare = runInNewContext(declaration + '\n(cwd, originalPagedGraph) => { const env = envFor(cwd);\n' + scopedGrace + '\nreturn env; }',
    { join, process: { env: { SOLANA_VALIDATOR_EXIT_TIMEOUT: '999', RPC_SECRET: 'HOST_SECRET' } } });
  const normal = copy(prepare('/HOST_OWN_SOLANA', false));
  const paged = copy(prepare('/HOST_OWN_SOLANA', true));
  assert.equal(paged.SOLANA_VALIDATOR_EXIT_TIMEOUT, '30');
  assert.ok(!Object.hasOwn(normal, 'SOLANA_VALIDATOR_EXIT_TIMEOUT'));
  delete paged.SOLANA_VALIDATOR_EXIT_TIMEOUT;
  assert.deepEqual(paged, normal);
  assert.ok(!JSON.stringify(normal).includes('HOST_SECRET'));
  assert.equal(normal.HOME, '/HOST_OWN_SOLANA');
  assert.equal(normal.XDG_CONFIG_HOME, '/HOST_OWN_SOLANA/config');
});
