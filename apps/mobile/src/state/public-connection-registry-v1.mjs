/** Public connection DATA only. Disk entries never establish an observation,
 * custody handle, permission, balance or authority to repeat an operation. */
import * as Crypto from 'expo-crypto';
import * as P from '../../../../packages/mobile-protocol/src/device-paged-owner-v3.mjs';
import {normalizeExternalFlatDescriptorV1,externalFlatExactV1,DEVICE_EXTERNAL_FLAT_NOTE_V1,DEVICE_EXTERNAL_FLAT_SHARE_V1} from '../../../../packages/mobile-protocol/src/device-external-flat-note-v1.mjs';
import {normalizeDeviceDefiPositionDescriptorV1} from '../../../../packages/mobile-protocol/src/device-defi-position-read-v1.mjs';
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
 }else{
  const v=exact(raw,['format','pairing','transport']);need(v.format==='DEVICE_EXTERNAL_FLAT_CONNECTION_V1');let pairing;
  const names={'DEVICE_EXTERNAL_FLAT_UNISWAP_PAIRING_V1':'UNISWAP','DEVICE_EXTERNAL_FLAT_AAVE_PAIRING_V1':'AAVE','DEVICE_EXTERNAL_FLAT_METAMORPHO_UNDERLYING_PAIRING_V2':'MORPHO'};
  if(Object.hasOwn(names,v.pairing?.profile)){
   const meta=v.pairing.profile==='DEVICE_EXTERNAL_FLAT_METAMORPHO_UNDERLYING_PAIRING_V2',p=exact(v.pairing,['profile','source','target',...(meta?['redemptionRecipient']:[])]),source=normalizeExternalFlatDescriptorV1(p.source),target=normalizeExternalFlatDescriptorV1(p.target);
   need(source.profile===DEVICE_EXTERNAL_FLAT_NOTE_V1&&target.profile===DEVICE_EXTERNAL_FLAT_SHARE_V1&&source.origin===target.origin&&source.devicePublicKey===target.devicePublicKey&&source.pairingId!==target.pairingId&&source.poolTerms.pool!==target.poolTerms.pool&&source.poolTerms.assetIdentity!==target.poolTerms.assetIdentity&&['genesis','hub','hubCodeHash','hubDomain'].every(k=>source.poolTerms[k]===target.poolTerms[k]));
   if(meta)need(typeof p.redemptionRecipient==='string'&&/^[0-9a-f]{40}$/.test(p.redemptionRecipient)&&p.redemptionRecipient!=='0'.repeat(40));
   pairing={profile:p.profile,source,target,...(meta?{redemptionRecipient:p.redemptionRecipient}:{})};descriptors=[source,target];protocol=names[p.profile];
  }else{pairing=normalizeExternalFlatDescriptorV1(v.pairing);descriptors=[pairing];}
  packet={format:v.format,pairing,transport:transport(v.transport)};kind='EXTERNAL_FLAT';
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
  forget:id=>serial(async()=>{need(/^[0-9a-f]{64}$/.test(id));const previous=await read(),row=previous.value.entries.find(row=>row.id===id);if(!row)return;const value={...previous.value,revision:previous.value.revision+1,entries:previous.value.entries.filter(row=>row.id!==id),selected:Object.fromEntries(Object.entries(previous.value.selected).map(([kind,value])=>[kind,value===id?null:value]))};need(Number.isSafeInteger(value.revision));await commit(previous,value);for(let i=0;i<row.parts;i++)await storage.remove(prefix+'.profile.'+id+'.'+i);}),
  forRoute:route=>serial(async()=>{const {value}=await read(),entries=await Promise.all(value.entries.map(decode)),matches=entries.filter(entry=>publicWalletConnectionMatchesRouteV1(entry,route));need(matches.length<=1);return matches[0]??null;}),
 });
}
