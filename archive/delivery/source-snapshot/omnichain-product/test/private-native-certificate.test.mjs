import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, createHmac, generateKeyPairSync, randomBytes, sign, verify } from 'node:crypto';
import { base58Encode, signSolanaTransfer, validateSolanaObservation } from '../src/chains/solana-runtime.mjs';
import { createDisposableNativeIssuerLifetime, encodePC15Frame, decodePC15Frame, encodeChainDomain, encodeCanonicalEffect, encodeOpaqueEffectTagInput, encodeNativeCertificate, decodeNativeCertificate, certificateMessageHash, effectConsumptionHash, verifyNativeCertificate, nativeIssuerPolicyId, SECP256K1_ORDER } from '../src/private-native-certificate.mjs';

// ALL adapter responses below are explicitly synthetic. These tests exercise
// real Node cryptography and the existing adapter validators, not native chains.
const h = n => n.toString(16).padStart(2, '0').repeat(32), fresh = () => randomBytes(32).toString('hex');
const hash = bytes => createHash('sha256').update(bytes).digest();
function lifetime() { return createDisposableNativeIssuerLifetime({ lifetimeId: fresh(), identityNamespace: fresh(), mode: 'DISPOSABLE_LOCAL_ONLY_NO_RESTART' }); }
function syntheticSolana() {
  const signed = { ...signSolanaTransfer({ seed: Buffer.alloc(32, 3), recipient: base58Encode(Buffer.alloc(32, 4)), recentBlockhash: base58Encode(Buffer.alloc(32, 5)), lamports: '3000000' }), genesis: base58Encode(Buffer.alloc(32, 6)) };
  const f = { expected: signed, genesis: signed.genesis, status: { err: null, slot: 100, confirmations: null, confirmationStatus: 'finalized' }, transaction: { slot: 100, transaction: [signed.transactionBase64, 'base64'], meta: { err: null, fee: 5000, preBalances: [10000000, 0, 1], postBalances: [6995000, 3000000, 1], innerInstructions: [] } }, currentSlot: 105, block: { blockhash: base58Encode(Buffer.alloc(32, 7)), previousBlockhash: base58Encode(Buffer.alloc(32, 8)), signatures: [signed.signature], parentSlot: 99, blockHeight: 98 } };
  const events = [], control = { time: 600, inventory: '10000000', failAfterBroadcast: false, observedCount: 0 };
  const runtime = { genesis: signed.genesis, solver: signed.solver, recipient: signed.recipient,
    balance: async address => address === signed.solver ? control.inventory : '0',
    transfer: async (amount, { onSigned }) => { assert.equal(amount, signed.lamports); events.push('sign'); await onSigned(structuredClone(signed)); events.push('broadcast'); if (control.failAfterBroadcast) throw new Error('SYNTHETIC_BROADCAST_UNKNOWN'); return structuredClone(signed); },
    observe: async (signature, options) => { assert.equal(signature, signed.signature); assert.equal(options.commitment, 'finalized'); control.observedCount++; events.push('observe'); return validateSolanaObservation(f); },
  };
  return { signed, f, runtime, control, events, genesis: h(6), chain: 'SOL' };
}
function syntheticBitcoin() {
  const control = { time: 600, confirmations: 6, changingTip: false, tips: 0, inventory: 1, pending: false, raw: '0200000001', wrongRaw: false, fee: 0.00000140 };
  const events = [], script = '0014' + '08'.repeat(20), txid = h(9), block = h(10), tip = h(11), genesis = h(12);
  const output = { n: 0, value: 0.001, scriptPubKey: { hex: script } };
  const runtime = { btc: async (method, args = [], wallet) => {
    events.push(method);
    switch (method) {
      case 'getblockchaininfo': return { chain: 'regtest' };
      case 'getnetworkinfo': return { connections: 0, networkactive: false };
      case 'getblockhash': return args[0] === 0 ? genesis : block;
      case 'getbalance': assert.equal(wallet, 'm9-solver'); return control.inventory;
      case 'getaddressinfo': assert.equal(wallet, 'm9-recipient'); return { ismine: true, scriptPubKey: script };
      case 'createrawtransaction': assert.deepEqual(args, [[], { 'bcrt1-synthetic-only': '0.00100000' }, 0, false]); return '00';
      case 'fundrawtransaction': return { hex: '01', fee: control.fee };
      case 'signrawtransactionwithwallet': return { complete: true, hex: control.raw };
      case 'decoderawtransaction': return { txid, vout: [output] };
      case 'sendrawtransaction': return txid;
      case 'getbestblockhash': return control.changingTip ? (++control.tips).toString(16).padStart(64, '0') : tip;
      case 'getrawtransaction': return { txid, ...(!control.pending ? { blockhash: block } : {}), vout: [output] };
      case 'getblockheader': return { height: 100, confirmations: control.confirmations };
      case 'gettransaction': return { hex: control.wrongRaw ? '00' : control.raw, fee: -control.fee };
      case 'gettxout': return null; // historically confirmed spent output is valid
      case 'getmempoolentry': return {};
      default: throw new Error('UNEXPECTED_SYNTHETIC_METHOD_' + method);
    }
  } };
  return { runtime, control, events, genesis, chain: 'BTC', script, output, txid };
}
function setup(f = syntheticSolana(), options = {}) {
  const issuer = options.issuer ?? lifetime(), archive = [], retained = [], authorized = [];
  const bridge = issuer.bind({ chain: f.chain, genesis: f.genesis, policyFamilyId: h(15), epochSeconds: 60, minimumConfirmations: f.chain === 'SOL' ? 1 : 6, runtime: f.runtime,
    nowSeconds: () => f.control.time,
    authorizeLocalInvocation: async request => { authorized.push(request); f.events.push('authorize'); },
    retainSignedDispatch: async (request, signed) => { retained.push({ request, signed }); f.events.push('retain'); },
    archiveCertificate: async certificate => { archive.push(certificate); f.events.push('archive'); }, ...options.bind,
  });
  const request = { localInstructionCommitment: h(1), invocationNonce: fresh(), source: f.chain === 'SOL' ? f.signed.solver : h(0), recipient: f.chain === 'SOL' ? f.signed.recipient : 'bcrt1-synthetic-only', amount: f.chain === 'SOL' ? '3000000' : '100000', executeAfter: '600', executeBefore: '900', validFromEpoch: '10', validUntilEpoch: '15' };
  return { f, issuer, bridge, request, archive, retained, authorized };
}
async function certified(f = syntheticSolana()) { const s = setup(f), dispatch = await s.bridge.dispatch(s.request), envelope = await s.bridge.observeAndCertify(dispatch.handle); return { ...s, ...dispatch, envelope }; }

test('ENC independent byte vector, ASCII, field boundaries and strict decoding', () => {
  const encoded = encodePC15Frame('X', [Buffer.from([0, 1]), Buffer.alloc(0), Buffer.from('z')]);
  assert.equal(encoded.toString('hex'), '00015800000002000100000000000000017a');
  assert.deepEqual(decodePC15Frame(encoded, 'X', [2, 0, 1]), [Buffer.from([0, 1]), Buffer.alloc(0), Buffer.from('z')]);
  assert.throws(() => encodePC15Frame('é', []), /INVALID_TAG/);
  assert.throws(() => encodePC15Frame('X', ['bytes']), /REQUIRES_BYTES/);
  assert.throws(() => decodePC15Frame(encoded, 'Y', [2, 0, 1]), /WRONG_FRAME_DOMAIN/);
  assert.throws(() => decodePC15Frame(encoded.subarray(0, -1), 'X', [2, 0, 1]), /TRUNCATED_FIELD/);
  assert.throws(() => decodePC15Frame(Buffer.concat([encoded, Buffer.from([0])]), 'X', [2, 0, 1]), /TRAILING_FIELDS/);
  assert.throws(() => decodePC15Frame(encoded, 'X', [1, 0, 1]), /WRONG_FIELD_WIDTH/);
  assert.notDeepEqual(encodePC15Frame('X', [Buffer.from('ab'), Buffer.from('c')]), encodePC15Frame('X', [Buffer.from('a'), Buffer.from('bc')]));
});

test('canonical effect preserves all SOL signature bytes and rejects alternate spellings/selectors', () => {
  const f = syntheticSolana(), effect = { signature: f.signed.signature, instructionIndex: 0 };
  const expected = encodeCanonicalEffect('SOL', effect), tail = Buffer.from(f.signed.signatureHex.slice(2), 'hex'); tail[63] ^= 1;
  assert.notDeepEqual(expected, encodeCanonicalEffect('SOL', { ...effect, signature: base58Encode(tail) }));
  for (const signature of [f.signed.signatureHex, f.signed.signature + ' ', base58Encode(tail.subarray(0, 32))]) assert.throws(() => encodeCanonicalEffect('SOL', { ...effect, signature }));
  assert.throws(() => encodeCanonicalEffect('SOL', { ...effect, instructionIndex: 1 }), /UNSUPPORTED_SOLANA_INSTRUCTION/);
  assert.throws(() => encodeCanonicalEffect('SOL', { ...effect, slot: 100 }), /UNEXPECTED_FIELDS/);
  for (const txid of [h(171).toUpperCase(), '0x' + h(1), h(1).slice(2)]) assert.throws(() => encodeCanonicalEffect('BTC', { txid, vout: 0 }), /NONCANONICAL_BYTES32/);
  for (const vout of [-1, -0, 2 ** 32, '0', 0.1]) assert.throws(() => encodeCanonicalEffect('BTC', { txid: h(1), vout }));
});

test('synthetic SOL adapter dispatch captures before broadcast and certificate round-trips', async () => {
  const s = await certified(); assert.deepEqual(s.f.events, ['authorize', 'sign', 'retain', 'broadcast', 'observe', 'archive']);
  assert.equal(s.envelope.certificate.canonicalEffect.signature, s.f.signed.signature);
  assert.equal(verifyNativeCertificate(s.envelope, s.bridge.policy, { settlementEpoch: '10' }), true);
  const frame = encodeNativeCertificate(s.envelope.certificate); assert.deepEqual(decodeNativeCertificate(frame), s.envelope.certificate);
  assert.deepEqual(certificateMessageHash(s.envelope.certificate), hash(frame)); assert.equal(s.archive.length, 1);
  assert.equal(s.retained[0].request.localInstructionCommitment, s.request.localInstructionCommitment);
  assert.equal(s.envelope.certificate.localInstructionCommitment, s.request.localInstructionCommitment);
  assert.equal(s.bridge.policy.policyId, nativeIssuerPolicyId(s.bridge.policy));
  assert.throws(() => { s.envelope.certificate.amount = '7'; }, TypeError);
});

test('synthetic BTC adapter constructs exact unique output; confirmed spent delivery stays valid', async () => {
  const s = await certified(syntheticBitcoin()), c = s.envelope.certificate;
  assert.equal(c.source, h(0)); assert.equal(c.finalityMeasure, '6'); assert.equal(c.observedTipNumber, '105');
  assert.equal(c.recipientOrScriptHash, hash(Buffer.from(s.f.script, 'hex')).toString('hex'));
  assert.deepEqual(c.canonicalEffect, { txid: s.f.txid, vout: 0 });
  assert.ok(s.f.events.indexOf('retain') < s.f.events.indexOf('sendrawtransaction'));
  assert.equal(verifyNativeCertificate(s.envelope, s.bridge.policy, { settlementEpoch: 10 }), true);
  assert.deepEqual(decodeNativeCertificate(encodeNativeCertificate(c)), c);
});

test('one fixed issuer tag survives refresh time/block placement; new C_i cannot rebind old effect', async () => {
  const s = await certified(); s.f.control.time = 610; s.f.f.currentSlot = 106; s.f.f.block.blockhash = base58Encode(Buffer.alloc(32, 12));
  const again = await s.bridge.observeAndCertify(s.handle);
  assert.equal(again.certificate.opaqueTag, s.envelope.certificate.opaqueTag); assert.notEqual(again.certificate.observedAt, s.envelope.certificate.observedAt);
  assert.notEqual(again.certificate.observedBlockIdentity, s.envelope.certificate.observedBlockIdentity);
  assert.notDeepEqual(certificateMessageHash(again.certificate), certificateMessageHash(s.envelope.certificate));
  const freshGraphRequest = { ...s.request, localInstructionCommitment: h(222), invocationNonce: fresh() };
  await assert.rejects(s.bridge.dispatch(freshGraphRequest), /EFFECT_ALREADY_BOUND_TO_DISPATCH/);
  assert.equal(s.f.events.filter(x => x === 'broadcast').length, 1);
});

test('synthetic independent HMAC vector: C_i/time/policy/owner/graph cannot rename canonical input', () => {
  const domain = { chain: 'BTC', genesis: h(6) }, effect = { txid: h(7), vout: 4 }, input = encodeOpaqueEffectTagInput(h(5), domain, effect);
  const testOnlyKey = Buffer.alloc(32, 23), mac = data => createHmac('sha256', testOnlyKey).update(data).digest('hex');
  const first = { C_i: h(1), observedAt: 600, policy: h(8), input }, reused = { C_i: h(2), observedAt: 900, policy: h(9), input: encodeOpaqueEffectTagInput(h(5), domain, effect) };
  assert.equal(mac(first.input), mac(reused.input));
  assert.notEqual(mac(input), mac(encodeOpaqueEffectTagInput(h(5), { ...domain, genesis: h(8) }, effect)));
  assert.notEqual(mac(input), mac(encodeOpaqueEffectTagInput(h(9), domain, effect)));
  assert.notEqual(mac(input), mac(encodeOpaqueEffectTagInput(h(5), domain, { ...effect, vout: 5 })));
  assert.notDeepEqual(encodeChainDomain(domain), encodeChainDomain({ chain: 'SOL', genesis: domain.genesis }));
  assert.throws(() => encodeOpaqueEffectTagInput(h(5), domain, { ...effect, owner: h(1) }), /UNEXPECTED_FIELDS/);
  assert.throws(() => encodeOpaqueEffectTagInput(h(5), { ...domain, graph: h(1) }, effect), /UNEXPECTED_FIELDS/);
  assert.notDeepEqual(effectConsumptionHash(h(1), domain, mac(input)), effectConsumptionHash(h(2), domain, mac(input)));
});

for (const key of ['graph', 'graphCommitment', 'reservation', 'owner', 'sibling', 'success']) test(`local request rejects unapproved global/receipt field ${key}`, async () => {
  const s = setup(); await assert.rejects(s.bridge.dispatch({ ...s.request, [key]: h(3) }), /UNEXPECTED_FIELDS/); assert.equal(s.f.events.length, 0);
});

test('arbitrary success:true object cannot authorize certificate; handles cannot be serialized/restored', async () => {
  const s = await certified();
  for (const fake of [{ success: true }, {}, structuredClone(s.handle), JSON.parse(JSON.stringify(s.handle))]) await assert.rejects(s.bridge.observeAndCertify(fake), /UNKNOWN_DISPATCH_CAPABILITY/);
  assert.equal(Object.hasOwn(s.bridge, 'issue'), false); assert.equal(Object.hasOwn(s.issuer, 'sign'), false); assert.equal(Object.hasOwn(s.issuer, 'reset'), false);
  const json = JSON.stringify({ issuer: s.issuer, envelope: s.envelope, policy: s.bridge.policy });
  assert.doesNotMatch(json, /privateKey|hmacKey|seed|BEGIN PRIVATE KEY/);
});

test('nonce is one-use before awaits, and failed authorization never broadcasts', async () => {
  const s = setup(); const outcomes = await Promise.allSettled([s.bridge.dispatch(s.request), s.bridge.dispatch(s.request)]);
  assert.equal(outcomes.filter(o => o.status === 'fulfilled').length, 1); assert.equal(s.authorized.length, 1);
  const denied = setup(syntheticSolana(), { bind: { authorizeLocalInvocation: async () => { throw new Error('SYNTHETIC_READINESS_REJECTED'); } } });
  await assert.rejects(denied.bridge.dispatch(denied.request), /SYNTHETIC_READINESS_REJECTED/); assert.equal(denied.f.events.length, 0);
  await assert.rejects(denied.bridge.dispatch(denied.request), /INVOCATION_ALREADY_USED/);
});

test('durable signed-record failure stops before broadcast; ambiguous broadcast keeps exact observation capability', async () => {
  const s = setup(syntheticSolana(), { bind: { retainSignedDispatch: async () => { throw new Error('SYNTHETIC_STORAGE_FAILURE'); } } });
  await assert.rejects(s.bridge.dispatch(s.request), /SYNTHETIC_STORAGE_FAILURE/); assert.equal(s.f.events.includes('broadcast'), false);
  const u = setup(); u.f.control.failAfterBroadcast = true; let failure;
  try { await u.bridge.dispatch(u.request); } catch (e) { failure = e; }
  assert.match(failure.message, /SYNTHETIC_BROADCAST_UNKNOWN/); assert.equal(failure.nativeReceipt.signature, u.f.signed.signature);
  const envelope = await u.bridge.observeAndCertify(failure.dispatchHandle); assert.equal(envelope.certificate.canonicalEffect.signature, u.f.signed.signature);
  assert.equal(u.f.events.filter(x => x === 'broadcast').length, 1);
});

for (const [name, mutate, pattern] of [
  ['wrong native recipient', s => { s.request.recipient = base58Encode(Buffer.alloc(32, 99)); }, /OWNED_SOLANA_RECIPIENT_REQUIRED/],
  ['wrong native source', s => { s.request.source = base58Encode(Buffer.alloc(32, 99)); }, /OWNED_SOLANA_SOURCE_REQUIRED/],
  ['insufficient fee inventory', s => { s.f.control.inventory = '3000000'; }, /INSUFFICIENT_SOLANA_INVENTORY/],
  ['expired dispatch', s => { s.f.control.time = 900; }, /DISPATCH_OUTSIDE_EXECUTION_WINDOW/],
]) test('synthetic SOL dispatch rejects ' + name, async () => { const s = setup(); mutate(s); await assert.rejects(s.bridge.dispatch(s.request), pattern); assert.equal(s.f.events.includes('broadcast'), false); });

for (const [name, mutate, pattern] of [
  ['failed transaction', s => { s.f.f.transaction.meta.err = {}; }, /TRANSACTION_MISSING_OR_FAILED/],
  ['wrong observed recipient balance', s => { s.f.f.transaction.meta.postBalances[1]++; }, /BALANCE_DELTA_MISMATCH/],
  ['missing block membership', s => { s.f.f.block.signatures = []; }, /BLOCK_MEMBERSHIP_MISSING/],
  ['unfinalized receipt', s => { s.f.f.status.confirmationStatus = 'confirmed'; }, /NOT_COMMITTED/],
  ['stale receipt window', s => { s.f.control.time = 900; }, /OBSERVATION_OUTSIDE_EXECUTION_WINDOW/],
]) test('synthetic SOL certificate rejects ' + name, async () => { const s = setup(), d = await s.bridge.dispatch(s.request); mutate(s); await assert.rejects(s.bridge.observeAndCertify(d.handle), pattern); assert.equal(s.archive.length, 0); });

for (const [name, mutate, pattern] of [
  ['insufficient confirmations', s => { s.f.control.confirmations = 5; }, /BITCOIN_NOT_FINAL/],
  ['mempool transaction', s => { s.f.control.pending = true; }, /BITCOIN_NOT_FINAL/],
  ['unstable tip', s => { s.f.control.changingTip = true; }, /BITCOIN_OBSERVATION_UNSTABLE/],
  ['wrong signed wire', s => { s.f.control.wrongRaw = true; }, /WRONG_BITCOIN_WIRE/],
  ['excessive observed fee', s => { s.f.control.fee = 0.001; }, /BITCOIN_FEE_LIMIT/],
  ['wrong output amount', s => { s.f.output.value = 0.002; }, /Exact unique recipient output/],
]) test('synthetic BTC certificate rejects ' + name, async () => { const s = setup(syntheticBitcoin()), d = await s.bridge.dispatch(s.request); mutate(s); await assert.rejects(s.bridge.observeAndCertify(d.handle), pattern); assert.equal(s.archive.length, 0); });

test('synthetic BTC fee cap and owned inventory fail before broadcast', async () => {
  for (const [field, value, pattern] of [['inventory', 0.001, /INSUFFICIENT_BITCOIN_INVENTORY/], ['fee', 0.001, /BITCOIN_FEE_LIMIT/]]) {
    const s = setup(syntheticBitcoin()); s.f.control[field] = value; await assert.rejects(s.bridge.dispatch(s.request), pattern); assert.equal(s.f.events.includes('sendrawtransaction'), false);
  }
});

test('signature is SHA256 once, low-S, and rejects changed message/key/high-S/DER/digest boundary', async () => {
  const s = await certified(), e = structuredClone(s.envelope), p = s.bridge.policy;
  const signature = Buffer.from(e.signature, 'hex'), scalarS = BigInt('0x' + signature.subarray(32).toString('hex'));
  assert.ok(scalarS > 0n && scalarS <= SECP256K1_ORDER / 2n);
  const jwk = { kty: 'EC', crv: 'secp256k1', x: Buffer.from(e.issuerPublicKey.x, 'hex').toString('base64url'), y: Buffer.from(e.issuerPublicKey.y, 'hex').toString('base64url') };
  const key = { key: jwk, format: 'jwk', dsaEncoding: 'ieee-p1363' };
  assert.equal(verify('sha256', encodeNativeCertificate(e.certificate), key, signature), true);
  assert.equal(verify('sha256', certificateMessageHash(e.certificate), key, signature), false);
  const high = Buffer.concat([signature.subarray(0, 32), Buffer.from((SECP256K1_ORDER - scalarS).toString(16).padStart(64, '0'), 'hex')]);
  for (const bad of [high.toString('hex'), '00'.repeat(64), '00'.repeat(63), '30' + signature.toString('hex')]) assert.equal(verifyNativeCertificate({ ...e, signature: bad }, p, { settlementEpoch: 10 }), false);
  for (const [field, value] of [['amount', '3000001'], ['localInstructionCommitment', h(55)], ['recipientOrScriptHash', h(55)], ['source', h(55)], ['opaqueTag', h(55)], ['policyId', h(55)], ['identityNamespace', h(55)], ['observedAt', '601'], ['observedBlockIdentity', h(55)]]) {
    const changed = structuredClone(e); changed.certificate[field] = value; assert.equal(verifyNativeCertificate(changed, p, { settlementEpoch: 10 }), false, field);
  }
  const another = setup(); assert.equal(verifyNativeCertificate(e, another.bridge.policy, { settlementEpoch: 10 }), false);
  for (const domain of [{ chain: 'SOL', genesis: h(99) }, { chain: 'BTC', genesis: e.certificate.chainDomain.genesis }]) {
    const changed = structuredClone(e); changed.certificate.chainDomain = domain; assert.equal(verifyNativeCertificate(changed, p, { settlementEpoch: 10 }), false);
  }
  assert.equal(verifyNativeCertificate({ ...e, issuerPublicKey: another.bridge.policy.issuerPublicKey }, p, { settlementEpoch: 10 }), false);
  assert.equal(verifyNativeCertificate(e, p), false); assert.equal(verifyNativeCertificate(e, p, { settlementEpoch: 9 }), false); assert.equal(verifyNativeCertificate(e, p, { settlementEpoch: 15 }), false);
});

test('certificate decoder rejects trailing data, field-width changes, false success and selector substitution', async () => {
  const s = await certified(), encoded = encodeNativeCertificate(s.envelope.certificate);
  assert.throws(() => decodeNativeCertificate(Buffer.concat([encoded, Buffer.from([0])])), /TRAILING_FIELDS/);
  const changed = structuredClone(s.envelope.certificate); changed.canonicalEffect.instructionIndex = 1; assert.throws(() => encodeNativeCertificate(changed), /UNSUPPORTED_SOLANA_INSTRUCTION/);
  changed.canonicalEffect.instructionIndex = 0; changed.success = false; assert.throws(() => encodeNativeCertificate(changed), /UNSUCCESSFUL_CERTIFICATE/);
  const inconsistent = structuredClone(s.envelope.certificate); inconsistent.observedTipNumber = '99'; assert.throws(() => encodeNativeCertificate(inconsistent), /INCOHERENT_BLOCK_CONTEXT/);
});

test('explicit lifetime/no-reset boundary and key-bound policy fingerprint prevent silent policy continuity', async () => {
  assert.throws(() => createDisposableNativeIssuerLifetime({ lifetimeId: fresh(), identityNamespace: fresh() }), /EXPLICIT_DISPOSABLE_LIFETIME_REQUIRED/);
  const s = await certified(), before = s.bridge.policy.policyId; const other = setup(); assert.notEqual(before, other.bridge.policy.policyId);
  const substituted = { ...s.bridge.policy, identityKeyCommitment: other.bridge.policy.identityKeyCommitment };
  assert.notEqual(nativeIssuerPolicyId(substituted), before); assert.equal(verifyNativeCertificate(s.envelope, substituted, { settlementEpoch: 10 }), false);
  const id = s.issuer.lifetimeId, ns = s.issuer.identityNamespace; s.issuer.close();
  assert.throws(() => s.issuer.publicKeys(), /LIFETIME_CLOSED/); await assert.rejects(s.bridge.observeAndCertify(s.handle), /LIFETIME_CLOSED/);
  assert.throws(() => createDisposableNativeIssuerLifetime({ lifetimeId: id, identityNamespace: fresh(), mode: 'DISPOSABLE_LOCAL_ONLY_NO_RESTART' }), /ALREADY_ALLOCATED/);
  assert.throws(() => createDisposableNativeIssuerLifetime({ lifetimeId: fresh(), identityNamespace: ns, mode: 'DISPOSABLE_LOCAL_ONLY_NO_RESTART' }), /ALREADY_ALLOCATED/);
});

test('SYNTHETIC NEGATIVE CONTROL: dishonest approved issuer can sign invented facts and two tags', async () => {
  // This deliberately bypasses the bridge in TEST CODE with a fresh test key.
  // Acceptance is the expected trust failure, never evidence of native delivery.
  const s = await certified(), { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'secp256k1' }), jwk = publicKey.export({ format: 'jwk' });
  const key = { x: Buffer.from(jwk.x, 'base64url').toString('hex'), y: Buffer.from(jwk.y, 'base64url').toString('hex') };
  const policy = { ...s.bridge.policy, issuerPublicKey: key, identityKeyCommitment: h(79) }; policy.policyId = nativeIssuerPolicyId(policy);
  const invented = structuredClone(s.envelope.certificate); invented.policyId = policy.policyId; invented.amount = '999999'; invented.opaqueTag = h(80);
  const maliciousSign = certificate => { let signature = sign('sha256', encodeNativeCertificate(certificate), { key: privateKey, dsaEncoding: 'ieee-p1363' }); const scalarS = BigInt('0x' + signature.subarray(32).toString('hex')); if (scalarS > SECP256K1_ORDER / 2n) signature = Buffer.concat([signature.subarray(0, 32), Buffer.from((SECP256K1_ORDER - scalarS).toString(16).padStart(64, '0'), 'hex')]); return { certificate, signature: signature.toString('hex'), issuerPublicKey: key }; };
  const one = maliciousSign(invented), two = maliciousSign({ ...invented, localInstructionCommitment: h(82), observedAt: '601', opaqueTag: h(81) });
  assert.equal(verifyNativeCertificate(one, policy, { settlementEpoch: 10 }), true); assert.equal(verifyNativeCertificate(two, policy, { settlementEpoch: 10 }), true);
  assert.deepEqual(one.certificate.canonicalEffect, two.certificate.canonicalEffect);
  assert.notDeepEqual(effectConsumptionHash(h(99), policy.chainDomain, one.certificate.opaqueTag), effectConsumptionHash(h(99), policy.chainDomain, two.certificate.opaqueTag));
  assert.equal(verifyNativeCertificate(one, s.bridge.policy, { settlementEpoch: 10 }), false);
});
