import assert from 'node:assert/strict';
const ADMISSION = null;
export function readExternalFreshCaptureAdmissionV1() {
  assert.equal(arguments.length, 0);
  assert.ok(ADMISSION, 'EXTERNAL_FRESH_CAPTURE_ADMISSION_CLOSED');
  return structuredClone(ADMISSION);
}
