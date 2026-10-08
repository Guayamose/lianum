/** Metadata/terminal-catch regressions only; no native node, key use or proof. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { privateFailureDiagnostic } from '../../../../packages/backend/src/execution/account/reconciliation/failure-diagnostics.mjs';
const source = readFileSync(new URL('./development-native-claim-flow.mjs', import.meta.url), 'utf8');
const begin = source.indexOf('  } catch (error) {\n    result.failedStage');
const end = source.indexOf('\n  } finally {', begin);
assert.ok(begin >= 0 && end > begin);
const body = source.slice(begin + '  } catch (error) {'.length, end);
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const originalCatch = new AsyncFunction('error', 'result', 'code', 'writeFixturePrivate', 'join', 'privateDirectory', 'audit', 'privateFailureDiagnostic', body);
async function exercise(error) {
  const row = { phase: 'redeem-original-btc-solver-payout', cleanup: {} };
  const writes = []; let audits = 0;
  await originalCatch(error, row, value => String(value.message).match(/CLAIM_[A-Z_]+/)?.[0],
    (path, value) => writes.push({ path, value }), join, '/private-audit', async () => { audits++; }, privateFailureDiagnostic);
  assert.equal(writes.length, 1); assert.equal(writes[0].path, '/private-audit/error-private.json');
  assert.equal(audits, 1);
  assert.equal(row.phase, 'failed'); assert.equal(row.success, false);
  assert.equal(row.failedStage, 'redeem-original-btc-solver-payout');
  return { row, saved: writes[0].value };
}
test('global original catch retains nested deadline budget privately without replacing its public error or terminal result', async () => {
  const cause = new Error('CLAIM_OPERATOR_AUDIT_TOO_OLD');
  cause.auditBudget = { phase: 'synchronous-v4-fence', method: 'presign-payout', round: 'pre-key', elapsedMilliseconds: 30001, limitMilliseconds: 30000 };
  const error = new Error('CLAIM_ATTESTATION_UNCERTAIN', { cause });
  error.fixtureCleanup = { closedController: false };
  const { row, saved } = await exercise(error);
  assert.equal(row.errorCode, 'CLAIM_ATTESTATION_UNCERTAIN'); assert.equal(row.cleanup.closedController, false);
  assert.equal(saved.message, error.message); assert.equal(saved.stack, error.stack); assert.equal(saved.cause, cause.stack);
  assert.deepEqual(saved.privateDiagnostic, { code: 'CLAIM_ATTESTATION_UNCERTAIN', causeCode: 'CLAIM_OPERATOR_AUDIT_TOO_OLD',
    causeCodes: ['CLAIM_OPERATOR_AUDIT_TOO_OLD'], auditBudget: cause.auditBudget });
  assert.equal(Object.hasOwn(row, 'privateDiagnostic'), false); assert.equal(Object.hasOwn(row, 'auditBudget'), false);
});
test('unknown RPC content receives only bounded diagnostic labels and does not synthesize an audit budget', async () => {
  const error = new Error('untrusted RPC comparison values', { cause: new Error('sensitive upstream payload') });
  const { saved } = await exercise(error);
  assert.deepEqual(saved.privateDiagnostic, { code: 'NATIVE_CLAIM_OPERATION_FAILED', causeCode: null, causeCodes: [] });
  assert.equal(Object.hasOwn(saved.privateDiagnostic, 'auditBudget'), false);
});
