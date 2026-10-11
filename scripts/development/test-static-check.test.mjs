import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import ts from 'typescript';
import { inspectBindings, inspectModules } from './static-check.mjs';
import { inspectOperationPorts } from './operation-ports.mjs';

function fixture(t, files) {
  const root = mkdtempSync(join(tmpdir(), 'lianum-static-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const [name, contents] of Object.entries(files)) {
    mkdirSync(resolve(root, name, '..'), { recursive: true });
    writeFileSync(join(root, name), contents);
  }
  return root;
}

test('unknown named imports and malformed source fail without executing modules', t => {
  const root = fixture(t, {
    'source.mjs': 'throw Error("MUST_NOT_EXECUTE"); export const present=1;',
    'consumer.mjs': 'import {absent} from "./source.mjs";',
    'bad.mjs': 'export const broken = ;',
  });
  const result = inspectModules(['consumer.mjs', 'bad.mjs'], root);
  assert.ok(result.failures.some(line => line.includes('does not export absent')));
  assert.ok(result.failures.some(line => line.startsWith('bad.mjs:')));
});

test('runtime exports take precedence over separate declarations and star cycles terminate', t => {
  const root = fixture(t, {
    'source.mjs': 'export const runtime=1; export * from "./alias.mjs";',
    'source.d.mts': 'export declare const obsolete: number;',
    'alias.mjs': 'export * from "./source.mjs";',
    'consumer.mjs': 'import {runtime} from "./alias.mjs";',
  });
  assert.deepEqual(inspectModules(['consumer.mjs'], root).failures, []);
});

test('historical exceptions are exact, explicit and rejected when obsolete', t => {
  const root = fixture(t, { 'legacy.mjs': 'import {x} from "./missing.mjs";' });
  const exceptions = [{ source: 'legacy.mjs', specifier: './missing.mjs', reason: 'Missing archived original' }];
  const accepted = inspectModules(['legacy.mjs'], root, exceptions);
  assert.deepEqual(accepted.failures, []);
  assert.equal(accepted.compatibilityExceptions.length, 1);
  writeFileSync(join(root, 'legacy.mjs'), 'import {x} from "./different.mjs";');
  assert.equal(inspectModules(['legacy.mjs'], root, exceptions).failures.length, 2);
  writeFileSync(join(root, 'missing.mjs'), 'export const x=1;');
  writeFileSync(join(root, 'legacy.mjs'), 'import {x} from "./missing.mjs";');
  assert.match(inspectModules(['legacy.mjs'], root, exceptions).failures[0], /obsolete/);
});

test('strict checkJs rejects a wrong public API argument before runtime', t => {
  const root = fixture(t, {
    'api.mjs': '/** @param {string} path */ export function source(path){return path.toUpperCase();}',
    'consumer.mjs': '// @ts-check\nimport {source} from "./api.mjs"; source(123);',
  });
  const program = ts.createProgram([join(root, 'consumer.mjs')], {
    allowJs: true, checkJs: true, strict: true, noEmit: true, types: [],
    target: ts.ScriptTarget.ES2024, module: ts.ModuleKind.NodeNext,
  });
  assert.ok(ts.getPreEmitDiagnostics(program).some(diagnostic => diagnostic.code === 2345));
});

test('authority extraction cannot leave an unbound account in a withdrawal closure', t => {
  const root = fixture(t, {
    'withdraw.mjs': 'export function createWithdrawals({accountRef}) { return () => account; }',
  });
  assert.match(inspectBindings(['withdraw.mjs'], root)[0], /Cannot find name 'account'/);
  writeFileSync(join(root, 'withdraw.mjs'),
    'export function createWithdrawals({accountRef}) { return () => accountRef(); }');
  assert.deepEqual(inspectBindings(['withdraw.mjs'], root), []);
});

test('operation ports reject whole-account access, surplus fields and spreads before execution', t => {
  const config = { composition: 'root.mjs', factories: [{ file: 'operation.mjs', name: 'createOperation' }] };
  const helper = 'throw Error("MUST_NOT_EXECUTE"); export function createOperation({journal}) { return () => journal.rows(); }';
  const root = fixture(t, { 'operation.mjs': helper,
    'root.mjs': 'createOperation({journal:Object.freeze({rows:readRows})});' });
  assert.deepEqual(inspectOperationPorts(config, root), []);
  for (const [source, pattern] of [
    ['createOperation({journal:{rows:readRows},spare:{}});', /unused or unknown field spare/],
    ['createOperation({journal:{rows:readRows,password}});', /forbidden general capability password/],
    ['createOperation({journal:{rows:readRows,unused}});', /unused or unknown field unused/],
    ['createOperation({journal:{}});', /missing field rows/],
    ['createOperation({journal:allAccountState});', /requires an explicit object literal/],
    ['createOperation({...context,journal:{rows:readRows}});', /without spreads or accessors/],
  ]) {
    writeFileSync(join(root, 'root.mjs'), source);
    assert.ok(inspectOperationPorts(config, root).some(message => pattern.test(message)), source);
  }
  writeFileSync(join(root, 'operation.mjs'), 'export function createOperation({record}) { return record.data; }');
  assert.ok(inspectOperationPorts(config, root).some(message => /forbidden general capability record/.test(message)));
});

test('operation ports prohibit dynamic/whole-port forwarding while respecting local shadowed names', t => {
  const config = { composition: 'root.mjs', factories: [{ file: 'operation.mjs', name: 'createOperation' }] };
  const root = fixture(t, { 'root.mjs': 'createOperation({journal:{rows:readRows}});',
    'operation.mjs': 'export function createOperation({journal}) { const local = journal => journal.ignored(); return journal.rows(); }' });
  assert.deepEqual(inspectOperationPorts(config, root), []);
  for (const expression of ['forward(journal)', 'journal[key]', '({journal})']) {
    writeFileSync(join(root, 'operation.mjs'), `export function createOperation({journal}) { return ${expression}; }`);
    assert.ok(inspectOperationPorts(config, root).some(message => /whole-port forwarding or dynamic access/.test(message)));
  }
});
