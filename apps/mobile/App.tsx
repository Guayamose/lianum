import { useState } from 'react';
import { Pressable, StatusBar, StyleSheet, Text, View } from 'react-native';
import WalletScreen from './src/screens/WalletScreen';
import OriginalAccountScreen from './src/screens/OriginalAccountScreen';
import LocalCustodyScreen from './src/screens/LocalCustodyScreen';
import DeviceDepositScreen from './src/screens/DeviceDepositScreen';
import DefiPositionsScreen from './src/screens/DefiPositionsScreen';
import ExternalTokenNoteScreen from './src/screens/ExternalTokenNoteScreen';
export default function App() {
  const [screen, setScreen] = useState<'wallet' | 'original' | 'custody' | 'deposit' | 'defi' | 'external'>('wallet');
  return <View style={styles.app}><StatusBar barStyle="light-content" />
    <View style={styles.tabs}>{([['wallet', 'Cartera'], ['original', 'Cuenta vinculada'], ['custody', 'Custodia local'], ['deposit', 'Financiar nota'], ['defi', 'Posiciones DeFi'], ['external', 'Nota ERC20']] as const).map(([value, label]) =>
      <Pressable key={value} accessibilityRole="tab" accessibilityState={{ selected: screen === value }}
        onPress={() => setScreen(value)} style={styles.tab}><Text style={[styles.label, screen === value && styles.selected]}>{label}</Text></Pressable>)}</View>
    {screen === 'wallet' ? <WalletScreen /> : screen === 'original' ? <OriginalAccountScreen /> : screen === 'custody' ? <LocalCustodyScreen /> : screen === 'deposit' ? <DeviceDepositScreen /> : screen === 'defi' ? <DefiPositionsScreen /> : <ExternalTokenNoteScreen />}

  </View>;
}
const styles = StyleSheet.create({
  app: { flex: 1, backgroundColor: '#101c22' }, tabs: { flexDirection: 'row', flexWrap: 'wrap', paddingTop: 12, paddingHorizontal: 16 },
  tab: { padding: 12 }, label: { color: '#b8c8cd', fontSize: 14 }, selected: { color: '#9de3be', fontWeight: '700' },
});
