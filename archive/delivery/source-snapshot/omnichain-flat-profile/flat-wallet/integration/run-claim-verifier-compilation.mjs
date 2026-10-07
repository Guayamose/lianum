/** Compile only the two newly generated claim verifier sources. */
import { runBoundedIntegrationTask } from './bounded-integration-task.mjs';
await runBoundedIntegrationTask('claim-verifiers');
