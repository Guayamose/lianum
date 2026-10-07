/** HOST ONLY: exact synthetic RPC fixtures, never native nodes or proofs. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createPrivateCohortParticipantBindings, readPrivateCohortPublicCursor, capturePrivateCohortPublicChains, PRIVATE_COHORT_PROFILE, PRIVATE_COHORT_CAPTURE_BOUNDS } from '../../src/cohorts/private-cohort-runtime.mjs';
import { base58Encode, signSolanaTransfer } from '../../src/chains/solana/solana-runtime.mjs';
const digest = value => createHash('sha256').update(value).digest();
const h = n => '0x' + n.toString(16).padStart(64, '0');
const a = n => '0x' + n.toString(16).padStart(40, '0');
const s = n => base58Encode(Buffer.alloc(32, n));
function fixture() {
  const calls = [], accounts = Array.from({ length: 9 }, (_, i) => a(i + 1)), seed = Buffer.alloc(32, 3);
  const signed = signSolanaTransfer({ seed, recipient: s(4), recentBlockhash: s(6), lamports: '3000000' });
  const view = recipient => Object.freeze({ genesis: s(8), solver: signed.solver, recipient, transfer() {}, observe() {}, balance() {} });
  const views = [view(s(4)), view(s(5))];
  const txs = [0, 1].map(i => ({ hash: h(20 + i), blockHash: h(10), blockNumber: '0x2', transactionIndex: '0x' + i, input: i ? '0x123456' : '0xabcdef', from: accounts[i], to: accounts[6], value: '0x1', nonce: '0x' + i, r: h(90), s: h(91), v: '0x1', unrelatedPublicLinkage: i === 1 }));
  const evmBlock = { hash: h(10), parentHash: h(9), number: '0x2', timestamp: '0x123456', transactions: txs, gasUsed: '0x42' };
  const receipts = txs.map((tx, i) => ({ transactionHash: tx.hash, blockHash: evmBlock.hash, blockNumber: '0x2', transactionIndex: '0x' + i, status: '0x1', from: tx.from, to: tx.to, logs: [{ address: tx.to, topics: [h(80 + i)], data: '0xabcd', logIndex: '0x0' }] }));
  const rawBlockHex = Buffer.alloc(81, 1).toString('hex'), btcHash = Buffer.from(digest(digest(Buffer.from(rawBlockHex.slice(0, 160), 'hex')))).reverse().toString('hex');
  const btcBlock = { hash: btcHash, previousblockhash: h(7).slice(2), height: 1, time: 1900000000, tx: [{ txid: h(50).slice(2), hex: '0102', vin: [{ txid: h(55).slice(2), vout: 0, sequence: 42 }], vout: [{ value: 0.001, n: 0, scriptPubKey: { hex: '0014abcd', address: 'synthetic-regtest-address' } }, { value: 0.002, n: 1, scriptPubKey: { hex: '0014eeee', address: 'shared-change-linkage' } }] }] };
  const solMeta = { err: null, fee: 5000, preBalances: [10000000, 0, 1], postBalances: [6995000, 3000000, 1], innerInstructions: [], logMessages: ['public-system-transfer'], loadedAddresses: { writable: [], readonly: [] } };
  const rawSol = { blockhash: s(10), previousBlockhash: s(9), parentSlot: 9, blockTime: 1900000001, blockHeight: 10, rewards: [{ pubkey: 'public-validator-linkage', lamports: 1 }], transactions: [{ transaction: [signed.transactionBase64, 'base64'], meta: solMeta, version: 'legacy' }] };
  const decodedSol = { ...structuredClone(rawSol), transactions: [{ transaction: { signatures: [signed.signature], message: { accountKeys: [signed.solver, signed.recipient, '11111111111111111111111111111111'], instructions: [{ programIdIndex: 2, accounts: [0, 1], data: 'public-instruction' }], recentBlockhash: signed.recentBlockhash } }, meta: structuredClone(solMeta), version: 'legacy' }] };
  const lastSol = { blockhash: s(12), previousBlockhash: s(10), parentSlot: 10, blockTime: 1900000002, blockHeight: 11, rewards: [], transactions: [] };
  const state = { evmBlock, receipts, btcBlock, rawBlockHex, rawSol, decodedSol, lastSol, slots: [10, 12], firstAvailable: 9, finalized: 12, evmGenesis: h(1), btcGenesis: h(7).slice(2), solGenesis: s(8) };
  const runtime = {
    accounts, metadata: { classification: 'OWNED_LOCAL_RUNTIMES_ONLY', freshSyntheticWallets: true, cohortProfile: { name: PRIVATE_COHORT_PROFILE, accountCount: 9 }, chainId: '31337', evmGenesis: state.evmGenesis, bitcoinGenesis: state.btcGenesis, bitcoinNetwork: 'regtest', bitcoinNetworkActive: false, bitcoinPeers: 0 },
    async evm(method, params = []) { calls.push({ chain: 'evm', method, params });
      if (method === 'eth_chainId') return '0x7a69';
      if (method === 'eth_blockNumber') return '0x2';
      if (method === 'eth_getBlockByNumber') return structuredClone(params[0] === '0x0' ? { hash: state.evmGenesis } : state.evmBlock);
      if (method === 'eth_getTransactionReceipt') return structuredClone(state.receipts.find(receipt => receipt.transactionHash === params[0]));
      throw Error('UNEXPECTED_EVM_RPC:' + method);
    },
    async btc(method, params = []) { calls.push({ chain: 'btc', method, params });
      if (method === 'getblockhash') return params[0] === 0 ? state.btcGenesis : state.btcBlock.hash;
      if (method === 'getblockchaininfo') return { chain: 'regtest' };
      if (method === 'getnetworkinfo') return { networkactive: false, connections: 0 };
      if (method === 'getblockcount') return 1;
      if (method === 'getblock') return structuredClone(params[1] === 0 ? state.rawBlockHex : state.btcBlock);
      throw Error('UNEXPECTED_BTC_RPC:' + method);
    },
  };
  const solana = { genesis: state.solGenesis, solver: signed.solver, recipientView: index => views[index], metadata: { binding: '127.0.0.1', cohortProfile: { name: PRIVATE_COHORT_PROFILE, recipientCount: 2, registeredRecipients: views.map(view => view.recipient) }, resourceProfile: { name: 'PC23_BOUNDED_LEDGER_V1' }, ledgerRetention: { effectiveShreds: 1000000 }, slotTiming: { effectiveTicksPerSlot: 64 } },
    async readPublic(method, params = []) { calls.push({ chain: 'sol', method, params });
      if (method === 'getGenesisHash') return state.solGenesis;
      if (method === 'getSlot') return state.finalized;
      if (method === 'getFirstAvailableBlock') return state.firstAvailable;
      if (method === 'minimumLedgerSlot') return 0;
      if (method === 'getBlocks') return state.slots.slice();
      if (method === 'getBlock') return structuredClone(params[0] === 12 ? state.lastSol : params[1].encoding === 'json' ? state.decodedSol : state.rawSol);
      throw Error('UNEXPECTED_SOL_RPC:' + method);
    },
  };
  const input = { runtime, solana, from: { evm: 2, bitcoin: 1, solana: 10 }, to: { evm: 2, bitcoin: 1, solana: 12 } };
  return { input, runtime, solana, views, accounts, calls, state };
}
test('two fixed owners, four payout recipients, common relayer and separate authorities use nine distinct local accounts', () => {
  const f = fixture(), binding = createPrivateCohortParticipantBindings(f);
  assert.equal(binding.profile, PRIVATE_COHORT_PROFILE); assert.equal(binding.commonRelayer, f.accounts[6]); assert.deepEqual(binding.authorities, { sol: f.accounts[7], btc: f.accounts[8] });
  assert.deepEqual(binding.participant(0).payoutAccounts, { sol: f.accounts[2], btc: f.accounts[3] }); assert.deepEqual(binding.participant(1).payoutAccounts, { sol: f.accounts[4], btc: f.accounts[5] });
  for (const index of [0, 1]) { const p = binding.participant(index); assert.equal(p.depositAccount, f.accounts[index]); assert.equal(p.exitAccount, f.accounts[index]); assert.equal(p.relayerAccount, f.accounts[6]); assert.equal(p.solana, f.views[index]); assert.ok(Object.isFrozen(p)); }
  assert.equal(binding.observerModel.externalAnonymitySetClaim, false); assert.equal(binding.observerModel.sharedSolanaNativeSolver, true); assert.equal(binding.observerModel.sharedBitcoinSolverWallet, true);
  assert.equal(f.calls.length, 0); for (const index of [-0, -1, 2, '0', null, NaN]) assert.throws(() => binding.participant(index), /PARTICIPANT_INDEX/);
  f.accounts[0] = a(50); assert.equal(binding.participant(0).depositAccount, a(1));
});
test('binding rejects defaults, reused addresses, changed recipient registration and resource profile', () => {
  for (const mutate of [f => { delete f.runtime.metadata.cohortProfile; }, f => { f.runtime.accounts[0] = f.runtime.accounts[1]; }, f => { f.solana.metadata.cohortProfile.registeredRecipients.reverse(); }, f => { f.solana.metadata.ledgerRetention.effectiveShreds = 10000; }, f => { f.solana.metadata.slotTiming.effectiveTicksPerSlot = 16; }, f => { f.solana.metadata.binding = '0.0.0.0'; }]) { const f = fixture(); mutate(f); assert.throws(() => createPrivateCohortParticipantBindings(f)); }
});
test('public cursor reads only the owned chain tips and exact chain identities', async () => { const f = fixture(); assert.deepEqual(await readPrivateCohortPublicCursor(f), { evm: 2, bitcoin: 1, solana: 12 }); assert.ok(f.calls.every(call => /^(eth_(get|block|chain)|get)/.test(call.method))); });
test('all-transaction capture preserves full raw and decoded public linkage without route filtering', async () => {
  const f = fixture(), capture = await capturePrivateCohortPublicChains(f.input);
  assert.equal(capture.kind, 'PRIVATE_COHORT_FULL_PUBLIC_CHAIN_CAPTURE'); assert.equal(capture.coverage.complete, true); assert.equal(capture.coverage.transactionFiltering, false); assert.equal(capture.coverage.transactions, 4);
  assert.deepEqual(capture.evm.blocks[0].block, f.state.evmBlock); assert.deepEqual(capture.evm.blocks[0].receipts, f.state.receipts);
  assert.equal(capture.evm.blocks[0].block.transactions[1].unrelatedPublicLinkage, true);
  assert.equal(capture.bitcoin.blocks[0].rawBlockHex, f.state.rawBlockHex); assert.deepEqual(capture.bitcoin.blocks[0].block.tx[0].vin, f.state.btcBlock.tx[0].vin); assert.equal(capture.bitcoin.blocks[0].block.tx[0].vout[1].scriptPubKey.address, 'shared-change-linkage');
  assert.deepEqual(capture.solana.blocks[0].block, f.state.rawSol); assert.deepEqual(capture.solana.blocks[0].decodedBlock, f.state.decodedSol); assert.deepEqual(capture.solana.slots, [10, 12]);
  assert.match(capture.contentSHA256, /^[0-9a-f]{64}$/); assert.ok(capture.coverage.retainedRecordBytes > 1000);
  const forbidden = /send|mine|transfer|generate|invalidate|set|stop|create/i; assert.ok(f.calls.every(call => !forbidden.test(call.method)));
  const fetched = f.calls.filter(call => call.method === 'getBlock' && call.params[1].transactionDetails === 'full'); assert.equal(fetched.length, 4); assert.ok(fetched.every(call => call.params[1].rewards === true));
  f.state.evmBlock.transactions[0].input = '0x'; assert.equal(capture.evm.blocks[0].block.transactions[0].input, '0xabcdef');
});
for (const [label, mutate, expected] of [
  ['EVM substituted transaction block', f => { f.state.evmBlock.transactions[0].blockHash = h(88); }, /TRANSACTION_BLOCK/],
  ['EVM missing receipt', f => { f.state.receipts.length = 0; }, /EVM_RECEIPT/],
  ['EVM stripped logs', f => { delete f.state.receipts[0].logs; }, /FULL_EVM_LOGS/],
  ['BTC wrong raw block', f => { f.state.rawBlockHex = Buffer.alloc(81, 2).toString('hex'); }, /BTC_RAW_HEADER/],
  ['BTC stripped inputs', f => { delete f.state.btcBlock.tx[0].vin; }, /FULL_BTC_TRANSACTIONS/],
  ['SOL pruned range', f => { f.state.firstAvailable = 11; }, /CAPTURE_PRUNED/],
  ['SOL unfinalized end', f => { f.state.finalized = 11; }, /NOT_FINALIZED/],
  ['SOL missing intermediate block', f => { f.state.lastSol.parentSlot = 11; }, /SKIPPED_BLOCK/],
  ['SOL decoded signature substitution', f => { f.state.decodedSol.transactions[0].transaction.signatures = [s(4)]; }, /WIRE_IDENTITY/],
  ['SOL stripped native metadata', f => { delete f.state.decodedSol.transactions[0].meta.preBalances; }, /FULL_META/],
  ['SOL duplicate slot', f => { f.state.slots = [10, 10, 12]; }, /SLOT_COVERAGE/],
  ['SOL off-range slot', f => { f.state.slots = [9, 10, 12]; }, /SLOT_COVERAGE/],
  ['wrong EVM genesis', f => { f.state.evmGenesis = h(88); }, /PUBLIC_EVM_GENESIS/],
  ['wrong BTC genesis', f => { f.state.btcGenesis = h(88).slice(2); }, /PUBLIC_BTC_GENESIS/],
  ['wrong SOL genesis', f => { f.state.solGenesis = s(88); }, /PUBLIC_SOLANA_GENESIS/],
]) test('incomplete or substituted capture fails closed: ' + label, async () => { const f = fixture(); mutate(f); await assert.rejects(capturePrivateCohortPublicChains(f.input), expected); });
test('EVM reorg and SOL changing coverage after reads cannot report complete', async () => {
  const e = fixture(), evm = e.runtime.evm; let blockReads = 0; e.runtime.evm = async (method, params) => { const out = await evm(method, params); if (method === 'eth_getBlockByNumber' && params[0] === '0x2' && ++blockReads > 1) out.hash = h(77); return out; };
  await assert.rejects(capturePrivateCohortPublicChains(e.input), /EVM_CAPTURE_REORG/);
  const s = fixture(), read = s.solana.readPublic; let slotReads = 0; s.solana.readPublic = async (method, params) => { const out = await read(method, params); return method === 'getBlocks' && ++slotReads > 1 ? [10] : out; };
  await assert.rejects(capturePrivateCohortPublicChains(s.input), /SOLANA_COVERAGE_CHANGED/);
});
test('bounds and unknown selector/filter fields reject before the first RPC instead of truncating data', async () => {
  for (const mutate of [f => { f.input.to.evm = PRIVATE_COHORT_CAPTURE_BOUNDS.evmBlocks + f.input.from.evm; }, f => { f.input.from.bitcoin = 2; }, f => { f.input.from.solana = -0; }, f => { f.input.to.solana = '12'; }, f => { f.input.recipient = 'filter'; }, f => { f.input.to.extra = 1; }]) { const f = fixture(); mutate(f); await assert.rejects(capturePrivateCohortPublicChains(f.input)); assert.equal(f.calls.length, 0); }
});
