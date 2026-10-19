import {WalletText as Text,WalletTextInput as TextInput} from '../design/typography';
import {originalFlatIngressFailureMessageV3} from './flat-ingress-feedback-v3.mjs';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, Pressable, SafeAreaView, ScrollView, StyleSheet, View } from 'react-native';
import { fetch as expoFetch } from 'expo/fetch';
import type { OriginalAccountAccessV2, OriginalAccountReviewV2, OriginalAccountActionV2 } from '@lianum/mobile-protocol/original-account-v2';
import type { OriginalPrivateStateObservationV1 } from '@lianum/mobile-protocol/original-account-v2';
import { readDevicePublicKey, signOriginalAccountAccessV2, signOriginalAccountReviewV2,
  signOriginalPrivateStateAccessV1, signOriginalPrivateStateReviewV1 } from '../custody/key-store';
import { createOriginalAccountLeaseV2, type OriginalAccountContextV2,
  type OriginalAccountAccessLeaseV2, type OriginalAccountReviewLeaseV2 } from '../custody/original-account-lease-v2.mjs';
import { createOriginalAccountApiV2, type OriginalAccountDiagnosticV2 } from '../api/original-account-api-v2.mjs';

function Button({ label, onPress, disabled = false }: { label: string; onPress(): void; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled}
    onPress={onPress} style={[styles.button, disabled && styles.disabled]}><Text style={styles.buttonText}>{label}</Text></Pressable>;
}
function amount(atomic: string, decimals: number, symbol: string) {
  const padded = atomic.padStart(decimals + 1, '0');
  const integer = decimals ? padded.slice(0, -decimals) : padded;
  const fraction = decimals ? padded.slice(-decimals).replace(/0+$/, '') : '';
  return integer + (fraction ? '.' + fraction : '') + ' ' + symbol;
}
function Fields({ values }: { values: Record<string, string | number> }) {
  return <>{Object.entries(values).map(([label, value]) => <View key={label}>
    <Text style={styles.label}>{label}</Text><Text selectable style={styles.value}>{value}</Text></View>)}</>;
}
export default function OriginalAccountScreen({onObservation}:{onObservation?(value:OriginalPrivateStateObservationV1):void}={}) {
  const [origin, setOrigin] = useState(''), [pairingId, setPairingId] = useState('');
  const [devicePublicKey, setDevicePublicKey] = useState<string | null>(null);
  const [action, setAction] = useState<OriginalAccountActionV2>('read');
  const [financialRead, setFinancialRead] = useState(false);
  const [privateState, setPrivateState] = useState<OriginalPrivateStateObservationV1 | null>(null);
  const [busy, setBusy] = useState(false), busyRef = useRef(false);
  const [available, setAvailable] = useState(false);
  const [notice, setNotice] = useState("Enter the link delivered by your account operator.");
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
    setAccess(null); setReview(null); setDiagnostic(null); setPrivateState(null);
  }
  useEffect(() => {
    mounted.current = true;
    const subscription = AppState.addEventListener('change', value => {
      if (value !== 'active') { invalidate(); setAvailable(false); }
    });
    return () => { mounted.current = false; consent.invalidate(); subscription.remove(); };
  }, []);
  useEffect(() => {
    if (privateState?.status !== 'LIVE' || !privateState.observed) return;
    const generation = observationEpoch.current;
    const limit = setTimeout(() => {
      if (mounted.current && observationEpoch.current === generation) {
        setPrivateState(null); setNotice("The balance reading has expired. Reauthorize a query to update it.");
      }
    }, Math.max(0, privateState.observed.observedAt + 15_000 - Date.now()));
    return () => clearTimeout(limit);
  }, [privateState]);
  async function run(work: () => Promise<void>) {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true);
    try { await work(); }
    catch(error) { if (mounted.current) setNotice(originalFlatIngressFailureMessageV3(error)??"Could not complete the query. Keep the original request and check the service."); }
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
    setAvailable(true); setNotice("Service available. Each consultation requires your own consent.");
  }
  async function requestAccess() {
    invalidate(); const ticket = consent.begin();
    const value = financialRead ? await api().privateState.challenge() : await api().challenge(action);
    const selected = consent.finishAccess(ticket, value);
    if (!mounted.current) return;
    accessLease.current = selected.lease; setAccess(selected.value);
    setNotice(financialRead ? "Authorize the service to show the account and pool whose private balance you want to check."
      : "First authorize the service to display the linked account’s private review.");
  }
  async function openReview(lease: OriginalAccountAccessLeaseV2) {
    accessLease.current = null; setAccess(null);
    const selected = await consent.openReview(lease, {
      sign: value => financialRead ? signOriginalPrivateStateAccessV1(value, value.origin, value.pairingId)
        : signOriginalAccountAccessV2(value, value.origin, value.pairingId),
      post: request => financialRead ? api().privateState.openReview(request) : api().openReview(request),
    });
    if (!mounted.current || AppState.currentState !== 'active') return;
    reviewLease.current = selected.lease; setReview(selected.value);
    setNotice(financialRead ? "Review the account, network, asset and pool. The next signature reveals only its balance; it does not move funds."
      : "Check the original terms before confirming the query or reconciliation.");
  }
  async function submit(lease: OriginalAccountReviewLeaseV2) {
    reviewLease.current = null; setReview(null);
    if (financialRead) {
      const observed = await consent.submit(lease, {
        sign: value => signOriginalPrivateStateReviewV1(value, value.origin, value.pairingId),
        post: request => api().privateState.submit(request),
      });
      if (!mounted.current || AppState.currentState !== 'active') return;
      setPrivateState(observed);
      onObservation?.(observed);
      setNotice(observed.status === 'LIVE' ? "Checked balance for the account and pool, in the indicated block."
        : "There is no current observation. No previous balance or zero assumption is shown.");
    } else {
      const result = await consent.submit(lease, {
        sign: value => signOriginalAccountReviewV2(value, value.origin, value.pairingId),
        post: request => api().submit(request),
      });
      if (!mounted.current || AppState.currentState !== 'active') return;
      setDiagnostic(result); setNotice("Diagnosis received. This query does not establish a balance.");
    }
  }
  function confirmAccess() {
    const lease = accessLease.current;
    if (!lease || !access || busyRef.current) return;
    Alert.alert("Show private review", financialRead
      ? "It reveals the account, asset and pool that can be consulted. It does not yet authorize the reading of the balance."
      : "Allows this service to display the terms of the linked account.", [
      { text: "Cancel", style: 'cancel', onPress: invalidate },
      { text: "Confirm with biometrics", onPress: () => { void run(() => openReview(lease)); } },
    ]);
  }
  function confirmReview() {
    const lease = reviewLease.current;
    if (!lease || !review || busyRef.current) return;
    Alert.alert(financialRead ? "Read private balance of this account and pool"
      : review.action === 'read' ? "Consult this request" : "Reconciling this request",
      financialRead ? "Reveals the available, reserved and blocked balance of this account, asset and pool. It does not include other assets, does not spend notes and does not move funds."
      : review.action === 'read' ? "Check the record of the original request with the displayed terms."
        : "Check the request already started and update your original record with the terms displayed.", [
        { text: "Cancel", style: 'cancel', onPress: invalidate },
        { text: "Confirm with biometrics", onPress: () => { void run(() => submit(lease)); } },
      ]);
  }
  return <SafeAreaView style={styles.safe}><ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <Text style={styles.title}>Linked account</Text>
    <Text style={styles.muted}>Private status of an account and its pool, with consent separate from consultation or reconciliation of petitions. Note custody remains in the original system.</Text>
    <View style={styles.card}><Text style={styles.heading}>Linking</Text>
      <Text style={styles.label}>HTTPS source of the private service</Text>
      <TextInput accessibilityLabel="HTTPS source of the private service" style={styles.input} value={origin}
        autoCapitalize="none" autoCorrect={false} keyboardType="url" editable={!busy}
        onChangeText={value => { invalidate(); setAvailable(false); setOrigin(value); }} />
      <Text style={styles.label}>Received ID from operator</Text>
      <TextInput accessibilityLabel="Linking ID received from the operator" style={styles.input} value={pairingId}
        autoCapitalize="none" autoCorrect={false} editable={!busy}
        onChangeText={value => { invalidate(); setAvailable(false); setPairingId(value); }} />
      <Button label="Check Link" disabled={busy} onPress={() => { void run(refresh); }} />
      {devicePublicKey && <Fields values={{ "Device identity": devicePublicKey }} />}
      <Text style={styles.muted}>{available ? "Review service available" : "Service to be checked"}</Text>
    </View>
    <View style={styles.card}><Text style={styles.heading}>Original request</Text>
      {(['read', 'reconcile'] as const).map(value => <Button key={value}
        label={(!financialRead && value === action ? '✓ ' : '') + (value === 'read' ? "Check log" : "Reconciling request initiated")}
        disabled={busy} onPress={() => { invalidate(); setFinancialRead(false); setAction(value); }} />)}
      <Button label={(financialRead ? '✓ ' : '') + "Check private balance of this account and pool"}
        disabled={busy} onPress={() => { invalidate(); setFinancialRead(true); setAction('read'); }} />
      <Button label="Request review" disabled={busy || !available || !devicePublicKey}
        onPress={() => { void run(requestAccess); }} />
    </View>
    {access && <View style={styles.card}><Text style={styles.heading}>Access to private review</Text>
      <Fields values={{ "Service": access.origin, "Pairing": access.pairingId,
        "Action": financialRead ? "Review account and pool to read balance" : access.action === 'read' ? "Check log" : "Reconciling request initiated",
        "Identity": access.devicePublicKey, "Expires": new Date(access.expiresAt).toLocaleString('en-US') }} />
      <Button label="Show with biometrics" disabled={busy} onPress={confirmAccess} />
      <Button label="Cancel" disabled={busy} onPress={invalidate} />
    </View>}
    {review && <View style={styles.card}><Text style={styles.heading}>{financialRead ? "Account and pool review" : "Terms of the original petition"}</Text>
      <Fields values={{ "Service": review.origin, "Action": financialRead ? "Read private balance of this account and pool" : review.action === 'read' ? "Check log" : "Reconciling request initiated",
        "Original ID": review.binding.requestId, "Type": review.binding.kind === 'TOP_UP' ? "Financing" : "Withdrawal",
        "Network (chain ID)": review.binding.asset.chainId, "Asset": review.binding.asset.symbol, Pool: review.binding.asset.pool,
        [financialRead ? "Original reference amount; not a balance" : "Amount in atomic units"]: review.binding.amountAtomic, "Recipient": review.binding.recipient,
        "Record status": review.binding.requestState, "Original account": review.binding.accountIdentitySHA256,
        "Account Life": review.binding.originalAccountLifetime,
        "Transaction initiated": review.binding.submission?.transactionHash ?? "No transaction initiated",
        "Expires": new Date(review.expiresAt).toLocaleString('en-US') }} />
      <Button label={financialRead ? "Read balance with biometrics" : review.action === 'read' ? "Consult with biometrics" : "Reconciling with biometrics"} disabled={busy} onPress={confirmReview} />
      <Button label="Cancel" disabled={busy} onPress={invalidate} />
    </View>}
    {diagnostic && <View style={styles.card}><Text style={styles.heading}>Request diagnostics</Text>
      <Fields values={{ "Original ID": diagnostic.binding.requestId, "Record status": diagnostic.binding.requestState,
        "State of custody": diagnostic.binding.authorityStage,
        "Reconciliation": diagnostic.admission?.state ?? "Record lookup",
        "Private balance": "Pending verification" }} />
    </View>}
    {privateState && <View style={styles.card}><Text style={styles.heading}>Balance of this account and pool</Text>
      <Fields values={{ "Asset": privateState.asset.symbol, "Network (chain ID)": privateState.asset.chainId,
        Pool: privateState.asset.pool, "Status of observation": privateState.status }} />
      {privateState.status === 'LIVE' && privateState.balances && privateState.observed
        && privateState.observed.observedAt <= Date.now() && Date.now() - privateState.observed.observedAt <= 15_000 && <>
        <Fields values={{ "Available": amount(privateState.balances.available, privateState.asset.decimals, privateState.asset.symbol),
          "Reserved": amount(privateState.balances.reserved, privateState.asset.decimals, privateState.asset.symbol),
          "Locked": amount(privateState.balances.locked, privateState.asset.decimals, privateState.asset.symbol),
          "Recovered amount": amount(privateState.balances.recovery, privateState.asset.decimals, privateState.asset.symbol),
          "Observed block": privateState.observed.blockNumber,
          "Last check": new Date(privateState.observed.observedAt).toLocaleString('en-US') }} />
        <Text style={styles.muted}>Recovery is already part of the available or blocked; it is not added again. This reading corresponds only to this account and pool.</Text>
      </>}
      {privateState.status !== 'LIVE' && <Text style={styles.muted}>Balance not available: a current reading is required.</Text>}
    </View>}
    <View accessibilityLiveRegion="polite" style={styles.card}>{busy && <ActivityIndicator color="#253746" />}
      <Text style={styles.muted}>{notice}</Text></View>
  </ScrollView></SafeAreaView>;
}
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F3F0E8' }, content: { padding: 24, paddingBottom: 48, gap: 18 },
  title: { color: '#253746', fontSize: 28, fontWeight: '600' }, heading: { color: '#253746', fontSize: 18, fontWeight: '600' },
  card: { backgroundColor: '#FAF8F3', borderRadius:6, padding: 20, gap: 12 },
  muted: { color: '#50616D', fontSize: 14, lineHeight: 21 }, label: { color: '#253746', fontSize: 12, fontWeight: '600' },
  value: { color: '#253746', fontSize: 12, lineHeight: 19 },
  input: { color: '#253746', backgroundColor: '#FAF8F3', borderColor: '#89877E', borderWidth: 1, borderRadius: 10, padding: 12, minHeight: 46 },
  button: { backgroundColor: '#253746', borderRadius: 10, padding: 14, alignItems: 'center' },
  buttonText: { color: '#F3F0E8', fontWeight: '700', fontSize: 14 }, disabled: { opacity: 0.42 },
});
