import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assertPrivateSnapshotCanonical } from '../../src/notes/private-note-runtime.mjs';
import { savePublicNoteProofArtifacts } from '../../../proofs/programs/native-notes/public-artifacts.mjs';

test('authority snapshot binds header identity, not just equal height/sequence', async () => {
  const snapshot = { blockNumber: '0x8', blockHash: '0x' + '12'.repeat(32) };
  const runtime = { evm: async (method, args) => {
    assert.equal(method, 'eth_getBlockByNumber');
    assert.deepEqual(args, ['0x8', false]);
    return { number: '0x8', hash: snapshot.blockHash };
  } };
  await assertPrivateSnapshotCanonical(runtime, snapshot);
  await assert.rejects(() => assertPrivateSnapshotCanonical({ evm: async () => ({ number: '0x8', hash: '0x' + '34'.repeat(32) }) }, snapshot), /PRIVATE_SNAPSHOT_BLOCK_CHANGED/);
  await assert.rejects(() => assertPrivateSnapshotCanonical({ evm: async () => null }, snapshot), /PRIVATE_SNAPSHOT_BLOCK_CHANGED/);
});

test('public proof archival never serializes supplied private witness fields', () => {
  const dir = mkdtempSync(join(tmpdir(), 'owned-note-artifacts-'));
  try {
    const proof = new Uint8Array([1, 2, 3]);
    const publicInputs = ['0x' + '00'.repeat(32)];
    savePublicNoteProofArtifacts(dir, { proof, publicInputs, input: { secret: 'synthetic-witness-must-not-persist' } });
    assert.deepEqual(readdirSync(dir).sort(), ['proof.bin', 'public-inputs.json']);
    assert.deepEqual(readFileSync(join(dir, 'proof.bin')), Buffer.from(proof));
    assert.deepEqual(JSON.parse(readFileSync(join(dir, 'public-inputs.json'))), publicInputs);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
