import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { createLocalRootNoteOperationV1, inspectLocalRootNoteVaultV1, openLocalRootNoteVaultV1,
  type LocalPreparedNoteSummaryV1, type LocalRootNoteInspectionV1 } from '../custody/local-root-note-vault-v1';

function Button({ label, onPress, disabled = false }: { label: string; onPress(): void; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled}
    onPress={onPress} style={[styles.button, disabled && styles.disabled]}><Text style={styles.buttonText}>{label}</Text></Pressable>;
}
const initial = 'Custodia local de preparación. No financia notas ni habilita gastos.';
export default function LocalCustodyScreen() {
  const [inspection, setInspection] = useState<LocalRootNoteInspectionV1 | null>(null);
  const [prepared, setPrepared] = useState<LocalPreparedNoteSummaryV1 | null>(null);
  const [readback, setReadback] = useState(false);
  const [backup, setBackup] = useState(''), [backupInput, setBackupInput] = useState('');
  const [rootInput, setRootInput] = useState(''), [revisionInput, setRevisionInput] = useState('');
  const [notice, setNotice] = useState(initial), [busy, setBusy] = useState(false);
  const busyRef = useRef(false), mounted = useRef(true), epoch = useRef(0);
  const vault = useRef<ReturnType<typeof openLocalRootNoteVaultV1> | null>(null);
  const operation = useRef<ReturnType<typeof createLocalRootNoteOperationV1> | null>(null);
  const visible = (generation: number) => mounted.current && epoch.current === generation && AppState.currentState === 'active';
  function hide() {
    epoch.current++; operation.current?.close(); operation.current = null; vault.current?.close(); vault.current = null;
    setBackup(''); setBackupInput(''); setRootInput(''); setRevisionInput('');
    setPrepared(null); setReadback(false);
  }
  useEffect(() => {
    mounted.current = true;
    const listener = AppState.addEventListener('change', value => { if (value !== 'active') hide(); });
    return () => { mounted.current = false; epoch.current++; operation.current?.close(); operation.current = null; vault.current?.close(); vault.current = null; listener.remove(); };
  }, []);
  async function run(work: (generation: number) => Promise<void>) {
    if (busyRef.current || AppState.currentState !== 'active') return;
    busyRef.current = true; setBusy(true); const generation = epoch.current;
    try { await work(generation); }
    catch (error) {
      if (visible(generation)) {
        const code = error instanceof Error ? error.message : '';
        setNotice(code.includes('AUTHENTICATION_CANCELLED') ? 'Operación cancelada. No se muestra ningún secreto.'
          : code.includes('ALREADY_EXISTS') || code.includes('BACKUP_CONFLICT')
            ? 'Existe una custodia o registro distinto. Se conserva sin sustituirlo.'
            : code.includes('WRITE_UNCERTAIN')
              ? 'La escritura quedó incierta. Conserva tu copia y recupera el mismo registro antes de continuar.'
              : 'No se pudo comprobar la custodia. Conserva tu copia y revisa el estado original.');
      }
    } finally { busyRef.current = false; if (mounted.current) setBusy(false); }
  }
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
    if (!inspection?.rootId || inspection.status !== 'ACTIVE') return;
    vault.current?.close(); const capability = openLocalRootNoteVaultV1(inspection.rootId); vault.current = capability;
    try {
      const value = await capability.readPreparedNote();
      if (visible(generation)) { setPrepared(value); setReadback(true); setNotice('Lectura local comprobada. Una nota preparada aún no es saldo disponible.'); }
    } finally { capability.close(); if (vault.current === capability) vault.current = null; }
  }
  async function exportBackup(generation: number) {
    if (!inspection?.rootId || inspection.status !== 'ACTIVE') return;
    vault.current?.close(); const capability = openLocalRootNoteVaultV1(inspection.rootId); vault.current = capability;
    try {
      const value = await capability.exportBackup();
      if (visible(generation)) { setBackup(value); setNotice('Copia secreta visible sólo aquí. Guárdala completa fuera del dispositivo y después ocúltala.'); }
    } finally { capability.close(); if (vault.current === capability) vault.current = null; }
  }
  function confirmExport() {
    const generation = epoch.current;
    Alert.alert('Mostrar copia secreta de recuperación',
      'La copia contiene la raíz HEX y el registro cifrado original. Quien la obtenga puede abrir las notas. Guárdala completa en un lugar seguro, fuera del teléfono; no la envíes al backend. No se copiará ni transmitirá automáticamente.', [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Mostrar con biometría', onPress: () => { if (visible(generation)) void run(exportBackup); } },
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
    let input = backupInput; setBackupInput('');
    const capability = createLocalRootNoteOperationV1(); operation.current = capability;
    try {
      const result = await capability.restore(input);
      if (!visible(generation)) return;
      setPrepared(result.note); setReadback(true); await refresh(generation);
      if (visible(generation)) setNotice('Copia autenticada y registro original restaurado. Las notas preparadas conservan UNISSUED; no se ha establecido saldo.');
    } finally { input = ''; capability.close(); if (operation.current === capability) operation.current = null; }
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
    <View style={styles.card}><Text style={styles.heading}>Copia de recuperación</Text>
      <Text style={styles.muted}>Guarda el JSON completo, incluida la raíz HEX y el registro cifrado. La clave por sí sola no recupera un registro perdido. Actualiza la copia si cambia la revisión. Este formato no es una frase BIP39.</Text>
      <Button label="Mostrar copia con biometría" disabled={busy || inspection?.status !== 'ACTIVE'} onPress={confirmExport} />
      {backup !== '' && <><Text selectable style={styles.secret}>{backup}</Text><Button label="Ocultar copia y cerrar lectura" onPress={hide} /></>}
      <Text style={styles.label}>Importar copia completa en este dispositivo</Text>
      <TextInput accessibilityLabel="Copia secreta JSON de recuperación local" style={styles.input} value={backupInput}
        onChangeText={setBackupInput} editable={!busy} secureTextEntry autoCapitalize="none" autoCorrect={false} maxLength={4096} />
      <Button label="Autenticar e importar copia con biometría" disabled={busy || backupInput.length === 0}
        onPress={() => { void run(restore); }} />
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
    <View accessibilityLiveRegion="polite" style={styles.card}>{busy && <ActivityIndicator color="#9de3be" />}<Text style={styles.muted}>{notice}</Text></View>
  </ScrollView></SafeAreaView>;
}
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#101c22' }, content: { padding: 24, paddingBottom: 48, gap: 18 },
  title: { color: '#f3f5ee', fontSize: 28, fontWeight: '600' }, heading: { color: '#eff5ef', fontSize: 18, fontWeight: '600' },
  card: { backgroundColor: '#192a31', borderRadius: 18, padding: 20, gap: 12 }, muted: { color: '#b8c8cd', fontSize: 14, lineHeight: 21 },
  label: { color: '#cbd9db', fontSize: 12 }, value: { color: '#e5efe8', fontSize: 12, lineHeight: 19 }, secret: { color: '#f4dab3', fontSize: 12, lineHeight: 19 },
  input: { color: '#eff5ef', backgroundColor: '#112129', borderColor: '#42565d', borderWidth: 1, borderRadius: 10, padding: 12, minHeight: 46 },
  button: { backgroundColor: '#9de3be', borderRadius: 10, padding: 14, alignItems: 'center' }, buttonText: { color: '#14271e', fontWeight: '700', fontSize: 14 }, disabled: { opacity: 0.42 },
});
