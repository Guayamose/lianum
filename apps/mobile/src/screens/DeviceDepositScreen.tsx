import {WalletText as Text,WalletTextInput as TextInput} from '../design/typography';
import type {DeviceRecoveryArmConsentV1,DeviceRecoveryArmStatusV1} from '../../../../packages/mobile-protocol/src/device-recovery-arm-consent-v1.mjs';
import { useEffect, useRef, useState } from 'react';
import { AppState, Pressable, ScrollView, StyleSheet} from 'react-native';
import { fetch as nativeFetch } from 'expo/fetch';
import { createOriginalAccountApiV2 } from '../api/original-account-api-v2.mjs';
import { createDeviceOwnerDepositApiV1 } from '../api/device-owner-deposit-api-v1';
import { createDeviceOwnerReservationApiV1 } from '../api/device-owner-reservation-api-v1';
import { createDeviceOwnerExecutionApiV1 } from '../api/device-owner-execution-api-v1';
import { createDeviceOwnerOutputBalanceApiV1 } from '../api/device-owner-output-balance-api-v1';
import type { DeviceExecutionConsentV1, DeviceExecutionStatusV1 } from '../../../../packages/mobile-protocol/src/device-execution-consent-v1.mjs';
import { createDeviceOwnerExitApiV1, readDeviceExitQuoteV1 } from '../api/device-owner-exit-api-v1';
import { wipeDeviceExitWitnessV1, type DeviceExitConsentEitherV2 as DeviceExitConsentV1,type DeviceExitWitnessV1,type DeviceExitQuoteEitherV2 as DeviceExitQuoteV1 }
  from '../../../../packages/mobile-protocol/src/device-native-private-exit-v2.mjs';
import { readDevicePublicKey, signOriginalAccountAccessV2, signOriginalPrivateStateAccessV1,
  signOriginalPrivateStateReviewV1, signDeviceDepositConsentV1, signDeviceReservationConsentV1, signDeviceExitConsentV1, signDeviceExecutionConsentV1, signDeviceRecoveryArmConsentV1 } from '../custody/key-store';
import { inspectLocalRootNoteVaultV1, openLocalRootNoteVaultV1, type LocalDeviceExitProofRequestV1, type LocalDeviceProofRequestV1, type LocalDeviceAuthorizationRequestV1, type LocalDeviceReservationReviewV1 }
  from '../custody/local-root-note-vault-v1';
import type {DeviceDepositWitnessV1} from '../../../../packages/mobile-protocol/src/device-deposit-consent-v1.mjs';
import type {DeviceDepositConsentEitherV2 as DeviceDepositConsentV1} from '../../../../packages/mobile-protocol/src/device-native-private-deposit-v2.mjs';
import { wipeDeviceReservationWitnessV1, type DeviceReservationWitnessV1 }
  from '../../../../packages/mobile-protocol/src/device-reservation-consent-v1.mjs';
import type {DeviceReservationConsentEitherV2 as DeviceReservationConsentV1}
  from '../../../../packages/mobile-protocol/src/device-native-private-reservation-v2.mjs';
const recoveryArmStateLabel=(state:DeviceRecoveryArmStatusV1['state'])=>({ABSENT:"unactivated",ARMED:'activada',DISARMED:'desactivada',FIRING:'recuperando',UNKNOWN:'desconocido',RECOVERED:'recuperada',FULFILLED:'completada'})[state];
type ExecutionClient = Awaited<ReturnType<typeof createDeviceOwnerExecutionApiV1>>;
type BalanceClient = Awaited<ReturnType<typeof createDeviceOwnerOutputBalanceApiV1>>;
type ReservationClient = Awaited<ReturnType<typeof createDeviceOwnerReservationApiV1>>;
type ExitClient = Awaited<ReturnType<typeof createDeviceOwnerExitApiV1>>;
type Client = Awaited<ReturnType<typeof createDeviceOwnerDepositApiV1>>;
type Vault = ReturnType<typeof openLocalRootNoteVaultV1>;
export default function DeviceDepositScreen({onObservation,onInvalidate}:{onObservation?(value:object):Promise<void>;onInvalidate?():void}={}) {
  const [origin, setOrigin] = useState(''), [pairingId, setPairingId] = useState('');
  const [note, setNote] = useState<Awaited<ReturnType<Vault['readDeviceNote']>>>(null);
  const [ownerReview, setOwnerReview] = useState<LocalDeviceReservationReviewV1 | null>(null);
  const [reservationConsent, setReservationConsent] = useState<DeviceReservationConsentV1 | null>(null);
  const [reservationJob, setReservationJob] = useState<string | null>(null);
  const [executionConsent, setExecutionConsent] = useState<DeviceExecutionConsentV1 | null>(null);
  const [executionStatus, setExecutionStatus] = useState<DeviceExecutionStatusV1 | null>(null);
  const [recoveryArmReview,setRecoveryArmReview]=useState<DeviceRecoveryArmConsentV1|null>(null),[recoveryArmStatus,setRecoveryArmStatus]=useState<DeviceRecoveryArmStatusV1|null>(null);
  const [executionIntent, setExecutionIntent] = useState<Awaited<ReturnType<Vault['readDeviceExecutionIntent']>>>(null);
  const executionClient = useRef<ExecutionClient | null>(null), nativeSigning = useRef<AbortController | null>(null);
  const balanceClient = useRef<BalanceClient | null>(null);
  const [exitRole, setExitRole] = useState<'deposit'|'change'|'recovery'>('deposit'), [exitRecipient, setExitRecipient] = useState('');
  const [exitReview, setExitReview] = useState<DeviceExitQuoteV1 | null>(null), [exitConsent, setExitConsent] = useState<DeviceExitConsentV1 | null>(null);
  const [exitJob, setExitJob] = useState<string | null>(null);
  const [exitIntent, setExitIntent] = useState<Awaited<ReturnType<Vault['readDeviceExitIntent']>>>(null);
  const exitClient = useRef<ExitClient | null>(null), exitQuote = useRef<object | null>(null), exitRequest = useRef<LocalDeviceExitProofRequestV1 | null>(null);
  const reservationClient = useRef<ReservationClient | null>(null), quote = useRef<object | null>(null);
  const authorizationRequest = useRef<LocalDeviceAuthorizationRequestV1 | null>(null);
  const [consent, setConsent] = useState<DeviceDepositConsentV1 | null>(null);
  const [approved, setApproved] = useState(false), [busy, setBusy] = useState(false), [message, setMessage] = useState('');
  const client = useRef<Client | null>(null), vault = useRef<Vault | null>(null), request = useRef<LocalDeviceProofRequestV1 | null>(null);
  const busyRef = useRef(false), visible = useRef(true), epoch = useRef(0);
  function clearNativeReview() { setRecoveryArmReview(null); nativeSigning.current?.abort(); nativeSigning.current = null; setExecutionConsent(null); setExecutionStatus(null); setApproved(false); }
  function clear() {
    balanceClient.current?.close(); balanceClient.current = null;
    epoch.current++; executionClient.current?.close(); executionClient.current = null; clearNativeReview(); setExecutionIntent(null);setRecoveryArmStatus(null);
    exitRequest.current?.close(); exitRequest.current = null; exitQuote.current = null;
    exitClient.current?.close(); exitClient.current = null; setExitReview(null); setExitConsent(null); setExitJob(null); setExitIntent(null); authorizationRequest.current?.close(); authorizationRequest.current = null; quote.current = null;
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
    const expiry = ownerReview?.expiresAt ?? reservationConsent?.expiresAt ?? exitReview?.expiresAt ?? exitConsent?.expiresAt
      ?? executionConsent?.reservation.expiresAt ?? recoveryArmReview?.execution.reservation.expiresAt;
    if (!expiry) return;
    const timer = setTimeout(() => {
      authorizationRequest.current?.close(); authorizationRequest.current = null; quote.current = null;
      exitRequest.current?.close(); exitRequest.current = null; exitQuote.current = null; setExitReview(null); setExitConsent(null);
      setOwnerReview(null); setReservationConsent(null); clearNativeReview(); setApproved(false);
    }, Math.max(0, expiry - Date.now()));
    return () => clearTimeout(timer);
  }, [ownerReview, reservationConsent, exitReview, exitConsent, executionConsent, recoveryArmReview]);
  const live = (held: number) => { if (!visible.current || held !== epoch.current) throw Error('MOBILE_DEVICE_DEPOSIT_REVOKED'); };
  async function publishNote(value:Awaited<ReturnType<Vault['readDeviceNote']>>,held:number){
    live(held);if(value&&onObservation){await onObservation(value);live(held);}
    if(value)setExitRole(role=>value.localReservation ? role==='deposit'?'change':role : 'deposit');
    setNote(value);
  }
  async function run(work: (held: number) => Promise<void>) {
    if (busyRef.current || !visible.current) return; busyRef.current = true; setBusy(true); const held = epoch.current;
    try { await work(held); live(held); }
    catch (error) { if (held === epoch.current && visible.current) setMessage(error instanceof Error ? error.message : 'MOBILE_DEVICE_DEPOSIT_FAILED'); }
    finally { busyRef.current = false; if (visible.current) setBusy(false); }
  }
  async function connect(held: number) { await openConnection(held, false); }
  async function resume(held: number) { await openConnection(held, true); }
  async function openConnection(held: number, sameOperation: boolean) {
    const metadata = await inspectLocalRootNoteVaultV1(); live(held);
    if (!metadata.rootId || metadata.status !== 'ACTIVE') throw Error('MOBILE_LOCAL_NOTE_RECOVERY_REQUIRED');
    const custody = openLocalRootNoteVaultV1(metadata.rootId);
    let next: Client | null = null, reservations: ReservationClient | null = null, exits: ExitClient | null = null;
    let executions: ExecutionClient | null = null, balances: BalanceClient | null = null;
    try {
      // These are public projections of the original authenticated encrypted
      // record, never a grant or a request to create/admit/replay an operation.
      const state = await custody.readDeviceNote(); live(held); if (!state) throw Error('MOBILE_LOCAL_NOTE_REQUIRED');
      if (sameOperation && !state.job) throw Error('MOBILE_LOCAL_ORIGINAL_JOB_REQUIRED');
      const descriptorOrigin = sameOperation ? state.job!.origin : origin;
      const descriptorPairing = sameOperation ? state.job!.pairingId : pairingId;
      if (state.job && (state.job.origin !== descriptorOrigin || state.job.pairingId !== descriptorPairing))
        throw Error('MOBILE_LOCAL_ORIGINAL_DOMAIN_CHANGED');
      const publicKey = await readDevicePublicKey(); live(held); if (!publicKey) throw Error('MOBILE_KEY_REQUIRED');
      const intent = await custody.readDeviceReservationIntent(); live(held);
      const nativeIntent = await custody.readDeviceExecutionIntent(); live(held);
      // D26 withdrawal is parented by the original deposit; S outputs use U.
      // Select only roles that exist in this same authenticated custody record.
      const selectedExitRole = state.localReservation ? exitRole === 'deposit' ? 'change' : exitRole : 'deposit';
      const pendingExit = await custody.readDeviceExitIntent(selectedExitRole); live(held);
      if (intent && (intent.rootId !== state.rootId || intent.depositJobId !== state.job?.jobId
        || intent.origin !== descriptorOrigin || intent.pairingId !== descriptorPairing || intent.devicePublicKey !== publicKey))
        throw Error('MOBILE_LOCAL_ORIGINAL_DOMAIN_CHANGED');
      if (nativeIntent && (!intent || nativeIntent.rootId !== state.rootId || nativeIntent.jobId !== intent.jobId)
        || pendingExit && (pendingExit.rootId !== state.rootId || pendingExit.noteRole !== selectedExitRole
          || (selectedExitRole === 'deposit' ? !state.job || intent !== null || pendingExit.parentJobId !== state.job.jobId
            : !intent || pendingExit.parentJobId !== intent.jobId))) throw Error('MOBILE_LOCAL_ORIGINAL_JOB_CHANGED');
      next = await createDeviceOwnerDepositApiV1({ origin: descriptorOrigin, pairingId: descriptorPairing, devicePublicKey: publicKey }); live(held);
      reservations = await createDeviceOwnerReservationApiV1(next.descriptor); live(held);
      exits = await createDeviceOwnerExitApiV1(next.descriptor); live(held);
      executions = await createDeviceOwnerExecutionApiV1(next.descriptor); live(held);
      balances = await createDeviceOwnerOutputBalanceApiV1(next.descriptor); live(held);
      // Publish the whole connection only after every original read/identity
      // check and client acquisition. Partial failure closes these local handles.
      request.current?.close(); request.current = null; authorizationRequest.current?.close(); authorizationRequest.current = null;
      exitRequest.current?.close(); exitRequest.current = null; quote.current = null; exitQuote.current = null;
      client.current?.close(); reservationClient.current?.close(); exitClient.current?.close();
      executionClient.current?.close(); balanceClient.current?.close(); vault.current?.close(); clearNativeReview();
      client.current = next; reservationClient.current = reservations; exitClient.current = exits;
      executionClient.current = executions; balanceClient.current = balances; vault.current = custody;
      setOrigin(descriptorOrigin); setPairingId(descriptorPairing); setReservationJob(intent?.jobId ?? null);
      setExecutionIntent(nativeIntent); setExitRole(selectedExitRole); setExitJob(pendingExit?.jobId ?? null); setExitIntent(pendingExit);
      if (pendingExit) setExitRecipient(pendingExit.statement.recipient);
      setConsent(null); setOwnerReview(null); setReservationConsent(null); setExitReview(null); setExitConsent(null); setApproved(false);
      await publishNote(state,held); setMessage(sameOperation
        ? "Same local operation reopened. The balance remains unknown until a fresh signed consultation; it has not been proven, funded, reserved, executed or withdrawn again."
        : "Local linked note. Preparing a test does not fund or transmit your key.");
    } catch (error) {
      next?.close(); reservations?.close(); exits?.close(); executions?.close(); balances?.close(); custody.close(); throw error;
    }
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
    setConsent(jobReview); setApproved(false); setMessage(jobReview.version===2?"Check the encrypted transfer of this opening before generating the test.":"Check the narrowed disclosure before generating D26.");
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
    custody.forgetDeviceOutputBalanceObservation();onInvalidate?.();setNote(null);
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
      const state = await custody.readDeviceNote(); live(held); await publishNote(state,held); setMessage(result.state);
    } catch (error) {
      live(held); const state = await custody.readDeviceNote(); live(held); await publishNote(state,held);
      const notice = "UNKNOWN: explicitly consult the original work/send. There is no automatic retry.";
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
    const api = reservationClient.current, deposit = client.current, custody = vault.current;
    if (!api || !deposit || !custody) throw Error('MOBILE_DEVICE_CONNECTION_REQUIRED');
    const current = await custody.readDeviceNote(); live(held);
    if (!current?.job || current.status !== 'FUNDED' || current.availableBalance === null) throw Error('MOBILE_LOCAL_FRESH_FUNDED_SOURCE_REQUIRED');
    onInvalidate?.();
    const authenticated = await reservationAccess(held);
    const handle = await api.preparation({ ...authenticated, depositJobId: current.job.jobId, rootId: current.rootId }); live(held);
    // This same source can enter a retained reservation. Clear the earlier
    // D26 free-balance display before any persistent preparation/await.
    setNote({ ...current, availableBalance: null, freshness: 'UNKNOWN' });
    // Terms/biometric reads can consume the earlier D26 observation's 15s.
    // Explicitly observe this same original funding; never PROVE or FUND again.
    const fundingAccess = await access(held);
    const fundingReview = await deposit.challenge('OBSERVE_D26', { ...fundingAccess, jobId: current.job.jobId }); live(held);
    const fundingSignature = await signDeviceDepositConsentV1(fundingReview, origin, pairingId); live(held);
    const funding = await deposit.submit({ consent: fundingReview, signature: fundingSignature }); live(held);
    if (funding.state !== 'CONFIRMED' || !funding.observation) throw Error('MOBILE_LOCAL_FRESH_FUNDED_SOURCE_REQUIRED');
    // The full original CM/NF/job/tx checks refresh only the ephemeral handle.
    // The quote retains its own deadline; preparation still fails if it expired.
    await custody.applyDeviceDepositInclusion(funding.observation); live(held);
    const reviewed = await custody.prepareDeviceReservationFromQuote(handle); live(held);
    const retained = await custody.readDeviceNote(); live(held);
    if (retained?.availableBalance !== null) throw Error('MOBILE_LOCAL_RESERVATION_BALANCE_UNRESOLVED');
    await publishNote(retained,held);
    quote.current = handle; setOwnerReview(reviewed); setConsent(null); setReservationConsent(null); setApproved(false);
    setMessage("Change and recover encrypted and rereaded. Check the same graph before signing with your note key.");
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
    setReservationConsent(consent); setMessage("The original U intention is saved; the test still does not reserve or execute the graph.");
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
    setReservationConsent(null); setApproved(false);onInvalidate?.();
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
        ? "Original S reservation confirmed and saved with the same note. Change is included; your free balance requires consultation of the nullifier. Recovery requires original F. The graph is not yet executed."
        : result.stage); const state = await custody.readDeviceNote(); live(held); await publishNote(state,held);
    } catch (error) {
      live(held); const notice = "UNKNOWN: See the same U/S intention. Do not repeat tests or book again.";
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
    setMessage("Check this same reservation and the loss accepted by the provider. Execute, reconcile and recover require different permissions.");
  }
  async function submitExecution(held: number) {
    const api = executionClient.current, custody = vault.current, value = executionConsent;
    if (!api || !custody || !value || !approved) throw Error('MOBILE_DEVICE_CONSENT_REQUIRED');
    setExecutionConsent(null); setApproved(false); // choice consumed before storage/sign/network awaits
    custody.forgetDeviceOutputBalanceObservation(); onInvalidate?.(); setNote(null);
    const signing = new AbortController(); nativeSigning.current = signing;
    try {
      if (value.action !== 'RECONCILE_NATIVE') { await custody.retainDeviceExecutionIntent(value); live(held); }
      const retained = await custody.readDeviceExecutionIntent(); live(held); setExecutionIntent(retained);
      const signature = await signDeviceExecutionConsentV1(value, origin, pairingId, signing.signal); live(held);
      const result = await api.submit({ consent: value, signature }); live(held);
      if (result.terminal) { await custody.applyDeviceExecutionTerminal(result); live(held); }
      else if (value.action === 'RECONCILE_NATIVE') { await custody.applyDeviceExecutionObservation(result); live(held); }
      const state = await custody.readDeviceExecutionIntent(); live(held); setExecutionIntent(state); setExecutionStatus(result);
      const updatedNote = await custody.readDeviceNote(); live(held); await publishNote(updatedNote, held);
      setMessage(result.terminal ? "Original result " + result.outcome + " Saved. Exchange and recovery openings remain in this custody." : result.stage);
    } catch (error) {
      live(held); const notice = "UNKNOWN: reconcile the original execution. Do not repeat execution, recovery, reservation or delivery.";
      setMessage(notice); throw new Error(notice, { cause: error });
    } finally { signing.abort(); if (nativeSigning.current === signing) nativeSigning.current = null; }
  }
  async function reviewRecoveryArm(action:DeviceRecoveryArmConsentV1['action'],held:number){
    const api=executionClient.current,custody=vault.current;if(!api||!custody)throw Error('MOBILE_DEVICE_CONNECTION_REQUIRED');clearNativeReview();
    exitRequest.current?.close();exitRequest.current=null;exitQuote.current=null;
    authorizationRequest.current?.close();authorizationRequest.current=null;request.current?.close();request.current=null;
    setConsent(null);setOwnerReview(null);setReservationConsent(null);setExitReview(null);setExitConsent(null);
    const parent=await custody.readDeviceReservationIntent();live(held);if(!parent)throw Error('MOBILE_LOCAL_ORIGINAL_JOB_REQUIRED');
    const access=await api.access();live(held);const signature=await signOriginalAccountAccessV2(access,origin,pairingId);live(held);
    const value=await api.challengeRecoveryArm(action,{access,signature,jobId:parent.jobId});live(held);setRecoveryArmReview(value);setApproved(false);
    setMessage("Authorizes to activate or disable the automatic recovery of this reservation. The original term is retained and the service must remain active.");
  }
  async function submitRecoveryArm(held:number){
    const api=executionClient.current,value=recoveryArmReview;if(!api||!value||!approved)throw Error('MOBILE_DEVICE_CONSENT_REQUIRED');
    setRecoveryArmReview(null);setApproved(false);const signing=new AbortController();nativeSigning.current=signing;
    try{const signature=await signDeviceRecoveryArmConsentV1(value,origin,pairingId,signing.signal);live(held);
      const result=await api.submitRecoveryArm({consent:value,signature});live(held);setRecoveryArmStatus(result);setMessage(recoveryArmStateLabel(result.state));
    }catch(error){live(held);setMessage("Unknown answer: consult the state before reacting.");throw error;
    }finally{signing.abort();if(nativeSigning.current===signing)nativeSigning.current=null;}
  }
  async function observeRecoveryArm(held:number){
    const api=executionClient.current,custody=vault.current;if(!api||!custody)throw Error('MOBILE_DEVICE_CONNECTION_REQUIRED');
    const parent=await custody.readDeviceReservationIntent();live(held);if(!parent)throw Error('MOBILE_LOCAL_ORIGINAL_JOB_REQUIRED');
    const access=await api.access();live(held);const signature=await signOriginalAccountAccessV2(access,origin,pairingId);live(held);
    const result=await api.observeRecoveryArm({access,signature,jobId:parent.jobId});live(held);setRecoveryArmStatus(result);setMessage(recoveryArmStateLabel(result.state));
  }
  async function exitAccess(held: number) {
    const api = exitClient.current; if (!api) throw Error('MOBILE_DEVICE_CONNECTION_REQUIRED');
    const value = await api.access(); live(held);
    const signature = await signOriginalAccountAccessV2(value, origin, pairingId); live(held); return { access: value, signature };
  }
  async function observeOutputBalances(held: number) {
    const api = balanceClient.current, custody = vault.current; if (!api || !custody) throw Error('MOBILE_DEVICE_CONNECTION_REQUIRED');
    custody.forgetDeviceOutputBalanceObservation(); onInvalidate?.(); setNote(await custody.readDeviceNote()); live(held);
    try {
      const subject = await custody.readDeviceOutputBalanceSubject(); live(held);
      const access = await api.access(); live(held);
      const signature = await signOriginalAccountAccessV2(access, origin, pairingId); live(held);
      const handle = await api.observe({ access, signature, ...subject }); live(held);
      await custody.applyDeviceOutputBalances(handle); live(held);
      const observation = await custody.readDeviceNote(); live(held);
      await publishNote(observation, held);
      setMessage("Original reading of these two notes. No proof, execution or withdrawal is allowed; availability expires and no other assets are added.");
    } catch (cause) {
      live(held);
      custody.forgetDeviceOutputBalanceObservation(); setNote(await custody.readDeviceNote()); live(held);
      throw new Error("Unknown available balance: the original reading has not been completed. An economic operation has not been sent.", { cause });
    }
  }
  async function selectExitRole(held: number) {
    const custody = vault.current; if (!custody) throw Error('MOBILE_DEVICE_CONNECTION_REQUIRED');
    const role: 'deposit'|'change'|'recovery' = note?.localReservation?.sourceSpentAtRetainedHead
      ? exitRole === 'change' ? 'recovery' : 'change' : 'deposit';
    exitRequest.current?.close(); exitRequest.current = null; exitQuote.current = null;
    setExitReview(null); setExitConsent(null); clearNativeReview(); setExitJob(null); setExitIntent(null); setApproved(false);
    const pending = await custody.readDeviceExitIntent(role); live(held);
    setExitRole(role); setExitJob(pending?.jobId ?? null); setExitIntent(pending);
    setExitRecipient(pending?.statement.recipient ?? '');
    setMessage(pending ? "Original W39 intent retained. Consult this same work; do not regenerate the test or forward the withdrawal."
      : "This opening does not have a local W39 job. To consult its inclusion does not authorize a withdrawal.");
  }
  async function prepareExit(held: number) {
    clearNativeReview();
    const api = exitClient.current, custody = vault.current; if (!api || !custody) throw Error('MOBILE_DEVICE_CONNECTION_REQUIRED');
    authorizationRequest.current?.close(); authorizationRequest.current = null; request.current?.close(); request.current = null;
    setExitReview(null); setExitConsent(null); setOwnerReview(null); setReservationConsent(null); setConsent(null); setApproved(false);
    const pending = await custody.readDeviceExitIntent(exitRole); live(held);
    if (pending) { setExitJob(pending.jobId); setExitIntent(pending); setExitRecipient(pending.statement.recipient);
      throw Error('MOBILE_LOCAL_ORIGINAL_EXIT_REQUIRED'); }
    const subject = await custody.readDeviceExitSubject(exitRole, exitRecipient); live(held);
    const handle = await api.preparation({ ...await exitAccess(held), parentJobId: subject.parentJobId, rootId: subject.rootId,
      noteRole: subject.noteRole, noteRevision: subject.noteRevision, nullifier: subject.nullifier, recipient: subject.recipient }); live(held);
    exitQuote.current = handle; setExitReview(readDeviceExitQuoteV1(handle));
    setMessage("The original observer checks this unexpended opening and your original D26 or S/F receipt. Check the exact output before signing.");
  }
  async function reviewExitProof(held: number) {
    clearNativeReview();
    const api = exitClient.current, custody = vault.current, handle = exitQuote.current;
    if (!api || !custody || !handle || !exitReview || !approved) throw Error('MOBILE_DEVICE_CONSENT_REQUIRED');
    setExitReview(null); setApproved(false);
    const pending = await custody.createDeviceExitProofRequest(handle); live(held);
    exitRequest.current?.close(); exitRequest.current = pending; setExitJob(pending.jobId);
    const value = await api.challengeJob({ ...await exitAccess(held), quoteId: pending.quoteId, jobId: pending.jobId, witnessSHA256: pending.witnessSHA256 }); live(held);
    setExitConsent(value); setMessage("W39 intent saved before signing/sending. Check separately the recipient of the encryption for this single opening.");
  }
  async function reviewExit(action: 'WITHDRAW_W39' | 'OBSERVE_W39', held: number) {
    clearNativeReview();
    const api = exitClient.current, custody = vault.current; if (!api || !custody) throw Error('MOBILE_DEVICE_CONNECTION_REQUIRED');
    authorizationRequest.current?.close(); authorizationRequest.current = null; request.current?.close(); request.current = null;
    setExitReview(null); setExitConsent(null); setOwnerReview(null); setReservationConsent(null); setConsent(null); setApproved(false);
    const intent = await custody.readDeviceExitIntent(exitRole); live(held); if (!intent) throw Error('MOBILE_LOCAL_ORIGINAL_EXIT_REQUIRED');
    const value = await api.challenge(action, { ...await exitAccess(held), jobId: intent.jobId }); live(held); setExitJob(intent.jobId); setExitIntent(intent); setExitRecipient(intent.statement.recipient); setExitConsent(value);
  }
  async function submitExit(held: number) {
    const api = exitClient.current, custody = vault.current, value = exitConsent;
    if (!api || !custody || !value || !approved) throw Error('MOBILE_DEVICE_CONSENT_REQUIRED');
    setExitConsent(null); setApproved(false);
    custody.forgetDeviceOutputBalanceObservation(); onInvalidate?.(); setNote(null);
    const signature = await signDeviceExitConsentV1(value, origin, pairingId); live(held); let witness: DeviceExitWitnessV1 | undefined;
    try {
      if (value.action === 'PROVE_W39') { if (!exitRequest.current) throw Error('MOBILE_LOCAL_ORIGINAL_EXIT_REQUIRED');
        witness = await custody.bindDeviceExitProofRequest(exitRequest.current, value); live(held); }
      const result = await api.submit({ consent: value, signature, ...(witness ? { witness } : {}) }); live(held);
      if (result.stage === 'CONFIRMED') { await custody.applyDeviceExitConfirmation(result); live(held); }
      setExitJob(result.jobId); setMessage(result.stage === 'CONFIRMED' ? "Original output confirmed and saved. Not added as local available balance." : result.stage);
      const retained = await custody.readDeviceExitIntent(exitRole); live(held); setExitIntent(retained);
      const state = await custody.readDeviceNote(); live(held); await publishNote(state, held);
    } catch (error) { live(held); const notice = "UNKNOWN: consult this same W39 work. Never automatically repeat the test or withdrawal.";
      setMessage(notice); throw Error(notice, { cause: error });
    } finally { if (witness) wipeDeviceExitWitnessV1(witness); exitRequest.current?.close(); exitRequest.current = null; }
  }
  const edit = (update: (value: string) => void, value: string) => { clear(); update(value); };
  return <ScrollView contentContainerStyle={styles.body}>
    <Text style={styles.title}>Financing your local note</Text>
    <Text style={styles.text}>The root and note key remain on the device. Check how this single opening is sent when generating the test. This stream requires an original backend installed by the operator and trusted TLS.</Text>
    <TextInput style={styles.input} value={origin} onChangeText={value => edit(setOrigin, value)} autoCapitalize="none" placeholder="https://private origin" placeholderTextColor="#50616D" />
    <TextInput style={styles.input} value={pairingId} onChangeText={value => edit(setPairingId, value)} autoCapitalize="none" placeholder="Operator linkage identifier" placeholderTextColor="#50616D" />
    <Pressable disabled={busy} onPress={() => void run(connect)}><Text style={styles.button}>Open Note and Link</Text></Pressable>
    <Pressable disabled={busy} onPress={() => void run(resume)}><Text style={styles.button}>Reopen same saved operation</Text></Pressable>
    <Text style={styles.text}>Reopen uses the source and link retained in encrypted custody. It does not restore expired permissions or create authority on the server. Each next query or action requires your specific signature.</Text>
    {note?.job && <Text style={styles.text}>Work D26 withheld {note.job.jobId}
{reservationJob ? "Work U/S withheld " + reservationJob : ''}</Text>}
    {note && <Text style={styles.text}>Note {note.commitment.slice(0, 16)} · {note.status}\n Observed balance: {note.availableBalance ?? 'desconocido'}\n{note.freshness}
{note.localReservation?.sourceSpentAtRetainedHead ? "Source spent on receipt S withheld. Separately consult the change and recovery." : ''}</Text>}
    <Pressable disabled={busy || !note || note.status === 'FUNDED'} onPress={() => void run(prepare)}><Text style={styles.button}>Review test D26</Text></Pressable>
    <Pressable disabled={busy || !note?.job || note.status === 'FUNDED'} onPress={() => void run(held => review('FUND_D26', held))}><Text style={styles.button}>Reviewing single funding</Text></Pressable>
    <Pressable disabled={busy || !note?.job} onPress={() => void run(held => review('OBSERVE_D26', held))}><Text style={styles.button}>Check original transfer</Text></Pressable>
    {consent && <>
      <Text style={styles.text}>{consent.action}\nPool {consent.binding.asset.pool}\nNota {consent.statement.output}\nImporte {consent.statement.amount}\n{consent.action==='PROVE_D26'?(consent.version===2?"This opening is encrypted to the original recipient of the test.":"This opening is revealed to the original worker of the test."):"No other opening revealed"}</Text>
      <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: approved }} disabled={busy}
        onPress={() => setApproved(value => !value)}><Text style={styles.button}>{approved ? '☑' : '☐'}  I've reviewed this exact action.</Text></Pressable>
      <Pressable disabled={busy || !approved} onPress={() => void run(submit)}><Text style={styles.button}>Authorize this action</Text></Pressable>
    </>}
    {note?.status === 'FUNDED' && <>
      <Text style={styles.title}>Continue with same note</Text>
      <Text style={styles.text}>The original server offers the signed terms of the graph. Before saving the change and recovery, it authorizes a query of this same funding; it does not finance again. It does not adopt another note or send a root or key. U reveals only the openings to its worker; S requires another consent and a single reservation. The reservation does not execute the graph; execution and exit require other consents.</Text>
      <Pressable disabled={busy || note.availableBalance === null || reservationJob !== null} onPress={() => void run(preparationU)}><Text style={styles.button}>Read terms, consult funding and save change/recovery</Text></Pressable>
    </>}
    {ownerReview && <>
      <Text style={styles.text}>Operation {ownerReview.operationId}
Fuente {ownerReview.sourceCommitment}
Presupuesto {ownerReview.budget}  · change {ownerReview.changeAmount}  · recovery {ownerReview.recoveryAmount}
{ownerReview.actions.map(action => action.id + ' · ' + action.chainDomain + ' · pago ' + action.payoutAmount).join('\n')}
Hasta {ownerReview.settleBefore}
Frame {ownerReview.frameSHA256}</Text>
      <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: approved }} disabled={busy}
        onPress={() => setApproved(value => !value)}><Text style={styles.button}>{approved ? '☑' : '☐'}  I authorize these terms with the key to my note</Text></Pressable>
      <Pressable disabled={busy || !approved} onPress={() => void run(reviewProofU)}><Text style={styles.button}>Sign graph and review U test</Text></Pressable>
    </>}
    {reservationJob && <>
      <Pressable disabled={busy} onPress={() => void run(held => reviewReservation('RESERVE_S', held))}><Text style={styles.button}>Check original booking S</Text></Pressable>
      <Pressable disabled={busy} onPress={() => void run(held => reviewReservation('OBSERVE_S', held))}><Text style={styles.button}>Consult the same intention U/S</Text></Pressable>
    </>}
    {reservationConsent && <>
      <Text style={styles.text}>{reservationConsent.action}
Trabajo {reservationConsent.jobId}
Fuente {reservationConsent.statement.inputCommitment}
Cambio {reservationConsent.statement.changeCommitment}

Recovery {reservationConsent.statement.recoveryCommitment}
{reservationConsent.openingDisclosure ?? "Do not reveal other openings"}

This signature never authorizes automatic forwarding.</Text>
      <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: approved }} disabled={busy}
        onPress={() => setApproved(value => !value)}><Text style={styles.button}>{approved ? '☑' : '☐'}  I've reviewed this exact consent.</Text></Pressable>
      <Pressable disabled={busy || !approved} onPress={() => void run(submitReservation)}><Text style={styles.button}>Authorize only this action U/S</Text></Pressable>
    </>}
    {note?.localReservation?.sourceSpentAtRetainedHead && <>
      <Text style={styles.title}>Notes to this reservation</Text>
      <Text style={styles.text}>Asset {note.localReservation.assetIdentity}  · domain {note.localReservation.domainCommitment}</Text>
      {(['change', 'recovery'] as const).map(role => {
        const output = note.localReservation?.[role]; return output ? <Text key={role} style={styles.text}>
          {role === 'change' ? "Change" : "Recovery"}  · local amount {output.amount}
          {'\n'}Status: {output.state}  · available observed: {output.availableBalance ?? 'desconocido'}
          {output.withdrawnAmount !== null ? "\nOriginal withdrawal confirmed: " + output.withdrawnAmount : ''}
        </Text> : null;
      })}
      <Pressable disabled={busy} onPress={() => void run(observeOutputBalances)}><Text style={styles.button}>Authorize only reading of the balance of these notes</Text></Pressable>
      <Text style={styles.title}>Run the same reservation</Text>
      <Text style={styles.text}>An irreversible delivery remains at the risk accepted by the provider. If the answer is lost, see the original execution. Recovery retains the same reservation and requires the original deadline.</Text>
      <Pressable disabled={busy || !!executionIntent?.executeAttemptRetained || !!executionIntent?.outcome}
        onPress={() => void run(held => reviewExecution('EXECUTE_NATIVE', held))}><Text style={styles.button}>Review Single Execution</Text></Pressable>
      <Pressable disabled={busy} onPress={() => void run(held => reviewExecution('RECONCILE_NATIVE', held))}><Text style={styles.button}>Consult/reconcile original execution</Text></Pressable>
      <Pressable disabled={busy || !!executionIntent?.recoveryAttemptRetained || !!executionIntent?.outcome}
        onPress={() => void run(held => reviewExecution('RECOVER_NATIVE', held))}><Text style={styles.button}>Review Recovery on Expiry</Text></Pressable>
      {executionIntent && <Text style={styles.text}>Job {executionIntent.jobId}

Result withheld: {executionIntent.outcome ?? 'desconocido'}

Implementation intent: {executionIntent.executeAttemptRetained ? "saved; consult original" : "no local intention"}

Recovery intent: {executionIntent.recoveryAttemptRetained ? "saved; consult original" : "no local intention"}</Text>}
      <Text style={styles.title}>Automatic reserve recovery</Text>
      <Text style={styles.text}>You can activate the recovery after the original deadline. The operator service must remain active. Running the reservation requires your own permission.</Text>
      <Pressable disabled={busy} onPress={()=>void run(held=>reviewRecoveryArm('ARM_RECOVERY',held))}><Text style={styles.button}>Check activation</Text></Pressable>
      <Pressable disabled={busy} onPress={()=>void run(held=>reviewRecoveryArm('DISARM_RECOVERY',held))}><Text style={styles.button}>Review Deactivation</Text></Pressable>
      <Pressable disabled={busy} onPress={()=>void run(observeRecoveryArm)}><Text style={styles.button}>Check Status</Text></Pressable>
      {recoveryArmStatus&&<Text style={styles.text}>Status: {recoveryArmStateLabel(recoveryArmStatus.state)}  · original period {recoveryArmStatus.settleBefore}</Text>}
      {recoveryArmReview&&<><Text style={styles.text}>Action {recoveryArmReview.action}  · reservation {recoveryArmReview.execution.reservation.jobId}  · original period {recoveryArmReview.settleBefore}</Text>
        <Pressable disabled={busy} onPress={()=>setApproved(value=>!value)}><Text style={styles.button}>{approved?"reviewed permit":"Review and consent to this separate permission"}</Text></Pressable>
        <Pressable disabled={busy||!approved} onPress={()=>void run(submitRecoveryArm)}><Text style={styles.button}>Sign once this permission</Text></Pressable></>}
    </>}
    {note?.status === 'FUNDED' && (!note.localReservation || note.localReservation.sourceSpentAtRetainedHead) && <>
      <Text style={styles.title}>Out of the same custody</Text>
      <Text style={styles.text}>{note.localReservation
        ? "The change needs original S and unused nullifier; recovery also needs original F."
        : "The deposited note needs your original D26 and unused nullifier. You do not need to create a U/S reservation."}  Each W39 test uses this same opening and requires another permission to withdraw. There are no automatic retryings.</Text>
      <Pressable disabled={busy || !note.localReservation} onPress={() => void run(selectExitRole)}>
        <Text style={styles.button}>Opens: {exitRole==='deposit'?"note deposited":exitRole==='change'?'cambio':"recovery"}</Text></Pressable>
      {exitIntent && <Text style={styles.text}>Work W39 withheld {exitIntent.jobId}

Local State {exitIntent.receipt ? "Withdrawal confirmed by original receipt" : exitIntent.phase + " · result pending consultation"}

Consignee withheld {exitIntent.statement.recipient}
{exitIntent.receipt?.transactionHash ?? "No confirmed local receipt. No other work or forwarding is authorized."}</Text>}
      <TextInput style={styles.input} value={exitRecipient} onChangeText={value => edit(setExitRecipient, value)}
        autoCapitalize="none" placeholder="Exact EVM address: 40 characters hex, no 0x" placeholderTextColor="#50616D" />
      <Pressable disabled={busy || exitJob !== null} onPress={() => void run(prepareExit)}><Text style={styles.button}>Check inclusion and original output</Text></Pressable>
      <Pressable disabled={busy || !exitJob || !!exitIntent?.receipt} onPress={() => void run(held => reviewExit('WITHDRAW_W39', held))}><Text style={styles.button}>Review single withdrawal W39</Text></Pressable>
      <Pressable disabled={busy || !exitJob} onPress={() => void run(held => reviewExit('OBSERVE_W39', held))}><Text style={styles.button}>Consult original work/output</Text></Pressable>
    </>}
    {executionConsent && <>
      <Text style={styles.text}>{executionConsent.action}
Trabajo {executionConsent.reservation.jobId}
Reserva {executionConsent.reservation.statement.reserveCommitment}

Transaction S {executionConsent.reservationTransactionHash}

Linking {executionConsent.nativeBindingSHA256}

Current status {executionConsent.executionSnapshotSHA256}

Original deadline {executionConsent.reservation.statement.settleBefore}

Full refund from the owner; irreversible delivery to the supplier's risk.</Text>
      <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: approved }} disabled={busy}
        onPress={() => setApproved(value => !value)}><Text style={styles.button}>{approved ? '☑' : '☐'}  I've reviewed this one native action and its losses.</Text></Pressable>
      <Pressable disabled={busy || !approved} onPress={() => void run(submitExecution)}><Text style={styles.button}>Authorize only this native action</Text></Pressable>
    </>}
    {executionStatus && <Text style={styles.text}>Original status {executionStatus.stage}
{executionStatus.outcome ?? "Outstanding result"}
{executionStatus.errorCode ?? ''}</Text>}
    {exitReview && <>
      <Text style={styles.text}>W39 · {exitReview.noteRole}
Nota {exitReview.statement.commitment}
Importe {exitReview.statement.amount}
Destinatario {exitReview.statement.recipient}

Merkle root {exitReview.statement.root}
Epoch {exitReview.statement.epoch}

Native link {exitReview.nativeBindingSHA256}</Text>
      <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: approved }} disabled={busy}
        onPress={() => setApproved(value => !value)}><Text style={styles.button}>{approved ? '☑' : '☐'}  I authorize this exact output with the key to this opening</Text></Pressable>
      <Pressable disabled={busy || !approved} onPress={() => void run(reviewExitProof)}><Text style={styles.button}>Save intention and sign local W39</Text></Pressable>
    </>}
    {exitConsent && <>
      <Text style={styles.text}>{exitConsent.action}
Trabajo {exitConsent.jobId}
Apertura {exitConsent.noteRole}
Importe {exitConsent.statement.amount}
Destinatario {exitConsent.statement.recipient}
{exitConsent.openingDisclosure ?? "Do not reveal another opening"}</Text>
      <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: approved }} disabled={busy}
        onPress={() => setApproved(value => !value)}><Text style={styles.button}>{approved ? '☑' : '☐'}  I've reviewed this one consent W39.</Text></Pressable>
      <Pressable disabled={busy || !approved} onPress={() => void run(submitExit)}><Text style={styles.button}>Authorize only this action W39</Text></Pressable>
    </>}
    <Text style={styles.text}>{message}</Text><Pressable onPress={clear}><Text style={styles.button}>Close and Hide</Text></Pressable>
  </ScrollView>;
}
const styles = StyleSheet.create({ body: { padding: 20, gap: 12 }, title: { color: '#253746', fontSize: 22, fontWeight: '700' },
  text: { color: '#50616D', lineHeight: 21 }, input: { color: '#253746', borderColor: '#89877E', borderWidth: 1, padding: 12 },
  button: { color: '#253746', paddingVertical: 12 } });
