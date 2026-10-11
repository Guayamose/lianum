/** Unmocked production negative ownership and source-only boundary checks.
 * No native factory succeeds; no child, key, prover, backend or chain starts. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createNativeValueOwnerManualPreparation, restoreNativeValueOwnerManualPreparation } from '../../../backend/src/custody/preparation/native-value-owner-manual-preparation-v1.mjs';
import { createNativeValueOwnerProcess, assertOwnedNativeValueOwnerProcess } from '../../../backend/src/custody/processes/native-value-owner-process-v2.mjs';
import { createNativeValueAccountAuthority, nativeValueAccountManualNoteDetails } from '../../../backend/src/accounts/authority/native-value-account-authority-v2.mjs';
import { createNativeValueManualGraphAccountSession } from '@lianum/backend/accounts/manual-graph';
const source = path => readFile(new URL(path, import.meta.url), 'utf8');
test('real native brands reject copied, legacy-shaped, wrapped-shaped and caller-asserted owner/account/system ports before touching methods', async () => {
  let touched = false; const trap = () => { touched = true; throw Error('CALLER_PORT'); };
  for (const profile of ['FIXED_LOCAL_FLAT_OWNER_CUSTODY_V1', 'WRAPPED_CLAIM_OWNER_PROCESS_V1', 'OWNED_NATIVE_VALUE_OWNER_PROCESS_V2']) {
    const runtime = {}, system = { profile, claimsEnabled: profile.includes('WRAPPED') }, owner = { profile, publicView: { summary: trap } }, account = { ownerActions: { createManualPreparation: trap } };
    const input = { runtime, system, poolIndex: 0, owner, account };
    await assert.rejects(createNativeValueOwnerManualPreparation(input)); await assert.rejects(restoreNativeValueOwnerManualPreparation(input));
    assert.throws(() => assertOwnedNativeValueOwnerProcess(owner)); assert.throws(() => nativeValueAccountManualNoteDetails({ profile }));
    await assert.rejects(createNativeValueAccountAuthority({ runtime, system, poolIndex: 0, owner, nativeExecution: null, accountId: 'negative_account', journalId: 'negative_journal' }));
    await assert.rejects(createNativeValueManualGraphAccountSession({ runtime, system, poolIndex: 0, account, journal: { path: '/not-used', password: 'not-used' } }));
    await assert.rejects(createNativeValueOwnerProcess({ runtime, system, poolIndex: 0, directory: '/not-used', password: 'not-used', create: true, checkpoint: null, onCheckpoint: trap }));
  }
  assert.equal(touched, false);
});
test('native consent keeps original native vault path and checkpoint, owns a new record namespace, and never exports owner secrets or ambient grants', async () => {
  const process = await source('./native-value-owner-process-v2.mjs'), custody = await source('./native-value-owner-custody-v3.mjs');
  const bridge = await source('./native-value-owner-manual-preparation-v1.mjs');
  assert.match(process, /native-value-owner-v2\.vault/); assert.match(process, /create, checkpoint, processIdentitySHA256, processGeneration: generation/);
  assert.match(process, /const OWNER = \['prepareNativeNotePreparation'/);
  assert.doesNotMatch(process, /['"]prepareManualPreparation['"]|['"]reauthorizeManualPreparation['"]|['"]manualPreparations['"]/);
  assert.match(custody, /NATIVE_VALUE_OWNER_PROFILE = 'FIXED_LOCAL_FLAT_OWNER_CUSTODY_V1'/);
  assert.match(custody, /nativeNotePreparations/); assert.doesNotMatch(custody, /state\.manualPreparations|record\.data\.manualPreparations/);
  assert.match(custody, /same\(terms\.observed, review\.observed\)/);
  assert.match(custody, /recordMark\(record\), cp.pending \?\? cp.acknowledged/);
  assert.doesNotMatch(bridge, /\.ownerProof\.|\.renewEpoch\(|\.execute\(|fetch\(|createServer\(|postMessage|setInterval\(|setTimeout\(/);
  assert.match(bridge, /if \(readOnly\) \{ delete adapter.review; delete adapter.cancelReview; delete adapter.confirm; \}/);
});
test('same SDK, HTTP routes and proof identities; no consent transport circuit, factory release or key regeneration hook', async () => {
  const native = await source('../wallet-platform/modules/global-state/native-value-account-authority-v2.mjs');
  const shared = await source('../wallet-platform/modules/api/flat-manual-graph-session.mjs');
  const server = await source('../wallet-app/server.mjs');
  assert.match(native, /'deposit_balance' : 'withdraw_balance'/); assert.match(native, /if \(manual\).*requireFixedManualEpoch/);
  assert.match(shared, /createDurableGenericAccountKeeperV1\(\{ config: account.config, journal, authority: account.authority \}\)/);
  assert.match(shared, /flatManualNativeNoteActionTarget/); assert.match(server, /WALLET_NATIVE_NOTE_EXACT_ACCESS_REQUIRED/);
  assert.doesNotMatch(server, /prepareNativeNotePreparation|ownerProof|native-value-owner-custody|rootKey|privateKey/);
  const nativeSession = shared.slice(shared.indexOf('export async function createNativeValueManualGraphAccountSession'), shared.indexOf('export async function createWrappedWalletManualGraphSessionV1'));
  assert.doesNotMatch(nativeSession, /claimsEnabled === true|assertOwnedWrapped|assertOwnedFlatSystem\(runtime, system\)/);
  assert.match(nativeSession, /system.claimsEnabled === false/);
});
test('future genuine acceptance adapter remains null-gated before original owner or any resource creation', async () => {
  const { createNativeNoteWalletAcceptance, NATIVE_NOTE_WALLET_ACCEPTANCE_RELEASE } = await import('../../../../tests/integration/wallet/native/native-note-wallet-acceptance-v1.mjs');
  assert.equal(NATIVE_NOTE_WALLET_ACCEPTANCE_RELEASE, null);
  await assert.rejects(createNativeNoteWalletAcceptance({ runtime: {}, system: {}, poolIndex: 0, account: {}, journal: {}, deadlineMs: 1 }), /GENUINE_ACCEPTANCE_NOT_RELEASED/);
});
