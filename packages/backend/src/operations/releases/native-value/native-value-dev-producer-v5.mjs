/** Produces review data only. No writes/publication, no branding and no caller
 * paths, manifest, pins, runtime or callbacks. It fully inspects the original
 * retained artifacts using the genuine module before returning a candidate. */
import assert from 'node:assert/strict';
import { NATIVE_VALUE_DEV_MOBILE_PACKAGES_SHA256_V5 } from './native-value-dev-mobile-package-pins-v5.mjs';
import { nativeValueDevFinancialSourcePinsV5 as nativeValueDevHostSourcePinsV5 } from './native-value-dev-financial-source-pins-v5.mjs';
import { NATIVE_VALUE_DEV_SCHEMA_V5, NATIVE_VALUE_DEV_HISTORICAL_RELEASE_SHA256_V5,
  NATIVE_VALUE_DEV_RETAINED_SHA256_V5, NATIVE_VALUE_DEV_W39_ADAPTER_SHA256_V5,
  nativeValueDevDigestV5, nativeValueDevRetainedMetadataV5, validateNativeValueDevReleaseV5 }
  from './native-value-dev-release-contract-v5.mjs';
import { inspectRetainedNativeValueArtifactsForDevV5 } from '../../deployments/native-value/native-value-deployment-artifacts-v2.mjs';
export async function inspectNativeValueDevReleaseV5Candidate() {
  assert.equal(arguments.length, 0, 'NATIVE_VALUE_DEV_PRODUCER_NO_OPTIONS');
  const sourceFiles = nativeValueDevHostSourcePinsV5(), retained = nativeValueDevRetainedMetadataV5();
  const inspection = await inspectRetainedNativeValueArtifactsForDevV5();
  assert.equal(inspection.retainedMetadataSHA256, NATIVE_VALUE_DEV_RETAINED_SHA256_V5);
  assert.equal(inspection.historicalReleaseSHA256, NATIVE_VALUE_DEV_HISTORICAL_RELEASE_SHA256_V5);
  assert.deepEqual(nativeValueDevHostSourcePinsV5(), sourceFiles, 'NATIVE_VALUE_DEV_PRODUCER_SOURCE_CHANGED');
  return validateNativeValueDevReleaseV5({ schema: NATIVE_VALUE_DEV_SCHEMA_V5,
    historicalReleaseSHA256: NATIVE_VALUE_DEV_HISTORICAL_RELEASE_SHA256_V5,
    compilationSourceClosureSHA256: retained.sourceClosureSHA256,
    retainedMetadataSHA256: NATIVE_VALUE_DEV_RETAINED_SHA256_V5,
    w39AdapterManifestSHA256: NATIVE_VALUE_DEV_W39_ADAPTER_SHA256_V5,
    publicMobilePackagesSHA256: NATIVE_VALUE_DEV_MOBILE_PACKAGES_SHA256_V5,
    producedLedger: inspection.producedLedger,
    producedW39: inspection.producedW39,
    hostSourceClosureSHA256: nativeValueDevDigestV5(sourceFiles), sourceFiles, retained,
    scope: { localOnly: true, claimsEnabled: false, proofAcceptanceEstablished: false,
      mobileNoteCustodyEstablished: false, nativeGraphAcceptanceEstablished: false } });
}
