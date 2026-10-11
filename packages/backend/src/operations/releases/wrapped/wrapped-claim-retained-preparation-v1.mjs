/** Fixed source-authenticated retained-CI preparation reader. Public data only;
 * no caller paths, hashes, module hooks, compiler, key generation or brands. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,lstatSync,realpathSync} from 'node:fs';
import {join,resolve,posix} from 'node:path';
import {pathToFileURL} from 'node:url';
import {ROOT} from '@lianum/proofs/catalog';
import {inspectWrappedInstallationSourcesV2} from '@lianum/components/verification/wrapped-installation';
import {WRAPPED_CLAIM_PROOF_PIN_SET_V1,WRAPPED_CLAIM_PROOF_PIN_SCHEMA_V3,WRAPPED_CLAIM_PROOF_RELEASE_SCHEMA_V3} from '@lianum/proofs/wrapped-claims/metadata/wrapped-claim-proof-pins-v1';
import {WRAPPED_CLAIM_PROOF_RELEASE_V1} from './wrapped-claim-release-v1.mjs';
import {validateWrappedStageProvenanceV3} from './wrapped-claim-stage-provenance-v2.mjs';
import {exactRecord} from '@lianum/components/encoding/commitments';
const READER_ROOT=resolve(ROOT,'../../drafts/wrapped-ci-retained-preparation-20261006'),sha=b=>createHash('sha256').update(b).digest('hex'),jsha=v=>sha(JSON.stringify(v));
let permanentlyFaulted=false,firstReaderManifest=null;
function pinRead(root,relative,pin){
 exactRecord(pin,['bytes','sha256']);assert.ok(Number.isSafeInteger(pin.bytes)&&pin.bytes>0&&pin.bytes<=128*1024*1024);assert.match(pin.sha256,/^[0-9a-f]{64}$/);assert.ok(typeof relative==='string'&&/^[A-Za-z0-9_./-]+$/.test(relative)&&!relative.startsWith('/')&&!relative.split('/').some(s=>!s||s==='.'||s==='..'));assert.equal(realpathSync(root),root);
 let path=root;for(const part of relative.split('/')){path=join(path,part);assert.equal(lstatSync(path).isSymbolicLink(),false,'WRAPPED_PREPARATION_READER_SYMLINK');}const before=lstatSync(path);assert.ok(before.isFile()&&before.nlink===1);assert.equal(before.size,pin.bytes);const raw=readFileSync(path),after=lstatSync(path);for(const k of ['dev','ino','size','mtimeMs','ctimeMs'])assert.equal(after[k],before[k],'WRAPPED_PREPARATION_READER_CHANGED_DURING_READ');assert.equal(raw.length,pin.bytes);assert.equal(sha(raw),pin.sha256,'WRAPPED_PREPARATION_READER_RAW_PIN');return raw;
}
function descriptor(){
 inspectWrappedInstallationSourcesV2();const p=WRAPPED_CLAIM_PROOF_PIN_SET_V1,r=WRAPPED_CLAIM_PROOF_RELEASE_V1;assert.ok(p&&r,'WRAPPED_RETAINED_PREPARATION_RELEASE_REQUIRED');exactRecord(r,['schema','profile','pinSetSHA256','hostSourceClosureSHA256','stageProvenanceSHA256']);exactRecord(p,['schema','hostSources','roles','constraintFiles','compiled','stageProvenance']);assert.equal(r.profile,'LIANUM_OWNED_WRAPPED_CUSTODY_NATIVE_GRAPH_V1');assert.equal(p.schema,WRAPPED_CLAIM_PROOF_PIN_SCHEMA_V3);assert.equal(r.schema,WRAPPED_CLAIM_PROOF_RELEASE_SCHEMA_V3);assert.equal(r.pinSetSHA256,jsha(p));assert.equal(r.stageProvenanceSHA256,jsha(p.stageProvenance));assert.equal(r.hostSourceClosureSHA256,jsha(p.hostSources));validateWrappedStageProvenanceV3(p.stageProvenance,r.hostSourceClosureSHA256);const value=p.stageProvenance.retainedPreparation.claim_ingress;assert.ok(value,'WRAPPED_RETAINED_PREPARATION_NOT_REVIEWED');return value;
}
function inspectReader(d){
 const raw=pinRead(READER_ROOT,'reader-source-manifest.json',d.readerSourceManifest);if(firstReaderManifest)assert.ok(firstReaderManifest.equals(raw),'WRAPPED_PREPARATION_READER_MANIFEST_CHANGED');
 const manifest=JSON.parse(raw);exactRecord(manifest,['schema','files']);assert.equal(manifest.schema,'WRAPPED_RETAINED_PREPARATION_READER_SOURCE_MANIFEST_V1');assert.ok(Array.isArray(manifest.files)&&manifest.files.length>0&&manifest.files.length<=1024);let previous='';const known=new Set(),sources=new Map();
 for(const row of manifest.files){exactRecord(row,['path','bytes','sha256']);assert.ok(row.path>previous,'WRAPPED_PREPARATION_READER_SORT_DUPLICATE');previous=row.path;assert.notEqual(row.path,'reader-source-manifest.json');known.add(row.path);const bytes=pinRead(READER_ROOT,row.path,{bytes:row.bytes,sha256:row.sha256});if(row.path.endsWith('.mjs'))sources.set(row.path,bytes.toString('utf8'));}
 const visited=new Set();function visit(path){assert.ok(known.has(path),'WRAPPED_PREPARATION_READER_IMPORT_NOT_PINNED');if(visited.has(path)||!path.endsWith('.mjs'))return;visited.add(path);for(const match of sources.get(path).matchAll(/(?:\bfrom\s+|^\s*import\s+|\bimport\s*\(\s*)(['"])([^'"]+)\1/gm)){const specifier=match[2];if(specifier.startsWith('node:'))continue;assert.ok(specifier.startsWith('.'),'WRAPPED_PREPARATION_READER_FIXED_IMPORT');visit(posix.normalize(posix.join(posix.dirname(path),specifier)));}}
 // The fixed reader's sole computed import is this explicitly enumerated core.
 for(const path of ['reader.mjs','retained-preparation-core.mjs'])visit(path);firstReaderManifest??=Buffer.from(raw);return raw;
}
export async function loadWrappedRetainedCI51PreparationV1(){
 assert.equal(arguments.length,0,'WRAPPED_RETAINED_PREPARATION_NO_OPTIONS');assert.equal(permanentlyFaulted,false,'WRAPPED_RETAINED_PREPARATION_PERMANENTLY_FAULTED');
 try{const d=descriptor(),before=inspectReader(d),reader=await import(pathToFileURL(join(READER_ROOT,'reader.mjs')));assert.ok(inspectReader(descriptor()).equals(before),'WRAPPED_PREPARATION_READER_CHANGED_AFTER_IMPORT');assert.equal(typeof reader.loadReviewedRetainedCI51Preparation,'function');
  const value=await reader.loadReviewedRetainedCI51Preparation();assert.ok(inspectReader(descriptor()).equals(before),'WRAPPED_PREPARATION_READER_CHANGED_AFTER_READ');assert.equal(value.format,'VERIFIED_FIXED_RETAINED_CI51_PREPARATION_DATA_V1');assert.equal(value.productionProofOwnershipGranted,false);
  for(const [bytes,object,pin]of [[value.manifestBytes,value.manifest,d.manifest],[value.validationReceiptBytes,value.validationReceipt,d.validationReceipt]]){assert.ok(Buffer.isBuffer(bytes));assert.equal(bytes.length,pin.bytes);assert.equal(sha(bytes),pin.sha256);assert.deepEqual(JSON.parse(bytes),object);}
  assert.equal(value.manifestSHA256,d.manifest.sha256);assert.equal(value.validationReceiptSHA256,d.validationReceipt.sha256);return value;
 }catch(error){permanentlyFaulted=true;throw error;}
}
