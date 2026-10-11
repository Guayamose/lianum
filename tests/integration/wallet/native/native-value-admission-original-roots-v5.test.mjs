/** Resolve through the exact private bytes() source with an in-memory FS.
 * No restored artifact, reader, runtime or financial capability is loaded. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import vm from 'node:vm';
import { ROOT } from '@lianum/proofs/catalog';
const source = readFileSync(join(ROOT, 'wallet-platform/modules/ops/native-value-deployment-artifacts-v2.mjs'), 'utf8');
const declarations = ['ADMISSION_PREPARED_ROOT', 'ADMISSION_COMPILE_ROOT'].map(name => {
  const actual = new RegExp('^const ' + name + ' = [^;]+;', 'm').exec(source);
  assert.ok(actual, 'ACTUAL_PRIVATE_ROOT_DECLARATION_REQUIRED'); return actual[0];
}).join('\n');
const begin = source.indexOf('function bytes(path, maximum = ');
const end = source.indexOf('\nfunction pinned(', begin);
assert.ok(begin >= 0 && end > begin, 'ACTUAL_PRIVATE_RAW_RESOLVER_REQUIRED');
function resolver() {
  const paths = [], fsCalls = [], content = Buffer.from('HOST_PATH_RESOLUTION_ONLY');
  const context = vm.createContext({ assert, join, resolve, ROOT, FLAT: dirname(ROOT),
    GOLDEN: '/host-only/golden', CANDIDATE: '/host-only/candidate',
    NATIVE_VALUE_DEV_DEVELOPMENT_FILE_ROOTS_V5: [], NATIVE_VALUE_DEV_WORKSPACE_MODULE_ROOTS_V5: [],
    lstatSync: path => { fsCalls.push(path); return { isSymbolicLink: () => false, isFile: () => true, size: content.length }; },
    realpathSync: path => path, readFileSync: path => { paths.push(path); return content; },
  });
  const read = new vm.Script(declarations + '\n' + source.slice(begin, end) + '\nbytes;').runInContext(context);
  return { read, paths, fsCalls };
}
test('actual private reader and compiled artifact namespaces use the original isolated installation', () => {
  const row = resolver();
  row.read('admission-prepared/read-native-value-artifacts.mjs');
  row.read('admission-compile/public/compiled-manifest.json');
  assert.deepEqual(row.paths, [
    '/workspace/scratch/770c47ebf757/lianum-recovery-20261005-0655/drafts/native-value-verifier-preparation/read-native-value-artifacts.mjs',
    '/workspace/scratch/770c47ebf757/lianum-recovery-20261005-0655/drafts/generic-native-admission-compile/public/compiled-manifest.json',
  ]);
  assert.ok(row.fsCalls.length > 0);
});
test('actual private resolver rejects caller absolute paths and traversal before filesystem access', () => {
  const row = resolver();
  for (const path of ['/caller/restored/read.mjs', '../restored/read.mjs', 'admission-prepared/../caller.mjs'])
    assert.throws(() => row.read(path), /NATIVE_VALUE_ARTIFACT_PATH/);
  assert.deepEqual(row.paths, []); assert.deepEqual(row.fsCalls, []);
});
