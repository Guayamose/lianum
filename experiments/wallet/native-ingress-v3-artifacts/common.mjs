/** Inactive public-artifact namespace. No active catalog or native authority. */
import assert from 'node:assert/strict';
import { existsSync, readdirSync, realpathSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve, relative, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { ROOT, FLAT, GOLDEN, LOCAL, CATALOG, LIMITS, SETTINGS, MEMORY, pagesFor } from '../../../packages/proofs/src/catalog.mjs';
import { regular, resourceModuleURL, assertABI, assertStats } from '../../../packages/proofs/src/tooling/tooling.mjs';
import { fingerprint as validationFingerprint } from '../native-ingress-v3-validation/common.mjs';
import { GENERIC_COMPILER_PIN } from '../../../packages/engine/src/execution/local/local-deployment.mjs';
export { ROOT, LOCAL, CATALOG, LIMITS, SETTINGS, MEMORY, pagesFor };
export const DIR = fileURLToPath(new URL('./', import.meta.url));
export const VALIDATION = resolve(DIR, '../native-ingress-v3-validation');
export const hash = bytes => createHash('sha256').update(bytes).digest('hex');
export const json = value => JSON.stringify(value, null, 2) + '\n';
export const parse = path => JSON.parse(regular(path));
export function otherLocks() {
  return [LOCAL, join(VALIDATION, '.local')].flatMap(dir => existsSync(dir)
    ? readdirSync(dir).filter(name => name.endsWith('.lock')).map(name => join(dir, name)) : []);
}
function assertOutput(path) {
  assert.ok(resolve(path).startsWith(join(DIR, '.local') + sep), 'V3A_OUTPUT_LOCATION');
  assert.equal(realpathSync(dirname(path)), dirname(path), 'V3A_OUTPUT_SYMLINK');
}
export function writeNew(path, value) {
  assertOutput(path);
  writeFileSync(path, typeof value === 'string' || value instanceof Uint8Array ? value : json(value), { flag: 'wx', mode: 0o600 });
}
export function replace(path, value) {
  assertOutput(path); if (existsSync(path)) regular(path);
  const temp = path + '.tmp'; writeFileSync(temp, json(value), { flag: 'wx', mode: 0o600 }); renameSync(temp, path);
}
export function acceptedProgram() {
  const checkpointBytes = regular(join(VALIDATION, 'acceptance.json'));
  assert.equal(hash(checkpointBytes), '4becaf943b9694066754749da3b35c863d8e8cd0fe977b7749619a299a9a12ec', 'V3A_ACCEPTANCE_CHECKPOINT');
  const checkpoint = JSON.parse(checkpointBytes);
  assert.deepEqual(checkpoint.counts, { total: 40, positiveAccepted: 7, negativeConstraintRejected: 33, allExpected: true });
  const dir = join(VALIDATION, '.local', checkpoint.compileRunId);
  const bytes = regular(join(dir, 'program.json')), manifestBytes = regular(join(dir, 'compiled-manifest.json'));
  assert.equal(hash(bytes), checkpoint.compiled.programSHA256);
  assert.equal(hash(manifestBytes), checkpoint.compiled.manifestSHA256);
  const program = JSON.parse(bytes), manifest = JSON.parse(manifestBytes); assertABI(CATALOG.native_claim_ingress, program);
  assert.equal(hash(Buffer.from(program.bytecode, 'base64')), checkpoint.compiled.bytecodeSHA256);
  assert.equal(hash(JSON.stringify(program.abi)), checkpoint.compiled.abiSHA256);
  assert.equal(parse(join(dir, 'resources.json')).phase, 'completed');
  const constraints = parse(join(VALIDATION, '.local', checkpoint.constraintRunId, 'result.json'));
  assert.equal(constraints.phase, 'completed'); assert.equal(constraints.backendDestroyed, true);
  return { checkpoint, program, manifest };
}
export async function fingerprint() {
  const validated = await validationFingerprint(), { checkpoint } = acceptedProgram();
  const helpers = await import(resourceModuleURL); const crs = helpers.verifyCRS();
  const files = new Map();
  function visit(path) {
    path = resolve(path); if (files.has(path)) return;
    assert.ok([ROOT, FLAT, GOLDEN].some(root => path.startsWith(root + sep)), 'V3A_RUNTIME_PATH');
    const bytes = regular(path); files.set(path, { path: relative(ROOT, path).split(sep).join('/'), bytes: bytes.length, sha256: hash(bytes) });
    for (const match of bytes.toString('utf8').matchAll(/(?:\bfrom\s+|^\s*import\s+)(['"])([^'"]+)\1/gm)) {
      if (match[2].startsWith('node:')) continue;
      assert.ok(match[2].startsWith('.'), 'V3A_LOCAL_RUNTIME_IMPORT'); visit(resolve(dirname(path), match[2]));
    }
  }
  for (const name of ['common.mjs','run.mjs','worker.mjs']) visit(join(DIR, name));
  visit(fileURLToPath(resourceModuleURL));
  const solcRoot = join(GOLDEN, 'tools/solidity-js');
  assert.equal(hash(regular(join(solcRoot, 'package-lock.json'))), GENERIC_COMPILER_PIN.lockSHA256, 'V3A_SOLC_LOCK');
  assert.equal(hash(regular(join(solcRoot, 'node_modules/solc/soljson.js'))), GENERIC_COMPILER_PIN.soljsonSHA256, 'V3A_SOLC_MODULE');
  for (const key of checkpoint.baselineVerificationKeysPreserved) {
    const base = join(LOCAL,'relations',key.relation,key.sourceVersion,'prepared');
    const found = readdirSync(base).map(id => join(base,id,'key.vk')).filter(existsSync);
    assert.equal(found.length,1);assert.equal(hash(regular(found[0])),key.keySHA256,'V3A_BASELINE_KEY_CHANGED');
  }
  return { format: 'LIANUM_V3_PUBLIC_ARTIFACT_PINS_V1', validated,
    acceptedCheckpointSHA256: hash(regular(join(VALIDATION,'acceptance.json'))), compiled: checkpoint.compiled,
    launchCheckpointSHA256: existsSync(join(DIR,'launch-checkpoint.json')) ? hash(regular(join(DIR,'launch-checkpoint.json'))) : null,
    runtime: [...files.values()].sort((a,b)=>a.path.localeCompare(b.path)), crs, solc: GENERIC_COMPILER_PIN };
}
export function loadPhase(runId, mode) {
  assert.match(runId,/^[a-f0-9-]{36}$/); const dir=join(DIR,'.local',runId);
  const result=parse(join(dir,'result.json')),resources=parse(join(dir,'resources.json'));
  assert.equal(result.mode,mode);assert.equal(result.phase,'completed');assert.equal(resources.phase,'completed');
  assert.equal(resources.exitCode,0);assert.deepEqual(resources.failures,[]);
  const { checkpoint }=acceptedProgram();
  assert.equal(result.profile,'LIANUM_GENERIC_NATIVE_CLAIM_INGRESS_V3');
  assert.equal(result.relation,'native_claim_ingress_v3');
  assert.deepEqual(result.compiled,checkpoint.compiled,'V3A_PHASE_PROGRAM_LINEAGE');
  assert.equal(result.sourceClosureSHA256,checkpoint.sourceClosureSHA256,'V3A_PHASE_SOURCE_LINEAGE');
  for(const file of result.publicArtifacts??[]) {
    assert.match(file.name,/^[A-Za-z0-9_.-]+$/);const bytes=regular(join(dir,file.name));
    assert.equal(hash(bytes),file.sha256);assert.equal(bytes.length,file.bytes);
  }
  return {dir,result,resources};
}
export function memoryFor(stats, mode) {
  assertStats(stats);
  return pagesFor(stats.numGatesDyadic===2097152 ? mode+'-dyadic21' : mode,stats);
}
