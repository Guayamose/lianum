import { createHash, randomBytes } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { linuxRuntimePins } from '../shared/linux-runtime-pins.mjs';
import { pinnedBinary, scratchDirectory, removeOwnScratch, unusedLoopbackPort, startOwnProcess,
  stopOwnProcess, isolatedRuntimeEnvironment, sleep } from '../shared/runtime-harness.mjs';

const exec = promisify(execFile);
const need = (condition, code) => { if (!condition) throw new Error(code); };
const hash = bytes => createHash('sha256').update(bytes).digest();
const txHash = bytes => Buffer.from(hash(hash(bytes))).reverse().toString('hex');
const hash160 = bytes => createHash('ripemd160').update(hash(bytes)).digest('hex');
const clone = value => structuredClone(value);
const immutable = value => { for (const child of Object.values(value)) if (child && typeof child === 'object') immutable(child); return Object.freeze(value); };
const MAX_MONEY = 2_100_000_000_000_000n;
const SOURCE_WALLET = 'generic-source';
const RECIPIENT_WALLETS = Object.freeze(['generic-recipient-0', 'generic-recipient-1']);
export const BITCOIN_REGTEST_GENESIS = '0f9188f13cb7b2c71f2a335e3a4fc328bf5beb436012afca590b1a11466e2206';
export const BITCOIN_OWNED_PROFILE = 'OWNED_BITCOIN_REGTEST_FIXED_TRANSFER_V1';
export const BITCOIN_TRANSFER_LIMITS = Object.freeze({ maximumSatoshi: '1000000000', maximumFeeSatoshi: '10000', minimumConfirmations: 6, recipientCount: 2 });
export const bitcoinRuntimePins = immutable({ bitcoin: [...linuxRuntimePins.bitcoin], cli: [...linuxRuntimePins.cli] });

function exactOptions(options, fields, required = []) {
  need(options && Object.getPrototypeOf(options) === Object.prototype, 'BITCOIN_INVALID_OPTIONS');
  const keys = Reflect.ownKeys(options);
  need(keys.every(key => fields.includes(key)) && required.every(key => keys.includes(key)), 'BITCOIN_INVALID_OPTIONS');
  need(keys.every(key => Object.hasOwn(Object.getOwnPropertyDescriptor(options, key), 'value')), 'BITCOIN_INVALID_OPTIONS');
}
function uint(value, maximum, code) {
  need(typeof value === 'string' && /^(0|[1-9][0-9]*)$/.test(value) && value.length <= 16, code);
  const result = BigInt(value); need(result <= maximum, code); return result;
}
function sats(value) {
  const n = uint(value, BigInt(BITCOIN_TRANSFER_LIMITS.maximumSatoshi), 'BITCOIN_INVALID_TRANSFER_SATOSHI');
  need(n > 0n, 'BITCOIN_INVALID_TRANSFER_SATOSHI'); return n;
}
function hex32(value) { need(typeof value === 'string' && /^[0-9a-f]{64}$/.test(value), 'BITCOIN_INVALID_HASH'); return value; }
function p2wpkh(value) { need(typeof value === 'string' && /^0014[0-9a-f]{40}$/.test(value), 'BITCOIN_P2WPKH_REQUIRED'); return value; }
function index(value) { need(Number.isSafeInteger(value) && value >= 0 && value < 2 && !Object.is(value, -0), 'BITCOIN_INVALID_RECIPIENT_INDEX'); return value; }
function height(value) { need(Number.isSafeInteger(value) && value >= 0 && !Object.is(value, -0), 'BITCOIN_INVALID_HEIGHT'); return value; }

/** Exact decimal bridge for Core JSON amounts. No exponent/string coercion or rounding. */
export function bitcoinSatoshiFromAmount(value) {
  let text = value;
  if (typeof value === 'number') {
    need(Number.isFinite(value) && value >= 0 && !Object.is(value, -0) && value <= 21_000_000, 'BITCOIN_INVALID_DECIMAL_AMOUNT');
    text = value.toFixed(8); need(Number(text) === value, 'BITCOIN_SUBSATOSHI_AMOUNT');
  }
  need(typeof text === 'string' && /^(0|[1-9][0-9]{0,7})(?:\.[0-9]{1,8})?$/.test(text), 'BITCOIN_INVALID_DECIMAL_AMOUNT');
  const [whole, fraction = ''] = text.split('.');
  const result = BigInt(whole) * 100_000_000n + BigInt(fraction.padEnd(8, '0'));
  need(result <= MAX_MONEY, 'BITCOIN_INVALID_DECIMAL_AMOUNT'); return result.toString();
}
export function bitcoinAmountFromSatoshi(value) {
  const n = uint(value, MAX_MONEY, 'BITCOIN_INVALID_SATOSHI');
  return `${n / 100_000_000n}.${(n % 100_000_000n).toString().padStart(8, '0')}`;
}

/** Bounded, independent wire decoding. This does not itself prove valid signatures or consensus. */
export function decodeBitcoinTransaction(rawTransaction) {
  need(typeof rawTransaction === 'string' && /^(?:[0-9a-f]{2})+$/.test(rawTransaction) && rawTransaction.length <= 200_000, 'BITCOIN_INVALID_WIRE');
  const wire = Buffer.from(rawTransaction, 'hex'); let offset = 0;
  const take = n => { need(Number.isSafeInteger(n) && n >= 0 && offset + n <= wire.length, 'BITCOIN_TRUNCATED_WIRE'); const bytes = wire.subarray(offset, offset + n); offset += n; return bytes; };
  const compact = maximum => {
    const first = take(1)[0]; let n = BigInt(first);
    if (first === 253) { n = BigInt(take(2).readUInt16LE()); need(n >= 253n, 'BITCOIN_NONCANONICAL_COMPACT_SIZE'); }
    if (first === 254) { n = BigInt(take(4).readUInt32LE()); need(n > 65535n, 'BITCOIN_NONCANONICAL_COMPACT_SIZE'); }
    if (first === 255) { n = take(8).readBigUInt64LE(); need(n > 0xffffffffn, 'BITCOIN_NONCANONICAL_COMPACT_SIZE'); }
    need(n <= BigInt(maximum), 'BITCOIN_WIRE_LIMIT'); return Number(n);
  };
  const versionBytes = take(4), version = versionBytes.readInt32LE();
  let witness = false;
  if (wire[offset] === 0) { take(1); need(take(1)[0] === 1, 'BITCOIN_UNSUPPORTED_WITNESS_FLAG'); witness = true; }
  const bodyStart = offset, inputCount = compact(128); need(inputCount > 0, 'BITCOIN_EMPTY_INPUTS');
  const vin = Array.from({ length: inputCount }, () => ({ txid: Buffer.from(take(32)).reverse().toString('hex'), vout: take(4).readUInt32LE(), scriptSig: take(compact(10_000)).toString('hex'), sequence: take(4).readUInt32LE() }));
  const outputCount = compact(128); need(outputCount > 0, 'BITCOIN_EMPTY_OUTPUTS'); let total = 0n;
  const vout = Array.from({ length: outputCount }, (_, n) => {
    const amount = take(8).readBigUInt64LE(); total += amount; need(amount <= MAX_MONEY && total <= MAX_MONEY, 'BITCOIN_MONEY_RANGE');
    return { n, amountSatoshi: amount.toString(), script: take(compact(10_000)).toString('hex') };
  });
  const bodyEnd = offset;
  if (witness) for (const input of vin) input.witness = Array.from({ length: compact(128) }, () => take(compact(10_000)).toString('hex'));
  if (witness) need(vin.some(input => input.witness.length > 0), 'BITCOIN_SUPERFLUOUS_WITNESS');
  const locktimeBytes = take(4), locktime = locktimeBytes.readUInt32LE(); need(offset === wire.length, 'BITCOIN_TRAILING_WIRE');
  const stripped = Buffer.concat([versionBytes, wire.subarray(bodyStart, bodyEnd), locktimeBytes]);
  return immutable({ txid: txHash(stripped), wtxid: txHash(wire), transactionSHA256: hash(wire).toString('hex'), version, locktime, witness, vin, vout, unsignedTransaction: stripped.toString('hex') });
}

/** Bind the complete funded transaction, including its one source and one change output. */
export function validateBitcoinTransferWire(rawTransaction, expected, { signed = false } = {}) {
  exactOptions(expected, ['sourceTxid', 'sourceVout', 'sourceScript', 'sourceSatoshi', 'recipientScript', 'amountSatoshi', 'changeScript', 'feeSatoshi'], ['sourceTxid', 'sourceVout', 'sourceScript', 'sourceSatoshi', 'recipientScript', 'amountSatoshi', 'changeScript', 'feeSatoshi']);
  const decoded = decodeBitcoinTransaction(rawTransaction), amount = sats(expected.amountSatoshi);
  const sourceAmount = uint(expected.sourceSatoshi, MAX_MONEY, 'BITCOIN_INVALID_SOURCE_AMOUNT');
  const fee = uint(expected.feeSatoshi, BigInt(BITCOIN_TRANSFER_LIMITS.maximumFeeSatoshi), 'BITCOIN_FEE_LIMIT');
  need(fee > 0n, 'BITCOIN_FEE_LIMIT'); hex32(expected.sourceTxid);
  need(Number.isSafeInteger(expected.sourceVout) && expected.sourceVout >= 0 && expected.sourceVout <= 0xffffffff && !Object.is(expected.sourceVout, -0), 'BITCOIN_INVALID_SOURCE_VOUT');
  for (const name of ['sourceScript', 'recipientScript', 'changeScript']) p2wpkh(expected[name]);
  need(expected.recipientScript !== expected.sourceScript && expected.recipientScript !== expected.changeScript, 'BITCOIN_RECIPIENT_IS_SOURCE');
  need(decoded.version === 2 && decoded.locktime === 0 && decoded.vin.length === 1 && decoded.vout.length === 2 && decoded.witness === signed, 'BITCOIN_UNEXPECTED_TRANSFER_SHAPE');
  const input = decoded.vin[0];
  need(input.txid === expected.sourceTxid && input.vout === expected.sourceVout && input.sequence === 0xfffffffe && input.scriptSig === '', 'BITCOIN_SOURCE_INPUT_MISMATCH');
  need(decoded.vout[0].script === expected.recipientScript && BigInt(decoded.vout[0].amountSatoshi) === amount, 'BITCOIN_RECIPIENT_OUTPUT_MISMATCH');
  need(decoded.vout[1].script === expected.changeScript && BigInt(decoded.vout[1].amountSatoshi) > 0n && amount + BigInt(decoded.vout[1].amountSatoshi) + fee === sourceAmount, 'BITCOIN_CHANGE_OR_FEE_MISMATCH');
  if (signed) {
    need(input.witness.length === 2, 'BITCOIN_UNEXPECTED_WITNESS');
    const [signature, publicKey] = input.witness;
    need(/^(02|03)[0-9a-f]{64}$/.test(publicKey) && '0014' + hash160(Buffer.from(publicKey, 'hex')) === expected.sourceScript, 'BITCOIN_SIGNER_SOURCE_MISMATCH');
    const sig = Buffer.from(signature, 'hex');
    need(sig.length >= 9 && sig.length <= 73 && sig[0] === 0x30 && sig[1] === sig.length - 3 && sig.at(-1) === 1, 'BITCOIN_SIGHASH_ALL_REQUIRED');
  }
  return decoded;
}

/** Pure stable-tip/canonical-membership validation for a retained owned transfer. */
export function validateBitcoinTransferObservation({ expected, transaction, sourceTransaction, header, headerAgain, canonical, canonicalAgain, block, tipBefore, tipAfter, tipHeader, walletTransaction }) {
  const decoded = validateBitcoinTransferWire(transaction?.hex, expected.intent, { signed: true });
  need(transaction.hex === expected.rawTransaction && decoded.txid === expected.txid && transaction.txid === expected.txid, 'BITCOIN_OBSERVED_WIRE_MISMATCH');
  need(tipBefore === tipAfter, 'BITCOIN_OBSERVATION_UNSTABLE'); hex32(tipAfter);
  need(transaction.blockhash && transaction.blockhash === canonical && canonical === canonicalAgain, 'BITCOIN_BLOCK_NOT_CANONICAL');
  hex32(canonical); const blockHeight = height(header?.height), tipHeight = height(tipHeader?.height);
  need(header.hash === canonical && headerAgain?.hash === canonical && headerAgain.height === blockHeight && header.confirmations === headerAgain.confirmations, 'BITCOIN_OBSERVATION_UNSTABLE');
  need(tipHeader.hash === tipAfter && tipHeight >= blockHeight && headerAgain.confirmations === tipHeight - blockHeight + 1, 'BITCOIN_INCOHERENT_CONFIRMATIONS');
  need(transaction.confirmations === headerAgain.confirmations && block?.hash === canonical && block.height === blockHeight && block.confirmations === headerAgain.confirmations, 'BITCOIN_BLOCK_CONTEXT_MISMATCH');
  need(Array.isArray(block.tx) && block.tx.filter(item => item === expected.txid).length === 1, 'BITCOIN_BLOCK_MEMBERSHIP_MISMATCH');
  const source = decodeBitcoinTransaction(sourceTransaction?.hex), input = decoded.vin[0], previousOutput = source.vout[input.vout];
  need(source.txid === input.txid && sourceTransaction.txid === input.txid && previousOutput?.script === expected.intent.sourceScript && previousOutput.amountSatoshi === expected.intent.sourceSatoshi, 'BITCOIN_PREVIOUS_OUTPUT_MISMATCH');
  need(walletTransaction?.hex === expected.rawTransaction && walletTransaction.txid === expected.txid && typeof walletTransaction.fee === 'number' && walletTransaction.fee < 0 && bitcoinSatoshiFromAmount(-walletTransaction.fee) === expected.intent.feeSatoshi, 'BITCOIN_WALLET_FEE_MISMATCH');
  return immutable({ genesis: BITCOIN_REGTEST_GENESIS, txid: expected.txid, wtxid: decoded.wtxid, rawTransaction: expected.rawTransaction, transactionSHA256: decoded.transactionSHA256,
    vout: 0, amountSatoshi: expected.intent.amountSatoshi, recipient: expected.recipient, recipientScript: expected.intent.recipientScript,
    source: expected.source, sourceScript: expected.intent.sourceScript, sourceTxid: input.txid, sourceVout: input.vout, sourceSatoshi: expected.intent.sourceSatoshi,
    changeAddress: expected.changeAddress, changeVout: 1, changeScript: expected.intent.changeScript, changeSatoshi: decoded.vout[1].amountSatoshi, feeSatoshi: expected.intent.feeSatoshi,
    blockhash: canonical, blockHeight, confirmations: headerAgain.confirmations, observedTip: tipAfter, observedTipHeight: tipHeight,
    success: true, finalized: headerAgain.confirmations >= BITCOIN_TRANSFER_LIMITS.minimumConfirmations,
    assurance: 'trusted-owned-local-rpc-observation-not-independent-consensus-proof' });
}

/** No import-time execution and no caller-selected executable, wallet, endpoint or RPC method. */
const ownedBitcoinRuntimes = new WeakSet();
export function assertOwnedBitcoinRuntime(runtime) {
  need(ownedBitcoinRuntimes.has(runtime), 'BITCOIN_OWNED_RUNTIME_CAPABILITY');
}

export async function createOwnedBitcoinRuntime() {
  need(arguments.length === 0, 'BITCOIN_FIXED_CONSTRUCTOR');
  need(process.platform === 'linux' && process.arch === 'x64', 'BITCOIN_RUNTIME_REQUIRES_LINUX_X64');
  const binaries = { bitcoin: await pinnedBinary(...bitcoinRuntimePins.bitcoin), cli: await pinnedBinary(...bitcoinRuntimePins.cli) };
  const cwd = await scratchDirectory('generic-bitcoin-');
  let handle, rpc, closed = false, closing = false, closeResult, busy = false, signingUnresolved = false;
  let preSignReadWindow = false, observationBusy = false;
  const records = new Map();
  const live = () => { need(!closed && !closing, 'BITCOIN_RUNTIME_CLOSED'); handle?.assertAlive(); need(!handle?.child.signalCode, 'BITCOIN_RUNTIME_EXITED'); };
  const processStatus = () => ({ processId: handle?.child.pid ?? null, running: !!handle?.child.pid && handle.child.exitCode === null && handle.child.signalCode === null && !closed, exitCode: handle?.child.exitCode ?? null, signal: handle?.child.signalCode ?? null, closed, signingUnresolved });
  const close = async () => {
    if (closed) return clone(closeResult);
    need(!closing, 'BITCOIN_CLOSE_IN_PROGRESS'); closing = true;
    try {
      // Signal only this exact ChildProcess. No caller-controlled stop target.
      const stopped = handle ? await stopOwnProcess(handle) : { stopped: true, forced: false };
      await removeOwnScratch(cwd); closed = true;
      closeResult = { ownedProcessStopped: stopped.stopped, forced: stopped.forced, syntheticWalletsAndLedgerRemoved: true }; return clone(closeResult);
    } finally { closing = false; }
  };
  try {
    const dataDir = join(cwd, 'bitcoin'), walletDir = join(dataDir, 'wallets'); await mkdir(walletDir, { recursive: true, mode: 0o700 });
    const port = await unusedLoopbackPort(), config = join(dataDir, 'bitcoin.conf');
    await writeFile(config, `regtest=1\nserver=1\nlisten=0\nlistenonion=0\ndiscover=0\ndns=0\ndnsseed=0\nfixedseeds=0\nnetworkactive=0\nnatpmp=0\n[regtest]\nconnect=0\nrpcport=${port}\nrpcbind=127.0.0.1\nrpcallowip=127.0.0.1\nrpcuser=synthetic-generic\nrpcpassword=${randomBytes(32).toString('hex')}\n`, { mode: 0o600 });
    const common = [`-datadir=${dataDir}`, `-conf=${config}`, '-regtest'];
    handle = startOwnProcess(binaries.bitcoin, [...common, `-walletdir=${walletDir}`, '-nosettings', '-txindex=1', '-fallbackfee=0.0002', '-printtoconsole=0'], dataDir);
    rpc = async (method, params = [], wallet) => {
      live();
      try {
        const result = await exec(binaries.cli, [...common, '-rpcconnect=127.0.0.1', `-rpcport=${port}`, ...(wallet ? [`-rpcwallet=${wallet}`] : []), method, ...params.map(value => typeof value === 'string' ? value : JSON.stringify(value))], { cwd: dataDir, env: isolatedRuntimeEnvironment(dataDir), timeout: 15_000, windowsHide: true, maxBuffer: 4 * 1024 * 1024 });
        const text = result.stdout.trim(); if (!text) return null;
        try { return JSON.parse(text); } catch { return text; }
      } catch (cause) {
        const error = new Error('BITCOIN_OWNED_RPC_FAILED'); error.rpcCode = /error code:\s*(-?\d+)/.exec(cause.stderr || '')?.[1] ?? null; throw error;
      }
    };
    let info;
    for (let attempt = 0; attempt < 100; attempt++) { live(); try { info = await rpc('getblockchaininfo'); break; } catch {} await sleep(100); }
    need(info?.chain === 'regtest', 'BITCOIN_REGTEST_STARTUP_FAILED');
    const health = async () => {
      live();
      const chain = await rpc('getblockchaininfo'), network = await rpc('getnetworkinfo'), genesis = await rpc('getblockhash', [0]);
      need(chain.chain === 'regtest' && genesis === BITCOIN_REGTEST_GENESIS, 'BITCOIN_WRONG_GENESIS');
      need(network.networkactive === false && network.connections === 0, 'BITCOIN_NETWORK_ISOLATION_FAILED');
      return { healthy: true, genesis, network: 'regtest', connections: 0, networkActive: false, height: height(chain.blocks), tip: hex32(chain.bestblockhash), process: processStatus() };
    };
    await health();
    for (const wallet of [SOURCE_WALLET, ...RECIPIENT_WALLETS]) await rpc('createwallet', [wallet]);
    const source = await rpc('getnewaddress', ['', 'bech32'], SOURCE_WALLET), changeAddress = await rpc('getrawchangeaddress', ['bech32'], SOURCE_WALLET);
    const recipients = [];
    for (const wallet of RECIPIENT_WALLETS) recipients.push(await rpc('getnewaddress', ['', 'bech32'], wallet));
    need(new Set([source, changeAddress, ...recipients]).size === 4, 'BITCOIN_DUPLICATE_FIXTURE_ADDRESS');
    const addressInfo = async (address, wallet) => { const result = await rpc('getaddressinfo', [address], wallet); need(result.ismine === true && result.address === address, 'BITCOIN_OWNED_ADDRESS_REQUIRED'); p2wpkh(result.scriptPubKey); return result; };
    const sourceScript = (await addressInfo(source, SOURCE_WALLET)).scriptPubKey, changeScript = (await addressInfo(changeAddress, SOURCE_WALLET)).scriptPubKey;
    const recipientScripts = [];
    for (let i = 0; i < recipients.length; i++) recipientScripts.push((await addressInfo(recipients[i], RECIPIENT_WALLETS[i])).scriptPubKey);
    await rpc('generatetoaddress', [101, source]); await health();
    const metadata = immutable({ profile: BITCOIN_OWNED_PROFILE, classification: 'OWNED_LOCAL_BITCOIN_REGTEST_ONLY', bitcoinGenesis: BITCOIN_REGTEST_GENESIS, bitcoinNetwork: 'regtest', bitcoinPeers: 0, bitcoinNetworkActive: false,
      runtimePins: clone(bitcoinRuntimePins), processId: handle.child.pid, freshSyntheticWallets: true, source, sourceScript, changeAddress, changeScript, recipients: [...recipients], recipientScripts: [...recipientScripts], limits: clone(BITCOIN_TRANSFER_LIMITS), signing: 'Owned Core synthetic wallets only', assurance: 'trusted-owned-local-rpc-observation-not-independent-consensus-proof' });
    const transfer = async (amountSatoshi, options) => {
      const amount = sats(amountSatoshi); exactOptions(options, ['recipientIndex', 'beforeSign', 'onSigned'], ['beforeSign', 'onSigned']);
      const recipientIndex = index(options.recipientIndex ?? 0), { beforeSign, onSigned } = options;
      need(typeof beforeSign === 'function' && typeof onSigned === 'function', 'BITCOIN_REQUIRED_SIGNING_CALLBACKS');
      live(); need(!busy && !observationBusy, 'BITCOIN_OPERATION_BUSY');
      need(!signingUnresolved, 'BITCOIN_PRIOR_SIGNING_UNRESOLVED');
      need(![...records.values()].some(record => record.phase !== 'OBSERVED_CONFIRMED'), 'BITCOIN_PRIOR_TRANSFER_UNRESOLVED');
      busy = true; let record;
      try {
        await health();
        const recipient = recipients[recipientIndex], recipientScript = recipientScripts[recipientIndex];
        need((await addressInfo(recipient, RECIPIENT_WALLETS[recipientIndex])).scriptPubKey === recipientScript, 'BITCOIN_RECIPIENT_SCRIPT_CHANGED');
        const unspent = await rpc('listunspent', [1, 9999999, [source]], SOURCE_WALLET);
        need(Array.isArray(unspent), 'BITCOIN_INVALID_UNSPENT_RESULT');
        const coin = unspent.find(item => item.spendable === true && item.solvable === true && item.safe === true && item.scriptPubKey === sourceScript && BigInt(bitcoinSatoshiFromAmount(item.amount)) > amount + BigInt(BITCOIN_TRANSFER_LIMITS.maximumFeeSatoshi));
        need(coin, 'BITCOIN_INSUFFICIENT_OWNED_INVENTORY');
        const selectedAddress = source;
        need((await addressInfo(selectedAddress, SOURCE_WALLET)).scriptPubKey === coin.scriptPubKey, 'BITCOIN_SOURCE_SCRIPT_CHANGED');
        const previousTransaction = await rpc('getrawtransaction', [hex32(coin.txid), true]), previous = decodeBitcoinTransaction(previousTransaction.hex);
        need(previous.txid === coin.txid && previousTransaction.txid === coin.txid && previous.vout[coin.vout]?.script === coin.scriptPubKey && previous.vout[coin.vout].amountSatoshi === bitcoinSatoshiFromAmount(coin.amount), 'BITCOIN_PREVIOUS_OUTPUT_MISMATCH');
        const raw = await rpc('createrawtransaction', [[{ txid: hex32(coin.txid), vout: coin.vout, sequence: 0xfffffffe }], [{ [recipient]: bitcoinAmountFromSatoshi(amountSatoshi) }], 0, false]);
        const funded = await rpc('fundrawtransaction', [raw, { add_inputs: false, changeAddress, changePosition: 1, fee_rate: 1, lockUnspents: true, replaceable: false }], SOURCE_WALLET);
        need(funded.changepos === 1, 'BITCOIN_FIXED_CHANGE_REQUIRED');
        const intent = immutable({ sourceTxid: coin.txid, sourceVout: coin.vout, sourceScript: coin.scriptPubKey, sourceSatoshi: bitcoinSatoshiFromAmount(coin.amount), recipientScript, amountSatoshi, changeScript, feeSatoshi: bitcoinSatoshiFromAmount(funded.fee) });
        const unsigned = validateBitcoinTransferWire(funded.hex, intent);
        await health();
        // Distinct last authorization boundary: complete unsigned intent exists,
        // and no RPC or other asynchronous step intervenes before wallet signing.
        // The writer remains locked while the final authorization checks run.
        // Their fresh health scan may read an older, already confirmed transfer.
        // Permit only that read, serially; signing, mining and new transfers stay
        // blocked. The new unsigned intent is not yet in the receipt registry.
        preSignReadWindow = true;
        try {
          need(await beforeSign(immutable({ genesis: BITCOIN_REGTEST_GENESIS, source: selectedAddress, recipient, recipientIndex, changeAddress, intent: clone(intent), unsignedTransaction: funded.hex, transactionSHA256: unsigned.transactionSHA256 })) === undefined, 'BITCOIN_BEFORE_SIGN_CALLBACK_MUST_ASSERT');
        } finally { preSignReadWindow = false; }
        need(!observationBusy, 'BITCOIN_PRE_SIGN_OBSERVATION_NOT_AWAITED');
        signingUnresolved = true; // A lost/rejected signer reply cannot authorize another signing attempt.
        const signed = await rpc('signrawtransactionwithwallet', [funded.hex], SOURCE_WALLET);
        need(signed.complete === true, 'BITCOIN_SIGNING_INCOMPLETE');
        const decoded = validateBitcoinTransferWire(signed.hex, intent, { signed: true });
        need(decoded.unsignedTransaction === funded.hex, 'BITCOIN_SIGNED_INTENT_CHANGED');
        need(!records.has(decoded.txid), 'BITCOIN_ALREADY_SIGNED_IDENTITY');
        record = { genesis: BITCOIN_REGTEST_GENESIS, source: selectedAddress, recipient, recipientIndex, changeAddress, intent: clone(intent), txid: decoded.txid, wtxid: decoded.wtxid, vout: 0, amountSatoshi, rawTransaction: signed.hex, transactionSHA256: decoded.transactionSHA256, phase: 'SIGNED_NOT_BROADCAST', broadcastAttempts: 0, confirmationMiningAttempts: 0 };
        records.set(record.txid, record); signingUnresolved = false;
        // Durable-journal callback must resolve before the first and only send.
        need(await onSigned(immutable(clone(record))) === undefined, 'BITCOIN_SIGNED_CALLBACK_MUST_ASSERT');
        await health();
        const accepted = await rpc('testmempoolaccept', [[record.rawTransaction]]);
        need(Array.isArray(accepted) && accepted.length === 1 && accepted[0].txid === record.txid && accepted[0].allowed === true, 'BITCOIN_LOCAL_MEMPOOL_PREFLIGHT_REJECTED');
        record.phase = 'BROADCAST_UNKNOWN'; record.broadcastAttempts = 1;
        try {
          const returned = await rpc('sendrawtransaction', [record.rawTransaction]);
          need(returned === record.txid, 'BITCOIN_BROADCAST_IDENTITY_MISMATCH'); record.phase = 'BROADCAST'; return clone(record);
        } catch (cause) { const error = new Error('BITCOIN_BROADCAST_UNKNOWN_OBSERVE_EXACT_TXID'); error.rpcCode = cause.rpcCode ?? null; throw error; }
      } catch (error) { if (record) error.transfer = clone(record); throw error; }
      finally { busy = false; }
    };
    const recordFor = txid => { hex32(txid); const record = records.get(txid); need(record, 'BITCOIN_UNKNOWN_SIGNED_IDENTITY'); return record; };
    const observeTransfer = async txid => {
      const record = recordFor(txid);
      need(record.broadcastAttempts === 1, 'BITCOIN_NO_BROADCAST_ATTEMPT');
      record.phase = 'OBSERVATION_UNAVAILABLE';
      if (record.observation) { record.lastObservation = record.observation; delete record.observation; }
      await health();
      for (let attempt = 1; attempt <= 3; attempt++) {
        const tipBefore = await rpc('getbestblockhash'), transaction = await rpc('getrawtransaction', [txid, true]);
        need(transaction.hex === record.rawTransaction && transaction.txid === txid, 'BITCOIN_OBSERVED_WIRE_MISMATCH');
        if (!transaction.blockhash) {
          await rpc('getmempoolentry', [txid]);
          const error = new Error('BITCOIN_PENDING_CONFIRMATIONS_NO_RESEND'); error.transfer = clone(record); throw error;
        }
        const header = await rpc('getblockheader', [transaction.blockhash]), canonical = await rpc('getblockhash', [height(header.height)]);
        const block = await rpc('getblock', [transaction.blockhash, 1]);
        const sourceTransaction = await rpc('getrawtransaction', [record.intent.sourceTxid, true]);
        const walletTransaction = await rpc('gettransaction', [txid], SOURCE_WALLET);
        need((await addressInfo(record.source, SOURCE_WALLET)).scriptPubKey === record.intent.sourceScript, 'BITCOIN_SOURCE_SCRIPT_CHANGED');
        need((await addressInfo(record.recipient, RECIPIENT_WALLETS[record.recipientIndex])).scriptPubKey === record.intent.recipientScript, 'BITCOIN_RECIPIENT_SCRIPT_CHANGED');
        const headerAgain = await rpc('getblockheader', [transaction.blockhash]), canonicalAgain = await rpc('getblockhash', [header.height]), tipHeader = await rpc('getblockheader', [tipBefore]), tipAfter = await rpc('getbestblockhash');
        if (tipBefore !== tipAfter || header.confirmations !== headerAgain.confirmations || header.height !== headerAgain.height || canonical !== canonicalAgain) continue;
        const fact = validateBitcoinTransferObservation({ expected: record, transaction, sourceTransaction, header, headerAgain, canonical, canonicalAgain, block, tipBefore, tipAfter, tipHeader, walletTransaction });
        const observation = { ...fact, observedAt: new Date().toISOString(), observationAttempts: attempt };
        record.phase = fact.finalized ? 'OBSERVED_CONFIRMED' : 'OBSERVED_PENDING'; record.observation = observation; return clone(observation);
      }
      throw new Error('BITCOIN_OBSERVATION_UNSTABLE');
    };
    const observe = async txid => {
      const retained = recordFor(txid);
      live();
      need(!observationBusy, 'BITCOIN_OBSERVATION_BUSY');
      const ownsWriterLock = !busy;
      if (!ownsWriterLock) {
        need(preSignReadWindow, 'BITCOIN_OPERATION_BUSY');
        need(retained.phase === 'OBSERVED_CONFIRMED', 'BITCOIN_PRE_SIGN_REQUIRES_CONFIRMED_HISTORY');
      } else busy = true;
      observationBusy = true;
      try { return await observeTransfer(txid); }
      catch (error) { error.transfer = clone(recordFor(txid)); throw error; }
      finally {
        observationBusy = false;
        if (ownsWriterLock) busy = false;
      }
    };
    const confirm = async txid => {
      const record = recordFor(txid); live(); need(!busy && !observationBusy, 'BITCOIN_OPERATION_BUSY');
      need(record.broadcastAttempts === 1 && record.confirmationMiningAttempts === 0, 'BITCOIN_CONFIRMATION_MINING_ALREADY_USED_OR_NOT_SUBMITTED');
      busy = true;
      try {
        await health();
        const transaction = await rpc('getrawtransaction', [txid, true]);
        need(transaction.hex === record.rawTransaction && transaction.txid === txid, 'BITCOIN_OBSERVED_WIRE_MISMATCH');
        if (transaction.blockhash) {
          const current = await observeTransfer(txid); if (current.finalized) return current;
        } else await rpc('getmempoolentry', [txid]);
        // Consume before mining. A lost response never triggers another mine/send.
        record.confirmationMiningAttempts = 1;
        await rpc('generatetoaddress', [BITCOIN_TRANSFER_LIMITS.minimumConfirmations, source]);
        const fact = await observeTransfer(txid); need(fact.finalized, 'BITCOIN_REQUIRED_CONFIRMATIONS_MISSING'); return fact;
      } catch (error) { error.transfer = clone(record); throw error; }
      finally { busy = false; }
    };
    const runtime = Object.freeze({ genesis: BITCOIN_REGTEST_GENESIS, source, sourceScript, changeAddress, changeScript, recipient: recipients[0], recipientScript: recipientScripts[0], recipients: Object.freeze([...recipients]), recipientScripts: Object.freeze([...recipientScripts]), metadata,
      transfer, observe, confirm, health, processStatus, close, get transfers() { return clone([...records.values()]); } });
    ownedBitcoinRuntimes.add(runtime);
    return runtime;
  } catch (error) {
    try { error.cleanup = await close(); }
    catch (cleanupError) { error.cleanup = { ownedProcessStopped: !processStatus().running, syntheticWalletsAndLedgerRemoved: false, error: cleanupError.message }; }
    throw error;
  }
}
