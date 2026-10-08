/** Host metadata regression: execute the actual solver payload and original
 * controller validation prefix. No keeper, signing authority, RPC, native
 * node or financial state is created; execution stops before clearUnknown. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Script } from 'node:vm';
import { CLAIM_CONFIG_SCHEMA, claimDomainCommitment, claimUint }
  from '../../../../packages/backend/src/claims/protocol/framing.mjs';
import { claimHash } from '../../../../packages/backend/src/claims/authorization/permits.mjs';
import { bytes32, exactRecord }
  from '../../../../packages/backend/src/execution/encoding/commitments.mjs';

const helper = readFileSync(new URL('./development-btc-sol-graph-case.mjs', import.meta.url), 'utf8');
const controller = readFileSync(new URL('../../../../packages/backend/src/claims/controller/controller.mjs', import.meta.url), 'utf8');
const beginPayload = helper.indexOf('  const request = {');
const endPayload = helper.indexOf('  const ticket = await controller.requestRedemption(request);', beginPayload);
assert.ok(beginPayload > 0 && endPayload > beginPayload, 'ORIGINAL_SOLVER_PAYLOAD_DELIMITERS');
const payload = helper.slice(beginPayload, endPayload);
assert.equal(payload.includes('requestId:'), false, 'SOLVER_USES_ORIGINAL_CONTROLLER_REQUEST_ID');
const controllerStart = controller.indexOf('    requestRedemption: request => serial(async () => {');
const prefixStart = controller.indexOf('\n', controllerStart) + 1;
const prefixEnd = controller.indexOf('      await clearUnknown();', prefixStart);
assert.ok(controllerStart > 0 && prefixEnd > prefixStart, 'ORIGINAL_CONTROLLER_PREFIX_DELIMITERS');
const prefix = controller.slice(prefixStart, prefixEnd);
assert.equal(prefix.includes('await '), false, 'HOST_STOPS_BEFORE_CONTROLLER_STATE_ACCESS');
assert.ok(prefix.includes('bytes32(requestId, true);'), 'ORIGINAL_BYTES32_VALIDATION_RETAINED');

// Public synthetic codec inputs only, using all fields of the original config.
const config = Object.fromEntries(CLAIM_CONFIG_SCHEMA.map(([name, type]) => [name,
  type === 'address' ? claimHash(Buffer.from(name)).slice(0, 40)
    : type === 'u256' ? '31337' : type === 'u64' ? '1000' : type === 'u8' ? '1'
      : type === 'field32' ? '01' + claimHash(Buffer.from(name)).slice(2) : claimHash(Buffer.from(name))]));
config.ledgerNamespace = config.hubDomain;
const runtime = { accounts: ['0x' + '11'.repeat(20), '0x' + '22'.repeat(20)] };
const fixture = { claims: { configs: [config] } };

function capturePayload(expression = payload) {
  // The host realm keeps original exactRecord prototype checks active.
  const construct = new Script('(dependencies) => { const { fixture, runtime, claimDomainCommitment } = dependencies;'
    + expression + '\nreturn request; }').runInThisContext();
  return construct({ fixture, runtime, claimDomainCommitment });
}
const validateBeforeState = new Script('(dependencies) => { const { assert, exactRecord, bytes32, claimUint, claimHash, runtime, selected, Buffer } = dependencies;'
  + 'return request => {' + prefix + '\nreturn { requestId, immutableRequest, stoppedBeforeState: true }; }; }').runInThisContext()({
  assert, exactRecord, bytes32, claimUint, claimHash, runtime, Buffer,
  selected(domain) { assert.equal(domain, claimDomainCommitment(config)); return { config }; },
});

test('historical 37-character solver request is rejected by the actual original bytes32 prefix', () => {
  const historical = payload.replace('const request = {',
    "const request = { requestId: 'development_btc_sol_solver_redemption',");
  const request = capturePayload(historical);
  assert.equal(request.requestId.length, 37);
  assert.throws(() => validateBeforeState(request), error => error.code === 'ERR_ASSERTION'
    && error.actual === 37 && error.expected === 64 && error.message.includes('COMMITMENT_HEX_LENGTH'));
});

test('actual solver payload uses the stable original immutable-request hash before state or RPC', () => {
  const request = capturePayload();
  assert.deepEqual(request, { claimDomain: claimDomainCommitment(config), caller: runtime.accounts[1], amount: '20000', maxFee: '1000' });
  const first = validateBeforeState(request), replay = validateBeforeState(capturePayload());
  assert.equal(first.stoppedBeforeState, true);
  assert.equal(first.requestId.length, 64);
  assert.equal(bytes32(first.requestId, true), first.requestId);
  assert.equal(first.requestId, claimHash(Buffer.from(JSON.stringify(first.immutableRequest))));
  assert.equal(replay.requestId, first.requestId);
  for (const mutation of [{ caller: runtime.accounts[0] }, { amount: '20001' }, { maxFee: '1001' }]) {
    assert.notEqual(validateBeforeState({ ...request, ...mutation }).requestId, first.requestId);
  }
});
