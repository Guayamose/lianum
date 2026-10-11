/** New sparse-tree domain only. SHA256 identities are encoded IN FULL as two
 * u128 limbs; they are never reduced into a field. Internal roots are canonical
 * BN254 fields. No original P2 tree/profile or PC23 note is reinterpreted. */
import assert from 'node:assert/strict';
import {portablePoseidon2HashV1,PORTABLE_POSEIDON2_MODULUS_V1} from '@lianum/crypto/portable-poseidon2';
export const PAGED_SPARSE_ENCODING_V3='BN254_POSEIDON2_SPARSE_V3';
export const PAGED_SPARSE_DOMAIN_V3=0x4c49414e554d5f50414745445f545245455f50325f5633n;
export const PAGED_SPARSE_MODULUS_V3=PORTABLE_POSEIDON2_MODULUS_V1;
const kinds=Object.freeze(['pages','nodes','outputs','frontier','admitted']);
function kind(tag){const k=kinds.indexOf(tag);assert.ok(k>=0,'PAEG_PAGED_TREE');return BigInt(k);}
function raw(value){assert.ok(typeof value==='string'&&/^[0-9a-f]{64}$/.test(value),'PAEG_PAGED_TREE_DIGEST');return BigInt('0x'+value);}
export function pagedSparseCanonicalFieldV3(value){const n=raw(value);assert.ok(n<PAGED_SPARSE_MODULUS_V3,'PAEG_PAGED_TREE_NONCANONICAL_FIELD');return n;}
export function pagedSparseDigestLimbsV3(value){const n=raw(value);return Object.freeze([n>>128n,n&((1n<<128n)-1n)]);}
const encode=n=>n.toString(16).padStart(64,'0');
export function pagedSparseEmptyLeafV3(tag){return encode(portablePoseidon2HashV1([PAGED_SPARSE_DOMAIN_V3,3n,1n,1n,kind(tag)]));}
export function pagedSparseLeafV3(tag,digest){const limbs=pagedSparseDigestLimbsV3(digest);return encode(portablePoseidon2HashV1([PAGED_SPARSE_DOMAIN_V3,3n,2n,3n,kind(tag),...limbs]));}
export function pagedSparseBranchV3(tag,level,left,right){assert.ok(Number.isSafeInteger(level)&&level>=1&&level<=64,'PAEG_PAGED_TREE_LEVEL');return encode(portablePoseidon2HashV1([PAGED_SPARSE_DOMAIN_V3,3n,3n,4n,kind(tag),BigInt(level),pagedSparseCanonicalFieldV3(left),pagedSparseCanonicalFieldV3(right)]));}
