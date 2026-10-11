/** Check the seven private operation factories without loading their runtime graph. */
import { dirname, resolve, relative } from 'node:path';
import ts from 'typescript';

const forbidden = new Set(['context', 'operationContext', 'record', 'password', 'write']);
const key = node => node && (ts.isIdentifier(node) || ts.isStringLiteral(node)) ? node.text : null;
const walk = (node, visit) => { visit(node); ts.forEachChild(node, child => walk(child, visit)); };
const literal = node => ts.isCallExpression(node) && node.expression.getText() === 'Object.freeze' && node.arguments.length === 1
  ? node.arguments[0] : node;

export function inspectOperationPorts(config, root) {
  const files = [config.composition, ...config.factories.flatMap(row => [
    row.file, ...Object.values(row.loaders ?? {}).flatMap(loader => [loader.file, ...(loader.binding ? [loader.binding.file] : [])]),
  ])];
  const program = ts.createProgram(files.map(file => resolve(root, file)), {
    allowJs: true, noResolve: true, noLib: true, types: [], target: ts.ScriptTarget.Latest,
  });
  const checker = program.getTypeChecker(), failures = [];
  const fail = (file, node, message) => failures.push(`${relative(root, file.fileName)}:${file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1}: ${message}`);
  const composition = program.getSourceFile(resolve(root, config.composition));
  if (!composition) return [`${config.composition}: operation composition missing`];
  const symbolOf = node => ts.isShorthandPropertyAssignment(node.parent)
    ? checker.getShorthandAssignmentValueSymbol(node.parent) : checker.getSymbolAtLocation(node);
  function imported(node, module, exported) {
    if (!ts.isIdentifier(node)) return false;
    const declarations = symbolOf(node)?.declarations ?? [];
    return declarations.length === 1 && declarations.some(declaration => {
      if (exported === 'default' && ts.isImportClause(declaration))
        return declaration.parent.moduleSpecifier.text === module;
      return ts.isImportSpecifier(declaration) && key(declaration.propertyName ?? declaration.name) === exported
        && declaration.parent.parent.parent.moduleSpecifier.text === module;
    });
  }
  function assertion(node, argument, value) {
    return ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
      && node.expression.name.text === 'equal' && imported(node.expression.expression, 'node:assert/strict', 'default')
      && node.arguments.length === 2 && node.arguments[0] === argument
      && ts.isStringLiteral(node.arguments[1]) && node.arguments[1].text === value;
  }
  function properties(file, node, label) {
    node = literal(node);
    if (!ts.isObjectLiteralExpression(node)) { fail(file, node, `${label} requires an explicit object literal`); return new Map(); }
    const fields = new Map();
    for (const field of node.properties) {
      const name = key(field.name);
      if (!name || !(ts.isPropertyAssignment(field) || ts.isShorthandPropertyAssignment(field))) {
        fail(file, field, `${label} requires explicit fields without spreads or accessors`); continue;
      }
      if (fields.has(name)) fail(file, field, `${label} duplicates ${name}`);
      if (forbidden.has(name)) fail(file, field, `${label} exposes forbidden general capability ${name}`);
      fields.set(name, field);
    }
    return fields;
  }
  function compare(file, node, actual, expected, label) {
    for (const name of actual.keys()) if (!expected.has(name)) fail(file, actual.get(name), `${label} has unused or unknown field ${name}`);
    for (const name of expected.keys()) if (!actual.has(name)) fail(file, node, `${label} is missing field ${name}`);
  }
  function destructure(file, declaration, body, label, members) {
    if (!ts.isVariableDeclaration(declaration) || !ts.isObjectBindingPattern(declaration.name)
      || !(declaration.parent.flags & ts.NodeFlags.Const)) return false;
    for (const binding of declaration.name.elements) {
      const name = key(binding.propertyName ?? binding.name);
      if (!name || !ts.isIdentifier(binding.name) || binding.dotDotDotToken || binding.initializer) {
        fail(file, binding, `${label} requires fixed const members without rest/defaults`); continue;
      }
      if (forbidden.has(name)) fail(file, binding, `${label} exposes forbidden general capability ${name}`);
      const symbol = symbolOf(binding.name);
      let used = false;
      walk(body, node => {
        if (ts.isIdentifier(node) && node !== binding.name && node !== binding.propertyName && symbolOf(node) === symbol) used = true;
      });
      if (!used) fail(file, binding, `${label} has unused destructured member ${name}`);
      else members.set(name, binding);
    }
    return true;
  }
  function exactGuard(file, node, body, label, guards) {
    const call = node.parent;
    if (!ts.isCallExpression(call) || call.arguments[0] !== node || call.arguments.length !== 2
      || !imported(call.expression, '@lianum/components/encoding/commitments', 'exactRecord')
      || !ts.isExpressionStatement(call.parent) || call.parent.parent !== body) return false;
    const list = call.arguments[1], fields = new Map();
    if (!ts.isArrayLiteralExpression(list)) { fail(file, list, `${label} exactRecord requires literal member names`); return true; }
    for (const entry of list.elements) {
      if (!ts.isStringLiteral(entry)) { fail(file, entry, `${label} exactRecord requires literal member names`); continue; }
      if (fields.has(entry.text)) fail(file, entry, `${label} exactRecord duplicates ${entry.text}`);
      if (forbidden.has(entry.text)) fail(file, entry, `${label} exposes forbidden general capability ${entry.text}`);
      fields.set(entry.text, entry);
    }
    guards.push({ call, fields });
    return true;
  }
  function functionGroupGuard(node, body, guards) {
    const values = node.parent;
    if (!ts.isCallExpression(values) || values.arguments.length !== 1 || values.arguments[0] !== node
      || !ts.isPropertyAccessExpression(values.expression) || values.expression.name.text !== 'values'
      || !ts.isIdentifier(values.expression.expression) || values.expression.expression.text !== 'Object'
      || symbolOf(values.expression.expression)?.declarations?.length) return false;
    const loop = values.parent;
    if (!ts.isForOfStatement(loop) || loop.expression !== values || loop.parent !== body
      || loop.awaitModifier || !ts.isVariableDeclarationList(loop.initializer)
      || !(loop.initializer.flags & ts.NodeFlags.Const) || loop.initializer.declarations.length !== 1) return false;
    const binding = loop.initializer.declarations[0];
    if (!ts.isIdentifier(binding.name) || binding.initializer) return false;
    const statement = ts.isBlock(loop.statement) && loop.statement.statements.length === 1
      ? loop.statement.statements[0] : loop.statement;
    if (!ts.isExpressionStatement(statement)) return false;
    const call = statement.expression, type = ts.isCallExpression(call) && call.arguments[0];
    return type && ts.isTypeOfExpression(type) && ts.isIdentifier(type.expression)
      && symbolOf(type.expression) === symbolOf(binding.name) && assertion(call, type, 'function')
      && guards.some(guard => guard.call.end < loop.pos);
  }
  function inspectLoaderUse(file, node, factory, label, descriptor, consumed) {
    const parent = node.parent;
    if (ts.isTypeOfExpression(parent) && assertion(parent.parent, parent, 'function')
      && ts.isExpressionStatement(parent.parent.parent) && parent.parent.parent.parent === factory.body) return true;
    if (!ts.isCallExpression(parent) || parent.expression !== node || parent.arguments.length !== 0
      || !ts.isAwaitExpression(parent.parent)) return false;
    const declaration = parent.parent.parent;
    if (!ts.isVariableDeclaration(declaration) || declaration.initializer !== parent.parent
      || !destructure(file, declaration, factory.body, label, consumed)) return false;
    for (const [name, binding] of consumed) if (!descriptor.exports.includes(name))
      fail(file, binding, `${label} loads undeclared export ${name}`);
    return true;
  }
  function inspectLoaderProducer(file, value, label, descriptor, consumed) {
    const body = ts.isArrowFunction(value) && value.body;
    if (!body || value.parameters.length !== 0 || value.modifiers?.length
      || !ts.isCallExpression(body) || body.expression.kind !== ts.SyntaxKind.ImportKeyword
      || body.arguments.length !== 1 || !ts.isStringLiteral(body.arguments[0])
      || !body.arguments[0].text.startsWith('.')
      || resolve(dirname(file.fileName), body.arguments[0].text) !== resolve(root, descriptor.file)) {
      fail(file, value, `${label} requires a zero-argument literal import of ${descriptor.file}`); return;
    }
    const target = program.getSourceFile(resolve(root, descriptor.file));
    if (!target) { fail(file, value, `${label} fixed loader module missing`); return; }
    const exports = new Set(target.statements.filter(statement => ts.isFunctionDeclaration(statement)
      && statement.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword)).map(statement => statement.name?.text));
    for (const name of descriptor.exports) {
      if (!exports.has(name)) fail(file, value, `${label} fixed loader does not export function ${name}`);
      if (!consumed.has(name)) fail(file, value, `${label} has unused loaded export ${name}`);
    }
  }
  // A composition may pass its fixed loader through a private implementation.
  // Follow only that configured, frozen binding; arbitrary callbacks still fail.
  function inspectBoundLoader(file, value, label, descriptor, consumed) {
    const binding = descriptor.binding;
    const invalid = () => fail(file, value, `${label} requires the fixed frozen loader binding`);
    const call = ts.isArrowFunction(value) && !value.parameters.length && !value.modifiers?.length && value.body;
    if (!call || !ts.isCallExpression(call) || call.arguments.length
      || !ts.isPropertyAccessExpression(call.expression) || !ts.isIdentifier(call.expression.expression)
      || call.expression.name.text !== binding.member) { invalid(); return; }
    const receiver = call.expression.expression;
    const declaration = symbolOf(receiver)?.declarations?.[0];
    if (!declaration || !ts.isBindingElement(declaration) || declaration.initializer || declaration.dotDotDotToken
      || key(declaration.propertyName ?? declaration.name) !== binding.contract) { invalid(); return; }
    const variable = declaration.parent.parent;
    let factory = variable;
    while (factory && !ts.isFunctionDeclaration(factory)) factory = factory.parent;
    if (!ts.isVariableDeclaration(variable) || !(variable.parent.flags & ts.NodeFlags.Const)
      || !factory || factory.name?.text !== binding.factory || factory.parent !== file
      || factory.parameters.length !== 1 || !ts.isIdentifier(factory.parameters[0].name)
      || !ts.isIdentifier(variable.initializer)
      || symbolOf(variable.initializer) !== symbolOf(factory.parameters[0].name)) { invalid(); return; }

    const owner = program.getSourceFile(resolve(root, binding.file));
    if (!owner) { invalid(); return; }
    const calls = [];
    walk(owner, node => {
      if (!ts.isCallExpression(node) || !ts.isIdentifier(node.expression)) return;
      const declarations = symbolOf(node.expression)?.declarations ?? [];
      if (declarations.length !== 1 || !ts.isImportSpecifier(declarations[0])) return;
      const imported = declarations[0];
      const module = imported.parent.parent.parent.moduleSpecifier;
      if (key(imported.propertyName ?? imported.name) === binding.factory && ts.isStringLiteral(module)
        && resolve(dirname(owner.fileName), module.text) === file.fileName) calls.push(node);
    });
    const frozenFields = node => {
      if (!node || !ts.isCallExpression(node) || node.arguments.length !== 1
        || !ts.isPropertyAccessExpression(node.expression) || node.expression.name.text !== 'freeze'
        || !ts.isIdentifier(node.expression.expression) || node.expression.expression.text !== 'Object'
        || symbolOf(node.expression.expression)?.declarations?.length) return null;
      const object = node.arguments[0];
      if (!ts.isObjectLiteralExpression(object)) return null;
      const fields = new Map();
      for (const field of object.properties) {
        if (!ts.isPropertyAssignment(field) && !ts.isShorthandPropertyAssignment(field)) return null;
        const name = key(field.name);
        if (!name || fields.has(name)) return null;
        fields.set(name, ts.isPropertyAssignment(field) ? field.initializer : field.name);
      }
      return fields;
    };
    if (calls.length !== 1 || calls[0].arguments.length !== 1) { invalid(); return; }
    const contracts = frozenFields(calls[0].arguments[0]);
    const loaders = frozenFields(contracts?.get(binding.contract));
    const producer = loaders?.get(binding.member);
    if (!producer) { invalid(); return; }
    inspectLoaderProducer(owner, producer, label, descriptor, consumed);
  }
  for (const row of config.factories) {
    const file = program.getSourceFile(resolve(root, row.file));
    if (!file) { failures.push(`${row.file}: operation factory missing`); continue; }
    const factory = file.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === row.name);
    if (!factory?.body || factory.parameters.length !== 1 || !ts.isObjectBindingPattern(factory.parameters[0].name)) {
      fail(file, factory ?? file, `${row.name} requires one explicit destructured port argument`); continue;
    }
    const ports = new Map();
    for (const binding of factory.parameters[0].name.elements) {
      const name = key(binding.propertyName ?? binding.name);
      if (!name || !ts.isIdentifier(binding.name) || binding.dotDotDotToken || binding.initializer) {
        fail(file, binding, `${row.name} requires explicit named ports without rest/defaults`); continue;
      }
      if (forbidden.has(name)) fail(file, binding, `${row.name} declares forbidden general capability ${name}`);
      const symbol = symbolOf(binding.name), members = new Map(), guards = [];
      const label = `${row.name}.${name}`, loader = row.loaders?.[name];
      walk(factory.body, node => {
        if (!ts.isIdentifier(node) || symbolOf(node) !== symbol) return;
        const parent = node.parent;
        if (loader) {
          if (inspectLoaderUse(file, node, factory, label, loader, members)) return;
        } else {
          if (ts.isPropertyAccessExpression(parent) && parent.expression === node) { members.set(parent.name.text, parent); return; }
          if (ts.isVariableDeclaration(parent) && parent.initializer === node
            && destructure(file, parent, factory.body, label, members)) return;
          if (exactGuard(file, node, factory.body, label, guards) || functionGroupGuard(node, factory.body, guards)) return;
        }
        fail(file, node, `${label} must use explicit members; whole-port forwarding or dynamic access is forbidden`);
      });
      for (const guard of guards) compare(file, guard.call, guard.fields, members, `${label} exactRecord`);
      ports.set(name, { members, loader });
    }
    for (const name of Object.keys(row.loaders ?? {})) if (!ports.has(name)) fail(file, factory, `${row.name} declares an unknown loader ${name}`);
    const calls = [];
    walk(composition, node => { if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === row.name) calls.push(node); });
    if (calls.length !== 1) fail(composition, composition, `${row.name} requires exactly one composition call, found ${calls.length}`);
    for (const call of calls) {
      if (call.arguments.length !== 1) { fail(composition, call, `${row.name} requires one port object`); continue; }
      const actual = properties(composition, call.arguments[0], row.name);
      compare(composition, call, actual, ports, row.name);
      for (const [name, { members, loader }] of ports) {
        const field = actual.get(name);
        if (!field) continue;
        const value = ts.isPropertyAssignment(field) ? field.initializer : field.name;
        if (loader?.binding) inspectBoundLoader(composition, value, `${row.name}.${name}`, loader, members);
        else if (loader) inspectLoaderProducer(composition, value, `${row.name}.${name}`, loader, members);
        else compare(composition, field, properties(composition, value, `${row.name}.${name}`), members, `${row.name}.${name}`);
      }
    }
  }
  return failures;
}
