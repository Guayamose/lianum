/** Fixed separately pinned recovered-CO public-data reader; no proof ownership. */
import assert from 'node:assert/strict';
import { readFileSync, lstatSync, realpathSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT } from '../../../../../proofs/src/catalog.mjs';
const RECOVERY_ROOT=resolve(ROOT,'../..'),READER_ROOT=join(RECOVERY_ROOT,'drafts/wrapped-co-recovered-consumer-20261006');
const MANIFEST_SHA256='ec5bbec0246dd5468a1b751f20b0145b87ffb511256ecb22c6fb4038f45403b7',MANIFEST_BYTES=676;
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
function inspectReader(){
 const path=join(READER_ROOT,'reader-source-manifest.json');assert.equal(realpathSync(path),path);const bytes=readFileSync(path);assert.equal(bytes.length,MANIFEST_BYTES);assert.equal(sha(bytes),MANIFEST_SHA256,'WRAPPED_RETAINED_READER_SOURCE_MANIFEST');
 const manifest=JSON.parse(bytes);assert.equal(manifest.schema,'LIANUM_RETAINED_CO42_READER_SOURCE_MANIFEST_V1');assert.equal(manifest.files.length,3);
 for(const row of manifest.files){assert.ok(row.path.startsWith('drafts/wrapped-co-recovered-consumer-20261006/')&&!row.path.split('/').includes('..'),'WRAPPED_RETAINED_READER_FIXED_SOURCE');const p=join(RECOVERY_ROOT,row.path);assert.equal(realpathSync(p),p);assert.ok(lstatSync(p).isFile()&&lstatSync(p).nlink===1);const b=readFileSync(p);assert.equal(b.length,row.bytes);assert.equal(sha(b),row.sha256,'WRAPPED_RETAINED_READER_SOURCE_PIN');}
}
export async function loadWrappedRetainedCO42OriginV1(){
 assert.equal(arguments.length,0,'WRAPPED_RETAINED_ORIGIN_NO_OPTIONS');inspectReader();
 const module=await import(pathToFileURL(join(READER_ROOT,'reader.mjs')));assert.equal(typeof module.loadReviewedRetainedCO42,'function');
 const value=await module.loadReviewedRetainedCO42();inspectReader();assert.equal(value.format,'VERIFIED_FIXED_RETAINED_CO42_COMPILED_DATA_V1');assert.equal(value.relation,'native_claim_discharge_registry_v2');assert.equal(value.productionProofOwnershipGranted,false);
 return value;
}
