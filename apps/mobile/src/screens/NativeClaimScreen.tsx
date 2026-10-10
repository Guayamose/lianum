import {useEffect,useRef,useState} from 'react';
import {AppState,Pressable,SafeAreaView,ScrollView,StyleSheet,Text,TextInput} from 'react-native';
import {fetch as expoFetch} from 'expo/fetch';
import {readDevicePublicKey,signNativeClaimDevicePermissionV1} from '../custody/key-store';
import {createNativeClaimDeviceApiV1} from '../api/native-claim-device-api-v1.mjs';
import {normalizeNativeClaimDeviceDescriptorV1,type NativeClaimDeviceObservationV1} from '../../../../packages/mobile-protocol/src/native-claim-device-v1.mjs';
type Client=ReturnType<typeof createNativeClaimDeviceApiV1>;
export default function NativeClaimScreen({onObservation}:{onObservation?(value:NativeClaimDeviceObservationV1):void}={}){
 const [pairing,setPairing]=useState(''),[view,setView]=useState<NativeClaimDeviceObservationV1|null>(null),[busy,setBusy]=useState(false);
 const [notice,setNotice]=useState('Introduce el emparejamiento entregado por tu operador antes del ingreso original.');
 const mounted=useRef(true),epoch=useRef(0),working=useRef(false),client=useRef<Client|null>(null),signing=useRef<AbortController|null>(null);
 function clear(){epoch.current++;signing.current?.abort();signing.current=null;client.current?.close();client.current=null;setView(null);}
 useEffect(()=>{mounted.current=true;const subscription=AppState.addEventListener('change',state=>{if(state!=='active')clear();});
  return()=>{mounted.current=false;epoch.current++;signing.current?.abort();client.current?.close();subscription.remove();};},[]);
 useEffect(()=>{if(!view)return;const original=epoch.current,timer=setTimeout(()=>{if(mounted.current&&epoch.current===original){setView(null);setNotice('La lectura ha caducado. Autoriza otra consulta.');}},Math.max(0,view.expiresAt-Date.now()));return()=>clearTimeout(timer);},[view]);
 async function run(requestId:string|null){if(working.current||AppState.currentState!=='active')return;working.current=true;setBusy(true);clear();const ticket=epoch.current;
  const current=()=>{if(!mounted.current||epoch.current!==ticket||AppState.currentState!=='active')throw Error('MOBILE_NATIVE_CLAIM_CONTEXT_CHANGED');};
  try{if(pairing.length>8192)throw Error('MOBILE_NATIVE_CLAIM_PAIRING');const descriptor=normalizeNativeClaimDeviceDescriptorV1(JSON.parse(pairing));
   const key=await readDevicePublicKey();current();if(key!==descriptor.devicePublicKey)throw Error('MOBILE_NATIVE_CLAIM_PAIRING');
   const selected=createNativeClaimDeviceApiV1({descriptor,fetchImpl:expoFetch});current();client.current=selected;
   const permission=await selected.challenge(requestId===null?'READ_CLAIM_JOURNAL':'RECONCILE_CLAIM_REQUEST',requestId);current();
   const abort=new AbortController();signing.current=abort;
   const signature=await signNativeClaimDevicePermissionV1(permission,descriptor.origin,descriptor.pairingId,abort.signal);current();
   if(requestId===null){const observed=await selected.read(permission,signature);current();setView(observed);onObservation?.(observed);setNotice('Journal original leído. Los importes depositados no son saldo nativo disponible.');}
   else{await selected.reconcile(permission,signature);current();setNotice('Conciliación original admitida. Autoriza una lectura nueva para consultar su resultado; no se han reenviado fondos.');}
  }catch{if(mounted.current&&epoch.current===ticket){clear();setNotice('Consulta no disponible. Conserva la solicitud original y autoriza una lectura; no repitas el gasto.');}}
  finally{signing.current=null;working.current=false;if(mounted.current)setBusy(false);}
 }
 return <SafeAreaView style={styles.safe}><ScrollView contentContainerStyle={styles.content}>
  <Text style={styles.title}>Claims BTC / SOL / SPL</Text>
  <Text style={styles.text}>Custodia del backend y quórum local. Este emparejamiento no entrega una clave BTC/SOL al dispositivo ni convierte un claim en saldo nativo gastable.</Text>
  <TextInput accessibilityLabel="Emparejamiento original de claims" multiline autoCapitalize="none" autoCorrect={false} editable={!busy} value={pairing}
   onChangeText={value=>{clear();setPairing(value);}} placeholder="Descriptor privado del operador" placeholderTextColor="#b8c8cd" style={styles.input}/>
  <Pressable accessibilityRole="button" disabled={busy} onPress={()=>void run(null)} style={styles.button}><Text>Autorizar lectura original</Text></Pressable>
  <Text style={styles.text}>{notice}</Text>
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
