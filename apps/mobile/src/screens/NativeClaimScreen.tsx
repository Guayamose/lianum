import {useEffect,useRef,useState} from 'react';
import {Alert,AppState,Pressable,SafeAreaView,ScrollView,StyleSheet,Text,TextInput} from 'react-native';
import {fetch as expoFetch} from 'expo/fetch';
import {readDevicePublicKey,signNativeClaimDevicePermissionV1} from '../custody/key-store';
import {createNativeClaimDeviceApiV1} from '../api/native-claim-device-api-v1.mjs';
import {normalizeNativeClaimDeviceDescriptorV1,type NativeClaimDeviceObservationV1} from '../../../../packages/mobile-protocol/src/native-claim-device-v1.mjs';
import {pendingNativeClaimRedemptionV1} from '../custody/native-claim-pending-store-v1';
import type {PendingNativeClaimRedemptionV1} from '../custody/native-claim-pending-v1.mjs';
type Client=ReturnType<typeof createNativeClaimDeviceApiV1>;
export default function NativeClaimScreen({onObservation}:{onObservation?(value:NativeClaimDeviceObservationV1):void}={}){
 const [pairing,setPairing]=useState(''),[view,setView]=useState<NativeClaimDeviceObservationV1|null>(null),[busy,setBusy]=useState(false);
 const [requestId,setRequestId]=useState(''),[amount,setAmount]=useState(''),[maxFee,setMaxFee]=useState('');
 const [retained,setRetained]=useState<PendingNativeClaimRedemptionV1|null>(null);
 const admitted=useRef(false);
 const [notice,setNotice]=useState('Introduce el emparejamiento entregado por tu operador antes del ingreso original.');
 const mounted=useRef(true),epoch=useRef(0),working=useRef(false),client=useRef<Client|null>(null),signing=useRef<AbortController|null>(null);
 function clear(){epoch.current++;signing.current?.abort();signing.current=null;client.current?.close();client.current=null;setView(null);}
 useEffect(()=>{mounted.current=true;const subscription=AppState.addEventListener('change',state=>{if(state!=='active')clear();});
  return()=>{mounted.current=false;epoch.current++;signing.current?.abort();client.current?.close();subscription.remove();};},[]);
 useEffect(()=>{if(!view)return;const original=epoch.current,timer=setTimeout(()=>{if(mounted.current&&epoch.current===original){setView(null);setNotice('La lectura ha caducado. Autoriza otra consulta.');}},Math.max(0,view.expiresAt-Date.now()));return()=>clearTimeout(timer);},[view]);
 async function redeem(){if(working.current||admitted.current||AppState.currentState!=='active')return;working.current=true;setBusy(true);clear();const ticket=epoch.current;
  const current=()=>{if(!mounted.current||epoch.current!==ticket||AppState.currentState!=='active')throw Error('MOBILE_NATIVE_CLAIM_CONTEXT_CHANGED');};
  try{if(pairing.length>8192)throw Error('MOBILE_NATIVE_CLAIM_PAIRING');const descriptor=normalizeNativeClaimDeviceDescriptorV1(JSON.parse(pairing));
   const key=await readDevicePublicKey();current();if(key!==descriptor.devicePublicKey)throw Error('MOBILE_NATIVE_CLAIM_PAIRING');
   const selected=createNativeClaimDeviceApiV1({descriptor,fetchImpl:expoFetch});current();client.current=selected;
   const pending=await pendingNativeClaimRedemptionV1.read();current();
   if(pending?.state==='UNRESOLVED')throw Error('MOBILE_NATIVE_CLAIM_PENDING_RECOVERY_REQUIRED');
   const permission=await selected.redemptionChallenge({requestId,amount,maxFee});current();
   const approved=await new Promise<boolean>(resolve=>Alert.alert('Revisar el gasto original',
    `${permission.amount} ${descriptor.claimSymbol} en unidades atómicas.\nComisión máxima: ${permission.maxFee} ${descriptor.atomicUnit}.\nDestino nativo fijado: ${permission.redemptionBinding.recipientEndpoint}.\nSolicitud: ${permission.requestId}.`,
    [{text:'Cancelar',style:'cancel',onPress:()=>resolve(false)},{text:'Autorizar con biometría',onPress:()=>resolve(true)}],{cancelable:false}));
   current();if(!approved)return;
   const abort=new AbortController();signing.current=abort;
   const signature=await signNativeClaimDevicePermissionV1(permission,descriptor.origin,descriptor.pairingId,abort.signal);current();
   // The recovery pointer is verified in protected storage BEFORE the POST.
   // No permission or signature from this pointer is ever resubmitted.
   admitted.current=true;const saved=await pendingNativeClaimRedemptionV1.retain(permission,signature);current();setRetained(saved);
   await selected.redeem(permission,signature);current();
   setNotice('Gasto original admitido. Conserva su identificador y autoriza una lectura; sólo concilia esa misma solicitud si el resultado es incierto.');
  }catch{if(mounted.current&&epoch.current===ticket){clear();setNotice(admitted.current?'Resultado incierto. Conserva el identificador y concilia la solicitud original; no repitas el gasto.':'Gasto no autorizado. Comprueba el emparejamiento, importe y comisión máxima originales.');}}
  finally{signing.current=null;working.current=false;if(mounted.current)setBusy(false);}
 }
 async function run(requestId:string|null){if(working.current||AppState.currentState!=='active')return;working.current=true;setBusy(true);clear();const ticket=epoch.current;
  const current=()=>{if(!mounted.current||epoch.current!==ticket||AppState.currentState!=='active')throw Error('MOBILE_NATIVE_CLAIM_CONTEXT_CHANGED');};
  try{if(pairing.length>8192)throw Error('MOBILE_NATIVE_CLAIM_PAIRING');const descriptor=normalizeNativeClaimDeviceDescriptorV1(JSON.parse(pairing));
   const key=await readDevicePublicKey();current();if(key!==descriptor.devicePublicKey)throw Error('MOBILE_NATIVE_CLAIM_PAIRING');
   const selected=createNativeClaimDeviceApiV1({descriptor,fetchImpl:expoFetch});current();client.current=selected;
   const permission=await selected.challenge(requestId===null?'READ_CLAIM_JOURNAL':'RECONCILE_CLAIM_REQUEST',requestId);current();
   const abort=new AbortController();signing.current=abort;
   const signature=await signNativeClaimDevicePermissionV1(permission,descriptor.origin,descriptor.pairingId,abort.signal);current();
   if(requestId===null){const observed=await selected.read(permission,signature);current();const saved=await pendingNativeClaimRedemptionV1.confirm(observed);current();
    setRetained(saved);if(saved){admitted.current=true;setRequestId(saved.requestId);setAmount(saved.amount);setMaxFee(saved.maxFee);}
    setView(observed);onObservation?.(observed);setNotice(saved?.state==='CONFIRMED'?'Gasto original confirmado en su journal. Puedes iniciar otra operación de forma explícita.':'Journal original leído. Los importes depositados no son saldo nativo disponible.');}
   else{await selected.reconcile(permission,signature);current();setNotice('Conciliación original admitida. Autoriza una lectura nueva para consultar su resultado; no se han reenviado fondos.');}
  }catch{if(mounted.current&&epoch.current===ticket){clear();setNotice('Consulta no disponible. Conserva la solicitud original y autoriza una lectura; no repitas el gasto.');}}
  finally{signing.current=null;working.current=false;if(mounted.current)setBusy(false);}
 }
 async function restore(){if(working.current||AppState.currentState!=='active')return;working.current=true;setBusy(true);clear();const ticket=epoch.current;
  try{const saved=await pendingNativeClaimRedemptionV1.read();if(!mounted.current||epoch.current!==ticket||AppState.currentState!=='active')return;
   if(!saved){setNotice('No hay un gasto local guardado. Autoriza una lectura del journal original si el resultado de una operación es incierto.');return;}
   setRetained(saved);setPairing(JSON.stringify(saved.descriptor));setRequestId(saved.requestId);setAmount(saved.amount);setMaxFee(saved.maxFee);admitted.current=true;
   setNotice('La misma solicitud está recuperada. Autoriza una lectura o concíliala; no se ha enviado ni firmado otro gasto.');
  }catch{if(mounted.current&&epoch.current===ticket){admitted.current=true;setNotice('No se pudo comprobar el registro protegido. Conserva el identificador original y recupera su almacenamiento antes de otro gasto.');}}
  finally{working.current=false;if(mounted.current)setBusy(false);}
 }
 return <SafeAreaView style={styles.safe}><ScrollView contentContainerStyle={styles.content}>
  <Text style={styles.title}>Claims BTC / SOL / SPL</Text>
  <Text style={styles.text}>Custodia del backend y quórum local. Este emparejamiento no entrega una clave BTC/SOL al dispositivo ni convierte un claim en saldo nativo gastable.</Text>
  <TextInput accessibilityLabel="Emparejamiento original de claims" multiline autoCapitalize="none" autoCorrect={false} editable={!busy} value={pairing}
   onChangeText={value=>{clear();setPairing(value);}} placeholder="Descriptor privado del operador" placeholderTextColor="#b8c8cd" style={styles.input}/>
  <Pressable accessibilityRole="button" disabled={busy} onPress={()=>void run(null)} style={styles.button}><Text>Autorizar lectura original</Text></Pressable>
  <Pressable accessibilityRole="button" disabled={busy} onPress={()=>void restore()} style={styles.button}><Text>Recuperar el gasto guardado</Text></Pressable>
  <Text style={styles.text}>{notice}</Text>
  <Text style={styles.text}>Redimir claims custodiados mediante el ticket de quema y entrega originales. El destinatario nativo queda fijado por el operador antes del ingreso. No es una transferencia de autocustodia móvil.</Text>
  <TextInput accessibilityLabel="Identificador durable del gasto" value={requestId} onChangeText={setRequestId} editable={!busy&&!admitted.current} autoCapitalize="none" style={styles.input} placeholder="Identificador único; conservar tras un error"/>
  <TextInput accessibilityLabel="Importe en unidades atómicas originales" value={amount} onChangeText={setAmount} editable={!busy&&!admitted.current} keyboardType="numeric" style={styles.input} placeholder="Importe atómico de claims"/>
  <TextInput accessibilityLabel="Comisión máxima nativa original" value={maxFee} onChangeText={setMaxFee} editable={!busy&&!admitted.current} keyboardType="numeric" style={styles.input} placeholder="Comisión máxima atómica"/>
  <Pressable accessibilityRole="button" disabled={busy||admitted.current} onPress={()=>void redeem()} style={styles.button}><Text>Autorizar quema y entrega original</Text></Pressable>
  {retained&&<><Text selectable style={styles.text}>Solicitud guardada: {retained.requestId}{'\n'}Estado: {retained.state==='CONFIRMED'?'Confirmada en el journal original':'Pendiente de conciliar'}{'\n'}Destino nativo: {retained.recipientEndpoint}</Text>
   <Pressable accessibilityRole="button" disabled={busy} onPress={()=>void run(retained.requestId)} style={styles.button}><Text>Conciliar este gasto guardado</Text></Pressable>
   {retained.state==='CONFIRMED'&&<Pressable accessibilityRole="button" disabled={busy} onPress={()=>{clear();admitted.current=false;setRequestId('');setAmount('');setMaxFee('');setRetained(null);setNotice('Introduce un identificador nuevo y revisa su importe. El gasto anterior conserva su identidad y confirmación.');}} style={styles.button}><Text>Preparar otro gasto</Text></Pressable>}
  </>}
  {view&&<><Text style={styles.title}>{view.descriptor.claimSymbol} · {view.descriptor.atomicUnit}</Text>
   <Text selectable style={styles.text}>Dominio: {view.descriptor.claimDomain}{'\n'}Génesis nativa: {view.descriptor.nativeGenesis}</Text>
   <Text style={styles.text}>Disponible: no acreditado por esta lectura del journal.</Text>
   {view.state.deposits.map(row=><Text key={row.intentId} selectable style={styles.text}>Ingreso original: {row.status}{'\n'}{row.intentId}</Text>)}
   {view.state.tickets.map(row=><Text key={row.ticketId} selectable style={styles.text}>Entrega nativa original: {row.status}{'\n'}{row.ticketId}</Text>)}
   {view.state.requests.map(row=><Pressable key={row.requestId} accessibilityRole="button" disabled={busy} onPress={()=>void run(row.requestId)} style={styles.button}>
    <Text>{row.action}: {row.state} · Conciliar solicitud original</Text></Pressable>)}</>}
 </ScrollView></SafeAreaView>;
}
const styles=StyleSheet.create({safe:{flex:1,backgroundColor:'#101c22'},content:{padding:20,gap:16},title:{color:'#eef7f1',fontSize:22,fontWeight:'600'},text:{color:'#b8c8cd'},input:{color:'#eef7f1',borderColor:'#b8c8cd',borderWidth:1,padding:12,borderRadius:8,minHeight:96},button:{padding:12,backgroundColor:'#9de3be',borderRadius:8}});
