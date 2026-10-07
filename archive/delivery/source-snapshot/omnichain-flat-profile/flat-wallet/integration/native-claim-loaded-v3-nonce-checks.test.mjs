/** Execute the exact new two-wire checker with synthetic decode/inventory
 * ports. No key, signing operation, native runtime or chain observation. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const source = readFileSync(new URL('./native-claim-loaded-v3-nonce-checks.mjs', import.meta.url), 'utf8');
const body = source.slice(source.indexOf('export function checkClaimLoadedV3Transfers')).replace(/^export /, '');
function fixture() {
  const roles = Object.fromEntries(['depositor', 'escrow', 'recipient'].map(role => [role, { endpoint: role + '-endpoint' }]));
  const initial = { accounts: ['depositor', 'escrow', 'recipient'].map(role => ({ role, total: '10000000' })),
    nonceInfrastructureByAuthority: Object.fromEntries(['depositor', 'escrow'].map(role => [role, { nonceAccount: { durableNonce: role + '-0' } }])) };
  const pins = Object.fromEntries(['depositor', 'escrow'].map(role => [role, { nonceAccountPublicKey: role + '-account', nonceAccount: { durableNonce: role + '-1' } }]));
  const final = { accounts: [{ role: 'depositor', total: '6995000' }, { role: 'escrow', total: '9995000' }, { role: 'recipient', total: '13000000' }],
    feeAudit: { actualFees: '10000', escrowActualFees: '5000' }, nativeHead: { slot: '80' } };
  const transfers = ['deposit', 'redeem'].map((route, i) => {
    const role = i ? 'escrow' : 'depositor';
    const intent = { lamports: '3000000', sourcePublicKey: roles[role].endpoint,
      recipientPublicKey: roles[i ? 'recipient' : 'escrow'].endpoint, nonceAccountPublicKey: pins[role].nonceAccountPublicKey, durableNonce: role + '-0' };
    const row = { route, intent, nativeId: 'synthetic-native-' + i, transactionSHA256: String(i).repeat(64), nativeWire: 'synthetic-wire-' + i,
      phase: 'OBSERVED_FINALIZED', broadcastAttempts: 1 };
    row.observation = { nativeId: row.nativeId, nativeWire: row.nativeWire, transactionSHA256: row.transactionSHA256, intent: structuredClone(intent), transactionSlot: '70' };
    return row;
  });
  const native = { roles, transfers }, config = {}; let inventoryCalls = 0, decodedCalls = 0;
  const check = vm.runInThisContext('(function({assert,checkClaimGraphV3Inventory,validateSolanaNonceBindingTransaction}) {' + body + '; return checkClaimLoadedV3Transfers;})')({ assert,
    checkClaimGraphV3Inventory(i, n, c) { inventoryCalls++; assert.equal(i, final); assert.equal(n, native); assert.equal(c, config); return pins; },
    validateSolanaNonceBindingTransaction(wire, intent) {
      decodedCalls++; const i = Number(wire.slice(-1)); assert.ok(i === 0 || i === 1); assert.equal(intent, transfers[i].intent);
      return { signatureHex: transfers[i].nativeId, transactionSHA256: transfers[i].transactionSHA256,
        wireBindingVersion: '2', effectIndex: '1', wireBindingPosition: '2' };
    } });
  return { initial, final, native, config, pins, run: () => check(initial, final, native, config), counts: () => [inventoryCalls, decodedCalls] };
}
test('loaded V3 nonce checker requires one original full deposit and redemption with independent original nonces and exact fees', () => {
  const f = fixture(); assert.deepEqual(f.run(), { nonceAdvancedWithObservedIngress: true, nonceAdvancedWithObservedPayout: true });
  assert.deepEqual(f.counts(), [1, 2]);
});
test('loaded V3 nonce checker rejects old five-effect graphs, relabelled amounts, changed original identities and accounting', () => {
  for (const mutate of [
    f => f.native.transfers.push(structuredClone(f.native.transfers[1])), f => f.native.transfers[1].route = 'refund',
    f => f.native.transfers[1].intent.lamports = '1800000', f => f.native.transfers[1].nativeId = f.native.transfers[0].nativeId,
    f => f.native.transfers[1].broadcastAttempts = 2, f => f.native.transfers[1].phase = 'BROADCAST',
    f => f.native.transfers[0].observation.nativeWire = 'changed', f => f.native.transfers[0].intent.sourcePublicKey = f.native.roles.escrow.endpoint,
    f => f.native.transfers[1].intent.nonceAccountPublicKey = f.pins.depositor.nonceAccountPublicKey,
    f => f.native.transfers[1].intent.durableNonce = 'newly-renewed', f => f.pins.escrow.nonceAccount.durableNonce = 'escrow-0',
    f => f.final.nativeHead.slot = '60', f => f.final.accounts[0].total = '7000000', f => f.final.accounts[1].total = '10000000',
    f => f.final.accounts[2].total = '11800000',
  ]) { const f = fixture(); mutate(f); assert.throws(f.run); }
});
