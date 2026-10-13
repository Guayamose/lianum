/** First-time infrastructure DATA for three existing original DeFi relations.
 * Device private keys, notes, proofs and runtime/factory choices never enter. */
import assert from 'node:assert/strict';
import {constants} from 'node:fs';
import {mkdir,mkdtemp,lstat,realpath,open,readFile,rm,chmod} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {networkInterfaces} from 'node:os';
import {isIP} from 'node:net';
import {generateKeyPairSync,ECDH,X509Certificate,createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createInterface} from 'node:readline/promises';
import {assertAdoptedSourceGeneration} from '@lianum/proofs/toolchain/current-source-generation';
import {originalDeviceUniswapLocalConfigurationPathV1,originalDeviceAaveStaticLocalConfigurationPathV1,originalDeviceMetaMorphoUnderlyingConfigurationPathV2} from '@lianum/backend/operations/local/device-external-flat-local-operator-v1';

const paths=Object.freeze({UNISWAP:originalDeviceUniswapLocalConfigurationPathV1,AAVE:originalDeviceAaveStaticLocalConfigurationPathV1,METAMORPHO:originalDeviceMetaMorphoUnderlyingConfigurationPathV2});
const run=promisify(execFile);
const privateIPv4=value=>{if(isIP(value)!==4)return false;const[a,b]=value.split('.').map(Number);return a===10||a===172&&b>=16&&b<=31||a===192&&b===168;};
function choices(){const values=new Set(['127.0.0.1']);for(const rows of Object.values(networkInterfaces()))for(const row of rows??[])if(row.family==='IPv4'&&!row.internal&&privateIPv4(row.address))values.add(row.address);return [...values];}
async function privateDirectory(directory){const s=await lstat(directory);assert.ok(s.isDirectory()&&!s.isSymbolicLink()&&s.uid===process.getuid()&&(s.mode&0o777)===0o700&&await realpath(directory)===directory,'DEVICE_DEFI_SETUP_PRIVATE_DIRECTORY');}
async function syncDirectory(directory){const h=await open(directory,constants.O_RDONLY|constants.O_DIRECTORY);try{await h.sync();}finally{await h.close();}}
async function writeExclusive(directory,name,bytes,max){let h;try{await privateDirectory(directory);assert.ok(bytes.length>0&&bytes.length<=max,'DEVICE_DEFI_SETUP_FILE_BOUND');h=await open(join(directory,name),constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);await h.writeFile(bytes);await h.sync();const s=await h.stat();assert.ok(s.isFile()&&s.uid===process.getuid()&&s.nlink===1&&(s.mode&0o777)===0o600,'DEVICE_DEFI_SETUP_PRIVATE_FILE');}finally{bytes.fill(0);await h?.close();}await syncDirectory(directory);}
function atomicAmount(text){assert.match(text,/^(0|[1-9][0-9]*)(?:\.[0-9]{1,6})?$/,'DEVICE_DEFI_SETUP_AMOUNT');const[integer,fraction='']=text.split('.'),value=BigInt(integer)*1_000_000n+BigInt(fraction.padEnd(6,'0'));assert.ok(value>0n&&value<(1n<<64n),'DEVICE_DEFI_SETUP_AMOUNT');return value.toString();}

/** Called only for the same existing original single-protocol entry. The exact
 * synthetic token allowance is chosen by the operator; no note is funded. */
export async function configureMissingOriginalDeviceDefiLocalV1(path,kind,sourceV3,signal){
 assert.equal(arguments.length,4);assert.ok(Object.hasOwn(paths,kind));assert.equal(path,paths[kind]());assert.equal(typeof sourceV3,'boolean');assert.ok(!sourceV3||kind==='UNISWAP'||kind==='AAVE');assert.ok(signal instanceof AbortSignal);signal.throwIfAborted();
 assert.ok(process.stdin.isTTY&&process.stdout.isTTY,'DEVICE_DEFI_SETUP_INTERACTIVE_REQUIRED');assertAdoptedSourceGeneration();
 try{await run('/usr/bin/openssl',['version'],{timeout:5000,maxBuffer:8192,signal});}catch{signal.throwIfAborted();throw Error('DEVICE_DEFI_SETUP_OPENSSL_REQUIRED');}
 const directory=dirname(path);await lstat(directory).then(()=>{throw Error('DEVICE_DEFI_SETUP_RETAINED_DIRECTORY');},error=>{if(error.code!=='ENOENT')throw error;});
 const addresses=choices(),terminal=createInterface({input:process.stdin,output:process.stdout});terminal.once('SIGINT',()=>{process.emit('SIGINT');});let devicePublicKey,host,amount;
 try{
  process.stdout.write(`${kind}: relación DeFi LOCAL original, tokens de ejemplo. El arranque prepara allowances exactas de infraestructura; no financia notas ni convierte fondos de Paged.\n`);
  devicePublicKey=(await terminal.question('Pega la identidad PUBLICA de Más → Conexiones en este teléfono (04...): ',{signal})).trim();assert.match(devicePublicKey,/^04[0-9a-f]{128}$/);ECDH.convertKey(Buffer.from(devicePublicKey,'hex'),'secp256k1');
  process.stdout.write(addresses.map((address,index)=>`${index+1}. ${address}${index===0?' (sólo este ordenador)':' (red privada local)'}`).join('\n')+'\n');
  const selected=(await terminal.question('Red para conectar el teléfono [1]: ',{signal})).trim()||'1';assert.match(selected,/^[1-9][0-9]?$/);host=addresses[Number(selected)-1];assert.ok(host&&choices().includes(host),'DEVICE_DEFI_SETUP_INTERFACE_CHANGED');
  amount=atomicAmount((await terminal.question(`Límite de entrada y solver en tokens locales ${kind==='AAVE'?'USDC':'PALT'} (hasta 6 decimales, sin valor real): `,{signal})).trim());
 }finally{terminal.close();}
 signal.throwIfAborted();const parent=dirname(directory);await mkdir(parent,{recursive:true,mode:0o700});assert.equal(await realpath(parent),resolve(parent),'DEVICE_DEFI_SETUP_PARENT_ALIAS');await mkdir(directory,{mode:0o700});await privateDirectory(directory);await syncDirectory(parent);
 await writeExclusive(directory,'setup.json',Buffer.from(JSON.stringify({format:'DEVICE_DEFI_ORIGINAL_LOCAL_SETUP_V1',relation:kind,localOnly:true,automaticFunding:false})+'\n'),1024);
 const temporary=await mkdtemp(join(directory,'.tls-'));await privateDirectory(temporary);let privateKey,certificate,config;
 try{
  const pair=generateKeyPairSync('ec',{namedCurve:'prime256v1'});privateKey=pair.privateKey.export({format:'pem',type:'pkcs8'});await writeExclusive(temporary,'key.pem',Buffer.from(privateKey),8192);
  try{await run('/usr/bin/openssl',['req','-new','-x509','-key',join(temporary,'key.pem'),'-out',join(temporary,'certificate.pem'),'-days','1','-subj',`/CN=${host}`,'-addext',`subjectAltName=IP:${host}`,'-addext','basicConstraints=critical,CA:FALSE','-addext','keyUsage=critical,digitalSignature','-addext','extendedKeyUsage=serverAuth'],{timeout:15000,maxBuffer:8192,signal});}catch{signal.throwIfAborted();throw Error('DEVICE_DEFI_SETUP_TLS_GENERATION');}
  await chmod(join(temporary,'certificate.pem'),0o600);certificate=await readFile(join(temporary,'certificate.pem'),'utf8');const leaf=new X509Certificate(certificate);assert.ok(!leaf.ca&&leaf.checkIP(host)===host&&leaf.checkPrivateKey(pair.privateKey),'DEVICE_DEFI_SETUP_TLS_IDENTITY');
  config={origin:`https://${host}:9444`,devicePublicKey,tls:{certificate,privateKey},depositAmountAtomic:amount,...(sourceV3?{solverMaximumInputAtomic:amount}:{})};signal.throwIfAborted();assert.ok(choices().includes(host),'DEVICE_DEFI_SETUP_INTERFACE_CHANGED');await writeExclusive(directory,'operator.json',Buffer.from(JSON.stringify(config)+'\n'),32768);
  process.stdout.write(`Configuración privada retenida. Origen DeFi: ${config.origin}\nCertificado DER SHA256: ${createHash('sha256').update(leaf.raw).digest('hex')}\nLa conexión pública se exportará al arrancar el operador original.\n`);
 }finally{privateKey=null;certificate=null;if(config)config.tls=null;await rm(temporary,{recursive:true,force:false});}
}
