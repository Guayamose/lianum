/** Host-boundary tests only: synthetic keys, fake owned observations/stores.
 * No native network/finality acceptance, proof run or independent operators.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { encodeSolanaNonceBindingMessage } from '../../../../src/chains/solana/runtime/owned-solana-nonce-binding.mjs';
import { encodeSolanaBindingMessage, encodeBitcoinBinding, validateBitcoinBinding, nativeFactIdentity } from '@lianum/engine/native/native-receipt-binding';
import { createNativeFactsSigner, createNativeFactsPeer, createNativeFactsCollector,
  createNativeFactsInventory, createNativeClaimFactsSigner, createNativeClaimFactsPeer,
  createNativeClaimFactsCollector, createNativeClaimFactsInventory, CLAIM_FACTS_INVENTORY_SCHEMA,
  nativeFactsRegistryCommitment, FACTS_QUORUM_PROFILE,
  FACTS_PEER_ASSURANCE } from '../../../../src/chains/shared/dispatch/native-facts-peer.mjs';
import { nativeRuleCommitment } from '@lianum/engine/native/native-receipt-binding';
import { evmDeliveryFixture, signedDeliveryWire } from '../../../fixtures/chains/evm/transfers/test-fixtures/evm-delivery-wire.mjs';
import { evmVaultDeliveryDescriptorCommitment } from '@lianum/engine/encoding/evm-vault-delivery';

const sha = value => createHash('sha256').update(value).digest('hex');
const copy = value => structuredClone(value);
const ZERO = '0'.repeat(64);
const ORDER = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
const point = key => { const j = key.export({ format: 'jwk' });
  return { x: Buffer.from(j.x, 'base64url').toString('hex'), y: Buffer.from(j.y, 'base64url').toString('hex') }; };

function fixture(family = '2', claim = false) {
  const makeSigner = claim ? createNativeClaimFactsSigner : createNativeFactsSigner;
  const makeInventory = claim ? createNativeClaimFactsInventory : createNativeFactsInventory;
  const makeFactsPeer = claim ? createNativeClaimFactsPeer : createNativeFactsPeer;
  const makeCollector = claim ? createNativeClaimFactsCollector : createNativeFactsCollector;
  const evm = family === '3' ? evmDeliveryFixture() : null;
  const attesters = Array.from({ length: 4 }, () => generateKeyPairSync('ec', { namedCurve: 'secp256k1' }));
  const source = generateKeyPairSync('ed25519');
  const sourceEndpoint = evm ? evm.identity.solver : family === '2' ? Buffer.from(source.publicKey.export({ format: 'jwk' }).x, 'base64url').toString('hex')
    : '0014' + createHash('ripemd160').update(createHash('sha256').update(Buffer.from('0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798', 'hex')).digest()).digest('hex');
  const destinationEndpoint = evm ? evm.identity.router : family === '2' ? sha('recipient') : '0014' + sha('recipient').slice(0, 40);
  const recipients = [{ recipientIndex: '0', sourceEndpoint, destinationEndpoint }];
  const rule = { family, genesis: sha('genesis'), asset: evm ? evm.rule.asset : sha('native-asset'), finalityKind: family,
    minimumConfirmations: family === '1' ? '6' : family === '3' ? '1' : '0', maximumEvidenceLifetime: '120', maximumClockSkew: '30' };
  const siblings = [ZERO, ZERO, ZERO]; let root = nativeRuleCommitment(rule);
  for (const sibling of siblings) root = sha(Buffer.concat([Buffer.from([1]), Buffer.from(root, 'hex'), Buffer.from(sibling, 'hex')]));
  const registry = { profile: FACTS_QUORUM_PROFILE, hubDomain: sha('hub'), registryEpoch: '1', rulesRoot: root,
    keys: attesters.map(pair => point(pair.publicKey)) };
  const policy = { ledgerNamespace: evm ? evm.identity.ledgerNamespace : registry.hubDomain, hubDomain: registry.hubDomain,
    registryCommitment: nativeFactsRegistryCommitment(registry), rule };
  let time = '1000', head = sha('head-1000');
  const clock = Object.freeze({ async read() { return { timestamp: time, head }; },
    async assertCurrent(expected) { assert.deepEqual(expected, { timestamp: time, head }, 'FIXED_HEAD_CHANGED'); } });
  const advance = timestamp => { time = timestamp; head = sha('head-' + timestamp); };
  const observations = new Map(), readerCalls = [];
  const reader = { async observe(request) {
    assert.deepEqual(Object.keys(request).sort(), ['family', 'nativeId', 'recipientIndex']);
    readerCalls.push(copy(request));
    const record = observations.get(request.nativeId);
    if (record instanceof Error) throw record;
    return copy(record ?? { status: 'unknown', reason: 'UNKNOWN_NATIVE_ID' });
  } };
  function addNative(label = 'one', amount = '12345', durableNonce = false) {
    const K = sha('K-' + label); let nativeWire, intent, nativeId;
    if (family === '3') {
      ({ nativeWire, intent, nativeId } = evmDeliveryFixture(label, amount));
    } else if (family === '2') {
      intent = { sourcePublicKey: sourceEndpoint, recipientPublicKey: destinationEndpoint,
        recentBlockhash: sha('blockhash-' + label), lamports: amount, wireKeyCommitment: K };
      if (durableNonce) {
        intent.nonceAccountPublicKey = sha('nonce-' + label); intent.durableNonce = intent.recentBlockhash; delete intent.recentBlockhash;
      }
      const message = Buffer.from((durableNonce ? encodeSolanaNonceBindingMessage : encodeSolanaBindingMessage)(intent), 'hex');
      const signature = sign(null, message, source.privateKey);
      nativeWire = Buffer.concat([Buffer.from([1]), signature, message]).toString('base64'); nativeId = signature.toString('hex');
    } else {
      intent = { sourceTxid: sha('prevout-' + label), sourceVout: '0', sourceScript: sourceEndpoint,
        sourceSatoshi: '100000', recipientScript: destinationEndpoint, amountSatoshi: amount,
        changeScript: '0014' + sha('change').slice(0, 40), feeSatoshi: '1000', wireKeyCommitment: K };
      const raw = encodeBitcoinBinding(intent);
      // Syntactically canonical synthetic BTC witness, not a valid UTXO spend.
      nativeWire = raw.slice(0, 8) + '0001' + raw.slice(8, -8)
        + '0209300602010102010101210279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798' + raw.slice(-8);
      nativeId = validateBitcoinBinding(nativeWire, intent).txid;
    }
    const request = { family, recipientIndex: '0', nativeId, wireKeyCommitment: K };
    const observed = { status: 'observed', genesis: rule.genesis, asset: rule.asset, nativeWire, intent,
      blockId: sha('block-' + label), blockHeight: '50', finalityKind: family, confirmations: family !== '2' ? '6' : '0',
      nativeContext: family !== '2' ? { observedTipId: sha('tip'), observedTipHeight: '55', transactionSlot: '0', parentSlot: '0', observedSlot: '0' }
        : { observedTipId: ZERO, observedTipHeight: '0', transactionSlot: '60', parentSlot: '59', observedSlot: '64' } };
    observations.set(nativeId, observed); return { request, observed };
  }
  async function makePeer(index, hooks = {}) {
    const signerBase = makeSigner({ privateKey: attesters[index].privateKey, policy });
    const config = { policy, signerIndex: String(index), publicKey: signerBase.publicKey, recipients };
    let durable = { revision: '0', state: makeInventory(config) }, signCount = 0, commitCount = 0;
    const control = { failCommit: null, loseAfterWrite: null, loadError: false,
      snapshot: () => copy(durable), replace: snapshot => { durable = copy(snapshot); }, signCount: () => signCount,
      commitCount: () => commitCount };
    const store = { async load() { if (control.loadError) throw new Error('UNAVAILABLE_STORE'); return copy(durable); },
      async commit({ expectedRevision, nextState }) {
        commitCount++;
        assert.equal(expectedRevision, durable.revision);
        if (control.failCommit === commitCount) throw new Error('FSYNC_FAILED');
        durable = { revision: String(BigInt(durable.revision) + 1n), state: copy(nextState) };
        if (control.loseAfterWrite === commitCount) throw new Error('LOST_DURABLE_WRITE_REPLY');
        return copy(durable);
      } };
    const signer = { publicKey: signerBase.publicKey, async signFacts(facts) {
      signCount++;
      // Registration and expiry coverage must already be in durable storage.
      const entry = durable.state.entries.find(entry => entry.facts.nativeGid === facts.nativeGid);
      assert.ok(entry); assert.ok(BigInt(entry.maximumEvidenceUntil) >= BigInt(facts.observation.evidenceUntil));
      await hooks.beforeSign?.(facts, control);
      return signerBase.signFacts(facts);
    } };
    const peerReader = { async observe(request) {
      const value = await reader.observe(request); await hooks.afterObserve?.(request, control); return value;
    } };
    const input = { policy, signerIndex: String(index), recipients, signer, reader: peerReader, clock, store };
    return { peer: await makeFactsPeer(input), control, input, reopen: () => makeFactsPeer(input) };
  }
  const collector = () => makeCollector({ policy, registry, rulePath: { index: '0', siblings }, clock });
  return { policy, registry, siblings, recipients, clock, advance, observations, readerCalls, addNative, makePeer, collector, attesters };
}

test('host boundary: three distinct facts peers produce the exact I84 frame and no keys leak', async () => {
  const f = fixture(), native = f.addNative(), peers = await Promise.all([0, 1, 2].map(i => f.makePeer(i)));
  const certificates = await Promise.all(peers.map(({ peer }) => peer.certify(native.request)));
  const bundle = await f.collector().collect({ certificates });
  assert.equal(bundle.frameHex.length, 829 * 2); assert.equal(bundle.digest, sha(Buffer.from(bundle.frameHex, 'hex')));
  assert.deepEqual(bundle.indexes, ['0', '1', '2']); assert.equal(bundle.assurance, FACTS_PEER_ASSURANCE);
  for (const { peer, control } of peers) {
    assert.deepEqual(Object.keys(peer).sort(), ['assurance', 'auditInventory', 'certify', 'publicKey', 'refresh', 'signerIndex']);
    assert.equal(control.snapshot().state.entries.length, 1);
    assert.equal(control.snapshot().state.entries[0].signature.length, 128);
    assert.equal(control.signCount(), 1);
    assert.ok(!JSON.stringify(peer).includes('private'));
    assert.equal((await peer.auditInventory()).ready, true);
  }
});

test('identical live audits keep every fresh read and exact certificate without identical commits', async () => {
  for (const [family, claim] of [['1', false], ['2', false], ['3', false], ['1', true], ['2', true]]) {
    const f = fixture(family, claim), native = f.addNative(), p = await f.makePeer(0);
    const certificate = await p.peer.certify(native.request), before = p.control.snapshot();
    const commits = p.control.commitCount(), reads = f.readerCalls.length, signs = p.control.signCount();
    assert.equal((await p.peer.auditInventory()).ready, true);
    assert.equal((await p.peer.auditInventory()).ready, true);
    assert.equal(f.readerCalls.length, reads + 2);
    assert.equal(p.control.commitCount(), commits);
    assert.deepEqual(p.control.snapshot(), before);
    assert.equal(p.control.signCount(), signs);
    assert.deepEqual(await p.peer.certify(native.request), certificate);
    assert.equal(p.control.signCount(), signs);
  }
});

test('changed audit clocks and statuses retain original commits, including repeated unknown results', async () => {
  const f = fixture(), native = f.addNative(), p = await f.makePeer(0);
  await p.peer.certify(native.request);
  let before = p.control.snapshot(), commits = p.control.commitCount();
  const changed = async (status, ready) => {
    assert.equal((await p.peer.auditInventory()).ready, ready);
    const after = p.control.snapshot();
    assert.equal(after.revision, String(BigInt(before.revision) + 1n));
    assert.equal(p.control.commitCount(), ++commits);
    assert.equal(after.state.entries[0].status, status); before = after;
  };
  f.advance('1001'); await changed('live', true);
  assert.equal(before.state.lastClock, '1001'); assert.equal(before.state.entries[0].lastCheckedAt, '1001');
  assert.equal((await p.peer.auditInventory()).ready, true);
  assert.equal(p.control.commitCount(), commits);
  f.observations.set(native.request.nativeId, { status: 'unknown', reason: 'HISTORY_MISSING' });
  await changed('unknown', false); await changed('unknown', false);
  f.observations.set(native.request.nativeId, native.observed); await changed('live', true);
  f.observations.set(native.request.nativeId, { status: 'adverse', reason: 'CANONICAL_BLOCK_REORG' });
  await changed('adverse', false);
  f.observations.set(native.request.nativeId, native.observed);
  assert.equal((await p.peer.auditInventory()).ready, false);
  assert.deepEqual(p.control.snapshot(), before);
});

test('unchanged live mark rechecks persisted revision and state after observation and poisons on mutation', async () => {
  for (const mutate of [
    value => { value.revision = String(BigInt(value.revision) + 1n); },
    value => { value.state.entries[0].status = 'unknown'; value.state.entries[0].reason = 'EXTERNAL_CHANGE'; },
  ]) {
    const f = fixture(), native = f.addNative(); let armed = false;
    const p = await f.makePeer(0, { afterObserve(_request, control) {
      if (armed) { const changed = control.snapshot(); mutate(changed); control.replace(changed); }
    } });
    await p.peer.certify(native.request);
    const before = p.control.snapshot(), commits = p.control.commitCount(), reads = f.readerCalls.length;
    armed = true;
    await assert.rejects(p.peer.auditInventory(), error => {
      assert.equal(error.message, 'FACTS_PEER_DURABLE_WRITE_FAILED_REOPEN_REQUIRED');
      assert.equal(error.cause.message, 'FACTS_PEER_INVENTORY_CHANGED_REOPEN_REQUIRED'); return true;
    });
    assert.equal(f.readerCalls.length, reads + 1); assert.equal(p.control.commitCount(), commits);
    // Restoring identical bytes cannot make the poisoned live peer usable.
    armed = false; p.control.replace(before);
    await assert.rejects(p.peer.auditInventory(), /FACTS_PEER_REOPEN_REQUIRED/);
    assert.equal(f.readerCalls.length, reads + 1);
  }
});

test('unchanged live mark poisons on a fresh post-observation load failure', async () => {
  const f = fixture(), native = f.addNative(); let armed = false;
  const p = await f.makePeer(0, { afterObserve(_request, control) { if (armed) control.loadError = true; } });
  await p.peer.certify(native.request); const commits = p.control.commitCount(); armed = true;
  await assert.rejects(p.peer.auditInventory(), error => {
    assert.equal(error.message, 'FACTS_PEER_DURABLE_WRITE_FAILED_REOPEN_REQUIRED');
    assert.equal(error.cause.message, 'UNAVAILABLE_STORE'); return true;
  });
  assert.equal(p.control.commitCount(), commits);
  armed = false; p.control.loadError = false;
  await assert.rejects(p.peer.auditInventory(), /FACTS_PEER_REOPEN_REQUIRED/);
});

test('unchanged live mark still requires the same head after the fresh observation', async () => {
  const f = fixture(), native = f.addNative(); let armed = false;
  const p = await f.makePeer(0, { afterObserve() { if (armed) f.advance('1001'); } });
  await p.peer.certify(native.request); const before = p.control.snapshot(), commits = p.control.commitCount();
  armed = true; await assert.rejects(p.peer.auditInventory(), /FIXED_HEAD_CHANGED/);
  assert.equal(p.control.commitCount(), commits); assert.deepEqual(p.control.snapshot(), before);
});

test('claim peers authenticate effect 1 for nonce payouts, coexist with v1 ingress and preserve exact 829-byte certificates', async () => {
  const f = fixture('2', true), nonce = f.addNative('nonce', '12345', true), ingress = f.addNative('ingress');
  const peers = await Promise.all([0, 1, 2].map(i => f.makePeer(i)));
  const certificates = await Promise.all(peers.map(({ peer }) => peer.certify(nonce.request)));
  const bundle = await f.collector().collect({ certificates }), facts = bundle.facts;
  assert.equal(bundle.frameHex.length, 829 * 2);
  assert.deepEqual([facts.effectIndex, facts.wireBindingVersion, facts.wireBindingKind, facts.wireBindingPosition], ['1', '2', '2', '2']);
  const identity = { family: '2', genesis: f.policy.rule.genesis, asset: f.policy.rule.asset,
    transactionId: nonce.request.nativeId, effectIndex: '1' };
  assert.equal(facts.nativeGid, nativeFactIdentity(identity));
  assert.notEqual(facts.nativeGid, nativeFactIdentity({ ...identity, effectIndex: '0' }));
  const p = peers[0], repeated = await p.peer.certify(nonce.request);
  assert.deepEqual(repeated, certificates[0]); assert.equal(p.control.signCount(), 1);
  const old = await p.peer.certify(ingress.request); assert.equal(old.facts.effectIndex, '0');
  assert.equal(old.facts.wireBindingVersion, '1');
  f.advance('1010'); const refreshed = await (await p.reopen()).refresh(nonce.request);
  assert.equal(refreshed.facts.nativeGid, facts.nativeGid); assert.equal(refreshed.facts.observation.evidenceUntil, '1130');
  assert.equal(p.control.snapshot().state.schema, CLAIM_FACTS_INVENTORY_SCHEMA);
  assert.equal(p.control.snapshot().state.entries.length, 2);
  await assert.rejects(p.peer.certify({ ...nonce.request, wireKeyCommitment: sha('replacement-K') }));
  const collector = createNativeFactsCollector({ policy: f.policy, registry: f.registry,
    rulePath: { index: '0', siblings: f.siblings }, clock: f.clock });
  await assert.rejects(collector.collect({ certificates }));
});

test('claim BTC v1 remains exact, while generic SOL peers and signers reject nonce v2', async () => {
  const btc = fixture('1', true), native = btc.addNative(), { peer } = await btc.makePeer(0);
  const cert = await peer.certify(native.request);
  assert.equal(cert.facts.effectIndex, '0'); assert.equal(cert.facts.wireBindingVersion, '1');
  const strict = fixture(), payout = strict.addNative('nonce', '12345', true), generic = await strict.makePeer(0);
  await assert.rejects(generic.peer.certify(payout.request), /NATIVE_ADVERSE/);
  assert.equal(generic.control.signCount(), 0);
  const claim = fixture('2', true), valid = claim.addNative('nonce', '12345', true), p = await claim.makePeer(0);
  const certificate = await p.peer.certify(valid.request);
  const signer = createNativeFactsSigner({ privateKey: claim.attesters[0].privateKey, policy: claim.policy });
  assert.throws(() => signer.signFacts(certificate.facts));
});

test('claim constructors reject EVM, custom profile callbacks and generic inventory substitutions', async () => {
  const evm = fixture('3');
  const privateKey = evm.attesters[0].privateKey;
  assert.throws(() => createNativeClaimFactsSigner({ privateKey, policy: evm.policy }), /CLAIM_FAMILY/);
  assert.throws(() => createNativeClaimFactsCollector({ policy: evm.policy, registry: evm.registry,
    rulePath: { index: '0', siblings: evm.siblings }, clock: evm.clock }), /CLAIM_FAMILY/);
  const evmConfig = { policy: evm.policy, signerIndex: '0', publicKey: point(evm.attesters[0].publicKey), recipients: evm.recipients };
  assert.throws(() => createNativeClaimFactsInventory(evmConfig), /CLAIM_FAMILY/);
  const f = fixture('2', true), x = await f.makePeer(0);
  await assert.rejects(createNativeFactsPeer(x.input), /INVENTORY_CONFIGURATION/);
  const config = { policy: f.policy, signerIndex: '0', publicKey: x.input.signer.publicKey, recipients: f.recipients };
  const original = x.control.snapshot(), generic = createNativeFactsInventory(config);
  assert.notEqual(generic.configurationDigest, original.state.configurationDigest);
  x.control.replace({ ...original, state: generic });
  await assert.rejects(x.reopen(), /INVENTORY_CONFIGURATION/);
  const forged = copy(generic); forged.schema = CLAIM_FACTS_INVENTORY_SCHEMA;
  x.control.replace({ ...original, state: forged });
  await assert.rejects(x.reopen(), /INVENTORY_CONFIGURATION/);
  x.control.replace(original);
  for (const name of ['profile', 'validateFacts', 'encodeFacts', 'wireValidator']) {
    await assert.rejects(createNativeClaimFactsPeer({ ...x.input, [name]: () => true }), /FIELDS/);
    assert.throws(() => createNativeClaimFactsInventory({ ...config, [name]: () => true }), /FIELDS/);
    assert.throws(() => createNativeClaimFactsSigner({ policy: f.policy, privateKey: f.attesters[0].privateKey, [name]: () => true }), /FIELDS/);
  }
});

test('claim reopen rebuilds complete signed wire, request, tuple, signature and observed identities', async () => {
  const f = fixture('2', true), native = f.addNative('nonce', '12345', true), p = await f.makePeer(0);
  await p.peer.certify(native.request); const original = p.control.snapshot();
  for (const change of [e => { e.request.nativeId = '11'.repeat(64); }, e => { e.request.wireKeyCommitment = sha('other-K'); },
    e => { e.intent.durableNonce = sha('other-nonce'); }, e => { e.intent.nonceAccountPublicKey = sha('other-account'); },
    e => { e.nativeWire = e.nativeWire.slice(0, -4) + 'AAAA'; }, e => { e.facts.effectIndex = '0'; },
    e => { e.facts.wireBindingPosition = '1'; }, e => { e.facts.wireBindingVersion = '1'; },
    e => { e.facts.nativeGid = sha('other-gid'); }, e => { e.facts.transactionSHA256 = sha('other-wire'); },
    e => { e.facts.observation.amount = '54321'; }, e => { e.signature = '11'.repeat(64); }]) {
    const changed = copy(original); change(changed.state.entries[0]); p.control.replace(changed);
    await assert.rejects(p.reopen());
  }
  const duplicate = copy(original); duplicate.state.entries.push(copy(duplicate.state.entries[0]));
  p.control.replace(duplicate); await assert.rejects(p.reopen(), /INVENTORY_DUPLICATE/);
  p.control.replace(original); const reopened = await p.reopen();
  assert.equal((await reopened.refresh(native.request)).facts.nativeGid, original.state.entries[0].facts.nativeGid);
  await assert.rejects(reopened.refresh({ ...native.request, wireKeyCommitment: sha('replacement-K') }), /REISSUANCE_REQUEST_CHANGED/);
});

test('claim lost durable reply preserves effect-1 identity without duplicate issuance on reopen', async () => {
  const f = fixture('2', true), native = f.addNative('nonce', '12345', true), p = await f.makePeer(0);
  p.control.loseAfterWrite = 1;
  await assert.rejects(p.peer.certify(native.request), /DURABLE_WRITE_FAILED/);
  assert.equal(p.control.signCount(), 0); assert.equal(p.control.snapshot().state.entries[0].facts.effectIndex, '1');
  p.control.loseAfterWrite = null; const reopened = await p.reopen();
  const certificate = await reopened.refresh(native.request);
  assert.equal(certificate.facts.effectIndex, '1'); assert.equal(p.control.signCount(), 1);
  assert.equal(p.control.snapshot().state.entries.length, 1);
});

test('expired claim facts still block on unknown history and durably latch context rollback or failed payout', async () => {
  for (const failure of [{ status: 'adverse', reason: 'NONCE_ADVANCED_PAYMENT_FAILED' },
    { nativeContext: { observedTipId: ZERO, observedTipHeight: '0', transactionSlot: '60', parentSlot: '59', observedSlot: '63' } },
    { nativeContext: { observedTipId: ZERO, observedTipHeight: '0', transactionSlot: '61', parentSlot: '59', observedSlot: '64' } }]) {
    const f = fixture('2', true), native = f.addNative('nonce', '12345', true), p = await f.makePeer(0);
    await p.peer.certify(native.request); f.advance('5000');
    f.observations.set(native.request.nativeId, { status: 'unknown', reason: 'EXPIRED_HISTORY_MISSING' });
    assert.equal((await p.peer.auditInventory()).ready, false);
    assert.equal(p.control.snapshot().state.entries[0].status, 'unknown');
    f.observations.set(native.request.nativeId, native.observed);
    assert.equal((await p.peer.auditInventory()).ready, true);
    f.observations.set(native.request.nativeId, failure.status ? failure : { ...copy(native.observed), ...failure });
    assert.equal((await p.peer.auditInventory()).ready, false);
    assert.equal(p.control.snapshot().state.entries[0].status, 'adverse');
    f.observations.set(native.request.nativeId, native.observed);
    assert.equal((await (await p.reopen()).auditInventory()).ready, false);
  }
});

test('collector rejects one/two signatures, duplicate/unordered indexes, forged and high-S signatures', async () => {
  const f = fixture(), native = f.addNative(), peers = await Promise.all([0, 1, 2].map(i => f.makePeer(i)));
  const certificates = await Promise.all(peers.map(({ peer }) => peer.certify(native.request))), collector = f.collector();
  for (const bad of [certificates.slice(0, 1), certificates.slice(0, 2), [certificates[0], certificates[0], certificates[2]],
    [certificates[1], certificates[0], certificates[2]]]) await assert.rejects(collector.collect({ certificates: bad }));
  const forged = copy(certificates); forged[1].signature = certificates[0].signature;
  await assert.rejects(collector.collect({ certificates: forged }), /SIGNATURE_INVALID/);
  const high = copy(certificates), s = BigInt('0x' + high[0].signature.slice(64));
  high[0].signature = high[0].signature.slice(0, 64) + (ORDER - s).toString(16).padStart(64, '0');
  await assert.rejects(collector.collect({ certificates: high }), /SIGNATURE_LOW_S/);
  const altered = copy(certificates); altered[0].digest = sha('unrelated');
  await assert.rejects(collector.collect({ certificates: altered }), /CERTIFICATE_FRAME/);
  const aliasedRegistry = copy(f.registry); aliasedRegistry.keys[3] = copy(aliasedRegistry.keys[0]);
  assert.throws(() => nativeFactsRegistryCommitment(aliasedRegistry), /REGISTRY_KEY_ALIAS/);
});

test('collector rejects genuinely signed differing facts, expiry and wrong registry/rule pins', async () => {
  const f = fixture(), native = f.addNative(), p0 = await f.makePeer(0), p1 = await f.makePeer(1), p2 = await f.makePeer(2);
  const certificates = [await p0.peer.certify(native.request), await p1.peer.certify(native.request)];
  f.advance('1001'); certificates.push(await p2.peer.certify(native.request));
  await assert.rejects(f.collector().collect({ certificates }), /FACTS_DISAGREE/);
  f.advance('1121'); await assert.rejects(f.collector().collect({ certificates }), /CERTIFICATE_EXPIRED/);
  assert.throws(() => createNativeFactsCollector({ policy: { ...f.policy, registryCommitment: sha('wrong') }, registry: f.registry,
    rulePath: { index: '0', siblings: f.siblings }, clock: f.clock }), /REGISTRY_PIN/);
  assert.throws(() => createNativeFactsCollector({ policy: f.policy, registry: f.registry,
    rulePath: { index: '1', siblings: f.siblings }, clock: f.clock }), /RULE_MEMBERSHIP/);
});

test('idempotent reissuance retains one exact wire/GID and extends maximum certificate expiry', async () => {
  const f = fixture(), native = f.addNative(), { peer, control, reopen } = await f.makePeer(0);
  const original = await peer.certify(native.request), repeat = await peer.certify(native.request);
  assert.deepEqual(repeat, original); assert.equal(control.signCount(), 1);
  f.advance('1010'); const renewed = await peer.refresh(native.request);
  assert.equal(renewed.facts.nativeGid, original.facts.nativeGid);
  assert.equal(renewed.facts.transactionSHA256, original.facts.transactionSHA256);
  assert.equal(renewed.facts.wireKeyCommitment, original.facts.wireKeyCommitment);
  assert.equal(renewed.facts.observation.evidenceUntil, '1130');
  assert.equal(control.snapshot().state.entries.length, 1);
  assert.equal(control.snapshot().state.entries[0].maximumEvidenceUntil, '1130');
  const resumed = await reopen(); assert.deepEqual(await resumed.refresh(native.request), renewed);
  await assert.rejects(resumed.refresh({ ...native.request, wireKeyCommitment: sha('other') }), /REISSUANCE_REQUEST_CHANGED/);
});

test('unknown and unavailable native history refuse certificates; certified unknown facts block inventory health', async () => {
  const f = fixture(), native = f.addNative(), { peer, control } = await f.makePeer(0);
  await assert.rejects(peer.refresh(native.request), /REFRESH_UNKNOWN_ID/);
  f.observations.set(native.request.nativeId, { status: 'unknown', reason: 'HISTORY_MISSING' });
  await assert.rejects(peer.certify(native.request), /NATIVE_HISTORY_UNAVAILABLE/); assert.equal(control.signCount(), 0);
  f.observations.set(native.request.nativeId, native.observed); await peer.certify(native.request);
  f.observations.set(native.request.nativeId, new Error('RPC_DOWN'));
  const health = await peer.auditInventory(); assert.equal(health.ready, false);
  assert.equal(control.snapshot().state.entries[0].status, 'unknown');
  await assert.rejects(peer.refresh(native.request), /INVENTORY_BLOCKED/);
  f.observations.set(native.request.nativeId, native.observed);
  assert.equal((await peer.auditInventory()).ready, true);
});

test('adverse facts are persisted even when another inventory RPC fails; expiration never clears an adverse fact', async () => {
  const f = fixture(), a = f.addNative('a'), b = f.addNative('b'), { peer, control } = await f.makePeer(0);
  await peer.certify(a.request); await peer.certify(b.request);
  f.observations.set(a.request.nativeId, new Error('RPC_DOWN'));
  f.observations.set(b.request.nativeId, { status: 'adverse', reason: 'CANONICAL_BLOCK_REORG' });
  const report = await peer.auditInventory(); assert.equal(report.ready, false); assert.equal(report.blockers.length, 2);
  assert.deepEqual(control.snapshot().state.entries.map(entry => entry.status), ['unknown', 'adverse']);
  f.advance('5000'); assert.equal((await peer.auditInventory()).ready, false);
  f.observations.set(b.request.nativeId, b.observed);
  await assert.rejects(peer.refresh(b.request), /INVENTORY_BLOCKED/);
});

test('changed certified native block, endpoints, bytes or K fails closed and is durable', async () => {
  for (const change of [r => { r.blockId = sha('reorg'); }, r => { r.intent.recipientPublicKey = sha('wrong-recipient'); },
    r => { const wire = Buffer.from(r.nativeWire, 'base64'); wire[100] ^= 1; r.nativeWire = wire.toString('base64'); },
    r => { r.intent.wireKeyCommitment = sha('wrong-K'); }]) {
    const f = fixture(), native = f.addNative(), { peer, control } = await f.makePeer(0);
    await peer.certify(native.request); const changed = copy(native.observed); change(changed);
    f.observations.set(native.request.nativeId, changed);
    await assert.rejects(peer.refresh(native.request), /INVENTORY_BLOCKED/);
    assert.equal(control.snapshot().state.entries[0].status, 'adverse'); assert.equal(control.signCount(), 1);
  }
});

test('failed pre-sign durable write refuses signing and poisons peer until reopen', async () => {
  const f = fixture(), native = f.addNative(), { peer, control } = await f.makePeer(0);
  control.failCommit = 1;
  await assert.rejects(peer.certify(native.request), /DURABLE_WRITE_FAILED/);
  assert.equal(control.signCount(), 0); await assert.rejects(peer.auditInventory(), /REOPEN_REQUIRED/);
});

test('lost post-write reply preserves conservative inventory and reopens without duplicate GID', async () => {
  const f = fixture(), native = f.addNative(), { peer, control, reopen } = await f.makePeer(0);
  control.loseAfterWrite = 1;
  await assert.rejects(peer.certify(native.request), /DURABLE_WRITE_FAILED/);
  assert.equal(control.snapshot().state.entries.length, 1); assert.equal(control.signCount(), 0);
  control.loseAfterWrite = null; const resumed = await reopen(); await resumed.refresh(native.request);
  assert.equal(control.snapshot().state.entries.length, 1); assert.equal(control.signCount(), 1);
});

test('failed certificate write returns no signature, and fixed-head changes block return after signing', async () => {
  const f = fixture(), native = f.addNative(), { peer, control } = await f.makePeer(0);
  control.failCommit = 2;
  await assert.rejects(peer.certify(native.request), /DURABLE_WRITE_FAILED/);
  assert.equal(control.signCount(), 1); assert.equal(control.snapshot().state.entries[0].signature, null);
  const g = fixture(), second = g.addNative();
  const x = await g.makePeer(0, { beforeSign: () => g.advance('1001') });
  await assert.rejects(x.peer.certify(second.request), /FIXED_HEAD_CHANGED/);
  assert.equal(x.control.snapshot().state.entries.length, 1);
});

test('clock rollback, modified inventory and missing store fail closed', async () => {
  const f = fixture(), native = f.addNative(), x = await f.makePeer(0);
  await x.peer.certify(native.request); f.advance('999');
  await assert.rejects(x.peer.auditInventory(), /CLOCK_ROLLBACK/);
  f.advance('1000'); const changed = x.control.snapshot(); changed.revision = '0'; x.control.replace(changed);
  await assert.rejects(x.peer.auditInventory(), /INVENTORY_CHANGED_REOPEN_REQUIRED/);
  x.control.loadError = true; await assert.rejects(x.reopen(), /UNAVAILABLE_STORE/);
});

test('peer clock integer boundary rejects trailing LF and CR aliases', async () => {
  const f = fixture(), { peer } = await f.makePeer(0);
  for (const suffix of ['\n', '\r']) {
    f.advance('1000' + suffix);
    await assert.rejects(peer.auditInventory(), /FACTS_PEER_UINT/);
  }
});

test('exact request and signer shapes exclude workflow authority and arrays of private signers', async () => {
  const f = fixture(), native = f.addNative(), x = await f.makePeer(0);
  for (const field of ['ready', 'envelope', 'payout', 'ownerKey', 'graph', 'secret', 'verified'])
    await assert.rejects(x.peer.certify({ ...native.request, [field]: 'forbidden' }), /FIELDS/);
  await assert.rejects(createNativeFactsPeer({ ...x.input, signer: [x.input.signer] }), /FIELDS/);
  const getter = { ...native.request }; Object.defineProperty(getter, 'nativeId', { enumerable: true, get() { throw new Error('GETTER_EXECUTED'); } });
  await assert.rejects(x.peer.certify(getter), /FIELDS/);
  const dedicated = createNativeFactsSigner({ privateKey: f.attesters[3].privateKey, policy: f.policy });
  assert.deepEqual(Object.keys(dedicated).sort(), ['publicKey', 'signFacts']);
  assert.throws(() => dedicated.signFacts({ messageBytes: 'arbitrary' }));
});

test('bounded BTC observation uses signed-wire envelope, exact tip equation and registered endpoints', async () => {
  const f = fixture('1'), native = f.addNative(), x = await f.makePeer(0);
  const cert = await x.peer.certify(native.request);
  assert.equal(cert.facts.transactionId, native.request.nativeId + ZERO);
  assert.equal(cert.facts.wireBindingPosition, '2'); assert.equal(cert.facts.observation.confirmations, '6');
  const wrong = copy(native.observed); wrong.nativeContext.observedTipHeight = '54'; f.observations.set(native.request.nativeId, wrong);
  await assert.rejects(x.peer.refresh(native.request), /INVENTORY_BLOCKED/);
  assert.equal(x.control.snapshot().state.entries[0].status, 'adverse');
});

test('EVM peer retains exact descriptor destination, share amount, canonical wire and three ordered signatures', async () => {
  const f = fixture('3'), native = f.addNative(), peers = await Promise.all([0, 1, 2].map(i => f.makePeer(i)));
  const certificates = [];
  for (const { peer } of peers) certificates.push(await peer.certify(native.request));
  const result = await f.collector().collect({ certificates }), facts = result.facts;
  assert.equal(result.frameHex.length, 1658); assert.equal(facts.transactionId, native.request.nativeId + ZERO);
  assert.equal(facts.observation.amount, native.observed.intent.descriptor.route.shareAmount);
  assert.equal(facts.observation.destinationCommitment, evmVaultDeliveryDescriptorCommitment(native.observed.intent.descriptor));
  assert.equal(facts.wireBindingKind, '3'); assert.equal(facts.wireBindingPosition, '0');
  assert.equal(facts.wireKeyCommitment, native.observed.intent.receiptKeyCommitment);
  assert.equal(peers[0].control.snapshot().state.entries[0].nativeWire, native.observed.nativeWire);
  for (const nativeId of [native.request.nativeId + ZERO, '0x' + native.request.nativeId])
    await assert.rejects(peers[0].peer.certify({ ...native.request, nativeId }), /HEX/);
  for (const key of ['envelope', 'payout', 'graph', 'key', 'verified', 'event'])
    await assert.rejects(peers[0].peer.certify({ ...native.request, [key]: 'supplied' }), /FIELDS/);
});

test('EVM missing expired history blocks health, and adverse same-height forks stay latched on reopen', async () => {
  const f = fixture('3'), native = f.addNative(), p = await f.makePeer(0);
  await p.peer.certify(native.request); f.advance('5000');
  f.observations.set(native.request.nativeId, { status: 'unknown', reason: 'EXPIRED_HISTORY_MISSING' });
  assert.equal((await p.peer.auditInventory()).ready, false);
  f.observations.set(native.request.nativeId, native.observed);
  assert.equal((await p.peer.auditInventory()).ready, true);
  const fork = copy(native.observed); fork.nativeContext.observedTipId = sha('fork-tip');
  f.observations.set(native.request.nativeId, fork);
  assert.equal((await p.peer.auditInventory()).ready, false);
  assert.equal(p.control.snapshot().state.entries[0].status, 'adverse');
  f.observations.set(native.request.nativeId, native.observed);
  const resumed = await p.reopen(); assert.equal((await resumed.auditInventory()).ready, false);
  await assert.rejects(resumed.refresh(native.request), /INVENTORY_BLOCKED/);
});

test('EVM owned route and descriptor domain substitutions fail before any facts signature', async () => {
  for (const change of [r => { r.intent.descriptor.identity.router = '11'.repeat(20); },
    r => { r.intent.descriptor.identity.ledgerNamespace = sha('other-ledger'); },
    r => { r.intent.descriptor.identity.shareIdentity = sha('other-share'); },
    r => { r.intent.receiptKeyCommitment = sha('other-K'); },
    r => { r.nativeContext.observedSlot = '1'; }]) {
    const f = fixture('3'), native = f.addNative(), p = await f.makePeer(0), changed = copy(native.observed);
    change(changed); f.observations.set(native.request.nativeId, changed);
    await assert.rejects(p.peer.certify(native.request), /NATIVE_ADVERSE/); assert.equal(p.control.signCount(), 0);
  }
});

test('EVM validly signed calldata cannot replace the registered genesis, namespace or share asset', async () => {
  for (const field of ['genesisHash', 'ledgerNamespace', 'shareIdentity']) {
    const f = fixture('3'), native = f.addNative(), p = await f.makePeer(0), observed = copy(native.observed);
    observed.intent.descriptor.identity[field] = sha('different-' + field);
    const resigned = signedDeliveryWire(observed.intent); observed.nativeWire = resigned.nativeWire;
    const request = { ...native.request, nativeId: resigned.nativeId };
    f.observations.set(request.nativeId, observed);
    await assert.rejects(p.peer.certify(request), /NATIVE_ADVERSE/); assert.equal(p.control.signCount(), 0);
  }
});


test('HOST original MetaMorpho batch binds four exact router endpoints to the original facts frame and preserves legacy limits',async()=>{
 const mapped=import.meta.url.includes('/modules/chain-adapters/'),peerURL=new URL(mapped?'./native-facts-peer.mjs':'../../../../src/chains/shared/dispatch/native-facts-peer.mjs',import.meta.url),observerURL=new URL(mapped?'./metamorpho-graph-delivery-observer-v1.mjs':'../../../../src/chains/evm/vault/metamorpho-graph-delivery-observer-v1.mjs',import.meta.url);
 const f=fixture('3'),protocolFixture=Object.freeze({profile:'EXPLICIT_INERT_ORIGINAL_PROTOCOL'}),system=Object.freeze({profile:'EXPLICIT_INERT_SAME_SYSTEM'}),wires=new Map(),approved=[];let born=0,funded=false;
 const runtime=Object.freeze({metadata:{evmGenesis:'0x'+f.policy.rule.genesis},transactions:[],signedTransaction:async hash=>{assert.ok(wires.has(hash));return wires.get(hash);}}),routers=new WeakSet();
 // Execute actual batch and peer bodies. Native ownership/read ports below
 // are explicitly inert; cryptographic wire, signatures, frames and CAS are real.
 const load=async(where,overrides={},replaceBody=text=>text)=>{let text=await readFile(where,'utf8');const ports={};for(const m of text.matchAll(/^import\s+([A-Za-z_$][A-Za-z0-9_$]*)\s+from\s*['"]([^'"]+)['"];?/gm)){const module=await import(m[2].startsWith('node:')?m[2]:new URL(m[2],where).href);ports[m[1]]=module.default;}text=text.replace(/^import\s+[A-Za-z_$][A-Za-z0-9_$]*\s+from\s*['"][^'"]+['"];?\s*/gm,'');for(const m of text.matchAll(/^import\s*\{([\s\S]*?)\}\s*from\s*['"]([^'"]+)['"];?/gm)){const module=await import(m[2].startsWith('node:')?m[2]:new URL(m[2],where).href);for(const field of m[1].split(',')){const name=field.trim();assert.match(name,/^[A-Za-z_$][A-Za-z0-9_$]*$/);ports[name]=module[name];}}text=text.replace(/^import\s*\{[\s\S]*?\}\s*from\s*['"][^'"]+['"];?\s*/gm,'').replace(/^export /gm,'');Object.assign(ports,overrides);return new Function(...Object.keys(ports),replaceBody(text))(...Object.values(ports));};
 const observer=await load(observerURL,{
  assertOwnedLocalEvmV2:async value=>assert.equal(value,runtime),assertOwnedFlatSystem:(r,s)=>{assert.equal(r,runtime);assert.equal(s,system);},assertOfficialProtocolFixture:(r,p)=>{assert.equal(r,runtime);assert.equal(p,protocolFixture);},
  assertOwnedPrivateExternalRouterV1:(value,expected)=>{assert.ok(routers.has(value));assert.equal(expected.runtime,runtime);assert.equal(expected.system,system);assert.equal(expected.poolIndex,1);},
  createFlatSystemStateReader:async()=>({read:async()=>({ledger:{commitments:funded?['HOST_FUNDED']:[],nullifiers:[]}}),assertCurrent:async view=>assert.equal(view.ledger.nullifiers.length,0)}),
  createOwnedPrivateExternalRouterV1:async input=>{assert.equal(input.runtime,runtime);assert.equal(input.system,system);assert.equal(input.poolIndex,1);assert.equal(input.protocolFixture,protocolFixture);assert.equal(input.protocolKind,'METAMORPHO_V1_EXACT_SHARE_MINT');const base=evmDeliveryFixture(),identity={...base.identity,router:born===0?base.identity.router:sha('batch-router-'+born).slice(0,40)},router=Object.freeze({identity,address:'0x'+identity.router,protocolKind:input.protocolKind});born++;routers.add(router);return router;},
  hostChild(input,owned,facts,economicFacts){const child=Object.freeze({identity:input.router.identity,binding:{poolIndex:1,recipientIndex:'1',genesis:f.policy.rule.genesis,asset:f.policy.rule.asset,sourceEndpoint:input.router.identity.solver,destinationEndpoint:input.router.identity.router},async observe(query){return f.observations.get(query.transactionHash);},async assertPrepared(value){assert.equal(value.intent.descriptor.plan.identity.router,input.router.identity.router);approved.push(input.router.identity.router);},async observeFacts(query){const value=structuredClone(f.observations.get(query.transactionHash)??{status:'unknown',reason:'EXPLICIT_INERT_MISSING_FACT'});facts.set(value,child);if(value.status==='observed')economicFacts.set(value,{profile:'EXPLICIT_INERT_ECONOMIC_FIELDS'});return value;}});owned.set(child,{runtime,system,poolIndex:1,router:input.router,protocolFixture,context:{genesisHash:f.policy.rule.genesis},protocolKind:'METAMORPHO_V1_EXACT_SHARE_MINT',profile:'LIANUM_METAMORPHO_GRAPH_DELIVERY_V1'});return child;}
 },text=>{const changed=text.replace(/async function createOwnedMetaMorphoGraphDeliveryObserverV1\(input\)\s*\{\s*assert.equal\(arguments.length, 1\); return createOwnedOfficialObserver\(input, META\);\s*\}/,'async function createOwnedMetaMorphoGraphDeliveryObserverV1(input){return hostChild(input,owned,facts,economicFacts);}') ;assert.notEqual(changed,text);return changed+';return{createOwnedMetaMorphoGraphDeliveryBatchV4,readOriginalMetaMorphoGraphBatchRoutersV4,readOriginalMetaMorphoGraphBatchFactsBindingsV4,assertOwnedMetaMorphoGraphDeliveryFactsV1};';});
 const batch=await observer.createOwnedMetaMorphoGraphDeliveryBatchV4({runtime,system,poolIndex:1,protocolFixture,count:4}),originalRouters=observer.readOriginalMetaMorphoGraphBatchRoutersV4(batch,{runtime,system,poolIndex:1});assert.equal(born,4);assert.equal(new Set(originalRouters.map(v=>v.address)).size,4);assert.throws(()=>observer.readOriginalMetaMorphoGraphBatchFactsBindingsV4({...batch}));funded=true;await assert.rejects(observer.createOwnedMetaMorphoGraphDeliveryBatchV4({runtime,system,poolIndex:1,protocolFixture,count:4}));assert.equal(born,4);funded=false;
 const api=await load(peerURL,{readOriginalMetaMorphoGraphBatchFactsBindingsV4:observer.readOriginalMetaMorphoGraphBatchFactsBindingsV4},text=>text+';return{createOriginalMetaMorphoBatchFactsInventoryV4,createOriginalMetaMorphoBatchFactsPeerV4};'),recipients=[{recipientIndex:'1',sourceEndpoint:originalRouters[0].identity.solver,destinationEndpoint:originalRouters[0].identity.router}],peers=[];
 for(let index=0;index<3;index++){const signer=createNativeFactsSigner({privateKey:f.attesters[index].privateKey,policy:f.policy}),config={policy:f.policy,signerIndex:String(index),publicKey:signer.publicKey,recipients};let durable={revision:'0',state:api.createOriginalMetaMorphoBatchFactsInventoryV4(config,batch)},signs=0;const input={policy:f.policy,signerIndex:String(index),recipients,signer:{publicKey:signer.publicKey,async signFacts(value){assert.ok(durable.state.entries.some(row=>row.facts.nativeGid===value.nativeGid));signs++;return signer.signFacts(value);}},reader:{observe:async query=>batch.observeFacts({transactionHash:query.nativeId,calldataSHA256:wires.get('0x'+query.nativeId).calldataSHA256})},clock:f.clock,store:{load:async()=>structuredClone(durable),async commit(value){assert.equal(value.expectedRevision,durable.revision);durable={revision:String(BigInt(durable.revision)+1n),state:structuredClone(value.nextState)};return structuredClone(durable);}}};const peer=await api.createOriginalMetaMorphoBatchFactsPeerV4(input,batch);peers.push({peer,input,snapshot:()=>structuredClone(durable),signs:()=>signs});await assert.rejects(createNativeFactsPeer(input));assert.throws(()=>api.createOriginalMetaMorphoBatchFactsInventoryV4(config,{...batch}));}
 const runtimeModule=await import(new URL(mapped?'./owned-evm-v2-runtime.mjs':'../../../../src/chains/evm/runtime/owned-evm-v2-runtime.mjs',import.meta.url));
 const requests=[];for(let slot=0;slot<5;slot++){const v=evmDeliveryFixture('batch-'+slot,'100');v.intent.descriptor.identity.router=slot<4?originalRouters[slot].identity.router:sha('foreign-router').slice(0,40);const signed=signedDeliveryWire(v.intent,{nonce:String(slot)}),decoded=runtimeModule.decodeCanonicalEvmTransaction('0x'+signed.nativeWire),transaction=Object.fromEntries(['chainId','from','to','nonce','gasPrice','gas','value','data'].map(k=>[k,decoded[k]])),retained={nativeWire:'0x'+signed.nativeWire,calldataSHA256:sha(Buffer.from(decoded.data.slice(2),'hex'))},row={transactionHash:'0x'+signed.nativeId,prepared:{transaction},signed:retained};runtime.transactions.push(row);wires.set(row.transactionHash,retained);f.observations.set(signed.nativeId,{...v.observation,nativeWire:signed.nativeWire,intent:v.intent});const request={...v.request,nativeId:signed.nativeId};requests.push(request);
  if(slot<4){const certificates=await Promise.all(peers.map(p=>p.peer.certify(request))),collected=await f.collector().collect({certificates});assert.equal(collected.frameHex.length,829*2);assert.deepEqual(collected.indexes,['0','1','2']);for(const p of peers){assert.equal(p.snapshot().state.entries.length,slot+1);assert.equal(p.signs(),slot+1);}const facts=await batch.observeFacts({transactionHash:signed.nativeId,calldataSHA256:retained.calldataSHA256});observer.assertOwnedMetaMorphoGraphDeliveryFactsV1(facts,{observer:batch});assert.throws(()=>observer.assertOwnedMetaMorphoGraphDeliveryFactsV1({...facts},{observer:batch}));}
  else{await assert.rejects(peers[0].peer.certify(request));assert.equal(peers[0].snapshot().state.entries.length,4);assert.equal(peers[0].signs(),4);}
 }
 for(const p of peers)assert.equal((await p.peer.auditInventory()).ready,true);assert.throws(()=>createNativeFactsInventory({policy:f.policy,signerIndex:'0',publicKey:point(f.attesters[0].publicKey),recipients:originalRouters.map(router=>({recipientIndex:'1',sourceEndpoint:router.identity.solver,destinationEndpoint:router.identity.router}))}));
 const before=peers[0].signs();await peers[0].peer.certify(requests[0]);assert.equal(peers[0].signs(),before);assert.equal(peers[0].snapshot().state.entries.length,4);
});
