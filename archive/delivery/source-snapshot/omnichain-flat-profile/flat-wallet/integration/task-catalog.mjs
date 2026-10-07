/** Fixed internal process tasks. No caller path, command, URL or numeric limit. */
import assert from 'node:assert/strict';
const tasks = Object.freeze({
  'claim-verifiers': { entry: 'run-claim-verifier-compilation.mjs', worker: 'claim-verifier-compilation-worker.mjs', output: 'claim-verifier-compilation' },
  'native-claim': { entry: 'run-native-claim-constraints.mjs', worker: 'native-claim-constraints-worker.mjs', output: 'native-claim-constraints' },
  'evm-deposit': { entry: 'run-evm-deposit-constraints.mjs', worker: 'evm-deposit-constraints-worker.mjs', output: 'evm-deposit-constraints' },
  envelope: { entry: 'run-envelope-constraints.mjs', worker: 'envelope-constraints-worker.mjs', output: 'envelope-constraints' },
  native: { entry: 'run-native-constraints.mjs', worker: 'native-constraints-worker.mjs', output: 'native-constraints' },
  completion: { entry: 'run-completion-constraints.mjs', worker: 'completion-constraints-worker.mjs', output: 'completion-constraints' },
  verification: { entry: 'run-pinned-verification.mjs', worker: 'pinned-verification-worker.mjs', output: 'pinned-verification' },
  verifiers: { entry: 'run-verifier-compilation.mjs', worker: 'verifier-compilation-worker.mjs', output: 'verifier-compilation' },
});
export function integrationTask(name) {
  assert.ok(typeof name === 'string' && Object.hasOwn(tasks, name), 'ENVELOPE_FIXED_TASK');
  return tasks[name];
}
