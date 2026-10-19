import {WalletText as Text} from '../design/typography';
import {useEffect,useRef,useState} from 'react';
import {AppState} from 'react-native';
import {WalletButton,WalletCard,WalletField,WalletScreenLayout,WalletStatus,walletColors} from '../components/wallet-ui';
import {createDevicePagedConnectionTransportV3,parseDevicePagedConnectionProfileV3,readDevicePagedConnectionClipboardV3} from '../api/device-paged-connection-transport-v3';
import {createDevicePagedOwnerApiV3} from '../api/device-paged-owner-api-v3.mjs';
import {createDevicePagedNoteVaultV3,openExistingDevicePagedCustodyV3,type DevicePagedSummaryV3,type DevicePagedWalletDisplayV3} from '../custody/device-paged-note-vault-v3';
import type {PublicConnectionRegistryV1} from '../state/public-connection-registry-v1.mjs';
import {readDevicePublicKey,signDevicePagedOwnerPermissionV3} from '../custody/key-store';

/** Advanced independent-note observation. New economic movements belong to
 * the reviewed Operaciones flow; this screen never offers an unsigned legacy
 * deposit/withdrawal path or retries a financial effect. */
export default function DevicePagedNoteScreen({onObservation,onInvalidate,onOpenOperations,active=true,onBusyChange,onTransportClosed,onConnectionRead,connectionRegistry,connectionRequest}:{onObservation?:(value:DevicePagedWalletDisplayV3)=>Promise<void>;onInvalidate?:()=>void;onOpenOperations?:()=>void;active?:boolean;onBusyChange?:(busy:boolean)=>void;onTransportClosed?:()=>void;onConnectionRead?:(requestId:number,ok:boolean)=>void;connectionRegistry?:PublicConnectionRegistryV1;connectionRequest?:{id:string;profile:string;requestId:number;select?:boolean;existingOnly?:boolean}|null}){
 const [pairing,setPairing]=useState(''),[summary,setSummary]=useState<DevicePagedSummaryV3|null>(null),[busy,setBusy]=useState(false),[failed,setFailed]=useState(false),[message,setMessage]=useState('Importa el perfil público original para consultar esta custodia independiente.');
 const [showConnectionInput,setShowConnectionInput]=useState(false),[connectionPreview,setConnectionPreview]=useState<{origin:string;fingerprint:string}|null>(null);
 const activeRef=useRef(active),seenRequest=useRef<number|null>(null);activeRef.current=active;
 const busyRef=useRef(false),epoch=useRef(0),current=useRef<any>(null),acquiring=useRef<Promise<any>|null>(null),abort=useRef<AbortController|null>(null);
 function live(token:number){if(epoch.current!==token||abort.current?.signal.aborted)throw Error('MOBILE_PAGED_SCREEN_CLOSED');}
 async function stop(state:any){if(state)await Promise.allSettled([state.api?.close(),state.vault?.close(),state.transport?.close()]);}
 async function close(){setConnectionPreview(null);epoch.current++;abort.current?.abort();setSummary(null);const held=current.current;current.current=null;await stop(held);if(acquiring.current)await stop(await acquiring.current.catch(()=>null));}
 useEffect(()=>{const change=AppState.addEventListener('change',state=>{if(state==='background'){void close();setPairing('');}});return()=>{change.remove();void close();};},[]);
 function run(fn:()=>Promise<void>){if(busyRef.current||!activeRef.current)return;busyRef.current=true;onBusyChange?.(true);setBusy(true);setFailed(false);const work=fn(),token=epoch.current;return work.catch(()=>{if(epoch.current===token){onInvalidate?.();setSummary(value=>value?{...value,available:null,noteState:'UNKNOWN'}:null);setFailed(true);setMessage('No se confirmó la consulta. Conserva la conexión y consulta el estado original; no se ha repetido ningún movimiento.');}}).finally(()=>{busyRef.current=false;setBusy(false);onBusyChange?.(false);});}
 async function display(state:any,token:number){const next=await state.vault.summary();live(token);if(onObservation){const value=await state.vault.walletDisplay();live(token);await onObservation(value);live(token);}setSummary(next);}
 async function sign(consent:any,state:any,token:number){const signature=await signDevicePagedOwnerPermissionV3(consent,state.descriptor.origin,state.descriptor.pairingId,abort.current?.signal);live(token);return signature;}
 async function refresh(state:any,token:number){
  if(!state||!abort.current)throw Error('MOBILE_PAGED_PAIRING');await state.vault.beginReadStorage(abort.current.signal);
  try{const draft=await state.vault.readDraft();live(token);const consent=await state.api.challenge(draft);live(token);const signature=await sign(consent,state,token),status=await state.api.submit(consent,signature);live(token);await state.vault.acceptStatus(status);live(token);state.status=status;await display(state,token);setMessage('Estado original consultado. Los ingresos y retiradas nuevos se revisan en Operaciones.');}
  finally{state.vault.endReadStorage();}
 }
 async function connect(rawProfile=pairing,selectConnection=true,existingOnly=false){
  await close();const token=epoch.current;abort.current=new AbortController();let transport:any,state:any;
  try{const packet=parseDevicePagedConnectionProfileV3(rawProfile),descriptor=packet.descriptor;if(await readDevicePublicKey()!==descriptor.devicePublicKey)throw Error('MOBILE_PAGED_PAIRING');live(token);transport=await createDevicePagedConnectionTransportV3(packet,abort.current.signal);live(token);const api=createDevicePagedOwnerApiV3({descriptor,fetchImpl:transport.fetchImpl});const work=(async()=>{try{return{api,vault:await (existingOnly?openExistingDevicePagedCustodyV3(descriptor,'NOTE',abort.current?.signal):createDevicePagedNoteVaultV3(descriptor,abort.current?.signal)),descriptor,transport,status:null};}catch(error){await Promise.allSettled([api.close(),transport.close()]);throw error;}})();acquiring.current=work;state=await work;acquiring.current=null;live(token);current.current=state;setConnectionPreview({origin:descriptor.origin,fingerprint:packet.transport.certificateSHA256.match(/.{4}/g)!.join(' ')});await refresh(state,token);live(token);await connectionRegistry?.remember(rawProfile,{select:selectConnection});live(token);}
  catch(error){if(current.current===state)current.current=null;setConnectionPreview(null);await stop(state);await transport?.close();throw error;}
 }
 useEffect(()=>{if(!active)void close().finally(()=>onTransportClosed?.());},[active]);
 useEffect(()=>{if(!active||!connectionRequest||busyRef.current||seenRequest.current===connectionRequest.requestId)return;const request=connectionRequest;seenRequest.current=request.requestId;setPairing(request.profile);let ok=false;void Promise.resolve(run(async()=>{await connect(request.profile,request.select!==false,request.existingOnly===true);ok=true;})).finally(()=>onConnectionRead?.(request.requestId,ok));},[active,connectionRequest,busy]);
 async function importConnection(){const profile=await readDevicePagedConnectionClipboardV3();setPairing(profile);await connect(profile);}
 async function observe(job:any){
  const state=current.current,token=epoch.current;if(!state)throw Error('MOBILE_PAGED_PAIRING');
  const draft=await state.vault.effectDraft('OBSERVE_JOB',job.jobId),arm=await state.vault.prearmDraft(draft);live(token);onInvalidate?.();
  const consent=await state.api.challenge(draft);live(token);const signature=await sign(consent,state,token);await state.vault.consumeArm(arm,consent);live(token);const row=await state.api.submit(consent,signature);live(token);await state.vault.acceptRow(row);live(token);await refresh(state,token);
 }
 const button=(label:string,fn:()=>Promise<void>,disabled=false)=><WalletButton label={label} disabled={busy||disabled} tone="secondary" onPress={()=>run(fn)}/>;
 return <WalletScreenLayout title="Consulta de custodia independiente" subtitle="Estado y conciliación de la misma nota; sin nuevos movimientos.">
  <WalletStatus kind={failed?'warning':'info'} title={busy?'Consultando estado original':'Consulta y recuperación'} detail={message}/>
  <WalletCard title="Conexión original">
   {button('Importar conexión del ordenador',importConnection,current.current!==null)}
   {button(showConnectionInput?'Ocultar perfil pegado':'Pegar conexión manualmente',async()=>setShowConnectionInput(value=>!value),current.current!==null)}
   {showConnectionInput&&<><WalletField label="Perfil público de conexión" value={pairing} editable={!busy&&current.current===null} onChangeText={setPairing}/>{button('Conectar perfil pegado',()=>connect(),current.current!==null||pairing.length===0)}</>}
   {connectionPreview&&<><Text style={{color:walletColors.muted}}>{connectionPreview.origin}</Text><Text selectable style={{color:walletColors.muted}}>{connectionPreview.fingerprint}</Text></>}
   {button('Leer estado original',()=>refresh(current.current,epoch.current),current.current===null)}{button('Cerrar conexión',close,current.current===null)}
  </WalletCard>
  {summary&&<WalletCard title="Nota conservada"><Text style={{color:walletColors.text}}>Estado: {summary.noteState}</Text><Text style={{color:walletColors.text}}>Disponible: {summary.available??'pendiente de consultar'} unidades demo</Text>{summary.jobs.map(job=><WalletCard key={job.jobId} title={job.mode==='deposit'?'Ingreso original':'Retirada original'}><Text style={{color:walletColors.muted}}>{job.stage}</Text>{['UNKNOWN','PROVED','PROVING'].includes(job.stage)&&button('Consultar mismo trabajo',()=>observe(job))}</WalletCard>)}</WalletCard>}
  <WalletCard title="Ingresos y retiradas"><Text style={{color:walletColors.muted}}>Esta pantalla conserva las custodias anteriores y permite observar sus trabajos. Los movimientos nuevos requieren el recorrido de revisión y autorización de Operaciones; una nota independiente no se transforma en una nota de grafo.</Text>{onOpenOperations&&<WalletButton label="Abrir Operaciones" onPress={onOpenOperations} disabled={busy}/>}</WalletCard>
 </WalletScreenLayout>;
}
