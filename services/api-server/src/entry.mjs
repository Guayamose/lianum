/** Same entry for npm, local Docker and the original economic composition.
 * Profiles are fixed private startup choices, never HTTP request fields. */
import { enablePlatformDiagnostics, platformDiagnostic } from '@lianum/backend/transport/platform-diagnostics';

const profiles = Object.freeze(['public-wallet', 'admission', 'original-native-new', 'original-native-reopen']);
const profile = process.argv[2] ?? 'public-wallet';
if (process.argv.length > 3 || !profiles.includes(profile)) {
    process.stderr.write('PLATFORM_PROFILE_INVALID: public-wallet | admission | original-native-new | original-native-reopen\n');
  process.exitCode = 1;
} else {
  enablePlatformDiagnostics();
  try {
    if (profile === 'public-wallet') await import('./wallet-entry.mjs');
    else if (profile === 'admission') await import('./admission/run.mjs');
    else await (await import('./original/original-gateway-bootstrap.mjs')).runOriginalGatewayProfile(profile);
  } catch {
    platformDiagnostic('SERVICE_START_FAILED');
    process.stderr.write('PLATFORM_START_FAILED: check the selected profile and its retained local configuration\n');
    process.exitCode = 1;
  }
}
