/** Exact D26/D27 public terms derived from the original local PC23 opening.
 * Encoding only: objects returned here grant no biometric/custody authority.
 * Scope/policy/amount/output cannot be supplied separately from the note.
 * Pool/recipient are retained local context; the original deposit frames do
 * not add fields absent from their circuit. Note state remains UNISSUED. */
import { localNoteHexBytesV1, localNoteUintBytesV1,
  localBalanceDepositMessageV1, localDepositIntentMessageV1 } from './balance-note-codec-v1.mjs';
const fail = () => { throw new Error('MOBILE_LOCAL_DEPOSIT_TERMS_INVALID'); };
function exact(value, keys) {
  if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype
    || Reflect.ownKeys(value).length !== keys.length) fail();
  for (const key of keys) {
    const field = Object.getOwnPropertyDescriptor(value, key);
    if (!field?.enumerable || !Object.hasOwn(field, 'value')) fail();
  }
}
export function normalizeLocalDepositChoiceV1(input) {
  if (!input || typeof input !== 'object' || Object.getPrototypeOf(input) !== Object.prototype) fail();
  const descriptor = Object.getOwnPropertyDescriptor(input, 'relation');
  if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) fail();
  if (descriptor.value === 'D26') {
    exact(input, ['relation', 'epoch']); localNoteUintBytesV1(input.epoch);
    return Object.freeze({ relation: 'D26', epoch: input.epoch });
  }
  if (descriptor.value === 'D27') {
    exact(input, ['relation', 'validFrom', 'validUntil']);
    localNoteUintBytesV1(input.validFrom); localNoteUintBytesV1(input.validUntil);
    if (BigInt(input.validFrom) >= BigInt(input.validUntil)) fail();
    return Object.freeze({ relation: 'D27', validFrom: input.validFrom, validUntil: input.validUntil });
  }
  return fail();
}
export function localUnissuedDepositStatementV1(note, input) {
  exact(note, ['scope', 'policy', 'pool', 'recipient', 'commitment', 'amount',
    'status', 'availableBalance', 'nativeEffectsEstablished']);
  if (note.status !== 'UNISSUED' || note.availableBalance !== null || note.nativeEffectsEstablished !== false) fail();
  for (const key of ['scope', 'policy', 'commitment']) localNoteHexBytesV1(note[key]);
  for (const key of ['pool', 'recipient']) localNoteHexBytesV1(note[key], 20);
  localNoteUintBytesV1(note.amount);
  if (BigInt(note.amount) <= 0n || note.commitment === '0'.repeat(64)
    || note.pool === '0'.repeat(40) || note.recipient === '0'.repeat(40) || note.pool === note.recipient) fail();
  const choice = normalizeLocalDepositChoiceV1(input);
  const bound = { scope: note.scope, policy: note.policy, amount: note.amount, output: note.commitment };
  const statement = choice.relation === 'D26' ? { ...bound, epoch: choice.epoch }
    : { ...bound, validFrom: choice.validFrom, validUntil: choice.validUntil };
  // Encoding performs the original canonical decimal/window/field checks.
  if (choice.relation === 'D26') localBalanceDepositMessageV1(statement);
  else localDepositIntentMessageV1(statement);
  return Object.freeze(statement);
}
export function localUnissuedDepositFrameV1(note, choice) {
  const normalized = normalizeLocalDepositChoiceV1(choice);
  const statement = localUnissuedDepositStatementV1(note, normalized);
  return normalized.relation === 'D26' ? localBalanceDepositMessageV1(statement)
    : localDepositIntentMessageV1(statement);
}
