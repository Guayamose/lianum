/** Read original public evidence only: no proving, signing or native startup. */
import { existsSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const project = join(root, '.internal/runtime');
const canonical = '/workspace/scratch/770c47ebf757/lianum-recovery-20261005-0655';
const report = { schema: 'LIANUM_RESTORED_PUBLIC_READERS_V1', node: process.version, checks: [],
  compilerExecuted: false, proofGenerated: false, chainNodeStarted: false, runtimeActivated: false };
const checks = [
  ['retained-ci51-preparation', 'drafts/wrapped-ci-retained-preparation-20261006/reader.mjs', 'loadReviewedRetainedCI51Preparation'],
  ['retained-ci51-program', 'drafts/wrapped-ci-recovered-consumer-20261006/reader.mjs', 'loadReviewedRetainedCI51'],
  ['retained-co42-program', 'drafts/wrapped-co-recovered-consumer-20261006/reader.mjs', 'loadReviewedRetainedCO42'],
];
for (const [name, relative, method] of checks) {
  try {
    const module = await import(pathToFileURL(join(project, relative)));
    const data = await module[method]();
    report.checks.push({ name, status: 'PASS', format: data.format ?? data.classification,
      scope: 'Original public data/lineage validation, without production proof authority' });
    process.stdout.write(`${name}: PASS\n`);
  } catch (error) {
    report.checks.push({ name, status: 'FAIL', code: error.code ?? error.name,
      message: String(error.message).slice(0, 1500) });
    process.stdout.write(`${name}: FAIL (${String(error.message).slice(0, 220)})\n`);
    process.exitCode = 1;
  }
}
const reader = join(canonical, 'drafts/native-value-verifier-preparation/read-native-value-artifacts.mjs');
if (!existsSync(reader)) {
  report.checks.push({ name: 'i84-original-reader', status: 'BLOCKED', reason: 'Literal canonical root is not materialized' });
  process.stdout.write('i84-original-reader: BLOCKED (literal canonical root pending)\n');
} else {
  try {
    const { loadNativeValueArtifacts } = await import(pathToFileURL(reader));
    const data = await loadNativeValueArtifacts();
    report.checks.push({ name: 'i84-original-reader', status: 'PASS', classification: data.classification,
      proofProfiles: Object.keys(data.proofs), scope: 'Read original artifacts; no new cryptographic/native acceptance' });
    process.stdout.write('i84-original-reader: PASS\n');
  } catch (error) {
    report.checks.push({ name: 'i84-original-reader', status: 'FAIL', code: error.code ?? error.name,
      message: String(error.message).slice(0, 1500) });
    process.stdout.write(`i84-original-reader: FAIL (${String(error.message).slice(0, 220)})\n`);
    process.exitCode = 1;
  }
}
writeFileSync(join(root, '.internal/dev/reports/restored-readers.json'), JSON.stringify(report, null, 2) + '\n');
