/** Fixed two-owner synthetic cohort on one trusted host. Internal module only:
 * no HTTP route, arbitrary recipient/key/endpoint override or external anonymity
 * set is provided. Public-chain capture is private operational evidence and must
 * never be emitted wholesale through the client summary or public report. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { NATIVE_PRIVATE_COHORT_PROFILE } from './chains/native-runtime.mjs';
import { SOLANA_PRIVATE_COHORT_PROFILE, SOLANA_BOUNDED_LEDGER_PROFILE, base58Decode, base58Encode } from './chains/solana-runtime.mjs';

export const PRIVATE_COHORT_PROFILE = 'PC24_TWO_OWNER_COHORT_V1';
export const PRIVATE_COHORT_CAPTURE_BOUNDS = Object.freeze({ evmBlocks: 4096, bitcoinBlocks: 2048, solanaSlots: 32768, transactions: 65536, bytes: 64 * 1024 * 1024 });
const immutable = value => { for (const child of Object.values(value)) if (child && typeof child === 'object') immutable(child); return Object.freeze(value); };
const hash = value => createHash('sha256').update(value).digest('hex');
const height = (value, code = 'PC24_PUBLIC_HEIGHT') => { assert.ok(Number.isSafeInteger(value) && value >= 0 && !Object.is(value, -0), code); return value; };
const quantity = value => { assert.match(value, /^0x(?:0|[1-9a-f][0-9a-f]*)$/i, 'PC24_EVM_QUANTITY'); const n = BigInt(value); assert.ok(n <= BigInt(Number.MAX_SAFE_INTEGER), 'PC24_PUBLIC_HEIGHT'); return Number(n); };
const hex = value => '0x' + value.toString(16);
const hash32 = value => assert.match(value, /^(?:0x)?[0-9a-f]{64}$/i, 'PC24_PUBLIC_HASH');
function exact(value, keys, code) { assert.ok(value && Object.getPrototypeOf(value) === Object.prototype, code); assert.deepEqual(Object.keys(value).sort(), [...keys].sort(), code); }
function assertCohortRuntimes(runtime, solana) {
  assert.equal(runtime?.metadata?.classification, 'OWNED_LOCAL_RUNTIMES_ONLY', 'PC24_OWNED_RUNTIME');
  assert.equal(runtime.metadata.freshSyntheticWallets, true, 'PC24_SYNTHETIC_RUNTIME');
  assert.equal(runtime.metadata.cohortProfile?.name, NATIVE_PRIVATE_COHORT_PROFILE, 'PC24_FIXED_NATIVE_PROFILE');
  assert.equal(runtime.metadata.cohortProfile.accountCount, 9, 'PC24_NINE_ACCOUNTS');
  assert.equal(runtime.metadata.chainId, '31337', 'PC24_LOCAL_CHAIN');
  assert.equal(runtime.metadata.bitcoinNetwork, 'regtest', 'PC24_LOCAL_BITCOIN');
  assert.equal(runtime.metadata.bitcoinNetworkActive, false, 'PC24_LOCAL_BITCOIN');
  assert.equal(runtime.metadata.bitcoinPeers, 0, 'PC24_LOCAL_BITCOIN');
  for (const name of ['evm', 'btc']) assert.equal(typeof runtime[name], 'function', 'PC24_NATIVE_READ');
  hash32(runtime.metadata.evmGenesis); hash32(runtime.metadata.bitcoinGenesis);
  assert.equal(solana?.metadata?.cohortProfile?.name, SOLANA_PRIVATE_COHORT_PROFILE, 'PC24_FIXED_SOLANA_PROFILE');
  assert.equal(solana.metadata.cohortProfile.recipientCount, 2, 'PC24_TWO_SOLANA_RECIPIENTS');
  assert.equal(solana.metadata.binding, '127.0.0.1', 'PC24_OWNED_SOLANA_LOOPBACK');
  assert.equal(solana.metadata.resourceProfile?.name, SOLANA_BOUNDED_LEDGER_PROFILE, 'PC24_SOLANA_RESOURCE_PROFILE');
  assert.equal(solana.metadata.ledgerRetention?.effectiveShreds, 1_000_000, 'PC24_SOLANA_RETENTION');
  assert.equal(solana.metadata.slotTiming?.effectiveTicksPerSlot, 64, 'PC24_SOLANA_SLOT_PROFILE');
  for (const name of ['readPublic', 'recipientView']) assert.equal(typeof solana[name], 'function', 'PC24_SOLANA_READ');
  base58Decode(solana.genesis, 32);
}

export function createPrivateCohortParticipantBindings({ runtime, solana }) {
  assertCohortRuntimes(runtime, solana);
  assert.equal(runtime.accounts?.length, 9, 'PC24_NINE_ACCOUNTS');
  const accounts = runtime.accounts.map(account => { assert.match(account, /^0x[0-9a-f]{40}$/i, 'PC24_COHORT_ACCOUNT'); return account.toLowerCase(); });
  assert.equal(new Set(accounts).size, 9, 'PC24_DISTINCT_COHORT_ACCOUNTS');
  // Capture both immutable views before exposing either participant.
  const views = [solana.recipientView(0), solana.recipientView(1)];
  for (const view of views) { assert.equal(view.genesis, solana.genesis, 'PC24_VIEW_GENESIS'); assert.equal(view.solver, solana.solver, 'PC24_VIEW_SOLVER'); base58Decode(view.recipient, 32); }
  assert.notEqual(views[0].recipient, views[1].recipient, 'PC24_DISTINCT_SOLANA_RECIPIENTS');
  assert.deepEqual(solana.metadata.cohortProfile.registeredRecipients, views.map(view => view.recipient), 'PC24_REGISTERED_SOLANA_RECIPIENTS');
  const commonRelayer = accounts[6], authorities = immutable({ sol: accounts[7], btc: accounts[8] });
  const participants = Object.freeze(views.map((view, ownerIndex) => Object.freeze({ ownerIndex, depositAccount: accounts[ownerIndex], exitAccount: accounts[ownerIndex], payoutAccounts: immutable({ sol: accounts[2 + 2 * ownerIndex], btc: accounts[3 + 2 * ownerIndex] }), relayerAccount: commonRelayer, solana: view })));
  const observerModel = immutable({ commonTrustedHost: true, independentOwnerCustodyRequired: true, sharedPoolRequired: true, externalAnonymitySetClaim: false, commonEvmRelayer: true, sharedSolanaNativeSolver: true, sharedBitcoinSolverWallet: true, preservedPublicLinkage: ['SOL solver address and fees', 'BTC funding inputs, change, scripts and amounts', 'EVM transaction senders, calldata, events, amounts and withdrawals', 'public block order and timestamps'] });
  return Object.freeze({ profile: PRIVATE_COHORT_PROFILE, commonRelayer, authorities, participants, observerModel, participant(index) { assert.ok(Number.isSafeInteger(index) && index >= 0 && index < 2 && !Object.is(index, -0), 'PC24_PARTICIPANT_INDEX'); return participants[index]; } });
}

async function assertPublicGenesis(runtime, solana) {
  assert.equal(await runtime.evm('eth_chainId'), '0x7a69', 'PC24_PUBLIC_CHAIN_ID');
  assert.equal((await runtime.evm('eth_getBlockByNumber', ['0x0', false]))?.hash, runtime.metadata.evmGenesis, 'PC24_PUBLIC_EVM_GENESIS');
  assert.equal(await runtime.btc('getblockhash', [0]), runtime.metadata.bitcoinGenesis, 'PC24_PUBLIC_BTC_GENESIS');
  assert.equal((await runtime.btc('getblockchaininfo')).chain, 'regtest', 'PC24_PUBLIC_BTC_NETWORK');
  const network = await runtime.btc('getnetworkinfo'); assert.equal(network.networkactive, false, 'PC24_PUBLIC_BTC_NETWORK'); assert.equal(network.connections, 0, 'PC24_PUBLIC_BTC_NETWORK');
  assert.equal(await solana.readPublic('getGenesisHash'), solana.genesis, 'PC24_PUBLIC_SOLANA_GENESIS');
}
export async function readPrivateCohortPublicCursor({ runtime, solana }) {
  assertCohortRuntimes(runtime, solana); await assertPublicGenesis(runtime, solana);
  return Object.freeze({ evm: quantity(await runtime.evm('eth_blockNumber')), bitcoin: height(await runtime.btc('getblockcount')), solana: height(await solana.readPublic('getSlot', [{ commitment: 'finalized' }])) });
}
function cursor(value) { exact(value, ['evm', 'bitcoin', 'solana'], 'PC24_EXACT_PUBLIC_CURSOR'); for (const n of Object.values(value)) height(n); return structuredClone(value); }
function wireSignatures(entry) {
  assert.ok(Array.isArray(entry?.transaction) && entry.transaction.length === 2 && entry.transaction[1] === 'base64', 'PC24_SOLANA_FULL_WIRE');
  const encoded = entry.transaction[0]; assert.equal(typeof encoded, 'string', 'PC24_SOLANA_FULL_WIRE');
  const wire = Buffer.from(encoded, 'base64'); assert.equal(wire.toString('base64'), encoded, 'PC24_SOLANA_FULL_WIRE');
  let count = 0, offset = 0, shift = 0, byte;
  do { assert.ok(offset < 3 && offset < wire.length, 'PC24_SOLANA_SIGNATURE_COUNT'); byte = wire[offset++]; count |= (byte & 127) << shift; shift += 7; } while (byte & 128);
  assert.ok(count > 0 && count <= 256 && wire.length > offset + count * 64, 'PC24_SOLANA_SIGNATURE_COUNT');
  return Array.from({ length: count }, (_, i) => base58Encode(wire.subarray(offset + i * 64, offset + (i + 1) * 64)));
}

/** Inclusive, all-transaction chain ranges. Missing/pruned data, reorgs or bound
 * overflow throw; they never silently reduce the candidate universe. Caller
 * archives the returned raw result privately before deriving a public report. */
export async function capturePrivateCohortPublicChains(input) {
  exact(input, ['runtime', 'solana', 'from', 'to'], 'PC24_CAPTURE_ARGUMENTS');
  const { runtime, solana } = input, from = cursor(input.from), to = cursor(input.to);
  assertCohortRuntimes(runtime, solana);
  for (const [chain, bound] of [['evm', 'evmBlocks'], ['bitcoin', 'bitcoinBlocks'], ['solana', 'solanaSlots']]) assert.ok(to[chain] >= from[chain] && to[chain] - from[chain] + 1 <= PRIVATE_COHORT_CAPTURE_BOUNDS[bound], 'PC24_PUBLIC_CAPTURE_RANGE');
  await assertPublicGenesis(runtime, solana);
  let bytes = 0, transactionCount = 0;
  const retain = (record, transactions) => {
    bytes += Buffer.byteLength(JSON.stringify(record)); transactionCount += transactions;
    assert.ok(bytes <= PRIVATE_COHORT_CAPTURE_BOUNDS.bytes, 'PC24_PUBLIC_CAPTURE_BYTES');
    assert.ok(transactionCount <= PRIVATE_COHORT_CAPTURE_BOUNDS.transactions, 'PC24_PUBLIC_CAPTURE_TRANSACTIONS');
    return structuredClone(record);
  };
  const evm = { genesis: runtime.metadata.evmGenesis, blocks: [] };
  let previous;
  for (let n = from.evm; n <= to.evm; n++) {
    const block = await runtime.evm('eth_getBlockByNumber', [hex(n), true]);
    assert.ok(block && Array.isArray(block.transactions), 'PC24_FULL_EVM_BLOCK'); hash32(block.hash);
    assert.equal(quantity(block.number), n, 'PC24_EVM_BLOCK_HEIGHT'); if (previous) assert.equal(block.parentHash, previous, 'PC24_EVM_PARENT');
    const receipts = [];
    for (let i = 0; i < block.transactions.length; i++) {
      const tx = block.transactions[i]; assert.ok(tx && typeof tx === 'object', 'PC24_FULL_EVM_TRANSACTION'); hash32(tx.hash);
      assert.equal(tx.blockHash, block.hash, 'PC24_EVM_TRANSACTION_BLOCK'); assert.equal(tx.blockNumber, block.number, 'PC24_EVM_TRANSACTION_HEIGHT'); assert.equal(quantity(tx.transactionIndex), i, 'PC24_EVM_TRANSACTION_ORDER');
      assert.match(tx.input, /^0x(?:[0-9a-f]{2})*$/i, 'PC24_EVM_CALLDATA'); assert.match(tx.from, /^0x[0-9a-f]{40}$/i, 'PC24_EVM_SENDER');
      const receipt = await runtime.evm('eth_getTransactionReceipt', [tx.hash]);
      assert.equal(receipt?.transactionHash, tx.hash, 'PC24_EVM_RECEIPT'); assert.equal(receipt.blockHash, block.hash, 'PC24_EVM_RECEIPT_BLOCK'); assert.equal(receipt.blockNumber, block.number, 'PC24_EVM_RECEIPT_HEIGHT'); assert.equal(quantity(receipt.transactionIndex), i, 'PC24_EVM_RECEIPT_ORDER'); assert.ok(Array.isArray(receipt.logs), 'PC24_FULL_EVM_LOGS');
      receipts.push(receipt);
    }
    evm.blocks.push(retain({ block, receipts }, block.transactions.length)); previous = block.hash;
  }
  assert.equal((await runtime.evm('eth_getBlockByNumber', [hex(to.evm), false]))?.hash, previous, 'PC24_EVM_CAPTURE_REORG');

  const bitcoin = { genesis: runtime.metadata.bitcoinGenesis, blocks: [] }; previous = undefined;
  for (let n = from.bitcoin; n <= to.bitcoin; n++) {
    const blockHash = await runtime.btc('getblockhash', [n]), block = await runtime.btc('getblock', [blockHash, 2]), rawBlockHex = await runtime.btc('getblock', [blockHash, 0]);
    hash32(blockHash); assert.equal(block?.hash, blockHash, 'PC24_BTC_BLOCK_HASH'); assert.equal(block.height, n, 'PC24_BTC_BLOCK_HEIGHT');
    if (previous) assert.equal(block.previousblockhash, previous, 'PC24_BTC_PARENT');
    assert.ok(Array.isArray(block.tx) && block.tx.length > 0 && block.tx.every(tx => tx && typeof tx === 'object' && Array.isArray(tx.vin) && Array.isArray(tx.vout)), 'PC24_FULL_BTC_TRANSACTIONS');
    assert.match(rawBlockHex, /^(?:[0-9a-f]{2}){81,}$/i, 'PC24_BTC_RAW_BLOCK');
    const header = Buffer.from(rawBlockHex.slice(0, 160), 'hex'), headerHash = Buffer.from(createHash('sha256').update(createHash('sha256').update(header).digest()).digest()).reverse().toString('hex');
    assert.equal(headerHash, blockHash, 'PC24_BTC_RAW_HEADER');
    bitcoin.blocks.push(retain({ height: n, block, rawBlockHex }, block.tx.length)); previous = blockHash;
  }
  assert.equal(await runtime.btc('getblockhash', [to.bitcoin]), previous, 'PC24_BTC_CAPTURE_REORG');

  const finalizedSlot = height(await solana.readPublic('getSlot', [{ commitment: 'finalized' }]));
  assert.ok(to.solana <= finalizedSlot, 'PC24_SOLANA_CAPTURE_NOT_FINALIZED');
  const firstAvailableBlock = height(await solana.readPublic('getFirstAvailableBlock')), minimumLedgerSlot = height(await solana.readPublic('minimumLedgerSlot'));
  assert.ok(from.solana >= firstAvailableBlock, 'PC24_SOLANA_CAPTURE_PRUNED');
  const slots = await solana.readPublic('getBlocks', [from.solana, to.solana, { commitment: 'finalized' }]);
  assert.ok(Array.isArray(slots) && slots.every((slot, i) => Number.isSafeInteger(slot) && slot >= from.solana && slot <= to.solana && (i === 0 || slot > slots[i - 1])), 'PC24_SOLANA_SLOT_COVERAGE');
  const sol = { genesis: solana.genesis, finalizedSlot, firstAvailableBlock, minimumLedgerSlot, slots: slots.slice(), blocks: [] };
  const options = { commitment: 'finalized', transactionDetails: 'full', rewards: true, maxSupportedTransactionVersion: 0 }; previous = undefined;
  for (const slot of slots) {
    const block = await solana.readPublic('getBlock', [slot, { ...options, encoding: 'base64' }]), decodedBlock = await solana.readPublic('getBlock', [slot, { ...options, encoding: 'json' }]);
    assert.ok(block && decodedBlock && Array.isArray(block.transactions) && Array.isArray(decodedBlock.transactions), 'PC24_FULL_SOLANA_BLOCK');
    base58Decode(block.blockhash, 32); base58Decode(block.previousBlockhash, 32);
    for (const key of ['blockhash', 'previousBlockhash', 'parentSlot', 'blockTime', 'blockHeight']) assert.equal(block[key], decodedBlock[key], 'PC24_SOLANA_DECODED_BLOCK');
    assert.ok(height(block.parentSlot) < slot || slot === 0, 'PC24_SOLANA_PARENT_SLOT');
    if (previous) { assert.equal(block.previousBlockhash, previous.blockhash, 'PC24_SOLANA_PARENT'); assert.equal(block.parentSlot, previous.slot, 'PC24_SOLANA_SKIPPED_BLOCK'); }
    assert.equal(block.transactions.length, decodedBlock.transactions.length, 'PC24_SOLANA_TRANSACTION_COUNT');
    for (let i = 0; i < block.transactions.length; i++) {
      assert.deepEqual(wireSignatures(block.transactions[i]), decodedBlock.transactions[i]?.transaction?.signatures, 'PC24_SOLANA_WIRE_IDENTITY');
      assert.deepEqual(block.transactions[i].meta, decodedBlock.transactions[i].meta, 'PC24_SOLANA_FULL_META');
    }
    sol.blocks.push(retain({ slot, block, decodedBlock }, block.transactions.length)); previous = { slot, blockhash: block.blockhash };
  }
  assert.deepEqual(await solana.readPublic('getBlocks', [from.solana, to.solana, { commitment: 'finalized' }]), slots, 'PC24_SOLANA_COVERAGE_CHANGED');
  if (previous) assert.equal((await solana.readPublic('getBlock', [previous.slot, { ...options, transactionDetails: 'none', rewards: false }]))?.blockhash, previous.blockhash, 'PC24_SOLANA_CAPTURE_REORG');
  // Recheck all end anchors after the other chains' reads, not only locally.
  await assertPublicGenesis(runtime, solana);
  assert.equal((await runtime.evm('eth_getBlockByNumber', [hex(to.evm), false]))?.hash, evm.blocks.at(-1).block.hash, 'PC24_EVM_CAPTURE_REORG');
  assert.equal(await runtime.btc('getblockhash', [to.bitcoin]), bitcoin.blocks.at(-1).block.hash, 'PC24_BTC_CAPTURE_REORG');
  return { kind: 'PRIVATE_COHORT_FULL_PUBLIC_CHAIN_CAPTURE', profile: PRIVATE_COHORT_PROFILE, from, to, coverage: { complete: true, recipientFiltering: false, transactionFiltering: false, bounds: PRIVATE_COHORT_CAPTURE_BOUNDS, retainedRecordBytes: bytes, transactions: transactionCount, boundedRangeOnly: true, trustedLocalRpcNotConsensusProof: true }, evm, bitcoin, solana: sol, contentSHA256: hash(JSON.stringify({ evm, bitcoin, solana: sol })) };
}
