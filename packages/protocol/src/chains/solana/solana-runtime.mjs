import { createHash, createPrivateKey, createPublicKey, randomBytes, sign, verify } from 'node:crypto';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createReadStream } from 'node:fs';
import { readFile, writeFile, realpath, mkdir, readdir, readlink, lstat } from 'node:fs/promises';
import { join, sep, dirname } from 'node:path';
import { createServer } from 'node:net';
import { createSocket } from 'node:dgram';
import { scratchDirectory, removeOwnScratch, stopOwnProcess, ownedRuntimeRpc, sleep, projectRoot } from '../shared/runtime-harness.mjs';

const exec = promisify(execFile);
const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const PKCS8_ED25519 = Buffer.from('302e020100300506032b657004220420', 'hex');
const SPKI_ED25519 = Buffer.from('302a300506032b6570032100', 'hex');
const PUBLIC_GENESIS = new Set(['5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp', 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1', '4uhcVJyU9pJkvQyS88uRDiswHXSCkY3zQawwpjk2NsNY']);
const READ_METHODS = new Set(['getGenesisHash', 'getVersion', 'getHealth', 'getClusterNodes', 'getBalance', 'getSlot', 'getBlockHeight', 'getLatestBlockhash', 'getSignatureStatuses', 'getTransaction', 'getBlock', 'getBlocks', 'minimumLedgerSlot', 'getFirstAvailableBlock']);
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const fail = code => { throw new Error(code); };
const requireCondition = (condition, code) => { if (!condition) fail(code); };
const ownedSolanaRuntimes = new WeakSet();
const ownedSolanaRecipientViews = new WeakSet();
export function assertOwnedSolanaRuntime(runtime) {
  requireCondition(ownedSolanaRuntimes.has(runtime), 'SOLANA_OWNED_RUNTIME_CAPABILITY');
}
export function assertOwnedSolanaRecipientView(view) {
  requireCondition(ownedSolanaRecipientViews.has(view), 'SOLANA_OWNED_RECIPIENT_CAPABILITY');
}
const safeInteger = (value, code) => { requireCondition(Number.isSafeInteger(value) && value >= 0, code); return BigInt(value); };

export function base58Encode(bytes) {
  const data = Buffer.from(bytes); let value = data.length ? BigInt('0x' + data.toString('hex')) : 0n, out = '';
  while (value > 0n) { out = ALPHABET[Number(value % 58n)] + out; value /= 58n; }
  for (const byte of data) { if (byte !== 0) break; out = '1' + out; }
  return out;
}
export function base58Decode(text, length) {
  requireCondition(typeof text === 'string' && text.length > 0 && text.length <= 128, 'SOLANA_INVALID_BASE58');
  let value = 0n;
  for (const char of text) { const index = ALPHABET.indexOf(char); requireCondition(index >= 0, 'SOLANA_INVALID_BASE58'); value = value * 58n + BigInt(index); }
  let hex = value ? value.toString(16) : ''; if (hex.length % 2) hex = '0' + hex;
  const zeroes = text.match(/^1*/)[0].length;
  const result = Buffer.concat([Buffer.alloc(zeroes), Buffer.from(hex, 'hex')]);
  requireCondition(base58Encode(result) === text && (length === undefined || result.length === length), 'SOLANA_INVALID_BASE58_LENGTH');
  return result;
}
function lamportsValue(value) {
  requireCondition(typeof value === 'bigint' || (typeof value === 'string' && /^[1-9][0-9]*$/.test(value)) || Number.isSafeInteger(value), 'SOLANA_INVALID_LAMPORTS');
  const n = BigInt(value); requireCondition(n > 0n && n <= BigInt(Number.MAX_SAFE_INTEGER), 'SOLANA_INVALID_LAMPORTS'); return n;
}
function createSyntheticKey() {
  const seed = randomBytes(32), privateKey = createPrivateKey({ key: Buffer.concat([PKCS8_ED25519, seed]), type: 'pkcs8', format: 'der' });
  const publicBytes = createPublicKey(privateKey).export({ type: 'spki', format: 'der' }).subarray(-32);
  return { seed, publicBytes, address: base58Encode(publicBytes) };
}

// A deliberately minimal legacy transaction: one signer, three keys and one
// native System transfer. No SDK, config discovery or wallet secret is needed.
export function signSolanaTransfer({ seed, recipient, recentBlockhash, lamports }) {
  requireCondition(Buffer.isBuffer(seed) && seed.length === 32, 'SOLANA_INVALID_SYNTHETIC_SEED');
  const key = createPrivateKey({ key: Buffer.concat([PKCS8_ED25519, seed]), type: 'pkcs8', format: 'der' });
  const solverBytes = createPublicKey(key).export({ type: 'spki', format: 'der' }).subarray(-32);
  const amount = lamportsValue(lamports), data = Buffer.alloc(12); data.writeUInt32LE(2); data.writeBigUInt64LE(amount, 4);
  const message = Buffer.concat([Buffer.from([1, 0, 1, 3]), solverBytes, base58Decode(recipient, 32), Buffer.alloc(32), base58Decode(recentBlockhash, 32), Buffer.from([1, 2, 2, 0, 1, 12]), data]);
  const signatureBytes = sign(null, message, key), wire = Buffer.concat([Buffer.from([1]), signatureBytes, message]);
  return { signature: base58Encode(signatureBytes), signatureHex: '0x' + signatureBytes.toString('hex'), solver: base58Encode(solverBytes), solverHex: '0x' + solverBytes.toString('hex'), recipient, recipientHex: '0x' + base58Decode(recipient, 32).toString('hex'), lamports: amount.toString(), recentBlockhash, instructionIndex: 0, transactionBase64: wire.toString('base64'), transactionSHA256: digest(wire) };
}

export function decodeSolanaTransfer(transactionBase64) {
  requireCondition(typeof transactionBase64 === 'string' && /^[A-Za-z0-9+/]+={0,2}$/.test(transactionBase64), 'SOLANA_INVALID_TRANSACTION');
  const wire = Buffer.from(transactionBase64, 'base64');
  requireCondition(wire.toString('base64') === transactionBase64 && wire.length === 215, 'SOLANA_INVALID_TRANSACTION');
  requireCondition(wire.subarray(0, 1).equals(Buffer.from([1])) && wire.subarray(65, 69).equals(Buffer.from([1, 0, 1, 3])), 'SOLANA_INVALID_MESSAGE_HEADER');
  const solverBytes = wire.subarray(69, 101), recipientBytes = wire.subarray(101, 133);
  requireCondition(wire.subarray(133, 165).equals(Buffer.alloc(32)), 'SOLANA_WRONG_PROGRAM');
  requireCondition(wire.subarray(197, 203).equals(Buffer.from([1, 2, 2, 0, 1, 12])) && wire.readUInt32LE(203) === 2, 'SOLANA_NOT_EXACT_SYSTEM_TRANSFER');
  const signatureBytes = wire.subarray(1, 65), message = wire.subarray(65);
  requireCondition(verify(null, message, createPublicKey({ key: Buffer.concat([SPKI_ED25519, solverBytes]), type: 'spki', format: 'der' }), signatureBytes), 'SOLANA_SIGNATURE_INVALID');
  const amount = wire.readBigUInt64LE(207); lamportsValue(amount);
  return { signature: base58Encode(signatureBytes), signatureHex: '0x' + signatureBytes.toString('hex'), solver: base58Encode(solverBytes), solverHex: '0x' + solverBytes.toString('hex'), recipient: base58Encode(recipientBytes), recipientHex: '0x' + recipientBytes.toString('hex'), recentBlockhash: base58Encode(wire.subarray(165, 197)), lamports: amount.toString(), instructionIndex: 0, transactionSHA256: digest(wire) };
}

// Pure fail-closed validation. These are consistent observations of a trusted
// local RPC, not an independently authenticated Solana consensus proof.
export function validateSolanaObservation({ expected, genesis, status, transaction, currentSlot, block, commitment = 'finalized' }) {
  requireCondition(commitment === 'confirmed' || commitment === 'finalized', 'SOLANA_INVALID_COMMITMENT');
  base58Decode(expected.genesis, 32);
  requireCondition(!PUBLIC_GENESIS.has(expected.genesis) && genesis === expected.genesis, 'SOLANA_WRONG_GENESIS');
  requireCondition(status && status.err === null, 'SOLANA_STATUS_MISSING_OR_FAILED');
  requireCondition(status.confirmationStatus === 'finalized' || (commitment === 'confirmed' && status.confirmationStatus === 'confirmed'), 'SOLANA_NOT_COMMITTED');
  if (status.confirmationStatus === 'finalized') requireCondition(status.confirmations === null, 'SOLANA_INCONSISTENT_FINALITY');
  requireCondition(transaction?.meta?.err === null && Array.isArray(transaction.transaction) && transaction.transaction[1] === 'base64', 'SOLANA_TRANSACTION_MISSING_OR_FAILED');
  const decoded = decodeSolanaTransfer(transaction.transaction[0]);
  for (const field of ['signature', 'solver', 'recipient', 'lamports', 'recentBlockhash', 'transactionSHA256']) requireCondition(decoded[field] === expected[field], 'SOLANA_TRANSFER_MISMATCH_' + field.toUpperCase());
  const slot = safeInteger(transaction.slot, 'SOLANA_INVALID_SLOT');
  requireCondition(safeInteger(status.slot, 'SOLANA_INVALID_STATUS_SLOT') === slot && safeInteger(currentSlot, 'SOLANA_INVALID_CURRENT_SLOT') >= slot, 'SOLANA_SLOT_MISMATCH');
  requireCondition(block && Array.isArray(block.signatures) && block.signatures.filter(s => s === decoded.signature).length === 1, 'SOLANA_BLOCK_MEMBERSHIP_MISSING');
  base58Decode(block.blockhash, 32); base58Decode(block.previousBlockhash, 32);
  requireCondition(safeInteger(block.parentSlot, 'SOLANA_INVALID_PARENT_SLOT') < slot, 'SOLANA_PARENT_SLOT_MISMATCH');
  safeInteger(block.blockHeight, 'SOLANA_INVALID_BLOCK_HEIGHT');
  const meta = transaction.meta;
  requireCondition(Array.isArray(meta.preBalances) && Array.isArray(meta.postBalances) && meta.preBalances.length === 3 && meta.postBalances.length === 3, 'SOLANA_INVALID_BALANCES');
  const before = meta.preBalances.map(v => safeInteger(v, 'SOLANA_UNSAFE_BALANCE')), after = meta.postBalances.map(v => safeInteger(v, 'SOLANA_UNSAFE_BALANCE'));
  const amount = BigInt(decoded.lamports), fee = safeInteger(meta.fee, 'SOLANA_INVALID_FEE');
  requireCondition(after[1] - before[1] === amount && before[0] - after[0] === amount + fee && before[2] === after[2], 'SOLANA_BALANCE_DELTA_MISMATCH');
  requireCondition(!meta.innerInstructions || meta.innerInstructions.length === 0, 'SOLANA_UNEXPECTED_INNER_INSTRUCTIONS');
  return Object.freeze({ ...decoded, genesis, genesisHex: '0x' + base58Decode(genesis, 32).toString('hex'), slot: Number(slot), blockhash: block.blockhash, parentSlot: block.parentSlot, blockHeight: block.blockHeight, confirmationStatus: status.confirmationStatus, finalized: status.confirmationStatus === 'finalized', success: true, feeLamports: fee.toString(), solverBefore: before[0].toString(), solverAfter: after[0].toString(), recipientBefore: before[1].toString(), recipientAfter: after[1].toString(), recipientDeltaLamports: amount.toString(), currentSlot, assurance: 'trusted-owned-local-rpc-observation-not-public-consensus-proof' });
}

// Populated only after the separately reviewed source build completes and its
// exact artifact digest is verified. Never fall back to unsafe stock startup.
export const solanaLoopbackCompatibilityPin = Object.freeze(['agave-v2.3.13-loopback/solana-test-validator', 'bc082911d81efe39ffedde30d221789efc950b99617168e35305a2229ba77320']);
// Separate source-derived local profile. This changes only aggregate RocksDB
// memtable flushing, not ledger retention or a host/process memory limit.
export const solanaBoundedLedgerCompatibilityPin = Object.freeze(['agave-v2.3.13-loopback-memtable128m/solana-test-validator', '7d6d38cfe120c74b486104955029aa6ae4ff1de8167a602125cafeff166f2ca0']);
// Fresh-path rebuild of the exact same reviewed seven-file source derivative.
// Keep the original artifact identity above. Source/tool/build evidence is in
// native-runtime-restore-20261003.json; actual node acceptance remains separate.
export const solanaRebuiltBoundedLedgerCompatibilityPin = Object.freeze(['agave-v2.3.13-loopback-memtable128m-rebuilt-20261003/solana-test-validator', 'a5da595fa47557c6952aa786b279219edd99e15247c87f0bf5fe9b93d1e02596']);
export const SOLANA_BOUNDED_LEDGER_PROFILE = 'PC23_BOUNDED_LEDGER_V1';
export const SOLANA_PRIVATE_COHORT_PROFILE = 'PC24_TWO_OWNER_COHORT_V1';
export const SOLANA_PRIVATE_COHORT_OPTIONS = Object.freeze({ ledgerRetentionShreds: 1_000_000, ticksPerSlot: 64, resourceProfile: SOLANA_BOUNDED_LEDGER_PROFILE });

// Trusted in-process adapter construction only. All destinations are registered
// together before any transfer can be dispatched. A view cannot select another
// recipient or observe/replay that recipient's retained signature. These views
// share one native solver and therefore make no source-unlinkability claim.
export function createBoundSolanaRecipientViews({ genesis, solver, recipients }, operations) {
  base58Decode(genesis, 32); base58Decode(solver, 32);
  requireCondition(Array.isArray(recipients) && [1, 2].includes(recipients.length), 'SOLANA_INVALID_RECIPIENT_REGISTRATION');
  const registered = recipients.map(recipient => { base58Decode(recipient, 32); return recipient; });
  requireCondition(new Set([solver, ...registered]).size === registered.length + 1, 'SOLANA_DUPLICATE_RECIPIENT_REGISTRATION');
  for (const name of ['transfer', 'observe', 'balance', 'replayFinalizedForReview', 'transfers']) requireCondition(typeof operations?.[name] === 'function', 'SOLANA_MISSING_BOUND_OPERATION');
  const bound = Object.fromEntries(['transfer', 'observe', 'balance', 'replayFinalizedForReview', 'transfers'].map(name => [name, operations[name].bind(operations)]));
  const exactOptions = (options, allowed) => requireCondition(options && Object.getPrototypeOf(options) === Object.prototype && Object.keys(options).every(key => allowed.includes(key)), 'SOLANA_INVALID_BOUND_OPTIONS');
  const assertBinding = value => {
    requireCondition(value && value.genesis === genesis && value.solver === solver && registered.includes(value.recipient), 'SOLANA_BOUND_RUNTIME_MISMATCH');
    return value;
  };
  return Object.freeze(registered.map(recipient => {
    const own = value => { assertBinding(value); requireCondition(value.recipient === recipient, 'SOLANA_BOUND_RECIPIENT_MISMATCH'); return value; };
    return Object.freeze({ genesis, solver, recipient, genesisHex: '0x' + base58Decode(genesis, 32).toString('hex'), solverHex: '0x' + base58Decode(solver, 32).toString('hex'), recipientHex: '0x' + base58Decode(recipient, 32).toString('hex'),
      async transfer(lamports, options = {}) {
        exactOptions(options, ['beforeSign', 'onSigned']);
        const beforeSign = options.beforeSign ?? (async () => {}); requireCondition(typeof beforeSign === 'function', 'SOLANA_INVALID_PRE_SIGN_CALLBACK');
        const onSigned = options.onSigned ?? (async () => {}); requireCondition(typeof onSigned === 'function', 'SOLANA_INVALID_SIGNED_CALLBACK');
        return own(await bound.transfer(recipient, lamports, {
          beforeSign: intent => beforeSign(own(intent)),
          onSigned: signed => onSigned(own(signed)),
        }));
      },
      async observe(signature, options = {}) { exactOptions(options, ['expectedLamports', 'commitment', 'timeoutMs']); return own(await bound.observe(recipient, signature, options)); },
      async balance(address = recipient) { requireCondition(address === recipient || address === solver, 'SOLANA_BALANCE_REQUIRES_OWNED_ADDRESS'); return bound.balance(address); },
      replayFinalizedForReview: signature => bound.replayFinalizedForReview(recipient, signature),
      get transfers() { return structuredClone(bound.transfers(recipient)); },
    });
  }));
}


export const solanaRuntimePins = Object.freeze({
  validator: ['agave-v2.3.13/solana-release/bin/agave-validator', '5024f1b59afed531d4de067159084bf6ec7f20ab4b5424a61f8da3a23a4646dd'],
  genesis: ['agave-v2.3.13/solana-release/bin/solana-genesis', '19bb6f182cc67d7238457a358a95ba4c075fcc28ec0363397e13711d6e3b93cb'],
  cli: ['agave-v2.3.13/solana-release/bin/solana', 'ad7ae4b1dcb5cc1bb3395e0fd578d0827fd506451f3497a275de5413a6f3ccd5'],
  pohLibrary: ['agave-v2.3.13/solana-release/bin/perf-libs/libpoh-simd.so', 'e43a4b70fa85f49463fc872fd6a735317f3468010d1e656e68f4801e7998e9f9'],
});
async function pinnedSolanaBinary([relative, expectedHash]) {
  requireCondition(process.platform === 'linux' && process.arch === 'x64', 'SOLANA_PINNED_RUNTIME_REQUIRES_LINUX_X64');
  const root = await realpath(join(projectRoot, '.local/linux-runtimes')), path = await realpath(join(root, relative));
  requireCondition(path.startsWith(root + sep), 'SOLANA_RUNTIME_PATH_ESCAPE');
  const hash = createHash('sha256'); for await (const chunk of createReadStream(path)) hash.update(chunk);
  requireCondition(hash.digest('hex') === expectedHash, 'SOLANA_PINNED_EXECUTABLE_HASH_MISMATCH'); return path;
}
export function validateOwnedSocketRows(rows, requiredTcpPorts = []) {
  requireCondition(Array.isArray(rows) && rows.length > 0, 'SOLANA_NO_OWNED_SOCKET_EVIDENCE');
  for (const row of rows) {
    requireCondition(['ipv4', 'ipv6'].includes(row.family) && ['tcp', 'udp'].includes(row.protocol) && Number.isSafeInteger(row.localPort) && row.localPort > 0 && row.localPort <= 65535 && Number.isSafeInteger(row.remotePort) && row.remotePort >= 0 && row.remotePort <= 65535, 'SOLANA_INVALID_OWNED_SOCKET_ROW');
    const localLoopback = row.family === 'ipv4' ? row.localAddress === '0100007F' : row.localAddress === '00000000000000000000000001000000';
    const zero = row.family === 'ipv4' ? '00000000' : '0'.repeat(32);
    const remoteLoopback = row.remoteAddress === zero || row.remoteAddress === row.localAddress;
    if (!(localLoopback && remoteLoopback)) { const error = new Error('SOLANA_NON_LOOPBACK_OWNED_SOCKET'); error.ownedSockets = rows; error.offendingSocket = row; throw error; }
  }
  for (const port of requiredTcpPorts) requireCondition(rows.some(row => row.protocol === 'tcp' && row.localPort === port && row.state === '0A'), 'SOLANA_MISSING_OWNED_LOOPBACK_LISTENER');
  return rows;
}
async function inspectOwnedLoopbackSockets(pid, requiredTcpPorts) {
  requireCondition(process.platform === 'linux' && Number.isSafeInteger(pid) && pid > 0, 'SOLANA_INVALID_OWNED_PID');
  const dir = `/proc/${pid}/fd`, inodes = new Set();
  for (const name of await readdir(dir)) {
    try { const target = await readlink(join(dir, name)), match = /^socket:\[([0-9]+)\]$/.exec(target); if (match) inodes.add(match[1]); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  const rows = [];
  for (const [table, family, protocol] of [['tcp', 'ipv4', 'tcp'], ['tcp6', 'ipv6', 'tcp'], ['udp', 'ipv4', 'udp'], ['udp6', 'ipv6', 'udp']]) {
    const text = await readFile(`/proc/${pid}/net/${table}`, 'utf8');
    for (const line of text.trim().split('\n').slice(1)) {
      const fields = line.trim().split(/\s+/); if (!inodes.has(fields[9])) continue;
      const [localAddress, localPort] = fields[1].split(':'), [remoteAddress, remotePort] = fields[2].split(':');
      rows.push({ family, protocol, localAddress, localPort: parseInt(localPort, 16), remoteAddress, remotePort: parseInt(remotePort, 16), state: fields[3] });
    }
  }
  return validateOwnedSocketRows(rows, requiredTcpPorts);
}

// Reserve TCP+UDP across the whole candidate range before spawning. Releasing
// immediately before child startup still leaves the ordinary bind race; genesis
// and child-liveness checks fail closed if another process wins that race.
async function reserveOwnLoopbackPorts() {
  for (let attempt = 0; attempt < 20; attempt++) {
    const base = 22000 + (randomBytes(2).readUInt16BE() % 180) * 100, release = [];
    try {
      for (let port = base; port < base + 100; port++) {
        const tcp = createServer(); tcp.unref();
        await new Promise((resolve, reject) => { tcp.once('error', reject); tcp.listen(port, '127.0.0.1', resolve); });
        release.push(() => new Promise(resolve => tcp.close(resolve)));
        const udp = createSocket('udp4'); udp.unref();
        try { await new Promise((resolve, reject) => { udp.once('error', reject); udp.bind(port, '127.0.0.1', resolve); }); }
        catch (error) { udp.close(); throw error; }
        release.push(() => new Promise(resolve => udp.close(resolve)));
      }
      return { rpcPort: base, gossipPort: base + 2, faucetPort: base + 3, dynamicBase: base + 4, dynamicEnd: base + 99, release: async () => { await Promise.all(release.map(fn => fn())); } };
    } catch (error) {
      await Promise.all(release.map(fn => fn()));
      if (error.code !== 'EADDRINUSE') throw error;
    }
  }
  fail('SOLANA_NO_UNUSED_LOOPBACK_PORT_RANGE');
}
const envFor = cwd => ({ HOME: cwd, XDG_CONFIG_HOME: join(cwd, 'config'), XDG_DATA_HOME: join(cwd, 'data'), TMPDIR: cwd, TMP: cwd, TEMP: cwd, RUST_LOG: 'info', RAYON_NUM_THREADS: '2', SOLANA_RAYON_THREADS: '2', LANG: 'C' });

// Independent offline codec/signature cross-check, not execution evidence.
export async function verifySolanaWireOffline(transactionBase64) {
  const decoded = decodeSolanaTransfer(transactionBase64), binary = await pinnedSolanaBinary(solanaRuntimePins.cli);
  const cwd = await scratchDirectory('m14-solana-offline-wire-');
  try {
    const config = join(cwd, 'cli.yml');
    await writeFile(config, `json_rpc_url: http://127.0.0.1:1\nwebsocket_url: ws://127.0.0.1:2\nkeypair_path: ${JSON.stringify(join(cwd, 'unused.json'))}\ncommitment: finalized\n`, { mode: 0o600 });
    const result = await exec(binary, ['--config', config, 'decode-transaction', transactionBase64, 'base64', '--output', 'json'], { cwd, env: envFor(cwd), timeout: 10000, maxBuffer: 1024 * 1024 });
    const official = JSON.parse(result.stdout);
    requireCondition(official.sigverifyStatus?.length === 1 && official.sigverifyStatus[0] === 'pass', 'SOLANA_OFFICIAL_SIGNATURE_VERIFICATION_FAILED');
    requireCondition(official.transaction?.signatures?.[0] === decoded.signature && official.transaction.message.accountKeys[0] === decoded.solver && official.transaction.message.accountKeys[1] === decoded.recipient, 'SOLANA_OFFICIAL_WIRE_DECODE_MISMATCH');
    return { classification: 'OFFLINE_WIRE_FORMAT_VALIDATION_NOT_RUNTIME_EXECUTION', cliPin: solanaRuntimePins.cli, decoded, officialCliDecoded: official, broadcast: false };
  } finally { await removeOwnScratch(cwd); }
}

// A finite project-local retention option; omission preserves the pinned
// test-validator's historical 10,000-shred default. No host limit is changed.
export function solanaLedgerRetentionArguments(options = {}) {
  requireCondition(options && Object.getPrototypeOf(options) === Object.prototype && Object.keys(options).every(k => ['ledgerRetentionShreds', 'ticksPerSlot', 'resourceProfile'].includes(k)), 'SOLANA_INVALID_RETENTION_OPTIONS');
  if (Object.hasOwn(options, 'resourceProfile')) requireCondition(options.resourceProfile === SOLANA_BOUNDED_LEDGER_PROFILE, 'SOLANA_INVALID_RESOURCE_PROFILE');
  if (Object.hasOwn(options, 'ticksPerSlot')) requireCondition([16, 64].includes(options.ticksPerSlot), 'SOLANA_INVALID_SLOT_TIMING');
  if (!Object.hasOwn(options, 'ledgerRetentionShreds')) return [];
  requireCondition(Number.isSafeInteger(options.ledgerRetentionShreds) && options.ledgerRetentionShreds >= 10_000 && options.ledgerRetentionShreds <= 1_000_000, 'SOLANA_INVALID_LEDGER_RETENTION');
  return ['--limit-ledger-size', String(options.ledgerRetentionShreds)];
}
// No caller-provided endpoint, key, data directory or executable is accepted.
export async function createOwnedSolanaRuntime(progress = async () => {}, options = {}) {
  return createOwnedSolanaRuntimeProfile(progress, options, false);
}
// A separate fixed constructor; recipient/key/endpoint/count and runtime-option
// overrides never become HTTP settings or alter the historical default profile.
export async function createOwnedSolanaCohortRuntime(progress = async () => {}) {
  requireCondition(arguments.length <= 1 && typeof progress === 'function', 'SOLANA_COHORT_FIXED_CONSTRUCTOR');
  return createOwnedSolanaRuntimeProfile(progress, SOLANA_PRIVATE_COHORT_OPTIONS, true);
}
async function createOwnedSolanaRuntimeProfile(progress, options, cohort) {
  const retentionArguments = solanaLedgerRetentionArguments(options);
  requireCondition(solanaLoopbackCompatibilityPin !== null, 'SOLANA_LOOPBACK_COMPAT_BUILD_NOT_READY');
  const boundedLedger = options.resourceProfile === SOLANA_BOUNDED_LEDGER_PROFILE;
  const selectedValidatorPin = boundedLedger ? solanaRebuiltBoundedLedgerCompatibilityPin : solanaLoopbackCompatibilityPin;
  const binaries = { validator: await pinnedSolanaBinary(selectedValidatorPin) };
  try { await lstat(join(dirname(binaries.validator), 'perf-libs')); fail('SOLANA_UNREVIEWED_PERFORMANCE_LIBRARY_DIRECTORY'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const cwd = await scratchDirectory('m14-solana-'), ledger = join(cwd, 'ledger'), env = envFor(cwd);
  let handle, portReservation, metadata, cleanupOutcome, closePromise, isolationTimer, isolationCheck, isolationFailure, diagnostic = '', closed = false, shuttingDown = false, busy = false;
  const keys = {}, records = new Map();
  const close = () => closePromise ??= (async () => {
    if (closed) return cleanupOutcome;
    shuttingDown = true; clearInterval(isolationTimer);
    if (isolationCheck) await isolationCheck;
    const processOutcome = handle ? await stopOwnProcess(handle, { graceMs: 30000 }) : { stopped: true, forced: false };
    if (portReservation) { await portReservation.release(); portReservation = undefined; }
    for (const key of Object.values(keys)) key.seed.fill(0);
    await removeOwnScratch(cwd); closed = true;
    cleanupOutcome = { ownedProcessStopped: processOutcome.stopped, forced: processOutcome.forced, syntheticKeysAndLedgerRemoved: true };
    if (metadata) metadata.cleanup = cleanupOutcome;
    return cleanupOutcome;
  })();
  const sanitize = text => String(text).replaceAll(cwd, '[OWN_SCRATCH]').slice(-12000);
  try {
    await progress('Creating fresh synthetic keys for isolated local Solana');
    for (const role of ['solver', 'recipient', ...(cohort ? ['recipient1'] : []), 'unusedMint']) keys[role] = createSyntheticKey();
    const recipientAddresses = [keys.recipient.address, ...(cohort ? [keys.recipient1.address] : [])];
    await mkdir(ledger);
    const solverAccount = join(cwd, 'solver-account.json'), config = join(cwd, 'cli.yml');
    await writeFile(solverAccount, JSON.stringify({ pubkey: keys.solver.address, account: { lamports: 10000000000, data: ['', 'base64'], owner: '11111111111111111111111111111111', executable: false, rentEpoch: 0, space: 0 } }), { mode: 0o600 });
    const ports = portReservation = await reserveOwnLoopbackPorts();
    const { rpcPort, gossipPort, faucetPort, dynamicBase, dynamicEnd } = ports;
    const endpoint = `http://127.0.0.1:${rpcPort}`;
    await writeFile(config, `json_rpc_url: ${endpoint}\nwebsocket_url: ws://127.0.0.1:${rpcPort + 1}\nkeypair_path: ${JSON.stringify(join(cwd, 'unused.json'))}\ncommitment: finalized\n`, { mode: 0o600 });
    const args = ['--config', config, '--ledger', ledger, '--mint', keys.unusedMint.address, '--account', keys.solver.address, solverAccount, '--bind-address', '127.0.0.1', '--gossip-host', '127.0.0.1', '--rpc-port', String(rpcPort), '--gossip-port', String(gossipPort), '--faucet-port', String(faucetPort), '--faucet-sol', '0', '--dynamic-port-range', `${dynamicBase}-${dynamicEnd}`, '--ticks-per-slot', String(options.ticksPerSlot ?? 16), '--slots-per-epoch', '512', '--log', ...retentionArguments];
    await ports.release(); portReservation = undefined;
    const child = spawn(binaries.validator, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let spawnError;
    child.on('error', e => { spawnError = e.code; });
    const collectDiagnostic = bytes => { diagnostic = (diagnostic + bytes.toString()).slice(-48000); };
    child.stderr.on('data', collectDiagnostic); child.stdout.on('data', collectDiagnostic);
    handle = { child, assertAlive() { if (spawnError || child.exitCode !== null || child.signalCode !== null) { const error = new Error('SOLANA_VALIDATOR_EXITED'); error.diagnostic = sanitize(diagnostic); error.exitCode = child.exitCode; error.signal = child.signalCode; throw error; } } };
    const read = async (method, params = []) => { requireCondition(READ_METHODS.has(method), 'SOLANA_READ_ONLY_METHOD_REQUIRED'); requireCondition(!closed && !shuttingDown, 'SOLANA_RUNTIME_CLOSED'); if (isolationFailure) throw isolationFailure; handle.assertAlive(); return ownedRuntimeRpc(endpoint, method, params, { timeoutMs: 5000 }); };
    await progress('Starting Solana validator with loopback-only addresses and no public entrypoint');
    let ready = false;
    for (let i = 0; i < 240; i++) { handle.assertAlive(); try { ready = await read('getHealth') === 'ok'; if (ready) break; } catch {} await sleep(250); }
    if (!ready) { const error = new Error('SOLANA_STARTUP_TIMEOUT'); error.diagnostic = sanitize(diagnostic); throw error; }
    // Read identity from this child's freshly generated ledger, independently
    // of its RPC response. The local key file is synthetic and never exported.
    const genesis = base58Encode(createHash('sha256').update(await readFile(join(ledger, 'genesis.bin'))).digest());
    requireCondition(!PUBLIC_GENESIS.has(genesis), 'SOLANA_PUBLIC_GENESIS_FORBIDDEN');
    const identityFile = JSON.parse(await readFile(join(ledger, 'validator-keypair.json'), 'utf8'));
    requireCondition(Array.isArray(identityFile) && identityFile.length === 64 && identityFile.every(x => Number.isInteger(x) && x >= 0 && x <= 255), 'SOLANA_INVALID_OWN_IDENTITY_FILE');
    const identity = base58Encode(Buffer.from(identityFile.slice(32))); identityFile.fill(0);
    requireCondition(await read('getGenesisHash') === genesis, 'SOLANA_WRONG_GENESIS');
    const clusterNodes = await read('getClusterNodes');
    requireCondition(clusterNodes.length === 1 && clusterNodes[0].pubkey === identity, 'SOLANA_UNEXPECTED_CLUSTER_PEER');
    for (const peer of clusterNodes) for (const field of ['gossip', 'tpu', 'rpc']) if (peer[field]) requireCondition(/^127\.0\.0\.1:[0-9]+$/.test(peer[field]), 'SOLANA_NON_LOOPBACK_CONTACT');
    const runtimeMaps = await readFile(`/proc/${child.pid}/maps`, 'utf8');
    requireCondition(!runtimeMaps.includes('libpoh-simd.so') && !runtimeMaps.includes('libcuda-crypt.so'), 'SOLANA_UNPINNED_VENDOR_LIBRARY_LOADED');
    const dynamicLibraryPaths = [...new Set(runtimeMaps.split('\n').filter(line => /\.so(?:[.0-9]*)?(?: |$)/.test(line)).map(line => line.trim().split(/\s+/).at(-1)))].sort();
    const ownedSockets = await inspectOwnedLoopbackSockets(child.pid, [rpcPort, rpcPort + 1, faucetPort]);
    const balance = async (address = keys.recipient.address) => {
      requireCondition(address === keys.solver.address || recipientAddresses.includes(address), 'SOLANA_BALANCE_REQUIRES_OWNED_ADDRESS');
      const result = await read('getBalance', [address, { commitment: 'confirmed' }]); return safeInteger(result.value, 'SOLANA_UNSAFE_BALANCE').toString();
    };
    requireCondition(await balance(keys.solver.address) === '10000000000', 'SOLANA_SYNTHETIC_FUNDING_MISMATCH');
    metadata = { classification: 'OWNED_PROJECT_BUILT_LOOPBACK_AGAVE_TEST_VALIDATOR', runtimeVersion: await read('getVersion'), runtimePins: { validator: selectedValidatorPin }, pohImplementation: 'RUST_FALLBACK_NO_LIBPOH_SIMD_LOADED', dynamicLibraryPaths, officialSourceVersion: '2.3.13', compatibilityChanges: 'Six-file source-derived build: loopback faucet/RPC/PubSub/IP-echo/UDP-vote-client sockets; existing test-mode resource limit branch returns before any getrlimit/setrlimit call', sourceCommit: '5466f4592b1983adb13ba0a5d53f41ea2de69fba', sourcePatchSHA256: '68d9b1e48f9a62811b8bbaa35066ce99a9aa6907db683ce55ea7ea313bdeaf54', patchManifestSHA256: '3ab20c75760c6eae344a021abaa16bb182ce64545abd32f8cfdf152c0673454f', genesis, genesisHex: '0x' + base58Decode(genesis, 32).toString('hex'), publicKeys: { identity, ...Object.fromEntries(Object.entries(keys).map(([role, key]) => [role, key.address])) }, solverHex: '0x' + keys.solver.publicBytes.toString('hex'), recipientHex: '0x' + keys.recipient.publicBytes.toString('hex'), clusterNodes, ownedSockets, processId: child.pid, binding: '127.0.0.1', publicEntrypoints: [], faucetStarted: true, faucetBinding: `127.0.0.1:${faucetPort}`, faucetGenesisLamports: '0', faucetUsed: false, freshSyntheticKeys: true, hostSecurityChanged: false, genesisSource: 'SHA256 of freshly generated own genesis.bin', validatorArgs: args.map(sanitize), signing: 'Node Ed25519 with ephemeral synthetic solver key; no external wallet', assurance: 'trusted-owned-local-rpc-observation-not-public-consensus-proof' };
    if (boundedLedger) {
      metadata.compatibilityChanges = 'Seven-file source-derived build: original loopback/no-host-limit compatibility plus one aggregate RocksDB memtable flush threshold';
      metadata.sourcePatchSHA256 = 'b5f93d0b28f8438d146948b14d1378e2123a8c0eaec8c70fb96678c2b13e59a5';
      metadata.patchManifestSHA256 = 'f6e62a557520dc579c2bf3980805049fd9acde08a898091857f7c74b7a02972b';
      metadata.resourceProfile = { name: SOLANA_BOUNDED_LEDGER_PROFILE, aggregateMemtableFlushThresholdBytes: 134217728, strictProcessMemoryCap: false, processResourceFloorsChanged: false };
    }
    metadata.ledgerRetention = { requestedShreds: options.ledgerRetentionShreds ?? null, effectiveShreds: options.ledgerRetentionShreds ?? 10_000, upstreamDefaultShreds: 10_000, finiteLocalLedgerOnly: true };
    metadata.slotTiming = { requestedTicksPerSlot: options.ticksPerSlot ?? null, effectiveTicksPerSlot: options.ticksPerSlot ?? 16, historicalAdapterTicksPerSlot: 16, officialDefaultTicksPerSlot: 64 };
    if (cohort) metadata.cohortProfile = { name: SOLANA_PRIVATE_COHORT_PROFILE, recipientCount: 2, registeredRecipients: recipientAddresses.slice(), sharedNativeSolver: true, commonTrustedHost: true, externalAnonymitySetClaim: false };
    metadata.periodicSocketAudit = { intervalMs: 250, completedChecks: 0, failure: null };
    isolationTimer = setInterval(() => {
      if (isolationCheck || shuttingDown || isolationFailure) return;
      isolationCheck = inspectOwnedLoopbackSockets(child.pid, [rpcPort, rpcPort + 1, faucetPort]).then(() => {
        metadata.periodicSocketAudit.completedChecks++;
      }).catch(error => {
        if (shuttingDown) return;
        isolationFailure = error;
        metadata.periodicSocketAudit.failure = { message: error.message, ...(error.offendingSocket ? { offendingSocket: error.offendingSocket } : {}) };
        // Stop only this exact owned child on an isolation violation. Any
        // already signed effect remains recorded and is never blindly resent.
        if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
      }).finally(() => { isolationCheck = undefined; });
    }, 250);
    isolationTimer.unref();
    const transfer = async (recipient, lamports, { beforeSign = async () => {}, onSigned = async () => {} } = {}) => {
      requireCondition(typeof beforeSign === 'function' && typeof onSigned === 'function', 'SOLANA_INVALID_TRANSFER_CALLBACK');
      requireCondition(recipientAddresses.includes(recipient), 'SOLANA_UNREGISTERED_RECIPIENT');
      requireCondition(!busy, 'SOLANA_OPERATION_BUSY');
      requireCondition(![...records.values()].some(r => ['SIGNED_NOT_BROADCAST', 'BROADCASTING', 'BROADCAST_UNKNOWN', 'BROADCAST'].includes(r.phase)), 'SOLANA_PRIOR_TRANSFER_UNRESOLVED');
      busy = true;
      try {
        const amount = lamportsValue(lamports); await inspectOwnedLoopbackSockets(child.pid, [rpcPort, rpcPort + 1, faucetPort]); requireCondition(await read('getGenesisHash') === genesis, 'SOLANA_WRONG_GENESIS');
        const recent = await read('getLatestBlockhash', [{ commitment: 'confirmed' }]);
        safeInteger(recent.value.lastValidBlockHeight, 'SOLANA_INVALID_BLOCK_HEIGHT');
        // Last awaited authorization step before the native private key is
        // used. The generic gate rechecks current state here, after fetching
        // the exact blockhash; rejecting this callback produces no signature.
        await beforeSign(Object.freeze({ genesis, genesisHex: metadata.genesisHex,
          solver: keys.solver.address, solverHex: '0x' + keys.solver.publicBytes.toString('hex'),
          recipient, recipientHex: '0x' + base58Decode(recipient, 32).toString('hex'),
          lamports: amount.toString(), recentBlockhash: recent.value.blockhash,
          lastValidBlockHeight: recent.value.lastValidBlockHeight }));
        const signed = signSolanaTransfer({ seed: keys.solver.seed, recipient, recentBlockhash: recent.value.blockhash, lamports: amount });
        requireCondition(!records.has(signed.signature), 'SOLANA_SIGNED_IDENTITY_ALREADY_RECORDED_WAIT_NEW_BLOCKHASH');
        const record = { ...signed, genesis, genesisHex: metadata.genesisHex, lastValidBlockHeight: recent.value.lastValidBlockHeight, phase: 'SIGNED_NOT_BROADCAST', broadcastAttempts: 0 };
        records.set(signed.signature, record);
        await onSigned(structuredClone(record)); // Must resolve before any send.
        record.phase = 'BROADCASTING'; record.broadcastAttempts = 1;
        try {
          const returned = await ownedRuntimeRpc(endpoint, 'sendTransaction', [signed.transactionBase64, { encoding: 'base64', skipPreflight: false, preflightCommitment: 'confirmed', maxRetries: 0 }], { timeoutMs: 15000 });
          requireCondition(returned === signed.signature, 'SOLANA_BROADCAST_SIGNATURE_MISMATCH'); record.phase = 'BROADCAST'; return structuredClone(record);
        } catch (cause) {
          record.phase = 'BROADCAST_UNKNOWN'; const error = new Error('SOLANA_BROADCAST_UNKNOWN_OBSERVE_EXACT_SIGNATURE'); error.transfer = structuredClone(record); error.rpcCode = cause.rpcCode; throw error;
        }
      } finally { busy = false; }
    };
    const observe = async (recipient, signature, { expectedLamports, commitment = 'finalized', timeoutMs = 45000 } = {}) => {
      requireCondition(commitment === 'confirmed' || commitment === 'finalized', 'SOLANA_INVALID_COMMITMENT');
      requireCondition(Number.isSafeInteger(timeoutMs) && timeoutMs >= 0 && timeoutMs <= 120000, 'SOLANA_INVALID_TIMEOUT');
      const record = records.get(signature); requireCondition(record, 'SOLANA_UNKNOWN_SIGNED_IDENTITY');
      requireCondition(record.recipient === recipient && recipientAddresses.includes(recipient), 'SOLANA_BOUND_RECIPIENT_MISMATCH');
      if (expectedLamports !== undefined) requireCondition(lamportsValue(expectedLamports).toString() === record.lamports, 'SOLANA_EXPECTED_AMOUNT_MISMATCH');
      const deadline = Date.now() + timeoutMs;
      do {
        requireCondition(await read('getGenesisHash') === genesis, 'SOLANA_WRONG_GENESIS');
        const status = (await read('getSignatureStatuses', [[signature], { searchTransactionHistory: true }])).value[0];
        if (status?.err) { record.phase = 'OBSERVED_FAILED'; fail('SOLANA_OBSERVED_EXECUTION_FAILURE'); }
        if (status && (status.confirmationStatus === 'finalized' || (commitment === 'confirmed' && status.confirmationStatus === 'confirmed'))) {
          const transaction = await read('getTransaction', [signature, { encoding: 'base64', commitment, maxSupportedTransactionVersion: 0 }]);
          if (transaction) {
            const currentSlot = await read('getSlot', [{ commitment }]), block = await read('getBlock', [transaction.slot, { commitment, transactionDetails: 'signatures', rewards: false, maxSupportedTransactionVersion: 0 }]);
            const observed = validateSolanaObservation({ expected: record, genesis, status, transaction, currentSlot, block, commitment });
            await inspectOwnedLoopbackSockets(child.pid, [rpcPort, rpcPort + 1, faucetPort]);
            record.phase = observed.finalized ? 'OBSERVED_FINALIZED' : 'OBSERVED_CONFIRMED'; record.observation = observed; return structuredClone(observed);
          }
        }
        if (Date.now() >= deadline) break;
        await sleep(200);
      } while (true);
      // Diagnostics are fresh read-only facts, never a replacement for the
      // failed observation. Native identifiers stay on this private error.
      const inspect = async (method, params = []) => {
        try { return { ok: true, value: await read(method, params) }; }
        catch (cause) { return { ok: false, rpcCode: cause.rpcCode ?? null, error: String(cause.message).slice(0, 512) }; }
      };
      const statusRead = await inspect('getSignatureStatuses', [[signature], { searchTransactionHistory: true }]);
      const transactionRead = await inspect('getTransaction', [signature, { encoding: 'base64', commitment, maxSupportedTransactionVersion: 0 }]);
      const slot = transactionRead.value?.slot ?? record.observation?.slot;
      const observationDiagnostic = {
        kind: 'FRESH_TIMEOUT_READS_NOT_AUTHORIZATION', signature, commitment,
        retainedPreviouslyFinalized: record.observation?.finalized === true,
        priorSlot: record.observation?.slot ?? null, statusRead, transactionRead,
        blockRead: Number.isSafeInteger(slot) ? await inspect('getBlock', [slot, { commitment, transactionDetails: 'signatures', rewards: false, maxSupportedTransactionVersion: 0 }]) : { notRequested: 'NO_KNOWN_SLOT' },
        currentSlotRead: await inspect('getSlot', [{ commitment }]),
        minimumLedgerSlotRead: await inspect('minimumLedgerSlot'),
        firstAvailableBlockRead: await inspect('getFirstAvailableBlock'),
      };
      const error = new Error('SOLANA_OBSERVATION_PENDING_NO_RESEND'); error.transfer = structuredClone(record); error.observationDiagnostic = observationDiagnostic; throw error;
    };
    // Explicit acceptance-test control only. This can resend only the retained
    // bytes of a known already-finalized effect, once; ordinary recovery never
    // calls this path or constructs a replacement transaction.
    const replayFinalizedForReview = async (recipient, signature) => {
      requireCondition(!busy, 'SOLANA_OPERATION_BUSY');
      const record = records.get(signature);
      requireCondition(record && record.recipient === recipient && recipientAddresses.includes(recipient), 'SOLANA_BOUND_RECIPIENT_MISMATCH');
      requireCondition(record?.phase === 'OBSERVED_FINALIZED', 'SOLANA_REPLAY_REQUIRES_KNOWN_FINALIZED_TRANSFER');
      requireCondition(!record.replayReviewAttempts, 'SOLANA_REPLAY_REVIEW_ALREADY_ATTEMPTED');
      busy = true;
      try {
        requireCondition(await read('getGenesisHash') === genesis, 'SOLANA_WRONG_GENESIS');
        await inspectOwnedLoopbackSockets(child.pid, [rpcPort, rpcPort + 1, faucetPort]);
        const before = { solver: await balance(keys.solver.address), recipient: await balance(recipient), slot: await read('getSlot', [{ commitment: 'confirmed' }]) };
        record.replayReviewAttempts = 1;
        let returnedSignature = null, rpcCode = null, submissionResponse = 'accepted';
        try {
          returnedSignature = await ownedRuntimeRpc(endpoint, 'sendTransaction', [record.transactionBase64, { encoding: 'base64', skipPreflight: false, preflightCommitment: 'confirmed', maxRetries: 0 }], { timeoutMs: 15000 });
        } catch (error) { submissionResponse = 'rejected-or-transport-unknown'; rpcCode = error.rpcCode ?? null; }
        if (submissionResponse === 'accepted') requireCondition(returnedSignature === signature, 'SOLANA_REPLAY_RESPONSE_SIGNATURE_MISMATCH');
        let laterSlot = before.slot;
        const deadline = Date.now() + 15000;
        while (laterSlot <= before.slot && Date.now() < deadline) { await sleep(200); laterSlot = await read('getSlot', [{ commitment: 'confirmed' }]); }
        requireCondition(laterSlot > before.slot, 'SOLANA_REPLAY_REVIEW_SLOT_DID_NOT_ADVANCE');
        const original = await observe(recipient, signature, { expectedLamports: record.lamports });
        const after = { solver: await balance(keys.solver.address), recipient: await balance(recipient), slot: laterSlot };
        requireCondition(after.solver === before.solver && after.recipient === before.recipient, 'SOLANA_REPLAY_ADDED_BALANCE_EFFECT');
        const result = { classification: 'DELIBERATE_FINALIZED_NATIVE_REPLAY_CONTROL_NOT_RECOVERY', signature, transactionSHA256: record.transactionSHA256, instructionIndex: 0, submissionResponse, returnedSignature, rpcCode, retainedIdenticalBytesSubmitted: true, reviewBroadcastAttempts: 1, before, after, additionalRecipientCreditLamports: '0', additionalSolverDebitLamports: '0', originalFinalizedSlot: original.slot, originalStillFinalized: original.finalized };
        record.replayReview = result; return structuredClone(result);
      } finally { busy = false; }
    };
    const views = createBoundSolanaRecipientViews({ genesis, solver: keys.solver.address, recipients: recipientAddresses }, {
      transfer, observe, balance, replayFinalizedForReview, transfers: recipient => [...records.values()].filter(record => record.recipient === recipient),
    });
    const primary = views[0];
    const runtime = Object.freeze({ solver: primary.solver, recipient: primary.recipient, genesis, solverHex: primary.solverHex, recipientHex: primary.recipientHex, genesisHex: primary.genesisHex, metadata,
      transfer: primary.transfer, observe: primary.observe, balance: primary.balance, replayFinalizedForReview: primary.replayFinalizedForReview,
      ...(cohort ? { recipientView(index) { requireCondition(Number.isSafeInteger(index) && index >= 0 && index < 2 && !Object.is(index, -0), 'SOLANA_INVALID_COHORT_PARTICIPANT'); return views[index]; } } : {}),
      // Private evaluator access, never exposed through the wallet HTTP API.
      // Keeps full public-chain transactions and their linkage unredacted.
      readPublic: async (method, params = []) => structuredClone(await read(method, params)),
      get transfers() { return structuredClone([...records.values()]); }, close });
    // Only views backed by this actual successfully started pinned validator
    // gain an execution/observation capability. The public pure view factory
    // used by schema tests cannot mint these markers.
    ownedSolanaRuntimes.add(runtime);
    ownedSolanaRecipientViews.add(runtime);
    for (const view of views) ownedSolanaRecipientViews.add(view);
    return runtime;

  } catch (error) {
    try { error.cleanup = await close(); }
    catch (cleanupError) { error.cleanup = { ownedProcessStopped: false, syntheticKeysAndLedgerRemoved: false, error: cleanupError.message }; }
    throw error;
  }
}
