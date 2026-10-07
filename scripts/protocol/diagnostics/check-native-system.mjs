/** Compile only the fixed, literal-pinned generic native contracts/verifiers.
 * This process is invoked by the external resource watchdog. No runtime or
 * signer is created, and no proof acceptance is inferred from compilation.
 */
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { nativeSystemSources, compileNativeSystem } from '../../../packages/protocol/src/execution/native/dispatch/native-deployment.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const runId = new Date().toISOString().replace(/[:.]/g, '-');
const directory = join(root, '.local/development/native-system', runId);
mkdirSync(directory, { recursive: true });
const sha = value => createHash('sha256').update(value).digest('hex');
const modulePath = join(root, 'src/paeg/native-deployment.mjs');
const moduleSHA256 = sha(readFileSync(modulePath));
const report = { classification: 'ACTUAL_PINNED_NATIVE_SYSTEM_COMPILATION_NOT_PROOF',
  startedAt: new Date().toISOString(), phase: 'source-pins', moduleSHA256,
  deployed: false, proofGenerated: false, nativeExecution: false, compiled: [] };
const save = () => writeFileSync(join(directory, 'report.json'), JSON.stringify(report, null, 2) + '\n');
save();
globalThis.fetch = async () => { throw Error('NATIVE_SYSTEM_COMPILE_OFFLINE_REQUIRED'); };
try {
  const sources = await nativeSystemSources();
  report.phase = 'compiling'; save();
  const compilation = await compileNativeSystem(sources, async record => {
    report.compiled.push(record); save();
    console.log(JSON.stringify({ phase: 'compiled-source', mode: record.mode }));
  });
  if (sha(readFileSync(modulePath)) !== moduleSHA256) throw Error('NATIVE_DEPLOYMENT_SOURCE_CHANGED');
  const bytes = JSON.stringify(compilation, null, 2) + '\n';
  writeFileSync(join(directory, 'compilation.json'), bytes);
  report.compilationSHA256 = sha(bytes);
  report.phase = 'completed';
} catch (error) {
  report.phase = 'failed';
  report.error = { name: error.name, message: error.message, compilerErrors: error.compilerErrors };
  process.exitCode = 1;
} finally {
  report.completedAt = new Date().toISOString(); save();
  console.log(JSON.stringify({ phase: report.phase, report: join(directory, 'report.json'), error: report.error }));
}
