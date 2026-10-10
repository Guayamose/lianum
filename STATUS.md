# Estado actual

Actualizado el 10 de octubre de 2026. Hay una base versionada y utilizable para
desarrollo; todavía no está completada la wallet omnichain de la visión original.
Los resultados distinguen código comprobado, laboratorio local y producto
pendiente. Las entregas históricas permanecen en `archive/`.

## Corte actual del 10 de octubre

- **Uniswap móvil aceptado:** `45a420b8-9dd9-4e83-b513-91c2c4c885a6`
  completó las 14 relaciones originales, swap exact-output, retirada del
  resultado y del cambio, respuesta perdida, restauración cifrada de la
  custodia SOURCE/SHARE/PoP y observación de los mismos trabajos en otro PID.
  Reabrió cuatro secciones originales sin otra prueba ni envío; fuentes
  intactas, cleanup sin errores y lock liberado. Es el perfil local sobre TLS
  y custodia software del dispositivo; teléfono y caída abrupta quedan pendientes.
- **Recuperación nativa con SQL:** el intento `7085c0fa…` acreditó captura de
  diez secciones, reapertura del mismo F en otro PID y saldo fresco. No completó
  W39: el codec de métricas trataba el recibo privado V3 como legacy V1.
  `98575a2` corrige esa selección conservando la verificación original y tiene
  regresión focal de Vault/CAS. El intento `4c50417a…` falló antes de financiar
  por dos referencias de fuente antiguas; `89a22ac` las actualiza después de
  revisar el cambio. Ambos resultados conservan su rechazo; el cierre financiero
  completo sigue pendiente.
- **Composición actual:** `7dd8135` publica 880 fuentes y doce roles. El
  productor físico y las cápsulas actuales pasan, incluido el consumidor de
  Base/Arbitrum/BSC. Las 45 fuentes originales W39 no cambian y los cuatro
  indicadores de aceptación de la publicación siguen desactivados.
- **Claims y diagnóstico:** `7af1207` conecta CI51 privado al mismo holder
  Linux, con opening retenido en el child e intake cifrado; no acredita todavía
  RootNote móvil ni el crédito Jupiter completo. `6ac8ed6` conserva la primera
  causa privada de los cuatro CLI antes del cierre, sin payloads ni secretos.
- **APK:** la última compilación conservada es `e4b88b53…`, 43.077.407 bytes,
  109 inputs y 36 uniones, sin Metro. Es anterior a los cambios móviles recientes;
  falta recompilarla. La prueba física continúa prevista para el final.

Las 35 notas permanecen iguales en este corte: **65 / 45 / 70 / 70 / 70 / 80 / 65**.
Uniswap amplía el ámbito móvil acreditado de criterios que ya tenían 75;
no completa por sí solo las siete redes, la privacidad sistémica o la
recuperación abrupta. Los apartados históricos siguientes conservan la
evidencia de sus respectivos cortes, no sustituyen este estado actual.

## Objetivos originales del producto

Los objetivos son los de [PROJECT-VISION.md](PROJECT-VISION.md). Las seis tareas
pedidas para avanzar eran un orden de ejecución; no sustituyen estos puntos.
Las cifras se recalcularon el 9 de octubre sobre el código de `22a0069` y sus
resultados conservados. Este turno conserva los 35 criterios y su cálculo;
revisa sólo la nota 2.4 de 0 a 25 por la protección parcial del observador SQL.
Las otras 34 notas permanecen iguales. Cada objetivo tiene cinco requisitos de igual peso;
la media de sus notas 0/25/50/75/100 produce la estimación de cobertura funcional.
El [desglose por requisito](docs/PROGRESS-ASSESSMENT.md) explica la implementación,
evidencia, límites y cálculo de cada cifra. El código conectado pendiente de
integración cuenta como implementación; no se convierte en aceptación financiera.
Las notas son estimaciones técnicas, no porcentajes de esfuerzo o tiempo restante.
Los rangos anteriores carecían de este desglose y no sirven para medir el avance
de una sesión. No se puntúa por cantidad de commits ni de pruebas. La privacidad
sistémica sigue sin acreditarse; las aceptaciones locales conservan su alcance.

| Punto original | Estimación recalculada | Avance comprobado y pendiente principal |
| --- | --- | --- |
| 1. Wallet unificada para siete redes | 65% | Web EVM y SDK con owners originales Linux aceptados. Custodia raíz móvil, backup y firmas implementados; D26 de clave propia aceptado en Node/TLS. U/S, ejecución nativa, F y W39 tienen reinicio ordenado EVM9 aceptado en Node/TLS; teléfono y pérdida abrupta pendientes. La nota ERC20 propia aceptó D26/W39, dos envíos y reapertura ordenada en otro PID, sin efectos nuevos al observar. Último APK109/36 compilado sin Metro; recompilación pendiente tras los cambios móviles recientes; uso físico al final. Teléfono, pérdida abrupta y siete redes pendientes. |
| 2. Privacidad por defecto | 45% | READ autenticado, copia RootNote cifrada y SQL con HMAC por propietario/request que cambia el seudónimo entre solicitudes; redacción legacy integrada sin renovar permisos. El criterio 2.4 sube a 25 sólo por protección parcial de nuevas copias SQL sin clave API. Cadena/RPC/red, tiempos, rutas, colusión con API, copias antiguas y authKey histórico siguen pendientes. |
| 3. PAEG genérico | 70% | BTC/SOL, Uniswap, Aave y Meta desde reserva privada aceptados con el mismo núcleo y relaciones; continúan los cuatro slots y la privacidad de topología por cerrar. |
| 4. Liquidación y recuperación económica | 70% | Reconciliación/F desde DOM y T/EXIT/pago al solver de Uniswap aceptados. Meta15, Uniswap F y el reinicio ordenado EVM9 están aceptados; MetaMorpho F1 acepta mint irreversible, F y tres W39 en el perfil local controlado, sin duplicados ni pérdida neta del solver acreditada. Meta y Aave reabren sus backends originales después de EXIT/redención; LIVE_ARMED aceptó conservar la misma reserva/ARM en otro PID antes del cutoff. La reorganización F quedó aceptada con nueve pruebas y ambas retiradas. El timeout del keeper se comprobó con reloj controlado y el cutoff original, sin esperar ocho horas. Quedan mayor cobertura DeFi, pérdida abrupta de keeper/nodos/custodia y fallos combinados. |
| 5. DeFi privado real | 70% | Uniswap desde reserva privada aceptado: PAEG, swap, T, EXIT y replay sin efecto duplicado. Aave y Meta15 privados también aceptados; Meta y Aave aceptan backend retenido en otro PID y dos READ cada uno; Uniswap F y MetaMorpho F1 aceptados en sus perfiles controlados; faltan más acciones Morpho, crédito privado Jupiter y mayor cobertura de posiciones. |
| 6. Estado privado global | 80% | Journals y reconciliación originales; SDK vinculado aceptado con saldo privado 500→0. READ de cambio/recuperación y reapertura D26 implementadas; EVM9 aceptado con cinco lecturas firmadas, disponible final cero y reapertura ordenada. Dos READ por protocolo y reapertura Meta/Aave aceptadas. La unión privada por activo y dominio está conectada al backend/wallet y a las vistas móviles originales; persiste checkpoints cifrados y reabre STALE hasta nueva observación, sin crédito por valoración. HOST/CAS/TSC pasaron; native/wrapped ya se conectan a sus sesiones originales y capturan el mismo checkpoint cifrado. La actividad original BTC/SOL ya se muestra y Conciliar usa su ruta original; el journal compara estructura sin falsos cambios por orden JSON. El ancla nace antes de financiar y conserva credenciales y checkpoints confirmado/pendiente; su reapertura rechaza revisiones ajenas y permanece STALE/UNKNOWN. La restauración SOURCE y GRAPH ya está conectada y tiene pruebas focales de almacenamiento/custodia; falta aceptar su recuperación económica completa ante caída abrupta y pérdida de custodia. |
| 7. Redes heterogéneas en profundidad | 65% | BTC/SOL combinado aceptado localmente. Claims9 aceptó el perfil local de ocho pruebas y su cierre original; Claims8 conserva su rechazo histórico. Factory Tron aceptado; una entrega V5 observada, con inventario y crédito/GRAPH pendientes. Jupiter tiene un swap público aceptado y SBF compilado oficialmente, sin aceptación del crédito privado completo; faltan Base, Arbitrum y BNB propios. |
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

## Continuación del 10 de octubre: código integrado y ejecución pendiente

El alcance de PROJECT-VISION.md y EXCLUSIONS.md permanece intacto. Este corte
distingue las funciones conectadas de la aceptación de sus recorridos reales;
las cifras de la tabla anterior no se han vuelto a calcular en este corte.

- **Privacidad del dispositivo:** D27 y U ya viajan cifrados desde el SDK al
  receptor original de un solo uso. U devuelve los paquetes de rol cifrados al
  mismo cliente. Las pruebas cortas de ambos SDK/receptores pasan. El fallo de
  importaciones que bloqueó el nuevo D27 quedó corregido y su cierre físico
  pasa; sus RAW anteriores conservan el rechazo. D26 y W39 también tienen
  intake cifrado integrado (`1fa6645`) y sus cinco variantes SDK pasan en
  488 ms. El segundo salto hacia PC23 usa un worker fijo nuevo (`5afdaf0`):
  dos IPC reales, corrupción y desconexión pasan en 389 ms. La composición
  financiera espera corregir tres rutas físicas del worker; no se ha aceptado
  todavía una prueba financiera de este corte.
- **PAEG desde el dispositivo:** el servicio de dos a cuatro destinos SHARE
  está conectado (`492d2b4`). Crea targets y credenciales de proveedor antes de
  financiar y activa cada slot sólo tras su D27 original. DAG, facturas,
  cuotas y riesgos usan el mismo U/S y keeper. El caso HOST de dos y cuatro
  slots pasa en 1,88 s; el recorrido financiero de cuatro entregas está en
  preparación. No incorpora todavía captura multigrafo ni combinación Blue.
- **Morpho Blue:** entrada en posición original, contabilidad en shares, salida
  manual con consentimiento nuevo, journaling anterior al envío y reapertura
  observable están conectados a backend y móvil. Pasan 11 pruebas cortas y el
  typecheck móvil. El driver financiero propio está integrado; sus 14 pruebas,
  redención y recuperación reales siguen pendientes. El intento propio falló
  durante preparación con cero pruebas: faltaban sus rutas fijas en el registro
  y el emisor de recuperación. `bf5e9fd` corrige ambas y su regresión pasa en
  251 ms, conservando la marca original del receiver.
- **SQL y recuperación:** el operador duradero tiene captura F de diez
  secciones y reapertura con verificación previa de schema y clave SQL. La
  clave incorrecta no consume el checkpoint económico. Las comprobaciones SQL
  y de instalación originales pasan; falta la ejecución financiera nativa con
  SQL. La captura planificada no demuestra recuperación ante caída abrupta.
- **Base y Arbitrum:** observadores y bootstrap reciben los clientes originales
  de nuevos perfiles económicos, fijados antes de genesis. Base arrancó ocho
  servicios saludables sobre Reth/Lighthouse propios, pero rechazó la finalidad
  al agotar su plazo; sus nueve contenedores quedaron cerrados. Nitro tiene
  imágenes originales preparadas para el perfil económico. Custodia y envío
  único de Nitro están integrados (`ec1971b`); el caso HOST de AES/CAS/firma
  pasa en 2,12 s. Base incorpora su comprobación propia de comisiones L1/L2 y
  operador antes de KEY/SEND (`6db27b0`); el caso HOST pasa en 3,95 s.
  El primer nacimiento económico de Nitro quedó atascado por génesis de
  ejecución distintos entre Prysm y Geth y se cerró con su proceso original.
  `1459848` comparte la salida del generador oficial; nueve casos de receta
  pasan. El nuevo intento cerró con `ARBITRUM_ORIGINAL_INITIALIZATION_FAILED`,
  cuya causa está en revisión; no hay contenedores Nitro ejecutándose ni
  crédito privado establecido.
- **Composición:** la última publicación validada (`bbbf8c1`) tiene 844
  fuentes y 12 roles. Tras los nuevos cortes, `8463bb5` revisa 143 filas
  literales de las tres cápsulas móviles. Falta publicar la composición
  completa después de corregir las rutas del worker PC23. La compilación W39
  conserva sus 45 fuentes originales; las publicaciones no declaran aceptación
  financiera.

El APK anterior sigue descrito abajo como evidencia de su corte; deberá
recompilarse tras incorporar las nuevas rutas móviles. La prueba física queda
para el final. Google Cloud continúa limitado a preparación local.

## Avance funcional de este turno

Los siete objetivos continúan activos. Estos cambios están implementados y
comprobados en los ámbitos indicados; se conservan las notas por requisito.

| Función entregada | Código y evidencia | Límite vigente |
| --- | --- | --- |
| Copia recuperable de RootNote sin mostrar la raíz | `d880d18`: contraseña, ciphertext, binding rootId y cancelación; 8/8 focales de custodia y saldos en 4,436 s, copia de identidad y tipos aprobados. | Los puertos HOST no acreditan hardware; la prueba física queda para el final. |
| Estado común después de ejecución y W39 | `0dbdeed`: publica la lectura original del vault; conserva invalidación previa, UNKNOWN y revocación. Incluido en el APK actual. | No crea disponibilidad sin READ original ni acepta el GRAPH pendiente. |
| Privacidad de intake SQL nuevo y legacy | HMAC por operación y clave estable separada; `afbd9c3` convierte un grupo legacy explícito y `3ed9157` rechaza una marca privada con datos visibles. Los dos casos PostgreSQL focales pasan en 7,25 s, incluido COMMIT perdido. | API, backups/WAL y otros grupos conservan sus exposiciones; no implica anonimato del sistema. |
| Costes observados de salida DeFi | `b8ab225`: la wallet presenta gas histórico en NATIVE_WEI sin identificadores de operación; conserva importes y mínimos originales. | No convierte gas en shares ni acredita solvencia o pérdida neta completa. |
| Recuperación del journal retenido | `3a0aaeb`: reabre el candidato original tras perder readback, conserva la misma operación y reconcilia sin otro envío; 6/6 HOST focales de EXIT/privacidad/reapertura en 9,95 s. | No sustituye la aceptación financiera SOURCE/GRAPH ni demuestra caída abrupta del producto completo. |
| APK Android actual | SHA256 `bdc836079db34161a793fcc0f383351890e3b79ddfee421c74f5148b4be2dbaf`, 42.841.007 bytes, 85 inputs iguales antes/después, 36 uniones con bundle y sin Metro. | Instalación, biometría y operación física pendientes al final. |
| Transacción conservada tras respuesta perdida | `a7b5434`: guarda la identidad del envío original en el journal; 23/23 HOST pasan en 0,915 s. | No acredita por sí solo el reinicio financiero completo ni autoriza otro envío. |
| Observación original de GRAPH fresca | `c2a9e06`: al conciliar T observa el original S; un HOST SDK/Vault pasa en 2,68 s. | GRAPH completo nuevo aún pendiente de cierre. |
| Primer permiso SOURCE por TLS | `6951b88`: framing UTF-8 explícito; primer challenge del SDK original sobre HTTPS pasa en 2,73 s. SOURCE nuevo recorrió D26 y la primera caída17. | Falló la reapertura avanzada; no acredita las dos caídas ni el recorrido completo. |
| Retirada admitida con respuesta original | `f8961f4`: espera el resultado del job admitido sin reutilizar el permiso; un HOST pasa en 2,765 s. GRAPH1159 recorrió la respuesta perdida de W39 y su conciliación. | Lease original de15 s y guards intactos; el recorrido completo sigue rechazado. |
| Causa privada de apertura y cleanup | `b13eb68`: conserva tipos/códigos/frames anidados con límites y sin payloads; 8/8 HOST, 0,289 s. | La causa primaria del SOURCE rechazado anterior ya se descartó; no se reconstruye ni se acredita reapertura. |
| Preparación BSC propia | `67424cf`: materiales, herramientas oficiales y 17 contratos preparados/compilados. | La comprobación RPC nativa terminó rechazada: sin finalidad, crédito privado ni wallet BSC aceptados. |
| Claims privados en el estado común | `26beac3`: carteras originales y la misma sesión/keeper, unidades BTC/SPL separadas, HTTP de propietario y wallet; journal AES/CAS reabre STALE. Un HOST pasó en 5,961 s, incluyendo custodia desconocida y operaciones pendientes. | Consenso y custodia inferiores son puertos HOST explícitos; no acepta el ingreso SPL ni nuevas redes. |
| Captura del backend GRAPH | `7d4164c`: exige el token activo de la misma autoridad sin relajar el guard de reposo general; un HOST pasó en 0,242 s. | Corrige el fallo observado en GRAPH `0b377a85…`; falta aceptar captura/reapertura integradas. |
| Sesión original al reabrir SOURCE | `e50079e`: devuelve la sesión del contenedor original para recuperar la autorización y cerrar el recurso correcto; un HOST pasó en 0,074 s. | No modifica las fuentes fijadas de un realm anterior ni acredita recuperación económica completa. |
| Testigo rechazado y capacidades de recibos | `97ddc90` limpia la copia normalizada rechazada; `d9e2aac` separa secretos en preparación, envelope y worker. HOST de aislamiento y ambos consumidores pasan en 0,108/0,164/0,181 s. | Se mantienen byte a byte las 45 fuentes originales W39; no implica anonimato ni aislamiento entre operadores. |
| Sello actual de fuentes | `bfba59b`: productor original y verificación física de 833 fuentes y doce roles; cierre `9d9f2034…`. | Conserva los indicadores de aceptación financiera/custodia/GRAPH desactivados. |

La privacidad HOST pasó 5/5 y Cloud 6/6 pruebas con proveedor simulado. Cloud
continúa sólo local y la API V1 conserva readiness 503 sin puente económico.
La suite SQL completa anterior dio 20/22: falló el caso previo de lock de
migración y su prueba padre. El último corte ejecutó exclusivamente los dos
casos legacy; no repitió esa suite ni amplió ningún timeout.

GRAPH14 `edea8e13-4154-471e-8a1f-a7d062002478` terminó **rechazado al conciliar**
tras 12/14 pruebas, con cleanup/lock confirmados. El
backend tenía T cumplido, pero devolvía la cabeza antigua de S y el SDK rechazaba
la respuesta por falta de frescura; no fue un rechazo esperado de replay.
`c2a9e06` corrige esa observación conservando el guard del SDK. El siguiente GRAPH
`f7acea63…` terminó **rechazado** con 14 pruebas: superó RECONCILE_GRAPH,
la W39 de shares y la prueba W39 de cambio, pero falló después en la aserción
de respuesta perdida del envío de cambio. No alcanzó restauración ni reapertura
del backend. Sus fuentes permanecen intactas, cleanup sin errores y lock
liberado; no acepta el recorrido completo. `f8961f4` corrige la espera del
resultado original de retirada admitida; el permiso de15 s y sus guards quedan
intactos. GRAPH `1159c12e…` terminó **rechazado** con 14 pruebas: recorrió
respuesta perdida de W39, restauración software de SOURCE/SHARE/PoP y READ
original de ambas notas gastadas confirmadas, sin otra prueba ni envío financiero.
Falló después al comparar un contador anterior al replay HTTP403 esperado,
antes de capturar las cuatro secciones originales; no alcanzó reapertura del
backend. `56f8212` corrige sólo ese contador y pasa un HOST en 2,621 s. No se
repite la financiación por ese defecto de prueba ni se reclasifica el RAW.
Todos los grupos financieros y locks están cerrados/liberados; no quedó una
autoridad capturada para reabrir ese realm cerrado.

GRAPH `0b377a85-3a0b-49c8-998f-d9a680fe8cde` recorrió las 14 pruebas,
retiradas, respuesta perdida, replay HTTP403, restauración software de custodia
y READ de ambas notas gastadas. Llegó al guardado de las cuatro secciones del
backend y rechazó el primer guard de cuenta: pedía reposo mientras su token de
captura original estaba activo. `7d4164c` comprueba ese token y su autoridad sin
abrir la autoridad general durante captura. El RAW sigue rechazado, con fuentes
intactas y grupo/lock cerrados; no alcanzó un checkpoint completo ni reapertura.

SOURCE `9aced…` terminó **rechazado** con cero pruebas tras el nacimiento del
backend de diez secciones. Su transporte manual omitía Content-Length y enviaba
chunked, incompatible con el framing estricto del servidor original. `6951b88`
lo corrige y pasa el primer challenge TLS/SDK. SOURCE nuevo
`fcb65559-2a28-4aca-b02a-6305fe686d31` terminó **rechazado** con una prueba D26: financiación y
primera salida abrupta 17 recorridas, pero falló la reapertura avanzada del mismo
SOURCE. Su causa primaria se había descartado al sanear AggregateError, y no
es recuperable de esos errores guardados. El journal autenticado tiene diez
secciones, sin candidatos CAS ni mutaciones pendientes; no se atribuye el fallo
a framing ni a una espera de ocho horas. El cierre dirigido por identidad al
launcher original utilizó SIGTERM tras el worker fallido; el supervisor confirmó
cleanup del grupo, lock liberado y fuentes intactas. La interrupción conserva
el rechazo, sin alterar el RAW. El realm financiado y su locator se mantienen
para diagnóstico, sin nueva CREATE. `e1595e7` reconstruye sólo fuentes públicas
desde Git y verifica los 865 pins del nacimiento `df901c6`/cierre `a5033d37…`.
El OPEN diagnóstico usó esos bytes en un namespace aislado conservando UID1000;
superó la versión y alcanzó el actor. Rechazó el enlace porque la sección de
sesión devolvía su contenedor en vez de la sesión original, impidiendo encontrar
la autorización retenida y cerrar ese recurso. `e50079e` corrige el consumidor
para nacimientos nuevos; no fuerza la versión del realm antiguo. La limpieza
normal del diagnóstico falló y sus dos procesos restantes se terminaron por PID
y nacimiento verificados; no se atribuye cierre normal al resultado. El locator
y los pins se conservan. La clave y la raíz del antiguo padre no fueron
persistidas y no permiten continuar su campaña original. La causa del nuevo
OPEN no reconstruye la primaria descartada del primer intento. El locator
anterior `9aced…` también permanece byte a byte.

Evidencia actual: [APK e informe](.internal/dev/reports/mobile-android-standalone-local.json),
[backup nativo](.internal/dev/reports/all-objectives-native-backup-causal-fixture-current-d79742ae-cd90-4c93-82ec-16f53e327739/host.log),
[SQL focal](.internal/dev/drafts/all-objectives-legacy-redaction-focal-v1/RESULT.json) y
[EXIT retenido](.internal/dev/reports/all-objectives-defi-exit-privacy-and-source-focal-90cd3e90-bc0a-422d-99b4-f59f24417107/host.log),
[journal original](.internal/dev/reports/all-objectives-flat-execution-regression-37a6a646-4abe-4e79-a42a-4ce2936b0164/host.log),
[GRAPH fresco](.internal/dev/reports/all-objectives-original-graph-fresh-S-fixture-00001dc7-7a76-4d08-8b56-ea8ef22b72d7/host.log) y
[primer acceso SOURCE](.internal/dev/reports/all-objectives-source-first-access-TLS-original-fixture-a6721023-1f0c-4643-89b7-673c3089be99/host.log),
[espera de retirada](.internal/dev/reports/all-objectives-graph-output-withdraw-result-wait-focal-5b0c02fa-77ac-4f8d-8e7d-ab3bbd045978/host.log) y
[causas privadas](.internal/dev/reports/all-objectives-source-private-diagnostics-original-close-fixture-7d1992ab-4854-446e-b09f-9cd9477dd06f/host.log) y
[contador de replay HTTP](.internal/dev/reports/all-objectives-graph-original-explicit-replay-counter-focal-124ca4b5-44e8-438f-ae76-37c4bed115b3/host.log).

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

El trabajo activo de los puntos 4 y 6 es aceptar la reapertura de las fuentes
originales tras una caída abrupta y conectar autorización/reserva ERC20 con
recepción y retirada de participaciones custodiadas por el dispositivo. La
regresión de timeout ya pasó con reloj controlado sobre tick, recovery, envío y
reconciliación originales: un efecto y observación del mismo envío tras respuesta
perdida. Conserva el cutoff original de 28.800 s; utiliza puertos de prueba y no
acredita una prueba criptográfica ni ejecución financiera adicionales. El usuario
prohibió las esperas reales de ocho horas; no se usan como requisito de cierre.
La cobertura completa de las siete redes sigue pendiente. El uso físico del
teléfono queda para el final.

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
La evaluación por requisito del 9 de octubre reconoce la implementación y
distingue su alcance comprobado. Un HOST puede acreditar almacenamiento o
custodia; no acredita por sí solo liquidación económica. Commits y bundles
no añaden puntos por cantidad.

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

**Android histórico.** El APK `d07f578f` está compilado y archivado para su corte: 42.643.195 bytes, 79 inputs iguales antes/después y 36 joins,
Hermes y firma Android Debug/V2 comprobados, sin Metro. Diez procesos propios
están ausentes; el informe original conserva cero señales y el archivo fuerte
incluye su origen. No acredita instalación, biometría, SecureStore ni operación
financiera física. Incluye el protocolo compartido y el SDK corregidos para
ambos outputs bloqueados durante una reorganización. El APK anterior `e19ad1eb`
conserva su aceptación histórica.
Los APK previos conservan su alcance histórico; `6adc78c0`
permanece como preservación limitada, sin reclasificación.
[APK archivado de ese corte](.internal/dev/reports/mobile-android-standalone-local/attempt-d07f578f-c20d-47a0-a4ec-037686caea1f/app-release.apk) ·
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
