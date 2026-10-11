/** Device W39 domains. The note signature remains inside the exact original
 * witness; this paired-device consent cannot sign a note or adopt Linux custody. */
import {normalizeOriginalAccountBindingV2,normalizeOriginalAccountSignatureV2} from './original-account-review-v2.mjs';
import {normalizeMobileOrigin} from './authorization.mjs';
/** @typedef {import('./device-exit-consent-v1.mjs').DeviceExitStatementV1} DeviceExitStatementV1 */
/** @typedef {import('./device-exit-consent-v1.mjs').DeviceExitWitnessV1} DeviceExitWitnessV1 */
/** @typedef {import('./device-exit-consent-v1.mjs').DeviceExitConsentV1} DeviceExitConsentV1 */
/** @typedef {import('./device-exit-consent-v1.mjs').DeviceExitQuoteV1} DeviceExitQuoteV1 */
/** @typedef {import('./device-exit-consent-v1.mjs').DeviceExitStatusV1} DeviceExitStatusV1 */
export const DEVICE_EXIT_CONSENT_V1='LIANUM_DEVICE_ORIGINAL_W39_V1';
export const DEVICE_EXIT_DISCLOSURE_V1='ONE_W39_OPENING_TO_ORIGINAL_EPHEMERAL_WORKER';
/** @type {(value: unknown) => asserts value} */
const need=value=>{if(!value)throw Error('MOBILE_DEVICE_EXIT_INVALID');};
/** @param {unknown} value @param {number} [width] @returns {string} */
const hex=(value,width=64)=>{need(typeof value==='string'&&new RegExp('^[0-9a-f]{'+width+'}$').exec(value)?.[0]===value);return value;};
/** @param {unknown} value @returns {string} */
const u64=value=>{need(typeof value==='string'&&/^(0|[1-9][0-9]{0,19})$/.exec(value)?.[0]===value&&BigInt(value)<(1n<<64n));return value;};
/** @param {unknown} raw @param {readonly string[]} names @returns {Record<string,unknown>} */
function exact(raw,names){need(typeof raw==='object'&&raw!==null&&Object.getPrototypeOf(raw)===Object.prototype&&Reflect.ownKeys(raw).length===names.length);
  return Object.fromEntries(names.map(name=>{const row=Object.getOwnPropertyDescriptor(raw,name);need(row?.enumerable&&Object.hasOwn(row,'value'));return[name,row.value];}));}
/** @param {unknown} raw @param {number} count @param {number} maximum @returns {number[]} */
function array(raw,count,maximum){need(Array.isArray(raw)&&Object.getPrototypeOf(raw)===Array.prototype&&raw.length===count&&Reflect.ownKeys(raw).length===count+1);
  return Array.from({length:count},(_,i)=>{const row=Object.getOwnPropertyDescriptor(raw,String(i));need(row?.enumerable&&Object.hasOwn(row,'value')
    &&Number.isSafeInteger(row.value)&&row.value>=0&&row.value<maximum);return row.value;});}
/** @template {string} T @param {unknown} value @param {readonly T[]} choices @returns {value is T} */
const oneOf=(value,choices)=>choices.some(choice=>choice===value);
/** @template {string} K @template V @param {Record<string,unknown>} value @param {readonly K[]} names @param {(raw:unknown)=>V} read @returns {Record<K,V>} */
function readFields(value,names,read){return /** @type {Record<K,V>} */(Object.fromEntries(names.map(name=>[name,read(value[name])])));}
/** @template T @param {T} value @returns {Readonly<T>} */
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
/** @param {unknown} raw @returns {DeviceExitStatementV1} */
export function normalizeDeviceExitStatementV1(raw){const value=exact(raw,['scope','policy','epoch','root','nullifier','amount','recipient','commitment']);
  const hashes=readFields(value,['scope','policy','root','nullifier','commitment'],raw=>hex(raw)),recipient=hex(value.recipient,40);
  const epoch=u64(value.epoch),amount=u64(value.amount);need(BigInt(amount)>0n&&recipient!=='0'.repeat(40)
    &&hashes.commitment!=='0'.repeat(64)&&hashes.nullifier!=='0'.repeat(64));
  return freeze(Object.assign(value,hashes,{recipient,epoch,amount}));}
/** @param {unknown} raw @returns {DeviceExitWitnessV1} */
export function normalizeDeviceExitWitnessV1(raw){const value=exact(raw,['scope','policy','epoch','root','spent','amount','recipient','siblings','leaf_index',
  'rho','key_x','key_y','value','secret','signature']);
  const words=readFields(value,['scope','policy','root','spent'],raw=>array(raw,8,2**32)),recipient=array(value.recipient,5,2**32);
  const bytes=readFields(value,['rho','key_x','key_y','secret'],raw=>array(raw,32,256)),signature=array(value.signature,64,256);
  need(Array.isArray(value.siblings)&&value.siblings.length===6&&Reflect.ownKeys(value.siblings).length===7);
  const siblings=Array.from({length:6},(_,i)=>{const row=Object.getOwnPropertyDescriptor(value.siblings,String(i));need(row?.enumerable&&Object.hasOwn(row,'value'));return array(row.value,32,256);});
  const numbers=readFields(value,['epoch','amount','value','leaf_index'],u64);need(numbers.value===numbers.amount&&BigInt(numbers.value)>0n&&BigInt(numbers.leaf_index)<64n);
  normalizeOriginalAccountSignatureV2(signature.map(byte=>byte.toString(16).padStart(2,'0')).join(''));
  return Object.assign(value,words,bytes,numbers,{recipient,signature,siblings});}
/** @param {unknown} value @returns {void} */
export function wipeDeviceExitWitnessV1(value){if(value&&typeof value==='object'){
  const record=/** @type {Record<string,unknown>} */(value);for(const name of Object.keys(record)){
  if(record[name]&&typeof record[name]==='object')wipeDeviceExitWitnessV1(record[name]);record[name]=null;}}}
/** @param {unknown} raw @returns {Uint8Array} */
export function deviceExitWitnessBytesV1(raw){const value=normalizeDeviceExitWitnessV1(raw);try{const bytes=new TextEncoder().encode(JSON.stringify(value));need(bytes.length<=8192);return bytes;}
  finally{wipeDeviceExitWitnessV1(value);}}
/** @param {unknown} raw @returns {DeviceExitConsentV1['poolTerms']} */
function poolTerms(raw){const value=exact(raw,['scope','policy','codeHash','assetIdentity','domainCommitment']);
  return Object.assign(value,readFields(value,['scope','policy','codeHash','assetIdentity','domainCommitment'],raw=>hex(raw)));}
/** @param {unknown} raw @returns {DeviceExitConsentV1['observed']} */
function observed(raw){const value=exact(raw,['blockNumber','blockHash','timestamp']);
  const blockNumber=u64(value.blockNumber),blockHash=hex(value.blockHash),timestamp=u64(value.timestamp);
  return Object.assign(value,{blockNumber,blockHash,timestamp});}
/** @param {unknown} raw @returns {string} */
function nonzero(raw){const value=hex(raw);need(value!=='0'.repeat(64));return value;}
/** @param {unknown} raw @returns {DeviceExitConsentV1} */
export function normalizeDeviceExitConsentV1(raw){const value=exact(raw,['version','profile','action','origin','pairingId','devicePublicKey','challengeId','nonce','expiresAt',
  'binding','poolTerms','parentJobId','nativeBindingSHA256','quoteId','jobId','rootId','noteRevision','noteRole','statement','witnessSHA256','proofSHA256','publicInputsSHA256','observed','openingDisclosure']);
  need(value.version===1&&value.profile===DEVICE_EXIT_CONSENT_V1&&oneOf(value.action,/** @type {const} */(['PROVE_W39','WITHDRAW_W39','OBSERVE_W39'])));const origin=normalizeMobileOrigin(value.origin);
  const hashes=readFields(value,['pairingId','challengeId','nonce','parentJobId','nativeBindingSHA256','quoteId','jobId','rootId','witnessSHA256'],nonzero);
  need(typeof value.devicePublicKey==='string'&&/^04[0-9a-f]{128}$/.exec(value.devicePublicKey)?.[0]===value.devicePublicKey&&new Set([hashes.pairingId,hashes.challengeId,hashes.nonce]).size===3
    &&typeof value.expiresAt==='number'&&Number.isSafeInteger(value.expiresAt)&&value.expiresAt>0
    &&typeof value.noteRevision==='number'&&Number.isSafeInteger(value.noteRevision)&&value.noteRevision>=0&&oneOf(value.noteRole,/** @type {const} */(['change','recovery'])));
  const binding=normalizeOriginalAccountBindingV2(value.binding),terms=poolTerms(value.poolTerms),statement=normalizeDeviceExitStatementV1(value.statement);
  need(statement.scope===terms.scope&&statement.policy===terms.policy);const observation=observed(value.observed);
  /** @type {string|null} */let proofSHA256=null;
  /** @type {string|null} */let publicInputsSHA256=null;
  /** @type {DeviceExitConsentV1['openingDisclosure']} */let openingDisclosure=null;
  if(value.action==='PROVE_W39'){
    need(value.proofSHA256===null&&value.publicInputsSHA256===null&&value.openingDisclosure===DEVICE_EXIT_DISCLOSURE_V1
      &&statement.epoch===(BigInt(observation.timestamp)/600n).toString());openingDisclosure=value.openingDisclosure;
  }else{need(value.openingDisclosure===null);
    if(value.proofSHA256===null&&value.publicInputsSHA256===null&&value.action==='OBSERVE_W39'){}
    else{proofSHA256=hex(value.proofSHA256);publicInputsSHA256=hex(value.publicInputsSHA256);}}
  /** @type {DeviceExitConsentV1} */
  const validated={version:value.version,profile:value.profile,action:value.action,origin,...hashes,devicePublicKey:value.devicePublicKey,
    expiresAt:value.expiresAt,binding,poolTerms:terms,noteRevision:value.noteRevision,noteRole:value.noteRole,statement,
    proofSHA256,publicInputsSHA256,observed:observation,openingDisclosure};return freeze(Object.assign(value,validated));}
/** @param {unknown} raw @param {number} [now] @returns {DeviceExitConsentV1} */
export function validateDeviceExitConsentFreshV1(raw,now=Date.now()){const value=normalizeDeviceExitConsentV1(raw);
  need(Number.isSafeInteger(now)&&value.expiresAt>now&&value.expiresAt<=now+15000);return value;}
/** @param {unknown} raw @returns {Uint8Array} */
export function deviceExitConsentMessageV1(raw){const value=normalizeDeviceExitConsentV1(raw);
  /** @param {string} text */
  const ascii=text=>{need(/^[\x20-\x7e]*$/.exec(text)?.[0]===text);return Uint8Array.from(text,c=>c.charCodeAt(0));};
  /** @param {string} text */
  const bytes=text=>{const pairs=text.match(/../g);need(pairs);return Uint8Array.from(pairs,byte=>Number.parseInt(byte,16));};
  /** @param {string|number} value */
  const integer=value=>bytes(BigInt(value).toString(16).padStart(16,'0'));
  /** @param {string|null} value */
  const nullable=value=>value===null?new Uint8Array([0]):new Uint8Array([1,...bytes(value)]);
  const fields=[ascii(value.profile),new Uint8Array([1]),ascii(value.action),ascii(value.origin),bytes(value.pairingId),bytes(value.devicePublicKey),
    bytes(value.challengeId),bytes(value.nonce),integer(value.expiresAt),ascii(JSON.stringify(value.binding)),...Object.values(value.poolTerms).map(bytes),
    ...(/** @type {const} */(['parentJobId','nativeBindingSHA256','quoteId','jobId','rootId'])).map(name=>bytes(value[name])),integer(value.noteRevision),ascii(value.noteRole),
    ...(/** @type {const} */(['scope','policy'])).map(name=>bytes(value.statement[name])),integer(value.statement.epoch),bytes(value.statement.root),bytes(value.statement.nullifier),
    integer(value.statement.amount),bytes(value.statement.recipient),bytes(value.statement.commitment),bytes(value.witnessSHA256),nullable(value.proofSHA256),nullable(value.publicInputsSHA256),
    integer(value.observed.blockNumber),bytes(value.observed.blockHash),integer(value.observed.timestamp),value.openingDisclosure===null?new Uint8Array([0]):ascii(value.openingDisclosure)];
  const size=fields.reduce((sum,field)=>sum+4+field.length,0);need(size<=4096);const result=new Uint8Array(size),view=new DataView(result.buffer);let offset=0;
  for(const field of fields){view.setUint32(offset,field.length,false);offset+=4;result.set(field,offset);offset+=field.length;}return result;}
/** @param {unknown} raw @returns {DeviceExitQuoteV1} */
export function normalizeDeviceExitQuoteV1(raw){const value=exact(raw,['version','profile','origin','pairingId','devicePublicKey','quoteId','expiresAt',
  'parentJobId','nativeBindingSHA256','rootId','noteRevision','noteRole','nullifierSpent','statement','path','poolTerms','observed']);
  need(value.version===1&&value.profile==='LIANUM_DEVICE_ORIGINAL_W39_QUOTE_V1'&&value.nullifierSpent===false);const origin=normalizeMobileOrigin(value.origin);
  const hashes=readFields(value,['pairingId','quoteId','parentJobId','nativeBindingSHA256','rootId'],nonzero);
  need(typeof value.devicePublicKey==='string'&&/^04[0-9a-f]{128}$/.exec(value.devicePublicKey)?.[0]===value.devicePublicKey
    &&typeof value.expiresAt==='number'&&Number.isSafeInteger(value.expiresAt)&&value.expiresAt>0
    &&typeof value.noteRevision==='number'&&Number.isSafeInteger(value.noteRevision)&&value.noteRevision>=0&&oneOf(value.noteRole,/** @type {const} */(['change','recovery'])));
  const statement=normalizeDeviceExitStatementV1(value.statement),terms=poolTerms(value.poolTerms);
  need(statement.scope===terms.scope&&statement.policy===terms.policy);const observation=observed(value.observed);
  need(statement.epoch===(BigInt(observation.timestamp)/600n).toString());
  const path=exact(value.path,['root','index','leaf','siblings']),root=hex(path.root),leaf=hex(path.leaf);
  need(typeof path.index==='number'&&Number.isSafeInteger(path.index)&&path.index>=0&&path.index<64);
  need(Array.isArray(path.siblings)&&path.siblings.length===6&&Reflect.ownKeys(path.siblings).length===7);
  const siblings=Array.from({length:6},(_,i)=>{const row=Object.getOwnPropertyDescriptor(path.siblings,String(i));need(row?.enumerable&&Object.hasOwn(row,'value'));return hex(row.value);});
  need(root===statement.root&&leaf===statement.commitment);
  /** @type {DeviceExitQuoteV1} */
  const validated={version:value.version,profile:value.profile,origin,...hashes,devicePublicKey:value.devicePublicKey,expiresAt:value.expiresAt,
    noteRevision:value.noteRevision,noteRole:value.noteRole,nullifierSpent:value.nullifierSpent,statement,poolTerms:terms,observed:observation,
    path:Object.assign(path,{root,leaf,index:path.index,siblings})};return freeze(Object.assign(value,validated));}
/** @param {unknown} raw @returns {DeviceExitStatusV1} */
export function normalizeDeviceExitStatusV1(raw){const value=exact(raw,['jobId','stage','statement','consentFields','observation','errorCode','authorizationSHA256']);const jobId=hex(value.jobId);
  need(oneOf(value.stage,/** @type {const} */(['PROVING','PROVED','FAILED','WITHDRAWAL_UNKNOWN','CONFIRMED'])));const statement=normalizeDeviceExitStatementV1(value.statement);
  const fields=exact(value.consentFields,['parentJobId','nativeBindingSHA256','quoteId','jobId','rootId','noteRevision','noteRole','statement','witnessSHA256','proofSHA256','publicInputsSHA256']);
  const hashes=readFields(fields,['parentJobId','nativeBindingSHA256','quoteId','jobId','rootId','witnessSHA256'],raw=>hex(raw));need(hashes.jobId===jobId);
  need(typeof fields.noteRevision==='number'&&Number.isSafeInteger(fields.noteRevision)&&fields.noteRevision>=0&&oneOf(fields.noteRole,/** @type {const} */(['change','recovery'])));
  const fieldStatement=normalizeDeviceExitStatementV1(fields.statement);
  need(JSON.stringify(fieldStatement)===JSON.stringify(statement));need((fields.proofSHA256===null)===(fields.publicInputsSHA256===null));
  const proofSHA256=fields.proofSHA256===null?null:hex(fields.proofSHA256),publicInputsSHA256=fields.publicInputsSHA256===null?null:hex(fields.publicInputsSHA256);
  if(['PROVED','WITHDRAWAL_UNKNOWN','CONFIRMED'].includes(value.stage))need(proofSHA256!==null);
  const authorizationSHA256=hex(value.authorizationSHA256);need(value.errorCode===null||(typeof value.errorCode==='string'&&/^[A-Z0-9_]{1,160}$/.exec(value.errorCode)?.[0]===value.errorCode));
  need((value.stage==='CONFIRMED')===(value.observation!==null));
  const consentFields=Object.assign(fields,hashes,{noteRevision:fields.noteRevision,noteRole:fields.noteRole,statement:fieldStatement,proofSHA256,publicInputsSHA256});
  /** @type {DeviceExitStatusV1['observation']} */let observation=null;
  if(value.observation!==null){const frame=exact(value.observation,['profile','jobId','parentJobId','rootId','noteRole','commitment','nullifier','amount','recipient',
      'transactionHash','blockHash','blockNumber','calldataSHA256','timestamp','domainCommitment']);need(frame.profile==='LIANUM_DEVICE_ORIGINAL_W39_OBSERVATION_V1');
    const frameHashes=readFields(frame,['jobId','parentJobId','rootId','commitment','nullifier','transactionHash','blockHash','calldataSHA256','domainCommitment'],raw=>hex(raw)),recipient=hex(frame.recipient,40);
    const amounts=readFields(frame,['amount','blockNumber','timestamp'],u64);
    need(frameHashes.jobId===jobId&&frameHashes.parentJobId===hashes.parentJobId&&frameHashes.rootId===hashes.rootId&&frame.noteRole===consentFields.noteRole);
    for(const name of /** @type {const} */(['commitment','nullifier','amount','recipient']))need(frame[name]===fieldStatement[name]);
    /** @type {NonNullable<DeviceExitStatusV1['observation']>} */
    const validatedObservation={profile:frame.profile,...frameHashes,...amounts,recipient,noteRole:consentFields.noteRole};observation=Object.assign(frame,validatedObservation);}
  /** @type {DeviceExitStatusV1} */
  const validated={jobId,stage:value.stage,statement,consentFields,observation,errorCode:value.errorCode,authorizationSHA256};return freeze(Object.assign(value,validated));}
