import {type ComponentType,useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {AppState,Linking,Platform,Pressable,SafeAreaView,StatusBar,StyleSheet,Text,View} from 'react-native';
import type {ViewProps} from 'react-native';
import DevicePagedNoteScreen from './src/screens/DevicePagedNoteScreen';
import DevicePagedGraphScreen from './src/screens/DevicePagedGraphScreen';
import DevicePagedAgentScreen from './src/screens/DevicePagedAgentScreen';
import {DEVICE_PAGED_AGENT_PROPOSAL_LINK_MAX_V4} from './src/api/device-paged-agent-public-operation-v4.mjs';
import WalletScreen from './src/screens/WalletScreen';
import {existingDevicePagedCustodyModesV3} from './src/custody/device-paged-note-vault-v3';
import WalletRecoveryScreen from './src/screens/WalletRecoveryScreen';
import OriginalAccountScreen from './src/screens/OriginalAccountScreen';
import LocalCustodyScreen from './src/screens/LocalCustodyScreen';
import DeviceDepositScreen from './src/screens/DeviceDepositScreen';
import DefiPositionsScreen,{type PositionsConnectionRequestV1} from './src/screens/DefiPositionsScreen';
import ExternalTokenNoteScreen,{type ExternalConnectionRequestV1} from './src/screens/ExternalTokenNoteScreen';
import NativeClaimScreen from './src/screens/NativeClaimScreen';
import PrivateWalletStateScreen from './src/screens/PrivateWalletStateScreen';
import NativeWalletScreen from './src/screens/NativeWalletScreen';
import {nativeWalletUiPortV1} from './src/native-wallet/native-wallet-controller';
import {WalletButton,WalletCard,WalletScreenLayout,WalletStatus,walletColors} from './src/components/wallet-ui';
import {createDeviceIdentity,readDevicePublicKey} from './src/custody/key-store';
import {lockWalletSessionV1,openWalletSessionV1,subscribeWalletSessionV1,touchWalletSessionV1,walletSessionStatusV1} from './src/custody/wallet-session-v1';
import {createPrivateWalletStateV1} from './src/state/private-wallet-state-v1.mjs';
import type {PrivateWalletRowV1} from './src/state/private-wallet-state-v1.mjs';
import type {PublicWalletConnectionV1} from './src/state/public-connection-registry-v1.mjs';
import {createNativePublicConnectionRegistryV1} from './src/state/public-connection-store-v1';
import {walletConnectionReadTasksV1,walletConnectionReadBindingV1,runWalletConnectionReadsV1,type WalletConnectionReadTaskV1,type WalletReadCoverageV1} from './src/state/wallet-connection-read-plan-v1.mjs';
import {walletNavigationDuringWorkV1} from './src/state/wallet-navigation-v1.mjs';
import type {DevicePagedOperationActivityV3} from './src/api/device-paged-operation-runner-v3.mjs';
// Preserve native Android system bar and cutout insets.
const RootSafeAreaView:ComponentType<ViewProps>=Platform.OS==='android'
 ? (require('react-native/Libraries/Components/SafeAreaView/RCTSafeAreaViewNativeComponent') as unknown as {default:ComponentType<ViewProps>}).default
 : Platform.OS==='ios'?SafeAreaView:View;
type Screen='native'|'wallet'|'original'|'custody'|'deposit'|'defi'|'external'|'state'|'activity'|'claims'|'paged'|'pagedGraph'|'settings'|'recovery'|'agent';
type Group='paged'|'pagedNote'|'external'|'positions'|'agent'|null;
const groupFor=(screen:Screen):Group=>screen==='state'||screen==='pagedGraph'?'paged':screen==='paged'?'pagedNote':screen==='external'?'external':screen==='defi'?'positions':screen==='agent'?'agent':null;
const advancedScreens=[['paged','Financiación y recuperación'],['claims','Recepciones Bitcoin y Solana'],['wallet','Conexión avanzada'],['original','Cuenta vinculada'],['custody','Copia de custodia'],['deposit','Notas nativas']] as const;

export default function App(){
 const [screen,setScreen]=useState<Screen>('native'),[activeGroup,setActiveGroup]=useState<Group>(null);
 const [session,setSession]=useState(()=>walletSessionStatusV1()),[identity,setIdentity]=useState<string|null>(null),[identityLoaded,setIdentityLoaded]=useState(false);
 const [privateState]=useState(()=>createPrivateWalletStateV1());
 const [unlocking,setUnlocking]=useState(false),[notice,setNotice]=useState(''),[advanced,setAdvanced]=useState(false),[transitioning,setTransitioning]=useState(false);
 const [pagedBusy,setPagedBusy]=useState(false),[externalBusy,setExternalBusy]=useState(false),[positionsBusy,setPositionsBusy]=useState(false),[routing,setRouting]=useState(false);
 const [nativeBusy,setNativeBusy]=useState(false),[agentBusy,setAgentBusy]=useState(false);
 const [agentProposalLink,setAgentProposalLink]=useState<{id:number;url:string}|undefined>();
 const lastAgentNavigation=useRef<number|null>(null);
 const [executionActivity,setExecutionActivity]=useState<DevicePagedOperationActivityV3|null>(null),[graphEntryAction,setGraphEntryAction]=useState<{requestId:number;action:'send'|'deposit'}|undefined>();
 const [externalEntryAction,setExternalEntryAction]=useState<{requestId:number;action:'swap'|'invest'}|undefined>();
 const [recoveryBusy,setRecoveryBusy]=useState(false),[loginRecovery,setLoginRecovery]=useState(false);
 const [rehydrating,setRehydrating]=useState(false),[coverage,setCoverage]=useState<WalletReadCoverageV1|null>(null),[readCycle,setReadCycle]=useState(0);
 const connectionRegistry=useMemo(()=>identity?createNativePublicConnectionRegistryV1(identity):undefined,[identity]);
 const [connections,setConnections]=useState<readonly PublicWalletConnectionV1[]>([]),[externalRequest,setExternalRequest]=useState<ExternalConnectionRequestV1|null>(null),[positionsRequest,setPositionsRequest]=useState<PositionsConnectionRequestV1|null>(null);
 const [pagedRequest,setPagedRequest]=useState<{id:string;profile:string;requestId:number;select?:boolean;existingOnly?:boolean}|null>(null);
 const [pagedNoteRequest,setPagedNoteRequest]=useState<{id:string;profile:string;requestId:number;select?:boolean;existingOnly?:boolean}|null>(null);
 const requestSequence=useRef(0),manualNavigationRevision=useRef(0);
 const [connectionNavigation,setConnectionNavigation]=useState<{target:Screen;sessionRevision:number;navigationRevision:number}|null>(null);
 const transition=useRef<{from:Exclude<Group,null>;target:Screen;group?:Group;resolve?:()=>void}|null>(null),mounted=useRef(true),sessionRevision=useRef(0);
 const activeGroupRef=useRef(activeGroup),readController=useRef<AbortController|null>(null),pendingRead=useRef<{requestId:number;resolve:(ok:boolean)=>void}|null>(null),readSession=useRef<number|null>(null);activeGroupRef.current=activeGroup;
 const activePagedScopes=useRef<Partial<Record<'NOTE'|'GRAPH',{descriptor:any;mode:'NOTE'|'GRAPH'}>>>({}),readingTask=useRef<WalletConnectionReadTaskV1|null>(null),registeredSignature=useRef<string|null>(null);
 const renderedSession=sessionRevision.current;
 useEffect(()=>{
  if(['state','activity'].includes(screen)&&session.active&&!nativeBusy&&!agentBusy&&!recoveryBusy&&readSession.current!==sessionRevision.current&&!readController.current)setReadCycle(value=>value+1);
 },[screen,session.active,nativeBusy,agentBusy,recoveryBusy]);
 useEffect(()=>{
  mounted.current=true;
  readDevicePublicKey().then(value=>{if(mounted.current){setIdentity(value);setIdentityLoaded(true);}}).catch(()=>{if(mounted.current){setIdentityLoaded(true);setNotice('No se ha podido leer la identidad. Abre de nuevo la app para recuperarla.');}});
  const unsubscribe=subscribeWalletSessionV1(value=>{if(mounted.current){setSession(value);if(!value.active){readController.current?.abort();pendingRead.current?.resolve(false);pendingRead.current=null;sessionRevision.current++;privateState.clear();activePagedScopes.current={};readingTask.current=null;registeredSignature.current=null;transition.current=null;setConnectionNavigation(null);setExecutionActivity(null);setGraphEntryAction(undefined);setExternalEntryAction(undefined);setTransitioning(false);setRehydrating(false);setCoverage(null);setPagedBusy(false);setExternalBusy(false);setPositionsBusy(false);setNativeBusy(false);setAgentBusy(false);setRouting(false);}}});
  const subscription=AppState.addEventListener('change',value=>{if(value==='background'){lockWalletSessionV1();privateState.clear();}});
  return()=>{mounted.current=false;unsubscribe();subscription.remove();lockWalletSessionV1();privateState.clear();};
 },[privateState]);
 useEffect(()=>{let cancelled=false;if(!connectionRegistry){setConnections([]);return;}void connectionRegistry.list().then(rows=>{if(!cancelled&&mounted.current){const signature=rows.map(row=>row.id).sort().join(':');if(registeredSignature.current!==null&&registeredSignature.current!==signature){privateState.invalidateRegisteredCoverage();setCoverage(null);}registeredSignature.current=signature;setConnections(rows);}}).catch(()=>{if(!cancelled&&mounted.current){setConnections([]);setNotice('No se han podido validar las conexiones guardadas. Importa de nuevo sus perfiles públicos.');}});return()=>{cancelled=true;};},[connectionRegistry,screen,session.active]);
 const transportClosed=useCallback((group:Exclude<Group,null>)=>{
  const pending=transition.current;
  if(!pending||pending.from!==group||!walletSessionStatusV1().active)return;
  transition.current=null;setScreen(pending.target);const next=pending.group===undefined?groupFor(pending.target):pending.group;activeGroupRef.current=next;setActiveGroup(next);setTransitioning(false);pending.resolve?.();
 },[]);
 const pagedNoteClosed=useCallback(()=>transportClosed('pagedNote'),[transportClosed]);
 const pagedClosed=useCallback(()=>transportClosed('paged'),[transportClosed]);
 const externalClosed=useCallback(()=>transportClosed('external'),[transportClosed]);
 const positionsClosed=useCallback(()=>transportClosed('positions'),[transportClosed]);
 const agentClosed=useCallback(()=>transportClosed('agent'),[transportClosed]);
 const navigate=useCallback((target:Screen)=>{
  const reading=readController.current;
  if(!walletSessionStatusV1().active||recoveryBusy||routing||transition.current&&!reading||!reading&&rehydrating)return;
  if(pagedBusy||externalBusy||positionsBusy||agentBusy||nativeBusy){
   if(target!=='native'&&!walletNavigationDuringWorkV1(target,activeGroupRef.current)){setNotice('Hay una operación en curso. Puedes consultar tu cartera y su actividad mientras termina.');return;}
   // Keep the exact custody owner and SDK alive while changing only the view.
   touchWalletSessionV1();manualNavigationRevision.current++;setConnectionNavigation(null);setNotice('');setScreen(target);return;
  }
  touchWalletSessionV1();manualNavigationRevision.current++;setConnectionNavigation(null);const group=groupFor(target);
  if(reading){
   // Explicit navigation owns the next section. Cancel only the registered
   // read round, then let the original close callback drain its SDK/transport.
   privateState.cancelRegisteredReads();reading.abort();pendingRead.current?.resolve(false);pendingRead.current=null;
   setCoverage(value=>value?{...value,state:'CANCELLED',current:null}:value);setRehydrating(false);
   const previous=transition.current?.from??activeGroupRef.current;
   if(previous!==null){transition.current={from:previous,target};activeGroupRef.current=null;setTransitioning(true);setActiveGroup(null);}
   else{transition.current=null;setTransitioning(false);setScreen(target);activeGroupRef.current=group;setActiveGroup(group);}
   return;
  }
  if(activeGroup!==null&&group!==activeGroup){transition.current={from:activeGroup,target};setTransitioning(true);setActiveGroup(null);}
  else{setScreen(target);setActiveGroup(group);}
 },[activeGroup,pagedBusy,externalBusy,positionsBusy,agentBusy,nativeBusy,rehydrating,recoveryBusy,routing,privateState]);
 useEffect(()=>{let cancelled=false;const receive=(url:string|null)=>{if(cancelled||!url||url.length>DEVICE_PAGED_AGENT_PROPOSAL_LINK_MAX_V4||!url.startsWith('lianum://agent/proposal?'))return;setAgentProposalLink({id:++requestSequence.current,url});};void Linking.getInitialURL().then(receive).catch(()=>{});const listener=Linking.addEventListener('url',event=>receive(event.url));return()=>{cancelled=true;listener.remove();};},[]);
 useEffect(()=>{if(!session.active||!agentProposalLink||lastAgentNavigation.current===agentProposalLink.id||transitioning||routing||recoveryBusy||rehydrating||workBusyForAgent())return;lastAgentNavigation.current=agentProposalLink.id;navigate('agent');},[session.active,agentProposalLink?.id,transitioning,routing,recoveryBusy,rehydrating,pagedBusy,externalBusy,positionsBusy,agentBusy,nativeBusy,navigate]);
 function workBusyForAgent(){return pagedBusy||externalBusy||positionsBusy||agentBusy||nativeBusy;}
 const connectionRead=useCallback((requestId:number,ok:boolean)=>{const pending=pendingRead.current;if(pending?.requestId===requestId){pendingRead.current=null;pending.resolve(ok);}},[]);
 async function readGroup(group:Group,signal:AbortSignal){
  if(signal.aborted||!walletSessionStatusV1().active)throw Error('MOBILE_WALLET_READ_CANCELLED');
  const previous=activeGroupRef.current;if(previous===group)return;if(transition.current)throw Error('MOBILE_WALLET_READ_TRANSITION');
  if(previous===null){activeGroupRef.current=group;setActiveGroup(group);return;}
  await new Promise<void>((resolve,reject)=>{const abort=()=>{if(transition.current?.resolve===done){transition.current.group=null;}reject(Error('MOBILE_WALLET_READ_CANCELLED'));},done=()=>{signal.removeEventListener('abort',abort);resolve();};transition.current={from:previous,target:'state',group,resolve:done};signal.addEventListener('abort',abort,{once:true});activeGroupRef.current=null;setActiveGroup(null);setTransitioning(true);if(signal.aborted)abort();});
 }
 async function readConnection(task:WalletConnectionReadTaskV1,signal:AbortSignal){
  privateState.beginRegisteredRead(task.key);readingTask.current=task;let ok=false;
  try{await readGroup(task.kind==='PAGED'?task.mode==='NOTE'?'pagedNote':'paged':task.kind==='POSITIONS'?'positions':'external',signal);if(signal.aborted)throw Error('MOBILE_WALLET_READ_CANCELLED');const requestId=++requestSequence.current;
   ok=await new Promise<boolean>(resolve=>{let settled=false;const done=(value:boolean)=>{if(settled)return;settled=true;clearTimeout(timer);signal.removeEventListener('abort',abort);if(pendingRead.current?.requestId===requestId)pendingRead.current=null;resolve(value);},abort=()=>done(false),timer=setTimeout(()=>{done(false);if(readController.current?.signal===signal)readController.current.abort();},60000);pendingRead.current={requestId,resolve:done};signal.addEventListener('abort',abort,{once:true});const request={id:task.id,profile:task.profile,requestId,select:false};if(task.kind==='PAGED'){if(task.mode==='NOTE')setPagedNoteRequest({...request,existingOnly:true});else setPagedRequest({...request,existingOnly:true});}else if(task.kind==='POSITIONS')setPositionsRequest(request);else setExternalRequest({...request,...(task.route?{route:task.route}:{})});if(signal.aborted)abort();});
  }catch{ok=false;}finally{if(readingTask.current===task)readingTask.current=null;}
  if(signal.aborted)return false;return privateState.finishRegisteredRead(task.key,ok);
 }
 async function acceptPagedObservation(value:Parameters<typeof privateState.acceptPaged>[0]){
  if(renderedSession!==sessionRevision.current||!walletSessionStatusV1().active||readController.current?.signal.aborted)return;
  await privateState.acceptPaged(value);if(renderedSession!==sessionRevision.current||!walletSessionStatusV1().active)return;
  const mode=value.graphMode?'GRAPH':'NOTE';activePagedScopes.current[mode]={descriptor:value.descriptor,mode};
 }
 function invalidatePagedScope(mode:'NOTE'|'GRAPH'){
  if(renderedSession!==sessionRevision.current||!walletSessionStatusV1().active)return;
  const task=readingTask.current,binding=task?.kind==='PAGED'&&task.mode===mode?walletConnectionReadBindingV1(task):activePagedScopes.current[mode];
  if(binding)privateState.invalidatePaged({descriptor:binding.descriptor,mode});
 }

 useEffect(()=>{
  if(!['state','activity'].includes(screen)||nativeBusy||agentBusy||recoveryBusy||!session.active||!connectionRegistry||readCycle===0)return;
  if(readController.current)return;const controller=new AbortController(),revision=sessionRevision.current,navigationRevision=manualNavigationRevision.current;readController.current=controller;readSession.current=revision;setRehydrating(true);setScreen('state');
  void(async()=>{let keepConnection=false;try{const entries=await connectionRegistry.list();if(controller.signal.aborted)return;setConnections(entries);const modes:Record<string,readonly ('NOTE'|'GRAPH')[]>={};for(const entry of entries)if(entry.kind==='PAGED'){modes[entry.id]=await existingDevicePagedCustodyModesV3(entry.descriptors[0]);if(controller.signal.aborted)return;}const tasks=walletConnectionReadTasksV1(entries,connectionRegistry.devicePublicKey,modes);privateState.setRegisteredReadPlan(tasks);await runWalletConnectionReadsV1({tasks,signal:controller.signal,read:(task)=>readConnection(task,controller.signal),onProgress:value=>{if(mounted.current&&revision===sessionRevision.current&&navigationRevision===manualNavigationRevision.current)setCoverage(value);}});if(!controller.signal.aborted){const selected=await connectionRegistry.selected('PAGED'),currentTask=tasks.find(task=>task.kind==='PAGED'&&task.id===selected?.id&&task.mode==='GRAPH')??tasks.find(task=>task.kind==='PAGED'&&task.id===selected?.id)??tasks[0];if(currentTask)keepConnection=await readConnection(currentTask,controller.signal);privateState.finishRegisteredReads();}}catch{if(mounted.current&&revision===sessionRevision.current)setNotice('No se han podido consultar todas las conexiones. Conserva tus copias y abre la conexión exacta que necesites.');}finally{if(controller.signal.aborted&&revision===sessionRevision.current&&navigationRevision===manualNavigationRevision.current)privateState.cancelRegisteredReads();pendingRead.current?.resolve(false);pendingRead.current=null;if(navigationRevision===manualNavigationRevision.current&&(!keepConnection||controller.signal.aborted)&&walletSessionStatusV1().active){try{await readGroup(null,controller.signal.aborted?new AbortController().signal:controller.signal);}catch{}}if(readController.current===controller)readController.current=null;if(mounted.current&&revision===sessionRevision.current){setRehydrating(false);setReadCycle(0);}}})();
  return()=>{controller.abort();};
 // Internal read-group close callbacks may change the view; they must not
 // tear down their own read round. Explicit navigation cancels it above.
 },[nativeBusy,agentBusy,session.active,connectionRegistry,readCycle,recoveryBusy]);
 function cancelConnectionReads(){privateState.cancelRegisteredReads();if(transition.current)transition.current.group=null;readController.current?.abort();pendingRead.current?.resolve(false);pendingRead.current=null;setActiveGroup(null);activeGroupRef.current=null;setRehydrating(false);}
 async function quiesceForRecovery(){if(pagedBusy||externalBusy||positionsBusy||agentBusy||nativeBusy||readController.current||transition.current)throw Error('MOBILE_WALLET_RECOVERY_BUSY');const controller=new AbortController();await readGroup(null,controller.signal);}
 function recoveryRestored(publicKey:string){setIdentity(publicKey);setIdentityLoaded(true);setLoginRecovery(false);privateState.clear();setCoverage(null);if(walletSessionStatusV1().active){setScreen('state');setReadCycle(value=>value+1);}else setNotice('Misma wallet recuperada. Desbloquéala para consultar sus conexiones originales.');}
 async function openPublicConnection(entry:PublicWalletConnectionV1,route?:PrivateWalletRowV1['route'],reception?:ExternalConnectionRequestV1['reception']){
  if(!connectionRegistry||routing||pagedBusy||externalBusy||positionsBusy||agentBusy||nativeBusy||transition.current||recoveryBusy||!walletSessionStatusV1().active){setNotice('Espera a que termine la operación actual antes de abrir otra custodia.');return;}setRouting(true);const revision=sessionRevision.current,navigationRevision=++manualNavigationRevision.current;
  try{const original=await connectionRegistry.remember(entry.profile);if(!mounted.current||revision!==sessionRevision.current||navigationRevision!==manualNavigationRevision.current||!walletSessionStatusV1().active)return;setNotice('');const requestId=++requestSequence.current;let target:Screen;
   if(original.kind==='EXTERNAL_FLAT'){setExternalEntryAction(undefined);setExternalRequest({id:original.id,profile:original.profile,requestId,route,...(reception?{reception}: {})});target='external';}
   else if(original.kind==='POSITIONS'){setPositionsRequest({id:original.id,profile:original.profile,requestId});target='defi';}
   else if(route?.custodyMode==='NOTE'){setPagedNoteRequest({id:original.id,profile:original.profile,requestId,existingOnly:true});target='paged';}else{setPagedRequest({id:original.id,profile:original.profile,requestId,...(route?{existingOnly:true}:{})});target='pagedGraph';}
   setConnectionNavigation({target,sessionRevision:revision,navigationRevision});
  }catch{if(mounted.current)setNotice('Esta conexión no pudo validarse. Abre su sección e importa de nuevo el perfil público.');}finally{if(mounted.current)setRouting(false);}
 }
 // Remember only public DATA first. Navigate from a fresh render after the
 // routing lock is released; the original close callback still owns TLS drain.
 useEffect(()=>{
  const pending=connectionNavigation;if(!pending)return;
  if(!mounted.current||pending.sessionRevision!==sessionRevision.current||pending.navigationRevision!==manualNavigationRevision.current||!walletSessionStatusV1().active){setConnectionNavigation(null);return;}
  if(recoveryBusy||pagedBusy||externalBusy||positionsBusy||agentBusy||nativeBusy){setConnectionNavigation(null);setNotice('Espera a que termine la operación actual antes de abrir otra custodia.');return;}
  if(routing||transition.current||!readController.current&&rehydrating)return;
  setConnectionNavigation(null);navigate(pending.target);
 },[connectionNavigation,navigate,routing,recoveryBusy,pagedBusy,externalBusy,positionsBusy,nativeBusy,rehydrating,transitioning,session.active]);
 async function openHolding(row:PrivateWalletRowV1){
  if(['DEVICE_PAGED_NOTE','DEVICE_PAGED_GRAPH','DEVICE_PAGED_OUTPUT','DEVICE_PAGED_RESERVATION','DEVICE_NOTE','DEVICE_SHARE_NOTE','DEVICE_GRAPH_NOTE','DEVICE_GRAPH_RESERVATION','POSITION'].includes(String(row.route.component))){
   try{const entry=await connectionRegistry?.forRoute(row.route);if(entry){await openPublicConnection(entry,row.route);return;}}catch{setNotice('Hay más de una conexión o su perfil ha cambiado. Selecciona la cuenta exacta en su sección.');}
   setNotice('No está guardado el perfil original de estos fondos. Importa esa misma conexión antes de gestionarlos.');return;
  }
  navigate(['DEVICE_PAGED_NOTE','DEVICE_PAGED_GRAPH'].includes(String(row.route.component))?row.route.custodyMode==='GRAPH'?'pagedGraph':'paged':row.route.component==='CUSTODIAL_NATIVE_CLAIM'?'claims':['DEVICE_NATIVE_NOTE','DEVICE_NATIVE_SOURCE'].includes(String(row.route.component))?'deposit':'original');
 }
 async function unlock(){
  if(unlocking||!identityLoaded)return;setUnlocking(true);setRehydrating(true);setActiveGroup(null);activeGroupRef.current=null;setNotice('');
  try{
   if(!identity){const value=await createDeviceIdentity();if(!mounted.current)return;setIdentity(value);}
   await openWalletSessionV1();if(!mounted.current)return;setScreen('native');setRehydrating(false);setActiveGroup(null);activeGroupRef.current=null;
  }catch(error){if(mounted.current){setRehydrating(false);const code=error instanceof Error?error.message:'';setNotice(code==='MOBILE_AUTHENTICATION_CANCELLED'?'Puedes desbloquear la wallet cuando quieras.':code==='MOBILE_KEY_RECOVERY_REQUIRED'?'La identidad necesita recuperación. Conserva tu copia y vuelve a abrir la app.':'No se ha podido abrir la wallet. Vuelve a intentarlo.');}}
  finally{if(mounted.current)setUnlocking(false);}
 }
 function openWalletAction(action:'send'|'deposit'|'swap'|'invest'){
  if(action==='swap'||action==='invest'){if(!pagedBusy&&!externalBusy&&!positionsBusy)setExternalEntryAction({requestId:++requestSequence.current,action});navigate('external');return;}
  if(!pagedBusy&&!externalBusy&&!positionsBusy)setGraphEntryAction({requestId:++requestSequence.current,action});
  navigate('pagedGraph');
 }
 function openAgentSavedOperation(entry?:PublicWalletConnectionV1){
  if(!entry){navigate('settings');return;}if(agentBusy||transitioning||routing||recoveryBusy)return;
  setPagedRequest({id:entry.id,profile:entry.profile,requestId:++requestSequence.current,existingOnly:true});navigate('pagedGraph');
 }
 const workBusy=pagedBusy||externalBusy||positionsBusy||agentBusy||nativeBusy;
 const blocked=workBusy||transitioning||routing||rehydrating||recoveryBusy;
 const navigationBlocked=routing||recoveryBusy||!rehydrating&&transitioning;
 const navScreen:Screen=['defi','external'].includes(screen)?'external':['settings','wallet','original','custody','deposit','claims','paged','recovery','agent'].includes(screen)?'settings':screen;
 return <RootSafeAreaView style={styles.app} onTouchStart={()=>{if(walletSessionStatusV1().active)touchWalletSessionV1();}}><StatusBar barStyle="dark-content"/>
  <View style={styles.header}><View><Text style={styles.brand}>LIANUM</Text><Text style={styles.headerDetail}>{screen==='native'?'Monedas en sus redes':screen==='settings'?'Seguridad y recuperación':screen==='agent'?'Propuestas y pagos autorizados':'Cuentas privadas · demostración local'}</Text></View>{session.active&&<Pressable accessibilityRole="button" accessibilityLabel="Abrir ajustes" accessibilityState={{disabled:navigationBlocked}} disabled={navigationBlocked} onPress={()=>navigate('settings')} style={[styles.settingsButton,screen==='settings'&&styles.selectedTab]}><Text style={styles.settingsLabel}>Ajustes</Text></Pressable>}</View>
  {loginRecovery||!session.active?loginRecovery?<><WalletRecoveryScreen expectedPublicKey={identity} onBusyChange={setRecoveryBusy} onRestored={recoveryRestored}/><WalletButton label="Volver al desbloqueo" disabled={recoveryBusy} onPress={()=>setLoginRecovery(false)}/></>:<WalletScreenLayout title="Bienvenido a Lianum" subtitle="Tu cartera de Ethereum, Bitcoin y Solana; las cuentas privadas de la demo se guardan aparte."><WalletCard title={identity?'Tu wallet está protegida':'Protege este móvil'}><Text style={styles.body}>{identity?'Entra con tu huella. Revisarás cada movimiento antes de autorizarlo.':'Configura la protección con tu huella. Después puedes crear tu cartera de monedas o restaurarla con 12 o 24 palabras.'}</Text><WalletButton label={identity?'Desbloquear con huella':'Configurar protección'} loading={unlocking} disabled={!identityLoaded} onPress={unlock}/><WalletButton label="Recuperar copia de cuentas privadas" tone="secondary" disabled={unlocking} onPress={()=>setLoginRecovery(true)}/></WalletCard>{notice!==''&&<WalletStatus kind="warning" title={notice}/>}</WalletScreenLayout>:<>
   {notice!==''&&<View style={styles.transition}><WalletStatus kind="warning" title={notice}/></View>}
   {transitioning&&<View style={styles.transition}><WalletStatus kind="info" title="Cambiando de sección…"/></View>}
   <View style={[styles.screen,screen!=='native'&&styles.hidden]} accessibilityElementsHidden={screen!=='native'} importantForAccessibility={screen==='native'?'auto':'no-hide-descendants'}><NativeWalletScreen port={nativeWalletUiPortV1} active={screen==='native'&&!pagedBusy&&!externalBusy&&!positionsBusy&&!agentBusy} blocked={pagedBusy||externalBusy||positionsBusy||agentBusy||routing||recoveryBusy||transitioning} onBusyChange={setNativeBusy} onOpenDemo={()=>navigate('state')}/></View>
   <View style={[styles.screen,screen!=='pagedGraph'&&styles.hidden]} accessibilityElementsHidden={screen!=='pagedGraph'} importantForAccessibility={screen==='pagedGraph'?'auto':'no-hide-descendants'}><DevicePagedGraphScreen entryAction={graphEntryAction} onExecutionActivity={value=>{if(renderedSession===sessionRevision.current&&walletSessionStatusV1().active)setExecutionActivity(value);}} connectionRegistry={connectionRegistry} connectionRequest={pagedRequest} onConnectionRead={connectionRead} suspendAutomaticReads={rehydrating} active={activeGroup==='paged'} onBusyChange={value=>{if(renderedSession===sessionRevision.current&&walletSessionStatusV1().active)setPagedBusy(value);}} onTransportClosed={()=>{if(renderedSession===sessionRevision.current)pagedClosed();}} onObservation={acceptPagedObservation} onInvalidate={()=>invalidatePagedScope('GRAPH')} onOpenDefi={()=>navigate('external')} onOpenReceivedToken={(entry,reception)=>openPublicConnection(entry,undefined,reception)} onOpenSettings={()=>navigate('settings')}/></View>
   <View style={[styles.screen,screen!=='agent'&&styles.hidden]} accessibilityElementsHidden={screen!=='agent'} importantForAccessibility={screen==='agent'?'auto':'no-hide-descendants'}><DevicePagedAgentScreen active={activeGroup==='agent'} registry={connectionRegistry} proposalLink={agentProposalLink} onBusyChange={value=>{if(renderedSession===sessionRevision.current&&walletSessionStatusV1().active)setAgentBusy(value);}} onTransportClosed={()=>{if(renderedSession===sessionRevision.current)agentClosed();}} onOpenOperation={openAgentSavedOperation}/></View>
   <View style={[styles.screen,screen!=='external'&&styles.hidden]} accessibilityElementsHidden={screen!=='external'} importantForAccessibility={screen==='external'?'auto':'no-hide-descendants'}>{screen==='external'&&<View style={styles.investmentsRow}><Pressable accessibilityRole="button" accessibilityLabel="Ver mis inversiones" accessibilityState={{disabled:blocked}} disabled={blocked} onPress={()=>navigate('defi')} style={[styles.investmentsLink,blocked&&styles.disabled]}><Text style={styles.investmentsLabel}>Mis inversiones →</Text></Pressable></View>}<ExternalTokenNoteScreen entryAction={externalEntryAction} connectionRegistry={connectionRegistry} connectionRequest={externalRequest} active={activeGroup==='external'} onConnectionRead={connectionRead} onBusyChange={value=>{if(renderedSession===sessionRevision.current&&walletSessionStatusV1().active)setExternalBusy(value);}} onTransportClosed={()=>{if(renderedSession===sessionRevision.current)externalClosed();}} onObservation={value=>{if(renderedSession===sessionRevision.current&&walletSessionStatusV1().active&&!readController.current?.signal.aborted)privateState.acceptExternal(value);}} onGraphObservation={async value=>{if(renderedSession===sessionRevision.current&&walletSessionStatusV1().active&&!readController.current?.signal.aborted)await privateState.acceptExternalGraph(value);}} onSourcePending={privateState.invalidateExternal} onOpenOperations={()=>navigate('pagedGraph')}/></View>
   {(screen==='state'||screen==='activity')&&<PrivateWalletStateScreen view={screen==='activity'?'activity':'portfolio'} actionsDisabled={workBusy||navigationBlocked} operationInProgress={workBusy} activeOperationName={nativeBusy?'Cartera de monedas':activeGroup==='external'?'Cambio o inversión':activeGroup==='positions'?'Consulta de inversiones':activeGroup==='agent'?'Propuesta de agente':'Operación'} onOpenActiveOperation={navigationBlocked?undefined:()=>navigate(nativeBusy?'native':activeGroup==='external'?'external':activeGroup==='positions'?'defi':activeGroup==='agent'?'agent':'pagedGraph')} canOpenCurrentOperation={!navigationBlocked&&(!workBusy||nativeBusy||activeGroup==='paged'||activeGroup==='agent')} activity={workBusy&&activeGroup!=='paged'?null:executionActivity} onAction={openWalletAction} state={privateState} onOpen={navigate} onOpenRow={row=>void openHolding(row)} connections={connections} onOpenConnection={entry=>void openPublicConnection(entry)} coverage={coverage} onRefreshConnections={blocked?undefined:()=>setReadCycle(value=>value+1)} onCancelRefresh={cancelConnectionReads}/>}
   <View style={[styles.screen,screen!=='defi'&&styles.hidden]} accessibilityElementsHidden={screen!=='defi'} importantForAccessibility={screen==='defi'?'auto':'no-hide-descendants'}><DefiPositionsScreen active={activeGroup==='positions'} onConnectionRead={connectionRead} connectionRegistry={connectionRegistry} connectionRequest={positionsRequest} walletState={privateState} onBusyChange={value=>{if(renderedSession===sessionRevision.current&&walletSessionStatusV1().active)setPositionsBusy(value);}} onTransportClosed={()=>{if(renderedSession===sessionRevision.current)positionsClosed();}} onObservation={value=>{if(renderedSession===sessionRevision.current&&walletSessionStatusV1().active&&!readController.current?.signal.aborted)privateState.acceptPositions(value);}} onOpenHolding={route=>{const row=privateState.snapshot().rows.find(value=>JSON.stringify(value.route)===JSON.stringify(route));if(row)void openHolding(row);}} onOpenDefi={()=>navigate('external')}/></View>
   {screen==='settings'&&<WalletScreenLayout title="Ajustes" subtitle="Protege tu wallet y conserva una copia.">{workBusy&&<WalletStatus kind="info" title="Operación en curso" detail="Puedes consultar tu cartera y su actividad. Espera a que termine antes de cambiar de conexión o recuperar una copia."/>}<WalletCard title="Tu agente"><Text style={styles.body}>Recibe una propuesta, revisa sus pagos y autoriza una vez. El agente sólo podrá consultar la operación aprobada.</Text><WalletButton label="Ver propuestas del agente" disabled={blocked} onPress={()=>navigate('agent')}/></WalletCard><WalletCard title="Seguridad"><Text style={styles.body}>Sesión protegida con huella. Se bloquea al dejar la app o tras un periodo de inactividad.</Text><WalletButton label="Bloquear cartera" tone="secondary" disabled={recoveryBusy} onPress={()=>lockWalletSessionV1()}/></WalletCard><WalletCard title="Cartera de monedas"><Text style={styles.body}>Ethereum, Bitcoin y Solana se recuperan con sus propias palabras. Las copias de la demo no contienen esta cartera.</Text><WalletButton label="Ver cartera y palabras de recuperación" tone="secondary" disabled={blocked} onPress={()=>navigate('native')}/></WalletCard><WalletCard title="Copia de cuentas privadas"><Text style={styles.body}>Guarda una copia cifrada de la identidad y las custodias de la demo. Los servicios vinculados necesitan también sus copias originales.</Text><WalletButton label="Guardar o recuperar cuentas privadas" disabled={blocked} onPress={()=>navigate('recovery')}/></WalletCard><WalletButton label={advanced?'Ocultar herramientas avanzadas':'Herramientas avanzadas y recuperación'} tone="secondary" onPress={()=>setAdvanced(value=>!value)}/>{advanced&&<WalletCard title="Conexiones y herramientas"><Text style={styles.body}>La app guarda las conexiones para tus próximas visitas. Abre estas herramientas si necesitas configurar un servicio o recuperar fondos.</Text><WalletButton label="Conexión de pagos" tone="secondary" disabled={blocked} onPress={()=>navigate('pagedGraph')}/><WalletButton label="Conexión DeFi" tone="secondary" disabled={blocked} onPress={()=>navigate('external')}/>{advancedScreens.map(([value,label])=><WalletButton key={value} label={label} tone="secondary" onPress={()=>navigate(value)}/>)}<Text selectable style={styles.identity}>Identidad del dispositivo{'\n'}{identity}</Text></WalletCard>}</WalletScreenLayout>}
   {screen==='recovery'&&<WalletRecoveryScreen registry={connectionRegistry} expectedPublicKey={identity} onQuiesce={quiesceForRecovery} onBusyChange={setRecoveryBusy} onRestored={recoveryRestored}/>}
   <View style={[styles.screen,screen!=='paged'&&styles.hidden]} accessibilityElementsHidden={screen!=='paged'} importantForAccessibility={screen==='paged'?'auto':'no-hide-descendants'}><DevicePagedNoteScreen active={activeGroup==='pagedNote'} connectionRegistry={connectionRegistry} connectionRequest={pagedNoteRequest} onConnectionRead={connectionRead} onBusyChange={value=>{if(renderedSession===sessionRevision.current&&walletSessionStatusV1().active)setPagedBusy(value);}} onTransportClosed={()=>{if(renderedSession===sessionRevision.current)pagedNoteClosed();}} onOpenOperations={()=>navigate('pagedGraph')} onObservation={acceptPagedObservation} onInvalidate={()=>invalidatePagedScope('NOTE')}/></View>
   {screen==='claims'&&<NativeClaimScreen onObservation={privateState.acceptNativeClaims} onDeviceRootObservation={privateState.acceptDeviceRootClaims}/>}
   {screen==='wallet'&&<WalletScreen/>}
   {screen==='original'&&<OriginalAccountScreen onObservation={privateState.acceptAccount}/>}
   {screen==='custody'&&<LocalCustodyScreen/>}
   {screen==='deposit'&&<DeviceDepositScreen onObservation={privateState.acceptNative} onInvalidate={privateState.invalidateNative}/>}
   <View style={styles.navigation}>{([['native','Cartera','◈'],['state','Demo privada','↗'],['external','DeFi demo','⇄'],['activity','Actividad demo','◷']] as const).map(([value,label,symbol])=>{const disabled=navigationBlocked||workBusy&&value!=='native'&&!walletNavigationDuringWorkV1(value,activeGroup);return <Pressable key={value} accessibilityRole="tab" accessibilityLabel={label} accessibilityState={{selected:navScreen===value,disabled}} disabled={disabled} onPress={()=>value==='external'?openWalletAction('swap'):navigate(value)} style={[styles.tab,navScreen===value&&styles.selectedTab,disabled&&styles.disabled]}><Text accessible={false} style={[styles.tabIcon,navScreen===value&&styles.selectedLabel]}>{symbol}</Text><Text style={[styles.tabLabel,navScreen===value&&styles.selectedLabel]}>{label}</Text></Pressable>;})}</View>
  </>}
 </RootSafeAreaView>;
}
const styles=StyleSheet.create({app:{flex:1,backgroundColor:walletColors.background},header:{paddingHorizontal:20,paddingVertical:14,borderBottomWidth:1,borderBottomColor:walletColors.border,backgroundColor:walletColors.surface,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},brand:{color:walletColors.primary,fontSize:19,fontWeight:'800',letterSpacing:1.8},headerDetail:{color:walletColors.muted,fontSize:11,marginTop:4},settingsButton:{minHeight:44,paddingHorizontal:14,alignItems:'center',justifyContent:'center',borderRadius:12},settingsLabel:{color:walletColors.primary,fontSize:13,fontWeight:'600'},tabIcon:{color:walletColors.muted,fontSize:22,lineHeight:26,marginBottom:3},screen:{flex:1},hidden:{display:'none'},body:{fontSize:14,lineHeight:22,color:walletColors.muted,marginBottom:14},identity:{fontSize:12,lineHeight:19,color:walletColors.muted,marginTop:14},navigation:{backgroundColor:walletColors.surface,borderTopWidth:1,borderTopColor:walletColors.border,paddingHorizontal:8,paddingVertical:9,flexDirection:'row',gap:4},tab:{flex:1,minHeight:48,alignItems:'center',justifyContent:'center',borderRadius:12},selectedTab:{backgroundColor:walletColors.primarySoft},tabLabel:{color:walletColors.muted,fontSize:12,fontWeight:'600'},selectedLabel:{color:walletColors.primary},disabled:{opacity:0.55},investmentsRow:{paddingHorizontal:20,alignItems:'flex-end'},investmentsLink:{minHeight:44,justifyContent:'center',paddingHorizontal:8},investmentsLabel:{fontSize:14,color:walletColors.primary,fontWeight:'600'},transition:{paddingHorizontal:20,paddingTop:12}});
