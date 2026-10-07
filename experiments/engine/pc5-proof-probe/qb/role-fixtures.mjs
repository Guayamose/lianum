import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync, cpSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { H, decode, schemas } from './wire.mjs';
const root = fileURLToPath(new URL('.', import.meta.url));
const local = resolve(root, '../.local/qb'), owner = resolve(local, 'owner'), proofDir = resolve(root, '../../../evidence/m8-qb-proof');
const proofReport = JSON.parse(readFileSync(resolve(proofDir, 'results.json'))); assert.equal(proofReport.phase, 'completed');
for (const [name, r] of Object.entries(proofReport.artifacts)) assert.equal(H(readFileSync(resolve(proofDir, name))).toString('hex'), r.sha256);
const vk = readFileSync(resolve(proofDir, 'verification-key.bin')), statement = decode('statement', readFileSync(resolve(proofDir, 'branch-0-statement.bin')));
const policyPath = resolve(local, 'public-policy.json');
writeFileSync(policyPath, JSON.stringify({ verificationKeySHA256: H(vk).toString('hex'), scope: statement.scope.toString('hex'), session: statement.session.toString('hex') }));
const reports = [], packages = [];
for (const role of ['E_S', 'P_S', 'E_B', 'P_B']) {
  const dir = resolve(local, 'roles', role); mkdirSync(dir, { recursive: true });
  writeFileSync(resolve(dir, 'verification-key.bin'), vk);
  for (const j of [0, 1]) {
    for (const name of [`branch-${j}-proof.bin`, `branch-${j}-statement.bin`]) writeFileSync(resolve(dir, name), readFileSync(resolve(proofDir, name)));
    writeFileSync(resolve(dir, `branch-${j}-opening.bin`), readFileSync(resolve(owner, `${role.endsWith('_S') ? 'legS' : 'legB'}-${j}.bin`)));
  }
  if (role.endsWith('_S')) writeFileSync(resolve(dir, 'result-salt.bin'), readFileSync(resolve(owner, 'result-salt.bin')));
  const result = spawnSync(process.execPath, [resolve(root, 'role-check.mjs'), role, dir, policyPath], { cwd: dir, encoding: 'utf8', timeout: 45000, maxBuffer: 256 * 1024 });
  assert.equal(result.status, 0, result.stderr); const report = JSON.parse(result.stdout); assert.equal(report.checks.length, 2); reports.push(report); packages.push({ role, dir });
  console.log(JSON.stringify({ role, selectedBranchProofsChecked: report.checks.length, ownerWitnessLoaded: report.ownerWitnessLoaded }));
}
assert.equal(new Set(reports.map(r => r.processId)).size, 4, 'Separate processes');
const negatives = [];
for (const kind of ['tampered-own-opening', 'empty-branch-proof']) {
  const target = resolve(local, 'role-negative', kind); mkdirSync(target, { recursive: true });
  cpSync(packages.find(p => p.role === 'E_B').dir, target, { recursive: true });
  if (kind === 'tampered-own-opening') {
    const path = resolve(target, 'branch-0-opening.bin'), bytes = readFileSync(path); bytes[schemas.legB.offsets.recipientProgram] ^= 1; writeFileSync(path, bytes);
  } else {
    // Empty a named proof rather than treating absence as optional.
    writeFileSync(resolve(target, 'branch-1-proof.bin'), Buffer.alloc(0));
  }
  const result = spawnSync(process.execPath, [resolve(root, 'role-check.mjs'), 'E_B', target, policyPath], { cwd: target, encoding: 'utf8', timeout: 45000, maxBuffer: 256 * 1024 });
  assert.equal(result.error, undefined); assert.equal(result.signal, null); assert.equal(result.status, 1); assert.equal(result.stdout, '');
  if (kind === 'tampered-own-opening') assert.match(result.stderr, /Own opening commitment/);
  else assert.match(result.stderr, /^Expected pinned QB proof byte length\r?\n/);
  negatives.push({ name: kind, rejected: true, message: result.stderr.trim(), stage: kind === 'tampered-own-opening' ? 'own-opening commitment check after valid proof' : 'exact proof byte length preflight rejection; not a soundness result' });
}
const result = { classification: 'ROLE_SEPARATED_LOCAL_FIXTURES_WITH_ACTUAL_QB_VERIFICATION_NOT_PC5_CLAIMABILITY', roles: reports, negatives, completePc5Capsule: false, ownerOfflineClaimProved: false, note: 'Fixture processes consume only listed application files plus public policy, installed verifier and public CRS. No OS isolation or confidential distribution is claimed.' };
writeFileSync(resolve(root, '../../../evidence/m8-qb-role-checks.json'), JSON.stringify(result, null, 2) + '\n');
