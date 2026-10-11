/** Check the seven private operation factories without loading their runtime graph. */
import { resolve, relative } from 'node:path';
import ts from 'typescript';

const forbidden = new Set(['context', 'operationContext', 'record', 'password', 'write']);
const key = node => node && (ts.isIdentifier(node) || ts.isStringLiteral(node)) ? node.text : null;
const walk = (node, visit) => { visit(node); ts.forEachChild(node, child => walk(child, visit)); };
const literal = node => ts.isCallExpression(node) && node.expression.getText() === 'Object.freeze' && node.arguments.length === 1
  ? node.arguments[0] : node;

export function inspectOperationPorts(config, root) {
  const files = [config.composition, ...config.factories.map(row => row.file)];
  const program = ts.createProgram(files.map(file => resolve(root, file)), {
    allowJs: true, noResolve: true, noLib: true, types: [], target: ts.ScriptTarget.Latest,
  });
  const checker = program.getTypeChecker(), failures = [];
  const fail = (file, node, message) => failures.push(`${relative(root, file.fileName)}:${file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1}: ${message}`);
  const composition = program.getSourceFile(resolve(root, config.composition));
  if (!composition) return [`${config.composition}: operation composition missing`];
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
      const symbol = checker.getSymbolAtLocation(binding.name), members = new Map();
      walk(factory.body, node => {
        if (!ts.isIdentifier(node)) return;
        const resolved = ts.isShorthandPropertyAssignment(node.parent)
          ? checker.getShorthandAssignmentValueSymbol(node.parent) : checker.getSymbolAtLocation(node);
        if (resolved !== symbol) return;
        if (ts.isPropertyAccessExpression(node.parent) && node.parent.expression === node) members.set(node.parent.name.text, node.parent);
        else fail(file, node, `${row.name}.${name} must use explicit members; whole-port forwarding or dynamic access is forbidden`);
      });
      ports.set(name, members);
    }
    const calls = [];
    walk(composition, node => { if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === row.name) calls.push(node); });
    if (calls.length !== 1) fail(composition, composition, `${row.name} requires exactly one composition call, found ${calls.length}`);
    for (const call of calls) {
      if (call.arguments.length !== 1) { fail(composition, call, `${row.name} requires one port object`); continue; }
      const actual = properties(composition, call.arguments[0], row.name);
      compare(composition, call, actual, ports, row.name);
      for (const [name, members] of ports) {
        const field = actual.get(name);
        if (!field) continue;
        const value = ts.isPropertyAssignment(field) ? field.initializer : field.name;
        compare(composition, field, properties(composition, value, `${row.name}.${name}`), members, `${row.name}.${name}`);
      }
    }
  }
  return failures;
}
