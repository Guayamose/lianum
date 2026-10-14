import {useEffect,useRef,useState} from 'react';
import {Alert,AppState,Share,Text,TextInput,StyleSheet,View} from 'react-native';
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
 if(code==='MOBILE_WALLET_RECOVERY_BUSY')return{kind:'warning',title:'Espera a que termine la operación actual',detail:'Cuando haya terminado la consulta o el movimiento, vuelve a abrir la copia de seguridad.'};
 if(code==='MOBILE_CUSTODY_BACKUP_CANCELLED'||code==='MOBILE_AUTHENTICATION_CANCELLED')return{kind:'info',title:restore?'Restauración cancelada':'Creación de copia cancelada',detail:restore?'Las partes que ya se hayan comprobado y restaurado se conservan. Puedes volver a intentarlo con la misma copia.':'Puedes volver a intentarlo cuando estés listo.'};
 if(code==='MOBILE_CUSTODY_BACKUP_AUTHENTICATION')return{kind:'warning',title:'No se pudo abrir la copia',detail:'Comprueba la contraseña y que hayas pegado todo el contenido del archivo sin modificarlo.'};
 if(code==='MOBILE_CUSTODY_BACKUP_PASSWORD')return{kind:'warning',title:'Revisa la contraseña de la copia',detail:'Debe tener al menos 12 caracteres. Si es muy larga, prueba una más corta.'};
 if(code==='MOBILE_CUSTODY_BACKUP_BINDING'||code==='MOBILE_CUSTODY_BACKUP_CONFLICT')return{kind:'warning',title:'La copia no coincide con esta wallet',detail:'No se sustituirá otra wallet ni sus datos. Usa la copia original de esta cartera.'};
 return{kind:'warning',title:restore?'No se ha completado la restauración':'No se ha creado la copia',detail:restore?'Comprueba el archivo y su contraseña. Las partes ya verificadas se conservan y los datos que no coincidan se rechazan.':'Vuelve a intentarlo con la app abierta y acepta la huella cuando se solicite. Tu wallet sigue conservada en este móvil.'};
}

export default function WalletRecoveryScreen({registry,expectedPublicKey,onQuiesce,onBusyChange,onRestored}:{registry?:PublicConnectionRegistryV1;expectedPublicKey?:string|null;onQuiesce?():Promise<void>;onBusyChange?(busy:boolean):void;onRestored?(publicKey:string):void}){
 const [mode,setMode]=useState<Mode>(registry?'save':'restore'),[password,setPassword]=useState(''),[repeat,setRepeat]=useState(''),[input,setInput]=useState(''),[output,setOutput]=useState(''),[partIndex,setPartIndex]=useState(0),[showCopy,setShowCopy]=useState(false),[busy,setBusy]=useState(false),[sharing,setSharing]=useState(false),[progress,setProgress]=useState<WalletRecoveryProgressV1|null>(null),[notice,setNotice]=useState<Notice|null>(null);
 const controller=useRef<AbortController|null>(null),mounted=useRef(true),sharingRef=useRef(false),values=useRef({password:'',repeat:'',input:''});
 const blocked=busy||sharing;const outputParts=output&&isWalletRecoveryPartsV4(output)?output.split('\n'):[output],selectedPart=outputParts[partIndex]??'',partLabel=partIndex===0&&outputParts.length>1?'Índice de la copia':'Parte '+partIndex+' de '+(outputParts.length-1);
 function clear(){values.current={password:'',repeat:'',input:''};setPassword('');setRepeat('');setInput('');setOutput('');setPartIndex(0);setShowCopy(false);}
 useEffect(()=>{mounted.current=true;const sub=AppState.addEventListener('change',value=>{if(value==='background'){controller.current?.abort();if(!sharingRef.current)clear();}});return()=>{mounted.current=false;controller.current?.abort();values.current={password:'',repeat:'',input:''};sub.remove();};},[]);
 function changeMode(next:Mode){if(blocked||next===mode)return;const change=()=>{clear();setMode(next);setNotice(null);};if(output)Alert.alert('¿Ya guardaste la copia?','Al cambiar de opción se borrará el texto de esta pantalla. Tu wallet seguirá en este móvil.',[{text:'Volver',style:'cancel'},{text:'Ya la guardé, continuar',onPress:change}]);else change();}
 async function work(restore:boolean,reviewedCopy?:string){
  if(!mounted.current||controller.current||sharingRef.current||AppState.currentState!=='active')return;
  if(restore&&reviewedCopy!==values.current.input){setNotice({kind:'warning',title:'La copia ha cambiado',detail:'Revisa de nuevo la copia antes de restaurarla.'});return;}
  if(values.current.password.length<12||!restore&&values.current.password!==values.current.repeat)return;
  const abort=new AbortController();controller.current=abort;let pass=values.current.password,copy=values.current.input;setBusy(true);onBusyChange?.(true);values.current.password='';values.current.repeat='';setPassword('');setRepeat('');setOutput('');setShowCopy(false);setNotice(null);setProgress(null);
  try{
   await onQuiesce?.();if(abort.signal.aborted)throw Error('MOBILE_CUSTODY_BACKUP_CANCELLED');
   if(restore){
    const key=copyPublicKey(copy);if(expectedPublicKey&&key!==expectedPublicKey)throw Error('MOBILE_CUSTODY_BACKUP_BINDING');
    const result=await restoreJointWalletRecoveryV1(copy,pass,key,abort.signal,value=>{if(mounted.current)setProgress(value);});
    if(mounted.current){values.current.input='';setInput('');setNotice({kind:'success',title:'Copia restaurada',detail:'Se recuperaron '+result.connections+' conexiones y '+result.custodies+' grupos de datos protegidos. Abre tu cartera para consultar los saldos actuales.'+(result.backendPositions?' Las inversiones vinculadas también necesitan que su servicio conserve sus datos.':'')});onRestored?.(key);}
   }else{
    if(!registry)throw Error('MOBILE_WALLET_RECOVERY_PACKAGE');
    const result=await exportJointWalletRecoveryV4(registry,pass,abort.signal,value=>{if(mounted.current)setProgress(value);});
    if(mounted.current){setOutput(result.serialized);setPartIndex(0);setNotice({kind:'success',title:'Copia creada; falta guardarla',detail:'Incluye '+result.connections+' conexiones y '+result.custodies+' grupos de datos protegidos, incluidas '+result.sourceEntries+' entradas de tu wallet. Guarda el índice y las '+(result.files.length-1)+' partes. Conserva la contraseña por separado.'});}
   }
  }catch(error){if(mounted.current)setNotice(failureNotice(error,restore));}
  finally{pass='';copy='';if(controller.current===abort)controller.current=null;if(mounted.current)setBusy(false);onBusyChange?.(false);}
 }
 function restore(){
  if(blocked||controller.current)return;const copy=values.current.input;let key:string;
  try{key=copyPublicKey(copy);}catch{setNotice({kind:'warning',title:'No se reconoce esta copia',detail:'Abre el archivo de tu copia de seguridad y pega todo su contenido, sin cambiarlo.'});return;}
  if(expectedPublicKey&&key!==expectedPublicKey){setNotice(failureNotice(Error('MOBILE_CUSTODY_BACKUP_BINDING'),true));return;}
  Alert.alert('Restaurar tu wallet','Wallet de la copia: '+key.slice(0,14)+'…'+key.slice(-12)+'. Se comprobará la contraseña y se recuperarán sus datos en este móvil. No sustituye otra wallet ni mueve fondos.',[{text:'Cancelar',style:'cancel'},{text:'Restaurar esta wallet',onPress:()=>void work(true,copy)}]);
 }
 async function share(){
  if(!mounted.current||controller.current||sharingRef.current||!output||AppState.currentState!=='active')return;sharingRef.current=true;setSharing(true);onBusyChange?.(true);let copy=selectedPart;
  try{const result=await Share.share({title:'Lianum · '+partLabel,message:copy},{dialogTitle:'Guardar copia de Lianum'});if(mounted.current)setNotice(result.action===Share.dismissedAction?{kind:'info',title:'Compartir cancelado',detail:'No se ha confirmado que la copia esté guardada. Puedes volver a compartirla o copiar todo su texto.'}:{kind:'info',title:'Comprueba que guardaste la copia',detail:'Abrir el menú de compartir no confirma que el archivo se haya guardado. Conserva el contenido completo y su contraseña por separado.'});}
  catch{if(mounted.current)setNotice({kind:'warning',title:'No se pudo compartir la copia',detail:'Puedes mantener pulsado el texto, seleccionar todo y guardarlo en un archivo.'});}
  finally{copy='';sharingRef.current=false;if(mounted.current)setSharing(false);onBusyChange?.(false);}
 }
 function clearScreen(){if(blocked)return;Alert.alert('Borrar de esta pantalla',output?'Asegúrate de haber guardado la copia antes de borrarla de aquí. Tu wallet y sus fondos no se eliminan.':'Se borrará lo que has escrito aquí. Tu wallet y sus fondos no se eliminan.',[{text:'Cancelar',style:'cancel'},{text:'Borrar de la pantalla',onPress:()=>{clear();setNotice(null);}}]);}
 const step=progress?.stage==='IDENTITY'?'Comprobando tu wallet':progress?.stage==='CONNECTIONS'?'Recuperando tus conexiones':progress?.stage==='COMPLETE'?'Terminando':'Comprobando los datos protegidos';
 const passwordHelp=password!==''&&password.length<12?'Usa al menos 12 caracteres.':mode==='save'&&repeat!==''&&password!==repeat?'Las dos contraseñas deben coincidir.':mode==='save'&&password.length>=12&&repeat===''?'Repite la contraseña para crear la copia.':null;
 return <WalletScreenLayout title="Copia de seguridad" subtitle="Guarda tu wallet para recuperarla si cambias o pierdes el móvil.">
  {notice&&<WalletStatus {...notice}/>}
  {registry&&<View style={styles.choices}><WalletChoice label="Guardar una copia" selected={mode==='save'} disabled={blocked} onPress={()=>changeMode('save')}/><WalletChoice label="Restaurar una copia" selected={mode==='restore'} disabled={blocked} onPress={()=>changeMode('restore')}/></View>}
  <WalletCard title={mode==='save'?'Guardar tu wallet':'Recuperar tu wallet'}>
   <Text style={styles.body}>{mode==='save'?'1. Elige una contraseña y escríbela dos veces.\n2. Crea la copia y acepta la huella si se solicita.\n3. Guarda el contenido completo como archivo de texto.':'1. Abre el índice y todos los archivos de la copia.\n2. Pega sus contenidos aquí: primero el índice, después cada parte en orden y en una nueva línea.\n3. Escribe la contraseña y confirma la restauración.'}</Text>
   <Text style={styles.help}>{mode==='save'?'Necesitarás el archivo y su contraseña para restaurar la wallet. Esta contraseña es distinta del PIN del móvil.':'Mantén la app abierta hasta que termine. Android puede pedir la huella para recuperar datos protegidos.'}</Text>
  </WalletCard>
  <WalletCard title={mode==='save'?'Contraseña para proteger la copia':'Contraseña de la copia guardada'}>
   <Text style={styles.label}>Contraseña · mínimo 12 caracteres</Text>
   <TextInput accessibilityLabel="Contraseña de la copia" secureTextEntry autoComplete="off" autoCapitalize="none" autoCorrect={false} value={password} onChangeText={value=>{values.current.password=value;setPassword(value);}} editable={!blocked} maxLength={1024} placeholder={mode==='save'?'Crea una contraseña':'La que usaste al guardar la copia'} placeholderTextColor={walletColors.muted} style={styles.input}/>
   {mode==='save'&&<><Text style={styles.label}>Repite la contraseña</Text><TextInput accessibilityLabel="Repite la contraseña de la copia" secureTextEntry autoComplete="off" autoCapitalize="none" autoCorrect={false} value={repeat} onChangeText={value=>{values.current.repeat=value;setRepeat(value);}} editable={!blocked} maxLength={1024} placeholder="Escribe la misma contraseña" placeholderTextColor={walletColors.muted} style={styles.input}/></>}
   {passwordHelp&&<Text style={styles.help}>{passwordHelp}</Text>}
   {mode==='save'&&<WalletButton label="Crear mi copia de seguridad" disabled={!registry||blocked||password.length<12||password!==repeat} loading={busy} onPress={()=>void work(false)}/>}
  </WalletCard>
  {mode==='restore'&&<WalletCard title="Contenido del archivo de la copia"><Text style={styles.body}>Pega el índice y todas las partes, en orden y separadas por un salto de línea. También puedes restaurar una copia anterior que sea un único archivo.</Text><TextInput accessibilityLabel="Contenido completo de la copia" value={input} onChangeText={value=>{values.current.input=value;setInput(value);}} editable={!blocked} autoCapitalize="none" autoCorrect={false} multiline maxLength={WALLET_RECOVERY_MAX_BYTES_V1} placeholder="Mantén pulsado aquí y elige Pegar" placeholderTextColor={walletColors.muted} style={[styles.input,styles.large]}/><WalletButton label="Revisar y restaurar mi wallet" disabled={blocked||password.length<12||input.length===0} onPress={restore}/></WalletCard>}
  {busy&&<><WalletStatus kind="info" title={progress?step:'Preparando la copia'} detail={progress&&progress.total>0?progress.completed+' de '+progress.total+'. Mantén la app abierta y acepta la huella si se solicita.':'Espera mientras cerramos las conexiones y comprobamos tus datos.'}/><WalletButton label="Cancelar" tone="secondary" onPress={()=>controller.current?.abort()}/></>}
  {output!==''&&<WalletCard title="Guarda el índice y todas las partes"><Text style={styles.body}>Cada archivo pertenece a la misma copia. Guarda el índice y después cada parte; necesitarás todos los archivos para recuperar esta wallet.</Text><Text style={styles.help}>Al dejar la app se borra la copia de esta pantalla. La contraseña no se incluye al compartirla.</Text><Text style={styles.label}>{partLabel}</Text>{outputParts.length>1&&<View style={styles.choices}><WalletButton label="Anterior" tone="secondary" disabled={blocked||partIndex===0} onPress={()=>{setPartIndex(i=>i-1);setShowCopy(false);}}/><WalletButton label="Siguiente" tone="secondary" disabled={blocked||partIndex===outputParts.length-1} onPress={()=>{setPartIndex(i=>i+1);setShowCopy(false);}}/></View>}<WalletButton label={"Compartir "+(partIndex===0&&outputParts.length>1?"índice":"esta parte")} disabled={blocked} loading={sharing} onPress={()=>void share()}/><WalletButton label={showCopy?'Ocultar texto de la copia':'Ver texto para copiar'} tone="secondary" disabled={blocked} onPress={()=>setShowCopy(value=>!value)}/>{showCopy&&<><Text style={styles.help}>Mantén pulsado el texto y selecciona todo antes de copiarlo.</Text><Text selectable style={styles.copy}>{selectedPart}</Text></>}</WalletCard>}
  <WalletCard title="Qué puedes recuperar"><Text style={styles.body}>La copia incluye las claves de tu wallet, las conexiones guardadas y los datos protegidos de operaciones y DeFi asociados a ellas. Al restaurarla, la app vuelve a consultar los saldos; el archivo no confirma cuánto dinero hay.</Text><Text style={styles.help}>Incluye también las entradas anteriores guardadas en el historial de esta wallet. Los datos de los servicios y de las inversiones vinculadas también deben conservarse en sus servicios.</Text></WalletCard>
  <WalletButton label="Borrar datos de esta pantalla" tone="secondary" disabled={blocked} onPress={clearScreen}/>
 </WalletScreenLayout>;
}
const styles=StyleSheet.create({choices:{flexDirection:'row',gap:10,marginBottom:16},body:{fontSize:14,lineHeight:22,color:walletColors.text,marginBottom:12},help:{fontSize:13,lineHeight:20,color:walletColors.muted,marginBottom:12},label:{fontSize:14,fontWeight:'600',color:walletColors.text,marginBottom:8},input:{minHeight:48,borderWidth:1,borderColor:walletColors.border,borderRadius:12,padding:12,color:walletColors.text,marginBottom:12},large:{minHeight:150,textAlignVertical:'top'},copy:{fontSize:12,lineHeight:18,color:walletColors.muted}});
