/** Prepare a new source generation reusing exactly authenticated compiled files.
 * Emits review data and a V6 reuse receipt; never publishes, compiles or brands. */
import assert from 'node:assert/strict';
import { nativeValueDevFinancialSourcePinsV5 } from './native-value-dev-financial-source-pins-v5.mjs';
import { NATIVE_VALUE_DEV_RELEASE_V5 } from './native-value-dev-release-v5.mjs';
import { nativeValueDevDigestV5, validateNativeValueDevReleaseV5 } from './native-value-dev-release-contract-v5.mjs';
import { inspectRetainedNativeValueReuseForPreparationV6, validateRetainedNativeValuePublicationV6 }
  from '../../deployments/native-value/native-value-deployment-artifacts-v2.mjs';
import { NATIVE_VALUE_DEV_MOBILE_PACKAGES_SHA256_V5 } from './native-value-dev-mobile-package-pins-v5.mjs';
import { frozenInput } from '../../../execution/account/preparation/readiness-inputs.mjs';

export async function prepareNativeValueDevReleaseV6Candidate() {
  assert.equal(arguments.length, 0, 'NATIVE_VALUE_DEV_V6_PRODUCER_NO_OPTIONS');
  const sourceFiles = nativeValueDevFinancialSourcePinsV5();
  const original = validateRetainedNativeValuePublicationV6(NATIVE_VALUE_DEV_RELEASE_V5);
  const inspection = await inspectRetainedNativeValueReuseForPreparationV6();
  assert.deepEqual(inspection.producedLedger, original.producedLedger, 'NATIVE_VALUE_DEV_V6_RETAINED_LEDGER');
  assert.deepEqual(inspection.producedW39, original.producedW39, 'NATIVE_VALUE_DEV_V6_RETAINED_W39');
  assert.equal(inspection.artifactBundleIssued, false);
  assert.deepEqual(nativeValueDevFinancialSourcePinsV5(), sourceFiles, 'NATIVE_VALUE_DEV_V6_SOURCES_CHANGED');
  const release = validateNativeValueDevReleaseV5({ ...original, sourceFiles,
    publicMobilePackagesSHA256: NATIVE_VALUE_DEV_MOBILE_PACKAGES_SHA256_V5,
    hostSourceClosureSHA256: nativeValueDevDigestV5(sourceFiles) });
  return frozenInput({ schema: 'LIANUM_DEVELOPMENT_RELEASE_CANDIDATE_V6',
    priorPublicationSHA256: nativeValueDevDigestV5(original), release, reuseReceipt: inspection.reuseReceipt,
    verifiedArtifactRoles: inspection.verifierRoles, published: false, compiledNow: false,
    artifactBundleIssued: false, financialAcceptance: false });
}
