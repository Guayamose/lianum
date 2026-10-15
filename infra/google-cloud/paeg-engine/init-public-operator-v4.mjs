/** NEW public operator configuration. Existing protected provider keys stay put. */
import assert from 'node:assert/strict';
import {lstat,readFile,mkdtemp,readdir,rename,open,rm} from 'node:fs/promises';
import {constants} from 'node:fs';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash,ECDH,randomBytes} from 'node:crypto';
import {PUBLIC_OPERATOR_STATE_V4,PUBLIC_NATIVE_DIRECTORY_V4,PUBLIC_TRANSPORT_DIRECTORY_V4,assertPrivateOperatorDirectoryV4,readPrivateOperatorFileV4,writePrivateOperatorFileV4} from '../../../services/paeg-engine/src/public/public-operator-state-v4.mjs';
import {buildNewSourceSponsorPolicyDataV4,PUBLIC_SOURCE_MINIMUM_ATOMIC_V4} from './source-sponsor-policy-data-v4.mjs';

assert.ok([3,4].includes(process.argv.length));assert.equal(process.platform,'linux');assert.equal(process.arch,'x64');assert.ok(process.getuid()>0);
assert.deepEqual(process.execArgv,['--max-old-space-size=384']);assert.equal(process.env.NODE_OPTIONS,undefined);assert.equal(process.env.NODE_PATH,undefined);
const [devicePublicKey,phoneDevicePublicKey]=process.argv.slice(2);assert.match(devicePublicKey,/^04[0-9a-f]{128}$/);ECDH.convertKey(Buffer.from(devicePublicKey,'hex'),'secp256k1');
if(phoneDevicePublicKey!==undefined){assert.match(phoneDevicePublicKey,/^04[0-9a-f]{128}$/);ECDH.convertKey(Buffer.from(phoneDevicePublicKey,'hex'),'secp256k1');assert.notEqual(phoneDevicePublicKey,devicePublicKey,'PAEG_PUBLIC_HOST_PHONE_IDENTITIES');}
const root=resolve(fileURLToPath(new URL('../candidate/',import.meta.url))),original=path=>import(pathToFileURL(join(root,path)).href);
const {assertOriginalPagedNativeFinancialSourceV3}=await original('packages/backend/src/operations/local/funded-paged-native-source-v3.mjs');
const {PAEG_PAGED_ARTIFACT_DIRECTORY_V3}=await original('packages/proofs/src/toolchain/paged-artifacts-v3.mjs');
const {assertFundedPagedLocalDeploymentArtifactsV3}=await original('packages/backend/src/operations/local/funded-graph-paged-deployment-v3.mjs');
const {openPublicPagedServerKeysV1,readPublicPagedServerAccountsV1,closePublicPagedServerKeysV1}=await original('packages/backend/src/chains/public-testnet/key-store-v1.mjs');
const source=assertOriginalPagedNativeFinancialSourceV3(),consumer=await readFile(join(PAEG_PAGED_ARTIFACT_DIRECTORY_V3,'consumer.json'));
let pins;try{pins=assertFundedPagedLocalDeploymentArtifactsV3(source.pagedManifestSHA256,createHash('sha256').update(consumer).digest('hex'));}finally{consumer.fill(0);}
await assertPrivateOperatorDirectoryV4(PUBLIC_NATIVE_DIRECTORY_V4);
const keys=await openPublicPagedServerKeysV1(join(PUBLIC_NATIVE_DIRECTORY_V4,'keys'));
let accounts;try{accounts=readPublicPagedServerAccountsV1(keys);}finally{closePublicPagedServerKeysV1(keys);}
assert.deepEqual(accounts.accounts.map(account=>account.networkId),['ethereum-sepolia','bitcoin-testnet','solana-devnet']);
// Validate existing transport files; no new private key is generated here.
for(const name of ['server-key.pem','server-certificate.pem','public-api-certificate.pem']){const bytes=await readPrivateOperatorFileV4(PUBLIC_TRANSPORT_DIRECTORY_V4,name);bytes.fill(0);}
// A previous interrupted initializer may have left an empty private directory.
// A configuration, attempt marker or any runtime file forbids NEW birth.
try{await assertPrivateOperatorDirectoryV4(PUBLIC_OPERATOR_STATE_V4);assert.equal((await readdir(PUBLIC_OPERATOR_STATE_V4)).length,0,'PAEG_PUBLIC_EXISTING_STATE_NOT_REPLACED');}catch(error){if(error.code!=='ENOENT')throw error;}
const parentDirectory=dirname(PUBLIC_OPERATOR_STATE_V4);await assertPrivateOperatorDirectoryV4(parentDirectory);
const digest=()=>{const bytes=randomBytes(32);try{return'0x'+bytes.toString('hex');}finally{bytes.fill(0);}};
const passwordBytes=randomBytes(48);let password;try{password=passwordBytes.toString('base64url');}finally{passwordBytes.fill(0);}
const now=Date.now();assert.ok(Number.isSafeInteger(now+9*60*60*1000));
const policyData=buildNewSourceSponsorPolicyDataV4(accounts,now);
const config={nativeDirectory:PUBLIC_NATIVE_DIRECTORY_V4,providerDirectory:join(PUBLIC_OPERATOR_STATE_V4,'provider'),supervisorDirectory:join(PUBLIC_OPERATOR_STATE_V4,'supervisor'),journal:{path:join(PUBLIC_OPERATOR_STATE_V4,'authority','journal.vault'),password},devicePublicKey,
 deployment:{manifestSHA256:pins.manifestSHA256,consumerSHA256:pins.consumerSHA256,deploymentDomain:digest(),policy:digest(),minimumDepositAtomic:PUBLIC_SOURCE_MINIMUM_ATOMIC_V4},
 networkConfiguration:{networks:[{id:'ethereum-sepolia',endpoint:'https://sepolia.drpc.org'},{id:'bitcoin-testnet',endpoint:'https://mempool.space/testnet/api',feeProvider:'MEMPOOL'},{id:'solana-devnet',endpoint:'https://api.devnet.solana.com'}]},
 bootstrapApproval:{maximumTotalFeeAtomic:'30000000000000000',expiresAt:now+60*60*1000},
 sourcePolicy:Object.fromEntries(['maximumFeePerTransactionAtomic','maximumTotalFeeAtomic','maximumValuePerTransactionAtomic','maximumTotalValueAtomic','expiresAt'].map(key=>[key,policyData[key]]))};
// Publish the whole NEW directory after its config has been flushed. A crash
// leaves either no live config or the complete one, never a partial password.
const staging=await mkdtemp(join(parentDirectory,'.paeg-public-v4-init-'));let published=false;
const bytes=Buffer.from(JSON.stringify(config)+'\n');
try{
 await writePrivateOperatorFileV4(staging,'operator.json',bytes);
 if(phoneDevicePublicKey!==undefined){
  const request=Buffer.from(JSON.stringify({journalPath:join(PUBLIC_OPERATOR_STATE_V4,'authority-phone','journal.vault'),devicePublicKey:phoneDevicePublicKey,minimumDepositAtomic:PUBLIC_SOURCE_MINIMUM_ATOMIC_V4})+'\n');
  try{await writePrivateOperatorFileV4(staging,'phone-source-request.json',request);}finally{request.fill(0);}
 }
 await rename(staging,PUBLIC_OPERATOR_STATE_V4);published=true;
 const parent=await open(parentDirectory,constants.O_RDONLY|constants.O_DIRECTORY);try{await parent.sync();}finally{await parent.close();}
}finally{bytes.fill(0);config.journal.password=null;password=null;if(!published)await rm(staging,{recursive:true,force:false});}
process.stdout.write(JSON.stringify({profile:'PAEG_PUBLIC_NEW_OPERATOR_CONFIGURATION_V4',stateRoot:PUBLIC_OPERATOR_STATE_V4,devicePublicKey,phoneSourceRequested:phoneDevicePublicKey!==undefined,keysetId:accounts.keysetId,sourceGeneration:source.generation,existingServerKeysPreserved:true,transactionsBroadcast:0,publicReceiverStarted:false,automaticFunding:false})+'\n');
