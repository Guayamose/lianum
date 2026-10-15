/** Static syntax/import/export checks. This never imports or starts product code. */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { inspectOperationPorts } from './operation-ports.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const options = { allowJs: true, noEmit: true, module: ts.ModuleKind.NodeNext,
  moduleResolution: ts.ModuleResolutionKind.NodeNext, target: ts.ScriptTarget.ES2024,
  types: [], skipLibCheck: false };
const git = (...args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' });

/** One lexical rule, not a claim that these dynamic modules are fully typed.
 * Imports/exports are checked separately; noResolve prevents loading their graph. */
export function inspectBindings(files, root = ROOT) {
  const absolute = files.map(file => resolve(root, file));
  const selected = new Set(absolute);
  const missing = absolute.filter(file => !existsSync(file));
  if (missing.length) return missing.map(file => `${relative(root, file)}: binding source missing`);
  const program = ts.createProgram(absolute, { ...options, checkJs: true, noResolve: true, types: ['node'] });
  const bindingCodes = new Set([2304, 2552, 18004]);
  const diagnostics = program.getSemanticDiagnostics().filter(diagnostic =>
    diagnostic.file && selected.has(diagnostic.file.fileName) && bindingCodes.has(diagnostic.code));
  return diagnostics.map(diagnostic => {
    const line = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start ?? 0).line + 1;
    return `${relative(root, diagnostic.file.fileName)}:${line}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')}`;
  });
}

export function inspectModules(files, root = ROOT, exceptions = []) {
  const selected = new Set(files.map(file => resolve(root, file)));
  const index = new Map();
  const failures = [];
  const allowed = new Map(exceptions.map(row => [row.source + '\0' + row.specifier, row]));
  if (allowed.size !== exceptions.length || exceptions.some(row => !row.reason)) throw Error('Invalid exact compatibility exceptions');
  const used = new Set();
  let importsChecked = 0;
  function load(path) {
    if (index.has(path)) return index.get(path);
    if (!existsSync(path)) { failures.push(`${relative(root, path)}: source missing`); return null; }
    const source = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.ES2024, true);
    const entry = { names: new Set(), stars: [], imports: [] };
    index.set(path, entry);
    if (selected.has(path)) {
      for (const diagnostic of source.parseDiagnostics) {
        const line = source.getLineAndCharacterOfPosition(diagnostic.start ?? 0).line + 1;
        failures.push(`${relative(root, path)}:${line}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')}`);
      }
    }
    const binding = node => {
      if (ts.isIdentifier(node)) entry.names.add(node.text);
      else for (const element of node.elements) if (!ts.isOmittedExpression(element)) binding(element.name);
    };
    for (const node of source.statements) {
      if (node.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword)) {
        if (node.modifiers.some(modifier => modifier.kind === ts.SyntaxKind.DefaultKeyword)) entry.names.add('default');
        else if (ts.isVariableStatement(node)) node.declarationList.declarations.forEach(declaration => binding(declaration.name));
        else if (node.name && ts.isIdentifier(node.name)) entry.names.add(node.name.text);
      }
      if (ts.isExportAssignment(node)) entry.names.add('default');
      if (ts.isExportDeclaration(node) && node.exportClause) {
        if (ts.isNamedExports(node.exportClause)) node.exportClause.elements.forEach(element => entry.names.add(element.name.text));
        else if (ts.isNamespaceExport(node.exportClause)) entry.names.add(node.exportClause.name.text);
      }
      if (!ts.isImportDeclaration(node) && !ts.isExportDeclaration(node)) continue;
      if (!node.moduleSpecifier || !ts.isStringLiteral(node.moduleSpecifier)) continue;
      const name = node.moduleSpecifier.text;
      if (!(name.startsWith('.') || name.startsWith('@lianum/'))) continue;
      const resolved = ts.resolveModuleName(name, path, options, ts.sys).resolvedModule;
      // Check the runtime module, not a possibly separate .d.mts declaration.
      const runtime = resolved?.resolvedFileName.replace(/\.d\.mts$/, '.mjs');
      const found = runtime && existsSync(runtime) ? { resolvedFileName: runtime } : resolved;
      const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
      if (!found || !existsSync(found.resolvedFileName)) {
        if (selected.has(path)) {
          const key = relative(root, path) + '\0' + name;
          if (allowed.has(key)) used.add(key);
          else failures.push(`${relative(root, path)}:${line}: local module not found: ${name}`);
        }
        continue;
      }
      if (!/\.(?:mjs|js|mts|ts)$/.test(found.resolvedFileName)) continue;
      const names = [];
      if (ts.isImportDeclaration(node) && node.importClause) {
        if (node.importClause.name) names.push('default');
        if (node.importClause.namedBindings && ts.isNamedImports(node.importClause.namedBindings)) {
          for (const element of node.importClause.namedBindings.elements) names.push((element.propertyName ?? element.name).text);
        }
      } else if (ts.isExportDeclaration(node) && node.exportClause && ts.isNamedExports(node.exportClause)) {
        for (const element of node.exportClause.elements) names.push((element.propertyName ?? element.name).text);
      }
      entry.imports.push({ target: found.resolvedFileName, names, name, line });
      if (ts.isExportDeclaration(node) && !node.exportClause) entry.stars.push(found.resolvedFileName);
    }
    // Keep only tiny export/import metadata, not a compiler program for the historical graph.
    for (const dependency of entry.imports) load(dependency.target);
    return entry;
  }
  selected.forEach(load);
  let changed = true;
  while (changed) {
    changed = false;
    for (const entry of index.values()) for (const path of entry.stars) {
      for (const name of index.get(path)?.names ?? []) if (name !== 'default' && !entry.names.has(name)) {
        entry.names.add(name); changed = true;
      }
    }
  }
  for (const path of selected) for (const dependency of index.get(path)?.imports ?? []) {
    for (const name of dependency.names) {
      importsChecked++;
      if (!index.get(dependency.target)?.names.has(name)) {
        failures.push(`${relative(root, path)}:${dependency.line}: ${dependency.name} does not export ${name}`);
      }
    }
  }
  for (const [key, row] of allowed) if (selected.has(resolve(root, row.source)) && !used.has(key)) {
    failures.push(`${row.source}: obsolete compatibility exception: ${row.specifier}`);
  }
  return { filesChecked: selected.size, importsChecked, failures,
    compatibilityExceptions: [...used].map(key => allowed.get(key)) };
}

function main(args) {
  let files;
  if (args.length === 0 || args[0] === '--changed') {
    const selected = args[0] === '--changed'
      ? git('diff', '--name-only', 'HEAD', '--') + '\n' + git('ls-files', '--others', '--exclude-standard')
      : git('ls-files', '--cached', '--others', '--exclude-standard');
    files = [...new Set(selected.split('\n'))].filter(path =>
      /^(?:packages\/[^/]+\/src\/|apps\/wallet\/src\/|services\/[^/]+\/src\/)/.test(path) && path.endsWith('.mjs') && existsSync(resolve(ROOT, path)));
    // Frozen, unreachable compatibility modules are authenticated as byte
    // evidence by the shared inventory. Their former import targets are not
    // current runtime dependencies. Exported/reachable compatibility stays in.
    const frozen = JSON.parse(execFileSync('python3', ['-B', '-c',
      'import json,sys; sys.path.insert(0,sys.argv[1]); from block_check import discover; print(json.dumps([r["path"] for r in discover()["explicitExclusions"] if r.get("inventory")]))',
      resolve(ROOT, 'scripts/development')], { cwd: ROOT, encoding: 'utf8' }));
    const excluded = new Set(frozen);
    files = files.filter(path => !excluded.has(path));
  } else {
    files = args.map(path => {
      const absolute = resolve(ROOT, path);
      if (isAbsolute(relative(ROOT, absolute)) || relative(ROOT, absolute).startsWith('..')) throw Error('Repository paths required');
      return relative(ROOT, absolute);
    });
  }
  const exceptions = JSON.parse(readFileSync(resolve(ROOT, 'scripts/development/static-check-exceptions.json'), 'utf8'));
  const result = inspectModules(files, ROOT, exceptions.missingHistoricalImports);
  const bindingFiles = JSON.parse(readFileSync(resolve(ROOT, 'scripts/development/static-bindings.json'), 'utf8')).files;
  const bindingFailures = inspectBindings(bindingFiles);
  const portsConfig = JSON.parse(readFileSync(resolve(ROOT, 'scripts/development/static-operation-ports.json'), 'utf8'));
  const portFailures = inspectOperationPorts(portsConfig, ROOT);
  const config = ts.readConfigFile(resolve(ROOT, 'scripts/development/tsconfig.checkjs.json'), ts.sys.readFile);
  if (config.error) throw Error(ts.flattenDiagnosticMessageText(config.error.messageText, '\n'));
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, resolve(ROOT, 'scripts/development'));
  const typed = ts.createProgram(parsed.fileNames, parsed.options);
  const diagnostics = [...parsed.errors, ...ts.getPreEmitDiagnostics(typed)];
  if (diagnostics.length) process.stderr.write(ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCanonicalFileName: path => path, getCurrentDirectory: () => ROOT, getNewLine: () => '\n' }));
  for (const failure of result.failures) process.stderr.write(failure + '\n');
  for (const failure of bindingFailures) process.stderr.write(failure + '\n');
  for (const failure of portFailures) process.stderr.write(failure + '\n');
  process.stdout.write(`Static modules: ${result.filesChecked} files, ${result.importsChecked} imported names; strict checkJs: ${parsed.fileNames.length} API files.\n`);
  process.stdout.write(`Lexical name bindings: ${bindingFiles.length} authority/operation files; no imported authority graph is loaded.\n`);
  process.stdout.write(`Operation ports: ${portsConfig.factories.length} factories; explicit members match composition, no surplus fields or general record/write capability.\n`);
  process.stdout.write(`Missing historical imports: ${result.compatibilityExceptions.length} exact recorded exceptions (static-check-exceptions.json); no new exceptions accepted automatically.\n`);
  process.stdout.write('Scope: literal imports/exports and syntax; strict types apply only to tsconfig.checkjs.json.\n');
  process.exitCode = result.failures.length || diagnostics.length || bindingFailures.length || portFailures.length ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2));
