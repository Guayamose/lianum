/** Trusted scoped role launcher. No root signing keys or caller-selected worker
 * paths/backends. One private job enters a fresh role; only its public proof is
 * returned. The enclosing owned runtime supervisor owns aggregate resources. */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { ROOT, LIMITS } from '@lianum/proofs/catalog';
import { NATIVE_VALUE_LIVE_V2_SPEC, NATIVE_VALUE_LIVE_V2_LOCAL, NATIVE_VALUE_LIVE_V2_SOURCE_VERSION,
  NATIVE_VALUE_LIVE_V2_KEY_SHA256, NATIVE_VALUE_LIVE_V2_KEY_MANIFEST_SHA256, nativeValueLivePublicWords, validateNativeValueLiveV2Job } from '@lianum/proofs/native-value/metadata/native-value-live-v2-profile';
import { loadNativeValueLiveArtifacts } from '../metadata/native-value-live-v2-artifacts.mjs';
import { regular, hash, assertID } from '@lianum/proofs/tooling/tooling';
import { cloneInput, frozenInput } from '@lianum/components/plain-input';
import { exactRecord } from '@lianum/components/encoding/commitments';

const owned = new WeakMap();
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
      'NV2_CLIENT_MEASURED_DURATION');
    return [name, String(value)];
  })));
}
export function assertNativeValueLiveProofClient(client) {
  const state = owned.get(client);
  assert.ok(state && state.role === 'local' && !state.closed, 'NV2_CLIENT_OWNED_REQUIRED');
}
export function createNativeValueLiveProofClient() {
  assert.equal(arguments.length, 0, 'NV2_CLIENT_NO_OPTIONS'); const role = 'local';
  const state = { role, closed: false, busy: false, used: false, active: null };
  const client = Object.freeze({
    async prove(raw) {
      assert.equal(arguments.length, 1, 'NV2_CLIENT_EXACT_REQUEST');
      assertNativeValueLiveProofClient(client); assert.equal(state.busy, false, 'NV2_CLIENT_BUSY');
      assert.equal(state.used, false, 'NV2_CLIENT_ONE_PROOF');
      const request = cloneInput(raw);
      exactRecord(request, ['inputs', 'expectedPublicInputs']);
      const spec = NATIVE_VALUE_LIVE_V2_SPEC;
      const expected = nativeValueLivePublicWords(spec, request.expectedPublicInputs);
      assert.ok(Buffer.byteLength(JSON.stringify(request)) <= LIMITS.jobBytes, 'NV2_CLIENT_INPUT_BOUND');
      state.busy = true; state.used = true;
      let child, timer, killTimer, closed = false, jobId = null, sent = false, failure = null;
      let stdout = '', outputBytes = 0;
      const stop = code => {
        failure ??= code;
        if (child?.pid && !closed) {
          child.kill('SIGTERM');
          killTimer ??= setTimeout(() => { if (!closed) child.kill('SIGKILL'); }, LIMITS.killGraceMilliseconds);
        }
      };
      state.active = { stop };
      timer = setTimeout(() => stop('NV2_CLIENT_TOTAL_TIMEOUT'), LIMITS.phaseTimeoutMilliseconds);
      try {
        const artifacts = await loadNativeValueLiveArtifacts();
        const job = validateNativeValueLiveV2Job(artifacts.program.abi, request.inputs, expected);
        request.inputs = job.inputs; job.inputs = undefined;
        assert.equal(failure, null, failure ?? 'NV2_CLIENT_PREFLIGHT_TIMEOUT');
        child = spawn(process.execPath, [join(ROOT, 'proof-workers/native-value-live-v2-role-process.mjs'), spec.name],
          { cwd: ROOT, env: { PATH: '/usr/bin:/bin', LANG: 'C.UTF-8' }, serialization: 'json',
            stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
        state.active = { stop };
        const completion = new Promise(resolve => child.once('close', (code, signal) => {
          closed = true; resolve({ code, signal });
        }));
        child.once('error', () => stop('NV2_CLIENT_SPAWN_FAILED'));
        child.on('message', message => {
          try {
            exactRecord(message, ['type', 'relation', 'role', 'jobId']);
            assert.equal(message.type, 'flat-proof-input-ready', 'NV2_CLIENT_READY_MESSAGE');
            assert.equal(message.relation, spec.name, 'NV2_CLIENT_READY_RELATION');
            assert.equal(message.role, spec.role, 'NV2_CLIENT_READY_SCOPE');
            assert.equal(sent, false, 'NV2_CLIENT_ONE_HANDOFF');
            jobId = assertID(message.jobId); sent = true;
            child.send({ type: 'flat-proof-inputs', relation: spec.name, role: spec.role,
              jobId, inputs: request.inputs, expectedPublicInputs: expected },
            error => { if (error) stop('NV2_CLIENT_IPC_FAILED'); });
            request.inputs = undefined;
          } catch { stop('NV2_CLIENT_INVALID_HANDOFF'); }
        });
        child.stdout.on('data', bytes => {
          outputBytes += bytes.length;
          if (outputBytes > LIMITS.outputBytes) stop('NV2_CLIENT_OUTPUT_BOUND');
          else stdout += bytes.toString('utf8');
        });
        child.stderr.on('data', bytes => {
          outputBytes += bytes.length;
          if (outputBytes > LIMITS.outputBytes) stop('NV2_CLIENT_OUTPUT_BOUND');
        });
        // Includes initial handoff, key validation, proof and child cleanup.
        const exit = await completion;
        assert.equal(failure, null, failure ?? 'NV2_CLIENT_FAILURE');
        assert.equal(exit.code, 0, 'NV2_CLIENT_EXIT'); assert.equal(exit.signal, null, 'NV2_CLIENT_SIGNAL');
        assert.ok(sent && jobId, 'NV2_CLIENT_NO_HANDOFF');
        const status = JSON.parse(stdout.trim());
        assert.equal(status.phase, 'completed', 'NV2_CLIENT_PROOF_FAILED');
        assert.equal(status.relation, spec.name, 'NV2_CLIENT_RESULT_RELATION');
        assert.equal(status.mode, 'prove-dyadic21', 'NV2_CLIENT_FIXED_MODE');
        const runId = assertID(status.runId), directory = join(NATIVE_VALUE_LIVE_V2_LOCAL, 'attempts', runId);
        const result = JSON.parse(regular(join(directory, 'result.json')));
        const resources = JSON.parse(regular(join(directory, 'resources.json')));
        for (const report of [result, resources]) {
          assert.equal(report.runId, runId); assert.equal(report.jobId, jobId);
          assert.equal(report.relation, spec.name); assert.equal(report.phase, 'completed');
          assert.equal(report.mode, 'prove-dyadic21'); assert.equal(report.profile, 'LIANUM_DYNAMIC_NATIVE_VALUE_ADMISSION_V2');
        }
        assert.equal(result.format, 'NV2_SCOPED_PROOF_RESULT_V1');
        assert.equal(resources.format, 'NV2_SCOPED_PROOF_RESOURCES_V1');
        assert.equal(resources.exitCode, 0); assert.equal(resources.signal, null); assert.equal(resources.failure, null);
        const manifest = JSON.parse(regular(join(directory, 'proof-manifest.json')));
        const proof = regular(join(directory, 'proof.bin'));
        const inputBytes = regular(join(directory, 'public-inputs.json'));
        const inputs = nativeValueLivePublicWords(spec, JSON.parse(inputBytes));
        assert.equal(manifest.jobId, jobId); assert.equal(manifest.role, spec.role);
        assert.equal(manifest.relation, spec.name, 'NV2_CLIENT_MANIFEST_RELATION');
        assert.equal(manifest.sourceVersion, NATIVE_VALUE_LIVE_V2_SOURCE_VERSION, 'NV2_CLIENT_SOURCE');
        assert.equal(manifest.keySHA256, NATIVE_VALUE_LIVE_V2_KEY_SHA256, 'NV2_CLIENT_KEY');
        assert.equal(manifest.keyManifestSHA256, NATIVE_VALUE_LIVE_V2_KEY_MANIFEST_SHA256, 'NV2_CLIENT_KEY_MANIFEST');
        assert.equal(manifest.format, 'NV2_SCOPED_PUBLIC_PROOF_V1');
        assert.equal(manifest.profile, 'LIANUM_DYNAMIC_NATIVE_VALUE_ADMISSION_V2');
        assert.equal(manifest.artifactSHA256, artifacts.artifactSHA256);
        assert.equal(manifest.compiledManifestSHA256, artifacts.compiledManifestSHA256);
        assert.equal(manifest.bytecodeSHA256, artifacts.bytecodeSHA256);
        assert.equal(manifest.publicWords, 84); assert.equal(manifest.backendPublicWords, 92);
        assert.equal(manifest.publicInputOffset, 5); assert.equal(manifest.maximumPages, 65536);
        assert.equal(result.maximumPages, 65536); assert.equal(result.threads, 1); assert.equal(result.hostLimitsChanged, false);
        const runtimePinsSHA256 = hash(regular(join(directory, 'runtime-pins.json')));
        for (const report of [manifest, result, resources]) assert.equal(report.runtimePinsSHA256, runtimePinsSHA256);
        assert.equal(proof.length, manifest.proofBytes); assert.ok(proof.length > 0 && proof.length % 32 === 0 && proof.length <= LIMITS.outputBytes);
        assert.equal(result.sourceVersion, manifest.sourceVersion); assert.equal(result.keySHA256, manifest.keySHA256);
        assert.equal(result.proofSHA256, manifest.proofSHA256); assert.equal(result.selfVerified, true);
        assert.equal(result.keyGenerated, false); assert.equal(result.keyRecomputed, false);
        assert.equal(result.witnessPersisted, false); assert.equal(result.proofGenerated, true);
        assert.equal(resources.lockPreserved, false); assert.deepEqual(resources.failures, []);
        assert.equal(resources.hostLimitsChanged, false); assert.equal(result.backendDestroyed, true);
        assert.deepEqual(resources.limits, LIMITS); assert.deepEqual(result.limits, LIMITS);
        assert.equal(manifest.runId, runId); assert.equal(result.role, 'local');
        await loadNativeValueLiveArtifacts();
        assert.equal(hash(proof), manifest.proofSHA256, 'NV2_CLIENT_PROOF_HASH');
        assert.equal(hash(inputBytes), manifest.publicInputsSHA256, 'NV2_CLIENT_PUBLIC_HASH');
        assert.deepEqual(inputs, expected, 'NV2_CLIENT_PUBLIC_BINDING');
        assert.equal(manifest.selfVerified, true, 'NV2_CLIENT_SELF_VERIFIED');
        return frozenInput({ proof: proof.toString('hex'), publicInputs: inputs,
          evidence: { relation: spec.name, role, runId, jobId, proofSHA256: manifest.proofSHA256,
            keySHA256: manifest.keySHA256, manifestSHA256: hash(regular(join(directory, 'proof-manifest.json'))),
            metricUnits: 'milliseconds', metrics: proofMetricsForTransport(result.metrics) } });
      } catch (error) {
        // Keep the exact durable worker attempt/claim. Do not resubmit or guess
        // success after an uncertain child outcome; only public errors leave.
        throw Object.assign(new Error(failure ?? 'NV2_CLIENT_PROOF_INCOMPLETE'), { jobId, cause: error });
      } finally {
        clearTimeout(timer); clearTimeout(killTimer); request.inputs = undefined;
        if (child?.pid && !closed) child.kill('SIGTERM');
        for (const stream of child?.stdio ?? []) stream?.destroy();
        state.active = null; state.busy = false;
      }
    },
    close() { assert.equal(state.busy, false, 'NV2_CLIENT_CLOSE_WHILE_BUSY'); state.closed = true; },
    stop() { state.active?.stop('NV2_CLIENT_OWNER_STOPPED'); },
  });
  owned.set(client, state); return client;
}
