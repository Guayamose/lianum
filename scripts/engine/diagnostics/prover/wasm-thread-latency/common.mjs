/** Isolated, fixed BTC-v2 experiment. Imports perform no proof or chain operation. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
export {hash,filePin,resources,guard,WALLET_RESOURCE_FLOORS as floors} from '../../../../../packages/proofs/programs/wallet-notes/resources.mjs';
import {filePin,hash,verifyToolchain,verifyCRS} from '../../../../../packages/proofs/programs/wallet-notes/resources.mjs';
export const root=fileURLToPath(new URL('.',import.meta.url));
export const project=fileURLToPath(new URL('../../../../experiments/',import.meta.url));
export const assembly=join(project,'experiments/private-core-proof/owner-independent');
export const spec=Object.freeze({mode:'btc_ready',target:'evm',publicInputCount:79,proofBytes:10688,maximumPages:65536,
 circuitSHA256:'aa9295c48bff839e59f171f5c5945a15e4e33476019ee97202df932747d8902e',
 keySHA256:'12e910f5419668f46c3793ad67bbdc712b9beb645c849486a3a441dff5755078',
 sourceSHA256:'dd5305a299c1f88b3070d0557c75af6089e3b379dd59b92eece735e68e185942',
 publicInputsSHA256:'88e68e035f914b8a6c555e3abc826496f9c6855b5d2968f906383dd90ca3f030',
 originalRun:'2026-10-02T21-10-05-406Z',currentRun:'2026-10-02T22-08-20-126Z'});
export const limits=Object.freeze({sampleMilliseconds:250,armMilliseconds:900000,verificationMilliseconds:120000,terminateGraceMilliseconds:5000});
export const fields=values=>values.map(x=>BigInt(x).toString());
export function safeError(error){const message=String(error?.message??'').split('\n',1)[0];return{name:/^[A-Za-z]{1,40}$/.test(error?.name??'')?error.name:'Error',code:/^(?:WT_|CC_|PC18_|PC23_)[A-Z0-9_]+$/.test(message)?message:'WT_OPERATION_FAILED'};}
export function verifyPins(expectedManifestSHA256){
 const path=join(root,'pins.json');filePin(path,{sha256:expectedManifestSHA256});
 const manifest=JSON.parse(readFileSync(path));
 assert.equal(manifest.officialVersion,'5.2.0','WT_TOOLCHAIN_VERSION');
 assert.equal(manifest.tarballSHA256,'321e72314fea1963f3557a5d739691f2fc7ec68c8ed8731dff8ebd380b56c019','WT_TARBALL_PIN');
 for(const [file,pin]of Object.entries(manifest.files)){assert.ok(!file.startsWith('/')&&!file.split('/').includes('..'),'WT_PIN_PATH');filePin(join(project,file),pin);}
 return{manifest,toolchain:verifyToolchain(),crsIntegrity:verifyCRS()};
}
export function cacheLineage(cacheManifestSHA256,toolchain,crsIntegrity){
 const path=join(project,'experiments/private-core-proof/crs-cache-latency/pins.json');filePin(path,{sha256:cacheManifestSHA256});
 const manifest=JSON.parse(readFileSync(path));
 assert.equal(manifest.officialBarretenbergVersion,'5.2.0','WT_CACHE_VERSION');
 assert.equal(manifest.officialSourceCommit,'49a592109ec4f18d79212b43d621891aaf36f7b6','WT_CACHE_COMMIT');
 assert.equal(manifest.officialTarballSHA256,'321e72314fea1963f3557a5d739691f2fc7ec68c8ed8731dff8ebd380b56c019','WT_CACHE_TARBALL');
 return{manifestSHA256:cacheManifestSHA256,officialVersion:manifest.officialBarretenbergVersion,officialSourceCommit:manifest.officialSourceCommit,
 officialTarballSHA256:manifest.officialTarballSHA256,toolchain,crsIntegrity,
 officialLoader:manifest.files['experiments/pc5-proof-probe/node_modules/@aztec/bb.js/src/barretenberg/index.ts'],
 officialCacheLoader:manifest.files['experiments/pc5-proof-probe/node_modules/@aztec/bb.js/src/crs/node/index.ts'],
 numPoints:2097152,derivedEncoding:'uncompressed-big-endian-x-y',derivedBytes:134217728};
}
/** Only allowlisted, numeric official startup metadata can leave the child. */
export function startupLogger(requestedThreads,maximumPages){
 const metadata={requestedThreads,maximumPages,initialPages:37,officialStartupSeen:false,workerCreationSeen:requestedThreads===1};
 return{metadata,logger(message){
  const m=/^Initializing bb wasm: initial memory (\d+) pages [\d.]+MiB; max memory: (\d+) pages, [\d.]+MiB; threads: (\d+); shared memory: (true|false)$/.exec(message);
  if(m){assert.equal(metadata.officialStartupSeen,false,'WT_DUPLICATE_STARTUP');metadata.officialStartupSeen=true;metadata.initialPages=Number(m[1]);metadata.maximumPages=Number(m[2]);metadata.effectiveThreads=Number(m[3]);metadata.sharedMemory=m[4]==='true';}
  const w=/^Creating (\d+) worker threads$/.exec(message);
  if(w){metadata.workerCreationSeen=true;metadata.officialCreationLabel=Number(w[1]);metadata.actualAuxiliaryWorkers=Number(w[1])-1;}
 },validate(){assert.equal(metadata.officialStartupSeen,true,'WT_STARTUP_METADATA');assert.equal(metadata.initialPages,37,'WT_INITIAL_MEMORY');assert.equal(metadata.maximumPages,maximumPages,'WT_MEMORY_BOUND');assert.equal(metadata.effectiveThreads,requestedThreads,'WT_EFFECTIVE_THREADS');assert.equal(metadata.sharedMemory,true,'WT_SHARED_MEMORY');assert.equal(metadata.workerCreationSeen,true,'WT_WORKER_STARTUP');if(requestedThreads>1)assert.equal(metadata.actualAuxiliaryWorkers,requestedThreads-1,'WT_AUXILIARY_WORKERS');return metadata;}};
}
