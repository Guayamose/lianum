import { useEffect, useRef, useState } from 'react';
import { AppState, Pressable, ScrollView, StyleSheet, Text, TextInput } from 'react-native';
import { fetch as nativeFetch } from 'expo/fetch';
import { createOriginalAccountApiV2 } from '../api/original-account-api-v2.mjs';
import { createDeviceOwnerDepositApiV1 } from '../api/device-owner-deposit-api-v1';
import { createDeviceOwnerReservationApiV1 } from '../api/device-owner-reservation-api-v1';
import { createDeviceOwnerExecutionApiV1 } from '../api/device-owner-execution-api-v1';
import { createDeviceOwnerOutputBalanceApiV1 } from '../api/device-owner-output-balance-api-v1';
import type { DeviceExecutionConsentV1, DeviceExecutionStatusV1 } from '../../../../packages/mobile-protocol/src/device-execution-consent-v1.mjs';
import { createDeviceOwnerExitApiV1, readDeviceExitQuoteV1 } from '../api/device-owner-exit-api-v1';
import { wipeDeviceExitWitnessV1, type DeviceExitConsentV1, type DeviceExitWitnessV1, type DeviceExitQuoteV1 }
  from '../../../../packages/mobile-protocol/src/device-exit-consent-v1.mjs';
import { readDevicePublicKey, signOriginalAccountAccessV2, signOriginalPrivateStateAccessV1,
  signOriginalPrivateStateReviewV1, signDeviceDepositConsentV1, signDeviceReservationConsentV1, signDeviceExitConsentV1, signDeviceExecutionConsentV1 } from '../custody/key-store';
import { inspectLocalRootNoteVaultV1, openLocalRootNoteVaultV1, type LocalDeviceExitProofRequestV1, type LocalDeviceProofRequestV1, type LocalDeviceAuthorizationRequestV1, type LocalDeviceReservationReviewV1 }
  from '../custody/local-root-note-vault-v1';
import type { DeviceDepositConsentV1, DeviceDepositWitnessV1 } from '../../../../packages/mobile-protocol/src/device-deposit-consent-v1.mjs';
import { wipeDeviceReservationWitnessV1, type DeviceReservationConsentV1, type DeviceReservationWitnessV1 }
  from '../../../../packages/mobile-protocol/src/device-reservation-consent-v1.mjs';
type ExecutionClient = Awaited<ReturnType<typeof createDeviceOwnerExecutionApiV1>>;
type BalanceClient = Awaited<ReturnType<typeof createDeviceOwnerOutputBalanceApiV1>>;
type ReservationClient = Awaited<ReturnType<typeof createDeviceOwnerReservationApiV1>>;
type ExitClient = Awaited<ReturnType<typeof createDeviceOwnerExitApiV1>>;
type Client = Awaited<ReturnType<typeof createDeviceOwnerDepositApiV1>>;
type Vault = ReturnType<typeof openLocalRootNoteVaultV1>;
export default function DeviceDepositScreen() {
  const [origin, setOrigin] = useState(''), [pairingId, setPairingId] = useState('');
  const [note, setNote] = useState<Awaited<ReturnType<Vault['readDeviceNote']>>>(null);
  const [ownerReview, setOwnerReview] = useState<LocalDeviceReservationReviewV1 | null>(null);
  const [reservationConsent, setReservationConsent] = useState<DeviceReservationConsentV1 | null>(null);
  const [reservationJob, setReservationJob] = useState<string | null>(null);
  const [executionConsent, setExecutionConsent] = useState<DeviceExecutionConsentV1 | null>(null);
  const [executionStatus, setExecutionStatus] = useState<DeviceExecutionStatusV1 | null>(null);
  const [executionIntent, setExecutionIntent] = useState<Awaited<ReturnType<Vault['readDeviceExecutionIntent']>>>(null);
  const executionClient = useRef<ExecutionClient | null>(null), nativeSigning = useRef<AbortController | null>(null);
  const balanceClient = useRef<BalanceClient | null>(null);
  const [exitRole, setExitRole] = useState<'change' | 'recovery'>('change'), [exitRecipient, setExitRecipient] = useState('');
  const [exitReview, setExitReview] = useState<DeviceExitQuoteV1 | null>(null), [exitConsent, setExitConsent] = useState<DeviceExitConsentV1 | null>(null);
  const [exitJob, setExitJob] = useState<string | null>(null);
  const exitClient = useRef<ExitClient | null>(null), exitQuote = useRef<object | null>(null), exitRequest = useRef<LocalDeviceExitProofRequestV1 | null>(null);
  const reservationClient = useRef<ReservationClient | null>(null), quote = useRef<object | null>(null);
  const authorizationRequest = useRef<LocalDeviceAuthorizationRequestV1 | null>(null);
  const [consent, setConsent] = useState<DeviceDepositConsentV1 | null>(null);
  const [approved, setApproved] = useState(false), [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const client = useRef<Client | null>(null), vault = useRef<Vault | null>(null), request = useRef<LocalDeviceProofRequestV1 | null>(null);
  const busyRef = useRef(false), visible = useRef(true), epoch = useRef(0);
  function clearNativeReview() { nativeSigning.current?.abort(); nativeSigning.current = null; setExecutionConsent(null); setExecutionStatus(null); setApproved(false); }
  function clear() {
    balanceClient.current?.close(); balanceClient.current = null;
    epoch.current++; executionClient.current?.close(); executionClient.current = null; clearNativeReview(); setExecutionIntent(null);
    exitRequest.current?.close(); exitRequest.current = null; exitQuote.current = null;
    exitClient.current?.close(); exitClient.current = null; setExitReview(null); setExitConsent(null); setExitJob(null); authorizationRequest.current?.close(); authorizationRequest.current = null; quote.current = null;
    reservationClient.current?.close(); reservationClient.current = null; setOwnerReview(null); setReservationConsent(null); setReservationJob(null);
    request.current?.close(); request.current = null; vault.current?.close(); vault.current = null;
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
  useEffect(() => {
    const expiry = note?.localReservation?.change?.observation?.expiresAt ?? note?.localReservation?.recovery?.observation?.expiresAt;
    if (!expiry) return;
    const timer = setTimeout(() => { vault.current?.forgetDeviceOutputBalanceObservation();
      setNote(value => value?.localReservation ? { ...value, localReservation: { ...value.localReservation,
        changeAvailableBalance: null, recoveryAvailableBalance: null,
        change: value.localReservation.change ? { ...value.localReservation.change, availableBalance: null, freshness: 'UNKNOWN', observation: null } : null,
        recovery: value.localReservation.recovery ? { ...value.localReservation.recovery, availableBalance: null, freshness: 'UNKNOWN', observation: null } : null } } : value);
    }, Math.max(0, expiry - Date.now()));
    return () => clearTimeout(timer);
  }, [note]);
  useEffect(() => {
    const expiry = ownerReview?.expiresAt ?? reservationConsent?.expiresAt ?? exitReview?.expiresAt ?? exitConsent?.expiresAt ?? executionConsent?.reservation.expiresAt;
    if (!expiry) return;
    const timer = setTimeout(() => {
      authorizationRequest.current?.close(); authorizationRequest.current = null; quote.current = null;
      exitRequest.current?.close(); exitRequest.current = null; exitQuote.current = null; setExitReview(null); setExitConsent(null);
      setOwnerReview(null); setReservationConsent(null); clearNativeReview(); setApproved(false);
    }, Math.max(0, expiry - Date.now()));
    return () => clearTimeout(timer);
  }, [ownerReview, reservationConsent, exitReview, exitConsent, executionConsent]);
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
    const next = await createDeviceOwnerDepositApiV1({ origin, pairingId, devicePublicKey: publicKey });
    try { live(held); } catch (error) { next.close(); throw error; }
    const reservations = await createDeviceOwnerReservationApiV1(next.descriptor);
    try { live(held); } catch (error) { next.close(); reservations.close(); throw error; }
    const exits = await createDeviceOwnerExitApiV1(next.descriptor);
    try { live(held); } catch (error) { next.close(); reservations.close(); exits.close(); throw error; }
    const executions = await createDeviceOwnerExecutionApiV1(next.descriptor);
    try { live(held); } catch (error) { next.close(); reservations.close(); exits.close(); executions.close(); throw error; }
    let balances: BalanceClient;
    try { balances = await createDeviceOwnerOutputBalanceApiV1(next.descriptor); }
    catch (error) { next.close(); reservations.close(); exits.close(); executions.close(); throw error; }
    try { live(held); } catch (error) { next.close(); reservations.close(); exits.close(); executions.close(); balances.close(); throw error; }
    balanceClient.current?.close(); balanceClient.current = balances;
    executionClient.current?.close(); executionClient.current = executions;
    exitClient.current = exits; client.current = next; reservationClient.current = reservations; vault.current = openLocalRootNoteVaultV1(metadata.rootId);
    const state = await vault.current.readDeviceNote(); live(held); if (!state) throw Error('MOBILE_LOCAL_NOTE_REQUIRED');
    const intent = await vault.current.readDeviceReservationIntent(); live(held); setReservationJob(intent?.jobId ?? null);
    const nativeIntent = await vault.current.readDeviceExecutionIntent(); live(held); setExecutionIntent(nativeIntent);
    const pendingExit = await vault.current.readDeviceExitIntent(exitRole); live(held); setExitJob(pendingExit?.jobId ?? null);
    setNote(state); setMessage('Nota local vinculada. Preparar una prueba no financia ni transmite tu clave.');
  }
  async function access(held: number) {
    const api = client.current; if (!api) throw Error('MOBILE_DEVICE_CONNECTION_REQUIRED');
    const challenge = await api.access(); live(held);
    const signature = await signOriginalAccountAccessV2(challenge, origin, pairingId); live(held); return { access: challenge, signature };
  }
  async function prepare(held: number) {
    clearNativeReview();
    exitRequest.current?.close(); exitRequest.current = null; exitQuote.current = null; setExitReview(null); setExitConsent(null);
    setOwnerReview(null); setReservationConsent(null); setApproved(false);
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
    clearNativeReview();
    exitRequest.current?.close(); exitRequest.current = null; exitQuote.current = null; setExitReview(null); setExitConsent(null);
    setOwnerReview(null); setReservationConsent(null); setApproved(false);
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
  async function reservationAccess(held: number) {
    const api = reservationClient.current; if (!api) throw Error('MOBILE_DEVICE_CONNECTION_REQUIRED');
    const challenge = await api.access(); live(held);
    const signature = await signOriginalAccountAccessV2(challenge, origin, pairingId); live(held);
    return { access: challenge, signature };
  }
  async function preparationU(held: number) {
    clearNativeReview();
    exitRequest.current?.close(); exitRequest.current = null; exitQuote.current = null; setExitReview(null); setExitConsent(null);
    setConsent(null); setReservationConsent(null); setOwnerReview(null); setApproved(false);
    const api = reservationClient.current, custody = vault.current;
    if (!api || !custody) throw Error('MOBILE_DEVICE_CONNECTION_REQUIRED');
    const current = await custody.readDeviceNote(); live(held);
    if (!current?.job || current.status !== 'FUNDED' || current.availableBalance === null) throw Error('MOBILE_LOCAL_FRESH_FUNDED_SOURCE_REQUIRED');
    const authenticated = await reservationAccess(held);
    const handle = await api.preparation({ ...authenticated, depositJobId: current.job.jobId, rootId: current.rootId }); live(held);
    // This same source can enter a retained reservation. Clear the earlier
    // D26 free-balance display before any persistent preparation/await.
    setNote({ ...current, availableBalance: null, freshness: 'UNKNOWN' });
    const reviewed = await custody.prepareDeviceReservationFromQuote(handle); live(held);
    const retained = await custody.readDeviceNote(); live(held);
    if (retained?.availableBalance !== null) throw Error('MOBILE_LOCAL_RESERVATION_BALANCE_UNRESOLVED');
    setNote(retained);
    quote.current = handle; setOwnerReview(reviewed); setConsent(null); setReservationConsent(null); setApproved(false);
    setMessage('Cambio y recuperación cifrados y releídos. Revisa el mismo grafo antes de firmar con tu clave de nota.');
  }
  async function reviewProofU(held: number) {
    clearNativeReview();
    const api = reservationClient.current, custody = vault.current, review = ownerReview, handle = quote.current;
    if (!api || !custody || !review || !handle || !approved) throw Error('MOBILE_DEVICE_CONSENT_REQUIRED');
    setOwnerReview(null); setApproved(false);
    const signed = await custody.signDeviceReservation(review); live(held);
    const pending = await custody.createDeviceAuthorizationRequest(signed, handle); live(held);
    authorizationRequest.current?.close(); authorizationRequest.current = pending; setReservationJob(pending.jobId);
    const authenticated = await reservationAccess(held);
    const consent = await api.challengeJob({ ...authenticated, depositJobId: pending.depositJobId, quoteId: pending.quoteId,
      jobId: pending.jobId, custody: pending.custody, statement: pending.statement, witnessSHA256: pending.witnessSHA256 }); live(held);
    setReservationConsent(consent); setMessage('La intención U original está guardada; la prueba todavía no reserva ni ejecuta el grafo.');
  }
  async function reviewReservation(action: 'RESERVE_S' | 'OBSERVE_S', held: number) {
    clearNativeReview();
    exitRequest.current?.close(); exitRequest.current = null; exitQuote.current = null; setExitReview(null); setExitConsent(null);
    setConsent(null); setReservationConsent(null); setOwnerReview(null); setApproved(false);
    const api = reservationClient.current, custody = vault.current; if (!api || !custody) throw Error('MOBILE_DEVICE_CONNECTION_REQUIRED');
    const intent = await custody.readDeviceReservationIntent(); live(held); if (!intent) throw Error('MOBILE_LOCAL_ORIGINAL_JOB_REQUIRED');
    const authenticated = await reservationAccess(held);
    const consent = await api.challenge(action, { ...authenticated, jobId: intent.jobId }); live(held);
    setReservationJob(intent.jobId); setOwnerReview(null); setConsent(null); setReservationConsent(consent); setApproved(false);
  }
  async function submitReservation(held: number) {
    const api = reservationClient.current, custody = vault.current, consent = reservationConsent;
    if (!api || !custody || !consent || !approved) throw Error('MOBILE_DEVICE_CONSENT_REQUIRED');
    setReservationConsent(null); setApproved(false);
    const signature = await signDeviceReservationConsentV1(consent, origin, pairingId); live(held);
    let witness: DeviceReservationWitnessV1 | undefined;
    try {
      if (consent.action === 'PROVE_U') {
        if (!authorizationRequest.current) throw Error('MOBILE_LOCAL_ORIGINAL_REQUEST_REQUIRED');
        witness = await custody.bindDeviceAuthorizationRequest(authorizationRequest.current, consent); live(held);
      }
      const result = await api.submit({ consent, signature, ...(witness ? { witness } : {}) }); live(held);
      if (result.stage === 'RESERVED') { await custody.applyDeviceReservationInclusion(result); live(held); }
      setReservationJob(result.jobId); setMessage(result.stage === 'RESERVED'
        ? 'Reserva S original confirmada y guardada con la misma nota. El cambio está incluido; su saldo libre requiere consulta del nullifier. La recuperación requiere F original. El grafo aún no está ejecutado.'
        : result.stage); const state = await custody.readDeviceNote(); live(held); setNote(state);
    } catch (error) {
      live(held); const notice = 'UNKNOWN: consulta la misma intención U/S. No repetir pruebas ni reservar de nuevo.';
      setMessage(notice); throw new Error(notice, { cause: error });
    } finally { if (witness) wipeDeviceReservationWitnessV1(witness);
      authorizationRequest.current?.close(); authorizationRequest.current = null; }
  }
  async function reviewExecution(action: DeviceExecutionConsentV1['action'], held: number) {
    const api = executionClient.current, custody = vault.current;
    if (!api || !custody) throw Error('MOBILE_DEVICE_CONNECTION_REQUIRED');
    exitRequest.current?.close(); exitRequest.current = null; exitQuote.current = null;
    authorizationRequest.current?.close(); authorizationRequest.current = null; request.current?.close(); request.current = null;
    setConsent(null); setOwnerReview(null); setReservationConsent(null); setExitReview(null); setExitConsent(null); clearNativeReview();
    const parent = await custody.readDeviceReservationIntent(); live(held);
    const retained = await custody.readDeviceExecutionIntent(); live(held); setExecutionIntent(retained);
    if (!parent) throw Error('MOBILE_LOCAL_ORIGINAL_JOB_REQUIRED');
    if (action !== 'RECONCILE_NATIVE' && (retained?.outcome || action === 'EXECUTE_NATIVE' && retained?.executeAttemptRetained
      || action === 'RECOVER_NATIVE' && retained?.recoveryAttemptRetained)) throw Error('MOBILE_LOCAL_NATIVE_RECONCILE_ORIGINAL_ONLY');
    const access = await api.access(); live(held);
    const signature = await signOriginalAccountAccessV2(access, origin, pairingId); live(held);
    const value = await api.challenge(action, { access, signature, jobId: parent.jobId }); live(held);
    setExecutionConsent(value); setApproved(false);
    setMessage('Revisa esta misma reserva y la pérdida aceptada por el proveedor. Ejecutar, reconciliar y recuperar requieren permisos distintos.');
  }
  async function submitExecution(held: number) {
    const api = executionClient.current, custody = vault.current, value = executionConsent;
    if (!api || !custody || !value || !approved) throw Error('MOBILE_DEVICE_CONSENT_REQUIRED');
    setExecutionConsent(null); setApproved(false); // choice consumed before storage/sign/network awaits
    const signing = new AbortController(); nativeSigning.current = signing;
    try {
      if (value.action !== 'RECONCILE_NATIVE') { await custody.retainDeviceExecutionIntent(value); live(held); }
      const retained = await custody.readDeviceExecutionIntent(); live(held); setExecutionIntent(retained);
      const signature = await signDeviceExecutionConsentV1(value, origin, pairingId, signing.signal); live(held);
      const result = await api.submit({ consent: value, signature }); live(held);
      if (result.terminal) { await custody.applyDeviceExecutionTerminal(result); live(held); }
      const state = await custody.readDeviceExecutionIntent(); live(held); setExecutionIntent(state); setExecutionStatus(result);
      setMessage(result.terminal ? 'Resultado original ' + result.outcome + ' guardado. Las aperturas de cambio y recuperación permanecen en esta custodia.' : result.stage);
    } catch (error) {
      live(held); const notice = 'UNKNOWN: reconciliar la ejecución original. No repetir ejecución, recuperación, reserva ni entrega.';
      setMessage(notice); throw new Error(notice, { cause: error });
    } finally { signing.abort(); if (nativeSigning.current === signing) nativeSigning.current = null; }
  }
  async function exitAccess(held: number) {
    const api = exitClient.current; if (!api) throw Error('MOBILE_DEVICE_CONNECTION_REQUIRED');
    const value = await api.access(); live(held);
    const signature = await signOriginalAccountAccessV2(value, origin, pairingId); live(held); return { access: value, signature };
  }
  async function observeOutputBalances(held: number) {
    const api = balanceClient.current, custody = vault.current; if (!api || !custody) throw Error('MOBILE_DEVICE_CONNECTION_REQUIRED');
    custody.forgetDeviceOutputBalanceObservation(); setNote(await custody.readDeviceNote()); live(held);
    try {
      const subject = await custody.readDeviceOutputBalanceSubject(); live(held);
      const access = await api.access(); live(held);
      const signature = await signOriginalAccountAccessV2(access, origin, pairingId); live(held);
      const handle = await api.observe({ access, signature, ...subject }); live(held);
      await custody.applyDeviceOutputBalances(handle); live(held);
      setNote(await custody.readDeviceNote()); live(held);
      setMessage('Lectura original de estas dos notas. No se autoriza una prueba, ejecución ni retirada; la disponibilidad caduca y no se suman otros activos.');
    } catch (cause) {
      live(held);
      custody.forgetDeviceOutputBalanceObservation(); setNote(await custody.readDeviceNote()); live(held);
      throw new Error('Saldo disponible desconocido: no se ha completado la lectura original. No se ha enviado una operación económica.', { cause });
    }
  }
  async function prepareExit(held: number) {
    clearNativeReview();
    const api = exitClient.current, custody = vault.current; if (!api || !custody) throw Error('MOBILE_DEVICE_CONNECTION_REQUIRED');
    authorizationRequest.current?.close(); authorizationRequest.current = null; request.current?.close(); request.current = null;
    setExitReview(null); setExitConsent(null); setOwnerReview(null); setReservationConsent(null); setConsent(null); setApproved(false);
    const subject = await custody.readDeviceExitSubject(exitRole, exitRecipient); live(held);
    const handle = await api.preparation({ ...await exitAccess(held), parentJobId: subject.parentJobId, rootId: subject.rootId,
      noteRole: subject.noteRole, noteRevision: subject.noteRevision, nullifier: subject.nullifier, recipient: subject.recipient }); live(held);
    exitQuote.current = handle; setExitReview(readDeviceExitQuoteV1(handle));
    setMessage('El observador original comprueba esta apertura no gastada y el recibo S/F necesario. Revisa la salida exacta antes de firmar.');
  }
  async function reviewExitProof(held: number) {
    clearNativeReview();
    const api = exitClient.current, custody = vault.current, handle = exitQuote.current;
    if (!api || !custody || !handle || !exitReview || !approved) throw Error('MOBILE_DEVICE_CONSENT_REQUIRED');
    setExitReview(null); setApproved(false);
    const pending = await custody.createDeviceExitProofRequest(handle); live(held);
    exitRequest.current?.close(); exitRequest.current = pending; setExitJob(pending.jobId);
    const value = await api.challengeJob({ ...await exitAccess(held), quoteId: pending.quoteId, jobId: pending.jobId, witnessSHA256: pending.witnessSHA256 }); live(held);
    setExitConsent(value); setMessage('Intención W39 cifrada antes de firmar/enviar. Revisa por separado la revelación de esta única apertura.');
  }
  async function reviewExit(action: 'WITHDRAW_W39' | 'OBSERVE_W39', held: number) {
    clearNativeReview();
    const api = exitClient.current, custody = vault.current; if (!api || !custody) throw Error('MOBILE_DEVICE_CONNECTION_REQUIRED');
    authorizationRequest.current?.close(); authorizationRequest.current = null; request.current?.close(); request.current = null;
    setExitReview(null); setExitConsent(null); setOwnerReview(null); setReservationConsent(null); setConsent(null); setApproved(false);
    const intent = await custody.readDeviceExitIntent(exitRole); live(held); if (!intent) throw Error('MOBILE_LOCAL_ORIGINAL_EXIT_REQUIRED');
    const value = await api.challenge(action, { ...await exitAccess(held), jobId: intent.jobId }); live(held); setExitJob(intent.jobId); setExitConsent(value);
  }
  async function submitExit(held: number) {
    const api = exitClient.current, custody = vault.current, value = exitConsent;
    if (!api || !custody || !value || !approved) throw Error('MOBILE_DEVICE_CONSENT_REQUIRED');
    setExitConsent(null); setApproved(false);
    const signature = await signDeviceExitConsentV1(value, origin, pairingId); live(held); let witness: DeviceExitWitnessV1 | undefined;
    try {
      if (value.action === 'PROVE_W39') { if (!exitRequest.current) throw Error('MOBILE_LOCAL_ORIGINAL_EXIT_REQUIRED');
        witness = await custody.bindDeviceExitProofRequest(exitRequest.current, value); live(held); }
      const result = await api.submit({ consent: value, signature, ...(witness ? { witness } : {}) }); live(held);
      if (result.stage === 'CONFIRMED') { await custody.applyDeviceExitConfirmation(result); live(held); }
      setExitJob(result.jobId); setMessage(result.stage === 'CONFIRMED' ? 'Salida original confirmada y guardada. No se suma como saldo disponible local.' : result.stage);
      const state = await custody.readDeviceNote(); live(held); setNote(state);
    } catch (error) { live(held); const notice = 'UNKNOWN: consultar este mismo trabajo W39. Nunca repetir automáticamente la prueba o la retirada.';
      setMessage(notice); throw Error(notice, { cause: error });
    } finally { if (witness) wipeDeviceExitWitnessV1(witness); exitRequest.current?.close(); exitRequest.current = null; }
  }
  const edit = (update: (value: string) => void, value: string) => { clear(); update(value); };
  return <ScrollView contentContainerStyle={styles.body}>
    <Text style={styles.title}>Financiar tu nota local</Text>
    <Text style={styles.text}>La raíz y la clave de nota permanecen en el dispositivo. D26 revela una sola apertura al worker original. Este flujo requiere un backend original instalado por el operador y TLS de confianza.</Text>
    <TextInput style={styles.input} value={origin} onChangeText={value => edit(setOrigin, value)} autoCapitalize="none" placeholder="https://origen privado" placeholderTextColor="#9cb0b8" />
    <TextInput style={styles.input} value={pairingId} onChangeText={value => edit(setPairingId, value)} autoCapitalize="none" placeholder="Identificador de vinculación del operador" placeholderTextColor="#9cb0b8" />
    <Pressable disabled={busy} onPress={() => void run(connect)}><Text style={styles.button}>Abrir nota y vinculación</Text></Pressable>
    {note && <Text style={styles.text}>Nota {note.commitment.slice(0, 16)} · {note.status}\nSaldo observado: {note.availableBalance ?? 'desconocido'}\n{note.freshness}
{note.localReservation?.sourceSpentAtRetainedHead ? 'Fuente gastada en el recibo S retenido. Consulta por separado el cambio y la recuperación.' : ''}</Text>}
    <Pressable disabled={busy || !note || note.status === 'FUNDED'} onPress={() => void run(prepare)}><Text style={styles.button}>Revisar prueba D26</Text></Pressable>
    <Pressable disabled={busy || !note?.job || note.status === 'FUNDED'} onPress={() => void run(held => review('FUND_D26', held))}><Text style={styles.button}>Revisar financiación única</Text></Pressable>
    <Pressable disabled={busy || !note?.job} onPress={() => void run(held => review('OBSERVE_D26', held))}><Text style={styles.button}>Consultar envío original</Text></Pressable>
    {consent && <>
      <Text style={styles.text}>{consent.action}\nPool {consent.binding.asset.pool}\nNota {consent.statement.output}\nImporte {consent.statement.amount}\n{consent.openingDisclosure ?? 'No se revela otra apertura'}</Text>
      <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: approved }} disabled={busy}
        onPress={() => setApproved(value => !value)}><Text style={styles.button}>{approved ? '☑' : '☐'} He revisado esta acción exacta</Text></Pressable>
      <Pressable disabled={busy || !approved} onPress={() => void run(submit)}><Text style={styles.button}>Autorizar esta acción</Text></Pressable>
    </>}
    {note?.status === 'FUNDED' && <>
      <Text style={styles.title}>Continuar con la misma nota</Text>
      <Text style={styles.text}>El servidor original ofrece los términos firmados del grafo. No se adopta otra nota ni se envía una raíz o clave. U revela sólo las aperturas a su worker; S requiere otro consentimiento y una sola reserva. La reserva no ejecuta el grafo; la ejecución y la salida requieren otros consentimientos.</Text>
      <Pressable disabled={busy || note.availableBalance === null || reservationJob !== null} onPress={() => void run(preparationU)}><Text style={styles.button}>Leer términos originales y guardar cambio/recuperación</Text></Pressable>
    </>}
    {ownerReview && <>
      <Text style={styles.text}>Operación {ownerReview.operationId}
Fuente {ownerReview.sourceCommitment}
Presupuesto {ownerReview.budget} · cambio {ownerReview.changeAmount} · recuperación {ownerReview.recoveryAmount}
{ownerReview.actions.map(action => action.id + ' · ' + action.chainDomain + ' · pago ' + action.payoutAmount).join('\n')}
Hasta {ownerReview.settleBefore}
Frame {ownerReview.frameSHA256}</Text>
      <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: approved }} disabled={busy}
        onPress={() => setApproved(value => !value)}><Text style={styles.button}>{approved ? '☑' : '☐'} Autorizo estos términos con la clave de mi nota</Text></Pressable>
      <Pressable disabled={busy || !approved} onPress={() => void run(reviewProofU)}><Text style={styles.button}>Firmar grafo y revisar prueba U</Text></Pressable>
    </>}
    {reservationJob && <>
      <Pressable disabled={busy} onPress={() => void run(held => reviewReservation('RESERVE_S', held))}><Text style={styles.button}>Revisar reserva S original</Text></Pressable>
      <Pressable disabled={busy} onPress={() => void run(held => reviewReservation('OBSERVE_S', held))}><Text style={styles.button}>Consultar la misma intención U/S</Text></Pressable>
    </>}
    {reservationConsent && <>
      <Text style={styles.text}>{reservationConsent.action}
Trabajo {reservationConsent.jobId}
Fuente {reservationConsent.statement.inputCommitment}
Cambio {reservationConsent.statement.changeCommitment}
Recuperación {reservationConsent.statement.recoveryCommitment}
{reservationConsent.openingDisclosure ?? 'No revelar otras aperturas'}
Esta firma nunca autoriza reenvíos automáticos.</Text>
      <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: approved }} disabled={busy}
        onPress={() => setApproved(value => !value)}><Text style={styles.button}>{approved ? '☑' : '☐'} He revisado este consentimiento exacto</Text></Pressable>
      <Pressable disabled={busy || !approved} onPress={() => void run(submitReservation)}><Text style={styles.button}>Autorizar únicamente esta acción U/S</Text></Pressable>
    </>}
    {note?.localReservation?.sourceSpentAtRetainedHead && <>
      <Text style={styles.title}>Notas de esta reserva</Text>
      <Text style={styles.text}>Activo {note.localReservation.assetIdentity} · dominio {note.localReservation.domainCommitment}</Text>
      {(['change', 'recovery'] as const).map(role => {
        const output = note.localReservation?.[role]; return output ? <Text key={role} style={styles.text}>
          {role === 'change' ? 'Cambio' : 'Recuperación'} · importe local {output.amount}
          {'\n'}Estado: {output.state} · disponible observado: {output.availableBalance ?? 'desconocido'}
          {output.withdrawnAmount !== null ? '\nRetirada original confirmada: ' + output.withdrawnAmount : ''}
        </Text> : null;
      })}
      <Pressable disabled={busy} onPress={() => void run(observeOutputBalances)}><Text style={styles.button}>Autorizar sólo lectura del saldo de estas notas</Text></Pressable>
      <Text style={styles.title}>Ejecutar la misma reserva</Text>
      <Text style={styles.text}>Una entrega irreversible permanece al riesgo aceptado por el proveedor. Si se pierde la respuesta, consulta la ejecución original. La recuperación conserva la misma reserva y exige el plazo original vencido.</Text>
      <Pressable disabled={busy || !!executionIntent?.executeAttemptRetained || !!executionIntent?.outcome}
        onPress={() => void run(held => reviewExecution('EXECUTE_NATIVE', held))}><Text style={styles.button}>Revisar ejecución única</Text></Pressable>
      <Pressable disabled={busy} onPress={() => void run(held => reviewExecution('RECONCILE_NATIVE', held))}><Text style={styles.button}>Consultar/reconciliar ejecución original</Text></Pressable>
      <Pressable disabled={busy || !!executionIntent?.recoveryAttemptRetained || !!executionIntent?.outcome}
        onPress={() => void run(held => reviewExecution('RECOVER_NATIVE', held))}><Text style={styles.button}>Revisar recuperación al vencimiento</Text></Pressable>
      {executionIntent && <Text style={styles.text}>Trabajo {executionIntent.jobId}
Resultado retenido: {executionIntent.outcome ?? 'desconocido'}
Intención de ejecución: {executionIntent.executeAttemptRetained ? 'guardada; consultar original' : 'sin intención local'}
Intención de recuperación: {executionIntent.recoveryAttemptRetained ? 'guardada; consultar original' : 'sin intención local'}</Text>}
      <Text style={styles.title}>Salida de la misma custodia</Text>
      <Text style={styles.text}>El cambio necesita S original y nullifier no gastado; la recuperación necesita además F original. La prueba W39 revela una sola apertura al worker y requiere otra autorización para retirar. No hay adopción de notas por Linux ni reintentos automáticos.</Text>
      <Pressable disabled={busy} onPress={() => { exitRequest.current?.close(); exitRequest.current = null; exitQuote.current = null;
        setExitReview(null); setExitConsent(null); clearNativeReview(); setExitJob(null); setApproved(false); setExitRole(role => role === 'change' ? 'recovery' : 'change'); }}>
        <Text style={styles.button}>Apertura: {exitRole === 'change' ? 'cambio' : 'recuperación'}</Text></Pressable>
      <TextInput style={styles.input} value={exitRecipient} onChangeText={value => edit(setExitRecipient, value)}
        autoCapitalize="none" placeholder="Destinatario EVM exacto: 40 caracteres hex, sin 0x" placeholderTextColor="#9cb0b8" />
      <Pressable disabled={busy || exitJob !== null} onPress={() => void run(prepareExit)}><Text style={styles.button}>Consultar inclusión y salida original</Text></Pressable>
      <Pressable disabled={busy} onPress={() => void run(held => reviewExit('WITHDRAW_W39', held))}><Text style={styles.button}>Revisar única retirada W39</Text></Pressable>
      <Pressable disabled={busy} onPress={() => void run(held => reviewExit('OBSERVE_W39', held))}><Text style={styles.button}>Consultar trabajo/salida original</Text></Pressable>
    </>}
    {executionConsent && <>
      <Text style={styles.text}>{executionConsent.action}
Trabajo {executionConsent.reservation.jobId}
Reserva {executionConsent.reservation.statement.reserveCommitment}
Transacción S {executionConsent.reservationTransactionHash}
Vinculación {executionConsent.nativeBindingSHA256}
Estado actual {executionConsent.executionSnapshotSHA256}
Plazo original {executionConsent.reservation.statement.settleBefore}
Reembolso completo del propietario; entrega irreversible al riesgo del proveedor.</Text>
      <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: approved }} disabled={busy}
        onPress={() => setApproved(value => !value)}><Text style={styles.button}>{approved ? '☑' : '☐'} He revisado esta única acción nativa y sus pérdidas</Text></Pressable>
      <Pressable disabled={busy || !approved} onPress={() => void run(submitExecution)}><Text style={styles.button}>Autorizar únicamente esta acción nativa</Text></Pressable>
    </>}
    {executionStatus && <Text style={styles.text}>Estado original {executionStatus.stage}
{executionStatus.outcome ?? 'Resultado pendiente'}
{executionStatus.errorCode ?? ''}</Text>}
    {exitReview && <>
      <Text style={styles.text}>W39 · {exitReview.noteRole}
Nota {exitReview.statement.commitment}
Importe {exitReview.statement.amount}
Destinatario {exitReview.statement.recipient}
Raíz Merkle {exitReview.statement.root}
Epoch {exitReview.statement.epoch}
Vinculación nativa {exitReview.nativeBindingSHA256}</Text>
      <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: approved }} disabled={busy}
        onPress={() => setApproved(value => !value)}><Text style={styles.button}>{approved ? '☑' : '☐'} Autorizo esta salida exacta con la clave de esta apertura</Text></Pressable>
      <Pressable disabled={busy || !approved} onPress={() => void run(reviewExitProof)}><Text style={styles.button}>Guardar intención y firmar W39 local</Text></Pressable>
    </>}
    {exitConsent && <>
      <Text style={styles.text}>{exitConsent.action}
Trabajo {exitConsent.jobId}
Apertura {exitConsent.noteRole}
Importe {exitConsent.statement.amount}
Destinatario {exitConsent.statement.recipient}
{exitConsent.openingDisclosure ?? 'No revelar otra apertura'}</Text>
      <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: approved }} disabled={busy}
        onPress={() => setApproved(value => !value)}><Text style={styles.button}>{approved ? '☑' : '☐'} He revisado este único consentimiento W39</Text></Pressable>
      <Pressable disabled={busy || !approved} onPress={() => void run(submitExit)}><Text style={styles.button}>Autorizar únicamente esta acción W39</Text></Pressable>
    </>}
    <Text style={styles.text}>{message}</Text><Pressable onPress={clear}><Text style={styles.button}>Cerrar y ocultar</Text></Pressable>
  </ScrollView>;
}
const styles = StyleSheet.create({ body: { padding: 20, gap: 12 }, title: { color: '#e4f1ef', fontSize: 22, fontWeight: '700' },
  text: { color: '#bed0d3', lineHeight: 21 }, input: { color: '#e4f1ef', borderColor: '#486069', borderWidth: 1, padding: 12 },
  button: { color: '#9de3be', paddingVertical: 12 } });
