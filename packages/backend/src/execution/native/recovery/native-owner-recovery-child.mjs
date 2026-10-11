/** DRAFT fixed private child. No runtime, RPC client, prover, key-export or
 * caller-selected executable exists here. Only this child opens the Vaults. */
import { fileURLToPath } from 'node:url';
import { openGenericOwnerRecoveryCustody } from './native-owner-recovery-custody.mjs';
import { wipePrivate } from '@lianum/proofs/execution/proof-worker';
import { PROTOCOL, TIMEOUT_MS, NOTES, domains, problem, need, codeFor, copy, same, exact,
  sequence, note, encode, decode, config, query, view, observed, requestFor } from './native-owner-recovery-protocol.mjs';

async function worker() {
  need(typeof process.send === 'function', 'PRIVATE_IPC_REQUIRED');
  let custody, cfg, active, selectedStatus, lastObservation, pendingBridge;
  let lastId = 0, bridgeId = 0, stopped = false;
  let timer = setTimeout(() => fatal(problem('OWNER_RECOVERY_START_TIMEOUT')), TIMEOUT_MS);
  async function send(value) {
    const bytes = encode(value);
    try { await new Promise((resolve, reject) => process.send(bytes, error => error ? reject(error) : resolve())); }
    finally { bytes.fill(0); }
  }
  function cleanup(code) {
    if (stopped) return;
    stopped = true; clearTimeout(timer);
    if (pendingBridge) { clearTimeout(pendingBridge.timer); pendingBridge.reject(problem('OWNER_RECOVERY_CHILD_EXIT')); pendingBridge = null; }
    try { custody?.close(); } catch { /* A forced exit may interrupt an uncertain write. Reopen to reconcile. */ }
    wipePrivate(cfg); cfg = custody = selectedStatus = lastObservation = undefined;
    process.exitCode = code;
    if (process.connected) process.disconnect();
  }
  function fatal(error) {
    if (stopped) return;
    const exitTimer = setTimeout(() => process.exit(1), 1000);
    send({ kind: 'fatal', protocol: PROTOCOL, code: codeFor(error) })
      .catch(() => {}).finally(() => { cleanup(1); clearTimeout(exitTimer); });
  }
  async function bridge(operation, input) {
    need(active && !pendingBridge && !stopped, 'BRIDGE_BUSY_OR_CLOSED');
    const id = ++bridgeId, requestId = active.id;
    const response = new Promise((resolve, reject) => {
      pendingBridge = { id, requestId, operation, resolve, reject,
        timer: setTimeout(() => fatal(problem('OWNER_RECOVERY_BRIDGE_TIMEOUT')), TIMEOUT_MS) };
    });
    try { await send({ kind: 'bridge', protocol: PROTOCOL, id, requestId, operation, input }); }
    catch (error) { fatal(error); }
    return response;
  }
  async function observe() {
    const result = await bridge('observe', query(cfg.expectedBinding, selectedStatus.note));
    exact(result, ['observationId', 'view']); sequence(result.observationId);
    lastObservation = { observationId: result.observationId, view: view(result.view, cfg.expectedBinding) };
    return copy(lastObservation.view);
  }
  async function assertCanonical(input) {
    need(lastObservation && same(input, lastObservation.view), 'BRIDGE_OBSERVATION');
    const result = await bridge('assertCanonical', { observationId: lastObservation.observationId });
    exact(result, ['canonical']); need(result.canonical === true, 'CANONICAL_OBSERVATION_REQUIRED'); return true;
  }
  const observer = {
    async observe(input) {
      need(same(input, { ...domains(cfg.expectedBinding), ...selectedStatus }), 'BRIDGE_QUERY');
      return observe();
    },
    assertCanonical,
  };
  async function operate(message) {
    let result;
    switch (message.operation) {
      case 'initialize':
        need(!cfg && !custody, 'INITIALIZE_ONCE'); cfg = config(message.input);
        custody = await openGenericOwnerRecoveryCustody(cfg, observer);
        result = { record: custody.recordStatus(), statuses: Object.fromEntries(NOTES.map(name => [name, custody.withdrawalStatus(name)])) };
        break;
      case 'withdrawalStatus':
        need(custody, 'NOT_READY'); exact(message.input, ['note']); result = custody.withdrawalStatus(note(message.input.note));
        break;
      case 'authorizeCurrentNote': {
        need(custody, 'NOT_READY'); exact(message.input, ['note']);
        selectedStatus = custody.withdrawalStatus(note(message.input.note));
        need(selectedStatus.eligibility === 'OBSERVATION_REQUIRED', selectedStatus.eligibility);
        const current = await observe();
        const spent = current.nullifiers.includes('0x' + selectedStatus.canonicalNullifier);
        const issued = current.commitments.includes('0x' + selectedStatus.noteCommitment);
        if (spent || !issued) {
          await assertCanonical(current);
          result = { status: spent ? 'NOTE_CONSUMED_REQUIRES_TRANSACTION_RECONCILIATION' : 'NOTE_NOT_ISSUED_AT_OBSERVATION',
            observed: observed(current, selectedStatus) };
        } else {
          // A second real read occurs in custody. A changed root/epoch rejects;
          // retry derives a new path. Custody alone signs and persists the witness.
          result = await custody.authorizeWithdrawal(requestFor(selectedStatus, current));
        }
        break;
      }
      case 'close': need(message.input === null, 'INPUT'); result = { closed: true }; break;
      default: need(false, 'OPERATION_DENIED');
    }
    return result;
  }
  process.on('message', bytes => {
    let message;
    try {
      message = decode(bytes); need(message.protocol === PROTOCOL, 'PROTOCOL');
      if (message.kind === 'bridgeResult') {
        exact(message, message.ok === true ? ['kind', 'protocol', 'id', 'requestId', 'ok', 'value']
          : ['kind', 'protocol', 'id', 'requestId', 'ok', 'code']);
        need(pendingBridge && message.id === pendingBridge.id && message.requestId === pendingBridge.requestId
          && (message.ok === true || message.ok === false), 'BRIDGE_SEQUENCE');
        const pending = pendingBridge; pendingBridge = null; clearTimeout(pending.timer);
        if (message.ok) pending.resolve(copy(message.value));
        else pending.reject(problem(codeFor({ code: message.code })));
        wipePrivate(message); return;
      }
      exact(message, ['kind', 'protocol', 'id', 'operation', 'input']);
      need(message.kind === 'request' && sequence(message.id) === lastId + 1, 'SEQUENCE');
      need(!active && !stopped, 'BUSY_OR_CLOSED'); lastId = message.id; active = message;
      clearTimeout(timer); timer = setTimeout(() => fatal(problem('OWNER_RECOVERY_OPERATION_TIMEOUT')), TIMEOUT_MS);
      void (async () => {
        let result;
        try {
          result = await operate(message);
          await send({ kind: 'result', protocol: PROTOCOL, id: message.id, ok: true, value: result });
        } catch (error) {
          await send({ kind: 'result', protocol: PROTOCOL, id: message.id, ok: false, code: codeFor(error) });
        } finally {
          const close = message.operation === 'close';
          wipePrivate(result); wipePrivate(message); active = selectedStatus = lastObservation = undefined;
          clearTimeout(timer); if (close) cleanup(0);
        }
      })().catch(fatal);
    } catch (error) { wipePrivate(message); fatal(error); }
  });
  process.once('disconnect', () => { if (!stopped) { cleanup(1); process.exit(1); } });
  process.once('uncaughtException', () => fatal(problem('OWNER_RECOVERY_CHILD_FAILURE')));
  process.once('unhandledRejection', () => fatal(problem('OWNER_RECOVERY_CHILD_FAILURE')));
  await send({ kind: 'ready', protocol: PROTOCOL });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  worker().catch(() => { process.exitCode = 1; if (process.connected) process.disconnect(); });
}
