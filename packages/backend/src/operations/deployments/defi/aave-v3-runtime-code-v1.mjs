/** Pure linking of pinned upstream Solidity output. Grants no runtime authority. */
import assert from 'node:assert/strict';
const address = value => { assert.match(value, /^0x[0-9a-f]{40}$/); return value.slice(2); };
const word = value => {
  if (typeof value === 'string' && /^0x[0-9a-f]{40}$/.test(value)) return address(value).padStart(64, '0');
  const n = BigInt(value); assert.ok(n >= 0n && n < 1n << 256n); return n.toString(16).padStart(64, '0');
};
function linked(raw, references, libraries) {
  assert.equal(typeof raw, 'string'); let code = raw.replace(/^0x/, ''), ranges = [];
  for (const [source, names] of Object.entries(references)) for (const [name, rows] of Object.entries(names)) {
    assert.ok(Object.hasOwn(libraries, name), 'AAVE_LIBRARY_MISSING');
    const replacement = address(libraries[name]);
    for (const range of rows) {
      assert.equal(range.length, 20); const begin = range.start * 2, end = begin + 40;
      assert.ok(begin >= 0 && end <= code.length && !ranges.some(([a,b]) => begin < b && end > a), 'AAVE_LINK_RANGE');
      assert.match(code.slice(begin, end), /^__\$[0-9a-f]{34}\$__$/); ranges.push([begin,end]);
      code = code.slice(0,begin) + replacement + code.slice(end);
    }
    assert.match(source, /^contracts\//);
  }
  assert.match(code, /^[0-9a-f]+$/); assert.equal(code.length % 2, 0); return code;
}
export function linkAaveCreationCodeV1(artifact, libraries) {
  return '0x' + linked(artifact.evm.bytecode.object, artifact.evm.bytecode.linkReferences, libraries);
}
export function expectedAaveRuntimeCodeV1(artifact, sourceASTs, libraries, values, self = null) {
  const names = {};
  const visit = node => { if (!node || typeof node !== 'object') return;
    if (node.nodeType === 'VariableDeclaration' && node.mutability === 'immutable') names[String(node.id)] = node.name;
    for (const value of Object.values(node)) if (Array.isArray(value)) value.forEach(visit); else if (value && typeof value === 'object') visit(value);
  };
  Object.values(sourceASTs).forEach(row => visit(row.ast ?? row));
  const code = Buffer.from(linked(artifact.evm.deployedBytecode.object, artifact.evm.deployedBytecode.linkReferences, libraries), 'hex');
  const used = new Set(), ranges = [];
  for (const [id, rows] of Object.entries(artifact.evm.deployedBytecode.immutableReferences)) {
    const name = names[id]; assert.ok(Object.hasOwn(values, name), 'AAVE_IMMUTABLE_MISSING'); used.add(name);
    for (const row of rows) {
      assert.equal(row.length, 32); assert.ok(row.start >= 0 && row.start + 32 <= code.length);
      assert.ok(!ranges.some(([a,b]) => row.start < b && row.start + 32 > a), 'AAVE_IMMUTABLE_OVERLAP'); ranges.push([row.start,row.start+32]);
      assert.equal(code.subarray(row.start,row.start+32).toString('hex'), '0'.repeat(64));
      Buffer.from(word(values[name]), 'hex').copy(code,row.start);
    }
  }
  assert.deepEqual([...used].sort(), Object.keys(values).sort(), 'AAVE_EXACT_IMMUTABLES');
  if (self !== null) {
    const definition = (sourceASTs[artifact.sourceName].ast ?? sourceASTs[artifact.sourceName]).nodes
      .find(node => node.nodeType === 'ContractDefinition' && node.name === artifact.contractName);
    assert.equal(definition?.contractKind, 'library');
    assert.equal(code.subarray(0,21).toString('hex'), '73' + '0'.repeat(40), 'AAVE_LIBRARY_SELF_GUARD');
    Buffer.from(address(self), 'hex').copy(code,1);
  }
  assert.ok(code.length > 0 && code.length <= 24576, 'AAVE_EIP170_RUNTIME_LIMIT');
  return '0x' + code.toString('hex');
}
