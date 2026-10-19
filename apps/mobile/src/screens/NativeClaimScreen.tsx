import {WalletText as Text,WalletTextInput as TextInput} from '../design/typography';
import DeviceRootNativeClaimScreenV2 from './DeviceRootNativeClaimScreenV2';
import type {DeviceRootClaimObservationV2} from '../api/native-claim-device-api-v1.mjs';
import {useEffect,useRef,useState} from 'react';
import {Alert,AppState,Pressable,SafeAreaView,ScrollView,StyleSheet} from 'react-native';
import {fetch as expoFetch} from 'expo/fetch';
import {readDevicePublicKey,signNativeClaimDevicePermissionV1} from '../custody/key-store';
import {createNativeClaimDeviceApiV1} from '../api/native-claim-device-api-v1.mjs';
import {normalizeNativeClaimDeviceDescriptorV1,type NativeClaimDeviceObservationV1} from '../../../../packages/mobile-protocol/src/native-claim-device-v1.mjs';
import {pendingNativeClaimRedemptionV1} from '../custody/native-claim-pending-store-v1';
import type {PendingNativeClaimRedemptionV1} from '../custody/native-claim-pending-v1.mjs';
type Client=ReturnType<typeof createNativeClaimDeviceApiV1>;
export default function NativeClaimScreen({onObservation,onDeviceRootObservation}:{onObservation?(value:NativeClaimDeviceObservationV1):void;onDeviceRootObservation?(value:DeviceRootClaimObservationV2):void}={}){
 const [deviceRoot,setDeviceRoot]=useState(false);
 const [pairing,setPairing]=useState(''),[view,setView]=useState<NativeClaimDeviceObservationV1|null>(null),[busy,setBusy]=useState(false);
 const [requestId,setRequestId]=useState(''),[amount,setAmount]=useState(''),[maxFee,setMaxFee]=useState('');
 const [retained,setRetained]=useState<PendingNativeClaimRedemptionV1|null>(null);
 const admitted=useRef(false);
 const [notice,setNotice]=useState("Enter the pairing delivered by your operator before the original entry.");
 const mounted=useRef(true),epoch=useRef(0),working=useRef(false),client=useRef<Client|null>(null),signing=useRef<AbortController|null>(null);
 function clear(){epoch.current++;signing.current?.abort();signing.current=null;client.current?.close();client.current=null;setView(null);}
 useEffect(()=>{mounted.current=true;const subscription=AppState.addEventListener('change',state=>{if(state!=='active')clear();});
  return()=>{mounted.current=false;epoch.current++;signing.current?.abort();client.current?.close();subscription.remove();};},[]);
 useEffect(()=>{if(!view)return;const original=epoch.current,timer=setTimeout(()=>{if(mounted.current&&epoch.current===original){setView(null);setNotice("The reading's expired.");}},Math.max(0,view.expiresAt-Date.now()));return()=>clearTimeout(timer);},[view]);
 async function redeem(){if(working.current||admitted.current||AppState.currentState!=='active')return;working.current=true;setBusy(true);clear();const ticket=epoch.current;
  const current=()=>{if(!mounted.current||epoch.current!==ticket||AppState.currentState!=='active')throw Error('MOBILE_NATIVE_CLAIM_CONTEXT_CHANGED');};
  try{if(pairing.length>8192)throw Error('MOBILE_NATIVE_CLAIM_PAIRING');const descriptor=normalizeNativeClaimDeviceDescriptorV1(JSON.parse(pairing));
   const key=await readDevicePublicKey();current();if(key!==descriptor.devicePublicKey)throw Error('MOBILE_NATIVE_CLAIM_PAIRING');
   const selected=createNativeClaimDeviceApiV1({descriptor,fetchImpl:expoFetch});current();client.current=selected;
   const pending=await pendingNativeClaimRedemptionV1.read();current();
   if(pending?.state==='UNRESOLVED')throw Error('MOBILE_NATIVE_CLAIM_PENDING_RECOVERY_REQUIRED');
   const permission=await selected.redemptionChallenge({requestId,amount,maxFee});current();
   const approved=await new Promise<boolean>(resolve=>Alert.alert("Review the original expenditure",
    `${permission.amount} ${descriptor.claimSymbol} in atomic units.
Maximum fee: ${permission.maxFee} ${descriptor.atomicUnit}.
Fixed native recipient: ${permission.redemptionBinding.recipientEndpoint}.
Request: ${permission.requestId}.`,
    [{text:"Cancel",style:'cancel',onPress:()=>resolve(false)},{text:"Authorize with biometrics",onPress:()=>resolve(true)}],{cancelable:false}));
   current();if(!approved)return;
   const abort=new AbortController();signing.current=abort;
   const signature=await signNativeClaimDevicePermissionV1(permission,descriptor.origin,descriptor.pairingId,abort.signal);current();
   // The recovery pointer is verified in protected storage BEFORE the POST.
   // No permission or signature from this pointer is ever resubmitted.
   admitted.current=true;const saved=await pendingNativeClaimRedemptionV1.retain(permission,signature);current();setRetained(saved);
   await selected.redeem(permission,signature);current();
   setNotice("Original expenditure admitted. It retains its identifier and authorizes a reading; it only reconciles the same request if the result is uncertain.");
  }catch{if(mounted.current&&epoch.current===ticket){clear();setNotice(admitted.current?"Uncertain result. Keep the identifier and reconcile the original request; do not repeat the expense.":"Unauthorized expenditure. Check the original pairing, amount and maximum commission.");}}
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
    setView(observed);onObservation?.(observed);setNotice(saved?.state==='CONFIRMED'?"Original expenditure confirmed in your journal. You can start another operation explicitly.":"Original Journal read. Amounts deposited are not available native balance.");}
   else{await selected.reconcile(permission,signature);current();setNotice("Original conciliation accepted. Authorizes a new reading to consult its outcome; no funds have been forwarded.");}
  }catch{if(mounted.current&&epoch.current===ticket){clear();setNotice("Consultation not available. Keep the original request and authorize a reading; do not repeat the expense.");}}
  finally{signing.current=null;working.current=false;if(mounted.current)setBusy(false);}
 }
 async function restore(){if(working.current||AppState.currentState!=='active')return;working.current=true;setBusy(true);clear();const ticket=epoch.current;
  try{const saved=await pendingNativeClaimRedemptionV1.read();if(!mounted.current||epoch.current!==ticket||AppState.currentState!=='active')return;
   if(!saved){setNotice("There is no local expense saved. Authorizes a reading of the original journal if the result of an operation is uncertain.");return;}
   setRetained(saved);setPairing(JSON.stringify(saved.descriptor));setRequestId(saved.requestId);setAmount(saved.amount);setMaxFee(saved.maxFee);admitted.current=true;
   setNotice("The same request is recovered. Authorizes a reading or conciliala; no other expenditure has been sent or signed.");
  }catch{if(mounted.current&&epoch.current===ticket){admitted.current=true;setNotice("The protected registry could not be checked. It retains the original identifier and recovers its storage prior to other expense.");}}
  finally{working.current=false;if(mounted.current)setBusy(false);}
 }
 if(deviceRoot)return <DeviceRootNativeClaimScreenV2 onObservation={onDeviceRootObservation} onBack={()=>{clear();setDeviceRoot(false);}}/>;
 return <SafeAreaView style={styles.safe}><ScrollView contentContainerStyle={styles.content}>
  <Text style={styles.title}>Claims BTC / SOL / SPL</Text>
  <Pressable disabled={busy} onPress={()=>{clear();setDeviceRoot(true);}} style={styles.button}><Text style={styles.buttonText}>Private note in custody of the device</Text></Pressable>
  <Text style={styles.text}>Custody of the local backend and quorum. This pairing does not deliver a BTC/SOL key to the device nor does it convert a claim into a native gastable balance.</Text>
  <TextInput accessibilityLabel="Original pairing of claims" multiline autoCapitalize="none" autoCorrect={false} editable={!busy} value={pairing}
   onChangeText={value=>{clear();setPairing(value);}} placeholder="Private operator descriptor" placeholderTextColor="#50616D" style={styles.input}/>
  <Pressable accessibilityRole="button" disabled={busy} onPress={()=>void run(null)} style={styles.button}><Text style={styles.buttonText}>Authorize original reading</Text></Pressable>
  <Pressable accessibilityRole="button" disabled={busy} onPress={()=>void restore()} style={styles.button}><Text style={styles.buttonText}>Recover Saved Spend</Text></Pressable>
  <Text style={styles.text}>{notice}</Text>
  <Text style={styles.text}>Redeem custodial claims using the original burn and delivery ticket. The operator fixes the native recipient before the deposit. This is not a self-custodial mobile transfer.</Text>
  <TextInput accessibilityLabel="Durable cost identifier" value={requestId} onChangeText={setRequestId} editable={!busy&&!admitted.current} autoCapitalize="none" style={styles.input} placeholder="Unique identifier; keep after error"/>
  <TextInput accessibilityLabel="Amount in original atomic units" value={amount} onChangeText={setAmount} editable={!busy&&!admitted.current} keyboardType="numeric" style={styles.input} placeholder="Atomic amount of claims"/>
  <TextInput accessibilityLabel="Original Native Maximum Commission" value={maxFee} onChangeText={setMaxFee} editable={!busy&&!admitted.current} keyboardType="numeric" style={styles.input} placeholder="Maximum atomic commission"/>
  <Pressable accessibilityRole="button" disabled={busy||admitted.current} onPress={()=>void redeem()} style={styles.button}><Text style={styles.buttonText}>Authorize burning and original delivery</Text></Pressable>
  {retained&&<><Text selectable style={styles.text}>Saved request: {retained.requestId}{'\n'}Status: {retained.state==='CONFIRMED'?"Confirmed in original journal":"Pending reconciliation"}{'\n'}Native destination: {retained.recipientEndpoint}</Text>
   <Pressable accessibilityRole="button" disabled={busy} onPress={()=>void run(retained.requestId)} style={styles.button}><Text style={styles.buttonText}>Conciliate this saved expense</Text></Pressable>
   {retained.state==='CONFIRMED'&&<Pressable accessibilityRole="button" disabled={busy} onPress={()=>{clear();admitted.current=false;setRequestId('');setAmount('');setMaxFee('');setRetained(null);setNotice("Enter a new identifier and review its amount. The previous expense retains its identity and confirmation.");}} style={styles.button}><Text style={styles.buttonText}>Prepare other expenditure</Text></Pressable>}
  </>}
  {view&&<><Text style={styles.title}>{view.descriptor.claimSymbol} · {view.descriptor.atomicUnit}</Text>
   <Text selectable style={styles.text}>Domain: {view.descriptor.claimDomain}{'\n'}Native Genesis: {view.descriptor.nativeGenesis}</Text>
   <Text style={styles.text}>Available: not accredited by this journal reading.</Text>
   {view.state.deposits.map(row=><Text key={row.intentId} selectable style={styles.text}>Original deposit: {row.status}{'\n'}{row.intentId}</Text>)}
   {view.state.tickets.map(row=><Text key={row.ticketId} selectable style={styles.text}>Original native delivery: {row.status}{'\n'}{row.ticketId}</Text>)}
   {view.state.requests.map(row=><Pressable key={row.requestId} accessibilityRole="button" disabled={busy} onPress={()=>void run(row.requestId)} style={styles.button}>
    <Text style={styles.buttonText}>{row.action}: {row.state}  · Conciliate original application</Text></Pressable>)}</>}
 </ScrollView></SafeAreaView>;
}
const styles=StyleSheet.create({buttonText:{color:'#F3F0E8',fontWeight:'600',textAlign:'center'},safe:{flex:1,backgroundColor:'#F3F0E8'},content:{padding:20,gap:16},title:{color:'#253746',fontSize:22,fontWeight:'600'},text:{color:'#50616D'},input:{color:'#253746',borderColor:'#50616D',borderWidth:1,padding:12,borderRadius:8,minHeight:96},button:{padding:12,backgroundColor:'#253746',borderRadius:8}});
