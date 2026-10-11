/** Compile one fixed native relation with its actual local dependency closure.
 * Key packages are separate dependencies: generating a downstream key must not
 * invalidate an upstream source pin merely by creating an unrelated file.
 */
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync, lstatSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join, resolve, relative, sep } from 'node:path';
import { verifyToolchain } from '@lianum/components/resources/wallet-resources';
import { NATIVE_PROFILES } from '../../../experiments/engine/private-core-proof/generic-native/pin-key.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const experiment = join(root, 'experiments/private-core-proof');
const require = createRequire(join(experiment, 'package.json'));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const profiles = Object.fromEntries(Object.entries(NATIVE_PROFILES).map(([name, profile]) =>
  [name, { ...profile, publicNames: profile.parameters.map(parameter => parameter.name) }]));
const mode = process.argv[2], relation = process.argv[3];
assert.ok(['compile', 'witnesses'].includes(mode), 'NATIVE_CHECK_MODE');
assert.ok(Object.hasOwn(profiles, relation), 'NATIVE_CHECK_PROFILE');
assert.ok(mode !== 'witnesses' || relation === 'dependency', 'NATIVE_CHECK_FIXTURE_PROFILE');
const profile = profiles[relation], circuit = join(experiment, 'generic-native/circuits', relation);
const output = join(root, '.local/development/generic-native', relation);
mkdirSync(output, { recursive: true });

function sourceClosure(packageDirectory, visited = new Set()) {
  const directory = resolve(packageDirectory);
  assert.ok(directory.startsWith(resolve(root) + sep), 'NATIVE_DEPENDENCY_OUTSIDE_PROJECT');
  assert.ok(!lstatSync(directory).isSymbolicLink(), 'NATIVE_DEPENDENCY_SYMLINK');
  if (visited.has(directory)) return [];
  visited.add(directory);
  const configPath = join(directory, 'Nargo.toml'), configuration = readFileSync(configPath, 'utf8');
  const files = [configPath];
  const walk = path => {
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      const child = join(path, entry.name);
      assert.ok(!entry.isSymbolicLink(), 'NATIVE_SOURCE_SYMLINK');
      if (entry.isDirectory()) walk(child);
      else if (entry.isFile() && entry.name.endsWith('.nr')) files.push(child);
    }
  };
  walk(join(directory, 'src'));
  let dependencies = false;
  for (const original of configuration.split(/\r?\n/)) {
    const line = original.trim();
    if (!line || line.startsWith('#')) continue;
    if (line.startsWith('[')) { dependencies = line === '[dependencies]'; continue; }
    if (!dependencies) continue;
    const parsed = /^([A-Za-z][A-Za-z0-9_]*)\s*=\s*\{\s*path\s*=\s*"([^"]+)"\s*\}$/.exec(line);
    assert.ok(parsed, 'NATIVE_DEPENDENCY_LOCAL_PATH_REQUIRED');
    files.push(...sourceClosure(resolve(directory, parsed[2]), visited));
  }
  return files;
}
const source = () => [...new Set(sourceClosure(circuit))].sort().map(path => {
  const bytes = readFileSync(path); return { path: relative(root, path), bytes: bytes.length, sha256: sha(bytes) };
});
const wordCount = type => type.kind === 'array' ? type.length * wordCount(type.type)
  : ['field', 'integer', 'boolean'].includes(type.kind) ? 1 : (() => { throw Error('NATIVE_PUBLIC_ABI_TYPE'); })();
const startedAt = new Date().toISOString();
const recordPath = join(output, mode + '-' + startedAt.replace(/[:.]/g, '-') + '.json');
const report = { classification: mode === 'compile' ? 'ACTUAL_GENERIC_NATIVE_COMPILATION_NOT_PROOF'
  : 'ACTUAL_GENERIC_NATIVE_CONSTRAINT_EXECUTION_NOT_PROOF', relation, mode, startedAt,
  phase: mode, source: source(), toolchain: verifyToolchain(), proofGenerated: false, nativeExecution: false, records: [] };
const save = () => writeFileSync(recordPath, JSON.stringify(report, null, 2) + '\n');
save();
globalThis.fetch = async () => { throw Error('NATIVE_CHECK_OFFLINE_REQUIRED'); };
try {
  if (mode === 'witnesses') {
    const manifest = JSON.parse(readFileSync(join(output, 'compiled-manifest.json')));
    assert.deepEqual(manifest.source, report.source, 'NATIVE_CIRCUIT_CHANGED_SINCE_COMPILE');
    const artifact = readFileSync(join(output, relation + '.json'));
    assert.equal(sha(artifact), manifest.programSHA256, 'NATIVE_COMPILED_ARTIFACT_HASH');
    const { Noir } = await import(pathToFileURL(require.resolve('@noir-lang/noir_js')));
    const fixtures = await import('../../../experiments/engine/private-core-proof/generic-native/dependency-fixtures.mjs');
    const fixturePath = join(experiment, 'generic-native/dependency-fixtures.mjs');
    report.fixtureSHA256 = sha(readFileSync(fixturePath));
    report.disclosure = 'Synthetic membership/state constraint fixtures. No admitted native fact or authenticated current chain state is claimed; Ready and the hub still supply those authority boundaries.';
    const noir = new Noir(JSON.parse(artifact));
    const cases = [...fixtures.positiveFixtures().map(value => ({ ...value, shouldPass: true })),
      ...fixtures.negativeFixtures().map(value => ({ ...value, shouldPass: false }))];
    for (const item of cases) {
      const began = performance.now(); let actualPass = false, witnessHash, witnessBytes;
      try {
        const result = await noir.execute(item.inputs);
        actualPass = true; witnessHash = sha(result.witness); witnessBytes = result.witness.length;
        result.witness.fill(0);
      } catch (error) {
        if (item.shouldPass) throw error;
        // Preserve failure layer without copying a private witness into logs.
        assert.match(String(error.message), /assert|constraint|execute circuit|Circuit execution|Cannot satisfy|Unsatisfied/i,
          'NATIVE_NEGATIVE_MUST_FAIL_CONSTRAINT');
      }
      assert.equal(actualPass, item.shouldPass, 'NATIVE_CONSTRAINT_RESULT');
      report.records.push({ name: item.name, expectedPass: item.shouldPass, actualPass,
        inputSHA256: sha(JSON.stringify(item.inputs)), expectedPublicInputsSHA256: sha(JSON.stringify(item.expectedPublicInputs)),
        ...(actualPass ? { witnessSHA256: witnessHash, witnessBytes } : {}), milliseconds: performance.now() - began });
      save();
    }
    assert.equal(sha(readFileSync(fixturePath)), report.fixtureSHA256, 'NATIVE_FIXTURE_CHANGED_DURING_EXECUTION');
    report.phase = 'completed';
  } else {
  const compiler = await import(pathToFileURL(require.resolve('@noir-lang/noir_wasm')));
  const { program } = await compiler.compile(compiler.createFileManager(circuit), undefined, () => {});
  assert.deepEqual(source(), report.source, 'NATIVE_SOURCE_CHANGED_DURING_COMPILE');
  const publicParameters = program.abi.parameters.filter(parameter => parameter.visibility === 'public');
  assert.deepEqual(publicParameters, profile.parameters, 'NATIVE_PUBLIC_ABI_TYPES');
  assert.deepEqual(publicParameters.map(parameter => parameter.name), profile.publicNames, 'NATIVE_PUBLIC_ABI_ORDER');
  assert.equal(publicParameters.reduce((sum, parameter) => sum + wordCount(parameter.type), 0), profile.words, 'NATIVE_PUBLIC_ABI_WORDS');
  const bytes = JSON.stringify(program), target = join(output, relation + '.json');
  if (existsSync(target)) {
    const previous = readFileSync(target), history = join(output, 'compiled-history');
    mkdirSync(history, { recursive: true });
    const saved = join(history, sha(previous) + '.json');
    if (!existsSync(saved)) writeFileSync(saved, previous);
  }
  writeFileSync(target, bytes);
  const manifest = { relation, source: report.source, sourceTreeSHA256: sha(JSON.stringify(report.source)),
    programSHA256: sha(bytes), bytecodeSHA256: sha(Buffer.from(program.bytecode, 'base64')),
    noirVersion: program.noir_version, publicWords: profile.words, publicNames: profile.publicNames, node: process.version };
  writeFileSync(join(output, 'compiled-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  report.artifact = manifest; report.phase = 'completed';
  }
} catch (error) {
  report.phase = 'failed'; report.error = { name: error.name, message: error.message };
  process.exitCode = 1;
} finally {
  report.completedAt = new Date().toISOString(); report.resourceUsage = process.resourceUsage(); save();
}
console.log(JSON.stringify({ phase: report.phase, relation, error: report.error, record: relative(root, recordPath) }));
