/** Same entry for npm, local Docker and the original economic composition.
 * Profiles are fixed private startup choices, never HTTP request fields. */
import { enablePlatformDiagnostics, platformDiagnostic } from './diagnostics.mjs';

const profiles = Object.freeze(['admission', 'original-native-new', 'original-native-reopen']);
const profile = process.argv[2] ?? 'admission';
if (process.argv.length > 3 || !profiles.includes(profile)) {
  process.stderr.write('PLATFORM_PROFILE_INVALID: admission | original-native-new | original-native-reopen\n');
  process.exitCode = 1;
} else {
  enablePlatformDiagnostics();
  try {
    if (profile === 'admission') await import('./run.mjs');
    else await (await import('./original-gateway-bootstrap.mjs')).runOriginalGatewayProfile(profile);
  } catch {
    platformDiagnostic('SERVICE_START_FAILED');
    process.stderr.write('PLATFORM_START_FAILED: check the selected profile and its retained local configuration\n');
    process.exitCode = 1;
  }
}
