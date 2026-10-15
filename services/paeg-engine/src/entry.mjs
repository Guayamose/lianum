/** Private engine startup profiles; remote requests never select a runtime. */
import { enablePlatformDiagnostics, platformDiagnostic } from '@lianum/backend/transport/platform-diagnostics';

const profiles = ['paged-native-new', 'paged-native-reopen', 'paged-mixed-new', 'paged-mixed-reopen', 'defi-new'];
const profile = process.argv[2];
if (process.argv.length !== 3 || !profiles.includes(profile)) {
  process.stderr.write('PAGED_PLATFORM_PROFILE_INVALID: ' + profiles.join(' | ') + '\n');
  process.exitCode = 1;
} else {
  enablePlatformDiagnostics();
  try {
    if (profile === 'defi-new') await (await import('./bootstrap/device-defi-local-bootstrap-v1.mjs')).runOriginalDeviceDefiProfileV1(profile);
    else await (await import('./bootstrap/paged-native-bootstrap-v3.mjs')).runOriginalPagedNativeProfileV3(profile);
  } catch {
    platformDiagnostic('SERVICE_START_FAILED');
    process.stderr.write('PLATFORM_START_FAILED: check the selected profile and its retained local configuration\n');
    process.exitCode = 1;
  }
}
