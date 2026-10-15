/** Actual SDK/Node software custody preparation only. No TLS request,
 * original backend, proof, financial permission or Android biometric claim. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import * as P from '../../packages/mobile-protocol/src/device-paged-owner-v3.mjs';
import {initializeOriginalPublicThreeNetworkHostOwnerV4,prepareOriginalPublicThreeNetworkAcceptanceV4,closeOriginalPublicThreeNetworkAcceptanceV4,runOriginalPublicThreeNetworkAcceptanceV4,prepareOriginalPublicThreeNetworkUniswapAcceptanceV5} from './accept-original-public-three-network-v4.mjs';

test('public three-network SDK consumer accepts explicit wait bound and refuses changed owner, extra fields and forged preparation without changing custody',{timeout:30000},async()=>{
 const directory=await mkdtemp(join(tmpdir(),'lianum-public-preparation-'));let owner,full,mixed;
 try{
  owner=await initializeOriginalPublicThreeNetworkHostOwnerV4({directory});
  const h=v=>createHash('sha256').update(v).digest('hex');
  const descriptor=P.normalizeDevicePagedDescriptorV3({profile:P.DEVICE_PAGED_OWNER_V3,graphProfile:P.DEVICE_PAGED_GRAPH_V3,sparseEncoding:P.DEVICE_PAGED_SPARSE_V3,origin:'https://localhost:23456',pairingId:'host-public-preparation',devicePublicKey:owner.devicePublicKey,deadlineMs:Date.now()+3600000,chainDeadlineSeconds:String(Math.floor(Date.now()/1000)+3600),chainId:'11155111',genesis:'25a5cc106eea7138acab33231d7160d69cb777ee0c2c553fcddf5138993e6dd9',pool:'0x'+'1'.repeat(40),state:'0x'+'2'.repeat(40),native:'0x'+'3'.repeat(40),math:'0x'+'4'.repeat(40),...Object.fromEntries(['scope','policy','assetIdentity','domain','hubDomain','registryCommitment','manifestSHA256','consumerSHA256','poolCodeHash','stateCodeHash','nativeCodeHash','mathCodeHash'].map(k=>[k,h(k)])),minimumDepositAtomic:'100',securityGeneration:'EXACT_PAYOUT_SET_V4'});
  // Bounded certificate DATA is not a TLS handshake or a chain deployment.
  const connection={format:'DEVICE_PAGED_PRIVATE_GRAPH_CONNECTION_V3',descriptor,transport:{type:'ANDROID_PINNED_TLS_V1',certificatePEM:'-----BEGIN CERTIFICATE-----\nHOST_DATA_NOT_A_VALID_TLS_CERTIFICATE\n-----END CERTIFICATE-----',certificateSHA256:h('HOST-not-certificate')}};
  const recipients={'ethereum-sepolia':'0x1696ffc5a526f1187fa9e755f713b2f777c2a00e','bitcoin-testnet':'tb1qhqmpqmfgtvuqyl4ptacqgmt4xjpfmkjfdp3lcf','solana-devnet':'4PWy56g5AKKTxiNSvD2AVdvzM9NNJUPdxDE9Pk3gBJ8d'};
  const path=join(directory,'host-custody.aead.json'),before=await readFile(path),approvals=owner.host.metadata().hostApprovals;
  full=await prepareOriginalPublicThreeNetworkAcceptanceV4(owner.host,{connection,recipients,maximumWaitMs:60000});assert.equal(full.review.maximumWaitMs,60000);assert.equal(full.review.executionMinutes,'240');assert.equal(full.review.financialExecutionStarted,false);
  await assert.rejects(()=>prepareOriginalPublicThreeNetworkAcceptanceV4(owner.host,{connection,recipients,maximumWaitMs:0}));
  await assert.rejects(()=>prepareOriginalPublicThreeNetworkAcceptanceV4(owner.host,{connection,recipients,maximumWaitMs:60000,privateKey:'forbidden'}),/MOBILE_PAGED_OWNER_BINDING/);
  await assert.rejects(()=>prepareOriginalPublicThreeNetworkAcceptanceV4(owner.host,{connection:{...connection,descriptor:{...descriptor,devicePublicKey:'04'+'1'.repeat(128)}},recipients,maximumWaitMs:60000}));
  await assert.rejects(()=>runOriginalPublicThreeNetworkAcceptanceV4(Object.freeze({})),/PUBLIC_ORIGINAL_ACCEPTANCE_PREPARATION/);
  const uniswap={maximumInput:'182926400599',outputAmount:'1000000',recipient:'77'.repeat(20)},backup={directory:join(directory,'backups'),passphrase:'HOST-display-only-copy-secret'};
  mixed=await prepareOriginalPublicThreeNetworkUniswapAcceptanceV5(owner.host,{connection,recipients,uniswap,backup,maximumWaitMs:60000});assert.equal(mixed.review.steps,4);assert.equal(mixed.review.graphBudgetWei,'1200000000000000');assert.equal(mixed.review.depositWei,'1300000000000000');assert.equal(mixed.review.changeWei,'100000000000000');assert.deepEqual(mixed.review.uniswap,uniswap);assert.equal(mixed.review.outputSpendAuthorized,false);assert.ok(!JSON.stringify(mixed.review).includes(backup.passphrase),'review never contains the custody-copy secret');
  for(const changes of [{uniswap:{...uniswap,outputAmount:'100'}},{uniswap:{...uniswap,recipient:'0'.repeat(40)}},{backup:{...backup,directory:'relative'}},{backup:{...backup,passphrase:'short'}},{uniswap:{...uniswap,privateKey:'forbidden'}}])await assert.rejects(()=>prepareOriginalPublicThreeNetworkUniswapAcceptanceV5(owner.host,{connection,recipients,uniswap,backup,...changes}));
  await assert.rejects(()=>runOriginalPublicThreeNetworkAcceptanceV4({...mixed.token}),/PUBLIC_ORIGINAL_ACCEPTANCE_PREPARATION/);
  assert.deepEqual(await readFile(path),before,'preparation never changes the protected SDK custody');assert.equal(owner.host.metadata().hostApprovals,approvals,'preparation never requests software biometric approval');
 }finally{if(mixed)await closeOriginalPublicThreeNetworkAcceptanceV4(mixed.token);if(full)await closeOriginalPublicThreeNetworkAcceptanceV4(full.token);else await owner?.host.close();await rm(directory,{recursive:true,force:true});}
});
