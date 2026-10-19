import {StyleSheet,View} from 'react-native';
import {WalletText as Text} from '../design/typography';
import {WalletIcon} from '../design/Icon';
import {walletColors} from '../design/tokens';
import {WalletButton,WalletCard,WalletScreenLayout,WalletStatus} from '../components/wallet-ui';

type Destination='state'|'privateActivity'|'native'|'agent'|'recovery'|'pagedGraph'|'external'|'paged'|'claims'|'wallet'|'original'|'custody'|'deposit'|'investment';
type Props={identity:string|null;blocked:boolean;recoveryBusy:boolean;workBusy:boolean;advanced:boolean;onToggleAdvanced:()=>void;onNavigate:(destination:Destination)=>void;onLock:()=>void;advancedScreens:readonly(readonly[Destination,string])[]};

/** Adapts the available design's Settings/Security layout to the actual wallet. */
export default function WalletSettingsScreen({identity,blocked,recoveryBusy,workBusy,advanced,onToggleAdvanced,onNavigate,onLock,advancedScreens}:Props){
 return <WalletScreenLayout title="Más" subtitle="Tu autoridad. Protegida desde este dispositivo.">
  {workBusy&&<WalletStatus kind="info" title="Operación en curso" detail="Puedes consultar tu cartera y su actividad. Espera a que termine antes de cambiar de conexión o recuperar una copia."/>}
  <View style={styles.securityHero}>
   <WalletIcon name="shield" size={30} color={walletColors.accent}/>
   <Text style={styles.heroTitle}>El control empieza{String.fromCharCode(10)}en tu dispositivo.</Text>
   <Text style={styles.heroDescription}>Revisa cada movimiento antes de autorizar. Tus claves permanecen protegidas en este móvil.</Text>
   <View style={styles.heroBadge}><Text style={styles.heroBadgeText}>Sesión desbloqueada</Text></View>
  </View>
  <Text style={styles.sectionLabel}>SEGURIDAD</Text>
  <WalletCard>
   <View style={styles.infoRow}><Text style={styles.infoLabel}>Confirmación</Text><Text style={styles.infoValue}>Biometría del dispositivo</Text></View>
   <View style={styles.infoRow}><Text style={styles.infoLabel}>Bloqueo de sesión</Text><Text style={styles.infoValue}>Al salir o por inactividad</Text></View>
   <WalletButton label="Bloquear cartera" tone="secondary" disabled={recoveryBusy} onPress={onLock}/>
  </WalletCard>
  <Text style={styles.sectionLabel}>RECUPERACIÓN</Text>
  <WalletCard title="Cartera de monedas" subtitle="Las direcciones de Bitcoin, Ethereum y Solana se recuperan con las mismas palabras.">
   <WalletButton label="Ver cartera y palabras de recuperación" tone="secondary" disabled={blocked} onPress={()=>onNavigate('native')}/>
  </WalletCard>
  <WalletCard title="Cuentas privadas" subtitle="Guarda una copia cifrada de tu identidad y tus cuentas vinculadas. Los servicios vinculados necesitan también sus copias originales.">
   <WalletButton label="Guardar o recuperar cuentas privadas" tone="secondary" disabled={blocked} onPress={()=>onNavigate('recovery')}/>
  </WalletCard>
  <Text style={styles.sectionLabel}>PROPUESTAS Y OPERACIONES</Text>
  <WalletCard title="Tu agente" subtitle="Recibe una propuesta, revisa sus pagos y autoriza una vez. El agente sólo podrá consultar la operación aprobada.">
   <WalletButton label="Ver propuestas del agente" tone="secondary" disabled={blocked} onPress={()=>onNavigate('agent')}/>
  </WalletCard>
  <WalletCard title="Inversiones de prueba" subtitle="Consulta y gestiona tus inversiones de Aave y Morpho en Sepolia."><WalletButton label="Abrir inversiones" tone="secondary" disabled={blocked} onPress={()=>onNavigate('investment')}/></WalletCard>
  <WalletButton label={advanced?'Ocultar herramientas avanzadas':'Herramientas avanzadas y recuperación'} tone="secondary" onPress={onToggleAdvanced}/>
  {advanced&&<WalletCard title="Conexiones y herramientas" subtitle="La app conserva las conexiones. Cada saldo requiere una consulta de su servicio.">
   <WalletButton label="Conexión de pagos" tone="secondary" disabled={blocked} onPress={()=>onNavigate('pagedGraph')}/>
   <WalletButton label="Conexión DeFi" tone="secondary" disabled={blocked} onPress={()=>onNavigate('investment')}/>
   {advancedScreens.map(([destination,label])=><WalletButton key={destination} label={label} tone="secondary" onPress={()=>onNavigate(destination)}/>)}
   <Text selectable style={styles.identity}>Identidad del dispositivo{String.fromCharCode(10)}{identity}</Text>
  </WalletCard>}
 </WalletScreenLayout>;
}

const styles=StyleSheet.create({
 securityHero:{backgroundColor:walletColors.primary,borderRadius:8,padding:20,gap:16,marginBottom:24},heroTitle:{color:walletColors.background,fontSize:24,lineHeight:31,fontWeight:'500',letterSpacing:-0.5},heroDescription:{color:'#E7DEC1',fontSize:12,lineHeight:19},heroBadge:{alignSelf:'flex-start',borderRadius:4,paddingVertical:5,paddingHorizontal:8,backgroundColor:'#354B43'},heroBadgeText:{fontSize:10,fontWeight:'500',color:'#F3F0E8'},sectionLabel:{fontSize:10,letterSpacing:1.2,color:walletColors.muted,marginBottom:12,marginTop:4},infoRow:{flexDirection:'row',justifyContent:'space-between',alignItems:'flex-start',gap:16,paddingBottom:14},infoLabel:{fontSize:12,lineHeight:19,color:walletColors.muted,flex:1},infoValue:{fontSize:12,lineHeight:19,color:walletColors.text,textAlign:'right',flex:1.3},identity:{fontSize:11,lineHeight:18,color:walletColors.muted,marginTop:16},
});
