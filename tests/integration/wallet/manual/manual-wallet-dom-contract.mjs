/** DOM contract exercise with synthetic lower services. Lower account/vault services are synthetic.
 * No chain, keys, funds, native transactions or proof is created here. */
import assert from 'node:assert/strict';
import { mock } from 'node:test';
import { ROOT } from '../../../../packages/proofs/src/catalog.mjs';
import { join } from 'node:path';
import { walletBrowserRuntimePins } from './wallet-browser-runtime-pins.mjs';
import { createManualWalletDomDriver } from './manual-wallet-dom-driver.mjs';
const runtimePins = walletBrowserRuntimePins();
const { startOwnedWalletBrowser } = await import('./owned-wallet-browser.mjs');

const accountBrand = new WeakSet(), vaultBrand = new WeakMap();
const code = name => Object.assign(new Error(name), { code: name });
const originalAccount = await import('../../../../packages/backend/src/api/accounts/flat-account-session.mjs');
mock.module('../wallet-platform/modules/api/flat-account-session.mjs', { exports: {
  validateFlatAccountPrepare: originalAccount.validateFlatAccountPrepare,
  assertFlatAccountSession(value) { if (!accountBrand.has(value)) throw code('SYNTHETIC_ACCOUNT_REQUIRED'); },
} });
mock.module('../wallet-platform/modules/defi-adapters/private-vault-exit.mjs', { exports: {
  assertOwnedPrivateVaultExit(runtime, service) { if (vaultBrand.get(service) !== runtime) throw code('SYNTHETIC_VAULT_REQUIRED'); },
} });
const { startWalletApplication } = await import('../../../../apps/wallet/src/server/server.mjs');
const assetId = '6'.repeat(64), ownerOperationRef = '7'.repeat(64);
const rows = [], admissions = [], operations = [], effects = [];
const account = Object.freeze({
  async snapshot() { return { version: 1, profile: 'LOCAL_FLAT_ACCOUNT_API_V1', phase: 'READY', available: true,
    busy: false, queued: 0, storageAvailable: true, observation: 'CURRENT', revision: admissions.length,
    requests: structuredClone(rows), admissions: structuredClone(admissions) }; },
  async ownerView() { return { version: 1, status: 'LIVE', asset: { assetId, symbol: 'SYNTH', decimals: 6 },
    observed: { blockNumber: '1' }, balances: { available: '100', reserved: '0', recovery: '0', locked: '0' },
    requests: structuredClone(rows) }; },
  submit(action, input) {
    const requestId = input.requestId;
    let row = rows.find(item => item.requestId === requestId);
    if (action === 'prepare') { assert.equal(row, undefined); row = { requestId, kind: input.kind, state: 'PREPARED', errorCode: null }; rows.push(row); }
    else { assert.ok(row); row.state = 'CONFIRMED'; }
    const sequence = admissions.length + 1;
    admissions.push({ sequence, action, requestId, state: 'SUCCEEDED', errorCode: null });
    effects.push({ action, requestId });
    return { version: 1, sequence, admitted: true, action, requestId };
  },
});
accountBrand.add(account);
const syntheticRuntime = Object.freeze({ synthetic: true });
const vault = {
  async snapshot() { return { version: 1, profile: 'OWNED_PRIVATE_VAULT_EXIT_V1', operations: structuredClone(operations) }; },
  async prepare(input) {
    let row = operations.find(item => item.requestId === input.requestId);
    if (!row) { row = { version: 1, profile: 'OWNED_PRIVATE_VAULT_EXIT_V1', requestId: input.requestId,
      phase: 'READY_TO_REDEEM', sendBlocked: false, shares: '100', minimumOutput: input.minimumOutput,
      deadline: input.deadline, underlyingPrivateSpendable: false, underlyingLocation: 'EXTERNAL_OWNER_ADDRESS', redemptionPublic: true }; operations.push(row); }
    return structuredClone(row);
  },
  async execute(requestId) { const row = operations.find(item => item.requestId === requestId); assert.ok(row);
    if (row.phase !== 'REDEEMED') { row.phase = 'REDEEMED'; row.redeemedUnderlying = '100'; effects.push({ syntheticRedemption: requestId }); }
    return structuredClone(row); },
  async reconcile(requestId) { return structuredClone(operations.find(item => item.requestId === requestId)); },
  async reopen() { return { reopened: true, originalIdentitiesRetained: true, keeperRestart: false, requestIds: operations.map(row => row.requestId) }; },
};
Object.freeze(vault); vaultBrand.set(vault, syntheticRuntime);
let app = await startWalletApplication({ actionAccessMode: 'exact-only', accountSession: account,
  defiExit: { runtime: syntheticRuntime, service: vault } });
let browser, driver, report, cleanup;
const browserClosures = [];
try {
  browser = await startOwnedWalletBrowser(join(ROOT, '.local/manual-wallet-dom-contract'), app.origin);
  driver = await createManualWalletDomDriver(app, { page: browser.page, deadlineMs: Date.now() + 90000 });
  const requestId = 'dom_topup_01';
  // Original custody bodies can arrive in another insertion order (GRAPH did
  // so in the real laboratory). Every displayed value still has to match the
  // production form's fixed field order before importing any exact grant.
  await driver.account('prepare', { assetId, ownerOperationRef, kind: 'TOP_UP', requestId });
  const loss = await driver.executeAccountWithLostReply({ requestId });
  assert.equal(loss.loss.browserReportedUnknown, true);
  await driver.account('reconcile', { requestId });
  await driver.duplicateAccountExecute(requestId);
  const exitId = 'dom_exit_001';
  await driver.account('prepare', { requestId: exitId, kind: 'EXIT', ownerOperationRef, assetId });
  await driver.account('execute', { requestId: exitId });
  await driver.account('reconcile', { requestId: exitId });
  await driver.defi('prepare', { requestId: exitId, minimumOutput: '100', deadline: '9999' });
  await driver.defi('execute', { requestId: exitId });
  await driver.defi('reconcile', { requestId: exitId });
  // This fixture is the legacy single service, so it has no catalogue generation
  // to establish the shared driver's generation-bound reopen postcondition.
  await driver.duplicateDefiExecute(exitId);
  assert.equal(effects.filter(item => item.syntheticRedemption).length, 1);
  const firstEvidence = driver.evidence();
  const originalIds = rows.map(row => row.requestId);
  const oldGrant = app.issueActionCapability({ action: 'accountReconcile', body: { requestId } });
  const firstOrigin = app.origin;
  driver.close();
  browserClosures.push(await browser.close());
  browser = null;
  await app.close();
  app = await startWalletApplication({ actionAccessMode: 'exact-only', accountSession: account,
    defiExit: { runtime: syntheticRuntime, service: vault } });
  assert.notEqual(app.origin, firstOrigin);
  browser = await startOwnedWalletBrowser(join(ROOT, '.local/manual-wallet-dom-contract'), app.origin);
  driver = await createManualWalletDomDriver(app, { page: browser.page, deadlineMs: Date.now() + 90000 });
  await driver.rejectForeignListenerGrant('accountReconcile', { requestId }, oldGrant);
  await driver.account('reconcile', { requestId });
  await driver.defi('reconcile', { requestId: exitId });
  assert.deepEqual(rows.map(row => row.requestId), originalIds);
  assert.equal(effects.filter(item => item.syntheticRedemption).length, 1);
  report = { format: 'SYNTHETIC_LOWER_SERVICES_DOM_CONTRACT_V1', contractPassed: true,
    genuineProofAcceptance: false, nativeEffects: 0, browser: browser.version, guard: browser.inspect(),
    generationReopenExercised: false, syntheticServiceEffects: effects,
    listenerReplacement: { browserInstances: 2, sameSyntheticAccount: true, sameSyntheticVaultJournal: true,
      originalRequestIdsRetained: true, oldGrantRejected: true, originalReconcileCompleted: true },
    evidence: [...firstEvidence, ...driver.evidence()] };
} catch (error) {
  let latchedBrowserFailure = null;
  try { browser?.inspect(); } catch (failure) { latchedBrowserFailure = failure.message; }
  console.log(JSON.stringify({ accepted: false, failure: error.message,
    browserCleanup: error.browserCleanup ?? null, diagnostics: browser?.diagnostics?.(),
    latchedBrowserFailure, genuineProofAcceptance: false, nativeEffects: 0 }));
  throw error;
} finally {
  driver?.close();
  try {
    cleanup = await browser?.close();
    if (cleanup) browserClosures.push(cleanup);
  } catch (error) {
    console.log(JSON.stringify({ accepted: false, browserCleanup: error.browserCleanup ?? null,
      latchedBrowserFailure: error.cause?.message ?? error.message, genuineProofAcceptance: false, nativeEffects: 0 }));
    throw error;
  } finally { await app.close(); }
  if (cleanup && !report) console.log(JSON.stringify({ closedAfterRejectedContract: true, cleanup }));
}
assert.equal(browserClosures.length, 2);
for (const closure of browserClosures) {
  assert.equal(closure.browserOwnedCleanupConfirmed, true);
  assert.equal(closure.guardPassed, true); assert.equal(closure.sandboxedRendererObserved, true);
  assert.deepEqual(closure.exit, { code: 0, signal: null });
  assert.deepEqual(closure.outsideOwnedGroup, []); assert.deepEqual(closure.signals, []);
  assert.equal(closure.newChromeProcessesRemaining, 0);
}
assert.deepEqual(walletBrowserRuntimePins(), runtimePins);
console.log(JSON.stringify({ ...report, cleanup, browserClosures, sourceDistributionUnchanged: true }));
