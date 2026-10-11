/** HOST only: actual generation-reader, original official preview body and
 * projection, with explicitly synthetic brands/observations and inert reads.
 * No protocol, private credit, signing, node, proof or financial acceptance. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { exactRecord } from '@lianum/components/encoding/commitments';
import { projectPrivateVaultPosition } from '../../../src/defi/vaults/private-vault-position.mjs';

async function fixedSource(physical, generated) {
  for (const relative of [physical, generated]) {
    try { return await readFile(new URL(relative, import.meta.url), 'utf8'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  throw Error('HOST_FIXED_ORIGINAL_SOURCE_REQUIRED');
}
const generation = await fixedSource('../../../src/defi/withdrawals/generation-private-vault-exit.mjs', './generation-private-vault-exit.mjs');
const official = await fixedSource('../../../src/defi/vaults/owned-metamorpho-vault.mjs', './owned-metamorpho-vault.mjs');
function section(source, start, end) {
  const a = source.indexOf(start), b = source.indexOf(end, a);
  assert.ok(a >= 0 && b > a, 'HOST_ACTUAL_BODY_BOUNDARY');
  return source.slice(a, b);
}
const genuine = section(generation, '  function genuine(entry) {', '  function route(requestId) {');
const reader = section(generation, '  async function readOriginalPositionVault(', '  const facade =');
const preview = section(official, '    observePrivateShares(input) {', '    validateQuote:');

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
    // Explicit host/VM metadata bridge, never a production validator change.
    exactRecord: (value, keys) => exactRecord(structuredClone(value), structuredClone(keys)),
    exclusive: work => work(), detached: structuredClone, observed: async () => structuredClone(view),
    read: async (target, method, args, tag) => {
      assert.equal(target, protocolVault); assert.equal(tag, header.number);
      assert.equal(args[0], method === 'previewRedeem' ? '100' : holder);
      state.reads.push(method);
      return [method === 'previewRedeem' ? 103n : method === 'maxRedeem' ? state.maximum : 100n];
    },
  };
  const vault = vm.runInNewContext('({' + preview + '})', previewPorts);
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
    originalExits: { ownedPrivateVaultExitBinding(actualRuntime, actualService) {
      assert.equal(actualRuntime, runtime); return services.get(actualService);
    } },
    assertOwnedFlatJournalCatalogue(actual, binding) { assert.equal(actual, catalogue); assert.equal(binding.runtime, runtime); },
    assertOwnedFlatJournalCatalogueAccount(actual, actualAccount) {
      assert.equal(actual, catalogue); assert.equal(actualAccount, account); return membership;
    },
    isOwnedOfficialStaticVaultV1(value) { assert.equal(arguments.length, 1); return vaultKinds.has(value) && vaultKinds.get(value) !== 'BACKED'; },
    isOwnedMetaMorphoVault(value) { return vaultKinds.get(value) === 'METAMORPHO'; },
  };
  const open = body => vm.runInNewContext(genuine + body + '\nreadOriginalPositionVault;', ports);
  const project = vaultView => projectPrivateVaultPosition({ portfolioView, vaultView, shareAssetId, underlyingAssetId });
  return { state, entry, portfolioView, project, read: open(reader),
    // Same actual body with its former fixed selector, to reproduce the bug.
    oldRead: open(reader.replace('isOwnedOfficialStaticVaultV1', 'isOwnedMetaMorphoVault')) };
}

test('generation Aave position uses original canonical preview and maxRedeem rather than the generic vault ratio', async () => {
  const f = fixture(), before = structuredClone(f.portfolioView);
  const oldView = f.project(await f.oldRead(f.entry, f.portfolioView));
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
  assert.equal(f.project(await f.oldRead(f.entry, f.portfolioView)).status, 'LIVE', 'FORMER_READER_OMITTED_MAX_REDEEM');
  f.state.changedHead = true;
  await assert.rejects(f.read(f.entry, f.portfolioView), /METAMORPHO_PRIVATE_POSITION_HEAD_CHANGED/);
  await assert.rejects(f.read({ ...f.entry, original: { ...f.entry.original } }, f.portfolioView), /ORIGINAL_SERVICE_CHANGED/);
  const backed = fixture('BACKED');
  assert.equal(backed.project(await backed.read(backed.entry, backed.portfolioView)).estimatedRedeemableUnderlying, '102');
  assert.equal(backed.state.ordinaryReads, 1); assert.deepEqual(backed.state.reads, []);
});
