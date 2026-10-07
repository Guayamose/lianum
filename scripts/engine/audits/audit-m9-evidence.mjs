import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { resolve, relative, dirname, isAbsolute, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { requireFundedOrder, requireAuthenticatedCopies, requireExactMenuPackage } from '../../../packages/engine/src/native/native-authority.mjs';
import { parseStrictJSON } from '../../../experiments/engine/pc5-proof-probe/proving/strict-json.mjs';
import { decode, publicInputs } from '../../../experiments/engine/pc5-proof-probe/qb/wire.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const parent = 'ff9b62a18f693a3310926b80dd5aa4b11642555e';
const read = p => readFileSync(resolve(root, p));
const json = p => parseStrictJSON(read(p).toString('utf8'));
const sha = b => createHash('sha256').update(b).digest('hex');
const git = (...args) => execFileSync('git', args, { cwd: root });
const canonicalBytes = p => ['.bin', '.png'].includes(extname(p)) ? read(p) : Buffer.from(read(p).toString('utf8').replaceAll('\r\n', '\n'));
const n = json('evidence/m9-native-client.json'), m = json('evidence/m9-menu-reservation.json'), b = json('evidence/m9-browser-client.json');
for (const r of [n, m, b]) { assert.equal(r.phase, 'completed'); assert.equal(r.ownRuntimesStopped, true); }
assert.equal(n.disposableNativeWalletsRemoved, true);
assert.equal(n.checks.length, 15); assert.equal(n.operations.length, 3);
assert.deepEqual(n.operations.map(o => o.terminalDecision), ['PAID', 'REFUNDED', 'REFUNDED']);
for (const o of n.operations) {
  assert.equal(o.order.amountWei, '1000000000000000'); assert.equal(o.order.sats, '100000');
  assert.equal(o.order.profile, 1); assert.equal(o.order.authority, n.runtime.contract);
  assert.equal(o.authorization.hiddenAuthorizationProved, false);
  assert.match(o.reference.id, /^0x[0-9a-f]{64}$/);
  if (o.bitcoin) {
    assert.match(o.bitcoin.txid, /^[0-9a-f]{64}$/); assert.ok(o.bitcoin.confirmations >= 6);
    assert.equal(o.bitcoin.script, o.order.recipientScript); assert.equal(o.bitcoin.amountSatoshi, o.order.sats);
    assert.equal(o.bitcoin.recipientWalletControlsOutput, true); assert.ok(BigInt(o.bitcoin.feeSatoshi) > 0n);
    assert.ok(BigInt(o.bitcoin.feeSatoshi) <= BigInt(o.order.nativeFeeCapSatoshi));
    assert.match(o.bitcoin.rawTransaction, /^[0-9a-f]+$/);
  }
}
assert.equal(n.operations[0].solverRewardWei, '1000000000000000');
assert.equal(n.operations[1].bitcoin, null);
for (const o of n.operations.slice(1)) { assert.equal(o.ownerRefundWei, o.order.amountWei); assert.equal(o.solverRewardWei, '0'); }
assert.equal(n.finalSnapshot.balances.recipientSatoshi, '200000');
assert.equal(n.finalSnapshot.capabilities.tripleAccepted, false); assert.equal(n.finalSnapshot.capabilities.privateSettlement, false);
assert.deepEqual(n.transactions.filter(t => t.receipt.status === '0x0').map(t => t.revertReason), ['REFUND_EARLY', 'OBSERVER', 'DELIVERY', 'DELIVERY', 'STATE_PROFILE', 'STATE_OWNER', 'EFFECT_CONSUMED']);
for (const r of [n, m]) {
  assert.equal(r.runtime.bitcoinPeers, 0); assert.equal(r.runtime.bitcoinNetworkActive, false);
  assert.equal(r.runtime.contractSourceSHA256, sha(read('contracts/LocalBitcoinDeliveryEscrow.sol')));
  const ids = r.transactions.map(t => t.receipt.transactionHash);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ids) assert.match(id, /^0x[0-9a-f]{64}$/);
}
assert.equal(m.manifest.profile, 2); assert.equal(m.manifest.amountWei, '1');
requireFundedOrder(m.manifest, m.reference, m.observedReservation);
requireAuthenticatedCopies(m.holders.map(h => h.ack), m.reference, m.manifest);
assert.equal(m.holders.length, 4); assert.equal(m.checks.length, 5);
let holderProofChecks = 0;
for (const h of m.holders) {
  assert.equal(h.proofChecks.ownerWitnessLoaded, false); assert.equal(h.proofChecks.logicalFileSeparationOnly, true);
  assert.equal(h.proofChecks.checks.length, 2);
  for (const c of h.proofChecks.checks) { assert.equal(c.proofVerified, true); assert.equal(c.ownOpeningMatched, true); assert.equal(c.actualEffectProved, false); holderProofChecks++; }
}
assert.equal(m.nativeTripleExposureAuthorized, false); assert.equal(m.nativeBitcoinSends, 0); assert.equal(m.nativeSolanaSends, 0);
assert.equal(m.readinessBoundary.provesFutureAvailability, false);
assert.equal(m.readinessBoundary.authorizesNativeTripleExposure, false);
assert.deepEqual(m.transactions.filter(t => t.receipt.status === '0x0').map(t => t.revertReason), ['ID', 'STATE_PROFILE']);
assert.equal(m.transactions.at(-1).receipt.status, '0x1');

const q = json('evidence/m9-pair-equivocation/results.json');
assert.equal(q.phase, 'completed'); assert.equal(q.verified, true); assert.equal(q.sameMenuBinding, true);
assert.equal(q.verificationKeySHA256, sha(read('evidence/m8-qb-proof/verification-key.bin')));
assert.equal(q.circuitSHA256, sha(read('evidence/m8-qb-proof/circuit.json')));
for (const [name, expected] of Object.entries(q.artifacts)) { const bytes = read('evidence/m9-pair-equivocation/' + name); assert.equal(bytes.length, expected.bytes); assert.equal(sha(bytes), expected.sha256); }
const statement = read('evidence/m9-pair-equivocation/statement.bin'), decoded = decode('statement', statement);
assert.equal(decoded.menuBinding.toString('hex'), m.manifest.menuBinding);
assert.deepEqual(json('evidence/m9-pair-equivocation/public-inputs.json'), publicInputs(statement));
const pkg = Object.fromEntries(['scope', 'session', 'menuBinding', 'verificationKeySHA256', 'branches'].map(k => [k, structuredClone(m.manifest[k])]));
requireExactMenuPackage(pkg, m.manifest);
Object.assign(pkg.branches[0], q.validAlternativePair);
assert.throws(() => requireExactMenuPackage(pkg, m.manifest), /FROZEN_EXACT_PAIR_C_S/);
assert.notEqual(q.validAlternativePair.C_S, q.frozenOriginalPair.C_S); assert.notEqual(q.validAlternativePair.C_B, q.frozenOriginalPair.C_B);

assert.equal(b.steps.length, 10); assert.equal(b.reloadPreservedOperation, true); assert.equal(b.solanaPrerequisiteVisible, true);
assert.deepEqual(b.scriptExceptions, []); assert.equal(b.narrowLayoutWidth, 390); assert.equal(b.screenshots.length, 3);
for (const p of b.screenshots) assert.equal(read(p).subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
assert.equal(b.finalSnapshot.operation.terminalDecision, 'REFUNDED'); assert.equal(b.finalSnapshot.operation.solverRewardWei, '0');
const runtimeSourceCorrespondence = [];
for (const r of [n, b]) for (const [p, expected] of Object.entries(r.sourceSHA256)) {
  const bytes = canonicalBytes(p); const exact = sha(bytes) === expected;
  // Browser QA read this one HTML file with Windows CRLF. Archive is canonical LF.
  assert.ok(exact || (p === 'client/index.html' && sha(Buffer.from(bytes.toString().replaceAll('\n', '\r\n'))) === expected), p);
  runtimeSourceCorrespondence.push({ path: p, recordedSHA256: expected, canonicalGitSHA256: sha(bytes), lineEndingOnlyDifference: !exact });
}
const w = json('evidence/m9-wrong-key-witness.json');
assert.equal(w.phase, 'completed'); assert.deepEqual(w.cause, { name: 'Error', message: 'Cannot satisfy constraint' });
assert.equal(w.proofGenerated, false); assert.equal(w.oldEvidenceOverwritten, false);
assert.equal(w.wrongVerificationKeySHA256, sha(read('evidence/m7-proof-probe/wrong-verification-key.bin')));
const s = json('evidence/m9-solana-windows-inventory.json');
assert.equal(s.archiveSHA256, '27d598632589970a0516a631aae6f91dcba2a072bdc2a32f9a7f547eae7d726e');
assert.equal(s.archiveBytes, 110741086); assert.equal(s.nativeWindowsTestValidatorPresent, true);
assert.equal(s.extracted, false); assert.equal(s.executed, false); assert.equal(s.wslRetried, false);
assert.equal(s.selectedExecutableHashes.find(x => x.path.endsWith('/solana-test-validator.exe')).sha256, 'cf6709cef5d1b9d46bb27ab255c68c9e2100a472559b650e34fec74803025be5');
const tap = read('evidence/m9-tests.tap').toString();
for (const pattern of [/^1\.\.269$/m, /^# pass 269$/m, /^# fail 0$/m, /^# cancelled 0$/m, /^# skipped 0$/m]) assert.match(tap, pattern);
assert.equal((tap.match(/^ok \d+ - /gm) || []).length, 269); assert.doesNotMatch(tap, /^not ok /m);

const history = git('ls-tree', '-r', '--name-only', parent, 'evidence').toString().trim().split('\n');
for (const p of history) assert.equal(git('hash-object', '--path', p, p).toString().trim(), git('rev-parse', `${parent}:${p}`).toString().trim(), p);
const oldAudit = parseStrictJSON(git('show', `${parent}:evidence/m8-audit.json`).toString());
for (const [p, expected] of Object.entries({ ...oldAudit.sourceSHA256, ...oldAudit.evidenceSHA256 })) assert.equal(sha(git('show', `${parent}:${p}`)), expected, 'M8 historical ' + p);
const sourceSHA256 = {}, evidenceSHA256 = {};
for (const p of git('ls-files', '--cached', '--others', '--exclude-standard', '-z').toString().split('\0').filter(Boolean)) if (!p.startsWith('evidence/')) sourceSHA256[p] = sha(canonicalBytes(p));
const collect = dir => {
  for (const e of readdirSync(resolve(root, dir), { withFileTypes: true })) {
    assert.equal(e.isSymbolicLink(), false); const p = dir + '/' + e.name;
    if (dir === 'evidence' && (!e.name.startsWith('m9-') || e.name === 'm9-audit.json')) continue;
    if (e.isDirectory()) collect(p); else evidenceSHA256[p] = sha(canonicalBytes(p));
  }
}; collect('evidence');
const report = { classification: 'M9_LOCAL_APPLICATION_EVIDENCE_CONSISTENCY_NOT_SECURITY_AUDIT_OR_TRIPLE_ACCEPTANCE', parentCommit: parent, nativeClientOperations: 3, browserButtonActions: 10, browserScreenshots: 3, rootTestsPassed: 269, actualAdditionalQbProofs: 1, holderProofChecks, fundedPreparationHolders: 4, solanaExecutableInspected: true, solanaExecuted: false, tripleAccepted: false, privateSettlementAccepted: false, originalPrivacyRequirementsChanged: false, historicalEvidenceUnchanged: history, runtimeSourceCorrespondence, sourceSHA256, evidenceSHA256, limits: ['Report checks retained evidence and signatures, not fresh native consensus or independent security.', 'Source/evidence hashes use canonical Git LF for text. Runtime-reported raw HTML CRLF is explicitly checked separately.', 'M8 source hashes are checked at parentCommit; old evidence is not rewritten after M9 source changes.'] };
const output = resolve(root, process.argv[2] || '.local/m9-audit-current.json'), within = relative(root, output);
assert.ok(within && !isAbsolute(within) && !within.split(/[\\/]/).includes('..'));
mkdirSync(dirname(output), { recursive: true }); writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ nativeClientOperations: 3, browserActions: 10, rootTestsPassed: 269, holderProofChecks, historicalEvidencePreserved: history.length, sourceFilesHashed: Object.keys(sourceSHA256).length, evidenceFilesHashed: Object.keys(evidenceSHA256).length, tripleAccepted: false }));
