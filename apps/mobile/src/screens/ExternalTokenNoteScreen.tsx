import {createDeviceMorphoBlueRedemptionApiV1,createDeviceAaveStaticRedemptionApiV1} from '../api/device-morpho-blue-redemption-api-v1.mjs';
import type {DeviceMorphoBlueConsentV1,DeviceMorphoBlueStatusV1,DeviceAaveStaticConsentV1,DeviceAaveStaticStatusV1} from '../../../../packages/mobile-protocol/src/device-morpho-blue-redemption-v1.mjs';
import {useEffect,useRef,useState} from 'react';
import {ActivityIndicator,Alert,AppState,Pressable,SafeAreaView,ScrollView,StyleSheet,Text,TextInput,View} from 'react-native';
import {fetch as expoFetch} from 'expo/fetch';
import {readDevicePublicKey,exportDeviceIdentityBackupV1,importDeviceIdentityBackupV1,signDeviceExternalFlatPermissionV1,signDeviceExternalFlatGraphPermissionV1,signDeviceExternalFlatGraphOutputPermissionV1,signDeviceMorphoBlueRedemptionPermissionV1,signDeviceAaveStaticRedemptionPermissionV1} from '../custody/key-store';
import {createDeviceExternalFlatNoteVaultV1,createDeviceExternalFlatRoutedNoteVaultV1,restoreDeviceExternalFlatNoteBackupV1} from '../custody/device-external-flat-note-vault-v1';
import type {DeviceExternalFlatSummary,DeviceExternalFlatPrepared} from '../custody/device-external-flat-note-vault-v1';
import {createDeviceExternalFlatNoteApiV1,readDeviceExternalFlatQuoteV1} from '../api/device-external-flat-note-api-v1.mjs';
import {createDeviceExternalFlatGraphApiV1,readDeviceExternalFlatGraphQuoteV1} from '../api/device-external-flat-graph-api-v1.mjs';
import {validateExternalFlatGraphFreshV1,wipeDeviceReservationWitnessV1} from '../../../../packages/mobile-protocol/src/device-external-flat-graph-v1.mjs';
import {DEVICE_EXTERNAL_FLAT_NOTE_V1,DEVICE_EXTERNAL_FLAT_SHARE_V1,normalizeExternalFlatDescriptorV1,externalFlatExactV1,externalFlatUintV1,externalFlatWipeV1,validateExternalFlatFreshV1} from '../../../../packages/mobile-protocol/src/device-external-flat-note-v1.mjs';
import type {ExternalFlatAction,ExternalFlatConsent,ExternalFlatDraft,ExternalFlatStatus,ExternalFlatDescriptor} from '../../../../packages/mobile-protocol/src/device-external-flat-note-v1.mjs';

type Client=ReturnType<typeof createDeviceExternalFlatNoteApiV1>;
type Vault=Awaited<ReturnType<typeof createDeviceExternalFlatNoteVaultV1>>;
type GraphClient=ReturnType<typeof createDeviceExternalFlatGraphApiV1>;
type GraphConsent=Parameters<GraphClient['submit']>[0];
type GraphStatus=Awaited<ReturnType<GraphClient['status']>>;
type GraphAction=GraphConsent['draft']['action'];
type GraphPrepared=Awaited<ReturnType<Vault['prepareSourceGraph']>>;
type RecoveryCheckpoint=Awaited<ReturnType<Vault['recoveryCheckpoint']>>;
type RecoveryPreparation='SHARE'|'GRAPH';
type GraphOutputRole='change'|'recovery';
type GraphOutputAction='WITHDRAW_W39'|'OBSERVE_W39';
type GraphOutputConsent=Parameters<GraphClient['outputSubmit']>[0];
type GraphOutputPrepared=Awaited<ReturnType<Vault['prepareGraphOutputWithdrawal']>>;
type GraphOutputReview={consent:GraphOutputConsent;witness:unknown|null};
type GraphOutputView={noteRole:GraphOutputRole;amount:string;state:string;available:string|null};
type BlueClient=ReturnType<typeof createDeviceMorphoBlueRedemptionApiV1>;
type AaveClient=ReturnType<typeof createDeviceAaveStaticRedemptionApiV1>;
type Connection={aaveClient:AaveClient|null;blueClient:BlueClient|null;client:Client;graphClient:GraphClient|null;noteClosed:boolean;vault:Vault;descriptor:ExternalFlatDescriptor};
type GraphReview={consent:GraphConsent;witness:unknown|null};
type Review={consent:ExternalFlatConsent;witness:unknown|null};
type MetaFourDelivery={id:string;dependsOn:string[];origin:string;maximumInput:string;shareAmount:string;payoutAmount:string};
type MetaFourPairing={profile:'DEVICE_EXTERNAL_FLAT_META_FOUR_PAIRING_V1';source:ExternalFlatDescriptor;targets:ExternalFlatDescriptor[];deliveries:MetaFourDelivery[]};
type MetaFourWindow={validFrom:string;validUntil:string;settleBefore:string};
/** Public pairing DATA chooses a local connection. Only its original SDK can
 * authenticate a response or authorize a proof; this package is no receipt. */
function parseMetaFourPairing(text:string):MetaFourPairing{
 if(typeof text!=='string'||text.length===0||text.length>32768)throw Error('MOBILE_META_FOUR_PAIRING_INVALID');
 const p=externalFlatExactV1(JSON.parse(text),['profile','source','targets','deliveries']);
 if(p.profile!=='DEVICE_EXTERNAL_FLAT_META_FOUR_PAIRING_V1'||!Array.isArray(p.targets)||p.targets.length!==4||!Array.isArray(p.deliveries)||p.deliveries.length!==4)throw Error('MOBILE_META_FOUR_PAIRING_INVALID');
 const source=normalizeExternalFlatDescriptorV1(p.source),targets:ExternalFlatDescriptor[]=p.targets.map(normalizeExternalFlatDescriptorV1);
 if(source.profile!==DEVICE_EXTERNAL_FLAT_NOTE_V1||targets[0].origin!==source.origin||new Set(targets.map(v=>v.origin)).size!==4||new Set([source,...targets].map(v=>v.pairingId)).size!==5)throw Error('MOBILE_META_FOUR_PAIRING_INVALID');
 const dependencies=[[],['device-external-share-0'],['device-external-share-0'],['device-external-share-1','device-external-share-2']];
 const deliveries:MetaFourDelivery[]=p.deliveries.map((raw:unknown,slot:number)=>{
  const d=externalFlatExactV1(raw,['id','dependsOn','origin','maximumInput','shareAmount','payoutAmount']),target=targets[slot];
  if(target.profile!==DEVICE_EXTERNAL_FLAT_SHARE_V1||target.devicePublicKey!==source.devicePublicKey||JSON.stringify(target.poolTerms)!==JSON.stringify(targets[0].poolTerms)||JSON.stringify(target.assetMetadata)!==JSON.stringify(targets[0].assetMetadata)
   ||['genesis','hub','hubCodeHash','hubDomain'].some(k=>target.poolTerms[k as keyof ExternalFlatDescriptor['poolTerms']]!==source.poolTerms[k as keyof ExternalFlatDescriptor['poolTerms']])
   ||d.id!=='device-external-share-'+slot||d.origin!==target.origin||JSON.stringify(d.dependsOn)!==JSON.stringify(dependencies[slot])||['maximumInput','shareAmount','payoutAmount'].some(k=>d[k]!=='100'))throw Error('MOBILE_META_FOUR_PAIRING_INVALID');
  return {id:d.id,dependsOn:[...d.dependsOn],origin:d.origin,maximumInput:d.maximumInput,shareAmount:d.shareAmount,payoutAmount:d.payoutAmount};
 });return {profile:p.profile,source,targets,deliveries};
}
type AavePairing={profile:'DEVICE_EXTERNAL_FLAT_AAVE_PAIRING_V1';source:ExternalFlatDescriptor;target:ExternalFlatDescriptor};
function parseAavePairing(text:string):AavePairing{
 if(typeof text!=='string'||text.length===0||text.length>32768)throw Error('MOBILE_AAVE_PAIRING_INVALID');const p=externalFlatExactV1(JSON.parse(text),['profile','source','target']),source=normalizeExternalFlatDescriptorV1(p.source),target=normalizeExternalFlatDescriptorV1(p.target);
 if(p.profile!=='DEVICE_EXTERNAL_FLAT_AAVE_PAIRING_V1'||source.profile!==DEVICE_EXTERNAL_FLAT_NOTE_V1||target.profile!==DEVICE_EXTERNAL_FLAT_SHARE_V1||source.devicePublicKey!==target.devicePublicKey||source.origin!==target.origin||source.pairingId===target.pairingId||source.poolTerms.pool===target.poolTerms.pool||source.poolTerms.assetIdentity===target.poolTerms.assetIdentity||['genesis','hub','hubCodeHash','hubDomain'].some(k=>source.poolTerms[k as keyof ExternalFlatDescriptor['poolTerms']]!==target.poolTerms[k as keyof ExternalFlatDescriptor['poolTerms']]))throw Error('MOBILE_AAVE_PAIRING_INVALID');return {profile:p.profile,source,target};
}
function Button({label,onPress,disabled=false}:{label:string;onPress():void;disabled?:boolean}) {
 return <Pressable accessibilityRole="button" accessibilityState={{disabled}} disabled={disabled} onPress={onPress}
  style={[styles.button,disabled&&styles.disabled]}><Text style={styles.buttonText}>{label}</Text></Pressable>;
}
function Fields({values}:{values:Record<string,string>}) {
 return <>{Object.entries(values).map(([label,value])=><View key={label}><Text style={styles.label}>{label}</Text><Text selectable style={styles.value}>{value}</Text></View>)}</>;
}
function amountText(amount:string|null,descriptor:ExternalFlatDescriptor|null) {
 if(amount===null||descriptor===null)return 'No disponible';
 const n=descriptor.assetMetadata.decimals,digits=amount.padStart(n+1,'0');
 const exact=n===0?digits:digits.slice(0,-n)+'.'+digits.slice(-n);
 return exact+' '+descriptor.assetMetadata.symbol;
}
const actionText:Record<ExternalFlatAction,string>={PROVE_D26:'Generar prueba de financiación',FUND_D26:'Financiar esta nota',OBSERVE_D26:'Consultar esta financiación',PROVE_D27:'Autorizar recepción de participación',OBSERVE_D27:'Consultar recepción de participación',QUOTE_W39:'Preparar la retirada completa',PROVE_W39:'Generar prueba de retirada',WITHDRAW_W39:'Retirar esta nota',OBSERVE_W39:'Consultar esta retirada'};
const stageText:Record<string,string>={PROVING:'Prueba pendiente de consultar',PROVED:'Prueba disponible',FUNDING_UNKNOWN:'Financiación pendiente de confirmar',DELIVERY_UNKNOWN:'Participación pendiente de confirmar',WITHDRAWAL_UNKNOWN:'Retirada pendiente de confirmar',CONFIRMED:'Confirmada',RESERVING:'Registro de reserva en curso',RESERVATION_UNKNOWN:'Reserva pendiente de confirmar',RESERVED:'Reserva confirmada',FAILED:'Prueba no completada'};
const graphActionText:Record<GraphAction,string>={PROVE_U:'Preparar la reserva privada',RESERVE_S:'Registrar la reserva',OBSERVE_S:'Consultar la reserva',EXECUTE_GRAPH:'Ejecutar la conversión',RECONCILE_GRAPH:'Consultar la conversión',RECOVER_GRAPH:'Recuperar la reserva vencida',CANCEL_GRAPH:'Liberar una reserva no enviada'};
const graphOutputRoleText:Record<GraphOutputRole,string>={change:'Cambio',recovery:'Recuperación'};
const graphOutputStateText:Record<string,string>={EMPTY:'Sin nota',UNISSUED:'No emitida',UNSPENT:'Disponible',LOCKED:'Bloqueada hasta resolución',SPENT:'Retirada',UNKNOWN:'Pendiente de confirmar'};
const graphStageText:Record<string,string>={PREPARED:'Preparada',EXECUTION_UNKNOWN:'Ejecución pendiente de confirmar',RECOVERY_UNKNOWN:'Recuperación pendiente de confirmar',FULFILLED:'Conversión confirmada',RECOVERED:'Reserva recuperada',SOURCE_CANCELLED:'Reserva no enviada liberada'};
export default function ExternalTokenNoteScreen({onObservation,onGraphObservation,onSourcePending}:{onObservation?(value:ExternalFlatStatus):void;onGraphObservation?(value:GraphStatus):void|Promise<void>;onSourcePending?(descriptor:ExternalFlatDescriptor,rootId:string):void}={}) {
 const [descriptorText,setDescriptorText]=useState(''),[recipient,setRecipient]=useState(''),[amount,setAmount]=useState(''),[validUntil,setValidUntil]=useState('');
 const [connected,setConnected]=useState(false),[summary,setSummary]=useState<DeviceExternalFlatSummary|null>(null);
 const [review,setReview]=useState<ExternalFlatConsent|null>(null),[status,setStatus]=useState<ExternalFlatStatus|null>(null);
 const [graphReview,setGraphReview]=useState<GraphConsent|null>(null),[graphStatus,setGraphStatus]=useState<GraphStatus|null>(null);
 const [blueStatus,setBlueStatus]=useState<DeviceMorphoBlueStatusV1|null>(null),[blueReview,setBlueReview]=useState<DeviceMorphoBlueConsentV1|null>(null),[blueMinimum,setBlueMinimum]=useState('');
 const blueReviewRef=useRef<DeviceMorphoBlueConsentV1|null>(null);
 const [aaveStatus,setAaveStatus]=useState<DeviceAaveStaticStatusV1|null>(null),[aaveReview,setAaveReview]=useState<DeviceAaveStaticConsentV1|null>(null),[aaveMinimum,setAaveMinimum]=useState('');const aaveReviewRef=useRef<DeviceAaveStaticConsentV1|null>(null);
 const [graphOutputReview,setGraphOutputReview]=useState<GraphOutputConsent|null>(null);
 const [graphAssetAmount,setGraphAssetAmount]=useState(''),[graphShareAmount,setGraphShareAmount]=useState(''),[graphPayoutAmount,setGraphPayoutAmount]=useState(''),[graphValidFrom,setGraphValidFrom]=useState(''),[graphSettleBefore,setGraphSettleBefore]=useState('');
 const [busy,setBusy]=useState(false),[notice,setNotice]=useState('Introduce la conexión privada entregada por tu operador.');
 const [recoveryPassword,setRecoveryPassword]=useState(''),[recoveryInput,setRecoveryInput]=useState(''),[recoveryCopy,setRecoveryCopy]=useState('');
 const [recoveryPreparation,setRecoveryPreparation]=useState<RecoveryPreparation|null>(null);
 const [custodyRoute,setCustodyRoute]=useState<'LEGACY'|'ROUTED'>('LEGACY');
 const [metaFourText,setMetaFourText]=useState(''),[metaFour,setMetaFour]=useState<MetaFourPairing|null>(null),[metaFourWindow,setMetaFourWindow]=useState<MetaFourWindow|null>(null),[metaFourReads,setMetaFourReads]=useState<(ExternalFlatStatus|null)[]>([null,null,null,null]);
 const metaFourRef=useRef<MetaFourPairing|null>(null),metaFourWindowRef=useRef<MetaFourWindow|null>(null);
 const [aaveText,setAaveText]=useState(''),[aavePairing,setAavePairing]=useState<AavePairing|null>(null),aaveRef=useRef<AavePairing|null>(null),aaveWindowRef=useRef<{validFrom:string;validUntil:string;amount:string}|null>(null);
 const mounted=useRef(true),busyRef=useRef(false),epoch=useRef(0),connection=useRef<Connection|null>(null);
 const acquiring=useRef<Promise<Vault>|null>(null),closing=useRef<Promise<unknown>|null>(null),signing=useRef<AbortController|null>(null);
 const graphReviewRef=useRef<GraphReview|null>(null),graphPreparedRef=useRef<GraphPrepared|null>(null);
 const graphOutputReviewRef=useRef<GraphOutputReview|null>(null),graphOutputPreparedRef=useRef<GraphOutputPrepared|null>(null);
 const reviewRef=useRef<Review|null>(null),preparedRef=useRef<DeviceExternalFlatPrepared|null>(null),activeWitness=useRef<unknown|null>(null);
 const recoveryCut=useRef<{selected:Connection;kind:RecoveryPreparation;prepared:DeviceExternalFlatPrepared|GraphPrepared;checkpoint:RecoveryCheckpoint}|null>(null);
 function clearReview() {
  blueReviewRef.current=null;if(mounted.current)setBlueReview(null);aaveReviewRef.current=null;if(mounted.current)setAaveReview(null);
  recoveryCut.current=null;if(mounted.current)setRecoveryPreparation(null);
  signing.current?.abort();signing.current=null;
  externalFlatWipeV1(graphOutputReviewRef.current?.witness);externalFlatWipeV1(graphOutputPreparedRef.current?.witness);graphOutputReviewRef.current=null;graphOutputPreparedRef.current=null;if(mounted.current)setGraphOutputReview(null);
  wipeDeviceReservationWitnessV1(graphReviewRef.current?.witness);wipeDeviceReservationWitnessV1(graphPreparedRef.current?.witness);graphReviewRef.current=null;graphPreparedRef.current=null;if(mounted.current)setGraphReview(null);
  externalFlatWipeV1(reviewRef.current?.witness);externalFlatWipeV1(preparedRef.current?.witness);externalFlatWipeV1(activeWitness.current);activeWitness.current=null;
  reviewRef.current=null;preparedRef.current=null;if(mounted.current)setReview(null);
 }
 function hideRecovery(){setRecoveryPassword('');setRecoveryInput('');setRecoveryCopy('');}
 function closeConnection() {
  epoch.current++;clearReview();if(mounted.current)hideRecovery();const selected=connection.current;connection.current=null;
  selected?.aaveClient?.close();selected?.blueClient?.close();selected?.graphClient?.close();selected?.client.close();const acquisition=acquiring.current;acquiring.current=null;
  const previous=closing.current;
  const drain=Promise.allSettled([previous,selected?.vault.close(),acquisition?.then(v=>v.close())]);closing.current=drain;
  if(mounted.current){setConnected(false);setStatus(null);setGraphStatus(null);setBlueStatus(null);setAaveStatus(null);}
  void drain.then(()=>{if(closing.current===drain)closing.current=null;});return drain;
 }
 function current(ticket:number,selected:Connection) {
  if(!mounted.current||AppState.currentState!=='active'||epoch.current!==ticket||connection.current!==selected)throw Error('MOBILE_EXTERNAL_FLAT_CONTEXT_CHANGED');
 }
 function requireConnection() {const selected=connection.current;if(!selected)throw Error('MOBILE_EXTERNAL_FLAT_CONNECTION_REQUIRED');return selected;}
 function clearMetaFour(){metaFourRef.current=null;metaFourWindowRef.current=null;setMetaFour(null);setMetaFourWindow(null);setMetaFourReads([null,null,null,null]);}
 function metaFourSlot(descriptor:ExternalFlatDescriptor){return metaFourRef.current?.targets.findIndex(v=>JSON.stringify(v)===JSON.stringify(descriptor))??-1;}
 function retainMetaFourWindow(window:MetaFourWindow){
  externalFlatUintV1(window.validFrom);externalFlatUintV1(window.validUntil);externalFlatUintV1(window.settleBefore);
  if(BigInt(window.validFrom)>=BigInt(window.validUntil)||BigInt(window.validUntil)+60n!==BigInt(window.settleBefore)||metaFourWindowRef.current&&JSON.stringify(metaFourWindowRef.current)!==JSON.stringify(window))throw Error('MOBILE_META_FOUR_WINDOW_CHANGED');
  metaFourWindowRef.current=window;setMetaFourWindow(window);setGraphValidFrom(window.validFrom);setGraphSettleBefore(window.settleBefore);setValidUntil(window.validUntil);setGraphAssetAmount('400');setGraphShareAmount('400');setGraphPayoutAmount('400');
 }
 function recordMetaFourStatus(value:ExternalFlatStatus){
  const slot=metaFourSlot(value.descriptor);if(slot<0)return;const intent=value.jobs.find(v=>v.mode==='deposit_intent');
  if(intent){const s=intent.consentFields.statement;if(s.amount!=='100'||s.validFrom===undefined||s.validUntil===undefined)throw Error('MOBILE_META_FOUR_TARGET_CHANGED');retainMetaFourWindow({validFrom:s.validFrom,validUntil:s.validUntil,settleBefore:(BigInt(s.validUntil)+60n).toString()});}
  setMetaFourReads(previous=>previous.map((v,i)=>i===slot?value:v));
 }
 function invalidateMetaFourStatus(descriptor:ExternalFlatDescriptor){const slot=metaFourSlot(descriptor);if(slot>=0)setMetaFourReads(previous=>previous.map((v,i)=>i===slot?null:v));}
 function clearAave(){aaveRef.current=null;aaveWindowRef.current=null;setAavePairing(null);}
 async function loadAave(){
  const p=parseAavePairing(aaveText),ticket=epoch.current,key=await readDevicePublicKey();if(!mounted.current||epoch.current!==ticket||AppState.currentState!=='active')throw Error('MOBILE_EXTERNAL_FLAT_CONTEXT_CHANGED');if(key!==p.source.devicePublicKey)throw Error('MOBILE_EXTERNAL_FLAT_DEVICE_REQUIRED');const drain=closeConnection(),held=epoch.current;await drain;if(!mounted.current||epoch.current!==held||AppState.currentState!=='active')throw Error('MOBILE_EXTERNAL_FLAT_CONTEXT_CHANGED');clearMetaFour();clearAave();aaveRef.current=p;setAavePairing(p);setCustodyRoute('ROUTED');setGraphValidFrom('');setGraphSettleBefore('');setDescriptorText(JSON.stringify(p.source));setSummary(null);await connect(JSON.stringify(p.source),'ROUTED');
 }
 async function selectAave(role:'source'|'target'){
  const p=aaveRef.current;if(!p)throw Error('MOBILE_AAVE_PAIRING_INVALID');const descriptor=p[role],text=JSON.stringify(descriptor);setDescriptorText(text);setSummary(null);await connect(text,'ROUTED');const selected=requireConnection(),ticket=epoch.current;current(ticket,selected);if(JSON.stringify(selected.descriptor)!==text)throw Error('MOBILE_EXTERNAL_FLAT_CONTEXT_CHANGED');
  if(role==='target'){const value=await readStatus(selected,ticket),intent=value.jobs.find(v=>v.mode==='deposit_intent');if(intent){const t=intent.consentFields.statement;if(t.validFrom===undefined||t.validUntil===undefined)throw Error('MOBILE_AAVE_RECEPTION_REQUIRED');const w={validFrom:t.validFrom,validUntil:t.validUntil,amount:t.amount};if(aaveWindowRef.current&&JSON.stringify(aaveWindowRef.current)!==JSON.stringify(w))throw Error('MOBILE_AAVE_RECEPTION_CHANGED');aaveWindowRef.current=w;setGraphShareAmount(w.amount);setGraphValidFrom(w.validFrom);setGraphSettleBefore((BigInt(w.validUntil)+60n).toString());}}
 }
 async function loadMetaFour(){
  const pairing=parseMetaFourPairing(metaFourText),ticket=epoch.current,key=await readDevicePublicKey();
  if(!mounted.current||epoch.current!==ticket||AppState.currentState!=='active')throw Error('MOBILE_EXTERNAL_FLAT_CONTEXT_CHANGED');
  if(key!==pairing.source.devicePublicKey)throw Error('MOBILE_EXTERNAL_FLAT_DEVICE_REQUIRED');
  const drain=closeConnection(),held=epoch.current;await drain;if(!mounted.current||epoch.current!==held||AppState.currentState!=='active')throw Error('MOBILE_EXTERNAL_FLAT_CONTEXT_CHANGED');clearMetaFour();clearAave();metaFourRef.current=pairing;setMetaFour(pairing);
  setGraphAssetAmount('400');setGraphShareAmount('400');setGraphPayoutAmount('400');setGraphValidFrom('');setGraphSettleBefore('');setDescriptorText(JSON.stringify(pairing.source));setSummary(null);await connect(JSON.stringify(pairing.source));
 }
 async function selectMetaFour(slot:number){
  const pairing=metaFourRef.current;if(!pairing||!Number.isInteger(slot)||slot< -1||slot>3)throw Error('MOBILE_META_FOUR_PAIRING_INVALID');
  const descriptor=slot===-1?pairing.source:pairing.targets[slot],text=JSON.stringify(descriptor);setDescriptorText(text);setSummary(null);await connect(text);
 }
 useEffect(()=>{mounted.current=true;const sub=AppState.addEventListener('change',value=>{if(value!=='active'){
  closeConnection();setMetaFourReads([null,null,null,null]);setNotice('Conexión cerrada. La nota y las operaciones pendientes se conservan en el dispositivo.');
 }});return()=>{mounted.current=false;closeConnection();sub.remove();};},[]);
 useEffect(()=>{if(!review)return;const selected=reviewRef.current,timer=setTimeout(()=>{if(mounted.current&&reviewRef.current===selected){
  clearReview();setNotice('Permiso caducado. Solicita una nueva revisión de la operación.');
 }},Math.max(0,review.expiresAt-Date.now()));return()=>clearTimeout(timer);},[review]);
 useEffect(()=>{if(!graphReview)return;const selected=graphReviewRef.current,timer=setTimeout(()=>{if(mounted.current&&graphReviewRef.current===selected){clearReview();setNotice('Permiso de reserva caducado. Solicita otra revisión de la misma operación.');}},Math.max(0,graphReview.expiresAt-Date.now()));return()=>clearTimeout(timer);},[graphReview]);
 useEffect(()=>{if(!graphOutputReview)return;const selected=graphOutputReviewRef.current,timer=setTimeout(()=>{if(mounted.current&&graphOutputReviewRef.current===selected){clearReview();setNotice('Permiso de retirada caducado. Solicita otra revisión de la misma salida.');}},Math.max(0,graphOutputReview.consent.expiresAt-Date.now()));return()=>clearTimeout(timer);},[graphOutputReview]);
 useEffect(()=>{if(!blueReview)return;const value=blueReview,timer=setTimeout(()=>{if(mounted.current&&blueReviewRef.current===value){clearReview();setNotice('Permiso de redención caducado. Consulta el estado original antes de otra revisión.');}},Math.max(0,value.expiresAt-Date.now()));return()=>clearTimeout(timer);},[blueReview]);
 useEffect(()=>{if(!blueStatus)return;const value=blueStatus,timer=setTimeout(()=>{if(mounted.current)setBlueStatus(current=>current===value?null:current);},Math.max(0,value.expiresAt-Date.now()));return()=>clearTimeout(timer);},[blueStatus]);
 useEffect(()=>{if(!aaveReview)return;const value=aaveReview,timer=setTimeout(()=>{if(mounted.current&&aaveReviewRef.current===value){clearReview();setNotice('Permiso de redención caducado. Consulta el estado original antes de otra revisión.');}},Math.max(0,value.expiresAt-Date.now()));return()=>clearTimeout(timer);},[aaveReview]);
 useEffect(()=>{if(!aaveStatus)return;const value=aaveStatus,timer=setTimeout(()=>{if(mounted.current)setAaveStatus(current=>current===value?null:current);},Math.max(0,value.expiresAt-Date.now()));return()=>clearTimeout(timer);},[aaveStatus]);
 useEffect(()=>{if(!status)return;const value=status,timer=setTimeout(()=>{if(mounted.current)setStatus(current=>current===value?null:current);},Math.max(0,status.expiresAt-Date.now()));return()=>clearTimeout(timer);},[status]);
 useEffect(()=>{if(!graphStatus)return;const value=graphStatus,timer=setTimeout(()=>{if(mounted.current)setGraphStatus((current:GraphStatus|null)=>current===value?null:current);},Math.max(0,graphStatus.expiresAt-Date.now()));return()=>clearTimeout(timer);},[graphStatus]);
 useEffect(()=>{const pending=metaFourReads.filter((v):v is ExternalFlatStatus=>v!==null&&v.expiresAt>Date.now());if(!pending.length)return;const timer=setTimeout(()=>{if(mounted.current)setMetaFourReads(previous=>previous.map(v=>v&&v.expiresAt>Date.now()?v:null));},Math.max(0,Math.min(...pending.map(v=>v.expiresAt))-Date.now()));return()=>clearTimeout(timer);},[metaFourReads]);
 async function run(work:()=>Promise<void>,failureNotice='No se ha confirmado el resultado. Vuelve a conectar y consulta la misma operación; no repitas el envío.') {
  if(busyRef.current||AppState.currentState!=='active')return;busyRef.current=true;setBusy(true);
  try{await work();}catch{closeConnection();if(mounted.current)setNotice(failureNotice);}
  finally{busyRef.current=false;if(mounted.current)setBusy(false);}
 }
 async function sign(selected:Connection,value:ExternalFlatConsent|Awaited<ReturnType<Client['challenge']>>,ticket:number) {
  current(ticket,selected);const controller=new AbortController();signing.current=controller;
  try{const signature=await signDeviceExternalFlatPermissionV1(value,selected.descriptor.origin,selected.descriptor.pairingId,controller.signal);
   current(ticket,selected);return signature;
  }finally{if(signing.current===controller)signing.current=null;}
 }
 async function readStatus(selected:Connection,ticket:number) {
  if(selected.noteClosed)throw Error('MOBILE_EXTERNAL_FLAT_SOURCE_RESERVED');
  const access=await selected.client.challenge();current(ticket,selected);
  const signature=await sign(selected,access,ticket);const value=await selected.client.status(access,signature);current(ticket,selected);
  const local=await selected.vault.reconcileOriginalStatus(value);current(ticket,selected);
  recordMetaFourStatus(value);setSummary(local);setStatus(value);onObservation?.(value);return value;
 }
 function requireGraph(selected:Connection){if(!selected.graphClient)throw Error('MOBILE_EXTERNAL_FLAT_GRAPH_SOURCE_REQUIRED');return selected.graphClient;}
 async function signGraph(selected:Connection,value:GraphConsent,ticket:number){
  current(ticket,selected);const controller=new AbortController();signing.current=controller;
  try{const signature=await signDeviceExternalFlatGraphPermissionV1(value,selected.descriptor.origin,selected.descriptor.pairingId,controller.signal);current(ticket,selected);return signature;}
  finally{if(signing.current===controller)signing.current=null;}
 }
 async function readGraphStatus(selected:Connection,ticket:number){
  const client=requireGraph(selected),access=await client.challenge();current(ticket,selected);const signature=await sign(selected,access,ticket);
  const value=await client.status(access,signature);current(ticket,selected);const local=await selected.vault.acceptSourceGraphStatus(value);current(ticket,selected);
  if(local.graph?.row&&local.graph.row.graph.stage!=='SOURCE_CANCELLED'){selected.client.close();selected.noteClosed=true;setStatus(null);}
  await onGraphObservation?.(value);current(ticket,selected);setSummary(local);setGraphStatus(value);
  if(local.graph?.row?.graph.stage==='SOURCE_CANCELLED')await readReleasedSource(selected,ticket);return value;
 }
 async function readReleasedSource(selected:Connection,ticket:number){
  current(ticket,selected);if(selected.noteClosed){selected.client=createDeviceExternalFlatNoteApiV1({descriptor:selected.descriptor,fetchImpl:expoFetch});selected.noteClosed=false;}
  const original=await readStatus(selected,ticket);if(original.graphClaimed)throw Error('MOBILE_EXTERNAL_FLAT_RELEASE_UNCONFIRMED');return original;
 }
 async function makeGraphReview(selected:Connection,draft:GraphConsent['draft'],ticket:number,witness:unknown|null){
  const client=requireGraph(selected),access=await client.challenge();current(ticket,selected);const signature=await sign(selected,access,ticket);
  const consent=await client.review(access,signature,draft);current(ticket,selected);graphReviewRef.current={consent,witness};graphPreparedRef.current=null;setGraphReview(consent);setNotice('Comprueba el importe reservado, las participaciones y el plazo antes de autorizar.');
 }
 async function prepareGraph(){
  const selected=requireConnection();clearReview();const ticket=epoch.current,value=await readStatus(selected,ticket);if(value.graphClaimed)throw Error('MOBILE_EXTERNAL_FLAT_SOURCE_RESERVED');
  if(aaveRef.current&&JSON.stringify(selected.descriptor)!==JSON.stringify(aaveRef.current.source))throw Error('MOBILE_AAVE_SOURCE_REQUIRED');
  const local=await selected.vault.summary();current(ticket,selected);const deposit=local.jobs.find(row=>row.mode==='deposit_balance');if(!deposit||deposit.stage!=='CONFIRMED')throw Error('MOBILE_EXTERNAL_FLAT_SOURCE_REQUIRED');
  const client=requireGraph(selected),access=await client.challenge();current(ticket,selected);const signature=await sign(selected,access,ticket);
  const pairing=metaFourRef.current,window=metaFourWindowRef.current;if(pairing&&(JSON.stringify(selected.descriptor)!==JSON.stringify(pairing.source)||!window))throw Error('MOBILE_META_FOUR_WINDOW_REQUIRED');
  if(aaveRef.current){const w=aaveWindowRef.current;if(!w||graphShareAmount!==w.amount||graphValidFrom!==w.validFrom||graphSettleBefore!==(BigInt(w.validUntil)+60n).toString())throw Error('MOBILE_AAVE_RECEPTION_REQUIRED');}
  const quote=await client.preparation(access,signature,{depositJobId:deposit.jobId,rootId:local.rootId,assetAmount:pairing?'400':graphAssetAmount,shareAmount:pairing?'400':graphShareAmount,payoutAmount:pairing?'400':graphPayoutAmount,validFrom:window?.validFrom??graphValidFrom,settleBefore:window?.settleBefore??graphSettleBefore});current(ticket,selected);
  if(pairing){const q=readDeviceExternalFlatGraphQuoteV1(quote).quote;if(q.proposal.nodes.length!==4||q.proposal.nodes.some((n:any,slot:number)=>n.id!==pairing.deliveries[slot].id||JSON.stringify(n.dependsOn)!==JSON.stringify(pairing.deliveries[slot].dependsOn)||n.payout.value!==pairing.deliveries[slot].payoutAmount))throw Error('MOBILE_META_FOUR_ORIGINAL_QUOTE_CHANGED');}
  const prepared=await selected.vault.prepareSourceGraph(quote);graphPreparedRef.current=prepared;current(ticket,selected);const next=await selected.vault.summary();current(ticket,selected);setSummary(next);
  setRecoveryPreparation('GRAPH');setNotice('Guarda una copia actualizada que incluya el cambio y la recuperación recién preparados. Después podrás revisar la autorización de la reserva.');
 }
 async function requestGraphAction(action:GraphAction){const selected=requireConnection();clearReview();const ticket=epoch.current,draft=await selected.vault.sourceGraphDraft(action);current(ticket,selected);await makeGraphReview(selected,draft,ticket,null);}
 async function submitGraph(value:GraphReview){
  const selected=requireConnection();if(graphReviewRef.current!==value)throw Error('MOBILE_EXTERNAL_FLAT_PERMISSION_CHANGED');const ticket=epoch.current;current(ticket,selected);validateExternalFlatGraphFreshV1(value.consent);
  graphReviewRef.current=null;activeWitness.current=value.witness;setGraphReview(null);
  try{if(value.consent.draft.action==='PROVE_U')await verifyRecoveryCut(selected,'GRAPH',value.witness,ticket);
   const signature=await signGraph(selected,value.consent,ticket);if(value.consent.draft.action==='PROVE_U')await verifyRecoveryCut(selected,'GRAPH',value.witness,ticket);
   if(metaFourRef.current)setMetaFourReads([null,null,null,null]);onSourcePending?.(selected.descriptor,value.consent.draft.rootId);await selected.vault.latchSourceGraph(value.consent);current(ticket,selected);recoveryCut.current=null;setRecoveryPreparation(null);
   selected.client.close();selected.noteClosed=true;setStatus(null);setGraphStatus(null);const local=await selected.vault.summary();current(ticket,selected);setSummary(local);
   const row=await requireGraph(selected).submit(value.consent,signature,value.witness);current(ticket,selected);const next=await selected.vault.acceptSourceGraph(row);current(ticket,selected);setSummary(next);
   if(row.graph.stage==='SOURCE_CANCELLED')await readReleasedSource(selected,ticket);
   setNotice(row.graph.stage==='SOURCE_CANCELLED'?'La reserva no enviada quedó liberada. La retirada original está disponible tras su nueva consulta.':row.graph.outcome==='FULFILLED'?'Conversión confirmada. Consulta la participación en su conexión privada.':row.graph.outcome==='RECOVERED'?'Reserva recuperada. Su nota de recuperación conserva la clave en este dispositivo.':'Operación de reserva guardada. Consulta el mismo resultado antes de continuar.');
  }finally{wipeDeviceReservationWitnessV1(value.witness);if(activeWitness.current===value.witness)activeWitness.current=null;}
 }
 async function makeGraphOutputReview(selected:Connection,draft:GraphOutputPrepared['draft'],ticket:number,witness:unknown|null){
  const client=requireGraph(selected),access=await client.challenge();current(ticket,selected);const signature=await sign(selected,access,ticket);
  const consent=await client.outputReview(access,signature,draft);current(ticket,selected);graphOutputReviewRef.current={consent,witness};graphOutputPreparedRef.current=null;setGraphOutputReview(consent);setNotice('Comprueba la salida, el importe completo y la dirección fijada antes de autorizar.');
 }
 async function prepareGraphOutput(noteRole:GraphOutputRole){
  const selected=requireConnection();clearReview();const ticket=epoch.current,fresh=await readGraphStatus(selected,ticket);
  const output=fresh.jobs[0]?.outputs.find((value:GraphOutputView)=>value.noteRole===noteRole);if(!output||output.state!=='UNSPENT'||output.available===null)throw Error('MOBILE_EXTERNAL_FLAT_OUTPUT_NOT_AVAILABLE');
  const local=await selected.vault.summary();current(ticket,selected);if(local.recipient===null)throw Error('MOBILE_EXTERNAL_FLAT_BINDING');
  const client=requireGraph(selected),access=await client.challenge();current(ticket,selected);const signature=await sign(selected,access,ticket);
  const quote=await client.outputQuote(access,signature,{noteRole,recipient:local.recipient});current(ticket,selected);
  const prepared=await selected.vault.prepareGraphOutputWithdrawal(quote);graphOutputPreparedRef.current=prepared;current(ticket,selected);
  const next=await selected.vault.summary();current(ticket,selected);setSummary(next);await makeGraphOutputReview(selected,prepared.draft,ticket,prepared.witness);
 }
 async function requestGraphOutput(noteRole:GraphOutputRole,action:GraphOutputAction){
  const selected=requireConnection();clearReview();const ticket=epoch.current,draft=await selected.vault.graphOutputDraft(noteRole,action);current(ticket,selected);await makeGraphOutputReview(selected,draft,ticket,null);
 }
 async function signGraphOutput(selected:Connection,value:GraphOutputConsent,ticket:number){
  current(ticket,selected);const controller=new AbortController();signing.current=controller;
  try{const signature=await signDeviceExternalFlatGraphOutputPermissionV1(value,selected.descriptor.origin,selected.descriptor.pairingId,controller.signal);current(ticket,selected);return signature;}
  finally{if(signing.current===controller)signing.current=null;}
 }
 async function submitGraphOutput(value:GraphOutputReview){
  const selected=requireConnection();if(graphOutputReviewRef.current!==value)throw Error('MOBILE_EXTERNAL_FLAT_PERMISSION_CHANGED');const ticket=epoch.current;current(ticket,selected);validateExternalFlatFreshV1(value.consent.consent);
  graphOutputReviewRef.current=null;activeWitness.current=value.witness;setGraphOutputReview(null);
  try{const signature=await signGraphOutput(selected,value.consent,ticket);onSourcePending?.(selected.descriptor,value.consent.consent.rootId);await selected.vault.latchGraphOutput(value.consent);current(ticket,selected);
   selected.client.close();selected.noteClosed=true;setStatus(null);setGraphStatus(null);const local=await selected.vault.summary();current(ticket,selected);setSummary(local);
   const row=await requireGraph(selected).outputSubmit(value.consent,signature,value.witness);current(ticket,selected);const next=await selected.vault.acceptGraphOutput(row);current(ticket,selected);setSummary(next);
   await readGraphStatus(selected,ticket);setNotice(row.row.stage==='CONFIRMED'?'Retirada de la salida confirmada en su dirección fijada.':row.row.stage==='PROVED'?'Prueba de retirada guardada. Revisa el envío de esta misma salida.':'Retirada pendiente. Consulta esta misma operación antes de continuar.');
  }finally{externalFlatWipeV1(value.witness);if(activeWitness.current===value.witness)activeWitness.current=null;}
 }
 function confirmGraphOutputReview(){const value=graphOutputReviewRef.current;if(!value||busyRef.current)return;const consent=value.consent.consent;Alert.alert(consent.action==='PROVE_W39'?'Probar retirada del '+graphOutputRoleText[value.consent.noteRole].toLowerCase():consent.action==='WITHDRAW_W39'?'Retirar el '+graphOutputRoleText[value.consent.noteRole].toLowerCase():'Consultar la misma retirada',consent.action==='PROVE_W39'
  ?'La apertura de esta salida se enviará al trabajador temporal para probar su retirada completa. La dirección fijada se conserva; el envío requiere otra autorización.'
  :'Autoriza sólo la operación y la dirección mostradas. Si falta la respuesta, consulta la misma retirada antes de actuar.',[{text:'Cancelar',style:'cancel',onPress:clearReview},{text:'Confirmar con biometría',onPress:()=>{void run(()=>submitGraphOutput(value));}}],{cancelable:false});}
 function confirmGraphOutputPreparation(noteRole:GraphOutputRole){if(busyRef.current)return;Alert.alert('Preparar retirada del '+graphOutputRoleText[noteRole].toLowerCase(),'Se comprobará el estado original de esta salida y su importe completo. Conserva su propia apertura y la dirección de retirada fijada al crear la nota.',[{text:'Cancelar',style:'cancel'},{text:'Continuar',onPress:()=>{void run(()=>prepareGraphOutput(noteRole));}}],{cancelable:false});}
 function confirmGraphReview(){const value=graphReviewRef.current;if(!value||busyRef.current)return;Alert.alert(graphActionText[value.consent.draft.action],value.consent.draft.action==='PROVE_U'
  ?'La apertura de esta nota se enviará al trabajador temporal para probar la reserva. El cambio y la recuperación conservan sus claves en este dispositivo. Cada envío posterior requiere otra autorización.'
  :'Autoriza sólo la operación y el plazo mostrados. Si falta la respuesta, consulta la misma operación antes de actuar.',[{text:'Cancelar',style:'cancel',onPress:clearReview},{text:'Confirmar con biometría',onPress:()=>{void run(()=>submitGraph(value));}}],{cancelable:false});}
 function confirmGraphPreparation(){if(busyRef.current)return;Alert.alert('Preparar conversión privada','Debes haber autorizado la recepción de las participaciones en su conexión privada. Esta preparación usa esos importes y ese plazo originales; todavía no envía la reserva.',[{text:'Cancelar',style:'cancel'},{text:'Continuar',onPress:()=>{void run(prepareGraph);}}],{cancelable:false});}
 async function blueSign(selected:Connection,value:Parameters<typeof signDeviceMorphoBlueRedemptionPermissionV1>[0],ticket:number){current(ticket,selected);const controller=new AbortController();signing.current=controller;try{const signature=await signDeviceMorphoBlueRedemptionPermissionV1(value,selected.descriptor.origin,selected.descriptor.pairingId,controller.signal);current(ticket,selected);return signature;}finally{if(signing.current===controller)signing.current=null;}}
 async function readBlueStatus(selected:Connection,ticket:number){const client=selected.blueClient;if(!client)throw Error('MOBILE_BLUE_REDEMPTION_REQUIRED');const access=await client.challenge();current(ticket,selected);const signature=await blueSign(selected,access,ticket),value=await client.status(access,signature);current(ticket,selected);setBlueStatus(value);return value;}
 async function requestBlue(action:'REDEEM_BLUE'|'OBSERVE_BLUE'){const selected=requireConnection();clearReview();const ticket=epoch.current,shareState=await readStatus(selected,ticket),client=selected.blueClient;if(!client)throw Error('MOBILE_BLUE_REDEMPTION_REQUIRED');const withdrawal=shareState.jobs.find(r=>r.mode==='withdraw_balance'&&r.stage==='CONFIRMED');if(!withdrawal)throw Error('MOBILE_BLUE_SHARE_WITHDRAWAL_REQUIRED');const blue=await readBlueStatus(selected,ticket),previous=blue.operations.find(r=>r.withdrawalJobId===withdrawal.jobId);if(action==='REDEEM_BLUE'&&(blue.observationOnly||previous))throw Error('MOBILE_BLUE_OBSERVE_ONLY');if(action==='OBSERVE_BLUE'&&!previous)throw Error('MOBILE_BLUE_REDEMPTION_REQUIRED');const access=await client.challenge();current(ticket,selected);const signature=await blueSign(selected,access,ticket),consent=await client.review(access,signature,{action,withdrawalJobId:withdrawal.jobId,minimumAssets:previous?.minimumAssets??blueMinimum,deadline:previous?.deadline??(BigInt(shareState.observed.timestamp)+180n).toString()});current(ticket,selected);blueReviewRef.current=consent;setBlueReview(consent);setNotice('Revisa la redención de participaciones. Esta operación entrega underlying público en la misma dirección.');}
 async function submitBlue(consent:DeviceMorphoBlueConsentV1){const selected=requireConnection(),client=selected.blueClient,ticket=epoch.current;if(!client||blueReviewRef.current!==consent)throw Error('MOBILE_BLUE_PERMISSION_CHANGED');const signature=await blueSign(selected,consent,ticket);current(ticket,selected);blueReviewRef.current=null;setBlueReview(null);setBlueStatus(null);await client.submit(consent,signature);current(ticket,selected);await readBlueStatus(selected,ticket);setNotice('Redención consultada en el journal original. Un resultado pendiente sólo permite consultar la misma operación.');}
 function confirmBlue(){const value=blueReviewRef.current;if(!value||busyRef.current)return;Alert.alert(value.action==='REDEEM_BLUE'?'Redimir participaciones Blue':'Consultar la misma redención','La redención es pública y conserva la dirección de la retirada original. No crea un saldo privado de underlying. Si falta la respuesta, consulta la misma operación; no repitas el envío.',[{text:'Cancelar',style:'cancel',onPress:clearReview},{text:'Confirmar con biometría',onPress:()=>{void run(()=>submitBlue(value));}}],{cancelable:false});}
 async function aaveSign(selected:Connection,value:Parameters<typeof signDeviceAaveStaticRedemptionPermissionV1>[0],ticket:number){current(ticket,selected);const controller=new AbortController();signing.current=controller;try{const signature=await signDeviceAaveStaticRedemptionPermissionV1(value,selected.descriptor.origin,selected.descriptor.pairingId,controller.signal);current(ticket,selected);return signature;}finally{if(signing.current===controller)signing.current=null;}}
 async function readAaveStatus(selected:Connection,ticket:number){const client=selected.aaveClient;if(!client)throw Error('MOBILE_AAVE_REDEMPTION_REQUIRED');const access=await client.challenge();current(ticket,selected);const signature=await aaveSign(selected,access,ticket),value=await client.status(access,signature);current(ticket,selected);setAaveStatus(value);return value;}
 async function requestAave(action:'REDEEM_AAVE'|'OBSERVE_AAVE'){const selected=requireConnection();clearReview();const ticket=epoch.current,shareState=await readStatus(selected,ticket),client=selected.aaveClient;if(!client)throw Error('MOBILE_AAVE_REDEMPTION_REQUIRED');const withdrawal=shareState.jobs.find(r=>r.mode==='withdraw_balance'&&r.stage==='CONFIRMED');if(!withdrawal)throw Error('MOBILE_AAVE_SHARE_WITHDRAWAL_REQUIRED');const blue=await readAaveStatus(selected,ticket),previous=blue.operations.find(r=>r.withdrawalJobId===withdrawal.jobId);if(action==='REDEEM_AAVE'&&(blue.observationOnly||previous))throw Error('MOBILE_AAVE_OBSERVE_ONLY');if(action==='OBSERVE_AAVE'&&!previous)throw Error('MOBILE_AAVE_REDEMPTION_REQUIRED');const access=await client.challenge();current(ticket,selected);const signature=await aaveSign(selected,access,ticket),consent=await client.review(access,signature,{action,withdrawalJobId:withdrawal.jobId,minimumAssets:previous?.minimumAssets??aaveMinimum,deadline:previous?.deadline??(BigInt(shareState.observed.timestamp)+180n).toString()});current(ticket,selected);aaveReviewRef.current=consent;setAaveReview(consent);setNotice('Revisa la redención de participaciones. Esta operación entrega underlying público en la misma dirección.');}
 async function submitAave(consent:DeviceAaveStaticConsentV1){const selected=requireConnection(),client=selected.aaveClient,ticket=epoch.current;if(!client||aaveReviewRef.current!==consent)throw Error('MOBILE_AAVE_PERMISSION_CHANGED');const signature=await aaveSign(selected,consent,ticket);current(ticket,selected);aaveReviewRef.current=null;setAaveReview(null);setAaveStatus(null);await client.submit(consent,signature);current(ticket,selected);await readAaveStatus(selected,ticket);setNotice('Redención consultada en el journal original. Un resultado pendiente sólo permite consultar la misma operación.');}
 function confirmAave(){const value=aaveReviewRef.current;if(!value||busyRef.current)return;Alert.alert(value.action==='REDEEM_AAVE'?'Redimir participaciones Aave':'Consultar la misma redención','La redención es pública y conserva la dirección de la retirada original. No crea un saldo privado de underlying. Si falta la respuesta, consulta la misma operación; no repitas el envío.',[{text:'Cancelar',style:'cancel',onPress:clearReview},{text:'Confirmar con biometría',onPress:()=>{void run(()=>submitAave(value));}}],{cancelable:false});}
 async function connect(rawDescriptor:string=descriptorText,route?:'LEGACY'|'ROUTED') {
  const drain=closeConnection(),ticket=epoch.current;await drain;if(!mounted.current||epoch.current!==ticket||AppState.currentState!=='active')return;
  const descriptor=normalizeExternalFlatDescriptorV1(JSON.parse(rawDescriptor)),key=await readDevicePublicKey();
  if(!mounted.current||epoch.current!==ticket||AppState.currentState!=='active')return;
  if(key===null||key!==descriptor.devicePublicKey)throw Error('MOBILE_EXTERNAL_FLAT_DEVICE_REQUIRED');
  const client=createDeviceExternalFlatNoteApiV1({descriptor,fetchImpl:expoFetch});
  const acquisition=descriptor.profile===DEVICE_EXTERNAL_FLAT_SHARE_V1||(route??custodyRoute)==='ROUTED'?createDeviceExternalFlatRoutedNoteVaultV1(descriptor):createDeviceExternalFlatNoteVaultV1();acquiring.current=acquisition;let vault:Vault;
  try{vault=await acquisition;}catch(error){client.close();throw error;}
  if(acquiring.current!==acquisition||!mounted.current||epoch.current!==ticket||AppState.currentState!=='active'){
   client.close();await vault.close();return;
  }
  let graphClient:GraphClient|null;try{graphClient=descriptor.profile===DEVICE_EXTERNAL_FLAT_SHARE_V1?null:createDeviceExternalFlatGraphApiV1({descriptor,fetchImpl:expoFetch});}catch(error){client.close();await vault.close();throw error;}
  acquiring.current=null;const selected:Connection={aaveClient:descriptor.profile===DEVICE_EXTERNAL_FLAT_SHARE_V1&&aaveRef.current&&JSON.stringify(aaveRef.current.target)===JSON.stringify(descriptor)?createDeviceAaveStaticRedemptionApiV1({descriptor,fetchImpl:expoFetch}):null,blueClient:descriptor.profile===DEVICE_EXTERNAL_FLAT_SHARE_V1&&descriptor.assetMetadata.symbol==='OMB1'?createDeviceMorphoBlueRedemptionApiV1({descriptor,fetchImpl:expoFetch}):null,client,graphClient,noteClosed:false,vault,descriptor};connection.current=selected;
  const local=await vault.summary();current(ticket,selected);
  if(local.descriptor!==null&&JSON.stringify(local.descriptor)!==JSON.stringify(descriptor))throw Error('MOBILE_EXTERNAL_FLAT_BINDING_CHANGED');
  setSummary(local);setConnected(true);setRecipient(local.recipient===null?'':'0x'+local.recipient);setAmount(local.amount??(metaFourRef.current?(metaFourSlot(descriptor)>=0?'100':'500'):''));
  if(metaFourRef.current)setValidUntil(metaFourWindowRef.current?.validUntil??'');
  if(local.graph!==null){if(local.recoveryFence.source)await readStatus(selected,ticket);await readGraphStatus(selected,ticket);}else await readStatus(selected,ticket);if(selected.blueClient)await readBlueStatus(selected,ticket);if(selected.aaveClient)await readAaveStatus(selected,ticket);setNotice('Conexión y nota comprobadas. Cada operación requiere su propia autorización.');
 }
 async function exportRecovery(){
  const selected=requireConnection(),sharePrepared=selected.descriptor.profile===DEVICE_EXTERNAL_FLAT_SHARE_V1&&preparedRef.current?.draft.action==='PROVE_D27'?preparedRef.current:null,graphPrepared=graphPreparedRef.current;
  if(sharePrepared)preparedRef.current=null;graphPreparedRef.current=null;clearReview();preparedRef.current=sharePrepared;graphPreparedRef.current=graphPrepared;
  const kind:RecoveryPreparation|null=graphPrepared?'GRAPH':sharePrepared?'SHARE':null,prepared=graphPrepared??sharePrepared;setRecoveryPreparation(kind);
  const ticket=epoch.current,controller=new AbortController();signing.current=controller;
  let password=recoveryPassword;setRecoveryPassword('');setRecoveryCopy('');
  try{
   const before=prepared?await selected.vault.recoveryCheckpoint():null;current(ticket,selected);
   const note=await selected.vault.exportBackup(password,selected.descriptor.devicePublicKey,controller.signal);current(ticket,selected);
   const identity=await exportDeviceIdentityBackupV1(password,selected.descriptor.devicePublicKey,controller.signal);current(ticket,selected);
   const copy=JSON.stringify({format:'LIANUM_DEVICE_NOTE_RECOVERY_PACKAGE_V1',descriptor:selected.descriptor,identityBackup:JSON.parse(identity),noteBackup:JSON.parse(note)});
   if(copy.length>196608)throw Error('MOBILE_CUSTODY_BACKUP_INVALID');
   if(prepared&&kind&&before){const after=await selected.vault.recoveryCheckpoint();current(ticket,selected);
    if(!sameRecoveryCheckpoint(before,after)||(kind==='GRAPH'?graphPreparedRef.current:preparedRef.current)!==prepared)throw Error('MOBILE_EXTERNAL_FLAT_RECOVERY_COPY_CHANGED');
    recoveryCut.current={selected,kind,prepared,checkpoint:after};
   }
   setRecoveryCopy(copy);setNotice(prepared?'Guarda esta copia completa y su contraseña fuera del dispositivo. Incluye las nuevas aperturas; una copia anterior no las recupera. Confirma que la has guardado para revisar la autorización.':'Copia cifrada de tu identidad, esta nota y sus operaciones actuales. Guárdala fuera del dispositivo junto con tu contraseña. Las aperturas creadas después requieren una copia nueva.');
  }finally{password='';if(signing.current===controller)signing.current=null;}
 }
 function sameRecoveryCheckpoint(a:RecoveryCheckpoint,b:RecoveryCheckpoint){return a.rootId===b.rootId&&a.noteRevision===b.noteRevision&&a.descriptorSHA256===b.descriptorSHA256&&a.revision===b.revision&&a.recordSHA256===b.recordSHA256;}
 async function verifyRecoveryCut(selected:Connection,kind:RecoveryPreparation,witness:unknown,ticket:number){
  const cut=recoveryCut.current;if(!cut||cut.selected!==selected||cut.kind!==kind||cut.prepared.witness!==witness)throw Error('MOBILE_EXTERNAL_FLAT_RECOVERY_COPY_REQUIRED');
  const checkpoint=await selected.vault.recoveryCheckpoint();current(ticket,selected);
  if(recoveryCut.current!==cut||!sameRecoveryCheckpoint(cut.checkpoint,checkpoint))throw Error('MOBILE_EXTERNAL_FLAT_RECOVERY_COPY_CHANGED');
 }
 async function reviewBackedPreparation(){
  const selected=requireConnection(),ticket=epoch.current,cut=recoveryCut.current;
  if(!cut||cut.selected!==selected||(cut.kind==='GRAPH'?graphPreparedRef.current:preparedRef.current)!==cut.prepared)throw Error('MOBILE_EXTERNAL_FLAT_RECOVERY_COPY_REQUIRED');
  await verifyRecoveryCut(selected,cut.kind,cut.prepared.witness,ticket);
  if(cut.kind==='GRAPH'){const prepared=graphPreparedRef.current!;await makeGraphReview(selected,prepared.draft,ticket,prepared.witness);}
  else{const prepared=preparedRef.current!;await makeReview(selected,prepared.draft,ticket,prepared.witness);}
  setRecoveryPreparation(null);
 }
 function confirmBackedPreparation(){if(busyRef.current)return;Alert.alert('Confirmar copia guardada','Confirma que has guardado fuera del dispositivo esta copia completa y su contraseña. Se revisará una autorización nueva; todavía no se envía la operación.',[{text:'Cancelar',style:'cancel'},{text:'He guardado la copia',onPress:()=>{void run(reviewBackedPreparation);}}],{cancelable:false});}
 async function restoreRecovery(){
  let input=recoveryInput,password=recoveryPassword;setRecoveryInput('');setRecoveryPassword('');
  const drain=closeConnection(),ticket=epoch.current;await drain;
  if(!mounted.current||epoch.current!==ticket||AppState.currentState!=='active'){input='';password='';return;}
  const controller=new AbortController();signing.current=controller;
  try{
   if(input.length===0||input.length>196608)throw Error('MOBILE_CUSTODY_BACKUP_INVALID');
   const descriptor=normalizeExternalFlatDescriptorV1(JSON.parse(descriptorText)),packet=JSON.parse(input);
   if(!packet||Array.isArray(packet)||Object.keys(packet).sort().join(',')!=='descriptor,format,identityBackup,noteBackup'||packet.format!=='LIANUM_DEVICE_NOTE_RECOVERY_PACKAGE_V1'||JSON.stringify(normalizeExternalFlatDescriptorV1(packet.descriptor))!==JSON.stringify(descriptor))throw Error('MOBILE_CUSTODY_BACKUP_INVALID');
   await importDeviceIdentityBackupV1(JSON.stringify(packet.identityBackup),password,descriptor.devicePublicKey,controller.signal);
   if(!mounted.current||epoch.current!==ticket||AppState.currentState!=='active')throw Error('MOBILE_EXTERNAL_FLAT_CONTEXT_CHANGED');
   const acquisition=restoreDeviceExternalFlatNoteBackupV1(JSON.stringify(packet.noteBackup),password,descriptor.devicePublicKey,descriptor,controller.signal);acquiring.current=acquisition;
   const vault=await acquisition;
   try{
    if(acquiring.current!==acquisition||!mounted.current||epoch.current!==ticket||AppState.currentState!=='active')throw Error('MOBILE_EXTERNAL_FLAT_CONTEXT_CHANGED');
    const local=await vault.summary();
    if(!mounted.current||epoch.current!==ticket||AppState.currentState!=='active')throw Error('MOBILE_EXTERNAL_FLAT_CONTEXT_CHANGED');
    onSourcePending?.(descriptor,local.rootId);setCustodyRoute(local.custodyRoute);setSummary(null);setStatus(null);setGraphStatus(null);setNotice('Custodia recuperada con la misma identidad y operaciones. Conecta y consulta su estado original antes de continuar.');
   }finally{await vault.close();if(acquiring.current===acquisition)acquiring.current=null;}
  }finally{input='';password='';if(signing.current===controller)signing.current=null;}
 }
 function confirmRecoveryExport(){if(busyRef.current)return;Alert.alert('Guardar una copia de recuperación','La copia contiene tu identidad y las claves de esta nota protegidas por la contraseña indicada. Guárdala completa fuera del dispositivo.',[{text:'Cancelar',style:'cancel'},{text:'Crear con biometría',onPress:()=>{void run(exportRecovery,'No se ha creado la copia. Comprueba la contraseña y vuelve a abrir la custodia.');}}],{cancelable:false});}
 function confirmRecoveryRestore(){if(busyRef.current)return;Alert.alert('Recuperar esta custodia','Se recuperarán la misma identidad, nota y operaciones de esta conexión. Después debes consultar su estado original; la recuperación no mueve fondos.',[{text:'Cancelar',style:'cancel'},{text:'Recuperar con biometría',onPress:()=>{void run(restoreRecovery,'No se ha confirmado la recuperación. Comprueba la copia, la contraseña y la conexión original.');}}],{cancelable:false});}
 async function makeReview(selected:Connection,draft:ExternalFlatDraft,ticket:number,witness:unknown|null) {
  const access=await selected.client.challenge();current(ticket,selected);
  const signature=await sign(selected,access,ticket);const consent=await selected.client.review(access,signature,draft);current(ticket,selected);
  reviewRef.current={consent,witness};preparedRef.current=null;setReview(consent);
  setNotice('Comprueba el activo, el importe y la dirección antes de confirmar.');
 }
 async function prepareDeposit() {
  const selected=requireConnection();clearReview();const ticket=epoch.current,value=await readStatus(selected,ticket);
  const address=/^0x[0-9a-fA-F]{40}$/.exec(recipient)?.[0]===recipient?recipient.slice(2).toLowerCase():recipient;
  const slot=metaFourSlot(selected.descriptor),pairing=metaFourRef.current;
  if(pairing&&slot<0&&JSON.stringify(selected.descriptor)!==JSON.stringify(pairing.source))throw Error('MOBILE_META_FOUR_PAIRING_INVALID');
  if(pairing&&amount!==(slot>=0?'100':'500'))throw Error('MOBILE_META_FOUR_TARGET_CHANGED');
  if(slot>=0&&!metaFourWindowRef.current){const start=value.observed.timestamp;retainMetaFourWindow({validFrom:start,validUntil:(BigInt(start)+28740n).toString(),settleBefore:(BigInt(start)+28800n).toString()});}
  const window=slot>=0?metaFourWindowRef.current:null;
  if(window&&(BigInt(value.observed.timestamp)<BigInt(window.validFrom)||BigInt(value.observed.timestamp)>=BigInt(window.validUntil)))throw Error('MOBILE_META_FOUR_WINDOW_EXPIRED');
  const prepared=await selected.vault.prepareDeposit(selected.descriptor,address,amount,window?.validFrom??value.observed.timestamp,selected.descriptor.profile===DEVICE_EXTERNAL_FLAT_SHARE_V1?(window?.validUntil??validUntil):undefined);preparedRef.current=prepared;current(ticket,selected);
  const local=await selected.vault.summary();current(ticket,selected);setSummary(local);
  if(selected.descriptor.profile===DEVICE_EXTERNAL_FLAT_SHARE_V1){setRecoveryPreparation('SHARE');setNotice('Guarda una copia actualizada de esta participación antes de autorizar su recepción. Después podrás revisar la autorización.');}
  else await makeReview(selected,prepared.draft,ticket,prepared.witness);
 }
 async function requestAction(action:ExternalFlatAction) {
  const selected=requireConnection();clearReview();const ticket=epoch.current;
  const draft=await selected.vault.draft(action);current(ticket,selected);await makeReview(selected,draft,ticket,null);
 }
 async function prepareWithdrawal() {
  const selected=requireConnection();clearReview();const ticket=epoch.current;
  const draft=await selected.vault.draft('QUOTE_W39');current(ticket,selected);
  const access=await selected.client.challenge();current(ticket,selected);const accessSignature=await sign(selected,access,ticket);
  const consent=await selected.client.review(access,accessSignature,draft);current(ticket,selected);
  const signature=await sign(selected,consent,ticket);const reply=await selected.client.submit(consent,signature,null);current(ticket,selected);
  if(!('quote' in reply))throw Error('MOBILE_EXTERNAL_FLAT_QUOTE_REQUIRED');
  const prepared=await selected.vault.prepareWithdrawal(readDeviceExternalFlatQuoteV1(reply.quote));preparedRef.current=prepared;current(ticket,selected);
  await makeReview(selected,prepared.draft,ticket,prepared.witness);
 }
 async function submit(value:Review) {
  const selected=requireConnection();if(reviewRef.current!==value)throw Error('MOBILE_EXTERNAL_FLAT_PERMISSION_CHANGED');
  const ticket=epoch.current;current(ticket,selected);validateExternalFlatFreshV1(value.consent);
  // Remove the expiring review before the long proof wait. Permission freshness
  // is checked again by the protected signer, durable latch and fixed SDK.
  reviewRef.current=null;activeWitness.current=value.witness;setReview(null);
  try{if(value.consent.action==='PROVE_D27')await verifyRecoveryCut(selected,'SHARE',value.witness,ticket);
   const signature=await sign(selected,value.consent,ticket);if(value.consent.action==='PROVE_D27')await verifyRecoveryCut(selected,'SHARE',value.witness,ticket);
   invalidateMetaFourStatus(selected.descriptor);await selected.vault.latch(value.consent);current(ticket,selected);recoveryCut.current=null;setRecoveryPreparation(null);
   const local=await selected.vault.summary();current(ticket,selected);setSummary(local);
   const row=await selected.client.submit(value.consent,signature,value.witness);current(ticket,selected);
   if('quote' in row)throw Error('MOBILE_EXTERNAL_FLAT_ROW_REQUIRED');
   const next=await selected.vault.accept(row);current(ticket,selected);setSummary(next);setStatus(null);
   setNotice(row.stage==='CONFIRMED'?'Operación confirmada por el servicio original.':selected.descriptor.profile===DEVICE_EXTERNAL_FLAT_SHARE_V1?'Autorización de participación guardada. Consulta su recepción; no se envían fondos desde esta nota.':'Prueba guardada. Financiar o retirar requiere una nueva autorización.');
  }finally{externalFlatWipeV1(value.witness);if(activeWitness.current===value.witness)activeWitness.current=null;}
 }
 function confirmReview() {
  const value=reviewRef.current;if(!value||busyRef.current)return;
  const proving=value.consent.action.startsWith('PROVE_');
  Alert.alert(actionText[value.consent.action],proving
   ?'Para generar esta prueba, una apertura de esta nota se enviará al trabajador temporal del servicio. La clave raíz permanece en este dispositivo. Esto no autoriza financiar ni retirar.'
   :'Autoriza únicamente la operación y la dirección mostradas. Si se pierde la respuesta, consulta su estado; no se repetirá el envío.',[
   {text:'Cancelar',style:'cancel',onPress:clearReview},{text:'Confirmar con biometría',onPress:()=>{void run(()=>submit(value));}},
  ],{cancelable:false});
 }
 function confirmPreparation(withdrawal=false) {
  if(busyRef.current)return;Alert.alert(withdrawal?'Preparar retirada completa':'Preparar nota ERC20',withdrawal
   ?'Se consultará la nota financiada y se preparará su retirada completa a la dirección fijada al crearla. La consulta no mueve fondos.'
   :'La dirección de retirada y el importe quedarán fijados para esta nota antes de financiarla.',[
   {text:'Cancelar',style:'cancel'},{text:'Continuar',onPress:()=>{void run(withdrawal?prepareWithdrawal:prepareDeposit);}},
  ],{cancelable:false});
 }
 const deposit=summary?.jobs.find(row=>row.mode!=='withdraw_balance'),withdrawal=summary?.jobs.find(row=>row.mode==='withdraw_balance');
 const graph=summary?.graph??null,graphRow=graph?.row??null,graphPending=graph?.pending??null;
 const outputPending=graph?.withdrawalPending??[],available=summary?.storageAvailable===true,uncertain=(summary?.pending!==null&&summary?.pending!==undefined)||graphPending!==null||outputPending.length>0;
 const share=connection.current?.descriptor.profile===DEVICE_EXTERNAL_FLAT_SHARE_V1;
 const canPrepare=connected&&available&&!uncertain&&!deposit;
 return <SafeAreaView style={styles.safe}><ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
  <Text style={styles.title}>{share?'Participación DeFi':'Nota ERC20'}</Text>
  <Text style={styles.muted}>Guarda la clave de una nota en este dispositivo. El servicio conectado ejecuta únicamente la financiación o retirada que autorices.</Text>
  <View style={styles.card}><Text style={styles.heading}>Conexión privada</Text>
   <Text style={styles.label}>Descriptor entregado por tu operador</Text>
  <TextInput accessibilityLabel="Descriptor privado de la nota ERC20" multiline style={[styles.input,styles.descriptor]} value={descriptorText} autoCapitalize="none" autoCorrect={false} editable={!busy}
    onChangeText={text=>{closeConnection();clearMetaFour();clearAave();setDescriptorText(text);setSummary(null);}}/>
   <Text style={styles.label}>Nota que quieres abrir</Text>
   <Text style={styles.muted}>La nota inicial conserva su almacén. Para otro activo, red o conexión, selecciona otra nota. Las participaciones se guardan siempre en su propia conexión.</Text>
   <Button label={(custodyRoute==='LEGACY'?'✓ ':'')+'Nota inicial'} disabled={busy} onPress={()=>{closeConnection();setCustodyRoute('LEGACY');setSummary(null);}}/>
   <Button label={(custodyRoute==='ROUTED'?'✓ ':'')+'Otra nota por activo y conexión'} disabled={busy} onPress={()=>{closeConnection();setCustodyRoute('ROUTED');setSummary(null);}}/>
   <Button label="Conectar y consultar la nota" disabled={busy} onPress={()=>{void run(connect);}}/>
   <Text style={styles.muted}>{connected?'Conexión comprobada':'Sin conexión comprobada'}</Text>
  </View>
  <View style={styles.card}><Text style={styles.heading}>Aave: financiación y participaciones propias</Text>
   <Text style={styles.muted}>Pega paired-aave-static.json del operador original. Prepara y autoriza la recepción de participaciones antes de volver a la fuente para su reserva y ejecución. Cada nota conserva su apertura y sus permisos.</Text>
   <TextInput accessibilityLabel="Vinculación original Aave" multiline style={[styles.input,styles.descriptor]} value={aaveText} autoCapitalize="none" autoCorrect={false} editable={!busy} onChangeText={text=>{closeConnection();clearMetaFour();clearAave();setAaveText(text);setSummary(null);}}/>
   <Button label="Abrir las dos conexiones Aave" disabled={busy||aaveText.length===0} onPress={()=>{void run(loadAave,'No se ha abierto Aave. Comprueba la pareja original y la identidad de este dispositivo.');}}/>
   {aavePairing&&<><Fields values={{Fuente:aavePairing.source.assetMetadata.symbol,Participaciones:aavePairing.target.assetMetadata.symbol,Servicio:aavePairing.source.origin}}/><Button label="Abrir y consultar participaciones Aave" disabled={busy} onPress={()=>{void run(()=>selectAave('target'));}}/><Button label="Volver a financiación y reserva Aave" disabled={busy} onPress={()=>{void run(()=>selectAave('source'));}}/><Text style={styles.muted}>Consulta la recepción autorizada para unir sus importes y plazo a la preparación original. La retirada usa la nota propia. Después de confirmar SHARE W39, la tarjeta Aave requiere un permiso separado para redimir underlying en la misma dirección.</Text></>}
  </View>
  <View style={styles.card}><Text style={styles.heading}>Cuatro entregas MetaMorpho</Text>
   <Text style={styles.muted}>Pega el archivo paired-meta-four.json del producto original. La fuente y cada participación conservan su propia conexión, apertura y autorización. La consulta de una nota no autoriza otra.</Text>
   <TextInput accessibilityLabel="Paquete de cuatro vinculaciones MetaMorpho" multiline style={[styles.input,styles.descriptor]} value={metaFourText} autoCapitalize="none" autoCorrect={false} editable={!busy} onChangeText={text=>{closeConnection();clearMetaFour();clearAave();setMetaFourText(text);setSummary(null);}}/>
   <Button label="Abrir las cuatro vinculaciones originales" disabled={busy||metaFourText.length===0} onPress={()=>{void run(loadMetaFour,'No se ha abierto el paquete. Comprueba las cuatro conexiones originales y la identidad de este dispositivo.');}}/>
   {metaFour&&<><Text style={styles.muted}>Fuente: 500 unidades. Cada entrega invierte 100, recibe 100 participaciones y reserva 100; la reserva total es 400. Revisa los decimales de cada activo. El grafo confirma sus términos en la preparación original.</Text>
    <Fields values={{'Inicio común':metaFourWindow?.validFrom??'Se fija con la primera preparación original','Fin de recepción':metaFourWindow?.validUntil??'Pendiente de preparar','Vencimiento de reserva':metaFourWindow?.settleBefore??'Pendiente de preparar'}}/>
    <Button label="Abrir fuente y reserva de las cuatro entregas" disabled={busy} onPress={()=>{void run(()=>selectMetaFour(-1));}}/>
    {metaFour.targets.map((descriptor,slot)=>{const observed=metaFourReads[slot],fresh=observed&&observed.expiresAt>Date.now()?observed:null,intent=fresh?.jobs.find(v=>v.mode==='deposit_intent'),last=fresh?.jobs.find(v=>v.mode==='withdraw_balance'),delivery=metaFour.deliveries[slot];return <View key={descriptor.pairingId}>
     <Fields values={{Entrega:String(slot+1),Servicio:descriptor.origin,Activo:descriptor.assetMetadata.symbol,'Depende de':delivery.dependsOn.length?delivery.dependsOn.map(id=>String(Number(id.slice('device-external-share-'.length))+1)).join(', '):'Ninguna entrega anterior','Recepción original':intent?stageText[intent.stage]??intent.stage:'Consultar esta conexión','Nota original':fresh?.note?.state??'No disponible','Disponible confirmado':amountText(fresh?.note?.available??null,descriptor),Retirada:last?stageText[last.stage]??last.stage:'No consultada'}}/>
     <Button label={'Abrir y consultar participación '+(slot+1)} disabled={busy} onPress={()=>{void run(()=>selectMetaFour(slot));}}/>
    </View>;})}
    <Text style={styles.muted}>Prepara y autoriza cada recepción antes de volver a la fuente para U, S y la ejecución del mismo grafo. Cada resultado pendiente se consulta en su conexión. Los importes disponibles sólo proceden de consultas originales vigentes.</Text>
   </>}
  </View>
  {connected&&<View style={styles.card}><Text style={styles.heading}>Crear nota</Text>
   <Text style={styles.label}>Dirección de retirada</Text><TextInput accessibilityLabel="Dirección de retirada ERC20" style={styles.input} value={recipient} autoCapitalize="none" autoCorrect={false} editable={canPrepare&&summary?.recipient===null&&!busy} onChangeText={setRecipient}/>
   <Text style={styles.label}>Importe en unidades atómicas</Text><TextInput accessibilityLabel="Importe ERC20 en unidades atómicas" style={styles.input} value={amount} keyboardType="number-pad" editable={canPrepare&&summary?.amount===null&&!busy&&!metaFour} onChangeText={setAmount}/>
   <Text style={styles.muted}>{connection.current?.descriptor.assetMetadata.symbol} tiene {connection.current?.descriptor.assetMetadata.decimals} decimales. Comprueba el importe exacto antes de confirmar.</Text>
   {share&&<><Text style={styles.label}>Fin del plazo de recepción (segundos Unix)</Text><TextInput accessibilityLabel="Fin del plazo de recepción" style={styles.input} value={validUntil} keyboardType="number-pad" editable={canPrepare&&!busy&&!metaFour} onChangeText={setValidUntil}/><Text style={styles.muted}>{metaFour?'Las cuatro recepciones conservan el mismo inicio y fin original. El inicio de la primera preparación procede de su consulta; las siguientes usan ese mismo plazo.':'El operador entrega las participaciones durante el plazo que autorices. La recepción conserva una clave propia en este dispositivo.'}</Text></>}
   <Button label={share?'Preparar recepción de participación':'Preparar prueba de financiación'} disabled={busy||!canPrepare} onPress={()=>confirmPreparation()}/>
  </View>}
  {connected&&!share&&deposit?.stage==='CONFIRMED'&&<View style={styles.card}><Text style={styles.heading}>Conversión y reserva privadas</Text>
   {(graph===null||graph.row===null&&graph.pending===null)&&!status?.graphClaimed&&<><Text style={styles.muted}>Autoriza primero la recepción en la conexión de participaciones. Usa aquí sus importes y el mismo inicio de plazo; la recuperación conserva una nota propia.</Text>
    <Text style={styles.label}>Activo que recibe la inversión, unidades atómicas</Text><TextInput accessibilityLabel="Importe invertido" style={styles.input} value={graphAssetAmount} keyboardType="number-pad" editable={!busy&&!uncertain&&!metaFour} onChangeText={setGraphAssetAmount}/>
    <Text style={styles.label}>Participaciones autorizadas, unidades atómicas</Text><TextInput accessibilityLabel="Participaciones autorizadas" style={styles.input} value={graphShareAmount} keyboardType="number-pad" editable={!busy&&!uncertain&&!metaFour} onChangeText={setGraphShareAmount}/>
    <Text style={styles.label}>Importe reservado, unidades atómicas</Text><TextInput accessibilityLabel="Importe reservado" style={styles.input} value={graphPayoutAmount} keyboardType="number-pad" editable={!busy&&!uncertain&&!metaFour} onChangeText={setGraphPayoutAmount}/>
    <Text style={styles.label}>Inicio original de recepción, segundos Unix</Text><TextInput accessibilityLabel="Inicio original de recepción" style={styles.input} value={graphValidFrom} keyboardType="number-pad" editable={!busy&&!uncertain&&!metaFour} onChangeText={setGraphValidFrom}/>
    <Text style={styles.label}>Vencimiento de la reserva, segundos Unix</Text><TextInput accessibilityLabel="Vencimiento de la reserva" style={styles.input} value={graphSettleBefore} keyboardType="number-pad" editable={!busy&&!uncertain&&!metaFour} onChangeText={setGraphSettleBefore}/>
    <Button label="Preparar reserva y conversión" disabled={busy||uncertain||!available||Boolean(withdrawal)} onPress={confirmGraphPreparation}/></>}
   <Fields values={{Reserva:graphRow?stageText[graphRow.reservation.stage]??graphRow.reservation.stage:'No disponible',Conversión:graphRow?graphStageText[graphRow.graph.stage]:'No disponible','Cambio retenido':amountText(graph?.changeAmount??null,summary?.descriptor??null),'Recuperación retenida':amountText(graph?.recoveryAmount??null,summary?.descriptor??null),'Resultado pendiente':graphPending?'Consultar la misma operación':'Ninguno retenido'}}/>
   <Button label="Consultar reserva y conversión" disabled={busy} onPress={()=>{void run(async()=>{const selected=requireConnection();clearReview();await readGraphStatus(selected,epoch.current);setNotice('Estado de la reserva consultado sin repetir envíos.');});}}/>
   {graphRow?.reservation.stage==='FAILED'&&graphRow.graph.stage!=='SOURCE_CANCELLED'&&<Button label="Liberar reserva que no se envió" disabled={busy} onPress={()=>{void run(()=>requestGraphAction('CANCEL_GRAPH'));}}/>}
   {graphRow?.reservation.stage==='PROVED'&&!graphPending&&<Button label="Revisar registro de la reserva" disabled={busy} onPress={()=>{void run(()=>requestGraphAction('RESERVE_S'));}}/>}
   {graphRow&&['RESERVING','RESERVATION_UNKNOWN'].includes(graphRow.reservation.stage)&&<Button label="Consultar reserva pendiente" disabled={busy} onPress={()=>{void run(()=>requestGraphAction('OBSERVE_S'));}}/>}
   {graphRow?.reservation.stage==='RESERVED'&&graphRow.graph.stage==='PREPARED'&&!graphPending&&<Button label="Revisar ejecución de la conversión" disabled={busy} onPress={()=>{void run(()=>requestGraphAction('EXECUTE_GRAPH'));}}/>}
   {graphRow&&(['EXECUTION_UNKNOWN','RECOVERY_UNKNOWN'].includes(graphRow.graph.stage)||graphPending)&&<Button label="Conciliar la misma conversión" disabled={busy} onPress={()=>{void run(()=>requestGraphAction('RECONCILE_GRAPH'));}}/>}
   {graphRow?.reservation.stage==='RESERVED'&&graphRow.graph.stage==='PREPARED'&&!graphPending&&graphStatus&&graphStatus.expiresAt>Date.now()&&BigInt(graphStatus.observed.timestamp)>=BigInt(graphRow.reservation.statement.settleBefore)&&<Button label="Revisar recuperación de reserva vencida" disabled={busy} onPress={()=>{void run(()=>requestGraphAction('RECOVER_GRAPH'));}}/>}
  </View>}
  {connected&&!share&&graph!==null&&(['change','recovery'] as const).map(noteRole=>{
   const fresh=graphStatus&&graphStatus.expiresAt>Date.now()?graphStatus:null,output=fresh?.jobs[0]?.outputs.find((value:GraphOutputView)=>value.noteRole===noteRole);
   const withdrawal=graph.withdrawals.find(value=>value.noteRole===noteRole),pendingEntry=outputPending.find(value=>value.noteRole===noteRole),pending=Boolean(pendingEntry);
   return <View key={noteRole} style={styles.card}><Text style={styles.heading}>Salida de {graphOutputRoleText[noteRole].toLowerCase()}</Text>
    <Fields values={{Estado:output?graphOutputStateText[output.state]??output.state:'No disponible','Importe original':amountText(noteRole==='change'?graph.changeAmount:graph.recoveryAmount,summary?.descriptor??null),'Disponible para retirar':amountText(output?.available??null,summary?.descriptor??null),'Dirección fijada':summary?.recipient?'0x'+summary.recipient:'No disponible',Retirada:withdrawal?stageText[withdrawal.row.stage]??withdrawal.row.stage:'No preparada','Resultado pendiente':pending?'Consultar la misma retirada':'Ninguno retenido'}}/>
    <Button label={'Consultar salida de '+graphOutputRoleText[noteRole].toLowerCase()} disabled={busy} onPress={()=>{void run(async()=>{const selected=requireConnection();clearReview();await readGraphStatus(selected,epoch.current);setNotice('Estado de las salidas consultado sin repetir envíos.');});}}/>
    {output?.state==='UNSPENT'&&output.available!==null&&!withdrawal&&!pending&&<Button label={'Preparar retirada del '+graphOutputRoleText[noteRole].toLowerCase()} disabled={busy||!available} onPress={()=>confirmGraphOutputPreparation(noteRole)}/>}
    {withdrawal?.row.stage==='PROVED'&&!pending&&<Button label={'Revisar retirada del '+graphOutputRoleText[noteRole].toLowerCase()} disabled={busy||!available} onPress={()=>{void run(()=>requestGraphOutput(noteRole,'WITHDRAW_W39'));}}/>}
    {(pendingEntry&&pendingEntry.action!=='PROVE_W39'||withdrawal?.row.stage==='WITHDRAWAL_UNKNOWN')&&<Button label="Consultar la misma retirada pendiente" disabled={busy} onPress={()=>{void run(()=>requestGraphOutput(noteRole,'OBSERVE_W39'));}}/>}
    {output&&['LOCKED','UNKNOWN'].includes(output.state)&&<Text style={styles.muted}>Esta salida no tiene un importe disponible confirmado. Consultar conserva las operaciones originales.</Text>}
   </View>;
  })}
  {graphOutputReview&&<View style={styles.card}><Text style={styles.heading}>{graphOutputReview.consent.action==='PROVE_W39'?'Generar prueba de retirada':graphOutputReview.consent.action==='WITHDRAW_W39'?'Retirar esta salida':'Consultar esta retirada'}</Text>
   <Fields values={{Salida:graphOutputRoleText[graphOutputReview.noteRole],Servicio:graphOutputReview.consent.descriptor.origin,Activo:'0x'+graphOutputReview.consent.descriptor.poolTerms.asset,Importe:amountText(graphOutputReview.consent.statement.amount,graphOutputReview.consent.descriptor),'Unidades atómicas':graphOutputReview.consent.statement.amount,'Dirección de retirada':'0x'+graphOutputReview.consent.recipient,'Operación original':graphOutputReview.consent.jobId}}/>
   <Button label="Autorizar esta retirada" disabled={busy} onPress={confirmGraphOutputReview}/><Button label="Cancelar revisión" disabled={busy} onPress={clearReview}/>
  </View>}
  {graphReview&&<View style={styles.card}><Text style={styles.heading}>{graphActionText[graphReview.draft.action]}</Text><Fields values={{Servicio:graphReview.descriptor.origin,Activo:'0x'+graphReview.descriptor.poolTerms.asset,'Importe reservado':amountText(summary?.graph?.recoveryAmount??null,graphReview.descriptor),'Vencimiento original':graphReview.draft.statement.settleBefore,'Operación original':graphReview.draft.jobId}}/><Button label="Autorizar esta operación" disabled={busy} onPress={confirmGraphReview}/><Button label="Cancelar revisión" disabled={busy} onPress={clearReview}/></View>}
  {review&&<View style={styles.card}><Text style={styles.heading}>{actionText[review.action]}</Text>
   <Fields values={{Servicio:review.descriptor.origin,Activo:'0x'+review.descriptor.poolTerms.asset,'Contrato de la nota':'0x'+review.descriptor.poolTerms.pool,
    Importe:amountText(review.statement.amount,review.descriptor),'Unidades atómicas':review.statement.amount,'Dirección de retirada':'0x'+review.recipient,
    'Red original':review.descriptor.poolTerms.genesis,'Operación original':review.jobId,...(review.action==='PROVE_D27'?{'Inicio original de recepción':String((review.statement as {validFrom:string}).validFrom),'Fin original de recepción':String((review.statement as {validUntil:string}).validUntil)}:{})}}/>
   <Button label="Autorizar esta operación" disabled={busy} onPress={confirmReview}/><Button label="Cancelar revisión" disabled={busy} onPress={clearReview}/>
  </View>}
  <View style={styles.card}><Text style={styles.heading}>Nota y operaciones</Text>
   <Fields values={{'Importe original de la nota':amountText(summary?.amount??null,summary?.descriptor??null),
    'Participaciones disponibles':connected&&status?.note&&status.expiresAt>Date.now()?amountText(status.note.available,status.descriptor):'No disponible',
    'Dirección fijada':summary?.recipient?'0x'+summary.recipient:'No disponible','Financiación':deposit?stageText[deposit.stage]:'No confirmada',
    'Retirada':withdrawal?stageText[withdrawal.stage]:'No confirmada','Resultado pendiente':summary===null?'No disponible':uncertain?'Consulta la misma operación':'Ninguno retenido',
    'Cabeza consultada':connected&&status&&status.expiresAt>Date.now()?status.observed.blockNumber:'No disponible'}}/>
   {!available&&<Text style={styles.muted}>La información local no está disponible. No se puede preparar ni enviar una operación.</Text>}
   {uncertain&&<Text style={styles.muted}>El resultado está pendiente. Consultar conserva la operación original y no vuelve a enviar fondos.</Text>}
   {connected&&<Button label="Consultar operaciones originales" disabled={busy} onPress={()=>{void run(async()=>{const selected=requireConnection();clearReview();if(selected.noteClosed)await readGraphStatus(selected,epoch.current);else await readStatus(selected,epoch.current);setNotice('Estado original consultado. Una operación pendiente no se reenvía.');});}}/>}
   {connected&&!share&&deposit?.stage==='PROVED'&&!uncertain&&!withdrawal&&<Button label="Revisar financiación" disabled={busy} onPress={()=>{void run(()=>requestAction('FUND_D26'));}}/>}
   {connected&&share&&deposit&&['PROVED','DELIVERY_UNKNOWN'].includes(deposit.stage)&&<Button label="Consultar recepción de participación" disabled={busy} onPress={()=>{void run(()=>requestAction('OBSERVE_D27'));}}/>}
   {connected&&deposit?.stage==='FUNDING_UNKNOWN'&&<Button label="Consultar financiación pendiente" disabled={busy} onPress={()=>{void run(()=>requestAction('OBSERVE_D26'));}}/>}
   {connected&&deposit?.stage==='CONFIRMED'&&!withdrawal&&!uncertain&&(graph===null||graphRow?.graph.stage==='SOURCE_CANCELLED')&&!status?.graphClaimed&&<Button label="Preparar retirada completa" disabled={busy} onPress={()=>confirmPreparation(true)}/>}
   {connected&&withdrawal?.stage==='PROVED'&&!uncertain&&<Button label="Revisar retirada" disabled={busy} onPress={()=>{void run(()=>requestAction('WITHDRAW_W39'));}}/>}
   {connected&&withdrawal?.stage==='WITHDRAWAL_UNKNOWN'&&<Button label="Consultar retirada pendiente" disabled={busy} onPress={()=>{void run(()=>requestAction('OBSERVE_W39'));}}/>}
  </View>
  {connected&&connection.current?.blueClient&&withdrawal?.stage==='CONFIRMED'&&<View style={styles.card}><Text style={styles.heading}>Redención de participaciones Blue</Text>
   <Text style={styles.muted}>La retirada original entrega participaciones en tu dirección fijada. Redimirlas es otra operación y entrega underlying público, sin crear un saldo privado.</Text>
   <Fields values={{Estado:blueStatus&&blueStatus.expiresAt>Date.now()?blueStatus.operations[0]?.stage??'Sin redención admitida':'Consultar estado original','Underlying recibido, unidades atómicas':blueStatus&&blueStatus.expiresAt>Date.now()?blueStatus.operations[0]?.redeemedUnderlying??'No confirmado':'No disponible','Gas aprobación, wei':blueStatus?.operations[0]?.nativeGas.approvalWei??'No confirmado','Gas redención, wei':blueStatus?.operations[0]?.nativeGas.redemptionWei??'No confirmado'}}/>
   <Button label="Consultar redención original" disabled={busy} onPress={()=>{void run(async()=>{const selected=requireConnection();clearReview();await readBlueStatus(selected,epoch.current);});}}/>
   {blueStatus&&blueStatus.expiresAt>Date.now()&&!blueStatus.observationOnly&&blueStatus.operations.length===0&&<><TextInput accessibilityLabel="Mínimo de underlying Blue, unidades atómicas" style={styles.input} value={blueMinimum} onChangeText={setBlueMinimum} keyboardType="number-pad" editable={!busy} placeholder="Mínimo de underlying, unidades atómicas" placeholderTextColor="#9fb7bd"/><Button label="Revisar redención de estas participaciones" disabled={busy||blueMinimum===''} onPress={()=>{void run(()=>requestBlue('REDEEM_BLUE'));}}/></>}
   {blueStatus?.operations.some(r=>r.stage==='REDEMPTION_UNKNOWN')&&<Button label="Revisar consulta de la misma redención" disabled={busy} onPress={()=>{void run(()=>requestBlue('OBSERVE_BLUE'));}}/>}
  </View>}
  {blueReview&&<View style={styles.card}><Text style={styles.heading}>{blueReview.action==='REDEEM_BLUE'?'Redimir participaciones Blue':'Consultar la misma redención'}</Text><Fields values={{Participaciones:blueReview.shares,'Mínimo underlying, unidades atómicas':blueReview.minimumAssets,'Dirección fijada':'0x'+blueReview.recipient,'Underlying':'0x'+blueReview.underlying,'Plazo original, segundos Unix':blueReview.deadline}}/><Button label="Autorizar esta operación" disabled={busy} onPress={confirmBlue}/><Button label="Cancelar revisión" disabled={busy} onPress={clearReview}/></View>}
  {connected&&connection.current?.aaveClient&&withdrawal?.stage==='CONFIRMED'&&<View style={styles.card}><Text style={styles.heading}>Redención de participaciones Aave</Text>
   <Text style={styles.muted}>La retirada original entrega participaciones en tu dirección fijada. Redimirlas es otra operación y entrega underlying público, sin crear un saldo privado.</Text>
   <Fields values={{Estado:aaveStatus&&aaveStatus.expiresAt>Date.now()?aaveStatus.operations[0]?.stage??'Sin redención admitida':'Consultar estado original','Underlying recibido, unidades atómicas':aaveStatus&&aaveStatus.expiresAt>Date.now()?aaveStatus.operations[0]?.redeemedUnderlying??'No confirmado':'No disponible','Gas aprobación, wei':aaveStatus?.operations[0]?.nativeGas.approvalWei??'No confirmado','Gas redención, wei':aaveStatus?.operations[0]?.nativeGas.redemptionWei??'No confirmado'}}/>
   <Button label="Consultar redención original" disabled={busy} onPress={()=>{void run(async()=>{const selected=requireConnection();clearReview();await readAaveStatus(selected,epoch.current);});}}/>
   {aaveStatus&&aaveStatus.expiresAt>Date.now()&&!aaveStatus.observationOnly&&aaveStatus.operations.length===0&&<><TextInput accessibilityLabel="Mínimo de underlying Aave, unidades atómicas" style={styles.input} value={aaveMinimum} onChangeText={setAaveMinimum} keyboardType="number-pad" editable={!busy} placeholder="Mínimo de underlying, unidades atómicas" placeholderTextColor="#9fb7bd"/><Button label="Revisar redención de estas participaciones" disabled={busy||aaveMinimum===''} onPress={()=>{void run(()=>requestAave('REDEEM_AAVE'));}}/></>}
   {aaveStatus?.operations.some(r=>r.stage==='REDEMPTION_UNKNOWN')&&<Button label="Revisar consulta de la misma redención" disabled={busy} onPress={()=>{void run(()=>requestAave('OBSERVE_AAVE'));}}/>}
  </View>}
  {aaveReview&&<View style={styles.card}><Text style={styles.heading}>{aaveReview.action==='REDEEM_AAVE'?'Redimir participaciones Aave':'Consultar la misma redención'}</Text><Fields values={{Participaciones:aaveReview.shares,'Mínimo underlying, unidades atómicas':aaveReview.minimumAssets,'Dirección fijada':'0x'+aaveReview.recipient,'Underlying':'0x'+aaveReview.underlying,'Plazo original, segundos Unix':aaveReview.deadline}}/><Button label="Autorizar esta operación" disabled={busy} onPress={confirmAave}/><Button label="Cancelar revisión" disabled={busy} onPress={clearReview}/></View>}
  <View style={styles.card}><Text style={styles.heading}>Copia de recuperación</Text>
   <Text style={styles.muted}>La copia recupera tu identidad y las aperturas y operaciones guardadas al crearla. Una copia anterior no recupera el cambio, la recuperación o las participaciones que prepares después. Guarda una copia nueva antes de autorizarlos.</Text>
   {recoveryPreparation&&<Text style={styles.muted}>{recoveryPreparation==='GRAPH'?'El cambio y la recuperación ya están preparados.':'La participación ya está preparada.'} Crea la copia y guárdala antes de revisar la autorización.</Text>}
   <TextInput accessibilityLabel="Contraseña de la copia cifrada" style={styles.input} value={recoveryPassword} onChangeText={setRecoveryPassword} secureTextEntry autoCapitalize="none" autoCorrect={false} maxLength={1024} editable={!busy} placeholder="Contraseña de al menos 12 caracteres" placeholderTextColor="#9fb7bd"/>
   <Button label="Crear copia cifrada" disabled={busy||!connected||recoveryPassword.length<12} onPress={confirmRecoveryExport}/>
   {recoveryCopy!==''&&<><Text selectable style={styles.value}>{recoveryCopy}</Text><Button label="Ocultar copia" disabled={busy} onPress={hideRecovery}/></>}
   {recoveryPreparation&&recoveryCopy!==''&&recoveryCut.current&&<Button label="He guardado la copia; revisar autorización" disabled={busy} onPress={confirmBackedPreparation}/>}
   <TextInput accessibilityLabel="Copia cifrada de recuperación de la nota" style={[styles.input,styles.descriptor]} value={recoveryInput} onChangeText={setRecoveryInput} secureTextEntry autoCapitalize="none" autoCorrect={false} maxLength={196608} editable={!busy} placeholder="Pega tu copia cifrada" placeholderTextColor="#9fb7bd"/>
   <Button label="Recuperar custodia desde la copia" disabled={busy||recoveryInput.length===0||recoveryPassword.length<12||descriptorText.length===0} onPress={confirmRecoveryRestore}/>
  </View>
  {busy&&<ActivityIndicator accessibilityLabel="Procesando operación ERC20" color="#9de3be"/>}<Text accessibilityLiveRegion="polite" style={styles.notice}>{notice}</Text>
 </ScrollView></SafeAreaView>;
}
const styles=StyleSheet.create({safe:{flex:1,backgroundColor:'#101c22'},content:{padding:20,paddingBottom:48,gap:14},title:{color:'#eaf3f1',fontSize:26,fontWeight:'700'},
 muted:{color:'#b8c8cd',fontSize:13,lineHeight:20},card:{backgroundColor:'#192b33',borderRadius:12,padding:16,gap:10},heading:{color:'#eaf3f1',fontSize:17,fontWeight:'600'},
 label:{color:'#9fb7bd',fontSize:12,marginTop:6},value:{color:'#eaf3f1',fontSize:14,lineHeight:21},input:{backgroundColor:'#101c22',color:'#eaf3f1',padding:12,borderRadius:8},descriptor:{minHeight:100},
 button:{backgroundColor:'#9de3be',padding:12,borderRadius:8,alignItems:'center'},buttonText:{color:'#10231c',fontWeight:'700'},disabled:{opacity:0.45},notice:{color:'#c8dce0',lineHeight:21}});
