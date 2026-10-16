import {useEffect,useRef,useState} from 'react';
import {Text,StyleSheet,AppState} from 'react-native';
import type {DeviceSepoliaDefiConnectionV7} from '@lianum/mobile-protocol/device/sepolia-defi-connection-v7';
import type {DeviceSepoliaDefiReviewV4} from '@lianum/mobile-protocol/device/sepolia-defi-review-v4';
import type {DeviceSepoliaDefiFinancialStatusV7} from '@lianum/mobile-protocol/device/sepolia-defi-financial-status-v7';
import type {DeviceSepoliaDefiSharesApiV4} from '../api/device-sepolia-defi-shares-api-v4.mjs';
import type {DeviceSepoliaDefiVaultV7} from '../api/device-sepolia-defi-financial-api-v7.mjs';
import {createDeviceSepoliaDefiActivityV7} from '../state/device-sepolia-defi-activity-v7.mjs';
import type {DeviceSepoliaDefiActivityV7} from '../state/device-sepolia-defi-activity-v7.mjs';
import SepoliaDefiReviewCardV7 from './SepoliaDefiReviewCardV7';
import {WalletButton,WalletCard,WalletStatus,walletColors} from './wallet-ui';
import {deviceSepoliaDefiFeedbackV7} from '../screens/sepolia-defi-feedback-v7.mjs';

type Props={connection:DeviceSepoliaDefiConnectionV7;vault:DeviceSepoliaDefiVaultV7;api:DeviceSepoliaDefiSharesApiV4;
  tracking:ReturnType<typeof createDeviceSepoliaDefiActivityV7>;review?:DeviceSepoliaDefiReviewV4|null;active:boolean;
  onBusyChange?(busy:boolean):void;onReviewClosed?():void;};
/** Mounted only after the caller opens an authentic paired profile and original
 * custody. Background work belongs to the server; this panel only polls reads. */
export default function SepoliaDefiOperationPanelV7({connection,vault,api,tracking,review=null,active,onBusyChange,onReviewClosed}:Props) {
  const [checkpoint,setCheckpoint]=useState<DeviceSepoliaDefiActivityV7|null>(null),[result,setResult]=useState<DeviceSepoliaDefiFinancialStatusV7|null>(null);
  const [busy,setBusy]=useState(false),[notice,setNotice]=useState('Revisa una propuesta del servicio antes de autorizar.'),[failed,setFailed]=useState(false),[reviewOpen,setReviewOpen]=useState(true);
  const live=useRef(active),mounted=useRef(true),running=useRef(false);live.current=active;
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  useEffect(()=>{setReviewOpen(true);},[review?.reference]);
  function current(){if(!mounted.current||!live.current||AppState.currentState!=='active')throw Error('MOBILE_SEPOLIA_DEFI_CONTEXT_CHANGED');}
  async function run(work:()=>Promise<void>) {
    if(running.current||!live.current||AppState.currentState!=='active')return;
    running.current=true;setBusy(true);setFailed(false);onBusyChange?.(true);
    try{await work();}catch(error){if(mounted.current&&live.current){setFailed(true);setNotice(deviceSepoliaDefiFeedbackV7(error));}}
    finally{running.current=false;onBusyChange?.(false);if(mounted.current)setBusy(false);}
  }
  async function findJob(saved:DeviceSepoliaDefiActivityV7) {
    const summary=await vault.summary();current();
    const mode=saved.review.action==='INVEST'?'deposit_intent':'withdraw_balance';
    const job=summary.jobs.find(job=>job.mode===mode&&job.consentFields.rootId===saved.review.rootId);
    if(!job)return saved;
    if(saved.jobId!==null&&saved.jobId!==job.jobId)throw Error('MOBILE_SEPOLIA_DEFI_TRACKING_JOB');
    const next=await tracking.save(saved.review,job.jobId);current();setCheckpoint(next);return next;
  }
  async function observe(saved:DeviceSepoliaDefiActivityV7) {
    // Restore original note observations before using the public tracking entry.
    await api.observe(vault);current();const found=await findJob(saved);
    if(found.jobId===null){setNotice('La propuesta está guardada. Todavía no hay un envío financiero confirmado.');return;}
    const next=await api.observeFinancial(vault,found.review,found.jobId);current();setResult(next);
    await api.observe(vault);current();
    if(next.phase==='CONFIRMED'&&next.kind==='INVEST')setNotice('Inversión confirmada en la red. La consulta de tu nota conserva las participaciones bajo la custodia de este dispositivo.');
    else if(next.phase==='CONFIRMED'&&next.kind==='REDEEM')setNotice('Retirada confirmada: el servicio ha comprobado el envío de USDC a la dirección autorizada.');
    else if(next.kind==='WITHDRAW')setNotice('Retirada de participaciones en curso. El servidor continuará el envío de USDC dentro de los límites autorizados.');
    else setNotice('El servidor conserva esta operación. Puedes cerrar la app y consultar después su resultado.');
  }
  async function confirm() {
    const selected=review??checkpoint?.review;if(!selected)return;
    if(selected.action==='REDEEM'&&checkpoint?.jobId&&checkpoint.review.reference===selected.reference){
      const token=await api.resumeRedemption(vault,selected,checkpoint.jobId);current();setReviewOpen(false);onReviewClosed?.();const next=await api.executeRedemption(token);current();setResult(next);await observe(checkpoint);return;
    }
    const saved=await tracking.save(selected);current();setCheckpoint(saved);setNotice('Autoriza una vez esta operación revisada.');
    const token=await api.prepare(vault,selected);current();setReviewOpen(false);onReviewClosed?.();setNotice('Preparando la recepción privada. Todavía no se ha confirmado una inversión.');
    await api.submit(token);current();const found=await findJob(saved);if(found.jobId===null)throw Error('MOBILE_SEPOLIA_DEFI_JOB_MISSING');
    setNotice(selected.action==='INVEST'?'Enviando la inversión autorizada al servidor.':'Iniciando la retirada y el envío de USDC autorizados.');
    const next=selected.action==='INVEST'?await api.executeInvestment(token):await api.executeRedemption(token);current();setResult(next);await observe(found);
  }
  useEffect(()=>{
    if(!active||running.current)return;let cancelled=false;
    void run(async()=>{const redeemed=await tracking.read('REDEEM'),invested=await tracking.read('INVEST');if(cancelled)return;current();const saved=redeemed??invested;setCheckpoint(saved);if(saved){setReviewOpen(false);await observe(saved);}});
    return()=>{cancelled=true;};
  },[active,api,tracking]);
  useEffect(()=>{
    if(!active||!checkpoint?.jobId||!result||result.phase==='CONFIRMED'&&result.kind!=='WITHDRAW')return;
    const timer=setInterval(()=>{if(!running.current)void run(()=>observe(checkpoint));},5000);return()=>clearInterval(timer);
  },[active,checkpoint,result]);
  const name=connection.protocol==='AAVE_STATIC'?'Aave':'Morpho';
  const selectedReview=review??checkpoint?.review;
  return <>
    <WalletStatus kind={failed?'warning':result?.canonical&&result.kind!=='WITHDRAW'?'success':'info'} title={busy?'Procesando la operación':result?.canonical&&result.kind==='INVEST'?'Inversión confirmada':result?.canonical&&result.kind==='REDEEM'?'Retirada confirmada':'Operación en '+name} detail={notice}/>
    {selectedReview&&reviewOpen&&<SepoliaDefiReviewCardV7 connection={connection} review={selectedReview} busy={busy} onConfirm={()=>void run(confirm)} onCancel={()=>{setReviewOpen(false);onReviewClosed?.();}}/>}
    {checkpoint&&<WalletCard title="Seguimiento guardado" subtitle="Consultar reutiliza la misma operación y no solicita otra autorización sensible.">
      <Text style={styles.detail}>Red de pruebas Sepolia · {name}. El activo de origen se identifica por su contrato; no se suma a otros tokens que compartan el nombre USDC.</Text>
      <Text selectable style={styles.address}>{connection.underlying.address}</Text>
      {result?.transactionHash&&<><Text style={styles.detail}>Transacción {result.kind==='WITHDRAW'?'de retirada de participaciones':result.kind==='INVEST'?'de inversión':'de envío de USDC'}</Text><Text selectable style={styles.address}>{result.transactionHash}</Text></>}
      <WalletButton label="Consultar esta operación" tone="secondary" loading={busy} disabled={!active||busy} onPress={()=>void run(()=>observe(checkpoint))}/>
      {!checkpoint.jobId&&!reviewOpen&&<WalletButton label="Revisar propuesta guardada" tone="secondary" disabled={!active||busy} onPress={()=>setReviewOpen(true)}/>}
      {result?.phase==='PREPARED'&&result.kind==='INVEST'&&checkpoint.jobId&&<WalletButton label="Continuar la inversión ya autorizada" disabled={!active||busy} onPress={()=>void run(async()=>{if(!checkpoint.jobId)return;const next=await api.continueInvestment(vault,checkpoint.review,checkpoint.jobId,result);current();setResult(next);await observe(checkpoint);})}/>}
      {result?.phase==='PREPARED'&&result.kind==='WITHDRAW'&&checkpoint.jobId&&!reviewOpen&&<WalletButton label="Revisar la retirada pendiente" disabled={!active||busy} onPress={()=>setReviewOpen(true)}/>}
      {checkpoint.review.action==='REDEEM'&&result?.kind==='WITHDRAW'&&result.canonical&&<WalletButton label="Continuar el envío de USDC autorizado" disabled={!active||busy} onPress={()=>void run(async()=>{if(!checkpoint.jobId)return;const next=await api.redeemFinancial(vault,checkpoint.review,checkpoint.jobId);current();setResult(next);await observe(checkpoint);})}/>}
    </WalletCard>}
  </>;
}
const styles=StyleSheet.create({detail:{color:walletColors.muted,fontSize:14,lineHeight:22,marginVertical:8},address:{color:walletColors.text,fontSize:13,lineHeight:20,marginVertical:8}});
