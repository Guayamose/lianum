/** Exact extraction from the pinned original AST interpreter; no imports of runtime/deployment code. */
import assert from 'node:assert/strict';
function word(value) {
  if (typeof value === 'number') assert.ok(Number.isSafeInteger(value) && !Object.is(value, -0), 'GENERIC_ABI_SAFE_INTEGER');
  assert.ok(['number', 'bigint', 'string'].includes(typeof value), 'GENERIC_ABI_INTEGER');
  if (typeof value === 'string') assert.match(value, /^(?:0|[1-9][0-9]*|0x[0-9a-f]+)$/i, 'GENERIC_ABI_INTEGER');
  const n = BigInt(value); assert.ok(n >= 0n && n < (1n << 256n), 'GENERIC_ABI_WORD_RANGE');
  return n.toString(16).padStart(64, '0');
}
export function deriveGenericVerifierImmutables(ast, expectedPublicInputs) {
  assert.equal(ast?.nodeType, 'SourceUnit', 'GENERIC_VERIFIER_SOURCE_AST');
  const nodes = new Map();
  const walk = node => {
    if (!node || typeof node !== 'object') return;
    if (Number.isSafeInteger(node.id)) nodes.set(node.id, node);
    for (const value of Object.values(node)) if (value && typeof value === 'object') {
      if (Array.isArray(value)) value.forEach(walk); else walk(value);
    }
  };
  walk(ast);
  const one = (values, message) => { assert.equal(values.length, 1, message); return values[0]; };
  const honk = one(ast.nodes.filter(node => node.nodeType === 'ContractDefinition' && node.name === 'HonkVerifier'), 'GENERIC_HONK_CONTRACT_AST');
  assert.equal(honk.nodes.filter(node => node.kind === 'constructor').length, 0, 'GENERIC_HONK_UNEXPECTED_CONSTRUCTOR');
  const inherited = one(honk.baseContracts, 'GENERIC_HONK_BASE_COUNT');
  const base = nodes.get(inherited.baseName.referencedDeclaration);
  assert.equal(base?.name, 'BaseZKHonkVerifier', 'GENERIC_HONK_BASE_PROFILE');
  const constructor = one(base.nodes.filter(node => node.nodeType === 'FunctionDefinition' && node.kind === 'constructor'), 'GENERIC_HONK_BASE_CONSTRUCTOR');
  const parameters = constructor.parameters.parameters;
  assert.deepEqual(parameters.map(node => node.name), ['_N', '_logN', '_vkHash', '_numPublicInputs'], 'GENERIC_HONK_CONSTRUCTOR_PARAMETERS');
  assert.ok(parameters.every(node => node.typeDescriptions.typeString === 'uint256'), 'GENERIC_HONK_CONSTRUCTOR_TYPES');
  assert.equal(inherited.arguments.length, parameters.length, 'GENERIC_HONK_BASE_ARGUMENT_COUNT');
  const bindings = new Map(), evaluating = new Set();
  const evaluate = expression => {
    assert.ok(expression, 'GENERIC_HONK_CONSTANT_EXPRESSION');
    let result;
    if (expression.nodeType === 'Literal' && expression.kind === 'number') {
      result = BigInt(`0x${word(expression.value)}`);
    } else if (expression.nodeType === 'Identifier') {
      const id = expression.referencedDeclaration;
      if (bindings.has(id)) return bindings.get(id);
      const declaration = nodes.get(id);
      assert.ok(declaration?.nodeType === 'VariableDeclaration' && declaration.constant === true && declaration.value, 'GENERIC_HONK_NONCONSTANT_REFERENCE');
      assert.ok(!evaluating.has(id), 'GENERIC_HONK_CONSTANT_CYCLE'); evaluating.add(id);
      try { result = evaluate(declaration.value); } finally { evaluating.delete(id); }
    } else if (expression.nodeType === 'BinaryOperation' && expression.operator === '+') {
      result = evaluate(expression.leftExpression) + evaluate(expression.rightExpression);
    } else throw new Error(`GENERIC_HONK_UNSUPPORTED_CONSTANT_${expression.nodeType}`);
    word(result); return result;
  };
  const constant = (name, scope = ast.nodes) => evaluate(one(scope.filter(node => node.nodeType === 'VariableDeclaration' && node.name === name && node.constant === true), `GENERIC_HONK_CONSTANT_${name}`).value);
  const argumentNames = ['N', 'LOG_N', 'VK_HASH', 'NUMBER_OF_PUBLIC_INPUTS'];
  for (let i = 0; i < parameters.length; i++) {
    assert.equal(inherited.arguments[i].nodeType, 'Identifier', 'GENERIC_HONK_BASE_CONSTANT_ARGUMENT');
    assert.equal(nodes.get(inherited.arguments[i].referencedDeclaration)?.name, argumentNames[i], 'GENERIC_HONK_BASE_ARGUMENT_BINDING');
    bindings.set(parameters[i].id, evaluate(inherited.arguments[i]));
  }
  const names = ['$N', '$LOG_N', '$VK_HASH', '$NUM_PUBLIC_INPUTS', '$MSMSize'];
  const declarations = base.nodes.filter(node => node.nodeType === 'VariableDeclaration' && node.mutability === 'immutable');
  assert.deepEqual(declarations.map(node => node.name).sort(), [...names].sort(), 'GENERIC_HONK_IMMUTABLE_PROFILE');
  const values = {};
  assert.equal(constructor.body.statements.length, names.length, 'GENERIC_HONK_CONSTRUCTOR_STATEMENTS');
  for (const statement of constructor.body.statements) {
    const assignment = statement.expression;
    assert.ok(statement.nodeType === 'ExpressionStatement' && assignment?.nodeType === 'Assignment' && assignment.operator === '=' && assignment.leftHandSide.nodeType === 'Identifier', 'GENERIC_HONK_CONSTRUCTOR_ASSIGNMENT');
    const declaration = nodes.get(assignment.leftHandSide.referencedDeclaration);
    assert.ok(declarations.includes(declaration) && !Object.hasOwn(values, declaration.name), 'GENERIC_HONK_IMMUTABLE_ASSIGNMENT');
    values[declaration.name] = evaluate(assignment.rightHandSide);
  }
  for (let i = 0; i < argumentNames.length; i++) assert.equal(values[names[i]], constant(argumentNames[i]), 'GENERIC_HONK_IMMUTABLE_CONSTANT_BINDING');
  assert.ok(values.$LOG_N > 0n && values.$LOG_N < 32n, 'GENERIC_HONK_LOG_N_RANGE');
  assert.equal(values.$N, 1n << values.$LOG_N, 'GENERIC_HONK_CIRCUIT_SIZE');
  assert.ok(values.$VK_HASH > 0n, 'GENERIC_HONK_VK_HASH');
  assert.equal(constant('PAIRING_POINTS_SIZE'), 8n, 'GENERIC_HONK_PAIRING_INPUT_PROFILE');
  assert.equal(values.$NUM_PUBLIC_INPUTS, BigInt(expectedPublicInputs) + constant('PAIRING_POINTS_SIZE'), 'GENERIC_HONK_PUBLIC_INPUT_BINDING');
  assert.equal(values.$MSMSize, constant('NUMBER_UNSHIFTED_ZK') + values.$LOG_N + constant('LIBRA_COMMITMENTS', base.nodes) + 2n, 'GENERIC_HONK_MSM_BINDING');
  return Object.fromEntries(Object.entries(values).map(([name, value]) => [name, `0x${word(value)}`]));
}

