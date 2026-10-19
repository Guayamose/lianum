import {WalletText as Text,WalletTextInput as TextInput} from '../design/typography';
import {useEffect,useRef,useState} from 'react';
import {Alert,AppState,Share,StyleSheet,View} from 'react-native';
import {WalletButton,WalletCard,WalletChoice,WalletScreenLayout,WalletStatus,walletColors} from '../components/wallet-ui';
import type {PublicConnectionRegistryV1} from '../state/public-connection-registry-v1.mjs';
import {exportJointWalletRecoveryV4,restoreJointWalletRecoveryV1,type WalletRecoveryProgressV1} from '../custody/wallet-recovery-native-v1';
import {WALLET_RECOVERY_MAX_BYTES_V1,walletRecoveryPackagePublicKeyV1} from '../custody/wallet-recovery-package-v1.mjs';
import {isWalletRecoveryPartsV4,walletRecoveryPartsPublicKeyV4} from '../custody/wallet-recovery-parts-v4.mjs';
const copyPublicKey=(copy:string)=>isWalletRecoveryPartsV4(copy)?walletRecoveryPartsPublicKeyV4(copy):walletRecoveryPackagePublicKeyV1(copy);

type Notice={kind:'info'|'success'|'warning';title:string;detail:string};
type Mode='save'|'restore';
function failureNotice(error:unknown,restore:boolean):Notice{
 const code=error instanceof Error?error.message:'';
 if(code==='MOBILE_WALLET_RECOVERY_BUSY')return{kind:'warning',title:"Wait for the current operation to end",detail:"When the query or movement is finished, re-open the backup."};
 if(code==='MOBILE_CUSTODY_BACKUP_CANCELLED'||code==='MOBILE_AUTHENTICATION_CANCELLED')return{kind:'info',title:restore?"Restore cancelled":"Creation of cancelled copy",detail:restore?"Parts that have already been checked and restored are preserved. You can try again with the same copy.":"You can try again when you're ready."};
 if(code==='MOBILE_CUSTODY_BACKUP_AUTHENTICATION')return{kind:'warning',title:"Could not open copy",detail:"Check the password and that you have pasted all the contents of the file without modifying it."};
 if(code==='MOBILE_CUSTODY_BACKUP_PASSWORD')return{kind:'warning',title:"Check the copy password",detail:"It must have at least 12 characters. If it is too long, try a shorter one."};
 if(code==='MOBILE_CUSTODY_BACKUP_BINDING'||code==='MOBILE_CUSTODY_BACKUP_CONFLICT')return{kind:'warning',title:"Copy doesn't match this wallet.",detail:"No other wallet or your data will be replaced. Use the original copy of this wallet."};
 return{kind:'warning',title:restore?"Restoration not completed":"Copy not created",detail:restore?"Check the file and password. Already verified parts are stored and data that do not match is rejected.":"Try again with the open app and accept the print when requested. Your wallet is still stored on this mobile."};
}

export default function WalletRecoveryScreen({registry,expectedPublicKey,onQuiesce,onBusyChange,onRestored}:{registry?:PublicConnectionRegistryV1;expectedPublicKey?:string|null;onQuiesce?():Promise<void>;onBusyChange?(busy:boolean):void;onRestored?(publicKey:string):void}){
 const [mode,setMode]=useState<Mode>(registry?'save':'restore'),[password,setPassword]=useState(''),[repeat,setRepeat]=useState(''),[input,setInput]=useState(''),[output,setOutput]=useState(''),[partIndex,setPartIndex]=useState(0),[showCopy,setShowCopy]=useState(false),[busy,setBusy]=useState(false),[sharing,setSharing]=useState(false),[progress,setProgress]=useState<WalletRecoveryProgressV1|null>(null),[notice,setNotice]=useState<Notice|null>(null);
 const controller=useRef<AbortController|null>(null),mounted=useRef(true),sharingRef=useRef(false),values=useRef({password:'',repeat:'',input:''});
 const blocked=busy||sharing;const outputParts=output&&isWalletRecoveryPartsV4(output)?output.split('\n'):[output],selectedPart=outputParts[partIndex]??'',partLabel=partIndex===0&&outputParts.length>1?"Copy Index":'Parte '+partIndex+" of "+(outputParts.length-1);
 function clear(){values.current={password:'',repeat:'',input:''};setPassword('');setRepeat('');setInput('');setOutput('');setPartIndex(0);setShowCopy(false);}
 useEffect(()=>{mounted.current=true;const sub=AppState.addEventListener('change',value=>{if(value==='background'){controller.current?.abort();if(!sharingRef.current)clear();}});return()=>{mounted.current=false;controller.current?.abort();values.current={password:'',repeat:'',input:''};sub.remove();};},[]);
 function changeMode(next:Mode){if(blocked||next===mode)return;const change=()=>{clear();setMode(next);setNotice(null);};if(output)Alert.alert("Have you saved the copy yet?","When you change the option, the text from this screen will be deleted. Your wallet will continue on this mobile.",[{text:"Back",style:'cancel'},{text:"I've already kept it, go on.",onPress:change}]);else change();}
 async function work(restore:boolean,reviewedCopy?:string){
  if(!mounted.current||controller.current||sharingRef.current||AppState.currentState!=='active')return;
  if(restore&&reviewedCopy!==values.current.input){setNotice({kind:'warning',title:"The copy has changed.",detail:"Check the copy again before restoring it."});return;}
  if(values.current.password.length<12||!restore&&values.current.password!==values.current.repeat)return;
  const abort=new AbortController();controller.current=abort;let pass=values.current.password,copy=values.current.input;setBusy(true);onBusyChange?.(true);values.current.password='';values.current.repeat='';setPassword('');setRepeat('');setOutput('');setShowCopy(false);setNotice(null);setProgress(null);
  try{
   await onQuiesce?.();if(abort.signal.aborted)throw Error('MOBILE_CUSTODY_BACKUP_CANCELLED');
   if(restore){
    const key=copyPublicKey(copy);if(expectedPublicKey&&key!==expectedPublicKey)throw Error('MOBILE_CUSTODY_BACKUP_BINDING');
    const result=await restoreJointWalletRecoveryV1(copy,pass,key,abort.signal,value=>{if(mounted.current)setProgress(value);});
    if(mounted.current){values.current.input='';setInput('');setNotice({kind:'success',title:"Restored copy",detail:"They recovered. "+result.connections+" connections and "+result.custodies+" groups of protected data. Open your wallet to check current balances."+(result.backendPositions?" Related investments also need your service to retain your data.":'')});onRestored?.(key);}
   }else{
    if(!registry)throw Error('MOBILE_WALLET_RECOVERY_PACKAGE');
    const result=await exportJointWalletRecoveryV4(registry,pass,abort.signal,value=>{if(mounted.current)setProgress(value);});
    if(mounted.current){setOutput(result.serialized);setPartIndex(0);setNotice({kind:'success',title:"Copy created; missing to save",detail:'Incluye '+result.connections+" connections and "+result.custodies+" protected data groups, including "+result.sourceEntries+" your wallet entries. Save the index and the "+(result.files.length-1)+" parts. Keep the password separately."});}
   }
  }catch(error){if(mounted.current)setNotice(failureNotice(error,restore));}
  finally{pass='';copy='';if(controller.current===abort)controller.current=null;if(mounted.current)setBusy(false);onBusyChange?.(false);}
 }
 function restore(){
  if(blocked||controller.current)return;const copy=values.current.input;let key:string;
  try{key=copyPublicKey(copy);}catch{setNotice({kind:'warning',title:"This copy is not recognized",detail:"Open your backup file and paste all of its contents, without changing it."});return;}
  if(expectedPublicKey&&key!==expectedPublicKey){setNotice(failureNotice(Error('MOBILE_CUSTODY_BACKUP_BINDING'),true));return;}
  Alert.alert("Restore your wallet","Wallet copy: "+key.slice(0,14)+'…'+key.slice(-12)+". The password will be checked and your data will be recovered on this mobile. It does not replace another wallet or move funds.",[{text:"Cancel",style:'cancel'},{text:"Restore this wallet",onPress:()=>void work(true,copy)}]);
 }
 async function share(){
  if(!mounted.current||controller.current||sharingRef.current||!output||AppState.currentState!=='active')return;sharingRef.current=true;setSharing(true);onBusyChange?.(true);let copy=selectedPart;
  try{const result=await Share.share({title:'Lianum · '+partLabel,message:copy},{dialogTitle:"Save copy of Lianum"});if(mounted.current)setNotice(result.action===Share.dismissedAction?{kind:'info',title:"Share Cancelled",detail:"It has not been confirmed that the copy is saved. You can reshare it or copy all its text."}:{kind:'info',title:"Check that you saved the copy.",detail:"Opening the share menu does not confirm that the file has been saved. It retains the entire content and password separately."});}
  catch{if(mounted.current)setNotice({kind:'warning',title:"Could not share copy",detail:"You can hold down the text, select everything and save it to a file."});}
  finally{copy='';sharingRef.current=false;if(mounted.current)setSharing(false);onBusyChange?.(false);}
 }
 function clearScreen(){if(blocked)return;Alert.alert("Delete from this screen",output?"Make sure you saved the copy before deleting it from here. Your wallet and its funds are not deleted.":"Your wallet and its funds are not deleted.",[{text:"Cancel",style:'cancel'},{text:"Delete from screen",onPress:()=>{clear();setNotice(null);}}]);}
 const step=progress?.stage==='IDENTITY'?"Checking your wallet":progress?.stage==='CONNECTIONS'?"Recovering Your Connections":progress?.stage==='COMPLETE'?"Finishing":"Checking protected data";
 const passwordHelp=password!==''&&password.length<12?"Use at least 12 characters.":mode==='save'&&repeat!==''&&password!==repeat?"The two passwords must match.":mode==='save'&&password.length>=12&&repeat===''?"Repeat the password to create the copy.":null;
 return <WalletScreenLayout title="Backup" subtitle="Save your wallet to get it back if you change or lose your phone.">
  {notice&&<WalletStatus {...notice}/>}
  {registry&&<View style={styles.choices}><WalletChoice label="Save a copy" selected={mode==='save'} disabled={blocked} onPress={()=>changeMode('save')}/><WalletChoice label="Restore a copy" selected={mode==='restore'} disabled={blocked} onPress={()=>changeMode('restore')}/></View>}
  <WalletCard title={mode==='save'?"Back up your wallet":"Recover your wallet"}>
   <Text style={styles.body}>{mode==='save'?"1. Choose a password and write it twice. 2. Create the copy and accept your fingerprint when requested. 3. Save the full content as text file.":"1. Opens the index and all the files in the copy. 2. Paste its contents here: first the index, then each part in order and in a new line. 3. Enter the password and confirm the restore."}</Text>
   <Text style={styles.help}>{mode==='save'?"You will need the file and password to restore the wallet. This password is different from the mobile PIN.":"Keep the app open until it is finished. Android can ask for the fingerprint to recover protected data."}</Text>
  </WalletCard>
  <WalletCard title={mode==='save'?"Password to Protect Copy":"Saved copy password"}>
   <Text style={styles.label}>Password · minimum 12 characters</Text>
   <TextInput accessibilityLabel="Copy Password" secureTextEntry autoComplete="off" autoCapitalize="none" autoCorrect={false} value={password} onChangeText={value=>{values.current.password=value;setPassword(value);}} editable={!blocked} maxLength={1024} placeholder={mode==='save'?"Create a password":"The one you used when saving the copy"} placeholderTextColor={walletColors.muted} style={styles.input}/>
   {mode==='save'&&<><Text style={styles.label}>Repeat password</Text><TextInput accessibilityLabel="Repeat the copy password" secureTextEntry autoComplete="off" autoCapitalize="none" autoCorrect={false} value={repeat} onChangeText={value=>{values.current.repeat=value;setRepeat(value);}} editable={!blocked} maxLength={1024} placeholder="Enter the same password" placeholderTextColor={walletColors.muted} style={styles.input}/></>}
   {passwordHelp&&<Text style={styles.help}>{passwordHelp}</Text>}
   {mode==='save'&&<WalletButton label="Create my backup" disabled={!registry||blocked||password.length<12||password!==repeat} loading={busy} onPress={()=>void work(false)}/>}
  </WalletCard>
  {mode==='restore'&&<WalletCard title="Contents of the copy file"><Text style={styles.body}>Paste the index and all parts, in order and separated by a line break. You can also restore an earlier copy that is a single file.</Text><TextInput accessibilityLabel="Full copy content" value={input} onChangeText={value=>{values.current.input=value;setInput(value);}} editable={!blocked} autoCapitalize="none" autoCorrect={false} multiline maxLength={WALLET_RECOVERY_MAX_BYTES_V1} placeholder="Hold down here and choose Paste" placeholderTextColor={walletColors.muted} style={[styles.input,styles.large]}/><WalletButton label="Review and restore my wallet" disabled={blocked||password.length<12||input.length===0} onPress={restore}/></WalletCard>}
  {busy&&<><WalletStatus kind="info" title={progress?step:"Preparing the copy"} detail={progress&&progress.total>0?progress.completed+" of "+progress.total+". Keep the app open and authenticate with your fingerprint when requested.":"Wait while we close the connections and check your data."}/><WalletButton label="Cancel" tone="secondary" onPress={()=>controller.current?.abort()}/></>}
  {output!==''&&<WalletCard title="Saves the index and all parts"><Text style={styles.body}>Each file belongs to the same copy. Saves the index and then each part; you will need all the files to recover this wallet.</Text><Text style={styles.help}>When leaving the app, the copy of this screen is deleted. The password is not included when sharing it.</Text><Text style={styles.label}>{partLabel}</Text>{outputParts.length>1&&<View style={styles.choices}><WalletButton label="Previous" tone="secondary" disabled={blocked||partIndex===0} onPress={()=>{setPartIndex(i=>i-1);setShowCopy(false);}}/><WalletButton label="Next" tone="secondary" disabled={blocked||partIndex===outputParts.length-1} onPress={()=>{setPartIndex(i=>i+1);setShowCopy(false);}}/></View>}<WalletButton label={"Compartir "+(partIndex===0&&outputParts.length>1?"index":"this part")} disabled={blocked} loading={sharing} onPress={()=>void share()}/><WalletButton label={showCopy?"Hide Copy Text":"View text to copy"} tone="secondary" disabled={blocked} onPress={()=>setShowCopy(value=>!value)}/>{showCopy&&<><Text style={styles.help}>Hold down the text and select everything before copying.</Text><Text selectable style={styles.copy}>{selectedPart}</Text></>}</WalletCard>}
  <WalletCard title="What you can get back"><Text style={styles.body}>The copy includes your wallet keys, saved connections, and the operations and DeFi protected data associated with them. When restoring it, the app re-checks the balances; the file does not confirm how much money there is.</Text><Text style={styles.help}>It also includes previous entries saved in the history of this wallet. Data on related services and investments should also be kept in your services.</Text></WalletCard>
  <WalletButton label="Delete data from this screen" tone="secondary" disabled={blocked} onPress={clearScreen}/>
 </WalletScreenLayout>;
}
const styles=StyleSheet.create({choices:{flexDirection:'row',gap:10,marginBottom:16},body:{fontSize:14,lineHeight:22,color:walletColors.text,marginBottom:12},help:{fontSize:13,lineHeight:20,color:walletColors.muted,marginBottom:12},label:{fontSize:14,fontWeight:'600',color:walletColors.text,marginBottom:8},input:{minHeight:48,borderWidth:1,borderColor:walletColors.border,borderRadius:6,padding:12,color:walletColors.text,marginBottom:12},large:{minHeight:150,textAlignVertical:'top'},copy:{fontSize:12,lineHeight:18,color:walletColors.muted}});
