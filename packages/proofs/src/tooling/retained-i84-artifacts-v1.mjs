// @ts-check
/** Read-only, relocatable publication of the original accepted I84 reader.
 * Authenticate both its sealed result and every original resource it checked.
 * No historical module is executed, no proof is made and no authority is issued.
 * Directory strings in the result remain original provenance labels. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {constants,openSync,closeSync,readSync,lstatSync,fstatSync,realpathSync} from 'node:fs';
import {join} from 'node:path';
import {externalResourcesRoot} from '@lianum/environment';
import publication from '../native-value/metadata/retained-i84-publication-v1.json' with {type:'json'};

/** @typedef {null | boolean | number | string | Buffer | unknown[] | PublicRecord} PublicData */
/** @typedef {{[key:string]:unknown}} PublicRecord */
/** @typedef {{sha256:string,bytes:number}} FilePin */
/** @typedef {{logical:string,resource:string,sha256:string,bytes:number}} ResourcePin */
/** @typedef {{classification:string,driverSourceManifestSHA256:string,
 * context:PublicRecord,compiled:PublicRecord,statistics:PublicRecord,prepared:PublicRecord,
 * crs:PublicRecord,statsAttempt:PublicRecord,keyAttempt:PublicRecord,proofs:PublicRecord,
 * libraryTestsExecuted:number,mainConstraintCasesPreviouslyPassed:number}} RetainedI84Artifacts */
const MAX_FILE_BYTES=128*1024*1024;

/** @param {unknown} value @returns {asserts value is Record<string,unknown>} */
function record(value){
 assert.ok(value&&typeof value==='object'&&!Array.isArray(value)&&Object.getPrototypeOf(value)===Object.prototype,'I84_PUBLIC_RECORD');
}
/** @param {unknown} value @returns {asserts value is string} */
function relativePath(value){
 assert.ok(typeof value==='string'&&value.length>0&&!value.startsWith('/')&&!value.includes('\\')&&!value.includes('\0')&&
  !value.split('/').some(part=>!part||part==='.'||part==='..'),'I84_PUBLIC_RESOURCE_PATH');
}
/** @param {string} path @param {FilePin} pin @param {boolean} [returnBytes] */
function pinned(path,pin,returnBytes=false){
 relativePath(path);assert.match(pin.sha256,/^[0-9a-f]{64}$/,'I84_PUBLIC_RESOURCE_HASH');
 assert.ok(Number.isSafeInteger(pin.bytes)&&pin.bytes>=0&&pin.bytes<=MAX_FILE_BYTES,'I84_PUBLIC_RESOURCE_SIZE');
 assert.equal(realpathSync(externalResourcesRoot),externalResourcesRoot,'I84_PUBLIC_RESOURCE_ROOT_ALIAS');
 let physical=externalResourcesRoot;
 for(const part of path.split('/')){
  physical=join(physical,part);assert.ok(!lstatSync(physical).isSymbolicLink(),'I84_PUBLIC_RESOURCE_SYMLINK');
 }
 const original=lstatSync(physical,{bigint:true});
 assert.ok(original.isFile(),'I84_PUBLIC_RESOURCE_FILE');assert.equal(original.size,BigInt(pin.bytes),'I84_PUBLIC_RESOURCE_SIZE');
 const descriptor=openSync(physical,constants.O_RDONLY|constants.O_NOFOLLOW);
 try{
  const before=fstatSync(descriptor,{bigint:true}),hash=createHash('sha256'),buffer=Buffer.alloc(64*1024);
  assert.equal(before.ino,original.ino,'I84_PUBLIC_RESOURCE_CHANGED');
  assert.equal(before.dev,original.dev,'I84_PUBLIC_RESOURCE_CHANGED');
  /** @type {Buffer[]} */ const chunks=[];
  let count,total=0;
  while((count=readSync(descriptor,buffer,0,buffer.length,null))>0){
   total+=count;assert.ok(total<=pin.bytes,'I84_PUBLIC_RESOURCE_CHANGED');
   hash.update(buffer.subarray(0,count));if(returnBytes)chunks.push(Buffer.from(buffer.subarray(0,count)));
  }
  const after=fstatSync(descriptor,{bigint:true});
  for(const field of ['size','mtimeNs','ctimeNs','ino','dev'])assert.equal(
   before[/** @type {keyof typeof before} */(field)],after[/** @type {keyof typeof after} */(field)],'I84_PUBLIC_RESOURCE_CHANGED');
  assert.equal(total,pin.bytes,'I84_PUBLIC_RESOURCE_SIZE');
  assert.equal(hash.digest('hex'),pin.sha256,'I84_PUBLIC_RESOURCE_PIN');
  return returnBytes?Buffer.concat(chunks):null;
 }finally{closeSync(descriptor);}
}

/** Decode only the bounded JSON publication, returning fresh public buffers.
 * @param {unknown} value @returns {PublicData} */
function decode(value){
 if(value===null||typeof value==='boolean'||typeof value==='string')return value;
 if(typeof value==='number'){assert.ok(Number.isFinite(value));return value;}
 if(Array.isArray(value))return value.map(decode);
 record(value);
 if(value.schema==='LIANUM_I84_PUBLIC_BYTES_V1'){
  assert.deepEqual(Object.keys(value).sort(),['base64','schema']);assert.equal(typeof value.base64,'string');
  assert.ok(typeof value.base64==='string');const bytes=Buffer.from(value.base64,'base64');
  assert.equal(bytes.toString('base64'),value.base64,'I84_PUBLIC_BYTES_ENCODING');return bytes;
 }
 return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,decode(item)]));
}
/** @param {unknown} value @returns {asserts value is PublicRecord} */
function publicRecord(value){record(value);}

function inspected(){
 assert.equal(publication.schema,'LIANUM_RETAINED_I84_PUBLICATION_V1');
 const raw=pinned(publication.path,publication,true);assert.ok(raw);
 /** @type {unknown} */ const capsule=JSON.parse(raw.toString('utf8'));record(capsule);
 assert.equal(capsule.schema,'LIANUM_RETAINED_I84_PUBLIC_CAPSULE_V1');
 for(const field of ['readerSHA256','driverSHA256','sourceVersion'])assert.equal(capsule[field],publication[/** @type {keyof typeof publication} */(field)],'I84_PUBLIC_ORIGINAL_LINEAGE');
 assert.ok(Array.isArray(capsule.files));assert.equal(capsule.files.length,publication.resourceFiles,'I84_PUBLIC_RESOURCE_INVENTORY');
 const logicalNames=new Set();
 /** @type {ResourcePin[]} */ const resources=[];
 for(const row of capsule.files){
  record(row);relativePath(row.logical);relativePath(row.resource);
  assert.ok(typeof row.sha256==='string'&&typeof row.bytes==='number','I84_PUBLIC_RESOURCE_INVENTORY');
  assert.ok(!logicalNames.has(row.logical),'I84_PUBLIC_DUPLICATE_RESOURCE');logicalNames.add(row.logical);
  const pin={logical:row.logical,resource:row.resource,sha256:row.sha256,bytes:row.bytes};
  pinned(pin.resource,pin);resources.push(pin);
 }
 // The originals are still independently present and byte checked as evidence.
 const originalReader=resources.find(row=>row.logical==='drafts/native-value-verifier-preparation/read-native-value-artifacts.mjs');
 const originalDriver=resources.find(row=>row.logical==='drafts/native-value-verifier-preparation/driver-source-manifest.json');
 assert.equal(originalReader?.sha256,publication.readerSHA256,'I84_PUBLIC_ORIGINAL_READER');
 assert.equal(originalDriver?.sha256,publication.driverSHA256,'I84_PUBLIC_ORIGINAL_DRIVER');
 const data=decode(capsule.data);publicRecord(data);
 assert.equal(data.classification,'GENUINE_SHARED_NATIVE_VALUE_I84_ARTIFACTS_NOT_DEPLOYMENT_OR_LIVE_ACCEPTANCE');
 assert.equal(data.driverSourceManifestSHA256,publication.driverSHA256,'I84_PUBLIC_ORIGINAL_LINEAGE');
 publicRecord(data.context);assert.equal(data.context.sourceVersion,publication.sourceVersion,'I84_PUBLIC_ORIGINAL_LINEAGE');
 publicRecord(data.context.toolchain);assert.equal(process.version,data.context.toolchain.node,'I84_PUBLIC_NODE_VERSION');
 for(const field of ['compiled','statistics','prepared','crs','statsAttempt','keyAttempt','proofs'])publicRecord(data[field]);
 assert.equal(data.libraryTestsExecuted,0);assert.equal(data.mainConstraintCasesPreviouslyPassed,50);
 pinned(publication.path,publication);return {data,resources};
}

/** Exact source-pin inspection, including all public resources, with no brand. */
export function inspectRetainedI84ReaderPinsV1(){
 assert.equal(arguments.length,0,'NATIVE_VALUE_I_READER_NO_OPTIONS');inspected();
 return Object.freeze({readerSHA256:publication.readerSHA256,driverSourceManifestSHA256:publication.driverSHA256,
  sourceFiles:publication.driverSourceFiles});
}

/** @returns {RetainedI84Artifacts} */
export function loadRetainedI84ArtifactsV1(){
 assert.equal(arguments.length,0,'PW_FIXED_READER_NO_OPTIONS');const {data}=inspected();
 publicRecord(data.context);publicRecord(data.compiled);publicRecord(data.statistics);publicRecord(data.prepared);
 publicRecord(data.crs);publicRecord(data.statsAttempt);publicRecord(data.keyAttempt);publicRecord(data.proofs);
 assert.ok(typeof data.classification==='string'&&typeof data.driverSourceManifestSHA256==='string');
 assert.ok(typeof data.libraryTestsExecuted==='number'&&typeof data.mainConstraintCasesPreviouslyPassed==='number');
 return {classification:data.classification,driverSourceManifestSHA256:data.driverSourceManifestSHA256,
  context:data.context,compiled:data.compiled,statistics:data.statistics,prepared:data.prepared,crs:data.crs,
  statsAttempt:data.statsAttempt,keyAttempt:data.keyAttempt,proofs:data.proofs,
  libraryTestsExecuted:data.libraryTestsExecuted,mainConstraintCasesPreviouslyPassed:data.mainConstraintCasesPreviouslyPassed};
}
