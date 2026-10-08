import { useState } from 'react';
import { Pressable, StatusBar, StyleSheet, Text, View } from 'react-native';
import WalletScreen from './src/screens/WalletScreen';
import OriginalAccountScreen from './src/screens/OriginalAccountScreen';
export default function App() {
  const [screen, setScreen] = useState<'wallet' | 'original'>('wallet');
  return <View style={styles.app}><StatusBar barStyle="light-content" />
    <View style={styles.tabs}>{([['wallet', 'Cartera'], ['original', 'Cuenta vinculada']] as const).map(([value, label]) =>
      <Pressable key={value} accessibilityRole="tab" accessibilityState={{ selected: screen === value }}
        onPress={() => setScreen(value)} style={styles.tab}><Text style={[styles.label, screen === value && styles.selected]}>{label}</Text></Pressable>)}</View>
    {screen === 'wallet' ? <WalletScreen /> : <OriginalAccountScreen />}
  </View>;
}
const styles = StyleSheet.create({
  app: { flex: 1, backgroundColor: '#101c22' }, tabs: { flexDirection: 'row', paddingTop: 12, paddingHorizontal: 16 },
  tab: { padding: 12 }, label: { color: '#b8c8cd', fontSize: 14 }, selected: { color: '#9de3be', fontWeight: '700' },
});
