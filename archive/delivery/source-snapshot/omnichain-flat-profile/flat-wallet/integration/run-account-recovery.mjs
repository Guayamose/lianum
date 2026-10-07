/** Fixed local-fake-funds account recovery. No caller command, endpoint or limit. */
import { runAccountRecoverySupervisor } from './native-flow-supervisor.mjs';
await runAccountRecoverySupervisor();
