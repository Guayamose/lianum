/** Read-only artifact inspection for the explicit current-source candidate.
 * Historical source capsules stay intact; no compiler, financial execution,
 * publication, hooks or caller paths are accepted. */
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { realpathSync } from 'node:fs';
import { inspectRetainedNativeValueReuseForPreparationV6 }
  from '../../packages/backend/src/operations/deployments/native-value/native-value-deployment-artifacts-v2.mjs';
import { inspectNativeValueDevMobileDependenciesV5 }
  from '../../packages/backend/src/operations/releases/native-value/native-value-dev-source-pins-v5.mjs';
import { inspectFundedPagedGraphArtifactsForPreparationV4 }
  from '../../packages/proofs/src/toolchain/paged-artifacts-v3.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
assert.equal(process.argv.length, 2);
assert.equal(realpathSync(process.cwd()), realpathSync(root));
const safeCode = error => {
  const values = String(error?.message ?? '').match(/\b[A-Z][A-Z0-9_]{7,120}\b/g);
  return values?.[0] ?? (error?.code === 'ENOENT' ? 'RETAINED_INSPECTION_FILE_MISSING' : 'RETAINED_INSPECTOR_REJECTED');
};
const output = { status: 'BLOCKED', code: null, nativeValue: null, paged: null,
  published: false, compiled: false, financialAcceptance: false };
try {
  inspectNativeValueDevMobileDependenciesV5();
  output.paged = inspectFundedPagedGraphArtifactsForPreparationV4();
  output.nativeValue = await inspectRetainedNativeValueReuseForPreparationV6();
  inspectNativeValueDevMobileDependenciesV5();
  output.status = 'VERIFIED_RETAINED_ARTIFACTS';
} catch (error) {
  output.code = safeCode(error);
}
process.stdout.write(JSON.stringify(output) + '\n');
