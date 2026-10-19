import {Pressable,StyleSheet,View} from 'react-native';
import {WalletText as Text} from '../design/typography';
import {walletColors as c} from '../design/tokens';
import type {NativeWalletEnvironmentV2} from '../native-wallet/native-wallet-ui-port';

export function WalletEnvironmentChoice({network,onChange,disabled=false,changing=false}:{network:NativeWalletEnvironmentV2;onChange:(network:NativeWalletEnvironmentV2)=>void;disabled?:boolean;changing?:boolean}){
 return <View style={s.bar}>
  <View style={s.labels}><Text style={s.title}>{changing?"Changing environment...":network==='testnet'?"Test environment":"Mainnet environment"}</Text><Text style={s.caption}>{network==='testnet'?"Test funds · no real value":"Your real assets"}</Text></View>
  <View style={s.choice} accessibilityRole="radiogroup" accessibilityLabel="wallet environment">{([['mainnet',"Mainnet"],['testnet',"Testnet"]] as const).map(([value,label])=><Pressable key={value} accessibilityRole="radio" accessibilityLabel={`Use environment ${label}`} accessibilityState={{checked:network===value,disabled}} aria-checked={network===value} aria-disabled={disabled} disabled={disabled} onPress={()=>onChange(value)} style={[s.button,network===value&&s.selected,disabled&&s.disabled]}><Text style={[s.buttonText,network===value&&s.selectedText]}>{label}</Text></Pressable>)}</View>
 </View>;
}
const s=StyleSheet.create({bar:{paddingHorizontal:18,paddingVertical:3,flexDirection:'row',alignItems:'center',gap:8,borderBottomWidth:StyleSheet.hairlineWidth,borderColor:c.border},labels:{flex:1,gap:2},title:{fontSize:11,lineHeight:16,color:c.text,fontWeight:'500'},caption:{fontSize:9,lineHeight:13,color:c.muted},choice:{flexDirection:'row',gap:2,alignItems:'center'},button:{minHeight:44,minWidth:66,paddingHorizontal:9,alignItems:'center',justifyContent:'center',borderRadius:5},selected:{backgroundColor:c.primarySoft},buttonText:{fontSize:11,color:c.muted},selectedText:{fontWeight:'600',color:c.text},disabled:{opacity:.45}});
