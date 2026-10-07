/** Fixed original entry, with independent pre/post-import source binding. */
import { inspectWrappedInstallationSourcesV2 } from './wrapped-installation-source-inspector-v2.mjs';
inspectWrappedInstallationSourcesV2();
const { runWrappedWalletFixedPreflightSupervisorV1 } = await import('./native-flow-supervisor.mjs');
inspectWrappedInstallationSourcesV2();
await runWrappedWalletFixedPreflightSupervisorV1();
