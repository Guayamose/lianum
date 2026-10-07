/** Fixed original entry, with independent pre/post-import source binding. */
import { inspectWrappedInstallationSourcesV2 } from './wrapped-installation-source-inspector-v2.mjs';
inspectWrappedInstallationSourcesV2();
const { runWrappedWalletFixedPreflightV1 } = await import('./wrapped-wallet-fixed-driver-v1.mjs');
inspectWrappedInstallationSourcesV2();
await runWrappedWalletFixedPreflightV1();
