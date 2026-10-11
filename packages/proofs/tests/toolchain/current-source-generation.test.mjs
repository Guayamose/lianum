import test, {mock} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,rmSync,symlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';

const root = mkdtempSync(join(tmpdir(), 'lianum-source-adoption-'));
mock.module('@lianum/environment', {namedExports: {projectRoot: root}});
const {assertAdoptedSourceGeneration,hasAdoptedSourceGeneration} =
  await import('../../src/toolchain/current-source-generation.mjs');
const sha = value => createHash('sha256').update(value).digest('hex');
const write = (path, value) => {
  const absolute = join(root, path);
  mkdirSync(join(absolute, '..'), {recursive: true});
  writeFileSync(absolute, value);
};

test('adopted current sources reject changed hosts, forged metadata and aliases', t => {
  t.after(() => rmSync(root, {recursive: true, force: true}));
  assert.equal(hasAdoptedSourceGeneration(), false);
  const source = Buffer.from('export const active = true;\n');
  write('packages/host.mjs', source);
  const contract = {sourceClosureSHA256: 'ab'.repeat(32), files: [{path: 'packages/host.mjs',
    source: 'packages/host.mjs', sourceSHA256: sha(source), sha256: sha(source), bytes: source.length}]};
  const identity = JSON.stringify({schema: 'LIANUM_DEVELOPMENT_SOURCE_GENERATION_V1', currentSourceContract: contract});
  const generation = sha(identity), base = '.local/generations/' + generation;
  const candidate = JSON.stringify({schema: 'LIANUM_DEVELOPMENT_RELEASE_CANDIDATE_V7', sourceGeneration: generation,
    currentSourceClosureSHA256: contract.sourceClosureSHA256,
    artifactInspection: {status: 'VERIFIED_RETAINED_ARTIFACTS'}, pagedReuseReceipt: {manifestSHA256: 'cd'.repeat(32)}});
  write(base + '/sources.json', identity);
  write(base + '/candidate-release.json', candidate);
  const record = JSON.stringify({schema: 'LIANUM_ADOPTED_SOURCE_GENERATION_V1', generation, candidateSHA256: sha(candidate)});
  write('scripts/development/adopted-generation.json', record);
  assert.equal(hasAdoptedSourceGeneration(), true);
  const accepted = assertAdoptedSourceGeneration();
  assert.equal(accepted.generation, generation);
  assert.deepEqual(accepted.sourceFiles, [{source: 'packages/host.mjs', sourceSHA256: sha(source)}]);
  assert.ok(Object.isFrozen(accepted.sourceFiles));
  assert.ok(Object.isFrozen(accepted.sourceFiles[0]));
  assert.throws(() => assertAdoptedSourceGeneration({generation}), /AssertionError/);
  write('packages/host.mjs', 'export const active = false;\n');
  assert.throws(assertAdoptedSourceGeneration, /CURRENT_SOURCE_PIN/);
  write('packages/host.mjs', source);
  write(base + '/candidate-release.json', candidate.replace('VERIFIED_RETAINED_ARTIFACTS', 'UNVERIFIED'));
  assert.throws(assertAdoptedSourceGeneration, /CURRENT_SOURCE_PIN/);
  write(base + '/candidate-release.json', candidate);
  rmSync(join(root, 'packages/host.mjs'));
  write('packages/copy.mjs', source);
  symlinkSync('copy.mjs', join(root, 'packages/host.mjs'));
  assert.throws(assertAdoptedSourceGeneration, /CURRENT_SOURCE_ALIAS/);
  rmSync(join(root, 'packages/host.mjs'));
  write('packages/host.mjs', source);
  assert.equal(assertAdoptedSourceGeneration().pagedManifestSHA256, 'cd'.repeat(32));
  assert.equal(readFileSync(join(root, base + '/sources.json'), 'utf8'), identity);
});
