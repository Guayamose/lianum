/** Exact PC23/D26/D27/W39 byte framing, without Node, signing or authority.
 * SHA256 and entropy are supplied only by the fixed Expo caller, not here.
 * A matching commitment proves an opening, never funding or availability. */
const fail = () => { throw new Error('MOBILE_LOCAL_NOTE_ENCODING_INVALID'); };
export function localNoteHexBytesV1(value, width = 32) {
  if (typeof value !== 'string' || value.length !== width * 2 || !/^[0-9a-f]+$/.test(value)) fail();
  return Uint8Array.from(value.match(/../g), byte => Number.parseInt(byte, 16));
}
export function localNoteUintBytesV1(value, width = 8) {
  if (typeof value !== 'string' || value.length > 20 || !/^(0|[1-9][0-9]*)$/.test(value)) fail();
  const number = BigInt(value);
  if (number.toString() !== value || number >= 1n << BigInt(width * 8)) fail();
  return localNoteHexBytesV1(number.toString(16).padStart(width * 2, '0'), width);
}
const lengthBytes = (value, width) => localNoteUintBytesV1(String(value), width);
const join = parts => {
  const result = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0; for (const part of parts) { result.set(part, offset); offset += part.length; }
  return result;
};
function exact(value, fields) {
  if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype
    || Reflect.ownKeys(value).length !== fields.length) fail();
  for (const field of fields) {
    const descriptor = Object.getOwnPropertyDescriptor(value, field);
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) fail();
  }
}
function framed(tag, fields, tagWidth = 2) {
  const ascii = Uint8Array.from(tag, character => character.charCodeAt(0));
  return join([lengthBytes(ascii.length, tagWidth), ascii,
    ...fields.flatMap(field => [lengthBytes(field.length, 4), field])]);
}
export function localBalanceCommitmentMessageV1(scope, policy, note) {
  exact(note, ['type', 'rho', 'x', 'y', 'value', 'secret']);
  if (note.type !== 4 || BigInt(note.value) <= 0n) fail();
  return framed('PC23/balance-note/1', [localNoteHexBytesV1(scope), localNoteHexBytesV1(policy),
    new Uint8Array([4]), ...['rho', 'x', 'y'].map(field => localNoteHexBytesV1(note[field])),
    localNoteUintBytesV1(note.value), localNoteHexBytesV1(note.secret)]);
}
export function localBalanceDepositMessageV1(statement) {
  exact(statement, ['scope', 'policy', 'epoch', 'amount', 'output']);
  if (BigInt(statement.amount) <= 0n) fail();
  return framed('PC23/balance-deposit/1', [localNoteHexBytesV1(statement.scope), localNoteHexBytesV1(statement.policy),
    localNoteUintBytesV1(statement.epoch), localNoteUintBytesV1(statement.amount), localNoteHexBytesV1(statement.output)]);
}
export function localBalanceWithdrawalMessageV1(statement) {
  exact(statement, ['scope', 'policy', 'commitment', 'recipient', 'amount', 'epoch']);
  if (BigInt(statement.amount) <= 0n || statement.recipient === '0'.repeat(40)) fail();
  return framed('PC23/balance-withdraw/1', [localNoteHexBytesV1(statement.scope), localNoteHexBytesV1(statement.policy),
    localNoteHexBytesV1(statement.commitment), localNoteHexBytesV1(statement.recipient, 20),
    localNoteUintBytesV1(statement.amount), localNoteUintBytesV1(statement.epoch)]);
}
export function localDepositIntentMessageV1(statement) {
  exact(statement, ['scope', 'policy', 'validFrom', 'validUntil', 'amount', 'output']);
  if (BigInt(statement.validFrom) >= BigInt(statement.validUntil) || BigInt(statement.amount) <= 0n) fail();
  return framed('LIANUM/PAEG/deposit-intent/1', [localNoteHexBytesV1(statement.scope), localNoteHexBytesV1(statement.policy),
    localNoteUintBytesV1(statement.validFrom), localNoteUintBytesV1(statement.validUntil),
    localNoteUintBytesV1(statement.amount), localNoteHexBytesV1(statement.output)], 4);
}
