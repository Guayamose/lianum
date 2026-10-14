import {originalFlatIngressFailureMessageV3} from './flat-ingress-feedback-v3.mjs';
import {sameDeviceRecoveryCheckpointV1 as sameRecoveryCheckpoint,verifyDeviceRecoveryCopyV1,reviewDeviceRecoveryPreparationV1} from '../custody/device-recovery-copy-gate-v1.ts';
import {readDeviceMetaMorphoRedemptionStatusV2,readDeviceMorphoBlueRedemptionStatusV1,readDeviceAaveStaticRedemptionStatusV1,createDeviceMetaMorphoRedemptionApiV2,createDeviceMorphoBlueRedemptionApiV1,createDeviceAaveStaticRedemptionApiV1} from '../api/device-morpho-blue-redemption-api-v1.mjs';
import type {DeviceMetaMorphoConsentV2,DeviceMetaMorphoStatusV2,DeviceMorphoBlueConsentV1,DeviceMorphoBlueStatusV1,DeviceAaveStaticConsentV1,DeviceAaveStaticStatusV1} from '../../../../packages/mobile-protocol/src/device-morpho-blue-redemption-v1.mjs';
import {useEffect,useRef,useState} from 'react';
import {Alert,AppState,StyleSheet,Text,TextInput,View} from 'react-native';
import {WalletButton,WalletCard,WalletScreenLayout,WalletField,WalletStatus,WalletChoice,walletColors} from '../components/wallet-ui';
import {fetch as expoFetch} from 'expo/fetch';
import {createDeviceExternalFlatPinnedTransportV1,readDeviceExternalFlatConnectionClipboardV1} from '../api/device-paged-connection-transport-v3';
import {approveWalletSessionExternalV1,closeWalletSessionAuthorizationV1,readDevicePublicKey,exportDeviceIdentityBackupV1,importDeviceIdentityBackupV1,signDeviceExternalFlatPermissionV1,signDeviceExternalFlatGraphPermissionV1,signDeviceExternalFlatGraphOutputPermissionV1,signDeviceMetaMorphoRedemptionPermissionV2,signDeviceMorphoBlueRedemptionPermissionV1,signDeviceAaveStaticRedemptionPermissionV1} from '../custody/key-store';
import {createDeviceExternalFlatNoteVaultV1,createDeviceExternalFlatRoutedNoteVaultV1,openExistingDeviceExternalFlatCustodyV1,restoreDeviceExternalFlatNoteBackupV1} from '../custody/device-external-flat-note-vault-v1';
import type {DeviceExternalFlatSummary,DeviceExternalFlatPrepared} from '../custody/device-external-flat-note-vault-v1';
import {createDeviceExternalFlatNoteApiV1,readDeviceExternalFlatQuoteV1} from '../api/device-external-flat-note-api-v1.mjs';
import {observeDeviceExternalFlatReceptionV1} from '../api/device-external-flat-reception-observer-v1.mjs';
import {createDeviceExternalFlatGraphApiV1,readDeviceExternalFlatGraphQuoteV1,readDeviceExternalFlatGraphPreparationV1} from '../api/device-external-flat-graph-api-v1.mjs';
import {validateExternalFlatGraphFreshV1,wipeDeviceReservationWitnessV1} from '../../../../packages/mobile-protocol/src/device-external-flat-graph-v1.mjs';
import {DEVICE_EXTERNAL_FLAT_NOTE_V1,DEVICE_EXTERNAL_FLAT_SHARE_V1,normalizeExternalFlatDescriptorV1,externalFlatExactV1,externalFlatUintV1,externalFlatWipeV1,validateExternalFlatFreshV1} from '../../../../packages/mobile-protocol/src/device-external-flat-note-v1.mjs';
import type {ExternalFlatAction,ExternalFlatConsent,ExternalFlatDraft,ExternalFlatStatus,ExternalFlatDescriptor} from '../../../../packages/mobile-protocol/src/device-external-flat-note-v1.mjs';
import {deviceDefiAmountToAtomicV1,deviceDefiAmountFromAtomicV1,deviceDefiReceptionWindowV1,nextDeviceDefiOperationV1} from '../../../../packages/mobile-protocol/src/device-defi-operation-flow-v1.mjs';
import type {DeviceDefiOperationDecisionV1} from '../../../../packages/mobile-protocol/src/device-defi-operation-flow-v1.mjs';
import {normalizePublicWalletConnectionV1,publicWalletConnectionMatchesRouteV1} from '../state/public-connection-registry-v1.mjs';
import type {PublicConnectionRegistryV1} from '../state/public-connection-registry-v1.mjs';

type Client=ReturnType<typeof createDeviceExternalFlatNoteApiV1>;
type Vault=Awaited<ReturnType<typeof createDeviceExternalFlatNoteVaultV1>>;
type GraphClient=ReturnType<typeof createDeviceExternalFlatGraphApiV1>;
type GraphConsent=Parameters<GraphClient['submit']>[0];
type GraphStatus=Awaited<ReturnType<GraphClient['status']>>;
type GraphAction=GraphConsent['draft']['action'];
type GraphPrepared=Awaited<ReturnType<Vault['prepareSourceGraph']>>;
type RecoveryCheckpoint=Awaited<ReturnType<Vault['recoveryCheckpoint']>>;
type RecoveryPreparation='SHARE'|'GRAPH';
type GraphOutputRole='change'|'recovery';
type GraphOutputAction='WITHDRAW_W39'|'OBSERVE_W39';
type GraphOutputConsent=Parameters<GraphClient['outputSubmit']>[0];
type GraphOutputPrepared=Awaited<ReturnType<Vault['prepareGraphOutputWithdrawal']>>;
type GraphOutputReview={consent:GraphOutputConsent;witness:unknown|null;storage:SubmissionStorage};
type GraphOutputView={noteRole:GraphOutputRole;amount:string;state:string;available:string|null};
type BlueClient=ReturnType<typeof createDeviceMorphoBlueRedemptionApiV1>;
type AaveClient=ReturnType<typeof createDeviceAaveStaticRedemptionApiV1>;
type MetaClient=ReturnType<typeof createDeviceMetaMorphoRedemptionApiV2>;
type PublicTls={origin:string;devicePublicKey:string;certificatePEM:string;certificateSHA256:string};
type PinnedTransport=Awaited<ReturnType<typeof createDeviceExternalFlatPinnedTransportV1>>;
type ReceptionScope={jobId:string;rootId:string;commitment:string};
type Connection={transport:PinnedTransport|null;fetchImpl:typeof fetch;redemptionRecipient:string|null;metaClient:MetaClient|null;aaveClient:AaveClient|null;blueClient:BlueClient|null;client:Client;graphClient:GraphClient|null;noteClosed:boolean;vault:Vault;descriptor:ExternalFlatDescriptor;reception?:ReceptionScope};
type GraphReview={consent:GraphConsent;witness:unknown|null;storage:SubmissionStorage};
type Review={consent:ExternalFlatConsent;witness:unknown|null;storage:SubmissionStorage};
type SubmissionStorage={selected:Connection;controller:AbortController;token:object|null;authorization?:object};
const retainedDefiConnections:{profiles:Partial<Record<'UNISWAP'|'AAVE'|'MORPHO',string>>;current:string;protocol:'UNISWAP'|'AAVE'|'MORPHO'}={profiles:{},current:'',protocol:'UNISWAP'};
type MetaFourDelivery={id:string;dependsOn:string[];origin:string;maximumInput:string;shareAmount:string;payoutAmount:string};
type MetaFourPairing={profile:'DEVICE_EXTERNAL_FLAT_META_FOUR_PAIRING_V1'|'DEVICE_EXTERNAL_FLAT_META_FOUR_UNDERLYING_PAIRING_V2';redemptionRecipient?:string;source:ExternalFlatDescriptor;targets:ExternalFlatDescriptor[];deliveries:MetaFourDelivery[]};
type MetaFourWindow={validFrom:string;validUntil:string;settleBefore:string};
/** Public pairing DATA chooses a local connection. Only its original SDK can
 * authenticate a response or authorize a proof; this package is no receipt. */
function parseMetaFourPairing(text:string):MetaFourPairing{
 if(typeof text!=='string'||text.length===0||text.length>32768)throw Error('MOBILE_META_FOUR_PAIRING_INVALID');
 const raw=JSON.parse(text),underlying=raw?.profile==='DEVICE_EXTERNAL_FLAT_META_FOUR_UNDERLYING_PAIRING_V2',p=externalFlatExactV1(raw,['profile','source','targets','deliveries',...(underlying?['redemptionRecipient']:[])]);if(underlying&&(!/^[0-9a-f]{40}$/.test(p.redemptionRecipient)||p.redemptionRecipient==='0'.repeat(40)))throw Error('MOBILE_META_FOUR_PAIRING_INVALID');
 if(!['DEVICE_EXTERNAL_FLAT_META_FOUR_PAIRING_V1','DEVICE_EXTERNAL_FLAT_META_FOUR_UNDERLYING_PAIRING_V2'].includes(p.profile)||!Array.isArray(p.targets)||p.targets.length!==4||!Array.isArray(p.deliveries)||p.deliveries.length!==4)throw Error('MOBILE_META_FOUR_PAIRING_INVALID');
 const source=normalizeExternalFlatDescriptorV1(p.source),targets:ExternalFlatDescriptor[]=p.targets.map(normalizeExternalFlatDescriptorV1);
 if(source.profile!==DEVICE_EXTERNAL_FLAT_NOTE_V1||targets[0].origin!==source.origin||new Set(targets.map(v=>v.origin)).size!==4||new Set([source,...targets].map(v=>v.pairingId)).size!==5)throw Error('MOBILE_META_FOUR_PAIRING_INVALID');
 const dependencies=[[],['device-external-share-0'],['device-external-share-0'],['device-external-share-1','device-external-share-2']];
 const deliveries:MetaFourDelivery[]=p.deliveries.map((raw:unknown,slot:number)=>{
  const d=externalFlatExactV1(raw,['id','dependsOn','origin','maximumInput','shareAmount','payoutAmount']),target=targets[slot];
  if(target.profile!==DEVICE_EXTERNAL_FLAT_SHARE_V1||target.devicePublicKey!==source.devicePublicKey||JSON.stringify(target.poolTerms)!==JSON.stringify(targets[0].poolTerms)||JSON.stringify(target.assetMetadata)!==JSON.stringify(targets[0].assetMetadata)
   ||['genesis','hub','hubCodeHash','hubDomain'].some(k=>target.poolTerms[k as keyof ExternalFlatDescriptor['poolTerms']]!==source.poolTerms[k as keyof ExternalFlatDescriptor['poolTerms']])
   ||d.id!=='device-external-share-'+slot||d.origin!==target.origin||JSON.stringify(d.dependsOn)!==JSON.stringify(dependencies[slot])||['maximumInput','shareAmount','payoutAmount'].some(k=>d[k]!=='100'))throw Error('MOBILE_META_FOUR_PAIRING_INVALID');
  return {id:d.id,dependsOn:[...d.dependsOn],origin:d.origin,maximumInput:d.maximumInput,shareAmount:d.shareAmount,payoutAmount:d.payoutAmount};
 });return {profile:p.profile,source,targets,deliveries,...(underlying?{redemptionRecipient:p.redemptionRecipient}:{})};
}
type AavePairing={profile:'DEVICE_EXTERNAL_FLAT_AAVE_PAIRING_V1';source:ExternalFlatDescriptor;target:ExternalFlatDescriptor};
function parseAavePairing(text:string):AavePairing{
 if(typeof text!=='string'||text.length===0||text.length>32768)throw Error('MOBILE_AAVE_PAIRING_INVALID');const p=externalFlatExactV1(JSON.parse(text),['profile','source','target']),source=normalizeExternalFlatDescriptorV1(p.source),target=normalizeExternalFlatDescriptorV1(p.target);
 if(p.profile!=='DEVICE_EXTERNAL_FLAT_AAVE_PAIRING_V1'||source.profile!==DEVICE_EXTERNAL_FLAT_NOTE_V1||target.profile!==DEVICE_EXTERNAL_FLAT_SHARE_V1||source.devicePublicKey!==target.devicePublicKey||source.origin!==target.origin||source.pairingId===target.pairingId||source.poolTerms.pool===target.poolTerms.pool||source.poolTerms.assetIdentity===target.poolTerms.assetIdentity||['genesis','hub','hubCodeHash','hubDomain'].some(k=>source.poolTerms[k as keyof ExternalFlatDescriptor['poolTerms']]!==target.poolTerms[k as keyof ExternalFlatDescriptor['poolTerms']]))throw Error('MOBILE_AAVE_PAIRING_INVALID');return {profile:p.profile,source,target};
}
type MetaPairing={profile:'DEVICE_EXTERNAL_FLAT_METAMORPHO_UNDERLYING_PAIRING_V2';source:ExternalFlatDescriptor;target:ExternalFlatDescriptor;redemptionRecipient:string};
function parseMetaPairing(text:string):MetaPairing{
 if(typeof text!=='string'||text.length===0||text.length>32768)throw Error('MOBILE_METAMORPHO_UNDERLYING_PAIRING_INVALID');const p=externalFlatExactV1(JSON.parse(text),['profile','source','target','redemptionRecipient']),source=normalizeExternalFlatDescriptorV1(p.source),target=normalizeExternalFlatDescriptorV1(p.target);
 if(!/^[0-9a-f]{40}$/.test(p.redemptionRecipient)||p.redemptionRecipient==='0'.repeat(40)||p.profile!=='DEVICE_EXTERNAL_FLAT_METAMORPHO_UNDERLYING_PAIRING_V2'||source.profile!==DEVICE_EXTERNAL_FLAT_NOTE_V1||target.profile!==DEVICE_EXTERNAL_FLAT_SHARE_V1||source.devicePublicKey!==target.devicePublicKey||source.origin!==target.origin||source.pairingId===target.pairingId||source.poolTerms.pool===target.poolTerms.pool||source.poolTerms.assetIdentity===target.poolTerms.assetIdentity||['genesis','hub','hubCodeHash','hubDomain'].some(k=>source.poolTerms[k as keyof ExternalFlatDescriptor['poolTerms']]!==target.poolTerms[k as keyof ExternalFlatDescriptor['poolTerms']]))throw Error('MOBILE_METAMORPHO_UNDERLYING_PAIRING_INVALID');return {profile:p.profile,source,target,redemptionRecipient:p.redemptionRecipient};
}
type UniswapPairing={profile:'DEVICE_EXTERNAL_FLAT_UNISWAP_PAIRING_V1';source:ExternalFlatDescriptor;target:ExternalFlatDescriptor};
function parseUniswapPairing(text:string):UniswapPairing{
 if(typeof text!=='string'||text.length===0||text.length>32768)throw Error('MOBILE_UNISWAP_PAIRING_INVALID');const p=externalFlatExactV1(JSON.parse(text),['profile','source','target']),source=normalizeExternalFlatDescriptorV1(p.source),target=normalizeExternalFlatDescriptorV1(p.target);
 if(p.profile!=='DEVICE_EXTERNAL_FLAT_UNISWAP_PAIRING_V1'||source.profile!==DEVICE_EXTERNAL_FLAT_NOTE_V1||target.profile!==DEVICE_EXTERNAL_FLAT_SHARE_V1||source.devicePublicKey!==target.devicePublicKey||source.origin!==target.origin||source.pairingId===target.pairingId||source.poolTerms.pool===target.poolTerms.pool||source.poolTerms.assetIdentity===target.poolTerms.assetIdentity||['genesis','hub','hubCodeHash','hubDomain'].some(k=>source.poolTerms[k as keyof ExternalFlatDescriptor['poolTerms']]!==target.poolTerms[k as keyof ExternalFlatDescriptor['poolTerms']]))throw Error('MOBILE_UNISWAP_PAIRING_INVALID');return {profile:p.profile,source,target};
}
function Button({label,onPress,disabled=false,loading=false,tone='primary'}:{label:string;onPress():void;disabled?:boolean;loading?:boolean;tone?:'primary'|'secondary'|'danger'}) {return <WalletButton label={label} onPress={onPress} disabled={disabled} loading={loading} tone={tone==='primary'&&/Cancelar|Ocultar|Consultar|Volver|Ver |Cerrar/.test(label)?'secondary':tone}/>;}
function Fields({values}:{values:Record<string,string>}) {
 return <>{Object.entries(values).map(([label,value])=><View key={label}><Text style={styles.label}>{label}</Text><Text selectable style={styles.value}>{value}</Text></View>)}</>;
}
function amountText(amount:string|null,descriptor:ExternalFlatDescriptor|null) {
 if(amount===null||descriptor===null)return 'No disponible';
 return deviceDefiAmountFromAtomicV1(amount,descriptor.assetMetadata.decimals)+' '+descriptor.assetMetadata.symbol;
}
function assetLabel(descriptor:ExternalFlatDescriptor|null|undefined) {
 if(!descriptor)return 'Activo de esta cuenta';
 return descriptor.assetMetadata.symbol+(descriptor.assetMetadata.symbol==='PALT'?' (demo)':'');
}
function pairedAssetLabels(pairing:{source:ExternalFlatDescriptor;target:ExternalFlatDescriptor}) {
 const sameSymbol=pairing.source.assetMetadata.symbol===pairing.target.assetMetadata.symbol;
 return {source:assetLabel(pairing.source)+(sameSymbol?' de origen':''),target:assetLabel(pairing.target)+(sameSymbol?' de destino':'')};
}
function conversionTitle(pairing:{source:ExternalFlatDescriptor;target:ExternalFlatDescriptor}|null,swap:boolean) {
 if(!pairing)return swap?'Intercambiar activos':'Invertir activos';
 const assets=pairedAssetLabels(pairing);
 return swap?'Cambiar '+assets.source+' por '+assets.target:'Invertir '+assets.source+' y recibir '+assets.target;
}
const actionText:Record<ExternalFlatAction,string>={PROVE_D26:'Preparar ingreso',FUND_D26:'Confirmar ingreso',OBSERVE_D26:'Comprobar ingreso',PROVE_D27:'Autorizar recepción de tokens',OBSERVE_D27:'Comprobar tokens recibidos',QUOTE_W39:'Preparar la retirada completa',PROVE_W39:'Preparar retirada',WITHDRAW_W39:'Confirmar retirada',OBSERVE_W39:'Consultar esta retirada'};
const stageText:Record<string,string>={PROVING:'Preparación por comprobar',PROVED:'Preparación lista',FUNDING_UNKNOWN:'Ingreso pendiente de confirmar',DELIVERY_UNKNOWN:'Recepción pendiente de confirmar',WITHDRAWAL_UNKNOWN:'Retirada pendiente de confirmar',CONFIRMED:'Confirmada',RESERVING:'Registro de reserva en curso',RESERVATION_UNKNOWN:'Reserva pendiente de confirmar',RESERVED:'Reserva confirmada',FAILED:'Prueba no completada'};
const graphActionText:Record<GraphAction,string>={PROVE_U:'Preparar conversión',RESERVE_S:'Reservar fondos',OBSERVE_S:'Consultar la reserva',EXECUTE_GRAPH:'Ejecutar la conversión',RECONCILE_GRAPH:'Consultar la conversión',RECOVER_GRAPH:'Recuperar la reserva vencida',CANCEL_GRAPH:'Liberar una reserva no enviada'};
const graphOutputRoleText:Record<GraphOutputRole,string>={change:'Saldo restante',recovery:'Saldo recuperado'};
const graphOutputStateText:Record<string,string>={EMPTY:'Sin salida disponible',UNISSUED:'Pendiente de emisión',UNSPENT:'Disponible',LOCKED:'Bloqueada hasta resolución',SPENT:'Retirada',UNKNOWN:'Pendiente de confirmar'};
const graphStageText:Record<string,string>={PREPARED:'Preparada',EXECUTION_UNKNOWN:'Ejecución pendiente de confirmar',RECOVERY_UNKNOWN:'Recuperación pendiente de confirmar',FULFILLED:'Conversión confirmada',RECOVERED:'Reserva recuperada',SOURCE_CANCELLED:'Reserva no enviada liberada'};
export type ExternalEntryActionV1={requestId:number;action:'swap'|'invest'};
export type ExternalConnectionRequestV1={id:string;profile:string;requestId:number;select?:boolean;route?:Readonly<Record<string,string|number>>;reception?:ReceptionScope};
export default function ExternalTokenNoteScreen({onObservation,onGraphObservation,onSourcePending,onOpenOperations,connectionRegistry,connectionRequest,active=true,onBusyChange,onTransportClosed,onConnectionRead,entryAction}:{onObservation?(value:ExternalFlatStatus):void;onGraphObservation?(value:GraphStatus):void|Promise<void>;onSourcePending?(descriptor:ExternalFlatDescriptor,rootId:string):void;onOpenOperations?():void;connectionRegistry?:PublicConnectionRegistryV1;connectionRequest?:ExternalConnectionRequestV1|null;active?:boolean;onBusyChange?(busy:boolean):void;onTransportClosed?():void;onConnectionRead?(requestId:number,ok:boolean):void;entryAction?:ExternalEntryActionV1|null}={}) {
 const selectConnectionRef=useRef(true);
 const receptionRequestRef=useRef<ReceptionScope|null>(null);
 const activeRef=useRef(active),callbacks=useRef({onBusyChange,onTransportClosed});activeRef.current=active;callbacks.current={onBusyChange,onTransportClosed};
 const previewAbort=useRef<AbortController|null>(null),beforePostCancellations=useRef(new WeakSet<object>());
 const redemptionAuthorization=useRef<{token:object;controller:AbortController;kind:'BLUE'|'AAVE'|'META'}|null>(null);
 const publicTls=useRef<PublicTls|null>(null),transportAbort=useRef<AbortController|null>(null);
 const [tlsDisplay,setTlsDisplay]=useState<{origin:string;certificateSHA256:string}|null>(null);
 const [settingsOpen,setSettingsOpen]=useState(false),[recoveryOpen,setRecoveryOpen]=useState(false),[noticeError,setNoticeError]=useState(false),[selectedProtocol,setSelectedProtocol]=useState<'UNISWAP'|'AAVE'|'MORPHO'>(retainedDefiConnections.protocol);
 const knownConnections=useRef<Partial<Record<'UNISWAP'|'AAVE'|'MORPHO',string>>>(retainedDefiConnections.profiles);
 const connectionRequestSeen=useRef<number|null>(null),entryActionSeen=useRef<number|null>(null);
 const [flowConnectionText,setFlowConnectionText]=useState(retainedDefiConnections.current),[advanced,setAdvanced]=useState(false),[operationGoal,setOperationGoal]=useState<'CONVERT'|'WITHDRAW'>('CONVERT');
 const [copyVisible,setCopyVisible]=useState(false);
 const [fundingInput,setFundingInput]=useState(''),[destinationInput,setDestinationInput]=useState(''),[solverInput,setSolverInput]=useState(''),[budgetInput,setBudgetInput]=useState(''),[flowRecipient,setFlowRecipient]=useState(''),[windowSeconds,setWindowSeconds]=useState(3600);
 const [descriptorText,setDescriptorText]=useState(''),[recipient,setRecipient]=useState(''),[amount,setAmount]=useState(''),[validUntil,setValidUntil]=useState('');
 const [connected,setConnected]=useState(false),[summary,setSummary]=useState<DeviceExternalFlatSummary|null>(null);
 const [review,setReview]=useState<ExternalFlatConsent|null>(null),[status,setStatus]=useState<ExternalFlatStatus|null>(null);
 const [graphReview,setGraphReview]=useState<GraphConsent|null>(null),[graphStatus,setGraphStatus]=useState<GraphStatus|null>(null);
 const [blueStatus,setBlueStatus]=useState<DeviceMorphoBlueStatusV1|null>(null),[blueReview,setBlueReview]=useState<DeviceMorphoBlueConsentV1|null>(null),[blueMinimum,setBlueMinimum]=useState('');
 const blueReviewRef=useRef<DeviceMorphoBlueConsentV1|null>(null);
 const [metaStatus,setMetaStatus]=useState<DeviceMetaMorphoStatusV2|null>(null),[metaReview,setMetaReview]=useState<DeviceMetaMorphoConsentV2|null>(null),[metaMinimum,setMetaMinimum]=useState('');const metaReviewRef=useRef<DeviceMetaMorphoConsentV2|null>(null);
 const [metaText,setMetaText]=useState(''),[metaPairing,setMetaPairing]=useState<MetaPairing|null>(null),metaRef=useRef<MetaPairing|null>(null),metaWindowRef=useRef<{validFrom:string;validUntil:string;amount:string}|null>(null);
 const [aaveStatus,setAaveStatus]=useState<DeviceAaveStaticStatusV1|null>(null),[aaveReview,setAaveReview]=useState<DeviceAaveStaticConsentV1|null>(null),[aaveMinimum,setAaveMinimum]=useState('');const aaveReviewRef=useRef<DeviceAaveStaticConsentV1|null>(null);
 const [graphOutputReview,setGraphOutputReview]=useState<GraphOutputConsent|null>(null);
 const [graphPreparationPending,setGraphPreparationPending]=useState(false);
 const [graphAssetAmount,setGraphAssetAmount]=useState(''),[graphShareAmount,setGraphShareAmount]=useState(''),[graphPayoutAmount,setGraphPayoutAmount]=useState(''),[graphValidFrom,setGraphValidFrom]=useState(''),[graphSettleBefore,setGraphSettleBefore]=useState('');
 const [busy,setBusy]=useState(false),[notice,setNotice]=useState('Elige intercambiar o invertir. Después abre la conexión de tus activos.');
 const [recoveryPassword,setRecoveryPassword]=useState(''),[recoveryInput,setRecoveryInput]=useState(''),[recoveryCopy,setRecoveryCopy]=useState('');
 const [recoveryPreparation,setRecoveryPreparation]=useState<RecoveryPreparation|null>(null);
 const [custodyRoute,setCustodyRoute]=useState<'LEGACY'|'ROUTED'>('LEGACY');
 const [metaFourText,setMetaFourText]=useState(''),[metaFour,setMetaFour]=useState<MetaFourPairing|null>(null),[metaFourWindow,setMetaFourWindow]=useState<MetaFourWindow|null>(null),[metaFourReads,setMetaFourReads]=useState<(ExternalFlatStatus|null)[]>([null,null,null,null]);
 const metaFourRef=useRef<MetaFourPairing|null>(null),metaFourWindowRef=useRef<MetaFourWindow|null>(null);
 const [aaveText,setAaveText]=useState(''),[aavePairing,setAavePairing]=useState<AavePairing|null>(null),aaveRef=useRef<AavePairing|null>(null),aaveWindowRef=useRef<{validFrom:string;validUntil:string;amount:string}|null>(null);
 const [uniswapText,setUniswapText]=useState(''),[uniswapPairing,setUniswapPairing]=useState<UniswapPairing|null>(null),uniswapRef=useRef<UniswapPairing|null>(null),uniswapWindowRef=useRef<{validFrom:string;validUntil:string;amount:string}|null>(null);
 const mounted=useRef(true),busyRef=useRef(false),epoch=useRef(0),connection=useRef<Connection|null>(null);
 const acquiring=useRef<Promise<Vault>|null>(null),closing=useRef<Promise<unknown>|null>(null),signing=useRef<AbortController|null>(null);
 const graphReviewRef=useRef<GraphReview|null>(null),graphPreparedRef=useRef<GraphPrepared|null>(null);
 const graphOutputReviewRef=useRef<GraphOutputReview|null>(null),graphOutputPreparedRef=useRef<GraphOutputPrepared|null>(null);
 const reviewRef=useRef<Review|null>(null),preparedRef=useRef<DeviceExternalFlatPrepared|null>(null),activeWitness=useRef<unknown|null>(null);
 const recoveryCut=useRef<{selected:Connection;kind:RecoveryPreparation;prepared:DeviceExternalFlatPrepared|GraphPrepared;checkpoint:RecoveryCheckpoint}|null>(null);
 const submissionStorage=useRef<SubmissionStorage|null>(null);
 function releaseSubmissionStorage(storage=submissionStorage.current){if(!storage)return;if(submissionStorage.current===storage)submissionStorage.current=null;storage.controller.abort();if(storage.authorization)closeWalletSessionAuthorizationV1(storage.authorization);if(storage.token)storage.selected.vault.endSubmissionStorage(storage.token);}
 async function openSubmissionStorage(selected:Connection,kind:'NOTE'|'GRAPH'|'OUTPUT',draft:unknown,ticket:number){
  if(submissionStorage.current)throw Error('MOBILE_EXTERNAL_FLAT_SUBMISSION_ARM');
  const storage:SubmissionStorage={selected,controller:new AbortController(),token:null};submissionStorage.current=storage;
  try{storage.token=await selected.vault.beginSubmissionStorage(kind,draft,storage.controller.signal);current(ticket,selected);if(storage.controller.signal.aborted||submissionStorage.current!==storage)throw Error('MOBILE_EXTERNAL_FLAT_CONTEXT_CHANGED');return storage;}
  catch(error){if(error instanceof Error&&error.message==='MOBILE_AUTHENTICATION_CANCELLED')beforePostCancellations.current.add(error);releaseSubmissionStorage(storage);throw error;}
 }
 function clearReview() {
  previewAbort.current?.abort();previewAbort.current=null;
  const authorization=redemptionAuthorization.current;redemptionAuthorization.current=null;if(authorization){authorization.controller.abort();closeWalletSessionAuthorizationV1(authorization.token);}
  releaseSubmissionStorage();
  metaReviewRef.current=null;if(mounted.current)setMetaReview(null);blueReviewRef.current=null;if(mounted.current)setBlueReview(null);aaveReviewRef.current=null;if(mounted.current)setAaveReview(null);
  recoveryCut.current=null;if(mounted.current)setRecoveryPreparation(null);
  signing.current?.abort();signing.current=null;
  externalFlatWipeV1(graphOutputReviewRef.current?.witness);externalFlatWipeV1(graphOutputPreparedRef.current?.witness);graphOutputReviewRef.current=null;graphOutputPreparedRef.current=null;if(mounted.current)setGraphOutputReview(null);
  wipeDeviceReservationWitnessV1(graphReviewRef.current?.witness);wipeDeviceReservationWitnessV1(graphPreparedRef.current?.witness);graphReviewRef.current=null;graphPreparedRef.current=null;if(mounted.current)setGraphReview(null);
  externalFlatWipeV1(reviewRef.current?.witness);externalFlatWipeV1(preparedRef.current?.witness);externalFlatWipeV1(activeWitness.current);activeWitness.current=null;
  reviewRef.current=null;preparedRef.current=null;if(mounted.current)setReview(null);
 }
 function hideRecovery(){setRecoveryPassword('');setRecoveryInput('');setRecoveryCopy('');}
 function closeConnection() {
  epoch.current++;transportAbort.current?.abort();transportAbort.current=null;clearReview();if(mounted.current)hideRecovery();const selected=connection.current;connection.current=null;
  selected?.metaClient?.close();selected?.aaveClient?.close();selected?.blueClient?.close();selected?.graphClient?.close();selected?.client.close();const acquisition=acquiring.current;acquiring.current=null;
  const previous=closing.current;
  const drain=Promise.allSettled([previous,selected?.transport?.close(),selected?.vault.close(),acquisition?.then(v=>v.close())]);closing.current=drain;
  if(mounted.current){setConnected(false);setStatus(null);setGraphStatus(null);setGraphPreparationPending(false);setBlueStatus(null);setAaveStatus(null);setMetaStatus(null);}
  void drain.then(results=>{if(closing.current===drain)closing.current=null;const transportResult=results[1];if(transportResult.status==='fulfilled')callbacks.current.onTransportClosed?.();else if(mounted.current){setNoticeError(true);setNotice('No pudimos cerrar la conexión. Bloquea la sesión antes de abrir otra operación.');}});return drain;
 }
 function current(ticket:number,selected:Connection) {
  if(!mounted.current||!activeRef.current||AppState.currentState!=='active'||epoch.current!==ticket||connection.current!==selected)throw Error('MOBILE_EXTERNAL_FLAT_CONTEXT_CHANGED');
 }
 function requireConnection() {const selected=connection.current;if(!selected)throw Error('MOBILE_EXTERNAL_FLAT_CONNECTION_REQUIRED');return selected;}
 function clearMetaFour(){metaFourRef.current=null;metaFourWindowRef.current=null;setMetaFour(null);setMetaFourWindow(null);setMetaFourReads([null,null,null,null]);}
 function metaFourSlot(descriptor:ExternalFlatDescriptor){return metaFourRef.current?.targets.findIndex(v=>JSON.stringify(v)===JSON.stringify(descriptor))??-1;}
 function retainMetaFourWindow(window:MetaFourWindow){
  externalFlatUintV1(window.validFrom);externalFlatUintV1(window.validUntil);externalFlatUintV1(window.settleBefore);
  if(BigInt(window.validFrom)>=BigInt(window.validUntil)||BigInt(window.validUntil)+60n!==BigInt(window.settleBefore)||metaFourWindowRef.current&&JSON.stringify(metaFourWindowRef.current)!==JSON.stringify(window))throw Error('MOBILE_META_FOUR_WINDOW_CHANGED');
  metaFourWindowRef.current=window;setMetaFourWindow(window);setGraphValidFrom(window.validFrom);setGraphSettleBefore(window.settleBefore);setValidUntil(window.validUntil);setGraphAssetAmount('400');setGraphShareAmount('400');setGraphPayoutAmount('400');
 }
 function recordMetaFourStatus(value:ExternalFlatStatus){
  const slot=metaFourSlot(value.descriptor);if(slot<0)return;const intent=value.jobs.find(v=>v.mode==='deposit_intent');
  if(intent){const s=intent.consentFields.statement;if(s.amount!=='100'||s.validFrom===undefined||s.validUntil===undefined)throw Error('MOBILE_META_FOUR_TARGET_CHANGED');retainMetaFourWindow({validFrom:s.validFrom,validUntil:s.validUntil,settleBefore:(BigInt(s.validUntil)+60n).toString()});}
  setMetaFourReads(previous=>previous.map((v,i)=>i===slot?value:v));
 }
 function invalidateMetaFourStatus(descriptor:ExternalFlatDescriptor){const slot=metaFourSlot(descriptor);if(slot>=0)setMetaFourReads(previous=>previous.map((v,i)=>i===slot?null:v));}
 function clearMeta(){metaRef.current=null;metaWindowRef.current=null;setMetaPairing(null);}
 async function loadMeta(rawText=metaText){
  const p=parseMetaPairing(rawText),ticket=epoch.current,key=await readDevicePublicKey();if(!mounted.current||epoch.current!==ticket||AppState.currentState!=='active')throw Error('MOBILE_EXTERNAL_FLAT_CONTEXT_CHANGED');if(key!==p.source.devicePublicKey)throw Error('MOBILE_EXTERNAL_FLAT_DEVICE_REQUIRED');const drain=closeConnection(),held=epoch.current;await drain;if(!mounted.current||epoch.current!==held||AppState.currentState!=='active')throw Error('MOBILE_EXTERNAL_FLAT_CONTEXT_CHANGED');clearMetaFour();clearAave();clearUniswap();clearMeta();metaRef.current=p;setMetaPairing(p);setCustodyRoute('ROUTED');setGraphValidFrom('');setGraphSettleBefore('');setDescriptorText(JSON.stringify(p.source));setSummary(null);await connect(JSON.stringify(p.source),'ROUTED');
 }
 async function selectMeta(role:'source'|'target'){
  const p=metaRef.current;if(!p)throw Error('MOBILE_META_PAIRING_INVALID');const descriptor=p[role],text=JSON.stringify(descriptor);setDescriptorText(text);setSummary(null);await connect(text,'ROUTED');const selected=requireConnection(),ticket=epoch.current;current(ticket,selected);if(JSON.stringify(selected.descriptor)!==text)throw Error('MOBILE_EXTERNAL_FLAT_CONTEXT_CHANGED');
  if(role==='target'){const value=await readStatus(selected,ticket),intent=value.jobs.find(v=>v.mode==='deposit_intent');if(intent){const t=intent.consentFields.statement;if(t.validFrom===undefined||t.validUntil===undefined)throw Error('MOBILE_META_RECEPTION_REQUIRED');const w={validFrom:t.validFrom,validUntil:t.validUntil,amount:t.amount};if(metaWindowRef.current&&JSON.stringify(metaWindowRef.current)!==JSON.stringify(w))throw Error('MOBILE_META_RECEPTION_CHANGED');metaWindowRef.current=w;setGraphShareAmount(w.amount);setGraphValidFrom(w.validFrom);setGraphSettleBefore((BigInt(w.validUntil)+60n).toString());}}
 }
 function clearAave(){aaveRef.current=null;aaveWindowRef.current=null;setAavePairing(null);}
 async function loadAave(rawText=aaveText){
  const p=parseAavePairing(rawText),ticket=epoch.current,key=await readDevicePublicKey();if(!mounted.current||epoch.current!==ticket||AppState.currentState!=='active')throw Error('MOBILE_EXTERNAL_FLAT_CONTEXT_CHANGED');if(key!==p.source.devicePublicKey)throw Error('MOBILE_EXTERNAL_FLAT_DEVICE_REQUIRED');const drain=closeConnection(),held=epoch.current;await drain;if(!mounted.current||epoch.current!==held||AppState.currentState!=='active')throw Error('MOBILE_EXTERNAL_FLAT_CONTEXT_CHANGED');clearMeta();clearMetaFour();clearAave();clearUniswap();aaveRef.current=p;setAavePairing(p);setCustodyRoute('ROUTED');setGraphValidFrom('');setGraphSettleBefore('');setDescriptorText(JSON.stringify(p.source));setSummary(null);await connect(JSON.stringify(p.source),'ROUTED');
 }
 async function selectAave(role:'source'|'target'){
  const p=aaveRef.current;if(!p)throw Error('MOBILE_AAVE_PAIRING_INVALID');const descriptor=p[role],text=JSON.stringify(descriptor);setDescriptorText(text);setSummary(null);await connect(text,'ROUTED');const selected=requireConnection(),ticket=epoch.current;current(ticket,selected);if(JSON.stringify(selected.descriptor)!==text)throw Error('MOBILE_EXTERNAL_FLAT_CONTEXT_CHANGED');
  if(role==='target'){const value=await readStatus(selected,ticket),intent=value.jobs.find(v=>v.mode==='deposit_intent');if(intent){const t=intent.consentFields.statement;if(t.validFrom===undefined||t.validUntil===undefined)throw Error('MOBILE_AAVE_RECEPTION_REQUIRED');const w={validFrom:t.validFrom,validUntil:t.validUntil,amount:t.amount};if(aaveWindowRef.current&&JSON.stringify(aaveWindowRef.current)!==JSON.stringify(w))throw Error('MOBILE_AAVE_RECEPTION_CHANGED');aaveWindowRef.current=w;setGraphShareAmount(w.amount);setGraphValidFrom(w.validFrom);setGraphSettleBefore((BigInt(w.validUntil)+60n).toString());}}
 }
 function clearUniswap(){uniswapRef.current=null;uniswapWindowRef.current=null;setUniswapPairing(null);}
 function pairedOperation(){return uniswapRef.current??aaveRef.current??metaRef.current;}
 function pairedWindow(){return uniswapRef.current?uniswapWindowRef.current:aaveRef.current?aaveWindowRef.current:metaWindowRef.current;}
 function retainPairedReception(value:ExternalFlatStatus){
  const pairing=pairedOperation();if(!pairing||JSON.stringify(value.descriptor)!==JSON.stringify(pairing.target))return;
  const intent=value.jobs.find(row=>row.mode==='deposit_intent'&&['PROVED','DELIVERY_UNKNOWN','CONFIRMED'].includes(row.stage));if(!intent)return;
  const statement=intent.consentFields.statement;if(statement.validFrom===undefined||statement.validUntil===undefined)throw Error('MOBILE_DEFI_RECEPTION_REQUIRED');
  const window={validFrom:statement.validFrom,validUntil:statement.validUntil,amount:statement.amount},previous=pairedWindow();
  if(previous&&JSON.stringify(previous)!==JSON.stringify(window))throw Error('MOBILE_DEFI_RECEPTION_CHANGED');
  if(uniswapRef.current)uniswapWindowRef.current=window;else if(aaveRef.current)aaveWindowRef.current=window;else metaWindowRef.current=window;
  setGraphShareAmount(window.amount);setGraphValidFrom(window.validFrom);setGraphSettleBefore((BigInt(window.validUntil)+60n).toString());
 }
 async function selectPairedRole(role:'source'|'target'){
  if(uniswapRef.current)return selectUniswap(role);if(aaveRef.current)return selectAave(role);if(metaRef.current)return selectMeta(role);
  throw Error('MOBILE_DEFI_PAIRING_REQUIRED');
 }
 async function importPublicFlowConnection(){
  const ticket=epoch.current,text=await readDeviceExternalFlatConnectionClipboardV1();
  if(!mounted.current||epoch.current!==ticket||AppState.currentState!=='active')return;
  setFlowConnectionText(text);await loadFlowConnection(text);
 }
 async function loadFlowConnection(rawText=flowConnectionText){
  if(rawText.length===0||rawText.length>32768)throw Error('MOBILE_DEFI_CONNECTION_INVALID');
  let packet=JSON.parse(rawText);publicTls.current=null;setTlsDisplay(null);
  if(packet?.format==='DEVICE_EXTERNAL_FLAT_CONNECTION_V1'){
   if(connectionRegistry)normalizePublicWalletConnectionV1(rawText,connectionRegistry.devicePublicKey);
   const profile=externalFlatExactV1(packet,['format','pairing','transport']),transport=externalFlatExactV1(profile.transport,['type','certificatePEM','certificateSHA256']);
   if(transport.type!=='ANDROID_PINNED_TLS_V1'||typeof transport.certificatePEM!=='string'||transport.certificatePEM.length===0||transport.certificatePEM.length>16384||typeof transport.certificateSHA256!=='string'||!/^[0-9a-f]{64}$/.test(transport.certificateSHA256))throw Error('MOBILE_DEFI_CONNECTION_INVALID');
   packet=profile.pairing;const paired=['DEVICE_EXTERNAL_FLAT_UNISWAP_PAIRING_V1','DEVICE_EXTERNAL_FLAT_AAVE_PAIRING_V1','DEVICE_EXTERNAL_FLAT_METAMORPHO_UNDERLYING_PAIRING_V2'].includes(packet?.profile),descriptor=normalizeExternalFlatDescriptorV1(paired?packet.source:packet);
   if(paired){const target=normalizeExternalFlatDescriptorV1(packet.target);if(target.origin!==descriptor.origin||target.devicePublicKey!==descriptor.devicePublicKey)throw Error('MOBILE_DEFI_CONNECTION_INVALID');}
   publicTls.current={origin:descriptor.origin,devicePublicKey:descriptor.devicePublicKey,certificatePEM:transport.certificatePEM,certificateSHA256:transport.certificateSHA256};setTlsDisplay({origin:descriptor.origin,certificateSHA256:transport.certificateSHA256});
  }
  const pairingText=JSON.stringify(packet);setOperationGoal('CONVERT');
  if(packet?.profile==='DEVICE_EXTERNAL_FLAT_UNISWAP_PAIRING_V1'){setUniswapText(pairingText);await loadUniswap(pairingText);knownConnections.current.UNISWAP=rawText;retainedDefiConnections.current=rawText;retainedDefiConnections.protocol='UNISWAP';setSelectedProtocol('UNISWAP');setSettingsOpen(false);await rememberPublicConnection(rawText);return;}
  if(packet?.profile==='DEVICE_EXTERNAL_FLAT_AAVE_PAIRING_V1'){setAaveText(pairingText);await loadAave(pairingText);knownConnections.current.AAVE=rawText;retainedDefiConnections.current=rawText;retainedDefiConnections.protocol='AAVE';setSelectedProtocol('AAVE');setSettingsOpen(false);await rememberPublicConnection(rawText);return;}
  if(packet?.profile==='DEVICE_EXTERNAL_FLAT_METAMORPHO_UNDERLYING_PAIRING_V2'){setMetaText(pairingText);await loadMeta(pairingText);knownConnections.current.MORPHO=rawText;retainedDefiConnections.current=rawText;retainedDefiConnections.protocol='MORPHO';setSelectedProtocol('MORPHO');setSettingsOpen(false);await rememberPublicConnection(rawText);return;}
  const descriptor=normalizeExternalFlatDescriptorV1(packet);setOperationGoal('WITHDRAW');clearMeta();clearMetaFour();clearAave();clearUniswap();setDescriptorText(JSON.stringify(descriptor));setCustodyRoute('ROUTED');setSummary(null);await connect(JSON.stringify(descriptor),'ROUTED');retainedDefiConnections.current=rawText;setSettingsOpen(false);await rememberPublicConnection(rawText);
 }
 async function rememberPublicConnection(text:string){if(connectionRegistry&&JSON.parse(text)?.format==='DEVICE_EXTERNAL_FLAT_CONNECTION_V1')await connectionRegistry.remember(text,{select:selectConnectionRef.current});}
 async function openRegisteredConnection(request:ExternalConnectionRequestV1){
  const entry=normalizePublicWalletConnectionV1(request.profile,connectionRegistry?.devicePublicKey);if(entry.kind!=='EXTERNAL_FLAT'||request.route&&!publicWalletConnectionMatchesRouteV1(entry,request.route))throw Error('MOBILE_DEFI_CONNECTION_INVALID');
  if(request.reception&&(entry.descriptors.length!==1||entry.descriptors[0].profile!==DEVICE_EXTERNAL_FLAT_SHARE_V1||Object.keys(request.reception).sort().join(',')!=='commitment,jobId,rootId'||Object.values(request.reception).some(value=>!/^[0-9a-f]{64}$/.test(value))))throw Error('MOBILE_EXTERNAL_FLAT_RECEPTION_BINDING');
  receptionRequestRef.current=request.reception??null;
  try{setFlowConnectionText(entry.profile);await loadFlowConnection(entry.profile);}finally{receptionRequestRef.current=null;}
  if(request.route){const selected=entry.descriptors.find(descriptor=>descriptor.pairingId===request.route!.pairingId&&descriptor.poolTerms.pool===request.route!.pool);if(!selected)throw Error('MOBILE_DEFI_CONNECTION_INVALID');if(entry.descriptors.length===2&&selected===entry.descriptors[1])await selectPairedRole('target');setOperationGoal('WITHDRAW');}
 }
 async function chooseProtocol(protocol:'UNISWAP'|'AAVE'|'MORPHO'){
  if(protocol===selectedProtocol&&connected)return;
  setSelectedProtocol(protocol);const saved=knownConnections.current[protocol];if(saved){setFlowConnectionText(saved);await loadFlowConnection(saved);return;}
  await closeConnection();clearMeta();clearMetaFour();clearAave();clearUniswap();publicTls.current=null;setTlsDisplay(null);setSummary(null);setFlowConnectionText('');setSettingsOpen(true);setNotice('Importa la conexión de '+(protocol==='MORPHO'?'Morpho':protocol==='AAVE'?'Aave':'Uniswap')+' para abrir ese servicio.');
 }
 function flowDecision(selected:Connection,local:DeviceExternalFlatSummary,note:ExternalFlatStatus|null,graph:GraphStatus|null):DeviceDefiOperationDecisionV1{
  const pairing=pairedOperation(),role=pairing?(JSON.stringify(selected.descriptor)===JSON.stringify(pairing.source)?'SOURCE':'DESTINATION'):'NOTE';
  return nextDeviceDefiOperationV1({descriptor:selected.descriptor,noteStatus:note,graphStatus:graph,goal:operationGoal,role,hasDestination:Boolean(pairing),destinationAuthorized:pairedWindow()!==null,notePending:local.pending,graphPending:local.graph?.pending??null,outputPending:local.graph?.withdrawalPending??[]});
 }
 /** Prepare the next original permission from the same durable operation. This
  * never signs or submits the next spend; the review remains visible to its owner. */
 async function openNextFlowReview(){
  if(advanced)return;
  const selected=requireConnection(),ticket=epoch.current,local=await selected.vault.summary();current(ticket,selected);
  let note:ExternalFlatStatus|null=null,graph:GraphStatus|null=null;
  if(local.graph!==null){graph=await readGraphStatus(selected,ticket);if(graph.jobs.length===0&&!selected.noteClosed)note=await readStatus(selected,ticket);}else note=await readStatus(selected,ticket);
  const nextLocal=await selected.vault.summary();current(ticket,selected);const step=flowDecision(selected,nextLocal,note,graph);
  setNotice(step.kind==='SETTLED'?step.label:'Paso completado. '+step.label+'.');
 }
 async function continueFlow(){
  const selected=requireConnection();clearReview();const ticket=epoch.current,local=await selected.vault.summary();current(ticket,selected);
  let note:ExternalFlatStatus|null=null,graph:GraphStatus|null=null;
  if(local.graph!==null){graph=await readGraphStatus(selected,ticket);if(graph.jobs.length===0&&!selected.noteClosed)note=await readStatus(selected,ticket);}else note=await readStatus(selected,ticket);
  const updated=await selected.vault.summary();current(ticket,selected);const step=flowDecision(selected,updated,note,graph);
  if(step.kind==='NOTE_ACTION')return requestAction(step.action as ExternalFlatAction);
  if(step.kind==='GRAPH_ACTION')return requestGraphAction(step.action as GraphAction);
  if(step.kind==='OUTPUT_ACTION')return requestGraphOutput(step.noteRole as GraphOutputRole,step.action as GraphOutputAction);
  if(step.kind==='OPEN_SOURCE')return selectPairedRole('source');
  if(step.kind==='OPEN_DESTINATION')return selectPairedRole('target');
  if(step.kind==='PREPARE_DEPOSIT')return prepareDeposit();
  if(step.kind==='PREPARE_GRAPH')return prepareGraph();
  if(step.kind==='PREPARE_WITHDRAWAL')return prepareWithdrawal();
  if(step.kind==='PREPARE_OUTPUT_WITHDRAWAL')return prepareGraphOutput(step.noteRole as GraphOutputRole);
  setNotice(step.kind==='SETTLED'?step.label:'Estado original consultado. Si sigue pendiente, consulta esta misma operación.');
 }
 async function loadUniswap(rawText=uniswapText){
  const p=parseUniswapPairing(rawText),ticket=epoch.current,key=await readDevicePublicKey();if(!mounted.current||epoch.current!==ticket||AppState.currentState!=='active')throw Error('MOBILE_EXTERNAL_FLAT_CONTEXT_CHANGED');if(key!==p.source.devicePublicKey)throw Error('MOBILE_EXTERNAL_FLAT_DEVICE_REQUIRED');const drain=closeConnection(),held=epoch.current;await drain;if(!mounted.current||epoch.current!==held||AppState.currentState!=='active')throw Error('MOBILE_EXTERNAL_FLAT_CONTEXT_CHANGED');clearMeta();clearMetaFour();clearAave();clearUniswap();uniswapRef.current=p;setUniswapPairing(p);setCustodyRoute('ROUTED');setGraphValidFrom('');setGraphSettleBefore('');setDescriptorText(JSON.stringify(p.source));setSummary(null);await connect(JSON.stringify(p.source),'ROUTED');
 }
 async function selectUniswap(role:'source'|'target'){
  const p=uniswapRef.current;if(!p)throw Error('MOBILE_UNISWAP_PAIRING_INVALID');const descriptor=p[role],text=JSON.stringify(descriptor);setDescriptorText(text);setSummary(null);await connect(text,'ROUTED');const selected=requireConnection(),ticket=epoch.current;current(ticket,selected);if(JSON.stringify(selected.descriptor)!==text)throw Error('MOBILE_EXTERNAL_FLAT_CONTEXT_CHANGED');
  if(role==='target'){const value=await readStatus(selected,ticket),intent=value.jobs.find(v=>v.mode==='deposit_intent');if(intent){const t=intent.consentFields.statement;if(t.validFrom===undefined||t.validUntil===undefined)throw Error('MOBILE_UNISWAP_RECEPTION_REQUIRED');const w={validFrom:t.validFrom,validUntil:t.validUntil,amount:t.amount};if(uniswapWindowRef.current&&JSON.stringify(uniswapWindowRef.current)!==JSON.stringify(w))throw Error('MOBILE_UNISWAP_RECEPTION_CHANGED');uniswapWindowRef.current=w;setGraphShareAmount(w.amount);setGraphValidFrom(w.validFrom);setGraphSettleBefore((BigInt(w.validUntil)+60n).toString());}}
 }
 async function loadMetaFour(){
  const pairing=parseMetaFourPairing(metaFourText),ticket=epoch.current,key=await readDevicePublicKey();
  if(!mounted.current||epoch.current!==ticket||AppState.currentState!=='active')throw Error('MOBILE_EXTERNAL_FLAT_CONTEXT_CHANGED');
  if(key!==pairing.source.devicePublicKey)throw Error('MOBILE_EXTERNAL_FLAT_DEVICE_REQUIRED');
  const drain=closeConnection(),held=epoch.current;await drain;if(!mounted.current||epoch.current!==held||AppState.currentState!=='active')throw Error('MOBILE_EXTERNAL_FLAT_CONTEXT_CHANGED');clearMeta();clearMetaFour();clearAave();clearUniswap();metaFourRef.current=pairing;setMetaFour(pairing);
  setGraphAssetAmount('400');setGraphShareAmount('400');setGraphPayoutAmount('400');setGraphValidFrom('');setGraphSettleBefore('');setDescriptorText(JSON.stringify(pairing.source));setSummary(null);await connect(JSON.stringify(pairing.source));
 }
 async function selectMetaFour(slot:number){
  const pairing=metaFourRef.current;if(!pairing||!Number.isInteger(slot)||slot< -1||slot>3)throw Error('MOBILE_META_FOUR_PAIRING_INVALID');
  const descriptor=slot===-1?pairing.source:pairing.targets[slot],text=JSON.stringify(descriptor);setDescriptorText(text);setSummary(null);await connect(text);
 }
 useEffect(()=>{if(!active)void closeConnection();},[active]);
 useEffect(()=>{if(!active||!connectionRegistry)return;let cancelled=false;void(async()=>{const rows=await connectionRegistry.list();for(const row of rows)if(row.kind==='EXTERNAL_FLAT'&&row.protocol)knownConnections.current[row.protocol]=row.profile;const selected=await connectionRegistry.selected('EXTERNAL_FLAT');if(cancelled)return;if(selected){if(selected.protocol)setSelectedProtocol(selected.protocol);if(!connection.current)setFlowConnectionText(selected.profile);}})().catch(()=>{if(!cancelled){setNoticeError(true);setNotice('La conexión guardada no pudo validarse. Importa de nuevo su perfil público.');}});return()=>{cancelled=true;};},[active,connectionRegistry]);
 useEffect(()=>{if(active&&connectionRequest&&!busyRef.current&&connectionRequestSeen.current!==connectionRequest.requestId){const request=connectionRequest;connectionRequestSeen.current=request.requestId;let ok=false;void run(async()=>{selectConnectionRef.current=request.select!==false;try{await openRegisteredConnection(request);ok=true;}finally{selectConnectionRef.current=true;}}).finally(()=>onConnectionRead?.(request.requestId,ok));}},[active,connectionRequest,busy]);
 useEffect(()=>{mounted.current=true;const sub=AppState.addEventListener('change',value=>{if(value==='background'){
  closeConnection();setMetaFourReads([null,null,null,null]);setNotice('Conexión cerrada. La nota y las operaciones pendientes se conservan en el dispositivo.');
 }});return()=>{mounted.current=false;closeConnection();sub.remove();};},[]);
 useEffect(()=>{if(!review)return;const selected=reviewRef.current,timer=setTimeout(()=>{if(mounted.current&&reviewRef.current===selected){
  clearReview();setNotice('Permiso caducado. Solicita una nueva revisión de la operación.');
 }},Math.max(0,review.expiresAt-Date.now()));return()=>clearTimeout(timer);},[review]);
 useEffect(()=>{if(!graphReview)return;const selected=graphReviewRef.current,timer=setTimeout(()=>{if(mounted.current&&graphReviewRef.current===selected){clearReview();setNotice('Permiso de reserva caducado. Solicita otra revisión de la misma operación.');}},Math.max(0,graphReview.expiresAt-Date.now()));return()=>clearTimeout(timer);},[graphReview]);
 useEffect(()=>{if(!graphOutputReview)return;const selected=graphOutputReviewRef.current,timer=setTimeout(()=>{if(mounted.current&&graphOutputReviewRef.current===selected){clearReview();setNotice('Permiso de retirada caducado. Solicita otra revisión de la misma salida.');}},Math.max(0,graphOutputReview.consent.expiresAt-Date.now()));return()=>clearTimeout(timer);},[graphOutputReview]);
 useEffect(()=>{if(!blueReview)return;const value=blueReview,timer=setTimeout(()=>{if(mounted.current&&blueReviewRef.current===value){clearReview();setNotice('Permiso de redención caducado. Consulta el estado original antes de otra revisión.');}},Math.max(0,value.expiresAt-Date.now()));return()=>clearTimeout(timer);},[blueReview]);
 useEffect(()=>{if(!blueStatus)return;const value=blueStatus,timer=setTimeout(()=>{if(mounted.current)setBlueStatus(current=>current===value?null:current);},Math.max(0,value.expiresAt-Date.now()));return()=>clearTimeout(timer);},[blueStatus]);
 useEffect(()=>{if(!metaReview)return;const value=metaReview,timer=setTimeout(()=>{if(mounted.current&&metaReviewRef.current===value){clearReview();setNotice('Permiso de redención caducado. Consulta el estado original antes de otra revisión.');}},Math.max(0,value.expiresAt-Date.now()));return()=>clearTimeout(timer);},[metaReview]);
 useEffect(()=>{if(!metaStatus)return;const value=metaStatus,timer=setTimeout(()=>{if(mounted.current)setMetaStatus(current=>current===value?null:current);},Math.max(0,value.expiresAt-Date.now()));return()=>clearTimeout(timer);},[metaStatus]);
 useEffect(()=>{if(!aaveReview)return;const value=aaveReview,timer=setTimeout(()=>{if(mounted.current&&aaveReviewRef.current===value){clearReview();setNotice('Permiso de redención caducado. Consulta el estado original antes de otra revisión.');}},Math.max(0,value.expiresAt-Date.now()));return()=>clearTimeout(timer);},[aaveReview]);
 useEffect(()=>{if(!aaveStatus)return;const value=aaveStatus,timer=setTimeout(()=>{if(mounted.current)setAaveStatus(current=>current===value?null:current);},Math.max(0,value.expiresAt-Date.now()));return()=>clearTimeout(timer);},[aaveStatus]);
 useEffect(()=>{if(!status)return;const value=status,timer=setTimeout(()=>{if(mounted.current)setStatus(current=>current===value?null:current);},Math.max(0,status.expiresAt-Date.now()));return()=>clearTimeout(timer);},[status]);
 useEffect(()=>{if(!graphStatus)return;const value=graphStatus,timer=setTimeout(()=>{if(mounted.current)setGraphStatus((current:GraphStatus|null)=>current===value?null:current);},Math.max(0,graphStatus.expiresAt-Date.now()));return()=>clearTimeout(timer);},[graphStatus]);
 useEffect(()=>{const pending=metaFourReads.filter((v):v is ExternalFlatStatus=>v!==null&&v.expiresAt>Date.now());if(!pending.length)return;const timer=setTimeout(()=>{if(mounted.current)setMetaFourReads(previous=>previous.map(v=>v&&v.expiresAt>Date.now()?v:null));},Math.max(0,Math.min(...pending.map(v=>v.expiresAt))-Date.now()));return()=>clearTimeout(timer);},[metaFourReads]);
 async function run(work:()=>Promise<void>,failureNotice='No se ha confirmado el resultado. Vuelve a conectar y consulta la misma operación; no repitas el envío.') {
  if(busyRef.current||!activeRef.current||AppState.currentState!=='active')return;busyRef.current=true;setBusy(true);callbacks.current.onBusyChange?.(true);setNoticeError(false);
  try{await work();}catch(error){if(error instanceof Error&&(error.message==='MOBILE_EXTERNAL_FLAT_REVIEW_CANCELLED'||beforePostCancellations.current.has(error))){if(mounted.current){setNoticeError(false);setNotice('Operación cancelada. Puedes continuar la preparación guardada.');}}else{closeConnection();if(mounted.current){setNoticeError(true);setNotice(originalFlatIngressFailureMessageV3(error)??failureNotice);}}}
  finally{busyRef.current=false;callbacks.current.onBusyChange?.(false);if(mounted.current)setBusy(false);}
 }
 async function sign(selected:Connection,value:ExternalFlatConsent|Awaited<ReturnType<Client['challenge']>>,ticket:number,authorization?:object) {
  current(ticket,selected);const controller=new AbortController();signing.current=controller;
  try{const signature=await signDeviceExternalFlatPermissionV1(value,selected.descriptor.origin,selected.descriptor.pairingId,controller.signal,authorization);
   current(ticket,selected);return signature;
  }finally{if(signing.current===controller)signing.current=null;}
 }
 async function readStatus(selected:Connection,ticket:number) {
  if(selected.noteClosed)throw Error('MOBILE_EXTERNAL_FLAT_SOURCE_RESERVED');
  const access=await selected.client.challenge();current(ticket,selected);
  const signature=await sign(selected,access,ticket);let value=await selected.client.status(access,signature);current(ticket,selected);
  let local=await selected.vault.reconcileOriginalStatus(value);current(ticket,selected);
  if(selected.reception){const row=value.jobs.find(row=>row.jobId===selected.reception!.jobId);if(!row||row.mode!=='deposit_intent'||row.consentFields.rootId!==selected.reception.rootId||row.consentFields.statement.output!==selected.reception.commitment||local.rootId!==selected.reception.rootId||local.commitment!==selected.reception.commitment)throw Error('MOBILE_EXTERNAL_FLAT_RECEPTION_BINDING');}
  const signal=transportAbort.current?.signal;if(!signal)throw Error('MOBILE_EXTERNAL_FLAT_RECEPTION_BINDING');
  const observed=await observeDeviceExternalFlatReceptionV1({descriptor:selected.descriptor,status:value,summary:local,vault:selected.vault,client:selected.client,sign:consent=>sign(selected,consent,ticket),signal,assertCurrent:()=>current(ticket,selected)});current(ticket,selected);value=observed.status;local=observed.summary;
  recordMetaFourStatus(value);retainPairedReception(value);setSummary(local);setStatus(value);onObservation?.(value);return value;
 }
 function requireGraph(selected:Connection){if(!selected.graphClient)throw Error('MOBILE_EXTERNAL_FLAT_GRAPH_SOURCE_REQUIRED');return selected.graphClient;}
 async function signGraph(selected:Connection,value:GraphConsent,ticket:number,authorization?:object){
  current(ticket,selected);const controller=new AbortController();signing.current=controller;
  try{const signature=await signDeviceExternalFlatGraphPermissionV1(value,selected.descriptor.origin,selected.descriptor.pairingId,controller.signal,authorization);current(ticket,selected);return signature;}
  finally{if(signing.current===controller)signing.current=null;}
 }
 async function readGraphStatus(selected:Connection,ticket:number){
  const client=requireGraph(selected),access=await client.challenge();current(ticket,selected);const signature=await sign(selected,access,ticket);
  const value=await client.status(access,signature);current(ticket,selected);const local=await selected.vault.acceptSourceGraphStatus(value);current(ticket,selected);
  if(local.graph?.row&&local.graph.row.graph.stage!=='SOURCE_CANCELLED'){selected.client.close();selected.noteClosed=true;setStatus(null);}
  await onGraphObservation?.(value);current(ticket,selected);setSummary(local);setGraphStatus(value);
  if(local.graph?.row?.graph.stage==='SOURCE_CANCELLED')await readReleasedSource(selected,ticket);return value;
 }
 async function readReleasedSource(selected:Connection,ticket:number){
  current(ticket,selected);if(selected.noteClosed){selected.client=createDeviceExternalFlatNoteApiV1({descriptor:selected.descriptor,fetchImpl:selected.fetchImpl});selected.noteClosed=false;}
  const original=await readStatus(selected,ticket);if(original.graphClaimed)throw Error('MOBILE_EXTERNAL_FLAT_RELEASE_UNCONFIRMED');return original;
 }
 async function repairUnsubmittedReview(selected:Connection,value:Review|GraphReview|GraphOutputReview,ticket:number,armed:object){
  const repaired=await selected.vault.recoverUnsubmittedStorage(armed,value.consent);current(ticket,selected);const saved=recoveryCut.current;
  let kind:RecoveryPreparation|null=null,prepared:DeviceExternalFlatPrepared|GraphPrepared|null=null;
  if(repaired.kind==='NOTE'&&repaired.draft.action.startsWith('PROVE_')){prepared={draft:repaired.draft,witness:value.witness};preparedRef.current=prepared;if(repaired.draft.action==='PROVE_D27')kind='SHARE';}
  else if(repaired.kind==='GRAPH'&&repaired.draft.action==='PROVE_U'){prepared={draft:repaired.draft,witness:value.witness};graphPreparedRef.current=prepared;kind='GRAPH';}
  else if(repaired.kind==='OUTPUT'&&repaired.draft.draft.action==='PROVE_W39')graphOutputPreparedRef.current={draft:repaired.draft,witness:value.witness};
  // The verified repair plaintext is EXACTLY the state covered by this copy.
  // Only its ciphertext revision changed; keep its witness/connection identity.
  if(kind&&prepared){setRecoveryPreparation(kind);if(saved?.selected===selected&&saved.kind===kind&&saved.prepared.witness===value.witness&&JSON.stringify(saved.prepared.draft)===JSON.stringify(repaired.draft))recoveryCut.current={...saved,prepared,checkpoint:repaired.checkpoint};else recoveryCut.current=null;}
  else{recoveryCut.current=null;setRecoveryPreparation(null);}
  setNotice('La autorización no se envió. Se conserva la misma preparación; puedes continuar con una autorización nueva.');
 }
 async function continueUnsubmittedPreparation(){
  const selected=requireConnection(),ticket=epoch.current;
  if(graphPreparedRef.current||preparedRef.current?.draft.action==='PROVE_D27')return reviewBackedPreparation();
  const note=preparedRef.current;if(note)return makeReview(selected,note.draft,ticket,note.witness);
  const output=graphOutputPreparedRef.current;if(output)return makeGraphOutputReview(selected,output.draft,ticket,output.witness);
  throw Error('MOBILE_EXTERNAL_FLAT_PREPARATION_REQUIRED');
 }
 async function approveBeforeAccess(kind:Parameters<typeof approveWalletSessionExternalV1>[0],descriptor:ExternalFlatDescriptor,draft:unknown,signal?:AbortSignal){try{return await approveWalletSessionExternalV1(kind,descriptor,draft,signal);}catch(error){if(error instanceof Error&&error.message==='MOBILE_AUTHENTICATION_CANCELLED')beforePostCancellations.current.add(error);throw error;}}
 async function reviewLocalOperation(kind:'NOTE'|'GRAPH'|'OUTPUT'|'BLUE'|'AAVE'|'META',descriptor:ExternalFlatDescriptor,raw:any,ticket:number,selected:Connection){
  current(ticket,selected);const draft=kind==='OUTPUT'?raw.draft:raw,action=draft.action;
  if(action.startsWith('OBSERVE_')||action==='RECONCILE_GRAPH'||action==='QUOTE_W39')return;
  const pairing=pairedOperation(),converting=kind==='GRAPH'&&['PROVE_U','RESERVE_S','EXECUTE_GRAPH'].includes(action);
  const title=converting?conversionTitle(pairing,Boolean(uniswapRef.current)):kind==='GRAPH'?graphActionText[action as GraphAction]:kind==='BLUE'||kind==='AAVE'||kind==='META'?'Retirar inversión':actionText[action as ExternalFlatAction];
  const reserve=kind==='GRAPH'?summary?.graph?.recoveryAmount??null:draft.statement?.amount??null;
  const recipient=draft.recipient??selected.redemptionRecipient??summary?.recipient??null;
  const lines=[reserve!==null?(kind==='GRAPH'?'Importe reservado de origen: ':'Importe: ')+amountText(reserve,descriptor):null,converting&&pairing&&pairedWindow()?'Importe destino autorizado: '+amountText(pairedWindow()!.amount,pairing.target):kind==='GRAPH'?'Activo de destino: '+assetLabel(pairing?.target):null,converting?'La recepción se confirma al completar la operación. La comisión de red se confirma con la transacción.':null,recipient?'Dirección para tus retiradas: 0x'+recipient:null,draft.minimumAssets!==undefined?'Mínimo a recibir: '+draft.minimumAssets+' unidades mínimas del activo de origen':null].filter(Boolean).join('\n');
  const controller=new AbortController();previewAbort.current=controller;
  try{await new Promise<void>((resolve,reject)=>{let done=false;const finish=(approved:boolean)=>{if(done)return;done=true;controller.signal.removeEventListener('abort',abort);approved?resolve():reject(Error('MOBILE_EXTERNAL_FLAT_REVIEW_CANCELLED'));};const abort=()=>finish(false);controller.signal.addEventListener('abort',abort,{once:true});Alert.alert(title,lines+'\n\nConfirma estos datos para autorizar la operación.',[{text:'Cancelar',style:'cancel',onPress:()=>finish(false)},{text:'Confirmar y autorizar',onPress:()=>finish(true)}],{cancelable:false});});current(ticket,selected);}
  finally{if(previewAbort.current===controller)previewAbort.current=null;}
 }
 async function makeGraphReview(selected:Connection,draft:GraphConsent['draft'],ticket:number,witness:unknown|null){
  await reviewLocalOperation('GRAPH',selected.descriptor,draft,ticket,selected);const client=requireGraph(selected),storage=await openSubmissionStorage(selected,'GRAPH',draft,ticket);
  try{if(!(['OBSERVE_S','RECONCILE_GRAPH'].includes(draft.action))){storage.authorization=await approveBeforeAccess('GRAPH',selected.descriptor,draft,storage.controller.signal);current(ticket,selected);}const access=await client.challenge();current(ticket,selected);const signature=await sign(selected,access,ticket);
   const consent=await client.review(access,signature,draft);current(ticket,selected);graphReviewRef.current={consent,witness,storage};graphPreparedRef.current=null;setGraphReview(consent);setNotice('Comprueba el importe reservado, el activo de destino y el plazo antes de autorizar.');const ready=graphReviewRef.current;if(!ready)throw Error('MOBILE_EXTERNAL_FLAT_PERMISSION_CHANGED');await submitGraph(ready);
  }catch(error){releaseSubmissionStorage(storage);throw error;}
 }
 async function prepareGraph(){
  const selected=requireConnection();clearReview();const ticket=epoch.current,value=await readStatus(selected,ticket);if(value.graphClaimed)throw Error('MOBILE_EXTERNAL_FLAT_SOURCE_RESERVED');
  if(metaRef.current&&JSON.stringify(selected.descriptor)!==JSON.stringify(metaRef.current.source))throw Error('MOBILE_META_SOURCE_REQUIRED');
  if(aaveRef.current&&JSON.stringify(selected.descriptor)!==JSON.stringify(aaveRef.current.source))throw Error('MOBILE_AAVE_SOURCE_REQUIRED');
  if(uniswapRef.current&&JSON.stringify(selected.descriptor)!==JSON.stringify(uniswapRef.current.source))throw Error('MOBILE_UNISWAP_SOURCE_REQUIRED');
  const local=await selected.vault.summary();current(ticket,selected);const deposit=local.jobs.find(row=>row.mode==='deposit_balance');if(!deposit||deposit.stage!=='CONFIRMED')throw Error('MOBILE_EXTERNAL_FLAT_SOURCE_REQUIRED');
  const client=requireGraph(selected),access=await client.challenge();current(ticket,selected);const signature=await sign(selected,access,ticket);
  const pairing=metaFourRef.current,window=metaFourWindowRef.current;if(pairing&&(JSON.stringify(selected.descriptor)!==JSON.stringify(pairing.source)||!window))throw Error('MOBILE_META_FOUR_WINDOW_REQUIRED');
  if(metaRef.current){const w=metaWindowRef.current;if(!w||graphShareAmount!==w.amount||graphValidFrom!==w.validFrom||graphSettleBefore!==(BigInt(w.validUntil)+60n).toString())throw Error('MOBILE_META_RECEPTION_REQUIRED');}
  if(aaveRef.current){const w=aaveWindowRef.current;if(!w||graphShareAmount!==w.amount||graphValidFrom!==w.validFrom||graphSettleBefore!==(BigInt(w.validUntil)+60n).toString())throw Error('MOBILE_AAVE_RECEPTION_REQUIRED');}
  if(uniswapRef.current){const w=uniswapWindowRef.current;if(!w||graphShareAmount!==w.amount||graphValidFrom!==w.validFrom||graphSettleBefore!==(BigInt(w.validUntil)+60n).toString())throw Error('MOBILE_UNISWAP_RECEPTION_REQUIRED');}
  const sourceDecimals=selected.descriptor.assetMetadata.decimals,
   exactInput=!advanced&&!pairing&&solverInput!==''?deviceDefiAmountToAtomicV1(solverInput,sourceDecimals):graphAssetAmount,
   exactBudget=!advanced&&!pairing?(budgetInput!==''?deviceDefiAmountToAtomicV1(budgetInput,sourceDecimals):solverInput!==''?exactInput:graphPayoutAmount):graphPayoutAmount;
  const quote=await client.preparation(access,signature,{depositJobId:deposit.jobId,rootId:local.rootId,assetAmount:pairing?'400':exactInput,shareAmount:pairing?'400':graphShareAmount,payoutAmount:pairing?'400':exactBudget,validFrom:window?.validFrom??graphValidFrom,settleBefore:window?.settleBefore??graphSettleBefore});current(ticket,selected);
  if(quote.profile==='DEVICE_EXTERNAL_FLAT_GRAPH_PREPARATION_V1'){const pending=readDeviceExternalFlatGraphPreparationV1(quote);setGraphPreparationPending(true);if(pending.stage!=='PREPARING')throw Error('MOBILE_META_FOUR_PREPARATION_'+pending.stage);setNotice('La preparación de las cuatro recepciones está en curso. Consulta esta misma preparación; no se repetirán las autorizaciones de recepción.');return;}setGraphPreparationPending(false);
  if(pairing){const q=readDeviceExternalFlatGraphQuoteV1(quote).quote;if(q.proposal.nodes.length!==4||q.proposal.nodes.some((n:any,slot:number)=>n.id!==pairing.deliveries[slot].id||JSON.stringify(n.dependsOn)!==JSON.stringify(pairing.deliveries[slot].dependsOn)||n.payout.value!==pairing.deliveries[slot].payoutAmount))throw Error('MOBILE_META_FOUR_ORIGINAL_QUOTE_CHANGED');}
  const prepared=await selected.vault.prepareSourceGraph(quote);graphPreparedRef.current=prepared;current(ticket,selected);const next=await selected.vault.summary();current(ticket,selected);setSummary(next);
  setRecoveryPreparation('GRAPH');setRecoveryOpen(true);setNotice('Guarda tu copia de seguridad antes de continuar. Te permitirá recuperar estos fondos si cambias de móvil.');
 }
 async function requestGraphAction(action:GraphAction){const selected=requireConnection();clearReview();const ticket=epoch.current,draft=await selected.vault.sourceGraphDraft(action);current(ticket,selected);await makeGraphReview(selected,draft,ticket,null);}
 async function submitGraph(value:GraphReview){
  const selected=requireConnection();if(graphReviewRef.current!==value)throw Error('MOBILE_EXTERNAL_FLAT_PERMISSION_CHANGED');const ticket=epoch.current;current(ticket,selected);validateExternalFlatGraphFreshV1(value.consent);
  graphReviewRef.current=null;activeWitness.current=value.witness;setGraphReview(null);let armed:object|null=null,keepWitness=false;
  try{if(value.consent.draft.action==='PROVE_U')await verifyRecoveryCut(selected,'GRAPH',value.witness,ticket,value.storage.token!);
   armed=await selected.vault.bindSubmissionStorage(value.storage.token!,value.consent);current(ticket,selected);
   const signature=await signGraph(selected,value.consent,ticket,value.storage.authorization);if(value.consent.draft.action==='PROVE_U')await verifyRecoveryCut(selected,'GRAPH',value.witness,ticket,armed!);
   if(metaFourRef.current)setMetaFourReads([null,null,null,null]);onSourcePending?.(selected.descriptor,value.consent.draft.rootId);recoveryCut.current=null;setRecoveryPreparation(null);
   selected.client.close();selected.noteClosed=true;setStatus(null);setGraphStatus(null);current(ticket,selected);await selected.vault.consumeSubmissionArm(armed!,value.consent);
   const row=await requireGraph(selected).submit(value.consent,signature,value.witness);current(ticket,selected);const next=await selected.vault.acceptSourceGraph(row);current(ticket,selected);setSummary(next);
   if(row.graph.stage==='SOURCE_CANCELLED')await readReleasedSource(selected,ticket);
   setNotice(row.graph.stage==='SOURCE_CANCELLED'?'La reserva no enviada quedó liberada. La retirada original está disponible tras su nueva consulta.':row.graph.outcome==='FULFILLED'?'Conversión confirmada. Consulta la nota de destino en su conexión privada.':row.graph.outcome==='RECOVERED'?'Reserva recuperada. Su nota de recuperación conserva la clave en este dispositivo.':'Operación de reserva guardada. Consulta el mismo resultado antes de continuar.');
   releaseSubmissionStorage(value.storage);await openNextFlowReview();
  }catch(error){if(armed){try{await repairUnsubmittedReview(selected,value,ticket,armed);keepWitness=value.witness!==null;return;}catch{}}throw error;}
  finally{releaseSubmissionStorage(value.storage);if(!keepWitness)wipeDeviceReservationWitnessV1(value.witness);if(activeWitness.current===value.witness)activeWitness.current=null;}
 }
 async function makeGraphOutputReview(selected:Connection,draft:GraphOutputPrepared['draft'],ticket:number,witness:unknown|null){
  await reviewLocalOperation('OUTPUT',selected.descriptor,draft,ticket,selected);const client=requireGraph(selected),storage=await openSubmissionStorage(selected,'OUTPUT',draft,ticket);
  try{if(!(draft.draft.action==='OBSERVE_W39')){storage.authorization=await approveBeforeAccess('OUTPUT',selected.descriptor,draft,storage.controller.signal);current(ticket,selected);}const access=await client.challenge();current(ticket,selected);const signature=await sign(selected,access,ticket);
   const consent=await client.outputReview(access,signature,draft);current(ticket,selected);graphOutputReviewRef.current={consent,witness,storage};graphOutputPreparedRef.current=null;setGraphOutputReview(consent);setNotice('Comprueba la salida, el importe completo y la dirección fijada antes de autorizar.');const ready=graphOutputReviewRef.current;if(!ready)throw Error('MOBILE_EXTERNAL_FLAT_PERMISSION_CHANGED');await submitGraphOutput(ready);
  }catch(error){releaseSubmissionStorage(storage);throw error;}
 }
 async function prepareGraphOutput(noteRole:GraphOutputRole){
  const selected=requireConnection();clearReview();const ticket=epoch.current,fresh=await readGraphStatus(selected,ticket);
  const output=fresh.jobs[0]?.outputs.find((value:GraphOutputView)=>value.noteRole===noteRole);if(!output||output.state!=='UNSPENT'||output.available===null)throw Error('MOBILE_EXTERNAL_FLAT_OUTPUT_NOT_AVAILABLE');
  const local=await selected.vault.summary();current(ticket,selected);if(local.recipient===null)throw Error('MOBILE_EXTERNAL_FLAT_BINDING');
  const client=requireGraph(selected),access=await client.challenge();current(ticket,selected);const signature=await sign(selected,access,ticket);
  const quote=await client.outputQuote(access,signature,{noteRole,recipient:local.recipient});current(ticket,selected);
  const prepared=await selected.vault.prepareGraphOutputWithdrawal(quote);graphOutputPreparedRef.current=prepared;current(ticket,selected);
  const next=await selected.vault.summary();current(ticket,selected);setSummary(next);await makeGraphOutputReview(selected,prepared.draft,ticket,prepared.witness);
 }
 async function requestGraphOutput(noteRole:GraphOutputRole,action:GraphOutputAction){
  const selected=requireConnection();clearReview();const ticket=epoch.current,draft=await selected.vault.graphOutputDraft(noteRole,action);current(ticket,selected);await makeGraphOutputReview(selected,draft,ticket,null);
 }
 async function signGraphOutput(selected:Connection,value:GraphOutputConsent,ticket:number,authorization?:object){
  current(ticket,selected);const controller=new AbortController();signing.current=controller;
  try{const signature=await signDeviceExternalFlatGraphOutputPermissionV1(value,selected.descriptor.origin,selected.descriptor.pairingId,controller.signal,authorization);current(ticket,selected);return signature;}
  finally{if(signing.current===controller)signing.current=null;}
 }
 async function submitGraphOutput(value:GraphOutputReview){
  const selected=requireConnection();if(graphOutputReviewRef.current!==value)throw Error('MOBILE_EXTERNAL_FLAT_PERMISSION_CHANGED');const ticket=epoch.current;current(ticket,selected);validateExternalFlatFreshV1(value.consent.consent);
  graphOutputReviewRef.current=null;activeWitness.current=value.witness;setGraphOutputReview(null);let armed:object|null=null,keepWitness=false;
  try{armed=await selected.vault.bindSubmissionStorage(value.storage.token!,value.consent);current(ticket,selected);
   const signature=await signGraphOutput(selected,value.consent,ticket,value.storage.authorization);current(ticket,selected);onSourcePending?.(selected.descriptor,value.consent.consent.rootId);
   selected.client.close();selected.noteClosed=true;setStatus(null);setGraphStatus(null);current(ticket,selected);await selected.vault.consumeSubmissionArm(armed!,value.consent);
   const row=await requireGraph(selected).outputSubmit(value.consent,signature,value.witness);current(ticket,selected);const next=await selected.vault.acceptGraphOutput(row);current(ticket,selected);setSummary(next);
   await readGraphStatus(selected,ticket);setNotice(row.row.stage==='CONFIRMED'?'Retirada de la salida confirmada en su dirección fijada.':row.row.stage==='PROVED'?'Prueba de retirada guardada. Revisa el envío de esta misma salida.':'Retirada pendiente. Consulta esta misma operación antes de continuar.');releaseSubmissionStorage(value.storage);await openNextFlowReview();
  }catch(error){if(armed){try{await repairUnsubmittedReview(selected,value,ticket,armed);keepWitness=value.witness!==null;return;}catch{}}throw error;}
  finally{releaseSubmissionStorage(value.storage);if(!keepWitness)externalFlatWipeV1(value.witness);if(activeWitness.current===value.witness)activeWitness.current=null;}
 }
 function confirmGraphOutputReview(){const value=graphOutputReviewRef.current;if(!value||busyRef.current)return;const consent=value.consent.consent;Alert.alert(consent.action==='PROVE_W39'?'Probar retirada del '+graphOutputRoleText[value.consent.noteRole].toLowerCase():consent.action==='WITHDRAW_W39'?'Retirar el '+graphOutputRoleText[value.consent.noteRole].toLowerCase():'Consultar la misma retirada',consent.action==='PROVE_W39'
  ?'La apertura de esta salida se enviará al trabajador temporal para probar su retirada completa. La dirección fijada se conserva; el envío requiere otra autorización.'
  :'Autoriza sólo la operación y la dirección mostradas. Si falta la respuesta, consulta la misma retirada antes de actuar.',[{text:'Cancelar',style:'cancel',onPress:clearReview},{text:'Confirmar',onPress:()=>{void run(()=>submitGraphOutput(value));}}],{cancelable:false});}
 function confirmGraphOutputPreparation(noteRole:GraphOutputRole){if(busyRef.current)return;Alert.alert('Preparar retirada del '+graphOutputRoleText[noteRole].toLowerCase(),'Se comprobará el estado original de esta salida y su importe completo. Conserva su propia apertura y la dirección de retirada fijada al crear la nota.',[{text:'Cancelar',style:'cancel'},{text:'Continuar',onPress:()=>{void run(()=>prepareGraphOutput(noteRole));}}],{cancelable:false});}
 function confirmGraphReview(){const value=graphReviewRef.current;if(!value||busyRef.current)return;Alert.alert(graphActionText[value.consent.draft.action],value.consent.draft.action==='PROVE_U'
  ?'La apertura de esta nota se enviará al trabajador temporal para probar la reserva. El cambio y la recuperación conservan sus claves en este dispositivo. Cada envío posterior requiere otra autorización.'
  :'Autoriza sólo la operación y el plazo mostrados. Si falta la respuesta, consulta la misma operación antes de actuar.',[{text:'Cancelar',style:'cancel',onPress:clearReview},{text:'Confirmar',onPress:()=>{void run(()=>submitGraph(value));}}],{cancelable:false});}
 function confirmGraphPreparation(){if(busyRef.current)return;Alert.alert('Preparar conversión privada','Debes haber autorizado la recepción de las participaciones en su conexión privada. Esta preparación usa esos importes y ese plazo originales; todavía no envía la reserva.',[{text:'Cancelar',style:'cancel'},{text:'Continuar',onPress:()=>{void run(prepareGraph);}}],{cancelable:false});}
 // Original signed READ fixes the holder before any D27 opening. This
 // projection is never a note balance or a replacement economic permission.
 function retainRedemptionRecipient(selected:Connection,value:DeviceMorphoBlueStatusV1|DeviceMetaMorphoStatusV2|DeviceAaveStaticStatusV1,ticket:number){
  current(ticket,selected);
  if((value.profile==='LIANUM_DEVICE_METAMORPHO_REDEMPTION_V2')!==Boolean(selected.metaClient)||(value.profile==='LIANUM_DEVICE_AAVE_STATIC_REDEMPTION_V1')!==Boolean(selected.aaveClient))throw Error('MOBILE_DEFI_RECIPIENT_CHANGED');
  const checked=value.profile==='LIANUM_DEVICE_METAMORPHO_REDEMPTION_V2'?readDeviceMetaMorphoRedemptionStatusV2(value):value.profile==='LIANUM_DEVICE_AAVE_STATIC_REDEMPTION_V1'?readDeviceAaveStaticRedemptionStatusV1(value):readDeviceMorphoBlueRedemptionStatusV1(value);
  if(JSON.stringify(checked.descriptor)!==JSON.stringify(selected.descriptor))throw Error('MOBILE_DEFI_RECIPIENT_CHANGED');
  if(checked.redemptionRecipient===null){selected.redemptionRecipient=null;return;}
  const paired=selected.metaClient?(metaRef.current?.redemptionRecipient??metaFourRef.current?.redemptionRecipient):null;
  if(JSON.stringify(checked.descriptor)!==JSON.stringify(selected.descriptor)||selected.redemptionRecipient!==null&&selected.redemptionRecipient!==checked.redemptionRecipient||selected.metaClient&&paired!==checked.redemptionRecipient)throw Error('MOBILE_DEFI_RECIPIENT_CHANGED');
  selected.redemptionRecipient=checked.redemptionRecipient;
 }
 async function blueSign(selected:Connection,value:Parameters<typeof signDeviceMorphoBlueRedemptionPermissionV1>[0],ticket:number,authorization?:object){current(ticket,selected);const controller=new AbortController();signing.current=controller;try{const signature=await signDeviceMorphoBlueRedemptionPermissionV1(value,selected.descriptor.origin,selected.descriptor.pairingId,controller.signal,authorization);current(ticket,selected);return signature;}finally{if(signing.current===controller)signing.current=null;}}
 async function readBlueStatus(selected:Connection,ticket:number){const client=selected.blueClient;if(!client)throw Error('MOBILE_BLUE_REDEMPTION_REQUIRED');const access=await client.challenge();current(ticket,selected);const signature=await blueSign(selected,access,ticket),value=await client.status(access,signature);current(ticket,selected);retainRedemptionRecipient(selected,value,ticket);setBlueStatus(value);return value;}
 async function requestBlue(action:'REDEEM_BLUE'|'OBSERVE_BLUE'){const selected=requireConnection();clearReview();const ticket=epoch.current,shareState=await readStatus(selected,ticket),client=selected.blueClient;if(!client)throw Error('MOBILE_BLUE_REDEMPTION_REQUIRED');const withdrawal=shareState.jobs.find(r=>r.mode==='withdraw_balance'&&r.stage==='CONFIRMED');if(!withdrawal)throw Error('MOBILE_BLUE_SHARE_WITHDRAWAL_REQUIRED');const blue=await readBlueStatus(selected,ticket),previous=blue.operations.find(r=>r.withdrawalJobId===withdrawal.jobId);if(action==='REDEEM_BLUE'&&(blue.observationOnly||previous))throw Error('MOBILE_BLUE_OBSERVE_ONLY');if(action==='OBSERVE_BLUE'&&!previous)throw Error('MOBILE_BLUE_REDEMPTION_REQUIRED');const draft={action,withdrawalJobId:withdrawal.jobId,minimumAssets:previous?.minimumAssets??blueMinimum,deadline:previous?.deadline??(BigInt(shareState.observed.timestamp)+180n).toString()};await reviewLocalOperation('BLUE',selected.descriptor,draft,ticket,selected);if(action.startsWith('REDEEM_')){const controller=new AbortController();const token=await approveBeforeAccess('BLUE',selected.descriptor,draft,controller.signal);current(ticket,selected);redemptionAuthorization.current={kind:'BLUE',token,controller};}const access=await client.challenge();current(ticket,selected);const signature=await blueSign(selected,access,ticket),consent=await client.review(access,signature,draft);current(ticket,selected);blueReviewRef.current=consent;setBlueReview(consent);setNotice('Revisa la redención de participaciones. Esta operación entrega underlying público en la misma dirección.');await submitBlue(consent);}
 async function submitBlue(consent:DeviceMorphoBlueConsentV1){const selected=requireConnection(),client=selected.blueClient,ticket=epoch.current;if(!client||blueReviewRef.current!==consent)throw Error('MOBILE_BLUE_PERMISSION_CHANGED');const signature=await blueSign(selected,consent,ticket,redemptionAuthorization.current?.kind==='BLUE'?redemptionAuthorization.current.token:undefined);current(ticket,selected);blueReviewRef.current=null;setBlueReview(null);setBlueStatus(null);await client.submit(consent,signature);current(ticket,selected);await readBlueStatus(selected,ticket);setNotice('Redención consultada en el journal original. Un resultado pendiente sólo permite consultar la misma operación.');}
 function confirmBlue(){const value=blueReviewRef.current;if(!value||busyRef.current)return;Alert.alert(value.action==='REDEEM_BLUE'?'Redimir participaciones Blue':'Consultar la misma redención','La redención es pública y conserva la dirección de la retirada original. No crea un saldo privado de underlying. Si falta la respuesta, consulta la misma operación; no repitas el envío.',[{text:'Cancelar',style:'cancel',onPress:clearReview},{text:'Confirmar',onPress:()=>{void run(()=>submitBlue(value));}}],{cancelable:false});}
 async function metaSign(selected:Connection,value:Parameters<typeof signDeviceMetaMorphoRedemptionPermissionV2>[0],ticket:number,authorization?:object){current(ticket,selected);const controller=new AbortController();signing.current=controller;try{const signature=await signDeviceMetaMorphoRedemptionPermissionV2(value,selected.descriptor.origin,selected.descriptor.pairingId,controller.signal,authorization);current(ticket,selected);return signature;}finally{if(signing.current===controller)signing.current=null;}}
 async function readMetaStatus(selected:Connection,ticket:number){const client=selected.metaClient;if(!client)throw Error('MOBILE_META_REDEMPTION_REQUIRED');const access=await client.challenge();current(ticket,selected);const signature=await metaSign(selected,access,ticket),value=await client.status(access,signature);current(ticket,selected);retainRedemptionRecipient(selected,value,ticket);setMetaStatus(value);return value;}
 async function requestMeta(action:'REDEEM_META'|'OBSERVE_META'){const selected=requireConnection();clearReview();const ticket=epoch.current,shareState=await readStatus(selected,ticket),client=selected.metaClient;if(!client)throw Error('MOBILE_META_REDEMPTION_REQUIRED');const withdrawal=shareState.jobs.find(r=>r.mode==='withdraw_balance'&&r.stage==='CONFIRMED');if(!withdrawal)throw Error('MOBILE_META_SHARE_WITHDRAWAL_REQUIRED');const blue=await readMetaStatus(selected,ticket),previous=blue.operations.find(r=>r.withdrawalJobId===withdrawal.jobId);if(action==='REDEEM_META'&&(blue.observationOnly||previous))throw Error('MOBILE_META_OBSERVE_ONLY');if(action==='OBSERVE_META'&&!previous)throw Error('MOBILE_META_REDEMPTION_REQUIRED');const draft={action,withdrawalJobId:withdrawal.jobId,minimumAssets:previous?.minimumAssets??metaMinimum,deadline:previous?.deadline??(BigInt(shareState.observed.timestamp)+180n).toString()};await reviewLocalOperation('META',selected.descriptor,draft,ticket,selected);if(action.startsWith('REDEEM_')){const controller=new AbortController();const token=await approveBeforeAccess('META',selected.descriptor,draft,controller.signal);current(ticket,selected);redemptionAuthorization.current={kind:'META',token,controller};}const access=await client.challenge();current(ticket,selected);const signature=await metaSign(selected,access,ticket),consent=await client.review(access,signature,draft);current(ticket,selected);metaReviewRef.current=consent;setMetaReview(consent);setNotice('Revisa la redención de participaciones. Esta operación entrega underlying público en la misma dirección.');await submitMeta(consent);}
 async function submitMeta(consent:DeviceMetaMorphoConsentV2){const selected=requireConnection(),client=selected.metaClient,ticket=epoch.current;if(!client||metaReviewRef.current!==consent)throw Error('MOBILE_META_PERMISSION_CHANGED');const signature=await metaSign(selected,consent,ticket,redemptionAuthorization.current?.kind==='META'?redemptionAuthorization.current.token:undefined);current(ticket,selected);metaReviewRef.current=null;setMetaReview(null);setMetaStatus(null);await client.submit(consent,signature);current(ticket,selected);await readMetaStatus(selected,ticket);setNotice('Redención consultada en el journal original. Un resultado pendiente sólo permite consultar la misma operación.');}
 function confirmMeta(){const value=metaReviewRef.current;if(!value||busyRef.current)return;Alert.alert(value.action==='REDEEM_META'?'Redimir participaciones Meta':'Consultar la misma redención','La redención es pública y conserva la dirección de la retirada original. No crea un saldo privado de underlying. Si falta la respuesta, consulta la misma operación; no repitas el envío.',[{text:'Cancelar',style:'cancel',onPress:clearReview},{text:'Confirmar',onPress:()=>{void run(()=>submitMeta(value));}}],{cancelable:false});}
 async function aaveSign(selected:Connection,value:Parameters<typeof signDeviceAaveStaticRedemptionPermissionV1>[0],ticket:number,authorization?:object){current(ticket,selected);const controller=new AbortController();signing.current=controller;try{const signature=await signDeviceAaveStaticRedemptionPermissionV1(value,selected.descriptor.origin,selected.descriptor.pairingId,controller.signal,authorization);current(ticket,selected);return signature;}finally{if(signing.current===controller)signing.current=null;}}
 async function readAaveStatus(selected:Connection,ticket:number){const client=selected.aaveClient;if(!client)throw Error('MOBILE_AAVE_REDEMPTION_REQUIRED');const access=await client.challenge();current(ticket,selected);const signature=await aaveSign(selected,access,ticket),value=await client.status(access,signature);current(ticket,selected);retainRedemptionRecipient(selected,value,ticket);setAaveStatus(value);return value;}
 async function requestAave(action:'REDEEM_AAVE'|'OBSERVE_AAVE'){const selected=requireConnection();clearReview();const ticket=epoch.current,shareState=await readStatus(selected,ticket),client=selected.aaveClient;if(!client)throw Error('MOBILE_AAVE_REDEMPTION_REQUIRED');const withdrawal=shareState.jobs.find(r=>r.mode==='withdraw_balance'&&r.stage==='CONFIRMED');if(!withdrawal)throw Error('MOBILE_AAVE_SHARE_WITHDRAWAL_REQUIRED');const blue=await readAaveStatus(selected,ticket),previous=blue.operations.find(r=>r.withdrawalJobId===withdrawal.jobId);if(action==='REDEEM_AAVE'&&(blue.observationOnly||previous))throw Error('MOBILE_AAVE_OBSERVE_ONLY');if(action==='OBSERVE_AAVE'&&!previous)throw Error('MOBILE_AAVE_REDEMPTION_REQUIRED');const draft={action,withdrawalJobId:withdrawal.jobId,minimumAssets:previous?.minimumAssets??aaveMinimum,deadline:previous?.deadline??(BigInt(shareState.observed.timestamp)+180n).toString()};await reviewLocalOperation('AAVE',selected.descriptor,draft,ticket,selected);if(action.startsWith('REDEEM_')){const controller=new AbortController();const token=await approveBeforeAccess('AAVE',selected.descriptor,draft,controller.signal);current(ticket,selected);redemptionAuthorization.current={kind:'AAVE',token,controller};}const access=await client.challenge();current(ticket,selected);const signature=await aaveSign(selected,access,ticket),consent=await client.review(access,signature,draft);current(ticket,selected);aaveReviewRef.current=consent;setAaveReview(consent);setNotice('Revisa la redención de participaciones. Esta operación entrega underlying público en la misma dirección.');await submitAave(consent);}
 async function submitAave(consent:DeviceAaveStaticConsentV1){const selected=requireConnection(),client=selected.aaveClient,ticket=epoch.current;if(!client||aaveReviewRef.current!==consent)throw Error('MOBILE_AAVE_PERMISSION_CHANGED');const signature=await aaveSign(selected,consent,ticket,redemptionAuthorization.current?.kind==='AAVE'?redemptionAuthorization.current.token:undefined);current(ticket,selected);aaveReviewRef.current=null;setAaveReview(null);setAaveStatus(null);await client.submit(consent,signature);current(ticket,selected);await readAaveStatus(selected,ticket);setNotice('Redención consultada en el journal original. Un resultado pendiente sólo permite consultar la misma operación.');}
 function confirmAave(){const value=aaveReviewRef.current;if(!value||busyRef.current)return;Alert.alert(value.action==='REDEEM_AAVE'?'Redimir participaciones Aave':'Consultar la misma redención','La redención es pública y conserva la dirección de la retirada original. No crea un saldo privado de underlying. Si falta la respuesta, consulta la misma operación; no repitas el envío.',[{text:'Cancelar',style:'cancel',onPress:clearReview},{text:'Confirmar',onPress:()=>{void run(()=>submitAave(value));}}],{cancelable:false});}
 async function connect(rawDescriptor:string=descriptorText,route?:'LEGACY'|'ROUTED') {
  const drain=closeConnection(),ticket=epoch.current;await drain;if(!mounted.current||epoch.current!==ticket||AppState.currentState!=='active')return;
  const descriptor=normalizeExternalFlatDescriptorV1(JSON.parse(rawDescriptor)),key=await readDevicePublicKey();
  if(!mounted.current||epoch.current!==ticket||AppState.currentState!=='active')return;
  if(key===null||key!==descriptor.devicePublicKey)throw Error('MOBILE_EXTERNAL_FLAT_DEVICE_REQUIRED');
  const binding=publicTls.current;if(binding&&(binding.origin!==descriptor.origin||binding.devicePublicKey!==descriptor.devicePublicKey))throw Error('MOBILE_DEFI_TLS_BINDING_CHANGED');
  const controller=new AbortController();transportAbort.current=controller;
  const transport=binding?await createDeviceExternalFlatPinnedTransportV1({descriptor,certificatePEM:binding.certificatePEM,certificateSHA256:binding.certificateSHA256,signal:controller.signal}):null;
  if(!mounted.current||epoch.current!==ticket||AppState.currentState!=='active'){controller.abort();await transport?.close();return;}
  const fetchImpl=transport?.fetchImpl??expoFetch;
  let client:Client;try{client=createDeviceExternalFlatNoteApiV1({descriptor,fetchImpl});}catch(error){controller.abort();await transport?.close();throw error;}
  const reception=receptionRequestRef.current;
  const acquisition=reception?openExistingDeviceExternalFlatCustodyV1(descriptor):descriptor.profile===DEVICE_EXTERNAL_FLAT_SHARE_V1||(route??custodyRoute)==='ROUTED'?createDeviceExternalFlatRoutedNoteVaultV1(descriptor):createDeviceExternalFlatNoteVaultV1();acquiring.current=acquisition;let vault:Vault;
  try{vault=await acquisition;}catch(error){client.close();controller.abort();await transport?.close();throw error;}
  if(acquiring.current!==acquisition||!mounted.current||epoch.current!==ticket||AppState.currentState!=='active'){
   client.close();controller.abort();await transport?.close();await vault.close();return;
  }
  let graphClient:GraphClient|null;try{graphClient=descriptor.profile===DEVICE_EXTERNAL_FLAT_SHARE_V1?null:createDeviceExternalFlatGraphApiV1({descriptor,fetchImpl});}catch(error){client.close();controller.abort();await transport?.close();await vault.close();throw error;}
  acquiring.current=null;const selected:Connection={transport,fetchImpl,redemptionRecipient:null,metaClient:descriptor.profile===DEVICE_EXTERNAL_FLAT_SHARE_V1&&((metaRef.current&&JSON.stringify(metaRef.current.target)===JSON.stringify(descriptor))||(metaFourRef.current?.redemptionRecipient&&metaFourSlot(descriptor)>=0))?createDeviceMetaMorphoRedemptionApiV2({descriptor,fetchImpl}):null,aaveClient:descriptor.profile===DEVICE_EXTERNAL_FLAT_SHARE_V1&&aaveRef.current&&JSON.stringify(aaveRef.current.target)===JSON.stringify(descriptor)?createDeviceAaveStaticRedemptionApiV1({descriptor,fetchImpl}):null,blueClient:descriptor.profile===DEVICE_EXTERNAL_FLAT_SHARE_V1&&descriptor.assetMetadata.symbol==='OMB1'?createDeviceMorphoBlueRedemptionApiV1({descriptor,fetchImpl}):null,client,graphClient,noteClosed:false,vault,descriptor,...(reception?{reception}: {})};connection.current=selected;
  const local=await vault.summary();current(ticket,selected);
  if(local.descriptor!==null&&JSON.stringify(local.descriptor)!==JSON.stringify(descriptor))throw Error('MOBILE_EXTERNAL_FLAT_BINDING_CHANGED');
  setSummary(local);setConnected(true);const metaRecipient=metaRef.current?.redemptionRecipient??metaFourRef.current?.redemptionRecipient??null;if(selected.metaClient&&local.recipient!==null&&local.recipient!==metaRecipient)throw Error('MOBILE_META_RECIPIENT_CHANGED');setRecipient(local.recipient===null?(selected.metaClient&&metaRecipient?'0x'+metaRecipient:flowRecipient):'0x'+local.recipient);setAmount(local.amount??(metaFourRef.current?(metaFourSlot(descriptor)>=0?'100':'500'):''));
  if(metaFourRef.current)setValidUntil(metaFourWindowRef.current?.validUntil??'');
  if(local.graph!==null){if(local.recoveryFence.source)await readStatus(selected,ticket);await readGraphStatus(selected,ticket);}else await readStatus(selected,ticket);if(selected.blueClient)await readBlueStatus(selected,ticket);if(selected.aaveClient)await readAaveStatus(selected,ticket);if(selected.metaClient)await readMetaStatus(selected,ticket);if(selected.redemptionRecipient!==null){if(local.recipient!==null&&local.recipient!==selected.redemptionRecipient)throw Error('MOBILE_DEFI_RECIPIENT_CHANGED');setRecipient('0x'+selected.redemptionRecipient);}setSettingsOpen(false);setNotice('Wallet conectada. Elige el importe y revisa el siguiente paso.');
 }
 async function exportRecovery(){
  const selected=requireConnection(),sharePrepared=selected.descriptor.profile===DEVICE_EXTERNAL_FLAT_SHARE_V1&&preparedRef.current?.draft.action==='PROVE_D27'?preparedRef.current:null,graphPrepared=graphPreparedRef.current;
  if(sharePrepared)preparedRef.current=null;graphPreparedRef.current=null;clearReview();preparedRef.current=sharePrepared;graphPreparedRef.current=graphPrepared;
  const kind:RecoveryPreparation|null=graphPrepared?'GRAPH':sharePrepared?'SHARE':null,prepared=graphPrepared??sharePrepared;setRecoveryPreparation(kind);
  const ticket=epoch.current,controller=new AbortController();signing.current=controller;
  let password=recoveryPassword;setRecoveryPassword('');setRecoveryCopy('');
  try{
   const before=prepared?await selected.vault.recoveryCheckpoint():null;current(ticket,selected);
   const note=await selected.vault.exportBackup(password,selected.descriptor.devicePublicKey,controller.signal);current(ticket,selected);
   const identity=await exportDeviceIdentityBackupV1(password,selected.descriptor.devicePublicKey,controller.signal);current(ticket,selected);
   const copy=JSON.stringify({format:'LIANUM_DEVICE_NOTE_RECOVERY_PACKAGE_V1',descriptor:selected.descriptor,identityBackup:JSON.parse(identity),noteBackup:JSON.parse(note)});
   if(copy.length>196608)throw Error('MOBILE_CUSTODY_BACKUP_INVALID');
   if(prepared&&kind&&before){const after=await selected.vault.recoveryCheckpoint();current(ticket,selected);
    if(!sameRecoveryCheckpoint(before,after)||(kind==='GRAPH'?graphPreparedRef.current:preparedRef.current)!==prepared)throw Error('MOBILE_EXTERNAL_FLAT_RECOVERY_COPY_CHANGED');
    recoveryCut.current={selected,kind,prepared,checkpoint:after};
   }
   setRecoveryCopy(copy);setNotice(prepared?'Guarda esta copia completa y su contraseña fuera del dispositivo. Incluye las nuevas aperturas; una copia anterior no las recupera. Confirma que la has guardado para revisar la autorización.':'Copia cifrada de tu identidad, esta nota y sus operaciones actuales. Guárdala fuera del dispositivo junto con tu contraseña. Las aperturas creadas después requieren una copia nueva.');
  }finally{password='';if(signing.current===controller)signing.current=null;}
 }
 async function verifyRecoveryCut(selected:Connection,kind:RecoveryPreparation,witness:unknown,ticket:number,storageToken?:object){
  return verifyDeviceRecoveryCopyV1(selected,kind,witness,ticket,{readCopy:()=>recoveryCut.current,assertCurrent:current,...(storageToken?{readCheckpoint:()=>selected.vault.submissionRecoveryCheckpoint(storageToken)}:{})});
 }
 async function reviewBackedPreparation(){
  return reviewDeviceRecoveryPreparationV1(requireConnection(),epoch.current,{readCopy:()=>recoveryCut.current,assertCurrent:current,
   readGraph:()=>graphPreparedRef.current,readShare:()=>preparedRef.current,reviewGraph:makeGraphReview,reviewShare:makeReview,clearPreparation:()=>setRecoveryPreparation(null)});
 }
 function confirmBackedPreparation(){if(busyRef.current)return;Alert.alert('Confirmar copia guardada','Confirma que has guardado fuera del dispositivo esta copia completa y su contraseña. Se revisará una autorización nueva; todavía no se envía la operación.',[{text:'Cancelar',style:'cancel'},{text:'He guardado la copia',onPress:()=>{void run(reviewBackedPreparation);}}],{cancelable:false});}
 async function restoreRecovery(){
  let input=recoveryInput,password=recoveryPassword;setRecoveryInput('');setRecoveryPassword('');
  const drain=closeConnection(),ticket=epoch.current;await drain;
  if(!mounted.current||epoch.current!==ticket||AppState.currentState!=='active'){input='';password='';return;}
  const controller=new AbortController();signing.current=controller;
  try{
   if(input.length===0||input.length>196608)throw Error('MOBILE_CUSTODY_BACKUP_INVALID');
   const descriptor=normalizeExternalFlatDescriptorV1(JSON.parse(descriptorText)),packet=JSON.parse(input);
   if(!packet||Array.isArray(packet)||Object.keys(packet).sort().join(',')!=='descriptor,format,identityBackup,noteBackup'||packet.format!=='LIANUM_DEVICE_NOTE_RECOVERY_PACKAGE_V1'||JSON.stringify(normalizeExternalFlatDescriptorV1(packet.descriptor))!==JSON.stringify(descriptor))throw Error('MOBILE_CUSTODY_BACKUP_INVALID');
   await importDeviceIdentityBackupV1(JSON.stringify(packet.identityBackup),password,descriptor.devicePublicKey,controller.signal);
   if(!mounted.current||epoch.current!==ticket||AppState.currentState!=='active')throw Error('MOBILE_EXTERNAL_FLAT_CONTEXT_CHANGED');
   const acquisition=restoreDeviceExternalFlatNoteBackupV1(JSON.stringify(packet.noteBackup),password,descriptor.devicePublicKey,descriptor,controller.signal);acquiring.current=acquisition;
   const vault=await acquisition;
   try{
    if(acquiring.current!==acquisition||!mounted.current||epoch.current!==ticket||AppState.currentState!=='active')throw Error('MOBILE_EXTERNAL_FLAT_CONTEXT_CHANGED');
    const local=await vault.summary();
    if(!mounted.current||epoch.current!==ticket||AppState.currentState!=='active')throw Error('MOBILE_EXTERNAL_FLAT_CONTEXT_CHANGED');
    onSourcePending?.(descriptor,local.rootId);setCustodyRoute(local.custodyRoute);setSummary(null);setStatus(null);setGraphStatus(null);setNotice('Custodia recuperada con la misma identidad y operaciones. Conecta y consulta su estado original antes de continuar.');
   }finally{await vault.close();if(acquiring.current===acquisition)acquiring.current=null;}
  }finally{input='';password='';if(signing.current===controller)signing.current=null;}
 }
 function confirmRecoveryExport(){if(busyRef.current)return;Alert.alert('Guardar una copia de recuperación','La copia contiene tu identidad y las claves de esta nota protegidas por la contraseña indicada. Guárdala completa fuera del dispositivo.',[{text:'Cancelar',style:'cancel'},{text:'Crear con biometría',onPress:()=>{void run(exportRecovery,'No se ha creado la copia. Comprueba la contraseña y vuelve a abrir la custodia.');}}],{cancelable:false});}
 function confirmRecoveryRestore(){if(busyRef.current)return;Alert.alert('Recuperar esta custodia','Se recuperarán la misma identidad, nota y operaciones de esta conexión. Después debes consultar su estado original; la recuperación no mueve fondos.',[{text:'Cancelar',style:'cancel'},{text:'Recuperar con biometría',onPress:()=>{void run(restoreRecovery,'No se ha confirmado la recuperación. Comprueba la copia, la contraseña y la conexión original.');}}],{cancelable:false});}
 async function makeReview(selected:Connection,draft:ExternalFlatDraft,ticket:number,witness:unknown|null) {
  await reviewLocalOperation('NOTE',selected.descriptor,draft,ticket,selected);const storage=await openSubmissionStorage(selected,'NOTE',draft,ticket);
  try{if(!(draft.action.startsWith('OBSERVE_'))){storage.authorization=await approveBeforeAccess('NOTE',selected.descriptor,draft,storage.controller.signal);current(ticket,selected);}const access=await selected.client.challenge();current(ticket,selected);
   const signature=await sign(selected,access,ticket);const consent=await selected.client.review(access,signature,draft);current(ticket,selected);
   reviewRef.current={consent,witness,storage};preparedRef.current=null;setReview(consent);
   setNotice('Comprueba el activo, el importe y la dirección antes de confirmar.');const ready=reviewRef.current;if(!ready)throw Error('MOBILE_EXTERNAL_FLAT_PERMISSION_CHANGED');await submit(ready);
  }catch(error){releaseSubmissionStorage(storage);throw error;}
 }
 async function prepareDeposit() {
  const selected=requireConnection();clearReview();const ticket=epoch.current,value=await readStatus(selected,ticket);
  if(selected.blueClient)await readBlueStatus(selected,ticket);else if(selected.aaveClient)await readAaveStatus(selected,ticket);else if(selected.metaClient)await readMetaStatus(selected,ticket);current(ticket,selected);
  if((selected.blueClient||selected.aaveClient||selected.metaClient)&&selected.redemptionRecipient===null)throw Error('MOBILE_DEFI_ORIGINAL_HOLDER_REQUIRED');
  const address=/^0x[0-9a-fA-F]{40}$/.exec(recipient)?.[0]===recipient?recipient.slice(2).toLowerCase():recipient;if(selected.redemptionRecipient!==null&&address!==selected.redemptionRecipient)throw Error('MOBILE_DEFI_RECIPIENT_CHANGED');if(selected.metaClient&&address!==(metaRef.current?.redemptionRecipient??metaFourRef.current?.redemptionRecipient))throw Error('MOBILE_META_RECIPIENT_CHANGED');
  const slot=metaFourSlot(selected.descriptor),pairing=metaFourRef.current;
  if(pairing&&slot<0&&JSON.stringify(selected.descriptor)!==JSON.stringify(pairing.source))throw Error('MOBILE_META_FOUR_PAIRING_INVALID');
  if(pairing&&amount!==(slot>=0?'100':'500'))throw Error('MOBILE_META_FOUR_TARGET_CHANGED');
  if(slot>=0&&!metaFourWindowRef.current){const start=value.observed.timestamp;retainMetaFourWindow({validFrom:start,validUntil:(BigInt(start)+28740n).toString(),settleBefore:(BigInt(start)+28800n).toString()});}
  const window=slot>=0?metaFourWindowRef.current:null;
  if(window&&(BigInt(value.observed.timestamp)<BigInt(window.validFrom)||BigInt(value.observed.timestamp)>=BigInt(window.validUntil)))throw Error('MOBILE_META_FOUR_WINDOW_EXPIRED');
  const isShare=selected.descriptor.profile===DEVICE_EXTERNAL_FLAT_SHARE_V1,humanAmount=isShare?destinationInput:fundingInput,
   exactAmount=!advanced&&!pairing&&humanAmount!==''?deviceDefiAmountToAtomicV1(humanAmount,selected.descriptor.assetMetadata.decimals):amount,
   receptionWindow=!advanced&&isShare&&!pairing?(pairedWindow()??deviceDefiReceptionWindowV1(value.observed.timestamp,windowSeconds)):null,
   receptionUntil=window?.validUntil??receptionWindow?.validUntil??validUntil;
  setAmount(exactAmount);if(isShare)setValidUntil(receptionUntil);
  const prepared=await selected.vault.prepareDeposit(selected.descriptor,address,exactAmount,window?.validFrom??receptionWindow?.validFrom??value.observed.timestamp,isShare?receptionUntil:undefined);preparedRef.current=prepared;current(ticket,selected);
  const local=await selected.vault.summary();current(ticket,selected);setSummary(local);
  if(selected.descriptor.profile===DEVICE_EXTERNAL_FLAT_SHARE_V1){setRecoveryPreparation('SHARE');setRecoveryOpen(true);setNotice('Guarda tu copia de seguridad para poder recuperar el activo que vas a recibir.');}
  else await makeReview(selected,prepared.draft,ticket,prepared.witness);
 }
 async function requestAction(action:ExternalFlatAction) {
  const selected=requireConnection();clearReview();const ticket=epoch.current;
  const draft=await selected.vault.draft(action);current(ticket,selected);await makeReview(selected,draft,ticket,null);
 }
 async function prepareWithdrawal() {
  const selected=requireConnection();clearReview();const ticket=epoch.current;
  const draft=await selected.vault.draft('QUOTE_W39');current(ticket,selected);
  const access=await selected.client.challenge();current(ticket,selected);const accessSignature=await sign(selected,access,ticket);
  const consent=await selected.client.review(access,accessSignature,draft);current(ticket,selected);
  const signature=await sign(selected,consent,ticket);const reply=await selected.client.submit(consent,signature,null);current(ticket,selected);
  if(!('quote' in reply))throw Error('MOBILE_EXTERNAL_FLAT_QUOTE_REQUIRED');
  const prepared=await selected.vault.prepareWithdrawal(readDeviceExternalFlatQuoteV1(reply.quote));preparedRef.current=prepared;current(ticket,selected);
  await makeReview(selected,prepared.draft,ticket,prepared.witness);
 }
 async function submit(value:Review) {
  const selected=requireConnection();if(reviewRef.current!==value)throw Error('MOBILE_EXTERNAL_FLAT_PERMISSION_CHANGED');
  const ticket=epoch.current;current(ticket,selected);validateExternalFlatFreshV1(value.consent);
  // Persist the original reviewed operation before its final signature. The
  // one-use public CAS arm performs no protected ROOT access after signing.
  reviewRef.current=null;activeWitness.current=value.witness;setReview(null);let armed:object|null=null,keepWitness=false;
  try{if(value.consent.action==='PROVE_D27')await verifyRecoveryCut(selected,'SHARE',value.witness,ticket,value.storage.token!);
   armed=await selected.vault.bindSubmissionStorage(value.storage.token!,value.consent);current(ticket,selected);
   const signature=await sign(selected,value.consent,ticket,value.storage.authorization);if(value.consent.action==='PROVE_D27')await verifyRecoveryCut(selected,'SHARE',value.witness,ticket,armed!);
   invalidateMetaFourStatus(selected.descriptor);onSourcePending?.(selected.descriptor,value.consent.rootId);recoveryCut.current=null;setRecoveryPreparation(null);
   current(ticket,selected);await selected.vault.consumeSubmissionArm(armed!,value.consent);
   const row=await selected.client.submit(value.consent,signature,value.witness);current(ticket,selected);
   if('quote' in row)throw Error('MOBILE_EXTERNAL_FLAT_ROW_REQUIRED');
   const next=await selected.vault.accept(row);current(ticket,selected);setSummary(next);setStatus(null);
   setNotice(row.stage==='CONFIRMED'?'Operación confirmada por el servicio original.':selected.descriptor.profile===DEVICE_EXTERNAL_FLAT_SHARE_V1?'Autorización de participación guardada. Consulta su recepción; no se envían fondos desde esta nota.':'Prueba guardada. Financiar o retirar requiere una nueva autorización.');
   releaseSubmissionStorage(value.storage);await openNextFlowReview();
  }catch(error){if(armed){try{await repairUnsubmittedReview(selected,value,ticket,armed);keepWitness=value.witness!==null;return;}catch{}}throw error;}
  finally{releaseSubmissionStorage(value.storage);if(!keepWitness)externalFlatWipeV1(value.witness);if(activeWitness.current===value.witness)activeWitness.current=null;}
 }
 function confirmReview() {
  const value=reviewRef.current;if(!value||busyRef.current)return;
  const proving=value.consent.action.startsWith('PROVE_');
  Alert.alert(actionText[value.consent.action],proving
   ?'Para comprobar esta operación se enviarán sus datos privados al trabajador temporal del servicio. La clave que protege tu wallet permanece en el móvil. Este paso todavía no ingresa ni retira fondos.'
   :'Autoriza únicamente la operación y la dirección mostradas. Si se pierde la respuesta, consulta su estado; no se repetirá el envío.',[
   {text:'Cancelar',style:'cancel',onPress:clearReview},{text:'Confirmar',onPress:()=>{void run(()=>submit(value));}},
  ],{cancelable:false});
 }
 function confirmPreparation(withdrawal=false) {
  if(busyRef.current)return;Alert.alert(withdrawal?'Preparar retirada completa':'Preparar ingreso de tokens',withdrawal
   ?'Se comprobará el saldo y se preparará su retirada completa a la dirección que guardaste al ingresar. Esta consulta todavía no mueve fondos.'
   :'La dirección de retirada y el importe quedarán guardados para esta operación antes de confirmar el ingreso.',[
   {text:'Cancelar',style:'cancel'},{text:'Continuar',onPress:()=>{void run(withdrawal?prepareWithdrawal:prepareDeposit);}},
  ],{cancelable:false});
 }
 useEffect(()=>setCopyVisible(false),[recoveryCopy]);
 const deposit=summary?.jobs.find(row=>row.mode!=='withdraw_balance'),withdrawal=summary?.jobs.find(row=>row.mode==='withdraw_balance');
 const graph=summary?.graph??null,graphRow=graph?.row??null,graphPending=graph?.pending??null;
 const outputPending=graph?.withdrawalPending??[],available=summary?.storageAvailable===true,uncertain=(summary?.pending!==null&&summary?.pending!==undefined)||graphPending!==null||outputPending.length>0;
 const share=connection.current?.descriptor.profile===DEVICE_EXTERNAL_FLAT_SHARE_V1;
 const canPrepare=connected&&available&&!uncertain&&!deposit;
 const activePairing=uniswapPairing??aavePairing??metaPairing;
 const reviewing=Boolean(review||graphReview||graphOutputReview||blueReview||aaveReview||metaReview||recoveryPreparation);
 const protocolLabel=selectedProtocol==='MORPHO'?'Morpho':selectedProtocol==='AAVE'?'Aave':'Uniswap';
 const swapSelected=selectedProtocol==='UNISWAP',operationTitle=conversionTitle(activePairing,Boolean(uniswapPairing)),pairAssets=activePairing?pairedAssetLabels(activePairing):null;
 const displayTitle=connected?activePairing?operationTitle:share?'Tu activo recibido':'Tus activos':swapSelected?'Intercambiar':'Invertir';
 const hasPrepared=Boolean(preparedRef.current||graphPreparedRef.current||graphOutputPreparedRef.current);
 const hasRetainedOperation=Boolean(hasPrepared||summary?.pending||summary?.graph?.pending||summary?.graph?.withdrawalPending.length||summary?.jobs.some(row=>['PROVING','FUNDING_UNKNOWN','DELIVERY_UNKNOWN','WITHDRAWAL_UNKNOWN'].includes(row.stage))||summary?.graph?.row&&!['FULFILLED','RECOVERED','SOURCE_CANCELLED'].includes(summary.graph.row.graph.stage));
 const statusTitle=busy?'Procesando tu operación':noticeError?'Necesitamos comprobar el resultado':uncertain?'Resultado pendiente':recoveryPreparation?'Guarda tu copia de seguridad':reviewing?'Revisa y confirma':connected?'Wallet conectada':'Conecta tu wallet';
 let nextFlow:DeviceDefiOperationDecisionV1|null=null;
 if(connected&&connection.current&&summary){try{nextFlow=flowDecision(connection.current,summary,status,graphStatus);}catch{nextFlow=null;}}
 const primaryLabel=nextFlow?.kind==='PREPARE_DEPOSIT'?(share?'Revisar recepción':'Revisar ingreso'):nextFlow?.kind==='PREPARE_GRAPH'?(uniswapPairing?'Revisar intercambio':'Revisar inversión'):nextFlow?.kind==='OPEN_SOURCE'?'Continuar con el importe de entrada':nextFlow?.kind==='OPEN_DESTINATION'?(graphRow?.graph.stage==='FULFILLED'?'Ver el activo recibido':'Elegir importe a recibir'):nextFlow?.label??'Actualizar para continuar';
 const freshNote=connected&&status&&status.expiresAt>Date.now()?status:null;
 const freshGraph=connected&&graphStatus&&graphStatus.expiresAt>Date.now()?graphStatus:null;
 const readyConversion=Boolean(activePairing&&!share&&deposit?.stage==='CONFIRMED'&&(graph===null||graph.row===null));
 const nextStep=recoveryPreparation?'Guarda tu copia para continuar':hasPrepared?'Continúa tu preparación guardada':uncertain?'Comprueba el resultado':primaryLabel;
 const nextStepDetail=recoveryPreparation?'La copia protege el activo que recibirás. Después revisarás la autorización.':uncertain?'Actualiza esta misma operación para saber qué se confirmó.':hasPrepared?'Conservas el importe y el destino originales. La autorización se revisa de nuevo.':undefined;
 useEffect(()=>{
  if(!active||!entryAction||entryActionSeen.current===entryAction.requestId||busyRef.current)return;
  entryActionSeen.current=entryAction.requestId;
  if(reviewing||hasRetainedOperation){setNotice('Tienes una operación preparada o pendiente. Continúa o comprueba su resultado antes de abrir otra.');return;}
  const protocol=entryAction.action==='swap'?'UNISWAP':selectedProtocol==='MORPHO'?'MORPHO':'AAVE';
  void run(()=>chooseProtocol(protocol),'No se ha abierto la conexión de tus activos. Comprueba la conexión guardada.');
 },[active,entryAction?.requestId,busy]);
 return <WalletScreenLayout title={displayTitle} subtitle="Activos privados del entorno local">
  {(!connected||activePairing||!share)&&<WalletCard title="¿Qué quieres hacer?" subtitle={swapSelected?'Entrega un activo y recibe otro. Revisarás ambos importes antes de autorizar.':'Aporta un activo y recibe participaciones. Revisarás el importe y las condiciones antes de autorizar.'}>
   <View style={styles.choices}><WalletChoice label="Intercambiar" selected={swapSelected} disabled={busy||reviewing||hasRetainedOperation||uncertain} onPress={()=>{void run(()=>chooseProtocol('UNISWAP'));}}/><WalletChoice label="Invertir" selected={!swapSelected} disabled={busy||reviewing||hasRetainedOperation||uncertain} onPress={()=>{void run(()=>chooseProtocol(selectedProtocol==='MORPHO'?'MORPHO':'AAVE'));}}/></View>
  </WalletCard>}
  <WalletStatus kind={noticeError?'error':uncertain||recoveryPreparation?'warning':'info'} title={statusTitle} detail={notice}/>
  {!connected&&<WalletCard title={swapSelected?'Abre tus activos para intercambiar':'Abre tus activos para invertir'} subtitle={flowConnectionText?'Tu conexión guardada conserva los mismos activos.':'Importa la conexión pública del ordenador. Ahí están definidos los activos disponibles en esta demo.'}>
   <WalletButton label={flowConnectionText?'Abrir conexión guardada':'Conectar mis activos'} disabled={busy||reviewing} onPress={()=>run(flowConnectionText?()=>loadFlowConnection(flowConnectionText):importPublicFlowConnection,'No se ha abierto el servicio. Comprueba su conexión y la identidad de tu wallet.')}/>
  </WalletCard>}
  {graphOutputReview&&<View style={styles.card}><Text style={styles.heading}>{graphOutputReview.consent.action==='PROVE_W39'?'Preparar retirada':graphOutputReview.consent.action==='WITHDRAW_W39'?'Retirar esta salida':'Consultar esta retirada'}</Text>
   <Fields values={{Salida:graphOutputRoleText[graphOutputReview.noteRole],Importe:amountText(graphOutputReview.consent.statement.amount,graphOutputReview.consent.descriptor),'Recibirás los fondos en':'0x'+graphOutputReview.consent.recipient,...(advanced?{Servicio:graphOutputReview.consent.descriptor.origin,'Operación original':graphOutputReview.consent.jobId}:{})}}/>
   <Button label="Confirmar retirada" disabled={busy} onPress={confirmGraphOutputReview}/><Button label="Cancelar revisión" disabled={busy} onPress={clearReview}/>
  </View>}
  {graphReview&&<View style={styles.card}><Text style={styles.heading}>{['PROVE_U','RESERVE_S','EXECUTE_GRAPH'].includes(graphReview.draft.action)?operationTitle:graphActionText[graphReview.draft.action]}</Text><Fields values={{'Importe reservado de origen':amountText(summary?.graph?.recoveryAmount??null,graphReview.descriptor),'Importe destino autorizado':activePairing&&pairedWindow()?amountText(pairedWindow()!.amount,activePairing.target):'Consulta la recepción autorizada','Activo de destino':pairAssets?.target??'Activo de destino',...(advanced?{Servicio:graphReview.descriptor.origin,'Vencimiento original':graphReview.draft.statement.settleBefore,'Operación original':graphReview.draft.jobId}:{})}}/><Button label="Confirmar operación" disabled={busy} onPress={confirmGraphReview}/><Button label="Cancelar revisión" disabled={busy} onPress={clearReview}/></View>}
  {review&&<View style={styles.card}><Text style={styles.heading}>{actionText[review.action]}</Text>
   <Fields values={{Importe:amountText(review.statement.amount,review.descriptor),'Dirección de retirada':'0x'+review.recipient,...(advanced?{Servicio:review.descriptor.origin,Activo:'0x'+review.descriptor.poolTerms.asset,'Contrato de la nota':'0x'+review.descriptor.poolTerms.pool,'Operación original':review.jobId}:{}),...(review.action==='PROVE_D27'?{'Inicio de recepción':String((review.statement as {validFrom:string}).validFrom),'Fin de recepción':String((review.statement as {validUntil:string}).validUntil)}:{})}}/>
   <Button label="Confirmar operación" disabled={busy} onPress={confirmReview}/><Button label="Cancelar revisión" disabled={busy} onPress={clearReview}/>
  </View>}
  {connected&&!review&&!graphReview&&!graphOutputReview&&!recoveryPreparation&&(preparedRef.current||graphPreparedRef.current||graphOutputPreparedRef.current)&&<WalletCard title={nextStep} subtitle={nextStepDetail}><Button label="Continuar con la operación preparada" disabled={busy} loading={busy} onPress={()=>{void run(continueUnsubmittedPreparation);}}/></WalletCard>}
  {(advanced||recoveryOpen||recoveryPreparation)&&<WalletCard title={recoveryPreparation?"Guarda tu copia para continuar":"Copia de seguridad"} subtitle="Guárdala fuera del móvil para recuperar estos fondos si pierdes el dispositivo.">
   {!recoveryPreparation&&<WalletButton label={recoveryOpen?'Ocultar opciones de copia':'Guardar o recuperar una copia'} tone="secondary" disabled={busy} onPress={()=>setRecoveryOpen(value=>!value)}/>}
   {(recoveryOpen||recoveryPreparation)&&<>
   <Text style={styles.muted}>Crea una copia nueva cuando prepares activos nuevos. Necesitarás el archivo completo y su contraseña para recuperarlos.</Text>
   {recoveryPreparation&&<Text style={styles.muted}>{recoveryPreparation==='GRAPH'?'Tus fondos de cambio y recuperación están preparados.':'El activo que recibirás está preparado.'} Guarda esta copia antes de confirmar.</Text>}
   <TextInput accessibilityLabel="Contraseña de la copia cifrada" style={styles.input} value={recoveryPassword} onChangeText={setRecoveryPassword} secureTextEntry autoCapitalize="none" autoCorrect={false} maxLength={1024} editable={!busy} placeholder="Contraseña de al menos 12 caracteres" placeholderTextColor="#9fb7bd"/>
   <Button label="Crear copia cifrada" disabled={busy||!connected||recoveryPassword.length<12} onPress={confirmRecoveryExport}/>
   {recoveryCopy!==''&&<><WalletStatus kind="success" title="Copia cifrada preparada" detail="Guarda el contenido completo y la contraseña fuera del móvil."/><WalletButton compact label={copyVisible?'Ocultar contenido cifrado':'Ver copia completa para guardarla'} tone="secondary" disabled={busy} onPress={()=>setCopyVisible(value=>!value)}/>{copyVisible&&<Text selectable accessibilityLabel="Copia cifrada de esta custodia ERC20" style={[styles.value,styles.copy]}>{recoveryCopy}</Text>}<Button label="Descartar esta copia de la pantalla" disabled={busy} onPress={hideRecovery}/></>}
   {recoveryPreparation&&recoveryCopy!==''&&recoveryCut.current&&<Button label="He guardado la copia; revisar autorización" disabled={busy} onPress={confirmBackedPreparation}/>}
   {!recoveryPreparation&&<><TextInput accessibilityLabel="Copia cifrada de recuperación de la nota" style={[styles.input,styles.descriptor]} value={recoveryInput} onChangeText={setRecoveryInput} secureTextEntry autoCapitalize="none" autoCorrect={false} maxLength={196608} editable={!busy} placeholder="Pega tu copia cifrada" placeholderTextColor="#9fb7bd"/>
   <Button label="Recuperar fondos desde una copia" disabled={busy||recoveryInput.length===0||recoveryPassword.length<12||descriptorText.length===0} onPress={confirmRecoveryRestore}/></>}
   </>}
  </WalletCard>}
  {connected&&!advanced&&<WalletCard title={recoveryPreparation?'Preparación guardada':activePairing?operationTitle:share?(freshNote?.note?.state==='LIVE'?'Activo recibido':'Recibir un activo'):'Preparar tus activos'} subtitle={nextStepDetail}>
   {!reviewing&&<Text style={styles.step}>{nextStep}</Text>}
   <Fields values={pairAssets?{'Activo de origen':pairAssets.source,'Activo de destino':pairAssets.target}:{Activo:assetLabel(connection.current?.descriptor)}}/>
   {connection.current?.descriptor.assetMetadata.symbol==='PALT'&&<Text style={styles.muted}>PALT es un token de demostración del entorno local.</Text>}
   {canPrepare&&<>
    <WalletField label="Dirección para recibir tus retiradas" value={recipient} editable={!busy&&connection.current?.redemptionRecipient===null&&summary?.recipient===null} onChangeText={value=>{setRecipient(value);setFlowRecipient(value);}} help="La dirección queda guardada para esta operación. Revísala antes de continuar."/>
    <WalletField label={(share?'Importe de destino que recibirás':'Importe de origen a ingresar')+' ('+connection.current?.descriptor.assetMetadata.symbol+')'} value={share?destinationInput:fundingInput} keyboardType="decimal-pad" editable={!busy&&!metaFour} onChangeText={share?setDestinationInput:setFundingInput} placeholder="0.00"/>
    {share&&<><Text style={styles.label}>Plazo para recibir el activo</Text>{([{seconds:900,label:'15 minutos'},{seconds:3600,label:'1 hora'},{seconds:28800,label:'8 horas'}] as const).map(option=><Button key={option.seconds} label={(windowSeconds===option.seconds?'✓ ':'')+option.label} disabled={busy||pairedWindow()!==null} onPress={()=>setWindowSeconds(option.seconds)}/>)}<Text style={styles.muted}>El importe y el plazo quedarán fijados cuando autorices esta recepción.</Text></>}
   </>}
   {readyConversion&&activePairing&&<>
    <WalletField label={'Importe máximo de origen ('+activePairing.source.assetMetadata.symbol+')'} value={solverInput} keyboardType="decimal-pad" editable={!busy&&!reviewing&&!uncertain} onChangeText={setSolverInput} placeholder="0.00"/>
    <WalletField label={'Importe a reservar ('+activePairing.source.assetMetadata.symbol+')'} value={budgetInput} keyboardType="decimal-pad" editable={!busy&&!reviewing&&!uncertain} onChangeText={setBudgetInput} placeholder="Igual al importe máximo" help="Este importe se reserva mientras se completa la conversión."/>
    {pairedWindow()&&<Fields values={{'Importe destino autorizado':amountText(pairedWindow()!.amount,activePairing.target)}}/>}
   </>}
   {(readyConversion||graphRow)&&<WalletStatus kind="info" title="Resultado y coste" detail={(pairedWindow()&&activePairing?(freshGraph&&graphRow?.graph.stage==='FULFILLED'?'Recepción prevista: ':'Recibirás ')+amountText(pairedWindow()!.amount,activePairing.target)+'. ':'')+(freshGraph&&graphRow?.graph.stage==='FULFILLED'?'La operación está confirmada. Consulta el activo de destino para ver su saldo.':'La reserva mantiene fondos bloqueados mientras se confirma la operación.')+' La comisión de red se confirma con la transacción.'}/>}
   {!recoveryPreparation&&!hasPrepared&&nextFlow?.kind!=='SETTLED'&&<Button label={primaryLabel} disabled={busy||reviewing||!available} loading={busy} onPress={()=>{void run(continueFlow);}}/>}
   {reviewing&&<Text style={styles.muted}>{recoveryPreparation?'Guarda la copia de seguridad para continuar.':'Comprueba los datos y confirma tu operación.'}</Text>}
   {deposit?.stage==='CONFIRMED'&&!withdrawal&&operationGoal==='CONVERT'&&<Button label={share?'Retirar el activo recibido':'Retirar fondos o salidas disponibles'} disabled={busy||reviewing} onPress={()=>{setOperationGoal('WITHDRAW');setNotice('Retirada seleccionada. Continúa para preparar y revisar el movimiento.');}}/>}
   {operationGoal==='WITHDRAW'&&activePairing&&<Button label={uniswapPairing?'Volver al intercambio':'Volver a la inversión'} disabled={busy||reviewing} onPress={()=>setOperationGoal('CONVERT')}/>}
   {activePairing&&<Button label={share?'Ver activo de origen':'Ver activo de destino'} disabled={busy||reviewing} onPress={()=>{void run(()=>selectPairedRole(share?'source':'target'));}}/>}
  </WalletCard>}
  {connected&&<WalletCard title="Estado de tus fondos">
   <Fields values={{Importe:amountText(summary?.amount??null,summary?.descriptor??null),'Saldo disponible':freshNote?.note?amountText(freshNote.note.available,freshNote.descriptor):'Consulta para actualizar','Ingreso':deposit?stageText[deposit.stage]??deposit.stage:'No confirmado',...(withdrawal?{Retirada:stageText[withdrawal.stage]??withdrawal.stage}:{}),...(graphRow?{Operación:freshGraph?graphStageText[graphRow.graph.stage]??'Pendiente de comprobar':'Consulta para actualizar'}:{}),'Resultado pendiente':uncertain?'Consulta la misma operación':'Ninguno retenido'}}/>
   {!available&&<Text style={styles.muted}>No se ha podido abrir la información guardada. Reconecta esta misma cuenta antes de preparar una operación.</Text>}
   {uncertain&&<Text style={styles.muted}>Consultar recupera el resultado de la misma operación y no repite el envío.</Text>}
   <Button label="Actualizar este resultado" disabled={busy||reviewing} onPress={()=>{void run(async()=>{const selected=requireConnection();clearReview();if(selected.noteClosed)await readGraphStatus(selected,epoch.current);else await readStatus(selected,epoch.current);setNotice('Estado original consultado. Una operación pendiente no se reenvía.');});}}/>
  </WalletCard>}
  <WalletButton label={advanced?'Volver al recorrido sencillo':'Opciones avanzadas y conexión'} tone="secondary" disabled={busy||reviewing} onPress={()=>setAdvanced(value=>!value)}/>
  {advanced&&<>
  <WalletCard title="Servicio que ejecuta la operación" subtitle="El servicio es el proveedor; los activos de origen y destino se muestran en el recorrido principal.">
   <Fields values={{Servicio:protocolLabel}}/>
   <View style={styles.choices}>{([{id:'UNISWAP',label:'Uniswap'},{id:'AAVE',label:'Aave'},{id:'MORPHO',label:'Morpho'}] as const).map(item=><WalletChoice key={item.id} label={item.label} selected={selectedProtocol===item.id} disabled={busy||reviewing||hasRetainedOperation||uncertain} onPress={()=>{void run(()=>chooseProtocol(item.id));}}/>)}</View>
   <Text style={styles.muted}>Uniswap permite intercambiar. Aave y Morpho permiten invertir y recibir participaciones.</Text>
  </WalletCard>
  <WalletCard title="Conexión de este servicio">
   <Button label="Importar conexión del ordenador" disabled={busy||reviewing} onPress={()=>{void run(importPublicFlowConnection,'No se ha importado la conexión. Copia el perfil público DeFi del ordenador y usa la identidad de esta wallet.');}}/>
   <WalletButton label={settingsOpen?'Ocultar ajustes de conexión':'Ajustes de conexión'} tone="secondary" disabled={busy||reviewing} onPress={()=>setSettingsOpen(value=>!value)}/>
   {settingsOpen&&<>
    {tlsDisplay&&<Fields values={{Servidor:tlsDisplay.origin,'Huella del certificado':tlsDisplay.certificateSHA256}}/>}
    <TextInput accessibilityLabel="Conexión de operación DeFi" multiline style={[styles.input,styles.descriptor]} value={flowConnectionText} autoCapitalize="none" autoCorrect={false} editable={!busy} maxLength={32768} onChangeText={text=>{closeConnection();publicTls.current=null;setTlsDisplay(null);setSummary(null);setFlowConnectionText(text);}}/>
    <Button label="Abrir operación DeFi" disabled={busy||flowConnectionText.length===0} onPress={()=>{void run(()=>loadFlowConnection(),'No se ha abierto la operación. Comprueba la conexión y la identidad de tu wallet.');}}/>
   </>}
  </WalletCard>
  <View style={styles.card}><Text style={styles.heading}>Conexión privada</Text>
   <Text style={styles.label}>Descriptor entregado por tu operador</Text>
  <TextInput accessibilityLabel="Descriptor privado de la nota ERC20" multiline style={[styles.input,styles.descriptor]} value={descriptorText} autoCapitalize="none" autoCorrect={false} editable={!busy}
    onChangeText={text=>{closeConnection();clearMeta();clearMetaFour();clearAave();clearUniswap();setDescriptorText(text);setSummary(null);}}/>
   <Text style={styles.label}>Nota que quieres abrir</Text>
   <Text style={styles.muted}>La nota inicial conserva su almacén. Para otro activo, red o conexión, selecciona otra nota. Las participaciones se guardan siempre en su propia conexión.</Text>
   <Button label={(custodyRoute==='LEGACY'?'✓ ':'')+'Nota inicial'} disabled={busy} onPress={()=>{closeConnection();setCustodyRoute('LEGACY');setSummary(null);}}/>
   <Button label={(custodyRoute==='ROUTED'?'✓ ':'')+'Otra nota por activo y conexión'} disabled={busy} onPress={()=>{closeConnection();setCustodyRoute('ROUTED');setSummary(null);}}/>
   <Button label="Conectar y consultar la nota" disabled={busy} onPress={()=>{void run(connect);}}/>
   <Text style={styles.muted}>{connected?'Conexión comprobada':'Sin conexión comprobada'}</Text>
  </View>
  <View style={styles.card}><Text style={styles.heading}>Uniswap: conversión privada y nota de destino</Text>
   <Text style={styles.muted}>Pega paired-uniswap-v3.json del operador original. Autoriza primero la recepción del token de destino y vuelve a la fuente para revisar el máximo de entrada, la reserva y el plazo. El swap usa el pool original; no añade liquidez.</Text>
   <TextInput accessibilityLabel="Vinculación original Uniswap" multiline style={[styles.input,styles.descriptor]} value={uniswapText} autoCapitalize="none" autoCorrect={false} editable={!busy} onChangeText={text=>{closeConnection();clearMeta();clearMetaFour();clearAave();clearUniswap();setUniswapText(text);setSummary(null);}}/>
   <Button label="Abrir las dos conexiones Uniswap" disabled={busy||uniswapText.length===0} onPress={()=>{void run(loadUniswap,'No se ha abierto Uniswap. Comprueba la pareja original y la identidad de este dispositivo.');}}/>
   {uniswapPairing&&<><Fields values={{Entrada:uniswapPairing.source.assetMetadata.symbol,Salida:uniswapPairing.target.assetMetadata.symbol,Servicio:uniswapPairing.source.origin}}/><Button label="Abrir y consultar token de destino" disabled={busy} onPress={()=>{void run(()=>selectUniswap('target'));}}/><Button label="Volver a financiación y reserva Uniswap" disabled={busy} onPress={()=>{void run(()=>selectUniswap('source'));}}/><Text style={styles.muted}>El token recibido conserva su apertura propia y se retira con W39. El máximo de entrada y el importe exacto de salida se autorizan por separado. Un resultado desconocido sólo permite consultar la misma operación.</Text></>}
  </View>
  <View style={styles.card}><Text style={styles.heading}>MetaMorpho: financiación y participaciones propias</Text>
   <Text style={styles.muted}>Pega paired-metamorpho-underlying.json del operador original. Prepara y autoriza la recepción de participaciones antes de volver a la fuente para su reserva y ejecución. Cada nota conserva su apertura y sus permisos.</Text>
   <TextInput accessibilityLabel="Vinculación original MetaMorpho" multiline style={[styles.input,styles.descriptor]} value={metaText} autoCapitalize="none" autoCorrect={false} editable={!busy} onChangeText={text=>{closeConnection();clearMeta();clearMetaFour();clearAave();clearUniswap();setMetaText(text);setSummary(null);}}/>
   <Button label="Abrir las dos conexiones MetaMorpho" disabled={busy||metaText.length===0} onPress={()=>{void run(loadMeta,'No se ha abierto MetaMorpho. Comprueba la pareja original y la identidad de este dispositivo.');}}/>
   {metaPairing&&<><Fields values={{Fuente:metaPairing.source.assetMetadata.symbol,Participaciones:metaPairing.target.assetMetadata.symbol,Servicio:metaPairing.source.origin}}/><Button label="Abrir y consultar participaciones MetaMorpho" disabled={busy} onPress={()=>{void run(()=>selectMeta('target'));}}/><Button label="Volver a financiación y reserva MetaMorpho" disabled={busy} onPress={()=>{void run(()=>selectMeta('source'));}}/><Text style={styles.muted}>Consulta la recepción autorizada para unir sus importes y plazo a la preparación original. La retirada usa la nota propia. Después de confirmar SHARE W39, la tarjeta MetaMorpho requiere un permiso separado para redimir underlying en la misma dirección.</Text></>}
  </View>
  <View style={styles.card}><Text style={styles.heading}>Aave: financiación y participaciones propias</Text>
   <Text style={styles.muted}>Pega paired-aave-static.json del operador original. Prepara y autoriza la recepción de participaciones antes de volver a la fuente para su reserva y ejecución. Cada nota conserva su apertura y sus permisos.</Text>
   <TextInput accessibilityLabel="Vinculación original Aave" multiline style={[styles.input,styles.descriptor]} value={aaveText} autoCapitalize="none" autoCorrect={false} editable={!busy} onChangeText={text=>{closeConnection();clearMeta();clearMetaFour();clearAave();clearUniswap();setAaveText(text);setSummary(null);}}/>
   <Button label="Abrir las dos conexiones Aave" disabled={busy||aaveText.length===0} onPress={()=>{void run(loadAave,'No se ha abierto Aave. Comprueba la pareja original y la identidad de este dispositivo.');}}/>
   {aavePairing&&<><Fields values={{Fuente:aavePairing.source.assetMetadata.symbol,Participaciones:aavePairing.target.assetMetadata.symbol,Servicio:aavePairing.source.origin}}/><Button label="Abrir y consultar participaciones Aave" disabled={busy} onPress={()=>{void run(()=>selectAave('target'));}}/><Button label="Volver a financiación y reserva Aave" disabled={busy} onPress={()=>{void run(()=>selectAave('source'));}}/><Text style={styles.muted}>Consulta la recepción autorizada para unir sus importes y plazo a la preparación original. La retirada usa la nota propia. Después de confirmar SHARE W39, la tarjeta Aave requiere un permiso separado para redimir underlying en la misma dirección.</Text></>}
  </View>
  <View style={styles.card}><Text style={styles.heading}>Cuatro entregas MetaMorpho</Text>
   <Text style={styles.muted}>Pega el archivo paired-meta-four.json del producto original. La fuente y cada participación conservan su propia conexión, apertura y autorización. La consulta de una nota no autoriza otra.</Text>
   <TextInput accessibilityLabel="Paquete de cuatro vinculaciones MetaMorpho" multiline style={[styles.input,styles.descriptor]} value={metaFourText} autoCapitalize="none" autoCorrect={false} editable={!busy} onChangeText={text=>{closeConnection();clearMeta();clearMetaFour();clearAave();clearUniswap();setMetaFourText(text);setSummary(null);}}/>
   <Button label="Abrir las cuatro vinculaciones originales" disabled={busy||metaFourText.length===0} onPress={()=>{void run(loadMetaFour,'No se ha abierto el paquete. Comprueba las cuatro conexiones originales y la identidad de este dispositivo.');}}/>
   {metaFour&&<><Text style={styles.muted}>Fuente: 500 unidades. Cada entrega invierte 100, recibe 100 participaciones y reserva 100; la reserva total es 400. Revisa los decimales de cada activo. El grafo confirma sus términos en la preparación original.</Text>
    <Fields values={{'Inicio común':metaFourWindow?.validFrom??'Se fija con la primera preparación original','Fin de recepción':metaFourWindow?.validUntil??'Pendiente de preparar','Vencimiento de reserva':metaFourWindow?.settleBefore??'Pendiente de preparar'}}/>
    <Button label="Abrir fuente y reserva de las cuatro entregas" disabled={busy} onPress={()=>{void run(()=>selectMetaFour(-1));}}/>
    {metaFour.targets.map((descriptor,slot)=>{const observed=metaFourReads[slot],fresh=observed&&observed.expiresAt>Date.now()?observed:null,intent=fresh?.jobs.find(v=>v.mode==='deposit_intent'),last=fresh?.jobs.find(v=>v.mode==='withdraw_balance'),delivery=metaFour.deliveries[slot];return <View key={descriptor.pairingId}>
     <Fields values={{Entrega:String(slot+1),Servicio:descriptor.origin,Activo:descriptor.assetMetadata.symbol,'Depende de':delivery.dependsOn.length?delivery.dependsOn.map(id=>String(Number(id.slice('device-external-share-'.length))+1)).join(', '):'Ninguna entrega anterior','Recepción original':intent?stageText[intent.stage]??intent.stage:'Consultar esta conexión','Nota original':fresh?.note?.state??'No disponible','Disponible confirmado':amountText(fresh?.note?.available??null,descriptor),Retirada:last?stageText[last.stage]??last.stage:'No consultada'}}/>
     <Button label={'Abrir y consultar participación '+(slot+1)} disabled={busy} onPress={()=>{void run(()=>selectMetaFour(slot));}}/>
    </View>;})}
    <Text style={styles.muted}>Prepara y autoriza cada recepción antes de volver a la fuente para U, S y la ejecución del mismo grafo. Cada resultado pendiente se consulta en su conexión. Los importes disponibles sólo proceden de consultas originales vigentes.</Text>
   </>}
  </View>
  </>}
  {connected&&advanced&&<View style={styles.card}><Text style={styles.heading}>Crear nota</Text>
   <Text style={styles.label}>Dirección de retirada</Text><TextInput accessibilityLabel="Dirección de retirada ERC20" style={styles.input} value={recipient} autoCapitalize="none" autoCorrect={false} editable={canPrepare&&summary?.recipient===null&&!busy&&connection.current?.redemptionRecipient===null} onChangeText={setRecipient}/>
   {connection.current?.redemptionRecipient&&<Text style={styles.muted}>La dirección procede de la consulta original de la posición. SHARE W39 y su redención de underlying conservan ese mismo holder.</Text>}
   <Text style={styles.label}>Importe en unidades atómicas</Text><TextInput accessibilityLabel="Importe ERC20 en unidades atómicas" style={styles.input} value={amount} keyboardType="number-pad" editable={canPrepare&&summary?.amount===null&&!busy&&!metaFour} onChangeText={setAmount}/>
   <Text style={styles.muted}>{connection.current?.descriptor.assetMetadata.symbol} tiene {connection.current?.descriptor.assetMetadata.decimals} decimales. Comprueba el importe exacto antes de confirmar.</Text>
   {share&&<><Text style={styles.label}>Fin del plazo de recepción (segundos Unix)</Text><TextInput accessibilityLabel="Fin del plazo de recepción" style={styles.input} value={validUntil} keyboardType="number-pad" editable={canPrepare&&!busy&&!metaFour} onChangeText={setValidUntil}/><Text style={styles.muted}>{metaFour?'Las cuatro recepciones conservan el mismo inicio y fin original. El inicio de la primera preparación procede de su consulta; las siguientes usan ese mismo plazo.':'El operador entrega las participaciones durante el plazo que autorices. La recepción conserva una clave propia en este dispositivo.'}</Text></>}
   <Button label={share?(uniswapPairing?'Preparar recepción del token de destino':'Preparar recepción de participación'):'Preparar prueba de financiación'} disabled={busy||!canPrepare} onPress={()=>confirmPreparation()}/>
  </View>}
  {connected&&!share&&deposit?.stage==='CONFIRMED'&&<View style={styles.card}><Text style={styles.heading}>Conversión y reserva privadas</Text>
   {advanced&&(graph===null||graph.row===null&&graph.pending===null)&&!status?.graphClaimed&&<><Text style={styles.muted}>Autoriza primero la recepción en la conexión de participaciones. Usa aquí sus importes y el mismo inicio de plazo; la recuperación conserva una nota propia.</Text>
    <Text style={styles.label}>Activo que recibe la inversión, unidades atómicas</Text><TextInput accessibilityLabel="Importe invertido" style={styles.input} value={graphAssetAmount} keyboardType="number-pad" editable={!busy&&!uncertain&&!metaFour} onChangeText={setGraphAssetAmount}/>
    <Text style={styles.label}>{uniswapPairing?'Token de destino autorizado, unidades atómicas':'Participaciones autorizadas, unidades atómicas'}</Text><TextInput accessibilityLabel="Importe de destino autorizado" style={styles.input} value={graphShareAmount} keyboardType="number-pad" editable={!busy&&!uncertain&&!metaFour} onChangeText={setGraphShareAmount}/>
    <Text style={styles.label}>Importe reservado, unidades atómicas</Text><TextInput accessibilityLabel="Importe reservado" style={styles.input} value={graphPayoutAmount} keyboardType="number-pad" editable={!busy&&!uncertain&&!metaFour} onChangeText={setGraphPayoutAmount}/>
    <Text style={styles.label}>Inicio original de recepción, segundos Unix</Text><TextInput accessibilityLabel="Inicio original de recepción" style={styles.input} value={graphValidFrom} keyboardType="number-pad" editable={!busy&&!uncertain&&!metaFour} onChangeText={setGraphValidFrom}/>
    <Text style={styles.label}>Vencimiento de la reserva, segundos Unix</Text><TextInput accessibilityLabel="Vencimiento de la reserva" style={styles.input} value={graphSettleBefore} keyboardType="number-pad" editable={!busy&&!uncertain&&!metaFour} onChangeText={setGraphSettleBefore}/>
    <Button label={graphPreparationPending?"Consultar preparación de las recepciones":"Preparar reserva y conversión"} disabled={busy||uncertain||!available||Boolean(withdrawal)} onPress={confirmGraphPreparation}/></>}
   <Fields values={{Reserva:graphRow?stageText[graphRow.reservation.stage]??graphRow.reservation.stage:'No disponible',Conversión:graphRow?graphStageText[graphRow.graph.stage]:'No disponible','Cambio retenido':amountText(graph?.changeAmount??null,summary?.descriptor??null),'Recuperación retenida':amountText(graph?.recoveryAmount??null,summary?.descriptor??null),'Resultado pendiente':graphPending?'Consultar la misma operación':'Ninguno retenido'}}/>
   <Button label="Consultar reserva y conversión" disabled={busy} onPress={()=>{void run(async()=>{const selected=requireConnection();clearReview();await readGraphStatus(selected,epoch.current);setNotice('Estado de la reserva consultado sin repetir envíos.');});}}/>
   {advanced&&graphRow?.reservation.stage==='FAILED'&&graphRow.graph.stage!=='SOURCE_CANCELLED'&&<Button label="Liberar reserva que no se envió" disabled={busy} onPress={()=>{void run(()=>requestGraphAction('CANCEL_GRAPH'));}}/>}
   {advanced&&graphRow?.reservation.stage==='PROVED'&&!graphPending&&<Button label="Revisar registro de la reserva" disabled={busy} onPress={()=>{void run(()=>requestGraphAction('RESERVE_S'));}}/>}
   {advanced&&graphRow&&['RESERVING','RESERVATION_UNKNOWN'].includes(graphRow.reservation.stage)&&<Button label="Consultar reserva pendiente" disabled={busy} onPress={()=>{void run(()=>requestGraphAction('OBSERVE_S'));}}/>}
   {advanced&&graphRow?.reservation.stage==='RESERVED'&&graphRow.graph.stage==='PREPARED'&&!graphPending&&<Button label="Revisar ejecución de la conversión" disabled={busy} onPress={()=>{void run(()=>requestGraphAction('EXECUTE_GRAPH'));}}/>}
   {advanced&&graphRow&&(['EXECUTION_UNKNOWN','RECOVERY_UNKNOWN'].includes(graphRow.graph.stage)||graphPending)&&<Button label="Conciliar la misma conversión" disabled={busy} onPress={()=>{void run(()=>requestGraphAction('RECONCILE_GRAPH'));}}/>}
   {advanced&&graphRow?.reservation.stage==='RESERVED'&&graphRow.graph.stage==='PREPARED'&&!graphPending&&graphStatus&&graphStatus.expiresAt>Date.now()&&BigInt(graphStatus.observed.timestamp)>=BigInt(graphRow.reservation.statement.settleBefore)&&<Button label="Revisar recuperación de reserva vencida" disabled={busy} onPress={()=>{void run(()=>requestGraphAction('RECOVER_GRAPH'));}}/>}
  </View>}
  {connected&&!share&&graph!==null&&(['change','recovery'] as const).map(noteRole=>{
   const fresh=graphStatus&&graphStatus.expiresAt>Date.now()?graphStatus:null,output=fresh?.jobs[0]?.outputs.find((value:GraphOutputView)=>value.noteRole===noteRole);
   const withdrawal=graph.withdrawals.find(value=>value.noteRole===noteRole),pendingEntry=outputPending.find(value=>value.noteRole===noteRole),pending=Boolean(pendingEntry);
   return <View key={noteRole} style={styles.card}><Text style={styles.heading}>Salida de {graphOutputRoleText[noteRole].toLowerCase()}</Text>
    <Fields values={{Estado:output?graphOutputStateText[output.state]??output.state:'No disponible','Importe original':amountText(noteRole==='change'?graph.changeAmount:graph.recoveryAmount,summary?.descriptor??null),'Disponible para retirar':amountText(output?.available??null,summary?.descriptor??null),'Dirección fijada':summary?.recipient?'0x'+summary.recipient:'No disponible',Retirada:withdrawal?stageText[withdrawal.row.stage]??withdrawal.row.stage:'No preparada','Resultado pendiente':pending?'Consultar la misma retirada':'Ninguno retenido'}}/>
    <Button label={'Consultar salida de '+graphOutputRoleText[noteRole].toLowerCase()} disabled={busy} onPress={()=>{void run(async()=>{const selected=requireConnection();clearReview();await readGraphStatus(selected,epoch.current);setNotice('Estado de las salidas consultado sin repetir envíos.');});}}/>
    {output?.state==='UNSPENT'&&output.available!==null&&!withdrawal&&!pending&&<Button label={'Preparar retirada del '+graphOutputRoleText[noteRole].toLowerCase()} disabled={busy||!available} onPress={()=>confirmGraphOutputPreparation(noteRole)}/>}
    {withdrawal?.row.stage==='PROVED'&&!pending&&<Button label={'Revisar retirada del '+graphOutputRoleText[noteRole].toLowerCase()} disabled={busy||!available} onPress={()=>{void run(()=>requestGraphOutput(noteRole,'WITHDRAW_W39'));}}/>}
    {(pendingEntry&&pendingEntry.action!=='PROVE_W39'||withdrawal?.row.stage==='WITHDRAWAL_UNKNOWN')&&<Button label="Consultar la misma retirada pendiente" disabled={busy} onPress={()=>{void run(()=>requestGraphOutput(noteRole,'OBSERVE_W39'));}}/>}
    {output&&['LOCKED','UNKNOWN'].includes(output.state)&&<Text style={styles.muted}>Esta salida no tiene un importe disponible confirmado. Consultar conserva las operaciones originales.</Text>}
   </View>;
  })}
  {connected&&advanced&&<View style={styles.card}><Text style={styles.heading}>Estado técnico y acciones manuales</Text>
   <Fields values={{'Importe original de la nota':amountText(summary?.amount??null,summary?.descriptor??null),
    'Participaciones disponibles':connected&&status?.note&&status.expiresAt>Date.now()?amountText(status.note.available,status.descriptor):'No disponible',
    'Dirección fijada':summary?.recipient?'0x'+summary.recipient:'No disponible','Financiación':deposit?stageText[deposit.stage]:'No confirmada',
    'Retirada':withdrawal?stageText[withdrawal.stage]:'No confirmada','Resultado pendiente':summary===null?'No disponible':uncertain?'Consulta la misma operación':'Ninguno retenido',
    'Cabeza consultada':connected&&status&&status.expiresAt>Date.now()?status.observed.blockNumber:'No disponible'}}/>
   {!available&&<Text style={styles.muted}>La información local no está disponible. No se puede preparar ni enviar una operación.</Text>}
   {uncertain&&<Text style={styles.muted}>El resultado está pendiente. Consultar conserva la operación original y no vuelve a enviar fondos.</Text>}
   {connected&&<Button label="Consultar operaciones originales" disabled={busy} onPress={()=>{void run(async()=>{const selected=requireConnection();clearReview();if(selected.noteClosed)await readGraphStatus(selected,epoch.current);else await readStatus(selected,epoch.current);setNotice('Estado original consultado. Una operación pendiente no se reenvía.');});}}/>}
   {advanced&&connected&&!share&&deposit?.stage==='PROVED'&&!uncertain&&!withdrawal&&<Button label="Revisar financiación" disabled={busy} onPress={()=>{void run(()=>requestAction('FUND_D26'));}}/>}
   {advanced&&connected&&share&&deposit&&['PROVED','DELIVERY_UNKNOWN'].includes(deposit.stage)&&<Button label="Consultar recepción de participación" disabled={busy} onPress={()=>{void run(()=>requestAction('OBSERVE_D27'));}}/>}
   {advanced&&connected&&deposit?.stage==='FUNDING_UNKNOWN'&&<Button label="Consultar financiación pendiente" disabled={busy} onPress={()=>{void run(()=>requestAction('OBSERVE_D26'));}}/>}
   {advanced&&connected&&deposit?.stage==='CONFIRMED'&&!withdrawal&&!uncertain&&(graph===null||graphRow?.graph.stage==='SOURCE_CANCELLED')&&!status?.graphClaimed&&<Button label="Preparar retirada completa" disabled={busy} onPress={()=>confirmPreparation(true)}/>}
   {advanced&&connected&&withdrawal?.stage==='PROVED'&&!uncertain&&<Button label="Revisar retirada" disabled={busy} onPress={()=>{void run(()=>requestAction('WITHDRAW_W39'));}}/>}
   {advanced&&connected&&withdrawal?.stage==='WITHDRAWAL_UNKNOWN'&&<Button label="Consultar retirada pendiente" disabled={busy} onPress={()=>{void run(()=>requestAction('OBSERVE_W39'));}}/>}
  </View>}
  {connected&&connection.current?.blueClient&&withdrawal?.stage==='CONFIRMED'&&<View style={styles.card}><Text style={styles.heading}>Retirar mi inversión</Text><Text style={styles.muted}>Servicio: Morpho Blue</Text>
   <Text style={styles.muted}>La retirada original entrega participaciones en tu dirección fijada. Redimirlas es otra operación y entrega underlying público, sin crear un saldo privado.</Text>
   <Fields values={{Estado:blueStatus&&blueStatus.expiresAt>Date.now()?blueStatus.operations[0]?.stage??'Sin redención admitida':'Consultar estado original','Underlying recibido, unidades atómicas':blueStatus&&blueStatus.expiresAt>Date.now()?blueStatus.operations[0]?.redeemedUnderlying??'No confirmado':'No disponible','Gas aprobación, wei':blueStatus?.operations[0]?.nativeGas.approvalWei??'No confirmado','Gas redención, wei':blueStatus?.operations[0]?.nativeGas.redemptionWei??'No confirmado'}}/>
   <Button label="Consultar redención original" disabled={busy} onPress={()=>{void run(async()=>{const selected=requireConnection();clearReview();await readBlueStatus(selected,epoch.current);});}}/>
   {blueStatus&&blueStatus.expiresAt>Date.now()&&!blueStatus.observationOnly&&blueStatus.operations.length===0&&<><TextInput accessibilityLabel="Mínimo de underlying Blue, unidades atómicas" style={styles.input} value={blueMinimum} onChangeText={setBlueMinimum} keyboardType="number-pad" editable={!busy} placeholder="Mínimo de underlying, unidades atómicas" placeholderTextColor="#9fb7bd"/><Button label="Revisar redención de estas participaciones" disabled={busy||blueMinimum===''} onPress={()=>{void run(()=>requestBlue('REDEEM_BLUE'));}}/></>}
   {blueStatus?.operations.some(r=>r.stage==='REDEMPTION_UNKNOWN')&&<Button label="Revisar consulta de la misma redención" disabled={busy} onPress={()=>{void run(()=>requestBlue('OBSERVE_BLUE'));}}/>}
  </View>}
  {blueReview&&<View style={styles.card}><Text style={styles.heading}>{blueReview.action==='REDEEM_BLUE'?'Retirar mi inversión':'Consultar la misma retirada'}</Text><Fields values={{Participaciones:blueReview.shares,'Mínimo underlying, unidades atómicas':blueReview.minimumAssets,'Dirección fijada':'0x'+blueReview.recipient,'Underlying':'0x'+blueReview.underlying,'Plazo original, segundos Unix':blueReview.deadline}}/><Button label="Confirmar operación" disabled={busy} onPress={confirmBlue}/><Button label="Cancelar revisión" disabled={busy} onPress={clearReview}/></View>}
  {connected&&connection.current?.metaClient&&withdrawal?.stage==='CONFIRMED'&&<View style={styles.card}><Text style={styles.heading}>Retirar mi inversión</Text><Text style={styles.muted}>Servicio: Morpho</Text>
   <Text style={styles.muted}>La retirada original entrega participaciones en tu dirección fijada. Redimirlas es otra operación y entrega underlying público, sin crear un saldo privado.</Text>
   <Fields values={{Estado:metaStatus&&metaStatus.expiresAt>Date.now()?metaStatus.operations[0]?.stage??'Sin redención admitida':'Consultar estado original','Underlying recibido, unidades atómicas':metaStatus&&metaStatus.expiresAt>Date.now()?metaStatus.operations[0]?.redeemedUnderlying??'No confirmado':'No disponible','Gas aprobación, wei':metaStatus?.operations[0]?.nativeGas.approvalWei??'No confirmado','Gas redención, wei':metaStatus?.operations[0]?.nativeGas.redemptionWei??'No confirmado'}}/>
   <Button label="Consultar redención original" disabled={busy} onPress={()=>{void run(async()=>{const selected=requireConnection();clearReview();await readMetaStatus(selected,epoch.current);});}}/>
   {metaStatus&&metaStatus.expiresAt>Date.now()&&!metaStatus.observationOnly&&metaStatus.operations.length===0&&<><TextInput accessibilityLabel="Mínimo de underlying MetaMorpho, unidades atómicas" style={styles.input} value={metaMinimum} onChangeText={setMetaMinimum} keyboardType="number-pad" editable={!busy} placeholder="Mínimo de underlying, unidades atómicas" placeholderTextColor="#9fb7bd"/><Button label="Revisar redención de estas participaciones" disabled={busy||metaMinimum===''} onPress={()=>{void run(()=>requestMeta('REDEEM_META'));}}/></>}
   {metaStatus?.operations.some(r=>r.stage==='REDEMPTION_UNKNOWN')&&<Button label="Revisar consulta de la misma redención" disabled={busy} onPress={()=>{void run(()=>requestMeta('OBSERVE_META'));}}/>}
  </View>}
  {metaReview&&<View style={styles.card}><Text style={styles.heading}>{metaReview.action==='REDEEM_META'?'Retirar mi inversión':'Consultar la misma retirada'}</Text><Fields values={{Participaciones:metaReview.shares,'Mínimo underlying, unidades atómicas':metaReview.minimumAssets,'Dirección fijada':'0x'+metaReview.recipient,'Underlying':'0x'+metaReview.underlying,'Plazo original, segundos Unix':metaReview.deadline}}/><Button label="Confirmar operación" disabled={busy} onPress={confirmMeta}/><Button label="Cancelar revisión" disabled={busy} onPress={clearReview}/></View>}
  {connected&&connection.current?.aaveClient&&withdrawal?.stage==='CONFIRMED'&&<View style={styles.card}><Text style={styles.heading}>Retirar mi inversión</Text><Text style={styles.muted}>Servicio: Aave</Text>
   <Text style={styles.muted}>La retirada original entrega participaciones en tu dirección fijada. Redimirlas es otra operación y entrega underlying público, sin crear un saldo privado.</Text>
   <Fields values={{Estado:aaveStatus&&aaveStatus.expiresAt>Date.now()?aaveStatus.operations[0]?.stage??'Sin redención admitida':'Consultar estado original','Underlying recibido, unidades atómicas':aaveStatus&&aaveStatus.expiresAt>Date.now()?aaveStatus.operations[0]?.redeemedUnderlying??'No confirmado':'No disponible','Gas aprobación, wei':aaveStatus?.operations[0]?.nativeGas.approvalWei??'No confirmado','Gas redención, wei':aaveStatus?.operations[0]?.nativeGas.redemptionWei??'No confirmado'}}/>
   <Button label="Consultar redención original" disabled={busy} onPress={()=>{void run(async()=>{const selected=requireConnection();clearReview();await readAaveStatus(selected,epoch.current);});}}/>
   {aaveStatus&&aaveStatus.expiresAt>Date.now()&&!aaveStatus.observationOnly&&aaveStatus.operations.length===0&&<><TextInput accessibilityLabel="Mínimo de underlying Aave, unidades atómicas" style={styles.input} value={aaveMinimum} onChangeText={setAaveMinimum} keyboardType="number-pad" editable={!busy} placeholder="Mínimo de underlying, unidades atómicas" placeholderTextColor="#9fb7bd"/><Button label="Revisar redención de estas participaciones" disabled={busy||aaveMinimum===''} onPress={()=>{void run(()=>requestAave('REDEEM_AAVE'));}}/></>}
   {aaveStatus?.operations.some(r=>r.stage==='REDEMPTION_UNKNOWN')&&<Button label="Revisar consulta de la misma redención" disabled={busy} onPress={()=>{void run(()=>requestAave('OBSERVE_AAVE'));}}/>}
  </View>}
  {aaveReview&&<View style={styles.card}><Text style={styles.heading}>{aaveReview.action==='REDEEM_AAVE'?'Retirar mi inversión':'Consultar la misma retirada'}</Text><Fields values={{Participaciones:aaveReview.shares,'Mínimo underlying, unidades atómicas':aaveReview.minimumAssets,'Dirección fijada':'0x'+aaveReview.recipient,'Underlying':'0x'+aaveReview.underlying,'Plazo original, segundos Unix':aaveReview.deadline}}/><Button label="Confirmar operación" disabled={busy} onPress={confirmAave}/><Button label="Cancelar revisión" disabled={busy} onPress={clearReview}/></View>}

  {onOpenOperations&&<Button label="Volver a mis operaciones" disabled={busy} onPress={onOpenOperations}/> }
 </WalletScreenLayout>;
}
const styles=StyleSheet.create({muted:{color:walletColors.muted,fontSize:14,lineHeight:22,marginVertical:6},card:{backgroundColor:walletColors.surface,borderRadius:18,padding:18,gap:10,borderWidth:1,borderColor:walletColors.border,marginBottom:16},heading:{color:walletColors.text,fontSize:19,fontWeight:'700'},label:{color:walletColors.muted,fontSize:13,marginTop:7},value:{color:walletColors.text,fontSize:15,lineHeight:22},input:{backgroundColor:walletColors.surface,color:walletColors.text,padding:12,minHeight:50,borderRadius:12,borderWidth:1,borderColor:walletColors.border,fontSize:16},descriptor:{minHeight:100},step:{color:walletColors.primary,fontSize:14,fontWeight:'600',marginBottom:10},choices:{flexDirection:'row',gap:8},serviceRow:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:12,marginBottom:12},copy:{fontSize:12,lineHeight:18,backgroundColor:walletColors.background,padding:12,borderRadius:12}});
