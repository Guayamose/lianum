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

test('operation ports count fixed const destructuring, aliases and actual uses', t => {
  const config = { composition: 'root.mjs', factories: [{ file: 'operation.mjs', name: 'createOperation' }] };
  const root = fixture(t, { 'root.mjs': 'createOperation({journal:{rows:readRows}});',
    'operation.mjs': 'export function createOperation({journal}) { const {rows:read} = journal; return read(); }' });
  assert.deepEqual(inspectOperationPorts(config, root), []);
  for (const source of [
    'const {rows,...rest}=journal; return rows();',
    'const {rows=fallback}=journal; return rows();',
    'const {[field]:rows}=journal; return rows();',
    'let {rows}=journal; return rows();',
    'const {rows,unused}=journal; return rows();',
    'const {rows}=journal; return forward(journal);',
  ]) {
    writeFileSync(join(root, 'operation.mjs'), `export function createOperation({journal}) { ${source} }`);
    assert.ok(inspectOperationPorts(config, root).length > 0, source);
  }
  writeFileSync(join(root, 'operation.mjs'), 'export function createOperation({journal}) { const {rows}=journal; return rows(); }');
  writeFileSync(join(root, 'root.mjs'), 'createOperation({journal:{rows:readRows,unused}});');
  assert.ok(inspectOperationPorts(config, root).some(message => /unused or unknown field unused/.test(message)));
});

test('operation group validation accepts only canonical exactRecord and a fixed typeof assertion', t => {
  const config = { composition: 'root.mjs', factories: [{ file: 'operation.mjs', name: 'createOperation' }] };
  const imports = 'import assert from "node:assert/strict"; import {exactRecord as exact} from "@lianum/components/encoding/commitments";';
  const guards = 'exact(journal,["rows"]); for(const method of Object.values(journal)) assert.equal(typeof method,"function");';
  const source = `${imports} export function createOperation({journal}) { ${guards} const {rows}=journal; return rows(); }`;
  const root = fixture(t, { 'root.mjs': 'createOperation({journal:{rows:readRows}});', 'operation.mjs': source });
  assert.deepEqual(inspectOperationPorts(config, root), []);
  for (const invalid of [
    source.replace('encoding/commitments', 'encoding/fake-commitments'),
    source.replace('node:assert/strict', './fake-assert.mjs'),
    source.replace('["rows"]', '["rows","unused"]'),
    source.replace('["rows"]', 'fieldNames'),
    source.replace('typeof method', 'typeof journal'),
    source.replace('"function"', '"object"'),
    source.replace('assert.equal(typeof method,"function");', '{ assert.equal(typeof method,"function"); forward(method); }'),
    source.replace(guards, 'exact(journal,["rows"]); for(const method of Object.values(journal)) forward(method);'),
    source.replace(guards, 'const Object={values:forward}; '+guards),
    source.replace(guards, 'const exact = () => {}; '+guards),
  ]) {
    writeFileSync(join(root, 'operation.mjs'), invalid);
    assert.ok(inspectOperationPorts(config, root).length > 0, invalid);
  }
});

test('operation loader ports are bound to one literal module and fixed consumed exports', t => {
  const config = { composition: 'root.mjs', factories: [{ file: 'operation.mjs', name: 'createOperation',
    loaders: { loadOriginal: { file: 'original.mjs', exports: ['prepare','restore'] } } }] };
  const source = 'import assert from "node:assert/strict"; export function createOperation({loadOriginal}) { assert.equal(typeof loadOriginal,"function"); return async () => { const {prepare,restore}=await loadOriginal(); return [prepare(),restore()]; }; }';
  const producer = 'createOperation({loadOriginal:()=>import("./original.mjs")});';
  const original = 'throw Error("MUST_NOT_EXECUTE"); export function prepare() {} export function restore() {}';
  const root = fixture(t, { 'root.mjs': producer, 'operation.mjs': source, 'original.mjs': original });
  assert.deepEqual(inspectOperationPorts(config, root), []);
  for (const replacement of [
    'arbitraryCallback', '()=>forward()', '(path)=>import(path)', '()=>import(path)',
    '()=>import("./other.mjs")', '()=>({prepare,restore})', '()=>{return import("./original.mjs");}',
  ]) {
    writeFileSync(join(root, 'root.mjs'), `createOperation({loadOriginal:${replacement}});`);
    assert.ok(inspectOperationPorts(config, root).some(message => /zero-argument literal import/.test(message)), replacement);
  }
  writeFileSync(join(root, 'root.mjs'), producer);
  for (const replacement of [
    'return loadOriginal;', 'return forward(loadOriginal);',
    'return async () => {const namespace=await loadOriginal(); return namespace;};',
    'return async () => {const {prepare,restore}=await loadOriginal("extra"); return [prepare(),restore()];};',
    'return async () => {const {prepare,write}=await loadOriginal(); return [prepare(),write()];};',
  ]) {
    writeFileSync(join(root, 'operation.mjs'), `export function createOperation({loadOriginal}) { ${replacement} }`);
    assert.ok(inspectOperationPorts(config, root).length > 0, replacement);
  }
  writeFileSync(join(root, 'operation.mjs'), source);
  writeFileSync(join(root, 'original.mjs'), 'export function prepare() {}');
  assert.ok(inspectOperationPorts(config, root).some(message => /does not export function restore/.test(message)));
  writeFileSync(join(root, 'original.mjs'), original);
  const unconfigured = { composition: 'root.mjs', factories: [{ file: 'operation.mjs', name: 'createOperation' }] };
  assert.ok(inspectOperationPorts(unconfigured, root).some(message => /whole-port forwarding/.test(message)));
});

test('private implementation loader resolves only its original frozen composition binding', t => {
  const config = { composition: 'implementation.mjs', factories: [{ file: 'operation.mjs', name: 'createOperation',
    loaders: { loadOriginal: { file: 'original.mjs', exports: ['prepare'],
      binding: { file: 'root.mjs', factory: 'buildImplementation', contract: 'load', member: 'original' } } } }] };
  const operation = 'export function createOperation({loadOriginal}) { return async () => { const {prepare}=await loadOriginal(); return prepare(); }; }';
  const implementation = 'export function buildImplementation(contracts) { const {load}=contracts; return createOperation({loadOriginal:()=>load.original()}); }';
  const rootSource = 'import {buildImplementation as build} from "./implementation.mjs"; const instance=build(Object.freeze({load:Object.freeze({original:()=>import("./original.mjs")})}));';
  const root = fixture(t, { 'root.mjs': rootSource, 'implementation.mjs': implementation,
    'operation.mjs': operation, 'original.mjs': 'throw Error("MUST_NOT_EXECUTE"); export function prepare() {}' });
  assert.deepEqual(inspectOperationPorts(config, root), []);
  for (const changed of [
    rootSource.replace('./original.mjs', './substituted.mjs'),
    rootSource.replace('()=>import("./original.mjs")', 'callback'),
    rootSource.replace('()=>import("./original.mjs")', '(path)=>import(path)'),
    rootSource.replace('Object.freeze({load:', '({load:'),
    rootSource.replace('load:Object.freeze(', 'load:('),
    rootSource.replace('const instance=', 'const Object={freeze:identity}; const instance='),
    rootSource.replace('./implementation.mjs', './other-implementation.mjs'),
    rootSource.replace('original:()=>', '...additional,original:()=>'),
    rootSource + ' build(Object.freeze({load:Object.freeze({original:()=>import("./original.mjs")})}));',
  ]) {
    writeFileSync(join(root, 'root.mjs'), changed);
    assert.ok(inspectOperationPorts(config, root).length > 0, changed);
  }
  writeFileSync(join(root, 'root.mjs'), rootSource);
  for (const changed of [
    implementation.replace('load.original()', 'load.original("extra")'),
    implementation.replace('load.original()', 'load[selector]()'),
    implementation.replace('const {load}=contracts;', 'const {load}=otherContracts;'),
    implementation.replace('()=>load.original()', 'callback'),
    'export function buildImplementation(contracts) { const {load}=contracts; function shadow(load) { return createOperation({loadOriginal:()=>load.original()}); } return shadow; }',
  ]) {
    writeFileSync(join(root, 'implementation.mjs'), changed);
    assert.ok(inspectOperationPorts(config, root).length > 0, changed);
  }
});
