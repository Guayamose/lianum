import assert from 'node:assert/strict';
import { Noir } from '@noir-lang/noir_js';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fixtures } from './fixtures.mjs';
import { schemas, H, witness } from './wire.mjs';
const root = fileURLToPath(new URL('.', import.meta.url));
const program = JSON.parse(readFileSync(resolve(root, '../.local/qb/circuit.json')));
globalThis.fetch = async () => { throw new Error('Witness checks are offline'); };
const noir = new Noir(program), f = fixtures();
const report = { classification: 'APPLICATION_SUBRELATION_WITNESS_CHECKS_NOT_PROOF_VERIFICATION', positive: [], negative: [] };
for (const b of f.branches) {
  const input = witness(f.menu, b.legS, b.legB, f.resultSalt, b.statement);
  await noir.execute(input); report.positive.push({ branch: b.branch, accepted: true });
}
const base = witness(f.menu, f.branches[0].legS, f.branches[0].legB, f.resultSalt, f.branches[0].statement);
const mo = schemas.menu.offsets, so = schemas.legS.offsets, bo = schemas.legB.offsets;
const flip = (bytes, offset) => { bytes[offset] ^= 1; };
const put64 = (bytes, offset, n) => { const b = Buffer.alloc(8); b.writeBigUInt64BE(n); bytes.splice(offset, 8, ...b); };
const refresh = input => {
  input.menu_binding = [...H(Buffer.from(input.menu_bytes))];
  input.c_s = [...H(Buffer.from(input.leg_s))];
  input.c_b = [...H(Buffer.from(input.leg_b))];
};
const repairParent = input => { input.leg_b.splice(bo.parentConstraint, 32, ...H(Buffer.from(input.leg_s))); };
for (const [name, mutate] of [
  ['changedScopeInsideMenu', x => flip(x.menu_bytes, mo.scope)],
  ['changedSessionInsideMenu', x => flip(x.menu_bytes, mo.session)],
  ['wrongBranchSelector', x => { x.branch = 2; }],
  ['wrongMenuVersion', x => { x.menu_bytes[mo.version + 1] = 2; }],
  ['wrongMenuTag', x => flip(x.menu_bytes, 2)],
  ['wrongMenuFieldLength', x => flip(x.menu_bytes, mo.quote - 1)],
  ['wrongLegRole', x => { x.leg_s[so.role] = 2; repairParent(x); }],
  ['wrongBBranch', x => { x.leg_b[bo.branch] = 1; }],
  ['wrongExactParent', x => flip(x.leg_b, bo.parentConstraint)],
  ['wrongParentRule', x => { x.leg_b[bo.parentRule] = 0; }],
  ['redirectBRecipient', x => flip(x.leg_b, bo.recipientProgram)],
  ['wrongSAttempt', x => { flip(x.leg_s, so.attempt); repairParent(x); }],
  ['wrongBPolicy', x => flip(x.leg_b, bo.policy)],
  ['wrongBChainDomain', x => flip(x.leg_b, bo.chainDomain)],
  ['raisedNativeFeeCap', x => put64(x.leg_b, bo.nativeFeeCap, 301n)],
  ['wrongClaimDeadline', x => put64(x.leg_b, bo.claimBy, 1900000901n)],
  ['wrongKWithUpdatedCommitment', x => put64(x.leg_b, bo.amount, 168751n)],
  ['inflatedPayoutWithUpdatedCommitments', x => { put64(x.leg_s, so.payoutValue, 310001n); repairParent(x); }],
  ['changedQuoteWithUpdatedCommitment', x => put64(x.menu_bytes, mo.quote + 8, 10001n)],
  ['duplicateMenuOutcome', x => put64(x.menu_bytes, mo.outcomes + 8, 3000000n)],
  ['negativeResidual', x => put64(x.menu_bytes, mo.quote, 24000n)],
  ['zeroDenominator', x => put64(x.menu_bytes, mo.quote + 32, 0n)],
  ['costOverU64', x => { put64(x.menu_bytes, mo.outcomes, 0xfffffffffffffffen); put64(x.menu_bytes, mo.outcomes + 8, 0xffffffffffffffffn); put64(x.menu_bytes, mo.quote + 24, 0xffffffffffffffffn); put64(x.menu_bytes, mo.quote + 32, 1n); }],
  ['kOverU64', x => { put64(x.menu_bytes, mo.quote, 0xffffffffffffffffn); put64(x.menu_bytes, mo.quote + 48, 0xffffffffffffffffn); put64(x.menu_bytes, mo.quote + 40, 1n); }],
  ['reversedDeadlines', x => { put64(x.menu_bytes, mo.timing, 1900000900n); put64(x.menu_bytes, mo.timing + 8, 1900000100n); }],
  ['wrongResultSalt', x => flip(x.result_salt, 0)],
]) {
  const input = structuredClone(base); mutate(input); refresh(input);
  let error;
  try { await noir.execute(input); } catch (caught) { error = caught; }
  assert.ok(error, 'Invalid relation accepted: ' + name);
  assert.match(error.message, /Cannot satisfy constraint|division by zero/i, 'Unexpected backend/resource failure cannot pass a negative check');
  report.negative.push({ name, rejected: true, publicCommitmentsRecomputed: true, stage: 'witness-constraint', message: error.message });
}
writeFileSync(resolve(root, '../../../evidence/m8-qb-witness-checks.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ positives: report.positive.length, negatives: report.negative.length, proofVerification: false }));
