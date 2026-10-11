// HOST fixtures execute selected, unchanged production bodies against inert
// ports. Parsing declarations keeps these tests independent of source formatting.
import assert from 'node:assert/strict';
import ts from 'typescript';

function declarations(source) {
  const file = ts.createSourceFile('authority.mjs', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const found = new Map();
  function visit(node) {
    if ((ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node) ||
         ts.isShorthandPropertyAssignment(node)) && node.name) {
      const name = node.name.getText(file);
      if (!ts.isShorthandPropertyAssignment(node) || !found.has(name)) found.set(name, node);
    } else if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
      found.set(node.name.text, node.parent.parent);
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  return {file, found};
}

export function extractDeclaration(source, name) {
  const {file, found} = declarations(source);
  const node = found.get(name);
  assert.ok(node, 'HOST_ORIGINAL_DECLARATION_REQUIRED: ' + name);
  return source.slice(node.getStart(file), node.end);
}

export function declarationRange(source, first, next) {
  const {file, found} = declarations(source), node = found.get(first);
  assert.ok(node, 'HOST_ORIGINAL_DECLARATION_REQUIRED: ' + first);
  const end = found.get(next);
  // A subsystem's last operation ends at its factory's return statement.
  const stop = end?.getStart(file) ?? node.parent.statements?.find(
    value => ts.isReturnStatement(value) && value.pos >= node.end)?.getStart(file);
  assert.ok(stop > node.getStart(file), 'HOST_ORIGINAL_END_REQUIRED: ' + next);
  return source.slice(node.getStart(file), stop);
}
