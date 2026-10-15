/** Operator-only readonly high-water before the first Source. Existing
 * protected keys/history are read, never initialized. The returned DATA do
 * not grant financial reopening; the original observer revalidates the CAS. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {lstat} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {openPublicPagedServerKeysV1,readPublicPagedServerAccountsV1,closePublicPagedServerKeysV1,readOriginalPublicPagedSourceFinancialHistoryV5,readOriginalPublicPagedCapturedFinancialStateV5} from '../../chains/public-testnet/key-store-v1.mjs';
import {createOriginalPagedSepoliaRpcV4} from '../../chains/public-testnet/sepolia-receiver-rpc-v4.mjs';
import {readPagedSourcePrivateJSONV4,assertPagedSourceReadDirectoryV4} from './paged-source-read-files-v4.mjs';
import * as P from '@lianum/mobile-protocol/device/paged-owner-v3';
import {sourceFinancialPolicySHA256DataV5} from '../../chains/public-testnet/sepolia-source-financial-epoch-data-v5.mjs';
const sha=value=>createHash('sha256').update(value).digest('hex'),freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
async function absent(path,error){try{await lstat(path);assert.fail(error);}catch(failure){if(failure.code!=='ENOENT')throw failure;}}
export async function readOriginalPagedPublicPrebirthFinancialStateV5(raw){
 assert.equal(arguments.length,1);P.pagedOwnerExactV3(raw,['operatorDirectory','nativeDirectory']);for(const directory of Object.values(raw)){assert.equal(resolve(directory),directory);await assertPagedSourceReadDirectoryV4(directory);}
 const path=join(raw.operatorDirectory,'operator.json'),before=await readPagedSourcePrivateJSONV4(path,65536),config=before.data;assert.equal(config.nativeDirectory,raw.nativeDirectory,'PAGED_PREBIRTH_NATIVE_LOCATION');assert.equal(resolve(config.journal.path),config.journal.path);assert.equal(resolve(config.supervisorDirectory),config.supervisorDirectory);
 await absent(config.journal.path,'PAGED_PREBIRTH_SOURCE_ALREADY_ISSUED');await absent(join(config.supervisorDirectory,'supervisor.vault'),'PAGED_PREBIRTH_SUPERVISOR_ALREADY_ISSUED');
 let keys,created;try{
  await assertPagedSourceReadDirectoryV4(join(raw.nativeDirectory,'keys'));keys=await openPublicPagedServerKeysV1(join(raw.nativeDirectory,'keys'));const original=readPublicPagedServerAccountsV1(keys),ethereum=config.networkConfiguration.networks.filter(row=>row.id==='ethereum-sepolia');assert.equal(ethereum.length,1,'PAGED_PREBIRTH_ETHEREUM_CONFIGURATION');
  created=await createOriginalPagedSepoliaRpcV4({endpoint:ethereum[0].endpoint,keysetId:original.keysetId,account:original.accounts[0]});const runtime=created.runtime,base={profile:'ORIGINAL_PAGED_SEPOLIA_OPERATOR_SPONSOR_V4',keysetId:original.keysetId,account:original.accounts[0].address,...config.sourcePolicy};
  const sourcePath=join(raw.nativeDirectory,'source-operations/native-wallet.json');let sourceExists;try{await lstat(sourcePath);sourceExists=true;}catch(error){if(error.code!=='ENOENT')throw error;sourceExists=false;}
  let financialState;
  if(sourceExists)financialState=await readOriginalPublicPagedCapturedFinancialStateV5(keys,runtime,base);
  else{
   await absent(join(raw.nativeDirectory,'source-operations/native-wallet.lock'),'PAGED_PREBIRTH_SOURCE_WRITER_ACTIVE');const history=await readOriginalPublicPagedSourceFinancialHistoryV5(keys,runtime,base),last=history.history.at(-1)?.epoch,empty=sha(JSON.stringify([])),identity=sha('ORIGINAL_PAGED_SEPOLIA_OPERATOR_SPONSOR_V4\0'+original.keysetId+'\0'+sha(JSON.stringify(history.basePolicy)));
   if(last){assert.equal(last.checkpoint.identity,identity,'PAGED_PREBIRTH_SOURCE_JOURNAL_MISSING');assert.equal(last.checkpoint.policySHA256,sourceFinancialPolicySHA256DataV5(history.history.at(-2)?.epoch.policy??history.basePolicy),'PAGED_PREBIRTH_SOURCE_JOURNAL_MISSING');assert.equal(last.checkpoint.revision,0,'PAGED_PREBIRTH_SOURCE_JOURNAL_MISSING');assert.equal(last.checkpoint.dataSHA256,empty,'PAGED_PREBIRTH_SOURCE_JOURNAL_MISSING');assert.equal(last.reserved.feeAtomic,'0','PAGED_PREBIRTH_SOURCE_JOURNAL_MISSING');assert.equal(last.reserved.valueAtomic,'0','PAGED_PREBIRTH_SOURCE_JOURNAL_MISSING');}
   const checkpoint={profile:'ORIGINAL_PAGED_SEPOLIA_SOURCE_CHECKPOINT_V4',keysetId:original.keysetId,policySHA256:sha(JSON.stringify(history.effectivePolicy)),identity,revision:0,dataSHA256:empty,...(history.history.length?{financialEpoch:history.checkpoint}:{})};
   financialState=freeze({profile:'ORIGINAL_PAGED_SEPOLIA_FINANCIAL_STATE_V5',basePolicy:history.basePolicy,effectivePolicy:history.effectivePolicy,basePolicySHA256:sha(JSON.stringify(history.basePolicy)),effectivePolicySHA256:checkpoint.policySHA256,limits:history.limits,epoch:last??null,history:history.history,checkpoint,reserved:{feeAtomic:'0',valueAtomic:'0',successorPools:'0'},reviewEligible:true,financialSigningEnabled:false});
   assert.deepEqual(await readOriginalPublicPagedSourceFinancialHistoryV5(keys,runtime,base),history,'PAGED_PREBIRTH_EPOCH_HIGHWATER_CHANGED');await absent(sourcePath,'PAGED_PREBIRTH_SOURCE_HIGHWATER_CHANGED');await absent(join(raw.nativeDirectory,'source-operations/native-wallet.lock'),'PAGED_PREBIRTH_SOURCE_WRITER_ACTIVE');
  }
  assert.deepEqual(await readPagedSourcePrivateJSONV4(path,65536),before,'PAGED_PREBIRTH_CONFIGURATION_CHANGED');await absent(config.journal.path,'PAGED_PREBIRTH_SOURCE_ALREADY_ISSUED');await absent(join(config.supervisorDirectory,'supervisor.vault'),'PAGED_PREBIRTH_SUPERVISOR_ALREADY_ISSUED');
  return freeze({profile:'ORIGINAL_PAGED_PUBLIC_PREBIRTH_FINANCIAL_STATE_V5',operatorConfigurationSHA256:before.sha256,financialState,descriptorIssued:false,financialSourcePermissionIssued:false,transactionsBroadcast:0});
 }finally{if(created){created.lifecycle.acknowledge();await created.runtime.close();}closePublicPagedServerKeysV1(keys);config.journal.password=null;}
}
