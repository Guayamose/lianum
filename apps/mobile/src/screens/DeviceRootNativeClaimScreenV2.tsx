import {WalletText as Text,WalletTextInput as TextInput} from '../design/typography';
/** Device note custody and native local quorum are deliberately separate.
 * Every operation uses the SAME RootNote and fixed original paired intake. */
import {useEffect,useRef,useState} from 'react';
import {AppState,Pressable,SafeAreaView,ScrollView,StyleSheet} from 'react-native';
import {fetch as expoFetch} from 'expo/fetch';
import {readDevicePublicKey,signDeviceRootNativeClaimPermissionV2,signDeviceRootNativeClaimExitPermissionV3} from '../custody/key-store';
import {inspectLocalRootNoteVaultV1,createLocalRootNoteVaultV1,openLocalRootNoteVaultV1} from '../custody/local-root-note-vault-v1';
import {createDeviceRootNativeClaimApiV2,type DeviceRootClaimObservationV2} from '../api/native-claim-device-api-v1.mjs';
import {normalizeDeviceRootClaimDescriptorV2,type DeviceRootClaimPermissionV2,type DeviceRootClaimExitPermissionV3} from '../../../../packages/mobile-protocol/src/native-claim-device-v1.mjs';
import {normalizeLocalDepositChoiceV1} from '../custody/unissued-deposit-terms-v1.mjs';
type Client=ReturnType<typeof createDeviceRootNativeClaimApiV2>;
type Vault=ReturnType<typeof openLocalRootNoteVaultV1>;
export default function DeviceRootNativeClaimScreenV2({onObservation,onBack}:{onObservation?(v:DeviceRootClaimObservationV2):void;onBack():void}){
 const [pairing,setPairing]=useState(''),[amount,setAmount]=useState(''),[busy,setBusy]=useState(false),[notice,setNotice]=useState('Empareja el producto DEVICE_ROOT original antes de financiar.');
 const [view,setView]=useState<DeviceRootClaimObservationV2|null>(null);
 const live=useRef(true),epoch=useRef(0),running=useRef(false),client=useRef<Client|null>(null),vault=useRef<Vault|null>(null),abort=useRef<AbortController|null>(null);
 function revoke(){epoch.current++;abort.current?.abort();abort.current=null;client.current?.close();client.current=null;vault.current?.close();vault.current=null;setView(null);}
 useEffect(()=>{live.current=true;const s=AppState.addEventListener('change',v=>{if(v!=='active')revoke();});return()=>{live.current=false;epoch.current++;abort.current?.abort();client.current?.close();vault.current?.close();s.remove();};},[]);
 useEffect(()=>{if(!view)return;const n=epoch.current,t=setTimeout(()=>{if(live.current&&epoch.current===n){setView(null);setNotice('Lectura caducada. Autoriza una nueva consulta original.');}},Math.max(0,view.expiresAt-Date.now()));return()=>clearTimeout(t);},[view]);
 async function operate(action:'D27'|'FUND_NATIVE_CLAIM'|'CI51'|'ISSUE_CLAIM'|'READ'|'PROVE_W39'|'WITHDRAW_W39'|'OBSERVE_W39'|'REDEEM_NATIVE'|'PAYOUT_NATIVE'|'OBSERVE_NATIVE'){
  if(running.current||AppState.currentState!=='active')return;running.current=true;setBusy(true);revoke();const n=epoch.current;
  const current=()=>{if(!live.current||epoch.current!==n||AppState.currentState!=='active')throw Error('MOBILE_CLAIM_CONTEXT_CHANGED');};
  let request:Readonly<{close():void}>|null=null;
  try{
   if(pairing.length>8192)throw Error('MOBILE_CLAIM_PAIRING');const raw=JSON.parse(pairing),descriptor=normalizeDeviceRootClaimDescriptorV2(raw.descriptor);
   const pub=await readDevicePublicKey();current();if(pub!==descriptor.claim.devicePublicKey)throw Error('MOBILE_CLAIM_PAIRING');
   const selected=createDeviceRootNativeClaimApiV2({descriptor,fetchImpl:expoFetch});client.current=selected;current();
   let inspection=await inspectLocalRootNoteVaultV1();current();
   if(action==='D27'&&inspection.status==='ABSENT_METADATA'){await createLocalRootNoteVaultV1();current();inspection=await inspectLocalRootNoteVaultV1();current();}
   if(inspection.status!=='ACTIVE'||!inspection.rootId)throw Error('MOBILE_CLAIM_ORIGINAL_ROOT_REQUIRED');
   const custody=openLocalRootNoteVaultV1(inspection.rootId);vault.current=custody;current();
   const sign=async(p:DeviceRootClaimPermissionV2)=>{current();const cancellation=new AbortController();abort.current=cancellation;
    const signature=await signDeviceRootNativeClaimPermissionV2(p,descriptor.claim.origin,descriptor.claim.pairingId,cancellation.signal);current();return signature;};
   const signExit=async(p:DeviceRootClaimExitPermissionV3)=>{current();const cancellation=new AbortController();abort.current=cancellation;const signature=await signDeviceRootNativeClaimExitPermissionV3(p,descriptor.claim.origin,descriptor.claim.pairingId,cancellation.signal);current();return signature;};
   const readCurrent=async()=>{const p=await selected.challenge('READ'),signature=await sign(p),observed=await selected.read(p,signature);current();await custody.applyDeviceRootClaimObservationV2(observed);current();onObservation?.(observed);setView(observed);};
   if(action==='D27'){
    const original=await custody.readDeviceRootClaimCustodyV2();current();if(original)throw Error('MOBILE_CLAIM_ALREADY_ADMITTED');
    const choice=normalizeLocalDepositChoiceV1(raw.originalWindow);if(choice.relation!=='D27')throw Error('MOBILE_CLAIM_ORIGINAL_WINDOW_REQUIRED');
    const note=await custody.readPreparedNote();current();
    if(!note){await custody.prepareUnissuedBalanceNote({scope:descriptor.scope,policy:descriptor.policy,pool:descriptor.pool,recipient:descriptor.recipient,amount});current();}
    const review=await custody.reviewPreparedDeposit(choice);current();const signed=await custody.signPreparedDeposit(review);current();
    const originalRequest=await custody.createDeviceRootClaimRequestV2(signed,descriptor);request=originalRequest;current();
    const access=await selected.challenge('ACCESS'),accessSignature=await sign(access);
    const permission=await selected.reviewD27(access,accessSignature,{rootId:originalRequest.rootId,noteRevision:originalRequest.noteRevision,statement:originalRequest.statement,witnessSHA256:originalRequest.witnessSHA256});current();
    const signature=await sign(permission),packet=await custody.sealDeviceRootClaimRequestV2(originalRequest,permission,signature);current();
    await selected.submit(permission,signature,packet);current();setNotice('D27 original preparado. La raíz y clave de nota permanecen en este dispositivo.');
   }else if(action==='CI51'){
    const witnessSHA256=await custody.deviceRootClaimIngressWitnessHashV2();current();
    const access=await selected.challenge('ACCESS'),accessSignature=await sign(access);
    const review=await selected.reviewCI51(access,accessSignature,witnessSHA256);current();
    const signature=await sign(review.consent),packet=await custody.sealDeviceRootClaimIngressV2(review,signature);current();
    await selected.submit(review.consent,signature,packet);current();setNotice('CI51 original probado sobre el mismo ingreso nativo observado. No se ha emitido otro ingreso.');
   }else if(action==='PROVE_W39'){
    const access=await selected.challenge('ACCESS'),quote=await selected.quoteW39(access,await sign(access));current();
    const originalRequest=await custody.prepareDeviceRootClaimExitV3(quote);request=originalRequest;current();
    const reviewAccess=await selected.challenge('ACCESS'),p=await selected.reviewW39(reviewAccess,await sign(reviewAccess),quote,originalRequest.witnessSHA256);current();
    const signature=await signExit(p),packet=await custody.sealDeviceRootClaimExitV3(originalRequest,p,signature);current();await selected.exitSubmit(p,signature,packet);current();
    setNotice('W39 retenido para la misma nota. La prueba no envía el retiro. Autoriza su envío una sola vez.');await readCurrent();
   }else if(['WITHDRAW_W39','OBSERVE_W39','REDEEM_NATIVE','PAYOUT_NATIVE','OBSERVE_NATIVE'].includes(action)){
    const access=await selected.challenge('ACCESS'),p=await selected.exitChallenge(access,await sign(access),action as Exclude<DeviceRootClaimExitPermissionV3['action'],'PROVE_W39'>);current();const signature=await signExit(p);
    if(['WITHDRAW_W39','REDEEM_NATIVE','PAYOUT_NATIVE'].includes(action)){await custody.latchDeviceRootClaimExitV3(p);current();}
    await selected.exitSubmit(p,signature);current();await readCurrent();
    setNotice(action.startsWith('OBSERVE_')?'Mismo job conciliado; ninguna nueva prueba ni envío.':action==='WITHDRAW_W39'?'Retiro W39 original enviado una vez. Una respuesta perdida sólo se consulta.':action==='REDEEM_NATIVE'?'Ticket original solicitado sobre el mismo retiro W39.':'Entrega nativa admitida una vez bajo custodia local. La descarga CO42 usa el mismo resultado original.');
   }else if(action==='READ'){
    await readCurrent();
    setNotice('Mismo claim conciliado. Un journal o RPC no acredita saldo nativo disponible.');
   }else{
    const p=await selected.effectChallenge(action as 'FUND_NATIVE_CLAIM'|'ISSUE_CLAIM'),signature=await sign(p);current();
    await custody.latchDeviceRootClaimEffectV2(p);current();await selected.submit(p,signature);current();
    setNotice(action==='FUND_NATIVE_CLAIM'?'Ingreso original admitido una sola vez. Autoriza CI51 tras su observación nativa.':'Emisión original admitida. Autoriza una lectura para conciliar el mismo resultado.');
   }
  }catch{if(live.current&&epoch.current===n)setNotice('Resultado incierto o autorización rechazada. Conserva RootNote y el journal; consulta el mismo original. No repitas un ingreso ni una prueba admitida.');}
  finally{request?.close();abort.current=null;running.current=false;if(live.current)setBusy(false);}
 }
 return <SafeAreaView style={styles.safe}><ScrollView contentContainerStyle={styles.content}>
  <Pressable disabled={busy} onPress={()=>{revoke();onBack();}} style={styles.button}><Text style={styles.buttonText}>Volver a claims custodiados</Text></Pressable>
  <Text style={styles.title}>Nota privada BTC / SOL / SPL</Text>
  <Text style={styles.text}>La nota y su clave permanecen en RootNote. Los activos nativos y el quórum siguen bajo custodia del laboratorio original; no es autocustodia BTC/SOL ni operación de operadores independientes.</Text>
  <TextInput multiline value={pairing} onChangeText={v=>{revoke();setPairing(v);}} editable={!busy} autoCapitalize="none" autoCorrect={false} accessibilityLabel="Emparejamiento DEVICE_ROOT original" style={styles.input}/>
  <TextInput value={amount} onChangeText={setAmount} editable={!busy} keyboardType="numeric" accessibilityLabel="Importe de la nota en unidades atómicas originales" style={styles.input}/>
  {(['D27','FUND_NATIVE_CLAIM','CI51','ISSUE_CLAIM','READ'] as const).map(action=><Pressable key={action} disabled={busy} onPress={()=>void operate(action)} style={styles.button}><Text style={styles.buttonText}>{action==='D27'?'Preparar y probar D27':action==='CI51'?'Probar CI51 del ingreso observado':action==='READ'?'Leer y conciliar el mismo claim':action==='FUND_NATIVE_CLAIM'?'Autorizar ingreso original una vez':'Autorizar emisión original una vez'}</Text></Pressable>)}
  {(['PROVE_W39','WITHDRAW_W39','OBSERVE_W39','REDEEM_NATIVE','PAYOUT_NATIVE','OBSERVE_NATIVE'] as const).map(action=><Pressable key={action} disabled={busy} onPress={()=>void operate(action)} style={styles.button}><Text style={styles.buttonText}>{({PROVE_W39:'Preparar W39 de la misma nota',WITHDRAW_W39:'Enviar W39 una vez',OBSERVE_W39:'Conciliar el mismo W39',REDEEM_NATIVE:'Solicitar entrega nativa original',PAYOUT_NATIVE:'Autorizar entrega nativa una vez',OBSERVE_NATIVE:'Conciliar la misma entrega nativa'})[action]}</Text></Pressable>)}
  <Text style={styles.text}>{notice}</Text>
  {view&&<Text style={styles.text}>{view.descriptor.claim.claimSymbol}: {view.note?.state??view.deposit?.status??'UNKNOWN'} · Disponible: {view.note?.state==='LIVE'?view.note.available:'sin lectura vigente'} unidades de claim privado; activo nativo bajo custodia local.</Text>}
 </ScrollView></SafeAreaView>;
}
const styles=StyleSheet.create({buttonText:{color:'#F3F0E8',fontWeight:'600',textAlign:'center'},safe:{flex:1,backgroundColor:'#F3F0E8'},content:{padding:20,gap:16},title:{color:'#253746',fontSize:22},text:{color:'#50616D'},input:{color:'#253746',borderColor:'#50616D',borderWidth:1,padding:12,minHeight:70},button:{padding:12,backgroundColor:'#253746',borderRadius:8}});
