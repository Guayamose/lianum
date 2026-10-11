/** Current execution evidence for fixed integration flows. */
import assert from 'node:assert/strict';
import {relative,sep} from 'node:path';
import {projectRoot} from '@lianum/environment';
import {captureAdoptedSourceEvidence,assertCapturedCurrentSources} from '@lianum/proofs/verification/sources/adopted-source-evidence';
import {integrationTask} from './task-catalog.mjs';
import {applicationFlowEntrypoints} from './application-flow-entrypoints.mjs';
const source=path=>relative(projectRoot,path).split(sep).join('/');
export function integrationSourcePins(suite='envelope'){
 const task=integrationTask(suite),base=captureAdoptedSourceEvidence();
 assertCapturedCurrentSources(base,[source(task.entry),source(task.worker)]);
 return {...base,suite};
}
function fixedFlowSourcePins(){
 const base=captureAdoptedSourceEvidence();
 assertCapturedCurrentSources(base,Object.values(applicationFlowEntrypoints).flatMap(row=>[source(row.entry),source(row.worker)]));
 return base;
}
export function nativeFlowSourcePins(){assert.equal(arguments.length,0,'NATIVE_SOURCE_PINS_NO_OPTIONS');return {...fixedFlowSourcePins(),format:'FLAT_WALLET_NATIVE_FLOW_SOURCE_CLOSURE_V1'};}
export function accountRecoverySourcePins(){assert.equal(arguments.length,0,'ACCOUNT_RECOVERY_SOURCE_PINS_NO_OPTIONS');return {...fixedFlowSourcePins(),format:'FLAT_WALLET_ACCOUNT_RECOVERY_SOURCE_CLOSURE_V1'};}
export function assetPortfolioSourcePins(){assert.equal(arguments.length,0,'ASSET_PORTFOLIO_SOURCE_PINS_NO_OPTIONS');return {...fixedFlowSourcePins(),format:'FLAT_WALLET_ASSET_PORTFOLIO_SOURCE_CLOSURE_V1'};}
export function evmVaultSourcePins(){assert.equal(arguments.length,0,'EVM_VAULT_SOURCE_PINS_NO_OPTIONS');return {...fixedFlowSourcePins(),format:'FLAT_WALLET_EVM_VAULT_SOURCE_CLOSURE_V1'};}
