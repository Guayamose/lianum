/** Trusted scoped role launcher. No root signing keys or caller-selected worker
 * paths/backends. One private job enters a fresh role; only its public proof is
 * returned. The enclosing owned runtime supervisor owns aggregate resources. */
import assert from 'node:assert/strict';
import { assertBeginPayoutAuditRoleLaunchV1 } from './native-flow-proof-scope-v1.mjs';
import {RESERVATION_NATIVE_THREADS_V1,assertNativeReservationReceiptV1} from './reservation-native-execution-v1.mjs';
import {NODE_NATIVE_THREADS_V1,assertNativeNodeReceiptV1} from './node-native-execution-v1.mjs';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { ROOT, LOCAL, LIMITS } from '../catalog.mjs';
import { relationWithNativeIngressV3 as relation, publicWordsWithNativeIngressV3 as publicWords,
  NATIVE_INGRESS_V3_SPEC, NATIVE_INGRESS_V3_LOCAL, NATIVE_INGRESS_V3_SOURCE_VERSION,
  NATIVE_INGRESS_V3_KEY_SHA256 } from '../native-ingress/metadata/native-ingress-v3-profile.mjs';
import { regular, hash, assertID } from '../tooling/tooling.mjs';
import { cloneInput, frozenInput } from '../../../backend/src/execution/account/preparation/readiness-inputs.mjs';
import {encodeStatement} from '@lianum/components/encoding/statements';
import { exactRecord } from '@lianum/components/encoding/commitments';
import {sealPrivateProofJobV1,privateProofAuthorizationBindingV1,privateProofBindingSHA256V1,wipePrivateProofInputsV1,createPrivateProofRecipientV1,readPrivateProofRecipientV1,openPrivateProofJobV1,closePrivateProofRecipientV1} from './private-proof-transit-v1.mjs';

const MODES = Object.freeze({ owner: ['authorization', 'deposit_intent'], reservation: ['reservation'],
  dependency: ['dependency'], local: ['ready', 'admission', 'node'], assembler: ['settlement'], recovery: ['recovery'],
  claim_ingress: ['native_claim_ingress', 'native_claim_ingress_v3'], claim_discharge: ['native_claim_discharge'] });
const owned = new WeakMap(), privateDeviceResults = new WeakMap(),privateClaimResults=new WeakMap(),privateGraphResults=new WeakMap(),privateNativeGraphResults=new WeakMap();
// Role packets stay mutable only in the private client closure so that the
// original cleanup can release their references after its admitted work drains.
// Readers receive their own snapshots; those belong to the receiving account.
function discardPrivateAuthorization(preparation) {
  if (preparation?.kind !== 'authorization') return;
  wipePrivateProofInputsV1(preparation.derived); preparation.derived = null;
}
/** Timing evidence is descriptive, never a circuit scalar. The owner custody
 * transport deliberately allows only integer JSON numbers. Preserve measured
 * fractional milliseconds as decimal strings instead of relaxing that rule
 * or rounding the proof report. The immutable worker report remains numeric. */
export function proofMetricsForTransport(metrics) {
  const fields = ['initializationMilliseconds', 'jobPreparationMilliseconds', 'witnessMilliseconds',
    'proofMilliseconds', 'verificationMilliseconds', 'totalMilliseconds', 'otherMilliseconds'];
  exactRecord(metrics, fields);
  return frozenInput(Object.fromEntries(fields.map(name => {
    const value = metrics[name];
    assert.ok(typeof value === 'number' && Number.isFinite(value) && value >= 0 && !Object.is(value, -0),
      'ROLE_CLIENT_MEASURED_DURATION');
    return [name, String(value)];
  })));
}
export function assertRoleProofClient(client, role) {
  const state = owned.get(client);
  assert.ok(state && state.role === role && !state.closed, 'ROLE_CLIENT_OWNED_REQUIRED');
}
export function createRoleProofClient(role) {
  assert.ok(typeof role === 'string' && Object.hasOwn(MODES, role), 'ROLE_CLIENT_FIXED_ROLE');
  const state = { role, closed: false, busy: false, active: null, prepared: null };
  async function prove(raw, originalConsent = null, preparation = null) {
    assertRoleProofClient(client, role); assert.equal(state.busy, false, 'ROLE_CLIENT_BUSY');
    const request = cloneInput(raw);
    let spec, expected;
    try {
      exactRecord(request, ['relation', 'inputs', 'expectedPublicInputs']);
      assert.ok(MODES[role].includes(request.relation), 'ROLE_CLIENT_RELATION');
      spec = relation(request.relation);
      if (originalConsent) assert.notEqual(spec, NATIVE_INGRESS_V3_SPEC, 'ROLE_CLIENT_PRIVATE_RELATION');
      if(preparation?.kind==='authorization'){assert.equal(spec.name,'authorization','ROLE_CLIENT_PRIVATE_RELATION');assert.equal(request.expectedPublicInputs,null,'ROLE_CLIENT_PRIVATE_DERIVATION_ONLY');expected=null;}else expected = publicWords(spec, request.expectedPublicInputs);
      assert.ok(Buffer.byteLength(JSON.stringify(request)) <= LIMITS.jobBytes, 'ROLE_CLIENT_INPUT_BOUND');
    } catch (error) { wipePrivateProofInputsV1(request.inputs); throw error; }
    state.busy = true;
    let child, timer, killTimer, closed = false, jobId = null, sent = false, failure = null;
    let stdout = '', outputBytes = 0, authorization = null, readySeen = false;
    const stop = code => {
      failure ??= code;
      if (child?.pid && !closed) {
        child.kill('SIGTERM');
        killTimer ??= setTimeout(() => { if (!closed) child.kill('SIGKILL'); }, LIMITS.killGraceMilliseconds);
      }
    };
    try {
      assertBeginPayoutAuditRoleLaunchV1(role, spec.name);
      child = spawn(process.execPath, [join(ROOT, spec === NATIVE_INGRESS_V3_SPEC
        ? 'proof-workers/native-ingress-v3-role-process.mjs' : 'proof-workers/role-process.mjs'), spec.name],
        { cwd: ROOT, env: { PATH: '/usr/bin:/bin', LANG: 'C.UTF-8' }, serialization: 'json',
          stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
      state.active = { stop };
      const completion = new Promise(resolve => child.once('close', (code, signal) => {
        closed = true; resolve({ code, signal });
      }));
      child.once('error', () => stop('ROLE_CLIENT_SPAWN_FAILED'));
      child.on('message', message => {
        try {
          if(preparation?.kind==='authorization'&&message?.type==='flat-private-owner-result-v2'){
            exactRecord(message,['type','packet']);assert.ok(sent&&authorization&&!preparation.derived,'ROLE_CLIENT_PRIVATE_ONE_RESULT');
            assert.ok(typeof message.packet?.ciphertext==='string'&&message.packet.ciphertext.length<=349528,'ROLE_CLIENT_PRIVATE_RESULT_BOUND');
            const opened=openPrivateProofJobV1(preparation.resultHandle,message.packet);let derived;try{
              assert.deepEqual(opened.authorization,authorization,'ROLE_CLIENT_PRIVATE_RESULT_BINDING');
              derived=cloneInput(opened.inputs);exactRecord(derived,['profile','jobId','sourceAmount','publicStatement','expectedPublicInputs','rolePackets','outputs','consentSHA256','witnessSHA256']);
              assert.equal(derived.profile,preparation.native?'ORIGINAL_NATIVE_DEVICE_U_PRIVATE_DERIVATION_V2':'ORIGINAL_DEVICE_U_PRIVATE_DERIVATION_V2','ROLE_CLIENT_PRIVATE_DERIVATION');
              assert.equal(derived.jobId,authorization.jobId,'ROLE_CLIENT_PRIVATE_DERIVATION_JOB');
              assert.equal(derived.consentSHA256,authorization.consentSHA256,'ROLE_CLIENT_PRIVATE_DERIVATION_CONSENT');assert.equal(derived.witnessSHA256,authorization.witnessSHA256,'ROLE_CLIENT_PRIVATE_DERIVATION_WITNESS');
              assert.ok(Buffer.byteLength(JSON.stringify(derived))<=262144,'ROLE_CLIENT_PRIVATE_RESULT_BOUND');
              expected=publicWords(spec,derived.expectedPublicInputs);assert.deepEqual(opened.expectedPublicInputs,expected,'ROLE_CLIENT_PRIVATE_DERIVED_PUBLIC');
              exactRecord(derived.publicStatement,['domainCommitment','envelope']);assert.deepEqual(expected,[...encodeStatement('authorization',derived.publicStatement)],'ROLE_CLIENT_PRIVATE_DERIVED_PUBLIC');for(const v of Object.values(derived.publicStatement))assert.match(v,/^[0-9a-f]{64}$/,'ROLE_CLIENT_PRIVATE_PUBLIC');
              exactRecord(derived.rolePackets,['reservation','recovery','assembler','local','dependency']);for(const k of ['local','dependency'])assert.ok(Array.isArray(derived.rolePackets[k])&&derived.rolePackets[k].length===4,'ROLE_CLIENT_PRIVATE_SCOPED_ROLES');
              exactRecord(derived.outputs,['change','recovery']);preparation.derived=derived;derived=null;
            }finally{wipePrivateProofInputsV1(derived);wipePrivateProofInputsV1(opened.inputs);}return;
          }
          const nativeV3 = spec === NATIVE_INGRESS_V3_SPEC;
          exactRecord(message, nativeV3 ? ['type', 'relation', 'role', 'jobId']
            : ['type', 'profile', 'relation', 'role', 'jobId', 'recipientPublicKey']);
          assert.equal(message.type, nativeV3 ? 'flat-proof-input-ready' : 'flat-private-proof-input-ready', 'ROLE_CLIENT_READY_MESSAGE');
          assert.equal(message.relation, spec.name, 'ROLE_CLIENT_READY_RELATION');
          assert.equal(message.role, spec.role, 'ROLE_CLIENT_READY_SCOPE');
          assert.equal(readySeen, false, 'ROLE_CLIENT_ONE_READY'); readySeen = true;
          jobId = assertID(message.jobId);
          if (preparation) {
            assert.equal(spec.name,preparation.kind,'ROLE_CLIENT_PRIVATE_RELATION');
            preparation.ready=frozenInput(cloneInput(message));
            if(preparation.kind==='authorization')preparation.resultHandle=createPrivateProofRecipientV1({relation:spec.name,role:spec.role,jobId});
            preparation.send=(packet,binding)=>{
              assert.equal(sent,false,'ROLE_CLIENT_ONE_HANDOFF');
              assert.equal(state.prepared,preparation,'ROLE_CLIENT_PRIVATE_PREPARATION');
              exactRecord(packet,['type','profile','relation','role','jobId','recipientPublicKey','senderPublicKey',
                'authorization','publicInputsSHA256','salt','iv','tag','ciphertext']);
              assert.equal(packet.type,'flat-private-proof-inputs','ROLE_CLIENT_PRIVATE_PACKET');
              for(const name of ['profile','relation','role','jobId','recipientPublicKey'])
                assert.equal(packet[name],message[name],'ROLE_CLIENT_PRIVATE_RECIPIENT');
              authorization=privateProofAuthorizationBindingV1(binding);
              assert.deepEqual(packet.authorization,authorization,'ROLE_CLIENT_PRIVATE_CONSENT');
              assert.equal(packet.publicInputsSHA256,hash(Buffer.from(JSON.stringify(expected))),'ROLE_CLIENT_PRIVATE_PUBLIC');
              assert.ok(typeof packet.ciphertext==='string'&&packet.ciphertext.length<=(preparation.kind==='authorization'?60116:preparation.kind==='native_claim_ingress'?2796204:16384),'ROLE_CLIENT_PRIVATE_BOUND');
              sent=true;clearTimeout(preparation.waitTimer);
              child.send(cloneInput(packet),error=>{if(error)stop('ROLE_CLIENT_IPC_FAILED');});
            };
            preparation.waitTimer=setTimeout(()=>stop('ROLE_CLIENT_PRIVATE_PERMISSION_WAIT_EXPIRED'),15000);
            preparation.resolveReady(preparation.kind==='authorization'?frozenInput({recipient:preparation.ready,resultRecipient:readPrivateProofRecipientV1(preparation.resultHandle)}):preparation.ready);return;
          }
          assert.equal(sent, false, 'ROLE_CLIENT_ONE_HANDOFF'); sent = true;
          authorization = originalConsent ?? privateProofAuthorizationBindingV1({ kind: 'SCOPED_JOB_V1', jobId,
            consentSHA256: hash(Buffer.from(JSON.stringify({relation:spec.name,role:spec.role,jobId,expectedPublicInputs:expected}))),
            witnessSHA256: hash(Buffer.from(JSON.stringify(request.inputs))) });
          const packet = nativeV3 ? { type: 'flat-proof-inputs', relation: spec.name, role: spec.role,
            jobId, inputs: request.inputs, expectedPublicInputs: expected }
            : sealPrivateProofJobV1(message, {inputs:request.inputs,expectedPublicInputs:expected,authorization});
          child.send(packet, error => { if (error) stop('ROLE_CLIENT_IPC_FAILED'); });
          // The V3 pipeline retains its original serialization lifetime.
          if (!nativeV3) wipePrivateProofInputsV1(request.inputs);
          request.inputs = undefined;
        } catch { stop('ROLE_CLIENT_INVALID_HANDOFF'); }
      });
      child.stdout.on('data', bytes => {
        outputBytes += bytes.length;
        if (outputBytes > LIMITS.outputBytes) stop('ROLE_CLIENT_OUTPUT_BOUND');
        else stdout += bytes.toString('utf8');
      });
      child.stderr.on('data', bytes => {
        outputBytes += bytes.length;
        if (outputBytes > LIMITS.outputBytes) stop('ROLE_CLIENT_OUTPUT_BOUND');
      });
      // Includes initial handoff, key validation, proof and child cleanup.
      timer = setTimeout(() => stop('ROLE_CLIENT_TOTAL_TIMEOUT'), LIMITS.phaseTimeoutMilliseconds);
      const exit = await completion;
      assert.equal(failure, null, failure ?? 'ROLE_CLIENT_FAILURE');
      assert.equal(exit.code, 0, 'ROLE_CLIENT_EXIT'); assert.equal(exit.signal, null, 'ROLE_CLIENT_SIGNAL');
      assert.ok(sent && jobId, 'ROLE_CLIENT_NO_HANDOFF');
      const status = JSON.parse(stdout.trim());
      assert.equal(status.phase, 'completed', 'ROLE_CLIENT_PROOF_FAILED');
      assert.equal(status.relation, spec.name, 'ROLE_CLIENT_RESULT_RELATION');
      assert.ok(['prove', 'prove-dyadic21'].includes(status.mode), 'ROLE_CLIENT_RESULT_MODE');
      const runId = assertID(status.runId), directory = join(spec === NATIVE_INGRESS_V3_SPEC
        ? NATIVE_INGRESS_V3_LOCAL : LOCAL, 'attempts', runId);
      const result = JSON.parse(regular(join(directory, 'result.json')));
      const resources = JSON.parse(regular(join(directory, 'resources.json')));
      for (const report of [result, resources]) {
        assert.equal(report.runId, runId); assert.equal(report.jobId, jobId);
        assert.equal(report.relation, spec.name); assert.equal(report.phase, 'completed');
      }
      assert.equal(resources.exitCode,0);assert.equal(resources.signal,null);assert.equal(resources.failure,null);
      if(spec.name==='reservation'&&result.threads===RESERVATION_NATIVE_THREADS_V1)assertNativeReservationReceiptV1(spec,result,resources);
      else if(spec.name==='node'&&result.threads===NODE_NATIVE_THREADS_V1)assertNativeNodeReceiptV1(spec,result,resources);
      const manifest = JSON.parse(regular(join(directory, 'proof-manifest.json')));
      const proof = regular(join(directory, 'proof.bin'));
      const inputBytes = regular(join(directory, 'public-inputs.json'));
      const inputs = publicWords(spec, JSON.parse(inputBytes));
      assert.equal(manifest.jobId, jobId); assert.equal(manifest.role, spec.role);
      if (spec !== NATIVE_INGRESS_V3_SPEC) assert.equal(manifest.privateTransitBindingSHA256,
        privateProofBindingSHA256V1(authorization), 'ROLE_CLIENT_PRIVATE_TRANSIT_BINDING');
      assert.equal(manifest.relation, spec.name, 'ROLE_CLIENT_MANIFEST_RELATION');
      if (spec === NATIVE_INGRESS_V3_SPEC) {
        assert.equal(manifest.sourceVersion, NATIVE_INGRESS_V3_SOURCE_VERSION, 'ROLE_CLIENT_V3_SOURCE');
        assert.equal(manifest.keySHA256, NATIVE_INGRESS_V3_KEY_SHA256, 'ROLE_CLIENT_V3_KEY');
        assert.equal(result.keyGenerated, false, 'ROLE_CLIENT_V3_NO_KEY_REGEN');
      }
      assert.equal(hash(proof), manifest.proofSHA256, 'ROLE_CLIENT_PROOF_HASH');
      assert.equal(hash(inputBytes), manifest.publicInputsSHA256, 'ROLE_CLIENT_PUBLIC_HASH');
      if(preparation?.kind==='authorization')assert.ok(preparation.derived&&expected,'ROLE_CLIENT_PRIVATE_RESULT_REQUIRED');
      assert.deepEqual(inputs, expected, 'ROLE_CLIENT_PUBLIC_BINDING');
      assert.equal(manifest.selfVerified, true, 'ROLE_CLIENT_SELF_VERIFIED');
      const output = frozenInput({ proof: proof.toString('hex'), publicInputs: inputs,
        evidence: { relation: spec.name, role, runId, jobId, proofSHA256: manifest.proofSHA256,
          keySHA256: manifest.keySHA256, manifestSHA256: hash(regular(join(directory, 'proof-manifest.json'))),
          metricUnits: 'milliseconds', metrics: proofMetricsForTransport(result.metrics) } });
      if(preparation?.kind==='authorization')(preparation.native?privateNativeGraphResults:privateGraphResults).set(output,{client,derived:preparation.derived});
      else if(preparation?.deviceClaim===true){
        const d=cloneInput(status.privateDeviceDerivation),ingress=spec.name==='native_claim_ingress';exactRecord(d,['profile','action','jobId','commitment','claimDomain','consentSHA256','witnessSHA256','commonSHA256',...(ingress?[]:['receiptBinding','nullifier'])]);
        assert.equal(d.profile,'ORIGINAL_DEVICE_ROOT_NATIVE_CLAIM_DERIVATION_V2','ROLE_CLIENT_DEVICE_CLAIM_RESULT');assert.equal(d.action,ingress?'PROVE_CI51':'PROVE_D27','ROLE_CLIENT_DEVICE_CLAIM_ACTION');assert.equal(d.jobId,authorization.jobId,'ROLE_CLIENT_DEVICE_CLAIM_JOB');
        for(const k of ['commitment','claimDomain','consentSHA256','witnessSHA256'])assert.match(d[k],/^[0-9a-f]{64}$/,'ROLE_CLIENT_DEVICE_CLAIM_DATA');assert.equal(d.consentSHA256,authorization.consentSHA256,'ROLE_CLIENT_DEVICE_CLAIM_CONSENT');assert.equal(d.witnessSHA256,authorization.witnessSHA256,'ROLE_CLIENT_DEVICE_CLAIM_WITNESS');
        if(ingress)assert.match(d.commonSHA256,/^[0-9a-f]{64}$/,'ROLE_CLIENT_DEVICE_CLAIM_DATA');else{assert.equal(d.commonSHA256,null);exactRecord(d.receiptBinding,['secret','refundSalt']);for(const v of [d.nullifier,...Object.values(d.receiptBinding)])assert.match(v,/^[0-9a-f]{64}$/,'ROLE_CLIENT_DEVICE_CLAIM_DATA');}
        privateClaimResults.set(output,{client,derived:frozenInput(d)});
      }else if (preparation?.kind==='deposit_intent') {
        const derived = cloneInput(status.privateDeviceDerivation);
        exactRecord(derived, ['profile','jobId','commitment','nullifier','consentSHA256','witnessSHA256']);
        assert.equal(derived.profile, 'ORIGINAL_DEVICE_D27_PRIVATE_DERIVATION_V2', 'ROLE_CLIENT_PRIVATE_DERIVATION');
        assert.equal(derived.jobId, authorization.jobId, 'ROLE_CLIENT_PRIVATE_DERIVATION_JOB');
        for (const name of ['commitment','nullifier','consentSHA256','witnessSHA256'])
          assert.match(derived[name], /^[0-9a-f]{64}$/, 'ROLE_CLIENT_PRIVATE_DERIVATION_DATA');
        assert.equal(derived.consentSHA256, authorization.consentSHA256, 'ROLE_CLIENT_PRIVATE_DERIVATION_CONSENT');
        assert.equal(derived.witnessSHA256, authorization.witnessSHA256, 'ROLE_CLIENT_PRIVATE_DERIVATION_WITNESS');
        privateDeviceResults.set(output, {client,derived:frozenInput(derived)});
      }
      return output;
    } catch (error) {
      discardPrivateAuthorization(preparation);
      preparation?.rejectReady(Error('ROLE_CLIENT_PRIVATE_PREPARATION_FAILED'));
      // Keep the exact durable worker attempt/claim. Do not resubmit or guess
      // success after an uncertain child outcome; only public errors leave.
      throw Object.assign(new Error(failure ?? 'ROLE_CLIENT_PROOF_INCOMPLETE'), { jobId, cause: error });
    } finally {
      clearTimeout(timer); clearTimeout(killTimer); clearTimeout(preparation?.waitTimer); if(preparation?.resultHandle)closePrivateProofRecipientV1(preparation.resultHandle); wipePrivateProofInputsV1(request.inputs); request.inputs = undefined;
      if (child?.pid && !closed) child.kill('SIGTERM');
      for (const stream of child?.stdio ?? []) stream?.destroy();
      state.active = null; state.busy = false;
    }
  }
  const client = Object.freeze({
    prove(raw) { return prove(raw); },
    async preparePrivateDeviceRootClaimV2(expectedPublicInputs) {
      assert.equal(arguments.length,1,'ROLE_CLIENT_PRIVATE_ARITY');assert.ok(['owner','claim_ingress'].includes(role),'ROLE_CLIENT_DEVICE_CLAIM_ROLE');assertRoleProofClient(client,role);assert.equal(state.busy,false,'ROLE_CLIENT_BUSY');assert.equal(state.prepared,null,'ROLE_CLIENT_PRIVATE_ONE_PREPARATION');
      const kind=role==='owner'?'deposit_intent':'native_claim_ingress',expected=publicWords(relation(kind),cloneInput(expectedPublicInputs));
      const p={kind,deviceClaim:true,ready:null,send:null,waitTimer:null,run:null,resolveReady:null,rejectReady:null},ready=new Promise((resolve,reject)=>{p.resolveReady=resolve;p.rejectReady=reject;});state.prepared=p;p.run=prove({relation:kind,inputs:null,expectedPublicInputs:expected},null,p);p.run.catch(()=>{});return ready;
    },
    async proveEncryptedDeviceRootClaimV2(packet,binding){
      assert.equal(arguments.length,2,'ROLE_CLIENT_PRIVATE_ARITY');assertRoleProofClient(client,role);const p=state.prepared;assert.ok(p?.deviceClaim===true&&p.ready&&p.send,'ROLE_CLIENT_DEVICE_CLAIM_PREPARATION');const v=privateProofAuthorizationBindingV1(binding);assert.equal(v.kind,'ORIGINAL_CONSENT_V1','ROLE_CLIENT_ORIGINAL_CONSENT');const send=p.send;p.send=null;send(packet,v);return p.run;
    },
    async drainPrivateDeviceRootClaimObservationV3(){assert.equal(arguments.length,0,'ROLE_CLIENT_PRIVATE_ARITY');assertRoleProofClient(client,role);const p=state.prepared;assert.ok(p?.deviceClaim===true,'ROLE_CLIENT_DEVICE_CLAIM_PREPARATION');p.send=null;if(state.busy)state.active?.stop('ROLE_CLIENT_OWNER_STOPPED');await p.run.catch(()=>{});assert.equal(state.busy,false,'ROLE_CLIENT_CLOSE_WHILE_BUSY');return{closed:false,inFlight:0,originalPreparationBurned:true};},
    async closePrivateDeviceRootClaimV2(){assert.equal(arguments.length,0,'ROLE_CLIENT_PRIVATE_ARITY');const p=state.prepared;assert.ok(p?.deviceClaim===true,'ROLE_CLIENT_DEVICE_CLAIM_PREPARATION');state.closed=true;if(state.busy)state.active?.stop('ROLE_CLIENT_OWNER_STOPPED');await p.run.catch(()=>{});assert.equal(state.busy,false,'ROLE_CLIENT_CLOSE_WHILE_BUSY');return{closed:true,inFlight:0};},
    async preparePrivateDeviceDepositIntentV2(expectedPublicInputs) {
      assert.equal(arguments.length, 1, 'ROLE_CLIENT_PRIVATE_ARITY');
      assertRoleProofClient(client, 'owner'); assert.equal(state.busy,false,'ROLE_CLIENT_BUSY');
      assert.equal(state.prepared,null,'ROLE_CLIENT_PRIVATE_ONE_PREPARATION');
      const expected = publicWords(relation('deposit_intent'), cloneInput(expectedPublicInputs));
      const preparation = {kind:'deposit_intent',ready:null,send:null,waitTimer:null,run:null,resolveReady:null,rejectReady:null};
      const readyPromise = new Promise((resolve,reject) => {preparation.resolveReady=resolve;preparation.rejectReady=reject;});
      state.prepared=preparation;
      preparation.run=prove({relation:'deposit_intent',inputs:null,expectedPublicInputs:expected},null,preparation);
      preparation.run.catch(()=>{});return readyPromise;
    },
    async preparePrivateDeviceAuthorizationV2() {
      assert.equal(arguments.length,0,'ROLE_CLIENT_PRIVATE_ARITY');assertRoleProofClient(client,'owner');assert.equal(state.busy,false,'ROLE_CLIENT_BUSY');assert.equal(state.prepared,null,'ROLE_CLIENT_PRIVATE_ONE_PREPARATION');
      const preparation={kind:'authorization',ready:null,send:null,waitTimer:null,run:null,resolveReady:null,rejectReady:null,resultHandle:null,derived:null};
      const readyPromise=new Promise((resolve,reject)=>{preparation.resolveReady=resolve;preparation.rejectReady=reject;});state.prepared=preparation;
      preparation.run=prove({relation:'authorization',inputs:null,expectedPublicInputs:null},null,preparation);preparation.run.catch(()=>{});return readyPromise;
    },
    async proveEncryptedDeviceAuthorizationV2(packet,binding) {
      assert.equal(arguments.length,2,'ROLE_CLIENT_PRIVATE_ARITY');assertRoleProofClient(client,'owner');const p=state.prepared;
      assert.ok(p?.kind==='authorization'&&!p.native&&p.ready&&p.send,'ROLE_CLIENT_PRIVATE_PREPARATION');const value=privateProofAuthorizationBindingV1(binding);assert.equal(value.kind,'ORIGINAL_CONSENT_V1','ROLE_CLIENT_ORIGINAL_CONSENT');const send=p.send;p.send=null;send(packet,value);return p.run;
    },
    async closePrivateDeviceAuthorizationV2() {
      assert.equal(arguments.length,0,'ROLE_CLIENT_PRIVATE_ARITY');assert.ok(state.prepared?.kind==='authorization'&&!state.prepared.native,'ROLE_CLIENT_PRIVATE_PREPARATION');
      const preparation=state.prepared;state.closed=true;
      try{if(state.busy)state.active?.stop('ROLE_CLIENT_OWNER_STOPPED');await preparation.run.catch(()=>{});assert.equal(state.busy,false,'ROLE_CLIENT_CLOSE_WHILE_BUSY');return{closed:true,inFlight:0};}
      finally{discardPrivateAuthorization(preparation);}
    },
    async preparePrivateNativeDeviceAuthorizationV2() {
      assert.equal(arguments.length,0,'ROLE_CLIENT_PRIVATE_ARITY');assertRoleProofClient(client,'owner');assert.equal(state.busy,false,'ROLE_CLIENT_BUSY');assert.equal(state.prepared,null,'ROLE_CLIENT_PRIVATE_ONE_PREPARATION');
      const preparation={kind:'authorization',native:true,ready:null,send:null,waitTimer:null,run:null,resolveReady:null,rejectReady:null,resultHandle:null,derived:null};
      const readyPromise=new Promise((resolve,reject)=>{preparation.resolveReady=resolve;preparation.rejectReady=reject;});state.prepared=preparation;
      preparation.run=prove({relation:'authorization',inputs:null,expectedPublicInputs:null},null,preparation);preparation.run.catch(()=>{});return readyPromise;
    },
    async proveEncryptedNativeDeviceAuthorizationV2(packet,binding) {
      assert.equal(arguments.length,2,'ROLE_CLIENT_PRIVATE_ARITY');assertRoleProofClient(client,'owner');const p=state.prepared;
      assert.ok(p?.kind==='authorization'&&p.native===true&&p.ready&&p.send,'ROLE_CLIENT_PRIVATE_PREPARATION');const value=privateProofAuthorizationBindingV1(binding);assert.equal(value.kind,'ORIGINAL_CONSENT_V1','ROLE_CLIENT_ORIGINAL_CONSENT');const send=p.send;p.send=null;send(packet,value);return p.run;
    },
    async closePrivateNativeDeviceAuthorizationV2() {
      assert.equal(arguments.length,0,'ROLE_CLIENT_PRIVATE_ARITY');assert.ok(state.prepared?.kind==='authorization'&&state.prepared.native===true,'ROLE_CLIENT_PRIVATE_PREPARATION');
      const preparation=state.prepared;state.closed=true;
      try{if(state.busy)state.active?.stop('ROLE_CLIENT_OWNER_STOPPED');await preparation.run.catch(()=>{});assert.equal(state.busy,false,'ROLE_CLIENT_CLOSE_WHILE_BUSY');return{closed:true,inFlight:0};}
      finally{discardPrivateAuthorization(preparation);}
    },
    async proveEncryptedDeviceDepositIntentV2(packet,binding) {
      assert.equal(arguments.length,2,'ROLE_CLIENT_PRIVATE_ARITY');assertRoleProofClient(client,'owner');
      const preparation=state.prepared;assert.ok(preparation?.kind==='deposit_intent'&&preparation.ready&&preparation.send,'ROLE_CLIENT_PRIVATE_PREPARATION');
      const value=privateProofAuthorizationBindingV1(binding);
      assert.equal(value.kind,'ORIGINAL_CONSENT_V1','ROLE_CLIENT_ORIGINAL_CONSENT');
      const send=preparation.send;preparation.send=null;send(packet,value);return preparation.run;
    },
    async closePrivateDeviceDepositIntentV2() {
      assert.equal(arguments.length,0,'ROLE_CLIENT_PRIVATE_ARITY');
      const preparation=state.prepared;assert.ok(preparation,'ROLE_CLIENT_PRIVATE_PREPARATION');
      if(state.busy)state.active?.stop('ROLE_CLIENT_OWNER_STOPPED');
      await preparation.run.catch(()=>{});assert.equal(state.busy,false,'ROLE_CLIENT_CLOSE_WHILE_BUSY');state.closed=true;
      return{closed:true,inFlight:0};
    },
    async preparePrivateNativeClaimIngressV2(expectedPublicInputs) {
      assert.equal(arguments.length,1,'ROLE_CLIENT_PRIVATE_ARITY');assertRoleProofClient(client,'claim_ingress');assert.equal(state.busy,false,'ROLE_CLIENT_BUSY');assert.equal(state.prepared,null,'ROLE_CLIENT_PRIVATE_ONE_PREPARATION');
      const expected=publicWords(relation('native_claim_ingress'),cloneInput(expectedPublicInputs)),preparation={kind:'native_claim_ingress',ready:null,send:null,waitTimer:null,run:null,resolveReady:null,rejectReady:null};
      const ready=new Promise((resolve,reject)=>{preparation.resolveReady=resolve;preparation.rejectReady=reject;});state.prepared=preparation;preparation.run=prove({relation:'native_claim_ingress',inputs:null,expectedPublicInputs:expected},null,preparation);preparation.run.catch(()=>{});return ready;
    },
    async proveEncryptedNativeClaimIngressV2(packet,binding) {
      assert.equal(arguments.length,2,'ROLE_CLIENT_PRIVATE_ARITY');assertRoleProofClient(client,'claim_ingress');const p=state.prepared;assert.ok(p?.kind==='native_claim_ingress'&&p.ready&&p.send,'ROLE_CLIENT_PRIVATE_PREPARATION');const value=privateProofAuthorizationBindingV1(binding);assert.equal(value.kind,'SCOPED_JOB_V1','ROLE_CLIENT_PRIVATE_CI51_HOLDER_BINDING');const send=p.send;p.send=null;send(packet,value);return p.run;
    },
    async closePrivateNativeClaimIngressV2() {
      assert.equal(arguments.length,0,'ROLE_CLIENT_PRIVATE_ARITY');const p=state.prepared;assert.ok(p?.kind==='native_claim_ingress','ROLE_CLIENT_PRIVATE_PREPARATION');state.closed=true;if(state.busy)state.active?.stop('ROLE_CLIENT_OWNER_STOPPED');await p.run.catch(()=>{});assert.equal(state.busy,false,'ROLE_CLIENT_CLOSE_WHILE_BUSY');return{closed:true,inFlight:0};
    },
    proveForOriginalConsentV1(raw, binding) {
      assert.equal(arguments.length, 2, 'ROLE_CLIENT_CONSENT_ARITY');
      const value = privateProofAuthorizationBindingV1(binding);
      assert.equal(value.kind, 'ORIGINAL_CONSENT_V1', 'ROLE_CLIENT_ORIGINAL_CONSENT');
      return prove(raw, value);
    },
    close() { assert.equal(state.busy, false, 'ROLE_CLIENT_CLOSE_WHILE_BUSY'); state.closed = true; discardPrivateAuthorization(state.prepared); },
    stop() { state.active?.stop('ROLE_CLIENT_OWNER_STOPPED'); },
  });
  owned.set(client, state); return client;
}

/** SAME original client/child only. A JSON derivation cannot install CM/NF. */
export function readOriginalDeviceDepositIntentDerivationV2(client,result) {
  assert.equal(arguments.length,2,'ROLE_CLIENT_PRIVATE_ARITY');assertRoleProofClient(client,'owner');
  const state=privateDeviceResults.get(result);assert.ok(state&&state.client===client,'ROLE_CLIENT_PRIVATE_RESULT');
  return state.derived;
}

/** Returned data belongs to the original recipient/client, never a JSON capability. */
export function readOriginalDeviceAuthorizationDerivationV2(client,result){assert.equal(arguments.length,2,'ROLE_CLIENT_PRIVATE_ARITY');assertRoleProofClient(client,'owner');const s=privateGraphResults.get(result);assert.ok(s&&s.client===client,'ROLE_CLIENT_PRIVATE_RESULT');return frozenInput(cloneInput(s.derived));}

/** Private Native U results are capabilities of the SAME original owner client. */
export function readOriginalNativeDeviceAuthorizationDerivationV2(client,result){assert.equal(arguments.length,2);assertRoleProofClient(client,'owner');const row=privateNativeGraphResults.get(result);assert.ok(row?.client===client,'ROLE_CLIENT_PRIVATE_NATIVE_RESULT');return frozenInput(cloneInput(row.derived));}


/** Actual fixed recipient result only; serialized proof/derivation copies fail. */
export function readOriginalDeviceRootClaimDerivationV2(client,result){assert.equal(arguments.length,2,'ROLE_CLIENT_PRIVATE_ARITY');const row=privateClaimResults.get(result);assert.ok(row?.client===client,'ROLE_CLIENT_DEVICE_CLAIM_RESULT');return frozenInput(cloneInput(row.derived));}
