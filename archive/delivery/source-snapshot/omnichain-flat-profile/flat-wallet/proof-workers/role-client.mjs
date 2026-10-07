/** Trusted scoped role launcher. No root signing keys or caller-selected worker
 * paths/backends. One private job enters a fresh role; only its public proof is
 * returned. The enclosing owned runtime supervisor owns aggregate resources. */
import assert from 'node:assert/strict';
import { assertBeginPayoutAuditRoleLaunchV1 } from './native-flow-proof-scope-v1.mjs';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { ROOT, LOCAL, LIMITS } from './catalog.mjs';
import { relationWithNativeIngressV3 as relation, publicWordsWithNativeIngressV3 as publicWords,
  NATIVE_INGRESS_V3_SPEC, NATIVE_INGRESS_V3_LOCAL, NATIVE_INGRESS_V3_SOURCE_VERSION,
  NATIVE_INGRESS_V3_KEY_SHA256 } from './native-ingress-v3-profile.mjs';
import { regular, hash, assertID } from './tooling.mjs';
import { cloneInput, frozenInput } from '../wallet-platform/modules/paeg/readiness-inputs.mjs';
import { exactRecord } from '../wallet-platform/modules/paeg/commitments.mjs';

const MODES = Object.freeze({ owner: ['authorization', 'deposit_intent'], reservation: ['reservation'],
  dependency: ['dependency'], local: ['ready', 'admission', 'node'], assembler: ['settlement'], recovery: ['recovery'],
  claim_ingress: ['native_claim_ingress', 'native_claim_ingress_v3'], claim_discharge: ['native_claim_discharge'] });
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
  const state = { role, closed: false, busy: false, active: null };
  const client = Object.freeze({
    async prove(raw) {
      assertRoleProofClient(client, role); assert.equal(state.busy, false, 'ROLE_CLIENT_BUSY');
      const request = cloneInput(raw);
      exactRecord(request, ['relation', 'inputs', 'expectedPublicInputs']);
      assert.ok(MODES[role].includes(request.relation), 'ROLE_CLIENT_RELATION');
      const spec = relation(request.relation);
      const expected = publicWords(spec, request.expectedPublicInputs);
      assert.ok(Buffer.byteLength(JSON.stringify(request)) <= LIMITS.jobBytes, 'ROLE_CLIENT_INPUT_BOUND');
      state.busy = true;
      let child, timer, killTimer, closed = false, jobId = null, sent = false, failure = null;
      let stdout = '', outputBytes = 0;
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
            exactRecord(message, ['type', 'relation', 'role', 'jobId']);
            assert.equal(message.type, 'flat-proof-input-ready', 'ROLE_CLIENT_READY_MESSAGE');
            assert.equal(message.relation, spec.name, 'ROLE_CLIENT_READY_RELATION');
            assert.equal(message.role, spec.role, 'ROLE_CLIENT_READY_SCOPE');
            assert.equal(sent, false, 'ROLE_CLIENT_ONE_HANDOFF');
            jobId = assertID(message.jobId); sent = true;
            child.send({ type: 'flat-proof-inputs', relation: spec.name, role: spec.role,
              jobId, inputs: request.inputs, expectedPublicInputs: expected },
            error => { if (error) stop('ROLE_CLIENT_IPC_FAILED'); });
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
        assert.equal(resources.exitCode, 0); assert.equal(resources.signal, null); assert.equal(resources.failure, null);
        const manifest = JSON.parse(regular(join(directory, 'proof-manifest.json')));
        const proof = regular(join(directory, 'proof.bin'));
        const inputBytes = regular(join(directory, 'public-inputs.json'));
        const inputs = publicWords(spec, JSON.parse(inputBytes));
        assert.equal(manifest.jobId, jobId); assert.equal(manifest.role, spec.role);
        assert.equal(manifest.relation, spec.name, 'ROLE_CLIENT_MANIFEST_RELATION');
        if (spec === NATIVE_INGRESS_V3_SPEC) {
          assert.equal(manifest.sourceVersion, NATIVE_INGRESS_V3_SOURCE_VERSION, 'ROLE_CLIENT_V3_SOURCE');
          assert.equal(manifest.keySHA256, NATIVE_INGRESS_V3_KEY_SHA256, 'ROLE_CLIENT_V3_KEY');
          assert.equal(result.keyGenerated, false, 'ROLE_CLIENT_V3_NO_KEY_REGEN');
        }
        assert.equal(hash(proof), manifest.proofSHA256, 'ROLE_CLIENT_PROOF_HASH');
        assert.equal(hash(inputBytes), manifest.publicInputsSHA256, 'ROLE_CLIENT_PUBLIC_HASH');
        assert.deepEqual(inputs, expected, 'ROLE_CLIENT_PUBLIC_BINDING');
        assert.equal(manifest.selfVerified, true, 'ROLE_CLIENT_SELF_VERIFIED');
        return frozenInput({ proof: proof.toString('hex'), publicInputs: inputs,
          evidence: { relation: spec.name, role, runId, jobId, proofSHA256: manifest.proofSHA256,
            keySHA256: manifest.keySHA256, manifestSHA256: hash(regular(join(directory, 'proof-manifest.json'))),
            metricUnits: 'milliseconds', metrics: proofMetricsForTransport(result.metrics) } });
      } catch (error) {
        // Keep the exact durable worker attempt/claim. Do not resubmit or guess
        // success after an uncertain child outcome; only public errors leave.
        throw Object.assign(new Error(failure ?? 'ROLE_CLIENT_PROOF_INCOMPLETE'), { jobId, cause: error });
      } finally {
        clearTimeout(timer); clearTimeout(killTimer); request.inputs = undefined;
        if (child?.pid && !closed) child.kill('SIGTERM');
        for (const stream of child?.stdio ?? []) stream?.destroy();
        state.active = null; state.busy = false;
      }
    },
    close() { assert.equal(state.busy, false, 'ROLE_CLIENT_CLOSE_WHILE_BUSY'); state.closed = true; },
    stop() { state.active?.stop('ROLE_CLIENT_OWNER_STOPPED'); },
  });
  owned.set(client, state); return client;
}
