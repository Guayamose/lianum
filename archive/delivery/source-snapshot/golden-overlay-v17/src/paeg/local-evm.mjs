/** Trusted harness capability, never an application API. All value is fake.
 * The endpoint, executable, account count and startup arguments are private and
 * fixed here. Only a newly spawned, pinned, loopback Anvil is usable.
 */
import assert from 'node:assert/strict';
import { linuxRuntimePins } from '../chains/linux-runtime-pins.mjs';
import {
  pinnedBinary, scratchDirectory, removeOwnScratch, unusedLoopbackPort,
  startOwnProcess, stopOwnProcess, ownedRuntimeRpc, sleep,
} from '../chains/runtime-harness.mjs';
import { decodePrivateRevert } from '../private-asset-runtime.mjs';

export const LOCAL_EVM_PROFILE = Object.freeze({
  name: 'PAEG_LOCAL_FAKE_CLOCK_V1', chainId: 31337, hardfork: 'cancun',
  genesisTimestamp: 1_900_000_210, accountCount: 5, accountBalanceWei: '10000000000000000000',
  maxGas: 30_000_000, manualMining: true, publicNetwork: false,
});
const ownedRuntimes = new WeakSet();
const hex = value => `0x${BigInt(value).toString(16)}`;
const address = value => { assert.match(value, /^0x[0-9a-f]{40}$/i, 'LOCAL_EVM_ADDRESS'); return value.toLowerCase(); };
const bytes = value => { assert.match(value, /^0x(?:[0-9a-f]{2})*$/i, 'LOCAL_EVM_BYTES'); return value.toLowerCase(); };
const quantity = value => { assert.match(value, /^0x(?:0|[1-9a-f][0-9a-f]*)$/i, 'LOCAL_EVM_QUANTITY'); return value; };
const blockTag = value => value === 'latest' ? value : quantity(value);
function uint(value, bits = 256) {
  if (typeof value === 'number') assert.ok(Number.isSafeInteger(value) && !Object.is(value, -0), 'LOCAL_EVM_SAFE_INTEGER');
  assert.ok(['number', 'bigint', 'string'].includes(typeof value), 'LOCAL_EVM_INTEGER');
  if (typeof value === 'string') assert.match(value, /^(?:0|[1-9][0-9]*|0x[0-9a-f]+)$/i, 'LOCAL_EVM_INTEGER');
  const n = BigInt(value); assert.ok(n >= 0n && n < (1n << BigInt(bits)), 'LOCAL_EVM_INTEGER_RANGE'); return n;
}

export async function assertLocalEvm(runtime) {
  assert.ok(ownedRuntimes.has(runtime), 'LOCAL_EVM_OWNED_CAPABILITY_REQUIRED');
  return runtime.health();
}

/** No options: caller URLs, keys, paths, existing endpoints and argv are refused.
 * close() stops this child but retains its scratch directory by default;
 * close({removeScratch:true}) or abort() explicitly remove only owned scratch.
 * An assertion after successful startup never silently destroys evidence.
 */
export async function createLocalEvm() {
  assert.equal(arguments.length, 0, 'LOCAL_EVM_FIXED_CONSTRUCTOR');
  assert.equal(process.platform, 'linux', 'LOCAL_EVM_LINUX_ONLY');
  const binary = await pinnedBinary(...linuxRuntimePins.anvil);
  const cwd = await scratchDirectory('paeg-local-evm-');
  let handle, exitEvent = null, spawnError = null, closed = false, removed = false;
  let busy = false, uncertainMutation = false, accounts, genesisHash, lastTimestamp;
  let closePromise, removePromise;
  const receipts = [], transactions = [], lifecycle = [];
  const processStatus = () => ({
    pid: handle?.child.pid ?? null,
    exitObserved: exitEvent !== null,
    exitCode: exitEvent?.code ?? handle?.child.exitCode ?? null,
    signal: exitEvent?.signal ?? handle?.child.signalCode ?? null,
    spawnErrorCode: spawnError?.code ?? null,
    stopped: Boolean(exitEvent || spawnError),
    scratchRemoved: removed,
  });
  const assertAlive = () => {
    assert.ok(!closed && handle && !spawnError && !exitEvent && handle.child.signalCode === null, 'LOCAL_EVM_PROCESS_NOT_RUNNING');
    handle.assertAlive();
  };
  const close = async (options = {}) => {
    assert.deepEqual(Object.keys(options).filter(key => key !== 'removeScratch'), [], 'LOCAL_EVM_CLOSE_OPTIONS');
    const removeScratch = options.removeScratch ?? false;
    assert.equal(typeof removeScratch, 'boolean', 'LOCAL_EVM_CLEANUP_BOOLEAN');
    if (!closePromise) closePromise = (async () => {
      closed = true;
      if (handle) {
        const result = await stopOwnProcess(handle);
        // The ChildProcess exit event/exitCode/signalCode is evidence of exit.
        // No ps scan, missing PID or inferred absence is used.
        assert.ok(exitEvent || spawnError || handle.child.exitCode !== null || handle.child.signalCode !== null, 'LOCAL_EVM_EXIT_NOT_OBSERVED');
        lifecycle.push({ event: 'stopped-owned-process', ...result, ...processStatus() });
      }
    })();
    await closePromise;
    if (removeScratch && !removed) {
      removePromise ??= (async () => { await removeOwnScratch(cwd); removed = true; })();
      await removePromise;
    }
    return processStatus();
  };
  try {
    const port = await unusedLoopbackPort();
    handle = startOwnProcess(binary, [
      '--host', '127.0.0.1', '--port', String(port), '--chain-id', '31337',
      '--hardfork', 'cancun', '--timestamp', String(LOCAL_EVM_PROFILE.genesisTimestamp),
      '--accounts', '5', '--balance', '10', '--mnemonic-random', '12',
      '--no-cors', '--no-mining', '--gas-limit', String(LOCAL_EVM_PROFILE.maxGas),
    ], cwd);
    handle.child.once('exit', (code, signal) => { exitEvent = { code, signal }; });
    handle.child.once('error', error => { spawnError = error; });
    const endpoint = `http://127.0.0.1:${port}`;
    const rpc = async (method, params = []) => {
      assertAlive();
      const result = await ownedRuntimeRpc(endpoint, method, params, { timeoutMs: 30_000 });
      assertAlive(); return result;
    };
    let ready = false;
    for (let i = 0; i < 100; i++) {
      assertAlive();
      try { ready = await rpc('eth_chainId') === '0x7a69'; if (ready) break; } catch { assertAlive(); }
      await sleep(100);
    }
    assert.ok(ready, 'LOCAL_EVM_STARTUP_TIMEOUT');
    assert.equal(await rpc('eth_blockNumber'), '0x0', 'LOCAL_EVM_NOT_FRESH');
    const genesis = await rpc('eth_getBlockByNumber', ['0x0', false]);
    assert.equal(genesis?.number, '0x0', 'LOCAL_EVM_GENESIS');
    assert.deepEqual(genesis.transactions, [], 'LOCAL_EVM_GENESIS_TRANSACTIONS');
    assert.match(genesis.hash, /^0x[0-9a-f]{64}$/i, 'LOCAL_EVM_GENESIS_HASH');
    assert.equal(BigInt(genesis.timestamp), BigInt(LOCAL_EVM_PROFILE.genesisTimestamp), 'LOCAL_EVM_GENESIS_TIME');
    genesisHash = genesis.hash; lastTimestamp = BigInt(genesis.timestamp);
    accounts = Object.freeze((await rpc('eth_accounts')).map(address));
    assert.equal(accounts.length, LOCAL_EVM_PROFILE.accountCount, 'LOCAL_EVM_ACCOUNT_COUNT');
    assert.equal(new Set(accounts).size, accounts.length, 'LOCAL_EVM_ACCOUNT_UNIQUENESS');
    for (const account of accounts) {
      assert.equal(await rpc('eth_getTransactionCount', [account, 'latest']), '0x0', 'LOCAL_EVM_FRESH_NONCE');
      assert.equal(BigInt(await rpc('eth_getBalance', [account, 'latest'])), BigInt(LOCAL_EVM_PROFILE.accountBalanceWei), 'LOCAL_EVM_FAKE_BALANCE');
      assert.equal(await rpc('eth_getCode', [account, 'latest']), '0x', 'LOCAL_EVM_FRESH_ACCOUNT_CODE');
    }
    const health = async () => {
      assertAlive();
      assert.equal(await rpc('eth_chainId'), '0x7a69', 'LOCAL_EVM_CHAIN_CHANGED');
      assert.equal((await rpc('eth_getBlockByNumber', ['0x0', false]))?.hash, genesisHash, 'LOCAL_EVM_GENESIS_CHANGED');
      assert.deepEqual((await rpc('eth_accounts')).map(address), accounts, 'LOCAL_EVM_ACCOUNTS_CHANGED');
      return { ...processStatus(), chainId: '31337', genesisHash };
    };
    const block = async (tag = 'latest') => {
      const header = await rpc('eth_getBlockByNumber', [blockTag(tag), false]);
      assert.ok(header?.hash && header.number, 'LOCAL_EVM_BLOCK_NOT_FOUND'); return header;
    };
    const assertCanonical = async snapshot => {
      const number = snapshot.blockNumber ?? snapshot.number, hash = snapshot.blockHash ?? snapshot.hash;
      assert.match(hash, /^0x[0-9a-f]{64}$/i, 'LOCAL_EVM_BLOCK_HASH');
      const header = await block(quantity(number));
      assert.equal(header.hash, hash, 'LOCAL_EVM_CANONICAL_BLOCK_CHANGED'); return header;
    };
    const checkReceipt = async receipt => {
      assert.match(receipt?.transactionHash, /^0x[0-9a-f]{64}$/i, 'LOCAL_EVM_RECEIPT_HASH');
      assert.ok(['0x0', '0x1'].includes(receipt.status), 'LOCAL_EVM_RECEIPT_STATUS');
      const authoritative = await rpc('eth_getTransactionReceipt', [receipt.transactionHash]);
      assert.deepEqual(receipt, authoritative, 'LOCAL_EVM_RECEIPT_CHANGED');
      const header = await assertCanonical(receipt);
      const index = BigInt(quantity(receipt.transactionIndex));
      assert.ok(index < BigInt(header.transactions.length), 'LOCAL_EVM_RECEIPT_INDEX');
      assert.equal(header.transactions[Number(index)], receipt.transactionHash, 'LOCAL_EVM_RECEIPT_TRANSACTION');
      return receipt;
    };
    const receipt = async hash => {
      assert.match(hash, /^0x[0-9a-f]{64}$/i, 'LOCAL_EVM_TRANSACTION_HASH');
      const result = await rpc('eth_getTransactionReceipt', [hash]);
      return result === null ? null : checkReceipt(result);
    };
    const transaction = async hash => {
      assert.match(hash, /^0x[0-9a-f]{64}$/i, 'LOCAL_EVM_TRANSACTION_HASH');
      // A read-only reconciliation seam for this runtime's original sends.
      // It never discovers another sender, signs, mines or retries a broadcast.
      assert.ok(transactions.some(entry => entry.transactionHash === hash),
        'LOCAL_EVM_TRANSACTION_NOT_OWNED');
      const result = await rpc('eth_getTransactionByHash', [hash]);
      if (result === null) return null;
      assert.equal(result.hash, hash, 'LOCAL_EVM_TRANSACTION_HASH_CHANGED');
      assert.ok(accounts.includes(address(result.from)), 'LOCAL_EVM_TRANSACTION_SENDER_CHANGED');
      if (result.blockHash !== null) await assertCanonical(result);
      return result;
    };
    const request = (transaction, sending) => {
      assert.ok(transaction && typeof transaction === 'object' && !Array.isArray(transaction), 'LOCAL_EVM_TRANSACTION');
      assert.ok(Object.keys(transaction).every(key => ['from', 'to', 'data', 'gas', 'value'].includes(key)), 'LOCAL_EVM_TRANSACTION_FIELDS');
      const tx = { from: accounts[0], gas: hex(LOCAL_EVM_PROFILE.maxGas), ...transaction };
      tx.from = address(tx.from); assert.ok(accounts.includes(tx.from), 'LOCAL_EVM_SENDER_NOT_OWNED');
      if (tx.to !== undefined) tx.to = address(tx.to);
      if (tx.data !== undefined) tx.data = bytes(tx.data);
      const gas = uint(tx.gas); assert.ok(gas > 0n && gas <= BigInt(LOCAL_EVM_PROFILE.maxGas), 'LOCAL_EVM_GAS_LIMIT'); tx.gas = hex(gas);
      if (tx.value !== undefined) tx.value = hex(uint(tx.value));
      if (!sending) assert.ok(tx.to !== undefined, 'LOCAL_EVM_CALL_REQUIRES_TO');
      return tx;
    };
    const mutate = async operation => {
      assert.ok(!busy, 'LOCAL_EVM_CONCURRENT_MUTATION');
      assert.ok(!uncertainMutation, 'LOCAL_EVM_UNCERTAIN_MUTATION_REQUIRES_RECONCILIATION');
      busy = true; try { await health(); return await operation(); } finally { busy = false; }
    };
    const mineAt = async timestamp => {
      const before = await block();
      assert.equal(BigInt(before.timestamp), lastTimestamp, 'LOCAL_EVM_UNCONTROLLED_TIME');
      assert.ok(timestamp > lastTimestamp && timestamp <= BigInt(Number.MAX_SAFE_INTEGER), 'LOCAL_EVM_MONOTONIC_TIME');
      await rpc('evm_setNextBlockTimestamp', [Number(timestamp)]);
      await rpc('evm_mine');
      const after = await block();
      assert.equal(BigInt(after.number), BigInt(before.number) + 1n, 'LOCAL_EVM_UNCONTROLLED_MINING');
      assert.equal(BigInt(after.timestamp), timestamp, 'LOCAL_EVM_MINED_TIMESTAMP');
      lastTimestamp = timestamp; return after;
    };
    const send = async (label, transaction, expectedStatus = '0x1', expectedRevert) => {
      assert.equal(typeof label, 'string', 'LOCAL_EVM_TRANSACTION_LABEL');
      assert.ok(['0x0', '0x1'].includes(expectedStatus), 'LOCAL_EVM_EXPECTED_STATUS');
      const tx = request(transaction, true);
      return mutate(async () => {
        const entry = { label, request: tx, senderNonce: await rpc('eth_getTransactionCount', [tx.from, 'pending']), phase: 'before-broadcast' };
        transactions.push(entry);
        let confirmed;
        try {
          // Never retry broadcasts. A lost response is an ambiguous write.
          entry.phase = 'broadcast-result-unknown';
          entry.transactionHash = await rpc('eth_sendTransaction', [tx]);
          entry.phase = 'broadcast';
          await mineAt(lastTimestamp + 1n);
          confirmed = await receipt(entry.transactionHash);
          assert.ok(confirmed, 'LOCAL_EVM_RECEIPT_MISSING_AFTER_MINE');
        } catch (error) {
          uncertainMutation = true; error.transactionRecord = entry; throw error;
        }
        entry.receipt = confirmed; entry.phase = 'mined';
        entry.gasUsed = BigInt(confirmed.gasUsed).toString(); receipts.push(entry);
        if (confirmed.status === '0x0') {
          const trace = await rpc('debug_traceTransaction', [entry.transactionHash, { disableMemory: true, disableStack: true, disableStorage: true }]);
          entry.trace = { failed: trace.failed, gas: trace.gas, returnValue: trace.returnValue };
          assert.equal(trace.failed, true, 'LOCAL_EVM_REVERT_TRACE');
          entry.revert = decodePrivateRevert(trace.returnValue);
        }
        assert.equal(confirmed.status, expectedStatus, label);
        if (expectedRevert !== undefined) {
          assert.ok(entry.revert, 'LOCAL_EVM_EXPECTED_REVERT');
          if (/^0x[0-9a-f]{8}$/i.test(expectedRevert)) assert.equal(entry.revert.selector, expectedRevert.toLowerCase(), label);
          else assert.equal(entry.revert.reason, expectedRevert, label);
        }
        return confirmed;
      });
    };
    const advanceTo = timestamp => mutate(async () => {
      const target = uint(timestamp, 64);
      assert.ok(target > lastTimestamp && target <= BigInt(Number.MAX_SAFE_INTEGER), 'LOCAL_EVM_MONOTONIC_TIME');
      try { return await mineAt(target); } catch (error) { uncertainMutation = true; throw error; }
    });
    const runtime = Object.freeze({
      accounts, health, processStatus, block, assertCanonical, receipt, transaction, checkReceipt, send, advanceTo,
      call: (transaction, tag = 'latest') => rpc('eth_call', [request(transaction, false), blockTag(tag)]),
      balance: async (holder, tag = 'latest') => BigInt(await rpc('eth_getBalance', [address(holder), blockTag(tag)])),
      code: (holder, tag = 'latest') => rpc('eth_getCode', [address(holder), blockTag(tag)]),
      nonce: async (holder, tag = 'pending') => {
        const sender = address(holder);
        assert.ok(accounts.includes(sender), 'LOCAL_EVM_NONCE_SENDER_NOT_OWNED');
        assert.ok(tag === 'latest' || tag === 'pending', 'LOCAL_EVM_NONCE_TAG');
        const value = await rpc('eth_getTransactionCount', [sender, tag]);
        assert.equal(typeof value, 'string', 'LOCAL_EVM_NONCE_RESULT');
        assert.match(value, /^0x(?:0|[1-9a-f][0-9a-f]*)$/, 'LOCAL_EVM_NONCE_ENCODING');
        return BigInt(value);
      },
      keccak: data => rpc('web3_sha3', [bytes(data)]),
      time: async () => BigInt((await block()).timestamp),
      close, abort: () => close({ removeScratch: true }),
      get receipts() { return receipts.slice(); },
      get transactions() { return transactions.slice(); },
      get lifecycle() { return lifecycle.slice(); },
      metadata: Object.freeze({ classification: 'OWNED_LOCAL_EVM_ONLY', profile: LOCAL_EVM_PROFILE,
        chainId: '31337', evmGenesis: genesisHash, freshSyntheticWallets: true,
        runtimePin: Object.freeze([...linuxRuntimePins.anvil]), scratchDirectory: cwd,
        processId: handle.child.pid, disclosure: 'Private trusted harness; transparent fake local chain; no proof claim' }),
    });
    ownedRuntimes.add(runtime); await health(); return runtime;
  } catch (error) {
    try { error.cleanup = await close({ removeScratch: true }); } catch (cleanupError) { error.cleanupError = cleanupError; }
    throw error;
  }
}
