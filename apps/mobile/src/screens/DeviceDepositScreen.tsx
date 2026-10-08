import { useEffect, useRef, useState } from 'react';
import { AppState, Pressable, ScrollView, StyleSheet, Text, TextInput } from 'react-native';
import { fetch as nativeFetch } from 'expo/fetch';
import { createOriginalAccountApiV2 } from '../api/original-account-api-v2.mjs';
import { createDeviceOwnerDepositApiV1 } from '../api/device-owner-deposit-api-v1';
import { readDevicePublicKey, signOriginalAccountAccessV2, signOriginalPrivateStateAccessV1,
  signOriginalPrivateStateReviewV1, signDeviceDepositConsentV1 } from '../custody/key-store';
import { inspectLocalRootNoteVaultV1, openLocalRootNoteVaultV1, type LocalDeviceProofRequestV1 }
  from '../custody/local-root-note-vault-v1';
import type { DeviceDepositConsentV1, DeviceDepositWitnessV1 } from '../../../../packages/mobile-protocol/src/device-deposit-consent-v1.mjs';
type Client = Awaited<ReturnType<typeof createDeviceOwnerDepositApiV1>>;
type Vault = ReturnType<typeof openLocalRootNoteVaultV1>;
export default function DeviceDepositScreen() {
  const [origin, setOrigin] = useState(''), [pairingId, setPairingId] = useState('');
  const [note, setNote] = useState<Awaited<ReturnType<Vault['readDeviceNote']>>>(null);
  const [consent, setConsent] = useState<DeviceDepositConsentV1 | null>(null);
  const [approved, setApproved] = useState(false), [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const client = useRef<Client | null>(null), vault = useRef<Vault | null>(null), request = useRef<LocalDeviceProofRequestV1 | null>(null);
  const busyRef = useRef(false), visible = useRef(true), epoch = useRef(0);
  function clear() {
    epoch.current++; request.current?.close(); request.current = null; vault.current?.close(); vault.current = null;
    client.current?.close(); client.current = null; setNote(null); setConsent(null); setApproved(false);
  }
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => { visible.current = state === 'active'; if (!visible.current) clear(); });
    return () => { visible.current = false; subscription.remove(); clear(); };
  }, []);
  useEffect(() => { if (!note?.availableBalance) return;
    const timer = setTimeout(() => setNote(value => value ? { ...value, availableBalance: null, freshness: 'UNKNOWN' } : value),
      Math.max(0, (note.observation?.expiresAt ?? Date.now()) - Date.now())); return () => clearTimeout(timer);
  }, [note]);
  const live = (held: number) => { if (!visible.current || held !== epoch.current) throw Error('MOBILE_DEVICE_DEPOSIT_REVOKED'); };
  async function run(work: (held: number) => Promise<void>) {
    if (busyRef.current || !visible.current) return; busyRef.current = true; setBusy(true); const held = epoch.current;
    try { await work(held); live(held); }
    catch (error) { if (held === epoch.current && visible.current) setMessage(error instanceof Error ? error.message : 'MOBILE_DEVICE_DEPOSIT_FAILED'); }
    finally { busyRef.current = false; if (visible.current) setBusy(false); }
  }
  async function connect(held: number) {
    const metadata = await inspectLocalRootNoteVaultV1(); live(held);
    if (!metadata.rootId || metadata.status !== 'ACTIVE') throw Error('MOBILE_LOCAL_NOTE_RECOVERY_REQUIRED');
    const publicKey = await readDevicePublicKey(); live(held); if (!publicKey) throw Error('MOBILE_KEY_REQUIRED');
    const next = await createDeviceOwnerDepositApiV1({ origin, pairingId, devicePublicKey: publicKey }); live(held);
    client.current = next; vault.current = openLocalRootNoteVaultV1(metadata.rootId);
    const state = await vault.current.readDeviceNote(); live(held); if (!state) throw Error('MOBILE_LOCAL_NOTE_REQUIRED');
    setNote(state); setMessage('Nota local vinculada. Preparar una prueba no financia ni transmite tu clave.');
  }
  async function access(held: number) {
    const api = client.current; if (!api) throw Error('MOBILE_DEVICE_CONNECTION_REQUIRED');
    const challenge = await api.access(); live(held);
    const signature = await signOriginalAccountAccessV2(challenge, origin, pairingId); live(held); return { access: challenge, signature };
  }
  async function prepare(held: number) {
    const api = client.current, custody = vault.current; if (!api || !custody) throw Error('MOBILE_DEVICE_CONNECTION_REQUIRED');
    const diagnostics = createOriginalAccountApiV2({ descriptor: api.descriptor, fetchImpl: nativeFetch }).privateState;
    const challenge = await diagnostics.challenge(); live(held);
    const accessSignature = await signOriginalPrivateStateAccessV1(challenge, origin, pairingId); live(held);
    const review = await diagnostics.openReview({ challenge, signature: accessSignature }); live(held);
    const readSignature = await signOriginalPrivateStateReviewV1(review, origin, pairingId); live(held);
    const observed = await diagnostics.submit({ review, signature: readSignature }); live(held);
    if (observed.status !== 'LIVE' || !observed.observed) throw Error('MOBILE_ORIGINAL_HEAD_UNKNOWN');
    const localReview = await custody.reviewPreparedDeposit({ relation: 'D26', epoch: (BigInt(observed.observed.timestamp) / 600n).toString() }); live(held);
    const signed = await custody.signPreparedDeposit(localReview); live(held);
    const proofRequest = await custody.createDeviceProofRequest(signed); live(held); request.current?.close(); request.current = proofRequest;
    const authenticated = await access(held);
    const jobReview = await api.challengeJob({ ...authenticated, statement: proofRequest.statement, rootId: proofRequest.rootId,
      noteRevision: proofRequest.noteRevision, witnessSHA256: proofRequest.witnessSHA256, jobId: proofRequest.jobId }); live(held);
    setConsent(jobReview); setApproved(false); setMessage('Revisa la revelación acotada antes de generar D26.');
  }
  async function review(action: 'FUND_D26' | 'OBSERVE_D26', held: number) {
    const api = client.current, custody = vault.current; if (!api || !custody) throw Error('MOBILE_DEVICE_CONNECTION_REQUIRED');
    const current = await custody.readDeviceNote(); live(held); if (!current?.job) throw Error('MOBILE_LOCAL_ORIGINAL_JOB_REQUIRED');
    const authenticated = await access(held), value = await api.challenge(action, { ...authenticated, jobId: current.job.jobId }); live(held);
    setNote(current); setConsent(value); setApproved(false);
  }
  async function submit(held: number) {
    const api = client.current, custody = vault.current, value = consent;
    if (!api || !custody || !value || !approved) throw Error('MOBILE_DEVICE_CONSENT_REQUIRED');
    setConsent(null); setApproved(false); // consume UI choice synchronously before native/network await
    const signature = await signDeviceDepositConsentV1(value, origin, pairingId); live(held);
    let witness: DeviceDepositWitnessV1 | undefined;
    try {
      if (value.action === 'PROVE_D26') {
        if (!request.current) throw Error('MOBILE_LOCAL_ORIGINAL_REQUEST_REQUIRED');
        witness = await custody.bindDeviceProofRequest(request.current, value); live(held); request.current.close(); request.current = null;
      }
      // One POST. A timeout means UNKNOWN. The durable original job remains;
      // explicit funding/observation review is used next, never automatic replay.
      const result = await api.submit({ consent: value, signature, ...(witness ? { witness } : {}) }); live(held);
      if (result.observation) { await custody.applyDeviceDepositInclusion(result.observation); live(held); }
      const state = await custody.readDeviceNote(); live(held); setNote(state); setMessage(result.state);
    } catch (error) {
      live(held); const state = await custody.readDeviceNote(); live(held); setNote(state);
      const notice = 'UNKNOWN: consulta explícitamente el trabajo/envío original. No hay reintento automático.';
      setMessage(notice); throw new Error(notice, { cause: error });
    } finally { if (witness) for (const value of Object.values(witness)) if (Array.isArray(value)) value.fill(0); }
  }
  const edit = (update: (value: string) => void, value: string) => { clear(); update(value); };
  return <ScrollView contentContainerStyle={styles.body}>
    <Text style={styles.title}>Financiar tu nota local</Text>
    <Text style={styles.text}>La raíz y la clave de nota permanecen en el dispositivo. D26 revela una sola apertura al worker original. Este flujo requiere un backend original instalado por el operador y TLS de confianza.</Text>
    <TextInput style={styles.input} value={origin} onChangeText={value => edit(setOrigin, value)} autoCapitalize="none" placeholder="https://origen privado" placeholderTextColor="#9cb0b8" />
    <TextInput style={styles.input} value={pairingId} onChangeText={value => edit(setPairingId, value)} autoCapitalize="none" placeholder="Identificador de vinculación del operador" placeholderTextColor="#9cb0b8" />
    <Pressable disabled={busy} onPress={() => void run(connect)}><Text style={styles.button}>Abrir nota y vinculación</Text></Pressable>
    {note && <Text style={styles.text}>Nota {note.commitment.slice(0, 16)} · {note.status}\nSaldo observado: {note.availableBalance ?? 'desconocido'}\n{note.freshness}</Text>}
    <Pressable disabled={busy || !note || note.status === 'FUNDED'} onPress={() => void run(prepare)}><Text style={styles.button}>Revisar prueba D26</Text></Pressable>
    <Pressable disabled={busy || !note?.job || note.status === 'FUNDED'} onPress={() => void run(held => review('FUND_D26', held))}><Text style={styles.button}>Revisar financiación única</Text></Pressable>
    <Pressable disabled={busy || !note?.job} onPress={() => void run(held => review('OBSERVE_D26', held))}><Text style={styles.button}>Consultar envío original</Text></Pressable>
    {consent && <>
      <Text style={styles.text}>{consent.action}\nPool {consent.binding.asset.pool}\nNota {consent.statement.output}\nImporte {consent.statement.amount}\n{consent.openingDisclosure ?? 'No se revela otra apertura'}</Text>
      <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: approved }} disabled={busy}
        onPress={() => setApproved(value => !value)}><Text style={styles.button}>{approved ? '☑' : '☐'} He revisado esta acción exacta</Text></Pressable>
      <Pressable disabled={busy || !approved} onPress={() => void run(submit)}><Text style={styles.button}>Autorizar esta acción</Text></Pressable>
    </>}
    <Text style={styles.text}>{message}</Text><Pressable onPress={clear}><Text style={styles.button}>Cerrar y ocultar</Text></Pressable>
  </ScrollView>;
}
const styles = StyleSheet.create({ body: { padding: 20, gap: 12 }, title: { color: '#e4f1ef', fontSize: 22, fontWeight: '700' },
  text: { color: '#bed0d3', lineHeight: 21 }, input: { color: '#e4f1ef', borderColor: '#486069', borderWidth: 1, padding: 12 },
  button: { color: '#9de3be', paddingVertical: 12 } });
