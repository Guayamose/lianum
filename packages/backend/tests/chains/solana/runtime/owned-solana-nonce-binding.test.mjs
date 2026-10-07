/** Offline synthetic codec checks only. No native validator or proof run. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, createPrivateKey, createPublicKey, sign } from 'node:crypto';
import { encodeSolanaBindingMessage, validateSolanaBindingTransaction, decodeWireCommitment }
  from '../../../../src/chains/shared/dispatch/native-receipt-binding.mjs';
import { encodeSolanaNonceBindingMessage, validateSolanaNonceBindingMessage,
  validateSolanaNonceBindingTransaction, validateClaimSolanaBindingTransaction,
  decodeSolanaNonceAccountData, encodeSolanaNonceBootstrapMessage,
  validateSolanaNonceBootstrapMessage, validateSolanaNonceBootstrapTransaction }
  from '../../../../src/chains/solana/runtime/owned-solana-nonce-binding.mjs';

const key = byte => createPrivateKey({ key: Buffer.from('302e020100300506032b657004220420' + byte.repeat(32), 'hex'), type: 'pkcs8', format: 'der' });
const pub = privateKey => createPublicKey(privateKey).export({ type: 'spki', format: 'der' }).subarray(-32).toString('hex');
const source = key('01'), nonce = key('02'), payer = key('03');
const ZERO = '00'.repeat(32), K = '55'.repeat(32);
const RECENT = '06a7d517192c568ee08a845f73d29788cf035c3145b21ab344d8062ea9400000';
const RENT = '06a7d517192c5c51218cc94c3d4af17f58daee089ba1fd44e3dbd98a00000000';
const MEMO = '054a535a992921064d24e87160da387c7c35b5ddbc92bb81e41fa8404105448d';
const intent = { sourcePublicKey: pub(source), recipientPublicKey: '33'.repeat(32),
  nonceAccountPublicKey: pub(nonce), durableNonce: '44'.repeat(32), lamports: '12345', wireKeyCommitment: K };
const bootstrap = { payerPublicKey: pub(payer), nonceAccountPublicKey: pub(nonce),
  authorityPublicKey: pub(source), recentBlockhash: '66'.repeat(32), rentLamports: '1447680' };
const wire = (message, keys = [source]) => Buffer.concat([Buffer.from([keys.length]),
  ...keys.map(privateKey => sign(null, message, privateKey)), message]).toString('base64');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');

test('nonce claim uses the exact six-key 330-byte message and 395-byte single signature wire', () => {
  const messageHex = encodeSolanaNonceBindingMessage(intent), message = Buffer.from(messageHex, 'hex');
  const expected = '01000306' + intent.sourcePublicKey + intent.recipientPublicKey + intent.nonceAccountPublicKey
    + ZERO + RECENT + MEMO + intent.durableNonce + '0303030204000404000000'
    + '030200010c020000003930000000000000' + '05010046' + Buffer.from('LNRB2:' + K).toString('hex');
  assert.equal(messageHex, expected); assert.equal(message.length, 330);
  assert.equal(message.subarray(196, 228).toString('hex'), intent.durableNonce);
  assert.equal(message[228], 3); assert.equal(message.readUInt32LE(235), 4);
  assert.equal(message.readUInt32LE(244), 2); assert.equal(message.readBigUInt64LE(248), 12345n);
  assert.equal(message.subarray(260).toString('ascii'), 'LNRB2:' + K);
  const signed = wire(message), decoded = validateSolanaNonceBindingTransaction(signed, intent);
  assert.equal(Buffer.from(signed, 'base64').length, 395);
  assert.deepEqual([decoded.effectIndex, decoded.wireBindingVersion, decoded.wireBindingKind, decoded.wireBindingPosition], ['1', '2', '2', '2']);
  assert.equal(decoded.messageSHA256, sha(message));
  assert.equal(decoded.transactionSHA256, sha(Buffer.from(signed, 'base64')));
  assert.equal(decoded.signatureHex, Buffer.from(signed, 'base64').subarray(1, 65).toString('hex'));
  assert.deepEqual(validateClaimSolanaBindingTransaction(signed, intent), decoded);
  assert.throws(() => validateSolanaBindingTransaction(signed, intent));
  assert.throws(() => decodeWireCommitment(message.subarray(260)));
});

test('every changed message byte, validly signed reordering, extra signer, instruction and trailing byte rejects', () => {
  const message = Buffer.from(encodeSolanaNonceBindingMessage(intent), 'hex');
  for (let i = 0; i < message.length; i++) {
    const changed = Buffer.from(message); changed[i] ^= 1;
    assert.throws(() => validateSolanaNonceBindingMessage(changed.toString('hex'), intent));
  }
  const reorder = Buffer.concat([message.subarray(0, 229), message.subarray(239, 256), message.subarray(229, 239), message.subarray(256)]);
  const versioned = Buffer.concat([Buffer.from([0x80]), message]);
  const advanceOnly = Buffer.concat([message.subarray(0, 228), Buffer.from([1]), message.subarray(229, 239)]);
  for (const changed of [reorder, versioned, advanceOnly, Buffer.concat([message, message.subarray(256)]),
    Buffer.concat([message, Buffer.from([0])]), message.subarray(0, -1)])
    assert.throws(() => validateSolanaNonceBindingTransaction(wire(changed), intent));
  assert.throws(() => validateSolanaNonceBindingTransaction(wire(message, [source, nonce]), intent));
  const signed = Buffer.from(wire(message), 'base64'); signed[1] ^= 1;
  assert.throws(() => validateSolanaNonceBindingTransaction(signed.toString('base64'), intent), /SIGNATURE/);
  signed[1] ^= 1; signed[0] = 0x81;
  assert.throws(() => validateSolanaNonceBindingTransaction(signed.toString('base64'), intent), /SIGNATURE_COUNT/);
  assert.throws(() => validateSolanaNonceBindingTransaction(wire(message) + '\n', intent));
});

test('role aliases, noncanonical fields, out-of-range amount and profile authority reject', () => {
  const keys = [intent.sourcePublicKey, intent.recipientPublicKey, intent.nonceAccountPublicKey, ZERO, RECENT, MEMO];
  for (const field of ['sourcePublicKey', 'recipientPublicKey', 'nonceAccountPublicKey']) {
    for (const value of keys.filter(value => value !== intent[field]))
      assert.throws(() => encodeSolanaNonceBindingMessage({ ...intent, [field]: value }));
  }
  for (const patch of [{ lamports: '0' }, { lamports: '01' }, { lamports: '9007199254740992' },
    { lamports: '1\n' }, { lamports: 1 }, { durableNonce: ZERO }, { wireKeyCommitment: ZERO },
    { wireKeyCommitment: 'AA'.repeat(32) }, { durableNonce: 'a'.repeat(63) + '\n' },
    { recentBlockhash: intent.durableNonce }, { effectIndex: '1' }, { profile: 'nonce' }, { verified: true }])
    assert.throws(() => encodeSolanaNonceBindingMessage({ ...intent, ...patch }));
  assert.doesNotThrow(() => encodeSolanaNonceBindingMessage({ ...intent, lamports: '9007199254740991' }));
  let ran = false; const accessor = { ...intent };
  Object.defineProperty(accessor, 'nonceAccountPublicKey', { enumerable: true, get() { ran = true; return pub(nonce); } });
  assert.throws(() => validateClaimSolanaBindingTransaction(wire(Buffer.from(encodeSolanaNonceBindingMessage(intent), 'hex')), accessor));
  assert.equal(ran, false);
  assert.throws(() => validateClaimSolanaBindingTransaction('', new Proxy(intent, {})));
});

test('claim dispatcher still accepts exact v1 ingress without broadening its memo or shape', () => {
  const v1 = { sourcePublicKey: intent.sourcePublicKey, recipientPublicKey: intent.recipientPublicKey,
    recentBlockhash: intent.durableNonce, lamports: intent.lamports, wireKeyCommitment: K };
  const message = Buffer.from(encodeSolanaBindingMessage(v1), 'hex'), signed = wire(message);
  assert.deepEqual(validateClaimSolanaBindingTransaction(signed, v1), validateSolanaBindingTransaction(signed, v1));
  message[190] = '2'.charCodeAt(0);
  assert.throws(() => validateClaimSolanaBindingTransaction(wire(message), v1));
  assert.throws(() => validateClaimSolanaBindingTransaction(signed, { ...v1, nonceAccountPublicKey: pub(nonce) }));
});

test('nonce data decoder accepts only exact Current Initialized 80-byte data', () => {
  const bytes = Buffer.alloc(80); bytes.writeUInt32LE(1, 0); bytes.writeUInt32LE(1, 4);
  Buffer.from(intent.sourcePublicKey, 'hex').copy(bytes, 8); Buffer.from(intent.durableNonce, 'hex').copy(bytes, 40);
  bytes.writeBigUInt64LE(5000n, 72);
  assert.deepEqual(decodeSolanaNonceAccountData(bytes.toString('hex')), {
    authorityPublicKey: intent.sourcePublicKey, durableNonce: intent.durableNonce, lamportsPerSignature: '5000' });
  for (const [offset, value] of [[0, 0], [0, 2], [4, 0], [4, 2], [1, 1], [5, 1]]) {
    const changed = Buffer.from(bytes); changed[offset] = value;
    assert.throws(() => decodeSolanaNonceAccountData(changed.toString('hex')));
  }
  for (const [start, end] of [[8, 40], [40, 72]]) {
    const changed = Buffer.from(bytes); changed.fill(0, start, end);
    assert.throws(() => decodeSolanaNonceAccountData(changed.toString('hex')));
  }
  for (const value of [bytes.toString('hex') + '00', bytes.subarray(0, 79).toString('hex'), bytes.toString('base64'),
    bytes.toString('hex').toUpperCase(), bytes.toString('hex').slice(0, -1) + '\n', bytes])
    assert.throws(() => decodeSolanaNonceAccountData(value));
  bytes.writeBigUInt64LE(0xffffffffffffffffn, 72);
  assert.equal(decodeSolanaNonceAccountData(bytes.toString('hex')).lamportsPerSignature, '18446744073709551615');
});

test('bootstrap has two exact signers and fixed create-80-byte-system-account then initialize-nonce instructions', () => {
  const messageHex = encodeSolanaNonceBootstrapMessage(bootstrap), message = Buffer.from(messageHex, 'hex');
  const expected = '02000305' + bootstrap.payerPublicKey + bootstrap.nonceAccountPublicKey + ZERO + RECENT + RENT
    + bootstrap.recentBlockhash + '0202020001340000000000171600000000005000000000000000' + ZERO
    + '02030103042406000000' + bootstrap.authorityPublicKey;
  assert.equal(messageHex, expected); assert.equal(message.length, 296);
  const signed = wire(message, [payer, nonce]), result = validateSolanaNonceBootstrapTransaction(signed, bootstrap);
  assert.equal(Buffer.from(signed, 'base64').length, 425);
  assert.equal(result.transactionSHA256, sha(Buffer.from(signed, 'base64')));
  assert.equal(result.signatureHex, Buffer.from(signed, 'base64').subarray(1, 65).toString('hex'));
  for (let i = 0; i < message.length; i++) {
    const changed = Buffer.from(message); changed[i] ^= 1;
    assert.throws(() => validateSolanaNonceBootstrapMessage(changed.toString('hex'), bootstrap));
  }
  for (const signers of [[payer], [nonce, payer], [payer, source], [payer, nonce, source]])
    assert.throws(() => validateSolanaNonceBootstrapTransaction(wire(message, signers), bootstrap));
  for (const offset of [1, 65]) {
    const changed = Buffer.from(signed, 'base64'); changed[offset] ^= 1;
    assert.throws(() => validateSolanaNonceBootstrapTransaction(changed.toString('base64'), bootstrap), /SIGNATURE/);
  }
  for (const patch of [{ payerPublicKey: bootstrap.nonceAccountPublicKey }, { nonceAccountPublicKey: RENT },
    { rentLamports: '0' }, { rentLamports: '9007199254740992' }, { space: '80' }, { initialized: true }])
    assert.throws(() => encodeSolanaNonceBootstrapMessage({ ...bootstrap, ...patch }));
});
