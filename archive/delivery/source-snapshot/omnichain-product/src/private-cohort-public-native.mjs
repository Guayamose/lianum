/** Pure public native-block normalization. No wallet RPC, certificates or route map. */
import assert from 'node:assert/strict';
import { createHash, ECDH } from 'node:crypto';
import { base58Decode, decodeSolanaTransfer } from './chains/solana-runtime.mjs';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const hexHash = value => `0x${sha(Buffer.from(JSON.stringify(value)))}`;
const uint = value => { assert.ok(Number.isSafeInteger(value) && value >= 0, 'PC24_NATIVE_UNSAFE_INTEGER'); return String(value); };
const VOTE = 'Vote111111111111111111111111111111111111111';
const BUDGET = 'ComputeBudget111111111111111111111111111111';
const SYSTEM = '11111111111111111111111111111111';
const refs = row => row.evidenceRefs;
const interval = row => row.time;

// Keccak-256, NOT SHA3-256. Only used for public-key/address-reuse detection.
// Ethereum's 136-byte rate, 0x01 suffix, little-endian lanes; no signing occurs.
const MASK = (1n << 64n) - 1n;
const RC = [1n,0x8082n,0x800000000000808an,0x8000000080008000n,0x808bn,0x80000001n,0x8000000080008081n,0x8000000000008009n,0x8an,0x88n,0x80008009n,0x8000000an,0x8000808bn,0x800000000000008bn,0x8000000000008089n,0x8000000000008003n,0x8000000000008002n,0x8000000000000080n,0x800an,0x800000008000000an,0x8000000080008081n,0x8000000000008080n,0x80000001n,0x8000000080008008n];
const ROT = [0,1,62,28,27,36,44,6,55,20,3,10,43,25,39,41,45,15,21,8,18,2,61,56,14];
const rol = (x, n) => n === 0 ? x : ((x << BigInt(n)) | (x >> BigInt(64 - n))) & MASK;
export function publicKeccak256(bytes) {
  const raw = Buffer.from(bytes), padded = Buffer.alloc(Math.ceil((raw.length + 1) / 136) * 136);
  raw.copy(padded); padded[raw.length] = 1; padded[padded.length - 1] |= 128;
  const state = Array(25).fill(0n);
  for (let offset = 0; offset < padded.length; offset += 136) {
    for (let i = 0; i < 17; i++) state[i] ^= padded.readBigUInt64LE(offset + i * 8);
    for (const rc of RC) {
      const c = Array.from({ length: 5 }, (_, x) => state[x] ^ state[x + 5] ^ state[x + 10] ^ state[x + 15] ^ state[x + 20]);
      const d = c.map((_, x) => c[(x + 4) % 5] ^ rol(c[(x + 1) % 5], 1));
      for (let i = 0; i < 25; i++) state[i] ^= d[i % 5];
      const b = Array(25).fill(0n);
      for (let x = 0; x < 5; x++) for (let y = 0; y < 5; y++) b[y + 5 * ((2 * x + 3 * y) % 5)] = rol(state[x + 5 * y], ROT[x + 5 * y]);
      for (let x = 0; x < 5; x++) for (let y = 0; y < 5; y++) state[x + 5 * y] = b[x + 5 * y] ^ ((~b[(x + 1) % 5 + 5 * y]) & b[(x + 2) % 5 + 5 * y]);
      state[0] ^= rc;
    }
  }
  const out = Buffer.alloc(32); for (let i = 0; i < 4; i++) out.writeBigUInt64LE(state[i] & MASK, i * 8); return out;
}
export function publicBitcoinKeyEvmAddress(keyHex) {
  assert.match(keyHex, /^(?:02|03)[0-9a-f]{64}$/i, 'PC24_PUBLIC_BTC_KEY');
  const key = ECDH.convertKey(Buffer.from(keyHex, 'hex'), 'secp256k1', undefined, undefined, 'uncompressed');
  return `0x${publicKeccak256(key.subarray(1)).subarray(12).toString('hex')}`;
}

export function publicBitcoinSatoshis(value) {
  assert.ok(typeof value === 'number' || typeof value === 'string', 'PC24_BTC_VALUE');
  const text = typeof value === 'number' ? value.toFixed(8) : value;
  assert.match(text, /^(0|[1-9][0-9]*)(?:\.([0-9]{1,8}))?$/, 'PC24_BTC_PRECISION');
  const [whole, decimal = ''] = text.split('.');
  const sats = BigInt(whole) * 100000000n + BigInt(decimal.padEnd(8, '0'));
  assert.ok(sats <= 21000000n * 100000000n, 'PC24_BTC_RANGE');
  if (typeof value === 'number') assert.equal(Number(sats) / 100000000, value, 'PC24_BTC_ROUNDING');
  return sats;
}

/** Rows are deduplicated complete public blocks plus evidenceRefs and justified
 * observer time bounds. Unknown transactions are retained and make issues nonempty. */
export function normalizePublicCohortNative({ solanaBlocks, bitcoinBlocks, bootstrap, evmAddresses = [] }) {
  const events = [], classifications = [], issues = [], observations = [];
  const complain = (code, id, evidenceRefs, detail) => issues.push({ code, id, evidenceRefs, detail });
  const classify = (chain, txid, kind, evidenceRefs, detail) => classifications.push({ chain, txid, kind, evidenceRefs, detail });
  const initial = new Map((bootstrap?.solana?.initialBalances ?? []).map(row => [row.address, BigInt(row.lamports)]));
  const knownBalances = new Map(initial);
  if (bootstrap?.solana?.genesisFunding?.faucetUsed !== false || bootstrap?.solana?.genesisFunding?.transaction !== null) {
    complain('UNSUPPORTED_SOL_BOOTSTRAP', 'genesis', [], 'Need original public no-faucet genesis account allocation');
  }
  for (const row of solanaBlocks) {
    const block = row.block, decoded = row.decodedBlock;
    if (!block || !decoded || !Array.isArray(block.transactions) || !Array.isArray(decoded.transactions) || block.transactions.length !== decoded.transactions.length) {
      complain('MISSING_SOL_FULL_BLOCK', String(row.slot), refs(row), 'Full wire and decoded transactions required'); continue;
    }
    for (let index = 0; index < decoded.transactions.length; index++) {
      const tx = decoded.transactions[index], wire = block.transactions[index], txid = tx.transaction?.signatures?.[0];
      const eid = `SOL:${txid ?? `missing-${row.slot}-${index}`}`;
      try {
        assert.ok(typeof txid === 'string' && txid.length > 0);
        assert.deepEqual(tx.meta, wire.meta, 'WIRE_METADATA_MISMATCH');
        const meta = tx.meta, message = tx.transaction.message;
        assert.ok(meta && meta.err === null && Array.isArray(meta.preBalances) && Array.isArray(meta.postBalances), 'UNSUCCESSFUL_OR_MISSING_META');
        const keys = message.accountKeys.map(k => typeof k === 'string' ? k : k.pubkey);
        const loaded = meta.loadedAddresses;
        if (loaded) keys.push(...loaded.writable, ...loaded.readonly);
        assert.equal(keys.length, meta.preBalances.length); assert.equal(keys.length, meta.postBalances.length);
        assert.ok(Array.isArray(message.instructions) && message.instructions.length > 0, 'NO_INSTRUCTIONS');
        assert.ok(!meta.innerInstructions || meta.innerInstructions.length === 0, 'UNSUPPORTED_INNER_INSTRUCTION');
        const programs = message.instructions.map(i => keys[i.programIdIndex]);
        const fee = BigInt(uint(meta.fee));
        for (let i = 0; i < keys.length; i++) {
          const before = BigInt(uint(meta.preBalances[i])), after = BigInt(uint(meta.postBalances[i]));
          // All intermediate balances remain public even if genesis account data
          // for validators/programs is not in the synthetic solver inventory.
          if (knownBalances.has(keys[i]) && knownBalances.get(keys[i]) !== before) {
            complain('SOL_ACCOUNT_BALANCE_GAP', eid, refs(row), `Unexplained balance change for public account ${keys[i]}`);
          }
          if (knownBalances.has(keys[i])) knownBalances.set(keys[i], after);
        }
        if (programs.every(p => p === VOTE || p === BUDGET) && programs.includes(VOTE)) {
          assert.equal(BigInt(meta.preBalances[0]) - BigInt(meta.postBalances[0]), fee, 'VOTE_FEE_DELTA');
          for (let i = 1; i < keys.length; i++) assert.equal(meta.preBalances[i], meta.postBalances[i], 'VOTE_VALUE_TRANSFER');
          classify('SOL', txid, 'SOL_VOTE_AND_FEE', refs(row), { programs, accountKeys: keys, feeLamports: String(fee) });
          continue;
        }
        if (!programs.every(p => p === SYSTEM)) throw Error('UNRECOGNIZED_SOL_PROGRAM');
        assert.ok(Array.isArray(wire.transaction) && wire.transaction[1] === 'base64', 'SOL_WIRE_REQUIRED');
        const transfer = decodeSolanaTransfer(wire.transaction[0]);
        assert.equal(transfer.signature, txid, 'SOL_WIRE_SIGNATURE');
        assert.equal(transfer.solver, keys[0], 'SOL_SOURCE'); assert.equal(transfer.recipient, keys[1], 'SOL_RECIPIENT');
        assert.equal(BigInt(meta.postBalances[1]) - BigInt(meta.preBalances[1]), BigInt(transfer.lamports), 'SOL_RECIPIENT_DELTA');
        assert.equal(BigInt(meta.preBalances[0]) - BigInt(meta.postBalances[0]), BigInt(transfer.lamports) + fee, 'SOL_SOURCE_DELTA');
        assert.equal(meta.preBalances[2], meta.postBalances[2], 'SOL_PROGRAM_BALANCE');
        if (transfer.lamports !== '3000000') {
          classify('SOL', txid, 'SOL_NON_TEMPLATE_SYSTEM_TRANSFER', refs(row), transfer);
          complain('UNRECOGNIZED_SOL_FUNDING_OR_PAYMENT', eid, refs(row), 'Non-template transfer may create public funding/route edges; not treated as a decoy'); continue;
        }
        if (transfer.solver !== bootstrap?.solana?.solver) complain('SOL_UNRECOGNIZED_FUNDING_SOURCE', eid, refs(row), 'Candidate does not spend the fixed public prefunded source');
        classify('SOL', txid, 'SOL_TEMPLATE_PAYMENT_CANDIDATE', refs(row), { amount: transfer.lamports, source: transfer.solver, recipient: transfer.recipient, feeLamports: String(fee) });
        events.push({ id: eid, kind: 'SOL', chain: 'SOL', txid, position: { block: uint(row.slot), transaction: String(index), sub: '0' }, time: interval(row),
          metadata: { feePayer: keys[0], feeLamports: String(fee), accountKeys: keys, instructionsHash: hexHash(message.instructions), blockHash: block.blockhash, blockTimeSeconds: uint(block.blockTime) },
          fundingEvidenceRefs: [...new Set([...refs(row), 'capture-manifest'])], evidenceRefs: refs(row),
          data: { amount: transfer.lamports, source: transfer.solver, recipient: transfer.recipient, readyTime: row.finalityTime ?? interval(row) } });
      } catch (error) {
        classify('SOL', txid ?? eid, 'SOL_UNRECOGNIZED_RETAINED', refs(row), { reason: error.message });
        complain('UNRECOGNIZED_SOL_TRANSACTION', eid, refs(row), error.message);
      }
    }
  }

  const txIndex = new Map(), blockIndex = new Map(bitcoinBlocks.map(row => [row.height, row]));
  const spent = new Set(), evmSet = new Set(evmAddresses.map(address => address.toLowerCase()));
  for (const row of bitcoinBlocks) for (const tx of row.block?.tx ?? []) {
    if (txIndex.has(tx.txid)) complain('BTC_DUPLICATE_TRANSACTION', tx.txid, refs(row), 'Duplicate txid after chunk deduplication');
    txIndex.set(tx.txid, { tx, row });
  }
  for (const row of bitcoinBlocks) {
    for (let index = 0; index < (row.block?.tx ?? []).length; index++) {
      const tx = row.block.tx[index], txid = tx.txid, eid = `BTC:${txid}`;
      try {
        assert.match(txid, /^[0-9a-f]{64}$/); assert.ok(Array.isArray(tx.vin) && Array.isArray(tx.vout) && tx.vout.length > 0);
        const coinbase = tx.vin.length === 1 && typeof tx.vin[0].coinbase === 'string';
        if (coinbase) {
          assert.equal(index, 0, 'COINBASE_ORDER');
          tx.vout.forEach(v => publicBitcoinSatoshis(v.value));
          classify('BTC', txid, 'BTC_COINBASE_FUNDING', refs(row), { outputs: tx.vout }); continue;
        }
        const inputRefs = new Set(refs(row)), inputAddresses = [], inputOutpoints = [], publicKeys = [];
        let inputValue = 0n;
        for (const vin of tx.vin) {
          const parent = txIndex.get(vin.txid), outpoint = `${vin.txid}:${vin.vout}`;
          assert.ok(parent && (parent.row.height < row.height || parent.row.height === row.height && parent.row.block.tx.indexOf(parent.tx) < index), 'MISSING_OR_FUTURE_PREVOUT');
          const output = parent.tx.vout.find(v => v.n === vin.vout); assert.ok(output, 'MISSING_PREVOUT_INDEX');
          assert.ok(!spent.has(outpoint), 'DUPLICATE_SPENT_PREVOUT'); spent.add(outpoint);
          parent.row.evidenceRefs.forEach(ref => inputRefs.add(ref)); inputValue += publicBitcoinSatoshis(output.value);
          inputOutpoints.push(outpoint); inputAddresses.push(output.scriptPubKey.address ?? `script:${output.scriptPubKey.hex}`);
          assert.match(output.scriptPubKey.hex, /^0014[0-9a-f]{40}$/, 'UNSUPPORTED_BTC_INPUT_SCRIPT');
          assert.ok(Array.isArray(vin.txinwitness) && vin.txinwitness.length === 2, 'UNSUPPORTED_BTC_WITNESS');
          const publicKey = vin.txinwitness[1]; assert.match(publicKey, /^(02|03)[0-9a-f]{64}$/);
          const keyHash = createHash('ripemd160').update(createHash('sha256').update(Buffer.from(publicKey, 'hex')).digest()).digest('hex');
          assert.equal(output.scriptPubKey.hex, `0014${keyHash}`, 'BTC_PUBLIC_KEY_SCRIPT_MISMATCH');
          const evmAddress = publicBitcoinKeyEvmAddress(publicKey); publicKeys.push({ publicKey, evmAddress });
          if (evmSet.has(evmAddress)) complain('CROSS_CHAIN_PUBLIC_KEY_REUSE', eid, [...inputRefs], `BTC funding key also controls observed EVM address ${evmAddress}; unsupported ownership implication requires explicit review`);
        }
        const values = tx.vout.map(v => publicBitcoinSatoshis(v.value));
        const fee = inputValue - values.reduce((a, b) => a + b, 0n); assert.ok(fee >= 0n, 'NEGATIVE_BTC_FEE');
        const outputs = tx.vout.filter(v => publicBitcoinSatoshis(v.value) === 100000n);
        if (outputs.length !== 1 || tx.vout.length > 2) {
          classify('BTC', txid, 'BTC_UNRECOGNIZED_TRANSFER_OR_FUNDING', refs(row), { outputs: tx.vout, feeSats: String(fee), inputOutpoints });
          complain('UNRECOGNIZED_BTC_PAYMENT_OR_FUNDING', eid, [...inputRefs], 'Need one unique 100000-satoshi template output and at most one preserved change output'); continue;
        }
        const output = outputs[0]; assert.match(output.scriptPubKey.hex, /^0014[0-9a-f]{40}$/, 'UNSUPPORTED_BTC_DELIVERY_SCRIPT');
        const finalityBlock = blockIndex.get(row.height + 5);
        if (!finalityBlock) complain('BTC_FINALITY_PREFIX_INCOMPLETE', eid, refs(row), 'Six-block confirmation prefix not present');
        assert.match(tx.hex, /^(?:[0-9a-f]{2})+$/, 'BTC_RAW_TRANSACTION');
        classify('BTC', txid, 'BTC_TEMPLATE_PAYMENT_CANDIDATE', [...inputRefs], { vout: output.n, inputOutpoints, inputAddresses, publicKeys, outputs: tx.vout, feeSats: String(fee) });
        events.push({ id: `${eid}:${output.n}`, kind: 'BTC', chain: 'BTC', txid, position: { block: uint(row.height), transaction: String(index), sub: uint(output.n) }, time: interval(row),
          metadata: { inputOutpoints, inputAddresses, feeSats: String(fee), rawTransactionHash: `0x${sha(Buffer.from(tx.hex, 'hex'))}`, blockHash: row.block.hash, blockTimeSeconds: uint(row.block.time) },
          fundingEvidenceRefs: [...inputRefs], evidenceRefs: refs(row),
          data: { amount: '100000', recipientScript: output.scriptPubKey.hex, vout: uint(output.n), readyTime: finalityBlock ? interval(finalityBlock) : interval(row) } });
      } catch (error) {
        classify('BTC', txid ?? eid, 'BTC_UNRECOGNIZED_RETAINED', refs(row), { reason: error.message });
        complain('UNRECOGNIZED_BTC_TRANSACTION', eid, refs(row), error.message);
      }
    }
  }
  for (const chain of ['SOL', 'BTC']) {
    const native = events.filter(e => e.kind === chain);
    if (native.length !== 2) complain(`${chain}_CANDIDATE_UNIVERSE_NOT_TWO`, chain, [], `Found ${native.length} public template candidates; extras are not discarded as decoys`);
    for (let i = 0; i < native.length; i++) for (let j = i + 1; j < native.length; j++) {
      const a = native[i], b = native[j];
      observations.push({ kind: 'OBSERVATION_ONLY', from: a.id, to: b.id, basis: chain === 'SOL' ? 'ADDRESS' : 'FUNDING',
        detail: 'All native source/account/UTXO/change/fee/address relationships retained. Shared solver control links the cohort but does not alone force an intent assignment.', evidenceRefs: [...new Set([...a.evidenceRefs, ...b.evidenceRefs, ...a.fundingEvidenceRefs, ...b.fundingEvidenceRefs])] });
      const earlier = BigInt(a.position.block) < BigInt(b.position.block) ? a : b, later = earlier === a ? b : a;
      if (earlier.position.block !== later.position.block) {
        const evidenceRefs = [...new Set([...a.evidenceRefs, ...b.evidenceRefs])];
        observations.push({ kind: 'READY_BEFORE_READY', from: earlier.id, to: later.id, basis: 'TIMING', detail: 'Finalized SOL slots / six-confirmation BTC prefix are monotone in the public chain order', evidenceRefs });
        if (chain === 'BTC') observations.push({
          kind: BigInt(earlier.position.block) + 5n < BigInt(later.position.block) ? 'READY_BEFORE' : 'BEFORE_READY',
          from: BigInt(earlier.position.block) + 5n < BigInt(later.position.block) ? earlier.id : later.id,
          to: BigInt(earlier.position.block) + 5n < BigInt(later.position.block) ? later.id : earlier.id,
          basis: 'TIMING', detail: 'Exact public BTC height relation to the six-confirmation block', evidenceRefs,
        });
      }
      if (chain === 'SOL' && a.data.recipient === b.data.recipient) complain('REUSED_SOL_RECIPIENT', a.id, refs(solanaBlocks[0]), 'Independent intended recipient behavior no longer matches the fixed cohort profile');
      if (chain === 'BTC' && a.data.recipientScript === b.data.recipientScript) complain('REUSED_BTC_RECIPIENT', a.id, a.evidenceRefs, 'Repeated native script needs additional public ownership review');
    }
  }
  return { events, classifications, issues, publicEdges: observations };
}
