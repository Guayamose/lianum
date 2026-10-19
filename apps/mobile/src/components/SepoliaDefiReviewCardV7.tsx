import {WalletText as Text} from '../design/typography';
import {useEffect,useState} from 'react';
import {StyleSheet} from 'react-native';
import type {DeviceSepoliaDefiReviewV4} from '@lianum/mobile-protocol/device/sepolia-defi-review-v4';
import type {DeviceSepoliaDefiConnectionV7} from '@lianum/mobile-protocol/device/sepolia-defi-connection-v7';
import {presentDeviceSepoliaDefiReviewV7} from '../screens/sepolia-defi-review-presenter-v7.mjs';
import {WalletCard,WalletButton,WalletStatus,walletColors} from './wallet-ui';

export default function SepoliaDefiReviewCardV7({review,connection,busy=false,prepareReceipt=false,onConfirm,onCancel}:{
  review:DeviceSepoliaDefiReviewV4;connection:DeviceSepoliaDefiConnectionV7;busy?:boolean;prepareReceipt?:boolean;onConfirm():void;onCancel():void;
}) {
  const [now,setNow]=useState(Date.now());
  useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[]);
  const view=presentDeviceSepoliaDefiReviewV7(review,now);
  if(JSON.stringify(review.descriptor)!==JSON.stringify(connection.descriptor)||review.protocol!==connection.protocol)throw Error('MOBILE_SEPOLIA_DEFI_REVIEW_BINDING');
  const deadline=BigInt(review.validUntil)*1000n,deadlineText=deadline<=8640000000000000n?new Date(Number(deadline)).toLocaleString():review.validUntil+' segundos desde Unix';
  return <WalletCard title={prepareReceipt?'1. Preparar recepción de participaciones':view.title} subtitle={prepareReceipt?'Este paso prepara la recepción privada con tu sesión abierta. La huella se solicita después, al autorizar la inversión y su presupuesto.':'Comprueba los importes y el destino antes de autorizar.'}>
    <Text style={styles.label}>{view.amountLabel}</Text><Text selectable style={styles.amount}>{view.amount}</Text>
    <Text style={styles.label}>Participaciones</Text><Text selectable style={styles.value}>{view.shares}</Text>
    <Text style={styles.label}>{view.destinationLabel}</Text><Text selectable style={styles.value}>{view.destination}</Text>
    {review.action==='INVEST'&&<><Text style={styles.label}>Dirección de USDC elegida para esta revisión · Sepolia</Text><Text selectable style={styles.value}>{review.underlyingReceiver}</Text></>}
    <Text style={styles.detail}>{view.detail}</Text>
    <Text style={styles.label}>Activo de origen en Sepolia · {view.protocol}</Text><Text selectable style={styles.value}>{connection.underlying.address}</Text>
    <Text style={styles.label}>Válida hasta</Text><Text style={styles.value}>{deadlineText}</Text>
    <WalletStatus kind={view.live?'info':'warning'} title={view.live?'Autorización limitada':'Propuesta pendiente de actualizar'} detail={view.timeNotice}/>
    <WalletButton label={busy?(prepareReceipt?'Preparando recepción':'Autorizando operación'):prepareReceipt?'Preparar recepción':view.confirmLabel} loading={busy} disabled={busy||!view.live} onPress={onConfirm}/>
    <WalletButton label="Volver sin autorizar" tone="secondary" disabled={busy} onPress={onCancel}/>
  </WalletCard>;
}
const styles=StyleSheet.create({label:{color:walletColors.muted,fontSize:13,marginTop:12},amount:{color:walletColors.text,fontSize:26,fontWeight:'700',marginVertical:8},value:{color:walletColors.text,fontSize:16,lineHeight:24,marginVertical:4},detail:{color:walletColors.muted,fontSize:14,lineHeight:22,marginVertical:10}});
