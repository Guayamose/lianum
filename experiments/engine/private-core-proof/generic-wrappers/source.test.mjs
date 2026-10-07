// Pure source/encoding integrity checks. No compiler, key generator or prover.
// The synthetic field arrays below are deliberately NOT cryptographic proofs.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { A0, FIELD_MODULUS, digestHex, membershipRoot, ownerStatement, publicWords, refundInputs, reserveInputs } from './abi.mjs';
import { ADMISSION_DOMAIN, PROFILE, generatedSources } from './generate.mjs';
import { OWNER_PUBLIC_ABI, assertOwnerArtifact, sourceManifest, sourceTreeHash, validateKeyFields, validateOwnerPin } from './pin-owner-key.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest();
const synthetic = () => ({
  vkFields: Array.from({ length: 115 }, (_, i) => String(i + 1)),
  proofFields: Array.from({ length: 458 }, (_, i) => String(i + 1)),
  publicInputs: [...Array.from({ length: 136 }, (_, i) => String(i + 1)), '100', '200', '300'],
});
const siblings = Array.from({ length: 6 }, (_, i) => (i + 10).toString(16).repeat(64));
const leaf = (owner, offset) => digestHex(owner.publicInputs.slice(offset, offset + 8));
function inputFor(mode, owner, index = 37) {
  const root = membershipRoot(leaf(owner, mode === 'reserve' ? A0.inputCommitment : A0.reserveCommitment), siblings, index);
  return mode === 'reserve'
    ? reserveInputs(owner, { baseRoot: root, siblings, leafIndex: index, validFrom: '100', validUntil: '200' })
    : refundInputs(owner, { acceptedRoot: root, siblings, leafIndex: index, validFrom: '300', validUntil: '301' });
}

test('source generation preserves the official verifier byte-for-byte and fixed H4 framing', () => {
  for (const [path, text] of generatedSources()) assert.equal(readFileSync(new URL(path, import.meta.url), 'utf8'), text);
});

test('S66 and F51 public serialization hides the whole intermediate A0 statement and paths', () => {
  const owner = synthetic(), s = inputFor('reserve', owner), f = inputFor('refund', owner);
  assert.equal(publicWords('reserve', s).length, 66);
  assert.equal(publicWords('refund', f).length, 51);
  assert.deepEqual(publicWords('reserve', s).slice(32, 40), owner.publicInputs.slice(40, 48));
  assert.deepEqual(publicWords('reserve', s).slice(40, 48), owner.publicInputs.slice(72, 80));
  assert.deepEqual(publicWords('reserve', s).slice(48, 56), owner.publicInputs.slice(88, 96));
  assert.deepEqual(publicWords('refund', f).slice(32, 40), owner.publicInputs.slice(80, 88));
  assert.deepEqual(publicWords('refund', f).slice(40, 48), owner.publicInputs.slice(128, 136));
  assert.deepEqual(publicWords('refund', f).slice(48), ['300', '300', '301']);
  assert.deepEqual(s.owner_inputs, owner.publicInputs);
  assert.deepEqual(f.owner_inputs, owner.publicInputs);
  // An explicitly private change must not flow through the public allowlist.
  const changed = structuredClone(s);
  changed.owner_proof[0] = '999'; changed.input_siblings[0][0] ^= 1;
  assert.deepEqual(publicWords('reserve', changed), publicWords('reserve', s));
});

test('admission matches an independently framed H4 and ignores mutable funding root/window', () => {
  const owner = synthetic(), s = inputFor('reserve', owner);
  const fields = [Buffer.from(ADMISSION_DOMAIN), Buffer.from(PROFILE), ...[0, 8, 16, 24].map(offset => Buffer.from(leaf(owner, offset), 'hex'))];
  const encoded = fields.flatMap(field => {
    const size = Buffer.alloc(4); size.writeUInt32BE(field.length); return [size, field];
  });
  assert.equal(digestHex(s.admission_tag), hash(Buffer.concat(encoded)).toString('hex'));
  const otherRoot = inputFor('reserve', owner, 12);
  assert.notDeepEqual(s.base_root, otherRoot.base_root);
  assert.deepEqual(s.admission_tag, otherRoot.admission_tag);
  assert.deepEqual(s.owner_inputs, otherRoot.owner_inputs);
});

test('legacy tree uses six LSB-first levels and exact 0x01 concatenation', () => {
  const owner = synthetic(), commitment = leaf(owner, A0.inputCommitment);
  let node = Buffer.from(commitment, 'hex');
  for (let depth = 0; depth < 6; depth++) {
    const sibling = Buffer.from(siblings[depth], 'hex');
    const pair = (37 >> depth) & 1 ? [sibling, node] : [node, sibling];
    node = hash(Buffer.concat([Buffer.from([1]), ...pair]));
  }
  assert.equal(membershipRoot(commitment, siblings, 37), node.toString('hex'));
  assert.throws(() => membershipRoot(commitment, siblings, 64), /LEAF_INDEX/);
  assert.throws(() => membershipRoot(commitment, siblings.slice(1), 0), /TREE_DEPTH/);
});

test('owner-side composition rejects invalid funding/refund windows and substituted paths', () => {
  const owner = synthetic(), baseRoot = membershipRoot(leaf(owner, A0.inputCommitment), siblings, 37);
  const args = { baseRoot, siblings, leafIndex: 37, validFrom: '100', validUntil: '200' };
  for (const changes of [{ validFrom: '99' }, { validUntil: '201' }, { validFrom: '200' }]) {
    assert.throws(() => reserveInputs(owner, { ...args, ...changes }), /FUNDING_WINDOW/);
  }
  assert.throws(() => reserveInputs(owner, { ...args, leafIndex: 36 }), /INPUT_MEMBERSHIP/);
  const acceptedRoot = membershipRoot(leaf(owner, A0.reserveCommitment), siblings, 37);
  assert.throws(() => refundInputs(owner, { acceptedRoot, siblings, leafIndex: 37, validFrom: '299', validUntil: '301' }), /REFUND_WINDOW/);
  assert.throws(() => refundInputs(owner, { acceptedRoot, siblings, leafIndex: 37, validFrom: '300', validUntil: '300' }), /REFUND_WINDOW/);
});

test('field decoding rejects truncation, noncanonical values and oversized timestamps', () => {
  const a = synthetic().publicInputs;
  assert.throws(() => ownerStatement(a.slice(1)), /A0_LENGTH/);
  for (const [offset, value] of [[0, '4294967296'], [138, '18446744073709551616'], [5, '01'], [5, '-1'], [5, FIELD_MODULUS.toString()]]) {
    const changed = [...a]; changed[offset] = value;
    assert.throws(() => ownerStatement(changed), /FIELD_/);
  }
});

test('key integrity rejects zero keys, field replacement and wrong-sized keys without installing a pin', () => {
  assert.throws(() => validateKeyFields(Buffer.alloc(115 * 32), Array(115).fill('0')), /ZERO_VK/);
  assert.throws(() => validateKeyFields(Buffer.alloc(114 * 32), Array(115).fill('1')), /VK_BYTES/);
  assert.throws(() => validateKeyFields(Buffer.alloc(115 * 32), Array(115).fill('1')), /FIELD_BYTES_MISMATCH/);
  assert.throws(() => validateOwnerPin({}), /ARTIFACT_PATH_REQUIRED/);
});

test('artifact ABI integrity checks every A0 public parameter and primitive width', () => {
  const invalid = { abi: { parameters: structuredClone(OWNER_PUBLIC_ABI), return_type: null }, bytecode: 'AA==' };
  invalid.abi.parameters[0].type.type.width = 64;
  assert.throws(() => assertOwnerArtifact(invalid), /PUBLIC139_ABI/);
  invalid.abi.parameters = structuredClone(OWNER_PUBLIC_ABI);
  assert.throws(() => assertOwnerArtifact(invalid), /COMPRESSED_ACIR/);
});

test('source provenance inventories the complete explicit A0 Noir dependency closure', () => {
  const root = new URL('../../../', import.meta.url).pathname;
  const manifest = sourceManifest(root, 'experiments/private-core-proof/generic-funding/circuits/authorization');
  assert.ok(manifest.files.some(file => file.path.endsWith('generic-funding/lib/src/funding.nr')));
  assert.ok(manifest.files.some(file => file.path.endsWith('generic-graph/lib/src/sha256.nr')));
  assert.equal(manifest.files.filter(file => file.path.endsWith('Nargo.toml')).length, 3);
  assert.match(sourceTreeHash(manifest), /^[0-9a-f]{64}$/);
  assert.equal(new Set(manifest.files.map(file => file.path)).size, manifest.files.length);
});
