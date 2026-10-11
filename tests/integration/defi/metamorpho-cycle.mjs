/** Explicit local acceptance of official MetaMorpho public redemption. Fake
 * tokens, owned loopback EVM, no production network or private credit. The
 * private EXIT bridge is covered separately by private-vault-exit.test.mjs. */
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createOwnedLocalEvmV2 } from '../../../packages/backend/src/chains/evm/runtime/owned-evm-v2-runtime.mjs';
import { createOfficialProtocolFixture } from '../../../packages/backend/tests/fixtures/operations/deployments/system/official-protocol-fixture-v3.mjs';
import { createOwnedMetaMorphoVault, assertOwnedMetaMorphoReceipt } from '../../../packages/backend/src/defi/vaults/owned-metamorpho-vault.mjs';
import { ROOT } from '@lianum/proofs/catalog';

assert.deepEqual(process.argv.slice(2), ['--run-local-fixture'], 'EXPLICIT_LOCAL_DEFI_FIXTURE_REQUIRED');
const report = { schema: 'LIANUM_LOCAL_METAMORPHO_ACCEPTANCE_V1', success: false, publicNetwork: false,
  privateCreditEstablished: false, privateEntryExitEndToEndEstablished: false, checks: {}, phase: 'runtime' };
const directory = join(ROOT, '.local/development-defi'); mkdirSync(directory, { recursive: true, mode: 0o700 });
const path = join(directory, 'metamorpho-cycle.json');
let runtime;
const stage = name => { report.phase = name; process.stdout.write('MetaMorpho: ' + name + '\n'); };
const read = async (fixture, contract, method, args = []) => (await fixture.read(contract, method, args))[0];
try {
  runtime = await createOwnedLocalEvmV2(); stage('official-protocol-bootstrap');
  const fixture = await createOfficialProtocolFixture(runtime), sender = runtime.accounts[0];
  stage('official-uniswap-exact-output');
  const inputBefore = await read(fixture, fixture.first, 'balanceOf', [sender]);
  const outputBefore = await read(fixture, fixture.second, 'balanceOf', [sender]);
  await fixture.send(fixture.first, 'approve', [fixture.swapRouter.address, 2000n]);
  await fixture.send(fixture.swapRouter, 'exactOutputSingle', [[fixture.first.address, fixture.second.address,
    3000, sender, (await runtime.time()) + 120n, 1000n, 2000n, 0]]);
  const inputSpent = inputBefore - await read(fixture, fixture.first, 'balanceOf', [sender]);
  assert.ok(inputSpent > 0n && inputSpent <= 2000n);
  assert.equal(await read(fixture, fixture.second, 'balanceOf', [sender]) - outputBefore, 1000n);
  await fixture.send(fixture.first, 'approve', [fixture.swapRouter.address, 0n]);
  report.checks.officialUniswapExactOutputBounded = true;
  stage('official-deposit');
  const assets = 1_000_000_000n;
  await fixture.send(fixture.first, 'approve', [fixture.vault.address, assets]);
  const deposit = await fixture.send(fixture.vault, 'deposit', [assets, sender]);
  await runtime.assertCanonical(deposit);
  const initialShares = await read(fixture, fixture.vault, 'balanceOf', [sender]);
  assert.ok(initialShares > 0n); assert.equal(await read(fixture, fixture.vault, 'totalAssets'), assets);
  assert.equal(await read(fixture, fixture.first, 'allowance', [sender, fixture.vault.address]), 0n);
  report.checks.officialDepositBacked = true;
  stage('bounded-redemption-bootstrap');
  const adapter = await createOwnedMetaMorphoVault({ runtime, protocolFixture: fixture });
  const shares = initialShares / 2n, preview = await read(fixture, fixture.vault, 'previewRedeem', [shares]);
  const intent = { reference: randomBytes(32).toString('hex'), kind: 'redeem', amount: shares.toString(),
    minimumOutput: (preview * 995n / 1000n).toString(), deadline: ((await runtime.time()) + 250n).toString() };
  stage('atomic-minimum-and-expiry-rejection');
  const router = adapter.metadata.routerAddress;
  await fixture.send(fixture.vault, 'approve', [router, shares]);
  const bounded = await import('@lianum/engine/cohorts/private-cohort-public-native');
  const selector = bounded.publicKeccak256(Buffer.from('redeem(uint128,uint128,uint64,bytes32)')).subarray(0, 4).toString('hex');
  const calldata = (minimum, deadline) => '0x' + selector + [shares, minimum, deadline]
    .map(value => BigInt(value).toString(16).padStart(64, '0')).join('') + randomBytes(32).toString('hex');
  const failureBefore = await adapter.observe();
  await runtime.send('metamorpho-minimum-atomic-revert', { from: sender, to: router,
    data: calldata(preview + 1n, (await runtime.time()) + 100n) }, '0x0', 'EXIT_MINIMUM');
  await runtime.send('metamorpho-expired-atomic-revert', { from: sender, to: router,
    data: calldata(1n, await runtime.time()) }, '0x0', 'EXIT_DEADLINE');
  assert.deepEqual((await adapter.observe()).balances, failureBefore.balances);
  await fixture.send(fixture.vault, 'approve', [router, 0n]);
  report.checks.contractMinimumAndExpiryAtomicRevert = true;
  await assert.rejects(adapter.prepareOnce({ ...intent, minimumOutput: (preview + 1n).toString() }), /MINIMUM_ABOVE_PREVIEW/);
  await assert.rejects(adapter.prepareOnce({ ...intent, deadline: (await runtime.time()).toString() }), /DEADLINE_WINDOW/);
  const original = await adapter.prepareOnce(intent); assert.equal(original.phase, 'PREPARED');
  await assert.rejects(adapter.prepareOnce({ ...intent, amount: (shares - 1n).toString() }), /INTENT_REBOUND/);
  report.checks.invalidQuoteAndRebindingRejected = true;
  stage('redeem-original-once');
  const before = await adapter.observe(), start = runtime.transactions.length;
  const completed = await adapter.execute(intent.reference); assert.equal(completed.phase, 'OBSERVED');
  assertOwnedMetaMorphoReceipt(adapter, completed);
  await assert.rejects(Promise.resolve().then(() => assertOwnedMetaMorphoReceipt(adapter, { ...completed })), /ORIGINAL_RECEIPT/);
  const after = await adapter.observe();
  assert.equal(BigInt(before.balances.senderShares) - BigInt(after.balances.senderShares), shares);
  assert.equal(BigInt(after.balances.senderAssets) - BigInt(before.balances.senderAssets), BigInt(completed.execution.confirmation.assets));
  assert.equal(after.balances.routerShares, '0'); assert.equal(completed.privateSpendable, false);
  report.checks.originalSharesRedeemedAndUnderlyingObserved = true;
  stage('surviving-keeper-reopen-and-replay');
  await adapter.reopen(); await adapter.prepareOnce(intent); await adapter.reconcile(intent.reference); await adapter.execute(intent.reference);
  assert.equal(runtime.transactions.length - start, 2, 'ONE_APPROVAL_ONE_REDEMPTION');
  const replayCall = runtime.transactions.at(-1).request;
  await runtime.send('metamorpho-replay-rejected', replayCall, '0x0', 'EXIT_REPLAY');
  const replayAfter = await adapter.observe(); assert.deepEqual(replayAfter.balances, after.balances);
  report.checks.survivingKeeperReopenDoesNotResend = true; report.checks.contractReplayAtomicRevert = true;
  report.accepted = { officialProtocol: 'MetaMorpho', shares: shares.toString(), assets: completed.execution.confirmation.assets,
    wrapper: adapter.metadata, privatePoolExitBridge: 'HOST_REGRESSION_ONLY', processRestart: 'NOT_ESTABLISHED' };
  report.success = true; report.phase = 'accepted';
} catch (error) {
  report.error = { code: /^[A-Z0-9_]+$/.test(error?.message ?? '') ? error.message : (error.code ?? error.name),
    message: String(error.message).slice(0, 1800) }; process.exitCode = 1;
} finally {
  if (runtime) { try { report.cleanup = await runtime.close({ removeScratch: true }); } catch (error) { report.cleanup = { error: error.code ?? error.name }; report.success = false; process.exitCode = 1; } }
  writeFileSync(path, JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  process.stdout.write('Informe: ' + path + '\n');
}
