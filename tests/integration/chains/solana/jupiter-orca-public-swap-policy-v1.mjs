/** Genuine public bank/swap only. This policy grants no note/claim authority. */
import assert from 'node:assert/strict';
import {join} from 'node:path';
import {ROOT} from '@lianum/proofs/catalog';
import {regular,hash} from '@lianum/proofs/tooling/tooling';
import {solanaCandidateBoundedLedgerCompatibilityPin} from '../../../../packages/backend/src/chains/solana/runtime/owned-solana-runtime.mjs';
import {validateJupiterOrcaSwapObservationV1} from '../../../../packages/backend/src/chains/solana/observations/jupiter-orca-swap-observation-v1.mjs';
import {jupiterPublicBankGenesisV1} from '../../../../packages/backend/src/chains/solana/runtime/jupiter-orca-bank-state-v1.mjs';
import {JUPITER_OFFICIAL_COMMIT_V1,loadJupiterOfficialMaterialV1} from '../../../../packages/backend/src/operations/deployments/defi/jupiter-official-material-v1.mjs';
export const JUPITER_SWAP_RESULT_V1='LIANUM_JUPITER_ORCA_PUBLIC_SWAP_RESULT_V1';
export const JUPITER_SWAP_PROFILE_V1='JUPITER_ORCA_PUBLIC_SWAP_V1';
export function jupiterOrcaSwapProcessFailureV1(rows){
 return rows.some(row=>!['main-worker','solana-runtime'].includes(row.role)||row.proofWorker===true)?'JUPITER_SWAP_UNEXPECTED_CHILD':null;
}
export function assertJupiterSwapObservationAgreementV1(original,current){
 const {finalizedSlot:a,...left}=original,{finalizedSlot:b,...right}=current;
 assert.deepEqual(right,left,'JUPITER_SWAP_ORIGINAL_OUTCOME_CHANGED');assert.ok(BigInt(b)>=BigInt(a),'JUPITER_SWAP_FINALITY_ROLLBACK');return true;
}
export function assertJupiterOrcaPublicSwapResultV1(value){
 assert.equal(value.format,JUPITER_SWAP_RESULT_V1);assert.equal(value.profile,JUPITER_SWAP_PROFILE_V1);
 assert.equal(value.phase,'completed');assert.equal(value.success,true);assert.equal(value.sourceUnchanged,true);
 assert.deepEqual(value.proofs,[]);assert.equal(value.signatureCount,1);assert.equal(value.broadcastCount,1);
 for(const key of ['privateCreditEstablished','systemMemoClaimLaneEnabled','privateGraphAcceptance','fullWalletAcceptance','publicNetwork'])assert.equal(value[key],false);
 assert.equal(value.localOnly,true);assert.equal(value.fakeFundsOnly,true);assert.equal(value.publicSwapEstablished,true);
 assert.equal(value.cleanup.closedSolana,true);assert.deepEqual(value.cleanup.errors,[]);
 const cleanup=value.cleanup.solana;assert.equal(cleanup.ownedProcessStopped,true);assert.equal(cleanup.forced,false);
 assert.equal(cleanup.syntheticKeysAndLedgerRemoved,true);assert.equal(cleanup.retainedForRecovery,false);
 assert.match(value.runId,/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
 const directory=join(ROOT,'.local/jupiter-orca-public-swap-v1','attempt-'+value.runId),files={};
 for(const name of ['bank-before.json','bank-after.json','native-evidence.json','native-record.json','source-pins.json','signed-attempts.json','runtime-metadata.json']){
  const raw=regular(join(directory,name));assert.equal(value.files[name].bytes,raw.length);assert.equal(value.files[name].sha256,hash(raw));files[name]=JSON.parse(raw);
 }
 assert.deepEqual(files['source-pins.json'],value.sourcePins);
 const evidence=files['native-evidence.json'];evidence.beforeRows=evidence.beforeRows.map(row=>({...row,data:Buffer.from(row.data,'base64')}));
 const expectedGenesis=jupiterPublicBankGenesisV1(loadJupiterOfficialMaterialV1(),evidence.intent.payer,evidence.intent.source,evidence.intent.destination);
 assert.deepEqual(evidence.beforeRows,expectedGenesis.map(({json,...row})=>row),'JUPITER_SWAP_ORIGINAL_GENESIS_BYTES');
 const {updatedRows,...observed}=validateJupiterOrcaSwapObservationV1(evidence),record=files['native-record.json'];
 assert.equal(record.phase,'OBSERVED_FINALIZED');assert.equal(record.broadcastAttempts,1);assert.equal(record.relation,'OFFICIAL_PUBLIC_JUPITER_ORCA_SWAP_NOT_PRIVATE_CREDIT');
 assert.equal(record.signature,observed.signature);assert.equal(record.transactionSHA256,observed.transactionSHA256);assert.equal(record.messageSHA256,observed.messageSHA256);
 assert.equal(record.nativeWire,evidence.nativeWire);assert.deepEqual(record.intent,evidence.intent);assert.deepEqual(record.observation,observed);
 assert.deepEqual(files['signed-attempts.json'],[record]);assert.deepEqual(files['runtime-metadata.json'],value.native);
 assert.deepEqual(value.originalRecord,record);assert.deepEqual(value.observation,{...observed,broadcastAttempts:1});
 assertJupiterSwapObservationAgreementV1(value.observation,value.duplicateObservation);
 assertJupiterSwapObservationAgreementV1(value.duplicateObservation,value.reconciledObservation);
 const before=files['bank-before.json'],after=files['bank-after.json'];assert.deepEqual(before,value.beforeBank);assert.deepEqual(after,value.afterBank);
 assert.equal(before.genesis,evidence.genesis);assert.equal(after.genesis,evidence.genesis);assert.equal(before.accounts.length,13);assert.equal(after.accounts.length,13);
 const rows=value=>value.map(row=>[row.address,row.owner,row.executable,row.lamports,row.dataBytes,row.dataSHA256]);
 assert.deepEqual(rows(before.accounts),rows(evidence.beforeRows.map(row=>({...row,dataBytes:row.data.length}))));
 assert.deepEqual(rows(after.accounts),rows(updatedRows.map(row=>({...row,dataBytes:row.data.length}))));
 assert.ok(BigInt(after.slot)>=BigInt(observed.transactionSlot));assert.equal(before.nativeClock.loadedFromSnapshot,false);assert.equal(after.nativeClock.loadedFromSnapshot,false);
 const native=value.native;assert.equal(native.classification,'OWNED_JUPITER_ORCA_PUBLIC_BANK_V1');assert.equal(native.genesis,before.genesis);
 assert.deepEqual(native.runtimePins.validator,solanaCandidateBoundedLedgerCompatibilityPin);assert.equal(native.binding,'127.0.0.1');assert.deepEqual(native.publicEntrypoints,[]);
 assert.equal(native.freshSyntheticKeys,true);assert.equal(native.faucetUsed,false);assert.equal(native.publicMarket.commit,JUPITER_OFFICIAL_COMMIT_V1);
 assert.equal(native.publicMarket.clockSnapshotLoaded,false);assert.equal(native.publicMarket.originalClaimLaneEnabled,false);assert.equal(native.publicMarket.privateCreditEstablished,false);
 assert.equal(native.publicMarket.swapExecutionEstablished,true);assert.equal(native.publicMarket.locallyCompiledProgramEstablished,false);
 assert.ok(Number.isSafeInteger(native.processId)&&native.processId>1);assert.equal(value.solanaPID,native.processId);
 return {publicJupiterOrcaSwapEstablished:true,privateCreditEstablished:false,systemMemoClaimLaneEnabled:false,privateGraphAcceptance:false,fullWalletAcceptance:false};
}
