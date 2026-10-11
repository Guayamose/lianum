/** Fixed internal process tasks. No caller path, command, URL or numeric limit. */
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
const tasks = Object.freeze({
  'claim-verifiers': { entry: fileURLToPath(new URL('../proofs/verifiers/run-claim-verifier-compilation.mjs',import.meta.url)), worker: fileURLToPath(new URL('../proofs/verifiers/claim-verifier-compilation-worker.mjs',import.meta.url)), output: 'claim-verifier-compilation' },
  'native-claim': { entry: fileURLToPath(new URL('../claims/lifecycle/run-native-claim-constraints.mjs',import.meta.url)), worker: fileURLToPath(new URL('../claims/lifecycle/native-claim-constraints-worker.mjs',import.meta.url)), output: 'native-claim-constraints' },
  'evm-deposit': { entry: fileURLToPath(new URL('../proofs/deposits/run-evm-deposit-constraints.mjs',import.meta.url)), worker: fileURLToPath(new URL('../proofs/deposits/evm-deposit-constraints-worker.mjs',import.meta.url)), output: 'evm-deposit-constraints' },
  envelope: { entry: fileURLToPath(new URL('../proofs/envelopes/run-envelope-constraints.mjs',import.meta.url)), worker: fileURLToPath(new URL('../proofs/envelopes/envelope-constraints-worker.mjs',import.meta.url)), output: 'envelope-constraints' },
  native: { entry: fileURLToPath(new URL('../proofs/native/run-native-constraints.mjs',import.meta.url)), worker: fileURLToPath(new URL('../proofs/native/native-constraints-worker.mjs',import.meta.url)), output: 'native-constraints' },
  // completion has no retained source entry/worker in this workspace.
  verification: { entry: fileURLToPath(new URL('../proofs/verifiers/run-pinned-verification.mjs',import.meta.url)), worker: fileURLToPath(new URL('../proofs/verifiers/pinned-verification-worker.mjs',import.meta.url)), output: 'pinned-verification' },
  verifiers: { entry: fileURLToPath(new URL('../proofs/verifiers/run-verifier-compilation.mjs',import.meta.url)), worker: fileURLToPath(new URL('../proofs/verifiers/verifier-compilation-worker.mjs',import.meta.url)), output: 'verifier-compilation' },
});
export function integrationTask(name) {
  assert.ok(typeof name === 'string' && Object.hasOwn(tasks, name), 'ENVELOPE_FIXED_TASK');
  return Object.freeze(tasks[name]);
}
