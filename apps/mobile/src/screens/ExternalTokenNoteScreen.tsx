import {useEffect,useRef,useState} from 'react';
import {ActivityIndicator,Alert,AppState,Pressable,SafeAreaView,ScrollView,StyleSheet,Text,TextInput,View} from 'react-native';
import {fetch as expoFetch} from 'expo/fetch';
import {readDevicePublicKey,signDeviceExternalFlatPermissionV1} from '../custody/key-store';
import {createDeviceExternalFlatNoteVaultV1} from '../custody/device-external-flat-note-vault-v1';
import type {DeviceExternalFlatSummary,DeviceExternalFlatPrepared} from '../custody/device-external-flat-note-vault-v1';
import {createDeviceExternalFlatNoteApiV1,readDeviceExternalFlatQuoteV1} from '../api/device-external-flat-note-api-v1.mjs';
import {normalizeExternalFlatDescriptorV1,externalFlatWipeV1,validateExternalFlatFreshV1} from '../../../../packages/mobile-protocol/src/device-external-flat-note-v1.mjs';
import type {ExternalFlatAction,ExternalFlatConsent,ExternalFlatDraft,ExternalFlatStatus,ExternalFlatDescriptor} from '../../../../packages/mobile-protocol/src/device-external-flat-note-v1.mjs';

type Client=ReturnType<typeof createDeviceExternalFlatNoteApiV1>;
type Vault=Awaited<ReturnType<typeof createDeviceExternalFlatNoteVaultV1>>;
type Connection={client:Client;vault:Vault;descriptor:ExternalFlatDescriptor};
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
const actionText:Record<ExternalFlatAction,string>={PROVE_D26:'Generar prueba de financiación',FUND_D26:'Financiar esta nota',OBSERVE_D26:'Consultar esta financiación',QUOTE_W39:'Preparar la retirada completa',PROVE_W39:'Generar prueba de retirada',WITHDRAW_W39:'Retirar esta nota',OBSERVE_W39:'Consultar esta retirada'};
const stageText:Record<string,string>={PROVING:'Prueba pendiente de consultar',PROVED:'Prueba disponible',FUNDING_UNKNOWN:'Financiación pendiente de confirmar',WITHDRAWAL_UNKNOWN:'Retirada pendiente de confirmar',CONFIRMED:'Confirmada'};
export default function ExternalTokenNoteScreen() {
 const [descriptorText,setDescriptorText]=useState(''),[recipient,setRecipient]=useState(''),[amount,setAmount]=useState('');
 const [connected,setConnected]=useState(false),[summary,setSummary]=useState<DeviceExternalFlatSummary|null>(null);
 const [review,setReview]=useState<ExternalFlatConsent|null>(null),[status,setStatus]=useState<ExternalFlatStatus|null>(null);
 const [busy,setBusy]=useState(false),[notice,setNotice]=useState('Introduce la conexión privada entregada por tu operador.');
 const mounted=useRef(true),busyRef=useRef(false),epoch=useRef(0),connection=useRef<Connection|null>(null);
 const acquiring=useRef<Promise<Vault>|null>(null),closing=useRef<Promise<unknown>|null>(null),signing=useRef<AbortController|null>(null);
 const reviewRef=useRef<Review|null>(null),preparedRef=useRef<DeviceExternalFlatPrepared|null>(null),activeWitness=useRef<unknown|null>(null);
 function clearReview() {
  signing.current?.abort();signing.current=null;
  externalFlatWipeV1(reviewRef.current?.witness);externalFlatWipeV1(preparedRef.current?.witness);externalFlatWipeV1(activeWitness.current);activeWitness.current=null;
  reviewRef.current=null;preparedRef.current=null;if(mounted.current)setReview(null);
 }
 function closeConnection() {
  epoch.current++;clearReview();const selected=connection.current;connection.current=null;
  selected?.client.close();const acquisition=acquiring.current;acquiring.current=null;
  const previous=closing.current;
  const drain=Promise.allSettled([previous,selected?.vault.close(),acquisition?.then(v=>v.close())]);closing.current=drain;
  if(mounted.current){setConnected(false);setStatus(null);}
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
  const access=await selected.client.challenge();current(ticket,selected);
  const signature=await sign(selected,access,ticket);const value=await selected.client.status(access,signature);current(ticket,selected);
  await selected.vault.acceptStatus(value);current(ticket,selected);
  for(const row of value.jobs){await selected.vault.accept(row);current(ticket,selected);}
  const local=await selected.vault.summary();current(ticket,selected);setSummary(local);setStatus(value);return value;
 }
 async function connect() {
  await closeConnection();const ticket=epoch.current;
  const descriptor=normalizeExternalFlatDescriptorV1(JSON.parse(descriptorText)),key=await readDevicePublicKey();
  if(!mounted.current||epoch.current!==ticket||AppState.currentState!=='active')return;
  if(key===null||key!==descriptor.devicePublicKey)throw Error('MOBILE_EXTERNAL_FLAT_DEVICE_REQUIRED');
  const client=createDeviceExternalFlatNoteApiV1({descriptor,fetchImpl:expoFetch});
  const acquisition=createDeviceExternalFlatNoteVaultV1();acquiring.current=acquisition;let vault:Vault;
  try{vault=await acquisition;}catch(error){client.close();throw error;}
  if(acquiring.current!==acquisition||!mounted.current||epoch.current!==ticket||AppState.currentState!=='active'){
   client.close();await vault.close();return;
  }
  acquiring.current=null;const selected={client,vault,descriptor};connection.current=selected;
  const local=await vault.summary();current(ticket,selected);
  if(local.descriptor!==null&&JSON.stringify(local.descriptor)!==JSON.stringify(descriptor))throw Error('MOBILE_EXTERNAL_FLAT_BINDING_CHANGED');
  setSummary(local);setConnected(true);setRecipient(local.recipient===null?'':'0x'+local.recipient);setAmount(local.amount??'');
  await readStatus(selected,ticket);setNotice('Conexión y nota comprobadas. Cada operación requiere su propia autorización.');
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
  const prepared=await selected.vault.prepareDeposit(selected.descriptor,address,amount,value.observed.timestamp);preparedRef.current=prepared;current(ticket,selected);
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
   setNotice(row.stage==='CONFIRMED'?'Operación confirmada por el servicio original.':'Prueba guardada. Financiar o retirar requiere una nueva autorización.');
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
 const deposit=summary?.jobs.find(row=>row.mode==='deposit_balance'),withdrawal=summary?.jobs.find(row=>row.mode==='withdraw_balance');
 const available=summary?.storageAvailable===true,uncertain=summary?.pending!==null&&summary?.pending!==undefined;
 const canPrepare=connected&&available&&!uncertain&&!deposit;
 return <SafeAreaView style={styles.safe}><ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
  <Text style={styles.title}>Nota ERC20</Text>
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
   <Button label="Preparar prueba de financiación" disabled={busy||!canPrepare} onPress={()=>confirmPreparation()}/>
  </View>}
  {review&&<View style={styles.card}><Text style={styles.heading}>{actionText[review.action]}</Text>
   <Fields values={{Servicio:review.descriptor.origin,Activo:'0x'+review.descriptor.poolTerms.asset,'Contrato de la nota':'0x'+review.descriptor.poolTerms.pool,
    Importe:amountText(review.statement.amount,review.descriptor),'Unidades atómicas':review.statement.amount,'Dirección de retirada':'0x'+review.recipient,
    'Red original':review.descriptor.poolTerms.genesis,'Operación original':review.jobId}}/>
   <Button label="Autorizar esta operación" disabled={busy} onPress={confirmReview}/><Button label="Cancelar revisión" disabled={busy} onPress={clearReview}/>
  </View>}
  <View style={styles.card}><Text style={styles.heading}>Nota y operaciones</Text>
   <Fields values={{'Importe original de la nota':amountText(summary?.amount??null,summary?.descriptor??null),
    'Dirección fijada':summary?.recipient?'0x'+summary.recipient:'No disponible','Financiación':deposit?stageText[deposit.stage]:'No confirmada',
    'Retirada':withdrawal?stageText[withdrawal.stage]:'No confirmada','Resultado pendiente':summary===null?'No disponible':uncertain?'Consulta la misma operación':'Ninguno retenido',
    'Cabeza consultada':connected&&status&&status.expiresAt>Date.now()?status.observed.blockNumber:'No disponible'}}/>
   {!available&&<Text style={styles.muted}>La información local no está disponible. No se puede preparar ni enviar una operación.</Text>}
   {uncertain&&<Text style={styles.muted}>El resultado está pendiente. Consultar conserva la operación original y no vuelve a enviar fondos.</Text>}
   {connected&&<Button label="Consultar operaciones originales" disabled={busy} onPress={()=>{void run(async()=>{const selected=requireConnection();clearReview();await readStatus(selected,epoch.current);setNotice('Estado original consultado. Una operación pendiente no se reenvía.');});}}/>}
   {connected&&deposit?.stage==='PROVED'&&!uncertain&&!withdrawal&&<Button label="Revisar financiación" disabled={busy} onPress={()=>{void run(()=>requestAction('FUND_D26'));}}/>}
   {connected&&deposit?.stage==='FUNDING_UNKNOWN'&&<Button label="Consultar financiación pendiente" disabled={busy} onPress={()=>{void run(()=>requestAction('OBSERVE_D26'));}}/>}
   {connected&&deposit?.stage==='CONFIRMED'&&!withdrawal&&!uncertain&&<Button label="Preparar retirada completa" disabled={busy} onPress={()=>confirmPreparation(true)}/>}
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
