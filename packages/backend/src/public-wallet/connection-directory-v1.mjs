/** Public routing DATA from retained engine connections. Never creates a Source,
 * issues a financial permission, or selects an arbitrary wallet for a caller. */
import {X509Certificate,createHash} from 'node:crypto';
import {open,constants} from 'node:fs/promises';
import {normalizeDevicePagedDescriptorV3,pagedOwnerExactV3} from '@lianum/mobile-protocol/device/paged-owner-v3';
import {normalizeExternalFlatDescriptorV1} from '@lianum/mobile-protocol/device/source-note-v1';
import {normalizeDeviceSepoliaDefiConnectionV7} from '@lianum/mobile-protocol/device/sepolia-defi-connection-v7';

const fail=()=>{throw Error('NATIVE_CONNECTION_DIRECTORY_INVALID');};
const need=value=>{if(!value)fail();};
export function normalizeCloudConnectionDirectoryV1(raw,origin){
 try{
  const data=pagedOwnerExactV3(raw,['profile','connections']);
  need(data.profile==='LIANUM_CLOUD_CONNECTION_DIRECTORY_V1'&&Array.isArray(data.connections)&&data.connections.length<=32);
  const owners=new Map(),profiles=new Set(),pairings=new Set();
  return Object.freeze(data.connections.map(input=>{
   const defi=input?.format==='DEVICE_SEPOLIA_DEFI_SHARES_CONNECTION_V7';
   const packet=defi?normalizeDeviceSepoliaDefiConnectionV7(input):pagedOwnerExactV3(input,['format','descriptor','transport']);
   need(defi||['DEVICE_PAGED_PRIVATE_GRAPH_CONNECTION_V3','DEVICE_EXTERNAL_FLAT_CONNECTION_V1'].includes(packet.format));
   const descriptor=defi?packet.descriptor:packet.format==='DEVICE_PAGED_PRIVATE_GRAPH_CONNECTION_V3'?normalizeDevicePagedDescriptorV3(packet.descriptor):normalizeExternalFlatDescriptorV1(packet.descriptor),transport=pagedOwnerExactV3(packet.transport,['type','certificatePEM','certificateSHA256']);
   const owner=owners.get(descriptor.devicePublicKey),profileKey=descriptor.devicePublicKey+':'+packet.format+':'+(defi?packet.protocol:'');
   need(descriptor.origin===origin&&!profiles.has(profileKey)&&!pairings.has(descriptor.pairingId));profiles.add(profileKey);pairings.add(descriptor.pairingId);
   need(transport.type==='ANDROID_PINNED_TLS_V1'&&typeof transport.certificatePEM==='string'&&transport.certificatePEM.length<=32768);
   const cert=new X509Certificate(transport.certificatePEM);
   need(cert.checkHost(new URL(origin).hostname)!==undefined&&createHash('sha256').update(cert.raw).digest('hex')===transport.certificateSHA256);
   if(owner)need(owner.count<4&&owner.certificateSHA256===transport.certificateSHA256&&owner.certificatePEM===transport.certificatePEM);
   const paegSource=defi?packet.paegSource:undefined;if(paegSource&&owner?.paegSource)need(JSON.stringify(paegSource)===JSON.stringify(owner.paegSource));owners.set(descriptor.devicePublicKey,{count:(owner?.count??0)+1,certificateSHA256:transport.certificateSHA256,certificatePEM:transport.certificatePEM,paegSource:paegSource??owner?.paegSource});
   return Object.freeze({format:packet.format,descriptor,transport:Object.freeze(transport),...(defi?{protocol:packet.protocol,underlying:packet.underlying,terms:packet.terms,...(packet.paegSource?{paegSource:packet.paegSource}:{})}:{})});
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
