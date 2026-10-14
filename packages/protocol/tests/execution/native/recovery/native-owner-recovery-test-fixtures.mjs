/** Focused HOST tests only. Proof envelopes below are synthetic non-proofs.
 * No native runtime, proof generation, pinned-key verification or chain access.
 */
import assert from 'node:assert/strict';
import { createHash, verify } from 'node:crypto';
import { mkdtemp, readFile, writeFile, rm, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Vault } from '../../../../../engine/src/crypto/vault.mjs';
import { freshKey, wordsBE } from '../../../../../engine/src/notes/private-note-encoding.mjs';
import { PrivateNoteTree } from '../../../../../engine/src/notes/private-note-tree.mjs';
import { walletNoteCommitment, balanceWithdrawFrame } from '../../../../../engine/src/wallet/notes/private-wallet-note-encoding.mjs';
import { compileFundedGraph, fundedAuthorizationWords } from '../../../../../engine/src/execution/graph/funded-graph.mjs';
import { a0Context } from '../../../../../engine/src/execution/native/dispatch/native-capsules.mjs';
import { encodePrivateProof } from '../../../../../proofs/src/execution/proof-worker.mjs';
import { openGenericOwnerRecoveryCustody, OWNER_RECOVERY_SCHEMA } from '../../../../../backend/src/execution/native/recovery/native-owner-recovery-custody.mjs';

const hash = text => createHash('sha256').update('synthetic recovery fixture:' + text).digest('hex');
const zero = '0'.repeat(64);
const words = value => wordsBE(Buffer.from(value, 'hex')).map(String);
const note = (key, value, label) => ({ type: 4, rho: hash(label + ' rho'), x: key.x.toString('hex'),
  y: key.y.toString('hex'), value, secret: hash(label + ' secret') });
const emptyNote = () => ({ type: 4, rho: zero, x: zero, y: zero, value: '0', secret: zero });
const stored = (key, opening) => ({ opening, privateKeyPem: key?.privateKey.export({ type: 'pkcs8', format: 'pem' }) ?? null });
export function fixture({ prepared = false, emptyChange = false } = {}) {
  const keys = { source: freshKey(), change: freshKey(), recovery: freshKey(), payout: freshKey() };
  const config = { scope: hash('scope'), policy: hash('policy'), asset: hash('asset'), operationId: hash('operation'),
    hubDomain: hash('hub'), registryCommitment: hash('registry'), epoch: '2985000',
    fundingNotBefore: '1791000000', fundingValidUntil: '1791000300', settleBefore: '1791000900' };
  const input = { ...Object.fromEntries(['scope', 'policy', 'asset', 'operationId', 'fundingNotBefore', 'fundingValidUntil', 'settleBefore'].map(k => [k, config[k]])),
    budget: '25', reservationNonce: hash('reservation nonce'), graphNonce: hash('graph nonce'), reserveSecret: hash('reserve secret'),
    inputNote: note(keys.source, emptyChange ? '25' : '32', 'source'), changeNote: emptyChange ? emptyNote() : note(keys.change, '7', 'change'),
    recoveryNote: note(keys.recovery, '25', 'recovery'), nodes: [{ id: 'one', chainDomain: hash('chain'), evidencePolicy: hash('policy one'),
      actionCommitment: hash('action'), dependsOn: [], payout: { x: keys.payout.x.toString('hex'), y: keys.payout.y.toString('hex'),
        value: '25', secret: hash('payout secret'), randomness: hash('payout randomness') } }],
    paddingSalts: Array.from({ length: 4 }, (_, i) => hash('padding ' + i)) };
  const compiled = compileFundedGraph(input), s = compiled.authorizationStatement;
  const binding = { ...config, fundingCommitment: s.inputCommitment, admissionTag: compiled.admissionTag,
    reserveCommitment: s.reserveCommitment, reserveNullifier: s.reserveNullifier,
    changeCommitment: s.changeCommitment, recoveryCommitment: s.recoveryCommitment };
  const c = [...['scope', 'policy', 'asset', 'hubDomain', 'registryCommitment'].flatMap(k => words(binding[k])),
    ...words(a0Context(s)), ...words(s.reserveCommitment), ...words(s.reserveNullifier),
    ...Array.from({ length: 8 }, (_, i) => words(hash('capsule ' + i))).flat(), s.settleBefore];
  const mockEnvelope = (mode, publicInputs) => encodePrivateProof(mode, { proof: Buffer.from('SYNTHETIC_HOST_TEST_NOT_A_PROOF'), publicInputs,
    proofFields: Array(458).fill('0'), vkFields: Array(115).fill('0') });
  const record = { schema: OWNER_RECOVERY_SCHEMA, state: prepared ? 'prepared' : 'authorized', binding,
    reserveSecret: input.reserveSecret, source: stored(keys.source, input.inputNote),
    change: stored(emptyChange ? null : keys.change, input.changeNote), recovery: stored(keys.recovery, input.recoveryNote),
    privateProofs: prepared ? null : { authorization: mockEnvelope('authorization', fundedAuthorizationWords(s)),
      capsuleAuthorization: mockEnvelope('capsule', c) } };
  return { keys, record, input, statement: s };
}
export async function setup(t, options = {}) {
  const data = fixture(options), directory = await mkdtemp(join(tmpdir(), 'owner-recovery-draft-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const cfg = { recoveryVault: { path: join(directory, 'original.vault'), password: 'synthetic original password' },
    exitVault: { path: join(directory, 'exits.vault'), password: 'synthetic exits password', mode: 'create' },
    expectedBinding: structuredClone(data.record.binding), destinations: { source: '12'.repeat(20),
      change: options.emptyChange ? null : '34'.repeat(20), recovery: '56'.repeat(20) } };
  await new Vault(cfg.recoveryVault.path).create(data.record, cfg.recoveryVault.password);
  const { binding } = data.record;
  let commitments = [binding.fundingCommitment, ...(options.emptyChange ? [] : [binding.changeCommitment]), binding.recoveryCommitment];
  let current = observation(data.record, commitments), reads = 0, canonicalChecks = 0;
  const observer = {
    async observe() { reads++; return structuredClone(current); },
    async assertCanonical(view) { canonicalChecks++; return view.blockHash === current.blockHash; },
  };
  return { ...data, cfg, directory, observer, view: () => structuredClone(current),
    setView: value => { current = value; }, reads: () => reads, canonicalChecks: () => canonicalChecks,
    open: mode => openGenericOwnerRecoveryCustody({ ...cfg, exitVault: { ...cfg.exitVault, mode: mode ?? 'create' } }, observer) };
}
export function observation(record, commitments, changes = {}) {
  const tree = new PrivateNoteTree(commitments);
  return { ...Object.fromEntries(['scope', 'policy', 'asset', 'hubDomain', 'registryCommitment'].map(k => [k, record.binding[k]])),
    blockNumber: '100', blockHash: '0x' + hash('block 100'), timestamp: '1791000600', poolStateSequence: '3',
    root: tree.root, commitments: commitments.map(c => c.startsWith('0x') ? c : '0x' + c), nullifiers: [], ...changes };
}
function request(custody, state, name = 'source') {
  const { eligibility, authorization, ...terms } = custody.withdrawalStatus(name);
  const tree = new PrivateNoteTree(state.commitments), index = state.commitments.indexOf('0x' + terms.noteCommitment);
  return { ...terms, epoch: (BigInt(state.timestamp) / 600n).toString(), path: tree.path(index) };
}
