/** Fixed private owner child. Only this role opens the encrypted custody.
 * Witnesses and graph outputs use the owner plane, never public projections.
 * Process separation assumes a trusted common OS; it is not an OS sandbox. */
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {openTrustedOwnerDraft, recoverUncommittedOwnerDraft, OBSERVATION_TRUST} from './generic-balance-custody.mjs';
import {BALANCE_OWNER_PROTOCOL, createFrameReader, writeFrame, need, problem,
  safeCode, methodPlane, NO_INPUT_METHODS} from './generic-balance-owner-protocol.mjs';

export async function runGenericBalanceOwnerChild() {
  need(process.argv.length === 2, 'BALANCE_OWNER_FIXED_CHILD');
  let session = null, owner, booted = false, busy = false, stopped = false;
  let nextId = 1, hostSequence = 0, pendingHost = null;
  const send = fields => writeFrame(process.stdout, {protocol: BALANCE_OWNER_PROTOCOL, session, ...fields});

  function stop(code) {
    if (stopped) return;
    stopped = true; reader.close(); owner?.close(); owner = null;
    pendingHost?.reject(problem('BALANCE_OWNER_PARENT_LOST')); pendingHost = null;
    process.stdin.destroy(); process.stdout.end(); process.exitCode = code;
  }
  async function host(method, input = null) {
    need(!stopped && !pendingHost, 'BALANCE_OWNER_HOST_BUSY');
    const sequence = ++hostSequence;
    const result = new Promise((resolve, reject) => { pendingHost = {sequence, resolve, reject}; });
    result.catch(() => {});
    await send({type: 'hostRequest', sequence, method, input});
    return result;
  }
  async function boot(message) {
    need(session === null && !busy && !booted, 'BALANCE_OWNER_BOOT_ONCE');
    session = message.session; busy = true;
    try {
      const open = message.mode === 'recoverAbsent' ? recoverUncommittedOwnerDraft : openTrustedOwnerDraft;
      const opened = await open(message.config, {
        observer: {trust: OBSERVATION_TRUST, readSnapshot: () => host('readSnapshot'),
          readTransaction: input => host('readTransaction', input)},
        onCheckpoint: cp => host('checkpoint', cp),
      });
      owner = opened.owner; message.config.password = '';
      booted = true; await send({type: 'ready', summary: owner.summary(), recovery: opened.recovery});
    } catch (error) {
      await send({type: 'startupFailure', code: safeCode(error)}).catch(() => {}); stop(1);
    } finally { busy = false; }
  }
  async function command(message) {
    need(booted && !busy && message.id === nextId++, 'BALANCE_OWNER_REQUEST_SEQUENCE');
    need(message.plane === methodPlane(message.method), 'BALANCE_OWNER_PLANE'); busy = true;
    try {
      let result;
      if (message.method === 'close') result = {closed: true};
      else if (NO_INPUT_METHODS.includes(message.method)) result = await owner[message.method]();
      else result = await owner[message.method](message.input);
      await send({type: 'result', id: message.id, ok: true, result});
      if (message.method === 'close') stop(0);
    } catch (error) {
      // A custody write error leaves this process alive so it can authenticate
      // or resume its exact retained candidate. Never serialize error messages.
      await send({type: 'result', id: message.id, ok: false, code: safeCode(error)}).catch(() => stop(1));
    } finally { busy = false; }
  }
  function receive(message) {
    if (message.type === 'boot') { void boot(message).catch(() => stop(1)); return; }
    need(message.session === session, 'BALANCE_OWNER_SESSION');
    if (message.type === 'hostReply') {
      need(pendingHost && message.sequence === pendingHost.sequence, 'BALANCE_OWNER_HOST_SEQUENCE');
      const waiting = pendingHost; pendingHost = null;
      message.ok ? waiting.resolve(message.result) : waiting.reject(problem(message.code));
      return;
    }
    need(message.type === 'request', 'BALANCE_OWNER_MESSAGE_TYPE');
    void command(message).catch(() => stop(1));
  }
  const reader = createFrameReader(receive);
  process.stdin.on('data', bytes => {
    try { reader.push(bytes); } catch { stop(1); } finally { bytes.fill(0); }
  });
  process.stdin.on('end', () => { try { reader.end(); } catch {} stop(stopped ? process.exitCode : 1); });
  process.stdin.on('error', () => stop(1)); process.stdout.on('error', () => stop(1));
  for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => {
    // Immediate owned-child exit makes any in-flight write uncertain. Keeper
    // pending hashes, rather than process-exit inference, govern recovery.
    owner?.close(); process.exit(2);
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runGenericBalanceOwnerChild().catch(() => { process.exitCode = 1; });
}
