/** Test the new scoped verifier boundary with an existing proof, no reproving. */
import { runBoundedIntegrationTask } from '../../runners/bounded-integration-task.mjs';
await runBoundedIntegrationTask('verification');
