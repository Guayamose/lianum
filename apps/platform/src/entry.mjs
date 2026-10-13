/** Same entry for npm, local Docker and the original economic composition.
 * Profiles are fixed private startup choices, never HTTP request fields. */
import { enablePlatformDiagnostics, platformDiagnostic } from './diagnostics.mjs';

const profiles = Object.freeze(['admission', 'original-native-new', 'original-native-reopen', 'paged-native-new', 'paged-native-reopen', 'paged-mixed-new', 'paged-mixed-reopen', 'defi-new']);
const profile = process.argv[2] ?? 'admission';
if (process.argv.length > 3 || !profiles.includes(profile)) {
    process.stderr.write('PLATFORM_PROFILE_INVALID: admission | original-native-new | original-native-reopen | paged-native-new | paged-native-reopen | paged-mixed-new | paged-mixed-reopen | defi-new\n');
  process.exitCode = 1;
} else {
  enablePlatformDiagnostics();
  try {
    if (profile === 'admission') await import('./run.mjs');
    else if (profile === 'defi-new') await (await import('./device-defi-local-bootstrap-v1.mjs')).runOriginalDeviceDefiProfileV1(profile);
    else if (profile === 'paged-native-new' || profile === 'paged-native-reopen' || profile === 'paged-mixed-new' || profile === 'paged-mixed-reopen') await (await import('./paged-native-bootstrap-v3.mjs')).runOriginalPagedNativeProfileV3(profile);
    else await (await import('./original-gateway-bootstrap.mjs')).runOriginalGatewayProfile(profile);
  } catch {
    platformDiagnostic('SERVICE_START_FAILED');
    process.stderr.write('PLATFORM_START_FAILED: check the selected profile and its retained local configuration\n');
    process.exitCode = 1;
  }
}
