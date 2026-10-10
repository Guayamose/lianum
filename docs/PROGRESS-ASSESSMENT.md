# Evaluación de los objetivos originales

Recalculada el 9 de octubre de 2026 sobre el código de `22a0069` y los resultados
conservados. La referencia es [PROJECT-VISION](../PROJECT-VISION.md); no se
modifican sus objetivos, arquitectura ni exclusiones. La revisión anterior elevó 2.4 de 0 a 25 por protección parcial del observador
SQL. El corte actual incorpora las fuentes de `7dd8135` y el resultado original
NativeSQL9 `1e12d9d4…`: conserva los 35 criterios y su cálculo, eleva sólo 4.5
de 50 a 75 por pérdida del proveedor y reembolso completo acreditados, y
mantiene las otras 34 notas respecto a esa revisión anterior.

Actualización de evidencia del 10 de octubre: Uniswap móvil
`45a420b8-9dd9-4e83-b513-91c2c4c885a6` completó sus 14 relaciones originales,
ambas retiradas, respuesta perdida, restauración cifrada de custodia y
observación ordenada del mismo backend en otro PID, sin otra prueba ni envío.
Amplía el ámbito de 1.3/1.4/1.5, 5.3/5.5 y 6.2/6.4 ya valorados en 75;
no cierra privacidad de ruta/topología, caída abrupta ni las siete redes.
NativeSQL `7085c0fa…` y `4c50417a…` conservan sus rechazos. Tras corregir
el codec V3 y los hashes revisados, `1e12d9d4…` completó nueve pruebas: entrega
nativa, F, captura de diez secciones, READ fresco en otro PID y ambas W39.
El usuario recupera las 500 unidades del activo fuente; el proveedor pierde
1.000.000 wei de principal más 23.800.000.000.000 wei de gas bajo términos
firmados originales. Pool/backing/reservas quedan a cero sin duplicados.
**4.5 pasa a 75 y el punto 4 a 75%; las otras 34 notas no cambian.**

Código posterior integrado, sin cambio de estas notas: RootNote móvil conecta
D27/CI51/W39/redención/payout en commits separados; su HOST original y
TypeScript pasan, pero falta el recorrido económico integrado. La custodia de
la nota pertenece al dispositivo y el nativo continúa en quorum local.
SOURCE V2 `f1f4e353…` falló después de D26 y antes de financiar. Las lecturas
ya conservan el permiso original de 15 segundos sin capturar todo el runtime.
SOURCE/GRAPH V3 tiene nacimiento propio previo a CREATE/FUND y conecta dos
caídas y aperturas del mismo checkpoint con AEAD/CAS. Sus HOST originales
pasan; falta el recorrido financiero y la ventana broadcast→checkpoint.
PAEG paginado V3 tiene árboles sparse consistentes JS/Noir/Solidity, las cinco
claves propias y consumer/verificadores compilados bajo los límites originales.
El cast Solidity corregido conserva identidad byte a byte de los cinco
programas recompilados y almacena la generación separadamente. El productor
OWNER, D26 original y enlaces de bibliotecas están integrados y su HOST pasa;
faltan recorrido económico y composición móvil completa. El primer corte
móvil D26/W39 ya pasa su HOST causal y TypeScript: conserva el saldo mediante
la respuesta original del SDK y corrige la igualdad del almacenamiento sin
retirar los checks de AEAD/CAS/readback. Sus puertos inferiores de cadena,
pruebas ZK y Expo son explícitamente inertes; no acredita ejecución financiera.
RootNote añade observación del mismo keeper sustituido y finalización local
BTC con seis confirmaciones y el mismo wire; ambos HOST pasan, con el
recorrido económico aún pendiente. Aave `d2b593db…` completó
redención pero falló la lectura W39 tras reapertura; `9883f3b` corrige la
observación fresca con regresión SDK/backend, pendiente de repetición
financiera. Estos avances de código no se convierten en nuevos escenarios
completos ni modifican los 35 criterios o los siete porcentajes.

Esta es una **estimación de cobertura funcional**, con un cálculo reproducible.
Las notas de cobertura siguen siendo juicios técnicos; no son medidas de tiempo,
esfuerzo restante, probabilidad de éxito ni preparación para producción. Se
revisaron los flujos y módulos citados, no cada archivo del repositorio. Se
leyeron las evidencias existentes; no se ejecutó otra campaña financiera.

## Criterio de cálculo

Cada objetivo se descompone en cinco requisitos que cubren sus cláusulas
originales. Cada requisito pesa el 20%. La nota del objetivo es la media:

`porcentaje = (nota1 + nota2 + nota3 + nota4 + nota5) / 5`

| Nota | Significado |
| --- | --- |
| 0 | No se ha encontrado implementación del requisito. |
| 25 | Implementación parcial; falta una parte sustancial o su conexión. |
| 50 | Implementado y conectado, sin acreditar el recorrido completo del requisito. |
| 75 | Funcionamiento completo acreditado en un ámbito limitado; falta cubrir el alcance restante. |
| 100 | Requisito cubierto en su alcance original. |

El alcance de cada nota se declara en su fila. Una prueba focal completa puede
acreditar almacenamiento o custodia, pero no una liquidación económica. Una
compilación acredita que se construye la app, pero no acredita siete redes.
El código conectado pendiente de integración cuenta como implementación;
un intento rechazado no se convierte en un recorrido aprobado.

Estos pesos son una convención explícita de seguimiento. Se mantienen para
las siguientes revisiones. Las cifras anteriores eran rangos sin este desglose:
no se puede interpretar su diferencia como un incremento medido durante una
sesión. Los commits y la cantidad de pruebas no añaden puntos por sí mismos.

## Resultado

| Punto original | Notas de los cinco requisitos | Estimación actual |
| --- | --- | ---: |
| 1. Wallet unificada para siete redes | 75 / 25 / 75 / 75 / 75 | 65% |
| 2. Privacidad por defecto | 75 / 75 / 25 / 25 / 25 | 45% |
| 3. PAEG genérico | 75 / 75 / 75 / 50 / 75 | 70% |
| 4. Liquidación y recuperación económica | 75 / 75 / 75 / 75 / 75 | 75% |
| 5. Composición DeFi privada real | 75 / 50 / 75 / 75 / 75 | 70% |
| 6. Estado privado global coherente | 75 / 75 / 75 / 75 / 100 | 80% |
| 7. Modelos de redes heterogéneos | 50 / 75 / 75 / 75 / 50 | 65% |
| 8. Agente | Fuera del alcance autorizado | No se puntúa |

No se calcula un porcentaje único del producto: los siete objetivos tienen
alcances y costes diferentes y los requisitos transversales también deben
cumplirse. Ninguno de los siete está completo.

## 1. Wallet unificada para siete redes — 65%

| Requisito | Nota | Código y cobertura actual | Falta para completar el requisito |
| --- | ---: | --- | --- |
| Experiencia y cuenta coherentes | 75 | [App móvil](../apps/mobile/App.tsx), [estado común](../apps/mobile/src/state/private-wallet-state-v1.mjs) y [wallet web](../apps/wallet/README.md): conexiones propias, identidad protegida y estado por origen/activo. EVM y SDK tienen recorridos locales aceptados. | Completar esa experiencia para las siete redes y las autoridades de cada operación; una vista común no concede gasto. |
| Operación real de las siete redes | 25 | EVM, BTC/SOL y partes de Tron tienen productores y recorridos originales. [Registro de redes](../packages/backend/src/chains/shared/portfolio/portfolio-registry.mjs). | Base, Arbitrum y BNB propios; wallet/GRAPH Tron y el crédito privado SPL. Heredar formato EVM o mostrar un RPC no completa una red. |
| Financiar, autorizar, reservar, probar, ejecutar y salir desde la wallet | 75 | Web EVM, EVM9 `f36e603b` y nota ERC20 propia `da603751` aceptados en sus ámbitos. [Pantalla ERC20](../apps/mobile/src/screens/ExternalTokenNoteScreen.tsx) conecta las acciones originales. | Uniswap móvil14 acredita el GRAPH completo en su perfil. Faltan los demás perfiles móviles y extender el recorrido a las demás redes. |
| Custodia local, consentimiento y copia recuperable | 75 | [Identidad y firmas](../apps/mobile/src/custody/key-store.ts), [copia cifrada](../apps/mobile/src/custody/sealed-custody-backup-v1.mjs) y [Vault de notas](../apps/mobile/src/custody/device-external-flat-note-vault-v1.ts). Pruebas focales acreditan la misma identidad restaurada y las restricciones de gasto. APK actualizado, sin Metro. | Uso nativo físico al final, según la decisión de Rafa, y recuperación integrada de todos los tipos de custodia. Los puertos nativos de HOST no son hardware real. |
| Saldo, conciliación y continuidad de la misma cuenta/operación | 75 | EVM9 y ERC20 aceptan reapertura ordenada en otro PID, mismos trabajos y ausencia de efectos nuevos. El saldo usa lecturas originales. | Recuperación abrupta SOURCE y GRAPH completo; continuidad equivalente para todas las redes. |

## 2. Privacidad por defecto — 45%

| Requisito | Nota | Código y cobertura actual | Falta para completar el requisito |
| --- | ---: | --- | --- |
| Proteger el estado de notas, saldos y posiciones | 75 | [Pool privado](../contracts/wallet/PrivateFlatAssetNotePool.sol), relaciones ZK y [lectura privada](../packages/backend/src/api/mobile/paired-original-defi-position-reader-v1.mjs). Hay notas privadas y READ propio en recorridos locales. | Protección en todo el alcance y frente a los observadores definidos; los importes públicos permiten correlación. |
| Restringir revelación, custodiar claves y cifrar almacenamiento/transporte | 75 | [Firmas locales](../apps/mobile/src/custody/key-store.ts), permisos separados, TLS y [copias AES-GCM](../apps/mobile/src/custody/sealed-custody-backup-v1.mjs). La clave raíz no se entrega a la API. | Fronteras reales entre operadores y transporte/borrado de testigos en Cloud; los workers y su host ven sus testigos consentidos. |
| Ocultar direcciones, estrategias, rutas y topología | 25 | [Framing y compromisos](../packages/crypto/src/framing.mjs) y paquetes por rol proporcionan partes de la protección. | La API ve identidad estable, importes y destinos; falta demostrar ocultación de rutas y topología bajo el modelo completo. |
| Evitar correlaciones por importe, tiempo, financiación, retirada, RPC y actividad entre redes | 25 | [Codec SQL privado](../apps/platform/src/private-authorization-record-v1.mjs) enlazado al store: HMAC propietario+requestId produce seudónimos distintos entre solicitudes; términos y challenges se guardan como HMAC bajo clave API independiente. [Redacción legacy](../apps/platform/src/legacy-authorization-redaction-v1.mjs) integrada conserva IDs, permisos consumidos e idempotencia; dos casos PostgreSQL reales pasan, incluido COMMIT perdido. Protección parcial de nuevas copias/grupos redactados ante observador SQL sin esa clave. | Cadena, RPC, red, tiempos, colusión con API y copias antiguas siguen expuestos. AuthKey histórico permanece estable y puede correlacionarse si se conocen propietario/request. La API ve los términos; otros grupos y WAL/backups antiguos no se borran. No acredita anonimato sistémico. |
| Definir observadores/colusiones y aplicar privacidad por defecto | 25 | [Modelo operativo documentado](PRIVACY-AND-OPERATIONS.md), límites por rol y permisos; [worker](../packages/proofs/src/jobs/worker.mjs) evita logs de testigos. | Completar el modelo y comprobar sus garantías entre API, worker, RPC, cadena, almacenamiento, red y dispositivo. |

## 3. PAEG genérico — 70%

| Requisito | Nota | Código y cobertura actual | Falta para completar el requisito |
| --- | ---: | --- | --- |
| Representar pasos y dependencias en un grafo válido | 75 | [Grafo](../packages/engine/src/execution/graph/graph.mjs) usado por DeFi aceptado y [Paged V3](../packages/engine/src/execution/graph/funded-graph-paged-v3.mjs): páginas de hasta 64 nodos, índices u64, raíces sparse y dependencias verificadas incrementalmente. La implementación paginada elimina la cota global de cuatro slots del perfil histórico. | Aceptar el recorrido económico paginado de cinco nodos/dos páginas y ampliar la cobertura acreditada de tamaños y dependencias. |
| Unir autorizaciones y condiciones con cada operación | 75 | [Grafo financiado](../packages/engine/src/execution/graph/funded-graph.mjs) y [pool](../contracts/wallet/PrivateFlatAssetNotePool.sol): conservación, política, plazo, autorización y nullifiers unidos a U/S. | Uniswap móvil14 acepta su GRAPH original. Faltan las combinaciones y redes restantes. |
| Comprobar cumplimiento global antes de liquidar | 75 | [Relación de liquidación](../packages/proofs/circuits/settlement/src/main.nr) y pool: completions, identidad, evidencias, ventanas y consumo único. Aave, Meta y Uniswap aceptan esos pasos. | Ampliar fuera de las rutas y perfiles locales acreditados. |
| Dar información mínima a cada ejecutor y ocultar el grafo completo | 50 | [Paquetes nativos](../packages/engine/src/execution/native/dispatch/native-capsules.mjs) y grafo definen paquetes/roles cerrados. `83bd4b9` retira SOURCE, presupuesto y tamaños globales del ejecutor Paged; conserva sólo su nodo y cinco campos de vinculación. Su HOST causal pasa; continúa el host común. | Acreditar la ocultación entre operadores independientes y ante correlación. Privacidad sistémica no aceptada. |
| Reutilizar relaciones/verificadores/evidencia al combinar acciones y redes | 75 | [Catálogo de relaciones](../packages/proofs/src/catalog.mjs) y [ejecución común](../packages/backend/src/execution/account/execution/flat-native-execution.mjs). BTC/SOL y DeFi reutilizan el núcleo. Paged conecta OWNER, SDK/Vault y cinco relaciones/claves reutilizables; cambiar el grafo no exige otro circuito. | Aceptar el recorrido económico Paged y ampliar proveedores/evidencias fuera del perfil nativo EVM local. Sus límites u64, de página, almacenamiento y cutoff permanecen; no se acredita tamaño ilimitado. |

## 4. Liquidación y recuperación económica — 75%

| Requisito | Nota | Código y cobertura actual | Falta para completar el requisito |
| --- | ---: | --- | --- |
| Pagar/liberar reservas según el resultado global, sin doble cobro | 75 | [Pool](../contracts/wallet/PrivateFlatAssetNotePool.sol) y [ejecución común](../packages/backend/src/execution/account/execution/flat-native-execution.mjs): U/S/N/T/F/W39. Recorridos DeFi y F con ambas retiradas aceptados localmente. | Todas las rutas/activos y sus fallos. |
| Resolver timeout con plazo y autoridad originales | 75 | [Cuenta original](../packages/backend/src/accounts/authority/native-value-account-authority-v2.mjs) y [regresión del keeper](../packages/backend/tests/accounts/authority/device-live-recovery-arm-v1.test.mjs): reloj controlado, cutoff 28.800 s, un solo efecto, repetición y respuesta perdida sin nuevo envío. | Ampliar disponibilidad y lifetimes del producto. No se exige esperar ocho horas reales. |
| Resolver entregas parciales, respuesta perdida, indisponibilidad y eventos adversos | 75 | [Reconciliación nativa](../packages/backend/src/execution/native-value/execution/native-value-execution-v2.mjs). Uniswap F10, Meta F1, EVM9, LIVE_ARMED y F reorg aceptados en ámbitos concretos. | Pérdida abrupta de keeper/nodos/custodia, GRAPH completo, reorganizaciones más amplias y fallos combinados. |
| Separar ledger, compromiso/aborto y resultado económico | 75 | Pool, ejecución común y cuenta mantienen incertidumbre y salidas bloqueadas. Meta F1 respeta la entrega externa irreversible al recuperar las notas. | Extender la separación a los fallos y combinaciones restantes. Recuperar una nota no revierte una transferencia finalizada. |
| Asignar pérdidas, liquidez, comisiones y solvencia explícitamente | 75 | [Admisión nativa](../packages/engine/src/execution/native/dispatch/native-admission.mjs) y [continuación original](../tests/integration/wallet/native/native-device-economic-original-continuation-v1.mjs): NativeSQL9 acredita términos firmados, entrega irreversible, pérdida del proveedor de principal más gas y reembolso íntegro del activo fuente mediante F y ambas W39, con backing/reservas cero. Las unidades de ambas redes permanecen separadas. | Generalizar activos y redes, insolvencia, liquidez adversa y costes de todos los pasos. Ámbito local prefundado, sin operadores independientes ni salida del payout del solver. Meta F1 conserva su alcance y no demuestra esa pérdida por sí solo. |

El código nuevo de SOURCE y GRAPH está conectado. Su almacenamiento/captura
tiene evidencia focal, pero su recuperación económica completa sigue pendiente.
Esto no eleva los criterios económicos que ya estaban en 75 por otros
recorridos limitados. Corregir un bloqueo del recorrido pendiente es avance de
implementación, pero aún no añade un escenario económico completado.

## 5. Composición DeFi privada real — 70%

| Requisito | Nota | Código y cobertura actual | Falta para completar el requisito |
| --- | ---: | --- | --- |
| Protocolos, acciones y posiciones reales mediante PAEG | 75 | [Recorrido de bóvedas](../tests/integration/chains/evm/evm-vault-flow.mjs): Uniswap15, Aave15, Meta15/19 aceptados localmente sobre protocolos originales. | Más acciones y posiciones; crédito privado Jupiter completo. |
| Composición efectivamente privada | 50 | [GRAPH del dispositivo](../packages/backend/src/accounts/authority/device-external-flat-source-graph-v1.mjs) y [estado de posiciones](../packages/backend/src/defi/positions/private-position-state-v2.mjs) conectan notas, pruebas y lecturas propias. | Privacidad de ruta/topología/correlación y GRAPH móvil completo. El swap público Jupiter no puntúa como crédito privado. |
| Autorización y custodia originales | 75 | GRAPH y [lector DeFi](../packages/backend/src/api/mobile/paired-original-defi-position-reader-v1.mjs) unen reserva, permisos, pruebas y receipts a los originales. | Uniswap móvil14 acepta notas de resultado propias del dispositivo. Faltan los demás GRAPH móviles; las posiciones Meta/Aave leídas permanecen bajo custodia Linux. |
| Conservación, respaldo y disponible correcto | 75 | [Redención Morpho](../packages/backend/src/defi/vaults/morpho-vault-redemption-accounting-v1.mjs), [redención Aave](../packages/backend/src/defi/vaults/aave-static-redemption-accounting-v1.mjs) y estado de posiciones comprueban shares/deltas; valoración no crea dinero gastable. | Generalizar activos, deuda, posiciones y liquidez adversa. |
| Recuperación de las acciones y posiciones | 75 | [Wallet de bóvedas retenida](../packages/backend/src/accounts/recovery/external-defi-retained-vault-wallet-v1.mjs): Meta/Aave reabren en otro PID sin nuevos envíos; Uniswap F10 y Meta F1 aceptados. | Caída abrupta y fallos combinados; F1 no acredita pérdida neta del solver. |

## 6. Estado privado global coherente — 80%

| Requisito | Nota | Código y cobertura actual | Falta para completar el requisito |
| --- | ---: | --- | --- |
| Identificar por activo/dominio notas, posiciones, reservas y operaciones | 75 | [Modelo de backend](../packages/backend/src/accounts/state/original-wallet-economic-state-v1.mjs) y [modelo móvil](../apps/mobile/src/state/private-wallet-state-v1.mjs) incluyen fuente, generación, activo, red, génesis, pool y dominio. | Todos los productores de las siete redes y las posiciones restantes. |
| Reunir originales y conciliar su efecto en backend/wallet/app | 75 | [Proyección web](../apps/wallet/src/client/features/portfolio/original-economic-state-v1.mjs), estado móvil y backend consumen las capacidades originales; EVM9 aceptó cinco READ y Meta/Aave dos por protocolo. La fuente ERC20 comprueba nota, nullifier y respaldo. GRAPH1159 recorrió W39 con respuesta perdida, restores software SOURCE/SHARE/PoP y READ de ambas notas gastadas confirmadas, sin efecto nuevo. | El GRAPH histórico conserva su rechazo; Uniswap móvil14 acepta captura/reapertura ordenada del backend; extensión a todas las fuentes. La unión de lecturas no crea una autorización global. |
| Conservar estado y credenciales durables y recuperables | 75 | Backend con Vault/CAS/ancla; [SOURCE cifrado](../packages/backend/src/operations/recovery/native-original-source-capsule-v1.mjs) con dos cuerpos y confirmado/candidato; copia cifrada de identidad y notas. HOST reales de AES/CAS pasan y hay reaperturas ordenadas aceptadas. | Continuidad integrada de esas fuentes durante las caídas abruptas, almacenamiento completo de cada tipo de custodia y operación Cloud real. |
| Recuperarse de reinicios conciliando la misma operación sin duplicar créditos/envíos | 75 | EVM9, ERC20 y backends Meta/Aave aceptan reinicio ordenado en otro PID y observación del mismo efecto sin nuevo pago. GRAPH1159 recorrió restauración software de custodia y READ SPENT confirmado, sin otra prueba/envío; SOURCE recorrió D26 y primera salida17, pero falló OPEN. Ambos RAW permanecen rechazados. | SOURCE con dos caídas y reapertura causal; Uniswap móvil14 acepta captura/reapertura ordenada, pero faltan los demás GRAPH y los fallos combinados. Su realm cerrado carece de autoridad capturada para reabrir. El opener necesita fuentes originales restauradas. |
| Tratar STALE/UNKNOWN/valoración correctamente, sin sumar unidades incompatibles ni inventar disponible | 100 | Validadores comunes rechazan saldos conocidos cuando falta observación; las vistas muestran No disponible, separan posición/valoración y activo/dominio. El modelo móvil fija `aggregateBalance:null` y `readOnly:true`; la proyección web impide crédito por valoración. | Conservar estas mismas reglas en cada nueva integración. Esta nota cierra las reglas del modelo compartido; no acredita los productores aún ausentes ni la restauración económica completa. |

El 100 de la última fila corresponde a esas reglas de representación, no al
objetivo completo. Los cuatro requisitos anteriores siguen limitados, de modo
que la media es 80 y el estado global no se declara terminado.
El trabajo reciente de copia/restauración, saldo original disponible/SPENT,
checkpoints completos, cuerpos cifrados grandes y reapertura de observación
forma parte de esta valoración; no se omite por faltar todavía el recorrido
financiero completo.

## 7. Modelos de redes heterogéneos — 65%

| Requisito | Nota | Código y cobertura actual | Falta para completar el requisito |
| --- | ---: | --- | --- |
| Identidad de red y runtimes propios | 50 | [Registro](../packages/backend/src/chains/shared/portfolio/portfolio-registry.mjs) y runtimes/observadores verifican identidad y génesis de EVM, Bitcoin, Solana y Tron. | Stacks y recorridos propios de Base, Arbitrum y BNB; un chainId común no acredita sus garantías. |
| Firmas, nonces y comisiones según el modelo | 75 | [Runtime Solana](../packages/backend/src/chains/solana/runtime/owned-solana-runtime.mjs) y [payout](../packages/backend/src/claims/payouts/payout-final-send.mjs). Claims9 acredita redenciones BTC/SOL, nonces y envío único. | Recursos/comisiones completos de Tron y operaciones SPL privadas restantes. |
| Recepción y observación nativa original | 75 | BTC/SOL combinado y Claims9 están aceptados en laboratorio. Los observadores no convierten una entrega o un saldo RPC en crédito privado automáticamente. | Wallet/GRAPH/crédito privado Tron y SPL USDC destino. |
| Finalidad y reorganizaciones propias de cada modelo | 75 | Runtime Solana, [observador Tron](../packages/backend/src/chains/tron/observations/tron-native-transfer-observer.mjs), Bitcoin y F reorg EVM preservan diferencias de finalidad. | Cobertura adversa de BTC/SVM/Tron y redes/operadores independientes. Confirmaciones BTC, finalized SVM y solidified Tron no son intercambiables. |
| Reintentos y conciliación comunes sin rebajar garantías | 50 | [Envío Solana](../packages/backend/src/chains/solana/transfers/owned-solana-send.mjs), payout y registry preservan transacción e identidad; observar de nuevo no concede pagar de nuevo. | Recuperación abrupta y fallos combinados de los cuatro modelos, con independencia de operadores. |

Claims9 conserva su aceptación; Claims8 su rechazo. SPL29 y Tron13 siguen
rechazados en sus ámbitos originales. Jupiter acredita swap público, no crédito
privado completo. Ninguna nota reclasifica esos resultados.

## Evidencia del trabajo reciente y límites

Se contrastaron los resultados originales EVM9 `f36e603b`, LIVE_ARMED
`b923b217`, F reorg `b4329b70`, ERC20 `da603751`, Meta19 `8c4c6bad` y
Aave `4fbd29a9`: completados en sus ámbitos locales, con restricciones
explícitas. Los ámbitos y enlaces permanecen en [STATUS](../STATUS.md).

SOURCE `9aced…` terminó rechazado después del nacimiento completo del backend
(diez secciones), con cero pruebas: su transporte manual omitía Content-Length y
enviaba chunked, rechazado por el framing estricto del servidor original.
`6951b88` corrige ese transporte y acredita el primer challenge TLS/SDK focal;
SOURCE nuevo `fcb65559-2a28-4aca-b02a-6305fe686d31` terminó rechazado con una
prueba D26 después de financiar y de la primera salida 17. Falló la apertura
avanzada del mismo SOURCE; la causa primaria había sido descartada del agregado
y no puede recuperarse de esos errores guardados. La lectura autenticada
conserva diez secciones sin candidatos CAS ni mutaciones nativas pendientes.
El cierre dirigido del launcher original mediante SIGTERM tras el worker fallido
confirmó cleanup de grupo, lock liberado y fuentes intactas; la interrupción no
acepta el RAW ni se atribuye a framing/espera de ocho horas. El realm financiado y locator
permanecen para diagnóstico, sin nueva CREATE. OPEN actual rechaza la versión:
realm original `df901c6`/cierre `a5033d37…` frente al release `5e821880…` actual.
Se requieren los bytes originales del snapshot y sus pins antes de OPEN, sin
reescribir el locator, fase o claims. Este bloqueo presente no explica ni
reconstruye la primaria anterior descartada. `9aced…` se conserva byte a byte.
El fallo inicial de cwd fue precampaña. GRAPH14
`edea8e13-4154-471e-8a1f-a7d062002478` terminó rechazado al conciliar tras
12/14 pruebas, con cleanup/lock confirmados: T estaba cumplido,
pero el backend devolvía la cabeza antigua de S y el SDK rechazaba su frescura.
No fue un rechazo esperado de replay. `c2a9e06` observa S otra vez conservando
el guard original. GRAPH `f7acea63…` terminó rechazado con 14 pruebas; superó
RECONCILE_GRAPH, W39 de shares y la prueba W39 de cambio, pero falló después
en la aserción de respuesta perdida al enviar changeW39. No alcanzó restauración
ni reapertura del backend; fuentes intactas, cero errores de cleanup y lock
liberado. `f8961f4` corrige la espera del resultado original de retirada admitida,
con lease 15 s y guards intactos; un HOST pasa en 2,765 s. GRAPH `1159c12e…`
terminó rechazado con 14 pruebas. Recorrió respuesta perdida W39, restauración
software SOURCE/SHARE/PoP y READ original de ambas notas gastadas confirmadas,
sin otra prueba ni envío financiero. Después falló un contador anterior al
replay HTTP403 esperado; `56f8212` corrige sólo ese contador, con un HOST
aprobado en 2,621 s. No alcanzó captura de cuatro secciones ni reapertura del
backend. No quedó autoridad capturada para reabrir el realm cerrado; todos los
grupos financieros y locks quedaron cerrados/liberados. No se repite financiación
por un contador y el RAW conserva su rechazo. `b13eb68` conserva causas privadas para aperturas
futuras sin payloads, con 8/8 HOST aprobados en 0,289 s; no reconstruye la
primaria ya descartada. Estas regresiones no reclasifican los recorridos ni
cambian las notas económicas.

Los informes conservados y comprobados para los subrequisitos actuales son:

- SOURCE, AES/CAS y checkpoints: tres pruebas focales aprobadas, cero fallos.
  `.internal/dev/reports/original-source-large-aead-body-and-recovery-host-12876931-65d2-4752-8b75-433d03935822/host.log`.
- Copia RootNote cifrada, restore/binding/cancelación y saldos originales:
  ocho pruebas focales aprobadas en 4,436 s, copia de identidad y tipos aprobados.
  `.internal/dev/reports/all-objectives-native-backup-causal-fixture-current-d79742ae-cd90-4c93-82ec-16f53e327739/host.log`.
- Privacidad SQL nueva: cinco HOST aprobados. Legacy y registro marcado privado
  corrupto: dos casos originales PostgreSQL aprobados en 7,25 s, incluyendo
  COMMIT perdido. La suite completa anterior conserva 20/22 y el fallo previo
  de lock de migración; este corte no la repitió.
  `.internal/dev/drafts/all-objectives-legacy-redaction-focal-v1/RESULT.json`.
- Costes, privacidad y reapertura de EXIT retenido: seis HOST focales aprobados
  en 9,95 s.
  `.internal/dev/reports/all-objectives-defi-exit-privacy-and-source-focal-90cd3e90-bc0a-422d-99b4-f59f24417107/host.log`.
- Cloud: seis pruebas de plan con proveedor simulado; sin proyecto ni despliegue.
  `.internal/dev/reports/all-objectives-cloud-privacy-mock-plan-current-991b4840-e35b-4172-b1e5-07af3124d177/host.log`.
- Retención/reapertura GRAPH con CAS: una prueba focal aprobada.
  `.internal/dev/reports/original-graph-ordered-backend-cas-host-8e24882e-a281-4e83-8dec-406b2ac9d7f8/host.log`.
- Identidad del envío retenida tras respuesta perdida (`a7b5434`): 23/23 HOST,
  0,915 s, journal y reconciliación originales sin otro envío.
  `.internal/dev/reports/all-objectives-flat-execution-regression-37a6a646-4abe-4e79-a42a-4ce2936b0164/host.log`.
- Observación original de S después de T (`c2a9e06`): un HOST SDK/Vault aprobado
  en 2,68 s; se conserva la exigencia de frescura del SDK.
  `.internal/dev/reports/all-objectives-original-graph-fresh-S-fixture-00001dc7-7a76-4d08-8b56-ea8ef22b72d7/host.log`.
- Primer challenge SOURCE por HTTPS (`6951b88`): un HOST aprobado en 2,73 s,
  UTF-8/Content-Length explícitos, origen exacto y TLS1.3.
  `.internal/dev/reports/all-objectives-source-first-access-TLS-original-fixture-a6721023-1f0c-4643-89b7-673c3089be99/host.log`.
- Resultado original de retirada admitida (`f8961f4`): un HOST aprobado en
  2,765 s; lease 15 s y revocación originales intactos, sin reutilizar el permiso.
  `.internal/dev/reports/all-objectives-graph-output-withdraw-result-wait-focal-5b0c02fa-77ac-4f8d-8e7d-ab3bbd045978/host.log`.
- Contador original del replay HTTP (`56f8212`): un HOST aprobado en 2,621 s;
  corrige el conteo antes/después del rechazo HTTP403 sin cambiar ningún wire.
  `.internal/dev/reports/all-objectives-graph-original-explicit-replay-counter-focal-124ca4b5-44e8-438f-ae76-37c4bed115b3/host.log`.
- Causas privadas de AggregateError (`b13eb68`): ocho HOST aprobados en 0,289 s;
  tipos/códigos/frames con límites, sin mensajes ni valores de comparación.
  `.internal/dev/reports/all-objectives-source-private-diagnostics-original-close-fixture-7d1992ab-4854-446e-b09f-9cd9477dd06f/host.log`.
- BSC (`67424cf`): materiales/herramientas oficiales y 17 contratos preparados.
  Su comprobación RPC nativa está rechazada; no acredita finalidad, crédito
  privado ni wallet. Este resultado conserva el requisito de stack propio.
- APK actual: `bdc836079db34161a793fcc0f383351890e3b79ddfee421c74f5148b4be2dbaf`, 42.841.007 bytes,
  85 fuentes iguales antes/después, 36 uniones con el bundle y sin Metro.
  Incluye los cambios móviles `d880d18`/`0dbdeed`; instalación física pendiente.
  `.internal/dev/reports/mobile-android-standalone-local.json`.

No se ejecutaron nuevas pruebas largas ni se esperó el cutoff real para
recalcular estas notas. La prueba del teléfono se mantiene para el final según
la decisión de Rafa.

## Efecto de las funciones entregadas sobre los criterios

| Cambio real | Criterios existentes que avanzan | Cobertura que sigue pendiente |
| --- | --- | --- |
| Backup RootNote cifrado y raíz conservada (`d880d18`) | Custodia/copia del punto 1; almacenamiento/revelación del 2; credenciales recuperables del 6. | Recuperación integrada de todas las custodias y ámbito original restante; HOST no acredita hardware. |
| Publicación de lectura original tras ejecución/W39 (`0dbdeed`) | Experiencia, recorrido y saldo del 1; conciliación y representación del 6. | Recorrido económico completo SOURCE/GRAPH y productores de las demás redes. |
| HMAC SQL, redacción legacy y guard de datos visibles (`afbd9c3`/`3ed9157`) | Almacenamiento/revelación del 2; el criterio 2.4 pasa de 0 a 25 por protección parcial del observador SQL sin clave API; continuidad de UNKNOWN del 6. | Otros grupos y retenciones históricas, authKey conocido, API, cadena/RPC/red y tiempos siguen expuestos. |
| Costes observados sin identificadores (`b8ab225`) | Costes económicos del 4; salidas DeFi del 5 y representación del 6. | No acredita solvencia, beneficio/pérdida neta ni rendimiento económico completo. |
| Reapertura del candidato original tras readback perdido (`3a0aaeb`) | Respuesta perdida del 4; salida DeFi del 5; continuidad del 6. | Caídas y recuperación económica completas SOURCE/GRAPH siguen sin aceptación. |
| Journal original tras respuesta perdida (`a7b5434`) | Entregas parciales del 4; continuidad y conciliación del 6. | No sustituye la aceptación económica de las caídas abruptas. |
| Observación fresca, respuesta perdida y restores GRAPH (`c2a9e06`/`f8961f4`/`56f8212`) | Recorrido del1, liquidación del4 y conciliación del6:14 pruebas, W39 y restores software con READ SPENT confirmados recorridos en RAW1159. | RAW completo rechazado; no captura/reapertura del backend. El contador corregido no acredita nuevo envío ni una aceptación nueva. |
| Primer permiso y caída SOURCE (`6951b88`/`b13eb68`) | Primer challenge TLS, financiación D26 y primera salida17 recorridos; causa privada futura conservada. | OPEN falló; primaria descartada y bloqueo posterior por versión son distintos. Se conserva el realm financiado sin forzar permisos/pins. |
| Materiales, herramientas y 17 contratos BSC (`67424cf`) | Implementación de redes de los puntos 1 y 7. | RPC nativo rechazado; sin finalidad, crédito privado ni wallet aceptados. |

El único umbral revisado es el criterio 2.4: de 0 a 25 por el mecanismo SQL
conectado y comprobado, con seudónimos distintos por request y HMAC de términos
y challenges bajo clave independiente. El punto 2 pasa de 40 a 45. No protege
tiempos/cadena/RPC/red, la colusión con API ni copias anteriores; su alcance
sigue parcial. Las otras 34 notas y seis porcentajes se mantienen. Las reglas
STALE/UNKNOWN/valoración del punto 6 conservan su 100, sin extenderlo al objetivo entero.

## Arquitectura y requisitos transversales

La media de un punto no elimina los requisitos de la visión:

| Requisito original | Situación que sigue abierta |
| --- | --- |
| Mantenibilidad | Estructura modular y entradas documentadas; sigue existiendo legado dependiente del runtime de compatibilidad. |
| Generalidad | Núcleo reutilizado y Paged conectado sin cota global de cuatro slots; falta aceptar su ejecución económica y ampliar la cobertura de tamaños, dependencias y proveedores. |
| Confianza minimizada | Autoridades y claves separadas en laboratorio; faltan operadores independientes y garantías distribuidas completas. |
| Privacidad sistémica | Faltan protección y comprobación de correlaciones y colusiones; el punto 2 lo refleja. |
| Revisión criptográfica externa | Pendiente; la revisión de código y las pruebas internas no la sustituyen. |
| Rendimiento | Medidas individuales, sin acreditar el objetivo completo en caliente. No se amplía trabajo de optimización durante este recálculo. |
| Móvil y Cloud | APK Android construido; uso físico al final. Cloud preparado sólo localmente, sin proyecto ni despliegue; el puente API/SQL económico aún no está conectado y readiness permanece en 503. |

Para cambiar una cifra se revisa su requisito y se registra qué cobertura
cambió. Una corrección posterior no altera un resultado histórico rechazado y
una revisión documental no representa desarrollo funcional adicional.
