/** One-time LOCAL setup DATA only. No device private key, note or proof enters.
 * Existing product state is never replaced, repaired or economically reopened. */
import assert from 'node:assert/strict';
import {constants} from 'node:fs';
import {mkdir,mkdtemp,lstat,realpath,open,readFile,rm,chmod} from 'node:fs/promises';
import {join,resolve,dirname} from 'node:path';
import {networkInterfaces} from 'node:os';
import {isIP} from 'node:net';
import {createHash,generateKeyPairSync,randomBytes,ECDH,X509Certificate,createPublicKey} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createInterface} from 'node:readline/promises';
import {fileURLToPath} from 'node:url';
import {assertOriginalPagedNativeFinancialSourceV3} from '@lianum/backend/operations/local/funded-paged-native-source-v3';
import {assertFundedPagedLocalDeploymentArtifactsV3} from '@lianum/backend/operations/local/funded-graph-paged-deployment-v3';
import {PAEG_PAGED_ARTIFACT_DIRECTORY_V3} from '@lianum/proofs/toolchain/paged-artifacts-v3';

const fixedDirectory=fileURLToPath(new URL('../../../../.local/device-paged-native-v3',import.meta.url));
const fixedMixedDirectory=fileURLToPath(new URL('../../../../.local/device-paged-mixed-product-v3',import.meta.url));
const run=promisify(execFile),sha=value=>createHash('sha256').update(value).digest('hex');
const nonzeroDigest=()=>{let bytes;do{bytes=randomBytes(32);}while(bytes.every(value=>value===0));return '0x'+bytes.toString('hex');};
const privateIPv4=value=>{if(isIP(value)!==4)return false;const [a,b]=value.split('.').map(Number);return a===10||a===172&&b>=16&&b<=31||a===192&&b===168;};
function choices(){
 const addresses=new Set(['127.0.0.1']);
 for(const rows of Object.values(networkInterfaces()))for(const row of rows??[])if(row.family==='IPv4'&&!row.internal&&privateIPv4(row.address))addresses.add(row.address);
 return [...addresses];
}
async function privateDirectory(directory){
 const state=await lstat(directory);assert.ok(state.isDirectory()&&!state.isSymbolicLink()&&state.uid===process.getuid()&&(state.mode&0o777)===0o700&&await realpath(directory)===directory,'PAGED_NATIVE_SETUP_PRIVATE_DIRECTORY');
}
async function syncDirectory(directory){const h=await open(directory,constants.O_RDONLY|constants.O_DIRECTORY);try{await h.sync();}finally{await h.close();}}
async function writeExclusive(directory,name,bytes,maxBytes){
 let h;try{await privateDirectory(directory);assert.ok(bytes.length>0&&bytes.length<=maxBytes,'PAGED_NATIVE_SETUP_FILE_BOUND');
 h=await open(join(directory,name),constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
 await h.writeFile(bytes);await h.sync();const s=await h.stat();assert.ok(s.isFile()&&s.nlink===1&&s.uid===process.getuid()&&(s.mode&0o777)===0o600,'PAGED_NATIVE_SETUP_PRIVATE_FILE');}finally{bytes.fill(0);await h?.close();}await syncDirectory(directory);
}
async function deploymentPins(){
 const generation=assertOriginalPagedNativeFinancialSourceV3(),path=join(PAEG_PAGED_ARTIFACT_DIRECTORY_V3,'consumer.json'),state=await lstat(path);
 assert.ok(state.isFile()&&!state.isSymbolicLink()&&state.nlink===1&&state.size>0&&state.size<=32*1024*1024&&await realpath(path)===resolve(path),'PAGED_NATIVE_SETUP_CONSUMER_FILE');
 const bytes=await readFile(path);try{assert.equal(bytes.length,state.size);const consumerSHA256=sha(bytes);return assertFundedPagedLocalDeploymentArtifactsV3(generation.pagedManifestSHA256,consumerSHA256);}finally{bytes.fill(0);}
}

/** Called only by the fixed paged-native-new entry when operator.json is absent.
 * LAN bind is chosen explicitly from actual private IPv4 interfaces. */
export async function configureNewPagedNativeStartupV3(directory,signal){
 assert.equal(arguments.length,2);assert.equal(directory,fixedDirectory,'PAGED_NATIVE_SETUP_FIXED_DIRECTORY');return configureNewPagedStartupV3(directory,signal,false);
}
/** Same fixed TLS/identity setup, in a separate fresh mixed realm. Neither the
 * native realm nor a caller-selected runtime, port or factory is adopted. */
export async function configureNewPagedMixedStartupV3(directory,signal){
 assert.equal(arguments.length,2);assert.equal(directory,fixedMixedDirectory,'PAGED_MIXED_SETUP_FIXED_DIRECTORY');return configureNewPagedStartupV3(directory,signal,true);
}
async function configureNewPagedStartupV3(directory,signal,mixed){
 assert.ok(signal instanceof AbortSignal,'PAGED_NATIVE_SETUP_ABORT_SIGNAL');signal.throwIfAborted();
 assert.ok(process.stdin.isTTY&&process.stdout.isTTY,'PAGED_NATIVE_SETUP_INTERACTIVE_REQUIRED');
 const pins=await deploymentPins();
 // Certificate generation is an infrastructure tool, never a proof tool.
 try{await run('/usr/bin/openssl',['version'],{timeout:5000,maxBuffer:8192});}catch{throw Error('PAGED_NATIVE_SETUP_OPENSSL_REQUIRED');}
 await lstat(directory).then(()=>{throw Error('PAGED_NATIVE_SETUP_RETAINED_DIRECTORY');},error=>{if(error.code!=='ENOENT')throw error;});
 const addresses=choices(),terminal=createInterface({input:process.stdin,output:process.stdout});terminal.once('SIGINT',()=>{process.emit('SIGINT');});let publicKey,host;
 try{
  process.stdout.write(mixed?'Configurar operación mixta LOCAL: Ethereum, Bitcoin, Solana y Uniswap. Realm nuevo; no tiene reapertura económica fría. No se financian notas.\n':'Configurar wallet LOCAL nueva. Claves privadas del dispositivo permanecen en la app. No se financian notas.\n');
  publicKey=(await terminal.question('Pega la identidad PUBLICA de Más → Conexiones en este teléfono (04...): ',{signal})).trim();
  assert.match(publicKey,/^04[0-9a-f]{128}$/,'PAGED_NATIVE_SETUP_DEVICE_PUBLIC_KEY');ECDH.convertKey(Buffer.from(publicKey,'hex'),'secp256k1');
  process.stdout.write(addresses.map((address,index)=>`${index+1}. ${address}${index===0?' (sólo este ordenador)':' (red privada local)'}`).join('\n')+'\n');
  const selected=(await terminal.question('Red para conectar el teléfono [1]: ',{signal})).trim()||'1';
  assert.match(selected,/^[1-9][0-9]?$/,'PAGED_NATIVE_SETUP_INTERFACE');host=addresses[Number(selected)-1];assert.ok(host&&choices().includes(host),'PAGED_NATIVE_SETUP_INTERFACE_CHANGED');
 }finally{terminal.close();}
 signal.throwIfAborted();const parent=dirname(directory);await mkdir(parent,{recursive:true,mode:0o700});assert.equal(await realpath(parent),resolve(parent),'PAGED_NATIVE_SETUP_PARENT_ALIAS');
 await mkdir(directory,{mode:0o700});await privateDirectory(directory);await syncDirectory(parent);
 await writeExclusive(directory,'setup.json',Buffer.from(JSON.stringify({format:mixed?'DEVICE_PAGED_MIXED_LOCAL_SETUP_V3':'DEVICE_PAGED_NATIVE_LOCAL_SETUP_V3',localOnly:true,automaticFunding:false,economicReopen:false})+'\n'),1024);
 const temporary=await mkdtemp(join(directory,'.tls-'));await privateDirectory(temporary);let privatePEM,certificatePEM,config;
 try{
  const pair=generateKeyPairSync('ec',{namedCurve:'prime256v1'});privatePEM=pair.privateKey.export({format:'pem',type:'pkcs8'});
  await writeExclusive(temporary,'key.pem',Buffer.from(privatePEM),8192);
  try{await run('/usr/bin/openssl',['req','-new','-x509','-key',join(temporary,'key.pem'),'-out',join(temporary,'certificate.pem'),'-days','90','-subj',`/CN=${host}`,'-addext',`subjectAltName=IP:${host}`,'-addext','basicConstraints=critical,CA:FALSE','-addext','keyUsage=critical,digitalSignature','-addext','extendedKeyUsage=serverAuth'],{timeout:15000,maxBuffer:8192,signal});}catch{signal.throwIfAborted();throw Error('PAGED_NATIVE_SETUP_TLS_GENERATION');}
  await chmod(join(temporary,'certificate.pem'),0o600);
  certificatePEM=await readFile(join(temporary,'certificate.pem'),'utf8');const certificate=new X509Certificate(certificatePEM);
  assert.ok(certificate.checkIP(host),'PAGED_NATIVE_SETUP_TLS_HOST');assert.ok(certificate.publicKey.export({type:'spki',format:'der'}).equals(createPublicKey(pair.privateKey).export({type:'spki',format:'der'})),'PAGED_NATIVE_SETUP_TLS_KEY');
  // Original deployment takes opaque nonzero digests. They are fresh local
  // namespace values, not a claim of a public security policy or acceptance.
  config={deployment:{minimumDepositAtomic:'100',manifestSHA256:pins.manifestSHA256,consumerSHA256:pins.consumerSHA256,deploymentDomain:nonzeroDigest(),policy:nonzeroDigest()},journal:{path:join(directory,'authority','journal.vault'),password:randomBytes(48).toString('base64url')},nativeDirectory:join(directory,'native'),origin:`https://${host}:${mixed?9445:9443}`,devicePublicKey:publicKey,tls:{key:privatePEM,cert:certificatePEM},host};
  signal.throwIfAborted();assert.ok(choices().includes(host),'PAGED_NATIVE_SETUP_INTERFACE_CHANGED');const bytes=Buffer.from(JSON.stringify(config)+'\n');try{await writeExclusive(directory,'operator.json',bytes,32768);}finally{bytes.fill(0);}
  const publicBytes=Buffer.from(certificatePEM);try{await writeExclusive(directory,'operator-certificate.pem',publicBytes,16384);}finally{publicBytes.fill(0);}
  process.stdout.write(`Configuración privada conservada. Origen: ${config.origin}\nSHA256 del certificado DER: ${sha(certificate.raw)}\nLa conexión de la app se publicará al quedar listo el operador.\n`);
 }finally{privatePEM=null;certificatePEM=null;if(config){config.tls.key=null;config.journal.password=null;}await rm(temporary,{recursive:true,force:false});}
}
