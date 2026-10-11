/** Retained terminal transitions. The keeper supplies its fixed storage,
 * proof, observer and runtime operations under its exclusive lifetime guard. */
import assert from 'node:assert/strict';
/** @typedef {import('./terminal-reconciliation-v2.mjs').TerminalKind} TerminalKind */
/** @typedef {import('./terminal-reconciliation-v2.mjs').TerminalObservation} TerminalObservation */
/** @typedef {{target: string, calldata: string, calldataSHA256: string,
 * transactionHash: string | null}} TerminalSubmission */
/** @typedef {{recoverySubmission: TerminalSubmission | null,
 * settlementSubmission: TerminalSubmission | null}} Submissions */

/**
 * @template { {transactionHash: string} } Receipt
 * @param {string} reference @param {TerminalKind} kind
 * @param {string} target @param {string} calldata
 * @param {{operation(reference: string): Submissions, calldataHash(calldata: string): string,
 * update(reference: string, values: Partial<Submissions>): Promise<unknown>,
 * beforeSend(reference: string, kind: TerminalKind): Promise<unknown>,
 * send(label: string, request: {to: string, data: string}): Promise<Receipt>,
 * bareHash(hash: string): string}} ports
 * @returns {Promise<Receipt>}
 */
export async function sendRetainedTerminalV2(reference, kind, target, calldata, ports) {
  const entry = ports.operation(reference);
  const key = kind === 'recovery' ? 'recoverySubmission' : 'settlementSubmission';
  assert.equal(entry[key], null, 'FLAT_EXECUTION_NO_RESEND');
  const submission = {target, calldata, calldataSHA256: ports.calldataHash(calldata), transactionHash: null};
  await ports.update(reference, {[key]: submission});
  await ports.beforeSend(reference, kind);
  const receipt = await ports.send('flat-execution-' + kind + '-' + reference, {to: target, data: calldata});
  await ports.update(reference, {[key]: {...submission, transactionHash: ports.bareHash(receipt.transactionHash)}});
  return receipt;
}

/**
 * @template Binding, Statement, Checkpoint
 * @template {TerminalObservation} Result
 * @param {string} reference @param {TerminalKind} kind
 * @param {{operation(reference: string): Submissions & {binding: Binding,
 * recoveryStatement: Statement | null, settlementStatement: Statement | null, originalFCheckpoint?: Checkpoint},
 * detached<T>(value: T): T, wrapped: boolean,
 * observe(query: {kind: TerminalKind, submission: TerminalSubmission, binding: Binding,
 * statement: Statement | null}): Promise<Result>,
 * recoveryCheckpoint(result: Result): Checkpoint,
 * update(reference: string, values: {originalFCheckpoint: Checkpoint}): Promise<unknown>}} ports
 * @returns {Promise<Result>}
 */
export async function observeRetainedTerminalV2(reference, kind, ports) {
  const entry = ports.operation(reference);
  const saved = entry[kind === 'recovery' ? 'recoverySubmission' : 'settlementSubmission'];
  assert.ok(saved, 'FLAT_EXECUTION_NO_TERMINAL_SUBMISSION');
  const observed = await ports.observe({kind, submission: ports.detached(saved), binding: ports.detached(entry.binding),
    statement: ports.detached(kind === 'recovery' ? entry.recoveryStatement : entry.settlementStatement)});
  if (!ports.wrapped && kind === 'recovery' && !entry.originalFCheckpoint) {
    await ports.update(reference, {originalFCheckpoint: ports.recoveryCheckpoint(observed)});
  }
  return observed;
}

/** @typedef {{reserveNullifier: string, inputNullifier: string, settleBefore: string}} RecoveryBinding */
/**
 * @template {Submissions & {binding: RecoveryBinding}} Entry
 * @template {{head: {timestamp: string}, ledger: {nullifiers: string[]}}} View
 * @template Statement, Proof
 * @template {{statement: Statement}} Job
 * @template {TerminalObservation} Result
 * @param {string} reference
 * @param {{refresh(): Promise<unknown>, operation(reference: string): Entry, read(): Promise<View>,
 * observe(reference: string, kind: TerminalKind): Promise<Result>, prefix(hash: string): string,
 * prepare(entry: Entry, view: View): Promise<Job>,
 * prove(reference: string, kind: 'recovery', job: Job, label: string): Promise<Proof>,
 * update(reference: string, values: {recoveryStatement: Statement} | {outcome: 'RECOVERED', stage: 'RECOVERED', errorCode: null}): Promise<unknown>,
 * stage(reference: string, stage: string): Promise<unknown>, send(reference: string, proof: Proof): Promise<unknown>,
 * onStage(event: {reference: string, stage: string}): Promise<unknown>}} ports
 * @returns {Promise<Result>}
 */
export async function recoverRetainedTerminalV2(reference, ports) {
  await ports.refresh();
  const entry = ports.operation(reference);
  if (entry.recoverySubmission) return ports.observe(reference, 'recovery');
  const view = await ports.read();
  if (view.ledger.nullifiers.includes(ports.prefix(entry.binding.reserveNullifier))) {
    assert.ok(entry.settlementSubmission, 'FLAT_EXECUTION_SPENT_OUTCOME_REQUIRES_RECONCILIATION');
    return ports.observe(reference, 'settlement');
  }
  assert.ok(BigInt(view.head.timestamp) >= BigInt(entry.binding.settleBefore), 'FLAT_EXECUTION_RECOVERY_BEFORE_CUTOFF');
  assert.ok(view.ledger.nullifiers.includes(ports.prefix(entry.binding.inputNullifier)), 'FLAT_EXECUTION_RESERVATION_REQUIRED');
  // The original F competes with any retained T for the same nullifier. An
  // unknown acknowledgement retains its submission and cannot trigger a resend.
  const job = await ports.prepare(entry, view);
  const proof = await ports.prove(reference, 'recovery', job, 'original-timeout-recovery');
  await ports.update(reference, {recoveryStatement: job.statement});
  await ports.stage(reference, 'submit-original-timeout-recovery');
  await ports.send(reference, proof);
  const confirmed = await ports.observe(reference, 'recovery');
  await ports.update(reference, {outcome: 'RECOVERED', stage: 'RECOVERED', errorCode: null});
  await ports.onStage({reference, stage: 'recovery-included'});
  return confirmed;
}
