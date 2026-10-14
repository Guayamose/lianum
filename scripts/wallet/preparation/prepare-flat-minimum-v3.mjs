/** Exact NEW V3 ledger build. No deployment, verifier generation or historical
 * overwrite. Repeated invocations authenticate the already emitted artifacts. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,mkdirSync,writeFileSync,existsSync,realpathSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {projectRoot} from '@lianum/environment';
import {ROOT} from '@lianum/proofs/catalog';
import {compileSoliditySources} from '@lianum/proofs/tooling/solidity-compiler';
import {FLAT_MINIMUM_BUILD_PIN,FLAT_MINIMUM_ARTIFACT_FILES,FLAT_MINIMUM_RUNTIME_BYTES} from '../../../packages/backend/src/operations/deployments/system/append-only-build-v3.mjs';
import {loadMinimumDepositLedgerArtifacts} from '../../../packages/backend/src/operations/deployments/system/append-only-deployment-artifacts-v3.mjs';
assert.equal(process.argv.length,2,'FLAT_MINIMUM_FIXED_BUILD_INVOCATION');assert.deepEqual(process.execArgv,[],'FLAT_MINIMUM_FIXED_BUILD_ARGUMENTS');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex'),directory=join(ROOT,'.local/development-flat-minimum/v3');
if(existsSync(directory)){loadMinimumDepositLedgerArtifacts();console.log(JSON.stringify({status:'VERIFIED_RETAINED_NEW_BUILD',build:FLAT_MINIMUM_BUILD_PIN.attempt,deployed:false,proofGenerated:false,financialAcceptance:false}));}
else{
 const names=['FlatHubCodec.sol','FlatVerifierSet.sol','crypto/Poseidon2.sol','crypto/Poseidon2Domains.sol','v2/FlatPoolRegistryCodecV2.sol','v2/PrivateFlatReceiptHubV2.sol','v2/PrivateFlatAssetNotePoolV3.sol'];
 const sourceMap=Object.fromEntries(names.map(name=>{const path=join(projectRoot,'contracts/wallet',name);assert.equal(realpathSync(path),path,'FLAT_MINIMUM_SOURCE_ALIAS');const content=readFileSync(path,'utf8'),sha256=sha(content);assert.equal(sha256,FLAT_MINIMUM_BUILD_PIN.sources[name][0],'FLAT_MINIMUM_REVIEWED_SOURCE');return[name,{content,sha256}];}));
 const {milliseconds,...compiled}=compileSoliditySources(sourceMap,{profile:'standard'});
 const input={language:'Solidity',sources:Object.fromEntries(Object.entries(sourceMap).map(([name,row])=>[name,{content:row.content}])),settings:compiled.settings};
 const manifest={schema:'LIANUM_FLAT_MINIMUM_BUILD_V3',buildPin:FLAT_MINIMUM_BUILD_PIN,files:Object.fromEntries(['compiled.json','standard-input.json'].map(name=>[name,FLAT_MINIMUM_ARTIFACT_FILES[name]])),runtimeBytes:FLAT_MINIMUM_RUNTIME_BYTES,constructorWords:{hub:48,pool:36},compiled:true,deployed:false,proofGenerated:false,financialAcceptance:false};
 const outputs=Object.fromEntries([['compiled.json',compiled],['standard-input.json',input],['manifest.json',manifest]].map(([name,value])=>[name,Buffer.from(JSON.stringify(value,null,2)+'\n')]));
 for(const [name,bytes]of Object.entries(outputs)){assert.equal(bytes.length,FLAT_MINIMUM_ARTIFACT_FILES[name].bytes,'FLAT_MINIMUM_BUILD_BYTES');assert.equal(sha(bytes),FLAT_MINIMUM_ARTIFACT_FILES[name].sha256,'FLAT_MINIMUM_BUILD_PIN');}
 for(const [name,row]of Object.entries(sourceMap))assert.equal(sha(readFileSync(join(projectRoot,'contracts/wallet',name))),row.sha256,'FLAT_MINIMUM_SOURCE_CHANGED');
 let ancestor=dirname(directory);while(!existsSync(ancestor))ancestor=dirname(ancestor);assert.equal(realpathSync(ancestor),ancestor,'FLAT_MINIMUM_OUTPUT_ALIAS');mkdirSync(directory,{recursive:true});
 for(const [name,bytes]of Object.entries(outputs))writeFileSync(join(directory,name),bytes,{flag:'wx',mode:0o644});
 loadMinimumDepositLedgerArtifacts();console.log(JSON.stringify({status:'COMPILED_AND_READBACK_VERIFIED',build:FLAT_MINIMUM_BUILD_PIN.attempt,milliseconds,deployed:false,proofGenerated:false,financialAcceptance:false}));
}
