/** Fixed original entry, with independent pre/post-import source binding. */
import { inspectWrappedInstallationSourcesV2 } from '../../../deployments/wrapped/wrapped-installation-source-inspector-v2.mjs';
inspectWrappedInstallationSourcesV2();
const { runWrappedWalletFixedAcceptanceV1 } = await import('./wrapped-wallet-fixed-driver-v1.mjs');
inspectWrappedInstallationSourcesV2();
await runWrappedWalletFixedAcceptanceV1();
