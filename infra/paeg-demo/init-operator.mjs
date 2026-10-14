/** Server-side NEW demo setup. Device PUBLIC identity only; no wallet import. */
import assert from 'node:assert/strict';
import {constants} from 'node:fs';
import {mkdir,lstat,realpath,open,readFile,rm,mkdtemp,chmod} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {createHash,createPublicKey,generateKeyPairSync,randomBytes,ECDH,X509Certificate} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const run=promisify(execFile),state='/var/lib/lianum-paeg/realm-parent/realm';
const root=resolve(fileURLToPath(new URL('../candidate/',import.meta.url)));
const [publicKey]=process.argv.slice(2);
assert.equal(process.argv.length,3,'PAEG_REMOTE_SETUP_ARGUMENTS');
assert.equal(process.platform,'linux');assert.equal(process.arch,'x64');assert.ok(process.getuid()>0,'PAEG_REMOTE_UNPRIVILEGED_REQUIRED');
assert.deepEqual(process.execArgv,['--max-old-space-size=384']);
assert.match(publicKey,/^04[0-9a-f]{128}$/,'PAEG_REMOTE_PUBLIC_IDENTITY');ECDH.convertKey(Buffer.from(publicKey,'hex'),'secp256k1');
const original=path=>import(pathToFileURL(join(root,path)).href),sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const {assertOriginalPagedNativeFinancialSourceV3}=await original('packages/backend/src/operations/local/funded-paged-native-source-v3.mjs');
const {PAEG_PAGED_ARTIFACT_DIRECTORY_V3}=await original('packages/proofs/src/toolchain/paged-artifacts-v3.mjs');
const {assertFundedPagedLocalDeploymentArtifactsV3}=await original('packages/backend/src/operations/local/funded-graph-paged-deployment-v3.mjs');
const {normalizePrivatePagedNativeStartupV3}=await original('apps/platform/src/paged-native-bootstrap-v3.mjs');
// Guard Original source/artifacts BEFORE creating TLS/password or private state.
const source=assertOriginalPagedNativeFinancialSourceV3(),consumer=await readFile(join(PAEG_PAGED_ARTIFACT_DIRECTORY_V3,'consumer.json'));
const pins=assertFundedPagedLocalDeploymentArtifactsV3(source.pagedManifestSHA256,sha(consumer));consumer.fill(0);
await lstat(state).then(()=>{throw Error('PAEG_REMOTE_EXISTING_STATE_NOT_REPLACED');},error=>{if(error.code!=='ENOENT')throw error;});
await mkdir(state,{mode:0o700});
const parent=await lstat(state);assert.ok(parent.isDirectory()&&!parent.isSymbolicLink()&&parent.uid===process.getuid()&&(parent.mode&0o777)===0o700&&await realpath(state)===state,'PAEG_REMOTE_PRIVATE_DIRECTORY');
async function writeExclusive(name,bytes){
 const fd=await open(join(state,name),constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
 try{await fd.writeFile(bytes);await fd.sync();const s=await fd.stat();assert.ok(s.isFile()&&s.nlink===1&&s.uid===process.getuid()&&(s.mode&0o777)===0o600);}finally{bytes.fill(0);await fd.close();}
 const directory=await open(state,constants.O_RDONLY|constants.O_DIRECTORY);try{await directory.sync();}finally{await directory.close();}
}
const temporary=await mkdtemp(join(state,'.tls-'));let config,privateKey;
try{
 const pair=generateKeyPairSync('ec',{namedCurve:'prime256v1'});privateKey=pair.privateKey.export({type:'pkcs8',format:'pem'});
 const key=await open(join(temporary,'key.pem'),constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
 try{await key.writeFile(privateKey);await key.sync();}finally{await key.close();}
 await run('/usr/bin/openssl',['req','-new','-x509','-key',join(temporary,'key.pem'),'-out',join(temporary,'certificate.pem'),'-days','1','-subj','/CN=127.0.0.1','-addext','subjectAltName=IP:127.0.0.1','-addext','basicConstraints=critical,CA:FALSE','-addext','keyUsage=critical,digitalSignature','-addext','extendedKeyUsage=serverAuth'],{timeout:15000,maxBuffer:8192});
 await chmod(join(temporary,'certificate.pem'),0o600);const certificatePEM=await readFile(join(temporary,'certificate.pem'),'utf8'),certificate=new X509Certificate(certificatePEM);
 assert.ok(certificate.checkIP('127.0.0.1')&&!certificate.ca);assert.ok(certificate.publicKey.export({type:'spki',format:'der'}).equals(createPublicKey(pair.privateKey).export({type:'spki',format:'der'})));
 const freshDigest=()=>{let bytes;do{bytes=randomBytes(32);}while(bytes.every(value=>value===0));try{return'0x'+bytes.toString('hex');}finally{bytes.fill(0);}};
 const passwordBytes=randomBytes(48);let password;try{password=passwordBytes.toString('base64url');}finally{passwordBytes.fill(0);}
 config={deployment:{minimumDepositAtomic:'100',manifestSHA256:pins.manifestSHA256,consumerSHA256:pins.consumerSHA256,deploymentDomain:freshDigest(),policy:freshDigest()},journal:{path:join(state,'authority/journal.vault'),password},nativeDirectory:join(state,'native'),origin:'https://127.0.0.1:9445',devicePublicKey:publicKey,tls:{key:privateKey,cert:certificatePEM},host:'127.0.0.1'};
 const checked=normalizePrivatePagedNativeStartupV3(config,state);try{await writeExclusive('operator.json',Buffer.from(JSON.stringify(checked)+'\n'));}finally{checked.tls.key=null;checked.journal.password=null;}
 await writeExclusive('operator-certificate.pem',Buffer.from(certificatePEM));
 process.stdout.write(JSON.stringify({profile:'PAEG_REMOTE_NEW_LOCAL_DEMO_STAGING_V1',stateRoot:state,origin:config.origin,devicePublicKey:publicKey,certificateSHA256:sha(certificate.raw),sourceGeneration:source.generation,automaticFunding:false,publicMobileIngressReady:false,privateKeysGeneratedOnServer:true})+'\n');
}finally{privateKey=null;if(config){config.tls.key=null;config.journal.password=null;}await rm(temporary,{recursive:true,force:false});}
