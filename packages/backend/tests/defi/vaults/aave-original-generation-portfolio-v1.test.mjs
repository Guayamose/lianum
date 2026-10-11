/** HOST only: actual generation-reader, original official preview interface and
 * projection, with explicitly inert observations and inert reads.
 * No protocol, private credit, signing, node, proof or financial acceptance. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {createGenerationPositionReaderV1} from '../../../src/defi/withdrawals/generation-position-reader-v1.mjs';
import {observeOfficialPrivateSharesV1} from '../../../src/defi/vaults/official-vault-observation-v1.mjs';
import { projectPrivateVaultPosition } from '../../../src/defi/vaults/private-vault-position.mjs';

function fixture(kind = 'AAVE_STATIC') {
  const runtime = {}, catalogue = {}, account = {}, service = {}, protocolVault = {};
  const holder = '0x' + '12'.repeat(20), shareAssetId = '34'.repeat(32), underlyingAssetId = '56'.repeat(32);
  const header = { number: '0xa', hash: '0x' + '78'.repeat(32), timestamp: '0x64' };
  const observed = { blockNumber: '10', blockHash: header.hash.slice(2), timestamp: '100' };
  const view = { identity: {}, snapshot: { blockNumber: '10', blockHash: observed.blockHash,
    blockTimestamp: '100', totalAssets: '103', totalShares: '100' }, header };
  const state = { maximum: 100n, changedHead: false, ordinaryReads: 0, reads: [], canonicalChecks: 0 };
  runtime.assertCanonical = async actual => { assert.deepEqual(actual, header); state.canonicalChecks++; };
  runtime.block = async () => ({ ...header, ...(state.changedHead ? { hash: '0x' + '9a'.repeat(32) } : {}) });
  const previewPorts = {
    assert, BigInt, runtime, vault: protocolVault,
    exclusive: work => work(), detached: structuredClone, observed: async () => structuredClone(view),
    read: async (target, method, args, tag) => {
      assert.equal(target, protocolVault); assert.equal(tag, header.number);
      assert.equal(args[0], method === 'previewRedeem' ? '100' : holder);
      state.reads.push(method);
      return [method === 'previewRedeem' ? 103n : method === 'maxRedeem' ? state.maximum : 100n];
    },
  };
  const vault = {observePrivateShares: input => observeOfficialPrivateSharesV1(input, previewPorts)};
  vault.observe = async () => { state.ordinaryReads++; return structuredClone(view); };
  const portfolioView = { status: 'LIVE', coherent: true, observed, assets: [
    { asset: { assetId: shareAssetId }, status: 'LIVE', balances: { available: '100' }, backing: { held: '100' } },
    { asset: { assetId: underlyingAssetId }, status: 'LIVE', balances: { available: '7' }, backing: { held: '7' } },
  ] };
  const membership = { runtime, generationId: 'original_generation', portfolio: {
    registry: [{ assetId: shareAssetId, pool: holder.slice(2) }],
  } };
  const original = { account, vault }, entry = { original, service, membership, shareAssetId };
  const services = new WeakMap([[service, original]]), vaultKinds = new WeakMap([[vault, kind]]);
  const ports = { runtime, catalogue,
    need: (condition, code) => assert.ok(condition, code),
    originalBinding(actualRuntime, actualService) {
      assert.equal(actualRuntime, runtime); return services.get(actualService);
    },
    assertCatalogue(actual, binding) { assert.equal(actual, catalogue); assert.equal(binding.runtime, runtime); },
    assertAccount(actual, actualAccount) {
      assert.equal(actual, catalogue); assert.equal(actualAccount, account); return membership;
    },
    isOfficial(value) { assert.equal(arguments.length, 1); return vaultKinds.has(value) && vaultKinds.get(value) !== 'BACKED'; },
  };
  const {readOriginalPositionVault: read}=createGenerationPositionReaderV1(ports);
  const project = vaultView => projectPrivateVaultPosition({ portfolioView, vaultView, shareAssetId, underlyingAssetId });
  return {state,entry,portfolioView,project,read,generic:()=>vault.observe()};
}

test('generation Aave position uses original canonical preview and maxRedeem rather than the generic vault ratio', async () => {
  const f = fixture(), before = structuredClone(f.portfolioView);
  const oldView = f.project(await f.generic());
  assert.equal(oldView.estimatedRedeemableUnderlying, '102');
  const fixed = f.project(await f.read(f.entry, f.portfolioView));
  assert.equal(fixed.estimatedRedeemableUnderlying, '103'); assert.equal(fixed.status, 'LIVE');
  assert.deepEqual(f.state.reads, ['previewRedeem', 'maxRedeem', 'balanceOf']);
  assert.equal(f.state.canonicalChecks, 1); assert.equal(fixed.underlyingSpendable, false);
  assert.equal(fixed.privateConversionAccepted, false);
  f.state.maximum = 0n;
  const blocked = f.project(await f.read(f.entry, f.portfolioView));
  assert.equal(blocked.status, 'STALE'); assert.equal(blocked.estimatedRedeemableUnderlying, null);
  assert.deepEqual(f.portfolioView, before, 'ORIGINAL_SHARE_OWNERSHIP_AND_UNDERLYING_UNCHANGED');
  assert.equal(f.project(await f.generic()).status, 'LIVE', 'FORMER_READER_OMITTED_MAX_REDEEM');
  f.state.changedHead = true;
  await assert.rejects(f.read(f.entry, f.portfolioView), /METAMORPHO_PRIVATE_POSITION_HEAD_CHANGED/);
  await assert.rejects(f.read({ ...f.entry, original: { ...f.entry.original } }, f.portfolioView), /ORIGINAL_SERVICE_CHANGED/);
  const backed = fixture('BACKED');
  assert.equal(backed.project(await backed.read(backed.entry, backed.portfolioView)).estimatedRedeemableUnderlying, '102');
  assert.equal(backed.state.ordinaryReads, 1); assert.deepEqual(backed.state.reads, []);
});


test('official private share preview rejects malformed input before any RPC read', async () => {
  let reads = 0;
  const forbidden = async () => { reads++; throw Error('HOST_UNEXPECTED_READ'); };
  const ports = { runtime: { assertCanonical: forbidden, block: forbidden }, vault: {},
    observed: forbidden, read: forbidden, detached: structuredClone };
  const holder = '0x' + '12'.repeat(20);
  for (const input of [null, { amount: '01', holder }, { amount: '-1', holder },
    { amount: (1n << 64n).toString(), holder }, { amount: '1', holder: '0x' + '0'.repeat(40) },
    { amount: '1', holder, extra: true }]) await assert.rejects(observeOfficialPrivateSharesV1(input, ports));
  assert.equal(reads, 0);
});
