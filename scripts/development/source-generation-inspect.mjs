/** Read-only bridge to the original source walker and artifact inspector.
 * No compiler, financial execution, publication, hooks or caller paths. */
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { realpathSync } from 'node:fs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const runtime = new URL('../../.internal/runtime/omnichain-flat-profile/flat-wallet/', import.meta.url);
assert.equal(process.argv.length, 2);
assert.equal(realpathSync(process.cwd()), realpathSync(root));
const safeCode = error => {
  const values = String(error?.message ?? '').match(/\b[A-Z][A-Z0-9_]{7,120}\b/g);
  return values?.[0] ?? 'ORIGINAL_INSPECTOR_REJECTED';
};
const output = { status: 'BLOCKED', code: null, sourceFiles: null, compilationInputs: null,
  candidate: null, published: false, compiled: false, financialAcceptance: false };
try {
  const walker = await import(new URL('wallet-platform/modules/ops/native-value-dev-financial-source-pins-v5.mjs', runtime));
  output.sourceFiles = walker.nativeValueDevFinancialSourcePinsV5();
  const producer = await import(new URL('wallet-platform/modules/ops/native-value-dev-producer-v6.mjs', runtime));
  output.candidate = await producer.prepareNativeValueDevReleaseV6Candidate();
  output.status = 'VALIDATED_CANDIDATE';
} catch (error) {
  output.code = safeCode(error);
}
process.stdout.write(JSON.stringify(output) + '\n');
