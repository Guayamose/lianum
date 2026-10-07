/** Signed synthetic codec/inventory examples, never actual finality. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, createPrivateKey, createPublicKey, sign } from 'node:crypto';
import { nativeClaimEndpointCommitment } from '../../wallet-platform/modules/native-claims/framing.mjs';
import { ownedCustodyFeeAudit } from '../../wallet-platform/modules/chain-adapters/owned-native-custody.mjs';
import { encodeSolanaNonceBindingMessage, encodeSolanaNonceBootstrapMessage,
  validateSolanaNonceBindingTransaction, validateSolanaNonceBootstrapTransaction }
  from '../../wallet-platform/modules/chain-adapters/owned-solana-nonce-binding.mjs';
import { checkClaimGraphV3Inventory, checkClaimGraphV3Bootstrap, checkClaimGraphV3Transfers } from '../native-claim-graph-v3-nonce-checks.mjs';
const hash = value => createHash('sha256').update(String(value)).digest('hex');
const key = byte => createPrivateKey({ key: Buffer.from('302e020100300506032b657004220420' + byte.repeat(32), 'hex'), type: 'pkcs8', format: 'der' });
const pub = key => createPublicKey(key).export({ type: 'spki', format: 'der' }).subarray(-32).toString('hex');
function signed(message, keys) { const bytes = Buffer.from(message, 'hex'); return Buffer.concat([Buffer.from([keys.length]), ...keys.map(k => sign(null, bytes, k)), bytes]).toString('base64'); }
export function fixture() {
  const keys = { depositor: key('01'), escrow: key('02'), recipient: key('03') };
  const roles = Object.fromEntries(Object.entries(keys).map(([role, k]) => [role, { endpoint: pub(k), address: 'synthetic-' + role }]));
  const config = { nativeFamily: '2', nativeGenesis: hash('genesis'), nativeAsset: hash('asset') };
  config.escrowEndpointCommitment = nativeClaimEndpointCommitment({ family: '2', genesis: config.nativeGenesis, asset: config.nativeAsset, endpoint: roles.escrow.endpoint });
  const infrastructure = {}, pins = {}, bootstrap = {};
  for (const [index, role] of ['depositor', 'escrow'].entries()) {
    const payer = key(index ? '06' : '04'), nonce = key(index ? '07' : '05');
    const intent = { payerPublicKey: pub(payer), nonceAccountPublicKey: pub(nonce), authorityPublicKey: roles[role].endpoint,
      recentBlockhash: hash('bootstrap-' + role), rentLamports: '1447680' };
    const nativeWire = signed(encodeSolanaNonceBootstrapMessage(intent), [payer, nonce]);
    const decoded = validateSolanaNonceBootstrapTransaction(nativeWire, intent);
    const pin = pins[role] = { classification: 'SYNTHETIC_NONCE_INFRASTRUCTURE_NOT_USER_BACKING', genesisGrant: '5000000',
      payerPublicKey: pub(payer), nonceAccountPublicKey: pub(nonce), authorityPublicKey: roles[role].endpoint,
      bootstrapNativeId: decoded.signatureHex, bootstrapTransactionSHA256: decoded.transactionSHA256,
      bootstrapRentLamports: intent.rentLamports, bootstrapFeeLamports: '10000', bootstrapBroadcastAttempts: 1 };
    infrastructure[role] = { ...pin, payerBalance: '3542320', nonceRentExemptMinimum: '1447680',
      nonceAccount: { publicKey: pub(nonce), owner: '0'.repeat(64), executable: false, lamports: '1447680',
        authorityPublicKey: roles[role].endpoint, durableNonce: hash(role + '-nonce-0'), lamportsPerSignature: '5000' } };
    bootstrap[role] = { authorityRole: role, intent, nativeWire, nativeId: decoded.signatureHex, transactionSHA256: decoded.transactionSHA256,
      phase: 'OBSERVED_FINALIZED', broadcastAttempts: 1, preparedFee: '10000', observation: { nativeId: decoded.signatureHex,
        nativeWire, transactionSHA256: decoded.transactionSHA256, intent: structuredClone(intent), genesis: config.nativeGenesis,
        feeLamports: '10000', sourceBefore: '5000000', sourceAfter: '3542320', recipientBefore: '0', recipientAfter: '1447680' } };
  }
  const accounts = Object.entries(roles).map(([role, value]) => ({ role, ...value, exists: true, total: '10000000', spendable: '10000000', rentExemptMinimum: '890880' }));
  const initial = { family: '2', genesis: config.nativeGenesis, asset: config.nativeAsset, nativeHead: { id: hash('head0'), height: '50', slot: '60' },
    accounts, escrow: structuredClone(accounts[1]), finality: 'finalized', signingUnresolved: false,
    syntheticPrefunding: { classification: 'SYNTHETIC_LOCAL_FEE_SURPLUS_NOT_USER_BACKING', amount: '10000000' },
    feeAudit: ownedCustodyFeeAudit([]), nonceInfrastructureByAuthority: infrastructure };
  const native = { roles, nonceBootstrapByAuthority: bootstrap, nonceInfrastructureByAuthority: pins, transfers: [] };
  const final = structuredClone(initial), counts = { depositor: 0, escrow: 0 };
  for (const [i, [route, amount]] of [['deposit', '3000000'], ['redeem', '1800000'], ['redeem', '1200000'], ['deposit', '2000000'], ['refund', '2000000']].entries()) {
    const role = route === 'deposit' ? 'depositor' : 'escrow', target = route === 'deposit' ? 'escrow' : route === 'refund' ? 'depositor' : 'recipient';
    const intent = { sourcePublicKey: roles[role].endpoint, recipientPublicKey: roles[target].endpoint,
      nonceAccountPublicKey: pins[role].nonceAccountPublicKey, durableNonce: hash(role + '-nonce-' + counts[role]++),
      lamports: amount, wireKeyCommitment: hash('K' + i) };
    const nativeWire = signed(encodeSolanaNonceBindingMessage(intent), [keys[role]]), decoded = validateSolanaNonceBindingTransaction(nativeWire, intent);
    native.transfers.push({ route, intent, nativeWire, nativeId: decoded.signatureHex, transactionSHA256: decoded.transactionSHA256,
      phase: 'OBSERVED_FINALIZED', broadcastAttempts: 1, preparedFee: '5000', observation: { nativeId: decoded.signatureHex, nativeWire,
        transactionSHA256: decoded.transactionSHA256, intent: structuredClone(intent), feeLamports: '5000', transactionSlot: String(61 + i) } });
    for (const [name, delta] of [[role, -BigInt(amount) - 5000n], [target, BigInt(amount)]]) {
      const a = final.accounts.find(a => a.role === name); a.total = String(BigInt(a.total) + delta); a.spendable = a.total;
    }
  }
  final.escrow = structuredClone(final.accounts[1]); final.nativeHead = { id: hash('head1'), height: '60', slot: '70' };
  for (const role of ['depositor', 'escrow']) final.nonceInfrastructureByAuthority[role].nonceAccount.durableNonce = hash(role + '-nonce-' + counts[role]);
  final.feeAudit = ownedCustodyFeeAudit(native.transfers.map(row => ({ nativeId: row.nativeId, route: row.route, phase: row.phase,
    amount: row.intent.lamports, preparedFee: row.preparedFee, actualFee: row.observation.feeLamports, broadcastAttempts: row.broadcastAttempts })));
  return { native, initial, final, config };
}
test('two signed bootstraps and exact five-effect full path retain principal/fee separation', () => {
  const f = fixture(), result = checkClaimGraphV3Bootstrap(f.initial, f.native, f.config);
  assert.equal(result.independentBootstrapCount, 2); assert.equal(result.infrastructureAccountCount, 4);
  assert.deepEqual(checkClaimGraphV3Transfers(f.initial, f.final, f.native, f.config), { nonceAdvancedWithObservedIngress: true, nonceAdvancedWithObservedPayout: true });
});
test('missing/mutated bootstrap, old one-nonce shape, mixed fees and grants cannot satisfy V3', () => {
  for (const mutate of [
    f => delete f.initial.nonceInfrastructureByAuthority.depositor,
    f => { f.initial.nonceInfrastructure = f.initial.nonceInfrastructureByAuthority.escrow; delete f.initial.nonceInfrastructureByAuthority; },
    f => f.initial.nonceInfrastructureByAuthority.depositor.payerBalance = '3542321',
    f => f.initial.nonceInfrastructureByAuthority.depositor.authorityPublicKey = f.native.roles.escrow.endpoint,
    f => f.native.nonceBootstrapByAuthority.depositor.observation.nativeWire += 'A',
    f => f.native.nonceBootstrapByAuthority.depositor.broadcastAttempts = 2,
    f => f.native.nonceBootstrapByAuthority.depositor.observation.sourceAfter = '0',
    f => f.initial.accounts[1].total = '15000000',
    f => f.initial.feeAudit = { ...f.initial.feeAudit, actualFees: '10000' },
  ]) { const f = fixture(); mutate(f); assert.throws(() => checkClaimGraphV3Bootstrap(f.initial, f.native, f.config)); }
});
test('incorrect source nonce, wire, order, amount, observation, duplicate or final balance rejects', () => {
  for (const mutate of [
    f => f.native.transfers[0].intent.nonceAccountPublicKey = f.native.nonceInfrastructureByAuthority.escrow.nonceAccountPublicKey,
    f => f.native.transfers[0].intent.durableNonce = hash('different'),
    f => f.native.transfers[0].nativeWire += 'A', f => f.native.transfers.reverse(),
    f => f.native.transfers[0].intent.lamports = '3000001', f => f.native.transfers[0].phase = 'BROADCAST_UNKNOWN',
    f => f.native.transfers[0].broadcastAttempts = 2, f => f.native.transfers[0].observation.intent.lamports = '0',
    f => f.final.nonceInfrastructureByAuthority.depositor.nonceAccount.durableNonce = f.native.transfers[0].intent.durableNonce,
    f => { f.final.accounts[0].total = '7000000'; f.final.accounts[0].spendable = '7000000'; },
    f => f.final.accounts[2].total = '13000001', f => f.final.nativeHead.slot = '60',
  ]) { const f = fixture(); mutate(f); assert.throws(() => checkClaimGraphV3Transfers(f.initial, f.final, f.native, f.config)); }
});
test('postmint principal cannot pass an empty/final inventory assertion', () => {
  const f = fixture(); f.final.escrow.total = String(BigInt(f.final.escrow.total) + 3000000n);
  f.final.escrow.spendable = f.final.escrow.total; f.final.accounts[1] = structuredClone(f.final.escrow);
  assert.throws(() => checkClaimGraphV3Inventory(f.final, f.native, f.config));
});
