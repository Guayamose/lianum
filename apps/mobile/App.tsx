import { useEffect, useState } from 'react';
import { AppState, Pressable, StatusBar, StyleSheet, Text, View } from 'react-native';
import WalletScreen from './src/screens/WalletScreen';
import OriginalAccountScreen from './src/screens/OriginalAccountScreen';
import LocalCustodyScreen from './src/screens/LocalCustodyScreen';
import DeviceDepositScreen from './src/screens/DeviceDepositScreen';
import DefiPositionsScreen from './src/screens/DefiPositionsScreen';
import ExternalTokenNoteScreen from './src/screens/ExternalTokenNoteScreen';
import NativeClaimScreen from './src/screens/NativeClaimScreen';
import PrivateWalletStateScreen from './src/screens/PrivateWalletStateScreen';
import {createPrivateWalletStateV1} from './src/state/private-wallet-state-v1.mjs';
export default function App() {
  const [screen, setScreen] = useState<'wallet' | 'original' | 'custody' | 'deposit' | 'defi' | 'external' | 'state' | 'claims'>('state');
  const [privateState]=useState(()=>createPrivateWalletStateV1());
  useEffect(()=>{const subscription=AppState.addEventListener('change',value=>{if(value!=='active')privateState.clear();});return()=>{privateState.clear();subscription.remove();};},[privateState]);
  return <View style={styles.app}><StatusBar barStyle="light-content" />
    <View style={styles.tabs}>{([['claims','Claims BTC/SOL'],['state','Estado privado'],['wallet', 'Cartera'], ['original', 'Cuenta vinculada'], ['custody', 'Custodia local'], ['deposit', 'Financiar nota'], ['defi', 'Posiciones DeFi'], ['external', 'Nota ERC20']] as const).map(([value, label]) =>
      <Pressable key={value} accessibilityRole="tab" accessibilityState={{ selected: screen === value }}
        onPress={() => setScreen(value)} style={styles.tab}><Text style={[styles.label, screen === value && styles.selected]}>{label}</Text></Pressable>)}</View>
    {screen === 'claims' ? <NativeClaimScreen onObservation={privateState.acceptNativeClaims}/> : screen === 'state' ? <PrivateWalletStateScreen state={privateState} onOpen={setScreen}/> : screen === 'wallet' ? <WalletScreen /> : screen === 'original' ? <OriginalAccountScreen onObservation={privateState.acceptAccount}/> : screen === 'custody' ? <LocalCustodyScreen /> : screen === 'deposit' ? <DeviceDepositScreen onObservation={privateState.acceptNative} onInvalidate={privateState.invalidateNative}/> : screen === 'defi' ? <DefiPositionsScreen onObservation={privateState.acceptPositions}/> : <ExternalTokenNoteScreen onObservation={privateState.acceptExternal} onGraphObservation={privateState.acceptExternalGraph} onSourcePending={privateState.invalidateExternal}/>}

  </View>;
}
const styles = StyleSheet.create({
  app: { flex: 1, backgroundColor: '#101c22' }, tabs: { flexDirection: 'row', flexWrap: 'wrap', paddingTop: 12, paddingHorizontal: 16 },
  tab: { padding: 12 }, label: { color: '#b8c8cd', fontSize: 14 }, selected: { color: '#9de3be', fontWeight: '700' },
});
