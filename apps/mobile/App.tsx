import {WalletEnvironmentChoice} from './src/components/WalletEnvironmentChoice';
import type {NativeWalletEnvironmentV2} from './src/native-wallet/native-wallet-ui-port';
import {WalletBottomNavigation} from './src/components/WalletBottomNavigation';
import WalletAgentScreen from './src/screens/WalletAgentScreen';
import {useAgentNotificationRoute} from './src/agent/use-agent-notifications';
import WalletApprovalsScreen from './src/screens/WalletApprovalsScreen';
import type {WalletOverviewData} from './src/components/UnifiedWalletOverview';
import WalletSettingsScreen from './src/screens/WalletSettingsScreen';
import {useFonts} from 'expo-font';
import {LianumBrand} from './src/design/Brand';
import {WalletIcon} from './src/design/Icon';
import {WalletText as Text} from './src/design/typography';
import SepoliaDefiInvestmentScreenV8 from './src/screens/SepoliaDefiInvestmentScreenV8';
import {type ComponentType,useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {AppState,BackHandler,Keyboard,Linking,Platform,Pressable,SafeAreaView,StatusBar,StyleSheet,View} from 'react-native';
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
import {nativeWalletUiPortV1,readNativeWalletEnvironmentV2,selectNativeWalletEnvironmentV2} from './src/native-wallet/native-wallet-controller';
import {WalletButton,WalletCard,WalletScreenLayout,WalletStatus,walletColors} from './src/components/wallet-ui';
import {createDeviceIdentity,readDevicePublicKey} from './src/custody/key-store';
import {lockWalletSessionV1,openWalletSessionV1,subscribeWalletSessionV1,touchWalletSessionV1,walletSessionStatusV1} from './src/custody/wallet-session-v1';
import {createPrivateWalletStateV1} from './src/state/private-wallet-state-v1.mjs';
import type {PrivateWalletRowV1} from './src/state/private-wallet-state-v1.mjs';
import type {PublicWalletConnectionV1} from './src/state/public-connection-registry-v1.mjs';
import {createNativePublicConnectionRegistryV1} from './src/state/public-connection-store-v1';
import {walletConnectionReadTasksV1,walletConnectionReadBindingV1,runWalletConnectionReadsV1,type WalletConnectionReadTaskV1,type WalletReadCoverageV1} from './src/state/wallet-connection-read-plan-v1.mjs';
import {walletNavigationDuringWorkV1,walletNavigationPushV1,walletBackTargetV1,walletBackActionsV1} from './src/state/wallet-navigation-v1.mjs';
import type {DevicePagedOperationActivityV3} from './src/api/device-paged-operation-runner-v3.mjs';
// Preserve native Android system bar and cutout insets.
const RootSafeAreaView:ComponentType<ViewProps>=Platform.OS==='android'
 ? (require('react-native/Libraries/Components/SafeAreaView/RCTSafeAreaViewNativeComponent') as unknown as {default:ComponentType<ViewProps>}).default
 : Platform.OS==='ios'?SafeAreaView:View;
type Screen='operations'|'approvals'|'agentReview'|'privateActivity'|'native'|'wallet'|'original'|'custody'|'deposit'|'defi'|'external'|'state'|'activity'|'claims'|'paged'|'pagedGraph'|'settings'|'recovery'|'agent'|'investment';
type Group='paged'|'pagedNote'|'external'|'positions'|'agent'|'investment'|null;
const groupFor=(screen:Screen):Group=>screen==='state'||screen==='pagedGraph'?'paged':screen==='paged'?'pagedNote':screen==='external'?'external':screen==='defi'?'positions':screen==='agentReview'?'agent':screen==='investment'?'investment':null;
const advancedScreens=[['state',"Accounts and connections"],['privateActivity',"Connection log"],['paged',"Funding and recovery"],['claims',"Receive Bitcoin and Solana"],['wallet',"Advanced connection"],['original',"Linked account"],['custody',"Custody backup"],['deposit',"Native notes"]] as const;

export default function App(){
 const [fontsLoaded,fontError]=useFonts({LianumSans:require('./src/design/assets/fonts/DMSans_400Regular.ttf'),LianumSansMedium:require('./src/design/assets/fonts/DMSans_500Medium.ttf'),LianumSansSemibold:require('./src/design/assets/fonts/DMSans_600SemiBold.ttf'),LianumSansBold:require('./src/design/assets/fonts/DMSans_700Bold.ttf'),LianumSerif:require('./src/design/assets/fonts/InstrumentSerif_400Regular.ttf')});
 const [screen,setScreenState]=useState<Screen>('native'),[activeGroup,setActiveGroup]=useState<Group>(null);
 const navigationHistory=useRef<Screen[]>(['native']);
 const setScreen=useCallback((target:Screen)=>{navigationHistory.current=walletNavigationPushV1(navigationHistory.current,target) as Screen[];setScreenState(target);},[]);
 const [session,setSession]=useState(()=>walletSessionStatusV1()),[identity,setIdentity]=useState<string|null>(null),[identityLoaded,setIdentityLoaded]=useState(false);
 const [privateState]=useState(()=>createPrivateWalletStateV1());
 const [unlocking,setUnlocking]=useState(false),[notice,setNotice]=useState(''),[advanced,setAdvanced]=useState(false),[transitioning,setTransitioning]=useState(false);
 const [pagedBusy,setPagedBusy]=useState(false),[externalBusy,setExternalBusy]=useState(false),[positionsBusy,setPositionsBusy]=useState(false),[routing,setRouting]=useState(false);
 const [nativeBusy,setNativeBusy]=useState(false),[agentBusy,setAgentBusy]=useState(false);
 const [network,setNetwork]=useState<NativeWalletEnvironmentV2>('mainnet'),[networkReady,setNetworkReady]=useState(false),[networkChanging,setNetworkChanging]=useState(false),[nativeReview,setNativeReview]=useState(false);
 const networkChangingRef=useRef(false),networkController=useRef<AbortController|null>(null);
 const [agentNotificationRequest,setAgentNotificationRequest]=useState(0),lastAgentNotification=useRef(0);
 useAgentNotificationRoute(()=>setAgentNotificationRequest(value=>value+1));
 const [agentProposalLink,setAgentProposalLink]=useState<{id:number;url:string}|undefined>();
 const lastAgentNavigation=useRef<number|null>(null);
 const [nativeEntryAction,setNativeEntryAction]=useState<{requestId:number;action:'security'}|undefined>();
 const [overviewData,setOverviewData]=useState<WalletOverviewData>({accounts:[],balances:[],transactions:[],observedAt:null,reading:false});
 const [executionActivity,setExecutionActivity]=useState<DevicePagedOperationActivityV3|null>(null),[graphEntryAction,setGraphEntryAction]=useState<{requestId:number;action:'send'|'deposit'|'swap'}|undefined>();
 const [investmentRequest,setInvestmentRequest]=useState<{profile:string;requestId:number}|null>(null);
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
  if(network==='testnet'&&!networkChanging&&['state','privateActivity'].includes(screen)&&session.active&&!nativeBusy&&!agentBusy&&!recoveryBusy&&readSession.current!==sessionRevision.current&&!readController.current)setReadCycle(value=>value+1);
 },[screen,session.active,nativeBusy,agentBusy,recoveryBusy,network,networkChanging]);
 useEffect(()=>{
  mounted.current=true;
  readDevicePublicKey().then(value=>{if(mounted.current){setIdentity(value);setIdentityLoaded(true);}}).catch(()=>{if(mounted.current){setIdentityLoaded(true);setNotice("Unable to read the identity. Open the app again to recover it.");}});
  const unsubscribe=subscribeWalletSessionV1(value=>{if(mounted.current){setSession(value);if(!value.active){navigationHistory.current=['native'];readController.current?.abort();pendingRead.current?.resolve(false);pendingRead.current=null;sessionRevision.current++;privateState.clear();activePagedScopes.current={};readingTask.current=null;registeredSignature.current=null;transition.current=null;setConnectionNavigation(null);setExecutionActivity(null);setGraphEntryAction(undefined);setExternalEntryAction(undefined);setTransitioning(false);setRehydrating(false);setCoverage(null);setPagedBusy(false);setExternalBusy(false);setPositionsBusy(false);setNativeBusy(false);setNativeReview(false);networkController.current?.abort();setNetworkReady(false);setOverviewData({accounts:[],balances:[],transactions:[],observedAt:null,reading:false});setAgentBusy(false);setRouting(false);}}});
  const subscription=AppState.addEventListener('change',value=>{if(value==='background'){lockWalletSessionV1();privateState.clear();}});
  return()=>{mounted.current=false;unsubscribe();subscription.remove();lockWalletSessionV1();privateState.clear();};
 },[privateState]);
 useEffect(()=>{let cancelled=false;if(!connectionRegistry){setConnections([]);return;}void connectionRegistry.list().then(rows=>{if(!cancelled&&mounted.current){const signature=rows.map(row=>row.id).sort().join(':');if(registeredSignature.current!==null&&registeredSignature.current!==signature){privateState.invalidateRegisteredCoverage();setCoverage(null);}registeredSignature.current=signature;setConnections(rows);}}).catch(()=>{if(!cancelled&&mounted.current){setConnections([]);setNotice("Saved connections could not be validated. Reimport your public profiles.");}});return()=>{cancelled=true;};},[connectionRegistry,screen,session.active]);
 useEffect(()=>{if(!session.active){setNetworkReady(false);return;}const controller=new AbortController();networkController.current=controller;setNetworkReady(false);void readNativeWalletEnvironmentV2(controller.signal).then(value=>{if(!controller.signal.aborted&&walletSessionStatusV1().active){setNetwork(value);setOverviewData({network:value,accounts:[],balances:[],transactions:[],observedAt:null,reading:false});setNetworkReady(true);}}).catch(()=>{if(!controller.signal.aborted)setNotice("Could not read your wallet environment. Lock and unlock the wallet to try again.");});return()=>controller.abort();},[session.active,identity]);
 const transportClosed=useCallback((group:Exclude<Group,null>)=>{
  const pending=transition.current;
  if(!pending||pending.from!==group||!walletSessionStatusV1().active)return;
  transition.current=null;setScreen(pending.target);const next=pending.group===undefined?groupFor(pending.target):pending.group;activeGroupRef.current=next;setActiveGroup(next);setTransitioning(false);pending.resolve?.();
 },[]);
 const pagedNoteClosed=useCallback(()=>transportClosed('pagedNote'),[transportClosed]);
 const pagedClosed=useCallback(()=>transportClosed('paged'),[transportClosed]);
 const externalClosed=useCallback(()=>transportClosed('external'),[transportClosed]);
 const investmentClosed=useCallback(()=>transportClosed('investment'),[transportClosed]);
 const positionsClosed=useCallback(()=>transportClosed('positions'),[transportClosed]);
 const agentClosed=useCallback(()=>transportClosed('agent'),[transportClosed]);
 const navigate=useCallback((target:Screen)=>{
  const reading=readController.current;
  if(!walletSessionStatusV1().active||networkChangingRef.current||recoveryBusy||routing||transition.current&&!reading||!reading&&rehydrating)return;
  if(network!=='testnet'&&['investment','external','defi','pagedGraph','agentReview','paged','state','privateActivity','claims','deposit','original','wallet'].includes(target)){setNotice("This feature is available in Testnet. Use the selector at the top to switch environments.");return;}
  if(reading){
   touchWalletSessionV1();manualNavigationRevision.current++;setConnectionNavigation(null);const group=groupFor(target);
   // Explicit navigation owns the next section. Cancel only the registered
   // read round, then let the original close callback drain its SDK/transport.
   privateState.cancelRegisteredReads();reading.abort();pendingRead.current?.resolve(false);pendingRead.current=null;
   setCoverage(value=>value?{...value,state:'CANCELLED',current:null}:value);setRehydrating(false);
   const previous=transition.current?.from??activeGroupRef.current;
   if(previous!==null){transition.current={from:previous,target};activeGroupRef.current=null;setTransitioning(true);setActiveGroup(null);}
   else{transition.current=null;setTransitioning(false);setScreen(target);activeGroupRef.current=group;setActiveGroup(group);}
   return;
  }
  if(pagedBusy||externalBusy||positionsBusy||agentBusy||nativeBusy){
   if(target!=='native'&&!walletNavigationDuringWorkV1(target,activeGroupRef.current)){setNotice("An operation is in progress. You can view your wallet and activity while it finishes.");return;}
   // Keep the exact custody owner and SDK alive while changing only the view.
   touchWalletSessionV1();manualNavigationRevision.current++;setConnectionNavigation(null);setNotice('');setScreen(target);return;
  }
  touchWalletSessionV1();manualNavigationRevision.current++;setConnectionNavigation(null);const group=groupFor(target);
  if(activeGroup!==null&&group!==activeGroup){transition.current={from:activeGroup,target};setTransitioning(true);setActiveGroup(null);}
  else{setScreen(target);setActiveGroup(group);}
 },[activeGroup,pagedBusy,externalBusy,positionsBusy,agentBusy,nativeBusy,rehydrating,recoveryBusy,routing,privateState,network]);
 useEffect(()=>{
  if(Platform.OS!=='android')return;
  const subscription=BackHandler.addEventListener('hardwareBackPress',()=>{
   if(Keyboard.isVisible()){Keyboard.dismiss();return true;}
   if(loginRecovery){if(!recoveryBusy)setLoginRecovery(false);return true;}
   if(!walletSessionStatusV1().active)return false;
   if(walletBackActionsV1.dispatch()){touchWalletSessionV1();return true;}
   if(recoveryBusy||routing||transition.current||rehydrating&&!readController.current)return true;
   if(screen==='settings'&&advanced){setAdvanced(false);return true;}
   const target=walletBackTargetV1(navigationHistory.current,pagedBusy||externalBusy||positionsBusy||agentBusy||nativeBusy,activeGroupRef.current);
   if(target===null)return false;
   navigate(target as Screen);return true;
  });return()=>subscription.remove();
 },[screen,advanced,loginRecovery,recoveryBusy,routing,rehydrating,pagedBusy,externalBusy,positionsBusy,agentBusy,nativeBusy,navigate,network]);
 useEffect(()=>{let cancelled=false;const receive=(url:string|null)=>{if(cancelled||!url||url.length>DEVICE_PAGED_AGENT_PROPOSAL_LINK_MAX_V4||!url.startsWith('lianum://agent/proposal?'))return;setAgentProposalLink({id:++requestSequence.current,url});};void Linking.getInitialURL().then(receive).catch(()=>{});const listener=Linking.addEventListener('url',event=>receive(event.url));return()=>{cancelled=true;listener.remove();};},[]);
 useEffect(()=>{if(network!=='testnet'||!session.active||!agentProposalLink||lastAgentNavigation.current===agentProposalLink.id||transitioning||routing||recoveryBusy||rehydrating||workBusyForAgent())return;lastAgentNavigation.current=agentProposalLink.id;navigate('agentReview');},[session.active,agentProposalLink?.id,transitioning,routing,recoveryBusy,rehydrating,pagedBusy,externalBusy,positionsBusy,agentBusy,nativeBusy,navigate]);
 useEffect(()=>{if(!session.active||!networkReady||agentNotificationRequest<=lastAgentNotification.current||transitioning||routing||recoveryBusy||rehydrating||workBusyForAgent())return;lastAgentNotification.current=agentNotificationRequest;navigate('agent');},[session.active,networkReady,agentNotificationRequest,transitioning,routing,recoveryBusy,rehydrating,pagedBusy,externalBusy,positionsBusy,agentBusy,nativeBusy,navigate]);
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
  if(network!=='testnet'||networkChanging||!['state','privateActivity'].includes(screen)||nativeBusy||agentBusy||recoveryBusy||!session.active||!connectionRegistry||readCycle===0)return;
  if(readController.current)return;const controller=new AbortController(),revision=sessionRevision.current,navigationRevision=manualNavigationRevision.current;readController.current=controller;readSession.current=revision;setRehydrating(true);setScreen('state');
  void(async()=>{let keepConnection=false;try{const entries=await connectionRegistry.list();if(controller.signal.aborted)return;setConnections(entries);const modes:Record<string,readonly ('NOTE'|'GRAPH')[]>={};for(const entry of entries)if(entry.kind==='PAGED'){modes[entry.id]=await existingDevicePagedCustodyModesV3(entry.descriptors[0]);if(controller.signal.aborted)return;}const tasks=walletConnectionReadTasksV1(entries,connectionRegistry.devicePublicKey,modes);privateState.setRegisteredReadPlan(tasks);await runWalletConnectionReadsV1({tasks,signal:controller.signal,read:(task)=>readConnection(task,controller.signal),onProgress:value=>{if(mounted.current&&revision===sessionRevision.current&&navigationRevision===manualNavigationRevision.current)setCoverage(value);}});if(!controller.signal.aborted){const selected=await connectionRegistry.selected('PAGED'),currentTask=tasks.find(task=>task.kind==='PAGED'&&task.id===selected?.id&&task.mode==='GRAPH')??tasks.find(task=>task.kind==='PAGED'&&task.id===selected?.id)??tasks[0];if(currentTask)keepConnection=await readConnection(currentTask,controller.signal);privateState.finishRegisteredReads();}}catch{if(mounted.current&&revision===sessionRevision.current)setNotice("Not all connections could be consulted. Keep your copies and open the exact connection you need.");}finally{if(controller.signal.aborted&&revision===sessionRevision.current&&navigationRevision===manualNavigationRevision.current)privateState.cancelRegisteredReads();pendingRead.current?.resolve(false);pendingRead.current=null;if(navigationRevision===manualNavigationRevision.current&&(!keepConnection||controller.signal.aborted)&&walletSessionStatusV1().active){try{await readGroup(null,controller.signal.aborted?new AbortController().signal:controller.signal);}catch{}}if(readController.current===controller)readController.current=null;if(mounted.current&&revision===sessionRevision.current){setRehydrating(false);setReadCycle(0);}}})();
  return()=>{controller.abort();};
 // Internal read-group close callbacks may change the view; they must not
 // tear down their own read round. Explicit navigation cancels it above.
 },[nativeBusy,agentBusy,session.active,connectionRegistry,readCycle,recoveryBusy,network,networkChanging]);
 function cancelConnectionReads(){if(readController.current)navigate(screen);}
 async function changeNetwork(target:NativeWalletEnvironmentV2,activate=false){
  if(target===network&&!activate)return;
  if(networkChangingRef.current||!networkReady||pagedBusy||externalBusy||positionsBusy||agentBusy||nativeBusy||nativeReview||recoveryBusy||routing||rehydrating||transition.current)return;
  const controller=new AbortController();networkController.current?.abort();networkController.current=controller;networkChangingRef.current=true;setNetworkChanging(true);Keyboard.dismiss();setNotice('');
  try{
   await readGroup(null,controller.signal);
   await selectNativeWalletEnvironmentV2(target,controller.signal);
   if(controller.signal.aborted||!walletSessionStatusV1().active)return;
   setNetwork(target);setOverviewData({network:target,accounts:[],balances:[],transactions:[],observedAt:null,reading:false});setAdvanced(false);setInvestmentRequest(null);setExternalEntryAction(undefined);setGraphEntryAction(undefined);setNativeEntryAction(undefined);setNativeReview(false);
   navigationHistory.current=['native'];setScreen('native');
  }catch{if(!controller.signal.aborted&&walletSessionStatusV1().active){
   try{const actual=await readNativeWalletEnvironmentV2(controller.signal);if(controller.signal.aborted||!walletSessionStatusV1().active)return;if(actual!==network){setNetwork(actual);setOverviewData({network:actual,accounts:[],balances:[],transactions:[],observedAt:null,reading:false});navigationHistory.current=['native'];setScreen('native');}setNotice("The saved environment has been preserved. Check the selection before continuing.");}
   catch{if(!controller.signal.aborted&&walletSessionStatusV1().active){setNetworkReady(false);setNotice("Could not confirm your saved environment. Lock and unlock the wallet to try again.");}}
  }}
  finally{networkChangingRef.current=false;if(mounted.current)setNetworkChanging(false);}
 }
 async function quiesceForRecovery(){if(pagedBusy||externalBusy||positionsBusy||agentBusy||nativeBusy||readController.current||transition.current)throw Error('MOBILE_WALLET_RECOVERY_BUSY');const controller=new AbortController();await readGroup(null,controller.signal);}
 function recoveryRestored(publicKey:string){setIdentity(publicKey);setIdentityLoaded(true);setLoginRecovery(false);privateState.clear();setCoverage(null);if(walletSessionStatusV1().active){setScreen(network==='testnet'?'state':'native');if(network==='testnet')setReadCycle(value=>value+1);}else setNotice("Same wallet recovered. Unlock it to check its original connections.");}
 async function openPublicConnection(entry:PublicWalletConnectionV1,route?:PrivateWalletRowV1['route'],reception?:ExternalConnectionRequestV1['reception']){
  if(!connectionRegistry||routing||agentBusy||nativeBusy||!readController.current&&(pagedBusy||externalBusy||positionsBusy||transition.current)||recoveryBusy||!walletSessionStatusV1().active){setNotice("Wait until the current operation is over before you open another custody.");return;}setRouting(true);const revision=sessionRevision.current,navigationRevision=++manualNavigationRevision.current;
  try{const original=await connectionRegistry.remember(entry.profile);if(!mounted.current||revision!==sessionRevision.current||navigationRevision!==manualNavigationRevision.current||!walletSessionStatusV1().active)return;setNotice('');const requestId=++requestSequence.current;let target:Screen;
   if(JSON.parse(original.profile).format==='DEVICE_SEPOLIA_DEFI_SHARES_CONNECTION_V7'){setInvestmentRequest({profile:original.profile,requestId});target='investment';}
   else if(original.kind==='EXTERNAL_FLAT'){setExternalEntryAction(undefined);setExternalRequest({id:original.id,profile:original.profile,requestId,route,...(reception?{reception}: {})});target='external';}
   else if(original.kind==='POSITIONS'){setPositionsRequest({id:original.id,profile:original.profile,requestId});target='defi';}
   else if(route?.custodyMode==='NOTE'){setPagedNoteRequest({id:original.id,profile:original.profile,requestId,existingOnly:true});target='paged';}else{setPagedRequest({id:original.id,profile:original.profile,requestId,...(route?{existingOnly:true}:{})});target='pagedGraph';}
   setConnectionNavigation({target,sessionRevision:revision,navigationRevision});
  }catch{if(mounted.current)setNotice("This connection could not be validated. Open its section and import the public profile again.");}finally{if(mounted.current)setRouting(false);}
 }
 // Remember only public DATA first. Navigate from a fresh render after the
 // routing lock is released; the original close callback still owns TLS drain.
 useEffect(()=>{
  const pending=connectionNavigation;if(!pending)return;
  if(!mounted.current||pending.sessionRevision!==sessionRevision.current||pending.navigationRevision!==manualNavigationRevision.current||!walletSessionStatusV1().active){setConnectionNavigation(null);return;}
  if(recoveryBusy||agentBusy||nativeBusy||!readController.current&&(pagedBusy||externalBusy||positionsBusy)){setConnectionNavigation(null);setNotice("Wait until the current operation is over before you open another custody.");return;}
  if(routing||!readController.current&&(transition.current||rehydrating))return;
  setConnectionNavigation(null);navigate(pending.target);
 },[connectionNavigation,navigate,routing,recoveryBusy,pagedBusy,externalBusy,positionsBusy,nativeBusy,rehydrating,transitioning,session.active]);
 async function openHolding(row:PrivateWalletRowV1){
  if(['DEVICE_PAGED_NOTE','DEVICE_PAGED_GRAPH','DEVICE_PAGED_OUTPUT','DEVICE_PAGED_RESERVATION','DEVICE_NOTE','DEVICE_SHARE_NOTE','DEVICE_GRAPH_NOTE','DEVICE_GRAPH_RESERVATION','POSITION'].includes(String(row.route.component))){
   try{const entry=await connectionRegistry?.forRoute(row.route);if(entry){await openPublicConnection(entry,row.route);return;}}catch{setNotice("Multiple connections are available, or the profile has changed. Select the exact account in its section.");}
   setNotice("The original profile for these funds is missing. Import the same connection before managing them.");return;
  }
  navigate(['DEVICE_PAGED_NOTE','DEVICE_PAGED_GRAPH'].includes(String(row.route.component))?row.route.custodyMode==='GRAPH'?'pagedGraph':'paged':row.route.component==='CUSTODIAL_NATIVE_CLAIM'?'claims':['DEVICE_NATIVE_NOTE','DEVICE_NATIVE_SOURCE'].includes(String(row.route.component))?'deposit':'original');
 }
 async function unlock(){
  if(unlocking||!identityLoaded)return;setUnlocking(true);setRehydrating(true);setActiveGroup(null);activeGroupRef.current=null;setNotice('');
  try{
   if(!identity){const value=await createDeviceIdentity();if(!mounted.current)return;setIdentity(value);}
   await openWalletSessionV1();if(!mounted.current)return;navigationHistory.current=['native'];setScreen('native');setRehydrating(false);setActiveGroup(null);activeGroupRef.current=null;
  }catch(error){if(mounted.current){setRehydrating(false);const code=error instanceof Error?error.message:'';setNotice(code==='MOBILE_AUTHENTICATION_CANCELLED'?"You can unlock the wallet anytime.":code==='MOBILE_KEY_RECOVERY_REQUIRED'?"Identity needs recovery. Keep your copy and reopen the app.":"Couldn't open the wallet.");}}
  finally{if(mounted.current)setUnlocking(false);}
 }
 function openWalletAction(action:'send'|'deposit'|'swap'|'invest'){
  if(action==='invest'){setInvestmentRequest(null);navigate('investment');return;}
  if(readController.current||!pagedBusy&&!externalBusy&&!positionsBusy)setGraphEntryAction({requestId:++requestSequence.current,action});
  navigate('pagedGraph');
 }
 function openAgentSavedOperation(entry?:PublicWalletConnectionV1){
  if(!entry){navigate('settings');return;}if(agentBusy||transitioning||routing||recoveryBusy)return;
  setPagedRequest({id:entry.id,profile:entry.profile,requestId:++requestSequence.current,existingOnly:true});navigate('pagedGraph');
 }
 const workBusy=pagedBusy||externalBusy||positionsBusy||agentBusy||nativeBusy||networkChanging;
 const blocked=workBusy||transitioning||routing||rehydrating||recoveryBusy;
 const navigationBlocked=routing||recoveryBusy||networkChanging||!networkReady||!rehydrating&&transitioning;
 const navScreen:Screen=['defi','external','investment','pagedGraph'].includes(screen)?'operations':screen==='agentReview'?'approvals':['state','privateActivity','wallet','original','custody','deposit','claims','paged','recovery'].includes(screen)?'settings':screen;
 if(!fontsLoaded&&!fontError)return <RootSafeAreaView style={[styles.app,{alignItems:'center',justifyContent:'center'}]}><LianumBrand height={48}/><Text style={styles.body}>Preparing your wallet...</Text></RootSafeAreaView>;
 return <RootSafeAreaView style={styles.app} onTouchStart={()=>{if(walletSessionStatusV1().active)touchWalletSessionV1();}}><StatusBar barStyle="dark-content"/>
  {!(session.active&&screen==='agent')&&<View style={styles.header}><View><LianumBrand height={32}/></View>{session.active&&<Pressable accessibilityRole="button" accessibilityLabel="Open Settings" accessibilityState={{disabled:navigationBlocked}} disabled={navigationBlocked} onPress={()=>navigate('settings')} style={[styles.settingsButton,screen==='settings'&&styles.selectedTab]}><WalletIcon name="settings" size={22}/></Pressable>}</View>}
  {loginRecovery||!session.active?loginRecovery?<><WalletRecoveryScreen expectedPublicKey={identity} onBusyChange={setRecoveryBusy} onRestored={recoveryRestored}/><WalletButton label="Back to Unlock" disabled={recoveryBusy} onPress={()=>setLoginRecovery(false)}/></>:<WalletScreenLayout editorial title="Welcome to Lianum" subtitle="Your assets and operations, in one place."><WalletCard title={identity?"Your wallet is protected.":"Protect this mobile"}><Text style={styles.body}>{identity?"You'll check every move before you authorize it.":"Set up the protection with your fingerprint. Then you can create your coin wallet or restore it with 12 or 24 words."}</Text><WalletButton label={identity?"Unlock with fingerprint":"Set up protection"} loading={unlocking} disabled={!identityLoaded} onPress={unlock}/><WalletButton label="Recover copy of private accounts" tone="secondary" disabled={unlocking} onPress={()=>setLoginRecovery(true)}/></WalletCard>{notice!==''&&<WalletStatus kind="warning" title={notice}/>}</WalletScreenLayout>:<>
   <WalletEnvironmentChoice network={network} onChange={target=>void changeNetwork(target)} disabled={!networkReady||blocked||nativeReview} changing={networkChanging}/>
   {notice!==''&&<View style={styles.transition}><WalletStatus kind="warning" title={notice}/></View>}
   {transitioning&&<View style={styles.transition}><WalletStatus kind="info" title="Changing Section..."/></View>}
   <View style={[styles.screen,screen!=='investment'&&styles.hidden]} accessibilityElementsHidden={screen!=='investment'} importantForAccessibility={screen==='investment'?'auto':'no-hide-descendants'}><SepoliaDefiInvestmentScreenV8 request={investmentRequest} active={activeGroup==='investment'} registry={connectionRegistry} onOpenSource={profile=>{void connectionRegistry?.remember(profile,{select:false}).then(entry=>openPublicConnection(entry)).catch(error=>setNotice(`Could not open the operation account: ${String(error?.message??error)}`));}} onBusyChange={value=>{if(renderedSession===sessionRevision.current&&walletSessionStatusV1().active)setExternalBusy(value);}} onTransportClosed={()=>{if(renderedSession===sessionRevision.current)investmentClosed();}}/></View>
   <View style={[styles.screen,!['native','operations','activity'].includes(screen)&&styles.hidden]} accessibilityElementsHidden={!['native','operations','activity'].includes(screen)} importantForAccessibility={['native','operations','activity'].includes(screen)?'auto':'no-hide-descendants'}><NativeWalletScreen privateState={privateState} hasPrivateConnections={network==='testnet'&&connections.length>0} onOpenPrivateActivity={()=>navigate('privateActivity')} key={network} network={network} networkChanging={networkChanging} onActivateNetwork={()=>void changeNetwork(network,true)} onReviewChange={setNativeReview} entryAction={nativeEntryAction} port={nativeWalletUiPortV1} active={networkReady&&!networkChanging&&['native','operations','activity'].includes(screen)} section={screen==='operations'?'operations':screen==='activity'?'activity':'overview'} onSnapshot={setOverviewData} executionActivity={network==='testnet'?executionActivity:null} onOpenPlan={()=>navigate('pagedGraph')} onOpenOperations={()=>navigate('operations')} onOpenActivity={()=>navigate('activity')} blocked={!networkReady||networkChanging||pagedBusy||externalBusy||positionsBusy||agentBusy||routing||recoveryBusy||transitioning} onBusyChange={setNativeBusy} onOpenDemo={()=>navigate('state')} onPrepareOperation={()=>openWalletAction('send')} onOpenAgent={()=>navigate('agent')} backgroundTask={rehydrating?"Updating private accounts":routing?"Opening connection":recoveryBusy?"Recovering a copy":transitioning?"Switching Account":"Operation in progress"} onCancelBackgroundRead={rehydrating?cancelConnectionReads:undefined}/></View>
   <View style={[styles.screen,screen!=='pagedGraph'&&styles.hidden]} accessibilityElementsHidden={screen!=='pagedGraph'} importantForAccessibility={screen==='pagedGraph'?'auto':'no-hide-descendants'}><DevicePagedGraphScreen entryAction={graphEntryAction} onExecutionActivity={value=>{if(renderedSession===sessionRevision.current&&walletSessionStatusV1().active)setExecutionActivity(value);}} connectionRegistry={connectionRegistry} connectionRequest={pagedRequest} onConnectionRead={connectionRead} suspendAutomaticReads={rehydrating} active={activeGroup==='paged'} onBusyChange={value=>{if(renderedSession===sessionRevision.current&&walletSessionStatusV1().active)setPagedBusy(value);}} onTransportClosed={()=>{if(renderedSession===sessionRevision.current)pagedClosed();}} onObservation={acceptPagedObservation} onInvalidate={()=>invalidatePagedScope('GRAPH')} onOpenDefi={()=>openWalletAction('invest')} onOpenReceivedToken={(entry,reception)=>openPublicConnection(entry,undefined,reception)} onOpenSettings={()=>navigate('settings')}/></View>
   <View style={[styles.screen,screen!=='agentReview'&&styles.hidden]} accessibilityElementsHidden={screen!=='agentReview'} importantForAccessibility={screen==='agentReview'?'auto':'no-hide-descendants'}><DevicePagedAgentScreen active={activeGroup==='agent'} registry={connectionRegistry} proposalLink={agentProposalLink} onBusyChange={value=>{if(renderedSession===sessionRevision.current&&walletSessionStatusV1().active)setAgentBusy(value);}} onTransportClosed={()=>{if(renderedSession===sessionRevision.current)agentClosed();}} onOpenOperation={openAgentSavedOperation}/></View>
   <View style={[styles.screen,screen!=='external'&&styles.hidden]} accessibilityElementsHidden={screen!=='external'} importantForAccessibility={screen==='external'?'auto':'no-hide-descendants'}>{screen==='external'&&<View style={styles.investmentsRow}><Pressable accessibilityRole="button" accessibilityLabel="See my investments" accessibilityState={{disabled:blocked}} disabled={blocked} onPress={()=>openWalletAction('invest')} style={[styles.investmentsLink,blocked&&styles.disabled]}><Text style={styles.investmentsLabel}>My investments →</Text></Pressable></View>}<ExternalTokenNoteScreen entryAction={externalEntryAction} connectionRegistry={connectionRegistry} connectionRequest={externalRequest} active={activeGroup==='external'} onConnectionRead={connectionRead} onBusyChange={value=>{if(renderedSession===sessionRevision.current&&walletSessionStatusV1().active)setExternalBusy(value);}} onTransportClosed={()=>{if(renderedSession===sessionRevision.current)externalClosed();}} onObservation={value=>{if(renderedSession===sessionRevision.current&&walletSessionStatusV1().active&&!readController.current?.signal.aborted)privateState.acceptExternal(value);}} onGraphObservation={async value=>{if(renderedSession===sessionRevision.current&&walletSessionStatusV1().active&&!readController.current?.signal.aborted)await privateState.acceptExternalGraph(value);}} onSourcePending={privateState.invalidateExternal} onOpenOperations={()=>navigate('pagedGraph')}/></View>
   {(screen==='state'||screen==='privateActivity')&&<PrivateWalletStateScreen view={screen==='privateActivity'?'activity':'portfolio'} actionsDisabled={nativeBusy||agentBusy||networkChanging||(!rehydrating&&(pagedBusy||externalBusy||positionsBusy))||navigationBlocked} operationInProgress={!rehydrating&&workBusy} activeOperationName={nativeBusy?"Coin wallet":activeGroup==='external'?"Change or investment":activeGroup==='positions'?"Investment consultation":activeGroup==='investment'?"Investment":activeGroup==='agent'?"Proposed agent":"Operation"} onOpenActiveOperation={navigationBlocked?undefined:()=>navigate(nativeBusy?'native':activeGroup==='external'?'external':activeGroup==='positions'?'defi':activeGroup==='investment'?'investment':activeGroup==='agent'?'agentReview':'pagedGraph')} canOpenCurrentOperation={!navigationBlocked&&(!workBusy||nativeBusy||activeGroup==='paged'||activeGroup==='agent'||activeGroup==='investment')} activity={workBusy&&activeGroup!=='paged'?null:executionActivity} onAction={openWalletAction} state={privateState} onOpen={navigate} onOpenRow={row=>void openHolding(row)} connections={connections} onOpenConnection={entry=>void openPublicConnection(entry)} coverage={coverage} onRefreshConnections={blocked?undefined:()=>setReadCycle(value=>value+1)} onCancelRefresh={cancelConnectionReads}/>}
   <View style={[styles.screen,screen!=='defi'&&styles.hidden]} accessibilityElementsHidden={screen!=='defi'} importantForAccessibility={screen==='defi'?'auto':'no-hide-descendants'}><DefiPositionsScreen active={activeGroup==='positions'} onConnectionRead={connectionRead} connectionRegistry={connectionRegistry} connectionRequest={positionsRequest} walletState={privateState} onBusyChange={value=>{if(renderedSession===sessionRevision.current&&walletSessionStatusV1().active)setPositionsBusy(value);}} onTransportClosed={()=>{if(renderedSession===sessionRevision.current)positionsClosed();}} onObservation={value=>{if(renderedSession===sessionRevision.current&&walletSessionStatusV1().active&&!readController.current?.signal.aborted)privateState.acceptPositions(value);}} onOpenHolding={route=>{const row=privateState.snapshot().rows.find(value=>JSON.stringify(value.route)===JSON.stringify(route));if(row)void openHolding(row);}} onOpenDefi={()=>openWalletAction('invest')}/></View>
   <View style={[styles.screen,screen!=='agent'&&styles.hidden]} accessibilityElementsHidden={screen!=='agent'} importantForAccessibility={screen==='agent'?'auto':'no-hide-descendants'}><WalletAgentScreen onProposal={url=>setAgentProposalLink({id:++requestSequence.current,url})} active={screen==='agent'} data={overviewData} onProposals={()=>navigate('approvals')} onNewPlan={()=>openWalletAction('send')} onOpenWallet={()=>navigate('native')} onOpenOperations={()=>navigate('operations')}/></View>
   {screen==='approvals'&&<WalletApprovalsScreen hasProposal={network==='testnet'&&Boolean(agentProposalLink)} onReview={()=>navigate('agentReview')}/>}
   {screen==='settings'&&<WalletSettingsScreen identity={identity} blocked={blocked} recoveryBusy={recoveryBusy} workBusy={workBusy} advanced={advanced} onToggleAdvanced={()=>setAdvanced(value=>!value)} onNavigate={target=>{if(target==='native')setNativeEntryAction({requestId:++requestSequence.current,action:'security'});navigate(target);}} onLock={()=>lockWalletSessionV1()} advancedScreens={advancedScreens}/>}
   {screen==='recovery'&&<WalletRecoveryScreen registry={connectionRegistry} expectedPublicKey={identity} onQuiesce={quiesceForRecovery} onBusyChange={setRecoveryBusy} onRestored={recoveryRestored}/>}
   <View style={[styles.screen,screen!=='paged'&&styles.hidden]} accessibilityElementsHidden={screen!=='paged'} importantForAccessibility={screen==='paged'?'auto':'no-hide-descendants'}><DevicePagedNoteScreen active={activeGroup==='pagedNote'} connectionRegistry={connectionRegistry} connectionRequest={pagedNoteRequest} onConnectionRead={connectionRead} onBusyChange={value=>{if(renderedSession===sessionRevision.current&&walletSessionStatusV1().active)setPagedBusy(value);}} onTransportClosed={()=>{if(renderedSession===sessionRevision.current)pagedNoteClosed();}} onOpenOperations={()=>navigate('pagedGraph')} onObservation={acceptPagedObservation} onInvalidate={()=>invalidatePagedScope('NOTE')}/></View>
   {screen==='claims'&&<NativeClaimScreen onObservation={privateState.acceptNativeClaims} onDeviceRootObservation={privateState.acceptDeviceRootClaims}/>}
   {screen==='wallet'&&<WalletScreen/>}
   {screen==='original'&&<OriginalAccountScreen onObservation={privateState.acceptAccount}/>}
   {screen==='custody'&&<LocalCustodyScreen/>}
   {screen==='deposit'&&<DeviceDepositScreen onObservation={privateState.acceptNative} onInvalidate={privateState.invalidateNative}/>}
   <WalletBottomNavigation selected={navScreen} disabled={navigationBlocked} onSelect={navigate}/>
  </>}
 </RootSafeAreaView>;
}
const styles=StyleSheet.create({app:{flex:1,backgroundColor:walletColors.background},header:{paddingHorizontal:18,paddingVertical:4,borderBottomWidth:StyleSheet.hairlineWidth,borderBottomColor:walletColors.border,backgroundColor:walletColors.background,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},brand:{color:walletColors.primary,fontSize:19,fontWeight:'800',letterSpacing:1.8},headerDetail:{color:walletColors.muted,fontSize:11,marginTop:4},settingsButton:{minHeight:44,paddingHorizontal:14,alignItems:'center',justifyContent:'center',borderRadius:6},settingsLabel:{color:walletColors.primary,fontSize:13,fontWeight:'600'},tabIcon:{color:walletColors.muted,fontSize:22,lineHeight:26,marginBottom:3},screen:{flex:1},hidden:{display:'none'},body:{fontSize:14,lineHeight:22,color:walletColors.muted,marginBottom:14},identity:{fontSize:12,lineHeight:19,color:walletColors.muted,marginTop:14},navigation:{backgroundColor:walletColors.background,borderTopWidth:StyleSheet.hairlineWidth,borderTopColor:walletColors.border,paddingHorizontal:4,paddingVertical:8,flexDirection:'row',gap:4},tab:{flex:1,minHeight:48,alignItems:'center',justifyContent:'center',borderRadius:0,gap:5},selectedTab:{backgroundColor:'transparent'},tabLabel:{color:walletColors.muted,fontSize:9,fontWeight:'500'},selectedLabel:{color:walletColors.accentStrong},disabled:{opacity:0.55},investmentsRow:{paddingHorizontal:20,alignItems:'flex-end'},investmentsLink:{minHeight:44,justifyContent:'center',paddingHorizontal:8},investmentsLabel:{fontSize:14,color:walletColors.primary,fontWeight:'600'},transition:{paddingHorizontal:20,paddingTop:12}});
