import assert from 'node:assert/strict';
import { generateKeyPairSync, randomBytes, sign } from 'node:crypto';
import { mkdir, mkdtemp, readFile, writeFile, copyFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { copyFileSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createOwnedNativeRuntime, sha, hex, ZERO } from '../src/chains/native-runtime.mjs';
import { projectRoot } from '../src/chains/runtime-harness.mjs';
import { commitment, requireFundedOrder, requireExactMenuPackage, requireAuthenticatedCopies, ackBytes } from '../src/native-authority.mjs';
import { acknowledgeFrozenCopy } from '../experiments/pc5-proof-probe/qb/frozen-copy-gate.mjs';

const evidence = { classification: 'REAL_FUNDED_NATIVE_OWNER_BINDING_OF_EXACT_QB_PAIRS_NOT_HIDDEN_AUTHORIZATION_OR_PC5_ACTIVATION', phase: 'starting', holders: [], checks: [], nativeTripleExposureAuthorized: false };
const reviewRace = process.argv.includes('--review-race');
const runtime = await createOwnedNativeRuntime();
const local = await mkdtemp(join(projectRoot, '.local/m9-menu-'));
try {
  const f = JSON.parse(await readFile(join(projectRoot, 'evidence/m8-qb-wire-fixtures.json'))), eq = JSON.parse(await readFile(join(projectRoot, 'evidence/m9-pair-equivocation/results.json')));
  assert.equal(eq.phase, 'completed'); assert.equal(eq.verified, true); assert.equal(eq.sameMenuBinding, true);
  const { decode } = await import('../experiments/pc5-proof-probe/qb/wire.mjs');
  const s = decode('statement', Buffer.from(f.branches[0].statementHex, 'hex'));
  const roles = ['E_S', 'P_S', 'E_B', 'P_B'], keys = {}, holders = {};
  for (const role of roles) {
    keys[role] = generateKeyPairSync('ed25519'); holders[role] = keys[role].publicKey.export({ format: 'der', type: 'spki' }).toString('base64');
    await writeFile(join(local, role + '.pem'), keys[role].privateKey.export({ format: 'pem', type: 'pkcs8' }), { mode: 0o600 });
  }
  const time = await runtime.time();
  const manifest = { kind: 'PC5_QB_PREPARATION_ONLY', profile: 2, owner: runtime.accounts[0], solver: runtime.accounts[1], amountWei: '1', scriptHash: ZERO, sats: '0', executeBy: time + 600, claimBy: time + 1200, authority: runtime.address, chainId: '31337', evmGenesis: runtime.metadata.evmGenesis,
    scope: s.scope.toString('hex'), session: s.session.toString('hex'), menuBinding: f.menuBinding, verificationKeySHA256: sha(await readFile(join(projectRoot, 'evidence/m8-qb-proof/verification-key.bin'))), branches: f.branches.map(b => ({ branch: b.branch, ...b.commitments })), holders };
  const salt = '0x' + randomBytes(32).toString('hex'), id = await runtime.call('deriveId(address,bytes32)', [manifest.owner, salt]);
  const reference = { authority: runtime.address, id, owner: manifest.owner, orderHash: commitment(manifest) };
  await runtime.send('intended owner locks one exact complete branch-pair manifest', { from: manifest.owner, to: runtime.address, value: '0x1', data: runtime.data('reserve(bytes32,bytes32,address,bytes32,uint64,uint64,uint64,uint8)', [salt, reference.orderHash, manifest.solver, ZERO, 0, manifest.executeBy, manifest.claimBy, 2]) });
  const observed = { ...await runtime.reservation(id), id, authority: runtime.address };
  evidence.fundedAuthorityCheck = requireFundedOrder(manifest, reference, observed);
  const authorityPath = join(local, 'independent-authority.json'); await writeFile(authorityPath, JSON.stringify({ manifest, reference, observed }));
  const packageManifest = Object.fromEntries(['scope', 'session', 'menuBinding', 'verificationKeySHA256', 'branches'].map(k => [k, manifest[k]]));
  const makePackage = async (role, variant) => {
    const dir = join(local, role + '-' + variant); await mkdir(join(dir, 'checked-files'), { recursive: true });
    const pkg = structuredClone(packageManifest); if (variant === 'equivocation') Object.assign(pkg.branches[0], eq.validAlternativePair);
    await writeFile(join(dir, 'manifest.json'), JSON.stringify(pkg));
    const files = { 'verification-key.bin': await readFile(join(projectRoot, 'evidence/m8-qb-proof/verification-key.bin')) };
    for (const j of [0, 1]) {
      const alternative = variant === 'equivocation' && j === 0;
      files[`branch-${j}-proof.bin`] = await readFile(join(projectRoot, alternative ? 'evidence/m9-pair-equivocation/proof.bin' : `evidence/m8-qb-proof/branch-${j}-proof.bin`));
      files[`branch-${j}-statement.bin`] = alternative ? await readFile(join(projectRoot, 'evidence/m9-pair-equivocation/statement.bin')) : Buffer.from(f.branches[j].statementHex, 'hex');
      files[`branch-${j}-opening.bin`] = alternative ? await readFile(join(projectRoot, `evidence/m9-pair-equivocation/leg-${role.endsWith('_S') ? 's' : 'b'}.bin`)) : Buffer.from(f.branches[j][role.endsWith('_S') ? 'legSHex' : 'legBHex'], 'hex');
    }
    if (role.endsWith('_S')) files['result-salt.bin'] = Buffer.from(f.resultSaltHex, 'hex');
    for (const [name, bytes] of Object.entries(files)) { await writeFile(join(dir, name), bytes); await writeFile(join(dir, 'checked-files', name), bytes); }
    return dir;
  };
  const run = (role, dir) => spawnSync(process.execPath, [join(projectRoot, 'experiments/pc5-proof-probe/qb/ack-frozen-copy.mjs'), role, dir, authorityPath, join(local, role + '.pem')], { encoding: 'utf8', timeout: 55000, maxBuffer: 512 * 1024 });
  const acks = [];
  for (const role of roles) {
    const result = run(role, await makePackage(role, 'frozen'));
    assert.equal(result.error, undefined); assert.equal(result.signal, null); assert.equal(result.status, 0, result.stderr);
    const accepted = JSON.parse(result.stdout); evidence.holders.push(accepted); acks.push(accepted.ack);
  }
  evidence.readinessBoundary = requireAuthenticatedCopies(acks, reference, manifest);
  const equivocation = run('E_B', await makePackage('E_B', 'equivocation'));
  assert.equal(equivocation.error, undefined); assert.equal(equivocation.status, 1); assert.match(equivocation.stderr, /FROZEN_EXACT_PAIR_C_S/); assert.equal(equivocation.stdout, '');
  evidence.checks.push('valid same-menu rerandomized pair rejected against native frozen pairs before acknowledgment/exposure');
  const replacement = structuredClone(manifest); Object.assign(replacement.branches[0], eq.validAlternativePair);
  assert.throws(() => requireFundedOrder(replacement, reference, observed), /ORDER_REPLACEMENT/);
  evidence.checks.push('coherent alternate manifest cannot replace intended owner reservation');
  const conflictingAck = { role: 'E_B', reservationId: id, frozenHash: commitment(replacement) }; conflictingAck.signature = sign(null, ackBytes(conflictingAck), keys.E_B.privateKey).toString('hex');
  assert.throws(() => requireAuthenticatedCopies(acks.map(a => a.role === 'E_B' ? conflictingAck : a), reference, manifest), /HOLDER_EQUIVOCATION/);
  evidence.checks.push('even genuinely signed conflicting holder acknowledgment blocks unanimous copy gate');
  const badSignature = structuredClone(acks); badSignature[0].signature = '00'.repeat(64);
  assert.throws(() => requireAuthenticatedCopies(badSignature, reference, manifest), /HOLDER_ACK_SIGNATURE/);
  evidence.checks.push('forged holder acknowledgment rejected');
  if (reviewRace) {
    evidence.replacementRaces = [];
    const alternate = join(local, 'E_B-equivocation');
    for (const phase of ['afterCapture', 'afterVerification']) {
      const dir = await makePackage('E_B', 'race-' + phase), before = new Set(readdirSync(local));
      let replaced = false;
      const accepted = acknowledgeFrozenCopy('E_B', dir, authorityPath, join(local, 'E_B.pem'), { [phase]: () => {
        for (const name of readdirSync(alternate).filter(n => n.endsWith('.bin') || n === 'manifest.json')) {
          copyFileSync(join(alternate, name), join(dir, name));
          if (name.endsWith('.bin')) copyFileSync(join(alternate, name), join(dir, 'checked-files', name));
        }
        replaced = true;
      } });
      assert.equal(replaced, true); assert.equal(accepted.ack.frozenHash, reference.orderHash);
      const retainedDir = readdirSync(local).filter(n => !before.has(n) && n.startsWith('retained-E_B-'));
      assert.equal(retainedDir.length, 1);
      const retainedBytes = readFileSync(join(local, retainedDir[0], accepted.capturedPackageSHA256 + '.json'));
      assert.equal(sha(retainedBytes), accepted.capturedPackageSHA256);
      const retained = JSON.parse(retainedBytes), replacedPackage = JSON.parse(readFileSync(join(dir, 'manifest.json')));
      assert.equal(retained.manifest.branches[0].C_S, manifest.branches[0].C_S);
      assert.equal(replacedPackage.branches[0].C_S, eq.validAlternativePair.C_S);
      assert.notEqual(retained.manifest.branches[0].C_S, replacedPackage.branches[0].C_S);
      evidence.replacementRaces.push({ phase, incomingReplacedWithAnotherValidProof: true, retainedOriginalFrozenBytes: true, accepted });
    }
    evidence.checks.push('replacement after capture and after proof verification cannot change acknowledged retained bytes');
  }
  await runtime.send('same owner cannot overwrite already funded reservation terms', { from: manifest.owner, to: runtime.address, value: '0x1', data: runtime.data('reserve(bytes32,bytes32,address,bytes32,uint64,uint64,uint64,uint8)', [salt, commitment(replacement), manifest.solver, ZERO, 0, manifest.executeBy, manifest.claimBy, 2]) }, '0x0', 'ID');
  await runtime.send('preparation-only reservation cannot settle as Bitcoin delivery', { from: runtime.accounts[2], to: runtime.address, data: runtime.data('claim(bytes32,bytes32,uint32,bytes32,uint64,uint32,uint64)', [id, '0x' + '11'.repeat(32), 0, ZERO, 0, 6, await runtime.time()]) }, '0x0', 'STATE_PROFILE');
  await runtime.evm('evm_setNextBlockTimestamp', [manifest.claimBy + 1]); await runtime.evm('evm_mine');
  await runtime.send('owner recovers preparation-only local test reservation', { from: manifest.owner, to: runtime.address, data: runtime.data('refund(bytes32)', [id]) });
  assert.equal((await runtime.reservation(id)).state, 'REFUNDED');
  evidence.checks.push('native authority forbids overwrite and private-profile payment, then permits expiry refund');
  evidence.manifest = manifest; evidence.reference = reference; evidence.observedReservation = observed; evidence.transactions = runtime.receipts; evidence.runtime = runtime.metadata;
  evidence.nativeBitcoinSends = 0; evidence.nativeSolanaSends = 0; evidence.phase = 'completed';
} catch (error) { evidence.phase = 'failed'; evidence.failure = error.message; process.exitCode = 1; console.error(error.message); }
finally { await runtime.close(); evidence.ownRuntimesStopped = true; await writeFile(join(projectRoot, reviewRace ? 'evidence/m10-menu-reservation.json' : 'evidence/m9-menu-reservation.json'), JSON.stringify(evidence, null, 2) + '\n'); }
console.log(JSON.stringify({ phase: evidence.phase, holderCount: evidence.holders.length, checks: evidence.checks.length, nativeTripleExposureAuthorized: false }));
