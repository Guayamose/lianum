/** Source compatibility DATA only. Never a funding/proof/deployment grant. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {types} from 'node:util';
import {projectRoot} from '@lianum/environment';

const sources=Object.freeze({
 'contracts/PrivateAssemblyNativeNotePool.sol':Object.freeze({
  before:'archive/delivery/source-snapshot/omnichain-product/contracts/PrivateAssemblyNativeNotePool.sol',
  after:'contracts/engine/PrivateAssemblyNativeNotePool.sol',
  bytes:23942,sha256:'8a41d0e76bd1f1d53b6690e1e052a180d23498125bb8d9964be060ecc5a186da'}),
 'src/private-assembly-runtime.mjs':Object.freeze({
  before:'archive/delivery/source-snapshot/omnichain-product/src/private-assembly-runtime.mjs',
  after:'packages/engine/src/assembly/private-assembly-runtime.mjs',
  bytes:26113,sha256:'682221c9da9016852751f7d551b98508ae6ae84263da45955f3c6f039d9b628f'}),
});
function record(value,keys,code){
 assert.ok(value&&!types.isProxy(value)&&Object.getPrototypeOf(value)===Object.prototype,code);
 const fields=Reflect.ownKeys(value),descriptors=Object.getOwnPropertyDescriptors(value);
 assert.deepEqual(fields.sort(),[...keys].sort(),code);
 for(const key of fields)assert.ok(descriptors[key].enumerable&&Object.hasOwn(descriptors[key],'value'),code);
}

/** The historical loader still authenticates its original immutable manifest
 * before this common DATA validator. Calling this function conveys no grant. */
export function validatePrivateGuardedFundingSourceDeltasV1(deltas,priorSources){
 record(deltas,Object.keys(sources),'PC22_SOURCE_PROFILE_PATHS');
 assert.ok(priorSources&&typeof priorSources==='object'&&!types.isProxy(priorSources),'PC22_SOURCE_PROFILE_BASELINE');
 const overrides={};
 for(const [file,delta]of Object.entries(deltas)){
  record(delta,['current','previous'],'PC22_SOURCE_PROFILE_DELTA');
  assert.deepEqual(delta.previous,priorSources[file],'PC22_SOURCE_PROFILE_PREVIOUS_PIN');
  for(const pin of [delta.previous,delta.current]){
   record(pin,['bytes','sha256'],'PC22_SOURCE_PROFILE_PIN_FIELDS');
   assert.match(pin.sha256,/^[0-9a-f]{64}$/,'PC22_SOURCE_PROFILE_HASH');
   assert.ok(Number.isSafeInteger(pin.bytes)&&pin.bytes>0,'PC22_SOURCE_PROFILE_BYTES');
  }
  overrides[file]=Object.freeze({...delta.current});
 }
 return Object.freeze(overrides);
}

/** Fixed archival bytes compared with the current canonical producer paths.
 * No M18/M22 historical result, proof, verifier key, ledger or financial claim. */
export async function readPrivateGuardedSourceCompatibilityReviewV1(){
 const allowedSourceDeltas={},sourceLocations={};
 for(const [file,paths]of Object.entries(sources)){
  const before=await readFile(join(projectRoot,paths.before));
  assert.equal(before.length,paths.bytes,'GUARDED_SOURCE_ARCHIVE_SIZE');
  const previous={bytes:before.length,sha256:createHash('sha256').update(before).digest('hex')};
  assert.equal(previous.sha256,paths.sha256,'GUARDED_SOURCE_ARCHIVE_PIN');
  const after=await readFile(join(projectRoot,paths.after));
  assert.ok(after.length>0&&after.length<=1024*1024,'GUARDED_SOURCE_CURRENT_SIZE');
  allowedSourceDeltas[file]={previous,current:{bytes:after.length,sha256:createHash('sha256').update(after).digest('hex')}};
  sourceLocations[file]={previous:paths.before,current:paths.after};
 }
 validatePrivateGuardedFundingSourceDeltasV1(allowedSourceDeltas,Object.fromEntries(Object.entries(allowedSourceDeltas).map(([file,delta])=>[file,delta.previous])));
 return {schemaVersion:1,profile:'PRIVATE_GUARDED_SOURCE_COMPATIBILITY_REVIEW_V1',
  classification:'CURRENT_SOURCE_REVIEW_ONLY_NOT_M18_M22_ACCEPTANCE',
  financialAcceptance:false,historicalEvidenceRecovered:false,
  genuineGuardedFundingRunCompleted:false,allowedSourceDeltas,sourceLocations};
}
