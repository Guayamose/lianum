/** Public connection DATA only. Disk entries never establish an observation,
 * custody handle, permission, balance or authority to repeat an operation. */
import * as Crypto from 'expo-crypto';
import * as P from '../../../../packages/mobile-protocol/src/device-paged-owner-v3.mjs';
import {normalizeExternalFlatDescriptorV1,externalFlatExactV1,DEVICE_EXTERNAL_FLAT_NOTE_V1,DEVICE_EXTERNAL_FLAT_SHARE_V1} from '../../../../packages/mobile-protocol/src/device-external-flat-note-v1.mjs';
import {normalizeDeviceDefiPositionDescriptorV1} from '../../../../packages/mobile-protocol/src/device-defi-position-read-v1.mjs';
import {DEVICE_SEPOLIA_DEFI_SHARES_CONNECTION_V7,normalizeDeviceSepoliaDefiConnectionV7} from '@lianum/mobile-protocol/device/sepolia-defi-connection-v7';
import {normalizeDevicePagedSourceSuccessorConnectionV35} from '@lianum/mobile-protocol/device/paged-source-successor-v35';
const FORMAT='DEVICE_PUBLIC_CONNECTION_REGISTRY_V1',MAX=65536,CHUNK=1200,LIMIT=12;
const fail=()=>{throw Error('MOBILE_PUBLIC_CONNECTION_REGISTRY');};
const need=value=>{if(!value)fail();};
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
const exact=externalFlatExactV1;
const publicKey=value=>need(typeof value==='string'&&/^04[0-9a-f]{128}$/.test(value));
const hash=async text=>Array.from(new Uint8Array(await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256,new TextEncoder().encode(text))),b=>b.toString(16).padStart(2,'0')).join('');
function transport(raw){const v=exact(raw,['type','certificatePEM','certificateSHA256']);need(v.type==='ANDROID_PINNED_TLS_V1'&&typeof v.certificatePEM==='string'&&v.certificatePEM.length>0&&v.certificatePEM.length<=32768&&/^-----BEGIN CERTIFICATE-----\r?\n[A-Za-z0-9+/=\r\n]+-----END CERTIFICATE-----\r?\n?$/.test(v.certificatePEM)&&typeof v.certificateSHA256==='string'&&/^[0-9a-f]{64}$/.test(v.certificateSHA256));return {...v};}
/** Exact public schemas: additional fields (including private keys) are rejected. */
export function normalizePublicWalletConnectionV1(text,expectedPublicKey){
 need(typeof text==='string'&&text.length>0&&text.length<=MAX);const raw=JSON.parse(text);let packet,kind,protocol=null,descriptors;
 if(raw?.format==='DEVICE_PAGED_PRIVATE_GRAPH_CONNECTION_V3'){
  const v=exact(raw,['format','descriptor','transport']),descriptor=P.normalizeDevicePagedDescriptorV3(v.descriptor);packet={format:v.format,descriptor,transport:transport(v.transport)};kind='PAGED';descriptors=[descriptor];
 }else if(raw?.format==='DEVICE_DEFI_POSITIONS_CONNECTION_V1'){
  const v=exact(raw,['format','descriptor','transport']),descriptor=normalizeDeviceDefiPositionDescriptorV1(v.descriptor);packet={format:v.format,descriptor,transport:transport(v.transport)};kind='POSITIONS';descriptors=[descriptor];
 }else if(raw?.format===DEVICE_SEPOLIA_DEFI_SHARES_CONNECTION_V7){
  packet=normalizeDeviceSepoliaDefiConnectionV7(raw);kind='EXTERNAL_FLAT';protocol=packet.protocol==='AAVE_STATIC'?'AAVE':'MORPHO';descriptors=[packet.descriptor];
 }else{
  const direct=Object.hasOwn(raw??{},'descriptor'),v=exact(raw,['format',direct?'descriptor':'pairing','transport']);need(v.format==='DEVICE_EXTERNAL_FLAT_CONNECTION_V1');let pairing;
  const names={'DEVICE_EXTERNAL_FLAT_UNISWAP_PAIRING_V1':'UNISWAP','DEVICE_EXTERNAL_FLAT_AAVE_PAIRING_V1':'AAVE','DEVICE_EXTERNAL_FLAT_METAMORPHO_UNDERLYING_PAIRING_V2':'MORPHO'};
  if(direct){pairing=normalizeExternalFlatDescriptorV1(v.descriptor);descriptors=[pairing];}
  else if(Object.hasOwn(names,v.pairing?.profile)){
   const meta=v.pairing.profile==='DEVICE_EXTERNAL_FLAT_METAMORPHO_UNDERLYING_PAIRING_V2',p=exact(v.pairing,['profile','source','target',...(meta?['redemptionRecipient']:[])]),source=normalizeExternalFlatDescriptorV1(p.source),target=normalizeExternalFlatDescriptorV1(p.target);
   need(source.profile===DEVICE_EXTERNAL_FLAT_NOTE_V1&&target.profile===DEVICE_EXTERNAL_FLAT_SHARE_V1&&source.origin===target.origin&&source.devicePublicKey===target.devicePublicKey&&source.pairingId!==target.pairingId&&source.poolTerms.pool!==target.poolTerms.pool&&source.poolTerms.assetIdentity!==target.poolTerms.assetIdentity&&['genesis','hub','hubCodeHash','hubDomain'].every(k=>source.poolTerms[k]===target.poolTerms[k]));
   if(meta)need(typeof p.redemptionRecipient==='string'&&/^[0-9a-f]{40}$/.test(p.redemptionRecipient)&&p.redemptionRecipient!=='0'.repeat(40));
   pairing={profile:p.profile,source,target,...(meta?{redemptionRecipient:p.redemptionRecipient}:{})};descriptors=[source,target];protocol=names[p.profile];
  }else{pairing=normalizeExternalFlatDescriptorV1(v.pairing);descriptors=[pairing];}
  packet={format:v.format,...(direct?{descriptor:pairing}:{pairing}),transport:transport(v.transport)};kind='EXTERNAL_FLAT';
 }
 const descriptor=descriptors[0];publicKey(descriptor.devicePublicKey);if(expectedPublicKey!==undefined){publicKey(expectedPublicKey);need(descriptor.devicePublicKey===expectedPublicKey);}const profile=JSON.stringify(packet);need(profile.length<=MAX);
 return freeze({kind,protocol,origin:descriptor.origin,devicePublicKey:descriptor.devicePublicKey,profile,descriptors,transport:packet.transport,observation:'UNKNOWN'});
}
/** Match original connection identities, never labels, valuation or note amounts. */
export function publicWalletConnectionMatchesRouteV1(entry,route){
 if(!route||typeof route!=='object'||route.origin!==entry.origin||route.devicePublicKey!==undefined&&route.devicePublicKey!==entry.devicePublicKey)return false;
 return entry.descriptors.some(d=>{
  if(d.pairingId!==route.pairingId)return false;
  const identity=entry.kind==='EXTERNAL_FLAT'?{lifetime:d.lifetime,pool:d.poolTerms.pool,assetId:d.poolTerms.assetIdentity,genesis:d.poolTerms.genesis,scope:d.poolTerms.scope,policy:d.poolTerms.policy,domain:d.poolTerms.domainCommitment}:entry.kind==='PAGED'?{pool:d.pool,assetId:d.assetIdentity,genesis:d.genesis,scope:d.scope,policy:d.policy,domain:d.domain}:{};
  return Object.entries(identity).every(([key,value])=>route[key]===undefined||route[key]===value);
 });
}
/** One actor serializes writes. Immutable profile chunks precede the small CAS
 * index; interrupted chunks cannot become a selected connection. */
export function createPublicConnectionRegistryV1({devicePublicKey,storage}){
 publicKey(devicePublicKey);need(storage&&['get','set','remove'].every(k=>typeof storage[k]==='function'));const prefix='lianum.public.connections.v1.'+devicePublicKey,indexKey=prefix+'.index';let work=Promise.resolve(),poison=false;
 const serial=fn=>{const pending=work.then(fn);work=pending.catch(()=>{});return pending;};
 function validateIndex(raw){const v=exact(raw,['format','devicePublicKey','revision','entries','selected']);need(v.format===FORMAT&&v.devicePublicKey===devicePublicKey&&Number.isSafeInteger(v.revision)&&v.revision>=0&&Array.isArray(v.entries)&&v.entries.length<=LIMIT);exact(v.selected,['PAGED','EXTERNAL_FLAT','POSITIONS']);const ids=new Set();for(const row of v.entries){exact(row,['id','kind','length','parts']);need(/^[0-9a-f]{64}$/.test(row.id)&&!ids.has(row.id)&&['PAGED','EXTERNAL_FLAT','POSITIONS'].includes(row.kind)&&Number.isSafeInteger(row.length)&&row.length>0&&row.length<=MAX&&row.parts===Math.ceil(row.length/CHUNK));ids.add(row.id);}for(const [kind,id]of Object.entries(v.selected))need(id===null||v.entries.some(row=>row.id===id&&row.kind===kind));return v;}
 async function read(){const raw=await storage.get(indexKey);return{raw,value:raw===null?{format:FORMAT,devicePublicKey,revision:0,entries:[],selected:{PAGED:null,EXTERNAL_FLAT:null,POSITIONS:null}}:validateIndex(JSON.parse(raw))};}
 async function decode(row){let text='';for(let i=0;i<row.parts;i++){const part=await storage.get(prefix+'.profile.'+row.id+'.'+i);need(typeof part==='string'&&part.length>0&&part.length<=CHUNK);text+=part;}need(text.length===row.length&&await hash(text)===row.id);const entry=normalizePublicWalletConnectionV1(text,devicePublicKey);need(entry.kind===row.kind);return freeze({...entry,id:row.id});}
 async function commit(previous,value){need(!poison&&await storage.get(indexKey)===previous.raw);const raw=JSON.stringify(value);need(raw.length<=8192);try{await storage.set(indexKey,raw);need(await storage.get(indexKey)===raw);}catch(error){poison=true;throw error;}}
 return Object.freeze({devicePublicKey,
  list:()=>serial(async()=>{const {value}=await read();return freeze(await Promise.all(value.entries.map(decode)));}),
  selected:kind=>serial(async()=>{need(['PAGED','EXTERNAL_FLAT','POSITIONS'].includes(kind));const {value}=await read(),row=value.entries.find(row=>row.id===value.selected[kind]);return row?decode(row):null;}),
  remember:(text,options)=>serial(async()=>{need(!poison);if(options!==undefined){exact(options,['select']);need(typeof options.select==='boolean');}const entry=normalizePublicWalletConnectionV1(text,devicePublicKey),id=await hash(entry.profile),previous=await read();let row=previous.value.entries.find(row=>row.id===id);if(!row){need(previous.value.entries.length<LIMIT);row={id,kind:entry.kind,length:entry.profile.length,parts:Math.ceil(entry.profile.length/CHUNK)};for(let i=0;i<row.parts;i++){const key=prefix+'.profile.'+id+'.'+i,part=entry.profile.slice(i*CHUNK,(i+1)*CHUNK),old=await storage.get(key);need(old===null||old===part);if(old===null)await storage.set(key,part);need(await storage.get(key)===part);}}
   const value={...previous.value,revision:previous.value.revision+1,entries:previous.value.entries.some(value=>value.id===id)?previous.value.entries:[...previous.value.entries,row],selected:options?.select===false?previous.value.selected:{...previous.value.selected,[entry.kind]:id}};need(Number.isSafeInteger(value.revision));await commit(previous,value);return freeze({...entry,id});}),
  replacePagedSource:(previousText,nextText)=>serial(async()=>{need(!poison);const oldEntry=normalizePublicWalletConnectionV1(previousText,devicePublicKey),entry=normalizePublicWalletConnectionV1(nextText,devicePublicKey);need(oldEntry.kind==='PAGED'&&entry.kind==='PAGED'&&oldEntry.origin===entry.origin&&oldEntry.devicePublicKey===entry.devicePublicKey);const oldDescriptor=oldEntry.descriptors[0],nextDescriptor=entry.descriptors[0];need(['genesis','chainId','policy','assetIdentity','manifestSHA256','consumerSHA256','securityGeneration'].every(key=>oldDescriptor[key]===nextDescriptor[key]));const previous=await read(),oldId=await hash(oldEntry.profile),id=await hash(entry.profile),old=previous.value.entries.find(row=>row.id===oldId),already=previous.value.entries.find(row=>row.id===id);need(old?.kind==='PAGED'||already?.kind==='PAGED');let row=already;
   if(!row){row={id,kind:'PAGED',length:entry.profile.length,parts:Math.ceil(entry.profile.length/CHUNK)};for(let i=0;i<row.parts;i++){const name=prefix+'.profile.'+id+'.'+i,value=entry.profile.slice(i*CHUNK,(i+1)*CHUNK),stored=await storage.get(name);need(stored===null||stored===value);if(stored===null)await storage.set(name,value);need(await storage.get(name)===value);}}
   const entries=previous.value.entries.filter(value=>value.id!==oldId&&value.id!==id);entries.push(row);need(entries.length<=LIMIT);const value={...previous.value,revision:previous.value.revision+1,entries,selected:{...previous.value.selected,PAGED:id}};need(Number.isSafeInteger(value.revision));await commit(previous,value);
   if(old&&oldId!==id)for(let i=0;i<old.parts;i++)await storage.remove(prefix+'.profile.'+oldId+'.'+i);
   return freeze({...entry,id});}),
  forget:id=>serial(async()=>{need(/^[0-9a-f]{64}$/.test(id));const previous=await read(),row=previous.value.entries.find(row=>row.id===id);if(!row)return;const value={...previous.value,revision:previous.value.revision+1,entries:previous.value.entries.filter(row=>row.id!==id),selected:Object.fromEntries(Object.entries(previous.value.selected).map(([kind,value])=>[kind,value===id?null:value]))};need(Number.isSafeInteger(value.revision));await commit(previous,value);for(let i=0;i<row.parts;i++)await storage.remove(prefix+'.profile.'+id+'.'+i);}),
  replaceDefiSourcesV35:(previousProfiles,nextProfiles)=>serial(async()=>{
   need(!poison&&Array.isArray(previousProfiles)&&previousProfiles.length===2&&Array.isArray(nextProfiles)&&nextProfiles.length===2);const old=previousProfiles.map(text=>normalizePublicWalletConnectionV1(text,devicePublicKey)),next=nextProfiles.map(text=>normalizePublicWalletConnectionV1(text,devicePublicKey));need(new Set(old.map(row=>row.protocol)).size===2);const oldPackets=old.map(row=>normalizeDeviceSepoliaDefiConnectionV7(JSON.parse(row.profile))),nextPackets=next.map(row=>normalizeDeviceSepoliaDefiConnectionV7(JSON.parse(row.profile)));need(oldPackets.every(row=>JSON.stringify(row.paegSource)===JSON.stringify(oldPackets[0].paegSource))&&nextPackets.every(row=>JSON.stringify(row.paegSource)===JSON.stringify(nextPackets[0].paegSource)));
   for(let i=0;i<2;i++){const before=oldPackets[i],after=nextPackets[i],{paegSource:oldSource,...oldFixed}=before,{paegSource:nextSource,...nextFixed}=after;need(oldSource&&nextSource&&JSON.stringify(oldFixed)===JSON.stringify(nextFixed));normalizeDevicePagedSourceSuccessorConnectionV35({format:'DEVICE_PAGED_PRIVATE_GRAPH_CONNECTION_V3',descriptor:nextSource.descriptor,transport:after.transport},oldSource.descriptor);}
   const previous=await read(),oldIds=await Promise.all(old.map(row=>hash(row.profile))),newRows=[];
   for(let i=0;i<2;i++){const entry=next[i],id=await hash(entry.profile);need(previous.value.entries.some(row=>row.id===oldIds[i]||row.id===id));const row={id,kind:entry.kind,length:entry.profile.length,parts:Math.ceil(entry.profile.length/CHUNK)};for(let part=0;part<row.parts;part++){const name=prefix+'.profile.'+id+'.'+part,text=entry.profile.slice(part*CHUNK,(part+1)*CHUNK),stored=await storage.get(name);need(stored===null||stored===text);if(stored===null)await storage.set(name,text);need(await storage.get(name)===text);}newRows.push(row);}
   const entries=previous.value.entries.filter(row=>!oldIds.includes(row.id)&&!newRows.some(next=>next.id===row.id));entries.push(...newRows);need(entries.length<=LIMIT);const selected={...previous.value.selected};for(let i=0;i<2;i++)if(selected.EXTERNAL_FLAT===oldIds[i])selected.EXTERNAL_FLAT=newRows[i].id;await commit(previous,{...previous.value,revision:previous.value.revision+1,entries,selected});
   for(const id of oldIds){const row=previous.value.entries.find(row=>row.id===id);if(row&&!newRows.some(next=>next.id===id))for(let part=0;part<row.parts;part++)await storage.remove(prefix+'.profile.'+id+'.'+part);}return freeze(await Promise.all(newRows.map(decode)));
  }),
  forRoute:route=>serial(async()=>{const {value}=await read(),entries=await Promise.all(value.entries.map(decode)),matches=entries.filter(entry=>publicWalletConnectionMatchesRouteV1(entry,route));need(matches.length<=1);return matches[0]??null;}),
 });
}
