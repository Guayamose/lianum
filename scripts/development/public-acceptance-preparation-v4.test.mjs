/** Actual SDK/Node software custody preparation only. No TLS request,
 * original backend, proof, financial permission or Android biometric claim. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import * as P from '../../packages/mobile-protocol/src/device-paged-owner-v3.mjs';
import {initializeOriginalPublicThreeNetworkHostOwnerV4,prepareOriginalPublicThreeNetworkAcceptanceV4,prepareOriginalPublicPartialStartAcceptanceV5,closeOriginalPublicThreeNetworkAcceptanceV4} from './accept-original-public-three-network-v4.mjs';
import {prepareOriginalPublicPartialRecoveryV4,runOriginalPublicPartialRecoveryV4,closeOriginalPublicPartialRecoveryV4} from './accept-original-public-partial-recovery-v4.mjs';

test('finite public consumers accept explicit wait bound while refusing extra fields, forged preparations and wrong owner; actual SDK custody remains unchanged',{timeout:30000},async()=>{
 const directory=await mkdtemp(join(tmpdir(),'lianum-public-preparation-'));let owner,full,partial,partialStart,shortPartial;
 try{
  owner=await initializeOriginalPublicThreeNetworkHostOwnerV4({directory});
  const h=v=>createHash('sha256').update(v).digest('hex');
  const descriptor=P.normalizeDevicePagedDescriptorV3({profile:P.DEVICE_PAGED_OWNER_V3,graphProfile:P.DEVICE_PAGED_GRAPH_V3,sparseEncoding:P.DEVICE_PAGED_SPARSE_V3,origin:'https://localhost:23456',pairingId:'host-public-preparation',devicePublicKey:owner.devicePublicKey,deadlineMs:Date.now()+3600000,chainDeadlineSeconds:String(Math.floor(Date.now()/1000)+3600),chainId:'11155111',genesis:'25a5cc106eea7138acab33231d7160d69cb777ee0c2c553fcddf5138993e6dd9',pool:'0x'+'1'.repeat(40),state:'0x'+'2'.repeat(40),native:'0x'+'3'.repeat(40),math:'0x'+'4'.repeat(40),...Object.fromEntries(['scope','policy','assetIdentity','domain','hubDomain','registryCommitment','manifestSHA256','consumerSHA256','poolCodeHash','stateCodeHash','nativeCodeHash','mathCodeHash'].map(k=>[k,h(k)])),minimumDepositAtomic:'100',securityGeneration:'EXACT_PAYOUT_SET_V4'});
  // Bounded certificate DATA is not a TLS handshake or a chain deployment.
  const connection={format:'DEVICE_PAGED_PRIVATE_GRAPH_CONNECTION_V3',descriptor,transport:{type:'ANDROID_PINNED_TLS_V1',certificatePEM:'-----BEGIN CERTIFICATE-----\nHOST_DATA_NOT_A_VALID_TLS_CERTIFICATE\n-----END CERTIFICATE-----',certificateSHA256:h('HOST-not-certificate')}};
  const recipients={'ethereum-sepolia':'0x1696ffc5a526f1187fa9e755f713b2f777c2a00e','bitcoin-testnet':'tb1qhqmpqmfgtvuqyl4ptacqgmt4xjpfmkjfdp3lcf','solana-devnet':'4PWy56g5AKKTxiNSvD2AVdvzM9NNJUPdxDE9Pk3gBJ8d'};
  const path=join(directory,'host-custody.aead.json'),before=await readFile(path),approvals=owner.host.metadata().hostApprovals;
  full=await prepareOriginalPublicThreeNetworkAcceptanceV4(owner.host,{connection,recipients,maximumWaitMs:60000});assert.equal(full.review.maximumWaitMs,60000);assert.equal(full.review.financialExecutionStarted,false);
  await assert.rejects(()=>prepareOriginalPublicThreeNetworkAcceptanceV4(owner.host,{connection,recipients,maximumWaitMs:0}));
  await assert.rejects(()=>prepareOriginalPublicThreeNetworkAcceptanceV4(owner.host,{connection,recipients,maximumWaitMs:60000,privateKey:'forbidden'}),/MOBILE_PAGED_OWNER_BINDING/);
  const partialInput={connection,recipients:Object.fromEntries(Object.entries(recipients).filter(([network])=>network!=='solana-devnet')),maximumWaitMs:60000};
  partialStart=await prepareOriginalPublicPartialStartAcceptanceV5(owner.host,partialInput);assert.equal(partialStart.review.reservationMinutes,'20');assert.equal(partialStart.review.executionMinutes,'90');
  shortPartial=await prepareOriginalPublicPartialStartAcceptanceV5(owner.host,{...partialInput,reservationMinutes:'2',executionMinutes:'5'});assert.equal(shortPartial.review.reservationMinutes,'2');assert.equal(shortPartial.review.executionMinutes,'5');assert.equal(shortPartial.review.financialExecutionStarted,false);
  for(const duration of [{reservationMinutes:'0',executionMinutes:'5'},{reservationMinutes:'21',executionMinutes:'30'},{reservationMinutes:'2',executionMinutes:'4'},{reservationMinutes:'2',executionMinutes:'91'},{reservationMinutes:'5',executionMinutes:'5'},{reservationMinutes:2,executionMinutes:'5'},{reservationMinutes:'02',executionMinutes:'5'},{executionMinutes:'5'},{reservationMinutes:'2',executionMinutes:'5',overrideClock:Date.now()}])await assert.rejects(()=>prepareOriginalPublicPartialStartAcceptanceV5(owner.host,{...partialInput,...duration}));
  const recovery={connection,graphId:'original-public-graph',authorizationRoot:h('auth'),budgetWei:'600000000000000',changeWei:'400000000000000',recoveryRecipient:recipients['ethereum-sepolia'],maximumWaitMs:60000};
  partial=await prepareOriginalPublicPartialRecoveryV4(owner.host,recovery);assert.equal(partial.review.financialActionStarted,false);assert.equal(partial.review.providerPayout,'NONE');
  await assert.rejects(()=>prepareOriginalPublicPartialRecoveryV4(owner.host,{...recovery,connection:{...connection,descriptor:{...descriptor,devicePublicKey:'04'+'1'.repeat(128)}}}));
  await assert.rejects(()=>prepareOriginalPublicPartialRecoveryV4(owner.host,{...recovery,maximumWaitMs:6*3600000+1}));
  await assert.rejects(()=>prepareOriginalPublicPartialRecoveryV4(owner.host,{...recovery,overrideClock:Date.now()}),/MOBILE_PAGED_OWNER_BINDING/);
  await assert.rejects(()=>runOriginalPublicPartialRecoveryV4(Object.freeze({})),/PUBLIC_PARTIAL_ORIGINAL_PREPARATION/);
  assert.deepEqual(await readFile(path),before,'preparation never changes the protected SDK custody');assert.equal(owner.host.metadata().hostApprovals,approvals,'preparation never requests software biometric approval');
 }finally{if(shortPartial)await closeOriginalPublicThreeNetworkAcceptanceV4(shortPartial.token);if(partialStart)await closeOriginalPublicThreeNetworkAcceptanceV4(partialStart.token);if(partial)closeOriginalPublicPartialRecoveryV4(partial.token);if(full)await closeOriginalPublicThreeNetworkAcceptanceV4(full.token);else await owner?.host.close();await rm(directory,{recursive:true,force:true});}
});
