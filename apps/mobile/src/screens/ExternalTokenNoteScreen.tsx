import {useEffect,useRef,useState} from 'react';
import {ActivityIndicator,Alert,AppState,Pressable,SafeAreaView,ScrollView,StyleSheet,Text,TextInput,View} from 'react-native';
import {fetch as expoFetch} from 'expo/fetch';
import {readDevicePublicKey,signDeviceExternalFlatPermissionV1,signDeviceExternalFlatGraphPermissionV1} from '../custody/key-store';
import {createDeviceExternalFlatNoteVaultV1,createDeviceExternalFlatRoutedNoteVaultV1} from '../custody/device-external-flat-note-vault-v1';
import type {DeviceExternalFlatSummary,DeviceExternalFlatPrepared} from '../custody/device-external-flat-note-vault-v1';
import {createDeviceExternalFlatNoteApiV1,readDeviceExternalFlatQuoteV1} from '../api/device-external-flat-note-api-v1.mjs';
import {createDeviceExternalFlatGraphApiV1} from '../api/device-external-flat-graph-api-v1.mjs';
import {validateExternalFlatGraphFreshV1,wipeDeviceReservationWitnessV1} from '../../../../packages/mobile-protocol/src/device-external-flat-graph-v1.mjs';
import {DEVICE_EXTERNAL_FLAT_SHARE_V1,normalizeExternalFlatDescriptorV1,externalFlatWipeV1,validateExternalFlatFreshV1} from '../../../../packages/mobile-protocol/src/device-external-flat-note-v1.mjs';
import type {ExternalFlatAction,ExternalFlatConsent,ExternalFlatDraft,ExternalFlatStatus,ExternalFlatDescriptor} from '../../../../packages/mobile-protocol/src/device-external-flat-note-v1.mjs';

type Client=ReturnType<typeof createDeviceExternalFlatNoteApiV1>;
type Vault=Awaited<ReturnType<typeof createDeviceExternalFlatNoteVaultV1>>;
type GraphClient=ReturnType<typeof createDeviceExternalFlatGraphApiV1>;
type GraphConsent=Parameters<GraphClient['submit']>[0];
type GraphStatus=Awaited<ReturnType<GraphClient['status']>>;
type GraphAction=GraphConsent['draft']['action'];
type GraphPrepared=Awaited<ReturnType<Vault['prepareSourceGraph']>>;
type Connection={client:Client;graphClient:GraphClient|null;noteClosed:boolean;vault:Vault;descriptor:ExternalFlatDescriptor};
type GraphReview={consent:GraphConsent;witness:unknown|null};
type Review={consent:ExternalFlatConsent;witness:unknown|null};
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
const graphStageText:Record<string,string>={PREPARED:'Preparada',EXECUTION_UNKNOWN:'Ejecución pendiente de confirmar',RECOVERY_UNKNOWN:'Recuperación pendiente de confirmar',FULFILLED:'Conversión confirmada',RECOVERED:'Reserva recuperada',SOURCE_CANCELLED:'Reserva no enviada liberada'};
export default function ExternalTokenNoteScreen({onObservation,onGraphObservation,onSourcePending}:{onObservation?(value:ExternalFlatStatus):void;onGraphObservation?(value:GraphStatus):void|Promise<void>;onSourcePending?(descriptor:ExternalFlatDescriptor,rootId:string):void}={}) {
 const [descriptorText,setDescriptorText]=useState(''),[recipient,setRecipient]=useState(''),[amount,setAmount]=useState(''),[validUntil,setValidUntil]=useState('');
 const [connected,setConnected]=useState(false),[summary,setSummary]=useState<DeviceExternalFlatSummary|null>(null);
 const [review,setReview]=useState<ExternalFlatConsent|null>(null),[status,setStatus]=useState<ExternalFlatStatus|null>(null);
 const [graphReview,setGraphReview]=useState<GraphConsent|null>(null),[graphStatus,setGraphStatus]=useState<GraphStatus|null>(null);
 const [graphAssetAmount,setGraphAssetAmount]=useState(''),[graphShareAmount,setGraphShareAmount]=useState(''),[graphPayoutAmount,setGraphPayoutAmount]=useState(''),[graphValidFrom,setGraphValidFrom]=useState(''),[graphSettleBefore,setGraphSettleBefore]=useState('');
 const [busy,setBusy]=useState(false),[notice,setNotice]=useState('Introduce la conexión privada entregada por tu operador.');
 const mounted=useRef(true),busyRef=useRef(false),epoch=useRef(0),connection=useRef<Connection|null>(null);
 const acquiring=useRef<Promise<Vault>|null>(null),closing=useRef<Promise<unknown>|null>(null),signing=useRef<AbortController|null>(null);
 const graphReviewRef=useRef<GraphReview|null>(null),graphPreparedRef=useRef<GraphPrepared|null>(null);
 const reviewRef=useRef<Review|null>(null),preparedRef=useRef<DeviceExternalFlatPrepared|null>(null),activeWitness=useRef<unknown|null>(null);
 function clearReview() {
  signing.current?.abort();signing.current=null;
  wipeDeviceReservationWitnessV1(graphReviewRef.current?.witness);wipeDeviceReservationWitnessV1(graphPreparedRef.current?.witness);graphReviewRef.current=null;graphPreparedRef.current=null;if(mounted.current)setGraphReview(null);
  externalFlatWipeV1(reviewRef.current?.witness);externalFlatWipeV1(preparedRef.current?.witness);externalFlatWipeV1(activeWitness.current);activeWitness.current=null;
  reviewRef.current=null;preparedRef.current=null;if(mounted.current)setReview(null);
 }
 function closeConnection() {
  epoch.current++;clearReview();const selected=connection.current;connection.current=null;
  selected?.graphClient?.close();selected?.client.close();const acquisition=acquiring.current;acquiring.current=null;
  const previous=closing.current;
  const drain=Promise.allSettled([previous,selected?.vault.close(),acquisition?.then(v=>v.close())]);closing.current=drain;
  if(mounted.current){setConnected(false);setStatus(null);setGraphStatus(null);}
  void drain.then(()=>{if(closing.current===drain)closing.current=null;});return drain;
 }
 function current(ticket:number,selected:Connection) {
  if(!mounted.current||AppState.currentState!=='active'||epoch.current!==ticket||connection.current!==selected)throw Error('MOBILE_EXTERNAL_FLAT_CONTEXT_CHANGED');
 }
 function requireConnection() {const selected=connection.current;if(!selected)throw Error('MOBILE_EXTERNAL_FLAT_CONNECTION_REQUIRED');return selected;}
 useEffect(()=>{mounted.current=true;const sub=AppState.addEventListener('change',value=>{if(value!=='active'){
  closeConnection();setNotice('Conexión cerrada. La nota y las operaciones pendientes se conservan en el dispositivo.');
 }});return()=>{mounted.current=false;closeConnection();sub.remove();};},[]);
 useEffect(()=>{if(!review)return;const selected=reviewRef.current,timer=setTimeout(()=>{if(mounted.current&&reviewRef.current===selected){
  clearReview();setNotice('Permiso caducado. Solicita una nueva revisión de la operación.');
 }},Math.max(0,review.expiresAt-Date.now()));return()=>clearTimeout(timer);},[review]);
 useEffect(()=>{if(!graphReview)return;const selected=graphReviewRef.current,timer=setTimeout(()=>{if(mounted.current&&graphReviewRef.current===selected){clearReview();setNotice('Permiso de reserva caducado. Solicita otra revisión de la misma operación.');}},Math.max(0,graphReview.expiresAt-Date.now()));return()=>clearTimeout(timer);},[graphReview]);
 useEffect(()=>{if(!status)return;const value=status,timer=setTimeout(()=>{if(mounted.current)setStatus(current=>current===value?null:current);},Math.max(0,status.expiresAt-Date.now()));return()=>clearTimeout(timer);},[status]);
 useEffect(()=>{if(!graphStatus)return;const value=graphStatus,timer=setTimeout(()=>{if(mounted.current)setGraphStatus((current:GraphStatus|null)=>current===value?null:current);},Math.max(0,graphStatus.expiresAt-Date.now()));return()=>clearTimeout(timer);},[graphStatus]);
 async function run(work:()=>Promise<void>) {
  if(busyRef.current||AppState.currentState!=='active')return;busyRef.current=true;setBusy(true);
  try{await work();}catch{closeConnection();if(mounted.current)setNotice('No se ha confirmado el resultado. Vuelve a conectar y consulta la misma operación; no repitas el envío.');}
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
  setSummary(local);setStatus(value);onObservation?.(value);return value;
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
  if(local.graph!==null&&local.graph.row?.graph.stage!=='SOURCE_CANCELLED'){selected.client.close();selected.noteClosed=true;setStatus(null);}
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
  const local=await selected.vault.summary();current(ticket,selected);const deposit=local.jobs.find(row=>row.mode==='deposit_balance');if(!deposit||deposit.stage!=='CONFIRMED')throw Error('MOBILE_EXTERNAL_FLAT_SOURCE_REQUIRED');
  const client=requireGraph(selected),access=await client.challenge();current(ticket,selected);const signature=await sign(selected,access,ticket);
  const quote=await client.preparation(access,signature,{depositJobId:deposit.jobId,rootId:local.rootId,assetAmount:graphAssetAmount,shareAmount:graphShareAmount,payoutAmount:graphPayoutAmount,validFrom:graphValidFrom,settleBefore:graphSettleBefore});current(ticket,selected);
  const prepared=await selected.vault.prepareSourceGraph(quote);graphPreparedRef.current=prepared;current(ticket,selected);const next=await selected.vault.summary();current(ticket,selected);setSummary(next);
  await makeGraphReview(selected,prepared.draft,ticket,prepared.witness);
 }
 async function requestGraphAction(action:GraphAction){const selected=requireConnection();clearReview();const ticket=epoch.current,draft=await selected.vault.sourceGraphDraft(action);current(ticket,selected);await makeGraphReview(selected,draft,ticket,null);}
 async function submitGraph(value:GraphReview){
  const selected=requireConnection();if(graphReviewRef.current!==value)throw Error('MOBILE_EXTERNAL_FLAT_PERMISSION_CHANGED');const ticket=epoch.current;current(ticket,selected);validateExternalFlatGraphFreshV1(value.consent);
  graphReviewRef.current=null;activeWitness.current=value.witness;setGraphReview(null);
  try{const signature=await signGraph(selected,value.consent,ticket);onSourcePending?.(selected.descriptor,value.consent.draft.rootId);await selected.vault.latchSourceGraph(value.consent);current(ticket,selected);
   selected.client.close();selected.noteClosed=true;setStatus(null);setGraphStatus(null);const local=await selected.vault.summary();current(ticket,selected);setSummary(local);
   const row=await requireGraph(selected).submit(value.consent,signature,value.witness);current(ticket,selected);const next=await selected.vault.acceptSourceGraph(row);current(ticket,selected);setSummary(next);
   if(row.graph.stage==='SOURCE_CANCELLED')await readReleasedSource(selected,ticket);
   setNotice(row.graph.stage==='SOURCE_CANCELLED'?'La reserva no enviada quedó liberada. La retirada original está disponible tras su nueva consulta.':row.graph.outcome==='FULFILLED'?'Conversión confirmada. Consulta la participación en su conexión privada.':row.graph.outcome==='RECOVERED'?'Reserva recuperada. Su nota de recuperación conserva la clave en este dispositivo.':'Operación de reserva guardada. Consulta el mismo resultado antes de continuar.');
  }finally{wipeDeviceReservationWitnessV1(value.witness);if(activeWitness.current===value.witness)activeWitness.current=null;}
 }
 function confirmGraphReview(){const value=graphReviewRef.current;if(!value||busyRef.current)return;Alert.alert(graphActionText[value.consent.draft.action],value.consent.draft.action==='PROVE_U'
  ?'La apertura de esta nota se enviará al trabajador temporal para probar la reserva. El cambio y la recuperación conservan sus claves en este dispositivo. Cada envío posterior requiere otra autorización.'
  :'Autoriza sólo la operación y el plazo mostrados. Si falta la respuesta, consulta la misma operación antes de actuar.',[{text:'Cancelar',style:'cancel',onPress:clearReview},{text:'Confirmar con biometría',onPress:()=>{void run(()=>submitGraph(value));}}],{cancelable:false});}
 function confirmGraphPreparation(){if(busyRef.current)return;Alert.alert('Preparar conversión privada','Debes haber autorizado la recepción de las participaciones en su conexión privada. Esta preparación usa esos importes y ese plazo originales; todavía no envía la reserva.',[{text:'Cancelar',style:'cancel'},{text:'Continuar',onPress:()=>{void run(prepareGraph);}}],{cancelable:false});}
 async function connect() {
  await closeConnection();const ticket=epoch.current;
  const descriptor=normalizeExternalFlatDescriptorV1(JSON.parse(descriptorText)),key=await readDevicePublicKey();
  if(!mounted.current||epoch.current!==ticket||AppState.currentState!=='active')return;
  if(key===null||key!==descriptor.devicePublicKey)throw Error('MOBILE_EXTERNAL_FLAT_DEVICE_REQUIRED');
  const client=createDeviceExternalFlatNoteApiV1({descriptor,fetchImpl:expoFetch});
  const acquisition=descriptor.profile===DEVICE_EXTERNAL_FLAT_SHARE_V1?createDeviceExternalFlatRoutedNoteVaultV1(descriptor):createDeviceExternalFlatNoteVaultV1();acquiring.current=acquisition;let vault:Vault;
  try{vault=await acquisition;}catch(error){client.close();throw error;}
  if(acquiring.current!==acquisition||!mounted.current||epoch.current!==ticket||AppState.currentState!=='active'){
   client.close();await vault.close();return;
  }
  let graphClient:GraphClient|null;try{graphClient=descriptor.profile===DEVICE_EXTERNAL_FLAT_SHARE_V1?null:createDeviceExternalFlatGraphApiV1({descriptor,fetchImpl:expoFetch});}catch(error){client.close();await vault.close();throw error;}
  acquiring.current=null;const selected:Connection={client,graphClient,noteClosed:false,vault,descriptor};connection.current=selected;
  const local=await vault.summary();current(ticket,selected);
  if(local.descriptor!==null&&JSON.stringify(local.descriptor)!==JSON.stringify(descriptor))throw Error('MOBILE_EXTERNAL_FLAT_BINDING_CHANGED');
  setSummary(local);setConnected(true);setRecipient(local.recipient===null?'':'0x'+local.recipient);setAmount(local.amount??'');
  if(local.graph!==null)await readGraphStatus(selected,ticket);else await readStatus(selected,ticket);setNotice('Conexión y nota comprobadas. Cada operación requiere su propia autorización.');
 }
 async function makeReview(selected:Connection,draft:ExternalFlatDraft,ticket:number,witness:unknown|null) {
  const access=await selected.client.challenge();current(ticket,selected);
  const signature=await sign(selected,access,ticket);const consent=await selected.client.review(access,signature,draft);current(ticket,selected);
  reviewRef.current={consent,witness};preparedRef.current=null;setReview(consent);
  setNotice('Comprueba el activo, el importe y la dirección antes de confirmar.');
 }
 async function prepareDeposit() {
  const selected=requireConnection();clearReview();const ticket=epoch.current,value=await readStatus(selected,ticket);
  const address=/^0x[0-9a-fA-F]{40}$/.exec(recipient)?.[0]===recipient?recipient.slice(2).toLowerCase():recipient;
  const prepared=await selected.vault.prepareDeposit(selected.descriptor,address,amount,value.observed.timestamp,selected.descriptor.profile===DEVICE_EXTERNAL_FLAT_SHARE_V1?validUntil:undefined);preparedRef.current=prepared;current(ticket,selected);
  const local=await selected.vault.summary();current(ticket,selected);setSummary(local);
  await makeReview(selected,prepared.draft,ticket,prepared.witness);
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
  try{const signature=await sign(selected,value.consent,ticket);await selected.vault.latch(value.consent);current(ticket,selected);
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
 const available=summary?.storageAvailable===true,uncertain=(summary?.pending!==null&&summary?.pending!==undefined)||graphPending!==null;
 const share=connection.current?.descriptor.profile===DEVICE_EXTERNAL_FLAT_SHARE_V1;
 const canPrepare=connected&&available&&!uncertain&&!deposit;
 return <SafeAreaView style={styles.safe}><ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
  <Text style={styles.title}>{share?'Participación DeFi':'Nota ERC20'}</Text>
  <Text style={styles.muted}>Guarda la clave de una nota en este dispositivo. El servicio conectado ejecuta únicamente la financiación o retirada que autorices.</Text>
  <View style={styles.card}><Text style={styles.heading}>Conexión privada</Text>
   <Text style={styles.label}>Descriptor entregado por tu operador</Text>
   <TextInput accessibilityLabel="Descriptor privado de la nota ERC20" multiline style={[styles.input,styles.descriptor]} value={descriptorText} autoCapitalize="none" autoCorrect={false} editable={!busy}
    onChangeText={text=>{closeConnection();setDescriptorText(text);setSummary(null);}}/>
   <Button label="Conectar y consultar la nota" disabled={busy} onPress={()=>{void run(connect);}}/>
   <Text style={styles.muted}>{connected?'Conexión comprobada':'Sin conexión comprobada'}</Text>
  </View>
  {connected&&<View style={styles.card}><Text style={styles.heading}>Crear nota</Text>
   <Text style={styles.label}>Dirección de retirada</Text><TextInput accessibilityLabel="Dirección de retirada ERC20" style={styles.input} value={recipient} autoCapitalize="none" autoCorrect={false} editable={canPrepare&&summary?.recipient===null&&!busy} onChangeText={setRecipient}/>
   <Text style={styles.label}>Importe en unidades atómicas</Text><TextInput accessibilityLabel="Importe ERC20 en unidades atómicas" style={styles.input} value={amount} keyboardType="number-pad" editable={canPrepare&&summary?.amount===null&&!busy} onChangeText={setAmount}/>
   <Text style={styles.muted}>{connection.current?.descriptor.assetMetadata.symbol} tiene {connection.current?.descriptor.assetMetadata.decimals} decimales. Comprueba el importe exacto antes de confirmar.</Text>
   {share&&<><Text style={styles.label}>Fin del plazo de recepción (segundos Unix)</Text><TextInput accessibilityLabel="Fin del plazo de recepción" style={styles.input} value={validUntil} keyboardType="number-pad" editable={canPrepare&&!busy} onChangeText={setValidUntil}/><Text style={styles.muted}>El operador entrega las participaciones durante el plazo que autorices. La recepción conserva una clave propia en este dispositivo.</Text></>}
   <Button label={share?'Preparar recepción de participación':'Preparar prueba de financiación'} disabled={busy||!canPrepare} onPress={()=>confirmPreparation()}/>
  </View>}
  {connected&&!share&&deposit?.stage==='CONFIRMED'&&<View style={styles.card}><Text style={styles.heading}>Conversión y reserva privadas</Text>
   {graph===null&&!status?.graphClaimed&&<><Text style={styles.muted}>Autoriza primero la recepción en la conexión de participaciones. Usa aquí sus importes y el mismo inicio de plazo; la recuperación conserva una nota propia.</Text>
    <Text style={styles.label}>Activo que recibe la inversión, unidades atómicas</Text><TextInput accessibilityLabel="Importe invertido" style={styles.input} value={graphAssetAmount} keyboardType="number-pad" editable={!busy&&!uncertain} onChangeText={setGraphAssetAmount}/>
    <Text style={styles.label}>Participaciones autorizadas, unidades atómicas</Text><TextInput accessibilityLabel="Participaciones autorizadas" style={styles.input} value={graphShareAmount} keyboardType="number-pad" editable={!busy&&!uncertain} onChangeText={setGraphShareAmount}/>
    <Text style={styles.label}>Importe reservado, unidades atómicas</Text><TextInput accessibilityLabel="Importe reservado" style={styles.input} value={graphPayoutAmount} keyboardType="number-pad" editable={!busy&&!uncertain} onChangeText={setGraphPayoutAmount}/>
    <Text style={styles.label}>Inicio original de recepción, segundos Unix</Text><TextInput accessibilityLabel="Inicio original de recepción" style={styles.input} value={graphValidFrom} keyboardType="number-pad" editable={!busy&&!uncertain} onChangeText={setGraphValidFrom}/>
    <Text style={styles.label}>Vencimiento de la reserva, segundos Unix</Text><TextInput accessibilityLabel="Vencimiento de la reserva" style={styles.input} value={graphSettleBefore} keyboardType="number-pad" editable={!busy&&!uncertain} onChangeText={setGraphSettleBefore}/>
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
  {busy&&<ActivityIndicator accessibilityLabel="Procesando operación ERC20" color="#9de3be"/>}<Text accessibilityLiveRegion="polite" style={styles.notice}>{notice}</Text>
 </ScrollView></SafeAreaView>;
}
const styles=StyleSheet.create({safe:{flex:1,backgroundColor:'#101c22'},content:{padding:20,paddingBottom:48,gap:14},title:{color:'#eaf3f1',fontSize:26,fontWeight:'700'},
 muted:{color:'#b8c8cd',fontSize:13,lineHeight:20},card:{backgroundColor:'#192b33',borderRadius:12,padding:16,gap:10},heading:{color:'#eaf3f1',fontSize:17,fontWeight:'600'},
 label:{color:'#9fb7bd',fontSize:12,marginTop:6},value:{color:'#eaf3f1',fontSize:14,lineHeight:21},input:{backgroundColor:'#101c22',color:'#eaf3f1',padding:12,borderRadius:8},descriptor:{minHeight:100},
 button:{backgroundColor:'#9de3be',padding:12,borderRadius:8,alignItems:'center'},buttonText:{color:'#10231c',fontWeight:'700'},disabled:{opacity:0.45},notice:{color:'#c8dce0',lineHeight:21}});
