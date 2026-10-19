import {WalletText as Text,WalletTextInput as TextInput} from '../design/typography';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, Pressable, SafeAreaView, ScrollView, StyleSheet, View } from 'react-native';
import * as Crypto from 'expo-crypto';
import { MOBILE_ACTIONS, MOBILE_CHAINS, normalizeMobileIntent, type MobileAction, type MobileChain,
  type MobileChallenge, type MobileIntent, type MobileAuthorization, type MobileReceiptReview } from '@lianum/mobile-protocol';
import { createDeviceIdentity, readDevicePublicKey, signReviewedChallenge, signReviewedReceipt } from '../custody/key-store';
import { bytesToHex } from '../custody/signing.mjs';
import { readPendingOperation, retainPendingOperation, assertPendingOperationIdentity,
  type PendingOperation, type PendingAuthorization } from '../custody/pending-operations';
import { createMobileApi, type MobileState } from '../api/wallet-api.mjs';
import { createMobileReviewLease, type ReviewLease, type MobileReviewContext } from '../custody/review-lease.mjs';
import { createMobileReceiptLease, type ReceiptLease } from '../custody/receipt-lease.mjs';

const defaultOrigin = process.env.EXPO_PUBLIC_API_ORIGIN ?? '';
const allowInsecureLocalhost = __DEV__ && process.env.EXPO_PUBLIC_ALLOW_INSECURE_LOOPBACK === '1';
const labels: Record<MobileAction, string> = { prepare: "Prepare", execute: "Run", reconcile: "Reconcile", recover: "Recover" };
const emptyIntent: MobileIntent = { requestId: '', action: 'prepare', kind: 'EXIT', chain: 'ethereum',
  assetId: '', amountAtomic: '', recipient: '', maxFeeAtomic: '0' };
const outcomeLabels = { SUBMITTING: "Result to be verified", ACCEPTED: "Authorization accepted; pending operation",
  UNKNOWN: "Unknown result; retains ID and reconciles", REJECTED: "Authorisation rejected" };
const allowedCodes = new Set(['MOBILE_PROTECTED_STORAGE_UNAVAILABLE', 'MOBILE_AUTHENTICATION_CANCELLED',
  'MOBILE_KEY_RECOVERY_REQUIRED', 'MOBILE_KEY_REQUIRED', 'MOBILE_SERVICE_UNAVAILABLE', 'MOBILE_CHALLENGE_EXPIRED',
  'MOBILE_ORIGINAL_OPERATION_REQUIRED', 'MOBILE_ORIGINAL_AUTHORIZATION_REQUIRED', 'MOBILE_ORIGIN_INVALID',
  'MOBILE_RECEIPT_EXPIRED',
  'MOBILE_REVIEW_INACTIVE', 'MOBILE_REVIEW_STALE', 'MOBILE_REVIEW_CHANGED']);
function safeError(error: unknown): string {
  const code = error instanceof Error && allowedCodes.has(error.message) ? error.message : 'MOBILE_REQUEST_FAILED';
  return ({ MOBILE_PROTECTED_STORAGE_UNAVAILABLE: "You need a device with protected biometrics and a native compilation.",
    MOBILE_AUTHENTICATION_CANCELLED: "Authentication cancelled.", MOBILE_KEY_RECOVERY_REQUIRED: "Your key is not accessible. Keep the device and follow the recovery guide.",
    MOBILE_KEY_REQUIRED: "Create your local identity first.", MOBILE_SERVICE_UNAVAILABLE: "The service is not available for this action.",
    MOBILE_CHALLENGE_EXPIRED: "Request a new one for the original operation.",
    MOBILE_RECEIPT_EXPIRED: "The consultation has expired. Check the original permit again.",
    MOBILE_ORIGINAL_OPERATION_REQUIRED: "There is a pending operation. Get your ID back before continuing.",
    MOBILE_ORIGINAL_AUTHORIZATION_REQUIRED: "This action already has an original authorization. It retains its result; do not send it again.",
    MOBILE_REVIEW_INACTIVE: "The review is no longer active. Check availability and request a new one.",
    MOBILE_REVIEW_STALE: "Update the availability with the app open before reviewing.",
    MOBILE_REVIEW_CHANGED: "The review data changed. Request a new one before authorizing.",
    MOBILE_ORIGIN_INVALID: "Configure the HTTPS source of the service.", MOBILE_REQUEST_FAILED: "Could not complete the request. Keep the operation ID.",
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
  const [notice, setNotice] = useState("Configure the service and check its availability.");
  const [intent, setIntent] = useState<MobileIntent>(emptyIntent);
  const [challenge, setChallenge] = useState<MobileChallenge | null>(null);
  const [pending, setPending] = useState<PendingOperation | null>(null);
  const [receiptReview, setReceiptReview] = useState<MobileReceiptReview | null>(null);
  const receiptTarget = useRef<MobileAuthorization | null>(null);
  const displayedReceiptLease = useRef<ReceiptLease | null>(null);
  const currentPending = useRef(pending);
  currentPending.current = pending;
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
  const [receiptConsent] = useState(() => createMobileReceiptLease({ allowInsecureLocalhost,
    readContext: () => {
      const authorization = receiptTarget.current;
      const retained = authorization !== null && currentPending.current?.authorizations.some(row =>
        JSON.stringify(row.authorization) === JSON.stringify(authorization));
      return { origin: currentContext.current.origin, ownerPublicKey: currentContext.current.ownerPublicKey,
        authorization: retained ? authorization : null, foreground: AppState.currentState === 'active' };
    },
  }));
  function invalidateReview(markStale = false) {
    consent.invalidate(); displayedLease.current = null; setChallenge(null);
    receiptConsent.invalidate(); receiptTarget.current = null;
    displayedReceiptLease.current = null; setReceiptReview(null);
    if (markStale) { observedAt.current = 0; currentContext.current.stale = true; setStale(true); }
  }

  useEffect(() => {
    readDevicePublicKey().then(value => { consent.invalidate(); setPublicKey(value); }).catch(error => setNotice(safeError(error)));
    const subscription = AppState.addEventListener('change', status => {
      if (status !== 'active') invalidateReview(true);
    });
    return () => { consent.invalidate(); receiptConsent.invalidate(); subscription.remove(); };
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
    invalidateReview();
    if (!publicKey || stale || !state?.capabilities[intent.action]) throw new Error('MOBILE_SERVICE_UNAVAILABLE');
    const original = await readPendingOperation(allowInsecureLocalhost);
    assertPendingOperationIdentity(original, { origin, ownerPublicKey: publicKey, intent }, allowInsecureLocalhost);
    if (original?.authorizations.some(row => row.authorization.challenge.intent.action === intent.action))
      throw new Error('MOBILE_ORIGINAL_AUTHORIZATION_REQUIRED');
    const ticket = consent.begin(); displayedLease.current = null; setChallenge(null);
    const api = createMobileApi({ origin, allowInsecureLocalhost });
    const value = await api.challenge(publicKey, normalizeMobileIntent(intent));
    const reviewed = consent.finish(ticket, value); displayedLease.current = reviewed.lease;
    setChallenge(reviewed.challenge); setNotice("Check all limits before authorizing.");
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
    Alert.alert("Authorize this operation", "It only confirms the limits that appear in this review.", [
      { text: "Cancel", style: 'cancel', onPress: () => invalidateReview() },
      { text: "Authorize with biometrics", onPress: () => { void run(() => signAndSubmit(lease)); } },
    ]);
  }
  async function reviewReceipt(authorization: MobileAuthorization) {
    invalidateReview();
    receiptTarget.current = authorization;
    const ticket = receiptConsent.begin();
    // Re-read the protected original before constructing a permission to query
    // it. A stale UI row cannot supply a replacement authorization.
    const original = await readPendingOperation(allowInsecureLocalhost);
    if (!original?.authorizations.some(row => JSON.stringify(row.authorization) === JSON.stringify(authorization))) {
      throw new Error('MOBILE_ORIGINAL_AUTHORIZATION_REQUIRED');
    }
    currentPending.current = original;
    setPending(original);
    const entropy = await Crypto.getRandomBytesAsync(32);
    try {
      const displayed = receiptConsent.finish(ticket, {
        authorization, nonce: bytesToHex(entropy), expiresAt: Date.now() + 60_000,
      });
      displayedReceiptLease.current = displayed.lease;
      setReceiptReview(displayed.review);
      setNotice("Please consult only the admission of this permit. The financial result remains unverified.");
    } finally { entropy.fill(0); }
  }
  async function queryReceipt(lease: ReceiptLease) {
    displayedReceiptLease.current = null;
    setReceiptReview(null);
    const receipt = await receiptConsent.query(lease, {
      sign: review => signReviewedReceipt(review, review.authorization.challenge.origin, allowInsecureLocalhost),
      post: query => createMobileApi({ origin: query.authorization.challenge.origin, allowInsecureLocalhost }).receipt(query),
      retain: async (authorization, observed) => {
        const retained = await retainPendingOperation({ authorization, status: observed.authorization.status }, allowInsecureLocalhost);
        currentPending.current = retained;
        setPending(retained);
      },
    });
    invalidateReview();
    setNotice(outcomeLabels[receipt.authorization.status] + ". Unverified economic result.");
  }
  function confirmReceipt() {
    const lease = displayedReceiptLease.current;
    if (!receiptReview || !lease || busy) return;
    Alert.alert("Consult this permission", "The firm allows you to read its original admission. It does not authorize movements or confirm funds.", [
      { text: "Cancel", style: 'cancel', onPress: () => invalidateReview() },
      { text: "Consult with biometrics", onPress: () => { void run(() => queryReceipt(lease)); } },
    ]);
  }
  async function restoreOriginal() {
    const original = await readPendingOperation(allowInsecureLocalhost);
    if (!original) { setNotice("There's no operation saved."); return; }
    setPending(original); setOrigin(original.authorization.challenge.origin);
    setIntent({ ...original.originalAuthorization.challenge.intent, action: 'reconcile' });
    invalidateReview(true); setNotice(outcomeLabels[original.status]);
  }
  const connected = state?.connection === 'READY' && !stale;
  return <SafeAreaView style={styles.safe}><ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <Text style={styles.brand}>LIANUM</Text>
    <Text style={styles.title}>Your wallet,{ '\n' }under your control.</Text>
    <View style={styles.status}><View style={[styles.dot, connected && styles.connectedDot]} />
      <Text style={styles.statusText}>{connected ? "Service available" : stale ? "Status to be updated" : "Service disconnected"}</Text></View>
    <View style={styles.card}><Text style={styles.cardTitle}>Private balance</Text><Text style={styles.balance}>Not available</Text>
      <Text style={styles.muted}>The mobile service does not yet publish a verified private status.</Text></View>
    <View style={styles.card}><Text style={styles.cardTitle}>Identity on this device</Text>
      <Text style={styles.muted}>{publicKey ? "Local key protected by biometrics." : "Set up your identity before you authorize."}</Text>
      {publicKey && <Text selectable style={styles.identifier}>{publicKey}</Text>}
      <ActionButton label={publicKey ? "Check local identity" : "Create local identity"} disabled={busy}
        onPress={() => { void run(async () => { invalidateReview(true); setPublicKey(await createDeviceIdentity()); setNotice("Local identity ready."); }); }} />
      <Text style={styles.small}>Fund recovery and device migration need additional integration. Use this base for development.</Text>
    </View>
    <View style={styles.card}><Text style={styles.cardTitle}>Service</Text><Text style={styles.label}>HTTPS Origin</Text>
      <TextInput accessibilityLabel="HTTPS source of the service" autoCapitalize="none" autoCorrect={false} keyboardType="url" editable={!busy}
        style={styles.input} value={origin} placeholder="https://tu-servicio.run.app" placeholderTextColor="#50616D"
        onChangeText={value => { invalidateReview(true); setOrigin(value); setState(null); }} />
      <ActionButton label="Update availability" secondary disabled={busy} onPress={() => { void run(refresh); }} />
    </View>
    <View style={styles.card}><Text style={styles.cardTitle}>Manual operation</Text>
      <Text style={styles.muted}>An active operation. Its original ID is preserved during execution, reconciliation and recovery.</Text>
      <View style={styles.choices}>{MOBILE_ACTIONS.map(action => <Pressable key={action} disabled={busy}
        accessibilityRole="button" accessibilityState={{ selected: intent.action === action }}
        onPress={() => update('action', action)} style={[styles.choice, intent.action === action && styles.selectedChoice]}>
        <Text style={styles.choiceText}>{labels[action]}</Text></Pressable>)}</View>
      <Text style={styles.label}>Type</Text><View style={styles.choices}>{(['TOP_UP', 'EXIT'] as const).map(kind =>
        <Pressable key={kind} disabled={busy} accessibilityRole="button" onPress={() => update('kind', kind)}
          style={[styles.choice, intent.kind === kind && styles.selectedChoice]}><Text style={styles.choiceText}>{kind === 'EXIT' ? "Withdrawal" : "Financing"}</Text></Pressable>)}</View>
      <Text style={styles.label}>Network</Text><View style={styles.choices}>{MOBILE_CHAINS.map((chain: MobileChain) =>
        <Pressable key={chain} disabled={busy} accessibilityRole="button" onPress={() => update('chain', chain)}
          style={[styles.choice, intent.chain === chain && styles.selectedChoice]}><Text style={styles.choiceText}>{chain}</Text></Pressable>)}</View>
      {([['requestId', "Original operation ID"], ['assetId', "Asset identity (64 hex characters)"],
        ['amountAtomic', "Amount in atomic units"], ['recipient', "Accurate destination"], ['maxFeeAtomic', "Maximum commission in atomic units"]] as const).map(([key, label]) =>
        <View key={key}><Text style={styles.label}>{label}</Text><TextInput accessibilityLabel={label} autoCapitalize="none" autoCorrect={false}
          editable={!busy} value={intent[key]} style={styles.input} keyboardType={key === 'amountAtomic' || key === 'maxFeeAtomic' ? 'number-pad' : 'default'}
          onChangeText={value => update(key, value)} /></View>)}
      <ActionButton label="Create ID for a new operation" secondary disabled={busy || pending !== null}
        onPress={() => { void run(async () => { const entropy = await Crypto.getRandomBytesAsync(16);
          update('requestId', bytesToHex(entropy)); entropy.fill(0); }); }} />
      <ActionButton label="Recover Saved Operation" secondary disabled={busy} onPress={() => { void run(restoreOriginal); }} />
      <ActionButton label="Request review" disabled={busy || !publicKey || stale || !state?.capabilities[intent.action]}
        onPress={() => { void run(review); }} />
    </View>
    {challenge && <View style={[styles.card, styles.review]}><Text style={styles.cardTitle}>Review of the authorization</Text>
      {Object.entries({ "Service": challenge.origin, "Action": labels[challenge.intent.action], "Type": challenge.intent.kind,
        "Network": challenge.intent.chain, "Asset": challenge.intent.assetId, "Amount": challenge.intent.amountAtomic,
        "Recipient": challenge.intent.recipient, "Maximum Commission": challenge.intent.maxFeeAtomic, "Original ID": challenge.intent.requestId,
        "Identity": challenge.ownerPublicKey, Challenge: challenge.challengeId, Nonce: challenge.nonce,
        "Expires": new Date(challenge.expiresAt).toLocaleString('en-US') }).map(([label, value]) =>
        <View key={label}><Text style={styles.label}>{label}</Text><Text selectable style={styles.reviewValue}>{value}</Text></View>)}
      <ActionButton label="Authorize with biometrics" disabled={busy} onPress={confirm} />
      <ActionButton label="Cancel Review" secondary disabled={busy} onPress={() => invalidateReview()} />
    </View>}
    {pending && <View style={styles.card}><Text style={styles.cardTitle}>Original operation</Text>
      <Text selectable style={styles.identifier}>{pending.originalAuthorization.challenge.intent.requestId}</Text>
      <Text style={styles.muted}>Unverified economic result. The rejection of a subsequent permit does not close this operation.</Text>
      {pending.authorizations.map(row => <View key={row.authorization.challenge.intent.action}>
        <Text style={styles.muted}>{labels[row.authorization.challenge.intent.action]}: {outcomeLabels[row.status]}</Text>
        <ActionButton label={"Consult permission: " + labels[row.authorization.challenge.intent.action]} secondary
          disabled={busy || !publicKey} onPress={() => { void run(() => reviewReceipt(row.authorization)); }} />
      </View>)}
      {pending.legacyEvidenceIncomplete && <Text style={styles.muted}>The previous record does not retain the entire permission history.</Text>}</View>}
    {receiptReview && <View style={[styles.card, styles.review]}><Text style={styles.cardTitle}>Original permission query</Text>
      <Text style={styles.muted}>Only admission consultation. It does not execute, forward or close the economic operation.</Text>
      {Object.entries({ "Service": receiptReview.authorization.challenge.origin,
        "Action": labels[receiptReview.authorization.challenge.intent.action],
        "Original ID": receiptReview.authorization.challenge.intent.requestId,
        "Type": receiptReview.authorization.challenge.intent.kind, "Network": receiptReview.authorization.challenge.intent.chain,
        "Asset": receiptReview.authorization.challenge.intent.assetId, "Amount": receiptReview.authorization.challenge.intent.amountAtomic,
        "Recipient": receiptReview.authorization.challenge.intent.recipient,
        "Maximum Commission": receiptReview.authorization.challenge.intent.maxFeeAtomic,
        "Identity": receiptReview.authorization.challenge.ownerPublicKey,
        "Original challenge": receiptReview.authorization.challenge.challengeId,
        "Reference Nonce": receiptReview.nonce, "Expires": new Date(receiptReview.expiresAt).toLocaleString('en-US') }).map(([label, value]) =>
        <View key={label}><Text style={styles.label}>{label}</Text><Text selectable style={styles.reviewValue}>{value}</Text></View>)}
      <ActionButton label="Consult with biometrics" disabled={busy} onPress={confirmReceipt} />
      <ActionButton label="Cancel query" secondary disabled={busy} onPress={() => invalidateReview()} />
    </View>}
    <View accessibilityLiveRegion="polite" style={styles.notice}>{busy && <ActivityIndicator color="#253746" />}
      <Text style={styles.noticeText}>{notice}</Text></View>
  </ScrollView></SafeAreaView>;
}
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F3F0E8' }, content: { padding: 24, paddingBottom: 48, gap: 18 },
  brand: { color: '#253746', fontSize: 13, fontWeight: '800', letterSpacing: 4, marginTop: 14 },
  title: { color: '#253746', fontSize: 34, lineHeight: 40, fontWeight: '600' },
  status: { flexDirection: 'row', alignItems: 'center', gap: 9 }, dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#766039' },
  connectedDot: { backgroundColor: '#253746' }, statusText: { color: '#50616D', fontSize: 13 },
  card: { backgroundColor: '#FAF8F3', borderRadius:6, padding: 20, gap: 12, borderWidth: 1, borderColor: '#D9D6CD' },
  cardTitle: { color: '#253746', fontSize: 19, fontWeight: '600' }, balance: { color: '#253746', fontSize: 27 },
  muted: { color: '#50616D', fontSize: 14, lineHeight: 21 }, small: { color: '#50616D', fontSize: 12, lineHeight: 18 },
  identifier: { color: '#38634B', fontSize: 11, lineHeight: 18, fontFamily: 'monospace' },
  label: { color: '#253746', fontSize: 12, fontWeight: '600', marginTop: 4, marginBottom: 6 },
  input: { color: '#253746', backgroundColor: '#FAF8F3', borderColor: '#89877E', borderWidth: 1, borderRadius: 10, padding: 12, minHeight: 46 },
  button: { backgroundColor: '#253746', borderRadius: 10, paddingVertical: 14, paddingHorizontal: 12, alignItems: 'center' },
  buttonText: { color: '#F3F0E8', fontWeight: '700', fontSize: 14 }, secondaryButton: { backgroundColor: '#EAE6D9' },
  secondaryText: { color: '#253746' }, disabled: { opacity: 0.42 }, choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  choice: { backgroundColor: '#EAE6D9', paddingHorizontal: 10, paddingVertical: 9, borderRadius: 8, borderWidth: 1, borderColor: '#EAE6D9' },
  selectedChoice: { borderColor: '#253746', backgroundColor: '#EAE6D9' }, choiceText: { color: '#253746', fontSize: 12 },
  review: { borderColor: '#253746' }, reviewValue: { color: '#253746', fontSize: 13, lineHeight: 19 },
  notice: { flexDirection: 'row', gap: 12, backgroundColor: '#EAE6D9', padding: 16, borderRadius:6 },
  noticeText: { color: '#50616D', flex: 1, fontSize: 13, lineHeight: 20 },
});
