/** Unmocked production brands. Construction rejects caller-made capabilities;
 * no genuine owner/runtime/authority is created by this test. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createFlatOwnerManualPreparation, restoreFlatOwnerManualPreparation } from '@lianum/backend/custody/preparation/flat-owner-manual-preparation';
import { assertOwnedFlatAccountAuthority } from '../../../backend/src/accounts/authority/flat-account-authority.mjs';
import { assertOwnedFlatOwnerProcess } from '../../../backend/src/custody/processes/flat-owner-process.mjs';

test('unmocked production entry rejects fabricated original capabilities before any supplied method runs', async () => {
  let invoked = false; const forbidden = () => { invoked = true; throw Error('caller method invoked'); };
  const owner = { publicView: { summary: forbidden }, ownerView: { preparationTerms: forbidden }, owner: { prepareDeposit: forbidden } };
  const account = { ownerActions: { registerTopUp: forbidden } };
  await assert.rejects(createFlatOwnerManualPreparation({ runtime: {}, system: {}, poolIndex: 0, owner, account }), /OWNED_SYSTEM/);
  await assert.rejects(restoreFlatOwnerManualPreparation({ runtime: {}, system: {}, poolIndex: 0, owner, account }), /OWNED_SYSTEM/);
  assert.throws(() => assertOwnedFlatOwnerProcess(owner), /OWNED_PROCESS/);
  assert.throws(() => assertOwnedFlatAccountAuthority(account, { owner }), /OWNED_AUTHORITY/);
  assert.equal(invoked, false);
});

test('changed private IPC and authority owner-link remain confined to private surfaces', async () => {
  const processSource = await readFile(new URL((process.env.FLAT_MANUAL_DRAFT_SOURCE_PREFIX ?? '../') + 'mobile-core/flat-owner-process.mjs', import.meta.url), 'utf8');
  const authoritySource = await readFile(new URL((process.env.FLAT_MANUAL_DRAFT_SOURCE_PREFIX ?? '../') + 'wallet-platform/modules/global-state/flat-account-authority.mjs', import.meta.url), 'utf8');
  const adapterSource = await readFile(new URL((process.env.FLAT_MANUAL_DRAFT_SOURCE_PREFIX ?? '../') + 'mobile-core/flat-owner-manual-preparation.mjs', import.meta.url), 'utf8');
  assert.match(processSource, /\['privateSummary', 'preparationTerms', 'manualPreparations'\]\.includes\(method\) \? 'ownerView'/);
  assert.match(processSource, /ownerView: opaque\(\{ summary:.*\n\s*preparationTerms:/);
  assert.match(processSource, /publicView: opaque\(\{ summary: \(\) => request\('summary'\) \}\)/);
  assert.match(authoritySource, /\['runtime', 'system', 'poolIndex', 'owner'\]\.includes\(key\)/);
  assert.match(authoritySource, /owned\.set\(capability, \{ runtime, system, poolIndex, owner, closed:/);
  assert.doesNotMatch(adapterSource, /\.ownerProof\.|\.renewEpoch\(|\.execute\(|fetch\(|createServer\(|httpRequest\(|setInterval\(|setTimeout\(/);
});


test('durable methods are private IPC only and restored capability has no mutation methods', async () => {
  const processSource = await readFile(new URL((process.env.FLAT_MANUAL_DRAFT_SOURCE_PREFIX ?? '../') + 'mobile-core/flat-owner-process.mjs', import.meta.url), 'utf8');
  const bridgeSource = await readFile(new URL((process.env.FLAT_MANUAL_DRAFT_SOURCE_PREFIX ?? '../') + 'mobile-core/flat-owner-manual-preparation.mjs', import.meta.url), 'utf8');
  const custodySource = await readFile(new URL((process.env.FLAT_MANUAL_DRAFT_SOURCE_PREFIX ?? '../') + 'mobile-core/flat-owner-custody.mjs', import.meta.url), 'utf8');
  assert.match(processSource, /const OWNER = \['reauthorizeManualPreparation', 'prepareManualPreparation'/);
  assert.match(processSource, /manualPreparations: \(\) => request\('manualPreparations'\)/);
  assert.match(bridgeSource, /if \(readOnly\) \{ delete adapter.review; delete adapter.cancelReview; delete adapter.confirm; \}/);
  assert.match(custodySource, /state.manualPreparations \?\?= \{ version: 1, records: \[\] \}/);
  assert.doesNotMatch(bridgeSource, /\.ownerProof\.|\.renewEpoch\(|\.execute\(|fetch\(|createServer\(|httpRequest\(|setInterval\(|setTimeout\(/);
});
