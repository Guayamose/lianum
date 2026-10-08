/** Diagnostic derivative only. Activate solely after reviewing its real fixed
 * compiler outputs. No native financial/canonical/private-credit acceptance. */
import assert from 'node:assert/strict';
export const TRON_FIRST_ERROR_PRIVATE_CANDIDATE_RELEASE_V3 = null;
if(TRON_FIRST_ERROR_PRIVATE_CANDIDATE_RELEASE_V3!==null)Object.freeze(TRON_FIRST_ERROR_PRIVATE_CANDIDATE_RELEASE_V3);
export const TRON_FIRST_ERROR_PRIVATE_SOURCE_SHA256_V3 = '472a1e6ebef937f966cb4d5b3455bf39c7f007b47bb759e3cac3bd62cc22ee3e';
export function assertTronFirstErrorPrivateProfileV3() {
  assert.equal(arguments.length,0,'TRON_FIRST_ERROR_NO_OPTIONS');
  assert.notEqual(TRON_FIRST_ERROR_PRIVATE_CANDIDATE_RELEASE_V3,null,'TRON_FIRST_ERROR_ACTUAL_BUILD_REVIEW_REQUIRED');
  const release=TRON_FIRST_ERROR_PRIVATE_CANDIDATE_RELEASE_V3;
  assert.deepEqual(Object.keys(release).sort(),['format','sourceSHA256','buildReportSHA256','classSHA256','innerClassSHA256'].sort());
  assert.equal(release.format,'REVIEWED_LOCAL_TRON_FIRST_ERROR_PRIVATE_CANDIDATE_V3');
  assert.equal(release.sourceSHA256,TRON_FIRST_ERROR_PRIVATE_SOURCE_SHA256_V3);
  for(const name of ['buildReportSHA256','classSHA256','innerClassSHA256'])
    assert.ok(typeof release[name]==='string'&&/^[0-9a-f]{64}$/.exec(release[name])?.[0]===release[name]);
  return Object.freeze({...release});
}
