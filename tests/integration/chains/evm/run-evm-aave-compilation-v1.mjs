/** Fixed compilation-only bootstrap. No source review, native node or proof. */
import {runEvmAaveCompilationSupervisorV1} from '../../native/native-flow-supervisor.mjs';
await runEvmAaveCompilationSupervisorV1();
