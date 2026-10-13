import assert from 'node:assert/strict';
import { assertOwnedRecoveryScratchV1, writeInitialNativeCredentialsV1, claimStoppedNativeRecoveryV1, writePrivateRuntimeRecoveryV1, readPrivateRuntimeRecoveryV1, sealStoppedNativeFilesV1, assertStoppedNativeFilesV1, cloneRuntimeRecoveryV1 } from '../../shared/runtime/owned-runtime-recovery-files-v1.mjs';
import { consumeWrappedRuntimeRecoveryV1 } from '../../../claims/wrapped/recovery/wrapped-recovery-authority-v1.mjs';
/** Owned flat BTC adapter. Derived from the frozen golden local runtime.
 * Source base SHA256: 628a683594d657f7ce903eae2f39f7613abc2adeb5337b41343e2c69bfc7c43a.
 * Retains isolated regtest/official binaries/wallet custody/finality/no-resend;
 * adds the reviewed K output and exact pre-sign funds handoff. No public chain.
 */
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, writeFile, open } from 'node:fs/promises';
import { join } from 'node:path';
import { linuxRuntimePins } from '@lianum/engine/chains/shared/linux-runtime-pins';
import { pinnedBinary, scratchDirectory, removeOwnScratch, unusedLoopbackPort, startOwnProcess,
  stopOwnProcess, isolatedRuntimeEnvironment, sleep } from '@lianum/engine/chains/shared/runtime-harness';

import { encodeWireCommitment, validateBitcoinBinding } from '@lianum/engine/native/native-receipt-binding';
import { readBitcoinInventoryOutputs } from '../transfers/owned-bitcoin-inventory-reads.mjs';
import { createOwnedBitcoinInventoryReader } from '../transfers/owned-bitcoin-inventory-rpc.mjs';
import { ownedCustodyRoute, assertOwnedCustodyIntent, summarizeOwnedBitcoinCoins, ownedCustodyFeeAudit, createOwnedCustodyReservationReadWindow } from '../../shared/runtime/owned-native-custody.mjs';
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
const SOLVER_WALLET = 'combined-graph-solver';
const GRAPH_RECIPIENT_WALLETS = Object.freeze(['combined-graph-recipient-0', 'combined-graph-recipient-1']);
export const BITCOIN_REGTEST_GENESIS = '0f9188f13cb7b2c71f2a335e3a4fc328bf5beb436012afca590b1a11466e2206';
export const BITCOIN_CUSTODY_PROFILE = 'OWNED_FLAT_BITCOIN_CUSTODY_V1';
export const BITCOIN_PAYOUT_FINAL_SEND_PROFILE = 'OWNED_BITCOIN_PAYOUT_FINAL_SEND_V1';
export const BITCOIN_CUSTODY_SYNTHETIC_SURPLUS = '5000000000';
export const BITCOIN_OWNED_PROFILE = 'OWNED_FLAT_BITCOIN_REGTEST_RECEIPT_BINDING_V1';
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
  const result = BigInt(value); need(result.toString() === value && result <= maximum, code); return result;
}
function sats(value) {
  const n = uint(value, BigInt(BITCOIN_TRANSFER_LIMITS.maximumSatoshi), 'BITCOIN_INVALID_TRANSFER_SATOSHI');
  need(n > 0n, 'BITCOIN_INVALID_TRANSFER_SATOSHI'); return n;
}
function hex32(value) { need(typeof value === 'string' && value.length === 64 && /^[0-9a-f]{64}$/.test(value), 'BITCOIN_INVALID_HASH'); return value; }
function p2wpkh(value) { need(typeof value === 'string' && value.length === 44 && /^0014[0-9a-f]{40}$/.test(value), 'BITCOIN_P2WPKH_REQUIRED'); return value; }
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
  const checked = validateBitcoinBinding(rawTransaction, expected);
  need(checked.containsWitness === signed, 'BITCOIN_SIGNED_WIRE_REQUIRED');
  const decoded = decodeBitcoinTransaction(rawTransaction);
  need(decoded.txid === checked.txid && decoded.transactionSHA256 === checked.transactionSHA256,
    'BITCOIN_INDEPENDENT_WIRE_IDENTITY');
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
const ownedBitcoinRuntimes = new WeakSet(), ownedBitcoinLiveness = new WeakMap(), ownedBitcoinAuditStates = new WeakMap();
export function assertOwnedBitcoinRuntime(runtime) {
  need(ownedBitcoinRuntimes.has(runtime), 'BITCOIN_OWNED_RUNTIME_CAPABILITY');
}
export function assertOwnedBitcoinRuntimeLive(runtime) {
  assertOwnedBitcoinRuntime(runtime); ownedBitcoinLiveness.get(runtime)();
}
/** Internal state-change fence, not an observation or public projection. */
export function readOwnedBitcoinRuntimeAuditState(runtime) {
  need(arguments.length === 1, 'BITCOIN_AUDIT_STATE_NO_OPTIONS');
  assertOwnedBitcoinRuntimeLive(runtime);
  return ownedBitcoinAuditStates.get(runtime)();
}


export async function createOwnedFlatBitcoinRuntime() {
  need(arguments.length === 0, 'BITCOIN_FIXED_CONSTRUCTOR');
  return createOwnedBitcoinRuntimeProfile(false);
}
export async function createOwnedBitcoinCustodyRuntime() {
  need(arguments.length === 0, 'BITCOIN_CUSTODY_FIXED_CONSTRUCTOR');
  return createOwnedBitcoinRuntimeProfile(true);
}
/** One fixed node with separate claim custody and independently funded graph
 * wallets. The pair is only a container; its two original branded capabilities
 * keep the existing custody and graph interfaces and separate receipt history. */
export async function createOwnedCombinedBitcoinRuntime() {
  need(arguments.length === 0, 'BITCOIN_COMBINED_FIXED_CONSTRUCTOR');
  return createOwnedBitcoinRuntimeProfile(true, true);
}
const originalBitcoinRecoveryCapturesV1=new WeakMap(),originalBitcoinRetentionArmsV1=new WeakMap();
const originalPagedBitcoinRecoveryCapturesV3=new WeakMap();
/** Retain this original graph ledger after a drained, orderly stop. The result
 * belongs in the authenticated supervisor vault, never in a public pairing. */
export async function captureOwnedPagedBitcoinRecoveryV3(runtime){need(arguments.length===1,'BITCOIN_RECOVERY_ARITY');assertOwnedBitcoinRuntime(runtime);const capture=originalPagedBitcoinRecoveryCapturesV3.get(runtime);need(capture,'BITCOIN_RECOVERY_FIXED_PAGED_GRAPH');return capture();}
export async function reopenOwnedPagedBitcoinRecoveryV3(token){need(arguments.length===1,'BITCOIN_RECOVERY_ARITY');const {consumeOriginalPagedRuntimeRecoveryV3}=await import('../../../operations/recovery/paged-runtime-recovery-authority-v3.mjs');const record=consumeOriginalPagedRuntimeRecoveryV3(token,'bitcoin');return createOwnedBitcoinRuntimeProfile(false,false,record,true);}
export async function armOwnedBitcoinRecoveryRetentionV1(runtime){need(arguments.length===1,'BITCOIN_RETENTION_ARITY');assertOwnedBitcoinRuntime(runtime);const arm=originalBitcoinRetentionArmsV1.get(runtime);need(arm,'BITCOIN_RETENTION_FIXED_CUSTODY');return arm();}
export async function captureOwnedBitcoinRecoveryV1(runtime){need(arguments.length===1,'BITCOIN_RECOVERY_ARITY');assertOwnedBitcoinRuntime(runtime);const capture=originalBitcoinRecoveryCapturesV1.get(runtime);need(capture,'BITCOIN_RECOVERY_FIXED_CUSTODY');return capture();}
export async function reopenOwnedBitcoinRecoveryV1(token){need(arguments.length===1,'BITCOIN_RECOVERY_ARITY');const record=consumeWrappedRuntimeRecoveryV1(token,'bitcoin');return createOwnedBitcoinRuntimeProfile(true,false,record);}
async function createOwnedBitcoinRuntimeProfile(custody, combined = false,recovery=null,pagedRecovery=false) {
  // Fixed lazy bridge: decoding/importing BTC source must not initialize the
  // claim controller graph. Only an actual custody factory needs this module.
  const bitcoinPayoutController = custody ? await import('../../../claims/payouts/payout-controller-dispatch-v1.mjs') : null;
  const originalKeyControllerV4 = custody ? await import('../../../claims/payouts/payout-controller-dispatch-v1.mjs') : null;
  need(process.platform === 'linux' && process.arch === 'x64', 'BITCOIN_RUNTIME_REQUIRES_LINUX_X64');
  const binaries = { bitcoin: await pinnedBinary(...bitcoinRuntimePins.bitcoin), cli: await pinnedBinary(...bitcoinRuntimePins.cli) };
  let restored=null;
  need(!pagedRecovery||(!custody&&!combined&&recovery),'BITCOIN_RECOVERY_FIXED_PAGED_GRAPH');
  if(recovery){need(!combined&&(pagedRecovery?!custody:custody),'BITCOIN_RECOVERY_FIXED_CUSTODY');need(recovery.schema==='OWNED_FIXED_BITCOIN_CAPTURE_V1'&&recovery.family==='bitcoin','BITCOIN_RECOVERY_RECORD');need(recovery.terminal.ownedProcessStopped===true&&recovery.terminal.forced===false,'BITCOIN_RECOVERY_TERMINAL');await assertOwnedRecoveryScratchV1(recovery.cwd,'flat-bitcoin-');await assertStoppedNativeFilesV1(recovery.cwd,recovery.files);restored=await readPrivateRuntimeRecoveryV1(recovery.cwd,recovery.privateRecord);need(restored.schema==='OWNED_FIXED_BITCOIN_PRIVATE_RECOVERY_V1'&&restored.cwd===recovery.cwd&&restored.genesis===BITCOIN_REGTEST_GENESIS,'BITCOIN_RECOVERY_IDENTITY');assert.deepEqual(restored.runtimePins,bitcoinRuntimePins);assert.equal(restored.processGeneration,recovery.processGeneration,'NATIVE_RECOVERY_GENERATION_MISMATCH');if(pagedRecovery){need(restored.pagedProfile==='PAGED_GRAPH_ONLY_V3'&&recovery.pagedProfile==='PAGED_GRAPH_ONLY_V3','BITCOIN_RECOVERY_FIXED_PAGED_GRAPH');assert.deepEqual(Object.keys(restored.profiles),[SOURCE_WALLET]);}else need(!restored.pagedProfile,'BITCOIN_RECOVERY_FIXED_CUSTODY');await claimStoppedNativeRecoveryV1(recovery.cwd,recovery);}
  const cwd = restored?restored.cwd:await scratchDirectory('flat-bitcoin-');
  let initialPrivateRecord=null;
  let recoveryCapturing=false,recoveryRetained=Boolean(restored),recoveryCapture=null,recoveryCaptureResult=null,recoveryRpc;
  const recoveryProfiles={},processGeneration=restored?restored.processGeneration+1:0;need(Number.isSafeInteger(processGeneration)&&processGeneration>=0&&processGeneration<16,'BITCOIN_RECOVERY_GENERATION');
  let handle, rpc, inventoryReader, closed = false, closing = false, closeResult, busy = false, signingUnresolved = false;
  let preSignReadWindow = false, payoutReadWindow = false, observationBusy = false, activePrepared = null, activeRoute = null, inventoryBusy = false, nativeAsset = null;
  const lifetimeId = randomUUID();
  let readGeneration = 0n, mutationGeneration = 0n, activeNativeReads = 0, activeNativeMutations = 0, activeNativeReadOperations = 0;
  let nativePersistenceFailed = false, nativeIsolationFailed = false;
  const mutationMethods = new Set(['createwallet','getnewaddress','getrawchangeaddress','generatetoaddress',
    'fundrawtransaction','signrawtransactionwithwallet','sendrawtransaction','lockunspent']);
  const allRecords = new Map(), ownedAddresses = new Set(), ownedScripts = new Set();
  const reservationReads = createOwnedCustodyReservationReadWindow();
  const live = () => { need(!closed && !closing && !recoveryCapturing, 'BITCOIN_RUNTIME_CLOSED'); handle?.assertAlive(); need(!handle?.child.signalCode, 'BITCOIN_RUNTIME_EXITED'); };
  const processStatus = () => ({ processId: handle?.child.pid ?? null, running: !!handle?.child.pid && handle.child.exitCode === null && handle.child.signalCode === null && !closed, exitCode: handle?.child.exitCode ?? null, signal: handle?.child.signalCode ?? null, closed, signingUnresolved });
  const close = async () => {
    if (closed) return clone(closeResult);
    if(recoveryRetained&&!recoveryCapturing&&recoveryCapture){try{await recoveryCapture();return clone(closeResult);}catch(error){recoveryCapturing=true;try{await close();}catch(cleanup){throw new AggregateError([error,cleanup],'BITCOIN_RECOVERY_CAPTURE_AND_STOP_FAILED');}throw error;}}
    need(!closing, 'BITCOIN_CLOSE_IN_PROGRESS'); closing = true;
    try {
      await inventoryReader?.close();
      // Signal only this exact ChildProcess. No caller-controlled stop target.
      const stopped = handle ? await stopOwnProcess(handle) : { stopped: true, forced: false };
      if(!recoveryRetained)await removeOwnScratch(cwd); closed = true;
      closeResult = { ownedProcessStopped: stopped.stopped, forced: stopped.forced, syntheticWalletsAndLedgerRemoved: !recoveryRetained, retainedForRecovery:recoveryRetained }; return clone(closeResult);
    } finally { closing = false; }
  };
  try {
    const dataDir = join(cwd, 'bitcoin'), walletDir = join(dataDir, 'wallets'); await mkdir(walletDir, { recursive: true, mode: 0o700 });
    const port = await unusedLoopbackPort(), config = join(dataDir, 'bitcoin.conf'), password = restored?restored.rpcPassword:randomBytes(32).toString('hex');
    await writeFile(config, `regtest=1\nserver=1\nlisten=0\nlistenonion=0\ndiscover=0\ndns=0\ndnsseed=0\nfixedseeds=0\nnetworkactive=0\nnatpmp=0\n[regtest]\nconnect=0\nrpcport=${port}\nrpcbind=127.0.0.1\nrpcallowip=127.0.0.1\nrpcuser=synthetic-generic\nrpcpassword=${password}\n`, { mode: 0o600 });
    const common = [`-datadir=${dataDir}`, `-conf=${config}`, '-regtest'];
    handle = startOwnProcess(binaries.bitcoin, [...common, `-walletdir=${walletDir}`, '-nosettings', '-txindex=1', '-fallbackfee=0.0002', '-printtoconsole=0'], dataDir);
    const callOwned = async (method, params = [], wallet, capturing=false) => {
      if(capturing){need(recoveryCapturing,'BITCOIN_RECOVERY_CAPTURE_FENCE');handle.assertAlive();}else live(); readGeneration++; activeNativeReads++;
      const mutating = mutationMethods.has(method);
      if (mutating) { mutationGeneration++; activeNativeMutations++; }
      try {
        const result = await exec(binaries.cli, [...common, '-rpcconnect=127.0.0.1', `-rpcport=${port}`, ...(wallet ? [`-rpcwallet=${wallet}`] : []), method, ...params.map(value => typeof value === 'string' ? value : JSON.stringify(value))], { cwd: dataDir, env: isolatedRuntimeEnvironment(dataDir), timeout: 15_000, windowsHide: true, maxBuffer: 4 * 1024 * 1024 });
        const text = result.stdout.trim(); if (!text) return null;
        try { return JSON.parse(text); } catch { return text; }
      } catch (cause) {
        const error = new Error('BITCOIN_OWNED_RPC_FAILED'); error.rpcCode = /error code:\s*(-?\d+)/.exec(cause.stderr || '')?.[1] ?? null; throw error;
      } finally { activeNativeReads--; if (mutating) activeNativeMutations--; }
    };
    rpc=(method,params=[],wallet)=>callOwned(method,params,wallet,false);recoveryRpc=(method,params=[],wallet)=>callOwned(method,params,wallet,true);
    inventoryReader = createOwnedBitcoinInventoryReader(port, password);
    const inventoryRpc = async (method, [txid, vout, includeMempool]) => {
      need(method === 'gettxout' && includeMempool === true, 'BITCOIN_INVENTORY_READ_ONLY'); live();
      readGeneration++; activeNativeReads++;
      try { const output = await inventoryReader.getTxOut(txid, vout); live(); return output; }
      finally { activeNativeReads--; }
    };
    let info;
    for (let attempt = 0; attempt < 100; attempt++) { live(); try { info = await rpc('getblockchaininfo'); break; } catch {} await sleep(100); }
    need(info?.chain === 'regtest', 'BITCOIN_REGTEST_STARTUP_FAILED');
    const health = async () => {
      activeNativeReadOperations++;
      try {
      readGeneration++; live();
      const chain = await rpc('getblockchaininfo'), network = await rpc('getnetworkinfo'), genesis = await rpc('getblockhash', [0]);
      need(chain.chain === 'regtest' && genesis === BITCOIN_REGTEST_GENESIS, 'BITCOIN_WRONG_GENESIS');
      if (!(network.networkactive === false && network.connections === 0)) nativeIsolationFailed = true;
      need(!nativeIsolationFailed, 'BITCOIN_NETWORK_ISOLATION_FAILED');
      return { healthy: true, genesis, network: 'regtest', connections: 0, networkActive: false, height: height(chain.blocks), tip: hex32(chain.bestblockhash), process: processStatus() };
      } finally { activeNativeReadOperations--; readGeneration++; }
    };
    await health();
    async function createProfile(custody, sourceWalletName, recipientWalletNames, solver = false) {
      const saved=restored?.profiles[sourceWalletName]??null;need(!restored||saved,'BITCOIN_RECOVERY_PROFILE');
      const records = new Map(), preparedObservations = new WeakMap();
      for (const wallet of [sourceWalletName, ...recipientWalletNames]) await rpc(saved?'loadwallet':'createwallet', [wallet]);
      const source = saved?saved.source:await rpc('getnewaddress', ['', 'bech32'], sourceWalletName), changeAddress = saved?saved.changeAddress:await rpc('getrawchangeaddress', ['bech32'], sourceWalletName);
      const recipients = saved?[...saved.recipients]:[];
      if(!saved)for (const wallet of recipientWalletNames) recipients.push(await rpc('getnewaddress', ['', 'bech32'], wallet));
      need(new Set([source, changeAddress, ...recipients]).size === 4, 'BITCOIN_DUPLICATE_FIXTURE_ADDRESS');
      const addressInfo = async (address, wallet) => { const result = await rpc('getaddressinfo', [address], wallet); need(result.ismine === true && result.address === address, 'BITCOIN_OWNED_ADDRESS_REQUIRED'); p2wpkh(result.scriptPubKey); return result; };
      const sourceScript = (await addressInfo(source, sourceWalletName)).scriptPubKey, changeScript = (await addressInfo(changeAddress, sourceWalletName)).scriptPubKey;
      const recipientScripts = [];
      for (let i = 0; i < recipients.length; i++) recipientScripts.push((await addressInfo(recipients[i], recipientWalletNames[i])).scriptPubKey);
      if (combined) {
        // No graph endpoint or change address can alias any custody wallet role.
        for (const address of [source, changeAddress, ...recipients]) {
          need(!ownedAddresses.has(address), 'BITCOIN_COMBINED_WALLET_ALIAS'); ownedAddresses.add(address);
        }
        for (const script of [sourceScript, changeScript, ...recipientScripts]) {
          need(!ownedScripts.has(script), 'BITCOIN_COMBINED_SCRIPT_ALIAS'); ownedScripts.add(script);
        }
      }
      // Fresh, unissued fixture only: bound each initial mining call while
      // keeping the same 101 blocks and the original fifteen-second RPC cap.
      const fundingBlocks = saved?[]:await (async () => {
        const blocks = [];
        while (blocks.length < 101) {
          const count = Math.min(10, 101 - blocks.length);
          const batch = await rpc('generatetoaddress', [count, source]);
          need(Array.isArray(batch) && batch.length === count, 'BITCOIN_BOOTSTRAP_BATCH_LENGTH');
          for (const block of batch) blocks.push(hex32(block));
          need(new Set(blocks).size === blocks.length, 'BITCOIN_BOOTSTRAP_DUPLICATE_BLOCK');
        }
        need(blocks.length === 101, 'BITCOIN_BOOTSTRAP_BLOCK_COUNT');
        return blocks;
      })();
      const fundedHead = await health();
      let syntheticFunding = saved?.syntheticFunding??null;
      if (solver&&!saved) {
        // Coinbase maturity is established before either capability is exposed.
        // This grant and all graph mining rewards remain outside claim inventory.
        const fundingBlock = await rpc('getblock', [fundingBlocks[0], 2]);
        const coin = fundingBlock.tx[0], output = coin.vout.find(item => item.scriptPubKey.hex === sourceScript);
        need(output, 'BITCOIN_GRAPH_SYNTHETIC_FUNDING');
        const amount = bitcoinSatoshiFromAmount(output.value);
        const unspent = await rpc('gettxout', [hex32(coin.txid), output.n, true]);
        need(unspent && unspent.coinbase === true && unspent.confirmations >= 101
          && unspent.bestblock === fundedHead.tip && unspent.scriptPubKey.hex === sourceScript
          && bitcoinSatoshiFromAmount(unspent.value) === amount
          && BigInt(amount) > BigInt(BITCOIN_TRANSFER_LIMITS.maximumSatoshi) + BigInt(BITCOIN_TRANSFER_LIMITS.maximumFeeSatoshi),
        'BITCOIN_GRAPH_SYNTHETIC_FUNDING');
        syntheticFunding = immutable({ classification: 'SYNTHETIC_LOCAL_GRAPH_LIQUIDITY_NOT_USER_BACKING',
          origin: 'MATURE_SYNTHETIC_REGTEST_COINBASE', nativeId: coin.txid, vout: String(output.n),
          amount, fee: '0', sourceScript, confirmations: String(unspent.confirmations) });
      }
      const roles = immutable({ depositor: { address: source, endpoint: sourceScript },
        escrow: { address: recipients[0], endpoint: recipientScripts[0] },
        recipient: { address: recipients[1], endpoint: recipientScripts[1] } });
      const wallets = { depositor: sourceWalletName, escrow: recipientWalletNames[0], recipient: recipientWalletNames[1] };
      const custodyRoute = name => {
        const spec = ownedCustodyRoute(name), from = roles[spec.sourceRole], to = roles[spec.destinationRole];
        return immutable({ name, ...spec, source: from.address, sourceScript: from.endpoint,
          sourceWallet: wallets[spec.sourceRole], recipient: to.address, recipientScript: to.endpoint,
          recipientWallet: wallets[spec.destinationRole], changeAddress: from.address, changeScript: from.endpoint });
      };
      const pagedRecipients = new Map();
      if(pagedRecovery){need(Array.isArray(saved.pagedRecipients)&&saved.pagedRecipients.length<=62,'BITCOIN_RECOVERY_RECIPIENT_BOUND');for(const row of saved.pagedRecipients){const route=clone(row);need(route.recipientIndex===recipients.length+pagedRecipients.size&&route.externalRecipient===true&&route.name===null&&route.recipientWallet===null,'BITCOIN_RECOVERY_RECIPIENT_ORDER');assert.deepEqual({source:route.source,sourceScript:route.sourceScript,sourceWallet:route.sourceWallet,changeAddress:route.changeAddress,changeScript:route.changeScript},{source,sourceScript,sourceWallet:sourceWalletName,changeAddress,changeScript});const info=await rpc('validateaddress',[route.recipient]);need(info.isvalid===true&&info.address===route.recipient&&p2wpkh(info.scriptPubKey)===route.recipientScript,'BITCOIN_RECOVERY_RECIPIENT_SCRIPT');need(route.recipientScript!==sourceScript&&route.recipientScript!==changeScript,'BITCOIN_GRAPH_SELF_PAYMENT');pagedRecipients.set(route.recipientIndex,immutable(route));}}
      function graphRecipientIndex(value){need(Number.isSafeInteger(value)&&!Object.is(value,-0)&&value>=0&&value<64&&(value<recipients.length||pagedRecipients.has(value)),'BITCOIN_INVALID_GRAPH_RECIPIENT');return value;}
      const graphRoute = recipientIndex => {
        graphRecipientIndex(recipientIndex);
        if(pagedRecipients.has(recipientIndex))return pagedRecipients.get(recipientIndex);
        return { name: null, recipientIndex, source, sourceScript,
          sourceWallet: sourceWalletName, recipient: recipients[recipientIndex], recipientScript: recipientScripts[recipientIndex],
          recipientWallet: recipientWalletNames[recipientIndex], changeAddress, changeScript };
      };
      async function recipientInfo(route){
        if(!route.externalRecipient)return addressInfo(route.recipient,route.recipientWallet);
        const value=await rpc('validateaddress',[route.recipient]);need(value.isvalid===true&&value.address===route.recipient,'BITCOIN_GRAPH_RECIPIENT_ADDRESS');p2wpkh(value.scriptPubKey);return value;
      }
      async function registerPagedRecipient(input){
        need(!custody,'BITCOIN_GRAPH_RECIPIENT_ONLY');exactOptions(input,['recipient'],['recipient']);
        const recipient=input.recipient;need(typeof recipient==='string'&&/^bcrt1[0-9a-z]{20,86}$/.test(recipient),'BITCOIN_GRAPH_REGTEST_RECIPIENT');live();need(!busy&&!observationBusy&&!inventoryBusy,'BITCOIN_OPERATION_BUSY');
        const existing=recipients.indexOf(recipient);if(existing>=0)return {recipientIndex:existing};
        for(const route of pagedRecipients.values())if(route.recipient===recipient)return {recipientIndex:route.recipientIndex};
        need(pagedRecipients.size<62,'BITCOIN_GRAPH_RECIPIENT_CAPACITY');
        const info=await rpc('validateaddress',[recipient]);need(info.isvalid===true&&info.address===recipient,'BITCOIN_GRAPH_RECIPIENT_ADDRESS');const recipientScript=p2wpkh(info.scriptPubKey);
        need(recipientScript!==sourceScript&&recipientScript!==changeScript,'BITCOIN_GRAPH_SELF_PAYMENT');
        const recipientIndex=recipients.length+pagedRecipients.size;
        pagedRecipients.set(recipientIndex,immutable({name:null,recipientIndex,source,sourceScript,sourceWallet:sourceWalletName,recipient,recipientScript,recipientWallet:null,externalRecipient:true,changeAddress,changeScript}));
        return {recipientIndex};
      }
      let syntheticPrefunding = saved?.syntheticPrefunding??null;
      if (custody&&!saved) {
        // An explicitly labeled mature synthetic mining reward supplies fixture
        // liquidity without introducing an unbound signing/broadcast path.
        const blocks = await rpc('generatetoaddress', [1, roles.escrow.address]);
        await rpc('generatetoaddress', [100, source]);
        const block = await rpc('getblock', [blocks[0], 2]), coin = block.tx[0];
        const output = coin.vout.find(item => item.scriptPubKey.hex === roles.escrow.endpoint);
        need(output && bitcoinSatoshiFromAmount(output.value) === BITCOIN_CUSTODY_SYNTHETIC_SURPLUS,
          'BITCOIN_SYNTHETIC_SURPLUS_AMOUNT');
        syntheticPrefunding = immutable({ classification: 'SYNTHETIC_LOCAL_FEE_SURPLUS_NOT_USER_BACKING',
          amount: BITCOIN_CUSTODY_SYNTHETIC_SURPLUS, nativeId: hex32(coin.txid), fee: '0',
          origin: 'MATURE_SYNTHETIC_REGTEST_COINBASE' });
      }
      const metadata = immutable({ profile: custody ? BITCOIN_CUSTODY_PROFILE : BITCOIN_OWNED_PROFILE, classification: 'OWNED_LOCAL_BITCOIN_REGTEST_ONLY', bitcoinGenesis: BITCOIN_REGTEST_GENESIS, bitcoinNetwork: 'regtest', bitcoinPeers: 0, bitcoinNetworkActive: false,
        runtimePins: clone(bitcoinRuntimePins), processId: handle.child.pid, freshSyntheticWallets: !restored, recoveryProcessGeneration:processGeneration, restoredOriginalState:Boolean(restored), ...(solver ? { syntheticFunding } : {}), ...(custody ? { roles, syntheticPrefunding, ephemeralCustody: true } : {}), source, sourceScript, changeAddress, changeScript, recipients: [...recipients], recipientScripts: [...recipientScripts], limits: clone(BITCOIN_TRANSFER_LIMITS), signing: 'Owned Core synthetic wallets only', assurance: 'trusted-owned-local-rpc-observation-not-independent-consensus-proof' });
      if(saved){
        assert.deepEqual({source,sourceScript,changeAddress,changeScript,recipients,recipientScripts},{source:saved.source,sourceScript:saved.sourceScript,changeAddress:saved.changeAddress,changeScript:saved.changeScript,recipients:saved.recipients,recipientScripts:saved.recipientScripts});
        need(Array.isArray(saved.records)&&saved.records.length<=64,'BITCOIN_RECOVERY_RECORD_BOUND');for(const row of saved.records){const record=clone(row),decoded=decodeBitcoinTransaction(record.rawTransaction);need(decoded.txid===record.txid&&decoded.transactionSHA256===record.transactionSHA256,'BITCOIN_RECOVERY_SIGNED_IDENTITY');need(!allRecords.has(record.txid),'BITCOIN_RECOVERY_DUPLICATE_RECORD');records.set(record.txid,record);allRecords.set(record.txid,record);}
        for(const [wallet,locked]of Object.entries(saved.locked)){need([sourceWalletName,...recipientWalletNames].includes(wallet),'BITCOIN_RECOVERY_WALLET');if(locked.length)need(await rpc('lockunspent',[false,locked],wallet)===true,'BITCOIN_RECOVERY_LOCK_RESTORE');assert.deepEqual(await rpc('listlockunspent',[],wallet),locked);}
      }
      recoveryProfiles[sourceWalletName]=()=>({source,sourceScript,changeAddress,changeScript,recipients:[...recipients],recipientScripts:[...recipientScripts],syntheticFunding,syntheticPrefunding,...(!custody?{pagedRecipients:clone([...pagedRecipients.values()])}:{}),records:clone([...records.values()]),wallets:[sourceWalletName,...recipientWalletNames]});
      const transfer = async (amountSatoshi, options, fixedRoute = null) => {
        const amount = sats(amountSatoshi), payout = custody && fixedRoute?.name !== 'deposit';
        exactOptions(options, ['recipientIndex', 'wireKeyCommitment', 'beforeSign', 'onSigned', ...(payout ? ['payoutSendToken'] : []), ...(!custody ? ['beforeSend'] : [])],
          ['wireKeyCommitment', 'beforeSign', 'onSigned', ...(payout ? ['payoutSendToken'] : [])]);
        const recipientIndex = custody?index(options.recipientIndex ?? 0):graphRecipientIndex(options.recipientIndex ?? 0), { beforeSign, onSigned } = options;
        const selectedRoute = fixedRoute ?? graphRoute(recipientIndex);
        need(custody === (selectedRoute.name !== null), 'BITCOIN_RUNTIME_ROUTE_PROFILE');
        if (payout) bitcoinPayoutController.assertNativeClaimBitcoinPayoutSendToken(options.payoutSendToken, runtime, selectedRoute.name);
        const wireKeyCommitment = hex32(options.wireKeyCommitment);
        need(typeof beforeSign === 'function' && typeof onSigned === 'function', 'BITCOIN_REQUIRED_SIGNING_CALLBACKS');
        live(); need(!busy && !observationBusy && !inventoryBusy, 'BITCOIN_OPERATION_BUSY');
        need(!signingUnresolved, 'BITCOIN_PRIOR_SIGNING_UNRESOLVED');
        need(![...allRecords.values()].some(record => record.phase !== 'OBSERVED_CONFIRMED'), 'BITCOIN_PRIOR_TRANSFER_UNRESOLVED');
        mutationGeneration++; busy = true; activeRoute = selectedRoute; let record, lockedCoin = null, keyUseBegun = false, keyAuthorityV4, nativeKeyAuditStarted;
        try {
          await health();
          const { source, sourceScript, sourceWallet, recipient, recipientScript, recipientWallet, changeAddress, changeScript } = selectedRoute;
          need((await recipientInfo(selectedRoute)).scriptPubKey === recipientScript, 'BITCOIN_RECIPIENT_SCRIPT_CHANGED');
          const unspent = await rpc('listunspent', [custody ? BITCOIN_TRANSFER_LIMITS.minimumConfirmations : 1, 9999999, [source]], sourceWallet);
          need(Array.isArray(unspent), 'BITCOIN_INVALID_UNSPENT_RESULT');
          const coin = unspent.find(item => item.spendable === true && item.solvable === true && item.safe === true && item.scriptPubKey === sourceScript && BigInt(bitcoinSatoshiFromAmount(item.amount)) > amount + BigInt(BITCOIN_TRANSFER_LIMITS.maximumFeeSatoshi));
          need(coin, 'BITCOIN_INSUFFICIENT_OWNED_INVENTORY');
          const selectedAddress = source;
          need((await addressInfo(selectedAddress, sourceWallet)).scriptPubKey === coin.scriptPubKey, 'BITCOIN_SOURCE_SCRIPT_CHANGED');
          const previousTransaction = await rpc('getrawtransaction', [hex32(coin.txid), true]), previous = decodeBitcoinTransaction(previousTransaction.hex);
          need(previous.txid === coin.txid && previousTransaction.txid === coin.txid && previous.vout[coin.vout]?.script === coin.scriptPubKey && previous.vout[coin.vout].amountSatoshi === bitcoinSatoshiFromAmount(coin.amount), 'BITCOIN_PREVIOUS_OUTPUT_MISMATCH');
          const raw = await rpc('createrawtransaction', [[{ txid: hex32(coin.txid), vout: coin.vout, sequence: 0xfffffffe }], [{ [recipient]: bitcoinAmountFromSatoshi(amountSatoshi) },
            { data: encodeWireCommitment(wireKeyCommitment).toString('hex') }], 0, false]);
          lockedCoin = { txid: coin.txid, vout: coin.vout };
          const funded = await rpc('fundrawtransaction', [raw, { add_inputs: false, changeAddress, changePosition: 1, fee_rate: 1, lockUnspents: true, replaceable: false }], sourceWallet);
          need(funded.changepos === 1, 'BITCOIN_FIXED_CHANGE_REQUIRED');
          const intent = immutable({ sourceTxid: coin.txid, sourceVout: String(coin.vout), sourceScript: coin.scriptPubKey, sourceSatoshi: bitcoinSatoshiFromAmount(coin.amount), recipientScript, amountSatoshi, changeScript, feeSatoshi: bitcoinSatoshiFromAmount(funded.fee), wireKeyCommitment });
          validateBitcoinTransferWire(funded.hex, intent);
          if (custody) assertOwnedCustodyIntent(selectedRoute.name, roles, '1', intent);
          await health();
          // Distinct last authorization boundary: complete unsigned intent exists,
          // and no RPC or other asynchronous step intervenes before wallet signing.
          // The writer remains locked while the final authorization checks run.
          // Their fresh health scan may read an older, already confirmed transfer.
          // Permit only that read, serially; signing, mining and new transfers stay
          // blocked. The new unsigned intent is not yet in the receipt registry.
          preSignReadWindow = true;
          try {
            const nativeHead = await health();
            const coinbase = previous.vin.length === 1 && previous.vin[0].txid === '0'.repeat(64)
              && previous.vin[0].vout === 0xffffffff;
            activePrepared = immutable({ genesis: BITCOIN_REGTEST_GENESIS, intent: clone(intent),
              unsignedWire: funded.hex, funds: {
                nativeHead: { id: nativeHead.tip, height: String(nativeHead.height) },
                sourceTransaction: previousTransaction.hex, sourceTxid: intent.sourceTxid,
                sourceVout: intent.sourceVout, sourceSatoshi: intent.sourceSatoshi,
                sourceScript: intent.sourceScript, sourceConfirmations: String(coin.confirmations),
                sourceCoinbase: coinbase, spendable: coin.spendable, solvable: coin.solvable, safe: coin.safe,
                sourceOwnedScript: sourceScript, changeOwnedScript: changeScript,
              } });
            const keyAck = await beforeSign(payout ? activePrepared : clone(activePrepared));
            if (payout) {
              keyAuthorityV4 = keyAck;
              // The final V4 validation has already drained every original
              // preparation read. Never perform a later read that would revoke
              // its strict original queue/state fence.
              const observation = preparedObservations.get(activePrepared);
              need(observation && observation.route === selectedRoute.name, 'BITCOIN_KEY_ORIGINAL_NATIVE_OBSERVATION');
              need(JSON.stringify(observation.prepared) === JSON.stringify(activePrepared), 'BITCOIN_KEY_NATIVE_PREPARATION_CHANGED');
              nativeKeyAuditStarted = observation.started;
            } else need(keyAck === undefined, 'BITCOIN_BEFORE_SIGN_CALLBACK_MUST_ASSERT');
          } finally { preSignReadWindow = false; }
          need(!observationBusy && !inventoryBusy, 'BITCOIN_PRE_SIGN_OBSERVATION_NOT_AWAITED');
          if (payout) {
            validateBitcoinTransferWire(funded.hex, activePrepared.intent);
            need(funded.hex === activePrepared.unsignedWire, 'BITCOIN_ORIGINAL_KEY_WIRE');
            assertOwnedCustodyIntent(selectedRoute.name, roles, '1', activePrepared.intent);
            live();
            const authorityAuditStarted = originalKeyControllerV4.consumeNativeClaimOriginalKeyAuthorityV4(keyAuthorityV4, 'payout', close,
              BITCOIN_REGTEST_GENESIS, selectedRoute.name, activePrepared);
            const terminalNow = performance.now(), elapsed = terminalNow - nativeKeyAuditStarted;
            const authorityElapsed = terminalNow - authorityAuditStarted;
            need(Number.isFinite(authorityElapsed) && authorityElapsed >= 0 && authorityElapsed < 30_000, 'BITCOIN_KEY_ORIGINAL_AUTHORITY_TOO_OLD');
            need(Number.isFinite(elapsed) && elapsed >= 0 && elapsed < 30_000, 'BITCOIN_KEY_NATIVE_OBSERVATION_TOO_OLD');
          }
          keyUseBegun = true;
          signingUnresolved = true; // A lost/rejected signer reply cannot authorize another signing attempt.
          const signed = await rpc('signrawtransactionwithwallet', [funded.hex], sourceWallet);
          need(signed.complete === true, 'BITCOIN_SIGNING_INCOMPLETE');
          const decoded = validateBitcoinTransferWire(signed.hex, intent, { signed: true });
          need(decoded.unsignedTransaction === funded.hex, 'BITCOIN_SIGNED_INTENT_CHANGED');
          need(!allRecords.has(decoded.txid), 'BITCOIN_ALREADY_SIGNED_IDENTITY');
          record = { ...(custody ? { route: selectedRoute.name, sourceRole: selectedRoute.sourceRole } : {}), genesis: BITCOIN_REGTEST_GENESIS, source: selectedAddress, recipient, recipientIndex, changeAddress, intent: clone(intent), txid: decoded.txid, wtxid: decoded.wtxid, vout: 0, amountSatoshi, rawTransaction: signed.hex, transactionSHA256: decoded.transactionSHA256, phase: 'SIGNED_NOT_BROADCAST', broadcastAttempts: 0, confirmationMiningAttempts: 0 };
          records.set(record.txid, record); allRecords.set(record.txid, record);
          try {
          const journal = await open(join(cwd, 'signed-' + record.txid + '.json'), 'wx', 0o600);
          try { await journal.writeFile(JSON.stringify(record) + '\n'); await journal.sync(); }
          finally { await journal.close(); }
          const directoryHandle = await open(cwd, 'r');
          try { await directoryHandle.sync(); } finally { await directoryHandle.close(); }
          } catch (error) { nativePersistenceFailed = true; throw error; }
          signingUnresolved = false;
          // Durable-journal callback must resolve before the first and only send.
          const signedPayload = immutable({ nativeWire: record.rawTransaction });
          const signedAck = custody ? await reservationReads.run(() => onSigned(signedPayload),
            () => need(!observationBusy && !inventoryBusy, 'BITCOIN_SIGNED_READ_NOT_AWAITED'))
            : await onSigned(signedPayload);
          need(signedAck === undefined, 'BITCOIN_SIGNED_CALLBACK_MUST_ASSERT');
          await health();
          const accepted = await rpc('testmempoolaccept', [[record.rawTransaction]]);
          need(Array.isArray(accepted) && accepted.length === 1 && accepted[0].txid === record.txid && accepted[0].allowed === true, 'BITCOIN_LOCAL_MEMPOOL_PREFLIGHT_REJECTED');
          let nativeSendAuditStarted;
          if (payout) {
            // Fixed, branded controller entry only, after every transport
            // preflight. No arbitrary beforeBroadcast/beforeSend callback.
            // The original preparation remains immutable and writer-owned.
            await reservationReads.run(async () => {
              payoutReadWindow = true;
              try {
                await bitcoinPayoutController.authorizeNativeClaimBitcoinPayoutSend(options.payoutSendToken, activePrepared, signedPayload);
                const observation = preparedObservations.get(activePrepared);
                need(observation && observation.route === selectedRoute.name, 'BITCOIN_SEND_ORIGINAL_NATIVE_OBSERVATION');
                need(JSON.stringify(observation.prepared) === JSON.stringify(activePrepared), 'BITCOIN_SEND_NATIVE_PREPARATION_CHANGED');
                nativeSendAuditStarted = observation.started;
              }
              finally { payoutReadWindow = false; }
            }, () => need(!observationBusy && !inventoryBusy, 'BITCOIN_FINAL_READ_NOT_AWAITED'));
          }
          let assertLatchContinuation;
          if (payout) {
            const authorityStarted = bitcoinPayoutController.authorizeNativeClaimBitcoinPayoutLatch(options.payoutSendToken, activePrepared, signedPayload);
            const expected = clone(readOwnedBitcoinRuntimeAuditState(runtime));
            need(records.get(record.txid) === record && record.phase === 'SIGNED_NOT_BROADCAST' && record.broadcastAttempts === 0,
              'BITCOIN_LATCH_ORIGINAL_RECORD_REQUIRED');
            for (const name of ['transfers', 'custodyTransfers']) {
              const matches = expected[name].filter(item => item.txid === record.txid);
              need(matches.length === 1, 'BITCOIN_LATCH_EXACT_RECORD');
              matches[0].phase = 'BROADCAST_UNKNOWN'; matches[0].broadcastAttempts = 1;
            }
            need(!expected.graphTransfers.some(item => item.txid === record.txid), 'BITCOIN_LATCH_WRONG_NAMESPACE');
            let consumed = false;
            assertLatchContinuation = () => {
              need(!consumed, 'BITCOIN_LATCH_CONTINUATION_USED'); consumed = true;
              need(records.get(record.txid) === record, 'BITCOIN_LATCH_ORIGINAL_RECORD_CHANGED');
              need(JSON.stringify(readOwnedBitcoinRuntimeAuditState(runtime)) === JSON.stringify(expected),
                'BITCOIN_LATCH_UNEXPECTED_NATIVE_STATE_CHANGE');
            };
            const beforeLatchNow = performance.now();
            need(Number.isFinite(beforeLatchNow - authorityStarted) && beforeLatchNow - authorityStarted >= 0
              && beforeLatchNow - authorityStarted < 30_000, 'BITCOIN_LATCH_ORIGINAL_AUTHORITY_TOO_OLD');
            need(Number.isFinite(beforeLatchNow - nativeSendAuditStarted) && beforeLatchNow - nativeSendAuditStarted >= 0
              && beforeLatchNow - nativeSendAuditStarted < 30_000, 'BITCOIN_LATCH_NATIVE_OBSERVATION_TOO_OLD');
          }
          record.phase = 'BROADCAST_UNKNOWN'; record.broadcastAttempts = 1;
          if (payout) {
            // No await, journal write, RPC preflight or caller callback between
            // consumption and the sole send. Failure retains attempt one.
            live();
            need(activeRoute === selectedRoute && activePrepared !== null
              && signedPayload.nativeWire === record.rawTransaction, 'BITCOIN_FINAL_ORIGINAL_CHANGED');
            need(!observationBusy && !inventoryBusy && !preSignReadWindow && !payoutReadWindow
              && !reservationReads.active, 'BITCOIN_FINAL_READ_WINDOW_NOT_CLOSED');
            validateBitcoinTransferWire(record.rawTransaction, activePrepared.intent, { signed: true });
            const authorityAuditStarted = bitcoinPayoutController.consumeNativeClaimBitcoinPayoutSend(options.payoutSendToken, activePrepared, signedPayload);
            assertLatchContinuation();
            const terminalNow = performance.now(), elapsed = terminalNow - nativeSendAuditStarted;
            const authorityElapsed = terminalNow - authorityAuditStarted;
            need(Number.isFinite(authorityElapsed) && authorityElapsed >= 0 && authorityElapsed < 30_000, 'BITCOIN_SEND_ORIGINAL_AUTHORITY_TOO_OLD');
            need(Number.isFinite(elapsed) && elapsed >= 0 && elapsed < 30_000, 'BITCOIN_SEND_NATIVE_OBSERVATION_TOO_OLD');
          }
          try {
            if(!custody&&Object.hasOwn(options,'beforeSend')){
              need(typeof options.beforeSend==='function','BITCOIN_GRAPH_FINAL_SEND_CALLBACK');
              need(await options.beforeSend(signedPayload,clone(activePrepared))===undefined,'BITCOIN_GRAPH_FINAL_SEND_ASSERT_ONLY');
              live();need(!observationBusy&&!inventoryBusy&&activeRoute===selectedRoute,'BITCOIN_GRAPH_FINAL_SEND_STATE');
              need(record.broadcastAttempts===1&&record.rawTransaction===signedPayload.nativeWire,'BITCOIN_GRAPH_FINAL_SEND_IDENTITY');
            }
            const returned = await rpc('sendrawtransaction', [record.rawTransaction]);
            need(returned === record.txid, 'BITCOIN_BROADCAST_IDENTITY_MISMATCH'); record.phase = 'BROADCAST'; return clone(record);
          } catch (cause) { const error = new Error('BITCOIN_BROADCAST_UNKNOWN_OBSERVE_EXACT_TXID'); error.rpcCode = cause.rpcCode ?? null; throw error; }
        } catch (error) {
          if (!keyUseBegun && lockedCoin) {
            // Funding selected/locked one owned UTXO but never called a signer.
            // Release only that exact outpoint after a proven pre-sign failure.
            // Once signing starts, ambiguity never unlocks/resigns/rebroadcasts.
            try { need(await rpc('lockunspent', [true, [lockedCoin]], selectedRoute.sourceWallet) === true,
              'BITCOIN_PRE_SIGN_UNLOCK_FAILED'); }
            catch { error.preSignUnlockUnknown = true; }
          }
          if (record) error.transfer = clone(record);
          throw error;
        }
        finally { activePrepared = null; activeRoute = null; busy = false; }
      };
      const recordFor = txid => { hex32(txid); const record = records.get(txid); need(record, 'BITCOIN_UNKNOWN_SIGNED_IDENTITY'); return record; };
      const observeTransfer = async txid => {
        const record = recordFor(txid);
        const retainedRoute = custody ? custodyRoute(record.route) : graphRoute(record.recipientIndex);
        if (custody) assertOwnedCustodyIntent(record.route, roles, '1', record.intent);
        need(!record.adverseReason, 'BITCOIN_ADVERSE_LATCHED');
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
          const walletTransaction = await rpc('gettransaction', [txid], retainedRoute.sourceWallet);
          need((await addressInfo(record.source, retainedRoute.sourceWallet)).scriptPubKey === record.intent.sourceScript, 'BITCOIN_SOURCE_SCRIPT_CHANGED');
          need((await recipientInfo(retainedRoute)).scriptPubKey === record.intent.recipientScript, 'BITCOIN_RECIPIENT_SCRIPT_CHANGED');
          const headerAgain = await rpc('getblockheader', [transaction.blockhash]), canonicalAgain = await rpc('getblockhash', [header.height]), tipHeader = await rpc('getblockheader', [tipBefore]), tipAfter = await rpc('getbestblockhash');
          if (tipBefore !== tipAfter || header.confirmations !== headerAgain.confirmations || header.height !== headerAgain.height || canonical !== canonicalAgain) continue;
          const fact = validateBitcoinTransferObservation({ expected: record, transaction, sourceTransaction, header, headerAgain, canonical, canonicalAgain, block, tipBefore, tipAfter, tipHeader, walletTransaction });
          const observation = { ...fact, observedAt: new Date().toISOString(), observationAttempts: attempt };
          record.phase = fact.finalized ? 'OBSERVED_CONFIRMED' : 'OBSERVED_PENDING'; record.observation = observation;
          if (custody && fact.finalized) record.actualFee = fact.feeSatoshi; return clone(observation);
        }
        throw new Error('BITCOIN_OBSERVATION_UNSTABLE');
      };
      const observe = async txid => {
        readGeneration++;
        const retained = recordFor(txid);
        live();
        need(!observationBusy && !inventoryBusy, 'BITCOIN_OBSERVATION_BUSY');
        const ownsWriterLock = !busy;
        if (!ownsWriterLock) {
          need(preSignReadWindow || reservationReads.allowsObservation(retained.phase), 'BITCOIN_OPERATION_BUSY');
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
        const record = recordFor(txid); live(); need(!busy && !observationBusy && !inventoryBusy, 'BITCOIN_OPERATION_BUSY');
        need(record.broadcastAttempts === 1 && record.confirmationMiningAttempts === 0, 'BITCOIN_CONFIRMATION_MINING_ALREADY_USED_OR_NOT_SUBMITTED');
        mutationGeneration++; busy = true;
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
      async function assertPrepared(prepared) {
      activeNativeReadOperations++;
      try {
        readGeneration++;
        const observationStarted = performance.now();
        live();
        need((preSignReadWindow || (payoutReadWindow && reservationReads.active
          && custody && ['redeem', 'refund'].includes(activeRoute?.name)))
          && busy && activePrepared !== null, 'BITCOIN_PRE_SIGN_WINDOW_REQUIRED');
        need(JSON.stringify(prepared) === JSON.stringify(activePrepared), 'BITCOIN_PREPARED_IDENTITY');
        const { source, sourceScript, sourceWallet, changeAddress, changeScript } = activeRoute;
        if (custody) assertOwnedCustodyIntent(activeRoute.name, roles, '1', prepared.intent);
        const current = await health();
        need(current.tip === prepared.funds.nativeHead.id
          && String(current.height) === prepared.funds.nativeHead.height, 'BITCOIN_NATIVE_HEAD_CHANGED');
        const output = await rpc('gettxout', [prepared.intent.sourceTxid, Number(prepared.intent.sourceVout), true]);
        need(output && output.bestblock === current.tip && output.scriptPubKey.hex === sourceScript
          && bitcoinSatoshiFromAmount(output.value) === prepared.intent.sourceSatoshi
          && (!custody || output.confirmations >= BITCOIN_TRANSFER_LIMITS.minimumConfirmations),
          'BITCOIN_SOURCE_SPENT_OR_CHANGED');
        need((await addressInfo(source, sourceWallet)).scriptPubKey === sourceScript
          && (await addressInfo(changeAddress, sourceWallet)).scriptPubKey === changeScript,
          'BITCOIN_OWNED_SCRIPT_CHANGED');
        need((await health()).tip === current.tip, 'BITCOIN_NATIVE_HEAD_CHANGED');
        preparedObservations.set(activePrepared, { started: observationStarted, route: activeRoute.name, prepared: immutable(clone(activePrepared)) });
      } finally { activeNativeReadOperations--; readGeneration++; }
      }
      function bindNativeAsset(value) {
        const asset = hex32(value);
        need(asset !== '0'.repeat(64), 'BITCOIN_NATIVE_ASSET_ID');
        if (nativeAsset === null) nativeAsset = asset;
        need(nativeAsset === asset, 'BITCOIN_NATIVE_ASSET_REBIND_FORBIDDEN');
        return asset;
      }
      function adapter(options) {
        exactOptions(options, custody ? ['asset', 'route'] : ['asset', 'recipientIndex'], custody ? ['asset', 'route'] : ['asset']);
        const { asset, recipientIndex = 0 } = options;
        bindNativeAsset(asset); const selectedRoute = custody ? custodyRoute(options.route) : graphRoute(graphRecipientIndex(recipientIndex));
        const slot = selectedRoute.recipientIndex;
        const binding = immutable({ family: '1', genesis: BITCOIN_REGTEST_GENESIS, asset,
          sourceEndpoint: selectedRoute.sourceScript, destinationEndpoint: selectedRoute.recipientScript, changeEndpoint: selectedRoute.changeScript });
        return Object.freeze({ binding,
          async transfer(request, callbacks) {
            exactOptions(request, ['amount', 'wireKeyCommitment'], ['amount', 'wireKeyCommitment']);
            const payout = custody && selectedRoute.name !== 'deposit';
            const names = ['beforeSign', 'onSigned', ...(payout ? ['payoutSendToken'] : [])];
            exactOptions(callbacks, [...names,...(!custody ? ['beforeSend'] : [])], names);
            if(Object.hasOwn(callbacks,'beforeSend'))need(!custody&&typeof callbacks.beforeSend==='function','BITCOIN_GRAPH_FINAL_SEND_CALLBACK');
            const sent = await transfer(request.amount, { recipientIndex: slot,
              wireKeyCommitment: request.wireKeyCommitment, ...callbacks }, selectedRoute);
            return { nativeId: sent.txid, transactionSHA256: sent.transactionSHA256 };
          },
          async assertPrepared(prepared) {
            need(activeRoute?.name === selectedRoute.name && activeRoute?.recipientIndex === slot, 'BITCOIN_OTHER_ROUTE');
            return assertPrepared(prepared);
          },
          async observe({ nativeId }) {
            const record = recordFor(nativeId);
            need(!custody || record.route === selectedRoute.name, 'BITCOIN_OTHER_ROUTE');
            if (record.adverseReason) return { status: 'adverse', nativeId, nativeWire: null };
            need(record.recipientIndex === slot, 'BITCOIN_OTHER_RECIPIENT');
            try {
              const fact = await observe(nativeId);
              return { status: fact.finalized ? 'observed' : 'pending', nativeId,
                nativeWire: fact.finalized ? record.rawTransaction : null };
            } catch (error) {
              // Unavailable/unknown local history never becomes an adverse fact
              // and never authorizes another send. The evidence peer classifies
              // exact canonical-history contradictions independently.
              if (error.message === 'BITCOIN_PENDING_CONFIRMATIONS_NO_RESEND')
                return { status: 'pending', nativeId, nativeWire: null };
              throw error;
            }
          },
        });
      }
      function factReader(options) {
        exactOptions(options, custody ? ['asset', 'route'] : ['asset'], custody ? ['asset', 'route'] : ['asset']);
        const selectedRoute = custody ? custodyRoute(options.route) : null;
        const asset = bindNativeAsset(options.asset);
        return Object.freeze({ async observe(request) {
          exactOptions(request, ['family', 'recipientIndex', 'nativeId'], ['family', 'recipientIndex', 'nativeId']);
          need(request.family === '1', 'BITCOIN_FACT_FAMILY');
          need(typeof request.recipientIndex === 'string'&&/^(0|[1-9][0-9]?)$/.test(request.recipientIndex)
            &&Number(request.recipientIndex)<(custody?2:64),'BITCOIN_FACT_RECIPIENT');
          hex32(request.nativeId);
          const record = records.get(request.nativeId);
          if (!record) return { status: 'unknown', reason: 'OWNED_IDENTITY_NOT_RETAINED' };
          need(!custody || record.route === selectedRoute.name, 'BITCOIN_OTHER_ROUTE');
          need(record.recipientIndex === Number(request.recipientIndex), 'BITCOIN_OTHER_RECIPIENT');
          if (record.adverseReason) return { status: 'adverse', reason: record.adverseReason };
          if (record.broadcastAttempts !== 1) return { status: 'unknown', reason: 'NO_KNOWN_BROADCAST' };
          try {
            const value = await observe(request.nativeId);
            if (!value.finalized) return { status: 'unavailable', reason: 'FINALITY_PENDING' };
            return immutable({ status: 'observed', genesis: BITCOIN_REGTEST_GENESIS, asset,
              nativeWire: value.rawTransaction, intent: clone(record.intent), blockId: value.blockhash,
              blockHeight: String(value.blockHeight), finalityKind: '1', confirmations: String(value.confirmations),
              nativeContext: { observedTipId: value.observedTip, observedTipHeight: String(value.observedTipHeight),
                transactionSlot: '0', parentSlot: '0', observedSlot: '0' } });
          } catch (error) {
            const code = typeof error?.message === 'string' ? error.message : '';
            const contradiction = ['BITCOIN_BLOCK_NOT_CANONICAL', 'BITCOIN_OBSERVED_WIRE_MISMATCH',
              'BITCOIN_PREVIOUS_OUTPUT_MISMATCH', 'BITCOIN_WALLET_FEE_MISMATCH',
              'BITCOIN_BLOCK_MEMBERSHIP_MISMATCH', 'BITCOIN_BLOCK_CONTEXT_MISMATCH',
              'BITCOIN_INCOHERENT_CONFIRMATIONS', 'BITCOIN_SOURCE_SCRIPT_CHANGED',
              'BITCOIN_RECIPIENT_SCRIPT_CHANGED'].includes(code)
              || (code.length > 0 && /^BINDING_[A-Z0-9_]+$/.exec(code)?.[0] === code);
            if (contradiction) {
              record.adverseReason = code;
              try {
              const event = await open(join(cwd, 'adverse-' + record.txid + '.json'), 'wx', 0o600);
              try { await event.writeFile(JSON.stringify({ txid: record.txid, reason: record.adverseReason }) + '\n'); await event.sync(); }
              finally { await event.close(); }
              const directoryHandle = await open(cwd, 'r');
              try { await directoryHandle.sync(); } finally { await directoryHandle.close(); }
              } catch (error) { nativePersistenceFailed = true; throw error; }
              return { status: 'adverse', reason: record.adverseReason };
            }
            return { status: 'unavailable', reason: 'FRESH_NATIVE_READ_FAILED' };
          }
        } });
      }
      async function inventory() {
        readGeneration++;
        need(custody && arguments.length === 0, 'BITCOIN_CUSTODY_INVENTORY_ONLY'); live();
        need(!inventoryBusy && !observationBusy && (!busy || preSignReadWindow || reservationReads.active), 'BITCOIN_INVENTORY_BUSY');
        const ownsWriter = !busy; if (ownsWriter) busy = true; inventoryBusy = true;
        try {
          const before = await health();
          const scan = await rpc('scantxoutset', ['start', Object.values(roles).map(role => 'raw(' + role.endpoint + ')')]);
          need(scan.success === true && scan.bestblock === before.tip && scan.height === before.height,
            'BITCOIN_INVENTORY_HEAD_CHANGED');
          const accounts = [];
          for (const [role, account] of Object.entries(roles)) {
            need((await addressInfo(account.address, wallets[role])).scriptPubKey === account.endpoint,
              'BITCOIN_INVENTORY_ROLE_CHANGED');
            const locked = await rpc('listlockunspent', [], wallets[role]);
            const coins = [], selectedCoins = scan.unspents.filter(item => item.scriptPubKey === account.endpoint);
            // Independent gettxout reads stay inside this one locked inventory
            // window. The bounded scheduler drains every started loopback read on
            // failure; it never shares observations between audits or signers.
            const outputs = await readBitcoinInventoryOutputs(selectedCoins, inventoryRpc);
            for (const [position, coin] of selectedCoins.entries()) {
              const output = outputs[position];
              if (output) need(output.bestblock === before.tip && output.scriptPubKey.hex === account.endpoint
                && bitcoinSatoshiFromAmount(output.value) === bitcoinSatoshiFromAmount(coin.amount), 'BITCOIN_INVENTORY_OUTPUT_CHANGED');
              coins.push({ txid: hex32(coin.txid), vout: String(coin.vout), script: account.endpoint,
                amount: bitcoinSatoshiFromAmount(coin.amount), confirmations: String(before.height - height(coin.height) + 1),
                spendable: output !== null, solvable: true, safe: output !== null,
                locked: locked.some(item => item.txid === coin.txid && item.vout === coin.vout), coinbase: coin.coinbase });
            }
            coins.sort((left, right) => left.txid.localeCompare(right.txid) || Number(left.vout) - Number(right.vout));
            accounts.push({ role, ...account, ...summarizeOwnedBitcoinCoins(coins), utxos: coins });
          }
          const after = await health(); need(before.tip === after.tip, 'BITCOIN_INVENTORY_HEAD_CHANGED');
          const feeAudit = ownedCustodyFeeAudit([...records.values()].map(record => ({
            nativeId: record.txid, route: record.route, phase: record.phase, amount: record.amountSatoshi,
            preparedFee: record.intent.feeSatoshi, actualFee: record.actualFee ?? null,
            broadcastAttempts: record.broadcastAttempts })));
          return immutable({ family: '1', genesis: BITCOIN_REGTEST_GENESIS, asset: nativeAsset,
            nativeHead: { id: before.tip, height: String(before.height) }, accounts,
            escrow: clone(accounts.find(account => account.role === 'escrow')), feeAudit,
            signingUnresolved, syntheticPrefunding, unconfirmedOutputsIncluded: false,
            assurance: 'OWNED_LOCAL_FINALIZED_INVENTORY_NOT_BACKING_ATTESTATION' });
        } finally { inventoryBusy = false; if (ownsWriter) busy = false; }
      }
      const runtime = Object.freeze({ genesis: BITCOIN_REGTEST_GENESIS, metadata,
        ...(solver ? { syntheticFunding } : {}),
        ...(custody ? { roles, inventory, syntheticPrefunding, payoutFinalSendProfile: BITCOIN_PAYOUT_FINAL_SEND_PROFILE } : { source, sourceScript, changeAddress, changeScript,
          recipient: recipients[0], recipientScript: recipientScripts[0], recipients: Object.freeze([...recipients]),
          recipientScripts: Object.freeze([...recipientScripts]), registerPagedRecipient, transfer: (amount, options) => transfer(amount, options) }),
        adapter, factReader, observe, confirm, health, processStatus, close,
        get transfers() { return clone([...records.values()]); } });
      if(custody&&!combined)originalBitcoinRecoveryCapturesV1.set(runtime,()=>recoveryCapture());
      if(!custody&&!combined)originalPagedBitcoinRecoveryCapturesV3.set(runtime,()=>recoveryCapture());
      if(custody&&!combined)originalBitcoinRetentionArmsV1.set(runtime,()=>{live();need(processGeneration===0&&initialPrivateRecord&&!busy&&allRecords.size===0,'BITCOIN_RETENTION_BEFORE_NATIVE_EFFECTS');recoveryRetained=true;return clone({schema:'OWNED_NATIVE_INITIAL_RETENTION_V1',family:'bitcoin',cwd,processGeneration,initialPrivateRecord});});
      ownedBitcoinRuntimes.add(runtime); ownedBitcoinLiveness.set(runtime, live);
      ownedBitcoinAuditStates.set(runtime, () => {
        const complete = [...allRecords.values()];
        return immutable({ profile: 'OWNED_NATIVE_RUNTIME_AUDIT_STATE_V1', family: '1',
          lifetimeId, facade: custody ? 'custody' : 'graph', genesis: BITCOIN_REGTEST_GENESIS,
          readGeneration: readGeneration.toString(), mutationGeneration: mutationGeneration.toString(),
          activeReads: activeNativeReads + activeNativeReadOperations, activeMutations: activeNativeMutations,
          readsIdle: activeNativeReads === 0 && activeNativeReadOperations === 0 && !observationBusy && !inventoryBusy,
          operationBusy: busy, observationBusy, inventoryBusy, signingUnresolved,
          persistenceFailed: nativePersistenceFailed, isolationFailed: nativeIsolationFailed,
          adverseHistory: complete.some(record => Boolean(record.adverseReason)),
          activeRoute: activeRoute?.name ?? null, activePrepared: activePrepared ? clone(activePrepared) : null,
          transfers: clone([...records.values()]),
          custodyTransfers: clone(complete.filter(record => record.route !== undefined)),
          graphTransfers: clone(complete.filter(record => record.route === undefined)) });
      });
      return runtime;
    }
    recoveryCapture=async()=>{
      if(recoveryCaptureResult)return clone(recoveryCaptureResult);recoveryRetained=true;live();need(!busy&&!observationBusy&&!inventoryBusy&&activeNativeReads===0&&activeNativeMutations===0&&activeNativeReadOperations===0,'BITCOIN_RECOVERY_REQUIRES_QUIESCENCE');recoveryRetained=true;recoveryCapturing=true;
      try {
      const mempool=(await recoveryRpc('getrawmempool')).sort();need(mempool.every(id=>allRecords.has(id)),'BITCOIN_RECOVERY_UNOWNED_PENDING_TRANSACTION');
      const head=await recoveryRpc('getblockchaininfo'),network=await recoveryRpc('getnetworkinfo');need(head.chain==='regtest'&&network.networkactive===false&&network.connections===0,'BITCOIN_RECOVERY_ISOLATION');need(await recoveryRpc('getblockhash',[0])===BITCOIN_REGTEST_GENESIS,'BITCOIN_RECOVERY_GENESIS');
      const profiles={};for(const [name,take]of Object.entries(recoveryProfiles)){const row=take();row.locked={};for(const wallet of row.wallets)row.locked[wallet]=await recoveryRpc('listlockunspent',[],wallet);profiles[name]=row;}
      need((await recoveryRpc('getblockchaininfo')).bestblockhash===head.bestblockhash,'BITCOIN_RECOVERY_HEAD_CHANGED');
      const state={schema:'OWNED_FIXED_BITCOIN_PRIVATE_RECOVERY_V1',family:'bitcoin',...(!custody&&!combined?{pagedProfile:'PAGED_GRAPH_ONLY_V3'}:{}),cwd,genesis:BITCOIN_REGTEST_GENESIS,runtimePins:clone(bitcoinRuntimePins),processGeneration,originalProcessId:handle.child.pid,rpcPassword:password,head,mempool,profiles,signingUnresolved,nativeAsset,nativePersistenceFailed,nativeIsolationFailed,mutationGeneration:mutationGeneration.toString()};
      const privateRecord=await writePrivateRuntimeRecoveryV1(cwd,'wrapped-runtime-capture.json',state);await close();need(closeResult.ownedProcessStopped===true&&closeResult.forced===false,'BITCOIN_RECOVERY_REQUIRES_GRACEFUL_TERMINAL');
      const files=await sealStoppedNativeFilesV1(cwd),captured={schema:'OWNED_FIXED_BITCOIN_CAPTURE_V1',family:'bitcoin',...(!custody&&!combined?{pagedProfile:'PAGED_GRAPH_ONLY_V3'}:{}),cwd,privateRecord,files,terminal:{ownedProcessStopped:true,forced:false},processGeneration,genesis:BITCOIN_REGTEST_GENESIS};await writePrivateRuntimeRecoveryV1(cwd,'wrapped-runtime-terminal.json',captured);recoveryCaptureResult=captured;return clone(captured);
    } catch(error){try{await close();}catch(cleanup){throw new AggregateError([error,cleanup],'BITCOIN_RECOVERY_CAPTURE_AND_STOP_FAILED');}throw error;}
    };
    const primary = await createProfile(custody, SOURCE_WALLET, RECIPIENT_WALLETS);
    if(custody&&!combined&&!restored){const profiles={};for(const [name,take]of Object.entries(recoveryProfiles))profiles[name]=take();initialPrivateRecord=await writeInitialNativeCredentialsV1(cwd,'bitcoin',{schema:'OWNED_FIXED_BITCOIN_INITIAL_CREDENTIALS_V1',family:'bitcoin',genesis:BITCOIN_REGTEST_GENESIS,runtimePins:clone(bitcoinRuntimePins),rpcPassword:password,profiles});}
    if(restored){
      let loaded=false;for(let i=0;i<100;i++){if((await rpc('getmempoolinfo')).loaded===true){loaded=true;break;}await sleep(100);}need(loaded,'BITCOIN_RECOVERY_MEMPOOL_LOAD_TIMEOUT');
      assert.deepEqual((await rpc('getrawmempool')).sort(),restored.mempool,'BITCOIN_RECOVERY_MEMPOOL_CHANGED');
      for(const txid of restored.mempool){const row=allRecords.get(txid);need(row&&(await rpc('getrawtransaction',[txid]))===row.rawTransaction,'BITCOIN_RECOVERY_MEMPOOL_ORIGINAL_WIRE');}
      const now=await health();need(now.tip===restored.head.bestblockhash&&now.height===restored.head.blocks,'BITCOIN_RECOVERY_HEAD');signingUnresolved=restored.signingUnresolved;nativeAsset=restored.nativeAsset;nativePersistenceFailed=restored.nativePersistenceFailed;nativeIsolationFailed=restored.nativeIsolationFailed;mutationGeneration=BigInt(restored.mutationGeneration)+1n;}
    if (!combined) return primary;
    const graph = await createProfile(false, SOLVER_WALLET, GRAPH_RECIPIENT_WALLETS, true);
    return Object.freeze({ custody: primary, graph });
  } catch (error) {
    try { error.cleanup = await close(); }
    catch (cleanupError) { error.cleanup = { ownedProcessStopped: !processStatus().running, syntheticWalletsAndLedgerRemoved: false, error: cleanupError.message }; }
    throw error;
  }
}
