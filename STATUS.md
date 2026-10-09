# Estado actual

Actualizado el 9 de octubre de 2026. Hay una base versionada y utilizable para
desarrollo; todavía no está completada la wallet omnichain de la visión original.
Los resultados distinguen código comprobado, laboratorio local y producto
pendiente. Las entregas históricas permanecen en `archive/`.

## Objetivos originales del producto

Los objetivos son los de [PROJECT-VISION.md](PROJECT-VISION.md). Las seis tareas
pedidas para avanzar eran un orden de ejecución; no sustituyen estos puntos.
Los rangos son estimaciones de cobertura técnica, no porcentajes medidos ni
una aceptación de producto terminado. Se revisaron el 9 de octubre frente al
corte del 8 de octubre según la cobertura funcional aceptada: recuperación EVM,
backends Meta/Aave, MetaMorpho F y Claims9. No se suman por commits ni HOST.
La privacidad sistémica sigue sin acreditarse;
las aceptaciones locales se acotan al recorrido, financiación y modelo comprobados.

| Punto original | Estimación orientativa revisada | Avance comprobado y pendiente principal |
| --- | --- | --- |
| 1. Wallet unificada para siete redes | 65–70% | Web EVM y SDK con owners originales Linux aceptados. Custodia raíz móvil, backup y firmas implementados; D26 de clave propia aceptado en Node/TLS. U/S, ejecución nativa, F y W39 tienen reinicio ordenado EVM9 aceptado en Node/TLS; teléfono y pérdida abrupta pendientes. La nota ERC20 propia aceptó D26/W39, dos envíos y reapertura ordenada en otro PID, sin efectos nuevos al observar. APK79/36 actualizado, compilado y archivado con el contrato de salidas bloqueadas; uso físico al final. Teléfono, pérdida abrupta y siete redes pendientes. |
| 2. Privacidad por defecto | 40–50% | El historial de cuentas exige READ autenticado del propietario y Origin exacto. La criptografía se conserva; faltan garantías sistémicas frente a correlación y colusión. |
| 3. PAEG genérico | 70–75% | BTC/SOL, Uniswap, Aave y Meta desde reserva privada aceptados con el mismo núcleo y relaciones; continúan los cuatro slots y la privacidad de topología por cerrar. |
| 4. Liquidación y recuperación económica | 70–75% | Reconciliación/F desde DOM y T/EXIT/pago al solver de Uniswap aceptados. Meta15, Uniswap F y el reinicio ordenado EVM9 están aceptados; MetaMorpho F1 acepta mint irreversible, F y tres W39 en el perfil local controlado, sin duplicados ni pérdida neta del solver acreditada. Meta y Aave reabren sus backends originales después de EXIT/redención; LIVE_ARMED aceptó conservar la misma reserva/ARM en otro PID antes del cutoff. La reorganización F quedó aceptada con nueve pruebas y ambas retiradas. Faltan F autónomo tras ocho horas y mayor cobertura DeFi, pérdida abrupta de keeper/nodos/custodia y fallos combinados. |
| 5. DeFi privado real | 60–65% | Uniswap desde reserva privada aceptado: PAEG, swap, T, EXIT y replay sin efecto duplicado. Aave y Meta15 privados también aceptados; Meta y Aave aceptan backend retenido en otro PID y dos READ cada uno; Uniswap F y MetaMorpho F1 aceptados en sus perfiles controlados; faltan más acciones Morpho, crédito privado Jupiter y mayor cobertura de posiciones. |
| 6. Estado privado global | 65–70% | Journals y reconciliación originales; SDK vinculado aceptado con saldo privado 500→0. READ de cambio/recuperación y reapertura D26 implementadas; EVM9 aceptado con cinco lecturas firmadas, disponible final cero y reapertura ordenada. Dos READ por protocolo y reapertura Meta/Aave aceptadas. La unión privada por activo y dominio está conectada al backend/wallet y a las vistas móviles originales; persiste checkpoints cifrados y reabre STALE hasta nueva observación, sin crédito por valoración. HOST/CAS/TSC pasaron; native/wrapped ya se conectan a sus sesiones originales y capturan el mismo checkpoint cifrado. La actividad original BTC/SOL ya se muestra y Conciliar usa su ruta original; el journal compara estructura sin falsos cambios por orden JSON. El ancla nace antes de financiar y conserva credenciales y checkpoints confirmado/pendiente; su reapertura rechaza revisiones ajenas y permanece STALE/UNKNOWN. Falta conectar y aceptar la restauración de las fuentes ante caída abrupta. |
| 7. Redes heterogéneas en profundidad | 60–65% | BTC/SOL combinado aceptado localmente. Claims9 aceptó el perfil local de ocho pruebas y su cierre original; Claims8 conserva su rechazo histórico. Factory Tron aceptado; una entrega V5 observada, con inventario y crédito/GRAPH pendientes. Jupiter tiene un swap público aceptado y SBF compilado oficialmente, sin aceptación del crédito privado completo; faltan Base, Arbitrum y BNB propios. |
| 8. Agente autónomo personal | Fuera del alcance | Lo implementa Rafa sobre las interfaces generales del producto. |

Ningún objetivo original está al 100%. La base de desarrollo y el defecto de
`reconcile()` sí están implementados y comprobados; son tareas cerradas dentro
del producto, no los puntos 1 y 2 de la visión. Los requisitos transversales
siguen vigentes: mantenibilidad, generalidad, confianza minimizada, privacidad,
revisión criptográfica independiente y rendimiento.

Google Cloud se prepara **sólo localmente**, según la decisión del usuario:
no hay proyecto, despliegue, `apply` ni recursos creados. La prueba del teléfono
queda para el final. Estas decisiones no eliminan la arquitectura objetivo.
La réplica API/SQL está preparada; V1 conserva ejecutor desconectado y readiness
503. Falta vincular cada solicitud con la cuenta y el consentimiento económicos
originales emitidos antes del job. La admisión SQL no crea esa autoridad. La
consulta móvil de posiciones Linux tampoco concede gasto: las acciones ERC20 y
shares requieren sus productores originales antes de financiar. La nota fuente
ERC20 del dispositivo ya tiene ese productor y un recorrido local aceptado;
la autoridad de shares/posiciones DeFi propias sigue pendiente.

## Cierres funcionales de recuperación y estado

- **Conservar y recuperar la misma operación:** EVM9 acepta F y ambas W39 con
  diez secciones originales reabiertas en otro PID. LIVE_ARMED acepta D26/U/S,
  la misma reserva y autorización armada tras reinicio ordenado, con READ nueva
  y sin F antes del cutoff. No renueva permisos ni crea un efecto duplicado.
- **Notas y posiciones con procedencia propia:** la nota ERC20 del dispositivo
  acepta D26/W39 y reapertura de observación sobre los mismos trabajos. Meta/Aave
  reabren sus backends originales después de EXIT/redención; MetaMorpho F1 acepta
  mint irreversible y recuperación controlada, sin atribuir pérdida neta del solver.
- **Estado privado durable y utilizable:** backend y wallet reúnen originales
  por activo y dominio con checkpoint cifrado/CAS; al reabrir necesitan observar
  otra vez. La app muestra sólo respuestas de sus SDK autenticados, separa shares
  de valoración y conserva UNKNOWN/STALE sin ceros inventados. La actividad BTC/SOL
  ya aparece y Conciliar usa su ruta original; no hay permiso ni total global.

La reorganización F quedó aceptada: conserva UNKNOWN y ambos outputs bloqueados,
reabre el Vault, reconcilia la misma transacción y completa ambas W39 sin duplicar
el pago. El APK actualizado incluye el contrato corregido. El ancla privada de
observaciones conserva la escritura confirmada o su candidato original; reabre
STALE/UNKNOWN hasta consultar otra vez las fuentes.

El trabajo activo de los puntos 4 y 6 es conectar y aceptar la reapertura de las
fuentes originales tras una caída abrupta. También siguen pendientes el F autónomo
con reloj real después de ocho horas y la cobertura completa de las siete redes.
El uso físico del teléfono queda para el final.

## Qué puedes ejecutar hoy

Desde la raíz:

```sh
./dev start       # Wallet web; arranca desconectada
./dev test        # Selección habitual; no inicia los recorridos financieros
./dev check       # Integridad, tipos/ABI, diagnóstico Noir y HTTP
./dev doctor      # Herramientas, originales y bloqueos por separado
./dev artifacts  # Faltantes históricos de la selección de encoding
```

La wallet web no inventa saldo al arrancar. Cada integración tiene preparación propia:

- [Laboratorio EVM](docs/EVM-LAB.md): build nuevo y recorrido con pruebas reales.
- [Móvil](apps/mobile/README.md): instalación, contratos, tipos y bundles Android/iOS.
- [API y PostgreSQL](apps/platform/README.md): réplica Docker y pruebas con base real.
- [Google Cloud](infra/google-cloud/README.md): validación y seis tests simulados, sin credenciales.
- [Redes y DeFi](packages/backend/docs/LOCAL-ACCEPTANCE.md): alcance de cada aceptación.

## Evidencia funcional y límites del corte

Las aceptaciones siguientes corresponden a laboratorios locales y a sus
originales. No acreditan redes públicas, teléfono ni el producto completo.
La revisión orientativa del 9 de octubre refleja cobertura funcional; commits,
bundles y pruebas HOST no representan incrementos porcentuales.

**Wallet, recuperación y saldo.** La wallet web EVM conserva su aceptación de
quince pruebas y la recuperación desde DOM pasó por separado con siete. El
SDK vinculado aceptó saldo privado 500→0. EVM9 `f36e603b` aceptó nueve relaciones
originales, una entrega nativa, ambas W39 y cinco READ firmadas con disponible
final cero. Reabrió las diez secciones AEAD originales en otro PID, con el mismo
S/F y sin efecto duplicado: 435,965 s de worker, 437,895 s de supervisor y 33
procesos ausentes, fuentes intactas, cleanup y lock liberados, sin señales.
La captura es ordenada y el Vault móvil permanece en el padre; caída abrupta
y operación financiera del teléfono siguen pendientes. [Alcance EVM](docs/EVM-LAB.md).

El saldo de notas exige permiso READ propio, activo/dominio exactos, PC23,
nullifiers y cabeza fresca. Recovery permanece bloqueada sin F; perder frescura,
reabrir custodia o quedar UNKNOWN deja el disponible desconocido. Un cero tras
W39 exige nullifier gastado fresco y receipt local confirmado. La app conserva
la operación cifrada, consulta el D26 original antes de preparar y reabre los
mismos trabajos sin nueva financiación, prueba o envío. La raíz y las claves
de nota permanecen locales; la apertura consentida se revela al worker.
[Cuenta original](docs/ORIGINAL-ACCOUNT-V2.md).

La unión privada de estado conserva procedencia, activo y dominio completos;
separa notas, reservas y trabajos pendientes de shares y valoración. Backend y
wallet consumen la capacidad original; su checkpoint y credenciales se capturan
en la misma sección del wallet retenido. Al reabrir no publica saldo fresco
hasta observar los originales. El HOST de Vault/CAS, HTTP y consumidor real
pasó (4.414,525564 ms); el estado móvil combina sólo respuestas de tres SDK
autenticados con sus permisos separados y revoca frescura al caducar o cerrar.
No crea un permiso global ni un total entre redes. Native/wrapped ya instalan
la capacidad desde sus sesiones originales antes de listener/efectos y capturan
el mismo checkpoint en su sección privada: pasó un HOST con sesiones originales
(11.870 ms; `c0cea06`, callers `e9562c2` y entrada local `9efd7b2`). La wallet ya muestra la actividad nativa original y Conciliar usa la ruta correcta;
el journal compara la estructura original sin falsos cambios por orden JSON
(`953448f`, HOST AEAD/CAS; `65cee51`, HOST del consumidor). La aceptación
de observaciones ya conserva un ancla cifrada con las credenciales originales
antes de financiar y dos checkpoints fijados. El caso de sesión/Vault real
aceptó respuesta de escritura perdida, candidato no escrito y rechazo de una
tercera revisión (26.313,361 ms; `22a1b9e`). Esta aceptación restaura observaciones
sobre fuentes originales ya restauradas; la restauración abrupta de esas fuentes
sigue en implementación.

**Posiciones DeFi desde móvil.** La pestaña Posiciones DeFi, SDK y servicio TLS
original están implementados. Dos permisos específicos separan la revelación
de posiciones de su lectura fresca; no reutilizan el permiso de saldo nativo.
El backend exige el mismo catálogo, sesión, vault y cabeza originales. UNKNOWN,
STALE o datos caducados muestran No disponible; la estimación del subyacente
no crea saldo gastable y los activos se muestran por separado. La custodia de
estas posiciones permanece en el backend Linux original: no se adopta una
cuenta ERC20 como nota móvil. Pasaron los cuatro HOST de procedencia, permisos,
cabeza, incertidumbre y TLS/SDK, los dos de instalación/cierre de la cartera y
TSC móvil. Meta y Aave aceptaron dos lecturas originales por protocolo tras mint y redención,
con las mismas quince pruebas y sin efectos financieros nuevos por las lecturas.
Cerraron READ antes de capturar cinco secciones originales y reabrir cada backend en
otro PID. La custodia sigue en el backend Linux; no acredita teléfono, caída
abrupta ni recuperación de GRAPH.

**Nota ERC20 propia del dispositivo.** El recorrido original `da603751` está
aceptado: D26 y salida íntegra W39, dos pruebas, dos envíos y dos receipts,
backing 500→0 unidades atómicas y delta exacto del destinatario. Perdió las
respuestas de financiación y salida, reconcilió los mismos trabajos y rechazó
duplicados sin reenviar. Cuenta, Vault local, destinatario y permiso propio nacen
antes de financiar, sin adoptar custodia Linux ni fabricar reserva S.
Capturó cuatro secciones originales y reabrió el backend en otro PID sólo para
observación, conservando raíz/notas/trabajos y sin prueba ni envío adicionales.
Worker 146,207 s; supervisor 148,098 s. Siete procesos ausentes, fuentes intactas,
cleanup y lock liberados, sin señales. No acepta teléfono, caída abrupta,
salida del padre, GRAPH ni operación pública. Los rechazos `c9ca1b34` y anteriores
permanecen conservados.
[Resultado original](.internal/runtime/omnichain-flat-profile/flat-wallet/.local/device-external-flat-ordered-observation-v1/attempt-da603751-cafa-4cfa-913e-87e846fe0050/result.json).

La [entrada local ERC20](apps/platform/docs/DEVICE-ERC20-LOCAL.md) crea un realm
nuevo y la cuenta original antes de aprobar exactamente el importe del operador
y abrir TLS. No genera claves del usuario ni prueba o financia la nota al arrancar.
Su HOST de adquisición, cancelación y cierre pasó (110,679 ms; `1fd5ae0`);
la captura/reapertura usa una entrada separada y los productores originales.

**Android.** El APK `d07f578f` está compilado y archivado para su corte: 42.643.195 bytes, 79 inputs iguales antes/después y 36 joins,
Hermes y firma Android Debug/V2 comprobados, sin Metro. Diez procesos propios
están ausentes; el informe original conserva cero señales y el archivo fuerte
incluye su origen. No acredita instalación, biometría, SecureStore ni operación
financiera física. Incluye el protocolo compartido y el SDK corregidos para
ambos outputs bloqueados durante una reorganización. El APK anterior `e19ad1eb`
conserva su aceptación histórica.
Los APK previos conservan su alcance histórico; `6adc78c0`
permanece como preservación limitada, sin reclasificación.
[APK final](.internal/dev/reports/mobile-android-standalone-local/attempt-d07f578f-c20d-47a0-a4ec-037686caea1f/app-release.apk) ·
[informe original](.internal/dev/reports/mobile-android-standalone-local/attempt-d07f578f-c20d-47a0-a4ec-037686caea1f/report.json) ·
[origen](.internal/dev/reports/mobile-android-standalone-local/attempt-d07f578f-c20d-47a0-a4ec-037686caea1f/origin.json) ·
[uso móvil](apps/mobile/README.md).

## Redes y DeFi: cobertura funcional actual

| Red | Funcional comprobado | Cierre pendiente o límite |
| --- | --- | --- |
| Ethereum / EVM local | Wallet/SDK, grafo y liquidación originales; EVM9 acepta reinicio ordenado de diez secciones en otro PID. | Teléfono, caída abrupta, infraestructura independiente y operación pública. |
| Bitcoin | Grafo combinado BTC/SOL con dieciséis pruebas y dos redenciones BTC sin duplicados; Claims9 aceptó el perfil local de ocho pruebas y su cierre original. | Operación pública e infraestructura independiente. |
| Solana | Entrega SOL en el grafo combinado; Jupiter completó un swap público con una firma y un envío. | El enlace privado SPL USDC completo no está aceptado; principal USDC6 y comisión SOL9 separados. |
| Tron | Fábrica original aceptada y entregas nativas observadas en recorridos conservados. | Wallet/GRAPH, inventario, I84 y crédito privado pendientes; auditoría conserva su único plazo de 30 s. |
| Base, Arbitrum y BNB | Sin recorrido propio aceptado. | Stacks, finalidad y recorridos originales comprobados para cada red. |

| Protocolo | Funcional comprobado | Cierre pendiente o límite |
| --- | --- | --- |
| Uniswap V3 | Quince pruebas: reserva, swap oficial, T, EXIT, pago al solver y replay sin duplicados. F10 acepta swap irreversible, refund y salida privada con pérdida del solver, sin T. | Ampliar acciones, posiciones y fallos combinados. |
| Aave V3 / Static | Quince pruebas, doce verificadores, rendimiento y redención reales; previewRedeem/maxRedeem y shares del mismo bloque. EXIT/redención, dos READ y backend retenido reabierto en otro PID aceptados sin envío nuevo. | Recuperación del backend retenido ante pérdida abrupta, salida del padre y teléfono no aceptados; ampliar posiciones y fallos. |
| MetaMorpho | Meta15 ordinario y Meta19 retenido aceptados: quince pruebas, EXIT/redención, dos READ y backend en otro PID sin envío nuevo. F1 acepta mint irreversible, recuperación y tres W39 con diez pruebas, sin duplicados. | Recuperación del backend retenido ante pérdida abrupta, salida del padre y teléfono no aceptados; F1 no acredita pérdida neta del solver ni reloj real autónomo. |
| Jupiter / SPL USDC | Swap público original y materiales oficiales compilados. Ingreso fuente y subpasos GRAPH ejecutados en intentos conservados. | Falta aceptar ingreso privado destino y el crédito conjunto; el swap público no acredita ese ingreso. |

Meta/Aave conservan TOP_UP→EXIT sobre la misma cuenta/preparación creada antes
de financiar; GRAPH mantiene su autoridad separada. Meta19 `8c4c6bad` aceptó
quince relaciones originales, EXIT/redención, dos lecturas SDK y captura de
cinco secciones originales cerradas. Reabrió el backend y catálogo en otro PID,
con la misma referencia, receipt e identidad de EXIT y sin envío nuevo: 79→79.
Sus 45 procesos están ausentes; fuentes, cleanup y lock confirmados, sin señales.
La reapertura conserva el cierre de nuevas admisiones y no permite adoptar una
cuenta por ID/snapshot. Aave `4fbd29a9` aceptó el mismo ámbito original: quince
pruebas, dos READ, cinco secciones cerradas y reapertura en otro PID, con
referencia, receipt e identidad de EXIT conservados y envíos 93→93. Sus 45
procesos están ausentes, con fuentes, cleanup y lock confirmados y sin señales.
La recuperación del backend retenido ante pérdida abrupta, la salida del proceso
padre y el teléfono siguen fuera de ambas aceptaciones.

El formato ExternalDeFi V3 se autorizó antes de efectos y pasó tres HOST:
slot codificado de 48 MiB, metadata de 16 MiB, registro de 64 MiB y descompresión
real limitada a 128 MiB. Los formatos anteriores conservan sus límites. Las
aceptaciones retenidas Meta/Aave se añaden a sus recorridos ordinarios y no
reclasifican los rechazos anteriores.

MetaMorpho F1 `bdebe69a` está aceptado en el perfil local fijo: diez pruebas
originales, un mint irreversible, F y tres W39. Conservó receipt, inputs D27 y
cutoff originales, sin I/N/T, payout ni envío duplicado. La recuperación liberó
exactamente cuatro tags y aumentó una vez la secuencia global; las posiciones,
tokens y contabilidad Morpho permanecieron íntegros. Las tres salidas privadas
cerraron ambos pools sin duplicados. Completó en 526,683 s; sus 26 procesos
finales están ausentes, con fuentes, cleanup y lock confirmados, sin señales.
El destinatario original de shares también es el solver: el gasto de underlying
no acredita pérdida neta de riqueza. El recorrido usa el cutoff local controlado;
no acepta reloj real de ocho horas, recuperación abrupta, teléfono ni red pública.
La entrada revisada `a1a9587` conserva sus dos HOST antes/después del gate
(63,931/64,460 ms). [Proyección finita del resultado](.internal/dev/drafts/evm-metamorpho-original-f-terminal-v1/TERMINAL.json).

SPL29 `7b66e42a` cerró rechazado tras trece pruebas por la misma preparación
original caducada antes de `sendOnce`. La autorización pasó antes de clave a
los 22,493 s y auditó en 7,272 s bajo el plazo de 30 s. UNKNOWN y un intento
retenido no acreditan RPC ni finalidad. Sus 109 procesos están ausentes,
con fuentes, cleanup y lock confirmados, sin señales. No se atribuye mejora
financiera al cambio de retenciones ni se repite el envío incierto.

Claims9 `7ec7b903` aceptó el perfil local fijo de ocho pruebas BTC/SOL:
resultado de recursos completado, worker y supervisor con salida cero y
205 identidades de proceso ausentes, con fuentes, cleanup y lock confirmados,
sin señales. Usa el monitor original nuevo; Claims8 conserva su raw rechazado.
La proyección finita del resultado detallado se conserva por separado; esta
aceptación local no acredita redes públicas.

Tron13 `7b78ee47` conserva raw REJECTED tras cinco pruebas y una entrega nativa
observada. La primera incertidumbre posterior a clave conserva como causa la
auditoría completa de 35,152 s frente al único plazo original de 30 s:
current 1,537 s, store 11,462 s y native 21,595 s, con 442 lecturas nativas,
cuatro observaciones, 29 comprobaciones, 18 cargas y seis commits. Sus 18
procesos están ausentes, con fuentes, cleanup y lock confirmados, sin señales.
El stdout acotado retuvo los mismos 1.005.377 bytes observados, sin truncar;
la retención corregida no resuelve el guard temporal ni acepta economía.
UNKNOWN conserva el mismo envío y no autoriza retransmitir. No hay resolución
financiera medida ni reclasificación de rechazos previos; no se repite este
recorrido sin un cambio causal nuevo.

**Entrada del operador local.** NativeEconomicNote y executor nacen antes de
D26, con proveedores originales y tres bridges en un TLS privado. El arranque
prepara el ámbito y entrega el descriptor al operador; no financia ni prueba.
La entrada manual admite captura/reapertura ordenadas desde F ya confirmado,
sin cambiar sus términos de ocho horas ni el límite de autoridad de 90 minutos.
La entrada observada separada activa/desactiva la recuperación con permiso
fresco, guarda el latch antes del efecto y reconcilia el mismo trabajo ante
UNKNOWN. Pasaron seis HOST de control, el caso protegido móvil y TSC; falta
aceptar la recuperación autónoma tras ocho horas con servicio activo. El reloj
conserva los guards de 30 s y una espera exterior única de 120 s monotónicos.
No acredita caída abrupta ni captura post-ocho horas bajo Native10.
<!-- PENDING_LIVE_F: HOST/TSC no acreditan el recorrido autónomo de ocho horas. -->

**Rendimiento medido.** U nativa completó prove más verificación en 13,174 s
(15,939 s total), I84 en 7,750 s (19,246 s total) y D26 en 1,331 s (4,450 s
total), con las mismas ACIR/VK y cierre original antes de la verificación
independiente. Son medidas individuales, sin objetivos globales ni tiempos en
caliente demostrados. El límite agregado Node+BB de 3 GiB permanece. U16
conserva su rechazo por RSS; los objetivos originales <30/<20/<5 s siguen
pendientes en su alcance completo.

**Privacidad y servicio.** El historial flat/native-claims exige permiso READ
del mismo propietario y Origin exacto antes de consultar; las suites afectadas
pasaron. Las posiciones DeFi añaden sus dos dominios de permiso propios. La API
inicia desconectada, con readiness 503 y privatePortfolio desconocido; SQL
conserva permisos/idempotencia y no sustituye el ledger económico. Cloud sigue
preparado sólo localmente. La API ve identidad estable, importes y destinos y
el worker ve aperturas: privacidad sistémica, revisión criptográfica externa
y operadores independientes siguen pendientes. Claves y testigos quedan fuera
de Git. La publicación financiera `a62ec91` y su build cerrado conservan 819 módulos
y doce roles, con las 45 dependencias de compilación intactas. Incluyen formato V3,
servicio/SDK, posiciones, la nota ERC20, su Vault corregido y la entrada local.
El recorrido ERC20 `da603751` y LIVE_ARMED corto están aceptados en sus ámbitos
originales. F reorg `b4329b70` quedó aceptado con nueve pruebas. Meta y Aave
aceptaron su ámbito original; los rechazos
previos se conservan. Una publicación no acepta por sí sola un recorrido financiero
ni el teléfono.

### Recuperación aceptada y límites pendientes

LIVE_ARMED `b923b217` está aceptado en su recorrido corto: tres pruebas
originales D26/U/S y reinicio ordenado en otro PID, conservando la misma S,
autorización armada, Vault móvil, journal y provider. Diez secciones originales
cerraron antes de reabrir; una nueva READ firmada confirmó la misma ARM sin F
antes del cutoff. Completó en 177,822 s; veinte procesos ausentes, fuentes,
cleanup y lock confirmados, sin señales. No acredita F autónomo después de ocho
horas, pérdida abrupta ni teléfono. Los intentos anteriores quedan rechazados;
la causa RAW de `292a` no se reinterpreta a partir de la corrección.
[Resultado original LIVE_ARMED](.internal/runtime/omnichain-flat-profile/flat-wallet/.local/native-value-live-armed-recovery-v1/attempt-b923b217-9011-45ec-89bc-4c57f86da014/result.json).

F reorg `b4329b70-f553-4523-8d67-8e1ac1becded` quedó **aceptado** en
433,088 s con nueve pruebas originales. Después de la pérdida del bloque F,
el primer RECONCILE guardó UNKNOWN y ambos outputs permanecieron bloqueados.
El Vault se cerró y reabrió; la segunda reconciliación confirmó el mismo F
mediante una única reemisión de su wire original, sin nueva firma nativa,
permiso económico ni prueba de recuperación. Ambas W39 completaron la salida
de 400/100 sin doble pago. Cerró sus 25 procesos, con fuentes, cleanup y lock
confirmados y sin señales. El alcance de reorganización es el padre original
exacto de F; no acredita reorganizaciones más profundas ni redes públicas.
[Resultado original F reorg](.internal/runtime/omnichain-flat-profile/flat-wallet/.local/device-owner-original-f-reorg-v1/attempt-b4329b70-f553-4523-8d67-8e1ac1becded/result.json).

Los intentos `2cd62adb` (lectura de outputs), `49227ea0` (resumen incompleto
de alcance), `302d` y `9d6b` conservan sus rechazos originales. Las correcciones
posteriores no los reclasifican. La aceptación nueva no completa por sí sola
la pérdida abrupta de fuentes ni los objetivos originales 4/6.

Los resultados RAW anteriores se conservan sin reclasificar. La ausencia de
procesos o la corrección posterior no cambian un resultado rechazado. Para
cada aceptación siguen separados prueba original, efecto económico, reinicio
ordenado, cierre físico y límites de hardware/red pública.

## Artefactos y entorno

- El archivo original completo conserva 2.649 archivos con sus comprobaciones
  históricas. Git incluye 1.716; otras 933 referencias/paquetes/drafts públicos
  locales quedan excluidos explícitamente de CI.
- La reconstrucción inicial reprodujo 1.684 archivos del recorrido original.
  El código editable puede cambiar; el archivo histórico y sus pines no cambian.
- Faltan dos originales de encoding:
  `candidate-poseidon/.local/component/attempts/prove-2/public-inputs.json` y
  `flat-wallet/.local/contracts/2e02620a-404c-4c27-9ac2-4132713e083b/compiled.json`.
  `./dev artifacts` identifica sus consumidores y el hash conocido. No se
  regeneran como si fueran originales ni se omiten silenciosamente sus tests.
- También faltan programas/VK y evidencias públicas de releases históricas de
  claims. La compilación nueva CI51 V1 tiene recibos propios y conserva los
  componentes del programa original; no afirma igualdad con su VK histórica
  ausente ni acredita payout. El inventario de encoding
  tiene ese alcance; no certifica todas las
  integraciones posteriores. [El inventario de claims](packages/backend/docs/NATIVE-CLAIMS-ARTIFACTS.md)
  identifica familias, consumidores, hashes conocidos y la identidad del build nuevo.
- Para habilitar el release histórico EVM falta un raw original adicional:
  `.local/native-value-genuine-compilation/graph-only-source-v1/ledger/compiled.json`,
  SHA256 `f21b27105321ff027954ac5d0660b420c3028bf974a8f9a9e0c93db66c0a11a3`.
  Los otros 202 ficheros comprobados del release V4 coinciden. El desarrollo
  V5 y el recorrido SDK aceptado tienen un linaje separado; no sustituyen ese
  original ni activan los gates históricos.
- El laboratorio privado perdido no se recuperó. Las aceptaciones nuevas usan
  identidades, claves y estado nuevos.
- Los módulos heredados requieren `.internal/runtime/`, recursos compartidos y
  algunos experimentos. Los nuevos móvil/API/infra tienen dependencias explícitas
  fuera de esa compatibilidad.

La documentación de entrega anterior permanece en [archive](archive/README.md).
Sus porcentajes no constituyen una segunda evaluación actual. Los requisitos
de cierre son los siete objetivos originales de [PROJECT-VISION](PROJECT-VISION.md)
y el trabajo pendiente de [ROADMAP](ROADMAP.md).
