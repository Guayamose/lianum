/** Fixed, synthetic U/S/F host-to-circuit conformance. Receives no user inputs,
 * creates no proof/key/native transfer and writes only public case outcomes. */
import assert from 'node:assert/strict';
import { readFileSync, realpathSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT, LOCAL, LIMITS, relation } from '../../../packages/proofs/src/catalog.mjs';
import { assertID, regular, hash, replaceJSON, loadPinned, resourceModuleURL,
  circuitIdentity, versionDirectory, loadCompiled, compiledPins } from '../../../packages/proofs/src/tooling/tooling.mjs';
import { validateJobAgainstABI } from '../../../packages/proofs/src/jobs/trusted-jobs.mjs';
import { encodeStatement, FIELD_MODULUS } from '../../../packages/backend/src/execution/encoding/statements.mjs';
import { integrationSourcePins } from './source-pins.mjs';

export async function runConstraintWorker({ suite, relationNames, buildCases }) {
assert.ok(['envelope', 'native', 'completion', 'evm-deposit', 'native-claim'].includes(suite), 'ENVELOPE_FIXED_SUITE');
assert.ok(Array.isArray(relationNames) && relationNames.length <= 8, 'ENVELOPE_RELATION_SET');
assert.equal(new Set(relationNames).size, relationNames.length, 'ENVELOPE_UNIQUE_RELATIONS');
const script = join(ROOT, 'integration/' + suite + '-constraints-worker.mjs');
assert.equal(process.argv.length, 3, 'ENVELOPE_FIXED_WORKER_ARGS');
assert.equal(realpathSync(process.argv[1]), script, 'ENVELOPE_FIXED_WORKER');
assert.deepEqual(process.execArgv, [], 'ENVELOPE_NO_EXEC_OPTIONS');
assert.deepEqual(Object.keys(process.env).sort(), ['LANG', 'PATH'], 'ENVELOPE_CLEAN_ENV');
assert.equal(process.env.PATH, '/usr/bin:/bin'); assert.equal(process.env.LANG, 'C.UTF-8');
const runId = assertID(process.argv[2]);
const attempt = join(LOCAL, suite + '-constraints', runId);
assert.equal(realpathSync(`/proc/${process.ppid}/exe`), realpathSync(process.execPath), 'ENVELOPE_PARENT_EXE');
const parentArgs = readFileSync(`/proc/${process.ppid}/cmdline`, 'utf8').split('\0').filter(Boolean);
assert.equal(parentArgs.length, 2, 'ENVELOPE_PARENT_ARGS');
assert.equal(realpathSync(resolve(realpathSync(`/proc/${process.ppid}/cwd`), parentArgs[1])),
  join(ROOT, 'integration/run-' + suite + '-constraints.mjs'), 'ENVELOPE_PARENT_SCRIPT');
const lock = JSON.parse(regular(join(LOCAL, suite + '-constraints.lock')));
assert.equal(lock.pid, process.ppid); assert.equal(lock.runId, runId);
const supervisor = JSON.parse(regular(join(attempt, 'resources.json')));
assert.deepEqual(integrationSourcePins(suite), supervisor.sourcePins, 'ENVELOPE_INITIAL_SOURCE_PINS');
for (const name of ['log', 'info', 'warn', 'error', 'debug', 'trace']) console[name] = () => {};
globalThis.fetch = async () => { throw Error('ENVELOPE_OFFLINE_REQUIRED'); };
let backend, fixture;
const result = { format: 'FLAT_INTEGRATION_CONSTRAINT_RESULT_V1', suite, runId,
  classification: 'SYNTHETIC_SCOPED_RELATION_CONSTRAINT_CONFORMANCE', phase: 'initializing',
  startedAt: new Date().toISOString(), proofGenerated: false, nativeFinalityEstablished: false,
  genuineOwnerSignatures: false, syntheticRoots: true, cases: [], compiled: {},
  backend: { version: '5.2.0', type: 'Wasm', threads: 1, skipSrsInit: true },
  sourcePins: supervisor.sourcePins };
const save = () => replaceJSON(join(attempt, 'result.json'), result);
const phase = value => { result.phase = value; save(); };
const began = performance.now();
try {
  save();
  const helpers = await import(resourceModuleURL);
  const toolchain = helpers.verifyToolchain();
  const bb = await loadPinned('@aztec/bb.js'), { Noir } = await loadPinned('@noir-lang/noir_js');
  backend = await bb.Barretenberg.new({ backend: bb.BackendType.Wasm, threads: 1,
    skipSrsInit: true, memory: { initial: 37, maximum: 32768 } });
  const hashFields = async fields => {
    const inputs = fields.map(value => {
      assert.ok(typeof value === 'bigint' && value >= 0n && value < FIELD_MODULUS, 'ENVELOPE_HASH_FIELD_RANGE');
      return Buffer.from(value.toString(16).padStart(64, '0'), 'hex');
    });
    return Buffer.from((await backend.poseidon2Hash({ inputs })).hash).toString('hex');
  };
  const contexts = {};
  for (const name of relationNames) {
    const spec = relation(name), identity = circuitIdentity(spec, toolchain);
    const sourceVersion = hash(JSON.stringify(identity));
    const context = { spec, identity, sourceVersion, toolchain, directory: versionDirectory(spec, sourceVersion) };
    const compiled = await loadCompiled(context);
    contexts[name] = { context, compiled, noir: new Noir(compiled.program) };
    result.compiled[name] = { ...compiledPins(compiled), sourceVersion };
  }
  async function executeCase(name, relationName, inputs, expected, publicInputs) {
    phase('executing-' + name);
    const { compiled, noir } = contexts[relationName];
    // Exact ABI/public agreement precedes ACVM. Expected negative mutations are
    // valid ABI values so only a genuine constraint failure can satisfy them.
    const job = validateJobAgainstABI(compiled.program.abi, inputs, publicInputs, relationName);
    const started = performance.now(); let accepted = false, failureLayer = null;
    try { const output = await noir.execute(job.inputs); output.witness.fill(0); accepted = true; }
    catch (error) {
      if (/Cannot satisfy constraint|Unsatisfied constraint|Assertion failed|assertion failed|Failed to solve blackbox|BlackBoxFunctionFailed/i.test(String(error.message)))
        failureLayer = 'constraint';
      else throw Error('ENVELOPE_ACVM_OPERATIONAL_FAILURE');
    }
    result.cases.push({ name, relation: relationName, accepted, expected, failureLayer,
      milliseconds: performance.now() - started }); save();
    assert.equal(accepted, expected, 'ENVELOPE_UNEXPECTED_CONSTRAINT_RESULT');
    if (!expected) assert.equal(failureLayer, 'constraint', 'ENVELOPE_WRONG_FAILURE_LAYER');
  }
  phase('building-synthetic-cases');
  fixture = await buildCases({ hashFields,
    abis: Object.fromEntries(Object.entries(contexts).map(([name, value]) => [name, value.compiled.program.abi])) });
  assert.ok(Array.isArray(fixture.cases) && fixture.cases.length > 0 && fixture.cases.length <= 40,
    'ENVELOPE_BOUNDED_CASE_SET');
  assert.equal(new Set(fixture.cases.map(item => item.name)).size, fixture.cases.length, 'ENVELOPE_UNIQUE_CASE_NAMES');
  for (const item of fixture.cases) {
    assert.ok(/^[a-z][a-z0-9-]{0,70}$/.exec(item.name)?.[0] === item.name, 'ENVELOPE_CASE_NAME');
    assert.ok(Object.hasOwn(contexts, item.relation), 'ENVELOPE_CASE_RELATION');
    assert.equal(typeof item.expected, 'boolean', 'ENVELOPE_CASE_EXPECTATION');
    if (item.expected)
      assert.deepEqual(encodeStatement(item.relation, item.statement), item.publicInputs, 'ENVELOPE_PUBLIC_STATEMENT_CODEC');
    await executeCase(item.name, item.relation, item.inputs, item.expected, item.publicInputs);
  }
  for (const name of relationNames)
    assert.ok(result.cases.some(item => item.relation === name && item.expected && item.accepted),
      'ENVELOPE_GENUINE_CASE_REQUIRED');
  result.genuineOwnerSignatures = relationNames.includes('authorization') || relationNames.includes('deposit_intent');
  for (const { context } of Object.values(contexts))
    assert.deepEqual(circuitIdentity(context.spec, helpers.verifyToolchain()), context.identity,
      'ENVELOPE_CIRCUIT_CHANGED');
  assert.deepEqual(integrationSourcePins(suite), result.sourcePins, 'ENVELOPE_FINAL_SOURCE_PINS');
  phase('completed');
} catch (error) {
  result.phase = 'failed';
  result.errorCode = String(error.message).match(/\b(?:ENVELOPE|PW|PROOF_JOB|COMMITMENT)_[A-Z0-9_]+\b/)?.[0]
    ?? 'ENVELOPE_CONFORMANCE_FAILED';
  process.exitCode = 1;
} finally {
  fixture?.destroy?.(); fixture = undefined;
  if (backend) {
    try { await backend.destroy(); result.backendDestroyed = true; }
    catch { result.phase = 'failed'; result.cleanupError = 'ENVELOPE_BACKEND_CLEANUP_FAILED'; process.exitCode = 1; }
  }
  result.completedAt = new Date().toISOString(); result.milliseconds = performance.now() - began;
  result.resourceUsage = process.resourceUsage(); save();
}

}
