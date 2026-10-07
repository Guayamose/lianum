/** Fixed source-gated loaded facts route, isolated from all historical runs.
 * This scoped probe is not full native graph acceptance. */
import { runNativeClaimLoadedFactsSupervisor } from '../../native/native-flow-supervisor.mjs';
await runNativeClaimLoadedFactsSupervisor();
