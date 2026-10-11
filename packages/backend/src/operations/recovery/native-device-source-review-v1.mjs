/** Source review for local operator creation and recovery. No service factory or
 * recovery state is imported; original release and caller checks are unchanged. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { realpath, lstat, open } from 'node:fs/promises';
import { join } from 'node:path';
import { projectRoot } from '@lianum/environment';
import { loadNativeValueDevDeploymentArtifactsV5 } from '../deployments/native-value/native-value-deployment-artifacts-v2.mjs';
import { NATIVE_VALUE_DEV_RELEASE_V5 } from '../releases/native-value/native-value-dev-release-v5.mjs';
export const ORIGINAL_NATIVE_DEVICE_LOCAL_PROFILE_V1 = 'ORIGINAL_NATIVE_DEVICE_LOCAL_OPERATOR_V1';
const requiredSources = Object.freeze([
  'wallet-platform/modules/ops/native-device-local-operator-v1.mjs',
  'wallet-platform/modules/ops/native-device-local-provider-v1.mjs',
  'wallet-platform/modules/ops/native-device-local-restart-v1.mjs',
]);
// These exact current product callers are consumers outside the original
// compiler allowlist. Their literals live in this V5-authenticated backend;
// no caller path/hash or expanded release-contract root is admitted.
const reviewedCallers = Object.freeze([
  Object.freeze({"path":"apps/platform/src/database-pool.mjs","bytes":1216,"sha256":"d6328f91b789d04ded1eb683b612a58cbfc7da25f48b07df41f545732602fc06"}),
  Object.freeze({"path":"apps/platform/src/diagnostics.mjs","bytes":2701,"sha256":"dc4206e9b56ebcaffabc8113ab043ef1daaccb053291045db476e6d460924c5e"}),
  Object.freeze({"path":"apps/platform/src/entry.mjs","bytes":999,"sha256":"713a7682ab83c202554309570a87e10101b29293ec6194c4bb49b78c40c44a26"}),
  Object.freeze({"path":"apps/platform/src/gateway-pairing.mjs","bytes":3217,"sha256":"c272a5ae845b48568bcf39fd65830fc6e5d24f923731674264b2a75be8e7b996"}),
  Object.freeze({"path":"apps/platform/src/original-device-cloud-local-gateway-v1.mjs","bytes":14654,"sha256":"5deac582bd4fc178745aae9631b7e2e1b73a9e3f0bfdf847cc5d61107f5bf0f6"}),
  Object.freeze({"path":"apps/platform/src/original-device-cloud-source-pins-v1.mjs","bytes":22730,"sha256":"2dbce5f9b01ac4cad3bfadbf4851667548ae9a0aec737d0a27af0190be939d57"}),
  Object.freeze({"path":"apps/platform/src/original-device-local-caller-v1.mjs","bytes":7872,"sha256":"9ebd70097dd37c0a438e12990a3264edbe041d6997b26158fd780888177a1524"}),
  Object.freeze({"path":"apps/platform/src/original-device-local-operator-v1.mjs","bytes":11932,"sha256":"943178073035af0b4e62832adcf8d1902e868ff85805db7fee28be923cee31d1"}),
  Object.freeze({"path":"apps/platform/src/original-device-schema-v1.mjs","bytes":5173,"sha256":"e88ab9c4b9faeff24b4ac1b118f9b78546edbb15d6429784f713c314a643e20a"}),
  Object.freeze({"path":"apps/platform/src/original-gateway-bootstrap.mjs","bytes":5555,"sha256":"80f23b7f56d82270ca9e97f1577c5b74ecd6d7b4d401d95180941559954ffe35"}),
  Object.freeze({"path":"apps/platform/src/privacy-key-v1.mjs","bytes":1698,"sha256":"6ded05ce522dda4b60bdb40d5cb287c4d1a5614a1c9715308bd8b89722c66de7"}),
  Object.freeze({"path":"apps/platform/src/run-original-device-cloud-local-reopen-v1.mjs","bytes":462,"sha256":"69d90e568e97ea55b09fbfee332aea708e714910203bad2f66ea5468f728817a"}),
  Object.freeze({"path":"apps/platform/src/run-original-device-cloud-local-v1.mjs","bytes":459,"sha256":"7799078b4d8f06030834ab2c03096b3b1cd3a9c49a9028d679db881443f265d9"}),
  Object.freeze({"path":"apps/platform/src/run-original-device-durable-local-reopen-v1.mjs","bytes":241,"sha256":"de056662c9711cd9f14e6fc91dfcb686efd1b8fab8b973eb06cedb7243c381c5"}),
  Object.freeze({"path":"apps/platform/src/run-original-device-durable-local-v1.mjs","bytes":236,"sha256":"bf5617909a7646ad6b8ff95875a700fafd4b9fcca6f8cd234535c17f40567693"}),
  Object.freeze({"path":"apps/platform/src/run-original-device-live-armed-v1.mjs","bytes":4704,"sha256":"72b7e579bfe0d0b6216ae7d5768d4b0fbe5722cbf6a295a7b45d5cf3eac60da5"}),
  Object.freeze({"path":"apps/platform/src/run-original-device-live-recovery-v1.mjs","bytes":256,"sha256":"6f88ae522b6a56ec98f0a4b5b19d902396c9b05d71ca730b59e60e5a6b9c0faa"}),
  Object.freeze({"path":"apps/platform/src/run-original-device-local-reopen-v1.mjs","bytes":238,"sha256":"cfd3176249afa1b3369f89f4056f1dd28fc9c89e2fe8296147367b8c4a1c2b10"}),
  Object.freeze({"path":"apps/platform/src/run-original-device-local-v1.mjs","bytes":208,"sha256":"b46e992f973d8dde44f217b1739308e43a0ee03f5bffda5b7c2ccffe49d0c422"}),
  Object.freeze({"path":"apps/platform/src/run-original-native-private-authorized-durable-note-v2.mjs","bytes":6021,"sha256":"0d0cf663bfa59b0bb1fc86617514fcd17fbeea68ae135667247d1da8fbcab6d1"}),
  Object.freeze({"path":"apps/platform/src/run-original-native-private-deposit-v2.mjs","bytes":4441,"sha256":"e2f5928946dc790556a419833e37caffaa635ed7f13a0d346cde19201587fbf9"}),
  Object.freeze({"path":"apps/platform/src/run-original-native-private-durable-note-v2.mjs","bytes":5939,"sha256":"2903605d57b8e7a781e73eb39356a7f0bb769148322325ee9529fa6600688861"}),
  Object.freeze({"path":"apps/platform/src/run-original-native-private-note-v2.mjs","bytes":4431,"sha256":"6f1641b6079e37fc4584f6adb4d70208120ee78684e92e9104ff4e28a06cc2e6"}),
  Object.freeze({"path":"apps/platform/src/run-original-native-private-worker-durable-note-v3.mjs","bytes":6030,"sha256":"15f5f7f94d8b8ebca676542d1452871aad328fcb01320821ee63b5b4c8d3738d"}),
  Object.freeze({"path":"apps/platform/src/run.mjs","bytes":1687,"sha256":"ffab327186bac8123d9e54bff2951439bb6d1a83efdbc13bd2265ce6fc104a0c"}),
]);
async function assertReviewedLocalProductCallers() {
  const directory = projectRoot;
  assert.equal(await realpath(directory), directory, 'NATIVE_DEVICE_PRODUCT_CALLER_ROOT_ALIAS');
  for (const row of reviewedCallers) {
    let path = directory;
    for (const part of row.path.split('/')) {
      path = join(path, part);
      assert.equal((await lstat(path)).isSymbolicLink(), false, 'NATIVE_DEVICE_PRODUCT_CALLER_ALIAS');
    }
    const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const before = await handle.stat();
      assert.ok(before.isFile() && before.nlink === 1 && before.size === row.bytes,
        'NATIVE_DEVICE_PRODUCT_CALLER_PHYSICAL_PIN');
      const bytes = await handle.readFile(), after = await handle.stat(), named = await lstat(path);
      for (const field of ['dev', 'ino', 'uid', 'mode', 'nlink', 'size', 'mtimeMs', 'ctimeMs'])
        assert.ok(before[field] === after[field] && before[field] === named[field], 'NATIVE_DEVICE_PRODUCT_CALLER_CHANGED');
      assert.equal(named.isSymbolicLink(), false);
      assert.equal(bytes.length, row.bytes, 'NATIVE_DEVICE_PRODUCT_CALLER_PHYSICAL_PIN');
      assert.equal(createHash('sha256').update(bytes).digest('hex'), row.sha256, 'NATIVE_DEVICE_PRODUCT_CALLER_RAW_PIN');
    } finally { await handle.close(); }
  }
}
/** V5 authenticates these backend consumers. The exact app caller bytes are
 * separately pinned here, outside the immutable compiler/source allowlist. */
export async function assertOriginalNativeDeviceLocalSourceReviewV1() {
  assert.equal(arguments.length, 0);
  assert.ok(NATIVE_VALUE_DEV_RELEASE_V5 !== null && requiredSources.every(path =>
    NATIVE_VALUE_DEV_RELEASE_V5.sourceFiles.some(row => row.path === path)), 'NATIVE_DEVICE_PRODUCT_SOURCE_REVIEW_REQUIRED');
  await loadNativeValueDevDeploymentArtifactsV5();
  await assertReviewedLocalProductCallers();
}
