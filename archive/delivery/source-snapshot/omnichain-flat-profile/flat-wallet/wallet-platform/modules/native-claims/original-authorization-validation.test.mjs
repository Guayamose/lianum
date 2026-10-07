/** Pure boundary checks of the actual private require-existing guard.
 * This cannot construct an operator/quorum, signature or validation capability.
 * Original actor/quorum tests separately exercise provenance and full audits. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { claimUint } from './framing.mjs';
import { claimHash } from './permits.mjs';

const source = readFileSync(new URL('./operators.mjs', import.meta.url), 'utf8');
const start = source.indexOf('  function assertOriginalAuthorization('), end = source.indexOf('\n  async function signed(', start);
assert.ok(start > 0 && end > start);
const guard = vm.runInThisContext('(function({ assert, equal, claimUint, claimHash, signerIndex, activeView, record }) { return ('
  + source.slice(start, end) + '); })');
function fixture() {
  const head = { number: '9', hash: 'aa'.repeat(32), timestamp: '1000' };
  const frame = Buffer.from('the exact retained frame'), message = { validFrom: '1000', validUntil: '1030' };
  const row = { kind: 'health', message, digest: claimHash(frame), signature: 'bb'.repeat(64), abiSignature: { signerIndex: '1', v: '27' } };
  const record = { data: { authorizations: [structuredClone(row)] } }, original = { ...structuredClone(row), signerIndex: 1, head };
  const check = guard({ assert, equal: assert.deepEqual, claimUint, claimHash, signerIndex: 1, activeView: { head }, record });
  return { head, frame, message, record, original, check,
    run: () => check('health', message, frame, original, frame.toString('hex')) };
}
test('original authorization validation: canonical bounds cover current head and exclusive next-block inclusion', () => {
  const f = fixture(); assert.equal(f.run(), f.record.data.authorizations[0]);
  for (const [from, until] of [['1001', '1030'], ['990', '1000'], ['990', '1001'], ['1000', '1031']]) {
    const f = fixture(); f.message.validFrom = from; f.message.validUntil = until;
    f.original.message = structuredClone(f.message); f.record.data.authorizations[0].message = structuredClone(f.message);
    assert.throws(f.run, /CLAIM_ORIGINAL_AUTHORIZATION_EXPIRED/);
  }
  const remaining = fixture(); remaining.message.validUntil = '1002';
  remaining.original.message = structuredClone(remaining.message); remaining.record.data.authorizations[0].message = structuredClone(remaining.message);
  assert.equal(remaining.run(), remaining.record.data.authorizations[0]);
});
test('original authorization validation: exact frame, digest, signer, kind, head and completed record are all mandatory', () => {
  for (const mutate of [f => { f.original.kind = 'backing'; }, f => { f.original.signerIndex = 2; },
    f => { f.original.head = { ...f.head, hash: 'cc'.repeat(32) }; }, f => { f.original.message.validUntil = '1029'; },
    f => { f.original.digest = 'dd'.repeat(32); }, f => { f.record.data.authorizations = []; },
    f => { f.record.data.authorizations.push(structuredClone(f.record.data.authorizations[0])); },
    f => { f.record.data.authorizations[0].signature = null; }, f => { f.record.data.authorizations[0].signature = 'changed'; },
    f => { f.record.data.authorizations[0].abiSignature.v = '28'; }]) {
    const f = fixture(); mutate(f); assert.throws(f.run);
  }
  const f = fixture();
  assert.throws(() => f.check('health', f.message, f.frame, f.original, '00'), /CLAIM_ORIGINAL_AUTHORIZATION_FRAME/);
});
