import {StyleSheet,View} from 'react-native';
import {WalletText as Text} from '../design/typography';
import {WalletIcon} from '../design/Icon';
import {walletColors} from '../design/tokens';
import {WalletButton,WalletCard,WalletScreenLayout,WalletStatus} from '../components/wallet-ui';

type Destination='state'|'privateActivity'|'native'|'agent'|'recovery'|'pagedGraph'|'external'|'paged'|'claims'|'wallet'|'original'|'custody'|'deposit'|'investment';
type Props={identity:string|null;blocked:boolean;recoveryBusy:boolean;workBusy:boolean;advanced:boolean;onToggleAdvanced:()=>void;onNavigate:(destination:Destination)=>void;onLock:()=>void;advancedScreens:readonly(readonly[Destination,string])[]};

/** Adapts the available design's Settings/Security layout to the actual wallet. */
export default function WalletSettingsScreen({identity,blocked,recoveryBusy,workBusy,advanced,onToggleAdvanced,onNavigate,onLock,advancedScreens}:Props){
 return <WalletScreenLayout title="More" subtitle="Your keys and approvals, protected on this device.">
  {workBusy&&<WalletStatus kind="info" title="Operation in progress" detail="You can check your wallet and its activity. Wait for it to end before you change your connection or recover a copy."/>}
  <View style={styles.securityHero}>
   <WalletIcon name="shield" size={30} color={walletColors.accent}/>
   <Text style={styles.heroTitle}>Control starts{String.fromCharCode(10)}on your device.</Text>
   <Text style={styles.heroDescription}>Review each action before approving. Your keys stay protected on this device.</Text>
   <View style={styles.heroBadge}><Text style={styles.heroBadgeText}>Unlocked session</Text></View>
  </View>
  <Text style={styles.sectionLabel}>SECURITY</Text>
  <WalletCard>
   <View style={styles.infoRow}><Text style={styles.infoLabel}>Confirmation</Text><Text style={styles.infoValue}>Device biometrics</Text></View>
   <View style={styles.infoRow}><Text style={styles.infoLabel}>Session lock</Text><Text style={styles.infoValue}>When you leave or become inactive</Text></View>
   <WalletButton label="Lock wallet" tone="secondary" disabled={recoveryBusy} onPress={onLock}/>
  </WalletCard>
  <Text style={styles.sectionLabel}>RECOVERY</Text>
  <WalletCard title="Coin wallet" subtitle="The addresses of Bitcoin, Ethereum and Solana are recovered with the same words.">
   <WalletButton label="View wallet and recovery words" tone="secondary" disabled={blocked} onPress={()=>onNavigate('native')}/>
  </WalletCard>
  <WalletCard title="Private accounts" subtitle="Save an encrypted copy of your identity and linked accounts. Linked services also need their original copies.">
   <WalletButton label="Save or recover private accounts" tone="secondary" disabled={blocked} onPress={()=>onNavigate('recovery')}/>
  </WalletCard>
  <Text style={styles.sectionLabel}>PROPOSALS AND OPERATIONS</Text>
  <WalletCard title="Your agent" subtitle="Receive a proposal, review its payments and approve once. The agent can then observe the approved operation.">
   <WalletButton label="View agent proposals" tone="secondary" disabled={blocked} onPress={()=>onNavigate('agent')}/>
  </WalletCard>
  <WalletCard title="Evidence investments" subtitle="View and manage your Aave and Morpho investments on Sepolia."><WalletButton label="Open investments" tone="secondary" disabled={blocked} onPress={()=>onNavigate('investment')}/></WalletCard>
  <WalletButton label={advanced?"Hide Advanced Tools":"Advanced Tools and Recovery"} tone="secondary" onPress={onToggleAdvanced}/>
  {advanced&&<WalletCard title="Connections and tools" subtitle="The app retains connections. Each balance requires a query of your service.">
   <WalletButton label="Payment connection" tone="secondary" disabled={blocked} onPress={()=>onNavigate('pagedGraph')}/>
   <WalletButton label="DeFi connection" tone="secondary" disabled={blocked} onPress={()=>onNavigate('investment')}/>
   {advancedScreens.map(([destination,label])=><WalletButton key={destination} label={label} tone="secondary" onPress={()=>onNavigate(destination)}/>)}
   <Text selectable style={styles.identity}>Device identity{String.fromCharCode(10)}{identity}</Text>
  </WalletCard>}
 </WalletScreenLayout>;
}

const styles=StyleSheet.create({
 securityHero:{backgroundColor:walletColors.primary,borderRadius:8,padding:20,gap:16,marginBottom:24},heroTitle:{color:walletColors.background,fontSize:24,lineHeight:31,fontWeight:'500',letterSpacing:-0.5},heroDescription:{color:'#E7DEC1',fontSize:12,lineHeight:19},heroBadge:{alignSelf:'flex-start',borderRadius:4,paddingVertical:5,paddingHorizontal:8,backgroundColor:'#354B43'},heroBadgeText:{fontSize:10,fontWeight:'500',color:'#F3F0E8'},sectionLabel:{fontSize:10,letterSpacing:1.2,color:walletColors.muted,marginBottom:12,marginTop:4},infoRow:{flexDirection:'row',justifyContent:'space-between',alignItems:'flex-start',gap:16,paddingBottom:14},infoLabel:{fontSize:12,lineHeight:19,color:walletColors.muted,flex:1},infoValue:{fontSize:12,lineHeight:19,color:walletColors.text,textAlign:'right',flex:1.3},identity:{fontSize:11,lineHeight:18,color:walletColors.muted,marginTop:16},
});
