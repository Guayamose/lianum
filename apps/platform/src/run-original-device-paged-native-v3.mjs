/** Compatibility CLI for the fixed LOCAL Paged native product. */
import {enablePlatformDiagnostics,platformDiagnostic} from './diagnostics.mjs';
import {runOriginalPagedNativeProfileV3} from './paged-native-bootstrap-v3.mjs';
enablePlatformDiagnostics();
try{await runOriginalPagedNativeProfileV3('paged-native-new');}
catch{platformDiagnostic('SERVICE_START_FAILED');process.exitCode=1;process.stderr.write('PAGED_NATIVE_LOCAL_SERVICE_START_FAILED\n');}
