/** Pure original signed TRX wire binding. No signer, RPC, runtime, clock or
 * broadcast. Recovered owner-address equality is NOT current account permission
 * authorization, TAPOS/head validity, inclusion, finality or graph authority. */
import { createHash } from 'node:crypto';
import { recoverSecp256k1Sender } from '../../evm/contracts/transaction-wire-codec.mjs';
import { fields, need, freeze } from '../../shared/portfolio/portfolio-registry.mjs';

export const TRON_TRANSFER_WIRE_PROFILE = 'flat-tron-original-transfer-wire/1';
export const TRON_TRANSFER_WIRE_LIMITS = Object.freeze({ transactionBytes: 512,
  rawDataBytes: 256, contractBytes: 192, parameterBytes: 160, transferBytes: 96 });
const TYPE_URL = Buffer.from('type.googleapis.com/protocol.TransferContract', 'ascii');
const MAX_INT63 = (1n << 63n) - 1n;
const ORDER = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const asHex = bytes => bytes.toString('hex');

function hex(value, width, code, nonzero = false) {
  need(typeof value === 'string' && value.length === width * 2
    && /^[0-9a-f]+$/.exec(value)?.[0] === value && (!nonzero || /[1-9a-f]/.test(value)), code);
  return value;
}
function positiveDecimal(value) {
  need(typeof value === 'string' && value.length <= 19 && /^[1-9][0-9]*$/.exec(value)?.[0] === value,
    'TRON_TRANSFER_EXPECTED_INTEGER');
  need(BigInt(value) <= MAX_INT63, 'TRON_TRANSFER_EXPECTED_INTEGER');
  return value;
}

/** A deliberately narrower profile than general protobuf: sorted unique fields,
 * shortest varints, exact allowed wire types, bounded lengths, no unknowns.
 * Fixed caller-defined schemas provide the only nesting; input cannot recurse. */
function record(bytes, schema, maximum) {
  need(bytes.length > 0 && bytes.length <= maximum, 'TRON_TRANSFER_MESSAGE_BOUND');
  let cursor = 0, previous = 0;
  const values = new Map();
  const varint = () => {
    let value = 0n;
    for (let index = 0; index < 10; index++) {
      need(cursor < bytes.length, 'TRON_TRANSFER_VARINT_TRUNCATED');
      const byte = bytes[cursor++];
      need(index !== 9 || byte <= 1, 'TRON_TRANSFER_VARINT_OVERFLOW');
      value |= BigInt(byte & 127) << BigInt(index * 7);
      if (!(byte & 128)) {
        need(index === 0 || byte !== 0, 'TRON_TRANSFER_VARINT_NONMINIMAL');
        return value;
      }
    }
    need(false, 'TRON_TRANSFER_VARINT_OVERFLOW');
  };
  while (cursor < bytes.length) {
    const tag = varint();
    need(tag > 0n && tag <= 0xffffffffn, 'TRON_TRANSFER_FIELD_TAG');
    const number = Number(tag >> 3n), wireType = Number(tag & 7n);
    need(number > previous, 'TRON_TRANSFER_FIELD_ORDER_OR_DUPLICATE');
    const definition = schema.get(number);
    need(definition && wireType === definition.type, 'TRON_TRANSFER_UNSUPPORTED_FIELD');
    previous = number;
    let value;
    if (wireType === 0) value = varint();
    else {
      const length = varint();
      need(length <= BigInt(bytes.length - cursor), 'TRON_TRANSFER_BYTES_TRUNCATED');
      value = bytes.subarray(cursor, cursor + Number(length)); cursor += Number(length);
    }
    values.set(number, value);
  }
  for (const [number, definition] of schema)
    need(definition.optional || values.has(number), 'TRON_TRANSFER_MISSING_FIELD');
  return values;
}
const schema = entries => new Map(entries.map(([number, type, optional = false]) => [number, { type, optional }]));
const TRANSACTION = schema([[1, 2], [2, 2]]);
const RAW = schema([[1, 2], [4, 2], [8, 0], [10, 2, true], [11, 2], [14, 0]]);
const CONTRACT = schema([[1, 0], [2, 2]]); // Permission_id defaults to 0; explicit zero is excluded.
const ANY = schema([[1, 2], [2, 2]]);
const TRANSFER = schema([[1, 2], [2, 2], [3, 0]]);

/** Bare lowercase hex only. Original protobuf bytes are hashed directly; no JSON
 * conversion, normalization or reserialization may substitute for raw_data. */
export function decodeTronNativeTransferWire(nativeWire) {
  need(typeof nativeWire === 'string' && nativeWire.length > 0
    && nativeWire.length <= 2 * TRON_TRANSFER_WIRE_LIMITS.transactionBytes
    && /^(?:[0-9a-f]{2})+$/.exec(nativeWire)?.[0] === nativeWire, 'TRON_TRANSFER_WIRE');
  const wire = Buffer.from(nativeWire, 'hex');
  const transaction = record(wire, TRANSACTION, TRON_TRANSFER_WIRE_LIMITS.transactionBytes);
  const rawBytes = transaction.get(1), signatureBytes = transaction.get(2);
  need(signatureBytes.length === 65, 'TRON_TRANSFER_SIGNATURE_LENGTH');
  const raw = record(rawBytes, RAW, TRON_TRANSFER_WIRE_LIMITS.rawDataBytes);
  const contract = record(raw.get(11), CONTRACT, TRON_TRANSFER_WIRE_LIMITS.contractBytes);
  need(contract.get(1) === 1n, 'TRON_TRANSFER_CONTRACT_TYPE');
  const parameter = record(contract.get(2), ANY, TRON_TRANSFER_WIRE_LIMITS.parameterBytes);
  need(parameter.get(1).equals(TYPE_URL), 'TRON_TRANSFER_TYPE_URL');
  const transfer = record(parameter.get(2), TRANSFER, TRON_TRANSFER_WIRE_LIMITS.transferBytes);
  const owner = transfer.get(1), recipient = transfer.get(2), amount = transfer.get(3);
  need(owner.length === 21 && recipient.length === 21 && owner[0] === 0x41 && recipient[0] === 0x41,
    'TRON_TRANSFER_ADDRESS');
  need(!owner.equals(recipient), 'TRON_TRANSFER_SELF_TRANSFER');
  need(amount > 0n && amount <= MAX_INT63, 'TRON_TRANSFER_AMOUNT');
  need(raw.get(1).length === 2 && raw.get(4).length === 8, 'TRON_TRANSFER_TAPOS_LENGTH');
  const timestamp = raw.get(14), expiration = raw.get(8);
  // This ordering/required timestamp is our profile, not a Tron inclusion rule.
  // Neither value is checked against a chain head or the current wall clock.
  need(timestamp > 0n && expiration > timestamp && expiration <= MAX_INT63,
    'TRON_TRANSFER_TIME_PROFILE');
  const memo = raw.get(10);
  need(memo === undefined || (memo.length === 32 && memo.some(byte => byte !== 0)), 'TRON_TRANSFER_MEMO');
  const nativeId = sha(rawBytes), r = asHex(signatureBytes.subarray(0, 32));
  const s = asHex(signatureBytes.subarray(32, 64)), v = signatureBytes[64];
  need(v <= 1 && BigInt('0x' + r) > 0n && BigInt('0x' + r) < ORDER
    && BigInt('0x' + s) > 0n && BigInt('0x' + s) <= ORDER / 2n, 'TRON_TRANSFER_SIGNATURE_PROFILE');
  let signerAddress;
  try {
    // Existing public primitive computes Keccak-256(uncompressed public key
    // without 04), then its final 20 bytes. Tron adds 41, never a chain ID.
    signerAddress = '41' + recoverSecp256k1Sender({ digest: nativeId, r, s, parity: v }).slice(2);
  } catch { need(false, 'TRON_TRANSFER_SIGNATURE_INVALID'); }
  need(signerAddress === asHex(owner), 'TRON_TRANSFER_SIGNATURE_OWNER');
  return freeze({ schema: TRON_TRANSFER_WIRE_PROFILE, nativeWire, rawDataHex: asHex(rawBytes), nativeId,
    transactionSHA256: sha(wire), ownerAddress: asHex(owner), recipientAddress: asHex(recipient),
    amountSun: amount.toString(), refBlockBytes: asHex(raw.get(1)), refBlockHash: asHex(raw.get(4)),
    timestampMs: timestamp.toString(), expirationMs: expiration.toString(), permissionId: '0',
    wireKeyCommitment: memo === undefined ? null : asHex(memo),
    signature: { r, s, v: String(v), signerAddress },
    assurance: 'signed-owner-address-binding-only', accountPermissionVerified: false,
    taposVerified: false, expirationVerified: false, genesisVerified: false, inclusionVerified: false,
    finalityVerified: false, deliveryVerified: false, graphAdmissionEligible: false,
    creditEligible: false, privateSpendableAtomic: null });
}

const EXPECTED_FIELDS = ['nativeId', 'transactionSHA256', 'ownerAddress', 'recipientAddress',
  'amountSun', 'refBlockBytes', 'refBlockHash', 'timestampMs', 'expirationMs', 'wireKeyCommitment'];

/** Caller-provided expectations constrain original identity; they do not attest
 * provenance. nativeId identifies raw_data; transactionSHA256 additionally pins
 * the signed envelope. Signature changes must NEVER create a new native effect. */
export function bindOriginalTronNativeTransfer(raw) {
  const original = fields(raw, ['nativeWire', 'expected'], [], true);
  const expected = fields(original.expected, EXPECTED_FIELDS, [], true);
  for (const key of ['nativeId', 'transactionSHA256']) hex(expected[key], 32, 'TRON_TRANSFER_EXPECTED_HASH');
  for (const key of ['ownerAddress', 'recipientAddress']) {
    hex(expected[key], 21, 'TRON_TRANSFER_EXPECTED_ADDRESS');
    need(expected[key].startsWith('41'), 'TRON_TRANSFER_EXPECTED_ADDRESS');
  }
  for (const key of ['amountSun', 'timestampMs', 'expirationMs']) positiveDecimal(expected[key]);
  hex(expected.refBlockBytes, 2, 'TRON_TRANSFER_EXPECTED_TAPOS');
  hex(expected.refBlockHash, 8, 'TRON_TRANSFER_EXPECTED_TAPOS');
  if (expected.wireKeyCommitment !== null) hex(expected.wireKeyCommitment, 32, 'TRON_TRANSFER_EXPECTED_MEMO', true);
  const signed = decodeTronNativeTransferWire(original.nativeWire);
  need(signed.nativeId === expected.nativeId && signed.transactionSHA256 === expected.transactionSHA256,
    'TRON_TRANSFER_ORIGINAL_IDENTITY');
  for (const key of EXPECTED_FIELDS.slice(2)) need(signed[key] === expected[key], 'TRON_TRANSFER_ORIGINAL_INTENT');
  return freeze({ signed });
}
