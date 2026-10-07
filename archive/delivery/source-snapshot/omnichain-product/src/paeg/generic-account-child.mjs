/** Fixed opaque-account child: only the separate encrypted journal is opened.
 * Owner vaults, graphs, role packets, runtime and proving capabilities stay out. */
import {fileURLToPath} from 'node:url';
import {Vault} from '../vault.mjs';
import {createGenericAccountCoordinator} from './generic-account-coordinator.mjs';
import {copy, exact, need, validateGenericAccountConfig} from './generic-account-journal.mjs';
import {ACCOUNT_PROTOCOL, ACCOUNT_TIMEOUT_MS, accountError, decodeAccountMessage, encodeAccountMessage, validateJournalCredentials} from './generic-account-process.mjs';

export async function runGenericAccountCoordinatorChild(transport = process) {
  need(typeof transport.send === 'function', 'JOURNAL_PROTOCOL');
  let coordinator, journal, active, pendingBridge, lastCommand = 0, nextBridge = 0, stopped = false;
  let startTimer = setTimeout(() => fatal(accountError({code: 'JOURNAL_CHILD_LOST'})), 30_000);
  async function send(message) {
    const bytes = encodeAccountMessage(message);
    try { await new Promise((resolve, reject) => transport.send(bytes, error => error ? reject(error) : resolve())); }
    finally { bytes.fill(0); }
  }
  function cleanup(code) {
    if (stopped) return; stopped = true; clearTimeout(startTimer);
    if (pendingBridge) { clearTimeout(pendingBridge.timer); pendingBridge.reject(accountError({code: 'JOURNAL_CHILD_LOST'})); pendingBridge = null; }
    try { coordinator?.close(); } catch { /* The keeper reconciles an interrupted original request. */ }
    if (journal) journal.password = null;
    coordinator = journal = undefined; transport.exitCode = code;
    if (transport.connected) transport.disconnect();
  }
  function fatal(error) { if (!stopped) void send({kind: 'fatal', protocol: ACCOUNT_PROTOCOL, code: accountError(error).code}).catch(() => {}).finally(() => cleanup(1)); }
  async function bridge(method, input) {
    need(active && !pendingBridge && !stopped, 'JOURNAL_PROTOCOL');
    const id = ++nextBridge, requestId = active.id;
    const result = new Promise((resolve, reject) => {pendingBridge = {id, requestId, resolve, reject, timer: setTimeout(() => fatal(accountError({code: 'JOURNAL_HOST_UNAVAILABLE'})), ACCOUNT_TIMEOUT_MS)};});
    void send({kind: 'bridge', protocol: ACCOUNT_PROTOCOL, id, requestId, method, input}).catch(fatal);
    return result;
  }
  const host = Object.fromEntries(['assertAuthority', 'proposeCheckpoint', 'retainCheckpoint', 'prepare', 'execute', 'reconcile', 'recover', 'observe'].map(method => [method, input => bridge(method, input)]));
  async function operate(message) {
    if (message.operation === 'initialize') {
      need(!coordinator, 'JOURNAL_PROTOCOL'); exact(message.input, ['config', 'journal', 'opening']);
      const config = validateGenericAccountConfig(message.input.config); journal = validateJournalCredentials(message.input.journal);
      const vault = new Vault(journal.path);
      const store = {create: data => vault.create(data, journal.password), read: () => vault.read(journal.password), update: (revision, transform) => vault.update(journal.password, revision, transform)};
      coordinator = createGenericAccountCoordinator(config, {store, host});
      return coordinator.open(message.input.opening);
    }
    need(coordinator, 'JOURNAL_NOT_OPEN');
    if (message.operation === 'prepare') return coordinator.prepare(message.input);
    if (['execute', 'reconcile', 'recover'].includes(message.operation)) { exact(message.input, ['requestId']); return coordinator[message.operation](message.input.requestId); }
    need(message.input === null, 'JOURNAL_PROTOCOL');
    if (message.operation === 'snapshot') return coordinator.snapshot();
    if (message.operation === 'close') {coordinator.close(); return {closed: true};}
    need(false, 'JOURNAL_PROTOCOL');
  }
  transport.on('message', bytes => {
    try {
      const message = decodeAccountMessage(bytes); need(message.protocol === ACCOUNT_PROTOCOL, 'JOURNAL_PROTOCOL');
      if (message.kind === 'bridgeResult') {
        exact(message, message.ok === true ? ['kind', 'protocol', 'id', 'requestId', 'ok', 'value'] : ['kind', 'protocol', 'id', 'requestId', 'ok', 'code']);
        need(pendingBridge && message.id === pendingBridge.id && message.requestId === pendingBridge.requestId && typeof message.ok === 'boolean', 'JOURNAL_PROTOCOL');
        const pending = pendingBridge; pendingBridge = null; clearTimeout(pending.timer);
        if (message.ok) pending.resolve(copy(message.value)); else pending.reject(accountError({code: message.code}));
        return;
      }
      exact(message, ['kind', 'protocol', 'id', 'operation', 'input']);
      need(message.kind === 'request' && Number.isSafeInteger(message.id) && message.id === lastCommand + 1 && !active && !stopped, 'JOURNAL_PROTOCOL');
      lastCommand = message.id; active = message; clearTimeout(startTimer);
      void (async () => {
        try {const result = await operate(message); await send({kind: 'result', protocol: ACCOUNT_PROTOCOL, id: message.id, ok: true, value: result});}
        catch (error) {await send({kind: 'result', protocol: ACCOUNT_PROTOCOL, id: message.id, ok: false, code: accountError(error).code});}
        finally { if (message.operation === 'initialize') message.input.journal.password = null; active = null; if (message.operation === 'close') cleanup(0); }
      })().catch(fatal);
    } catch (error) {fatal(error);}
  });
  transport.once('disconnect', () => cleanup(stopped ? transport.exitCode : 1));
  transport.once('uncaughtException', () => fatal(accountError({code: 'JOURNAL_CHILD_REJECTED'})));
  transport.once('unhandledRejection', () => fatal(accountError({code: 'JOURNAL_CHILD_REJECTED'})));
  await send({kind: 'ready', protocol: ACCOUNT_PROTOCOL});
}
if (process.argv[1] === fileURLToPath(import.meta.url)) runGenericAccountCoordinatorChild().catch(() => {process.exitCode = 1; if (process.connected) process.disconnect();});
