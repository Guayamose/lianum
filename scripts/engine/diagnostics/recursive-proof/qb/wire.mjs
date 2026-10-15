import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

const commonLeg = [['version', 2], ['salt', 32], ['scope', 32], ['role', 1], ['branch', 1], ['chainDomain', 32]];
const tailLeg = [['amount', 8], ['nativeFeeCap', 8], ['payoutValue', 8], ['executeBy', 8], ['claimBy', 8], ['attempt', 32], ['policy', 32]];
export const schemas = {
  menu: { tag: 'PC5-QB/menu/1', fields: [['version', 2], ['scope', 32], ['session', 32], ['menuSalt', 32], ['quote', 56], ['outcomes', 16], ['sDescriptor', 136], ['bDescriptor', 124], ['timing', 16], ['resultSaltCommitment', 32], ['topology', 1]] },
  legS: { tag: 'PC5-QB/leg-s/1', fields: [...commonLeg, ['recipient', 32], ...tailLeg, ['resultSaltCommitment', 32]] },
  legB: { tag: 'PC5-QB/leg-b/1', fields: [...commonLeg, ['recipientProgram', 20], ...tailLeg, ['parentRule', 1], ['parentConstraint', 32]] },
  resultSalt: { tag: 'PC5-QB/result-salt/1', fields: [['resultSalt', 32]] },
  statement: { tag: 'PC5-QB/statement/1', fields: [['version', 2], ['scope', 32], ['session', 32], ['branch', 1], ['menuBinding', 32], ['C_S', 32], ['C_B', 32]] },
};
for (const schema of Object.values(schemas)) {
  const tag = Buffer.from(schema.tag, 'ascii'), header = Buffer.alloc(2); header.writeUInt16BE(tag.length);
  schema.prefix = Buffer.concat([header, tag]); schema.offsets = {};
  let cursor = schema.prefix.length;
  for (const [name, length] of schema.fields) { schema.offsets[name] = cursor + 4; cursor += 4 + length; }
  schema.length = cursor;
}
export const version = Buffer.from([0, 1]);
export const H = bytes => createHash('sha256').update(bytes).digest();
export function u64(value) {
  assert.equal(typeof value, 'bigint'); assert.ok(value >= 0n && value <= 0xffffffffffffffffn);
  const bytes = Buffer.alloc(8); bytes.writeBigUInt64BE(value); return bytes;
}
export function encode(name, fields) {
  const schema = schemas[name]; assert.ok(schema, 'Unknown schema');
  assert.deepEqual(Object.keys(fields).sort(), schema.fields.map(([key]) => key).sort(), 'Exact field set required');
  assert.equal(Object.getOwnPropertySymbols(fields).length, 0);
  const parts = [schema.prefix];
  for (const [key, size] of schema.fields) {
    assert.ok(fields[key] instanceof Uint8Array, key); assert.equal(fields[key].length, size, key);
    const length = Buffer.alloc(4); length.writeUInt32BE(size); parts.push(length, fields[key]);
  }
  const bytes = Buffer.concat(parts); decode(name, bytes); return bytes;
}
export function decode(name, input) {
  const schema = schemas[name]; assert.ok(schema, 'Unknown schema');
  assert.ok(input instanceof Uint8Array); const bytes = Buffer.from(input);
  assert.equal(bytes.length, schema.length, 'Exact wire length required');
  assert.deepEqual(bytes.subarray(0, schema.prefix.length), schema.prefix, 'Exact tag required');
  const fields = {};
  for (const [key, length] of schema.fields) {
    const offset = schema.offsets[key]; assert.equal(bytes.readUInt32BE(offset - 4), length, key + ' length');
    fields[key] = Buffer.from(bytes.subarray(offset, offset + length));
  }
  if (fields.version) assert.deepEqual(fields.version, version, 'Unsupported version');
  if (fields.branch) assert.ok(fields.branch[0] === 0 || fields.branch[0] === 1, 'Unsupported branch');
  if (name === 'menu') assert.equal(fields.topology[0], 1, 'Unsupported topology');
  if (name === 'legS') assert.equal(fields.role[0], 1, 'Wrong S role');
  if (name === 'legB') { assert.equal(fields.role[0], 2, 'Wrong B role'); assert.equal(fields.parentRule[0], 1, 'Wrong parent rule'); }
  return fields;
}
export function amounts(menu, branch) {
  assert.ok(branch === 0 || branch === 1);
  const [B, FS, FB, pS, qS, pB, qB] = Array.from({ length: 7 }, (_, i) => menu.quote.readBigUInt64BE(8 * i));
  const S = menu.outcomes.readBigUInt64BE(branch * 8);
  assert.ok(B > 0n && pS > 0n && qS > 0n && pB > 0n && qB > 0n);
  const numerator = S * pS, cost = numerator / qS + (numerator % qS ? 1n : 0n);
  assert.ok(cost <= 0xffffffffffffffffn && FS + FB + cost <= B);
  const K = (B - FS - FB - cost) * qB / pB, PS = cost + FS, PB = B - PS;
  assert.ok(K > 0n && K <= 0xffffffffffffffffn); return { S, K, PS, PB, cost };
}
export function publicInputs(statementBytes) {
  const s = decode('statement', statementBytes);
  return [...s.scope, ...s.session, s.branch[0], ...s.menuBinding, ...s.C_S, ...s.C_B].map(n => '0x' + n.toString(16).padStart(64, '0'));
}
export function witness(menuBytes, legSBytes, legBBytes, resultSalt, statementBytes) {
  const s = decode('statement', statementBytes);
  return { menu_bytes: [...menuBytes], leg_s: [...legSBytes], leg_b: [...legBBytes], result_salt: [...resultSalt], scope: [...s.scope], session: [...s.session], branch: s.branch[0], menu_binding: [...s.menuBinding], c_s: [...s.C_S], c_b: [...s.C_B] };
}
