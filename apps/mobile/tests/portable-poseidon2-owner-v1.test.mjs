/** Official pinned upstream vectors + original host field encodings.
 * Pure Node host contract only; no BB/Noir/phone/economic execution accepted. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { PORTABLE_POSEIDON2_MODULUS_V1 as P, portablePoseidon2HashV1,
  portablePoseidon2HexV1, portablePoseidon2PermutationV1 } from '../src/custody/poseidon2-bn254-v1.mjs';
import { createPortableOwnerCommitmentCodecV1, portableRawDigestLimbsV1 }
  from '../src/custody/owner-commitment-codec-v1.mjs';
import { createCommitmentCodec } from '../../../packages/backend/src/execution/encoding/commitments.mjs';

test('Poseidon2 matches BB5.2 exact official permutation and installed hash snapshot', () => {
  // v5.2.0 poseidon2_params.hpp TEST_VECTOR_INPUT/OUTPUT, unchanged at49a592.
  assert.deepEqual(portablePoseidon2PermutationV1([0n, 1n, 2n, 3n]), [
    0x01bd538c2ee014ed5141b29e9ae240bf8db3fe5b9a38629a9647cf8d76c01737n,
    0x239b62e7db98aa3a2a8f6a0d2fa1709e7a35959aa6c7034814d9daa90cbac662n,
    0x04cbb44c61d928ed06808456bf758cbf0c18d1e15a7b6dbc8245fa7515d5e3cbn,
    0x2e11c5cff2a22c64d01304b778d78f6998eff1ab73163a35603f54794c30847an,
  ]);
  // bb.js src/barretenberg/__snapshots__/poseidon.test.ts.snap: inputs4,8.
  assert.equal(portablePoseidon2HexV1([4n, 8n]), '2bcaeb6d58bb38baf753d58c3c96618fea82163345295eb40e88344eeb0ce2a1');
});
test('official C++ four-input consistency vector covers the second sponge block', () => {
  // The upstream fr constructor reduces this fixed fixture. Public API still
  // rejects noncanonical operands: reduction happens explicitly only here.
  const x = 0x9a807b615c4d3e2fa0b1c2d3e4f56789fedcba9876543210abcdef0123456789n % P;
  assert.equal(portablePoseidon2HexV1([x, x, x, x]), '2f43a0f83b51a6f5fc839dea0ecec74947637802a579fa9841930a25a0bcec11');
});
test('portable domain/header/raw limbs and longest revocation tuple match original owner framing', async () => {
  const portable = createPortableOwnerCommitmentCodecV1(), captured = [];
  const original = createCommitmentCodec({ hashFields: async fields => {
    captured.push([...fields]); return portablePoseidon2HexV1(fields);
  } });
  const domain = Object.fromEntries(['scope', 'policy', 'asset', 'hubDomain',
    'registryCommitment', 'verifierSetCommitment', 'ledgerNamespace'].map((name, i) => [name, (i + 1).toString(16).padStart(2, '0').repeat(32)]));
  const d = await portable.domainCommitment(domain);
  assert.equal(d, await original.domainCommitment(domain));
  assert.equal(captured[0].length, 18); assert.deepEqual(captured[0].slice(0, 4),
    [0x4c49414e554d5f504145475f50325f5631n, 1n, 1n, 14n]);
  assert.deepEqual(portableRawDigestLimbsV1('ff'.repeat(32)), [(1n << 128n) - 1n, (1n << 128n) - 1n]);
  const revoked = ['fa'.repeat(32), ...Array(63).fill('00'.repeat(32))];
  assert.equal(await portable.revokedDigest(d, domain.hubDomain, revoked, '1'),
    await original.revokedDigest(d, domain.hubDomain, revoked, '1'));
  assert.equal(captured.at(-1).length, 137);
  assert.equal(await portable.authorizationLeaf(d, d), await original.authorizationLeaf(d, d));
  const tree = await portable.buildTree(d, 0, [d]); const oldTree = await original.buildTree(d, 0, [d]);
  assert.equal(tree.root, oldTree.root);
  assert.equal(await portable.membershipRoot(d, 0, d, tree.opening(0).siblings, 0), tree.root);
  assert.throws(() => portable.revokedDigest(d, domain.hubDomain, [...revoked.slice(0, 63), '01'.repeat(32)], '1'), /PADDING/);
});
test('canonical operands, bounded dense fields and fixed hash refuse aliases/callbacks', async () => {
  for (const input of [[P], [-1n], [1], Array(138).fill(1n), [1n, , 3n]])
    assert.throws(() => portablePoseidon2HashV1(input), /NONCANONICAL/);
  const accessor = []; Object.defineProperty(accessor, '0', { enumerable: true,
    get() { throw new Error('ACCESSOR_EXECUTED'); } });
  assert.throws(() => portablePoseidon2HashV1(accessor), /NONCANONICAL/);
  assert.throws(() => createPortableOwnerCommitmentCodecV1({ hashFields() {} }), /NO_CALLER_HASH/);
  assert.throws(() => createPortableOwnerCommitmentCodecV1().authorizationLeaf('ff'.repeat(32), '00'.repeat(32)), /FIELD_RANGE/);
});
