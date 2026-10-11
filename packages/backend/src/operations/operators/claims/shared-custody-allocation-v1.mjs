import {assertOwnedSolanaSplCustodyV1} from '../../../chains/solana/runtime/owned-solana-runtime.mjs';
/** Monotonic physical escrow allocation shared by old and combined factories.
 * Only original owned runtimes may reserve a close identity; wrappers, clones,
 * public endpoints and matching role dictionaries confer no ownership. Failed
 * bootstrap attempts retain their reservations. There is no release/reset API. */
import assert from 'node:assert/strict';
import { isAbsolute, resolve } from 'node:path';
import { fixedArray } from '@lianum/components/encoding/commitments';
import { assertOwnedBitcoinRuntime, BITCOIN_CUSTODY_PROFILE } from '../../../chains/bitcoin/runtime/owned-bitcoin-runtime.mjs';
import { SOLANA_CUSTODY_PROFILE } from "../../../chains/solana/runtime/solana-profiles.mjs";
import { assertOwnedSolanaRuntime } from "../../../chains/solana/runtime/owned-solana-runtime.mjs";
const allocated = new WeakSet(), journals = new Set();
export function reserveOriginalClaimCustodyV1(nativeRuntimes, journalRoot) {
  assert.equal(arguments.length, 2, 'CLAIM_CUSTODY_ALLOCATION_ARGUMENTS');
  fixedArray(nativeRuntimes, 2);
  assertOwnedBitcoinRuntime(nativeRuntimes[0]); assertOwnedSolanaRuntime(nativeRuntimes[1]);
  assert.equal(nativeRuntimes[0].metadata.profile, BITCOIN_CUSTODY_PROFILE);
  assert.equal(nativeRuntimes[1].metadata.classification, SOLANA_CUSTODY_PROFILE);
  const identities = nativeRuntimes.map(runtime => {
    assert.ok(Object.isFrozen(runtime) && typeof runtime.close === 'function', 'CLAIM_ORIGINAL_RUNTIME_IDENTITY');
    return runtime.close;
  });
  assert.notEqual(identities[0], identities[1], 'CLAIM_DISTINCT_PHYSICAL_CUSTODY');
  assert.ok(typeof journalRoot === 'string' && isAbsolute(journalRoot) && resolve(journalRoot) === journalRoot,
    'CLAIM_CUSTODY_ABSOLUTE_JOURNAL');
  assert.ok(identities.every(identity => !allocated.has(identity)), 'CLAIM_PHYSICAL_CUSTODY_ALREADY_ALLOCATED');
  assert.ok(!journals.has(journalRoot), 'CLAIM_PHYSICAL_JOURNAL_ALREADY_ALLOCATED');
  identities.forEach(identity => allocated.add(identity)); journals.add(journalRoot);
}

export function reserveOriginalSplClaimCustodyV1(nativeRuntimes,journalRoot){
 assert.equal(arguments.length,2);fixedArray(nativeRuntimes,2);assertOwnedBitcoinRuntime(nativeRuntimes[0]);assertOwnedSolanaSplCustodyV1(nativeRuntimes[1]);
 assert.equal(nativeRuntimes[0].metadata.profile,BITCOIN_CUSTODY_PROFILE);const identities=nativeRuntimes.map(r=>r.close);assert.notEqual(identities[0],identities[1],'CLAIM_DISTINCT_PHYSICAL_CUSTODY');identities.forEach(v=>assert.equal(typeof v,'function'));
 assert.ok(identities.every(v=>!allocated.has(v)),'CLAIM_PHYSICAL_CUSTODY_ALREADY_ALLOCATED');assert.ok(typeof journalRoot==='string'&&isAbsolute(journalRoot)&&resolve(journalRoot)===journalRoot);assert.ok(!journals.has(journalRoot),'CLAIM_PHYSICAL_JOURNAL_ALREADY_ALLOCATED');
 identities.forEach(v=>allocated.add(v));journals.add(journalRoot);
}
