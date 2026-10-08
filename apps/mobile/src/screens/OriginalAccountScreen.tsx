import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { fetch as expoFetch } from 'expo/fetch';
import type { OriginalAccountAccessV2, OriginalAccountReviewV2, OriginalAccountActionV2 } from '@lianum/mobile-protocol/original-account-v2';
import { readDevicePublicKey, signOriginalAccountAccessV2, signOriginalAccountReviewV2 } from '../custody/key-store';
import { createOriginalAccountLeaseV2, type OriginalAccountContextV2,
  type OriginalAccountAccessLeaseV2, type OriginalAccountReviewLeaseV2 } from '../custody/original-account-lease-v2.mjs';
import { createOriginalAccountApiV2, type OriginalAccountDiagnosticV2 } from '../api/original-account-api-v2.mjs';

function Button({ label, onPress, disabled = false }: { label: string; onPress(): void; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled}
    onPress={onPress} style={[styles.button, disabled && styles.disabled]}><Text style={styles.buttonText}>{label}</Text></Pressable>;
}
function Fields({ values }: { values: Record<string, string | number> }) {
  return <>{Object.entries(values).map(([label, value]) => <View key={label}>
    <Text style={styles.label}>{label}</Text><Text selectable style={styles.value}>{value}</Text></View>)}</>;
}
export default function OriginalAccountScreen() {
  const [origin, setOrigin] = useState(''), [pairingId, setPairingId] = useState('');
  const [devicePublicKey, setDevicePublicKey] = useState<string | null>(null);
  const [action, setAction] = useState<OriginalAccountActionV2>('read');
  const [busy, setBusy] = useState(false), busyRef = useRef(false);
  const [available, setAvailable] = useState(false);
  const [notice, setNotice] = useState('Introduce la vinculación entregada por el operador de tu cuenta.');
  const [access, setAccess] = useState<OriginalAccountAccessV2 | null>(null);
  const [review, setReview] = useState<OriginalAccountReviewV2 | null>(null);
  const [diagnostic, setDiagnostic] = useState<OriginalAccountDiagnosticV2 | null>(null);
  const accessLease = useRef<OriginalAccountAccessLeaseV2 | null>(null);
  const reviewLease = useRef<OriginalAccountReviewLeaseV2 | null>(null);
  const mounted = useRef(true);
  const observationEpoch = useRef(0);
  const context = useRef<OriginalAccountContextV2>({ origin, pairingId, devicePublicKey, action, foreground: false });
  context.current = { origin, pairingId, devicePublicKey, action, foreground: AppState.currentState === 'active' };
  const [consent] = useState(() => createOriginalAccountLeaseV2({
    readContext: () => ({ ...context.current, foreground: AppState.currentState === 'active' }),
  }));
  function invalidate() {
    observationEpoch.current++;
    consent.invalidate(); accessLease.current = null; reviewLease.current = null;
    setAccess(null); setReview(null); setDiagnostic(null);
  }
  useEffect(() => {
    mounted.current = true;
    const subscription = AppState.addEventListener('change', value => {
      if (value !== 'active') { invalidate(); setAvailable(false); }
    });
    return () => { mounted.current = false; consent.invalidate(); subscription.remove(); };
  }, []);
  async function run(work: () => Promise<void>) {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true);
    try { await work(); }
    catch { if (mounted.current) setNotice('No se pudo completar la consulta. Conserva la petición original y comprueba el servicio.'); }
    finally { busyRef.current = false; if (mounted.current) setBusy(false); }
  }
  function api() {
    if (!devicePublicKey) throw new Error('MOBILE_KEY_REQUIRED');
    return createOriginalAccountApiV2({ descriptor: { origin, pairingId, devicePublicKey }, fetchImpl: expoFetch });
  }
  async function refresh() {
    invalidate(); setAvailable(false);
    const generation = observationEpoch.current;
    const key = await readDevicePublicKey();
    if (!key) throw new Error('MOBILE_KEY_REQUIRED');
    if (!mounted.current || AppState.currentState !== 'active' || observationEpoch.current !== generation) return;
    setDevicePublicKey(key); context.current = { ...context.current, devicePublicKey: key };
    const client = createOriginalAccountApiV2({ descriptor: { origin, pairingId, devicePublicKey: key }, fetchImpl: expoFetch });
    await client.state();
    if (!mounted.current || AppState.currentState !== 'active' || observationEpoch.current !== generation) return;
    setAvailable(true); setNotice('Servicio de revisión disponible. El saldo privado sigue pendiente de verificar.');
  }
  async function requestAccess() {
    invalidate(); const ticket = consent.begin();
    const value = await api().challenge(action);
    const selected = consent.finishAccess(ticket, value);
    if (!mounted.current) return;
    accessLease.current = selected.lease; setAccess(selected.value);
    setNotice('Autoriza primero que el servicio muestre la revisión privada de la cuenta vinculada.');
  }
  async function openReview(lease: OriginalAccountAccessLeaseV2) {
    accessLease.current = null; setAccess(null);
    const selected = await consent.openReview(lease, {
      sign: value => signOriginalAccountAccessV2(value, value.origin, value.pairingId),
      post: request => api().openReview(request),
    });
    if (!mounted.current || AppState.currentState !== 'active') return;
    reviewLease.current = selected.lease; setReview(selected.value);
    setNotice('Comprueba los términos originales antes de confirmar la consulta o reconciliación.');
  }
  async function submit(lease: OriginalAccountReviewLeaseV2) {
    reviewLease.current = null; setReview(null);
    const result = await consent.submit(lease, {
      sign: value => signOriginalAccountReviewV2(value, value.origin, value.pairingId),
      post: request => api().submit(request),
    });
    if (!mounted.current || AppState.currentState !== 'active') return;
    setDiagnostic(result); setNotice('Diagnóstico recibido. El estado de fondos y el saldo siguen pendientes de verificar.');
  }
  function confirmAccess() {
    const lease = accessLease.current;
    if (!lease || !access || busyRef.current) return;
    Alert.alert('Mostrar la revisión privada', 'Permite que este servicio muestre los términos de la cuenta vinculada.', [
      { text: 'Cancelar', style: 'cancel', onPress: invalidate },
      { text: 'Confirmar con biometría', onPress: () => { void run(() => openReview(lease)); } },
    ]);
  }
  function confirmReview() {
    const lease = reviewLease.current;
    if (!lease || !review || busyRef.current) return;
    Alert.alert(review.action === 'read' ? 'Consultar esta petición' : 'Reconciliar esta petición',
      review.action === 'read' ? 'Consulta el registro de la petición original con los términos mostrados.'
        : 'Comprueba la petición ya iniciada y actualiza su registro original con los términos mostrados.', [
        { text: 'Cancelar', style: 'cancel', onPress: invalidate },
        { text: 'Confirmar con biometría', onPress: () => { void run(() => submit(lease)); } },
      ]);
  }
  return <SafeAreaView style={styles.safe}><ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <Text style={styles.title}>Cuenta vinculada</Text>
    <Text style={styles.muted}>Consulta y reconciliación de una petición original. La custodia de notas permanece en el sistema original; el dispositivo autoriza cada consulta.</Text>
    <View style={styles.card}><Text style={styles.heading}>Vinculación</Text>
      <Text style={styles.label}>Origen HTTPS del servicio privado</Text>
      <TextInput accessibilityLabel="Origen HTTPS del servicio privado" style={styles.input} value={origin}
        autoCapitalize="none" autoCorrect={false} keyboardType="url" editable={!busy}
        onChangeText={value => { invalidate(); setAvailable(false); setOrigin(value); }} />
      <Text style={styles.label}>ID recibido del operador</Text>
      <TextInput accessibilityLabel="ID de vinculación recibido del operador" style={styles.input} value={pairingId}
        autoCapitalize="none" autoCorrect={false} editable={!busy}
        onChangeText={value => { invalidate(); setAvailable(false); setPairingId(value); }} />
      <Button label="Comprobar vinculación" disabled={busy} onPress={() => { void run(refresh); }} />
      {devicePublicKey && <Fields values={{ 'Identidad del dispositivo': devicePublicKey }} />}
      <Text style={styles.muted}>{available ? 'Servicio de revisión disponible' : 'Servicio pendiente de comprobar'}</Text>
    </View>
    <View style={styles.card}><Text style={styles.heading}>Petición original</Text>
      {(['read', 'reconcile'] as const).map(value => <Button key={value}
        label={(value === action ? '✓ ' : '') + (value === 'read' ? 'Consultar registro' : 'Reconciliar petición iniciada')}
        disabled={busy} onPress={() => { invalidate(); setAction(value); }} />)}
      <Button label="Solicitar revisión" disabled={busy || !available || !devicePublicKey}
        onPress={() => { void run(requestAccess); }} />
    </View>
    {access && <View style={styles.card}><Text style={styles.heading}>Acceso a la revisión privada</Text>
      <Fields values={{ Servicio: access.origin, Vinculación: access.pairingId,
        Acción: access.action === 'read' ? 'Consultar registro' : 'Reconciliar petición iniciada',
        Identidad: access.devicePublicKey, Caducidad: new Date(access.expiresAt).toLocaleString() }} />
      <Button label="Mostrar con biometría" disabled={busy} onPress={confirmAccess} />
      <Button label="Cancelar" disabled={busy} onPress={invalidate} />
    </View>}
    {review && <View style={styles.card}><Text style={styles.heading}>Términos de la petición original</Text>
      <Fields values={{ Servicio: review.origin, Acción: review.action === 'read' ? 'Consultar registro' : 'Reconciliar petición iniciada',
        'ID original': review.binding.requestId, Tipo: review.binding.kind === 'TOP_UP' ? 'Financiación' : 'Retirada',
        'Red (chain ID)': review.binding.asset.chainId, Activo: review.binding.asset.symbol,
        'Importe en unidades atómicas': review.binding.amountAtomic, Destino: review.binding.recipient,
        'Estado del registro': review.binding.requestState, 'Cuenta original': review.binding.accountIdentitySHA256,
        'Vida de la cuenta': review.binding.originalAccountLifetime,
        'Transacción iniciada': review.binding.submission?.transactionHash ?? 'Sin transacción iniciada',
        Caducidad: new Date(review.expiresAt).toLocaleString() }} />
      <Button label={review.action === 'read' ? 'Consultar con biometría' : 'Reconciliar con biometría'} disabled={busy} onPress={confirmReview} />
      <Button label="Cancelar" disabled={busy} onPress={invalidate} />
    </View>}
    {diagnostic && <View style={styles.card}><Text style={styles.heading}>Diagnóstico de la petición</Text>
      <Fields values={{ 'ID original': diagnostic.binding.requestId, 'Estado del registro': diagnostic.binding.requestState,
        'Estado de la custodia': diagnostic.binding.authorityStage,
        Reconciliación: diagnostic.admission?.state ?? 'Consulta del registro',
        'Saldo privado': 'Pendiente de verificar' }} />
    </View>}
    <View accessibilityLiveRegion="polite" style={styles.card}>{busy && <ActivityIndicator color="#9de3be" />}
      <Text style={styles.muted}>{notice}</Text></View>
  </ScrollView></SafeAreaView>;
}
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#101c22' }, content: { padding: 24, paddingBottom: 48, gap: 18 },
  title: { color: '#f3f5ee', fontSize: 28, fontWeight: '600' }, heading: { color: '#eff5ef', fontSize: 18, fontWeight: '600' },
  card: { backgroundColor: '#192a31', borderRadius: 18, padding: 20, gap: 12 },
  muted: { color: '#b8c8cd', fontSize: 14, lineHeight: 21 }, label: { color: '#cbd9db', fontSize: 12, fontWeight: '600' },
  value: { color: '#e5efe8', fontSize: 12, lineHeight: 19 },
  input: { color: '#eff5ef', backgroundColor: '#112129', borderColor: '#42565d', borderWidth: 1, borderRadius: 10, padding: 12, minHeight: 46 },
  button: { backgroundColor: '#9de3be', borderRadius: 10, padding: 14, alignItems: 'center' },
  buttonText: { color: '#14271e', fontWeight: '700', fontSize: 14 }, disabled: { opacity: 0.42 },
});
