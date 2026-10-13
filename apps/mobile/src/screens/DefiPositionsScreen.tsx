import {useEffect,useRef,useState} from 'react';
import {AppState,StyleSheet,Text,TextInput,View} from 'react-native';
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
const units=(value:string|null,unit='unidades mínimas de participaciones')=>value===null?'Por consultar':value+' '+unit;
function ownAmount(row:PrivateWalletRowV1){if(row.state!=='LIVE'||row.available===null)return 'Por consultar';if(row.decimals===null)return units(row.available,'unidades mínimas');const digits=row.available.padStart(row.decimals+1,'0'),fraction=row.decimals?digits.slice(-row.decimals).replace(/0+$/,''):'';return digits.slice(0,row.decimals?-row.decimals:undefined)+(fraction?'.'+fraction:'')+' '+row.label;}

export default function DefiPositionsScreen({onObservation,onOpenDefi,onOpenHolding,walletState,connectionRegistry,connectionRequest,active=true,onBusyChange,onTransportClosed,onConnectionRead}:{onObservation?(value:DeviceDefiPositionObservationV1):void;onOpenDefi?():void;onOpenHolding?(route:PrivateWalletRowV1['route']):void;walletState?:PrivateWalletStateActorV1;connectionRegistry?:PublicConnectionRegistryV1;connectionRequest?:PositionsConnectionRequestV1|null;active?:boolean;onBusyChange?(busy:boolean):void;onTransportClosed?():void;onConnectionRead?(requestId:number,ok:boolean):void}={}){
 const [settingsOpen,setSettingsOpen]=useState(false),[detailsOpen,setDetailsOpen]=useState(false),[accountsOpen,setAccountsOpen]=useState(false),[failed,setFailed]=useState(false),[busy,setBusy]=useState(false);
 const [profileText,setProfileText]=useState(''),[saved,setSaved]=useState<readonly PublicWalletConnectionV1[]>([]),[connected,setConnected]=useState(false),[server,setServer]=useState<{origin:string;fingerprint:string}|null>(null);
 const [observation,setObservation]=useState<DeviceDefiPositionObservationV1|null>(null),[readExpiresAt,setReadExpiresAt]=useState<number|null>(null),[holdings,setHoldings]=useState<readonly PrivateWalletRowV1[]>([]);
 const [notice,setNotice]=useState('Consulta los activos de tu dispositivo o una cuenta vinculada. Cada una conserva su custodia.');
 const mounted=useRef(true),activeRef=useRef(active),busyRef=useRef(false),epoch=useRef(0),connection=useRef<Connection|null>(null),closing=useRef<Promise<void>|null>(null),requestSeen=useRef<number|null>(null);
 const acquiring=useRef<{controller:AbortController;promise:Promise<Transport>}|null>(null);
 const callbacks=useRef({onBusyChange,onTransportClosed});activeRef.current=active;callbacks.current={onBusyChange,onTransportClosed};
 function current(ticket:number,selected:Connection){if(!mounted.current||!activeRef.current||AppState.currentState!=='active'||epoch.current!==ticket||connection.current!==selected)throw Error('MOBILE_DEFI_POSITION_CONTEXT_CHANGED');}
 function clearObservation(){if(mounted.current){setObservation(null);setReadExpiresAt(null);}}
 async function closeConnection(){epoch.current++;const selected=connection.current;connection.current=null;const pending=acquiring.current;acquiring.current=null;pending?.controller.abort();selected?.controller.abort();selected?.client.close();clearObservation();if(mounted.current)setConnected(false);const previous=closing.current;
  const openingDrain=pending?.promise.then(transport=>transport.close(),error=>{if(error instanceof Error&&error.message==='MOBILE_PAGED_TLS_CANCELLED')return;throw error;});
  const drain=Promise.all([previous,selected?.transport.close(),openingDrain]).then(()=>undefined);closing.current=drain;
  try{await drain;if(closing.current===drain){closing.current=null;callbacks.current.onTransportClosed?.();}}catch{if(mounted.current){setFailed(true);setNotice('La conexión no pudo cerrarse. Bloquea la sesión antes de abrir otra conexión.');}throw Error('MOBILE_DEFI_POSITION_CLOSE');}
 }
 async function run(work:()=>Promise<void>){if(busyRef.current||!activeRef.current||AppState.currentState!=='active')return;busyRef.current=true;setBusy(true);setFailed(false);callbacks.current.onBusyChange?.(true);
  try{await work();}catch(error){await closeConnection().catch(()=>{});if(mounted.current&&activeRef.current){setFailed(true);setSettingsOpen(true);setNotice(error instanceof Error&&error.message==='MOBILE_AUTHENTICATION_CANCELLED'?'Consulta cancelada. Puedes volver a consultar la misma cuenta.':'No se ha podido consultar esa conexión. Sus importes siguen pendientes de confirmar.');}}
  finally{busyRef.current=false;callbacks.current.onBusyChange?.(false);if(mounted.current)setBusy(false);}
 }
 async function readPositions(selected:Connection,ticket:number){clearObservation();const descriptor=selected.profile.descriptor;walletState?.invalidatePositions(descriptor);const access=await selected.client.challenge();current(ticket,selected);
  const accessSignature=await signDeviceDefiPositionAccessV1(access,descriptor.origin,descriptor.pairingId,selected.controller.signal);current(ticket,selected);
  const review=await selected.client.openReview(access,accessSignature);current(ticket,selected);
  const signature=await signDeviceDefiPositionReadV1(review,descriptor.origin,descriptor.pairingId,selected.controller.signal);current(ticket,selected);
  const next=await selected.client.read(review,signature);current(ticket,selected);
  const heads=next.positions.positions.flatMap(row=>[row.ownership.observed,row.valuation.observed]).filter((head):head is DeviceDefiPositionHeadV1=>head!==null),expiry=Math.min(review.expiresAt,...heads.map(head=>head.observedAt+15000));
  if(expiry<=Date.now())throw Error('MOBILE_DEFI_POSITION_STALE');setObservation(next);setReadExpiresAt(expiry);onObservation?.(next);
  setNotice(next.positions.positions.some(row=>row.ownership.status!=='LIVE')?'Hay posiciones pendientes de consultar; sus importes no están disponibles.':'Cuenta vinculada consultada. Las participaciones siguen bajo custodia de esa cuenta.');
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
 useEffect(()=>{if(!active){void closeConnection().catch(()=>{});return;}let cancelled=false;void(async()=>{if(connectionRegistry){const rows=await connectionRegistry.list();if(!cancelled){setSaved(rows.filter(row=>row.kind==='POSITIONS'));if(!profileText){const selected=await connectionRegistry.selected('POSITIONS');if(selected&&!cancelled)setProfileText(selected.profile);}}}})().catch(()=>{if(!cancelled){setFailed(true);setNotice('La conexión guardada no pudo validarse. Importa de nuevo su perfil público.');}});return()=>{cancelled=true;};},[active,connectionRegistry]);
 useEffect(()=>{if(active&&connectionRequest&&!busyRef.current&&requestSeen.current!==connectionRequest.requestId){const request=connectionRequest;requestSeen.current=request.requestId;setProfileText(request.profile);let ok=false;void run(async()=>{await connect(request.profile,request.select!==false);ok=true;}).finally(()=>onConnectionRead?.(request.requestId,ok));}},[active,connectionRequest,busy]);
 useEffect(()=>{if(readExpiresAt===null)return;const timer=setTimeout(()=>{clearObservation();if(mounted.current)setNotice('La consulta ha caducado. Actualiza esa misma cuenta para conocer sus importes.');},Math.max(0,readExpiresAt-Date.now()));return()=>clearTimeout(timer);},[readExpiresAt]);
 useEffect(()=>{if(!walletState)return;const update=()=>setHoldings(walletState.snapshot().rows.filter(row=>row.custody==='DEVICE'&&row.route.component==='DEVICE_SHARE_NOTE'));update();const timer=setInterval(update,1000);return()=>clearInterval(timer);},[walletState]);
 const now=Date.now(),valid=observation!==null&&readExpiresAt!==null&&now<readExpiresAt;
 const readyCount=valid?observation.positions.positions.filter(row=>row.ownership.status==='LIVE'&&fresh(row.ownership.observed,now)&&row.ownership.balances!==null).length:0;
 return <WalletScreenLayout title="Mis inversiones" subtitle="Activos en tu wallet y participaciones de cuentas vinculadas.">
  <WalletStatus kind={failed?'error':valid?'success':'info'} title={busy?'Actualizando tus inversiones':failed?'Consulta pendiente':valid?'Consulta actualizada':'Actualiza para ver tus inversiones'} detail={notice}/>
  <WalletCard title="Cuenta vinculada" subtitle={connected?'Esta consulta conserva la misma cuenta y sus activos.':profileText?'Tu conexión guardada está lista para consultar.':'Conecta la cuenta de inversión que te entrega el ordenador.'}>
   <WalletButton label={connected?'Actualizar inversiones':profileText?'Consultar cuenta guardada':'Conectar cuenta de inversión'} loading={busy} onPress={()=>void run(connected?refresh:profileText?()=>connect():importConnection)}/>
   {connected&&server&&<Text selectable style={styles.muted}>{server.origin}</Text>}
   {valid&&<Text style={styles.muted}>{readyCount} de {observation.positions.positions.length} posiciones consultadas. Actualiza cuando la lectura caduque.</Text>}
   <WalletButton compact label={accountsOpen?'Ocultar cuentas':'Cambiar cuenta o conexión'} tone="secondary" disabled={busy} onPress={()=>setAccountsOpen(value=>!value)}/>
   {accountsOpen&&<>
    {saved.map((row,index)=><View key={row.id}><WalletButton compact label={'Consultar cuenta '+(index+1)} tone="secondary" disabled={busy} onPress={()=>void run(()=>connect(row.profile))}/><Text selectable style={styles.accountOrigin}>{row.origin}</Text></View>)}
    <WalletButton compact label="Importar conexión de posiciones" tone="secondary" disabled={busy} onPress={()=>void run(importConnection)}/>
   </>}
  </WalletCard>
  {valid&&observation.positions.positions.map((row,index)=>{const live=row.ownership.status==='LIVE'&&fresh(row.ownership.observed,now)&&row.ownership.balances!==null,valued=live&&row.valuation.status==='LIVE'&&fresh(row.valuation.observed,now),balance=live?row.ownership.balances:null;return <WalletCard key={row.shareAssetId} title={'Inversión '+(index+1)} subtitle={live?'Participaciones en la cuenta vinculada':'Pendiente de comprobar'}>
   <Text style={styles.label}>Disponible en esta cuenta</Text><Text selectable style={styles.balance}>{units(balance?.available??null)}</Text>
   {live&&row.ownership.pendingRequests&&row.ownership.pendingRequests.length>0&&<WalletStatus kind="warning" title="Operación pendiente" detail="Actualiza el mismo trabajo antes de preparar otra operación."/>}
   <Text style={styles.muted}>Estas participaciones permanecen en la cuenta vinculada. Su consulta no las mueve a tu wallet.</Text>
   {detailsOpen&&<>
    <Fields values={{Reservadas:units(balance?.reserved??null),Bloqueadas:units(balance?.locked??null),'En recuperación':units(balance?.recovery??null),'Estimación del activo de origen':units(valued?row.valuation.estimatedRedeemableUnderlying:null,'unidades mínimas del activo de origen')}}/>
    <Text style={styles.muted}>El servicio expresa unidades mínimas. Las categorías son independientes; la estimación no es saldo disponible ni confirma liquidez de retirada.</Text>
    <Fields values={{Custodia:'Cuenta original del servicio',Vault:'0x'+row.vault,'Activo de origen':'0x'+row.underlyingToken,'Identidad de participaciones':row.shareAssetId,'Bloque consultado':live&&row.ownership.observed?row.ownership.observed.blockNumber:'Por consultar'}}/>
   </>}
  </WalletCard>;})}
  <WalletCard title="En mi wallet" subtitle="Estos activos recibidos están bajo la custodia de tu dispositivo.">
   {holdings.length===0&&<Text style={styles.muted}>Cuando consultes un activo recibido aparecerá aquí. Puedes abrirlo desde su operación DeFi.</Text>}
   {holdings.map(row=><View key={row.key} style={styles.holding}><Text style={styles.label}>{row.label}</Text><Text selectable style={styles.balance}>{ownAmount(row)}</Text><Text style={styles.muted}>{row.state==='LIVE'?'Disponible en esta wallet.':'Actualiza este activo para comprobar su saldo.'}</Text>{onOpenHolding&&<WalletButton compact label="Ver este activo" tone="secondary" disabled={busy} onPress={()=>onOpenHolding(row.route)}/>}</View>)}
   {onOpenDefi&&<WalletButton label="Intercambiar o invertir" tone="secondary" disabled={busy} onPress={onOpenDefi}/>}
  </WalletCard>
  <WalletButton compact label={detailsOpen?'Ocultar detalles':'Detalles de posiciones y custodia'} tone="secondary" disabled={busy} onPress={()=>setDetailsOpen(value=>!value)}/>
  <WalletButton compact label={settingsOpen?'Ocultar conexión avanzada':'Conexión avanzada'} tone="secondary" disabled={busy} onPress={()=>setSettingsOpen(value=>!value)}/>
  {settingsOpen&&<WalletCard title="Perfil de esta cuenta" subtitle="Usa el perfil público de posiciones exportado por el servicio.">
   <TextInput accessibilityLabel="Perfil público de posiciones" value={profileText} onChangeText={setProfileText} editable={!busy} multiline autoCapitalize="none" autoCorrect={false} style={styles.input}/><WalletButton label="Conectar perfil pegado" disabled={busy||profileText===''} onPress={()=>void run(()=>connect())}/>{server&&<Fields values={{Servidor:server.origin,'Huella TLS':server.fingerprint.match(/.{4}/g)!.join(' ')}}/>}
  </WalletCard>}
 </WalletScreenLayout>;

}
const styles=StyleSheet.create({muted:{color:walletColors.muted,fontSize:14,lineHeight:22,marginVertical:8},label:{color:walletColors.muted,fontSize:13,marginTop:8},value:{color:walletColors.text,fontSize:16,lineHeight:24,marginBottom:5},balance:{color:walletColors.text,fontSize:23,fontWeight:'700',lineHeight:31,marginVertical:6},accountOrigin:{color:walletColors.muted,fontSize:12,lineHeight:18,marginBottom:10},holding:{paddingVertical:10,borderBottomWidth:1,borderBottomColor:walletColors.border},input:{backgroundColor:walletColors.surface,color:walletColors.text,borderWidth:1,borderColor:walletColors.border,borderRadius:12,padding:12,minHeight:120,marginBottom:12}});
