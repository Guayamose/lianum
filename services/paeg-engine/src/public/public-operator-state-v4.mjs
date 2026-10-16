/** Private server files only. These records select locators, never authority. */
import assert from 'node:assert/strict';
import {constants} from 'node:fs';
import {open,lstat,realpath,rename} from 'node:fs/promises';
import {join} from 'node:path';
import {randomBytes} from 'node:crypto';

export const PUBLIC_OPERATOR_STATE_V4='/var/lib/lianum-testnet-signer/paeg-public-v4';
export const PUBLIC_NATIVE_DIRECTORY_V4='/var/lib/lianum-testnet-signer/paeg-provider-v1';
export const PUBLIC_TRANSPORT_DIRECTORY_V4='/var/lib/lianum-testnet-signer/transport';

export async function assertPrivateOperatorDirectoryV4(directory){
 const state=await lstat(directory);
 assert.ok(state.isDirectory()&&!state.isSymbolicLink()&&state.uid===process.getuid()&&(state.mode&0o777)===0o700&&await realpath(directory)===directory,'PAEG_PUBLIC_PRIVATE_DIRECTORY');
}

export async function readPrivateOperatorFileV4(directory,name){
 assert.ok(/^[a-z0-9][a-z0-9.-]*$/.test(name),'PAEG_PUBLIC_PRIVATE_NAME');
 await assertPrivateOperatorDirectoryV4(directory);
 const fd=await open(join(directory,name),constants.O_RDONLY|constants.O_NOFOLLOW);
 try{
  const state=await fd.stat();
  assert.ok(state.isFile()&&state.nlink===1&&state.uid===process.getuid()&&(state.mode&0o777)===0o600&&state.size>0&&state.size<=65536,'PAEG_PUBLIC_PRIVATE_FILE');
  return await fd.readFile();
 }finally{await fd.close();}
}

export async function writePrivateOperatorFileV4(directory,name,bytes){
 assert.ok(/^[a-z0-9][a-z0-9.-]*$/.test(name)&&Buffer.isBuffer(bytes)&&bytes.length>0&&bytes.length<=65536,'PAEG_PUBLIC_PRIVATE_WRITE');
 await assertPrivateOperatorDirectoryV4(directory);
 const fd=await open(join(directory,name),constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,0o600);
 try{await fd.writeFile(bytes);await fd.sync();}finally{await fd.close();}
 const parent=await open(directory,constants.O_RDONLY|constants.O_DIRECTORY);
 try{await parent.sync();}finally{await parent.close();}
}

/** Only public connection data may be republished from a recovered Original
 * product. Private configuration and startup-attempt files stay exclusive. */
export async function publishOriginalPublicConnectionFileV4(directory,bytes,name='paired-connection.json'){
 assert.ok(['paired-connection.json','paired-phone-connection.json','paired-uniswap-connection.json','paired-uniswap-flat-connection.json','paired-aave-connection.json','paired-morpho-connection.json','defi-active-v8.json'].includes(name),'PAEG_PUBLIC_CONNECTION_NAME');
 await assertPrivateOperatorDirectoryV4(directory);
 const target=join(directory,name);
 try{const state=await lstat(target);assert.ok(state.isFile()&&!state.isSymbolicLink()&&state.nlink===1&&state.uid===process.getuid()&&(state.mode&0o777)===0o600&&state.size<=65536,'PAEG_PUBLIC_CONNECTION_FILE');}catch(error){if(error.code!=='ENOENT')throw error;}
 const temporaryName='paired-connection-'+randomBytes(16).toString('hex')+'.tmp';
 await writePrivateOperatorFileV4(directory,temporaryName,bytes);
 await rename(join(directory,temporaryName),target);
 const parent=await open(directory,constants.O_RDONLY|constants.O_DIRECTORY);
 try{await parent.sync();}finally{await parent.close();}
}
