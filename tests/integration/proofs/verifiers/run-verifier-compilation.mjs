/** One bounded compilation of the actual generated verifier sources. */
import { runBoundedIntegrationTask } from '../../runners/bounded-integration-task.mjs';
await runBoundedIntegrationTask('verifiers');
