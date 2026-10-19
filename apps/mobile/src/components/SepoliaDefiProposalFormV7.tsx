import {WalletText as Text} from '../design/typography';
import {useEffect,useRef,useState} from 'react';
import {StyleSheet} from 'react-native';
import type {DeviceSepoliaDefiConnectionV7} from '@lianum/mobile-protocol/device/sepolia-defi-connection-v7';
import type {DeviceSepoliaDefiReviewV4} from '@lianum/mobile-protocol/device/sepolia-defi-review-v4';
import {deviceDefiAmountToAtomicV1} from '@lianum/mobile-protocol/device/defi-operation-flow-v1';
import type {DeviceSepoliaDefiSharesApiV4} from '../api/device-sepolia-defi-shares-api-v4.mjs';
import type {DeviceSepoliaDefiVaultV7} from '../api/device-sepolia-defi-financial-api-v7.mjs';
import type {NativeWalletUiPortV1} from '../native-wallet/native-wallet-ui-port';
import {readSepoliaDefiWalletRecipientV7,normalizeSepoliaDefiRecipientV7} from '../native-wallet/sepolia-defi-recipient-v7';
import {deviceSepoliaDefiFeedbackV7} from '../screens/sepolia-defi-feedback-v7.mjs';
import {formatDeviceSepoliaDefiAtomicV7} from '../screens/sepolia-defi-review-presenter-v7.mjs';
import {WalletButton,WalletCard,WalletField,WalletStatus,walletColors} from './wallet-ui';

export default function SepoliaDefiProposalFormV7({connection,vault,api,wallet,action,active,onProposal,onBusyChange}:{
  connection:DeviceSepoliaDefiConnectionV7;vault:DeviceSepoliaDefiVaultV7;api:DeviceSepoliaDefiSharesApiV4;
  wallet:Pick<NativeWalletUiPortV1,'readState'>;action:'INVEST'|'REDEEM';active:boolean;
  onProposal(review:DeviceSepoliaDefiReviewV4):void;onBusyChange?(busy:boolean):void;
}) {
  const [shares,setShares]=useState('1'),[limit,setLimit]=useState(formatDeviceSepoliaDefiAtomicV7(action==='INVEST'?connection.terms.maximumInputAtomic:connection.terms.minimumAssetsAtomic,6));
  const [recipient,setRecipient]=useState(connection.terms.underlyingReceiver??''),[ownRecipient,setOwnRecipient]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const mounted=useRef(true),dirtyRecipient=useRef(false),running=useRef(false),live=useRef(active);live.current=active;
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  useEffect(()=>{
    if(!active||connection.terms.underlyingReceiver!==null)return;const controller=new AbortController();
    void readSepoliaDefiWalletRecipientV7(wallet,controller.signal).then(address=>{if(!controller.signal.aborted&&mounted.current&&!dirtyRecipient.current&&address){setRecipient(address);setOwnRecipient(true);}}).catch(()=>{if(!controller.signal.aborted&&mounted.current)setError('No se ha podido consultar tu dirección Ethereum. Puedes introducir la dirección de destino que revisarás antes de autorizar.');});
    return()=>controller.abort();
  },[active,wallet,connection]);
  async function prepare() {
    if(running.current||!live.current)return;running.current=true;setBusy(true);setError('');onBusyChange?.(true);
    try{const selected=normalizeSepoliaDefiRecipientV7(recipient),sharesAtomic=deviceDefiAmountToAtomicV1(shares,connection.descriptor.assetMetadata.decimals),limitAtomic=deviceDefiAmountToAtomicV1(limit,6);
      const review=await api.propose(vault,{action,sharesAtomic,maximumInputAtomic:action==='INVEST'?limitAtomic:null,minimumAssetsAtomic:action==='REDEEM'?limitAtomic:null,underlyingReceiver:selected});
      if(mounted.current&&live.current)onProposal(review);
    }catch(failure){if(mounted.current&&live.current)setError(deviceSepoliaDefiFeedbackV7(failure,true));}
    finally{running.current=false;onBusyChange?.(false);if(mounted.current)setBusy(false);}
  }
  const name=connection.protocol==='AAVE_STATIC'?'Aave':'Morpho';
  return <WalletCard title={action==='INVEST'?'Preparar inversión en '+name:'Preparar retirada de '+name} subtitle="El servicio consultará la cotización real. Después revisarás la propuesta antes de autorizar.">
    <WalletStatus kind="info" title="Red de pruebas Sepolia" detail="Se utilizan activos de prueba. Esta operación no modifica tus saldos de Ethereum mainnet."/>
    <WalletField label={action==='INVEST'?'Participaciones que quieres recibir':'Participaciones que quieres retirar'} value={shares} onChangeText={setShares} keyboardType="decimal-pad" editable={active&&!busy} help={'Activo: '+connection.descriptor.assetMetadata.symbol}/>
    <WalletField label={action==='INVEST'?'Máximo de USDC que autorizas':'Mínimo de USDC que quieres recibir'} value={limit} onChangeText={setLimit} keyboardType="decimal-pad" editable={active&&!busy}/>
    <WalletField label="Dirección Ethereum para recibir USDC en Sepolia" value={recipient} onChangeText={value=>{dirtyRecipient.current=true;setOwnRecipient(false);setRecipient(value);}} editable={active&&!busy&&connection.terms.underlyingReceiver===null} help={ownRecipient?'Es la dirección pública de tu cartera de monedas. Los activos recibidos pertenecen a Sepolia.':'Comprueba que controlas esta dirección. No introduzcas palabras de recuperación ni claves privadas.'}/>
    <Text style={styles.detail}>USDC de {name} se identifica por este contrato y se mantiene separado de otros tokens:</Text><Text selectable style={styles.address}>{connection.underlying.address}</Text>
    {error!==''&&<WalletStatus kind="warning" title="Propuesta pendiente" detail={error}/>}
    <WalletButton label="Consultar propuesta para revisar" loading={busy} disabled={!active||busy||recipient===''} onPress={()=>void prepare()}/>
  </WalletCard>;
}
const styles=StyleSheet.create({detail:{color:walletColors.muted,fontSize:14,lineHeight:22,marginVertical:8},address:{color:walletColors.text,fontSize:13,lineHeight:20,marginBottom:12}});
