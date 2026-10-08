import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import * as Crypto from 'expo-crypto';
import { MOBILE_ACTIONS, MOBILE_CHAINS, normalizeMobileIntent, type MobileAction, type MobileChain,
  type MobileChallenge, type MobileIntent } from '@lianum/mobile-protocol';
import { createDeviceIdentity, readDevicePublicKey, signReviewedChallenge } from '../custody/key-store';
import { bytesToHex } from '../custody/signing.mjs';
import { readPendingOperation, retainPendingOperation, assertPendingOperationIdentity,
  type PendingOperation, type PendingAuthorization } from '../custody/pending-operations';
import { createMobileApi, type MobileState } from '../api/wallet-api.mjs';
import { createMobileReviewLease, type ReviewLease, type MobileReviewContext } from '../custody/review-lease.mjs';

const defaultOrigin = process.env.EXPO_PUBLIC_API_ORIGIN ?? '';
const allowInsecureLocalhost = __DEV__ && process.env.EXPO_PUBLIC_ALLOW_INSECURE_LOOPBACK === '1';
const labels: Record<MobileAction, string> = { prepare: 'Preparar', execute: 'Ejecutar', reconcile: 'Reconciliar', recover: 'Recuperar' };
const emptyIntent: MobileIntent = { requestId: '', action: 'prepare', kind: 'EXIT', chain: 'ethereum',
  assetId: '', amountAtomic: '', recipient: '', maxFeeAtomic: '0' };
const outcomeLabels = { SUBMITTING: 'Resultado pendiente de comprobar', ACCEPTED: 'Autorización admitida; operación pendiente',
  UNKNOWN: 'Resultado desconocido; conserva el ID y reconcilia', REJECTED: 'Autorización rechazada' };
const allowedCodes = new Set(['MOBILE_PROTECTED_STORAGE_UNAVAILABLE', 'MOBILE_AUTHENTICATION_CANCELLED',
  'MOBILE_KEY_RECOVERY_REQUIRED', 'MOBILE_KEY_REQUIRED', 'MOBILE_SERVICE_UNAVAILABLE', 'MOBILE_CHALLENGE_EXPIRED',
  'MOBILE_ORIGINAL_OPERATION_REQUIRED', 'MOBILE_ORIGINAL_AUTHORIZATION_REQUIRED', 'MOBILE_ORIGIN_INVALID',
  'MOBILE_REVIEW_INACTIVE', 'MOBILE_REVIEW_STALE', 'MOBILE_REVIEW_CHANGED']);
function safeError(error: unknown): string {
  const code = error instanceof Error && allowedCodes.has(error.message) ? error.message : 'MOBILE_REQUEST_FAILED';
  return ({ MOBILE_PROTECTED_STORAGE_UNAVAILABLE: 'Se necesita un dispositivo con biometría protegida y una compilación nativa.',
    MOBILE_AUTHENTICATION_CANCELLED: 'Autenticación cancelada.', MOBILE_KEY_RECOVERY_REQUIRED: 'Tu clave no está accesible. Conserva el dispositivo y sigue la guía de recuperación.',
    MOBILE_KEY_REQUIRED: 'Crea primero tu identidad local.', MOBILE_SERVICE_UNAVAILABLE: 'El servicio no está disponible para esta acción.',
    MOBILE_CHALLENGE_EXPIRED: 'La revisión ha caducado. Solicita una nueva para la operación original.',
    MOBILE_ORIGINAL_OPERATION_REQUIRED: 'Hay una operación pendiente. Recupera su ID antes de continuar.',
    MOBILE_ORIGINAL_AUTHORIZATION_REQUIRED: 'Esta acción ya tiene una autorización original. Conserva su resultado; no vuelvas a enviarla.',
    MOBILE_REVIEW_INACTIVE: 'La revisión ya no está activa. Comprueba disponibilidad y solicita una nueva.',
    MOBILE_REVIEW_STALE: 'Actualiza la disponibilidad con la app abierta antes de revisar.',
    MOBILE_REVIEW_CHANGED: 'Los datos de la revisión cambiaron. Solicita una nueva antes de autorizar.',
    MOBILE_ORIGIN_INVALID: 'Configura el origen HTTPS del servicio.', MOBILE_REQUEST_FAILED: 'No se pudo completar la solicitud. Conserva el ID de la operación.',
  } as Record<string, string>)[code];
}
function ActionButton({ label, onPress, disabled = false, secondary = false }: {
  label: string; onPress(): void; disabled?: boolean; secondary?: boolean;
}) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
    style={[styles.button, secondary && styles.secondaryButton, disabled && styles.disabled]}>
    <Text style={[styles.buttonText, secondary && styles.secondaryText]}>{label}</Text>
  </Pressable>;
}
export default function WalletScreen() {
  const [origin, setOrigin] = useState(defaultOrigin);
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [state, setState] = useState<MobileState | null>(null);
  const [stale, setStale] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('Configura el servicio y comprueba su disponibilidad.');
  const [intent, setIntent] = useState<MobileIntent>(emptyIntent);
  const [challenge, setChallenge] = useState<MobileChallenge | null>(null);
  const [pending, setPending] = useState<PendingOperation | null>(null);
  const observedAt = useRef(0), displayedLease = useRef<ReviewLease | null>(null);
  const currentContext = useRef<MobileReviewContext>({ origin, ownerPublicKey: publicKey, intent,
    connection: state?.connection ?? null, capabilities: state?.capabilities ?? null,
    observedAt: observedAt.current, stale, foreground: AppState.currentState === 'active' });
  currentContext.current = { origin, ownerPublicKey: publicKey, intent, connection: state?.connection ?? null,
    capabilities: state?.capabilities ?? null, observedAt: observedAt.current, stale,
    foreground: AppState.currentState === 'active' };
  const [consent] = useState(() => createMobileReviewLease({
    readContext: () => ({ ...currentContext.current, foreground: AppState.currentState === 'active' }), allowInsecureLocalhost,
  }));
  function invalidateReview(markStale = false) {
    consent.invalidate(); displayedLease.current = null; setChallenge(null);
    if (markStale) { observedAt.current = 0; currentContext.current.stale = true; setStale(true); }
  }

  useEffect(() => {
    readDevicePublicKey().then(value => { consent.invalidate(); setPublicKey(value); }).catch(error => setNotice(safeError(error)));
    const subscription = AppState.addEventListener('change', status => {
      if (status !== 'active') invalidateReview(true);
    });
    return () => { consent.invalidate(); subscription.remove(); };
  }, []);
  async function run(work: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    try { await work(); } catch (error) { setNotice(safeError(error)); }
    finally { setBusy(false); }
  }
  function update(key: keyof MobileIntent, value: string) {
    invalidateReview(); setIntent(current => ({ ...current, [key]: value }));
  }
  async function refresh() {
    invalidateReview(true);
    const api = createMobileApi({ origin, allowInsecureLocalhost });
    const value = await api.state(); observedAt.current = Date.now(); setState(value); setStale(false); setNotice(value.notice);
  }
  async function review() {
    if (!publicKey || stale || !state?.capabilities[intent.action]) throw new Error('MOBILE_SERVICE_UNAVAILABLE');
    const original = await readPendingOperation(allowInsecureLocalhost);
    assertPendingOperationIdentity(original, { origin, ownerPublicKey: publicKey, intent }, allowInsecureLocalhost);
    if (original?.authorizations.some(row => row.authorization.challenge.intent.action === intent.action))
      throw new Error('MOBILE_ORIGINAL_AUTHORIZATION_REQUIRED');
    const ticket = consent.begin(); displayedLease.current = null; setChallenge(null);
    const api = createMobileApi({ origin, allowInsecureLocalhost });
    const value = await api.challenge(publicKey, normalizeMobileIntent(intent));
    const reviewed = consent.finish(ticket, value); displayedLease.current = reviewed.lease;
    setChallenge(reviewed.challenge); setNotice('Comprueba todos los límites antes de autorizar.');
  }
  async function signAndSubmit(lease: ReviewLease) {
    displayedLease.current = null; setChallenge(null);
    // The original ID and signed scope survive a lost reply or app restart.
    const { authorization, result } = await consent.submit(lease, {
      sign: original => signReviewedChallenge(original, original.origin, allowInsecureLocalhost),
      retain: async authorization => {
        setPending(await retainPendingOperation({ authorization, status: 'SUBMITTING' }, allowInsecureLocalhost));
      },
      post: authorization => createMobileApi({ origin: authorization.challenge.origin, allowInsecureLocalhost }).submit(authorization),
    });
    const finished: PendingAuthorization = { authorization, status: result.status };
    setPending(await retainPendingOperation(finished, allowInsecureLocalhost));
    invalidateReview(true); setNotice(outcomeLabels[result.status]);
  }
  function confirm() {
    const lease = displayedLease.current;
    if (!challenge || !lease || busy) return;
    Alert.alert('Autorizar esta operación', 'Confirma exclusivamente los límites que aparecen en esta revisión.', [
      { text: 'Cancelar', style: 'cancel', onPress: () => invalidateReview() },
      { text: 'Autorizar con biometría', onPress: () => { void run(() => signAndSubmit(lease)); } },
    ]);
  }
  async function restoreOriginal() {
    const original = await readPendingOperation(allowInsecureLocalhost);
    if (!original) { setNotice('No hay una operación guardada.'); return; }
    setPending(original); setOrigin(original.authorization.challenge.origin);
    setIntent({ ...original.originalAuthorization.challenge.intent, action: 'reconcile' });
    invalidateReview(true); setNotice(outcomeLabels[original.status]);
  }
  const connected = state?.connection === 'READY' && !stale;
  return <SafeAreaView style={styles.safe}><ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <Text style={styles.brand}>LIANUM</Text>
    <Text style={styles.title}>Tu cartera,{ '\n' }bajo tu control.</Text>
    <View style={styles.status}><View style={[styles.dot, connected && styles.connectedDot]} />
      <Text style={styles.statusText}>{connected ? 'Servicio disponible' : stale ? 'Estado pendiente de actualizar' : 'Servicio desconectado'}</Text></View>
    <View style={styles.card}><Text style={styles.cardTitle}>Saldo privado</Text><Text style={styles.balance}>No disponible</Text>
      <Text style={styles.muted}>El servicio móvil todavía no publica un estado privado verificado.</Text></View>
    <View style={styles.card}><Text style={styles.cardTitle}>Identidad en este dispositivo</Text>
      <Text style={styles.muted}>{publicKey ? 'Clave local protegida por biometría.' : 'Configura tu identidad antes de autorizar.'}</Text>
      {publicKey && <Text selectable style={styles.identifier}>{publicKey}</Text>}
      <ActionButton label={publicKey ? 'Comprobar identidad local' : 'Crear identidad local'} disabled={busy}
        onPress={() => { void run(async () => { invalidateReview(true); setPublicKey(await createDeviceIdentity()); setNotice('Identidad local preparada.'); }); }} />
      <Text style={styles.small}>La recuperación de fondos y la migración de dispositivo necesitan una integración adicional. Usa esta base para desarrollo.</Text>
    </View>
    <View style={styles.card}><Text style={styles.cardTitle}>Servicio</Text><Text style={styles.label}>Origen HTTPS</Text>
      <TextInput accessibilityLabel="Origen HTTPS del servicio" autoCapitalize="none" autoCorrect={false} keyboardType="url" editable={!busy}
        style={styles.input} value={origin} placeholder="https://tu-servicio.run.app" placeholderTextColor="#7f8d94"
        onChangeText={value => { invalidateReview(true); setOrigin(value); setState(null); }} />
      <ActionButton label="Actualizar disponibilidad" secondary disabled={busy} onPress={() => { void run(refresh); }} />
    </View>
    <View style={styles.card}><Text style={styles.cardTitle}>Operación manual</Text>
      <Text style={styles.muted}>Una operación activa. Su ID original se conserva durante ejecución, reconciliación y recuperación.</Text>
      <View style={styles.choices}>{MOBILE_ACTIONS.map(action => <Pressable key={action} disabled={busy}
        accessibilityRole="button" accessibilityState={{ selected: intent.action === action }}
        onPress={() => update('action', action)} style={[styles.choice, intent.action === action && styles.selectedChoice]}>
        <Text style={styles.choiceText}>{labels[action]}</Text></Pressable>)}</View>
      <Text style={styles.label}>Tipo</Text><View style={styles.choices}>{(['TOP_UP', 'EXIT'] as const).map(kind =>
        <Pressable key={kind} disabled={busy} accessibilityRole="button" onPress={() => update('kind', kind)}
          style={[styles.choice, intent.kind === kind && styles.selectedChoice]}><Text style={styles.choiceText}>{kind === 'EXIT' ? 'Retirada' : 'Financiación'}</Text></Pressable>)}</View>
      <Text style={styles.label}>Red</Text><View style={styles.choices}>{MOBILE_CHAINS.map((chain: MobileChain) =>
        <Pressable key={chain} disabled={busy} accessibilityRole="button" onPress={() => update('chain', chain)}
          style={[styles.choice, intent.chain === chain && styles.selectedChoice]}><Text style={styles.choiceText}>{chain}</Text></Pressable>)}</View>
      {([['requestId', 'ID original de la operación'], ['assetId', 'Identidad del activo (64 caracteres hex)'],
        ['amountAtomic', 'Importe en unidades atómicas'], ['recipient', 'Destino exacto'], ['maxFeeAtomic', 'Comisión máxima en unidades atómicas']] as const).map(([key, label]) =>
        <View key={key}><Text style={styles.label}>{label}</Text><TextInput accessibilityLabel={label} autoCapitalize="none" autoCorrect={false}
          editable={!busy} value={intent[key]} style={styles.input} keyboardType={key === 'amountAtomic' || key === 'maxFeeAtomic' ? 'number-pad' : 'default'}
          onChangeText={value => update(key, value)} /></View>)}
      <ActionButton label="Crear ID para una operación nueva" secondary disabled={busy || pending !== null}
        onPress={() => { void run(async () => { const entropy = await Crypto.getRandomBytesAsync(16);
          update('requestId', bytesToHex(entropy)); entropy.fill(0); }); }} />
      <ActionButton label="Recuperar operación guardada" secondary disabled={busy} onPress={() => { void run(restoreOriginal); }} />
      <ActionButton label="Solicitar revisión" disabled={busy || !publicKey || stale || !state?.capabilities[intent.action]}
        onPress={() => { void run(review); }} />
    </View>
    {challenge && <View style={[styles.card, styles.review]}><Text style={styles.cardTitle}>Revisión de la autorización</Text>
      {Object.entries({ Servicio: challenge.origin, Acción: labels[challenge.intent.action], Tipo: challenge.intent.kind,
        Red: challenge.intent.chain, Activo: challenge.intent.assetId, Importe: challenge.intent.amountAtomic,
        Destino: challenge.intent.recipient, 'Comisión máxima': challenge.intent.maxFeeAtomic, 'ID original': challenge.intent.requestId,
        Identidad: challenge.ownerPublicKey, Challenge: challenge.challengeId, Nonce: challenge.nonce,
        Caducidad: new Date(challenge.expiresAt).toLocaleString() }).map(([label, value]) =>
        <View key={label}><Text style={styles.label}>{label}</Text><Text selectable style={styles.reviewValue}>{value}</Text></View>)}
      <ActionButton label="Autorizar con biometría" disabled={busy} onPress={confirm} />
      <ActionButton label="Cancelar revisión" secondary disabled={busy} onPress={() => invalidateReview()} />
    </View>}
    {pending && <View style={styles.card}><Text style={styles.cardTitle}>Operación original</Text>
      <Text selectable style={styles.identifier}>{pending.originalAuthorization.challenge.intent.requestId}</Text>
      <Text style={styles.muted}>Resultado económico sin verificar. El rechazo de un permiso posterior no cierra esta operación.</Text>
      {pending.authorizations.map(row => <Text key={row.authorization.challenge.intent.action} style={styles.muted}>
        {labels[row.authorization.challenge.intent.action]}: {outcomeLabels[row.status]}</Text>)}
      {pending.legacyEvidenceIncomplete && <Text style={styles.muted}>El registro anterior no conserva todo el historial de permisos.</Text>}</View>}
    <View accessibilityLiveRegion="polite" style={styles.notice}>{busy && <ActivityIndicator color="#9de3be" />}
      <Text style={styles.noticeText}>{notice}</Text></View>
  </ScrollView></SafeAreaView>;
}
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#101c22' }, content: { padding: 24, paddingBottom: 48, gap: 18 },
  brand: { color: '#9de3be', fontSize: 13, fontWeight: '800', letterSpacing: 4, marginTop: 14 },
  title: { color: '#f3f5ee', fontSize: 34, lineHeight: 40, fontWeight: '600' },
  status: { flexDirection: 'row', alignItems: 'center', gap: 9 }, dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#baa879' },
  connectedDot: { backgroundColor: '#9de3be' }, statusText: { color: '#b8c8cd', fontSize: 13 },
  card: { backgroundColor: '#192a31', borderRadius: 18, padding: 20, gap: 12, borderWidth: 1, borderColor: '#2c3c43' },
  cardTitle: { color: '#eff5ef', fontSize: 19, fontWeight: '600' }, balance: { color: '#eff5ef', fontSize: 27 },
  muted: { color: '#b8c8cd', fontSize: 14, lineHeight: 21 }, small: { color: '#93a6ad', fontSize: 12, lineHeight: 18 },
  identifier: { color: '#bfddd0', fontSize: 11, lineHeight: 18, fontFamily: 'monospace' },
  label: { color: '#cbd9db', fontSize: 12, fontWeight: '600', marginTop: 4, marginBottom: 6 },
  input: { color: '#eff5ef', backgroundColor: '#112129', borderColor: '#42565d', borderWidth: 1, borderRadius: 10, padding: 12, minHeight: 46 },
  button: { backgroundColor: '#9de3be', borderRadius: 10, paddingVertical: 14, paddingHorizontal: 12, alignItems: 'center' },
  buttonText: { color: '#14271e', fontWeight: '700', fontSize: 14 }, secondaryButton: { backgroundColor: '#283e47' },
  secondaryText: { color: '#dae6e6' }, disabled: { opacity: 0.42 }, choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  choice: { backgroundColor: '#243b45', paddingHorizontal: 10, paddingVertical: 9, borderRadius: 8, borderWidth: 1, borderColor: '#243b45' },
  selectedChoice: { borderColor: '#9de3be', backgroundColor: '#315047' }, choiceText: { color: '#e0e9e7', fontSize: 12 },
  review: { borderColor: '#9de3be' }, reviewValue: { color: '#e5efe8', fontSize: 13, lineHeight: 19 },
  notice: { flexDirection: 'row', gap: 12, backgroundColor: '#17262b', padding: 16, borderRadius: 12 },
  noticeText: { color: '#c7d8d9', flex: 1, fontSize: 13, lineHeight: 20 },
});
