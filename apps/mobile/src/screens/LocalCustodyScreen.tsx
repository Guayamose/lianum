import {WalletText as Text,WalletTextInput as TextInput} from '../design/typography';
import {readDevicePublicKey,exportDeviceIdentityBackupV1,importDeviceIdentityBackupV1} from '../custody/key-store';
import {DEVICE_CUSTODY_BACKUP_MAX_SERIALIZED_BYTES_V1,DEVICE_NATIVE_ROOT_NOTE_BACKUP_MAX_SERIALIZED_BYTES_V1} from '../custody/sealed-custody-backup-v1.mjs';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, Pressable, SafeAreaView, ScrollView, StyleSheet, View } from 'react-native';
import { createLocalRootNoteOperationV1, inspectLocalRootNoteVaultV1, openLocalRootNoteVaultV1,
  type LocalDepositReviewV1, type LocalDepositSignatureV1, type LocalPreparedNoteSummaryV1, type LocalRootNoteInspectionV1 } from '../custody/local-root-note-vault-v1';

function Button({ label, onPress, disabled = false }: { label: string; onPress(): void; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled}
    onPress={onPress} style={[styles.button, disabled && styles.disabled]}><Text style={styles.buttonText}>{label}</Text></Pressable>;
}
const initial = "Local Custody of Preparation. It does not finance notes or authorize expenses.";
const emptyNote = { scope: '', policy: '', pool: '', recipient: '', amount: '' };
const noteFields = [['scope', 'Scope HEX (32 bytes)'], ['policy', 'Policy HEX (32 bytes)'],
  ['pool', "HEX Context Pool (20 bytes)"], ['recipient', "HEX context recipient (20 bytes)"],
  ['amount', "Atomic amount of prepared note"]] as const;
export default function LocalCustodyScreen() {
  const [inspection, setInspection] = useState<LocalRootNoteInspectionV1 | null>(null);
  const [prepared, setPrepared] = useState<LocalPreparedNoteSummaryV1 | null>(null);
  const [readback, setReadback] = useState(false);
  const [backup, setBackup] = useState(''), [backupInput, setBackupInput] = useState('');
  const [backupPassword,setBackupPassword]=useState(''),[backupConfirmation,setBackupConfirmation]=useState(''),[backupRootId,setBackupRootId]=useState('');
  const backupAbort=useRef<AbortController|null>(null);
  const [identityPublicKey,setIdentityPublicKey]=useState(''),[identityPassword,setIdentityPassword]=useState(''),[identityConfirmation,setIdentityConfirmation]=useState('');
  const [identityBackup,setIdentityBackup]=useState(''),[identityBackupInput,setIdentityBackupInput]=useState('');
  const identityAbort=useRef<AbortController|null>(null);
  const [rootInput, setRootInput] = useState(''), [revisionInput, setRevisionInput] = useState('');
  const [noteForm, setNoteForm] = useState(emptyNote);
  const [relation, setRelation] = useState<'D26' | 'D27'>('D26');
  const [epochInput, setEpochInput] = useState(''), [fromInput, setFromInput] = useState(''), [untilInput, setUntilInput] = useState('');
  const [depositReview, setDepositReview] = useState<LocalDepositReviewV1 | null>(null);
  const [signed, setSigned] = useState<LocalDepositSignatureV1 | null>(null), [accepted, setAccepted] = useState(false);
  const reviewRef = useRef<LocalDepositReviewV1 | null>(null), acceptedRef = useRef(false);
  const reviewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [notice, setNotice] = useState(initial), [busy, setBusy] = useState(false);
  const busyRef = useRef(false), mounted = useRef(true), epoch = useRef(0);
  const vault = useRef<ReturnType<typeof openLocalRootNoteVaultV1> | null>(null);
  const operation = useRef<ReturnType<typeof createLocalRootNoteOperationV1> | null>(null);
  const visible = (generation: number) => mounted.current && epoch.current === generation && AppState.currentState === 'active';
  function discardDeposit() {
    vault.current?.close(); vault.current = null; reviewRef.current = null; acceptedRef.current = false;
    if (reviewTimer.current !== null) clearTimeout(reviewTimer.current); reviewTimer.current = null;
    setDepositReview(null); setSigned(null); setAccepted(false);
  }
  function hide() {
    discardDeposit(); setNoteForm(emptyNote); setEpochInput(''); setFromInput(''); setUntilInput('');
    epoch.current++; operation.current?.close(); operation.current = null; vault.current?.close(); vault.current = null;
    identityAbort.current?.abort();identityAbort.current=null;
    setIdentityPassword('');setIdentityConfirmation('');setIdentityBackup('');setIdentityBackupInput('');setIdentityPublicKey('');
    backupAbort.current?.abort();backupAbort.current=null;setBackupPassword('');setBackupConfirmation('');setBackupRootId('');
    setBackup(''); setBackupInput(''); setRootInput(''); setRevisionInput('');
    setPrepared(null); setReadback(false);
  }
  useEffect(() => {
    mounted.current = true;
    const listener = AppState.addEventListener('change', value => { if (value !== 'active') hide(); });
    return () => { backupAbort.current?.abort();backupAbort.current=null;identityAbort.current?.abort();identityAbort.current=null; mounted.current = false; if (reviewTimer.current !== null) clearTimeout(reviewTimer.current); reviewRef.current = null; acceptedRef.current = false; epoch.current++; operation.current?.close(); operation.current = null; vault.current?.close(); vault.current = null; listener.remove(); };
  }, []);
  async function run(work: (generation: number) => Promise<void>) {
    if (busyRef.current || AppState.currentState !== 'active') return;
    busyRef.current = true; setBusy(true); const generation = epoch.current;
    try { await work(generation); }
    catch (error) {
      if (visible(generation)) {
        const code = error instanceof Error ? error.message : '';
        setNotice(code.includes('AUTHENTICATION_CANCELLED') ? "Operation cancelled, no secret shown."
          : code.includes('BACKUP_PASSWORD') ? "Use a password of at least 12 characters and keep it to recover the copy."
          : code.includes('BACKUP_AUTHENTICATION') || code.includes('BACKUP_BINDING') ? "The copy, password or expected identity do not match. No other identity was replaced."
          : code.includes('ALREADY_EXISTS') || code.includes('BACKUP_CONFLICT')
            ? "There is a different custody or registration. It is preserved without replacing it."
            : code.includes('WRITE_UNCERTAIN')
              ? "The writing became uncertain. Keep your copy and retrieve the same record before continuing."
              : "The custody could not be checked. Keep your copy and check the original status.");
      }
    } finally { busyRef.current = false; if (mounted.current) setBusy(false); }
  }
  async function readIdentity(generation:number){const value=await readDevicePublicKey();if(!visible(generation))return;setIdentityPublicKey(value??'');setNotice(value?"Original identity consulted. Save this public key with your encrypted copy.":"There is no local identity available. A copy of notes does not replace the identity that authorizes them.");}
  async function identityExport(generation:number){
    let password=identityPassword;const expected=identityPublicKey,confirmation=identityConfirmation;
    setIdentityPassword('');setIdentityConfirmation('');setIdentityBackup('');
    if(password!==confirmation)throw Error('MOBILE_CUSTODY_BACKUP_PASSWORD');
    const controller=new AbortController();identityAbort.current=controller;
    try{if(!visible(generation)){controller.abort();return;}const value=await exportDeviceIdentityBackupV1(password,expected,controller.signal);
      if(visible(generation)){setIdentityBackup(value);setNotice("Encrypted copy of the same listed identity. Save the complete JSON and password outside the device; also keep copies of your notes.");}
    }finally{password='';if(identityAbort.current===controller)identityAbort.current=null;}
  }
  function confirmIdentityExport(){const generation=epoch.current;Alert.alert("Create encrypted copy of identity","You will keep the same identity with the chosen password. This copy does not include notes nor is it sent to any service. Keep the copy and password in a safe place outside the phone.",[
    {text:"Cancel",style:'cancel'},{text:"Create with biometrics",onPress:()=>{if(visible(generation))void run(identityExport);}},]);}
  async function identityImport(generation:number){
    let input=identityBackupInput,password=identityPassword;const expected=identityPublicKey;
    setIdentityBackupInput('');setIdentityPassword('');setIdentityConfirmation('');setIdentityBackup('');
    const controller=new AbortController();identityAbort.current=controller;
    try{if(!visible(generation)){controller.abort();return;}const result=await importDeviceIdentityBackupV1(input,password,expected,controller.signal);
      if(visible(generation)){setIdentityPublicKey(result.devicePublicKey);setNotice("The same identity has been restored. No notes or balance were created. Recover your copies and check the original operations before you act.");}
    }finally{input='';password='';if(identityAbort.current===controller)identityAbort.current=null;}
  }
  function confirmIdentityImport(){const generation=epoch.current;Alert.alert("Restore the same identity","The expected public key should be the one you saved when pairing the device. The encrypted copy will be authenticated and any other identity already present will be retained.",[
    {text:"Cancel",style:'cancel'},{text:"Restore with biometrics",onPress:()=>{if(visible(generation))void run(identityImport);}},]);}
  async function refresh(generation: number) {
    const state = await inspectLocalRootNoteVaultV1();
    if (!visible(generation)) return;
    setInspection(state);
    setNotice(state.status === 'ACTIVE' ? "Encrypted record present. Confirm with biometrics to read it or make a copy."
      : state.status === 'RECOVERY_REQUIRED' ? "Registration pending explicit recovery. No balance is assumed and no keys are replaced."
        : state.status === 'UNAVAILABLE' ? "Protected storage requires a compatible iOS or Android device."
          : "There is no custody metadata. Creating a root will not replace another existing root.");
  }
  async function read(generation: number) {
    discardDeposit();
    if (!inspection?.rootId || inspection.status !== 'ACTIVE') return;
    vault.current?.close(); const capability = openLocalRootNoteVaultV1(inspection.rootId); vault.current = capability;
    try {
      const value = await capability.readPreparedNote();
      if (visible(generation)) { setPrepared(value); setReadback(true); setNotice("Local reading checked. A prepared note is not yet available balance."); }
    } finally { capability.close(); if (vault.current === capability) vault.current = null; }
  }
  async function exportBackup(generation: number) {
    discardDeposit();
    let password=backupPassword;const confirmation=backupConfirmation;
    setBackupPassword('');setBackupConfirmation('');setBackup('');
    if (!inspection?.rootId || inspection.status !== 'ACTIVE') return;
    if(password!==confirmation)throw Error('MOBILE_CUSTODY_BACKUP_PASSWORD');
    vault.current?.close(); const capability = openLocalRootNoteVaultV1(inspection.rootId); vault.current = capability;
    const controller=new AbortController();backupAbort.current=controller;
    try {
      if(!visible(generation)){controller.abort();return;}
      const value = await capability.exportBackup(password,controller.signal);
      if (visible(generation)) { setBackup(value);setBackupRootId(inspection.rootId);setNotice("Encrypted copy list. Save the complete JSON, the root public ID and password out of the device."); }
    } finally { password='';capability.close();if(backupAbort.current===controller)backupAbort.current=null;if (vault.current === capability) vault.current = null; }
  }
  function confirmExport() {
    const generation = epoch.current;
    Alert.alert("Create encrypted copy of recovery",
      "The password protects the root and the original record. It saves the full copy, the public root ID and the password outside the phone. It is not automatically transmitted or copied.", [
        { text: "Cancel", style: 'cancel', onPress:()=>{setBackupPassword('');setBackupConfirmation('');} },
        { text: "Create with biometrics", onPress: () => { if (visible(generation)) void run(exportBackup); } },
      ]);
  }
  async function create(generation: number) {
    const capability = createLocalRootNoteOperationV1(); operation.current = capability;
    try {
      const created = await capability.create();
      if (!visible(generation)) return;
      await refresh(generation);
      if (visible(generation)) setNotice("Root created and saved. Now make a recovery copy: the public ID does not retrieve the key. There is no funded note. ID: " + created.rootId);
    } finally { capability.close(); if (operation.current === capability) operation.current = null; }
  }
  async function restore(generation: number) {
    let input=backupInput,password=backupPassword;const expected=backupRootId;
    setBackupInput('');setBackupPassword('');setBackupConfirmation('');setBackup('');
    const capability = createLocalRootNoteOperationV1(); operation.current = capability;
    const controller=new AbortController();backupAbort.current=controller;
    try {
      if(!visible(generation)){controller.abort();return;}
      const result = await capability.restore(input,password,expected===''?undefined:expected,controller.signal);
      if (!visible(generation)) return;
      setPrepared(result.note); setReadback(true); await refresh(generation);
      if (visible(generation)) setNotice("Authenticated copy and restored original record. Check the original operations; the copy does not set balance or renew permissions.");
    } finally { input='';password='';capability.close();if(backupAbort.current===controller)backupAbort.current=null;if (operation.current === capability) operation.current = null; }
  }
  async function recover(generation: number) {
    let root = rootInput; const revision = revisionInput;
    setRootInput(''); setRevisionInput('');
    const capability = createLocalRootNoteOperationV1(); operation.current = capability;
    try {
      if (!/^(0|[1-9][0-9]*)$/.test(revision) || revision.length > 16 || !Number.isSafeInteger(Number(revision))) throw Error('MOBILE_LOCAL_NOTE_RECOVERY_BINDING');
      const result = await capability.recover(root, Number(revision));
      if (!visible(generation)) return;
      setPrepared(result.note); setReadback(true); await refresh(generation);
      if (visible(generation)) setNotice("The same root has recovered the original record. No other note was created or funded.");
    } finally { root = ''; capability.close(); if (operation.current === capability) operation.current = null; }
  }
  async function prepareNote(generation: number) {
    if (!inspection?.rootId || inspection.status !== 'ACTIVE' || !readback || prepared) return;
    discardDeposit();
    const capability = openLocalRootNoteVaultV1(inspection.rootId); vault.current = capability;
    try {
      const note = await capability.prepareUnissuedBalanceNote({ ...noteForm });
      if (!visible(generation)) return;
      setPrepared(note); setReadback(true); await refresh(generation);
      if (visible(generation)) setNotice("Local cryptographic opening prepared and encrypted. Follow UNISSUED; the amount is not balance. Updates the recovery copy.");
    } finally { capability.close(); if (vault.current === capability) vault.current = null; }
  }
  async function reviewDeposit(generation: number) {
    if (!inspection?.rootId || inspection.status !== 'ACTIVE' || !prepared) return;
    discardDeposit(); const capability = openLocalRootNoteVaultV1(inspection.rootId); vault.current = capability;
    try {
      const review = await capability.reviewPreparedDeposit(relation === 'D26'
        ? { relation: 'D26', epoch: epochInput } : { relation: 'D27', validFrom: fromInput, validUntil: untilInput });
      if (!visible(generation)) { capability.close(); return; }
      reviewRef.current = review; setDepositReview(review); setPrepared(review.note);
      reviewTimer.current = setTimeout(hide, Math.max(0, review.expiresAt - Date.now()));
      setNotice("Check the original terms. Authorization expires in 15 seconds and does not finance or send anything.");
    } catch (error) { capability.close(); if (vault.current === capability) vault.current = null; throw error; }
  }
  async function signDeposit(generation: number, original: LocalDepositReviewV1) {
    const capability = vault.current;
    if (!capability || reviewRef.current !== original || !acceptedRef.current || !visible(generation)) return;
    acceptedRef.current = false; setAccepted(false);
    try {
      const result = await capability.signPreparedDeposit(original);
      if (!visible(generation)) return;
      setSigned(result); await refresh(generation);
      if (visible(generation)) setNotice("Local signature issued only for this term. The note continues UNISSUED and was not sent to the network. Update the copy; a previous backup does not offer antirollback protection.");
    } finally { capability.close(); if (vault.current === capability) vault.current = null; }
  }
  function confirmDeposit() {
    const original = reviewRef.current, generation = epoch.current;
    if (!original || !acceptedRef.current || !visible(generation)) return;
    Alert.alert("Sign local deposit " + original.choice.relation,
      "Root: " + original.rootId + '\nNota: ' + original.note.commitment
      + "\nAtomic amount: " + original.note.amount + "\nSigned terms: " + JSON.stringify(original.statement)
      + "\nThe exact attempt will be saved before signing. It does not authorize an expense, does not create balance and does not send data. The attempt restriction is only local.", [
        { text: "Cancel", style: 'cancel', onPress: discardDeposit },
        { text: "Sign with biometrics", onPress: () => {
          if (visible(generation) && reviewRef.current === original && acceptedRef.current) void run(value => signDeposit(value, original));
        } },
      ]);
  }
  return <SafeAreaView style={styles.safe}><ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <Text style={styles.title}>Local custody</Text>
    <Text style={styles.muted}>Protected root and encrypted registration on this device, separated from the identity that signs HTTP permissions. This preparation does not enable funding or expense.</Text>
    <View style={styles.card}><Text style={styles.heading}>Local State</Text>
      <Text style={styles.value}>Status: {inspection?.status ?? "Pending consultation"}</Text>
      {inspection?.rootId && <Text selectable style={styles.value}>Public ID: {inspection.rootId}</Text>}
      {inspection?.revision !== null && inspection?.revision !== undefined && <Text style={styles.value}>Metadata review: {inspection.revision}</Text>}
      {inspection?.recordRevision !== null && inspection?.recordRevision !== undefined && <Text style={styles.value}>Review of the encrypted record: {inspection.recordRevision}</Text>}
      <Text style={styles.value}>Available balance: pending verification</Text>
      <Button label="Check Local Status" disabled={busy} onPress={() => { hide(); void run(refresh); }} />
      <Button label="Create protected root and empty registration" disabled={busy || inspection?.status !== 'ABSENT_METADATA'} onPress={() => { hide(); void run(create); }} />
      <Button label="Read registration with biometrics" disabled={busy || inspection?.status !== 'ACTIVE'} onPress={() => { void run(read); }} />
      {readback && <Text style={styles.muted}>{prepared ? "There is a note prepared by UNISSUED. Its amount is not counted as available money." : "Authenticated registration is empty."}</Text>}
      {prepared && <Text selectable style={styles.value}>Commitment of the prepared note: {prepared.commitment}</Text>}
    </View>
    <View style={styles.card}><Text style={styles.heading}>Prepare a local note</Text>
      <Text style={styles.muted}>Only a UNISSUED registry. The terms are explicitly introduced; they are not an authenticated discovery of contracts or enable funding.</Text>
      {noteFields.map(([key, label]) => <View key={key}><Text style={styles.label}>{label}</Text>
        <TextInput accessibilityLabel={label} style={styles.input} value={noteForm[key]} autoCapitalize="none" autoCorrect={false}
          maxLength={key === 'amount' ? 20 : key === 'pool' || key === 'recipient' ? 40 : 64}
          editable={!busy && prepared === null} onChangeText={value => { discardDeposit(); setNoteForm(current => ({ ...current, [key]: value })); }} />
      </View>)}
      <Button label="Prepare local opening with biometrics" disabled={busy || !readback || prepared !== null || inspection?.status !== 'ACTIVE'}
        onPress={() => { void run(prepareNote); }} />
    </View>
    <View style={styles.card}><Text style={styles.heading}>Local deposit signature</Text>
      <Text style={styles.muted}>A D26/D27 signature of the original note, without opening it to the backend. It does not generate proof, funding or expense. Pool and recipient are local context; only the original fields of the circuit are signed.</Text>
      <View style={{ flexDirection: 'row', gap: 12 }}><Button label="D26 · epoch" disabled={busy} onPress={() => { discardDeposit(); setRelation('D26'); }} />
        <Button label="D27 · absolute window" disabled={busy} onPress={() => { discardDeposit(); setRelation('D27'); }} /></View>
      <Text style={styles.value}>Relationship: {relation}</Text>
      {relation === 'D26' ? <TextInput accessibilityLabel="Original D26 epoch" value={epochInput} style={styles.input} editable={!busy} maxLength={20}
        onChangeText={value => { discardDeposit(); setEpochInput(value); }} /> : <>
        <TextInput accessibilityLabel="Absolute start D27 (Unix seconds)" value={fromInput} style={styles.input} editable={!busy} maxLength={20}
          onChangeText={value => { discardDeposit(); setFromInput(value); }} />
        <TextInput accessibilityLabel="Exclusive End D27 (Unix seconds)" value={untilInput} style={styles.input} editable={!busy} maxLength={20}
          onChangeText={value => { discardDeposit(); setUntilInput(value); }} /></>}
      <Button label="Check exact term with biometrics" disabled={busy || prepared === null || inspection?.status !== 'ACTIVE'} onPress={() => { void run(reviewDeposit); }} />
      {depositReview && <><Text selectable style={styles.value}>Root: {depositReview.rootId}  · revision {depositReview.revision}</Text>
        <Text selectable style={styles.value}>Note: {depositReview.note.commitment}</Text>
        <Text selectable style={styles.value}>Local pool: {depositReview.note.pool}  · local recipient: {depositReview.note.recipient}</Text>
        <Text selectable style={styles.value}>Original term: {JSON.stringify(depositReview.statement)}</Text>
        <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: accepted }} disabled={busy || signed !== null}
          onPress={() => { const next = !acceptedRef.current; acceptedRef.current = next; setAccepted(next); if (!next) discardDeposit(); }}>
          <Text style={styles.muted}>{accepted ? '☑' : '☐'}  I have reviewed root, note, scope, policy, amount and validity. I only authorize this local signature.</Text>
        </Pressable>
        <Button label="Confirm exact signature with biometrics" disabled={busy || !accepted || signed !== null} onPress={confirmDeposit} />
        <Button label="Cancel Review and Close" disabled={busy} onPress={discardDeposit} />
      </>}
      {signed && <Text selectable style={styles.value}>Local result (hidden on expiry or exit): {JSON.stringify(signed)}</Text>}
    </View>
    <View style={styles.card}><Text style={styles.heading}>Recovery Copy</Text>
      <Text style={styles.muted}>The copy encrypts your root and the entire record with your password. Save the JSON, the public root ID and the password outside the device. Update it when you change the revision. It is not a BIP39 phrase nor shows balance.</Text>
      <Text style={styles.label}>Copy password · at least 12 characters</Text>
      <TextInput accessibilityLabel="Password of the encrypted copy of local custody" style={styles.input} value={backupPassword}
        onChangeText={setBackupPassword} editable={!busy} secureTextEntry autoCapitalize="none" autoCorrect={false} maxLength={1024}/>
      <Text style={styles.label}>Repeat password to create a copy</Text>
      <TextInput accessibilityLabel="Confirmation of the local custody password" style={styles.input} value={backupConfirmation}
        onChangeText={setBackupConfirmation} editable={!busy} secureTextEntry autoCapitalize="none" autoCorrect={false} maxLength={1024}/>
      <Button label="Create encrypted copy with biometrics" disabled={busy || inspection?.status !== 'ACTIVE' || backupPassword.length<12 || backupPassword!==backupConfirmation} onPress={confirmExport}/>
      {backup !== '' && <><Text selectable style={styles.value}>Root public ID: {backupRootId}</Text><Text selectable style={styles.value}>{backup}</Text><Button label="Hide copy and close read" onPress={hide}/></>}
      <Text style={styles.label}>Original Root Public ID to Restore</Text>
      <TextInput accessibilityLabel="Original root public ID to restore custody" style={styles.input} value={backupRootId}
        onChangeText={setBackupRootId} editable={!busy} autoCapitalize="none" autoCorrect={false} maxLength={64}/>
      <Text style={styles.label}>Import full copy on this device</Text>
      <TextInput accessibilityLabel="Local recovery JSON encrypted copy" style={styles.input} value={backupInput}
        onChangeText={setBackupInput} editable={!busy} secureTextEntry autoCapitalize="none" autoCorrect={false} maxLength={DEVICE_NATIVE_ROOT_NOTE_BACKUP_MAX_SERIALIZED_BYTES_V1}/>
      <Button label="Authenticate and import biometric copy" disabled={busy || backupInput.length===0} onPress={()=>{void run(restore);}}/>
      <Text style={styles.muted}>You can also import a complete old copy. Its previous format lacks password; keep it private and then create an encrypted copy.</Text>
      <Button label="Cancel, hide data and close" onPress={hide}/>
    </View>
    <View style={styles.card}><Text style={styles.heading}>Device identity</Text>
      <Text style={styles.muted}>This encrypted copy recovers the same identity that authorizes your operations. Also save copies of your notes; no copy sets balance on its own. It is not automatically sent or copied.</Text>
      <Button label="Consult my current identity" disabled={busy} onPress={()=>{void run(readIdentity);}}/>
      <Text style={styles.label}>Original public key saved when pairing</Text>
      <TextInput accessibilityLabel="Original public key to identity" style={styles.input} value={identityPublicKey} onChangeText={setIdentityPublicKey} editable={!busy} autoCapitalize="none" autoCorrect={false} maxLength={130}/>
      <Text style={styles.label}>Copy password · at least 12 characters</Text>
      <TextInput accessibilityLabel="Password of the encrypted copy of identity" style={styles.input} value={identityPassword} onChangeText={setIdentityPassword} editable={!busy} secureTextEntry autoCapitalize="none" autoCorrect={false} maxLength={1024}/>
      <Text style={styles.label}>Repeat password to create a copy</Text>
      <TextInput accessibilityLabel="Password confirmation to create copy" style={styles.input} value={identityConfirmation} onChangeText={setIdentityConfirmation} editable={!busy} secureTextEntry autoCapitalize="none" autoCorrect={false} maxLength={1024}/>
      <Button label="Create encrypted copy with biometrics" disabled={busy||identityPublicKey.length!==130||identityPassword.length<12||identityPassword!==identityConfirmation} onPress={confirmIdentityExport}/>
      {identityBackup!==''&&<><Text selectable style={styles.value}>{identityBackup}</Text><Button label="Hide copy and close" onPress={hide}/></>}
      <Text style={styles.label}>Import full JSON encryption</Text>
      <TextInput accessibilityLabel="JSON encrypted copy of identity to restore" style={styles.input} value={identityBackupInput} onChangeText={setIdentityBackupInput} editable={!busy} secureTextEntry autoCapitalize="none" autoCorrect={false} maxLength={DEVICE_CUSTODY_BACKUP_MAX_SERIALIZED_BYTES_V1}/>
      <Button label="Restore original identity with biometrics" disabled={busy||identityPublicKey.length!==130||identityPassword.length<12||identityBackupInput.length===0} onPress={confirmIdentityImport}/>
    </View>
    <View style={styles.card}><Text style={styles.heading}>Retrieve an interrupted write</Text>
      <Text style={styles.muted}>It uses the original HEX root and the revision of the ciphertext you retain. It does not replace an existing record with another record or re-generate notes.</Text>
      <TextInput accessibilityLabel="Original HEX root for local recovery" style={styles.input} value={rootInput}
        onChangeText={setRootInput} editable={!busy} secureTextEntry autoCapitalize="none" autoCorrect={false} maxLength={64} />
      <TextInput accessibilityLabel="Original revision of the encrypted registry" style={styles.input} value={revisionInput}
        onChangeText={setRevisionInput} editable={!busy} keyboardType="number-pad" maxLength={16} />
      <Button label="Recover the same record with biometrics" disabled={busy || rootInput.length !== 64 || revisionInput.length === 0}
        onPress={() => { void run(recover); }} />
    </View>
    <View accessibilityLiveRegion="polite" style={styles.card}>{busy && <ActivityIndicator color="#253746" />}<Text style={styles.muted}>{notice}</Text></View>
  </ScrollView></SafeAreaView>;
}
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F3F0E8' }, content: { padding: 24, paddingBottom: 48, gap: 18 },
  title: { color: '#253746', fontSize: 28, fontWeight: '600' }, heading: { color: '#253746', fontSize: 18, fontWeight: '600' },
  card: { backgroundColor: '#FAF8F3', borderRadius:6, padding: 20, gap: 12 }, muted: { color: '#50616D', fontSize: 14, lineHeight: 21 },
  label: { color: '#253746', fontSize: 12 }, value: { color: '#253746', fontSize: 12, lineHeight: 19 }, secret: { color: '#795A20', fontSize: 12, lineHeight: 19 },
  input: { color: '#253746', backgroundColor: '#FAF8F3', borderColor: '#89877E', borderWidth: 1, borderRadius: 10, padding: 12, minHeight: 46 },
  button: { backgroundColor: '#253746', borderRadius: 10, padding: 14, alignItems: 'center' }, buttonText: { color: '#F3F0E8', fontWeight: '700', fontSize: 14 }, disabled: { opacity: 0.42 },
});
