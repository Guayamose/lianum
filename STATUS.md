# Estado actual

Actualizado el 8 de octubre de 2026. Hay una base versionada y utilizable para
desarrollo; todavía no está completada la wallet omnichain de la visión original.
Los resultados distinguen código comprobado, laboratorio local y producto
pendiente. Las entregas históricas permanecen en `archive/`.

## Objetivos originales del producto

Los objetivos son los de [PROJECT-VISION.md](PROJECT-VISION.md). Las seis tareas
pedidas para avanzar eran un orden de ejecución; no sustituyen estos puntos.
Los rangos son estimaciones de cobertura técnica, no porcentajes medidos ni
una aceptación de producto terminado. Se conservan los rangos ya publicados:
los nuevos artefactos, pruebas y commits no los recalculan. Las aceptaciones
locales se acotan al recorrido, financiación y modelo comprobados.

| Punto original | Estimación orientativa conservada | Avance comprobado y pendiente principal |
| --- | --- | --- |
| 1. Wallet unificada para siete redes | 60–65% | Web EVM y SDK con owners originales Linux aceptados. Custodia raíz móvil, backup y firmas locales implementados; APK actualizado aceptado sin Metro con el guard de 3 GiB. Falta aceptar el recorrido económico desde esa custodia/dispositivo y completar las siete redes. |
| 2. Privacidad por defecto | 40–50% | Criptografía existente conservada; sin aumento sistémico demostrado. Faltan garantías frente a correlación y colusión. |
| 3. PAEG genérico | 65–70% | BTC/SOL y Uniswap desde reserva privada aceptados con el mismo núcleo y relaciones. Meta completo sigue rechazado; continúan los cuatro slots y la privacidad de topología por cerrar. |
| 4. Liquidación y recuperación económica | 65–70% | Reconciliación/F desde DOM y T/EXIT/pago al solver de Uniswap aceptados. Meta conserva rechazo del driver. Faltan F DeFi, pérdida de keeper/nodos/custodia y fallos combinados. |
| 5. DeFi privado real | 45–55% | Uniswap desde reserva privada aceptado: PAEG, swap, T, EXIT y replay sin efecto duplicado. Meta completo sigue rechazado y F DeFi pendiente; faltan Aave, Morpho y Jupiter y mayor cobertura de posiciones. |
| 6. Estado privado global | 60–65% | Journals y reconciliación originales; SDK vinculado aceptado con saldo privado 500→0. Faltan coherencia completa entre redes/posiciones y recuperación desde custodia móvil real. |
| 7. Redes heterogéneas en profundidad | 55–60% | BTC/SOL combinado aceptado localmente. El payout de custodia SOL sigue rechazado. El factory Tron nativo está aceptado localmente, con crédito/GRAPH pendientes; faltan Base, Arbitrum y BNB propios. |
| 8. Agente autónomo personal | Fuera del alcance | Lo implementa Rafa sobre las interfaces generales del producto. |

Ningún objetivo original está al 100%. La base de desarrollo y el defecto de
`reconcile()` sí están implementados y comprobados; son tareas cerradas dentro
del producto, no los puntos 1 y 2 de la visión. Los requisitos transversales
siguen vigentes: mantenibilidad, generalidad, confianza minimizada, privacidad,
revisión criptográfica independiente y rendimiento.

Google Cloud se prepara **sólo localmente**, según la decisión del usuario:
no hay proyecto, despliegue, `apply` ni recursos creados. La prueba del teléfono
queda para el final. Estas decisiones no eliminan la arquitectura objetivo.

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

El recorrido web EVM está aceptado en laboratorio: quince pruebas genuinas,
TOP_UP con respuesta perdida, liquidación con los owners ausentes, reapertura
de custodias, journals originales y EXIT/redención. La recuperación F desde el
DOM también pasó en un intento separado con siete pruebas, conservando la
primera entrega y sin otro pago o crédito. No se ha comprobado pérdida del
keeper/nodo ni custodia en dispositivo. [Alcance EVM](docs/EVM-LAB.md).

El APK Android autónomo actualizado `5f2e0774-27db-40c4-936b-aa17bea29422`
quedó **aceptado**: **42.169.935 bytes**, SHA-256
`a258a8346f25a124818c2a8eea51d6c78306e307493edd16b2a3e25dd1617596`.
Incluye JavaScript/Hermes embebido, funciona sin Metro y conserva la firma local
Android Debug V2. Los doce joins originales del source map se comprobaron; el
pico RSS del grupo fue **2.339.147.776 bytes** con el límite de **3 GiB** intacto.
Los ocho procesos quedaron ausentes, sin señales efectivas y con el lock
liberado. El artefacto y reporte originales están en
`.local/mobile/artifacts/android-standalone-5f2e0774-27db-40c4-936b-aa17bea29422/`.
Incluye raíz local, notas, backup y firmas D26/D27; falta aceptar financiación y
PAEG desde esa custodia móvil. La instalación y comprobación física quedan para
el final. El rechazo previo `4c121601` por RSS de grupo conserva su resultado
original; no se reclasifica con este nuevo build.
[Comandos y artefacto móvil](apps/mobile/README.md).

El recorrido vinculado `169b4dae-0e75-4057-a01a-c4c1bb2c5bf9` está aceptado y
cerrado con dos pruebas genuinas, SDK y propietarios/custodias originales en
Linux: el saldo privado pasa de 500 a 0. Esto acredita esa integración económica
y su estado original. Sigue pendiente realizarla desde la custodia raíz React
Native y un dispositivo; el APK y el ensayo Linux no cierran esa parte del
objetivo. La custodia raíz, backup/restauración y firmas locales D26/D27 tienen
implementación, trece pruebas móviles enfocadas y tipos correctos. La firma
consume la revisión local exacta, caduca en 15 segundos y guarda el intento
cifrado antes de emitirla; la nota sigue UNISSUED y no se envía a la red. El
Poseidon2 BigInt portable pasó seis vectores contra Barretenberg 5.2.0. Estos
checks no acreditan SecureStore/biometría/Hermes en dispositivo ni financiación
y PAEG desde esa custodia. Un backup viejo u otro dispositivo puede carecer
del intento local: siguen pendientes la unicidad global y el antirollback. [Cuenta original V2](docs/ORIGINAL-ACCOUNT-V2.md).

MetaMorpho y Uniswap ya tienen entrada financiada por reserva privada,
autorización y estado común, observación del protocolo original, respaldo,
quorum, liquidación/recuperación y EXIT mediante el núcleo PAEG existente.
El intento Meta `2f5683bc-6719-4282-94fb-eea19d1c0025` conserva quince pruebas
genuinas y EXIT/redención real, pero quedó **rechazado** al reabrir el driver.
Tras la corrección `a135359`, el nuevo `d35d8dfa-0e56-49c4-bc18-4455d7346e43`
volvió a completar quince pruebas y redención real, y terminó **rechazado** por
una comprobación final del driver. Cerró sus 35 procesos originales sin señales,
con fuentes intactas y sin locks. La corrección `4dc79b8` reutiliza la ejecución
duplicada existente y pasó tres checks enfocados, incluida reapertura/dedup del
servicio SDK real; no reescribe ni convierte esos rechazos en aceptación.
Uniswap completó y cerró el recorrido privado genuino
`f485446e-c345-4359-a1b7-d5fcb40be5dd`: **aceptado**, quince pruebas originales
en 475,665 s, financiación desde reserva privada, PAEG, swap del protocolo
original, liquidación T, EXIT de las notas de origen y destino, pago al solver
y repetición sin efecto nativo duplicado después de restart/EXIT. Fuentes
intactas y los 35 procesos originales ausentes, sin señales. El SHA-256 del
reporte es `ccba9697450435d24801fba9dd9b6cca1884031432667e3dee4ae8bc15ceaf23`.
Esta aceptación local no completa Aave/Morpho/Jupiter, F DeFi, privacidad
sistémica ni infraestructura independiente de operadores.
Los ciclos DeFi aceptados anteriormente partían de financiación pública y
emitían una nota privada: no se presentan como prueba de entrada privada.
[Alcance de redes y DeFi](packages/backend/docs/LOCAL-ACCEPTANCE.md).

El combinado BTC/SOL `67ca1114-cb94-4f87-9041-1cd7b7e62e82` quedó aceptado con
16 pruebas genuinas, entrega SOL de 1.000.000 lamports y redenciones Bitcoin de
80.000/20.000 satoshis, sin pagos duplicados. Es distinto del round trip de
custodia `f9c90308-a14d-4173-82df-b5429e3cb393`, que sigue **rechazado** con
**siete** pruebas genuinas. La causa original es la caducidad de la auditoría durante `BEGIN_PAYOUT`,
antes de una firma/envío nativo de payout SOL. La etiqueta agregada de finalidad
no cambia esa causa; no hubo una octava prueba ni un payout SOL minado. No se
puede renovar la firma ni asumir libre el fence de ese `BEGIN_PAYOUT`.
[Claims y sus límites](packages/backend/docs/LOCAL-ACCEPTANCE.md).

El factory Tron completó su aceptación nativa original en `attempt-3RVzzq`:
12/12 comprobaciones genuinas, JNI/RocksDB reales, fuentes exactas y cierre
ordenado con exit 0, sin señales ni cierre forzado; ambos procesos propios
quedaron ausentes. El SHA-256 de su reporte es
`e9d8d1a0af8912b6af0d6fd1f811e4db89b14ef8f68e90cbe494885a9bb32cf9`.
El primer intento `attempt-PyeSCb` conserva su rechazo por `EACCES` antes de
Java. Los 4/4 casos host previos tuvieron alcance de fuente y fronteras.
La aceptación del factory no completa por sí sola el crédito privado y GRAPH
de la wallet. El recorrido original V5 `a7e3da95` terminó **rechazado**:
financiación real y cinco pruebas genuinas D26/U/S/P/R, sin I84 ni entrega
nativa. Falló durante la preparación del proveedor por una escritura original
incierta; se conserva el bloqueo de sustitución/reintento. Cerró sus nodos. El
intento `6c417bf0` conserva su rechazo antes de nativo/pruebas por una
publicación generada 665 desfasada frente a las 666 fuentes canónicas. El build
posterior actualizó esa publicación sin cambiar las verificaciones del loader.
Ninguno de esos estados parciales acredita la aceptación financiera completa. [Material y runtime Tron](tests/integration/chains/tron/fixtures/README.md).

El cache público del CRS se derivó con la API oficial fijada a partir del CRS
original completo de **2²¹ puntos**, conservando G2, programas, VK y circuitos.
La llamada con formato comprimido midió **27,017 s** y la inicialización con los
128 MiB descomprimidos **0,612 s**. El consumidor usa un hash fijo en un namespace
estable, verifica los originales y conserva un worker efímero por prueba, los
límites de recursos y la verificación propia e independiente. Los helpers
reproducibles están en `scripts/development/public-crs/`. El consumidor ya se
usó en pruebas genuinas verificadas del nuevo Meta: inicialización agregada
de **1,063–1,311 s**, frente a **87,310 s** de prove del owner-envelope. El coste
dominante ahora está en el prove; no en la descompresión del CRS. La ejecución
con cuatro hilos fijos comparte memoria dentro del mismo trabajo y conserva
los umbrales, worker efímero y VK. En Uniswap se usaron cuatro hilos reales
con pico de **3.046.023.168 bytes**, bajo el guard de 3 GiB. U midió **37,369 s**
de prove y **17,262 ms** de verificación, frente al prove de 87,310 s de Meta;
S/P midieron 10,178/7,530 s y la inicialización observada 0,786–0,846 s.
Son medidas de esos recorridos, sin benchmark general: U sigue excediendo
30 s y los objetivos en caliente <30/<20/<5 s permanecen pendientes. La
variante fija de ocho hilos sólo para authorization conserva la VK preparada,
CRS completo, memoria compartida y guard de 3 GiB. En el nuevo Tron U8 completó
prove en **28,520 s**, verificación propia en **17,513 ms** y total en **31,856 s**;
el pico de pruebas fue **3.112.554.496 bytes**, bajo 3 GiB. La prueba U es
genuina, pero el recorrido completo quedó rechazado sin entrega nativa y
el objetivo de pruebas <20 s todavía no se cumple.

La publicación V5 `915d7d6` usada en aquel corte Uniswap conserva un linaje
explícito de desarrollo. Su
reinspección genuina tardó 2,908 s y verificó 653 fuentes, 12 roles y diez
artefactos antiguos sin cambios. Las 45 dependencias originales de compilación
W39 permanecen intactas. La inspección y publicación de esos materiales es
separada de la aceptación financiera privada Uniswap descrita arriba.

La API arranca con el adaptador económico desconectado: liveness 200, readiness
503 y `privatePortfolio=null`. La cuenta vinculada tiene su integración original
acotada. PostgreSQL conserva permisos, idempotencia y migraciones comprobadas;
esos registros no sustituyen el estado económico del ledger. Google Cloud se
prepara localmente, sin proyecto ni despliegue.

La privacidad sistémica y la auditoría criptográfica independiente siguen
pendientes. La API móvil ve identidad estable, importes y destinos; el host del
worker ve sus testigos. Claves distintas en un host no acreditan operadores
independientes. Los informes conservan los rechazos y sus identidades en
`.internal/dev/reports/`; claves, testigos y sesiones permanecen fuera de Git.

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
  claims. Un build nuevo ya prepara CI51 V3 y CO42 con las VK originales, sin
  fabricar esos recibos históricos ni acreditar payout. El inventario de encoding
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

## Distancia respecto a los puntos originales

La entrega histórica estimaba un 58% global sin una medición de aceptación.
No lo convertimos en porcentaje actualizado a partir de commits o tests. Los
rangos anteriores eran cobertura técnica orientativa:

| Punto original | Referencia anterior | Condición para aceptarlo como producto |
| --- | --- | --- |
| Wallet unificada | 50–60% | Recorrido desde interfaz/móvil, estado y recuperación entre siete redes. |
| Privacidad por defecto | 40–50% | Modelo de observadores/colusión y garantías de sistema comprobadas. |
| PAEG genérico | 60–70% | Composición reproducible dentro de límites explícitos; el perfil actual tiene cuatro slots. |
| Liquidación y recuperación económica | 55–65% | Entregas parciales, pérdidas asignadas y ningún efecto o saldo duplicado. |
| DeFi privado real | 35–45% | Ciclos privados completos por protocolo, salida, conservación y recuperación. |
| Estado privado global | 55–65% | Coherencia de disponibles/reservados/pendientes entre redes y propietarios. |
| Redes heterogéneas en profundidad | 45–55% | Aceptación de cada red, finalidad, reorganizaciones y operaciones combinadas. |
| Agente autónomo personal | Fuera del alcance | Rafa lo implementa sobre las APIs y permisos del producto. |

Son referencias de la evaluación anterior, no una medición de los avances
actuales ni del tiempo pendiente. Ningún punto completo de la visión original
queda aceptado por pruebas aisladas.

La revisión criptográfica independiente está pendiente. Los objetivos en
caliente de sobrecoste propio <30 s, pruebas <20 s y coordinación <5 s aún no
están demostrados; la finalidad nativa se mide aparte. Los permisos móviles
actuales exponen identidad pública estable e importes a la API.

[Criterios de privacidad y operación](docs/PRIVACY-AND-OPERATIONS.md) ·
[Orden de trabajo](ROADMAP.md) · [Visión original](archive/delivery/PROJECT-VISION.md)
