/** Fresh public proof-probe output only; paths do not grant authority. */
import assert from 'node:assert/strict';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {projectRoot,resourcePath} from '@lianum/environment';
import {verifyToolchain} from '@lianum/components/resources/wallet-resources';
import {loadOfficialProofLibrariesV1} from '../../../../packages/proofs/src/toolchain/official-proof-libraries.mjs';
export function currentProbePathsV1(runId){
 assert.equal(typeof runId,'string','M7_NEW_RUN_REQUIRED');
 assert.match(runId,/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/,'M7_NEW_RUN_UUID');
 const source=fileURLToPath(new URL('../',import.meta.url));
 const run=join(projectRoot,'.local/pc5-retained-current-v1',runId);
 const compiled=join(run,'compiled'),crs=join(run,'crs');
 mkdirSync(compiled,{recursive:true,mode:0o700});mkdirSync(crs,{recursive:true,mode:0o700});
 const sha=b=>createHash('sha256').update(b).digest('hex');
 const input=resourcePath('engine','experiments/private-core-proof/native-notes/.local/crs/2097152');
 const full=readFileSync(join(input,'bn254_g1_compressed.dat'));
 assert.equal(full.length,67108864,'M7_CRS_G1_SIZE');
 assert.equal(sha(full),'3e1ac09652ee9df779a4955fb8f7050620c7b1ee7f18566581bd00326b06be37','M7_CRS_G1_PIN');
 const g2=readFileSync(join(input,'bn254_g2.dat'));
 assert.equal(g2.length,128,'M7_CRS_G2_SIZE');
 assert.equal(sha(g2),'01797bfc4de5a96f0e516a9ea4537d18786dc30cb991aca4274c95822b69c32f','M7_CRS_G2_PIN');
 for(const points of [131072,2097152]){
  const dir=join(crs,String(points));mkdirSync(dir,{recursive:true,mode:0o700});
  const g1=full.subarray(0,points*32),expected=points===131072?'fad8203ae1fd103658d4bb33b2b4cf126a28352b5de4684737cff23cc15fb94b':'3e1ac09652ee9df779a4955fb8f7050620c7b1ee7f18566581bd00326b06be37';
  assert.equal(sha(g1),expected,'M7_CRS_PREFIX_PIN');
  const records=[];
  for(const [file,bytes]of [['bn254_g1_compressed.dat',g1],['bn254_g2.dat',g2]]){
   writeFileSync(join(dir,file),bytes,{mode:0o600});records.push({file,bytes:bytes.length,sha256:sha(bytes)});
  }
  writeFileSync(join(dir,'provenance.json'),JSON.stringify({classification:'FRESH_PIN_VERIFIED_PUBLIC_CRS_PREFIX_NOT_NETWORK_DOWNLOAD',points,records})+'\n',{mode:0o600});
 }
 const toolchain=verifyToolchain();
 return{source,run,compiled,crs,toolchain,evidence:run,child:join(run,'m7-proof-probe'),outer:join(run,'m7-recursive-probe'),recursiveInput:join(run,'recursive-input.json')};
}
export async function currentProofLibrariesV1(){verifyToolchain();return loadOfficialProofLibrariesV1();}
export async function currentNoirCompilerV1(browser=false){
 verifyToolchain();
 return import(pathToFileURL(resourcePath('engine','experiments/private-core-proof/node_modules/@noir-lang/noir_wasm/dist/'+(browser?'web/main.mjs':'node/main.js'))).href);
}
