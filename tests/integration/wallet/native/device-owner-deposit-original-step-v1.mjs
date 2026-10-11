import{isOriginalNativePrivateWorkerDepositBridgeV3}from'../../../../packages/backend/src/accounts/authority/device-owner-deposit-bridge-v1.mjs';
import{isOriginalNativePrivateWorkerExecutionBridgeV3}from'../../../../packages/backend/src/accounts/authority/device-owner-execution-bridge-v1.mjs';
import{isOriginalNativePrivateReservationBridgeV2}from'../../../../packages/backend/src/accounts/authority/device-owner-reservation-bridge-v1.mjs';
/** One original D26 job and funding wire, driven by the real mobile API and
 * Noble note signature. This fixed private step shares the existing bootstrap,
 * journals and cleanup; it never adopts the Linux owner note. */
import assert from 'node:assert/strict';
import { randomBytes, createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { request as httpsRequest } from 'node:https';
import { createServer } from 'node:net';
import { mkdirSync, readFileSync, lstatSync, realpathSync, rmSync, existsSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { writeFixturePrivate } from '../../fixtures/runners/owned-flat-fixture.mjs';
import { normalizeOriginalNativePrivateDepositFailureV2 } from '@lianum/proofs/jobs/native-device-private-deposit-client-v2';
import { createDeviceOwnerDepositBridgeV1, awaitDeviceOwnerDepositOriginalProofV1, awaitDeviceOwnerDepositOriginalFundingV1, awaitDeviceOwnerDepositOriginalObservationV1 } from '../../../../packages/backend/src/accounts/authority/device-owner-deposit-bridge-v1.mjs';
import { createPairedOriginalAccountActorV2, pairedOriginalAccountActorDescriptorV2 }
  from '../../../../packages/backend/src/api/mobile/paired-original-account-actor-v2.mjs';
import { createPairedDeviceDepositTlsServerV1, handoffPairedDeviceDepositTlsServerV1 } from '../../../../packages/backend/src/api/mobile/paired-original-account-http-v2.mjs';
import { originalAccountAccessMessageV2 } from '@lianum/mobile-protocol/original-account-v2';
import { deviceDepositConsentEitherMessageV2 as deviceDepositConsentMessageV1, normalizeDeviceDepositWitnessV1, deviceDepositWitnessBytesV1 }
  from '@lianum/mobile-protocol/device/native-deposit-v2';
import { verifyPrivateNotePath } from '@lianum/engine/notes/private-note-tree';
import { nullifier } from '@lianum/engine/notes/private-note-encoding';
import { encodeFlatTransaction } from '../../../../packages/backend/src/execution/encoding/transaction-codec.mjs';
import {refreshOriginalNativeDeviceLocalObservedClockV1} from '../../../../packages/backend/src/operations/recovery/native-device-local-observed-clock-v1.mjs';
import {installOriginalNativeDeviceDurableLocalServiceV1,installOriginalPrivateNativeNoteDurableServiceV2,installOriginalPrivateNativeAuthorizedNoteDurableServiceV2,installOriginalPrivateNativeWorkerNoteDurableServiceV3} from '../../../../packages/backend/src/operations/recovery/native-device-local-operator-v1.mjs';
import {prepareDeviceOwnerReservationOriginalV1} from './device-owner-reservation-original-preparation-v1.mjs';
import { runDeviceOwnerReservationContinuationV1 } from './device-owner-reservation-original-continuation-v1.mjs';
import { openDeviceReservationHostVaultV1 } from './device-owner-reservation-host-vault-v1.mjs';
import { assertDeviceReservationReleaseV1 } from './device-owner-reservation-policy-v1.mjs';
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
    if(evidence.privateNative&&['/v1/mobile/device-deposit/private-jobs','/v1/mobile/device-exit/private-jobs'].includes(path)){assert.ok(typeof options.body==='string'&&Buffer.byteLength(options.body)<=(path.includes('device-exit')?32768:16384));const packet=JSON.parse(options.body);assert.equal(packet.witness?.type,'flat-private-proof-inputs');assert.equal(packet.witness.profile,'ORIGINAL_ROLE_PRIVATE_PROOF_TRANSIT_V1');assert.equal(typeof packet.witness.ciphertext,'string');assert.ok(packet.witness.ciphertext.length>0&&packet.witness.ciphertext.length<=16384);assert.equal(Object.hasOwn(packet.witness,'inputs'),false);for(const key of ['rho','secret','key_x','key_y','signature','siblings'])assert.equal(Object.hasOwn(packet.witness,key),false);evidence.privatePosts[path]=(evidence.privatePosts[path]??0)+1;}
    if(evidence.privateAuthorized&&path==='/v1/mobile/device-reservation/private-jobs'){assert.ok(typeof options.body==='string'&&Buffer.byteLength(options.body)<=81920);const packet=JSON.parse(options.body);assert.equal(packet.consent.version,2);assert.equal(packet.consent.privateProof.profile,'ORIGINAL_NATIVE_DEVICE_U_PRIVATE_TRANSIT_V2');assert.equal(packet.witness?.type,'flat-private-proof-inputs');assert.equal(packet.witness.profile,'ORIGINAL_ROLE_PRIVATE_PROOF_TRANSIT_V1');assert.ok(typeof packet.witness.ciphertext==='string'&&packet.witness.ciphertext.length>0&&packet.witness.ciphertext.length<=60116);for(const key of ['inputs','input','rho','secret','key_x','key_y','signature','siblings'])assert.equal(Object.hasOwn(packet.witness,key),false);evidence.privatePosts[path]=(evidence.privatePosts[path]??0)+1;}
    if (options.method === 'POST') evidence.posts[path] = (evidence.posts[path] ?? 0) + 1;
    const discardFund = evidence.dropFund && path === '/v1/mobile/device-deposit/fund';
    const discardU = evidence.dropU && path === (evidence.privateAuthorized?'/v1/mobile/device-reservation/private-jobs':'/v1/mobile/device-reservation/jobs');
    const discardExecute=evidence.dropExecute&&path==='/v1/mobile/device-execution/execute';
    const discardRecovery=evidence.dropRecovery&&path==='/v1/mobile/device-execution/recover';
    const discardWithdraw=evidence.dropWithdraw&&path==='/v1/mobile/device-exit/withdraw';
    const discard = discardFund || discardU || discardExecute || discardWithdraw || discardRecovery;
    if (discardFund) evidence.dropFund = false;
    if (discardU) evidence.dropU = false;
    if(discardRecovery)evidence.dropRecovery=false;if(discardExecute)evidence.dropExecute=false;if(discardWithdraw)evidence.dropWithdraw=false;
    const request = httpsRequest(target, { family: 4, ca: certificate, agent: false,
      minVersion: 'TLSv1.3', maxVersion: 'TLSv1.3', method: options.method ?? 'GET', headers, signal: options.signal }, response => {
      try {
        const protocol = response.socket.getProtocol(); assert.equal(protocol, 'TLSv1.3'); evidence.tlsVersion = protocol;
      } catch (error) { response.destroy(); reject(error); return; }
      const chunks = []; let length = 0;
      response.on('data', chunk => {
        length += chunk.length;
        if (length > 16384) { request.destroy(Error('DEVICE_DEPOSIT_TLS_RESPONSE_LIMIT')); return; }
        chunks.push(chunk);
      });
      response.once('error', reject);
      response.once('end', () => {
        // Event callbacks run outside the Promise executor: reject every
        // original callback error instead of throwing past the worker catch.
        try {
        evidence.responses.push({ path, status: response.statusCode });
        const reply = new Response(Buffer.concat(chunks), { status: response.statusCode, headers: response.headers });
        Object.defineProperty(reply, 'url', { value: target });
        if (discardFund) evidence.fundHttpStatus = response.statusCode;
        if (discardU) evidence.uHttpStatus = response.statusCode;
        if (discard && response.statusCode === 200) {
          // Only a public reply field is retained; the API receives no body.
          const authorization = JSON.parse(Buffer.concat(chunks)).authorizationSHA256;
          if (discardFund) { evidence.fundAuthorizationSHA256 = authorization; evidence.fundReplyDiscarded = true; }
          if (discardU) { evidence.uAuthorizationSHA256 = authorization; evidence.uReplyDiscarded = true; }
          void reply.body.cancel().then(() => reject(Error(discardRecovery?'DEVICE_NATIVE_RECOVERY_REPLY_LOST':discardExecute?'DEVICE_NATIVE_EXECUTE_REPLY_LOST':discardWithdraw?'DEVICE_NATIVE_WITHDRAW_REPLY_LOST':discardU ? 'DEVICE_US_U_REPLY_LOST' : 'DEVICE_DEPOSIT_FUND_REPLY_LOST_BEFORE_API')), reject);
        } else resolve(reply);
        } catch (error) { reject(error); }
      });
    });
    request.once('error', reject); request.end(options.body);
  });
}

export async function runDeviceOwnerDepositOriginalStepV1(context) { return runOriginalStepV1(context, false); }
export async function runDeviceOwnerReservationOriginalStepV1(context) {
  assertDeviceReservationReleaseV1(); return runOriginalStepV1(context, true);
}
export async function runDeviceOwnerExecutionOriginalStepV1(context){return runOriginalStepV1(context,true);}
async function runOriginalStepV1(context, reservationMode) {
  assertDeviceDepositReleaseV1();
  const { account, owner, runtime, nativeRuntime, system, reader, joined, result, pairs, privateDirectory,
    stage, save, active, notePreparation, fromApp, deviceKey, proofRetained } = context;
  const { createOriginalAccountApiV2 } = await fromApp('api/original-account-api-v2.mjs');
  const { localBalanceCommitmentMessageV1 } = await fromApp('custody/balance-note-codec-v1.mjs');
  const { localUnissuedDepositFrameV1 } = await fromApp('custody/unissued-deposit-terms-v1.mjs');
  const { privateKeyFromHex, devicePublicKey, signDeviceMessage, signNativePrivateDeviceConsentV2 } = await fromApp('custody/signing.mjs');
  const signDepositConsent = consent => consent.version === 2
    ? signNativePrivateDeviceConsentV2(deviceKey, consent)
    : signDeviceMessage(deviceKey, deviceDepositConsentMessageV1(consent));
  const preparation = await notePreparation('TOP_UP', 'device_original_scope_v1');
  const linuxBefore = await owner.ownerView.summary();
  assert.equal(linuxBefore.notes.source.status, 'UNISSUED');
  const setupTransactions = runtime.transactions.length, nativeTransactions = nativeRuntime.transactions.length;
  let key, witness, actor, bridge, server, host, vault, localRequest, deviceApi, continuation, vaultRootId;
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
    // The original successor reads both files through its private-file guard.
    // OpenSSL otherwise leaves the certificate at the caller's public umask.
    chmodSync(certificatePath, 0o600); chmodSync(keyPath, 0o600);
    if(context.deviceDurableSQL){
      context.durablePrepared=await prepareDeviceOwnerReservationOriginalV1({runtime,system,nativeRuntime,bootstrap:context.bootstrap});
      let durableProvidersClosing;context.deferDeviceProviderCleanup(()=>durableProvidersClosing??=(async()=>{if(context.economicLifetime.captured)return;const stopped=await context.durablePrepared.recipient.close();assert.equal(stopped.exited,true);assert.deepEqual(stopped.exit,{code:0,signal:null});result.cleanup.closedDeviceRecipient=true;if(!context.durablePrepared.custody.report().closed)await context.durablePrepared.custody.close();assert.equal(context.durablePrepared.custody.report().closed,true);result.cleanup.closedDeviceProvider=true;})());
      context.durableInstalled=await(context.devicePrivateWorker?installOriginalPrivateNativeWorkerNoteDurableServiceV3:context.devicePrivateAuthorized?installOriginalPrivateNativeAuthorizedNoteDurableServiceV2:context.devicePrivateNative?installOriginalPrivateNativeNoteDurableServiceV2:installOriginalNativeDeviceDurableLocalServiceV1)({runtime,system,owner,account,nativeExecution:context.nativeExecution,session:joined.session,approval:preparation.approval,provider:context.durablePrepared,
        configuration:{origin,devicePublicKey:devicePublicKey(deviceKey),tls:{certificate:readFileSync(certificatePath,'utf8'),privateKey:readFileSync(keyPath,'utf8')}},pool:context.durableInfrastructure.pool,privacyKey:context.durableInfrastructure.privacyKey});
      ({actor,depositBridge:bridge,transport:server}=context.durableInstalled);Object.assign(result.durableOriginalAdmission,{beforeD26:true,sameActor:true,sameThreeBridges:true});if(context.devicePrivateNative)result.nativePrivateIntake={installedBeforeFunding:true,d26EncryptedHttp:false,d26PrivateConsent:false,w39ChangeEncryptedHttp:false,w39RecoveryEncryptedHttp:false,samePrivateJournalAfterReopen:false,originalNativeThreads:12,originalPermissionMs:15000,nativeRecipientToWorkerEncrypted:false,chainRpcAnonymityEstablished:false,operatorIndependenceEstablished:false};
    }else{
      actor = await createPairedOriginalAccountActorV2({ session: joined.session, approval: preparation.approval,owner,origin,devicePublicKey:devicePublicKey(deviceKey) });
      bridge = await createDeviceOwnerDepositBridgeV1({actor,account,owner,runtime,system,poolIndex:0});
      server=await createPairedDeviceDepositTlsServerV1({bridge,tls:{certificate:readFileSync(certificatePath,'utf8'),privateKey:readFileSync(keyPath,'utf8')}});
    }
    const descriptor=pairedOriginalAccountActorDescriptorV2(actor);
    const ownedPair = { actor, bridge, server, async afterExecutionClose(){await continuation?.afterExecutionClose?.();}, async afterClose() {
      await continuation?.close(); vault?.close(); deviceApi?.close(); host?.close();
      if(context.deviceEconomicRecovery&&!result.success){result.cleanup.deviceCiphertextRetainedAfterUncertainRestart=true;return;}
      if (host) result.cleanup.syntheticDeviceCiphertextRemoved = host.retire().removed;
      context.durableInstalled?.dispatch.close();bridge.close(); actor.close();
      const info = lstatSync(tlsDirectory);
      assert.equal(info.uid, process.getuid()); assert.equal(info.isDirectory(), true);
      assert.equal(info.isSymbolicLink(), false); assert.equal(info.mode & 0o077, 0);
      assert.equal(realpathSync(tlsDirectory), tlsDirectory); rmSync(tlsDirectory, { recursive: true });
      assert.equal(existsSync(tlsDirectory), false); result.cleanup.syntheticDeviceTlsMaterialRemoved = true;
    } }; pairs.push(ownedPair);
    if(context.devicePrivateWorker){assert.equal(isOriginalNativePrivateWorkerDepositBridgeV3(context.durableInstalled.depositBridge),true);assert.equal(isOriginalNativePrivateWorkerExecutionBridgeV3(context.durableInstalled.executionBridge),true);Object.assign(result.nativePrivateIntake,{privateNativeWorkerBeforeFunding:true,samePrivateNativeWorkerJournalAfterReopen:false,nativeRecipientToWorkerEncrypted:true});}
    if(context.devicePrivateAuthorized){assert.equal(isOriginalNativePrivateReservationBridgeV2(context.durableInstalled.reservationBridge),true);Object.assign(result.nativePrivateIntake,{uInstalledBeforeFunding:true,uEncryptedHttp:false,uPrivateConsent:false,uOriginalRecipient:false,samePrivateUJournalAfterReopen:false});}
    const transport = { posts: {}, responses: [], dropFund: false, fundReplyDiscarded: false,...(context.devicePrivateNative?{privateNative:true,privatePosts:{},privateAuthorized:context.devicePrivateAuthorized===true}:{}) };
    const fixedFetch = exactTlsFetch(descriptor, readFileSync(certificatePath, 'utf8'), transport);
    const api = createOriginalAccountApiV2({ descriptor, fetchImpl: fixedFetch });
    if (reservationMode) {
      // The canonical mobile root is supplied by the original fixed bootstrap.
      host = await openDeviceReservationHostVaultV1({ appRoot: context.appRoot, directory: join(privateDirectory, 'device-ciphertext'), fetch: fixedFetch });
      const created = await host.original.createLocalRootNoteVaultV1();
      vaultRootId = created.rootId; vault = host.original.openLocalRootNoteVaultV1(vaultRootId);
      deviceApi = await host.deposit.createDeviceOwnerDepositApiV1(descriptor);
    }
    const state = await api.state(); assert.equal(state.privatePortfolio, null); assert.equal(state.noteCustodyOnDevice, false);
    const access = async () => {
      active(); const value = await api.challenge('read');
      return { access: value, signature: signDeviceMessage(deviceKey, originalAccountAccessMessageV2(value)) };
    };
    if (!reservationMode) for (let attempt = 0; attempt < 16 && !key; attempt++) {
      const candidate = randomBytes(32);
      try { key = privateKeyFromHex(candidate.toString('hex')); } catch { /* no job exists */ }
      finally { candidate.fill(0); }
    }
    if (!reservationMode) assert.ok(key);
    let publicKey = key ? devicePublicKey(key) : null;
    if (!reservationMode) assert.notEqual(publicKey, descriptor.devicePublicKey, 'DEVICE_NOTE_KEY_DISTINCT_FROM_TRANSPORT_KEY');
    if(context.deviceLiveArmed){const heads=await refreshOriginalNativeDeviceLocalObservedClockV1(context.liveClocks.clock);result.deviceClockAlignment={receiverSecond:String(BigInt(heads.receiver.timestamp)),nativeSecond:String(BigInt(heads.native.timestamp)),nativeClockChanged:true,originalObservedClock:true};}
    else if (reservationMode) {
      const nativeNow = await nativeRuntime.time(), now = await runtime.time(), aligned = nativeNow - 2n;
      assert.ok(now <= aligned, 'DEVICE_US_ORIGINAL_CLOCK_ALIGNMENT');
      if (now < aligned) await runtime.advanceTo(aligned.toString());
      assert.equal(await nativeRuntime.time(), nativeNow);
      result.deviceClockAlignment = { receiverSecond: String(await runtime.time()), nativeSecond: String(nativeNow), nativeClockChanged: false };
    }
    const view = await reader.read(); await reader.assertCurrent(view);
    const scope = bare(view.domain.scope), policy = bare(view.domain.policy);
    let rootId = reservationMode ? vaultRootId : randomBytes(32).toString('hex');
    let opening = reservationMode ? null : { type: 4, rho: randomBytes(32).toString('hex'), x: publicKey.slice(2, 66),
      y: publicKey.slice(66), value: '500', secret: randomBytes(32).toString('hex') };
    const preparedLocal = reservationMode ? await vault.prepareUnissuedBalanceNote({ scope, policy, pool: bare(system.pools[0].address), recipient: bare(runtime.accounts[3]), amount: '500' }) : null;
    const commitment = reservationMode ? preparedLocal.commitment : sha(localBalanceCommitmentMessageV1(scope, policy, opening));
    const note = { scope, policy, pool: bare(system.pools[0].address), recipient: bare(runtime.accounts[3]),
      commitment, amount: '500', status: 'UNISSUED', availableBalance: null, nativeEffectsEstablished: false };
    const epoch = (BigInt(view.head.timestamp) / 600n).toString();
    const statement = { scope, policy, epoch, amount: '500', output: commitment };
    const noteSignature = reservationMode ? await vault.signPreparedDeposit(await vault.reviewPreparedDeposit({ relation: 'D26', epoch })) : signDeviceMessage(key, localUnissuedDepositFrameV1(note, { relation: 'D26', epoch }));
    if (reservationMode) localRequest = await vault.createDeviceProofRequest(noteSignature);
    witness = reservationMode ? null : normalizeDeviceDepositWitnessV1({ scope: words(scope), policy: words(policy), epoch, amount: '500',
      output: words(commitment), rho: bytes(opening.rho), key_x: bytes(opening.x), key_y: bytes(opening.y),
      secret: bytes(opening.secret), signature: bytes(noteSignature) });
    if (!reservationMode) { assert.equal(Object.hasOwn(witness, 'privateKey'), false); assert.equal(Object.hasOwn(witness, 'root'), false); }
    const witnessBytes = reservationMode ? null : deviceDepositWitnessBytesV1(witness), witnessSHA256 = reservationMode ? localRequest.witnessSHA256 : sha(witnessBytes); witnessBytes?.fill(0);
    const consent = await api.deviceDeposit.challengeJob({ ...await access(), statement, rootId,
      noteRevision: reservationMode ? localRequest.noteRevision : 2, witnessSHA256, jobId: null });
    if (reservationMode) {
      witness = await vault.bindDeviceProofRequest(localRequest, consent); localRequest.close();
      publicKey = '04' + Buffer.from(witness.key_x).toString('hex') + Buffer.from(witness.key_y).toString('hex');
      assert.notEqual(publicKey, descriptor.devicePublicKey);
      opening = { type: 4, rho: Buffer.from(witness.rho).toString('hex'), x: publicKey.slice(2,66), y: publicKey.slice(66), value: '500', secret: Buffer.from(witness.secret).toString('hex') };
      assert.equal(sha(localBalanceCommitmentMessageV1(scope, policy, opening)), commitment);
      assert.equal(Object.hasOwn(witness, 'privateKey'), false); assert.equal(Object.hasOwn(witness, 'root'), false);
    }
    if(context.devicePrivateNative){assert.equal(consent.version,2);assert.equal(consent.privateProof.profile,'ORIGINAL_NATIVE_DEVICE_D26_PRIVATE_TRANSIT_V2');assert.equal(consent.privateProof.recipient.relation,'deposit_balance');assert.equal(consent.privateProof.recipient.role,'owner');result.nativePrivateIntake.d26PrivateConsent=true;}
    const signedProof = { consent, signature: signDepositConsent(consent), witness };
    await stage('device-original-D26-job-HTTP-UNKNOWN');
    if(context.devicePrivateNative){try{const proved=await api.deviceDeposit.submit(signedProof);assert.equal(proved.jobId,consent.jobId);assert.equal(proved.stage,'PROVED');}catch(error){assert.match(error.message,/SERVICE_UNAVAILABLE/);}}else await assert.rejects(api.deviceDeposit.submit(signedProof), /SERVICE_UNAVAILABLE/);
    const proofPath=context.devicePrivateNative?'/v1/mobile/device-deposit/private-jobs':'/v1/mobile/device-deposit/jobs',proofResponse = transport.responses.find(row => row.path===proofPath);
    if(context.devicePrivateNative&&! [200,504].includes(proofResponse.status)){
      // Wait for the SAME admitted call before asserting its HTTP mapping.
      // Retain only the recipient's closed diagnostic; never replay the job.
      try{await awaitDeviceOwnerDepositOriginalProofV1(bridge);}catch(error){
        try{const diagnostic=Object.getOwnPropertyDescriptor(error,'nativePrivateProofDiagnostic')?.value;
          writeFixturePrivate(join(privateDirectory,'native-private-deposit-first-error.json'),normalizeOriginalNativePrivateDepositFailureV2(diagnostic));
        }catch{/* Diagnostic storage cannot replace the original proof failure. */}
        throw error;
      }
    }
    if(context.devicePrivateNative)assert.ok([200,504].includes(proofResponse.status));else assert.equal(proofResponse.status,504);assert.equal(transport.posts[proofPath],1);if(context.devicePrivateNative){assert.equal(transport.privatePosts[proofPath],1);result.nativePrivateIntake.d26EncryptedHttp=true;}
    // An explicit replay is a negative boundary, never an automatic retry.
    await assert.rejects(api.deviceDeposit.submit(signedProof));
    await proofRetained();
    await awaitDeviceOwnerDepositOriginalProofV1(bridge); active();
    for (const value of Object.values(witness)) if (Array.isArray(value)) value.fill(0); witness = null;
    await stage('device-second-consent-original-funding-reply-loss');
    const funding = await api.deviceDeposit.challenge('FUND_D26', { ...await access(), jobId: consent.jobId });
    const signedFunding = { consent: funding, signature: signDepositConsent(funding) };
    transport.dropFund = true;
    await assert.rejects(api.deviceDeposit.submit(signedFunding), /FUND_REPLY_LOST_BEFORE_API|SERVICE_UNAVAILABLE/);
    result.deviceFundingHttp = { status: transport.fundHttpStatus ?? null, posts: transport.posts['/v1/mobile/device-deposit/fund'],
      actualReplyDiscarded: transport.fundReplyDiscarded, clientReportedUnknown: true, automaticRetry: false }; save();
    await stage('device-original-funding-await-same-admitted-work');
    // Preserve the ORIGINAL cause even when HTTP publishes only a generic
    // error. A timeout/reply loss never retries or cancels that admitted call.
    await awaitDeviceOwnerDepositOriginalFundingV1(bridge); active();
    assert.equal(transport.posts['/v1/mobile/device-deposit/fund'], 1);
    assert.ok([200, 504].includes(transport.fundHttpStatus), 'DEVICE_DEPOSIT_FUND_HTTP_UNRESOLVED');
    if (transport.fundHttpStatus === 200) {
      assert.equal(transport.fundReplyDiscarded, true);
      assert.equal(transport.fundAuthorizationSHA256, sha(deviceDepositConsentMessageV1(funding)));
    } else assert.equal(transport.fundReplyDiscarded, false);
    await stage('device-explicit-original-inclusion-same-opening');
    const observe = async () => {
      // V2 reviews belong to the SDK instance that issued them. The mobile
      // inclusion adapter must issue and consume its own original review.
      const consent = await (reservationMode ? deviceApi : api.deviceDeposit).challenge('OBSERVE_D26', { ...await access(), jobId: funding.jobId });
      const signed = { consent, signature: signDepositConsent(consent) };
      let value;
      try {
        if (reservationMode) {
          const reply = await deviceApi.submit(signed); assert.equal(reply.state, 'CONFIRMED');
          value = { stage: 'CONFIRMED', authorizationSHA256: sha(deviceDepositConsentMessageV1(consent)), observation: host.deposit.readDeviceDepositInclusionV1(reply.observation) };
          await vault.applyDeviceDepositInclusion(reply.observation);
        } else value = await api.deviceDeposit.submit(signed);
      } catch (error) { await awaitDeviceOwnerDepositOriginalObservationV1(bridge); throw error; }
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
    assert.equal(transaction.request.data, encodeFlatTransaction('depositBalance', { proof: originalProof.proof, publicInputs: originalProof.publicInputs }));
    assert.equal(transaction.transactionHash, '0x' + observation.transactionHash);
    assert.equal(transaction.request.to, system.pools[0].address); assert.equal(BigInt(transaction.request.value), 500n);
    const beforeReplay = { transactions: runtime.transactions.length, proofs: result.proofs.length };
    await assert.rejects(api.deviceDeposit.submit(signedFunding), funding.version === 2
      ? /MOBILE_ORIGINAL_PRIVATE_CONSENT/ : /SERVICE_UNAVAILABLE/);
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
        clientReportedUnknown: proofResponse.status===504, automaticRetry: false, explicitRejectedReplayPosts: transport.posts[proofPath] - 1 },
      fundHttp: { status: transport.fundHttpStatus, originalWorkCompleted: true, actualAdmissionReplyDiscarded: transport.fundReplyDiscarded, posts: 1,
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
    if (reservationMode) {
      assert.equal((await vault.readDeviceNote()).availableBalance, '500');
      const firstClosed = context.deviceDurableSQL?null:await handoffPairedDeviceDepositTlsServerV1(server); if(firstClosed){assert.equal(firstClosed.closed,true);assert.equal(firstClosed.ownedSocketsRemaining,0);}
      if(firstClosed)result.cleanup.mobileListeners.push(firstClosed); if(!context.deviceEconomicRecovery)bridge.close();
      continuation = await runDeviceOwnerReservationContinuationV1({ ...context, actor, descriptor, deviceApi, host, vault, api, certificatePath, keyPath, transport, fixedFetch, depositJobId: funding.jobId,originalDepositBridge:context.deviceEconomicRecovery?bridge:null,
        refreshOriginalDepositInclusion:context.deviceEconomicRecovery?observe:null });
      server = ownedPair.server = continuation.server;
    }
  } finally {
    key?.fill(0); localRequest?.close(); if (witness) for (const value of Object.values(witness)) if (Array.isArray(value)) value.fill(0);
    // The shared original close owns successful listeners and retirement. A
    // startup rejection before a listener exists has no admitted financial job.
    if (!server) {
      bridge?.close(); actor?.close(); vault?.close(); deviceApi?.close(); host?.close();
      if (existsSync(tlsDirectory)) rmSync(tlsDirectory, { recursive: true });
    }
  }
}
