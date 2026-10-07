/** Compile or execute candidate constraints. Never generates a key or proof. */
import assert from 'node:assert/strict';
import { readFileSync, realpathSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { DIR, ROOT, CANDIDATE, CIRCUIT, CATALOG, LIMITS, SETTINGS, NOIR_VERSION,
  hash, json, parse, writeNew, replace, fingerprint, verifyPinnedCO42 } from './common.mjs';
import { regular, loadPinned, assertABI } from '../../proof-workers/tooling.mjs';
import { validateJobAgainstABI } from '../../proof-workers/trusted-jobs.mjs';
import { FIELD_MODULUS } from '../../wallet-platform/modules/paeg/statements.mjs';
import { buildSyntheticGenericIngressV3Fixture } from '../native-ingress-v3/fixtures/synthetic-ingress-v3.mjs';

for (const name of ['log','info','warn','error','debug','trace']) console[name] = () => {};
globalThis.fetch = async () => { throw Error('V3_OFFLINE_REQUIRED'); };
assert.equal(process.argv.length, 5, 'V3_WORKER_ARGS');
assert.deepEqual(process.execArgv, [], 'V3_NO_EXEC_OPTIONS');
assert.deepEqual(Object.keys(process.env).sort(), ['LANG','PATH'], 'V3_CLEAN_ENV');
assert.equal(process.env.PATH, '/usr/bin:/bin'); assert.equal(process.env.LANG, 'C.UTF-8');
assert.equal(realpathSync(process.argv[1]), join(DIR, 'worker.mjs'), 'V3_FIXED_WORKER');
const [mode, runId, compileRunId] = process.argv.slice(2);
assert.ok(['compile','constraints'].includes(mode), 'V3_MODE');
assert.match(runId, /^[a-f0-9-]{36}$/); assert.match(compileRunId, /^(?:none|[a-f0-9-]{36})$/);
const attempt = join(DIR, '.local', runId), lock = parse(join(DIR, '.local/active.lock'));
assert.equal(lock.pid, process.ppid); assert.equal(lock.runId, runId); assert.equal(lock.mode, mode);
const parentArgs = readFileSync(`/proc/${process.ppid}/cmdline`, 'utf8').split('\0').filter(Boolean);
assert.equal(parentArgs.length, 2); assert.equal(realpathSync(parentArgs[1]), join(DIR, 'run.mjs'));
assert.equal(realpathSync(`/proc/${process.ppid}/exe`), realpathSync(process.execPath));
assert.equal(realpathSync(process.cwd()), ROOT); assert.equal(typeof process.send, 'function');
const pins = parse(join(attempt, 'pins.json'));
const report = { format: 'LIANUM_GENERIC_INGRESS_V3_VALIDATION_V1', profile: 'LIANUM_GENERIC_NATIVE_CLAIM_INGRESS_V3',
  mode, runId, phase: 'starting', sourceClosureSHA256: pins.source.sourceClosureSHA256,
  sourceManifestSHA256: hash(regular(join(CANDIDATE, 'source-manifest.json'))),
  pinsSHA256: hash(regular(join(attempt, 'pins.json'))), limits: LIMITS, settings: SETTINGS,
  baselinePreserved: false, actualConstraintExecution: false, keyGenerated: false,
  proofGenerated: false, nativeFinalityEstablished: false, activated: false, cases: [] };
const save = () => replace(join(attempt, 'result.json'), report);
const phase = value => { report.phase = value; save(); };
const parentDisconnected = () => {
  if (report.phase !== 'completed') { report.phase = 'failed'; report.failure = 'V3_PARENT_DISCONNECTED'; try { save(); } finally { process.exit(1); } }
};
process.once('disconnect', parentDisconnected);
let backend, fixture;
const compilerLogs = [];
let compilerLogBytes = 0;
try {
  save(); assert.deepEqual(await fingerprint(), pins, 'V3_INITIAL_PINS_CHANGED');
  if (mode === 'compile') {
    assert.equal(compileRunId, 'none'); phase('compiling-candidate');
    const compiler = await loadPinned('@noir-lang/noir_wasm');
    const { program } = await compiler.compile(compiler.createFileManager(CIRCUIT), undefined, (...values) => {
      const line = values.map(String).join(' ');
      compilerLogBytes += Buffer.byteLength(line);
      assert.ok(compilerLogBytes <= 65536, 'V3_COMPILER_DIAGNOSTIC_LIMIT');
      compilerLogs.push(line);
    });
    assertABI(CATALOG.native_claim_ingress, program);
    assert.equal(program.noir_version, NOIR_VERSION);
    const compressed = Buffer.from(program.bytecode, 'base64');
    assert.equal(compressed.toString('base64'), program.bytecode);
    assert.ok(compressed[0] === 31 && compressed[1] === 139);
    const bytecode = gunzipSync(compressed); assert.ok(bytecode.length > 0); bytecode.fill(0);
    const bytes = json(program);
    const manifest = { format: 'LIANUM_GENERIC_INGRESS_V3_COMPILED_V1', relation: 'native_claim_ingress_v3',
      profile: report.profile, runId, source: pins.source, toolchain: pins.toolchain,
      api: pins.api, vendor: pins.vendor, noirVersion: NOIR_VERSION, bbVersion: '5.2.0', settings: SETTINGS,
      publicWords: 51, publicABI: program.abi.parameters.filter(p => p.visibility === 'public'),
      privateNames: program.abi.parameters.filter(p => p.visibility !== 'public').map(p => p.name),
      programSHA256: hash(bytes), bytecodeSHA256: hash(compressed), abiSHA256: hash(JSON.stringify(program.abi)),
      keyGenerated: false, proofGenerated: false, activated: false };
    writeNew(join(attempt, 'program.json'), bytes); writeNew(join(attempt, 'compiled-manifest.json'), manifest);
    report.compiled = { manifestSHA256: hash(json(manifest)), programSHA256: manifest.programSHA256,
      bytecodeSHA256: manifest.bytecodeSHA256, abiSHA256: manifest.abiSHA256, publicWords: 51,
      noirVersion: program.noir_version, sourceClosureSHA256: pins.source.sourceClosureSHA256 };
  } else {
    const compiledAt = join(DIR, '.local', compileRunId);
    const compileResult = parse(join(compiledAt, 'result.json'));
    const compileResources = parse(join(compiledAt, 'resources.json'));
    assert.equal(compileResult.phase, 'completed'); assert.equal(compileResources.phase, 'completed');
    const manifestBytes = regular(join(compiledAt, 'compiled-manifest.json'));
    assert.equal(hash(manifestBytes), compileResult.compiled.manifestSHA256);
    const manifest = JSON.parse(manifestBytes), bytes = regular(join(compiledAt, 'program.json'));
    assert.equal(hash(bytes), manifest.programSHA256); assert.deepEqual(manifest.source, pins.source);
    const program = JSON.parse(bytes); assertABI(CATALOG.native_claim_ingress, program);
    const baseline = verifyPinnedCO42(); assertABI(CATALOG.native_claim_discharge, baseline.program);
    report.compiled = { ...compileResult.compiled, compileRunId };
    report.baselineCO42 = { programSHA256: baseline.programSHA256, manifestSHA256: baseline.manifestSHA256,
      sourceVersion: baseline.sourceVersion };
    phase('initializing-official-poseidon');
    const bb = await loadPinned('@aztec/bb.js'), { Noir } = await loadPinned('@noir-lang/noir_js');
    backend = await bb.Barretenberg.new({ backend: bb.BackendType.Wasm, threads: 1, skipSrsInit: true,
      memory: { initial: 37, maximum: 32768 } });
    report.backend = { version: '5.2.0', type: 'Wasm', threads: 1, skipSrsInit: true, maximumPages: 32768 };
    const hashFields = async fields => {
      const inputs = fields.map(value => {
        assert.ok(typeof value === 'bigint' && value >= 0n && value < FIELD_MODULUS);
        return Buffer.from(value.toString(16).padStart(64, '0'), 'hex');
      });
      return Buffer.from((await backend.poseidon2Hash({ inputs })).hash).toString('hex');
    };
    phase('building-official-poseidon-fixtures');
    fixture = await buildSyntheticGenericIngressV3Fixture({ hashFields,
      abis: { native_claim_ingress_v3: program.abi, native_claim_discharge: baseline.program.abi } });
    assert.equal(fixture.cases.length, 40); assert.equal(fixture.cases.filter(c => c.expected).length, 7);
    const runners = { native_claim_ingress_v3: new Noir(program), native_claim_discharge: new Noir(baseline.program) };
    for (const item of fixture.cases) {
      phase('executing-' + item.name);
      const abiRole = item.relation === 'native_claim_ingress_v3' ? 'native_claim_ingress' : 'native_claim_discharge';
      const abi = item.relation === 'native_claim_ingress_v3' ? program.abi : baseline.program.abi;
      const job = validateJobAgainstABI(abi, item.inputs, item.publicInputs, abiRole);
      let accepted = false, failureLayer = null;
      try {
        const output = await runners[item.relation].execute(job.inputs); output.witness.fill(0); accepted = true;
      } catch (error) {
        if (/Cannot satisfy constraint|Unsatisfied constraint|Assertion failed|assertion failed|Failed to solve blackbox|BlackBoxFunctionFailed/i.test(String(error.message)))
          failureLayer = 'constraint';
        else throw Error('V3_ACVM_OPERATIONAL_FAILURE:' + item.name + ':' + String(error.name));
      }
      job.inputs = undefined;
      report.cases.push({ name: item.name, relation: item.relation, accepted, expected: item.expected, failureLayer }); save();
      assert.equal(accepted, item.expected, 'V3_UNEXPECTED_CONSTRAINT_RESULT:' + item.name);
      if (!item.expected) assert.equal(failureLayer, 'constraint');
    }
    report.actualConstraintExecution = true;
    report.officialPoseidon2 = true;
    report.constraintCounts = { total: 40, positive: 7, negative: 33, allExpected: true };
  }
  assert.deepEqual(await fingerprint(), pins, 'V3_FINAL_PINS_CHANGED');
  report.baselinePreserved = true;
  phase('completed');
} catch (error) {
  report.phase = 'failed';
  // Only source/compiler diagnostics are retained; no structured witness/error
  // payload or private assignment is logged. ACVM messages above are sanitized.
  report.failure = String(error.message).slice(0, 2000); report.errorName = String(error.name);
  if (mode === 'compile') {
    report.compileDiagnostics = Array.isArray(error.diagnostics) ? error.diagnostics : null;
    report.compilerLogs = compilerLogs;
  }
  process.exitCode = 1;
} finally {
  fixture?.destroy?.(); fixture = undefined;
  if (backend) {
    try { await backend.destroy(); report.backendDestroyed = true; }
    catch { report.phase = 'failed'; report.cleanupFailure = 'V3_BACKEND_DESTROY_FAILED'; process.exitCode = 1; }
  }
  save();
  process.removeListener('disconnect', parentDisconnected);
  if (process.connected) process.disconnect();
}
