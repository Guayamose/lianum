/** Reviewed local product gate, separate from the historical candidate and the
 * still-null canonical release. No environment/caller metadata can open it. */
import assert from 'node:assert/strict';
export const OWNED_TRON_PRODUCT_DRIVER_RELEASE_V1 = null;
export const OWNED_TRON_PRODUCT_TOTAL_MILLISECONDS_V1 = 90 * 60 * 1000;
export function assertOwnedTronProductReleaseV1() {
 assert.equal(arguments.length,0,'TRON_PRODUCT_RELEASE_NO_OPTIONS');
 const value=OWNED_TRON_PRODUCT_DRIVER_RELEASE_V1;
 assert.ok(value && typeof value==='object' && !Array.isArray(value),'TRON_PRODUCT_SOURCE_REVIEW_REQUIRED');
 assert.deepEqual(Object.keys(value).sort(),['acceptedCandidateReportSHA256','buildReportSHA256','classSHA256','format','innerClassSHA256','localOnly','publicNetwork']);
 assert.equal(value.format,'REVIEWED_LOCAL_TRON_PRODUCT_DRIVER_V1');
 assert.equal(value.acceptedCandidateReportSHA256,'33b74126209c827e794d44c74ea38d527ce1cba6b3acc634b34bcf7f0cf9608e');
 assert.equal(value.buildReportSHA256,'3914c0bc2d07852049bc3747475287d720173ca92702c4f7c81037daf8d7a7ee');
 assert.equal(value.classSHA256,'65313f923fac150adfcda7f2f66e3e5e17cf093b8fb26be81844c49bc9aaf029');
 assert.equal(value.innerClassSHA256,'963a36503e3be315c095413fd2c4301d79e36016575fd1872d43a0fe0a977921');
 assert.equal(value.localOnly,true); assert.equal(value.publicNetwork,false);
 return value;
}
