/** Exact terminal collector source over synthetic owned-read ports. No native
 * runtime, key, compiler, proof, RPC, or filesystem fixture is constructed. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import { assertBeginPayoutAuditReceiptV1, CLAIM_BEGIN_PAYOUT_AUDIT_PROFILE_V1 } from '../../../../packages/backend/src/claims/payouts/begin-payout-audit-policy-v1.mjs';
const source = readFileSync(new URL('./native-claim-begin-payout-audit-terminal-v1.mjs', import.meta.url), 'utf8');
const body = source.slice(source.indexOf('const beforeStates')).replaceAll('export ', '');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
function fixture() {
  const calls = [], controller = {}, head = { number: '1', hash: 'head', timestamp: '1' };
  const receipt = { profile: CLAIM_BEGIN_PAYOUT_AUDIT_PROFILE_V1, method: 'BEGIN_PAYOUT', phase: 'BACKING_RETURNED_BEFORE_DISPATCH',
    limitMilliseconds: 30000, originalAuditGuardsPassed: true, selectedSignerCount: 3, originalAuthorizationSHA256: '11'.repeat(32),
    preparedSHA256: '22'.repeat(32), requestSHA256: '33'.repeat(32), originalHeadSHA256: hash(Buffer.from(JSON.stringify(head))) };
  const row = (amount, route) => ({ ...(route ? { route } : {}), intent: { lamports: amount }, phase: 'OBSERVED_FINALIZED', broadcastAttempts: 1,
    nativeId: 'SYNTHETIC_ID', nativeWire: 'SYNTHETIC_WIRE', observation: { sourceAfter: '10', recipientAfter: '1000000' } });
  const bitcoin = { transfers: [], inventory: async () => { calls.push('BTC-inventory'); return {}; } };
  const solana = { transfers: [row('3000000', 'deposit')], roles: {}, inventory: async () => { calls.push('SOL-inventory'); return {}; } };
  const graphBitcoin = { transfers: [] }, graphSolana = { transfers: [row('1000000')], solver: 'solver', recipients: ['recipient'],
    balance: async role => { calls.push('GRAPH-balance'); return role === 'solver' ? '10' : '1000000'; } };
  const view = { head, gateways: [0, 1].map(i => ({ wrapperSupply: '0', pendingRefunds: '0', heldUnissued: '0',
    pendingRedemptions: i ? '3000000' : '0', reservedFees: i ? '5000' : '0', intentCount: String(i), ticketCount: String(i),
    activePayout: '0'.repeat(64), tickets: i ? [{ state: '1', ticket: { kind: '1', amount: '3000000', maxFee: '5000' } }] : [] })) };
  const runtime = { transactions: [{ request: { data: '0xdac84679' } }], ingressSendState: { epoch: '1', busy: false, uncertain: false } };
  const claims = { nativeRuntimes: [bitcoin, solana], configs: [{}, {}], gateways: [{}, { artifact: { evm: { methodIdentifiers: { 'beginPayout(SYNTHETIC)': '8bbd85aa' } } } }] };
  const observer = { read: async () => { calls.push('claim-read'); return view; }, assertCurrent: async () => calls.push('claim-current') };
  const f = { runtime, claims, bitcoin, solana, graphBitcoin, graphSolana, observer };
  const nativeState = { activePrepared: null, activeRoute: null, activeReads: 0, activeMutations: 0,
    operationBusy: false, observationBusy: false, inventoryBusy: false, signingUnresolved: false,
    persistenceFailed: false, isolationFailed: false, adverseHistory: false };
  const env = { assert, structuredClone, Buffer, claimHash: hash, assertBeginPayoutAuditReceiptV1,
    assertOwnedNativeClaimSystem(r, c) { assert.equal(r, runtime); assert.equal(c, claims); },
    assertOwnedClaimObserver(o) { assert.equal(o, observer); }, readOwnedSolanaRuntimeAuditState(n) { assert.equal(n, solana); return nativeState; },
    auditClaimNativeInventory() { return { nativePrincipalAvailable: '3000000' }; },
    ownedNativeClaimControllerBindings(c) { assert.equal(c, controller); return { runtime, claims }; },
    assertOwnedNativeClaimBeginPayoutAuditReceiptV1(c, r) { assert.equal(c, controller); assert.equal(r, receipt); },
  };
  const api = vm.runInThisContext('(function({' + Object.keys(env).join(',') + '}) {' + body
    + '; return { captureBeginPayoutAuditBeforeV1, captureBeginPayoutAuditTerminalV1 }; })')(env);
  return { ...f, f, api, controller, receipt, calls, view, nativeState };
}

test('original owner-bound capture does not warm observations; terminal reads preserve the intentional liability', async () => {
  const x = fixture(); x.api.captureBeginPayoutAuditBeforeV1(x.f, x.controller); assert.deepEqual(x.calls, []);
  const result = await x.api.captureBeginPayoutAuditTerminalV1(x.f, x.controller, x.receipt);
  assert.equal(result.public.pendingRedemptions, '3000000'); assert.equal(result.public.reservedFees, '5000');
  assert.equal(result.public.completedRedemptions, 0); assert.equal(result.public.nativePayoutSendReached, false);
  assert.deepEqual(x.calls, ['claim-read', 'claim-current', 'BTC-inventory', 'SOL-inventory', 'GRAPH-balance', 'GRAPH-balance', 'claim-current']);
  await assert.rejects(x.api.captureBeginPayoutAuditTerminalV1(x.f, x.controller, x.receipt), /ORIGINAL_BEFORE_STATE/);
  assert.throws(() => x.api.captureBeginPayoutAuditBeforeV1(x.f, x.controller), /CAPTURE_ONCE/);
});

test('terminal collector rejects copied receipts and wrong owners before reading, even with matching public bytes', async () => {
  const x = fixture(); x.api.captureBeginPayoutAuditBeforeV1(x.f, x.controller);
  await assert.rejects(x.api.captureBeginPayoutAuditTerminalV1(x.f, x.controller, structuredClone(x.receipt)));
  await assert.rejects(x.api.captureBeginPayoutAuditTerminalV1(x.f, {}, x.receipt)); assert.deepEqual(x.calls, []);
});

test('new EVM/native effects, failed preparation unwind, changed original head and cleared liability all refuse', async () => {
  for (const mutate of [x => x.runtime.transactions.push({ request: { data: '0x8bbd85aa' } }),
    x => x.solana.transfers.push({ route: 'redeem' }), x => x.nativeState.activePrepared = {},
    x => x.nativeState.signingUnresolved = true, x => x.runtime.ingressSendState.epoch = '2',
    x => x.view.head.hash = 'changed', x => x.view.gateways[1].pendingRedemptions = '0',
    x => x.graphSolana.transfers[0].intent.lamports = '3000000']) {
    const x = fixture(); x.api.captureBeginPayoutAuditBeforeV1(x.f, x.controller); mutate(x);
    await assert.rejects(x.api.captureBeginPayoutAuditTerminalV1(x.f, x.controller, x.receipt));
  }
});
