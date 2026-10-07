/** Fixed owned local native custody acceptance. No caller-selected profile. */
import { runNativeClaimSupervisor } from '../../native/native-flow-supervisor.mjs';
await runNativeClaimSupervisor();
