import {useEffect,useRef,useState} from 'react';
import {ActivityIndicator,Alert,AppState,Pressable,SafeAreaView,ScrollView,StyleSheet,Text,TextInput,View} from 'react-native';
import {fetch as expoFetch} from 'expo/fetch';
import {readDevicePublicKey,signDeviceDefiPositionAccessV1,signDeviceDefiPositionReadV1} from '../custody/key-store';
import {createDeviceDefiPositionReadApiV1} from '../api/device-defi-position-read-api-v1.mjs';
import type {DeviceDefiPositionAccessV1,DeviceDefiPositionReadV1,DeviceDefiPositionObservationV1,DeviceDefiPositionHeadV1} from '../../../../packages/mobile-protocol/src/device-defi-position-read-v1.mjs';

type Client=ReturnType<typeof createDeviceDefiPositionReadApiV1>;
type Connection={client:Client;origin:string;pairingId:string;devicePublicKey:string};
function Button({label,onPress,disabled=false}:{label:string;onPress():void;disabled?:boolean}) {
  return <Pressable accessibilityRole="button" accessibilityState={{disabled}} disabled={disabled} onPress={onPress}
    style={[styles.button,disabled&&styles.disabled]}><Text style={styles.buttonText}>{label}</Text></Pressable>;
}
function Fields({values}:{values:Record<string,string>}) {
  return <>{Object.entries(values).map(([label,value])=><View key={label}>
    <Text style={styles.label}>{label}</Text><Text selectable style={styles.value}>{value}</Text></View>)}</>;
}
function fresh(head:DeviceDefiPositionHeadV1|null,now:number) {
  return head!==null&&head.observedAt<=now&&now-head.observedAt<=15000;
}
const units=(value:string|null)=>value===null?'No disponible':value;
export default function DefiPositionsScreen({onObservation}:{onObservation?(value:DeviceDefiPositionObservationV1):void}={}) {
  const [origin,setOrigin]=useState(''),[pairingId,setPairingId]=useState('');
  const [devicePublicKey,setDevicePublicKey]=useState<string|null>(null),[connected,setConnected]=useState(false);
  const [access,setAccess]=useState<DeviceDefiPositionAccessV1|null>(null),[review,setReview]=useState<DeviceDefiPositionReadV1|null>(null);
  const [observation,setObservation]=useState<DeviceDefiPositionObservationV1|null>(null),[readExpiresAt,setReadExpiresAt]=useState<number|null>(null);
  const [busy,setBusy]=useState(false),[notice,setNotice]=useState('Introduce la conexión privada de posiciones entregada por tu operador.');
  const mounted=useRef(true),busyRef=useRef(false),epoch=useRef(0),connection=useRef<Connection|null>(null);
  const accessRef=useRef<DeviceDefiPositionAccessV1|null>(null),reviewRef=useRef<DeviceDefiPositionReadV1|null>(null),signing=useRef<AbortController|null>(null);
  function clearPermissions(disconnect=false) {
    epoch.current++; signing.current?.abort(); signing.current=null;
    accessRef.current=null; reviewRef.current=null;
    setAccess(null);setReview(null);setObservation(null);setReadExpiresAt(null);
    if(disconnect){connection.current?.client.close();connection.current=null;setConnected(false);setDevicePublicKey(null);}
  }
  function current(ticket:number,selected:Connection) {
    if(!mounted.current||AppState.currentState!=='active'||epoch.current!==ticket||connection.current!==selected)
      throw Error('MOBILE_DEFI_POSITION_CONTEXT_CHANGED');
  }
  useEffect(()=>{
    mounted.current=true;
    const subscription=AppState.addEventListener('change',value=>{if(value!=='active'){
      clearPermissions(true);setNotice('La consulta se ha cerrado. Vuelve a conectar y autorizar una lectura.');
    }});
    return()=>{mounted.current=false;epoch.current++;signing.current?.abort();connection.current?.client.close();connection.current=null;subscription.remove();};
  },[]);
  useEffect(()=>{
    const expiry=access?.expiresAt??review?.expiresAt??readExpiresAt;
    if(expiry===null||expiry===undefined)return;
    const ticket=epoch.current,timer=setTimeout(()=>{
      if(mounted.current&&epoch.current===ticket){clearPermissions();setNotice('La lectura o el permiso han caducado. Solicita una nueva consulta.');}
    },Math.max(0,expiry-Date.now()));
    return()=>clearTimeout(timer);
  },[access,review,readExpiresAt]);
  async function run(work:()=>Promise<void>) {
    if(busyRef.current||AppState.currentState!=='active')return;
    busyRef.current=true;setBusy(true);
    try{await work();}catch{if(mounted.current){clearPermissions(true);setNotice('Posiciones no disponibles. Comprueba la conexión y solicita una nueva consulta.');}}
    finally{busyRef.current=false;if(mounted.current)setBusy(false);}
  }
  async function connect() {
    clearPermissions(true);const ticket=epoch.current,key=await readDevicePublicKey();
    if(!key)throw Error('MOBILE_KEY_REQUIRED');
    if(!mounted.current||epoch.current!==ticket||AppState.currentState!=='active')return;
    const client=createDeviceDefiPositionReadApiV1({descriptor:{origin,pairingId,devicePublicKey:key},fetchImpl:expoFetch});
    const selected={client,origin,pairingId,devicePublicKey:key};connection.current=selected;
    const value=await client.challenge();current(ticket,selected);
    setDevicePublicKey(key);setConnected(true);accessRef.current=value;setAccess(value);
    setNotice('Conexión comprobada. Autoriza primero que se muestre qué posiciones podrán consultarse.');
  }
  async function requestAccess() {
    const selected=connection.current;if(!selected)throw Error('MOBILE_DEFI_CONNECTION_REQUIRED');
    clearPermissions();const ticket=epoch.current,key=await readDevicePublicKey();current(ticket,selected);
    if(key!==selected.devicePublicKey)throw Error('MOBILE_KEY_BINDING_CHANGED');
    const value=await selected.client.challenge();current(ticket,selected);accessRef.current=value;setAccess(value);
    setNotice('Autoriza que este servicio muestre las posiciones que podrás consultar.');
  }
  async function openReview(value:DeviceDefiPositionAccessV1) {
    const selected=connection.current;if(!selected||accessRef.current!==value)throw Error('MOBILE_DEFI_PERMISSION_CHANGED');
    const ticket=epoch.current;current(ticket,selected);accessRef.current=null;setAccess(null);
    const controller=new AbortController();signing.current=controller;
    try{const signature=await signDeviceDefiPositionAccessV1(value,selected.origin,selected.pairingId,controller.signal);current(ticket,selected);
      const next=await selected.client.openReview(value,signature);current(ticket,selected);reviewRef.current=next;setReview(next);
      setNotice('Comprueba el servicio, el vault y el activo de cada posición antes de autorizar la lectura.');
    }finally{if(signing.current===controller)signing.current=null;}
  }
  async function read(value:DeviceDefiPositionReadV1) {
    const selected=connection.current;if(!selected||reviewRef.current!==value)throw Error('MOBILE_DEFI_PERMISSION_CHANGED');
    const ticket=epoch.current;current(ticket,selected);reviewRef.current=null;setReview(null);
    const controller=new AbortController();signing.current=controller;
    try{const signature=await signDeviceDefiPositionReadV1(value,selected.origin,selected.pairingId,controller.signal);current(ticket,selected);
      const next=await selected.client.read(value,signature);current(ticket,selected);
      const heads=next.positions.positions.flatMap(row=>[row.ownership.observed,row.valuation.observed]).filter((head):head is DeviceDefiPositionHeadV1=>head!==null);
      const expiry=Math.min(value.expiresAt,...heads.map(head=>head.observedAt+15000));
      if(expiry<=Date.now())throw Error('MOBILE_DEFI_POSITION_STALE');
      setObservation(next);setReadExpiresAt(expiry);
      onObservation?.(next);
      setNotice(next.positions.positions.some(row=>row.ownership.status!=='LIVE')
        ?'Hay posiciones sin una lectura vigente. Sus importes aparecen como no disponibles.'
        :'Posiciones comprobadas en la cabeza indicada. Esta consulta no mueve fondos.');
    }finally{if(signing.current===controller)signing.current=null;}
  }
  function confirmAccess() {
    const value=accessRef.current;if(!value||busyRef.current)return;
    Alert.alert('Mostrar las posiciones a consultar','Permite mostrar los vaults y activos de este servicio. Todavía no revela sus importes ni autoriza operaciones.',[
      {text:'Cancelar',style:'cancel',onPress:()=>clearPermissions()},
      {text:'Confirmar con biometría',onPress:()=>{void run(()=>openReview(value));}},
    ],{cancelable:false});
  }
  function confirmRead() {
    const value=reviewRef.current;if(!value||busyRef.current)return;
    Alert.alert('Leer estas posiciones','Revela los importes y estados de las posiciones mostradas, custodiadas en el backend conectado. No autoriza entradas, salidas ni retiradas.',[
      {text:'Cancelar',style:'cancel',onPress:()=>clearPermissions()},
      {text:'Confirmar con biometría',onPress:()=>{void run(()=>read(value));}},
    ],{cancelable:false});
  }
  const now=Date.now(),valid=observation!==null&&readExpiresAt!==null&&now<readExpiresAt;
  return <SafeAreaView style={styles.safe}><ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <Text style={styles.title}>Posiciones DeFi</Text>
    <Text style={styles.muted}>Consulta las posiciones del backend conectado con dos permisos específicos. La custodia permanece en ese servicio.</Text>
    <View style={styles.card}><Text style={styles.heading}>Conexión privada</Text>
      <Text style={styles.label}>Origen HTTPS de posiciones</Text>
      <TextInput accessibilityLabel="Origen HTTPS de posiciones" style={styles.input} value={origin} autoCapitalize="none" autoCorrect={false} keyboardType="url" editable={!busy}
        onChangeText={value=>{clearPermissions(true);setOrigin(value);}}/>
      <Text style={styles.label}>ID de vinculación de posiciones</Text>
      <TextInput accessibilityLabel="ID de vinculación de posiciones" style={styles.input} value={pairingId} autoCapitalize="none" autoCorrect={false} editable={!busy}
        onChangeText={value=>{clearPermissions(true);setPairingId(value);}}/>
      <Button label="Conectar para ver posiciones" disabled={busy} onPress={()=>{void run(connect);}}/>
      {connected&&devicePublicKey&&<Fields values={{Servicio:origin,'Dispositivo vinculado':devicePublicKey}}/>}
      <Text style={styles.muted}>{connected?'Servicio conectado':'Sin conexión comprobada'}</Text>
    </View>
    {connected&&!access&&!review&&<Button label="Solicitar nueva consulta" disabled={busy} onPress={()=>{void run(requestAccess);}}/>}
    {access&&<View style={styles.card}><Text style={styles.heading}>Permiso para mostrar posiciones</Text>
      <Fields values={{Servicio:access.origin,Vinculación:access.pairingId,'Identidad del dispositivo':access.devicePublicKey}}/>
      <Button label="Mostrar posiciones con biometría" disabled={busy} onPress={confirmAccess}/>
      <Button label="Cancelar" disabled={busy} onPress={()=>clearPermissions()}/>
    </View>}
    {review&&<View style={styles.card}><Text style={styles.heading}>Revisar posiciones</Text>
      <Fields values={{Servicio:review.origin}}/>
      {review.targets.map((target,index)=><View key={target.shareAssetId} style={styles.position}>
        <Text style={styles.heading}>Posición {index+1}</Text>
        <Fields values={{Vault:'0x'+target.vault,'Activo subyacente':'0x'+target.underlyingToken,'Red (chain ID)':target.vaultIdentity.chainId,
          'Identidad de participaciones':target.shareAssetId,'Generación original':target.generationId,'Dominio original':target.vaultIdentity.domain}}/>
      </View>)}
      <Button label="Leer posiciones con biometría" disabled={busy} onPress={confirmRead}/>
      <Button label="Cancelar" disabled={busy} onPress={()=>clearPermissions()}/>
    </View>}
    <View style={styles.card}><Text style={styles.heading}>Posiciones observadas</Text>
      {!valid&&<Text style={styles.value}>No disponible</Text>}
      {valid&&observation.positions.positions.map((row,index)=>{
        const live=row.ownership.status==='LIVE'&&fresh(row.ownership.observed,now)&&row.ownership.balances!==null;
        const valued=live&&row.valuation.status==='LIVE'&&fresh(row.valuation.observed,now);
        const balance=live?row.ownership.balances:null;
        return <View key={row.shareAssetId} style={styles.position}><Text style={styles.heading}>Posición {index+1}</Text>
          <Fields values={{Vault:'0x'+row.vault,'Activo subyacente':'0x'+row.underlyingToken,'Identidad de participaciones':row.shareAssetId,
            'Estado':live?'Vigente':'No disponible','Disponibles':units(balance?.available??null),'Reservadas':units(balance?.reserved??null),
            'Bloqueadas':units(balance?.locked??null),'En recuperación':units(balance?.recovery??null),
            'Bloque observado':live&&row.ownership.observed?row.ownership.observed.blockNumber:'No disponible'}}/>
          <Text style={styles.muted}>Importes exactos en unidades atómicas de participaciones. Las categorías se muestran por separado y no se suman.</Text>
          <Fields values={{'Estimación de subyacente (unidades atómicas)':units(valued?row.valuation.estimatedRedeemableUnderlying:null)}}/>
          <Text style={styles.muted}>La estimación no es saldo disponible ni confirma liquidez para retirar.</Text>
          {live&&row.ownership.pendingRequests&&row.ownership.pendingRequests.length>0&&<Text style={styles.muted}>Hay peticiones pendientes. Esta lectura no las reenvía.</Text>}
        </View>;
      })}
    </View>
    {busy&&<ActivityIndicator accessibilityLabel="Consultando posiciones" color="#9de3be"/>}
    <Text accessibilityLiveRegion="polite" style={styles.notice}>{notice}</Text>
  </ScrollView></SafeAreaView>;
}
const styles=StyleSheet.create({
  safe:{flex:1,backgroundColor:'#101c22'},content:{padding:20,paddingBottom:48,gap:14},title:{color:'#eaf3f1',fontSize:26,fontWeight:'700'},
  muted:{color:'#b8c8cd',fontSize:13,lineHeight:20},card:{backgroundColor:'#192b33',borderRadius:12,padding:16,gap:10},heading:{color:'#eaf3f1',fontSize:17,fontWeight:'600'},
  label:{color:'#9fb7bd',fontSize:12,marginTop:6},value:{color:'#eaf3f1',fontSize:14,lineHeight:21},input:{backgroundColor:'#101c22',color:'#eaf3f1',padding:12,borderRadius:8},
  button:{backgroundColor:'#9de3be',padding:12,borderRadius:8,alignItems:'center'},buttonText:{color:'#10231c',fontWeight:'700'},disabled:{opacity:0.45},
  position:{gap:8,borderTopColor:'#34505c',borderTopWidth:1,paddingTop:12,marginTop:6},notice:{color:'#c8dce0',lineHeight:21},
});
