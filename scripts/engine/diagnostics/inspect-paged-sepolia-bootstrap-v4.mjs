/** Read-only operator preflight. It opens existing server identities and never
 * initializes keys, signs, broadcasts, funds, mines or invents a receipt. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {projectRoot} from '@lianum/environment';
import {freshKey} from '@lianum/engine/notes/private-note-encoding';
import {createOriginalPagedPublicTestnetRuntimesV1} from '../../../packages/backend/src/providers/paged-public-testnet-runtimes-v1.mjs';
import {createOriginalPagedSepoliaReceiverRuntimeV4} from '../../../packages/backend/src/chains/public-testnet/sepolia-receiver-runtime-v4.mjs';
import {preflightOriginalFundedPagedGraphSepoliaWalletV4} from '../../../packages/backend/src/chains/public-testnet/sepolia-receiver-runtime-v4.mjs';
assert.equal(process.argv.length,4);assert.equal(process.argv[2],'--directory');assert.ok(process.argv[3].startsWith('/')&&process.argv[3].length<4096);let native,receiver;
try{native=await createOriginalPagedPublicTestnetRuntimesV1({directory:process.argv[3]});receiver=await createOriginalPagedSepoliaReceiverRuntimeV4({nativeRuntime:native});const active=JSON.parse(readFileSync(join(projectRoot,'scripts/development/active-paged-generation.json'),'utf8'));
 // Deterministic operator review configuration is explicitly public DATA. The
 // final provider contributes its actual four attester keys before deployment.
 const keys=Array.from({length:4},()=>{const key=freshKey();return{x:key.x.toString('hex'),y:key.y.toString('hex')};});
 const result=await preflightOriginalFundedPagedGraphSepoliaWalletV4(receiver,{manifestSHA256:active.manifestSHA256,consumerSHA256:active.consumerSHA256,deploymentDomain:'0x'+'11'.repeat(32),policy:'0x'+'22'.repeat(32),registryEpoch:'1',rulesRoot:'0x'+'33'.repeat(32),attesterKeys:keys,minimumDepositAtomic:'1000'});process.stdout.write(JSON.stringify(result,null,2)+'\n');
}finally{await receiver?.close();await native?.close();}
