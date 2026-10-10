/** Fixed original runtime closure plus physically retained mobile/driver code.
 * Pins are DATA; only the original before-fund factories issue authorities. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,lstatSync,realpathSync,existsSync} from 'node:fs';
import {createRequire} from 'node:module';
import {join,resolve,dirname,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {developmentNativeClaimSourcePins} from '../../../.internal/runtime/omnichain-flat-profile/flat-wallet/integration/claims/development/development-native-claim-source-pins.mjs';
const PROJECT=fileURLToPath(new URL('../../../',import.meta.url));
const DRIVER=join(PROJECT,'scripts/validation/device-root-native-claim-v3'),MOBILE=join(PROJECT,'apps/mobile/src');
const EXPLICIT=['local-root-note-vault-v1.ts','signing.mjs','sealed-custody-backup-v1.mjs','key-store.ts'];
function pin(path){const before=lstatSync(path);assert.ok(before.isFile()&&!before.isSymbolicLink()&&realpathSync(path)===path&&before.size<=2*1024*1024,'DEVICE_ROOT_SOURCE_FILE_REQUIRED');const raw=readFileSync(path),after=lstatSync(path);for(const k of ['dev','ino','mode','uid','gid','nlink','size','mtimeMs','ctimeMs'])assert.equal(after[k],before[k],'DEVICE_ROOT_SOURCE_CHANGED');return{path:relative(PROJECT,path),bytes:raw.length,sha256:createHash('sha256').update(raw).digest('hex')};}
export function sourcePins(){
 assert.equal(arguments.length,0);const original=developmentNativeClaimSourcePins();const paths=new Set(['run-btc.mjs','flow.mjs','mobile-host.mjs','policy.mjs','source-pins.mjs'].map(n=>join(DRIVER,n)));
 for(const n of ['integration/device-owner-reservation-host-vault-v1.mjs','integration/native-device-economic-private-error-v1.mjs','wallet-platform/modules/api/native-claim-http.mjs'])paths.add(join(PROJECT,'.internal/runtime/omnichain-flat-profile/flat-wallet',n));
 for(const n of EXPLICIT)paths.add(join(MOBILE,'custody',n));paths.add(join(MOBILE,'api/native-claim-device-api-v1.mjs'));
 // These are finite before-fund SDK/Vault dependencies, not request-selected
 // imports. Original runtime/backend/prover closure is validated above.
 for(const n of ['device-owner-deposit-api-v1.ts','device-owner-reservation-api-v1.ts','device-owner-execution-api-v1.ts','device-owner-exit-api-v1.ts','device-owner-output-balance-api-v1.ts','native-private-deposit-transit-v2.mjs','native-private-reservation-transit-v2.mjs','native-private-exit-transit-v2.mjs','device-private-proof-transit-v2.mjs','device-private-graph-proof-transit-v2.mjs'])paths.add(join(MOBILE,'api',n));
 for(const n of ['authorization.mjs','original-account-review-v2.mjs','native-claim-device-v1.mjs','original-wallet-economic-state-v1.mjs','device-native-private-deposit-v2.mjs','device-native-private-reservation-v2.mjs','device-native-private-exit-v2.mjs','device-external-flat-note-v1.mjs','device-external-flat-graph-v1.mjs','device-recovery-arm-consent-v1.mjs','device-defi-position-read-v1.mjs','device-morpho-blue-redemption-v1.mjs'])paths.add(join(PROJECT,'packages/mobile-protocol/src',n));
 const vendor=new Set(),require=createRequire(join(PROJECT,'apps/mobile/package.json'));
 const visit=path=>{path=realpathSync(path);if(vendor.has(path))return;vendor.add(path);const text=readFileSync(path,'utf8');
  const names=new Set();for(const m of text.matchAll(/\b(?:import|export)\s+(?:[^;'"]*?\s+from\s*)?(['"])([^'"]+)\1/g))names.add(m[2]);for(const m of text.matchAll(/\bimport\s*\(\s*(['"])([^'"]+)\1\s*\)/g))names.add(m[2]);
  for(const name of names){if(name.startsWith('node:')||['expo-secure-store','expo-local-authentication','expo-crypto','react-native','expo/fetch'].includes(name))continue;
   if(name.startsWith('@noble/')){visit(require.resolve(name));continue;}
   if(name==='@lianum/mobile-protocol'){visit(join(PROJECT,'packages/mobile-protocol/src/authorization.mjs'));continue;}
   if(name==='@lianum/mobile-protocol/original-account-v2'){visit(join(PROJECT,'packages/mobile-protocol/src/original-account-review-v2.mjs'));continue;}
   assert.ok(name.startsWith('.'),'DEVICE_ROOT_SOURCE_UNREVIEWED_IMPORT');const base=resolve(dirname(path),name),candidate=[base,base+'.ts',base+'.mjs',base+'.js'].find(p=>existsSync(p)&&lstatSync(p).isFile());assert.ok(candidate,'DEVICE_ROOT_SOURCE_IMPORT_MISSING');visit(candidate);
  }
 };
 // Traverse only these finite original mobile entrypoints. SDK/RootNote never
 // import the native backend or receive its custody keys.
 for(const path of paths)if(path.startsWith(MOBILE+'/'))visit(path);
 return{profile:'device-root-btc-original-note-exit-v3',original,mobileAndDriver:[...new Set([...paths,...vendor])].map(pin).sort((a,b)=>a.path.localeCompare(b.path))};
}
