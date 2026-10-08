/** One original D26 job and funding wire, driven by the real mobile API and
 * Noble note signature. This fixed private step shares the existing bootstrap,
 * journals and cleanup; it never adopts the Linux owner note. */
import assert from 'node:assert/strict';
import { randomBytes, createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { request as httpsRequest } from 'node:https';
import { createServer } from 'node:net';
import { mkdirSync, readFileSync, lstatSync, realpathSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createDeviceOwnerDepositBridgeV1 } from '../../../../packages/backend/src/accounts/authority/device-owner-deposit-bridge-v1.mjs';
import { createPairedOriginalAccountActorV2, pairedOriginalAccountActorDescriptorV2 }
  from '../../../../packages/backend/src/api/mobile/paired-original-account-actor-v2.mjs';
import { createPairedDeviceDepositTlsServerV1 } from '../../../../packages/backend/src/api/mobile/paired-original-account-http-v2.mjs';
import { originalAccountAccessMessageV2 } from '../../../../packages/mobile-protocol/src/original-account-review-v2.mjs';
import { deviceDepositConsentMessageV1, normalizeDeviceDepositWitnessV1, deviceDepositWitnessBytesV1 }
  from '../../../../packages/mobile-protocol/src/device-deposit-consent-v1.mjs';
import { verifyPrivateNotePath } from '../../../../packages/engine/src/notes/private-note-tree.mjs';
import { nullifier } from '../../../../packages/engine/src/notes/private-note-encoding.mjs';
import { encodeFlatTransaction } from '../../../../packages/backend/src/execution/encoding/transaction-codec.mjs';
import { assertDeviceDepositReleaseV1 } from './device-owner-deposit-policy-v1.mjs';
const bare = value => value.replace(/^0x/, '');
const sha = value => createHash('sha256').update(value).digest('hex');
const words = value => Array.from({ length: 8 }, (_, index) => Buffer.from(value, 'hex').readUInt32BE(index * 4));
const bytes = value => Array.from(Buffer.from(value, 'hex'));

// Exact HTTPS origin and certificate, including the actual TLS protocol. No
// plaintext translation, redirects, custom authority or automatic retry.
function exactTlsFetch(descriptor, certificate, evidence) {
  return (target, options = {}) => new Promise((resolve, reject) => {
    assert.equal(new URL(target).origin, descriptor.origin);
    const path = new URL(target).pathname, headers = { ...options.headers };
    if (options.body !== undefined) headers['Content-Length'] = Buffer.byteLength(options.body);
    if (options.method === 'POST') evidence.posts[path] = (evidence.posts[path] ?? 0) + 1;
    const discard = evidence.dropFund && path === '/v1/mobile/device-deposit/fund';
    if (discard) evidence.dropFund = false;
    const request = httpsRequest(target, { family: 4, ca: certificate, agent: false,
      minVersion: 'TLSv1.3', maxVersion: 'TLSv1.3', method: options.method ?? 'GET', headers, signal: options.signal }, response => {
      const protocol = response.socket.getProtocol(); assert.equal(protocol, 'TLSv1.3'); evidence.tlsVersion = protocol;
      const chunks = []; let length = 0;
      response.on('data', chunk => {
        length += chunk.length;
        if (length > 16384) { request.destroy(Error('DEVICE_DEPOSIT_TLS_RESPONSE_LIMIT')); return; }
        chunks.push(chunk);
      });
      response.once('error', reject);
      response.once('end', () => {
        evidence.responses.push({ path, status: response.statusCode });
        const reply = new Response(Buffer.concat(chunks), { status: response.statusCode, headers: response.headers });
        Object.defineProperty(reply, 'url', { value: target });
        if (discard) {
          assert.equal(response.statusCode, 200, 'DEVICE_DEPOSIT_ACTUAL_FUND_REPLY_REQUIRED');
          evidence.fundReplyDiscarded = true;
          // Only a public reply field is retained; the API receives no body.
          evidence.fundAuthorizationSHA256 = JSON.parse(Buffer.concat(chunks)).authorizationSHA256;
          void reply.body.cancel().then(() => reject(Error('DEVICE_DEPOSIT_FUND_REPLY_LOST_BEFORE_API')), reject);
        } else resolve(reply);
      });
    });
    request.once('error', reject); request.end(options.body);
  });
}

export async function runDeviceOwnerDepositOriginalStepV1(context) {
  assertDeviceDepositReleaseV1();
  const { account, owner, runtime, nativeRuntime, system, reader, joined, result, pairs, privateDirectory,
    stage, save, active, notePreparation, fromApp, deviceKey, proofRetained } = context;
  const { createOriginalAccountApiV2 } = await fromApp('api/original-account-api-v2.mjs');
  const { localBalanceCommitmentMessageV1 } = await fromApp('custody/balance-note-codec-v1.mjs');
  const { localUnissuedDepositFrameV1 } = await fromApp('custody/unissued-deposit-terms-v1.mjs');
  const { privateKeyFromHex, devicePublicKey, signDeviceMessage } = await fromApp('custody/signing.mjs');
  const preparation = await notePreparation('TOP_UP', 'device_original_scope_v1');
  const linuxBefore = await owner.ownerView.summary();
  assert.equal(linuxBefore.notes.source.status, 'UNISSUED');
  const setupTransactions = runtime.transactions.length, nativeTransactions = nativeRuntime.transactions.length;
  let key, witness, actor, bridge, server;
  const tlsDirectory = join(privateDirectory, 'device-tls');
  mkdirSync(tlsDirectory, { mode: 0o700 });
  const reservation = createServer();
  await new Promise((done, reject) => { reservation.once('error', reject); reservation.listen(0, '127.0.0.1', done); });
  const port = reservation.address().port;
  await new Promise((done, reject) => reservation.close(error => error ? reject(error) : done()));
  const origin = 'https://localhost:' + port, certificatePath = join(tlsDirectory, 'certificate.pem'), keyPath = join(tlsDirectory, 'key.pem');
  try {
    active();
    execFileSync('/usr/bin/openssl', ['req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:prime256v1',
      '-sha256', '-days', '2', '-nodes', '-subj', '/CN=localhost', '-addext', 'subjectAltName=DNS:localhost',
      '-addext', 'basicConstraints=critical,CA:FALSE', '-keyout', keyPath, '-out', certificatePath],
      { timeout: 5000, maxBuffer: 4096, stdio: 'ignore', env: { PATH: '/usr/bin:/bin', LANG: 'C' } });
    actor = await createPairedOriginalAccountActorV2({ session: joined.session, approval: preparation.approval,
      owner, origin, devicePublicKey: devicePublicKey(deviceKey) });
    const descriptor = pairedOriginalAccountActorDescriptorV2(actor);
    bridge = await createDeviceOwnerDepositBridgeV1({ actor, account, owner, runtime, system, poolIndex: 0 });
    server = await createPairedDeviceDepositTlsServerV1({ bridge,
      tls: { certificate: readFileSync(certificatePath, 'utf8'), privateKey: readFileSync(keyPath, 'utf8') } });
    pairs.push({ actor, bridge, server, async afterClose() {
      bridge.close(); actor.close();
      const info = lstatSync(tlsDirectory);
      assert.equal(info.uid, process.getuid()); assert.equal(info.isDirectory(), true);
      assert.equal(info.isSymbolicLink(), false); assert.equal(info.mode & 0o077, 0);
      assert.equal(realpathSync(tlsDirectory), tlsDirectory); rmSync(tlsDirectory, { recursive: true });
      assert.equal(existsSync(tlsDirectory), false); result.cleanup.syntheticDeviceTlsMaterialRemoved = true;
    } });
    const transport = { posts: {}, responses: [], dropFund: false, fundReplyDiscarded: false };
    const api = createOriginalAccountApiV2({ descriptor, fetchImpl: exactTlsFetch(descriptor, readFileSync(certificatePath, 'utf8'), transport) });
    const state = await api.state(); assert.equal(state.privatePortfolio, null); assert.equal(state.noteCustodyOnDevice, false);
    const access = async () => {
      active(); const value = await api.challenge('read');
      return { access: value, signature: signDeviceMessage(deviceKey, originalAccountAccessMessageV2(value)) };
    };
    for (let attempt = 0; attempt < 16 && !key; attempt++) {
      const candidate = randomBytes(32);
      try { key = privateKeyFromHex(candidate.toString('hex')); } catch { /* no job exists */ }
      finally { candidate.fill(0); }
    }
    assert.ok(key); const publicKey = devicePublicKey(key);
    assert.notEqual(publicKey, descriptor.devicePublicKey, 'DEVICE_NOTE_KEY_DISTINCT_FROM_TRANSPORT_KEY');
    const view = await reader.read(); await reader.assertCurrent(view);
    const scope = bare(view.domain.scope), policy = bare(view.domain.policy), rootId = randomBytes(32).toString('hex');
    const opening = { type: 4, rho: randomBytes(32).toString('hex'), x: publicKey.slice(2, 66),
      y: publicKey.slice(66), value: '500', secret: randomBytes(32).toString('hex') };
    const commitment = sha(localBalanceCommitmentMessageV1(scope, policy, opening));
    const note = { scope, policy, pool: bare(system.pools[0].address), recipient: bare(runtime.accounts[3]),
      commitment, amount: '500', status: 'UNISSUED', availableBalance: null, nativeEffectsEstablished: false };
    const epoch = (BigInt(view.head.timestamp) / 600n).toString();
    const statement = { scope, policy, epoch, amount: '500', output: commitment };
    const noteSignature = signDeviceMessage(key, localUnissuedDepositFrameV1(note, { relation: 'D26', epoch }));
    witness = normalizeDeviceDepositWitnessV1({ scope: words(scope), policy: words(policy), epoch, amount: '500',
      output: words(commitment), rho: bytes(opening.rho), key_x: bytes(opening.x), key_y: bytes(opening.y),
      secret: bytes(opening.secret), signature: bytes(noteSignature) });
    assert.equal(Object.hasOwn(witness, 'privateKey'), false); assert.equal(Object.hasOwn(witness, 'root'), false);
    const witnessBytes = deviceDepositWitnessBytesV1(witness), witnessSHA256 = sha(witnessBytes); witnessBytes.fill(0);
    const consent = await api.deviceDeposit.challengeJob({ ...await access(), statement, rootId,
      noteRevision: 2, witnessSHA256, jobId: null });
    const signedProof = { consent, signature: signDeviceMessage(deviceKey, deviceDepositConsentMessageV1(consent)), witness };
    await stage('device-original-D26-job-HTTP-UNKNOWN');
    await assert.rejects(api.deviceDeposit.submit(signedProof), /SERVICE_UNAVAILABLE/);
    const proofResponse = transport.responses.find(row => row.path.endsWith('/jobs'));
    assert.equal(proofResponse.status, 504); assert.equal(transport.posts['/v1/mobile/device-deposit/jobs'], 1);
    // An explicit replay is a negative boundary, never an automatic retry.
    await assert.rejects(api.deviceDeposit.submit(signedProof));
    await proofRetained(); active();
    for (const value of Object.values(witness)) if (Array.isArray(value)) value.fill(0); witness = null;
    await stage('device-second-consent-original-funding-reply-loss');
    const funding = await api.deviceDeposit.challenge('FUND_D26', { ...await access(), jobId: consent.jobId });
    const signedFunding = { consent: funding, signature: signDeviceMessage(deviceKey, deviceDepositConsentMessageV1(funding)) };
    transport.dropFund = true;
    await assert.rejects(api.deviceDeposit.submit(signedFunding), /FUND_REPLY_LOST_BEFORE_API/);
    assert.equal(transport.posts['/v1/mobile/device-deposit/fund'], 1); assert.equal(transport.fundReplyDiscarded, true);
    assert.equal(transport.fundAuthorizationSHA256, sha(deviceDepositConsentMessageV1(funding)));
    await stage('device-explicit-original-inclusion-same-opening');
    const observe = async () => {
      const consent = await api.deviceDeposit.challenge('OBSERVE_D26', { ...await access(), jobId: funding.jobId });
      const value = await api.deviceDeposit.submit({ consent,
        signature: signDeviceMessage(deviceKey, deviceDepositConsentMessageV1(consent)) });
      assert.equal(value.authorizationSHA256, sha(deviceDepositConsentMessageV1(consent)));
      assert.equal(value.stage, 'CONFIRMED'); assert.equal(value.observation.commitment, commitment);
      return value.observation;
    };
    const observation = await observe(), receipt = await runtime.receipt('0x' + observation.transactionHash);
    assert.equal(receipt.status, '0x1'); await runtime.checkReceipt(receipt); await runtime.assertCanonical(receipt);
    assert.equal(verifyPrivateNotePath({ ...observation.path, root: '0x' + observation.path.root,
      leaf: '0x' + observation.path.leaf, siblings: observation.path.siblings.map(value => '0x' + value) }), true);
    assert.equal(observation.path.leaf, commitment);
    assert.equal(observation.nullifier, nullifier(Buffer.from(scope, 'hex'), Buffer.from(commitment, 'hex'), Buffer.from(opening.secret, 'hex')).toString('hex'));
    const originalProof = context.retainedProofs.get('deposit_balance'); assert.ok(originalProof);
    const transactions = runtime.transactions.filter(row => row.label === 'flat-account-device-deposit');
    assert.equal(transactions.length, 1); const transaction = transactions[0];
    assert.equal(transaction.request.data, encodeFlatTransaction('depositBalance', originalProof));
    assert.equal(transaction.transactionHash, '0x' + observation.transactionHash);
    assert.equal(transaction.request.to, system.pools[0].address); assert.equal(BigInt(transaction.request.value), 500n);
    const beforeReplay = { transactions: runtime.transactions.length, proofs: result.proofs.length };
    await assert.rejects(api.deviceDeposit.submit(signedFunding), /SERVICE_UNAVAILABLE/);
    await assert.rejects(api.deviceDeposit.challenge('FUND_D26', { ...await access(), jobId: funding.jobId }), /SERVICE_UNAVAILABLE/);
    const fresh = await observe(); assert.equal(fresh.transactionHash, observation.transactionHash);
    assert.deepEqual({ transactions: runtime.transactions.length, proofs: result.proofs.length }, beforeReplay);
    const final = await reader.read(); await reader.assertCurrent(final);
    const linux = await owner.ownerView.summary(), ownerView = await account.ownerView();
    assert.equal(linux.notes.source.status, 'UNISSUED'); assert.equal(linux.notes.source.observedUnspent, false);
    assert.equal(ownerView.balances.available, '0');
    assert.deepEqual(final.ledger.commitments, ['0x' + commitment]); assert.deepEqual(final.ledger.nullifiers, []);
    assert.equal(runtime.transactions.length, setupTransactions + 1); assert.equal(nativeRuntime.transactions.length, nativeTransactions);
    result.deviceNote = { localCommitment: commitment, observation, receipt, originalSignedWireCount: transactions.length,
      linuxNoteStatus: linux.notes.source.status, linuxNoteObservedUnspent: linux.notes.source.observedUnspent,
      poolBacking: final.ledger.publicState, proofHttp: { status: proofResponse.status, posts: 1,
        clientReportedUnknown: true, automaticRetry: false, explicitRejectedReplayPosts: transport.posts['/v1/mobile/device-deposit/jobs'] - 1 },
      fundHttp: { actualAdmissionReplyDiscarded: transport.fundReplyDiscarded, posts: 1,
        clientReportedUnknown: true, automaticRetry: false, explicitRejectedReplayPosts: transport.posts['/v1/mobile/device-deposit/fund'] - 1 },
      freshObservationSameOriginalWire: true, proveReplayRejected: true, fundReplayRejected: true,
      explicitFreshFundingRejected: true, signedConsentByteJoin: true, tlsVersion: transport.tlsVersion,
      custodyWitnessPrivateKeyAbsent: true, transportKeyDifferentFromNoteKey: true,
      nativeBootstrapTransactions: nativeRuntime.transactions.length, finalFinancialWireCount: runtime.transactions.length - setupTransactions,
      unrelatedOwnerCredit: ownerView.balances.available };
    result.economics = { deviceAmountAtomic: '500', receiverFinancialTransactions: 1,
      poolActualAtomic: final.ledger.publicState.actualAssetBalance, poolBackedAtomic: final.ledger.publicState.backedAmount,
      linuxOwnerAvailableAtomic: ownerView.balances.available, privateNoteCount: final.ledger.commitments.length };
    assert.equal(result.proofs.length, 1); result.deviceOwnerD26NodeAcceptance = true; save();
  } finally {
    key?.fill(0); if (witness) for (const value of Object.values(witness)) if (Array.isArray(value)) value.fill(0);
    // The shared original close owns successful listeners and retirement. A
    // startup rejection before a listener exists has no admitted financial job.
    if (!server) {
      bridge?.close(); actor?.close();
      if (existsSync(tlsDirectory)) rmSync(tlsDirectory, { recursive: true });
    }
  }
}
