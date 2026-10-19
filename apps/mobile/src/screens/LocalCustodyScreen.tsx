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
const initial = 'Custodia local de preparación. No financia notas ni habilita gastos.';
const emptyNote = { scope: '', policy: '', pool: '', recipient: '', amount: '' };
const noteFields = [['scope', 'Scope HEX (32 bytes)'], ['policy', 'Policy HEX (32 bytes)'],
  ['pool', 'Pool de contexto HEX (20 bytes)'], ['recipient', 'Destinatario de contexto HEX (20 bytes)'],
  ['amount', 'Importe atómico de la nota preparada']] as const;
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
        setNotice(code.includes('AUTHENTICATION_CANCELLED') ? 'Operación cancelada. No se muestra ningún secreto.'
          : code.includes('BACKUP_PASSWORD') ? 'Usa una contraseña de al menos 12 caracteres y conserva la misma para recuperar la copia.'
          : code.includes('BACKUP_AUTHENTICATION') || code.includes('BACKUP_BINDING') ? 'La copia, la contraseña o la identidad esperada no coinciden. No se sustituyó otra identidad.'
          : code.includes('ALREADY_EXISTS') || code.includes('BACKUP_CONFLICT')
            ? 'Existe una custodia o registro distinto. Se conserva sin sustituirlo.'
            : code.includes('WRITE_UNCERTAIN')
              ? 'La escritura quedó incierta. Conserva tu copia y recupera el mismo registro antes de continuar.'
              : 'No se pudo comprobar la custodia. Conserva tu copia y revisa el estado original.');
      }
    } finally { busyRef.current = false; if (mounted.current) setBusy(false); }
  }
  async function readIdentity(generation:number){const value=await readDevicePublicKey();if(!visible(generation))return;setIdentityPublicKey(value??'');setNotice(value?'Identidad original consultada. Guarda esta clave pública con tu copia cifrada.':'No hay identidad local disponible. Una copia de notas no reemplaza la identidad que las autoriza.');}
  async function identityExport(generation:number){
    let password=identityPassword;const expected=identityPublicKey,confirmation=identityConfirmation;
    setIdentityPassword('');setIdentityConfirmation('');setIdentityBackup('');
    if(password!==confirmation)throw Error('MOBILE_CUSTODY_BACKUP_PASSWORD');
    const controller=new AbortController();identityAbort.current=controller;
    try{if(!visible(generation)){controller.abort();return;}const value=await exportDeviceIdentityBackupV1(password,expected,controller.signal);
      if(visible(generation)){setIdentityBackup(value);setNotice('Copia cifrada de la misma identidad lista. Guarda el JSON completo y la contraseña fuera del dispositivo; conserva también las copias de tus notas.');}
    }finally{password='';if(identityAbort.current===controller)identityAbort.current=null;}
  }
  function confirmIdentityExport(){const generation=epoch.current;Alert.alert('Crear copia cifrada de identidad','Guardarás la misma identidad con la contraseña elegida. Esta copia no incluye las notas ni se envía a ningún servicio. Conserva la copia y la contraseña en un lugar seguro fuera del teléfono.',[
    {text:'Cancelar',style:'cancel'},{text:'Crear con biometría',onPress:()=>{if(visible(generation))void run(identityExport);}},]);}
  async function identityImport(generation:number){
    let input=identityBackupInput,password=identityPassword;const expected=identityPublicKey;
    setIdentityBackupInput('');setIdentityPassword('');setIdentityConfirmation('');setIdentityBackup('');
    const controller=new AbortController();identityAbort.current=controller;
    try{if(!visible(generation)){controller.abort();return;}const result=await importDeviceIdentityBackupV1(input,password,expected,controller.signal);
      if(visible(generation)){setIdentityPublicKey(result.devicePublicKey);setNotice('La misma identidad ha sido restaurada. No se crearon notas ni saldo. Recupera sus copias y consulta las operaciones originales antes de actuar.');}
    }finally{input='';password='';if(identityAbort.current===controller)identityAbort.current=null;}
  }
  function confirmIdentityImport(){const generation=epoch.current;Alert.alert('Restaurar la misma identidad','La clave pública esperada debe ser la que guardaste al emparejar el dispositivo. Se autenticará la copia cifrada y se conservará cualquier identidad distinta ya presente.',[
    {text:'Cancelar',style:'cancel'},{text:'Restaurar con biometría',onPress:()=>{if(visible(generation))void run(identityImport);}},]);}
  async function refresh(generation: number) {
    const state = await inspectLocalRootNoteVaultV1();
    if (!visible(generation)) return;
    setInspection(state);
    setNotice(state.status === 'ACTIVE' ? 'Registro cifrado presente. Confirma con biometría para leerlo o hacer una copia.'
      : state.status === 'RECOVERY_REQUIRED' ? 'Registro pendiente de recuperación explícita. No se supone saldo ni se reemplazan claves.'
        : state.status === 'UNAVAILABLE' ? 'El almacenamiento protegido requiere un dispositivo iOS o Android compatible.'
          : 'No hay metadatos de custodia. Crear una raíz no sustituirá otra raíz existente.');
  }
  async function read(generation: number) {
    discardDeposit();
    if (!inspection?.rootId || inspection.status !== 'ACTIVE') return;
    vault.current?.close(); const capability = openLocalRootNoteVaultV1(inspection.rootId); vault.current = capability;
    try {
      const value = await capability.readPreparedNote();
      if (visible(generation)) { setPrepared(value); setReadback(true); setNotice('Lectura local comprobada. Una nota preparada aún no es saldo disponible.'); }
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
      if (visible(generation)) { setBackup(value);setBackupRootId(inspection.rootId);setNotice('Copia cifrada lista. Guarda el JSON completo, el ID público de raíz y la contraseña fuera del dispositivo.'); }
    } finally { password='';capability.close();if(backupAbort.current===controller)backupAbort.current=null;if (vault.current === capability) vault.current = null; }
  }
  function confirmExport() {
    const generation = epoch.current;
    Alert.alert('Crear copia cifrada de recuperación',
      'La contraseña protege la raíz y el registro original. Guarda la copia completa, el ID público de raíz y la contraseña fuera del teléfono. No se transmite ni se copia automáticamente.', [
        { text: 'Cancelar', style: 'cancel', onPress:()=>{setBackupPassword('');setBackupConfirmation('');} },
        { text: 'Crear con biometría', onPress: () => { if (visible(generation)) void run(exportBackup); } },
      ]);
  }
  async function create(generation: number) {
    const capability = createLocalRootNoteOperationV1(); operation.current = capability;
    try {
      const created = await capability.create();
      if (!visible(generation)) return;
      await refresh(generation);
      if (visible(generation)) setNotice('Raíz creada y guardada. Haz ahora una copia de recuperación: el ID público no recupera la clave. No hay una nota financiada. ID: ' + created.rootId);
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
      if (visible(generation)) setNotice('Copia autenticada y registro original restaurado. Consulta las operaciones originales; la copia no establece saldo ni renueva permisos.');
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
      if (visible(generation)) setNotice('La misma raíz ha recuperado el registro original. No se creó ni financió otra nota.');
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
      if (visible(generation)) setNotice('Apertura criptográfica local preparada y cifrada. Sigue UNISSUED; el importe no es saldo. Actualiza la copia de recuperación.');
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
      setNotice('Revisa los términos originales. La autorización caduca en 15 segundos y no financia ni envía nada.');
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
      if (visible(generation)) setNotice('Firma local emitida sólo para este término. La nota continúa UNISSUED y no se envió a la red. Actualiza la copia; un backup anterior no ofrece protección antirollback.');
    } finally { capability.close(); if (vault.current === capability) vault.current = null; }
  }
  function confirmDeposit() {
    const original = reviewRef.current, generation = epoch.current;
    if (!original || !acceptedRef.current || !visible(generation)) return;
    Alert.alert('Firmar el depósito local ' + original.choice.relation,
      'Raíz: ' + original.rootId + '\nNota: ' + original.note.commitment
      + '\nImporte atómico: ' + original.note.amount + '\nTérminos firmados: ' + JSON.stringify(original.statement)
      + '\nSe guardará el intento exacto antes de firmar. No autoriza un gasto, no crea saldo y no envía datos. La restricción del intento sólo es local.', [
        { text: 'Cancelar', style: 'cancel', onPress: discardDeposit },
        { text: 'Firmar con biometría', onPress: () => {
          if (visible(generation) && reviewRef.current === original && acceptedRef.current) void run(value => signDeposit(value, original));
        } },
      ]);
  }
  return <SafeAreaView style={styles.safe}><ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <Text style={styles.title}>Custodia local</Text>
    <Text style={styles.muted}>Raíz protegida y registro cifrado en este dispositivo, separados de la identidad que firma permisos HTTP. Esta preparación no habilita financiación ni gasto.</Text>
    <View style={styles.card}><Text style={styles.heading}>Estado local</Text>
      <Text style={styles.value}>Estado: {inspection?.status ?? 'Pendiente de consultar'}</Text>
      {inspection?.rootId && <Text selectable style={styles.value}>ID público: {inspection.rootId}</Text>}
      {inspection?.revision !== null && inspection?.revision !== undefined && <Text style={styles.value}>Revisión de metadatos: {inspection.revision}</Text>}
      {inspection?.recordRevision !== null && inspection?.recordRevision !== undefined && <Text style={styles.value}>Revisión del registro cifrado: {inspection.recordRevision}</Text>}
      <Text style={styles.value}>Saldo disponible: pendiente de verificar</Text>
      <Button label="Consultar estado local" disabled={busy} onPress={() => { hide(); void run(refresh); }} />
      <Button label="Crear raíz protegida y registro vacío" disabled={busy || inspection?.status !== 'ABSENT_METADATA'} onPress={() => { hide(); void run(create); }} />
      <Button label="Leer registro con biometría" disabled={busy || inspection?.status !== 'ACTIVE'} onPress={() => { void run(read); }} />
      {readback && <Text style={styles.muted}>{prepared ? 'Hay una nota preparada UNISSUED. Su importe no se cuenta como dinero disponible.' : 'El registro autenticado está vacío.'}</Text>}
      {prepared && <Text selectable style={styles.value}>Compromiso de la nota preparada: {prepared.commitment}</Text>}
    </View>
    <View style={styles.card}><Text style={styles.heading}>Preparar una nota local</Text>
      <Text style={styles.muted}>Sólo un registro UNISSUED. Los términos se introducen de forma explícita; no son un descubrimiento autenticado de contratos ni habilitan financiación.</Text>
      {noteFields.map(([key, label]) => <View key={key}><Text style={styles.label}>{label}</Text>
        <TextInput accessibilityLabel={label} style={styles.input} value={noteForm[key]} autoCapitalize="none" autoCorrect={false}
          maxLength={key === 'amount' ? 20 : key === 'pool' || key === 'recipient' ? 40 : 64}
          editable={!busy && prepared === null} onChangeText={value => { discardDeposit(); setNoteForm(current => ({ ...current, [key]: value })); }} />
      </View>)}
      <Button label="Preparar apertura local con biometría" disabled={busy || !readback || prepared !== null || inspection?.status !== 'ACTIVE'}
        onPress={() => { void run(prepareNote); }} />
    </View>
    <View style={styles.card}><Text style={styles.heading}>Firma local de depósito</Text>
      <Text style={styles.muted}>Una firma D26/D27 de la nota original, sin abrirla al backend. No genera prueba, financiación ni gasto. Pool y destinatario son contexto local; sólo se firman los campos originales del circuito.</Text>
      <View style={{ flexDirection: 'row', gap: 12 }}><Button label="D26 · epoch" disabled={busy} onPress={() => { discardDeposit(); setRelation('D26'); }} />
        <Button label="D27 · ventana absoluta" disabled={busy} onPress={() => { discardDeposit(); setRelation('D27'); }} /></View>
      <Text style={styles.value}>Relación: {relation}</Text>
      {relation === 'D26' ? <TextInput accessibilityLabel="Epoch original D26" value={epochInput} style={styles.input} editable={!busy} maxLength={20}
        onChangeText={value => { discardDeposit(); setEpochInput(value); }} /> : <>
        <TextInput accessibilityLabel="Inicio absoluto D27 (Unix segundos)" value={fromInput} style={styles.input} editable={!busy} maxLength={20}
          onChangeText={value => { discardDeposit(); setFromInput(value); }} />
        <TextInput accessibilityLabel="Fin exclusivo D27 (Unix segundos)" value={untilInput} style={styles.input} editable={!busy} maxLength={20}
          onChangeText={value => { discardDeposit(); setUntilInput(value); }} /></>}
      <Button label="Revisar término exacto con biometría" disabled={busy || prepared === null || inspection?.status !== 'ACTIVE'} onPress={() => { void run(reviewDeposit); }} />
      {depositReview && <><Text selectable style={styles.value}>Raíz: {depositReview.rootId} · revisión {depositReview.revision}</Text>
        <Text selectable style={styles.value}>Nota: {depositReview.note.commitment}</Text>
        <Text selectable style={styles.value}>Pool local: {depositReview.note.pool} · destinatario local: {depositReview.note.recipient}</Text>
        <Text selectable style={styles.value}>Término original: {JSON.stringify(depositReview.statement)}</Text>
        <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: accepted }} disabled={busy || signed !== null}
          onPress={() => { const next = !acceptedRef.current; acceptedRef.current = next; setAccepted(next); if (!next) discardDeposit(); }}>
          <Text style={styles.muted}>{accepted ? '☑' : '☐'} He revisado raíz, nota, scope, policy, importe y vigencia. Sólo autorizo esta firma local.</Text>
        </Pressable>
        <Button label="Confirmar firma exacta con biometría" disabled={busy || !accepted || signed !== null} onPress={confirmDeposit} />
        <Button label="Cancelar revisión y cerrar" disabled={busy} onPress={discardDeposit} />
      </>}
      {signed && <Text selectable style={styles.value}>Resultado local (se oculta al caducar o salir): {JSON.stringify(signed)}</Text>}
    </View>
    <View style={styles.card}><Text style={styles.heading}>Copia de recuperación</Text>
      <Text style={styles.muted}>La copia cifra tu raíz y el registro completo con tu contraseña. Guarda el JSON, el ID público de raíz y la contraseña fuera del dispositivo. Actualízala cuando cambie la revisión. No es una frase BIP39 ni demuestra saldo.</Text>
      <Text style={styles.label}>Contraseña de la copia · al menos 12 caracteres</Text>
      <TextInput accessibilityLabel="Contraseña de la copia cifrada de custodia local" style={styles.input} value={backupPassword}
        onChangeText={setBackupPassword} editable={!busy} secureTextEntry autoCapitalize="none" autoCorrect={false} maxLength={1024}/>
      <Text style={styles.label}>Repite la contraseña para crear una copia</Text>
      <TextInput accessibilityLabel="Confirmación de la contraseña de custodia local" style={styles.input} value={backupConfirmation}
        onChangeText={setBackupConfirmation} editable={!busy} secureTextEntry autoCapitalize="none" autoCorrect={false} maxLength={1024}/>
      <Button label="Crear copia cifrada con biometría" disabled={busy || inspection?.status !== 'ACTIVE' || backupPassword.length<12 || backupPassword!==backupConfirmation} onPress={confirmExport}/>
      {backup !== '' && <><Text selectable style={styles.value}>ID público de raíz: {backupRootId}</Text><Text selectable style={styles.value}>{backup}</Text><Button label="Ocultar copia y cerrar lectura" onPress={hide}/></>}
      <Text style={styles.label}>ID público de raíz original para restaurar</Text>
      <TextInput accessibilityLabel="ID público original de raíz para restaurar custodia" style={styles.input} value={backupRootId}
        onChangeText={setBackupRootId} editable={!busy} autoCapitalize="none" autoCorrect={false} maxLength={64}/>
      <Text style={styles.label}>Importar copia completa en este dispositivo</Text>
      <TextInput accessibilityLabel="Copia cifrada JSON de recuperación local" style={styles.input} value={backupInput}
        onChangeText={setBackupInput} editable={!busy} secureTextEntry autoCapitalize="none" autoCorrect={false} maxLength={DEVICE_NATIVE_ROOT_NOTE_BACKUP_MAX_SERIALIZED_BYTES_V1}/>
      <Button label="Autenticar e importar copia con biometría" disabled={busy || backupInput.length===0} onPress={()=>{void run(restore);}}/>
      <Text style={styles.muted}>También puedes importar una copia antigua completa. Su formato anterior carece de contraseña; mantenla privada y crea después una copia cifrada.</Text>
      <Button label="Cancelar, ocultar datos y cerrar" onPress={hide}/>
    </View>
    <View style={styles.card}><Text style={styles.heading}>Identidad del dispositivo</Text>
      <Text style={styles.muted}>Esta copia cifrada recupera la misma identidad que autoriza tus operaciones. Guarda también las copias de tus notas; ninguna copia establece saldo por sí sola. No se envía ni se copia automáticamente.</Text>
      <Button label="Consultar mi identidad actual" disabled={busy} onPress={()=>{void run(readIdentity);}}/>
      <Text style={styles.label}>Clave pública original guardada al emparejar</Text>
      <TextInput accessibilityLabel="Clave pública original de la identidad" style={styles.input} value={identityPublicKey} onChangeText={setIdentityPublicKey} editable={!busy} autoCapitalize="none" autoCorrect={false} maxLength={130}/>
      <Text style={styles.label}>Contraseña de la copia · al menos 12 caracteres</Text>
      <TextInput accessibilityLabel="Contraseña de la copia cifrada de identidad" style={styles.input} value={identityPassword} onChangeText={setIdentityPassword} editable={!busy} secureTextEntry autoCapitalize="none" autoCorrect={false} maxLength={1024}/>
      <Text style={styles.label}>Repite la contraseña para crear una copia</Text>
      <TextInput accessibilityLabel="Confirmación de contraseña para crear la copia" style={styles.input} value={identityConfirmation} onChangeText={setIdentityConfirmation} editable={!busy} secureTextEntry autoCapitalize="none" autoCorrect={false} maxLength={1024}/>
      <Button label="Crear copia cifrada con biometría" disabled={busy||identityPublicKey.length!==130||identityPassword.length<12||identityPassword!==identityConfirmation} onPress={confirmIdentityExport}/>
      {identityBackup!==''&&<><Text selectable style={styles.value}>{identityBackup}</Text><Button label="Ocultar copia y cerrar" onPress={hide}/></>}
      <Text style={styles.label}>Importar el JSON cifrado completo</Text>
      <TextInput accessibilityLabel="Copia cifrada JSON de identidad para restaurar" style={styles.input} value={identityBackupInput} onChangeText={setIdentityBackupInput} editable={!busy} secureTextEntry autoCapitalize="none" autoCorrect={false} maxLength={DEVICE_CUSTODY_BACKUP_MAX_SERIALIZED_BYTES_V1}/>
      <Button label="Restaurar identidad original con biometría" disabled={busy||identityPublicKey.length!==130||identityPassword.length<12||identityBackupInput.length===0} onPress={confirmIdentityImport}/>
    </View>
    <View style={styles.card}><Text style={styles.heading}>Recuperar una escritura interrumpida</Text>
      <Text style={styles.muted}>Usa la raíz HEX original y la revisión del ciphertext que conservas. No reemplaza un registro existente por otro ni vuelve a generar notas.</Text>
      <TextInput accessibilityLabel="Raíz HEX original para recuperación local" style={styles.input} value={rootInput}
        onChangeText={setRootInput} editable={!busy} secureTextEntry autoCapitalize="none" autoCorrect={false} maxLength={64} />
      <TextInput accessibilityLabel="Revisión original del registro cifrado" style={styles.input} value={revisionInput}
        onChangeText={setRevisionInput} editable={!busy} keyboardType="number-pad" maxLength={16} />
      <Button label="Recuperar el mismo registro con biometría" disabled={busy || rootInput.length !== 64 || revisionInput.length === 0}
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
