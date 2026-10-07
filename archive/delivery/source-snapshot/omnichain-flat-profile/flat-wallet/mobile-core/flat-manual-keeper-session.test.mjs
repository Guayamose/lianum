/** Real encrypted new keeper + real FlatAccountSession/view-model. Only the
 * authority/owner are explicit synthetic ports in this file. This tests durable
 * confirmed-row replay semantics, not transaction or proof acceptance. */
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const accounts = new WeakMap(), owners = new WeakSet();
mock.module(new URL('../wallet-platform/modules/global-state/flat-account-authority.mjs', import.meta.url).href, { exports: {
  assertOwnedFlatAccountAuthority(account, expected) { assert.deepEqual(accounts.get(account), expected); }
} });
mock.module(new URL('./flat-owner-process.mjs', import.meta.url).href, { exports: {
  assertOwnedFlatOwnerProcess(owner) { assert.ok(owners.has(owner)); }
} });
const { createFlatManualAccountKeeper, assertOwnedFlatManualAccountKeeper } = await import('../wallet-platform/modules/global-state/flat-manual-account-keeper.mjs');
const { createFlatAccountSession } = await import('../wallet-platform/modules/api/flat-account-session.mjs');
const { projectWalletState } = await import('../wallet-app/public/view-model.mjs');
const h = n => n.toString(16).padStart(64, '0');
test('durable CONFIRMED duplicate execute/reconcile and session restart do not repeat authority execution', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'flat-keeper-session-')); t.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, 'manual.vault'), runtime = {}, system = {}, owner = {};
  const asset = { assetId: h(1), kind: 'NATIVE', symbol: 'ETH', decimals: 18, chainId: '31337', genesis: h(2), pool: '12'.repeat(20),
    scope: h(3), policy: h(4), token: '0'.repeat(40), codeHash: h(5), assetIdentity: h(6), custody: 'ONCHAIN_NOTE_POOL', trust: 'PINNED_LOCAL_CONTRACT_AND_TRUSTED_NATIVE_ISSUER' };
  const config = { accountId: 'session_account_01', journalId: 'session_journal_01', lifetime: h(7), registry: [asset] };
  let calls = 0, bound, attached;
  const account = Object.freeze({ config, manualLifecycle: Object.freeze({
    bindKeeper(keeper) { assertOwnedFlatManualAccountKeeper(keeper, { runtime, system, poolIndex: 0, owner, account }); attached = keeper; },
    async prepare({ keeper, request }) { assert.equal(keeper, attached); bound = request; },
    async execute({ keeper, request, generation }) {
      assert.equal(keeper, attached); assert.deepEqual(request, bound); assert.equal(generation, 0); calls++;
      return { type: 'CONFIRMED', outcome: { version: 1, state: 'CONFIRMED', bindingSHA256: request.bindingSHA256,
        assetBindingSHA256: request.assetBindingSHA256, outcomeId: h(8), disposition: 'APPLIED', blockNumber: '1', blockHash: h(9) } };
    },
  }), authority: Object.freeze({ async observe({ request, outcome, challenge }) {
    return { version: 1, status: 'LIVE', bindingSHA256: request.bindingSHA256, assetBindingSHA256: request.assetBindingSHA256,
      outcomeId: outcome.outcomeId, challenge, observedAt: Date.now(), blockNumber: '2', blockHash: h(10), canonicalOutcomeBlockHash: outcome.blockHash,
      backing: { held: '50', liabilities: '50', surplus: '0', deficit: '0' } };
  } }) });
  accounts.set(account, { runtime, system, poolIndex: 0, owner }); owners.add(owner);
  const keeper = await createFlatManualAccountKeeper({ runtime, system, poolIndex: 0, owner, account, path,
    password: 'synthetic-session-only', onCheckpoint: async () => {} }); t.after(() => keeper.close());
  const session = await createFlatAccountSession({ keeper, ownerHandoff: { async ownerView() { return { status: 'UNAVAILABLE' }; } } });
  const request = { requestId: 'session_request_01', kind: 'TOP_UP', ownerOperationRef: h(11), assetId: asset.assetId };
  session.prepare(request); await session.idle(); assert.equal((await session.snapshot()).requests[0].state, 'PREPARED');
  session.execute(request.requestId); await session.idle(); assert.equal((await session.snapshot()).requests[0].state, 'CONFIRMED');
  assert.equal(calls, 1); const encrypted = await readFile(path), revision = (await session.snapshot()).revision;
  session.execute(request.requestId); await session.idle(); session.reconcile(request.requestId); await session.idle();
  session.restartCoordinator(); await session.idle();
  const current = await session.snapshot(); assert.equal(current.requests[0].state, 'CONFIRMED'); assert.equal(current.revision, revision);
  assert.equal(calls, 1); assert.deepEqual(await readFile(path), encrypted);
  assert.equal(projectWalletState({ connection: 'CONNECTED', errors: {}, account: { snapshot: current } }).accountRequests[0].state, 'CONFIRMED');
  assert.equal(await keeper.confirmReauthorization(), false);
});
