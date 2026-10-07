/** Offline codec tests with synthetic keys/facts. No native process or proof. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, createPrivateKey, createPublicKey, sign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import * as binding from './native-receipt-binding.mjs';
import * as original from '../../../../src/framing.mjs';
import { canonicalNativeEffectId, nativeEffectToNoir }
  from '../../../../../omnichain-product/src/paeg/native-receipt.mjs';
import { nativeAdmissionRuleCommitment, nativeAdmissionChainDomain }
  from '../../../../../omnichain-product/src/paeg/native-admission.mjs';

const ZERO = '0'.repeat(64);
const hash = label => createHash('sha256').update('SYNTHETIC-BINDING/' + label).digest('hex');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const namespace = '11'.repeat(32), secret = '22'.repeat(32);
const K = binding.receiptKeyCommitment({ ledgerNamespace: namespace, secret });
const publicKey = '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798';
const keyHash = createHash('ripemd160').update(createHash('sha256').update(Buffer.from(publicKey, 'hex')).digest()).digest('hex');
const btc = { sourceTxid: '01'.repeat(32), sourceVout: '2', sourceScript: '0014' + keyHash,
  sourceSatoshi: '100000', recipientScript: '0014' + '11'.repeat(20), amountSatoshi: '12345',
  changeScript: '0014' + '22'.repeat(20), feeSatoshi: '200', wireKeyCommitment: K };
const edPrivate = createPrivateKey({ key: Buffer.from('302e020100300506032b657004220420' + '01'.repeat(32), 'hex'), type: 'pkcs8', format: 'der' });
const sol = { sourcePublicKey: createPublicKey(edPrivate).export({ format: 'der', type: 'spki' }).subarray(-32).toString('hex'),
  recipientPublicKey: '33'.repeat(32), recentBlockhash: '44'.repeat(32), lamports: '12345', wireKeyCommitment: K };
const mutateHex = (value, offset, byte) => { const bytes = Buffer.from(value, 'hex'); bytes[offset] = byte; return bytes.toString('hex'); };
const copy = value => structuredClone(value);
// The immutable original encoder deliberately accepts BTC/SOL only. Use its
// unchanged schema as an independent field-order/width oracle for EVM bytes.
function originalSchemaFactsFrame(facts) {
  const encodeRecord = (schema, value) => schema.flatMap(([name, type]) => {
    if (Array.isArray(type)) { assert.equal(type[0], 'record'); return encodeRecord(type[1], value[name]); }
    if (type === 'digest' || type === 'bytes64') return [Buffer.from(value[name], 'hex')];
    assert.match(type, /^u(8|32|64|128)$/);
    return [Buffer.from(BigInt(value[name]).toString(16).padStart(Number(type.slice(1)) / 4, '0'), 'hex')];
  });
  return Buffer.concat([Buffer.from(original.TAGS.facts), Buffer.from(original.FACTS_SCHEMA),
    ...encodeRecord(original.SCHEMAS.facts, facts)].flatMap(part => {
    const length = Buffer.alloc(4); length.writeUInt32BE(part.length); return [length, part];
  }));
}

test('fixed namespace/K/N/payload vectors match immutable original framing', () => {
  const input = { ledgerNamespace: namespace, secret };
  assert.equal(K, 'c34a1b8d8e9a92cf3a10d0194f7f42974aa797fabc5e4f13c6ad34c8d2ae2d93');
  assert.equal(K, original.receiptKeyCommitment(input));
  const nul = { ...input, nativeGid: hash('gid') };
  assert.equal(binding.nativeAdmissionNullifier(nul), original.nativeAdmissionNullifier(nul));
  assert.notEqual(binding.nativeAdmissionNullifier(nul), K);
  assert.notEqual(binding.nativeAdmissionNullifier({ ...nul, nativeGid: hash('gid2') }), binding.nativeAdmissionNullifier(nul));
  assert.deepEqual(binding.encodeWireCommitment(K), original.encodeWireCommitment(K));
  assert.equal(binding.decodeWireCommitment(Buffer.from('LNRB1:' + K)), K);
  binding.assertReceiptKeyBinding({ ...input, wireKeyCommitment: K });
  assert.throws(() => binding.assertReceiptKeyBinding({ ...input, ledgerNamespace: hash('different-namespace'), wireKeyCommitment: K }));
  for (const payload of ['LNRB1:' + K.toUpperCase(), 'LNRB1:' + ZERO, 'LNRB1:' + K + '\n', 'LNRB2:' + K])
    assert.throws(() => binding.decodeWireCommitment(Buffer.from(payload)));
  const highBit = binding.encodeWireCommitment(K); highBit[0] |= 0x80;
  assert.throws(() => binding.decodeWireCommitment(highBit));
});

test('BTC exact three-output unsigned bytes and signed witness envelope', () => {
  const raw = binding.encodeBitcoinBinding(btc);
  const expected = '0200000001' + btc.sourceTxid + '0200000000feffffff03'
    + '393000000000000016' + btc.recipientScript
    + '9f5501000000000016' + btc.changeScript
    + '0000000000000000486a46' + Buffer.from('LNRB1:' + K).toString('hex') + '00000000';
  assert.equal(raw, expected);
  const decoded = binding.validateBitcoinBinding(raw, btc);
  assert.equal(Buffer.from(raw, 'hex').length, 194);
  assert.equal(decoded.txid, decoded.wtxid);
  assert.equal(decoded.containsWitness, false);
  assert.equal(decoded.wireBindingPosition, '2');
  assert.equal(decoded.wireKeyCommitment, K);
  // Deliberately synthetic DER (r=s=1): this tests grammar, not ECDSA validity.
  const signed = raw.slice(0, 8) + '0001' + raw.slice(8, -8)
    + '020930060201010201010121' + publicKey + raw.slice(-8);
  const signedResult = binding.validateBitcoinBinding(signed, btc);
  assert.equal(signedResult.unsignedTransaction, raw);
  assert.equal(signedResult.txid, decoded.txid);
  assert.notEqual(signedResult.wtxid, signedResult.txid);
  assert.match(signedResult.assurance, /no-ecdsa/);
  assert.throws(() => binding.validateBitcoinBinding(signed.replace('300602010102010101', '300602010102010102'), btc));
});

test('BTC wrong order, amount, commitment, extra outputs and nonminimal scripts reject', () => {
  const raw = binding.encodeBitcoinBinding(btc), bytes = Buffer.from(raw, 'hex');
  const bad = [mutateHex(raw, 0, 3), mutateHex(raw, 42, 0), mutateHex(raw, 46, 4),
    mutateHex(raw, 47, 0), mutateHex(raw, 109, 1), mutateHex(raw, 119, 0x45),
    mutateHex(raw, 120, 0x58), raw + '00', raw.slice(0, -2)];
  bad.push(Buffer.concat([bytes.subarray(0, 47), bytes.subarray(78, 109), bytes.subarray(47, 78), bytes.subarray(109)]).toString('hex'));
  bad.push(Buffer.concat([bytes.subarray(0, 117), Buffer.from([73, 0x6a, 0x4c, 70]), bytes.subarray(120)]).toString('hex'));
  for (const value of bad) assert.throws(() => binding.validateBitcoinBinding(value, btc));
  for (const patch of [{ feeSatoshi: '0' }, { feeSatoshi: '10001' }, { amountSatoshi: '1000000001' },
    { sourceSatoshi: '12545' }, { sourceVout: '-0' }, { amountSatoshi: 12345 },
    { recipientScript: btc.changeScript }, { wireKeyCommitment: ZERO }, { authorized: true }])
    assert.throws(() => binding.encodeBitcoinBinding({ ...btc, ...patch }));
});

test('SOL exact transfer plus signer Memo is 256-byte message / 321-byte wire', () => {
  const messageHex = binding.encodeSolanaBindingMessage(sol), message = Buffer.from(messageHex, 'hex');
  assert.equal(message.length, 256);
  assert.equal(message.subarray(0, 4).toString('hex'), '01000204');
  assert.equal(message.subarray(164, 174).toString('hex'), '02020200010c02000000');
  assert.equal(message.subarray(182, 186).toString('hex'), '03010046');
  assert.equal(message.subarray(186).toString('ascii'), 'LNRB1:' + K);
  assert.equal(binding.validateSolanaBindingMessage(messageHex, sol).messageSHA256, sha(message));
  const wire = Buffer.concat([Buffer.from([1]), sign(null, message, edPrivate), message]);
  assert.equal(wire.length, 321);
  const result = binding.validateSolanaBindingTransaction(wire.toString('base64'), sol);
  assert.equal(result.signatureHex.length, 128);
  assert.equal(result.transactionSHA256, sha(wire));
  const altered = Buffer.from(wire); altered[1] ^= 1;
  assert.throws(() => binding.validateSolanaBindingTransaction(altered.toString('base64'), sol));
  assert.throws(() => binding.validateSolanaBindingTransaction(wire.toString('base64') + '\n', sol));
});

test('SOL program/order/account/instruction/amount and trailing-byte substitutions reject', () => {
  const raw = binding.encodeSolanaBindingMessage(sol), bytes = Buffer.from(raw, 'hex');
  const bad = [mutateHex(raw, 0, 0x81), mutateHex(raw, 3, 3), mutateHex(raw, 100, 0),
    mutateHex(raw, 164, 3), mutateHex(raw, 165, 3), mutateHex(raw, 168, 0),
    mutateHex(raw, 174, 0), mutateHex(raw, 182, 2), mutateHex(raw, 183, 0),
    mutateHex(raw, 184, 1), mutateHex(raw, 185, 69), raw + '00', raw.slice(0, -2)];
  bad.push(Buffer.concat([bytes.subarray(0, 165), bytes.subarray(182), bytes.subarray(165, 182)]).toString('hex'));
  bad.push(Buffer.concat([bytes, bytes.subarray(182)]).toString('hex'));
  for (const value of bad) assert.throws(() => binding.validateSolanaBindingMessage(value, sol));
  for (const patch of [{ lamports: '0' }, { lamports: '9007199254740992' }, { lamports: '01' },
    { recipientPublicKey: sol.sourcePublicKey }, { recentBlockhash: ZERO }, { instructions: [] }, { verified: true }])
    assert.throws(() => binding.encodeSolanaBindingMessage({ ...sol, ...patch }));
});

test('Memo requirement matches exact existing official ELF and rejects forged metadata/code', () => {
  const elf = readFileSync(new URL('../../../../../omnichain-product/.local/agave-linux-bounded-build/derived/agave-2.3.13-loopback-memtable-128m/program-test/src/programs/spl_memo-3.0.0.so', import.meta.url));
  const snapshot = { address: binding.MEMO_PROGRAM.address, owner: binding.MEMO_PROGRAM.owner,
    executable: true, dataBase64: elf.toString('base64') };
  assert.equal(sha(elf), binding.MEMO_PROGRAM.codeSHA256);
  binding.assertMemoProgramAccount(snapshot);
  const badElf = Buffer.from(elf); badElf[badElf.length - 1] ^= 1;
  for (const patch of [{ address: 'Memo1UhkJRfHyvLMcVucJwxXeuD728EqVDDwQDxFMNo' },
    { owner: 'BPFLoaderUpgradeab1e11111111111111111111111' }, { executable: false },
    { dataBase64: badElf.toString('base64') }, { dataBase64: elf.toString('base64') + '\n' }, { trusted: true }])
    assert.throws(() => binding.assertMemoProgramAccount({ ...snapshot, ...patch }));
});

function factsFixture(family) {
  const rule = { family, genesis: hash('genesis-' + family), asset: hash('asset-' + family), finalityKind: family,
    minimumConfirmations: family === '1' ? '6' : family === '2' ? '0' : '1', maximumEvidenceLifetime: '3600', maximumClockSkew: '30' };
  const policy = { ledgerNamespace: namespace, hubDomain: hash('hub'), registryCommitment: hash('registry'), rule };
  const observation = { blockId: hash('block'), stateCommitment: hash('temporary'), blockHeight: '50', observedAt: '1000',
    finalityKind: family, confirmations: family === '2' ? '0' : '6', sourceCommitment: hash('source'),
    destinationCommitment: hash('destination'), amount: '12345', custodyKind: '1', custodyCommitment: hash('temporary'),
    evidenceFrom: '1000', evidenceUntil: '4600' };
  const facts = { ledgerNamespace: namespace, hubDomain: policy.hubDomain, registryCommitment: policy.registryCommitment,
    ruleCommitment: binding.nativeRuleCommitment(rule), family, genesis: rule.genesis, asset: rule.asset,
    transactionId: hash('tx0') + (family === '2' ? hash('tx1') : ZERO), effectIndex: '0', nativeGid: hash('temporary'),
    transactionSHA256: hash('wire'), wireBindingVersion: '1', wireBindingKind: family,
    wireBindingPosition: family === '1' ? '2' : family === '2' ? '1' : '0', wireKeyCommitment: K, observation,
    nativeContext: family !== '2' ? { observedTipId: hash('tip'), observedTipHeight: '55', transactionSlot: '0', parentSlot: '0', observedSlot: '0' }
      : { observedTipId: ZERO, observedTipHeight: '0', transactionSlot: '60', parentSlot: '59', observedSlot: '64' } };
  facts.nativeGid = binding.nativeFactIdentity(Object.fromEntries(['family', 'genesis', 'asset', 'transactionId', 'effectIndex'].map(name => [name, facts[name]])));
  const endpoints = { family, genesis: rule.genesis, asset: rule.asset,
    sourceCommitment: observation.sourceCommitment, destinationCommitment: observation.destinationCommitment };
  observation.custodyCommitment = binding.nativeCustodyCommitment(endpoints);
  observation.stateCommitment = binding.nativeObservedEffectCommitment({ ...endpoints, nativeGid: facts.nativeGid,
    blockId: observation.blockId, blockHeight: observation.blockHeight, transactionSHA256: facts.transactionSHA256, amount: observation.amount });
  return { facts, policy };
}

function nonceFactsFixture() {
  const { facts, policy } = factsFixture('2');
  Object.assign(facts, { effectIndex: '1', wireBindingVersion: '2', wireBindingPosition: '2' });
  facts.nativeGid = binding.nativeFactIdentity(Object.fromEntries(['family', 'genesis', 'asset', 'transactionId', 'effectIndex'].map(key => [key, facts[key]])));
  facts.observation.stateCommitment = binding.nativeObservedEffectCommitment({ family: facts.family, genesis: facts.genesis,
    asset: facts.asset, nativeGid: facts.nativeGid, blockId: facts.observation.blockId,
    blockHeight: facts.observation.blockHeight, transactionSHA256: facts.transactionSHA256,
    sourceCommitment: facts.observation.sourceCommitment, destinationCommitment: facts.observation.destinationCommitment,
    amount: facts.observation.amount });
  return { facts, policy };
}

test('claim-only facts accept exactly existing BTC/SOL v1 or the authenticated SOL nonce v2 tuple', () => {
  for (const family of ['1', '2']) {
    const { facts, policy } = factsFixture(family);
    assert.deepEqual(binding.validateNativeClaimFacts(facts, policy), binding.validateNativeFacts(facts, policy));
    assert.deepEqual(binding.encodeNativeClaimFacts(facts, policy), binding.encodeNativeFacts(facts, policy));
    assert.equal(binding.nativeClaimFactsDigest(facts, policy), binding.nativeFactsDigest(facts, policy));
  }
  const { facts, policy } = nonceFactsFixture(), bytes = binding.encodeNativeClaimFacts(facts, policy);
  assert.equal(bytes.length, 829); assert.deepEqual(bytes, originalSchemaFactsFrame(facts));
  assert.equal(binding.nativeClaimFactsDigest(facts, policy), sha(bytes));
  assert.deepEqual(binding.validateNativeClaimFacts(facts, policy), facts);
  const effect = { chainDomain: { chain: 'SOL', genesis: facts.genesis, asset: facts.asset },
    effectIdentity: { transactionId: facts.transactionId, effectIndex: '1' } };
  assert.equal(facts.nativeGid, canonicalNativeEffectId(effect));
  const witness = nativeEffectToNoir(effect);
  assert.equal(witness.effect_index, '1');
  assert.equal(Buffer.from(witness.transaction_id).toString('hex'), facts.transactionId);
  assert.equal(bytes[204], 2); assert.equal(bytes.readUInt32BE(349), 1);
  assert.equal(bytes[429], 2); assert.equal(bytes[434], 2); assert.equal(bytes.readUInt32BE(439), 2);
  for (const generic of [binding.validateNativeFacts, binding.encodeNativeFacts, binding.nativeFactsDigest])
    assert.throws(() => generic(facts, policy));
  const evm = factsFixture('3');
  for (const claim of [binding.validateNativeClaimFacts, binding.encodeNativeClaimFacts, binding.nativeClaimFactsDigest])
    assert.throws(() => claim(evm.facts, evm.policy), /CLAIM_FAMILY/);
});

test('claim facts reject each partial v1/v2 tuple and retain every neutral validation constraint', () => {
  const { facts, policy } = nonceFactsFixture();
  for (const patch of [{ effectIndex: '0' }, { effectIndex: '2' }, { wireBindingVersion: '1' },
    { wireBindingVersion: '3' }, { wireBindingPosition: '1' }, { wireBindingPosition: '3' },
    { wireBindingKind: '1' }, { wireBindingKind: '3' }, { family: '1' }, { family: '3' },
    { nativeGid: hash('wrong-gid') }, { transactionSHA256: hash('wrong-wire') }, { confirmed: true }])
    assert.throws(() => binding.validateNativeClaimFacts({ ...facts, ...patch }, policy));
  for (const alter of [f => { f.observation.amount = '0'; }, f => { f.observation.amount = '9007199254740992'; },
    f => { f.observation.evidenceUntil = '4601'; }, f => { f.nativeContext.parentSlot = '60'; },
    f => { f.nativeContext.observedTipId = hash('bad-tip'); }, f => { f.observation.finalityKind = '1'; },
    f => { f.observation.stateCommitment = hash('bad-state'); }, f => { f.observation.custodyCommitment = hash('bad-custody'); }]) {
    const changed = copy(facts); alter(changed); assert.throws(() => binding.validateNativeClaimFacts(changed, policy));
  }
  for (const family of ['1', '2']) {
    const old = factsFixture(family); old.facts.wireBindingVersion = '2';
    assert.throws(() => binding.validateNativeClaimFacts(old.facts, old.policy));
  }
});

test('facts integer boundary rejects trailing LF and CR aliases', () => {
  for (const suffix of ['\n', '\r']) {
    const { facts, policy } = factsFixture('1');
    facts.observation.observedAt += suffix;
    assert.throws(() => binding.validateNativeFacts(facts, policy));
  }
});

test('BTC/SOL facts frames preserve immutable original field bytes and identity', () => {
  for (const family of ['1', '2']) {
    const { facts, policy } = factsFixture(family);
    assert.deepEqual(binding.encodeNativeFacts(facts, policy), original.encodeNativeFacts(facts));
    assert.equal(binding.encodeNativeFacts(facts, policy).length, 829);
    assert.equal(binding.nativeFactsDigest(facts, policy), original.nativeFactsDigest(facts));
    assert.deepEqual(binding.validateNativeFacts(facts, policy), facts);
    assert.ok(Object.isFrozen(binding.validateNativeFacts(facts, policy).observation));
  }
});

test('EVM facts keep the 829-byte frame and canonical registered family-3 identities', () => {
  const { facts, policy } = factsFixture('3');
  const frame = binding.encodeNativeFacts(facts, policy);
  assert.equal(frame.length, 829);
  assert.deepEqual(frame, originalSchemaFactsFrame(facts));
  assert.equal(binding.nativeFactsDigest(facts, policy), sha(originalSchemaFactsFrame(facts)));
  assert.equal(binding.nativeRuleCommitment(policy.rule), nativeAdmissionRuleCommitment(policy.rule));
  const effect = { chainDomain: { chain: 'EVM', genesis: facts.genesis, asset: facts.asset },
    effectIdentity: { transactionId: facts.transactionId.slice(0, 64), effectIndex: '0' } };
  assert.equal(facts.nativeGid, canonicalNativeEffectId(effect));
  const witness = nativeEffectToNoir(effect);
  assert.equal(witness.family, '3');
  assert.equal(witness.effect_index, '0');
  assert.equal(Buffer.from(witness.transaction_id).toString('hex'), facts.transactionId);
  assert.equal(frame[204], 3);
  assert.equal(frame.subarray(281, 345).toString('hex'), facts.transactionId);
  assert.equal(frame[429], 1); assert.equal(frame[434], 3); assert.equal(frame.readUInt32BE(439), 0);
  assert.equal(frame[579], 3); assert.equal(frame.readUInt32BE(584), 6);
  assert.equal(frame.subarray(749, 781).toString('hex'), facts.nativeContext.observedTipId);
  assert.equal(frame.readBigUInt64BE(785), 55n);
  for (const offset of [797, 809, 821]) assert.equal(frame.readBigUInt64BE(offset), 0n);
  assert.deepEqual(binding.validateNativeFacts(facts, policy), facts);
  assert.ok(Object.isFrozen(binding.validateNativeFacts(facts, policy).nativeContext));
  // Family labels are domain separation, never a BTC/SOL interpretation of EVM.
  for (const family of ['1', '2']) {
    const other = { ...policy.rule, family, finalityKind: family, minimumConfirmations: family === '1' ? '6' : '0' };
    assert.notEqual(nativeAdmissionChainDomain(policy.rule), nativeAdmissionChainDomain(other));
    assert.notEqual(facts.nativeGid, binding.nativeFactIdentity({ family, genesis: facts.genesis,
      asset: facts.asset, transactionId: facts.transactionId, effectIndex: '0' }));
  }
});

test('EVM facts reject framing aliases, wrong finality, padding, and supplied success assertions', () => {
  const { facts, policy } = factsFixture('3');
  const alterations = [f => { f.family = '1'; }, f => { f.family = '2'; }, f => { f.family = '4'; },
    f => { f.wireBindingVersion = '0'; }, f => { f.wireBindingKind = '1'; }, f => { f.wireBindingKind = '2'; },
    f => { f.wireBindingPosition = '1'; }, f => { f.wireBindingPosition = '2'; }, f => { f.effectIndex = '1'; },
    f => { f.transactionId = ZERO + ZERO; }, f => { f.transactionId = f.transactionId.slice(0, 64) + hash('tail'); },
    f => { f.transactionId = f.transactionId.slice(0, 64); }, f => { f.nativeGid = hash('wrong'); },
    f => { f.transactionSHA256 = ZERO; }, f => { f.wireKeyCommitment = ZERO; },
    f => { f.observation.finalityKind = '1'; }, f => { f.observation.finalityKind = '2'; },
    f => { f.observation.confirmations = '0'; }, f => { f.observation.confirmations = '5'; },
    f => { f.nativeContext.observedTipId = ZERO; }, f => { f.nativeContext.observedTipHeight = '49'; },
    f => { f.nativeContext.observedTipHeight = '56'; }, f => { f.nativeContext.transactionSlot = '1'; },
    f => { f.nativeContext.parentSlot = '1'; }, f => { f.nativeContext.observedSlot = '1'; },
    f => { f.observation.sourceCommitment = hash('wrong'); }, f => { f.observation.destinationCommitment = hash('wrong'); },
    f => { f.observation.custodyKind = '3'; }, f => { f.observation.custodyCommitment = hash('wrong'); },
    f => { f.observation.stateCommitment = hash('wrong'); }, f => { f.observation.amount = '0'; },
    f => { f.observation.evidenceUntil = '4599'; }, f => { f.observation.evidenceFrom = '999'; },
    f => { f.observation.verified = true; }, f => { f.verified = true; }, f => { f.success = true; }];
  for (const alter of alterations) { const changed = copy(facts); alter(changed);
    assert.throws(() => binding.validateNativeFacts(changed, policy)); }
  for (const patch of [{ minimumConfirmations: '0' }, { minimumConfirmations: '4294967296' },
    { finalityKind: '1' }, { finalityKind: '2' }, { family: '4', finalityKind: '4', minimumConfirmations: '0' }])
    assert.throws(() => binding.nativeRuleCommitment({ ...policy.rule, ...patch }));
});

test('EVM canonical depth and evidence arithmetic retain u32/u64 bounds, while amount remains u128', () => {
  const { facts, policy } = factsFixture('3');
  for (const [tipHeight, confirmations] of [['50', '1'], ['4294967344', '4294967295']]) {
    const changed = copy(facts); changed.nativeContext.observedTipHeight = tipHeight;
    changed.observation.confirmations = confirmations;
    assert.equal(binding.validateNativeFacts(changed, policy).observation.confirmations, confirmations);
  }
  for (const [tipHeight, confirmations] of [['49', '1'], ['4294967345', '4294967295'],
    ['4294967345', '4294967296'], ['18446744073709551615', '4294967295']]) {
    const changed = copy(facts); changed.nativeContext.observedTipHeight = tipHeight;
    changed.observation.confirmations = confirmations;
    assert.throws(() => binding.validateNativeFacts(changed, policy));
  }
  for (const amount of ['9007199254740992', '18446744073709551615', '340282366920938463463374607431768211455']) {
    const changed = copy(facts); changed.observation.amount = amount;
    changed.observation.stateCommitment = binding.nativeObservedEffectCommitment({ family: '3', genesis: facts.genesis,
      asset: facts.asset, nativeGid: facts.nativeGid, blockId: facts.observation.blockId,
      blockHeight: facts.observation.blockHeight, transactionSHA256: facts.transactionSHA256,
      sourceCommitment: facts.observation.sourceCommitment, destinationCommitment: facts.observation.destinationCommitment, amount });
    assert.equal(binding.validateNativeFacts(changed, policy).observation.amount, amount);
  }
  const amountOverflow = copy(facts); amountOverflow.observation.amount = '340282366920938463463374607431768211456';
  assert.throws(() => binding.validateNativeFacts(amountOverflow, policy));
  const last = copy(facts); last.observation.observedAt = last.observation.evidenceFrom = '18446744073709548015';
  last.observation.evidenceUntil = '18446744073709551615';
  assert.equal(binding.validateNativeFacts(last, policy).observation.evidenceUntil, '18446744073709551615');
  last.observation.observedAt = last.observation.evidenceFrom = '18446744073709548016';
  assert.throws(() => binding.validateNativeFacts(last, policy));
});

test('EVM reattestation changes the fact digest without renewing GID or admission N', () => {
  const { facts, policy } = factsFixture('3');
  const changed = copy(facts);
  changed.observation.blockId = hash('reattested-block');
  changed.observation.observedAt = changed.observation.evidenceFrom = '1001'; changed.observation.evidenceUntil = '4601';
  changed.nativeContext.observedTipId = hash('reattested-tip');
  changed.nativeContext.observedTipHeight = '56'; changed.observation.confirmations = '7';
  changed.observation.stateCommitment = binding.nativeObservedEffectCommitment({ family: '3', genesis: facts.genesis,
    asset: facts.asset, nativeGid: facts.nativeGid, blockId: changed.observation.blockId,
    blockHeight: facts.observation.blockHeight, transactionSHA256: facts.transactionSHA256,
    sourceCommitment: facts.observation.sourceCommitment, destinationCommitment: facts.observation.destinationCommitment,
    amount: facts.observation.amount });
  const checked = binding.validateNativeFacts(changed, policy);
  assert.notEqual(binding.nativeFactsDigest(facts, policy), binding.nativeFactsDigest(checked, policy));
  assert.equal(facts.nativeGid, checked.nativeGid);
  const originalN = binding.nativeAdmissionNullifier({ ledgerNamespace: namespace, secret, nativeGid: facts.nativeGid });
  assert.equal(originalN, binding.nativeAdmissionNullifier({ ledgerNamespace: namespace, secret, nativeGid: checked.nativeGid }));
  const identity = Object.fromEntries(['family', 'genesis', 'asset', 'transactionId', 'effectIndex'].map(key => [key, facts[key]]));
  for (const patch of [{ genesis: hash('other-genesis') }, { asset: hash('other-asset') },
    { transactionId: hash('other-transaction') + ZERO }, { effectIndex: '1' }]) {
    const nativeGid = binding.nativeFactIdentity({ ...identity, ...patch });
    assert.notEqual(nativeGid, facts.nativeGid);
    assert.notEqual(originalN, binding.nativeAdmissionNullifier({ ledgerNamespace: namespace, secret, nativeGid }));
  }
});

test('facts reject wire/domain/rule/clock/finality/internal-digest and workflow substitutions', () => {
  const { facts, policy } = factsFixture('1');
  const alterations = [f => { f.wireBindingPosition = '0'; }, f => { f.wireBindingKind = '2'; },
    f => { f.wireBindingVersion = '2'; }, f => { f.effectIndex = '1'; }, f => { f.asset = hash('other'); },
    f => { f.ledgerNamespace = hash('other'); }, f => { f.ruleCommitment = hash('other'); },
    f => { f.transactionId = hash('tx') + hash('not-padding'); }, f => { f.nativeGid = hash('other'); },
    f => { f.observation.evidenceUntil = '4599'; }, f => { f.observation.evidenceFrom = '999'; },
    f => { f.observation.confirmations = '5'; }, f => { f.nativeContext.observedTipHeight = '56'; },
    f => { f.nativeContext.transactionSlot = '1'; }, f => { f.observation.custodyCommitment = hash('other'); },
    f => { f.observation.stateCommitment = hash('other'); }, f => { f.observation.amount = '0'; },
    f => { f.observation.readyProof = 'not-a-fact'; }, f => { f.authorized = true; },
    f => { f.observation.settleBefore = '2000'; }];
  for (const alter of alterations) { const value = copy(facts); alter(value); assert.throws(() => binding.validateNativeFacts(value, policy)); }
  assert.throws(() => binding.validateNativeFacts(facts, { ...policy, rule: { ...policy.rule, minimumConfirmations: '5' } }));
  const overflow = copy(facts); overflow.observation.observedAt = overflow.observation.evidenceFrom = '18446744073709551615';
  assert.throws(() => binding.validateNativeFacts(overflow, policy));
  const { facts: sf, policy: sp } = factsFixture('2'); sf.nativeContext.parentSlot = sf.nativeContext.transactionSlot;
  assert.throws(() => binding.validateNativeFacts(sf, sp));
  let getterRan = false;
  const accessor = copy(facts); Object.defineProperty(accessor, 'nativeGid', { enumerable: true, get() { getterRan = true; return facts.nativeGid; } });
  assert.throws(() => binding.validateNativeFacts(accessor, policy)); assert.equal(getterRan, false);
  assert.throws(() => binding.validateNativeFacts(new Proxy(facts, {}), policy));
});
