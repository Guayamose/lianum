import {WalletText as Text,WalletTextInput as TextInput} from '../design/typography';
import {useEffect,useRef,useState} from 'react';
import {AppState,StyleSheet,View} from 'react-native';
import {WalletButton,WalletCard,WalletScreenLayout,WalletStatus,walletColors} from '../components/wallet-ui';
import {readDevicePublicKey,signDeviceDefiPositionAccessV1,signDeviceDefiPositionReadV1} from '../custody/key-store';
import {createDeviceDefiPositionReadApiV1} from '../api/device-defi-position-read-api-v1.mjs';
import {createDeviceDefiPositionsPinnedTransportV1,parseDeviceDefiPositionsConnectionProfileV1,readDeviceDefiPositionsConnectionClipboardV1} from '../api/device-paged-connection-transport-v3';
import type {DeviceDefiPositionsConnectionProfileV1} from '../api/device-paged-connection-transport-v3';
import type {DeviceDefiPositionObservationV1,DeviceDefiPositionHeadV1} from '../../../../packages/mobile-protocol/src/device-defi-position-read-v1.mjs';
import type {PublicConnectionRegistryV1,PublicWalletConnectionV1} from '../state/public-connection-registry-v1.mjs';
import type {PrivateWalletStateActorV1,PrivateWalletRowV1} from '../state/private-wallet-state-v1.mjs';

type Client=ReturnType<typeof createDeviceDefiPositionReadApiV1>;
type Transport=Awaited<ReturnType<typeof createDeviceDefiPositionsPinnedTransportV1>>;
type Connection={client:Client;transport:Transport;controller:AbortController;profile:DeviceDefiPositionsConnectionProfileV1};
export type PositionsConnectionRequestV1={id:string;profile:string;requestId:number;select?:boolean};
function Fields({values}:{values:Record<string,string>}){return <>{Object.entries(values).map(([label,value])=><View key={label}><Text style={styles.label}>{label}</Text><Text selectable style={styles.value}>{value}</Text></View>)}</>;}
const fresh=(head:DeviceDefiPositionHeadV1|null,now:number)=>head!==null&&head.observedAt<=now&&now-head.observedAt<=15000;
const units=(value:string|null,unit="Share base units")=>value===null?"Not checked yet":value+' '+unit;
function ownAmount(row:PrivateWalletRowV1){if(row.state!=='LIVE'||row.available===null)return "Not checked yet";if(row.decimals===null)return units(row.available,"Minimum units");const digits=row.available.padStart(row.decimals+1,'0'),fraction=row.decimals?digits.slice(-row.decimals).replace(/0+$/,''):'';return digits.slice(0,row.decimals?-row.decimals:undefined)+(fraction?'.'+fraction:'')+' '+row.label;}

export default function DefiPositionsScreen({onObservation,onOpenDefi,onOpenHolding,walletState,connectionRegistry,connectionRequest,active=true,onBusyChange,onTransportClosed,onConnectionRead}:{onObservation?(value:DeviceDefiPositionObservationV1):void;onOpenDefi?():void;onOpenHolding?(route:PrivateWalletRowV1['route']):void;walletState?:PrivateWalletStateActorV1;connectionRegistry?:PublicConnectionRegistryV1;connectionRequest?:PositionsConnectionRequestV1|null;active?:boolean;onBusyChange?(busy:boolean):void;onTransportClosed?():void;onConnectionRead?(requestId:number,ok:boolean):void}={}){
 const [settingsOpen,setSettingsOpen]=useState(false),[detailsOpen,setDetailsOpen]=useState(false),[accountsOpen,setAccountsOpen]=useState(false),[failed,setFailed]=useState(false),[busy,setBusy]=useState(false);
 const [profileText,setProfileText]=useState(''),[saved,setSaved]=useState<readonly PublicWalletConnectionV1[]>([]),[connected,setConnected]=useState(false),[server,setServer]=useState<{origin:string;fingerprint:string}|null>(null);
 const [observation,setObservation]=useState<DeviceDefiPositionObservationV1|null>(null),[readExpiresAt,setReadExpiresAt]=useState<number|null>(null),[holdings,setHoldings]=useState<readonly PrivateWalletRowV1[]>([]);
 const [notice,setNotice]=useState("Check the assets of your device or a linked account. Each one retains its custody.");
 const mounted=useRef(true),activeRef=useRef(active),busyRef=useRef(false),epoch=useRef(0),connection=useRef<Connection|null>(null),closing=useRef<Promise<void>|null>(null),requestSeen=useRef<number|null>(null);
 const acquiring=useRef<{controller:AbortController;promise:Promise<Transport>}|null>(null);
 const callbacks=useRef({onBusyChange,onTransportClosed});activeRef.current=active;callbacks.current={onBusyChange,onTransportClosed};
 function current(ticket:number,selected:Connection){if(!mounted.current||!activeRef.current||AppState.currentState!=='active'||epoch.current!==ticket||connection.current!==selected)throw Error('MOBILE_DEFI_POSITION_CONTEXT_CHANGED');}
 function clearObservation(){if(mounted.current){setObservation(null);setReadExpiresAt(null);}}
 async function closeConnection(){epoch.current++;const selected=connection.current;connection.current=null;const pending=acquiring.current;acquiring.current=null;pending?.controller.abort();selected?.controller.abort();selected?.client.close();clearObservation();if(mounted.current)setConnected(false);const previous=closing.current;
  const openingDrain=pending?.promise.then(transport=>transport.close(),error=>{if(error instanceof Error&&error.message==='MOBILE_PAGED_TLS_CANCELLED')return;throw error;});
  const drain=Promise.all([previous,selected?.transport.close(),openingDrain]).then(()=>undefined);closing.current=drain;
  try{await drain;if(closing.current===drain){closing.current=null;callbacks.current.onTransportClosed?.();}}catch{if(mounted.current){setFailed(true);setNotice("The connection could not be closed. Lock the session before opening another connection.");}throw Error('MOBILE_DEFI_POSITION_CLOSE');}
 }
 async function run(work:()=>Promise<void>){if(busyRef.current||!activeRef.current||AppState.currentState!=='active')return;busyRef.current=true;setBusy(true);setFailed(false);callbacks.current.onBusyChange?.(true);
  try{await work();}catch(error){await closeConnection().catch(()=>{});if(mounted.current&&activeRef.current){setFailed(true);setSettingsOpen(true);setNotice(error instanceof Error&&error.message==='MOBILE_AUTHENTICATION_CANCELLED'?"Check cancelled. You can check the same account again.":"This connection could not be consulted and its amounts remain to be confirmed.");}}
  finally{busyRef.current=false;callbacks.current.onBusyChange?.(false);if(mounted.current)setBusy(false);}
 }
 async function readPositions(selected:Connection,ticket:number){clearObservation();const descriptor=selected.profile.descriptor;walletState?.invalidatePositions(descriptor);const access=await selected.client.challenge();current(ticket,selected);
  const accessSignature=await signDeviceDefiPositionAccessV1(access,descriptor.origin,descriptor.pairingId,selected.controller.signal);current(ticket,selected);
  const review=await selected.client.openReview(access,accessSignature);current(ticket,selected);
  const signature=await signDeviceDefiPositionReadV1(review,descriptor.origin,descriptor.pairingId,selected.controller.signal);current(ticket,selected);
  const next=await selected.client.read(review,signature);current(ticket,selected);
  const heads=next.positions.positions.flatMap(row=>[row.ownership.observed,row.valuation.observed]).filter((head):head is DeviceDefiPositionHeadV1=>head!==null),expiry=Math.min(review.expiresAt,...heads.map(head=>head.observedAt+15000));
  if(expiry<=Date.now())throw Error('MOBILE_DEFI_POSITION_STALE');setObservation(next);setReadExpiresAt(expiry);onObservation?.(next);
  setNotice(next.positions.positions.some(row=>row.ownership.status!=='LIVE')?"Positions are pending consultation; their amounts are not available.":"Linked account checked. Shares remain in that account’s custody.");
 }
 async function connect(text=profileText,selectConnection=true){const packet=parseDeviceDefiPositionsConnectionProfileV1(text),key=await readDevicePublicKey();if(!key||key!==packet.descriptor.devicePublicKey)throw Error('MOBILE_KEY_BINDING_CHANGED');await closeConnection();if(!mounted.current||!activeRef.current||AppState.currentState!=='active')return;
  const ticket=epoch.current,controller=new AbortController(),pending={controller,promise:createDeviceDefiPositionsPinnedTransportV1(packet,controller.signal)};acquiring.current=pending;let transport:Transport|null=null;
  try{transport=await pending.promise;if(acquiring.current!==pending||controller.signal.aborted||!mounted.current||!activeRef.current||AppState.currentState!=='active'||epoch.current!==ticket){await transport.close();return;}acquiring.current=null;const client=createDeviceDefiPositionReadApiV1({descriptor:packet.descriptor,fetchImpl:transport.fetchImpl}),selected={client,transport,controller,profile:packet};connection.current=selected;setConnected(true);setServer({origin:packet.descriptor.origin,fingerprint:packet.transport.certificateSHA256});setProfileText(JSON.stringify(packet));await readPositions(selected,ticket);current(ticket,selected);await connectionRegistry?.remember(JSON.stringify(packet),{select:selectConnection});current(ticket,selected);setSettingsOpen(false);if(connectionRegistry)setSaved((await connectionRegistry.list()).filter(row=>row.kind==='POSITIONS'));}
  catch(error){controller.abort();if(connection.current?.controller!==controller)await transport?.close();throw error;}
  finally{if(acquiring.current===pending)acquiring.current=null;}
 }
 async function refresh(){const selected=connection.current;if(!selected)throw Error('MOBILE_DEFI_CONNECTION_REQUIRED');const key=await readDevicePublicKey();if(key!==selected.profile.descriptor.devicePublicKey)throw Error('MOBILE_KEY_BINDING_CHANGED');await readPositions(selected,epoch.current);}
 async function importConnection(){const text=await readDeviceDefiPositionsConnectionClipboardV1();if(!mounted.current||!activeRef.current)return;setProfileText(text);await connect(text);}
 useEffect(()=>{mounted.current=true;const subscription=AppState.addEventListener('change',value=>{if(value==='background')void closeConnection().catch(()=>{});});return()=>{mounted.current=false;subscription.remove();void closeConnection().catch(()=>{});};},[]);
 useEffect(()=>{if(!active){void closeConnection().catch(()=>{});return;}let cancelled=false;void(async()=>{if(connectionRegistry){const rows=await connectionRegistry.list();if(!cancelled){setSaved(rows.filter(row=>row.kind==='POSITIONS'));if(!profileText){const selected=await connectionRegistry.selected('POSITIONS');if(selected&&!cancelled)setProfileText(selected.profile);}}}})().catch(()=>{if(!cancelled){setFailed(true);setNotice("The saved connection could not be validated. Reimport your public profile.");}});return()=>{cancelled=true;};},[active,connectionRegistry]);
 useEffect(()=>{if(active&&connectionRequest&&!busyRef.current&&requestSeen.current!==connectionRequest.requestId){const request=connectionRequest;requestSeen.current=request.requestId;setProfileText(request.profile);let ok=false;void run(async()=>{await connect(request.profile,request.select!==false);ok=true;}).finally(()=>onConnectionRead?.(request.requestId,ok));}},[active,connectionRequest,busy]);
 useEffect(()=>{if(readExpiresAt===null)return;const timer=setTimeout(()=>{clearObservation();if(mounted.current)setNotice("The consultation has expired. Update that same account to find out your amounts.");},Math.max(0,readExpiresAt-Date.now()));return()=>clearTimeout(timer);},[readExpiresAt]);
 useEffect(()=>{if(!walletState)return;const update=()=>setHoldings(walletState.snapshot().rows.filter(row=>row.custody==='DEVICE'&&row.route.component==='DEVICE_SHARE_NOTE'));update();const timer=setInterval(update,1000);return()=>clearInterval(timer);},[walletState]);
 const now=Date.now(),valid=observation!==null&&readExpiresAt!==null&&now<readExpiresAt;
 const readyCount=valid?observation.positions.positions.filter(row=>row.ownership.status==='LIVE'&&fresh(row.ownership.observed,now)&&row.ownership.balances!==null).length:0;
 return <WalletScreenLayout title="My investments" subtitle="Assets in your wallet and shares in linked accounts.">
  <WalletStatus kind={failed?'error':valid?'success':'info'} title={busy?"Updating your investments":failed?"Pending consultation":valid?"Updated consultation":"Update to see your investments"} detail={notice}/>
  <WalletCard title="Linked account" subtitle={connected?"This consultation retains the same account and its assets.":profileText?"Your saved connection is ready for consultation.":"Connect the investment account using the public profile provided by its operator."}>
   <WalletButton label={connected?"Update investments":profileText?"Check Saved Account":"Connect investment account"} loading={busy} onPress={()=>void run(connected?refresh:profileText?()=>connect():importConnection)}/>
   {connected&&server&&<Text selectable style={styles.muted}>{server.origin}</Text>}
   {valid&&<Text style={styles.muted}>{readyCount}  of {observation.positions.positions.length}  Positions consulted. Updates when reading expires.</Text>}
   <WalletButton compact label={accountsOpen?"Hide accounts":"Change account or connection"} tone="secondary" disabled={busy} onPress={()=>setAccountsOpen(value=>!value)}/>
   {accountsOpen&&<>
    {saved.map((row,index)=><View key={row.id}><WalletButton compact label={"Check account "+(index+1)} tone="secondary" disabled={busy} onPress={()=>void run(()=>connect(row.profile))}/><Text selectable style={styles.accountOrigin}>{row.origin}</Text></View>)}
    <WalletButton compact label="Import Position Connection" tone="secondary" disabled={busy} onPress={()=>void run(importConnection)}/>
   </>}
  </WalletCard>
  {valid&&observation.positions.positions.map((row,index)=>{const live=row.ownership.status==='LIVE'&&fresh(row.ownership.observed,now)&&row.ownership.balances!==null,valued=live&&row.valuation.status==='LIVE'&&fresh(row.valuation.observed,now),balance=live?row.ownership.balances:null;return <WalletCard key={row.shareAssetId} title={"Investment "+(index+1)} subtitle={live?"Shares in the related account":"Pending verification"}>
   <Text style={styles.label}>Available in this account</Text><Text selectable style={styles.balance}>{units(balance?.available??null)}</Text>
   {live&&row.ownership.pendingRequests&&row.ownership.pendingRequests.length>0&&<WalletStatus kind="warning" title="Pending operation" detail="Check this same operation before preparing another."/>}
   <Text style={styles.muted}>These shares remain in the linked account. Your query does not move them to your wallet.</Text>
   {detailsOpen&&<>
    <Fields values={{"Reserved":units(balance?.reserved??null),"Locked":units(balance?.locked??null),"In recovery":units(balance?.recovery??null),"Estimated underlying assets":units(valued?row.valuation.estimatedRedeemableUnderlying:null,"Underlying asset base units")}}/>
    <Text style={styles.muted}>The service reports amounts in base units. Each category is separate; the estimate is not an available balance or a guarantee of withdrawal liquidity.</Text>
    <Fields values={{"Custody":"Original service account",Vault:'0x'+row.vault,"Source assets":'0x'+row.underlyingToken,"Share asset identity":row.shareAssetId,"Block consulted":live&&row.ownership.observed?row.ownership.observed.blockNumber:"Not checked yet"}}/>
   </>}
  </WalletCard>;})}
  <WalletCard title="In my wallet" subtitle="These received assets are in the custody of your device.">
   {holdings.length===0&&<Text style={styles.muted}>When you check a received asset it will appear here. You can open it from your DeFi operation.</Text>}
   {holdings.map(row=><View key={row.key} style={styles.holding}><Text style={styles.label}>{row.label}</Text><Text selectable style={styles.balance}>{ownAmount(row)}</Text><Text style={styles.muted}>{row.state==='LIVE'?"Available in this wallet.":"Update this asset to check its balance."}</Text>{onOpenHolding&&<WalletButton compact label="See this asset" tone="secondary" disabled={busy} onPress={()=>onOpenHolding(row.route)}/>}</View>)}
   {onOpenDefi&&<WalletButton label="Exchange or invest" tone="secondary" disabled={busy} onPress={onOpenDefi}/>}
  </WalletCard>
  <WalletButton compact label={detailsOpen?"Hide Details":"Position details and custody"} tone="secondary" disabled={busy} onPress={()=>setDetailsOpen(value=>!value)}/>
  <WalletButton compact label={settingsOpen?"Hide Advanced Connection":"Advanced connection"} tone="secondary" disabled={busy} onPress={()=>setSettingsOpen(value=>!value)}/>
  {settingsOpen&&<WalletCard title="Profile of this account" subtitle="Use the public profile of positions exported by the service.">
   <TextInput accessibilityLabel="Public position profile" value={profileText} onChangeText={setProfileText} editable={!busy} multiline autoCapitalize="none" autoCorrect={false} style={styles.input}/><WalletButton label="Connect pasted profile" disabled={busy||profileText===''} onPress={()=>void run(()=>connect())}/>{server&&<Fields values={{"Server":server.origin,"TLS fingerprint":server.fingerprint.match(/.{4}/g)!.join(' ')}}/>}
  </WalletCard>}
 </WalletScreenLayout>;

}
const styles=StyleSheet.create({muted:{color:walletColors.muted,fontSize:14,lineHeight:22,marginVertical:8},label:{color:walletColors.muted,fontSize:13,marginTop:8},value:{color:walletColors.text,fontSize:16,lineHeight:24,marginBottom:5},balance:{color:walletColors.text,fontSize:23,fontWeight:'700',lineHeight:31,marginVertical:6},accountOrigin:{color:walletColors.muted,fontSize:12,lineHeight:18,marginBottom:10},holding:{paddingVertical:10,borderBottomWidth:1,borderBottomColor:walletColors.border},input:{backgroundColor:walletColors.surface,color:walletColors.text,borderWidth:1,borderColor:walletColors.border,borderRadius:6,padding:12,minHeight:120,marginBottom:12}});
