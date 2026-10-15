/** Exercise the delivered Solidity readers/compiler without keys or networks. */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';

assert.equal(process.argv.length,3);
const root=resolve(process.argv[2]);
const manifest=JSON.parse(await readFile(join(root,'source-bundle.json'),'utf8'));
assert.ok(manifest.adoptedGeneration,'PUBLIC_DEFI_ADOPTED_CANDIDATE_REQUIRED');
const checks=[];
for(const [name,file,method,count] of [
 ['UNISWAP','sepolia-uniswap','compileFixedSepoliaUniswapDeliveryV4',1],
 ['AAVE','aave-sepolia','compileFixedAaveSepoliaAdaptersV4',2],
 ['MORPHO','morpho-v2-sepolia','compileFixedMorphoV2SepoliaAdaptersV4',2],
]){
 const module=await import(pathToFileURL(join(root,'packages/backend/src/operations/deployments/defi/'+file+'-compilation-v4.mjs')));
 const compiled=module[method]();
 assert.equal(compiled.sourceRecords.length,count);
 assert.equal(compiled.financialAuthority,false);
 assert.equal(compiled.publicDeployment,false);
 assert.equal(compiled.privateProofAcceptance,false);
 checks.push({name,contracts:count,inputSHA256:compiled.inputSHA256,outputSHA256:compiled.outputSHA256});
}
process.stdout.write(JSON.stringify({profile:'LIANUM_PUBLIC_DEFI_COURIER_COMPILERS_V6',checks,contracts:5,networkRequests:0,proofGenerated:false,transactionsBroadcast:0})+'\n');
