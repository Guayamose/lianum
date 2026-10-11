/** Publish the already accepted, read-only I84 output and its original bytes.
 * This migration command never compiles, proves or copies private lab state.
 * The original authenticated reader runs only during this explicit export. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {syncBuiltinESMExports} from 'node:module';
import {resolve,join,dirname} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {externalResourcesRoot,sourcePath,resourceMode} from '@lianum/environment';

assert.equal(process.argv.length,2,'I84_EXPORT_NO_OPTIONS');
assert.equal(resourceMode,'historical-local','I84_EXPORT_ORIGINAL_INSTALLATION_ONLY');
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const originalRoot='/workspace/scratch/770c47ebf757/lianum-recovery-20261005-0655';
const directory=join(originalRoot,'drafts/native-value-verifier-preparation');
const readerPath=join(directory,'read-native-value-artifacts.mjs');
const readerSHA256='5e1ea4272221d8790a93bb1ab4c0399c1a475bfc23ea87a1676cd7202549ef63';
const driverSHA256='09ffe3beb3a3024e65f36aeaa4b80d32e6a2a43a31d20e3f7bb63ea54e091d3e';
const sourceVersion='4a6503d4b139e20e4d672ca39eb5d5f1f75497555ba6d55a7d6c424dcbb5d92e';
assert.equal(sha(fs.readFileSync(readerPath)),readerSHA256);
assert.equal(sha(fs.readFileSync(join(directory,'driver-source-manifest.json'))),driverSHA256);

// Observe both ordinary reads and the streaming filePin reads of CRS/Wasm.
// Hooks exist only in this exporter process and are restored before publishing.
const read=fs.readFileSync,open=fs.openSync,files=new Map();let observing=false;
function observe(path){
 assert.notEqual(typeof path,'number','I84_EXPORT_UNEXPECTED_DESCRIPTOR');
 const physical=resolve(path instanceof URL?fileURLToPath(path):String(path));
 assert.ok(physical.startsWith(originalRoot+'/'),'I84_EXPORT_UNEXPECTED_ROOT');
 const logical=physical.slice(originalRoot.length+1);
 assert.ok(!logical.split('/').some(part=>['.env','source.secret','witness.gz','witness.bin','operations.vault','source.vault'].includes(part)),'I84_EXPORT_PRIVATE_RESOURCE');
 let raw;observing=true;try{raw=read(physical);}finally{observing=false;}
 const hash=sha(raw);
 if(files.has(logical))assert.equal(files.get(logical).sha256,hash,'I84_EXPORT_RESOURCE_CHANGED');
 else files.set(logical,{logical,sha256:hash,bytes:raw.length,physical});
}
fs.readFileSync=function(path,...args){const result=read(path,...args);observe(path);return result;};
fs.openSync=function(path,...args){if(!observing)observe(path);return open(path,...args);};
syncBuiltinESMExports();
let data;
try{data=await(await import(pathToFileURL(readerPath))).loadNativeValueArtifacts();}
finally{fs.readFileSync=read;fs.openSync=open;syncBuiltinESMExports();}
observe(readerPath);observe(join(directory,'driver-source-manifest.json'));
assert.equal(data.context.sourceVersion,sourceVersion);
assert.equal(data.driverSourceManifestSHA256,driverSHA256);
function encode(value){
 if(Buffer.isBuffer(value))return {schema:'LIANUM_I84_PUBLIC_BYTES_V1',base64:value.toString('base64')};
 if(Array.isArray(value))return value.map(encode);
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,encode(item)]));
 assert.ok(value===null||['string','number','boolean'].includes(typeof value),'I84_EXPORT_DATA_ONLY');
 return value;
}
const base='omnichain-product/evidence/native-admission-i84-public-v1';
function publish(path,bytes){
 fs.mkdirSync(dirname(path),{recursive:true});
 if(fs.existsSync(path))assert.ok(fs.readFileSync(path).equals(bytes),'I84_EXPORT_IMMUTABLE_PUBLICATION');
 else fs.writeFileSync(path,bytes,{flag:'wx',mode:0o644});
}
const rows=[...files.values()].sort((a,b)=>a.logical.localeCompare(b.logical));
let addedBytes=0;
const resources=rows.map(({logical,sha256,bytes,physical})=>{
 const raw=read(physical);assert.equal(sha(raw),sha256,'I84_EXPORT_RESOURCE_CHANGED');
 let resource=logical;
 if(logical.endsWith('.mjs')){
  resource=base+'/sources/'+sha256+'.source';
  const destination=join(externalResourcesRoot,resource);
  if(!fs.existsSync(destination))addedBytes+=raw.length;
  publish(destination,raw);
 }else{
  const retained=join(externalResourcesRoot,resource);
  assert.equal(sha(read(retained)),sha256,'I84_EXPORT_RETAINED_RESOURCE');
 }
 return {logical,resource,sha256,bytes};
});
const capsule={schema:'LIANUM_RETAINED_I84_PUBLIC_CAPSULE_V1',readerSHA256,driverSHA256,sourceVersion,
 files:resources,data:encode(data)};
const raw=Buffer.from(JSON.stringify(capsule)+'\n');
const capsulePath=base+'/capsule.json';
if(!fs.existsSync(join(externalResourcesRoot,capsulePath)))addedBytes+=raw.length;
publish(join(externalResourcesRoot,capsulePath),raw);
const publication={schema:'LIANUM_RETAINED_I84_PUBLICATION_V1',path:capsulePath,sha256:sha(raw),bytes:raw.length,
 readerSHA256,driverSHA256,sourceVersion,resourceFiles:resources.length,
 driverSourceFiles:0};
// driverSourceFiles retains the original reader's declared-source count.
const driver=JSON.parse(read(join(directory,'driver-source-manifest.json')));
publication.driverSourceFiles=driver.files.length+driver.readOnlyExternalFiles.length;
publish(sourcePath('packages/proofs/src/native-value/metadata/retained-i84-publication-v1.json'),
 Buffer.from(JSON.stringify(publication,null,2)+'\n'));
process.stdout.write(JSON.stringify({...publication,addedBytes,compiled:false,proofGenerated:false,privateStateIncluded:false})+'\n');
