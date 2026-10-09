/** Exact before/after original producer and software-mobile source closure.
 * Public hashes never mint an account, a mobile key or a proof capability. */
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {constants,openSync,closeSync,fstatSync,readFileSync,lstatSync,realpathSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {ROOT,FLAT} from '../../../../packages/proofs/src/catalog.mjs';
import {nativeValueDevFinancialSourcePinsV5} from '../../../../packages/backend/src/operations/releases/native-value/native-value-dev-financial-source-pins-v5.mjs';
const DEVELOPMENT=resolve(FLAT,'../../..');
const RUNNER=Object.freeze(['integration/run-device-external-flat-erc20-v1.mjs','integration/device-external-flat-erc20-flow-v1.mjs','integration/device-external-flat-erc20-host-vault-v1.mjs','integration/device-external-flat-erc20-policy-v1.mjs','integration/device-external-flat-erc20-source-pins-v1.mjs','integration/native-flow-supervisor.mjs']);
const PRODUCERS=Object.freeze(['wallet-platform/modules/global-state/device-external-flat-note-authority-v1.mjs','wallet-platform/modules/operations/local/device-external-flat-note-service-v1.mjs','wallet-platform/modules/mobile/device-external-flat-note-http-v1.mjs','wallet-platform/modules/chain-adapters/owned-evm-v2-runtime.mjs']);
// Final literal hashes are sealed with the producer/SDK READY dependencies.
const MOBILE=Object.freeze([
 [
  "apps/mobile/src/api/device-external-flat-note-api-v1.mjs",
  "b7ed153b86162aacb619b35a685d287d80078ba98639fec8c7de6c420aa1598b"
 ],
 [
  "apps/mobile/src/custody/balance-note-codec-v1.mjs",
  "b7f3ff3002aac96d8709a6239775699dada2940db69d5953427cfefeae07adf0"
 ],
 [
  "apps/mobile/src/custody/device-balance-withdrawal-codec-v1.mjs",
  "0462528c731d9fa20a616a67113aca9e5495b2b8db3441a123878fe184aa30ff"
 ],
 [
  "apps/mobile/src/custody/device-external-flat-note-vault-v1.ts",
  "aceb398bf2580c863eb3dfebe830b535f56770350aece7580c65bd47f57a5a69"
 ],
 [
  "apps/mobile/src/custody/funded-balance-owner-codec-v1.mjs",
  "7fd2ff7aed52f5344d23bb6caa891ad0944b6a40f6779415c587a5e628f796b2"
 ],
 [
  "apps/mobile/src/custody/key-store.ts",
  "95a171280083eb4a2eb648259f780607e0c29b3131651869f62370bcb16ef375"
 ],
 [
  "apps/mobile/src/custody/signing.mjs",
  "418918006042ed03b68799bd0a5de874e5c40613ee3e75851cfd5d22c748f552"
 ],
 [
  "packages/backend/src/accounts/authority/device-external-flat-note-authority-v1.mjs",
  "f690ad5b68bc562eff71772e2d406b8f2947b13532b70ec6df8839f083cc026f"
 ],
 [
  "packages/backend/src/api/mobile/device-external-flat-note-http-v1.mjs",
  "23f39fe2ff6294ed86e3066c490141d16a7842e39febbf2eaee1686faeeab717"
 ],
 [
  "packages/backend/src/chains/evm/runtime/owned-evm-v2-runtime.mjs",
  "cb3953ed3755c163b7950760c31d9ce08d1ff16a19dcb2d77cf115c719f7b3b2"
 ],
 [
  "packages/backend/src/operations/local/device-external-flat-note-service-v1.mjs",
  "4b9db200f7abda5df4bba642fc9a2e9b6e2c8459787ff00ce37e9c4739451f52"
 ],
 [
  "packages/mobile-protocol/src/authorization.mjs",
  "5f5667d70df7140ca2236ada629302c7b2d1a5b6ce9649bdd93ffff3146d7eff"
 ],
 [
  "packages/mobile-protocol/src/device-defi-position-read-v1.mjs",
  "433ec94eda55d031b8d32f009d66a3c2a4d22431cd8729b26ff50711ec5147f4"
 ],
 [
  "packages/mobile-protocol/src/device-deposit-consent-v1.mjs",
  "faf88916e086e59dc9e1a8b88712d37022926163bfed893d026712bd5c67664f"
 ],
 [
  "packages/mobile-protocol/src/device-execution-consent-v1.mjs",
  "c0d505205dfa8fd6db743bb56e8da7b2baee6e6078a69bb04c10d2ccb2f7391b"
 ],
 [
  "packages/mobile-protocol/src/device-exit-consent-v1.mjs",
  "1890b18030436f0f6f7d236b1450f68edc85a310dd875cfeced05eebb85b9a25"
 ],
 [
  "packages/mobile-protocol/src/device-external-flat-note-v1.mjs",
  "0c96de4b183e341abb980e87b07a54cb80954a937a48e33b009b41a83538516b"
 ],
 [
  "packages/mobile-protocol/src/device-recovery-arm-consent-v1.mjs",
  "732be142c1a5c44ea2e7a8074d954eb1bcd3aa93bdcbcfa5796928561cd62c9c"
 ],
 [
  "packages/mobile-protocol/src/device-reservation-consent-v1.mjs",
  "4f21af5bebccc73e5418a5cdbb858ca8b3334f02f1380d8b84f263eb3f4b21d9"
 ],
 [
  "packages/mobile-protocol/src/original-account-private-state-v1.mjs",
  "1df07ff6ec361ed2c21f0a5dcc05398327eb97ccf60d3a9ab2225b670805efb6"
 ],
 [
  "packages/mobile-protocol/src/original-account-review-v2.mjs",
  "f23d26cfb8a0c7b6f06f9056efb638365420290946f29fc1515f7b3aec04ecfa"
 ]
]);
function pin(base,name,expected){assert.equal(realpathSync(base),base);let path=base;for(const part of name.split('/')){assert.ok(part&&part!=='.'&&part!=='..');path=join(path,part);assert.equal(lstatSync(path).isSymbolicLink(),false);}
 assert.equal(realpathSync(path),path);const fd=openSync(path,constants.O_RDONLY|constants.O_NOFOLLOW);let bytes;
 try{const before=fstatSync(fd);assert.ok(before.isFile()&&before.uid===process.getuid()&&before.nlink===1&&before.size>0&&before.size<=1048576);bytes=readFileSync(fd);const after=fstatSync(fd),named=lstatSync(path);
  for(const key of ['dev','ino','uid','nlink','size','mtimeMs','ctimeMs']){assert.equal(before[key],after[key]);assert.equal(before[key],named[key]);}assert.equal(bytes.length,before.size);
 }finally{closeSync(fd);}const sha256=createHash('sha256').update(bytes).digest('hex');if(expected!==undefined)assert.equal(sha256,expected,'DEVICE_EXTERNAL_FLAT_ORIGINAL_MOBILE_SOURCE');return{path:name,bytes:bytes.length,sha256};}
export function deviceExternalFlatErc20SourcePinsV1(){assert.equal(arguments.length,0,'DEVICE_EXTERNAL_FLAT_SOURCE_NO_OPTIONS');
 return{format:'LIANUM_DEVICE_EXTERNAL_FLAT_ERC20_SOURCE_CAPSULE_V1',financialCurrent:nativeValueDevFinancialSourcePinsV5(),originalProducers:PRODUCERS.map(name=>pin(ROOT,name)),originalRunner:RUNNER.map(name=>pin(ROOT,name)),originalMobile:MOBILE.map(([name,digest])=>pin(DEVELOPMENT,name,digest))};}
