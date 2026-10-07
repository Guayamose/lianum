/** Fixed deployment-only original-supervisor entry. No options. */
import {inspectWrappedInstallationSourcesV2} from './wrapped-installation-source-inspector-v2.mjs';
inspectWrappedInstallationSourcesV2();
const {runWrappedDeploymentOnlySupervisorV1}=await import('./native-flow-supervisor.mjs');
inspectWrappedInstallationSourcesV2();
await runWrappedDeploymentOnlySupervisorV1();
