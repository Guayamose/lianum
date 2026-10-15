/** Public routing DATA from retained engine connections. Never creates a Source,
 * issues a financial permission, or selects an arbitrary wallet for a caller. */
import {X509Certificate,createHash} from 'node:crypto';
import {open,constants} from 'node:fs/promises';
import {normalizeDevicePagedDescriptorV3,pagedOwnerExactV3} from '@lianum/mobile-protocol/device/paged-owner-v3';

const fail=()=>{throw Error('NATIVE_CONNECTION_DIRECTORY_INVALID');};
const need=value=>{if(!value)fail();};
export function normalizeCloudConnectionDirectoryV1(raw,origin){
 try{
  const data=pagedOwnerExactV3(raw,['profile','connections']);
  need(data.profile==='LIANUM_CLOUD_CONNECTION_DIRECTORY_V1'&&Array.isArray(data.connections)&&data.connections.length<=32);
  const owners=new Set();
  return Object.freeze(data.connections.map(input=>{
   const packet=pagedOwnerExactV3(input,['format','descriptor','transport']);
   need(packet.format==='DEVICE_PAGED_PRIVATE_GRAPH_CONNECTION_V3');
   const descriptor=normalizeDevicePagedDescriptorV3(packet.descriptor),transport=pagedOwnerExactV3(packet.transport,['type','certificatePEM','certificateSHA256']);
   need(descriptor.origin===origin&&!owners.has(descriptor.devicePublicKey));owners.add(descriptor.devicePublicKey);
   need(transport.type==='ANDROID_PINNED_TLS_V1'&&typeof transport.certificatePEM==='string'&&transport.certificatePEM.length<=32768);
   const cert=new X509Certificate(transport.certificatePEM);
   need(cert.checkHost(new URL(origin).hostname)!==undefined&&createHash('sha256').update(cert.raw).digest('hex')===transport.certificateSHA256);
   return Object.freeze({format:packet.format,descriptor,transport:Object.freeze(transport)});
  }));
 }catch{fail();}
}
export async function readCloudConnectionDirectoryV1(path,origin){
 if(path===null)return Object.freeze([]);
 need(typeof path==='string'&&path.startsWith('/'));
 const file=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);
 try{
  const stat=await file.stat();need(stat.isFile()&&stat.nlink===1&&(stat.mode&0o022)===0&&stat.size>0&&stat.size<=1024*1024);
  return normalizeCloudConnectionDirectoryV1(JSON.parse(await file.readFile('utf8')),origin);
 }finally{await file.close();}
}
