/** Fixed NEW ledger compilation only. No CLI options/source maps/callbacks, no
 * verifier regeneration, node, proof, historical receipt or automatic release.
 * It writes only the reviewed new namespace, never the missing historical path. */
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, writeFileSync, realpathSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { ROOT } from '../../../packages/proofs/src/catalog.mjs';
import { regular, hash, jsonBytes } from '../../../packages/proofs/src/tooling/tooling.mjs';
import { compileSoliditySources } from '../../../packages/proofs/src/tooling/solidity-compiler.mjs';
import { NATIVE_VALUE_LEDGER_SOURCES, NATIVE_VALUE_LEDGER_ROLES, validateNativeValueDevLedgerCompilationV5, inspectProducedNativeValueLedgerV5 }
  from '../../../packages/backend/src/operations/deployments/native-value/native-value-deployment-artifacts-v2.mjs';
import { nativeValueDevRetainedMetadataV5, nativeValueDevDigestV5, NATIVE_VALUE_DEV_LEDGER_COMPILED_PATH_V5,
  NATIVE_VALUE_DEV_LEDGER_RECEIPT_PATH_V5, NATIVE_VALUE_DEV_LEDGER_KIND_V5 }
  from '../../../packages/backend/src/operations/releases/native-value/native-value-dev-release-contract-v5.mjs';
assert.equal(process.argv.length,2,'NATIVE_VALUE_DEV_LEDGER_FIXED_INVOCATION');
assert.deepEqual(process.execArgv,[],'NATIVE_VALUE_DEV_LEDGER_NO_EXEC_ARGUMENTS');
assert.equal(realpathSync(process.cwd()),ROOT,'NATIVE_VALUE_DEV_LEDGER_FIXED_CWD');
const compiledPath=join(ROOT,NATIVE_VALUE_DEV_LEDGER_COMPILED_PATH_V5),receiptPath=join(ROOT,NATIVE_VALUE_DEV_LEDGER_RECEIPT_PATH_V5);
assert.ok(!existsSync(compiledPath)&&!existsSync(receiptPath),'NATIVE_VALUE_DEV_LEDGER_EXISTING_ATTEMPT_RETAINED');
const original=nativeValueDevRetainedMetadataV5(),sourceMap={};
for(const name of NATIVE_VALUE_LEDGER_SOURCES){
  const bytes=regular(join(ROOT,'contracts',name)),expected=original.ledger.sources[name].sourceSHA256;
  assert.equal(hash(bytes),expected,'NATIVE_VALUE_DEV_LEDGER_ORIGINAL_SOURCE_PIN');sourceMap[name]={content:bytes.toString('utf8'),sha256:expected};
}
// This exact existing compiler seam verifies package/lock/soljson/version and
// uses Standard JSON with callback=0/context=0 and profile standard (Cancun).
const {milliseconds,...compiled}=compileSoliditySources(sourceMap,{profile:'standard'});
validateNativeValueDevLedgerCompilationV5(compiled);
for(const name of NATIVE_VALUE_LEDGER_SOURCES)assert.equal(hash(regular(join(ROOT,'contracts',name))),sourceMap[name].sha256,'NATIVE_VALUE_DEV_LEDGER_SOURCE_CHANGED');
const compiledBytes=jsonBytes(compiled),compiledSHA256=hash(compiledBytes);
const sources=Object.fromEntries(Object.entries(sourceMap).map(([name,row])=>[name,{content:row.content}]));
const receipt={schema:'LIANUM_NEW_NATIVE_VALUE_LEDGER_BUILD_V5',classification:NATIVE_VALUE_DEV_LEDGER_KIND_V5,phase:'completed',
  compiler:compiled.compiler,settingsSHA256:nativeValueDevDigestV5(compiled.settings),
  inputSHA256:nativeValueDevDigestV5({language:'Solidity',sources,settings:compiled.settings}),compiledSHA256,
  sources:Object.entries(original.ledger.sources).map(([name,p])=>({name,sha256:p.sourceSHA256})),
  sourceASTSHA256:Object.fromEntries(Object.entries(compiled.sourceASTs).map(([name,ast])=>[name,nativeValueDevDigestV5(ast)])),
  artifactSHA256:Object.fromEntries(Object.entries(NATIVE_VALUE_LEDGER_ROLES).map(([role,[source,name]])=>[role,nativeValueDevDigestV5(compiled.contracts[source][name])])),historicalCompiled:original.ledger.compiled,
  historicalArtifactRecovered:false,ledgerSourcesUnchanged:true,nativeNodesStarted:false,proofGenerated:false};
let ancestor=dirname(compiledPath);while(!existsSync(ancestor))ancestor=dirname(ancestor);
assert.equal(realpathSync(ancestor),ancestor,'NATIVE_VALUE_DEV_LEDGER_OUTPUT_SYMLINK');
mkdirSync(dirname(compiledPath),{recursive:true,mode:0o700});
writeFileSync(compiledPath,compiledBytes,{flag:'wx',mode:0o600});
writeFileSync(receiptPath,jsonBytes(receipt),{flag:'wx',mode:0o600});
const observed=inspectProducedNativeValueLedgerV5();
console.log(JSON.stringify({compiledSHA256,receiptSHA256:observed.receipt.sha256,
  historicalArtifactRecovered:false,nativeNodesStarted:false,proofGenerated:false,ledgerSourcesUnchanged:true}));
