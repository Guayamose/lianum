import {StyleSheet,Text,View} from 'react-native';
import {WalletQuickAction,walletColors} from './wallet-ui';

type WalletAction='send'|'deposit'|'swap'|'invest';

/** Product explanation only. Buttons use the existing wallet action ports. */
export function WalletActions({onAction,disabled=false}:{onAction:(action:WalletAction)=>void;disabled?:boolean}){
 return <View style={styles.container}>
  <View style={styles.context}>
   <Text style={styles.badge}>DEMOSTRACIÓN · FONDOS DE PRUEBA</Text>
   <Text style={styles.contextText}>Prepara pagos de ETH, BTC o SOL con saldo demo y cambia los tokens de tu conexión. Las redes son locales.</Text>
  </View>
  <View style={styles.actions}>
   <WalletQuickAction label="Enviar" symbol="↗" disabled={disabled} onPress={()=>onAction('send')}/>
   <WalletQuickAction label="Cambiar" symbol="⇄" disabled={disabled} onPress={()=>onAction('swap')}/>
   <WalletQuickAction label="Invertir" symbol="◈" disabled={disabled} onPress={()=>onAction('invest')}/>
   <WalletQuickAction label="Añadir saldo" symbol="↓" disabled={disabled} onPress={()=>onAction('deposit')}/>
  </View>
  <View style={styles.unavailable}><Text style={styles.unavailableTitle}>Comprar y vender con euros</Text><Text style={styles.unavailableDetail}>No disponible en esta versión. Cambiar tokens usa criptomonedas como entrada y salida.</Text></View>
 </View>;
}

const styles=StyleSheet.create({container:{marginBottom:20},context:{backgroundColor:walletColors.primarySoft,borderRadius:14,padding:14,marginBottom:10},badge:{fontSize:10,lineHeight:16,fontWeight:'700',letterSpacing:0.4,color:walletColors.primary,marginBottom:4},contextText:{fontSize:13,lineHeight:19,color:walletColors.text},actions:{flexDirection:'row',gap:8},unavailable:{borderTopWidth:1,borderTopColor:walletColors.border,paddingTop:12,marginTop:8},unavailableTitle:{fontSize:12,lineHeight:18,fontWeight:'600',color:walletColors.muted},unavailableDetail:{fontSize:12,lineHeight:18,color:walletColors.muted,marginTop:2}});
