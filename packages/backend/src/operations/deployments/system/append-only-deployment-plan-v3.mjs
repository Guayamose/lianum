/** Fixed V3 minimum-deposit proposal; no authority or chain observation. */
import {createPinnedAppendOnlyDeploymentPlanner} from './append-only-deployment-plan-kernel.mjs';
import {FLAT_MINIMUM_BUILD_PIN} from './append-only-build-v3.mjs';
export {FLAT_MINIMUM_BUILD_PIN,FLAT_MINIMUM_PROFILE} from './append-only-build-v3.mjs';
export const {deriveAppendOnlyLibraryPlans:deriveMinimumDepositLibraryPlans,buildAppendOnlyDeploymentPlan:buildMinimumDepositDeploymentPlan,buildAppendOnlySuccessorPlan:buildMinimumDepositSuccessorPlan}=createPinnedAppendOnlyDeploymentPlanner(FLAT_MINIMUM_BUILD_PIN,{minimumDeposits:true});
