/** Fixed worker, with independent pre/post-import source binding. */
import {inspectWrappedInstallationSourcesV2} from './wrapped-installation-source-inspector-v2.mjs';
inspectWrappedInstallationSourcesV2();
const {runWrappedDeploymentOnlyV1}=await import('../../wallet/wrapped/flows/wrapped-wallet-fixed-driver-v1.mjs');
inspectWrappedInstallationSourcesV2();
await runWrappedDeploymentOnlyV1();
