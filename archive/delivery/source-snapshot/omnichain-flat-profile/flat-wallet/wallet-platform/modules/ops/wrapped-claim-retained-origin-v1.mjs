/** Fixed separately pinned recovered-CI public-data reader; no proof ownership. */
import assert from 'node:assert/strict';
import { readFileSync, lstatSync, realpathSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT } from '../../../proof-workers/catalog.mjs';
const RECOVERY_ROOT=resolve(ROOT,'../..'),READER_ROOT=join(RECOVERY_ROOT,'drafts/wrapped-ci-recovered-consumer-20261006');
const MANIFEST_SHA256='212e74d264abfdcb672291050f53def6e48b26d1eda71e8d8b891f8cb8a5194b',MANIFEST_BYTES=862;
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
function inspectReader(){
 const path=join(READER_ROOT,'reader-source-manifest.json');assert.equal(realpathSync(path),path);const bytes=readFileSync(path);assert.equal(bytes.length,MANIFEST_BYTES);assert.equal(sha(bytes),MANIFEST_SHA256,'WRAPPED_RETAINED_READER_SOURCE_MANIFEST');
 const manifest=JSON.parse(bytes);assert.equal(manifest.schema,'LIANUM_RETAINED_CI51_READER_SOURCE_MANIFEST_V1');assert.equal(manifest.files.length,3);
 for(const row of manifest.files){assert.ok(row.path.startsWith('drafts/wrapped-ci-recovered-consumer-20261006/')&&!row.path.split('/').includes('..'),'WRAPPED_RETAINED_READER_FIXED_SOURCE');const p=join(RECOVERY_ROOT,row.path);assert.equal(realpathSync(p),p);assert.ok(lstatSync(p).isFile()&&lstatSync(p).nlink===1);const b=readFileSync(p);assert.equal(b.length,row.bytes);assert.equal(sha(b),row.sha256,'WRAPPED_RETAINED_READER_SOURCE_PIN');}
}
export async function loadWrappedRetainedCI51OriginV1(){
 assert.equal(arguments.length,0,'WRAPPED_RETAINED_ORIGIN_NO_OPTIONS');inspectReader();
 const module=await import(pathToFileURL(join(READER_ROOT,'reader.mjs')));assert.equal(typeof module.loadReviewedRetainedCI51,'function');
 const value=await module.loadReviewedRetainedCI51();inspectReader();assert.equal(value.format,'VERIFIED_FIXED_RETAINED_CI51_COMPILED_DATA_V1');assert.equal(value.relation,'native_claim_ingress_nonce_registry_v3');assert.equal(value.productionProofOwnershipGranted,false);
 return value;
}
