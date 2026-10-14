import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { bitcoinAmountFromSatoshi, bitcoinSatoshiFromAmount, decodeBitcoinTransaction,
  validateBitcoinTransferWire, validateBitcoinTransferObservation, createOwnedBitcoinRuntime,
  BITCOIN_REGTEST_GENESIS, bitcoinRuntimePins } from '../../../../engine/src/chains/bitcoin/bitcoin-runtime.mjs';
import { linuxRuntimePins } from '../../../../engine/src/chains/shared/linux-runtime-pins.mjs';

const digest = bytes => createHash('sha256').update(bytes).digest();
const id = wire => Buffer.from(digest(digest(Buffer.from(wire, 'hex')))).reverse().toString('hex');
const le32 = n => { const b = Buffer.alloc(4); b.writeUInt32LE(n); return b; };
const le64 = n => { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(n)); return b; };
const variable = bytes => Buffer.concat([Buffer.from([bytes.length]), bytes]);
const pub = '0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798';
const sourceScript = '0014' + createHash('ripemd160').update(digest(Buffer.from(pub, 'hex'))).digest('hex');
const recipientScript = '0014' + '12'.repeat(20), changeScript = '0014' + '34'.repeat(20);
// Synthetic format-only witness, deliberately not a Bitcoin signature proof.
const witnessSignature = '300602010102010101';
function wire({ sourceTxid = '00'.repeat(32), sourceVout = 0xffffffff, scriptSig = '00', sequence = 0xffffffff, outputs, witness, locktime = 0, version = 2 }) {
  const input = Buffer.concat([Buffer.from([1]), Buffer.from(sourceTxid, 'hex').reverse(), le32(sourceVout), variable(Buffer.from(scriptSig, 'hex')), le32(sequence)]);
  const output = Buffer.concat([Buffer.from([outputs.length]), ...outputs.map(o => Buffer.concat([le64(o.amountSatoshi), variable(Buffer.from(o.script, 'hex'))]))]);
  return Buffer.concat([le32(version), ...(witness ? [Buffer.from([0, 1])] : []), input, output,
    ...(witness ? [Buffer.from([witness.length]), ...witness.map(item => variable(Buffer.from(item, 'hex')))] : []), le32(locktime)]).toString('hex');
}
function fixture() {
  const previous = wire({ outputs: [{ amountSatoshi: '5000000000', script: sourceScript }] }), sourceTxid = id(previous);
  const intent = { sourceTxid, sourceVout: 0, sourceScript, sourceSatoshi: '5000000000', recipientScript, amountSatoshi: '100000', changeScript, feeSatoshi: '141' };
  const args = { sourceTxid, sourceVout: 0, scriptSig: '', sequence: 0xfffffffe, outputs: [{ amountSatoshi: '100000', script: recipientScript }, { amountSatoshi: '4999899859', script: changeScript }] };
  const unsigned = wire(args), signed = wire({ ...args, witness: [witnessSignature, pub] }), txid = id(unsigned);
  const expected = { intent, txid, rawTransaction: signed, source: 'synthetic-source', recipient: 'synthetic-recipient', changeAddress: 'synthetic-change' };
  const blockhash = '56'.repeat(32), tip = '78'.repeat(32), header = { hash: blockhash, height: 102, confirmations: 6 };
  const observation = { expected, transaction: { hex: signed, txid, blockhash, confirmations: 6 }, sourceTransaction: { hex: previous, txid: sourceTxid }, header, headerAgain: { ...header }, canonical: blockhash, canonicalAgain: blockhash,
    block: { hash: blockhash, height: 102, confirmations: 6, tx: ['90'.repeat(32), txid] }, tipBefore: tip, tipAfter: tip, tipHeader: { hash: tip, height: 107 }, walletTransaction: { hex: signed, txid, fee: -0.00000141 } };
  return { intent, args, previous, unsigned, signed, txid, expected, observation };
}

test('exact Bitcoin decimal bridge handles one satoshi and rejects coercion or rounding', () => {
  for (const n of ['0', '1', '100000', '4999899859', '2100000000000000']) {
    const decimal = bitcoinAmountFromSatoshi(n);
    assert.equal(bitcoinSatoshiFromAmount(decimal), n);
    assert.equal(bitcoinSatoshiFromAmount(Number(decimal)), n);
  }
  for (const value of ['01', 1, 1n, '-1', '1e2', '2100000000000001']) assert.throws(() => bitcoinAmountFromSatoshi(value));
  for (const value of [null, {}, NaN, Infinity, -0, -1, 0.000000001, '1e-8', '0.000000001', '01.1', '21000000.00000001']) assert.throws(() => bitcoinSatoshiFromAmount(value));
});

test('synthetic legacy and SegWit wire preserve exact txid, outputs and funded intent', () => {
  const f = fixture(), unsigned = decodeBitcoinTransaction(f.unsigned), signed = decodeBitcoinTransaction(f.signed);
  assert.equal(unsigned.txid, f.txid); assert.equal(signed.txid, f.txid);
  assert.equal(signed.wtxid, id(f.signed)); assert.notEqual(signed.txid, signed.wtxid);
  assert.equal(signed.unsignedTransaction, f.unsigned);
  assert.equal(signed.vout[0].amountSatoshi, '100000'); assert.equal(signed.vout[1].amountSatoshi, '4999899859');
  assert.deepEqual(validateBitcoinTransferWire(f.unsigned, f.intent), unsigned);
  assert.deepEqual(validateBitcoinTransferWire(f.signed, f.intent, { signed: true }), signed);
  assert.ok(Object.isFrozen(signed.vin[0])); assert.ok(Object.isFrozen(signed.vout));
});

test('wire decoder rejects malformed hex, lengths, flags, trailing bytes and money overflow', () => {
  const f = fixture();
  for (const raw of ['', '00', f.signed.toUpperCase(), f.signed.slice(0, -2), f.signed + '00', f.unsigned.slice(0, 8) + 'fd0100' + f.unsigned.slice(10), f.signed.slice(0, 10) + '02' + f.signed.slice(12),
    wire({ ...f.args, outputs: [{ amountSatoshi: '2100000000000001', script: recipientScript }] }),
    wire({ ...f.args, witness: [] })]) assert.throws(() => decodeBitcoinTransaction(raw));
});

test('funded intent rejects changed source, amount, destination, change, fee and execution shape', () => {
  const f = fixture();
  const mutations = [
    args => { args.sourceTxid = '11'.repeat(32); }, args => { args.sourceVout = 1; }, args => { args.sequence = 0xfffffffd; },
    args => { args.scriptSig = '00'; }, args => { args.version = 1; }, args => { args.locktime = 1; },
    args => { args.outputs[0].amountSatoshi = '100001'; }, args => { args.outputs[0].script = changeScript; },
    args => { args.outputs[1].script = recipientScript; }, args => { args.outputs[1].amountSatoshi = '4999899858'; },
    args => { args.outputs.push({ amountSatoshi: '1', script: sourceScript }); },
  ];
  for (const mutate of mutations) { const args = structuredClone(f.args); mutate(args); assert.throws(() => validateBitcoinTransferWire(wire(args), f.intent)); }
  for (const amountSatoshi of ['0', '-1', '01', '1000000001', 100000]) assert.throws(() => validateBitcoinTransferWire(f.unsigned, { ...f.intent, amountSatoshi }));
  assert.throws(() => validateBitcoinTransferWire(f.unsigned, { ...f.intent, extra: 1 }));
  assert.throws(() => validateBitcoinTransferWire(f.unsigned, { ...f.intent, feeSatoshi: '10001' }));
  assert.throws(() => validateBitcoinTransferWire(f.unsigned, { ...f.intent, sourceVout: -0 }));
});

test('signed intent requires the source public key, two-item witness and SIGHASH_ALL', () => {
  const f = fixture();
  for (const witness of [[witnessSignature, pub, '00'], [witnessSignature], [witnessSignature, '03' + pub.slice(2)], [witnessSignature.slice(0, -2) + '02', pub], ['00', pub]]) {
    assert.throws(() => validateBitcoinTransferWire(wire({ ...f.args, witness }), f.intent, { signed: true }));
  }
  assert.throws(() => validateBitcoinTransferWire(f.signed, f.intent));
  assert.throws(() => validateBitcoinTransferWire(f.unsigned, f.intent, { signed: true }));
});

test('canonical observation binds six confirmations, raw bytes, source, change and fee', () => {
  const f = fixture(), fact = validateBitcoinTransferObservation(f.observation);
  assert.equal(fact.genesis, BITCOIN_REGTEST_GENESIS); assert.equal(fact.finalized, true); assert.equal(fact.confirmations, 6);
  assert.equal(fact.sourceTxid, f.intent.sourceTxid); assert.equal(fact.sourceSatoshi, '5000000000');
  assert.equal(fact.changeSatoshi, '4999899859'); assert.equal(fact.feeSatoshi, '141'); assert.equal(fact.vout, 0); assert.equal(fact.rawTransaction, f.signed);
  const pending = structuredClone(f.observation);
  for (const value of [pending.header, pending.headerAgain, pending.transaction, pending.block]) value.confirmations = 5;
  pending.tipHeader.height = 106; assert.equal(validateBitcoinTransferObservation(pending).finalized, false);
});

test('canonical observation rejects stale/reorged/conflicting or incomplete facts', () => {
  const f = fixture();
  const mutations = [
    x => { x.tipAfter = '11'.repeat(32); }, x => { x.canonicalAgain = '11'.repeat(32); },
    x => { x.headerAgain.confirmations = 7; }, x => { x.headerAgain.height++; }, x => { x.tipHeader.height++; },
    x => { x.transaction.confirmations = 5; }, x => { x.block.height++; }, x => { x.block.hash = '11'.repeat(32); },
    x => { x.block.tx = []; }, x => { x.block.tx.push(x.expected.txid); }, x => { x.transaction.hex = f.unsigned; },
    x => { x.sourceTransaction.hex = f.unsigned; }, x => { x.sourceTransaction.txid = '11'.repeat(32); },
    x => { x.walletTransaction.fee = -0.00000142; }, x => { x.walletTransaction.hex = f.unsigned; },
    x => { x.header.height = -0; }, x => { delete x.transaction.blockhash; },
  ];
  for (const mutate of mutations) { const observation = structuredClone(f.observation); mutate(observation); assert.throws(() => validateBitcoinTransferObservation(observation)); }
});

test('constructor rejects all caller settings before touching any binary or node', async () => {
  for (const options of [{}, { endpoint: 'http://127.0.0.1:1' }, { wallet: 'external' }, { binary: '/tmp/other' }, undefined, () => {}]) {
    await assert.rejects(createOwnedBitcoinRuntime(options), /BITCOIN_FIXED_CONSTRUCTOR/);
  }
  assert.deepEqual(Object.keys(bitcoinRuntimePins), ['bitcoin', 'cli']);
  assert.deepEqual(bitcoinRuntimePins.bitcoin, linuxRuntimePins.bitcoin); assert.deepEqual(bitcoinRuntimePins.cli, linuxRuntimePins.cli);
});

test('standalone adapter statically retains the signing/journal/send boundaries and isolation flags', async () => {
  const source = await readFile(new URL('../../../../engine/src/chains/bitcoin/bitcoin-runtime.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /from ['"].*(?:native-runtime|solana-runtime)|binaries\.(?:solc|anvil)|ownedRuntimeRpc/);
  for (const flag of ['listen=0', 'listenonion=0', 'discover=0', 'dns=0', 'dnsseed=0', 'fixedseeds=0', 'networkactive=0', 'connect=0', 'rpcbind=127.0.0.1', 'rpcallowip=127.0.0.1']) assert.ok(source.includes(flag), flag);
  const before = source.indexOf('await beforeSign('), sign = source.indexOf("await rpc('signrawtransactionwithwallet'"), retain = source.indexOf('await onSigned('), broadcast = source.indexOf("await rpc('sendrawtransaction'");
  assert.ok(before > 0 && before < sign && sign < retain && retain < broadcast);
  assert.equal((source.slice(before, sign).match(/await /g) || []).length, 1);
  assert.equal((source.match(/rpc\('sendrawtransaction'/g) || []).length, 1);
  assert.match(source, /decoded\.unsignedTransaction === funded\.hex/);
  assert.match(source, /confirmationMiningAttempts = 1;\s*await rpc\('generatetoaddress'/);
});
