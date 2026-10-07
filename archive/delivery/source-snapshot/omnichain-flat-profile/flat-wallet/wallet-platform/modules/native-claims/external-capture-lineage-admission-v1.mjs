import assert from 'node:assert/strict';
const ADMISSION = null;
export function readExternalCaptureLineageAdmissionV1() {
  assert.equal(arguments.length, 0);
  assert.ok(ADMISSION, 'EXTERNAL_CAPTURE_LINEAGE_ADMISSION_CLOSED');
  return structuredClone(ADMISSION);
}
