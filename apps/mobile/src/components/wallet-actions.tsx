import {WalletText as Text} from '../design/typography';
import {StyleSheet,View} from 'react-native';
import {WalletQuickAction,walletColors} from './wallet-ui';

type WalletAction='send'|'deposit'|'swap'|'invest';

/** Product explanation only. Buttons use the existing wallet action ports. */
export function WalletActions({onAction,disabled=false}:{onAction:(action:WalletAction)=>void;disabled?:boolean}){
 return <View style={styles.container}>
  <View style={styles.context}>
   <Text style={styles.badge}>DEMO · TESTNET FUNDS</Text>
   <Text style={styles.contextText}>Prepare ETH, BTC or SOL payments with demo balance and change the tokens of your connection. Networks are local.</Text>
  </View>
  <View style={styles.actions}>
   <WalletQuickAction label="Send" symbol="↗" disabled={disabled} onPress={()=>onAction('send')}/>
   <WalletQuickAction label="Change" symbol="⇄" disabled={disabled} onPress={()=>onAction('swap')}/>
   <WalletQuickAction label="Invest" symbol="◈" disabled={disabled} onPress={()=>onAction('invest')}/>
   <WalletQuickAction label="Add Balance" symbol="↓" disabled={disabled} onPress={()=>onAction('deposit')}/>
  </View>
  <View style={styles.unavailable}><Text style={styles.unavailableTitle}>Buy and sell with euros</Text><Text style={styles.unavailableDetail}>Not available in this version. Change tokens uses cryptocurrencies as input and output.</Text></View>
 </View>;
}

const styles=StyleSheet.create({container:{marginBottom:20},context:{backgroundColor:walletColors.primarySoft,borderRadius:6,padding:14,marginBottom:10},badge:{fontSize:10,lineHeight:16,fontWeight:'700',letterSpacing:0.4,color:walletColors.primary,marginBottom:4},contextText:{fontSize:13,lineHeight:19,color:walletColors.text},actions:{flexDirection:'row',gap:8},unavailable:{borderTopWidth:1,borderTopColor:walletColors.border,paddingTop:12,marginTop:8},unavailableTitle:{fontSize:12,lineHeight:18,fontWeight:'600',color:walletColors.muted},unavailableDetail:{fontSize:12,lineHeight:18,color:walletColors.muted,marginTop:2}});
