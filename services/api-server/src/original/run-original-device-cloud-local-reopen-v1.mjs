/** Compatibility CLI for the fixed original local profile. */
import { enablePlatformDiagnostics, platformDiagnostic } from '@lianum/backend/transport/platform-diagnostics';
import { runOriginalGatewayProfile } from './original-gateway-bootstrap.mjs';
enablePlatformDiagnostics();
try { await runOriginalGatewayProfile('original-native-reopen'); }
catch { platformDiagnostic('SERVICE_START_FAILED'); process.exitCode = 1; process.stderr.write('PLATFORM_ORIGINAL_GATEWAY_START_FAILED\n'); }
