/** HOST-BOUNDARY TESTS ONLY. Run in a fresh test process:
 * node --experimental-test-module-mocks --test native-dispatch-gate.test.mjs
 * The verifier import is explicitly mocked below. No test bytes are genuine
 * P/R proofs. Synthetic keys/observations/CAS and a labelled SHA test hasher
 * exercise guards/journaling, not native consensus, proof or chain acceptance.
 */
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, ECDH, generateKeyPairSync, sign, verify } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createCommitmentCodec, ZERO } from '@lianum/components/encoding/commitments';
import { encodeStatement } from '@lianum/components/encoding/statements';
import { encodeFlatNativeHealth, flatNativeHealthDigest, assertFlatNativeHealth } from '../../../../src/chains/shared/health/native-health.mjs';
import { receiptKeyCommitment, nativeRuleCommitment, nativeCustodyCommitment,
  encodeSolanaBindingMessage, encodeBitcoinBinding, validateSolanaBindingTransaction, MEMO_PROGRAM } from '@lianum/engine/native/native-receipt-binding';
import { nativeAdmissionChainDomain, nativeProviderIdentity, nativeDeliveryRiskCommitment,
  nativeDispatchStatementFrame, NATIVE_ADMISSION_LOSS_CLAUSE }
  from '@lianum/engine/execution/native/dispatch/native-admission';
import { nativeTransferActionCommitment } from '@lianum/engine/execution/native/dispatch/native-capsules';
import { nativeQuorumRegistryCommitment, NATIVE_QUORUM_PROFILE } from '@lianum/engine/evidence/native-quorum';
import { boundedListDigest, snapshotDigest } from '@lianum/engine/execution/native/state/native-state';
import { PrivateNoteTree } from '@lianum/engine/notes/private-note-tree';
import { decodeBitcoinTransaction } from '@lianum/engine/chains/bitcoin/bitcoin-runtime';

const syntheticVerifiers = new WeakSet();
mock.module(new URL('../../../proof-workers/pinned-verifier.mjs', import.meta.url).href, {
  exports: { assertPinnedVerifier(value, role) {
    assert.ok(syntheticVerifiers.has(value) && role === 'dispatch', 'TEST_SYNTHETIC_VERIFIER_BRAND');
  } },
});
const gateModule = await import('../../../../src/chains/shared/dispatch/native-dispatch-gate.mjs');
const { evmDeliveryFixture, signedDeliveryWire } = await import('../../../fixtures/chains/evm/transfers/test-fixtures/evm-delivery-wire.mjs');
const { decodeCanonicalEvmTransaction } = await import('../../../../src/chains/evm/runtime/owned-evm-v2-runtime.mjs');
const { evmFundingEndpointCommitment } = await import('../../../../src/chains/evm/dispatch/evm-facts-binding.mjs');
const { evmVaultDeliveryDescriptorCommitment } = await import('@lianum/engine/encoding/evm-vault-delivery');
const { createNativeDispatchGate, createNativeDispatchJournal, assertNativeDispatchBinding,
  assertNativeDispatchState, assertNativeDispatchPrepared, assertNativeDispatchSigned } = gateModule;
const sha = value => createHash('sha256').update(value).digest('hex');
const copy = value => structuredClone(value), p = value => '0x' + value;
// Deliberately NOT Poseidon2 and never exported to production code.
const hashFields = async values => '00' + sha('HOST TEST HASH:' + values.map(String).join(':')).slice(2);
const codec = createCommitmentCodec({ hashFields });
const field = label => '00' + sha(label).slice(2);
const ORDER = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
const point = key => { const jwk = key.export({ format: 'jwk' }); return {
  x: Buffer.from(jwk.x, 'base64url').toString('hex'), y: Buffer.from(jwk.y, 'base64url').toString('hex') }; };
function signLow(key, frame) {
  const signature = sign('sha256', frame, { key, dsaEncoding: 'ieee-p1363' });
  const s = BigInt('0x' + signature.subarray(32).toString('hex'));
  return signature.subarray(0, 32).toString('hex') + (s > ORDER / 2n ? ORDER - s : s).toString(16).padStart(64, '0');
}
const word = value => (typeof value === 'string' && value.startsWith('0x') ? value.slice(2) : BigInt(value).toString(16)).padStart(64, '0');
const abi = values => '0x' + values.map(word).join('');
const little = (number, width) => Buffer.from(BigInt(number).toString(16).padStart(width * 2, '0'), 'hex').reverse();
const doubleSha = bytes => Buffer.from(sha(Buffer.from(sha(bytes), 'hex')), 'hex');
function signBitcoinSynthetic(intent, source) {
  const unsigned = Buffer.from(encodeBitcoinBinding(intent), 'hex');
  const scriptCode = Buffer.from('1976a914' + intent.sourceScript.slice(4) + '88ac', 'hex');
  const preimage = Buffer.concat([unsigned.subarray(0, 4), doubleSha(unsigned.subarray(5, 41)),
    doubleSha(unsigned.subarray(42, 46)), unsigned.subarray(5, 41), scriptCode, little(intent.sourceSatoshi, 8),
    unsigned.subarray(42, 46), doubleSha(unsigned.subarray(47, -4)), unsigned.subarray(-4), Buffer.from('01000000', 'hex')]);
  const firstHash = Buffer.from(sha(preimage), 'hex');
  // Node hashes this once more, yielding the actual BIP143 double-SHA digest.
  const signature = signLow(source.privateKey, firstHash);
  assert.ok(verify('sha256', firstHash, { key: source.publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(signature, 'hex')));
  const derInteger = value => { let bytes = Buffer.from(BigInt('0x' + value).toString(16).padStart(64, '0'), 'hex');
    while (bytes.length > 1 && bytes[0] === 0) bytes = bytes.subarray(1);
    if (bytes[0] & 0x80) bytes = Buffer.concat([Buffer.from([0]), bytes]);
    return Buffer.concat([Buffer.from([2, bytes.length]), bytes]); };
  const body = Buffer.concat([derInteger(signature.slice(0, 64)), derInteger(signature.slice(64))]);
  const der = Buffer.concat([Buffer.from([0x30, body.length]), body, Buffer.from([1])]);
  const key = ECDH.convertKey(Buffer.concat([Buffer.from([4]), Buffer.from(point(source.publicKey).x, 'hex'),
    Buffer.from(point(source.publicKey).y, 'hex')]), 'secp256k1', undefined, undefined, 'compressed');
  return Buffer.concat([unsigned.subarray(0, 4), Buffer.from([0, 1]), unsigned.subarray(4, -4),
    Buffer.from([2, der.length]), der, Buffer.from([key.length]), key, unsigned.subarray(-4)]).toString('hex');
}
function endpoint(family, genesis, asset, raw) {
  const parts = ['LIANUM/PAEG/native-endpoint/2', 'LIANUM_PAEG_NATIVE_4_V2', family === '1' ? 'BTC' : 'SOL'].map(Buffer.from);
  parts.push(Buffer.from(genesis, 'hex'), Buffer.from(asset, 'hex'), Buffer.from(family === '1' ? 'BTC_P2WPKH_SCRIPT' : 'SOL_PUBLIC_KEY'), Buffer.from(raw, 'hex'));
  return sha(Buffer.concat(parts.flatMap(part => { const n = Buffer.alloc(4); n.writeUInt32BE(part.length); return [n, part]; })));
}
const memo = { ...MEMO_PROGRAM, executable: true,
  dataBase64: readFileSync(new URL('../../../../../omnichain-product/.local/agave-linux-bounded-build/derived/'
    + 'agave-2.3.13-loopback-memtable-128m/program-test/src/programs/spl_memo-3.0.0.so', import.meta.url)).toString('base64') };
delete memo.codeSHA256;

async function fixture(family = '2') {
  const provider = generateKeyPairSync('ec', { namedCurve: 'secp256k1' });
  const attesters = Array.from({ length: 4 }, () => generateKeyPairSync('ec', { namedCurve: 'secp256k1' }));
  const source = family === '2' ? generateKeyPairSync('ed25519') : generateKeyPairSync('ec', { namedCurve: 'secp256k1' });
  const compressed = family === '1' ? ECDH.convertKey(Buffer.concat([Buffer.from([4]), Buffer.from(point(source.publicKey).x, 'hex'),
    Buffer.from(point(source.publicKey).y, 'hex')]), 'secp256k1', undefined, undefined, 'compressed') : null;
  const evm = family === '3' ? evmDeliveryFixture('gate', '50000') : null;
  const native = evm ? { family, genesis: evm.rule.genesis, asset: evm.rule.asset, sourceEndpoint: evm.identity.solver,
    destinationEndpoint: evm.identity.router, changeEndpoint: null, descriptor: copy(evm.intent.descriptor), depositProof: evm.intent.proof } : { family, genesis: sha('test genesis ' + family), asset: sha('native asset ' + family),
    sourceEndpoint: family === '2' ? Buffer.from(source.publicKey.export({ format: 'jwk' }).x, 'base64url').toString('hex')
      : '0014' + createHash('ripemd160').update(Buffer.from(sha(compressed), 'hex')).digest('hex'),
    destinationEndpoint: family === '2' ? sha('test recipient') : '0014' + sha('test recipient').slice(0, 40),
    changeEndpoint: family === '2' ? null : '0014' + sha('test change').slice(0, 40) };
  const rule = { family: native.family, genesis: native.genesis, asset: native.asset, finalityKind: family,
    minimumConfirmations: family === '2' ? '0' : '6', maximumEvidenceLifetime: '300', maximumClockSkew: '30' };
  let rulesRoot = nativeRuleCommitment(rule);
  for (let i = 0; i < 3; i++) rulesRoot = sha(Buffer.concat([Buffer.from([1]), Buffer.from(rulesRoot, 'hex'), Buffer.alloc(32)]));
  const registry = { profile: NATIVE_QUORUM_PROFILE, hubDomain: sha('hub'), registryEpoch: '1', rulesRoot,
    keys: attesters.map(pair => point(pair.publicKey)) };
  const domain = { scope: sha('scope'), policy: sha('policy'), asset: sha('pool asset'), hubDomain: registry.hubDomain,
    registryCommitment: nativeQuorumRegistryCommitment(registry), verifierSetCommitment: sha('test verifier set'), ledgerNamespace: registry.hubDomain };
  if (evm) {
    native.descriptor.identity.ledgerNamespace = domain.ledgerNamespace;
    native.descriptor.identity.assetIdentity = domain.asset;
    native.descriptor.route.executionFrom = '1100'; native.descriptor.route.executionUntil = '1900';
    native.descriptor.publicInputs[16] = word(1000); native.descriptor.publicInputs[17] = word(2000);
  }
  const d = await codec.domainCommitment(domain), keySecret = sha('receipt secret'), payout = sha('payout'), salt = sha('risk salt');
  const action = { chainDomain: nativeAdmissionChainDomain(rule), signerIdentity: nativeProviderIdentity(point(provider.publicKey)),
    sourceCommitment: evm ? evmFundingEndpointCommitment({ genesis: native.genesis, asset: native.asset, address: native.sourceEndpoint })
      : endpoint(family, native.genesis, native.asset, native.sourceEndpoint),
    destinationCommitment: evm ? evmVaultDeliveryDescriptorCommitment(native.descriptor)
      : endpoint(family, native.genesis, native.asset, native.destinationEndpoint), amount: '50000', custodyKind: 1,
    executionFrom: '1100', executionUntil: '1900', settleBefore: '2000', receiptRho: sha('rho'), actionSalt: sha('action salt'),
    receiptKeyCommitment: receiptKeyCommitment({ ledgerNamespace: domain.ledgerNamespace, secret: keySecret }) };
  action.custodyCommitment = nativeCustodyCommitment({ family, genesis: native.genesis, asset: native.asset,
    sourceCommitment: action.sourceCommitment, destinationCommitment: action.destinationCommitment });
  action.deliveryRiskCommitment = nativeDeliveryRiskCommitment({ clause: NATIVE_ADMISSION_LOSS_CLAUSE,
    hubDomain: domain.hubDomain, registryCommitment: domain.registryCommitment, chainDomain: action.chainDomain,
    sourceCommitment: action.sourceCommitment, destinationCommitment: action.destinationCommitment,
    amount: action.amount, scope: domain.scope, policy: domain.policy, asset: domain.asset,
    payoutCommitment: payout, settleBefore: action.settleBefore, salt });
  const binding = { domain, pool: sha('fake pool').slice(0, 40), registry, rule,
    rulePath: { index: '0', siblings: [ZERO, ZERO, ZERO] }, providerKey: point(provider.publicKey), native,
    quote: { action, payoutCommitment: payout, deliveryRiskSalt: salt }, acceptedLossClause: NATIVE_ADMISSION_LOSS_CLAUSE };
  const zeros = Array(64).fill(ZERO), poolTree = new PrivateNoteTree([p(sha('synthetic reserve'))]);
  const receiptTree = await codec.buildTree(d, 2, []), revokedDigest = await codec.revokedDigest(d, domain.hubDomain, zeros, '0');
  const receiptLeaves = Array(64).fill(await codec.emptyLeaf(d, 2));
  const poolSpent = boundedListDigest(2, p(domain.scope), [], '0'), tagDigest = boundedListDigest(0x31, p(domain.hubDomain), [], '0');
  const snapshot = { hubDomain: p(domain.hubDomain), registryCommitment: p(domain.registryCommitment), pool: p(binding.pool),
    scope: p(domain.scope), policy: p(domain.policy), assetIdentity: p(domain.asset), poolRoot: poolTree.root,
    poolSpentDigest: poolSpent, poolSpentCount: '0', poolStateSequence: '1', receiptRoot: p(receiptTree.root), receiptCount: '0',
    spentTagDigest: tagDigest, spentTagCount: '0', spentTagSequence: '0', revokedDigest: p(revokedDigest), revokedCount: '0',
    revocationSequence: '0', hubStateSequence: '1', registryEpoch: '1', halt: '0', timestamp: '1200' };
  const evidence = { hubDomain: domain.hubDomain, registryCommitment: domain.registryCommitment,
    receiptRoot: receiptTree.root, receiptCount: '0', revokedDigest, revokedCount: '0', revocationSequence: '0' };
  const evidenceState = await codec.evidenceStateDigest(d, evidence), checkpoint = snapshotDigest(snapshot).slice(2);
  const checkpointTree = new PrivateNoteTree([p(checkpoint)]), path = checkpointTree.path(0), authorizationRoot = field('accepted G');
  const dependency = { domainCommitment: d, authorizationRoot, checkpoint, readinessEvidenceState: evidenceState,
    joinCommitment: field('synthetic J'), readyFrom: '1100', readyUntil: '1400' };
  const descriptor = { scope: domain.scope, policy: domain.policy, asset: domain.asset, hubDomain: domain.hubDomain,
    registryCommitment: domain.registryCommitment, snapshotDigest: checkpoint, localCommitment: sha('local'), dispatchId: sha('dispatch'),
    chainDomain: action.chainDomain, evidencePolicy: nativeRuleCommitment(rule), actionCommitment: nativeTransferActionCommitment(action),
    payoutCommitment: payout, readyFrom: dependency.readyFrom, readyUntil: dependency.readyUntil };
  const readinessOpening = { domain, descriptor, readinessBlind: sha('readiness blind') };
  const ready = { ...dependency, readinessCommitment: await codec.readinessCommitment(d, dependency.joinCommitment, readinessOpening.readinessBlind, descriptor) };
  const request = { dependencyProof: { proof: 'ab'.repeat(32), publicInputs: [...encodeStatement('dependency', dependency)] },
    readyProof: { proof: 'cd'.repeat(32), publicInputs: [...encodeStatement('ready', ready)] }, readinessOpening,
    action, deliveryRiskSalt: salt, receiptSpendSecret: keySecret };
  const historyDigest = sha(Buffer.concat([Buffer.from([0x18]), Buffer.from(domain.scope, 'hex'), Buffer.from('00000001', 'hex'),
    Buffer.from(poolTree.root.slice(2), 'hex'), Buffer.alloc(64 * 32)]));
  const poolState = { rawState: abi([poolTree.root, poolSpent, '1', '1', '0', '1', '2', ...poolTree.leaves, ...zeros.map(p)]),
    rawHistory: abi(['1', p(historyDigest), '1', poolTree.root, ...zeros.map(p)]), rawBacking: abi(['1', '1000000', '1000000', '0', '0', '0']) };
  const control = { events: [], time: '1200', verifyCalls: [], transfers: 0, nativeSigns: 0, providerSigns: 0, sends: 0, observes: 0,
    commits: 0, rejectProof: null, badVerifyReturn: false, failCommit: null, loseWriteReply: null,
    loseSendReply: false, loseProviderReply: false, failFinalHead: false, failNativeFresh: false,
    preparationPatch: null, statePatch: null, healthPatch: null, observation: 'observed', changeSignedWire: false,
    throwBeforeCallback: false, throwAfterAuthorization: false, replayOnSigned: false };
  let durable = { revision: '0', state: createNativeDispatchJournal(binding) }, wire;
  const store = { async load() { return copy(durable); }, async commit({ expectedRevision, nextState }) {
    control.events.push('persist-' + nextState.journal?.phase); control.commits++; assert.equal(expectedRevision, durable.revision);
    if (control.failCommit === control.commits) throw new Error('TEST_FSYNC_FAILED');
    durable = { revision: String(BigInt(durable.revision) + 1n), state: copy(nextState) };
    if (control.loseWriteReply === control.commits) throw new Error('TEST_LOST_WRITE_REPLY'); return copy(durable);
  } };
  function health(currentSnapshot) {
    const message = { pool: binding.pool, domain: d, ...evidence, evidenceState,
      spentTagDigest: currentSnapshot.spentTagDigest.slice(2), spentTagCount: currentSnapshot.spentTagCount,
      spentTagSequence: currentSnapshot.spentTagSequence, stateSequence: currentSnapshot.hubStateSequence,
      revocationOverflowDigest: ZERO, revocationOverflowCount: '0', halted: currentSnapshot.halt,
      validFrom: control.time, validUntil: String(BigInt(control.time) + 20n) };
    const permit = { message, indexes: [0, 1, 2], signatures: attesters.slice(0, 3).map(pair => signLow(pair.privateKey, encodeFlatNativeHealth(message))) };
    control.healthPatch?.(permit); return permit;
  }
  function observation() {
    const currentSnapshot = { ...snapshot, timestamp: control.time };
    const value = { head: { number: '100', hash: sha('evm head'), timestamp: control.time }, domainCommitment: d,
      authorizationRoots: [authorizationRoot], checkpointSnapshot: snapshot,
      checkpointPath: { root: checkpointTree.root.slice(2), index: 0, siblings: path.siblings.map(item => item.slice(2)) }, checkpointCount: '1',
      snapshot: currentSnapshot, poolState, receiptLeaves, revokedEntries: zeros, spentTags: zeros,
      evidenceState, revocationOverflowDigest: ZERO, revocationOverflowCount: '0', health: health(currentSnapshot) };
    const cloned = copy(value); control.statePatch?.(cloned); return cloned;
  }
  const mintedReads = new WeakSet();
  const stateReader = { async read(query) {
    assert.deepEqual(query, { domainCommitment: d, authorizationRoot, checkpoint });
    const { health: ignored, ...dispatch } = observation(); const read = { dispatch };
    mintedReads.add(read); return read;
  }, async assertCurrent(read) { control.events.push('source-current'); assert.ok(mintedReads.has(read), 'TEST_READER_HEAD_BRAND');
    assert.equal(read.dispatch.head.timestamp, control.time);
    if (control.failFinalHead && control.transfers) throw new Error('TEST_HEAD_CHANGED'); } };
  const healthReader = { async read(query) {
    assert.deepEqual(query, { pool: binding.pool, domainCommitment: d }); return health({ ...snapshot, timestamp: control.time });
  } };
  const verifier = { async verify(value) {
    control.verifyCalls.push(copy(value)); assert.ok(['dependency', 'ready'].includes(value.relation));
    assert.deepEqual(value, { relation: value.relation, ...request[value.relation === 'dependency' ? 'dependencyProof' : 'readyProof'] });
    if (value.relation === control.rejectProof) throw new Error('TEST_SYNTHETIC_PROOF_REFUSAL');
    if (control.badVerifyReturn) return true;
  } }; syntheticVerifiers.add(verifier);
  const providerSigner = { publicKey: binding.providerKey, async signDispatch(statement) {
    control.events.push('provider-key'); control.providerSigns++;
    assert.equal(durable.state.journal.phase, 'NATIVE_SIGNED'); assert.equal(durable.state.journal.signed.nativeWire, wire);
    const signature = signLow(provider.privateKey, nativeDispatchStatementFrame(statement));
    if (control.loseProviderReply) throw new Error('TEST_PROVIDER_REPLY_LOST'); return signature;
  } };
  function prepared() {
    if (family === '3') {
      const intent = { descriptor: native.descriptor, receiptKeyCommitment: action.receiptKeyCommitment, proof: native.depositProof };
      const signed = signedDeliveryWire(intent), decoded = decodeCanonicalEvmTransaction('0x' + signed.nativeWire);
      const value = { genesis: p(native.genesis), head: { number: '0x64', hash: p(sha('evm head')), timestamp: '0x4b0' },
        transaction: Object.fromEntries(['chainId', 'from', 'to', 'nonce', 'gasPrice', 'gas', 'value', 'data'].map(name => [name, decoded[name]])),
        unsignedWire: decoded.unsignedWire, funds: { balanceWei: '10000000000000000000', estimatedGas: '900000', targetCodeHash: p(sha('router')) } };
      control.preparationPatch?.(value); return value;
    }
    if (family === '1') {
      // Public synthetic prior transaction, with no claim of a funded chain.
      const sourceTransaction = Buffer.concat([little('2', 4), Buffer.from([1]), Buffer.from(sha('fake source input'), 'hex'),
        little('0', 4), Buffer.from([0]), little('4294967294', 4), Buffer.from([1]), little('10000000', 8),
        Buffer.from([22]), Buffer.from(native.sourceEndpoint, 'hex'), Buffer.alloc(4)]).toString('hex');
      const sourceTxid = decodeBitcoinTransaction(sourceTransaction).txid;
      const intent = { sourceTxid, sourceVout: '0', sourceScript: native.sourceEndpoint, sourceSatoshi: '10000000',
        recipientScript: native.destinationEndpoint, amountSatoshi: action.amount, changeScript: native.changeEndpoint,
        feeSatoshi: '1000', wireKeyCommitment: action.receiptKeyCommitment };
      const value = { genesis: native.genesis, intent, unsignedWire: encodeBitcoinBinding(intent), funds: {
        nativeHead: { id: sha('native BTC head'), height: '100' }, sourceTransaction, sourceTxid, sourceVout: '0',
        sourceSatoshi: intent.sourceSatoshi, sourceScript: native.sourceEndpoint, sourceConfirmations: '10', sourceCoinbase: false,
        spendable: true, solvable: true, safe: true, sourceOwnedScript: native.sourceEndpoint, changeOwnedScript: native.changeEndpoint } };
      control.preparationPatch?.(value); return value;
    }
    const intent = { sourcePublicKey: native.sourceEndpoint, recipientPublicKey: native.destinationEndpoint,
      recentBlockhash: sha('recent blockhash'), lamports: action.amount, wireKeyCommitment: action.receiptKeyCommitment };
    const value = { genesis: native.genesis, intent, unsignedWire: encodeSolanaBindingMessage(intent), funds: {
      nativeHead: { id: sha('native head'), height: '100' }, sourceAccount: { publicKey: native.sourceEndpoint, exists: true, owner: ZERO, executable: false, lamports: '10000000' },
      recipientAccount: { publicKey: native.destinationEndpoint, exists: true, owner: ZERO, executable: false, lamports: '1000000' },
      feeLamports: '5000', lastValidBlockHeight: '150', memoProgram: copy(memo) } };
    control.preparationPatch?.(value); return value;
  }
  const nativeAdapter = { binding: native, async assertPrepared(value) {
    control.events.push('native-fresh'); assert.deepEqual(value, prepared()); if (control.failNativeFresh) throw new Error('TEST_NATIVE_HEAD_CHANGED');
  }, async transfer(terms, callbacks) {
    control.transfers++; assert.deepEqual(terms, { amount: action.amount, wireKeyCommitment: action.receiptKeyCommitment });
    assert.equal(durable.state.journal.phase, 'INTENT');
    if (control.throwBeforeCallback) throw new Error('TEST_UNKNOWN_PREPARATION_OUTCOME');
    const value = prepared(); await callbacks.beforeSign(value);
    if (control.throwAfterAuthorization) throw new Error('TEST_UNKNOWN_SIGNING_OUTCOME');
    control.events.push('native-key'); control.nativeSigns++;
    if (family === '3') wire = signedDeliveryWire({ descriptor: native.descriptor, receiptKeyCommitment: action.receiptKeyCommitment, proof: native.depositProof }).nativeWire;
    else if (family === '1') wire = signBitcoinSynthetic(value.intent, source);
    else {
      const message = Buffer.from(value.unsignedWire, 'hex'), signature = sign(null, message, source.privateKey);
      wire = Buffer.concat([Buffer.from([1]), signature, message]).toString('base64');
    }
    const raw = { nativeWire: control.changeSignedWire ? wire.slice(0, -1) : wire };
    if (family === '3') { const decoded = decodeCanonicalEvmTransaction(p(wire));
      Object.assign(raw, { nativeWire: p(raw.nativeWire), nativeId: decoded.nativeId, transactionSHA256: decoded.transactionSHA256 }); }
    await callbacks.onSigned(raw);
    if (control.replayOnSigned) await callbacks.onSigned({ nativeWire: wire });
    assert.equal(durable.state.journal.phase, 'SIGNED'); assert.equal(durable.state.journal.signed.nativeWire, wire);
    assert.equal(typeof durable.state.journal.dispatchSignature, 'string'); control.events.push('broadcast'); control.sends++;
    if (control.loseSendReply) throw new Error('TEST_SEND_REPLY_LOST');
    const decoded = assertNativeDispatchSigned(binding, value, { nativeWire: wire });
    return { nativeId: decoded.nativeId, transactionSHA256: decoded.transactionSHA256 };
  }, async observe({ nativeId }) {
    control.observes++; assert.equal(nativeId, durable.state.journal.signed.nativeId);
    return { status: control.observation, nativeId, nativeWire: control.observation === 'observed' ? wire : null };
  } };
  const configuration = { binding, hashFields, verifier, providerSigner, nativeAdapter, stateReader, healthReader, store };
  return { configuration, request, binding, control, observation, prepared, health,
    durable: () => copy(durable), replace: value => { durable = copy(value); },
    open: () => createNativeDispatchGate(configuration) };
}

test('production factory has no unbranded verifier or request-supplied authority escape', async () => {
  const f = await fixture();
  await assert.rejects(createNativeDispatchGate({ ...f.configuration, verifier: { verify: async () => true } }), /TEST_SYNTHETIC_VERIFIER_BRAND/);
  const gate = await f.open();
  for (const extra of [{ verified: true }, { verifier: {} }, { rpc: 'http://not-an-owned-endpoint' }, { ownerKey: 'forbidden' }])
    await assert.rejects(gate.execute({ ...f.request, ...extra }));
  assert.equal(f.control.transfers, 0); assert.equal(f.control.verifyCalls.length, 0);
});

test('host boundary verifies both exact joined statements, persists native wire before provider signing and signature before send', async () => {
  const f = await fixture(), gate = await f.open(), result = await gate.execute(f.request);
  assert.deepEqual(f.control.verifyCalls.map(value => [value.relation, value.publicInputs.length]), [['dependency', 42], ['ready', 50]]);
  assert.equal(result.phase, 'BROADCAST'); assert.equal(result.dispatchStatement.globalEffectId, result.globalEffectId);
  assert.equal(result.dispatchStatement.signedAt, '1200'); assert.equal(result.dispatchSignature.length, 128);
  assert.equal(f.control.nativeSigns, 1); assert.equal(f.control.providerSigns, 1); assert.equal(f.control.sends, 1);
  assert.doesNotMatch(JSON.stringify(f.durable()), /receiptSpendSecret|privateKey|seed|ownerKey/);
  assert.ok(!JSON.stringify(f.durable()).includes(f.request.receiptSpendSecret));
  assert.deepEqual(Object.keys(gate), ['execute', 'reconcile', 'report', 'close']);
  const again = await gate.execute(f.request);
  assert.equal(again.phase, 'OBSERVED'); assert.equal(f.control.observes, 1);
  assert.equal(f.control.transfers, 1); assert.equal(f.control.sends, 1); assert.equal(f.control.nativeSigns, 1);
});

test('proof refusal or boolean result fails before native preparation or journal claim', async () => {
  for (const bad of ['dependency', 'ready', 'boolean']) {
    const f = await fixture(); if (bad === 'boolean') f.control.badVerifyReturn = true; else f.control.rejectProof = bad;
    const gate = await f.open(); await assert.rejects(gate.execute(f.request));
    assert.equal(f.control.transfers, 0); assert.equal(f.control.commits, 0);
  }
});

test('P/R mismatch, changed seal/action/K, noncanonical integer/hex and unknown fields fail before key use', async () => {
  const f = await fixture();
  for (const mutate of [
    request => { request.dependencyProof.publicInputs[32] = String(BigInt(request.dependencyProof.publicInputs[32]) ^ 1n); },
    request => { request.readinessOpening.descriptor.readyUntil = '1401'; },
    request => { request.readinessOpening.readinessBlind = sha('changed blind'); },
    request => { request.action.amount = '50001'; }, request => { request.receiptSpendSecret = sha('wrong secret'); },
    request => { request.readyProof.publicInputs[49] += '\n'; }, request => { request.readyProof.proof += '\n'; },
    request => { request.deliveryRiskSalt += '\r'; },
  ]) { const changed = copy(f.request); mutate(changed); await assert.rejects(assertNativeDispatchBinding(f.binding, changed, { hashFields })); }
});

test('current state rejects stale checkpoint, changed G, halt, backing deficit, bad vector and health disagreement', async () => {
  const f = await fixture(), { intent } = await assertNativeDispatchBinding(f.binding, f.request, { hashFields });
  const valid = f.observation();
  await assertNativeDispatchState(f.binding, intent, valid, { hashFields });
  for (const mutate of [
    state => { state.snapshot.hubStateSequence = '2'; }, state => { state.authorizationRoots = [field('wrong G')]; },
    state => { state.snapshot.halt = '1'; }, state => { state.poolState.rawBacking = abi(['1', '1000000', '999999', '0', '1', '0']); },
    state => { state.revokedEntries[0] = sha('unregistered adverse identity'); },
    state => { state.receiptLeaves[63] = ZERO; },
    state => { state.health.signatures[0] = '01'.repeat(64); }, state => { state.health.indexes = [0, 0, 2]; },
    state => { state.health.signatures.pop(); }, state => { state.health.message.stateSequence = '2'; },
    state => { state.health.message.validUntil = state.snapshot.timestamp; },
    state => { state.checkpointPath.siblings[0] = sha('bad path'); },
  ]) { const changed = copy(valid); mutate(changed); await assert.rejects(assertNativeDispatchState(f.binding, intent, changed, { hashFields })); }
  f.control.time = '1400'; await assert.rejects(assertNativeDispatchState(f.binding, intent, f.observation(), { hashFields }), /OUTSIDE_READY/);
});

test('flat health has exact 21 H4 parts and canonical fields; three genuine ordered signatures are necessary', async () => {
  const f = await fixture(), permit = f.health(f.observation().snapshot), frame = encodeFlatNativeHealth(permit.message);
  const parts = []; for (let i = 0; i < frame.length;) { const n = frame.readUInt32BE(i); i += 4; parts.push(frame.subarray(i, i + n)); i += n; }
  assert.equal(parts.length, 21); assert.equal(parts[0].toString(), 'LIANUM/PAEG/flat-native-health/1');
  assert.equal(parts[1].toString(), 'LIANUM_PAEG_P2_V1');
  assert.deepEqual(parts.slice(2).map(value => value.length), [20, 32, 32, 32, 32, 32, 4, 32, 4, 8, 32, 4, 8, 8, 32, 8, 1, 8, 8]);
  assert.equal(flatNativeHealthDigest(permit.message), sha(frame));
  const { validFrom, validUntil, ...state } = permit.message;
  assert.equal(assertFlatNativeHealth(permit, { ...state, timestamp: validFrom }, f.binding.registry), undefined);
  for (const suffix of ['\n', '\r']) assert.throws(() => encodeFlatNativeHealth({ ...permit.message, validUntil: validUntil + suffix }));
  const high = copy(permit); high.signatures[0] = high.signatures[0].slice(0, 64) + (ORDER - BigInt('0x' + high.signatures[0].slice(64))).toString(16).padStart(64, '0');
  assert.throws(() => assertFlatNativeHealth(high, { ...state, timestamp: validFrom }, f.binding.registry));
});

test('SOL funds, expiry, exact Memo code and native freshness are mandatory before native signing', async () => {
  for (const mutate of [
    value => { value.funds.sourceAccount.lamports = '1'; }, value => { value.funds.sourceAccount.owner = sha('wrong owner'); },
    value => { value.funds.lastValidBlockHeight = value.funds.nativeHead.height; },
    value => { value.funds.memoProgram.dataBase64 = Buffer.from('wrong executable').toString('base64'); },
    value => { value.intent.wireKeyCommitment = sha('wrong K'); },
  ]) {
    const f = await fixture(); f.control.preparationPatch = mutate; const gate = await f.open();
    await assert.rejects(gate.execute(f.request)); assert.equal(f.control.nativeSigns, 0); assert.equal(f.control.sends, 0);
    assert.equal(gate.report().phase, 'PRE_SIGN_REJECTED');
  }
  const f = await fixture(); f.control.failNativeFresh = true; const gate = await f.open();
  await assert.rejects(gate.execute(f.request), /NATIVE_HEAD_CHANGED/); assert.equal(f.control.nativeSigns, 0);
});

test('only the exact unfinished beforeSign exception permits retry; fixed-head drift is checked immediately before signing', async () => {
  const f = await fixture(); f.control.failFinalHead = true; const gate = await f.open();
  await assert.rejects(gate.execute(f.request), /HEAD_CHANGED/); assert.equal(gate.report().phase, 'PRE_SIGN_REJECTED');
  assert.equal(f.control.nativeSigns, 0); f.control.failFinalHead = false;
  await gate.execute(f.request); assert.equal(f.control.nativeSigns, 1);
  for (const hook of ['throwBeforeCallback', 'throwAfterAuthorization']) {
    const other = await fixture(); other.control[hook] = true; const uncertain = await other.open();
    await assert.rejects(uncertain.execute(other.request)); assert.equal(uncertain.report().phase, 'UNCERTAIN');
    other.control[hook] = false;
    await assert.rejects(uncertain.execute(other.request), /NO_KNOWN_IDENTITY_NO_RESEND/);
    assert.equal(other.control.transfers, 1);
  }
});

test('lost provider/send reply and duplicate signed callback retain identity and never sign or send twice', async () => {
  for (const hook of ['loseProviderReply', 'loseSendReply', 'replayOnSigned']) {
    const f = await fixture(); f.control[hook] = true; const gate = await f.open();
    await assert.rejects(gate.execute(f.request)); assert.equal(gate.report().phase, 'UNCERTAIN');
    const before = { native: f.control.nativeSigns, provider: f.control.providerSigns, sends: f.control.sends };
    assert.ok(f.durable().state.journal.signed.nativeId);
    const recovered = await f.open(); await recovered.execute(f.request);
    assert.deepEqual({ native: f.control.nativeSigns, provider: f.control.providerSigns, sends: f.control.sends }, before);
    assert.equal(f.control.transfers, 1);
  }
});

test('failed persistence blocks every subsequent operation; a lost write reply reopens without resend', async () => {
  for (const failure of [1, 2, 3, 4]) {
    const f = await fixture(); f.control.failCommit = failure; const gate = await f.open();
    await assert.rejects(gate.execute(f.request), /PERSISTENCE_UNCERTAIN/);
    assert.equal(f.control.sends, 0); assert.equal(gate.report().persistenceUncertain, true);
    await assert.rejects(gate.execute(f.request), /PERSISTENCE_UNCERTAIN/);
    await assert.rejects(gate.reconcile(), /PERSISTENCE_UNCERTAIN/);
  }
  const f = await fixture(); f.control.loseWriteReply = 3; const gate = await f.open();
  await assert.rejects(gate.execute(f.request), /PERSISTENCE_UNCERTAIN/); assert.equal(f.control.sends, 0);
  const recovered = await f.open(); await recovered.reconcile();
  assert.equal(f.control.nativeSigns, 1); assert.equal(f.control.providerSigns, 0); assert.equal(f.control.sends, 0);
});

test('unknown/adverse identity observations never authorize resend; adverse remains durably latched', async () => {
  const f = await fixture(), gate = await f.open(); await gate.execute(f.request);
  for (const status of ['pending', 'unknown', 'unavailable']) {
    f.control.observation = status; await assert.rejects(gate.reconcile(), /NO_RESEND/);
  }
  f.control.observation = 'adverse'; await assert.rejects(gate.reconcile(), /ADVERSE_NO_RESEND/);
  assert.equal(gate.report().phase, 'ADVERSE'); f.control.observation = 'observed';
  const recovered = await f.open(); await assert.rejects(recovered.reconcile(), /ADVERSE_LATCHED/);
  assert.equal(f.control.nativeSigns, 1); assert.equal(f.control.sends, 1);
});

test('modified durable state and rebound requests are refused without another transfer', async () => {
  const f = await fixture(), gate = await f.open(); await gate.execute(f.request);
  const request = copy(f.request); request.readyProof.proof = 'ef'.repeat(32);
  await assert.rejects(gate.execute(request)); assert.equal(f.control.transfers, 1);
  const durable = f.durable(); durable.revision = '0'; f.replace(durable);
  await assert.rejects(gate.reconcile(), /STORE_CHANGED/); assert.equal(f.control.sends, 1);
});

test('BTC source value, mature owned safe UTXO, fixed change, fee and witnessed K-binding wire are mandatory', async () => {
  const valid = await fixture('1'), gate = await valid.open();
  const result = await gate.execute(valid.request);
  assert.equal(result.nativeId.length, 64); assert.equal(result.phase, 'BROADCAST');
  assert.equal(valid.control.nativeSigns, 1); assert.equal(valid.control.sends, 1);
  const { intent } = await assertNativeDispatchBinding(valid.binding, valid.request, { hashFields });
  const prepared = valid.prepared();
  assert.throws(() => assertNativeDispatchSigned(valid.binding, prepared, { nativeWire: prepared.unsignedWire }), /UNSIGNED_NATIVE/);
  for (const mutate of [
    value => { value.funds.sourceConfirmations = '0'; }, value => { value.funds.safe = false; },
    value => { value.funds.spendable = false; }, value => { value.funds.solvable = false; },
    value => { value.funds.sourceCoinbase = true; }, value => { value.funds.sourceSatoshi = '1'; },
    value => { value.funds.sourceTransaction = value.funds.sourceTransaction.replace('02000000', '01000000'); },
    value => { value.funds.changeOwnedScript = value.intent.recipientScript; },
    value => { value.intent.feeSatoshi = '10001'; },
    value => { value.intent.wireKeyCommitment = sha('changed BTC K'); },
  ]) { const changed = copy(prepared); mutate(changed); assert.throws(() => assertNativeDispatchPrepared(valid.binding, intent, changed)); }
});

test('bootstrap method replacement cannot bypass captured current-state/native/store authority', async () => {
  const f = await fixture(), gate = await f.open();
  f.configuration.stateReader.assertCurrent = async () => undefined;
  f.configuration.nativeAdapter.assertPrepared = async () => undefined;
  f.configuration.store.load = async () => { throw new Error('REPLACED_STORE_MUST_NOT_RUN'); };
  f.configuration.providerSigner.signDispatch = async () => '00'.repeat(64);
  f.control.failFinalHead = true;
  await assert.rejects(gate.execute(f.request), /HEAD_CHANGED/);
  assert.equal(f.control.nativeSigns, 0); assert.equal(f.control.sends, 0);
  f.control.failFinalHead = false; f.control.failNativeFresh = true;
  await assert.rejects(gate.execute(f.request), /NATIVE_HEAD_CHANGED/);
  f.control.failNativeFresh = false; await gate.execute(f.request);
  assert.equal(f.control.providerSigns, 1); assert.equal(f.control.sends, 1);
});

test('missing SOL recipient is explicit, zero, and allowed; missing source is refused', async () => {
  const f = await fixture(); f.control.preparationPatch = value => {
    value.funds.recipientAccount.exists = false; value.funds.recipientAccount.lamports = '0';
  };
  const gate = await f.open(); await gate.execute(f.request); assert.equal(f.control.sends, 1);
  const { intent } = await assertNativeDispatchBinding(f.binding, f.request, { hashFields });
  const nonzero = f.prepared(); nonzero.funds.recipientAccount.lamports = '1';
  assert.throws(() => assertNativeDispatchPrepared(f.binding, intent, nonzero), /MISSING_RECIPIENT_BALANCE/);
  const absent = f.prepared(); absent.funds.sourceAccount.exists = false;
  assert.throws(() => assertNativeDispatchPrepared(f.binding, intent, absent), /SOURCE_ACCOUNT_MISSING/);
});


test('EVM full call and canonical event0 GID use the original joined gate and durable ordering', async () => {
  const f = await fixture('3'), gate = await f.open(), result = await gate.execute(f.request);
  assert.equal(result.phase, 'BROADCAST'); assert.match(result.nativeWire, /^[0-9a-f]+$/);
  assert.equal(result.nativeId.length, 64); assert.equal(result.globalEffectId.length, 64);
  assert.equal(f.binding.quote.action.amount, '50000'); assert.equal(f.binding.native.descriptor.route.assetAmount, '234');
  assert.deepEqual(f.control.verifyCalls.map(value => value.relation), ['dependency', 'ready']);
  const events = f.control.events, before = events.lastIndexOf('source-current');
  assert.equal(events[before - 1], 'native-fresh'); assert.equal(events[before + 1], 'native-key');
  assert.ok(events.indexOf('persist-NATIVE_SIGNED') < events.indexOf('provider-key'));
  assert.ok(events.indexOf('provider-key') < events.indexOf('persist-SIGNED'));
  assert.ok(events.indexOf('persist-SIGNED') < events.indexOf('broadcast'));
  gate.close(); const reopened = await f.open(), reconciled = await reopened.reconcile();
  assert.equal(reconciled.phase, 'OBSERVED'); assert.equal(reconciled.nativeId, result.nativeId);
  assert.equal(f.control.nativeSigns, 1); assert.equal(f.control.sends, 1);
});

test('EVM preparation substitutions reject before key use; full original D27 bytes remain frozen', async () => {
  for (const mutate of [x => { x.transaction.from = p('12'.repeat(20)); }, x => { x.transaction.to = p('13'.repeat(20)); },
    x => { x.transaction.value = '1'; }, x => { x.transaction.chainId = '1'; }, x => { x.transaction.gasPrice = '2'; },
    x => { x.transaction.nonce = '00'; }, x => { x.head.timestamp += '\n'; }, x => { x.funds.balanceWei = '1'; }, x => { x.funds.estimatedGas = '0'; },
    x => { x.transaction.data += '00'; }, x => { x.transaction.gas = '30000001'; }, x => { x.unsignedWire += '00'; }]) {
    const f = await fixture('3'); f.control.preparationPatch = mutate; const gate = await f.open();
    await assert.rejects(gate.execute(f.request)); assert.equal(f.control.nativeSigns, 0);
    assert.equal(f.durable().state.journal.phase, 'PRE_SIGN_REJECTED');
  }
  const f = await fixture('3'), prepared = f.prepared(), signed = signedDeliveryWire({ descriptor: f.binding.native.descriptor,
    receiptKeyCommitment: f.request.action.receiptKeyCommitment, proof: f.binding.native.depositProof });
  for (const patch of [{ nativeId: p(sha('wrong id')) }, { transactionSHA256: sha('wrong sha') }])
    assert.throws(() => assertNativeDispatchSigned(f.binding, prepared,
      { nativeWire: p(signed.nativeWire), nativeId: p(signed.nativeId), transactionSHA256: signed.transactionSHA256, ...patch }));
  for (const change of [x => { x.native.depositProof = 'cafebabe'; },
    x => { x.native.descriptor.publicInputs[26] = word(123); }, x => { x.native.descriptor.route.assetAmount = '235'; },
    x => { x.native.descriptor.route.executionUntil = '1899'; }]) {
    const rebound = copy(f.binding); change(rebound);
    assert.throws(() => assertNativeDispatchSigned(rebound, prepared, { nativeWire: signed.nativeWire }));
  }
});

test('EVM uncertain signing, provider retention and raw broadcast keep original identity and never resend', async () => {
  for (const mode of ['loseProviderReply', 'loseSendReply']) {
    const f = await fixture('3'); f.control[mode] = true; const gate = await f.open();
    await assert.rejects(gate.execute(f.request)); assert.equal(f.durable().state.journal.phase, 'UNCERTAIN');
    f.control.observation = 'unknown'; await assert.rejects(gate.reconcile(), /UNKNOWN_NO_RESEND/);
    f.control.observation = 'adverse'; await assert.rejects(gate.reconcile(), /ADVERSE_NO_RESEND/);
    assert.equal(f.durable().state.journal.phase, 'ADVERSE');
    const signs = f.control.nativeSigns; await assert.rejects(gate.execute(f.request), /ADVERSE_LATCHED/);
    assert.equal(f.control.nativeSigns, signs); assert.equal(f.control.transfers, 1);
  }
});
