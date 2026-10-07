/** Fixed local-fake-funds account recovery. No caller command, endpoint or limit. */
import { runAccountRecoverySupervisor } from '../../native/native-flow-supervisor.mjs';
await runAccountRecoverySupervisor();
