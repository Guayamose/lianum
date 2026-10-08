/** Device W39 domains. The note signature remains inside the exact original
 * witness; this paired-device consent cannot sign a note or adopt Linux custody. */
import {normalizeOriginalAccountBindingV2,normalizeOriginalAccountSignatureV2} from './original-account-review-v2.mjs';
import {normalizeMobileOrigin} from './authorization.mjs';
export const DEVICE_EXIT_CONSENT_V1='LIANUM_DEVICE_ORIGINAL_W39_V1';
export const DEVICE_EXIT_DISCLOSURE_V1='ONE_W39_OPENING_TO_ORIGINAL_EPHEMERAL_WORKER';
const need=value=>{if(!value)throw Error('MOBILE_DEVICE_EXIT_INVALID');};
const hex=(value,width=64)=>{need(typeof value==='string'&&new RegExp('^[0-9a-f]{'+width+'}$').exec(value)?.[0]===value);return value;};
const u64=value=>{need(typeof value==='string'&&/^(0|[1-9][0-9]{0,19})$/.exec(value)?.[0]===value&&BigInt(value)<(1n<<64n));return value;};
function exact(raw,names){need(raw&&Object.getPrototypeOf(raw)===Object.prototype&&Reflect.ownKeys(raw).length===names.length);
  return Object.fromEntries(names.map(name=>{const row=Object.getOwnPropertyDescriptor(raw,name);need(row?.enumerable&&Object.hasOwn(row,'value'));return[name,row.value];}));}
function array(raw,count,maximum){need(Array.isArray(raw)&&Object.getPrototypeOf(raw)===Array.prototype&&raw.length===count&&Reflect.ownKeys(raw).length===count+1);
  return Array.from({length:count},(_,i)=>{const row=Object.getOwnPropertyDescriptor(raw,String(i));need(row?.enumerable&&Object.hasOwn(row,'value')
    &&Number.isSafeInteger(row.value)&&row.value>=0&&row.value<maximum);return row.value;});}
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
export function normalizeDeviceExitStatementV1(raw){const value=exact(raw,['scope','policy','epoch','root','nullifier','amount','recipient','commitment']);
  ['scope','policy','root','nullifier','commitment'].forEach(name=>hex(value[name]));hex(value.recipient,40);
  u64(value.epoch);u64(value.amount);need(BigInt(value.amount)>0n&&value.recipient!=='0'.repeat(40)
    &&value.commitment!=='0'.repeat(64)&&value.nullifier!=='0'.repeat(64));return freeze(value);}
export function normalizeDeviceExitWitnessV1(raw){const value=exact(raw,['scope','policy','epoch','root','spent','amount','recipient','siblings','leaf_index',
  'rho','key_x','key_y','value','secret','signature']);
  for(const name of ['scope','policy','root','spent'])value[name]=array(value[name],8,2**32);value.recipient=array(value.recipient,5,2**32);
  for(const name of ['rho','key_x','key_y','secret'])value[name]=array(value[name],32,256);value.signature=array(value.signature,64,256);
  need(Array.isArray(value.siblings)&&value.siblings.length===6&&Reflect.ownKeys(value.siblings).length===7);
  value.siblings=Array.from({length:6},(_,i)=>{const row=Object.getOwnPropertyDescriptor(value.siblings,String(i));need(row?.enumerable&&Object.hasOwn(row,'value'));return array(row.value,32,256);});
  ['epoch','amount','value','leaf_index'].forEach(name=>u64(value[name]));need(value.value===value.amount&&BigInt(value.value)>0n&&BigInt(value.leaf_index)<64n);
  normalizeOriginalAccountSignatureV2(value.signature.map(byte=>byte.toString(16).padStart(2,'0')).join(''));return value;}
export function wipeDeviceExitWitnessV1(value){if(value&&typeof value==='object')for(const name of Object.keys(value)){
  if(value[name]&&typeof value[name]==='object')wipeDeviceExitWitnessV1(value[name]);value[name]=null;}}
export function deviceExitWitnessBytesV1(raw){const value=normalizeDeviceExitWitnessV1(raw);try{const bytes=new TextEncoder().encode(JSON.stringify(value));need(bytes.length<=8192);return bytes;}
  finally{wipeDeviceExitWitnessV1(value);}}
export function normalizeDeviceExitConsentV1(raw){const value=exact(raw,['version','profile','action','origin','pairingId','devicePublicKey','challengeId','nonce','expiresAt',
  'binding','poolTerms','parentJobId','nativeBindingSHA256','quoteId','jobId','rootId','noteRevision','noteRole','statement','witnessSHA256','proofSHA256','publicInputsSHA256','observed','openingDisclosure']);
  need(value.version===1&&value.profile===DEVICE_EXIT_CONSENT_V1&&['PROVE_W39','WITHDRAW_W39','OBSERVE_W39'].includes(value.action));normalizeMobileOrigin(value.origin);
  for(const name of ['pairingId','challengeId','nonce','parentJobId','nativeBindingSHA256','quoteId','jobId','rootId','witnessSHA256']){hex(value[name]);need(value[name]!=='0'.repeat(64));}
  need(/^04[0-9a-f]{128}$/.exec(value.devicePublicKey)?.[0]===value.devicePublicKey&&new Set([value.pairingId,value.challengeId,value.nonce]).size===3
    &&Number.isSafeInteger(value.expiresAt)&&value.expiresAt>0&&Number.isSafeInteger(value.noteRevision)&&value.noteRevision>=0&&['change','recovery'].includes(value.noteRole));
  value.binding=normalizeOriginalAccountBindingV2(value.binding);value.poolTerms=exact(value.poolTerms,['scope','policy','codeHash','assetIdentity','domainCommitment']);Object.values(value.poolTerms).forEach(value=>hex(value));
  value.statement=normalizeDeviceExitStatementV1(value.statement);need(value.statement.scope===value.poolTerms.scope&&value.statement.policy===value.poolTerms.policy);
  value.observed=exact(value.observed,['blockNumber','blockHash','timestamp']);u64(value.observed.blockNumber);hex(value.observed.blockHash);u64(value.observed.timestamp);
  if(value.action==='PROVE_W39')need(value.proofSHA256===null&&value.publicInputsSHA256===null&&value.openingDisclosure===DEVICE_EXIT_DISCLOSURE_V1
    &&value.statement.epoch===(BigInt(value.observed.timestamp)/600n).toString());
  else{need(value.openingDisclosure===null);need((value.proofSHA256===null&&value.publicInputsSHA256===null&&value.action==='OBSERVE_W39')
    ||(hex(value.proofSHA256)&&hex(value.publicInputsSHA256)));}return freeze(value);}
export function validateDeviceExitConsentFreshV1(raw,now=Date.now()){const value=normalizeDeviceExitConsentV1(raw);
  need(Number.isSafeInteger(now)&&value.expiresAt>now&&value.expiresAt<=now+15000);return value;}
export function deviceExitConsentMessageV1(raw){const value=normalizeDeviceExitConsentV1(raw),ascii=text=>{need(/^[\x20-\x7e]*$/.exec(text)?.[0]===text);return Uint8Array.from(text,c=>c.charCodeAt(0));};
  const bytes=text=>Uint8Array.from(text.match(/../g),byte=>Number.parseInt(byte,16)),integer=value=>bytes(BigInt(value).toString(16).padStart(16,'0')),
    nullable=value=>value===null?new Uint8Array([0]):new Uint8Array([1,...bytes(value)]);
  const fields=[ascii(value.profile),new Uint8Array([1]),ascii(value.action),ascii(value.origin),bytes(value.pairingId),bytes(value.devicePublicKey),
    bytes(value.challengeId),bytes(value.nonce),integer(value.expiresAt),ascii(JSON.stringify(value.binding)),...Object.values(value.poolTerms).map(bytes),
    ...['parentJobId','nativeBindingSHA256','quoteId','jobId','rootId'].map(name=>bytes(value[name])),integer(value.noteRevision),ascii(value.noteRole),
    ...['scope','policy'].map(name=>bytes(value.statement[name])),integer(value.statement.epoch),bytes(value.statement.root),bytes(value.statement.nullifier),
    integer(value.statement.amount),bytes(value.statement.recipient),bytes(value.statement.commitment),bytes(value.witnessSHA256),nullable(value.proofSHA256),nullable(value.publicInputsSHA256),
    integer(value.observed.blockNumber),bytes(value.observed.blockHash),integer(value.observed.timestamp),value.openingDisclosure===null?new Uint8Array([0]):ascii(value.openingDisclosure)];
  const size=fields.reduce((sum,field)=>sum+4+field.length,0);need(size<=4096);const result=new Uint8Array(size),view=new DataView(result.buffer);let offset=0;
  for(const field of fields){view.setUint32(offset,field.length,false);offset+=4;result.set(field,offset);offset+=field.length;}return result;}
export function normalizeDeviceExitQuoteV1(raw){const value=exact(raw,['version','profile','origin','pairingId','devicePublicKey','quoteId','expiresAt',
  'parentJobId','nativeBindingSHA256','rootId','noteRevision','noteRole','nullifierSpent','statement','path','poolTerms','observed']);
  need(value.version===1&&value.profile==='LIANUM_DEVICE_ORIGINAL_W39_QUOTE_V1'&&value.nullifierSpent===false);normalizeMobileOrigin(value.origin);
  for(const name of ['pairingId','quoteId','parentJobId','nativeBindingSHA256','rootId']){hex(value[name]);need(value[name]!=='0'.repeat(64));}
  need(/^04[0-9a-f]{128}$/.exec(value.devicePublicKey)?.[0]===value.devicePublicKey&&Number.isSafeInteger(value.expiresAt)&&value.expiresAt>0
    &&Number.isSafeInteger(value.noteRevision)&&value.noteRevision>=0&&['change','recovery'].includes(value.noteRole));
  value.statement=normalizeDeviceExitStatementV1(value.statement);value.poolTerms=exact(value.poolTerms,['scope','policy','codeHash','assetIdentity','domainCommitment']);Object.values(value.poolTerms).forEach(value=>hex(value));
  need(value.statement.scope===value.poolTerms.scope&&value.statement.policy===value.poolTerms.policy);
  value.observed=exact(value.observed,['blockNumber','blockHash','timestamp']);u64(value.observed.blockNumber);hex(value.observed.blockHash);u64(value.observed.timestamp);
  need(value.statement.epoch===(BigInt(value.observed.timestamp)/600n).toString());
  value.path=exact(value.path,['root','index','leaf','siblings']);hex(value.path.root);hex(value.path.leaf);need(Number.isSafeInteger(value.path.index)&&value.path.index>=0&&value.path.index<64);
  need(Array.isArray(value.path.siblings)&&value.path.siblings.length===6&&Reflect.ownKeys(value.path.siblings).length===7);
  value.path.siblings=Array.from({length:6},(_,i)=>{const row=Object.getOwnPropertyDescriptor(value.path.siblings,String(i));need(row?.enumerable&&Object.hasOwn(row,'value'));return hex(row.value);});
  need(value.path.root===value.statement.root&&value.path.leaf===value.statement.commitment);return freeze(value);}
export function normalizeDeviceExitStatusV1(raw){const value=exact(raw,['jobId','stage','statement','consentFields','observation','errorCode','authorizationSHA256']);hex(value.jobId);
  need(['PROVING','PROVED','FAILED','WITHDRAWAL_UNKNOWN','CONFIRMED'].includes(value.stage));value.statement=normalizeDeviceExitStatementV1(value.statement);
  value.consentFields=exact(value.consentFields,['parentJobId','nativeBindingSHA256','quoteId','jobId','rootId','noteRevision','noteRole','statement','witnessSHA256','proofSHA256','publicInputsSHA256']);
  const fields=value.consentFields;for(const name of ['parentJobId','nativeBindingSHA256','quoteId','jobId','rootId','witnessSHA256'])hex(fields[name]);need(fields.jobId===value.jobId);
  need(Number.isSafeInteger(fields.noteRevision)&&fields.noteRevision>=0&&['change','recovery'].includes(fields.noteRole));fields.statement=normalizeDeviceExitStatementV1(fields.statement);
  need(JSON.stringify(fields.statement)===JSON.stringify(value.statement));need((fields.proofSHA256===null)===(fields.publicInputsSHA256===null));
  if(fields.proofSHA256!==null){hex(fields.proofSHA256);hex(fields.publicInputsSHA256);}if(['PROVED','WITHDRAWAL_UNKNOWN','CONFIRMED'].includes(value.stage))need(fields.proofSHA256!==null);
  hex(value.authorizationSHA256);need(value.errorCode===null||(typeof value.errorCode==='string'&&/^[A-Z0-9_]{1,160}$/.exec(value.errorCode)?.[0]===value.errorCode));
  need((value.stage==='CONFIRMED')===(value.observation!==null));
  if(value.observation!==null){const o=exact(value.observation,['profile','jobId','parentJobId','rootId','noteRole','commitment','nullifier','amount','recipient',
      'transactionHash','blockHash','blockNumber','calldataSHA256','timestamp','domainCommitment']);need(o.profile==='LIANUM_DEVICE_ORIGINAL_W39_OBSERVATION_V1');
    for(const name of ['jobId','parentJobId','rootId','commitment','nullifier','transactionHash','blockHash','calldataSHA256','domainCommitment'])hex(o[name]);hex(o.recipient,40);
    ['amount','blockNumber','timestamp'].forEach(name=>u64(o[name]));need(o.jobId===value.jobId&&o.parentJobId===fields.parentJobId&&o.rootId===fields.rootId&&o.noteRole===fields.noteRole);
    for(const name of ['commitment','nullifier','amount','recipient'])need(o[name]===fields.statement[name]);value.observation=o;}return freeze(value);}
