/** Actual pinned consumer/verifier/library code and three CREATE transactions
 * on an original owned loopback EVM. No note proof, financial credit, native
 * effect, public finality or capability reconstructed from DTO is asserted. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {mkdtemp,chmod,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {generateKeyPairSync,randomBytes} from 'node:crypto';
import {createLocalEvm} from '@lianum/engine/execution/local/local-evm';
import {deployOriginalFundedPagedGraphWalletV3,appendOriginalFundedPagedGraphWalletV3,readOriginalFundedPagedGraphDeploymentV3,assertOriginalFundedPagedGraphWalletV3} from '../../../src/operations/local/funded-graph-paged-deployment-v3.mjs';
import {createOriginalPagedDepositCatalogueV1,readOriginalPagedDepositCapacityV1} from '../../../src/operations/local/paged-deposit-catalogue-v1.mjs';
import {createOriginalPoolCreationQuotaV1} from '../../../src/operations/deployments/quota/pool-creation-quota-v1.mjs';
const fresh=()=>randomBytes(32).toString('hex'),hex=v=>'0x'+v;
test('actual Paged successor deploys only three original contracts with explicit minimum and retains old routes',{timeout:180000},async()=>{
 const selection=JSON.parse(await readFile(new URL('../../../../../scripts/development/active-paged-generation.json',import.meta.url),'utf8')),keys=Array.from({length:4},()=>{const {publicKey}=generateKeyPairSync('ec',{namedCurve:'secp256k1'}),jwk=publicKey.export({format:'jwk'});return {x:Buffer.from(jwk.x,'base64url').toString('hex'),y:Buffer.from(jwk.y,'base64url').toString('hex')};}),config={manifestSHA256:selection.manifestSHA256,consumerSHA256:selection.consumerSHA256,deploymentDomain:hex(fresh()),policy:hex(fresh()),registryEpoch:'1',rulesRoot:hex(fresh()),attesterKeys:keys,minimumDepositAtomic:'100'},runtime=await createLocalEvm(),directory=await mkdtemp(join(tmpdir(),'lianum-paged-continuity-'));await chmod(directory,0o700);let quota;
 try{
  const missing={...config};delete missing.minimumDepositAtomic;await assert.rejects(deployOriginalFundedPagedGraphWalletV3(runtime,missing),/PAGED_DEPLOY_FIELDS/);assert.equal(runtime.transactions.length,0);
  const old=await deployOriginalFundedPagedGraphWalletV3(runtime,config),original=readOriginalFundedPagedGraphDeploymentV3(runtime,old),before=runtime.transactions.length;quota=await createOriginalPoolCreationQuotaV1(runtime,{path:join(directory,'operator.vault'),password:fresh(),operatorId:fresh(),policy:{maximumOperatorCreations:1,maximumPrincipalCreations:1}});const principal=fresh(),next=await appendOriginalFundedPagedGraphWalletV3(runtime,old,{...config,deploymentDomain:hex(fresh()),minimumDepositAtomic:'101'},quota,principal);
  assert.equal(runtime.transactions.length-before,3);assert.notEqual(next.pool,old.pool);assert.notEqual(next.state,old.state);assert.notEqual(next.native,old.native);assert.equal(next.minimumDepositAtomic,'101');assert.equal((await quota.status()).charged,1);assert.equal((await quota.status()).pending,null);assertOriginalFundedPagedGraphWalletV3(runtime,old);assertOriginalFundedPagedGraphWalletV3(runtime,next);
  const successor=readOriginalFundedPagedGraphDeploymentV3(runtime,next);assert.deepEqual(successor.ownPins,original.ownPins);assert.deepEqual(successor.originalPins,original.originalPins);assert.equal(await original.call('pool','minimumDepositAmount()'),'0x'+(100n).toString(16).padStart(64,'0'));assert.equal(await successor.call('pool','minimumDepositAmount()'),'0x'+(101n).toString(16).padStart(64,'0'));assert.equal((await readOriginalPagedDepositCapacityV1(runtime,old)).freeNoteSlots,'256');assert.equal((await readOriginalPagedDepositCapacityV1(runtime,next)).freeNoteSlots,'256');
  const catalogue=createOriginalPagedDepositCatalogueV1(runtime,next,quota,principal);assert.equal((await catalogue.select({amountAtomic:'101',purpose:'GRAPH_SOURCE'})).system,next);await assert.rejects(catalogue.rotate({amountAtomic:'101',purpose:'GRAPH_SOURCE'},{...config,deploymentDomain:hex(fresh()),minimumDepositAtomic:'101'}),/PAGED_CATALOGUE_SPACE_ALREADY_AVAILABLE/);const nonce=await runtime.nonce(runtime.accounts[0],'pending');await assert.rejects(appendOriginalFundedPagedGraphWalletV3(runtime,next,{...config,deploymentDomain:hex(fresh()),minimumDepositAtomic:'101'},quota,principal),error=>error.cause?.message==='POOL_CREATION_OPERATOR_LIMIT');assert.equal(await runtime.nonce(runtime.accounts[0],'pending'),nonce);assert.equal(runtime.transactions.length,before+3);
 }finally{await quota?.close();await runtime.close();await rm(directory,{recursive:true,force:true});}
});
