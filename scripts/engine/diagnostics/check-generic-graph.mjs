/** Compile and execute the bounded graph relation; never creates or accepts a proof. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join, relative } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const packageRoot = join(root, 'experiments/private-core-proof');
const mode = process.argv[2];
const relation = process.argv[3] ?? 'graph-opening';
const profiles = {
  'graph-opening': { directory: 'generic-graph', circuit: 'graph_opening', words: 57,
    hostSources: ['src/paeg/graph.mjs'], libraries: [],
    publicNames: ['scope','policy','operation_id','graph_commitment','expires_at',
      'reserved_commitment','recovery_commitment','tree_root'] },
  'owner-authorization': { directory: 'generic-funding', circuit: 'authorization', words: 139,
    hostSources: ['src/paeg/funded-graph.mjs', 'src/paeg/graph.mjs',
      'src/private-wallet-note-encoding.mjs', 'src/private-note-encoding.mjs',
      'src/private-native-certificate.mjs',
      'experiments/private-core-proof/generic-graph/fixtures.mjs',
      'experiments/private-core-proof/generic-graph/witness.mjs'], libraries: ['generic-graph/lib'],
    publicNames: ['scope','policy','asset','operation_id','input_commitment','input_nullifier',
      'reservation_intent','graph_commitment','tree_root','reserve_commitment','reserve_nullifier',
      'change_commitment','outputs','recovery_commitment','funding_not_before','funding_valid_until','settle_before'] },
  'generic-reserve': { directory: 'generic-wrappers', outputDirectory: 'generic-wrappers/reserve',
    circuit: 'reserve', words: 66, hostSources: ['src/paeg/funded-graph.mjs'], libraries: ['generic-graph/lib'],
    publicNames: ['scope','policy','asset','base_root','input_nullifier','reserve_commitment',
      'change_commitment','admission_tag','valid_from','valid_until'] },
  'generic-refund': { directory: 'generic-wrappers', outputDirectory: 'generic-wrappers/refund',
    circuit: 'refund', words: 51, hostSources: ['src/paeg/funded-graph.mjs'], libraries: ['generic-graph/lib'],
    publicNames: ['scope','policy','asset','accepted_root','reserve_nullifier','recovery_commitment',
      'settle_before','valid_from','valid_until'] },
};
assert.ok(Object.hasOwn(profiles, relation), 'GRAPH_RELATION_PROFILE');
const profile = profiles[relation];
const relationRoot = join(packageRoot, profile.directory);
const output = join(root, '.local/development', profile.outputDirectory ?? profile.directory);
assert.ok(['compile', 'witnesses', 'negative-witnesses', 'remaining-negative-witnesses'].includes(mode), 'GRAPH_CHECK_MODE');
const require = createRequire(join(packageRoot, 'package.json'));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const recordPath = join(output, mode + '-' + new Date().toISOString().replace(/[:.]/g, '-') + '.json');
mkdirSync(output, { recursive: true });

function sources() {
  const files = profile.hostSources.map(path => join(root, path));
  function walk(directory) {
    for (const item of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, item.name);
      if (item.isDirectory() && !item.name.startsWith('.')) walk(path);
      else if (item.isFile() && /\.(nr|toml|mjs)$/.test(item.name) && !item.name.endsWith('.test.mjs')) files.push(path);
    }
  }
  walk(relationRoot);
  for (const library of profile.libraries) walk(join(packageRoot, library));
  return files.sort().map(path => ({ path: relative(root, path), sha256: sha(readFileSync(path)) }));
}
function publicWords(type) {
  if (type.kind === 'array') return type.length * publicWords(type.type);
  if (type.kind === 'struct') return type.fields.reduce((total, field) => total + publicWords(field.type), 0);
  return 1;
}
const report = {
  classification: 'NOIR_RELATION_CONSTRAINT_CHECK_NOT_PROOF_OR_CHAIN_ACCEPTANCE',
  mode,
  relation,
  startedAt: new Date().toISOString(),
  node: process.version,
  source: sources(),
  lockSHA256: sha(readFileSync(join(packageRoot, 'package-lock.json'))),
  records: [],
  nativeExecution: false,
  proofGenerated: false,
};
const save = () => writeFileSync(recordPath, JSON.stringify(report, null, 2) + '\n');
save();
// Circuit dependencies are local and installed from the fixed lockfile.
// No implicit library, toolchain or CRS network request is acceptable here.
globalThis.fetch = async () => { throw new Error('GRAPH_CHECK_NETWORK_FORBIDDEN'); };
try {
  if (mode === 'compile') {
    const compiler = await import(pathToFileURL(require.resolve('@noir-lang/noir_wasm')));
    const result = await compiler.compile(
      compiler.createFileManager(join(relationRoot, 'circuits', profile.circuit)),
      undefined,
      () => {},
    );
    const program = result.program;
    const words = program.abi.parameters.filter(p => p.visibility === 'public')
      .reduce((total, parameter) => total + publicWords(parameter.type), 0);
    assert.equal(words, profile.words, 'GRAPH_RELATION_PUBLIC_WORD_COUNT');
    assert.deepEqual(program.abi.parameters.filter(p => p.visibility === 'public').map(p => p.name),
      profile.publicNames, 'GRAPH_RELATION_PUBLIC_FIELD_ORDER');
    const encoded = JSON.stringify(program);
    writeFileSync(join(output, profile.circuit + '.json'), encoded);
    const manifest = {
      source: report.source,
      programSHA256: sha(encoded),
      bytecodeSHA256: sha(Buffer.from(program.bytecode, 'base64')),
      noirVersion: program.noir_version,
      publicWords: words,
      node: process.version,
    };
    writeFileSync(join(output, 'compiled-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
    report.records.push(manifest);
  } else {
    const manifest = JSON.parse(readFileSync(join(output, 'compiled-manifest.json')));
    const circuitSources = records => records.filter(record => /\.(nr|toml)$/.test(record.path));
    assert.deepEqual(circuitSources(report.source), circuitSources(manifest.source), 'GRAPH_CIRCUIT_CHANGED_SINCE_COMPILE');
    report.compiledSource = manifest.source;
    report.fixtureSourceMayDiffer = true;
    const bytes = readFileSync(join(output, profile.circuit + '.json'));
    assert.equal(sha(bytes), manifest.programSHA256, 'GRAPH_PROGRAM_INTEGRITY');
    const program = JSON.parse(bytes);
    const { Noir } = await import(pathToFileURL(require.resolve('@noir-lang/noir_js')));
    const { positiveFixtures, negativeFixtures } = await import(pathToFileURL(join(relationRoot, 'fixtures.mjs')));
    let cases = [
      ...(mode.endsWith('negative-witnesses') ? [] : positiveFixtures().map(fixture => ({ ...fixture, expectedAcceptance: true }))),
      ...negativeFixtures().map(fixture => ({ ...fixture, expectedAcceptance: false })),
    ];
    report.programSHA256 = manifest.programSHA256;
    if (mode === 'remaining-negative-witnesses') {
      const name = process.argv[4];
      assert.match(name, /^[a-z0-9-]+\.json$/i, 'GRAPH_PRIOR_REPORT_NAME');
      const prior = JSON.parse(readFileSync(join(output, name)));
      assert.equal(prior.relation, relation, 'GRAPH_PRIOR_RELATION');
      assert.deepEqual(circuitSources(prior.source), circuitSources(report.source), 'GRAPH_PRIOR_CIRCUIT');
      const completed = new Set(prior.records.filter(record => record.expectedAcceptance === false
        && record.accepted === false).map(record => record.name));
      cases = cases.filter(fixture => !completed.has(fixture.name));
      report.reusedNegativeCases = [...completed];
      report.previousReport = { file: name, sha256: sha(readFileSync(join(output, name))) };
    }
    for (const fixture of cases) {
      const noir = new Noir(program);
      let accepted = false;
      try {
        await noir.execute(fixture.inputs);
        accepted = true;
      } catch (error) {
        if (fixture.expectedAcceptance) throw error;
        report.lastNegativeError = { name: fixture.name, message: error.message };
        if (fixture.expectedFailureLayer === 'abi') {
          assert.match(error.message, /does not fall within range of allowable values for a Integer/s,
            'GRAPH_NEGATIVE_MUST_FAIL_DECLARED_ABI_RANGE');
        } else {
          assert.match(error.message, /Cannot satisfy constraint|Assertion failed|assertion failed|Failed constraint|unsatisfied constraint/i,
            'GRAPH_NEGATIVE_MUST_FAIL_A_CONSTRAINT');
        }
      }
      assert.equal(accepted, fixture.expectedAcceptance, 'GRAPH_CASE_' + fixture.name);
      report.records.push({ name: fixture.name, expectedAcceptance: fixture.expectedAcceptance, accepted,
        ...(!fixture.expectedAcceptance ? { rejectionLayer: fixture.expectedFailureLayer ?? 'constraint' } : {}) });
      save();
    }
    report.programSHA256 = manifest.programSHA256;
    report.publicWords = manifest.publicWords;
  }
  assert.deepEqual(sources(), report.source, 'GRAPH_SOURCE_CHANGED_DURING_CHECK');
  report.phase = 'completed';
} catch (error) {
  report.phase = 'failed';
  report.error = { name: error.name, message: error.message };
  process.exitCode = 1;
} finally {
  report.completedAt = new Date().toISOString();
  report.processResourceUsage = process.resourceUsage();
  save();
  console.log(JSON.stringify({ report: recordPath, phase: report.phase, error: report.error, records: report.records.length }));
}
