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
  Object.freeze({"path":"services/api-server/src/storage/database-pool.mjs","bytes":1245,"sha256":"156150d4738a121f3a5ea8def51504cca1cd9e1b1d1e7747b7240f3ae24fc737"}),
  Object.freeze({"path":"packages/backend/src/api/transport/platform-diagnostics.mjs","bytes":2701,"sha256":"dc4206e9b56ebcaffabc8113ab043ef1daaccb053291045db476e6d460924c5e"}),
  Object.freeze({"path":"services/api-server/src/entry.mjs","bytes":1164,"sha256":"42b3c87cd32c1dd2000bc9ae1eaed3a9f7f793b23d6e65ba5e6261a5dccb2fe9"}),
  Object.freeze({"path":"packages/backend/src/api/transport/gateway-pairing.mjs","bytes":3233,"sha256":"7bada04506e7d6ac3feb7fd5514fe5b5fa193fafd31f203f35ca509a94c5b788"}),
  Object.freeze({"path":"services/api-server/src/original/original-device-cloud-local-gateway-v1.mjs","bytes":14651,"sha256":"88311c6cb65dc43832634db5020f9c2ca074190bf4ec92677cf002c71d8b4812"}),
  Object.freeze({"path":"services/api-server/src/original/original-device-cloud-source-pins-v1.mjs","bytes":25917,"sha256":"a55b666ccd2645493241e5aa288f28133f2d0680abb54330004961d3bf6ca942"}),
  Object.freeze({"path":"services/api-server/src/original/original-device-local-caller-v1.mjs","bytes":8094,"sha256":"47d6f1fb6217344ed93e08d5c5f68fe9c0aa0e5bca6556f167f784700e4d56d2"}),
  Object.freeze({"path":"services/api-server/src/original/original-device-local-operator-v1.mjs","bytes":11947,"sha256":"a8316db2fa8246aaef3838cf354fbc793422a382337b649d439e17367cbf7786"}),
  Object.freeze({"path":"services/api-server/src/original/original-device-schema-v1.mjs","bytes":5176,"sha256":"21b91a9df694fa9c960d9bf78ed527f7fecba3176294496be3bc762d7eeea605"}),
  Object.freeze({"path":"services/api-server/src/original/original-gateway-bootstrap.mjs","bytes":5632,"sha256":"acb1dd55173be11b980b2e84569d66c906c6d9851b7324e78485daa11fb72740"}),
  Object.freeze({"path":"services/api-server/src/authorization/privacy-key-v1.mjs","bytes":1698,"sha256":"6ded05ce522dda4b60bdb40d5cb287c4d1a5614a1c9715308bd8b89722c66de7"}),
  Object.freeze({"path":"services/api-server/src/original/run-original-device-cloud-local-reopen-v1.mjs","bytes":491,"sha256":"77f76ec55e1a24b0c14fb23726b46c56f236003c8d3b001ed87af65b0a56a7fa"}),
  Object.freeze({"path":"services/api-server/src/original/run-original-device-cloud-local-v1.mjs","bytes":488,"sha256":"c4208902709efc946a8f4e357535027e49fcc60fc192798ce8574c94127f75fc"}),
  Object.freeze({"path":"scripts/development/profiles/run-original-device-durable-local-reopen-v1.mjs","bytes":281,"sha256":"eabc368481b99103e8bffff68a61c07eb0a04b81b2c5613523da83d4444d7ad7"}),
  Object.freeze({"path":"scripts/development/profiles/run-original-device-durable-local-v1.mjs","bytes":276,"sha256":"bfdd0328907f909459b2a1274738f16659373088bcea4f27e5e11ceb384e5d7f"}),
  Object.freeze({"path":"scripts/development/profiles/run-original-device-live-armed-v1.mjs","bytes":4704,"sha256":"72b7e579bfe0d0b6216ae7d5768d4b0fbe5722cbf6a295a7b45d5cf3eac60da5"}),
  Object.freeze({"path":"scripts/development/profiles/run-original-device-live-recovery-v1.mjs","bytes":296,"sha256":"b5b40ba96a5a4f30bd774b811d52cb5d5f6e71016e59402067c1ecf3a91da315"}),
  Object.freeze({"path":"scripts/development/profiles/run-original-device-local-reopen-v1.mjs","bytes":278,"sha256":"aa218a664ab0a301f2ac5b28d21193971d2b23f10e5bb094ea71d7c151831ea9"}),
  Object.freeze({"path":"scripts/development/profiles/run-original-device-local-v1.mjs","bytes":248,"sha256":"051d8f1be8956e19e2041e5e622a2f6b50cb1b0831a17947402d0be14a0c9c36"}),
  Object.freeze({"path":"scripts/development/profiles/run-original-native-private-authorized-durable-note-v2.mjs","bytes":6185,"sha256":"02adf7d7b7dcc275f5f4514dc67dc56fc2c25e7ca5ccd304e9696e1081b8d552"}),
  Object.freeze({"path":"scripts/development/profiles/run-original-native-private-deposit-v2.mjs","bytes":4441,"sha256":"e2f5928946dc790556a419833e37caffaa635ed7f13a0d346cde19201587fbf9"}),
  Object.freeze({"path":"scripts/development/profiles/run-original-native-private-durable-note-v2.mjs","bytes":6103,"sha256":"798ab05f96abe17e0940072d65cd6b09935435725af31e01a9cb4ff0b76601d4"}),
  Object.freeze({"path":"scripts/development/profiles/run-original-native-private-note-v2.mjs","bytes":4431,"sha256":"6f1641b6079e37fc4584f6adb4d70208120ee78684e92e9104ff4e28a06cc2e6"}),
  Object.freeze({"path":"scripts/development/profiles/run-original-native-private-worker-durable-note-v3.mjs","bytes":6194,"sha256":"5719c3bb23ee5ecaa716986cc0fe04dfaf3c7e3c355605c4ba121c80b9910191"}),
  Object.freeze({"path":"services/api-server/src/admission/run.mjs","bytes":1763,"sha256":"1326c4e5d4ac44efe32b1e6f10eef706995808662c6020973c9647b940fb709c"}),
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
