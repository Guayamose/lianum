import {useEffect,useState} from 'react';
import {Pressable,SafeAreaView,ScrollView,StyleSheet,Text,View} from 'react-native';
import type {PrivateWalletStateActorV1,PrivateWalletRowV1} from '../state/private-wallet-state-v1.mjs';
function amount(value:string|null,row:PrivateWalletRowV1){
 if(value===null)return 'No disponible';if(row.decimals===null)return value+' unidades';
 const text=value.padStart(row.decimals+1,'0');return(row.decimals?text.slice(0,-row.decimals)+'.'+text.slice(-row.decimals):text)+' '+row.label;
}
export default function PrivateWalletStateScreen({state,onOpen}:{state:PrivateWalletStateActorV1;onOpen(kind:'original'|'defi'|'external'|'deposit'):void}){
 const [snapshot,setSnapshot]=useState(()=>state.snapshot());
 useEffect(()=>{const timer=setInterval(()=>setSnapshot(state.snapshot()),1000);return()=>clearInterval(timer);},[state]);
 return <SafeAreaView style={styles.safe}><ScrollView contentContainerStyle={styles.content}>
  <Text style={styles.title}>Estado privado</Text>
  <Text style={styles.muted}>Aquí aparecen las lecturas que has autorizado. Actualiza cada origen con su propio permiso. No se suman activos, custodias ni valoraciones.</Text>
  {snapshot.rows.length===0&&<Text style={styles.muted}>Todavía no has autorizado ninguna lectura en esta sesión. Las operaciones siguen guardadas en sus custodias originales.</Text>}
  {snapshot.rows.map(row=><View key={row.key} style={styles.card}>
   <Text style={styles.heading}>{row.label} · {row.custody==='DEVICE'?'Dispositivo':'Cuenta vinculada'}</Text>
   <Text style={styles.muted}>{row.state==='LIVE'?'Lectura vigente':row.state==='STALE'?'Lectura caducada; autoriza otra consulta':'Resultado pendiente de comprobar'}</Text>
   <Text selectable style={styles.identity}>Red o dominio: {row.route.chainId??row.route.domain??'Pendiente de vincular'}{row.route.genesis?'\nGénesis: '+row.route.genesis:''}{'\n'}Origen: {row.route.origin??'Custodia local'}{'\n'}Pool o vault: {row.route.pool??row.route.vault}</Text>
   {row.route.component==='POSITION'?<><Text style={styles.value}>Participaciones disponibles: {amount(row.shares,row)}</Text><Text style={styles.muted}>Estimación de canje: {row.valuation?.amount??'No disponible'} unidades del subyacente. Requiere una salida confirmada para convertirse en saldo.</Text></>
    :row.route.component==='DEVICE_SHARE_NOTE'?<><Text style={styles.value}>{row.noteState==='SPENT'&&row.state==='LIVE'?'Nota gastada':'Participaciones disponibles: '+amount(row.shares,row)}</Text><Text style={styles.muted}>Participaciones privadas en custodia del dispositivo. Consulta o retira esta nota desde su origen.</Text></>
    :row.route.component==='DEVICE_NOTE'?<><Text style={styles.value}>Importe de la nota: {amount(row.noteAmount,row)}</Text><Text style={styles.muted}>La confirmación de financiación no acredita por sí sola que la nota siga sin gastar.</Text></>
    :<><Text style={styles.value}>Disponible: {amount(row.available,row)}</Text><Text style={styles.value}>Reservado: {amount(row.reserved,row)}</Text><Text style={styles.value}>Bloqueado: {amount(row.locked,row)}</Text><Text style={styles.muted}>Procedente de recuperación: {amount(row.recovery,row)}; incluido en los importes anteriores.</Text></>}
   {row.requests.map(request=><Text key={request.kind+':'+request.requestId} selectable style={styles.muted}>{request.kind}: {request.state}{'\n'}{request.requestId}</Text>)}
   <Pressable accessibilityRole="button" onPress={()=>onOpen(row.route.component==='POSITION'?'defi':['DEVICE_NOTE','DEVICE_SHARE_NOTE','DEVICE_GRAPH_NOTE','DEVICE_GRAPH_RESERVATION'].includes(String(row.route.component))?'external':['DEVICE_NATIVE_NOTE','DEVICE_NATIVE_SOURCE'].includes(String(row.route.component))?'deposit':'original')} style={styles.button}><Text style={styles.buttonText}>Actualizar este origen</Text></Pressable>
  </View>)}
  <View style={styles.actions}>{([['original','Consultar cuenta'],['defi','Consultar posiciones'],['external','Consultar nota ERC20'],['deposit','Consultar notas nativas']]as const).map(([kind,label])=><Pressable key={kind} accessibilityRole="button" onPress={()=>onOpen(kind)} style={styles.button}><Text style={styles.buttonText}>{label}</Text></Pressable>)}</View>
 </ScrollView></SafeAreaView>;
}
const styles=StyleSheet.create({safe:{flex:1,backgroundColor:'#101c22'},content:{padding:20,gap:16},title:{color:'#eef7f1',fontSize:25,fontWeight:'700'},heading:{color:'#eef7f1',fontSize:18,fontWeight:'600'},muted:{color:'#b8c8cd',fontSize:14},identity:{color:'#b8c8cd',fontSize:12},value:{color:'#eef7f1',fontSize:16},card:{padding:16,gap:10,backgroundColor:'#1b2b32',borderRadius:12},button:{padding:12,backgroundColor:'#9de3be',borderRadius:8},buttonText:{color:'#101c22',fontWeight:'600'},actions:{gap:12}});
